"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onEmoticonBatchJobWritten = exports.cancelEmoticonBatch = exports.retryFailedEmoticonBatchItems = exports.refreshEmoticonBatch = exports.finalizeEmoticonBatchEnqueue = exports.recordEmoticonBatchEnqueueResult = exports.createEmoticonBatch = void 0;
exports.claimEmoticonBatchExecutionSlot = claimEmoticonBatchExecutionSlot;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_3 = require("../firestore");
const releaseDeferredEmoticonJobs_1 = require("../triggers/releaseDeferredEmoticonJobs");
const batchContract_1 = require("./batchContract");
const schema_1 = require("./schema");
const REGION = 'asia-northeast3';
const ENQUEUE_ROUND_LEASE_MS = 10 * 60 * 1000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;
const ACTIVE_JOB_STATUSES = new Set([
    'queued',
    'analyzing',
    'generating',
    'validating',
    'animating',
    'rendering',
]);
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled']);
function parseSafeId(value, label) {
    if (typeof value !== 'string' || !SAFE_ID.test(value.trim())) {
        throw new https_1.HttpsError('invalid-argument', `${label} 번호가 올바르지 않습니다.`);
    }
    return value.trim();
}
function parseItemIds(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > batchContract_1.EMOTICON_BATCH_MAX_ITEMS) {
        throw new https_1.HttpsError('invalid-argument', '배치 항목은 1개 이상 64개 이하여야 합니다.');
    }
    const itemIds = value.map((itemId) => parseSafeId(itemId, '항목'));
    if (new Set(itemIds).size !== itemIds.length) {
        throw new https_1.HttpsError('invalid-argument', '배치 항목 번호는 중복될 수 없습니다.');
    }
    return itemIds;
}
function parseConcurrency(value) {
    if (typeof value !== 'number'
        || !Number.isInteger(value)
        || value < 1
        || value > batchContract_1.EMOTICON_BATCH_MAX_CONCURRENCY) {
        throw new https_1.HttpsError('invalid-argument', '동시 생성 수는 1개에서 3개 사이여야 합니다.');
    }
    return value;
}
function parseBoundedInteger(value, label, min, max) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new https_1.HttpsError('invalid-argument', `${label} 값이 올바르지 않습니다.`);
    }
    return value;
}
function parseEnqueueRoundFence(input) {
    return {
        enqueueRoundId: parseSafeId(input.enqueueRoundId, '등록 회차'),
        retryRound: parseBoundedInteger(input.retryRound, '재시도 회차', 0, 99),
    };
}
function itemMatchesEnqueueRound(batch, item, fence, attemptCount) {
    var _a, _b;
    const expectedAttempt = (_a = batch.enqueueItemAttempts) === null || _a === void 0 ? void 0 : _a[item.itemId];
    const expectedRevision = (_b = batch.enqueueItemRevisions) === null || _b === void 0 ? void 0 : _b[item.itemId];
    return batch.enqueueRoundId === fence.enqueueRoundId
        && batch.retryRound === fence.retryRound
        && item.enqueueRoundId === fence.enqueueRoundId
        && item.retryRound === fence.retryRound
        && expectedAttempt === item.attemptCount
        && expectedRevision === item.enqueueProjectItemRevision
        && (attemptCount === undefined || attemptCount === item.attemptCount);
}
function jobMatchesCurrentEnqueueRound(batch, item, job) {
    var _a;
    // Legacy batches remain readable/recoverable. Every newly opened round has
    // enqueueRoundId and therefore requires the complete three-part fence.
    if (!batch.enqueueRoundId)
        return true;
    return item.enqueueRoundId === batch.enqueueRoundId
        && item.retryRound === batch.retryRound
        && ((_a = batch.enqueueItemAttempts) === null || _a === void 0 ? void 0 : _a[item.itemId]) === item.attemptCount
        && job.batchEnqueueRoundId === batch.enqueueRoundId
        && job.batchRetryRound === batch.retryRound
        && job.batchItemAttemptCount === item.attemptCount
        && job.projectItemRevision === item.enqueueProjectItemRevision;
}
function cleanError(value, fallback) {
    if (typeof value !== 'string')
        return fallback;
    const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ');
    return (cleaned || fallback).slice(0, 240);
}
function timestampMillis(value) {
    if (value && typeof value === 'object' && 'toMillis' in value) {
        const toMillis = value.toMillis;
        if (typeof toMillis === 'function') {
            const millis = toMillis.call(value);
            if (typeof millis === 'number' && Number.isFinite(millis))
                return millis;
        }
    }
    return 0;
}
function batchDocument(userId, batchId) {
    return firestore_3.db.doc(`users/${userId}/emoticonBatches/${batchId}`);
}
function jobDocument(userId, jobId) {
    return firestore_3.db.doc(`users/${userId}/emoticonJobs/${jobId}`);
}
/**
 * Enforces the persisted batch concurrency limit at the server execution
 * boundary. A browser worker count only limits document creation; this slot is
 * what limits jobs that may enter the OpenRouter pipeline at the same time.
 */
