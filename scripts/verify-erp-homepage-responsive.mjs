import assert from 'node:assert/strict';
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { captureVerifiedScreenshot } from './screenshot-quality.mjs';

const baseUrl = process.env.ERP_HOME_URL || 'http://localhost:3002/';
const screenshotDir = path.resolve(process.env.ERP_HOME_SCREENSHOT_DIR || '.tmp-erp-homepage');
const pinnedModulesStorageKey = 'erp-home:pinned-module-hrefs';
const recentModulesStorageKey = 'erp-home:recent-module-hrefs';
const recentCommandsStorageKey = 'erp-home:recent-command-ids:v1';
const domainFilterStorageKey = 'erp-home:module-domain-filter:v1';

const requiredTexts = [
  'ERP CONTROL CENTER',
  '운영 현황을 한 화면에서 판단하는 ERP 홈',
  '운영 포커스 모듈',
  '운영 우선순위',
  '업무/콘텐츠 흐름',
];

const requiredReadinessTexts = ['로그인 후 관리자 지표와 개인 앱 등록 상태를 동기화하세요.'];

const staleReadinessTexts = [
  '공통 한글 라벨과 메뉴 기본값 인코딩을 정규화하세요.',
  'Turbopack NFT trace 경고 원인을 분리해 빌드 로그를 정리하세요.',
];

const corruptedTextPattern =
  /[\u{fffd}\u{c3}\u{c2}\u{ec}\u{ed}\u{eb}\u{ea}\u{f0}\u{5360}\u{5a9b}\u{6d39}\u{be18}\u{afa9}\u{317c}\u{bfc9}\u{c495}\u{c208}\u{c88e}\u{317b}\u{317d}\u{be2f}\u{b497}\u{f9cf}\u{b76f}\u{bac1}\u{7b4c}\u{7515}\u{63f6}\u{91ab}]/u;

const viewports = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
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

  throw new Error(
    'Chrome or Edge executable was not found. Set CHROME_PATH to a local Chromium-compatible browser.',
  );
}

async function assertServerAvailable(url) {
  let response;

  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  } catch (error) {
    throw new Error(
      `ERP home is not reachable at ${url}. Start the app with "npm run dev" or set ERP_HOME_URL. ${error}`,
    );
  }

  assert.ok(response.ok, `ERP home returned HTTP ${response.status} at ${url}`);
}

function toHomeUrl(url) {
  return new URL('/', url).toString();
}

async function waitForHomeReady(page) {
  await page.waitForLoadState('load', { timeout: 30_000 });
  await page.waitForSelector('main#content-area', { timeout: 15_000 });
  await page.locator('main#content-area button[aria-haspopup="dialog"]').first().waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

async function scrollAllContainersToTop(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    for (const element of Array.from(document.querySelectorAll('*'))) {
      if (element instanceof HTMLElement && element.scrollTop > 0) {
        element.scrollTop = 0;
      }
    }
  });
}

async function openCommandLauncher(page) {
  await page.keyboard.press('Control+K');

  try {
    await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 5_000 });
  } catch {
    await page.locator('main#content-area button[aria-haspopup="dialog"]').first().click();
    await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 5_000 });
  }
}

async function verifyFocusableTarget(page, target, viewportName) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const locator = page.locator(target.selector).first();

    try {
      await locator.waitFor({ state: 'visible', timeout: 5_000 });
      assert.ok((await locator.count()) > 0, `${viewportName} missing ${target.label}`);
      await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));

      assert.equal(
        await locator.evaluate((element) => {
          const style = window.getComputedStyle(element);
          const nativeFocusable = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);

          return (
            nativeFocusable &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            !element.hasAttribute('disabled') &&
            element.tabIndex >= 0
          );
        }),
        true,
        `${viewportName} ${target.label} is not structurally focusable`,
      );

      if (viewportName !== 'mobile') {
        await locator.focus();
        assert.equal(
          await locator.evaluate((element) => document.activeElement === element),
          true,
          `${viewportName} could not focus ${target.label}`,
        );
      }

      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Execution context was destroyed')) throw error;
      await waitForHomeReady(page);
    }
  }

  throw lastError;
}

