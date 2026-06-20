import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type QueryDocumentSnapshot,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '@/firebase/config';

export type BucketStatus = 'planned' | 'progress' | 'done';
export type BucketPriority = 'low' | 'medium' | 'high';
export type BucketCategory = string;

export interface BucketCategoryOption {
  id: string;
  label: string;
  color: string;
}

export interface BucketListItem {
  id: string;
  title: string;
  note: string;
  category: BucketCategory;
  status: BucketStatus;
  priority: BucketPriority;
  targetDate: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface BucketListDraft {
  title: string;
  note: string;
  category: BucketCategory;
  priority: BucketPriority;
  targetDate: string;
}

export const DEFAULT_BUCKET_CATEGORIES: Pick<BucketCategoryOption, 'id' | 'label' | 'color'>[] = [
  { id: 'travel', label: '여행', color: '#0284c7' },
  { id: 'growth', label: '성장', color: '#ca8a04' },
  { id: 'career', label: '커리어', color: '#059669' },
  { id: 'relationship', label: '관계', color: '#e11d48' },
  { id: 'wealth', label: '자산', color: '#7c3aed' },
  { id: 'health', label: '건강', color: '#0891b2' },
  { id: 'creative', label: '창작', color: '#ea580c' },
];

const BucketStatusSchema = z.enum(['planned', 'progress', 'done']);
const BucketPrioritySchema = z.enum(['low', 'medium', 'high']);

const BucketListItemSchema = z.object({
  title: z.string(),
  note: z.string().optional(),
  category: z.string().optional(),
  status: BucketStatusSchema.optional(),
  priority: BucketPrioritySchema.optional(),
  targetDate: z.string().optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
  completedAt: z.unknown().optional(),
});

const BucketCategorySchema = z.object({
  label: z.string(),
  color: z.string().optional(),
});

function timestampToIso(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  return new Date().toISOString();
}

function normalizeItemSnapshot(snapshot: QueryDocumentSnapshot): BucketListItem | null {
  const parsed = BucketListItemSchema.safeParse(snapshot.data());
  if (!parsed.success) return null;

  return {
    id: snapshot.id,
    title: parsed.data.title.trim(),
    note: parsed.data.note?.trim() ?? '',
    category: parsed.data.category?.trim() ?? '',
    status: parsed.data.status ?? 'planned',
    priority: parsed.data.priority ?? 'medium',
    targetDate: parsed.data.targetDate ?? '',
    createdAt: timestampToIso(parsed.data.createdAt),
    updatedAt: timestampToIso(parsed.data.updatedAt),
    completedAt: parsed.data.completedAt ? timestampToIso(parsed.data.completedAt) : undefined,
  };
}

function normalizeCategorySnapshot(snapshot: QueryDocumentSnapshot): BucketCategoryOption | null {
  const parsed = BucketCategorySchema.safeParse(snapshot.data());
  if (!parsed.success) return null;

  const label = parsed.data.label.trim();
  if (!label) return null;

  return {
    id: snapshot.id,
    label,
    color: parsed.data.color && /^#[0-9a-fA-F]{6}$/.test(parsed.data.color) ? parsed.data.color : '#22c55e',
  };
}

function bucketListCollection(uid: string) {
  return collection(db, 'users', uid, 'bucketListItems');
}

function bucketListDoc(uid: string, itemId: string) {
  return doc(db, 'users', uid, 'bucketListItems', itemId);
}

function bucketCategoryCollection(uid: string) {
  return collection(db, 'users', uid, 'bucketListCategories');
}

function bucketCategoryDoc(uid: string, categoryId: string) {
  return doc(db, 'users', uid, 'bucketListCategories', categoryId);
}

const FIRESTORE_BATCH_LIMIT = 450;

async function commitBatchOperations<T>(items: T[], applyOperation: (batch: WriteBatch, item: T) => void): Promise<void> {
  for (let index = 0; index < items.length; index += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    items.slice(index, index + FIRESTORE_BATCH_LIMIT).forEach((item) => applyOperation(batch, item));
    await batch.commit();
  }
}

class BucketListService {
  subscribe(uid: string, onData: (items: BucketListItem[]) => void, onError: (error: Error) => void): Unsubscribe {
    return onSnapshot(
      query(bucketListCollection(uid), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const items = snapshot.docs
          .map(normalizeItemSnapshot)
          .filter((item): item is BucketListItem => Boolean(item?.title));
        onData(items);
      },
      (error) => onError(error instanceof Error ? error : new Error(String(error))),
    );
  }

