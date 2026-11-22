import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const base = process.env.BASE_URL || 'http://localhost:3002';
const output = path.resolve(process.env.OUTPUT_DIR ? path.join(process.env.OUTPUT_DIR, 'content') : '.tmp-product-motion-v4');
const productPath = '/corp/company/product-introduction';
const defaultFilm = { id: 'five-second-shift', title: '출근 5초 만에 방전' };
const duckFilm = { id: 'duck-director', title: '오리 감독의 첫 촬영' };
const filmAsset = (film, extension) => `/videos/corp/youtube-${film.id}.${extension}`;
const originalVideoId = 'k56Wglp9hI4';
const tiktokVideoId = 'eiivhfQJFOA';
const viewports = [{ width: 1440, height: 1100 }, { width: 390, height: 844 }];
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

const activate = (locator, mobile) => mobile ? locator.tap() : locator.click();

function expectNoExternalRequests(requests) {
  assert.deepEqual(requests, [], 'The native default does not request the YouTube iframe API or embeds.');
}

function externalRequests(page) {
  const requests = [];
  page.on('request', request => {
    const { hostname, pathname } = new URL(request.url());
    if ((hostname === 'www.youtube.com' && pathname === '/iframe_api')
      || (hostname === 'www.youtube-nocookie.com' && pathname.startsWith('/embed/'))) requests.push(request.url());
  });
  return requests;
}

function nativeRequests(page) {
  const requests = [];
  const sources = new Set([filmAsset(defaultFilm, 'mp4'), filmAsset(duckFilm, 'mp4')]);
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (sources.has(pathname)) requests.push(pathname);
  });
  return requests;
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

async function currentExternalVideo(studio, id) {
  const video = studio.locator(`[data-video-id="${id}"]`);
  await video.locator('iframe[data-youtube-player]').waitFor();
  assert.equal(await studio.locator('[data-video-id]').count(), 1, 'Only the selected channel mounts a media player.');
  return video;
}

