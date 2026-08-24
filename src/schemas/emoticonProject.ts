import { z } from 'zod';
import {
  createIdentityEmoticonImageEditRecipe,
  emoticonBubbleAppearanceSchema,
  emoticonBubbleFontSchema,
  emoticonBubbleTimelineSchema,
  emoticonExportFormatSchema,
  emoticonImageEditRecipeSchema,
  emoticonCharacterAnalysisSchema,
  emoticonMotionPreferenceSchema,
  emoticonResourceModeSchema,
} from '@/schemas/emoticonStudio';
import { emoticonStudioV2ProjectMetadataSchema } from '@/schemas/emoticonStudioV2';

export const EMOTICON_PROJECT_PLATFORMS = ['kakao', 'line', 'telegram', 'sns', 'custom'] as const;
export const EMOTICON_PROJECT_TYPES = ['static', 'animated'] as const;
export const EMOTICON_PROJECT_ITEM_STATUSES = ['planned', 'queued', 'generating', 'completed', 'failed'] as const;
export const EMOTICON_PROJECT_REFERENCE_ROLES = ['front', 'side', 'back', 'expression', 'other'] as const;
export const EMOTICON_PROJECT_PORTABLE_FORMAT = 'propig.emoticon-project' as const;
export const EMOTICON_PROJECT_PORTABLE_VERSION = 1 as const;

export const emoticonProjectPlatformSchema = z.enum(EMOTICON_PROJECT_PLATFORMS);
export const emoticonProjectTypeSchema = z.enum(EMOTICON_PROJECT_TYPES);
export const emoticonProjectItemStatusSchema = z.enum(EMOTICON_PROJECT_ITEM_STATUSES);
export const emoticonProjectReferenceRoleSchema = z.enum(EMOTICON_PROJECT_REFERENCE_ROLES);

export const emoticonProjectReferenceSchema = z.object({
  sourceImageUrl: z.string().url(),
  sourceStoragePath: z.string().min(1).max(700),
  viewRole: emoticonProjectReferenceRoleSchema.optional(),
});

export const emoticonProjectCharacterSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(800),
  visualStyle: z.string().trim().max(160),
  references: z.array(emoticonProjectReferenceSchema).max(4),
  identityPrompt: z.string().trim().max(1200),
  negativePrompt: z.string().trim().max(1200),
  profile: emoticonCharacterAnalysisSchema.optional(),
  profileJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  identityFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export const emoticonProjectMotionSchema = z.object({
  control: z.enum(['auto', 'custom']).default('auto'),
  fps: z.number().min(0.1).max(30).default(8),
  frameCount: z.number().int().min(1).max(24).default(8),
  durationMs: z.number().int().min(0).max(60_000).default(1000),
}).refine((motion) => (
  motion.frameCount === 1
    ? motion.fps === 1 && motion.durationMs === 0
    : motion.durationMs >= 80
      && Math.abs(motion.durationMs - Math.round((motion.frameCount / motion.fps) * 1000)) <= 120
), {
  message: 'FPS, 프레임 수, 재생 시간이 서로 맞지 않습니다.',
  path: ['durationMs'],
});

export const emoticonProjectBubbleSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().trim().max(36).default(''),
  position: z.enum(['top', 'bottom', 'left', 'right']).default('top'),
  style: z.enum(['rounded', 'shout', 'thought', 'whisper']).default('rounded'),
  font: emoticonBubbleFontSchema.default('clean'),
  entrance: z.enum(['pop', 'fade', 'shake', 'none']).default('pop'),
  ...emoticonBubbleAppearanceSchema.shape,
  timeline: emoticonBubbleTimelineSchema.default({
    mode: 'full',
    startFrame: 0,
    endFrame: null,
    cues: [],
  }),
});

export const emoticonProjectBubbleLayersSchema = z.array(emoticonProjectBubbleSchema).max(4).default([]);

export const emoticonProjectEditHistoryEntrySchema = z.object({
  recipe: emoticonImageEditRecipeSchema,
  sourceJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  resultJobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  createdAt: z.unknown().optional(),
});

