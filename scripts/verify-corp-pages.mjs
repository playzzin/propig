import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { captureVerifiedScreenshot, waitForAnimationFrame } from './screenshot-quality.mjs';

const baseUrl = process.env.CORP_PAGES_URL || process.env.ERP_HOME_URL || process.env.BASE_URL || 'http://localhost:3002/';
const screenshotDir = path.resolve(process.env.CORP_PAGES_SCREENSHOT_DIR || '.tmp-corp-pages');
const corruptedTextPattern =
  /[\u{fffd}\u{c3}\u{c2}\u{ec}\u{ed}\u{eb}\u{ea}\u{f0}\u{5360}\u{5a9b}\u{6d39}\u{be18}\u{afa9}\u{317c}\u{bfc9}\u{c495}\u{c208}\u{c88e}\u{317b}\u{317d}\u{be2f}\u{b497}\u{f9cf}\u{b76f}\u{bac1}\u{7b4c}\u{7515}\u{63f6}\u{91ab}]/u;

const viewports = [
  { name: 'desktop', width: 1366, height: 860, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
];

const pageSpecs = [
  {
    slug: 'corp-home',
    path: '/corp',
    requiredTexts: ['기업 사이트 홈', '기업 운영 메뉴', '사업제휴', '제휴하기'],
    targets: [
      { label: 'hero heading', selector: 'h1,h2', text: '기업 사이트 홈', minWidth: 140, minHeight: 18 },
      { label: 'operations menu', selector: 'h2,section,div', text: '기업 운영 메뉴', minWidth: 180, minHeight: 28 },
      { label: 'partnership entry', selector: '#content-area a,#content-area article,#content-area button', text: '사업제휴', minWidth: 90, minHeight: 38 },
    ],
  },
  {
    slug: 'company-introduction',
    path: '/corp/company/introduction',
    requiredTexts: ['BRAND PORTFOLIO', '그냥돼지 연혁', '회사통계', '리셀러 파트너'],
    screenshotProbe: { label: 'company brands section', selector: '#company-brands', minWidth: 280, minHeight: 180 },
    targets: [
      { label: 'brands section', selector: '#company-brands', text: 'BRAND PORTFOLIO', minWidth: 150, minHeight: 28 },
      { label: 'history section', selector: 'h2,section,div', text: '그냥돼지 연혁', minWidth: 150, minHeight: 28 },
    ],
  },
  {
    slug: 'product-introduction',
    path: '/corp/company/product-introduction',
    requiredTexts: ['제품소개', 'PRODUCT CATALOG', '웹제품 스타터', '리셀러 파트너', 'CY 모바일 현장일보 웹앱', 'CY 실제 구동', 'CY 상품 견적 요청'],
    screenshotProbe: { label: 'business panorama', selector: '#product-business-panorama', minWidth: 280, minHeight: 180 },
    targets: [
      { label: 'product heading', selector: 'h1', text: '제품소개', minWidth: 90, minHeight: 18 },
      { label: 'product catalog', selector: 'h1,h2,section,div,span,strong', text: 'PRODUCT CATALOG', minWidth: 120, minHeight: 18 },
      { label: 'purchase consultation', selector: 'a', text: '구매 상담 신청', minWidth: 110, minHeight: 36 },
    ],
  },
  {
    slug: 'staff-intro',
    path: '/corp/company/staff-intro',
    requiredTexts: ['AI DRIVEN', '총괄본부장', '10개 전문 부서', 'DIVISION NETWORK', '확장 전문 5개 부서', '사업확장부', '전략적 지원 조직'],
    targets: [
      { label: 'staff heading', selector: 'h1,h2', text: 'AI와 사람이 함께 만드는', minWidth: 200, minHeight: 54 },
      { label: 'division network', selector: 'span,h2,section,div', text: 'DIVISION NETWORK', minWidth: 120, minHeight: 20 },
      { label: 'division heading', selector: 'h2,section,div', text: '10개 전문 부서', minWidth: 130, minHeight: 30 },
    ],
    performanceTargets: [
      { label: 'staff org nodes', selector: '[data-performance-region="staff-org-node"]' },
      { label: 'staff flow steps', selector: '[data-performance-region="staff-flow-step"]' },
    ],
  },
  {
    slug: 'ceo-intro',
    path: '/corp/company/ceo-intro',
    requiredTexts: ['대표인사말', '사진을 눌러 그뚠이의 이야기를 들어보세요.', '대표이력서', '창업배경', '대표통계'],
    screenshotProbe: { label: 'ceo greeting character', selector: 'img.portrait-image', minLuminanceRange: 20, minContrastPixelRatio: 0.002 },
    targets: [
      { label: 'ceo greeting prompt', selector: '.portrait-hint', text: '사진을 눌러 그뚠이의 이야기를 들어보세요.', minWidth: 160, minHeight: 16 },
      { label: 'ceo greeting tab', selector: 'button', text: '대표인사말', minWidth: 100, minHeight: 34 },
      { label: 'ceo resume tab', selector: 'button', text: '대표이력서', minWidth: 100, minHeight: 34 },
    ],
  },
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
    throw new Error(`Corporate page is not reachable at ${url}. Start the app with "npm run dev". ${error}`);
  }

  assert.ok(response.ok, `Corporate page returned HTTP ${response.status} at ${url}`);
}

