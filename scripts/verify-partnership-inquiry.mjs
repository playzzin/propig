import assert from 'node:assert/strict';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const baseUrl = process.env.PARTNERSHIP_URL || 'http://127.0.0.1:3002';
const executableCandidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/home/hermes/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

async function resolveExecutablePath() {
  for (const candidate of executableCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next local Chromium executable.
    }
  }
  throw new Error('Chromium executable was not found. Set CHROME_PATH.');
}

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Firestore') && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) {
      errors.push(`console: ${message.text()}`);
    }
  });

  await page.goto(`${baseUrl}/corp/partnership/business?product=partner-onboarding`, { waitUntil: 'domcontentloaded' });
  const composer = page.locator('[data-inquiry-ready="true"]:visible');
  await composer.waitFor({ state: 'visible', timeout: 30_000 });
  await assert.doesNotReject(() => page.getByText('파트너 온보딩 키트', { exact: true }).waitFor({ state: 'visible' }));
  assert.equal(await page.getByRole('link', { name: '제휴 문의 작성으로 건너뛰기' }).getAttribute('href'), '#partnership-inquiry');
  assert.equal(await page.locator('#partnership-nav-advertising').getAttribute('href'), '/corp/partnership/advertising');
  assert.equal(await page.locator('#partnership-nav-business').getAttribute('aria-current'), 'page');

  const heroAction = page.getByRole('button', { name: '제휴 브리프 5분 작성' });
  await heroAction.click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('#partnership-organization').evaluate((element) => document.activeElement === element), true, 'Hero CTA must focus the first inquiry field.');

  await page.locator('#partnership-organization').fill('테스트 파트너 팀');
  await page.locator('#partnership-contact').fill('담당자 test@example.com');
  await page.locator('#partnership-problem').fill('반복되는 파트너 온보딩 업무를 줄이고 싶습니다.');
  await page.locator('#partnership-outcome').fill('파트너가 같은 운영 기준으로 일하게 만들고 싶습니다.');
  await page.locator('#partnership-timing').fill('다음 분기, 예산은 협의가 필요합니다.');
  await page.locator('#partnership-resources').fill('기존 운영 문서와 담당 인력');

  await assert.doesNotReject(() => composer.getByText('5 / 5 준비', { exact: true }).waitFor({ state: 'visible' }));
  const mailto = await composer.getByRole('link', { name: /작성한 내용으로 메일 열기/ }).getAttribute('href');
  assert.ok(mailto?.startsWith('mailto:support@propig.com?'), 'Inquiry CTA must target the support email.');
  const decodedMailto = decodeURIComponent(mailto ?? '');
  assert.match(decodedMailto, /파트너 온보딩 키트/);
  assert.match(decodedMailto, /테스트 파트너 팀/);
  assert.match(decodedMailto, /반복되는 파트너 온보딩 업무/);

  await composer.getByRole('button', { name: '광고 제휴' }).click();
  assert.equal(await composer.getByRole('button', { name: '광고 제휴' }).getAttribute('aria-pressed'), 'true');
  const advertisingMailto = decodeURIComponent(await composer.getByRole('link', { name: /작성한 내용으로 메일 열기/ }).getAttribute('href') ?? '');
  assert.match(advertisingMailto, /관심 있는 제휴: 광고 제휴/);

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    mainScrollable: (() => {
      const main = document.querySelector('main');
      return main instanceof HTMLElement && main.scrollHeight > main.clientHeight;
    })(),
    siteModeVisible: Boolean([...document.querySelectorAll('summary,button')].find((element) => element.textContent?.includes('사이트 모드'))),
  }));
  assert.ok(dimensions.documentWidth <= dimensions.viewport + 1, `Document overflows: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.bodyWidth <= dimensions.viewport + 1, `Body overflows: ${JSON.stringify(dimensions)}`);
  assert.equal(dimensions.mainScrollable, true, 'Partnership page must retain its explicit scroll owner.');
  assert.equal(dimensions.siteModeVisible, true, 'Public corporate page must retain the site-mode switcher.');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);

  if (process.env.PARTNERSHIP_SCREENSHOT_DIR) {
    const screenshotDirectory = path.resolve(process.env.PARTNERSHIP_SCREENSHOT_DIR);
    await mkdir(screenshotDirectory, { recursive: true });
    await composer.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(screenshotDirectory, `partnership-inquiry-${viewport.width}.png`),
      fullPage: false,
    });
  }

  await context.close();
  return { viewport, productContext: true, briefReady: true, overflow: false };
}

const catalogSource = await readFile(new URL('../src/components/corp/ProductCatalogExperience.tsx', import.meta.url), 'utf8');
const inquirySource = await readFile(new URL('../src/components/corp/PartnershipInquiryComposer.tsx', import.meta.url), 'utf8');
const catalogProductIds = [...catalogSource.matchAll(/id: '([^']+)',\n\s+name: '[^']+'/g)].map((match) => match[1]);
const missingProductContexts = catalogProductIds.filter((productId) => !inquirySource.includes(`'${productId}':`));
assert.deepEqual(missingProductContexts, [], `Inquiry product context map is missing: ${missingProductContexts.join(', ')}`);

const response = await fetch(`${baseUrl}/corp/partnership/business`, { signal: AbortSignal.timeout(10_000) });
assert.equal(response.ok, true, `Partnership page is unavailable: ${response.status}`);
const browser = await chromium.launch({ executablePath: await resolveExecutablePath(), headless: true });
try {
  const results = [];
  results.push(await verifyViewport(browser, { width: 1366, height: 860 }));
  results.push(await verifyViewport(browser, { width: 390, height: 844 }));
  console.log(JSON.stringify({ route: '/corp/partnership/business', results }));
} finally {
  await browser.close();
}
