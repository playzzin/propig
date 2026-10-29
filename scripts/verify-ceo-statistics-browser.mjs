import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const url = new URL('/corp/company/ceo-intro', process.env.BASE_URL || 'http://localhost:3002').href;
const output = path.resolve(process.env.CEO_STATISTICS_OUTPUT || 'output/ceo-statistics-20261028/browser');
const candidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome', chromium.executablePath(),
].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* next installed browser */ }
}
assert.ok(executablePath, 'Set CHROME_PATH to an installed Chromium browser.');

// Independent acceptance values: these are intentionally not imported from the implementation.
const stages = [
  { id: 'start', hours: 12, values: { skill: 10, weight: 100, time: 12, capital: 1000 }, cash: [1000, 0, 0, 0, 0], expenses: 0 },
  { id: 'build', hours: 16, values: { skill: 30, weight: 112, time: 16, capital: 760 }, cash: [1000, -200, -20, -15, -5], expenses: 240 },
  { id: 'focus', hours: 20, values: { skill: 55, weight: 125, time: 20, capital: 480 }, cash: [1000, -460, -30, -20, -10], expenses: 520 },
  { id: 'overtime', hours: 40, values: { skill: 80, weight: 138, time: 40, capital: 170 }, cash: [1000, -750, -40, -25, -15], expenses: 830 },
  { id: 'finish', hours: 48, values: { skill: 99, weight: 150, time: 48, capital: -100 }, cash: [1000, -1000, -50, -30, -20], expenses: 1100 },
];
const expenseLabels = ['식대', 'AI 토큰', '구독', '장비'];
const metrics = [
  { id: 'skill', name: '기술력' }, { id: 'weight', name: '체중' },
  { id: 'time', name: '작업시간' }, { id: 'capital', name: '잔고' },
];
const rootSelector = '[data-ceo-statistics]';
const results = [];
const viewports = [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]
  .filter(viewport => !process.env.CEO_STATISTICS_WIDTH || viewport.width === Number(process.env.CEO_STATISTICS_WIDTH));
assert.ok(viewports.length, 'CEO_STATISTICS_WIDTH must be 1440 or 390.');
const numericText = text => Number(text.replace(/−/g, '-').replace(/[^\d.-]/g, ''));

async function openStatistics(page) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200, 'CEO introduction is reachable.');
  await page.waitForFunction(() => {
    const tabs = document.querySelectorAll('#ceo-document-tab-analysis');
    return tabs.length === 1 && Object.keys(tabs[0]).some(key => key.startsWith('__reactProps'));
  });
  await page.getByRole('tab', { name: /대표통계/ }).click();
  await page.waitForFunction(selector => {
    const sections = document.querySelectorAll(selector);
    return sections.length === 1 && sections[0].getBoundingClientRect().height > 0;
  }, rootSelector);
  const root = page.locator(rootSelector);
  await root.scrollIntoViewIfNeeded();
  return root;
}

async function waitAttribute(page, name, value) {
  await page.waitForFunction(({ selector, name, value }) => {
    const roots = document.querySelectorAll(selector);
    return roots.length === 1 && roots[0].getAttribute(name) === String(value);
  }, { selector: rootSelector, name, value });
}


async function snapshot(root) {
  return root.evaluate(section => ({
    elapsed: Number(section.getAttribute('data-story-elapsed')),
    step: Number(section.getAttribute('data-story-step')),
    stage: Number(section.getAttribute('data-stage-index')),
    values: Object.fromEntries([...section.querySelectorAll('[data-ceo-stat-value]')].map(element => [
      element.getAttribute('data-ceo-stat-value'),
      { data: Number(element.getAttribute('data-value')), visible: Number(element.textContent.replace(/−/g, '-').replace(/[^\d.-]/g, '')) },
    ])),
    cash: [...section.querySelectorAll('[data-ceo-cash-value]')].map(element => Number(element.getAttribute('data-ceo-cash-value'))),
    expenses: [...section.querySelectorAll('[data-ceo-expense]')].map(element => Number(element.getAttribute('data-expense-value'))),
    expenseTotal: Number(section.querySelector('[data-ceo-expense-total]').getAttribute('data-ceo-expense-total')),
    balance: Number(section.querySelector('[data-ceo-expense-balance]').getAttribute('data-ceo-expense-balance')),
    chartBalance: Number(section.querySelector('[data-ceo-cash-total]').getAttribute('data-ceo-cash-total')),
  }));
}

