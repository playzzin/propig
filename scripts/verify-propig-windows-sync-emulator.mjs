import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import * as firestore from 'firebase/firestore';
import ts from 'typescript';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8191', 'Use the isolated Firestore test emulator');
const projectId = 'demo-propig-desktop';
const uid = 'windows-sync-' + randomUUID();
const otherUid = 'other-' + randomUUID();
const clients = [];
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const date = '2026-11-27';
const nextDate = '2026-11-28';
const localStorage = new Map();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = {
  localStorage: {
    getItem: (key) => localStorage.get(key) ?? null,
    setItem: (key, value) => localStorage.set(key, value),
  },
  setTimeout, clearTimeout,
};

function createClient(accountUid) {
  const app = initializeApp({ projectId, apiKey: 'demo-key', appId: 'demo-app' }, randomUUID());
  const db = firestore.getFirestore(app, 'pppp');
  firestore.connectFirestoreEmulator(db, '127.0.0.1', 8191, {
    mockUserToken: { sub: accountUid, admin: false, role: 'user' },
  });
  clients.push({ app, db });
  const auth = { currentUser: { uid: accountUid } };
  const modules = new Map();

  function load(name) {
    if (name === '@/firebase/config') return { db, auth, ensureFirestorePersistence: async () => {} };
    if (name === '@/contexts/AuthContext') return { useAuth: () => ({ currentUser: auth.currentUser }) };
    if (name === 'firebase/firestore') return firestore;
    if (!name.startsWith('@/')) return require(name);

    if (modules.has(name)) return modules.get(name);
    const source = readFileSync(new URL('../src/' + name.slice(2) + '.ts', import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const exports = {};
    modules.set(name, exports);
    const requireFromSource = (dependency) => dependency.startsWith('.')
      ? load('@/' + posix.join(posix.dirname(name.slice(2)), dependency))
      : load(dependency);
    new Function('require', 'exports', outputText)(requireFromSource, exports);
    return exports;
  }

  return { db, auth, load };
}

async function until(observed) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (observed()) return;
    // Flush real React subscriber updates while waiting for a network snapshot.
    await act(async () => delay(50));
  }
  assert.fail('The two live views did not converge');
}

const editableNote = (content, overrides = {}) => ({
  content, x: 120, y: 120, w: 280, h: 240, zIndex: 1,
  color: 'sun', tags: ['keep'], isPinned: true, isArchived: false,
  createdAt: 100, updatedAt: 100, ...overrides,
});

const web = createClient(uid);
const windows = createClient(uid);
const other = createClient(otherUid);
const memoRef = (db, id) => firestore.doc(db, 'users', uid, 'stickyNotes', id);
const taskRef = (db, id) => firestore.doc(db, 'users', uid, 'todoListTasks', id);
const originalMemoIds = ['web-note', 'windows-note', 'untouched-note'];
const originalTaskIds = ['web-task', 'windows-task', 'untouched-task'];
let browserMemoView;
let renderer;
let stopDesktopMemo;
let observedWindowsMemos;
let stopWebTasks;
let stopWindowsTasks;

