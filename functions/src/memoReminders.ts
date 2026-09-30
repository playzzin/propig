import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

export const MEMO_REMINDER_JOBS = 'memoReminderJobs';
export const REMINDER_REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'] as const;
export type ReminderRepeat = typeof REMINDER_REPEATS[number];
const DAY = 86_400_000;
const KST = 9 * 3_600_000;
export const ReminderInputSchema = z.object({
  memoId: z.string().min(1).max(180).refine(id => !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id)),
  remindAt: z.number().int().nonnegative().max(253402300799999).nullable(),
  repeat: z.enum(REMINDER_REPEATS).default('none'),
  mutationId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();

const JobSchema = z.object({
  userId: z.string().min(1), memoId: z.string().min(1), nextAt: z.number().int().nonnegative(),
  repeat: z.enum(REMINDER_REPEATS), revision: z.number().int().positive(),
  anchorDay: z.number().int().min(1).max(31), status: z.literal('scheduled'),
});
export const memoReminderId = (uid: string, memoId: string) => createHash('sha256').update(`${uid}\0${memoId}`).digest('hex');

export function nextReminderTime(at: number, repeat: ReminderRepeat, now: number, anchorDay: number): number | null {
  if (repeat === 'none') return null;
  if (repeat === 'daily' || repeat === 'weekly') {
    const interval = (repeat === 'weekly' ? 7 : 1) * DAY;
    return at + Math.max(1, Math.floor((now - at) / interval) + 1) * interval;
  }
  if (repeat === 'weekdays') {
    let next = at + Math.max(1, Math.floor((now - at) / DAY)) * DAY;
    while (next <= now || [0, 6].includes(new Date(next + KST).getUTCDay())) next += DAY;
    return next;
  }
  const base = new Date(at + KST);
  const today = new Date(now + KST);
  let month = Math.max(base.getUTCMonth() + 1, (today.getUTCFullYear() - base.getUTCFullYear()) * 12 + today.getUTCMonth());
  let next: number;
  do {
    const last = new Date(Date.UTC(base.getUTCFullYear(), month + 1, 0)).getUTCDate();
    next = Date.UTC(base.getUTCFullYear(), month, Math.min(anchorDay, last), base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds()) - KST;
    month++;
  } while (next <= now);
  return next;
}

export async function saveMemoReminder(db: Firestore, uid: string, input: unknown, now = Date.now()) {
  const parsed = ReminderInputSchema.safeParse(input);
  if (!parsed.success) throw new HttpsError('invalid-argument', '알림 입력값을 확인해주세요.');
  const data = parsed.data;
  let at = data.remindAt;
  if (at !== null && data.repeat === 'weekdays') {
    while ([0, 6].includes(new Date(at + KST).getUTCDay())) at += DAY;
  }
  const ref = db.collection(MEMO_REMINDER_JOBS).doc(memoReminderId(uid, data.memoId));
  return db.runTransaction(async tx => {
    const [previous, memo] = await Promise.all([
      tx.get(ref), tx.get(db.doc(`users/${uid}/stickyNotes/${data.memoId}`)),
    ]);
    const old = previous.data();
    if (old?.mutationId === data.mutationId) return { revision: old.revision as number, nextAt: old.nextAt ?? null, status: old.status as string };
    if (data.remindAt !== null && (data.remindAt <= now || data.remindAt > now + 366 * DAY)) {
      throw new HttpsError('invalid-argument', '현재부터 1년 이내의 미래 시간을 선택해주세요.');
    }
    const revision = Number.isSafeInteger(old?.revision) ? Number(old?.revision) : 0;
    if (revision !== data.expectedRevision) throw new HttpsError('aborted', '다른 기기에서 알림이 변경되었습니다. 최신 설정을 확인해주세요.');
    if (at !== null && !memo.exists) throw new HttpsError('failed-precondition', '메모 저장을 기다린 뒤 다시 시도해주세요.');
    tx.set(ref, {
      userId: uid, memoId: data.memoId, repeat: data.repeat,
      ...(at !== null ? { nextAt: at, anchorDay: new Date(at + KST).getUTCDate() } : {}),
      status: at === null ? 'cancelled' : 'scheduled', revision: revision + 1,
      mutationId: data.mutationId, updatedAt: now, createdAt: old?.createdAt ?? now,
    });
    return { revision: revision + 1, nextAt: at, status: at === null ? 'cancelled' : 'scheduled' };
  });
}

export async function deliverMemoReminder(db: Firestore, jobId: string, now: number, accountIsActive: (uid: string) => Promise<boolean>) {
  const ref = db.collection(MEMO_REMINDER_JOBS).doc(jobId);
  const preliminary = await ref.get();
  const parsed = JobSchema.safeParse(preliminary.data());
  if (!parsed.success || parsed.data.nextAt > now || jobId !== memoReminderId(parsed.data.userId, parsed.data.memoId)) return false;
  const active = await accountIsActive(parsed.data.userId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = JobSchema.safeParse(snap.data());
    if (!current.success || current.data.nextAt > now) return false;
    const job = current.data;
    if (job.userId !== parsed.data.userId || jobId !== memoReminderId(job.userId, job.memoId)) return false;
    const memo = await tx.get(db.doc(`users/${job.userId}/stickyNotes/${job.memoId}`));
    if (!active || !memo.exists || memo.data()?.isArchived === true) {
      tx.update(ref, { status: 'unavailable', nextAt: FieldValue.delete(), updatedAt: now });
      return false;
    }
    const notificationId = `${jobId}-${job.revision}-${job.nextAt}`;
    const notification = db.doc(`users/${job.userId}/memoNotifications/${notificationId}`);
    const existing = await tx.get(notification);
    const title = String(memo.data()?.content ?? '').split(/\r?\n/)[0].trim().slice(0, 120) || '제목 없는 메모';
    if (!existing.exists) tx.create(notification, {
      memoId: job.memoId, title, scheduledAt: job.nextAt, createdAt: now, readAt: null,
    });
    const next = nextReminderTime(job.nextAt, job.repeat, now, job.anchorDay);
    tx.update(ref, { status: next === null ? 'sent' : 'scheduled', nextAt: next === null ? FieldValue.delete() : next, lastDeliveredAt: now, updatedAt: now });
    return !existing.exists;
  });
}
