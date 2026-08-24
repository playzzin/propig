import { z } from 'zod';

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
export const EMOTICON_JOB_STATUSES = [
  'queued',
  'analyzing',
  'generating',
  'validating',
  'animating',
  'rendering',
  'completed',
  'failed',
  'cancelled',
] as const;
export const EMOTICON_BATCH_STATUSES = [
  'preparing',
  'running',
  'deferred',
  'completed',
  'partial',
  'failed',
  'cancelled',
] as const;
export const EMOTICON_BATCH_ITEM_STATUSES = [
  'pending',
  'queued',
  'running',
  'deferred',
  'completed',
  'failed',
  'cancelled',
  'not_enqueued',
] as const;
export const EMOTICON_BATCH_RETRY_EXCLUSION_REASONS = [
  'project_item_completed',
  'project_item_active',
  'project_item_replaced',
] as const;

export function hasEmoticonProjectItemLeaseConflict(params: {
  currentStatus?: string | null;
  currentJobId?: string | null;
  nextJobId: string;
}): boolean {
  const activelyGenerating = params.currentStatus === 'queued' || params.currentStatus === 'generating';
  return activelyGenerating && params.currentJobId !== params.nextJobId;
}

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
export const emoticonJobStatusSchema = z.enum(EMOTICON_JOB_STATUSES);
export const emoticonBatchStatusSchema = z.enum(EMOTICON_BATCH_STATUSES);
export const emoticonBatchItemStatusSchema = z.enum(EMOTICON_BATCH_ITEM_STATUSES);
export const emoticonBatchRetryExclusionReasonSchema = z.enum(
  EMOTICON_BATCH_RETRY_EXCLUSION_REASONS,
);
export const emoticonBubbleFontSchema = z.enum(EMOTICON_BUBBLE_FONTS);
export const emoticonBubbleTimelineModeSchema = z.enum(EMOTICON_BUBBLE_TIMELINE_MODES);
export const emoticonOutputPlatformSchema = z.enum(EMOTICON_OUTPUT_PLATFORMS);

export const emoticonBubbleCueSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().trim().min(1).max(36),
  startFrame: z.number().int().min(0).max(23),
  endFrame: z.number().int().min(0).max(23),
}).refine((cue) => cue.startFrame <= cue.endFrame, {
  message: '말풍선 종료 프레임은 시작 프레임보다 빠를 수 없습니다.',
  path: ['endFrame'],
});

export const emoticonBubbleTimelineSchema = z.object({
  mode: emoticonBubbleTimelineModeSchema.default('full'),
  startFrame: z.number().int().min(0).max(23).default(0),
  endFrame: z.number().int().min(0).max(23).nullable().default(null),
  cues: z.array(emoticonBubbleCueSchema).max(6).default([]),
}).refine((timeline) => timeline.endFrame === null || timeline.startFrame <= timeline.endFrame, {
  message: '말풍선 종료 프레임은 시작 프레임보다 빠를 수 없습니다.',
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
        message: '말풍선 문구 구간은 서로 겹칠 수 없습니다.',
      });
    }
  }
});

export const emoticonBubbleHexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, {
  message: '색상은 #RRGGBB 형식이어야 합니다.',
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

/**
 * Absolute, non-destructive image adjustments applied to the verified source
 * pose/frames. Values are normalized so one recipe behaves the same for every
 * output profile and every frame in an animation.
 */
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
      message: '좌우 자르기 합계는 이미지 너비의 80%를 넘을 수 없습니다.',
    });
  }
  if (recipe.crop.top + recipe.crop.bottom > 0.8) {
    context.addIssue({
      code: 'custom',
      path: ['crop'],
      message: '상하 자르기 합계는 이미지 높이의 80%를 넘을 수 없습니다.',
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

export function isIdentityEmoticonImageEditRecipe(
  recipe: EmoticonImageEditRecipe,
): boolean {
  return recipe.crop.left === 0
    && recipe.crop.right === 0
    && recipe.crop.top === 0
    && recipe.crop.bottom === 0
    && recipe.scale === 1
    && recipe.offsetX === 0
    && recipe.offsetY === 0
    && recipe.flipHorizontal === false
    && recipe.rotationDeg === 0
    && recipe.transparentPadding === 0
    && (recipe.brightness ?? 0) === 0
    && (recipe.contrast ?? 0) === 0
    && (recipe.saturation ?? 0) === 0;
}

export const emoticonMotionOverrideSchema = z.object({
  fps: z.number().int().min(2).max(18),
  frameCount: z.number().int().min(4).max(24),
  durationMs: z.number().int().min(700).max(3000),
}).refine((motion) => (
  Math.abs(motion.durationMs - Math.round((motion.frameCount / motion.fps) * 1000)) <= 120
), {
  message: 'FPS, 프레임 수, 재생 시간이 서로 맞지 않습니다.',
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
      message: '최대 프레임 수는 최소 프레임 수보다 작을 수 없습니다.',
    });
  }
  if (profile.allowedFormats && new Set(profile.allowedFormats).size !== profile.allowedFormats.length) {
    context.addIssue({
      code: 'custom',
      path: ['allowedFormats'],
      message: '허용 파일 형식은 중복될 수 없습니다.',
    });
  }
});

