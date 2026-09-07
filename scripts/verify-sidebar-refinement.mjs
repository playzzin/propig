import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Run only against the newly built shell. Never starts/stops a server or writes user data.
const baseUrl = process.env.SIDEBAR_VERIFY_URL || 'http://127.0.0.1:3002';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseUrl).hostname), 'Local QA only');
const candidates = [process.env.CHROME_PATH, process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* next */ }
}
assert.ok(executablePath, 'Set CHROME_PATH to installed Chromium');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/corp/company/introduction`, { waitUntil: 'domcontentloaded' });
    await page.locator('.sidebar-brand[href="/corp"]').waitFor({ state: 'attached' });
    const sidebar = page.locator('#sidebar');
    const toggle = page.locator('.sidebar-collapse-toggle');
    // Wait for React's event props before the first interaction; SSR controls
    // can be visible while hydration is still pending.
    await page.waitForFunction(() => {
      const el = document.querySelector('.sidebar-collapse-toggle');
      if (!el) return false;
      const key = Object.keys(el).find(key => key.startsWith('__reactProps$'));
      return key && typeof el[key]?.onClick === 'function';
    });
    if (width < 821) {
      await page.locator('#mobile-menu-toggle').click();
      await page.waitForFunction(() => document.querySelector('#sidebar')?.classList.contains('mobile-open'));
    } else {
      const wasCollapsed = await sidebar.evaluate((el) => el.classList.contains('collapsed'));
      await toggle.click();
      await page.waitForFunction((previous) => document.querySelector('#sidebar')?.classList.contains('collapsed') !== previous, wasCollapsed);
      if (!wasCollapsed) await toggle.click();
      await page.waitForFunction(() => !document.querySelector('#sidebar')?.classList.contains('collapsed'));
    }
    const metrics = await sidebar.locator('.nav-btn').evaluateAll((elements) => elements.map((el) => ({
      height: el.getBoundingClientRect().height,
      font: getComputedStyle(el).fontSize,
      icon: getComputedStyle(el.querySelector('.nav-icon')).fontSize,
    })));
    assert.ok(metrics.length > 0, 'Menu rendered');
    for (const metric of metrics) {
      assert.equal(metric.font, '13px');
      assert.equal(metric.icon, '15px');
      assert.ok(width < 821 ? metric.height >= 44 : metric.height >= 36 && metric.height <= 38, JSON.stringify(metric));
    }
    assert.equal(await page.locator('.nav-list').evaluate((el) => getComputedStyle(el).gap), '2px');
    assert.equal(await page.locator('button button, a button, button a').count(), 0, 'No nested interactive controls');
    // Cancellation must retain the current route and the open drawer.
    await page.evaluate(() => {
      window.__sidebarGuard = (event) => { window.__sidebarGuardHref = event.detail.href; event.preventDefault(); };
      window.addEventListener('propig:before-navigation', window.__sidebarGuard);
    });
    await page.locator('.sidebar-brand').click();
    assert.equal(new URL(page.url()).pathname, '/corp/company/introduction');
    assert.equal(await page.evaluate(() => window.__sidebarGuardHref), '/corp');
    await page.evaluate(() => window.removeEventListener('propig:before-navigation', window.__sidebarGuard));
    if (width < 821) {
      await toggle.click();
      await page.waitForFunction(() => document.querySelector('#sidebar')?.hasAttribute('inert'));
      for (const selector of ['#mobile-menu-toggle', '.mobile-brand-link']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44, `${selector} touch target`);
      }
      await page.locator('.mobile-brand-link').click();
    } else {
      await toggle.click();
      await page.waitForFunction(() => Math.abs(document.querySelector('#sidebar').getBoundingClientRect().width - 56) < 0.1);
      const box = await sidebar.boundingBox();
      const toggleBox = await toggle.boundingBox();
      const logoBox = await page.locator('.sidebar-brand').boundingBox();
      assert.equal(box.width, 56, 'compact rail width');
      assert.ok(toggleBox.x < box.x + 14 && toggleBox.y < box.y + 20, 'top-left toggle');
      assert.ok(toggleBox.y + toggleBox.height <= logoBox.y, 'logo and toggle do not overlap');
      await page.screenshot({ path: '/tmp/propig-sidebar-compact-final.png' });
      await page.locator('.sidebar-brand').click();
    }
    await page.waitForURL((url) => url.pathname === '/corp');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
    assert.deepEqual(errors, [], 'No uncaught page errors');
    results.push({ width, rows: metrics.length, metrics, home: '/corp' });
    await context.close();
  }
  for (const [source, home] of [['/propig/memos', '/propig'], ['/blog', '/blog']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${baseUrl}${source}`, { waitUntil: 'domcontentloaded' });
    const brand = page.locator(`.sidebar-brand[href="${home}"]`);
    await brand.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const el = document.querySelector('.sidebar-brand');
      const key = Object.keys(el).find(key => key.startsWith('__reactProps$'));
      return key && typeof el[key]?.onClick === 'function';
    });
    await brand.click();
    await page.waitForURL(url => url.pathname === home);
    assert.equal(await page.locator('#sidebar.collapsed').count(), 0, 'logo must not collapse navigation');
    results.push({ source, home });
    await page.close();
  }
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  await browser.close();
}