export const emoticonProjectItemSchema = z.object({
  id: z.string().min(1).max(80),
  revision: z.number().int().nonnegative().default(0),
  order: z.number().int().min(1).max(64),
  title: z.string().trim().min(1).max(80),
  emotion: z.string().trim().min(1).max(60),
  action: z.string().trim().min(1).max(160),
  motion: emoticonProjectMotionSchema,
  bubble: emoticonProjectBubbleSchema,
  bubbleLayers: emoticonProjectBubbleLayersSchema,
  editRecipe: emoticonImageEditRecipeSchema.default(
    createIdentityEmoticonImageEditRecipe(),
  ),
  editHistory: z.array(emoticonProjectEditHistoryEntrySchema).max(20).default([]),
  instruction: z.string().trim().min(2).max(800),
  negativePrompt: z.string().trim().max(1200),
  jobId: z.string().min(1).max(160).nullable(),
  generationStatus: emoticonProjectItemStatusSchema,
  validationErrors: z.array(z.string().trim().min(1).max(180)).max(8),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
}).superRefine((item, context) => {
  if (!item.bubble.enabled) return;
  const lastFrame = Math.max(0, item.motion.frameCount - 1);
  const timeline = item.bubble.timeline;
  const validateRange = (startFrame: number, endFrame: number | null, path: Array<string | number>) => {
    if (startFrame > lastFrame || (endFrame !== null && endFrame > lastFrame)) {
      context.addIssue({
        code: 'custom',
        path,
        message: `말풍선 프레임 범위는 0~${lastFrame} 안에 있어야 합니다.`,
      });
    }
  };
  if (timeline.mode === 'range') {
    validateRange(timeline.startFrame, timeline.endFrame, ['bubble', 'timeline']);
  } else if (timeline.mode === 'intro' && timeline.endFrame !== null) {
    validateRange(0, timeline.endFrame, ['bubble', 'timeline', 'endFrame']);
  } else if (timeline.mode === 'outro') {
    validateRange(timeline.startFrame, timeline.endFrame, ['bubble', 'timeline']);
  }
  if (timeline.mode !== 'cues') return;
  if (!timeline.cues.length) {
    context.addIssue({
      code: 'custom',
      path: ['bubble', 'timeline', 'cues'],
      message: '여러 문구 모드에는 말풍선 문구를 하나 이상 추가해야 합니다.',
    });
    return;
  }
  const cueIds = new Set<string>();
  const sortedCues = [...timeline.cues].sort((left, right) => left.startFrame - right.startFrame);
  sortedCues.forEach((cue, index) => {
    validateRange(cue.startFrame, cue.endFrame, ['bubble', 'timeline', 'cues', index]);
    if (cueIds.has(cue.id)) {
      context.addIssue({
        code: 'custom',
        path: ['bubble', 'timeline', 'cues', index, 'id'],
        message: '말풍선 문구 ID가 중복되었습니다.',
      });
    }
    cueIds.add(cue.id);
    const previous = sortedCues[index - 1];
    if (previous && cue.startFrame <= previous.endFrame) {
      context.addIssue({
        code: 'custom',
        path: ['bubble', 'timeline', 'cues', index, 'startFrame'],
        message: '여러 말풍선 문구의 프레임 범위는 겹칠 수 없습니다.',
      });
    }
  });
});

export const emoticonProjectSpecSchema = z.object({
  canvasWidth: z.number().int().min(64).max(2048),
  canvasHeight: z.number().int().min(64).max(2048),
  transparentBackground: z.literal(true),
  recommendedItemCount: z.number().int().min(1).max(64),
  profileVersion: z.string().trim().min(1).max(80),
  profileVerification: z.enum(['reference', 'verified']).default('reference'),
  sourceUrl: z.string().url().optional(),
  checkedAt: z.string().datetime().optional(),
});

export const emoticonProjectGenerationSettingsSchema = z.object({
  motionPreference: emoticonMotionPreferenceSchema,
  resourceMode: emoticonResourceModeSchema.default('premium'),
  formats: z.array(emoticonExportFormatSchema).min(1).max(7),
  preferredFormat: emoticonExportFormatSchema,
});

export const emoticonProjectSchema = z.object({
  schemaVersion: z.literal(2),
  revision: z.number().int().nonnegative(),
  id: z.string().min(1).max(160),
  userId: z.string().min(1).max(160),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(800),
  platform: emoticonProjectPlatformSchema,
  emoticonType: emoticonProjectTypeSchema,
  itemCount: z.number().int().min(1).max(64),
  character: emoticonProjectCharacterSchema,
  generationSettings: emoticonProjectGenerationSettingsSchema,
  spec: emoticonProjectSpecSchema,
  items: z.array(emoticonProjectItemSchema).max(64).default([]),
  status: z.enum(['draft', 'ready', 'generating', 'completed', 'failed']),
  deletionLocked: z.boolean().default(false),
  deletionOperationId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  deletionMode: z.enum(['project_only', 'project_and_assets']).optional(),
  deletionRequestedAt: z.unknown().optional(),
  v2: emoticonStudioV2ProjectMetadataSchema.optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
}).superRefine((project, context) => {
  if (project.items.length && project.itemCount !== project.items.length) {
    context.addIssue({
      code: 'custom',
      path: ['itemCount'],
      message: '프로젝트 항목 수와 실제 항목 수가 다릅니다.',
    });
  }
  const ids = new Set(project.items.map((item) => item.id));
  const orders = new Set(project.items.map((item) => item.order));
  if (ids.size !== project.items.length || orders.size !== project.items.length) {
    context.addIssue({
      code: 'custom',
      path: ['items'],
      message: '프로젝트 항목 ID 또는 순서가 중복되었습니다.',
    });
  }
  if (!project.generationSettings.formats.includes(project.generationSettings.preferredFormat)) {
    context.addIssue({
      code: 'custom',
      path: ['generationSettings', 'preferredFormat'],
      message: '대표 출력 형식은 선택된 저장 형식에 포함되어야 합니다.',
    });
  }
  if (project.emoticonType === 'static') {
    if (
      project.generationSettings.formats.length !== 1
      || project.generationSettings.formats[0] !== 'png'
      || project.generationSettings.preferredFormat !== 'png'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['generationSettings', 'formats'],
        message: '정지형 프로젝트는 투명 PNG 형식만 사용할 수 있습니다.',
      });
    }
    project.items.forEach((item, index) => {
      if (item.motion.frameCount !== 1 || item.motion.durationMs !== 0) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'motion'],
          message: '정지형 항목은 1프레임, 재생 시간 0ms여야 합니다.',
        });
      }
    });
  } else {
    const animatedFormats = new Set(['apng', 'webp', 'gif', 'mp4', 'webm', 'png_zip']);
    if (!project.generationSettings.formats.some((format) => animatedFormats.has(format))) {
      context.addIssue({
        code: 'custom',
        path: ['generationSettings', 'formats'],
        message: '움직이는 프로젝트는 애니메이션 출력 형식을 하나 이상 선택해야 합니다.',
      });
    }
    if (project.generationSettings.preferredFormat === 'png') {
      context.addIssue({
        code: 'custom',
        path: ['generationSettings', 'preferredFormat'],
        message: '움직이는 프로젝트의 대표 형식은 PNG일 수 없습니다.',
      });
    }
  }
});