export const emoticonReferenceImageSchema = z.object({
  sourceImageUrl: z.string().url(),
  sourceStoragePath: z.string().min(1).max(700),
});

export const emoticonManualFrameAssetSchema = z.object({
  uploadRequestId: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
  sourceImageUrl: z.string().url(),
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
    context.addIssue({ code: 'custom', path: ['frames'], message: '같은 수동 프레임을 두 번 사용할 수 없습니다.' });
  }
  if (
    manualImport.timing.mode === 'per_frame'
    && manualImport.timing.frameDurationsMs.length !== manualImport.frames.length
  ) {
    context.addIssue({ code: 'custom', path: ['timing', 'frameDurationsMs'], message: '프레임별 시간 수가 이미지 장수와 다릅니다.' });
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
        message: '시트 항목의 각도·표정·자세 조합은 중복될 수 없습니다.',
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
  backgroundClean: z.number().min(0).max(100).default(0),
  singleCharacter: z.boolean().default(false),
  occlusionFree: z.number().min(0).max(100).default(0),
  issues: z.array(z.string().min(1).max(180)).max(8),
  correction: z.string().max(600),
});

export const EMOTICON_POSE_ACCEPTANCE = {
  identity: 76,
  referenceOverrideIdentity: 80,
  referenceOverrideStyleConsistency: 80,
  overall: 72,
  actionClarity: 72,
  styleConsistency: 80,
  backgroundClean: 88,
  occlusionFree: 85,
} as const;

export function meetsEmoticonPoseAcceptance(
  quality: z.infer<typeof emoticonQualitySchema>,
): boolean {
  return quality.identity >= EMOTICON_POSE_ACCEPTANCE.identity
    && quality.overall >= EMOTICON_POSE_ACCEPTANCE.overall
    && quality.actionClarity >= EMOTICON_POSE_ACCEPTANCE.actionClarity
    && quality.styleConsistency >= EMOTICON_POSE_ACCEPTANCE.styleConsistency
    && quality.backgroundClean >= EMOTICON_POSE_ACCEPTANCE.backgroundClean
    && quality.singleCharacter
    && quality.occlusionFree >= EMOTICON_POSE_ACCEPTANCE.occlusionFree
    && (
      quality.allReferencesConsistent
      || (
        quality.identity >= EMOTICON_POSE_ACCEPTANCE.referenceOverrideIdentity
        && quality.styleConsistency >= EMOTICON_POSE_ACCEPTANCE.referenceOverrideStyleConsistency
      )
    );
}

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

export const emoticonGenerationMetadataSchema = z.object({
  model: z.string().min(1).max(200),
  provider: z.string().min(1).max(100).optional(),
  requestId: z.string().min(1).max(200),
  seed: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
});

export const emoticonSpriteSheetGenerationSchema = z.object({
  strategy: z.literal('sprite-sheet-v1'),
  state: z.enum(['extracting', 'extracted', 'rejected']),
  columns: z.number().int().min(1).max(8).optional(),
  rows: z.number().int().min(1).max(8).optional(),
  frameCount: z.number().int().min(1).max(24).optional(),
  storagePath: z.string().min(1).max(700).optional(),
  url: z.string().url().optional(),
  model: z.string().min(1).max(200).optional(),
  provider: z.string().min(1).max(100).optional(),
  requestId: z.string().min(1).max(200).optional(),
  costUsd: z.number().nonnegative().optional(),
  reason: z.string().min(1).max(400).optional(),
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
  if (
    state.repairFrameIndices
    && (
      state.pass !== 2
      || new Set(state.repairFrameIndices).size !== state.repairFrameIndices.length
      || (state.nextRepairCursor as number) > state.repairFrameIndices.length
    )
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Selective repair must use one ordered, bounded second-pass cursor.',
      path: ['repairFrameIndices'],
    });
  }
});

