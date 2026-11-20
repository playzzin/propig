import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const baseUrl = process.env.PROPIG_BASE_URL || 'http://localhost:3002';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
].find(existsSync);
const artifacts = path.resolve('.tmp-business-video');
await mkdir(artifacts, { recursive: true });
const businessKeys = ['web-app', 'automation', 'video', 'reseller', 'planning-agent'];
const configuration = Object.fromEntries(businessKeys.map((key, index) => [key, {
  technology: { url: `https://youtu.be/testVideo${index}A`, title: `Sample ${index + 1}`, creator: 'Demo creator' },
  workflow: `testVideo${index}B`,
}]));

// Deterministic player events exercise navigation without depending on ads,
// third-party connectivity or the duration of the user's final video assets.
function mockYouTube({ deferReady = false } = {}) {
  window.testPlayers = [];
  window.YT = {
    PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
    Player: class {
      constructor(target, options) {
        this.events = options.events;
        this.parameters = options.playerVars;
        this.id = options.videoId;
        this.muted = false;
        this.volume = 100;
        this.state = -1;
        this.destroyed = false;
        this.playCalls = 0;
        this.iframe = document.createElement('iframe');
        this.iframe.src = 'about:blank';
        this.iframe.style.background = '#091725';
        target.replaceWith(this.iframe);
        window.testPlayers.push(this);
        if (!deferReady) setTimeout(() => this.emitReady(), 10);
      }
      emitReady() { this.events.onReady({ target: this }); }
      emit(state) { this.state = state; this.events.onStateChange({ target: this, data: state }); }
      playVideo() { this.playCalls += 1; this.emit(1); }
      pauseVideo() { this.emit(2); }
      getPlayerState() { return this.state; }
      getIframe() { return this.iframe; }
      isMuted() { return this.muted; }
      mute() { this.muted = true; }
      unMute() { this.muted = false; }
      getVolume() { return this.volume; }
      getDuration() { return 60; }
      getCurrentTime() { return 15; }
      setVolume(volume) { this.volume = volume; }
      destroy() { this.destroyed = true; this.iframe.remove(); }
    },
  };
}

async function waitForVideo(page, id) {
  await page.waitForFunction((expected) => {
    const current = window.testPlayers.at(-1);
    return current?.id === expected && !current.destroyed;
  }, id);
}

async function verifyNoLegacyPoster(page, expectEmpty = false) {
  const poster = await page.locator('#heroImage').evaluate((image) => ({
    src: image.getAttribute('src'), hidden: image.hidden,
  }));
  assert.ok(!poster.src || poster.src.startsWith('https://i.ytimg.com/vi/'), 'only video posters may appear in the film stage');
  if (expectEmpty) assert.deepEqual(poster, { src: null, hidden: true }, 'pending or missing video keeps the neutral stage');
}