async function externalOutcome(page, id) {
  const settled = await page.waitForFunction(id => {
    const player = document.querySelector(`[data-video-id="${id}"]`);
    if (player?.dataset.playerStatus === 'error') return 'unavailable';
    return player?.dataset.playerStatus === 'ready' && 'ready';
  }, id, { timeout: 25000 });
  try { return await settled.jsonValue(); } finally { await settled.dispose(); }
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

const nativePlayer = (studio, film = defaultFilm) => studio.locator(`[data-video-id="${film.id}"]`);
const nativeVideo = (studio, film = defaultFilm) => nativePlayer(studio, film).locator('video[data-grok-video]');
const filmPicker = studio => studio.getByRole('combobox', { name: 'YouTube 영상 선택', exact: true });

async function selectFilm(picker, id, key, mobile) {
  if (mobile) {
    await picker.tap();
    // The mobile browser owns the native options popup. Select its option by value.
    await picker.selectOption(id);
  } else {
    await picker.focus();
    await picker.press(key);
    assert.equal(await picker.evaluate(element => document.activeElement === element), true, 'Choosing an edition preserves keyboard focus.');
  }
  assert.equal(await picker.inputValue(), id);
}

async function nativeSnapshot(video) {
  return video.evaluate(element => {
    const { width, height } = element.getBoundingClientRect();
    const track = element.querySelector('track[kind="captions"][srclang="ko"]');
    return {
      source: element.currentSrc && new URL(element.currentSrc).pathname,
      poster: element.poster && new URL(element.poster).pathname,
      caption: track?.src && new URL(track.src).pathname,
      currentTime: element.currentTime, duration: element.duration, paused: element.paused, muted: element.muted,
      videoWidth: element.videoWidth, videoHeight: element.videoHeight, width, height, inline: element.playsInline,
    };
  });
}

async function assertNativeAdvances(page, video, film = defaultFilm) {
  await page.waitForFunction(() => {
    const media = document.querySelector('video[data-grok-video]');
    return media && !media.paused && media.readyState >= 2 && media.videoWidth > 0 && media.currentTime > 0;
  });
  const before = await nativeSnapshot(video);
  await page.waitForFunction(start => {
    const media = document.querySelector('video[data-grok-video]');
    return media && !media.paused && media.currentTime > start + .25;
  }, before.currentTime, { timeout: 8000 });
  const after = await nativeSnapshot(video);
  assert.equal(after.source, filmAsset(film, 'mp4'), 'The decoded media comes from the selected local MP4.');
  assert.ok(Math.abs(after.duration - 20) < .12 && Math.abs(after.videoWidth / after.videoHeight - 9 / 16) < .005,
    `The MP4 decodes as a 20-second vertical Short: ${JSON.stringify(after)}`);
  assert.equal(after.paused, false);
  return after;
}

async function assertNativePaused(page, video) {
  await page.waitForFunction(() => {
    const media = document.querySelector('video[data-grok-video]');
    return media && media.paused && !media.seeking;
  });
  const before = await nativeSnapshot(video);
  await page.waitForTimeout(350);
  const after = await nativeSnapshot(video);
  assert.equal(after.paused, true);
  assert.ok(Math.abs(after.currentTime - before.currentTime) < .05, 'Pausing freezes the native Short at the selected position.');
}

async function verifyPortraitStage(player, media) {
  assert.equal(await player.locator('[data-portrait-stage]').count(), 1, 'The selected player has one shared portrait stage.');
  assert.equal(await player.locator('[data-portrait-controls]').count(), 1, 'The portrait player exposes the common transport.');
  const layout = await media.evaluate(element => {
    const device = element.closest('[data-portrait-device]');
    const stage = device?.closest('[data-portrait-stage]');
    if (!stage) return null;
    const picture = element.getBoundingClientRect();
    const shell = device.getBoundingClientRect();
    const surface = stage.getBoundingClientRect();
    const surround = getComputedStyle(device);
    const contains = (outer, inner) => outer.left <= inner.left + 1 && outer.right >= inner.right - 1
      && outer.top <= inner.top + 1 && outer.bottom >= inner.bottom - 1;
    return {
      width: picture.width, height: picture.height, fitsDevice: contains(shell, picture), fitsStage: contains(surface, picture),
      objectFit: element instanceof HTMLVideoElement ? getComputedStyle(element).objectFit : null,
      theme: { stage: getComputedStyle(stage).backgroundColor, bezel: surround.borderColor, radius: surround.borderRadius },
    };
  });
  assert.ok(layout?.fitsDevice && layout.fitsStage, 'The portrait device shows the whole media surface.');
  assert.ok(Math.abs(layout.width / layout.height - 9 / 16) < .025, `The shared device keeps the 9:16 picture: ${JSON.stringify(layout)}`);
  if (layout.objectFit !== null) assert.equal(layout.objectFit, 'contain', 'The native Short shows the full frame.');
  return layout;
}

async function verifyNativeAssets(page, video, film = defaultFilm) {
  const state = await nativeSnapshot(video);
  assert.equal(await video.getAttribute('aria-label'), film.title);
  assert.equal(state.poster, filmAsset(film, 'webp'));
  assert.equal(state.caption, filmAsset(film, 'vtt'));
  assert.equal(state.inline, true, 'The Short plays inline on phones.');
  assert.ok(state.width > 0 && state.height > 0 && Math.abs(state.width / state.height - 9 / 16) < .025,
    `The player keeps the 9:16 presentation: ${JSON.stringify(state)}`);
  const posterRatio = await page.evaluate(async url => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth / image.naturalHeight;
  }, state.poster);
  assert.ok(Math.abs(posterRatio - 9 / 16) < .005, 'The vertical poster loads.');
  const subtitles = await page.request.get(new URL(state.caption, base).href);
  assert.ok(subtitles.ok(), 'The Korean captions are available from the same host.');
  assert.match(await subtitles.text(), /^\s*WEBVTT\b/);
}

async function readKoreanCues(page) {
  const result = await page.waitForFunction(() => {
    const track = document.querySelector('video[data-grok-video] track[srclang="ko"]')?.track;
    const cues = Array.from(track?.cues ?? []);
    return track?.mode === 'showing' && cues.some(cue => /[가-힣]/.test(cue.text))
      && cues.map(cue => ({ text: cue.text, start: cue.startTime, end: cue.endTime }));
  });
  try { return await result.jsonValue(); } finally { await result.dispose(); }
}