export const emoticonContinuationStateSchema = z.union([
  emoticonPipelineContinuationSchema,
  emoticonFrameContinuationSchema,
]);

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

export const EMOTICON_MOTION_ACCEPTANCE = {
  identity: 75,
  overall: 72,
  actionClarity: 68,
  styleConsistency: 72,
  frameConsistency: 72,
  loopContinuity: 65,
  backgroundClean: 88,
  occlusionFree: 85,
  limbOrExpressionChange: 68,
  referenceOverrideIdentity: 80,
  referenceOverrideStyleConsistency: 80,
} as const;

const LIMB_DRIVEN_MOTION_PATTERN = /달리|뛰|전력질주|걷|걸어|산책|춤|댄스|점프|튀어|도약|손\s*흔|팔\s*흔|인사|run(?:ning)?|sprint|walk(?:ing)?|dance|groov|jump(?:ing)?|hop|wave|greet/iu;
const EXPRESSION_DRIVEN_MOTION_PATTERN = /말하|수다|대화|외치|웃|미소|울|눈물|화나|놀라|깜짝|윙크|찡그|하품|speak|talk|shout|smile|laugh|cry|angry|surpris|wink|blink|yawn/iu;

export function getEmoticonMotionAcceptanceRequirements(
  plan: z.infer<typeof emoticonStoredPlanSchema>,
): { requireLimbMotion: boolean; requireExpressionMotion: boolean } {
  const actionText = [
    plan.directorSummary,
    plan.action.title,
    plan.action.action,
    plan.action.emotion,
    plan.action.videoPrompt,
  ].join(' ');
  const requireLimbMotion = LIMB_DRIVEN_MOTION_PATTERN.test(actionText);
  return {
    requireLimbMotion,
    requireExpressionMotion: requireLimbMotion || EXPRESSION_DRIVEN_MOTION_PATTERN.test(actionText),
  };
}

export function meetsEmoticonMotionAcceptance(
  review: z.infer<typeof emoticonMotionReviewSchema>,
  requirements: {
    requireLimbMotion?: boolean;
    requireExpressionMotion?: boolean;
  } = {},
): boolean {
  const limbMotionAccepted = review.limbPoseChange
    >= EMOTICON_MOTION_ACCEPTANCE.limbOrExpressionChange;
  const expressionMotionAccepted = review.facialExpressionChange
    >= EMOTICON_MOTION_ACCEPTANCE.limbOrExpressionChange;
  const requestedMotionAccepted = requirements.requireLimbMotion
    ? limbMotionAccepted && (!requirements.requireExpressionMotion || expressionMotionAccepted)
    : requirements.requireExpressionMotion
      ? expressionMotionAccepted
      : limbMotionAccepted || expressionMotionAccepted;
  return !review.cameraOnly
    && review.identity >= EMOTICON_MOTION_ACCEPTANCE.identity
    && review.overall >= EMOTICON_MOTION_ACCEPTANCE.overall
    && review.actionClarity >= EMOTICON_MOTION_ACCEPTANCE.actionClarity
    && review.styleConsistency >= EMOTICON_MOTION_ACCEPTANCE.styleConsistency
    && review.frameConsistency >= EMOTICON_MOTION_ACCEPTANCE.frameConsistency
    && review.loopContinuity >= EMOTICON_MOTION_ACCEPTANCE.loopContinuity
    && review.backgroundClean >= EMOTICON_MOTION_ACCEPTANCE.backgroundClean
    && review.singleCharacter
    && review.occlusionFree >= EMOTICON_MOTION_ACCEPTANCE.occlusionFree
    && requestedMotionAccepted
    && (
      review.allReferencesConsistent
      || (
        review.identity >= EMOTICON_MOTION_ACCEPTANCE.referenceOverrideIdentity
        && review.styleConsistency >= EMOTICON_MOTION_ACCEPTANCE.referenceOverrideStyleConsistency
      )
    );
}

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

