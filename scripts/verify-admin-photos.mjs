import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { captureVerifiedScreenshot } from './screenshot-quality.mjs';

const baseUrl = process.env.ADMIN_PHOTOS_URL || process.env.ERP_HOME_URL || 'http://localhost:3002/';
const screenshotDir = path.resolve(process.env.ADMIN_PHOTOS_SCREENSHOT_DIR || '.tmp-admin-photos');
const adminPhotosUrl = new URL('/admin/photos', baseUrl);

const albumRequiredTexts = ['사진첩', '이미지 변환기', '사이트 브랜드 이미지', '카테고리'];
const albumDesktopRequiredTexts = ['사진 관리', ...albumRequiredTexts];
const converterRequiredTexts = ['이미지 변환 스튜디오', '운영 프리셋', 'ALBUM SOURCE'];
const corruptedTextPattern =
  /[\u{fffd}\u{c3}\u{c2}\u{ec}\u{ed}\u{eb}\u{ea}\u{f0}\u{5360}\u{5a9b}\u{6d39}\u{be18}\u{afa9}\u{317c}\u{bfc9}\u{c495}\u{c208}\u{c88e}\u{317b}\u{317d}\u{be2f}\u{b497}\u{f9cf}\u{b76f}\u{bac1}\u{7b4c}\u{7515}\u{63f6}\u{91ab}]/u;

const viewports = [
  { name: 'desktop', width: 1366, height: 860, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
];

const executableCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

async function resolveExecutablePath() {
  for (const candidate of executableCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next local browser candidate.
    }
  }

  throw new Error('Chrome or Edge executable was not found. Set CHROME_PATH to a local Chromium-compatible browser.');
}

async function assertServerAvailable(url) {
  let response;

  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  } catch (error) {
    throw new Error(`Admin photos page is not reachable at ${url}. Start the app with "npm run dev". ${error}`);
  }

  assert.ok(response.ok, `Admin photos page returned HTTP ${response.status} at ${url}`);
}

async function waitForAdminPhotosReady(page) {
  await page.waitForLoadState('load', { timeout: 30_000 });
  await page.locator('button').filter({ hasText: '사진첩' }).first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('button').filter({ hasText: '이미지 변환기' }).first().waitFor({ state: 'visible', timeout: 20_000 });
}

async function evaluateSurface(page, targets) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await page.evaluate((layoutTargets) => {
        const root = document.documentElement;
        const bodyText = document.body?.innerText || '';
        const missingLayout = [];
        const items = [];

        const findByText = (selector, text) =>
          Array.from(document.querySelectorAll(selector)).find((element) => element.textContent?.includes(text));

        for (const target of layoutTargets) {
          const element = findByText(target.selector, target.text);
          if (!(element instanceof HTMLElement)) {
            missingLayout.push(target.label);
            continue;
          }

          const rect = element.getBoundingClientRect();
          items.push({
            ...target,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          });
        }

        return {
          bodyText,
          scrollWidth: root.scrollWidth,
          viewportWidth: root.clientWidth,
          missingLayout,
          items,
        };
      }, targets);
    } catch (error) {
      lastError = error;
      if (!String(error).includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  throw lastError;
}

function assertSurfaceIntegrity(surface, viewportName, contextLabel, requiredTexts) {
  assert.equal(corruptedTextPattern.test(surface.bodyText), false, `${viewportName} admin photos ${contextLabel} contains corrupted Korean text`);
  assert.deepEqual(
    requiredTexts.filter((text) => !surface.bodyText.includes(text)),
    [],
    `${viewportName} admin photos ${contextLabel} is missing required copy`,
  );
  assert.ok(surface.scrollWidth <= surface.viewportWidth + 1, `${viewportName} admin photos ${contextLabel} has horizontal overflow`);
  assert.deepEqual(
    surface.missingLayout,
    [],
    `${viewportName} admin photos ${contextLabel} missing layout evidence for: ${surface.missingLayout.join(', ')}`,
  );

  for (const item of surface.items) {
    assert.ok(item.width >= item.minWidth, `${viewportName} admin photos ${contextLabel} ${item.label} is too narrow: ${item.width}px`);
    assert.ok(item.height >= item.minHeight, `${viewportName} admin photos ${contextLabel} ${item.label} is too short: ${item.height}px`);
    assert.ok(item.left >= -1, `${viewportName} admin photos ${contextLabel} ${item.label} extends past the left viewport edge`);
    assert.ok(item.right <= surface.viewportWidth + 1, `${viewportName} admin photos ${contextLabel} ${item.label} extends past the right viewport edge`);
  }
}

async function verifyAlbumSurface(page, viewportName) {
  const targets = [
    { label: 'album tab', selector: 'button', text: '사진첩', minWidth: 70, minHeight: 34 },
    { label: 'converter tab', selector: 'button', text: '이미지 변환기', minWidth: 110, minHeight: 34 },
    { label: 'brand panel', selector: 'summary', text: '사이트 브랜드 이미지', minWidth: 180, minHeight: 42 },
  ];

  if (viewportName === 'desktop') {
    targets.unshift({ label: 'page title', selector: 'h1', text: '사진 관리', minWidth: 80, minHeight: 24 });
  }

  const surface = await evaluateSurface(page, targets);
  assertSurfaceIntegrity(
    surface,
    viewportName,
    'album surface',
    viewportName === 'desktop' ? albumDesktopRequiredTexts : albumRequiredTexts,
  );
}

async function verifyPhotoPreviewRendering(page, viewportName) {
  await page.waitForTimeout(900);

  const previewState = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-photo-card]'))
      .filter((node) => node instanceof HTMLElement && node.getBoundingClientRect().width > 20);
    const previewImages = Array.from(document.querySelectorAll('img[data-photo-preview-image="true"]'))
      .filter((node) => node instanceof HTMLImageElement);
    const emptySrcImages = previewImages
      .filter((image) => !image.getAttribute('src')?.trim())
      .map((image) => image.alt || image.dataset.photoPreviewImage || 'preview image');
    const brokenImages = previewImages
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.width > 10 && rect.height > 10 && image.complete && image.naturalWidth === 0;
      })
      .map((image) => image.currentSrc || image.src || image.alt || 'preview image');
    const errorStates = Array.from(document.querySelectorAll('[data-photo-preview-state="error"]'))
      .filter((node) => node instanceof HTMLElement && node.getBoundingClientRect().width > 20)
      .map((node) => node.textContent?.trim() || 'preview error');

    return {
      cardCount: cards.length,
      previewImageCount: previewImages.length,
      emptySrcImages,
      brokenImages,
      errorStates,
    };
  });

  assert.deepEqual(
    previewState.emptySrcImages,
    [],
    `${viewportName} admin photos has preview images with empty src`,
  );
  assert.deepEqual(
    previewState.brokenImages,
    [],
    `${viewportName} admin photos has broken preview images: ${previewState.brokenImages.join(', ')}`,
  );

  if (previewState.cardCount > 0) {
    assert.ok(
      previewState.previewImageCount > 0 || previewState.errorStates.length > 0,
      `${viewportName} admin photos has photo cards but no preview image or error state evidence`,
    );
  }
}

