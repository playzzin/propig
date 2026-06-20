export type VideoStudioAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';
export type VideoStudioResolution = '480p' | '720p';
export type VideoStudioClipMode = 'generate' | 'extend' | 'continue' | 'edit' | 'merge';
export type VideoStudioClipStatus = 'ready' | 'processing' | 'failed';
export type VideoStudioJobKind = VideoStudioClipMode | 'extract-frame';
export type VideoStudioProjectStarterSource = 'album' | 'upload';
export type VideoStudioJobStatus =
    | 'queued'
    | 'running'
    | 'uploading'
    | 'completed'
    | 'failed'
    | 'canceled';

export const VIDEO_STUDIO_PROJECTS_COLLECTION = 'video_studio_projects';
export const VIDEO_STUDIO_CLIPS_COLLECTION = 'video_studio_clips';
export const VIDEO_STUDIO_JOBS_COLLECTION = 'video_studio_jobs';

export interface VideoStudioProject {
    id: string;
    userId: string;
    title: string;
    synopsis: string;
    aspectRatio: VideoStudioAspectRatio;
    resolution: VideoStudioResolution;
    starterImageUrl?: string | null;
    starterImageSource?: VideoStudioProjectStarterSource | null;
    starterAlbumId?: string | null;
    starterPhotoId?: string | null;
    starterStoragePath?: string | null;
    clipCount?: number;
    coverClipId?: string | null;
    coverUrl?: string | null;
    createdAt?: unknown;
    updatedAt?: unknown;
}

export interface VideoStudioClip {
    id: string;
    userId: string;
    projectId: string;
    title: string;
    prompt: string;
    mode: VideoStudioClipMode;
    status: VideoStudioClipStatus;
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
    aspectRatio: VideoStudioAspectRatio;
    resolution: VideoStudioResolution;
    createdAt?: unknown;
    updatedAt?: unknown;
}

export interface VideoStudioJob {
    id: string;
    userId: string;
    projectId: string;
    kind: VideoStudioJobKind;
    status: VideoStudioJobStatus;
    title: string;
    prompt?: string;
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
    createdAt?: unknown;
    updatedAt?: unknown;
    claimedAt?: unknown;
    startedAt?: unknown;
    finishedAt?: unknown;
}

export const VIDEO_STUDIO_DEFAULT_ASPECT_RATIO: VideoStudioAspectRatio = '16:9';
export const VIDEO_STUDIO_DEFAULT_RESOLUTION: VideoStudioResolution = '720p';
