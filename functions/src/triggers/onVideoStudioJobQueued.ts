import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { VideoStudioWorkerError, processQueuedVideoStudioJob } from '../videoStudio/processor';
import { openRouterApiKey } from '../secrets';
import { FIRESTORE_DATABASE_ID } from '../firestore';

const triggerConfig = {
    document: 'video_studio_jobs/{jobId}',
    database: FIRESTORE_DATABASE_ID,
    timeoutSeconds: 540,
    memory: '2GiB' as const,
    region: 'asia-northeast3',
    secrets: [openRouterApiKey],
};

async function processQueuedJobById(jobId: string) {
    try {
        await processQueuedVideoStudioJob(jobId);
        logger.info('[VideoStudioJobTrigger] Successfully processed queued job.', { jobId });
    } catch (error) {
        if (
            error instanceof VideoStudioWorkerError
            && (error.status === 409 || error.status === 425)
        ) {
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

function queueDispatchToken(job: unknown): string | null {
    if (!job || typeof job !== 'object') return null;
    const metadata = (job as { metadata?: unknown }).metadata;
    if (!metadata || typeof metadata !== 'object') return null;
    const token = (metadata as { queueDispatchToken?: unknown }).queueDispatchToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
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
