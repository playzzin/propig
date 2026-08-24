import { z } from 'zod';
import {
    EMOTICON_BATCH_ITEM_STATUSES,
    EMOTICON_BATCH_STATUSES,
} from './batchContract';

export {
    EMOTICON_BATCH_ITEM_STATUSES,
    EMOTICON_BATCH_STATUSES,
} from './batchContract';

export const EMOTICON_EXPORT_FORMATS = ['png', 'apng', 'webp', 'gif', 'mp4', 'webm', 'png_zip'] as const;
export const EMOTICON_MOTION_PREFERENCES = ['auto', 'stable', 'dynamic'] as const;
export const EMOTICON_RESOURCE_MODES = ['efficient', 'balanced', 'premium'] as const;
export const EMOTICON_JOB_MODES = [
    'generate',
    'rerender',
    'plan',
    'profile',
    'sheet_plan',
    'import_frames',
    'repair_frame',
] as const;
export const EMOTICON_BUBBLE_FONTS = ['clean', 'round', 'handwriting', 'bold', 'serif'] as const;
export const EMOTICON_BUBBLE_TIMELINE_MODES = ['full', 'intro', 'outro', 'range', 'cues'] as const;
export const EMOTICON_OUTPUT_PLATFORMS = ['kakao', 'line', 'telegram', 'sns', 'custom'] as const;
export const EMOTICON_BUBBLE_APPEARANCE_DEFAULTS = {
    size: 1,
    fillColor: '#FFFFFF',
    textColor: '#20242D',
    outlineColor: '#222733',
    outlineWidth: 4,
    shadowOpacity: 0,
    offsetX: 0,
    offsetY: 0,
} as const;

export const emoticonExportFormatSchema = z.enum(EMOTICON_EXPORT_FORMATS);
export const emoticonMotionPreferenceSchema = z.enum(EMOTICON_MOTION_PREFERENCES);
export const emoticonResourceModeSchema = z.enum(EMOTICON_RESOURCE_MODES);

export const emoticonCharacterAnalysisEstimateSchema = z.object({
    mode: emoticonResourceModeSchema,
    referenceCount: z.number().int().min(1).max(4),
    expectedSecondsMin: z.number().int().min(1).max(600),
    expectedSecondsMax: z.number().int().min(1).max(600),
    expectedRequestCountMin: z.number().int().min(1).max(4),
    expectedRequestCountMax: z.number().int().min(1).max(4),
});
export const emoticonJobModeSchema = z.enum(EMOTICON_JOB_MODES);
export const emoticonBatchStatusSchema = z.enum(EMOTICON_BATCH_STATUSES);
export const emoticonBatchItemStatusSchema = z.enum(EMOTICON_BATCH_ITEM_STATUSES);
export const emoticonBubbleFontSchema = z.enum(EMOTICON_BUBBLE_FONTS);
export const emoticonBubbleTimelineModeSchema = z.enum(EMOTICON_BUBBLE_TIMELINE_MODES);
export const emoticonOutputPlatformSchema = z.enum(EMOTICON_OUTPUT_PLATFORMS);

export const emoticonBubbleCueSchema = z.object({
    id: z.string().min(1).max(80),
    text: z.string().trim().min(1).max(36),
    startFrame: z.number().int().min(0).max(23),
    endFrame: z.number().int().min(0).max(23),
}).refine((cue) => cue.startFrame <= cue.endFrame, {
    message: 'Bubble cue end frame cannot be before its start frame.',
    path: ['endFrame'],
});

export const emoticonBubbleTimelineSchema = z.object({
    mode: emoticonBubbleTimelineModeSchema.default('full'),
    startFrame: z.number().int().min(0).max(23).default(0),
    endFrame: z.number().int().min(0).max(23).nullable().default(null),
    cues: z.array(emoticonBubbleCueSchema).max(6).default([]),
}).refine((timeline) => (
    (timeline.mode !== 'outro' && timeline.mode !== 'range')
    || timeline.endFrame === null
    || timeline.startFrame <= timeline.endFrame
), {
    message: 'Bubble timeline end frame cannot be before its start frame.',
    path: ['endFrame'],
}).superRefine((timeline, context) => {
    if (timeline.mode !== 'cues') return;
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

export const emoticonBubbleHexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Bubble colors must use #RRGGBB notation.',
});

