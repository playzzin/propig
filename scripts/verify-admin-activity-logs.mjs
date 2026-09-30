import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { captureVerifiedScreenshot } from './screenshot-quality.mjs';

const baseUrl = process.env.ADMIN_ACTIVITY_LOGS_URL || process.env.ERP_HOME_URL || 'http://localhost:3002/';
const storageStatePath = process.env.ADMIN_ACTIVITY_LOGS_STORAGE_STATE || '';
const screenshotDir = path.resolve(process.env.ADMIN_ACTIVITY_LOGS_SCREENSHOT_DIR || '.tmp-admin-activity-logs');
const activityLogDensityStorageKey = 'admin-activity-logs:density:v1';
const activityLogsUrl = new URL('/admin/activity-logs', baseUrl);
activityLogsUrl.searchParams.set('scope', 'erp-home');
activityLogsUrl.searchParams.set('action', 'erp_home.command_executed');
activityLogsUrl.searchParams.set('q', 'ERP');
activityLogsUrl.searchParams.set('log', '__verify_missing_log__');

const activityLogFixtureParam = '__adminActivityFixture';
const activityLogFixtureToken = 'admin-activity-fixture-token';
const activityLogFixtureLogs = [
  {
    id: 'verify-command-open-menu',
    action: 'erp_home.command_executed',
    actor: {
      uid: 'admin-activity-fixture-user',
      email: 'admin-activity-fixture@example.com',
      role: 'admin',
      isAdmin: true,
    },
    target: {
      type: 'command',
      id: 'menu-admin',
      path: '/admin/menu',
      label: 'ERP menu admin command',
    },
    summary: 'ERP menu admin command executed from verification fixture',
    metadata: { source: 'verify-admin-activity' },
    route: '/',
    userAgent: 'verify-admin-activity',
    createdAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'verify-module-propig',
    action: 'erp_home.module_opened',
    actor: {
      uid: 'admin-activity-fixture-user',
      email: 'admin-activity-fixture@example.com',
      role: 'admin',
      isAdmin: true,
    },
    target: {
      type: 'module',
      id: 'propig-dashboard',
      path: '/propig',
      label: 'ERP propig module',
    },
    summary: 'ERP propig module opened from verification fixture',
    metadata: { source: 'verify-admin-activity' },
    route: '/',
    userAgent: 'verify-admin-activity',
    createdAt: '2026-06-29T08:30:00.000Z',
  },
  {
    id: 'verify-command-activity',
    action: 'erp_home.command_executed',
    actor: {
      uid: 'admin-activity-fixture-user',
      email: 'admin-activity-fixture@example.com',
      role: 'admin',
      isAdmin: true,
    },
    target: {
      type: 'command',
      id: 'activity-logs',
      path: '/admin/activity-logs',
      label: 'ERP activity logs command',
    },
    summary: 'ERP activity logs command executed from verification fixture',
    metadata: { source: 'verify-admin-activity' },
    route: '/',
    userAgent: 'verify-admin-activity',
    createdAt: '2026-06-28T12:15:00.000Z',
  },
];

const accessStateTexts = ['로그인이 필요합니다', '관리자 권한이 필요합니다'];
const authenticatedRequiredTexts = ['ACTIVITY LOGS', '작업 히스토리', '필터 초기화', '현재 페이지 기록', '작업 종류'];
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
    throw new Error(`Admin activity logs page is not reachable at ${url}. Start the app with "npm run dev". ${error}`);
  }

  assert.ok(response.ok, `Admin activity logs page returned HTTP ${response.status} at ${url}`);
}

async function resolveStorageState() {
  if (!storageStatePath) return undefined;

  const resolvedPath = path.resolve(storageStatePath);
  await access(resolvedPath);
  return resolvedPath;
}

function createFixtureActivityLogsUrl() {
  const url = new URL(activityLogsUrl);
  url.searchParams.set(activityLogFixtureParam, '1');
  return url;
}

function fixtureLogMatchesSearch(log, search) {
  if (!search) return true;
  const normalizedSearch = search.toLowerCase();
  return [log.action, log.summary, log.route, log.actor.email, log.target.type, log.target.id, log.target.path, log.target.label]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedSearch));
}

