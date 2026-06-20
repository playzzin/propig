import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import {
    VIDEO_STUDIO_CLIPS_COLLECTION,
    VIDEO_STUDIO_DEFAULT_ASPECT_RATIO,
    VIDEO_STUDIO_DEFAULT_RESOLUTION,
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
    type VideoStudioProjectStarterSource,
    type VideoStudioResolution,
} from '@/lib/video-studio';

type CreateProjectInput = {
    userId: string;
    title: string;
    synopsis?: string;
    aspectRatio?: VideoStudioAspectRatio;
    resolution?: VideoStudioResolution;
    starterImageUrl?: string | null;
    starterImageSource?: VideoStudioProjectStarterSource | null;
    starterAlbumId?: string | null;
    starterPhotoId?: string | null;
    starterStoragePath?: string | null;
};

type CreateClipInput = {
    userId: string;
    projectId: string;
    title: string;
    prompt: string;
    mode: VideoStudioClipMode;
    status?: VideoStudioClipStatus;
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
    aspectRatio: VideoStudioAspectRatio;
    resolution: VideoStudioResolution;
};

type CreateJobInput = {
    userId: string;
    projectId: string;
    kind: VideoStudioJobKind;
    title: string;
    prompt?: string;
    status?: VideoStudioJobStatus;
    progress?: number | null;
    message?: string | null;
    clipId?: string | null;
    sourceClipId?: string | null;
    mergeSourceClipIds?: string[];
    resultVideoUrl?: string | null;
    resultFrameUrl?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
    startedAt?: string | null;
    finishedAt?: string | null;
};

type CreateClipViaApiInput = Omit<CreateClipInput, 'sequence'> & {
    authToken: string;
};

type CreateClipViaApiResult = {
    success: true;
    clipId: string;
    sequence: number;
};

type RunStudioJobInput = {
    authToken: string;
    operation: VideoStudioJobKind;
    projectId: string;
    clipTitle?: string;
    prompt?: string;
    duration?: number;
    repeatCount?: number;
    autoMergeAfterLoop?: boolean;
    referenceImage?: string;
    continuityNotes?: string;
    cameraNotes?: string;
    subjectLock?: string;
    sourceClipId?: string;
    mergeClipIds?: string[];
    forceRealRun?: boolean;
};

type RunStudioJobResult = {
    success: true;
    jobId: string;
    clipId?: string;
    videoUrl?: string;
    lastFrameUrl?: string;
};

type SubmitStudioJobResult = {
    success: true;
    jobId: string;
    status: 'queued';
};

type UpdateStudioJobResult = {
    success: true;
    jobId: string;
    status: VideoStudioJobStatus;
};

type ResequenceTimelineResult = {
    success: true;
    projectId: string;
    clipCount: number;
};

type DeleteClipResult = {
    success: true;
    projectId: string;
    clipCount: number;
};

export type VideoStudioRuntimeStatus = {
    provider: 'grok';
    devMode: boolean;
    grokApiKeyConfigured: boolean;
    configSource: 'firestore' | 'functions_env' | 'server_env' | 'public_env' | 'none';
    processorSecretConfigured: boolean;
};

type GetVideoStudioRuntimeStatusResult = {
    success: true;
    status: VideoStudioRuntimeStatus;
};

