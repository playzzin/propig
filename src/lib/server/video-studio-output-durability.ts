export type StoredVideoRenderMetadata = {
    mode: 'generate' | 'extend' | 'edit';
    requestId: string;
    modelUsed: string;
    keySource: string;
    costUsd?: number;
    selectionSource: 'catalog';
    estimatedCostUsd: number | null;
    resolvedResolution: string;
    durationApplied: number;
    firstFrameApplied: boolean;
    endFrameApplied: boolean;
    visualReferencesApplied: number;
    audioApplied: boolean;
    audioModeApplied: 'silent' | 'ambient' | 'dialogue';
    lipSyncRequested: boolean;
};

export type ProviderOutputStagingCheckpoint = {
    version: 1;
    jobId: string;
    segmentIndex: number;
    storagePath: string;
    contentType: string;
    byteLength: number;
    providerJobId: string;
    status: 'reserved' | 'staged' | 'finalized';
    stagedAt: string;
    finalizedAt?: string;
    clipId?: string;
    renderResult: StoredVideoRenderMetadata;
};

export type VideoStudioOutputCheckpoint = {
    version: 1;
    jobId: string;
    slot: string;
    segmentIndex: number | null;
    clipId: string;
    videoStoragePath: string;
    frameStoragePath: string;
    savedAt: string;
};

export type VideoStudioMergeDurationInput = {
    durationSeconds: number | null;
    trimStartSeconds?: number;
    trimEndSeconds?: number;
    playbackRate?: number;
    transitionStyle?: 'cut' | 'crossfade' | 'match-cut' | 'bridge';
    transitionSeconds?: number;
};

function normalizedMergeClipDuration(input: VideoStudioMergeDurationInput): number | null {
    if (input.durationSeconds === null || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
        return null;
    }
    const trimStart = Math.min(Math.max(0, input.trimStartSeconds ?? 0), Math.max(0, input.durationSeconds - 0.1));
    const trimEnd = Math.min(
        Math.max(0, input.trimEndSeconds ?? 0),
        Math.max(0, input.durationSeconds - trimStart - 0.1),
    );
    const playbackRate = Math.min(2, Math.max(0.5, input.playbackRate ?? 1));
    return Math.max(0.1, (input.durationSeconds - trimStart - trimEnd) / playbackRate);
}

function mergeTransitionDuration(
    input: VideoStudioMergeDurationInput,
    outgoingDuration: number,
    incomingDuration: number,
): number {
    if (!input.transitionStyle || input.transitionStyle === 'cut') return 0;
    const requested = input.transitionSeconds ?? 0.35;
    const strategyDuration = input.transitionStyle === 'match-cut'
        ? Math.min(requested, 0.25)
        : input.transitionStyle === 'bridge'
          ? Math.max(requested, 0.5)
          : requested;
    return Math.max(0.08, Math.min(strategyDuration, outgoingDuration / 2, incomingDuration / 2, 1.5));
}

