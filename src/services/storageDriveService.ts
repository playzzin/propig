import { db, storage } from '@/firebase/config';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
} from 'firebase/storage';
import { z } from 'zod';

export type StorageDriveItemType = 'folder' | 'file';
export type StorageDriveItemStatus = 'active' | 'trash';

const nullableString = z.string().nullable().default(null);
const nullableNumber = z.number().nullable().default(null);

export const StorageDriveItemSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  type: z.enum(['folder', 'file']),
  parentId: nullableString,
  status: z.enum(['active', 'trash']).default('active'),
  listKey: z.string(),
  ownerStatusKey: z.string(),
  storagePath: nullableString,
  downloadURL: nullableString,
  mimeType: nullableString,
  extension: nullableString,
  sizeBytes: nullableNumber,
  color: nullableString,
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
  uploadedAt: z.unknown().optional(),
});

export type StorageDriveItem = z.infer<typeof StorageDriveItemSchema>;

export interface StorageDriveUploadProgress {
  id: string;
  fileName: string;
  progress: number;
  status: 'queued' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

interface CreateFolderInput {
  ownerId: string;
  parentId: string | null;
  name: string;
}

interface UploadFilesInput {
  ownerId: string;
  parentId: string | null;
  files: File[];
  onProgress?: (progress: StorageDriveUploadProgress) => void;
}

const DRIVE_COLLECTION = 'driveItems';
const ROOT_FOLDER_ID = 'root';
const MAX_PARALLEL_UPLOADS = 3;

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, '')
    .slice(0, 160);
}

function normalizeSearchName(name: string): string {
  return normalizeName(name).toLocaleLowerCase('ko-KR');
}

function sanitizeStorageSegment(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|#%{}[\]^~`]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'file';
}

function getExtension(name: string): string | null {
  const trimmed = name.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return null;
  return trimmed.slice(lastDot + 1).toLocaleLowerCase('en-US');
}

