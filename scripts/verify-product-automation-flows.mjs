import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const base = process.env.BASE_URL || 'http://localhost:3002';
const output = path.resolve(process.env.OUTPUT_DIR ? path.join(process.env.OUTPUT_DIR, 'automation') : '.tmp-product-motion-v5');
const flows = [
  { category: 'integrations', variant: 4, name: '세금계산서 발행', id: 'tax-invoice' },
  { category: 'integrations', variant: 5, name: '급여이체', id: 'payroll' },
  { category: 'integrations', variant: 6, name: '카카오톡 발송', id: 'kakao' },
  { category: 'integrations', variant: 7, name: 'PG 결제 연결', id: 'pg-payment' },
  { category: 'agents', variant: 8, name: '브라우저 자동화', id: 'browser' },
  { category: 'agents', variant: 9, name: '에이전트 봇', id: 'agent' },
];
const categories = [
  { id: 'documents', name: '업무자동화', variants: [0, 1, 2, 3] },
  { id: 'integrations', name: '프로그램 연동', variants: [4, 5, 6, 7] },
  { id: 'agents', name: '브라우저·에이전트', variants: [8, 9] },
];
const expectedDocuments = ['사업계획서', '월급명세서', '노임명세서', '견적서', '거래명세서', '세금계산서', '근로계약서', '발주서', '구매요청서', '지출결의서', '입금확인서', '재고명세서', '업무보고서', '출장신청서', '휴가신청서', '재직증명서', '납품확인서', '정산보고서'];
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* Try another installed browser. */ }
}
assert.ok(executablePath, 'Set CHROME_PATH to an installed Chromium browser.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

async function playback(showcase, playing) {
  const control = showcase.getByRole('button', { name: playing ? '쇼릴 재생' : '쇼릴 일시정지', exact: true });
  if (await control.count()) await control.click();
}

async function sample(page, artwork, milliseconds) {
  await artwork.evaluate((element, time) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = time;
    }
  }, milliseconds);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

async function accessibility(page) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ content: axe.source });
  return page.evaluate(async () => {
    const result = await window.axe.run('#product-business-panorama', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
  });
}

async function deskMotion(page, explorer, category) {
  const layer = explorer.locator(`[data-desk-effects="${category}"]`);
  const selector = category === 'documents' ? '[data-paper-flight]' : category === 'integrations' ? '[data-digital-window]' : '[data-bot-reply]';
  const before = await layer.evaluate(element => element.getAnimations({ subtree: true }).map(animation => ({ time: animation.currentTime, state: animation.playState })));
  assert.ok(before.length > 0 && before.every(animation => animation.state === 'paused'), 'Desk effects pause through the shared playback control.');
  await page.waitForTimeout(200);
  assert.deepEqual(await layer.evaluate(element => element.getAnimations({ subtree: true }).map(animation => ({ time: animation.currentTime, state: animation.playState }))), before, 'Flying objects and bot replies stay frozen while paused.');
  const phases = [];
  for (const time of [0, 1800, 5500, 9500]) {
    await sample(page, layer, time);
    phases.push(await layer.locator(selector).evaluateAll(elements => elements.map(element => ({ opacity: Number(getComputedStyle(element).opacity), transform: getComputedStyle(element).transform }))));
  }
  const visible = phases.map(items => items.filter(item => item.opacity > .95).length);
  assert.equal(visible[0], 0, 'New desk scenes begin before any objects arrive.');
  assert.ok(visible[1] > 0 && visible[1] < visible[2] && visible[2] < visible[3], 'Objects arrive progressively and remain present in the completed scene.');
  assert.equal(visible[3], phases[3].length);
  if (category !== 'agents') assert.notEqual(phases[0][0].transform, phases[3][0].transform, 'Documents and digital windows travel into position.');
  if (category === 'agents') assert.equal(await layer.locator('[data-bot-summary]').evaluate(element => Number(getComputedStyle(element).opacity)), 1, 'The final bot answer appears above the monitor.');
  return { category, visible, pause: 'pass' };
}