class VideoStudioService {
    async getStudioRuntimeStatus(params: {
        authToken: string;
    }): Promise<VideoStudioRuntimeStatus> {
        const response = await fetch('/api/video-studio/status', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${params.authToken}`,
            },
        });

        const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<GetVideoStudioRuntimeStatusResult>)
            | null;

        if (!response.ok || !payload?.success || !payload.status) {
            throw new Error(payload?.error || 'Failed to load video studio runtime status.');
        }

        return payload.status;
    }

    async createProject(input: CreateProjectInput): Promise<string> {
        const docRef = await addDoc(collection(db, VIDEO_STUDIO_PROJECTS_COLLECTION), {
            userId: input.userId,
            title: input.title.trim(),
            synopsis: input.synopsis?.trim() || '',
            aspectRatio: input.aspectRatio || VIDEO_STUDIO_DEFAULT_ASPECT_RATIO,
            resolution: input.resolution || VIDEO_STUDIO_DEFAULT_RESOLUTION,
            starterImageUrl: input.starterImageUrl || null,
            starterImageSource: input.starterImageSource || null,
            starterAlbumId: input.starterAlbumId || null,
            starterPhotoId: input.starterPhotoId || null,
            starterStoragePath: input.starterStoragePath || null,
            clipCount: 0,
            coverClipId: null,
            coverUrl: input.starterImageUrl || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        return docRef.id;
    }

    async updateProject(projectId: string, data: Partial<VideoStudioProject>): Promise<void> {
        await updateDoc(doc(db, VIDEO_STUDIO_PROJECTS_COLLECTION, projectId), {
            ...data,
            updatedAt: serverTimestamp(),
        });
    }

    async deleteProject(projectId: string): Promise<void> {
        await deleteDoc(doc(db, VIDEO_STUDIO_PROJECTS_COLLECTION, projectId));
    }

    async createClip(input: CreateClipInput): Promise<string> {
        const docRef = await addDoc(collection(db, VIDEO_STUDIO_CLIPS_COLLECTION), {
            userId: input.userId,
            projectId: input.projectId,
            title: input.title.trim(),
            prompt: input.prompt.trim(),
            mode: input.mode,
            status: input.status || 'ready',
            provider: 'grok',
            sequence: input.sequence,
            videoUrl: input.videoUrl,
            posterUrl: input.posterUrl || null,
            lastFrameUrl: input.lastFrameUrl || null,
            continuityNotes: input.continuityNotes || null,
            cameraNotes: input.cameraNotes || null,
            subjectLock: input.subjectLock || null,
            sourceClipId: input.sourceClipId || null,
            sourceVideoUrl: input.sourceVideoUrl || null,
            mergeSourceClipIds: input.mergeSourceClipIds || [],
            duration: input.duration ?? null,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        await updateDoc(doc(db, VIDEO_STUDIO_PROJECTS_COLLECTION, input.projectId), {
            clipCount: input.sequence + 1,
            coverClipId: docRef.id,
            coverUrl: input.posterUrl || input.lastFrameUrl || input.videoUrl,
            updatedAt: serverTimestamp(),
        });

        return docRef.id;
    }

    async createClipViaApi(input: CreateClipViaApiInput): Promise<CreateClipViaApiResult> {
        const response = await fetch('/api/video-studio/clips', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${input.authToken}`,
            },
            body: JSON.stringify({
                userId: input.userId,
                projectId: input.projectId,
                title: input.title,
                prompt: input.prompt,
                mode: input.mode,
                status: input.status,
                videoUrl: input.videoUrl,
                posterUrl: input.posterUrl,
                lastFrameUrl: input.lastFrameUrl,
                continuityNotes: input.continuityNotes,
                cameraNotes: input.cameraNotes,
                subjectLock: input.subjectLock,
                takeGroupId: input.takeGroupId,
                parentTakeClipId: input.parentTakeClipId,
                takeIndex: input.takeIndex,
                sourceClipId: input.sourceClipId,
                sourceVideoUrl: input.sourceVideoUrl,
                mergeSourceClipIds: input.mergeSourceClipIds,
                duration: input.duration,
                aspectRatio: input.aspectRatio,
                resolution: input.resolution,
            }),
        });

        const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<CreateClipViaApiResult>)
            | null;

        if (!response.ok || !payload?.success || !payload.clipId) {
            throw new Error(payload?.error || 'Failed to save clip.');
        }

        return payload as CreateClipViaApiResult;
    }

    async submitStudioJob(input: RunStudioJobInput): Promise<SubmitStudioJobResult> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${input.authToken}`,
        };

        if (input.forceRealRun) {
            headers['x-video-studio-force-real-run'] = 'true';
        }

        const response = await fetch('/api/video-studio/jobs', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                operation: input.operation,
                projectId: input.projectId,
                clipTitle: input.clipTitle,
                prompt: input.prompt,
                duration: input.duration,
                repeatCount: input.repeatCount,
                autoMergeAfterLoop: input.autoMergeAfterLoop,
                referenceImage: input.referenceImage,
                continuityNotes: input.continuityNotes,
                cameraNotes: input.cameraNotes,
                subjectLock: input.subjectLock,
                sourceClipId: input.sourceClipId,
                mergeClipIds: input.mergeClipIds,
            }),
        });

        const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<SubmitStudioJobResult>)
            | null;

        if (!response.ok || !payload?.success || !payload.jobId) {
            throw new Error(payload?.error || 'Failed to queue the video studio job.');
        }

        return payload as SubmitStudioJobResult;
    }

    async processStudioJob(params: {
        authToken: string;
        jobId: string;
    }): Promise<RunStudioJobResult> {
        const response = await fetch('/api/video-studio/jobs/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${params.authToken}`,
            },
            body: JSON.stringify({
                jobId: params.jobId,
            }),
        });

        const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<RunStudioJobResult>)
            | null;

        if (!response.ok || !payload?.success || !payload.jobId) {
            throw new Error(payload?.error || 'Failed to process the queued video studio job.');
        }

        return payload as RunStudioJobResult;
    }

    async updateStudioJob(params: {
        authToken: string;
        jobId: string;
        action: 'requeue' | 'cancel';
    }): Promise<UpdateStudioJobResult> {
        const response = await fetch(`/api/video-studio/jobs/${params.jobId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${params.authToken}`,
            },
            body: JSON.stringify({
                action: params.action,
            }),
        });

        const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<UpdateStudioJobResult>)
            | null;

        if (!response.ok || !payload?.success || !payload.jobId || !payload.status) {
            throw new Error(payload?.error || 'Failed to update the video studio job.');
        }

        return payload as UpdateStudioJobResult;
    }

    async runStudioJob(input: RunStudioJobInput): Promise<RunStudioJobResult> {
        const queued = await this.submitStudioJob(input);
        return this.processStudioJob({
            authToken: input.authToken,
            jobId: queued.jobId,
        });
    }

    async updateClip(clipId: string, data: Partial<VideoStudioClip>): Promise<void> {
        await updateDoc(doc(db, VIDEO_STUDIO_CLIPS_COLLECTION, clipId), {
            ...data,
            updatedAt: serverTimestamp(),
        });
    }

    async deleteClip(params: {
        authToken: string;
        clipId: string;
    }): Promise<DeleteClipResult> {
        const response = await fetch(`/api/video-studio/clips/${params.clipId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${params.authToken}`,
            },
        });

        const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<DeleteClipResult>)
            | null;

        if (!response.ok || !payload?.success || !payload.projectId) {
            throw new Error(payload?.error || 'Failed to delete the selected clip.');
        }

        return payload as DeleteClipResult;
    }

    async createJob(input: CreateJobInput): Promise<string> {
        const docRef = await addDoc(collection(db, VIDEO_STUDIO_JOBS_COLLECTION), {
            userId: input.userId,
            projectId: input.projectId,
            kind: input.kind,
            status: input.status || 'queued',
            title: input.title.trim(),
            prompt: input.prompt?.trim() || '',
            progress: input.progress ?? 0,
            message: input.message || null,
            clipId: input.clipId || null,
            sourceClipId: input.sourceClipId || null,
            mergeSourceClipIds: input.mergeSourceClipIds || [],
            resultVideoUrl: input.resultVideoUrl || null,
            resultFrameUrl: input.resultFrameUrl || null,
            errorMessage: input.errorMessage || null,
            metadata: input.metadata || null,
            startedAt: input.startedAt || null,
            finishedAt: input.finishedAt || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        return docRef.id;
    }

    async updateJob(jobId: string, data: Partial<VideoStudioJob>): Promise<void> {
        await updateDoc(doc(db, VIDEO_STUDIO_JOBS_COLLECTION, jobId), {
            ...data,
            updatedAt: serverTimestamp(),
        });
    }

    async resequenceClips(params: {
        authToken: string;
        projectId: string;
        clipIds: string[];
    }): Promise<ResequenceTimelineResult> {
        const response = await fetch(`/api/video-studio/projects/${params.projectId}/timeline`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${params.authToken}`,
            },
            body: JSON.stringify({
                clipIds: params.clipIds,
            }),
        });

        const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<ResequenceTimelineResult>)
            | null;

        if (!response.ok || !payload?.success || !payload.projectId) {
            throw new Error(payload?.error || 'Failed to reorder the video studio timeline.');
        }

        return payload as ResequenceTimelineResult;
    }
}

export const videoStudioService = new VideoStudioService();