function assertValidOwner(ownerId: string): void {
  if (!ownerId.trim()) {
    throw new Error('Storage owner is required.');
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function buildStorageDriveListKey(
  ownerId: string,
  parentId: string | null,
  status: StorageDriveItemStatus,
): string {
  return `${ownerId}::${parentId ?? ROOT_FOLDER_ID}::${status}`;
}

export function buildStorageDriveOwnerStatusKey(ownerId: string, status: StorageDriveItemStatus): string {
  return `${ownerId}::${status}`;
}

export function formatDriveBytes(bytes: number | null | undefined): string {
  if (!Number.isFinite(bytes ?? 0) || !bytes || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function parseDriveItem(id: string, data: Record<string, unknown>): StorageDriveItem {
  const parsed = StorageDriveItemSchema.safeParse({ id, ...data });

  if (parsed.success) {
    return parsed.data;
  }

  console.warn('[StorageDrive] Invalid item skipped.', { id, issues: parsed.error.issues });
  throw new Error(`Invalid storage item: ${id}`);
}

function safeParseDriveItems(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
): StorageDriveItem[] {
  return docs
    .map((itemDoc) => {
      try {
        return parseDriveItem(itemDoc.id, itemDoc.data());
      } catch {
        return null;
      }
    })
    .filter((item): item is StorageDriveItem => Boolean(item));
}

function buildBaseItemPayload(
  ownerId: string,
  parentId: string | null,
  status: StorageDriveItemStatus,
) {
  return {
    ownerId,
    parentId,
    status,
    listKey: buildStorageDriveListKey(ownerId, parentId, status),
    ownerStatusKey: buildStorageDriveOwnerStatusKey(ownerId, status),
  };
}

function sortDriveItems(items: StorageDriveItem[]): StorageDriveItem[] {
  return [...items].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }

    return a.normalizedName.localeCompare(b.normalizedName, 'ko-KR', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

async function commitBatchChunks(
  items: StorageDriveItem[],
  buildOperation: (batch: WriteBatch, item: StorageDriveItem) => void,
): Promise<void> {
  for (let start = 0; start < items.length; start += 450) {
    const batch = writeBatch(db);
    items.slice(start, start + 450).forEach((item) => buildOperation(batch, item));
    await batch.commit();
  }
}

class StorageDriveService {
  private readonly collectionName = DRIVE_COLLECTION;

  async listChildren(
    ownerId: string,
    parentId: string | null,
    status: StorageDriveItemStatus = 'active',
  ): Promise<StorageDriveItem[]> {
    assertValidOwner(ownerId);

    const snapshot = await getDocs(
      query(
        collection(db, this.collectionName),
        where('listKey', '==', buildStorageDriveListKey(ownerId, parentId, status)),
      ),
    );

    return sortDriveItems(safeParseDriveItems(snapshot.docs));
  }

  async listByStatus(ownerId: string, status: StorageDriveItemStatus): Promise<StorageDriveItem[]> {
    assertValidOwner(ownerId);

    const snapshot = await getDocs(
      query(
        collection(db, this.collectionName),
        where('ownerStatusKey', '==', buildStorageDriveOwnerStatusKey(ownerId, status)),
      ),
    );

    return sortDriveItems(safeParseDriveItems(snapshot.docs));
  }

  async getItem(ownerId: string, itemId: string): Promise<StorageDriveItem | null> {
    assertValidOwner(ownerId);

    const snapshot = await getDoc(doc(db, this.collectionName, itemId));
    if (!snapshot.exists()) return null;

    const item = parseDriveItem(snapshot.id, snapshot.data() as Record<string, unknown>);
    return item.ownerId === ownerId ? item : null;
  }

  async getBreadcrumbs(ownerId: string, parentId: string | null): Promise<StorageDriveItem[]> {
    assertValidOwner(ownerId);
    const ancestors: StorageDriveItem[] = [];
    const visited = new Set<string>();
    let cursor = parentId;

    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const folder = await this.getItem(ownerId, cursor);
      if (!folder || folder.type !== 'folder') break;
      ancestors.unshift(folder);
      cursor = folder.parentId;
    }

    return ancestors;
  }

  async createFolder(input: CreateFolderInput): Promise<StorageDriveItem> {
    assertValidOwner(input.ownerId);

    const name = normalizeName(input.name);
    if (!name) {
      throw new Error('폴더 이름을 입력하세요.');
    }

    const folderRef = doc(collection(db, this.collectionName));
    const payload = {
      ...buildBaseItemPayload(input.ownerId, input.parentId, 'active'),
      name,
      normalizedName: normalizeSearchName(name),
      type: 'folder' as const,
      storagePath: null,
      downloadURL: null,
      mimeType: null,
      extension: null,
      sizeBytes: null,
      color: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      uploadedAt: null,
    };

    await setDoc(folderRef, payload);
    return StorageDriveItemSchema.parse({ id: folderRef.id, ...payload });
  }

  async uploadFiles(input: UploadFilesInput): Promise<StorageDriveItem[]> {
    assertValidOwner(input.ownerId);
    const files = input.files.filter((file) => file.size > 0);

    if (files.length === 0) {
      throw new Error('업로드할 파일이 없습니다.');
    }

    const results: StorageDriveItem[] = [];

    for (let start = 0; start < files.length; start += MAX_PARALLEL_UPLOADS) {
      const chunk = files.slice(start, start + MAX_PARALLEL_UPLOADS);
      const uploaded = await Promise.all(
        chunk.map((file, index) =>
          this.uploadSingleFile({
            file,
            ownerId: input.ownerId,
            parentId: input.parentId,
            orderIndex: start + index,
            onProgress: input.onProgress,
          }),
        ),
      );
      results.push(...uploaded);
    }

    return results;
  }

  private async uploadSingleFile({
    file,
    ownerId,
    parentId,
    orderIndex,
    onProgress,
  }: {
    file: File;
    ownerId: string;
    parentId: string | null;
    orderIndex: number;
    onProgress?: (progress: StorageDriveUploadProgress) => void;
  }): Promise<StorageDriveItem> {
    const itemRef = doc(collection(db, this.collectionName));
    const displayName = normalizeName(file.name) || `file-${orderIndex + 1}`;
    const extension = getExtension(displayName);
    const storageOwner = sanitizeStorageSegment(ownerId);
    const storageFileName = sanitizeStorageSegment(displayName);
    const storagePath = `drive/${storageOwner}/${itemRef.id}/${storageFileName}`;
    const storageRef = ref(storage, storagePath);
    const uploadId = itemRef.id;

    onProgress?.({
      id: uploadId,
      fileName: displayName,
      progress: 0,
      status: 'queued',
    });

    const metadata: UploadMetadata = {
      contentType: file.type || 'application/octet-stream',
      customMetadata: {
        ownerId,
        parentId: parentId ?? ROOT_FOLDER_ID,
        itemId: itemRef.id,
      },
    };

    try {
      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress =
              snapshot.totalBytes > 0
                ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
                : 0;

            onProgress?.({
              id: uploadId,
              fileName: displayName,
              progress,
              status: 'uploading',
            });
          },
          reject,
          () => resolve(),
        );
      });

      onProgress?.({
        id: uploadId,
        fileName: displayName,
        progress: 100,
        status: 'processing',
      });

      const downloadURL = await getDownloadURL(storageRef);
      const payload = {
        ...buildBaseItemPayload(ownerId, parentId, 'active'),
        name: displayName,
        normalizedName: normalizeSearchName(displayName),
        type: 'file' as const,
        storagePath,
        downloadURL,
        mimeType: file.type || 'application/octet-stream',
        extension,
        sizeBytes: file.size,
        color: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        uploadedAt: serverTimestamp(),
      };

      await setDoc(itemRef, payload);

      onProgress?.({
        id: uploadId,
        fileName: displayName,
        progress: 100,
        status: 'complete',
      });

      return StorageDriveItemSchema.parse({ id: itemRef.id, ...payload });
    } catch (error) {
      onProgress?.({
        id: uploadId,
        fileName: displayName,
        progress: 0,
        status: 'error',
        error: toErrorMessage(error),
      });

      await deleteObject(storageRef).catch(() => undefined);
      throw error;
    }
  }

  async renameItem(ownerId: string, itemId: string, name: string): Promise<void> {
    const item = await this.getItem(ownerId, itemId);
    if (!item) throw new Error('파일을 찾을 수 없습니다.');

    const nextName = normalizeName(name);
    if (!nextName) throw new Error('이름을 입력하세요.');

    await updateDoc(doc(db, this.collectionName, itemId), {
      name: nextName,
      normalizedName: normalizeSearchName(nextName),
      updatedAt: serverTimestamp(),
    });
  }

  async moveToTrash(ownerId: string, items: StorageDriveItem[]): Promise<void> {
    const targets = await this.expandWithDescendants(ownerId, items, 'active');

    await commitBatchChunks(targets, (batch, item) => {
      batch.update(doc(db, this.collectionName, item.id), {
        status: 'trash',
        listKey: buildStorageDriveListKey(item.ownerId, item.parentId, 'trash'),
        ownerStatusKey: buildStorageDriveOwnerStatusKey(item.ownerId, 'trash'),
        updatedAt: serverTimestamp(),
      });
    });
  }

  async restoreItems(ownerId: string, items: StorageDriveItem[]): Promise<void> {
    const targets = await this.expandWithDescendants(ownerId, items, 'trash');
    const targetIds = new Set(targets.map((item) => item.id));
    const activeFolders = (await this.listByStatus(ownerId, 'active')).filter((item) => item.type === 'folder');
    const activeFolderIds = new Set(activeFolders.map((item) => item.id));

    await commitBatchChunks(targets, (batch, item) => {
      const parentId =
        item.parentId && (targetIds.has(item.parentId) || activeFolderIds.has(item.parentId))
          ? item.parentId
          : null;

      batch.update(doc(db, this.collectionName, item.id), {
        parentId,
        status: 'active',
        listKey: buildStorageDriveListKey(item.ownerId, parentId, 'active'),
        ownerStatusKey: buildStorageDriveOwnerStatusKey(item.ownerId, 'active'),
        updatedAt: serverTimestamp(),
      });
    });
  }

  async permanentlyDeleteItems(ownerId: string, items: StorageDriveItem[]): Promise<void> {
    const targets = await this.expandWithDescendants(ownerId, items);
    const files = targets.filter((item) => item.type === 'file' && item.storagePath);

    await Promise.allSettled(files.map((item) => deleteObject(ref(storage, item.storagePath!))));

    for (let start = 0; start < targets.length; start += 450) {
      const batch = writeBatch(db);
      targets.slice(start, start + 450).forEach((item) => {
        batch.delete(doc(db, this.collectionName, item.id));
      });
      await batch.commit();
    }
  }

  async deleteItemDocument(ownerId: string, itemId: string): Promise<void> {
    const item = await this.getItem(ownerId, itemId);
    if (!item) return;
    if (item.storagePath) {
      await deleteObject(ref(storage, item.storagePath)).catch(() => undefined);
    }
    await deleteDoc(doc(db, this.collectionName, itemId));
  }

  private async expandWithDescendants(
    ownerId: string,
    items: StorageDriveItem[],
    status?: StorageDriveItemStatus,
  ): Promise<StorageDriveItem[]> {
    const ownItems = items.filter((item) => item.ownerId === ownerId);
    const rootIds = new Set(ownItems.map((item) => item.id));

    if (rootIds.size === 0) {
      return [];
    }

    const sourceItems = status
      ? await this.listByStatus(ownerId, status)
      : [...(await this.listByStatus(ownerId, 'active')), ...(await this.listByStatus(ownerId, 'trash'))];

    const childrenByParent = new Map<string, StorageDriveItem[]>();
    sourceItems.forEach((item) => {
      if (!item.parentId) return;
      const children = childrenByParent.get(item.parentId) ?? [];
      children.push(item);
      childrenByParent.set(item.parentId, children);
    });

    const result = new Map<string, StorageDriveItem>();
    const queue = [...ownItems];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (result.has(current.id)) continue;
      result.set(current.id, current);

      if (current.type === 'folder') {
        queue.push(...(childrenByParent.get(current.id) ?? []));
      }
    }

    return Array.from(result.values());
  }
}

export const storageDriveService = new StorageDriveService();
