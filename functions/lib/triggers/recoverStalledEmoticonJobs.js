"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoverStalledEmoticonJobs = void 0;
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const jobRecovery_1 = require("../emoticonStudio/jobRecovery");
const firestore_1 = require("../firestore");
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
];
function candidateIdentity(document) {
    if (document.ref.parent.id !== 'emoticonJobs')
        return null;
    const userDocument = document.ref.parent.parent;
    if (!userDocument || userDocument.parent.id !== 'users')
        return null;
    const userId = userDocument.id;
    const jobId = document.id;
    if (!userId || !/^[A-Za-z0-9_-]{1,160}$/.test(jobId))
        return null;
    return { userId, jobId };
}
async function scanRecoveryCandidates(nowMs) {
    const candidates = new Map();
    const statusOffset = Math.floor(nowMs / (5 * 60 * 1000)) % WORKING_STATUSES.length;
    const statuses = [
        ...WORKING_STATUSES.slice(statusOffset),
        ...WORKING_STATUSES.slice(0, statusOffset),
    ];
    statusLoop: for (const status of statuses) {
        const minimumAgeMs = status === 'queued'
            ? jobRecovery_1.EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS
            : jobRecovery_1.EMOTICON_STALLED_RUN_RECOVERY_MS;
        let cursor;
        for (let page = 0; page < RECOVERY_SCAN_PAGES_PER_STATUS; page += 1) {
            let query = firestore_1.db.collectionGroup('emoticonJobs')
                .where('status', '==', status)
                .where('updatedAt', '<=', admin.firestore.Timestamp.fromMillis(nowMs - minimumAgeMs))
                .orderBy('updatedAt', 'asc')
                .limit(RECOVERY_SCAN_LIMIT_PER_STATUS);
            if (cursor)
                query = query.startAfter(cursor);
            const snapshot = await query.get();
            snapshot.docs.forEach((document) => {
                if (candidates.size >= MAX_RECOVERY_CANDIDATES)
                    return;
                const nextRecoveryAtMs = document.data().nextRecoveryAtMs;
                if (typeof nextRecoveryAtMs === 'number' && nextRecoveryAtMs > nowMs)
                    return;
                const identity = candidateIdentity(document);
                if (identity)
                    candidates.set(`${identity.userId}:${identity.jobId}`, identity);
            });
            if (candidates.size >= MAX_RECOVERY_CANDIDATES)
                break statusLoop;
            if (snapshot.size < RECOVERY_SCAN_LIMIT_PER_STATUS)
                break;
            cursor = snapshot.docs[snapshot.docs.length - 1];
        }
    }
    return [...candidates.values()];
}
async function recoverCandidates(candidates, nowMs) {
    const results = [];
    for (let offset = 0; offset < candidates.length; offset += RECOVERY_CONCURRENCY) {
        const batch = candidates.slice(offset, offset + RECOVERY_CONCURRENCY);
        const settled = await Promise.all(batch.map(async (candidate) => {
            try {
                return await (0, jobRecovery_1.recoverStalledEmoticonJobInPlace)(Object.assign(Object.assign({}, candidate), { nowMs }));
            }
            catch (error) {
                logger.error('[EmoticonStudio] Automatic stalled-job recovery transaction failed.', Object.assign(Object.assign({}, candidate), { error: error instanceof Error ? error.message : String(error) }));
                return null;
            }
        }));
        settled.forEach((result) => {
            if (result)
                results.push(result);
        });
    }
    return results;
}
exports.recoverStalledEmoticonJobs = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    region: 'asia-northeast3',
    timeoutSeconds: 300,
    memory: '256MiB',
    retryCount: 2,
}, async () => {
    const nowMs = Date.now();
    const candidates = await scanRecoveryCandidates(nowMs);
    const results = await recoverCandidates(candidates, nowMs);
    const resumed = results.filter((result) => result.outcome === 'resumed').length;
    const alreadyRecovering = results.filter((result) => result.outcome === 'already-recovering').length;
    const skippedByReason = results.reduce((counts, result) => {
        if (result.outcome !== 'skipped')
            return counts;
        counts[result.reason] = (counts[result.reason] || 0) + 1;
        return counts;
    }, {});
    logger.info('[EmoticonStudio] Automatic stalled-job sweep completed.', {
        candidates: candidates.length,
        resumed,
        alreadyRecovering,
        skippedByReason,
    });
});
//# sourceMappingURL=recoverStalledEmoticonJobs.js.map