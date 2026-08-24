"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmoticonJobSafely = void 0;
exports.isSafeEmoticonJobDeletionId = isSafeEmoticonJobDeletionId;
exports.emoticonJobDeletionStoragePrefix = emoticonJobDeletionStoragePrefix;
exports.unlinkDeletedJobFromProjectItem = unlinkDeletedJobFromProjectItem;
exports.unlinkDeletedJobFromBatch = unlinkDeletedJobFromBatch;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("../firestore");
const REGION = 'asia-northeast3';
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,160}$/;
const STORAGE_PAGE_SIZE = 100;
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled']);
function isSafeFirebaseUid(value) {
    return value.length >= 1
        && value.length <= 128
        && !/[\\/\u0000-\u001f\u007f]/.test(value);
}
function isSafeEmoticonJobDeletionId(value) {
    return SAFE_IDENTIFIER.test(value);
}
function parseJobId(value) {
    if (typeof value !== 'string' || !isSafeEmoticonJobDeletionId(value.trim())) {
        throw new https_1.HttpsError('invalid-argument', '삭제할 작업 번호가 올바르지 않습니다.');
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
    throw new https_1.HttpsError('permission-denied', '관리자만 이모티콘 작업을 삭제할 수 있습니다.');
}
function emoticonJobDeletionStoragePrefix(userId, jobId) {
    if (!isSafeFirebaseUid(userId) || !isSafeEmoticonJobDeletionId(jobId)) {
        throw new Error('Unsafe emoticon job storage owner.');
    }
    return `users/${userId}/emoticon-studio/jobs/${jobId}/`;
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
function normalizedEditHistory(value, jobId) {
    if (!Array.isArray(value))
        return [];
    return value.filter((entry) => {
        if (!entry || typeof entry !== 'object')
            return false;
        const candidate = entry;
        return candidate.sourceJobId !== jobId && candidate.resultJobId !== jobId;
    });
}
function unlinkDeletedJobFromProjectItem(value, jobId) {
    const source = value && typeof value === 'object'
        ? value
        : {};
    const originalHistory = Array.isArray(source.editHistory) ? source.editHistory : [];
    const editHistory = normalizedEditHistory(originalHistory, jobId);
    const currentResultRemoved = source.jobId === jobId;
    const changed = currentResultRemoved || editHistory.length !== originalHistory.length;
    if (!changed)
        return { changed: false, currentResultRemoved: false, item: source };
    return {
        changed: true,
        currentResultRemoved,
        item: Object.assign(Object.assign(Object.assign(Object.assign({}, source), { editHistory }), (currentResultRemoved ? {
            jobId: null,
            generationStatus: 'planned',
            validationErrors: [],
        } : {})), { revision: Number.isInteger(source.revision)
                ? Number(source.revision) + 1
                : 1, updatedAt: admin.firestore.Timestamp.now() }),
    };
}
function unlinkDeletedJobFromBatch(value, jobId) {
    const source = value && typeof value === 'object'
        ? value
        : {};
    const originalItems = Array.isArray(source.items) ? source.items : [];
    let changed = false;
    const items = originalItems.map((entry) => {
        var _a;
        if (!entry || typeof entry !== 'object')
            return entry;
        const item = entry;
        const originalJobIds = Array.isArray(item.jobIds)
            ? item.jobIds.filter((candidate) => typeof candidate === 'string')
            : [];
        const jobIds = originalJobIds.filter((candidate) => candidate !== jobId);
        const currentRemoved = item.currentJobId === jobId;
        if (!currentRemoved && jobIds.length === originalJobIds.length)
            return entry;
        changed = true;
        return Object.assign(Object.assign({}, item), { jobIds, currentJobId: currentRemoved ? ((_a = jobIds.at(-1)) !== null && _a !== void 0 ? _a : null) : item.currentJobId });
    });
    const originalExecutionIds = Array.isArray(source.executionJobIds)
        ? source.executionJobIds.filter((candidate) => typeof candidate === 'string')
        : [];
    const executionJobIds = originalExecutionIds.filter((candidate) => candidate !== jobId);
    if (executionJobIds.length !== originalExecutionIds.length)
        changed = true;
    return { changed, items, executionJobIds };
}
async function deleteOwnedJobAssets(userId, jobId) {
    const prefix = emoticonJobDeletionStoragePrefix(userId, jobId);
    const bucket = admin.storage().bucket();
    let deletedAssets = 0;
    let pageToken;
    do {
        const [files, nextQuery] = await bucket.getFiles(Object.assign({ prefix, maxResults: STORAGE_PAGE_SIZE, autoPaginate: false }, (pageToken ? { pageToken } : {})));
        files.forEach((file) => {
            if (!isOwnedJobAssetPath(prefix, file.name)) {
                throw new Error(`Refused unsafe job asset path: ${file.name}`);
            }
        });
        await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
        deletedAssets += files.length;
        pageToken = typeof (nextQuery === null || nextQuery === void 0 ? void 0 : nextQuery.pageToken) === 'string' && nextQuery.pageToken
            ? nextQuery.pageToken
            : undefined;
    } while (pageToken);
    return deletedAssets;
}
async function deleteJob(params) {
    const jobRef = firestore_2.db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`);
    const jobsRef = firestore_2.db.collection('users').doc(params.userId).collection('emoticonJobs');
    const proposedLockToken = (0, node_crypto_1.randomUUID)();
    const lockedJob = await firestore_2.db.runTransaction(async (transaction) => {
        const [jobSnapshot, childSnapshot, profileDependentSnapshot] = await Promise.all([
            transaction.get(jobRef),
            transaction.get(jobsRef.where('parentJobId', '==', params.jobId).limit(1)),
            transaction.get(jobsRef.where('profileJobId', '==', params.jobId).limit(1)),
        ]);
        if (!jobSnapshot.exists)
            return null;
        const job = jobSnapshot.data() || {};
        if (job.userId !== params.userId || (job.id && job.id !== params.jobId)) {
            throw new https_1.HttpsError('permission-denied', '이 작업의 소유권을 확인할 수 없습니다.');
        }
        if (typeof job.status !== 'string' || !TERMINAL_JOB_STATUSES.has(job.status)) {
            throw new https_1.HttpsError('failed-precondition', '진행 중인 작업은 삭제할 수 없습니다. 완료하거나 취소한 뒤 다시 시도해 주세요.');
        }
        if (!childSnapshot.empty || !profileDependentSnapshot.empty) {
            throw new https_1.HttpsError('failed-precondition', '이 결과를 바탕으로 만든 작업이 남아 있습니다. 파생 작업을 먼저 삭제해 주세요.');
        }
        const deletionLockToken = typeof job.deletionLockToken === 'string'
            ? job.deletionLockToken
            : proposedLockToken;
        transaction.update(jobRef, {
            deletionLocked: true,
            deletionLockToken,
            deletionLockedAt: job.deletionLockedAt || firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return Object.assign(Object.assign({}, job), { deletionLockToken });
    });
    if (!lockedJob) {
        return {
            jobId: params.jobId,
            deleted: false,
            deletedAssets: 0,
            unlinkedProjectItem: false,
            updatedBatch: false,
        };
    }
    const deletedAssets = await deleteOwnedJobAssets(params.userId, params.jobId);
    const projectId = typeof lockedJob.projectId === 'string' && SAFE_IDENTIFIER.test(lockedJob.projectId)
        ? lockedJob.projectId
        : null;
    const projectItemId = typeof lockedJob.projectItemId === 'string' && SAFE_IDENTIFIER.test(lockedJob.projectItemId)
        ? lockedJob.projectItemId
        : null;
    const batchId = typeof lockedJob.batchId === 'string' && SAFE_IDENTIFIER.test(lockedJob.batchId)
        ? lockedJob.batchId
        : null;
    const projectRef = projectId
        ? firestore_2.db.doc(`users/${params.userId}/emoticonProjects/${projectId}`)
        : null;
    const itemRef = projectRef && projectItemId
        ? projectRef.collection('items').doc(projectItemId)
        : null;
    const batchRef = batchId
        ? firestore_2.db.doc(`users/${params.userId}/emoticonBatches/${batchId}`)
        : null;
    return firestore_2.db.runTransaction(async (transaction) => {
        const refs = [jobRef, ...(projectRef ? [projectRef] : []), ...(itemRef ? [itemRef] : []), ...(batchRef ? [batchRef] : [])];
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        const currentJobSnapshot = snapshots[0];
        if (!currentJobSnapshot.exists) {
            return {
                jobId: params.jobId,
                deleted: false,
                deletedAssets,
                unlinkedProjectItem: false,
                updatedBatch: false,
            };
        }
        const currentJob = currentJobSnapshot.data() || {};
        if (currentJob.userId !== params.userId
            || currentJob.deletionLocked !== true
            || currentJob.deletionLockToken !== lockedJob.deletionLockToken
            || !TERMINAL_JOB_STATUSES.has(String(currentJob.status))) {
            throw new https_1.HttpsError('aborted', '작업 상태가 바뀌어 삭제를 중단했습니다. 다시 확인해 주세요.');
        }
        let snapshotIndex = 1;
        const projectSnapshot = projectRef ? snapshots[snapshotIndex++] : null;
        const itemSnapshot = itemRef ? snapshots[snapshotIndex++] : null;
        const batchSnapshot = batchRef ? snapshots[snapshotIndex] : null;
        let unlinkedProjectItem = false;
        let updatedBatch = false;
        if (itemRef && (itemSnapshot === null || itemSnapshot === void 0 ? void 0 : itemSnapshot.exists)) {
            const unlinked = unlinkDeletedJobFromProjectItem(itemSnapshot.data(), params.jobId);
            if (unlinked.changed) {
                unlinkedProjectItem = unlinked.currentResultRemoved;
                transaction.update(itemRef, Object.assign(Object.assign({ editHistory: unlinked.item.editHistory }, (unlinked.currentResultRemoved ? {
                    jobId: null,
                    generationStatus: 'planned',
                    validationErrors: [],
                    activeJobCreatedAtMs: firestore_1.FieldValue.delete(),
                } : {})), { revision: unlinked.item.revision, updatedAt: firestore_1.FieldValue.serverTimestamp() }));
            }
        }
        if (projectRef && (projectSnapshot === null || projectSnapshot === void 0 ? void 0 : projectSnapshot.exists)) {
            const project = projectSnapshot.data() || {};
            const embeddedItems = Array.isArray(project.items) ? project.items : [];
            let embeddedChanged = false;
            let embeddedCurrentRemoved = false;
            const nextItems = embeddedItems.map((item) => {
                const unlinked = unlinkDeletedJobFromProjectItem(item, params.jobId);
                embeddedChanged || (embeddedChanged = unlinked.changed);
                embeddedCurrentRemoved || (embeddedCurrentRemoved = unlinked.currentResultRemoved);
                return unlinked.item;
            });
            const profileJobRemoved = Boolean(project.character
                && typeof project.character === 'object'
                && project.character.profileJobId === params.jobId);
            if (embeddedChanged || unlinkedProjectItem || profileJobRemoved) {
                const nextStatus = (unlinkedProjectItem || embeddedCurrentRemoved)
                    ? project.status === 'draft' || project.status === 'generating'
                        ? project.status
                        : 'ready'
                    : project.status;
                transaction.update(projectRef, Object.assign(Object.assign(Object.assign({}, (embeddedChanged ? { items: nextItems } : {})), (profileJobRemoved ? { 'character.profileJobId': firestore_1.FieldValue.delete() } : {})), { status: nextStatus, revision: firestore_1.FieldValue.increment(1), updatedAt: firestore_1.FieldValue.serverTimestamp() }));
            }
        }
        if (batchRef && (batchSnapshot === null || batchSnapshot === void 0 ? void 0 : batchSnapshot.exists)) {
            const unlinkedBatch = unlinkDeletedJobFromBatch(batchSnapshot.data(), params.jobId);
            if (unlinkedBatch.changed) {
                updatedBatch = true;
                transaction.update(batchRef, {
                    items: unlinkedBatch.items,
                    executionJobIds: unlinkedBatch.executionJobIds,
                    executionSlotUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
        transaction.delete(jobRef);
        return {
            jobId: params.jobId,
            deleted: true,
            deletedAssets,
            unlinkedProjectItem,
            updatedBatch,
        };
    });
}
exports.deleteEmoticonJobSafely = (0, https_1.onCall)({
    region: REGION,
    timeoutSeconds: 180,
    memory: '512MiB',
    maxInstances: 10,
}, async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid || !isSafeFirebaseUid(uid)) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    await requireStudioAdmin(uid, (((_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) || {}));
    const input = (request.data || {});
    const jobId = parseJobId(input.jobId);
    try {
        return await deleteJob({ userId: uid, jobId });
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        logger.error('[EmoticonStudio] Job deletion failed.', { userId: uid, jobId, error });
        throw new https_1.HttpsError('unavailable', '작업 삭제를 안전하게 마치지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
});
//# sourceMappingURL=deleteJob.js.map