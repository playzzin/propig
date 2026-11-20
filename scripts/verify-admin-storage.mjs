import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { captureVerifiedScreenshot } from './screenshot-quality.mjs';

const baseUrl = process.env.ADMIN_STORAGE_URL || process.env.ERP_HOME_URL || 'http://localhost:3002/';
const screenshotDir = path.resolve(process.env.ADMIN_STORAGE_SCREENSHOT_DIR || '.tmp-admin-storage');
const adminStorageUrl = new URL('/admin/storage', baseUrl);
const storageFixtureParam = '__adminStorageFixture';
const storageFixtureToken = 'admin-storage-fixture-token';
const storageSearchKeyword = 'hero';

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
  '/Applications/Microsoft Edge.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const fixtureFiles = [
  {
    path: 'brand/hero-dashboard.png',
    name: 'hero-dashboard.png',
    bucket: 'propig-admin-fixture',
    contentType: 'image/png',
    sizeBytes: 482_100,
    createdAt: '2026-06-28T09:00:00.000Z',
    updatedAt: '2026-06-30T08:30:00.000Z',
    md5Hash: 'fixture-md5-hero',
    generation: '1001',
  },
  {
    path: 'brand/logo-square.svg',
    name: 'logo-square.svg',
    bucket: 'propig-admin-fixture',
    contentType: 'image/svg+xml',
    sizeBytes: 18_240,
    createdAt: '2026-06-25T01:20:00.000Z',
    updatedAt: '2026-06-30T07:15:00.000Z',
    md5Hash: 'fixture-md5-logo',
    generation: '1002',
  },
  {
    path: 'docs/contracts/erp-storage-policy.pdf',
    name: 'erp-storage-policy.pdf',
    bucket: 'propig-admin-fixture',
    contentType: 'application/pdf',
    sizeBytes: 1_280_000,
    createdAt: '2026-06-20T02:00:00.000Z',
    updatedAt: '2026-06-29T11:45:00.000Z',
    md5Hash: 'fixture-md5-policy',
    generation: '1003',
  },
  {
    path: 'exports/june/activity-log.csv',
    name: 'activity-log.csv',
    bucket: 'propig-admin-fixture',
    contentType: 'text/csv',
    sizeBytes: 74_300,
    createdAt: '2026-06-21T04:00:00.000Z',
    updatedAt: '2026-06-29T13:05:00.000Z',
    md5Hash: 'fixture-md5-csv',
    generation: '1004',
  },
  {
    path: 'video/launch/teaser.mp4',
    name: 'teaser.mp4',
    bucket: 'propig-admin-fixture',
    contentType: 'video/mp4',
    sizeBytes: 8_650_000,
    createdAt: '2026-06-18T15:00:00.000Z',
    updatedAt: '2026-06-27T16:20:00.000Z',
    md5Hash: 'fixture-md5-video',
    generation: '1005',
  },
];

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
    throw new Error(`Admin storage page is not reachable at ${url}. Start the app with "npm run dev". ${error}`);
  }

  assert.ok(response.ok, `Admin storage page returned HTTP ${response.status} at ${url}`);
}

function createFixtureStorageUrl() {
  const url = new URL(adminStorageUrl);
  url.searchParams.set(storageFixtureParam, '1');
  url.searchParams.set('q', storageSearchKeyword);
  return url;
}

function createPreviewDataUrl(pathname) {
  const label = pathname.split('/').pop() || 'Storage preview';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><rect width="320" height="220" fill="#0f766e"/><rect x="18" y="18" width="284" height="184" rx="24" fill="#ecfdf5"/><text x="34" y="105" font-family="Arial" font-size="22" font-weight="700" fill="#0f172a">${label}</text><text x="34" y="138" font-family="Arial" font-size="14" fill="#0f766e">verified storage fixture</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function createStorageListResponse() {
  const totalBytes = fixtureFiles.reduce((sum, file) => sum + file.sizeBytes, 0);

  return {
    ok: true,
    bucket: 'propig-admin-fixture',
    generatedAt: '2026-06-30T10:00:00.000Z',
    limit: 12000,
    hasMore: false,
    totalFiles: fixtureFiles.length,
    totalBytes,
    prefix: null,
    files: fixtureFiles,
  };
}

async function installAdminStorageFixtureRoute(page) {
  const apiRequests = [];

  await page.route('**/api/admin/storage**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const authorization = request.headers().authorization || '';
    apiRequests.push(request.url());

    if (authorization !== `Bearer ${storageFixtureToken}`) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Invalid admin storage fixture token.' }),
      });
      return;
    }

    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, bucket: 'propig-admin-fixture', path: 'brand/New fixture folder/' }),
      });
      return;
    }

    const downloadPath = requestUrl.searchParams.get('downloadPath');
    if (downloadPath) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          bucket: 'propig-admin-fixture',
          path: downloadPath,
          url: createPreviewDataUrl(downloadPath),
          expiresAt: '2026-06-30T10:15:00.000Z',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createStorageListResponse()),
    });
  });

  return apiRequests;
}

