import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const url = new URL('/corp/company/product-introduction', process.env.BASE_URL || 'http://localhost:3002').href;
const output = path.resolve(process.env.OUTPUT_DIR || 'output/product-global-20261028/browser');
const rootSelector = '#product-business-panorama';
const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]
  .filter(viewport => !process.env.PRODUCT_GLOBAL_WIDTH || viewport.width === Number(process.env.PRODUCT_GLOBAL_WIDTH));
assert.ok(viewports.length, 'PRODUCT_GLOBAL_WIDTH must be 1440, 390, or 320.');

// Acceptance values are independent of the component's implementation.
const webScenes = [
  { id: 'pc-web', mode: 'pc', label: '그뚠웹', variant: 0 },
  { id: 'mobile-web', mode: 'mobile', label: '그뚠앱', variant: 1 },
  { id: 'global-web', mode: 'global', label: '글로벌 연결', variant: 2 },
];
const screens = {
  desktop: { href: '/images/corp/products/global/desktop-workspace.svg', width: 960, height: 600 },
  mobile: { href: '/images/corp/products/global/mobile-workspace.svg', width: 360, height: 720 },
};
const candidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome', chromium.executablePath(),
].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* Try an installed browser. */ }
}
assert.ok(executablePath, 'Set CHROME_PATH to an installed Chromium browser.');
await mkdir(output, { recursive: true });

async function waitAttribute(page, name, value) {
  await page.waitForFunction(({ selector, name, value }) => {
    const roots = document.querySelectorAll(selector);
    return roots.length === 1 && roots[0].getAttribute(name) === String(value);
  }, { selector: rootSelector, name, value });
}

async function openShowcase(page) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, 'Product introduction is reachable.');
  // SSR controls are visible before their React event handlers are attached.
  await page.waitForFunction(() => {
    const buttons = document.querySelectorAll('#product-film-chapter-0');
    return buttons.length === 1 && Object.keys(buttons[0]).some(key => key.startsWith('__reactProps'));
  });
  const root = page.locator(rootSelector);
  await root.locator('[data-product-canvas]').scrollIntoViewIfNeeded();
  return root;
}

async function pauseShowcase(page, root) {
  const pause = root.getByRole('button', { name: '쇼릴 일시정지', exact: true });
  if (await pause.count()) await pause.click();
  await waitAttribute(page, 'data-running', false);
}

async function selectScene(page, root, scene) {
  await root.getByRole('button', { name: scene.label, exact: true }).click();
  await waitAttribute(page, 'data-step-id', scene.id);
  assert.equal(await root.getAttribute('data-chapter'), '0');
  assert.equal(await root.locator('[data-service-explorer]').getAttribute('data-service-variant'), String(scene.variant));
  assert.equal(await root.locator('[data-web-mode]').getAttribute('data-web-mode'), scene.mode);
  assert.equal(await root.getByRole('button', { name: scene.label, exact: true }).getAttribute('aria-pressed'), 'true');
  await root.locator('[data-product-canvas]').scrollIntoViewIfNeeded();
}

