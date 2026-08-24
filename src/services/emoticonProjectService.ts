import {
  collection,
  deleteField,
  doc,
  getDocs,
  getDocFromServer,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { getEmoticonPlatformProfile } from '@/lib/emoticonPlatformProfiles';
import {
  EMOTICON_PROJECT_PLATFORMS,
  EMOTICON_PROJECT_PORTABLE_FORMAT,
  EMOTICON_PROJECT_PORTABLE_VERSION,
  emoticonProjectItemSchema,
  emoticonProjectMotionSchema,
  emoticonProjectPortableSchema,
  emoticonProjectSchema,
  type EmoticonProject,
  type EmoticonProjectBubble,
  type EmoticonProjectItem,
  type EmoticonProjectMotion,
  type EmoticonProjectPlatform,
  type EmoticonProjectPortable,
  type EmoticonProjectType,
} from '@/schemas/emoticonProject';
import {
  EMOTICON_BUBBLE_APPEARANCE_DEFAULTS,
  createIdentityEmoticonImageEditRecipe,
  emoticonJobSchema,
  emoticonExportFormatSchema,
  emoticonResourceModeSchema,
  type EmoticonExportFormat,
  type EmoticonCharacterAnalysis,
  type EmoticonMotionPreference,
} from '@/schemas/emoticonStudio';
import type { EmoticonSource } from '@/services/emoticonStudioService';

const projectCollection = (userId: string) => collection(db, 'users', userId, 'emoticonProjects');
const projectDocument = (userId: string, projectId: string) => doc(db, 'users', userId, 'emoticonProjects', projectId);
const projectItemsCollection = (userId: string, projectId: string) => (
  collection(db, 'users', userId, 'emoticonProjects', projectId, 'items')
);
const projectItemDocument = (userId: string, projectId: string, itemId: string) => (
  doc(db, 'users', userId, 'emoticonProjects', projectId, 'items', itemId)
);

const DEFAULT_CHARACTER_VISUAL_STYLE = '원본의 선, 비율, 색상을 그대로 유지';
const DEFAULT_CHARACTER_NEGATIVE_PROMPT = 'different character, different outfit, inconsistent colors, detailed background, scenery, cropped head, cropped hands, cropped feet, extra arms, extra legs, malformed hands, watermark, logo, white background';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function defaultMotion(emoticonType: EmoticonProjectType, frameCount = 8): EmoticonProjectMotion {
  return emoticonType === 'static'
    ? { control: 'auto', fps: 1, frameCount: 1, durationMs: 0 }
    : { control: 'auto', fps: 8, frameCount, durationMs: 1000 };
}

function defaultBubble(): EmoticonProjectBubble {
  return {
    enabled: false,
    text: '',
    position: 'top',
    style: 'rounded',
    font: 'clean',
    entrance: 'pop',
    ...EMOTICON_BUBBLE_APPEARANCE_DEFAULTS,
    timeline: {
      mode: 'full',
      startFrame: 0,
      endFrame: null,
      cues: [],
    },
  };
}

function defaultItem(index: number, emoticonType: EmoticonProjectType, frameCount = 8): EmoticonProjectItem {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    order: index,
    title: `항목 ${index}`,
    emotion: '직접 입력',
    action: '원하는 동작을 입력하세요',
    motion: defaultMotion(emoticonType, frameCount),
    bubble: defaultBubble(),
    bubbleLayers: [],
    editRecipe: createIdentityEmoticonImageEditRecipe(),
    editHistory: [],
    instruction: '표정, 행동, 말풍선 문구와 제외할 요소를 직접 입력하세요.',
    negativePrompt: '',
    jobId: null,
    generationStatus: 'planned',
    validationErrors: [],
  };
}

export function createProjectItems(
  count: number,
  emoticonType: EmoticonProjectType = 'animated',
  frameCount = 8,
): EmoticonProjectItem[] {
  return Array.from(
    { length: Math.min(64, Math.max(1, count)) },
    (_, index) => defaultItem(index + 1, emoticonType, frameCount),
  );
}

function normalizeFormats(
  value: unknown,
  platform: EmoticonProjectPlatform,
  emoticonType: EmoticonProjectType,
): EmoticonExportFormat[] {
  const parsed = Array.isArray(value)
    ? value.map((item) => emoticonExportFormatSchema.safeParse(item))
      .filter((item) => item.success)
      .map((item) => item.data)
    : [];
  const unique = Array.from(new Set(parsed));
  if (emoticonType === 'static') return ['png'];
  return unique.some((format) => format !== 'png')
    ? unique
    : [...getEmoticonPlatformProfile(platform, emoticonType).allowedFormats];
}

function normalizeLegacyItem(
  value: unknown,
  index: number,
  emoticonType: EmoticonProjectType,
): EmoticonProjectItem | null {
  if (!isRecord(value)) return null;
  const motion = emoticonType === 'static'
    ? defaultMotion('static')
    : isRecord(value.motion)
      ? { ...defaultMotion('animated'), ...value.motion }
      : defaultMotion('animated');
  const bubbleValue = isRecord(value.bubble) ? value.bubble : {};
  const timelineValue = isRecord(bubbleValue.timeline) ? bubbleValue.timeline : {};
  const legacyText = typeof value.text === 'string' ? value.text : '';
  const bubble = {
    ...defaultBubble(),
    ...bubbleValue,
    enabled: typeof bubbleValue.enabled === 'boolean'
      ? bubbleValue.enabled
      : Boolean(value.bubbleEnabled),
    text: typeof bubbleValue.text === 'string' ? bubbleValue.text : legacyText,
    position: bubbleValue.position || value.textPosition || 'top',
    style: bubbleValue.style || value.bubbleStyle || 'rounded',
    font: bubbleValue.font || value.bubbleFont || 'clean',
    entrance: bubbleValue.entrance || value.bubbleEntrance || 'pop',
    timeline: {
      ...defaultBubble().timeline,
      ...timelineValue,
      cues: Array.isArray(timelineValue.cues) ? timelineValue.cues : [],
    },
  };
  const parsed = emoticonProjectItemSchema.safeParse({
    ...value,
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    revision: typeof value.revision === 'number' ? value.revision : 0,
    order: typeof value.order === 'number' ? value.order : index + 1,
    motion,
    bubble,
    editRecipe: value.editRecipe || createIdentityEmoticonImageEditRecipe(),
    editHistory: Array.isArray(value.editHistory) ? value.editHistory : [],
  });
  if (!parsed.success) {
    console.warn('[Emoticon Studio] Ignored an invalid project item.', parsed.error.issues);
    return null;
  }
  return parsed.data;
}

