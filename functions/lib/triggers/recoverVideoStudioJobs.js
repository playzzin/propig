"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoverVideoStudioJobs = void 0;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const firestore_1 = require("../firestore");
const JOBS = 'video_studio_jobs';
const ACTIVE_STALE_MS = 12 * 60 * 1000;
const QUEUED_STALE_MS = 3 * 60 * 1000;
const RECOVERY_BATCH_SIZE = 250;
function timestampMillis(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (value instanceof Date)
        return value.getTime();
    if (!value || typeof value !== 'object')
        return null;
    const candidate = value;
    if (typeof candidate.toMillis === 'function') {
        const millis = candidate.toMillis();
        return Number.isFinite(millis) ? millis : null;
    }
    return typeof candidate.seconds === 'number' && Number.isFinite(candidate.seconds)
        ? candidate.seconds * 1000
        : null;
}
async function recoverActiveJobs(now) {
    var _a, _b;
    let recovered = 0;
    for (const status of ['running', 'uploading']) {
        const snapshot = await firestore_1.db.collection(JOBS)
            .where('status', '==', status)
            .limit(RECOVERY_BATCH_SIZE)
            .get();
        for (const document of snapshot.docs) {
            const job = document.data();
            const lastActivity = (_b = (_a = timestampMillis(job.heartbeatAt)) !== null && _a !== void 0 ? _a : timestampMillis(job.updatedAt)) !== null && _b !== void 0 ? _b : timestampMillis(job.claimedAt);
            if (lastActivity === null || now - lastActivity <= ACTIVE_STALE_MS)
                continue;
            await firestore_1.db.runTransaction(async (transaction) => {
                var _a, _b;
                const currentSnapshot = await transaction.get(document.ref);
                if (!currentSnapshot.exists)
                    return;
                const current = currentSnapshot.data() || {};
                if (current.status !== status)
                    return;
                const currentActivity = (_b = (_a = timestampMillis(current.heartbeatAt)) !== null && _a !== void 0 ? _a : timestampMillis(current.updatedAt)) !== null && _b !== void 0 ? _b : timestampMillis(current.claimedAt);
                if (currentActivity === null || now - currentActivity <= ACTIVE_STALE_MS)
                    return;
                transaction.update(document.ref, {
                    status: 'queued',
                    message: 'A stalled worker lease was recovered. Processing will resume automatically.',
                    claimedAt: null,
                    heartbeatAt: null,
                    leaseExpiresAt: null,
                    nextAttemptAt: null,
                    'metadata.queueDispatchToken': (0, node_crypto_1.randomUUID)(),
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
async function redispatchQueuedJobs(now) {
    const snapshot = await firestore_1.db.collection(JOBS)
        .where('status', '==', 'queued')
        .limit(RECOVERY_BATCH_SIZE)
        .get();
    let redispatched = 0;
    for (const document of snapshot.docs) {
        const job = document.data();
        const nextAttemptAt = timestampMillis(job.nextAttemptAt);
        const updatedAt = timestampMillis(job.updatedAt);
        const retryDue = nextAttemptAt !== null && nextAttemptAt <= now;
        const staleQueue = nextAttemptAt === null
            && updatedAt !== null
            && now - updatedAt > QUEUED_STALE_MS;
        if (!retryDue && !staleQueue)
            continue;
        await firestore_1.db.runTransaction(async (transaction) => {
            const currentSnapshot = await transaction.get(document.ref);
            if (!currentSnapshot.exists)
                return;
            const current = currentSnapshot.data() || {};
            if (current.status !== 'queued')
                return;
            const currentNextAttemptAt = timestampMillis(current.nextAttemptAt);
            const currentUpdatedAt = timestampMillis(current.updatedAt);
            const currentRetryDue = currentNextAttemptAt !== null && currentNextAttemptAt <= now;
            const currentStaleQueue = currentNextAttemptAt === null
                && currentUpdatedAt !== null
                && now - currentUpdatedAt > QUEUED_STALE_MS;
            if (!currentRetryDue && !currentStaleQueue)
                return;
            transaction.update(document.ref, {
                nextAttemptAt: null,
                'metadata.queueDispatchToken': (0, node_crypto_1.randomUUID)(),
                'metadata.lastRedispatchAt': new Date(now).toISOString(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            redispatched += 1;
        });
    }
    return redispatched;
}
exports.recoverVideoStudioJobs = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
    timeoutSeconds: 240,
    memory: '512MiB',
}, async () => {
    const now = Date.now();
    const [recovered, redispatched] = await Promise.all([
        recoverActiveJobs(now),
        redispatchQueuedJobs(now),
    ]);
    logger.info('[VideoStudioRecovery] Recovery scan completed.', {
        recovered,
        redispatched,
    });
});
//# sourceMappingURL=recoverVideoStudioJobs.js.map