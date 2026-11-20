"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onVideoStudioJobRequeued = exports.onVideoStudioJobQueued = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const processor_1 = require("../videoStudio/processor");
const workerContract_1 = require("../videoStudio/workerContract");
const secrets_1 = require("../secrets");
const firestore_3 = require("../firestore");
const triggerConfig = {
    document: 'video_studio_jobs/{jobId}',
    database: firestore_3.FIRESTORE_DATABASE_ID,
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
async function completeWorkerContractProbe(probeRef, probe, handler) {
    await probeRef.firestore.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(probeRef);
        if (!currentSnapshot.exists)
            return;
        const currentProbe = (0, workerContract_1.readVideoStudioWorkerProbeRequest)(currentSnapshot.data());
        if (!currentProbe
            || currentProbe.phase !== probe.phase
            || currentProbe.challenge !== probe.challenge)
            return;
        transaction.update(probeRef, {
            status: 'completed',
            progress: 100,
            message: 'Worker contract challenge completed without a provider request.',
            'metadata.workerContractProbe.response': {
                phase: probe.phase,
                challenge: probe.challenge,
                protocolVersion: workerContract_1.VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
                capabilities: [...workerContract_1.VIDEO_STUDIO_WORKER_CAPABILITIES],
                handler,
                completedAt: new Date().toISOString(),
            },
            finishedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
}
exports.onVideoStudioJobQueued = (0, firestore_2.onDocumentCreated)(triggerConfig, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.warn('[VideoStudioJobTrigger] No data associated with the create event');
        return;
    }
    const job = snapshot.data();
    const jobId = event.params.jobId;
    const workerProbe = (0, workerContract_1.readVideoStudioWorkerProbeRequest)(job);
    if (workerProbe) {
        if (workerProbe.phase === 'create') {
            await completeWorkerContractProbe(snapshot.ref, workerProbe, 'onVideoStudioJobQueued');
            logger.info('[VideoStudioJobTrigger] Create-trigger contract challenge completed.', {
                jobId,
                protocolVersion: workerContract_1.VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
            });
        }
        else {
            logger.warn('[VideoStudioJobTrigger] Ignored a probe with an invalid create phase.', { jobId });
        }
        return;
    }
    if (job.status !== 'queued') {
        return;
    }
    await processQueuedJobById(jobId);
});
exports.onVideoStudioJobRequeued = (0, firestore_2.onDocumentUpdated)(triggerConfig, async (event) => {
    const change = event.data;
    const before = change === null || change === void 0 ? void 0 : change.before.data();
    const after = change === null || change === void 0 ? void 0 : change.after.data();
    const jobId = event.params.jobId;
    if (!change || !before || !after) {
        logger.warn('[VideoStudioJobTrigger] Missing before/after data for update event', { jobId });
        return;
    }
    const workerProbe = (0, workerContract_1.readVideoStudioWorkerProbeRequest)(after);
    if (workerProbe) {
        if (workerProbe.phase === 'requeue') {
            await completeWorkerContractProbe(change.after.ref, workerProbe, 'onVideoStudioJobRequeued');
            logger.info('[VideoStudioJobTrigger] Requeue-trigger contract challenge completed.', {
                jobId,
                protocolVersion: workerContract_1.VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
            });
        }
        else {
            logger.warn('[VideoStudioJobTrigger] Ignored a probe with an invalid requeue phase.', { jobId });
        }
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