try {
  await Promise.all(originalMemoIds.map((id) => firestore.setDoc(memoRef(web.db, id), editableNote(id))));
  const webMemos = web.load('@/hooks/useStickyNotes');
  const desktopMemos = windows.load('@/hooks/useStickyNotes');
  function BrowserMemo() {
    browserMemoView = webMemos.useStickyNotes();
    return null;
  }
  await act(async () => { renderer = create(React.createElement(BrowserMemo)); });
  stopDesktopMemo = desktopMemos.subscribeStickyNotes(uid, (notes, fromCache) => {
    if (!fromCache) observedWindowsMemos = notes;
  }, () => assert.fail('Windows memo subscription failed'));
  await until(() => browserMemoView?.notes.length === 3 && observedWindowsMemos?.length === 3);

  const draft = desktopMemos.startStickyNoteText(observedWindowsMemos);
  await act(async () => {
    browserMemoView.updateNote('web-note', { content: '웹에서도 저장' });
    await Promise.all([
      browserMemoView.flushNote('web-note'),
      desktopMemos.saveStickyNoteText(uid, {
        id: 'windows-note', content: '위젯에서도 저장', previousContent: 'windows-note',
      }),
      desktopMemos.saveStickyNoteText(uid, { ...draft, content: '위젯 새 메모' }),
    ]);
  });
  const isSaved = (notes) => (
    notes.some((note) => note.id === 'web-note' && note.content === '웹에서도 저장')
    && notes.some((note) => note.id === 'windows-note' && note.content === '위젯에서도 저장')
    && notes.some((note) => note.id === draft.id && note.content === '위젯 새 메모')
  );
  await until(() => isSaved(browserMemoView.notes) && isSaved(observedWindowsMemos));
  const savedMemo = (await firestore.getDocFromServer(memoRef(web.db, 'windows-note'))).data();
  assert.deepEqual(savedMemo.tags, ['keep']);
  assert.equal(savedMemo.isPinned, true);
  assert.deepEqual((await firestore.getDocFromServer(memoRef(web.db, 'untouched-note'))).data(), editableNote('untouched-note'));
  await desktopMemos.saveStickyNoteText(uid, { ...draft, content: '위젯 새 메모' });
  assert.equal((await firestore.getDocsFromServer(firestore.collection(web.db, 'users', uid, 'stickyNotes'))).size, 4);
  await assert.rejects(desktopMemos.saveStickyNoteText(uid, {
    id: 'web-note', content: '이전 화면의 초안', previousContent: 'web-note',
  }), /다른 화면/);
  await assert.rejects(other.load('@/hooks/useStickyNotes').saveStickyNoteText(uid, {
    id: 'web-note', content: '다른 계정', previousContent: '웹에서도 저장',
  }), /로그인/);
  assert.equal((await firestore.getDocFromServer(memoRef(web.db, 'web-note'))).data().content, '웹에서도 저장');
  console.log('PASS memo: live web and Windows receive independent edits, retain metadata, and reject a stale edit');

  await Promise.all(originalTaskIds.map((id) => firestore.setDoc(taskRef(web.db, id), {
    title: id, note: 'keep task metadata', categoryId: 'test-category', startDate: date, time: '',
    recurrence: { mode: 'daily', weekdays: [], monthDays: [], dates: [] },
    completedDates: ['2026-11-26'], createdAt: firestore.Timestamp.fromMillis(100),
  })));
  const { todoListService: webTodos } = web.load('@/services/todoListService');
  const { todoListService: windowsTodos } = windows.load('@/services/todoListService');
  let observedWebTasks;
  let observedWindowsTasks;
  stopWebTasks = webTodos.subscribeTasks(uid, (tasks) => { observedWebTasks = tasks; }, assert.fail);
  stopWindowsTasks = windowsTodos.subscribeTasks(uid, (tasks) => { observedWindowsTasks = tasks; }, assert.fail);
  await until(() => observedWebTasks?.length === 3 && observedWindowsTasks?.length === 3);
  await Promise.all([
    webTodos.setOccurrenceCompleted(uid, 'web-task', date, true),
    windowsTodos.setOccurrenceCompleted(uid, 'windows-task', date, true),
    windowsTodos.setOccurrenceCompleted(uid, 'web-task', nextDate, true),
  ]);
  const datesMatch = (tasks) => (
    tasks.find((task) => task.id === 'web-task')?.completedDates.join(',') === '2026-11-26,2026-11-27,2026-11-28'
    && tasks.find((task) => task.id === 'windows-task')?.completedDates.join(',') === '2026-11-26,2026-11-27'
  );
  await until(() => datesMatch(observedWebTasks) && datesMatch(observedWindowsTasks));
  assert.equal((await firestore.getDocFromServer(taskRef(web.db, 'windows-task'))).data().note, 'keep task metadata');
  assert.deepEqual((await firestore.getDocFromServer(taskRef(web.db, 'untouched-task'))).data().completedDates, ['2026-11-26']);
  await assert.rejects(other.load('@/services/todoListService').todoListService
    .setOccurrenceCompleted(uid, 'windows-task', date, false), { code: 'permission-denied' });
  console.log('PASS todo: different tasks and dates merge across live web and Windows views, without replacing older dates');
} finally {
  stopDesktopMemo?.();
  stopWebTasks?.();
  stopWindowsTasks?.();
  if (renderer) await act(async () => renderer.unmount());
  await Promise.all(clients.map(async ({ app, db }) => {
    await firestore.terminate(db);
    await deleteApp(app);
  }));
}
