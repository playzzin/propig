"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadEmoticonSource = void 0;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../firestore");
const renderer_1 = require("./renderer");
const REGION = 'asia-northeast3';
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_NORMALIZED_BYTES = 8 * 1024 * 1024;
const DEFAULT_DAILY_UPLOAD_COUNT = 20;
const DEFAULT_DAILY_UPLOAD_BYTES = 100 * 1024 * 1024;
const SOURCE_ASSET_COLLECTION = 'emoticonStudioSourceAssets';
const SOURCE_ASSET_PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
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
function cleanFileName(value) {
    if (typeof value !== 'string')
        return 'character.png';
    const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180);
    return cleaned || 'character.png';
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
    throw new https_1.HttpsError('permission-denied', '관리자만 이모티콘 원본을 업로드할 수 있습니다.');
}
function sourceAssetDocument(uid, assetId) {
    return firestore_1.db.doc(`users/${uid}/${SOURCE_ASSET_COLLECTION}/${assetId}`);
}
function sourceDownloadUrl(bucketName, storagePath, token) {
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}`
        + `/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}
/**
 * Reserves both the daily quota and a content-addressed source asset in one
 * transaction. Repeating the same normalized image reuses the reservation, so
 * a lost callable response or a transient Storage failure never double-charges.
 */
