import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const url = new URL('/corp/company/staff-intro', process.env.BASE_URL || 'http://localhost:3002').href;
const output = path.resolve(process.env.STAFF_VERIFY_OUTPUT || '.tmp-staff-motion/ceo-network');
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* next installed browser */ }
}
assert.ok(executablePath, 'Set CHROME_PATH to an installed Chromium browser.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
async function waitForStaffPage(page) {
  // Next streaming may briefly keep hidden suspense markup while resolving the route.
  await page.waitForFunction(() => {
    const titles = document.querySelectorAll('#staff-intro-title');
    return titles.length === 1 && titles[0].getBoundingClientRect().height > 0;
  });
  assert.equal(await page.locator('#staff-intro-title').count(), 1, 'Only one staff page may remain after hydration.');
}
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 860 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForStaffPage(page);
    const board = page.locator('[data-staff-overview]');
    const stage = page.locator('#staff-collaboration');
    await page.waitForFunction(() => document.querySelector('[data-staff-overview]')?.getAttribute('data-motion-running') === 'true');
    await page.waitForTimeout(700);
    const motionTypes = await board.evaluate(element => [...new Set(element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations === Infinity).map(animation => animation.animationName))]);
    assert.ok(motionTypes.length >= 3, `At least 3 complementary motion types should be present: ${motionTypes.length}`);
    await stage.getByRole('button', { name: '대화 일시정지', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-staff-overview]')?.getAttribute('data-motion-running') === 'false');
    const playingLoops = await board.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations === Infinity && animation.playState === 'running').length);
    assert.equal(playingLoops, 0, 'Pause must stop every continuous visual motion.');
    assert.equal(await board.locator('[data-performance-region="staff-org-node"]').count(), 10);
    assert.equal(await board.locator('[data-team-profile]').count(), 100);
    assert.equal(await board.getByRole('button', { name: /상세 프로필 열기$/ }).count(), 125);
    const layout = await board.evaluate(element => ({
      top: element.getBoundingClientRect().top,
      bottom: element.getBoundingClientRect().bottom,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      clippedTeams: [...element.querySelectorAll('[data-team-profile]')].filter(team => team.scrollWidth > team.clientWidth + 1).map(team => team.textContent),
      visibleProfiles: [...element.querySelectorAll('button[aria-label$="상세 프로필 열기"]')].filter(button => { const r = button.getBoundingClientRect(); return r.top >= 64 && r.bottom <= innerHeight; }).length,
    }));
    assert.equal(layout.horizontalOverflow, false);
    assert.deepEqual(layout.clippedTeams, [], 'Every team name must fit.');
    if (viewport.width >= 1300) {
      assert.ok(layout.bottom <= viewport.height, `Entire organization should fit one screen: ${layout.bottom}px > ${viewport.height}px`);
      assert.equal(layout.visibleProfiles, 125, 'All profiles must be visible without scrolling.');
      const organization = await board.evaluate(element => {
        const center = element.querySelector('[data-ceo-anchor]').getBoundingClientRect();
        const centerX = center.x + center.width / 2;
        const nodes = [...element.querySelectorAll('[data-division]')].map(node => node.getBoundingClientRect());
        const network = element.querySelector('[data-organization-connections]').getBoundingClientRect();
        return { left: nodes.filter(node => node.right < centerX).length, right: nodes.filter(node => node.left > centerX).length, centered: Math.abs(centerX - (network.x + network.width / 2)) < 2, connections: element.querySelectorAll('[data-connection]').length };
      });
      assert.deepEqual(organization, { left: 5, right: 5, centered: true, connections: 10 }, 'CEO must be centered between all 10 connected divisions.');
    }
    await page.screenshot({ path: path.join(output, `overview-${viewport.width}.png`) });
    for (const [name, profile] of [
      ['그냥돼지 CEO 상세 프로필 열기', '그냥돼지'], ['ATLAS CTO 상세 프로필 열기', 'ATLAS'],
      ['개발팀 ARCHI 본부장 상세 프로필 열기', 'ARCHI'], ['웹개발팀 SCOPE 팀장 상세 프로필 열기', 'SCOPE'],
      ['영업운영팀 PIPELINE 팀장 상세 프로필 열기', 'PIPELINE'], ['R&D 랩 NOVA 상세 프로필 열기', 'NOVA'],
    ]) {
      const trigger = board.getByRole('button', { name, exact: true });
      await trigger.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('dialog', { name: profile, exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Profile should restore trigger focus.');
    }
    await stage.scrollIntoViewIfNeeded();
    const step = Number(await stage.getAttribute('data-step'));
    await stage.getByRole('button', { name: '다음 대화', exact: true }).click();
    assert.equal(Number(await stage.getAttribute('data-step')), (step + 1) % 7);
    for (let index = 0; index < 5; index++) {
      await stage.getByRole('combobox', { name: '협업 시나리오 선택' }).selectOption(String(index));
      assert.equal(await stage.getAttribute('data-step'), '0');
      await stage.getByRole('button', { name: '다음 대화', exact: true }).click();
      assert.equal(await stage.getAttribute('data-step'), '1');
    }
    await stage.getByRole('button', { name: '7단계 대표 검토 대화 보기', exact: true }).click();
    assert.equal(await stage.getAttribute('data-step'), '6');
    await page.waitForTimeout(5600);
    assert.equal(await stage.getAttribute('data-step'), '6', 'Paused scene must not advance.');
    await stage.evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(output, `collaboration-${viewport.width}.png`) });

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#staff-intro-page').scrollWidth <= innerWidth), true, 'No horizontal page overflow.');

    await page.addScriptTag({ content: axe.source });
    const accessibility = await page.evaluate(async () => window.axe.run(document.querySelector('#staff-intro-page'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    const violations = accessibility.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
    assert.deepEqual(errors, [], 'No browser runtime errors.');
    assert.deepEqual(violations, [], 'No WCAG A/AA violations in staff page.');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForStaffPage(page);
    assert.equal(await page.getByRole('button', { name: '동작 줄임 설정으로 자동 재생 꺼짐', exact: true }).isDisabled(), true);
    await stage.scrollIntoViewIfNeeded();
    const reducedStep = await stage.getAttribute('data-step');
    await page.waitForTimeout(5600);
    assert.equal(await stage.getAttribute('data-step'), reducedStep);
    assert.equal(await stage.getAttribute('data-running'), 'false');
    assert.equal(await board.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations === Infinity).length), 0, 'Reduced motion must remove every continuous animation.');
    await stage.getByRole('button', { name: '다음 대화', exact: true }).click();
    assert.equal(await stage.getAttribute('data-step'), '1');
    results.push({ viewport, layout, motionTypes, errors: [...errors], violations });
    await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    assert.deepEqual(errors, [], 'No hydration or runtime errors, including reduced-motion reload.');
    console.log(`PASS ${viewport.width}px: CEO network, ${motionTypes.length} motion types, 125 profiles, keyboard/focus, 5 scenes, complete pause, reduced motion, overflow, axe${viewport.width >= 1300 ? ', single viewport' : ''}`);
    await context.close();
  }
} finally {
  await browser.close();
}