async function evaluateShell(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const bodyText = document.body?.innerText || '';

    return {
      bodyText,
      scrollWidth: root.scrollWidth,
      viewportWidth: root.clientWidth,
      contentHeight: root.scrollHeight,
    };
  });
}

function assertTextIntegrity(bodyText, viewportName, contextLabel, requiredTexts = []) {
  assert.equal(corruptedTextPattern.test(bodyText), false, `${viewportName} admin storage ${contextLabel} contains corrupted Korean text`);
  assert.deepEqual(
    requiredTexts.filter((text) => !bodyText.includes(text)),
    [],
    `${viewportName} admin storage ${contextLabel} is missing required copy`,
  );
}

async function verifyAccessState(page, viewportName) {
  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 20_000 });
  const shell = await evaluateShell(page);

  assertTextIntegrity(shell.bodyText, viewportName, 'access state');
  assert.ok(shell.scrollWidth <= shell.viewportWidth + 1, `${viewportName} admin storage access state has horizontal overflow`);
  assert.ok(shell.contentHeight >= 240, `${viewportName} admin storage access state did not render enough content`);

  const evidence = await page.evaluate(() => {
    const card = document.querySelector('main div');
    if (!(card instanceof HTMLElement)) return null;
    const rect = card.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  assert.ok(evidence, `${viewportName} admin storage access card was not found`);
  assert.ok(evidence.width >= 260, `${viewportName} admin storage access card is too narrow: ${evidence.width}px`);
  assert.ok(evidence.height >= 160, `${viewportName} admin storage access card is too short: ${evidence.height}px`);
  assert.ok(evidence.left >= -1, `${viewportName} admin storage access card extends past the left viewport edge`);
  assert.ok(evidence.right <= evidence.viewportWidth + 1, `${viewportName} admin storage access card extends past the right viewport edge`);
}

async function waitForAuthenticatedStorage(page) {
  await page.locator('main h1').filter({ hasText: 'Storage Drive' }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('article[title="brand/hero-dashboard.png"]').first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function verifyAuthenticatedStorage(page, viewportName, apiRequests) {
  await waitForAuthenticatedStorage(page);

  const shell = await evaluateShell(page);
  assertTextIntegrity(shell.bodyText, viewportName, 'authenticated state', [
    'Storage Drive',
    'propig-admin-fixture',
    'hero-dashboard.png',
  ]);
  assert.ok(shell.scrollWidth <= shell.viewportWidth + 1, `${viewportName} admin storage authenticated UI has horizontal overflow`);

  assert.ok(
    apiRequests.some((requestUrl) => {
      const url = new URL(requestUrl);
      return url.pathname.endsWith('/api/admin/storage') && url.searchParams.get('limit') === '12000';
    }),
    `${viewportName} admin storage fixture did not request the inventory API with the expected limit`,
  );
  assert.ok(
    apiRequests.some((requestUrl) => new URL(requestUrl).searchParams.get('downloadPath') === 'brand/hero-dashboard.png'),
    `${viewportName} admin storage fixture did not request a signed preview URL`,
  );

  const layout = await page.evaluate(() => {
    const targets = [
      { label: 'header', selector: 'main > section:first-of-type', minWidth: 280, minHeight: 110 },
      { label: 'content grid', selector: 'main > section:nth-of-type(2)', minWidth: 280, minHeight: 320 },
      { label: 'drive panel', selector: 'main > section:nth-of-type(2) > section:first-of-type', minWidth: 280, minHeight: 320 },
      { label: 'detail panel', selector: 'main aside', minWidth: 280, minHeight: 260 },
      { label: 'breadcrumb', selector: 'nav[aria-label="Storage path"]', minWidth: 180, minHeight: 28 },
      { label: 'hero file', selector: 'article[title="brand/hero-dashboard.png"]', minWidth: 140, minHeight: 120 },
    ];
    const viewportWidth = document.documentElement.clientWidth;
    const missing = [];
    const items = [];

    for (const target of targets) {
      const element = document.querySelector(target.selector);
      if (!(element instanceof HTMLElement)) {
        missing.push(target.label);
        continue;
      }

      const rect = element.getBoundingClientRect();
      items.push({
        ...target,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    }

    return { viewportWidth, missing, items };
  });

  assert.deepEqual(layout.missing, [], `${viewportName} admin storage missing layout evidence for: ${layout.missing.join(', ')}`);
  for (const item of layout.items) {
    assert.ok(item.width >= item.minWidth, `${viewportName} admin storage ${item.label} is too narrow: ${item.width}px`);
    assert.ok(item.height >= item.minHeight, `${viewportName} admin storage ${item.label} is too short: ${item.height}px`);
    assert.ok(item.left >= -1, `${viewportName} admin storage ${item.label} extends past the left viewport edge`);
    assert.ok(item.right <= layout.viewportWidth + 1, `${viewportName} admin storage ${item.label} extends past the right viewport edge`);
  }

  const searchInput = page.locator('main input:not([type="file"])').first();
  await searchInput.fill('policy');
  await page.locator('article[title="docs/contracts/erp-storage-policy.pdf"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(
    await page.locator('article[title="brand/hero-dashboard.png"]').first().isVisible().catch(() => false),
    false,
    `${viewportName} admin storage search did not filter the hero file out`,
  );
  await searchInput.fill(storageSearchKeyword);
  await page.locator('article[title="brand/hero-dashboard.png"]').first().waitFor({ state: 'visible', timeout: 5_000 });

  const heroFile = page.locator('article[title="brand/hero-dashboard.png"]').first();
  await heroFile.click();
  await page.locator('aside h2').filter({ hasText: 'hero-dashboard.png' }).waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('button').filter({ hasText: '새 폴더' }).first().click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]').first();
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });
  await dialog.locator('#storage-folder-name').fill('bad/name');
  await dialog.locator('button[type="submit"]').click();
  await dialog.locator('[role="alert"]').waitFor({ state: 'visible', timeout: 5_000 });
  await page.keyboard.press('Escape').catch(() => {});
  await dialog.locator('button[aria-label="닫기"]').click();
  await dialog.waitFor({ state: 'hidden', timeout: 5_000 });

  await searchInput.fill(storageSearchKeyword);
  await page.locator('article[title="brand/hero-dashboard.png"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('article[title="brand/hero-dashboard.png"]').first().click();
  await page.locator('aside h2').filter({ hasText: 'hero-dashboard.png' }).waitFor({ state: 'visible', timeout: 5_000 });
}

await mkdir(screenshotDir, { recursive: true });
await assertServerAvailable(adminStorageUrl.toString());

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

    await page.goto(adminStorageUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await verifyAccessState(page, viewport.name);
    const accessScreenshotPath = path.join(screenshotDir, `admin-storage-access-state-${viewport.name}.png`);
    await captureVerifiedScreenshot(page, {
      screenshotPath: accessScreenshotPath,
      minSize: viewport.isMobile ? 6_000 : 10_000,
      viewportName: viewport.name,
      slug: 'admin storage access-state',
      probe: { label: 'access heading', selector: 'main h1', minLuminanceRange: 45 },
    });

    const apiRequests = await installAdminStorageFixtureRoute(page);
    await page.goto(createFixtureStorageUrl().toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await verifyAuthenticatedStorage(page, viewport.name, apiRequests);
    const authenticatedScreenshotPath = path.join(screenshotDir, `admin-storage-authenticated-${viewport.name}.png`);
    await captureVerifiedScreenshot(page, {
      screenshotPath: authenticatedScreenshotPath,
      minSize: viewport.isMobile ? 16_000 : 28_000,
      viewportName: viewport.name,
      slug: 'admin storage authenticated',
      probe: { label: 'storage drive heading', selector: 'main h1', text: 'Storage Drive' },
    });

    console.log(
      `${viewport.name} admin storage access and authenticated fixture verification passed (screenshots: ${accessScreenshotPath}, ${authenticatedScreenshotPath})`,
    );

    await context.close();
  }
} finally {
  await browser.close();
}
