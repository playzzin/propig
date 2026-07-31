import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.NAVIGATION_PERF_URL || 'http://127.0.0.1:3002';
const maxTransitionMs = Number(process.env.NAVIGATION_PERF_MAX_MS || 5_000);
const defaultRoutes = [
  '/corp/company/ceo-intro',
  '/corp/company/product-introduction',
  '/corp/company/staff-intro',
  '/corp/company/introduction',
];
const configuredRoutes = process.env.NAVIGATION_PERF_ROUTES
  ?.split(',')
  .map((route) => route.trim())
  .filter(Boolean);
const routes = configuredRoutes?.length ? configuredRoutes : defaultRoutes;
const initialRoute = process.env.NAVIGATION_PERF_START_ROUTE || '/corp/company/introduction';
const isDefaultCompanyCheck = !configuredRoutes?.length;

const executableCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

async function resolveExecutablePath() {
  for (const candidate of executableCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed Chromium browser.
    }
  }

  throw new Error('Chrome or Edge was not found. Set CHROME_PATH before running this check.');
}

async function measureTransition(page, href) {
  const link = page.locator(`a[href="${href}"]`).first();
  await link.waitFor({ state: 'attached', timeout: 15_000 });

  const speculativeRequests = [];
  const recordSpeculativeRequest = (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.pathname === href) {
      speculativeRequests.push(requestUrl.toString());
    }
  };

  page.on('request', recordSpeculativeRequest);
  await link.focus();
  await page.waitForTimeout(300);
  page.off('request', recordSpeculativeRequest);
  assert.deepEqual(
    speculativeRequests,
    [],
    `Focusing ${href} triggered an unnecessary route prefetch: ${speculativeRequests.join(', ')}`,
  );

  const startedAt = performance.now();
  // Playwright treats a client-side route as a document navigation and can wait
  // for unrelated Firestore retries. Dispatch the real anchor click directly,
  // then measure the pathname commit and next paint ourselves.
  await link.evaluate((element) => element.click());
  await page.waitForFunction((expectedPath) => window.location.pathname === expectedPath, href, {
    timeout: maxTransitionMs,
  });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: maxTransitionMs }).catch(() => {});
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));

  return Math.round(performance.now() - startedAt);
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}${initialRoute}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(800);

  const measurements = [];
  for (const href of routes) {
    const durationMs = await measureTransition(page, href);
    assert.ok(
      durationMs <= maxTransitionMs,
      `${viewport.width}px navigation to ${href} took ${durationMs}ms (limit ${maxTransitionMs}ms)`,
    );
    measurements.push({ href, durationMs });
  }

  if (isDefaultCompanyCheck) {
    await page.waitForTimeout(700);
    const extendedSectionCount = await page.locator('main section').count();
    assert.ok(
      extendedSectionCount >= 4,
      `${viewport.width}px company content did not finish rendering (${extendedSectionCount} sections)`,
    );
  }

  if (isDefaultCompanyCheck && viewport.width >= 1_000) {
    await page.locator('.auth-login-btn').click();
    const dialog = page.locator('.auth-modal-overlay[role="dialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    await dialog.locator('button[type="submit"]').click();
    const fieldErrorCount = await dialog.locator('.auth-alert.error').count();
    assert.ok(fieldErrorCount >= 2, `Login form validation did not render both field errors (${fieldErrorCount})`);
  }

  assert.deepEqual(pageErrors, [], `${viewport.width}px page errors: ${pageErrors.join(' | ')}`);
  await context.close();
  return measurements;
}

const browser = await chromium.launch({
  executablePath: await resolveExecutablePath(),
  headless: true,
});

try {
  for (const viewport of [
    { width: 1366, height: 860 },
    { width: 390, height: 844 },
  ]) {
    const measurements = await runViewport(browser, viewport);
    console.log(`${viewport.width}px`, measurements.map(({ href, durationMs }) => `${href}=${durationMs}ms`).join(' '));
  }
} finally {
  await browser.close();
}