async function waitForRequiredText(page, spec) {
  await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {});
  await page.getByText(spec.requiredTexts[0]).first().waitFor({ state: 'attached', timeout: 20_000 });

  try {
    await page.waitForFunction(
      (requiredTexts) => {
        const bodyText = document.body?.textContent || '';
        return requiredTexts.every((text) => bodyText.includes(text));
      },
      spec.requiredTexts,
      { timeout: 20_000 },
    );
  } catch (error) {
    const bodyText = await page.evaluate(() => document.body?.textContent || '').catch(() => '');
    const missingTexts = spec.requiredTexts.filter((text) => !bodyText.includes(text));
    throw new Error(`${spec.slug} did not render required text: ${missingTexts.join(', ') || String(error)}`);
  }
}

async function scrollPageToTop(page) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
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
      return;
    } catch (error) {
      lastError = error;
      if (!String(error).includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  throw lastError;
}

async function waitForVisualReady(page, spec) {
  const imageSelector = spec.screenshotProbe?.selector;
  if (imageSelector?.startsWith('img')) {
    await page.waitForFunction((selector) => {
      const image = document.querySelector(selector);
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    }, imageSelector, { timeout: 30_000 });
  }
  if (spec.visualReadySelector) {
    let lastError;
    let isReady = false;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await page.waitForFunction(
          (selector) => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return false;

            const style = window.getComputedStyle(element);
            const opacity = Number.parseFloat(style.opacity || '1');

            return style.display !== 'none' && style.visibility !== 'hidden' && opacity >= 0.98;
          },
          spec.visualReadySelector,
          { timeout: 15_000 },
        );
        isReady = true;
        break;
      } catch (error) {
        lastError = error;
        if (!String(error).includes('Execution context was destroyed')) throw error;
        await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }

    if (!isReady) {
      throw lastError;
    }
  }

  await waitForAnimationFrame(page);
}

async function waitForStaffDrawerVisualReady(page) {
  await page.waitForFunction(
    () => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="false"][aria-labelledby="profile-drawer-title"]');
      if (!(dialog instanceof HTMLElement)) return false;

      const rect = dialog.getBoundingClientRect();
      const rightGap = window.innerWidth - rect.right;
      return rect.width > 280 && rightGap >= 0 && rightGap <= 32;
    },
    undefined,
    { timeout: 10_000 },
  );
  await waitForAnimationFrame(page);
}

