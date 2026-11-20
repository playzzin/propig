import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Exercise the real component with synthetic local data. Never connect to Firebase.
const root = process.cwd();
const runtime = process.env.PROPIG_TEST_RUNTIME || root;
const require = createRequire(path.resolve(runtime, 'package.json'));
const { build } = require('esbuild');
const { chromium } = require('playwright-core');
const theme = process.env.HABIT_QA_THEME === 'codeit' ? 'codeit' : 'dark';
const artifacts = path.join(root, '.tmp', 'habit-simplify', theme === 'codeit' ? 'qa-light' : 'qa');
fs.mkdirSync(artifacts, { recursive: true });

const stubs = {
  'next/link': `import React from 'react'; export default function Link({href,children,...props}) { return React.createElement('a',{...props,href},children); }`,
  '@/contexts/AuthContext': `export const useAuth=()=>({currentUser:window.__fixture.auth.currentUser,loading:false,isConfigured:true,loginWithGoogle:async()=>{window.__fixture.loginCalls++}});`,
  '@/firebase/config': `export const auth=window.__fixture.auth; export const db={}; export const ensureFirestorePersistence=async()=>{};`,
  'sonner': `const record=type=>(message)=>window.__fixture.messages.push({type,message});export const toast={success:record('success'),error:record('error'),info:record('info')};`,
  'firebase/firestore': `
    export const doc=(_db,...parts)=>({path:parts.join('/')});
    export const serverTimestamp=()=>({fixtureTimestamp:true});
    export const onSnapshot=(ref,next,error)=>{
      const fixture=window.__fixture;
      fixture.reads.push(ref.path);
      let cancelled=false;
      queueMicrotask(()=>{
        if(cancelled)return;
        if(fixture.scenario==='read-failure')return error(new Error('Isolated read failure'));
        next({exists:()=>fixture.workspace!==null,data:()=>structuredClone(fixture.workspace)});
      });
      return()=>{cancelled=true};
    };
    export const setDoc=async(ref,value,options)=>{
      const fixture=window.__fixture;
      if(fixture.scenario!=='ready'||fixture.auth.currentUser?.uid!=='fixture-habit-user')throw new Error('Fixture rejected unauthorized write');
      if(ref.path!=='users/fixture-habit-user/habitTracker/workspace')throw new Error('Unexpected workspace path');
      fixture.workspace=structuredClone(value);
      fixture.writes.push({path:ref.path,value:structuredClone(value),options});
      sessionStorage.setItem('habit-fixture-workspace',JSON.stringify(value));
    };
  `,
};

const bundled = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {HabitTrackerApp} from './src/components/habits/HabitTrackerApp';const view=location.pathname.endsWith('/manage')?'manage':location.pathname.endsWith('/manual')?'manual':'daily';createRoot(document.getElementById('root')).render(<HabitTrackerApp initialView={view}/>);`,
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  nodePaths: [path.join(runtime, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'isolated-habit-auth-and-storage',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: stubs[args.path], loader: 'js', resolveDir: root }));
    },
  }],
});

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated habit interaction QA</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}button,input,select{font:inherit}a{text-decoration:none;color:inherit}</style></head><body><div id="root"></div><script>
  const scenario=new URLSearchParams(location.search).get('scenario')||'ready';
  window.__fixture={scenario,auth:{currentUser:scenario==='guest'?null:{uid:'fixture-habit-user'}},workspace:JSON.parse(sessionStorage.getItem('habit-fixture-workspace')||'null'),reads:[],writes:[],messages:[],loginCalls:0};
  </script><script src="/bundle.js"></script></body></html>`;
const globalCss = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
const tokens = [globalCss.match(/:root\s*\{[^}]+\}/)?.[0], globalCss.match(/html\[data-propig-design='codeit'\]\s*\{[^}]+\}/)?.[0]].filter(Boolean).join('\n');
const themedHtml = html.replace('<html lang="ko">', `<html lang="ko"${theme === 'codeit' ? ' data-propig-design="codeit"' : ''}>`).replace('<body>', `<body${theme === 'codeit' ? ' data-propig-design="codeit"' : ''}>`).replace('</head>', `<style>${tokens}</style></head>`);
// Fulfil the synthetic origin in memory so even loopback network access is unnecessary.
const origin = 'https://habit-fixture.invalid';
const candidates = [
  process.env.CHROME_PATH,
  process.env.CHROMIUM_PATH,
  chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);