async function claimEmoticonBatchExecutionSlot(params) {
    if (!params.batchId)
        return 'not-batched';
    if (!SAFE_ID.test(params.batchId)
        || !params.projectId
        || !SAFE_ID.test(params.projectId)
        || !params.projectItemId
        || !SAFE_ID.test(params.projectItemId)) {
        throw new Error('The batch execution target is invalid.');
    }
    const batchId = params.batchId;
    const projectId = params.projectId;
    const projectItemId = params.projectItemId;
    const batchRef = batchDocument(params.userId, batchId);
    const jobRef = jobDocument(params.userId, params.jobId);
    const projectRef = firestore_3.db.doc(`users/${params.userId}/emoticonProjects/${projectId}`);
    return firestore_3.db.runTransaction(async (transaction) => {
        const [batchSnapshot, jobSnapshot, projectSnapshot] = await Promise.all([
            transaction.get(batchRef),
            transaction.get(jobRef),
            transaction.get(projectRef),
        ]);
        const batch = parseBatchSnapshot(batchSnapshot);
        const job = jobSnapshot.data() || {};
        const project = projectSnapshot.data() || {};
        if (!jobSnapshot.exists
            || job.userId !== params.userId
            || job.batchId !== batchId
            || job.projectId !== projectId
            || job.projectItemId !== projectItemId)
            throw new Error('The batch execution job identity does not match.');
        if (batch.userId !== params.userId
            || batch.projectId !== projectId
            || !batch.itemIds.includes(projectItemId))
            throw new Error('The batch execution ownership boundary does not match.');
        const batchItem = batch.items.find((item) => item.itemId === projectItemId);
        if (!batchItem || !jobMatchesCurrentEnqueueRound(batch, batchItem, job)) {
            throw new Error('The batch execution enqueue round is stale.');
        }
        if (!projectSnapshot.exists
            || project.userId !== params.userId
            || project.deletionLocked === true
            || !Number.isInteger(project.revision)
            || batch.projectRevision !== project.revision
            || job.projectRevision !== project.revision)
            throw new Error('The batch project changed or is being deleted.');
        if (batch.cancelRequestedAt || !['preparing', 'running', 'deferred'].includes(batch.status)) {
            throw new Error('The batch is no longer accepting execution work.');
        }
        if (job.cancelRequestedAt || ['completed', 'failed', 'cancelled'].includes(String(job.status))) {
            throw new Error('The batch job is no longer active.');
        }
        const slot = (0, batchContract_1.resolveEmoticonBatchExecutionSlot)({
            executionJobIds: batch.executionJobIds,
            requestedConcurrency: batch.requestedConcurrency,
            jobId: params.jobId,
        });
        if (slot.outcome === 'held')
            return 'acquired';
        if (slot.outcome === 'deferred')
            return 'deferred';
        transaction.update(batchRef, {
            executionJobIds: slot.executionJobIds,
            executionSlotUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(jobRef, {
            batchExecutionSlotAcquiredAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return 'acquired';
    });
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
        firestore_3.db.collection('admins').doc(uid).get(),
        firestore_3.db.collection('userAccess').doc(uid).get(),
    ]);
    if (adminDoc.exists || (accessDoc.exists && ((_a = accessDoc.data()) === null || _a === void 0 ? void 0 : _a.role) === 'admin'))
        return;
    throw new https_1.HttpsError('permission-denied', '관리자만 이모티콘 배치를 관리할 수 있습니다.');
}
async function requireBatchAdmin(request) {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    await requireStudioAdmin(uid, ((_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) || {});
    return uid;
}
function parseBatchSnapshot(snapshot) {
    if (!snapshot.exists)
        throw new https_1.HttpsError('not-found', '배치 작업을 찾을 수 없습니다.');
    const parsed = schema_1.emoticonBatchSchema.safeParse(Object.assign({ id: snapshot.id }, snapshot.data()));
    if (!parsed.success) {
        throw new https_1.HttpsError('failed-precondition', '배치 작업 데이터가 손상되어 안전하게 처리할 수 없습니다.');
    }
    return parsed.data;
}
function aggregatePatch(batch, items) {
    const aggregate = (0, batchContract_1.deriveEmoticonBatchAggregate)(items, Boolean(batch.cancelRequestedAt));
    const hasStarted = items.some((item) => item.jobIds.length > 0);
    return Object.assign(Object.assign(Object.assign(Object.assign({ items, counts: aggregate.counts, progressPercent: aggregate.progressPercent, status: aggregate.status }, (hasStarted && !batch.startedAt ? { startedAt: firestore_1.FieldValue.serverTimestamp() } : {})), (aggregate.terminal && !batch.completedAt
        ? { completedAt: firestore_1.FieldValue.serverTimestamp() }
        : {})), (!aggregate.terminal && batch.completedAt
        ? { completedAt: firestore_1.FieldValue.delete() }
        : {})), { updatedAt: firestore_1.FieldValue.serverTimestamp() });
}
function sameItemState(left, right) {
    return left.status === right.status
        && left.progress === right.progress
        && left.currentJobId === right.currentJobId
        && left.enqueueError === right.enqueueError
        && left.jobError === right.jobError
        && left.deferredUntilMs === right.deferredUntilMs
        && left.enqueueRoundId === right.enqueueRoundId
        && left.retryRound === right.retryRound
        && left.jobIds.length === right.jobIds.length
        && left.jobIds.every((jobId, index) => jobId === right.jobIds[index]);
}
function jobForItem(batch, item, candidates) {
    if (item.currentJobId) {
        return candidates.find((candidate) => (candidate.id === item.currentJobId
            && jobMatchesCurrentEnqueueRound(batch, item, candidate.data))) || null;
    }
    return candidates
        .filter((candidate) => (!item.jobIds.includes(candidate.id)
        && jobMatchesCurrentEnqueueRound(batch, item, candidate.data)))
        .sort((left, right) => (timestampMillis(right.data.createdAt) - timestampMillis(left.data.createdAt)))[0] || null;
}
async function queryBatchJobs(userId, batchId) {
    const snapshot = await firestore_3.db.collection(`users/${userId}/emoticonJobs`)
        .where('batchId', '==', batchId)
        .limit(batchContract_1.EMOTICON_BATCH_MAX_ITEMS * 8)
        .get();
    return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
}
async function reconcileBatch(params) {
    const jobs = await queryBatchJobs(params.userId, params.batchId);
    const jobsByItem = new Map();
    jobs.forEach((job) => {
        if (job.data.userId !== params.userId || job.data.batchId !== params.batchId)
            return;
        const itemId = typeof job.data.projectItemId === 'string' ? job.data.projectItemId : '';
        if (!SAFE_ID.test(itemId))
            return;
        const current = jobsByItem.get(itemId) || [];
        current.push(job);
        jobsByItem.set(itemId, current);
    });
    const ref = batchDocument(params.userId, params.batchId);
    const applied = await firestore_3.db.runTransaction(async (transaction) => {
        var _a;
        const snapshot = await transaction.get(ref);
        const batch = parseBatchSnapshot(snapshot);
        if (batch.userId !== params.userId)
            throw new https_1.HttpsError('permission-denied', '배치 소유자가 일치하지 않습니다.');
        if (params.expectedRound
            && (batch.enqueueRoundId !== params.expectedRound.enqueueRoundId
                || batch.retryRound !== params.expectedRound.retryRound))
            return false;
        const projectItemRefs = batch.items.map((item) => firestore_3.db.doc(`users/${params.userId}/emoticonProjects/${batch.projectId}/items/${item.itemId}`));
        const [projectSnapshot, ...projectItemSnapshots] = await Promise.all([
            transaction.get(firestore_3.db.doc(`users/${params.userId}/emoticonProjects/${batch.projectId}`)),
            ...projectItemRefs.map((itemRef) => transaction.get(itemRef)),
        ]);
        const deletionStopping = !projectSnapshot.exists
            || ((_a = projectSnapshot.data()) === null || _a === void 0 ? void 0 : _a.deletionLocked) === true;
        const nowMs = Date.now();
        const expiredCurrentRound = Boolean(params.closeExpiredRound
            && batch.enqueueRoundId
            && typeof batch.enqueueRoundLeaseExpiresAtMs === 'number'
            && batch.enqueueRoundLeaseExpiresAtMs > 0
            && batch.enqueueRoundLeaseExpiresAtMs <= nowMs);
        const closingFence = params.expectedRound || (expiredCurrentRound && batch.enqueueRoundId
            ? { enqueueRoundId: batch.enqueueRoundId, retryRound: batch.retryRound }
            : undefined);
        const nextItems = batch.items.map((item, itemIndex) => {
            var _a, _b, _c, _d;
            const authoritativeJob = jobForItem(batch, item, jobsByItem.get(item.itemId) || []);
            if (authoritativeJob) {
                return (0, batchContract_1.mapJobToEmoticonBatchItemState)({
                    current: item,
                    jobId: authoritativeJob.id,
                    jobStatus: authoritativeJob.data.status,
                    jobProgress: authoritativeJob.data.progress,
                    deferredUntilMs: authoritativeJob.data.deferredUntilMs,
                    jobError: authoritativeJob.data.error,
                    nowMs,
                });
            }
            const closesExpectedRound = Boolean((params.closePending || expiredCurrentRound)
                && closingFence
                && itemMatchesEnqueueRound(batch, item, closingFence)
                && ((_a = projectItemSnapshots[itemIndex]) === null || _a === void 0 ? void 0 : _a.exists)
                && ((_b = projectItemSnapshots[itemIndex].data()) === null || _b === void 0 ? void 0 : _b.id) === item.itemId
                && ((_c = projectItemSnapshots[itemIndex].data()) === null || _c === void 0 ? void 0 : _c.revision)
                    === item.enqueueProjectItemRevision
                && ['planned', 'failed'].includes(String((_d = projectItemSnapshots[itemIndex].data()) === null || _d === void 0 ? void 0 : _d.generationStatus)));
            if ((closesExpectedRound || deletionStopping) && item.status === 'pending') {
                return Object.assign(Object.assign({}, item), { status: batch.cancelRequestedAt || deletionStopping
                        ? 'cancelled'
                        : 'not_enqueued', progress: 100, enqueueError: batch.cancelRequestedAt || deletionStopping ? null : params.pendingError, deferredUntilMs: null });
            }
            return item;
        });
        const aggregateBatch = deletionStopping && !batch.cancelRequestedAt
            ? Object.assign(Object.assign({}, batch), { cancelRequestedAt: true }) : batch;
        transaction.update(ref, Object.assign(Object.assign({}, aggregatePatch(aggregateBatch, nextItems)), (deletionStopping && !batch.cancelRequestedAt
            ? { cancelRequestedAt: firestore_1.FieldValue.serverTimestamp() }
            : {})));
        return true;
    });
    return { batch: parseBatchSnapshot(await ref.get()), applied };
}
exports.createEmoticonBatch = (0, https_1.onCall)({ region: REGION, timeoutSeconds: 60, memory: '256MiB', maxInstances: 20 }, async (request) => {
    const uid = await requireBatchAdmin(request);
    const input = (request.data || {});
    const batchId = parseSafeId(input.batchId, '배치');
    const projectId = parseSafeId(input.projectId, '프로젝트');
    const itemIds = parseItemIds(input.itemIds);
    const requestedConcurrency = parseConcurrency(input.requestedConcurrency);
    const ref = batchDocument(uid, batchId);
    const projectRef = firestore_3.db.doc(`users/${uid}/emoticonProjects/${projectId}`);
    const itemRefs = itemIds.map((itemId) => (firestore_3.db.doc(`users/${uid}/emoticonProjects/${projectId}/items/${itemId}`)));
    const proposedEnqueueRoundId = (0, node_crypto_1.randomUUID)();
    const enqueueRoundOpenedAtMs = Date.now();
    const enqueueRoundLeaseExpiresAtMs = enqueueRoundOpenedAtMs + ENQUEUE_ROUND_LEASE_MS;
    const created = await firestore_3.db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d;
        const [existing, projectSnapshot, ...itemSnapshots] = await Promise.all([
            transaction.get(ref),
            transaction.get(projectRef),
            ...itemRefs.map((itemRef) => transaction.get(itemRef)),
        ]);
        if (existing.exists) {
            const batch = parseBatchSnapshot(existing);
            const sameRequest = batch.userId === uid
                && batch.projectId === projectId
                && batch.requestedConcurrency === requestedConcurrency
                && batch.itemIds.length === itemIds.length
                && batch.itemIds.every((itemId, index) => itemId === itemIds[index]);
            if (!sameRequest)
                throw new https_1.HttpsError('already-exists', '같은 배치 번호가 다른 요청에 사용되었습니다.');
            if (batch.enqueueRoundId) {
                return {
                    enqueueRoundId: batch.enqueueRoundId,
                    retryRound: batch.retryRound,
                    items: batch.items.map((item) => ({
                        itemId: item.itemId,
                        attemptCount: item.attemptCount,
                    })),
                };
            }
            const canMigrateUnopenedLegacyBatch = batch.items.every((item) => (item.status === 'pending'
                && item.currentJobId === null
                && item.jobIds.length === 0)) && itemSnapshots.every((itemSnapshot) => {
                var _a, _b;
                return (itemSnapshot.exists
                    && Number.isInteger((_a = itemSnapshot.data()) === null || _a === void 0 ? void 0 : _a.revision)
                    && ['planned', 'failed'].includes(String((_b = itemSnapshot.data()) === null || _b === void 0 ? void 0 : _b.generationStatus)));
            });
            if (!canMigrateUnopenedLegacyBatch) {
                throw new https_1.HttpsError('failed-precondition', '이전 형식으로 이미 시작된 배치는 새 등록 회차로 다시 열 수 없습니다.');
            }
            const migratedItems = batch.items.map((item) => {
                var _a, _b;
                return (Object.assign(Object.assign({}, item), { enqueueRoundId: proposedEnqueueRoundId, retryRound: batch.retryRound, enqueueProjectItemRevision: Number(((_b = (_a = itemSnapshots[itemIds.indexOf(item.itemId)]) === null || _a === void 0 ? void 0 : _a.data()) === null || _b === void 0 ? void 0 : _b.revision) || 0) }));
            });
            const enqueueItemAttempts = Object.fromEntries(migratedItems.map((item) => [item.itemId, item.attemptCount]));
            const enqueueItemRevisions = Object.fromEntries(migratedItems.map((item) => [
                item.itemId,
                item.enqueueProjectItemRevision || 0,
            ]));
            transaction.update(ref, {
                items: migratedItems,
                enqueueRoundId: proposedEnqueueRoundId,
                enqueueItemAttempts,
                enqueueItemRevisions,
                enqueueRoundOpenedAtMs,
                enqueueRoundLeaseExpiresAtMs,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return {
                enqueueRoundId: proposedEnqueueRoundId,
                retryRound: batch.retryRound,
                items: migratedItems.map((item) => ({
                    itemId: item.itemId,
                    attemptCount: item.attemptCount,
                })),
            };
        }
        if (!projectSnapshot.exists || ((_a = projectSnapshot.data()) === null || _a === void 0 ? void 0 : _a.userId) !== uid) {
            throw new https_1.HttpsError('not-found', '프로젝트를 찾을 수 없습니다.');
        }
        if (((_b = projectSnapshot.data()) === null || _b === void 0 ? void 0 : _b.deletionLocked) === true) {
            throw new https_1.HttpsError('failed-precondition', '삭제가 진행 중인 프로젝트에는 배치를 만들 수 없습니다.');
        }
        itemSnapshots.forEach((snapshot, index) => {
            const item = snapshot.data();
            if (!snapshot.exists || !item) {
                throw new https_1.HttpsError('not-found', `${itemIds[index]} 항목을 찾을 수 없습니다.`);
            }
            if (!Number.isInteger(item.revision) || item.revision < 0) {
                throw new https_1.HttpsError('failed-precondition', '항목 버전 정보를 안전하게 확인하지 못했습니다.');
            }
            if (item.generationStatus !== 'planned' && item.generationStatus !== 'failed') {
                throw new https_1.HttpsError('failed-precondition', '완료되었거나 생성 중인 항목은 배치에 다시 넣을 수 없습니다.');
            }
        });
        const items = itemIds.map((itemId, index) => {
            var _a, _b;
            return ({
                itemId,
                status: 'pending',
                progress: 0,
                attemptCount: 1,
                enqueueRoundId: proposedEnqueueRoundId,
                retryRound: 0,
                enqueueProjectItemRevision: Number(((_b = (_a = itemSnapshots[index]) === null || _a === void 0 ? void 0 : _a.data()) === null || _b === void 0 ? void 0 : _b.revision) || 0),
                jobIds: [],
                currentJobId: null,
                enqueueError: null,
                jobError: null,
                deferredUntilMs: null,
            });
        });
        const aggregate = (0, batchContract_1.deriveEmoticonBatchAggregate)(items, false);
        transaction.create(ref, {
            id: batchId,
            userId: uid,
            projectId,
            projectRevision: Number.isInteger((_c = projectSnapshot.data()) === null || _c === void 0 ? void 0 : _c.revision)
                ? (_d = projectSnapshot.data()) === null || _d === void 0 ? void 0 : _d.revision
                : 0,
            itemIds,
            requestedConcurrency,
            executionJobIds: [],
            status: aggregate.status,
            progressPercent: aggregate.progressPercent,
            counts: aggregate.counts,
            items,
            retryRound: 0,
            enqueueRoundId: proposedEnqueueRoundId,
            enqueueItemAttempts: Object.fromEntries(itemIds.map((itemId) => [itemId, 1])),
            enqueueItemRevisions: Object.fromEntries(items.map((item) => [
                item.itemId,
                item.enqueueProjectItemRevision || 0,
            ])),
            enqueueRoundOpenedAtMs,
            enqueueRoundLeaseExpiresAtMs,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return {
            enqueueRoundId: proposedEnqueueRoundId,
            retryRound: 0,
            items: items.map((item) => ({ itemId: item.itemId, attemptCount: item.attemptCount })),
        };
    });
    return Object.assign({ batchId }, created);
});
exports.recordEmoticonBatchEnqueueResult = (0, https_1.onCall)({ region: REGION, timeoutSeconds: 60, memory: '256MiB', maxInstances: 40 }, async (request) => {
    const uid = await requireBatchAdmin(request);
    const input = (request.data || {});
    const batchId = parseSafeId(input.batchId, '배치');
    const itemId = parseSafeId(input.itemId, '항목');
    const fence = parseEnqueueRoundFence(input);
    const itemAttemptCount = parseBoundedInteger(input.itemAttemptCount, '항목 시도 횟수', 1, 8);
    const hasJob = typeof input.jobId === 'string' && input.jobId.trim().length > 0;
    const hasError = typeof input.enqueueError === 'string' && input.enqueueError.trim().length > 0;
    if (hasJob === hasError) {
        throw new https_1.HttpsError('invalid-argument', '작업 번호 또는 등록 오류 중 하나만 전달해야 합니다.');
    }
    const jobId = hasJob ? parseSafeId(input.jobId, '작업') : null;
    const ref = batchDocument(uid, batchId);
    const applied = await firestore_3.db.runTransaction(async (transaction) => {
        var _a;
        const refs = [ref, ...(jobId ? [jobDocument(uid, jobId)] : [])];
        const [batchSnapshot, jobSnapshot] = await Promise.all(refs.map((documentRef) => transaction.get(documentRef)));
        const batch = parseBatchSnapshot(batchSnapshot);
        const [projectSnapshot, projectItemSnapshot] = await Promise.all([
            transaction.get(firestore_3.db.doc(`users/${uid}/emoticonProjects/${batch.projectId}`)),
            transaction.get(firestore_3.db.doc(`users/${uid}/emoticonProjects/${batch.projectId}/items/${itemId}`)),
        ]);
        const deletionStopping = !projectSnapshot.exists
            || ((_a = projectSnapshot.data()) === null || _a === void 0 ? void 0 : _a.deletionLocked) === true;
        const itemIndex = batch.items.findIndex((item) => item.itemId === itemId);
        if (batch.userId !== uid || itemIndex < 0) {
            throw new https_1.HttpsError('permission-denied', '배치 항목 소유권을 확인할 수 없습니다.');
        }
        const current = batch.items[itemIndex];
        if (!itemMatchesEnqueueRound(batch, current, fence, itemAttemptCount))
            return false;
        let next;
        if (jobId) {
            const job = jobSnapshot === null || jobSnapshot === void 0 ? void 0 : jobSnapshot.data();
            if (!(jobSnapshot === null || jobSnapshot === void 0 ? void 0 : jobSnapshot.exists)
                || !job
                || job.userId !== uid
                || job.batchId !== batchId
                || job.projectId !== batch.projectId
                || job.projectItemId !== itemId
                || !jobMatchesCurrentEnqueueRound(batch, current, job)) {
                throw new https_1.HttpsError('failed-precondition', '배치와 연결된 작업을 확인할 수 없습니다.');
            }
            if (current.currentJobId && current.currentJobId !== jobId) {
                throw new https_1.HttpsError('already-exists', '이 항목에는 이미 다른 현재 작업이 연결되어 있습니다.');
            }
            next = (0, batchContract_1.mapJobToEmoticonBatchItemState)({
                current: current,
                jobId,
                jobStatus: job.status,
                jobProgress: job.progress,
                deferredUntilMs: job.deferredUntilMs,
                jobError: job.error,
            });
            if ((batch.cancelRequestedAt || deletionStopping)
                && ACTIVE_JOB_STATUSES.has(String(job.status))
                && !job.cancelRequestedAt) {
                transaction.update(jobSnapshot.ref, {
                    cancelRequestedAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
        else if (current.currentJobId || current.status !== 'pending') {
            next = current;
        }
        else {
            const projectItem = projectItemSnapshot.data() || {};
            if (!deletionStopping
                && (!projectItemSnapshot.exists
                    || projectItem.id !== itemId
                    || projectItem.revision !== current.enqueueProjectItemRevision
                    || !['planned', 'failed'].includes(String(projectItem.generationStatus))))
                return false;
            next = Object.assign(Object.assign({}, current), { status: batch.cancelRequestedAt || deletionStopping ? 'cancelled' : 'not_enqueued', progress: 100, enqueueError: batch.cancelRequestedAt || deletionStopping
                    ? null
                    : cleanError(input.enqueueError, '작업을 등록하지 못했습니다.'), deferredUntilMs: null });
        }
        if (sameItemState(current, next) && !deletionStopping)
            return true;
        const items = [...batch.items];
        items[itemIndex] = next;
        const aggregateBatch = deletionStopping && !batch.cancelRequestedAt
            ? Object.assign(Object.assign({}, batch), { cancelRequestedAt: true }) : batch;
        transaction.update(ref, Object.assign(Object.assign({}, aggregatePatch(aggregateBatch, items)), (deletionStopping && !batch.cancelRequestedAt
            ? { cancelRequestedAt: firestore_1.FieldValue.serverTimestamp() }
            : {})));
        return true;
    });
    return { batchId, itemId, applied };
});
exports.finalizeEmoticonBatchEnqueue = (0, https_1.onCall)({ region: REGION, timeoutSeconds: 60, memory: '256MiB', maxInstances: 20 }, async (request) => {
    const uid = await requireBatchAdmin(request);
    const input = (request.data || {});
    const batchId = parseSafeId(input.batchId, '배치');
    const fence = parseEnqueueRoundFence(input);
    const result = await reconcileBatch({
        userId: uid,
        batchId,
        closePending: true,
        pendingError: cleanError(input.enqueueError, '브라우저에서 작업 등록을 마치지 못했습니다.'),
        expectedRound: fence,
    });
    return {
        batchId,
        status: result.batch.status,
        counts: result.batch.counts,
        applied: result.applied,
    };
});
exports.refreshEmoticonBatch = (0, https_1.onCall)({ region: REGION, timeoutSeconds: 60, memory: '256MiB', maxInstances: 20 }, async (request) => {
    const uid = await requireBatchAdmin(request);
    const input = (request.data || {});
    const batchId = parseSafeId(input.batchId, '배치');
    const result = await reconcileBatch({
        userId: uid,
        batchId,
        // A normal refresh only reconciles authoritative jobs. It never
        // interprets `preparing` as permission to close pending work.
        closePending: false,
        closeExpiredRound: true,
        pendingError: '새로고침 전에 작업 등록이 끝나지 않았습니다. 실패 항목만 다시 시도해 주세요.',
    });
    return { batchId, status: result.batch.status, counts: result.batch.counts };
});
exports.retryFailedEmoticonBatchItems = (0, https_1.onCall)({ region: REGION, timeoutSeconds: 60, memory: '256MiB', maxInstances: 20 }, async (request) => {
    const uid = await requireBatchAdmin(request);
    const input = (request.data || {});
    const batchId = parseSafeId(input.batchId, '배치');
    const retryRequestId = parseSafeId(input.retryRequestId, '재시도 요청');
    const ref = batchDocument(uid, batchId);
    const proposedEnqueueRoundId = (0, node_crypto_1.randomUUID)();
    const enqueueRoundOpenedAtMs = Date.now();
    const enqueueRoundLeaseExpiresAtMs = enqueueRoundOpenedAtMs + ENQUEUE_ROUND_LEASE_MS;
    const retryResult = await firestore_3.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const batch = parseBatchSnapshot(snapshot);
        if (batch.userId !== uid)
            throw new https_1.HttpsError('permission-denied', '배치 소유자가 일치하지 않습니다.');
        // Firestore may invoke this callback more than once. All mutable
        // accumulators must therefore live inside the callback.
        const retryTargets = [];
        const skippedItems = [];
        const projectRef = firestore_3.db.doc(`users/${uid}/emoticonProjects/${batch.projectId}`);
        const itemRefs = batch.items.map((item) => (firestore_3.db.doc(`users/${uid}/emoticonProjects/${batch.projectId}/items/${item.itemId}`)));
        const retryCandidates = batch.items.filter((item) => ((item.status === 'failed' || item.status === 'not_enqueued')
            && item.attemptCount < 8));
        const candidateJobIds = [...new Set(retryCandidates
                .map((item) => item.currentJobId)
                .filter((jobId) => Boolean(jobId)))];
        const currentJobRefs = candidateJobIds.map((jobId) => jobDocument(uid, jobId));
        const relatedSnapshots = await Promise.all([
            transaction.get(projectRef),
            ...itemRefs.map((itemRef) => transaction.get(itemRef)),
            ...currentJobRefs.map((jobRef) => transaction.get(jobRef)),
        ]);
        const projectSnapshot = relatedSnapshots[0];
        const project = projectSnapshot.data() || {};
        if (!projectSnapshot.exists
            || project.userId !== uid
            || project.deletionLocked === true) {
            throw new https_1.HttpsError('failed-precondition', '삭제 중이거나 삭제된 프로젝트의 배치는 다시 시작할 수 없습니다.');
        }
        if (!Number.isInteger(project.revision)
            || project.revision < 0
            || project.id !== batch.projectId) {
            throw new https_1.HttpsError('failed-precondition', '프로젝트 버전 정보를 안전하게 확인하지 못했습니다.');
        }
        const projectRevision = project.revision;
        if (batch.cancelRequestedAt) {
            throw new https_1.HttpsError('failed-precondition', '취소를 요청한 배치는 다시 시작할 수 없습니다.');
        }
        const projectItems = new Map();
        const itemSnapshots = relatedSnapshots.slice(1, 1 + itemRefs.length);
        batch.items.forEach((batchItem, index) => {
            const itemSnapshot = itemSnapshots[index];
            const item = (itemSnapshot === null || itemSnapshot === void 0 ? void 0 : itemSnapshot.data()) || {};
            const itemJobId = item.jobId === null || item.jobId === undefined
                ? null
                : typeof item.jobId === 'string' && SAFE_ID.test(item.jobId)
                    ? item.jobId
                    : undefined;
            if (!(itemSnapshot === null || itemSnapshot === void 0 ? void 0 : itemSnapshot.exists)
                || item.id !== batchItem.itemId
                || !Number.isInteger(item.revision)
                || item.revision < 0
                || !['planned', 'queued', 'generating', 'completed', 'failed']
                    .includes(String(item.generationStatus))
                || itemJobId === undefined) {
                throw new https_1.HttpsError('failed-precondition', `프로젝트 항목 ${batchItem.itemId}의 현재 상태를 안전하게 확인하지 못했습니다.`);
            }
            projectItems.set(batchItem.itemId, {
                revision: item.revision,
                generationStatus: String(item.generationStatus),
                jobId: itemJobId,
            });
        });
        if (batch.lastRetryRequestId === retryRequestId) {
            if (batch.lastRetryProjectRevision === undefined
                || !batch.lastRetryTargets
                || !batch.lastRetrySkippedItems
                || !batch.lastRetryEnqueueRoundId) {
                throw new https_1.HttpsError('failed-precondition', '이전 형식의 재시도 요청입니다. 화면을 새로고침한 뒤 새 재시도를 시작해 주세요.');
            }
            return {
                projectId: batch.projectId,
                projectRevision: batch.lastRetryProjectRevision,
                retryRound: batch.retryRound,
                enqueueRoundId: batch.lastRetryEnqueueRoundId,
                itemIds: batch.lastRetryTargets.map((target) => target.itemId),
                items: batch.lastRetryTargets,
                skippedItems: batch.lastRetrySkippedItems,
                requestedConcurrency: batch.requestedConcurrency,
            };
        }
        const currentAggregate = (0, batchContract_1.deriveEmoticonBatchAggregate)(batch.items, Boolean(batch.cancelRequestedAt));
        if (!currentAggregate.terminal) {
            throw new https_1.HttpsError('failed-precondition', '실행 중인 항목이 모두 끝난 뒤 실패 항목을 다시 시도해 주세요.');
        }
        const currentJobSnapshots = relatedSnapshots.slice(1 + itemRefs.length);
        const currentJobs = new Map(currentJobSnapshots.map((jobSnapshot) => [jobSnapshot.id, jobSnapshot]));
        const retryCandidateIds = new Set(retryCandidates.map((item) => item.itemId));
        const candidateRetryRound = Math.min(99, batch.retryRound + 1);
        const nextItems = batch.items.map((batchItem) => {
            if (!retryCandidateIds.has(batchItem.itemId))
                return batchItem;
            const projectItem = projectItems.get(batchItem.itemId);
            if (!projectItem) {
                throw new https_1.HttpsError('failed-precondition', '배치 항목의 프로젝트 연결이 손상되었습니다.');
            }
            const batchJobId = batchItem.currentJobId;
            const projectJobId = projectItem.jobId;
            const currentJobSnapshot = batchJobId ? currentJobs.get(batchJobId) : undefined;
            const currentJob = (currentJobSnapshot === null || currentJobSnapshot === void 0 ? void 0 : currentJobSnapshot.data()) || null;
            const retryDisposition = (0, batchContract_1.resolveEmoticonBatchRetryDisposition)({
                batchCurrentJobId: batchJobId,
                projectCurrentJobId: projectJobId,
                projectGenerationStatus: projectItem.generationStatus,
                currentJobStatus: currentJob === null || currentJob === void 0 ? void 0 : currentJob.status,
            });
            if (retryDisposition === 'project_item_replaced') {
                skippedItems.push({
                    itemId: batchItem.itemId,
                    reason: 'project_item_replaced',
                    supersededByJobId: projectJobId,
                });
                return Object.assign(Object.assign({}, batchItem), { status: 'cancelled', progress: 100, currentJobId: null, enqueueError: null, jobError: null, deferredUntilMs: null });
            }
            if (batchJobId) {
                if (!(currentJobSnapshot === null || currentJobSnapshot === void 0 ? void 0 : currentJobSnapshot.exists)
                    || !currentJob
                    || currentJob.userId !== uid
                    || currentJob.batchId !== batchId
                    || currentJob.projectId !== batch.projectId
                    || currentJob.projectItemId !== batchItem.itemId
                    || !batchItem.jobIds.includes(batchJobId)
                    || (!ACTIVE_JOB_STATUSES.has(String(currentJob.status))
                        && !TERMINAL_JOB_STATUSES.has(String(currentJob.status)))) {
                    throw new https_1.HttpsError('failed-precondition', `배치 항목 ${batchItem.itemId}의 현재 작업 연결을 확인하지 못했습니다.`);
                }
            }
            if (retryDisposition === 'project_item_completed') {
                skippedItems.push({
                    itemId: batchItem.itemId,
                    reason: 'project_item_completed',
                    supersededByJobId: projectJobId,
                });
                return Object.assign(Object.assign({}, batchItem), { status: 'completed', progress: 100, enqueueError: null, jobError: null, deferredUntilMs: null });
            }
            if (retryDisposition === 'project_item_active') {
                throw new https_1.HttpsError('failed-precondition', `배치 항목 ${batchItem.itemId}에 아직 실행 중인 작업이 있습니다. 상태를 새로고침한 뒤 다시 시도해 주세요.`);
            }
            if (projectItem.generationStatus !== 'planned'
                && projectItem.generationStatus !== 'failed') {
                throw new https_1.HttpsError('failed-precondition', `배치 항목 ${batchItem.itemId}은 현재 재시도할 수 없는 상태입니다.`);
            }
            const attemptCount = Math.min(8, batchItem.attemptCount + 1);
            retryTargets.push({
                itemId: batchItem.itemId,
                itemRevision: projectItem.revision,
                attemptCount,
            });
            return Object.assign(Object.assign({}, batchItem), { status: 'pending', progress: 0, attemptCount, enqueueRoundId: proposedEnqueueRoundId, retryRound: candidateRetryRound, enqueueProjectItemRevision: projectItem.revision, currentJobId: null, enqueueError: null, jobError: null, deferredUntilMs: null });
        });
        if (!retryTargets.length && !skippedItems.length) {
            throw new https_1.HttpsError('failed-precondition', '다시 시도할 실패 항목이 없습니다.');
        }
        const activeExecutionJobIds = [...new Set(nextItems
                .filter((item) => ['queued', 'running', 'deferred'].includes(item.status))
                .map((item) => item.currentJobId)
                .filter((jobId) => Boolean(jobId)))];
        if (activeExecutionJobIds.length > batch.requestedConcurrency) {
            throw new https_1.HttpsError('failed-precondition', '현재 실행 중인 배치 작업 수가 동시 실행 한도를 초과해 안전하게 재시도할 수 없습니다.');
        }
        const retryRound = retryTargets.length
            ? Math.min(99, batch.retryRound + 1)
            : batch.retryRound;
        const enqueueRoundId = retryTargets.length
            ? proposedEnqueueRoundId
            : batch.enqueueRoundId || proposedEnqueueRoundId;
        const retryItemIds = retryTargets.map((target) => target.itemId);
        transaction.update(ref, Object.assign(Object.assign(Object.assign(Object.assign({}, aggregatePatch(batch, nextItems)), { projectRevision, executionJobIds: activeExecutionJobIds, executionSlotUpdatedAt: firestore_1.FieldValue.serverTimestamp(), retryRound }), (retryTargets.length
            ? {
                enqueueRoundId,
                enqueueItemAttempts: Object.fromEntries(retryTargets.map((target) => [
                    target.itemId,
                    target.attemptCount,
                ])),
                enqueueItemRevisions: Object.fromEntries(retryTargets.map((target) => [
                    target.itemId,
                    target.itemRevision,
                ])),
                enqueueRoundOpenedAtMs,
                enqueueRoundLeaseExpiresAtMs,
            }
            : {})), { lastRetryRequestId: retryRequestId, lastRetryItemIds: retryItemIds, lastRetryProjectRevision: projectRevision, lastRetryTargets: retryTargets, lastRetrySkippedItems: skippedItems, lastRetryEnqueueRoundId: enqueueRoundId }));
        return {
            projectId: batch.projectId,
            projectRevision,
            retryRound,
            enqueueRoundId,
            itemIds: retryItemIds,
            items: retryTargets,
            skippedItems,
            requestedConcurrency: batch.requestedConcurrency,
        };
    });
    return Object.assign({ batchId }, retryResult);
});
exports.cancelEmoticonBatch = (0, https_1.onCall)({ region: REGION, timeoutSeconds: 60, memory: '256MiB', maxInstances: 20 }, async (request) => {
    const uid = await requireBatchAdmin(request);
    const input = (request.data || {});
    const batchId = parseSafeId(input.batchId, '배치');
    const queriedJobs = await queryBatchJobs(uid, batchId);
    const latestByItem = new Map();
    queriedJobs.forEach((job) => {
        const itemId = typeof job.data.projectItemId === 'string' ? job.data.projectItemId : '';
        const previous = latestByItem.get(itemId);
        if (!previous || timestampMillis(job.data.createdAt) >= timestampMillis(previous.data.createdAt)) {
            latestByItem.set(itemId, job);
        }
    });
    const ref = batchDocument(uid, batchId);
    let requested = 0;
    await firestore_3.db.runTransaction(async (transaction) => {
        let transactionRequested = 0;
        const batchSnapshot = await transaction.get(ref);
        const batch = parseBatchSnapshot(batchSnapshot);
        if (batch.userId !== uid)
            throw new https_1.HttpsError('permission-denied', '배치 소유자가 일치하지 않습니다.');
        const jobIds = new Set();
        batch.items.forEach((item) => {
            if (item.currentJobId)
                jobIds.add(item.currentJobId);
            const latest = latestByItem.get(item.itemId);
            if (latest)
                jobIds.add(latest.id);
        });
        const jobSnapshots = await Promise.all([...jobIds].map((jobId) => transaction.get(jobDocument(uid, jobId))));
        const jobs = new Map(jobSnapshots.map((snapshot) => [snapshot.id, snapshot]));
        const items = batch.items.map((item) => {
            var _a;
            const candidateId = item.currentJobId || ((_a = latestByItem.get(item.itemId)) === null || _a === void 0 ? void 0 : _a.id) || null;
            const snapshot = candidateId ? jobs.get(candidateId) : undefined;
            const job = snapshot === null || snapshot === void 0 ? void 0 : snapshot.data();
            if ((snapshot === null || snapshot === void 0 ? void 0 : snapshot.exists)
                && (job === null || job === void 0 ? void 0 : job.batchId) === batchId
                && job.projectItemId === item.itemId
                && jobMatchesCurrentEnqueueRound(batch, item, job)
                && ACTIVE_JOB_STATUSES.has(String(job.status))) {
                if (!job.cancelRequestedAt) {
                    transaction.update(snapshot.ref, {
                        cancelRequestedAt: firestore_1.FieldValue.serverTimestamp(),
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    transactionRequested += 1;
                }
                return (0, batchContract_1.mapJobToEmoticonBatchItemState)({
                    current: item,
                    jobId: snapshot.id,
                    jobStatus: job.status,
                    jobProgress: job.progress,
                    deferredUntilMs: job.deferredUntilMs,
                    jobError: job.error,
                });
            }
            return item.status === 'pending'
                ? Object.assign(Object.assign({}, item), { status: 'cancelled', progress: 100, enqueueError: null }) : item;
        });
        const cancelledBatch = Object.assign(Object.assign({}, batch), { cancelRequestedAt: batch.cancelRequestedAt || true });
        transaction.update(ref, Object.assign(Object.assign({}, aggregatePatch(cancelledBatch, items)), (!batch.cancelRequestedAt ? { cancelRequestedAt: firestore_1.FieldValue.serverTimestamp() } : {})));
        requested = transactionRequested;
    });
    return { batchId, cancellationRequests: requested };
});
exports.onEmoticonBatchJobWritten = (0, firestore_2.onDocumentWritten)({
    document: 'users/{userId}/emoticonJobs/{jobId}',
    database: firestore_3.FIRESTORE_DATABASE_ID,
    region: REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
    retry: true,
}, async (event) => {
    var _a;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!(after === null || after === void 0 ? void 0 : after.exists))
        return;
    const job = after.data();
    if (!job)
        return;
    const userId = event.params.userId;
    const jobId = event.params.jobId;
    const batchId = typeof job.batchId === 'string' && SAFE_ID.test(job.batchId) ? job.batchId : '';
    const itemId = typeof job.projectItemId === 'string' && SAFE_ID.test(job.projectItemId)
        ? job.projectItemId
        : '';
    const projectId = typeof job.projectId === 'string' && SAFE_ID.test(job.projectId)
        ? job.projectId
        : '';
    if (!batchId || !itemId || !projectId || job.userId !== userId)
        return;
    const batchRef = batchDocument(userId, batchId);
    const jobRef = jobDocument(userId, jobId);
    const projectRef = firestore_3.db.doc(`users/${userId}/emoticonProjects/${projectId}`);
    const releasedExecutionSlot = await firestore_3.db.runTransaction(async (transaction) => {
        var _a;
        const [batchSnapshot, jobSnapshot, projectSnapshot] = await Promise.all([
            transaction.get(batchRef),
            transaction.get(jobRef),
            transaction.get(projectRef),
        ]);
        if (!batchSnapshot.exists || !jobSnapshot.exists)
            return false;
        const batch = parseBatchSnapshot(batchSnapshot);
        const latestJob = jobSnapshot.data() || {};
        if (batch.userId !== userId
            || latestJob.batchId !== batchId
            || latestJob.projectItemId !== itemId)
            return false;
        const releasesExecutionSlot = TERMINAL_JOB_STATUSES.has(String(latestJob.status))
            && batch.executionJobIds.includes(jobId);
        const releasedExecutionJobIds = releasesExecutionSlot
            ? (0, batchContract_1.releaseEmoticonBatchExecutionSlot)(batch.executionJobIds, jobId)
            : batch.executionJobIds;
        const releaseExecutionSlot = () => transaction.update(batchRef, {
            executionJobIds: releasedExecutionJobIds,
            executionSlotUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const itemIndex = batch.items.findIndex((item) => item.itemId === itemId);
        if (itemIndex < 0) {
            if (releasesExecutionSlot)
                releaseExecutionSlot();
            return releasesExecutionSlot;
        }
        const current = batch.items[itemIndex];
        if (!jobMatchesCurrentEnqueueRound(batch, current, latestJob)) {
            if (releasesExecutionSlot)
                releaseExecutionSlot();
            return releasesExecutionSlot;
        }
        if ((current.currentJobId && current.currentJobId !== jobId)
            || (!current.currentJobId && current.jobIds.includes(jobId))) {
            if (releasesExecutionSlot)
                releaseExecutionSlot();
            return releasesExecutionSlot;
        }
        const next = (0, batchContract_1.mapJobToEmoticonBatchItemState)({
            current: current,
            jobId,
            jobStatus: latestJob.status,
            jobProgress: latestJob.progress,
            deferredUntilMs: latestJob.deferredUntilMs,
            jobError: latestJob.error,
        });
        const deletionStopping = !projectSnapshot.exists
            || ((_a = projectSnapshot.data()) === null || _a === void 0 ? void 0 : _a.deletionLocked) === true;
        if ((batch.cancelRequestedAt || deletionStopping)
            && ACTIVE_JOB_STATUSES.has(String(latestJob.status))
            && !latestJob.cancelRequestedAt) {
            transaction.update(jobRef, {
                cancelRequestedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        if (sameItemState(current, next) && !deletionStopping && !releasesExecutionSlot) {
            return false;
        }
        const items = deletionStopping
            ? batch.items.map((item) => item.status === 'pending'
                ? Object.assign(Object.assign({}, item), { status: 'cancelled', progress: 100, enqueueError: null }) : item)
            : [...batch.items];
        items[itemIndex] = next;
        const aggregateBatch = deletionStopping && !batch.cancelRequestedAt
            ? Object.assign(Object.assign({}, batch), { cancelRequestedAt: true }) : batch;
        transaction.update(batchRef, Object.assign(Object.assign(Object.assign({}, aggregatePatch(aggregateBatch, items)), (releasesExecutionSlot
            ? {
                executionJobIds: releasedExecutionJobIds,
                executionSlotUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
            }
            : {})), (deletionStopping && !batch.cancelRequestedAt
            ? { cancelRequestedAt: firestore_1.FieldValue.serverTimestamp() }
            : {})));
        return releasesExecutionSlot;
    });
    if (releasedExecutionSlot) {
        await (0, releaseDeferredEmoticonJobs_1.wakeNextDeferredEmoticonBatchJob)({ userId, batchId }).catch((error) => {
            // The minute scheduler remains the fallback if this latency optimization fails.
            logger.warn('[EmoticonStudio] Immediate batch slot wake-up failed.', {
                userId,
                batchId,
                terminalJobId: jobId,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }
});
//# sourceMappingURL=batches.js.map