export const emoticonOutputSchema = z.object({
  format: emoticonExportFormatSchema,
  url: z.string().url(),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  inspection: emoticonOutputInspectionSchema.optional(),
});

export const emoticonOutputsSchema = z.object({
  png: emoticonOutputSchema.optional(),
  apng: emoticonOutputSchema.optional(),
  webp: emoticonOutputSchema.optional(),
  gif: emoticonOutputSchema.optional(),
  mp4: emoticonOutputSchema.optional(),
  webm: emoticonOutputSchema.optional(),
  png_zip: emoticonOutputSchema.optional(),
});

export const emoticonSpecReportSchema = z.object({
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  frameCount: z.number().int().min(1).max(24),
  fps: z.number().int().min(1).max(60),
  durationMs: z.number().int().min(0).max(60_000),
  loop: z.boolean(),
  platform: emoticonOutputPlatformSchema.optional(),
  type: z.enum(['static', 'animated']).optional(),
  profileVersion: z.string().min(1).max(80).optional(),
  profileVerification: z.enum(['reference', 'verified']).optional(),
  outputInspections: z.array(emoticonOutputInspectionSchema).max(7).optional(),
  allOutputsPass: z.boolean().optional(),
  kakaoCanvasPass: z.boolean(),
  kakaoFramePass: z.boolean(),
  pngSequenceIncluded: z.boolean().optional(),
  submissionPackagePass: z.boolean().optional(),
  manualReviewRequired: z.literal(true).optional(),
  notes: z.array(z.string().min(1).max(240)).max(6).optional(),
  outputProfile: emoticonOutputProfileSchema.optional(),
  inspectedAt: z.string().datetime().optional(),
  actual: z.object({
    width: z.number().int().min(1).nullable(),
    height: z.number().int().min(1).nullable(),
    frameCount: z.number().int().min(1),
    fps: z.number().min(0).nullable(),
    durationMs: z.number().int().min(0).nullable(),
    loop: z.boolean().nullable(),
    hasAlpha: z.boolean(),
  }).nullable().optional(),
  outputs: z.object({
    png: emoticonOutputInspectionSchema.optional(),
    apng: emoticonOutputInspectionSchema.optional(),
    webp: emoticonOutputInspectionSchema.optional(),
    gif: emoticonOutputInspectionSchema.optional(),
    mp4: emoticonOutputInspectionSchema.optional(),
    webm: emoticonOutputInspectionSchema.optional(),
    png_zip: emoticonOutputInspectionSchema.optional(),
  }).optional(),
  technicalPass: z.boolean().optional(),
  profileVerified: z.boolean().optional(),
  submissionCandidate: z.boolean().optional(),
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
), { message: '배치 항목 집계가 전체 항목 수와 일치해야 합니다.' });

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

export const emoticonBatchRetryTargetSchema = z.object({
  itemId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  itemRevision: z.number().int().nonnegative(),
  // Default preserves reads of batches created before enqueue-round fencing.
  attemptCount: z.number().int().min(1).max(8).default(1),
});

export const emoticonBatchRetrySkippedItemSchema = z.object({
  itemId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  reason: emoticonBatchRetryExclusionReasonSchema,
  supersededByJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).nullable(),
});

