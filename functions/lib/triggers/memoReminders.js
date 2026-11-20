"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchMemoReminders = exports.setMemoReminder = void 0;
const admin = require("firebase-admin");
const firebase_functions_1 = require("firebase-functions");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("../firestore");
const security_1 = require("../api/security");
const memoReminders_1 = require("../memoReminders");
async function accountIsActive(uid) {
    try {
        return !(await admin.auth().getUser(uid)).disabled;
    }
    catch (error) {
        if (error.code === 'auth/user-not-found')
            return false;
        throw error;
    }
}
exports.setMemoReminder = (0, https_1.onCall)({ region: 'asia-northeast3', timeoutSeconds: 30, memory: '256MiB', maxInstances: 5 }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    const uid = request.auth.uid;
    if (!await accountIsActive(uid))
        throw new https_1.HttpsError('permission-denied', '활성 계정이 필요합니다.');
    const rate = await (0, security_1.enforceUserRateLimit)({ uid, namespace: 'memo-reminders', maxRequests: 30, windowMs: 60000 });
    if (!rate.allowed)
        throw new https_1.HttpsError('resource-exhausted', '알림 설정을 너무 자주 변경했습니다. 잠시 뒤 다시 시도해주세요.');
    return (0, memoReminders_1.saveMemoReminder)(firestore_1.db, uid, request.data);
});
exports.dispatchMemoReminders = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 minutes', timeZone: 'Asia/Seoul', region: 'asia-northeast3',
    timeoutSeconds: 120, memory: '256MiB', maxInstances: 1, retryCount: 2,
}, async () => {
    const now = Date.now();
    const due = await firestore_1.db.collection(memoReminders_1.MEMO_REMINDER_JOBS).where('nextAt', '<=', now).orderBy('nextAt').limit(200).get();
    let delivered = 0;
    for (let index = 0; index < due.docs.length; index += 10) {
        const results = await Promise.allSettled(due.docs.slice(index, index + 10).map(job => (0, memoReminders_1.deliverMemoReminder)(firestore_1.db, job.id, now, accountIsActive)));
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value)
                delivered++;
            if (result.status === 'rejected')
                firebase_functions_1.logger.error('Memo reminder dispatch failed; will retry on next sweep.');
        }
    }
    firebase_functions_1.logger.info('Memo reminder sweep complete.', { scanned: due.size, delivered });
});
//# sourceMappingURL=memoReminders.js.map