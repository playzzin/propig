import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { captureVerifiedScreenshot, waitForAnimationFrame } from './screenshot-quality.mjs';

const baseUrl = process.env.CORP_PAGES_URL || process.env.ERP_HOME_URL || 'http://localhost:3002/';
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
    requiredTexts: ['기업 사이트 홈', '기업 운영 메뉴', '프로젝트', '사업제휴'],
    targets: [
      { label: 'hero heading', selector: 'h1,h2', text: '기업 사이트 홈', minWidth: 140, minHeight: 18 },
      { label: 'operations menu', selector: 'h2,section,div', text: '기업 운영 메뉴', minWidth: 180, minHeight: 28 },
      { label: 'project entry', selector: 'a,article,button', text: '프로젝트', minWidth: 90, minHeight: 38 },
    ],
  },
  {
    slug: 'company-introduction',
    path: '/corp/company/introduction',
    requiredTexts: ['SIMPLYPIG', '복잡한 기술을', '제품소개', 'SIMPLYPIG TECHNOLOGY', '통합 실행 체계', 'SIMPLYPIG VISION', 'AI 웹·앱 개발', '리셀러 파트너'],
    screenshotProbe: { label: 'SIMPLYPIG company heading', selector: '#dashboard2-title', text: '복잡한 기술을', minWidth: 180, minHeight: 30 },
    targets: [
      { label: 'company heading', selector: '#dashboard2-title,h1,h2', text: '복잡한 기술을', minWidth: 180, minHeight: 30 },
      { label: 'execution section', selector: 'h2,section,div', text: '통합 실행 체계', minWidth: 150, minHeight: 28 },
      { label: 'hero capability', selector: 'article,section,div,span', text: '전문 제품·서비스', minWidth: 90, minHeight: 24 },
    ],
  },
  {
    slug: 'company-history',
    path: '/corp/company/history',
    requiredTexts: ['그냥돼지 연혁', '2016년 설립 이후', 'NEXT GROWTH'],
    targets: [
      { label: 'history heading', selector: 'h1,h2', text: '그냥돼지 연혁', minWidth: 130, minHeight: 30 },
      { label: 'timeline intro', selector: 'p,section,div', text: '2016년 설립 이후', minWidth: 200, minHeight: 24 },
      { label: 'next growth section', selector: 'h2,section,div', text: 'NEXT GROWTH', minWidth: 120, minHeight: 24 },
    ],
  },
  {
    slug: 'product-introduction',
    path: '/corp/company/product-introduction',
    requiredTexts: ['제품소개', 'GLOBAL BUSINESS UNIVERSE', 'GLOBAL COMMAND PANEL', '사업제휴 문의'],
    targets: [
      { label: 'product heading', selector: 'h1,h2', text: '제품소개', minWidth: 56, minHeight: 18 },
      { label: 'business command center', selector: 'h1,h2,section,div,span,strong', text: 'Business Expansion Command Center', minWidth: 180, minHeight: 24 },
      { label: 'partnership link', selector: 'a,button', text: '사업제휴 문의', minWidth: 110, minHeight: 36 },
    ],
  },
  {
    slug: 'staff-intro',
    path: '/corp/company/staff-intro',
    requiredTexts: ['직원소개', 'AI DRIVEN', '총괄본부장', '10개 전문 부서', 'DIVISION NETWORK', '확장 전문 5개 부서', '사업확장부', '전략적 지원 조직'],
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
    requiredTexts: ['CEO PROFILE · 01 / 03', '현장과 실행', '대표 메시지', '현장 중심 기준'],
    screenshotProbe: { label: 'ceo hero image', selector: 'img[alt="대표 소개 사진 - 현장과 실행 리더십"]', minLuminanceRange: 20, minContrastPixelRatio: 0.002 },
    targets: [
      { label: 'ceo heading', selector: '#dashboard2-title,h1,h2', text: '현장과 실행', minWidth: 160, minHeight: 30 },
      { label: 'ceo message accordion', selector: 'button,article,section,div', text: '대표 메시지', minWidth: 100, minHeight: 34 },
      { label: 'ceo field accordion', selector: 'button,article,section,div', text: '현장 중심 기준', minWidth: 100, minHeight: 34 },
    ],
  },
  {
    slug: 'project-board',
    path: '/corp/project',
    requiredTexts: ['프로젝트 계획 보드', '카테고리', '전체 진행률'],
    targets: [
      { label: 'project heading', selector: 'h1,h2', text: '프로젝트 계획 보드', minWidth: 180, minHeight: 24 },
      { label: 'category panel', selector: 'aside,section,div', text: '카테고리', minWidth: 90, minHeight: 34 },
      { label: 'project card', selector: 'article,section,button,div', text: '계획', minWidth: 80, minHeight: 34 },
    ],
    performanceTargets: [
      { label: 'project cards', selector: '[data-performance-region="project-card"]' },
    ],
  },
  {
    slug: 'portfolio',
    path: '/corp/portfolio',
    requiredTexts: ['현장을 이해하는 ERP와', 'ERP CONTROL ROOM', '하나의 운영 흐름, 네 가지 핵심 프로그램'],
    targets: [
      { label: 'portfolio heading', selector: 'h1,h2', text: '현장을 이해하는 ERP와', minWidth: 220, minHeight: 30 },
      { label: 'program action', selector: 'a,button', text: '프로그램 살펴보기', minWidth: 120, minHeight: 36 },
      { label: 'program section', selector: 'h2,section,div', text: '하나의 운영 흐름, 네 가지 핵심 프로그램', minWidth: 220, minHeight: 24 },
    ],
  },
];