export const emoticonBatchRetryResultSchema = z.object({
  batchId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  projectId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  projectRevision: z.number().int().nonnegative(),
  retryRound: z.number().int().min(0).max(99),
  enqueueRoundId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  itemIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)).max(64),
  items: z.array(emoticonBatchRetryTargetSchema).max(64),
  skippedItems: z.array(emoticonBatchRetrySkippedItemSchema).max(64),
  requestedConcurrency: z.number().int().min(1).max(3),
}).superRefine((result, context) => {
  const targetIds = result.items.map((item) => item.itemId);
  const skippedIds = result.skippedItems.map((item) => item.itemId);
  if (
    new Set(result.itemIds).size !== result.itemIds.length
    || new Set(targetIds).size !== targetIds.length
    || result.itemIds.length !== targetIds.length
    || result.itemIds.some((itemId, index) => itemId !== targetIds[index])
  ) {
    context.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'Retry item identifiers must uniquely match the revision-bound targets.',
    });
  }
  if (
    new Set(skippedIds).size !== skippedIds.length
    || skippedIds.some((itemId) => targetIds.includes(itemId))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['skippedItems'],
      message: 'Skipped retry items must be unique and disjoint from retry targets.',
    });
  }
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
      message: '배치 항목 번호는 중복 없이 상태 목록과 정확히 일치해야 합니다.',
    });
  }
  if (batch.counts.total !== batch.items.length) {
    context.addIssue({
      code: 'custom',
      path: ['counts', 'total'],
      message: '배치 전체 수는 상태 항목 수와 일치해야 합니다.',
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
      message: '재시도 대상은 배치 항목과 버전 서명에 정확히 일치해야 합니다.',
    });
  }
  if (
    new Set(skippedIds).size !== skippedIds.length
    || skippedIds.some((itemId) => !uniqueItemIds.has(itemId) || retryTargetIds.includes(itemId))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['lastRetrySkippedItems'],
      message: '재시도 제외 항목은 배치 안에서 중복되거나 대상과 겹칠 수 없습니다.',
    });
  }
  if (batch.enqueueRoundId) {
    const attempts = batch.enqueueItemAttempts || {};
    const revisions = batch.enqueueItemRevisions || {};
    const roundItemIds = Object.keys(attempts);
    const revisionItemIds = Object.keys(revisions);
    const roundItemsAreValid = roundItemIds.length > 0
      && roundItemIds.length === revisionItemIds.length
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
      && revisionItemIds.every((itemId) => roundItemIds.includes(itemId));
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
        message: '현재 등록 회차와 항목 시도·버전·유효 시간이 서로 일치해야 합니다.',
      });
    }
  }
});

