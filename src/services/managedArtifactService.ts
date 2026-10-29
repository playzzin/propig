import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import {
  MAX_MANAGED_ARTIFACT_CONTENT_BYTES,
  MAX_MANAGED_ARTIFACT_CONTENT_CHARS,
  MAX_MANAGED_ARTIFACT_IMPORT_COUNT,
  MAX_MANAGED_ARTIFACT_IMPORT_BYTES,
  managedArtifactActorSchema,
  managedArtifactDraftSchema,
  managedArtifactOriginInputSchema,
  managedArtifactSourceSchema,
  storedManagedArtifactContentSchema,
  storedManagedArtifactSchema,
} from '@/schemas/managedArtifactSchema';
import type {
  ManagedArtifact,
  ManagedArtifactActor,
  ManagedArtifactDraft,
  ManagedArtifactImportItem,
  ManagedArtifactImportResult,
  ManagedArtifactOriginInput,
  ManagedArtifactSource,
  ManagedArtifactStatus,
} from '@/types/managedArtifact';

const MANAGED_ARTIFACT_COLLECTION = 'managedArtifacts';
const MANAGED_ARTIFACT_CONTENT_COLLECTION = 'managedArtifactContents';
const MANAGED_ARTIFACT_PATH_COLLECTION = 'managedArtifactPaths';
const WINDOWS_RESERVED_FILE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const WINDOWS_INVALID_PATH_CHARACTERS = /[<>:"|?*]/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
export const MANAGED_ARTIFACT_PAGE_SIZE = 100;

export type ManagedArtifactPage = {
  items: ManagedArtifact[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
};

export type ManagedArtifactServiceErrorCode =
  | 'INVALID_ARTIFACT'
  | 'DUPLICATE_PATH'
  | 'VERSION_CONFLICT'
  | 'INVALID_STATE'
  | 'NOT_FOUND';

export class ManagedArtifactServiceError extends Error {
  constructor(
    readonly code: ManagedArtifactServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ManagedArtifactServiceError';
  }
}

function contentSizeBytes(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

function normalizeActor(actor: ManagedArtifactActor): ManagedArtifactActor {
  const parsed = managedArtifactActorSchema.safeParse(actor);
  if (!parsed.success) {
    throw new ManagedArtifactServiceError('INVALID_ARTIFACT', '관리자 계정 정보가 올바르지 않습니다.');
  }
  return parsed.data;
}

function normalizeSource(source: ManagedArtifactSource): ManagedArtifactSource {
  const parsed = managedArtifactSourceSchema.safeParse(source);
  if (!parsed.success) {
    throw new ManagedArtifactServiceError('INVALID_ARTIFACT', '파일 출처 정보가 올바르지 않습니다.');
  }
  return parsed.data;
}

function normalizeOrigin(origin: ManagedArtifactOriginInput): ManagedArtifactOriginInput {
  const parsed = managedArtifactOriginInputSchema.safeParse({
    ...origin,
    path: normalizeManagedArtifactPath(origin.path),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? '원본 파일 출처 정보가 올바르지 않습니다.';
    throw new ManagedArtifactServiceError('INVALID_ARTIFACT', message);
  }
  return parsed.data;
}

export function normalizeManagedArtifactPath(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');

  if (!normalized || CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new ManagedArtifactServiceError('INVALID_ARTIFACT', '파일 경로를 입력해 주세요.');
  }

  const segments = normalized.split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        WINDOWS_INVALID_PATH_CHARACTERS.test(segment) ||
        WINDOWS_RESERVED_FILE_NAMES.test(segment),
    )
  ) {
    throw new ManagedArtifactServiceError(
      'INVALID_ARTIFACT',
      '경로에는 빈 폴더, 상위 경로(..), 예약 이름 또는 사용할 수 없는 문자를 넣을 수 없습니다.',
    );
  }

  return normalized;
}

export function normalizeManagedArtifactDraft(input: ManagedArtifactDraft): ManagedArtifactDraft {
  const tags = Array.from(
    new Set(input.tags.map((tag) => tag.trim()).filter(Boolean)),
  );
  const candidate = {
    ...input,
    path: normalizeManagedArtifactPath(input.path),
    description: input.description.trim(),
    tags,
  };
  const parsed = managedArtifactDraftSchema.safeParse(candidate);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? '파일 정보가 올바르지 않습니다.';
    throw new ManagedArtifactServiceError('INVALID_ARTIFACT', message);
  }

  const sizeBytes = contentSizeBytes(parsed.data.content);
  if (sizeBytes > MAX_MANAGED_ARTIFACT_CONTENT_BYTES) {
    throw new ManagedArtifactServiceError(
      'INVALID_ARTIFACT',
      `파일 내용은 ${(MAX_MANAGED_ARTIFACT_CONTENT_BYTES / 1024).toLocaleString('ko-KR')}KB 이하여야 합니다.`,
    );
  }

  return parsed.data;
}

function pathKey(path: string): string {
  return path.toLocaleLowerCase('en-US');
}

function pathLockId(key: string): string {
  const bytes = new TextEncoder().encode(key);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pathLockReference(key: string) {
  return doc(db, MANAGED_ARTIFACT_PATH_COLLECTION, pathLockId(key));
}

function artifactContentReference(id: string) {
  return doc(db, MANAGED_ARTIFACT_CONTENT_COLLECTION, id);
}

function lockArtifactId(value: DocumentData | undefined): string | null {
  return typeof value?.artifactId === 'string' && value.artifactId ? value.artifactId : null;
}

function pathLockPayload(artifactId: string, key: string) {
  return {
    artifactId,
    pathKey: key,
    updatedAt: serverTimestamp(),
  };
}

function timestampToIso(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('toDate' in value)) return null;

  const toDate = (value as { toDate?: unknown }).toDate;
  if (typeof toDate !== 'function') return null;

  try {
    const date = toDate.call(value) as Date;
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

function parseLegacyContent(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_MANAGED_ARTIFACT_CONTENT_CHARS ||
    contentSizeBytes(value) > MAX_MANAGED_ARTIFACT_CONTENT_BYTES
  ) {
    throw new ManagedArtifactServiceError('INVALID_ARTIFACT', '파일 본문을 찾을 수 없거나 형식이 올바르지 않습니다.');
  }
  return value;
}

function mapManagedArtifact(snapshot: QueryDocumentSnapshot<DocumentData>): ManagedArtifact | null {
  const parsed = storedManagedArtifactSchema.safeParse(snapshot.data());
  if (!parsed.success) {
    console.warn('[Managed Artifacts] Ignoring invalid document.', snapshot.id, parsed.error.issues);
    return null;
  }

  return {
    id: snapshot.id,
    path: parsed.data.path,
    pathKey: parsed.data.pathKey,
    kind: parsed.data.kind,
    description: parsed.data.description,
    tags: parsed.data.tags,
    content: parsed.data.content ?? '',
    status: parsed.data.status,
    source: parsed.data.source,
    version: parsed.data.version,
    sizeBytes: parsed.data.sizeBytes,
    createdBy: parsed.data.createdBy,
    updatedBy: parsed.data.updatedBy,
    createdAt: timestampToIso(parsed.data.createdAt),
    updatedAt: timestampToIso(parsed.data.updatedAt),
    deletedAt: timestampToIso(parsed.data.deletedAt),
    origin: parsed.data.origin
      ? {
          provider: parsed.data.origin.provider,
          workspaceId: parsed.data.origin.workspaceId,
          projectName: parsed.data.origin.projectName,
          path: parsed.data.origin.path,
          sha256: parsed.data.origin.sha256,
          modifiedAt: parsed.data.origin.modifiedAt,
          importedVersion: parsed.data.origin.importedVersion,
          syncedAt: timestampToIso(parsed.data.origin.syncedAt),
        }
      : undefined,
  };
}

async function assertPathAvailable(path: string, excludedId?: string): Promise<void> {
  const snapshot = await getDocs(
    query(
      collection(db, MANAGED_ARTIFACT_COLLECTION),
      where('pathKey', '==', pathKey(path)),
      limit(2),
    ),
  );
  const duplicate = snapshot.docs.find((item) => item.id !== excludedId);
  if (duplicate) {
    throw new ManagedArtifactServiceError('DUPLICATE_PATH', '같은 경로의 관리 파일이 이미 있습니다.');
  }
}

export async function listManagedArtifactPage(
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
): Promise<ManagedArtifactPage> {
  const artifactCollection = collection(db, MANAGED_ARTIFACT_COLLECTION);
  const pageQuery = cursor
    ? query(
        artifactCollection,
        orderBy('updatedAt', 'desc'),
        startAfter(cursor),
        limit(MANAGED_ARTIFACT_PAGE_SIZE + 1),
      )
    : query(artifactCollection, orderBy('updatedAt', 'desc'), limit(MANAGED_ARTIFACT_PAGE_SIZE + 1));
  const snapshot = await getDocs(pageQuery);
  const hasNextPage = snapshot.docs.length > MANAGED_ARTIFACT_PAGE_SIZE;
  const pageDocuments = snapshot.docs.slice(0, MANAGED_ARTIFACT_PAGE_SIZE);
  const items = pageDocuments
    .map(mapManagedArtifact)
    .filter((item): item is ManagedArtifact => item !== null);

  return {
    items,
    nextCursor: hasNextPage ? (pageDocuments.at(-1) ?? null) : null,
  };
}

export async function findManagedArtifactsByPaths(paths: string[]): Promise<ManagedArtifact[]> {
  const keys = Array.from(new Set(paths.map((path) => pathKey(normalizeManagedArtifactPath(path)))));
  if (keys.length === 0) return [];

  const snapshots = await Promise.all(
    Array.from({ length: Math.ceil(keys.length / 30) }, (_, index) =>
      getDocs(
        query(
          collection(db, MANAGED_ARTIFACT_COLLECTION),
          where('pathKey', 'in', keys.slice(index * 30, index * 30 + 30)),
        ),
      ),
    ),
  );
  return snapshots
    .flatMap((snapshot) => snapshot.docs)
    .map(mapManagedArtifact)
    .filter((item): item is ManagedArtifact => item !== null);
}

export async function getManagedArtifactContent(id: string): Promise<string> {
  const contentSnapshot = await getDoc(artifactContentReference(id));
  if (contentSnapshot.exists()) {
    const parsed = storedManagedArtifactContentSchema.safeParse(contentSnapshot.data());
    if (!parsed.success || contentSizeBytes(parsed.data.content) !== parsed.data.sizeBytes) {
      throw new ManagedArtifactServiceError('INVALID_ARTIFACT', '파일 본문 정보가 올바르지 않습니다.');
    }
    return parsed.data.content;
  }

  // Legacy fallback for documents written before content was split from metadata.
  const metadataSnapshot = await getDoc(doc(db, MANAGED_ARTIFACT_COLLECTION, id));
  if (!metadataSnapshot.exists()) {
    throw new ManagedArtifactServiceError('NOT_FOUND', '파일을 찾을 수 없습니다.');
  }
  return parseLegacyContent(metadataSnapshot.data().content);
}

export async function createManagedArtifact(
  input: ManagedArtifactDraft,
  actor: ManagedArtifactActor,
  source: ManagedArtifactSource = 'created',
): Promise<string> {
  const draft = normalizeManagedArtifactDraft(input);
  const normalizedActor = normalizeActor(actor);
  const normalizedSource = normalizeSource(source);
  await assertPathAvailable(draft.path);

  const reference = doc(collection(db, MANAGED_ARTIFACT_COLLECTION));
  const contentReference = artifactContentReference(reference.id);
  const key = pathKey(draft.path);
  const lockReference = pathLockReference(key);
  await runTransaction(db, async (transaction) => {
    const lockSnapshot = await transaction.get(lockReference);
    if (lockSnapshot.exists()) {
      throw new ManagedArtifactServiceError('DUPLICATE_PATH', '같은 경로의 관리 파일이 이미 있습니다.');
    }

    const timestamp = serverTimestamp();
    const { content, ...metadata } = draft;
    transaction.set(reference, {
      ...metadata,
      pathKey: key,
      status: 'active' satisfies ManagedArtifactStatus,
      source: normalizedSource,
      version: 1,
      sizeBytes: contentSizeBytes(content),
      createdBy: normalizedActor,
      updatedBy: normalizedActor,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.set(contentReference, {
      content,
      sizeBytes: contentSizeBytes(content),
      version: 1,
      updatedAt: timestamp,
    });
    transaction.set(lockReference, pathLockPayload(reference.id, key));
  });

  return reference.id;
}

export async function updateManagedArtifact(
  id: string,
  input: ManagedArtifactDraft,
  expectedVersion: number,
  actor: ManagedArtifactActor,
): Promise<void> {
  const draft = normalizeManagedArtifactDraft(input);
  const normalizedActor = normalizeActor(actor);
  await assertPathAvailable(draft.path, id);
  const reference = doc(db, MANAGED_ARTIFACT_COLLECTION, id);
  const contentReference = artifactContentReference(id);
  const nextKey = pathKey(draft.path);
  const nextLockReference = pathLockReference(nextKey);
  const { content, ...metadata } = draft;

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) {
      throw new ManagedArtifactServiceError('NOT_FOUND', '파일을 찾을 수 없습니다.');
    }

    const version = Number(snapshot.data().version ?? 0);
    if (version !== expectedVersion) {
      throw new ManagedArtifactServiceError(
        'VERSION_CONFLICT',
        '다른 관리자가 먼저 수정했습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.',
      );
    }

    const currentKey = typeof snapshot.data().pathKey === 'string' ? snapshot.data().pathKey : '';
    const currentPath = typeof snapshot.data().path === 'string' ? snapshot.data().path : '';
    if (!currentKey || !currentPath) {
      throw new ManagedArtifactServiceError('INVALID_ARTIFACT', '현재 파일 경로 정보가 올바르지 않습니다.');
    }
    const pathChanged = currentPath !== draft.path;
    const currentLockReference = pathLockReference(currentKey);
    const [nextLockSnapshot, currentLockSnapshot] =
      currentKey === nextKey
        ? [await transaction.get(nextLockReference), null]
        : await Promise.all([
            transaction.get(nextLockReference),
            transaction.get(currentLockReference),
          ]);
    const nextLockOwner = lockArtifactId(nextLockSnapshot.data());
    if (nextLockSnapshot.exists() && nextLockOwner !== id) {
      throw new ManagedArtifactServiceError('DUPLICATE_PATH', '같은 경로의 관리 파일이 이미 있습니다.');
    }
    if (currentLockSnapshot?.exists() && lockArtifactId(currentLockSnapshot.data()) !== id) {
      throw new ManagedArtifactServiceError('VERSION_CONFLICT', '파일 경로 잠금이 변경되었습니다. 목록을 새로고침해 주세요.');
    }

    transaction.update(reference, {
      ...metadata,
      content: deleteField(),
      pathKey: nextKey,
      sizeBytes: contentSizeBytes(content),
      version: version + 1,
      updatedBy: normalizedActor,
      updatedAt: serverTimestamp(),
      ...(pathChanged ? { origin: deleteField() } : {}),
    });
    transaction.set(contentReference, {
      content,
      sizeBytes: contentSizeBytes(content),
      version: version + 1,
      updatedAt: serverTimestamp(),
    });
    transaction.set(nextLockReference, pathLockPayload(id, nextKey));
    if (currentKey !== nextKey && (!currentLockSnapshot?.exists() || lockArtifactId(currentLockSnapshot.data()) === id)) {
      transaction.delete(currentLockReference);
    }
  });
}

async function updateManagedArtifactStatus(
  id: string,
  status: ManagedArtifactStatus,
  expectedVersion: number,
  actor: ManagedArtifactActor,
): Promise<void> {
  const normalizedActor = normalizeActor(actor);
  const reference = doc(db, MANAGED_ARTIFACT_COLLECTION, id);
  const contentReference = artifactContentReference(id);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) {
      throw new ManagedArtifactServiceError('NOT_FOUND', '파일을 찾을 수 없습니다.');
    }

    const version = Number(snapshot.data().version ?? 0);
    if (version !== expectedVersion) {
      throw new ManagedArtifactServiceError(
        'VERSION_CONFLICT',
        '다른 관리자가 먼저 변경했습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.',
      );
    }

    const contentSnapshot = await transaction.get(contentReference);
    const timestamp = serverTimestamp();
    let nextSizeBytes = Number(snapshot.data().sizeBytes ?? 0);
    if (!contentSnapshot.exists()) {
      const legacyContent = parseLegacyContent(snapshot.data().content);
      nextSizeBytes = contentSizeBytes(legacyContent);
      transaction.set(contentReference, {
        content: legacyContent,
        sizeBytes: nextSizeBytes,
        version: version + 1,
        updatedAt: timestamp,
      });
    }

    transaction.update(reference, {
      content: deleteField(),
      status,
      sizeBytes: nextSizeBytes,
      version: version + 1,
      updatedBy: normalizedActor,
      updatedAt: timestamp,
      deletedAt: status === 'trashed' ? timestamp : deleteField(),
    });
  });
}