async function imageEvidence(page, root) {
  const evidence = {};
  for (const [kind, expected] of Object.entries(screens)) {
    const image = root.locator(`image[data-screen-kind="${kind}"]`);
    assert.equal(await image.count(), 1, `Each scene includes one ${kind} app image.`);
    const href = await image.getAttribute('href');
    assert.equal(href, expected.href, `${kind} uses its own app image.`);
    const decoded = await page.evaluate(async src => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, href);
    assert.deepEqual(decoded, { width: expected.width, height: expected.height }, `${kind} image loads at its intended native size.`);
    const bounds = await image.boundingBox();
    assert.ok(bounds && bounds.width > 8 && bounds.height > 8, `${kind} screen remains visible.`);
    const mascot = root.locator(`[data-device="${kind}"] [data-device-character="${kind}"] image`);
    assert.equal(await mascot.count(), 1, `${kind} has one mascot inside its own product screen.`);
    const mascotHref = await mascot.getAttribute('href');
    await page.evaluate(async src => { const image = new Image(); image.src = src; await image.decode(); }, mascotHref);
    const mascotBounds = await mascot.boundingBox();
    assert.ok(mascotBounds && mascotBounds.width > 8 && mascotBounds.height > 8 && mascotBounds.x >= bounds.x && mascotBounds.y >= bounds.y && mascotBounds.x + mascotBounds.width <= bounds.x + bounds.width + 1 && mascotBounds.y + mascotBounds.height <= bounds.y + bounds.height + 1, `${kind} mascot loads and stays inside the device screen.`);
    evidence[kind] = { href, ...decoded, bounds, mascotHref, mascotBounds };
  }
  assert.notEqual(evidence.desktop.href, evidence.mobile.href, 'PC and mobile are distinct images, not a shared crop.');
  const artwork = await root.locator('[data-product-motion-artwork]').boundingBox();
  const scene = await root.getAttribute('data-step-id');
  if (scene === 'pc-web') assert.ok(evidence.desktop.bounds.width >= artwork.width * .65, 'The PC image itself grows to fill at least 65% of its artboard.');
  if (scene === 'mobile-web') assert.ok(evidence.mobile.bounds.width >= artwork.width * .22, 'The mobile hero image itself grows to at least 22% of its artboard width.');
  if (scene === 'global-web') {
    assert.ok(evidence.desktop.bounds.width >= artwork.width * .28, 'The global desktop screen grows with the map composition.');
    assert.ok(evidence.mobile.bounds.width >= artwork.width * .14, 'The global phone screen grows with the map composition.');
  }
  return evidence;
}

