import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const base = process.env.BASE_URL || 'http://localhost:3002';
const output = path.resolve(process.env.OUTPUT_DIR ? path.join(process.env.OUTPUT_DIR, 'content') : '.tmp-product-motion-v4');
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* Try another installed browser. */ }
}
assert.ok(executablePath, 'Set CHROME_PATH to an installed Chromium browser.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

function recordErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /hydration|hydrated|server rendered|Minified React|did not match|route-error/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function inspectAccessibility(page, selector) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async target => {
    const result = await window.axe.run(target, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
  }, selector);
  if (violations.length) console.error('ACCESSIBILITY', JSON.stringify(violations));
  return violations;
}

async function assertNoOverflow(page) {
  const dimensions = await page.locator('#content-area').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  assert.ok(dimensions.scroll <= dimensions.client + 1, `Public page must not overflow horizontally: ${JSON.stringify(dimensions)}`);
}

async function ensurePlayback(showcase, playing) {
  const button = showcase.getByRole('button', { name: playing ? '쇼릴 재생' : '쇼릴 일시정지', exact: true });
  if (await button.count()) await button.click();
}

async function selectChapter(page, showcase, chapter) {
  // Streaming can briefly retain a hidden server tree during a reload.
  await page.waitForFunction(() => {
    const roots = document.querySelectorAll('#product-business-panorama');
    const buttons = document.querySelectorAll('#product-film-chapter-0');
    return roots.length === 1 && buttons.length === 1 && Object.keys(buttons[0]).some(key => key.startsWith('__reactProps'));
  });
  await showcase.locator(`#product-film-chapter-${chapter}`).click();
  await showcase.locator('h3').scrollIntoViewIfNeeded();
  assert.equal(await showcase.getAttribute('data-chapter'), String(chapter));
  assert.equal(await showcase.getByRole('button', { name: '현재 장면 반복', exact: true }).count(), 0);
  assert.equal(await showcase.getAttribute('data-playback-mode'), 'tour');
  await page.waitForTimeout(900);
}

async function currentVideo(studio, waitForDuration = true) {
  const video = studio.locator('[data-video-id]');
  assert.equal(await video.count(), 1, 'Only the selected channel mounts its media player.');
  await video.locator('iframe[data-youtube-player]').waitFor();
  await studio.page().waitForFunction(requireDuration => {
    const player = document.querySelector('[data-video-id]');
    return requireDuration ? Number(player?.getAttribute('data-player-duration')) > 0 : player?.getAttribute('data-player-status') === 'ready';
  }, waitForDuration, { timeout: 20000 });
  return video;
}

async function mediaSnapshot(video) {
  return video.evaluate(element => {
    const frame = element.querySelector('iframe'); const url = new URL(frame.src); const box = frame.getBoundingClientRect();
    return { id: element.dataset.videoId, width: box.width, height: box.height, currentTime: Number(element.dataset.playerTime), duration: Number(element.dataset.playerDuration), paused: element.dataset.playerState !== 'playing', muted: element.dataset.playerMuted === 'true', loop: url.searchParams.get('loop') === '1', inline: url.searchParams.get('playsinline') === '1', error: element.dataset.playerStatus === 'error' ? 'embed' : null, src: url.href };
  });
}

async function assertVideoAdvances(page, video) {
  await page.waitForFunction(() => {
    const player = document.querySelector('[data-video-id]');
    return player?.getAttribute('data-player-state') === 'playing' && Number(player.getAttribute('data-player-time')) > 0;
  }, null, { timeout: 15000 });
  const before = await mediaSnapshot(video);
  // External streaming can buffer after its first frame. Verify real progress
  // within a bounded window instead of assuming uninterrupted network delivery.
  await page.waitForFunction(start => {
    const player = document.querySelector('[data-video-id]');
    const current = Number(player?.getAttribute('data-player-time'));
    const duration = Number(player?.getAttribute('data-player-duration'));
    const elapsed = current >= start ? current - start : current + duration - start;
    return player?.getAttribute('data-player-state') === 'playing' && elapsed > .3;
  }, before.currentTime, { timeout: 7000 });
  const after = await mediaSnapshot(video);
  const elapsed = after.currentTime >= before.currentTime ? after.currentTime - before.currentTime : after.currentTime + after.duration - before.currentTime;
  assert.ok(elapsed > .3, `Video should advance after playback: ${JSON.stringify({ before, after })}`);
  assert.equal(after.paused, false);
  assert.equal(after.error, null);
  return after;
}

