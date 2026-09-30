import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../firestore';
import { enforceUserRateLimit } from '../api/security';
import { deliverMemoReminder, MEMO_REMINDER_JOBS, saveMemoReminder } from '../memoReminders';

async function accountIsActive(uid: string) {
  try { return !(await admin.auth().getUser(uid)).disabled; }
  catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') return false;
    throw error;
  }
}

export const setMemoReminder = onCall({ region: 'asia-northeast3', timeoutSeconds: 30, memory: '256MiB', maxInstances: 5 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  const uid = request.auth.uid;
  if (!await accountIsActive(uid)) throw new HttpsError('permission-denied', '활성 계정이 필요합니다.');
  const rate = await enforceUserRateLimit({ uid, namespace: 'memo-reminders', maxRequests: 30, windowMs: 60_000 });
  if (!rate.allowed) throw new HttpsError('resource-exhausted', '알림 설정을 너무 자주 변경했습니다. 잠시 뒤 다시 시도해주세요.');
  return saveMemoReminder(db, uid, request.data);
});

export const dispatchMemoReminders = onSchedule({
  schedule: 'every 1 minutes', timeZone: 'Asia/Seoul', region: 'asia-northeast3',
  timeoutSeconds: 120, memory: '256MiB', maxInstances: 1, retryCount: 2,
}, async () => {
  const now = Date.now();
  const due = await db.collection(MEMO_REMINDER_JOBS).where('nextAt', '<=', now).orderBy('nextAt').limit(200).get();
  let delivered = 0;
  for (let index = 0; index < due.docs.length; index += 10) {
    const results = await Promise.allSettled(due.docs.slice(index, index + 10).map(job => deliverMemoReminder(db, job.id, now, accountIsActive)));
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) delivered++;
      if (result.status === 'rejected') logger.error('Memo reminder dispatch failed; will retry on next sweep.');
    }
  }
  logger.info('Memo reminder sweep complete.', { scanned: due.size, delivered });
});
