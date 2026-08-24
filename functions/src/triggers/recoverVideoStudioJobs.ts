import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { db } from '../firestore';

const JOBS = 'video_studio_jobs';
const ACTIVE_STALE_MS = 12 * 60 * 1000;
const QUEUED_STALE_MS = 3 * 60 * 1000;
const RECOVERY_BATCH_SIZE = 250;
const STAGING_CLEANUP_BATCH_SIZE = 100;
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'canceled']);

function timestampMillis(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (!value || typeof value !== 'object') return null;
    const candidate = value as { toMillis?: () => number; seconds?: number };
    if (typeof candidate.toMillis === 'function') {
        const millis = candidate.toMillis();
        return Number.isFinite(millis) ? millis : null;
    }
    return typeof candidate.seconds === 'number' && Number.isFinite(candidate.seconds)
        ? candidate.seconds * 1000
        : null;
}

async function recoverActiveJobs(now: number): Promise<number> {
    let recovered = 0;
    const staleCutoff = admin.firestore.Timestamp.fromMillis(now - ACTIVE_STALE_MS);
    for (const status of ['running', 'uploading'] as const) {
        const snapshot = await db.collection(JOBS)
            .where('status', '==', status)
            .where('updatedAt', '<=', staleCutoff)
            .orderBy('updatedAt', 'asc')
            .limit(RECOVERY_BATCH_SIZE)
            .get();
        for (const document of snapshot.docs) {
            const job = document.data();
            const lastActivity =
                timestampMillis(job.heartbeatAt)
                ?? timestampMillis(job.updatedAt)
                ?? timestampMillis(job.claimedAt);
            if (lastActivity === null || now - lastActivity <= ACTIVE_STALE_MS) continue;

            await db.runTransaction(async (transaction) => {
                const currentSnapshot = await transaction.get(document.ref);
                if (!currentSnapshot.exists) return;
                const current = currentSnapshot.data() || {};
                if (current.status !== status) return;
                if (current.cancelRequestedAt) {
                    transaction.update(document.ref, {
                        status: 'canceled',
                        message: 'Cancellation completed during worker recovery.',
                        errorMessage: null,
                        nextAttemptAt: null,
                        heartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
                        leaseExpiresAt: null,
                        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
                        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    return;
                }
                const currentActivity =
                    timestampMillis(current.heartbeatAt)
                    ?? timestampMillis(current.updatedAt)
                    ?? timestampMillis(current.claimedAt);
                if (currentActivity === null || now - currentActivity <= ACTIVE_STALE_MS) return;

                transaction.update(document.ref, {
                    status: 'queued',
                    message: 'A stalled worker lease was recovered. Processing will resume automatically.',
                    claimedAt: null,
                    heartbeatAt: null,
                    leaseExpiresAt: null,
                    nextAttemptAt: null,
                    'metadata.queueDispatchToken': randomUUID(),
                    'metadata.lastRecovery': {
                        reason: 'stale_worker_lease',
                        recoveredAt: new Date(now).toISOString(),
                    },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                recovered += 1;
            });
        }
    }
    return recovered;
}

async function redispatchQueuedJobs(now: number): Promise<number> {
    const nowTimestamp = admin.firestore.Timestamp.fromMillis(now);
    const staleCutoff = admin.firestore.Timestamp.fromMillis(now - QUEUED_STALE_MS);
    const [retrySnapshot, staleSnapshot] = await Promise.all([
        db.collection(JOBS)
            .where('status', '==', 'queued')
            .where('nextAttemptAt', '<=', nowTimestamp)
            .orderBy('nextAttemptAt', 'asc')
            .limit(RECOVERY_BATCH_SIZE)
            .get(),
        db.collection(JOBS)
            .where('status', '==', 'queued')
            .where('nextAttemptAt', '==', null)
            .where('updatedAt', '<=', staleCutoff)
            .orderBy('updatedAt', 'asc')
            .limit(RECOVERY_BATCH_SIZE)
            .get(),
    ]);
    const documents = [
        ...new Map(
            [...retrySnapshot.docs, ...staleSnapshot.docs].map((document) => [
                document.id,
                document,
            ]),
        ).values(),
    ];
    let redispatched = 0;

    for (const document of documents) {
        const job = document.data();
        const nextAttemptAt = timestampMillis(job.nextAttemptAt);
        const updatedAt = timestampMillis(job.updatedAt);
        const retryDue = nextAttemptAt !== null && nextAttemptAt <= now;
        const staleQueue =
            nextAttemptAt === null
            && updatedAt !== null
            && now - updatedAt > QUEUED_STALE_MS;
        if (!retryDue && !staleQueue) continue;

        await db.runTransaction(async (transaction) => {
            const currentSnapshot = await transaction.get(document.ref);
            if (!currentSnapshot.exists) return;
            const current = currentSnapshot.data() || {};
            if (current.status !== 'queued') return;
            if (current.cancelRequestedAt) {
                transaction.update(document.ref, {
                    status: 'canceled',
                    message: 'Cancellation completed before queued work was redispatched.',
                    errorMessage: null,
                    nextAttemptAt: null,
                    heartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
                    leaseExpiresAt: null,
                    canceledAt: admin.firestore.FieldValue.serverTimestamp(),
                    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return;
            }

            const currentNextAttemptAt = timestampMillis(current.nextAttemptAt);
            const currentUpdatedAt = timestampMillis(current.updatedAt);
            const currentRetryDue =
                currentNextAttemptAt !== null && currentNextAttemptAt <= now;
            const currentStaleQueue =
                currentNextAttemptAt === null
                && currentUpdatedAt !== null
                && now - currentUpdatedAt > QUEUED_STALE_MS;
            if (!currentRetryDue && !currentStaleQueue) return;

            transaction.update(document.ref, {
                nextAttemptAt: null,
                'metadata.queueDispatchToken': randomUUID(),
                'metadata.lastRedispatchAt': new Date(now).toISOString(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            redispatched += 1;
        });
    }

    return redispatched;
}

async function cleanupFinalizedStagingArtifacts(now: number): Promise<{
    cleanedJobs: number;
    cleanedObjects: number;
}> {
    const snapshot = await db.collection(JOBS)
        .where('stagingCleanupPending', '==', true)
        .limit(STAGING_CLEANUP_BATCH_SIZE)
        .get();
    let cleanedJobs = 0;
    let cleanedObjects = 0;

    for (const document of snapshot.docs) {
        const job = document.data();
        if (!TERMINAL_JOB_STATUSES.has(String(job.status || ''))) continue;
        const userId = typeof job.userId === 'string' ? job.userId : '';
        const projectId = typeof job.projectId === 'string' ? job.projectId : '';
        if (!userId || !projectId) continue;

        const ownedPrefix = `video_studio/${userId}/${projectId}/`;
        const pendingPaths = Array.isArray(job.stagingCleanupPaths)
            ? [...new Set(job.stagingCleanupPaths.filter((path): path is string =>
                  typeof path === 'string'
                  && path.startsWith(ownedPrefix)
                  && path.includes('/staging/')))]
            : [];
        const cleanedPaths: string[] = [];

        for (const storagePath of pendingPaths) {
            try {
                await admin.storage().bucket().file(storagePath).delete({ ignoreNotFound: true });
                cleanedPaths.push(storagePath);
                cleanedObjects += 1;
            } catch (error) {
                logger.warn('[VideoStudioRecovery] Finalized staging cleanup will be retried.', {
                    jobId: document.id,
                    storagePath,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        const cleanupFinished = await db.runTransaction(async (transaction) => {
            const currentSnapshot = await transaction.get(document.ref);
            if (!currentSnapshot.exists) return false;
            const current = currentSnapshot.data() || {};
            const currentUserId = typeof current.userId === 'string' ? current.userId : '';
            const currentProjectId = typeof current.projectId === 'string' ? current.projectId : '';
            const currentPrefix = `video_studio/${currentUserId}/${currentProjectId}/`;
            const currentPaths = Array.isArray(current.stagingCleanupPaths)
                ? [...new Set(current.stagingCleanupPaths.filter((path): path is string =>
                      typeof path === 'string'
                      && path.startsWith(currentPrefix)
                      && path.includes('/staging/')))]
                : [];
            const cleanedSet = new Set(cleanedPaths);
            const remainingPaths = currentPaths.filter((path) => !cleanedSet.has(path));
            const checkpoint = current.metadata?.providerOutputStaging;
            const checkpointPath = checkpoint && typeof checkpoint === 'object'
                ? (checkpoint as { storagePath?: unknown; status?: unknown }).storagePath
                : null;
            const checkpointFinalized = checkpoint && typeof checkpoint === 'object'
                ? (checkpoint as { status?: unknown }).status === 'finalized'
                : false;
            const clearedCurrentCheckpoint = checkpointFinalized
                && typeof checkpointPath === 'string'
                && cleanedSet.has(checkpointPath);

            transaction.update(document.ref, {
                stagingCleanupPending: remainingPaths.length > 0,
                stagingCleanupPaths: remainingPaths,
                stagingCleanupLastAttemptAt: new Date(now).toISOString(),
                ...(clearedCurrentCheckpoint ? { 'metadata.providerOutputStaging': null } : {}),
                ...(remainingPaths.length === 0 ? { 'metadata.providerOutputStagingCleanup': null } : {}),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return remainingPaths.length === 0;
        });
        if (cleanupFinished) cleanedJobs += 1;
    }

    return { cleanedJobs, cleanedObjects };
}

export const recoverVideoStudioJobs = onSchedule(
    {
        schedule: 'every 1 minutes',
        timeZone: 'Asia/Seoul',
        region: 'asia-northeast3',
        timeoutSeconds: 240,
        memory: '512MiB',
    },
    async () => {
        const now = Date.now();
        const [recovered, redispatched, stagingCleanup] = await Promise.all([
            recoverActiveJobs(now),
            redispatchQueuedJobs(now),
            cleanupFinalizedStagingArtifacts(now),
        ]);
        logger.info('[VideoStudioRecovery] Recovery scan completed.', {
            recovered,
            redispatched,
            ...stagingCleanup,
        });
    },
);
