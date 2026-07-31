import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { captureVerifiedScreenshot } from './screenshot-quality.mjs';

const baseUrl = process.env.ADMIN_USERS_URL || process.env.ERP_HOME_URL || 'http://localhost:3002/';
const screenshotDir = path.resolve(process.env.ADMIN_USERS_SCREENSHOT_DIR || '.tmp-admin-users');
const adminUsersUrl = new URL('/admin/users', baseUrl);
const adminUsersFixtureParam = '__adminUsersFixture';
const adminUsersFixtureToken = 'admin-users-fixture-token';

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

const allPermissions = {
  menuManagement: true,
  userManagement: true,
  projectBoardManagement: true,
  photoManagement: true,
  storageManagement: true,
};

const noPermissions = {
  menuManagement: false,
  userManagement: false,
  projectBoardManagement: false,
  photoManagement: false,
  storageManagement: false,
};

const storage = {
  canPersist: true,
  credentialMode: 'fixture',
  message: null,
};

const fixtureUsers = [
  {
    uid: 'admin-users-fixture-admin',
    email: 'admin-users-fixture@example.com',
    displayName: 'Admin Users Fixture',
    photoURL: null,
    disabled: false,
    emailVerified: true,
    providerIds: ['password'],
    createdAt: '2026-06-01T00:00:00.000Z',
    lastSignInAt: '2026-06-30T08:45:00.000Z',
    role: 'admin',
    position: 'ceo',
    siteAccess: { admin: true, corp: true, propig: true, shop: true },
    menuAccess: {},
    permissions: allPermissions,
    updatedAt: '2026-06-30T08:50:00.000Z',
    updatedBy: 'system-fixture',
    isAdminDocLinked: true,
  },
  {
    uid: 'finance-manager-fixture',
    email: 'finance.manager@example.com',
    displayName: 'Finance Manager Fixture',
    photoURL: null,
    disabled: false,
    emailVerified: true,
    providerIds: ['google.com'],
    createdAt: '2026-05-15T04:00:00.000Z',
    lastSignInAt: '2026-06-29T13:20:00.000Z',
    role: 'user',
    position: 'manager',
    siteAccess: { admin: true, corp: true, propig: true, shop: false },
    menuAccess: { 'admin:admin-users': false },
    permissions: { ...noPermissions, menuManagement: true, projectBoardManagement: true },
    updatedAt: '2026-06-29T13:25:00.000Z',
    updatedBy: 'admin-users-fixture-admin',
    isAdminDocLinked: false,
  },
  {
    uid: 'partner-vendor-fixture',
    email: 'partner.vendor@example.com',
    displayName: 'Partner Vendor Fixture',
    photoURL: null,
    disabled: false,
    emailVerified: false,
    providerIds: ['password'],
    createdAt: '2026-04-10T02:30:00.000Z',
    lastSignInAt: '2026-06-27T09:10:00.000Z',
    role: 'partner',
    position: 'staff',
    siteAccess: { corp: true, shop: true },
    menuAccess: {},
    permissions: { ...noPermissions },
    updatedAt: '2026-06-27T09:30:00.000Z',
    updatedBy: 'admin-users-fixture-admin',
    isAdminDocLinked: false,
  },
  {
    uid: 'inactive-guest-fixture',
    email: 'inactive.guest@example.com',
    displayName: 'Inactive Guest Fixture',
    photoURL: null,
    disabled: true,
    emailVerified: false,
    providerIds: ['password'],
    createdAt: '2026-03-08T06:00:00.000Z',
    lastSignInAt: null,
    role: 'guest',
    position: 'intern',
    siteAccess: { corp: true },
    menuAccess: {},
    permissions: { ...noPermissions },
    updatedAt: '2026-06-20T01:00:00.000Z',
    updatedBy: 'admin-users-fixture-admin',
    isAdminDocLinked: false,
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
    throw new Error(`Admin users page is not reachable at ${url}. Start the app with "npm run dev". ${error}`);
  }

  assert.ok(response.ok, `Admin users page returned HTTP ${response.status} at ${url}`);
}

function createFixtureAdminUsersUrl() {
  const url = new URL(adminUsersUrl);
  url.searchParams.set(adminUsersFixtureParam, '1');
  url.searchParams.set('q', 'fixture');
  return url;
}

function cloneFixtureUsers() {
  return JSON.parse(JSON.stringify(fixtureUsers));
}