async function verifyNativeChannel(page, showcase, studio, mobile, requests) {
  const media = nativeVideo(studio);
  const selector = filmPicker(studio);
  await media.waitFor();
  assert.equal(await selector.inputValue(), defaultFilm.id);
  assert.deepEqual(await selector.locator('option').evaluateAll(options => options.map(option => option.value)), [defaultFilm.id, duckFilm.id, 'original']);
  assert.equal((await selector.locator('option:checked').textContent()).trim(), defaultFilm.title);
  assert.equal(await studio.locator('iframe[data-youtube-player]').count(), 0);
  await ensurePlayback(showcase, true);
  await media.scrollIntoViewIfNeeded();
  const started = await assertNativeAdvances(page, media);
  assert.equal(started.muted, true);
  await verifyNativeAssets(page, media);
  const portrait = await verifyPortraitStage(nativePlayer(studio), media);
  await ensurePlayback(showcase, false);
  await assertNativePaused(page, media);
  const captions = studio.getByRole('button', { name: '한국어 자막', exact: true });
  const cues = await readKoreanCues(page);
  const typing = cues.find(cue => cue.start < 8 && /키보드|타자|타이핑|두드|입력/.test(cue.text));
  const tired = cues.find(cue => typing && cue.start >= typing.end - .05 && /방전|지쳤|지쳐|피곤|탈진|하품|꾸벅|엎드|힘이 빠|눈을 감/.test(cue.text));
  assert.ok(typing && tired, `The Korean cues describe eager typing before the tired punchline: ${JSON.stringify(cues)}`);
  for (const [pressed, mode] of [['false', 'hidden'], ['true', 'showing']]) {
    await activate(captions, mobile);
    await page.waitForFunction(mode => document.querySelector('video[data-grok-video] track[srclang="ko"]')?.track.mode === mode, mode);
    assert.equal(await captions.getAttribute('aria-pressed'), pressed);
  }
  await activate(studio.getByRole('button', { name: 'YouTube 소리 켜기', exact: true }), mobile);
  assert.equal((await nativeSnapshot(media)).muted, false);
  await activate(studio.getByRole('button', { name: 'YouTube 소리 끄기', exact: true }), mobile);
  assert.equal((await nativeSnapshot(media)).muted, true);
  assert.equal(await studio.locator('[data-content-brand-strip]').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0, 'Global pause also freezes channel motion.');

  await activate(studio.getByRole('button', { name: 'YouTube 영상 재생', exact: true }), mobile);
  await assertNativeAdvances(page, media);
  await activate(studio.getByRole('button', { name: 'YouTube 영상 일시정지', exact: true }), mobile);
  await assertNativePaused(page, media);
  const slider = studio.getByRole('slider', { name: 'YouTube 영상 재생 위치', exact: true });
  if (mobile) {
    const bounds = await slider.boundingBox();
    await slider.tap({ position: { x: Math.round(bounds.width / 2), y: Math.round(bounds.height / 2) } });
  } else {
    await slider.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
  }
  const sought = await page.waitForFunction(mobile => {
    const video = document.querySelector('video[data-grok-video]');
    if (!video || !video.paused || video.seeking) return false;
    const time = video.currentTime;
    return (mobile ? time > 7 && time < 13 : time > .02 && time < .3) && time;
  }, mobile, { timeout: 6000 });
  const seekTime = await sought.jsonValue();
  await sought.dispose();
  await activate(studio.getByRole('button', { name: 'YouTube 영상 재생', exact: true }), mobile);
  const resumed = await assertNativeAdvances(page, media);
  assert.ok(resumed.currentTime > seekTime, 'Playing after seeking continues from the selected position.');
  expectNoExternalRequests(requests);
  return { channel: 'YouTube', clip: defaultFilm.id, playback: 'native', started, resumed, portrait, captions: { typing, tired }, seek: { input: mobile ? 'touch' : 'keyboard', time: seekTime } };
}

