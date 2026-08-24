import { createHash, randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import type { Bucket } from '@google-cloud/storage';
import { db } from '../firestore';
import { normalizeGeneratedEmoticonPose } from './renderer';
import {
    extractAnimationContainerFrames,
    extractEmoticonSpriteSheetFrames,
} from './animationContainer';
import type { EmoticonManualFrameAsset } from './schema';

const REGION = 'asia-northeast3';
const MAX_FRAME_BYTES = 5 * 1024 * 1024;
const MAX_NORMALIZED_FRAME_BYTES = 10 * 1024 * 1024;
const MAX_CONTAINER_BYTES = 20 * 1024 * 1024;
const DEFAULT_DAILY_IMPORT_FRAME_COUNT = 96;
const DEFAULT_DAILY_IMPORT_FRAME_BYTES = 256 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MANUAL_FRAME_UPLOAD_ID = /^[A-Za-z0-9_-]{16,100}$/;
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/;

const uploadRequestSchema = z.object({
    uploadRequestId: z.string().regex(MANUAL_FRAME_UPLOAD_ID),
    projectId: z.string().regex(DOCUMENT_ID),
    projectItemId: z.string().regex(DOCUMENT_ID),
    fileName: z.string().trim().min(1).max(180),
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    base64: z.string().min(1),
});

const containerUploadRequestSchema = z.object({
    uploadRequestId: z.string().regex(MANUAL_FRAME_UPLOAD_ID),
    projectId: z.string().regex(DOCUMENT_ID),
    projectItemId: z.string().regex(DOCUMENT_ID),
    fileName: z.string().trim().min(1).max(180),
    contentType: z.enum(['image/gif', 'image/webp', 'image/png']),
    base64: z.string().min(1),
});

const copyCompletedStaticFrameRequestSchema = z.object({
    uploadRequestId: z.string().regex(MANUAL_FRAME_UPLOAD_ID),
    projectId: z.string().regex(DOCUMENT_ID),
    projectItemId: z.string().regex(DOCUMENT_ID),
    sourceJobId: z.string().regex(DOCUMENT_ID),
});

export type ManualFrameAsset = {
    uploadRequestId: string;
    sourceImageUrl: string;
    sourceStoragePath: string;
    fileName: string;
    contentType: 'image/png';
    sizeBytes: number;
    sha256: string;
};

function positiveInteger(raw: string | undefined, fallback: number): number {
    const normalized = raw?.trim() || '';
    if (!/^[1-9]\d*$/.test(normalized)) return fallback;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function utcDayKey(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

function safeOriginalName(value: string): string {
    return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'frame.png';
}

function sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

function detectContentType(buffer: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
    if (
        buffer.byteLength >= 8
        && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) return 'image/png';
    if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    if (
        buffer.byteLength >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) return 'image/webp';
    return null;
}

function detectContainerContentType(buffer: Buffer): 'image/png' | 'image/gif' | 'image/webp' | null {
    const stillType = detectContentType(buffer);
    if (stillType === 'image/png' || stillType === 'image/webp') return stillType;
    if (
        buffer.byteLength >= 6
        && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
    ) return 'image/gif';
    return null;
}

async function requireStudioAdmin(uid: string, token: Record<string, unknown>): Promise<void> {
    const allowList = (process.env.ADMIN_UIDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (token.admin === true || token.role === 'admin' || allowList.includes(uid)) return;

    const [adminDoc, accessDoc] = await Promise.all([
        db.collection('admins').doc(uid).get(),
        db.collection('userAccess').doc(uid).get(),
    ]);
    if (adminDoc.exists || (accessDoc.exists && accessDoc.data()?.role === 'admin')) return;
    throw new HttpsError('permission-denied', '관리자만 수동 이모티콘 프레임을 업로드할 수 있습니다.');
}

async function assertWritableProjectItem(uid: string, projectId: string, projectItemId: string): Promise<void> {
    const projectRef = db.doc(`users/${uid}/emoticonProjects/${projectId}`);
    const itemRef = projectRef.collection('items').doc(projectItemId);
    const [projectSnapshot, itemSnapshot] = await Promise.all([projectRef.get(), itemRef.get()]);
    if (!projectSnapshot.exists || projectSnapshot.data()?.userId !== uid) {
        throw new HttpsError('not-found', '선택한 이모티콘 프로젝트를 찾을 수 없습니다.');
    }
    if (projectSnapshot.data()?.deletionLocked === true) {
        throw new HttpsError('failed-precondition', '삭제 중인 프로젝트에는 프레임을 업로드할 수 없습니다.');
    }
    if (!itemSnapshot.exists) {
        throw new HttpsError('not-found', '선택한 이모티콘 항목을 찾을 수 없습니다.');
    }
    const generationStatus = String(itemSnapshot.data()?.generationStatus || '');
    if (generationStatus === 'queued' || generationStatus === 'generating') {
        throw new HttpsError('failed-precondition', '이 항목은 다른 작업에서 사용 중입니다. 완료 또는 취소 후 다시 시도해 주세요.');
    }
}

async function reserveUploadQuota(params: {
    uid: string;
    uploadRequestId: string;
    byteLength: number;
}): Promise<void> {
    const day = utcDayKey();
    const ref = db.collection('emoticonStudioUploadLimits').doc(`manual_${params.uid}_${day}`);
    const countLimit = positiveInteger(
        process.env.EMOTICON_STUDIO_IMPORT_FRAME_DAILY_LIMIT,
        DEFAULT_DAILY_IMPORT_FRAME_COUNT,
    );
    const byteLimit = positiveInteger(
        process.env.EMOTICON_STUDIO_IMPORT_FRAME_DAILY_BYTES,
        DEFAULT_DAILY_IMPORT_FRAME_BYTES,
    );
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data() || {};
        const requestIds = Array.isArray(data.requestIds)
            ? data.requestIds.filter((value): value is string => typeof value === 'string').slice(-countLimit)
            : [];
        if (requestIds.includes(params.uploadRequestId)) return;
        const count = typeof data.count === 'number' ? data.count : 0;
        const bytes = typeof data.bytes === 'number' ? data.bytes : 0;
        if (count + 1 > countLimit || bytes + params.byteLength > byteLimit) {
            throw new HttpsError(
                'resource-exhausted',
                '오늘의 수동 프레임 업로드 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
            );
        }
        transaction.set(ref, {
            uid: params.uid,
            day,
            count: count + 1,
            bytes: bytes + params.byteLength,
            requestIds: [...requestIds, params.uploadRequestId],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 35 * 24 * 60 * 60 * 1000),
        });
    });
}

function downloadUrl(bucketName: string, storagePath: string, token: string): string {
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}`
        + `/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

async function existingManualFrameAsset(params: {
    uid: string;
    projectId: string;
    projectItemId: string;
    uploadRequestId: string;
    storagePath: string;
    normalizedSha256: string;
    bucket: Bucket;
}): Promise<ManualFrameAsset | null> {
    const file = params.bucket.file(params.storagePath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    const custom = metadata.metadata || {};
    if (
        custom.uploadedBy !== params.uid
        || custom.purpose !== 'manual-emoticon-frame'
        || custom.uploadRequestId !== params.uploadRequestId
        || custom.projectId !== params.projectId
        || custom.projectItemId !== params.projectItemId
        || custom.sha256 !== params.normalizedSha256
    ) {
        throw new HttpsError('already-exists', '같은 업로드 요청 번호가 다른 프레임에 이미 사용되었습니다.');
    }
    const token = String(custom.firebaseStorageDownloadTokens || '');
    if (!token) throw new HttpsError('internal', '저장된 프레임의 다운로드 정보를 확인할 수 없습니다.');
    return {
        uploadRequestId: params.uploadRequestId,
        sourceImageUrl: downloadUrl(params.bucket.name, params.storagePath, token),
        sourceStoragePath: params.storagePath,
        fileName: String(custom.originalName || 'frame.png'),
        contentType: 'image/png',
        sizeBytes: Number(metadata.size || 0),
        sha256: params.normalizedSha256,
    };
}

async function persistNormalizedManualFrame(params: {
    uid: string;
    projectId: string;
    projectItemId: string;
    uploadRequestId: string;
    originalName: string;
    normalized: Buffer;
    quotaBytes: number;
    sourceJobId?: string;
}): Promise<ManualFrameAsset> {
    if (!params.normalized.byteLength || params.normalized.byteLength > MAX_NORMALIZED_FRAME_BYTES) {
        throw new HttpsError('invalid-argument', '정규화한 프레임이 허용 용량을 초과했습니다.');
    }
    const normalizedSha256 = sha256(params.normalized);
    const storagePath = `users/${params.uid}/emoticon-studio/sources/manual-${params.uploadRequestId}.png`;
    const bucket = admin.storage().bucket();
    const existing = await existingManualFrameAsset({
        uid: params.uid,
        projectId: params.projectId,
        projectItemId: params.projectItemId,
        uploadRequestId: params.uploadRequestId,
        storagePath,
        normalizedSha256,
        bucket,
    });
    if (existing) return existing;

    await reserveUploadQuota({
        uid: params.uid,
        uploadRequestId: params.uploadRequestId,
        byteLength: params.quotaBytes,
    });
    const token = randomUUID();
    const originalName = safeOriginalName(params.originalName);
    try {
        await bucket.file(storagePath).save(params.normalized, {
            resumable: false,
            validation: 'crc32c',
            contentType: 'image/png',
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: {
                cacheControl: 'private, max-age=3600',
                metadata: {
                    firebaseStorageDownloadTokens: token,
                    originalName,
                    uploadedBy: params.uid,
                    purpose: 'manual-emoticon-frame',
                    uploadRequestId: params.uploadRequestId,
                    projectId: params.projectId,
                    projectItemId: params.projectItemId,
                    sha256: normalizedSha256,
                    ...(params.sourceJobId ? { copiedFromStaticJobId: params.sourceJobId } : {}),
                },
            },
        });
    } catch (error) {
        const raced = await existingManualFrameAsset({
            uid: params.uid,
            projectId: params.projectId,
            projectItemId: params.projectItemId,
            uploadRequestId: params.uploadRequestId,
            storagePath,
            normalizedSha256,
            bucket,
        }).catch(() => null);
        if (raced) return raced;
        throw error;
    }
    return {
        uploadRequestId: params.uploadRequestId,
        sourceImageUrl: downloadUrl(bucket.name, storagePath, token),
        sourceStoragePath: storagePath,
        fileName: originalName,
        contentType: 'image/png',
        sizeBytes: params.normalized.byteLength,
        sha256: normalizedSha256,
    };
}

export const uploadEmoticonImportFrame = onCall(
    {
        region: REGION,
        timeoutSeconds: 90,
        memory: '1GiB',
        maxInstances: 10,
    },
    async (request): Promise<ManualFrameAsset> => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
        await requireStudioAdmin(uid, (request.auth?.token || {}) as Record<string, unknown>);
        const parsed = uploadRequestSchema.safeParse(request.data || {});
        if (!parsed.success) {
            throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message || '업로드 요청이 올바르지 않습니다.');
        }
        const input = parsed.data;
        if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
            throw new HttpsError('invalid-argument', 'PNG, JPG, WebP 이미지만 업로드할 수 있습니다.');
        }
        if (
            input.base64.length > Math.ceil(MAX_FRAME_BYTES * 4 / 3) + 16
            || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)
        ) {
            throw new HttpsError('invalid-argument', '프레임 이미지는 장당 5MB 이하여야 합니다.');
        }
        const source = Buffer.from(input.base64, 'base64');
        if (!source.byteLength || source.byteLength > MAX_FRAME_BYTES) {
            throw new HttpsError('invalid-argument', '프레임 이미지는 장당 5MB 이하여야 합니다.');
        }
        const detectedContentType = detectContentType(source);
        if (!detectedContentType || detectedContentType !== input.contentType) {
            throw new HttpsError('invalid-argument', '파일 내용과 이미지 형식이 일치하지 않습니다.');
        }
        await assertWritableProjectItem(uid, input.projectId, input.projectItemId);

        let normalized: Buffer;
        try {
            normalized = await normalizeGeneratedEmoticonPose(source);
        } catch (error) {
            logger.warn('[Emoticon Studio] Rejected an invalid manual frame.', {
                uid,
                uploadRequestId: input.uploadRequestId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new HttpsError('invalid-argument', '손상되었거나 지원하지 않는 프레임 이미지입니다.');
        }
        return persistNormalizedManualFrame({
            uid,
            projectId: input.projectId,
            projectItemId: input.projectItemId,
            uploadRequestId: input.uploadRequestId,
            originalName: input.fileName,
            normalized,
            quotaBytes: source.byteLength,
        });
    },
);