async function workspaceEvidence(root, viewport) {
  const evidence = await root.evaluate(section => {
    const rectangle = element => {
      if (!element) return null;
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    };
    const navigation = section.querySelector('[data-product-navigation]');
    const content = section.querySelector('[data-product-content]');
    const canvas = section.querySelector('[data-product-canvas]');
    const workspace = section.querySelector('[data-product-workspace]');
    const header = section.querySelector('[data-product-header]');
    const title = section.querySelector('#product-film-title');
    const current = section.querySelector('[data-current-step-label]');
    const artwork = section.querySelector('[data-product-motion-artwork]');
    const fontSize = element => element ? Number.parseFloat(getComputedStyle(element).fontSize) : null;
    const caption = section.querySelector('[data-product-caption]');
    const chapters = [...section.querySelectorAll('[id^="product-film-chapter-"]')];
    const options = [...section.querySelectorAll('[data-service-option], [data-automation-category-option], [data-commerce-option], button[role="tab"]')];
    return {
      workspaceCount: section.querySelectorAll('[data-product-workspace]').length,
      navigationCount: section.querySelectorAll('[data-product-navigation]').length,
      contentCount: section.querySelectorAll('[data-product-content]').length,
      headerCount: section.querySelectorAll('[data-product-header]').length,
      currentLabelCount: section.querySelectorAll('[data-current-step-label]').length,
      headerContainsTitleAndCurrent: Boolean(header?.contains(title) && header?.contains(current)),
      headerContainsNow: [...(header?.querySelectorAll('span') ?? [])].some(element => /^NOW(?:\s|$)/.test(element.textContent.trim())),
      separateNowRows: [...section.querySelectorAll('*')].filter(element => element.children.length === 0 && /^NOW(?:\s+\d+)?$/.test(element.textContent.trim()) && !header?.contains(element)).length,
      chapterIds: chapters.map(button => button.id),
      navigationContainsEveryChapter: chapters.every(button => navigation?.contains(button)),
      navigationContainsEveryOption: options.every(button => navigation?.contains(button)),
      optionCount: options.length,
      canvasIsInsideContent: Boolean(content?.contains(canvas)),
      navigation: rectangle(navigation),
      content: rectangle(content),
      workspace: rectangle(workspace),
      header: rectangle(header),
      headerTitle: rectangle(title),
      currentLabel: rectangle(current),
      story: rectangle(section.querySelector('[data-product-story]')),
      caption: rectangle(caption),
      transport: rectangle(section.querySelector('[data-product-transport]')),
      clippedCaptionText: caption ? [...caption.querySelectorAll('strong, p')].flatMap(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = caption.getBoundingClientRect();
        return [...range.getClientRects()].some(text => text.left < bounds.left - 1 || text.right > bounds.right + 1 || text.top < bounds.top - 1 || text.bottom > bounds.bottom + 1) ? [element.textContent] : [];
      }) : [],
      canvas: rectangle(canvas),
      artwork: rectangle(artwork),
      director: rectangle(section.querySelector('[data-automation-director]')),
      speechBubble: rectangle(section.querySelector('[data-command-bubble]')),
      automationStage: rectangle(section.querySelector('[data-automation-stage]')),
      artworkChapter: artwork?.getAttribute('data-product-motion-artwork') ?? null,
      media: rectangle(section.querySelector('[data-content-preview]')),
      typography: {
        title: fontSize(section.querySelector('[data-product-story] h3')),
        body: fontSize(section.querySelector('[data-product-story] p')),
        captionTitle: fontSize(caption?.querySelector('strong')),
        captionBody: fontSize(caption?.querySelector('p')),
      },
      controls: [...chapters, ...options].map(button => ({ label: button.getAttribute('aria-label') || button.textContent.trim(), ...rectangle(button) })),
    };
  });
  assert.equal(evidence.workspaceCount, 1, 'One workspace contains the integrated navigation and content.');
  assert.equal(evidence.navigationCount, 1, 'There is one unified navigation, without a duplicate bottom menu.');
  assert.equal(evidence.contentCount, 1, 'One content panel fills the rest of the workspace.');
  assert.equal(evidence.headerCount, 1, 'One top title bar holds the showcase identity and current scene.');
  assert.equal(evidence.currentLabelCount, 1, 'The current scene appears once, without a duplicate NOW row.');
  assert.equal(evidence.headerContainsTitleAndCurrent, true, 'NOW/current scene is integrated into the product title bar.');
  assert.equal(evidence.headerContainsNow, true, 'The integrated title bar retains the NOW indicator.');
  assert.equal(evidence.separateNowRows, 0, 'There is no separate NOW strip below the title bar.');
  assert.ok(evidence.workspace.y - evidence.header.bottom >= -1 && evidence.workspace.y - evidence.header.bottom <= 3, 'The workspace follows the integrated header directly.');
  assert.deepEqual([...evidence.chapterIds].sort(), [0, 1, 2, 3].map(index => `product-film-chapter-${index}`), 'Each of the four chapters appears exactly once.');
  assert.equal(evidence.navigationContainsEveryChapter, true, 'Every chapter belongs to the unified navigation.');
  assert.ok(evidence.optionCount > 0, 'The active chapter exposes its detailed controls.');
  assert.equal(evidence.navigationContainsEveryOption, true, 'Detailed service, platform, and channel controls share the navigation.');
  assert.equal(evidence.canvasIsInsideContent, true, 'The artwork canvas belongs to the content panel.');
  if (evidence.director) {
    assert.ok(evidence.speechBubble && evidence.speechBubble.x >= evidence.director.x && evidence.speechBubble.right <= evidence.director.right + 1, 'The speech bubble stays within the character column.');
  }
  assert.ok(evidence.story.y - evidence.content.y >= 0 && evidence.story.y - evidence.content.y <= 16, 'Context starts within 16px of the content top instead of being vertically centered.');
  assert.ok(evidence.transport && evidence.transport.height <= 56, 'Playback controls remain in a compact footer of at most 56px.');
  assert.deepEqual(evidence.clippedCaptionText, [], 'The shortened bottom caption preserves all of its text.');
  if (evidence.caption) assert.ok(evidence.caption.height <= (viewport.width >= 1000 ? 52 : 80), 'The actual bottom title/description caption is compact.');
  if (viewport.width >= 1000) {
    assert.ok(evidence.navigation.right <= evidence.content.x + 1, 'Desktop navigation sits entirely left of the content.');
    assert.ok(evidence.content.width >= evidence.navigation.width * 2, 'The content has at least twice the navigation width.');
    assert.ok(evidence.canvas.width >= evidence.content.width * .85, 'The canvas uses the available right-hand space.');
    assert.ok(Math.abs(evidence.navigation.height - evidence.content.height) <= 1, 'Desktop navigation and content share the same taller workspace height.');
    assert.ok(Math.abs(evidence.navigation.y - evidence.content.y) <= 1, 'Desktop navigation and content start together.');
    assert.ok(evidence.content.height >= 679 && evidence.content.height <= 700, 'The compact desktop context remains between 680px and 700px.');
    assert.ok(Math.abs((evidence.headerTitle.y + evidence.headerTitle.height / 2) - (evidence.currentLabel.y + evidence.currentLabel.height / 2)) <= 12, 'Desktop title and NOW/current scene share one header row.');
    assert.equal(evidence.typography.title, 28, 'The desktop context heading is enlarged to 28px.');
    assert.equal(evidence.typography.body, 15, 'The desktop context description is enlarged to 15px.');
    if (evidence.artwork) {
      if (evidence.director) {
        assert.ok(evidence.director.right <= evidence.artwork.x, 'The command character sits to the left of the workflow.');
        assert.ok(evidence.automationStage.width >= evidence.canvas.width * .98 && evidence.artwork.width >= evidence.canvas.width * .55, 'Character and readable workflow share the available canvas.');
      } else assert.ok(evidence.artwork.width >= evidence.canvas.width * .85, 'SVG artwork fills the right-hand canvas.');
      assert.ok(evidence.artwork.height >= 439, 'Desktop artwork fills the context while keeping at least 440px height.');
      assert.equal(evidence.typography.captionTitle, 13, 'Desktop bottom caption titles are compact at 13px.');
      assert.equal(evidence.typography.captionBody, 12, 'Desktop bottom caption descriptions are compact at 12px.');
    }
    if (evidence.media) assert.ok(evidence.media.height >= 399, 'Desktop media fills the context while keeping at least 400px height.');
    assert.deepEqual(evidence.controls.filter(button => button.right > evidence.canvas.x + 1).map(button => button.label), [], 'All chapter and detail controls stay left of the artwork.');
  } else {
    assert.ok(evidence.navigation.bottom <= evidence.content.y + 1, 'Mobile navigation stacks above the content.');
    assert.equal(evidence.typography.title, 22, 'Mobile context headings are enlarged to 22px.');
    assert.equal(evidence.typography.body, 13, 'Mobile context descriptions grow to 13px.');
    if (evidence.artwork) {
      assert.ok(Math.abs(evidence.artwork.height - (evidence.artworkChapter === '0' ? 220 : 288)) <= 1, 'Mobile artwork keeps 220px for web and 288px for other scenes.');
      assert.equal(evidence.typography.captionTitle, 12, 'Mobile bottom caption titles are compact at 12px.');
      assert.equal(evidence.typography.captionBody, 11, 'Mobile bottom caption descriptions are compact at 11px.');
    }
  }
  const execution = root.getByRole('link', { name: '실행 과정 살펴보기', exact: true });
  assert.equal(await execution.count(), 1, 'The semantic execution-process link remains available.');
  assert.equal(await execution.getAttribute('href'), '#company-introduction-execution');
  const executionBounds = await execution.boundingBox();
  assert.ok(executionBounds.width >= 43.5 && executionBounds.height >= 43.5, 'The compact footer preserves the execution link touch target.');
  return evidence;
}

