import { FieldValue } from 'firebase-admin/firestore';
import admin, { db, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import { extractVideoFrame, mergeVideos } from '@/lib/server/ffmpeg';
import {
    VIDEO_STUDIO_CLIPS_COLLECTION,
    VIDEO_STUDIO_JOBS_COLLECTION,
    VIDEO_STUDIO_PROJECTS_COLLECTION,
    type VideoStudioAspectRatio,
    type VideoStudioClip,
    type VideoStudioClipMode,
    type VideoStudioClipStatus,
    type VideoStudioJob,
    type VideoStudioJobKind,
    type VideoStudioJobStatus,
    type VideoStudioProject,
    type VideoStudioResolution,
} from '@/lib/video-studio';

type StoredProject = Omit<VideoStudioProject, 'id'> & { clipCount?: number };
type StoredClip = Omit<VideoStudioClip, 'id'>;

export class VideoStudioServerError extends Error {
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

function ensureAdminReady() {
    const status = getFirebaseAdminStatus();
    if (!status.canPersistToFirestore) {
        throw new VideoStudioServerError(
            500,
            status.message || 'Firebase Admin credentials are not configured.',
        );
    }

    if (!admin.apps.length) {
        throw new VideoStudioServerError(500, 'Firebase Admin is not initialized.');
    }
}

function getStorageBucket() {
    ensureAdminReady();
    return admin.storage().bucket();
}

function getLongLivedExpiryDate() {
    return new Date('2500-03-01T00:00:00.000Z');
}

async function getStorageFileUrl(path: string): Promise<string> {
    const bucket = getStorageBucket();
    const file = bucket.file(path);
    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: getLongLivedExpiryDate(),
    });
    return url;
}

