import type { EmoticonBubble, EmoticonJob } from '@/schemas/emoticonStudio';
import type { EmoticonAnimationTimeline } from '@/schemas/emoticonStudioV2';

type EmoticonTimelineLoopMode = EmoticonAnimationTimeline['playback']['loopMode'];

const MIN_FRAME_DURATION_MS = 40;
const MAX_FRAME_DURATION_MS = 2_000;

function stableHash(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`;
}

function deterministicId(prefix: string, value: string): string {
  return `${prefix}_${stableHash(value)}`;
}

export function getEmoticonJobTimelineId(jobId: string): string {
  return deterministicId('timeline', jobId);
}

function clampFrameDuration(value: number): number {
  return Math.min(MAX_FRAME_DURATION_MS, Math.max(MIN_FRAME_DURATION_MS, Math.round(value)));
}

function distributeDuration(totalDurationMs: number, frameCount: number): number[] {
  const safeTotal = Math.min(
    frameCount * MAX_FRAME_DURATION_MS,
    Math.max(frameCount * MIN_FRAME_DURATION_MS, Math.round(totalDurationMs)),
  );
  const baseDuration = Math.floor(safeTotal / frameCount);
  const remainder = safeTotal - (baseDuration * frameCount);
  return Array.from(
    { length: frameCount },
    (_, index) => baseDuration + (index < remainder ? 1 : 0),
  );
}

function resolveFrameDurations(job: EmoticonJob, frameCount: number): number[] {
  const renderDurations = job.renderOverrides?.frameDurationsMs;
  if (renderDurations?.length === frameCount) {
    return renderDurations.map(clampFrameDuration);
  }
  const manualDurations = job.manualImportReport?.frameDurationsMs;
  if (manualDurations?.length === frameCount) {
    return manualDurations.map(clampFrameDuration);
  }

  const totalDurationCandidates = [
    job.specReport?.actual?.durationMs,
    job.specReport?.durationMs,
    job.plan?.action.durationMs,
    job.renderOverrides?.motion?.durationMs,
    job.motionOverride?.durationMs,
  ];
  const totalDurationMs = totalDurationCandidates.find((value): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
  )) || frameCount * 125;
  return distributeDuration(totalDurationMs, frameCount);
}

function resolveBubbleRange(
  bubble: EmoticonBubble,
  frameCount: number,
): { startFrame: number; endFrame: number } {
  const lastFrame = frameCount - 1;
  const timeline = bubble.timeline;
  if (timeline.mode === 'intro') {
    return {
      startFrame: 0,
      endFrame: Math.min(lastFrame, timeline.endFrame ?? Math.max(0, Math.ceil(frameCount * 0.35) - 1)),
    };
  }
  if (timeline.mode === 'outro') {
    return {
      startFrame: Math.min(
        lastFrame,
        timeline.startFrame > 0 ? timeline.startFrame : Math.floor(frameCount * 0.65),
      ),
      endFrame: Math.min(lastFrame, timeline.endFrame ?? lastFrame),
    };
  }
  if (timeline.mode === 'range') {
    return {
      startFrame: Math.min(lastFrame, timeline.startFrame),
      endFrame: Math.min(lastFrame, timeline.endFrame ?? lastFrame),
    };
  }
  return { startFrame: 0, endFrame: lastFrame };
}

function resolveTextCues(job: EmoticonJob, frameCount: number) {
  const bubble = job.renderOverrides?.bubble || job.bubbleOverride || job.plan?.bubble;
  if (!bubble || bubble.style === 'none') return [];

  const cues = bubble.timeline.cues.flatMap((cue) => {
    if (cue.startFrame >= frameCount) return [];
    return [{
      ...cue,
      endFrame: Math.min(frameCount - 1, cue.endFrame),
    }];
  });
  if (cues.length || bubble.timeline.mode === 'cues' || !bubble.text.trim()) return cues;

  const range = resolveBubbleRange(bubble, frameCount);
  if (range.startFrame > range.endFrame) return [];
  return [{
    id: deterministicId('cue', `${job.id}\u0000${bubble.text}\u0000${range.startFrame}\u0000${range.endFrame}`),
    text: bubble.text.trim(),
    ...range,
  }];
}

function resolveLoopMode(
  job: EmoticonJob,
  requestedLoopMode?: EmoticonTimelineLoopMode,
): EmoticonTimelineLoopMode {
  if (job.specReport?.actual?.loop === false || job.specReport?.loop === false) return 'none';
  return requestedLoopMode || 'loop';
}

export function buildEmoticonAnimationTimelineFromJob(params: {
  projectId: string;
  itemId: string;
  job: EmoticonJob;
  loopMode?: EmoticonTimelineLoopMode;
}): EmoticonAnimationTimeline | null {
  const { job } = params;
  if (
    job.status !== 'completed'
    || (job.projectId && job.projectId !== params.projectId)
    || (job.projectItemId && job.projectItemId !== params.itemId)
    || job.outputProfile?.type === 'static'
  ) return null;

  const usesCompositedFrames = Boolean(job.compositedFrames?.length);
  const sourceFrames = usesCompositedFrames ? job.compositedFrames : job.animationFrames;
  if (!sourceFrames || sourceFrames.length < 2) return null;

  const frameDurations = resolveFrameDurations(job, sourceFrames.length);
  const editRecipe = job.editRecipe || job.renderOverrides?.editRecipe;
  const loopMode = resolveLoopMode(job, params.loopMode);
  const requestedLoopCount = job.outputProfile?.loopCount ?? 0;
  const loopCount = loopMode === 'none'
    ? 1
    : Math.min(4, Math.max(0, Math.round(requestedLoopCount)));

  return {
    schemaVersion: 1,
    id: getEmoticonJobTimelineId(job.id),
    projectId: params.projectId,
    itemId: params.itemId,
    revision: 0,
    frames: sourceFrames.map((frame, index) => ({
      id: deterministicId('frame', `${job.id}\u0000${index}\u0000${frame.storagePath}`),
      assetId: deterministicId(
        'frame_asset',
        `${usesCompositedFrames ? 'composited' : 'animation'}\u0000${frame.storagePath}`,
      ),
      sourceJobId: job.id,
      sourceFrameIndex: index,
      durationMs: frameDurations[index] || MIN_FRAME_DURATION_MS,
      transform: {
        x: 0,
        y: 0,
        scale: 1,
        rotationDeg: 0,
        flipX: false,
      },
      ...(editRecipe ? { editRecipe } : {}),
    })),
    playback: { loopMode, loopCount },
    textTrack: { cues: resolveTextCues(job, sourceFrames.length) },
  };
}

export function getEmoticonAnimationTimelineContentSignature(
  timeline: EmoticonAnimationTimeline,
): string {
  return JSON.stringify({
    projectId: timeline.projectId,
    itemId: timeline.itemId,
    frames: timeline.frames,
    playback: timeline.playback,
    textTrack: timeline.textTrack,
  });
}