async function evaluateHomeLayout(page, args) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(({ texts, corruptedPatternSource, corruptedPatternFlags }) => {
        const bodyText = document.body?.innerText || '';
        const root = document.documentElement;
        const corruptedPattern = new RegExp(corruptedPatternSource, corruptedPatternFlags);

        return {
          missingTexts: texts.filter((text) => !bodyText.includes(text)),
          hasCorruptedText: corruptedPattern.test(bodyText),
          scrollWidth: root.scrollWidth,
          viewportWidth: root.clientWidth,
          contentHeight: root.scrollHeight,
        };
      }, args);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Execution context was destroyed')) throw error;
      await waitForHomeReady(page);
    }
  }

  throw lastError;
}

function assertLayoutEvidence(evidence, viewportName) {
  assert.equal(evidence.missing.length, 0, `${viewportName} missing layout evidence for: ${evidence.missing.join(', ')}`);

  for (const item of evidence.items) {
    assert.ok(item.width >= item.minWidth, `${viewportName} ${item.label} is too narrow: ${item.width}px`);
    assert.ok(item.height >= item.minHeight, `${viewportName} ${item.label} is too short: ${item.height}px`);
    assert.ok(item.left >= -1, `${viewportName} ${item.label} extends past the left viewport edge`);
    assert.ok(item.right <= evidence.viewportWidth + 1, `${viewportName} ${item.label} extends past the right viewport edge`);
  }

  assert.deepEqual(
    evidence.overlaps,
    [],
    `${viewportName} key layout regions overlap: ${evidence.overlaps.map((pair) => pair.join(' / ')).join(', ')}`,
  );
}

