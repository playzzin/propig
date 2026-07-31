"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onVideoStudioJobRequeued = exports.onVideoStudioJobQueued = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const processor_1 = require("../videoStudio/processor");
const secrets_1 = require("../secrets");
const firestore_2 = require("../firestore");
const triggerConfig = {
    document: 'video_studio_jobs/{jobId}',
    database: firestore_2.FIRESTORE_DATABASE_ID,
    timeoutSeconds: 540,
    memory: '2GiB',
    region: 'asia-northeast3',
    secrets: [secrets_1.openRouterApiKey],
};
async function processQueuedJobById(jobId) {
    try {
        await (0, processor_1.processQueuedVideoStudioJob)(jobId);
        logger.info('[VideoStudioJobTrigger] Successfully processed queued job.', { jobId });
    }
    catch (error) {
        if (error instanceof processor_1.VideoStudioWorkerError
            && (error.status === 409 || error.status === 425)) {
            logger.info('[VideoStudioJobTrigger] Job is not due yet or was claimed by another processor.', {
                jobId,
                status: error.status,
            });
            return;
        }
        logger.error('[VideoStudioJobTrigger] Failed to process queued job.', {
            jobId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
function queueDispatchToken(job) {
    if (!job || typeof job !== 'object')
        return null;
    const metadata = job.metadata;
    if (!metadata || typeof metadata !== 'object')
        return null;
    const token = metadata.queueDispatchToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
}
exports.onVideoStudioJobQueued = (0, firestore_1.onDocumentCreated)(triggerConfig, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.warn('[VideoStudioJobTrigger] No data associated with the create event');
        return;
    }
    const job = snapshot.data();
    const jobId = event.params.jobId;
    if (job.status !== 'queued') {
        return;
    }
    await processQueuedJobById(jobId);
});
exports.onVideoStudioJobRequeued = (0, firestore_1.onDocumentUpdated)(triggerConfig, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    const jobId = event.params.jobId;
    if (!before || !after) {
        logger.warn('[VideoStudioJobTrigger] Missing before/after data for update event', { jobId });
        return;
    }
    const transitionedToQueued = before.status !== 'queued' && after.status === 'queued';
    const redispatchedQueuedJob = before.status === 'queued'
        && after.status === 'queued'
        && queueDispatchToken(before) !== queueDispatchToken(after)
        && queueDispatchToken(after) !== null;
    if (!transitionedToQueued && !redispatchedQueuedJob) {
        return;
    }
    logger.info('[VideoStudioJobTrigger] Dispatching queued job.', {
        jobId,
        reason: redispatchedQueuedJob ? 'manual-redispatch' : 'status-transition',
    });
    await processQueuedJobById(jobId);
});
//# sourceMappingURL=onVideoStudioJobQueued.js.map