import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const base = process.env.BASE_URL || 'http://localhost:3002';
const output = path.resolve('.tmp-product-motion-v6');
const platforms = [
  { id: 'naver', name: '네이버스토어', product: '데스크 조명' },
  { id: 'coupang', name: '쿠팡파트너스', product: '무선 헤드폰' },
  { id: 'aliexpress', name: '알리익스프레스', product: '미니 카메라' },
  { id: 'temu', name: '테무', product: '테이블 클록' },
];
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

async function accessibility(page) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ content: axe.source });
  return page.evaluate(async () => {
    const result = await window.axe.run('#product-business-panorama', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
  });
}

async function noOverflow(page, explorer) {
  assert.equal(await page.locator('#content-area').evaluate(element => element.scrollWidth > element.clientWidth + 1), false, 'The public page fits the viewport.');
  assert.equal(await explorer.evaluate(element => element.scrollWidth > element.clientWidth + 1), false, 'Commerce controls fit the product preview.');
}

async function verifyTimeline(page, showcase, artwork) {
  await playback(showcase, true);
  await artwork.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await playback(showcase, false);
  const steps = [];
  const packets = [];
  for (const [index, milliseconds] of [1500, 5500, 9500].entries()) {
    await artwork.evaluate((element, time) => {
      for (const animation of element.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = time;
      }
    }, milliseconds);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const visible = await artwork.locator('[data-creeditor-step]').evaluateAll(items => items.filter(element => Number(getComputedStyle(element).opacity) > .95).map(element => Number(element.dataset.creeditorStep)));
    assert.deepEqual(visible, [index], `Only the matching creation, commerce, or response stage is shown at ${milliseconds}ms.`);
    steps.push(visible[0]);
    packets.push(await artwork.locator('.signal-packet').first().evaluate(element => getComputedStyle(element).strokeDashoffset));
  }
  assert.ok(new Set(packets).size > 1, 'Signal packets move along the commerce connection.');
  const before = await artwork.evaluate(element => element.getAnimations({ subtree: true }).map(animation => animation.currentTime));
  assert.ok(before.length > 0, 'The scene includes active motion timelines.');
  await page.waitForTimeout(250);
  const after = await artwork.evaluate(element => element.getAnimations({ subtree: true }).map(animation => animation.currentTime));
  assert.deepEqual(after, before, 'The global pause control freezes every scene timeline.');
  return { steps, packets, pause: 'pass' };
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
    const result = { viewport, platforms: [], accessibility: [] };
    try {
      const response = await page.goto(new URL('/corp/company/product-introduction', base).href, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      const showcase = page.locator('#product-business-panorama');
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-running') === 'true');
      const chapter = showcase.locator('#product-film-chapter-3');
      assert.ok((await chapter.innerText()).includes('크리에디터'), 'The fourth chapter uses the requested product name.');
      assert.ok(!(await chapter.innerText()).includes('리셀러 파트너'));
      await chapter.click();
      const explorer = showcase.locator('[data-service-explorer="3"]');
      const artwork = explorer.locator('[data-product-motion-artwork]');
      const scene = artwork.locator('[data-motion-scene="creeditor"]');
      const content = explorer.getByRole('button', { name: '생성형 콘텐츠 판매', exact: true });
      const advertising = explorer.getByRole('button', { name: '광고형 리셀러', exact: true });
      await explorer.scrollIntoViewIfNeeded();
      await playback(showcase, false);
      assert.equal(await explorer.locator('[data-service-option]').count(), 2);
      assert.equal(await scene.getAttribute('data-creeditor-mode'), 'content');
      assert.equal(await content.getAttribute('aria-pressed'), 'true');
      for (const title of ['브랜드 영상', '디자인 팩', '웹툰 시리즈', '주문 확인', '파일 전달']) assert.ok((await scene.textContent()).includes(title), `Content commerce includes ${title}.`);
      result.contentMotion = await verifyTimeline(page, showcase, artwork);
      await explorer.screenshot({ path: path.join(output, `creeditor-${viewport.width}-content.png`) });
      result.accessibility.push({ mode: 'content', violations: await accessibility(page) });

      await advertising.focus();
      await page.keyboard.press('Space');
      assert.equal(await advertising.evaluate(element => element === document.activeElement), true, 'Mode selection preserves keyboard focus.');
      assert.equal(await advertising.getAttribute('aria-pressed'), 'true');
      assert.equal(await scene.getAttribute('data-creeditor-mode'), 'advertising');
      assert.equal(await explorer.locator('[data-commerce-option]').count(), 4);
      await page.waitForFunction(() => [...document.querySelectorAll('[data-commerce-option] img')].every(image => image.complete && image.naturalWidth > 0));
      const logos = await explorer.locator('[data-commerce-option] img').evaluateAll(items => items.map(image => ({ src: new URL(image.currentSrc).pathname, width: image.naturalWidth, height: image.naturalHeight })));
      assert.deepEqual(logos.map(image => image.src), platforms.map(({ id }) => `/images/corp/commerce/${id}.png`), 'Every platform uses its local brand asset.');
      result.logos = logos;

      for (const platform of platforms) {
        const button = explorer.locator(`[data-commerce-option="${platform.id}"]`);
        assert.equal((await button.innerText()).trim(), platform.name);
        await button.focus();
        await page.keyboard.press('Space');
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        assert.equal(await explorer.locator('[data-commerce-option][aria-pressed="true"]').count(), 1, 'Exactly one commerce platform is selected.');
        assert.equal(await button.evaluate(element => element === document.activeElement), true, 'Selecting a platform preserves keyboard focus.');
        const focus = await button.evaluate(element => ({ style: getComputedStyle(element).outlineStyle, width: parseFloat(getComputedStyle(element).outlineWidth), height: element.getBoundingClientRect().height }));
        assert.ok(focus.style !== 'none' && focus.width >= 2 && focus.height >= 44, 'Platform controls have visible focus and a usable touch target.');
        assert.equal(await scene.locator('[data-commerce-platform]').getAttribute('data-commerce-platform'), platform.id);
        assert.ok((await scene.textContent()).includes(platform.product), 'Platform selection switches the original product illustration and name.');
        const caption = await explorer.locator('[aria-live="polite"]').innerText();
        assert.ok(caption.includes(platform.name) && caption.includes('시연'), 'The accessible caption describes the selected platform as a demonstration.');
        assert.equal(await artwork.locator('a, button, input, form').count(), 0, 'The commerce artwork contains no real purchase or affiliate submission action.');
        const motion = await verifyTimeline(page, showcase, artwork);
        await explorer.screenshot({ path: path.join(output, `creeditor-${viewport.width}-${platform.id}.png`) });
        await noOverflow(page, explorer);
        result.accessibility.push({ platform: platform.id, violations: await accessibility(page) });
        result.platforms.push({ ...platform, motion, caption, focus });
      }

      await content.click();
      assert.equal(await scene.getAttribute('data-creeditor-mode'), 'content');
      assert.equal(await explorer.locator('[data-commerce-option]').count(), 0, 'The content selling mode keeps platform selectors out of its flow.');
      await advertising.click();
      assert.equal(await explorer.locator('[data-commerce-option="temu"]').getAttribute('aria-pressed'), 'true', 'Switching modes preserves the selected advertising platform.');
      await playback(showcase, true);
      await artwork.scrollIntoViewIfNeeded();
      await showcase.getByRole('button', { name: '현재 장면 반복', exact: true }).click();
      const cycle = Number(await showcase.getAttribute('data-cycle'));
      await page.waitForFunction(previous => Number(document.querySelector('#product-business-panorama')?.getAttribute('data-cycle')) > previous, cycle, { timeout: 15_000 });
      assert.equal(await showcase.getAttribute('data-chapter'), '3');
      assert.equal(await explorer.getAttribute('data-service-variant'), '1');
      assert.equal(await explorer.locator('[data-commerce-option="temu"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await scene.locator('[data-commerce-platform]').getAttribute('data-commerce-platform'), 'temu', 'The 12-second loop preserves mode and platform selection.');
      result.modeAndLoopMemory = 'pass';

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-reduced-motion') === 'true');
      assert.equal(await showcase.getAttribute('data-running'), 'false');
      for (const mode of [content, advertising]) {
        await mode.click();
        assert.equal(await artwork.evaluate(element => element.getAnimations({ subtree: true }).length), 0, 'Reduced-motion commerce scenes are static.');
        assert.ok(await artwork.locator('.motion-only, .motion-secondary').evaluateAll(items => items.every(element => getComputedStyle(element).display === 'none')));
        assert.ok((await scene.textContent()).includes('브랜드 시연'));
      }
      await explorer.locator('[data-commerce-option="naver"]').click();
      assert.equal(await scene.locator('[data-commerce-platform]').getAttribute('data-commerce-platform'), 'naver', 'Platform navigation remains usable with reduced motion.');
      await explorer.screenshot({ path: path.join(output, `creeditor-${viewport.width}-reduced.png`) });
      await noOverflow(page, explorer);
      result.reducedMotion = 'pass';
      assert.deepEqual(result.accessibility.flatMap(item => item.violations), [], 'No accessibility violations across content selling and all four platforms.');
      assert.deepEqual(errors, [], 'No runtime or hydration errors.');
      result.errors = errors;
      results.push(result);
      console.log(`PASS product creeditor ${viewport.width}x${viewport.height}`);
    } catch (error) {
      await page.screenshot({ path: path.join(output, `creeditor-failure-${viewport.width}.png`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(path.join(output, 'creeditor-results.json'), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
