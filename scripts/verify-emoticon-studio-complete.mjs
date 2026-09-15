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
const page = await context.newPage();
const errors = [];
const paidRequests = [];
const contractFailures = [];

page.on('pageerror', error => errors.push(`page:${error.message}`));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (text.includes('@firebase/firestore') && text.includes('offline mode') && text.includes('unavailable')) return;
  errors.push(`console:${text}`);
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
  } catch (error) {
    contractFailures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
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
  // Malformed JSON is a release regression: hydration must recover without crashing or issuing paid requests.
  await page.addInitScript(key => {
    if (sessionStorage.getItem('propig-complete-corrupt-draft-injected')) return;
    localStorage.setItem(key, '{broken-json');
    sessionStorage.setItem('propig-complete-corrupt-draft-injected', 'true');
  }, DRAFT_KEY);
  await page.goto(studioUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForStudio();
  await page.getByRole('heading', { name: '프로젝트와 제출 대상을 먼저 정해요' }).waitFor();
  await page.waitForTimeout(400);
  const adminHomeLink = page.getByRole('link', { name: '관리자 홈으로 돌아가기' });
  assert.equal(await adminHomeLink.getAttribute('href'), '/admin');
  const adminHomeBox = await adminHomeLink.boundingBox();
  assert.ok(adminHomeBox && adminHomeBox.height >= 44, `admin home link must keep a mobile touch target: ${JSON.stringify(adminHomeBox)}`);
  const recoveredDraft = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), DRAFT_KEY);
  assert.equal(recoveredDraft.version, 3);
  assert.equal(typeof recoveredDraft.projectId, 'string');

  const visitedSteps = ['프로젝트'];
  await page.getByRole('button', { name: /캐릭터 준비하기/ }).click();
  visitedSteps.push('캐릭터');
  await page.getByRole('heading', { name: '캐릭터 기준을 먼저 고정해요' }).waitFor();
  await page.locator('section').filter({ hasText: 'STEP 02캐릭터 기준을 먼저 고정해요' }).locator('input[type="file"]').setInputFiles(fixturePaths[0]);
  await page.getByRole('textbox', { name: '캐릭터 이름' }).fill('모바일 회귀 캐릭터');
  await page.getByRole('textbox', { name: '반드시 유지할 특징' }).fill('불투명 단색, 둥근 얼굴, 굵은 외곽선');

  await page.getByRole('button', { name: /장면 기획하기/ }).click();
  visitedSteps.push('기획');
  await page.getByRole('heading', { name: '움짤의 움직임을 프레임으로 연출해요' }).waitFor();
  await page.getByRole('button', { name: 'AI로 기획', exact: true }).click();
  await page.getByPlaceholder(/560도를 회전해 발차기/).fill('로그아웃 CTA 회귀 검증');
  await page.getByLabel(/OpenRouter API 별도 과금과 외부 전송/).check();
  const guestPlanningButton = page.getByRole('button', { name: '로그인 후 자동 기획', exact: true });
  assert.equal(await guestPlanningButton.isDisabled(), true, 'guest OpenRouter planning CTA must stay disabled after description and consent guards pass');
  await page.getByRole('button', { name: 'AI 기획 닫기', exact: true }).click();
  await page.getByRole('button', { name: /ChatGPT에서 프레임 만들기/ }).click();
  visitedSteps.push('이미지 제작');
  await page.getByRole('heading', { name: '연출 순서대로 프레임을 가져와요' }).waitFor();
  await page.locator('input[type="file"][multiple]').setInputFiles(fixturePaths.slice(0, 6));
  await page.waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 6);

  await page.getByRole('button', { name: /프레임 편집 시작/ }).click();
  visitedSteps.push('움직임 제작');
  await page.getByLabel('프레임 편집 워크스페이스').waitFor();
  const mobileWidth = await page.evaluate(() => ({ root: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: innerWidth }));
  assert.ok(mobileWidth.root <= 391 && mobileWidth.body <= 391, JSON.stringify(mobileWidth));

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
  visitedSteps.push('검수·내보내기');
  await page.getByRole('heading', { name: '원본과 작업 정보를 함께 보관해요' }).waitFor();
  assert.deepEqual(visitedSteps, ['프로젝트', '캐릭터', '기획', '이미지 제작', '움직임 제작', '검수·내보내기']);
  await page.getByText(/합성할 결과 이미지 6개/).waitFor({ timeout: 60_000 });

  const projectImportInput = page.locator('[data-studio-ready="true"]').last().locator('input[type="file"][accept*="application/zip"]');
  await recordContract('invalid ZIP 기존 manifest 보존', async () => {
    const manifestBeforeInvalidImport = await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY);
    const projectIdBeforeInvalidImport = JSON.parse(manifestBeforeInvalidImport).projectId;
    const assetKeysBeforeInvalidImport = await readProjectAssetKeys(page, projectIdBeforeInvalidImport);
    await projectImportInput.setInputFiles(invalidZipPath);
    await page.getByText('지원하는 ProPig Studio v3 프로젝트가 아닙니다.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY), manifestBeforeInvalidImport);
    assert.deepEqual(await readProjectAssetKeys(page, projectIdBeforeInvalidImport), assetKeysBeforeInvalidImport);
  });

  const mobileRail = page.getByRole('navigation', { name: '모바일 제작 단계 자유 탐색' });
  const projectStep = page.locator('section').filter({ hasText: 'STEP 01프로젝트와 제출 대상을 먼저 정해요' });
  await recordContract('validation allPassed success toast', async () => {
    // Previous success/error notifications pause their dismissal while hovered.
    // Move away before using the top rail instead of force-clicking through them.
    await page.mouse.move(0, 0);
    await page.locator('[data-sonner-toast][data-visible="true"]').first().waitFor({ state: 'hidden', timeout: 20_000 });
    await mobileRail.getByRole('button', { name: /프로젝트/ }).click();
    await projectStep.getByRole('button', { name: '직접 설정', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).platform === 'custom', DRAFT_KEY);
    await mobileRail.getByRole('button', { name: /검수·내보내기/ }).click();
    const zip = await downloadZip(page.getByRole('button', { name: /프로젝트 ZIP 내보내기/ }));
    const validation = JSON.parse(await zip.file('submission/validation.json').async('string'));
    assert.equal(validation.allPassed, true, JSON.stringify(validation.packageChecks));
    await page.getByText('작업 ZIP 생성 완료 · 규격 참고값 충족', { exact: true }).waitFor();
    await mobileRail.getByRole('button', { name: /프로젝트/ }).click();
    await projectStep.getByRole('button', { name: '카카오톡', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).platform === 'kakao', DRAFT_KEY);
    await mobileRail.getByRole('button', { name: /검수·내보내기/ }).click();
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
      : { ...frame, sceneId: duplicate.id, keyframeIndex: index - 3 });
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
  await rail.getByRole('button', { name: /검수·내보내기/ }).click();
  await page.getByText(/합성할 결과 이미지 6개/).waitFor({ timeout: 60_000 });

  await recordContract('동일 장면명 ZIP entry 충돌 방지', async () => {
    const zip = await downloadZip(page.getByRole('button', { name: /프로젝트 ZIP 내보내기/ }));
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
    await rail.getByRole('button', { name: /움직임 제작/ }).click();
    assert.equal(await page.getByRole('button', { name: '편집 실행 취소' }).isDisabled(), true, 'ZIP restore must clear undo history');
    assert.equal(await page.getByRole('button', { name: '편집 다시 실행' }).isDisabled(), true, 'ZIP restore must clear redo history');
    const roundTripContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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

  await rail.getByRole('button', { name: /기획/ }).click();
  const duplicateCard = page.locator('[data-preset-id="qa-collision-scene"]');
  const duplicateSelect = duplicateCard.getByRole('button').first();
  await duplicateSelect.click();
  assert.equal(await duplicateSelect.getAttribute('aria-pressed'), 'false');
  await rail.getByRole('button', { name: /검수·내보내기/ }).click();
  await recordContract('선택 해제 장면 ZIP 제외', async () => {
    const zip = await downloadZip(page.getByRole('button', { name: /프로젝트 ZIP 내보내기/ }));
    const manifest = JSON.parse(await zip.file('project.json').async('string'));
    assert.equal(manifest.frames.some(frame => frame.sceneId === 'qa-collision-scene'), false, 'deselected scene remained in project manifest');
    const animations = Object.keys(zip.files).filter(name => /^submission\/kakao\/animations\/.+\.gif$/.test(name));
    assert.equal(animations.length, 1, JSON.stringify(animations));
  });

  await rail.getByRole('button', { name: /이미지 제작/ }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles(fixturePaths.slice(6));
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).frameMeta.length === 48, DRAFT_KEY, { timeout: 60_000 });
  await rail.getByRole('button', { name: /기획/ }).click();
  const collisionCard = page.locator('[data-preset-id="qa-collision-scene"]');
  const collisionSelect = collisionCard.getByRole('button').first();
  if (await collisionSelect.getAttribute('aria-pressed') === 'false') await collisionSelect.click();
  await rail.getByRole('button', { name: /검수·내보내기/ }).click();
  await recordContract('48프레임 상한 GIF 인코딩', async () => {
    const startedAt = Date.now();
    await page.getByRole('button', { name: /실제 GIF 미리보기 만들기|GIF 다시 만들기/ }).click();
    await page.getByAltText(/실제 GIF 미리보기/).waitFor({ timeout: 180_000 });
    assert.ok(Date.now() - startedAt < 180_000, '48-frame GIF encoding exceeded the release timeout');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).frameMeta.length, DRAFT_KEY), 48);
  });

  assert.equal(paidRequests.length, 0, `unexpected paid requests:\n${paidRequests.join('\n')}`);
  assert.deepEqual(errors, []);
  assert.deepEqual(contractFailures, [], `Studio complete contract failures:\n${contractFailures.join('\n')}`);
  console.log(JSON.stringify({
    route: studioUrl,
    mobileSteps: visitedSteps,
    corruptDraftRecovered: true,
    lockedInspector: true,
    workerEncoding: true,
    keyboardUndoRedo: true,
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
    paidRequests: paidRequests.length,
    errors: errors.length,
  }));
} finally {
  await browser.close();
  await rm(fixtureDir, { recursive: true, force: true });
}