try {
  for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /hydration|hydrated|server rendered|Minified React|did not match|route-error/i.test(message.text())) errors.push(message.text());
    });
    const result = { viewport, flows: [], accessibility: [] };
    try {
      const response = await page.goto(new URL('/corp/company/product-introduction', base).href, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      const showcase = page.locator('#product-business-panorama');
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-running') === 'true');
      await showcase.locator('#product-film-chapter-1').click();
      const explorer = showcase.locator('[data-service-explorer="1"]');
      const artwork = explorer.locator('[data-product-motion-artwork]');
      await explorer.scrollIntoViewIfNeeded();
      await playback(showcase, false);
      assert.ok(!(await showcase.innerText()).includes('가능성을 설계하고,'), 'The removed introductory copy no longer occupies the showcase.');
      assert.equal((await showcase.locator('#product-film-title').innerText()).trim(), 'PRODUCT SHOWCASE');
      const story = await showcase.locator('h3').evaluate(element => element.parentElement.getBoundingClientRect().toJSON());
      const preview = await showcase.locator('[data-product-canvas]').boundingBox();
      const navigation = await showcase.locator('[data-product-navigation]').boundingBox();
      if (viewport.width === 1440) assert.ok(preview.width >= navigation.width * 2.2, 'Desktop layout gives the product content the dominant share beside the unified navigation.');
      result.layout = { storyWidth: story.width, previewWidth: preview.width };
      assert.equal(await showcase.locator('[id^="product-film-chapter-"]').count(), 4, 'The four main service chapters remain intact.');
      assert.equal(await explorer.locator('[data-automation-category-option]').count(), 3);
      assert.equal(await explorer.getAttribute('data-automation-category'), 'documents');
      await explorer.locator('[data-service-option="0"]').click();
      const documents = await artwork.locator('[data-document-title]').evaluateAll(items => items.map(element => element.dataset.documentTitle));
      assert.deepEqual(documents, expectedDocuments, 'The original 18 document types remain available.');
      assert.equal(await explorer.getByRole('button', { name: '서류 자동화', exact: true }).count(), 0, 'The document category is now presented as business automation.');
      const workActions = await artwork.locator('[data-work-action]').evaluateAll(items => items.map(element => element.dataset.workAction));
      assert.deepEqual(workActions, ['receive-input', 'validate-records', 'request-approval', 'dispatch-work', 'invoice-request', 'payroll-request', 'send-notification', 'payment-sync', 'browser-query', 'agent-execute'], 'Documents remain connected to input, validation, approval, execution, and all six work actions.');
      await playback(showcase, true);
      await artwork.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await playback(showcase, false);
      result.deskEffects = [await deskMotion(page, explorer, 'documents')];
      const workPhases = [];
      for (const [index, time] of [1500, 5500, 9500].entries()) {
        await sample(page, artwork, time);
        const visible = await artwork.locator('[data-work-action].motion-window').evaluateAll(items => items.filter(element => Number(getComputedStyle(element).opacity) > .95).map(element => element.dataset.workAction));
        assert.deepEqual(visible, [['validate-records'], ['request-approval'], ['dispatch-work']][index], 'The work console advances from validation through approval to execution.');
        workPhases.push(visible[0]);
      }
      await artwork.screenshot({ path: path.join(output, `work-actions-${viewport.width}.png`) });
      result.workActions = { actions: workActions, phases: workPhases };

      for (const category of categories) {
        const button = explorer.getByRole('button', { name: category.name, exact: true });
        await button.focus();
        await page.keyboard.press('Space');
        assert.equal(await explorer.getAttribute('data-automation-category'), category.id);
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        assert.equal(await button.evaluate(element => element === document.activeElement), true, 'Selecting a category preserves keyboard focus.');
        const focus = await button.evaluate(element => ({ style: getComputedStyle(element).outlineStyle, width: parseFloat(getComputedStyle(element).outlineWidth) }));
        assert.ok(focus.style !== 'none' && focus.width >= 2, 'Keyboard category focus is visibly indicated.');
        const available = await explorer.locator('[data-service-option]').evaluateAll(items => items.map(element => Number(element.dataset.serviceOption)));
        assert.deepEqual(available, category.variants);
        await explorer.locator(`[data-service-option="${category.variants.at(-1)}"]`).click();
      }
      for (const category of categories) {
        await explorer.getByRole('button', { name: category.name, exact: true }).click();
        assert.equal(await explorer.getAttribute('data-service-variant'), String(category.variants.at(-1)), 'Returning to a category restores its last selected option.');
      }
      result.categoryKeyboardAndMemory = 'pass';

      for (const flow of flows) {
        const category = categories.find(item => item.id === flow.category);
        await explorer.getByRole('button', { name: category.name, exact: true }).click();
        const button = explorer.getByRole('button', { name: flow.name, exact: true });
        await button.click();
        assert.equal(await explorer.getAttribute('data-service-variant'), String(flow.variant));
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        assert.equal(await explorer.locator('[data-service-option][aria-pressed="true"]').count(), 1);
        assert.equal(await artwork.locator(`[data-automation-flow="${flow.id}"]`).count(), 1, 'Each option displays its matching distinct automation scene.');
        assert.equal(await artwork.locator('[data-automation-flow]').count(), 1);
        assert.equal(await artwork.locator(':scope > svg').getAttribute('aria-hidden'), 'true', 'The adjacent text describes the decorative workflow.');
        assert.equal(await artwork.locator('a, button, input, form').count(), 0, 'Workflow diagrams are local demonstrations with no transaction controls.');
        await playback(showcase, true);
        await artwork.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await playback(showcase, false);
        result.deskEffects.push(await deskMotion(page, explorer, flow.category));
        const stages = [];
        const packets = [];
        for (const [index, time] of [1500, 5500, 9500].entries()) {
          await sample(page, artwork, time);
          const visible = await artwork.locator('[data-flow-step]').evaluateAll(items => items.filter(element => Number(getComputedStyle(element).opacity) > .95).map(element => Number(element.dataset.flowStep)));
          assert.deepEqual(visible, [index], `${flow.id} shows the correct exclusive processing stage at ${time}ms.`);
          stages.push(visible[0]);
          const packet = artwork.locator('.signal-packet').first();
          assert.ok(await packet.count(), `${flow.id} includes a visible communication path.`);
          packets.push(await packet.evaluate(element => getComputedStyle(element).strokeDashoffset));
        }
        assert.ok(new Set(packets).size > 1, `${flow.id} communication packets travel along the route.`);
        const frozenBefore = await artwork.evaluate(element => element.getAnimations({ subtree: true }).map(animation => animation.currentTime));
        await page.waitForTimeout(250);
        const frozenAfter = await artwork.evaluate(element => element.getAnimations({ subtree: true }).map(animation => animation.currentTime));
        assert.deepEqual(frozenAfter, frozenBefore, `${flow.id} motion pauses with the global control.`);
        await explorer.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `automation-${viewport.width}-${flow.id}.png`) });
        await artwork.screenshot({ path: path.join(output, `artwork-${viewport.width}-${flow.id}.png`) });
        const overflow = await page.locator('#content-area').evaluate(element => element.scrollWidth > element.clientWidth + 1);
        assert.equal(overflow, false, 'Automation controls and diagrams fit the viewport.');
        const violations = await accessibility(page);
        if (violations.length) console.error('ACCESSIBILITY', flow.id, JSON.stringify(violations));
        result.accessibility.push({ flow: flow.id, violations });
        result.flows.push({ ...flow, stages, packets, pause: 'pass', overflow });
      }

      await playback(showcase, true);
      await artwork.scrollIntoViewIfNeeded();
      assert.equal(await showcase.getByRole('button', { name: '현재 장면 반복', exact: true }).count(), 0);
      const cycle = Number(await showcase.getAttribute('data-cycle'));
      await page.waitForFunction(previous => Number(document.querySelector('#product-business-panorama')?.getAttribute('data-cycle')) > previous, cycle, { timeout: 15_000 });
      assert.equal(await showcase.getAttribute('data-chapter'), '2');
      assert.equal(await showcase.getAttribute('data-step-id'), 'youtube', 'The last automation flow continues into content creation.');
      result.automaticChapterTransition = 'pass';

      await showcase.locator('#product-film-chapter-2').click();
      const studio = showcase.locator('[data-content-studio]');
      await studio.scrollIntoViewIfNeeded();
      result.contentSmoke = [];
      for (const name of ['YouTube', 'TikTok']) {
        await studio.getByRole('tab', { name, exact: true }).click();
        await playback(showcase, true);
        await studio.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => {
          const video = document.querySelector('[data-content-studio] [data-video-id]');
          return video?.getAttribute('data-player-state') === 'playing' && Number(video.getAttribute('data-player-duration')) > 0;
        });
        const video = studio.locator('[data-video-id]');
        const before = Number(await video.getAttribute('data-player-time'));
        await page.waitForTimeout(1100);
        const media = await video.evaluate(element => ({ id: element.dataset.videoId, time: Number(element.dataset.playerTime), duration: Number(element.dataset.playerDuration), error: element.dataset.playerStatus === 'error' ? 'embed' : null }));
        const elapsed = media.time >= before ? media.time - before : media.time + media.duration - before;
        assert.ok(elapsed > .3, `${name} video still plays in the larger product frame.`);
        assert.equal(media.error, null);
        await page.screenshot({ path: path.join(output, `content-${viewport.width}-${name.toLowerCase()}.png`) });
        result.contentSmoke.push({ channel: name, media });
      }
      await studio.getByRole('tab', { name: '블로그', exact: true }).click();
      const article = studio.locator('article');
      await article.focus();
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(350);
      assert.ok(await article.evaluate(element => element.scrollTop > 50), 'The enlarged blog frame remains keyboard-scrollable.');
      await page.screenshot({ path: path.join(output, `content-${viewport.width}-blog.png`) });
      result.contentSmoke.push({ channel: '블로그', keyboardScroll: 'pass' });
      await studio.getByRole('tab', { name: 'Instagram', exact: true }).click();
      await studio.getByRole('button', { name: '웹툰 이전 컷', exact: true }).click();
      const comic = studio.locator('[data-comic-panel="12"]');
      await comic.waitFor();
      const comicGeometry = await comic.evaluate(element => {
        const box = element.getBoundingClientRect();
        const image = element.querySelector('img');
        const imageBox = image.getBoundingClientRect();
        return { ratio: box.width / box.height, expectedRatio: Number(element.dataset.comicRatio), loaded: image.complete && image.naturalWidth > 0, covered: imageBox.left <= box.left + 1 && imageBox.right >= box.right - 1 && imageBox.top <= box.top + 1 && imageBox.bottom >= box.bottom - 1 };
      });
      assert.ok(comicGeometry.loaded && comicGeometry.covered && Math.abs(comicGeometry.ratio - comicGeometry.expectedRatio) < .05, 'The larger Instagram frame preserves the complete final webtoon crop.');
      await page.screenshot({ path: path.join(output, `content-${viewport.width}-instagram.png`) });
      result.contentSmoke.push({ channel: 'Instagram', comicGeometry });
      assert.equal(await page.locator('#content-area').evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
      result.accessibility.push({ flow: 'content-smoke', violations: await accessibility(page) });

      await showcase.locator('#product-film-chapter-1').click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-reduced-motion') === 'true');
      assert.equal(await showcase.getAttribute('data-running'), 'false');
      for (const flow of flows) {
        await explorer.getByRole('button', { name: categories.find(item => item.id === flow.category).name, exact: true }).click();
        await explorer.getByRole('button', { name: flow.name, exact: true }).click();
        assert.equal(await artwork.locator(`[data-automation-flow="${flow.id}"]`).count(), 1);
        assert.equal(await artwork.evaluate(element => element.getAnimations({ subtree: true }).length), 0, 'Reduced-motion flows are stable and do not animate.');
        const desk = explorer.locator('[data-desk-effects]');
        assert.equal(await desk.evaluate(element => element.getAnimations({ subtree: true }).length), 0);
        assert.ok(await desk.locator('[data-digital-window], [data-bot-reply], [data-bot-summary]').evaluateAll(elements => elements.every(element => Number(getComputedStyle(element).opacity) === 1)), 'Reduced motion preserves completed windows and readable bot answers.');
        assert.ok(await artwork.locator('.motion-only, .motion-secondary').evaluateAll(items => items.every(element => getComputedStyle(element).display === 'none')));
      }
      await explorer.getByRole('button', { name: '업무자동화', exact: true }).click();
      await explorer.locator('[data-service-option="0"]').click();
      assert.equal(await artwork.locator('[data-document-title]').count(), 18);
      const readable = await artwork.locator('[data-document-batch]').evaluateAll(items => items.filter(element => getComputedStyle(element).display !== 'none' && Number(getComputedStyle(element).opacity) > .95).length);
      assert.equal(readable, 1, 'Reduced-motion documents keep one readable batch instead of overlapping all 18 forms.');
      assert.equal(await explorer.locator('[data-desk-effects]').evaluate(element => element.getAnimations({ subtree: true }).length), 0);
      assert.ok(await explorer.locator('[data-paper-flight]').evaluateAll(elements => elements.length === 5 && elements.every(element => Number(getComputedStyle(element).opacity) === 1)), 'Reduced motion retains the complete paper stack.');
      result.reducedMotion = 'pass';
      result.preservedDocuments = expectedDocuments;
      assert.deepEqual(result.accessibility.flatMap(item => item.violations), [], 'No accessibility violations across automation flows.');
      assert.deepEqual(errors, [], 'No runtime or hydration errors.');
      result.errors = errors;
      results.push(result);
      console.log(`PASS product automation flows ${viewport.width}x${viewport.height}`);
    } catch (error) {
      await page.screenshot({ path: path.join(output, `failure-${viewport.width}.png`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(path.join(output, 'automation-flow-results.json'), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
