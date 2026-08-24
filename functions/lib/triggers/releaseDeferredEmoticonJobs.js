"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseDeferredEmoticonJobs = void 0;
exports.wakeNextDeferredEmoticonBatchJob = wakeNextDeferredEmoticonBatchJob;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const batchContract_1 = require("../emoticonStudio/batchContract");
const schema_1 = require("../emoticonStudio/schema");
const firestore_2 = require("../firestore");
const QUEUE_COLLECTION = 'emoticonStudioDeferredJobs';
const RELEASE_BATCH_SIZE = 200;
const RUN_LEASE_MS = 11 * 60 * 1000;
const QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETIRED_EXECUTE_AT_MS = Number.MAX_SAFE_INTEGER;
const BATCH_SLOT_RETRY_MS = 60000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;
function continuationStage(mode) {
    if (mode === 'rerender')
        return 'static-render';
    if (mode === 'repair_frame')
        return 'repair-generation';
    return 'analysis';
}
function jobStatus(stage) {
    if (stage === 'static-render')
        return 'rendering';
    if (stage === 'repair-generation')
        return 'generating';
    return 'analyzing';
}
async function releaseDeferredQueueDocument(params) {
    const { queueRef, nowMs, immediateBatchWake } = params;
    return firestore_2.db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const queueSnapshot = await transaction.get(queueRef);
        if (!queueSnapshot.exists)
            return 'ignored';
        const queued = queueSnapshot.data() || {};
        if (queued.status !== 'queued' || typeof queued.executeAtMs !== 'number') {
            return 'ignored';
        }
        const userId = typeof queued.userId === 'string' ? queued.userId : '';
        const jobId = typeof queued.jobId === 'string' ? queued.jobId : '';
        if (immediateBatchWake
            && (queued.reason !== 'batch_concurrency'
                || userId !== immediateBatchWake.userId
                || (typeof queued.batchId === 'string'
                    && queued.batchId !== immediateBatchWake.batchId)))
            return 'ignored';
        if (queued.executeAtMs > nowMs && !immediateBatchWake)
            return 'ignored';
        if (!userId || !jobId) {
            transaction.update(queueRef, {
                status: 'invalid',
                executeAtMs: RETIRED_EXECUTE_AT_MS,
                expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return 'retired';
        }
        const jobRef = firestore_2.db.doc(`users/${userId}/emoticonJobs/${jobId}`);
        const jobSnapshot = await transaction.get(jobRef);
        if (!jobSnapshot.exists) {
            transaction.update(queueRef, {
                status: 'stale',
                executeAtMs: RETIRED_EXECUTE_AT_MS,
                expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return 'retired';
        }
        const job = jobSnapshot.data() || {};
        if (immediateBatchWake
            && (job.userId !== immediateBatchWake.userId
                || job.batchId !== immediateBatchWake.batchId))
            return 'ignored';
        const queueIdentityMismatch = (typeof queued.batchId === 'string'
            && queued.batchId.length > 0
            && queued.batchId !== job.batchId) || (typeof queued.projectId === 'string'
            && queued.projectId.length > 0
            && queued.projectId !== job.projectId) || (typeof queued.projectItemId === 'string'
            && queued.projectItemId.length > 0
            && queued.projectItemId !== job.projectItemId);
        if (queueIdentityMismatch) {
            transaction.update(queueRef, {
                status: 'invalid',
                executeAtMs: RETIRED_EXECUTE_AT_MS,
                expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return 'retired';
        }
        const projectRef = typeof job.projectId === 'string'
            ? firestore_2.db.doc(`users/${userId}/emoticonProjects/${job.projectId}`)
            : null;
        const itemRef = typeof job.projectId === 'string' && typeof job.projectItemId === 'string'
            ? firestore_2.db.doc(`users/${userId}/emoticonProjects/${job.projectId}/items/${job.projectItemId}`)
            : null;
        const batchRef = typeof job.batchId === 'string' && SAFE_ID.test(job.batchId)
            ? firestore_2.db.doc(`users/${userId}/emoticonBatches/${job.batchId}`)
            : null;
        const [projectSnapshot, itemSnapshot, batchSnapshot] = await Promise.all([
            projectRef ? transaction.get(projectRef) : Promise.resolve(null),
            itemRef ? transaction.get(itemRef) : Promise.resolve(null),
            batchRef ? transaction.get(batchRef) : Promise.resolve(null),
        ]);
        const deletionStopping = Boolean(projectRef
            && (!(projectSnapshot === null || projectSnapshot === void 0 ? void 0 : projectSnapshot.exists) || ((_a = projectSnapshot.data()) === null || _a === void 0 ? void 0 : _a.deletionLocked) === true));
        if (job.userId !== userId
            || job.status === 'completed'
            || job.status === 'failed'
            || job.status === 'cancelled'
            || job.cancelRequestedAt) {
            transaction.update(queueRef, {
                status: job.cancelRequestedAt || job.status === 'cancelled' ? 'cancelled' : 'stale',
                executeAtMs: RETIRED_EXECUTE_AT_MS,
                expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return 'retired';
        }
        if (deletionStopping) {
            transaction.update(jobRef, {
                status: 'cancelled',
                progress: typeof job.progress === 'number' ? job.progress : 0,
                statusMessage: '프로젝트 삭제가 진행되어 예약 작업을 시작하지 않았어요.',
                error: null,
                resumeAvailable: false,
                deferredUntilMs: null,
                cancelledAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            if (itemRef
                && (itemSnapshot === null || itemSnapshot === void 0 ? void 0 : itemSnapshot.exists)
                && ((_b = itemSnapshot.data()) === null || _b === void 0 ? void 0 : _b.jobId) === jobId) {
                transaction.update(itemRef, {
                    generationStatus: 'planned',
                    serverRevision: firestore_1.FieldValue.increment(1),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            transaction.update(queueRef, {
                status: 'cancelled',
                executeAtMs: RETIRED_EXECUTE_AT_MS,
                expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return 'retired';
        }
        const existingContinuation = job.frameContinuation
            && typeof job.frameContinuation === 'object'
            ? job.frameContinuation
            : null;
        if (existingContinuation
            && ['queued', 'running'].includes(String(existingContinuation.state))) {
            transaction.update(queueRef, {
                status: 'stale',
                executeAtMs: RETIRED_EXECUTE_AT_MS,
                expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return 'retired';
        }
        const hasBatchLink = typeof job.batchId === 'string' && job.batchId.length > 0;
        const parsedBatch = (batchSnapshot === null || batchSnapshot === void 0 ? void 0 : batchSnapshot.exists)
            ? schema_1.emoticonBatchSchema.safeParse(Object.assign(Object.assign({}, (batchSnapshot.data() || {})), { id: batchSnapshot.id }))
            : null;
        const batch = (parsedBatch === null || parsedBatch === void 0 ? void 0 : parsedBatch.success) ? parsedBatch.data : null;
        let acquiredNewBatchSlot = false;
        if (hasBatchLink) {
            const currentProjectRevision = (_c = projectSnapshot === null || projectSnapshot === void 0 ? void 0 : projectSnapshot.data()) === null || _c === void 0 ? void 0 : _c.revision;
            const batchItem = batch === null || batch === void 0 ? void 0 : batch.items.find((candidate) => (candidate.itemId === job.projectItemId));
            const validBatchLink = Boolean(batchRef
                && batch
                && batch.userId === userId
                && batch.projectId === job.projectId
                && batch.itemIds.includes(String(job.projectItemId || ''))
                && Number.isInteger(currentProjectRevision)
                && batch.projectRevision === currentProjectRevision
                && job.projectRevision === currentProjectRevision
                && (itemSnapshot === null || itemSnapshot === void 0 ? void 0 : itemSnapshot.exists)
                && ((_d = itemSnapshot.data()) === null || _d === void 0 ? void 0 : _d.jobId) === jobId
                && ['queued', 'generating'].includes(String((_e = itemSnapshot.data()) === null || _e === void 0 ? void 0 : _e.generationStatus))
                && batchItem
                && (!batch.enqueueRoundId
                    || (batchItem.enqueueRoundId === batch.enqueueRoundId
                        && batchItem.retryRound === batch.retryRound
                        && ((_f = batch.enqueueItemAttempts) === null || _f === void 0 ? void 0 : _f[batchItem.itemId])
                            === batchItem.attemptCount
                        && ((_g = batch.enqueueItemRevisions) === null || _g === void 0 ? void 0 : _g[batchItem.itemId])
                            === batchItem.enqueueProjectItemRevision
                        && job.batchEnqueueRoundId === batch.enqueueRoundId
                        && job.batchRetryRound === batch.retryRound
                        && job.batchItemAttemptCount === batchItem.attemptCount
                        && job.projectItemRevision
                            === batchItem.enqueueProjectItemRevision)));
            const stoppedBatch = Boolean(batch
                && (batch.cancelRequestedAt
                    || !['preparing', 'running', 'deferred'].includes(batch.status)));
            if (!validBatchLink || stoppedBatch) {
                const cancelled = stoppedBatch;
                transaction.update(jobRef, Object.assign(Object.assign({ status: cancelled ? 'cancelled' : 'failed', progress: 100, statusMessage: cancelled
                        ? '배치가 취소되어 예약 작업을 시작하지 않았어요.'
                        : '배치 또는 프로젝트 설정이 변경되어 예약 작업을 안전하게 중단했어요.', error: cancelled ? null : '배치 실행 경계가 더 이상 유효하지 않습니다.', resumeAvailable: false, deferredUntilMs: null }, (cancelled
                    ? { cancelledAt: firestore_1.FieldValue.serverTimestamp() }
                    : { failedAt: firestore_1.FieldValue.serverTimestamp() })), { updatedAt: firestore_1.FieldValue.serverTimestamp() }));
                if (itemRef
                    && (itemSnapshot === null || itemSnapshot === void 0 ? void 0 : itemSnapshot.exists)
                    && ((_h = itemSnapshot.data()) === null || _h === void 0 ? void 0 : _h.jobId) === jobId) {
                    transaction.update(itemRef, Object.assign(Object.assign({ generationStatus: cancelled ? 'planned' : 'failed' }, (cancelled
                        ? {}
                        : { validationErrors: ['배치 또는 프로젝트 설정이 변경되었습니다.'] })), { serverRevision: firestore_1.FieldValue.increment(1), updatedAt: firestore_1.FieldValue.serverTimestamp() }));
                }
                transaction.update(queueRef, {
                    status: cancelled ? 'cancelled' : 'invalid',
                    executeAtMs: RETIRED_EXECUTE_AT_MS,
                    expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                return 'retired';
            }
            const slot = (0, batchContract_1.resolveEmoticonBatchExecutionSlot)({
                executionJobIds: batch.executionJobIds,
                requestedConcurrency: batch.requestedConcurrency,
                jobId,
            });
            if (slot.outcome === 'deferred') {
                const nextExecuteAtMs = nowMs + BATCH_SLOT_RETRY_MS;
                transaction.update(queueRef, {
                    reason: 'batch_concurrency',
                    executeAtMs: nextExecuteAtMs,
                    expiresAt: admin.firestore.Timestamp.fromMillis(nextExecuteAtMs + QUEUE_TTL_MS),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                transaction.update(jobRef, {
                    status: 'queued',
                    statusMessage: '선택한 동시 실행 수에 맞춰 대기 중이에요. 앞 작업이 끝나면 자동으로 시작합니다.',
                    deferredUntilMs: nextExecuteAtMs,
                    generationRunLeaseExpiresAtMs: nextExecuteAtMs + RUN_LEASE_MS,
                    resumeAvailable: false,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                return 'deferred';
            }
            if (slot.outcome === 'acquired') {
                transaction.update(batchRef, {
                    executionJobIds: slot.executionJobIds,
                    executionSlotUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                acquiredNewBatchSlot = true;
            }
        }
        const runToken = typeof job.generationRunToken === 'string'
            ? job.generationRunToken
            : (0, node_crypto_1.randomUUID)();
        const token = (0, node_crypto_1.randomUUID)();
        const stage = continuationStage(job.mode);
        const continuationRef = firestore_2.db.collection('emoticonStudioContinuations').doc(token);
        const persistedState = {
            stage,
            retryCount: 0,
            state: 'queued',
            token,
            requestedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        transaction.create(continuationRef, {
            userId,
            jobId,
            token,
            runToken,
            status: 'queued',
            stage,
            deferredRelease: true,
            expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(jobRef, Object.assign(Object.assign({ generationRunToken: runToken, generationRunLeaseExpiresAtMs: nowMs + RUN_LEASE_MS, status: jobStatus(stage), statusMessage: '예약된 순서가 되어 작업을 시작했어요.', frameContinuation: persistedState, deferredUntilMs: null, resumeAvailable: true }, (acquiredNewBatchSlot
            ? { batchExecutionSlotAcquiredAt: firestore_1.FieldValue.serverTimestamp() }
            : {})), { updatedAt: firestore_1.FieldValue.serverTimestamp() }));
        if (itemRef
            && (itemSnapshot === null || itemSnapshot === void 0 ? void 0 : itemSnapshot.exists)
            && ((_j = itemSnapshot.data()) === null || _j === void 0 ? void 0 : _j.jobId) === jobId
            && ['queued', 'generating'].includes(String((_k = itemSnapshot.data()) === null || _k === void 0 ? void 0 : _k.generationStatus))) {
            const serverRevision = typeof ((_l = itemSnapshot.data()) === null || _l === void 0 ? void 0 : _l.serverRevision) === 'number'
                ? itemSnapshot.data().serverRevision + 1
                : 1;
            transaction.update(itemRef, {
                generationStatus: 'generating',
                serverRevision,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        transaction.update(queueRef, {
            status: 'released',
            continuationToken: token,
            executeAtMs: RETIRED_EXECUTE_AT_MS,
            releasedAt: firestore_1.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return 'released';
    });
}
function deferredQueueDocumentId(userId, jobId) {
    return (0, node_crypto_1.createHash)('sha256').update(`${userId}:${jobId}`).digest('hex');
}
/**
 * Tries the batch's known queued jobs in stable item order. Direct queue reads
 * avoid a collection scan and keep simultaneous terminal triggers idempotent:
 * the queue document and execution-slot claim are changed in one transaction.
 */
async function wakeNextDeferredEmoticonBatchJob(params) {
    var _a;
    if (!params.userId
        || params.userId.includes('/')
        || !SAFE_ID.test(params.batchId))
        return 'ignored';
    let requestedCandidateJobIds = params.candidateJobIds;
    if (!requestedCandidateJobIds) {
        const batchSnapshot = await firestore_2.db.doc(`users/${params.userId}/emoticonBatches/${params.batchId}`).get();
        const parsedBatch = batchSnapshot.exists
            ? schema_1.emoticonBatchSchema.safeParse(Object.assign(Object.assign({}, (batchSnapshot.data() || {})), { id: batchSnapshot.id }))
            : null;
        if (!(parsedBatch === null || parsedBatch === void 0 ? void 0 : parsedBatch.success)
            || parsedBatch.data.userId !== params.userId
            || parsedBatch.data.cancelRequestedAt
            || !['preparing', 'running', 'deferred'].includes(parsedBatch.data.status))
            return 'ignored';
        const executionJobIds = new Set(parsedBatch.data.executionJobIds);
        requestedCandidateJobIds = parsedBatch.data.items
            .filter((item) => (item.currentJobId
            && !executionJobIds.has(item.currentJobId)
            && !['completed', 'failed', 'cancelled', 'not_enqueued'].includes(item.status)))
            .map((item) => item.currentJobId);
    }
    const candidateJobIds = [...new Set(requestedCandidateJobIds)]
        .filter((jobId) => SAFE_ID.test(jobId))
        .slice(0, 64);
    let retiredAny = false;
    for (const jobId of candidateJobIds) {
        const outcome = await releaseDeferredQueueDocument({
            queueRef: firestore_2.db.collection(QUEUE_COLLECTION).doc(deferredQueueDocumentId(params.userId, jobId)),
            nowMs: (_a = params.nowMs) !== null && _a !== void 0 ? _a : Date.now(),
            immediateBatchWake: {
                userId: params.userId,
                batchId: params.batchId,
            },
        });
        if (outcome === 'released' || outcome === 'deferred')
            return outcome;
        if (outcome === 'retired')
            retiredAny = true;
    }
    return retiredAny ? 'retired' : 'ignored';
}
exports.releaseDeferredEmoticonJobs = (0, scheduler_1.onSchedule)({
    schedule: '* * * * *',
    timeZone: 'UTC',
    region: 'asia-northeast3',
    timeoutSeconds: 120,
    memory: '256MiB',
    retryCount: 2,
}, async () => {
    const nowMs = Date.now();
    const dueSnapshot = await firestore_2.db.collection(QUEUE_COLLECTION)
        .where('executeAtMs', '<=', nowMs)
        .limit(RELEASE_BATCH_SIZE)
        .get();
    let released = 0;
    let retired = 0;
    let deferred = 0;
    for (const queuedDocument of dueSnapshot.docs) {
        const outcome = await releaseDeferredQueueDocument({
            queueRef: queuedDocument.ref,
            nowMs,
        });
        if (outcome === 'released')
            released += 1;
        if (outcome === 'retired')
            retired += 1;
        if (outcome === 'deferred')
            deferred += 1;
    }
    logger.info('[EmoticonStudio] Deferred queue release completed.', {
        inspected: dueSnapshot.size,
        released,
        retired,
        deferred,
    });
});
//# sourceMappingURL=releaseDeferredEmoticonJobs.js.map