async function verifyStackLayout(page) {
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height, width: r.width };
    };
    return {
      width: innerWidth,
      stage: rect('#businessVideoStage'), front: rect('#showcaseMedia'), carousel: rect('#businessFilmCarousel'), copy: rect('#showcaseCard'), tabs: rect('#heroTabs'),
      next: rect('.video-stack-card--next'), following: rect('.video-stack-card--following'),
      overflow: document.documentElement.scrollWidth > innerWidth,
      transform: getComputedStyle(document.querySelector('#showcaseMedia')).transform,
    };
  });
  assert.equal(layout.overflow, false);
  assert.ok(layout.stage.width >= 200 && layout.stage.height >= 200, 'player retains its minimum dimensions');
  assert.ok(layout.tabs.bottom <= layout.front.y, 'business tabs appear above the site cards');
  assert.ok(layout.front.y - layout.tabs.bottom <= 16, 'cards sit immediately below the tabs');
  assert.ok(layout.next.right > layout.front.right && layout.following.right > layout.next.right, 'two upcoming site cards visibly peek out to the right');
  assert.ok(layout.next.x < layout.front.right, 'upcoming cards overlap the active site');
  if (layout.width > 760) {
    assert.ok(layout.copy.width <= 280, 'description leaves more space for films');
    assert.ok(layout.following.right < layout.copy.x, 'stack does not cover the description');
    assert.ok(Math.abs(layout.front.y - layout.copy.y) < 1);
    assert.ok(Math.abs(layout.front.height - layout.copy.height) < 1, 'site card and copy share the same height');
    assert.ok(layout.stage.width < layout.carousel.width * 0.75, 'central video leaves room for neighbouring sites');
    assert.ok(layout.next.right - layout.front.right > 65, 'a meaningful part of the next site remains visible');
  } else {
    assert.ok(layout.copy.y > layout.front.bottom, 'mobile text follows the site without overlap');
  }
  assert.equal(await page.locator('#flowNext').count(), 0, 'next-stage panel is removed');
  return layout;
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
  // Freeze the first script so the parsed HTML itself is checked before setup
  // can replace a stale illustration with a video poster.
  for (const width of [1366, 390]) {
    const initial = await browser.newContext({ viewport: { width, height: 900 } });
    await initial.addInitScript(mockYouTube);
    await initial.route('**/corp-business-videos.json', route => route.fulfill({ json: configuration }));
    let releaseScript;
    const scriptGate = new Promise(resolve => { releaseScript = resolve; });
    await initial.route('**/corp-business-video-player.js', async route => {
      await scriptGate;
      await route.continue().catch(() => {});
    });
    const initialPage = await initial.newPage();
    await initialPage.goto(`${baseUrl}/corp-business-area-preview.html`, { waitUntil: 'commit' });
    await initialPage.locator('#businessVideoStage').waitFor();
    await verifyNoLegacyPoster(initialPage, true);
    assert.equal(await initialPage.locator('#heroTabs [role=tab]').count(), 0, 'initial markup is inspected before scripts run');
    releaseScript();
    await waitForVideo(initialPage, 'testVideo0A');
    await verifyNoLegacyPoster(initialPage);
    await initial.close();
  }
  console.log('PASS initial HTML before scripts: desktop/mobile neutral film stage without legacy images');

  for (const width of [1366, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(mockYouTube);
    await context.route('**/corp-business-videos.json', (route) => route.fulfill({ json: configuration }));
    const page = await context.newPage();
    const errors = [];
    const legacyImages = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', request => {
      if (/\/images\/corp\/(technology|workflows)\//.test(request.url())) legacyImages.push(request.url());
    });
    await page.goto(`${baseUrl}/corp-business-area-preview.html`);
    await waitForVideo(page, 'testVideo0A');
    await verifyNoLegacyPoster(page);
    assert.equal(await page.locator('#videoSourceTitle').textContent(), 'Sample 1');
    assert.equal(await page.locator('#videoSourceCreator').textContent(), 'Demo creator');
    assert.match(await page.locator('#stackNextImage').getAttribute('src'), /testVideo0B/);
    assert.match(await page.locator('#stackFollowingImage').getAttribute('src'), /testVideo1A/);
    assert.equal((await verifyStackLayout(page)).transform, 'none', 'reduced motion disables the film entrance');
    await page.locator('#businessVideoStage').scrollIntoViewIfNeeded();
    await page.locator('#businessVideoAction').click();
    await page.locator('#businessVideoStage').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.testPlayers.at(-1).state === 1);
    assert.deepEqual(await page.evaluate(() => {
      const p = window.testPlayers.at(-1);
      return { muted: p.isMuted(), volume: p.getVolume(), controls: p.parameters.controls, keyboard: p.parameters.disablekb, fullscreen: p.parameters.fs, inert: p.iframe.inert, tabIndex: p.iframe.tabIndex };
    }), { muted: false, volume: 65, controls: 0, keyboard: 1, fullscreen: 0, inert: true, tabIndex: -1 });
    assert.equal(await page.locator('#businessVideoPlayer iframe').evaluate(n => getComputedStyle(n).pointerEvents), 'none');
    await page.locator('#businessVideoPause').click();
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).state), 2);
    await page.locator('#businessVideoPause').click();
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).state), 1);

    assert.equal(await page.locator('#filmRail [role="tab"]').count(), 10);
    assert.equal(await page.locator('#heroTabs [role="tab"]').count(), 5);
    assert.match(await page.locator('#hero-tab-2').textContent(), /생성형 콘텐츠/);
    assert.match(await page.locator('#hero-tab-3').textContent(), /리셀러 파트너/);
    assert.match(await page.locator('#hero-tab-4').textContent(), /기획 에이전트 봇/);
    assert.equal(await page.locator('#heroTotal').textContent(), '05');
    await page.locator('#film-choice-8').click();
    await waitForVideo(page, 'testVideo4A');
    await page.locator('#filmNext').click();
    await waitForVideo(page, 'testVideo4B');
    await page.locator('#filmNext').click();
    await waitForVideo(page, 'testVideo0A');
    await page.locator('#filmPrev').click();
    await waitForVideo(page, 'testVideo4B');
    await page.locator('#film-choice-9').focus();
    await page.keyboard.press('Home');
    await waitForVideo(page, 'testVideo0A');
    await page.keyboard.press('End');
    await waitForVideo(page, 'testVideo4B');
    await page.keyboard.press('ArrowRight');
    await waitForVideo(page, 'testVideo0A');
    assert.equal(await page.locator('#film-choice-0').evaluate(n => n === document.activeElement), true);

    // Main carousel swipes select films; browsing the strip cannot accidentally play one.
    await page.locator('#businessFilmCarousel').scrollIntoViewIfNeeded();
    const carouselBox = await page.locator('#businessFilmCarousel').boundingBox();
    const dragX = carouselBox.x + carouselBox.width / 2;
    const dragY = carouselBox.y + carouselBox.height / 2;
    await page.mouse.click(dragX, dragY);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).id), 'testVideo0A', 'clicking the front cannot select an obscured card');
    await page.mouse.move(dragX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragX - 90, dragY + 3, { steps: 8 });
    await page.mouse.up();
    await waitForVideo(page, 'testVideo0B');
    await page.mouse.move(dragX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragX + 90, dragY, { steps: 8 });
    await page.mouse.up();
    await waitForVideo(page, 'testVideo0A');
    await page.locator('#businessFilmCarousel').focus();
    await page.keyboard.press('ArrowLeft');
    await waitForVideo(page, 'testVideo4B');

    await page.locator('#hero-tab-2').click();
    await page.locator('#filmNext').click();
    await waitForVideo(page, 'testVideo2B');
    assert.match(await page.locator('#heroDescription').textContent(), /이미지·영상·음성/);
    await page.locator('#hero-tab-0').click();
    await waitForVideo(page, 'testVideo0A');

    await page.locator('#filmRail').scrollIntoViewIfNeeded();
    const railBox = await page.locator('#filmRail').boundingBox();
    if (width < 760) {
      await page.mouse.move(railBox.x + railBox.width - 20, railBox.y + 30);
      await page.mouse.down();
      await page.mouse.move(railBox.x + 25, railBox.y + 30, { steps: 8 });
      await page.mouse.up();
      assert.ok(await page.locator('#filmRail').evaluate(n => n.scrollLeft > 0));
      assert.equal(await page.evaluate(() => window.testPlayers.at(-1).id), 'testVideo0A', 'dragging the strip only browses');
    }
    await page.mouse.move(railBox.x + 1, railBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(railBox.x - 10, railBox.y + 20);
    await page.mouse.up();
    await page.mouse.move(railBox.x + 50, railBox.y + 20);
    assert.equal(await page.locator('#filmRail').evaluate(n => n.classList.contains('is-dragging')), false, 'release outside the strip clears a pending gesture');
    await page.locator('#businessVideoStage').scrollIntoViewIfNeeded();

    // The old timer and hover/focus behavior must not cut off a playing video.
    await page.waitForTimeout(5500);
    assert.equal(await page.locator('#heroCurrent').textContent(), '01');
    assert.equal(await page.locator('#media-tab-0').getAttribute('aria-selected'), 'true');

    for (let step = 1; step <= 10; step += 1) {
      await page.evaluate(() => {
        const current = window.testPlayers.at(-1);
        current.emit(1);
        current.emit(0);
        current.emit(0); // Duplicate / late events cannot skip a second slot.
      });
      const index = Math.floor(step / 2) % 5;
      const mode = step % 2;
      await waitForVideo(page, `testVideo${index}${mode ? 'B' : 'A'}`);
      assert.equal(await page.locator('#heroCurrent').textContent(), `0${index + 1}`);
      assert.equal(await page.locator(`#media-tab-${mode}`).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#videoSequence').textContent(), `${String((step % 10) + 1).padStart(2, '0')} / 10`);
      assert.equal(await page.locator(`#film-choice-${step % 10}`).getAttribute('aria-selected'), 'true');
      await verifyStackLayout(page);
      const followingIndex = (index + 1) % 5;
      assert.match(await page.locator('#stackFollowingImage').getAttribute('src'), new RegExp(`testVideo${followingIndex}${mode ? 'B' : 'A'}`));
    }

    await page.evaluate(() => { window.stalePlayer = window.testPlayers.at(-1); });
    await page.locator('#heroNext').click();
    await waitForVideo(page, 'testVideo1A');
    await page.evaluate(() => { window.stalePlayer.emit(1); window.stalePlayer.emit(0); window.stalePlayer.emitReady(); });
    assert.equal(await page.locator('#heroCurrent').textContent(), '02');
    assert.equal(await page.locator('#businessVideoPlayer iframe').count(), 1);

    await page.locator('#media-tab-1').click();
    await waitForVideo(page, 'testVideo1B');
    await page.locator('#heroPrev').click();
    await waitForVideo(page, 'testVideo0A');
    await page.locator('#hero-tab-0').focus();
    await page.keyboard.press('End');
    await waitForVideo(page, 'testVideo4A');
    assert.equal(await page.locator('#hero-tab-4').evaluate((node) => node === document.activeElement), true);
    await page.locator('#media-tab-0').focus();
    await page.keyboard.press('ArrowRight');
    await waitForVideo(page, 'testVideo4B');

    await page.waitForFunction(() => window.testPlayers.at(-1).state === 1);
    await page.evaluate(() => window.testPlayers.at(-1).events.onAutoplayBlocked());
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).isMuted()), false, 'late autoplay failure must not mute successful playback');
    await page.evaluate(() => { const p = window.testPlayers.at(-1); p.state = -1; p.events.onAutoplayBlocked(); });
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).isMuted()), true, 'blocked sound retries silently');
    const fallbackCalls = await page.evaluate(() => window.testPlayers.at(-1).playCalls);
    await page.evaluate(() => { const p = window.testPlayers.at(-1); p.state = -1; p.events.onAutoplayBlocked(); });
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).playCalls), fallbackCalls, 'fallback retries only once');
    assert.equal(await page.locator('#businessVideoAction').isVisible(), true);
    await page.locator('#businessVideoAction').click();
    await page.locator('#businessVideoStage').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.testPlayers.at(-1).state === 1);
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).isMuted()), false, 'sound CTA unmutes and plays');
    assert.equal(await page.locator('#businessVideoAction').isVisible(), false, 'successful playback clears the sound prompt');
    await page.evaluate(() => window.testPlayers.at(-1).events.onError({ data: 150 }));
    assert.match(await page.locator('#businessVideoStatus').textContent(), /재생할 수 없습니다/);
    await page.locator('#businessVideoAction').click();
    await page.locator('#businessVideoStage').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#businessVideoStage').dataset.videoState === 'playing');

    // User sound preference survives a transition to a different player.
    await page.evaluate(() => { const current = window.testPlayers.at(-1); current.unMute(); current.setVolume(37); });
    await page.locator('#heroNext').click();
    await waitForVideo(page, 'testVideo0A');
    await page.waitForFunction(() => window.testPlayers.at(-1).volume === 37);
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).isMuted()), false);
    await page.evaluate(() => {
      const p = window.testPlayers.at(-1);
      // YouTube commands cross an iframe boundary. Simulate stale API audio
      // state even after the site's mute button has already been pressed.
      p.isMuted = () => false;
    });
    await page.locator('#businessVideoSound').click();
    await page.locator('#businessVideoPause').click();
    await page.locator('#businessVideoAction').click();
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).muted), true, 'resume retains intentional mute');
    await page.locator('#media-tab-1').click();
    await waitForVideo(page, 'testVideo0B');
    await page.waitForFunction(() => window.testPlayers.at(-1).state === 1);
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).isMuted()), true, 'intentional mute persists across films');
    await page.locator('#businessVideoSound').click();
    await page.evaluate(() => { const p = window.testPlayers.at(-1); p.state = -1; p.events.onAutoplayBlocked(); });
    await page.locator('#hero-tab-0').click();
    await waitForVideo(page, 'testVideo0A');
    await page.waitForFunction(() => window.testPlayers.at(-1).state === 1);
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).isMuted()), false, 'temporary fallback mute is not a user preference');
    const dimensions = await page.evaluate(() => {
      const stage = document.querySelector('#businessVideoStage').getBoundingClientRect();
      return { width: stage.width, height: stage.height, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(dimensions.width >= 200 && dimensions.height >= 200);
    assert.equal(dimensions.overflow, false);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      window.testPlayers.at(-1).emit(1);
    });
    assert.equal(await page.evaluate(() => window.testPlayers.at(-1).state), 2, 'late playback in a hidden tab must pause');
    await page.evaluate(() => {
      delete document.hidden;
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await waitForVideo(page, 'testVideo0A');
    await page.locator('#businessVideoAction').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#businessVideoPlayer iframe').count(), 1, 'back/forward cache must restore the player');
    assert.deepEqual(errors, []);
    assert.deepEqual(legacyImages, [], 'old company illustrations are never requested during film navigation');
    await page.screenshot({ path: path.join(artifacts, `player-fixture-${width}.png`), fullPage: true });
    await context.close();
    console.log(`PASS ${width}px: 10-step loop, no timer cutoff, stale/duplicate events, controls, keyboard, blocked/error retry, sound, layout`);
  }

  const motion = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'no-preference' });
  await motion.addInitScript(mockYouTube);
  await motion.route('**/corp-business-videos.json', route => route.fulfill({ json: configuration }));
  const motionPage = await motion.newPage();
  await motionPage.goto(`${baseUrl}/corp-business-area-preview.html`);
  await waitForVideo(motionPage, 'testVideo0A');
  await motionPage.locator('#showcaseMedia').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  await motionPage.locator('#hero-tab-1').click();
  await waitForVideo(motionPage, 'testVideo1A');
  await motionPage.waitForFunction(() => document.querySelector('#showcaseMedia').getAnimations().some(a => a.currentTime > 30 && a.currentTime < 500));
  const entering = await motionPage.locator('#showcaseMedia').evaluate(node => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return { x: matrix.m41, z: matrix.m43, opacity: getComputedStyle(node).opacity };
  });
  assert.ok(entering.x > 0 && entering.z < 0, 'film approaches the front from the right');
  assert.equal(entering.opacity, '1', 'entrance never darkens the film');
  assert.equal(await motionPage.locator('.video-stack-card').evaluateAll(cards => cards.filter(card => card.getAnimations().length > 0).length), 4, 'all neighbouring sites turn together during selection');
  await motionPage.locator('#hero-tab-2').click();
  await motionPage.locator('#hero-tab-4').click();
  await waitForVideo(motionPage, 'testVideo4A');
  await motionPage.waitForFunction(() => !document.querySelector('#showcaseMedia').classList.contains('is-entering'));
  assert.equal(await motionPage.locator('#businessVideoPlayer iframe').count(), 1);
  assert.match(await motionPage.locator('#stackNextImage').getAttribute('src'), /testVideo4B/);
  assert.match(await motionPage.locator('#stackFollowingImage').getAttribute('src'), /testVideo0A/);
  assert.equal((await verifyStackLayout(motionPage)).transform, 'none');
  const depth = await motionPage.evaluate(() => {
    const pose = selector => { const matrix = new DOMMatrixReadOnly(getComputedStyle(document.querySelector(selector)).transform); return { z: matrix.m43, turn: matrix.m13 }; };
    return { near: pose('.video-stack-card--next'), far: pose('.video-stack-card--following'), index: document.querySelector('#businessFilmCarousel').dataset.panoramaIndex };
  });
  assert.ok(depth.near.z < 0 && depth.far.z < depth.near.z, 'far sites sit deeper in the panorama');
  assert.ok(Math.abs(depth.far.turn) > Math.abs(depth.near.turn), 'outer sites turn further around the arc');
  assert.equal(depth.index, '4');
  const panoramaBox = await motionPage.locator('#businessFilmCarousel').boundingBox();
  await motionPage.mouse.move(panoramaBox.x + panoramaBox.width - 5, panoramaBox.y + 80);
  assert.ok(Number.parseFloat(await motionPage.locator('#businessFilmCarousel').evaluate(n => n.style.getPropertyValue('--panorama-drift'))) > 0, 'pointer movement gives the background depth');
  await motionPage.emulateMedia({ reducedMotion: 'reduce' });
  await motionPage.waitForFunction(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    && document.querySelector('#businessFilmCarousel').style.getPropertyValue('--panorama-drift') === '', undefined, { timeout: 1000 });
  assert.equal(await motionPage.locator('#businessFilmCarousel').evaluate(n => n.style.getPropertyValue('--panorama-drift')), '', 'reduced motion clears parallax after the media change is delivered');
  await motionPage.mouse.move(panoramaBox.x + 10, panoramaBox.y + 80);
  assert.equal(await motionPage.locator('#businessFilmCarousel').evaluate(n => n.style.getPropertyValue('--panorama-drift')), '');
  await motionPage.emulateMedia({ reducedMotion: 'no-preference' });
  await motionPage.mouse.move(0, 0);
  for (const width of [1024, 820, 768, 761, 319]) {
    await motionPage.setViewportSize({ width, height: 900 });
    await verifyStackLayout(motionPage);
  }
  await motion.close();
  console.log('PASS top tabs, matching panel heights, overlapping cards, right-to-front entrance, reduced motion, rapid selection and narrow layouts');

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(mockYouTube, { deferReady: true });
  await context.route('**/corp-business-videos.json', (route) => route.fulfill({ json: configuration }));
  const page = await context.newPage();
  await page.goto(`${baseUrl}/corp-business-area-preview.html`);
  await waitForVideo(page, 'testVideo0A');
  await page.locator('#heroNext').click();
  await page.locator('#heroNext').click();
  await waitForVideo(page, 'testVideo2A');
  await page.evaluate(() => { window.testPlayers.forEach((player) => player.emitReady()); });
  assert.equal(await page.locator('#heroCurrent').textContent(), '03');
  assert.equal(await page.locator('#businessVideoPlayer iframe').count(), 1);
  await context.close();
  console.log('PASS delayed readiness and rapid navigation');

  const shortScreen = await browser.newContext({ viewport: { width: 390, height: 667 }, reducedMotion: 'reduce' });
  await shortScreen.addInitScript(mockYouTube);
  await shortScreen.route('**/corp-business-videos.json', route => route.fulfill({ json: configuration }));
  const shortPage = await shortScreen.newPage();
  await shortPage.goto(`${baseUrl}/corp-business-area-preview.html`);
  await waitForVideo(shortPage, 'testVideo0A');
  await shortPage.locator('#hero-tab-4').click();
  await waitForVideo(shortPage, 'testVideo4A');
  await shortPage.waitForFunction(() => window.testPlayers.at(-1).state === 1);
  const beforeAutomatic = await shortPage.evaluate(() => window.scrollY);
  await shortPage.evaluate(() => window.testPlayers.at(-1).emit(0));
  await waitForVideo(shortPage, 'testVideo4B');
  await shortPage.waitForFunction(() => window.testPlayers.at(-1).state === 1);
  assert.equal(await shortPage.evaluate(() => window.scrollY), beforeAutomatic, 'automatic transitions do not force page scroll');
  await shortPage.locator('#hero-tab-4').focus();
  await shortPage.keyboard.press('Home');
  await waitForVideo(shortPage, 'testVideo0A');
  await shortPage.waitForFunction(() => window.testPlayers.at(-1).state === 1);
  await shortScreen.close();
  console.log('PASS short-screen click/keyboard selection reveals video; automatic end preserves scroll');

  const touch = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await touch.addInitScript(mockYouTube);
  await touch.route('**/corp-business-videos.json', route => route.fulfill({ json: configuration }));
  const touchPage = await touch.newPage();
  await touchPage.goto(`${baseUrl}/corp/company/product-introduction`);
  const outer = touchPage.locator('[data-business-area-preview]');
  await outer.waitFor();
  const touchFrame = await (await outer.elementHandle()).contentFrame();
  await waitForVideo(touchFrame, 'testVideo0A');
  const touchClient = await touch.newCDPSession(touchPage);
  async function swipe(x, y, dx, dy) {
    await touchClient.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await touchClient.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8 }] });
      await touchPage.waitForTimeout(16);
    }
    await touchClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const outerScroll = () => outer.evaluate(n => n.closest('main').scrollTop);
  await touchFrame.locator('#businessVideoStage').scrollIntoViewIfNeeded();
  let touchBox = await touchFrame.locator('#businessVideoStage').boundingBox();
  const initialScroll = await outerScroll();
  await swipe(touchBox.x + touchBox.width - 35, touchBox.y + 90, -150, 3);
  await waitForVideo(touchFrame, 'testVideo0B');
  assert.ok(Math.abs(await outerScroll() - initialScroll) < 2, 'horizontal film swipe does not scroll the page');
  await touchFrame.locator('#filmRail').scrollIntoViewIfNeeded();
  touchBox = await touchFrame.locator('#filmRail').boundingBox();
  const beforeRailScroll = await outerScroll();
  await swipe(touchBox.x + touchBox.width - 25, touchBox.y + 30, -180, 3);
  assert.ok(await touchFrame.locator('#filmRail').evaluate(n => n.scrollLeft > 0), 'native touch scroll browses the filmstrip');
  assert.equal(await touchFrame.evaluate(() => window.testPlayers.at(-1).id), 'testVideo0B');
  assert.ok(Math.abs(await outerScroll() - beforeRailScroll) < 2);
  await touchFrame.locator('#businessVideoStage').scrollIntoViewIfNeeded();
  touchBox = await touchFrame.locator('#businessVideoStage').boundingBox();
  const beforeVertical = await outerScroll();
  await swipe(touchBox.x + touchBox.width / 2, touchBox.y + 150, 2, -90);
  assert.ok(await outerScroll() > beforeVertical + 30, 'vertical touch still scrolls the outer page');
  assert.equal(await touchFrame.evaluate(() => window.testPlayers.at(-1).id), 'testVideo0B');
  await touch.close();
  console.log('PASS real touch events: swipe selection, native horizontal filmstrip and preserved vertical outer-page scroll');

  const unavailable = await browser.newContext({ reducedMotion: 'reduce' });
  await unavailable.route('**/corp-business-videos.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  const unavailablePage = await unavailable.newPage();
  await unavailablePage.goto(`${baseUrl}/corp-business-area-preview.html`);
  await verifyNoLegacyPoster(unavailablePage, true);
  await unavailablePage.locator('#filmNext').click();
  await unavailablePage.waitForFunction(() => document.querySelector('#videoSequence').textContent === '02 / 10');
  assert.equal(await unavailablePage.locator('#filmGalleryCount').textContent(), '02 / 10');
  assert.equal(await unavailablePage.locator('#film-choice-1').getAttribute('aria-selected'), 'true');
  assert.equal(await unavailablePage.locator('#filmRail [tabindex="0"]').count(), 1);
  await unavailable.close();
  console.log('PASS failed configuration preserves selected-film feedback and roving focus');

  const stalled = await browser.newContext();
  await stalled.addInitScript(mockYouTube);
  await stalled.route('**/corp-business-videos.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 11000));
    await route.fulfill({ json: configuration }).catch(() => {});
  });
  const slowPage = await stalled.newPage();
  await slowPage.goto(`${baseUrl}/corp-business-area-preview.html`);
  await slowPage.waitForFunction(() => document.querySelector('#businessVideoStage').dataset.videoState === 'loading');
  await verifyNoLegacyPoster(slowPage, true);
  await slowPage.locator('#hero-tab-2').click();
  await slowPage.waitForFunction(() => document.querySelector('#heroCurrent').textContent === '03');
  await verifyNoLegacyPoster(slowPage, true);
  await slowPage.locator('#hero-tab-0').click();
  await slowPage.waitForFunction(() => document.querySelector('#heroCurrent').textContent === '01');
  await verifyNoLegacyPoster(slowPage, true);
  await slowPage.locator('#businessVideoAction').waitFor({ state: 'visible', timeout: 14000 });
  assert.match(await slowPage.locator('#businessVideoStatus').textContent(), /불러오지 못했습니다/);
  await verifyNoLegacyPoster(slowPage, true);
  await stalled.unroute('**/corp-business-videos.json');
  await stalled.route('**/corp-business-videos.json', (route) => route.fulfill({ json: configuration }));
  await slowPage.locator('#businessVideoAction').click();
  await waitForVideo(slowPage, 'testVideo0A');
  await verifyNoLegacyPoster(slowPage);
  await stalled.close();
  console.log('PASS stalled configuration request times out and retries');

  const empty = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await empty.route('**/corp-business-videos.json', (route) => route.fulfill({ json: {} }));
  await empty.goto(`${baseUrl}/corp-business-area-preview.html`);
  await empty.getByText('이 단계의 소개 영상을 준비 중입니다.', { exact: false }).waitFor();
  assert.equal(await empty.locator('#businessVideoPlayer iframe').count(), 0);
  await verifyNoLegacyPoster(empty, true);
  await empty.locator('#heroNext').click();
  await empty.waitForFunction(() => document.querySelector('#heroCurrent').textContent === '02');
  await empty.waitForFunction(() => Number(getComputedStyle(document.querySelector('#heroTitle')).opacity) === 1);
  await empty.screenshot({ path: path.join(artifacts, 'empty-mobile.png'), fullPage: true });
  await empty.close();
  console.log('PASS missing video configuration retains manual navigation without loading YouTube');
} finally {
  await browser.close();
}
