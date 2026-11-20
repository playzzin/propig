"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoReminderId = exports.ReminderInputSchema = exports.REMINDER_REPEATS = exports.MEMO_REMINDER_JOBS = void 0;
exports.nextReminderTime = nextReminderTime;
exports.saveMemoReminder = saveMemoReminder;
exports.deliverMemoReminder = deliverMemoReminder;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const zod_1 = require("zod");
exports.MEMO_REMINDER_JOBS = 'memoReminderJobs';
exports.REMINDER_REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
const DAY = 86400000;
const KST = 9 * 3600000;
exports.ReminderInputSchema = zod_1.z.object({
    memoId: zod_1.z.string().min(1).max(180).refine(id => !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id)),
    remindAt: zod_1.z.number().int().nonnegative().max(253402300799999).nullable(),
    repeat: zod_1.z.enum(exports.REMINDER_REPEATS).default('none'),
    mutationId: zod_1.z.string().uuid(),
    expectedRevision: zod_1.z.number().int().nonnegative(),
}).strict();
const JobSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1), memoId: zod_1.z.string().min(1), nextAt: zod_1.z.number().int().nonnegative(),
    repeat: zod_1.z.enum(exports.REMINDER_REPEATS), revision: zod_1.z.number().int().positive(),
    anchorDay: zod_1.z.number().int().min(1).max(31), status: zod_1.z.literal('scheduled'),
});
const memoReminderId = (uid, memoId) => (0, node_crypto_1.createHash)('sha256').update(`${uid}\0${memoId}`).digest('hex');
exports.memoReminderId = memoReminderId;
function nextReminderTime(at, repeat, now, anchorDay) {
    if (repeat === 'none')
        return null;
    if (repeat === 'daily' || repeat === 'weekly') {
        const interval = (repeat === 'weekly' ? 7 : 1) * DAY;
        return at + Math.max(1, Math.floor((now - at) / interval) + 1) * interval;
    }
    if (repeat === 'weekdays') {
        let next = at + Math.max(1, Math.floor((now - at) / DAY)) * DAY;
        while (next <= now || [0, 6].includes(new Date(next + KST).getUTCDay()))
            next += DAY;
        return next;
    }
    const base = new Date(at + KST);
    const today = new Date(now + KST);
    let month = Math.max(base.getUTCMonth() + 1, (today.getUTCFullYear() - base.getUTCFullYear()) * 12 + today.getUTCMonth());
    let next;
    do {
        const last = new Date(Date.UTC(base.getUTCFullYear(), month + 1, 0)).getUTCDate();
        next = Date.UTC(base.getUTCFullYear(), month, Math.min(anchorDay, last), base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds()) - KST;
        month++;
    } while (next <= now);
    return next;
}
async function saveMemoReminder(db, uid, input, now = Date.now()) {
    const parsed = exports.ReminderInputSchema.safeParse(input);
    if (!parsed.success)
        throw new https_1.HttpsError('invalid-argument', '알림 입력값을 확인해주세요.');
    const data = parsed.data;
    let at = data.remindAt;
    if (at !== null && data.repeat === 'weekdays') {
        while ([0, 6].includes(new Date(at + KST).getUTCDay()))
            at += DAY;
    }
    const ref = db.collection(exports.MEMO_REMINDER_JOBS).doc((0, exports.memoReminderId)(uid, data.memoId));
    return db.runTransaction(async (tx) => {
        var _a, _b;
        const [previous, memo] = await Promise.all([
            tx.get(ref), tx.get(db.doc(`users/${uid}/stickyNotes/${data.memoId}`)),
        ]);
        const old = previous.data();
        if ((old === null || old === void 0 ? void 0 : old.mutationId) === data.mutationId)
            return { revision: old.revision, nextAt: (_a = old.nextAt) !== null && _a !== void 0 ? _a : null, status: old.status };
        if (data.remindAt !== null && (data.remindAt <= now || data.remindAt > now + 366 * DAY)) {
            throw new https_1.HttpsError('invalid-argument', '현재부터 1년 이내의 미래 시간을 선택해주세요.');
        }
        const revision = Number.isSafeInteger(old === null || old === void 0 ? void 0 : old.revision) ? Number(old === null || old === void 0 ? void 0 : old.revision) : 0;
        if (revision !== data.expectedRevision)
            throw new https_1.HttpsError('aborted', '다른 기기에서 알림이 변경되었습니다. 최신 설정을 확인해주세요.');
        if (at !== null && !memo.exists)
            throw new https_1.HttpsError('failed-precondition', '메모 저장을 기다린 뒤 다시 시도해주세요.');
        tx.set(ref, Object.assign(Object.assign({ userId: uid, memoId: data.memoId, repeat: data.repeat }, (at !== null ? { nextAt: at, anchorDay: new Date(at + KST).getUTCDate() } : {})), { status: at === null ? 'cancelled' : 'scheduled', revision: revision + 1, mutationId: data.mutationId, updatedAt: now, createdAt: (_b = old === null || old === void 0 ? void 0 : old.createdAt) !== null && _b !== void 0 ? _b : now }));
        return { revision: revision + 1, nextAt: at, status: at === null ? 'cancelled' : 'scheduled' };
    });
}
async function deliverMemoReminder(db, jobId, now, accountIsActive) {
    const ref = db.collection(exports.MEMO_REMINDER_JOBS).doc(jobId);
    const preliminary = await ref.get();
    const parsed = JobSchema.safeParse(preliminary.data());
    if (!parsed.success || parsed.data.nextAt > now || jobId !== (0, exports.memoReminderId)(parsed.data.userId, parsed.data.memoId))
        return false;
    const active = await accountIsActive(parsed.data.userId);
    return db.runTransaction(async (tx) => {
        var _a, _b, _c;
        const snap = await tx.get(ref);
        const current = JobSchema.safeParse(snap.data());
        if (!current.success || current.data.nextAt > now)
            return false;
        const job = current.data;
        if (job.userId !== parsed.data.userId || jobId !== (0, exports.memoReminderId)(job.userId, job.memoId))
            return false;
        const memo = await tx.get(db.doc(`users/${job.userId}/stickyNotes/${job.memoId}`));
        if (!active || !memo.exists || ((_a = memo.data()) === null || _a === void 0 ? void 0 : _a.isArchived) === true) {
            tx.update(ref, { status: 'unavailable', nextAt: firestore_1.FieldValue.delete(), updatedAt: now });
            return false;
        }
        const notificationId = `${jobId}-${job.revision}-${job.nextAt}`;
        const notification = db.doc(`users/${job.userId}/memoNotifications/${notificationId}`);
        const existing = await tx.get(notification);
        const title = String((_c = (_b = memo.data()) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : '').split(/\r?\n/)[0].trim().slice(0, 120) || '제목 없는 메모';
        if (!existing.exists)
            tx.create(notification, {
                memoId: job.memoId, title, scheduledAt: job.nextAt, createdAt: now, readAt: null,
            });
        const next = nextReminderTime(job.nextAt, job.repeat, now, job.anchorDay);
        tx.update(ref, { status: next === null ? 'sent' : 'scheduled', nextAt: next === null ? firestore_1.FieldValue.delete() : next, lastDeliveredAt: now, updatedAt: now });
        return !existing.exists;
    });
}
//# sourceMappingURL=memoReminders.js.map