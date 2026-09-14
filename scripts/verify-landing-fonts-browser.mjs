import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createStaticExportServer } from './serve-static-export.mjs';

const server = process.env.STATIC_EXPORT_ROOT ? await createStaticExportServer(process.env.STATIC_EXPORT_ROOT) : null;
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = server ? `http://127.0.0.1:${server.address().port}` : process.env.BASE_URL || 'http://127.0.0.1:3002';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
try {
  for (const width of [390, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/propig', '/propig/memos']) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.innerText.length > 100);
      await page.evaluate(() => document.fonts.ready);
      const fonts = await page.evaluate(() => ({
        family: getComputedStyle(document.body).fontFamily,
        loadedSubset: [...document.fonts].some(font => font.family.includes('Pretendard Variable') && font.status === 'loaded'),
        urls: performance.getEntriesByType('resource').map(entry => entry.name).filter(url => /pretendard/i.test(url)),
        stylesheet: [...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href.includes('pretendardvariable-dynamic-subset.css')),
      }));
      assert(fonts.stylesheet, 'Missing variable subset stylesheet');
      assert(fonts.family.includes('Pretendard Variable'));
      assert(fonts.loadedSubset, 'Variable subset font did not actually load');
      assert(!fonts.urls.some(url => /\/static\/woff2?\//.test(url)), 'Full weight font downloaded');
      if (route.endsWith('/memos')) {
        for (const title of width > 720 ? ['스티커 모드', '낙서장 모드', '목록 모드'] : ['낙서장 모드', '스티커 모드']) {
          await page.getByTitle(title, { exact: true }).click();
          await page.getByRole('status').filter({ hasText: '메모장을 불러오는 중' }).waitFor({ state: 'hidden' });
        }
      }
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(`PASS ${width}px ${route}: subset font, no full fonts, view switching/no page errors`);
    }
    await context.close();
  }
} finally { await browser.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
