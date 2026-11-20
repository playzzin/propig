import { httpsCallable } from 'firebase/functions';
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { z } from 'zod';
import { auth, db } from '@/firebase/config';
import { asiaNortheastFunctions } from '@/firebase/functions';

export const reminderRepeatLabels = { none: '한 번', daily: '매일', weekdays: '평일', weekly: '매주', monthly: '매월' } as const;
export type ReminderRepeat = keyof typeof reminderRepeatLabels;
export const ReminderSchema = z.object({
  userId: z.string(), memoId: z.string(), nextAt: z.number().optional(),
  repeat: z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly']),
  status: z.enum(['scheduled', 'sent', 'cancelled', 'unavailable']), revision: z.number().int(),
});
export type MemoReminder = z.infer<typeof ReminderSchema>;
export const MemoNotificationSchema = z.object({
  memoId: z.string(), title: z.string(), scheduledAt: z.number(), createdAt: z.number(),
  readAt: z.unknown().transform(value => value != null),
});
export type MemoNotification = z.infer<typeof MemoNotificationSchema> & { id: string };

async function jobId(uid: string, memoId: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${uid}\0${memoId}`));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function subscribeMemoReminder(uid: string, memoId: string, next: (value: MemoReminder | null) => void, error: () => void) {
  let cancelled = false;
  let unsubscribe: (() => void) | undefined;
  void jobId(uid, memoId).then(id => {
    if (cancelled || auth.currentUser?.uid !== uid) return;
    unsubscribe = onSnapshot(doc(db, 'memoReminderJobs', id), snapshot => {
      if (cancelled || auth.currentUser?.uid !== uid) return;
      if (!snapshot.exists()) { next(null); return; }
      const parsed = ReminderSchema.safeParse(snapshot.data());
      if (parsed.success && parsed.data.userId === uid && parsed.data.memoId === memoId) next(parsed.data);
      else error();
    }, () => { if (!cancelled && auth.currentUser?.uid === uid) error(); });
  }).catch(() => { if (!cancelled && auth.currentUser?.uid === uid) error(); });
  return () => { cancelled = true; unsubscribe?.(); };
}

export async function saveServerMemoReminder(uid: string, memoId: string, remindAt: number | null, repeat: ReminderRepeat, expectedRevision: number, mutationId: string) {
  if (auth.currentUser?.uid !== uid) throw new Error('계정이 변경되었습니다.');
  const callable = httpsCallable(asiaNortheastFunctions, 'setMemoReminder');
  const response = await callable({ memoId, remindAt, repeat, expectedRevision, mutationId });
  if (auth.currentUser?.uid !== uid) throw new Error('계정이 변경되었습니다.');
  return response.data;
}

export function subscribeMemoNotifications(uid: string, next: (items: MemoNotification[]) => void, error: () => void) {
  return onSnapshot(query(collection(db, 'users', uid, 'memoNotifications'), orderBy('createdAt', 'desc'), limit(50)), snapshot => {
    if (auth.currentUser?.uid !== uid) return;
    next(snapshot.docs.flatMap(item => {
      const parsed = MemoNotificationSchema.safeParse(item.data());
      return parsed.success ? [{ ...parsed.data, id: item.id }] : [];
    }));
  }, () => { if (auth.currentUser?.uid === uid) error(); });
}

export async function readMemoNotification(uid: string, id: string) {
  if (auth.currentUser?.uid !== uid) return;
  await updateDoc(doc(db, 'users', uid, 'memoNotifications', id), { readAt: serverTimestamp() });
}

export async function readAllMemoNotifications(uid: string, items: MemoNotification[]) {
  if (auth.currentUser?.uid !== uid) return;
  const batch = writeBatch(db);
  items.filter(item => !item.readAt).forEach(item => batch.update(doc(db, 'users', uid, 'memoNotifications', item.id), { readAt: serverTimestamp() }));
  await batch.commit();
}