export const emoticonBubbleAppearanceSchema = z.object({
    size: z.number().finite().min(0.75).max(1.2).default(EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.size),
    fillColor: emoticonBubbleHexColorSchema.default(EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.fillColor),
    textColor: emoticonBubbleHexColorSchema.default(EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.textColor),
    outlineColor: emoticonBubbleHexColorSchema.default(EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.outlineColor),
    outlineWidth: z.number().finite().min(0).max(10).default(EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.outlineWidth),
    shadowOpacity: z.number().finite().min(0).max(0.75).default(EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.shadowOpacity),
    offsetX: z.number().int().min(-48).max(48).default(EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.offsetX),
    offsetY: z.number().int().min(-48).max(48).default(EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.offsetY),
});

export const emoticonBubbleSchema = z.object({
    text: z.string().max(36),
    style: z.enum(['rounded', 'shout', 'thought', 'whisper', 'none']),
    position: z.enum(['top', 'bottom', 'left', 'right']),
    entrance: z.enum(['pop', 'fade', 'shake', 'none']),
    font: emoticonBubbleFontSchema.default('clean'),
    ...emoticonBubbleAppearanceSchema.shape,
    timeline: emoticonBubbleTimelineSchema.default({
        mode: 'full',
        startFrame: 0,
        endFrame: null,
        cues: [],
    }),
});

export const emoticonBubbleLayersSchema = z.array(emoticonBubbleSchema).max(4);

export const emoticonImageEditRecipeSchema = z.object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative().max(10_000),
    crop: z.object({
        left: z.number().finite().min(0).max(0.45),
        right: z.number().finite().min(0).max(0.45),
        top: z.number().finite().min(0).max(0.45),
        bottom: z.number().finite().min(0).max(0.45),
    }),
    scale: z.number().finite().min(0.5).max(1.6),
    offsetX: z.number().finite().min(-0.45).max(0.45),
    offsetY: z.number().finite().min(-0.45).max(0.45),
    flipHorizontal: z.boolean(),
    rotationDeg: z.number().finite().min(-45).max(45),
    transparentPadding: z.number().finite().min(0).max(0.3),
    brightness: z.number().finite().min(-0.5).max(0.5).default(0),
    contrast: z.number().finite().min(-0.5).max(0.5).default(0),
    saturation: z.number().finite().min(-0.5).max(0.5).default(0),
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

export type EmoticonImageEditRecipe = z.infer<typeof emoticonImageEditRecipeSchema>;