function assertSynchronized(state, expected) {
  for (const metric of metrics) {
    assert.equal(state.values[metric.id].visible, state.values[metric.id].data, 'Visible KPIs and their data stay synchronized.');
    if (expected) assert.equal(state.values[metric.id].data, expected[metric.id], metric.name);
  }
  assert.equal(state.cash[0], 1000);
  assert.equal(state.cash.reduce((sum, amount) => sum + amount, 0), state.values.capital.data, 'The current interpolated cash entries sum to the current balance.');
  assert.deepEqual(state.expenses, state.cash.slice(1));
  assert.equal(state.expenseTotal, -state.expenses.reduce((sum, amount) => sum + amount, 0) || 0);
  assert.equal(state.balance, state.values.capital.data);
  assert.equal(state.chartBalance, state.balance);
}

async function verifyStageTable(root) {
  const section = root.locator('[data-ceo-stages]');
  assert.equal(await section.count(), 1);
  const table = section.getByRole('table', { name: '누적 작업 단계별 통계', exact: true });
  assert.equal(await table.getByRole('columnheader').count(), 6);
  assert.equal((await table.getByRole('columnheader').first().innerText()).trim(), '누적 작업');
  assert.deepEqual(await table.getByRole('rowheader').allTextContents(), ['기술력', '체중', '잔고']);
  assert.equal(await table.getByRole('row').count(), 4);
  assert.equal(await table.getByRole('cell').count(), 15);
  for (const stage of stages) {
    assert.equal(await table.getByRole('button', { name: stage.hours + '시간 단계 보기', exact: true }).count(), 1);
    for (const metric of ['skill', 'weight', 'capital']) {
      const cell = table.locator('[data-stage-value="' + stage.id + '-' + metric + '"]');
      assert.equal(await cell.count(), 1);
      assert.equal(numericText(await cell.innerText()), stage.values[metric], 'The comparison table preserves all five exact stage values.');
    }
  }
}

async function verifyExpenses(page, root, stage) {
  const section = root.locator('[data-ceo-expenses]');
  assert.equal(await section.count(), 1);
  const table = section.getByRole('table', { name: '자본 지출 요약', exact: true });
  assert.deepEqual(await table.getByRole('columnheader').allTextContents(), expenseLabels);
  assert.equal(await table.getByRole('row').count(), 2, 'The compact summary has one header row and one value row.');
  assert.equal(await table.getByRole('cell').count(), 4);
  for (const [index, label] of expenseLabels.entries()) {
    const cell = table.locator('td[data-ceo-expense="' + label + '"]');
    assert.equal(await cell.count(), 1);
    assert.equal(Number(await cell.getAttribute('data-expense-value')), stage.cash[index + 1]);
    assert.equal(Math.abs(numericText(await cell.innerText())), Math.abs(stage.cash[index + 1]));
  }
  if (stage.expenses > 0) {
    assert.ok(-stage.cash[1] / stage.expenses >= .8, 'Food accounts for at least 80% of expenses.');
    assert.ok(-stage.cash.slice(2).reduce((sum, amount) => sum + amount, 0) < -stage.cash[1], 'The three smaller expenses together remain below food costs.');
  }
  assert.equal(Number(await section.locator('[data-ceo-expense-total]').getAttribute('data-ceo-expense-total')), stage.expenses);
  const balance = section.locator('[data-ceo-expense-balance]');
  assert.equal(Number(await balance.getAttribute('data-ceo-expense-balance')), stage.values.capital);
  assert.equal(numericText(await balance.innerText()), stage.values.capital, 'The visible balance preserves its negative sign.');
  assert.match(await balance.innerText(), stage.values.capital < 0 ? /적자/ : /잔액/);
  assert.match(await balance.innerText(), /만원/);
  const bounds = await section.boundingBox();
  const maxHeight = page.viewportSize().width < 600 ? 190 : 150;
  assert.ok(bounds && bounds.height > 0 && bounds.height <= maxHeight, 'Expense summary height ' + bounds?.height + 'px exceeds ' + maxHeight + 'px.');
}

