import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { VideoStudioWorkerError, processQueuedVideoStudioJob } from '../videoStudio/processor';
import { grokApiKey } from '../secrets';

const triggerConfig = {
    document: 'video_studio_jobs/{jobId}',
    timeoutSeconds: 540,
    memory: '2GiB' as const,
    region: 'asia-northeast3',
    secrets: [grokApiKey],
};

async function processQueuedJobById(jobId: string) {
    try {
        await processQueuedVideoStudioJob(jobId);
        logger.info('[VideoStudioJobTrigger] Successfully processed queued job.', { jobId });
    } catch (error) {
        if (error instanceof VideoStudioWorkerError && error.status === 409) {
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

export const onVideoStudioJobQueued = onDocumentCreated(triggerConfig, async (event) => {
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

export const onVideoStudioJobRequeued = onDocumentUpdated(triggerConfig, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
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
