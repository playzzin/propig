import { z } from 'zod';
import {
  emoticonExportFormatSchema,
  emoticonResourceModeSchema,
} from '@/schemas/emoticonStudio';
import {
  emoticonProjectPlatformSchema,
  emoticonProjectTypeSchema,
} from '@/schemas/emoticonProject';

export const EMOTICON_STUDIO_DRAFT_VERSION = 1 as const;
export const EMOTICON_STUDIO_DRAFT_DEBOUNCE_MS = 400;
export const EMOTICON_STUDIO_QUICK_START_DRAFT_KEY = 'propig:emoticon-studio:v2:draft:quick-start';

const EMOTICON_STUDIO_CREATION_DRAFT_KEY_PREFIX = 'propig:emoticon-studio:v2:draft:creation:';
const projectIdSchema = z.string().min(1).max(160);

export const emoticonStudioQuickStartDraftSchema = z.object({
  projectName: z.string().max(100),
  prompt: z.string().max(2400),
  platform: emoticonProjectPlatformSchema,
  outputType: emoticonProjectTypeSchema,
  frameCount: z.number().int().min(4).max(24).optional(),
}).strict();

export const emoticonStudioCreationDraftSchema = z.object({
  prompt: z.string().max(2400),
  outputType: emoticonProjectTypeSchema,
  quantity: z.number().int().min(1).max(40),
  frameCount: z.number().int().min(4).max(24),
  durationMs: z.number().int().min(700).max(3000),
  platform: emoticonProjectPlatformSchema,
  qualityMode: emoticonResourceModeSchema,
  formats: z.array(emoticonExportFormatSchema)
    .max(7)
    .refine((formats) => new Set(formats).size === formats.length),
  storyboardSource: z.string().max(2600).optional(),
  storyboard: z.array(z.object({
    frameIndex: z.number().int().min(0).max(23),
    phase: z.enum(['setup', 'anticipation', 'action', 'follow_through', 'settle', 'loop']),
    direction: z.string().min(1).max(80),
  }).strict()).max(24).optional(),
}).strict();

const quickStartEnvelopeSchema = z.object({
  version: z.literal(EMOTICON_STUDIO_DRAFT_VERSION),
  savedAt: z.number().int().nonnegative(),
  data: emoticonStudioQuickStartDraftSchema,
}).strict();

const creationEnvelopeSchema = z.object({
  version: z.literal(EMOTICON_STUDIO_DRAFT_VERSION),
  savedAt: z.number().int().nonnegative(),
  data: emoticonStudioCreationDraftSchema,
}).strict();

export type EmoticonStudioQuickStartDraft = z.infer<typeof emoticonStudioQuickStartDraftSchema>;
export type EmoticonStudioCreationDraft = z.infer<typeof emoticonStudioCreationDraftSchema>;

export type EmoticonStudioDraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): EmoticonStudioDraftStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function creationDraftKey(projectId: string): string | null {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) return null;
  try {
    return `${EMOTICON_STUDIO_CREATION_DRAFT_KEY_PREFIX}${encodeURIComponent(parsedProjectId.data)}`;
  } catch {
    return null;
  }
}

function readStoredValue(storage: EmoticonStudioDraftStorage, key: string): unknown | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    safelyRemove(storage, key);
    return null;
  }
}

function safelyRemove(storage: EmoticonStudioDraftStorage, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readQuickStartDraft(
  storage: EmoticonStudioDraftStorage | null = browserStorage(),
): EmoticonStudioQuickStartDraft | null {
  if (!storage) return null;
  const stored = readStoredValue(storage, EMOTICON_STUDIO_QUICK_START_DRAFT_KEY);
  if (stored === null) return null;
  const parsed = quickStartEnvelopeSchema.safeParse(stored);
  if (!parsed.success) {
    safelyRemove(storage, EMOTICON_STUDIO_QUICK_START_DRAFT_KEY);
    return null;
  }
  return parsed.data.data;
}

export function saveQuickStartDraft(
  draft: EmoticonStudioQuickStartDraft,
  storage: EmoticonStudioDraftStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  const parsed = quickStartEnvelopeSchema.safeParse({
    version: EMOTICON_STUDIO_DRAFT_VERSION,
    savedAt: Date.now(),
    data: draft,
  });
  if (!parsed.success) return false;
  try {
    storage.setItem(EMOTICON_STUDIO_QUICK_START_DRAFT_KEY, JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}

export function clearQuickStartDraft(
  storage: EmoticonStudioDraftStorage | null = browserStorage(),
): boolean {
  return storage ? safelyRemove(storage, EMOTICON_STUDIO_QUICK_START_DRAFT_KEY) : false;
}

export function readCreationComposerDraft(
  projectId: string,
  storage: EmoticonStudioDraftStorage | null = browserStorage(),
): EmoticonStudioCreationDraft | null {
  const key = creationDraftKey(projectId);
  if (!storage || !key) return null;
  const stored = readStoredValue(storage, key);
  if (stored === null) return null;
  const parsed = creationEnvelopeSchema.safeParse(stored);
  if (!parsed.success) {
    safelyRemove(storage, key);
    return null;
  }
  return parsed.data.data;
}

export function saveCreationComposerDraft(
  projectId: string,
  draft: EmoticonStudioCreationDraft,
  storage: EmoticonStudioDraftStorage | null = browserStorage(),
): boolean {
  const key = creationDraftKey(projectId);
  if (!storage || !key) return false;
  const parsed = creationEnvelopeSchema.safeParse({
    version: EMOTICON_STUDIO_DRAFT_VERSION,
    savedAt: Date.now(),
    data: draft,
  });
  if (!parsed.success) return false;
  try {
    storage.setItem(key, JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}

export function clearCreationComposerDraft(
  projectId: string,
  storage: EmoticonStudioDraftStorage | null = browserStorage(),
): boolean {
  const key = creationDraftKey(projectId);
  return storage && key ? safelyRemove(storage, key) : false;
}
