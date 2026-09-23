// Reuse an existing production server; never builds or starts one.
// CHROME_PATH=... node scripts/verify-corp-mode-performance.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.CORP_MODE_PERF_URL || 'http://127.0.0.1:3002';
const samples = Number(process.env.CORP_MODE_PERF_SAMPLES || 3);
const warmRuns = Number(process.env.CORP_MODE_PERF_WARM_RUNS || 2);
const maxMs = Number(process.env.CORP_MODE_PERF_MAX_MS || 2000);
assert.ok(Number.isInteger(samples) && samples > 0);
assert.ok(Number.isInteger(warmRuns) && warmRuns > 0);
assert.ok(Number.isFinite(maxMs) && maxMs > 0);
assert.ok(process.env.CHROME_PATH, 'Set CHROME_PATH to an installed Chromium executable');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const results = [];

async function switchMode(page, mobile, name, pathname, heading) {
  const trigger = page.locator('.site-mode-switcher-trigger');
  await trigger.click();
  const button = page.locator('.site-mode-switcher-list button').filter({ hasText: name });
  await button.waitFor({ state: 'visible' });
  // Wait for the actual handler, not a fixed hydration/stabilization delay.
  const buttonHandle = await button.elementHandle();
  try {
    await page.waitForFunction((element) => {
      const props = Object.keys(element).find((key) => key.startsWith('__reactProps$'));
      return props && typeof element[props]?.onClick === 'function';
    }, buttonHandle, { timeout: 15000 });
  } finally { await buttonHandle.dispose(); }
  await page.evaluate(({ pathname, heading }) => {
    window.__corpModeMeasurement = null;
    document.addEventListener('click', () => {
      const start = performance.now();
      let urlMs;
      const check = () => {
        const now = performance.now();
        const matched = location.pathname === pathname;
        if (matched && urlMs === undefined) urlMs = now - start;
        const main = document.querySelector('main#content-area');
        const h1 = main?.querySelector('h1');
        const ready = matched && h1?.textContent === heading && main.getBoundingClientRect().height > 0;
        if (ready) {
          window.__corpModeMeasurement = { start, end: now, urlMs, readyMs: now - start };
        } else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }, { once: true, capture: true });
  }, { pathname, heading });
  // Trusted pointer/touch input without Playwright's document-navigation wait.
  const box = await button.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.waitForFunction(() => window.__corpModeMeasurement, null, { timeout: 15000 });
  const measurement = await page.evaluate(() => {
    const result = window.__corpModeMeasurement;
    return {
      urlMs: Math.round(result.urlMs), readyMs: Math.round(result.readyMs),
      longTasks: (window.__corpModeLongTasks || []).filter((entry) => entry.startTime < result.end && entry.startTime + entry.duration > result.start),
      resources: performance.getEntriesByType('resource')
        .filter((entry) => entry.startTime >= result.start && entry.startTime <= result.end)
        .filter((entry) => new URL(entry.name).origin === location.origin)
        .map((entry) => ({ path: new URL(entry.name).pathname, durationMs: Math.round(entry.duration), bytes: entry.transferSize })),
    };
  });
  assert.equal(await page.locator('.site-mode-switcher[open]').count(), 0, 'mode popup must close');
  assert.equal(await page.locator('#sidebar').count(), 1, 'site navigation must survive');
  assert.equal(await page.locator('.site-mode-switcher-trigger').count(), 1);
  return measurement;
}

try {
  for (const mobile of [false, true]) {
    for (let sample = 0; sample < samples; sample += 1) {
      // Cold means fresh browser context/cache and no prior /corp visit, not a cold server.
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 860 }, isMobile: mobile, hasTouch: mobile });
      try {
        await context.addInitScript(() => {
          window.__corpModeLongTasks = [];
          new PerformanceObserver((list) => window.__corpModeLongTasks.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration }))))
            .observe({ type: 'longtask', buffered: true });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${baseUrl}/blog`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: '블로그 작업 대시보드', exact: true }).waitFor();
        for (let run = 0; run <= warmRuns; run += 1) {
          const measurement = await switchMode(page, mobile, '기업 관리', '/corp', '기업 사이트 홈');
          const result = { viewport: mobile ? 'mobile' : 'desktop', sample: sample + 1, cache: run === 0 ? 'cold' : 'warm', ...measurement };
          results.push(result);
          console.log(JSON.stringify(result));
          const main = page.locator('main#content-area');
          assert.ok(await main.locator('a[href="/corp/company/introduction"]').count(), 'public company content must survive');
          // Scroll the existing owner and verify the final content remains reachable.
          assert.ok(await main.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
            return Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 2;
          }), 'home scroll owner must reach its endpoint');
          if (run < warmRuns) await switchMode(page, mobile, '블로그', '/blog', '블로그 작업 대시보드');
        }
        assert.deepEqual(errors, [], 'browser runtime errors');
      } finally { await context.close(); }
    }
  }
  for (const viewport of ['desktop', 'mobile']) {
    for (const cache of ['cold', 'warm']) {
      const group = results.filter((entry) => entry.viewport === viewport && entry.cache === cache).map((entry) => entry.readyMs).sort((a, b) => a - b);
      const middle = Math.floor(group.length / 2);
      const medianMs = group.length % 2 ? group[middle] : (group[middle - 1] + group[middle]) / 2;
      console.log(JSON.stringify({ viewport, cache, count: group.length, medianMs, maxMs: group.at(-1) }));
    }
  }
  assert.ok(results.every((entry) => entry.readyMs <= maxMs), `URL + body readiness exceeded ${maxMs}ms; see all samples above (no fixed waits included)`);
  console.log('PASS: cold/warm corp mode URL + body, popup, public content, navigation and scroll contracts');
} finally { await browser.close(); }
