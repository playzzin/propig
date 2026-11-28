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
import type { StatsPeriod } from '@/components/habits/habitTrackerDateUtils';
export type DailyRecordLayout = 'detail' | 'simple';

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

export interface HabitViewPreferences {
  dailyRecordLayout: DailyRecordLayout;
  statsDefaultPeriod: StatsPeriod;
}

export function readHabitViewPreferences(value: unknown): Partial<HabitViewPreferences> {
  if (!value || typeof value !== 'object') return {};
  const { dailyRecordLayout, statsDefaultPeriod } = value as Record<string, unknown>;
  return {
    ...((dailyRecordLayout === 'detail' || dailyRecordLayout === 'simple') && { dailyRecordLayout }),
    ...((statsDefaultPeriod === 'weekly' || statsDefaultPeriod === 'monthly') && { statsDefaultPeriod }),
  };
}

type WorkspaceFields = Partial<Record<'categories' | 'habits' | 'records', unknown>>;

async function updateHabitWorkspace(
  uid: string,
  edit: (data: DocumentData) => WorkspaceFields & { viewPreferences?: Partial<HabitViewPreferences> },
  preferenceField?: FieldPath,
) {
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

    const mergeFields = Object.keys(fields).filter((field) => field !== 'viewPreferences');
    transaction.set(ref, fields, { mergeFields: preferenceField ? [...mergeFields, preferenceField] : mergeFields });
  });
}

export function saveHabitWorkspaceFields(uid: string, fields: WorkspaceFields) {
  return updateHabitWorkspace(uid, () => fields);
}

export function saveHabitViewPreference<Key extends keyof HabitViewPreferences>(
  uid: string,
  key: Key,
  value: HabitViewPreferences[Key],
) {
  const viewPreferences = readHabitViewPreferences({ [key]: value });
  if (viewPreferences[key] === undefined) throw new Error('올바르지 않은 습관 보기 설정입니다.');
  return updateHabitWorkspace(uid, () => ({ viewPreferences }), new FieldPath('viewPreferences', key));
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
