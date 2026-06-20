import * as admin from 'firebase-admin';
import {
    deriveVideoInfraHint,
    generateGrokVideo,
} from './xai';
import { extractVideoFrame, mergeVideos } from './ffmpeg';
import { videoStudioJobRequestSchema } from './request';

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

type VideoStudioJobStatus =
    | 'queued'
    | 'running'
    | 'uploading'
    | 'completed'
    | 'failed'
    | 'canceled';

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
    metadata?: Record<string, unknown> | null;
};

type VideoStudioProjectDoc = {
    userId: string;
    title: string;
    synopsis?: string;
    aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';
    resolution: '480p' | '720p';
};

type VideoStudioClipDoc = {
    userId: string;
    projectId: string;
    title: string;
    prompt: string;
    mode: VideoStudioClipMode;
    status: 'ready' | 'processing' | 'failed';
    provider: 'grok';
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

function resolveContinuityField(params: {
    requestValue?: string;
    requestHasValue: boolean;
    sourceValue?: string | null;
}) {
    if (params.requestHasValue) {
        return normalizeOptionalStudioText(params.requestValue);
    }

    return normalizeOptionalStudioText(params.sourceValue);
}

function resolveContinuityFields(
    request: ReturnType<typeof readRequest>,
    sourceClip?: VideoStudioClipDoc | null,
) {
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

async function getStorageFileUrl(path: string): Promise<string> {
    const [url] = await getStorageBucket().file(path).getSignedUrl({
        action: 'read',
        expires: new Date('2500-03-01T00:00:00.000Z'),
    });
    return url;
}

async function fetchRemoteBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new VideoStudioWorkerError(502, `Failed to download media asset. HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
}

async function uploadBufferToVideoStudioStorage(params: {
    buffer: Buffer;
    userId: string;
    projectId: string;
    pathSuffix: string;
    contentType: string;
}): Promise<string> {
    const file = getStorageBucket().file(`video_studio/${params.userId}/${params.projectId}/${params.pathSuffix}`);
    await file.save(params.buffer, {
        metadata: {
            contentType: params.contentType,
        },
    });

    return getStorageFileUrl(file.name);
}

async function uploadRemoteFileToVideoStudioStorage(params: {
    sourceUrl: string;
    userId: string;
    projectId: string;
    pathSuffix: string;
    fallbackContentType: string;
}): Promise<string> {
    const downloaded = await fetchRemoteBuffer(params.sourceUrl);
    return uploadBufferToVideoStudioStorage({
        buffer: downloaded.buffer,
        userId: params.userId,
        projectId: params.projectId,
        pathSuffix: params.pathSuffix,
        contentType: downloaded.contentType || params.fallbackContentType,
    });
}

async function updateJob(jobId: string, data: Partial<VideoStudioJobDoc> & Record<string, unknown>) {
    await db.collection('video_studio_jobs').doc(jobId).update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

async function claimJob(jobId: string): Promise<{ id: string; data: VideoStudioJobDoc }> {
    const jobRef = db.collection('video_studio_jobs').doc(jobId);

    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) {
            throw new VideoStudioWorkerError(404, 'The selected job no longer exists.');
        }

        const job = snapshot.data() as VideoStudioJobDoc;
        if (job.status === 'running' || job.status === 'uploading') {
            throw new VideoStudioWorkerError(409, 'This job is already being processed.');
        }
        if (job.status === 'completed') {
            throw new VideoStudioWorkerError(409, 'This job has already completed.');
        }
        if (job.status === 'canceled') {
            throw new VideoStudioWorkerError(409, 'Canceled jobs cannot be processed.');
        }

        transaction.update(jobRef, {
            status: 'running',
            progress: 8,
            message: 'Preparing project assets on the worker.',
            attemptCount: Number(job.attemptCount ?? 0) + 1,
            claimedAt: admin.firestore.FieldValue.serverTimestamp(),
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
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
                attemptCount: Number(job.attemptCount ?? 0) + 1,
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
    const clips = await Promise.all(clipIds.map((clipId) => getClip(clipId, userId, projectId)));
    return clips.sort(
        (a, b) => a.data.sequence - b.data.sequence || String(a.id).localeCompare(String(b.id)),
    );
}

async function extractAndStoreLastFrame(params: {
    videoUrl: string;
    userId: string;
    projectId: string;
    token: string;
}): Promise<string> {
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

async function ensureStoredLastFrame(params: {
    clipId: string;
    clip: VideoStudioClipDoc;
    userId: string;
}): Promise<string> {
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
    const clipRef = db.collection('video_studio_clips').doc();

    return db.runTransaction(async (transaction) => {
        const clipsQuery = db.collection('video_studio_clips').where('projectId', '==', params.projectId);
        const [projectDoc, clipDocs] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(clipsQuery),
        ]);

        if (!projectDoc.exists) {
            throw new VideoStudioWorkerError(404, 'The selected project no longer exists.');
        }

        const project = projectDoc.data() as VideoStudioProjectDoc;
        if (project.userId !== params.userId) {
            throw new VideoStudioWorkerError(403, 'You do not have permission to add clips to this project.');
        }

        let highest = -1;
        clipDocs.docs.forEach((doc) => {
            const sequence = Number((doc.data() as VideoStudioClipDoc).sequence ?? -1);
            if (Number.isFinite(sequence) && sequence > highest) {
                highest = sequence;
            }
        });
        const nextSequence = highest + 1;
        const normalizedTakeGroupId = params.takeGroupId || null;
        let resolvedTakeIndex: number | null = params.takeIndex ?? null;

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

        transaction.set(clipRef, {
            userId: params.userId,
            projectId: params.projectId,
            title: params.title.trim(),
            prompt: params.prompt.trim(),
            mode: params.mode,
            status: 'ready',
            provider: 'grok',
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
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.update(projectRef, {
            clipCount: nextSequence + 1,
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

function buildLoopClipTitle(baseTitle: string, segmentIndex: number, totalSegments: number) {
    if (totalSegments <= 1) {
        return baseTitle;
    }

    return `${baseTitle} ${segmentIndex + 1}/${totalSegments}`;
}

function buildLoopSegmentPrompt(params: {
    renderPrompt: string;
    segmentIndex: number;
    totalSegments: number;
}) {
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
    const request = job.metadata && typeof job.metadata === 'object'
        ? (job.metadata.request as unknown)
        : null;

    const parsed = videoStudioJobRequestSchema.safeParse(request);
    if (!parsed.success) {
        throw new VideoStudioWorkerError(400, 'The queued job payload is invalid.');
    }

    return parsed.data;
}

export async function processQueuedVideoStudioJob(jobId: string) {
    const claimed = await claimJob(jobId);

    try {
        const request = readRequest(claimed.data);
        const project = await getProject(request.projectId, claimed.data.userId);
        const title = claimed.data.title;
        const baseJobMetadata =
            claimed.data.metadata && typeof claimed.data.metadata === 'object'
                ? claimed.data.metadata
                : {};
        let sourceClipForContinuity: { id: string; data: VideoStudioClipDoc } | null = null;

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
            const continuity = resolveContinuityFields(request);

            await updateJob(jobId, {
                progress: 28,
                message: 'Downloading and normalizing selected clips for FFmpeg.',
            });

            const mergedBuffer = await mergeVideos({
                clips: clips.map((clip) => ({ url: clip.data.videoUrl })),
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
                fps: 30,
            });

            await updateJob(jobId, {
                status: 'uploading',
                progress: 72,
                message: 'Uploading merged clip and extracting its continuity frame.',
            });

            const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
            const savedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: mergedBuffer,
                userId: claimed.data.userId,
                projectId: request.projectId,
                pathSuffix: `clips/${token}.mp4`,
                contentType: 'video/mp4',
            });
            const lastFrameUrl = await extractAndStoreLastFrame({
                videoUrl: savedVideoUrl,
                userId: claimed.data.userId,
                projectId: request.projectId,
                token,
            });

            const savedClip = await createClipRecord({
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
                duration: null,
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
            });

            await updateJob(jobId, {
                status: 'completed',
                progress: 100,
                message: 'Merged clip saved to the project timeline.',
                clipId: savedClip.clipId,
                resultVideoUrl: savedVideoUrl,
                resultFrameUrl: lastFrameUrl,
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return;
        }

        const prompt = requirePrompt(request.prompt, request.operation);
        const totalSegments = normalizeRepeatCount(request.repeatCount);
        const autoMergeAfterLoop = request.autoMergeAfterLoop === true && totalSegments > 1;
        let sourceClipId: string | null = null;
        let sourceVideoUrl: string | null = null;
        let referenceImage = request.referenceImage;
        let generationMode: 'generate' | 'extend' | 'edit' = 'generate';
        let operationMode: VideoStudioClipMode =
            request.operation === 'generate' ? 'generate' : 'continue';

        if (request.operation === 'extend' || request.operation === 'edit') {
            const sourceClip = await getClip(
                requireSourceClipId(request.sourceClipId, request.operation),
                claimed.data.userId,
                request.projectId,
            );

            sourceClipForContinuity = sourceClip;
            sourceClipId = sourceClip.id;
            sourceVideoUrl = sourceClip.data.videoUrl;
            generationMode = request.operation;
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
            referenceImage = await ensureStoredLastFrame({
                clipId: sourceClip.id,
                clip: sourceClip.data,
                userId: claimed.data.userId,
            });
            generationMode = 'generate';
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

        const generatedClipIds: string[] = [];
        let finalClipId: string | undefined;
        let finalVideoUrl: string | undefined;
        let finalFrameUrl: string | undefined;
        let currentSourceClipId = sourceClipId;
        let currentSourceVideoUrl = sourceVideoUrl;
        let currentReferenceImage = referenceImage;

        for (let segmentIndex = 0; segmentIndex < totalSegments; segmentIndex += 1) {
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

            await updateJob(jobId, {
                progress: 12 + Math.round((segmentIndex / totalSegments) * 58),
                message:
                    totalSegments > 1
                        ? `Rendering segment ${segmentIndex + 1}/${totalSegments} with Grok.`
                        : request.operation === 'continue'
                            ? 'Submitting the continuation render to Grok.'
                            : `Submitting ${request.operation} render to Grok.`,
                metadata: {
                    ...baseJobMetadata,
                    repeatCount: totalSegments,
                    autoMergeAfterLoop,
                    continuity,
                    generatedClipIds,
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

            const generated = await generateGrokVideo({
                prompt: segmentPrompt,
                mode: segmentMode,
                image: currentReferenceImage,
                videoUrl: currentSourceVideoUrl || undefined,
                duration: request.duration,
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
            });

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
                    renderResult: generated.metadata,
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

            const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
            const savedVideoUrl = await uploadRemoteFileToVideoStudioStorage({
                sourceUrl: generated.videoUrl,
                userId: claimed.data.userId,
                projectId: request.projectId,
                pathSuffix: `clips/${token}.mp4`,
                fallbackContentType: 'video/mp4',
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
                    renderResult: generated.metadata,
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
                token,
            });

            const savedClip = await createClipRecord({
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
                duration: request.duration ?? null,
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
            });

            generatedClipIds.push(savedClip.clipId);
            finalClipId = savedClip.clipId;
            finalVideoUrl = savedVideoUrl;
            finalFrameUrl = lastFrameUrl;
            currentSourceClipId = savedClip.clipId;
            currentSourceVideoUrl = savedVideoUrl;
            currentReferenceImage = lastFrameUrl;
        }

        if (autoMergeAfterLoop && generatedClipIds.length > 1) {
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

            const mergeToken = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
            const mergedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: mergedBuffer,
                userId: claimed.data.userId,
                projectId: request.projectId,
                pathSuffix: `clips/${mergeToken}.mp4`,
                contentType: 'video/mp4',
            });
            const mergedFrameUrl = await extractAndStoreLastFrame({
                videoUrl: mergedVideoUrl,
                userId: claimed.data.userId,
                projectId: request.projectId,
                token: mergeToken,
            });

            const mergedClip = await createClipRecord({
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
                duration: null,
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
            });

            finalClipId = mergedClip.clipId;
            finalVideoUrl = mergedVideoUrl;
            finalFrameUrl = mergedFrameUrl;
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
            metadata: {
                ...baseJobMetadata,
                repeatCount: totalSegments,
                autoMergeAfterLoop,
                resolvedPrompt: renderPrompt,
                continuity,
                generatedClipIds,
                loopProgress: buildLoopProgress({
                    totalSegments,
                    segmentIndex: Math.max(0, totalSegments - 1),
                    completedSegments: generatedClipIds.length,
                    phase: 'completed',
                    autoMergeAfterLoop,
                    currentClipTitle: autoMergeAfterLoop && generatedClipIds.length > 1
                        ? `${title} final cut`
                        : buildLoopClipTitle(title, Math.max(0, totalSegments - 1), totalSegments),
                    generatedClipIds,
                }),
            },
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Video studio job failed.';
        await updateJob(jobId, {
            status: 'failed',
            progress: 100,
            message:
                error instanceof VideoStudioWorkerError
                    ? rawMessage
                    : deriveVideoInfraHint(rawMessage),
            errorMessage: rawMessage,
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch((updateError) => {
            console.error('[VideoStudioWorker] failed to update job status:', updateError);
        });

        throw error;
    }
}
