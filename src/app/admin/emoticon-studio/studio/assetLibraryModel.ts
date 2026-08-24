import type { EmoticonJob } from '@/schemas/emoticonStudio';

export type AssetLibraryReusableFrame = {
  sourceJobId: string;
  imageUrl: string;
  title: string;
  detail: string;
};

export type AssetLibraryEntry = {
  id: string;
  sourceJobId: string;
  imageUrl: string;
  title: string;
  prompt: string;
  model: string | null;
  provider: string | null;
  kind: 'source' | 'result';
  version: 'source' | 'original' | 'edited';
  dimensions: string | null;
  createdAtMs: number;
  reusableFrame: AssetLibraryReusableFrame | null;
};

export type AssetLibraryPreferences = {
  schemaVersion: 1;
  favoriteIds: string[];
  deletedIds: string[];
};

export const EMPTY_ASSET_LIBRARY_PREFERENCES: AssetLibraryPreferences = {
  schemaVersion: 1,
  favoriteIds: [],
  deletedIds: [],
};

function compactText(value: string, fallback: string): string {
  const compacted = value.replace(/\s+/g, ' ').trim();
  return compacted || fallback;
}

function timestampMilliseconds(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (!value || typeof value !== 'object') return 0;
  const timestamp = value as { seconds?: unknown; toMillis?: unknown };
  if (typeof timestamp.toMillis === 'function') {
    try {
      const milliseconds = (timestamp.toMillis as () => unknown)();
      return typeof milliseconds === 'number' && Number.isFinite(milliseconds) ? milliseconds : 0;
    } catch {
      return 0;
    }
  }
  return typeof timestamp.seconds === 'number' && Number.isFinite(timestamp.seconds)
    ? timestamp.seconds * 1000
    : 0;
}

function stableIdentifier(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function resultPreview(job: EmoticonJob): string | null {
  return job.compositedFrames?.[0]?.url
    || job.animationFrames?.[0]?.url
    || job.outputs?.png?.url
    || job.keyPoseUrl
    || null;
}

function generationMetadata(job: EmoticonJob): { model: string | null; provider: string | null } {
  const generatedFrame = job.animationFrames?.find((frame) => frame.generationModel || frame.generationProvider)
    || job.compositedFrames?.find((frame) => frame.generationModel || frame.generationProvider);
  return {
    model: job.keyPoseGeneration?.model
      || job.spriteSheetGeneration?.model
      || generatedFrame?.generationModel
      || job.openRouterLastModel
      || null,
    provider: job.keyPoseGeneration?.provider
      || job.spriteSheetGeneration?.provider
      || generatedFrame?.generationProvider
      || job.openRouterLastProvider
      || null,
  };
}

function canReuseAsStaticFrame(job: EmoticonJob): boolean {
  return job.status === 'completed'
    && job.outputProfile?.type === 'static'
    && job.plan?.action.frameCount === 1
    && job.specReport?.frameCount === 1
    && job.specReport.technicalPass === true
    && job.specReport.allOutputsPass === true
    && Boolean(job.outputs?.png?.url)
    && Boolean(job.keyPoseStoragePath);
}

export function buildAssetLibraryEntries(
  jobs: readonly EmoticonJob[],
  projectId: string,
): AssetLibraryEntry[] {
  const projectJobs = jobs.filter((job) => job.projectId === projectId);
  const sourceEntries = new Map<string, AssetLibraryEntry>();
  const entries: AssetLibraryEntry[] = [];

  projectJobs.forEach((job) => {
    const createdAtMs = timestampMilliseconds(job.createdAt);
    const title = compactText(job.instruction, '이름 없는 이미지');
    const prompt = compactText(job.plan?.action.imagePrompt || job.instruction, '생성 프롬프트 기록 없음');
    const sourceKey = job.sourceStoragePath || job.sourceImageUrl;
    const existingSource = sourceEntries.get(sourceKey);
    if (!existingSource || createdAtMs > existingSource.createdAtMs) {
      sourceEntries.set(sourceKey, {
        id: `source:${stableIdentifier(sourceKey)}`,
        sourceJobId: job.id,
        imageUrl: job.sourceImageUrl,
        title: '업로드 원본',
        prompt: title,
        model: null,
        provider: null,
        kind: 'source',
        version: 'source',
        dimensions: null,
        createdAtMs,
        reusableFrame: null,
      });
    }

    const imageUrl = resultPreview(job);
    if (job.status !== 'completed' || !imageUrl) return;
    const metadata = generationMetadata(job);
    const edited = Boolean(job.parentJobId || job.editRecipe || job.renderOverrides?.editRecipe);
    const dimensions = job.outputProfile
      ? `${job.outputProfile.width}×${job.outputProfile.height}`
      : job.specReport
        ? `${job.specReport.width}×${job.specReport.height}`
        : null;
    const reusableFrame = canReuseAsStaticFrame(job)
      ? {
        sourceJobId: job.id,
        imageUrl,
        title: title.slice(0, 60),
        detail: `규격 통과${dimensions ? ` · ${dimensions}` : ''}`,
      }
      : null;
    entries.push({
      id: `result:${job.id}`,
      sourceJobId: job.id,
      imageUrl,
      title,
      prompt,
      model: metadata.model,
      provider: metadata.provider,
      kind: 'result',
      version: edited ? 'edited' : 'original',
      dimensions,
      createdAtMs,
      reusableFrame,
    });
  });

  return [...entries, ...sourceEntries.values()].sort((left, right) => (
    right.createdAtMs - left.createdAtMs
    || (left.kind === right.kind ? left.id.localeCompare(right.id) : left.kind === 'result' ? -1 : 1)
  ));
}

function safeIdentifierList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((candidate): candidate is string => (
    typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 800
  )))).slice(0, 500);
}

export function parseAssetLibraryPreferences(value: unknown): AssetLibraryPreferences {
  if (!value || typeof value !== 'object') return { ...EMPTY_ASSET_LIBRARY_PREFERENCES };
  const candidate = value as { schemaVersion?: unknown; favoriteIds?: unknown; deletedIds?: unknown };
  if (candidate.schemaVersion !== 1) return { ...EMPTY_ASSET_LIBRARY_PREFERENCES };
  return {
    schemaVersion: 1,
    favoriteIds: safeIdentifierList(candidate.favoriteIds),
    deletedIds: safeIdentifierList(candidate.deletedIds),
  };
}

export function assetLibraryStorageKey(userId: string, projectId: string): string {
  return `propig:emoticon-asset-library:v1:${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}`;
}