async function assertVideoPaused(page, video) {
  await page.waitForTimeout(700);
  const before = await mediaSnapshot(video);
  await page.waitForTimeout(500);
  const after = await mediaSnapshot(video);
  assert.equal(after.paused, true, 'Video is paused.');
  assert.ok(Math.abs(after.currentTime - before.currentTime) < .08, 'Paused video keeps its playhead.');
}

try {
  for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = recordErrors(page);
    const facts = { viewport, channels: [], services: [], accessibility: [] };
    try {
      const response = await page.goto(new URL('/corp/company/product-introduction', base).href, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      const showcase = page.locator('#product-business-panorama');
      // The SSR controls are visible before React attaches their handlers.
      await page.waitForFunction(() => {
        const showcases = document.querySelectorAll('#product-business-panorama');
        return showcases.length === 1 && showcases[0].getAttribute('data-running') === 'true';
      });
      await showcase.locator('h2').waitFor();
      assert.equal(await showcase.locator('[id^="product-film-chapter-"]').count(), 4);
      assert.ok(!(await showcase.innerText()).includes('기획 에이전트'));
      await selectChapter(page, showcase, 2);
      const studio = showcase.locator('[data-content-studio]');
      await studio.waitFor();
      const tabs = studio.getByRole('tab');
      assert.equal(await tabs.count(), 4);
      assert.equal(await tabs.locator('[data-channel-logo] svg').count(), 4, 'Each channel tab has a visible channel mark.');
      assert.equal(await showcase.getByRole('link', { name: '콘텐츠 제품 보기', exact: true }).count(), 0);
      assert.equal(await tabs.evaluateAll(items => items.filter(item => item.tabIndex === 0).length), 1, 'Channel tabs use roving tabIndex.');

      for (const channel of ['YouTube', 'TikTok']) {
        await studio.getByRole('tab', { name: channel, exact: true }).click();
        assert.equal(await studio.locator('[data-content-brand-strip]').getAttribute('data-active-channel'), channel.toLowerCase());
        assert.equal(await studio.locator('[data-channel-stop][data-active="true"]').getAttribute('data-channel-stop'), channel.toLowerCase());
        await studio.scrollIntoViewIfNeeded();
        await ensurePlayback(showcase, true);
        await studio.scrollIntoViewIfNeeded();
        const video = await currentVideo(studio);
        const media = await assertVideoAdvances(page, video);
        assert.ok(media.duration >= 14 && media.duration <= 17, 'The linked Shorts expose their actual duration.');
        assert.ok(media.width >= 200 && media.height >= 200, `${channel} meets YouTube minimum player dimensions.`);
        assert.equal(media.id, channel === 'YouTube' ? 'k56Wglp9hI4' : 'eiivhfQJFOA');
        const brand = channel.toLowerCase();
        assert.equal(await studio.locator(`[data-video-window-brand="${brand}"]`).innerText(), channel);
        assert.ok((await video.locator(`[data-video-brand="${brand}"]`).innerText()).includes(channel), 'The video details name the selected channel.');
        assert.equal(await video.locator(`[data-video-brand="${brand}"] [data-channel-logo="${brand}"] svg`).count(), 1, 'The video details show the selected channel logo.');
        assert.equal(media.muted, true);
        assert.equal(media.loop, true);
        assert.equal(media.inline, true);
        assert.ok(media.src.startsWith(`https://www.youtube-nocookie.com/embed/${media.id}?`), 'The selected channel embeds the exact requested Short.');
        assert.equal(await studio.getByRole('link', { name: `${channel} 원본 영상 보기`, exact: true }).getAttribute('href'), `https://youtube.com/shorts/${media.id}`);
        await ensurePlayback(showcase, false);
        await assertVideoPaused(page, video);
        await studio.getByRole('button', { name: `${channel} 소리 켜기`, exact: true }).click();
        assert.equal((await mediaSnapshot(video)).muted, false);
        await studio.getByRole('button', { name: `${channel} 소리 끄기`, exact: true }).click();
        assert.equal((await mediaSnapshot(video)).muted, true);
        assert.equal(await studio.locator('[data-content-brand-strip]').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0, 'Brand motion pauses with the preview.');
        await ensurePlayback(showcase, true);
        await studio.scrollIntoViewIfNeeded();
        await assertVideoAdvances(page, video);
        await studio.getByRole('button', { name: `${channel} 영상 일시정지`, exact: true }).click();
        await assertVideoPaused(page, video);
        const slider = studio.getByRole('slider', { name: `${channel} 영상 재생 위치`, exact: true });
        await slider.focus();
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => Number(document.querySelector('[data-video-id]')?.getAttribute('data-player-time')) < .6, null, { timeout: 5000 });
        assert.ok((await mediaSnapshot(video)).currentTime < .6, 'Keyboard seeking waits for the external player to reach the requested point.');
        await studio.getByRole('button', { name: `${channel} 영상 재생`, exact: true }).click();
        await assertVideoAdvances(page, video);
        await page.screenshot({ path: path.join(output, `content-${viewport.width}-${channel.toLowerCase()}.png`) });
        facts.accessibility.push({ channel, violations: await inspectAccessibility(page, '#product-business-panorama') });
        facts.channels.push({ channel, media, overallPause: 'pass', playerControls: 'pass', keyboardSeek: 'pass' });
      }

      await studio.getByRole('tab', { name: '블로그', exact: true }).click();
      assert.equal(await studio.locator('[data-content-brand-strip]').getAttribute('data-active-channel'), 'blog');
      assert.deepEqual(await studio.locator('[data-blog-platform]').evaluateAll(items => items.map(item => item.textContent)), ['네이버', '티스토리', '워드프레스']);
      const article = studio.locator('article');
      assert.ok((await article.innerText()).length > 400, 'Blog contains a complete readable sample article.');
      assert.ok(await article.locator('p').count() >= 4);
      assert.ok((await article.innerText()).includes('그뚠이의 업무일지'));
      assert.equal(await article.locator('[data-blog-character] img').count(), 2, 'The blog includes an opening character illustration and an in-story scene.');
      const blogImages = await article.locator('[data-blog-character] img').evaluateAll(async images => Promise.all(images.map(async element => {
        const image = new Image(); image.src = element.src; await image.decode();
        return { src: new URL(element.src).pathname, width: image.naturalWidth, height: image.naturalHeight, alt: element.alt };
      })));
      assert.ok(blogImages.every(image => image.width > 0 && image.height > 0 && image.alt.includes('그뚠이')), 'Blog character assets load with descriptive text alternatives.');
      await page.screenshot({ path: path.join(output, `content-${viewport.width}-blog-cover.png`) });
      assert.equal(await studio.locator('iframe[data-youtube-player]').count(), 0, 'Leaving a video channel unmounts the active player.');
      await article.focus();
      const pageScroll = await page.locator('#content-area').evaluate(element => element.scrollTop);
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(400);
      assert.ok(await article.evaluate(element => element.scrollTop > 100), 'Keyboard scroll reveals the rest of the article.');
      assert.ok(Math.abs(await page.locator('#content-area').evaluate(element => element.scrollTop) - pageScroll) < 3, 'Reading the article keeps the public page in place.');
      await page.screenshot({ path: path.join(output, `content-${viewport.width}-blog.png`) });
      facts.accessibility.push({ channel: '블로그', violations: await inspectAccessibility(page, '#product-business-panorama') });
      facts.channels.push({ channel: '블로그', article: 'pass', internalKeyboardScroll: 'pass', blogImages });

      await studio.getByRole('tab', { name: 'Instagram', exact: true }).click();
      assert.equal(await studio.locator('[data-content-brand-strip]').getAttribute('data-active-channel'), 'instagram');
      await page.waitForTimeout(500);
      const comic = studio.getByRole('img', { name: /^웹툰 / });
      assert.match(await comic.getAttribute('aria-label'), /^웹툰 1번째 컷/);
      await studio.getByRole('button', { name: '웹툰 이전 컷', exact: true }).click();
      assert.match(await comic.getAttribute('aria-label'), /^웹툰 12번째 컷/, 'Previous wraps from the first panel to the last.');
      await studio.getByRole('button', { name: '웹툰 다음 컷', exact: true }).click();
      assert.match(await comic.getAttribute('aria-label'), /^웹툰 1번째 컷/, 'Next wraps from the last panel to the first.');
      await studio.getByRole('button', { name: '웹툰 다음 컷', exact: true }).click();
      assert.match(await comic.getAttribute('aria-label'), /^웹툰 2번째 컷/);
      assert.equal(await studio.getByRole('button', { name: /자동 넘김/ }).getAttribute('aria-pressed'), 'false', 'Manual navigation pauses automatic page turns.');
      const comicGeometry = await comic.evaluate(element => {
        const image = element.querySelector('img');
        const box = element.getBoundingClientRect();
        const imageBox = image.getBoundingClientRect();
        return { width: box.width, height: box.height, expectedRatio: Number(element.dataset.comicRatio), naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, loaded: image.complete, containsCrop: imageBox.left <= box.left + 1 && imageBox.right >= box.right - 1 && imageBox.top <= box.top + 1 && imageBox.bottom >= box.bottom - 1 };
      });
      assert.ok(comicGeometry.loaded && comicGeometry.naturalWidth > 0, 'Original brand webtoon image loads.');
      assert.ok(Math.abs(comicGeometry.width / comicGeometry.height - comicGeometry.expectedRatio) < .05, `Webtoon crop preserves the original panel ratio: ${JSON.stringify(comicGeometry)}`);
      assert.equal(comicGeometry.containsCrop, true, 'The cropped comic image actually covers the visible panel.');
      await page.screenshot({ path: path.join(output, `content-${viewport.width}-instagram.png`) });
      facts.accessibility.push({ channel: 'Instagram', violations: await inspectAccessibility(page, '#product-business-panorama') });
      if (viewport.width === 1440) {
        await studio.getByRole('button', { name: /자동 넘김/ }).click();
        await ensurePlayback(showcase, true);
        await studio.scrollIntoViewIfNeeded();
        await page.waitForTimeout(4300);
        assert.match(await comic.getAttribute('aria-label'), /^웹툰 2번째 컷/, 'Resuming the tour displays its second webtoon panel after four seconds.');
        await ensurePlayback(showcase, false);
        const pausedPanel = await comic.getAttribute('aria-label');
        await page.waitForTimeout(4300);
        assert.equal(await comic.getAttribute('aria-label'), pausedPanel, 'Overall pause freezes webtoon page turns.');
      }
      for (let step = 0; step < 12; step++) {
        await studio.getByRole('button', { name: '웹툰 다음 컷', exact: true }).click();
        const crop = await comic.evaluate(element => {
          const box = element.getBoundingClientRect();
          const image = element.querySelector('img').getBoundingClientRect();
          return { panel: element.dataset.comicPanel, ratio: box.width / box.height, expectedRatio: Number(element.dataset.comicRatio), covered: image.left <= box.left + 1 && image.right >= box.right - 1 && image.top <= box.top + 1 && image.bottom >= box.bottom - 1 };
        });
        assert.ok(crop.covered && Math.abs(crop.ratio - crop.expectedRatio) < .05, `All 12 comic crops retain the image and aspect ratio: ${JSON.stringify(crop)}`);
      }
      facts.channels.push({ channel: 'Instagram', twelvePanelBoundaries: 'pass', comicGeometry, manualNavigation: 'pass' });

      await tabs.first().focus();
      await page.keyboard.press('End');
      assert.equal(await tabs.last().evaluate(element => element === document.activeElement), true, 'End focuses the last channel.');
      await page.keyboard.press('Home');
      assert.equal(await tabs.first().evaluate(element => element === document.activeElement), true, 'Home focuses the first channel.');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await tabs.last().evaluate(element => element === document.activeElement), true, 'Channel keyboard focus wraps.');
      await page.keyboard.press('ArrowRight');
      assert.equal(await tabs.first().evaluate(element => element === document.activeElement), true);
      facts.keyboard = 'pass';

      await studio.getByRole('tab', { name: 'TikTok', exact: true }).click();
      await ensurePlayback(showcase, true);
      await studio.scrollIntoViewIfNeeded();
      const cycle = Number(await showcase.getAttribute('data-cycle'));
      await page.waitForFunction(previous => Number(document.querySelector('#product-business-panorama')?.getAttribute('data-cycle')) > previous, cycle, { timeout: 25_000 });
      assert.equal(await showcase.getAttribute('data-chapter'), '2');
      assert.equal(await studio.getByRole('tab', { name: '블로그', exact: true }).getAttribute('aria-selected'), 'true', 'TikTok continues into the next content channel.');
      assert.equal(await studio.locator('iframe[data-youtube-player]').count(), 0, 'The finished video unmounts on the blog channel.');
      await studio.getByRole('tab', { name: 'TikTok', exact: true }).click();
      await studio.scrollIntoViewIfNeeded();
      await assertVideoAdvances(page, await currentVideo(studio));
      facts.channelTransition = 'pass';

      await page.locator('#product-catalog').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-running') === 'false');
      await assertVideoPaused(page, await currentVideo(studio));
      facts.offscreenPause = 'pass';

      for (const [chapter, labels] of [[0, ['그뚠웹', '그뚠앱', '글로벌 연결']], [1, ['자동 순환', '급여·거래', '계약·발주', '보고·증명']], [3, ['생성형 콘텐츠 판매', '광고형 리셀러']]]) {
        await selectChapter(page, showcase, chapter);
        const explorer = showcase.locator(`[data-service-explorer="${chapter}"]`);
        assert.equal(await explorer.locator('[data-service-option]').count(), labels.length);
        const variants = [];
        for (const [variant, label] of labels.entries()) {
          await explorer.getByRole('button', { name: label, exact: true }).click();
          assert.equal(await explorer.getAttribute('data-service-variant'), String(variant));
          assert.equal(await explorer.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
          assert.equal(await explorer.locator('[data-service-option][aria-pressed="true"]').count(), 1);
          if (chapter === 1) {
            const titles = await explorer.locator('[data-document-title]').evaluateAll(items => [...new Set(items.map(item => item.dataset.documentTitle))]);
            assert.equal(titles.length, variant === 0 ? 18 : 6, 'Document category controls the rendered document types.');
            variants.push({ variant, label, titles });
          } else variants.push({ variant, label });
        }
        await explorer.scrollIntoViewIfNeeded();
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(output, `service-${viewport.width}-${chapter}.png`) });
        await assertNoOverflow(page);
        facts.accessibility.push({ chapter, violations: await inspectAccessibility(page, '#product-business-panorama') });
        facts.services.push({ chapter, variants });
      }

      await ensurePlayback(showcase, true);
      await showcase.locator('[data-service-explorer]').scrollIntoViewIfNeeded();
      const partnerCycle = Number(await showcase.getAttribute('data-cycle'));
      await page.waitForFunction(previous => Number(document.querySelector('#product-business-panorama')?.getAttribute('data-cycle')) > previous, partnerCycle, { timeout: 15_000 });
      assert.equal(await showcase.getAttribute('data-chapter'), '3');
      assert.equal(await showcase.locator('[data-service-explorer]').getAttribute('data-service-variant'), '1', 'The tour continues through advertising platforms.');
      facts.serviceTransition = 'pass';

      // Complete 21-step ordering, boundaries, and the real first 36 seconds are
      // covered by verify-product-showreel-sequence.mjs. External media stays on real time here.

      const chapterButtons = showcase.locator('[id^="product-film-chapter-"]');
      await chapterButtons.last().click();
      await chapterButtons.last().focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await showcase.getAttribute('data-chapter'), '0');
      assert.equal(await chapterButtons.first().evaluate(element => element === document.activeElement), true);
      await page.keyboard.press('End');
      assert.equal(await showcase.getAttribute('data-chapter'), '3');
      await page.keyboard.press('Home');
      assert.equal(await showcase.getAttribute('data-chapter'), '0');
      await ensurePlayback(showcase, true);
      await showcase.locator('h3').scrollIntoViewIfNeeded();
      const catalogLink = showcase.getByRole('link', { name: '웹·앱 제품 보기', exact: true });
      await catalogLink.focus();
      assert.equal(await showcase.getAttribute('data-running'), 'false', 'Focusing the catalog CTA pauses the changing scene.');
      await catalogLink.click();
      await page.waitForFunction(() => window.location.hash === '#web-app');
      await page.locator('#content-area').evaluate(element => { element.scrollTop = 0; });
      await catalogLink.click();
      assert.ok(await page.locator('#content-area').evaluate(element => element.scrollTop > 400), 'Repeating a same-hash CTA returns to the catalog.');
      assert.ok(await page.getByRole('heading', { name: '웹제품 스타터', exact: true }).isVisible());
      facts.chapterKeyboard = 'pass';
      facts.sameHashCatalogLink = 'pass';

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-reduced-motion') === 'true');
      await selectChapter(page, showcase, 2);
      assert.equal(await showcase.getAttribute('data-running'), 'false');
      const reducedStudio = showcase.locator('[data-content-studio]');
      await reducedStudio.getByRole('tab', { name: 'YouTube', exact: true }).click();
      await reducedStudio.scrollIntoViewIfNeeded();
      // A deliberately unplayed iframe may defer metadata until the user's first play.
      const reducedVideo = await currentVideo(reducedStudio, false);
      await assertVideoPaused(page, reducedVideo);
      await reducedStudio.getByRole('button', { name: 'YouTube 영상 재생', exact: true }).click();
      await assertVideoAdvances(page, reducedVideo);
      await reducedStudio.getByRole('button', { name: 'YouTube 영상 일시정지', exact: true }).click();
      await assertVideoPaused(page, reducedVideo);
      facts.reducedMotion = 'pass';
      await assertNoOverflow(page);
      assert.deepEqual(facts.accessibility.flatMap(item => item.violations), [], 'No showcase accessibility violations across channels and services.');
      assert.deepEqual(errors, [], 'No runtime or hydration errors.');
      facts.errors = errors;
      results.push(facts);
      console.log(`PASS product content studio ${viewport.width}x${viewport.height}`);
    } catch (error) {
      await page.screenshot({ path: path.join(output, `failure-${viewport.width}.png`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  const resilienceContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' });
  await resilienceContext.addInitScript(() => {
    const nativeFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => nativeFrame(timestamp => callback(timestamp - 40));
  });
  const resiliencePage = await resilienceContext.newPage();
  const resilienceErrors = recordErrors(resiliencePage);
  let failVideo = true;
  let videoRequests = 0;
  await resiliencePage.route('https://www.youtube.com/iframe_api', route => {
    videoRequests++;
    return failVideo ? route.abort('failed') : route.continue();
  });
  await resiliencePage.goto(new URL('/corp/company/product-introduction', base).href, { waitUntil: 'domcontentloaded' });
  const resilienceShowcase = resiliencePage.locator('#product-business-panorama');
  await resiliencePage.waitForFunction(() => {
    const showcases = document.querySelectorAll('#product-business-panorama');
    return showcases.length === 1 && showcases[0].getAttribute('data-running') === 'true';
  });
  await resilienceShowcase.locator('h3').waitFor();
  await resiliencePage.waitForTimeout(1000);
  assert.equal(await resilienceShowcase.getAttribute('data-chapter'), '0', 'An early requestAnimationFrame timestamp cannot select a negative chapter.');
  await selectChapter(resiliencePage, resilienceShowcase, 2);
  await resilienceShowcase.getByText('영상을 불러오지 못했습니다.', { exact: true }).waitFor();
  assert.equal(await resilienceShowcase.getByRole('link', { name: 'YouTube에서 보기', exact: true }).getAttribute('href'), 'https://youtube.com/shorts/k56Wglp9hI4');
  failVideo = false;
  await resilienceShowcase.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await resilienceShowcase.locator('[data-content-studio]').scrollIntoViewIfNeeded();
  await assertVideoAdvances(resiliencePage, await currentVideo(resilienceShowcase.locator('[data-content-studio]')));
  assert.ok(videoRequests >= 2, 'Retry requests the failed asset again.');
  assert.deepEqual(resilienceErrors, []);
  results.push({ earlyFrameTimestamp: 'pass', mediaErrorRecovery: 'pass', errors: resilienceErrors });
  await resilienceContext.close();
  await writeFile(path.join(output, 'content-studio-results.json'), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