export const extractEmoticonImportContainer = onCall(
    {
        region: REGION,
        timeoutSeconds: 180,
        memory: '2GiB',
        maxInstances: 5,
    },
    async (request): Promise<ManualFrameAsset[]> => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
        await requireStudioAdmin(uid, (request.auth?.token || {}) as Record<string, unknown>);
        const parsed = containerUploadRequestSchema.safeParse(request.data || {});
        if (!parsed.success) {
            throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message || '움짤 가져오기 요청이 올바르지 않습니다.');
        }
        const input = parsed.data;
        if (
            input.base64.length > Math.ceil(MAX_CONTAINER_BYTES * 4 / 3) + 16
            || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)
        ) {
            throw new HttpsError('invalid-argument', '움짤 파일은 20MB 이하여야 합니다.');
        }
        const source = Buffer.from(input.base64, 'base64');
        if (!source.byteLength || source.byteLength > MAX_CONTAINER_BYTES) {
            throw new HttpsError('invalid-argument', '움짤 파일은 20MB 이하여야 합니다.');
        }
        if (detectContainerContentType(source) !== input.contentType) {
            throw new HttpsError('invalid-argument', '파일 내용과 GIF, WebP 또는 APNG 형식이 일치하지 않습니다.');
        }
        await assertWritableProjectItem(uid, input.projectId, input.projectItemId);

        let extractedFrames: Buffer[];
        let extractedFromSpriteSheet = false;
        try {
            extractedFrames = await extractAnimationContainerFrames(source);
        } catch {
            if (input.contentType !== 'image/png') {
                throw new HttpsError('invalid-argument', '움짤은 2~24프레임, 프레임당 최대 4096×4096인 GIF, WebP 또는 APNG여야 합니다.');
            }
            try {
                const spriteSheet = await extractEmoticonSpriteSheetFrames(source);
                extractedFrames = spriteSheet.frames;
                extractedFromSpriteSheet = true;
                logger.info('[Emoticon Studio] Split a manual sprite-sheet PNG.', {
                    uid,
                    uploadRequestId: input.uploadRequestId,
                    columns: spriteSheet.layout.columns,
                    rows: spriteSheet.layout.rows,
                    frameCount: spriteSheet.layout.frameCount,
                    background: spriteSheet.evidence.background,
                });
            } catch {
                throw new HttpsError(
                    'invalid-argument',
                    'PNG는 2~24프레임 APNG이거나, 단색·투명 배경에 포즈가 규칙적으로 배치된 2~24칸 스프라이트 시트여야 합니다.',
                );
            }
        }

        const frameCount = extractedFrames.length;
        const quotaBytesPerFrame = Math.max(1, Math.ceil(source.byteLength / frameCount));
        const originalName = safeOriginalName(input.fileName).replace(/\.[^.]+$/, '');
        const assets: ManualFrameAsset[] = [];
        for (let index = 0; index < frameCount; index += 1) {
            let normalized: Buffer;
            try {
                // Sprite extraction already removes only the border-connected matte.
                // Re-running the single-pose normalizer could erase wide limbs/effects.
                normalized = extractedFromSpriteSheet
                    ? extractedFrames[index]
                    : await normalizeGeneratedEmoticonPose(extractedFrames[index]);
            } catch (error) {
                logger.warn('[Emoticon Studio] Failed to prepare an imported animation frame.', {
                    uid,
                    uploadRequestId: input.uploadRequestId,
                    frameIndex: index,
                    extractedFromSpriteSheet,
                    error: error instanceof Error ? error.message : String(error),
                });
                throw new HttpsError('invalid-argument', `${index + 1}번째 프레임을 안전한 PNG로 변환하지 못했습니다.`);
            }
            assets.push(await persistNormalizedManualFrame({
                uid,
                projectId: input.projectId,
                projectItemId: input.projectItemId,
                uploadRequestId: `${input.uploadRequestId}_${String(index + 1).padStart(2, '0')}`,
                originalName: `${originalName}-frame-${String(index + 1).padStart(2, '0')}.png`,
                normalized,
                quotaBytes: quotaBytesPerFrame,
            }));
        }
        return assets;
    },
);

