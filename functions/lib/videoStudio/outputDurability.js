"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateVideoStudioMergeDuration = estimateVideoStudioMergeDuration;
exports.buildVideoStudioOutputIdentity = buildVideoStudioOutputIdentity;
exports.readStoredVideoRenderMetadata = readStoredVideoRenderMetadata;
exports.readProviderOutputStagingCheckpoint = readProviderOutputStagingCheckpoint;
exports.upsertVideoStudioOutputCheckpoint = upsertVideoStudioOutputCheckpoint;
function normalizedMergeClipDuration(input) {
    var _a, _b, _c;
    if (input.durationSeconds === null || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
        return null;
    }
    const trimStart = Math.min(Math.max(0, (_a = input.trimStartSeconds) !== null && _a !== void 0 ? _a : 0), Math.max(0, input.durationSeconds - 0.1));
    const trimEnd = Math.min(Math.max(0, (_b = input.trimEndSeconds) !== null && _b !== void 0 ? _b : 0), Math.max(0, input.durationSeconds - trimStart - 0.1));
    const playbackRate = Math.min(2, Math.max(0.5, (_c = input.playbackRate) !== null && _c !== void 0 ? _c : 1));
    return Math.max(0.1, (input.durationSeconds - trimStart - trimEnd) / playbackRate);
}
function mergeTransitionDuration(input, outgoingDuration, incomingDuration) {
    var _a;
    if (!input.transitionStyle || input.transitionStyle === 'cut')
        return 0;
    const requested = (_a = input.transitionSeconds) !== null && _a !== void 0 ? _a : 0.35;
    const strategyDuration = input.transitionStyle === 'match-cut'
        ? Math.min(requested, 0.25)
        : input.transitionStyle === 'bridge'
            ? Math.max(requested, 0.5)
            : requested;
    return Math.max(0.08, Math.min(strategyDuration, outgoingDuration / 2, incomingDuration / 2, 1.5));
}
function estimateVideoStudioMergeDuration(inputs) {
    if (inputs.length === 0)
        return null;
    const durations = inputs.map(normalizedMergeClipDuration);
    if (durations.some((duration) => duration === null))
        return null;
    const knownDurations = durations;
    let assembledDuration = knownDurations[0];
    for (let index = 1; index < knownDurations.length; index += 1) {
        assembledDuration += knownDurations[index]
            - mergeTransitionDuration(inputs[index - 1], assembledDuration, knownDurations[index]);
    }
    return Number(assembledDuration.toFixed(3));
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function buildVideoStudioOutputIdentity(params) {
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
function readStoredVideoRenderMetadata(value) {
    const candidate = asRecord(value);
    if (!candidate)
        return null;
    const mode = candidate.mode;
    const audioMode = candidate.audioModeApplied;
    if ((mode !== 'generate' && mode !== 'extend' && mode !== 'edit')
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
        || typeof candidate.lipSyncRequested !== 'boolean') {
        return null;
    }
    return candidate;
}
function readProviderOutputStagingCheckpoint(value) {
    const candidate = asRecord(value);
    const renderResult = readStoredVideoRenderMetadata(candidate === null || candidate === void 0 ? void 0 : candidate.renderResult);
    if (!candidate
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
        || !renderResult) {
        return null;
    }
    return Object.assign(Object.assign({}, candidate), { renderResult });
}
function upsertVideoStudioOutputCheckpoint(value, checkpoint) {
    const current = Array.isArray(value)
        ? value.filter((item) => {
            const candidate = asRecord(item);
            return Boolean(candidate
                && candidate.version === 1
                && typeof candidate.jobId === 'string'
                && typeof candidate.slot === 'string'
                && typeof candidate.clipId === 'string'
                && typeof candidate.videoStoragePath === 'string'
                && typeof candidate.frameStoragePath === 'string'
                && typeof candidate.savedAt === 'string');
        })
        : [];
    return [...current.filter((item) => item.jobId !== checkpoint.jobId || item.slot !== checkpoint.slot), checkpoint];
}
//# sourceMappingURL=outputDurability.js.map