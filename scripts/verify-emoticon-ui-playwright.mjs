import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requestedBaseUrl = process.env.EMOTICON_UI_BASE_URL?.trim();
const port = Number(process.env.EMOTICON_UI_TEST_PORT || 3219);
let baseUrl = requestedBaseUrl || `http://127.0.0.1:${port}`;
let previewUrl = `${baseUrl}/admin/emoticon-studio?preview=1`;
const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => fs.existsSync(candidate));

assert.ok(executablePath, 'Chrome or Edge is required for the local Playwright smoke test.');

let server = null;
let serverOutput = '';

async function isPreviewReachable(url, timeoutMs = 2_500) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForPreview() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server && server.exitCode !== null) {
      throw new Error(`Next.js preview server exited early.\n${serverOutput.slice(-4_000)}`);
    }
    try {
      const response = await fetch(previewUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The development server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${previewUrl}.\n${serverOutput.slice(-4_000)}`);
}

if (!requestedBaseUrl) {
  const existingBaseUrl = 'http://127.0.0.1:3002';
  const existingPreviewUrl = `${existingBaseUrl}/admin/emoticon-studio?preview=1`;
  if (await isPreviewReachable(existingPreviewUrl)) {
    baseUrl = existingBaseUrl;
    previewUrl = existingPreviewUrl;
  }
}

if (!requestedBaseUrl && baseUrl !== 'http://127.0.0.1:3002') {
  server = spawn(process.execPath, [
    path.join(root, 'node_modules/next/dist/bin/next'),
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ], {
    cwd: root,
    env: {
      ...process.env,
      NEXT_PUBLIC_EMOTICON_STUDIO_PROVIDER: 'mock',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream?.on('data', (chunk) => {
      serverOutput = `${serverOutput}${String(chunk)}`.slice(-12_000);
    });
  }
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(previewUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '무엇으로 만들지 선택하세요' }).waitFor();
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  const projectName = 'Playwright 움직이는 이모티콘';
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAUQ7L7cAAAAASUVORK5CYII=',
    'base64',
  );
  const startModeNames = [
    '캐릭터 한 장으로 AI 제작',
    '사진 여러 장으로 움짤 제작',
    '한 장 시트를 프레임으로 분할',
    '저장한 작업 이어서 편집',
  ];
  for (const name of startModeNames) assert.equal(await page.getByRole('button', { name: new RegExp(name) }).count(), 1, `${name} mode must be exposed.`);
  assert.ok(await page.getByLabel('이모티콘 제작 사용법').isVisible(), 'The start screen must explain the shared three-step workflow.');
  assert.ok(await page.getByText('장면 생성 전 비용 확인', { exact: true }).isVisible(), 'AI mode must explain that cost is reviewed before scene generation.');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.getByText('이럴 때 추천').first().isVisible(), 'Mobile mode cards must retain the recommendation context.');
  const mobileHowHeight = await page.getByLabel('이모티콘 제작 사용법').evaluate((element) => element.getBoundingClientRect().height);
  assert.ok(mobileHowHeight <= 140, `Mobile start guide is too tall (${mobileHowHeight}px).`);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: /한 장 시트를 프레임으로 분할/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'sheet-before.png', mimeType: 'image/png', buffer: png });
  await page.getByText('1. sheet-before.png').waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: 'sheet-after.png', mimeType: 'image/png', buffer: png });
  await page.getByText('1. sheet-after.png').waitFor();
  assert.equal(await page.locator('figcaption').count(), 1, 'Replacing a sprite sheet must keep exactly one source preview.');
  await page.getByRole('button', { name: '제작 방식 선택으로 돌아가기' }).click();

  await page.getByRole('button', { name: /캐릭터 한 장으로 AI 제작/ }).click();
  await page.getByLabel('프로젝트 이름').waitFor();
  assert.equal(await page.locator('textarea[name="creationPrompt"]').count(), 0, 'Scene prompting belongs to the production phase, not character preparation.');

  const duplicateCharacterFile = {
    name: 'character.png',
    mimeType: 'image/png',
    buffer: png,
  };
  const sourceRequiredButton = page.getByRole('button', { name: '캐릭터 이미지를 먼저 올려주세요' });
  assert.equal(await sourceRequiredButton.isDisabled(), true, 'Character preparation must name the missing source before it can continue.');
  assert.ok(await page.getByLabel('시작 준비 상태').isVisible(), 'Preparation checklist must be visible before submission.');
  await page.getByLabel('프로젝트 이름').fill(projectName);
  await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 5 }, (_, index) => ({
    name: `character-${index + 1}.png`,
    mimeType: 'image/png',
    buffer: png,
  })));
  assert.equal(await page.locator('figure').count(), 4, 'AI preparation must cap selected source images at four.');
  assert.ok(await page.getByRole('status').getByText('최대 4장까지만 선택할 수 있어 1개를 제외했습니다.').isVisible(), 'The source cap must be explained instead of silently dropping files.');
  while (await page.getByRole('button', { name: /번째 이미지 제거/ }).count()) {
    await page.getByRole('button', { name: /번째 이미지 제거/ }).first().click();
  }
  await page.locator('input[type="file"]').setInputFiles([
    duplicateCharacterFile,
    duplicateCharacterFile,
  ]);
  assert.equal(await page.locator('img[alt="1번째 원본"]').count(), 1, 'Duplicate files must only be added once.');
  assert.equal(await page.getByRole('button', { name: '이미지 사용 권리를 확인해 주세요' }).isDisabled(), true, 'CTA must name the remaining rights confirmation.');
  await page.locator('input[type="checkbox"]').check();
  const continueButton = page.getByRole('button', { name: '캐릭터 확인으로 계속' });
  assert.equal(await continueButton.isEnabled(), true, 'Name, character image, and rights confirmation must enable the next action.');
  await continueButton.click();
  await page.getByText('분석 내용·고정 설정 수정', { exact: true }).click();
  const referenceRole = page.locator('select[aria-label="1번 참고 이미지 방향"]');
  await referenceRole.waitFor();
  assert.deepEqual(await referenceRole.locator('option').allTextContents(), ['정면', '측면', '후면', '표정 참고', '기타 참고']);
  await page.getByTestId('preview-chat').click();
  await page.locator('#emoticon-v2-creation-composer').waitFor();
  assert.ok(await page.getByText('이 페이지 사용법', { exact: true }).isVisible(), 'Existing projects must keep an in-page usage guide.');
  const advancedSettings = page.getByText('고급 생성 설정', { exact: true }).locator('xpath=ancestor::details');
  assert.equal(await advancedSettings.getAttribute('open'), null, 'Advanced generation settings must default to collapsed.');
  assert.match(await page.getByLabel('현재 생성 설정 요약').innerText(), /8프레임[\s\S]*LINE[\s\S]*GPT 라이트/);
  const composerBeforeResult = await page.locator('#emoticon-v2-creation-composer').evaluate((composer, result) => Boolean(composer.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING), await page.getByRole('button', { name: /APNG 다운로드/ }).elementHandle());
  assert.ok(composerBeforeResult, 'The next-scene composer must appear before historical completed results.');
  const resultBodyTop = await page.getByRole('button', { name: /APNG 다운로드/ }).evaluate((element) => element.getBoundingClientRect().top);
  const sourceSheetTop = await page.getByTestId('source-sheet-workspace').evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(resultBodyTop < sourceSheetTop, 'Completed result download must appear before sheet splitting and frame editing.');
  const sourceSheetColumns = await page.getByTestId('source-sheet-workspace').evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  assert.equal(sourceSheetColumns.trim().split(/\s+/).length, 1, 'The unsplit source sheet must not reserve an empty second column.');

  const composerPrompt = page.locator('#emoticon-v2-creation-prompt');
  const composerPromptBeforeEnter = await composerPrompt.inputValue();
  await composerPrompt.focus();
  await composerPrompt.evaluate((element) => element.setSelectionRange(element.value.length, element.value.length));
  await composerPrompt.press('Enter');
  assert.equal(await composerPrompt.inputValue(), `${composerPromptBeforeEnter}\n`, 'Composer Enter must insert a newline.');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileComposerLayout = await composerPrompt.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const submit = element.parentElement?.querySelector('button:last-child')?.getBoundingClientRect();
    return { inputWidth: box.width, inputBottom: box.bottom, submitTop: submit?.top || 0 };
  });
  assert.ok(mobileComposerLayout.inputWidth >= 330, `Mobile composer input is too narrow (${mobileComposerLayout.inputWidth}px).`);
  assert.ok(mobileComposerLayout.submitTop >= mobileComposerLayout.inputBottom, 'Mobile composer submit action must be on the row below the textarea.');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await advancedSettings.locator('summary').click();
  assert.equal(await page.getByRole('group', { name: '고급 생성 품질' }).getByRole('button').count(), 3, 'Quality mode must have one canonical advanced control group.');
  await page.locator('#emoticon-v2-creation-composer select:has(option[value="kakao"])').selectOption('kakao');
  const frameCountInput = page.locator('input[name="frameOrImageCount"]');
  assert.equal(await frameCountInput.getAttribute('min'), '4');
  await frameCountInput.fill('4');
  assert.equal(await frameCountInput.inputValue(), '4');

  await page.getByText('버전·백업', { exact: true }).click();
  await page.getByRole('button', { name: '버전 이력 열기' }).click();
  assert.ok(await page.getByText('미리보기에서는 작업 이력을 열지 않습니다.').isVisible());

  await page.getByTestId('preview-editor').click();
  await page.locator('#professional-editor-title').waitFor();
  assert.ok(await page.locator('input[aria-label="미리보기 프레임 선택"]').isVisible());
  assert.ok(await page.getByTestId('animation-timing-editor').isVisible());
  assert.ok(await page.getByTestId('frame-duration-0').isVisible());
  assert.ok(await page.getByTestId('frame-transition-1').isVisible());
  assert.ok(await page.getByText('전체 속도', { exact: true }).isVisible());
  assert.ok(await page.locator('option').filter({ hasText: '부드러운 페이드' }).count() > 0);

  await page.getByRole('button', { name: '말풍선' }).click();
  assert.ok(await page.getByRole('button', { name: '귀여움 말풍선 스타일 적용' }).isVisible());
  assert.ok(await page.getByRole('button', { name: '만화책 말풍선 스타일 적용' }).isVisible());
  assert.ok(await page.getByLabel('모양').isVisible());
  assert.ok(await page.getByLabel('등장 효과').isVisible());
  assert.ok(await page.getByTestId('bubble-live-preview').isVisible());

  await page.getByRole('button', { name: '위치·크기' }).click();
  const originalCompare = page.getByRole('button', { name: '원본 비교' });
  await originalCompare.click();
  assert.equal(await page.getByRole('button', { name: '편집본 보기' }).getAttribute('aria-pressed'), 'true');
  assert.ok(await page.getByAltText('편집 전 원본 첫 프레임').isVisible());

  await page.getByRole('button', { name: '사진·프레임' }).click();
  await page.locator('#asset-library-title').waitFor();
  assert.ok(await page.getByRole('searchbox', { name: '이미지 보관함 검색' }).isVisible());
  const favoriteAsset = page.locator('button[aria-label$="즐겨찾기"]').first();
  await favoriteAsset.click();
  await page.getByRole('button', { name: /^즐겨찾기 \d+$/ }).click();
  const trashAsset = page.locator('button[aria-label$="휴지통으로 이동"]').first();
  await trashAsset.click();
  await page.getByRole('button', { name: /^휴지통 \d+$/ }).click();
  await page.getByRole('button', { name: '복구', exact: true }).first().click();

  const spriteBase64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    context.fillStyle = '#00F20A';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        context.fillStyle = column % 2 ? '#2457B2' : '#F2C36B';
        context.beginPath();
        context.arc(column * 100 + 50, row * 100 + 50, 25 + row * 4, 0, Math.PI * 2);
        context.fill();
      }
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  });
  await page.locator('#manual-sprite-sheet').setInputFiles({
    name: 'qa-sprite-sheet.png',
    mimeType: 'image/png',
    buffer: Buffer.from(spriteBase64, 'base64'),
  });
  await page.getByText('시트 분할 확인', { exact: true }).waitFor();
  assert.ok(await page.getByText(/자동 감지 4열 × 2행/).isVisible());
  assert.equal(await page.getByLabel('모서리 배경색을 투명하게 제거').isChecked(), true);
  await page.getByRole('button', { name: '8장으로 분할해 타임라인에 추가' }).click();
  await page.getByText('8/24장', { exact: true }).waitFor();
  assert.equal(await page.locator('img[alt$="번째 프레임 미리보기"]').count(), 8);

  await page.getByRole('button', { name: '세부 조정 닫기' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#emoticon-v2-creation-composer').waitFor();
  await page.getByRole('button', { name: '정지 이미지 세트' }).click();
  await page.locator('#emoticon-v2-creation-prompt').fill('삐진 표정으로 고개를 돌리며 흥 하는 정지 이미지');
  await page.getByRole('button', { name: /정지 8장 생성 전 비용 확인/ }).click();
  const approvalPanel = page.getByRole('region', { name: '생성 전 비용·외부 전송 승인' });
  await approvalPanel.waitFor();
  assert.match(await approvalPanel.innerText(), /아직 이미지 provider를 호출하지 않았습니다/);
  assert.match(await approvalPanel.innerText(), /OpenRouter 및 선택된 모델 공급자/);
  const approvalButton = page.getByRole('button', { name: /최대 \$[\d.]+ 승인하고 생성/ });
  assert.equal(await approvalButton.isDisabled(), true, 'Paid generation must remain disabled before explicit consent.');
  await approvalPanel.getByRole('checkbox').check();
  assert.equal(await approvalButton.isEnabled(), true, 'Explicit consent must enable the final paid-generation action.');
  await page.waitForTimeout(100);
  const viewport = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  assert.ok(
    viewport.bodyWidth <= viewport.viewportWidth + 1,
    `Mobile layout overflowed (${viewport.bodyWidth}px > ${viewport.viewportWidth}px).`,
  );
  assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('\n')}`);

  console.log('Emoticon Studio Playwright draft restore, upload, timing/transition editor, bubble presets, editor compare, photo animation flow, and mobile flow passed.');
} finally {
  await browser?.close().catch(() => undefined);
  if (server && server.exitCode === null) server.kill();
}
