import {
    OpenRouterVideoPendingError,
    deriveVideoInfraHint,
    downloadOpenRouterVideo,
    generateOpenRouterVideo,
    isOpenRouterInputImagePrivacyError,
    isOpenRouterVideoContentAccessError,
    isOpenRouterVideoContentUnavailableError,
    readOpenRouterVideoCheckpoint,
    type OpenRouterVideoCheckpoint,
} from '@/lib/server/video-generation';
import type { VideoStudioClipMode, VideoStudioJob, VideoStudioResolution } from '@/lib/video-studio';
import {
    VideoStudioServerError,
    VideoStudioJobCanceledError,
    assertVideoStudioJobCanContinue,
    claimVideoStudioJobForProcessing,
    createVideoStudioClipRecord,
    deleteVideoStudioStorageObject,
    downloadVideoStudioStorageBuffer,
    ensureStoredLastFrame,
    extractAndStoreLastFrame,
    getOwnedClip,
    getOwnedClips,
    getOwnedProject,
    updateVideoStudioJob,
    uploadBufferToVideoStudioStorage,
    mergeVideoStudioClips,
    finalizeVideoStudioJobCancellationIfRequested,
} from '@/lib/server/video-studio-admin';
import {
    buildVideoStudioOutputIdentity,
    estimateVideoStudioMergeDuration,
    readProviderOutputStagingCheckpoint,
    readStoredVideoRenderMetadata,
    upsertVideoStudioOutputCheckpoint,
    type ProviderOutputStagingCheckpoint,
    type StoredVideoRenderMetadata,
} from '@/lib/server/video-studio-output-durability';
import { VideoStudioJobRequest, VideoStudioJobRequestSchema } from '@/lib/video-studio-job-request';
import {
    getVideoCanvasSize,
    inspectVideoBufferQuality,
    normalizeVideoBufferToCanvas,
    PROVIDER_CANVAS_DIMENSION_TOLERANCE_PIXELS,
    type VideoAudioInspection,
    type VideoQualityInspection,
} from '@/lib/server/ffmpeg';

const NEXT_VIDEO_PROVIDER_POLL_WINDOW_MS = 75 * 1000;

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

