import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || '/home/hermes/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const baseUrl = process.env.BASE_URL || process.env.PROPIG_BASE_URL || 'http://localhost:3002';

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const recoverableBackendWarnings = [];
const paidRequests = [];

page.on('pageerror', error => errors.push(`page:${error.message}`));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (text.includes('@firebase/firestore') && text.includes('offline mode') && text.includes('unavailable')) {
    recoverableBackendWarnings.push(text);
    return;
  }
  errors.push(`console:${text}`);
});
page.on('request', request => {
  if (/\/api\/(generate-image|emoticon-studio\/plan)/.test(request.url())) paidRequests.push(request.url());
});

try {
  await page.goto(`${baseUrl}/admin/emoticon-studio`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('[data-studio-ready="true"]').waitFor({ timeout: 60_000 });
  await page.evaluate(async () => {
    localStorage.removeItem('propig:semi-auto-emoticon-studio:v1');
    await new Promise(resolve => {
      const request = indexedDB.deleteDatabase('propig-semi-auto-emoticon-studio');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-studio-ready="true"]').waitFor({ timeout: 60_000 });

  const rail = page.locator('nav[aria-label="제작 단계"]');
  const destinations = [
    ['검수·내보내기', '원본과 작업 정보를 함께 보관해요'],
    ['기획', '움짤의 움직임을 프레임으로 연출해요'],
    ['움직임 제작', '프레임을 불러오면 움직임 편집기가 열려요'],
    ['프로젝트', '프로젝트와 제출 대상을 먼저 정해요'],
    ['이미지 제작', '연출 순서대로 프레임을 가져와요'],
    ['캐릭터', '캐릭터 기준을 먼저 고정해요'],
  ];

  for (const [buttonName, heading] of destinations) {
    await rail.getByRole('button', { name: new RegExp(buttonName) }).click();
    await page.getByRole('heading', { name: heading }).waitFor();
    const current = await rail.locator('[aria-current="step"] strong').textContent();
    assert.equal(current?.trim(), buttonName);
  }

  await rail.getByRole('button', { name: /움직임 제작/ }).click();
  assert.equal(await page.getByText('아직 편집할 프레임이 없어요', { exact: true }).count(), 1);
  await page.getByRole('button', { name: '이미지 제작 열기' }).click();
  await page.getByRole('heading', { name: '연출 순서대로 프레임을 가져와요' }).waitFor();

  await rail.getByRole('button', { name: /검수·내보내기/ }).click();
  const zipButton = page.getByRole('button', { name: /프로젝트 ZIP 내보내기/ });
  assert.equal(await zipButton.isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '내보내기', exact: true }).isDisabled(), true);
  assert.equal(paidRequests.length, 0);

  await rail.getByRole('button', { name: /프로젝트/ }).click();
  await page.screenshot({ path: '/tmp/propig-free-navigation-desktop.png', fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.equal(await rail.isVisible(), false);
  const mobileRail = page.getByRole('navigation', { name: '모바일 제작 단계 자유 탐색' });
  await mobileRail.waitFor();
  for (const [buttonName, heading] of destinations) {
    await mobileRail.getByRole('button', { name: new RegExp(buttonName) }).click();
    await page.getByRole('heading', { name: heading }).waitFor();
    assert.equal(await mobileRail.getByRole('button', { name: new RegExp(buttonName) }).getAttribute('aria-current'), 'step');
  }
  const widths = await page.evaluate(() => ({ root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(widths.root <= 390 && widths.body <= 390, JSON.stringify(widths));
  const undersizedTargets = await page.locator('[data-studio-ready="true"]').locator('button:visible,a[href]:visible,input:visible,select:visible').evaluateAll(elements => elements.filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.width < 44 || rect.height < 44;
  }).map(element => ({ tag: element.tagName, label: element.getAttribute('aria-label') || element.textContent?.trim(), box: element.getBoundingClientRect().toJSON() })));
  assert.deepEqual(undersizedTargets, []);
  await page.screenshot({ path: '/tmp/propig-free-navigation-mobile.png', fullPage: false });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    order: destinations.map(([name]) => name),
    emptyEditorRecovery: true,
    guardedZip: true,
    paidRequests: paidRequests.length,
    recoverableBackendWarnings: recoverableBackendWarnings.length,
    mobile: widths,
    errors: errors.length,
  }));
} finally {
  await browser.close();
}
