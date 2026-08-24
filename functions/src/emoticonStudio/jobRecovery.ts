import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firestore';
import { resolveEmoticonBatchExecutionSlot } from './batchContract';
import { assessEmoticonRecoveryExecutionGate } from './rateLimits';
import {
    emoticonBatchSchema,
    emoticonContinuationStateSchema,
    emoticonJobRequestSchema,
    type EmoticonContinuationState,
} from './schema';
import {
    canonicalEmoticonRecoveryStartStage,
    parseEmoticonRecoveryPlan,
} from './recoveryPolicy';

export const EMOTICON_INITIAL_RUN_LEASE_MS = 11 * 60 * 1000;
export const EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS = 90 * 1000;
export const EMOTICON_STALLED_RUN_RECOVERY_MS = EMOTICON_INITIAL_RUN_LEASE_MS;
export const EMOTICON_MAX_RECOVERY_ATTEMPTS = 3;
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

export type EmoticonRecoverySkipReason =
    | 'not-found'
    | 'owner-mismatch'
    | 'cancelled'
    | 'terminal'
    | 'not-working'
    | 'deferred'
    | 'fresh'
    | 'active-run-lease'
    | 'existing-continuation'
    | 'project-deletion-locked'
    | 'stale-project-item-lease'
    | 'invalid-batch-execution'
    | 'batch-concurrency'
    | 'missing-execution-authorization'
    | 'invalid-request'
    | 'missing-checkpoint'
    | 'recovery-attempt-limit';

export type EmoticonRecoveryResult = {
    jobId: string;
    outcome: 'resumed' | 'already-recovering';
    continuationToken: string;
} | {
    jobId: string;
    outcome: 'skipped';
    reason: EmoticonRecoverySkipReason;
};

function timestampToMillisOrZero(value: unknown): number {
    const timestamp = value as { toMillis?: () => number } | undefined;
    return typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : 0;
}

function continuationExpiresAt(nowMs: number): admin.firestore.Timestamp {
    return admin.firestore.Timestamp.fromMillis(nowMs + CONTINUATION_TTL_MS);
}

function continuationJobStatus(stage: EmoticonContinuationState['stage']): string {
    if (stage === 'analysis') return 'analyzing';
    if (stage === 'pose-generation' || stage === 'pose-correction' || stage === 'repair-generation') {
        return 'generating';
    }
    if (
        stage === 'pose-review'
        || stage === 'corrected-pose-review'
        || stage === 'review'
        || stage === 'repair-pose-review'
        || stage === 'repair-sequence-review'
    ) return 'validating';
    if (stage === 'static-render' || stage === 'render' || stage === 'repair-render') return 'rendering';
    return 'animating';
}

function parseDurableContinuation(
    value: unknown,
    frameCount?: number,
): EmoticonContinuationState | null {
    const parsed = emoticonContinuationStateSchema.safeParse(value);
    if (!parsed.success) return null;
    const continuation = parsed.data;
    if ('pass' in continuation) {
        if (
            frameCount === undefined
            || continuation.startIndex > frameCount
            || continuation.nextFrameIndex > frameCount
        ) return null;
    }
    return continuation;
}

function activeContinuationTokens(job: Record<string, unknown>): string[] {
    const tokens = new Set<string>();
    if (typeof job.recoveryContinuationToken === 'string' && job.recoveryContinuationToken) {
        tokens.add(job.recoveryContinuationToken);
    }
    const frameContinuation = job.frameContinuation && typeof job.frameContinuation === 'object'
        ? job.frameContinuation as Record<string, unknown>
        : null;
    if (
        frameContinuation
        && ['queued', 'running'].includes(String(frameContinuation.state))
        && typeof frameContinuation.token === 'string'
        && frameContinuation.token
    ) tokens.add(frameContinuation.token);
    return [...tokens];
}

/**
 * The single server-owned recovery decision used by both the callable and the
 * scheduled sweeper. It never creates a replacement job: a stale job resumes
 * in place from its latest durable checkpoint.
 */
