"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emoticonManualStoredPlanSchema = exports.emoticonPlanSchema = exports.emoticonCharacterSheetPlanSchema = exports.emoticonCharacterSheetItemSchema = exports.emoticonCharacterAnalysisSchema = exports.emoticonCharacterProfileSchema = exports.emoticonPresetSchema = exports.emoticonJobRequestSchema = exports.emoticonBatchSchema = exports.emoticonBatchRetrySkippedItemSchema = exports.emoticonBatchRetryTargetSchema = exports.emoticonBatchRetryExclusionReasonSchema = exports.emoticonBatchItemSchema = exports.emoticonBatchCountsSchema = exports.emoticonManualFrameImportReportSchema = exports.emoticonManualFrameImportSchema = exports.emoticonFrameTransitionSchema = exports.EMOTICON_FRAME_TRANSITION_KINDS = exports.emoticonManualFrameTimingSchema = exports.emoticonManualFrameAssetSchema = exports.emoticonReferenceImageSchema = exports.emoticonOutputProfileSchema = exports.emoticonMotionOverrideSchema = exports.emoticonImageEditRecipeSchema = exports.emoticonBubbleLayersSchema = exports.emoticonBubbleSchema = exports.emoticonBubbleAppearanceSchema = exports.emoticonBubbleHexColorSchema = exports.emoticonBubbleTimelineSchema = exports.emoticonBubbleCueSchema = exports.emoticonOutputPlatformSchema = exports.emoticonBubbleTimelineModeSchema = exports.emoticonBubbleFontSchema = exports.emoticonBatchItemStatusSchema = exports.emoticonBatchStatusSchema = exports.emoticonJobModeSchema = exports.emoticonCharacterAnalysisEstimateSchema = exports.emoticonResourceModeSchema = exports.emoticonMotionPreferenceSchema = exports.emoticonExportFormatSchema = exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS = exports.EMOTICON_OUTPUT_PLATFORMS = exports.EMOTICON_BUBBLE_TIMELINE_MODES = exports.EMOTICON_BUBBLE_FONTS = exports.EMOTICON_JOB_MODES = exports.EMOTICON_RESOURCE_MODES = exports.EMOTICON_MOTION_PREFERENCES = exports.EMOTICON_EXPORT_FORMATS = exports.EMOTICON_BATCH_STATUSES = exports.EMOTICON_BATCH_ITEM_STATUSES = void 0;
exports.emoticonFrameRepairSchema = exports.emoticonRenderFailureRecoverySchema = exports.emoticonMotionReviewSchema = exports.emoticonContinuationDocumentSchema = exports.emoticonContinuationStateSchema = exports.emoticonFrameContinuationSchema = exports.emoticonPipelineContinuationSchema = exports.emoticonFrameSequenceSchema = exports.emoticonFrameDirectionSchema = exports.emoticonOutputInspectionSchema = exports.emoticonAlphaBoundsEvidenceSchema = exports.emoticonAlphaBoundsFrameEvidenceSchema = exports.emoticonAnimationFrameSchema = exports.emoticonQualitySchema = exports.emoticonStoredPlanSchema = void 0;
exports.createIdentityEmoticonImageEditRecipe = createIdentityEmoticonImageEditRecipe;
const zod_1 = require("zod");
const batchContract_1 = require("./batchContract");
var batchContract_2 = require("./batchContract");
Object.defineProperty(exports, "EMOTICON_BATCH_ITEM_STATUSES", { enumerable: true, get: function () { return batchContract_2.EMOTICON_BATCH_ITEM_STATUSES; } });
Object.defineProperty(exports, "EMOTICON_BATCH_STATUSES", { enumerable: true, get: function () { return batchContract_2.EMOTICON_BATCH_STATUSES; } });
exports.EMOTICON_EXPORT_FORMATS = ['png', 'apng', 'webp', 'gif', 'mp4', 'webm', 'png_zip'];
exports.EMOTICON_MOTION_PREFERENCES = ['auto', 'stable', 'dynamic'];
exports.EMOTICON_RESOURCE_MODES = ['efficient', 'balanced', 'premium'];
exports.EMOTICON_JOB_MODES = [
    'generate',
    'rerender',
    'plan',
    'profile',
    'sheet_plan',
    'import_frames',
    'repair_frame',
];
exports.EMOTICON_BUBBLE_FONTS = ['clean', 'round', 'handwriting', 'bold', 'serif'];
exports.EMOTICON_BUBBLE_TIMELINE_MODES = ['full', 'intro', 'outro', 'range', 'cues'];
exports.EMOTICON_OUTPUT_PLATFORMS = ['kakao', 'line', 'telegram', 'sns', 'custom'];
exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS = {
    size: 1,
    fillColor: '#FFFFFF',
    textColor: '#20242D',
    outlineColor: '#222733',
    outlineWidth: 4,
    shadowOpacity: 0,
    offsetX: 0,
    offsetY: 0,
};
exports.emoticonExportFormatSchema = zod_1.z.enum(exports.EMOTICON_EXPORT_FORMATS);
exports.emoticonMotionPreferenceSchema = zod_1.z.enum(exports.EMOTICON_MOTION_PREFERENCES);
exports.emoticonResourceModeSchema = zod_1.z.enum(exports.EMOTICON_RESOURCE_MODES);
exports.emoticonCharacterAnalysisEstimateSchema = zod_1.z.object({
    mode: exports.emoticonResourceModeSchema,
    referenceCount: zod_1.z.number().int().min(1).max(4),
    expectedSecondsMin: zod_1.z.number().int().min(1).max(600),
    expectedSecondsMax: zod_1.z.number().int().min(1).max(600),
    expectedRequestCountMin: zod_1.z.number().int().min(1).max(4),
    expectedRequestCountMax: zod_1.z.number().int().min(1).max(4),
});
exports.emoticonJobModeSchema = zod_1.z.enum(exports.EMOTICON_JOB_MODES);
exports.emoticonBatchStatusSchema = zod_1.z.enum(batchContract_1.EMOTICON_BATCH_STATUSES);
exports.emoticonBatchItemStatusSchema = zod_1.z.enum(batchContract_1.EMOTICON_BATCH_ITEM_STATUSES);
exports.emoticonBubbleFontSchema = zod_1.z.enum(exports.EMOTICON_BUBBLE_FONTS);
exports.emoticonBubbleTimelineModeSchema = zod_1.z.enum(exports.EMOTICON_BUBBLE_TIMELINE_MODES);
exports.emoticonOutputPlatformSchema = zod_1.z.enum(exports.EMOTICON_OUTPUT_PLATFORMS);
exports.emoticonBubbleCueSchema = zod_1.z.object({
    id: zod_1.z.string().min(1).max(80),
    text: zod_1.z.string().trim().min(1).max(36),
    startFrame: zod_1.z.number().int().min(0).max(23),
    endFrame: zod_1.z.number().int().min(0).max(23),
}).refine((cue) => cue.startFrame <= cue.endFrame, {
    message: 'Bubble cue end frame cannot be before its start frame.',
    path: ['endFrame'],
});
exports.emoticonBubbleTimelineSchema = zod_1.z.object({
    mode: exports.emoticonBubbleTimelineModeSchema.default('full'),
    startFrame: zod_1.z.number().int().min(0).max(23).default(0),
    endFrame: zod_1.z.number().int().min(0).max(23).nullable().default(null),
    cues: zod_1.z.array(exports.emoticonBubbleCueSchema).max(6).default([]),
}).refine((timeline) => ((timeline.mode !== 'outro' && timeline.mode !== 'range')
    || timeline.endFrame === null
    || timeline.startFrame <= timeline.endFrame), {
    message: 'Bubble timeline end frame cannot be before its start frame.',
    path: ['endFrame'],
}).superRefine((timeline, context) => {
    if (timeline.mode !== 'cues')
        return;
    const sorted = timeline.cues
        .map((cue, index) => ({ cue, index }))
        .sort((left, right) => left.cue.startFrame - right.cue.startFrame || left.cue.endFrame - right.cue.endFrame);
    for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        if (previous && current && current.cue.startFrame <= previous.cue.endFrame) {
            context.addIssue({
                code: 'custom',
                path: ['cues', current.index, 'startFrame'],
                message: 'Bubble cue ranges cannot overlap.',
            });
        }
    }
});
exports.emoticonBubbleHexColorSchema = zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Bubble colors must use #RRGGBB notation.',
});
exports.emoticonBubbleAppearanceSchema = zod_1.z.object({
    size: zod_1.z.number().finite().min(0.75).max(1.2).default(exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.size),
    fillColor: exports.emoticonBubbleHexColorSchema.default(exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.fillColor),
    textColor: exports.emoticonBubbleHexColorSchema.default(exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.textColor),
    outlineColor: exports.emoticonBubbleHexColorSchema.default(exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.outlineColor),
    outlineWidth: zod_1.z.number().finite().min(0).max(10).default(exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.outlineWidth),
    shadowOpacity: zod_1.z.number().finite().min(0).max(0.75).default(exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.shadowOpacity),
    offsetX: zod_1.z.number().int().min(-48).max(48).default(exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.offsetX),
    offsetY: zod_1.z.number().int().min(-48).max(48).default(exports.EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.offsetY),
});
exports.emoticonBubbleSchema = zod_1.z.object(Object.assign(Object.assign({ text: zod_1.z.string().max(36), style: zod_1.z.enum(['rounded', 'shout', 'thought', 'whisper', 'none']), position: zod_1.z.enum(['top', 'bottom', 'left', 'right']), entrance: zod_1.z.enum(['pop', 'fade', 'shake', 'none']), font: exports.emoticonBubbleFontSchema.default('clean') }, exports.emoticonBubbleAppearanceSchema.shape), { timeline: exports.emoticonBubbleTimelineSchema.default({
        mode: 'full',
        startFrame: 0,
        endFrame: null,
        cues: [],
    }) }));