async function evaluateCorporatePage(page, spec) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const evidence = await page.evaluate((currentSpec) => {
        const root = document.documentElement;
        const bodyText = document.body?.innerText || '';
        const requiredBodyText = document.body?.textContent || '';
        const missingLayout = [];
        const items = [];
        const performanceItems = [];

        const hasVisibleOpacity = (element) => {
          let current = element;

          while (current instanceof HTMLElement) {
            const opacity = Number.parseFloat(window.getComputedStyle(current).opacity || '1');
            if (opacity < 0.05) return false;
            current = current.parentElement;
          }

          return true;
        };

        const hasLayoutBox = (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          );
        };

        const isVisible = (element) => hasLayoutBox(element) && hasVisibleOpacity(element);
        const intersectsHorizontalViewport = (element) => {
          const rect = element.getBoundingClientRect();
          return rect.right >= -1 && rect.left <= window.innerWidth + 1;
        };

        const findByText = (selector, text) =>
          Array.from(document.querySelectorAll(selector)).find(
            (element) => element.textContent?.includes(text) && isVisible(element) && intersectsHorizontalViewport(element),
          );

        for (const target of currentSpec.targets) {
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
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          });
        }

        for (const target of currentSpec.performanceTargets ?? []) {
          const elements = Array.from(document.querySelectorAll(target.selector)).filter(hasLayoutBox);
          performanceItems.push({
            ...target,
            count: elements.length,
            styles: elements.slice(0, 4).map((element) => {
              const style = window.getComputedStyle(element);
              return {
                contentVisibility: style.contentVisibility,
                containIntrinsicSize: style.containIntrinsicSize,
              };
            }),
          });
        }

        return {
          bodyText,
          headerNavLabels: Array.from(document.querySelectorAll('.corp-header-link'))
            .filter(isVisible)
            .map((element) => element.textContent?.trim())
            .filter(Boolean),
          companySectionNavLabels: Array.from(document.querySelectorAll('nav a'))
            .filter((element) => element.textContent && isVisible(element))
            .map((element) => element.textContent.replace(/\s+/g, ' ').trim())
            .filter(Boolean),
          scrollWidth: root.scrollWidth,
          viewportWidth: root.clientWidth,
          contentHeight: root.scrollHeight,
          missingTexts: currentSpec.requiredTexts.filter((text) => !requiredBodyText.includes(text)),
          missingLayout,
          items,
          performanceItems,
        };
      }, spec);

      if ((evidence.missingTexts.length > 0 || evidence.missingLayout.length > 0) && attempt < 3) {
        await page.waitForTimeout(350);
        await waitForAnimationFrame(page);
        continue;
      }

      return evidence;
    } catch (error) {
      lastError = error;
      if (!String(error).includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  throw lastError;
}

function assertCorporatePage(evidence, viewportName, spec) {
  assert.deepEqual(evidence.missingTexts, [], `${viewportName} ${spec.slug} is missing required copy`);
  assert.equal(corruptedTextPattern.test(evidence.bodyText), false, `${viewportName} ${spec.slug} contains corrupted Korean text`);
  assert.ok(evidence.scrollWidth <= evidence.viewportWidth + 1, `${viewportName} ${spec.slug} has horizontal overflow`);
  assert.ok(evidence.contentHeight >= 420, `${viewportName} ${spec.slug} did not render enough content`);

  assert.deepEqual(
    evidence.missingLayout,
    [],
    `${viewportName} ${spec.slug} missing layout evidence for: ${evidence.missingLayout.join(', ')}`,
  );

  for (const item of evidence.items) {
    assert.ok(item.width >= item.minWidth, `${viewportName} ${spec.slug} ${item.label} is too narrow: ${item.width}px`);
    assert.ok(item.height >= item.minHeight, `${viewportName} ${spec.slug} ${item.label} is too short: ${item.height}px`);
    assert.ok(item.left >= -1, `${viewportName} ${spec.slug} ${item.label} extends past the left viewport edge`);
    assert.ok(item.right <= evidence.viewportWidth + 1, `${viewportName} ${spec.slug} ${item.label} extends past the right viewport edge`);
  }

  for (const item of evidence.performanceItems ?? []) {
    assert.ok(item.count > 0, `${viewportName} ${spec.slug} missing performance evidence for ${item.label}`);
    for (const style of item.styles) {
      assert.equal(
        style.contentVisibility,
        'auto',
        `${viewportName} ${spec.slug} ${item.label} does not use content-visibility: auto`,
      );
      assert.notEqual(
        style.containIntrinsicSize,
        'none',
        `${viewportName} ${spec.slug} ${item.label} is missing contain-intrinsic-size`,
      );
    }
  }
}

async function verifyStaffDrawerAccessibility(page, viewportName, screenshotPath) {
  const profileTrigger = page.locator('button[aria-label$="상세 프로필 열기"]').first();
  await profileTrigger.waitFor({ state: 'visible', timeout: 10_000 });
  await profileTrigger.scrollIntoViewIfNeeded();
  await profileTrigger.focus();
  const triggerLabel = await profileTrigger.getAttribute('aria-label');
  await profileTrigger.click();

  const dialog = page.locator('[role="dialog"][aria-modal="false"][aria-labelledby="profile-drawer-title"]').first();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(
    await page.locator('[role="dialog"][aria-modal="true"][aria-labelledby="profile-drawer-title"]').count(),
    0,
    `${viewportName} staff profile must remain non-modal`,
  );

  const closeButton = dialog.locator('button[aria-label="프로필 닫기"]').first();
  await closeButton.waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '프로필 닫기', undefined, {
    timeout: 5_000,
  });

  await waitForStaffDrawerVisualReady(page);
  await captureVerifiedScreenshot(page, {
    screenshotPath,
    minSize: viewportName === 'mobile' ? 8_000 : 12_000,
    viewportName,
    slug: 'staff drawer',
    probe: { label: 'staff drawer title', selector: '#profile-drawer-title', minLuminanceRange: 55 },
  });

  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '프로필 닫기', undefined, {
    timeout: 5_000,
  });

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
  await page.waitForFunction(
    (expectedLabel) => document.activeElement?.getAttribute('aria-label') === expectedLabel,
    triggerLabel,
    { timeout: 5_000 },
  );
}