function normalizeProjectValue(projectId: string, value: Record<string, unknown>): Record<string, unknown> {
  const emoticonType: EmoticonProjectType = value.emoticonType === 'static' ? 'static' : 'animated';
  const platform = typeof value.platform === 'string'
    && EMOTICON_PROJECT_PLATFORMS.includes(value.platform as EmoticonProjectPlatform)
    ? value.platform as EmoticonProjectPlatform
    : 'kakao';
  const platformProfile = getEmoticonPlatformProfile(platform, emoticonType);
  const generationSettings = isRecord(value.generationSettings) ? value.generationSettings : {};
  const formats = normalizeFormats(generationSettings.formats, platform, emoticonType);
  const preferredCandidate = emoticonExportFormatSchema.safeParse(generationSettings.preferredFormat);
  const preferredFormat = preferredCandidate.success
    && formats.includes(preferredCandidate.data)
    && !(emoticonType === 'animated' && preferredCandidate.data === 'png')
    ? preferredCandidate.data
    : formats[0];
  const resourceMode = emoticonResourceModeSchema.safeParse(generationSettings.resourceMode);
  const spec = isRecord(value.spec) ? value.spec : {};
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items = rawItems
    .map((item, index) => normalizeLegacyItem(item, index, emoticonType))
    .filter((item): item is EmoticonProjectItem => Boolean(item));
  return {
    ...value,
    id: projectId,
    schemaVersion: 2,
    revision: typeof value.revision === 'number' && value.revision >= 0 ? value.revision : 0,
    platform,
    emoticonType,
    generationSettings: {
      motionPreference: generationSettings.motionPreference || 'auto',
      resourceMode: resourceMode.success ? resourceMode.data : 'premium',
      formats,
      preferredFormat,
    },
    spec: {
      canvasWidth: spec.canvasWidth || platformProfile.width,
      canvasHeight: spec.canvasHeight || platformProfile.height,
      transparentBackground: true,
      recommendedItemCount: spec.recommendedItemCount || platformProfile.recommendedItemCount,
      profileVersion: spec.profileVersion || platformProfile.profileVersion,
      profileVerification: spec.profileVerification || platformProfile.verification,
      ...(typeof spec.sourceUrl === 'string'
        ? { sourceUrl: spec.sourceUrl }
        : platformProfile.sourceUrl ? { sourceUrl: platformProfile.sourceUrl } : {}),
      ...(typeof spec.checkedAt === 'string'
        ? { checkedAt: spec.checkedAt }
        : platformProfile.checkedAt ? { checkedAt: platformProfile.checkedAt } : {}),
    },
    items,
  };
}

function parseProject(projectId: string, value: Record<string, unknown>): EmoticonProject | null {
  const parsed = emoticonProjectSchema.safeParse(normalizeProjectValue(projectId, value));
  if (!parsed.success) {
    console.warn('[Emoticon Studio] Ignored an invalid project snapshot.', parsed.error.issues);
    return null;
  }
  return parsed.data;
}

/**
 * Reads the project and its v2 item subcollection from Firestore's server.
 * Export/preflight flows use this after pending saves finish so they never
 * package an offline cache or an earlier realtime callback.
 */