async function verifyHomeLayoutEvidence(page, viewportName) {
  const evidence = await page.evaluate(() => {
    const targets = [
      { label: 'hero', selector: 'section[aria-labelledby="erp-home-title"]', minWidth: 280, minHeight: 170 },
      { label: 'metrics', selector: 'main#content-area > section[aria-label]', minWidth: 280, minHeight: 90 },
      { label: 'focus modules', selector: 'section[aria-labelledby="focus-modules-title"]', minWidth: 280, minHeight: 180 },
      { label: 'admin pulse', selector: 'section[aria-labelledby="admin-pulse-title"]', minWidth: 260, minHeight: 170 },
      { label: 'business flow', selector: 'section[aria-labelledby="business-modules-title"]', minWidth: 260, minHeight: 120 },
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
  });

  assertLayoutEvidence(evidence, viewportName);
}

async function verifyOperationalReadiness(page, viewportName) {
  await page.getByText(requiredReadinessTexts[0]).first().waitFor({ state: 'visible', timeout: 10_000 });

  const readiness = await page.evaluate(({ required, stale }) => {
    const bodyText = document.body?.innerText || '';

    return {
      missingTexts: required.filter((text) => !bodyText.includes(text)),
      staleTexts: stale.filter((text) => bodyText.includes(text)),
    };
  }, {
    required: requiredReadinessTexts,
    stale: staleReadinessTexts,
  });

  assert.deepEqual(readiness.missingTexts, [], `${viewportName} readiness queue is missing state-derived copy`);
  assert.deepEqual(readiness.staleTexts, [], `${viewportName} readiness queue still renders stale static work`);
}

async function verifyDomainFilterPersistence(page, viewportName) {
  await page.evaluate(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, {
    key: domainFilterStorageKey,
    value: 'workflow',
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForHomeReady(page);

  const domainFilter = page.locator('[aria-label="운영 도메인 필터"]').first();
  await domainFilter.waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForFunction(
    () => {
      const activeButton = document.querySelector('[aria-label="운영 도메인 필터"] button[aria-pressed="true"]');
      return activeButton?.textContent?.includes('Personal Workflow');
    },
    undefined,
    { timeout: 5_000 },
  );

  const activeFilter = domainFilter.locator('button[aria-pressed="true"]').first();
  await activeFilter.waitFor({ state: 'visible', timeout: 5_000 });
  assert.ok(
    ((await activeFilter.textContent()) || '').includes('Personal Workflow'),
    `${viewportName} did not restore the saved workflow domain filter`,
  );
  await page.getByText('개인 업무 도구와 반복 실행 루틴을 엽니다.').waitFor({ state: 'visible', timeout: 5_000 });

  await domainFilter.locator('button', { hasText: 'AI Operations' }).click();
  await page.waitForFunction(
    (key) => window.localStorage.getItem(key) === 'ai',
    domainFilterStorageKey,
    { timeout: 5_000 },
  );
  assert.ok(
    ((await activeFilter.textContent()) || '').includes('AI Operations'),
    `${viewportName} did not activate the AI domain filter after click`,
  );

  await domainFilter.locator('button', { hasText: 'Admin' }).click();
  await page.waitForFunction(
    (key) => window.localStorage.getItem(key) === 'admin',
    domainFilterStorageKey,
    { timeout: 5_000 },
  );
}

async function verifyKeyboardFlow(page, viewportName) {
  await page.evaluate((key) => {
    window.localStorage.setItem(key, JSON.stringify(['module-workflow-/propig']));
  }, recentCommandsStorageKey);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForHomeReady(page);

  const focusTargets = [
    { selector: 'main#content-area a[href="/propig"]', label: 'propig dashboard link' },
    { selector: 'main#content-area button[aria-haspopup="dialog"]', label: 'command launcher button' },
  ];

  for (const target of focusTargets) {
    await verifyFocusableTarget(page, target, viewportName);
  }

  await openCommandLauncher(page);
  const commandInput = page.locator('input[aria-label="ERP 통합 검색어"]').first();
  await commandInput.waitFor({ state: 'visible', timeout: 5_000 });
  const recentCommandStrip = page.locator('[aria-label="최근 실행 명령"]').first();
  await recentCommandStrip.waitFor({ state: 'visible', timeout: 5_000 });
  assert.ok(
    ((await recentCommandStrip.textContent()) || '').includes('propig'),
    `${viewportName} command launcher does not render the saved recent command`,
  );
  await recentCommandStrip.locator('button[aria-label="최근 실행 명령 지우기"]').waitFor({
    state: 'visible',
    timeout: 5_000,
  });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === 'ERP 통합 검색어',
    undefined,
    { timeout: 5_000 },
  );

  const selectedOptions = page.locator('[role="option"][aria-selected="true"]');
  assert.equal(await selectedOptions.count(), 1, `${viewportName} command launcher must expose one active option`);
  assert.equal(
    await commandInput.getAttribute('aria-activedescendant'),
    await selectedOptions.first().getAttribute('id'),
    `${viewportName} command launcher input is not linked to the active option`,
  );

  await page.keyboard.press('ArrowDown');
  assert.equal(
    await selectedOptions.count(),
    1,
    `${viewportName} command launcher must keep one active option after ArrowDown`,
  );
  assert.equal(
    await commandInput.getAttribute('aria-activedescendant'),
    await selectedOptions.first().getAttribute('id'),
    `${viewportName} command launcher active descendant did not follow ArrowDown`,
  );

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      return Boolean(dialog?.contains(document.activeElement) && document.activeElement !== document.body);
    }),
    true,
    `${viewportName} command launcher lets focus escape while tabbing backward`,
  );

  for (let tabIndex = 0; tabIndex < 12; tabIndex += 1) {
    await page.keyboard.press('Tab');
  }
  assert.equal(
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      return Boolean(dialog?.contains(document.activeElement) && document.activeElement !== document.body);
    }),
    true,
    `${viewportName} command launcher lets focus escape while tabbing forward`,
  );

  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"][aria-modal="true"]', { state: 'detached', timeout: 5_000 });
  if (viewportName !== 'mobile') {
    assert.equal(
      await page.locator('main#content-area button[aria-haspopup="dialog"]').first().evaluate((element) => document.activeElement === element),
      true,
      `${viewportName} command launcher did not restore focus to its trigger`,
    );
  }
}

