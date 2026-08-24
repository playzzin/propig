import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import {
    OpenRouterVideoRequestError,
    OpenRouterVideoPendingError,
    deriveVideoInfraHint,
    downloadOpenRouterVideo,
    generateOpenRouterVideo,
    isOpenRouterInputImagePrivacyError,
    isOpenRouterVideoContentAccessError,
    isOpenRouterVideoContentUnavailableError,
    readOpenRouterVideoCheckpoint,
    type OpenRouterVideoCheckpoint,
} from './openrouter';
import {
    extractVideoFrame,
    getVideoCanvasSize,
    inspectVideoBufferQuality,
    mergeVideos,
    normalizeVideoBufferToCanvas,
    PROVIDER_CANVAS_DIMENSION_TOLERANCE_PIXELS,
    type VideoAudioInspection,
    type VideoQualityInspection,
} from './ffmpeg';
import { videoStudioJobRequestSchema, type VideoStudioJobRequest } from './request';
import {
    buildVideoStudioOutputIdentity,
    estimateVideoStudioMergeDuration,
    readProviderOutputStagingCheckpoint,
    readStoredVideoRenderMetadata,
    upsertVideoStudioOutputCheckpoint,
    type ProviderOutputStagingCheckpoint,
    type StoredVideoRenderMetadata,
} from './outputDurability';
import { db } from '../firestore';

const FUNCTION_VIDEO_PROVIDER_POLL_WINDOW_MS = 4 * 60 * 1000;

if (!admin.apps.length) {
    admin.initializeApp();
}

type VideoStudioJobStatus = 'queued' | 'running' | 'uploading' | 'completed' | 'failed' | 'canceled';

type VideoStudioClipMode = 'generate' | 'extend' | 'continue' | 'edit' | 'merge';

type VideoStudioJobDoc = {
    userId: string;
    projectId: string;
    kind: VideoStudioClipMode | 'extract-frame';
    title: string;
    prompt?: string;
    status: VideoStudioJobStatus;
    progress?: number | null;
    message?: string | null;
    clipId?: string | null;
    sourceClipId?: string | null;
    mergeSourceClipIds?: string[];
    resultVideoUrl?: string | null;
    resultFrameUrl?: string | null;
    errorMessage?: string | null;
    attemptCount?: number | null;
    stagingCleanupPending?: boolean;
    stagingCleanupPaths?: string[];
    nextAttemptAt?: unknown;
    heartbeatAt?: unknown;
    leaseExpiresAt?: unknown;
    cancelRequestedAt?: unknown;
    canceledAt?: unknown;
    metadata?: Record<string, unknown> | null;
};

type VideoStudioProjectDoc = {
    userId: string;
    title: string;
    synopsis?: string;
    aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';
    resolution: '480p' | '720p' | '1080p';
};

type VideoStudioClipDoc = {
    userId: string;
    projectId: string;
    title: string;
    prompt: string;
    mode: VideoStudioClipMode;
    status: 'ready' | 'processing' | 'failed';
    provider: 'openrouter';
    sequence: number;
    videoUrl: string;
    posterUrl?: string | null;
    lastFrameUrl?: string | null;
    continuityNotes?: string | null;
    cameraNotes?: string | null;
    subjectLock?: string | null;
    takeGroupId?: string | null;
    parentTakeClipId?: string | null;
    takeIndex?: number | null;
    sourceClipId?: string | null;
    sourceVideoUrl?: string | null;
    mergeSourceClipIds?: string[];
    duration?: number | null;
    aspectRatio: VideoStudioProjectDoc['aspectRatio'];
    resolution: VideoStudioProjectDoc['resolution'];
};

export class VideoStudioWorkerError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function normalizeOptionalStudioText(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function resolveContinuityField(params: { requestValue?: string; requestHasValue: boolean; sourceValue?: string | null }) {
    if (params.requestHasValue) {
        return normalizeOptionalStudioText(params.requestValue);
    }

    return normalizeOptionalStudioText(params.sourceValue);
}

function resolveContinuityFields(request: ReturnType<typeof readRequest>, sourceClip?: VideoStudioClipDoc | null) {
    return {
        continuityNotes: resolveContinuityField({
            requestValue: request.continuityNotes,
            requestHasValue: Object.prototype.hasOwnProperty.call(request, 'continuityNotes'),
            sourceValue: sourceClip?.continuityNotes,
        }),
        cameraNotes: resolveContinuityField({
            requestValue: request.cameraNotes,
            requestHasValue: Object.prototype.hasOwnProperty.call(request, 'cameraNotes'),
            sourceValue: sourceClip?.cameraNotes,
        }),
        subjectLock: resolveContinuityField({
            requestValue: request.subjectLock,
            requestHasValue: Object.prototype.hasOwnProperty.call(request, 'subjectLock'),
            sourceValue: sourceClip?.subjectLock,
        }),
    };
}

function buildRenderPrompt(params: {
    prompt: string;
    projectSynopsis?: string;
    sourceClipTitle?: string | null;
    continuityNotes?: string | null;
    cameraNotes?: string | null;
    subjectLock?: string | null;
}) {
    const prompt = params.prompt.trim();
    const context: string[] = [];

    const projectSynopsis = normalizeOptionalStudioText(params.projectSynopsis);
    if (projectSynopsis) {
        context.push(`Project brief: ${projectSynopsis}`);
    }
    if (params.sourceClipTitle?.trim()) {
        context.push(`Source clip: ${params.sourceClipTitle.trim()}`);
    }
    if (params.subjectLock) {
        context.push(`Keep these subjects visually consistent: ${params.subjectLock}`);
    }
    if (params.continuityNotes) {
        context.push(`Continuity requirements: ${params.continuityNotes}`);
    }
    if (params.cameraNotes) {
        context.push(`Camera direction: ${params.cameraNotes}`);
    }

    if (context.length === 0) {
        return prompt;
    }

    return `${prompt}\n\nContinuity context:\n${context.map((line) => `- ${line}`).join('\n')}`;
}

function getStorageBucket() {
    return admin.storage().bucket();
}

function buildFirebaseStorageDownloadUrl(params: { bucketName: string; path: string; downloadToken: string }): string {
    const encodedPath = encodeURIComponent(params.path);
    const encodedToken = encodeURIComponent(params.downloadToken);
    return `https://firebasestorage.googleapis.com/v0/b/${params.bucketName}/o/${encodedPath}?alt=media&token=${encodedToken}`;
}

async function uploadBufferToVideoStudioStorage(params: {
    buffer: Buffer;
    userId: string;
    projectId: string;
    pathSuffix: string;
    contentType: string;
}): Promise<string> {
    const bucket = getStorageBucket();
    const file = bucket.file(`video_studio/${params.userId}/${params.projectId}/${params.pathSuffix}`);
    let downloadToken: string = randomUUID();
    try {
        const [existingMetadata] = await file.getMetadata();
        const existingTokens = existingMetadata.metadata?.firebaseStorageDownloadTokens;
        const existingToken = typeof existingTokens === 'string'
            ? existingTokens.split(',').map((token) => token.trim()).find(Boolean)
            : null;
        if (existingToken) downloadToken = existingToken;
    } catch (error) {
        if (!isStorageObjectNotFound(error)) throw error;
    }
    await file.save(params.buffer, {
        metadata: {
            contentType: params.contentType,
            metadata: {
                firebaseStorageDownloadTokens: downloadToken,
            },
        },
    });

    return buildFirebaseStorageDownloadUrl({
        bucketName: bucket.name,
        path: file.name,
        downloadToken,
    });
}

function assertOwnedVideoStudioStoragePath(params: {
    userId: string;
    projectId: string;
    storagePath: string;
}): void {
    const ownedPrefix = `video_studio/${params.userId}/${params.projectId}/`;
    if (!params.storagePath.startsWith(ownedPrefix)) {
        throw new VideoStudioWorkerError(403, 'The staged video does not belong to this project.');
    }
}

function isStorageObjectNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: unknown };
    return candidate.code === 404 || candidate.code === '404';
}

