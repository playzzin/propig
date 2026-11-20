import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const base = process.env.BASE_URL || 'http://localhost:3002';
const output = path.resolve(process.env.OUTPUT_DIR ? path.join(process.env.OUTPUT_DIR, 'sequence') : '.tmp-product-motion-v7');
// This independent expectation describes the requested public journey, rather
// than importing the implementation's sequence and testing it against itself.
const steps = [
  { id: 'pc-web', label: '그뚠웹', chapter: 0, variant: 0 },
  { id: 'mobile-web', label: '그뚠앱', chapter: 0, variant: 1 },
  { id: 'global-web', label: '글로벌 연결', chapter: 0, variant: 2 },
  { id: 'payroll-documents', label: '급여·거래', chapter: 1, variant: 1 },
  { id: 'contract-documents', label: '계약·발주', chapter: 1, variant: 2 },
  { id: 'report-documents', label: '보고·증명', chapter: 1, variant: 3 },
  { id: 'tax-invoice', label: '세금계산서 발행', chapter: 1, variant: 4, flow: 'tax-invoice' },
  { id: 'payroll-transfer', label: '급여이체', chapter: 1, variant: 5, flow: 'payroll' },
  { id: 'kakao', label: '카카오톡 발송', chapter: 1, variant: 6, flow: 'kakao' },
  { id: 'pg-payment', label: 'PG 결제 연결', chapter: 1, variant: 7, flow: 'pg-payment' },
  { id: 'browser-agent', label: '브라우저 자동화', chapter: 1, variant: 8, flow: 'browser' },
  { id: 'task-agent', label: '에이전트 봇', chapter: 1, variant: 9, flow: 'agent' },
  { id: 'youtube', label: 'YouTube 영상', chapter: 2, channel: 'youtube', duration: 20_000 },
  { id: 'tiktok', label: 'TikTok 영상', chapter: 2, channel: 'tiktok', duration: 15_000 },
  { id: 'blog', label: '블로그 콘텐츠', chapter: 2, channel: 'blog', duration: 24_000 },
  { id: 'instagram', label: 'Instagram 웹툰', chapter: 2, channel: 'instagram', duration: 48_000 },
  { id: 'content-sales', label: '생성형 콘텐츠 판매', chapter: 3, variant: 0 },
  { id: 'naver', label: '네이버스토어', chapter: 3, variant: 1, platform: 'naver' },
  { id: 'coupang', label: '쿠팡파트너스', chapter: 3, variant: 1, platform: 'coupang' },
  { id: 'aliexpress', label: '알리익스프레스', chapter: 3, variant: 1, platform: 'aliexpress' },
  { id: 'temu', label: '테무', chapter: 3, variant: 1, platform: 'temu' },
];
assert.equal(steps.reduce((sum, step) => sum + (step.duration || 12_000), 0), 311_000);
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* Try an installed browser. */ }
}
assert.ok(executablePath, 'Set CHROME_PATH to an installed Chromium browser.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

function captureErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /hydration|hydrated|server rendered|Minified React|did not match|route-error/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

// Node's clock remains real while the page clock is paused. This also allows
// React's MessageChannel work to commit between deterministic RAF boundaries.
async function attribute(locator, name, expected) {
  let state;
  for (let attempt = 0; attempt < 50; attempt++) {
    // Streaming may briefly keep an additional hidden server tree until hydration completes.
    state = await locator.evaluateAll((elements, attributeName) => ({
      count: elements.length,
      value: elements.length === 1 ? elements[0].getAttribute(attributeName) : null,
    }), name);
    if (state.count === 1 && state.value === String(expected)) return;
    await sleep(80);
  }
  assert.equal(state.count, 1, 'Hydration leaves exactly one active showcase.');
  assert.equal(state.value, String(expected), `${name} reaches ${expected}.`);
}

async function playback(showcase, playing) {
  const button = showcase.getByRole('button', { name: playing ? '쇼릴 재생' : '쇼릴 일시정지', exact: true });
  if (await button.count()) await button.click();
}

async function assertStep(showcase, index) {
  const expected = steps[index];
  await attribute(showcase, 'data-step', index);
  assert.equal(await showcase.getAttribute('data-step-id'), expected.id);
  assert.equal(await showcase.getAttribute('data-chapter'), String(expected.chapter));
  assert.equal((await showcase.locator('[data-current-step-label]').innerText()).trim(), expected.label);
  assert.equal((await showcase.locator('[data-next-step-label]').innerText()).trim(), steps[(index + 1) % steps.length].label);
  if (expected.chapter === 2) {
    const studio = showcase.locator('[data-content-studio]');
    assert.equal(await studio.getAttribute('data-content-channel'), expected.channel);
    assert.equal(await studio.getByRole('tab', { selected: true }).count(), 1);
  } else {
    const explorer = showcase.locator('[data-service-explorer]');
    assert.equal(await explorer.getAttribute('data-service-variant'), String(expected.variant));
    if (expected.chapter === 1) {
      assert.equal(await explorer.getAttribute('data-automation-category'), expected.variant < 4 ? 'documents' : expected.variant < 8 ? 'integrations' : 'agents');
      if (expected.flow) assert.equal(await explorer.locator(`[data-automation-flow="${expected.flow}"]`).count(), 1);
      else assert.equal(await explorer.locator('[data-document-title]').evaluateAll(items => new Set(items.map(item => item.dataset.documentTitle)).size), 6);
    }
    if (expected.platform) {
      assert.equal(await explorer.locator(`[data-commerce-option="${expected.platform}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await explorer.locator('[data-commerce-platform]').getAttribute('data-commerce-platform'), expected.platform);
    }
  }
  return { index, ...expected };
}

async function tick(page, milliseconds) {
  await page.clock.fastForward(milliseconds);
  await page.clock.runFor(32);
  await sleep(80);
}

try {
  const viewports = process.env.SHOWREEL_REAL_TIME_ONLY === '1' ? [] : [{ width: 1440, height: 1100 }, { width: 390, height: 844 }];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = captureErrors(page);
    const result = { viewport, orderedSteps: [], clockScope: 'Accelerated RAF verifies routing and state only. CSS and native media use real-clock regression tests.' };
    try {
      await page.clock.install();
      const response = await page.goto(`${base}/corp/company/product-introduction`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      const showcase = page.locator('#product-business-panorama');
      await attribute(showcase, 'data-running', true);
      // Allow the browser protocol round trip; chapter selection below resets the tour.
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      await showcase.locator('#product-film-chapter-0').click();
      await showcase.locator('[data-product-canvas]').scrollIntoViewIfNeeded();
      await page.clock.runFor(64);
      assert.equal(await showcase.getAttribute('data-playback-mode'), 'tour');
      assert.equal(await showcase.locator('[aria-label^="전체 311초"]').count(), 1, 'Elapsed time includes the 20-second YouTube and 15-second TikTok scenes.');
      const initialTourCycle = Number(await showcase.getAttribute('data-tour-cycle'));
      let cycle = Number(await showcase.getAttribute('data-cycle'));

      for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        result.orderedSteps.push(await assertStep(showcase, index));
        assert.equal(await showcase.getAttribute('data-running'), 'true');
        if (index === 3) {
          const director = showcase.locator('[data-automation-director]');
          assert.equal(await director.getAttribute('data-command-mode'), 'pc');
          await tick(page, 4000);
          assert.equal(await director.getAttribute('data-command-mode'), 'phone');
          await tick(page, 4000);
          assert.equal(await director.getAttribute('data-command-mode'), 'voice');
          const poses = await director.locator('img').evaluateAll(images => images.map(image => ({ loaded: image.complete && image.naturalWidth > 0, src: image.getAttribute('src') })));
          assert.equal(poses.length, 3);
          assert.ok(poses.every(pose => pose.loaded), 'All three command poses load without a blank transition.');
          result.automationCommandModes = ['pc', 'phone', 'voice'];
          await tick(page, 4100);
        } else if (index === 14) {
          await tick(page, 12_000);
          await assertStep(showcase, 14);
          await tick(page, 12_100);
        } else if (index === 15) {
          const panels = [Number(await showcase.locator('[data-comic-panel]').getAttribute('data-comic-panel'))];
          for (let panel = 2; panel <= 12; panel++) {
            await page.clock.runFor(4000);
            await sleep(50);
            panels.push(Number(await showcase.locator('[data-comic-panel]').getAttribute('data-comic-panel')));
          }
          assert.deepEqual(panels, Array.from({ length: 12 }, (_, panel) => panel + 1), 'Every webtoon panel is shown before the next product begins.');
          result.webtoonPanels = panels;
          await tick(page, 4100);
        } else await tick(page, (step.duration || 12_000) + 100);
        await attribute(showcase, 'data-step', (index + 1) % steps.length);
        const nextCycle = Number(await showcase.getAttribute('data-cycle'));
        assert.equal(nextCycle, cycle + 1, 'Each ordered boundary restarts the artwork exactly once.');
        cycle = nextCycle;
      }
      await assertStep(showcase, 0);
      assert.equal(Number(await showcase.getAttribute('data-tour-cycle')), initialTourCycle + 1, 'The final commerce platform returns to PC web.');
      result.fullOrderedLoop = 'pass';

      await tick(page, 60_000);
      await assertStep(showcase, 1);
      assert.equal(Number(await showcase.getAttribute('data-cycle')), cycle + 1, 'A delayed foreground frame advances only one scene, so no menu demonstration is skipped.');
      result.delayedFramePreservesEveryScene = 'pass';

      await showcase.locator('#product-film-chapter-1').click();
      await assertStep(showcase, 3);
      await showcase.locator('[data-service-option="2"]').click();
      await assertStep(showcase, 4);
      assert.equal(await showcase.getAttribute('data-playback-mode'), 'tour', 'Manual selection seeks without trapping the tour.');
      await page.clock.runFor(64);
      await tick(page, 12_100);
      await assertStep(showcase, 5);
      await showcase.getByRole('button', { name: '다음 장면', exact: true }).click();
      await assertStep(showcase, 6);
      await showcase.getByRole('button', { name: '이전 장면', exact: true }).click();
      await assertStep(showcase, 5);
      const chapterButtons = showcase.locator('[id^="product-film-chapter-"]');
      await chapterButtons.nth(1).focus();
      await page.keyboard.press('ArrowRight');
      await assertStep(showcase, 12);
      assert.equal(await showcase.getAttribute('data-playback-mode'), 'tour');
      assert.equal(await chapterButtons.nth(2).evaluate(element => document.activeElement === element), true);
      await page.keyboard.press('End');
      await assertStep(showcase, 16);
      await page.keyboard.press('Home');
      await assertStep(showcase, 0);
      result.manualSelectionAndKeyboard = 'pass';

      await showcase.locator('#product-film-chapter-3').click();
      await showcase.getByRole('button', { name: '광고형 리셀러', exact: true }).click();
      await showcase.locator('[data-commerce-option="temu"]').click();
      assert.equal(await showcase.getByRole('button', { name: '현재 장면 반복', exact: true }).count(), 0);
      await playback(showcase, true);
      await showcase.locator('[data-product-canvas]').scrollIntoViewIfNeeded();
      await page.clock.runFor(64);
      const cycleBeforeWrap = Number(await showcase.getAttribute('data-cycle'));
      const tourBeforeWrap = Number(await showcase.getAttribute('data-tour-cycle'));
      await tick(page, 12_100);
      await assertStep(showcase, 0);
      assert.equal(await showcase.getAttribute('data-playback-mode'), 'tour');
      assert.equal(Number(await showcase.getAttribute('data-cycle')), cycleBeforeWrap + 1);
      assert.equal(Number(await showcase.getAttribute('data-tour-cycle')), tourBeforeWrap + 1);
      result.automaticTourWrap = 'pass';

      await playback(showcase, false);
      const pausedCycle = await showcase.getAttribute('data-cycle');
      await tick(page, 30_000);
      assert.equal(await showcase.getAttribute('data-cycle'), pausedCycle);
      await assertStep(showcase, 0);
      await playback(showcase, true);
      await page.clock.runFor(64);
      await page.locator('#product-catalog').scrollIntoViewIfNeeded();
      await attribute(showcase, 'data-running', false);
      await tick(page, 30_000);
      assert.equal(await showcase.getAttribute('data-cycle'), pausedCycle);
      await showcase.locator('[data-product-canvas]').scrollIntoViewIfNeeded();
      await attribute(showcase, 'data-running', true);
      await page.clock.runFor(64);
      await assertStep(showcase, 0);
      await tick(page, 12_100);
      await assertStep(showcase, 1);
      result.pauseOffscreenResume = 'pass';

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await attribute(showcase, 'data-running', false);
      const reducedCycle = await showcase.getAttribute('data-cycle');
      await tick(page, 60_000);
      assert.equal(await showcase.getAttribute('data-cycle'), reducedCycle);
      await showcase.getByRole('button', { name: '다음 장면', exact: true }).click();
      await assertStep(showcase, 2);
      assert.equal(await showcase.getAttribute('data-running'), 'false');
      assert.equal(await showcase.locator('[data-product-motion-artwork]').evaluate(element => element.getAnimations({ subtree: true }).length), 0);
      assert.equal(await page.locator('#content-area').evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
      result.reducedMotion = 'pass';
      await page.screenshot({ path: path.join(output, `sequence-${viewport.width}.png`) });
      // Axe needs its own timers. Resume the clock while reduced motion safely
      // keeps the displayed scene static.
      await page.clock.resume();
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () => (await window.axe.run('#product-business-panorama', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })));
      assert.deepEqual(violations, []);
      assert.deepEqual(errors, []);
      result.errors = errors;
      results.push(result);
      console.log(`PASS ordered 21-scene journey ${viewport.width}x${viewport.height}`);
    } catch (error) {
      await page.screenshot({ path: path.join(output, `sequence-failure-${viewport.width}.png`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }

  // No fake clock here: prove that native RAF and CSS really progress through
  // PC -> mobile -> global -> payroll without user interaction or a timer shim.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = captureErrors(page);
  try {
    await page.goto(`${base}/corp/company/product-introduction`, { waitUntil: 'domcontentloaded' });
    const showcase = page.locator('#product-business-panorama');
    await attribute(showcase, 'data-running', true);
    const started = Date.now();
    await showcase.locator('#product-film-chapter-0').click();
    await showcase.locator('[data-product-canvas]').scrollIntoViewIfNeeded();
    const observed = [{ index: 0, elapsed: 0 }];
    for (let index = 1; index <= 3; index++) {
      await page.waitForFunction(expected => document.querySelector('#product-business-panorama')?.getAttribute('data-step') === String(expected), index, { timeout: 16_000 });
      const elapsed = Date.now() - started;
      console.log(`Real-time scene ${index}: ${elapsed}ms`);
      assert.ok(elapsed >= index * 11_500 && elapsed < index * 12_000 + 10_000, `Real-time scenes complete their twelve-second presentation: ${JSON.stringify({ index, elapsed })}`);
      await assertStep(showcase, index);
      observed.push({ index, elapsed });
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, 'sequence-real-time.png') });
    results.push({ realTimeFirst36Seconds: observed, errors });
    console.log('PASS real-time PC → mobile → global → payroll (36 seconds)');
  } finally { await context.close(); }
  await writeFile(path.join(output, process.env.SHOWREEL_REAL_TIME_ONLY === '1' ? 'showreel-real-time-results.json' : 'showreel-sequence-results.json'), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
