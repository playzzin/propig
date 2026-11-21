import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const base = process.env.BASE_URL || 'http://localhost:3002';
const output = path.resolve(process.env.OUTPUT_DIR ? path.join(process.env.OUTPUT_DIR, 'creeditor') : '.tmp-product-motion-v6');
const platforms = [
  { id: 'naver', name: '네이버스토어', product: '의자', reel: 'chair' },
  { id: 'coupang', name: '쿠팡파트너스', product: '셔츠', reel: 'shirt' },
  { id: 'aliexpress', name: '알리익스프레스', product: 'TV', reel: 'television' },
  { id: 'temu', name: '테무', product: '로봇청소기', reel: 'vacuum' },
];
const cutOffsets = [0, 3000, 6000, 8000];
const sceneDuration = 12_000;
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
  const creator = await artwork.locator('[data-content-creator]').count() > 0;
  const poses = [];
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
    if (creator) {
      const visiblePoses = await artwork.locator('[data-content-pose]').evaluateAll(items => items.filter(element => Number(getComputedStyle(element).opacity) > .95).map(element => element.dataset.contentPose));
      assert.deepEqual(visiblePoses, [['create'], ['present'], ['deliver']][index], 'The character and speech bubble follow creation, presentation, and delivery in order.');
      poses.push(visiblePoses[0]);
      const completion = await artwork.locator('[data-content-confirmation]').evaluate(element => Number(getComputedStyle(element).opacity));
      assert.equal(completion > .95, index === 2, 'Delivery confirmation only appears in the completed phase.');
    }
    packets.push(await artwork.locator('.signal-packet').first().evaluate(element => getComputedStyle(element).strokeDashoffset));
  }
  assert.ok(new Set(packets).size > 1, 'Signal packets move along the commerce connection.');
  if (creator) {
    const transitions = await artwork.locator('[data-content-creator]').evaluate(scene => {
      const poses = [...scene.querySelectorAll('[data-content-pose]')];
      const lines = [...scene.querySelectorAll('[data-content-speech]')];
      const animations = [...poses, ...lines].flatMap(element => element.getAnimations());
      const opacity = element => Number(getComputedStyle(element).opacity);
      return [3750, 3900, 4000, 7750, 7900, 8000, 11750, 11900, 12000].map(time => {
        for (const animation of animations) animation.currentTime = time;
        return {
          time,
          poseOpacity: poses.reduce((total, element) => total + opacity(element), 0),
          visibleLines: lines.filter(element => opacity(element) > .95).length,
        };
      });
    });
    assert.ok(transitions.every(frame => frame.poseOpacity > .95 && frame.visibleLines === 1),
      `The character crossfade shows uninterrupted artwork and one caption: ${JSON.stringify(transitions)}`);
  }
  const before = await artwork.evaluate(element => element.getAnimations({ subtree: true }).map(animation => animation.currentTime));
  assert.ok(before.length > 0, 'The scene includes active motion timelines.');
  await page.waitForTimeout(250);
  const after = await artwork.evaluate(element => element.getAnimations({ subtree: true }).map(animation => animation.currentTime));
  assert.deepEqual(after, before, 'The global pause control freezes every scene timeline.');
  return { steps, packets, poses, pause: 'pass' };
}

const atlasPath = ({ reel }) => `/images/corp/products/commerce/reel-${reel}.webp`;

async function readCut(scene, index) {
  const frame = scene.locator(`img[data-reseller-frame="${index}"]`);
  await frame.waitFor();
  assert.equal(await scene.locator('img[data-reseller-frame]:visible').count(), 1, 'Exactly one cut image is visible.');
  const buttons = scene.locator('[data-reseller-shot]');
  assert.deepEqual(await buttons.evaluateAll(elements => elements.map(element => [element.dataset.resellerShot, element.getAttribute('aria-pressed')])),
    cutOffsets.map((_, cut) => [String(cut), String(cut === index)]), 'The filmstrip shows the active cut.');
  const alt = (await frame.getAttribute('alt'))?.trim() ?? '';
  assert.ok(alt.length > 8 && /[가-힣]/.test(alt), 'The cut includes a descriptive Korean text alternative.');
  const dialogue = (await scene.locator('[data-reseller-dialogue]:visible').innerText()).trim();
  assert.match(dialogue, /[가-힣]/, 'The selected cut shows a Korean dialogue line.');
  return { frame, alt, dialogue };
}

