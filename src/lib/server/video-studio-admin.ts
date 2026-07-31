import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import admin, { db, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import {
    extractVideoFrame,
    mergeVideos,
    type AudioMixPreset,
    type MergeVideoInput,
} from '@/lib/server/ffmpeg';
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

const VIDEO_STUDIO_ACTIVE_JOB_STALE_MS = 12 * 60 * 1000;

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

function timestampMillis(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (!value || typeof value !== 'object') return null;
    const candidate = value as {
        toMillis?: () => number;
        seconds?: number;
    };
    if (typeof candidate.toMillis === 'function') {
        const millis = candidate.toMillis();
        return Number.isFinite(millis) ? millis : null;
    }
    return typeof candidate.seconds === 'number' && Number.isFinite(candidate.seconds)
        ? candidate.seconds * 1000
        : null;
}

function isStalledActiveVideoStudioJob(job: Omit<VideoStudioJob, 'id'>): boolean {
    if (job.status !== 'running' && job.status !== 'uploading') return false;
    const lastActivity = timestampMillis(job.updatedAt) ?? timestampMillis(job.startedAt);
    return lastActivity !== null && Date.now() - lastActivity > VIDEO_STUDIO_ACTIVE_JOB_STALE_MS;
}

function hasResumableProviderVideo(metadata: VideoStudioJob['metadata']): boolean {
    if (!metadata || typeof metadata !== 'object') return false;
    const checkpoint = metadata.providerVideo;
    if (!checkpoint || typeof checkpoint !== 'object') return false;
    const candidate = checkpoint as { jobId?: unknown; status?: unknown };
    return typeof candidate.jobId === 'string'
        && candidate.jobId.length > 0
        && (
            candidate.status === 'pending'
            || candidate.status === 'in_progress'
            || candidate.status === 'completed'
        );
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

function buildFirebaseStorageDownloadUrl(params: {
    bucketName: string;
    path: string;
    downloadToken: string;
}): string {
    const encodedPath = encodeURIComponent(params.path);
    const encodedToken = encodeURIComponent(params.downloadToken);
    return `https://firebasestorage.googleapis.com/v0/b/${params.bucketName}/o/${encodedPath}?alt=media&token=${encodedToken}`;
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
    const downloadToken = randomUUID();

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
    // `clipIds` is the explicit timeline order selected by the caller. A clip
    // can be re-rendered later and therefore have a newer database sequence;
    // sorting by that storage sequence here would silently scramble a final
    // storyboard assembly.
    return Promise.all(
        params.clipIds.map((clipId) =>
            getOwnedClip({ userId: params.userId, clipId, projectId: params.projectId }),
        ),
    );
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

        const currentAttempt = Number(job.attemptCount ?? 0);
        const nextAttempt = hasResumableProviderVideo(job.metadata)
            ? Math.max(1, currentAttempt)
            : currentAttempt + 1;
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
        if (
            (job.status === 'running' || job.status === 'uploading')
            && !isStalledActiveVideoStudioJob(job)
        ) {
            throw new VideoStudioServerError(409, 'Jobs that are already processing cannot be requeued.');
        }

        // A job may already be queued when its Firestore trigger was unavailable.
        // Bump a durable token so the requeue trigger can safely claim it again.
        const queueDispatchToken = randomUUID();
        const metadata = {
            ...(job.metadata || {}),
            queueDispatchToken,
        };
        transaction.update(jobRef, {
            status: 'queued',
            progress: 0,
            message: 'Job requeued and waiting for a processor.',
            metadata,
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
            metadata,
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

    const deletion = await db.runTransaction(async (transaction) => {
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
            deletedMediaUrls: [
                clip.videoUrl,
                clip.posterUrl,
                clip.lastFrameUrl,
            ].filter((value): value is string => typeof value === 'string' && value.length > 0),
        };
    });

    const videoPrefix = videoStudioStoragePrefix(params.userId, deletion.projectId);
    const copiedStoryboardPrefix = `users/${params.userId}/storyboards/`;
    const storagePaths = new Set(
        deletion.deletedMediaUrls.flatMap((url) => {
            const path =
                storagePathFromDownloadUrl(url, videoPrefix) ||
                storagePathFromDownloadUrl(url, copiedStoryboardPrefix);
            return path ? [path] : [];
        }),
    );
    const bucket = getStorageBucket();
    await Promise.all(
        [...storagePaths].map((path) =>
            bucket.file(path).delete({ ignoreNotFound: true }),
        ),
    );

    return {
        projectId: deletion.projectId,
        clipCount: deletion.clipCount,
    };
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
    mergeClipEdits?: Array<({ clipId: string } & Omit<MergeVideoInput, 'url'>)>;
    backgroundMusicUrl?: string;
    audioMixPreset?: AudioMixPreset;
    backgroundMusicVolume?: number;
    sceneAudioVolume?: number;
    audioCrossfadeSeconds?: number;
}): Promise<Buffer> {
    const editsByClipId = new Map((params.mergeClipEdits || []).map((edit) => [edit.clipId, edit]));
    return mergeVideos({
        clips: params.clips.map((clip) => ({
            url: clip.videoUrl,
            ...editsByClipId.get(clip.id),
        })),
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        fps: params.fps,
        backgroundMusicUrl: params.backgroundMusicUrl,
        audioMixPreset: params.audioMixPreset,
        backgroundMusicVolume: params.backgroundMusicVolume,
        sceneAudioVolume: params.sceneAudioVolume,
        audioCrossfadeSeconds: params.audioCrossfadeSeconds,
    });
}

type VideoStudioStorageFile = {
    path: string;
    sizeBytes: number;
    updatedAt: string | null;
    kind: 'video' | 'frame' | 'other';
};

export type OwnedVideoStudioStorageOverview = {
    projectId: string;
    cleanupLocked: boolean;
    activeJobCount: number;
    protectedFileCount: number;
    cleanupCandidateCount: number;
    cleanupCandidateBytes: number;
    cleanupCandidates: VideoStudioStorageFile[];
    truncated: boolean;
};

const VIDEO_STUDIO_STORAGE_PAGE_SIZE = 250;
const ACTIVE_VIDEO_STUDIO_JOB_STATUSES = new Set<VideoStudioJobStatus>([
    'queued',
    'running',
    'uploading',
]);

function videoStudioStoragePrefix(userId: string, projectId: string): string {
    return `video_studio/${userId}/${projectId}/`;
}

function storagePathFromDownloadUrl(value: unknown, prefix: string): string | null {
    if (typeof value !== 'string' || !value) return null;

    try {
        const url = new URL(value);
        const marker = '/o/';
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex >= 0) {
            const decodedPath = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
            return decodedPath.startsWith(prefix) ? decodedPath : null;
        }

        // Older video projects used Google Cloud Storage signed URLs instead
        // of Firebase download-token URLs. Treat either URL shape as a live
        // reference so an existing clip can never be classified as residue.
        const decodedPathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const signedUrlPath = url.hostname === 'storage.googleapis.com'
            ? decodedPathname.replace(/^[^/]+\//, '')
            : url.hostname.endsWith('.storage.googleapis.com')
                ? decodedPathname
                : null;
        return signedUrlPath?.startsWith(prefix) ? signedUrlPath : null;
    } catch {
        return null;
    }
}

function storedFileKind(path: string): VideoStudioStorageFile['kind'] {
    if (path.includes('/clips/')) return 'video';
    if (path.includes('/frames/')) return 'frame';
    return 'other';
}

async function getOwnedVideoStudioStorageSnapshot(params: {
    userId: string;
    projectId: string;
}): Promise<{
    overview: OwnedVideoStudioStorageOverview;
    candidatePaths: Set<string>;
}> {
    ensureAdminReady();
    await getOwnedProject(params.userId, params.projectId);

    const prefix = videoStudioStoragePrefix(params.userId, params.projectId);
    const [clipSnapshot, jobSnapshot] = await Promise.all([
        db.collection(VIDEO_STUDIO_CLIPS_COLLECTION).where('projectId', '==', params.projectId).get(),
        db.collection(VIDEO_STUDIO_JOBS_COLLECTION).where('projectId', '==', params.projectId).get(),
    ]);

    const protectedPaths = new Set<string>();
    const collectPath = (value: unknown) => {
        const path = storagePathFromDownloadUrl(value, prefix);
        if (path) protectedPaths.add(path);
    };

    clipSnapshot.docs.forEach((snapshot) => {
        const clip = snapshot.data() as StoredClip;
        collectPath(clip.videoUrl);
        collectPath(clip.posterUrl);
        collectPath(clip.lastFrameUrl);
        collectPath(clip.sourceVideoUrl);
    });

    let activeJobCount = 0;
    jobSnapshot.docs.forEach((snapshot) => {
        const job = snapshot.data() as Omit<VideoStudioJob, 'id'>;
        collectPath(job.resultVideoUrl);
        collectPath(job.resultFrameUrl);
        if (ACTIVE_VIDEO_STUDIO_JOB_STATUSES.has(job.status)) activeJobCount += 1;
    });

    const bucket = getStorageBucket();
    const [files] = await bucket.getFiles({
        prefix,
        maxResults: VIDEO_STUDIO_STORAGE_PAGE_SIZE,
        autoPaginate: false,
    });
    const truncated = files.length >= VIDEO_STUDIO_STORAGE_PAGE_SIZE;
    const cleanupCandidates = files
        .filter((file) => !protectedPaths.has(file.name))
        .map((file) => {
            const rawSize = Number(file.metadata.size ?? 0);
            return {
                path: file.name,
                sizeBytes: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : 0,
                updatedAt: typeof file.metadata.updated === 'string' ? file.metadata.updated : null,
                kind: storedFileKind(file.name),
            } satisfies VideoStudioStorageFile;
        })
        .sort((left, right) => right.sizeBytes - left.sizeBytes || left.path.localeCompare(right.path));

    return {
        overview: {
            projectId: params.projectId,
            cleanupLocked: activeJobCount > 0,
            activeJobCount,
            protectedFileCount: protectedPaths.size,
            cleanupCandidateCount: cleanupCandidates.length,
            cleanupCandidateBytes: cleanupCandidates.reduce((sum, file) => sum + file.sizeBytes, 0),
            cleanupCandidates,
            truncated,
        },
        candidatePaths: new Set(cleanupCandidates.map((file) => file.path)),
    };
}

export async function getOwnedVideoStudioStorageOverview(params: {
    userId: string;
    projectId: string;
}): Promise<OwnedVideoStudioStorageOverview> {
    const snapshot = await getOwnedVideoStudioStorageSnapshot(params);
    return snapshot.overview;
}

export async function deleteOwnedVideoStudioStorageResiduals(params: {
    userId: string;
    projectId: string;
    storagePaths: string[];
}): Promise<{
    deletedStoragePaths: string[];
    failed: Array<{ storagePath: string; message: string }>;
}> {
    const snapshot = await getOwnedVideoStudioStorageSnapshot(params);
    if (snapshot.overview.cleanupLocked) {
        throw new VideoStudioServerError(
            409,
            'Rendering is still in progress. Finish or cancel active jobs before cleaning up files.',
        );
    }

    const requestedPaths = [...new Set(params.storagePaths)].filter((path) => snapshot.candidatePaths.has(path));
    if (!requestedPaths.length) {
        throw new VideoStudioServerError(400, 'No safe residual files were selected for cleanup.');
    }

    const bucket = getStorageBucket();
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

    return {
        deletedStoragePaths: results.filter((result) => result.deleted).map((result) => result.storagePath),
        failed: results.flatMap((result) => result.deleted || !result.message
            ? []
            : [{ storagePath: result.storagePath, message: result.message }]),
    };
}