const emoticonProjectPortableItemSchema = z.object({
  title: z.string().trim().min(1).max(80),
  emotion: z.string().trim().min(1).max(60),
  action: z.string().trim().min(1).max(160),
  motion: emoticonProjectMotionSchema,
  bubble: emoticonProjectBubbleSchema,
  bubbleLayers: emoticonProjectBubbleLayersSchema,
  instruction: z.string().trim().min(2).max(800),
  negativePrompt: z.string().trim().max(1200),
});

/**
 * Versioned, portable project settings only. It intentionally has no owner,
 * Firestore IDs/revisions/timestamps, job state, errors, or Storage assets.
 */
export const emoticonProjectPortableSchema = z.object({
  format: z.literal(EMOTICON_PROJECT_PORTABLE_FORMAT),
  version: z.literal(EMOTICON_PROJECT_PORTABLE_VERSION),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(800),
  platform: emoticonProjectPlatformSchema,
  emoticonType: emoticonProjectTypeSchema,
  itemCount: z.number().int().min(1).max(64),
  character: emoticonProjectCharacterSchema.omit({
    references: true,
    profileJobId: true,
    identityFingerprint: true,
  }),
  generationSettings: emoticonProjectGenerationSettingsSchema,
  items: z.array(emoticonProjectPortableItemSchema).min(1).max(64),
}).superRefine((project, context) => {
  if (project.itemCount !== project.items.length) {
    context.addIssue({
      code: 'custom',
      path: ['itemCount'],
      message: '휴대용 프로젝트 항목 수와 실제 항목 수가 다릅니다.',
    });
  }
  if (!project.generationSettings.formats.includes(project.generationSettings.preferredFormat)) {
    context.addIssue({
      code: 'custom',
      path: ['generationSettings', 'preferredFormat'],
      message: '대표 출력 형식은 선택된 저장 형식에 포함되어야 합니다.',
    });
  }
  if (project.emoticonType === 'static') {
    if (
      project.generationSettings.formats.length !== 1
      || project.generationSettings.formats[0] !== 'png'
      || project.generationSettings.preferredFormat !== 'png'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['generationSettings', 'formats'],
        message: '정지형 휴대용 프로젝트는 PNG 형식만 사용할 수 있습니다.',
      });
    }
    project.items.forEach((item, index) => {
      if (item.motion.frameCount !== 1 || item.motion.durationMs !== 0) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'motion'],
          message: '정지형 항목은 1프레임, 재생 시간 0ms여야 합니다.',
        });
      }
    });
  } else if (project.generationSettings.preferredFormat === 'png') {
    context.addIssue({
      code: 'custom',
      path: ['generationSettings', 'preferredFormat'],
      message: '움직이는 휴대용 프로젝트의 대표 형식은 PNG일 수 없습니다.',
    });
  }
});

export type EmoticonProject = z.infer<typeof emoticonProjectSchema>;
export type EmoticonProjectCharacter = z.infer<typeof emoticonProjectCharacterSchema>;
export type EmoticonProjectItem = z.infer<typeof emoticonProjectItemSchema>;
export type EmoticonProjectMotion = z.infer<typeof emoticonProjectMotionSchema>;
export type EmoticonProjectBubble = z.infer<typeof emoticonProjectBubbleSchema>;
export type EmoticonProjectEditHistoryEntry = z.infer<typeof emoticonProjectEditHistoryEntrySchema>;
export type EmoticonProjectPlatform = z.infer<typeof emoticonProjectPlatformSchema>;
export type EmoticonProjectType = z.infer<typeof emoticonProjectTypeSchema>;
export type EmoticonProjectReferenceRole = z.infer<typeof emoticonProjectReferenceRoleSchema>;
export type EmoticonProjectPortable = z.infer<typeof emoticonProjectPortableSchema>;
