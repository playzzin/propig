"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emoticonMotionReviewSchema = exports.emoticonFrameSequenceSchema = exports.emoticonFrameDirectionSchema = exports.emoticonAnimationFrameSchema = exports.emoticonQualitySchema = exports.emoticonPlanSchema = exports.emoticonCharacterProfileSchema = exports.emoticonPresetSchema = exports.emoticonJobRequestSchema = exports.emoticonBubbleSchema = exports.emoticonJobModeSchema = exports.emoticonMotionPreferenceSchema = exports.emoticonExportFormatSchema = exports.EMOTICON_JOB_MODES = exports.EMOTICON_MOTION_PREFERENCES = exports.EMOTICON_EXPORT_FORMATS = void 0;
const zod_1 = require("zod");
exports.EMOTICON_EXPORT_FORMATS = ['webp', 'gif', 'mp4', 'webm', 'png_zip'];
exports.EMOTICON_MOTION_PREFERENCES = ['auto', 'stable', 'dynamic'];
exports.EMOTICON_JOB_MODES = ['generate', 'rerender'];
exports.emoticonExportFormatSchema = zod_1.z.enum(exports.EMOTICON_EXPORT_FORMATS);
exports.emoticonMotionPreferenceSchema = zod_1.z.enum(exports.EMOTICON_MOTION_PREFERENCES);
exports.emoticonJobModeSchema = zod_1.z.enum(exports.EMOTICON_JOB_MODES);
exports.emoticonBubbleSchema = zod_1.z.object({
    text: zod_1.z.string().max(36),
    style: zod_1.z.enum(['rounded', 'shout', 'thought', 'whisper', 'none']),
    position: zod_1.z.enum(['top', 'bottom', 'left', 'right']),
    entrance: zod_1.z.enum(['pop', 'fade', 'shake', 'none']),
});
exports.emoticonJobRequestSchema = zod_1.z.object({
    id: zod_1.z.string().min(1).optional(),
    userId: zod_1.z.string().min(1).optional(),
    sourceImageUrl: zod_1.z.string().url().refine((value) => value.startsWith('https://'), {
        message: 'Source images must use HTTPS.',
    }),
    sourceStoragePath: zod_1.z.string().min(1).max(500),
    instruction: zod_1.z.string().trim().min(2).max(800),
    motionPreference: exports.emoticonMotionPreferenceSchema.default('auto'),
    formats: zod_1.z.array(exports.emoticonExportFormatSchema).min(1).max(5).default(['webp']),
    mode: exports.emoticonJobModeSchema.default('generate'),
    parentJobId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    renderOverrides: zod_1.z.object({
        bubble: exports.emoticonBubbleSchema.optional(),
    }).optional(),
    status: zod_1.z.literal('queued'),
    progress: zod_1.z.number().int().min(0).max(100).optional(),
    statusMessage: zod_1.z.string().max(240).optional(),
});
exports.emoticonPresetSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(60),
    instruction: zod_1.z.string().min(1).max(240),
    emotion: zod_1.z.string().min(1).max(60),
    action: zod_1.z.string().min(1).max(100),
});
exports.emoticonCharacterProfileSchema = zod_1.z.object({
    summary: zod_1.z.string().min(1).max(320),
    immutableTraits: zod_1.z.array(zod_1.z.string().min(1).max(160)).min(1).max(12),
    palette: zod_1.z.array(zod_1.z.string().min(1).max(40)).max(8),
    styleRules: zod_1.z.array(zod_1.z.string().min(1).max(160)).min(1).max(12),
    negativeRules: zod_1.z.array(zod_1.z.string().min(1).max(160)).min(1).max(12),
});
exports.emoticonPlanSchema = zod_1.z.object({
    directorSummary: zod_1.z.string().min(1).max(320),
    characterProfile: exports.emoticonCharacterProfileSchema,
    action: zod_1.z.object({
        title: zod_1.z.string().min(1).max(80),
        emotion: zod_1.z.string().min(1).max(60),
        action: zod_1.z.string().min(1).max(160),
        intensity: zod_1.z.enum(['subtle', 'normal', 'exaggerated']),
        motionType: zod_1.z.enum(['bob', 'talk', 'wave', 'jump', 'shake', 'dynamic']),
        renderMode: zod_1.z.enum(['stable', 'keyframes', 'dynamic']),
        durationMs: zod_1.z.number().int().min(700).max(3000),
        frameCount: zod_1.z.number().int().min(8).max(24),
        fps: zod_1.z.number().int().min(6).max(18),
        loopDescription: zod_1.z.string().min(1).max(200),
        imagePrompt: zod_1.z.string().min(20).max(2400),
        videoPrompt: zod_1.z.string().min(20).max(2400),
        negativePrompt: zod_1.z.string().min(1).max(1200),
    }),
    bubble: exports.emoticonBubbleSchema,
    suggestedPresets: zod_1.z.array(exports.emoticonPresetSchema).min(4).max(12),
});
exports.emoticonQualitySchema = zod_1.z.object({
    overall: zod_1.z.number().min(0).max(100),
    identity: zod_1.z.number().min(0).max(100),
    actionClarity: zod_1.z.number().min(0).max(100),
    styleConsistency: zod_1.z.number().min(0).max(100),
    backgroundClean: zod_1.z.number().min(0).max(100),
    singleCharacter: zod_1.z.boolean(),
    occlusionFree: zod_1.z.number().min(0).max(100),
    issues: zod_1.z.array(zod_1.z.string().min(1).max(180)).max(8),
    correction: zod_1.z.string().max(600),
});
exports.emoticonAnimationFrameSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    storagePath: zod_1.z.string().min(1).max(700),
    fileName: zod_1.z.string().min(1).max(240),
    contentType: zod_1.z.literal('image/png'),
    sizeBytes: zod_1.z.number().int().positive().max(30 * 1024 * 1024),
});
exports.emoticonFrameDirectionSchema = zod_1.z.object({
    frameIndex: zod_1.z.number().int().min(0).max(23),
    phase: zod_1.z.enum([
        'start',
        'anticipation',
        'action',
        'opposite',
        'follow-through',
        'recovery',
        'loop-return',
    ]),
    posePrompt: zod_1.z.string().min(20).max(700),
    expressionPrompt: zod_1.z.string().min(10).max(400),
    continuityPrompt: zod_1.z.string().min(10).max(400),
});
exports.emoticonFrameSequenceSchema = zod_1.z.object({
    sequenceSummary: zod_1.z.string().min(1).max(320),
    frames: zod_1.z.array(exports.emoticonFrameDirectionSchema).min(8).max(24),
});
exports.emoticonMotionReviewSchema = zod_1.z.object({
    overall: zod_1.z.number().min(0).max(100),
    identity: zod_1.z.number().min(0).max(100),
    actionClarity: zod_1.z.number().min(0).max(100),
    styleConsistency: zod_1.z.number().min(0).max(100),
    limbPoseChange: zod_1.z.number().min(0).max(100),
    facialExpressionChange: zod_1.z.number().min(0).max(100),
    frameConsistency: zod_1.z.number().min(0).max(100),
    loopContinuity: zod_1.z.number().min(0).max(100),
    backgroundClean: zod_1.z.number().min(0).max(100),
    singleCharacter: zod_1.z.boolean(),
    occlusionFree: zod_1.z.number().min(0).max(100),
    cameraOnly: zod_1.z.boolean(),
    problemFrameIndices: zod_1.z.array(zod_1.z.number().int().min(0).max(23)).max(8),
    issues: zod_1.z.array(zod_1.z.string().min(1).max(180)).max(8),
    correction: zod_1.z.string().max(600),
});
//# sourceMappingURL=schema.js.map