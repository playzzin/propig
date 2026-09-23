import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || '/home/hermes/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const baseUrl = process.env.BASE_URL || process.env.PROPIG_BASE_URL || 'http://localhost:3002';

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route(/\/api\/(generate-image|emoticon-studio\/plan)(?:\?|$)/, async route => {
  if (route.request().method() === 'POST') await route.abort('blockedbyclient');
  else await route.continue();
});
const page = await context.newPage();
const errors = [];
const recoverableBackendWarnings = [];
const externalNetworkWarnings = [];
const paidRequests = [];
const failedLocalResources = [];

page.on('response', response => {
  const url = new URL(response.url());
  if (response.status() < 400 || url.origin !== new URL(baseUrl).origin) return;
  const frameUrl = response.frame().url();
  failedLocalResources.push({ path: url.pathname, status: response.status(), frame: frameUrl.startsWith('http') ? new URL(frameUrl).pathname : frameUrl });
});

page.on('pageerror', error => errors.push(`page:${error.message}`));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (text.includes('@firebase/firestore') && text.includes('offline mode') && text.includes('unavailable')) {
    recoverableBackendWarnings.push(text);
    return;
  }
  const url = message.location().url;
  const source = url ? new URL(url).origin + new URL(url).pathname : '';
  if (text.includes('ERR_NETWORK_ACCESS_DENIED') && (/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//.test(source)
    || source === 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel'
    || source === 'https://www.google.com/images/cleardot.gif')) {
    externalNetworkWarnings.push(source);
    return;
  }
  errors.push(`console:${text}${source ? ` (${source})` : ''}`);
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
    ['검수하고 받기', '움직임을 확인하고 파일을 받아요'],
    ['장면 고르기', '만들 장면을 골라 주세요'],
    ['만들고 다듬기', '이미지를 준비하고 움직임을 다듬어요'],
    ['준비하기', '캐릭터와 제출 대상을 준비해요'],
  ];
  assert.equal(await rail.getByRole('button').count(), 4, 'four workspaces must remain independently accessible');

  for (const [buttonName, heading] of destinations) {
    await rail.getByRole('button', { name: new RegExp(buttonName) }).click();
    await page.getByRole('heading', { name: heading }).waitFor();
    const current = await rail.locator('[aria-current="step"] strong').textContent();
    assert.equal(current?.trim(), buttonName);
  }

  await rail.getByRole('button', { name: /만들고 다듬기/ }).click();
  await page.getByLabel('제작·편집 화면').getByRole('button', { name: '프레임 편집', exact: true }).click();
  assert.equal(await page.getByText('아직 편집할 프레임이 없어요', { exact: true }).count(), 1);
  await page.getByRole('button', { name: '이미지 제작 열기' }).click();
  await page.getByRole('heading', { name: '이미지를 준비하고 움직임을 다듬어요' }).waitFor();

  await rail.getByRole('button', { name: /검수하고 받기/ }).click();
  assert.equal(await page.getByRole('button', { name: /플랫폼 (?:부분 )?결과 받기/ }).count(), 0, 'empty export must not offer a result download');
  assert.equal(await page.getByRole('button', { name: '현재 기획 백업', exact: true }).isEnabled(), true, 'planning-only backups must remain available');
  assert.equal(await page.getByRole('button', { name: '이미지 가져오기', exact: true }).isEnabled(), true);
  assert.equal(paidRequests.length, 0);

  await rail.getByRole('button', { name: /준비하기/ }).click();
  await page.screenshot({ path: path.join(tmpdir(), 'propig-free-navigation-desktop.png'), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.equal(await rail.isVisible(), false);
  const mobileRail = page.getByRole('navigation', { name: '모바일 제작 단계 자유 탐색' });
  await mobileRail.waitFor();
  assert.equal(await mobileRail.getByRole('button').count(), 4);
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
  assert.match(await mobileRail.locator('small').textContent(), /저장됨|저장 중/);
  await mobileRail.getByRole('button', { name: /만들고 다듬기/ }).click();
  const importButtons = page.getByRole('button', { name: '이미지 여러 장 선택', exact: true });
  const importPositions = await importButtons.evaluateAll(buttons => buttons.map(button => {
    const box = button.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, visible: box.width > 0 && box.height > 0 };
  }));
  assert.ok(importPositions.some(box => box.visible && box.top >= 0 && box.bottom <= 844 && box.left >= 0 && box.right <= 390), JSON.stringify(importPositions));
  const productionPanel = page.getByRole('region', { name: '프레임 만들기', exact: true });
  await productionPanel.getByRole('button', { name: 'AI로 만들기', exact: true }).click();
  const aiButton = productionPanel.getByRole('button', { name: /장 자동 생성/ });
  assert.equal(await aiButton.isDisabled(), true, 'guest AI action must remain guarded');
  const blockerId = await aiButton.getAttribute('aria-describedby');
  assert.ok(blockerId && await page.locator(`#${blockerId}`).textContent(), 'blocked action must explain its prerequisite');
  await productionPanel.getByRole('button', { name: '직접 가져오기', exact: true }).click();
  await page.screenshot({ path: path.join(tmpdir(), 'propig-free-navigation-mobile.png'), fullPage: false });

  assert.deepEqual(errors, [], JSON.stringify({ errors, failedLocalResources }));
  console.log(JSON.stringify({
    order: destinations.map(([name]) => name),
    emptyEditorRecovery: true,
    guardedZip: true,
    firstViewportImport: importPositions,
    paidRequests: paidRequests.length,
    recoverableBackendWarnings: recoverableBackendWarnings.length,
    externalNetworkWarnings: [...new Set(externalNetworkWarnings)],
    mobile: widths,
    errors: errors.length,
  }));
} finally {
  await browser.close();
}