exports.emoticonBubbleLayersSchema = zod_1.z.array(exports.emoticonBubbleSchema).max(4);
exports.emoticonImageEditRecipeSchema = zod_1.z.object({
    schemaVersion: zod_1.z.literal(1),
    revision: zod_1.z.number().int().nonnegative().max(10000),
    crop: zod_1.z.object({
        left: zod_1.z.number().finite().min(0).max(0.45),
        right: zod_1.z.number().finite().min(0).max(0.45),
        top: zod_1.z.number().finite().min(0).max(0.45),
        bottom: zod_1.z.number().finite().min(0).max(0.45),
    }),
    scale: zod_1.z.number().finite().min(0.5).max(1.6),
    offsetX: zod_1.z.number().finite().min(-0.45).max(0.45),
    offsetY: zod_1.z.number().finite().min(-0.45).max(0.45),
    flipHorizontal: zod_1.z.boolean(),
    rotationDeg: zod_1.z.number().finite().min(-45).max(45),
    transparentPadding: zod_1.z.number().finite().min(0).max(0.3),
    brightness: zod_1.z.number().finite().min(-0.5).max(0.5).default(0),
    contrast: zod_1.z.number().finite().min(-0.5).max(0.5).default(0),
    saturation: zod_1.z.number().finite().min(-0.5).max(0.5).default(0),
}).superRefine((recipe, context) => {
    if (recipe.crop.left + recipe.crop.right > 0.8) {
        context.addIssue({
            code: 'custom',
            path: ['crop'],
            message: 'Horizontal crop cannot remove more than 80% of the image.',
        });
    }
    if (recipe.crop.top + recipe.crop.bottom > 0.8) {
        context.addIssue({
            code: 'custom',
            path: ['crop'],
            message: 'Vertical crop cannot remove more than 80% of the image.',
        });
    }
});
function createIdentityEmoticonImageEditRecipe(revision = 0) {
    return {
        schemaVersion: 1,
        revision,
        crop: { left: 0, right: 0, top: 0, bottom: 0 },
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        flipHorizontal: false,
        rotationDeg: 0,
        transparentPadding: 0,
        brightness: 0,
        contrast: 0,
        saturation: 0,
    };
}
exports.emoticonMotionOverrideSchema = zod_1.z.object({
    fps: zod_1.z.number().int().min(2).max(18),
    frameCount: zod_1.z.number().int().min(4).max(24),
    durationMs: zod_1.z.number().int().min(700).max(3000),
}).refine((motion) => (Math.abs(motion.durationMs - Math.round((motion.frameCount / motion.fps) * 1000)) <= 120), {
    message: 'FPS, frame count, and duration are inconsistent.',
    path: ['durationMs'],
});
const emoticonFormatCapabilitySchema = zod_1.z.object({
    alpha: zod_1.z.enum(['supported', 'unsupported']),
});
const emoticonFormatCapabilitiesSchema = zod_1.z.object({
    png: emoticonFormatCapabilitySchema.optional(),
    apng: emoticonFormatCapabilitySchema.optional(),
    webp: emoticonFormatCapabilitySchema.optional(),
    gif: emoticonFormatCapabilitySchema.optional(),
    mp4: emoticonFormatCapabilitySchema.optional(),
    webm: emoticonFormatCapabilitySchema.optional(),
    png_zip: emoticonFormatCapabilitySchema.optional(),
});
exports.emoticonOutputProfileSchema = zod_1.z.object({
    platform: exports.emoticonOutputPlatformSchema,
    type: zod_1.z.enum(['static', 'animated']),
    width: zod_1.z.number().int().min(64).max(2048),
    height: zod_1.z.number().int().min(64).max(2048),
    profileVersion: zod_1.z.string().trim().min(1).max(80),
    verification: zod_1.z.enum(['reference', 'verified']).default('reference'),
    transparentBackground: zod_1.z.boolean().default(true),
    sourceUrl: zod_1.z.string().url().optional(),
    checkedAt: zod_1.z.string().datetime().optional(),
    allowedFormats: zod_1.z.array(exports.emoticonExportFormatSchema).min(1).max(7).optional(),
    minFrameCount: zod_1.z.number().int().min(1).max(24).optional(),
    maxFrameCount: zod_1.z.number().int().min(1).max(24).optional(),
    maxFileSizeBytes: zod_1.z.number().int().positive().max(1024 * 1024 * 1024).optional(),
    maxDurationMs: zod_1.z.number().int().positive().max(60000).optional(),
    loopCount: zod_1.z.number().int().min(0).max(10000).optional(),
    formatCapabilities: emoticonFormatCapabilitiesSchema.optional(),
    submissionCandidate: zod_1.z.literal(false).optional(),
}).superRefine((profile, context) => {
    if (profile.minFrameCount !== undefined
        && profile.maxFrameCount !== undefined
        && profile.minFrameCount > profile.maxFrameCount) {
        context.addIssue({
            code: 'custom',
            path: ['maxFrameCount'],
            message: 'Maximum frame count cannot be less than minimum frame count.',
        });
    }
    if (profile.allowedFormats && new Set(profile.allowedFormats).size !== profile.allowedFormats.length) {
        context.addIssue({
            code: 'custom',
            path: ['allowedFormats'],
            message: 'Allowed output formats must be unique.',
        });
    }
});
exports.emoticonReferenceImageSchema = zod_1.z.object({
    sourceImageUrl: zod_1.z.string().url().refine((value) => value.startsWith('https://'), {
        message: 'Reference images must use HTTPS.',
    }),
    sourceStoragePath: zod_1.z.string().min(1).max(700),
});
exports.emoticonManualFrameAssetSchema = zod_1.z.object({
    uploadRequestId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
    sourceImageUrl: zod_1.z.string().url().refine((value) => value.startsWith('https://'), {
        message: 'Imported frames must use HTTPS.',
    }),
    sourceStoragePath: zod_1.z.string().min(1).max(700),
    fileName: zod_1.z.string().trim().min(1).max(180),
    contentType: zod_1.z.literal('image/png'),
    sizeBytes: zod_1.z.number().int().positive().max(10 * 1024 * 1024),
    sha256: zod_1.z.string().regex(/^[a-f0-9]{64}$/),
});
exports.emoticonManualFrameTimingSchema = zod_1.z.discriminatedUnion('mode', [
    zod_1.z.object({
        mode: zod_1.z.literal('fps'),
        fps: zod_1.z.number().int().min(1).max(30),
    }),
    zod_1.z.object({
        mode: zod_1.z.literal('per_frame'),
        frameDurationsMs: zod_1.z.array(zod_1.z.number().int().min(40).max(2000)).min(2).max(24),
    }),
]);
exports.EMOTICON_FRAME_TRANSITION_KINDS = ['cut', 'fade', 'slide_left', 'slide_right', 'zoom'];
exports.emoticonFrameTransitionSchema = zod_1.z.object({
    kind: zod_1.z.enum(exports.EMOTICON_FRAME_TRANSITION_KINDS).default('cut'),
    strength: zod_1.z.number().finite().min(0.15).max(0.85).default(0.5),
});
exports.emoticonManualFrameImportSchema = zod_1.z.object({
    schemaVersion: zod_1.z.literal(1),
    requestId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
    frames: zod_1.z.array(exports.emoticonManualFrameAssetSchema).min(1).max(24),
    timing: exports.emoticonManualFrameTimingSchema,
}).superRefine((manualImport, context) => {
    const storagePaths = manualImport.frames.map((frame) => frame.sourceStoragePath);
    const uploadIds = manualImport.frames.map((frame) => frame.uploadRequestId);
    if (new Set(storagePaths).size !== storagePaths.length || new Set(uploadIds).size !== uploadIds.length) {
        context.addIssue({ code: 'custom', path: ['frames'], message: 'Imported frame assets must be unique.' });
    }
    if (manualImport.timing.mode === 'per_frame'
        && manualImport.timing.frameDurationsMs.length !== manualImport.frames.length) {
        context.addIssue({
            code: 'custom',
            path: ['timing', 'frameDurationsMs'],
            message: 'Per-frame timing count must match the imported frame count.',
        });
    }
});
exports.emoticonManualFrameImportReportSchema = zod_1.z.object({
    schemaVersion: zod_1.z.literal(1),
    technicalOnly: zod_1.z.literal(true),
    aiCalls: zod_1.z.literal(0),
    identityVerified: zod_1.z.literal(false),
    motionVerified: zod_1.z.literal(false),
    sourceFrameCount: zod_1.z.number().int().min(1).max(24),
    timingMode: zod_1.z.enum(['fps', 'per_frame']),
    frameDurationsMs: zod_1.z.array(zod_1.z.number().int().min(40).max(2000)).max(24),
});
exports.emoticonBatchCountsSchema = zod_1.z.object({
    total: zod_1.z.number().int().min(1).max(64),
    pending: zod_1.z.number().int().min(0).max(64),
    queued: zod_1.z.number().int().min(0).max(64),
    running: zod_1.z.number().int().min(0).max(64),
    deferred: zod_1.z.number().int().min(0).max(64),
    completed: zod_1.z.number().int().min(0).max(64),
    failed: zod_1.z.number().int().min(0).max(64),
    cancelled: zod_1.z.number().int().min(0).max(64),
    notEnqueued: zod_1.z.number().int().min(0).max(64),
}).refine((counts) => (counts.pending
    + counts.queued
    + counts.running
    + counts.deferred
    + counts.completed
    + counts.failed
    + counts.cancelled
    + counts.notEnqueued
    === counts.total), { message: 'Batch item counts must equal the total.' });
