import {
    OpenRouterVideoPendingError,
    deriveVideoInfraHint,
    downloadOpenRouterVideo,
    generateOpenRouterVideo,
    readOpenRouterVideoCheckpoint,
    type OpenRouterVideoCheckpoint,
} from '@/lib/server/video-generation';
import type { VideoStudioClipMode, VideoStudioJob } from '@/lib/video-studio';
import {
    VideoStudioServerError,
    claimVideoStudioJobForProcessing,
    createVideoStudioClipRecord,
    ensureStoredLastFrame,
    extractAndStoreLastFrame,
    getOwnedClip,
    getOwnedClips,
    getOwnedProject,
    updateVideoStudioJob,
    uploadBufferToVideoStudioStorage,
    mergeVideoStudioClips,
} from '@/lib/server/video-studio-admin';
import {
    VideoStudioJobRequest,
    VideoStudioJobRequestSchema,
} from '@/lib/video-studio-job-request';
import {
    getVideoCanvasSize,
    inspectVideoBufferQuality,
    type VideoAudioInspection,
    type VideoQualityInspection,
} from '@/lib/server/ffmpeg';

const NEXT_VIDEO_PROVIDER_POLL_WINDOW_MS = 75 * 1000;

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

function requirePassingVideoQuality(
    inspection: VideoQualityInspection,
    context: string,
): void {
    if (inspection.passed) return;
    const details = inspection.issues
        .slice(0, 3)
        .map((issue) => issue.message)
        .join(' ');
    throw new VideoStudioServerError(
        422,
        `${context} quality validation failed. ${details}`.trim(),
    );
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

function readRequestFromJob(job: VideoStudioJob): VideoStudioJobRequest {
    const request = job.metadata && typeof job.metadata === 'object'
        ? (job.metadata.request as unknown)
        : null;

    const parsed = VideoStudioJobRequestSchema.safeParse(request);
    if (!parsed.success) {
        throw new VideoStudioServerError(400, 'The queued job payload is invalid.');
    }

    return parsed.data;
}

export async function executeQueuedVideoStudioJob(params: {
    jobId: string;
    userId: string;
}): Promise<{
    jobId: string;
    clipId?: string;
    videoUrl?: string;
    lastFrameUrl?: string;
    pending?: boolean;
}> {
    const job = await claimVideoStudioJobForProcessing({
        jobId: params.jobId,
        userId: params.userId,
    });

    try {
        const request = readRequestFromJob(job);
        const project = await getOwnedProject(params.userId, request.projectId);
        const title = job.title;
        const baseJobMetadata =
            job.metadata && typeof job.metadata === 'object'
                ? job.metadata
                : {};
        let sourceClipForContinuity:
            | Awaited<ReturnType<typeof getOwnedClip>>
            | null = null;

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
            const mergeCanvas = getVideoCanvasSize(
                project.aspectRatio,
                project.resolution,
            );
            const finalQualityInspection = await inspectVideoBufferQuality(
                mergedBuffer,
                {
                    expectedWidth: mergeCanvas.width,
                    expectedHeight: mergeCanvas.height,
                    expectedAspectRatio: mergeCanvas.width / mergeCanvas.height,
                    requireAudibleAudio: Boolean(request.backgroundMusicUrl),
                    maxBlackFrameRatio: 0.2,
                },
            );
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

            const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
            const savedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: mergedBuffer,
                userId: params.userId,
                projectId: request.projectId,
                pathSuffix: `clips/${token}.mp4`,
                contentType: 'video/mp4',
            });
            const lastFrameUrl = await extractAndStoreLastFrame({
                videoUrl: savedVideoUrl,
                userId: params.userId,
                projectId: request.projectId,
                token,
            });

            const savedClip = await createVideoStudioClipRecord({
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
                duration: null,
                aspectRatio: project.aspectRatio,
                resolution: project.resolution,
            });

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
        let sourceClipId: string | null = null;
        let sourceVideoUrl: string | null = null;
        let referenceImage = request.referenceImage;
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
            referenceImage = await ensureStoredLastFrame({
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
            referenceImage = await ensureStoredLastFrame({
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
            ? baseJobMetadata.generatedClipIds.filter(
                (clipId): clipId is string => typeof clipId === 'string' && clipId.length > 0,
            )
            : [];
        const generatedClipIds = [...storedGeneratedClipIds];
        let finalClipId: string | undefined;
        let finalVideoUrl: string | undefined;
        let finalFrameUrl: string | undefined;
        let currentSourceClipId = sourceClipId;
        let currentSourceVideoUrl = sourceVideoUrl;
        let currentReferenceImage = referenceImage;
        let lastRenderResult: Awaited<ReturnType<typeof generateOpenRouterVideo>>['metadata'] | null = null;
        let lastAudioInspection: VideoAudioInspection | null = null;
        let lastQualityInspection: VideoQualityInspection | null = null;
        let finalQualityInspection: VideoQualityInspection | null = null;
        let activeProviderCheckpoint = readOpenRouterVideoCheckpoint(baseJobMetadata.providerVideo);

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

        for (
            let segmentIndex = Math.min(generatedClipIds.length, totalSegments);
            segmentIndex < totalSegments;
            segmentIndex += 1
        ) {
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
            const resumeCheckpoint =
                activeProviderCheckpoint?.checkpointKey === checkpointKey
                    ? activeProviderCheckpoint
                    : null;

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

            const generated = await generateOpenRouterVideo(
                {
                    prompt: segmentPrompt,
                    provider: 'openrouter',
                    mode: segmentMode,
                    image: currentReferenceImage,
                    endImage: segmentIndex === totalSegments - 1 ? request.endReferenceImage : undefined,
                    referenceImages: request.visualReferenceImages,
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
                    pollTimeoutMs: NEXT_VIDEO_PROVIDER_POLL_WINDOW_MS,
                    onCheckpoint: async (checkpoint: OpenRouterVideoCheckpoint) => {
                        activeProviderCheckpoint = checkpoint;
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
            lastRenderResult = generated.metadata;

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
                    renderResult: generated.metadata,
                    providerVideo: activeProviderCheckpoint,
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
            const downloadedVideo = await downloadOpenRouterVideo(generated.videoUrl);
            const appliedResolution =
                generated.metadata.resolvedResolution === '480p'
                || generated.metadata.resolvedResolution === '720p'
                || generated.metadata.resolvedResolution === '1080p'
                    ? generated.metadata.resolvedResolution
                    : project.resolution;
            const outputCanvas = getVideoCanvasSize(
                project.aspectRatio,
                appliedResolution,
            );
            lastQualityInspection = await inspectVideoBufferQuality(
                downloadedVideo.buffer,
                {
                    expectedDurationSeconds: generated.metadata.durationApplied,
                    durationToleranceSeconds: 1.25,
                    expectedWidth: outputCanvas.width,
                    expectedHeight: outputCanvas.height,
                    expectedAspectRatio: outputCanvas.width / outputCanvas.height,
                    requireAudibleAudio: generated.metadata.audioApplied,
                    maxBlackFrameRatio: 0.18,
                },
            );
            lastAudioInspection = lastQualityInspection.audio;
            if (!lastQualityInspection.passed) {
                const discardReason =
                    lastQualityInspection.issues[0]?.code || 'quality_validation_failed';
                await updateVideoStudioJob(job.id, {
                    metadata: {
                        ...baseJobMetadata,
                        repeatCount: totalSegments,
                        autoMergeAfterLoop,
                        resolvedPrompt: renderPrompt,
                        lastSegmentPrompt: segmentPrompt,
                        continuity,
                        renderResult: generated.metadata,
                        providerVideo: null,
                        providerVideoDiscarded: {
                            reason: discardReason,
                            providerJobId: activeProviderCheckpoint?.jobId || null,
                            modelId: generated.metadata.modelUsed,
                            discardedAt: new Date().toISOString(),
                        },
                        audioInspection: lastAudioInspection,
                        qualityInspection: lastQualityInspection,
                        generatedClipIds,
                    },
                });
                requirePassingVideoQuality(
                    lastQualityInspection,
                    'OpenRouter rendered video',
                );
            }
            const savedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: downloadedVideo.buffer,
                userId: params.userId,
                projectId: request.projectId,
                pathSuffix: `clips/${token}.mp4`,
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
                    renderResult: generated.metadata,
                    providerVideo: activeProviderCheckpoint,
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
                token,
            });

            const savedClip = await createVideoStudioClipRecord({
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
                duration: generated.metadata.durationApplied,
                aspectRatio: project.aspectRatio,
                resolution: project.resolution,
            });

            generatedClipIds.push(savedClip.clipId);
            finalClipId = savedClip.clipId;
            finalVideoUrl = savedVideoUrl;
            finalFrameUrl = lastFrameUrl;
            currentSourceClipId = savedClip.clipId;
            currentSourceVideoUrl = savedVideoUrl;
            currentReferenceImage = lastFrameUrl;

            await updateVideoStudioJob(job.id, {
                progress: 24 + Math.round(((segmentIndex + 1) / totalSegments) * 58),
                message: `장면 ${segmentIndex + 1}/${totalSegments} 저장을 완료했습니다.`,
                metadata: {
                    ...baseJobMetadata,
                    repeatCount: totalSegments,
                    autoMergeAfterLoop,
                    resolvedPrompt: renderPrompt,
                    continuity,
                    renderResult: generated.metadata,
                    audioInspection: lastAudioInspection,
                    qualityInspection: lastQualityInspection,
                    providerVideo: activeProviderCheckpoint,
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
        }

        if (autoMergeAfterLoop && generatedClipIds.length > 1) {
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
            const finalCanvas = getVideoCanvasSize(
                project.aspectRatio,
                project.resolution,
            );
            const expectedMergedDuration = generatedClips.reduce(
                (sum, clip) => sum + Math.max(0, clip.duration || 0),
                0,
            );
            finalQualityInspection = await inspectVideoBufferQuality(
                mergedBuffer,
                {
                    expectedDurationSeconds:
                        expectedMergedDuration > 0 ? expectedMergedDuration : undefined,
                    durationToleranceSeconds: Math.max(1.5, generatedClips.length * 0.35),
                    expectedWidth: finalCanvas.width,
                    expectedHeight: finalCanvas.height,
                    expectedAspectRatio: finalCanvas.width / finalCanvas.height,
                    requireAudibleAudio: lastRenderResult?.audioApplied === true,
                    maxBlackFrameRatio: 0.2,
                },
            );
            requirePassingVideoQuality(
                finalQualityInspection,
                'Auto-merged final video',
            );

            const mergeToken = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
            const mergedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: mergedBuffer,
                userId: params.userId,
                projectId: request.projectId,
                pathSuffix: `clips/${mergeToken}.mp4`,
                contentType: 'video/mp4',
            });
            const mergedFrameUrl = await extractAndStoreLastFrame({
                videoUrl: mergedVideoUrl,
                userId: params.userId,
                projectId: request.projectId,
                token: mergeToken,
            });

            const mergedClip = await createVideoStudioClipRecord({
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
                duration: null,
                aspectRatio: project.aspectRatio,
                resolution: project.resolution,
            });

            finalClipId = mergedClip.clipId;
            finalVideoUrl = mergedVideoUrl;
            finalFrameUrl = mergedFrameUrl;
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
            metadata: {
                ...baseJobMetadata,
                repeatCount: totalSegments,
                autoMergeAfterLoop,
                resolvedPrompt: renderPrompt,
                continuity,
                generatedClipIds,
                providerVideo: activeProviderCheckpoint,
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
                    currentClipTitle: autoMergeAfterLoop && generatedClipIds.length > 1
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

        const rawMessage = error instanceof Error ? error.message : 'Video studio job failed.';
        const hintMessage =
            error instanceof VideoStudioServerError
                ? rawMessage
                : deriveVideoInfraHint(rawMessage).message;

        await updateVideoStudioJob(job.id, {
            status: 'failed',
            progress: 100,
            message: hintMessage,
            errorMessage: rawMessage,
            finishedAt: new Date().toISOString(),
        }).catch((updateError) => {
            console.error('[Video Studio Job Executor] failed to update job status:', updateError);
        });

        throw error;
    }
}