async function verifyDuckFilm(page, showcase, studio, mobile, requests) {
  await ensurePlayback(showcase, false);
  const previous = nativeVideo(studio);
  await assertNativePaused(page, previous);
  const previousTime = (await nativeSnapshot(previous)).currentTime;
  assert.ok(previousTime > .25);
  assert.ok(requests.includes(filmAsset(defaultFilm, 'mp4')), 'Opening YouTube plays the default film.');
  assert.ok(!requests.includes(filmAsset(duckFilm, 'mp4')), 'The previous film stays unloaded while the default plays.');

  const selector = filmPicker(studio);
  await selectFilm(selector, duckFilm.id, 'ArrowDown', mobile);
  const video = nativeVideo(studio, duckFilm);
  await video.waitFor();
  assert.equal(await previous.count(), 0, 'The previous edition unmounts when switching films.');
  assert.equal(await studio.locator('iframe[data-youtube-player]').count(), 0);
  assert.equal((await selector.locator('option:checked').textContent()).trim(), duckFilm.title);
  await assertNativePaused(page, video);
  const initial = await nativeSnapshot(video);
  assert.equal(initial.currentTime, 0, 'The other film has a fresh playhead.');
  assert.equal(initial.source, '', 'The selected poster stays paused until the user presses play.');
  assert.ok(!requests.includes(filmAsset(duckFilm, 'mp4')), 'Selecting a film while paused does not fetch its MP4.');
  await verifyNativeAssets(page, video, duckFilm);
  const portrait = await verifyPortraitStage(nativePlayer(studio, duckFilm), video);
  await activate(studio.getByRole('button', { name: 'YouTube 영상 재생', exact: true }), mobile);
  await video.scrollIntoViewIfNeeded();
  const started = await assertNativeAdvances(page, video, duckFilm);
  assert.ok(requests.includes(filmAsset(duckFilm, 'mp4')));
  assert.ok((await readKoreanCues(page)).some(cue => cue.text.includes('오리')), 'The previous film retains its Korean captions.');
  await ensurePlayback(showcase, false);
  await assertNativePaused(page, video);
  return { clip: duckFilm.id, previousTime, startTime: initial.currentTime, started, portrait, firstDownload: 'on play' };
}

async function assertExternalError(video, source) {
  await video.getByText('영상을 불러오지 못했습니다.', { exact: true }).waitFor();
  await video.getByRole('button', { name: '다시 불러오기', exact: true }).waitFor();
  assert.equal(await video.getByRole('link', { name: 'YouTube에서 보기', exact: true }).getAttribute('href'), source);
}

async function verifyExternalChannel(page, showcase, studio, { channel, id }, mobile) {
  await ensurePlayback(showcase, false);
  const video = await currentExternalVideo(studio, id);
  const media = await mediaSnapshot(video);
  const portrait = channel === 'TikTok' ? await verifyPortraitStage(video, video.locator('iframe[data-youtube-player]')) : null;
  const source = `https://youtube.com/shorts/${id}`;
  const brand = channel.toLowerCase();
  assert.equal(media.id, id);
  assert.ok(media.width >= 200 && media.height >= 200, `${channel} meets YouTube minimum player dimensions.`);
  assert.equal(await studio.locator(`[data-video-window-brand="${brand}"]`).innerText(), channel);
  assert.ok((await video.locator(`[data-video-brand="${brand}"]`).innerText()).includes(channel), 'Video details name the selected channel.');
  assert.equal(await video.locator(`[data-video-brand="${brand}"] [data-channel-logo="${brand}"] svg`).count(), 1);
  assert.equal(media.muted, true);
  assert.equal(media.loop, true);
  assert.equal(media.inline, true);
  assert.ok(media.src.startsWith(`https://www.youtube-nocookie.com/embed/${id}?`), 'The selected channel embeds the requested Short.');
  assert.equal(await studio.getByRole('link', { name: `${channel} 원본 영상 보기`, exact: true }).getAttribute('href'), source);
  if (await externalOutcome(page, id) === 'unavailable') {
    await assertExternalError(video, source);
    return { channel, id, media: await mediaSnapshot(video), portrait, playback: 'external unavailable', retryAndOriginalLink: 'visible' };
  }

  await ensurePlayback(showcase, true);
  await studio.scrollIntoViewIfNeeded();
  const blocked = video.getByRole('button', { name: '영상 재생', exact: true });
  if (await blocked.isVisible()) await activate(blocked, mobile);
  const playing = await assertVideoAdvances(page, video);
  assert.ok(playing.duration >= 14 && playing.duration <= 17, 'The linked Shorts expose their real duration.');
  await ensurePlayback(showcase, false);
  await assertVideoPaused(page, video);
  await activate(studio.getByRole('button', { name: `${channel} 소리 켜기`, exact: true }), mobile);
  assert.equal((await mediaSnapshot(video)).muted, false);
  await activate(studio.getByRole('button', { name: `${channel} 소리 끄기`, exact: true }), mobile);
  assert.equal((await mediaSnapshot(video)).muted, true);
  assert.equal(await studio.locator('[data-content-brand-strip]').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0);
  await ensurePlayback(showcase, true);
  await studio.scrollIntoViewIfNeeded();
  await assertVideoAdvances(page, video);
  await activate(studio.getByRole('button', { name: `${channel} 영상 일시정지`, exact: true }), mobile);
  await assertVideoPaused(page, video);
  const slider = studio.getByRole('slider', { name: `${channel} 영상 재생 위치`, exact: true });
  await slider.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(id => Number(document.querySelector(`[data-video-id="${id}"]`)?.getAttribute('data-player-time')) < .6, id, { timeout: 5000 });
  assert.ok((await mediaSnapshot(video)).currentTime < .6, 'The external player reaches the keyboard seek position.');
  await activate(studio.getByRole('button', { name: `${channel} 영상 재생`, exact: true }), mobile);
  await assertVideoAdvances(page, video);
  return { channel, id, media: playing, portrait, playback: 'external', overallPause: 'pass', playerControls: 'pass', keyboardSeek: 'pass' };
}