async function verifyPersonalWorkspaceFlow(page, viewportName) {
  await page.evaluate(({ pinnedKey, recentKey }) => {
    window.localStorage.removeItem(pinnedKey);
    window.localStorage.removeItem(recentKey);
  }, {
    pinnedKey: pinnedModulesStorageKey,
    recentKey: recentModulesStorageKey,
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForHomeReady(page);

  assert.equal(
    await page.locator('section[aria-labelledby="personal-workspace-title"]').count(),
    0,
    `${viewportName} personal workspace should be hidden before saved module data exists`,
  );

  const pinButton = page.locator('main#content-area [data-erp-module-pin="/propig"]').first();
  await pinButton.waitFor({ state: 'visible', timeout: 5_000 });
  await pinButton.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await pinButton.click();

  const personalWorkspace = page.locator('section[aria-labelledby="personal-workspace-title"]').first();
  await personalWorkspace.waitFor({ state: 'visible', timeout: 5_000 });

  const pinnedState = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '[]'), pinnedModulesStorageKey);
  assert.equal(pinnedState[0], '/propig', `${viewportName} pinned module was not persisted`);
  assert.equal(await pinButton.getAttribute('aria-pressed'), 'true', `${viewportName} pin button did not expose pressed state`);
  assert.equal(
    await personalWorkspace.locator('[data-erp-module-link="/propig"]').count(),
    1,
    `${viewportName} personal workspace did not render the pinned module link`,
  );

  const syncBadge = personalWorkspace.locator('[data-erp-preference-sync]').first();
  await syncBadge.waitFor({ state: 'visible', timeout: 5_000 });
  const syncState = await syncBadge.getAttribute('data-erp-preference-sync');
  assert.ok(
    ['local', 'checking', 'syncing', 'synced', 'error'].includes(syncState || ''),
    `${viewportName} personal workspace exposes an invalid sync state: ${syncState}`,
  );
  assert.ok((await syncBadge.textContent())?.trim(), `${viewportName} sync badge has no readable label`);

  const resetButton = personalWorkspace.locator('[data-erp-personal-reset="true"]').first();
  await resetButton.waitFor({ state: 'visible', timeout: 5_000 });
  await resetButton.click();
  await page.waitForSelector('section[aria-labelledby="personal-workspace-title"]', {
    state: 'detached',
    timeout: 5_000,
  });
  const resetPinnedState = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '[]'), pinnedModulesStorageKey);
  assert.deepEqual(resetPinnedState, [], `${viewportName} reset did not clear pinned module storage`);

  await pinButton.click();
  await page.locator('section[aria-labelledby="personal-workspace-title"]').first().waitFor({
    state: 'visible',
    timeout: 5_000,
  });
  await page.locator('[data-erp-preference-sync]').first().waitFor({ state: 'visible', timeout: 5_000 });

  const layoutState = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    layoutState.scrollWidth <= layoutState.viewportWidth + 1,
    `${viewportName} personal workspace creates horizontal overflow`,
  );
}

