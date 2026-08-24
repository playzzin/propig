"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOTICON_MAX_RECOVERY_ATTEMPTS = exports.EMOTICON_STALLED_RUN_RECOVERY_MS = exports.EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS = exports.EMOTICON_INITIAL_RUN_LEASE_MS = void 0;
exports.recoverStalledEmoticonJobInPlace = recoverStalledEmoticonJobInPlace;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("../firestore");
const batchContract_1 = require("./batchContract");
const rateLimits_1 = require("./rateLimits");
const schema_1 = require("./schema");
const recoveryPolicy_1 = require("./recoveryPolicy");
exports.EMOTICON_INITIAL_RUN_LEASE_MS = 11 * 60 * 1000;
exports.EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS = 90 * 1000;
exports.EMOTICON_STALLED_RUN_RECOVERY_MS = exports.EMOTICON_INITIAL_RUN_LEASE_MS;
exports.EMOTICON_MAX_RECOVERY_ATTEMPTS = 3;
const CONTINUATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECOVERY_RECHECK_MS = 5 * 60 * 1000;
const BATCH_SLOT_RECHECK_MS = 60 * 1000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;
const WORKING_STATUSES = new Set([
    'queued',
    'analyzing',
    'generating',
    'validating',
    'animating',
    'rendering',
]);
function timestampToMillisOrZero(value) {
    const timestamp = value;
    return typeof (timestamp === null || timestamp === void 0 ? void 0 : timestamp.toMillis) === 'function' ? timestamp.toMillis() : 0;
}
function continuationExpiresAt(nowMs) {
    return admin.firestore.Timestamp.fromMillis(nowMs + CONTINUATION_TTL_MS);
}
function continuationJobStatus(stage) {
    if (stage === 'analysis')
        return 'analyzing';
    if (stage === 'pose-generation' || stage === 'pose-correction' || stage === 'repair-generation') {
        return 'generating';
    }
    if (stage === 'pose-review'
        || stage === 'corrected-pose-review'
        || stage === 'review'
        || stage === 'repair-pose-review'
        || stage === 'repair-sequence-review')
        return 'validating';
    if (stage === 'static-render' || stage === 'render' || stage === 'repair-render')
        return 'rendering';
    return 'animating';
}
function parseDurableContinuation(value, frameCount) {
    const parsed = schema_1.emoticonContinuationStateSchema.safeParse(value);
    if (!parsed.success)
        return null;
    const continuation = parsed.data;
    if ('pass' in continuation) {
        if (frameCount === undefined
            || continuation.startIndex > frameCount
            || continuation.nextFrameIndex > frameCount)
            return null;
    }
    return continuation;
}
function activeContinuationTokens(job) {
    const tokens = new Set();
    if (typeof job.recoveryContinuationToken === 'string' && job.recoveryContinuationToken) {
        tokens.add(job.recoveryContinuationToken);
    }
    const frameContinuation = job.frameContinuation && typeof job.frameContinuation === 'object'
        ? job.frameContinuation
        : null;
    if (frameContinuation
        && ['queued', 'running'].includes(String(frameContinuation.state))
        && typeof frameContinuation.token === 'string'
        && frameContinuation.token)
        tokens.add(frameContinuation.token);
    return [...tokens];
}
/**
 * The single server-owned recovery decision used by both the callable and the
 * scheduled sweeper. It never creates a replacement job: a stale job resumes
 * in place from its latest durable checkpoint.
 */