export async function trashManagedArtifact(
  id: string,
  expectedVersion: number,
  actor: ManagedArtifactActor,
): Promise<void> {
  await updateManagedArtifactStatus(id, 'trashed', expectedVersion, actor);
}

export async function restoreManagedArtifact(
  id: string,
  expectedVersion: number,
  actor: ManagedArtifactActor,
): Promise<void> {
  await updateManagedArtifactStatus(id, 'active', expectedVersion, actor);
}

export async function permanentlyDeleteManagedArtifact(id: string, expectedVersion: number): Promise<void> {
  const reference = doc(db, MANAGED_ARTIFACT_COLLECTION, id);
  const contentReference = artifactContentReference(id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) {
      throw new ManagedArtifactServiceError('NOT_FOUND', '파일을 찾을 수 없습니다.');
    }
    if (Number(snapshot.data().version ?? 0) !== expectedVersion) {
      throw new ManagedArtifactServiceError(
        'VERSION_CONFLICT',
        '다른 관리자가 먼저 변경했습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.',
      );
    }
    if (snapshot.data().status !== 'trashed') {
      throw new ManagedArtifactServiceError('INVALID_STATE', '휴지통에 있는 파일만 완전히 삭제할 수 있습니다.');
    }
    const key = typeof snapshot.data().pathKey === 'string' ? snapshot.data().pathKey : '';
    if (!key) {
      throw new ManagedArtifactServiceError('INVALID_ARTIFACT', '현재 파일 경로 정보가 올바르지 않습니다.');
    }
    const lockReference = pathLockReference(key);
    const lockSnapshot = await transaction.get(lockReference);
    transaction.delete(reference);
    transaction.delete(contentReference);
    if (!lockSnapshot.exists() || lockArtifactId(lockSnapshot.data()) === id) {
      transaction.delete(lockReference);
    }
  });
}

