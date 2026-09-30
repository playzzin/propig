import {
  WORKSPACE_ARTIFACT_SYNC_STATES,
  type WorkspaceArtifactCatalogItem,
  type WorkspaceArtifactSyncAssessment,
  type WorkspaceArtifactSyncState,
  type WorkspaceArtifactSyncSummary,
  type WorkspaceManagedArtifact,
} from '@/types/workspaceArtifact';
import { MAX_MANAGED_ARTIFACT_IMPORT_BYTES } from '@/schemas/managedArtifactSchema';
import type { ManagedArtifactImportItem } from '@/types/managedArtifact';

export const WORKSPACE_ARTIFACT_SYNC_CHUNK_SIZE = 20;

function normalizeWorkspacePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/{2,}/g, '/');
}

function pathsMatch(left: string, right: string): boolean {
  return normalizeWorkspacePath(left).toLocaleLowerCase('en-US') ===
    normalizeWorkspacePath(right).toLocaleLowerCase('en-US');
}

export function getWorkspaceArtifactSyncState(
  source: WorkspaceArtifactCatalogItem | null | undefined,
  managed: WorkspaceManagedArtifact | null | undefined,
  workspaceId: string | null | undefined,
): WorkspaceArtifactSyncState {
  if (!managed) return source ? 'new' : 'unlinked';
  if (managed.status === 'trashed') return 'trashed';
  if (!source) return 'unlinked';

  const origin = managed.origin;
  if (
    !origin ||
    origin.provider !== 'local-workspace' ||
    !workspaceId ||
    origin.workspaceId !== workspaceId ||
    !pathsMatch(origin.path, source.path)
  ) {
    return 'unlinked';
  }

  const sourceChanged = source.sha256.toLocaleLowerCase('en-US') !== origin.sha256.toLocaleLowerCase('en-US');
  const managedChanged = managed.version !== origin.importedVersion;

  if (sourceChanged && managedChanged) return 'conflict';
  if (sourceChanged) return 'source_changed';
  if (managedChanged) return 'managed_changed';
  return 'synced';
}

export function assessWorkspaceArtifactSync(
  source: WorkspaceArtifactCatalogItem | null | undefined,
  managed: WorkspaceManagedArtifact | null | undefined,
  workspaceId: string | null | undefined,
): WorkspaceArtifactSyncAssessment {
  const normalizedSource = source ?? null;
  const normalizedManaged = managed ?? null;
  const origin = normalizedManaged?.origin;
  const hasLinkedBaseline = Boolean(
    normalizedSource &&
      origin?.provider === 'local-workspace' &&
      Boolean(workspaceId) &&
      origin.workspaceId === workspaceId &&
      pathsMatch(origin.path, normalizedSource.path),
  );
  const sourceChanged = Boolean(
    hasLinkedBaseline &&
      normalizedSource &&
      origin &&
      normalizedSource.sha256.toLocaleLowerCase('en-US') !== origin.sha256.toLocaleLowerCase('en-US'),
  );
  const managedChanged = Boolean(
    hasLinkedBaseline && normalizedManaged && origin && normalizedManaged.version !== origin.importedVersion,
  );
  const state = getWorkspaceArtifactSyncState(normalizedSource, normalizedManaged, workspaceId);

  return {
    source: normalizedSource,
    managed: normalizedManaged,
    state,
    sourceChanged,
    managedChanged,
    shouldSkip: state === 'synced',
  };
}

/** Returns only actionable rows, skipping source/managed pairs that are identical to their baseline. */
export function skipSyncedWorkspaceArtifacts<T extends { state: WorkspaceArtifactSyncState }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => item.state !== 'synced');
}

/** Splits import work by both Firestore transaction count and the service byte contract. */
export function chunkWorkspaceArtifactSyncItems(
  items: readonly ManagedArtifactImportItem[],
): ManagedArtifactImportItem[][] {
  const chunks: ManagedArtifactImportItem[][] = [];
  let current: ManagedArtifactImportItem[] = [];
  let currentBytes = 0;

  for (const item of items) {
    const itemBytes = new TextEncoder().encode(item.draft.content).byteLength;
    if (itemBytes > MAX_MANAGED_ARTIFACT_IMPORT_BYTES) {
      throw new Error(`${item.draft.path} 파일이 단일 가져오기 용량 제한을 초과합니다.`);
    }
    if (
      current.length > 0 &&
      (current.length >= WORKSPACE_ARTIFACT_SYNC_CHUNK_SIZE ||
        currentBytes + itemBytes > MAX_MANAGED_ARTIFACT_IMPORT_BYTES)
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += itemBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function summarizeWorkspaceArtifactSyncStates(
  items: readonly (WorkspaceArtifactSyncState | { state: WorkspaceArtifactSyncState })[],
): WorkspaceArtifactSyncSummary {
  const summary = Object.fromEntries(
    WORKSPACE_ARTIFACT_SYNC_STATES.map((state) => [state, 0]),
  ) as Record<WorkspaceArtifactSyncState, number>;

  items.forEach((item) => {
    const state = typeof item === 'string' ? item : item.state;
    summary[state] += 1;
  });

  const skipped = summary.synced;
  return {
    ...summary,
    total: items.length,
    actionable: items.length - skipped,
    skipped,
  };
}
