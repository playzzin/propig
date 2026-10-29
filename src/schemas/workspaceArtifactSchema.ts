import { z } from 'zod';
import {
  MAX_MANAGED_ARTIFACT_CONTENT_BYTES,
  MAX_MANAGED_ARTIFACT_CONTENT_CHARS,
  MAX_MANAGED_ARTIFACT_PATH_LENGTH,
  MANAGED_ARTIFACT_WORKSPACE_ID_PATTERN,
  managedArtifactKindSchema,
  managedArtifactOriginInputSchema,
} from '@/schemas/managedArtifactSchema';
import {
  WORKSPACE_ARTIFACT_FORMATS,
  WORKSPACE_ARTIFACT_SCOPES,
  WORKSPACE_ARTIFACT_SKIP_REASONS,
  WORKSPACE_ARTIFACT_SYNC_STATES,
} from '@/types/workspaceArtifact';

const MAX_WORKSPACE_NAME_LENGTH = 255;
const MAX_WORKSPACE_TITLE_LENGTH = 320;
const MAX_WORKSPACE_DETAIL_LENGTH = 500;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-z]:\//i;

function normalizeRelativePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/{2,}/g, '/');
}

function isSafeRelativePath(value: string): boolean {
  if (!value || value.startsWith('/') || WINDOWS_ABSOLUTE_PATH_PATTERN.test(value)) return false;
  if (CONTROL_CHARACTER_PATTERN.test(value)) return false;
  return value.split('/').every((segment) => Boolean(segment) && segment !== '.' && segment !== '..');
}

const workspaceRelativePathSchema = z
  .string()
  .max(MAX_MANAGED_ARTIFACT_PATH_LENGTH)
  .transform(normalizeRelativePath)
  .refine(isSafeRelativePath, '프로젝트 루트 안의 올바른 상대 경로가 필요합니다.');

const nullableIsoDateSchema = z.string().datetime().nullable();

export const workspaceArtifactFormatSchema = z.enum(WORKSPACE_ARTIFACT_FORMATS);
export const workspaceArtifactScopeSchema = z.enum(WORKSPACE_ARTIFACT_SCOPES);
export const workspaceArtifactSyncStateSchema = z.enum(WORKSPACE_ARTIFACT_SYNC_STATES);
export const workspaceArtifactSkipReasonSchema = z.enum(WORKSPACE_ARTIFACT_SKIP_REASONS);

export const workspaceArtifactSha256Schema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SHA256_PATTERN, 'SHA-256 값은 64자리 16진수여야 합니다.');

export const workspaceArtifactCatalogItemSchema = z
  .object({
    path: workspaceRelativePathSchema,
    name: z.string().trim().min(1).max(MAX_WORKSPACE_NAME_LENGTH),
    title: z.string().trim().min(1).max(MAX_WORKSPACE_TITLE_LENGTH),
    kind: managedArtifactKindSchema,
    format: workspaceArtifactFormatSchema,
    scope: workspaceArtifactScopeSchema,
    sizeBytes: z.number().int().nonnegative().max(MAX_MANAGED_ARTIFACT_CONTENT_BYTES),
    modifiedAt: nullableIsoDateSchema,
    sha256: workspaceArtifactSha256Schema,
    content: z.string().max(MAX_MANAGED_ARTIFACT_CONTENT_CHARS),
  })
  .strict()
  .superRefine((value, context) => {
    const contentBytes = new TextEncoder().encode(value.content).byteLength;
    if (contentBytes > MAX_MANAGED_ARTIFACT_CONTENT_BYTES) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: `파일 내용은 ${Math.floor(MAX_MANAGED_ARTIFACT_CONTENT_BYTES / 1024)}KB 이하여야 합니다.`,
      });
    }
  });

export const workspaceArtifactSkippedItemSchema = z
  .object({
    path: workspaceRelativePathSchema,
    reason: workspaceArtifactSkipReasonSchema,
    detail: z.string().trim().min(1).max(MAX_WORKSPACE_DETAIL_LENGTH).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .strict();

export const workspaceArtifactCatalogSchema = z
  .object({
    workspaceId: z.string().trim().toLowerCase().regex(MANAGED_ARTIFACT_WORKSPACE_ID_PATTERN),
    rootName: z.string().trim().min(1).max(160),
    packageName: z.string().trim().min(1).max(214),
    scannedAt: z.string().datetime(),
    includeLocalInstructions: z.boolean(),
    items: z.array(workspaceArtifactCatalogItemSchema),
    skipped: z.array(workspaceArtifactSkippedItemSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const seenPaths = new Set<string>();
    value.items.forEach((item, index) => {
      const key = item.path.toLocaleLowerCase('en-US');
      if (seenPaths.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'path'],
          message: '카탈로그에 같은 경로가 중복되어 있습니다.',
        });
      }
      seenPaths.add(key);
    });
  });

export const workspaceArtifactOriginSchema = managedArtifactOriginInputSchema
  .extend({
    importedVersion: z.number().int().positive(),
    syncedAt: nullableIsoDateSchema,
  })
  .strict();

export function parseWorkspaceArtifactCatalog(value: unknown) {
  return workspaceArtifactCatalogSchema.parse(value);
}

export function parseWorkspaceArtifactOrigin(value: unknown) {
  return workspaceArtifactOriginSchema.parse(value);
}