async function installAdminUsersFixtureRoute(page) {
  const users = cloneFixtureUsers();
  const apiRequests = [];

  await page.route('**/api/admin/users**', async (route) => {
    const request = route.request();
    const authorization = request.headers().authorization || '';
    const requestRecord = {
      method: request.method(),
      url: request.url(),
      body: null,
    };

    if (authorization !== `Bearer ${adminUsersFixtureToken}`) {
      apiRequests.push(requestRecord);
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid admin-users fixture token.' }),
      });
      return;
    }

    if (request.method() === 'PATCH') {
      const payload = JSON.parse(request.postData() || '{}');
      requestRecord.body = payload;
      apiRequests.push(requestRecord);

      const existingIndex = users.findIndex((user) => user.uid === payload.uid);
      if (existingIndex < 0) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Fixture user not found.' }),
        });
        return;
      }

      const updatedUser = {
        ...users[existingIndex],
        role: payload.role,
        position: payload.position,
        siteAccess: payload.siteAccess,
        menuAccess: payload.menuAccess,
        permissions: payload.role === 'admin' ? allPermissions : { ...noPermissions, ...payload.permissions },
        disabled: payload.disabled === true,
        updatedAt: '2026-06-30T09:05:00.000Z',
        updatedBy: 'admin-users-fixture-admin',
        isAdminDocLinked: payload.role === 'admin',
      };
      users[existingIndex] = updatedUser;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, user: updatedUser, storage }),
      });
      return;
    }

    apiRequests.push(requestRecord);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ users, storage }),
    });
  });

  return apiRequests;
}

async function evaluateShell(page) {
  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await page.evaluate(() => {
        const root = document.documentElement;
        const bodyText = document.body?.innerText || '';

        return {
          bodyText,
          scrollWidth: root.scrollWidth,
          viewportWidth: root.clientWidth,
          contentHeight: root.scrollHeight,
        };
      });
    } catch (error) {
      lastError = error;
      if (!String(error).includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  throw lastError;
}

function assertTextIntegrity(bodyText, viewportName, contextLabel, requiredTexts = []) {
  assert.equal(corruptedTextPattern.test(bodyText), false, `${viewportName} admin users ${contextLabel} contains corrupted Korean text`);
  assert.deepEqual(
    requiredTexts.filter((text) => !bodyText.includes(text)),
    [],
    `${viewportName} admin users ${contextLabel} is missing required copy`,
  );
}

async function verifyAccessState(page, viewportName) {
  await page.locator('body').filter({ hasText: 'ADMIN REQUIRED' }).waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 20_000 });
  const shell = await evaluateShell(page);

  assertTextIntegrity(shell.bodyText, viewportName, 'access state', ['ADMIN REQUIRED']);
  assert.ok(shell.scrollWidth <= shell.viewportWidth + 1, `${viewportName} admin users access state has horizontal overflow`);
  assert.ok(shell.contentHeight >= 220, `${viewportName} admin users access state did not render enough content`);

  const evidence = await page.evaluate(() => {
    const card = document.querySelector('main section');
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

  assert.ok(evidence, `${viewportName} admin users access card was not found`);
  assert.ok(evidence.width >= 260, `${viewportName} admin users access card is too narrow: ${evidence.width}px`);
  assert.ok(evidence.height >= 160, `${viewportName} admin users access card is too short: ${evidence.height}px`);
  assert.ok(evidence.left >= -1, `${viewportName} admin users access card extends past the left viewport edge`);
  assert.ok(evidence.right <= evidence.viewportWidth + 1, `${viewportName} admin users access card extends past the right viewport edge`);
}

async function waitForAuthenticatedUsers(page) {
  await page.locator('main header span').filter({ hasText: 'User access control' }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Admin Users Fixture/ }).waitFor({ state: 'visible', timeout: 30_000 });
}

