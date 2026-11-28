import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createMockUserToken } from '@firebase/util';
import { deleteApp, initializeApp } from 'firebase/app';
import * as firestore from 'firebase/firestore';
import ts from 'typescript';

const emulator = '127.0.0.1:8191';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, emulator, 'An isolated localhost:8191 emulator is required');

const projectId = 'demo-propig-habit';
const databaseId = 'pppp';
const origin = 'http://' + emulator;
const uid = 'habit-store-' + randomUUID();
const otherUid = 'habit-other-' + randomUUID();
const workspacePath = 'users/' + uid + '/habitTracker/workspace';
const today = '2026-11-27';
const yesterday = '2026-11-26';
const timestamp = new Date().toISOString();
const apps = [];
const claimsFor = (sub) => ({ sub, admin: false, role: 'user' });

const storeSource = await readFile(new URL('../src/app/habit-tracker/_lib/habitWorkspaceStore.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(storeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const evaluateStore = new Function('require', 'exports', outputText);

function createClient(accountUid) {
  const app = initializeApp({ projectId, apiKey: 'demo-key', appId: 'demo-app' }, randomUUID());
  const db = firestore.getFirestore(app, databaseId);
  apps.push({ app, db });
  firestore.connectFirestoreEmulator(db, '127.0.0.1', 8191, { mockUserToken: claimsFor(accountUid) });
  return db;
}

function createWebWriter(db, auth, ensureFirestorePersistence) {
  const exports = {};
  evaluateStore((name) => {
    if (name === 'firebase/firestore') return firestore;
    assert.equal(name, '@/firebase/config');
    return { db, auth, ensureFirestorePersistence };
  }, exports);
  return exports;
}

async function windowsRequest(accountUid, options) {
  const url = new URL('/v1/projects/' + projectId + '/databases/' + databaseId + '/documents/' + workspacePath, origin);
  const headers = { Authorization: 'Bearer ' + createMockUserToken(claimsFor(accountUid), projectId) };
  if (!options) return fetch(url, { headers, signal: AbortSignal.timeout(10000) });

  const { checked, day = today } = options;
  // Firestore REST paths quote the date and the dotted habit ID as literal map keys.
  const recordMask = ['records', charQuoted(day), charQuoted('windows.walk')].join('.');
  for (const field of [recordMask + '.checked', recordMask + '.updatedAt']) {
    url.searchParams.append('updateMask.fieldPaths', field);
  }
  url.searchParams.set('currentDocument.exists', 'true');
  const map = (fields) => ({ mapValue: { fields } });
  const fields = {
    records: map({ [day]: map({ 'windows.walk': map({
      checked: { booleanValue: checked },
      updatedAt: { stringValue: timestamp },
    }) }) }),
  };
  return fetch(url, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
    signal: AbortSignal.timeout(10000),
  });
}

function charQuoted(value) {
  return String.fromCharCode(96) + value + String.fromCharCode(96);
}

const initialRecords = {
  [today]: {
    web: { checked: false, note: 'keep web note' },
    'android.read': { checked: false, note: 'keep Android note' },
    'windows.walk': { checked: false, note: 'keep Windows note' },
    water: { value: 2 },
  },
  [yesterday]: {
    web: { checked: true, note: 'keep yesterday' },
    'windows.walk': { checked: false, note: 'keep the earlier Windows note' },
  },
};
const workspace = {
  categories: [{ id: 'routine', name: '루틴' }],
  habits: ['web', 'android.read', 'windows.walk'].map((id) => ({ id, mode: 'check' })),
  records: initialRecords,
  viewPreferences: { preserved: 'keep' },
  unrelated: 'keep',
};

try {
  const webDb = createClient(uid);
  const androidDb = createClient(uid);
  const desktopDb = createClient(uid);
  const ref = firestore.doc(webDb, workspacePath);
  const androidRef = firestore.doc(androidDb, workspacePath);
  const desktopRef = firestore.doc(desktopDb, workspacePath);
  const auth = { currentUser: { uid } };
  let releasePersistence;
  let persistence = Promise.resolve();
  const web = createWebWriter(webDb, auth, () => persistence);
  const desktop = createWebWriter(desktopDb, { currentUser: { uid } }, () => Promise.resolve());

  await firestore.setDoc(ref, workspace);
  const [webStart, androidStart, windowsStart] = await Promise.all([
    firestore.getDocFromServer(ref),
    firestore.getDocFromServer(androidRef),
    windowsRequest(uid),
  ]);
  assert.deepEqual(webStart.data().records, initialRecords);
  assert.deepEqual(androidStart.data().records, initialRecords);
  assert.equal(windowsStart.status, 200, await windowsStart.clone().text());
  const windowsData = await windowsStart.json();
  assert.equal(windowsData.fields.records.mapValue.fields[today].mapValue.fields['windows.walk']
    .mapValue.fields.checked.booleanValue, false);

  const [, , windowsSave] = await Promise.all([
    web.saveHabitRecordPatch(uid, today, 'web', { checked: true }),
    firestore.updateDoc(
      androidRef,
      new firestore.FieldPath('records', today, 'android.read', 'checked'), true,
      new firestore.FieldPath('records', today, 'android.read', 'updatedAt'), timestamp,
      'updatedAt', firestore.serverTimestamp(),
    ),
    windowsRequest(uid, { checked: true }),
    web.saveHabitViewPreference(uid, 'statsDefaultPeriod', 'monthly'),
    desktop.saveHabitViewPreference(uid, 'dailyRecordLayout', 'detail'),
  ]);
  assert.equal(windowsSave.status, 200, await windowsSave.clone().text());

  const saved = (await firestore.getDocFromServer(ref)).data();
  for (const habitId of ['web', 'android.read', 'windows.walk']) {
    assert.equal(saved.records[today][habitId].checked, true, habitId + ' check did not survive');
    assert.equal(saved.records[today][habitId].note, initialRecords[today][habitId].note);
  }
  assert.deepEqual(saved.records[today].water, initialRecords[today].water);
  assert.deepEqual(saved.records[yesterday], initialRecords[yesterday]);
  assert.deepEqual(saved.categories, workspace.categories);
  assert.deepEqual(saved.habits, workspace.habits);
  assert.deepEqual(saved.viewPreferences, {
    preserved: 'keep',
    statsDefaultPeriod: 'monthly',
    dailyRecordLayout: 'detail',
  });
  const desktopSaved = (await firestore.getDocFromServer(desktopRef)).data();
  assert.deepEqual(desktopSaved.records, saved.records);
  assert.deepEqual(desktopSaved.viewPreferences, saved.viewPreferences);
  await web.saveHabitViewPreference(uid, 'dailyRecordLayout', 'simple');
  const changedLayout = (await firestore.getDocFromServer(desktopRef)).data();
  assert.deepEqual(changedLayout.viewPreferences, { ...saved.viewPreferences, dailyRecordLayout: 'simple' });
  assert.deepEqual(changedLayout.records, saved.records);
  assert.equal(saved.unrelated, workspace.unrelated);

  const [pastWindowsSave] = await Promise.all([
    windowsRequest(uid, { day: yesterday, checked: true }),
    web.saveHabitRecordPatch(uid, today, 'web', { checked: false }),
  ]);
  assert.equal(pastWindowsSave.status, 200, await pastWindowsSave.clone().text());
  const savedAcrossDays = (await firestore.getDocFromServer(ref)).data();
  assert.deepEqual(savedAcrossDays.records[yesterday]['windows.walk'], {
    checked: true,
    updatedAt: timestamp,
    note: initialRecords[yesterday]['windows.walk'].note,
  });
  assert.deepEqual(savedAcrossDays.records[yesterday].web, initialRecords[yesterday].web);
  assert.equal(savedAcrossDays.records[today].web.checked, false);
  assert.equal(savedAcrossDays.records[today].web.note, initialRecords[today].web.note);
  assert.deepEqual(savedAcrossDays.records[today]['windows.walk'], saved.records[today]['windows.walk']);
  assert.deepEqual(savedAcrossDays.viewPreferences, changedLayout.viewPreferences);

  const foreignSave = await windowsRequest(otherUid, { day: yesterday, checked: false });
  assert.equal(foreignSave.status, 403, await foreignSave.text());

  persistence = new Promise((resolve) => { releasePersistence = resolve; });
  const rejected = [
    assert.rejects(web.saveHabitRecordPatch(uid, today, 'web', { checked: false }), /계정/),
    assert.rejects(web.saveHabitViewPreference(uid, 'dailyRecordLayout', 'simple'), /계정/),
  ];
  auth.currentUser = { uid: otherUid };
  releasePersistence();
  await Promise.all(rejected);
  const unchanged = (await firestore.getDocFromServer(ref)).data();
  assert.deepEqual(unchanged.records, savedAcrossDays.records);
  assert.deepEqual(unchanged.viewPreferences, changedLayout.viewPreferences);

  console.log('PASS Firestore emulator: concurrent today and historical records, widget field masks, account preferences and access boundaries');
} finally {
  await Promise.all(apps.map(async ({ app, db }) => {
    await firestore.terminate(db);
    await deleteApp(app);
  }));
}