// The requested compact workspace retains readable text and 44px controls.
async function layoutEvidence(root, viewport, maximumHeight = viewport.width >= 1000 ? 850 : 850) {
  const layout = await root.evaluate(section => {
    const box = section.getBoundingClientRect();
    const svg = section.querySelector('[data-product-motion-artwork] > svg');
    const svgBox = svg?.getBoundingClientRect();
    const visibleButtons = [...section.querySelectorAll('button')].filter(button => {
      const bounds = button.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    });
    return {
      height: box.height,
      width: box.width,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      sectionOverflow: section.scrollWidth > section.clientWidth + 1,
      smallControls: visibleButtons.filter(button => {
        const bounds = button.getBoundingClientRect();
        return bounds.width < 43.5 || bounds.height < 43.5;
      }).map(button => ({ label: button.getAttribute('aria-label') || button.textContent.trim(), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
      clippedControls: visibleButtons.filter(button => {
        const bounds = button.getBoundingClientRect();
        return bounds.left < -1 || bounds.right > innerWidth + 1 || button.scrollWidth > button.clientWidth + 2 || button.scrollHeight > button.clientHeight + 2;
      }).map(button => button.getAttribute('aria-label') || button.textContent.trim()),
      clippedGraphicLabels: svgBox ? [...svg.querySelectorAll('text')].filter(text => {
        const bounds = text.getBoundingClientRect();
        return bounds.width > 0 && (bounds.left < svgBox.left - 1 || bounds.right > svgBox.right + 1 || bounds.top < svgBox.top - 1 || bounds.bottom > svgBox.bottom + 1);
      }).map(text => text.textContent.trim()) : [],
    };
  });
  assert.ok(layout.height <= maximumHeight, `Compact panorama height: ${layout.height.toFixed(1)}px at ${viewport.width}px (limit ${maximumHeight}px).`);
  assert.equal(layout.documentOverflow, false, 'The page has no horizontal overflow.');
  assert.equal(layout.sectionOverflow, false, 'The showcase has no horizontal overflow.');
  assert.deepEqual(layout.smallControls, [], 'Controls preserve 44px touch targets.');
  assert.deepEqual(layout.clippedControls, [], 'Control labels remain within the viewport and their buttons.');
  assert.deepEqual(layout.clippedGraphicLabels, [], 'SVG labels fit inside the visible artboard.');
  assert.equal(await root.locator('[data-product-character]').count(), 0, 'No separate floating character covers the content.');
  assert.ok(await root.locator('img[src*="ddunddun-"]').evaluateAll(images => images.every(image => image.closest('[data-blog-character]'))), 'Blog characters stay inside the article layout.');
  assert.equal(await root.locator('[data-device-character]').count(), await root.getAttribute('data-chapter') === '0' ? 2 : 0, 'Mascots stay within the two web-app device screens.');
  assert.equal(await root.locator('[data-automation-director]').count(), await root.getAttribute('data-chapter') === '1' ? 1 : 0, 'The command character appears only beside work automation.');
  assert.equal(await root.getByRole('button', { name: '현재 장면 반복', exact: true }).count(), 0, 'The repeat control has been removed.');
  assert.equal(await root.getByRole('link', { name: '콘텐츠 제품 보기', exact: true }).count(), 0, 'The content catalogue CTA has been removed.');
  return { ...layout, workspace: await workspaceEvidence(root, viewport) };
}

async function accessibilityViolations(page) {
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async selector => {
    const report = await window.axe.run(document.querySelector(selector), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return report.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
  }, rootSelector);
}

async function captureShowcase(page, root, viewport, filename) {
  // The app scrolls inside #content-area. Enlarge only the evidence capture so
  // its clipping boundary does not hide the bottom of a taller mobile section.
  // All acceptance measurements above use the requested viewport unchanged.
  const bounds = await root.boundingBox();
  try {
    await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, Math.ceil(bounds.height) + 160) });
    await root.scrollIntoViewIfNeeded();
    await root.screenshot({ path: path.join(output, filename) });
  } finally {
    await page.setViewportSize(viewport);
    await root.locator('[data-product-canvas]').scrollIntoViewIfNeeded();
  }
}

