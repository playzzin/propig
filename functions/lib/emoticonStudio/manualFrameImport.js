"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyCompletedStaticEmoticonFrame = exports.extractEmoticonImportContainer = exports.uploadEmoticonImportFrame = void 0;
exports.downloadVerifiedEmoticonImportFrames = downloadVerifiedEmoticonImportFrames;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const zod_1 = require("zod");
const firestore_1 = require("../firestore");
const renderer_1 = require("./renderer");
const animationContainer_1 = require("./animationContainer");
const REGION = 'asia-northeast3';
const MAX_FRAME_BYTES = 5 * 1024 * 1024;
const MAX_NORMALIZED_FRAME_BYTES = 10 * 1024 * 1024;
const MAX_CONTAINER_BYTES = 20 * 1024 * 1024;
const DEFAULT_DAILY_IMPORT_FRAME_COUNT = 96;
const DEFAULT_DAILY_IMPORT_FRAME_BYTES = 256 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MANUAL_FRAME_UPLOAD_ID = /^[A-Za-z0-9_-]{16,100}$/;
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/;
const uploadRequestSchema = zod_1.z.object({
    uploadRequestId: zod_1.z.string().regex(MANUAL_FRAME_UPLOAD_ID),
    projectId: zod_1.z.string().regex(DOCUMENT_ID),
    projectItemId: zod_1.z.string().regex(DOCUMENT_ID),
    fileName: zod_1.z.string().trim().min(1).max(180),
    contentType: zod_1.z.enum(['image/png', 'image/jpeg', 'image/webp']),
    base64: zod_1.z.string().min(1),
});
const containerUploadRequestSchema = zod_1.z.object({
    uploadRequestId: zod_1.z.string().regex(MANUAL_FRAME_UPLOAD_ID),
    projectId: zod_1.z.string().regex(DOCUMENT_ID),
    projectItemId: zod_1.z.string().regex(DOCUMENT_ID),
    fileName: zod_1.z.string().trim().min(1).max(180),
    contentType: zod_1.z.enum(['image/gif', 'image/webp', 'image/png']),
    base64: zod_1.z.string().min(1),
});
const copyCompletedStaticFrameRequestSchema = zod_1.z.object({
    uploadRequestId: zod_1.z.string().regex(MANUAL_FRAME_UPLOAD_ID),
    projectId: zod_1.z.string().regex(DOCUMENT_ID),
    projectItemId: zod_1.z.string().regex(DOCUMENT_ID),
    sourceJobId: zod_1.z.string().regex(DOCUMENT_ID),
});
function positiveInteger(raw, fallback) {
    const normalized = (raw === null || raw === void 0 ? void 0 : raw.trim()) || '';
    if (!/^[1-9]\d*$/.test(normalized))
        return fallback;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
}
function utcDayKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
}
function safeOriginalName(value) {
    return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'frame.png';
}
function sha256(buffer) {
    return (0, node_crypto_1.createHash)('sha256').update(buffer).digest('hex');
}
function detectContentType(buffer) {
    if (buffer.byteLength >= 8
        && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return 'image/png';
    if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    if (buffer.byteLength >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP')
        return 'image/webp';
    return null;
}
function detectContainerContentType(buffer) {
    const stillType = detectContentType(buffer);
    if (stillType === 'image/png' || stillType === 'image/webp')
        return stillType;
    if (buffer.byteLength >= 6
        && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a'))
        return 'image/gif';
    return null;
}
async function requireStudioAdmin(uid, token) {
    var _a;
    const allowList = (process.env.ADMIN_UIDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (token.admin === true || token.role === 'admin' || allowList.includes(uid))
        return;
    const [adminDoc, accessDoc] = await Promise.all([
        firestore_1.db.collection('admins').doc(uid).get(),
        firestore_1.db.collection('userAccess').doc(uid).get(),
    ]);
    if (adminDoc.exists || (accessDoc.exists && ((_a = accessDoc.data()) === null || _a === void 0 ? void 0 : _a.role) === 'admin'))
        return;
    throw new https_1.HttpsError('permission-denied', '관리자만 수동 이모티콘 프레임을 업로드할 수 있습니다.');
}
async function assertWritableProjectItem(uid, projectId, projectItemId) {
    var _a, _b, _c;
    const projectRef = firestore_1.db.doc(`users/${uid}/emoticonProjects/${projectId}`);
    const itemRef = projectRef.collection('items').doc(projectItemId);
    const [projectSnapshot, itemSnapshot] = await Promise.all([projectRef.get(), itemRef.get()]);
    if (!projectSnapshot.exists || ((_a = projectSnapshot.data()) === null || _a === void 0 ? void 0 : _a.userId) !== uid) {
        throw new https_1.HttpsError('not-found', '선택한 이모티콘 프로젝트를 찾을 수 없습니다.');
    }
    if (((_b = projectSnapshot.data()) === null || _b === void 0 ? void 0 : _b.deletionLocked) === true) {
        throw new https_1.HttpsError('failed-precondition', '삭제 중인 프로젝트에는 프레임을 업로드할 수 없습니다.');
    }
    if (!itemSnapshot.exists) {
        throw new https_1.HttpsError('not-found', '선택한 이모티콘 항목을 찾을 수 없습니다.');
    }
    const generationStatus = String(((_c = itemSnapshot.data()) === null || _c === void 0 ? void 0 : _c.generationStatus) || '');
    if (generationStatus === 'queued' || generationStatus === 'generating') {
        throw new https_1.HttpsError('failed-precondition', '이 항목은 다른 작업에서 사용 중입니다. 완료 또는 취소 후 다시 시도해 주세요.');
    }
}
async function reserveUploadQuota(params) {
    const day = utcDayKey();
    const ref = firestore_1.db.collection('emoticonStudioUploadLimits').doc(`manual_${params.uid}_${day}`);
    const countLimit = positiveInteger(process.env.EMOTICON_STUDIO_IMPORT_FRAME_DAILY_LIMIT, DEFAULT_DAILY_IMPORT_FRAME_COUNT);
    const byteLimit = positiveInteger(process.env.EMOTICON_STUDIO_IMPORT_FRAME_DAILY_BYTES, DEFAULT_DAILY_IMPORT_FRAME_BYTES);
    await firestore_1.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data() || {};
        const requestIds = Array.isArray(data.requestIds)
            ? data.requestIds.filter((value) => typeof value === 'string').slice(-countLimit)
            : [];
        if (requestIds.includes(params.uploadRequestId))
            return;
        const count = typeof data.count === 'number' ? data.count : 0;
        const bytes = typeof data.bytes === 'number' ? data.bytes : 0;
        if (count + 1 > countLimit || bytes + params.byteLength > byteLimit) {
            throw new https_1.HttpsError('resource-exhausted', '오늘의 수동 프레임 업로드 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
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
function downloadUrl(bucketName, storagePath, token) {
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}`
        + `/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}
async function existingManualFrameAsset(params) {
    const file = params.bucket.file(params.storagePath);
    const [exists] = await file.exists();
    if (!exists)
        return null;
    const [metadata] = await file.getMetadata();
    const custom = metadata.metadata || {};
    if (custom.uploadedBy !== params.uid
        || custom.purpose !== 'manual-emoticon-frame'
        || custom.uploadRequestId !== params.uploadRequestId
        || custom.projectId !== params.projectId
        || custom.projectItemId !== params.projectItemId
        || custom.sha256 !== params.normalizedSha256) {
        throw new https_1.HttpsError('already-exists', '같은 업로드 요청 번호가 다른 프레임에 이미 사용되었습니다.');
    }
    const token = String(custom.firebaseStorageDownloadTokens || '');
    if (!token)
        throw new https_1.HttpsError('internal', '저장된 프레임의 다운로드 정보를 확인할 수 없습니다.');
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
async function persistNormalizedManualFrame(params) {
    if (!params.normalized.byteLength || params.normalized.byteLength > MAX_NORMALIZED_FRAME_BYTES) {
        throw new https_1.HttpsError('invalid-argument', '정규화한 프레임이 허용 용량을 초과했습니다.');
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
    if (existing)
        return existing;
    await reserveUploadQuota({
        uid: params.uid,
        uploadRequestId: params.uploadRequestId,
        byteLength: params.quotaBytes,
    });
    const token = (0, node_crypto_1.randomUUID)();
    const originalName = safeOriginalName(params.originalName);
    try {
        await bucket.file(storagePath).save(params.normalized, {
            resumable: false,
            validation: 'crc32c',
            contentType: 'image/png',
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: {
                cacheControl: 'private, max-age=3600',
                metadata: Object.assign({ firebaseStorageDownloadTokens: token, originalName, uploadedBy: params.uid, purpose: 'manual-emoticon-frame', uploadRequestId: params.uploadRequestId, projectId: params.projectId, projectItemId: params.projectItemId, sha256: normalizedSha256 }, (params.sourceJobId ? { copiedFromStaticJobId: params.sourceJobId } : {})),
            },
        });
    }
    catch (error) {
        const raced = await existingManualFrameAsset({
            uid: params.uid,
            projectId: params.projectId,
            projectItemId: params.projectItemId,
            uploadRequestId: params.uploadRequestId,
            storagePath,
            normalizedSha256,
            bucket,
        }).catch(() => null);
        if (raced)
            return raced;
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
exports.uploadEmoticonImportFrame = (0, https_1.onCall)({
    region: REGION,
    timeoutSeconds: 90,
    memory: '1GiB',
    maxInstances: 10,
}, async (request) => {
    var _a, _b, _c;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    await requireStudioAdmin(uid, (((_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) || {}));
    const parsed = uploadRequestSchema.safeParse(request.data || {});
    if (!parsed.success) {
        throw new https_1.HttpsError('invalid-argument', ((_c = parsed.error.issues[0]) === null || _c === void 0 ? void 0 : _c.message) || '업로드 요청이 올바르지 않습니다.');
    }
    const input = parsed.data;
    if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
        throw new https_1.HttpsError('invalid-argument', 'PNG, JPG, WebP 이미지만 업로드할 수 있습니다.');
    }
    if (input.base64.length > Math.ceil(MAX_FRAME_BYTES * 4 / 3) + 16
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) {
        throw new https_1.HttpsError('invalid-argument', '프레임 이미지는 장당 5MB 이하여야 합니다.');
    }
    const source = Buffer.from(input.base64, 'base64');
    if (!source.byteLength || source.byteLength > MAX_FRAME_BYTES) {
        throw new https_1.HttpsError('invalid-argument', '프레임 이미지는 장당 5MB 이하여야 합니다.');
    }
    const detectedContentType = detectContentType(source);
    if (!detectedContentType || detectedContentType !== input.contentType) {
        throw new https_1.HttpsError('invalid-argument', '파일 내용과 이미지 형식이 일치하지 않습니다.');
    }
    await assertWritableProjectItem(uid, input.projectId, input.projectItemId);
    let normalized;
    try {
        normalized = await (0, renderer_1.normalizeGeneratedEmoticonPose)(source);
    }
    catch (error) {
        logger.warn('[Emoticon Studio] Rejected an invalid manual frame.', {
            uid,
            uploadRequestId: input.uploadRequestId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw new https_1.HttpsError('invalid-argument', '손상되었거나 지원하지 않는 프레임 이미지입니다.');
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
});
exports.extractEmoticonImportContainer = (0, https_1.onCall)({
    region: REGION,
    timeoutSeconds: 180,
    memory: '2GiB',
    maxInstances: 5,
}, async (request) => {
    var _a, _b, _c;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    await requireStudioAdmin(uid, (((_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) || {}));
    const parsed = containerUploadRequestSchema.safeParse(request.data || {});
    if (!parsed.success) {
        throw new https_1.HttpsError('invalid-argument', ((_c = parsed.error.issues[0]) === null || _c === void 0 ? void 0 : _c.message) || '움짤 가져오기 요청이 올바르지 않습니다.');
    }
    const input = parsed.data;
    if (input.base64.length > Math.ceil(MAX_CONTAINER_BYTES * 4 / 3) + 16
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) {
        throw new https_1.HttpsError('invalid-argument', '움짤 파일은 20MB 이하여야 합니다.');
    }
    const source = Buffer.from(input.base64, 'base64');
    if (!source.byteLength || source.byteLength > MAX_CONTAINER_BYTES) {
        throw new https_1.HttpsError('invalid-argument', '움짤 파일은 20MB 이하여야 합니다.');
    }
    if (detectContainerContentType(source) !== input.contentType) {
        throw new https_1.HttpsError('invalid-argument', '파일 내용과 GIF, WebP 또는 APNG 형식이 일치하지 않습니다.');
    }
    await assertWritableProjectItem(uid, input.projectId, input.projectItemId);
    let extractedFrames;
    let extractedFromSpriteSheet = false;
    try {
        extractedFrames = await (0, animationContainer_1.extractAnimationContainerFrames)(source);
    }
    catch (_d) {
        if (input.contentType !== 'image/png') {
            throw new https_1.HttpsError('invalid-argument', '움짤은 2~24프레임, 프레임당 최대 4096×4096인 GIF, WebP 또는 APNG여야 합니다.');
        }
        try {
            const spriteSheet = await (0, animationContainer_1.extractEmoticonSpriteSheetFrames)(source);
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
        }
        catch (_e) {
            throw new https_1.HttpsError('invalid-argument', 'PNG는 2~24프레임 APNG이거나, 단색·투명 배경에 포즈가 규칙적으로 배치된 2~24칸 스프라이트 시트여야 합니다.');
        }
    }
    const frameCount = extractedFrames.length;
    const quotaBytesPerFrame = Math.max(1, Math.ceil(source.byteLength / frameCount));
    const originalName = safeOriginalName(input.fileName).replace(/\.[^.]+$/, '');
    const assets = [];
    for (let index = 0; index < frameCount; index += 1) {
        let normalized;
        try {
            // Sprite extraction already removes only the border-connected matte.
            // Re-running the single-pose normalizer could erase wide limbs/effects.
            normalized = extractedFromSpriteSheet
                ? extractedFrames[index]
                : await (0, renderer_1.normalizeGeneratedEmoticonPose)(extractedFrames[index]);
        }
        catch (error) {
            logger.warn('[Emoticon Studio] Failed to prepare an imported animation frame.', {
                uid,
                uploadRequestId: input.uploadRequestId,
                frameIndex: index,
                extractedFromSpriteSheet,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new https_1.HttpsError('invalid-argument', `${index + 1}번째 프레임을 안전한 PNG로 변환하지 못했습니다.`);
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
});
exports.copyCompletedStaticEmoticonFrame = (0, https_1.onCall)({
    region: REGION,
    timeoutSeconds: 90,
    memory: '1GiB',
    maxInstances: 10,
}, async (request) => {
    var _a, _b, _c;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    await requireStudioAdmin(uid, (((_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) || {}));
    const parsed = copyCompletedStaticFrameRequestSchema.safeParse(request.data || {});
    if (!parsed.success) {
        throw new https_1.HttpsError('invalid-argument', ((_c = parsed.error.issues[0]) === null || _c === void 0 ? void 0 : _c.message) || '정지 컷 복사 요청이 올바르지 않습니다.');
    }
    const input = parsed.data;
    await assertWritableProjectItem(uid, input.projectId, input.projectItemId);
    const sourceJobSnapshot = await firestore_1.db.doc(`users/${uid}/emoticonJobs/${input.sourceJobId}`).get();
    const sourceJob = sourceJobSnapshot.data() || {};
    const specReport = sourceJob.specReport && typeof sourceJob.specReport === 'object'
        ? sourceJob.specReport
        : {};
    const outputProfile = sourceJob.outputProfile && typeof sourceJob.outputProfile === 'object'
        ? sourceJob.outputProfile
        : {};
    const plan = sourceJob.plan && typeof sourceJob.plan === 'object'
        ? sourceJob.plan
        : {};
    const action = plan.action && typeof plan.action === 'object'
        ? plan.action
        : {};
    if (!sourceJobSnapshot.exists
        || sourceJob.userId !== uid
        || sourceJob.status !== 'completed'
        || outputProfile.type !== 'static'
        || action.frameCount !== 1
        || specReport.frameCount !== 1
        || specReport.technicalPass !== true
        || specReport.allOutputsPass !== true) {
        throw new https_1.HttpsError('failed-precondition', '기술 검사를 통과한 완성 정지 이모티콘만 프레임으로 가져올 수 있습니다.');
    }
    const sourceStoragePath = typeof sourceJob.keyPoseStoragePath === 'string'
        ? sourceJob.keyPoseStoragePath
        : '';
    const expectedPrefix = `users/${uid}/emoticon-studio/jobs/${input.sourceJobId}/`;
    if (!sourceStoragePath.startsWith(expectedPrefix)) {
        throw new https_1.HttpsError('failed-precondition', '정지 이모티콘의 검증된 원본 프레임을 찾을 수 없습니다.');
    }
    const sourceFile = admin.storage().bucket().file(sourceStoragePath);
    const { metadata, source } = await Promise.all([
        sourceFile.getMetadata(),
        sourceFile.download(),
    ])
        .then(([[metadata], [source]]) => ({ metadata, source }))
        .catch(() => {
        throw new https_1.HttpsError('failed-precondition', '정지 이모티콘의 원본 프레임 파일을 찾을 수 없습니다.');
    });
    const storedSize = Number(metadata.size || 0);
    if (metadata.contentType !== 'image/png'
        || !storedSize
        || storedSize > MAX_NORMALIZED_FRAME_BYTES
        || source.byteLength !== storedSize
        || detectContentType(source) !== 'image/png') {
        throw new https_1.HttpsError('failed-precondition', '정지 이모티콘 원본 프레임의 파일 무결성을 확인하지 못했습니다.');
    }
    let normalized;
    try {
        normalized = await (0, renderer_1.normalizeGeneratedEmoticonPose)(source);
    }
    catch (_d) {
        throw new https_1.HttpsError('failed-precondition', '정지 이모티콘 원본 프레임을 조립 규격으로 변환하지 못했습니다.');
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
});
async function downloadVerifiedEmoticonImportFrames(params) {
    if (!params.frames.length || params.frames.length > 24) {
        throw new Error('A manual frame import requires between 1 and 24 source images.');
    }
    const bucket = admin.storage().bucket();
    const seenPaths = new Set();
    const seenUploadIds = new Set();
    return Promise.all(params.frames.map(async (frame) => {
        const expectedPath = `users/${params.uid}/emoticon-studio/sources/manual-${frame.uploadRequestId}.png`;
        if (frame.sourceStoragePath !== expectedPath
            || seenPaths.has(frame.sourceStoragePath)
            || seenUploadIds.has(frame.uploadRequestId)) {
            throw new Error('A manual frame path is duplicated or does not belong to this user.');
        }
        seenPaths.add(frame.sourceStoragePath);
        seenUploadIds.add(frame.uploadRequestId);
        const file = bucket.file(frame.sourceStoragePath);
        const [metadata] = await file.getMetadata();
        const custom = metadata.metadata || {};
        const storedSize = Number(metadata.size || 0);
        if (custom.uploadedBy !== params.uid
            || custom.purpose !== 'manual-emoticon-frame'
            || custom.uploadRequestId !== frame.uploadRequestId
            || custom.projectId !== params.projectId
            || custom.projectItemId !== params.projectItemId
            || custom.sha256 !== frame.sha256
            || metadata.contentType !== 'image/png'
            || !storedSize
            || storedSize > MAX_NORMALIZED_FRAME_BYTES) {
            throw new Error('A manual frame failed its server ownership or metadata check.');
        }
        const [stored] = await file.download();
        if (stored.byteLength !== storedSize
            || sha256(stored) !== frame.sha256
            || detectContentType(stored) !== 'image/png') {
            throw new Error('A manual frame failed its server file-integrity check.');
        }
        return (0, renderer_1.normalizeGeneratedEmoticonPose)(stored);
    }));
}
//# sourceMappingURL=manualFrameImport.js.map