async function verifyReducedNative(browser, viewport, mobile) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    const errors = recordErrors(page);
    const embeds = externalRequests(page);
    const clips = nativeRequests(page);
    const entry = new URL(`${productPath}?channel=youtube#product-business-panorama`, base);
    const response = await page.goto(entry.href, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    const showcase = page.locator('#product-business-panorama');
    await page.waitForFunction(() => {
      const roots = document.querySelectorAll('#product-business-panorama');
      return roots.length === 1 && roots[0].dataset.reducedMotion === 'true' && roots[0].dataset.stepId === 'youtube';
    });
    const studio = showcase.locator('[data-content-studio]');
    const video = nativeVideo(studio);
    await video.waitFor();
    await video.scrollIntoViewIfNeeded();
    await assertNativePaused(page, video);
    await verifyNativeAssets(page, video);
    assert.equal((await nativeSnapshot(video)).source, '', 'Reduced-motion entry leaves only the poster before play.');
    assert.deepEqual(clips, [], 'Reduced-motion entry does not download either MP4.');
    assert.equal(await showcase.getAttribute('data-running'), 'false');
    await activate(studio.getByRole('button', { name: 'YouTube 영상 재생', exact: true }), mobile);
    const media = await assertNativeAdvances(page, video);
    assert.ok(clips.length > 0 && clips.every(source => source === filmAsset(defaultFilm, 'mp4')), 'User activation requests only the selected clip.');
    assert.equal(await showcase.getAttribute('data-running'), 'false', 'Manual play respects the stopped reduced-motion tour.');
    await activate(studio.getByRole('button', { name: 'YouTube 영상 일시정지', exact: true }), mobile);
    await assertNativePaused(page, video);
    expectNoExternalRequests(embeds);
    assert.deepEqual(errors, []);
    await assertNoOverflow(page);
    return { directEntry: 'pass', firstDownload: 'on play', videoRequests: clips.length, media };
  } finally { await context.close(); }
}