async function playbackState(root) {
  return root.evaluate(section => ({
    step: section.getAttribute('data-step-id'),
    cycle: section.getAttribute('data-cycle'),
    progress: section.style.getPropertyValue('--scene-progress'),
  }));
}

async function verifyPlayback(page, root) {
  await selectScene(page, root, webScenes[1]);
  const stopped = await playbackState(root);
  await page.waitForTimeout(350);
  assert.deepEqual(await playbackState(root), stopped, 'Manual selection while paused remains still.');
  await root.getByRole('button', { name: '쇼릴 재생', exact: true }).click();
  await root.locator('[data-product-canvas]').scrollIntoViewIfNeeded();
  await waitAttribute(page, 'data-running', true);
  await page.waitForFunction(selector => Number(document.querySelector(selector)?.style.getPropertyValue('--scene-progress')) > 0.03, rootSelector);
  assert.equal(await root.getAttribute('data-step-id'), 'mobile-web', 'Resume plays the manually selected scene.');
  assert.ok(await root.locator('[data-product-motion-artwork]').evaluate(artwork => artwork.getAnimations({ subtree: true }).some(animation => animation.playState === 'running')), 'Artwork motion runs during playback.');
  await pauseShowcase(page, root);
  const paused = await playbackState(root);
  await page.waitForTimeout(350);
  assert.deepEqual(await playbackState(root), paused, 'Pause freezes the timeline without resetting the selected scene.');
  assert.equal(await root.locator('[data-product-motion-artwork]').evaluate(artwork => artwork.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0, 'Pause freezes artwork animations.');
  await root.getByRole('button', { name: '다음 장면', exact: true }).click();
  await waitAttribute(page, 'data-step-id', 'global-web');
  await root.getByRole('button', { name: '이전 장면', exact: true }).click();
  await waitAttribute(page, 'data-step-id', 'mobile-web');
  assert.equal(await root.getAttribute('data-running'), 'false', 'Previous/next navigation preserves pause.');
}

async function verifyKeyboard(page, root) {
  await root.getByRole('button', { name: '그뚠웹', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await root.getByRole('button', { name: '그뚠앱', exact: true }).evaluate(button => button === document.activeElement), true);
  await page.keyboard.press('Enter');
  await waitAttribute(page, 'data-step-id', 'mobile-web');
  const focusStyle = await root.getByRole('button', { name: '그뚠앱', exact: true }).evaluate(button => ({ width: getComputedStyle(button).outlineWidth, style: getComputedStyle(button).outlineStyle }));
  assert.ok(parseFloat(focusStyle.width) >= 2 && focusStyle.style !== 'none', 'Keyboard focus is visible.');
  await root.locator('#product-film-chapter-0').focus();
  await page.keyboard.press('ArrowRight');
  await waitAttribute(page, 'data-chapter', 1);
  assert.equal(await root.locator('#product-film-chapter-1').evaluate(button => button === document.activeElement), true);
  await page.keyboard.press('Home');
  await waitAttribute(page, 'data-step-id', 'pc-web');
}

async function verifyChapterMenus(page, root, viewport) {
  const layouts = [];
  for (const chapter of [1, 2, 3]) {
    await root.locator(`#product-film-chapter-${chapter}`).click();
    await waitAttribute(page, 'data-chapter', chapter);
    assert.equal(await root.locator(`#product-film-chapter-${chapter}`).getAttribute('aria-pressed'), 'true');
    assert.equal(await root.getAttribute('data-running'), 'false', 'Chapter changes preserve a paused showcase.');
    const variants = chapter === 1 ? ['documents', 'integrations', 'agents'] : chapter === 3 ? ['content', 'advertising'] : ['youtube'];
    for (const variant of variants) {
      if (chapter === 1 && variant !== 'documents') {
        await root.locator(`[data-automation-category-option="${variant}"]`).click();
        await waitAttribute(page, 'data-step-id', variant === 'integrations' ? 'tax-invoice' : 'browser-agent');
      } else if (variant === 'advertising') {
        await root.locator('[data-service-option="1"]').click();
        await waitAttribute(page, 'data-step-id', 'naver');
        assert.equal(await root.locator('[data-commerce-option]').count(), 4, 'All four commerce platforms are available in the left navigation.');
      }
      // Non-web chapters expose extra category/platform controls above the
      // content on phones. Preserve readable controls within an 1100px limit.
      const layout = await layoutEvidence(root, viewport, viewport.width >= 1000 ? 850 : 1100);
      const violations = await accessibilityViolations(page);
      assert.deepEqual(violations, [], `Chapter ${chapter + 1}, ${variant}, has no WCAG A/AA violations.`);
      await captureShowcase(page, root, viewport, `chapter-${chapter}-${variant}-${viewport.width}.png`);
      layouts.push({ chapter, variant, layout, violations });
    }
  }
  await root.locator('#product-film-chapter-0').click();
  await waitAttribute(page, 'data-step-id', 'pc-web');
  return layouts;
}

async function verifyContentReading(page, root, viewport) {
  await root.locator('#product-film-chapter-2').click();
  await root.getByRole('tab', { name: '블로그', exact: true }).click();
  await waitAttribute(page, 'data-step-id', 'blog');
  await layoutEvidence(root, viewport, viewport.width >= 1000 ? 850 : 1150);
  const article = root.locator('article[aria-label^="블로그 시연 글"]');
  assert.deepEqual(await root.locator('[data-blog-platform]').evaluateAll(items => items.map(item => item.getAttribute('data-blog-platform'))), ['naver', 'tistory', 'wordpress']);
  assert.equal(await root.locator('[data-blog-platform] svg').count(), 3, 'All three blog platforms show actual vector logos.');
  const geometry = await article.evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight }));
  assert.ok(geometry.scroll > geometry.client, 'The compact blog retains internal scrolling.');
  await article.focus();
  await article.press('PageDown');
  await page.waitForFunction(selector => document.querySelector(selector).querySelector('article').scrollTop > 0, rootSelector);
  await root.locator('#product-film-chapter-0').click();
  return geometry;
}