exports.emoticonBatchItemSchema = zod_1.z.object({
    itemId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    status: exports.emoticonBatchItemStatusSchema,
    progress: zod_1.z.number().int().min(0).max(100),
    attemptCount: zod_1.z.number().int().min(1).max(8),
    enqueueRoundId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    retryRound: zod_1.z.number().int().min(0).max(99).optional(),
    enqueueProjectItemRevision: zod_1.z.number().int().nonnegative().optional(),
    jobIds: zod_1.z.array(zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)).max(8),
    currentJobId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).nullable(),
    enqueueError: zod_1.z.string().max(240).nullable(),
    jobError: zod_1.z.string().max(240).nullable(),
    deferredUntilMs: zod_1.z.number().int().nonnegative().nullable(),
    lastEnqueueAt: zod_1.z.unknown().optional(),
    completedAt: zod_1.z.unknown().optional(),
});
exports.emoticonBatchRetryExclusionReasonSchema = zod_1.z.enum([
    'project_item_completed',
    'project_item_active',
    'project_item_replaced',
]);
exports.emoticonBatchRetryTargetSchema = zod_1.z.object({
    itemId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    itemRevision: zod_1.z.number().int().nonnegative(),
    // Default keeps batches written before enqueue-round fencing readable.
    attemptCount: zod_1.z.number().int().min(1).max(8).default(1),
});
exports.emoticonBatchRetrySkippedItemSchema = zod_1.z.object({
    itemId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    reason: exports.emoticonBatchRetryExclusionReasonSchema,
    supersededByJobId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).nullable(),
});
exports.emoticonBatchSchema = zod_1.z.object({
    id: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    userId: zod_1.z.string().min(1).max(128),
    projectId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    projectRevision: zod_1.z.number().int().nonnegative(),
    itemIds: zod_1.z.array(zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)).min(1).max(64),
    requestedConcurrency: zod_1.z.number().int().min(1).max(3),
    status: exports.emoticonBatchStatusSchema,
    progressPercent: zod_1.z.number().int().min(0).max(100),
    counts: exports.emoticonBatchCountsSchema,
    items: zod_1.z.array(exports.emoticonBatchItemSchema).min(1).max(64),
    retryRound: zod_1.z.number().int().min(0).max(99),
    enqueueRoundId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    enqueueItemAttempts: zod_1.z.record(zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), zod_1.z.number().int().min(1).max(8)).optional(),
    enqueueItemRevisions: zod_1.z.record(zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), zod_1.z.number().int().nonnegative()).optional(),
    enqueueRoundOpenedAtMs: zod_1.z.number().int().nonnegative().optional(),
    enqueueRoundLeaseExpiresAtMs: zod_1.z.number().int().nonnegative().optional(),
    lastRetryRequestId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    lastRetryItemIds: zod_1.z.array(zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)).max(64).optional(),
    lastRetryProjectRevision: zod_1.z.number().int().nonnegative().optional(),
    lastRetryTargets: zod_1.z.array(exports.emoticonBatchRetryTargetSchema).max(64).optional(),
    lastRetrySkippedItems: zod_1.z.array(exports.emoticonBatchRetrySkippedItemSchema).max(64).optional(),
    lastRetryEnqueueRoundId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    executionJobIds: zod_1.z.array(zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)).max(3).default([]),
    executionSlotUpdatedAt: zod_1.z.unknown().optional(),
    cancelRequestedAt: zod_1.z.unknown().optional(),
    startedAt: zod_1.z.unknown().optional(),
    completedAt: zod_1.z.unknown().optional(),
    createdAt: zod_1.z.unknown().optional(),
    updatedAt: zod_1.z.unknown().optional(),
}).superRefine((batch, context) => {
    var _a, _b;
    const uniqueItemIds = new Set(batch.itemIds);
    const itemStateIds = new Set(batch.items.map((item) => item.itemId));
    if (uniqueItemIds.size !== batch.itemIds.length
        || itemStateIds.size !== batch.items.length
        || batch.itemIds.some((itemId) => !itemStateIds.has(itemId))) {
        context.addIssue({
            code: 'custom',
            path: ['items'],
            message: 'Batch item identifiers must be unique and match the state list.',
        });
    }
    if (batch.counts.total !== batch.items.length) {
        context.addIssue({
            code: 'custom',
            path: ['counts', 'total'],
            message: 'Batch total must match the item state count.',
        });
    }
    const retryTargetIds = ((_a = batch.lastRetryTargets) === null || _a === void 0 ? void 0 : _a.map((target) => target.itemId)) || [];
    const skippedIds = ((_b = batch.lastRetrySkippedItems) === null || _b === void 0 ? void 0 : _b.map((item) => item.itemId)) || [];
    if (new Set(retryTargetIds).size !== retryTargetIds.length
        || retryTargetIds.some((itemId) => !uniqueItemIds.has(itemId))
        || (batch.lastRetryTargets && batch.lastRetryItemIds && (batch.lastRetryItemIds.length !== retryTargetIds.length
            || batch.lastRetryItemIds.some((itemId, index) => itemId !== retryTargetIds[index])))) {
        context.addIssue({
            code: 'custom',
            path: ['lastRetryTargets'],
            message: 'Retry targets must match the batch items and their revision bindings.',
        });
    }
    if (new Set(skippedIds).size !== skippedIds.length
        || skippedIds.some((itemId) => !uniqueItemIds.has(itemId) || retryTargetIds.includes(itemId))) {
        context.addIssue({
            code: 'custom',
            path: ['lastRetrySkippedItems'],
            message: 'Skipped retry items must be unique, in-batch, and disjoint from targets.',
        });
    }
    if (batch.enqueueRoundId) {
        const attempts = batch.enqueueItemAttempts || {};
        const revisions = batch.enqueueItemRevisions || {};
        const roundItemIds = Object.keys(attempts);
        const revisionsIds = Object.keys(revisions);
        const roundItemsAreValid = roundItemIds.length > 0
            && roundItemIds.length === revisionsIds.length
            && roundItemIds.every((itemId) => {
                const item = batch.items.find((candidate) => candidate.itemId === itemId);
                return Boolean(item
                    && item.enqueueRoundId === batch.enqueueRoundId
                    && item.retryRound === batch.retryRound
                    && item.attemptCount === attempts[itemId]
                    && item.enqueueProjectItemRevision === revisions[itemId]);
            })
            && revisionsIds.every((itemId) => roundItemIds.includes(itemId));
        const pendingItemsAreCurrent = batch.items
            .filter((item) => item.status === 'pending')
            .every((item) => (item.enqueueRoundId === batch.enqueueRoundId
            && item.retryRound === batch.retryRound
            && attempts[item.itemId] === item.attemptCount
            && revisions[item.itemId] === item.enqueueProjectItemRevision));
        if (batch.enqueueRoundOpenedAtMs === undefined
            || batch.enqueueRoundLeaseExpiresAtMs === undefined
            || batch.enqueueRoundLeaseExpiresAtMs <= batch.enqueueRoundOpenedAtMs
            || !roundItemsAreValid
            || !pendingItemsAreCurrent) {
            context.addIssue({
                code: 'custom',
                path: ['enqueueRoundId'],
                message: 'The active enqueue round, item attempts, revisions, and lease must agree.',
            });
        }
    }
});
exports.emoticonJobRequestSchema = zod_1.z.object({
    id: zod_1.z.string().min(1).optional(),
    userId: zod_1.z.string().min(1).optional(),
    sourceImageUrl: zod_1.z.string().url().refine((value) => value.startsWith('https://'), {
        message: 'Source images must use HTTPS.',
    }),
    sourceStoragePath: zod_1.z.string().min(1).max(500),
    referenceImages: zod_1.z.array(exports.emoticonReferenceImageSchema).max(3).default([]),
    instruction: zod_1.z.string().trim().min(2).max(800),
    templateRequest: zod_1.z.string().trim().min(8).max(800).optional(),
    templateItemCount: zod_1.z.number().int().min(1).max(64).optional(),
    profileJobId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    sheetRequest: zod_1.z.string().trim().min(8).max(800).optional(),
    sheetItemCount: zod_1.z.number().int().min(1).max(64).optional(),
    manualImport: exports.emoticonManualFrameImportSchema.optional(),
    bubbleOverride: exports.emoticonBubbleSchema.optional(),
    bubbleLayersOverride: exports.emoticonBubbleLayersSchema.optional(),
    motionOverride: exports.emoticonMotionOverrideSchema.optional(),
    outputProfile: exports.emoticonOutputProfileSchema.optional(),
    motionPreference: exports.emoticonMotionPreferenceSchema.default('auto'),
    // Missing means a job created before the saving-mode rollout. Preserve
    // its original premium behaviour while every new client writes a mode.
    resourceMode: exports.emoticonResourceModeSchema.default('premium'),
    // Opt-in fence for the paid GPT Light path. Efficient jobs written before
    // this field existed keep the legacy zero-provider composite behavior.
    aiGenerationProfile: zod_1.z.literal('gpt-light-v1').optional(),
    analysisEstimate: exports.emoticonCharacterAnalysisEstimateSchema.optional(),
    rightsAttested: zod_1.z.boolean().optional(),
    assetProvenance: zod_1.z.object({
        kind: zod_1.z.enum(['uploaded', 'existing_asset']),
        sourceStoragePaths: zod_1.z.array(zod_1.z.string().min(1).max(500)).min(1).max(4),
    }).optional(),
    formats: zod_1.z.array(exports.emoticonExportFormatSchema).min(1).max(7).refine((formats) => new Set(formats).size === formats.length, { message: 'Output formats must be unique.' }).default(['webp']),
    mode: exports.emoticonJobModeSchema.default('generate'),
    parentJobId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    repairFrameIndex: zod_1.z.number().int().min(0).max(23).optional(),
    projectId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    projectItemId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    batchId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    batchEnqueueRoundId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    batchRetryRound: zod_1.z.number().int().min(0).max(99).optional(),
    batchItemAttemptCount: zod_1.z.number().int().min(1).max(8).optional(),
    projectRevision: zod_1.z.number().int().nonnegative().optional(),
    projectItemRevision: zod_1.z.number().int().nonnegative().optional(),
    renderOverrides: zod_1.z.object({
        bubble: exports.emoticonBubbleSchema.optional(),
        bubbleLayers: exports.emoticonBubbleLayersSchema.optional(),
        motion: exports.emoticonMotionOverrideSchema.optional(),
        outputProfile: exports.emoticonOutputProfileSchema.optional(),
        editRecipe: exports.emoticonImageEditRecipeSchema.optional(),
        frameDurationsMs: zod_1.z.array(zod_1.z.number().int().min(40).max(2000)).min(2).max(24).optional(),
        frameTransitions: zod_1.z.array(exports.emoticonFrameTransitionSchema).min(2).max(24).optional(),
    }).optional(),
    status: zod_1.z.literal('queued'),
    progress: zod_1.z.number().int().min(0).max(100).optional(),
    statusMessage: zod_1.z.string().max(240).optional(),
    cancelRequestedAt: zod_1.z.unknown().optional(),
    cancelledAt: zod_1.z.unknown().optional(),
}).superRefine((request, context) => {
    var _a;
    if (request.mode === 'sheet_plan' && !request.profileJobId) {
        context.addIssue({
            code: 'custom',
            path: ['profileJobId'],
            message: 'A completed character profile job is required for sheet planning.',
        });
    }
    if (request.mode === 'sheet_plan' && (!request.sheetRequest || !request.sheetItemCount)) {
        context.addIssue({
            code: 'custom',
            path: ['sheetRequest'],
            message: 'A free-form sheet request and item count are required.',
        });
    }
    if (request.mode === 'import_frames') {
        if (!request.manualImport || !request.outputProfile || !request.projectId || !request.projectItemId) {
            context.addIssue({
                code: 'custom',
                path: ['manualImport'],
                message: 'A project item, output profile, and frame list are required for manual import.',
            });
        }
        else {
            const frameCount = request.manualImport.frames.length;
            if (request.sourceStoragePath !== ((_a = request.manualImport.frames[0]) === null || _a === void 0 ? void 0 : _a.sourceStoragePath)) {
                context.addIssue({
                    code: 'custom',
                    path: ['sourceStoragePath'],
                    message: 'The representative source must be the first imported frame.',
                });
            }
            if (request.outputProfile.type === 'static' && frameCount !== 1) {
                context.addIssue({
                    code: 'custom',
                    path: ['manualImport', 'frames'],
                    message: 'A static manual import requires exactly one frame.',
                });
            }
            if (request.outputProfile.type === 'animated' && (frameCount < 2 || frameCount > 24)) {
                context.addIssue({
                    code: 'custom',
                    path: ['manualImport', 'frames'],
                    message: 'An animated manual import requires between 2 and 24 frames.',
                });
            }
            if (frameCount === 1
                && (request.manualImport.timing.mode !== 'fps' || request.manualImport.timing.fps !== 1)) {
                context.addIssue({
                    code: 'custom',
                    path: ['manualImport', 'timing'],
                    message: 'A static manual import must use FPS 1.',
                });
            }
        }
    }
    else if (request.manualImport) {
        context.addIssue({
            code: 'custom',
            path: ['manualImport'],
            message: 'Manual frame assets are only valid for import_frames jobs.',
        });
    }
    if (request.mode === 'repair_frame' && !request.parentJobId) {
        context.addIssue({
            code: 'custom',
            path: ['parentJobId'],
            message: 'A parent job is required for a frame repair.',
        });
    }
    if (request.mode === 'repair_frame' && request.repairFrameIndex === undefined) {
        context.addIssue({
            code: 'custom',
            path: ['repairFrameIndex'],
            message: 'A frame index is required for a frame repair.',
        });
    }
    if (request.mode !== 'repair_frame' && request.repairFrameIndex !== undefined) {
        context.addIssue({
            code: 'custom',
            path: ['repairFrameIndex'],
            message: 'A frame index is only valid for frame-repair jobs.',
        });
    }
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
exports.emoticonCharacterAnalysisSchema = zod_1.z.object({
    schemaVersion: zod_1.z.literal(1),
    analysisRevision: zod_1.z.literal(2).default(2),
    summary: zod_1.z.string().trim().min(1).max(480),
    attributes: zod_1.z.object({
        face: zod_1.z.string().trim().min(1).max(240),
        eyes: zod_1.z.string().trim().min(1).max(240),
        hair: zod_1.z.string().trim().min(1).max(240),
        bodyShape: zod_1.z.string().trim().min(1).max(240),
        outfit: zod_1.z.string().trim().min(1).max(320),
        accessories: zod_1.z.array(zod_1.z.string().trim().min(1).max(120)).max(8),
        distinctiveFeatures: zod_1.z.array(zod_1.z.string().trim().min(1).max(160)).min(1).max(12),
        palette: zod_1.z.array(zod_1.z.string().trim().min(1).max(60)).min(1).max(10),
        lineArt: zod_1.z.string().trim().min(1).max(240),
        shading: zod_1.z.string().trim().min(1).max(240),
        proportions: zod_1.z.string().trim().min(1).max(240),
        limbStructure: zod_1.z.string().trim().min(1).max(240),
    }),
    immutableLock: zod_1.z.array(zod_1.z.string().trim().min(1).max(180)).min(1).max(16),
    styleLock: zod_1.z.array(zod_1.z.string().trim().min(1).max(180)).min(1).max(12),
    negativeLock: zod_1.z.array(zod_1.z.string().trim().min(1).max(180)).min(1).max(16),
    motionTraits: zod_1.z.object({
        hair: zod_1.z.string().trim().min(1).max(240),
        clothing: zod_1.z.string().trim().min(1).max(240),
        groundAnchor: zod_1.z.string().trim().min(1).max(240),
        centerAnchor: zod_1.z.string().trim().min(1).max(240),
        articulatedParts: zod_1.z.array(zod_1.z.string().trim().min(1).max(120)).max(12),
    }).default({
        hair: '확인 필요',
        clothing: '확인 필요',
        groundAnchor: '발바닥 접지점을 기준으로 유지',
        centerAnchor: '몸통 중심을 기준으로 유지',
        articulatedParts: [],
    }),
    imageQuality: zod_1.z.object({
        score: zod_1.z.number().int().min(0).max(100),
        resolution: zod_1.z.string().trim().min(1).max(160),
        backgroundIsolation: zod_1.z.string().trim().min(1).max(240),
        cropping: zod_1.z.string().trim().min(1).max(240),
        issues: zod_1.z.array(zod_1.z.string().trim().min(1).max(180)).max(8),
        usableForGeneration: zod_1.z.boolean(),
    }).default({
        score: 0,
        resolution: '기존 분석에는 해상도 평가가 없습니다.',
        backgroundIsolation: '기존 분석에는 배경 분리 평가가 없습니다.',
        cropping: '기존 분석에는 잘림 평가가 없습니다.',
        issues: ['새 분석으로 원본 이미지 품질을 확인하세요.'],
        usableForGeneration: true,
    }),
    confidenceNotes: zod_1.z.array(zod_1.z.string().trim().min(1).max(180)).max(8),
    confirmationRequired: zod_1.z.array(zod_1.z.string().trim().min(1).max(180)).max(8).default([]),
    referenceCount: zod_1.z.number().int().min(1).max(4),
});
exports.emoticonCharacterSheetItemSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(80),
    angle: zod_1.z.string().trim().min(1).max(120),
    expression: zod_1.z.string().trim().min(1).max(120),
    pose: zod_1.z.string().trim().min(1).max(180),
    instruction: zod_1.z.string().trim().min(20).max(800),
});
exports.emoticonCharacterSheetPlanSchema = zod_1.z.object({
    schemaVersion: zod_1.z.literal(1),
    requestSummary: zod_1.z.string().trim().min(1).max(320),
    items: zod_1.z.array(exports.emoticonCharacterSheetItemSchema).min(1).max(64),
}).superRefine((plan, context) => {
    const signatures = new Set();
    plan.items.forEach((item, index) => {
        const signature = `${item.angle}|${item.expression}|${item.pose}`.toLocaleLowerCase();
        if (signatures.has(signature)) {
            context.addIssue({
                code: 'custom',
                path: ['items', index],
                message: 'Sheet angle, expression, and pose combinations must be unique.',
            });
        }
        signatures.add(signature);
    });
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
        frameCount: zod_1.z.number().int().min(4).max(24),
        fps: zod_1.z.number().int().min(2).max(18),
        loopDescription: zod_1.z.string().min(1).max(200),
        imagePrompt: zod_1.z.string().min(20).max(2400),
        videoPrompt: zod_1.z.string().min(20).max(2400),
        negativePrompt: zod_1.z.string().min(1).max(1200),
        authorizedProps: zod_1.z.array(zod_1.z.string().trim().min(1).max(80)).max(2).default([]),
        motionAccents: zod_1.z.array(zod_1.z.string().trim().min(1).max(80)).max(3).default([]),
    }),
    bubble: exports.emoticonBubbleSchema,
    bubbleLayers: exports.emoticonBubbleLayersSchema.optional(),
    suggestedPresets: zod_1.z.array(exports.emoticonPresetSchema).max(64),
});
exports.emoticonManualStoredPlanSchema = exports.emoticonPlanSchema.extend({
    action: exports.emoticonPlanSchema.shape.action.extend({
        durationMs: zod_1.z.number().int().min(0).max(60000),
        frameCount: zod_1.z.number().int().min(1).max(24),
        fps: zod_1.z.number().min(0.1).max(30),
    }),
});
exports.emoticonStoredPlanSchema = zod_1.z.union([
    exports.emoticonPlanSchema,
    exports.emoticonManualStoredPlanSchema,
]);
exports.emoticonQualitySchema = zod_1.z.object({
    overall: zod_1.z.number().min(0).max(100),
    identity: zod_1.z.number().min(0).max(100),
    allReferencesConsistent: zod_1.z.boolean().default(false),
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
    generationModel: zod_1.z.string().min(1).max(200).optional(),
    generationProvider: zod_1.z.string().min(1).max(100).optional(),
    generationRequestId: zod_1.z.string().min(1).max(200).optional(),
    generationSeed: zod_1.z.number().int().nonnegative().optional(),
    generationCostUsd: zod_1.z.number().nonnegative().optional(),
});
exports.emoticonAlphaBoundsFrameEvidenceSchema = zod_1.z.object({
    frameIndex: zod_1.z.number().int().min(0).max(23),
    visiblePixelCount: zod_1.z.number().int().nonnegative(),
    bounds: zod_1.z.object({
        left: zod_1.z.number().int().nonnegative(),
        top: zod_1.z.number().int().nonnegative(),
        right: zod_1.z.number().int().nonnegative(),
        bottom: zod_1.z.number().int().nonnegative(),
    }).nullable(),
    transparentMargins: zod_1.z.object({
        left: zod_1.z.number().int().nonnegative(),
        top: zod_1.z.number().int().nonnegative(),
        right: zod_1.z.number().int().nonnegative(),
        bottom: zod_1.z.number().int().nonnegative(),
    }).nullable(),
    minimumTransparentMarginPx: zod_1.z.number().int().nonnegative().nullable(),
    touchesCanvasEdge: zod_1.z.boolean(),
    hasUsableTransparentMargin: zod_1.z.boolean(),
});
exports.emoticonAlphaBoundsEvidenceSchema = zod_1.z.object({
    alphaThreshold: zod_1.z.number().int().min(1).max(254),
    requiredTransparentMarginPx: zod_1.z.number().int().min(1).max(256),
    checkedFrameCount: zod_1.z.number().int().min(1).max(24),
    allFramesHaveVisibleContent: zod_1.z.boolean(),
    allFramesHaveUsableTransparentMargin: zod_1.z.boolean(),
    edgeTouchFrameIndices: zod_1.z.array(zod_1.z.number().int().min(0).max(23)).max(24),
    insufficientMarginFrameIndices: zod_1.z.array(zod_1.z.number().int().min(0).max(23)).max(24),
    frames: zod_1.z.array(exports.emoticonAlphaBoundsFrameEvidenceSchema).min(1).max(24),
});
exports.emoticonOutputInspectionSchema = zod_1.z.object({
    format: exports.emoticonExportFormatSchema,
    fileSizeBytes: zod_1.z.number().int().nonnegative(),
    width: zod_1.z.number().int().min(1).nullable(),
    height: zod_1.z.number().int().min(1).nullable(),
    frameCount: zod_1.z.number().int().min(1),
    fps: zod_1.z.number().min(0).nullable(),
    durationMs: zod_1.z.number().int().min(0).nullable(),
    loop: zod_1.z.boolean().nullable(),
    hasAlpha: zod_1.z.boolean(),
    transparencyCoverage: zod_1.z.number().min(0).max(1).nullable(),
    alphaBoundsEvidence: exports.emoticonAlphaBoundsEvidenceSchema.nullable().optional(),
    codec: zod_1.z.string().min(1).max(80).nullable(),
    sha256: zod_1.z.string().regex(/^[a-f0-9]{64}$/),
    inspectedAt: zod_1.z.string().datetime(),
    inspectorVersion: zod_1.z.string().min(1).max(40),
    passed: zod_1.z.boolean(),
    issues: zod_1.z.array(zod_1.z.string().min(1).max(180)).max(12),
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
    frames: zod_1.z.array(exports.emoticonFrameDirectionSchema).min(4).max(24),
});
const emoticonContinuationMetadataSchema = zod_1.z.object({
    retryCount: zod_1.z.number().int().min(0).max(2).default(0),
    state: zod_1.z.enum([
        'checkpointed',
        'queued',
        'running',
        'completed',
        'failed',
        'cancelled',
    ]).optional(),
    token: zod_1.z.string().regex(/^[A-Za-z0-9-]{1,160}$/).optional(),
    requestedAt: zod_1.z.unknown().optional(),
    leaseExpiresAtMs: zod_1.z.number().int().nonnegative().optional(),
});
exports.emoticonPipelineContinuationSchema = emoticonContinuationMetadataSchema.extend({
    stage: zod_1.z.enum([
        'analysis',
        'pose-generation',
        'pose-review',
        'pose-correction',
        'corrected-pose-review',
        'static-render',
        'repair-generation',
        'repair-pose-review',
        'repair-sequence-review',
        'repair-render',
    ]),
});
exports.emoticonFrameContinuationSchema = emoticonContinuationMetadataSchema.extend({
    stage: zod_1.z.enum(['planning', 'generation', 'review', 'render']),
    pass: zod_1.z.union([zod_1.z.literal(1), zod_1.z.literal(2)]),
    startIndex: zod_1.z.number().int().min(0).max(24),
    nextFrameIndex: zod_1.z.number().int().min(0).max(24),
    totalGenerationCalls: zod_1.z.number().int().min(0).max(48),
    correction: zod_1.z.string().trim().min(1).max(1200).optional(),
    repairFrameIndices: zod_1.z.array(zod_1.z.number().int().min(0).max(23)).max(2).optional(),
    nextRepairCursor: zod_1.z.number().int().min(0).max(2).optional(),
}).superRefine((state, context) => {
    if (state.nextFrameIndex < state.startIndex) {
        context.addIssue({
            code: 'custom',
            message: 'The continuation cursor cannot be before its repair start.',
            path: ['nextFrameIndex'],
        });
    }
    const hasRepairIndices = state.repairFrameIndices !== undefined;
    const hasRepairCursor = state.nextRepairCursor !== undefined;
    if (hasRepairIndices !== hasRepairCursor) {
        context.addIssue({
            code: 'custom',
            message: 'Selective repair indices and cursor must be stored together.',
            path: ['repairFrameIndices'],
        });
        return;
    }
    if (state.repairFrameIndices) {
        if (state.pass !== 2
            || new Set(state.repairFrameIndices).size !== state.repairFrameIndices.length
            || state.nextRepairCursor > state.repairFrameIndices.length) {
            context.addIssue({
                code: 'custom',
                message: 'Selective repair must use one ordered, bounded second-pass cursor.',
                path: ['repairFrameIndices'],
            });
        }
    }
});
exports.emoticonContinuationStateSchema = zod_1.z.union([
    exports.emoticonPipelineContinuationSchema,
    exports.emoticonFrameContinuationSchema,
]);
exports.emoticonContinuationDocumentSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1).max(128),
    jobId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    token: zod_1.z.string().regex(/^[A-Za-z0-9-]{1,160}$/),
    runToken: zod_1.z.string().regex(/^[A-Za-z0-9-]{1,160}$/),
    status: zod_1.z.enum([
        'queued',
        'running',
        'completed',
        'continued',
        'retried',
        'failed',
        'stale',
        'invalid',
        'cancelled',
    ]),
    stage: zod_1.z.enum([
        'analysis',
        'pose-generation',
        'pose-review',
        'pose-correction',
        'corrected-pose-review',
        'static-render',
        'repair-generation',
        'repair-pose-review',
        'repair-sequence-review',
        'repair-render',
        'planning',
        'generation',
        'review',
        'render',
    ]),
    attemptCount: zod_1.z.number().int().nonnegative().optional(),
    leaseExpiresAtMs: zod_1.z.number().int().nonnegative().optional(),
    expiresAt: zod_1.z.unknown().optional(),
    createdAt: zod_1.z.unknown().optional(),
    updatedAt: zod_1.z.unknown().optional(),
});
exports.emoticonMotionReviewSchema = zod_1.z.object({
    overall: zod_1.z.number().min(0).max(100),
    identity: zod_1.z.number().min(0).max(100),
    allReferencesConsistent: zod_1.z.boolean().default(false),
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
exports.emoticonRenderFailureRecoverySchema = zod_1.z.object({
    stage: zod_1.z.literal('render'),
    category: zod_1.z.literal('infrastructure'),
    poseAccepted: zod_1.z.literal(true),
    markedAt: zod_1.z.unknown().optional(),
});
exports.emoticonFrameRepairSchema = zod_1.z.object({
    parentJobId: zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    frameIndex: zod_1.z.number().int().min(0).max(23),
    maxGenerationCalls: zod_1.z.literal(1),
    generationCalls: zod_1.z.number().int().min(0).max(1),
    maxPoseReviewCalls: zod_1.z.literal(1).optional(),
    poseReviewCalls: zod_1.z.number().int().min(0).max(1).optional(),
    maxSequenceReviewCalls: zod_1.z.literal(1).optional(),
    sequenceReviewCalls: zod_1.z.number().int().min(0).max(1).optional(),
    validation: zod_1.z.enum([
        'local-frame-variation+output-inspection',
        'local-variation+pose-semantic+sequence-motion+output-inspection',
    ]),
    poseReview: exports.emoticonQualitySchema.optional(),
    motionReview: exports.emoticonMotionReviewSchema.optional(),
    replacementFrame: exports.emoticonAnimationFrameSchema.optional(),
});
//# sourceMappingURL=schema.js.map