import type {
  ManagedArtifact,
  ManagedArtifactKind,
  ManagedArtifactOrigin,
} from '@/types/managedArtifact';

export const WORKSPACE_ARTIFACT_FORMATS = [
  'markdown',
  'typescript',
  'javascript',
  'json',
  'yaml',
  'toml',
  'text',
] as const;

export const WORKSPACE_ARTIFACT_SCOPES = [
  'cloud-runtime',
  'web-library',
  'project-doc',
  'local-tooling',
] as const;

export const WORKSPACE_ARTIFACT_SYNC_STATES = [
  'new',
  'synced',
  'source_changed',
  'managed_changed',
  'conflict',
  'unlinked',
  'trashed',
] as const;

export const WORKSPACE_ARTIFACT_SKIP_REASONS = [
  'ignored-path',
  'generated-file',
  'sensitive-file',
  'unsupported-format',
  'too-large',
  'invalid-path',
  'unreadable',
  'duplicate-path',
] as const;

export type WorkspaceArtifactFormat = (typeof WORKSPACE_ARTIFACT_FORMATS)[number];
export type WorkspaceArtifactScope = (typeof WORKSPACE_ARTIFACT_SCOPES)[number];
export type WorkspaceArtifactSyncState = (typeof WORKSPACE_ARTIFACT_SYNC_STATES)[number];
export type WorkspaceArtifactSkipReason = (typeof WORKSPACE_ARTIFACT_SKIP_REASONS)[number];

export type WorkspaceArtifactCatalogItem = {
  path: string;
  name: string;
  title: string;
  kind: ManagedArtifactKind;
  format: WorkspaceArtifactFormat;
  scope: WorkspaceArtifactScope;
  sizeBytes: number;
  modifiedAt: string | null;
  sha256: string;
  content: string;
};

export type WorkspaceArtifactSkippedItem = {
  path: string;
  reason: WorkspaceArtifactSkipReason;
  detail?: string;
  sizeBytes?: number;
};

export type WorkspaceArtifactCatalog = {
  workspaceId: string;
  rootName: string;
  packageName: string;
  scannedAt: string;
  includeLocalInstructions: boolean;
  items: WorkspaceArtifactCatalogItem[];
  skipped: WorkspaceArtifactSkippedItem[];
};

/**
 * Stable source baseline captured when a local workspace item is imported.
 * The current source SHA and managed artifact version are compared with this
 * baseline to determine three-way sync state without reading Firestore.
 */
export type WorkspaceArtifactOrigin = ManagedArtifactOrigin;

/** Alias kept at the workspace boundary so sync helpers expose domain-specific names. */
export type WorkspaceManagedArtifact = ManagedArtifact;

export type WorkspaceArtifactSyncAssessment = {
  source: WorkspaceArtifactCatalogItem | null;
  managed: WorkspaceManagedArtifact | null;
  state: WorkspaceArtifactSyncState;
  sourceChanged: boolean;
  managedChanged: boolean;
  shouldSkip: boolean;
};

export type WorkspaceArtifactSyncSummary = Record<WorkspaceArtifactSyncState, number> & {
  total: number;
  actionable: number;
  skipped: number;
};
