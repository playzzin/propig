"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleVideoStudioStatus = handleVideoStudioStatus;
exports.handleVideoStudioEstimate = handleVideoStudioEstimate;
exports.handleVideoStudioReadiness = handleVideoStudioReadiness;
exports.handleVideoStudioClips = handleVideoStudioClips;
exports.handleVideoStudioClipById = handleVideoStudioClipById;
exports.handleVideoStudioJobs = handleVideoStudioJobs;
exports.handleVideoStudioJobProcess = handleVideoStudioJobProcess;
exports.handleVideoStudioJobRun = handleVideoStudioJobRun;
exports.handleVideoStudioJobById = handleVideoStudioJobById;
exports.handleVideoStudioTimeline = handleVideoStudioTimeline;
exports.handleVideoStudioProjectStorage = handleVideoStudioProjectStorage;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const zod_1 = require("zod");
const processor_1 = require("../videoStudio/processor");
const request_1 = require("../videoStudio/request");
const openrouter_1 = require("../videoStudio/openrouter");
const ffmpeg_1 = require("../videoStudio/ffmpeg");
const hostingCommon_1 = require("./hostingCommon");
const hostingAiRuntime_1 = require("./hostingAiRuntime");
const PROJECTS = 'video_studio_projects';
const CLIPS = 'video_studio_clips';
const JOBS = 'video_studio_jobs';
const VIDEO_STUDIO_STORAGE_PAGE_SIZE = 250;
const ACTIVE_STORAGE_JOB_STATUSES = new Set(['queued', 'running', 'uploading']);
async function requireOwnedProject(uid, projectId) {
    const snapshot = await hostingCommon_1.db.collection(PROJECTS).doc(projectId).get();
    if (!snapshot.exists)
        throw new hostingCommon_1.ApiError(404, 'The selected project no longer exists.');
    const data = snapshot.data() || {};
    if (data.userId !== uid)
        throw new hostingCommon_1.ApiError(403, 'You do not have access to this project.');
    return { id: snapshot.id, data };
}
async function requireOwnedJob(uid, jobId) {
    const snapshot = await hostingCommon_1.db.collection(JOBS).doc(jobId).get();
    if (!snapshot.exists)
        throw new hostingCommon_1.ApiError(404, 'The selected job no longer exists.');
    const data = snapshot.data() || {};
    if (data.userId !== uid)
        throw new hostingCommon_1.ApiError(403, 'You do not have access to this job.');
    return { id: snapshot.id, data };
}
function nullableText(value) {
    const text = value === null || value === void 0 ? void 0 : value.trim();
    return text || null;
}
async function handleVideoStudioStatus(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'GET');
    await (0, hostingCommon_1.requireUser)(req);
    const runtime = await (0, hostingAiRuntime_1.getHostingAiRuntime)();
    res.status(200).json({
        success: true,
        status: {
            provider: 'openrouter',
            devMode: false,
            openRouterApiKeyConfigured: Boolean(runtime.openRouterApiKey),
            configSource: runtime.source,
            processorSecretConfigured: false,
            automaticProcessorConfigured: true,
        },
    });
}
const VideoEstimateQuerySchema = zod_1.z.object({
    duration: zod_1.z.coerce.number().int().min(1).max(15),
    resolution: zod_1.z.enum(['480p', '720p', '1080p']),
    aspectRatio: zod_1.z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']),
    qualityMode: zod_1.z.enum(['proof', 'final']).default('proof'),
    hasReferenceImage: zod_1.z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasEndReferenceImage: zod_1.z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasVisualReferenceImages: zod_1.z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    audioMode: zod_1.z.enum(['silent', 'ambient', 'dialogue']).default('silent'),
});
async function handleVideoStudioEstimate(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'GET');
    await (0, hostingCommon_1.requireUser)(req);
    const parsed = VideoEstimateQuerySchema.safeParse({
        duration: req.query.duration,
        resolution: req.query.resolution,
        aspectRatio: req.query.aspectRatio,
        qualityMode: req.query.qualityMode,
        hasReferenceImage: req.query.hasReferenceImage,
        hasEndReferenceImage: req.query.hasEndReferenceImage,
        hasVisualReferenceImages: req.query.hasVisualReferenceImages,
        audioMode: req.query.audioMode,
    });
    if (!parsed.success)
        throw new hostingCommon_1.ApiError(400, '영상 예상 비용 조건을 확인해 주세요.');
    const runtime = await (0, hostingAiRuntime_1.getHostingAiRuntime)();
    if (!runtime.openRouterApiKey)
        throw new hostingCommon_1.ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    const estimate = await (0, openrouter_1.preflightOpenRouterVideo)(Object.assign({ apiKey: runtime.openRouterApiKey }, parsed.data));
    res.status(200).json({ success: true, estimate });
}
const VideoReadinessQuerySchema = zod_1.z.object({
    duration: zod_1.z.coerce.number().int().min(1).max(15).default(6),
    resolution: zod_1.z.enum(['480p', '720p', '1080p']).default('720p'),
    aspectRatio: zod_1.z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']).default('16:9'),
    qualityMode: zod_1.z.enum(['proof', 'final']).default('proof'),
    hasReferenceImage: zod_1.z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasEndReferenceImage: zod_1.z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasVisualReferenceImages: zod_1.z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    audioMode: zod_1.z.enum(['silent', 'ambient', 'dialogue']).default('silent'),
});
async function handleVideoStudioReadiness(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'GET');
    await (0, hostingCommon_1.requireUser)(req);
    const parsed = VideoReadinessQuerySchema.safeParse({
        duration: req.query.duration,
        resolution: req.query.resolution,
        aspectRatio: req.query.aspectRatio,
        qualityMode: req.query.qualityMode,
        hasReferenceImage: req.query.hasReferenceImage,
        hasEndReferenceImage: req.query.hasEndReferenceImage,
        hasVisualReferenceImages: req.query.hasVisualReferenceImages,
        audioMode: req.query.audioMode,
    });
    if (!parsed.success)
        throw new hostingCommon_1.ApiError(400, '영상 제작 사전 점검 조건이 올바르지 않습니다.');
    const runtime = await (0, hostingAiRuntime_1.getHostingAiRuntime)();
    const [firestore, storage, storageSigning, ffmpeg] = await Promise.all([
        hostingCommon_1.db.collection(JOBS).limit(1).get().then(() => ({ ok: true, message: 'Firestore Admin read access is available.' }), (error) => ({
            ok: false,
            message: error instanceof Error ? error.message : 'Firestore Admin read access failed.',
        })),
        admin.storage().bucket().getMetadata().then(() => ({ ok: true, message: 'Firebase Storage Admin access is available.' }), (error) => ({
            ok: false,
            message: error instanceof Error ? error.message : 'Firebase Storage Admin access failed.',
        })),
        admin.storage().bucket().file('__readiness__/signing-probe.txt').getSignedUrl({
            action: 'read',
            expires: Date.now() + 60 * 1000,
        }).then(() => ({ ok: true, message: 'Firebase Storage URL signing is available.' }), (error) => ({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Firebase Storage URL signing is unavailable.',
        })),
        (0, ffmpeg_1.inspectFfmpegRuntime)(),
    ]);
    const openRouter = runtime.openRouterApiKey
        ? await (0, openrouter_1.preflightOpenRouterVideo)(Object.assign({ apiKey: runtime.openRouterApiKey }, parsed.data)).then((preflight) => ({ ok: true, preflight, message: '호환되는 영상 모델을 확인했습니다.' }), (error) => ({
            ok: false,
            preflight: null,
            message: error instanceof Error ? error.message : 'OpenRouter 영상 모델 점검에 실패했습니다.',
        }))
        : {
            ok: false,
            preflight: null,
            message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.',
        };
    const ready = firestore.ok && storage.ok && ffmpeg.ok && openRouter.ok;
    res.status(200).json({
        success: true,
        readiness: {
            ready,
            checkedAt: new Date().toISOString(),
            firebase: {
                status: {
                    initialized: true,
                    canPersistToFirestore: firestore.ok,
                    canSignStorageUrls: storageSigning.ok,
                    credentialMode: 'application_default',
                    message: !firestore.ok
                        ? firestore.message
                        : !storageSigning.ok
                            ? storageSigning.message
                            : null,
                },
                firestore,
                storage,
                storageSigning,
            },
            ffmpeg: {
                ok: ffmpeg.ok,
                version: ffmpeg.version,
                message: ffmpeg.message,
            },
            openRouter,
        },
    });
}
const CreateClipSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1).optional(),
    projectId: zod_1.z.string().min(1),
    title: zod_1.z.string().trim().min(1).max(240),
    prompt: zod_1.z.string().trim().min(1).max(6000),
    mode: zod_1.z.enum(['generate', 'extend', 'continue', 'edit', 'merge']),
    status: zod_1.z.enum(['ready', 'processing', 'failed']).default('ready'),
    videoUrl: zod_1.z.string().url(),
    posterUrl: zod_1.z.string().url().nullable().optional(),
    lastFrameUrl: zod_1.z.string().url().nullable().optional(),
    continuityNotes: zod_1.z.string().max(3000).nullable().optional(),
    cameraNotes: zod_1.z.string().max(3000).nullable().optional(),
    subjectLock: zod_1.z.string().max(3000).nullable().optional(),
    takeGroupId: zod_1.z.string().max(240).nullable().optional(),
    parentTakeClipId: zod_1.z.string().max(240).nullable().optional(),
    takeIndex: zod_1.z.number().int().min(1).nullable().optional(),
    sourceClipId: zod_1.z.string().max(240).nullable().optional(),
    sourceVideoUrl: zod_1.z.string().url().nullable().optional(),
    mergeSourceClipIds: zod_1.z.array(zod_1.z.string().min(1).max(240)).max(100).default([]),
    duration: zod_1.z.number().int().min(1).max(15).nullable().optional(),
    aspectRatio: zod_1.z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']),
    resolution: zod_1.z.enum(['480p', '720p', '1080p']),
});
async function handleVideoStudioClips(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const payload = (0, hostingCommon_1.parseJson)(req, CreateClipSchema);
    await requireOwnedProject(auth.uid, payload.projectId);
    const projectRef = hostingCommon_1.db.collection(PROJECTS).doc(payload.projectId);
    const clipRef = hostingCommon_1.db.collection(CLIPS).doc();
    const result = await hostingCommon_1.db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d, _e;
        const query = hostingCommon_1.db.collection(CLIPS).where('projectId', '==', payload.projectId);
        const [project, clips] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(query),
        ]);
        if (!project.exists)
            throw new hostingCommon_1.ApiError(404, 'The selected project no longer exists.');
        if (((_a = project.data()) === null || _a === void 0 ? void 0 : _a.userId) !== auth.uid)
            throw new hostingCommon_1.ApiError(403, 'You do not have access to this project.');
        let highest = -1;
        for (const clip of clips.docs)
            highest = Math.max(highest, Number((_b = clip.data().sequence) !== null && _b !== void 0 ? _b : -1));
        const sequence = highest + 1;
        let takeIndex = (_c = payload.takeIndex) !== null && _c !== void 0 ? _c : null;
        if (payload.takeGroupId && !takeIndex) {
            let highestTake = 1;
            for (const clip of clips.docs) {
                const data = clip.data();
                if (clip.id === payload.takeGroupId || data.takeGroupId === payload.takeGroupId) {
                    highestTake = Math.max(highestTake, Number((_d = data.takeIndex) !== null && _d !== void 0 ? _d : 1));
                }
            }
            takeIndex = highestTake + 1;
        }
        const coverUrl = payload.posterUrl || payload.lastFrameUrl || payload.videoUrl;
        transaction.set(clipRef, {
            userId: auth.uid,
            projectId: payload.projectId,
            title: payload.title,
            prompt: payload.prompt,
            mode: payload.mode,
            status: payload.status,
            provider: 'openrouter',
            sequence,
            videoUrl: payload.videoUrl,
            posterUrl: payload.posterUrl || payload.lastFrameUrl || null,
            lastFrameUrl: payload.lastFrameUrl || null,
            continuityNotes: nullableText(payload.continuityNotes),
            cameraNotes: nullableText(payload.cameraNotes),
            subjectLock: nullableText(payload.subjectLock),
            takeGroupId: payload.takeGroupId || null,
            parentTakeClipId: payload.parentTakeClipId || null,
            takeIndex,
            sourceClipId: payload.sourceClipId || null,
            sourceVideoUrl: payload.sourceVideoUrl || null,
            mergeSourceClipIds: payload.mergeSourceClipIds,
            duration: (_e = payload.duration) !== null && _e !== void 0 ? _e : null,
            aspectRatio: payload.aspectRatio,
            resolution: payload.resolution,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(projectRef, {
            clipCount: sequence + 1,
            coverClipId: clipRef.id,
            coverUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { clipId: clipRef.id, sequence };
    });
    res.status(200).json(Object.assign({ success: true }, result));
}
async function handleVideoStudioClipById(req, res, clipId) {
    (0, hostingCommon_1.requireMethod)(req, 'DELETE');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const clipRef = hostingCommon_1.db.collection(CLIPS).doc(clipId);
    const result = await hostingCommon_1.db.runTransaction(async (transaction) => {
        var _a, _b;
        const clipSnapshot = await transaction.get(clipRef);
        if (!clipSnapshot.exists)
            throw new hostingCommon_1.ApiError(404, 'The selected clip no longer exists.');
        const clip = clipSnapshot.data() || {};
        if (clip.userId !== auth.uid)
            throw new hostingCommon_1.ApiError(403, 'You do not have access to this clip.');
        const projectRef = hostingCommon_1.db.collection(PROJECTS).doc(String(clip.projectId));
        const clipsQuery = hostingCommon_1.db.collection(CLIPS).where('projectId', '==', clip.projectId);
        const [project, clips] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(clipsQuery),
        ]);
        if (!project.exists)
            throw new hostingCommon_1.ApiError(404, 'The selected project no longer exists.');
        if (((_a = project.data()) === null || _a === void 0 ? void 0 : _a.userId) !== auth.uid)
            throw new hostingCommon_1.ApiError(403, 'You do not have access to this project.');
        const remaining = clips.docs
            .filter((item) => item.id !== clipId)
            .map((item) => (Object.assign({ id: item.id }, item.data())))
            .sort((left, right) => { var _a, _b; return Number((_a = left.sequence) !== null && _a !== void 0 ? _a : -1) - Number((_b = right.sequence) !== null && _b !== void 0 ? _b : -1) || left.id.localeCompare(right.id); });
        remaining.forEach((item, index) => {
            transaction.update(hostingCommon_1.db.collection(CLIPS).doc(item.id), {
                sequence: index,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        const cover = remaining[remaining.length - 1];
        transaction.delete(clipRef);
        transaction.update(projectRef, {
            clipCount: remaining.length,
            coverClipId: (cover === null || cover === void 0 ? void 0 : cover.id) || null,
            coverUrl: (cover === null || cover === void 0 ? void 0 : cover.posterUrl) || (cover === null || cover === void 0 ? void 0 : cover.lastFrameUrl) || (cover === null || cover === void 0 ? void 0 : cover.videoUrl) || ((_b = project.data()) === null || _b === void 0 ? void 0 : _b.starterImageUrl) || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { projectId: String(clip.projectId), clipCount: remaining.length };
    });
    res.status(200).json(Object.assign({ success: true }, result));
}
function defaultJobTitle(operation) {
    const titles = {
        generate: '새 영상 생성',
        extend: '영상 연장',
        continue: '장면 이어 만들기',
        edit: '영상 편집',
        merge: '클립 병합',
        'extract-frame': '마지막 프레임 추출',
    };
    return titles[operation] || 'Video Studio 작업';
}
async function handleVideoStudioJobs(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const payload = (0, hostingCommon_1.parseJson)(req, request_1.videoStudioJobRequestSchema);
    const project = await requireOwnedProject(auth.uid, payload.projectId);
    const preflight = await preflightQueuedVideoStudioJob(payload, project.data);
    const jobId = await createQueuedJob(auth.uid, payload, preflight);
    res.status(200).json({ success: true, jobId, status: 'queued' });
}
async function preflightQueuedVideoStudioJob(payload, project) {
    var _a, _b;
    if (!['generate', 'extend', 'continue', 'edit'].includes(payload.operation)) {
        return null;
    }
    const runtime = await (0, hostingAiRuntime_1.getHostingAiRuntime)();
    if (!runtime.openRouterApiKey) {
        throw new hostingCommon_1.ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    }
    const aspectRatio = zod_1.z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'])
        .parse(project.aspectRatio);
    const resolution = zod_1.z.enum(['480p', '720p', '1080p']).parse(project.resolution);
    return (0, openrouter_1.preflightOpenRouterVideo)({
        apiKey: runtime.openRouterApiKey,
        duration: (_a = payload.duration) !== null && _a !== void 0 ? _a : 6,
        resolution,
        aspectRatio,
        qualityMode: payload.qualityMode || 'proof',
        hasReferenceImage: Boolean(payload.referenceImage || payload.sourceClipId),
        hasEndReferenceImage: Boolean(payload.endReferenceImage),
        hasVisualReferenceImages: Boolean((_b = payload.visualReferenceImages) === null || _b === void 0 ? void 0 : _b.length),
        audioMode: payload.audioMode || (payload.generateAudio ? 'ambient' : 'silent'),
    });
}
async function createQueuedJob(uid, payload, preflight) {
    var _a, _b;
    const ref = await hostingCommon_1.db.collection(JOBS).add({
        userId: uid,
        projectId: payload.projectId,
        kind: payload.operation === 'extract-frame' ? 'extract-frame' : payload.operation,
        title: ((_a = payload.clipTitle) === null || _a === void 0 ? void 0 : _a.trim()) || defaultJobTitle(payload.operation),
        prompt: ((_b = payload.prompt) === null || _b === void 0 ? void 0 : _b.trim()) || '',
        status: 'queued',
        progress: 0,
        message: 'Job accepted and waiting for a processor.',
        sourceClipId: payload.sourceClipId || null,
        mergeSourceClipIds: payload.mergeClipIds || [],
        metadata: Object.assign({ request: payload }, (preflight ? { preflight } : {})),
        clipId: null,
        resultVideoUrl: null,
        resultFrameUrl: null,
        errorMessage: null,
        attemptCount: 0,
        claimedAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
}
const ProcessJobSchema = zod_1.z.object({ jobId: zod_1.z.string().min(1).max(240) });
async function handleVideoStudioJobProcess(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const payload = (0, hostingCommon_1.parseJson)(req, ProcessJobSchema);
    await requireOwnedJob(auth.uid, payload.jobId);
    await (0, processor_1.processQueuedVideoStudioJob)(payload.jobId);
    const completed = await requireOwnedJob(auth.uid, payload.jobId);
    res.status(200).json({
        success: true,
        jobId: completed.id,
        status: completed.data.status,
        clipId: completed.data.clipId || null,
        resultVideoUrl: completed.data.resultVideoUrl || null,
        resultFrameUrl: completed.data.resultFrameUrl || null,
    });
}
async function handleVideoStudioJobRun(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const payload = (0, hostingCommon_1.parseJson)(req, request_1.videoStudioJobRequestSchema);
    const project = await requireOwnedProject(auth.uid, payload.projectId);
    const preflight = await preflightQueuedVideoStudioJob(payload, project.data);
    const jobId = await createQueuedJob(auth.uid, payload, preflight);
    await (0, processor_1.processQueuedVideoStudioJob)(jobId);
    const completed = await requireOwnedJob(auth.uid, jobId);
    res.status(200).json({
        success: true,
        jobId,
        status: completed.data.status,
        clipId: completed.data.clipId || null,
        resultVideoUrl: completed.data.resultVideoUrl || null,
        resultFrameUrl: completed.data.resultFrameUrl || null,
    });
}
const UpdateJobSchema = zod_1.z.object({ action: zod_1.z.enum(['requeue', 'cancel']) });
async function handleVideoStudioJobById(req, res, jobId) {
    (0, hostingCommon_1.requireMethod)(req, 'PATCH');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const payload = (0, hostingCommon_1.parseJson)(req, UpdateJobSchema);
    const ref = hostingCommon_1.db.collection(JOBS).doc(jobId);
    const updated = await hostingCommon_1.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists)
            throw new hostingCommon_1.ApiError(404, 'The selected job no longer exists.');
        const job = snapshot.data() || {};
        if (job.userId !== auth.uid)
            throw new hostingCommon_1.ApiError(403, 'You do not have access to this job.');
        if (job.status === 'completed')
            throw new hostingCommon_1.ApiError(409, `Completed jobs cannot be ${payload.action === 'cancel' ? 'canceled' : 'requeued'}.`);
        if (job.status === 'running' || job.status === 'uploading') {
            throw new hostingCommon_1.ApiError(409, `Jobs that are already processing cannot be ${payload.action === 'cancel' ? 'canceled' : 'requeued'}.`);
        }
        if (payload.action === 'cancel' && job.status === 'canceled')
            throw new hostingCommon_1.ApiError(409, 'This job is already canceled.');
        const values = payload.action === 'requeue'
            ? {
                status: 'queued',
                progress: 0,
                message: 'Job requeued and waiting for a processor.',
                errorMessage: null,
                claimedAt: null,
                heartbeatAt: null,
                leaseExpiresAt: null,
                nextAttemptAt: null,
                startedAt: null,
                finishedAt: null,
            }
            : {
                status: 'canceled',
                message: 'Job canceled before processing.',
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
        transaction.update(ref, Object.assign(Object.assign(Object.assign({}, values), (payload.action === 'requeue'
            ? { 'metadata.queueDispatchToken': (0, node_crypto_1.randomUUID)() }
            : {})), { updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        return values.status;
    });
    res.status(200).json({ success: true, jobId, status: updated });
}
const ResequenceSchema = zod_1.z.object({
    clipIds: zod_1.z.array(zod_1.z.string().min(1).max(240)).min(1).max(500),
});
async function handleVideoStudioTimeline(req, res, projectId) {
    (0, hostingCommon_1.requireMethod)(req, 'PATCH');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const payload = (0, hostingCommon_1.parseJson)(req, ResequenceSchema);
    if (new Set(payload.clipIds).size !== payload.clipIds.length) {
        throw new hostingCommon_1.ApiError(400, 'Timeline reorder payload contains duplicate clip ids.');
    }
    const projectRef = hostingCommon_1.db.collection(PROJECTS).doc(projectId);
    const clipCount = await hostingCommon_1.db.runTransaction(async (transaction) => {
        var _a, _b;
        const query = hostingCommon_1.db.collection(CLIPS).where('projectId', '==', projectId);
        const [project, clips] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(query),
        ]);
        if (!project.exists)
            throw new hostingCommon_1.ApiError(404, 'The selected project no longer exists.');
        if (((_a = project.data()) === null || _a === void 0 ? void 0 : _a.userId) !== auth.uid)
            throw new hostingCommon_1.ApiError(403, 'You do not have access to this project.');
        const ids = clips.docs.map((item) => item.id);
        if (ids.length !== payload.clipIds.length || payload.clipIds.some((id) => !ids.includes(id))) {
            throw new hostingCommon_1.ApiError(400, 'Timeline reorder payload must include every clip in the project exactly once.');
        }
        const clipsById = new Map(clips.docs.map((item) => [item.id, item.data()]));
        payload.clipIds.forEach((id, index) => transaction.update(hostingCommon_1.db.collection(CLIPS).doc(id), {
            sequence: index,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
        const coverId = payload.clipIds[payload.clipIds.length - 1];
        const cover = clipsById.get(coverId) || {};
        transaction.update(projectRef, {
            clipCount: payload.clipIds.length,
            coverClipId: coverId,
            coverUrl: cover.posterUrl || cover.lastFrameUrl || cover.videoUrl || ((_b = project.data()) === null || _b === void 0 ? void 0 : _b.starterImageUrl) || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return payload.clipIds.length;
    });
    res.status(200).json({ success: true, projectId, clipCount });
}
const StorageCleanupSchema = zod_1.z.object({
    storagePaths: zod_1.z.array(zod_1.z.string().trim().min(1).max(1024)).min(1).max(250),
});
function videoStudioStoragePrefix(userId, projectId) {
    return `video_studio/${userId}/${projectId}/`;
}
function storagePathFromDownloadUrl(value, prefix) {
    if (typeof value !== 'string' || !value.trim())
        return null;
    try {
        const url = new URL(value);
        const marker = '/o/';
        const index = url.pathname.indexOf(marker);
        if (index < 0)
            return null;
        const path = decodeURIComponent(url.pathname.slice(index + marker.length));
        return path.startsWith(prefix) ? path : null;
    }
    catch (_a) {
        return null;
    }
}
function storedVideoFileKind(path) {
    if (/\.(mp4|mov|webm)$/i.test(path))
        return 'video';
    if (/\.(png|jpe?g|webp)$/i.test(path))
        return 'frame';
    if (/\.(mp3|wav|m4a|aac)$/i.test(path))
        return 'audio';
    return 'other';
}
async function getOwnedVideoStudioStorageSnapshot(userId, projectId) {
    const project = await requireOwnedProject(userId, projectId);
    const prefix = videoStudioStoragePrefix(userId, project.id);
    const [clipSnapshot, jobSnapshot] = await Promise.all([
        hostingCommon_1.db.collection(CLIPS).where('projectId', '==', project.id).get(),
        hostingCommon_1.db.collection(JOBS).where('projectId', '==', project.id).get(),
    ]);
    const protectedPaths = new Set();
    const collectPath = (value) => {
        const storagePath = storagePathFromDownloadUrl(value, prefix);
        if (storagePath)
            protectedPaths.add(storagePath);
    };
    clipSnapshot.docs.forEach((snapshot) => {
        const clip = snapshot.data();
        collectPath(clip.videoUrl);
        collectPath(clip.posterUrl);
        collectPath(clip.lastFrameUrl);
        collectPath(clip.sourceVideoUrl);
    });
    let activeJobCount = 0;
    jobSnapshot.docs.forEach((snapshot) => {
        const job = snapshot.data();
        collectPath(job.resultVideoUrl);
        collectPath(job.resultFrameUrl);
        if (ACTIVE_STORAGE_JOB_STATUSES.has(String(job.status || '')))
            activeJobCount += 1;
    });
    const [files] = await admin.storage().bucket().getFiles({
        prefix,
        maxResults: VIDEO_STUDIO_STORAGE_PAGE_SIZE,
        autoPaginate: false,
    });
    const cleanupCandidates = files
        .filter((file) => !protectedPaths.has(file.name))
        .map((file) => {
        var _a;
        const rawSize = Number((_a = file.metadata.size) !== null && _a !== void 0 ? _a : 0);
        return {
            path: file.name,
            sizeBytes: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : 0,
            updatedAt: typeof file.metadata.updated === 'string' ? file.metadata.updated : null,
            kind: storedVideoFileKind(file.name),
        };
    })
        .sort((left, right) => right.sizeBytes - left.sizeBytes || left.path.localeCompare(right.path));
    const overview = {
        projectId: project.id,
        cleanupLocked: activeJobCount > 0,
        activeJobCount,
        protectedFileCount: protectedPaths.size,
        cleanupCandidateCount: cleanupCandidates.length,
        cleanupCandidateBytes: cleanupCandidates.reduce((total, file) => total + file.sizeBytes, 0),
        cleanupCandidates,
        truncated: files.length >= VIDEO_STUDIO_STORAGE_PAGE_SIZE,
    };
    return { overview, candidatePaths: new Set(cleanupCandidates.map((file) => file.path)) };
}
async function handleVideoStudioProjectStorage(req, res, projectId) {
    (0, hostingCommon_1.requireMethod)(req, ['GET', 'DELETE']);
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const parsedProjectId = zod_1.z.string().trim().min(1).max(240).safeParse(projectId);
    if (!parsedProjectId.success)
        throw new hostingCommon_1.ApiError(400, 'Invalid video project.');
    const snapshot = await getOwnedVideoStudioStorageSnapshot(auth.uid, parsedProjectId.data);
    if (req.method === 'GET') {
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, overview: snapshot.overview });
        return;
    }
    const payload = (0, hostingCommon_1.parseJson)(req, StorageCleanupSchema, 'Choose one or more files to clean up.');
    if (snapshot.overview.cleanupLocked) {
        throw new hostingCommon_1.ApiError(409, 'Rendering is still in progress. Finish or cancel active jobs before cleaning up files.');
    }
    const requestedPaths = [...new Set(payload.storagePaths)].filter((path) => snapshot.candidatePaths.has(path));
    if (!requestedPaths.length)
        throw new hostingCommon_1.ApiError(400, 'No safe residual files were selected for cleanup.');
    const bucket = admin.storage().bucket();
    const results = await Promise.all(requestedPaths.map(async (storagePath) => {
        try {
            await bucket.file(storagePath).delete({ ignoreNotFound: true });
            return { storagePath, deleted: true, message: null };
        }
        catch (error) {
            return {
                storagePath,
                deleted: false,
                message: error instanceof Error ? error.message : 'Failed to delete the file.',
            };
        }
    }));
    res.status(200).json({
        success: true,
        deletedStoragePaths: results.filter((result) => result.deleted).map((result) => result.storagePath),
        failed: results.flatMap((result) => result.deleted || !result.message
            ? []
            : [{ storagePath: result.storagePath, message: result.message }]),
    });
}
//# sourceMappingURL=hostingVideoStudioRoutes.js.map