export function createIdentityEmoticonImageEditRecipe(
    revision = 0,
): EmoticonImageEditRecipe {
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

export const emoticonMotionOverrideSchema = z.object({
    fps: z.number().int().min(2).max(18),
  frameCount: z.number().int().min(4).max(24),
    durationMs: z.number().int().min(700).max(3000),
}).refine((motion) => (
    Math.abs(motion.durationMs - Math.round((motion.frameCount / motion.fps) * 1000)) <= 120
), {
    message: 'FPS, frame count, and duration are inconsistent.',
    path: ['durationMs'],
});

const emoticonFormatCapabilitySchema = z.object({
    alpha: z.enum(['supported', 'unsupported']),
});

const emoticonFormatCapabilitiesSchema = z.object({
    png: emoticonFormatCapabilitySchema.optional(),
    apng: emoticonFormatCapabilitySchema.optional(),
    webp: emoticonFormatCapabilitySchema.optional(),
    gif: emoticonFormatCapabilitySchema.optional(),
    mp4: emoticonFormatCapabilitySchema.optional(),
    webm: emoticonFormatCapabilitySchema.optional(),
    png_zip: emoticonFormatCapabilitySchema.optional(),
});

export const emoticonOutputProfileSchema = z.object({
    platform: emoticonOutputPlatformSchema,
    type: z.enum(['static', 'animated']),
    width: z.number().int().min(64).max(2048),
    height: z.number().int().min(64).max(2048),
    profileVersion: z.string().trim().min(1).max(80),
    verification: z.enum(['reference', 'verified']).default('reference'),
    transparentBackground: z.boolean().default(true),
    sourceUrl: z.string().url().optional(),
    checkedAt: z.string().datetime().optional(),
    allowedFormats: z.array(emoticonExportFormatSchema).min(1).max(7).optional(),
    minFrameCount: z.number().int().min(1).max(24).optional(),
    maxFrameCount: z.number().int().min(1).max(24).optional(),
    maxFileSizeBytes: z.number().int().positive().max(1024 * 1024 * 1024).optional(),
    maxDurationMs: z.number().int().positive().max(60_000).optional(),
    loopCount: z.number().int().min(0).max(10_000).optional(),
    formatCapabilities: emoticonFormatCapabilitiesSchema.optional(),
    submissionCandidate: z.literal(false).optional(),
}).superRefine((profile, context) => {
    if (
        profile.minFrameCount !== undefined
        && profile.maxFrameCount !== undefined
        && profile.minFrameCount > profile.maxFrameCount
    ) {
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

export const emoticonReferenceImageSchema = z.object({
    sourceImageUrl: z.string().url().refine((value) => value.startsWith('https://'), {
        message: 'Reference images must use HTTPS.',
    }),
    sourceStoragePath: z.string().min(1).max(700),
});

export const emoticonManualFrameAssetSchema = z.object({
    uploadRequestId: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
    sourceImageUrl: z.string().url().refine((value) => value.startsWith('https://'), {
        message: 'Imported frames must use HTTPS.',
    }),
    sourceStoragePath: z.string().min(1).max(700),
    fileName: z.string().trim().min(1).max(180),
    contentType: z.literal('image/png'),
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const emoticonManualFrameTimingSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('fps'),
        fps: z.number().int().min(1).max(30),
    }),
    z.object({
        mode: z.literal('per_frame'),
        frameDurationsMs: z.array(z.number().int().min(40).max(2000)).min(2).max(24),
    }),
]);

export const EMOTICON_FRAME_TRANSITION_KINDS = ['cut', 'fade', 'slide_left', 'slide_right', 'zoom'] as const;
export const emoticonFrameTransitionSchema = z.object({
    kind: z.enum(EMOTICON_FRAME_TRANSITION_KINDS).default('cut'),
    strength: z.number().finite().min(0.15).max(0.85).default(0.5),
});

export const emoticonManualFrameImportSchema = z.object({
    schemaVersion: z.literal(1),
    requestId: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
    frames: z.array(emoticonManualFrameAssetSchema).min(1).max(24),
    timing: emoticonManualFrameTimingSchema,
}).superRefine((manualImport, context) => {
    const storagePaths = manualImport.frames.map((frame) => frame.sourceStoragePath);
    const uploadIds = manualImport.frames.map((frame) => frame.uploadRequestId);
    if (new Set(storagePaths).size !== storagePaths.length || new Set(uploadIds).size !== uploadIds.length) {
        context.addIssue({ code: 'custom', path: ['frames'], message: 'Imported frame assets must be unique.' });
    }
    if (
        manualImport.timing.mode === 'per_frame'
        && manualImport.timing.frameDurationsMs.length !== manualImport.frames.length
    ) {
        context.addIssue({
            code: 'custom',
            path: ['timing', 'frameDurationsMs'],
            message: 'Per-frame timing count must match the imported frame count.',
        });
    }
});

export const emoticonManualFrameImportReportSchema = z.object({
    schemaVersion: z.literal(1),
    technicalOnly: z.literal(true),
    aiCalls: z.literal(0),
    identityVerified: z.literal(false),
    motionVerified: z.literal(false),
    sourceFrameCount: z.number().int().min(1).max(24),
    timingMode: z.enum(['fps', 'per_frame']),
    frameDurationsMs: z.array(z.number().int().min(40).max(2000)).max(24),
});

export const emoticonBatchCountsSchema = z.object({
    total: z.number().int().min(1).max(64),
    pending: z.number().int().min(0).max(64),
    queued: z.number().int().min(0).max(64),
    running: z.number().int().min(0).max(64),
    deferred: z.number().int().min(0).max(64),
    completed: z.number().int().min(0).max(64),
    failed: z.number().int().min(0).max(64),
    cancelled: z.number().int().min(0).max(64),
    notEnqueued: z.number().int().min(0).max(64),
}).refine((counts) => (
    counts.pending
    + counts.queued
    + counts.running
    + counts.deferred
    + counts.completed
    + counts.failed
    + counts.cancelled
    + counts.notEnqueued
    === counts.total
), { message: 'Batch item counts must equal the total.' });

export const emoticonBatchItemSchema = z.object({
    itemId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    status: emoticonBatchItemStatusSchema,
    progress: z.number().int().min(0).max(100),
    attemptCount: z.number().int().min(1).max(8),
    enqueueRoundId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    retryRound: z.number().int().min(0).max(99).optional(),
    enqueueProjectItemRevision: z.number().int().nonnegative().optional(),
    jobIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)).max(8),
    currentJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).nullable(),
    enqueueError: z.string().max(240).nullable(),
    jobError: z.string().max(240).nullable(),
    deferredUntilMs: z.number().int().nonnegative().nullable(),
    lastEnqueueAt: z.unknown().optional(),
    completedAt: z.unknown().optional(),
});

export const emoticonBatchRetryExclusionReasonSchema = z.enum([
    'project_item_completed',
    'project_item_active',
    'project_item_replaced',
]);

export const emoticonBatchRetryTargetSchema = z.object({
    itemId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    itemRevision: z.number().int().nonnegative(),
    // Default keeps batches written before enqueue-round fencing readable.
    attemptCount: z.number().int().min(1).max(8).default(1),
});