async function verifyAuthenticatedUsers(page, viewportName, apiRequests) {
  await waitForAuthenticatedUsers(page);

  const shell = await evaluateShell(page);
  assertTextIntegrity(shell.bodyText, viewportName, 'authenticated state', [
    'USER ACCESS CONTROL',
    'Admin Users Fixture',
    'Finance Manager Fixture',
    'SELECTED USER',
    'Firestore',
  ]);
  assert.ok(shell.scrollWidth <= shell.viewportWidth + 1, `${viewportName} admin users authenticated UI has horizontal overflow`);

  assert.ok(
    apiRequests.some((request) => request.method === 'GET' && new URL(request.url).pathname.endsWith('/api/admin/users')),
    `${viewportName} admin users fixture did not request the users API`,
  );

  const layout = await page.evaluate(() => {
    const targets = [
      { label: 'header', selector: 'main > header', minWidth: 280, minHeight: 90 },
      { label: 'stats', selector: 'main > section:first-of-type', minWidth: 280, minHeight: 80 },
      { label: 'workspace', selector: 'main > section:nth-of-type(2)', minWidth: 280, minHeight: 320 },
      { label: 'user panel', selector: 'main > section:nth-of-type(2) > aside', minWidth: 280, minHeight: 180 },
      { label: 'detail panel', selector: 'main > section:nth-of-type(2) > section', minWidth: 280, minHeight: 360 },
      { label: 'selected heading', selector: 'main > section:nth-of-type(2) > section h2', minWidth: 160, minHeight: 24 },
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

  assert.deepEqual(layout.missing, [], `${viewportName} admin users missing layout evidence for: ${layout.missing.join(', ')}`);
  for (const item of layout.items) {
    assert.ok(item.width >= item.minWidth, `${viewportName} admin users ${item.label} is too narrow: ${item.width}px`);
    assert.ok(item.height >= item.minHeight, `${viewportName} admin users ${item.label} is too short: ${item.height}px`);
    assert.ok(item.left >= -1, `${viewportName} admin users ${item.label} extends past the left viewport edge`);
    assert.ok(item.right <= layout.viewportWidth + 1, `${viewportName} admin users ${item.label} extends past the right viewport edge`);
  }

  const searchInput = page.locator('main aside input').first();
  await searchInput.fill('finance');
  await page.getByRole('button', { name: /Finance Manager Fixture/ }).waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(
    await page.getByRole('button', { name: /Partner Vendor Fixture/ }).isVisible().catch(() => false),
    false,
    `${viewportName} admin users search did not filter partner users out`,
  );

  await page.getByRole('button', { name: /Finance Manager Fixture/ }).click();
  await page.locator('main h2').filter({ hasText: 'Finance Manager Fixture' }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#position-select').selectOption('staff');
  const saveResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/admin/users') && response.request().method() === 'PATCH',
    { timeout: 5_000 },
  );
  await page.locator('main footer button').click();
  await saveResponsePromise;

  assert.ok(
    apiRequests.some(
      (request) =>
        request.method === 'PATCH' &&
        request.body?.uid === 'finance-manager-fixture' &&
        request.body?.position === 'staff',
    ),
    `${viewportName} admin users fixture did not persist the edited finance user`,
  );

  await searchInput.fill('');
  await page.locator('main aside select').first().selectOption('partner');
  await page.getByRole('button', { name: /Partner Vendor Fixture/ }).waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(
    await page.getByRole('button', { name: /Finance Manager Fixture/ }).isVisible().catch(() => false),
    false,
    `${viewportName} admin users role filter did not hide non-partner users`,
  );

  await page.locator('main aside select').first().selectOption('all');
  await page.getByRole('button', { name: /Finance Manager Fixture/ }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'hidden', timeout: 7_000 }).catch(() => {});
}

await mkdir(screenshotDir, { recursive: true });
await assertServerAvailable(adminUsersUrl.toString());

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

    await page.goto(adminUsersUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await verifyAccessState(page, viewport.name);
    const accessScreenshotPath = path.join(screenshotDir, `admin-users-access-state-${viewport.name}.png`);
    await captureVerifiedScreenshot(page, {
      screenshotPath: accessScreenshotPath,
      minSize: viewport.isMobile ? 6_000 : 10_000,
      viewportName: viewport.name,
      slug: 'admin users access-state',
      probe: { label: 'access heading', selector: 'main h1', minLuminanceRange: 45 },
    });

    const apiRequests = await installAdminUsersFixtureRoute(page);
    await page.goto(createFixtureAdminUsersUrl().toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await verifyAuthenticatedUsers(page, viewport.name, apiRequests);
    const authenticatedScreenshotPath = path.join(screenshotDir, `admin-users-authenticated-${viewport.name}.png`);
    await captureVerifiedScreenshot(page, {
      screenshotPath: authenticatedScreenshotPath,
      minSize: viewport.isMobile ? 18_000 : 28_000,
      viewportName: viewport.name,
      slug: 'admin users authenticated',
      probe: { label: 'users management heading', selector: 'main header h1', minLuminanceRange: 45 },
    });

    console.log(
      `${viewport.name} admin users access and authenticated fixture verification passed (screenshots: ${accessScreenshotPath}, ${authenticatedScreenshotPath})`,
    );

    await context.close();
  }
} finally {
  await browser.close();
}
