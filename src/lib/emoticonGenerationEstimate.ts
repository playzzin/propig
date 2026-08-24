import type { EmoticonResourceMode } from '@/schemas/emoticonStudio';

export type EmoticonEstimateOutputType = 'static' | 'animated';

export function estimateEmoticonAiCalls(
  outputType: EmoticonEstimateOutputType,
  frameCount: number,
  resourceMode: EmoticonResourceMode,
): { min: number; max: number } {
  if (outputType === 'static') return { min: 3, max: 5 };

  const frames = Math.max(2, Math.min(24, Math.round(frameCount)));
  if (resourceMode === 'efficient') return { min: 7, max: frames + 10 };
  if (resourceMode === 'balanced') return { min: frames + 4, max: frames + 10 };
  return { min: frames + 5, max: (frames * 2) + 8 };
}

export function estimateEmoticonImageCallsMax(
  outputType: EmoticonEstimateOutputType,
  frameCount: number,
  resourceMode: EmoticonResourceMode,
): number {
  if (outputType === 'static') return 2;

  const frames = Math.max(2, Math.min(24, Math.round(frameCount)));
  if (resourceMode === 'efficient') return frames + 4;
  if (resourceMode === 'balanced') return frames + 2;
  return (frames * 2) + 2;
}