export const emoticonBatchRetrySkippedItemSchema = z.object({
    itemId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    reason: emoticonBatchRetryExclusionReasonSchema,
    supersededByJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).nullable(),
});

export const emoticonBatchSchema = z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    userId: z.string().min(1).max(128),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    projectRevision: z.number().int().nonnegative(),
    itemIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)).min(1).max(64),
    requestedConcurrency: z.number().int().min(1).max(3),
    status: emoticonBatchStatusSchema,
    progressPercent: z.number().int().min(0).max(100),
    counts: emoticonBatchCountsSchema,
    items: z.array(emoticonBatchItemSchema).min(1).max(64),
    retryRound: z.number().int().min(0).max(99),
    enqueueRoundId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    enqueueItemAttempts: z.record(
        z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
        z.number().int().min(1).max(8),
    ).optional(),
    enqueueItemRevisions: z.record(
        z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
        z.number().int().nonnegative(),
    ).optional(),
    enqueueRoundOpenedAtMs: z.number().int().nonnegative().optional(),
    enqueueRoundLeaseExpiresAtMs: z.number().int().nonnegative().optional(),
    lastRetryRequestId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    lastRetryItemIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)).max(64).optional(),
    lastRetryProjectRevision: z.number().int().nonnegative().optional(),
    lastRetryTargets: z.array(emoticonBatchRetryTargetSchema).max(64).optional(),
    lastRetrySkippedItems: z.array(emoticonBatchRetrySkippedItemSchema).max(64).optional(),
    lastRetryEnqueueRoundId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    executionJobIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)).max(3).default([]),
    executionSlotUpdatedAt: z.unknown().optional(),
    cancelRequestedAt: z.unknown().optional(),
    startedAt: z.unknown().optional(),
    completedAt: z.unknown().optional(),
    createdAt: z.unknown().optional(),
    updatedAt: z.unknown().optional(),
}).superRefine((batch, context) => {
    const uniqueItemIds = new Set(batch.itemIds);
    const itemStateIds = new Set(batch.items.map((item) => item.itemId));
    if (
        uniqueItemIds.size !== batch.itemIds.length
        || itemStateIds.size !== batch.items.length
        || batch.itemIds.some((itemId) => !itemStateIds.has(itemId))
    ) {
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
    const retryTargetIds = batch.lastRetryTargets?.map((target) => target.itemId) || [];
    const skippedIds = batch.lastRetrySkippedItems?.map((item) => item.itemId) || [];
    if (
        new Set(retryTargetIds).size !== retryTargetIds.length
        || retryTargetIds.some((itemId) => !uniqueItemIds.has(itemId))
        || (batch.lastRetryTargets && batch.lastRetryItemIds && (
            batch.lastRetryItemIds.length !== retryTargetIds.length
            || batch.lastRetryItemIds.some((itemId, index) => itemId !== retryTargetIds[index])
        ))
    ) {
        context.addIssue({
            code: 'custom',
            path: ['lastRetryTargets'],
            message: 'Retry targets must match the batch items and their revision bindings.',
        });
    }
    if (
        new Set(skippedIds).size !== skippedIds.length
        || skippedIds.some((itemId) => !uniqueItemIds.has(itemId) || retryTargetIds.includes(itemId))
    ) {
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
                return Boolean(
                    item
                    && item.enqueueRoundId === batch.enqueueRoundId
                    && item.retryRound === batch.retryRound
                    && item.attemptCount === attempts[itemId]
                    && item.enqueueProjectItemRevision === revisions[itemId],
                );
            })
            && revisionsIds.every((itemId) => roundItemIds.includes(itemId));
        const pendingItemsAreCurrent = batch.items
            .filter((item) => item.status === 'pending')
            .every((item) => (
                item.enqueueRoundId === batch.enqueueRoundId
                && item.retryRound === batch.retryRound
                && attempts[item.itemId] === item.attemptCount
                && revisions[item.itemId] === item.enqueueProjectItemRevision
            ));
        if (
            batch.enqueueRoundOpenedAtMs === undefined
            || batch.enqueueRoundLeaseExpiresAtMs === undefined
            || batch.enqueueRoundLeaseExpiresAtMs <= batch.enqueueRoundOpenedAtMs
            || !roundItemsAreValid
            || !pendingItemsAreCurrent
        ) {
            context.addIssue({
                code: 'custom',
                path: ['enqueueRoundId'],
                message: 'The active enqueue round, item attempts, revisions, and lease must agree.',
            });
        }
    }
});

