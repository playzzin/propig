import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('An isolated Firestore emulator is required.');
const root = process.cwd();
const require = createRequire(path.join(root, 'functions/package.json'));
const clientRequire = createRequire(path.join(root, 'package.json'));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { saveMemoReminder, deliverMemoReminder, nextReminderTime, memoReminderId, ReminderInputSchema } = require('./lib/memoReminders.js');
const projectId = 'demo-propig-memo';
const app = initializeApp({ projectId }, `memo-test-${Date.now()}`);
const db = getFirestore(app, 'pppp');
const now = Date.parse('2026-09-14T10:00:00+09:00');
const uid = `alice-${randomUUID()}`;
const active = async () => true;
const date = value => Date.parse(`${value}+09:00`);
const input = (memoId, overrides = {}) => ({ memoId, remindAt: now + 60000, repeat: 'none', expectedRevision: 0, mutationId: randomUUID(), ...overrides });
const note = async id => db.doc(`users/${uid}/stickyNotes/${id}`).set({ content: '알림 테스트\n개인 본문', isArchived: false });
const job = id => db.doc(`memoReminderJobs/${memoReminderId(uid, id)}`);
try {
  assert.equal(nextReminderTime(date('2026-01-31T10:00:00'), 'monthly', date('2026-01-31T10:01:00'), 31), date('2026-02-28T10:00:00'));
  assert.equal(nextReminderTime(date('2026-02-28T10:00:00'), 'monthly', date('2026-02-28T10:01:00'), 31), date('2026-03-31T10:00:00'));
  assert.equal(nextReminderTime(date('2026-09-18T10:00:00'), 'weekdays', date('2026-09-18T10:01:00'), 18), date('2026-09-21T10:00:00'));
  for (const repeat of ['daily', 'weekly', 'weekdays', 'monthly']) assert.ok(nextReminderTime(now, repeat, now + 400 * 86400000, 14) > now + 400 * 86400000);
  assert.equal(ReminderInputSchema.safeParse({ ...input('../other'), uid: 'other' }).success, false);
  await assert.rejects(saveMemoReminder(db, uid, input('missing'), now), { code: 'failed-precondition' });
  await note('single');
  const first = input('single');
  assert.equal((await saveMemoReminder(db, uid, first, now)).revision, 1);
  assert.equal((await saveMemoReminder(db, uid, first, now + 120000)).revision, 1, 'same mutation is idempotent even after due');
  await assert.rejects(saveMemoReminder(db, uid, input('single'), now), { code: 'aborted' });
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => deliverMemoReminder(db, job('single').id, now + 120000, active)));
  assert.equal(concurrent.filter(Boolean).length, 1);
  assert.equal((await db.collection(`users/${uid}/memoNotifications`).get()).size, 1);
  assert.equal((await job('single').get()).data().status, 'sent');
  await note('cancel'); await saveMemoReminder(db, uid, input('cancel'), now);
  await saveMemoReminder(db, uid, input('cancel', { remindAt: null, expectedRevision: 1 }), now);
  assert.equal(await deliverMemoReminder(db, job('cancel').id, now + 120000, active), false);
  await note('deleted'); await saveMemoReminder(db, uid, input('deleted'), now);
  await db.doc(`users/${uid}/stickyNotes/deleted`).delete();
  assert.equal(await deliverMemoReminder(db, job('deleted').id, now + 120000, active), false);
  await note('disabled'); await saveMemoReminder(db, uid, input('disabled'), now);
  assert.equal(await deliverMemoReminder(db, job('disabled').id, now + 120000, async () => false), false);
  await note('repeat'); await saveMemoReminder(db, uid, input('repeat', { repeat: 'daily' }), now);
  assert.equal(await deliverMemoReminder(db, job('repeat').id, now + 5 * 86400000, active), true);
  assert.ok((await job('repeat').get()).data().nextAt > now + 5 * 86400000);
  console.log('PASS KST recurrence/month-end/missed runs, input validation, missing memo, revision conflict, duplicate dispatch, cancellation, deleted/disabled, recurring delivery');

  const { initializeApp: clientApp, deleteApp: deleteClientApp } = clientRequire('firebase/app');
  const f = clientRequire('firebase/firestore');
  f.setLogLevel('silent');
  const clients = [];
  const connect = (user, admin = false) => {
    const client = clientApp({ projectId, apiKey: 'demo-only', appId: 'demo' }, randomUUID()); clients.push(client);
    const store = f.getFirestore(client, 'pppp');
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    f.connectFirestoreEmulator(store, host, Number(port), user ? { mockUserToken: { sub: user, admin } } : {});
    return store;
  };
  const owner = connect(uid), stranger = connect('bob'), adminClient = connect('admin', true), guest = connect(null);
  const notification = (await db.collection(`users/${uid}/memoNotifications`).get()).docs[0];
  const notificationPath = notification.ref.path;
  const denied = operation => assert.rejects(operation, error => error.code === 'permission-denied');
  assert.equal((await f.getDoc(f.doc(owner, job('single').path))).exists(), true);
  assert.equal((await f.getDoc(f.doc(owner, `memoReminderJobs/${memoReminderId(uid, 'new')}`))).exists(), false);
  for (const other of [stranger, adminClient, guest]) {
    await denied(f.getDoc(f.doc(other, job('single').path)));
    await denied(f.getDoc(f.doc(other, notificationPath)));
  }
  await f.getDocs(f.query(f.collection(owner, `users/${uid}/memoNotifications`), f.orderBy('createdAt', 'desc'), f.limit(50)));
  await f.updateDoc(f.doc(owner, notificationPath), { readAt: f.serverTimestamp() });
  for (const writer of [owner, adminClient]) {
    await denied(f.setDoc(f.doc(writer, job('single').path), { userId: uid }));
    await denied(f.setDoc(f.doc(writer, `users/${uid}/memoNotifications/forged`), { title: 'forged' }));
    await denied(f.updateDoc(f.doc(writer, notificationPath), { title: 'forged', readAt: f.serverTimestamp() }));
    await denied(f.deleteDoc(f.doc(writer, notificationPath)));
  }
  await denied(f.updateDoc(f.doc(owner, notificationPath), { readAt: null }));
  await f.setDoc(f.doc(owner, `users/${uid}/stickyNotes/normal-edit`), { content: '기존 메모 권한 유지' });
  await Promise.all(clients.map(async client => { await f.terminate(f.getFirestore(client, 'pppp')); await deleteClientApp(client); }));
  console.log('PASS real Firestore rules: owner inbox/job read and server timestamp acknowledgment; anonymous/cross-account/admin forgery denied; existing note edits preserved');
} finally { await db.terminate(); await deleteApp(app); }
