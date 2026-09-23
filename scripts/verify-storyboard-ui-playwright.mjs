import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = (process.env.STORYBOARD_UI_BASE_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(executablePath, "Storyboard UI 검증에는 Chrome 또는 Playwright Chromium이 필요합니다.");

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const source = message.location().url;
      const path = source ? new URL(source).pathname : "unknown";
      consoleErrors.push(`${message.text()} (${path})`);
    }
  });

  await page.goto(`${baseUrl}/admin/storyboard`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });

  const title = page.getByRole("heading", {
    name: "아이디어부터 완성 영상까지 한 작업공간에서",
  });
  await title.waitFor({ timeout: 30_000 });
  assert.equal(
    await page.getByLabel("스토리보드 제작 과정").locator("li").count(),
    3,
    "로그인 전에 전체 3단계 제작 과정을 보여줘야 합니다.",
  );
  assert.equal(
    await page.getByLabel("로그인과 데이터 사용 안내").locator("li").count(),
    2,
    "자동 저장과 외부 전송 경계를 로그인 전에 설명해야 합니다.",
  );
  const loginButton = page.getByRole("button", {
    name: "Google로 로그인하고 작업 시작",
  });
  assert.ok(await loginButton.isVisible(), "주요 로그인 CTA가 보여야 합니다.");
  const loginButtonHeight = await loginButton.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  assert.ok(loginButtonHeight >= 44, `로그인 CTA 높이가 부족합니다 (${loginButtonHeight}px).`);
  assert.match(await page.locator("body").innerText(), /로그인 전/);

  await page.setViewportSize({ width: 390, height: 844 });
  const backdrop = page.locator("button.mobile-sidebar-backdrop");
  assert.equal(await backdrop.count(), 0, "닫힌 메뉴의 배경 버튼은 DOM에 없어야 합니다.");
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await backdrop.waitFor({ state: "visible" });
  await backdrop.focus();
  await page.keyboard.press("Enter");
  await backdrop.waitFor({ state: "detached" });
  assert.equal(await backdrop.count(), 0, "키보드로 메뉴를 닫으면 배경 버튼이 제거돼야 합니다.");
  await page.waitForTimeout(120);
  const signedOutPageHeader = page.locator(
    '[data-page-view="true"][data-signed-out="true"]',
  );
  assert.equal(
    await signedOutPageHeader.count(),
    1,
    "비로그인 page 작업 헤더 상태 속성이 DOM에 유지돼야 합니다.",
  );
  assert.equal(
    await signedOutPageHeader.isVisible(),
    false,
    "비로그인 page presentation 모바일에서는 빈 작업 헤더 행을 숨겨야 합니다.",
  );
  assert.equal(
    await page.locator("#storyboard-workspace-title").isVisible(),
    false,
    "page presentation 모바일에서는 전역 제목과 중복되는 작업공간 제목을 숨겨야 합니다.",
  );
  const mobile = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    mobile.bodyWidth <= mobile.viewportWidth + 1,
    `390px 화면에서 가로 넘침이 발생했습니다 (${mobile.bodyWidth}px > ${mobile.viewportWidth}px).`,
  );
  assert.equal(mobile.clientWidth, 390);
  assert.deepEqual(pageErrors, [], `Storyboard page errors: ${pageErrors.join("\n")}`);
  assert.deepEqual(consoleErrors, [], `Storyboard console errors: ${consoleErrors.join("\n")}`);

  console.log("Storyboard signed-out desktop and 390px mobile UI verification passed.");
} finally {
  await browser.close();
}
