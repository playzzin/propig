import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const JSZip = require('jszip');
const sharp = require('sharp');

const DRAFT_KEY = 'propig:semi-auto-emoticon-studio:v1';
const DATABASE_NAME = 'propig-semi-auto-emoticon-studio';
const routePath = '/admin/emoticon-studio';
const baseUrlValue = process.env.BASE_URL;

if (!baseUrlValue) {
  throw new Error(
    'verify:emoticon-studio-complete needs a running app. Start the server first, then run `BASE_URL=http://localhost:3002 npm run verify:emoticon-studio-complete`.',
  );
}

let baseUrl;
try {
  baseUrl = new URL(baseUrlValue);
} catch {
  throw new Error(`BASE_URL must be an absolute http(s) URL; received ${JSON.stringify(baseUrlValue)}.`);
}
if (!['http:', 'https:'].includes(baseUrl.protocol)) {
  throw new Error(`BASE_URL must use http or https; received ${baseUrl.protocol}.`);
}

const studioUrl = new URL(routePath, baseUrl).toString();
try {
  const response = await fetch(studioUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (error) {
  throw new Error(
    `Studio server is not ready at ${studioUrl}: ${error instanceof Error ? error.message : String(error)}. Start it before running this browser gate.`,
  );
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([typeBytes, data])) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function opaquePng(red, green, blue) {
  const width = 24;
  const height = 24;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) row.set([red, green, blue, 255], 1 + x * 4);
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const fixtureDir = await mkdtemp(path.join(tmpdir(), 'propig-emoticon-studio-'));
const fixtureColors = [
  [238, 72, 93],
  [239, 118, 72],
  [238, 194, 72],
  [72, 187, 120],
  [72, 145, 220],
  [151, 92, 220],
];
const fixturePaths = await Promise.all(Array.from({ length: 48 }, async (_, index) => {
  const filePath = path.join(fixtureDir, `opaque-frame-${String(index + 1).padStart(2, '0')}.png`);
  await writeFile(filePath, opaquePng(...fixtureColors[index % fixtureColors.length]));
  return filePath;
}));
const invalidZipPath = path.join(fixtureDir, 'invalid-project.zip');
const invalidZip = new JSZip();
invalidZip.file('project.json', JSON.stringify({ schemaVersion: 2, exportType: 'unsupported-project', frames: [] }));
await writeFile(invalidZipPath, await invalidZip.generateAsync({ type: 'nodebuffer' }));

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || '/home/hermes/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
// This gate uses isolated local fixtures. A regression must never submit a paid job.
await context.route(/\/api\/(generate-image|emoticon-studio\/plan)(?:\?|$)/, async route => {
  if (route.request().method() === 'POST') await route.abort('blockedbyclient');
  else await route.continue();
});
const page = await context.newPage();
const errors = [];
const externalNetworkWarnings = [];
const paidRequests = [];
const contractFailures = [];

page.on('pageerror', error => errors.push(`page:${error.message}`));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (text.includes('@firebase/firestore') && text.includes('offline mode') && text.includes('unavailable')) return;
  const url = message.location().url;
  const source = url ? new URL(url).origin + new URL(url).pathname : '';
  if (text.includes('ERR_NETWORK_ACCESS_DENIED') && (/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//.test(source)
    || source === 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel'
    || source === 'https://www.google.com/images/cleardot.gif')) {
    externalNetworkWarnings.push(source);
    return;
  }
  errors.push(`console:${text}${source ? ` (${source})` : ''}`);
});
page.on('request', request => {
  if (/\/api\/(generate-image|emoticon-studio\/plan)/.test(request.url())) paidRequests.push(request.url());
});

async function waitForStudio() {
  await page.locator('[data-studio-ready="true"]').waitFor({ timeout: 60_000 });
}

async function recordContract(name, callback) {
  try {
    await callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    contractFailures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`FAIL ${contractFailures[contractFailures.length - 1]}`);
  }
}