  subscribeCategories(
    uid: string,
    onData: (categories: BucketCategoryOption[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      query(bucketCategoryCollection(uid), orderBy('createdAt', 'asc')),
      (snapshot) => {
        const categories = snapshot.docs
          .map(normalizeCategorySnapshot)
          .filter((category): category is BucketCategoryOption => Boolean(category));
        onData(categories);
      },
      (error) => onError(error instanceof Error ? error : new Error(String(error))),
    );
  }

  async ensureDefaultCategories(uid: string): Promise<void> {
    const snapshot = await getDocs(query(bucketCategoryCollection(uid), orderBy('createdAt', 'asc')));
    if (!snapshot.empty) return;

    const batch = writeBatch(db);
    const categories = bucketCategoryCollection(uid);

    DEFAULT_BUCKET_CATEGORIES.forEach((category) => {
      const ref = doc(categories, category.id);
      batch.set(ref, {
        label: category.label,
        color: category.color,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
  }

  async create(uid: string, draft: BucketListDraft): Promise<void> {
    const title = draft.title.trim();
    const category = draft.category.trim();

    if (!title) {
      throw new Error('버킷리스트 제목을 입력해 주세요.');
    }

    if (!category) {
      throw new Error('분류를 먼저 추가하거나 선택해 주세요.');
    }

    await addDoc(bucketListCollection(uid), {
      title,
      note: draft.note.trim(),
      category,
      priority: draft.priority,
      targetDate: draft.targetDate,
      status: 'planned',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async update(uid: string, itemId: string, patch: Partial<BucketListDraft> & { status?: BucketStatus }): Promise<void> {
    const cleaned = Object.fromEntries(
      Object.entries(patch)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    ) as Partial<BucketListDraft> & { status?: BucketStatus };

    if ('title' in cleaned && !cleaned.title) {
      throw new Error('버킷리스트 제목을 입력해 주세요.');
    }

    const payload: Record<string, unknown> = {
      ...cleaned,
      updatedAt: serverTimestamp(),
    };

    if (cleaned.status) {
      payload.completedAt = cleaned.status === 'done' ? serverTimestamp() : null;
    }

    await updateDoc(bucketListDoc(uid, itemId), payload);
  }

  async remove(uid: string, itemId: string): Promise<void> {
    await deleteDoc(bucketListDoc(uid, itemId));
  }

  async resetItemRecords(uid: string): Promise<void> {
    const snapshot = await getDocs(bucketListCollection(uid));
    await commitBatchOperations(snapshot.docs, (batch, item) => {
      batch.update(item.ref, {
        status: 'planned',
        completedAt: null,
        updatedAt: serverTimestamp(),
      });
    });
  }

  async removeAllItems(uid: string): Promise<void> {
    const snapshot = await getDocs(bucketListCollection(uid));
    await commitBatchOperations(snapshot.docs, (batch, item) => {
      batch.delete(item.ref);
    });
  }

  async createCategory(uid: string, label: string, color: string): Promise<string> {
    const cleanedLabel = label.trim();
    if (!cleanedLabel) {
      throw new Error('분류 이름을 입력해 주세요.');
    }

    const ref = await addDoc(bucketCategoryCollection(uid), {
      label: cleanedLabel,
      color,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateCategory(uid: string, categoryId: string, patch: Pick<BucketCategoryOption, 'label' | 'color'>): Promise<void> {
    const label = patch.label.trim();
    if (!label) {
      throw new Error('분류 이름을 입력해 주세요.');
    }

    await updateDoc(bucketCategoryDoc(uid, categoryId), {
      label,
      color: patch.color,
      updatedAt: serverTimestamp(),
    });
  }

  async removeCategory(uid: string, categoryId: string): Promise<void> {
    await deleteDoc(bucketCategoryDoc(uid, categoryId));
  }

  async resetWorkspace(uid: string): Promise<void> {
    const [itemsSnapshot, categoriesSnapshot] = await Promise.all([
      getDocs(bucketListCollection(uid)),
      getDocs(bucketCategoryCollection(uid)),
    ]);
    const docsToDelete = [...itemsSnapshot.docs, ...categoriesSnapshot.docs];

    await commitBatchOperations(docsToDelete, (batch, item) => {
      batch.delete(item.ref);
    });
    await this.ensureDefaultCategories(uid);
  }
}

export const bucketListService = new BucketListService();