async function verifyCeoProfileSwitch(page, viewportName) {
  const tabs = page.getByRole('tablist', { name: '대표소개서 탭 선택' });
  assert.deepEqual(await tabs.getByRole('tab').evaluateAll((items) => items.map((item) => item.querySelector('strong')?.textContent)),
    ['대표인사말', '대표이력서', '창업배경', '대표통계'], `${viewportName} CEO tab order changed`);
  assert.equal(await tabs.getByRole('tab', { name: /대표인사말/ }).getAttribute('aria-selected'), 'true');
  const greetingPhoto = page.locator('button[data-greeting-stage]');
  const speech = page.locator('#ceo-greeting-speech');
  assert.equal(await speech.isVisible(), false, `${viewportName} greeting speech should open on click`);
  assert.equal(await page.locator('.greeting-letter').isVisible(), false);
  await greetingPhoto.click();
  assert.equal(await speech.isVisible(), true);
  assert.ok((await speech.innerText()).includes('슈퍼 뚠뚠이 입니다'));
  assert.equal(await speech.locator('#ceo-greeting-title').isVisible(), true);
  assert.equal(await speech.locator('.greeting-body > p').count(), 4);
  assert.ok((await speech.locator('.greeting-letter').innerText()).includes('함께해 주셔서 감사합니다.'));
  for (let stage = 2; stage <= 5; stage += 1) {
    await greetingPhoto.click();
    assert.equal(await greetingPhoto.getAttribute('data-greeting-stage'), String(stage));
    assert.ok((await greetingPhoto.locator('img').getAttribute('src')).includes(`vision-stage-${stage}`));
  }
  await greetingPhoto.click();
  assert.equal(await greetingPhoto.getAttribute('data-greeting-stage'), '1');
  await page.keyboard.press('Escape');
  assert.equal(await speech.isVisible(), false);
  assert.equal(await page.locator('.greeting-letter').isVisible(), false);
  assert.equal(await greetingPhoto.evaluate((button) => document.activeElement === button), true);
  await greetingPhoto.click();
  const signature = speech.getByRole('img', { name: '그뚠이 손글씨 사인' });
  await signature.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const image = document.querySelector('img[alt="그뚠이 손글씨 사인"]');
    return image?.complete && image.naturalWidth > 0;
  });
  await tabs.getByRole('tab', { name: /대표이력서/ }).click();
  assert.equal(await page.locator('#dashboard2-intro .ceo-hero-badge, #dashboard2-intro .ceo-hero-title, #dashboard2-intro .ceo-hero-description').count(), 0,
    `${viewportName} CEO resume should have no promotional header`);
  assert.equal(await page.locator('[data-ceo-hero-accordion-trigger]').count(), 5);
  const profileTrigger = page.locator('[data-ceo-hero-profile-trigger]');
  assert.equal(await profileTrigger.count(), 1, `${viewportName} CEO profile trigger must be unique`);

  await profileTrigger.scrollIntoViewIfNeeded();
  await profileTrigger.click();
  await page.waitForFunction(
    () => {
      const trigger = document.querySelector('[data-ceo-hero-profile-trigger="1"]');
      const image = trigger?.querySelector('img');
      const source = image?.getAttribute('src') ?? '';
      const matchesProfile = source.includes('upload_1780878139007') || source === '/images/corp/founder-story/vision-stage-2.png';
      return matchesProfile && image?.complete && image.naturalWidth > 0;
    },
    undefined,
    { timeout: 10_000 },
  );
}