export const copyCompletedStaticEmoticonFrame = onCall(
    {
        region: REGION,
        timeoutSeconds: 90,
        memory: '1GiB',
        maxInstances: 10,
    },
    async (request): Promise<ManualFrameAsset> => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
        await requireStudioAdmin(uid, (request.auth?.token || {}) as Record<string, unknown>);
        const parsed = copyCompletedStaticFrameRequestSchema.safeParse(request.data || {});
        if (!parsed.success) {
            throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message || '정지 컷 복사 요청이 올바르지 않습니다.');
        }
        const input = parsed.data;
        await assertWritableProjectItem(uid, input.projectId, input.projectItemId);

        const sourceJobSnapshot = await db.doc(`users/${uid}/emoticonJobs/${input.sourceJobId}`).get();
        const sourceJob = sourceJobSnapshot.data() || {};
        const specReport = sourceJob.specReport && typeof sourceJob.specReport === 'object'
            ? sourceJob.specReport as Record<string, unknown>
            : {};
        const outputProfile = sourceJob.outputProfile && typeof sourceJob.outputProfile === 'object'
            ? sourceJob.outputProfile as Record<string, unknown>
            : {};
        const plan = sourceJob.plan && typeof sourceJob.plan === 'object'
            ? sourceJob.plan as Record<string, unknown>
            : {};
        const action = plan.action && typeof plan.action === 'object'
            ? plan.action as Record<string, unknown>
            : {};
        if (
            !sourceJobSnapshot.exists
            || sourceJob.userId !== uid
            || sourceJob.status !== 'completed'
            || outputProfile.type !== 'static'
            || action.frameCount !== 1
            || specReport.frameCount !== 1
            || specReport.technicalPass !== true
            || specReport.allOutputsPass !== true
        ) {
            throw new HttpsError('failed-precondition', '기술 검사를 통과한 완성 정지 이모티콘만 프레임으로 가져올 수 있습니다.');
        }
        const sourceStoragePath = typeof sourceJob.keyPoseStoragePath === 'string'
            ? sourceJob.keyPoseStoragePath
            : '';
        const expectedPrefix = `users/${uid}/emoticon-studio/jobs/${input.sourceJobId}/`;
        if (!sourceStoragePath.startsWith(expectedPrefix)) {
            throw new HttpsError('failed-precondition', '정지 이모티콘의 검증된 원본 프레임을 찾을 수 없습니다.');
        }

        const sourceFile = admin.storage().bucket().file(sourceStoragePath);
        const { metadata, source } = await Promise.all([
                sourceFile.getMetadata(),
                sourceFile.download(),
            ])
            .then(([[metadata], [source]]) => ({ metadata, source }))
            .catch(() => {
                throw new HttpsError('failed-precondition', '정지 이모티콘의 원본 프레임 파일을 찾을 수 없습니다.');
            });
        const storedSize = Number(metadata.size || 0);
        if (
            metadata.contentType !== 'image/png'
            || !storedSize
            || storedSize > MAX_NORMALIZED_FRAME_BYTES
            || source.byteLength !== storedSize
            || detectContentType(source) !== 'image/png'
        ) {
            throw new HttpsError('failed-precondition', '정지 이모티콘 원본 프레임의 파일 무결성을 확인하지 못했습니다.');
        }
        let normalized: Buffer;
        try {
            normalized = await normalizeGeneratedEmoticonPose(source);
        } catch {
            throw new HttpsError('failed-precondition', '정지 이모티콘 원본 프레임을 조립 규격으로 변환하지 못했습니다.');
        }
        return persistNormalizedManualFrame({
            uid,
            projectId: input.projectId,
            projectItemId: input.projectItemId,
            uploadRequestId: input.uploadRequestId,
            originalName: `static-${input.sourceJobId}.png`,
            normalized,
            quotaBytes: source.byteLength,
            sourceJobId: input.sourceJobId,
        });
    },
);