export async function getEmoticonProject(params: {
    userId: string;
    projectId: string;
}): Promise<EmoticonProject | null> {
  const projectRef = projectDocument(params.userId, params.projectId);
  const readSignature = (data: Record<string, unknown>): string => {
    const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
    return JSON.stringify({
      revision: data.revision,
      itemCount: data.itemCount,
      deletionLocked: data.deletionLocked === true,
      updatedAt: typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : null,
    });
  };
  const itemReadSignature = (
    snapshot: Awaited<ReturnType<typeof getDocsFromServer>>,
  ): string => JSON.stringify(snapshot.docs.map((item) => {
    const data = item.data() as Record<string, unknown>;
    const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
    return {
      id: item.id,
      revision: data.revision,
      serverRevision: data.serverRevision,
      order: data.order,
      jobId: data.jobId,
      generationStatus: data.generationStatus,
      updatedAt: typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : null,
    };
  }));

  // Firestore's client SDK cannot read a parent document and subcollection in
  // one transaction from the server. Read the parent before and after the item
  // query and retry unless both revisions match, preventing mixed exports when
  // another tab reconfigures a project between the two reads.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await getDocFromServer(projectRef);
    if (!before.exists()) return null;
    const itemQuery = query(
      projectItemsCollection(params.userId, params.projectId),
      orderBy('order', 'asc'),
    );
    const itemSnapshot = await getDocsFromServer(itemQuery);
    const confirmedItemSnapshot = await getDocsFromServer(itemQuery);
    const after = await getDocFromServer(projectRef);
    if (!after.exists()) return null;
    if (readSignature(before.data()) !== readSignature(after.data())) continue;
    if (itemReadSignature(itemSnapshot) !== itemReadSignature(confirmedItemSnapshot)) continue;

    const project = parseProject(after.id, after.data());
    if (!project) return null;
    if (confirmedItemSnapshot.empty) {
      if (project.items.length === project.itemCount) return project;
      continue;
    }
    const items = confirmedItemSnapshot.docs
      .map((item, index) => normalizeLegacyItem(
        { id: item.id, ...item.data() },
        index,
        project.emoticonType,
      ))
      .filter((item): item is EmoticonProjectItem => Boolean(item));
    if (items.length !== project.itemCount) continue;
    return { ...project, items };
  }
  throw new Error('프로젝트가 다른 화면에서 계속 변경되어 일관된 최신 내보내기 상태를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

export function getPlatformSpec(
  platform: EmoticonProjectPlatform,
  emoticonType: EmoticonProjectType = 'animated',
) {
  const profile = getEmoticonPlatformProfile(platform, emoticonType);
  return {
    width: profile.width,
    height: profile.height,
    count: profile.recommendedItemCount,
  };
}

export async function createEmoticonProject(params: {
  userId: string;
  title?: string;
  platform?: EmoticonProjectPlatform;
  emoticonType?: EmoticonProjectType;
  source?: EmoticonSource;
  itemCount?: number;
  frameCount?: number;
  workflowMode?: 'ai' | 'manual';
}): Promise<string> {
  const projectId = crypto.randomUUID();
  const platform = params.platform || 'kakao';
  const emoticonType = params.emoticonType || 'animated';
  const profile = getEmoticonPlatformProfile(platform, emoticonType);
  const itemCount = Math.min(64, Math.max(1, params.itemCount || profile.recommendedItemCount));
  const frameCount = emoticonType === 'static'
    ? 1
    : Math.max(Math.max(4, profile.minFrameCount), Math.min(profile.maxFrameCount, Math.round(params.frameCount || 8)));
  const items = createProjectItems(itemCount, emoticonType, frameCount);
  const formats = [profile.preferredFormat];
  const batch = writeBatch(db);
  batch.set(projectDocument(params.userId, projectId), {
    schemaVersion: 2,
    revision: 0,
    id: projectId,
    userId: params.userId,
    title: params.title?.trim() || '새 이모티콘 프로젝트',
    description: '',
    platform,
    emoticonType,
    itemCount,
    character: {
      name: '내 캐릭터',
      description: '',
      visualStyle: DEFAULT_CHARACTER_VISUAL_STYLE,
      references: params.source ? [params.source] : [],
      identityPrompt: '',
      negativePrompt: DEFAULT_CHARACTER_NEGATIVE_PROMPT,
    },
    generationSettings: {
      motionPreference: 'auto' as EmoticonMotionPreference,
      resourceMode: 'efficient',
      formats,
      preferredFormat: profile.preferredFormat,
    },
    spec: {
      canvasWidth: profile.width,
      canvasHeight: profile.height,
      transparentBackground: true,
      recommendedItemCount: profile.recommendedItemCount,
      profileVersion: profile.profileVersion,
      profileVerification: profile.verification,
      ...(profile.sourceUrl ? { sourceUrl: profile.sourceUrl } : {}),
      ...(profile.checkedAt ? { checkedAt: profile.checkedAt } : {}),
    },
    status: 'draft',
    v2: {
      experienceVersion: 2,
      workflowMode: params.workflowMode || 'ai',
      approvedCharacterProfileVersionId: null,
      latestCreationTurnId: null,
      latestTimelineId: null,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  items.forEach((item) => {
    batch.set(projectItemDocument(params.userId, projectId, item.id), {
      ...item,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return projectId;
}

type ProjectUpdate = Partial<Omit<
  EmoticonProject,
  | 'id'
  | 'userId'
  | 'schemaVersion'
  | 'revision'
  | 'items'
  | 'character'
  | 'generationSettings'
  | 'spec'
  | 'deletionLocked'
  | 'deletionOperationId'
  | 'deletionMode'
  | 'deletionRequestedAt'
  | 'createdAt'
  | 'updatedAt'
>> & {
  character?: Partial<EmoticonProject['character']>;
  generationSettings?: Partial<EmoticonProject['generationSettings']>;
  spec?: Partial<EmoticonProject['spec']>;
};

function characterReferenceSetSignature(
  references: EmoticonProject['character']['references'],
): string {
  const [primary, ...supplemental] = references.map((reference) => reference.sourceStoragePath);
  return [primary || '', ...supplemental.sort()].join('\u0000');
}

function detachCharacterProfile(
  character: EmoticonProject['character'],
): EmoticonProject['character'] {
  const appliedProfile = character.profile;
  const {
    profile: _profile,
    profileJobId: _profileJobId,
    identityFingerprint: _identityFingerprint,
    ...editableCharacter
  } = character;
  if (!appliedProfile) return editableCharacter;
  const appliedDescription = appliedProfile.summary.slice(0, 800);
  const appliedVisualStyle = appliedProfile.styleLock.join('; ').slice(0, 160);
  const appliedIdentityPrompt = appliedProfile.immutableLock.join('; ').slice(0, 1200);
  const appliedNegativePrompt = appliedProfile.negativeLock.join('; ').slice(0, 1200);
  return {
    ...editableCharacter,
    description: character.description === appliedDescription ? '' : character.description,
    visualStyle: character.visualStyle === appliedVisualStyle
      ? DEFAULT_CHARACTER_VISUAL_STYLE
      : character.visualStyle,
    identityPrompt: character.identityPrompt === appliedIdentityPrompt ? '' : character.identityPrompt,
    negativePrompt: character.negativePrompt === appliedNegativePrompt
      ? DEFAULT_CHARACTER_NEGATIVE_PROMPT
      : character.negativePrompt,
  };
}

export async function updateEmoticonProject(params: {
  userId: string;
  projectId: string;
  update: ProjectUpdate;
  expectedProjectRevision?: number;
}): Promise<void> {
  const ref = projectDocument(params.userId, params.projectId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('프로젝트를 찾을 수 없습니다.');
    const current = parseProject(snapshot.id, snapshot.data());
    if (!current) throw new Error('프로젝트 데이터가 손상되었습니다.');
    if (
      params.expectedProjectRevision !== undefined
      && current.revision !== params.expectedProjectRevision
    ) {
      throw new Error('다른 화면에서 프로젝트 설정이 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.');
    }
    const mergedCharacter = params.update.character
      ? { ...current.character, ...params.update.character }
      : current.character;
    const referencesChanged = Boolean(
      params.update.character?.references
      && characterReferenceSetSignature(current.character.references)
        !== characterReferenceSetSignature(mergedCharacter.references),
    );
    const nextCharacter = referencesChanged
      ? detachCharacterProfile(mergedCharacter)
      : mergedCharacter;
    const nextGenerationSettings = params.update.generationSettings
      ? { ...current.generationSettings, ...params.update.generationSettings }
      : current.generationSettings;
    const nextSpec = params.update.spec
      ? { ...current.spec, ...params.update.spec }
      : current.spec;
    const candidate = emoticonProjectSchema.safeParse({
      ...current,
      ...params.update,
      character: nextCharacter,
      generationSettings: nextGenerationSettings,
      spec: nextSpec,
      revision: current.revision + 1,
    });
    if (!candidate.success) {
      throw new Error(candidate.error.issues[0]?.message || '프로젝트 설정을 저장할 수 없습니다.');
    }
    const update: Record<string, unknown> = { ...params.update };
    if (params.update.character) update.character = candidate.data.character;
    if (params.update.generationSettings) {
      update.generationSettings = candidate.data.generationSettings;
    }
    if (params.update.spec) update.spec = candidate.data.spec;
    transaction.update(ref, {
      ...update,
      schemaVersion: 2,
      revision: candidate.data.revision,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Applies only a server-authored, completed profile result. The transaction
 * binds the result to its owner/project and current project revision so a
 * client cannot substitute an arbitrary lock payload.
 */
export async function applyEmoticonCharacterProfile(params: {
  userId: string;
  projectId: string;
  profileJobId: string;
}): Promise<EmoticonCharacterAnalysis> {
  const projectRef = projectDocument(params.userId, params.projectId);
  const jobRef = doc(db, 'users', params.userId, 'emoticonJobs', params.profileJobId);
  let appliedAnalysis: EmoticonCharacterAnalysis | null = null;
  await runTransaction(db, async (transaction) => {
    const [projectSnapshot, jobSnapshot] = await Promise.all([
      transaction.get(projectRef),
      transaction.get(jobRef),
    ]);
    if (!projectSnapshot.exists()) throw new Error('프로젝트를 찾을 수 없어요.');
    const project = parseProject(projectSnapshot.id, projectSnapshot.data());
    if (!project || project.userId !== params.userId) {
      throw new Error('프로젝트 소유권을 확인할 수 없어요.');
    }
    if (project.deletionLocked) {
      throw new Error('삭제가 진행 중인 프로젝트에는 캐릭터 분석을 적용할 수 없어요.');
    }
    if (project.status === 'generating') {
      throw new Error('항목 생성이 끝난 뒤 캐릭터 분석을 적용하세요.');
    }
    if (!jobSnapshot.exists()) throw new Error('캐릭터 분석 작업을 찾을 수 없어요.');
    const job = emoticonJobSchema.safeParse({ id: jobSnapshot.id, ...jobSnapshot.data() });
    if (
      !job.success
      || job.data.userId !== params.userId
      || job.data.projectId !== params.projectId
      || job.data.mode !== 'profile'
      || job.data.status !== 'completed'
      || !job.data.characterAnalysis
      || !job.data.identityFingerprint
    ) {
      throw new Error('현재 프로젝트에서 완료된 유효한 캐릭터 분석만 적용할 수 있어요.');
    }
    const projectReferencePaths = project.character.references.map((reference) => reference.sourceStoragePath);
    const jobReferencePaths = [
      job.data.sourceStoragePath,
      ...job.data.referenceImages.map((reference) => reference.sourceStoragePath),
    ];
    if (
      projectReferencePaths[0] !== jobReferencePaths[0]
      || projectReferencePaths.length !== jobReferencePaths.length
      || [...projectReferencePaths.slice(1)].sort().some((path, index) => (
        path !== [...jobReferencePaths.slice(1)].sort()[index]
      ))
    ) {
      throw new Error('참조 이미지 구성이 분석 이후 변경됐어요. 현재 참조로 다시 분석해 주세요.');
    }
    const analysis = job.data.characterAnalysis;
    if (analysis.referenceCount !== projectReferencePaths.length) {
      throw new Error('캐릭터 분석이 현재 참조 이미지 전체를 반영하지 않아 적용하지 않았어요.');
    }
    const character = {
      ...project.character,
      description: analysis.summary.slice(0, 800),
      visualStyle: analysis.styleLock.join('; ').slice(0, 160),
      identityPrompt: analysis.immutableLock.join('; ').slice(0, 1200),
      negativePrompt: analysis.negativeLock.join('; ').slice(0, 1200),
      profile: analysis,
      profileJobId: job.data.id,
      identityFingerprint: job.data.identityFingerprint,
    };
    const candidate = emoticonProjectSchema.safeParse({
      ...project,
      character,
      revision: project.revision + 1,
    });
    if (!candidate.success) {
      throw new Error(candidate.error.issues[0]?.message || '캐릭터 분석을 프로젝트에 적용할 수 없어요.');
    }
    transaction.update(projectRef, {
      character: candidate.data.character,
      revision: candidate.data.revision,
      updatedAt: serverTimestamp(),
    });
    appliedAnalysis = analysis;
  });
  if (!appliedAnalysis) throw new Error('캐릭터 분석을 적용하지 못했어요.');
  return appliedAnalysis;
}

function hasMatchingCharacterReferencePaths(
  project: EmoticonProject,
  job: { sourceStoragePath: string; referenceImages: Array<{ sourceStoragePath: string }> },
): boolean {
  const projectPaths = project.character.references.map((reference) => reference.sourceStoragePath);
  const jobPaths = [
    job.sourceStoragePath,
    ...job.referenceImages.map((reference) => reference.sourceStoragePath),
  ];
  if (projectPaths.length !== jobPaths.length || projectPaths[0] !== jobPaths[0]) return false;
  const supplementalProjectPaths = [...projectPaths.slice(1)].sort();
  const supplementalJobPaths = [...jobPaths.slice(1)].sort();
  return supplementalProjectPaths.every((path, index) => path === supplementalJobPaths[index]);
}

/**
 * Creates a static character-sheet project in one transaction. The completed
 * server-authored sheet plan, source project revision, and full reference set
 * are rechecked immediately before any target document is written.
 */
export async function createEmoticonProjectFromCharacterSheet(params: {
  userId: string;
  sourceProjectId: string;
  sheetJobId: string;
  expectedSourceProjectRevision: number;
  title?: string;
}): Promise<{ projectId: string; firstItemId: string }> {
  const projectId = crypto.randomUUID();
  const sourceProjectRef = projectDocument(params.userId, params.sourceProjectId);
  const sheetJobRef = doc(db, 'users', params.userId, 'emoticonJobs', params.sheetJobId);
  const targetProjectRef = projectDocument(params.userId, projectId);
  let firstItemId = '';

  await runTransaction(db, async (transaction) => {
    const [sourceSnapshot, sheetJobSnapshot, targetSnapshot] = await Promise.all([
      transaction.get(sourceProjectRef),
      transaction.get(sheetJobRef),
      transaction.get(targetProjectRef),
    ]);
    if (!sourceSnapshot.exists()) throw new Error('원본 프로젝트를 찾을 수 없어요.');
    const sourceProject = parseProject(sourceSnapshot.id, sourceSnapshot.data());
    if (!sourceProject || sourceProject.userId !== params.userId) {
      throw new Error('원본 프로젝트 소유권을 확인할 수 없어요.');
    }
    if (sourceProject.deletionLocked) {
      throw new Error('삭제가 진행 중인 프로젝트에서는 캐릭터 시트 프로젝트를 만들 수 없어요.');
    }
    if (sourceProject.status === 'generating') {
      throw new Error('항목 생성이 끝난 뒤 캐릭터 시트 프로젝트를 만드세요.');
    }
    if (sourceProject.revision !== params.expectedSourceProjectRevision) {
      throw new Error('캐릭터 또는 프로젝트 설정이 변경됐어요. 최신 시트 계획을 확인한 뒤 다시 시도해 주세요.');
    }
    if (targetSnapshot.exists()) throw new Error('새 프로젝트 번호가 이미 사용 중이에요. 다시 시도해 주세요.');
    if (!sheetJobSnapshot.exists()) throw new Error('캐릭터 시트 기획 작업을 찾을 수 없어요.');
    const sheetJob = emoticonJobSchema.safeParse({
      id: sheetJobSnapshot.id,
      ...sheetJobSnapshot.data(),
    });
    if (
      !sheetJob.success
      || sheetJob.data.userId !== params.userId
      || sheetJob.data.projectId !== params.sourceProjectId
      || sheetJob.data.mode !== 'sheet_plan'
      || sheetJob.data.status !== 'completed'
      || !sheetJob.data.profileJobId
      || !sheetJob.data.characterAnalysis
      || !sheetJob.data.sheetPlan
      || !sheetJob.data.identityFingerprint
    ) {
      throw new Error('현재 프로젝트에서 완료된 유효한 캐릭터 시트 기획만 적용할 수 있어요.');
    }
    if (!hasMatchingCharacterReferencePaths(sourceProject, sheetJob.data)) {
      throw new Error('참조 이미지 구성이 시트 기획 이후 변경됐어요. 현재 참조로 다시 기획해 주세요.');
    }
    if (sheetJob.data.characterAnalysis.referenceCount !== sourceProject.character.references.length) {
      throw new Error('시트 기획이 현재 참조 이미지 전체를 반영하지 않아 새 프로젝트를 만들지 않았어요.');
    }

    const analysis = sheetJob.data.characterAnalysis;
    const items = sheetJob.data.sheetPlan.items.map((sheetItem, index) => ({
      ...defaultItem(index + 1, 'static'),
      id: crypto.randomUUID(),
      title: sheetItem.title,
      emotion: sheetItem.expression,
      action: `${sheetItem.angle} · ${sheetItem.pose}`.slice(0, 160),
      instruction: [
        sheetItem.instruction,
        '한 캔버스에 캐릭터 하나만 전신으로 배치하고, 다중 인물·시트 격자·패널·배경·글자를 그리지 마세요.',
      ].join('\n').slice(0, 800),
      negativePrompt: 'multiple characters, contact sheet, grid, panels, scenery, floor, cast shadow, text, speech bubble, watermark, cropped anatomy, extra limbs, malformed limbs, residue',
    }));
    firstItemId = items[0]?.id || '';
    if (!firstItemId) throw new Error('캐릭터 시트에 적용할 항목이 없어요.');

    const platformProfile = getEmoticonPlatformProfile(sourceProject.platform, 'static');
    const candidate = emoticonProjectSchema.safeParse({
      schemaVersion: 2,
      revision: 0,
      id: projectId,
      userId: params.userId,
      title: params.title?.trim().slice(0, 100)
        || `${sourceProject.title} · 캐릭터 시트`.slice(0, 100),
      description: sourceProject.description,
      platform: sourceProject.platform,
      emoticonType: 'static',
      itemCount: items.length,
      character: {
        name: sourceProject.character.name,
        description: analysis.summary.slice(0, 800),
        visualStyle: analysis.styleLock.join('; ').slice(0, 160),
        references: sourceProject.character.references,
        identityPrompt: analysis.immutableLock.join('; ').slice(0, 1200),
        negativePrompt: analysis.negativeLock.join('; ').slice(0, 1200),
        profile: analysis,
        identityFingerprint: sheetJob.data.identityFingerprint,
      },
      generationSettings: {
        motionPreference: 'stable',
        resourceMode: sourceProject.generationSettings.resourceMode,
        formats: ['png'],
        preferredFormat: 'png',
      },
      spec: {
        canvasWidth: platformProfile.width,
        canvasHeight: platformProfile.height,
        transparentBackground: true,
        recommendedItemCount: platformProfile.recommendedItemCount,
        profileVersion: platformProfile.profileVersion,
        profileVerification: platformProfile.verification,
        ...(platformProfile.sourceUrl ? { sourceUrl: platformProfile.sourceUrl } : {}),
        ...(platformProfile.checkedAt ? { checkedAt: platformProfile.checkedAt } : {}),
      },
      items,
      status: 'ready',
    });
    if (!candidate.success) {
      throw new Error(candidate.error.issues[0]?.message || '캐릭터 시트 프로젝트 구성을 검증하지 못했어요.');
    }

    const {
      items: validatedItems,
      deletionLocked: _deletionLocked,
      deletionOperationId: _deletionOperationId,
      deletionMode: _deletionMode,
      deletionRequestedAt: _deletionRequestedAt,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...targetProject
    } = candidate.data;
    transaction.set(targetProjectRef, {
      ...targetProject,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    validatedItems.forEach((item) => {
      const { createdAt: _itemCreatedAt, updatedAt: _itemUpdatedAt, ...persistedItem } = item;
      transaction.set(projectItemDocument(params.userId, projectId, item.id), {
        ...persistedItem,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });

  return { projectId, firstItemId };
}

export type EmoticonProjectItemUpdate = Partial<Omit<
  EmoticonProjectItem,
  | 'id'
  | 'revision'
  | 'order'
  | 'jobId'
  | 'generationStatus'
  | 'validationErrors'
  | 'motion'
  | 'bubble'
  | 'editRecipe'
  | 'editHistory'
  | 'createdAt'
  | 'updatedAt'
>> & {
  motion?: Partial<EmoticonProjectMotion>;
  bubble?: Partial<EmoticonProjectBubble> & {
    timeline?: Partial<EmoticonProjectBubble['timeline']>;
  };
};

export async function updateEmoticonProjectItem(params: {
  userId: string;
  projectId: string;
  itemId: string;
  update: EmoticonProjectItemUpdate;
}): Promise<void> {
  const ref = projectItemDocument(params.userId, params.projectId, params.itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('이모티콘 항목을 찾을 수 없습니다.');
    const current = normalizeLegacyItem({ id: snapshot.id, ...snapshot.data() }, 0, 'animated');
    if (!current) throw new Error('이모티콘 항목 데이터가 손상되었습니다.');
    const nextBubble = params.update.bubble
      ? {
        ...current.bubble,
        ...params.update.bubble,
        timeline: params.update.bubble.timeline
          ? { ...current.bubble.timeline, ...params.update.bubble.timeline }
          : current.bubble.timeline,
      }
      : current.bubble;
    const candidate = {
      ...current,
      ...params.update,
      motion: params.update.motion ? { ...current.motion, ...params.update.motion } : current.motion,
      bubble: nextBubble,
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    };
    const parsed = emoticonProjectItemSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || '항목 설정을 저장할 수 없습니다.');
    }
    transaction.set(ref, candidate, { merge: true });
  });
}

export async function replaceEmoticonProjectItems(params: {
  userId: string;
  projectId: string;
  items: EmoticonProjectItem[];
  status?: EmoticonProject['status'];
  expectedProjectRevision?: number;
  projectUpdate?: ProjectUpdate;
}): Promise<void> {
  const parsedItems = params.items.map((item, index) => emoticonProjectItemSchema.parse({
    ...item,
    order: index + 1,
  }));
  const existing = await getDocs(projectItemsCollection(params.userId, params.projectId));
  const nextIds = new Set(parsedItems.map((item) => item.id));
  const projectRef = projectDocument(params.userId, params.projectId);
  await runTransaction(db, async (transaction) => {
    const [projectSnapshot, ...itemSnapshots] = await Promise.all([
      transaction.get(projectRef),
      ...existing.docs.map((snapshot) => transaction.get(snapshot.ref)),
    ]);
    if (!projectSnapshot.exists()) throw new Error('프로젝트를 찾을 수 없습니다.');
    const currentProject = parseProject(projectSnapshot.id, projectSnapshot.data());
    if (!currentProject) throw new Error('프로젝트 데이터가 손상되었습니다.');
    const currentProjectRevision = typeof projectSnapshot.data().revision === 'number'
      ? projectSnapshot.data().revision as number
      : 0;
    if (
      params.expectedProjectRevision !== undefined
      && currentProjectRevision !== params.expectedProjectRevision
    ) {
      throw new Error('다른 화면에서 프로젝트 구조가 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.');
    }

    itemSnapshots.forEach((snapshot) => {
      if (!snapshot.exists()) {
        throw new Error('다른 화면에서 프로젝트 항목이 변경되었습니다. 다시 시도해 주세요.');
      }
      if (!nextIds.has(snapshot.id)) {
        const status = snapshot.data()?.generationStatus;
        if (status === 'queued' || status === 'generating') {
          throw new Error('생성 중인 항목이 있어 프로젝트 구조를 줄이거나 교체할 수 없습니다.');
        }
        transaction.delete(snapshot.ref);
      }
    });

    const existingById = new Map(itemSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    parsedItems.forEach((item) => {
      const snapshot = existingById.get(item.id);
      const itemRef = projectItemDocument(params.userId, params.projectId, item.id);
      if (!snapshot) {
        if (item.jobId || item.generationStatus !== 'planned' || item.validationErrors.length) {
          throw new Error('새 항목에는 기존 생성 작업이나 검증 상태를 연결할 수 없습니다.');
        }
        transaction.set(itemRef, {
          ...item,
          revision: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return;
      }
      const snapshotData = snapshot.data();
      if (!snapshotData) {
        throw new Error('다른 화면에서 프로젝트 항목이 변경되었습니다. 다시 시도해 주세요.');
      }
      const currentOrder = typeof snapshotData.order === 'number' ? snapshotData.order as number : 0;
      if (currentOrder === item.order) return;
      const currentRevision = typeof snapshotData.revision === 'number'
        ? snapshotData.revision as number
        : 0;
      transaction.update(itemRef, {
        order: item.order,
        revision: currentRevision + 1,
        updatedAt: serverTimestamp(),
      });
    });

    const projectUpdate = params.projectUpdate || {};
    const nextCharacter = projectUpdate.character
      ? { ...currentProject.character, ...projectUpdate.character }
      : currentProject.character;
    const nextGenerationSettings = projectUpdate.generationSettings
      ? { ...currentProject.generationSettings, ...projectUpdate.generationSettings }
      : currentProject.generationSettings;
    const nextSpec = projectUpdate.spec
      ? { ...currentProject.spec, ...projectUpdate.spec }
      : currentProject.spec;
    const candidateProject = emoticonProjectSchema.safeParse({
      ...currentProject,
      ...projectUpdate,
      character: nextCharacter,
      generationSettings: nextGenerationSettings,
      spec: nextSpec,
      itemCount: parsedItems.length,
      items: [],
      status: params.status || projectUpdate.status || currentProject.status,
      revision: currentProjectRevision + 1,
    });
    if (!candidateProject.success) {
      throw new Error(candidateProject.error.issues[0]?.message || '프로젝트 구성을 저장할 수 없습니다.');
    }
    const {
      character: _character,
      generationSettings: _generationSettings,
      spec: _spec,
      itemCount: _itemCount,
      status: _status,
      ...flatProjectUpdate
    } = projectUpdate;

    transaction.update(projectRef, {
      ...flatProjectUpdate,
      ...(projectUpdate.character ? { character: nextCharacter } : {}),
      ...(projectUpdate.generationSettings ? { generationSettings: nextGenerationSettings } : {}),
      ...(projectUpdate.spec ? { spec: nextSpec } : {}),
      itemCount: parsedItems.length,
      ...((params.status || projectUpdate.status) ? { status: params.status || projectUpdate.status } : {}),
      revision: currentProjectRevision + 1,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function reconfigureEmoticonProject(params: {
  userId: string;
  projectId: string;
  expectedProjectRevision: number;
  items: EmoticonProjectItem[];
  update: ProjectUpdate;
}): Promise<void> {
  const projectRef = projectDocument(params.userId, params.projectId);
  const itemRefs = params.items.map((item) => (
    projectItemDocument(params.userId, params.projectId, item.id)
  ));
  await runTransaction(db, async (transaction) => {
    const [projectSnapshot, ...itemSnapshots] = await Promise.all([
      transaction.get(projectRef),
      ...itemRefs.map((itemRef) => transaction.get(itemRef)),
    ]);
    if (!projectSnapshot.exists()) throw new Error('프로젝트를 찾을 수 없습니다.');
    const current = parseProject(projectSnapshot.id, projectSnapshot.data());
    if (!current) throw new Error('프로젝트 데이터가 손상되었습니다.');
    if (current.revision !== params.expectedProjectRevision) {
      throw new Error('다른 화면에서 프로젝트 설정이 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.');
    }
    if (itemSnapshots.some((snapshot) => !snapshot.exists())) {
      throw new Error('다른 화면에서 프로젝트 항목이 변경되었습니다. 다시 시도해 주세요.');
    }
    if (itemSnapshots.some((snapshot) => {
      const status = snapshot.data()?.generationStatus;
      return status === 'queued' || status === 'generating';
    })) {
      throw new Error('생성 중인 항목이 있어 플랫폼·형식 설정을 바꿀 수 없습니다. 작업이 끝난 뒤 다시 시도해 주세요.');
    }

    const mergedCharacter = params.update.character
      ? { ...current.character, ...params.update.character }
      : current.character;
    const referencesChanged = Boolean(
      params.update.character?.references
      && characterReferenceSetSignature(current.character.references)
        !== characterReferenceSetSignature(mergedCharacter.references),
    );
    const nextCharacter = referencesChanged
      ? detachCharacterProfile(mergedCharacter)
      : mergedCharacter;
    const nextGenerationSettings = params.update.generationSettings
      ? { ...current.generationSettings, ...params.update.generationSettings }
      : current.generationSettings;
    const nextSpec = params.update.spec
      ? { ...current.spec, ...params.update.spec }
      : current.spec;
    const candidate = emoticonProjectSchema.safeParse({
      ...current,
      ...params.update,
      character: nextCharacter,
      generationSettings: nextGenerationSettings,
      spec: nextSpec,
      revision: current.revision + 1,
      items: [],
      status: params.update.status || 'ready',
    });
    if (!candidate.success) {
      throw new Error(candidate.error.issues[0]?.message || '프로젝트 형식을 변경할 수 없습니다.');
    }

    itemSnapshots.forEach((snapshot, index) => {
      const desired = params.items[index];
      const currentItem = normalizeLegacyItem(
        { id: snapshot.id, ...snapshot.data() },
        index,
        candidate.data.emoticonType,
      );
      if (!desired || !currentItem || desired.id !== snapshot.id) {
        throw new Error('프로젝트 항목 순서가 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.');
      }
      if (desired.revision !== currentItem.revision) {
        throw new Error('다른 화면에서 항목 설정이 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.');
      }
      const nextItem = emoticonProjectItemSchema.safeParse({
        ...currentItem,
        motion: desired.motion,
        bubble: desired.bubble,
        jobId: null,
        generationStatus: 'planned',
        validationErrors: [],
        revision: currentItem.revision + 1,
      });
      if (!nextItem.success) {
        throw new Error(nextItem.error.issues[0]?.message || '항목을 새 형식에 맞게 초기화할 수 없습니다.');
      }
      transaction.update(snapshot.ref, {
        motion: nextItem.data.motion,
        bubble: nextItem.data.bubble,
        editRecipe: createIdentityEmoticonImageEditRecipe(),
        editHistory: [],
        jobId: null,
        generationStatus: 'planned',
        validationErrors: [],
        activeJobCreatedAtMs: deleteField(),
        revision: nextItem.data.revision,
        updatedAt: serverTimestamp(),
      });
    });

    const update: Record<string, unknown> = { ...params.update };
    if (params.update.character) update.character = candidate.data.character;
    if (params.update.generationSettings) update.generationSettings = candidate.data.generationSettings;
    if (params.update.spec) update.spec = candidate.data.spec;
    transaction.update(projectRef, {
      ...update,
      status: candidate.data.status,
      revision: candidate.data.revision,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function linkCompletedEmoticonProjectJob(params: {
  userId: string;
  projectId: string;
  itemId: string;
  jobId: string;
}): Promise<void> {
  const itemRef = projectItemDocument(params.userId, params.projectId, params.itemId);
  const jobRef = doc(db, 'users', params.userId, 'emoticonJobs', params.jobId);
  await runTransaction(db, async (transaction) => {
    const [itemSnapshot, jobSnapshot] = await Promise.all([
      transaction.get(itemRef),
      transaction.get(jobRef),
    ]);
    if (!itemSnapshot.exists()) throw new Error('이모티콘 항목을 찾을 수 없습니다.');
    if (!jobSnapshot.exists()) throw new Error('선택한 완성 작업을 찾을 수 없습니다.');

    const job = emoticonJobSchema.safeParse({ id: jobSnapshot.id, ...jobSnapshot.data() });
    if (
      !job.success
      || job.data.userId !== params.userId
      || job.data.status !== 'completed'
      || job.data.projectId !== params.projectId
      || job.data.projectItemId !== params.itemId
      || job.data.specReport?.technicalPass !== true
      || job.data.specReport?.allOutputsPass !== true
    ) {
      throw new Error('이 프로젝트 항목에 속한 완성 결과인지 확인할 수 없어 연결하지 않았어요.');
    }
    const current = emoticonProjectItemSchema.safeParse({
      id: itemSnapshot.id,
      ...itemSnapshot.data(),
    });
    if (!current.success) throw new Error('이모티콘 항목 데이터가 손상되었습니다.');
    const report = job.data.specReport;
    if (!report) throw new Error('선택한 결과의 실제 프레임 검사 정보가 없습니다.');
    const manualMotion = job.data.manualImportReport && job.data.plan
      ? job.data.plan.action
      : null;
    const motion = job.data.outputProfile?.type === 'static'
      ? { ...current.data.motion, fps: 1, frameCount: 1, durationMs: 0 }
      : {
        ...current.data.motion,
        fps: manualMotion?.fps ?? report.fps,
        frameCount: manualMotion?.frameCount ?? report.frameCount,
        durationMs: manualMotion?.durationMs ?? report.durationMs,
      };
    const parsedMotion = emoticonProjectMotionSchema.safeParse(motion);
    if (!parsedMotion.success) {
      throw new Error('선택한 결과의 실제 프레임 속도와 장수를 프로젝트에 적용할 수 없습니다.');
    }
    const linkedRecipe = job.data.editRecipe || createIdentityEmoticonImageEditRecipe();
    const existingHistory = current.data.editHistory.filter((entry) => entry.resultJobId !== job.data.id);
    const editHistory = linkedRecipe.revision > 0
      ? [...existingHistory, {
        recipe: linkedRecipe,
        sourceJobId: job.data.parentJobId || job.data.id,
        resultJobId: job.data.id,
      }].slice(-20)
      : existingHistory;
    transaction.update(itemRef, {
      jobId: job.data.id,
      generationStatus: 'completed',
      validationErrors: [],
      motion: parsedMotion.data,
      editRecipe: linkedRecipe,
      editHistory,
      revision: current.data.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
}

async function migrateLegacyProjectItems(params: {
  userId: string;
  projectId: string;
  projectRevision: number;
  items: EmoticonProjectItem[];
}): Promise<void> {
  if (!params.items.length) return;
  const projectRef = projectDocument(params.userId, params.projectId);
  const itemRefs = params.items.map((item) => (
    projectItemDocument(params.userId, params.projectId, item.id)
  ));
  await runTransaction(db, async (transaction) => {
    const [projectSnapshot, ...itemSnapshots] = await Promise.all([
      transaction.get(projectRef),
      ...itemRefs.map((itemRef) => transaction.get(itemRef)),
    ]);
    if (!projectSnapshot.exists()) return;
    params.items.forEach((item, index) => {
      if (itemSnapshots[index]?.exists()) return;
      transaction.set(itemRefs[index], {
        ...item,
        createdAt: item.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    const currentRevision = typeof projectSnapshot.data().revision === 'number'
      ? projectSnapshot.data().revision as number
      : params.projectRevision;
    transaction.update(projectRef, {
      schemaVersion: 2,
      revision: currentRevision + 1,
      items: deleteField(),
      migratedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export function subscribeEmoticonProjectItems(params: {
  userId: string;
  projectId: string;
  emoticonType: EmoticonProjectType;
  legacyItems?: EmoticonProjectItem[];
  projectRevision?: number;
  onChange: (items: EmoticonProjectItem[]) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  let migrationStarted = false;
  return onSnapshot(
    query(projectItemsCollection(params.userId, params.projectId), orderBy('order', 'asc')),
    (snapshot) => {
      if (snapshot.empty && params.legacyItems?.length) {
        params.onChange(params.legacyItems);
        if (!migrationStarted) {
          migrationStarted = true;
          void migrateLegacyProjectItems({
            userId: params.userId,
            projectId: params.projectId,
            projectRevision: params.projectRevision || 0,
            items: params.legacyItems,
          }).catch((error) => params.onError?.(error instanceof Error ? error : new Error(String(error))));
        }
        return;
      }
      const items = snapshot.docs
        .map((item, index) => normalizeLegacyItem(
          { id: item.id, ...item.data() },
          index,
          params.emoticonType,
        ))
        .filter((item): item is EmoticonProjectItem => Boolean(item));
      params.onChange(items);
    },
    (error) => params.onError?.(error),
  );
}

export async function duplicateEmoticonProject(params: {
  userId: string;
  project: EmoticonProject;
  overrides?: {
    title?: string;
    character?: Partial<EmoticonProject['character']>;
    items?: EmoticonProjectItem[];
    status?: EmoticonProject['status'];
  };
}): Promise<string> {
  const projectId = crypto.randomUUID();
  const sourceItems = params.overrides?.items || params.project.items;
  const items = sourceItems.map((item, index) => ({
    ...item,
    id: crypto.randomUUID(),
    revision: 0,
    order: index + 1,
    jobId: null,
    generationStatus: 'planned' as const,
    validationErrors: [],
    editRecipe: createIdentityEmoticonImageEditRecipe(),
    editHistory: [],
  }));
  if (!items.length || items.length > 64 || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error('복제할 프로젝트 항목 구성을 확인해 주세요.');
  }
  items.forEach((item) => emoticonProjectItemSchema.parse(item));
  const duplicatedCharacter = {
    name: params.project.character.name,
    description: params.project.character.description,
    visualStyle: params.project.character.visualStyle,
    references: params.project.character.references,
    identityPrompt: params.project.character.identityPrompt,
    negativePrompt: params.project.character.negativePrompt,
    ...(params.project.character.profile ? { profile: params.project.character.profile } : {}),
    ...(params.project.character.profileJobId
      ? { profileJobId: params.project.character.profileJobId }
      : {}),
    ...(params.project.character.identityFingerprint
      ? { identityFingerprint: params.project.character.identityFingerprint }
      : {}),
    ...params.overrides?.character,
  };
  const projectWithoutItems = {
    schemaVersion: params.project.schemaVersion,
    revision: 0,
    userId: params.userId,
    title: (params.overrides?.title?.trim() || `${params.project.title} 복사본`).slice(0, 100),
    description: params.project.description,
    platform: params.project.platform,
    emoticonType: params.project.emoticonType,
    itemCount: items.length,
    character: duplicatedCharacter,
    generationSettings: params.project.generationSettings,
    spec: params.project.spec,
    status: params.overrides?.status || 'draft',
  } as const;
  const batch = writeBatch(db);
  batch.set(projectDocument(params.userId, projectId), {
    ...projectWithoutItems,
    id: projectId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  items.forEach((item) => {
    batch.set(projectItemDocument(params.userId, projectId, item.id), {
      ...item,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return projectId;
}

export function createPortableEmoticonProject(
  project: EmoticonProject,
): EmoticonProjectPortable {
  return emoticonProjectPortableSchema.parse({
    format: EMOTICON_PROJECT_PORTABLE_FORMAT,
    version: EMOTICON_PROJECT_PORTABLE_VERSION,
    title: project.title,
    description: project.description,
    platform: project.platform,
    emoticonType: project.emoticonType,
    itemCount: project.items.length,
    character: {
      name: project.character.name,
      description: project.character.description,
      visualStyle: project.character.visualStyle,
      identityPrompt: project.character.identityPrompt,
      negativePrompt: project.character.negativePrompt,
    },
    generationSettings: project.generationSettings,
    items: project.items.map((item) => ({
      title: item.title,
      emotion: item.emotion,
      action: item.action,
      motion: item.motion,
      bubble: item.bubble,
      bubbleLayers: item.bubbleLayers,
      instruction: item.instruction,
      negativePrompt: item.negativePrompt,
    })),
  });
}

function parsePortableOrLegacyProject(value: unknown): EmoticonProjectPortable {
  const portable = emoticonProjectPortableSchema.safeParse(value);
  if (portable.success) return portable.data;

  const legacy = emoticonProjectSchema.safeParse(value);
  if (legacy.success && legacy.data.items.length) {
    return createPortableEmoticonProject(legacy.data);
  }
  const issue = isRecord(value) && value.format === EMOTICON_PROJECT_PORTABLE_FORMAT
    ? portable.error.issues[0]
    : legacy.success
      ? { path: ['items'], message: '불러올 항목이 없습니다.' }
      : legacy.error.issues[0] || portable.error.issues[0];
  const location = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  throw new Error(`프로젝트 JSON 형식이 올바르지 않습니다${location}: ${issue?.message || '필수 값을 확인해 주세요.'}`);
}

/**
 * Imports portable v1 JSON or the previous full-project export as a new,
 * sanitized project. No identity, job state, error, timestamp, URL, or Storage
 * field from the file is ever copied into the new owner namespace.
 */
export async function importEmoticonProject(params: {
  userId: string;
  value: unknown;
}): Promise<string> {
  const imported = parsePortableOrLegacyProject(params.value);

  const projectId = crypto.randomUUID();
  const profile = getEmoticonPlatformProfile(
    imported.platform,
    imported.emoticonType,
  );
  const allowedFormats = imported.generationSettings.formats
    .filter((format) => profile.allowedFormats.includes(format));
  const formats = allowedFormats.length ? allowedFormats : [profile.preferredFormat];
  const preferredFormat = formats.includes(imported.generationSettings.preferredFormat)
    ? imported.generationSettings.preferredFormat
    : profile.preferredFormat;
  const items = imported.items.map((item, index) => ({
    ...item,
    id: crypto.randomUUID(),
    revision: 0,
    order: index + 1,
    jobId: null,
    generationStatus: 'planned' as const,
    validationErrors: [],
  }));
  const candidate = emoticonProjectSchema.safeParse({
    schemaVersion: 2,
    id: projectId,
    userId: params.userId,
    revision: 0,
    title: `${imported.title} · 불러온 복사본`.slice(0, 100),
    description: imported.description,
    platform: imported.platform,
    emoticonType: imported.emoticonType,
    itemCount: items.length,
    character: {
      ...imported.character,
      references: [],
    },
    generationSettings: {
      ...imported.generationSettings,
      resourceMode: imported.generationSettings.resourceMode,
      formats,
      preferredFormat,
    },
    spec: {
      canvasWidth: profile.width,
      canvasHeight: profile.height,
      transparentBackground: true,
      recommendedItemCount: profile.recommendedItemCount,
      profileVersion: profile.profileVersion,
      profileVerification: profile.verification,
      ...(profile.sourceUrl ? { sourceUrl: profile.sourceUrl } : {}),
      ...(profile.checkedAt ? { checkedAt: profile.checkedAt } : {}),
    },
    items,
    status: 'draft',
  });
  if (!candidate.success) {
    const issue = candidate.error.issues[0];
    throw new Error(issue?.message || '불러온 프로젝트를 안전한 새 프로젝트로 변환하지 못했습니다.');
  }

  const ref = projectDocument(params.userId, projectId);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) {
      throw new Error('새 프로젝트 ID가 이미 사용 중입니다. 다시 불러와 주세요.');
    }
    const { items: importedItems, createdAt: _createdAt, updatedAt: _updatedAt, ...project } = candidate.data;
    transaction.set(ref, {
      ...project,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    importedItems.forEach((item) => {
      const { createdAt: _itemCreatedAt, updatedAt: _itemUpdatedAt, ...portableItem } = item;
      transaction.set(projectItemDocument(params.userId, projectId, item.id), {
        ...portableItem,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });
  return projectId;
}

export function subscribeEmoticonProjects(params: {
  userId: string;
  onChange: (projects: EmoticonProject[]) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  return onSnapshot(
    query(projectCollection(params.userId), orderBy('updatedAt', 'desc'), limit(30)),
    (snapshot) => params.onChange(snapshot.docs
      .map((item) => parseProject(item.id, item.data()))
      .filter((item): item is EmoticonProject => Boolean(item))),
    (error) => params.onError?.(error),
  );
}

export async function createEmoticonProjectItem(params: {
  userId: string;
  projectId: string;
  emoticonType: EmoticonProjectType;
  order: number;
}): Promise<EmoticonProjectItem> {
  const item = defaultItem(params.order, params.emoticonType);
  const projectRef = projectDocument(params.userId, params.projectId);
  const itemRef = projectItemDocument(params.userId, params.projectId, item.id);
  await runTransaction(db, async (transaction) => {
    const [projectSnapshot, itemSnapshot] = await Promise.all([
      transaction.get(projectRef),
      transaction.get(itemRef),
    ]);
    if (!projectSnapshot.exists()) throw new Error('프로젝트를 찾을 수 없습니다.');
    if (itemSnapshot.exists()) throw new Error('같은 항목이 이미 존재합니다.');
    const project = parseProject(projectSnapshot.id, projectSnapshot.data());
    if (!project || project.userId !== params.userId || project.deletionLocked) {
      throw new Error('현재 프로젝트에는 항목을 추가할 수 없습니다.');
    }
    transaction.set(itemRef, {
      ...item,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(projectRef, {
      itemCount: project.itemCount + 1,
      revision: project.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  return item;
}
