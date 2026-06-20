"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onVideoStudioJobRequeued = exports.onVideoStudioJobQueued = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const processor_1 = require("../videoStudio/processor");
const secrets_1 = require("../secrets");
const triggerConfig = {
    document: 'video_studio_jobs/{jobId}',
    timeoutSeconds: 540,
    memory: '2GiB',
    region: 'asia-northeast3',
    secrets: [secrets_1.grokApiKey],
};
async function processQueuedJobById(jobId) {
    try {
        await (0, processor_1.processQueuedVideoStudioJob)(jobId);
        logger.info('[VideoStudioJobTrigger] Successfully processed queued job.', { jobId });
    }
    catch (error) {
        if (error instanceof processor_1.VideoStudioWorkerError && error.status === 409) {
            logger.info('[VideoStudioJobTrigger] Job was already claimed by another processor.', {
                jobId,
            });
            return;
        }
        logger.error('[VideoStudioJobTrigger] Failed to process queued job.', {
            jobId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
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
    if (before.status === 'queued' || after.status !== 'queued') {
        return;
    }
    await processQueuedJobById(jobId);
});
//# sourceMappingURL=onVideoStudioJobQueued.js.map