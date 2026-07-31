import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { db } from '../firestore';

const JOBS = 'video_studio_jobs';
const ACTIVE_STALE_MS = 12 * 60 * 1000;
const QUEUED_STALE_MS = 3 * 60 * 1000;
const RECOVERY_BATCH_SIZE = 250;

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
    for (const status of ['running', 'uploading'] as const) {
        const snapshot = await db.collection(JOBS)
            .where('status', '==', status)
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
    const snapshot = await db.collection(JOBS)
        .where('status', '==', 'queued')
        .limit(RECOVERY_BATCH_SIZE)
        .get();
    let redispatched = 0;

    for (const document of snapshot.docs) {
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

export const recoverVideoStudioJobs = onSchedule(
    {
        schedule: 'every 5 minutes',
        timeZone: 'Asia/Seoul',
        region: 'asia-northeast3',
        timeoutSeconds: 240,
        memory: '512MiB',
    },
    async () => {
        const now = Date.now();
        const [recovered, redispatched] = await Promise.all([
            recoverActiveJobs(now),
            redispatchQueuedJobs(now),
        ]);
        logger.info('[VideoStudioRecovery] Recovery scan completed.', {
            recovered,
            redispatched,
        });
    },
);
