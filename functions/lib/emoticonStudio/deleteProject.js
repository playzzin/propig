"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmoticonProjectSafely = exports.EMOTICON_PROJECT_DELETION_MODES = void 0;
exports.isSafeEmoticonDeletionId = isSafeEmoticonDeletionId;
exports.isWorkingEmoticonJobStatus = isWorkingEmoticonJobStatus;
exports.isWorkingEmoticonItemStatus = isWorkingEmoticonItemStatus;
exports.emoticonJobStoragePrefix = emoticonJobStoragePrefix;
exports.isOwnedEmoticonSourcePath = isOwnedEmoticonSourcePath;
exports.emoticonSourceAssetId = emoticonSourceAssetId;
exports.cancelActiveEmoticonBatchItemsForDeletion = cancelActiveEmoticonBatchItemsForDeletion;
exports.continueEmoticonProjectDeletion = continueEmoticonProjectDeletion;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("../firestore");
const batchContract_1 = require("./batchContract");
const REGION = 'asia-northeast3';
const OPERATION_COLLECTION = 'emoticonStudioProjectDeletions';
const SOURCE_LOCK_COLLECTION = 'emoticonStudioSourceAssetLocks';
const ITEM_DELETE_BATCH_SIZE = 200;
const JOB_DELETE_BATCH_SIZE = 20;
const BATCH_DELETE_BATCH_SIZE = 100;
const READ_PAGE_SIZE = 200;
const STORAGE_PAGE_SIZE = 100;
// The lease must outlive one bounded invocation. A shorter lease allows the
// scheduled resumer to overlap an invocation while it is listing Storage pages.
const LEASE_MS = 10 * 60 * 1000;
const INVOCATION_BUDGET_MS = 7 * 60 * 1000;
const AUTOMATIC_RETRY_DELAY_MS = 30 * 1000;
const SOURCE_DELETE_LOCK_CONTRACT_VERSION = 'v1';
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,160}$/;
const ACTIVE_JOB_STATUSES = new Set([
    'queued',
    'analyzing',
    'generating',
    'validating',
    'animating',
    'rendering',
]);
const ACTIVE_ITEM_STATUSES = new Set(['queued', 'generating']);
const ACTIVE_BATCH_ITEM_STATUSES = new Set(['pending', 'queued', 'running', 'deferred']);
exports.EMOTICON_PROJECT_DELETION_MODES = [
    'project_only',
    'project_and_assets',
];
class DeletionWorkYieldedError extends Error {
    constructor() {
        super('The deletion invocation reached its safe work budget.');
        this.name = 'DeletionWorkYieldedError';
    }
}
function isSafeEmoticonDeletionId(value) {
    return SAFE_IDENTIFIER.test(value);
}
function isWorkingEmoticonJobStatus(value) {
    return typeof value === 'string' && ACTIVE_JOB_STATUSES.has(value);
}
function isWorkingEmoticonItemStatus(value) {
    return typeof value === 'string' && ACTIVE_ITEM_STATUSES.has(value);
}
function isSafeFirebaseUid(value) {
    return value.length >= 1
        && value.length <= 128
        && !/[\\/\u0000-\u001f\u007f]/.test(value);
}
function sourceStoragePrefix(userId) {
    return `users/${userId}/emoticon-studio/sources/`;
}
function emoticonJobStoragePrefix(userId, jobId) {
    if (!isSafeFirebaseUid(userId) || !isSafeEmoticonDeletionId(jobId)) {
        throw new Error('Unsafe emoticon job storage owner.');
    }
    return `users/${userId}/emoticon-studio/jobs/${jobId}/`;
}
function isOwnedEmoticonSourcePath(userId, storagePath) {
    if (!isSafeFirebaseUid(userId))
        return false;
    const prefix = sourceStoragePrefix(userId);
    if (!storagePath.startsWith(prefix))
        return false;
    const relativePath = storagePath.slice(prefix.length);
    return relativePath.length >= 1
        && relativePath.length <= 240
        && !relativePath.includes('/')
        && !relativePath.includes('\\')
        && !/[\u0000-\u001f\u007f]/.test(relativePath)
        && relativePath !== '.'
        && relativePath !== '..';
}
function emoticonSourceAssetId(userId, storagePath) {
    if (!isOwnedEmoticonSourcePath(userId, storagePath)) {
        throw new Error('Unsafe emoticon source storage path.');
    }
    return storagePath.slice(sourceStoragePrefix(userId).length);
}
function sourceLockRefFor(userId, storagePath) {
    return firestore_2.db.collection('users')
        .doc(userId)
        .collection(SOURCE_LOCK_COLLECTION)
        .doc(emoticonSourceAssetId(userId, storagePath));
}
function isOwnedJobAssetPath(prefix, storagePath) {
    if (!storagePath.startsWith(prefix))
        return false;
    const relativePath = storagePath.slice(prefix.length);
    return relativePath.length > 0
        && !relativePath.includes('\\')
        && !relativePath.split('/').includes('..')
        && !/[\u0000-\u001f\u007f]/.test(relativePath);
}
function parseMode(value) {
    if (value === 'project_only' || value === 'project_and_assets')
        return value;
    throw new https_1.HttpsError('invalid-argument', '삭제 범위는 project_only 또는 project_and_assets 중 하나여야 합니다.');
}
function parseProjectId(value) {
    if (typeof value !== 'string' || !isSafeEmoticonDeletionId(value.trim())) {
        throw new https_1.HttpsError('invalid-argument', '올바른 프로젝트 번호가 필요합니다.');
    }
    return value.trim();
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
        firestore_2.db.collection('admins').doc(uid).get(),
        firestore_2.db.collection('userAccess').doc(uid).get(),
    ]);
    if (adminDoc.exists || (accessDoc.exists && ((_a = accessDoc.data()) === null || _a === void 0 ? void 0 : _a.role) === 'admin'))
        return;
    throw new https_1.HttpsError('permission-denied', '관리자만 이모티콘 프로젝트를 삭제할 수 있습니다.');
}
function operationIdFor(userId, projectId) {
    return (0, node_crypto_1.createHash)('sha256').update(`${userId}:${projectId}`).digest('hex');
}
function sourceProgressId(storagePath) {
    return (0, node_crypto_1.createHash)('sha256').update(storagePath).digest('hex');
}
function isSourceDeletionContractEnabled() {
    var _a;
    // Fail closed. This must stay disabled until project/job creation rejects
    // references whose matching source lock is checking, deleting, or deleted.
    return ((_a = process.env.EMOTICON_STUDIO_SOURCE_DELETE_LOCK_CONTRACT) === null || _a === void 0 ? void 0 : _a.trim())
        === SOURCE_DELETE_LOCK_CONTRACT_VERSION;
}
function emptyCounts() {
    return {
        deletedItems: 0,
        deletedBatches: 0,
        deletedJobs: 0,
        deletedJobAssets: 0,
        deletedSourceAssets: 0,
        retainedJobs: 0,
        retainedBatches: 0,
        retainedJobAssets: 0,
        retainedSourceAssets: 0,
    };
}
function normalizedCounts(value) {
    const candidate = value && typeof value === 'object'
        ? value
        : {};
    const counts = emptyCounts();
    Object.keys(counts).forEach((key) => {
        const raw = candidate[key];
        if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0)
            counts[key] = raw;
    });
    return counts;
}
function collectOwnedSourcePaths(userId, value, target, depth = 0) {
    if (depth > 10 || value === null || value === undefined)
        return;
    if (typeof value === 'string') {
        if (isOwnedEmoticonSourcePath(userId, value))
            target.add(value);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry) => collectOwnedSourcePaths(userId, entry, target, depth + 1));
        return;
    }
    if (typeof value !== 'object')
        return;
    Object.values(value).forEach((entry) => {
        collectOwnedSourcePaths(userId, entry, target, depth + 1);
    });
}
function documentContainsAnyPath(value, candidates, depth = 0) {
    if (!candidates.size || depth > 12 || value === null || value === undefined)
        return false;
    if (typeof value === 'string')
        return candidates.has(value);
    if (Array.isArray(value)) {
        return value.some((entry) => documentContainsAnyPath(entry, candidates, depth + 1));
    }
    if (typeof value !== 'object')
        return false;
    return Object.values(value).some((entry) => (documentContainsAnyPath(entry, candidates, depth + 1)));
}
function assertInvocationBudget(deadlineAtMs) {
    if (Date.now() >= deadlineAtMs)
        throw new DeletionWorkYieldedError();
}
function projectRefFor(userId, projectId) {
    return firestore_2.db.doc(`users/${userId}/emoticonProjects/${projectId}`);
}
function jobsRefFor(userId) {
    return firestore_2.db.collection('users').doc(userId).collection('emoticonJobs');
}
function batchesRefFor(userId) {
    return firestore_2.db.collection('users').doc(userId).collection('emoticonBatches');
}
function operationRefFor(operationId) {
    return firestore_2.db.collection(OPERATION_COLLECTION).doc(operationId);
}
async function recordSourceCandidates(params) {
    const paths = [...new Set([...params.storagePaths].filter((storagePath) => (isOwnedEmoticonSourcePath(params.userId, storagePath))))];
    if (!paths.length)
        return;
    const operationRef = operationRefFor(params.operationId);
    const candidateRefs = paths.map((storagePath) => (operationRef.collection('sources').doc(sourceProgressId(storagePath))));
    await firestore_2.db.runTransaction(async (transaction) => {
        var _a;
        const [operationSnapshot, ...candidateSnapshots] = await Promise.all([
            transaction.get(operationRef),
            ...candidateRefs.map((ref) => transaction.get(ref)),
        ]);
        if (!operationSnapshot.exists || ((_a = operationSnapshot.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
            throw new https_1.HttpsError('aborted', 'The deletion lease changed while recording source assets.');
        }
        candidateSnapshots.forEach((snapshot, index) => {
            var _a;
            if (snapshot.exists) {
                if (((_a = snapshot.data()) === null || _a === void 0 ? void 0 : _a.storagePath) !== paths[index]) {
                    throw new Error('Source deletion candidate hash collision.');
                }
                return;
            }
            transaction.create(snapshot.ref, {
                storagePath: paths[index],
                status: 'pending',
                discoveredAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        transaction.update(operationRef, {
            phase: 'recording_source_assets',
            leaseExpiresAtMs: Date.now() + LEASE_MS,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
}
function projectHasWorkingEmbeddedItem(project) {
    if (!Array.isArray(project.items))
        return false;
    return project.items.some((entry) => (Boolean(entry && typeof entry === 'object')
        && isWorkingEmoticonItemStatus(entry.generationStatus)));
}
async function acquireDeletionLease(params) {
    const operationId = operationIdFor(params.userId, params.projectId);
    const operationRef = operationRefFor(operationId);
    const projectRef = projectRefFor(params.userId, params.projectId);
    const leaseToken = (0, node_crypto_1.randomUUID)();
    const nowMs = Date.now();
    return firestore_2.db.runTransaction(async (transaction) => {
        const [operationSnapshot, projectSnapshot] = await Promise.all([
            transaction.get(operationRef),
            transaction.get(projectRef),
        ]);
        const existingOperation = operationSnapshot.data() || {};
        if (operationSnapshot.exists) {
            if (existingOperation.userId !== params.userId
                || existingOperation.projectId !== params.projectId
                || existingOperation.mode !== params.mode) {
                throw new https_1.HttpsError('failed-precondition', '이미 다른 삭제 범위로 시작된 프로젝트입니다. 기존 삭제 작업을 먼저 완료해 주세요.');
            }
            if (existingOperation.status === 'completed') {
                return { kind: 'completed', operationId };
            }
            const existingLeaseExpiresAtMs = typeof existingOperation.leaseExpiresAtMs === 'number'
                ? existingOperation.leaseExpiresAtMs
                : 0;
            if (existingOperation.leaseToken && existingLeaseExpiresAtMs > nowMs) {
                transaction.update(operationRef, {
                    nextAttemptAt: admin.firestore.Timestamp.fromMillis(existingLeaseExpiresAtMs + 1000),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                return { kind: 'busy', operationId };
            }
        }
        else if (!projectSnapshot.exists) {
            throw new https_1.HttpsError('not-found', '삭제할 이모티콘 프로젝트를 찾을 수 없습니다.');
        }
        const project = projectSnapshot.data() || {};
        if (projectSnapshot.exists && project.userId !== params.userId) {
            throw new https_1.HttpsError('permission-denied', '이 프로젝트를 삭제할 권한이 없습니다.');
        }
        if (projectSnapshot.exists
            && project.deletionLocked === true
            && project.deletionOperationId !== operationId) {
            throw new https_1.HttpsError('failed-precondition', '다른 삭제 작업이 이미 프로젝트를 잠갔습니다.');
        }
        const [itemSnapshot, jobSnapshot, batchSnapshot] = await Promise.all([
            transaction.get(projectRef.collection('items')
                .where('generationStatus', 'in', [...ACTIVE_ITEM_STATUSES])
                .limit(1)),
            transaction.get(jobsRefFor(params.userId)
                .where('projectId', '==', params.projectId)
                .where('status', 'in', [...ACTIVE_JOB_STATUSES])
                .limit(1)),
            transaction.get(batchesRefFor(params.userId)
                .where('projectId', '==', params.projectId)
                .where('status', 'in', ['preparing', 'running', 'deferred'])
                .limit(1)),
        ]);
        const hasWorkingItem = projectHasWorkingEmbeddedItem(project)
            || !itemSnapshot.empty;
        const hasWorkingJob = !jobSnapshot.empty;
        if (hasWorkingItem || hasWorkingJob || !batchSnapshot.empty) {
            throw new https_1.HttpsError('failed-precondition', '대기 중이거나 생성 중인 항목/작업이 있어 삭제할 수 없습니다. 완료 또는 취소 후 다시 시도해 주세요.');
        }
        const sourceCandidatePaths = new Set();
        collectOwnedSourcePaths(params.userId, project, sourceCandidatePaths);
        const existingSources = Array.isArray(existingOperation.sourceCandidatePaths)
            ? existingOperation.sourceCandidatePaths.filter((value) => (typeof value === 'string' && isOwnedEmoticonSourcePath(params.userId, value)))
            : [];
        existingSources.forEach((value) => sourceCandidatePaths.add(value));
        const counts = normalizedCounts(existingOperation.counts);
        const sourceDeletionEnabled = operationSnapshot.exists
            ? existingOperation.sourceDeletionEnabled === true
            : isSourceDeletionContractEnabled();
        transaction.set(operationRef, Object.assign(Object.assign({ schemaVersion: 1, operationId, userId: params.userId, projectId: params.projectId, mode: params.mode, status: 'processing', phase: operationSnapshot.exists ? String(existingOperation.phase || 'locked') : 'locked', leaseToken, leaseExpiresAtMs: nowMs + LEASE_MS, nextAttemptAt: admin.firestore.Timestamp.fromMillis(nowMs + LEASE_MS), sourceCandidatePaths: [...sourceCandidatePaths].sort(), sourceDeletionEnabled, initialItemCount: Math.max(Number(existingOperation.initialItemCount || 0), Number(project.itemCount || 0)), initialJobCount: Math.max(Number(existingOperation.initialJobCount || 0), jobSnapshot.size), initialBatchCount: Math.max(Number(existingOperation.initialBatchCount || 0), batchSnapshot.size), counts, attemptCount: firestore_1.FieldValue.increment(1), lastError: null }, (operationSnapshot.exists ? {} : { createdAt: firestore_1.FieldValue.serverTimestamp() })), { updatedAt: firestore_1.FieldValue.serverTimestamp() }), { merge: true });
        if (projectSnapshot.exists) {
            transaction.update(projectRef, {
                deletionLocked: true,
                deletionOperationId: operationId,
                deletionMode: params.mode,
                deletionRequestedBy: params.userId,
                deletionRequestedAt: project.deletionRequestedAt || firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        return { kind: 'acquired', operationId, leaseToken };
    });
}
async function checkpointOperation(params) {
    const operationRef = operationRefFor(params.operationId);
    await firestore_2.db.runTransaction(async (transaction) => {
        var _a;
        const snapshot = await transaction.get(operationRef);
        if (!snapshot.exists || ((_a = snapshot.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
            throw new https_1.HttpsError('aborted', '삭제 작업 실행권이 만료되었습니다. 잠시 후 다시 시도해 주세요.');
        }
        transaction.update(operationRef, Object.assign(Object.assign(Object.assign({}, params.update), (params.releaseLease
            ? {
                leaseToken: firestore_1.FieldValue.delete(),
                leaseExpiresAtMs: 0,
                nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now() + AUTOMATIC_RETRY_DELAY_MS),
            }
            : { leaseExpiresAtMs: Date.now() + LEASE_MS })), { updatedAt: firestore_1.FieldValue.serverTimestamp() }));
    });
}
async function readOperation(operationId) {
    const snapshot = await operationRefFor(operationId).get();
    if (!snapshot.exists)
        throw new Error('The deletion operation disappeared.');
    const data = snapshot.data() || {};
    return Object.assign(Object.assign(Object.assign({ operationId, userId: String(data.userId || ''), projectId: String(data.projectId || ''), mode: data.mode === 'project_and_assets' ? 'project_and_assets' : 'project_only', status: data.status === 'completed'
            ? 'completed'
            : data.status === 'retryable_failed'
                ? 'retryable_failed'
                : 'processing', phase: String(data.phase || 'locked') }, (typeof data.leaseToken === 'string' ? { leaseToken: data.leaseToken } : {})), (typeof data.leaseExpiresAtMs === 'number'
        ? { leaseExpiresAtMs: data.leaseExpiresAtMs }
        : {})), { sourceCandidatePaths: Array.isArray(data.sourceCandidatePaths)
            ? data.sourceCandidatePaths.filter((value) => typeof value === 'string')
            : [], sourceDeletionEnabled: data.sourceDeletionEnabled === true, counts: normalizedCounts(data.counts) });
}
async function deleteProjectItems(params) {
    const itemsRef = projectRefFor(params.userId, params.projectId).collection('items');
    while (true) {
        assertInvocationBudget(params.deadlineAtMs);
        const deletedCount = await firestore_2.db.runTransaction(async (transaction) => {
            var _a;
            const operationRef = operationRefFor(params.operationId);
            const [operationSnapshot, itemSnapshot] = await Promise.all([
                transaction.get(operationRef),
                transaction.get(itemsRef.limit(ITEM_DELETE_BATCH_SIZE)),
            ]);
            if (!operationSnapshot.exists || ((_a = operationSnapshot.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
                throw new https_1.HttpsError('aborted', '삭제 작업 실행권이 만료되었습니다.');
            }
            itemSnapshot.docs.forEach((document) => transaction.delete(document.ref));
            if (!itemSnapshot.empty) {
                transaction.update(operationRef, {
                    phase: 'deleting_items',
                    'counts.deletedItems': firestore_1.FieldValue.increment(itemSnapshot.size),
                    leaseExpiresAtMs: Date.now() + LEASE_MS,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            return itemSnapshot.size;
        });
        if (deletedCount === 0)
            break;
    }
    await checkpointOperation({
        operationId: params.operationId,
        leaseToken: params.leaseToken,
        update: { phase: 'items_deleted' },
    });
}
function cancelActiveEmoticonBatchItemsForDeletion(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((entry) => (Boolean(entry && typeof entry === 'object')
        && typeof entry.status === 'string'
        && typeof entry.progress === 'number')).map((item) => {
        if (!ACTIVE_BATCH_ITEM_STATUSES.has(item.status))
            return item;
        return Object.assign(Object.assign({}, item), { status: 'cancelled', progress: 100, deferredUntilMs: null, enqueueError: item.enqueueError || '프로젝트 삭제로 등록이 취소되었습니다.' });
    });
}
async function retainOrDeleteProjectBatches(params) {
    let cursorId;
    while (true) {
        assertInvocationBudget(params.deadlineAtMs);
        let query = batchesRefFor(params.userId)
            .where('projectId', '==', params.projectId)
            .orderBy(firestore_1.FieldPath.documentId())
            .limit(BATCH_DELETE_BATCH_SIZE);
        if (cursorId)
            query = query.startAfter(cursorId);
        const snapshot = await query.get();
        if (snapshot.empty)
            break;
        await firestore_2.db.runTransaction(async (transaction) => {
            var _a;
            const operationRef = operationRefFor(params.operationId);
            const [operationSnapshot, ...batchSnapshots] = await Promise.all([
                transaction.get(operationRef),
                ...snapshot.docs.map((document) => transaction.get(document.ref)),
            ]);
            if (!operationSnapshot.exists || ((_a = operationSnapshot.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
                throw new https_1.HttpsError('aborted', '삭제 작업 실행권이 만료되었습니다.');
            }
            let changedCount = 0;
            for (const batchSnapshot of batchSnapshots) {
                if (!batchSnapshot.exists)
                    continue;
                const batch = batchSnapshot.data() || {};
                if (batch.userId !== params.userId || batch.projectId !== params.projectId) {
                    throw new Error('Refused a batch outside the deletion ownership boundary.');
                }
                if (params.mode === 'project_and_assets') {
                    transaction.delete(batchSnapshot.ref);
                    changedCount += 1;
                    continue;
                }
                if (batch.projectDeletionOperationId === params.operationId)
                    continue;
                const activeBatch = ['preparing', 'running', 'deferred'].includes(String(batch.status));
                const items = activeBatch ? cancelActiveEmoticonBatchItemsForDeletion(batch.items) : null;
                const aggregate = items ? (0, batchContract_1.deriveEmoticonBatchAggregate)(items, true) : null;
                transaction.update(batchSnapshot.ref, Object.assign(Object.assign({}, (items && aggregate
                    ? {
                        items,
                        counts: aggregate.counts,
                        progressPercent: aggregate.progressPercent,
                        status: aggregate.status,
                        cancelRequestedAt: batch.cancelRequestedAt || firestore_1.FieldValue.serverTimestamp(),
                    }
                    : {})), { executionJobIds: [], executionSlotUpdatedAt: firestore_1.FieldValue.serverTimestamp(), projectDeletionOperationId: params.operationId, projectDeletedAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() }));
                changedCount += 1;
            }
            transaction.update(operationRef, {
                phase: params.mode === 'project_and_assets'
                    ? 'deleting_batches'
                    : 'retaining_batches',
                [`counts.${params.mode === 'project_and_assets' ? 'deletedBatches' : 'retainedBatches'}`]: firestore_1.FieldValue.increment(changedCount),
                leaseExpiresAtMs: Date.now() + LEASE_MS,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        cursorId = snapshot.docs[snapshot.docs.length - 1].id;
        if (snapshot.size < BATCH_DELETE_BATCH_SIZE)
            break;
    }
    await checkpointOperation({
        operationId: params.operationId,
        leaseToken: params.leaseToken,
        update: {
            phase: params.mode === 'project_and_assets'
                ? 'batches_deleted'
                : 'batches_retained',
        },
    });
}
async function listFilesUnderOwnedJobPrefix(params) {
    var _a;
    const prefix = emoticonJobStoragePrefix(params.userId, params.jobId);
    const bucket = admin.storage().bucket();
    let pageToken;
    let fileCount = 0;
    do {
        assertInvocationBudget(params.deadlineAtMs);
        const [files, nextQuery] = await bucket.getFiles(Object.assign({ prefix, maxResults: STORAGE_PAGE_SIZE, autoPaginate: false }, (pageToken ? { pageToken } : {})));
        for (const file of files) {
            if (!isOwnedJobAssetPath(prefix, file.name)) {
                throw new Error(`Refused unsafe job asset path: ${file.name}`);
            }
        }
        if (params.deleteFiles) {
            await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
        }
        fileCount += files.length;
        await ((_a = params.heartbeat) === null || _a === void 0 ? void 0 : _a.call(params));
        pageToken = typeof (nextQuery === null || nextQuery === void 0 ? void 0 : nextQuery.pageToken) === 'string' && nextQuery.pageToken
            ? nextQuery.pageToken
            : undefined;
    } while (pageToken);
    return fileCount;
}
async function countRetainedAssetsPaged(params) {
    var _a, _b;
    const operationRef = operationRefFor(params.operationId);
    const operationSnapshot = await operationRef.get();
    let cursorId = typeof ((_a = operationSnapshot.data()) === null || _a === void 0 ? void 0 : _a.retainedAssetsCursor) === 'string'
        ? String((_b = operationSnapshot.data()) === null || _b === void 0 ? void 0 : _b.retainedAssetsCursor)
        : undefined;
    while (true) {
        assertInvocationBudget(params.deadlineAtMs);
        let query = jobsRefFor(params.userId)
            .where('projectId', '==', params.projectId)
            .orderBy(firestore_1.FieldPath.documentId())
            .limit(JOB_DELETE_BATCH_SIZE);
        if (cursorId)
            query = query.startAfter(cursorId);
        const snapshot = await query.get();
        if (snapshot.empty)
            break;
        for (const document of snapshot.docs) {
            assertInvocationBudget(params.deadlineAtMs);
            const job = document.data();
            if (job.userId !== params.userId || job.projectId !== params.projectId) {
                throw new Error('Refused a job outside the deletion ownership boundary.');
            }
            if (isWorkingEmoticonJobStatus(job.status)) {
                throw new https_1.HttpsError('failed-precondition', 'A project job became active during deletion.');
            }
            const sourcePaths = new Set();
            collectOwnedSourcePaths(params.userId, job, sourcePaths);
            await recordSourceCandidates({
                userId: params.userId,
                operationId: params.operationId,
                leaseToken: params.leaseToken,
                storagePaths: sourcePaths,
            });
            const retainedJobAssets = await listFilesUnderOwnedJobPrefix({
                userId: params.userId,
                jobId: document.id,
                deleteFiles: false,
                deadlineAtMs: params.deadlineAtMs,
            });
            const progressRef = operationRef.collection('jobs').doc(document.id);
            await firestore_2.db.runTransaction(async (transaction) => {
                var _a, _b;
                const [currentOperation, progress] = await Promise.all([
                    transaction.get(operationRef),
                    transaction.get(progressRef),
                ]);
                if (!currentOperation.exists || ((_a = currentOperation.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
                    throw new https_1.HttpsError('aborted', 'The deletion lease changed while counting retained assets.');
                }
                const alreadyCounted = ((_b = progress.data()) === null || _b === void 0 ? void 0 : _b.retainedCounted) === true;
                transaction.set(progressRef, {
                    jobId: document.id,
                    retainedCounted: true,
                    retainedAssetCount: retainedJobAssets,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                }, { merge: true });
                transaction.update(operationRef, Object.assign(Object.assign({ phase: 'counting_retained_assets', retainedAssetsCursor: document.id }, (alreadyCounted ? {} : {
                    'counts.retainedJobs': firestore_1.FieldValue.increment(1),
                    'counts.retainedJobAssets': firestore_1.FieldValue.increment(retainedJobAssets),
                })), { leaseExpiresAtMs: Date.now() + LEASE_MS, updatedAt: firestore_1.FieldValue.serverTimestamp() }));
            });
            cursorId = document.id;
        }
        if (snapshot.size < JOB_DELETE_BATCH_SIZE)
            break;
    }
    while (true) {
        assertInvocationBudget(params.deadlineAtMs);
        const sourceSnapshot = await operationRef.collection('sources')
            .where('status', '==', 'pending')
            .limit(READ_PAGE_SIZE)
            .get();
        if (sourceSnapshot.empty)
            break;
        for (const sourceDocument of sourceSnapshot.docs) {
            const storagePath = sourceDocument.data().storagePath;
            if (typeof storagePath !== 'string' || !isOwnedEmoticonSourcePath(params.userId, storagePath)) {
                throw new Error('Refused an unsafe retained source asset path.');
            }
            const [exists] = await admin.storage().bucket().file(storagePath).exists();
            await recordSourceDecision({
                operationId: params.operationId,
                leaseToken: params.leaseToken,
                storagePath,
                status: exists ? 'retained' : 'missing',
                reason: exists ? 'retained_by_project_only_mode' : 'source_file_missing',
            });
        }
    }
    await checkpointOperation({
        operationId: params.operationId,
        leaseToken: params.leaseToken,
        update: {
            phase: 'retained_assets_counted',
            retainedAssetsCursor: firestore_1.FieldValue.delete(),
        },
    });
}
async function lockProjectJobsForDeletion(params) {
    const operationRef = operationRefFor(params.operationId);
    await firestore_2.db.runTransaction(async (transaction) => {
        var _a;
        const [operationSnapshot, ...jobSnapshots] = await Promise.all([
            transaction.get(operationRef),
            ...params.documents.map((document) => transaction.get(document.ref)),
        ]);
        if (!operationSnapshot.exists || ((_a = operationSnapshot.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
            throw new https_1.HttpsError('aborted', 'The deletion lease changed while locking project jobs.');
        }
        for (const snapshot of jobSnapshots) {
            if (!snapshot.exists)
                continue;
            const job = snapshot.data() || {};
            if (job.userId !== params.userId || job.projectId !== params.projectId) {
                throw new Error('Refused a job outside the deletion ownership boundary.');
            }
            if (isWorkingEmoticonJobStatus(job.status)) {
                throw new https_1.HttpsError('failed-precondition', 'A project job became active during deletion.');
            }
            transaction.update(snapshot.ref, {
                deletionLocked: true,
                deletionOperationId: params.operationId,
                deletionLockedAt: job.deletionLockedAt || firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        transaction.update(operationRef, {
            phase: 'locking_job_dependencies',
            leaseExpiresAtMs: Date.now() + LEASE_MS,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
}
async function assertNoActiveChildJobs(params) {
    if (!params.parentJobIds.length)
        return;
    const children = await jobsRefFor(params.userId)
        .where('parentJobId', 'in', params.parentJobIds.slice(0, 30))
        .get();
    const activeChild = children.docs.find((document) => isWorkingEmoticonJobStatus(document.data().status));
    if (activeChild) {
        throw new https_1.HttpsError('failed-precondition', '다른 프로젝트의 재렌더링 작업이 원본 결과를 사용 중입니다. 작업 완료 후 삭제를 자동 재개합니다.');
    }
}
async function prepareJobAssetDeletion(params) {
    var _a;
    const operationRef = operationRefFor(params.operationId);
    const progressRef = operationRef.collection('jobs').doc(params.job.id);
    const existingProgress = await progressRef.get();
    const existingCount = (_a = existingProgress.data()) === null || _a === void 0 ? void 0 : _a.plannedDeletedAssetCount;
    if (existingProgress.exists && Number.isInteger(existingCount) && existingCount >= 0) {
        return existingCount;
    }
    const plannedDeletedAssetCount = await listFilesUnderOwnedJobPrefix({
        userId: params.userId,
        jobId: params.job.id,
        deleteFiles: false,
        deadlineAtMs: params.deadlineAtMs,
    });
    await firestore_2.db.runTransaction(async (transaction) => {
        var _a, _b;
        const [operationSnapshot, jobSnapshot, progressSnapshot] = await Promise.all([
            transaction.get(operationRef),
            transaction.get(params.job.ref),
            transaction.get(progressRef),
        ]);
        if (!operationSnapshot.exists || ((_a = operationSnapshot.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
            throw new https_1.HttpsError('aborted', 'The deletion lease changed while planning job asset cleanup.');
        }
        const job = jobSnapshot.data() || {};
        if (!jobSnapshot.exists
            || job.userId !== params.userId
            || job.projectId !== params.projectId
            || job.deletionOperationId !== params.operationId)
            throw new https_1.HttpsError('aborted', 'The project job cleanup lock changed.');
        if (!progressSnapshot.exists || !Number.isInteger((_b = progressSnapshot.data()) === null || _b === void 0 ? void 0 : _b.plannedDeletedAssetCount)) {
            transaction.set(progressRef, {
                jobId: params.job.id,
                plannedDeletedAssetCount,
                assetCounted: false,
                plannedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        transaction.update(operationRef, {
            phase: 'planning_job_asset_deletion',
            leaseExpiresAtMs: Date.now() + LEASE_MS,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return plannedDeletedAssetCount;
}
async function deleteProjectJobsAndOwnedAssetsPaged(params) {
    const operationRef = operationRefFor(params.operationId);
    while (true) {
        assertInvocationBudget(params.deadlineAtMs);
        const snapshot = await jobsRefFor(params.userId)
            .where('projectId', '==', params.projectId)
            .orderBy(firestore_1.FieldPath.documentId())
            .limit(JOB_DELETE_BATCH_SIZE)
            .get();
        if (snapshot.empty)
            break;
        await lockProjectJobsForDeletion(Object.assign(Object.assign({}, params), { documents: snapshot.docs }));
        await assertNoActiveChildJobs({
            userId: params.userId,
            parentJobIds: snapshot.docs.map((document) => document.id),
        });
        const sourcePaths = new Set();
        snapshot.docs.forEach((document) => collectOwnedSourcePaths(params.userId, document.data(), sourcePaths));
        await recordSourceCandidates({
            userId: params.userId,
            operationId: params.operationId,
            leaseToken: params.leaseToken,
            storagePaths: sourcePaths,
        });
        const plannedCounts = new Map();
        for (const document of snapshot.docs) {
            const plannedCount = await prepareJobAssetDeletion(Object.assign(Object.assign({}, params), { job: document }));
            plannedCounts.set(document.id, plannedCount);
            await listFilesUnderOwnedJobPrefix({
                userId: params.userId,
                jobId: document.id,
                deleteFiles: true,
                deadlineAtMs: params.deadlineAtMs,
                heartbeat: () => checkpointOperation({
                    operationId: params.operationId,
                    leaseToken: params.leaseToken,
                    update: { phase: 'deleting_job_assets_and_jobs' },
                }),
            });
        }
        await firestore_2.db.runTransaction(async (transaction) => {
            var _a;
            const progressRefs = snapshot.docs.map((document) => operationRef.collection('jobs').doc(document.id));
            const [operationSnapshot, ...snapshots] = await Promise.all([
                transaction.get(operationRef),
                ...snapshot.docs.map((document) => transaction.get(document.ref)),
                ...progressRefs.map((ref) => transaction.get(ref)),
            ]);
            if (!operationSnapshot.exists || ((_a = operationSnapshot.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
                throw new https_1.HttpsError('aborted', 'The deletion lease changed while removing project jobs.');
            }
            const jobSnapshots = snapshots.slice(0, snapshot.size);
            const progressSnapshots = snapshots.slice(snapshot.size);
            let deletedJobs = 0;
            let deletedAssets = 0;
            jobSnapshots.forEach((jobSnapshot, index) => {
                var _a;
                if (!jobSnapshot.exists)
                    return;
                const job = jobSnapshot.data() || {};
                if (job.userId !== params.userId
                    || job.projectId !== params.projectId
                    || job.deletionOperationId !== params.operationId)
                    throw new Error('Job ownership changed during deletion.');
                const progress = progressSnapshots[index];
                const plannedCount = plannedCounts.get(jobSnapshot.id) || 0;
                if (((_a = progress.data()) === null || _a === void 0 ? void 0 : _a.assetCounted) !== true) {
                    deletedAssets += plannedCount;
                    transaction.set(progress.ref, {
                        assetCounted: true,
                        countedAt: firestore_1.FieldValue.serverTimestamp(),
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    }, { merge: true });
                }
                transaction.delete(jobSnapshot.ref);
                deletedJobs += 1;
            });
            transaction.update(operationRef, {
                phase: 'deleting_job_assets_and_jobs',
                'counts.deletedJobs': firestore_1.FieldValue.increment(deletedJobs),
                'counts.deletedJobAssets': firestore_1.FieldValue.increment(deletedAssets),
                leaseExpiresAtMs: Date.now() + LEASE_MS,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
    }
    await checkpointOperation({
        operationId: params.operationId,
        leaseToken: params.leaseToken,
        update: { phase: 'jobs_deleted' },
    });
}
async function queryPage(collection, cursor) {
    let query = collection
        .orderBy(firestore_1.FieldPath.documentId())
        .limit(READ_PAGE_SIZE);
    if (cursor)
        query = query.startAfter(cursor);
    return query.get();
}
async function findReferencedSourcePaths(params) {
    const referenced = new Set();
    const remaining = () => new Set([...params.candidates].filter((value) => !referenced.has(value)));
    const projectsRef = firestore_2.db.collection('users').doc(params.userId).collection('emoticonProjects');
    let projectCursor;
    while (referenced.size < params.candidates.size) {
        assertInvocationBudget(params.deadlineAtMs);
        const snapshot = await queryPage(projectsRef, projectCursor);
        await params.heartbeat();
        if (snapshot.empty)
            break;
        for (const projectDocument of snapshot.docs) {
            if (projectDocument.id === params.excludedProjectId)
                continue;
            const unresolved = remaining();
            unresolved.forEach((storagePath) => {
                if (documentContainsAnyPath(projectDocument.data(), new Set([storagePath]))) {
                    referenced.add(storagePath);
                }
            });
            if (referenced.size >= params.candidates.size)
                break;
            let itemCursor;
            while (referenced.size < params.candidates.size) {
                const itemSnapshot = await queryPage(projectDocument.ref.collection('items'), itemCursor);
                await params.heartbeat();
                if (itemSnapshot.empty)
                    break;
                for (const itemDocument of itemSnapshot.docs) {
                    const unresolvedItems = remaining();
                    unresolvedItems.forEach((storagePath) => {
                        if (documentContainsAnyPath(itemDocument.data(), new Set([storagePath]))) {
                            referenced.add(storagePath);
                        }
                    });
                }
                if (itemSnapshot.size < READ_PAGE_SIZE)
                    break;
                itemCursor = itemSnapshot.docs[itemSnapshot.docs.length - 1];
            }
        }
        if (snapshot.size < READ_PAGE_SIZE)
            break;
        projectCursor = snapshot.docs[snapshot.docs.length - 1];
    }
    const jobsRef = jobsRefFor(params.userId);
    let jobCursor;
    while (referenced.size < params.candidates.size) {
        assertInvocationBudget(params.deadlineAtMs);
        const snapshot = await queryPage(jobsRef, jobCursor);
        await params.heartbeat();
        if (snapshot.empty)
            break;
        for (const jobDocument of snapshot.docs) {
            const unresolved = remaining();
            unresolved.forEach((storagePath) => {
                if (documentContainsAnyPath(jobDocument.data(), new Set([storagePath]))) {
                    referenced.add(storagePath);
                }
            });
        }
        if (snapshot.size < READ_PAGE_SIZE)
            break;
        jobCursor = snapshot.docs[snapshot.docs.length - 1];
    }
    return referenced;
}
async function acquireSourceDeletionLock(params) {
    const lockRef = sourceLockRefFor(params.userId, params.storagePath);
    return firestore_2.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lockRef);
        const lock = snapshot.data() || {};
        if (snapshot.exists && (lock.userId !== params.userId || lock.storagePath !== params.storagePath)) {
            throw new Error('Source lock identity collision.');
        }
        if (lock.state === 'deleted') {
            return lock.operationId === params.operationId
                ? 'deleted_by_operation'
                : 'already_deleted';
        }
        if ((lock.state === 'checking' || lock.state === 'deleting')
            && lock.operationId !== params.operationId)
            return 'busy';
        transaction.set(lockRef, Object.assign({ schemaVersion: 1, userId: params.userId, storagePath: params.storagePath, operationId: params.operationId, state: 'checking', updatedAt: firestore_1.FieldValue.serverTimestamp() }, (snapshot.exists ? {} : { createdAt: firestore_1.FieldValue.serverTimestamp() })), { merge: true });
        return 'acquired';
    });
}
async function recordSourceDecision(params) {
    const operationRef = operationRefFor(params.operationId);
    const progressRef = operationRef.collection('sources').doc(sourceProgressId(params.storagePath));
    await firestore_2.db.runTransaction(async (transaction) => {
        var _a, _b;
        const [operationSnapshot, progressSnapshot] = await Promise.all([
            transaction.get(operationRef),
            transaction.get(progressRef),
        ]);
        if (!operationSnapshot.exists || ((_a = operationSnapshot.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
            throw new https_1.HttpsError('aborted', '삭제 작업 실행권이 만료되었습니다.');
        }
        if (progressSnapshot.exists && ['deleted', 'retained', 'missing'].includes(String((_b = progressSnapshot.data()) === null || _b === void 0 ? void 0 : _b.status))) {
            return;
        }
        transaction.set(progressRef, {
            storagePath: params.storagePath,
            status: params.status,
            reason: params.reason,
            decidedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(operationRef, Object.assign(Object.assign({ phase: 'checking_source_assets' }, (params.status === 'missing' ? {} : {
            [`counts.${params.status === 'deleted' ? 'deletedSourceAssets' : 'retainedSourceAssets'}`]: firestore_1.FieldValue.increment(1),
        })), { leaseExpiresAtMs: Date.now() + LEASE_MS, updatedAt: firestore_1.FieldValue.serverTimestamp() }));
    });
}
async function cleanupRecordedSourceCandidates(params) {
    const operationRef = operationRefFor(params.operationId);
    while (true) {
        assertInvocationBudget(params.deadlineAtMs);
        const snapshot = await operationRef.collection('sources')
            .where('status', '==', 'pending')
            .limit(READ_PAGE_SIZE)
            .get();
        if (snapshot.empty)
            break;
        const candidates = new Set();
        snapshot.docs.forEach((document) => {
            const storagePath = document.data().storagePath;
            if (typeof storagePath !== 'string' || !isOwnedEmoticonSourcePath(params.userId, storagePath)) {
                throw new Error('Refused an unsafe source deletion candidate.');
            }
            candidates.add(storagePath);
        });
        if (!params.sourceDeletionEnabled) {
            for (const storagePath of candidates) {
                await recordSourceDecision({
                    operationId: params.operationId,
                    leaseToken: params.leaseToken,
                    storagePath,
                    status: 'retained',
                    reason: 'source_lock_rules_contract_not_enabled',
                });
            }
            continue;
        }
        const lockedCandidates = new Set();
        for (const storagePath of candidates) {
            const lockState = await acquireSourceDeletionLock({
                userId: params.userId,
                operationId: params.operationId,
                storagePath,
            });
            if (lockState === 'busy')
                throw new DeletionWorkYieldedError();
            if (lockState === 'already_deleted' || lockState === 'deleted_by_operation') {
                await recordSourceDecision({
                    operationId: params.operationId,
                    leaseToken: params.leaseToken,
                    storagePath,
                    status: lockState === 'deleted_by_operation' ? 'deleted' : 'missing',
                    reason: 'already_deleted_by_safe_operation',
                });
            }
            else {
                lockedCandidates.add(storagePath);
            }
        }
        const referenced = await findReferencedSourcePaths({
            userId: params.userId,
            excludedProjectId: params.projectId,
            candidates: lockedCandidates,
            deadlineAtMs: params.deadlineAtMs,
            heartbeat: () => checkpointOperation({
                operationId: params.operationId,
                leaseToken: params.leaseToken,
                update: { phase: 'checking_source_assets' },
            }),
        });
        for (const storagePath of lockedCandidates) {
            const lockRef = sourceLockRefFor(params.userId, storagePath);
            if (referenced.has(storagePath)) {
                await lockRef.update({
                    state: 'retained',
                    retainedReason: 'referenced_by_another_owner_project_or_job',
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                await recordSourceDecision({
                    operationId: params.operationId,
                    leaseToken: params.leaseToken,
                    storagePath,
                    status: 'retained',
                    reason: 'referenced_by_another_owner_project_or_job',
                });
                continue;
            }
            await lockRef.update({ state: 'deleting', updatedAt: firestore_1.FieldValue.serverTimestamp() });
            await admin.storage().bucket().file(storagePath).delete({ ignoreNotFound: true });
            await lockRef.update({
                state: 'deleted',
                deletedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            await recordSourceDecision({
                operationId: params.operationId,
                leaseToken: params.leaseToken,
                storagePath,
                status: 'deleted',
                reason: 'unreferenced_after_owner_scope_scan',
            });
        }
    }
    await checkpointOperation({
        operationId: params.operationId,
        leaseToken: params.leaseToken,
        update: {
            phase: params.sourceDeletionEnabled
                ? 'source_assets_checked'
                : 'source_assets_retained_contract_gate',
        },
    });
}
async function finishProjectDeletion(params) {
    const operationRef = operationRefFor(params.operationId);
    const projectRef = projectRefFor(params.userId, params.projectId);
    await firestore_2.db.runTransaction(async (transaction) => {
        var _a;
        const [operationSnapshot, projectSnapshot, itemSnapshot] = await Promise.all([
            transaction.get(operationRef),
            transaction.get(projectRef),
            transaction.get(projectRef.collection('items').limit(1)),
        ]);
        if (!operationSnapshot.exists || ((_a = operationSnapshot.data()) === null || _a === void 0 ? void 0 : _a.leaseToken) !== params.leaseToken) {
            throw new https_1.HttpsError('aborted', '삭제 작업 실행권이 만료되었습니다.');
        }
        if (!itemSnapshot.empty) {
            throw new Error('Project item cleanup is incomplete.');
        }
        if (projectSnapshot.exists) {
            const project = projectSnapshot.data() || {};
            if (project.userId !== params.userId
                || project.deletionLocked !== true
                || project.deletionOperationId !== params.operationId) {
                throw new Error('Project deletion lock no longer belongs to this operation.');
            }
        }
        const jobQuery = params.mode === 'project_and_assets'
            ? jobsRefFor(params.userId).where('projectId', '==', params.projectId).limit(1)
            : jobsRefFor(params.userId)
                .where('projectId', '==', params.projectId)
                .where('status', 'in', [...ACTIVE_JOB_STATUSES])
                .limit(1);
        const batchQuery = params.mode === 'project_and_assets'
            ? batchesRefFor(params.userId).where('projectId', '==', params.projectId).limit(1)
            : batchesRefFor(params.userId)
                .where('projectId', '==', params.projectId)
                .where('status', 'in', ['preparing', 'running', 'deferred'])
                .limit(1);
        const [remainingJobs, remainingBatches] = await Promise.all([
            transaction.get(jobQuery),
            transaction.get(batchQuery),
        ]);
        if (params.mode === 'project_and_assets' && (!remainingJobs.empty || !remainingBatches.empty)) {
            throw new Error('Project job or batch cleanup is incomplete.');
        }
        if (params.mode === 'project_only'
            && !remainingJobs.empty) {
            throw new https_1.HttpsError('failed-precondition', '새 작업이 시작되어 프로젝트 삭제를 중단했습니다.');
        }
        if (params.mode === 'project_only'
            && !remainingBatches.empty) {
            throw new https_1.HttpsError('failed-precondition', '일괄 작업 정리가 끝나지 않아 프로젝트 삭제를 중단했습니다.');
        }
        if (projectSnapshot.exists)
            transaction.delete(projectRef);
        transaction.update(operationRef, {
            status: 'completed',
            phase: 'completed',
            leaseToken: firestore_1.FieldValue.delete(),
            leaseExpiresAtMs: 0,
            nextAttemptAt: firestore_1.FieldValue.delete(),
            completedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
}
function operationResponse(operation, inProgress = false) {
    return {
        operationId: operation.operationId,
        projectId: operation.projectId,
        mode: operation.mode,
        status: inProgress && operation.status !== 'completed' ? 'processing' : operation.status,
        phase: operation.phase,
        sourceCleanup: operation.mode === 'project_only'
            ? 'retained_by_mode'
            : operation.sourceDeletionEnabled
                ? 'guarded_unreferenced_cleanup'
                : 'retained_until_source_lock_rules_enabled',
        counts: operation.counts,
    };
}
async function continueEmoticonProjectDeletion(params) {
    const lease = await acquireDeletionLease(params);
    if (lease.kind === 'completed') {
        return operationResponse(await readOperation(lease.operationId));
    }
    if (lease.kind === 'busy' || !lease.leaseToken) {
        return operationResponse(await readOperation(lease.operationId), true);
    }
    const deadlineAtMs = Date.now() + INVOCATION_BUDGET_MS;
    try {
        const operation = await readOperation(lease.operationId);
        await recordSourceCandidates({
            userId: params.userId,
            operationId: lease.operationId,
            leaseToken: lease.leaseToken,
            storagePaths: operation.sourceCandidatePaths,
        });
        await deleteProjectItems({
            userId: params.userId,
            projectId: params.projectId,
            operationId: lease.operationId,
            leaseToken: lease.leaseToken,
            deadlineAtMs,
        });
        await retainOrDeleteProjectBatches({
            userId: params.userId,
            projectId: params.projectId,
            mode: params.mode,
            operationId: lease.operationId,
            leaseToken: lease.leaseToken,
            deadlineAtMs,
        });
        if (params.mode === 'project_only') {
            await countRetainedAssetsPaged({
                userId: params.userId,
                projectId: params.projectId,
                operationId: lease.operationId,
                leaseToken: lease.leaseToken,
                deadlineAtMs,
            });
        }
        else {
            await deleteProjectJobsAndOwnedAssetsPaged({
                userId: params.userId,
                projectId: params.projectId,
                operationId: lease.operationId,
                leaseToken: lease.leaseToken,
                deadlineAtMs,
            });
            await cleanupRecordedSourceCandidates({
                userId: params.userId,
                projectId: params.projectId,
                operationId: lease.operationId,
                leaseToken: lease.leaseToken,
                sourceDeletionEnabled: operation.sourceDeletionEnabled,
                deadlineAtMs,
            });
        }
        await finishProjectDeletion({
            userId: params.userId,
            projectId: params.projectId,
            mode: params.mode,
            operationId: lease.operationId,
            leaseToken: lease.leaseToken,
        });
        const completed = await readOperation(lease.operationId);
        logger.info('[EmoticonStudio] Safe project deletion completed.', operationResponse(completed));
        return operationResponse(completed);
    }
    catch (error) {
        if (error instanceof DeletionWorkYieldedError) {
            await checkpointOperation({
                operationId: lease.operationId,
                leaseToken: lease.leaseToken,
                update: { status: 'processing' },
                releaseLease: true,
            });
            return operationResponse(await readOperation(lease.operationId), true);
        }
        const message = error instanceof Error ? error.message : String(error);
        await checkpointOperation({
            operationId: lease.operationId,
            leaseToken: lease.leaseToken,
            update: {
                status: 'retryable_failed',
                lastError: message.slice(0, 500),
                failedAt: firestore_1.FieldValue.serverTimestamp(),
            },
            releaseLease: true,
        }).catch((checkpointError) => {
            logger.error('[EmoticonStudio] Could not checkpoint project deletion failure.', {
                operationId: lease.operationId,
                checkpointError,
            });
        });
        if (error instanceof https_1.HttpsError)
            throw error;
        logger.error('[EmoticonStudio] Safe project deletion stopped and will retry.', Object.assign(Object.assign({}, params), { operationId: lease.operationId, error }));
        throw new https_1.HttpsError('unavailable', '프로젝트 삭제가 안전하게 중단되었습니다. 서버가 같은 작업을 자동으로 다시 시도합니다.');
    }
}
exports.deleteEmoticonProjectSafely = (0, https_1.onCall)({
    region: REGION,
    timeoutSeconds: 540,
    memory: '1GiB',
    maxInstances: 10,
}, async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid || !isSafeFirebaseUid(uid)) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    await requireStudioAdmin(uid, (((_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) || {}));
    const input = (request.data || {});
    return continueEmoticonProjectDeletion({
        userId: uid,
        projectId: parseProjectId(input.projectId),
        mode: parseMode(input.mode),
    });
});
//# sourceMappingURL=deleteProject.js.map