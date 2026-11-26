import { auth, db, ensureFirestorePersistence } from '@/firebase/config';
import {
  deleteField,
  doc,
  FieldPath,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';

export function createHabitWorkspaceRef(uid: string) {
  return doc(db, 'users', uid, 'habitTracker', 'workspace');
}

function assertHabitAccount(uid: string) {
  if (auth.currentUser?.uid !== uid) throw new Error('계정이 변경되어 저장을 중단했습니다.');
}

async function habitWriteRef(uid: string) {
  await ensureFirestorePersistence();
  assertHabitAccount(uid);
  return createHabitWorkspaceRef(uid);
}

export async function saveHabitRecordPatch(
  uid: string,
  dateKey: string,
  habitId: string,
  patch: Record<string, unknown>,
) {
  const ref = await habitWriteRef(uid);
  const fields = Object.entries(patch).flatMap(([key, value]) => [
    new FieldPath('records', dateKey, habitId, key),
    value === undefined ? deleteField() : value,
  ]);

  assertHabitAccount(uid);
  await updateDoc(
    ref,
    new FieldPath('records', dateKey, habitId, 'updatedAt'),
    new Date().toISOString(),
    ...fields,
    'updatedAt',
    serverTimestamp(),
  );
}

export async function deleteHabitRecord(uid: string, dateKey: string, habitId: string) {
  const ref = await habitWriteRef(uid);
  assertHabitAccount(uid);
  await updateDoc(ref, new FieldPath('records', dateKey, habitId), deleteField(), 'updatedAt', serverTimestamp());
}

type WorkspaceFields = Partial<Record<'categories' | 'habits' | 'records', unknown>>;

async function updateHabitWorkspace(uid: string, edit: (data: DocumentData) => WorkspaceFields) {
  const ref = await habitWriteRef(uid);
  await runTransaction(db, async (transaction) => {
    assertHabitAccount(uid);
    const snapshot = await transaction.get(ref);
    assertHabitAccount(uid);
    const data = snapshot.data() ?? {};
    const fields = {
      ...(snapshot.exists() ? {} : { categories: [], habits: [], records: {} }),
      ...edit(data),
      updatedAt: serverTimestamp(),
      version: 1,
      userId: uid,
    };

    transaction.set(ref, fields, { mergeFields: Object.keys(fields) });
  });
}

export function saveHabitWorkspaceFields(uid: string, fields: WorkspaceFields) {
  return updateHabitWorkspace(uid, () => fields);
}

export function deleteHabitWorkspaceEntries(uid: string, target: { categoryId: string } | { habitId: string }) {
  return updateHabitWorkspace(uid, (data) => {
    const habits: { id: string; categoryId: string }[] = Array.isArray(data.habits) ? data.habits : [];
    const removed = new Set(
      'habitId' in target
        ? [target.habitId]
        : habits.filter((habit) => habit?.categoryId === target.categoryId).map((habit) => habit.id),
    );
    const records = Object.fromEntries(
      Object.entries<Record<string, unknown>>(data.records ?? {}).flatMap(([dateKey, dailyRecords]) => {
        const remaining = Object.entries(dailyRecords ?? {}).filter(([habitId]) => !removed.has(habitId));
        return remaining.length ? [[dateKey, Object.fromEntries(remaining)]] : [];
      }),
    );
    return {
      ...('categoryId' in target && {
        categories: (Array.isArray(data.categories) ? data.categories : [])
          .filter((category) => category?.id !== target.categoryId),
      }),
      habits: habits.filter((habit) => !removed.has(habit?.id)),
      records,
    };
  });
}
