import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
const base = process.env.BASE_URL || 'http://127.0.0.1:3002';
const manifest = JSON.parse(await fs.readFile(new URL('../public/downloads/android/manifest.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
try {
  for (const width of [1366, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [mode, app] of Object.entries(manifest)) {
      await page.goto(base + new URL(app.home).pathname, { waitUntil: 'domcontentloaded' });
      const card = page.getByRole('complementary', { name: `${app.label} Android 앱`, exact: true });
      await card.waitFor();
      const link = card.getByRole('link', { name: `${app.label} APK 다운로드`, exact: true });
      assert.equal(await link.getAttribute('href'), `/downloads/android/${app.file}`);
      const image = card.locator('img');
      await image.evaluate(img => img.decode());
      assert.equal(await image.getAttribute('src'), `/downloads/android/${mode}.png`);
      const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
      assert.equal(download.suggestedFilename(), app.file);
      const bytes = await fs.readFile(await download.path());
      assert.equal(bytes.length, app.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), app.sha256);
      assert.equal(bytes.subarray(0, 2).toString(), 'PK');
      await card.locator('summary').click();
      assert(await card.getByText('독립 WebView 앱이나 오프라인 앱이 아닙니다.', { exact: false }).isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `/tmp/propig-apk-${mode}-${width}.png` });
      console.log(`PASS ${mode} ${width}: decoded icon, APK click/download, exact bytes/hash, guide, no overflow`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