async function verifyCompanyDashboardExperience(page, viewportName) {
  const expectedSectionOrder = [
    'company-brands',
    'company-introduction-history',
    'dashboard2-operating',
  ];

  const initialEvidence = await page.evaluate(() => {
    const main = document.querySelector('main#content-area');
    return {
      sectionIds: Array.from(main?.children ?? [])
        .filter((element) => element.tagName === 'SECTION')
        .map((element) => element.id),
      mainScrollWidth: main?.scrollWidth ?? 0,
      mainClientWidth: main?.clientWidth ?? 0,
      businessVideoFrameCount: document.querySelectorAll('iframe[src*="youtube-nocookie.com/embed/"]').length,
      visionSectionCount: document.querySelectorAll('#company-introduction-vision').length,
    };
  });

  assert.deepEqual(
    initialEvidence.sectionIds.slice(0, expectedSectionOrder.length),
    expectedSectionOrder,
    `${viewportName} company introduction section order did not match the requested sequence`,
  );
  assert.ok(
    initialEvidence.mainScrollWidth <= initialEvidence.mainClientWidth + 1,
    `${viewportName} company introduction main content has horizontal overflow`,
  );
  assert.equal(
    initialEvidence.businessVideoFrameCount,
    0,
    `${viewportName} company introduction must not render the product introduction video`,
  );
  assert.equal(initialEvidence.visionSectionCount, 0, `${viewportName} company vision is merged into the execution section`);
  assert.equal(await page.locator('#dashboard2-intro').count(), 0, `${viewportName} company introduction must not render the introduction hero`);
  assert.equal(await page.locator('#company-introduction-technology').count(), 0, `${viewportName} company introduction must not render the technology section`);

  assert.equal(await page.locator('iframe[data-business-area-preview], #company-introduction-execution').count(), 0,
    `${viewportName} product showcase sections must no longer render on company introduction`);

  const historySection = page.locator('#company-introduction-history');
  await historySection.scrollIntoViewIfNeeded();
  const waitForHistoryHead = (insideTimeline = false) => page.waitForFunction(
    (inside) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;

      const main = document.querySelector('main#content-area');
      const rail = document.querySelector('#company-introduction-history .history-rail');
      const head = document.querySelector('#company-introduction-history .history-rail-head');
      if (!(main instanceof HTMLElement) || !(rail instanceof HTMLElement) || !(head instanceof HTMLElement)) return false;

      const mainRect = main.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      const headRect = head.getBoundingClientRect();
      const railCenterX = railRect.left + railRect.width / 2;
      const headCenterX = headRect.left + headRect.width / 2;
      const headCenterY = headRect.top + headRect.height / 2;

      const mainStyle = window.getComputedStyle(main);
      const mainIsScrollRoot = /(auto|scroll|overlay)/.test(mainStyle.overflowY)
        && main.scrollHeight > main.clientHeight + 1;
      const viewportCenterY = mainIsScrollRoot
        ? mainRect.top + main.clientHeight / 2
        : window.innerHeight / 2;
      const expectedCenterY = Math.min(railRect.bottom, Math.max(railRect.top, viewportCenterY));
      if (inside && (viewportCenterY <= railRect.top || viewportCenterY >= railRect.bottom)) return false;

      return Math.abs(railCenterX - headCenterX) <= 1 && Math.abs(expectedCenterY - headCenterY) <= 3;
    },
    insideTimeline,
    { timeout: 10_000 },
  );
  await waitForHistoryHead();
  await historySection.locator('[data-history-item]').nth(3).evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await waitForHistoryHead(true);

  const radarTab = page.locator('[data-dashboard-operating-tab="radar"]');
  await radarTab.scrollIntoViewIfNeeded();
  await radarTab.click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-radar-corner-label]').length === 5,
    undefined,
    { timeout: 5_000 },
  );
  await page.locator('[data-dashboard-motion="chart"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const chart = document.querySelector('[data-dashboard-motion="chart"]');
    return chart && Number.parseFloat(getComputedStyle(chart).opacity) >= 0.99;
  }, undefined, { timeout: 5_000 });

  const radarEvidence = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('[data-radar-corner-label]'));
    const rects = labels.map((label) => label.getBoundingClientRect());
    const overlaps = rects.flatMap((current, index) =>
      rects.slice(index + 1).map((candidate) =>
        Math.max(0, Math.min(current.right, candidate.right) - Math.max(current.left, candidate.left)) *
        Math.max(0, Math.min(current.bottom, candidate.bottom) - Math.max(current.top, candidate.top)),
      ),
    );
    const main = document.querySelector('main#content-area');
    const chartPanel = document.querySelector('[data-dashboard-motion="chart"]');

    return {
      labelTexts: labels.map((label) => label.textContent?.replace(/\s+/g, ' ').trim()),
      hasOverlap: overlaps.some((area) => area > 0),
      chartOpacity: chartPanel ? Number.parseFloat(getComputedStyle(chartPanel).opacity || '0') : 0,
      mainScrollWidth: main?.scrollWidth ?? 0,
      mainClientWidth: main?.clientWidth ?? 0,
    };
  });

  assert.deepEqual(
    radarEvidence.labelTexts,
    ['UX 설계92%', 'AI 활용88%', '미디어 품질90%', '보안·권한86%', '데이터 구조89%'],
    `${viewportName} quality radar corner labels do not match their values`,
  );
  assert.equal(radarEvidence.hasOverlap, false, `${viewportName} quality radar corner labels overlap`);
  assert.ok(radarEvidence.chartOpacity >= 0.99, `${viewportName} quality radar chart panel is not visible`);
  assert.ok(
    radarEvidence.mainScrollWidth <= radarEvidence.mainClientWidth + 1,
    `${viewportName} quality radar creates horizontal overflow`,
  );
}