async function verifyCharts(root, stage) {
  for (const metric of metrics) {
    assert.equal(await root.locator('[data-ceo-stat-chart="' + metric.id + '"]').count(), 1);
    assert.equal(await root.locator('[data-ceo-stat-series="' + metric.id + '"]').count(), 1);
    const points = root.locator('[data-ceo-trend-point="' + metric.id + '"]');
    const values = await points.evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-ceo-trend-value'))));
    assert.deepEqual(values, stages.map(item => item.values[metric.id]), 'Every complete trend keeps all five stage values.');
  }
  const capitalPoints = root.locator('[data-ceo-trend-point="capital"]');
  const trend = await capitalPoints.evaluateAll(points => {
    const svg = points[0].ownerSVGElement;
    const zero = svg.querySelector('[data-ceo-trend-zero]');
    const path = svg.querySelector('[data-ceo-stat-series="capital"]');
    const end = path.getPointAtLength(path.getTotalLength());
    return { zero: Number(zero.getAttribute('y1')), last: Number(points.at(-1).getAttribute('cy')), pathEnd: end.y, current: Number(svg.querySelector('[data-ceo-trend-current="capital"]').getAttribute('cy')) };
  });
  assert.ok(trend.last > trend.zero, 'The -100만원 endpoint is below the zero line instead of being clamped.');
  assert.ok(Math.abs(trend.pathEnd - trend.last) < .1, 'The capital curve itself reaches the negative endpoint.');
  if (stage.values.capital < 0) assert.ok(trend.current > trend.zero, 'The current deficit marker is also below zero.');

  const cashChart = root.locator('[data-ceo-stat-chart="capital"]');
  const labels = await cashChart.locator('text').allTextContents();
  for (const label of ['시작', ...expenseLabels]) assert.ok(labels.includes(label));
  const cashGeometry = await cashChart.evaluate(chart => {
    const zero = chart.querySelector('[data-ceo-cash-zero]');
    const total = chart.querySelector('[data-ceo-cash-total]');
    return { zero: Number(zero.getAttribute('y1')), y: Number(total.getAttribute('y')), height: Number(total.getAttribute('height')), bottom: chart.viewBox.baseVal.height };
  });
  assert.ok(cashGeometry.height > 0 && cashGeometry.y >= 0 && cashGeometry.y + cashGeometry.height <= cashGeometry.bottom);
  if (stage.values.capital < 0) assert.ok(Math.abs(cashGeometry.y - cashGeometry.zero) < .1, 'A deficit waterfall bar starts at zero and extends down.');
  else assert.ok(Math.abs(cashGeometry.y + cashGeometry.height - cashGeometry.zero) < .1);

  const gauge = root.locator('[data-ceo-stat-chart="weight"]');
  assert.match(await gauge.locator('title').first().textContent(), new RegExp(stage.hours + '시간.*체중'));
  const description = await gauge.locator('desc').textContent();
  assert.match(description, /100.*150\s*kg/i);
  assert.match(description, new RegExp(stage.values.weight + '\\s*kg', 'i'));
  const gaugeLabels = await gauge.locator('text').allTextContents();
  for (const tick of ['100', '125', '150']) assert.ok(gaugeLabels.includes(tick));
  assert.ok(gaugeLabels.some(label => new RegExp('^' + stage.values.weight + '\\s*kg$', 'i').test(label)));
  const gaugeFill = Number((await gauge.locator('path[pathLength="100"]').getAttribute('stroke-dasharray')).split(/\s+/)[0]);
  assert.ok(Math.abs(gaugeFill - (stage.values.weight - 100) / 50 * 100) < .01, 'Weight uses its 100–150kg scale.');

  const hours = await root.locator('[data-ceo-work-hours]').evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-ceo-work-hours'))));
  assert.deepEqual(hours, [12, 16, 20, 40, 48], 'All five cumulative work-hour bars remain visible.');
  assert.match(await root.locator('[data-ceo-stat-chart="time"] desc').textContent(), /누적/);
  const malformed = await root.locator('svg [d], svg [points]').evaluateAll(elements => elements.filter(element => /NaN|Infinity/.test(element.getAttribute('d') + ' ' + element.getAttribute('points'))).map(element => element.outerHTML.slice(0, 160)));
  assert.deepEqual(malformed, []);
}

