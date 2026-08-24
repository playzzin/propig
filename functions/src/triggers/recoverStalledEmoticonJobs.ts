import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
    EMOTICON_STALLED_RUN_RECOVERY_MS,
    EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS,
    recoverStalledEmoticonJobInPlace,
    type EmoticonRecoveryResult,
} from '../emoticonStudio/jobRecovery';
import { db } from '../firestore';

const RECOVERY_SCAN_LIMIT_PER_STATUS = 50;
const RECOVERY_SCAN_PAGES_PER_STATUS = 10;
const RECOVERY_CONCURRENCY = 8;
const MAX_RECOVERY_CANDIDATES = 300;
const WORKING_STATUSES = [
    'queued',
    'analyzing',
    'generating',
    'validating',
    'animating',
    'rendering',
] as const;

type RecoveryCandidate = {
    userId: string;
    jobId: string;
};

function candidateIdentity(
    document: admin.firestore.QueryDocumentSnapshot,
): RecoveryCandidate | null {
    if (document.ref.parent.id !== 'emoticonJobs') return null;
    const userDocument = document.ref.parent.parent;
    if (!userDocument || userDocument.parent.id !== 'users') return null;
    const userId = userDocument.id;
    const jobId = document.id;
    if (!userId || !/^[A-Za-z0-9_-]{1,160}$/.test(jobId)) return null;
    return { userId, jobId };
}

async function scanRecoveryCandidates(nowMs: number): Promise<RecoveryCandidate[]> {
    const candidates = new Map<string, RecoveryCandidate>();
    const statusOffset = Math.floor(nowMs / (5 * 60 * 1000)) % WORKING_STATUSES.length;
    const statuses = [
        ...WORKING_STATUSES.slice(statusOffset),
        ...WORKING_STATUSES.slice(0, statusOffset),
    ];
    statusLoop: for (const status of statuses) {
        const minimumAgeMs = status === 'queued'
            ? EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS
            : EMOTICON_STALLED_RUN_RECOVERY_MS;
        let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
        for (let page = 0; page < RECOVERY_SCAN_PAGES_PER_STATUS; page += 1) {
            let query: admin.firestore.Query = db.collectionGroup('emoticonJobs')
                .where('status', '==', status)
                .where(
                    'updatedAt',
                    '<=',
                    admin.firestore.Timestamp.fromMillis(nowMs - minimumAgeMs),
                )
                .orderBy('updatedAt', 'asc')
                .limit(RECOVERY_SCAN_LIMIT_PER_STATUS);
            if (cursor) query = query.startAfter(cursor);
            const snapshot = await query.get();
            snapshot.docs.forEach((document) => {
                if (candidates.size >= MAX_RECOVERY_CANDIDATES) return;
                const nextRecoveryAtMs = document.data().nextRecoveryAtMs;
                if (typeof nextRecoveryAtMs === 'number' && nextRecoveryAtMs > nowMs) return;
                const identity = candidateIdentity(document);
                if (identity) candidates.set(`${identity.userId}:${identity.jobId}`, identity);
            });
            if (candidates.size >= MAX_RECOVERY_CANDIDATES) break statusLoop;
            if (snapshot.size < RECOVERY_SCAN_LIMIT_PER_STATUS) break;
            cursor = snapshot.docs[snapshot.docs.length - 1];
        }
    }
    return [...candidates.values()];
}

async function recoverCandidates(
    candidates: RecoveryCandidate[],
    nowMs: number,
): Promise<EmoticonRecoveryResult[]> {
    const results: EmoticonRecoveryResult[] = [];
    for (let offset = 0; offset < candidates.length; offset += RECOVERY_CONCURRENCY) {
        const batch = candidates.slice(offset, offset + RECOVERY_CONCURRENCY);
        const settled = await Promise.all(batch.map(async (candidate) => {
            try {
                return await recoverStalledEmoticonJobInPlace({ ...candidate, nowMs });
            } catch (error) {
                logger.error('[EmoticonStudio] Automatic stalled-job recovery transaction failed.', {
                    ...candidate,
                    error: error instanceof Error ? error.message : String(error),
                });
                return null;
            }
        }));
        settled.forEach((result) => {
            if (result) results.push(result);
        });
    }
    return results;
}

export const recoverStalledEmoticonJobs = onSchedule(
    {
        schedule: 'every 5 minutes',
        timeZone: 'UTC',
        region: 'asia-northeast3',
        timeoutSeconds: 300,
        memory: '256MiB',
        retryCount: 2,
    },
    async () => {
        const nowMs = Date.now();
        const candidates = await scanRecoveryCandidates(nowMs);
        const results = await recoverCandidates(candidates, nowMs);
        const resumed = results.filter((result) => result.outcome === 'resumed').length;
        const alreadyRecovering = results.filter(
            (result) => result.outcome === 'already-recovering',
        ).length;
        const skippedByReason = results.reduce<Record<string, number>>((counts, result) => {
            if (result.outcome !== 'skipped') return counts;
            counts[result.reason] = (counts[result.reason] || 0) + 1;
            return counts;
        }, {});
        logger.info('[EmoticonStudio] Automatic stalled-job sweep completed.', {
            candidates: candidates.length,
            resumed,
            alreadyRecovering,
            skippedByReason,
        });
    },
);