async function verifyAtlas(frame, platform) {
  const image = await frame.evaluate(async element => {
    await element.decode();
    const { naturalWidth: width, naturalHeight: height } = element;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d');
    const cells = [];
    const colors = [];
    for (const row of [0, 1]) {
      for (const column of [0, 1]) {
        context.drawImage(element, column * width / 2, row * height / 2, width / 2, height / 2, 0, 0, 8, 8);
        const pixels = context.getImageData(0, 0, 8, 8).data;
        cells.push(pixels.join(','));
        colors.push(new Set(Array.from({ length: 64 }, (_, pixel) => pixels.slice(pixel * 4, pixel * 4 + 3).join(','))).size);
      }
    }
    return { src: new URL(element.currentSrc).pathname, width, height, distinctCells: new Set(cells).size, colors };
  });
  assert.equal(image.src, atlasPath(platform));
  assert.ok(image.width >= 768 && image.height >= 512 && image.width % 2 === 0 && image.height % 2 === 0, 'Each atlas decodes as four equally sized cells.');
  assert.equal(image.distinctCells, 4, 'Each atlas contains four different cuts.');
  assert.ok(image.colors.every(colorCount => colorCount >= 24), 'Every cell contains a populated illustration.');
  return image;
}

const readPlayhead = showcase => showcase.evaluate((element, duration) =>
  Number(element.style.getPropertyValue('--scene-progress')) * duration, sceneDuration);

async function selectCut(page, showcase, scene, index, keyboard) {
  const button = scene.locator(`[data-reseller-shot="${index}"]`);
  if (keyboard) {
    await button.focus();
    await page.keyboard.press(index % 2 ? 'Space' : 'Enter');
  } else {
    await button.tap();
  }
  const cut = await readCut(scene, index);
  assert.equal(await showcase.getAttribute('data-running'), 'false', 'Selecting a cut pauses the showreel.');
  assert.ok(Math.abs(await readPlayhead(showcase) - cutOffsets[index]) < 1, 'Cut selection moves the shared playhead to the exact boundary.');
  if (keyboard) assert.equal(await button.evaluate(element => element === document.activeElement), true, 'Selecting a cut preserves keyboard focus.');
  return cut;
}

async function verifyAdvertisingPlayback(page, showcase, artwork, scene) {
  await playback(showcase, true);
  await artwork.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-running') === 'true');
  const cuts = [];
  for (const index of [1, 2, 3]) {
    const timestamp = await page.waitForFunction(({ index, duration }) => {
      const root = document.querySelector('#product-business-panorama');
      const frame = root?.querySelector(`img[data-reseller-frame="${index}"]`);
      return frame && Number(root.style.getPropertyValue('--scene-progress')) * duration;
    }, { index, duration: sceneDuration });
    const elapsed = await timestamp.jsonValue();
    await timestamp.dispose();
    assert.ok(elapsed >= cutOffsets[index] && elapsed < cutOffsets[index] + 1000, `Playback presents cut ${index + 1} near ${cutOffsets[index]}ms (${elapsed}ms observed).`);
    cuts.push({ index, elapsed });
    if (index === 1) await playback(showcase, false);
    const { frame } = await readCut(scene, index);
    if (index === 1) {
      assert.equal(await showcase.getAttribute('data-running'), 'false');
      const paused = await readPlayhead(showcase);
      const camera = frame.locator('..');
      const transform = await camera.evaluate(element => getComputedStyle(element).transform);
      await page.waitForTimeout(300);
      assert.equal(await readPlayhead(showcase), paused, 'Pausing freezes the shared playhead.');
      assert.equal(await camera.evaluate(element => getComputedStyle(element).transform), transform, 'Pausing freezes the camera on the current cut.');
      await readCut(scene, index);
      await playback(showcase, true);
      await artwork.scrollIntoViewIfNeeded();
      await page.waitForFunction(previous => {
        const picture = document.querySelector('[data-reseller-viewport] img[data-reseller-frame="1"]');
        return picture && getComputedStyle(picture.parentElement).transform !== previous;
      }, transform, { timeout: 2000 });
    }
  }
  await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-step-id') === 'coupang', undefined, { timeout: 6500 });
  await readCut(scene, 0);
  assert.equal(await scene.locator('[data-commerce-platform]').getAttribute('data-commerce-platform'), 'coupang', 'The next platform begins with its first cut.');
  return { cuts, nextPlatform: 'coupang', pause: 'pass' };
}