function resolveContinuityFields(
    request: VideoStudioJobRequest,
    sourceClip?: {
        continuityNotes?: string | null;
        cameraNotes?: string | null;
        subjectLock?: string | null;
    } | null,
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

function requirePrompt(prompt: string | undefined, operation: string) {
    if (!prompt?.trim()) {
        throw new VideoStudioServerError(400, `A prompt is required for "${operation}".`);
    }
    return prompt.trim();
}

function requireSourceClipId(sourceClipId: string | undefined, operation: string) {
    if (!sourceClipId) {
        throw new VideoStudioServerError(400, `sourceClipId is required for "${operation}".`);
    }
    return sourceClipId;
}

function requireMergeClipIds(mergeClipIds: string[] | undefined) {
    if (!mergeClipIds || mergeClipIds.length === 0) {
        throw new VideoStudioServerError(400, 'Select one or more clips to merge.');
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
    throw new VideoStudioServerError(422, `${context} quality validation failed. ${details}`.trim());
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

function readRequestFromJob(job: VideoStudioJob): VideoStudioJobRequest {
    const request = job.metadata && typeof job.metadata === 'object' ? (job.metadata.request as unknown) : null;

    const parsed = VideoStudioJobRequestSchema.safeParse(request);
    if (!parsed.success) {
        throw new VideoStudioServerError(400, 'The queued job payload is invalid.');
    }

    return parsed.data;
}

function asMetadataRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function readRecoverableCanvasMetadata(metadata: VideoStudioJob['metadata']): {
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
    metadata: VideoStudioJob['metadata'];
    checkpointKey: string;
    request: VideoStudioJobRequest;
    requestedResolution: VideoStudioResolution;
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

function hasDeclaredResumableProviderVideo(metadata: VideoStudioJob['metadata']): boolean {
    const unavailableOutput = asMetadataRecord(metadata?.providerVideoDiscarded);
    const unavailableReason = unavailableOutput?.reason;
    const terminalLegacyUnavailable = unavailableReason === 'provider_output_unavailable'
        && unavailableOutput?.httpStatus !== 401
        && unavailableOutput?.httpStatus !== 403;
    if (
        unavailableReason === 'provider_output_not_found'
        || unavailableReason === 'provider_output_expired'
        || terminalLegacyUnavailable
    ) return false;
    const checkpoint = asMetadataRecord(metadata?.providerVideo);
    const status = checkpoint?.status;
    return Boolean(
        (typeof checkpoint?.jobId === 'string'
            && checkpoint.jobId.length > 0
            && (status === 'pending' || status === 'in_progress' || status === 'completed'))
        || readRecoverableCanvasMetadata(metadata),
    );
}

export async function executeQueuedVideoStudioJob(params: { jobId: string; userId: string }): Promise<{
    jobId: string;
    clipId?: string;
    videoUrl?: string;
    lastFrameUrl?: string;
    pending?: boolean;
    canceled?: boolean;
}> {
    const job = await claimVideoStudioJobForProcessing({
        jobId: params.jobId,
        userId: params.userId,
    });
    const baseJobMetadata = job.metadata && typeof job.metadata === 'object' ? job.metadata : {};
    const ownedStoragePrefix = `video_studio/${job.userId}/${job.projectId}/`;
    const pendingStagingCleanupPaths = new Set(
        Array.isArray(job.stagingCleanupPaths)
            ? job.stagingCleanupPaths.filter((path): path is string =>
                  typeof path === 'string' && path.startsWith(ownedStoragePrefix))
            : [],
    );
    let request: VideoStudioJobRequest | null = null;
    let providerCheckpointForFailure = readOpenRouterVideoCheckpoint(baseJobMetadata.providerVideo);

    try {
        request = readRequestFromJob(job);
        const project = await getOwnedProject(params.userId, request.projectId);
        const title = job.title;
        let sourceClipForContinuity: Awaited<ReturnType<typeof getOwnedClip>> | null = null;

        if (request.operation === 'extract-frame') {
            const clip = await getOwnedClip({
                userId: params.userId,
                clipId: requireSourceClipId(request.sourceClipId, request.operation),
                projectId: request.projectId,
            });

            await updateVideoStudioJob(job.id, {
                progress: 32,
                message: 'Extracting the last frame from the selected clip.',
            });

            const lastFrameUrl = await ensureStoredLastFrame({
                clip,
                userId: params.userId,
            });

            await updateVideoStudioJob(job.id, {
                status: 'completed',
                progress: 100,
                message: 'The last frame was stored for continuity.',
                clipId: clip.id,
                resultFrameUrl: lastFrameUrl,
                finishedAt: new Date().toISOString(),
            });

            return {
                jobId: job.id,
                clipId: clip.id,
                lastFrameUrl,
            };
        }

        if (request.operation === 'merge') {
            const mergeSourceClipIds = requireMergeClipIds(request.mergeClipIds);
            const clips = await getOwnedClips({
                userId: params.userId,
                clipIds: mergeSourceClipIds,
                projectId: request.projectId,
            });
            const continuity = resolveContinuityFields(request);
            const editsByClipId = new Map((request.mergeClipEdits || []).map((edit) => [edit.clipId, edit]));
            const mergeOutputIdentity = buildVideoStudioOutputIdentity({
                jobId: job.id,
                userId: params.userId,
                projectId: request.projectId,
                segmentIndex: 'final',
            });

            await updateVideoStudioJob(job.id, {
                progress: 28,
                message: 'Downloading and normalizing selected clips for FFmpeg.',
            });

            const mergedBuffer = await mergeVideoStudioClips({
                clips,
                aspectRatio: project.aspectRatio,
                resolution: project.resolution,
                fps: 30,
                mergeClipEdits: request.mergeClipEdits,
                backgroundMusicUrl: request.backgroundMusicUrl,
                audioMixPreset: request.audioMixPreset,
                backgroundMusicVolume: request.backgroundMusicVolume,
                sceneAudioVolume: request.sceneAudioVolume,
                audioCrossfadeSeconds: request.audioCrossfadeSeconds,
            });
            const mergeCanvas = getVideoCanvasSize(project.aspectRatio, project.resolution);
            const expectedMergedDuration = estimateVideoStudioMergeDuration(
                clips.map((clip) => ({
                    durationSeconds: typeof clip.duration === 'number' ? clip.duration : null,
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

            await updateVideoStudioJob(job.id, {
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
                userId: params.userId,
                projectId: request.projectId,
                pathSuffix: mergeOutputIdentity.videoPathSuffix,
                contentType: 'video/mp4',
            });
            const lastFrameUrl = await extractAndStoreLastFrame({
                videoUrl: savedVideoUrl,
                userId: params.userId,
                projectId: request.projectId,
                token: mergeOutputIdentity.frameToken,
            });

            const savedClip = await createVideoStudioClipRecord({
                clipId: mergeOutputIdentity.clipId,
                userId: params.userId,
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
                aspectRatio: project.aspectRatio,
                resolution: project.resolution,
            });
            baseJobMetadata.outputCheckpoints = upsertVideoStudioOutputCheckpoint(
                baseJobMetadata.outputCheckpoints,
                {
                    version: 1,
                    jobId: job.id,
                    slot: mergeOutputIdentity.slot,
                    segmentIndex: null,
                    clipId: savedClip.clipId,
                    videoStoragePath: mergeOutputIdentity.videoStoragePath,
                    frameStoragePath: mergeOutputIdentity.frameStoragePath,
                    savedAt: new Date().toISOString(),
                },
            );

            await updateVideoStudioJob(job.id, {
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
                finishedAt: new Date().toISOString(),
            });

            return {
                jobId: job.id,
                clipId: savedClip.clipId,
                videoUrl: savedVideoUrl,
                lastFrameUrl,
            };
        }

        const prompt = requirePrompt(request.prompt, request.operation);
        const totalSegments = normalizeRepeatCount(request.repeatCount);
        const autoMergeAfterLoop = request.autoMergeAfterLoop === true && totalSegments > 1;
        const omitVisualInputs = request.visualInputMode === 'text-only';
        let sourceClipId: string | null = null;
        let sourceVideoUrl: string | null = null;
        let referenceImage = omitVisualInputs ? undefined : request.referenceImage;
        const generationMode = 'generate' as const;
        let operationMode: VideoStudioClipMode = request.operation;

        if (request.operation === 'extend' || request.operation === 'edit') {
            const sourceClip = await getOwnedClip({
                userId: params.userId,
                clipId: requireSourceClipId(request.sourceClipId, request.operation),
                projectId: request.projectId,
            });

            sourceClipForContinuity = sourceClip;
            sourceClipId = sourceClip.id;
            sourceVideoUrl = sourceClip.videoUrl;
            referenceImage = omitVisualInputs
                ? undefined
                : await ensureStoredLastFrame({
                      clip: sourceClip,
                      userId: params.userId,
                  });
        } else if (request.operation === 'continue') {
            const sourceClip = await getOwnedClip({
                userId: params.userId,
                clipId: requireSourceClipId(request.sourceClipId, request.operation),
                projectId: request.projectId,
            });

            sourceClipForContinuity = sourceClip;
            sourceClipId = sourceClip.id;
            sourceVideoUrl = sourceClip.videoUrl;
            referenceImage = omitVisualInputs
                ? undefined
                : await ensureStoredLastFrame({
                      clip: sourceClip,
                      userId: params.userId,
                  });
            operationMode = 'continue';
        } else {
            operationMode = 'generate';
        }

        const continuity = resolveContinuityFields(request, sourceClipForContinuity);
        const renderPrompt = buildRenderPrompt({
            prompt,
            projectSynopsis: project.synopsis,
            sourceClipTitle: sourceClipForContinuity?.title || null,
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
        const initialCheckpointKey = `${job.id}:${initialSegmentIndex}`;
        const providerResumeRequiredByCaller = baseJobMetadata.providerResumeRequired === true;
        let providerResumeRequired = providerResumeRequiredByCaller || Boolean(readRecoverableCanvasMetadata(baseJobMetadata)) || (
            hasDeclaredResumableProviderVideo(baseJobMetadata)
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
            const latestGeneratedClip = await getOwnedClip({
                userId: params.userId,
                clipId: generatedClipIds[generatedClipIds.length - 1],
                projectId: request.projectId,
            });
            finalClipId = latestGeneratedClip.id;
            finalVideoUrl = latestGeneratedClip.videoUrl;
            finalFrameUrl = latestGeneratedClip.lastFrameUrl || undefined;
            currentSourceClipId = latestGeneratedClip.id;
            currentSourceVideoUrl = latestGeneratedClip.videoUrl;
            currentReferenceImage = latestGeneratedClip.lastFrameUrl || currentReferenceImage;
        }

        for (let segmentIndex = initialSegmentIndex; segmentIndex < totalSegments; segmentIndex += 1) {
            const isFirstSegment = segmentIndex === 0;
            const segmentMode: 'generate' | 'extend' | 'edit' = isFirstSegment ? generationMode : 'generate';
            const clipMode: VideoStudioClipMode = isFirstSegment ? operationMode : 'continue';
            const takeGroupId =
                request.operation === 'edit' && isFirstSegment && sourceClipForContinuity
                    ? sourceClipForContinuity.takeGroupId || sourceClipForContinuity.id
                    : null;
            const parentTakeClipId = takeGroupId ? currentSourceClipId : null;
            const segmentPrompt = buildLoopSegmentPrompt({
                renderPrompt,
                segmentIndex,
                totalSegments,
            });
            const segmentTitle = buildLoopClipTitle(title, segmentIndex, totalSegments);
            const checkpointKey = `${job.id}:${segmentIndex}`;
            const outputIdentity = buildVideoStudioOutputIdentity({
                jobId: job.id,
                userId: params.userId,
                projectId: request.projectId,
                segmentIndex,
            });
            if (!activeProviderCheckpoint) {
                activeProviderCheckpoint = recoverCompletedCanvasCheckpoint({
                    metadata: baseJobMetadata,
                    checkpointKey,
                    request,
                    requestedResolution: project.resolution,
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

            await updateVideoStudioJob(job.id, {
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
            const storedRenderResult = storedStagingCheckpoint?.jobId === job.id
                && storedStagingCheckpoint.segmentIndex === segmentIndex
                && storedStagingCheckpoint.storagePath === outputIdentity.stagingStoragePath
                ? storedStagingCheckpoint.renderResult
                : readStoredVideoRenderMetadata(baseJobMetadata.renderResult);
            let downloadedVideo = storedRenderResult
                ? await downloadVideoStudioStorageBuffer({
                      userId: params.userId,
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
                    jobId: job.id,
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
                await assertVideoStudioJobCanContinue(job.id);
                const generated = await generateOpenRouterVideo(
                    {
                        prompt: segmentPrompt,
                        provider: 'openrouter',
                        mode: segmentMode,
                        image: omitVisualInputs ? undefined : currentReferenceImage,
                        endImage: !omitVisualInputs && segmentIndex === totalSegments - 1 ? request.endReferenceImage : undefined,
                        referenceImages: omitVisualInputs ? undefined : request.visualReferenceImages,
                        videoUrl: currentSourceVideoUrl || undefined,
                        duration: request.duration,
                        aspectRatio: project.aspectRatio,
                        resolution: project.resolution,
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
                        pollTimeoutMs: NEXT_VIDEO_PROVIDER_POLL_WINDOW_MS,
                        onCheckpoint: async (checkpoint: OpenRouterVideoCheckpoint) => {
                            activeProviderCheckpoint = checkpoint;
                            providerCheckpointForFailure = checkpoint;
                            await updateVideoStudioJob(job.id, {
                                progress: 18 + Math.round((segmentIndex / totalSegments) * 52),
                                message: `OpenRouter에서 장면 ${segmentIndex + 1}/${totalSegments}을 제작 중입니다.`,
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
                    jobId: job.id,
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
                await updateVideoStudioJob(job.id, {
                    progress: 23 + Math.round((segmentIndex / totalSegments) * 58),
                    message: `장면 ${segmentIndex + 1}/${totalSegments} 결과를 품질 검사 전에 안전하게 보관합니다.`,
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
                    userId: params.userId,
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

            await updateVideoStudioJob(job.id, {
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
                    : project.resolution;
            const outputCanvas = getVideoCanvasSize(project.aspectRatio, appliedResolution);
            const sourceQualityInspection = await inspectVideoBufferQuality(downloadedVideo.buffer, {
                expectedDurationSeconds: generatedMetadata.durationApplied,
                durationToleranceSeconds: 1.25,
                expectedAspectRatio: outputCanvas.width / outputCanvas.height,
                requireAudibleAudio: generatedMetadata.audioApplied,
                maxBlackFrameRatio: 0.18,
            });
            const needsCanvasNormalization =
                sourceQualityInspection.width !== outputCanvas.width || sourceQualityInspection.height !== outputCanvas.height;
            const canvasNormalization = {
                applied: sourceQualityInspection.passed && needsCanvasNormalization,
                sourceWidth: sourceQualityInspection.width,
                sourceHeight: sourceQualityInspection.height,
                targetWidth: outputCanvas.width,
                targetHeight: outputCanvas.height,
                strategy: 'cover-crop' as const,
            };
            const videoBufferForStorage =
                sourceQualityInspection.passed && needsCanvasNormalization
                    ? await normalizeVideoBufferToCanvas({
                          buffer: downloadedVideo.buffer,
                          width: outputCanvas.width,
                          height: outputCanvas.height,
                      })
                    : downloadedVideo.buffer;
            lastQualityInspection = sourceQualityInspection.passed
                ? await inspectVideoBufferQuality(videoBufferForStorage, {
                      expectedDurationSeconds: generatedMetadata.durationApplied,
                      durationToleranceSeconds: 1.25,
                      expectedWidth: outputCanvas.width,
                      expectedHeight: outputCanvas.height,
                      dimensionTolerancePixels: PROVIDER_CANVAS_DIMENSION_TOLERANCE_PIXELS,
                      expectedAspectRatio: outputCanvas.width / outputCanvas.height,
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
                await updateVideoStudioJob(job.id, {
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
                requirePassingVideoQuality(lastQualityInspection, 'OpenRouter rendered video');
            }
            const savedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: videoBufferForStorage,
                userId: params.userId,
                projectId: request.projectId,
                pathSuffix: outputIdentity.videoPathSuffix,
                contentType: downloadedVideo.contentType || 'video/mp4',
            });

            await updateVideoStudioJob(job.id, {
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
                userId: params.userId,
                projectId: request.projectId,
                token: outputIdentity.frameToken,
            });

            const savedClip = await createVideoStudioClipRecord({
                clipId: outputIdentity.clipId,
                userId: params.userId,
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
                aspectRatio: project.aspectRatio,
                resolution: project.resolution,
            });

            generatedClipIds.push(savedClip.clipId);
            baseJobMetadata.outputCheckpoints = upsertVideoStudioOutputCheckpoint(
                baseJobMetadata.outputCheckpoints,
                {
                    version: 1,
                    jobId: job.id,
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

            await updateVideoStudioJob(job.id, {
                progress: 24 + Math.round(((segmentIndex + 1) / totalSegments) * 58),
                message: `장면 ${segmentIndex + 1}/${totalSegments} 저장을 완료했습니다.`,
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
                    audioInspection: lastAudioInspection,
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
                    userId: params.userId,
                    projectId: request.projectId,
                    storagePath: outputIdentity.stagingStoragePath,
                });
                pendingStagingCleanupPaths.delete(outputIdentity.stagingStoragePath);
                baseJobMetadata.providerOutputStaging = null;
            } catch (cleanupError) {
                console.error('[VideoStudioServer] failed to clean finalized provider staging:', cleanupError);
            }
            const stagingCleanupPaths = [...pendingStagingCleanupPaths];
            baseJobMetadata.providerOutputStagingCleanup = stagingCleanupPaths.length > 0
                ? {
                      pendingPaths: stagingCleanupPaths,
                      lastAttemptAt: new Date().toISOString(),
                  }
                : null;
            await updateVideoStudioJob(job.id, {
                stagingCleanupPending: stagingCleanupPaths.length > 0,
                stagingCleanupPaths,
                metadata: { ...baseJobMetadata },
            });
        }

        if (autoMergeAfterLoop && generatedClipIds.length > 1) {
            const finalOutputIdentity = buildVideoStudioOutputIdentity({
                jobId: job.id,
                userId: params.userId,
                projectId: request.projectId,
                segmentIndex: 'final',
            });
            await updateVideoStudioJob(job.id, {
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

            const generatedClips = await getOwnedClips({
                userId: params.userId,
                clipIds: generatedClipIds,
                projectId: request.projectId,
            });
            const mergedBuffer = await mergeVideoStudioClips({
                clips: generatedClips,
                aspectRatio: project.aspectRatio,
                resolution: project.resolution,
                fps: 30,
            });
            const finalCanvas = getVideoCanvasSize(project.aspectRatio, project.resolution);
            const expectedMergedDuration = generatedClips.reduce((sum, clip) => sum + Math.max(0, clip.duration || 0), 0);
            finalQualityInspection = await inspectVideoBufferQuality(mergedBuffer, {
                expectedDurationSeconds: expectedMergedDuration > 0 ? expectedMergedDuration : undefined,
                durationToleranceSeconds: Math.max(1.5, generatedClips.length * 0.35),
                expectedWidth: finalCanvas.width,
                expectedHeight: finalCanvas.height,
                expectedAspectRatio: finalCanvas.width / finalCanvas.height,
                requireAudibleAudio: lastRenderResult?.audioApplied === true,
                maxBlackFrameRatio: 0.2,
            });
            requirePassingVideoQuality(finalQualityInspection, 'Auto-merged final video');

            const mergedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: mergedBuffer,
                userId: params.userId,
                projectId: request.projectId,
                pathSuffix: finalOutputIdentity.videoPathSuffix,
                contentType: 'video/mp4',
            });
            const mergedFrameUrl = await extractAndStoreLastFrame({
                videoUrl: mergedVideoUrl,
                userId: params.userId,
                projectId: request.projectId,
                token: finalOutputIdentity.frameToken,
            });

            const mergedClip = await createVideoStudioClipRecord({
                clipId: finalOutputIdentity.clipId,
                userId: params.userId,
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
                aspectRatio: project.aspectRatio,
                resolution: project.resolution,
            });

            finalClipId = mergedClip.clipId;
            finalVideoUrl = mergedVideoUrl;
            finalFrameUrl = mergedFrameUrl;
            baseJobMetadata.outputCheckpoints = upsertVideoStudioOutputCheckpoint(
                baseJobMetadata.outputCheckpoints,
                {
                    version: 1,
                    jobId: job.id,
                    slot: finalOutputIdentity.slot,
                    segmentIndex: null,
                    clipId: mergedClip.clipId,
                    videoStoragePath: finalOutputIdentity.videoStoragePath,
                    frameStoragePath: finalOutputIdentity.frameStoragePath,
                    savedAt: new Date().toISOString(),
                },
            );
        }

        await updateVideoStudioJob(job.id, {
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
            finishedAt: new Date().toISOString(),
        });

        return {
            jobId: job.id,
            clipId: finalClipId,
            videoUrl: finalVideoUrl,
            lastFrameUrl: finalFrameUrl,
        };
    } catch (error) {
        if (
            error instanceof VideoStudioJobCanceledError
            || await finalizeVideoStudioJobCancellationIfRequested(job.id)
        ) {
            return { jobId: job.id, canceled: true };
        }
        if (error instanceof OpenRouterVideoPendingError) {
            await updateVideoStudioJob(job.id, {
                status: 'queued',
                progress: 18,
                message: 'OpenRouter에서 영상을 계속 제작 중입니다. 같은 작업을 자동으로 이어서 확인합니다.',
                errorMessage: null,
                finishedAt: null,
            });
            return {
                jobId: job.id,
                pending: true,
            };
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
        const rawMessage = providerOutputUnavailable
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
        const hint = deriveVideoInfraHint(resolvedProviderFailureMessage);
        const hintMessage = error instanceof VideoStudioServerError ? resolvedProviderFailureMessage : hint.message;
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

        await updateVideoStudioJob(job.id, {
            status: 'failed',
            progress: 100,
            message: hintMessage,
            errorMessage: privacyBlocked ? hintMessage : resolvedProviderFailureMessage,
            stagingCleanupPending: failedStagingCleanupPaths.length > 0,
            stagingCleanupPaths: failedStagingCleanupPaths,
            metadata: { ...baseJobMetadata },
            finishedAt: new Date().toISOString(),
        }).catch((updateError) => {
            console.error('[Video Studio Job Executor] failed to update job status:', updateError);
        });

        throw error;
    }
}