function fixtureLogMatchesScope(log, scope) {
  if (!scope || scope === 'all') return true;
  if (scope === 'erp-home') return log.action === 'erp_home.command_executed' || log.action === 'erp_home.module_opened';
  if (scope === 'module-opened') return log.action === 'erp_home.module_opened';
  if (scope === 'command-executed') return log.action === 'erp_home.command_executed';
  return true;
}

function fixtureLogMatchesParams(log, params) {
  const scope = params.get('scope') || 'all';
  const action = params.get('action') || 'all';
  const search = params.get('q') || params.get('search') || '';

  if (!fixtureLogMatchesScope(log, scope)) return false;
  if (action !== 'all' && action && log.action !== action) return false;
  return fixtureLogMatchesSearch(log, search);
}

function createFixtureActivityLogsResponse(requestUrl) {
  const params = new URL(requestUrl).searchParams;
  const limit = Math.max(1, Math.min(Number(params.get('limit')) || 50, 100));
  const selectedLogId = params.get('log') || null;
  const matchingLogs = activityLogFixtureLogs.filter((log) => fixtureLogMatchesParams(log, params));
  const selectedLog = selectedLogId ? activityLogFixtureLogs.find((log) => log.id === selectedLogId) ?? null : null;
  const selectedLogMatched = selectedLogId ? Boolean(selectedLog && fixtureLogMatchesParams(selectedLog, params)) : null;

  return {
    logs: matchingLogs.slice(0, limit),
    nextCursor: null,
    matchedCount: matchingLogs.length,
    scannedCount: activityLogFixtureLogs.length,
    scanLimitReached: false,
    selectedLogMatched,
  };
}

async function installActivityLogFixtureRoute(page) {
  await page.route('**/api/admin/activity-logs**', async (route) => {
    const authorization = route.request().headers().authorization || '';
    if (authorization !== `Bearer ${activityLogFixtureToken}`) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid activity-log fixture token.' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createFixtureActivityLogsResponse(route.request().url())),
    });
  });
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
      await page.waitForTimeout(250);
    }
  }

  throw lastError;
}

function isAccessState(bodyText) {
  return accessStateTexts.some((text) => bodyText.includes(text));
}

function assertTextIntegrity(bodyText, viewportName, contextLabel, requiredTexts = []) {
  assert.equal(corruptedTextPattern.test(bodyText), false, `${viewportName} ${contextLabel} contains corrupted Korean text`);
  assert.deepEqual(
    requiredTexts.filter((text) => !bodyText.includes(text)),
    [],
    `${viewportName} ${contextLabel} is missing required copy`,
  );
}

function assertLayoutEvidence(evidence, viewportName, contextLabel) {
  assert.equal(evidence.missing.length, 0, `${viewportName} ${contextLabel} missing layout evidence for: ${evidence.missing.join(', ')}`);

  for (const item of evidence.items) {
    assert.ok(item.width >= item.minWidth, `${viewportName} ${contextLabel} ${item.label} is too narrow: ${item.width}px`);
    assert.ok(item.height >= item.minHeight, `${viewportName} ${contextLabel} ${item.label} is too short: ${item.height}px`);
    assert.ok(item.left >= -1, `${viewportName} ${contextLabel} ${item.label} extends past the left viewport edge`);
    assert.ok(item.right <= evidence.viewportWidth + 1, `${viewportName} ${contextLabel} ${item.label} extends past the right viewport edge`);
  }

  assert.deepEqual(
    evidence.overlaps,
    [],
    `${viewportName} ${contextLabel} key regions overlap: ${evidence.overlaps.map((pair) => pair.join(' / ')).join(', ')}`,
  );
}