export async function recoverStalledEmoticonJobInPlace(params: {
    userId: string;
    jobId: string;
    nowMs?: number;
}): Promise<EmoticonRecoveryResult> {
    const nowMs = params.nowMs ?? Date.now();
    const jobRef = db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`);
    return db.runTransaction(async (transaction) => {
        const jobSnapshot = await transaction.get(jobRef);
        if (!jobSnapshot.exists) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'not-found' } as const;
        }
        const job = jobSnapshot.data() || {};
        let leasedItemRef: FirebaseFirestore.DocumentReference | null = null;
        let leasedItem: Record<string, unknown> | null = null;
        let projectData: Record<string, unknown> | null = null;
        let batchRef: FirebaseFirestore.DocumentReference | null = null;
        let batchSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
        const scheduleRecoveryCheck = (
            reason: EmoticonRecoverySkipReason,
            nextRecoveryAtMs: number,
            patch: Record<string, unknown> = {},
        ): EmoticonRecoveryResult => {
            transaction.update(jobRef, {
                ...patch,
                nextRecoveryAtMs: Math.max(nowMs + 1_000, nextRecoveryAtMs),
                recoveryLastSkipReason: reason,
                recoveryScannedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { jobId: params.jobId, outcome: 'skipped', reason };
        };
        const deadLetter = (
            reason:
                | 'owner-mismatch'
                | 'invalid-request'
                | 'missing-checkpoint'
                | 'stale-project-item-lease'
                | 'invalid-batch-execution'
                | 'missing-execution-authorization'
                | 'recovery-attempt-limit',
            message: string,
        ): EmoticonRecoveryResult => {
            transaction.update(jobRef, {
                status: 'failed',
                progress: 100,
                statusMessage: message,
                error: message,
                resumeAvailable: false,
                deferredUntilMs: null,
                nextRecoveryAtMs: FieldValue.delete(),
                recoveryDeadLetterReason: reason,
                recoveryDeadLetterAt: FieldValue.serverTimestamp(),
                failedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            if (
                leasedItemRef
                && leasedItem?.jobId === params.jobId
                && ['queued', 'generating'].includes(String(leasedItem.generationStatus))
            ) {
                transaction.update(leasedItemRef, {
                    generationStatus: 'failed',
                    validationErrors: [message.slice(0, 240)],
                    serverRevision: FieldValue.increment(1),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }
            return { jobId: params.jobId, outcome: 'skipped', reason };
        };
        if (job.userId !== params.userId) {
            return deadLetter(
                'owner-mismatch',
                '작업 소유자 정보가 저장 경로와 일치하지 않아 복구를 종료했습니다.',
            );
        }
        if (job.deletionLocked === true) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'terminal' } as const;
        }
        if (job.status === 'cancelled' || job.cancelRequestedAt) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'cancelled' } as const;
        }
        const preservedRenderFailure = job.status === 'failed'
            && job.renderFailureRecovery?.stage === 'render'
            && job.renderFailureRecovery.category === 'infrastructure'
            && job.renderFailureRecovery.poseAccepted === true;
        const recoverableCheckpointFailure = job.status === 'failed'
            && (
                (
                    job.resumeAvailable === true
                    && ['openrouter-credits', 'checkpoint-error'].includes(String(job.recoverableFailure))
                )
                || preservedRenderFailure
            );
        if (job.status === 'completed' || (job.status === 'failed' && !recoverableCheckpointFailure)) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'terminal' } as const;
        }
        if (
            !recoverableCheckpointFailure
            && (typeof job.status !== 'string' || !WORKING_STATUSES.has(job.status))
        ) {
            return { jobId: params.jobId, outcome: 'skipped', reason: 'not-working' } as const;
        }
        const recoveryAttemptCount = Number(job.recoveryAttemptCount || 0);
        if (
            !Number.isInteger(recoveryAttemptCount)
            || recoveryAttemptCount < 0
            || recoveryAttemptCount >= EMOTICON_MAX_RECOVERY_ATTEMPTS
        ) {
            return deadLetter(
                'recovery-attempt-limit',
                '같은 저장 단계의 자동 복구 한도에 도달해 추가 비용 발생을 막았습니다.',
            );
        }
        if (typeof job.deferredUntilMs === 'number' && job.deferredUntilMs > nowMs) {
            return scheduleRecoveryCheck('deferred', job.deferredUntilMs);
        }

        const hasProjectId = typeof job.projectId === 'string' && job.projectId.length > 0;
        const hasProjectItemId = typeof job.projectItemId === 'string' && job.projectItemId.length > 0;
        if (hasProjectId) {
            const projectSnapshot = await transaction.get(db.doc(
                `users/${params.userId}/emoticonProjects/${job.projectId}`,
            ));
            projectData = projectSnapshot.data() || {};
            if (!projectSnapshot.exists || projectSnapshot.data()?.deletionLocked === true) {
                transaction.update(jobRef, {
                    status: 'cancelled',
                    statusMessage: '프로젝트가 삭제되었거나 삭제 중이라 작업 복구를 종료했습니다.',
                    error: null,
                    resumeAvailable: false,
                    deferredUntilMs: null,
                    nextRecoveryAtMs: FieldValue.delete(),
                    recoveryLastSkipReason: 'project-deletion-locked',
                    cancelledAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                return {
                    jobId: params.jobId,
                    outcome: 'skipped',
                    reason: 'project-deletion-locked',
                } as const;
            }
        }
        const projectLevelMode = ['plan', 'profile', 'sheet_plan'].includes(String(job.mode));
        if (!projectLevelMode && hasProjectId !== hasProjectItemId) {
            return deadLetter(
                'stale-project-item-lease',
                '프로젝트 항목 연결이 불완전해 작업을 안전하게 종료했습니다.',
            );
        }
        if (!projectLevelMode && hasProjectId && hasProjectItemId) {
            const itemRef = db.doc(
                `users/${params.userId}/emoticonProjects/${job.projectId}/items/${job.projectItemId}`,
            );
            const itemSnapshot = await transaction.get(itemRef);
            const item = itemSnapshot.data() || {};
            leasedItemRef = itemRef;
            leasedItem = item;
            if (
                !itemSnapshot.exists
                || item.jobId !== params.jobId
                || !['queued', 'generating'].includes(String(item.generationStatus))
            ) {
                return deadLetter(
                    'stale-project-item-lease',
                    '프로젝트 항목 작업 권한이 변경되어 복구를 종료했습니다.',
                );
            }
        }

        const hasBatchId = typeof job.batchId === 'string' && job.batchId.length > 0;
        if (hasBatchId) {
            if (!SAFE_ID.test(String(job.batchId)) || !hasProjectId || !hasProjectItemId) {
                return deadLetter(
                    'invalid-batch-execution',
                    '배치 작업 연결을 확인할 수 없어 자동 복구를 안전하게 중단했습니다.',
                );
            }
            batchRef = db.doc(`users/${params.userId}/emoticonBatches/${job.batchId}`);
            batchSnapshot = await transaction.get(batchRef);
        }

        const continuationTokens = activeContinuationTokens(job);
        const continuationSnapshots = await Promise.all(continuationTokens.map((token) => (
            transaction.get(db.collection('emoticonStudioContinuations').doc(token))
        )));
        for (let index = 0; index < continuationSnapshots.length; index += 1) {
            const snapshot = continuationSnapshots[index];
            const continuation = snapshot.data() || {};
            if (
                snapshot.exists
                && continuation.userId === params.userId
                && continuation.jobId === params.jobId
                && ['queued', 'running'].includes(String(continuation.status))
            ) {
                const continuationUpdatedAtMs = timestampToMillisOrZero(continuation.updatedAt);
                const continuationLeaseExpiresAtMs = typeof continuation.leaseExpiresAtMs === 'number'
                    ? continuation.leaseExpiresAtMs
                    : 0;
                const active = continuation.status === 'running'
                    ? continuationLeaseExpiresAtMs > nowMs
                    : continuationUpdatedAtMs > nowMs - EMOTICON_STALLED_RUN_RECOVERY_MS;
                if (active) {
                    transaction.update(jobRef, {
                        nextRecoveryAtMs: continuation.status === 'running'
                            ? continuationLeaseExpiresAtMs
                            : nowMs + RECOVERY_RECHECK_MS,
                        recoveryLastSkipReason: 'existing-continuation',
                        recoveryScannedAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    return {
                        jobId: params.jobId,
                        outcome: 'already-recovering',
                        continuationToken: continuationTokens[index],
                    } as const;
                }
                transaction.update(snapshot.ref, {
                    status: 'superseded',
                    leaseExpiresAtMs: 0,
                    supersededAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }
        }

        const updatedAtMs = timestampToMillisOrZero(job.updatedAt);
        const hasRunToken = typeof job.generationRunToken === 'string'
            && job.generationRunToken.length > 0;
        const minimumAgeMs = recoverableCheckpointFailure
            ? 0
            : job.status === 'queued' && !hasRunToken
            ? EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS
            : EMOTICON_STALLED_RUN_RECOVERY_MS;
        if (updatedAtMs <= 0 || nowMs - updatedAtMs < minimumAgeMs) {
            return scheduleRecoveryCheck(
                'fresh',
                updatedAtMs > 0 ? updatedAtMs + minimumAgeMs : nowMs + RECOVERY_RECHECK_MS,
            );
        }
        const claimedAtMs = timestampToMillisOrZero(job.generationRunClaimedAt);
        const runLeaseExpiresAtMs = typeof job.generationRunLeaseExpiresAtMs === 'number'
            ? job.generationRunLeaseExpiresAtMs
            : claimedAtMs > 0
                ? claimedAtMs + EMOTICON_INITIAL_RUN_LEASE_MS
                : 0;
        if (!recoverableCheckpointFailure && hasRunToken && runLeaseExpiresAtMs > nowMs) {
            return scheduleRecoveryCheck('active-run-lease', runLeaseExpiresAtMs);
        }

        const parsedRequest = emoticonJobRequestSchema.safeParse({ ...job, status: 'queued' });
        if (!parsedRequest.success) {
            return deadLetter(
                'invalid-request',
                '저장된 작업 요청이 손상되어 자동 복구를 종료했습니다.',
            );
        }
        const parsedPlan = parseEmoticonRecoveryPlan(job.plan);
        let continuation = parseDurableContinuation(
            job.frameContinuation,
            parsedPlan.success ? parsedPlan.data.action.frameCount : undefined,
        );
        if (!continuation) {
            if (
                parsedRequest.data.mode === 'rerender'
                || parsedRequest.data.mode === 'import_frames'
                || job.status === 'queued'
            ) {
                continuation = {
                    stage: canonicalEmoticonRecoveryStartStage(parsedRequest.data.mode),
                    retryCount: 0,
                };
            } else {
                return deadLetter(
                    'missing-checkpoint',
                    '복구 체크포인트가 없어 작업을 안전하게 종료했습니다.',
                );
            }
        }

        const executionGate = assessEmoticonRecoveryExecutionGate({
            mode: parsedRequest.data.mode,
            job,
            nowMs,
        });
        if (executionGate.outcome === 'blocked') {
            return deadLetter(
                'missing-execution-authorization',
                '서버 비용 승인 또는 요청 제한 예약을 확인할 수 없어 자동 복구를 중단했습니다. 새 작업을 만들어 주세요.',
            );
        }
        if (executionGate.outcome === 'deferred') {
            return scheduleRecoveryCheck('deferred', executionGate.executeAtMs, {
                status: 'queued',
                deferredUntilMs: executionGate.executeAtMs,
                generationRunLeaseExpiresAtMs:
                    executionGate.executeAtMs + EMOTICON_INITIAL_RUN_LEASE_MS,
                resumeAvailable: false,
            });
        }

        let acquiredNewBatchSlot = false;
        if (batchRef && batchSnapshot) {
            const parsedBatch = batchSnapshot.exists
                ? emoticonBatchSchema.safeParse({
                    id: batchSnapshot.id,
                    ...(batchSnapshot.data() || {}),
                })
                : null;
            const batch = parsedBatch?.success ? parsedBatch.data : null;
            const projectRevision = projectData?.revision;
            const batchItem = batch?.items.find((candidate) => (
                candidate.itemId === job.projectItemId
            ));
            const validBatchExecution = Boolean(
                batch
                && batch.userId === params.userId
                && batch.projectId === job.projectId
                && batch.itemIds.includes(String(job.projectItemId))
                && Number.isInteger(projectRevision)
                && batch.projectRevision === projectRevision
                && job.projectRevision === projectRevision
                && batchItem
                && (
                    !batch.enqueueRoundId
                    || (
                        batchItem.enqueueRoundId === batch.enqueueRoundId
                        && batchItem.retryRound === batch.retryRound
                        && batch.enqueueItemAttempts?.[batchItem.itemId]
                            === batchItem.attemptCount
                        && batch.enqueueItemRevisions?.[batchItem.itemId]
                            === batchItem.enqueueProjectItemRevision
                        && job.batchEnqueueRoundId === batch.enqueueRoundId
                        && job.batchRetryRound === batch.retryRound
                        && job.batchItemAttemptCount === batchItem.attemptCount
                        && job.projectItemRevision === batchItem.enqueueProjectItemRevision
                    )
                )
                && !batch.cancelRequestedAt
                && ['preparing', 'running', 'deferred'].includes(batch.status)
            );
            if (!validBatchExecution) {
                return deadLetter(
                    'invalid-batch-execution',
                    '배치 또는 프로젝트 실행 경계가 변경되어 자동 복구를 안전하게 중단했습니다.',
                );
            }
            const batchSlot = resolveEmoticonBatchExecutionSlot({
                executionJobIds: batch!.executionJobIds,
                requestedConcurrency: batch!.requestedConcurrency,
                jobId: params.jobId,
            });
            if (batchSlot.outcome === 'deferred') {
                const nextAttemptAtMs = nowMs + BATCH_SLOT_RECHECK_MS;
                return scheduleRecoveryCheck('batch-concurrency', nextAttemptAtMs, {
                    status: 'queued',
                    statusMessage: '선택한 동시 실행 수에 맞춰 복구 작업이 대기 중입니다.',
                    deferredUntilMs: nextAttemptAtMs,
                    generationRunLeaseExpiresAtMs:
                        nextAttemptAtMs + EMOTICON_INITIAL_RUN_LEASE_MS,
                    resumeAvailable: false,
                });
            }
            if (batchSlot.outcome === 'acquired') {
                transaction.update(batchRef, {
                    executionJobIds: batchSlot.executionJobIds,
                    executionSlotUpdatedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                acquiredNewBatchSlot = true;
            }
        }

        const runToken = hasRunToken ? String(job.generationRunToken) : randomUUID();
        const continuationToken = randomUUID();
        const continuationRef = db.collection('emoticonStudioContinuations').doc(continuationToken);
        const persistedState = {
            ...continuation,
            state: 'queued' as const,
            token: continuationToken,
            requestedAt: FieldValue.serverTimestamp(),
        };
        transaction.create(continuationRef, {
            userId: params.userId,
            jobId: params.jobId,
            token: continuationToken,
            runToken,
            status: 'queued',
            stage: continuation.stage,
            recovery: true,
            expiresAt: continuationExpiresAt(nowMs),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(jobRef, {
            generationRunToken: runToken,
            generationRunLeaseExpiresAtMs: nowMs + EMOTICON_INITIAL_RUN_LEASE_MS,
            status: continuationJobStatus(continuation.stage),
            statusMessage: '저장된 단계부터 작업을 안전하게 다시 이어가고 있어요.',
            frameContinuation: persistedState,
            deferredUntilMs: null,
            resumeAvailable: true,
            recoveryContinuationToken: continuationToken,
            ...(acquiredNewBatchSlot
                ? { batchExecutionSlotAcquiredAt: FieldValue.serverTimestamp() }
                : {}),
            recoveryAttemptCount: FieldValue.increment(1),
            recoveredAt: FieldValue.serverTimestamp(),
            nextRecoveryAtMs: FieldValue.delete(),
            recoveryLastSkipReason: FieldValue.delete(),
            recoverableFailure: FieldValue.delete(),
            creditPausedAt: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        return {
            jobId: params.jobId,
            outcome: 'resumed',
            continuationToken,
        } as const;
    });
}