export async function importManagedArtifacts(
  items: ManagedArtifactImportItem[],
  currentItems: ManagedArtifact[],
  actor: ManagedArtifactActor,
): Promise<ManagedArtifactImportResult> {
  const normalizedActor = normalizeActor(actor);
  if (items.length === 0 || items.length > MAX_MANAGED_ARTIFACT_IMPORT_COUNT) {
    throw new ManagedArtifactServiceError(
      'INVALID_ARTIFACT',
      `한 번에 1개부터 ${MAX_MANAGED_ARTIFACT_IMPORT_COUNT}개까지 가져올 수 있습니다.`,
    );
  }

  const normalized = items.map((item) => ({
    source: normalizeSource(item.source),
    draft: normalizeManagedArtifactDraft(item.draft),
    origin: item.origin ? normalizeOrigin(item.origin) : undefined,
  }));
  const totalContentBytes = normalized.reduce(
    (total, item) => total + contentSizeBytes(item.draft.content),
    0,
  );
  if (totalContentBytes > MAX_MANAGED_ARTIFACT_IMPORT_BYTES) {
    throw new ManagedArtifactServiceError(
      'INVALID_ARTIFACT',
      `한 번에 가져오는 파일의 전체 크기는 ${(MAX_MANAGED_ARTIFACT_IMPORT_BYTES / 1024 / 1024).toLocaleString('ko-KR')}MB 이하여야 합니다.`,
    );
  }
  const uniquePaths = new Set(normalized.map((item) => pathKey(item.draft.path)));
  if (uniquePaths.size !== normalized.length) {
    throw new ManagedArtifactServiceError('DUPLICATE_PATH', '가져올 파일 목록에 같은 경로가 중복되어 있습니다.');
  }

  const currentByPath = new Map(currentItems.map((item) => [item.pathKey, item]));
  const plannedItems = normalized.map((item) => {
    const key = pathKey(item.draft.path);
    const existing = currentByPath.get(key);
    const reference = existing
      ? doc(db, MANAGED_ARTIFACT_COLLECTION, existing.id)
      : doc(collection(db, MANAGED_ARTIFACT_COLLECTION));
    return {
      item,
      key,
      existing,
      reference,
      contentReference: artifactContentReference(reference.id),
      lockReference: pathLockReference(key),
    };
  });

  await runTransaction(db, async (transaction) => {
    const existingPlans = plannedItems.filter(
      (plan): plan is typeof plan & { existing: ManagedArtifact } => Boolean(plan.existing),
    );
    const existingSnapshots = await Promise.all(
      existingPlans.map((plan) => transaction.get(plan.reference)),
    );
    const lockSnapshots = await Promise.all(
      plannedItems.map((plan) => transaction.get(plan.lockReference)),
    );

    existingSnapshots.forEach((snapshot, index) => {
      const plan = existingPlans[index];
      if (!snapshot.exists()) {
        throw new ManagedArtifactServiceError('NOT_FOUND', `${plan.item.draft.path} 파일을 찾을 수 없습니다.`);
      }
      if (Number(snapshot.data().version ?? 0) !== plan.existing.version) {
        throw new ManagedArtifactServiceError(
          'VERSION_CONFLICT',
          `${plan.item.draft.path} 파일이 다른 관리자에 의해 변경되었습니다. 목록을 새로고침해 주세요.`,
        );
      }
    });

    lockSnapshots.forEach((snapshot, index) => {
      const plan = plannedItems[index];
      const ownerId = lockArtifactId(snapshot.data());
      if (plan.existing) {
        if (snapshot.exists() && ownerId !== plan.existing.id) {
          throw new ManagedArtifactServiceError('DUPLICATE_PATH', `${plan.item.draft.path} 경로가 다른 파일에서 사용 중입니다.`);
        }
      } else if (snapshot.exists()) {
        throw new ManagedArtifactServiceError('DUPLICATE_PATH', `${plan.item.draft.path} 경로가 이미 사용 중입니다.`);
      }
    });

    const timestamp = serverTimestamp();
    for (const plan of plannedItems) {
      const persistedDraft = plan.existing
        ? {
            ...plan.item.draft,
            kind: plan.existing.kind,
            description: plan.existing.description,
            tags: plan.existing.tags,
          }
        : plan.item.draft;
      const { content, ...metadata } = persistedDraft;
      const nextVersion = plan.existing ? plan.existing.version + 1 : 1;
      const origin = plan.item.origin
        ? {
            ...plan.item.origin,
            importedVersion: nextVersion,
            syncedAt: timestamp,
          }
        : undefined;
      const payload = {
        ...metadata,
        pathKey: plan.key,
        status: 'active' satisfies ManagedArtifactStatus,
        source: plan.item.source,
        sizeBytes: contentSizeBytes(content),
        updatedBy: normalizedActor,
        updatedAt: timestamp,
      };

      if (plan.existing) {
        transaction.update(plan.reference, {
          ...payload,
          content: deleteField(),
          version: nextVersion,
          deletedAt: deleteField(),
          origin: origin ?? deleteField(),
        });
      } else {
        transaction.set(plan.reference, {
          ...payload,
          version: nextVersion,
          createdBy: normalizedActor,
          createdAt: timestamp,
          ...(origin ? { origin } : {}),
        });
      }
      transaction.set(plan.contentReference, {
        content,
        sizeBytes: contentSizeBytes(content),
        version: nextVersion,
        updatedAt: timestamp,
      });
      transaction.set(plan.lockReference, pathLockPayload(plan.reference.id, plan.key));
    }
  });

  return {
    created: plannedItems.filter((plan) => !plan.existing).length,
    updated: plannedItems.filter((plan) => Boolean(plan.existing)).length,
  };
}
