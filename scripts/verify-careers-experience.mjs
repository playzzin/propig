import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = (process.env.CAREERS_EXPERIENCE_URL || process.env.BASE_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
const executableCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
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
      // Try the next installed Chromium-compatible browser.
    }
  }
  throw new Error('Chrome or Edge was not found. Set CHROME_PATH before running this check.');
}

function observe(page) {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { pageErrors };
}

async function inspectJobs(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const observed = observe(page);
  const response = await page.goto(`${baseUrl}/corp/careers/jobs?track=creative`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  assert.equal(response?.status(), 200);
  await page.locator('#career-track-creative-panel:visible').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#content-area').length === 1);
  await page.locator('#career-track-creative-tab').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('#career-track-operations-tab[aria-selected="true"]').waitFor();

  const evidence = await page.evaluate(() => {
    const tooSmall = Array.from(document.querySelector('#content-area').querySelectorAll('a[href],button,summary,input,select,textarea'))
      .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent?.trim() || element.getAttribute('aria-label') || '', width: rect.width, height: rect.height };
      })
      .filter((item) => item.width < 40 || item.height < 40);
    return {
      mainCount: document.querySelectorAll('main').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hasLegacyExamCopy: document.body.innerText.includes('채용 전 모의시험'),
      hasSidebar: document.querySelector('#sidebar') !== null,
      hasSiteModeSwitcher: document.querySelector('.site-mode-switcher-trigger') !== null,
      scrollMax: Math.max(0, (document.querySelector('#content-area')?.scrollHeight || 0) - (document.querySelector('#content-area')?.clientHeight || 0)),
      tooSmall,
    };
  });

  assert.equal(evidence.mainCount, 1, 'careers jobs must render one main landmark');
  assert.equal(evidence.overflow, 0, `${viewport.width}px careers jobs overflowed horizontally`);
  assert.equal(evidence.hasLegacyExamCopy, false, 'legacy mock-exam copy leaked into careers jobs');
  assert.equal(evidence.hasSidebar, true, 'careers jobs must preserve the site navigation');
  assert.equal(evidence.hasSiteModeSwitcher, true, 'careers jobs must preserve site-mode switching');
  assert.ok(evidence.scrollMax > 100, 'careers jobs must expose a scrollable content area');
  assert.deepEqual(evidence.tooSmall, [], `${viewport.width}px careers jobs has undersized controls`);
  assert.deepEqual(observed.pageErrors, [], 'careers jobs emitted page errors');
  await context.close();
  return evidence;
}

async function inspectApply(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const observed = observe(page);
  const response = await page.goto(`${baseUrl}/corp/careers/apply?track=creative`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  assert.equal(response?.status(), 200);
  await page.locator('main:visible form').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#content-area').length === 1);
  assert.equal(await page.locator('main form').count(), 1, 'application form must render exactly once');

  await page.getByRole('button', { name: '이메일 지원 초안 열기' }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'career-name', 'invalid submission must focus the name field');
  await page.locator('#career-name-error').waitFor({ state: 'visible' });

  await page.locator('#career-name').fill('회귀 검증 지원자');
  await page.locator('#career-email').fill('qa@example.com');
  await page.locator('#career-introduction').fill('작은 문제를 끝까지 정리하고, 변경 이유와 검증 결과를 함께 남깁니다.');
  await page.locator('#career-portfolio').fill('https://example.com/portfolio');
  await page.locator('#career-motivation').fill('사용자의 실제 문제를 작은 단위로 해결하고 오래 유지되는 제품 흐름을 함께 만들고 싶습니다.');
  await page.locator('#career-consent').check();
  await page.waitForTimeout(700);

  const progressLabel = await page.locator('[aria-label^="지원서 준비 진행률"]').getAttribute('aria-label');
  assert.equal(progressLabel, '지원서 준비 진행률 100%', 'completed application draft must report 100% progress');
  await page.getByRole('button', { name: '이메일 지원 초안 열기' }).click();
  await page.getByText('이메일 앱을 열었습니다').waitFor();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0, `${viewport.width}px careers apply overflowed horizontally`);

  assert.deepEqual(observed.pageErrors, [], 'careers apply emitted page errors');

  const restoredPage = page;
  const restoredObserved = observe(restoredPage);
  await restoredPage.goto(`${baseUrl}/corp/careers/apply`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await restoredPage.locator('#career-name').waitFor({ state: 'visible' });
  await restoredPage.waitForFunction(() => document.querySelector('#career-name')?.value === '회귀 검증 지원자');
  assert.equal(await restoredPage.locator('#career-track-creative').isChecked(), true, 'saved interest track must be restored');

  assert.deepEqual(restoredObserved.pageErrors, [], 'restored application emitted page errors');
  await context.close();
  return { overflow, progress: 100 };
}

const browser = await chromium.launch({ executablePath: await resolveExecutablePath(), headless: true });
try {
  const results = {};
  for (const viewport of [
    { width: 1366, height: 860 },
    { width: 390, height: 844 },
  ]) {
    results[`${viewport.width}px`] = {
      jobs: await inspectJobs(browser, viewport),
      apply: await inspectApply(browser, viewport),
    };
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
