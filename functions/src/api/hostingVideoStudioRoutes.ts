import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import { processQueuedVideoStudioJob } from '../videoStudio/processor';
import { videoStudioJobRequestSchema } from '../videoStudio/request';
import { preflightOpenRouterVideo } from '../videoStudio/openrouter';
import { inspectFfmpegRuntime } from '../videoStudio/ffmpeg';
import { ApiError, db, parseJson, requireMethod, requireUser } from './hostingCommon';
import { getHostingAiRuntime } from './hostingAiRuntime';

const PROJECTS = 'video_studio_projects';
const CLIPS = 'video_studio_clips';
const JOBS = 'video_studio_jobs';
const VIDEO_STUDIO_STORAGE_PAGE_SIZE = 250;
const ACTIVE_STORAGE_JOB_STATUSES = new Set(['queued', 'running', 'uploading']);

async function requireOwnedProject(uid: string, projectId: string) {
    const snapshot = await db.collection(PROJECTS).doc(projectId).get();
    if (!snapshot.exists) throw new ApiError(404, 'The selected project no longer exists.');
    const data = snapshot.data() || {};
    if (data.userId !== uid) throw new ApiError(403, 'You do not have access to this project.');
    return { id: snapshot.id, data };
}

async function requireOwnedJob(uid: string, jobId: string) {
    const snapshot = await db.collection(JOBS).doc(jobId).get();
    if (!snapshot.exists) throw new ApiError(404, 'The selected job no longer exists.');
    const data = snapshot.data() || {};
    if (data.userId !== uid) throw new ApiError(403, 'You do not have access to this job.');
    return { id: snapshot.id, data };
}

function nullableText(value?: string | null): string | null {
    const text = value?.trim();
    return text || null;
}

export async function handleVideoStudioStatus(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'GET');
    await requireUser(req);
    const runtime = await getHostingAiRuntime();
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

const VideoEstimateQuerySchema = z.object({
    duration: z.coerce.number().int().min(1).max(15),
    resolution: z.enum(['480p', '720p', '1080p']),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']),
    qualityMode: z.enum(['proof', 'final']).default('proof'),
    hasReferenceImage: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasEndReferenceImage: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasVisualReferenceImages: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    audioMode: z.enum(['silent', 'ambient', 'dialogue']).default('silent'),
});

export async function handleVideoStudioEstimate(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'GET');
    await requireUser(req);
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
    if (!parsed.success) throw new ApiError(400, '영상 예상 비용 조건을 확인해 주세요.');
    const runtime = await getHostingAiRuntime();
    if (!runtime.openRouterApiKey) throw new ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    const estimate = await preflightOpenRouterVideo({
        apiKey: runtime.openRouterApiKey,
        ...parsed.data,
    });
    res.status(200).json({ success: true, estimate });
}

const VideoReadinessQuerySchema = z.object({
    duration: z.coerce.number().int().min(1).max(15).default(6),
    resolution: z.enum(['480p', '720p', '1080p']).default('720p'),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']).default('16:9'),
    qualityMode: z.enum(['proof', 'final']).default('proof'),
    hasReferenceImage: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasEndReferenceImage: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasVisualReferenceImages: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    audioMode: z.enum(['silent', 'ambient', 'dialogue']).default('silent'),
});