async function downloadVideoStudioStorageBuffer(params: {
    userId: string;
    projectId: string;
    storagePath: string;
}): Promise<{ buffer: Buffer; contentType: string } | null> {
    assertOwnedVideoStudioStoragePath(params);
    const file = getStorageBucket().file(params.storagePath);

    try {
        const [[buffer], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
        return {
            buffer,
            contentType: metadata.contentType || 'video/mp4',
        };
    } catch (error) {
        if (isStorageObjectNotFound(error)) return null;
        throw error;
    }
}

async function deleteVideoStudioStorageObject(params: {
    userId: string;
    projectId: string;
    storagePath: string;
}): Promise<void> {
    assertOwnedVideoStudioStoragePath(params);
    await getStorageBucket().file(params.storagePath).delete({ ignoreNotFound: true });
}

class VideoStudioJobCanceledError extends Error {
    constructor() {
        super('The video studio job was canceled.');
        this.name = 'VideoStudioJobCanceledError';
    }
}

function canceledJobUpdate() {
    return {
        status: 'canceled' as const,
        message: 'Cancellation completed. No further processing will be started.',
        errorMessage: null,
        nextAttemptAt: null,
        heartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
        leaseExpiresAt: null,
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
}

async function updateJob(jobId: string, data: Partial<VideoStudioJobDoc> & Record<string, unknown>) {
    const terminal = data.status === 'completed' || data.status === 'failed' || data.status === 'canceled';
    const jobRef = db.collection('video_studio_jobs').doc(jobId);
    const cancellationObserved = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) throw new VideoStudioWorkerError(404, 'The selected job no longer exists.');
        const current = snapshot.data() as VideoStudioJobDoc;
        if (current.status === 'canceled' || current.cancelRequestedAt) {
            if (current.status !== 'canceled') transaction.update(jobRef, canceledJobUpdate());
            return true;
        }
        transaction.update(jobRef, {
            ...data,
            heartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
            leaseExpiresAt: terminal ? null : admin.firestore.Timestamp.fromMillis(Date.now() + 12 * 60 * 1000),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return false;
    });
    if (cancellationObserved) throw new VideoStudioJobCanceledError();
}

async function assertJobCanContinue(jobId: string): Promise<void> {
    await updateJob(jobId, {});
}

async function finalizeJobCancellationIfRequested(jobId: string): Promise<boolean> {
    const jobRef = db.collection('video_studio_jobs').doc(jobId);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) return false;
        const current = snapshot.data() as VideoStudioJobDoc;
        if (current.status === 'canceled') return true;
        if (!current.cancelRequestedAt) return false;
        transaction.update(jobRef, canceledJobUpdate());
        return true;
    });
}

function timestampMillis(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (!value || typeof value !== 'object') return null;
    const candidate = value as { toMillis?: () => number; seconds?: number };
    if (typeof candidate.toMillis === 'function') {
        const millis = candidate.toMillis();
        return Number.isFinite(millis) ? millis : null;
    }
    return typeof candidate.seconds === 'number' && Number.isFinite(candidate.seconds) ? candidate.seconds * 1000 : null;
}

function asMetadataRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function readRecoverableCanvasMetadata(metadata: VideoStudioJobDoc['metadata']): {
    discarded: Record<string, unknown>;
    renderResult: Record<string, unknown>;
} | null {
    const discarded = asMetadataRecord(metadata?.providerVideoDiscarded);
    const renderResult = asMetadataRecord(metadata?.renderResult);
    if (
        !discarded
        || !renderResult
        || discarded.reason !== 'resolution_mismatch'
        || discarded.recoverable === false
        || typeof discarded.providerJobId !== 'string'
        || !discarded.providerJobId
        || typeof discarded.modelId !== 'string'
        || !discarded.modelId
        || renderResult.requestId !== discarded.providerJobId
        || renderResult.modelUsed !== discarded.modelId
    ) {
        return null;
    }

    return { discarded, renderResult };
}

function recoverCompletedCanvasCheckpoint(params: {
    metadata: VideoStudioJobDoc['metadata'];
    checkpointKey: string;
    request: VideoStudioJobRequest;
    requestedResolution: VideoStudioProjectDoc['resolution'];
}): OpenRouterVideoCheckpoint | null {
    const recoverable = readRecoverableCanvasMetadata(params.metadata);
    if (!recoverable) return null;

    const providerJobId = recoverable.discarded.providerJobId as string;
    const preservedCheckpoint = readOpenRouterVideoCheckpoint(recoverable.discarded.checkpoint);
    if (
        preservedCheckpoint
        && preservedCheckpoint.status === 'completed'
        && preservedCheckpoint.jobId === providerJobId
        && preservedCheckpoint.checkpointKey === params.checkpointKey
    ) {
        return preservedCheckpoint;
    }

    const durationApplied = recoverable.renderResult.durationApplied;
    const resolvedResolution = recoverable.renderResult.resolvedResolution;
    const discardedAt = recoverable.discarded.discardedAt;
    if (
        typeof durationApplied !== 'number'
        || !Number.isInteger(durationApplied)
        || durationApplied <= 0
        || typeof resolvedResolution !== 'string'
        || !resolvedResolution
        || typeof discardedAt !== 'string'
        || !discardedAt
    ) {
        return null;
    }

    const requestedAudioMode = params.request.audioMode || (params.request.generateAudio ? 'ambient' : 'silent');
    const storedAudioMode = recoverable.renderResult.audioModeApplied;
    const audioModeApplied = storedAudioMode === 'ambient' || storedAudioMode === 'dialogue' || storedAudioMode === 'silent'
        ? storedAudioMode
        : requestedAudioMode;
    const estimatedCostUsd = recoverable.renderResult.estimatedCostUsd;
    const visualReferencesApplied = recoverable.renderResult.visualReferencesApplied;

    return readOpenRouterVideoCheckpoint({
        version: 1,
        checkpointKey: params.checkpointKey,
        jobId: providerJobId,
        generationId: null,
        pollingUrl: null,
        modelId: recoverable.discarded.modelId,
        modelName: recoverable.discarded.modelId,
        status: 'completed',
        submittedAt: discardedAt,
        lastPolledAt: discardedAt,
        qualityMode: params.request.qualityMode || 'proof',
        requestedResolution: params.requestedResolution,
        resolvedResolution,
        durationApplied,
        estimatedCostUsd:
            typeof estimatedCostUsd === 'number' && Number.isFinite(estimatedCostUsd) && estimatedCostUsd >= 0
                ? estimatedCostUsd
                : null,
        firstFrameApplied: recoverable.renderResult.firstFrameApplied === true,
        endFrameApplied: recoverable.renderResult.endFrameApplied === true,
        visualReferencesApplied:
            typeof visualReferencesApplied === 'number'
            && Number.isInteger(visualReferencesApplied)
            && visualReferencesApplied >= 0
                ? visualReferencesApplied
                : 0,
        audioApplied: recoverable.renderResult.audioApplied === true,
        audioModeApplied,
        lipSyncRequested:
            recoverable.renderResult.lipSyncRequested === true || audioModeApplied === 'dialogue',
    });
}

function isTransientVideoStudioError(error: unknown): boolean {
    if (isOpenRouterInputImagePrivacyError(error)) return false;
    if (
        error instanceof OpenRouterVideoRequestError
        && error.code === 'ambiguous_provider_submission'
    ) return false;
    if (error instanceof VideoStudioWorkerError) {
        return error.status === 429 || error.status >= 500;
    }
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return [
        'timeout',
        'timed out',
        'rate limit',
        '429',
        '500',
        '502',
        '503',
        '504',
        'econnreset',
        'enotfound',
        'fetch failed',
        'network',
        'socket hang up',
    ].some((signal) => message.includes(signal));
}

function hasResumableProviderVideo(metadata: VideoStudioJobDoc['metadata']): boolean {
    if (!metadata || typeof metadata !== 'object') return false;
    const unavailableOutput = asMetadataRecord(metadata.providerVideoDiscarded);
    const unavailableReason = unavailableOutput?.reason;
    const terminalLegacyUnavailable = unavailableReason === 'provider_output_unavailable'
        && unavailableOutput?.httpStatus !== 401
        && unavailableOutput?.httpStatus !== 403;
    if (
        unavailableReason === 'provider_output_not_found'
        || unavailableReason === 'provider_output_expired'
        || terminalLegacyUnavailable
    ) return false;
    const checkpoint = metadata.providerVideo;
    if (checkpoint && typeof checkpoint === 'object') {
        const candidate = checkpoint as { jobId?: unknown; status?: unknown };
        if (
            typeof candidate.jobId === 'string'
            && candidate.jobId.length > 0
            && (candidate.status === 'pending' || candidate.status === 'in_progress' || candidate.status === 'completed')
        ) {
            return true;
        }
    }

    return readRecoverableCanvasMetadata(metadata) !== null;
}

async function claimJob(jobId: string): Promise<{ id: string; data: VideoStudioJobDoc }> {
    const jobRef = db.collection('video_studio_jobs').doc(jobId);

    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) {
            throw new VideoStudioWorkerError(404, 'The selected job no longer exists.');
        }

        const job = snapshot.data() as VideoStudioJobDoc;
        const nextAttemptAt = timestampMillis(job.nextAttemptAt);
        if (nextAttemptAt !== null && nextAttemptAt > Date.now()) {
            throw new VideoStudioWorkerError(425, 'This job is waiting for its automatic retry window.');
        }
        if (job.status === 'running' || job.status === 'uploading') {
            throw new VideoStudioWorkerError(409, 'This job is already being processed.');
        }
        if (job.status === 'completed') {
            throw new VideoStudioWorkerError(409, 'This job has already completed.');
        }
        if (job.status === 'canceled') {
            throw new VideoStudioWorkerError(409, 'Canceled jobs cannot be processed.');
        }
        if (job.cancelRequestedAt) {
            throw new VideoStudioWorkerError(409, 'Cancellation has already been requested for this job.');
        }

        const currentAttempt = Number(job.attemptCount ?? 0);
        const nextAttempt = hasResumableProviderVideo(job.metadata) ? Math.max(1, currentAttempt) : currentAttempt + 1;
        transaction.update(jobRef, {
            status: 'running',
            progress: 8,
            message: 'Preparing project assets on the worker.',
            attemptCount: nextAttempt,
            claimedAt: admin.firestore.FieldValue.serverTimestamp(),
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            heartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
            leaseExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 12 * 60 * 1000),
            nextAttemptAt: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            errorMessage: null,
        });

        return {
            id: snapshot.id,
            data: {
                ...job,
                status: 'running',
                progress: 8,
                message: 'Preparing project assets on the worker.',
                attemptCount: nextAttempt,
            },
        };
    });
}

