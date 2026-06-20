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
  type DocumentData,
  type FirestoreDataConverter,
  type PartialWithFieldValue,
  type QueryDocumentSnapshot,
  type SetOptions,
  type SnapshotOptions,
  type Unsubscribe,
  type WithFieldValue,
  type WriteBatch,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '@/firebase/config';

export type TodoRecurrenceMode = 'unscheduled' | 'once' | 'daily' | 'weekly' | 'monthly' | 'dates';

export const TODO_ANYTIME_COMPLETION_KEY = '__anytime__';

export interface TodoRecurrence {
  mode: TodoRecurrenceMode;
  weekdays: number[];
  monthDays: number[];
  dates: string[];
}

export interface TodoCategoryOption {
  id: string;
  label: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodoTask {
  id: string;
  title: string;
  note: string;
  categoryId: string;
  startDate: string;
  time: string;
  recurrence: TodoRecurrence;
  completedDates: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TodoTaskDraft {
  title: string;
  note: string;
  categoryId: string;
  startDate: string;
  time: string;
  recurrenceMode: TodoRecurrenceMode;
  weekdays: number[];
  monthDays: number[];
  dates: string[];
}

interface TodoTaskDocument {
  title: string;
  note: string;
  categoryId: string;
  startDate: string;
  time: string;
  recurrence: TodoRecurrence;
  completedDates: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

interface TodoCategoryDocument {
  label: string;
  color: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export const DEFAULT_TODO_CATEGORIES: Pick<TodoCategoryOption, 'label' | 'color'>[] = [
  { label: '업무', color: '#4ade80' },
  { label: '개인', color: '#f59e0b' },
  { label: '건강', color: '#22d3ee' },
  { label: '학습', color: '#a78bfa' },
  { label: '생활', color: '#fb7185' },
  { label: '프로젝트', color: '#facc15' },
];

const TodoRecurrenceModeSchema = z.enum(['unscheduled', 'once', 'daily', 'weekly', 'monthly', 'dates']);

const TodoRecurrenceSchema = z.object({
  mode: TodoRecurrenceModeSchema.optional(),
  weekdays: z.array(z.number()).optional(),
  monthDays: z.array(z.number()).optional(),
  dates: z.array(z.string()).optional(),
});

const TodoTaskSchema = z.object({
  title: z.string(),
  note: z.string().optional(),
  categoryId: z.string().optional(),
  startDate: z.string(),
  time: z.string().optional(),
  recurrence: TodoRecurrenceSchema.optional(),
  completedDates: z.array(z.string()).optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

const TodoCategorySchema = z.object({
  label: z.string(),
  color: z.string().optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

function todoTaskToFirestore(modelObject: WithFieldValue<TodoTaskDocument>): WithFieldValue<DocumentData>;
function todoTaskToFirestore(
  modelObject: PartialWithFieldValue<TodoTaskDocument>,
  options: SetOptions,
): PartialWithFieldValue<DocumentData>;
function todoTaskToFirestore(
  modelObject: WithFieldValue<TodoTaskDocument> | PartialWithFieldValue<TodoTaskDocument>,
): DocumentData {
  return modelObject as DocumentData;
}

function todoCategoryToFirestore(modelObject: WithFieldValue<TodoCategoryDocument>): WithFieldValue<DocumentData>;
function todoCategoryToFirestore(
  modelObject: PartialWithFieldValue<TodoCategoryDocument>,
  options: SetOptions,
): PartialWithFieldValue<DocumentData>;
function todoCategoryToFirestore(
  modelObject: WithFieldValue<TodoCategoryDocument> | PartialWithFieldValue<TodoCategoryDocument>,
): DocumentData {
  return modelObject as DocumentData;
}

const todoTaskConverter: FirestoreDataConverter<TodoTaskDocument> = {
  toFirestore: todoTaskToFirestore,
  fromFirestore(snapshot, options?: SnapshotOptions): TodoTaskDocument {
    return snapshot.data(options) as TodoTaskDocument;
  },
};

const todoCategoryConverter: FirestoreDataConverter<TodoCategoryDocument> = {
  toFirestore: todoCategoryToFirestore,
  fromFirestore(snapshot, options?: SnapshotOptions): TodoCategoryDocument {
    return snapshot.data(options) as TodoCategoryDocument;
  },
};

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

function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
}

function uniqueSortedCompletionKeys(keys: string[]): string[] {
  return [...new Set(keys.filter((key) => key === TODO_ANYTIME_COMPLETION_KEY || /^\d{4}-\d{2}-\d{2}$/.test(key)))].sort();
}

function sanitizeNumberList(values: number[] | undefined, min: number, max: number): number[] {
  return [...new Set((values ?? []).filter((value) => Number.isInteger(value) && value >= min && value <= max))].sort(
    (a, b) => a - b,
  );
}

function normalizeRecurrence(value: z.infer<typeof TodoRecurrenceSchema> | undefined): TodoRecurrence {
  return {
    mode: value?.mode ?? 'once',
    weekdays: sanitizeNumberList(value?.weekdays, 0, 6),
    monthDays: sanitizeNumberList(value?.monthDays, 1, 31),
    dates: uniqueSortedDates(value?.dates ?? []),
  };
}

function normalizeTaskSnapshot(snapshot: QueryDocumentSnapshot<TodoTaskDocument>): TodoTask | null {
  const parsed = TodoTaskSchema.safeParse(snapshot.data());
  if (!parsed.success) return null;

  const title = parsed.data.title.trim();
  if (!title) return null;

  return {
    id: snapshot.id,
    title,
    note: parsed.data.note?.trim() ?? '',
    categoryId: parsed.data.categoryId?.trim() ?? '',
    startDate: parsed.data.startDate,
    time: parsed.data.time?.trim() ?? '',
    recurrence: normalizeRecurrence(parsed.data.recurrence),
    completedDates: uniqueSortedCompletionKeys(parsed.data.completedDates ?? []),
    createdAt: timestampToIso(parsed.data.createdAt),
    updatedAt: timestampToIso(parsed.data.updatedAt),
  };
}

function normalizeCategorySnapshot(snapshot: QueryDocumentSnapshot<TodoCategoryDocument>): TodoCategoryOption | null {
  const parsed = TodoCategorySchema.safeParse(snapshot.data());
  if (!parsed.success) return null;

  const label = parsed.data.label.trim();
  if (!label) return null;

  return {
    id: snapshot.id,
    label,
    color: parsed.data.color && /^#[0-9a-fA-F]{6}$/.test(parsed.data.color) ? parsed.data.color : '#4ade80',
    createdAt: timestampToIso(parsed.data.createdAt),
    updatedAt: timestampToIso(parsed.data.updatedAt),
  };
}

function todoTaskCollection(uid: string) {
  return collection(db, 'users', uid, 'todoListTasks').withConverter(todoTaskConverter);
}

function todoTaskDoc(uid: string, taskId: string) {
  return doc(db, 'users', uid, 'todoListTasks', taskId).withConverter(todoTaskConverter);
}

function todoCategoryCollection(uid: string) {
  return collection(db, 'users', uid, 'todoListCategories').withConverter(todoCategoryConverter);
}

function todoCategoryDoc(uid: string, categoryId: string) {
  return doc(db, 'users', uid, 'todoListCategories', categoryId).withConverter(todoCategoryConverter);
}

const FIRESTORE_BATCH_LIMIT = 450;

async function commitBatchOperations<T>(items: T[], applyOperation: (batch: WriteBatch, item: T) => void): Promise<void> {
  for (let index = 0; index < items.length; index += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    items.slice(index, index + FIRESTORE_BATCH_LIMIT).forEach((item) => applyOperation(batch, item));
    await batch.commit();
  }
}

function buildRecurrence(draft: TodoTaskDraft): TodoRecurrence {
  if (draft.recurrenceMode === 'unscheduled') {
    return {
      mode: 'unscheduled',
      weekdays: [],
      monthDays: [],
      dates: [],
    };
  }

  const startDate = new Date(`${draft.startDate}T00:00:00`);
  const fallbackWeekday = Number.isNaN(startDate.getTime()) ? 0 : startDate.getDay();
  const fallbackMonthDay = Number.isNaN(startDate.getTime()) ? 1 : startDate.getDate();

  if (draft.recurrenceMode === 'weekly') {
    const weekdays = sanitizeNumberList(draft.weekdays, 0, 6);
    return {
      mode: 'weekly',
      weekdays: weekdays.length > 0 ? weekdays : [fallbackWeekday],
      monthDays: [],
      dates: [],
    };
  }

  if (draft.recurrenceMode === 'monthly') {
    const monthDays = sanitizeNumberList(draft.monthDays, 1, 31);
    return {
      mode: 'monthly',
      weekdays: [],
      monthDays: monthDays.length > 0 ? monthDays : [fallbackMonthDay],
      dates: [],
    };
  }

  if (draft.recurrenceMode === 'dates') {
    return {
      mode: 'dates',
      weekdays: [],
      monthDays: [],
      dates: uniqueSortedDates([...draft.dates, draft.startDate]),
    };
  }

  return {
    mode: draft.recurrenceMode,
    weekdays: [],
    monthDays: [],
    dates: [],
  };
}

function sanitizeDraft(draft: TodoTaskDraft): Omit<TodoTaskDocument, 'createdAt' | 'updatedAt' | 'completedDates'> {
  const title = draft.title.trim();
  const categoryId = draft.categoryId.trim();
  const isUnscheduled = draft.recurrenceMode === 'unscheduled';
  const startDate = isUnscheduled ? '' : draft.startDate.trim();

  if (!title) {
    throw new Error('할일 제목을 입력해 주세요.');
  }

  if (!categoryId) {
    throw new Error('분류를 먼저 추가하거나 선택해 주세요.');
  }

  if (!isUnscheduled && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('날짜를 선택해 주세요.');
  }

  return {
    title,
    note: draft.note.trim(),
    categoryId,
    startDate,
    time: draft.time.trim(),
    recurrence: buildRecurrence({ ...draft, startDate }),
  };
}

class TodoListService {
  subscribeTasks(uid: string, onData: (items: TodoTask[]) => void, onError: (error: Error) => void): Unsubscribe {
    return onSnapshot(
      query(todoTaskCollection(uid), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const items = snapshot.docs
          .map(normalizeTaskSnapshot)
          .filter((item): item is TodoTask => Boolean(item));
        onData(items);
      },
      (error) => onError(error instanceof Error ? error : new Error(String(error))),
    );
  }

  subscribeCategories(
    uid: string,
    onData: (categories: TodoCategoryOption[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      query(todoCategoryCollection(uid), orderBy('createdAt', 'asc')),
      (snapshot) => {
        const categories = snapshot.docs
          .map(normalizeCategorySnapshot)
          .filter((category): category is TodoCategoryOption => Boolean(category));
        onData(categories);
      },
      (error) => onError(error instanceof Error ? error : new Error(String(error))),
    );
  }

  async ensureDefaultCategories(uid: string): Promise<void> {
    const snapshot = await getDocs(query(todoCategoryCollection(uid), orderBy('createdAt', 'asc')));
    if (!snapshot.empty) return;

    const batch = writeBatch(db);
    const categories = todoCategoryCollection(uid);

    DEFAULT_TODO_CATEGORIES.forEach((category) => {
      const ref = doc(categories);
      batch.set(ref, {
        label: category.label,
        color: category.color,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as WithFieldValue<TodoCategoryDocument>);
    });

    await batch.commit();
  }

  async create(uid: string, draft: TodoTaskDraft): Promise<void> {
    const payload = sanitizeDraft(draft);

    await addDoc(todoTaskCollection(uid), {
      ...payload,
      completedDates: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as WithFieldValue<TodoTaskDocument>);
  }

  async update(uid: string, taskId: string, draft: TodoTaskDraft): Promise<void> {
    const payload = sanitizeDraft(draft);

    await updateDoc(todoTaskDoc(uid, taskId), {
      ...payload,
      updatedAt: serverTimestamp(),
    } as Partial<TodoTaskDocument>);
  }

  async setCompletedDates(uid: string, taskId: string, completedDates: string[]): Promise<void> {
    await updateDoc(todoTaskDoc(uid, taskId), {
      completedDates: uniqueSortedCompletionKeys(completedDates),
      updatedAt: serverTimestamp(),
    } as Partial<TodoTaskDocument>);
  }

  async resetCompletionRecords(uid: string): Promise<void> {
    const snapshot = await getDocs(todoTaskCollection(uid));
    await commitBatchOperations(snapshot.docs, (batch, item) => {
      batch.update(item.ref, {
        completedDates: [],
        updatedAt: serverTimestamp(),
      } as Partial<TodoTaskDocument>);
    });
  }

  async remove(uid: string, taskId: string): Promise<void> {
    await deleteDoc(todoTaskDoc(uid, taskId));
  }

  async removeAllTasks(uid: string): Promise<void> {
    const snapshot = await getDocs(todoTaskCollection(uid));
    await commitBatchOperations(snapshot.docs, (batch, item) => {
      batch.delete(item.ref);
    });
  }

  async createCategory(uid: string, label: string, color: string): Promise<string> {
    const cleanedLabel = label.trim();
    if (!cleanedLabel) {
      throw new Error('분류 이름을 입력해 주세요.');
    }

    const ref = await addDoc(todoCategoryCollection(uid), {
      label: cleanedLabel,
      color,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as WithFieldValue<TodoCategoryDocument>);

    return ref.id;
  }

  async updateCategory(uid: string, categoryId: string, patch: Pick<TodoCategoryOption, 'label' | 'color'>): Promise<void> {
    const label = patch.label.trim();
    if (!label) {
      throw new Error('분류 이름을 입력해 주세요.');
    }

    await updateDoc(todoCategoryDoc(uid, categoryId), {
      label,
      color: patch.color,
      updatedAt: serverTimestamp(),
    } as Partial<TodoCategoryDocument>);
  }

  async removeCategory(uid: string, categoryId: string): Promise<void> {
    await deleteDoc(todoCategoryDoc(uid, categoryId));
  }

  async resetWorkspace(uid: string): Promise<void> {
    const [tasksSnapshot, categoriesSnapshot] = await Promise.all([
      getDocs(todoTaskCollection(uid)),
      getDocs(todoCategoryCollection(uid)),
    ]);
    const docsToDelete = [...tasksSnapshot.docs, ...categoriesSnapshot.docs];

    await commitBatchOperations(docsToDelete, (batch, item) => {
      batch.delete(item.ref.withConverter(null));
    });
    await this.ensureDefaultCategories(uid);
  }
}

export const todoListService = new TodoListService();