export async function handleVideoStudioReadiness(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'GET');
    await requireUser(req);
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
    if (!parsed.success) throw new ApiError(400, '영상 제작 사전 점검 조건이 올바르지 않습니다.');

    const runtime = await getHostingAiRuntime();
    const [firestore, storage, storageSigning, ffmpeg] = await Promise.all([
        db.collection(JOBS).limit(1).get().then(
            () => ({ ok: true, message: 'Firestore Admin read access is available.' }),
            (error: unknown) => ({
                ok: false,
                message: error instanceof Error ? error.message : 'Firestore Admin read access failed.',
            }),
        ),
        admin.storage().bucket().getMetadata().then(
            () => ({ ok: true, message: 'Firebase Storage Admin access is available.' }),
            (error: unknown) => ({
                ok: false,
                message: error instanceof Error ? error.message : 'Firebase Storage Admin access failed.',
            }),
        ),
        admin.storage().bucket().file('__readiness__/signing-probe.txt').getSignedUrl({
            action: 'read',
            expires: Date.now() + 60 * 1000,
        }).then(
            () => ({ ok: true, message: 'Firebase Storage URL signing is available.' }),
            (error: unknown) => ({
                ok: false,
                message:
                    error instanceof Error
                        ? error.message
                        : 'Firebase Storage URL signing is unavailable.',
            }),
        ),
        inspectFfmpegRuntime(),
    ]);
    const openRouter = runtime.openRouterApiKey
        ? await preflightOpenRouterVideo({
            apiKey: runtime.openRouterApiKey,
            ...parsed.data,
        }).then(
            (preflight) => ({ ok: true as const, preflight, message: '호환되는 영상 모델을 확인했습니다.' }),
            (error: unknown) => ({
                ok: false as const,
                preflight: null,
                message: error instanceof Error ? error.message : 'OpenRouter 영상 모델 점검에 실패했습니다.',
            }),
        )
        : {
            ok: false as const,
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

const CreateClipSchema = z.object({
    userId: z.string().min(1).optional(),
    projectId: z.string().min(1),
    title: z.string().trim().min(1).max(240),
    prompt: z.string().trim().min(1).max(6000),
    mode: z.enum(['generate', 'extend', 'continue', 'edit', 'merge']),
    status: z.enum(['ready', 'processing', 'failed']).default('ready'),
    videoUrl: z.string().url(),
    posterUrl: z.string().url().nullable().optional(),
    lastFrameUrl: z.string().url().nullable().optional(),
    continuityNotes: z.string().max(3000).nullable().optional(),
    cameraNotes: z.string().max(3000).nullable().optional(),
    subjectLock: z.string().max(3000).nullable().optional(),
    takeGroupId: z.string().max(240).nullable().optional(),
    parentTakeClipId: z.string().max(240).nullable().optional(),
    takeIndex: z.number().int().min(1).nullable().optional(),
    sourceClipId: z.string().max(240).nullable().optional(),
    sourceVideoUrl: z.string().url().nullable().optional(),
    mergeSourceClipIds: z.array(z.string().min(1).max(240)).max(100).default([]),
    duration: z.number().int().min(1).max(15).nullable().optional(),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']),
    resolution: z.enum(['480p', '720p', '1080p']),
});

export async function handleVideoStudioClips(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const payload = parseJson(req, CreateClipSchema);
    await requireOwnedProject(auth.uid, payload.projectId);
    const projectRef = db.collection(PROJECTS).doc(payload.projectId);
    const clipRef = db.collection(CLIPS).doc();
    const result = await db.runTransaction(async (transaction) => {
        const query = db.collection(CLIPS).where('projectId', '==', payload.projectId);
        const [project, clips] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(query),
        ]);
        if (!project.exists) throw new ApiError(404, 'The selected project no longer exists.');
        if (project.data()?.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this project.');
        let highest = -1;
        for (const clip of clips.docs) highest = Math.max(highest, Number(clip.data().sequence ?? -1));
        const sequence = highest + 1;
        let takeIndex = payload.takeIndex ?? null;
        if (payload.takeGroupId && !takeIndex) {
            let highestTake = 1;
            for (const clip of clips.docs) {
                const data = clip.data();
                if (clip.id === payload.takeGroupId || data.takeGroupId === payload.takeGroupId) {
                    highestTake = Math.max(highestTake, Number(data.takeIndex ?? 1));
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
            duration: payload.duration ?? null,
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
    res.status(200).json({ success: true, ...result });
}

export async function handleVideoStudioClipById(
    req: Request,
    res: Response,
    clipId: string,
): Promise<void> {
    requireMethod(req, 'DELETE');
    const auth = await requireUser(req);
    const clipRef = db.collection(CLIPS).doc(clipId);
    const result = await db.runTransaction(async (transaction) => {
        const clipSnapshot = await transaction.get(clipRef);
        if (!clipSnapshot.exists) throw new ApiError(404, 'The selected clip no longer exists.');
        const clip = clipSnapshot.data() || {};
        if (clip.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this clip.');
        const projectRef = db.collection(PROJECTS).doc(String(clip.projectId));
        const clipsQuery = db.collection(CLIPS).where('projectId', '==', clip.projectId);
        const [project, clips] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(clipsQuery),
        ]);
        if (!project.exists) throw new ApiError(404, 'The selected project no longer exists.');
        if (project.data()?.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this project.');
        const remaining = clips.docs
            .filter((item) => item.id !== clipId)
            .map((item) => ({ id: item.id, ...item.data() } as { id: string; sequence?: number } & Record<string, unknown>))
            .sort((left, right) => Number(left.sequence ?? -1) - Number(right.sequence ?? -1) || left.id.localeCompare(right.id));
        remaining.forEach((item, index) => {
            transaction.update(db.collection(CLIPS).doc(item.id), {
                sequence: index,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        const cover = remaining[remaining.length - 1] as Record<string, unknown> | undefined;
        transaction.delete(clipRef);
        transaction.update(projectRef, {
            clipCount: remaining.length,
            coverClipId: cover?.id || null,
            coverUrl: cover?.posterUrl || cover?.lastFrameUrl || cover?.videoUrl || project.data()?.starterImageUrl || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { projectId: String(clip.projectId), clipCount: remaining.length };
    });
    res.status(200).json({ success: true, ...result });
}

function defaultJobTitle(operation: string): string {
    const titles: Record<string, string> = {
        generate: '새 영상 생성',
        extend: '영상 연장',
        continue: '장면 이어 만들기',
        edit: '영상 편집',
        merge: '클립 병합',
        'extract-frame': '마지막 프레임 추출',
    };
    return titles[operation] || 'Video Studio 작업';
}

export async function handleVideoStudioJobs(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const payload = parseJson(req, videoStudioJobRequestSchema);
    const project = await requireOwnedProject(auth.uid, payload.projectId);
    const preflight = await preflightQueuedVideoStudioJob(payload, project.data);
    const jobId = await createQueuedJob(auth.uid, payload, preflight);
    res.status(200).json({ success: true, jobId, status: 'queued' });
}

async function preflightQueuedVideoStudioJob(
    payload: z.infer<typeof videoStudioJobRequestSchema>,
    project: Record<string, unknown>,
) {
    if (!['generate', 'extend', 'continue', 'edit'].includes(payload.operation)) {
        return null;
    }
    const runtime = await getHostingAiRuntime();
    if (!runtime.openRouterApiKey) {
        throw new ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    }
    const aspectRatio = z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'])
        .parse(project.aspectRatio);
    const resolution = z.enum(['480p', '720p', '1080p']).parse(project.resolution);
    return preflightOpenRouterVideo({
        apiKey: runtime.openRouterApiKey,
        duration: payload.duration ?? 6,
        resolution,
        aspectRatio,
        qualityMode: payload.qualityMode || 'proof',
        hasReferenceImage: Boolean(payload.referenceImage || payload.sourceClipId),
        hasEndReferenceImage: Boolean(payload.endReferenceImage),
        hasVisualReferenceImages: Boolean(payload.visualReferenceImages?.length),
        audioMode: payload.audioMode || (payload.generateAudio ? 'ambient' : 'silent'),
    });
}

async function createQueuedJob(
    uid: string,
    payload: z.infer<typeof videoStudioJobRequestSchema>,
    preflight: Awaited<ReturnType<typeof preflightQueuedVideoStudioJob>>,
): Promise<string> {
    const ref = await db.collection(JOBS).add({
        userId: uid,
        projectId: payload.projectId,
        kind: payload.operation === 'extract-frame' ? 'extract-frame' : payload.operation,
        title: payload.clipTitle?.trim() || defaultJobTitle(payload.operation),
        prompt: payload.prompt?.trim() || '',
        status: 'queued',
        progress: 0,
        message: 'Job accepted and waiting for a processor.',
        sourceClipId: payload.sourceClipId || null,
        mergeSourceClipIds: payload.mergeClipIds || [],
        metadata: {
            request: payload,
            ...(preflight ? { preflight } : {}),
        },
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

const ProcessJobSchema = z.object({ jobId: z.string().min(1).max(240) });

export async function handleVideoStudioJobProcess(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const payload = parseJson(req, ProcessJobSchema);
    await requireOwnedJob(auth.uid, payload.jobId);
    await processQueuedVideoStudioJob(payload.jobId);
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

export async function handleVideoStudioJobRun(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const payload = parseJson(req, videoStudioJobRequestSchema);
    const project = await requireOwnedProject(auth.uid, payload.projectId);
    const preflight = await preflightQueuedVideoStudioJob(payload, project.data);
    const jobId = await createQueuedJob(auth.uid, payload, preflight);
    await processQueuedVideoStudioJob(jobId);
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

const UpdateJobSchema = z.object({ action: z.enum(['requeue', 'cancel']) });

export async function handleVideoStudioJobById(
    req: Request,
    res: Response,
    jobId: string,
): Promise<void> {
    requireMethod(req, 'PATCH');
    const auth = await requireUser(req);
    const payload = parseJson(req, UpdateJobSchema);
    const ref = db.collection(JOBS).doc(jobId);
    const updated = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new ApiError(404, 'The selected job no longer exists.');
        const job = snapshot.data() || {};
        if (job.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this job.');
        if (job.status === 'completed') throw new ApiError(409, `Completed jobs cannot be ${payload.action === 'cancel' ? 'canceled' : 'requeued'}.`);
        if (job.status === 'running' || job.status === 'uploading') {
            throw new ApiError(409, `Jobs that are already processing cannot be ${payload.action === 'cancel' ? 'canceled' : 'requeued'}.`);
        }
        if (payload.action === 'cancel' && job.status === 'canceled') throw new ApiError(409, 'This job is already canceled.');
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
        transaction.update(ref, {
            ...values,
            ...(payload.action === 'requeue'
                ? { 'metadata.queueDispatchToken': randomUUID() }
                : {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return values.status;
    });
    res.status(200).json({ success: true, jobId, status: updated });
}

const ResequenceSchema = z.object({
    clipIds: z.array(z.string().min(1).max(240)).min(1).max(500),
});

export async function handleVideoStudioTimeline(
    req: Request,
    res: Response,
    projectId: string,
): Promise<void> {
    requireMethod(req, 'PATCH');
    const auth = await requireUser(req);
    const payload = parseJson(req, ResequenceSchema);
    if (new Set(payload.clipIds).size !== payload.clipIds.length) {
        throw new ApiError(400, 'Timeline reorder payload contains duplicate clip ids.');
    }
    const projectRef = db.collection(PROJECTS).doc(projectId);
    const clipCount = await db.runTransaction(async (transaction) => {
        const query = db.collection(CLIPS).where('projectId', '==', projectId);
        const [project, clips] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(query),
        ]);
        if (!project.exists) throw new ApiError(404, 'The selected project no longer exists.');
        if (project.data()?.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this project.');
        const ids = clips.docs.map((item) => item.id);
        if (ids.length !== payload.clipIds.length || payload.clipIds.some((id) => !ids.includes(id))) {
            throw new ApiError(400, 'Timeline reorder payload must include every clip in the project exactly once.');
        }
        const clipsById = new Map(clips.docs.map((item) => [item.id, item.data()]));
        payload.clipIds.forEach((id, index) => transaction.update(db.collection(CLIPS).doc(id), {
            sequence: index,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
        const coverId = payload.clipIds[payload.clipIds.length - 1];
        const cover = clipsById.get(coverId) || {};
        transaction.update(projectRef, {
            clipCount: payload.clipIds.length,
            coverClipId: coverId,
            coverUrl: cover.posterUrl || cover.lastFrameUrl || cover.videoUrl || project.data()?.starterImageUrl || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return payload.clipIds.length;
    });
    res.status(200).json({ success: true, projectId, clipCount });
}

const StorageCleanupSchema = z.object({
    storagePaths: z.array(z.string().trim().min(1).max(1024)).min(1).max(250),
});

function videoStudioStoragePrefix(userId: string, projectId: string): string {
    return `video_studio/${userId}/${projectId}/`;
}

function storagePathFromDownloadUrl(value: unknown, prefix: string): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const url = new URL(value);
        const marker = '/o/';
        const index = url.pathname.indexOf(marker);
        if (index < 0) return null;
        const path = decodeURIComponent(url.pathname.slice(index + marker.length));
        return path.startsWith(prefix) ? path : null;
    } catch {
        return null;
    }
}

function storedVideoFileKind(path: string): 'video' | 'frame' | 'audio' | 'other' {
    if (/\.(mp4|mov|webm)$/i.test(path)) return 'video';
    if (/\.(png|jpe?g|webp)$/i.test(path)) return 'frame';
    if (/\.(mp3|wav|m4a|aac)$/i.test(path)) return 'audio';
    return 'other';
}

async function getOwnedVideoStudioStorageSnapshot(userId: string, projectId: string) {
    const project = await requireOwnedProject(userId, projectId);
    const prefix = videoStudioStoragePrefix(userId, project.id);
    const [clipSnapshot, jobSnapshot] = await Promise.all([
        db.collection(CLIPS).where('projectId', '==', project.id).get(),
        db.collection(JOBS).where('projectId', '==', project.id).get(),
    ]);
    const protectedPaths = new Set<string>();
    const collectPath = (value: unknown) => {
        const storagePath = storagePathFromDownloadUrl(value, prefix);
        if (storagePath) protectedPaths.add(storagePath);
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
        if (ACTIVE_STORAGE_JOB_STATUSES.has(String(job.status || ''))) activeJobCount += 1;
    });

    const [files] = await admin.storage().bucket().getFiles({
        prefix,
        maxResults: VIDEO_STUDIO_STORAGE_PAGE_SIZE,
        autoPaginate: false,
    });
    const cleanupCandidates = files
        .filter((file) => !protectedPaths.has(file.name))
        .map((file) => {
            const rawSize = Number(file.metadata.size ?? 0);
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

export async function handleVideoStudioProjectStorage(
    req: Request,
    res: Response,
    projectId: string,
): Promise<void> {
    requireMethod(req, ['GET', 'DELETE']);
    const auth = await requireUser(req);
    const parsedProjectId = z.string().trim().min(1).max(240).safeParse(projectId);
    if (!parsedProjectId.success) throw new ApiError(400, 'Invalid video project.');
    const snapshot = await getOwnedVideoStudioStorageSnapshot(auth.uid, parsedProjectId.data);

    if (req.method === 'GET') {
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, overview: snapshot.overview });
        return;
    }

    const payload = parseJson(req, StorageCleanupSchema, 'Choose one or more files to clean up.');
    if (snapshot.overview.cleanupLocked) {
        throw new ApiError(409, 'Rendering is still in progress. Finish or cancel active jobs before cleaning up files.');
    }
    const requestedPaths = [...new Set(payload.storagePaths)].filter((path) => snapshot.candidatePaths.has(path));
    if (!requestedPaths.length) throw new ApiError(400, 'No safe residual files were selected for cleanup.');

    const bucket = admin.storage().bucket();
    const results = await Promise.all(requestedPaths.map(async (storagePath) => {
        try {
            await bucket.file(storagePath).delete({ ignoreNotFound: true });
            return { storagePath, deleted: true, message: null };
        } catch (error) {
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