async function verifyStage(page, root, stage, activate = true) {
  const index = stages.indexOf(stage);
  const button = root.getByRole('button', { name: stage.hours + '시간 단계 보기', exact: true });
  if (activate) await button.click();
  await waitAttribute(page, 'data-scenario', stage.id);
  await waitAttribute(page, 'data-stage-index', index);
  assert.equal(await root.getAttribute('data-story-playing'), 'false');
  assert.equal(await root.getAttribute('data-motion-running'), 'false');
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.equal(await root.locator('[data-ceo-stages] button[aria-pressed="true"]').count(), 1);
  const state = await snapshot(root);
  assert.equal(state.elapsed, index * 5000);
  assert.equal(state.step, Math.min(3, index));
  assertSynchronized(state, stage.values);
  assert.deepEqual(state.cash, stage.cash);
  await verifyExpenses(page, root, stage);
  await verifyCharts(root, stage);
}

async function accessibilityViolations(page) {
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async selector => {
    const report = await window.axe.run(document.querySelector(selector), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return report.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
  }, rootSelector);
}

async function layoutEvidence(page, root) {
  await page.waitForFunction(selector => [...document.querySelectorAll(`${selector} img`)].every(image => image.complete && image.naturalWidth > 0), rootSelector);
  const evidence = await root.evaluate(section => ({
    documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    sectionOverflow: section.scrollWidth > section.clientWidth + 1,
    emptyCharts: [...section.querySelectorAll('[data-ceo-stat-chart]')].filter(chart => {
      const bounds = chart.getBoundingClientRect();
      return bounds.width < 100 || bounds.height < 80;
    }).map(chart => chart.getAttribute('data-ceo-stat-chart')),
    clippedControls: [...section.querySelectorAll('button')].filter(button => {
      const bounds = button.getBoundingClientRect();
      return bounds.width > 0 && (bounds.left < -1 || bounds.right > innerWidth + 1);
    }).map(button => button.getAttribute('aria-label') || button.textContent.trim()),
    brokenImages: [...section.querySelectorAll('img')].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.getAttribute('src')),
    clippedChartText: [...section.querySelectorAll('[data-ceo-stat-chart] text')].filter(text => {
      const bounds = text.getBBox();
      const view = text.ownerSVGElement.viewBox.baseVal;
      return bounds.x < view.x - 1 || bounds.y < view.y - 1
        || bounds.x + bounds.width > view.x + view.width + 1 || bounds.y + bounds.height > view.y + view.height + 1;
    }).map(text => ({ chart: text.ownerSVGElement.getAttribute('data-ceo-stat-chart'), text: text.textContent })),
  }));
  assert.equal(evidence.documentOverflow, false, 'No horizontal document overflow.');
  assert.equal(evidence.sectionOverflow, false, 'No horizontal overflow within the statistics.');
  assert.deepEqual(evidence.emptyCharts, []);
  assert.deepEqual(evidence.clippedControls, []);
  assert.deepEqual(evidence.brokenImages, []);
  assert.deepEqual(evidence.clippedChartText, [], 'Every chart label fits its SVG viewport.');
  return evidence;
}


