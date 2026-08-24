import { z } from 'zod';
import {
  emoticonBubbleCueSchema,
  emoticonCharacterAnalysisSchema,
  emoticonExportFormatSchema,
  emoticonImageEditRecipeSchema,
  emoticonOutputProfileSchema,
  emoticonOutputPlatformSchema,
  emoticonResourceModeSchema,
} from '@/schemas/emoticonStudio';

export const EMOTICON_STUDIO_V2_SCHEMA_VERSION = 1 as const;

const documentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const storagePathSchema = z.string().min(1).max(700);

export const emoticonCharacterLockStrengthSchema = z.enum([
  'natural',
  'balanced',
  'strict',
]);

export const emoticonCharacterIdentityLockSchema = z.object({
  strength: emoticonCharacterLockStrengthSchema.default('balanced'),
  face: z.boolean().default(true),
  hair: z.boolean().default(true),
  outfit: z.boolean().default(true),
  palette: z.boolean().default(true),
  proportions: z.boolean().default(true),
  accessories: z.boolean().default(true),
});

export const emoticonCharacterAnalysisOverrideSchema = z.object({
  summary: z.string().trim().min(1).max(480).optional(),
  attributes: emoticonCharacterAnalysisSchema.shape.attributes.partial().optional(),
  immutableLock: z.array(z.string().trim().min(1).max(180)).min(1).max(16).optional(),
  styleLock: z.array(z.string().trim().min(1).max(180)).min(1).max(12).optional(),
  negativeLock: z.array(z.string().trim().min(1).max(180)).min(1).max(16).optional(),
  confidenceNotes: z.array(z.string().trim().min(1).max(180)).max(8).optional(),
});

