import { z } from 'zod';

export const EMOTICON_EXPORT_FORMATS = ['webp', 'gif', 'mp4', 'webm', 'png_zip'] as const;
export const EMOTICON_MOTION_PREFERENCES = ['auto', 'stable', 'dynamic'] as const;
export const EMOTICON_JOB_MODES = ['generate', 'rerender'] as const;
export const EMOTICON_JOB_STATUSES = [
  'queued',
  'analyzing',
  'generating',
  'validating',
  'animating',
  'rendering',
  'completed',
  'failed',
] as const;

export const emoticonExportFormatSchema = z.enum(EMOTICON_EXPORT_FORMATS);
export const emoticonMotionPreferenceSchema = z.enum(EMOTICON_MOTION_PREFERENCES);
export const emoticonJobModeSchema = z.enum(EMOTICON_JOB_MODES);
export const emoticonJobStatusSchema = z.enum(EMOTICON_JOB_STATUSES);

export const emoticonBubbleSchema = z.object({
  text: z.string().max(36),
  style: z.enum(['rounded', 'shout', 'thought', 'whisper', 'none']),
  position: z.enum(['top', 'bottom', 'left', 'right']),
  entrance: z.enum(['pop', 'fade', 'shake', 'none']),
});

export const emoticonPresetSchema = z.object({
  title: z.string().min(1).max(60),
  instruction: z.string().min(1).max(240),
  emotion: z.string().min(1).max(60),
  action: z.string().min(1).max(100),
});

export const emoticonCharacterProfileSchema = z.object({
  summary: z.string().min(1).max(320),
  immutableTraits: z.array(z.string().min(1).max(160)).min(1).max(12),
  palette: z.array(z.string().min(1).max(40)).max(8),
  styleRules: z.array(z.string().min(1).max(160)).min(1).max(12),
  negativeRules: z.array(z.string().min(1).max(160)).min(1).max(12),
});

export const emoticonPlanSchema = z.object({
  directorSummary: z.string().min(1).max(320),
  characterProfile: emoticonCharacterProfileSchema,
  action: z.object({
    title: z.string().min(1).max(80),
    emotion: z.string().min(1).max(60),
    action: z.string().min(1).max(160),
    intensity: z.enum(['subtle', 'normal', 'exaggerated']),
    motionType: z.enum(['bob', 'talk', 'wave', 'jump', 'shake', 'dynamic']),
    renderMode: z.enum(['stable', 'keyframes', 'dynamic']),
    durationMs: z.number().int().min(700).max(3000),
    frameCount: z.number().int().min(8).max(24),
    fps: z.number().int().min(6).max(18),
    loopDescription: z.string().min(1).max(200),
    imagePrompt: z.string().min(20).max(2400),
    videoPrompt: z.string().min(20).max(2400),
    negativePrompt: z.string().min(1).max(1200),
  }),
  bubble: emoticonBubbleSchema,
  suggestedPresets: z.array(emoticonPresetSchema).min(4).max(12),
});

export const emoticonQualitySchema = z.object({
  overall: z.number().min(0).max(100),
  identity: z.number().min(0).max(100),
  actionClarity: z.number().min(0).max(100),
  styleConsistency: z.number().min(0).max(100),
  backgroundClean: z.number().min(0).max(100).default(0),
  singleCharacter: z.boolean().default(false),
  occlusionFree: z.number().min(0).max(100).default(0),
  issues: z.array(z.string().min(1).max(180)).max(8),
  correction: z.string().max(600),
});

export const emoticonAnimationFrameSchema = z.object({
  url: z.string().url(),
  storagePath: z.string().min(1).max(700),
  fileName: z.string().min(1).max(240),
  contentType: z.literal('image/png'),
  sizeBytes: z.number().int().positive().max(30 * 1024 * 1024),
});

export const emoticonOutputSchema = z.object({
  format: emoticonExportFormatSchema,
  url: z.string().url(),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export const emoticonOutputsSchema = z.object({
  webp: emoticonOutputSchema.optional(),
  gif: emoticonOutputSchema.optional(),
  mp4: emoticonOutputSchema.optional(),
  webm: emoticonOutputSchema.optional(),
  png_zip: emoticonOutputSchema.optional(),
});

export const emoticonSpecReportSchema = z.object({
  width: z.literal(360),
  height: z.literal(360),
  frameCount: z.number().int().min(8).max(24),
  fps: z.number().int().min(6).max(18),
  durationMs: z.number().int().min(700).max(3000),
  loop: z.literal(true),
  kakaoCanvasPass: z.boolean(),
  kakaoFramePass: z.boolean(),
});

export const emoticonJobSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  sourceImageUrl: z.string().url(),
  sourceStoragePath: z.string().min(1),
  sourceCanonicalStoragePath: z.string().min(1).optional(),
  sourceFingerprint: z.string().min(1).optional(),
  instruction: z.string().min(1).max(800),
  mode: emoticonJobModeSchema.default('generate'),
  parentJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  motionPreference: emoticonMotionPreferenceSchema,
  formats: z.array(emoticonExportFormatSchema).min(1).max(5),
  status: emoticonJobStatusSchema,
  progress: z.number().int().min(0).max(100),
  statusMessage: z.string().min(1).max(240),
  plan: emoticonPlanSchema.optional(),
  quality: emoticonQualitySchema.optional(),
  keyPoseUrl: z.string().url().optional(),
  keyPoseStoragePath: z.string().min(1).optional(),
  animationFrames: z.array(emoticonAnimationFrameSchema).min(8).max(24).optional(),
  outputs: emoticonOutputsSchema.optional(),
  specReport: emoticonSpecReportSchema.optional(),
  analysisReused: z.boolean().optional(),
  error: z.string().max(1000).nullable().optional(),
  motionFallbackReason: z.string().max(600).nullable().optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
  completedAt: z.unknown().optional(),
});

export type EmoticonExportFormat = z.infer<typeof emoticonExportFormatSchema>;
export type EmoticonMotionPreference = z.infer<typeof emoticonMotionPreferenceSchema>;
export type EmoticonJobMode = z.infer<typeof emoticonJobModeSchema>;
export type EmoticonJobStatus = z.infer<typeof emoticonJobStatusSchema>;
export type EmoticonBubble = z.infer<typeof emoticonBubbleSchema>;
export type EmoticonPreset = z.infer<typeof emoticonPresetSchema>;
export type EmoticonPlan = z.infer<typeof emoticonPlanSchema>;
export type EmoticonQuality = z.infer<typeof emoticonQualitySchema>;
export type EmoticonAnimationFrame = z.infer<typeof emoticonAnimationFrameSchema>;
export type EmoticonOutput = z.infer<typeof emoticonOutputSchema>;
export type EmoticonOutputs = z.infer<typeof emoticonOutputsSchema>;
export type EmoticonJob = z.infer<typeof emoticonJobSchema>;