async function getProject(projectId: string, userId: string) {
    const snapshot = await db.collection('video_studio_projects').doc(projectId).get();
    if (!snapshot.exists) {
        throw new VideoStudioWorkerError(404, 'The selected project no longer exists.');
    }

    const project = snapshot.data() as VideoStudioProjectDoc;
    if (project.userId !== userId) {
        throw new VideoStudioWorkerError(403, 'You do not have access to this project.');
    }

    return {
        id: snapshot.id,
        data: project,
    };
}

async function getClip(clipId: string, userId: string, projectId?: string) {
    const snapshot = await db.collection('video_studio_clips').doc(clipId).get();
    if (!snapshot.exists) {
        throw new VideoStudioWorkerError(404, 'The selected clip no longer exists.');
    }

    const clip = snapshot.data() as VideoStudioClipDoc;
    if (clip.userId !== userId) {
        throw new VideoStudioWorkerError(403, 'You do not have access to this clip.');
    }
    if (projectId && clip.projectId !== projectId) {
        throw new VideoStudioWorkerError(400, 'The selected clip does not belong to this project.');
    }

    return {
        id: snapshot.id,
        data: clip,
    };
}

async function getClips(clipIds: string[], userId: string, projectId: string) {
    return Promise.all(clipIds.map((clipId) => getClip(clipId, userId, projectId)));
}

async function extractAndStoreLastFrame(params: { videoUrl: string; userId: string; projectId: string; token: string }): Promise<string> {
    const frameBuffer = await extractVideoFrame({
        videoUrl: params.videoUrl,
        position: 'last',
    });

    return uploadBufferToVideoStudioStorage({
        buffer: frameBuffer,
        userId: params.userId,
        projectId: params.projectId,
        pathSuffix: `frames/${params.token}.png`,
        contentType: 'image/png',
    });
}