export const emoticonJobSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  sourceImageUrl: z.string().url(),
  sourceStoragePath: z.string().min(1),
  referenceImages: z.array(emoticonReferenceImageSchema).max(3).default([]),
  sourceCanonicalStoragePath: z.string().min(1).optional(),
  canonicalReferenceUrls: z.array(z.string().url()).max(3).optional(),
  canonicalIdentityReferenceUrl: z.string().url().optional(),
  sourceFingerprint: z.string().min(1).optional(),
  referenceSetFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  identityFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  identityFingerprintVersion: z.string().min(1).max(80).optional(),
  instruction: z.string().min(1).max(800),
  mode: emoticonJobModeSchema.default('generate'),
  templateRequest: z.string().min(8).max(800).optional(),
  templateItemCount: z.number().int().min(1).max(64).optional(),
  profileJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  sheetRequest: z.string().trim().min(8).max(800).optional(),
  sheetItemCount: z.number().int().min(1).max(64).optional(),
  manualImport: emoticonManualFrameImportSchema.optional(),
  bubbleOverride: emoticonBubbleSchema.optional(),
  bubbleLayersOverride: emoticonBubbleLayersSchema.optional(),
  motionOverride: emoticonMotionOverrideSchema.optional(),
  outputProfile: emoticonOutputProfileSchema.optional(),
  editRecipe: emoticonImageEditRecipeSchema.optional(),
  renderOverrides: z.object({
    bubble: emoticonBubbleSchema.optional(),
    bubbleLayers: emoticonBubbleLayersSchema.optional(),
    motion: emoticonMotionOverrideSchema.optional(),
    outputProfile: emoticonOutputProfileSchema.optional(),
    editRecipe: emoticonImageEditRecipeSchema.optional(),
    frameDurationsMs: z.array(z.number().int().min(40).max(2000)).min(2).max(24).optional(),
    frameTransitions: z.array(emoticonFrameTransitionSchema).min(2).max(24).optional(),
  }).optional(),
  parentJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  repairFrameIndex: z.number().int().min(0).max(23).optional(),
  repairedFrameIndex: z.number().int().min(0).max(23).optional(),
  projectId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  projectItemId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  batchId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  batchEnqueueRoundId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  batchRetryRound: z.number().int().min(0).max(99).optional(),
  batchItemAttemptCount: z.number().int().min(1).max(8).optional(),
  openRouterAuthorizedCostUsd: z.number().nonnegative().optional(),
  openRouterMaxImageCostUsd: z.number().nonnegative().optional(),
  openRouterActualCostUsd: z.number().nonnegative().optional(),
  openRouterUsageRequestCount: z.number().int().nonnegative().optional(),
  openRouterLastModel: z.string().min(1).max(200).optional(),
  openRouterLastProvider: z.string().min(1).max(100).optional(),
  openRouterUsageUpdatedAt: z.unknown().optional(),
  motionPreference: emoticonMotionPreferenceSchema,
  // Old jobs predate the cost-saving switch. Preserve their original
  // high-quality execution while every newly submitted job writes a mode.
  resourceMode: emoticonResourceModeSchema.default('premium'),
  aiGenerationProfile: z.literal('gpt-light-v1').optional(),
  analysisMode: emoticonResourceModeSchema.optional(),
  analysisEstimate: emoticonCharacterAnalysisEstimateSchema.optional(),
  rightsAttested: z.boolean().optional(),
  assetProvenance: z.object({
    kind: z.enum(['uploaded', 'existing_asset']),
    sourceStoragePaths: z.array(z.string().min(1).max(500)).min(1).max(4),
  }).optional(),
  formats: z.array(emoticonExportFormatSchema).min(1).max(7).refine(
    (formats) => new Set(formats).size === formats.length,
    { message: '출력 파일 형식은 중복될 수 없습니다.' },
  ),
  status: emoticonJobStatusSchema,
  progress: z.number().int().min(0).max(100),
  statusMessage: z.string().min(1).max(240),
  plan: emoticonStoredPlanSchema.optional(),
  characterAnalysis: emoticonCharacterAnalysisSchema.optional(),
  sheetPlan: emoticonCharacterSheetPlanSchema.optional(),
  manualImportReport: emoticonManualFrameImportReportSchema.optional(),
  quality: emoticonQualitySchema.optional(),
  motionReview: emoticonMotionReviewSchema.optional(),
  premiumQualityTarget: z.number().min(90).max(100).optional(),
  premiumQualityScore: z.number().min(0).max(100).optional(),
  premiumQualityAchieved: z.boolean().optional(),
  keyPoseUrl: z.string().url().optional(),
  keyPoseStoragePath: z.string().min(1).optional(),
  keyPoseGeneration: emoticonGenerationMetadataSchema.optional(),
  correctionPoseGeneration: emoticonGenerationMetadataSchema.optional(),
  spriteSheetGeneration: emoticonSpriteSheetGenerationSchema.optional(),
  animationFrames: z.array(emoticonAnimationFrameSchema).max(24).optional(),
  compositedFrames: z.array(emoticonAnimationFrameSchema).max(24).optional(),
  frameSequencePlan: emoticonFrameSequenceSchema.optional(),
  outputs: emoticonOutputsSchema.optional(),
  specReport: emoticonSpecReportSchema.optional(),
  analysisReused: z.boolean().optional(),
  error: z.string().max(1000).nullable().optional(),
  resumeAvailable: z.boolean().optional(),
  recoverableFailure: z.enum(['openrouter-credits', 'checkpoint-error']).optional(),
  failureCode: z.string().trim().min(1).max(80).optional(),
  failureStage: z.string().trim().min(1).max(80).optional(),
  retryStrategy: z.string().trim().min(1).max(80).optional(),
  creditPausedAt: z.unknown().optional(),
  motionFallbackReason: z.string().max(600).nullable().optional(),
  frameContinuation: emoticonContinuationStateSchema.optional(),
  frameRepair: emoticonFrameRepairSchema.optional(),
  renderFailureRecovery: emoticonRenderFailureRecoverySchema.optional(),
  cancelRequestedAt: z.unknown().optional(),
  cancelledAt: z.unknown().optional(),
  deferredUntilMs: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
  completedAt: z.unknown().optional(),
}).superRefine((job, context) => {
  const hasExactStaticPlan = Boolean(
    job.plan
    && job.outputProfile?.type === 'static'
    && emoticonManualStoredPlanSchema.safeParse(job.plan).success
    && job.plan.action.renderMode === 'stable'
    && job.plan.action.frameCount === 1
    && job.plan.action.fps === 1
    && job.plan.action.durationMs === 0
    && job.plan.bubble.timeline.mode === 'full'
    && job.plan.bubble.timeline.startFrame === 0
    && job.plan.bubble.timeline.endFrame === null
    && job.plan.bubble.timeline.cues.length === 0
  );
  if (
    job.plan
    && !emoticonPlanSchema.safeParse(job.plan).success
    && !hasExactStaticPlan
    && job.mode !== 'import_frames'
    && !job.manualImportReport
  ) {
    context.addIssue({
      code: 'custom',
      path: ['plan'],
      message: 'AI 작업은 AI 생성 규격을 충족하는 계획만 저장할 수 있습니다.',
    });
  }
  if (job.mode === 'sheet_plan' && !job.profileJobId) {
    context.addIssue({ code: 'custom', path: ['profileJobId'], message: '캐릭터 시트 계획에는 완료된 외형 분석 작업이 필요합니다.' });
  }
  if (job.mode === 'sheet_plan' && (!job.sheetRequest || !job.sheetItemCount)) {
    context.addIssue({ code: 'custom', path: ['sheetRequest'], message: '원하는 시트 구성과 항목 수가 필요합니다.' });
  }
  if (job.mode === 'import_frames') {
    if (!job.manualImport || !job.outputProfile || !job.projectId || !job.projectItemId) {
      context.addIssue({ code: 'custom', path: ['manualImport'], message: '수동 프레임 작업에는 프로젝트 항목, 출력 규격, 프레임 목록이 필요합니다.' });
    } else {
      const frameCount = job.manualImport.frames.length;
      if (job.sourceStoragePath !== job.manualImport.frames[0]?.sourceStoragePath) {
        context.addIssue({ code: 'custom', path: ['sourceStoragePath'], message: '대표 원본은 첫 번째 수동 프레임이어야 합니다.' });
      }
      if (job.outputProfile.type === 'static' && frameCount !== 1) {
        context.addIssue({ code: 'custom', path: ['manualImport', 'frames'], message: '정지형 수동 작업은 이미지 1장이 필요합니다.' });
      }
      if (job.outputProfile.type === 'animated' && (frameCount < 2 || frameCount > 24)) {
        context.addIssue({ code: 'custom', path: ['manualImport', 'frames'], message: '움직이는 수동 작업은 이미지 2~24장이 필요합니다.' });
      }
      if (frameCount === 1 && (job.manualImport.timing.mode !== 'fps' || job.manualImport.timing.fps !== 1)) {
        context.addIssue({ code: 'custom', path: ['manualImport', 'timing'], message: '정지형 수동 작업은 FPS 1로 기록해야 합니다.' });
      }
    }
  } else if (job.manualImport) {
    context.addIssue({ code: 'custom', path: ['manualImport'], message: '수동 프레임 목록은 수동 합성 작업에만 사용할 수 있습니다.' });
  }
  if (job.mode === 'repair_frame' && !job.parentJobId) {
    context.addIssue({
      code: 'custom',
      path: ['parentJobId'],
      message: '프레임 교체 작업에는 원본 작업이 필요합니다.',
    });
  }
  if (job.mode === 'repair_frame' && job.repairFrameIndex === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['repairFrameIndex'],
      message: '교체할 프레임 번호가 필요합니다.',
    });
  }
  if (!job.animationFrames || !job.plan || job.plan.action.renderMode !== 'dynamic') return;
  if (job.animationFrames.length > job.plan.action.frameCount) {
    context.addIssue({
      code: 'custom',
      path: ['animationFrames'],
      message: '저장된 프레임 수가 계획한 프레임 수보다 많습니다.',
    });
  }
  if (job.status === 'completed' && job.animationFrames.length !== job.plan.action.frameCount) {
    context.addIssue({
      code: 'custom',
      path: ['animationFrames'],
      message: '완료된 움직임 작업의 프레임 수가 계획과 다릅니다.',
    });
  }
  if (
    job.status === 'completed'
    && job.compositedFrames
    && job.compositedFrames.length !== job.plan.action.frameCount
  ) {
    context.addIssue({
      code: 'custom',
      path: ['compositedFrames'],
      message: '완료된 최종 합성 프레임 수가 계획과 다릅니다.',
    });
  }
});

