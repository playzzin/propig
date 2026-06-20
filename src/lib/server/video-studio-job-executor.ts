import { deriveVideoInfraHint, generateGrokVideo } from '@/lib/server/video-generation';
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
    uploadRemoteFileToVideoStudioStorage,
    mergeVideoStudioClips,
} from '@/lib/server/video-studio-admin';
import {
    VideoStudioJobRequest,
    VideoStudioJobRequestSchema,
} from '@/lib/video-studio-job-request';

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
            });

            await updateVideoStudioJob(job.id, {
                status: 'uploading',
                progress: 72,
                message: 'Uploading merged clip and extracting its continuity frame.',
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
        let generationMode: 'generate' | 'extend' | 'edit' = 'generate';
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
            generationMode = request.operation;
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
            generationMode = 'generate';
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
                    ? sourceClipForContinuity.takeGroupId || sourceClipForContinuity.id
                    : null;
            const parentTakeClipId = takeGroupId ? currentSourceClipId : null;
            const segmentPrompt = buildLoopSegmentPrompt({
                renderPrompt,
                segmentIndex,
                totalSegments,
            });
            const segmentTitle = buildLoopClipTitle(title, segmentIndex, totalSegments);

            await updateVideoStudioJob(job.id, {
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
                provider: 'grok',
                mode: segmentMode,
                image: currentReferenceImage,
                videoUrl: currentSourceVideoUrl || undefined,
                duration: request.duration,
                aspectRatio: project.aspectRatio,
                resolution: project.resolution,
            });

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
                userId: params.userId,
                projectId: request.projectId,
                pathSuffix: `clips/${token}.mp4`,
                fallbackContentType: 'video/mp4',
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
                duration: request.duration ?? null,
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