try {
  for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
    const mobile = viewport.width < 600;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference' });
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
      const creatorImages = await scene.locator('[data-content-character]').evaluateAll(async items => Promise.all(items.map(async element => {
        const image = new Image(); image.src = element.getAttribute('href'); await image.decode();
        return { pose: element.dataset.contentCharacter, src: image.src, width: image.naturalWidth, height: image.naturalHeight };
      })));
      assert.deepEqual(creatorImages.map(image => image.pose), ['create', 'present', 'deliver']);
      assert.ok(creatorImages.every(image => image.width > 1000 && image.height > 1000), 'All three original character poses decode.');
      assert.equal(await scene.locator('[data-content-delivery-preview]').count(), 1);
      assert.equal(await scene.locator('[data-content-flying-card]').count(), 3);
      const speechFits = await scene.locator('[data-content-speech]').evaluateAll(items => items.every(element => { const box = element.getBBox(); return box.x >= 286 && box.x + box.width <= 489 && box.y >= 134 && box.y + box.height <= 167; }));
      assert.ok(speechFits, 'Every Korean speech bubble fits its fixed artwork frame.');
      result.creatorImages = creatorImages;
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
        const caption = await explorer.locator('[data-product-caption]').innerText();
        assert.ok(caption.includes(platform.name) && caption.includes(platform.product) && caption.includes('시연'), 'The accessible caption identifies the selected demonstration and product.');
        assert.equal(await artwork.locator('a, input, form, button:not([data-reseller-shot], [data-reseller-playback])').count(), 0, 'The film contains only playback and cut selection controls.');
        const initial = await readCut(scene, 0);
        const image = await verifyAtlas(initial.frame, platform);
        const thumbnails = await scene.locator('[data-reseller-shot]').evaluateAll(buttons => buttons.map(button => {
          const thumbnail = button.querySelector('.thumbnail');
          const image = thumbnail?.querySelector('img, image');
          return image?.getAttribute('src') ?? image?.getAttribute('href') ?? (thumbnail && getComputedStyle(thumbnail).backgroundImage);
        }));
        assert.ok(thumbnails.every(source => source?.includes(image.src)), 'The filmstrip thumbnails show the same episode artwork.');
        const renderedCuts = [];
        for (const [index] of cutOffsets.entries()) {
          const { frame, alt, dialogue } = await selectCut(page, showcase, scene, index, !mobile || index % 2 === 0);
          const crop = await frame.evaluate(async element => {
            await element.decode();
            const viewport = element.closest('[data-reseller-viewport]');
            const width = viewport.clientWidth;
            const height = viewport.clientHeight;
            return { src: new URL(element.currentSrc).pathname, width, height, rasterWidth: element.offsetWidth, rasterHeight: element.offsetHeight,
              left: element.offsetLeft, top: element.offsetTop };
          });
          assert.equal(crop.src, image.src, 'All four cuts use the same decoded atlas.');
          assert.ok(crop.width > 0 && crop.height > 0 && Math.abs(crop.rasterWidth - 2 * crop.width) < 3 && Math.abs(crop.rasterHeight - 2 * crop.height) < 3,
            `The film viewport clips a correctly sized 2×2 atlas: ${JSON.stringify(crop)}`);
          assert.ok(Math.abs(crop.left + (index % 2) * crop.width) < 2 && Math.abs(crop.top + Math.floor(index / 2) * crop.height) < 2,
            `Cut ${index + 1} shows the matching cell: ${JSON.stringify(crop)}`);
          const pixels = await scene.locator('[data-reseller-viewport]').screenshot();
          renderedCuts.push({ index, alt, dialogue, fingerprint: createHash('sha256').update(pixels).digest('hex') });
        }
        assert.equal(new Set(renderedCuts.map(cut => cut.alt)).size, 4, 'Each cut describes a different moment.');
        assert.equal(new Set(renderedCuts.map(cut => cut.dialogue)).size, 4, 'Each cut displays its own dialogue.');
        assert.equal(new Set(renderedCuts.map(cut => cut.fingerprint)).size, 4, 'The browser actually shows four visually distinct cuts.');
        await explorer.screenshot({ path: path.join(output, `creeditor-${viewport.width}-${platform.id}.png`) });
        await noOverflow(page, explorer);
        result.accessibility.push({ platform: platform.id, violations: await accessibility(page) });
        result.platforms.push({ ...platform, caption, focus, image, renderedCuts });
      }

      await content.click();
      assert.equal(await scene.getAttribute('data-creeditor-mode'), 'content');
      assert.equal(await explorer.locator('[data-commerce-option]').count(), 0, 'The content selling mode keeps platform selectors out of its flow.');
      await advertising.click();
      assert.equal(await explorer.locator('[data-commerce-option="temu"]').getAttribute('aria-pressed'), 'true', 'Switching modes preserves the selected advertising platform.');
      await playback(showcase, true);
      await artwork.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-running') === 'true');
      await selectCut(page, showcase, scene, 3, !mobile);
      await playback(showcase, true);
      await artwork.scrollIntoViewIfNeeded();
      assert.equal(await showcase.getByRole('button', { name: '현재 장면 반복', exact: true }).count(), 0);
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-step-id') === 'pc-web', undefined, { timeout: 6500 });
      assert.equal(await showcase.getAttribute('data-chapter'), '0');
      assert.equal(await showcase.getAttribute('data-step-id'), 'pc-web', 'The final selling scene returns to the start of the tour.');
      result.modeMemoryAndTourWrap = 'pass';

      await chapter.click();
      await advertising.click();
      await explorer.locator('[data-commerce-option="naver"]').click();
      await selectCut(page, showcase, scene, 0, !mobile);
      result.advertisingPlayback = await verifyAdvertisingPlayback(page, showcase, artwork, scene);

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-reduced-motion') === 'true');
      assert.equal(await showcase.getAttribute('data-running'), 'false');
      await showcase.locator('#product-film-chapter-3').click();
      for (const mode of [content, advertising]) {
        await mode.click();
        assert.equal(await artwork.evaluate(element => element.getAnimations({ subtree: true }).length), 0, 'Reduced-motion commerce scenes are static.');
        assert.ok(await artwork.locator('.motion-only, .motion-secondary').evaluateAll(items => items.every(element => getComputedStyle(element).display === 'none')));
        if (await scene.locator('[data-content-creator]').count()) {
          assert.ok((await scene.textContent()).includes('브랜드 시연'));
          assert.deepEqual(await scene.locator('[data-content-pose]').evaluateAll(items => items.filter(element => Number(getComputedStyle(element).opacity) > .95).map(element => element.dataset.contentPose)), ['create'], 'Reduced motion retains one clear character and speech bubble.');
          await explorer.screenshot({ path: path.join(output, `creeditor-${viewport.width}-content-reduced.png`) });
        } else {
          assert.ok((await explorer.locator('[data-product-caption]').innerText()).includes('브랜드 시연'));
        }
      }
      await explorer.locator('[data-commerce-option="naver"]').click();
      assert.equal(await scene.locator('[data-commerce-platform]').getAttribute('data-commerce-platform'), 'naver', 'Platform navigation remains usable with reduced motion.');
      const still = await selectCut(page, showcase, scene, 2, !mobile);
      await page.waitForTimeout(300);
      assert.equal((await readCut(scene, 2)).dialogue, still.dialogue, 'The selected cut and dialogue stay in view with reduced motion.');
      assert.equal(await readPlayhead(showcase), cutOffsets[2]);
      assert.equal(await artwork.evaluate(element => element.getAnimations({ subtree: true }).length), 0, 'Cut selection does not start decorative motion.');
      assert.equal(await still.frame.evaluate(element => getComputedStyle(element.parentElement).transform), 'none', 'Reduced motion suppresses zoom and panning.');
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
