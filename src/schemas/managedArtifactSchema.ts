import { z } from 'zod';

export const MANAGED_ARTIFACT_KINDS = [
  'markdown',
  'guideline',
  'agent',
  'orchestrator',
  'skill',
  'workflow',
  'prompt',
  'config',
  'other',
] as const;

export const MANAGED_ARTIFACT_STATUSES = ['active', 'trashed'] as const;
export const MANAGED_ARTIFACT_SOURCES = ['created', 'imported', 'duplicated'] as const;

export const managedArtifactKindSchema = z.enum(MANAGED_ARTIFACT_KINDS);
export const managedArtifactStatusSchema = z.enum(MANAGED_ARTIFACT_STATUSES);
export const managedArtifactSourceSchema = z.enum(MANAGED_ARTIFACT_SOURCES);

export const MAX_MANAGED_ARTIFACT_PATH_LENGTH = 240;
export const MAX_MANAGED_ARTIFACT_DESCRIPTION_LENGTH = 320;
export const MAX_MANAGED_ARTIFACT_CONTENT_BYTES = 700 * 1024;
// The byte limit is authoritative; this character cap only guards pathological
// inputs before the UTF-8 byte check runs.
export const MAX_MANAGED_ARTIFACT_CONTENT_CHARS = MAX_MANAGED_ARTIFACT_CONTENT_BYTES;
export const MAX_MANAGED_ARTIFACT_IMPORT_BYTES = 6 * 1024 * 1024;
export const MAX_MANAGED_ARTIFACT_TAGS = 8;
export const MAX_MANAGED_ARTIFACT_TAG_LENGTH = 24;
export const MAX_MANAGED_ARTIFACT_IMPORT_COUNT = 20;
export const MAX_MANAGED_ARTIFACT_ORIGIN_PROJECT_NAME_LENGTH = 120;
export const MANAGED_ARTIFACT_WORKSPACE_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const MANAGED_ARTIFACT_SHA256_PATTERN = /^[a-f0-9]{64}$/;

const canonicalIsoTimestampSchema = z.string().refine(
  (value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
  },
  { message: 'Origin modifiedAt must be a canonical ISO timestamp.' },
);

export const managedArtifactOriginInputSchema = z
  .object({
    provider: z.literal('local-workspace'),
    workspaceId: z.string().trim().toLowerCase().regex(MANAGED_ARTIFACT_WORKSPACE_ID_PATTERN),
    projectName: z.string().trim().min(1).max(MAX_MANAGED_ARTIFACT_ORIGIN_PROJECT_NAME_LENGTH),
    path: z.string().trim().min(1).max(MAX_MANAGED_ARTIFACT_PATH_LENGTH),
    sha256: z.string().trim().toLowerCase().regex(MANAGED_ARTIFACT_SHA256_PATTERN),
    modifiedAt: canonicalIsoTimestampSchema.nullable(),
  })
  .strict();

export const managedArtifactActorSchema = z.object({
  uid: z.string().trim().min(1).max(128),
  email: z.string().trim().email().nullable(),
  displayName: z.string().trim().max(120).nullable(),
});

export const managedArtifactDraftSchema = z.object({
  path: z.string().trim().min(1).max(MAX_MANAGED_ARTIFACT_PATH_LENGTH),
  kind: managedArtifactKindSchema,
  description: z.string().trim().max(MAX_MANAGED_ARTIFACT_DESCRIPTION_LENGTH),
  tags: z
    .array(z.string().trim().min(1).max(MAX_MANAGED_ARTIFACT_TAG_LENGTH))
    .max(MAX_MANAGED_ARTIFACT_TAGS),
  content: z.string().max(MAX_MANAGED_ARTIFACT_CONTENT_CHARS),
});

const firestoreTimestampSchema = z.custom<{ toDate: () => Date }>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function',
  { message: 'Firestore timestamp is required.' },
);

export const storedManagedArtifactOriginSchema = managedArtifactOriginInputSchema
  .extend({
    importedVersion: z.number().int().positive(),
    syncedAt: firestoreTimestampSchema,
  })
  .strict();

export const storedManagedArtifactSchema = managedArtifactDraftSchema
  .omit({ content: true })
  .extend({
    pathKey: z.string().min(1).max(MAX_MANAGED_ARTIFACT_PATH_LENGTH),
    status: managedArtifactStatusSchema,
    source: managedArtifactSourceSchema,
    version: z.number().int().positive(),
    sizeBytes: z.number().int().nonnegative().max(MAX_MANAGED_ARTIFACT_CONTENT_BYTES),
    createdBy: managedArtifactActorSchema,
    updatedBy: managedArtifactActorSchema,
    createdAt: firestoreTimestampSchema,
    updatedAt: firestoreTimestampSchema,
    deletedAt: firestoreTimestampSchema.optional(),
    origin: storedManagedArtifactOriginSchema.optional(),
    // Backward-compatible during the metadata/content split. New writes keep
    // content in managedArtifactContents so listing metadata remains light.
    content: z.string().max(MAX_MANAGED_ARTIFACT_CONTENT_CHARS).optional(),
  })
  .superRefine((value, context) => {
    if (value.origin && value.origin.importedVersion > value.version) {
      context.addIssue({
        code: 'custom',
        path: ['origin', 'importedVersion'],
        message: 'Origin importedVersion cannot exceed the artifact version.',
      });
    }
    if (value.status === 'trashed' && !value.deletedAt) {
      context.addIssue({
        code: 'custom',
        path: ['deletedAt'],
        message: 'Trashed artifacts require a deletion timestamp.',
      });
    }
  });

export const storedManagedArtifactContentSchema = z.object({
  content: z.string().max(MAX_MANAGED_ARTIFACT_CONTENT_CHARS),
  sizeBytes: z.number().int().nonnegative().max(MAX_MANAGED_ARTIFACT_CONTENT_BYTES),
  version: z.number().int().positive(),
  updatedAt: firestoreTimestampSchema,
});

export type ManagedArtifactDraftInput = z.infer<typeof managedArtifactDraftSchema>;
export type ManagedArtifactOriginInput = z.infer<typeof managedArtifactOriginInputSchema>;