const historyPageSpec = pageSpecs.find((spec) => spec.slug === 'company-history');
if (historyPageSpec) {
  historyPageSpec.requiredTexts = ['그냥돼지 연혁', 'Growth Timeline', 'AI 실행 플랫폼으로 다음 도약'];
  historyPageSpec.targets = [
    { label: 'history heading', selector: 'h1,h2', text: '그냥돼지 연혁', minWidth: 130, minHeight: 30 },
    { label: 'history graph', selector: 'aside,section,div', text: 'Growth Timeline', minWidth: 180, minHeight: 120 },
    { label: 'history milestone', selector: 'article,button,div', text: 'AI 실행 플랫폼으로 다음 도약', minWidth: 160, minHeight: 40 },
  ];
}

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
  const profileTrigger = page.locator('[data-ceo-hero-profile-trigger]');
  assert.equal(await profileTrigger.count(), 1, `${viewportName} CEO profile trigger must be unique`);

  await profileTrigger.scrollIntoViewIfNeeded();
  await profileTrigger.click();
  await page.waitForFunction(
    () => {
      const trigger = document.querySelector('[data-ceo-hero-profile-trigger="1"]');
      const image = trigger?.querySelector('img');
      const pageText = document.querySelector('main#content-area')?.textContent || '';

      return (
        image?.getAttribute('src')?.includes('upload_1780878139007') === true &&
        pageText.includes('사람과 신뢰') &&
        pageText.includes('함께 결정하는 리더십')
      );
    },
    undefined,
    { timeout: 10_000 },
  );
}

async function verifyCompanyDashboardExperience(page, viewportName) {
  const expectedSectionOrder = [
    'dashboard2-intro',
    'company-introduction-business',
    'company-introduction-technology',
    'company-introduction-execution',
    'company-introduction-vision',
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
      visionLaneCounts: Array.from(document.querySelectorAll('[data-vision-lane]')).map(
        (lane) => lane.querySelectorAll('[data-vision-card]').length,
      ),
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
  assert.deepEqual(initialEvidence.visionLaneCounts, [3, 3, 3], `${viewportName} company vision must render three cards in each lane`);

  const technologyVisuals = [
    { id: 'web', src: '/images/corp/technology/web-app-stack.png', stack: ['Next.js', 'React 19', 'TypeScript', 'Firebase'] },
    { id: 'automation', src: '/images/corp/technology/automation-stack.png', stack: ['OpenRouter', 'Firebase Functions', 'React Query', 'Zod'] },
    { id: 'video', src: '/images/corp/technology/video-stack.png', stack: ['Remotion', 'FFmpeg', 'React', 'Firebase Storage'] },
    { id: 'reseller', src: '/images/corp/technology/reseller-partner-stack.png', stack: ['Partner Portal', 'CRM', 'Quote', 'Analytics'] },
    { id: 'secure', src: '/images/corp/technology/secure-stack.png', stack: ['Firebase Auth', 'Firestore Rules', 'Firebase Admin', 'Sentry'] },
  ];

  for (const technology of technologyVisuals) {
    const technologyTab = page.locator(`#company-technology-tab-${technology.id}`);
    await technologyTab.scrollIntoViewIfNeeded();
    await technologyTab.click();
    await page.waitForFunction(
      (expectedSrc) => {
        const image = document.querySelector('[data-technology-stack-image]');
        return image?.getAttribute('src') === expectedSrc && image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
      },
      technology.src,
      { timeout: 10_000 },
    );

    const technologyEvidence = await page.locator('#company-introduction-technology').evaluate((section) => ({
      src: section.querySelector('[data-technology-stack-image]')?.getAttribute('src'),
      stack: Array.from(section.querySelectorAll('[data-technology-stack-image] + figcaption span')).map((badge) => badge.textContent),
    }));
    assert.equal(technologyEvidence.src, technology.src, `${viewportName} technology image did not update for ${technology.id}`);
    assert.deepEqual(technologyEvidence.stack, technology.stack, `${viewportName} technology stack badges do not match ${technology.id}`);
  }

  const automationTab = page.locator('#company-execution-tab-automation');
  await automationTab.scrollIntoViewIfNeeded();
  await automationTab.click();
  await page.waitForFunction(
    () => document.querySelector('#company-execution-panel')?.getAttribute('aria-labelledby') === 'company-execution-tab-automation',
    undefined,
    { timeout: 5_000 },
  );

  const executionEvidence = await page.locator('#company-execution-panel').evaluate((panel) => ({
    stageCount: panel.querySelectorAll('[data-execution-stage]').length,
    text: panel.textContent ?? '',
  }));
  assert.equal(executionEvidence.stageCount, 5, `${viewportName} selected execution track must expose five stages`);
  assert.ok(executionEvidence.text.includes('업무 흐름 측정'), `${viewportName} automation roadmap did not update after selection`);
  assert.ok(executionEvidence.text.includes('안정화와 확장'), `${viewportName} automation roadmap is missing its final stage`);

  const radarTab = page.locator('[data-dashboard-operating-tab="radar"]');
  await radarTab.scrollIntoViewIfNeeded();
  await radarTab.click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-radar-corner-label]').length === 5,
    undefined,
    { timeout: 5_000 },
  );

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