async function verifyMediaRecovery(browser, viewport) {
  const mobile = viewport.width === 390;
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference' });
  try {
    await context.addInitScript(() => {
      const nativeFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => nativeFrame(timestamp => callback(timestamp - 40));
    });
    const page = await context.newPage();
    const errors = recordErrors(page);
    let blockVideo = true;
    let nativeRequests = 0;
    let blockApi = true;
    let apiRequests = 0;
    await page.route(`**${filmAsset(defaultFilm, 'mp4')}`, route => {
      nativeRequests++;
      return blockVideo ? route.abort('failed') : route.continue();
    });
    if (!mobile) await page.route('https://www.youtube.com/iframe_api', route => {
      apiRequests++;
      return blockApi ? route.abort('failed') : route.continue();
    });
    const response = await page.goto(new URL(productPath, base).href, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    const showcase = page.locator('#product-business-panorama');
    await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-running') === 'true');
    await showcase.locator('h3').waitFor();
    await page.waitForTimeout(1000);
    assert.equal(await showcase.getAttribute('data-chapter'), '0', 'An early animation timestamp keeps the tour on its first valid chapter.');
    await selectChapter(page, showcase, 2);
    const studio = showcase.locator('[data-content-studio]');
    const failedNative = studio.locator(`[data-video-id="${defaultFilm.id}"][data-player-status="error"]`);
    await failedNative.getByText('영상을 불러오지 못했습니다.', { exact: true }).waitFor();
    const failedRequests = nativeRequests;
    assert.ok(failedRequests > 0);
    assert.equal(await studio.locator('iframe[data-youtube-player]').count(), 0, 'The local failure stays in the native player.');
    assert.equal(apiRequests, 0);
    blockVideo = false;
    await activate(failedNative.getByRole('button', { name: '다시 불러오기', exact: true }), mobile);
    const video = nativeVideo(studio);
    await video.scrollIntoViewIfNeeded();
    const recovered = await assertNativeAdvances(page, video);
    assert.ok(nativeRequests > failedRequests, 'Native retry requests and decodes the MP4 again.');

    let externalRetry;
    if (!mobile) {
      await ensurePlayback(showcase, false);
      await studio.getByRole('combobox', { name: 'YouTube 영상 선택', exact: true }).selectOption('original');
      const original = await currentExternalVideo(studio, originalVideoId);
      const source = `https://youtube.com/shorts/${originalVideoId}`;
      await assertExternalError(original, source);
      blockApi = false;
      await original.getByRole('button', { name: '다시 불러오기', exact: true }).click();
      await ensurePlayback(showcase, false);
      const status = await externalOutcome(page, originalVideoId);
      assert.ok(apiRequests >= 2, 'Retry requests the original iframe API again.');
      if (status === 'unavailable') {
        await assertExternalError(original, source);
        externalRetry = 'external unavailable; retry and original link remain visible';
      } else {
        await ensurePlayback(showcase, true);
        await studio.scrollIntoViewIfNeeded();
        await assertVideoAdvances(page, original);
        externalRetry = 'external playback recovered';
      }
    }
    assert.deepEqual(errors, []);
    return { viewport, earlyFrameTimestamp: 'pass', nativeRequests, recovered, externalRetry, errors };
  } finally { await context.close(); }
}

try {
  for (const viewport of viewports) {
    const mobile = viewport.width === 390;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = recordErrors(page);
    const embedRequests = externalRequests(page);
    const clips = nativeRequests(page);
    const facts = { viewport, channels: [], services: [], accessibility: [] };
    try {
      const response = await page.goto(new URL(productPath, base).href, { waitUntil: 'domcontentloaded' });
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
      assert.deepEqual(clips, [], 'The initial product scene does not download either YouTube film.');
      await selectChapter(page, showcase, 2);
      const studio = showcase.locator('[data-content-studio]');
      await studio.waitFor();
      const tabs = studio.getByRole('tab');
      assert.equal(await tabs.count(), 4);
      assert.equal(await tabs.locator('[data-channel-logo] svg').count(), 4, 'Each channel tab has a visible channel mark.');
      assert.equal(await showcase.getByRole('link', { name: '콘텐츠 제품 보기', exact: true }).count(), 0);
      assert.equal(await tabs.evaluateAll(items => items.filter(item => item.tabIndex === 0).length), 1, 'Channel tabs use roving tabIndex.');

      await activate(studio.getByRole('tab', { name: 'YouTube', exact: true }), mobile);
      assert.equal(await studio.locator('[data-content-brand-strip]').getAttribute('data-active-channel'), 'youtube');
      assert.equal(await studio.locator('[data-channel-stop][data-active="true"]').getAttribute('data-channel-stop'), 'youtube');
      assert.equal(await studio.locator('[data-video-window-brand="youtube"]').innerText(), 'YouTube');
      facts.channels.push(await verifyNativeChannel(page, showcase, studio, mobile, embedRequests));
      await page.screenshot({ path: path.join(output, `content-${viewport.width}-youtube.png`) });
      facts.accessibility.push({ channel: 'YouTube', clip: defaultFilm.id, violations: await inspectAccessibility(page, '#product-business-panorama') });
      await assertNoOverflow(page);
      facts.duckYouTube = await verifyDuckFilm(page, showcase, studio, mobile, clips);
      assert.deepEqual(facts.duckYouTube.portrait.theme, facts.channels[0].portrait.theme, 'Both native editions use the same portrait theme.');
      expectNoExternalRequests(embedRequests);
      await page.screenshot({ path: path.join(output, `content-${viewport.width}-youtube-duck.png`) });
      facts.accessibility.push({ channel: 'YouTube', clip: duckFilm.id, violations: await inspectAccessibility(page, '#product-business-panorama') });
      await assertNoOverflow(page);

      const selector = filmPicker(studio);
      await selectFilm(selector, 'original', 'End', mobile);
      assert.equal(await studio.locator('video[data-grok-video]').count(), 0, 'Selecting the original unmounts the native player.');
      await studio.scrollIntoViewIfNeeded();
      facts.originalYouTube = await verifyExternalChannel(page, showcase, studio, { channel: 'YouTube', id: originalVideoId }, mobile);
      await page.screenshot({ path: path.join(output, `content-${viewport.width}-youtube-original.png`) });
      facts.accessibility.push({ channel: 'YouTube', clip: 'original', violations: await inspectAccessibility(page, '#product-business-panorama') });
      await selectFilm(selector, defaultFilm.id, 'Home', mobile);
      await nativeVideo(studio).waitFor();
      assert.equal(await studio.locator('iframe[data-youtube-player]').count(), 0, 'Returning to the native Short removes the embed.');

      await activate(studio.getByRole('tab', { name: 'TikTok', exact: true }), mobile);
      assert.equal(await studio.locator('[data-content-brand-strip]').getAttribute('data-active-channel'), 'tiktok');
      assert.equal(await studio.locator('[data-channel-stop][data-active="true"]').getAttribute('data-channel-stop'), 'tiktok');
      await studio.scrollIntoViewIfNeeded();
      const tiktokPlayback = await verifyExternalChannel(page, showcase, studio, { channel: 'TikTok', id: tiktokVideoId }, mobile);
      assert.deepEqual(tiktokPlayback.portrait.theme, facts.channels[0].portrait.theme, 'YouTube and TikTok use the same portrait stage and device treatment.');
      facts.channels.push(tiktokPlayback);
      await page.screenshot({ path: path.join(output, `content-${viewport.width}-tiktok.png`) });
      facts.accessibility.push({ channel: 'TikTok', violations: await inspectAccessibility(page, '#product-business-panorama') });

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
      assert.equal(await studio.locator('iframe[data-youtube-player], video[data-grok-video]').count(), 0, 'Leaving a video channel unmounts the active player.');
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
      await ensurePlayback(showcase, false);
      const tiktok = await currentExternalVideo(studio, tiktokVideoId);
      if (await externalOutcome(page, tiktokVideoId) === 'unavailable') {
        await assertExternalError(tiktok, `https://youtube.com/shorts/${tiktokVideoId}`);
      }
      await ensurePlayback(showcase, true);
      await studio.scrollIntoViewIfNeeded();
      const cycle = Number(await showcase.getAttribute('data-cycle'));
      await page.waitForFunction(previous => Number(document.querySelector('#product-business-panorama')?.getAttribute('data-cycle')) > previous, cycle, { timeout: 25_000 });
      assert.equal(await showcase.getAttribute('data-chapter'), '2');
      assert.equal(await studio.getByRole('tab', { name: '블로그', exact: true }).getAttribute('aria-selected'), 'true', 'TikTok continues into the next content channel.');
      assert.equal(await studio.locator('iframe[data-youtube-player]').count(), 0, 'The finished video unmounts on the blog channel.');
      facts.channelTransition = 'pass';

      await activate(studio.getByRole('tab', { name: 'YouTube', exact: true }), mobile);
      const resumedNative = nativeVideo(studio);
      await ensurePlayback(showcase, true);
      await resumedNative.scrollIntoViewIfNeeded();
      await assertNativeAdvances(page, resumedNative);
      await page.locator('#product-catalog').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('#product-business-panorama')?.getAttribute('data-running') === 'false');
      await assertNativePaused(page, resumedNative);
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

      facts.reducedMotion = await verifyReducedNative(browser, viewport, mobile);
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
  for (const viewport of viewports) results.push(await verifyMediaRecovery(browser, viewport));
  await writeFile(path.join(output, 'content-studio-results.json'), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
