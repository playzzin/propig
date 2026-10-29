import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = path.resolve('.tmp-product-motion-v4');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1100 : 844 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /route-error|hydration|hydrated/i.test(message.text())) errors.push(message.text()); });
    await page.goto(`${process.env.BASE_URL || 'http://localhost:3002'}/corp/company/product-introduction`, { waitUntil: 'domcontentloaded' });
    const showcase = page.locator('#product-business-panorama');
    const choices = showcase.locator('[id^="product-film-chapter-"]');
    const stage = showcase.locator('div[data-running]');
    const artwork = showcase.locator('[data-product-motion-artwork]');
    // Wait for the client visibility observer before using SSR-rendered controls.
    await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-running') === 'true');
    await showcase.getByRole('button', { name: '쇼릴 일시정지', exact: true }).click();
    const startPausedTimeline = async index => {
      await choices.nth(index).click();
      if (index === 1) await showcase.locator('[data-service-option="0"]').click();
      await showcase.getByRole('button', { name: '쇼릴 재생', exact: true }).click();
      await showcase.locator('h3').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await showcase.getByRole('button', { name: '쇼릴 일시정지', exact: true }).click();
    };
    const sample = async time => {
      await stage.evaluate((el, ms) => {
        for (const animation of el.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = ms;
        }
      }, time);
      await page.evaluate(() => new Promise(requestAnimationFrame));
    };

    await startPausedTimeline(1);
    assert.equal(await artwork.locator('[data-document-title]').count(), 18);
    const batches = [];
    for (const [index, time] of [1500, 5500, 9500].entries()) {
      await sample(time);
      const visible = await artwork.locator('[data-document-batch]').evaluateAll(groups => groups
        .filter(group => Number(getComputedStyle(group).opacity) > .95)
        .map(group => ({ index: Number(group.dataset.documentBatch), titles: Array.from(group.querySelectorAll('[data-document-title]')).map(el => el.dataset.documentTitle) })));
      assert.equal(visible.length, 1, 'Document batches must not overlap.');
      assert.equal(visible[0].index, index);
      assert.equal(visible[0].titles.length, 6);
      batches.push(visible[0]);
      await artwork.screenshot({ path: path.join(output, `documents-${width}-batch-${index + 1}.png`) });
    }
    await sample(1000);
    assert.ok(Number(await artwork.locator('[data-document-batch="0"] .document-stamp').first().evaluate(el => getComputedStyle(el).opacity)) < .1);
    await sample(2400);
    assert.ok(Number(await artwork.locator('[data-document-batch="0"] .document-stamp').first().evaluate(el => getComputedStyle(el).opacity)) > .95);
    await sample(3900);
    assert.ok(await artwork.locator('[data-document-batch="0"] .document-card').evaluateAll(cards => cards.every(el => Number(getComputedStyle(el).opacity) < .05)), 'Completed documents exit before the next batch.');

    await startPausedTimeline(0);
    const packet = artwork.locator('.signal-packet').first();
    await sample(1100);
    const packetBefore = await packet.evaluate(el => getComputedStyle(el).strokeDashoffset);
    await sample(1700);
    assert.notEqual(await packet.evaluate(el => getComputedStyle(el).strokeDashoffset), packetBefore, 'Communication packet travels along its path.');
    await artwork.screenshot({ path: path.join(output, `signals-${width}.png`) });
    await sample(11950);
    await showcase.getByRole('link', { name: '웹·앱 제품 보기', exact: true }).focus();
    assert.equal(await stage.getAttribute('data-reduced-motion'), 'true');
    assert.equal(await stage.evaluate(el => getComputedStyle(el.firstElementChild).opacity), '1', 'Focus during exit restores readable content.');

    // Native channel media is covered by verify-product-content-studio.mjs.
    for (const chapter of [3]) {
      await startPausedTimeline(chapter);
      const appearances = [];
      for (const time of [1500, 5500, 9500]) {
        await sample(time);
        appearances.push(await artwork.locator('.motion-secondary').evaluateAll(els => els.map(el => Number(getComputedStyle(el).opacity) > .8)));
        await artwork.screenshot({ path: path.join(output, `sequence-${width}-${chapter + 1}-${time}.png`) });
      }
      assert.notDeepEqual(appearances[0], appearances[1], 'Cuts and notifications appear and disappear.');
      assert.notDeepEqual(appearances[1], appearances[2]);
    }

    await startPausedTimeline(1);
    await showcase.getByRole('button', { name: '쇼릴 재생', exact: true }).click();
    await page.waitForTimeout(250);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-reduced-motion') === 'true');
    assert.equal(await showcase.getAttribute('data-running'), 'false');
    assert.ok(await artwork.locator('.motion-secondary, .motion-only').evaluateAll(els => els.every(el => getComputedStyle(el).display === 'none')));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-reduced-motion') === 'false');
    assert.equal(await showcase.getAttribute('data-running'), 'false', 'Changing motion preferences requires explicit playback restart.');
    assert.equal(await stage.getAttribute('data-reduced-motion'), 'true');
    await showcase.getByRole('button', { name: '쇼릴 재생', exact: true }).click();
    assert.equal(await stage.getAttribute('data-reduced-motion'), 'false');
    assert.match(await showcase.locator('[aria-label^="전체 300초"]').getAttribute('aria-label'), /^전체 300초 중 \d+초$/);
    await page.waitForTimeout(300);
    await showcase.getByRole('button', { name: '쇼릴 일시정지', exact: true }).click();
    const before = await stage.evaluate(el => el.getAnimations({ subtree: true }).map(a => a.currentTime));
    await page.waitForTimeout(350);
    const after = await stage.evaluate(el => el.getAnimations({ subtree: true }).map(a => a.currentTime));
    assert.deepEqual(after, before, 'All communication, document and reaction timelines freeze.');
    await startPausedTimeline(0);
    await showcase.getByRole('button', { name: '쇼릴 재생', exact: true }).click();
    await showcase.locator('h3').scrollIntoViewIfNeeded();
    // Establish the resumed RAF baseline before deliberately blocking its next frame.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const delayedFrame = await showcase.evaluate(el => {
      const before = Number(el.style.getPropertyValue('--scene-progress')) * 12_000;
      const start = performance.now();
      while (performance.now() - start < 1100) { /* Simulate one busy foreground frame. */ }
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({ before, after: Number(el.style.getPropertyValue('--scene-progress')) * 12_000 }))));
    });
    assert.ok(delayedFrame.after - delayedFrame.before >= 1000, 'The chapter clock stays aligned with CSS after a delayed foreground frame.');
    assert.deepEqual(errors, []);
    results.push({ width, batches, documentExit: 'pass', stamp: 'pass', signals: 'pass', sceneCuts: 'pass', focusDuringExit: 'pass', motionPreferenceToggle: 'pass', pause: 'pass', delayedFrame, errors });
    console.log(`PASS motion sequences ${width}`);
    await context.close();
  }
  await writeFile(path.join(output, 'sequence-results.json'), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