async function reserveSourceAsset(params) {
    const day = utcDayKey();
    const quotaRef = firestore_1.db.collection('emoticonStudioUploadLimits').doc(`${params.uid}_${day}`);
    const assetRef = sourceAssetDocument(params.uid, params.assetId);
    const countLimit = positiveInteger(process.env.EMOTICON_STUDIO_UPLOAD_DAILY_LIMIT, DEFAULT_DAILY_UPLOAD_COUNT);
    const byteLimit = positiveInteger(process.env.EMOTICON_STUDIO_UPLOAD_DAILY_BYTES, DEFAULT_DAILY_UPLOAD_BYTES);
    const storagePath = `users/${params.uid}/emoticon-studio/sources/source-${params.assetId}.png`;
    return firestore_1.db.runTransaction(async (transaction) => {
        const [assetSnapshot, quotaSnapshot] = await Promise.all([
            transaction.get(assetRef),
            transaction.get(quotaRef),
        ]);
        const existing = assetSnapshot.data() || {};
        if (assetSnapshot.exists && existing.state !== 'deleted') {
            if (existing.userId !== params.uid
                || existing.sha256 !== params.sha256
                || existing.storagePath !== storagePath
                || typeof existing.downloadToken !== 'string')
                throw new https_1.HttpsError('failed-precondition', '원본 자산 등록 정보가 일치하지 않습니다.');
            if (existing.state === 'checking' || existing.state === 'deleting') {
                throw new https_1.HttpsError('aborted', '원본 자산을 정리 중입니다. 잠시 후 다시 시도해 주세요.');
            }
            transaction.update(assetRef, {
                state: 'uploading',
                originalName: params.originalName,
                normalizedByteLength: params.normalizedByteLength,
                expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + SOURCE_ASSET_PENDING_TTL_MS),
                lastRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return {
                assetId: params.assetId,
                storagePath,
                downloadToken: existing.downloadToken,
            };
        }
        const quota = quotaSnapshot.data() || {};
        const count = typeof quota.count === 'number' ? quota.count : 0;
        const bytes = typeof quota.bytes === 'number' ? quota.bytes : 0;
        if (count + 1 > countLimit || bytes + params.byteLength > byteLimit) {
            throw new https_1.HttpsError('resource-exhausted', '오늘의 원본 이미지 업로드 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
        }
        const downloadToken = (0, node_crypto_1.randomUUID)();
        transaction.set(quotaRef, {
            uid: params.uid,
            day,
            count: count + 1,
            bytes: bytes + params.byteLength,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 35 * 24 * 60 * 60 * 1000),
        });
        transaction.set(assetRef, {
            schemaVersion: 1,
            assetId: params.assetId,
            userId: params.uid,
            sha256: params.sha256,
            storagePath,
            downloadToken,
            originalName: params.originalName,
            sourceByteLength: params.byteLength,
            normalizedByteLength: params.normalizedByteLength,
            state: 'uploading',
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + SOURCE_ASSET_PENDING_TTL_MS),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { assetId: params.assetId, storagePath, downloadToken };
    });
}
async function verifyExistingSourceAsset(params) {
    const [metadata] = await admin.storage().bucket().file(params.storagePath).getMetadata();
    const custom = metadata.metadata || {};
    if (metadata.contentType !== 'image/png'
        || custom.uploadedBy !== params.uid
        || custom.sourceAssetId !== params.assetId
        || custom.sha256 !== params.sha256)
        throw new https_1.HttpsError('failed-precondition', '저장된 원본 자산의 소유권 검증에 실패했습니다.');
}
async function markSourceAssetPending(params) {
    const ref = sourceAssetDocument(params.uid, params.assetId);
    await firestore_1.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const asset = snapshot.data() || {};
        if (!snapshot.exists
            || asset.userId !== params.uid
            || asset.sha256 !== params.sha256
            || asset.storagePath !== params.storagePath
            || asset.downloadToken !== params.downloadToken)
            throw new https_1.HttpsError('aborted', '업로드 중 원본 자산 예약이 변경되었습니다.');
        transaction.update(ref, {
            state: 'pending',
            normalizedByteLength: params.normalizedByteLength,
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + SOURCE_ASSET_PENDING_TTL_MS),
            uploadedAt: asset.uploadedAt || admin.firestore.FieldValue.serverTimestamp(),
            lastError: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });
}
exports.uploadEmoticonSource = (0, https_1.onCall)({
    region: REGION,
    timeoutSeconds: 60,
    memory: '512MiB',
    maxInstances: 10,
}, async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    await requireStudioAdmin(uid, (((_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) || {}));
    const input = (request.data || {});
    const declaredContentType = typeof input.contentType === 'string' ? input.contentType.trim() : '';
    const base64 = typeof input.base64 === 'string' ? input.base64 : '';
    if (!ALLOWED_CONTENT_TYPES.has(declaredContentType)) {
        throw new https_1.HttpsError('invalid-argument', 'PNG, JPG, WebP 이미지만 업로드할 수 있습니다.');
    }
    if (!base64
        || base64.length > Math.ceil(MAX_SOURCE_BYTES * 4 / 3) + 16
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
        throw new https_1.HttpsError('invalid-argument', '원본 이미지 데이터는 5MB 이하여야 합니다.');
    const source = Buffer.from(base64, 'base64');
    if (!source.byteLength || source.byteLength > MAX_SOURCE_BYTES) {
        throw new https_1.HttpsError('invalid-argument', '원본 이미지는 5MB 이하여야 합니다.');
    }
    const detectedContentType = detectContentType(source);
    if (!detectedContentType || detectedContentType !== declaredContentType) {
        throw new https_1.HttpsError('invalid-argument', '파일 내용과 이미지 형식이 일치하지 않습니다.');
    }
    let normalized;
    try {
        normalized = await (0, renderer_1.normalizeEmoticonSourceImage)(source);
    }
    catch (error) {
        logger.warn('[Emoticon Studio] Rejected invalid source upload.', { uid, error });
        throw new https_1.HttpsError('invalid-argument', '손상되었거나 지원하지 않는 이미지입니다.');
    }
    if (!normalized.byteLength || normalized.byteLength > MAX_NORMALIZED_BYTES) {
        throw new https_1.HttpsError('invalid-argument', '정규화된 이미지가 허용 용량을 초과했습니다.');
    }
    const sha256 = (0, node_crypto_1.createHash)('sha256').update(normalized).digest('hex');
    const assetId = sha256;
    const originalName = cleanFileName(input.fileName);
    const reservation = await reserveSourceAsset({
        uid,
        assetId,
        sha256,
        byteLength: source.byteLength,
        normalizedByteLength: normalized.byteLength,
        originalName,
    });
    const bucket = admin.storage().bucket();
    try {
        await bucket.file(reservation.storagePath).save(normalized, {
            resumable: false,
            validation: 'crc32c',
            contentType: 'image/png',
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: {
                cacheControl: 'private, max-age=3600',
                metadata: {
                    firebaseStorageDownloadTokens: reservation.downloadToken,
                    originalName,
                    uploadedBy: uid,
                    purpose: 'emoticon-source',
                    sourceAssetId: assetId,
                    sha256,
                },
            },
        });
    }
    catch (error) {
        try {
            await verifyExistingSourceAsset({
                uid,
                assetId,
                sha256,
                storagePath: reservation.storagePath,
            });
        }
        catch (_c) {
            await sourceAssetDocument(uid, assetId).update({
                state: 'upload_failed',
                lastError: error instanceof Error
                    ? error.message.slice(0, 300)
                    : String(error).slice(0, 300),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(() => undefined);
            throw error;
        }
    }
    await markSourceAssetPending(Object.assign(Object.assign({}, reservation), { uid,
        sha256, normalizedByteLength: normalized.byteLength }));
    return {
        sourceImageUrl: sourceDownloadUrl(bucket.name, reservation.storagePath, reservation.downloadToken),
        sourceStoragePath: reservation.storagePath,
    };
});
//# sourceMappingURL=uploadSource.js.map