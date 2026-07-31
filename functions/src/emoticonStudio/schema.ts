import { z } from 'zod';

export const EMOTICON_EXPORT_FORMATS = ['webp', 'gif', 'mp4', 'webm', 'png_zip'] as const;
export const EMOTICON_MOTION_PREFERENCES = ['auto', 'stable', 'dynamic'] as const;
export const EMOTICON_JOB_MODES = ['generate', 'rerender'] as const;

export const emoticonExportFormatSchema = z.enum(EMOTICON_EXPORT_FORMATS);
export const emoticonMotionPreferenceSchema = z.enum(EMOTICON_MOTION_PREFERENCES);
export const emoticonJobModeSchema = z.enum(EMOTICON_JOB_MODES);

export const emoticonBubbleSchema = z.object({
    text: z.string().max(36),
    style: z.enum(['rounded', 'shout', 'thought', 'whisper', 'none']),
    position: z.enum(['top', 'bottom', 'left', 'right']),
    entrance: z.enum(['pop', 'fade', 'shake', 'none']),
});

export const emoticonJobRequestSchema = z.object({
    id: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    sourceImageUrl: z.string().url().refine((value) => value.startsWith('https://'), {
        message: 'Source images must use HTTPS.',
    }),
    sourceStoragePath: z.string().min(1).max(500),
    instruction: z.string().trim().min(2).max(800),
    motionPreference: emoticonMotionPreferenceSchema.default('auto'),
    formats: z.array(emoticonExportFormatSchema).min(1).max(5).default(['webp']),
    mode: emoticonJobModeSchema.default('generate'),
    parentJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    renderOverrides: z.object({
        bubble: emoticonBubbleSchema.optional(),
    }).optional(),
    status: z.literal('queued'),
    progress: z.number().int().min(0).max(100).optional(),
    statusMessage: z.string().max(240).optional(),
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
    backgroundClean: z.number().min(0).max(100),
    singleCharacter: z.boolean(),
    occlusionFree: z.number().min(0).max(100),
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

export const emoticonFrameDirectionSchema = z.object({
    frameIndex: z.number().int().min(0).max(23),
    phase: z.enum([
        'start',
        'anticipation',
        'action',
        'opposite',
        'follow-through',
        'recovery',
        'loop-return',
    ]),
    posePrompt: z.string().min(20).max(700),
    expressionPrompt: z.string().min(10).max(400),
    continuityPrompt: z.string().min(10).max(400),
});

export const emoticonFrameSequenceSchema = z.object({
    sequenceSummary: z.string().min(1).max(320),
    frames: z.array(emoticonFrameDirectionSchema).min(8).max(24),
});

export const emoticonMotionReviewSchema = z.object({
    overall: z.number().min(0).max(100),
    identity: z.number().min(0).max(100),
    actionClarity: z.number().min(0).max(100),
    styleConsistency: z.number().min(0).max(100),
    limbPoseChange: z.number().min(0).max(100),
    facialExpressionChange: z.number().min(0).max(100),
    frameConsistency: z.number().min(0).max(100),
    loopContinuity: z.number().min(0).max(100),
    backgroundClean: z.number().min(0).max(100),
    singleCharacter: z.boolean(),
    occlusionFree: z.number().min(0).max(100),
    cameraOnly: z.boolean(),
    problemFrameIndices: z.array(z.number().int().min(0).max(23)).max(8),
    issues: z.array(z.string().min(1).max(180)).max(8),
    correction: z.string().max(600),
});

export type EmoticonExportFormat = z.infer<typeof emoticonExportFormatSchema>;
export type EmoticonJobRequest = z.infer<typeof emoticonJobRequestSchema>;
export type EmoticonCharacterProfile = z.infer<typeof emoticonCharacterProfileSchema>;
export type EmoticonPreset = z.infer<typeof emoticonPresetSchema>;
export type EmoticonPlan = z.infer<typeof emoticonPlanSchema>;
export type EmoticonQuality = z.infer<typeof emoticonQualitySchema>;
export type EmoticonAnimationFrame = z.infer<typeof emoticonAnimationFrameSchema>;
export type EmoticonFrameDirection = z.infer<typeof emoticonFrameDirectionSchema>;
export type EmoticonFrameSequence = z.infer<typeof emoticonFrameSequenceSchema>;
export type EmoticonMotionReview = z.infer<typeof emoticonMotionReviewSchema>;