export function estimateVideoStudioMergeDuration(inputs: VideoStudioMergeDurationInput[]): number | null {
    if (inputs.length === 0) return null;
    const durations = inputs.map(normalizedMergeClipDuration);
    if (durations.some((duration) => duration === null)) return null;

    const knownDurations = durations as number[];
    let assembledDuration = knownDurations[0];
    for (let index = 1; index < knownDurations.length; index += 1) {
        assembledDuration += knownDurations[index]
            - mergeTransitionDuration(inputs[index - 1], assembledDuration, knownDurations[index]);
    }
    return Number(assembledDuration.toFixed(3));
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export function buildVideoStudioOutputIdentity(params: {
    jobId: string;
    userId: string;
    projectId: string;
    segmentIndex: number | 'final';
}) {
    const safeJobId = encodeURIComponent(params.jobId);
    const slot = params.segmentIndex === 'final'
        ? 'final'
        : `segment_${String(params.segmentIndex).padStart(3, '0')}`;
    const outputRoot = `jobs/${safeJobId}/${slot}`;
    const storageRoot = `video_studio/${params.userId}/${params.projectId}`;

    return {
        slot,
        clipId: `job_${safeJobId}_${slot}`,
        videoPathSuffix: `${outputRoot}/video.mp4`,
        frameToken: `${outputRoot}/frame`,
        videoStoragePath: `${storageRoot}/${outputRoot}/video.mp4`,
        frameStoragePath: `${storageRoot}/frames/${outputRoot}/frame.png`,
        stagingPathSuffix: `staging/${outputRoot}/provider.mp4`,
        stagingStoragePath: `${storageRoot}/staging/${outputRoot}/provider.mp4`,
    };
}

export function readStoredVideoRenderMetadata(value: unknown): StoredVideoRenderMetadata | null {
    const candidate = asRecord(value);
    if (!candidate) return null;
    const mode = candidate.mode;
    const audioMode = candidate.audioModeApplied;
    if (
        (mode !== 'generate' && mode !== 'extend' && mode !== 'edit')
        || (audioMode !== 'silent' && audioMode !== 'ambient' && audioMode !== 'dialogue')
        || candidate.selectionSource !== 'catalog'
        || typeof candidate.requestId !== 'string'
        || typeof candidate.modelUsed !== 'string'
        || typeof candidate.keySource !== 'string'
        || (candidate.costUsd !== undefined && typeof candidate.costUsd !== 'number')
        || (candidate.estimatedCostUsd !== null && typeof candidate.estimatedCostUsd !== 'number')
        || typeof candidate.resolvedResolution !== 'string'
        || typeof candidate.durationApplied !== 'number'
        || typeof candidate.firstFrameApplied !== 'boolean'
        || typeof candidate.endFrameApplied !== 'boolean'
        || typeof candidate.visualReferencesApplied !== 'number'
        || typeof candidate.audioApplied !== 'boolean'
        || typeof candidate.lipSyncRequested !== 'boolean'
    ) {
        return null;
    }

    return candidate as StoredVideoRenderMetadata;
}

export function readProviderOutputStagingCheckpoint(value: unknown): ProviderOutputStagingCheckpoint | null {
    const candidate = asRecord(value);
    const renderResult = readStoredVideoRenderMetadata(candidate?.renderResult);
    if (
        !candidate
        || candidate.version !== 1
        || typeof candidate.jobId !== 'string'
        || typeof candidate.segmentIndex !== 'number'
        || !Number.isInteger(candidate.segmentIndex)
        || candidate.segmentIndex < 0
        || typeof candidate.storagePath !== 'string'
        || typeof candidate.contentType !== 'string'
        || typeof candidate.byteLength !== 'number'
        || typeof candidate.providerJobId !== 'string'
        || (candidate.status !== 'reserved' && candidate.status !== 'staged' && candidate.status !== 'finalized')
        || typeof candidate.stagedAt !== 'string'
        || !renderResult
    ) {
        return null;
    }

    return {
        ...candidate,
        renderResult,
    } as ProviderOutputStagingCheckpoint;
}

export function upsertVideoStudioOutputCheckpoint(
    value: unknown,
    checkpoint: VideoStudioOutputCheckpoint,
): VideoStudioOutputCheckpoint[] {
    const current = Array.isArray(value)
        ? value.filter((item): item is VideoStudioOutputCheckpoint => {
              const candidate = asRecord(item);
              return Boolean(
                  candidate
                  && candidate.version === 1
                  && typeof candidate.jobId === 'string'
                  && typeof candidate.slot === 'string'
                  && typeof candidate.clipId === 'string'
                  && typeof candidate.videoStoragePath === 'string'
                  && typeof candidate.frameStoragePath === 'string'
                  && typeof candidate.savedAt === 'string',
              );
          })
        : [];

    return [...current.filter((item) => item.jobId !== checkpoint.jobId || item.slot !== checkpoint.slot), checkpoint];
}