async function storyElapsed(root) {
  const value = Number(await root.getAttribute('data-story-elapsed'));
  assert.ok(Number.isFinite(value) && value >= 0 && value <= 20_000);
  return value;
}

async function waitStoryAdvance(page, previous) {
  await page.waitForFunction(({ selector, previous }) => Number(document.querySelector(selector)?.getAttribute('data-story-elapsed')) > previous + 200, { selector: rootSelector, previous });
}

async function verifyAutomaticStory(page, root, complete) {
  await waitAttribute(page, 'data-story-playing', 'true');
  await page.waitForFunction(selector => Number(document.querySelector(selector)?.getAttribute('data-story-elapsed')) >= 1800, rootSelector);
  await root.getByRole('button', { name: '통계 이야기 일시정지', exact: true }).click();
  assert.equal(await root.getAttribute('data-motion-running'), 'false');
  const paused = await snapshot(root);
  assert.ok(paused.elapsed >= 1800 && paused.elapsed < 5000, 'Initial playback reaches a real intermediate value in the first segment.');
  assertSynchronized(paused);
  assert.ok(paused.values.skill.data > 10 && paused.values.skill.data < 30);
  assert.ok(paused.values.weight.data > 100 && paused.values.weight.data < 112);
  assert.ok(paused.values.time.data > 12 && paused.values.time.data < 16);
  assert.ok(paused.values.capital.data < 1000 && paused.values.capital.data > 760);
  assert.match(await root.locator('.insight-tag').innerText(), new RegExp('현재 ' + paused.values.skill.data + ' Lv\\.'));
  assert.match(await root.locator('.story-heading p').innerText(), new RegExp('기술력 ' + paused.values.skill.data));
  await root.getByRole('button', { name: '잔고 자세히 보기', exact: true }).click();
  const budgetStory = await root.locator('.insight-tag').innerText();
  assert.ok(budgetStory.includes(paused.expenseTotal.toLocaleString('ko-KR')) && budgetStory.includes(paused.balance.toLocaleString('ko-KR')), 'The explanatory story uses the interpolated budget, not a stale stage value.');
  assert.equal(await root.locator('.insight').getAttribute('aria-live'), null, 'Frame-by-frame amounts should not spam screen-reader announcements.');
  assert.equal(await root.locator('.stage-announcement').getAttribute('aria-live'), 'polite');
  await page.waitForTimeout(650); // Deliberately prove wall-clock time does not change a paused story.
  assert.deepEqual(await snapshot(root), paused);
  await root.getByRole('button', { name: '통계 이야기 재생', exact: true }).click();
  await waitStoryAdvance(page, paused.elapsed);

  // Synthetic document visibility exercises the production event handler without saved-state changes.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitAttribute(page, 'data-motion-running', 'false');
  const hidden = await snapshot(root);
  await page.waitForTimeout(650);
  assert.deepEqual(await snapshot(root), hidden, 'Hidden documents do not advance time or any number.');
  await page.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await waitStoryAdvance(page, hidden.elapsed);

  const priorTransform = await root.evaluate(section => {
    const prior = section.style.transform;
    section.style.transform = 'none';
    const shift = innerHeight - section.getBoundingClientRect().top + 100;
    section.style.transform = 'translateY(' + shift + 'px)';
    return prior;
  });
  try {
    assert.equal(await root.evaluate(section => section.getBoundingClientRect().top > innerHeight), true, 'The entire test surface is actually outside the viewport.');
    await waitAttribute(page, 'data-motion-running', 'false');
    const outside = await snapshot(root);
    await page.waitForTimeout(650);
    assert.deepEqual(await snapshot(root), outside, 'The real IntersectionObserver stops offscreen time and values.');
  } finally {
    await root.evaluate((section, transform) => { section.style.transform = transform; }, priorTransform);
  }
  await waitStoryAdvance(page, await storyElapsed(root));
  await root.getByRole('button', { name: '통계 이야기 일시정지', exact: true }).click();
  const beforeFocus = await snapshot(root);
  const detail = root.getByRole('button', { name: '잔고 자세히 보기', exact: true });
  await detail.focus();
  await page.keyboard.press('Enter');
  assert.equal(await detail.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await snapshot(root), beforeFocus, 'Metric selection preserves the timeline position and all values.');
  assert.equal(await detail.evaluate(button => {
    const style = getComputedStyle(button);
    return document.activeElement === button && ((style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none');
  }), true, 'Keyboard focus remains visible.');

  if (complete) {
    await root.getByRole('button', { name: '처음부터 다시 보기', exact: true }).click();
    await waitAttribute(page, 'data-story-playing', 'true');
    await waitAttribute(page, 'data-story-step', '0');
    assert.ok(await storyElapsed(root) < 1000, 'Replay resets the timeline to the first segment.');
    await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-story-step') === '1', rootSelector, { timeout: 8000 });
    assert.ok(await storyElapsed(root) >= 5000);
    await page.waitForFunction(selector => Number(document.querySelector(selector)?.getAttribute('data-story-elapsed')) >= 20_000, rootSelector, { timeout: 19_000 });
    await waitAttribute(page, 'data-story-playing', 'false');
    await verifyStage(page, root, stages[4], false);
    const finished = await snapshot(root);
    await page.waitForTimeout(650);
    assert.deepEqual(await snapshot(root), finished, 'Automatic playback finishes once with exact final values.');
  }
}

async function verifyStageKeyboard(page, root) {
  const target = root.getByRole('button', { name: '20시간 단계 보기', exact: true });
  await target.focus();
  await page.keyboard.press('Enter');
  await verifyStage(page, root, stages[2], false);
  assert.equal(await target.evaluate(button => {
    const style = getComputedStyle(button);
    return document.activeElement === button && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  }), true, 'Stage selection has a visible keyboard focus ring.');
  for (const metric of metrics) {
    const before = await snapshot(root);
    const button = root.getByRole('button', { name: metric.name + ' 자세히 보기', exact: true });
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await snapshot(root), before);
    assert.equal(await root.locator('[data-ceo-stat-chart]').count(), 4);
  }
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
    if (process.env.CEO_STATISTICS_TRACE_IO === '1') await context.addInitScript(() => {
      const NativeObserver = window.IntersectionObserver;
      window.__ceoIntersectionLog = [];
      window.IntersectionObserver = class extends NativeObserver {
        constructor(callback, options) {
          super((entries, observer) => {
            const relevant = entries.filter(entry => entry.target.matches('[data-ceo-statistics]'));
            if (relevant.length) window.__ceoIntersectionLog.push({ at: performance.now(), entries: relevant.map(entry => ({ time: entry.time, intersecting: entry.isIntersecting, ratio: entry.intersectionRatio, connected: entry.target.isConnected })) });
            callback(entries, observer);
          }, options);
        }
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /hydration|hydrated|Minified React|did not match|route-error/i.test(message.text())) errors.push(message.text());
    });
    try {
      const root = await openStatistics(page);
      const copy = await root.innerText();
      assert.match(copy, /창작|가상/);
      assert.match(copy, /실제|측정/);
      await verifyAutomaticStory(page, root, viewport.width === 1440);
      await verifyStageTable(root);
      for (const stage of stages) await verifyStage(page, root, stage);
      await verifyStageKeyboard(page, root);
      await verifyStage(page, root, stages[4]);
      const layout = await layoutEvidence(page, root);
      const deficitViolations = await accessibilityViolations(page);
      assert.deepEqual(deficitViolations, [], 'The final deficit scenario has no WCAG A/AA violations.');
      await root.evaluate(section => section.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.screenshot({ path: path.join(output, 'statistics-' + viewport.width + '.png') });
      await root.locator('[data-ceo-expenses]').screenshot({ path: path.join(output, 'expenses-' + viewport.width + '.png') });
      await root.locator('[data-ceo-stages]').screenshot({ path: path.join(output, 'stages-' + viewport.width + '.png') });
      for (const metric of metrics) await root.locator('[data-ceo-stat-chart="' + metric.id + '"]').screenshot({ path: path.join(output, 'chart-' + metric.id + '-' + viewport.width + '.png') });
      await verifyStage(page, root, stages[0]);
      const violations = await accessibilityViolations(page);
      assert.deepEqual(violations, [], 'The starting scenario has no WCAG A/AA violations.');

      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reducedRoot = await openStatistics(page);
      assert.equal(await reducedRoot.getByRole('button', { name: '통계 이야기 재생', exact: true }).isDisabled(), true);
      await verifyStage(page, reducedRoot, stages[4], false);
      const reduced = await snapshot(reducedRoot);
      await page.waitForTimeout(650);
      assert.deepEqual(await snapshot(reducedRoot), reduced, 'Reduced motion starts at the complete final state and stays still.');
      assert.equal(await reducedRoot.evaluate(section => section.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0);
      for (const stage of stages) await verifyStage(page, reducedRoot, stage);
      await verifyStageKeyboard(page, reducedRoot);
      await verifyStage(page, reducedRoot, stages[4]);
      await layoutEvidence(page, reducedRoot);
      await reducedRoot.evaluate(section => section.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.screenshot({ path: path.join(output, 'statistics-reduced-' + viewport.width + '.png') });
      await page.getByRole('tab', { name: /대표인사말/ }).click();
      await reducedRoot.waitFor({ state: 'detached' });
      await page.locator('button[data-greeting-stage]').waitFor();
      assert.deepEqual(errors, [], 'No runtime or hydration errors through autoplay, selection, reduced motion, and tab unmount.');
      results.push({
        viewport, stages: stages.map(stage => stage.id), intermediate: 'continuous values and cash arithmetic at approximately 2 seconds',
        expenses: '4-column summary, food >=80%, exact totals and signed balances, compact height',
        charts: '5 points per trend, 100-150kg gauge, 5 cumulative work-hour bars, -100만원 endpoint below zero',
        story: viewport.width === 1440 ? 'automatic entry, pause, resume, visibility/offscreen freeze, replay, exact one-time completion' : 'automatic entry, pause, resume, visibility/offscreen freeze',
        stageKeyboard: 'pass', reducedMotion: 'static finish on entry and manual selection', layout, errors, violations, deficitViolations,
      });
      await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
      console.log('PASS CEO statistics ' + viewport.width + 'px: 5 stages, continuous autoplay, exact endpoints, expense arithmetic, signed capital, cumulative hours, keyboard, reduced motion, overflow, axe, no runtime errors');
    } catch (error) {
      const state = await page.evaluate(async selector => {
        const section = document.querySelector(selector);
        const bounds = section?.getBoundingClientRect();
        const intersection = section ? await new Promise(resolve => {
          const observer = new IntersectionObserver(([entry]) => {
            observer.disconnect();
            resolve({ intersecting: entry.isIntersecting, ratio: entry.intersectionRatio });
          });
          observer.observe(section);
        }) : null;
        return {
          attributes: section ? Object.fromEntries([...section.attributes].map(attribute => [attribute.name, attribute.value])) : null,
          documentVisibility: document.visibilityState,
          documentHidden: document.hidden,
          bounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null,
          viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
          intersection,
          intersectionLog: window.__ceoIntersectionLog,
          scrollSurfaces: [...document.querySelectorAll('*')].filter(element => element.scrollTop > 0).map(element => ({ tag: element.tagName, id: element.id, scrollTop: element.scrollTop, height: element.clientHeight, scrollHeight: element.scrollHeight })),
        };
      }, rootSelector).catch(diagnosticError => ({ diagnosticError: String(diagnosticError) }));
      await writeFile(path.join(output, `failure-${viewport.width}.json`), JSON.stringify({ error: String(error), state }, null, 2));
      await page.screenshot({ path: path.join(output, `failure-${viewport.width}.png`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