async function downloadZip(button) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    button.click(),
  ]);
  const zipPath = path.join(fixtureDir, `${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(zipPath);
  return JSZip.loadAsync(await readFile(zipPath));
}

async function readProjectAssetKeys(targetPage, projectId) {
  return targetPage.evaluate(({ databaseName, requestedProjectId }) => new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(databaseName);
    openRequest.onerror = () => reject(openRequest.error || new Error('QA IndexedDB open failed'));
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const transaction = database.transaction('assets', 'readonly');
      const request = transaction.objectStore('assets').index('projectId').getAll(requestedProjectId);
      request.onsuccess = () => resolve(request.result.map(asset => asset.key).sort());
      request.onerror = () => reject(request.error || new Error('QA IndexedDB read failed'));
      transaction.oncomplete = () => database.close();
    };
  }), { databaseName: DATABASE_NAME, requestedProjectId: projectId });
}

try {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__propigGifWorkers = [];
    window.Worker = function Worker(url, options) {
      window.__propigGifWorkers.push({ url: String(url), name: options?.name || '' });
      return new NativeWorker(url, options);
    };
    window.Worker.prototype = NativeWorker.prototype;
  });
  // Malformed JSON must preserve the original and expose recovery, not silently overwrite it.
  await page.addInitScript(key => {
    if (sessionStorage.getItem('propig-complete-corrupt-draft-injected')) return;
    localStorage.setItem(key, '{broken-json');
    sessionStorage.setItem('propig-complete-corrupt-draft-injected', 'true');
  }, DRAFT_KEY);
  await page.goto(studioUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByText('저장한 작업을 복구하지 못했어요', { exact: true }).waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY), '{broken-json');
  assert.equal(await page.getByRole('button', { name: '복구 다시 시도', exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: '저장 정보 보관', exact: true }).isEnabled(), true);
  // Clear only this deliberately damaged fixture in the isolated test context.
  await page.evaluate(key => localStorage.removeItem(key), DRAFT_KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForStudio();
  await page.getByRole('heading', { name: '캐릭터와 제출 대상을 준비해요' }).waitFor();
  await page.waitForTimeout(400);
  const adminHomeLink = page.getByRole('link', { name: '관리자 홈으로 돌아가기' });
  assert.equal(await adminHomeLink.getAttribute('href'), '/admin');
  const adminHomeBox = await adminHomeLink.boundingBox();
  assert.ok(adminHomeBox && adminHomeBox.height >= 44, `admin home link must keep a mobile touch target: ${JSON.stringify(adminHomeBox)}`);
  const recoveredDraft = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), DRAFT_KEY);
  assert.equal(recoveredDraft.version, 3);
  assert.equal(typeof recoveredDraft.projectId, 'string');

  const visitedSteps = ['준비하기'];
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]:not([multiple])').first().setInputFiles(fixturePaths[0]);
  await page.getByRole('textbox', { name: '캐릭터 이름' }).fill('모바일 회귀 캐릭터');
  await page.getByText('캐릭터 특징·프로젝트 이름', { exact: true }).click();
  await page.getByRole('textbox', { name: '반드시 유지할 특징' }).fill('불투명 단색, 둥근 얼굴, 굵은 외곽선');

  await page.getByRole('button', { name: '장면 고르기', exact: true }).first().click();
  visitedSteps.push('장면 고르기');
  await page.getByRole('heading', { name: '만들 장면을 골라 주세요' }).waitFor();
  await page.getByRole('button', { name: 'AI로 기획', exact: true }).click();
  await page.getByPlaceholder(/560도를 회전해 발차기/).fill('로그아웃 CTA 회귀 검증');
  await page.getByLabel(/OpenRouter API 별도 과금과 외부 전송/).check();
  const guestPlanningButton = page.getByRole('button', { name: '로그인 후 자동 기획', exact: true });
  assert.equal(await guestPlanningButton.isDisabled(), true, 'guest OpenRouter planning CTA must stay disabled after description and consent guards pass');
  await page.getByRole('button', { name: 'AI 기획 닫기', exact: true }).click();
  await page.getByRole('button', { name: '이 장면으로 만들기', exact: true }).first().click();
  visitedSteps.push('만들고 다듬기');
  await page.getByRole('heading', { name: '이미지를 준비하고 움직임을 다듬어요' }).waitFor();
  await page.locator('input[type="file"][multiple]').setInputFiles(fixturePaths.slice(0, 6));
  await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 6);

  await page.getByRole('button', { name: /프레임 편집 시작/ }).click();
  await page.getByLabel('프레임 편집 워크스페이스').waitFor();
  const mobileWidth = await page.evaluate(() => ({ root: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: innerWidth }));
  assert.ok(mobileWidth.root <= 391 && mobileWidth.body <= 391, JSON.stringify(mobileWidth));

  await recordContract('수동 프레임 재연결과 미지정의 저장 식별자 일치', async () => {
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).frameMeta.length === 6, DRAFT_KEY);
    const original = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).frameMeta[0], DRAFT_KEY);
    const connection = page.getByRole('combobox', { name: '연결할 연출 프레임' });
    const nextSlot = await page.evaluate(({ key, sceneId }) => {
      const draft = JSON.parse(localStorage.getItem(key));
      const scene = draft.presets.find(preset => preset.id === sceneId);
      return { sceneId, keyframeIndex: 1, keyframeId: scene.frames[1].id };
    }, { key: DRAFT_KEY, sceneId: original.sceneId });
    try {
      await connection.selectOption(`${nextSlot.sceneId}:${nextSlot.keyframeIndex}`);
      await page.waitForFunction(({ key, id, expected }) => {
        const frame = JSON.parse(localStorage.getItem(key)).frameMeta.find(item => item.id === id);
        return frame.sceneId === expected.sceneId && frame.keyframeIndex === expected.keyframeIndex && frame.keyframeId === expected.keyframeId;
      }, { key: DRAFT_KEY, id: original.id, expected: nextSlot });
      await connection.selectOption('');
      await page.waitForFunction(({ key, id }) => {
        const frame = JSON.parse(localStorage.getItem(key)).frameMeta.find(item => item.id === id);
        return frame.sceneId === null && frame.keyframeIndex === null && frame.keyframeId === null;
      }, { key: DRAFT_KEY, id: original.id });
    } finally {
      await connection.selectOption(`${original.sceneId}:${original.keyframeIndex}`);
      await page.waitForFunction(({ key, expected }) => {
        const frame = JSON.parse(localStorage.getItem(key)).frameMeta.find(item => item.id === expected.id);
        return frame.sceneId === expected.sceneId && frame.keyframeIndex === expected.keyframeIndex && frame.keyframeId === expected.keyframeId;
      }, { key: DRAFT_KEY, expected: original });
    }
  });

  await page.getByRole('button', { name: '레이어', exact: true }).click();
  await page.getByRole('button', { name: /말풍선 추가/ }).click();
  await page.getByRole('textbox', { name: '말풍선 문구' }).fill('잠금 회귀');
  await page.waitForTimeout(500);
  const xInput = page.getByLabel('레이어 X 위치');
  await xInput.fill('37');
  const lockedLayer = page.getByRole('button', { name: '말풍선 1 레이어', exact: true });
  await page.waitForTimeout(600);
  await lockedLayer.focus();
  await lockedLayer.press('ArrowRight');
  assert.equal(await xInput.inputValue(), '38', 'arrow key must nudge the selected layer by 1%');
  await page.getByRole('button', { name: '편집 실행 취소' }).click();
  assert.equal(await xInput.inputValue(), '37', 'undo must restore the transform before keyboard nudge');
  await page.getByRole('button', { name: '편집 다시 실행' }).click();
  assert.equal(await xInput.inputValue(), '38', 'redo must restore the keyboard nudge');

  const sizeInput = page.getByRole('slider', { name: '레이어 크기', exact: true });
  const sizeBefore = Number(await sizeInput.inputValue());
  const resizeHandle = page.getByRole('button', { name: '선택 레이어 크기 조절 핸들' });
  const resizeBox = await resizeHandle.boundingBox();
  assert.ok(resizeBox, 'resize handle must be visible for an unlocked selected layer');
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 36, resizeBox.y + resizeBox.height / 2 + 24, { steps: 4 });
  await page.mouse.up();
  assert.notEqual(Number(await sizeInput.inputValue()), sizeBefore, 'resize handle must change layer width');

  const rotationInput = page.getByRole('slider', { name: '레이어 회전', exact: true });
  const rotationBefore = Number(await rotationInput.inputValue());
  const rotationHandle = page.getByRole('button', { name: '선택 레이어 회전 핸들' });
  const rotationBox = await rotationHandle.boundingBox();
  const transformBox = await page.locator('[data-transform-overlay]').boundingBox();
  assert.ok(rotationBox, 'rotation handle must be visible for an unlocked selected layer');
  assert.ok(transformBox, 'transform overlay must be visible for an unlocked selected layer');
  await page.mouse.move(rotationBox.x + rotationBox.width / 2, rotationBox.y + rotationBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(transformBox.x + transformBox.width + 30, transformBox.y + transformBox.height / 2, { steps: 4 });
  await page.mouse.up();
  assert.notEqual(Number(await rotationInput.inputValue()), rotationBefore, 'rotation handle must change layer rotation');

  const beforeX = await xInput.inputValue();
  const yInput = page.getByLabel('레이어 Y 위치');
  const beforeY = await yInput.inputValue();
  const beforeLayerBox = await lockedLayer.boundingBox();
  assert.ok(beforeLayerBox);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '레이어 잠금' }).click();
  await recordContract('잠긴 레이어 Inspector의 모든 mutation 차단', async () => {
    assert.equal(await xInput.count(), 1, 'locked layer selection and Inspector must remain available');
    for (const label of ['레이어 X 위치', '레이어 크기', '레이어 회전', '레이어 투명도']) {
      const control = page.getByLabel(label);
      assert.equal(await control.count(), 1, `${label} must remain in the locked Inspector`);
      assert.equal(await control.isDisabled(), true, `${label} must be disabled while locked`);
    }
    for (const label of ['레이어 숨기기', '레이어 뒤로', '레이어 앞으로', '레이어 복제', '레이어 삭제']) {
      const action = page.getByRole('button', { name: label, exact: true });
      assert.ok(await action.count() === 0 || await action.isDisabled(), `${label} must be absent or disabled while locked`);
    }
    const box = await lockedLayer.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 25, { steps: 4 });
    await page.mouse.up();
    const afterBox = await lockedLayer.boundingBox();
    assert.ok(afterBox);
    assert.equal(await xInput.inputValue(), beforeX, 'locked layer X value changed by pointer drag');
    assert.equal(await yInput.inputValue(), beforeY, 'locked layer Y value changed by pointer drag');
  });

  await page.getByRole('button', { name: /검수·내보내기/ }).first().click();
  visitedSteps.push('검수하고 받기');
  await page.getByRole('heading', { name: '움직임을 확인하고 파일을 받아요' }).waitFor();
  assert.deepEqual(visitedSteps, ['준비하기', '장면 고르기', '만들고 다듬기', '검수하고 받기']);
  await page.getByText(/선택한 결과 6장/).waitFor({ timeout: 60_000 });

  const projectImportInput = page.locator('[data-studio-ready="true"]').last().locator('input[type="file"][accept*="application/zip"]');
  await recordContract('invalid ZIP 기존 manifest 보존', async () => {
    // The final layer-lock edit is saved after a debounce. Compare a committed
    // draft, not an older draft that can legitimately finish saving mid-test.
    await page.getByRole('status').filter({ hasText: /^\s*저장됨\s*$/ }).waitFor();
    const manifestBeforeInvalidImport = await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY);
    const projectIdBeforeInvalidImport = JSON.parse(manifestBeforeInvalidImport).projectId;
    const assetKeysBeforeInvalidImport = await readProjectAssetKeys(page, projectIdBeforeInvalidImport);
    await projectImportInput.setInputFiles(invalidZipPath);
    await page.getByText('지원하는 ProPig Studio v3 프로젝트가 아닙니다.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY), manifestBeforeInvalidImport);
    assert.deepEqual(await readProjectAssetKeys(page, projectIdBeforeInvalidImport), assetKeysBeforeInvalidImport);
  });

  const mobileRail = page.getByRole('navigation', { name: '모바일 제작 단계 자유 탐색' });
  const projectStep = page.locator('section').filter({ has: page.getByRole('heading', { name: '캐릭터와 제출 대상을 준비해요' }) });
  await recordContract('validation allPassed success toast', async () => {
    // Previous success/error notifications pause their dismissal while hovered.
    // Move away before using the top rail instead of force-clicking through them.
    await page.mouse.move(0, 0);
    await page.locator('[data-sonner-toast][data-visible="true"]').first().waitFor({ state: 'hidden', timeout: 20_000 });
    await mobileRail.getByRole('button', { name: /준비하기/ }).click();
    await projectStep.getByRole('button', { name: '자유 캔버스', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).platform === 'custom', DRAFT_KEY);
    await mobileRail.getByRole('button', { name: /검수하고 받기/ }).click();
    const zip = await downloadZip(page.getByRole('button', { name: /플랫폼 (?:부분 )?결과 받기/ }).first());
    const validation = JSON.parse(await zip.file('submission/validation.json').async('string'));
    assert.equal(validation.allPassed, true, JSON.stringify(validation.packageChecks));
    await page.getByText('작업 ZIP 생성 완료 · 규격 참고값 충족', { exact: true }).waitFor();
    await mobileRail.getByRole('button', { name: /준비하기/ }).click();
    await projectStep.getByRole('button', { name: '카카오톡', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).platform === 'kakao', DRAFT_KEY);
    await mobileRail.getByRole('button', { name: /검수하고 받기/ }).click();
  });

  await page.getByRole('button', { name: /실제 GIF 미리보기 만들기/ }).click();
  const gifPreview = page.getByAltText(/실제 GIF 미리보기/);
  await gifPreview.waitFor({ timeout: 120_000 });
  const gifWorkers = await page.evaluate(() => window.__propigGifWorkers || []);
  assert.ok(gifWorkers.some(worker => worker.name === 'propig-gif-encoder'), `dedicated GIF Worker was not created: ${JSON.stringify(gifWorkers)}`);
  await recordContract('불투명 GIF의 alpha decoder 보존', async () => {
    const decoded = await gifPreview.evaluate(async image => {
      const blob = await fetch(image.src).then(response => response.blob());
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0;
      let opaque = 0;
      for (let index = 3; index < pixels.length; index += 4) pixels[index] === 0 ? transparent += 1 : opaque += 1;
      return { width: canvas.width, height: canvas.height, transparent, opaque, centerAlpha: pixels[((Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4) + 3] };
    });
    assert.ok(decoded.opaque > decoded.transparent, JSON.stringify(decoded));
    assert.equal(decoded.centerAlpha, 255, JSON.stringify(decoded));
  });

  // Give two selected scene IDs the same user-facing title and frames, then verify collision-safe ZIP paths.
  const collisionDraft = await page.evaluate(key => {
    const draft = JSON.parse(localStorage.getItem(key));
    const original = draft.presets.find(preset => preset.id === draft.selectedSceneIds[0]);
    const duplicate = structuredClone(original);
    duplicate.id = 'qa-collision-scene';
    duplicate.frames = duplicate.frames.map((frame, index) => ({ ...frame, id: `qa-collision-${index + 1}` }));
    draft.presets.push(duplicate);
    draft.selectedSceneIds = [original.id, duplicate.id];
    draft.frameMeta = draft.frameMeta.map((frame, index) => index < 3
      ? frame
      : { ...frame, sceneId: duplicate.id, keyframeIndex: index - 3, keyframeId: duplicate.frames[index - 3].id });
    return draft;
  }, DRAFT_KEY);
  await page.addInitScript(({ key, draft }) => {
    if (!sessionStorage.getItem('qa-collision-seeded')) {
      localStorage.setItem(key, JSON.stringify(draft));
      sessionStorage.setItem('qa-collision-seeded', 'true');
    }
  }, { key: DRAFT_KEY, draft: collisionDraft });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForStudio();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const rail = page.locator('nav[aria-label="제작 단계"]');
  await rail.getByRole('button', { name: /검수하고 받기/ }).click();
  await page.getByText(/선택한 결과 6장/).waitFor({ timeout: 60_000 });

  await recordContract('동일 장면명 ZIP entry 충돌 방지', async () => {
    const zip = await downloadZip(page.getByRole('button', { name: /플랫폼 (?:부분 )?결과 받기/ }).first());
    const animations = Object.keys(zip.files).filter(name => /^submission\/kakao\/animations\/.+\.gif$/.test(name));
    const manifest = JSON.parse(await zip.file('project.json').async('string'));
    assert.equal(animations.length, 2, `expected one animation per scene ID, received ${JSON.stringify({ animations, platform: manifest.platform, sceneIds: manifest.frames.map(frame => frame.sceneId), entries: Object.keys(zip.files).filter(name => name.startsWith('submission/')) })}`);
    assert.equal(new Set(animations).size, animations.length);
    assert.ok(zip.file('submission/validation.json'));
    assert.ok(zip.file('submission/kakao/README-WEBP-CONVERSION.txt'));
    const previewGifName = Object.keys(zip.files).find(name => /^submission\/kakao\/.+-preview\.gif$/.test(name));
    assert.ok(previewGifName, 'Kakao package must include the preview GIF');
    const previewGifEntry = zip.file(previewGifName);
    const previewMetadata = await sharp(await previewGifEntry.async('nodebuffer'), { animated: true }).metadata();
    assert.equal(previewMetadata.loop, 4, 'Kakao submission GIF must encode the documented four-loop value');
    const validation = JSON.parse(await zip.file('submission/validation.json').async('string'));
    assert.equal(validation.allPassed, false, 'Kakao submission must not be marked ready without required WebP artifacts');
    const failedReferenceCount = validation.files.filter(file => !file.pass).length
      + validation.packageChecks.filter(check => !check.pass && check.id !== 'file-size-reference-checks').length;
    await page.getByText(`작업 ZIP 생성 완료 · 제출 참고값 미충족 ${failedReferenceCount}개`, { exact: true }).waitFor();
    const roundTripPath = path.join(fixtureDir, 'round-trip-project.zip');
    await writeFile(roundTripPath, await zip.generateAsync({ type: 'nodebuffer' }));
    const beforeImportProjectId = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).projectId, DRAFT_KEY);
    const manifestBeforeFailedImport = await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY);
    const existingAssetKeys = await readProjectAssetKeys(page, beforeImportProjectId);
    await page.evaluate(({ key, existingProjectId }) => {
      window.__qaImportTrace = [];
      window.__qaExistingProjectId = existingProjectId;
      window.__qaCandidateProjectId = '';
      window.__qaFailImportAssetWrite = true;
      window.__qaImportAssetWriteCount = 0;
      window.__qaNativeStorageSetItem = Storage.prototype.setItem;
      window.__qaNativeAssetPut = IDBObjectStore.prototype.put;
      Storage.prototype.setItem = function setItem(name, value) {
        if (this === localStorage && name === key) {
          try {
            window.__qaImportTrace.push({ type: 'manifest', projectId: JSON.parse(value).projectId });
          } catch { /* malformed values are irrelevant to this import trace */ }
        }
        return window.__qaNativeStorageSetItem.call(this, name, value);
      };
      IDBObjectStore.prototype.put = function put(...args) {
        const value = args[0];
        if (value?.projectId && value.projectId !== window.__qaExistingProjectId) {
          window.__qaCandidateProjectId ||= value.projectId;
          window.__qaImportTrace.push({ type: 'asset', projectId: value.projectId, kind: value.kind });
          if (window.__qaFailImportAssetWrite) {
            window.__qaImportAssetWriteCount += 1;
            if (window.__qaImportAssetWriteCount === 2) throw new DOMException('QA asset put failure', 'QuotaExceededError');
          }
        }
        return window.__qaNativeAssetPut.apply(this, args);
      };
    }, { key: DRAFT_KEY, existingProjectId: beforeImportProjectId });
    try {
      const importInput = page.locator('[data-studio-ready="true"]').last().locator('input[type="file"][accept*="application/zip"]');
      await importInput.setInputFiles(roundTripPath);
      await page.getByText('QA asset put failure', { exact: true }).waitFor({ timeout: 60_000 });
      const failedImportState = await page.evaluate(key => ({
        raw: localStorage.getItem(key),
        candidateProjectId: window.__qaCandidateProjectId,
        trace: window.__qaImportTrace,
      }), DRAFT_KEY);
      assert.equal(failedImportState.raw, manifestBeforeFailedImport, 'asset write failure changed the existing manifest');
      assert.ok(failedImportState.candidateProjectId, 'asset failure test did not observe a candidate project');
      assert.equal(failedImportState.trace.some(event => event.type === 'manifest' && event.projectId === failedImportState.candidateProjectId), false, 'failed candidate reached the canonical manifest key');
      assert.deepEqual(await readProjectAssetKeys(page, beforeImportProjectId), existingAssetKeys, 'asset write failure changed existing project assets');
      assert.deepEqual(await readProjectAssetKeys(page, failedImportState.candidateProjectId), [], 'failed candidate assets were not cleaned up');

      await page.evaluate(() => {
        window.__qaFailImportAssetWrite = false;
        window.__qaImportAssetWriteCount = 0;
      });
      await importInput.setInputFiles(roundTripPath);
      await page.getByText(/프로젝트 ZIP에서 6개 프레임/).waitFor({ timeout: 60_000 });
      const atomicCommitState = await page.evaluate(key => ({
        projectId: JSON.parse(localStorage.getItem(key)).projectId,
        trace: window.__qaImportTrace,
      }), DRAFT_KEY);
      const assetWriteIndexes = atomicCommitState.trace.flatMap((event, index) => event.type === 'asset' && event.projectId === atomicCommitState.projectId ? [index] : []);
      const firstManifestCommitIndex = atomicCommitState.trace.findIndex(event => event.type === 'manifest' && event.projectId === atomicCommitState.projectId);
      assert.ok(assetWriteIndexes.length >= 6, `successful import asset trace is incomplete: ${JSON.stringify(atomicCommitState.trace)}`);
      assert.ok(firstManifestCommitIndex > Math.max(...assetWriteIndexes), `manifest committed before all imported Blob writes: ${JSON.stringify(atomicCommitState.trace)}`);
    } finally {
      await page.evaluate(() => {
        if (window.__qaNativeStorageSetItem) Storage.prototype.setItem = window.__qaNativeStorageSetItem;
        if (window.__qaNativeAssetPut) IDBObjectStore.prototype.put = window.__qaNativeAssetPut;
      });
    }
    const afterImportProjectId = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).projectId, DRAFT_KEY);
    assert.notEqual(afterImportProjectId, beforeImportProjectId, 'ZIP restore must switch to a newly fenced project identity');
    await rail.getByRole('button', { name: /만들고 다듬기/ }).click();
    await page.getByLabel('제작·편집 화면').getByRole('button', { name: '프레임 편집', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '편집 실행 취소' }).isDisabled(), true, 'ZIP restore must clear undo history');
    assert.equal(await page.getByRole('button', { name: '편집 다시 실행' }).isDisabled(), true, 'ZIP restore must clear redo history');
    const roundTripContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await roundTripContext.route(/\/api\/(generate-image|emoticon-studio\/plan)(?:\?|$)/, async route => {
      if (route.request().method() === 'POST') await route.abort('blockedbyclient');
      else await route.continue();
    });
    const roundTripPage = await roundTripContext.newPage();
    try {
      await roundTripPage.goto(studioUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await roundTripPage.locator('[data-studio-ready="true"]').last().waitFor();
      await roundTripPage.locator('[data-studio-ready="true"]').last().locator('input[type="file"][accept*="application/zip"]').setInputFiles(roundTripPath);
      await roundTripPage.getByText(/프로젝트 ZIP에서 6개 프레임/).waitFor({ timeout: 60_000 });
      const restored = await roundTripPage.evaluate(key => JSON.parse(localStorage.getItem(key)), DRAFT_KEY);
      assert.equal(restored.frameMeta.length, 6);
      assert.equal(restored.frameMeta.filter(frame => frame.keyframeId).length, 6);
      assert.equal(restored.frameMeta[0].layers.some(layer => layer.type === 'speech'), true);
    } finally {
      await roundTripContext.close();
    }
  });

  await rail.getByRole('button', { name: /장면 고르기/ }).click();
  const duplicateCard = page.locator('[data-preset-id="qa-collision-scene"]');
  const duplicateSelect = duplicateCard.getByRole('button').first();
  await duplicateSelect.click();
  assert.equal(await duplicateSelect.getAttribute('aria-pressed'), 'false');
  await rail.getByRole('button', { name: /검수하고 받기/ }).click();
  await recordContract('선택 해제 장면 ZIP 제외', async () => {
    const zip = await downloadZip(page.getByRole('button', { name: /플랫폼 (?:부분 )?결과 받기/ }).first());
    const manifest = JSON.parse(await zip.file('project.json').async('string'));
    assert.equal(manifest.frames.some(frame => frame.sceneId === 'qa-collision-scene'), false, 'deselected scene remained in project manifest');
    const animations = Object.keys(zip.files).filter(name => /^submission\/kakao\/animations\/.+\.gif$/.test(name));
    assert.equal(animations.length, 1, JSON.stringify(animations));
    const backup = await downloadZip(page.getByRole('button', { name: '작업 백업', exact: true }));
    await page.getByText('모든 원본·편집 정보와 현재 계정의 AI 작업 기록을 백업했습니다. AI 결과는 같은 계정으로 복구할 수 있어요.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-sonner-toast][data-visible="true"]').last().getAttribute('data-y-position'), 'bottom', 'studio notifications must leave top project controls accessible');
    const backupManifest = JSON.parse(await backup.file('project.json').async('string'));
    assert.equal(backupManifest.backup, true);
    assert.equal(backupManifest.frames.length, 6, 'working backup must preserve frames from deselected scenes');
    assert.equal(backupManifest.frames.some(frame => frame.sceneId === 'qa-collision-scene'), true);
  });

  await rail.getByRole('button', { name: /만들고 다듬기/ }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles(fixturePaths.slice(6));
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).frameMeta.length === 48, DRAFT_KEY, { timeout: 60_000 });
  await rail.getByRole('button', { name: /장면 고르기/ }).click();
  const collisionCard = page.locator('[data-preset-id="qa-collision-scene"]');
  const collisionSelect = collisionCard.getByRole('button').first();
  if (await collisionSelect.getAttribute('aria-pressed') === 'false') await collisionSelect.click();
  await rail.getByRole('button', { name: /검수하고 받기/ }).click();
  await recordContract('48프레임 상한 GIF 인코딩', async () => {
    const startedAt = Date.now();
    await page.getByRole('button', { name: /실제 GIF 미리보기 만들기|GIF 다시 만들기/ }).click();
    await page.getByAltText(/실제 GIF 미리보기/).waitFor({ timeout: 180_000 });
    assert.ok(Date.now() - startedAt < 180_000, '48-frame GIF encoding exceeded the release timeout');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).frameMeta.length, DRAFT_KEY), 48);
  });

  await recordContract('24장면 48프레임 작업 백업 왕복과 새 프로젝트 원본 보관', async () => {
    const fullSetDraft = await page.evaluate(key => {
      const draft = JSON.parse(localStorage.getItem(key));
      draft.presets = Array.from({ length: 24 }, (_, index) => ({
        id: `qa-set-${index + 1}`, title: `완성 세트 ${index + 1}`, summary: '48프레임 왕복 검사', dialogue: '', loopGuide: '',
        frames: [
          { id: `qa-set-${index + 1}-a`, pose: '첫 자세', caption: '', durationMs: 80 },
          { id: `qa-set-${index + 1}-b`, pose: '다음 자세', caption: '', durationMs: 90 },
        ],
      }));
      draft.selectedSceneIds = draft.presets.map(preset => preset.id);
      draft.frameMeta = draft.frameMeta.map((frame, index) => {
        const scene = draft.presets[Math.floor(index / 2)];
        const keyframeIndex = index % 2;
        const keyframe = scene.frames[keyframeIndex];
        return { ...frame, sceneId: scene.id, keyframeIndex, keyframeId: keyframe.id, durationMs: keyframe.durationMs };
      });
      return draft;
    }, DRAFT_KEY);
    await page.addInitScript(({ key, draft }) => {
      if (sessionStorage.getItem('qa-full-set-seeded')) return;
      localStorage.setItem(key, JSON.stringify(draft));
      sessionStorage.setItem('qa-full-set-seeded', 'true');
    }, { key: DRAFT_KEY, draft: fullSetDraft });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForStudio();
    const reopened = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), DRAFT_KEY);
    assert.equal(reopened.selectedSceneIds.length, 24);
    assert.equal(reopened.frameMeta.length, 48);
    const backup = await downloadZip(page.getByRole('button', { name: '작업 백업', exact: true }));
    const manifest = JSON.parse(await backup.file('project.json').async('string'));
    assert.equal(manifest.backup, true);
    assert.equal(manifest.selectedSceneIds.length, 24);
    assert.equal(manifest.frames.length, 48);
    const backupPath = path.join(fixtureDir, 'full-48-frame-backup.zip');
    await writeFile(backupPath, await backup.generateAsync({ type: 'nodebuffer' }));
    const restoreContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    await restoreContext.route(/\/api\/(generate-image|emoticon-studio\/plan)(?:\?|$)/, async route => {
      if (route.request().method() === 'POST') await route.abort('blockedbyclient');
      else await route.continue();
    });
    try {
      const restoredPage = await restoreContext.newPage();
      await restoredPage.goto(studioUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const restoredStudio = restoredPage.locator('[data-studio-ready="true"]:visible');
      await restoredStudio.waitFor();
      // A static streaming response can retain hidden initial HTML briefly.
      // Upload through the hydrated workspace, as the visible button does.
      await restoredStudio.locator('input[type="file"][accept*="application/zip"]').setInputFiles(backupPath);
      await restoredPage.getByText(/프로젝트 ZIP에서 48개 프레임/).waitFor({ timeout: 60_000 });
      const restored = await restoredPage.evaluate(key => JSON.parse(localStorage.getItem(key)), DRAFT_KEY);
      assert.deepEqual(restored.selectedSceneIds, reopened.selectedSceneIds);
      const meaningfulFrames = frames => frames.map(frame => ({ sceneId: frame.sceneId, keyframeIndex: frame.keyframeIndex, keyframeId: frame.keyframeId, durationMs: frame.durationMs, caption: frame.caption, imageTransform: frame.imageTransform, captionTransform: frame.captionTransform, layers: frame.layers }));
      assert.deepEqual(meaningfulFrames(restored.frameMeta), meaningfulFrames(reopened.frameMeta));
    } finally {
      await restoreContext.close();
    }

    const oldAssetKeys = await readProjectAssetKeys(page, reopened.projectId);
    assert.ok(oldAssetKeys.length >= 49, 'full fixture must retain 48 frame originals and the source');
    await page.getByRole('button', { name: '프로젝트', exact: true }).click();
    await page.getByRole('button', { name: '새 프로젝트', exact: true }).click();
    await page.waitForFunction(({ key, oldId }) => {
      const current = JSON.parse(localStorage.getItem(key));
      return current.projectId !== oldId && current.frameMeta.length === 0;
    }, { key: DRAFT_KEY, oldId: reopened.projectId });
    await waitForStudio();
    assert.deepEqual(await readProjectAssetKeys(page, reopened.projectId), oldAssetKeys, 'new project deleted previous originals');
    const archived = await page.evaluate(id => JSON.parse(localStorage.getItem('propig:emoticon-projects:v1') || '[]').find(item => item.projectId === id), reopened.projectId);
    assert.ok(archived, 'previous project is missing from the persisted archive');
    assert.equal(archived.frameMeta.length, 48, 'previous project archive lost frame metadata');
    assert.equal(archived.projectName, reopened.projectName, 'archive changed the project name');
    await page.getByRole('button', { name: '프로젝트', exact: true }).click();
    const projectMenu = page.getByLabel('프로젝트 보관함');
    await projectMenu.waitFor();
    const archivedButton = projectMenu.getByRole('button', { name: `${archived.projectName} · 48프레임`, exact: true });
    assert.equal(await archivedButton.count(), 1, JSON.stringify({ expectedName: `${archived.projectName} · 48프레임`, actualButtons: await projectMenu.getByRole('button').allTextContents() }));
    await archivedButton.click();
    await waitForStudio();
    await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).projectId === id, { key: DRAFT_KEY, id: reopened.projectId });
    const returned = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), DRAFT_KEY);
    assert.equal(returned.frameMeta.length, 48);
    assert.deepEqual(returned.selectedSceneIds, reopened.selectedSceneIds);
  });

  assert.equal(paidRequests.length, 0, `unexpected paid requests:\n${paidRequests.join('\n')}`);
  assert.deepEqual(contractFailures, [], `Studio complete contract failures:\n${contractFailures.join('\n')}`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    route: studioUrl,
    mobileSteps: visitedSteps,
    corruptDraftPreserved: true,
    lockedInspector: true,
    workerEncoding: true,
    keyboardUndoRedo: true,
    manualFrameRelink: true,
    resizeHandle: true,
    rotationHandle: true,
    opaqueGifDecoded: true,
    collisionSafeZip: true,
    atomicZipImport: true,
    importFailurePreservesExistingProject: true,
    validationToastSemantics: true,
    guestPlanningDisabled: true,
    deselectedSceneExcluded: true,
    maxFrameGif: true,
    fullSetBackupRoundTrip: true,
    newProjectPreservesOriginals: true,
    paidRequests: paidRequests.length,
    externalNetworkWarnings: [...new Set(externalNetworkWarnings)],
    errors: errors.length,
  }));
} finally {
  await browser.close();
  await rm(fixtureDir, { recursive: true, force: true });
}