async function verifyProductShowcase(page, viewportName) {
  await page.waitForFunction(() => document.querySelector('iframe[data-business-area-preview]')?.dataset.previewReady === 'true');
  const structure = await page.locator('main#content-area').evaluate(main => ({
    sections: Array.from(main.children).filter(n => n.tagName === 'SECTION' || n.hasAttribute('data-product-catalog')).map(n => n.id || 'catalog'),
    overflow: main.scrollWidth > main.clientWidth + 1,
    nestedMain: main.querySelectorAll('main').length,
  }));
  assert.deepEqual(structure.sections, ['product-business-panorama', 'company-introduction-execution', 'catalog']);
  assert.equal(structure.overflow, false, `${viewportName} product introduction overflow`);
  assert.equal(structure.nestedMain, 0);
  const frame = page.frameLocator('iframe[data-business-area-preview]');
  assert.equal(await frame.locator('#heroTabs [role=tab]').count(), 5);
  assert.equal(await frame.locator('#filmRail [role=tab]').count(), 10);
  const automationTab = page.locator('#company-execution-tab-automation');
  await automationTab.scrollIntoViewIfNeeded();
  await automationTab.click();
  const panel = page.locator('#company-execution-panel');
  assert.equal(await panel.getAttribute('aria-labelledby'), 'company-execution-tab-automation');
  assert.equal(await panel.locator('[data-execution-stage]').count(), 5);
  assert.ok((await panel.textContent()).includes('업무 흐름 측정'));
  assert.ok((await panel.textContent()).includes('안정화와 확장'));
}