async function recoverStalledEmoticonJobInPlace(params) {
    var _a;
    const nowMs = (_a = params.nowMs) !== null && _a !== void 0 ? _a : Date.now();
    const jobRef = firestore_2.db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`);
    return firestore_2.db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d;
        const jobSnapshot = await transaction.get(jobRef);
        if (!jobSnapshot.exists) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'not-found' };
        }
        const job = jobSnapshot.data() || {};
        let leasedItemRef = null;
        let leasedItem = null;
        let projectData = null;
        let batchRef = null;
        let batchSnapshot = null;
        const scheduleRecoveryCheck = (reason, nextRecoveryAtMs, patch = {}) => {
            transaction.update(jobRef, Object.assign(Object.assign({}, patch), { nextRecoveryAtMs: Math.max(nowMs + 1000, nextRecoveryAtMs), recoveryLastSkipReason: reason, recoveryScannedAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() }));
            return { jobId: params.jobId, outcome: 'skipped', reason };
        };
        const deadLetter = (reason, message) => {
            transaction.update(jobRef, {
                status: 'failed',
                progress: 100,
                statusMessage: message,
                error: message,
                resumeAvailable: false,
                deferredUntilMs: null,
                nextRecoveryAtMs: firestore_1.FieldValue.delete(),
                recoveryDeadLetterReason: reason,
                recoveryDeadLetterAt: firestore_1.FieldValue.serverTimestamp(),
                failedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            if (leasedItemRef
                && (leasedItem === null || leasedItem === void 0 ? void 0 : leasedItem.jobId) === params.jobId
                && ['queued', 'generating'].includes(String(leasedItem.generationStatus))) {
                transaction.update(leasedItemRef, {
                    generationStatus: 'failed',
                    validationErrors: [message.slice(0, 240)],
                    serverRevision: firestore_1.FieldValue.increment(1),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            return { jobId: params.jobId, outcome: 'skipped', reason };
        };
        if (job.userId !== params.userId) {
            return deadLetter('owner-mismatch', '작업 소유자 정보가 저장 경로와 일치하지 않아 복구를 종료했습니다.');
        }
        if (job.deletionLocked === true) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'terminal' };
        }
        if (job.status === 'cancelled' || job.cancelRequestedAt) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'cancelled' };
        }
        const preservedRenderFailure = job.status === 'failed'
            && ((_a = job.renderFailureRecovery) === null || _a === void 0 ? void 0 : _a.stage) === 'render'
            && job.renderFailureRecovery.category === 'infrastructure'
            && job.renderFailureRecovery.poseAccepted === true;
        const recoverableCheckpointFailure = job.status === 'failed'
            && ((job.resumeAvailable === true
                && ['openrouter-credits', 'checkpoint-error'].includes(String(job.recoverableFailure)))
                || preservedRenderFailure);
        if (job.status === 'completed' || (job.status === 'failed' && !recoverableCheckpointFailure)) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'terminal' };
        }
        if (!recoverableCheckpointFailure
            && (typeof job.status !== 'string' || !WORKING_STATUSES.has(job.status))) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'not-working' };
        }
        const recoveryAttemptCount = Number(job.recoveryAttemptCount || 0);
        if (!Number.isInteger(recoveryAttemptCount)
            || recoveryAttemptCount < 0
            || recoveryAttemptCount >= exports.EMOTICON_MAX_RECOVERY_ATTEMPTS) {
            return deadLetter('recovery-attempt-limit', '같은 저장 단계의 자동 복구 한도에 도달해 추가 비용 발생을 막았습니다.');
        }
        if (typeof job.deferredUntilMs === 'number' && job.deferredUntilMs > nowMs) {
            return scheduleRecoveryCheck('deferred', job.deferredUntilMs);
        }
        const hasProjectId = typeof job.projectId === 'string' && job.projectId.length > 0;
        const hasProjectItemId = typeof job.projectItemId === 'string' && job.projectItemId.length > 0;
        if (hasProjectId) {
            const projectSnapshot = await transaction.get(firestore_2.db.doc(`users/${params.userId}/emoticonProjects/${job.projectId}`));
            projectData = projectSnapshot.data() || {};
            if (!projectSnapshot.exists || ((_b = projectSnapshot.data()) === null || _b === void 0 ? void 0 : _b.deletionLocked) === true) {
                transaction.update(jobRef, {
                    status: 'cancelled',
                    statusMessage: '프로젝트가 삭제되었거나 삭제 중이라 작업 복구를 종료했습니다.',
                    error: null,
                    resumeAvailable: false,
                    deferredUntilMs: null,
                    nextRecoveryAtMs: firestore_1.FieldValue.delete(),
                    recoveryLastSkipReason: 'project-deletion-locked',
                    cancelledAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                return {
                    jobId: params.jobId,
                    outcome: 'skipped',
                    reason: 'project-deletion-locked',
                };
            }
        }
        const projectLevelMode = ['plan', 'profile', 'sheet_plan'].includes(String(job.mode));
        if (!projectLevelMode && hasProjectId !== hasProjectItemId) {
            return deadLetter('stale-project-item-lease', '프로젝트 항목 연결이 불완전해 작업을 안전하게 종료했습니다.');
        }
        if (!projectLevelMode && hasProjectId && hasProjectItemId) {
            const itemRef = firestore_2.db.doc(`users/${params.userId}/emoticonProjects/${job.projectId}/items/${job.projectItemId}`);
            const itemSnapshot = await transaction.get(itemRef);
            const item = itemSnapshot.data() || {};
            leasedItemRef = itemRef;
            leasedItem = item;
            if (!itemSnapshot.exists
                || item.jobId !== params.jobId
                || !['queued', 'generating'].includes(String(item.generationStatus))) {
                return deadLetter('stale-project-item-lease', '프로젝트 항목 작업 권한이 변경되어 복구를 종료했습니다.');
            }
        }
        const hasBatchId = typeof job.batchId === 'string' && job.batchId.length > 0;
        if (hasBatchId) {
            if (!SAFE_ID.test(String(job.batchId)) || !hasProjectId || !hasProjectItemId) {
                return deadLetter('invalid-batch-execution', '배치 작업 연결을 확인할 수 없어 자동 복구를 안전하게 중단했습니다.');
            }
            batchRef = firestore_2.db.doc(`users/${params.userId}/emoticonBatches/${job.batchId}`);
            batchSnapshot = await transaction.get(batchRef);
        }
        const continuationTokens = activeContinuationTokens(job);
        const continuationSnapshots = await Promise.all(continuationTokens.map((token) => (transaction.get(firestore_2.db.collection('emoticonStudioContinuations').doc(token)))));
        for (let index = 0; index < continuationSnapshots.length; index += 1) {
            const snapshot = continuationSnapshots[index];
            const continuation = snapshot.data() || {};
            if (snapshot.exists
                && continuation.userId === params.userId
                && continuation.jobId === params.jobId
                && ['queued', 'running'].includes(String(continuation.status))) {
                const continuationUpdatedAtMs = timestampToMillisOrZero(continuation.updatedAt);
                const continuationLeaseExpiresAtMs = typeof continuation.leaseExpiresAtMs === 'number'
                    ? continuation.leaseExpiresAtMs
                    : 0;
                const active = continuation.status === 'running'
                    ? continuationLeaseExpiresAtMs > nowMs
                    : continuationUpdatedAtMs > nowMs - exports.EMOTICON_STALLED_RUN_RECOVERY_MS;
                if (active) {
                    transaction.update(jobRef, {
                        nextRecoveryAtMs: continuation.status === 'running'
                            ? continuationLeaseExpiresAtMs
                            : nowMs + RECOVERY_RECHECK_MS,
                        recoveryLastSkipReason: 'existing-continuation',
                        recoveryScannedAt: firestore_1.FieldValue.serverTimestamp(),
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    return {
                        jobId: params.jobId,
                        outcome: 'already-recovering',
                        continuationToken: continuationTokens[index],
                    };
                }
                transaction.update(snapshot.ref, {
                    status: 'superseded',
                    leaseExpiresAtMs: 0,
                    supersededAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
        const updatedAtMs = timestampToMillisOrZero(job.updatedAt);
        const hasRunToken = typeof job.generationRunToken === 'string'
            && job.generationRunToken.length > 0;
        const minimumAgeMs = recoverableCheckpointFailure
            ? 0
            : job.status === 'queued' && !hasRunToken
                ? exports.EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS
                : exports.EMOTICON_STALLED_RUN_RECOVERY_MS;
        if (updatedAtMs <= 0 || nowMs - updatedAtMs < minimumAgeMs) {
            return scheduleRecoveryCheck('fresh', updatedAtMs > 0 ? updatedAtMs + minimumAgeMs : nowMs + RECOVERY_RECHECK_MS);
        }
        const claimedAtMs = timestampToMillisOrZero(job.generationRunClaimedAt);
        const runLeaseExpiresAtMs = typeof job.generationRunLeaseExpiresAtMs === 'number'
            ? job.generationRunLeaseExpiresAtMs
            : claimedAtMs > 0
                ? claimedAtMs + exports.EMOTICON_INITIAL_RUN_LEASE_MS
                : 0;
        if (!recoverableCheckpointFailure && hasRunToken && runLeaseExpiresAtMs > nowMs) {
            return scheduleRecoveryCheck('active-run-lease', runLeaseExpiresAtMs);
        }
        const parsedRequest = schema_1.emoticonJobRequestSchema.safeParse(Object.assign(Object.assign({}, job), { status: 'queued' }));
        if (!parsedRequest.success) {
            return deadLetter('invalid-request', '저장된 작업 요청이 손상되어 자동 복구를 종료했습니다.');
        }
        const parsedPlan = (0, recoveryPolicy_1.parseEmoticonRecoveryPlan)(job.plan);
        let continuation = parseDurableContinuation(job.frameContinuation, parsedPlan.success ? parsedPlan.data.action.frameCount : undefined);
        if (!continuation) {
            if (parsedRequest.data.mode === 'rerender'
                || parsedRequest.data.mode === 'import_frames'
                || job.status === 'queued') {
                continuation = {
                    stage: (0, recoveryPolicy_1.canonicalEmoticonRecoveryStartStage)(parsedRequest.data.mode),
                    retryCount: 0,
                };
            }
            else {
                return deadLetter('missing-checkpoint', '복구 체크포인트가 없어 작업을 안전하게 종료했습니다.');
            }
        }
        const executionGate = (0, rateLimits_1.assessEmoticonRecoveryExecutionGate)({
            mode: parsedRequest.data.mode,
            job,
            nowMs,
        });
        if (executionGate.outcome === 'blocked') {
            return deadLetter('missing-execution-authorization', '서버 비용 승인 또는 요청 제한 예약을 확인할 수 없어 자동 복구를 중단했습니다. 새 작업을 만들어 주세요.');
        }
        if (executionGate.outcome === 'deferred') {
            return scheduleRecoveryCheck('deferred', executionGate.executeAtMs, {
                status: 'queued',
                deferredUntilMs: executionGate.executeAtMs,
                generationRunLeaseExpiresAtMs: executionGate.executeAtMs + exports.EMOTICON_INITIAL_RUN_LEASE_MS,
                resumeAvailable: false,
            });
        }
        let acquiredNewBatchSlot = false;
        if (batchRef && batchSnapshot) {
            const parsedBatch = batchSnapshot.exists
                ? schema_1.emoticonBatchSchema.safeParse(Object.assign({ id: batchSnapshot.id }, (batchSnapshot.data() || {})))
                : null;
            const batch = (parsedBatch === null || parsedBatch === void 0 ? void 0 : parsedBatch.success) ? parsedBatch.data : null;
            const projectRevision = projectData === null || projectData === void 0 ? void 0 : projectData.revision;
            const batchItem = batch === null || batch === void 0 ? void 0 : batch.items.find((candidate) => (candidate.itemId === job.projectItemId));
            const validBatchExecution = Boolean(batch
                && batch.userId === params.userId
                && batch.projectId === job.projectId
                && batch.itemIds.includes(String(job.projectItemId))
                && Number.isInteger(projectRevision)
                && batch.projectRevision === projectRevision
                && job.projectRevision === projectRevision
                && batchItem
                && (!batch.enqueueRoundId
                    || (batchItem.enqueueRoundId === batch.enqueueRoundId
                        && batchItem.retryRound === batch.retryRound
                        && ((_c = batch.enqueueItemAttempts) === null || _c === void 0 ? void 0 : _c[batchItem.itemId])
                            === batchItem.attemptCount
                        && ((_d = batch.enqueueItemRevisions) === null || _d === void 0 ? void 0 : _d[batchItem.itemId])
                            === batchItem.enqueueProjectItemRevision
                        && job.batchEnqueueRoundId === batch.enqueueRoundId
                        && job.batchRetryRound === batch.retryRound
                        && job.batchItemAttemptCount === batchItem.attemptCount
                        && job.projectItemRevision === batchItem.enqueueProjectItemRevision))
                && !batch.cancelRequestedAt
                && ['preparing', 'running', 'deferred'].includes(batch.status));
            if (!validBatchExecution) {
                return deadLetter('invalid-batch-execution', '배치 또는 프로젝트 실행 경계가 변경되어 자동 복구를 안전하게 중단했습니다.');
            }
            const batchSlot = (0, batchContract_1.resolveEmoticonBatchExecutionSlot)({
                executionJobIds: batch.executionJobIds,
                requestedConcurrency: batch.requestedConcurrency,
                jobId: params.jobId,
            });
            if (batchSlot.outcome === 'deferred') {
                const nextAttemptAtMs = nowMs + BATCH_SLOT_RECHECK_MS;
                return scheduleRecoveryCheck('batch-concurrency', nextAttemptAtMs, {
                    status: 'queued',
                    statusMessage: '선택한 동시 실행 수에 맞춰 복구 작업이 대기 중입니다.',
                    deferredUntilMs: nextAttemptAtMs,
                    generationRunLeaseExpiresAtMs: nextAttemptAtMs + exports.EMOTICON_INITIAL_RUN_LEASE_MS,
                    resumeAvailable: false,
                });
            }
            if (batchSlot.outcome === 'acquired') {
                transaction.update(batchRef, {
                    executionJobIds: batchSlot.executionJobIds,
                    executionSlotUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                acquiredNewBatchSlot = true;
            }
        }
        const runToken = hasRunToken ? String(job.generationRunToken) : (0, node_crypto_1.randomUUID)();
        const continuationToken = (0, node_crypto_1.randomUUID)();
        const continuationRef = firestore_2.db.collection('emoticonStudioContinuations').doc(continuationToken);
        const persistedState = Object.assign(Object.assign({}, continuation), { state: 'queued', token: continuationToken, requestedAt: firestore_1.FieldValue.serverTimestamp() });
        transaction.create(continuationRef, {
            userId: params.userId,
            jobId: params.jobId,
            token: continuationToken,
            runToken,
            status: 'queued',
            stage: continuation.stage,
            recovery: true,
            expiresAt: continuationExpiresAt(nowMs),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(jobRef, Object.assign(Object.assign({ generationRunToken: runToken, generationRunLeaseExpiresAtMs: nowMs + exports.EMOTICON_INITIAL_RUN_LEASE_MS, status: continuationJobStatus(continuation.stage), statusMessage: '저장된 단계부터 작업을 안전하게 다시 이어가고 있어요.', frameContinuation: persistedState, deferredUntilMs: null, resumeAvailable: true, recoveryContinuationToken: continuationToken }, (acquiredNewBatchSlot
            ? { batchExecutionSlotAcquiredAt: firestore_1.FieldValue.serverTimestamp() }
            : {})), { recoveryAttemptCount: firestore_1.FieldValue.increment(1), recoveredAt: firestore_1.FieldValue.serverTimestamp(), nextRecoveryAtMs: firestore_1.FieldValue.delete(), recoveryLastSkipReason: firestore_1.FieldValue.delete(), recoverableFailure: firestore_1.FieldValue.delete(), creditPausedAt: firestore_1.FieldValue.delete(), updatedAt: firestore_1.FieldValue.serverTimestamp() }));
        return {
            jobId: params.jobId,
            outcome: 'resumed',
            continuationToken,
        };
    });
}
//# sourceMappingURL=jobRecovery.js.map