export async function downloadVerifiedEmoticonImportFrames(params: {
    uid: string;
    projectId: string;
    projectItemId: string;
    frames: EmoticonManualFrameAsset[];
}): Promise<Buffer[]> {
    if (!params.frames.length || params.frames.length > 24) {
        throw new Error('A manual frame import requires between 1 and 24 source images.');
    }
    const bucket = admin.storage().bucket();
    const seenPaths = new Set<string>();
    const seenUploadIds = new Set<string>();
    return Promise.all(params.frames.map(async (frame) => {
        const expectedPath = `users/${params.uid}/emoticon-studio/sources/manual-${frame.uploadRequestId}.png`;
        if (
            frame.sourceStoragePath !== expectedPath
            || seenPaths.has(frame.sourceStoragePath)
            || seenUploadIds.has(frame.uploadRequestId)
        ) {
            throw new Error('A manual frame path is duplicated or does not belong to this user.');
        }
        seenPaths.add(frame.sourceStoragePath);
        seenUploadIds.add(frame.uploadRequestId);
        const file = bucket.file(frame.sourceStoragePath);
        const [metadata] = await file.getMetadata();
        const custom = metadata.metadata || {};
        const storedSize = Number(metadata.size || 0);
        if (
            custom.uploadedBy !== params.uid
            || custom.purpose !== 'manual-emoticon-frame'
            || custom.uploadRequestId !== frame.uploadRequestId
            || custom.projectId !== params.projectId
            || custom.projectItemId !== params.projectItemId
            || custom.sha256 !== frame.sha256
            || metadata.contentType !== 'image/png'
            || !storedSize
            || storedSize > MAX_NORMALIZED_FRAME_BYTES
        ) {
            throw new Error('A manual frame failed its server ownership or metadata check.');
        }
        const [stored] = await file.download();
        if (
            stored.byteLength !== storedSize
            || sha256(stored) !== frame.sha256
            || detectContentType(stored) !== 'image/png'
        ) {
            throw new Error('A manual frame failed its server file-integrity check.');
        }
        return normalizeGeneratedEmoticonPose(stored);
    }));
}