async function verifyReducedMotion(page, viewport) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const root = await openShowcase(page);
  await waitAttribute(page, 'data-reduced-motion', true);
  await waitAttribute(page, 'data-running', false);
  assert.equal(await root.getByRole('button', { name: '쇼릴 일시정지', exact: true }).count(), 0);
  for (const scene of webScenes) {
    await selectScene(page, root, scene);
    await imageEvidence(page, root);
    await layoutEvidence(root, viewport);
    assert.equal(await root.evaluate(section => section.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0, 'Reduced motion disables every showcase animation.');
  }
  const staticState = await playbackState(root);
  await page.waitForTimeout(500);
  assert.deepEqual(await playbackState(root), staticState, 'Reduced motion never auto-advances.');
  await captureShowcase(page, root, viewport, `global-reduced-${viewport.width}.png`);
}

const results = [];
const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /hydration|hydrated|server rendered|Minified React|did not match|route-error/i.test(message.text())) errors.push(message.text());
    });
    const result = { viewport, scenes: [] };
    try {
      const root = await openShowcase(page);
      await pauseShowcase(page, root);
      await root.locator('#product-film-chapter-0').click();
      for (const scene of webScenes) {
        await selectScene(page, root, scene);
        const images = await imageEvidence(page, root);
        const layout = await layoutEvidence(root, viewport);
        if (scene.mode === 'global') {
          const text = await root.locator('[data-web-mode="global"]').textContent();
          for (const city of ['서울', '도쿄', '런던', '뉴욕']) assert.match(text, new RegExp(city, 'i'), `Global connection shows ${city}.`);
        }
        const violations = await accessibilityViolations(page);
        assert.deepEqual(violations, [], `${scene.label} has no WCAG A/AA violations.`);
        await captureShowcase(page, root, viewport, `${scene.mode}-${viewport.width}.png`);
        result.scenes.push({ scene: scene.id, images, layout, violations });
      }
      assert.notDeepEqual(result.scenes[0].images.desktop.bounds, result.scenes[1].images.desktop.bounds, 'PC and mobile scenes have different device compositions.');
      assert.equal(await root.locator('[aria-label^="전체 311초"]').count(), 1, 'The 21-scene journey includes the 15-second TikTok preview.');
      await verifyPlayback(page, root);
      result.chapterMenus = await verifyChapterMenus(page, root, viewport);
      result.contentReading = await verifyContentReading(page, root, viewport);
      await verifyKeyboard(page, root);
      await verifyReducedMotion(page, viewport);
      assert.deepEqual(errors, [], 'No runtime or hydration errors.');
      results.push({ ...result, playback: 'pass', keyboard: 'pass', reducedMotion: 'pass', errors });
      await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
      console.log(`PASS product global showcase ${viewport.width}px: embedded characters, compact caption/footer, integrated header, 20% shorter desktop, unified navigation, distinct images, pause/resume, keyboard, reduced motion, 44px controls, overflow, axe`);
    } catch (error) {
      const state = await page.locator(rootSelector).evaluate(section => ({ attributes: Object.fromEntries([...section.attributes].map(attribute => [attribute.name, attribute.value])), height: section.getBoundingClientRect().height })).catch(() => null);
      await writeFile(path.join(output, `failure-${viewport.width}.json`), JSON.stringify({ error: String(error), state, result, errors }, null, 2));
      await page.screenshot({ path: path.join(output, `failure-${viewport.width}.png`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