async function ensureStoredLastFrame(params: { clipId: string; clip: VideoStudioClipDoc; userId: string }): Promise<string> {
    if (params.clip.lastFrameUrl) {
        return params.clip.lastFrameUrl;
    }

    const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
    const lastFrameUrl = await extractAndStoreLastFrame({
        videoUrl: params.clip.videoUrl,
        userId: params.userId,
        projectId: params.clip.projectId,
        token,
    });

    await db.collection('video_studio_clips').doc(params.clipId).update({
        lastFrameUrl,
        posterUrl: lastFrameUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return lastFrameUrl;
}

async function createClipRecord(params: {
    clipId?: string;
    userId: string;
    projectId: string;
    title: string;
    prompt: string;
    mode: VideoStudioClipMode;
    videoUrl: string;
    posterUrl?: string | null;
    lastFrameUrl?: string | null;
    continuityNotes?: string | null;
    cameraNotes?: string | null;
    subjectLock?: string | null;
    takeGroupId?: string | null;
    parentTakeClipId?: string | null;
    takeIndex?: number | null;
    sourceClipId?: string | null;
    sourceVideoUrl?: string | null;
    mergeSourceClipIds?: string[];
    duration?: number | null;
    aspectRatio: VideoStudioProjectDoc['aspectRatio'];
    resolution: VideoStudioProjectDoc['resolution'];
}): Promise<{ clipId: string; sequence: number }> {
    const projectRef = db.collection('video_studio_projects').doc(params.projectId);
    const clipRef = params.clipId
        ? db.collection('video_studio_clips').doc(params.clipId)
        : db.collection('video_studio_clips').doc();

    return db.runTransaction(async (transaction) => {
        const clipsQuery = db.collection('video_studio_clips').where('projectId', '==', params.projectId);
        const [projectDoc, clipDocs, existingClipDoc] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(clipsQuery),
            transaction.get(clipRef),
        ]);

        if (!projectDoc.exists) {
            throw new VideoStudioWorkerError(404, 'The selected project no longer exists.');
        }

        const project = projectDoc.data() as VideoStudioProjectDoc;
        if (project.userId !== params.userId) {
            throw new VideoStudioWorkerError(403, 'You do not have permission to add clips to this project.');
        }

        const existingClip = existingClipDoc.exists ? existingClipDoc.data() as VideoStudioClipDoc : null;
        if (
            existingClip
            && (existingClip.userId !== params.userId || existingClip.projectId !== params.projectId)
        ) {
            throw new VideoStudioWorkerError(409, 'The deterministic clip identity is already in use.');
        }

        let highest = -1;
        clipDocs.docs.forEach((doc) => {
            const sequence = Number((doc.data() as VideoStudioClipDoc).sequence ?? -1);
            if (Number.isFinite(sequence) && sequence > highest) {
                highest = sequence;
            }
        });
        const nextSequence = existingClip ? Number(existingClip.sequence ?? 0) : highest + 1;
        const normalizedTakeGroupId = params.takeGroupId || null;
        let resolvedTakeIndex: number | null = params.takeIndex ?? existingClip?.takeIndex ?? null;

        if (normalizedTakeGroupId && !resolvedTakeIndex) {
            let highestTakeIndex = 1;
            clipDocs.docs.forEach((doc) => {
                const clip = doc.data() as VideoStudioClipDoc;
                if (doc.id === normalizedTakeGroupId) {
                    highestTakeIndex = Math.max(highestTakeIndex, 1);
                    return;
                }

                if (clip.takeGroupId === normalizedTakeGroupId) {
                    const clipTakeIndex = Number(clip.takeIndex ?? 1);
                    if (Number.isFinite(clipTakeIndex) && clipTakeIndex > highestTakeIndex) {
                        highestTakeIndex = clipTakeIndex;
                    }
                }
            });

            resolvedTakeIndex = highestTakeIndex + 1;
        }

        const clipData = {
            userId: params.userId,
            projectId: params.projectId,
            title: params.title.trim(),
            prompt: params.prompt.trim(),
            mode: params.mode,
            status: 'ready',
            provider: 'openrouter',
            sequence: nextSequence,
            videoUrl: params.videoUrl,
            posterUrl: params.posterUrl || params.lastFrameUrl || null,
            lastFrameUrl: params.lastFrameUrl || null,
            continuityNotes: normalizeOptionalStudioText(params.continuityNotes),
            cameraNotes: normalizeOptionalStudioText(params.cameraNotes),
            subjectLock: normalizeOptionalStudioText(params.subjectLock),
            takeGroupId: normalizedTakeGroupId,
            parentTakeClipId: params.parentTakeClipId || null,
            takeIndex: resolvedTakeIndex,
            sourceClipId: params.sourceClipId || null,
            sourceVideoUrl: params.sourceVideoUrl || null,
            mergeSourceClipIds: params.mergeSourceClipIds || [],
            duration: params.duration ?? null,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            ...(!existingClip ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (existingClip) {
            transaction.set(clipRef, clipData, { merge: true });
        } else {
            transaction.set(clipRef, clipData);
        }

        transaction.update(projectRef, {
            clipCount: existingClip
                ? Math.max(Number((project as VideoStudioProjectDoc & { clipCount?: number }).clipCount ?? 0), clipDocs.size)
                : nextSequence + 1,
            coverClipId: clipRef.id,
            coverUrl: params.posterUrl || params.lastFrameUrl || params.videoUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
            clipId: clipRef.id,
            sequence: nextSequence,
        };
    });
}

function requirePrompt(prompt: string | undefined, operation: string) {
    if (!prompt?.trim()) {
        throw new VideoStudioWorkerError(400, `A prompt is required for "${operation}".`);
    }
    return prompt.trim();
}

function requireSourceClipId(sourceClipId: string | undefined, operation: string) {
    if (!sourceClipId) {
        throw new VideoStudioWorkerError(400, `sourceClipId is required for "${operation}".`);
    }
    return sourceClipId;
}

function requireMergeClipIds(mergeClipIds: string[] | undefined) {
    if (!mergeClipIds || mergeClipIds.length === 0) {
        throw new VideoStudioWorkerError(400, 'Select one or more clips to merge.');
    }
    return mergeClipIds;
}

function normalizeRepeatCount(repeatCount?: number) {
    return Math.max(1, Math.min(repeatCount ?? 1, 12));
}

function requirePassingVideoQuality(inspection: VideoQualityInspection, context: string): void {
    if (inspection.passed) return;
    const details = inspection.issues
        .slice(0, 3)
        .map((issue) => issue.message)
        .join(' ');
    throw new VideoStudioWorkerError(422, `${context} quality validation failed. ${details}`.trim());
}

function buildLoopClipTitle(baseTitle: string, segmentIndex: number, totalSegments: number) {
    if (totalSegments <= 1) {
        return baseTitle;
    }

    return `${baseTitle} ${segmentIndex + 1}/${totalSegments}`;
}

function buildLoopSegmentPrompt(params: { renderPrompt: string; segmentIndex: number; totalSegments: number }) {
    if (params.totalSegments <= 1) {
        return params.renderPrompt;
    }

    const guidance =
        params.segmentIndex === 0
            ? `This is segment 1 of ${params.totalSegments}. Establish the opening shot clearly from the provided starting point.`
            : `This is segment ${params.segmentIndex + 1} of ${params.totalSegments}. Continue naturally from the previous segment's final frame and preserve scene continuity.`;

    return `${params.renderPrompt}\n\nSequence guidance:\n- ${guidance}`;
}

type LoopProgressPhase = 'rendering' | 'uploading' | 'extracting' | 'merging' | 'completed';

function buildLoopProgress(params: {
    totalSegments: number;
    segmentIndex: number;
    completedSegments: number;
    phase: LoopProgressPhase;
    autoMergeAfterLoop: boolean;
    currentClipTitle?: string | null;
    generatedClipIds: string[];
}) {
    return {
        totalSegments: params.totalSegments,
        currentSegment: Math.min(params.segmentIndex + 1, params.totalSegments),
        completedSegments: Math.max(0, Math.min(params.completedSegments, params.totalSegments)),
        phase: params.phase,
        autoMergeAfterLoop: params.autoMergeAfterLoop,
        currentClipTitle: params.currentClipTitle ?? null,
        generatedClipIds: [...params.generatedClipIds],
    };
}

function readRequest(job: VideoStudioJobDoc) {
    const request = job.metadata && typeof job.metadata === 'object' ? (job.metadata.request as unknown) : null;

    const parsed = videoStudioJobRequestSchema.safeParse(request);
    if (!parsed.success) {
        throw new VideoStudioWorkerError(400, 'The queued job payload is invalid.');
    }

    return parsed.data;
}

export async function processQueuedVideoStudioJob(jobId: string) {
    const claimed = await claimJob(jobId);
    const baseJobMetadata = claimed.data.metadata && typeof claimed.data.metadata === 'object' ? claimed.data.metadata : {};
    const ownedStoragePrefix = `video_studio/${claimed.data.userId}/${claimed.data.projectId}/`;
    const pendingStagingCleanupPaths = new Set(
        Array.isArray(claimed.data.stagingCleanupPaths)
            ? claimed.data.stagingCleanupPaths.filter((path): path is string =>
                  typeof path === 'string' && path.startsWith(ownedStoragePrefix))
            : [],
    );
    let request: VideoStudioJobRequest | null = null;
    let providerCheckpointForFailure = readOpenRouterVideoCheckpoint(baseJobMetadata.providerVideo);

    try {
        request = readRequest(claimed.data);
        const project = await getProject(request.projectId, claimed.data.userId);
        const title = claimed.data.title;
        let sourceClipForContinuity: {
            id: string;
            data: VideoStudioClipDoc;
        } | null = null;

        if (request.operation === 'extract-frame') {
            const clip = await getClip(
                requireSourceClipId(request.sourceClipId, request.operation),
                claimed.data.userId,
                request.projectId,
            );

            await updateJob(jobId, {
                progress: 32,
                message: 'Extracting the last frame from the selected clip.',
            });

            const lastFrameUrl = await ensureStoredLastFrame({
                clipId: clip.id,
                clip: clip.data,
                userId: claimed.data.userId,
            });

            await updateJob(jobId, {
                status: 'completed',
                progress: 100,
                message: 'The last frame was stored for continuity.',
                clipId: clip.id,
                resultFrameUrl: lastFrameUrl,
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return;
        }

        if (request.operation === 'merge') {
            const mergeSourceClipIds = requireMergeClipIds(request.mergeClipIds);
            const clips = await getClips(mergeSourceClipIds, claimed.data.userId, request.projectId);
            const editsByClipId = new Map((request.mergeClipEdits || []).map((edit) => [edit.clipId, edit]));
            const continuity = resolveContinuityFields(request);
            const mergeOutputIdentity = buildVideoStudioOutputIdentity({
                jobId,
                userId: claimed.data.userId,
                projectId: request.projectId,
                segmentIndex: 'final',
            });

            await updateJob(jobId, {
                progress: 28,
                message: 'Downloading and normalizing selected clips for FFmpeg.',
            });

            const mergedBuffer = await mergeVideos({
                clips: clips.map((clip) => ({
                    url: clip.data.videoUrl,
                    ...editsByClipId.get(clip.id),
                })),
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
                fps: 30,
                backgroundMusicUrl: request.backgroundMusicUrl,
                audioMixPreset: request.audioMixPreset,
                backgroundMusicVolume: request.backgroundMusicVolume,
                sceneAudioVolume: request.sceneAudioVolume,
                audioCrossfadeSeconds: request.audioCrossfadeSeconds,
            });
            const mergeCanvas = getVideoCanvasSize(project.data.aspectRatio, project.data.resolution);
            const expectedMergedDuration = estimateVideoStudioMergeDuration(
                clips.map((clip) => ({
                    durationSeconds: typeof clip.data.duration === 'number' ? clip.data.duration : null,
                    ...editsByClipId.get(clip.id),
                })),
            );
            const finalQualityInspection = await inspectVideoBufferQuality(mergedBuffer, {
                ...(expectedMergedDuration !== null ? { expectedDurationSeconds: expectedMergedDuration } : {}),
                durationToleranceSeconds: Math.max(1.5, clips.length * 0.35),
                expectedWidth: mergeCanvas.width,
                expectedHeight: mergeCanvas.height,
                expectedAspectRatio: mergeCanvas.width / mergeCanvas.height,
                requireAudibleAudio: Boolean(request.backgroundMusicUrl),
                maxBlackFrameRatio: 0.2,
            });
            requirePassingVideoQuality(finalQualityInspection, 'Final merged video');

            await updateJob(jobId, {
                status: 'uploading',
                progress: 72,
                message: 'Uploading merged clip and extracting its continuity frame.',
                metadata: {
                    ...baseJobMetadata,
                    mergeSourceClipIds,
                    finalQualityInspection,
                },
            });

            const savedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: mergedBuffer,
                userId: claimed.data.userId,
                projectId: request.projectId,
                pathSuffix: mergeOutputIdentity.videoPathSuffix,
                contentType: 'video/mp4',
            });
            const lastFrameUrl = await extractAndStoreLastFrame({
                videoUrl: savedVideoUrl,
                userId: claimed.data.userId,
                projectId: request.projectId,
                token: mergeOutputIdentity.frameToken,
            });

            const savedClip = await createClipRecord({
                clipId: mergeOutputIdentity.clipId,
                userId: claimed.data.userId,
                projectId: request.projectId,
                title,
                prompt: request.prompt?.trim() || `Merged sequence from ${clips.length} clips`,
                mode: 'merge',
                videoUrl: savedVideoUrl,
                posterUrl: lastFrameUrl,
                lastFrameUrl,
                continuityNotes: continuity.continuityNotes,
                cameraNotes: continuity.cameraNotes,
                subjectLock: continuity.subjectLock,
                mergeSourceClipIds,
                duration: finalQualityInspection.durationSeconds,
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
            });
            baseJobMetadata.outputCheckpoints = upsertVideoStudioOutputCheckpoint(
                baseJobMetadata.outputCheckpoints,
                {
                    version: 1,
                    jobId,
                    slot: mergeOutputIdentity.slot,
                    segmentIndex: null,
                    clipId: savedClip.clipId,
                    videoStoragePath: mergeOutputIdentity.videoStoragePath,
                    frameStoragePath: mergeOutputIdentity.frameStoragePath,
                    savedAt: new Date().toISOString(),
                },
            );

            await updateJob(jobId, {
                status: 'completed',
                progress: 100,
                message: 'Merged clip saved to the project timeline.',
                clipId: savedClip.clipId,
                resultVideoUrl: savedVideoUrl,
                resultFrameUrl: lastFrameUrl,
                metadata: {
                    ...baseJobMetadata,
                    mergeSourceClipIds,
                    finalQualityInspection,
                },
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return;
        }

        const prompt = requirePrompt(request.prompt, request.operation);
        const totalSegments = normalizeRepeatCount(request.repeatCount);
        const autoMergeAfterLoop = request.autoMergeAfterLoop === true && totalSegments > 1;
        const omitVisualInputs = request.visualInputMode === 'text-only';
        let sourceClipId: string | null = null;
        let sourceVideoUrl: string | null = null;
        let referenceImage = omitVisualInputs ? undefined : request.referenceImage;
        const generationMode = 'generate' as const;
        let operationMode: VideoStudioClipMode = request.operation === 'generate' ? 'generate' : 'continue';

        if (request.operation === 'extend' || request.operation === 'edit') {
            const sourceClip = await getClip(
                requireSourceClipId(request.sourceClipId, request.operation),
                claimed.data.userId,
                request.projectId,
            );

            sourceClipForContinuity = sourceClip;
            sourceClipId = sourceClip.id;
            sourceVideoUrl = sourceClip.data.videoUrl;
            referenceImage = omitVisualInputs
                ? undefined
                : await ensureStoredLastFrame({
                      clipId: sourceClip.id,
                      clip: sourceClip.data,
                      userId: claimed.data.userId,
                  });
            operationMode = request.operation;
        } else if (request.operation === 'continue') {
            const sourceClip = await getClip(
                requireSourceClipId(request.sourceClipId, request.operation),
                claimed.data.userId,
                request.projectId,
            );

            sourceClipForContinuity = sourceClip;
            sourceClipId = sourceClip.id;
            sourceVideoUrl = sourceClip.data.videoUrl;
            referenceImage = omitVisualInputs
                ? undefined
                : await ensureStoredLastFrame({
                      clipId: sourceClip.id,
                      clip: sourceClip.data,
                      userId: claimed.data.userId,
                  });
            operationMode = 'continue';
        } else {
            operationMode = 'generate';
        }

        const continuity = resolveContinuityFields(request, sourceClipForContinuity?.data);
        const renderPrompt = buildRenderPrompt({
            prompt,
            projectSynopsis: project.data.synopsis,
            sourceClipTitle: sourceClipForContinuity?.data.title || null,
            continuityNotes: continuity.continuityNotes,
            cameraNotes: continuity.cameraNotes,
            subjectLock: continuity.subjectLock,
        });

        const storedGeneratedClipIds = Array.isArray(baseJobMetadata.generatedClipIds)
            ? baseJobMetadata.generatedClipIds.filter((clipId): clipId is string => typeof clipId === 'string' && clipId.length > 0)
            : [];
        const generatedClipIds = [...storedGeneratedClipIds];
        let finalClipId: string | undefined;
        let finalVideoUrl: string | undefined;
        let finalFrameUrl: string | undefined;
        let currentSourceClipId = sourceClipId;
        let currentSourceVideoUrl = sourceVideoUrl;
        let currentReferenceImage = referenceImage;
        let lastRenderResult: StoredVideoRenderMetadata | null = null;
        let lastAudioInspection: VideoAudioInspection | null = null;
        let lastQualityInspection: VideoQualityInspection | null = null;
        let finalQualityInspection: VideoQualityInspection | null = null;
        let activeProviderCheckpoint = providerCheckpointForFailure;
        const initialSegmentIndex = Math.min(generatedClipIds.length, totalSegments);
        const initialCheckpointKey = `${jobId}:${initialSegmentIndex}`;
        const providerResumeRequiredByCaller = baseJobMetadata.providerResumeRequired === true;
        let providerResumeRequired = providerResumeRequiredByCaller || Boolean(readRecoverableCanvasMetadata(baseJobMetadata)) || (
            hasResumableProviderVideo(baseJobMetadata)
            && (!activeProviderCheckpoint || activeProviderCheckpoint.checkpointKey === initialCheckpointKey)
        );
        if (providerResumeRequired) {
            baseJobMetadata.providerResumeRequired = true;
        }
        let providerOutputRecovery: {
            mode: 'canvas_normalization';
            reusedProviderJobId: string;
            additionalGenerationCostUsd: 0;
            recoveredAt: string;
        } | null = null;

        if (generatedClipIds.length > 0) {
            const latestGeneratedClip = await getClip(
                generatedClipIds[generatedClipIds.length - 1],
                claimed.data.userId,
                request.projectId,
            );
            finalClipId = latestGeneratedClip.id;
            finalVideoUrl = latestGeneratedClip.data.videoUrl;
            finalFrameUrl = latestGeneratedClip.data.lastFrameUrl || undefined;
            currentSourceClipId = latestGeneratedClip.id;
            currentSourceVideoUrl = latestGeneratedClip.data.videoUrl;
            currentReferenceImage = latestGeneratedClip.data.lastFrameUrl || currentReferenceImage;
        }

        for (let segmentIndex = initialSegmentIndex; segmentIndex < totalSegments; segmentIndex += 1) {
            const isFirstSegment = segmentIndex === 0;
            const segmentMode: 'generate' | 'extend' | 'edit' = isFirstSegment ? generationMode : 'generate';
            const clipMode: VideoStudioClipMode = isFirstSegment ? operationMode : 'continue';
            const takeGroupId =
                request.operation === 'edit' && isFirstSegment && sourceClipForContinuity
                    ? sourceClipForContinuity.data.takeGroupId || sourceClipForContinuity.id
                    : null;
            const parentTakeClipId = takeGroupId ? currentSourceClipId : null;
            const segmentPrompt = buildLoopSegmentPrompt({
                renderPrompt,
                segmentIndex,
                totalSegments,
            });
            const segmentTitle = buildLoopClipTitle(title, segmentIndex, totalSegments);
            const checkpointKey = `${jobId}:${segmentIndex}`;
            const outputIdentity = buildVideoStudioOutputIdentity({
                jobId,
                userId: claimed.data.userId,
                projectId: request.projectId,
                segmentIndex,
            });
            if (!activeProviderCheckpoint) {
                activeProviderCheckpoint = recoverCompletedCanvasCheckpoint({
                    metadata: baseJobMetadata,
                    checkpointKey,
                    request,
                    requestedResolution: project.data.resolution,
                });
            }
            const recoverableCanvasMetadata = readRecoverableCanvasMetadata(baseJobMetadata);
            if (
                activeProviderCheckpoint
                && recoverableCanvasMetadata
                && activeProviderCheckpoint.status === 'completed'
                && activeProviderCheckpoint.jobId === recoverableCanvasMetadata.discarded.providerJobId
            ) {
                providerOutputRecovery = {
                    mode: 'canvas_normalization',
                    reusedProviderJobId: activeProviderCheckpoint.jobId,
                    additionalGenerationCostUsd: 0,
                    recoveredAt: new Date().toISOString(),
                };
            }
            const resumeCheckpoint = activeProviderCheckpoint?.checkpointKey === checkpointKey ? activeProviderCheckpoint : null;

            await updateJob(jobId, {
                progress: 12 + Math.round((segmentIndex / totalSegments) * 58),
                message:
                    totalSegments > 1
                        ? `Rendering segment ${segmentIndex + 1}/${totalSegments} with OpenRouter.`
                        : request.operation === 'continue'
                          ? 'Submitting the continuation render to OpenRouter.'
                          : `Submitting ${request.operation} render to OpenRouter.`,
                metadata: {
                    ...baseJobMetadata,
                    repeatCount: totalSegments,
                    autoMergeAfterLoop,
                    continuity,
                    generatedClipIds,
                    providerVideo: resumeCheckpoint,
                    loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex,
                        completedSegments: generatedClipIds.length,
                        phase: 'rendering',
                        autoMergeAfterLoop,
                        currentClipTitle: segmentTitle,
                        generatedClipIds,
                    }),
                },
            });

            const storedStagingCheckpoint = readProviderOutputStagingCheckpoint(baseJobMetadata.providerOutputStaging);
            const storedRenderResult = storedStagingCheckpoint?.jobId === jobId
                && storedStagingCheckpoint.segmentIndex === segmentIndex
                && storedStagingCheckpoint.storagePath === outputIdentity.stagingStoragePath
                ? storedStagingCheckpoint.renderResult
                : readStoredVideoRenderMetadata(baseJobMetadata.renderResult);
            let downloadedVideo = storedRenderResult
                ? await downloadVideoStudioStorageBuffer({
                      userId: claimed.data.userId,
                      projectId: request.projectId,
                      storagePath: outputIdentity.stagingStoragePath,
                  })
                : null;
            let generatedMetadata: StoredVideoRenderMetadata;
            let stagingCheckpoint: ProviderOutputStagingCheckpoint;

            if (downloadedVideo && storedRenderResult) {
                generatedMetadata = storedRenderResult;
                stagingCheckpoint = storedStagingCheckpoint || {
                    version: 1,
                    jobId,
                    segmentIndex,
                    storagePath: outputIdentity.stagingStoragePath,
                    contentType: downloadedVideo.contentType,
                    byteLength: downloadedVideo.buffer.byteLength,
                    providerJobId: storedRenderResult.requestId,
                    status: 'staged',
                    stagedAt: new Date().toISOString(),
                    renderResult: storedRenderResult,
                };
            } else {
                // This is the last durable checkpoint before a potentially billable provider submission.
                await assertJobCanContinue(jobId);
                const generated = await generateOpenRouterVideo(
                    {
                        prompt: segmentPrompt,
                        mode: segmentMode,
                        image: omitVisualInputs ? undefined : currentReferenceImage,
                        endImage: !omitVisualInputs && segmentIndex === totalSegments - 1 ? request.endReferenceImage : undefined,
                        referenceImages: omitVisualInputs ? undefined : request.visualReferenceImages,
                        videoUrl: currentSourceVideoUrl || undefined,
                        duration: request.duration,
                        aspectRatio: project.data.aspectRatio,
                        resolution: project.data.resolution,
                        qualityMode: request.qualityMode,
                        generateAudio: request.generateAudio,
                        audioMode: request.audioMode,
                        dialogue: request.dialogue,
                    },
                    {
                        checkpointKey,
                        resumeCheckpoint,
                        requireResumeCheckpoint: providerResumeRequired && segmentIndex === initialSegmentIndex,
                        executionPlan: baseJobMetadata.executionPlan ?? baseJobMetadata.preflight,
                        pollTimeoutMs: FUNCTION_VIDEO_PROVIDER_POLL_WINDOW_MS,
                        onCheckpoint: async (checkpoint: OpenRouterVideoCheckpoint) => {
                            activeProviderCheckpoint = checkpoint;
                            providerCheckpointForFailure = checkpoint;
                            await updateJob(jobId, {
                                progress: 18 + Math.round((segmentIndex / totalSegments) * 52),
                                message: `OpenRouter is rendering scene ${segmentIndex + 1}/${totalSegments}.`,
                                metadata: {
                                    ...baseJobMetadata,
                                    repeatCount: totalSegments,
                                    autoMergeAfterLoop,
                                    continuity,
                                    generatedClipIds,
                                    providerVideo: checkpoint,
                                    loopProgress: buildLoopProgress({
                                        totalSegments,
                                        segmentIndex,
                                        completedSegments: generatedClipIds.length,
                                        phase: 'rendering',
                                        autoMergeAfterLoop,
                                        currentClipTitle: segmentTitle,
                                        generatedClipIds,
                                    }),
                                },
                            });
                        },
                    },
                );
                generatedMetadata = generated.metadata;
                providerCheckpointForFailure = activeProviderCheckpoint;
                stagingCheckpoint = {
                    version: 1,
                    jobId,
                    segmentIndex,
                    storagePath: outputIdentity.stagingStoragePath,
                    contentType: 'video/mp4',
                    byteLength: 0,
                    providerJobId: generatedMetadata.requestId,
                    status: 'reserved',
                    stagedAt: new Date().toISOString(),
                    renderResult: generatedMetadata,
                };
                baseJobMetadata.renderResult = generatedMetadata;
                baseJobMetadata.providerOutputStaging = stagingCheckpoint;
                await updateJob(jobId, {
                    progress: 23 + Math.round((segmentIndex / totalSegments) * 58),
                    message: `Preserving scene ${segmentIndex + 1}/${totalSegments} before quality inspection.`,
                    metadata: {
                        ...baseJobMetadata,
                        repeatCount: totalSegments,
                        autoMergeAfterLoop,
                        continuity,
                        generatedClipIds,
                        providerVideo: activeProviderCheckpoint,
                    },
                });
                downloadedVideo = await downloadOpenRouterVideo(generated.videoUrl);
                await uploadBufferToVideoStudioStorage({
                    buffer: downloadedVideo.buffer,
                    userId: claimed.data.userId,
                    projectId: request.projectId,
                    pathSuffix: outputIdentity.stagingPathSuffix,
                    contentType: downloadedVideo.contentType || 'video/mp4',
                });
                stagingCheckpoint = {
                    ...stagingCheckpoint,
                    contentType: downloadedVideo.contentType || 'video/mp4',
                    byteLength: downloadedVideo.buffer.byteLength,
                    status: 'staged',
                    stagedAt: new Date().toISOString(),
                };
            }
            lastRenderResult = generatedMetadata;
            baseJobMetadata.renderResult = generatedMetadata;
            baseJobMetadata.providerOutputStaging = stagingCheckpoint;

            await updateJob(jobId, {
                status: 'uploading',
                progress: 24 + Math.round(((segmentIndex + 0.45) / totalSegments) * 58),
                message:
                    totalSegments > 1
                        ? `Uploading segment ${segmentIndex + 1}/${totalSegments} to studio storage.`
                        : 'Uploading the rendered clip to studio storage.',
                metadata: {
                    ...baseJobMetadata,
                    repeatCount: totalSegments,
                    autoMergeAfterLoop,
                    resolvedPrompt: renderPrompt,
                    lastSegmentPrompt: segmentPrompt,
                    continuity,
                    renderResult: generatedMetadata,
                    qualityInspection: lastQualityInspection,
                    providerVideo: activeProviderCheckpoint,
                    providerVideoDiscarded: null,
                    providerOutputRecovery,
                    generatedClipIds,
                    loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex,
                        completedSegments: generatedClipIds.length,
                        phase: 'uploading',
                        autoMergeAfterLoop,
                        currentClipTitle: segmentTitle,
                        generatedClipIds,
                    }),
                },
            });

            const appliedResolution =
                generatedMetadata.resolvedResolution === '480p' ||
                generatedMetadata.resolvedResolution === '720p' ||
                generatedMetadata.resolvedResolution === '1080p'
                    ? generatedMetadata.resolvedResolution
                    : project.data.resolution;
            const generatedCanvas = getVideoCanvasSize(project.data.aspectRatio, appliedResolution);
            const sourceQualityInspection = await inspectVideoBufferQuality(downloadedVideo.buffer, {
                expectedDurationSeconds: generatedMetadata.durationApplied,
                durationToleranceSeconds: 1.25,
                expectedAspectRatio: generatedCanvas.width / generatedCanvas.height,
                requireAudibleAudio: generatedMetadata.audioApplied,
                maxBlackFrameRatio: 0.18,
            });
            const needsCanvasNormalization =
                sourceQualityInspection.width !== generatedCanvas.width || sourceQualityInspection.height !== generatedCanvas.height;
            const canvasNormalization = {
                applied: sourceQualityInspection.passed && needsCanvasNormalization,
                sourceWidth: sourceQualityInspection.width,
                sourceHeight: sourceQualityInspection.height,
                targetWidth: generatedCanvas.width,
                targetHeight: generatedCanvas.height,
                strategy: 'cover-crop' as const,
            };
            const videoBufferForStorage =
                sourceQualityInspection.passed && needsCanvasNormalization
                    ? await normalizeVideoBufferToCanvas({
                          buffer: downloadedVideo.buffer,
                          width: generatedCanvas.width,
                          height: generatedCanvas.height,
                      })
                    : downloadedVideo.buffer;
            lastQualityInspection = sourceQualityInspection.passed
                ? await inspectVideoBufferQuality(videoBufferForStorage, {
                      expectedDurationSeconds: generatedMetadata.durationApplied,
                      durationToleranceSeconds: 1.25,
                      expectedWidth: generatedCanvas.width,
                      expectedHeight: generatedCanvas.height,
                      dimensionTolerancePixels: PROVIDER_CANVAS_DIMENSION_TOLERANCE_PIXELS,
                      expectedAspectRatio: generatedCanvas.width / generatedCanvas.height,
                      requireAudibleAudio: generatedMetadata.audioApplied,
                      maxBlackFrameRatio: 0.18,
                  })
                : sourceQualityInspection;
            lastAudioInspection = lastQualityInspection.audio;
            if (!lastQualityInspection.passed) {
                const discardReason = lastQualityInspection.issues[0]?.code || 'quality_validation_failed';
                const recoverableProviderOutput =
                    discardReason === 'resolution_mismatch'
                    && activeProviderCheckpoint?.status === 'completed'
                        ? activeProviderCheckpoint
                        : null;
                await updateJob(jobId, {
                    metadata: {
                        ...baseJobMetadata,
                        repeatCount: totalSegments,
                        autoMergeAfterLoop,
                        resolvedPrompt: renderPrompt,
                        lastSegmentPrompt: segmentPrompt,
                        continuity,
                        renderResult: generatedMetadata,
                        providerVideo: recoverableProviderOutput,
                        providerVideoDiscarded: {
                            reason: discardReason,
                            providerJobId: activeProviderCheckpoint?.jobId || null,
                            modelId: generatedMetadata.modelUsed,
                            discardedAt: new Date().toISOString(),
                            recoverable: Boolean(recoverableProviderOutput),
                            checkpoint: activeProviderCheckpoint,
                        },
                        providerOutputRecovery: null,
                        audioInspection: lastAudioInspection,
                        sourceQualityInspection,
                        canvasNormalization,
                        qualityInspection: lastQualityInspection,
                        generatedClipIds,
                    },
                });
                requirePassingVideoQuality(lastQualityInspection, 'OpenRouter scene video');
            }
            const savedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: videoBufferForStorage,
                userId: claimed.data.userId,
                projectId: request.projectId,
                pathSuffix: outputIdentity.videoPathSuffix,
                contentType: downloadedVideo.contentType || 'video/mp4',
            });

            await updateJob(jobId, {
                progress: 24 + Math.round(((segmentIndex + 0.8) / totalSegments) * 58),
                message:
                    totalSegments > 1
                        ? `Extracting the continuity frame for segment ${segmentIndex + 1}/${totalSegments}.`
                        : 'Extracting and storing the last frame for continuity.',
                metadata: {
                    ...baseJobMetadata,
                    repeatCount: totalSegments,
                    autoMergeAfterLoop,
                    resolvedPrompt: renderPrompt,
                    lastSegmentPrompt: segmentPrompt,
                    continuity,
                    renderResult: generatedMetadata,
                    sourceQualityInspection,
                    canvasNormalization,
                    providerVideo: activeProviderCheckpoint,
                    providerVideoDiscarded: null,
                    providerOutputRecovery,
                    generatedClipIds,
                    loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex,
                        completedSegments: generatedClipIds.length,
                        phase: 'extracting',
                        autoMergeAfterLoop,
                        currentClipTitle: segmentTitle,
                        generatedClipIds,
                    }),
                },
            });

            const lastFrameUrl = await extractAndStoreLastFrame({
                videoUrl: savedVideoUrl,
                userId: claimed.data.userId,
                projectId: request.projectId,
                token: outputIdentity.frameToken,
            });

            const savedClip = await createClipRecord({
                clipId: outputIdentity.clipId,
                userId: claimed.data.userId,
                projectId: request.projectId,
                title: segmentTitle,
                prompt,
                mode: clipMode,
                videoUrl: savedVideoUrl,
                posterUrl: lastFrameUrl,
                lastFrameUrl,
                continuityNotes: continuity.continuityNotes,
                cameraNotes: continuity.cameraNotes,
                subjectLock: continuity.subjectLock,
                takeGroupId,
                parentTakeClipId,
                sourceClipId: currentSourceClipId,
                sourceVideoUrl: currentSourceVideoUrl,
                duration: generatedMetadata.durationApplied,
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
            });

            generatedClipIds.push(savedClip.clipId);
            baseJobMetadata.outputCheckpoints = upsertVideoStudioOutputCheckpoint(
                baseJobMetadata.outputCheckpoints,
                {
                    version: 1,
                    jobId,
                    slot: outputIdentity.slot,
                    segmentIndex,
                    clipId: savedClip.clipId,
                    videoStoragePath: outputIdentity.videoStoragePath,
                    frameStoragePath: outputIdentity.frameStoragePath,
                    savedAt: new Date().toISOString(),
                },
            );
            baseJobMetadata.providerOutputStaging = {
                ...stagingCheckpoint,
                status: 'finalized',
                finalizedAt: new Date().toISOString(),
                clipId: savedClip.clipId,
            };
            pendingStagingCleanupPaths.add(outputIdentity.stagingStoragePath);
            providerResumeRequired = false;
            baseJobMetadata.providerResumeRequired = false;
            delete baseJobMetadata.providerVideoAccessIssue;
            finalClipId = savedClip.clipId;
            finalVideoUrl = savedVideoUrl;
            finalFrameUrl = lastFrameUrl;
            currentSourceClipId = savedClip.clipId;
            currentSourceVideoUrl = savedVideoUrl;
            currentReferenceImage = lastFrameUrl;

            await updateJob(jobId, {
                progress: 24 + Math.round(((segmentIndex + 1) / totalSegments) * 58),
                message: `Saved scene ${segmentIndex + 1}/${totalSegments}.`,
                stagingCleanupPending: true,
                stagingCleanupPaths: [...pendingStagingCleanupPaths],
                metadata: {
                    ...baseJobMetadata,
                    repeatCount: totalSegments,
                    autoMergeAfterLoop,
                    resolvedPrompt: renderPrompt,
                    continuity,
                    renderResult: generatedMetadata,
                    sourceQualityInspection,
                    canvasNormalization,
                    qualityInspection: lastQualityInspection,
                    providerVideo: activeProviderCheckpoint,
                    providerVideoDiscarded: null,
                    providerOutputRecovery,
                    generatedClipIds,
                    loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex,
                        completedSegments: generatedClipIds.length,
                        phase: 'extracting',
                        autoMergeAfterLoop,
                        currentClipTitle: segmentTitle,
                        generatedClipIds,
                    }),
                },
            });
            try {
                await deleteVideoStudioStorageObject({
                    userId: claimed.data.userId,
                    projectId: request.projectId,
                    storagePath: outputIdentity.stagingStoragePath,
                });
                pendingStagingCleanupPaths.delete(outputIdentity.stagingStoragePath);
                baseJobMetadata.providerOutputStaging = null;
            } catch (cleanupError) {
                console.error('[VideoStudioWorker] failed to clean finalized provider staging:', cleanupError);
            }
            const stagingCleanupPaths = [...pendingStagingCleanupPaths];
            baseJobMetadata.providerOutputStagingCleanup = stagingCleanupPaths.length > 0
                ? {
                      pendingPaths: stagingCleanupPaths,
                      lastAttemptAt: new Date().toISOString(),
                  }
                : null;
            await updateJob(jobId, {
                stagingCleanupPending: stagingCleanupPaths.length > 0,
                stagingCleanupPaths,
                metadata: { ...baseJobMetadata },
            });
        }

        if (autoMergeAfterLoop && generatedClipIds.length > 1) {
            const finalOutputIdentity = buildVideoStudioOutputIdentity({
                jobId,
                userId: claimed.data.userId,
                projectId: request.projectId,
                segmentIndex: 'final',
            });
            await updateJob(jobId, {
                status: 'uploading',
                progress: 84,
                message: 'Auto-merging generated segments into a final clip.',
                metadata: {
                    ...baseJobMetadata,
                    repeatCount: totalSegments,
                    autoMergeAfterLoop,
                    resolvedPrompt: renderPrompt,
                    continuity,
                    generatedClipIds,
                    loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex: totalSegments - 1,
                        completedSegments: generatedClipIds.length,
                        phase: 'merging',
                        autoMergeAfterLoop,
                        currentClipTitle: `${title} final cut`,
                        generatedClipIds,
                    }),
                },
            });

            const generatedClips = await getClips(generatedClipIds, claimed.data.userId, request.projectId);
            const mergedBuffer = await mergeVideos({
                clips: generatedClips.map((clip) => ({ url: clip.data.videoUrl })),
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
                fps: 30,
            });
            const finalCanvas = getVideoCanvasSize(project.data.aspectRatio, project.data.resolution);
            const expectedMergedDuration = generatedClips.reduce((total, clip) => total + Math.max(0, Number(clip.data.duration ?? 0)), 0);
            finalQualityInspection = await inspectVideoBufferQuality(mergedBuffer, {
                ...(expectedMergedDuration > 0 ? { expectedDurationSeconds: expectedMergedDuration } : {}),
                durationToleranceSeconds: Math.max(1.5, generatedClips.length * 0.35),
                expectedWidth: finalCanvas.width,
                expectedHeight: finalCanvas.height,
                expectedAspectRatio: finalCanvas.width / finalCanvas.height,
                requireAudibleAudio: Boolean(lastRenderResult?.audioApplied),
                maxBlackFrameRatio: 0.2,
            });
            requirePassingVideoQuality(finalQualityInspection, 'Auto-merged final video');

            const mergedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: mergedBuffer,
                userId: claimed.data.userId,
                projectId: request.projectId,
                pathSuffix: finalOutputIdentity.videoPathSuffix,
                contentType: 'video/mp4',
            });
            const mergedFrameUrl = await extractAndStoreLastFrame({
                videoUrl: mergedVideoUrl,
                userId: claimed.data.userId,
                projectId: request.projectId,
                token: finalOutputIdentity.frameToken,
            });

            const mergedClip = await createClipRecord({
                clipId: finalOutputIdentity.clipId,
                userId: claimed.data.userId,
                projectId: request.projectId,
                title: `${title} final cut`,
                prompt: `${prompt}\n\nAuto-merged from ${generatedClipIds.length} generated segments.`,
                mode: 'merge',
                videoUrl: mergedVideoUrl,
                posterUrl: mergedFrameUrl,
                lastFrameUrl: mergedFrameUrl,
                continuityNotes: continuity.continuityNotes,
                cameraNotes: continuity.cameraNotes,
                subjectLock: continuity.subjectLock,
                mergeSourceClipIds: generatedClipIds,
                duration: finalQualityInspection.durationSeconds,
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
            });

            finalClipId = mergedClip.clipId;
            finalVideoUrl = mergedVideoUrl;
            finalFrameUrl = mergedFrameUrl;
            baseJobMetadata.outputCheckpoints = upsertVideoStudioOutputCheckpoint(
                baseJobMetadata.outputCheckpoints,
                {
                    version: 1,
                    jobId,
                    slot: finalOutputIdentity.slot,
                    segmentIndex: null,
                    clipId: mergedClip.clipId,
                    videoStoragePath: finalOutputIdentity.videoStoragePath,
                    frameStoragePath: finalOutputIdentity.frameStoragePath,
                    savedAt: new Date().toISOString(),
                },
            );
        }

        await updateJob(jobId, {
            status: 'completed',
            progress: 100,
            message:
                totalSegments > 1
                    ? autoMergeAfterLoop
                        ? `Rendered ${totalSegments} segments and saved an auto-merged final clip.`
                        : `Rendered ${totalSegments} linked segments and saved them to the timeline.`
                    : 'Rendered clip saved to the project timeline.',
            clipId: finalClipId,
            resultVideoUrl: finalVideoUrl,
            resultFrameUrl: finalFrameUrl,
            stagingCleanupPending: pendingStagingCleanupPaths.size > 0,
            stagingCleanupPaths: [...pendingStagingCleanupPaths],
            metadata: {
                ...baseJobMetadata,
                repeatCount: totalSegments,
                autoMergeAfterLoop,
                resolvedPrompt: renderPrompt,
                continuity,
                generatedClipIds,
                providerVideo: activeProviderCheckpoint,
                providerVideoDiscarded: null,
                providerOutputRecovery,
                ...(lastRenderResult ? { renderResult: lastRenderResult } : {}),
                ...(lastAudioInspection ? { audioInspection: lastAudioInspection } : {}),
                ...(lastQualityInspection ? { qualityInspection: lastQualityInspection } : {}),
                ...(finalQualityInspection ? { finalQualityInspection } : {}),
                loopProgress: buildLoopProgress({
                    totalSegments,
                    segmentIndex: Math.max(0, totalSegments - 1),
                    completedSegments: generatedClipIds.length,
                    phase: 'completed',
                    autoMergeAfterLoop,
                    currentClipTitle:
                        autoMergeAfterLoop && generatedClipIds.length > 1
                            ? `${title} final cut`
                            : buildLoopClipTitle(title, Math.max(0, totalSegments - 1), totalSegments),
                    generatedClipIds,
                }),
            },
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        if (
            error instanceof VideoStudioJobCanceledError
            || await finalizeJobCancellationIfRequested(jobId)
        ) {
            return;
        }
        if (error instanceof OpenRouterVideoPendingError) {
            const nextPollDelayMs = 45_000 + Math.floor(Math.random() * 15_001);
            await updateJob(jobId, {
                status: 'queued',
                progress: 18,
                message: 'OpenRouter is still rendering. The same provider job will resume automatically.',
                errorMessage: null,
                nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now() + nextPollDelayMs),
                finishedAt: null,
            });
            return;
        }

        const providerOutputUnavailable = isOpenRouterVideoContentUnavailableError(error);
        const providerOutputAccessBlocked = isOpenRouterVideoContentAccessError(error);
        const previousProviderAccessIssue = asMetadataRecord(baseJobMetadata.providerVideoAccessIssue);
        const sameProviderAccessFailure = Boolean(
            providerOutputAccessBlocked
            && previousProviderAccessIssue
            && previousProviderAccessIssue.providerJobId === providerCheckpointForFailure?.jobId
            && previousProviderAccessIssue.httpStatus === error.status
        );
        const previousProviderAccessAttemptCount = sameProviderAccessFailure
            ? Math.max(
                  1,
                  Number.isInteger(previousProviderAccessIssue?.attemptCount)
                      ? Number(previousProviderAccessIssue?.attemptCount)
                      : 1,
              )
            : 0;
        const providerAccessAttemptCount = providerOutputAccessBlocked
            ? previousProviderAccessAttemptCount + 1
            : 0;
        const providerAccessRetryAllowed = providerOutputAccessBlocked
            && providerAccessAttemptCount < 2;
        const ambiguousProviderSubmission = error instanceof OpenRouterVideoRequestError
            && error.code === 'ambiguous_provider_submission';
        const rawMessage = ambiguousProviderSubmission
            ? 'OpenRouter가 요청을 받았는지 확정할 수 없어 자동 재시도를 중단했습니다. 사용량을 확인한 뒤 새 작업 여부를 결정해 주세요.'
            : providerOutputUnavailable
            ? '기존 OpenRouter 영상 결과 파일을 더는 받을 수 없습니다. 새 유료 요청은 자동으로 보내지 않았습니다.'
            : providerOutputAccessBlocked
              ? error.status === 401
                  ? 'OpenRouter 인증을 확인한 뒤 기존 결과 저장을 다시 시도해 주세요. 작업 ID를 보존했으며 새 영상 요청은 보내지 않았습니다.'
                  : 'OpenRouter가 기존 결과 파일 접근을 거부했습니다. 작업 ID를 보존했습니다. 계정 권한을 확인한 뒤 추가 생성비 없이 다시 저장하세요.'
              : error instanceof Error
                ? error.message
                : 'Video studio job failed.';
        const resolvedProviderFailureMessage = providerOutputAccessBlocked && !providerAccessRetryAllowed
            ? 'OpenRouter가 같은 기존 영상 결과의 다운로드를 다시 거부했습니다. 기존 파일은 더 이상 무비용으로 복구할 수 없으며 새 유료 영상 요청은 보내지 않았습니다.'
            : rawMessage;
        const privacyBlocked = isOpenRouterInputImagePrivacyError(error);
        const retryCount = Number(baseJobMetadata.workerRetryCount ?? 0);
        if (isTransientVideoStudioError(error) && retryCount < 3) {
            const nextRetryCount = retryCount + 1;
            const retryDelayMs = Math.min(5 * 60 * 1000, 30 * 1000 * 2 ** (nextRetryCount - 1));
            await updateJob(jobId, {
                status: 'queued',
                progress: Math.max(8, Math.min(90, Number(claimed.data.progress ?? 8))),
                message: `Temporary provider or network failure. Automatic retry ${nextRetryCount}/3 is scheduled.`,
                errorMessage: null,
                nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now() + retryDelayMs),
                finishedAt: null,
                'metadata.workerRetryCount': nextRetryCount,
                'metadata.lastWorkerError': {
                    message: resolvedProviderFailureMessage.slice(0, 1000),
                    occurredAt: new Date().toISOString(),
                },
            });
            return;
        }

        const failedStagingCheckpoint = readProviderOutputStagingCheckpoint(baseJobMetadata.providerOutputStaging);
        if (
            failedStagingCheckpoint
            && failedStagingCheckpoint.storagePath.startsWith(ownedStoragePrefix)
            && failedStagingCheckpoint.storagePath.includes('/staging/')
        ) {
            pendingStagingCleanupPaths.add(failedStagingCheckpoint.storagePath);
            baseJobMetadata.providerOutputStaging = null;
        }
        const failedStagingCleanupPaths = [...pendingStagingCleanupPaths];
        baseJobMetadata.providerOutputStagingCleanup = failedStagingCleanupPaths.length > 0
            ? {
                  pendingPaths: failedStagingCleanupPaths,
                  lastAttemptAt: new Date().toISOString(),
              }
            : null;

        if (providerOutputUnavailable) {
            baseJobMetadata.providerVideo = null;
            baseJobMetadata.providerVideoDiscarded = {
                reason: error.status === 410
                    ? 'provider_output_expired'
                    : 'provider_output_not_found',
                recoverable: false,
                providerJobId: providerCheckpointForFailure?.jobId || null,
                modelId: providerCheckpointForFailure?.modelId || null,
                httpStatus: error.status,
                discardedAt: new Date().toISOString(),
            };
        }
        if (providerOutputAccessBlocked) {
            baseJobMetadata.providerResumeRequired = providerAccessRetryAllowed;
            baseJobMetadata.providerVideoAccessIssue = {
                reason: error.status === 401
                    ? 'provider_output_auth_failed'
                    : 'provider_output_access_denied',
                recoverable: providerAccessRetryAllowed,
                attemptCount: providerAccessAttemptCount,
                providerJobId: providerCheckpointForFailure?.jobId || null,
                modelId: providerCheckpointForFailure?.modelId || null,
                httpStatus: error.status,
                occurredAt: new Date().toISOString(),
            };
            if (!providerAccessRetryAllowed) {
                baseJobMetadata.providerVideo = null;
                baseJobMetadata.providerVideoDiscarded = {
                    reason: error.status === 401
                        ? 'provider_output_auth_failed'
                        : 'provider_output_access_denied',
                    recoverable: false,
                    providerJobId: providerCheckpointForFailure?.jobId || null,
                    modelId: providerCheckpointForFailure?.modelId || null,
                    httpStatus: error.status,
                    discardedAt: new Date().toISOString(),
                };
            }
        }
        if (privacyBlocked) {
            baseJobMetadata.failureReasonCode = 'input_image_privacy';
            baseJobMetadata.failedVisualInputMode = request?.visualInputMode || 'standard';
        }
        if (ambiguousProviderSubmission) {
            baseJobMetadata.failureCode = 'ambiguous_provider_submission';
            baseJobMetadata.failureStage = 'provider-submission';
            baseJobMetadata.retryStrategy = 'manual-review';
            baseJobMetadata.uncertainCost = true;
        }

        const hintMessage = deriveVideoInfraHint(resolvedProviderFailureMessage);
        await updateJob(jobId, {
            status: 'failed',
            progress: 100,
            message: error instanceof VideoStudioWorkerError ? rawMessage : hintMessage,
            errorMessage: privacyBlocked ? hintMessage : resolvedProviderFailureMessage,
            nextAttemptAt: null,
            stagingCleanupPending: failedStagingCleanupPaths.length > 0,
            stagingCleanupPaths: failedStagingCleanupPaths,
            metadata: { ...baseJobMetadata },
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch((updateError) => {
            console.error('[VideoStudioWorker] failed to update job status:', updateError);
        });

        throw error;
    }
}