const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
const errors = [];
const external = [];
const results = [];
let browser;

async function isolatedPage(width, seed) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  if (seed) await context.addInitScript((workspace) => {
    if (!sessionStorage.getItem('habit-fixture-workspace')) sessionStorage.setItem('habit-fixture-workspace', JSON.stringify(workspace));
  }, seed);
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      external.push(route.request().url());
      return route.abort();
    }
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/bundle.js') return route.fulfill({ contentType: 'text/javascript', body: Buffer.from(bundled.outputFiles[0].contents) });
    if (pathname === '/favicon.ico') return route.fulfill({ status: 204 });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: themedHtml });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page };
}

async function assertNoPresets(page) {
  assert.equal(await page.getByText(/빠른\s*시작|방식별 예시 추가|빠른 시작 프리셋/).count(), 0, 'removed preset launcher must not remain');
}

async function captureAndAssertWidth(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: document horizontal overflow`);
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
}

async function waitForWrites(page, count) {
  await page.waitForFunction((expected) => window.__fixture.writes.length === expected, count);
}

function offsetDate(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

try {
  assert.ok(executablePath, 'Browser not found; set CHROME_PATH or CHROMIUM_PATH');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });

  for (const width of [1365, 390]) {
    const { context, page } = await isolatedPage(width);
    await page.goto(`${origin}/habit-tracker`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '습관 트래커', exact: true }).waitFor();
    await assertNoPresets(page);
    assert.equal(await page.evaluate(() => window.__fixture.writes.length), 0, 'empty account must not auto-seed habits');

    await page.getByRole('link', { name: '관리', exact: true }).click();
    await page.getByRole('textbox', { name: '습관 이름', exact: true }).waitFor();
    await assertNoPresets(page);
    assert.equal(await page.getByRole('button', { name: '방식별 예시 추가', exact: true }).count(), 0, 'empty management must not expose starter actions');
    await captureAndAssertWidth(page, `empty-manage-${width}`);
    await page.getByRole('link', { name: '기록', exact: true }).click();

    // A native date input has no textbox role, so use its explicit accessible label.
    const datePicker = page.getByLabel('기록 날짜', { exact: true });
    await datePicker.waitFor();
    const currentDate = await datePicker.inputValue();
    await page.getByRole('button', { name: '이전 주', exact: true }).click();
    assert.equal(await datePicker.inputValue(), offsetDate(currentDate, -7));
    await page.getByRole('button', { name: '다음 주', exact: true }).click();
    assert.equal(await datePicker.inputValue(), currentDate);
    await datePicker.fill('2026-02-28');
    await page.getByRole('button', { name: '다음 주', exact: true }).click();
    assert.equal(await datePicker.inputValue(), '2026-03-07', 'weekly date navigation crosses month boundaries');
    await page.getByRole('button', { name: '오늘', exact: true }).click();
    assert.equal(await datePicker.inputValue(), currentDate);

    const addSummary = page.locator('summary').filter({ hasText: '습관 추가' });
    await addSummary.waitFor();
    assert.equal(await addSummary.evaluate((element) => element.parentElement.open), false, 'inline composer starts collapsed');
    await addSummary.focus();
    await page.keyboard.press('Enter');
    const name = page.getByRole('textbox', { name: '습관 이름', exact: true });
    await name.waitFor();
    const form = name.locator('xpath=ancestor::form');
    const submit = form.getByRole('button', { name: '추가', exact: true });
    assert.equal(await submit.isDisabled(), true, 'blank habit cannot be saved');
    assert.equal(await form.getByRole('combobox', { name: '기록 방식', exact: true }).inputValue(), 'check');
    assert.equal(await form.getByRole('combobox', { name: '카테고리', exact: true, includeHidden: true }).isVisible(), false, 'category is optional and initially collapsed');
    await captureAndAssertWidth(page, `composer-${width}`);
    await name.fill('저녁 산책');
    await name.press('Enter');
    await waitForWrites(page, 1);
    const saved = await page.evaluate(() => window.__fixture.workspace);
    assert.equal(saved.habits.length, 1);
    assert.equal(saved.habits[0].name, '저녁 산책');
    assert.equal(saved.habits[0].mode, 'check');
    assert.equal(saved.categories.length, 1, 'name-only save auto-creates one category');
    assert.equal(saved.habits[0].categoryId, saved.categories[0].id);
    assert.equal(saved.userId, 'fixture-habit-user');
    assert.equal(await addSummary.evaluate((element) => element.parentElement.open), false, 'successful save closes inline composer');
    assert.equal(await addSummary.evaluate((element) => element === document.activeElement), true, 'save returns focus to add control');

    // The weekly table remains the default and clicking a cell toggles the stored record.
    const cell = page.locator('button[title^="저녁 산책 "][title$="항목 기준 기록"]').first();
    await cell.click();
    await waitForWrites(page, 2);
    const recorded = await page.evaluate(() => Object.values(window.__fixture.workspace.records).flatMap((day) => Object.values(day)));
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].checked, true);
    await cell.click();
    await waitForWrites(page, 3);
    assert.equal(await page.evaluate(() => Object.values(window.__fixture.workspace.records).flatMap((day) => Object.values(day))[0].checked), false);
    await captureAndAssertWidth(page, `weekly-${width}`);

    await page.getByRole('button', { name: '하루 보기', exact: true }).click();
    const selectedDate = await datePicker.inputValue();
    await page.getByRole('button', { name: '이전 날짜', exact: true }).click();
    assert.equal(await datePicker.inputValue(), offsetDate(selectedDate, -1));
    await page.getByRole('button', { name: '다음 날짜', exact: true }).click();
    assert.equal(await datePicker.inputValue(), selectedDate);
    const dailyToggle = page.getByRole('button', { name: '박스 체크', exact: true });
    await dailyToggle.click();
    await waitForWrites(page, 4);
    await page.getByRole('button', { name: '완료됨', exact: true }).waitFor();
    await captureAndAssertWidth(page, `daily-${width}`);
    await page.getByRole('button', { name: '주간 보기', exact: true }).click();
    await cell.waitFor();

    await page.getByRole('link', { name: '관리', exact: true }).click();
    await page.getByRole('textbox', { name: '습관 이름', exact: true }).waitFor();
    await assertNoPresets(page);
    assert.equal(await page.getByRole('combobox', { name: '카테고리', exact: true, includeHidden: true }).isVisible(), false);
    await captureAndAssertWidth(page, `manage-${width}`);
    await page.getByRole('link', { name: '설명서', exact: true }).click();
    await assertNoPresets(page);
    results.push({ width, cases: ['keyboard-inline-add', 'default-check', 'automatic-category', 'check-uncheck', 'daily-weekly-layout', 'date-picker-and-navigation', 'empty-manage-no-presets', 'manage-no-presets', 'manual-no-presets', 'no-document-overflow'] });
    await context.close();
  }

  const existingWorkspace = {
    categories: [{ id: 'wellbeing', name: '나의 루틴', color: '#42d392', order: 1 }],
    habits: [
      { id: 'water', categoryId: 'wellbeing', name: '물 마시기', order: 1, mode: 'number', target: 1.5, unit: '잔' },
      { id: 'focus', categoryId: 'wellbeing', name: '집중하기', order: 2, mode: 'duration', target: 12.5, unit: '분' },
    ],
    records: {
      '2026-10-08': { water: { value: 3 }, focus: { minutes: 25 } },
      '2026-10-07': { water: { value: 7 }, focus: { minutes: 50 } },
    },
  };
  for (const width of [1365, 390]) {
    const { context, page } = await isolatedPage(width, existingWorkspace);
    await page.goto(`${origin}/habit-tracker`, { waitUntil: 'domcontentloaded' });
    const picker = page.getByLabel('기록 날짜', { exact: true });
    await picker.fill('2026-10-08');
    await page.getByRole('button', { name: '하루 보기', exact: true }).click();
    const numericFields = page.locator('[data-record-control]').getByRole('spinbutton');
    assert.equal(await numericFields.nth(0).inputValue(), '3');
    assert.equal(await numericFields.nth(1).inputValue(), '25');
    await page.getByTitle('1잔 더하기', { exact: true }).click();
    await waitForWrites(page, 1);
    await page.getByTitle('10분 더하기', { exact: true }).click();
    await waitForWrites(page, 2);
    assert.equal(await numericFields.nth(0).inputValue(), '4');
    assert.equal(await numericFields.nth(1).inputValue(), '35');
    await captureAndAssertWidth(page, `existing-numeric-daily-${width}`);
    await page.getByRole('button', { name: '주간 보기', exact: true }).click();
    await page.locator('button[title^="물 마시기 "][title$="항목 기준 기록"]').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.locator('#habit-quick-value').fill('6');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await waitForWrites(page, 3);
    await dialog.waitFor({ state: 'hidden' });
    await page.locator('button[title^="집중하기 "][title$="항목 기준 기록"]').first().click();
    await dialog.waitFor();
    await dialog.locator('#habit-quick-minutes').fill('45');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await waitForWrites(page, 4);
    await dialog.waitFor({ state: 'hidden' });
    const saved = await page.evaluate(() => window.__fixture.workspace);
    assert.equal(saved.records['2026-10-08'].water.value, 6);
    assert.equal(saved.records['2026-10-08'].focus.minutes, 45);
    assert.deepEqual(saved.records['2026-10-07'], existingWorkspace.records['2026-10-07'], 'editing today preserves historical records');
    assert.deepEqual(saved.categories, existingWorkspace.categories);
    assert.deepEqual(saved.habits.map(({ id, mode, target, unit }) => ({ id, mode, target, unit })), existingWorkspace.habits.map(({ id, mode, target, unit }) => ({ id, mode, target, unit })), 'existing habit modes and targets are preserved');
    await captureAndAssertWidth(page, `existing-numeric-weekly-${width}`);
    await page.getByRole('link', { name: '관리', exact: true }).click();
    for (const [index, habit] of existingWorkspace.habits.entries()) {
      await page.getByRole('button', { name: '수정', exact: true }).nth(index).click();
      const editForm = page.getByRole('form', { name: '습관 수정', exact: true });
      await editForm.getByRole('textbox', { name: '습관 이름', exact: true }).fill(`${habit.name} 수정`);
      await editForm.getByRole('button', { name: '수정 저장', exact: true }).click();
      await waitForWrites(page, 1 + index);
      const updated = await page.evaluate((id) => window.__fixture.workspace.habits.find((item) => item.id === id), habit.id);
      assert.equal(updated.name, `${habit.name} 수정`);
      assert.equal(updated.target, habit.target, 'editing a name must preserve an existing decimal goal');
    }
    assert.deepEqual(await page.evaluate(() => window.__fixture.workspace.records), saved.records, 'habit edits preserve all records');
    results.push({ width, scenario: 'existing-workspace', cases: ['number-and-duration-loaded', 'daily-numeric-save', 'weekly-modal-save', 'history-preserved', 'habit-config-preserved', 'decimal-goal-name-edit', 'no-document-overflow'] });
    await context.close();
  }

  for (const scenario of ['guest', 'read-failure']) {
    const { context, page } = await isolatedPage(390);
    await page.goto(`${origin}/habit-tracker?scenario=${scenario}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '습관 트래커', exact: true }).waitFor();
    if (scenario === 'guest') {
      await page.getByRole('button', { name: 'Google 로그인', exact: true }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: '습관 이름', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.__fixture.reads.length), 0, 'guest must not read workspace');
    } else {
      await page.waitForFunction(() => window.__fixture.messages.some((message) => message.type === 'error'));
      await page.getByRole('heading', { name: '기록을 불러오지 못했어요', exact: true }).waitFor();
      await page.getByText('연결 확인 필요', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '동기화', exact: true }).isDisabled(), true, 'failed reads disable manual sync');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.getByRole('button', { name: '다시 불러오기', exact: true }).click(),
      ]);
      await page.getByRole('heading', { name: '기록을 불러오지 못했어요', exact: true }).waitFor();
      const summary = page.locator('summary').filter({ hasText: '습관 추가' });
      if (await summary.count()) await summary.click();
      for (const input of await page.getByRole('textbox', { name: '습관 이름', exact: true }).all()) {
        assert.equal(await input.isDisabled(), true, 'read failure must fence creation');
      }
    }
    assert.equal(await page.evaluate(() => window.__fixture.writes.length), 0, `${scenario} must not write`);
    await captureAndAssertWidth(page, scenario);
    results.push({ scenario, cases: ['zero-writes', 'permission-fence', ...(scenario === 'read-failure' ? ['visible-load-error', 'manual-sync-disabled', 'retry-control'] : []), 'no-document-overflow'] });
    await context.close();
  }

  assert.deepEqual(errors, [], 'browser runtime errors');
  assert.deepEqual(external, [], 'fixture must make no external requests');
  const report = { passed: true, theme, results, browserErrors: errors, externalRequests: external, artifacts };
  fs.writeFileSync(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('PASS actual HabitTrackerApp: desktop/mobile inline creation, category default, records, view switch, preset removal, permission fences; synthetic Firebase only');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
}