async function verifyConverterSurface(page, viewportName) {
  await page.locator('button').filter({ hasText: '이미지 변환기' }).first().click();
  await page.getByText('이미지 변환 스튜디오').first().waitFor({ state: 'visible', timeout: 20_000 });

  const surface = await evaluateSurface(page, [
    { label: 'album tab', selector: 'button', text: '사진첩', minWidth: 70, minHeight: 34 },
    { label: 'converter tab', selector: 'button', text: '이미지 변환기', minWidth: 110, minHeight: 34 },
    { label: 'studio title', selector: 'h1,h2,h3,div', text: '이미지 변환 스튜디오', minWidth: 150, minHeight: 24 },
    { label: 'preset section', selector: 'button,section,div', text: '운영 기본값', minWidth: 120, minHeight: 36 },
  ]);

  assertSurfaceIntegrity(surface, viewportName, 'converter surface', converterRequiredTexts);
}

await mkdir(screenshotDir, { recursive: true });
await assertServerAvailable(adminPhotosUrl.toString());

const executablePath = await resolveExecutablePath();
const browser = await chromium.launch({
  executablePath,
  headless: true,
});

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
    });
    const page = await context.newPage();

    await page.goto(adminPhotosUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForAdminPhotosReady(page);
    await verifyAlbumSurface(page, viewport.name);
    await verifyPhotoPreviewRendering(page, viewport.name);
    const albumScreenshotPath = path.join(screenshotDir, `admin-photos-album-${viewport.name}.png`);
    await captureVerifiedScreenshot(page, {
      screenshotPath: albumScreenshotPath,
      minSize: viewport.isMobile ? 8_000 : 12_000,
      viewportName: viewport.name,
      slug: 'admin photos album',
      probe: { label: 'album tab', selector: 'button', text: '사진첩', minLuminanceRange: 45 },
    });

    await verifyConverterSurface(page, viewport.name);
    const converterScreenshotPath = path.join(screenshotDir, `admin-photos-converter-${viewport.name}.png`);
    await captureVerifiedScreenshot(page, {
      screenshotPath: converterScreenshotPath,
      minSize: viewport.isMobile ? 12_000 : 18_000,
      viewportName: viewport.name,
      slug: 'admin photos converter',
      probe: { label: 'converter studio title', selector: 'h1,h2,h3,div', text: '이미지 변환 스튜디오' },
    });

    console.log(
      `${viewport.name} admin photos album and converter verification passed (screenshots: ${albumScreenshotPath}, ${converterScreenshotPath})`,
    );

    await context.close();
  }
} finally {
  await browser.close();
}