async function verifyCompanySubmenuNavigation(context, viewport) {
  const page = await context.newPage();
  const runtimeErrors = [];
  const routeSpecs = [
    { path: '/corp/company/ceo-intro', text: 'CEO PROFILE · 01 / 03' },
    { path: '/corp/company/staff-intro', text: 'DIVISION NETWORK' },
    { path: '/corp/company/history', text: '그냥돼지 연혁' },
    { path: '/corp/company/product-introduction', text: 'GLOBAL BUSINESS UNIVERSE' },
    { path: '/corp/company/introduction', text: 'SIMPLYPIG' },
  ];
  const removedPaths = [
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

    for (const path of removedPaths) {
      assert.equal(
        await page.locator(`#sidebar .sub-nav a[href="${path}"]`).count(),
        0,
        `${viewport.name} company submenu still exposes removed route ${path}`,
      );
    }

    for (const route of routeSpecs) {
      const link = page.locator(`#sidebar .sub-nav a[href="${route.path}"]`).first();
      await link.waitFor({ state: viewport.isMobile ? 'attached' : 'visible', timeout: 10_000 });
      assert.equal(await link.getAttribute('href'), route.path, `${viewport.name} company submenu href did not match ${route.path}`);
      const targetUrl = new URL(route.path, baseUrl).toString();
      try {
        await Promise.all([
          page.waitForURL(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }),
          viewport.isMobile
            ? page.evaluate((path) => {
                document.querySelector(`#sidebar .sub-nav a[href="${path}"]`)?.click();
              }, route.path)
            : link.click(),
        ]);
      } catch {
        if (page.url() !== targetUrl) {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        } else {
          await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
        }
      }
      await waitForRequiredText(page, {
        slug: `company navigation ${route.path}`,
        requiredTexts: [route.text],
      });

      const activeHref = await page.locator('#sidebar .sub-nav a.active').first().getAttribute('href');
      assert.equal(activeHref, route.path, `${viewport.name} company submenu active link did not match ${route.path}`);
    }

    assert.deepEqual(runtimeErrors, [], `${viewport.name} company submenu navigation emitted runtime errors`);
  } finally {
    await page.close();
  }
}

async function verifyCompanyHistoryScrollMotion(context) {
  const page = await context.newPage();

  const navigate = async (path) => {
    const link = page.locator(`#sidebar .sub-nav a[href="${path}"]`).first();
    const targetUrl = new URL(path, baseUrl).toString();

    await link.waitFor({ state: 'visible', timeout: 10_000 });
    try {
      await Promise.all([
        page.waitForURL(targetUrl, { waitUntil: 'domcontentloaded', timeout: 8_000 }),
        link.click(),
      ]);
    } catch {
      if (page.url() !== targetUrl) {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      }
    }
    await page.waitForTimeout(250);
  };

  try {
    await page.goto(new URL('/corp/company/introduction', baseUrl).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await navigate('/corp/company/history');
    await navigate('/corp/company/product-introduction');
    await navigate('/corp/company/history');

    const historyRoot = page.locator('main[aria-labelledby="company-history-title"]');
    await historyRoot.hover();
    await page.mouse.wheel(0, 980);

    await page.waitForFunction(
      () => {
        const root = document.querySelector('main[aria-labelledby="company-history-title"]');
        const secondMilestone = document.querySelector('[data-history-index="1"]');
        if (!(root instanceof HTMLElement) || !(secondMilestone instanceof HTMLElement)) return false;

        const progress = Number.parseFloat(getComputedStyle(root).getPropertyValue('--history-scroll-progress'));
        return root.scrollTop > 0 && progress > 0 && secondMilestone.classList.contains('is-inview');
      },
      undefined,
      { timeout: 5_000 },
    );
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

      await page.close();
    }

    await verifyCompanySubmenuNavigation(context, viewport);
    if (!viewport.isMobile) {
      await verifyCompanyHistoryScrollMotion(context);
    }

    await context.close();
    console.log(`${viewport.name} corporate page verification passed for ${pageSpecs.length} pages`);
  }
} finally {
  await browser.close();
}