async function verifyPreferenceModes(page, viewportName) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForHomeReady(page);

  const reducedMotionState = await page.evaluate(() => {
    const animatedElements = Array.from(
      document.querySelectorAll('main#content-area section, main#content-area aside'),
    ).filter((element) => {
      const animationName = window.getComputedStyle(element).animationName;
      return animationName !== 'none';
    });

    return {
      matches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      animatedCount: animatedElements.length,
    };
  });

  assert.equal(reducedMotionState.matches, true, `${viewportName} did not enter reduced-motion mode`);
  assert.equal(reducedMotionState.animatedCount, 0, `${viewportName} still has section animations in reduced-motion mode`);

  await openCommandLauncher(page);
  const dialogAnimation = await page
    .locator('[role="dialog"][aria-modal="true"]')
    .evaluate((element) => window.getComputedStyle(element).animationName);
  assert.equal(dialogAnimation, 'none', `${viewportName} launcher dialog animates in reduced-motion mode`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"][aria-modal="true"]', { state: 'detached', timeout: 5_000 });

  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForHomeReady(page);

  const forcedColorState = await page.evaluate(() => {
    const shell = document.querySelector('main#content-area');
    const heroLink = document.querySelector('main#content-area a[href="/propig"]');
    const commandButton = document.querySelector('main#content-area button[aria-haspopup="dialog"]');
    const shellStyle = shell ? window.getComputedStyle(shell) : null;
    const heroLinkStyle = heroLink ? window.getComputedStyle(heroLink) : null;
    const commandButtonStyle = commandButton ? window.getComputedStyle(commandButton) : null;

    return {
      matches: window.matchMedia('(forced-colors: active)').matches,
      shellBackgroundImage: shellStyle?.backgroundImage ?? '',
      heroLinkBorderStyle: heroLinkStyle?.borderTopStyle ?? '',
      commandButtonBorderStyle: commandButtonStyle?.borderTopStyle ?? '',
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  assert.equal(forcedColorState.matches, true, `${viewportName} did not enter forced-colors mode`);
  assert.equal(forcedColorState.shellBackgroundImage, 'none', `${viewportName} keeps decorative background in forced-colors mode`);
  assert.notEqual(forcedColorState.heroLinkBorderStyle, 'none', `${viewportName} primary link loses border in forced-colors mode`);
  assert.notEqual(
    forcedColorState.commandButtonBorderStyle,
    'none',
    `${viewportName} command button loses border in forced-colors mode`,
  );
  assert.ok(
    forcedColorState.scrollWidth <= forcedColorState.viewportWidth + 1,
    `${viewportName} forced-colors layout has horizontal overflow`,
  );
}

await mkdir(screenshotDir, { recursive: true });

const homeUrl = toHomeUrl(baseUrl);
await assertServerAvailable(homeUrl);

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

    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForHomeReady(page);

    const layout = await evaluateHomeLayout(page, {
      texts: requiredTexts,
      corruptedPatternSource: corruptedTextPattern.source,
      corruptedPatternFlags: corruptedTextPattern.flags,
    });

    assert.deepEqual(layout.missingTexts, [], `${viewport.name} layout is missing required text`);
    assert.equal(layout.hasCorruptedText, false, `${viewport.name} layout contains corrupted Korean text`);
    assert.ok(
      layout.scrollWidth <= layout.viewportWidth + 1,
      `${viewport.name} layout has horizontal overflow: ${layout.scrollWidth}px > ${layout.viewportWidth}px`,
    );
    assert.ok(
      layout.contentHeight >= Math.min(viewport.height, 700),
      `${viewport.name} layout did not render enough content`,
    );

    await verifyHomeLayoutEvidence(page, viewport.name);
    await verifyOperationalReadiness(page, viewport.name);
    await verifyDomainFilterPersistence(page, viewport.name);
    await verifyKeyboardFlow(page, viewport.name);
    await verifyPersonalWorkspaceFlow(page, viewport.name);
    await scrollAllContainersToTop(page);

    const screenshotPath = path.join(screenshotDir, `erp-home-${viewport.name}.png`);
    await captureVerifiedScreenshot(page, {
      screenshotPath,
      minSize: 20_000,
      viewportName: viewport.name,
      slug: 'ERP home',
      probe: { label: 'ERP home title', selector: '#erp-home-title' },
    });

    await verifyPreferenceModes(page, viewport.name);

    console.log(
      `${viewport.name} ERP home layout, keyboard, motion, and contrast check passed (${layout.viewportWidth}px viewport, screenshot: ${screenshotPath})`,
    );

    await context.close();
  }
} finally {
  await browser.close();
}

console.log('ERP home responsive screenshot, keyboard, motion, and contrast verification passed');
