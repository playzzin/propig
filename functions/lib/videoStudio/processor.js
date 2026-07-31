"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoStudioWorkerError = void 0;
exports.processQueuedVideoStudioJob = processQueuedVideoStudioJob;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const openrouter_1 = require("./openrouter");
const ffmpeg_1 = require("./ffmpeg");
const request_1 = require("./request");
const firestore_1 = require("../firestore");
const FUNCTION_VIDEO_PROVIDER_POLL_WINDOW_MS = 4 * 60 * 1000;
if (!admin.apps.length) {
    admin.initializeApp();
}
class VideoStudioWorkerError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.VideoStudioWorkerError = VideoStudioWorkerError;
function normalizeOptionalStudioText(value) {
    const trimmed = value === null || value === void 0 ? void 0 : value.trim();
    return trimmed ? trimmed : null;
}
function resolveContinuityField(params) {
    if (params.requestHasValue) {
        return normalizeOptionalStudioText(params.requestValue);
    }
    return normalizeOptionalStudioText(params.sourceValue);
}
function resolveContinuityFields(request, sourceClip) {
    return {
        continuityNotes: resolveContinuityField({
            requestValue: request.continuityNotes,
            requestHasValue: Object.prototype.hasOwnProperty.call(request, 'continuityNotes'),
            sourceValue: sourceClip === null || sourceClip === void 0 ? void 0 : sourceClip.continuityNotes,
        }),
        cameraNotes: resolveContinuityField({
            requestValue: request.cameraNotes,
            requestHasValue: Object.prototype.hasOwnProperty.call(request, 'cameraNotes'),
            sourceValue: sourceClip === null || sourceClip === void 0 ? void 0 : sourceClip.cameraNotes,
        }),
        subjectLock: resolveContinuityField({
            requestValue: request.subjectLock,
            requestHasValue: Object.prototype.hasOwnProperty.call(request, 'subjectLock'),
            sourceValue: sourceClip === null || sourceClip === void 0 ? void 0 : sourceClip.subjectLock,
        }),
    };
}
function buildRenderPrompt(params) {
    var _a;
    const prompt = params.prompt.trim();
    const context = [];
    const projectSynopsis = normalizeOptionalStudioText(params.projectSynopsis);
    if (projectSynopsis) {
        context.push(`Project brief: ${projectSynopsis}`);
    }
    if ((_a = params.sourceClipTitle) === null || _a === void 0 ? void 0 : _a.trim()) {
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
function buildFirebaseStorageDownloadUrl(params) {
    const encodedPath = encodeURIComponent(params.path);
    const encodedToken = encodeURIComponent(params.downloadToken);
    return `https://firebasestorage.googleapis.com/v0/b/${params.bucketName}/o/${encodedPath}?alt=media&token=${encodedToken}`;
}
async function uploadBufferToVideoStudioStorage(params) {
    const bucket = getStorageBucket();
    const file = bucket.file(`video_studio/${params.userId}/${params.projectId}/${params.pathSuffix}`);
    const downloadToken = (0, node_crypto_1.randomUUID)();
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
async function updateJob(jobId, data) {
    const terminal = data.status === 'completed'
        || data.status === 'failed'
        || data.status === 'canceled';
    await firestore_1.db.collection('video_studio_jobs').doc(jobId).update(Object.assign(Object.assign({}, data), { heartbeatAt: admin.firestore.FieldValue.serverTimestamp(), leaseExpiresAt: terminal
            ? null
            : admin.firestore.Timestamp.fromMillis(Date.now() + 12 * 60 * 1000), updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
}
function timestampMillis(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (value instanceof Date)
        return value.getTime();
    if (!value || typeof value !== 'object')
        return null;
    const candidate = value;
    if (typeof candidate.toMillis === 'function') {
        const millis = candidate.toMillis();
        return Number.isFinite(millis) ? millis : null;
    }
    return typeof candidate.seconds === 'number' && Number.isFinite(candidate.seconds)
        ? candidate.seconds * 1000
        : null;
}
function isTransientVideoStudioError(error) {
    if ((0, openrouter_1.isOpenRouterInputImagePrivacyError)(error))
        return false;
    if (error instanceof VideoStudioWorkerError) {
        return error.status === 429 || error.status >= 500;
    }
    const message = error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();
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
function hasResumableProviderVideo(metadata) {
    if (!metadata || typeof metadata !== 'object')
        return false;
    const checkpoint = metadata.providerVideo;
    if (!checkpoint || typeof checkpoint !== 'object')
        return false;
    const candidate = checkpoint;
    return typeof candidate.jobId === 'string'
        && candidate.jobId.length > 0
        && (candidate.status === 'pending'
            || candidate.status === 'in_progress'
            || candidate.status === 'completed');
}
async function claimJob(jobId) {
    const jobRef = firestore_1.db.collection('video_studio_jobs').doc(jobId);
    return firestore_1.db.runTransaction(async (transaction) => {
        var _a;
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) {
            throw new VideoStudioWorkerError(404, 'The selected job no longer exists.');
        }
        const job = snapshot.data();
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
        const currentAttempt = Number((_a = job.attemptCount) !== null && _a !== void 0 ? _a : 0);
        const nextAttempt = hasResumableProviderVideo(job.metadata)
            ? Math.max(1, currentAttempt)
            : currentAttempt + 1;
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
            data: Object.assign(Object.assign({}, job), { status: 'running', progress: 8, message: 'Preparing project assets on the worker.', attemptCount: nextAttempt }),
        };
    });
}
async function getProject(projectId, userId) {
    const snapshot = await firestore_1.db.collection('video_studio_projects').doc(projectId).get();
    if (!snapshot.exists) {
        throw new VideoStudioWorkerError(404, 'The selected project no longer exists.');
    }
    const project = snapshot.data();
    if (project.userId !== userId) {
        throw new VideoStudioWorkerError(403, 'You do not have access to this project.');
    }
    return {
        id: snapshot.id,
        data: project,
    };
}
async function getClip(clipId, userId, projectId) {
    const snapshot = await firestore_1.db.collection('video_studio_clips').doc(clipId).get();
    if (!snapshot.exists) {
        throw new VideoStudioWorkerError(404, 'The selected clip no longer exists.');
    }
    const clip = snapshot.data();
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
async function getClips(clipIds, userId, projectId) {
    return Promise.all(clipIds.map((clipId) => getClip(clipId, userId, projectId)));
}
async function extractAndStoreLastFrame(params) {
    const frameBuffer = await (0, ffmpeg_1.extractVideoFrame)({
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
async function ensureStoredLastFrame(params) {
    var _a, _b;
    if (params.clip.lastFrameUrl) {
        return params.clip.lastFrameUrl;
    }
    const token = ((_b = (_a = globalThis.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID) === null || _b === void 0 ? void 0 : _b.call(_a)) || `${Date.now()}`;
    const lastFrameUrl = await extractAndStoreLastFrame({
        videoUrl: params.clip.videoUrl,
        userId: params.userId,
        projectId: params.clip.projectId,
        token,
    });
    await firestore_1.db.collection('video_studio_clips').doc(params.clipId).update({
        lastFrameUrl,
        posterUrl: lastFrameUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return lastFrameUrl;
}
async function createClipRecord(params) {
    const projectRef = firestore_1.db.collection('video_studio_projects').doc(params.projectId);
    const clipRef = firestore_1.db.collection('video_studio_clips').doc();
    return firestore_1.db.runTransaction(async (transaction) => {
        var _a, _b;
        const clipsQuery = firestore_1.db.collection('video_studio_clips').where('projectId', '==', params.projectId);
        const [projectDoc, clipDocs] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(clipsQuery),
        ]);
        if (!projectDoc.exists) {
            throw new VideoStudioWorkerError(404, 'The selected project no longer exists.');
        }
        const project = projectDoc.data();
        if (project.userId !== params.userId) {
            throw new VideoStudioWorkerError(403, 'You do not have permission to add clips to this project.');
        }
        let highest = -1;
        clipDocs.docs.forEach((doc) => {
            var _a;
            const sequence = Number((_a = doc.data().sequence) !== null && _a !== void 0 ? _a : -1);
            if (Number.isFinite(sequence) && sequence > highest) {
                highest = sequence;
            }
        });
        const nextSequence = highest + 1;
        const normalizedTakeGroupId = params.takeGroupId || null;
        let resolvedTakeIndex = (_a = params.takeIndex) !== null && _a !== void 0 ? _a : null;
        if (normalizedTakeGroupId && !resolvedTakeIndex) {
            let highestTakeIndex = 1;
            clipDocs.docs.forEach((doc) => {
                var _a;
                const clip = doc.data();
                if (doc.id === normalizedTakeGroupId) {
                    highestTakeIndex = Math.max(highestTakeIndex, 1);
                    return;
                }
                if (clip.takeGroupId === normalizedTakeGroupId) {
                    const clipTakeIndex = Number((_a = clip.takeIndex) !== null && _a !== void 0 ? _a : 1);
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
            duration: (_b = params.duration) !== null && _b !== void 0 ? _b : null,
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
function requirePrompt(prompt, operation) {
    if (!(prompt === null || prompt === void 0 ? void 0 : prompt.trim())) {
        throw new VideoStudioWorkerError(400, `A prompt is required for "${operation}".`);
    }
    return prompt.trim();
}
function requireSourceClipId(sourceClipId, operation) {
    if (!sourceClipId) {
        throw new VideoStudioWorkerError(400, `sourceClipId is required for "${operation}".`);
    }
    return sourceClipId;
}
function requireMergeClipIds(mergeClipIds) {
    if (!mergeClipIds || mergeClipIds.length === 0) {
        throw new VideoStudioWorkerError(400, 'Select one or more clips to merge.');
    }
    return mergeClipIds;
}
function normalizeRepeatCount(repeatCount) {
    return Math.max(1, Math.min(repeatCount !== null && repeatCount !== void 0 ? repeatCount : 1, 12));
}
function requirePassingVideoQuality(inspection, context) {
    if (inspection.passed)
        return;
    const details = inspection.issues
        .slice(0, 3)
        .map((issue) => issue.message)
        .join(' ');
    throw new VideoStudioWorkerError(422, `${context} quality validation failed. ${details}`.trim());
}
function buildLoopClipTitle(baseTitle, segmentIndex, totalSegments) {
    if (totalSegments <= 1) {
        return baseTitle;
    }
    return `${baseTitle} ${segmentIndex + 1}/${totalSegments}`;
}
function buildLoopSegmentPrompt(params) {
    if (params.totalSegments <= 1) {
        return params.renderPrompt;
    }
    const guidance = params.segmentIndex === 0
        ? `This is segment 1 of ${params.totalSegments}. Establish the opening shot clearly from the provided starting point.`
        : `This is segment ${params.segmentIndex + 1} of ${params.totalSegments}. Continue naturally from the previous segment's final frame and preserve scene continuity.`;
    return `${params.renderPrompt}\n\nSequence guidance:\n- ${guidance}`;
}
function buildLoopProgress(params) {
    var _a;
    return {
        totalSegments: params.totalSegments,
        currentSegment: Math.min(params.segmentIndex + 1, params.totalSegments),
        completedSegments: Math.max(0, Math.min(params.completedSegments, params.totalSegments)),
        phase: params.phase,
        autoMergeAfterLoop: params.autoMergeAfterLoop,
        currentClipTitle: (_a = params.currentClipTitle) !== null && _a !== void 0 ? _a : null,
        generatedClipIds: [...params.generatedClipIds],
    };
}
function readRequest(job) {
    const request = job.metadata && typeof job.metadata === 'object'
        ? job.metadata.request
        : null;
    const parsed = request_1.videoStudioJobRequestSchema.safeParse(request);
    if (!parsed.success) {
        throw new VideoStudioWorkerError(400, 'The queued job payload is invalid.');
    }
    return parsed.data;
}
async function processQueuedVideoStudioJob(jobId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const claimed = await claimJob(jobId);
    const baseJobMetadata = claimed.data.metadata && typeof claimed.data.metadata === 'object'
        ? claimed.data.metadata
        : {};
    let request = null;
    try {
        request = readRequest(claimed.data);
        const project = await getProject(request.projectId, claimed.data.userId);
        const title = claimed.data.title;
        let sourceClipForContinuity = null;
        if (request.operation === 'extract-frame') {
            const clip = await getClip(requireSourceClipId(request.sourceClipId, request.operation), claimed.data.userId, request.projectId);
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
            await updateJob(jobId, {
                progress: 28,
                message: 'Downloading and normalizing selected clips for FFmpeg.',
            });
            const mergedBuffer = await (0, ffmpeg_1.mergeVideos)({
                clips: clips.map((clip) => (Object.assign({ url: clip.data.videoUrl }, editsByClipId.get(clip.id)))),
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
                fps: 30,
                backgroundMusicUrl: request.backgroundMusicUrl,
                audioMixPreset: request.audioMixPreset,
                backgroundMusicVolume: request.backgroundMusicVolume,
                sceneAudioVolume: request.sceneAudioVolume,
                audioCrossfadeSeconds: request.audioCrossfadeSeconds,
            });
            const mergeCanvas = (0, ffmpeg_1.getVideoCanvasSize)(project.data.aspectRatio, project.data.resolution);
            const finalQualityInspection = await (0, ffmpeg_1.inspectVideoBufferQuality)(mergedBuffer, {
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
                metadata: Object.assign(Object.assign({}, baseJobMetadata), { mergeSourceClipIds,
                    finalQualityInspection }),
            });
            const token = ((_b = (_a = globalThis.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID) === null || _b === void 0 ? void 0 : _b.call(_a)) || `${Date.now()}`;
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
                prompt: ((_c = request.prompt) === null || _c === void 0 ? void 0 : _c.trim()) || `Merged sequence from ${clips.length} clips`,
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
                metadata: Object.assign(Object.assign({}, baseJobMetadata), { mergeSourceClipIds,
                    finalQualityInspection }),
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return;
        }
        const prompt = requirePrompt(request.prompt, request.operation);
        const totalSegments = normalizeRepeatCount(request.repeatCount);
        const autoMergeAfterLoop = request.autoMergeAfterLoop === true && totalSegments > 1;
        const omitVisualInputs = request.visualInputMode === 'text-only';
        let sourceClipId = null;
        let sourceVideoUrl = null;
        let referenceImage = omitVisualInputs ? undefined : request.referenceImage;
        const generationMode = 'generate';
        let operationMode = request.operation === 'generate' ? 'generate' : 'continue';
        if (request.operation === 'extend' || request.operation === 'edit') {
            const sourceClip = await getClip(requireSourceClipId(request.sourceClipId, request.operation), claimed.data.userId, request.projectId);
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
        }
        else if (request.operation === 'continue') {
            const sourceClip = await getClip(requireSourceClipId(request.sourceClipId, request.operation), claimed.data.userId, request.projectId);
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
        }
        else {
            operationMode = 'generate';
        }
        const continuity = resolveContinuityFields(request, sourceClipForContinuity === null || sourceClipForContinuity === void 0 ? void 0 : sourceClipForContinuity.data);
        const renderPrompt = buildRenderPrompt({
            prompt,
            projectSynopsis: project.data.synopsis,
            sourceClipTitle: (sourceClipForContinuity === null || sourceClipForContinuity === void 0 ? void 0 : sourceClipForContinuity.data.title) || null,
            continuityNotes: continuity.continuityNotes,
            cameraNotes: continuity.cameraNotes,
            subjectLock: continuity.subjectLock,
        });
        const storedGeneratedClipIds = Array.isArray(baseJobMetadata.generatedClipIds)
            ? baseJobMetadata.generatedClipIds.filter((clipId) => typeof clipId === 'string' && clipId.length > 0)
            : [];
        const generatedClipIds = [...storedGeneratedClipIds];
        let finalClipId;
        let finalVideoUrl;
        let finalFrameUrl;
        let currentSourceClipId = sourceClipId;
        let currentSourceVideoUrl = sourceVideoUrl;
        let currentReferenceImage = referenceImage;
        let lastRenderResult = null;
        let lastAudioInspection = null;
        let lastQualityInspection = null;
        let finalQualityInspection = null;
        let activeProviderCheckpoint = (0, openrouter_1.readOpenRouterVideoCheckpoint)(baseJobMetadata.providerVideo);
        if (generatedClipIds.length > 0) {
            const latestGeneratedClip = await getClip(generatedClipIds[generatedClipIds.length - 1], claimed.data.userId, request.projectId);
            finalClipId = latestGeneratedClip.id;
            finalVideoUrl = latestGeneratedClip.data.videoUrl;
            finalFrameUrl = latestGeneratedClip.data.lastFrameUrl || undefined;
            currentSourceClipId = latestGeneratedClip.id;
            currentSourceVideoUrl = latestGeneratedClip.data.videoUrl;
            currentReferenceImage = latestGeneratedClip.data.lastFrameUrl || currentReferenceImage;
        }
        for (let segmentIndex = Math.min(generatedClipIds.length, totalSegments); segmentIndex < totalSegments; segmentIndex += 1) {
            const isFirstSegment = segmentIndex === 0;
            const segmentMode = isFirstSegment ? generationMode : 'generate';
            const clipMode = isFirstSegment ? operationMode : 'continue';
            const takeGroupId = request.operation === 'edit' && isFirstSegment && sourceClipForContinuity
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
            const resumeCheckpoint = (activeProviderCheckpoint === null || activeProviderCheckpoint === void 0 ? void 0 : activeProviderCheckpoint.checkpointKey) === checkpointKey
                ? activeProviderCheckpoint
                : null;
            await updateJob(jobId, {
                progress: 12 + Math.round((segmentIndex / totalSegments) * 58),
                message: totalSegments > 1
                    ? `Rendering segment ${segmentIndex + 1}/${totalSegments} with OpenRouter.`
                    : request.operation === 'continue'
                        ? 'Submitting the continuation render to OpenRouter.'
                        : `Submitting ${request.operation} render to OpenRouter.`,
                metadata: Object.assign(Object.assign({}, baseJobMetadata), { repeatCount: totalSegments, autoMergeAfterLoop,
                    continuity,
                    generatedClipIds, providerVideo: resumeCheckpoint, loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex,
                        completedSegments: generatedClipIds.length,
                        phase: 'rendering',
                        autoMergeAfterLoop,
                        currentClipTitle: segmentTitle,
                        generatedClipIds,
                    }) }),
            });
            const generated = await (0, openrouter_1.generateOpenRouterVideo)({
                prompt: segmentPrompt,
                mode: segmentMode,
                image: omitVisualInputs ? undefined : currentReferenceImage,
                endImage: !omitVisualInputs && segmentIndex === totalSegments - 1
                    ? request.endReferenceImage
                    : undefined,
                referenceImages: omitVisualInputs ? undefined : request.visualReferenceImages,
                videoUrl: currentSourceVideoUrl || undefined,
                duration: request.duration,
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
                qualityMode: request.qualityMode,
                generateAudio: request.generateAudio,
                audioMode: request.audioMode,
                dialogue: request.dialogue,
            }, {
                checkpointKey,
                resumeCheckpoint,
                pollTimeoutMs: FUNCTION_VIDEO_PROVIDER_POLL_WINDOW_MS,
                onCheckpoint: async (checkpoint) => {
                    activeProviderCheckpoint = checkpoint;
                    await updateJob(jobId, {
                        progress: 18 + Math.round((segmentIndex / totalSegments) * 52),
                        message: `OpenRouter is rendering scene ${segmentIndex + 1}/${totalSegments}.`,
                        metadata: Object.assign(Object.assign({}, baseJobMetadata), { repeatCount: totalSegments, autoMergeAfterLoop,
                            continuity,
                            generatedClipIds, providerVideo: checkpoint, loopProgress: buildLoopProgress({
                                totalSegments,
                                segmentIndex,
                                completedSegments: generatedClipIds.length,
                                phase: 'rendering',
                                autoMergeAfterLoop,
                                currentClipTitle: segmentTitle,
                                generatedClipIds,
                            }) }),
                    });
                },
            });
            lastRenderResult = generated.metadata;
            await updateJob(jobId, {
                status: 'uploading',
                progress: 24 + Math.round(((segmentIndex + 0.45) / totalSegments) * 58),
                message: totalSegments > 1
                    ? `Uploading segment ${segmentIndex + 1}/${totalSegments} to studio storage.`
                    : 'Uploading the rendered clip to studio storage.',
                metadata: Object.assign(Object.assign({}, baseJobMetadata), { repeatCount: totalSegments, autoMergeAfterLoop, resolvedPrompt: renderPrompt, lastSegmentPrompt: segmentPrompt, continuity, renderResult: generated.metadata, qualityInspection: lastQualityInspection, providerVideo: activeProviderCheckpoint, generatedClipIds, loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex,
                        completedSegments: generatedClipIds.length,
                        phase: 'uploading',
                        autoMergeAfterLoop,
                        currentClipTitle: segmentTitle,
                        generatedClipIds,
                    }) }),
            });
            const token = ((_e = (_d = globalThis.crypto) === null || _d === void 0 ? void 0 : _d.randomUUID) === null || _e === void 0 ? void 0 : _e.call(_d)) || `${Date.now()}`;
            const downloadedVideo = await (0, openrouter_1.downloadOpenRouterVideo)(generated.videoUrl);
            const appliedResolution = generated.metadata.resolvedResolution === '480p'
                || generated.metadata.resolvedResolution === '720p'
                || generated.metadata.resolvedResolution === '1080p'
                ? generated.metadata.resolvedResolution
                : project.data.resolution;
            const generatedCanvas = (0, ffmpeg_1.getVideoCanvasSize)(project.data.aspectRatio, appliedResolution);
            lastQualityInspection = await (0, ffmpeg_1.inspectVideoBufferQuality)(downloadedVideo.buffer, {
                expectedDurationSeconds: generated.metadata.durationApplied,
                expectedWidth: generatedCanvas.width,
                expectedHeight: generatedCanvas.height,
                expectedAspectRatio: generatedCanvas.width / generatedCanvas.height,
                requireAudibleAudio: generated.metadata.audioApplied,
                maxBlackFrameRatio: 0.18,
            });
            lastAudioInspection = lastQualityInspection.audio;
            if (!lastQualityInspection.passed) {
                const discardReason = ((_f = lastQualityInspection.issues[0]) === null || _f === void 0 ? void 0 : _f.code)
                    || 'quality_validation_failed';
                await updateJob(jobId, {
                    metadata: Object.assign(Object.assign({}, baseJobMetadata), { repeatCount: totalSegments, autoMergeAfterLoop, resolvedPrompt: renderPrompt, lastSegmentPrompt: segmentPrompt, continuity, renderResult: generated.metadata, providerVideo: null, providerVideoDiscarded: {
                            reason: discardReason,
                            providerJobId: (activeProviderCheckpoint === null || activeProviderCheckpoint === void 0 ? void 0 : activeProviderCheckpoint.jobId) || null,
                            modelId: generated.metadata.modelUsed,
                            discardedAt: new Date().toISOString(),
                        }, audioInspection: lastAudioInspection, qualityInspection: lastQualityInspection, generatedClipIds }),
                });
                requirePassingVideoQuality(lastQualityInspection, 'OpenRouter scene video');
            }
            const savedVideoUrl = await uploadBufferToVideoStudioStorage({
                buffer: downloadedVideo.buffer,
                userId: claimed.data.userId,
                projectId: request.projectId,
                pathSuffix: `clips/${token}.mp4`,
                contentType: downloadedVideo.contentType || 'video/mp4',
            });
            await updateJob(jobId, {
                progress: 24 + Math.round(((segmentIndex + 0.8) / totalSegments) * 58),
                message: totalSegments > 1
                    ? `Extracting the continuity frame for segment ${segmentIndex + 1}/${totalSegments}.`
                    : 'Extracting and storing the last frame for continuity.',
                metadata: Object.assign(Object.assign({}, baseJobMetadata), { repeatCount: totalSegments, autoMergeAfterLoop, resolvedPrompt: renderPrompt, lastSegmentPrompt: segmentPrompt, continuity, renderResult: generated.metadata, providerVideo: activeProviderCheckpoint, generatedClipIds, loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex,
                        completedSegments: generatedClipIds.length,
                        phase: 'extracting',
                        autoMergeAfterLoop,
                        currentClipTitle: segmentTitle,
                        generatedClipIds,
                    }) }),
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
                duration: generated.metadata.durationApplied,
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
            await updateJob(jobId, {
                progress: 24 + Math.round(((segmentIndex + 1) / totalSegments) * 58),
                message: `Saved scene ${segmentIndex + 1}/${totalSegments}.`,
                metadata: Object.assign(Object.assign({}, baseJobMetadata), { repeatCount: totalSegments, autoMergeAfterLoop, resolvedPrompt: renderPrompt, continuity, renderResult: generated.metadata, qualityInspection: lastQualityInspection, providerVideo: activeProviderCheckpoint, generatedClipIds, loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex,
                        completedSegments: generatedClipIds.length,
                        phase: 'extracting',
                        autoMergeAfterLoop,
                        currentClipTitle: segmentTitle,
                        generatedClipIds,
                    }) }),
            });
        }
        if (autoMergeAfterLoop && generatedClipIds.length > 1) {
            await updateJob(jobId, {
                status: 'uploading',
                progress: 84,
                message: 'Auto-merging generated segments into a final clip.',
                metadata: Object.assign(Object.assign({}, baseJobMetadata), { repeatCount: totalSegments, autoMergeAfterLoop, resolvedPrompt: renderPrompt, continuity,
                    generatedClipIds, loopProgress: buildLoopProgress({
                        totalSegments,
                        segmentIndex: totalSegments - 1,
                        completedSegments: generatedClipIds.length,
                        phase: 'merging',
                        autoMergeAfterLoop,
                        currentClipTitle: `${title} final cut`,
                        generatedClipIds,
                    }) }),
            });
            const generatedClips = await getClips(generatedClipIds, claimed.data.userId, request.projectId);
            const mergedBuffer = await (0, ffmpeg_1.mergeVideos)({
                clips: generatedClips.map((clip) => ({ url: clip.data.videoUrl })),
                aspectRatio: project.data.aspectRatio,
                resolution: project.data.resolution,
                fps: 30,
            });
            const finalCanvas = (0, ffmpeg_1.getVideoCanvasSize)(project.data.aspectRatio, project.data.resolution);
            const expectedMergedDuration = generatedClips.reduce((total, clip) => { var _a; return total + Math.max(0, Number((_a = clip.data.duration) !== null && _a !== void 0 ? _a : 0)); }, 0);
            finalQualityInspection = await (0, ffmpeg_1.inspectVideoBufferQuality)(mergedBuffer, Object.assign(Object.assign({}, (expectedMergedDuration > 0
                ? { expectedDurationSeconds: expectedMergedDuration }
                : {})), { expectedWidth: finalCanvas.width, expectedHeight: finalCanvas.height, expectedAspectRatio: finalCanvas.width / finalCanvas.height, requireAudibleAudio: Boolean(lastRenderResult === null || lastRenderResult === void 0 ? void 0 : lastRenderResult.audioApplied), maxBlackFrameRatio: 0.2 }));
            requirePassingVideoQuality(finalQualityInspection, 'Auto-merged final video');
            const mergeToken = ((_h = (_g = globalThis.crypto) === null || _g === void 0 ? void 0 : _g.randomUUID) === null || _h === void 0 ? void 0 : _h.call(_g)) || `${Date.now()}`;
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
            message: totalSegments > 1
                ? autoMergeAfterLoop
                    ? `Rendered ${totalSegments} segments and saved an auto-merged final clip.`
                    : `Rendered ${totalSegments} linked segments and saved them to the timeline.`
                : 'Rendered clip saved to the project timeline.',
            clipId: finalClipId,
            resultVideoUrl: finalVideoUrl,
            resultFrameUrl: finalFrameUrl,
            metadata: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, baseJobMetadata), { repeatCount: totalSegments, autoMergeAfterLoop, resolvedPrompt: renderPrompt, continuity,
                generatedClipIds, providerVideo: activeProviderCheckpoint }), (lastRenderResult ? { renderResult: lastRenderResult } : {})), (lastAudioInspection ? { audioInspection: lastAudioInspection } : {})), (lastQualityInspection ? { qualityInspection: lastQualityInspection } : {})), (finalQualityInspection ? { finalQualityInspection } : {})), { loopProgress: buildLoopProgress({
                    totalSegments,
                    segmentIndex: Math.max(0, totalSegments - 1),
                    completedSegments: generatedClipIds.length,
                    phase: 'completed',
                    autoMergeAfterLoop,
                    currentClipTitle: autoMergeAfterLoop && generatedClipIds.length > 1
                        ? `${title} final cut`
                        : buildLoopClipTitle(title, Math.max(0, totalSegments - 1), totalSegments),
                    generatedClipIds,
                }) }),
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (error) {
        if (error instanceof openrouter_1.OpenRouterVideoPendingError) {
            await updateJob(jobId, {
                status: 'queued',
                progress: 18,
                message: 'OpenRouter is still rendering. The same provider job will resume automatically.',
                errorMessage: null,
                nextAttemptAt: null,
                finishedAt: null,
            });
            return;
        }
        const rawMessage = error instanceof Error ? error.message : 'Video studio job failed.';
        const privacyBlocked = (0, openrouter_1.isOpenRouterInputImagePrivacyError)(error);
        const retryCount = Number((_j = baseJobMetadata.workerRetryCount) !== null && _j !== void 0 ? _j : 0);
        if (isTransientVideoStudioError(error) && retryCount < 3) {
            const nextRetryCount = retryCount + 1;
            const retryDelayMs = Math.min(5 * 60 * 1000, 30 * 1000 * (2 ** (nextRetryCount - 1)));
            await updateJob(jobId, {
                status: 'queued',
                progress: Math.max(8, Math.min(90, Number((_k = claimed.data.progress) !== null && _k !== void 0 ? _k : 8))),
                message: `Temporary provider or network failure. Automatic retry ${nextRetryCount}/3 is scheduled.`,
                errorMessage: null,
                nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now() + retryDelayMs),
                finishedAt: null,
                'metadata.workerRetryCount': nextRetryCount,
                'metadata.lastWorkerError': {
                    message: rawMessage.slice(0, 1000),
                    occurredAt: new Date().toISOString(),
                },
            });
            return;
        }
        const hintMessage = (0, openrouter_1.deriveVideoInfraHint)(rawMessage);
        await updateJob(jobId, Object.assign(Object.assign({ status: 'failed', progress: 100, message: error instanceof VideoStudioWorkerError
                ? rawMessage
                : hintMessage, errorMessage: privacyBlocked ? hintMessage : rawMessage, nextAttemptAt: null }, (privacyBlocked
            ? {
                'metadata.failureReasonCode': 'input_image_privacy',
                'metadata.failedVisualInputMode': (request === null || request === void 0 ? void 0 : request.visualInputMode) || 'standard',
            }
            : {})), { finishedAt: admin.firestore.FieldValue.serverTimestamp() })).catch((updateError) => {
            console.error('[VideoStudioWorker] failed to update job status:', updateError);
        });
        throw error;
    }
}
//# sourceMappingURL=processor.js.map