async function evaluateLayoutEvidence(page, targets) {
  return page.evaluate((layoutTargets) => {
    const viewportWidth = document.documentElement.clientWidth;
    const missing = [];
    const items = [];

    for (const target of layoutTargets) {
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

    const overlaps = [];
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex];
        const right = items[rightIndex];
        const horizontal = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
        const vertical = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        const overlapArea = horizontal * vertical;
        const smallestArea = Math.min(left.width * left.height, right.width * right.height);
        if (smallestArea > 0 && overlapArea / smallestArea > 0.04) {
          overlaps.push([left.label, right.label]);
        }
      }
    }

    return { viewportWidth, missing, items, overlaps };
  }, targets);
}

async function verifyAccessLayoutEvidence(page, viewportName) {
  const evidence = await evaluateLayoutEvidence(page, [
    { label: 'access card', selector: 'main section', minWidth: 260, minHeight: 220 },
  ]);

  assertLayoutEvidence(evidence, viewportName, 'access');
}

async function verifyAuthenticatedLayoutEvidence(page, viewportName) {
  const evidence = await evaluateLayoutEvidence(page, [
    { label: 'header', selector: 'main header', minWidth: 280, minHeight: 90 },
    { label: 'scope filters', selector: 'main nav[aria-label="활동 로그 범위 필터"]', minWidth: 280, minHeight: 42 },
    { label: 'filter status', selector: 'main [role="status"]', minWidth: 260, minHeight: 40 },
    { label: 'summary strip', selector: 'main section:nth-of-type(1)', minWidth: 280, minHeight: 70 },
    { label: 'log panel', selector: 'main section:nth-of-type(2)', minWidth: 280, minHeight: 180 },
    { label: 'pagination', selector: 'main nav[aria-label="활동 로그 페이지 이동"]', minWidth: 280, minHeight: 48 },
  ]);

  assertLayoutEvidence(evidence, viewportName, 'authenticated');
}

async function waitForActivityLogMode(page) {
  const modeHandle = await page.waitForFunction(
    ({ accessTexts }) => {
      const bodyText = document.body?.innerText || '';
      if (accessTexts.some((text) => bodyText.includes(text))) return 'access';

      const hasScopeFilter = Boolean(document.querySelector('nav[aria-label="활동 로그 범위 필터"]'));
      const hasActionFilter = Boolean(document.querySelector('select[aria-label="작업 필터"]'));
      if (hasScopeFilter && hasActionFilter) return 'authenticated';

      return '';
    },
    { accessTexts: accessStateTexts },
    { timeout: 30_000 },
  );

  return modeHandle.jsonValue();
}

