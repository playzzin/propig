import { createHash, randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { resolveEmoticonBatchExecutionSlot } from '../emoticonStudio/batchContract';
import { emoticonBatchSchema } from '../emoticonStudio/schema';
import { db } from '../firestore';

const QUEUE_COLLECTION = 'emoticonStudioDeferredJobs';
const RELEASE_BATCH_SIZE = 200;
const RUN_LEASE_MS = 11 * 60 * 1000;
const QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETIRED_EXECUTE_AT_MS = Number.MAX_SAFE_INTEGER;
const BATCH_SLOT_RETRY_MS = 60_000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;

type DeferredReleaseOutcome = 'released' | 'retired' | 'deferred' | 'ignored';

type ImmediateBatchWakeTarget = {
    userId: string;
    batchId: string;
};

function continuationStage(mode: unknown): 'analysis' | 'static-render' | 'repair-generation' {
    if (mode === 'rerender') return 'static-render';
    if (mode === 'repair_frame') return 'repair-generation';
    return 'analysis';
}

function jobStatus(stage: ReturnType<typeof continuationStage>): string {
    if (stage === 'static-render') return 'rendering';
    if (stage === 'repair-generation') return 'generating';
    return 'analyzing';
}

async function releaseDeferredQueueDocument(params: {
    queueRef: DocumentReference;
    nowMs: number;
    immediateBatchWake?: ImmediateBatchWakeTarget;
}): Promise<DeferredReleaseOutcome> {
    const { queueRef, nowMs, immediateBatchWake } = params;
    return db.runTransaction(async (transaction) => {
                const queueSnapshot = await transaction.get(queueRef);
                if (!queueSnapshot.exists) return 'ignored' as const;
                const queued = queueSnapshot.data() || {};
                if (queued.status !== 'queued' || typeof queued.executeAtMs !== 'number') {
                    return 'ignored' as const;
                }
                const userId = typeof queued.userId === 'string' ? queued.userId : '';
                const jobId = typeof queued.jobId === 'string' ? queued.jobId : '';
                if (
                    immediateBatchWake
                    && (
                        queued.reason !== 'batch_concurrency'
                        || userId !== immediateBatchWake.userId
                        || (
                            typeof queued.batchId === 'string'
                            && queued.batchId !== immediateBatchWake.batchId
                        )
                    )
                ) return 'ignored' as const;
                if (queued.executeAtMs > nowMs && !immediateBatchWake) return 'ignored' as const;
                if (!userId || !jobId) {
                    transaction.update(queueRef, {
                        status: 'invalid',
                        executeAtMs: RETIRED_EXECUTE_AT_MS,
                        expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    return 'retired' as const;
                }
                const jobRef = db.doc(`users/${userId}/emoticonJobs/${jobId}`);
                const jobSnapshot = await transaction.get(jobRef);
                if (!jobSnapshot.exists) {
                    transaction.update(queueRef, {
                        status: 'stale',
                        executeAtMs: RETIRED_EXECUTE_AT_MS,
                        expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    return 'retired' as const;
                }
                const job = jobSnapshot.data() || {};
                if (
                    immediateBatchWake
                    && (
                        job.userId !== immediateBatchWake.userId
                        || job.batchId !== immediateBatchWake.batchId
                    )
                ) return 'ignored' as const;
                const queueIdentityMismatch = (
                    typeof queued.batchId === 'string'
                    && queued.batchId.length > 0
                    && queued.batchId !== job.batchId
                ) || (
                    typeof queued.projectId === 'string'
                    && queued.projectId.length > 0
                    && queued.projectId !== job.projectId
                ) || (
                    typeof queued.projectItemId === 'string'
                    && queued.projectItemId.length > 0
                    && queued.projectItemId !== job.projectItemId
                );
                if (queueIdentityMismatch) {
                    transaction.update(queueRef, {
                        status: 'invalid',
                        executeAtMs: RETIRED_EXECUTE_AT_MS,
                        expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    return 'retired' as const;
                }
                const projectRef = typeof job.projectId === 'string'
                    ? db.doc(`users/${userId}/emoticonProjects/${job.projectId}`)
                    : null;
                const itemRef = typeof job.projectId === 'string' && typeof job.projectItemId === 'string'
                    ? db.doc(
                        `users/${userId}/emoticonProjects/${job.projectId}/items/${job.projectItemId}`,
                    )
                    : null;
                const batchRef = typeof job.batchId === 'string' && SAFE_ID.test(job.batchId)
                    ? db.doc(`users/${userId}/emoticonBatches/${job.batchId}`)
                    : null;
                const [projectSnapshot, itemSnapshot, batchSnapshot] = await Promise.all([
                    projectRef ? transaction.get(projectRef) : Promise.resolve(null),
                    itemRef ? transaction.get(itemRef) : Promise.resolve(null),
                    batchRef ? transaction.get(batchRef) : Promise.resolve(null),
                ]);
                const deletionStopping = Boolean(
                    projectRef
                    && (!projectSnapshot?.exists || projectSnapshot.data()?.deletionLocked === true),
                );
                if (
                    job.userId !== userId
                    || job.status === 'completed'
                    || job.status === 'failed'
                    || job.status === 'cancelled'
                    || job.cancelRequestedAt
                ) {
                    transaction.update(queueRef, {
                        status: job.cancelRequestedAt || job.status === 'cancelled' ? 'cancelled' : 'stale',
                        executeAtMs: RETIRED_EXECUTE_AT_MS,
                        expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    return 'retired' as const;
                }
                if (deletionStopping) {
                    transaction.update(jobRef, {
                        status: 'cancelled',
                        progress: typeof job.progress === 'number' ? job.progress : 0,
                        statusMessage: '프로젝트 삭제가 진행되어 예약 작업을 시작하지 않았어요.',
                        error: null,
                        resumeAvailable: false,
                        deferredUntilMs: null,
                        cancelledAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    if (
                        itemRef
                        && itemSnapshot?.exists
                        && itemSnapshot.data()?.jobId === jobId
                    ) {
                        transaction.update(itemRef, {
                            generationStatus: 'planned',
                            serverRevision: FieldValue.increment(1),
                            updatedAt: FieldValue.serverTimestamp(),
                        });
                    }
                    transaction.update(queueRef, {
                        status: 'cancelled',
                        executeAtMs: RETIRED_EXECUTE_AT_MS,
                        expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    return 'retired' as const;
                }
                const existingContinuation = job.frameContinuation
                    && typeof job.frameContinuation === 'object'
                    ? job.frameContinuation as Record<string, unknown>
                    : null;
                if (
                    existingContinuation
                    && ['queued', 'running'].includes(String(existingContinuation.state))
                ) {
                    transaction.update(queueRef, {
                        status: 'stale',
                        executeAtMs: RETIRED_EXECUTE_AT_MS,
                        expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    return 'retired' as const;
                }

                const hasBatchLink = typeof job.batchId === 'string' && job.batchId.length > 0;
                const parsedBatch = batchSnapshot?.exists
                    ? emoticonBatchSchema.safeParse({
                        ...(batchSnapshot.data() || {}),
                        id: batchSnapshot.id,
                    })
                    : null;
                const batch = parsedBatch?.success ? parsedBatch.data : null;
                let acquiredNewBatchSlot = false;
                if (hasBatchLink) {
                    const currentProjectRevision = projectSnapshot?.data()?.revision;
                    const batchItem = batch?.items.find((candidate) => (
                        candidate.itemId === job.projectItemId
                    ));
                    const validBatchLink = Boolean(
                        batchRef
                        && batch
                        && batch.userId === userId
                        && batch.projectId === job.projectId
                        && batch.itemIds.includes(String(job.projectItemId || ''))
                        && Number.isInteger(currentProjectRevision)
                        && batch.projectRevision === currentProjectRevision
                        && job.projectRevision === currentProjectRevision
                        && itemSnapshot?.exists
                        && itemSnapshot.data()?.jobId === jobId
                        && ['queued', 'generating'].includes(String(
                            itemSnapshot.data()?.generationStatus,
                        ))
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
                                && job.projectItemRevision
                                    === batchItem.enqueueProjectItemRevision
                            )
                        ),
                    );
                    const stoppedBatch = Boolean(
                        batch
                        && (
                            batch.cancelRequestedAt
                            || !['preparing', 'running', 'deferred'].includes(batch.status)
                        ),
                    );
                    if (!validBatchLink || stoppedBatch) {
                        const cancelled = stoppedBatch;
                        transaction.update(jobRef, {
                            status: cancelled ? 'cancelled' : 'failed',
                            progress: 100,
                            statusMessage: cancelled
                                ? '배치가 취소되어 예약 작업을 시작하지 않았어요.'
                                : '배치 또는 프로젝트 설정이 변경되어 예약 작업을 안전하게 중단했어요.',
                            error: cancelled ? null : '배치 실행 경계가 더 이상 유효하지 않습니다.',
                            resumeAvailable: false,
                            deferredUntilMs: null,
                            ...(cancelled
                                ? { cancelledAt: FieldValue.serverTimestamp() }
                                : { failedAt: FieldValue.serverTimestamp() }),
                            updatedAt: FieldValue.serverTimestamp(),
                        });
                        if (
                            itemRef
                            && itemSnapshot?.exists
                            && itemSnapshot.data()?.jobId === jobId
                        ) {
                            transaction.update(itemRef, {
                                generationStatus: cancelled ? 'planned' : 'failed',
                                ...(cancelled
                                    ? {}
                                    : { validationErrors: ['배치 또는 프로젝트 설정이 변경되었습니다.'] }),
                                serverRevision: FieldValue.increment(1),
                                updatedAt: FieldValue.serverTimestamp(),
                            });
                        }
                        transaction.update(queueRef, {
                            status: cancelled ? 'cancelled' : 'invalid',
                            executeAtMs: RETIRED_EXECUTE_AT_MS,
                            expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                            updatedAt: FieldValue.serverTimestamp(),
                        });
                        return 'retired' as const;
                    }

                    const slot = resolveEmoticonBatchExecutionSlot({
                        executionJobIds: batch!.executionJobIds,
                        requestedConcurrency: batch!.requestedConcurrency,
                        jobId,
                    });
                    if (slot.outcome === 'deferred') {
                        const nextExecuteAtMs = nowMs + BATCH_SLOT_RETRY_MS;
                        transaction.update(queueRef, {
                            reason: 'batch_concurrency',
                            executeAtMs: nextExecuteAtMs,
                            expiresAt: admin.firestore.Timestamp.fromMillis(
                                nextExecuteAtMs + QUEUE_TTL_MS,
                            ),
                            updatedAt: FieldValue.serverTimestamp(),
                        });
                        transaction.update(jobRef, {
                            status: 'queued',
                            statusMessage: '선택한 동시 실행 수에 맞춰 대기 중이에요. 앞 작업이 끝나면 자동으로 시작합니다.',
                            deferredUntilMs: nextExecuteAtMs,
                            generationRunLeaseExpiresAtMs: nextExecuteAtMs + RUN_LEASE_MS,
                            resumeAvailable: false,
                            updatedAt: FieldValue.serverTimestamp(),
                        });
                        return 'deferred' as const;
                    }
                    if (slot.outcome === 'acquired') {
                        transaction.update(batchRef!, {
                            executionJobIds: slot.executionJobIds,
                            executionSlotUpdatedAt: FieldValue.serverTimestamp(),
                            updatedAt: FieldValue.serverTimestamp(),
                        });
                        acquiredNewBatchSlot = true;
                    }
                }

                const runToken = typeof job.generationRunToken === 'string'
                    ? job.generationRunToken
                    : randomUUID();
                const token = randomUUID();
                const stage = continuationStage(job.mode);
                const continuationRef = db.collection('emoticonStudioContinuations').doc(token);
                const persistedState = {
                    stage,
                    retryCount: 0,
                    state: 'queued',
                    token,
                    requestedAt: FieldValue.serverTimestamp(),
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
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                transaction.update(jobRef, {
                    generationRunToken: runToken,
                    generationRunLeaseExpiresAtMs: nowMs + RUN_LEASE_MS,
                    status: jobStatus(stage),
                    statusMessage: '예약된 순서가 되어 작업을 시작했어요.',
                    frameContinuation: persistedState,
                    deferredUntilMs: null,
                    resumeAvailable: true,
                    ...(acquiredNewBatchSlot
                        ? { batchExecutionSlotAcquiredAt: FieldValue.serverTimestamp() }
                        : {}),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                if (
                    itemRef
                    && itemSnapshot?.exists
                    && itemSnapshot.data()?.jobId === jobId
                    && ['queued', 'generating'].includes(String(itemSnapshot.data()?.generationStatus))
                ) {
                    const serverRevision = typeof itemSnapshot.data()?.serverRevision === 'number'
                        ? itemSnapshot.data()!.serverRevision + 1
                        : 1;
                    transaction.update(itemRef, {
                        generationStatus: 'generating',
                        serverRevision,
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                }
                transaction.update(queueRef, {
                    status: 'released',
                    continuationToken: token,
                    executeAtMs: RETIRED_EXECUTE_AT_MS,
                    releasedAt: FieldValue.serverTimestamp(),
                    expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + QUEUE_TTL_MS),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                return 'released' as const;
            });
}

function deferredQueueDocumentId(userId: string, jobId: string): string {
    return createHash('sha256').update(`${userId}:${jobId}`).digest('hex');
}

/**
 * Tries the batch's known queued jobs in stable item order. Direct queue reads
 * avoid a collection scan and keep simultaneous terminal triggers idempotent:
 * the queue document and execution-slot claim are changed in one transaction.
 */
export async function wakeNextDeferredEmoticonBatchJob(params: {
    userId: string;
    batchId: string;
    candidateJobIds?: string[];
    nowMs?: number;
}): Promise<DeferredReleaseOutcome> {
    if (
        !params.userId
        || params.userId.includes('/')
        || !SAFE_ID.test(params.batchId)
    ) return 'ignored';
    let requestedCandidateJobIds = params.candidateJobIds;
    if (!requestedCandidateJobIds) {
        const batchSnapshot = await db.doc(
            `users/${params.userId}/emoticonBatches/${params.batchId}`,
        ).get();
        const parsedBatch = batchSnapshot.exists
            ? emoticonBatchSchema.safeParse({
                ...(batchSnapshot.data() || {}),
                id: batchSnapshot.id,
            })
            : null;
        if (
            !parsedBatch?.success
            || parsedBatch.data.userId !== params.userId
            || parsedBatch.data.cancelRequestedAt
            || !['preparing', 'running', 'deferred'].includes(parsedBatch.data.status)
        ) return 'ignored';
        const executionJobIds = new Set(parsedBatch.data.executionJobIds);
        requestedCandidateJobIds = parsedBatch.data.items
            .filter((item) => (
                item.currentJobId
                && !executionJobIds.has(item.currentJobId)
                && !['completed', 'failed', 'cancelled', 'not_enqueued'].includes(item.status)
            ))
            .map((item) => item.currentJobId as string);
    }
    const candidateJobIds = [...new Set(requestedCandidateJobIds)]
        .filter((jobId) => SAFE_ID.test(jobId))
        .slice(0, 64);
    let retiredAny = false;
    for (const jobId of candidateJobIds) {
        const outcome = await releaseDeferredQueueDocument({
            queueRef: db.collection(QUEUE_COLLECTION).doc(
                deferredQueueDocumentId(params.userId, jobId),
            ),
            nowMs: params.nowMs ?? Date.now(),
            immediateBatchWake: {
                userId: params.userId,
                batchId: params.batchId,
            },
        });
        if (outcome === 'released' || outcome === 'deferred') return outcome;
        if (outcome === 'retired') retiredAny = true;
    }
    return retiredAny ? 'retired' : 'ignored';
}

export const releaseDeferredEmoticonJobs = onSchedule(
    {
        schedule: '* * * * *',
        timeZone: 'UTC',
        region: 'asia-northeast3',
        timeoutSeconds: 120,
        memory: '256MiB',
        retryCount: 2,
    },
    async () => {
        const nowMs = Date.now();
        const dueSnapshot = await db.collection(QUEUE_COLLECTION)
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
            if (outcome === 'released') released += 1;
            if (outcome === 'retired') retired += 1;
            if (outcome === 'deferred') deferred += 1;
        }

        logger.info('[EmoticonStudio] Deferred queue release completed.', {
            inspected: dueSnapshot.size,
            released,
            retired,
            deferred,
        });
    },
);