async function verifyCompanyRouteNavigation(context, viewport) {
  const page = await context.newPage();
  const runtimeErrors = [];
  const routeSpecs = [
    { path: '/corp/company/ceo-intro', text: '사진을 눌러 그뚠이의 이야기를 들어보세요.' },
    { path: '/corp/company/staff-intro', text: 'DIVISION NETWORK' },
    { path: '/corp/company/product-introduction', text: 'PRODUCT CATALOG' },
    { path: '/corp/company/introduction', text: 'SIMPLYPIG' },
  ];
  const removedPaths = [
    '/corp/project',
    '/corp/portfolio',
    '/corp/company/history',
    '/corp/company/founding-background',
    '/corp/company/vision',
    '/corp/company/vision-mission',
    '/corp/company/company-values',
    '/corp/company/social-contribution',
    '/corp/company/technology',
    '/corp/company/location',
  ];

  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('removeChild')) {
      runtimeErrors.push(message.text());
    }
  });

  try {
    await page.goto(new URL('/corp/company/introduction', baseUrl).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await waitForRequiredText(page, {
      slug: 'company navigation start',
      requiredTexts: ['SIMPLYPIG'],
    });

    assert.equal(await page.locator('#sidebar').count(), 1, `${viewport.name} company routes must preserve the site navigation`);
    await page.getByRole('button', { name: '로그인', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await page.locator('#sidebar').getByText('프로젝트', { exact: true }).count(), 0, 'Removed project menu must not return');
    assert.equal(await page.locator('#sidebar').getByText('포트폴리오', { exact: true }).count(), 0, 'Removed portfolio menu must not return');
    assert.equal(await page.locator('.site-mode-switcher-trigger').count(), 0, `${viewport.name} site selection belongs in the login dialog`);

    for (const path of removedPaths) {
      const response = await context.request.get(new URL(path, baseUrl).toString());
      assert.equal(
        response.status(),
        404,
        `${viewport.name} removed company route must return 404: ${path}`,
      );
    }

    for (const route of routeSpecs) {
      const targetUrl = new URL(route.path, baseUrl).toString();
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      assert.equal(response?.status(), 200, `${viewport.name} company route did not return 200: ${route.path}`);
      await waitForRequiredText(page, {
        slug: `company navigation ${route.path}`,
        requiredTexts: [route.text],
      });
      assert.equal(await page.locator('#sidebar').count(), 1, `${viewport.name} company route lost site navigation: ${route.path}`);
    }

    assert.deepEqual(runtimeErrors, [], `${viewport.name} company submenu navigation emitted runtime errors`);
  } finally {
    await page.close();
  }
}

await mkdir(screenshotDir, { recursive: true });
await assertServerAvailable(new URL('/corp', baseUrl).toString());

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

    for (const spec of pageSpecs) {
      const page = await context.newPage();
      const pageUrl = new URL(spec.path, baseUrl);
      await page.goto(pageUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForRequiredText(page, spec);
      await waitForVisualReady(page, spec);

      const evidence = await evaluateCorporatePage(page, spec);
      assertCorporatePage(evidence, viewport.name, spec);

      await scrollPageToTop(page);
      await waitForVisualReady(page, spec);
      const screenshotPath = path.join(screenshotDir, `${spec.slug}-${viewport.name}.png`);
      await captureVerifiedScreenshot(page, {
        screenshotPath,
        minSize: viewport.isMobile ? 8_000 : 12_000,
        viewportName: viewport.name,
        slug: spec.slug,
        probe: spec.screenshotProbe ?? spec.targets[0],
      });

      if (spec.interaction === 'staff-drawer') {
        const interactionScreenshotPath = path.join(screenshotDir, `${spec.slug}-drawer-${viewport.name}.png`);
        await verifyStaffDrawerAccessibility(page, viewport.name, interactionScreenshotPath);
      }

      if (spec.slug === 'ceo-intro') {
        await verifyCeoProfileSwitch(page, viewport.name);
      }

      if (spec.slug === 'company-introduction') {
        await verifyCompanyDashboardExperience(page, viewport.name);
      }
      if (spec.slug === 'product-introduction') {
        await verifyProductShowcase(page, viewport.name);
      }

      await page.close();
    }

    await verifyCompanyRouteNavigation(context, viewport);
    await context.close();
    console.log(`${viewport.name} corporate page verification passed for ${pageSpecs.length} pages`);
  }
} finally {
  await browser.close();
}