export const emoticonCharacterProfileVersionSchema = z.object({
  schemaVersion: z.literal(EMOTICON_STUDIO_V2_SCHEMA_VERSION),
  id: documentIdSchema,
  projectId: documentIdSchema,
  version: z.number().int().positive(),
  status: z.enum(['draft', 'approved', 'superseded']),
  referenceStoragePaths: z.array(storagePathSchema).min(1).max(4),
  identityFingerprint: sha256Schema,
  sourceProfileJobId: documentIdSchema,
  analysisMode: emoticonResourceModeSchema,
  aiAnalysis: emoticonCharacterAnalysisSchema,
  userOverrides: emoticonCharacterAnalysisOverrideSchema.default({}),
  identityLock: emoticonCharacterIdentityLockSchema.default({
    strength: 'balanced',
    face: true,
    hair: true,
    outfit: true,
    palette: true,
    proportions: true,
    accessories: true,
  }),
  rightsAttested: z.literal(true),
  approvedAt: z.unknown().optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const EMOTICON_ASSET_PROVENANCE_KINDS = [
  'uploaded',
  'ai_generated',
  'ai_edited',
  'manual_import',
  'local_composite',
] as const;

export const emoticonAssetProvenanceSchema = z.object({
  kind: z.enum(EMOTICON_ASSET_PROVENANCE_KINDS),
  parentAssetIds: z.array(documentIdSchema).max(24).default([]),
  sourceJobId: documentIdSchema.optional(),
  sourceTurnId: documentIdSchema.optional(),
  sourceFrameIndex: z.number().int().min(0).max(23).optional(),
});

export const emoticonAssetSchema = z.object({
  schemaVersion: z.literal(EMOTICON_STUDIO_V2_SCHEMA_VERSION),
  id: documentIdSchema,
  userId: documentIdSchema,
  projectId: documentIdSchema,
  storagePath: storagePathSchema,
  url: z.string().url().optional(),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  fileName: z.string().trim().min(1).max(180),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  hasAlpha: z.boolean(),
  sha256: sha256Schema,
  provenance: emoticonAssetProvenanceSchema,
  status: z.enum(['pending', 'active', 'deleted']).default('active'),
  deletionLocked: z.boolean().default(false),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

// SourceAsset is the public studio-domain name for the already persisted V2
// asset contract. Keep one schema so uploads, imports, and generated assets do
// not drift into parallel representations.
export const sourceAssetSchema = emoticonAssetSchema;

export const emoticonCreationIntentSchema = z.object({
  action: z.string().trim().min(1).max(240),
  direction: z.enum(['left', 'right', 'front', 'back', 'unspecified']).default('unspecified'),
  emotion: z.string().trim().max(120).default(''),
  expression: z.string().trim().max(180).default(''),
  outputType: z.enum(['static', 'animated']),
  quantity: z.number().int().min(1).max(40).default(1),
  frameCount: z.number().int().min(1).max(24),
  durationMs: z.number().int().min(0).max(60_000),
  loopMode: z.enum(['none', 'loop', 'ping_pong']).default('loop'),
  targetPlatform: emoticonOutputPlatformSchema,
  qualityMode: emoticonResourceModeSchema,
  additionalReferenceAssetIds: z.array(documentIdSchema).max(4).default([]),
  textCues: z.array(emoticonBubbleCueSchema).max(6).default([]),
}).superRefine((intent, context) => {
  if (intent.outputType === 'static' && (intent.frameCount !== 1 || intent.durationMs !== 0)) {
    context.addIssue({
      code: 'custom',
      path: ['frameCount'],
      message: '정지형 작업은 1프레임, 재생시간 0ms여야 합니다.',
    });
  }
  if (intent.outputType === 'animated' && intent.frameCount < 2) {
    context.addIssue({
      code: 'custom',
      path: ['frameCount'],
      message: '움직이는 작업은 2프레임 이상이어야 합니다.',
    });
  }
});

export const emoticonTimelineTransformSchema = z.object({
  x: z.number().min(-1).max(1).default(0),
  y: z.number().min(-1).max(1).default(0),
  scale: z.number().min(0.1).max(4).default(1),
  rotationDeg: z.number().min(-180).max(180).default(0),
  flipX: z.boolean().default(false),
});

export const EMOTICON_FRAME_LAYER_KINDS = [
  'source',
  'prop',
  'text',
  'effect',
  'mask',
] as const;

export const frameLayerSchema = z.object({
  schemaVersion: z.literal(EMOTICON_STUDIO_V2_SCHEMA_VERSION),
  id: documentIdSchema,
  frameId: documentIdSchema,
  name: z.string().trim().min(1).max(80),
  kind: z.enum(EMOTICON_FRAME_LAYER_KINDS),
  assetId: documentIdSchema.nullable().default(null),
  text: z.string().max(280).nullable().default(null),
  order: z.number().int().min(0).max(63),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().finite().min(0).max(1).default(1),
  blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay']).default('normal'),
  transform: emoticonTimelineTransformSchema.default({
    x: 0,
    y: 0,
    scale: 1,
    rotationDeg: 0,
    flipX: false,
  }),
  editRecipe: emoticonImageEditRecipeSchema.optional(),
}).superRefine((layer, context) => {
  if (['source', 'prop', 'mask'].includes(layer.kind) && !layer.assetId) {
    context.addIssue({
      code: 'custom',
      path: ['assetId'],
      message: '이미지 레이어에는 원본 자산이 필요합니다.',
    });
  }
  if (layer.kind === 'text' && !layer.text?.trim()) {
    context.addIssue({
      code: 'custom',
      path: ['text'],
      message: '텍스트 레이어에는 표시할 문구가 필요합니다.',
    });
  }
});

export const emoticonTimelineFrameSchema = z.object({
  id: documentIdSchema,
  assetId: documentIdSchema,
  sourceJobId: documentIdSchema.optional(),
  sourceFrameIndex: z.number().int().min(0).max(23).optional(),
  durationMs: z.number().int().min(40).max(2_000),
  transform: emoticonTimelineTransformSchema.default({
    x: 0,
    y: 0,
    scale: 1,
    rotationDeg: 0,
    flipX: false,
  }),
  editRecipe: emoticonImageEditRecipeSchema.optional(),
});

export const emoticonTextCueTrackSchema = z.object({
  cues: z.array(emoticonBubbleCueSchema).max(6).default([]),
});

export const emoticonAnimationTimelineSchema = z.object({
  schemaVersion: z.literal(EMOTICON_STUDIO_V2_SCHEMA_VERSION),
  id: documentIdSchema,
  projectId: documentIdSchema,
  itemId: documentIdSchema,
  revision: z.number().int().nonnegative(),
  frames: z.array(emoticonTimelineFrameSchema).min(1).max(24),
  playback: z.object({
    loopMode: z.enum(['none', 'loop', 'ping_pong']).default('loop'),
    loopCount: z.number().int().min(0).max(4).default(0),
  }),
  textTrack: emoticonTextCueTrackSchema.default({ cues: [] }),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
}).superRefine((timeline, context) => {
  const ids = new Set(timeline.frames.map((frame) => frame.id));
  if (ids.size !== timeline.frames.length) {
    context.addIssue({
      code: 'custom',
      path: ['frames'],
      message: '타임라인 프레임 ID는 중복될 수 없습니다.',
    });
  }
});

export const emoticonCostSnapshotSchema = z.object({
  currency: z.literal('USD'),
  estimatedMinUsd: z.number().nonnegative(),
  estimatedMaxUsd: z.number().nonnegative(),
  actualUsd: z.number().nonnegative().nullable(),
  estimatedCallsMin: z.number().int().nonnegative(),
  estimatedCallsMax: z.number().int().nonnegative(),
  actualCalls: z.number().int().nonnegative().nullable(),
});

// CostEstimate remains an alias of the durable snapshot so an estimate can be
// settled in place without maintaining a second cost shape.
export const costEstimateSchema = emoticonCostSnapshotSchema;

export const emoticonGeneratedVariantSchema = z.object({
  id: documentIdSchema,
  jobId: documentIdSchema,
  timelineId: documentIdSchema.optional(),
  outputFormats: z.array(emoticonExportFormatSchema).min(1).max(7),
  status: z.enum(['queued', 'working', 'completed', 'failed', 'cancelled']),
  qualityScore: z.number().min(0).max(100).nullable(),
  accountedCostUsd: z.number().nonnegative().optional(),
  accountedCalls: z.number().int().nonnegative().optional(),
  createdAt: z.unknown().optional(),
});

export const generationResultSchema = emoticonGeneratedVariantSchema;

export const emoticonCreationTurnSchema = z.object({
  schemaVersion: z.literal(EMOTICON_STUDIO_V2_SCHEMA_VERSION),
  id: documentIdSchema,
  userId: documentIdSchema,
  projectId: documentIdSchema,
  parentTurnId: documentIdSchema.optional(),
  revisionReason: z.enum(['create', 'variant', 'prompt_edit', 'frame_repair', 'text_edit']).default('create'),
  prompt: z.string().trim().min(2).max(2_400),
  intent: emoticonCreationIntentSchema,
  characterProfileVersionId: documentIdSchema,
  status: z.enum(['draft', 'queued', 'working', 'completed', 'failed', 'cancelled']),
  cost: emoticonCostSnapshotSchema,
  variants: z.array(emoticonGeneratedVariantSchema).max(40).default([]),
  errorCode: z.string().trim().min(1).max(80).nullable().default(null),
  errorMessage: z.string().trim().min(1).max(320).nullable().default(null),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const generationRequestSchema = emoticonCreationTurnSchema;

export const emoticonValidationIssueSchema = z.object({
  code: z.string().trim().min(1).max(80),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string().trim().min(1).max(320),
  frameIndices: z.array(z.number().int().min(0).max(23)).max(24).default([]),
  action: z.enum(['repair_frames', 'align_frames', 'adjust_timing', 'edit_text', 'reduce_size', 'review']).optional(),
});

export const emoticonValidationReportSchema = z.object({
  schemaVersion: z.literal(EMOTICON_STUDIO_V2_SCHEMA_VERSION),
  id: documentIdSchema,
  projectId: documentIdSchema,
  itemId: documentIdSchema,
  technicalPass: z.boolean(),
  qualityScore: z.number().min(0).max(100),
  issues: z.array(emoticonValidationIssueSchema).max(64),
  inspectedAt: z.string().datetime(),
});

export const emoticonPolicySnapshotSchema = z.object({
  schemaVersion: z.literal(EMOTICON_STUDIO_V2_SCHEMA_VERSION),
  platform: emoticonOutputPlatformSchema,
  profileVersion: z.string().trim().min(1).max(80),
  sourceUrl: z.string().url(),
  checkedAt: z.string().datetime(),
  verification: z.enum(['reference', 'verified']),
  aiSubmissionRestricted: z.boolean(),
  submissionApprovalGuaranteed: z.literal(false),
});

export const exportPresetSchema = z.object({
  schemaVersion: z.literal(EMOTICON_STUDIO_V2_SCHEMA_VERSION),
  id: documentIdSchema,
  name: z.string().trim().min(1).max(80),
  platform: emoticonOutputPlatformSchema,
  type: z.enum(['static', 'animated']),
  formats: z.array(emoticonExportFormatSchema).min(1).max(7),
  preferredFormat: emoticonExportFormatSchema,
  outputProfile: emoticonOutputProfileSchema,
  quality: z.number().int().min(1).max(100).default(80),
  loopCount: z.number().int().min(0).max(10_000).default(0),
  transparentBackground: z.boolean().default(true),
  enabled: z.boolean().default(true),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
}).superRefine((preset, context) => {
  if (new Set(preset.formats).size !== preset.formats.length) {
    context.addIssue({ code: 'custom', path: ['formats'], message: '출력 형식은 중복될 수 없습니다.' });
  }
  if (!preset.formats.includes(preset.preferredFormat)) {
    context.addIssue({ code: 'custom', path: ['preferredFormat'], message: '대표 형식은 출력 형식에 포함되어야 합니다.' });
  }
  if (preset.outputProfile.platform !== preset.platform || preset.outputProfile.type !== preset.type) {
    context.addIssue({ code: 'custom', path: ['outputProfile'], message: '출력 프로필의 플랫폼과 유형이 프리셋과 일치해야 합니다.' });
  }
});

export const EMOTICON_EDITABLE_POLICY_PLATFORMS = ['kakao', 'line', 'custom'] as const;
export const emoticonEditablePolicyPlatformSchema = z.enum(EMOTICON_EDITABLE_POLICY_PLATFORMS);
export const emoticonPolicyVerificationSchema = z.enum(['reference', 'verified']);

export const emoticonPlatformPolicyLimitSchema = z.object({
  value: z.number().int().nonnegative().max(1024 * 1024 * 1024).nullable(),
  verification: emoticonPolicyVerificationSchema,
});

export const emoticonPlatformFormatPolicySchema = z.object({
  format: emoticonExportFormatSchema,
  verification: emoticonPolicyVerificationSchema,
  role: z.enum(['platform-reference', 'working-output', 'distribution-output']),
  submissionCandidate: z.literal(false),
});

export const emoticonPlatformPolicyProfileSchema = z.object({
  platform: emoticonEditablePolicyPlatformSchema,
  type: z.enum(['static', 'animated']),
  width: z.number().int().min(64).max(2048),
  height: z.number().int().min(64).max(2048),
  profileVersion: z.string().trim().min(1).max(80),
  verification: emoticonPolicyVerificationSchema,
  sourceUrl: z.string().url().nullable(),
  checkedAt: z.string().datetime().nullable(),
  recommendedItemCount: z.number().int().min(1).max(64),
  allowedFormats: z.array(emoticonExportFormatSchema).min(1).max(7),
  formatPolicies: z.array(emoticonPlatformFormatPolicySchema).min(1).max(7),
  preferredFormat: emoticonExportFormatSchema,
  minFrameCount: z.number().int().min(1).max(24),
  maxFrameCount: z.number().int().min(1).max(24),
  transparencyRequired: z.boolean(),
  transparentBackground: z.literal(true),
  constraintVerification: z.object({
    canvas: emoticonPolicyVerificationSchema,
    minFrameCount: emoticonPolicyVerificationSchema,
    maxFrameCount: emoticonPolicyVerificationSchema,
    recommendedItemCount: emoticonPolicyVerificationSchema,
  }),
  platformLimits: z.object({
    maxFileSizeBytes: emoticonPlatformPolicyLimitSchema,
    maxDurationMs: emoticonPlatformPolicyLimitSchema,
    maxLoopCount: emoticonPlatformPolicyLimitSchema,
  }),
  defaultLoopCount: z.number().int().min(0).max(10_000).nullable(),
  policyNotice: z.string().trim().min(1).max(2_000),
  submissionCandidate: z.literal(false),
}).superRefine((profile, context) => {
  const allowedFormats = new Set(profile.allowedFormats);
  const policyFormats = profile.formatPolicies.map((policy) => policy.format);
  if (allowedFormats.size !== profile.allowedFormats.length || new Set(policyFormats).size !== policyFormats.length) {
    context.addIssue({ code: 'custom', path: ['allowedFormats'], message: '플랫폼 출력 형식은 중복될 수 없습니다.' });
  }
  if (
    policyFormats.length !== profile.allowedFormats.length
    || policyFormats.some((format) => !allowedFormats.has(format))
  ) {
    context.addIssue({ code: 'custom', path: ['formatPolicies'], message: '형식 정책은 허용 출력 형식과 정확히 일치해야 합니다.' });
  }
  if (!allowedFormats.has(profile.preferredFormat)) {
    context.addIssue({ code: 'custom', path: ['preferredFormat'], message: '대표 형식은 허용 출력 형식에 포함되어야 합니다.' });
  }
  if (profile.minFrameCount > profile.maxFrameCount) {
    context.addIssue({ code: 'custom', path: ['minFrameCount'], message: '최소 프레임 수는 최대 프레임 수보다 클 수 없습니다.' });
  }
  if (
    profile.type === 'static'
    && (
      profile.minFrameCount !== 1
      || profile.maxFrameCount !== 1
      || profile.allowedFormats.length !== 1
      || profile.allowedFormats[0] !== 'png'
    )
  ) {
    context.addIssue({ code: 'custom', path: ['type'], message: '정지형 정책은 1프레임 투명 PNG만 허용합니다.' });
  }
  if (profile.type === 'animated' && profile.minFrameCount < 2) {
    context.addIssue({ code: 'custom', path: ['minFrameCount'], message: '애니메이션 정책은 최소 2프레임이어야 합니다.' });
  }
});

export const platformPolicyPresetSchema = z.object({
  schemaVersion: z.literal(EMOTICON_STUDIO_V2_SCHEMA_VERSION),
  id: z.string().regex(/^(kakao|line|custom)-(static|animated)$/),
  platform: emoticonEditablePolicyPlatformSchema,
  type: z.enum(['static', 'animated']),
  revision: z.number().int().nonnegative().max(1_000_000),
  enabled: z.boolean(),
  profile: emoticonPlatformPolicyProfileSchema,
  updatedBy: z.string().trim().min(1).max(128),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
}).superRefine((preset, context) => {
  if (preset.id !== `${preset.platform}-${preset.type}`) {
    context.addIssue({ code: 'custom', path: ['id'], message: '정책 ID는 플랫폼과 출력 유형으로 구성되어야 합니다.' });
  }
  if (preset.profile.platform !== preset.platform || preset.profile.type !== preset.type) {
    context.addIssue({ code: 'custom', path: ['profile'], message: '정책 프로필의 플랫폼과 유형이 문서와 일치해야 합니다.' });
  }
});

export const emoticonStudioV2ProjectMetadataSchema = z.object({
  experienceVersion: z.literal(2),
  workflowMode: z.enum(['ai', 'manual']).default('ai'),
  approvedCharacterProfileVersionId: documentIdSchema.nullable().default(null),
  latestCreationTurnId: documentIdSchema.nullable().default(null),
  latestTimelineId: documentIdSchema.nullable().default(null),
  updatedAt: z.unknown().optional(),
});

export function createDefaultEmoticonStudioV2ProjectMetadata() {
  return {
    experienceVersion: 2 as const,
    workflowMode: 'ai' as const,
    approvedCharacterProfileVersionId: null,
    latestCreationTurnId: null,
    latestTimelineId: null,
  };
}

export function resolveEmoticonStudioV2ProjectMetadata(value: unknown) {
  const parsed = emoticonStudioV2ProjectMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : createDefaultEmoticonStudioV2ProjectMetadata();
}

export type EmoticonCharacterIdentityLock = z.infer<typeof emoticonCharacterIdentityLockSchema>;
export type EmoticonCharacterAnalysisOverride = z.infer<typeof emoticonCharacterAnalysisOverrideSchema>;
export type EmoticonCharacterProfileVersion = z.infer<typeof emoticonCharacterProfileVersionSchema>;
export type EmoticonAsset = z.infer<typeof emoticonAssetSchema>;
export type SourceAsset = EmoticonAsset;
export type FrameLayer = z.infer<typeof frameLayerSchema>;
export type EmoticonCreationIntent = z.infer<typeof emoticonCreationIntentSchema>;
export type EmoticonAnimationTimeline = z.infer<typeof emoticonAnimationTimelineSchema>;
export type EmoticonCreationTurn = z.infer<typeof emoticonCreationTurnSchema>;
export type EmoticonCostSnapshot = z.infer<typeof emoticonCostSnapshotSchema>;
export type CostEstimate = EmoticonCostSnapshot;
export type EmoticonGeneratedVariant = z.infer<typeof emoticonGeneratedVariantSchema>;
export type GenerationRequest = EmoticonCreationTurn;
export type GenerationResult = EmoticonGeneratedVariant;
export type EmoticonValidationReport = z.infer<typeof emoticonValidationReportSchema>;
export type EmoticonPolicySnapshot = z.infer<typeof emoticonPolicySnapshotSchema>;
export type ExportPreset = z.infer<typeof exportPresetSchema>;
export type PlatformPolicyPreset = z.infer<typeof platformPolicyPresetSchema>;
export type EmoticonStudioV2ProjectMetadata = z.infer<typeof emoticonStudioV2ProjectMetadataSchema>;
