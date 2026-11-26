import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getFirestore,
  setDoc,
  terminate,
} from 'firebase/firestore';

const emulator = '127.0.0.1:8191';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, emulator, 'An isolated local emulator is required');
const projectId = 'demo-propig-habit';
const uid = 'habit-' + randomUUID();
const firestorePath = 'users/' + uid + '/habitTracker/workspace';
const origin = 'http://' + emulator;
const today = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const firebaseOptions = { projectId, apiKey: 'demo-key', appId: 'demo-app' };
const workspace = {
  categories: [{ id: 'test', name: '루틴', color: '#42d392', order: 1 }],
  habits: [
    { id: 'walk.one', name: '산책', categoryId: 'test', mode: 'check', order: 1, target: 1, unit: '회' },
    { id: 'read', name: '책 읽기', categoryId: 'test', mode: 'check', order: 2, target: 1, unit: '회' },
    { id: 'water', name: '물 마시기', categoryId: 'test', mode: 'number', order: 3, target: 2, unit: '잔' },
  ],
  records: {
    [today]: { 'walk.one': { checked: false, note: 'keep' }, water: { value: 2 } },
    '2024-01-01': { read: { checked: true } },
  },
  unrelatedField: 'keep',
};

const stubs = {
  'next/link': "import React from 'react'; export default function Link(props) { return React.createElement('a', props); }",
  '@/contexts/AuthContext': [
    "import { useState } from 'react';",
    "import { auth } from '@/firebase/config';",
    'export function useAuth() {',
    '  const [currentUser, setCurrentUser] = useState(auth.currentUser);',
    '  return { currentUser, loading: false, isConfigured: true, logout: async () => {',
    '    auth.currentUser = null; setCurrentUser(null);',
    '  } };',
    '}',
  ].join('\n'),
  '@/firebase/config': [
    "import { initializeApp } from 'firebase/app';",
    "import { connectFirestoreEmulator, disableNetwork, enableNetwork, getFirestore } from 'firebase/firestore';",
    'export const auth = { currentUser: { uid: ' + JSON.stringify(uid) + ' } };',
    'export const db = getFirestore(initializeApp(' + JSON.stringify(firebaseOptions) + "), 'pppp');",
    "connectFirestoreEmulator(db, '127.0.0.1', 8191, { mockUserToken: { sub: auth.currentUser.uid, admin: false, role: 'user' } });",
    'export const ensureFirestorePersistence = async () => {};',
    'window.setHabitNetwork = (online) => online ? enableNetwork(db) : disableNetwork(db);',
  ].join('\n'),
};

const bundled = await build({
  stdin: {
    contents: [
      "import { createRoot } from 'react-dom/client';",
      "import HabitToday from './src/components/habits/HabitToday';",
      "import { HabitTrackerApp } from './src/components/habits/HabitTrackerApp';",
      "createRoot(document.getElementById('root')).render(location.pathname.endsWith('/today') ? <HabitToday /> : <HabitTrackerApp />);",
    ].join('\n'),
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outdir: path.resolve('.tmp/habit-today-fixture'),
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'isolated-habit-emulator',
    setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, ({ path }) => path in stubs ? { path, namespace: 'stub' } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
        contents: stubs[path], loader: 'js', resolveDir: process.cwd(),
      }));
    },
  }],
});

const files = new Map(bundled.outputFiles.map((file) => [path.basename(file.path), file.contents]));
const js = [...files.keys()].find((name) => name.endsWith('.js'));
const css = [...files.keys()].find((name) => name.endsWith('.css'));
const pageErrors = [];
const executablePath = [
  process.env.CHROME_PATH,
  chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].find((candidate) => candidate && fs.existsSync(candidate));
assert.ok(executablePath, 'Set CHROME_PATH to a Chromium executable');
const app = initializeApp(firebaseOptions);
const db = getFirestore(app, 'pppp');
connectFirestoreEmulator(db, '127.0.0.1', 8191, { mockUserToken: { sub: uid, admin: false, role: 'user' } });
const ref = doc(db, firestorePath);
let browser;

async function openPage(width, route) {
  const context = await browser.newContext({ viewport: { width, height: 750 }, timezoneId: 'Asia/Seoul' });
  await context.route('**/*', (request) => {
    const url = new URL(request.request().url());
    if (url.origin !== origin) return request.abort();
    if (url.pathname.startsWith('/google.firestore.v1.Firestore/')) return request.continue();
    if (url.pathname === '/' + js) return request.fulfill({ contentType: 'text/javascript', body: Buffer.from(files.get(js)) });
    if (url.pathname === '/' + css) return request.fulfill({ contentType: 'text/css', body: Buffer.from(files.get(css)) });
    return request.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}</style><link rel="stylesheet" href="/' + css + '"><div id="root"></div><script src="/' + js + '"></script></html>',
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  await page.goto(origin + route);
  return page;
}

try {
  await setDoc(ref, workspace);
  browser = await chromium.launch({ executablePath, headless: true });
  const [web, mini] = await Promise.all([
    openPage(1280, '/habit-tracker'),
    openPage(360, '/habit-tracker/today'),
  ]);

  await web.getByRole('button', { name: '하루 보기', exact: true }).click();
  const webCheck = web.getByRole('button', { name: '박스 체크', exact: true }).first();
  const miniCheck = mini.getByRole('checkbox', { name: '책 읽기', exact: true });
  await mini.getByText('동기화됨', { exact: true }).waitFor();
  assert.equal(await mini.getByRole('checkbox').count(), 2, 'only check habits are rendered');
  assert.equal(await mini.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await Promise.all([web, mini].map((page) => page.evaluate(() => window.setHabitNetwork(false))));

  // Both clients edit from the same cached baseline before either can observe the other write.
  await Promise.all([webCheck.click(), miniCheck.click()]);
  await mini.getByText('동기화 대기 중', { exact: true }).waitFor();
  await mini.getByText('1 / 2 완료', { exact: true }).waitFor();
  await Promise.all([web, mini].map((page) => page.evaluate(() => window.setHabitNetwork(true))));
  await mini.getByText('2 / 2 완료', { exact: true }).waitFor();
  await web.waitForFunction(() => document.querySelectorAll('button').length > 0 &&
    [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === '완료됨').length === 2);
  const saved = (await getDocFromServer(ref)).data();
  assert.equal(saved.records[today]['walk.one'].checked, true);
  assert.equal(saved.records[today]['walk.one'].note, 'keep');
  assert.equal(saved.records[today].read.checked, true);
  assert.deepEqual(saved.records[today].water, { value: 2 });
  assert.deepEqual(saved.records['2024-01-01'], workspace.records['2024-01-01']);
  assert.deepEqual(saved.categories, workspace.categories);
  assert.deepEqual(saved.habits, workspace.habits);
  assert.equal(saved.unrelatedField, 'keep');

  await miniCheck.click();
  await mini.getByText('1 / 2 완료', { exact: true }).waitFor();
  await mini.getByText('동기화됨', { exact: true }).waitFor();
  assert.equal((await getDocFromServer(ref)).data().records[today].read.checked, false);
  await mini.getByRole('button', { name: '로그아웃', exact: true }).click();
  await mini.getByRole('button', { name: 'Google 로그인', exact: true }).waitFor();
  assert.equal(await mini.getByRole('checkbox').count(), 0);
  assert.deepEqual(pageErrors, []);
  console.log('PASS web and 360px mini checklist + real Firestore: concurrent cached edits, existing data preservation, live sync, uncheck, logout');
} finally {
  await browser?.close();
  await terminate(db);
  await deleteApp(app);
}