async function waitForAuthenticatedActivityLogMode(page) {
  await page.waitForFunction(
    () => {
      const hasActivityHeader = Array.from(document.querySelectorAll('main header span')).some((element) =>
        element.textContent?.includes('Activity logs'),
      );
      const hasActionFilter = Array.from(document.querySelectorAll('select')).some((element) => element instanceof HTMLSelectElement);
      return hasActivityHeader && hasActionFilter;
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function verifyAccessState(page, viewportName) {
  let shell;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await waitForActivityLogMode(page);
    shell = await evaluateShell(page);
    if (isAccessState(shell.bodyText)) break;
    await page.waitForTimeout(300);
  }

  assert.ok(isAccessState(shell.bodyText), `${viewportName} expected login/admin access state when no authenticated admin storage state is provided`);
  assertTextIntegrity(shell.bodyText, viewportName, 'access state');
  assert.ok(shell.scrollWidth <= shell.viewportWidth + 1, `${viewportName} admin activity access state has horizontal overflow`);
  assert.ok(shell.contentHeight >= 280, `${viewportName} admin activity access state did not render enough content`);
  await verifyAccessLayoutEvidence(page, viewportName);
}

async function verifyAuthenticatedActivityLogUi(page, viewportName) {
  await page.locator('main h1').filter({ hasText: '작업 히스토리' }).waitFor({ state: 'visible', timeout: 20_000 });
  const apiRequestUrl = await page
    .waitForFunction(() => {
      const entry = performance
        .getEntriesByType('resource')
        .find((resource) => resource.name.includes('/api/admin/activity-logs?'));
      return entry?.name || '';
    }, undefined, { timeout: 10_000 })
    .then((handle) => handle.jsonValue());
  const apiSearchParams = new URL(apiRequestUrl).searchParams;
  assert.equal(apiSearchParams.get('scope'), 'erp-home', 'URL scope filter was not sent to the server API');
  assert.equal(apiSearchParams.get('action'), 'erp_home.command_executed', 'URL action filter was not sent to the server API');
  assert.equal(apiSearchParams.get('q'), 'ERP', 'URL search query was not sent to the server API');
  assert.equal(apiSearchParams.get('log'), '__verify_missing_log__', 'Highlighted log id was not sent to the server API');

  const scopeStrip = page.locator('nav[aria-label="활동 로그 범위 필터"]').first();
  await scopeStrip.waitFor({ state: 'visible', timeout: 10_000 });

  const filterStatus = page.locator('[role="status"][aria-live="polite"]').first();
  await filterStatus.waitFor({ state: 'visible', timeout: 5_000 });
  const filterStatusText = (await filterStatus.textContent()) || '';
  assert.ok(filterStatusText.includes('범위: ERP 홈'), 'Active filter status does not show the restored scope filter');
  assert.ok(filterStatusText.includes('작업: ERP 홈 명령 실행'), 'Active filter status does not show the restored action filter');
  assert.ok(filterStatusText.includes('검색: ERP'), 'Active filter status does not show the restored search query');
  await filterStatus.locator('button', { hasText: '필터 초기화' }).waitFor({ state: 'visible', timeout: 5_000 });

  const activeScope = scopeStrip.locator('button[aria-pressed="true"]').first();
  await activeScope.waitFor({ state: 'visible', timeout: 5_000 });
  assert.ok(((await activeScope.textContent()) || '').includes('ERP 홈'), 'URL scope did not activate the ERP home filter');

  const actionSelect = page.locator('select[aria-label="작업 필터"]').first();
  await actionSelect.waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(await actionSelect.inputValue(), 'erp_home.command_executed', 'URL action filter was not restored');

  const searchInput = page.locator('input[aria-label="작업 히스토리 검색"]').first();
  await searchInput.waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(await searchInput.inputValue(), 'ERP', 'URL search query was not restored');

  const densityControl = page.locator('[aria-label="작업 히스토리 밀도"]').first();
  await densityControl.waitFor({ state: 'visible', timeout: 5_000 });
  await densityControl.locator('button', { hasText: '촘촘' }).click();
  await page.waitForFunction(
    (key) => window.localStorage.getItem(key) === 'compact',
    activityLogDensityStorageKey,
    { timeout: 5_000 },
  );
  await page.locator('main[data-log-density="compact"]').waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(
    await densityControl.locator('button', { hasText: '촘촘' }).getAttribute('aria-pressed'),
    'true',
    'Compact density mode was not activated',
  );

  const highlightNotice = page.locator('text=선택한 기록을 찾을 수 없습니다.').first();
  await highlightNotice.waitFor({ state: 'visible', timeout: 5_000 });

  const pagination = page.locator('nav[aria-label="활동 로그 페이지 이동"]').first();
  await pagination.waitFor({ state: 'visible', timeout: 5_000 });
  await pagination.locator('button', { hasText: '이전' }).waitFor({ state: 'visible', timeout: 5_000 });
  await pagination.locator('button', { hasText: '다음' }).waitFor({ state: 'visible', timeout: 5_000 });

  await scopeStrip.locator('button', { hasText: '모듈 이동' }).click();
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get('scope') === 'module-opened');
  assert.equal(await actionSelect.inputValue(), 'all', 'Scope filter should reset the action select to all');

  const shell = await evaluateShell(page);
  assertTextIntegrity(shell.bodyText, viewportName, 'authenticated state', authenticatedRequiredTexts);
  assert.ok(shell.scrollWidth <= shell.viewportWidth + 1, `${viewportName} admin activity log UI has horizontal overflow`);
  await verifyAuthenticatedLayoutEvidence(page, viewportName);

  if (viewportName === 'mobile') {
    const mobileState = await page.evaluate(() => {
      const root = document.documentElement;
      const toolbar = document.querySelector('header div');
      const densityControl = document.querySelector('[aria-label="작업 히스토리 밀도"]');
      const pagination = document.querySelector('nav[aria-label="활동 로그 페이지 이동"]');
      const logRow = document.querySelector('[data-log-id]');

      const readRect = (element) => {
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };

      return {
        scrollWidth: root.scrollWidth,
        viewportWidth: root.clientWidth,
        toolbar: readRect(toolbar),
        densityControl: readRect(densityControl),
        pagination: readRect(pagination),
        logRow: readRect(logRow),
      };
    });

    assert.ok(mobileState.scrollWidth <= mobileState.viewportWidth + 1, 'mobile admin activity viewport has horizontal overflow');
    for (const [name, rect] of Object.entries({
      toolbar: mobileState.toolbar,
      densityControl: mobileState.densityControl,
      pagination: mobileState.pagination,
      logRow: mobileState.logRow,
    })) {
      if (!rect) continue;
      assert.ok(rect.left >= -1, `mobile ${name} extends past the left viewport edge`);
      assert.ok(rect.right <= mobileState.viewportWidth + 1, `mobile ${name} extends past the right viewport edge`);
    }
  }
}

await mkdir(screenshotDir, { recursive: true });
await assertServerAvailable(activityLogsUrl.toString());

const executablePath = await resolveExecutablePath();
const storageState = await resolveStorageState();
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
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();

    await page.goto(activityLogsUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('load', { timeout: 30_000 });

    const mode = await waitForActivityLogMode(page);
    if (mode === 'access') {
      await verifyAccessState(page, viewport.name);
      const screenshotPath = path.join(screenshotDir, `admin-activity-access-state-${viewport.name}.png`);
      const accessProbeText = await page.evaluate(
        (texts) => texts.find((text) => (document.body?.innerText || '').includes(text)) ?? texts[0],
        accessStateTexts,
      );
      await captureVerifiedScreenshot(page, {
        screenshotPath,
        minSize: viewport.isMobile ? 6_000 : 10_000,
        viewportName: viewport.name,
        slug: 'admin activity access-state',
        probe: { label: 'access heading', selector: 'h1', text: accessProbeText, minLuminanceRange: 45 },
      });
      console.log(
        `${viewport.name} admin activity access-state verification passed. Provide ADMIN_ACTIVITY_LOGS_STORAGE_STATE to run authenticated UI checks (screenshot: ${screenshotPath})`,
      );

      if (storageState) {
        throw new Error(`${viewport.name} ADMIN_ACTIVITY_LOGS_STORAGE_STATE was provided, but the page still rendered the access state.`);
      }

      await installActivityLogFixtureRoute(page);
      await page.goto(createFixtureActivityLogsUrl().toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('load', { timeout: 30_000 });
      await waitForAuthenticatedActivityLogMode(page);
      await verifyAuthenticatedActivityLogUi(page, viewport.name);
      const authenticatedScreenshotPath = path.join(screenshotDir, `admin-activity-authenticated-${viewport.name}.png`);
      await captureVerifiedScreenshot(page, {
        screenshotPath: authenticatedScreenshotPath,
        minSize: viewport.isMobile ? 12_000 : 20_000,
        viewportName: viewport.name,
        slug: 'admin activity authenticated fixture',
        probe: { label: 'activity logs label', selector: 'main header span', text: 'Activity logs' },
      });
      console.log(`${viewport.name} admin activity authenticated fixture verification passed (screenshot: ${authenticatedScreenshotPath})`);
    } else {
      await verifyAuthenticatedActivityLogUi(page, viewport.name);
      const screenshotPath = path.join(screenshotDir, `admin-activity-authenticated-${viewport.name}.png`);
      await captureVerifiedScreenshot(page, {
        screenshotPath,
        minSize: viewport.isMobile ? 12_000 : 20_000,
        viewportName: viewport.name,
        slug: 'admin activity authenticated',
        probe: { label: 'activity logs label', selector: 'main header span', text: 'Activity logs' },
      });
      console.log(`${viewport.name} admin activity authenticated browser verification passed (screenshot: ${screenshotPath})`);
    }

    await context.close();
  }
} finally {
  await browser.close();
}
