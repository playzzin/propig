import type {
  MANAGED_ARTIFACT_KINDS,
  MANAGED_ARTIFACT_SOURCES,
  MANAGED_ARTIFACT_STATUSES,
  ManagedArtifactDraftInput,
  ManagedArtifactOriginInput as ManagedArtifactOriginInputSchema,
} from '@/schemas/managedArtifactSchema';

export type ManagedArtifactKind = (typeof MANAGED_ARTIFACT_KINDS)[number];
export type ManagedArtifactStatus = (typeof MANAGED_ARTIFACT_STATUSES)[number];
export type ManagedArtifactSource = (typeof MANAGED_ARTIFACT_SOURCES)[number];

export type ManagedArtifactActor = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

export type ManagedArtifactDraft = ManagedArtifactDraftInput;
export type ManagedArtifactOriginInput = ManagedArtifactOriginInputSchema;

export type ManagedArtifactOrigin = ManagedArtifactOriginInput & {
  importedVersion: number;
  syncedAt: string | null;
};

export type ManagedArtifact = ManagedArtifactDraft & {
  id: string;
  pathKey: string;
  status: ManagedArtifactStatus;
  source: ManagedArtifactSource;
  version: number;
  sizeBytes: number;
  createdBy: ManagedArtifactActor;
  updatedBy: ManagedArtifactActor;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  origin?: ManagedArtifactOrigin;
};

export type ManagedArtifactImportItem = {
  draft: ManagedArtifactDraft;
  source: Extract<ManagedArtifactSource, 'imported'>;
  origin?: ManagedArtifactOriginInput;
};

export type ManagedArtifactImportResult = {
  created: number;
  updated: number;
};
