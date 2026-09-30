import { z } from 'zod';

export const EMOTICON_ANIMATION_MIN_FRAMES = 2;
export const EMOTICON_ANIMATION_MAX_FRAMES = 16;

export const EmoticonAnimationFrameSchema = z.object({
  order: z.number().int().min(1).max(EMOTICON_ANIMATION_MAX_FRAMES),
  phase: z.string().trim().min(1).max(80),
  pose: z.string().trim().min(10).max(700),
  expression: z.string().trim().max(160).default(''),
  bodyDirection: z.string().trim().max(160).default(''),
  rotationDegrees: z.number().min(-1080).max(1080).default(0),
  limbPositions: z.string().trim().max(400).default(''),
  dialogue: z.string().trim().max(60).default(''),
  effects: z.string().trim().max(240).default(''),
  durationMs: z.number().int().min(60).max(3000),
  continuityNotes: z.string().trim().min(1).max(400),
  imagePrompt: z.string().trim().min(40).max(1800),
}).strict();

export const EmoticonAnimationPresetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40).default('사용자 연출'),
  summary: z.string().trim().min(10).max(700),
  dialogue: z.string().trim().max(120).default(''),
  fps: z.number().int().min(1).max(24),
  loop: z.boolean(),
  loopGuide: z.string().trim().min(1).max(400),
  frames: z.array(EmoticonAnimationFrameSchema)
    .min(EMOTICON_ANIMATION_MIN_FRAMES)
    .max(EMOTICON_ANIMATION_MAX_FRAMES),
}).strict().superRefine((preset, context) => {
  if (preset.frames.length !== new Set(preset.frames.map((frame) => frame.order)).size) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['frames'], message: '프레임 순서가 중복되었습니다.' });
  }
  const expected = preset.frames.map((_, index) => index + 1);
  const actual = [...preset.frames].sort((a, b) => a.order - b.order).map((frame) => frame.order);
  if (actual.some((order, index) => order !== expected[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['frames'], message: '프레임 순서는 1부터 빠짐없이 이어져야 합니다.' });
  }
  if (preset.frames.reduce((total, frame) => total + frame.durationMs, 0) > 20_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['frames'], message: '전체 재생 시간은 20초 이하여야 합니다.' });
  }
});

export const EmoticonAnimationPlanRequestSchema = z.object({
  operationId: z.string().uuid(),
  consentFingerprint: z.string().trim().min(8).max(128),
  actionDescription: z.string().trim().min(2).max(600),
  characterDescription: z.string().trim().max(800).default(''),
  frameCount: z.number().int().min(EMOTICON_ANIMATION_MIN_FRAMES).max(EMOTICON_ANIMATION_MAX_FRAMES),
  fps: z.number().int().min(1).max(24).default(8),
  loop: z.boolean().default(true),
  camera: z.string().trim().max(200).default('고정 카메라, 전신이 잘리지 않는 정면 중심 구도'),
  background: z.string().trim().max(200).default('투명 또는 단순한 단색 배경'),
  dialogue: z.string().trim().max(120).default(''),
}).strict();

export type EmoticonAnimationFramePlan = z.infer<typeof EmoticonAnimationFrameSchema>;
export type EmoticonAnimationPresetPlan = z.infer<typeof EmoticonAnimationPresetSchema>;
export type EmoticonAnimationPlanRequest = z.infer<typeof EmoticonAnimationPlanRequestSchema>;

export function stripJsonCodeFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export function parseEmoticonAnimationPresetJson(value: string): EmoticonAnimationPresetPlan {
  const parsed: unknown = JSON.parse(stripJsonCodeFence(value));
  const hasForbiddenKey = (entry: unknown): boolean => {
    if (!entry || typeof entry !== 'object') return false;
    if (Array.isArray(entry)) return entry.some(hasForbiddenKey);
    return Object.keys(entry).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key) || hasForbiddenKey((entry as Record<string, unknown>)[key]));
  };
  if (hasForbiddenKey(parsed)) throw new Error('허용되지 않은 JSON 키가 있습니다.');
  return EmoticonAnimationPresetSchema.parse(parsed);
}