async function fetchRemoteBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new VideoStudioServerError(502, `Failed to download media asset. HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
}

export async function uploadBufferToVideoStudioStorage(params: {
    buffer: Buffer;
    userId: string;
    projectId: string;
    pathSuffix: string;
    contentType: string;
}): Promise<string> {
    const bucket = getStorageBucket();
    const file = bucket.file(`video_studio/${params.userId}/${params.projectId}/${params.pathSuffix}`);

    await file.save(params.buffer, {
        metadata: {
            contentType: params.contentType,
        },
    });

    return getStorageFileUrl(file.name);
}

export async function uploadRemoteFileToVideoStudioStorage(params: {
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

export async function getOwnedProject(userId: string, projectId: string): Promise<VideoStudioProject> {
    ensureAdminReady();

    const snapshot = await db.collection(VIDEO_STUDIO_PROJECTS_COLLECTION).doc(projectId).get();
    if (!snapshot.exists) {
        throw new VideoStudioServerError(404, 'The selected project no longer exists.');
    }

    const project = snapshot.data() as StoredProject;
    if (!project?.userId || project.userId !== userId) {
        throw new VideoStudioServerError(403, 'You do not have access to this project.');
    }

    return {
        id: snapshot.id,
        ...project,
    };
}

export async function getOwnedClip(params: {
    userId: string;
    clipId: string;
    projectId?: string;
}): Promise<VideoStudioClip> {
    ensureAdminReady();

    const snapshot = await db.collection(VIDEO_STUDIO_CLIPS_COLLECTION).doc(params.clipId).get();
    if (!snapshot.exists) {
        throw new VideoStudioServerError(404, 'The selected clip no longer exists.');
    }

    const clip = snapshot.data() as StoredClip;
    if (!clip?.userId || clip.userId !== params.userId) {
        throw new VideoStudioServerError(403, 'You do not have access to this clip.');
    }
    if (params.projectId && clip.projectId !== params.projectId) {
        throw new VideoStudioServerError(400, 'The selected clip does not belong to this project.');
    }

    return {
        id: snapshot.id,
        ...clip,
    };
}

export async function getOwnedClips(params: {
    userId: string;
    clipIds: string[];
    projectId: string;
}): Promise<VideoStudioClip[]> {
    const clips = await Promise.all(
        params.clipIds.map((clipId) =>
            getOwnedClip({ userId: params.userId, clipId, projectId: params.projectId }),
        ),
    );

    return clips.sort((a, b) => a.sequence - b.sequence || String(a.id).localeCompare(String(b.id)));
}

export async function createVideoStudioJob(params: {
    userId: string;
    projectId: string;
    kind: VideoStudioJobKind;
    title: string;
    prompt?: string;
    status?: VideoStudioJobStatus;
    progress?: number;
    message?: string | null;
    sourceClipId?: string | null;
    mergeSourceClipIds?: string[];
    metadata?: Record<string, unknown> | null;
}): Promise<string> {
    ensureAdminReady();

    const docRef = await db.collection(VIDEO_STUDIO_JOBS_COLLECTION).add({
        userId: params.userId,
        projectId: params.projectId,
        kind: params.kind,
        title: params.title.trim(),
        prompt: params.prompt?.trim() || '',
        status: params.status || 'queued',
        progress: params.progress ?? 0,
        message: params.message || null,
        sourceClipId: params.sourceClipId || null,
        mergeSourceClipIds: params.mergeSourceClipIds || [],
        metadata: params.metadata || null,
        clipId: null,
        resultVideoUrl: null,
        resultFrameUrl: null,
        errorMessage: null,
        attemptCount: 0,
        claimedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    return docRef.id;
}

export async function updateVideoStudioJob(
    jobId: string,
    data: Partial<VideoStudioJob>,
): Promise<void> {
    ensureAdminReady();

    await db.collection(VIDEO_STUDIO_JOBS_COLLECTION).doc(jobId).update({
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function getOwnedVideoStudioJob(params: {
    jobId: string;
    userId: string;
}): Promise<VideoStudioJob> {
    ensureAdminReady();

    const snapshot = await db.collection(VIDEO_STUDIO_JOBS_COLLECTION).doc(params.jobId).get();
    if (!snapshot.exists) {
        throw new VideoStudioServerError(404, 'The selected job no longer exists.');
    }

    const job = snapshot.data() as Omit<VideoStudioJob, 'id'>;
    if (!job?.userId || job.userId !== params.userId) {
        throw new VideoStudioServerError(403, 'You do not have access to this job.');
    }

    return {
        id: snapshot.id,
        ...job,
    };
}

export async function getVideoStudioJob(jobId: string): Promise<VideoStudioJob> {
    ensureAdminReady();

    const snapshot = await db.collection(VIDEO_STUDIO_JOBS_COLLECTION).doc(jobId).get();
    if (!snapshot.exists) {
        throw new VideoStudioServerError(404, 'The selected job no longer exists.');
    }

    const job = snapshot.data() as Omit<VideoStudioJob, 'id'>;
    return {
        id: snapshot.id,
        ...job,
    };
}

export async function claimVideoStudioJobForProcessing(params: {
    jobId: string;
    userId: string;
}): Promise<VideoStudioJob> {
    ensureAdminReady();

    const jobRef = db.collection(VIDEO_STUDIO_JOBS_COLLECTION).doc(params.jobId);
    const claimed = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) {
            throw new VideoStudioServerError(404, 'The selected job no longer exists.');
        }

        const job = snapshot.data() as Omit<VideoStudioJob, 'id'>;
        if (!job?.userId || job.userId !== params.userId) {
            throw new VideoStudioServerError(403, 'You do not have access to this job.');
        }

        if (job.status === 'running' || job.status === 'uploading') {
            throw new VideoStudioServerError(409, 'This job is already being processed.');
        }
        if (job.status === 'completed') {
            throw new VideoStudioServerError(409, 'This job has already completed.');
        }
        if (job.status === 'canceled') {
            throw new VideoStudioServerError(409, 'Canceled jobs cannot be processed.');
        }

        const nextAttempt = Number(job.attemptCount ?? 0) + 1;
        transaction.update(jobRef, {
            status: 'running',
            progress: 8,
            message: 'Preparing project assets on the server.',
            attemptCount: nextAttempt,
            claimedAt: FieldValue.serverTimestamp(),
            startedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            errorMessage: null,
        });

        return {
            id: snapshot.id,
            ...job,
            status: 'running',
            progress: 8,
            message: 'Preparing project assets on the server.',
            attemptCount: nextAttempt,
        } satisfies VideoStudioJob;
    });

    return claimed;
}

export async function requeueOwnedVideoStudioJob(params: {
    jobId: string;
    userId: string;
}): Promise<VideoStudioJob> {
    ensureAdminReady();

    const jobRef = db.collection(VIDEO_STUDIO_JOBS_COLLECTION).doc(params.jobId);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) {
            throw new VideoStudioServerError(404, 'The selected job no longer exists.');
        }

        const job = snapshot.data() as Omit<VideoStudioJob, 'id'>;
        if (!job?.userId || job.userId !== params.userId) {
            throw new VideoStudioServerError(403, 'You do not have access to this job.');
        }
        if (job.status === 'completed') {
            throw new VideoStudioServerError(409, 'Completed jobs cannot be requeued.');
        }
        if (job.status === 'running' || job.status === 'uploading') {
            throw new VideoStudioServerError(409, 'Jobs that are already processing cannot be requeued.');
        }

        transaction.update(jobRef, {
            status: 'queued',
            progress: 0,
            message: 'Job requeued and waiting for a processor.',
            errorMessage: null,
            claimedAt: null,
            startedAt: null,
            finishedAt: null,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return {
            id: snapshot.id,
            ...job,
            status: 'queued',
            progress: 0,
            message: 'Job requeued and waiting for a processor.',
            errorMessage: null,
            claimedAt: null,
            startedAt: null,
            finishedAt: null,
        };
    });
}

export async function cancelOwnedVideoStudioJob(params: {
    jobId: string;
    userId: string;
}): Promise<VideoStudioJob> {
    ensureAdminReady();

    const jobRef = db.collection(VIDEO_STUDIO_JOBS_COLLECTION).doc(params.jobId);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) {
            throw new VideoStudioServerError(404, 'The selected job no longer exists.');
        }

        const job = snapshot.data() as Omit<VideoStudioJob, 'id'>;
        if (!job?.userId || job.userId !== params.userId) {
            throw new VideoStudioServerError(403, 'You do not have access to this job.');
        }
        if (job.status === 'completed') {
            throw new VideoStudioServerError(409, 'Completed jobs cannot be canceled.');
        }
        if (job.status === 'running' || job.status === 'uploading') {
            throw new VideoStudioServerError(409, 'Jobs that are already processing cannot be canceled.');
        }
        if (job.status === 'canceled') {
            throw new VideoStudioServerError(409, 'This job is already canceled.');
        }

        transaction.update(jobRef, {
            status: 'canceled',
            message: 'Job canceled before processing.',
            updatedAt: FieldValue.serverTimestamp(),
            finishedAt: FieldValue.serverTimestamp(),
        });

        return {
            id: snapshot.id,
            ...job,
            status: 'canceled',
            message: 'Job canceled before processing.',
        };
    });
}

function computeNextClipSequenceFromSnapshot(
    querySnapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>,
): number {
    let highest = -1;
    for (const doc of querySnapshot.docs) {
        const sequence = Number((doc.data() as StoredClip).sequence ?? -1);
        if (Number.isFinite(sequence) && sequence > highest) {
            highest = sequence;
        }
    }

    return highest + 1;
}

function sortStoredClips<T extends { id: string; sequence?: number | null }>(clips: T[]): T[] {
    return [...clips].sort(
        (a, b) => Number(a.sequence ?? -1) - Number(b.sequence ?? -1) || String(a.id).localeCompare(String(b.id)),
    );
}

function resolveStoredClipCover(clip?: {
    posterUrl?: string | null;
    lastFrameUrl?: string | null;
    videoUrl?: string | null;
} | null): string | null {
    if (!clip) {
        return null;
    }

    return clip.posterUrl || clip.lastFrameUrl || clip.videoUrl || null;
}

export async function createVideoStudioClipRecord(params: {
    userId: string;
    projectId: string;
    title: string;
    prompt: string;
    mode: VideoStudioClipMode;
    status?: VideoStudioClipStatus;
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
    aspectRatio: VideoStudioAspectRatio;
    resolution: VideoStudioResolution;
}): Promise<{ clipId: string; sequence: number }> {
    ensureAdminReady();

    const projectRef = db.collection(VIDEO_STUDIO_PROJECTS_COLLECTION).doc(params.projectId);
    const clipRef = db.collection(VIDEO_STUDIO_CLIPS_COLLECTION).doc();

    const result = await db.runTransaction(async (transaction) => {
        const clipsQuery = db
            .collection(VIDEO_STUDIO_CLIPS_COLLECTION)
            .where('projectId', '==', params.projectId);

        const [projectDoc, clipDocs] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(clipsQuery),
        ]);
        if (!projectDoc.exists) {
            throw new VideoStudioServerError(404, 'The selected project no longer exists.');
        }

        const project = projectDoc.data() as StoredProject;
        if (!project?.userId || project.userId !== params.userId) {
            throw new VideoStudioServerError(403, 'You do not have permission to add clips to this project.');
        }

        const nextSequence = computeNextClipSequenceFromSnapshot(clipDocs);
        const normalizedTakeGroupId = params.takeGroupId || null;
        let resolvedTakeIndex: number | null = params.takeIndex ?? null;

        if (normalizedTakeGroupId && !resolvedTakeIndex) {
            let highestTakeIndex = 1;
            for (const doc of clipDocs.docs) {
                const clip = doc.data() as StoredClip;
                if (doc.id === normalizedTakeGroupId) {
                    highestTakeIndex = Math.max(highestTakeIndex, 1);
                    continue;
                }

                if (clip.takeGroupId === normalizedTakeGroupId) {
                    const clipTakeIndex = Number(clip.takeIndex ?? 1);
                    if (Number.isFinite(clipTakeIndex) && clipTakeIndex > highestTakeIndex) {
                        highestTakeIndex = clipTakeIndex;
                    }
                }
            }

            resolvedTakeIndex = highestTakeIndex + 1;
        }

        transaction.set(clipRef, {
            userId: params.userId,
            projectId: params.projectId,
            title: params.title.trim(),
            prompt: params.prompt.trim(),
            mode: params.mode,
            status: params.status || 'ready',
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
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(projectRef, {
            clipCount: nextSequence + 1,
            coverClipId: clipRef.id,
            coverUrl: params.posterUrl || params.lastFrameUrl || params.videoUrl,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return {
            clipId: clipRef.id,
            sequence: nextSequence,
        };
    });

    return result;
}

export async function resequenceOwnedProjectClips(params: {
    userId: string;
    projectId: string;
    orderedClipIds: string[];
}): Promise<{ clipCount: number }> {
    ensureAdminReady();

    if (params.orderedClipIds.length === 0) {
        throw new VideoStudioServerError(400, 'A timeline reorder requires at least one clip.');
    }

    const uniqueClipIds = new Set(params.orderedClipIds);
    if (uniqueClipIds.size !== params.orderedClipIds.length) {
        throw new VideoStudioServerError(400, 'Timeline reorder payload contains duplicate clip ids.');
    }

    const projectRef = db.collection(VIDEO_STUDIO_PROJECTS_COLLECTION).doc(params.projectId);

    return db.runTransaction(async (transaction) => {
        const clipsQuery = db
            .collection(VIDEO_STUDIO_CLIPS_COLLECTION)
            .where('projectId', '==', params.projectId);

        const [projectDoc, clipDocs] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(clipsQuery),
        ]);

        if (!projectDoc.exists) {
            throw new VideoStudioServerError(404, 'The selected project no longer exists.');
        }

        const project = projectDoc.data() as StoredProject;
        if (!project?.userId || project.userId !== params.userId) {
            throw new VideoStudioServerError(403, 'You do not have permission to reorder this project timeline.');
        }

        const clipIdsInProject = clipDocs.docs.map((doc) => doc.id);
        if (clipIdsInProject.length !== params.orderedClipIds.length) {
            throw new VideoStudioServerError(400, 'Timeline reorder payload must include every clip in the project exactly once.');
        }

        const clipIdsInProjectSet = new Set(clipIdsInProject);
        const hasUnknownClip = params.orderedClipIds.some((clipId) => !clipIdsInProjectSet.has(clipId));
        if (hasUnknownClip) {
            throw new VideoStudioServerError(400, 'Timeline reorder payload includes a clip outside this project.');
        }

        const clipById = new Map(
            clipDocs.docs.map((doc) => [doc.id, doc.data() as StoredClip] satisfies [string, StoredClip]),
        );

        params.orderedClipIds.forEach((clipId, index) => {
            transaction.update(db.collection(VIDEO_STUDIO_CLIPS_COLLECTION).doc(clipId), {
                sequence: index,
                updatedAt: FieldValue.serverTimestamp(),
            });
        });

        const coverClipId = params.orderedClipIds[params.orderedClipIds.length - 1] || null;
        const coverClip = coverClipId ? clipById.get(coverClipId) || null : null;

        transaction.update(projectRef, {
            clipCount: params.orderedClipIds.length,
            coverClipId,
            coverUrl: resolveStoredClipCover(coverClip) || project.starterImageUrl || null,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return {
            clipCount: params.orderedClipIds.length,
        };
    });
}

export async function deleteOwnedProjectClip(params: {
    userId: string;
    clipId: string;
}): Promise<{ projectId: string; clipCount: number }> {
    ensureAdminReady();

    const clipRef = db.collection(VIDEO_STUDIO_CLIPS_COLLECTION).doc(params.clipId);

    return db.runTransaction(async (transaction) => {
        const clipDoc = await transaction.get(clipRef);
        if (!clipDoc.exists) {
            throw new VideoStudioServerError(404, 'The selected clip no longer exists.');
        }

        const clip = clipDoc.data() as StoredClip;
        if (!clip?.userId || clip.userId !== params.userId) {
            throw new VideoStudioServerError(403, 'You do not have access to this clip.');
        }

        const projectRef = db.collection(VIDEO_STUDIO_PROJECTS_COLLECTION).doc(clip.projectId);
        const clipsQuery = db
            .collection(VIDEO_STUDIO_CLIPS_COLLECTION)
            .where('projectId', '==', clip.projectId);

        const [projectDoc, clipDocs] = await Promise.all([
            transaction.get(projectRef),
            transaction.get(clipsQuery),
        ]);

        if (!projectDoc.exists) {
            throw new VideoStudioServerError(404, 'The selected project no longer exists.');
        }

        const project = projectDoc.data() as StoredProject;
        if (!project?.userId || project.userId !== params.userId) {
            throw new VideoStudioServerError(403, 'You do not have permission to update this project.');
        }

        const remainingClips = sortStoredClips(
            clipDocs.docs
                .filter((doc) => doc.id !== params.clipId)
                .map((doc) => ({
                    id: doc.id,
                    ...(doc.data() as StoredClip),
                })),
        );

        remainingClips.forEach((remainingClip, index) => {
            transaction.update(db.collection(VIDEO_STUDIO_CLIPS_COLLECTION).doc(remainingClip.id), {
                sequence: index,
                updatedAt: FieldValue.serverTimestamp(),
            });
        });

        const coverClip = remainingClips[remainingClips.length - 1] || null;

        transaction.delete(clipRef);
        transaction.update(projectRef, {
            clipCount: remainingClips.length,
            coverClipId: coverClip?.id || null,
            coverUrl: resolveStoredClipCover(coverClip) || project.starterImageUrl || null,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return {
            projectId: clip.projectId,
            clipCount: remainingClips.length,
        };
    });
}

export async function extractAndStoreLastFrame(params: {
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

export async function ensureStoredLastFrame(params: {
    clip: VideoStudioClip;
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

    await db.collection(VIDEO_STUDIO_CLIPS_COLLECTION).doc(params.clip.id).update({
        lastFrameUrl,
        posterUrl: lastFrameUrl,
        updatedAt: FieldValue.serverTimestamp(),
    });

    return lastFrameUrl;
}

export async function mergeVideoStudioClips(params: {
    clips: VideoStudioClip[];
    aspectRatio: VideoStudioAspectRatio;
    resolution: VideoStudioResolution;
    fps?: number;
}): Promise<Buffer> {
    return mergeVideos({
        clips: params.clips.map((clip) => ({ url: clip.videoUrl })),
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        fps: params.fps,
    });
}