export type EmoticonExportFormat = z.infer<typeof emoticonExportFormatSchema>;
export type EmoticonMotionPreference = z.infer<typeof emoticonMotionPreferenceSchema>;
export type EmoticonResourceMode = z.infer<typeof emoticonResourceModeSchema>;
export type EmoticonCharacterAnalysisEstimate = z.infer<typeof emoticonCharacterAnalysisEstimateSchema>;
export type EmoticonJobMode = z.infer<typeof emoticonJobModeSchema>;
export type EmoticonJobStatus = z.infer<typeof emoticonJobStatusSchema>;
export type EmoticonBatchStatus = z.infer<typeof emoticonBatchStatusSchema>;
export type EmoticonBatchItemStatus = z.infer<typeof emoticonBatchItemStatusSchema>;
export type EmoticonBatchRetryExclusionReason = z.infer<typeof emoticonBatchRetryExclusionReasonSchema>;
export type EmoticonBatchRetryTarget = z.infer<typeof emoticonBatchRetryTargetSchema>;
export type EmoticonBatchRetrySkippedItem = z.infer<typeof emoticonBatchRetrySkippedItemSchema>;
export type EmoticonBatchRetryResult = z.infer<typeof emoticonBatchRetryResultSchema>;
export type EmoticonBatchCounts = z.infer<typeof emoticonBatchCountsSchema>;
export type EmoticonBatchItem = z.infer<typeof emoticonBatchItemSchema>;
export type EmoticonBatch = z.infer<typeof emoticonBatchSchema>;
export type EmoticonBubble = z.infer<typeof emoticonBubbleSchema>;
export type EmoticonBubbleLayers = z.infer<typeof emoticonBubbleLayersSchema>;
export type EmoticonBubbleAppearance = z.infer<typeof emoticonBubbleAppearanceSchema>;
export type EmoticonBubbleFont = z.infer<typeof emoticonBubbleFontSchema>;
export type EmoticonBubbleTimeline = z.infer<typeof emoticonBubbleTimelineSchema>;
export type EmoticonBubbleTimelineMode = z.infer<typeof emoticonBubbleTimelineModeSchema>;
export type EmoticonMotionOverride = z.infer<typeof emoticonMotionOverrideSchema>;
export type EmoticonOutputProfile = z.infer<typeof emoticonOutputProfileSchema>;
export type EmoticonReferenceImage = z.infer<typeof emoticonReferenceImageSchema>;
export type EmoticonManualFrameAsset = z.infer<typeof emoticonManualFrameAssetSchema>;
export type EmoticonManualFrameTiming = z.infer<typeof emoticonManualFrameTimingSchema>;
export type EmoticonFrameTransition = z.infer<typeof emoticonFrameTransitionSchema>;
export type EmoticonManualFrameImport = z.infer<typeof emoticonManualFrameImportSchema>;
export type EmoticonManualFrameImportReport = z.infer<typeof emoticonManualFrameImportReportSchema>;
export type EmoticonPreset = z.infer<typeof emoticonPresetSchema>;
export type EmoticonPlan = z.infer<typeof emoticonPlanSchema>;
export type EmoticonCharacterAnalysis = z.infer<typeof emoticonCharacterAnalysisSchema>;
export type EmoticonCharacterSheetItem = z.infer<typeof emoticonCharacterSheetItemSchema>;
export type EmoticonCharacterSheetPlan = z.infer<typeof emoticonCharacterSheetPlanSchema>;
export type EmoticonQuality = z.infer<typeof emoticonQualitySchema>;
export type EmoticonMotionReview = z.infer<typeof emoticonMotionReviewSchema>;
export type EmoticonRenderFailureRecovery = z.infer<typeof emoticonRenderFailureRecoverySchema>;
export type EmoticonAnimationFrame = z.infer<typeof emoticonAnimationFrameSchema>;
export type EmoticonFrameDirection = z.infer<typeof emoticonFrameDirectionSchema>;
export type EmoticonFrameSequence = z.infer<typeof emoticonFrameSequenceSchema>;
export type EmoticonContinuationState = z.infer<typeof emoticonContinuationStateSchema>;
export type EmoticonFrameRepair = z.infer<typeof emoticonFrameRepairSchema>;
export type EmoticonAlphaBoundsFrameEvidence = z.infer<typeof emoticonAlphaBoundsFrameEvidenceSchema>;
export type EmoticonAlphaBoundsEvidence = z.infer<typeof emoticonAlphaBoundsEvidenceSchema>;
export type EmoticonOutputInspection = z.infer<typeof emoticonOutputInspectionSchema>;
export type EmoticonOutput = z.infer<typeof emoticonOutputSchema>;
export type EmoticonOutputs = z.infer<typeof emoticonOutputsSchema>;
export type EmoticonJob = z.infer<typeof emoticonJobSchema>;