export const emoticonJobRequestSchema = z.object({
    id: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    sourceImageUrl: z.string().url().refine((value) => value.startsWith('https://'), {
        message: 'Source images must use HTTPS.',
    }),
    sourceStoragePath: z.string().min(1).max(500),
    referenceImages: z.array(emoticonReferenceImageSchema).max(3).default([]),
    instruction: z.string().trim().min(2).max(800),
    templateRequest: z.string().trim().min(8).max(800).optional(),
    templateItemCount: z.number().int().min(1).max(64).optional(),
    profileJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    sheetRequest: z.string().trim().min(8).max(800).optional(),
    sheetItemCount: z.number().int().min(1).max(64).optional(),
    manualImport: emoticonManualFrameImportSchema.optional(),
    bubbleOverride: emoticonBubbleSchema.optional(),
    bubbleLayersOverride: emoticonBubbleLayersSchema.optional(),
    motionOverride: emoticonMotionOverrideSchema.optional(),
    outputProfile: emoticonOutputProfileSchema.optional(),
    motionPreference: emoticonMotionPreferenceSchema.default('auto'),
    // Missing means a job created before the saving-mode rollout. Preserve
    // its original premium behaviour while every new client writes a mode.
    resourceMode: emoticonResourceModeSchema.default('premium'),
    // Opt-in fence for the paid GPT Light path. Efficient jobs written before
    // this field existed keep the legacy zero-provider composite behavior.
    aiGenerationProfile: z.literal('gpt-light-v1').optional(),
    analysisEstimate: emoticonCharacterAnalysisEstimateSchema.optional(),
    rightsAttested: z.boolean().optional(),
    assetProvenance: z.object({
        kind: z.enum(['uploaded', 'existing_asset']),
        sourceStoragePaths: z.array(z.string().min(1).max(500)).min(1).max(4),
    }).optional(),
    formats: z.array(emoticonExportFormatSchema).min(1).max(7).refine(
        (formats) => new Set(formats).size === formats.length,
        { message: 'Output formats must be unique.' },
    ).default(['webp']),
    mode: emoticonJobModeSchema.default('generate'),
    parentJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    repairFrameIndex: z.number().int().min(0).max(23).optional(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    projectItemId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    batchId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    batchEnqueueRoundId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
    batchRetryRound: z.number().int().min(0).max(99).optional(),
    batchItemAttemptCount: z.number().int().min(1).max(8).optional(),
    projectRevision: z.number().int().nonnegative().optional(),
    projectItemRevision: z.number().int().nonnegative().optional(),
    renderOverrides: z.object({
        bubble: emoticonBubbleSchema.optional(),
        bubbleLayers: emoticonBubbleLayersSchema.optional(),
        motion: emoticonMotionOverrideSchema.optional(),
        outputProfile: emoticonOutputProfileSchema.optional(),
        editRecipe: emoticonImageEditRecipeSchema.optional(),
        frameDurationsMs: z.array(z.number().int().min(40).max(2000)).min(2).max(24).optional(),
        frameTransitions: z.array(emoticonFrameTransitionSchema).min(2).max(24).optional(),
    }).optional(),
    status: z.literal('queued'),
    progress: z.number().int().min(0).max(100).optional(),
    statusMessage: z.string().max(240).optional(),
    cancelRequestedAt: z.unknown().optional(),
    cancelledAt: z.unknown().optional(),
}).superRefine((request, context) => {
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
        } else {
            const frameCount = request.manualImport.frames.length;
            if (request.sourceStoragePath !== request.manualImport.frames[0]?.sourceStoragePath) {
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
            if (
                frameCount === 1
                && (request.manualImport.timing.mode !== 'fps' || request.manualImport.timing.fps !== 1)
            ) {
                context.addIssue({
                    code: 'custom',
                    path: ['manualImport', 'timing'],
                    message: 'A static manual import must use FPS 1.',
                });
            }
        }
    } else if (request.manualImport) {
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

export const emoticonCharacterAnalysisSchema = z.object({
    schemaVersion: z.literal(1),
    analysisRevision: z.literal(2).default(2),
    summary: z.string().trim().min(1).max(480),
    attributes: z.object({
        face: z.string().trim().min(1).max(240),
        eyes: z.string().trim().min(1).max(240),
        hair: z.string().trim().min(1).max(240),
        bodyShape: z.string().trim().min(1).max(240),
        outfit: z.string().trim().min(1).max(320),
        accessories: z.array(z.string().trim().min(1).max(120)).max(8),
        distinctiveFeatures: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
        palette: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
        lineArt: z.string().trim().min(1).max(240),
        shading: z.string().trim().min(1).max(240),
        proportions: z.string().trim().min(1).max(240),
        limbStructure: z.string().trim().min(1).max(240),
    }),
    immutableLock: z.array(z.string().trim().min(1).max(180)).min(1).max(16),
    styleLock: z.array(z.string().trim().min(1).max(180)).min(1).max(12),
    negativeLock: z.array(z.string().trim().min(1).max(180)).min(1).max(16),
    motionTraits: z.object({
        hair: z.string().trim().min(1).max(240),
        clothing: z.string().trim().min(1).max(240),
        groundAnchor: z.string().trim().min(1).max(240),
        centerAnchor: z.string().trim().min(1).max(240),
        articulatedParts: z.array(z.string().trim().min(1).max(120)).max(12),
    }).default({
        hair: '확인 필요',
        clothing: '확인 필요',
        groundAnchor: '발바닥 접지점을 기준으로 유지',
        centerAnchor: '몸통 중심을 기준으로 유지',
        articulatedParts: [],
    }),
    imageQuality: z.object({
        score: z.number().int().min(0).max(100),
        resolution: z.string().trim().min(1).max(160),
        backgroundIsolation: z.string().trim().min(1).max(240),
        cropping: z.string().trim().min(1).max(240),
        issues: z.array(z.string().trim().min(1).max(180)).max(8),
        usableForGeneration: z.boolean(),
    }).default({
        score: 0,
        resolution: '기존 분석에는 해상도 평가가 없습니다.',
        backgroundIsolation: '기존 분석에는 배경 분리 평가가 없습니다.',
        cropping: '기존 분석에는 잘림 평가가 없습니다.',
        issues: ['새 분석으로 원본 이미지 품질을 확인하세요.'],
        usableForGeneration: true,
    }),
    confidenceNotes: z.array(z.string().trim().min(1).max(180)).max(8),
    confirmationRequired: z.array(z.string().trim().min(1).max(180)).max(8).default([]),
    referenceCount: z.number().int().min(1).max(4),
});

export const emoticonCharacterSheetItemSchema = z.object({
    title: z.string().trim().min(1).max(80),
    angle: z.string().trim().min(1).max(120),
    expression: z.string().trim().min(1).max(120),
    pose: z.string().trim().min(1).max(180),
    instruction: z.string().trim().min(20).max(800),
});

export const emoticonCharacterSheetPlanSchema = z.object({
    schemaVersion: z.literal(1),
    requestSummary: z.string().trim().min(1).max(320),
    items: z.array(emoticonCharacterSheetItemSchema).min(1).max(64),
}).superRefine((plan, context) => {
    const signatures = new Set<string>();
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
        frameCount: z.number().int().min(4).max(24),
        fps: z.number().int().min(2).max(18),
        loopDescription: z.string().min(1).max(200),
        imagePrompt: z.string().min(20).max(2400),
        videoPrompt: z.string().min(20).max(2400),
        negativePrompt: z.string().min(1).max(1200),
        authorizedProps: z.array(z.string().trim().min(1).max(80)).max(2).default([]),
        motionAccents: z.array(z.string().trim().min(1).max(80)).max(3).default([]),
    }),
    bubble: emoticonBubbleSchema,
    bubbleLayers: emoticonBubbleLayersSchema.optional(),
    suggestedPresets: z.array(emoticonPresetSchema).max(64),
});

export const emoticonManualStoredPlanSchema = emoticonPlanSchema.extend({
    action: emoticonPlanSchema.shape.action.extend({
        durationMs: z.number().int().min(0).max(60_000),
        frameCount: z.number().int().min(1).max(24),
        fps: z.number().min(0.1).max(30),
    }),
});

export const emoticonStoredPlanSchema = z.union([
    emoticonPlanSchema,
    emoticonManualStoredPlanSchema,
]);

export const emoticonQualitySchema = z.object({
    overall: z.number().min(0).max(100),
    identity: z.number().min(0).max(100),
    allReferencesConsistent: z.boolean().default(false),
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
    generationModel: z.string().min(1).max(200).optional(),
    generationProvider: z.string().min(1).max(100).optional(),
    generationRequestId: z.string().min(1).max(200).optional(),
    generationSeed: z.number().int().nonnegative().optional(),
    generationCostUsd: z.number().nonnegative().optional(),
});

export const emoticonAlphaBoundsFrameEvidenceSchema = z.object({
    frameIndex: z.number().int().min(0).max(23),
    visiblePixelCount: z.number().int().nonnegative(),
    bounds: z.object({
        left: z.number().int().nonnegative(),
        top: z.number().int().nonnegative(),
        right: z.number().int().nonnegative(),
        bottom: z.number().int().nonnegative(),
    }).nullable(),
    transparentMargins: z.object({
        left: z.number().int().nonnegative(),
        top: z.number().int().nonnegative(),
        right: z.number().int().nonnegative(),
        bottom: z.number().int().nonnegative(),
    }).nullable(),
    minimumTransparentMarginPx: z.number().int().nonnegative().nullable(),
    touchesCanvasEdge: z.boolean(),
    hasUsableTransparentMargin: z.boolean(),
});

export const emoticonAlphaBoundsEvidenceSchema = z.object({
    alphaThreshold: z.number().int().min(1).max(254),
    requiredTransparentMarginPx: z.number().int().min(1).max(256),
    checkedFrameCount: z.number().int().min(1).max(24),
    allFramesHaveVisibleContent: z.boolean(),
    allFramesHaveUsableTransparentMargin: z.boolean(),
    edgeTouchFrameIndices: z.array(z.number().int().min(0).max(23)).max(24),
    insufficientMarginFrameIndices: z.array(z.number().int().min(0).max(23)).max(24),
    frames: z.array(emoticonAlphaBoundsFrameEvidenceSchema).min(1).max(24),
});

export const emoticonOutputInspectionSchema = z.object({
    format: emoticonExportFormatSchema,
    fileSizeBytes: z.number().int().nonnegative(),
    width: z.number().int().min(1).nullable(),
    height: z.number().int().min(1).nullable(),
    frameCount: z.number().int().min(1),
    fps: z.number().min(0).nullable(),
    durationMs: z.number().int().min(0).nullable(),
    loop: z.boolean().nullable(),
    hasAlpha: z.boolean(),
    transparencyCoverage: z.number().min(0).max(1).nullable(),
    alphaBoundsEvidence: emoticonAlphaBoundsEvidenceSchema.nullable().optional(),
    codec: z.string().min(1).max(80).nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    inspectedAt: z.string().datetime(),
    inspectorVersion: z.string().min(1).max(40),
    passed: z.boolean(),
    issues: z.array(z.string().min(1).max(180)).max(12),
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
    frames: z.array(emoticonFrameDirectionSchema).min(4).max(24),
});

const emoticonContinuationMetadataSchema = z.object({
    retryCount: z.number().int().min(0).max(2).default(0),
    state: z.enum([
        'checkpointed',
        'queued',
        'running',
        'completed',
        'failed',
        'cancelled',
    ]).optional(),
    token: z.string().regex(/^[A-Za-z0-9-]{1,160}$/).optional(),
    requestedAt: z.unknown().optional(),
    leaseExpiresAtMs: z.number().int().nonnegative().optional(),
});

export const emoticonPipelineContinuationSchema = emoticonContinuationMetadataSchema.extend({
    stage: z.enum([
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

export const emoticonFrameContinuationSchema = emoticonContinuationMetadataSchema.extend({
    stage: z.enum(['planning', 'generation', 'review', 'render']),
    pass: z.union([z.literal(1), z.literal(2)]),
    startIndex: z.number().int().min(0).max(24),
    nextFrameIndex: z.number().int().min(0).max(24),
    totalGenerationCalls: z.number().int().min(0).max(48),
    correction: z.string().trim().min(1).max(1200).optional(),
    repairFrameIndices: z.array(z.number().int().min(0).max(23)).max(2).optional(),
    nextRepairCursor: z.number().int().min(0).max(2).optional(),
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
        if (
            state.pass !== 2
            || new Set(state.repairFrameIndices).size !== state.repairFrameIndices.length
            || (state.nextRepairCursor as number) > state.repairFrameIndices.length
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Selective repair must use one ordered, bounded second-pass cursor.',
                path: ['repairFrameIndices'],
            });
        }
    }
});

export const emoticonContinuationStateSchema = z.union([
    emoticonPipelineContinuationSchema,
    emoticonFrameContinuationSchema,
]);

export const emoticonContinuationDocumentSchema = z.object({
    userId: z.string().min(1).max(128),
    jobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    token: z.string().regex(/^[A-Za-z0-9-]{1,160}$/),
    runToken: z.string().regex(/^[A-Za-z0-9-]{1,160}$/),
    status: z.enum([
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
    stage: z.enum([
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
    attemptCount: z.number().int().nonnegative().optional(),
    leaseExpiresAtMs: z.number().int().nonnegative().optional(),
    expiresAt: z.unknown().optional(),
    createdAt: z.unknown().optional(),
    updatedAt: z.unknown().optional(),
});

export const emoticonMotionReviewSchema = z.object({
    overall: z.number().min(0).max(100),
    identity: z.number().min(0).max(100),
    allReferencesConsistent: z.boolean().default(false),
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

export const emoticonRenderFailureRecoverySchema = z.object({
    stage: z.literal('render'),
    category: z.literal('infrastructure'),
    poseAccepted: z.literal(true),
    markedAt: z.unknown().optional(),
});

export const emoticonFrameRepairSchema = z.object({
    parentJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    frameIndex: z.number().int().min(0).max(23),
    maxGenerationCalls: z.literal(1),
    generationCalls: z.number().int().min(0).max(1),
    maxPoseReviewCalls: z.literal(1).optional(),
    poseReviewCalls: z.number().int().min(0).max(1).optional(),
    maxSequenceReviewCalls: z.literal(1).optional(),
    sequenceReviewCalls: z.number().int().min(0).max(1).optional(),
    validation: z.enum([
        'local-frame-variation+output-inspection',
        'local-variation+pose-semantic+sequence-motion+output-inspection',
    ]),
    poseReview: emoticonQualitySchema.optional(),
    motionReview: emoticonMotionReviewSchema.optional(),
    replacementFrame: emoticonAnimationFrameSchema.optional(),
});

export type EmoticonExportFormat = z.infer<typeof emoticonExportFormatSchema>;
export type EmoticonResourceMode = z.infer<typeof emoticonResourceModeSchema>;
export type EmoticonJobRequest = z.infer<typeof emoticonJobRequestSchema>;
export type EmoticonBatch = z.infer<typeof emoticonBatchSchema>;
export type EmoticonBatchItem = z.infer<typeof emoticonBatchItemSchema>;
export type EmoticonBatchRetryExclusionReason = z.infer<typeof emoticonBatchRetryExclusionReasonSchema>;
export type EmoticonBatchRetryTarget = z.infer<typeof emoticonBatchRetryTargetSchema>;
export type EmoticonBatchRetrySkippedItem = z.infer<typeof emoticonBatchRetrySkippedItemSchema>;
export type EmoticonBubble = z.infer<typeof emoticonBubbleSchema>;
export type EmoticonBubbleAppearance = z.infer<typeof emoticonBubbleAppearanceSchema>;
export type EmoticonMotionOverride = z.infer<typeof emoticonMotionOverrideSchema>;
export type EmoticonOutputProfile = z.infer<typeof emoticonOutputProfileSchema>;
export type EmoticonManualFrameAsset = z.infer<typeof emoticonManualFrameAssetSchema>;
export type EmoticonManualFrameTiming = z.infer<typeof emoticonManualFrameTimingSchema>;
export type EmoticonFrameTransition = z.infer<typeof emoticonFrameTransitionSchema>;
export type EmoticonManualFrameImport = z.infer<typeof emoticonManualFrameImportSchema>;
export type EmoticonManualFrameImportReport = z.infer<typeof emoticonManualFrameImportReportSchema>;
export type EmoticonCharacterProfile = z.infer<typeof emoticonCharacterProfileSchema>;
export type EmoticonCharacterAnalysis = z.infer<typeof emoticonCharacterAnalysisSchema>;
export type EmoticonCharacterSheetItem = z.infer<typeof emoticonCharacterSheetItemSchema>;
export type EmoticonCharacterSheetPlan = z.infer<typeof emoticonCharacterSheetPlanSchema>;
export type EmoticonPreset = z.infer<typeof emoticonPresetSchema>;
export type EmoticonPlan = z.infer<typeof emoticonPlanSchema>;
export type EmoticonQuality = z.infer<typeof emoticonQualitySchema>;
export type EmoticonAnimationFrame = z.infer<typeof emoticonAnimationFrameSchema>;
export type EmoticonAlphaBoundsFrameEvidence = z.infer<typeof emoticonAlphaBoundsFrameEvidenceSchema>;
export type EmoticonAlphaBoundsEvidence = z.infer<typeof emoticonAlphaBoundsEvidenceSchema>;
export type EmoticonOutputInspection = z.infer<typeof emoticonOutputInspectionSchema>;
export type EmoticonFrameDirection = z.infer<typeof emoticonFrameDirectionSchema>;
export type EmoticonFrameSequence = z.infer<typeof emoticonFrameSequenceSchema>;
export type EmoticonContinuationState = z.infer<typeof emoticonContinuationStateSchema>;
export type EmoticonContinuationDocument = z.infer<typeof emoticonContinuationDocumentSchema>;
export type EmoticonFrameRepair = z.infer<typeof emoticonFrameRepairSchema>;
export type EmoticonMotionReview = z.infer<typeof emoticonMotionReviewSchema>;
export type EmoticonRenderFailureRecovery = z.infer<typeof emoticonRenderFailureRecoverySchema>;
