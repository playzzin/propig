import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import axe from "axe-core";

// Isolated synthetic company only. No real profiles, provider calls, or company edits.
const data = await mkdtemp(path.join(os.tmpdir(), "office-design-"));
const out = path.resolve("output/hermes-office-qa/design");
await mkdir(out, { recursive: true });
const python =
  process.env.OFFICE_PYTHON ||
  path.join(
    os.homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
  );
const server = spawn(
  python,
  [
    "-X",
    "utf8",
    "-B",
    "scripts/hermes-office/server.py",
    "--port",
    "0",
    "--data",
    data,
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let browser;
const failures = [];
const report = { synthetic: true, paidCalls: 0, viewports: [], checks: [] };
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture startup timeout")),
      15000,
    );
    server.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    server.on("error", reject);
    server.on("exit", (code) => {
      if (code) reject(new Error(`Fixture exited ${code}`));
    });
  });
  const key = (await readFile(path.join(data, "connector.key"), "utf8")).trim();
  const call = async (body) => {
    const response = await fetch(`${base}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const seed = await call({
    type: "inventory",
    eventId: "design-inventory",
    hostId: "design",
    at: new Date().toISOString(),
    employees: Array.from({ length: 100 }, (_, index) => ({
      botId: String(index + 1),
      name: index
        ? `디자인 검증 직원 ${index + 1}`
        : "아주 긴 이름을 가진 디자인 검증 직원",
      profile: `design-${index}`,
      model: "합성 모델",
      capabilities: [],
      instructions: [],
    })),
  });
  const event = (type, id, runId, extra = {}) =>
    call({
      type,
      eventId: `${type}-${runId}-${id}`,
      hostId: "design",
      botId: String(id),
      runId,
      at: new Date().toISOString(),
      telemetrySource: "hook",
      ...extra,
    });
  await event("agent:start", 1, "review", { title: "디자인 검토 결과" });
  await event("agent:end", 1, "review", {
    result: "원본과 분리된 검토 화면 시험",
  });
  await event("agent:start", 2, "working", { title: "진행 중인 검증 업무" });
  await event("agent:start", 3, "waiting", {
    title: "추가 답변을 기다리는 검증",
  });
  await event("agent:step", 3, "waiting", {
    stage: "input_wait",
    summary: "입력 대기",
  });
  const original = await (await fetch(`${base}/api/state`)).json();
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  for (const width of [390, 768, 1440, 1920]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
      bypassCSP: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => failures.push(e.message));
    // Fix fixture timestamps in each reload so this visual test never relies on machine speed.
    await page.route("**/api/state", (route) => {
      const state = structuredClone(original);
      const now = new Date().toISOString();
      state.hosts.forEach((host) => {
        host.lastSeen = now;
      });
      state.tasks.forEach((task) => {
        task.updatedAt = now;
      });
      return route.fulfill({ json: state });
    });
    await page.goto(base);
    await page.locator(".scene-employee").first().waitFor();
    assert.equal(await page.locator(".scene-employee").count(), 25);
    assert.equal(await page.locator(".office-metric").count(), 4);
    await page.getByRole("button", { name: "4F", exact: true }).click();
    assert.equal(await page.locator(".scene-employee").count(), 25);
    await page.getByRole("button", { name: "1F", exact: true }).click();
    const inbox = page.locator("#office-inbox");
    await inbox.getByText("디자인 검토 결과", { exact: true }).waitFor();
    await inbox
      .getByText("추가 답변을 기다리는 검증", { exact: true })
      .waitFor();
    const running = page
      .locator(".scene-employee")
      .filter({ hasText: "디자인 검증 직원 2" })
      .first();
    const waiting = page
      .locator(".scene-employee")
      .filter({ hasText: "디자인 검증 직원 3" })
      .first();
    assert.equal(await running.locator(".is-working").count(), 1);
    assert.equal(await waiting.locator(".is-working").count(), 0);
    assert.equal(
      await waiting.locator(".scene-status").innerText(),
      "답변 대기",
    );
    const overlap = await page
      .locator(".scene-employee")
      .evaluateAll((nodes) => {
        const boxes = nodes.map((node) => node.getBoundingClientRect());
        return boxes.some((a, i) =>
          boxes
            .slice(i + 1)
            .some(
              (b) =>
                a.left < b.right &&
                a.right > b.left &&
                a.top < b.bottom &&
                a.bottom > b.top,
            ),
        );
      });
    assert(!overlap, `25 employee targets do not overlap at ${width}`);
    assert(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )),
      `no document overflow ${width}`,
    );
    await page.getByRole("button", { name: "관람 모드", exact: true }).click();
    assert(await page.locator(".office-feed").isHidden());
    await page.getByRole("button", { name: /^확인할 업무/ }).click();
    assert(await inbox.isVisible());
    await page.waitForFunction(
      () => document.activeElement?.id === "office-inbox",
    );
    await page.getByRole("button", { name: "관람 모드", exact: true }).click();
    await page.getByRole("button", { name: /^함께하는 직원/ }).click();
    await page
      .getByRole("heading", { name: "직원·조직", exact: true })
      .waitFor();
    assert(
      await page.getByRole("navigation", { name: "주 메뉴" }).isVisible(),
      "metric navigation exits observation mode",
    );
    await page.getByRole("textbox", { name: "직원 검색" }).fill("아주 긴 이름");
    assert.equal(await page.locator(".employee-card").count(), 1);
    await page.locator(".employee-card").click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
    );
    await page.keyboard.press("Shift+Tab");
    assert(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    );
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    assert.notEqual(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
    );
    await page.getByRole("button", { name: "사무실", exact: true }).click();
    const viewport = page.locator(".scene-map-viewport");
    const overflowing = await viewport.evaluate(
      (el) => el.scrollWidth > el.clientWidth + 1,
    );
    assert.equal(
      await page.locator(".scene-scroll-hint").isVisible(),
      overflowing,
      `scroll hint matches map overflow at ${width}`,
    );
    if (width === 390) {
      await viewport.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        () => document.querySelector(".scene-map-viewport").scrollLeft > 0,
      );
    }
    assert.equal(
      await running
        .locator(".figure-arm")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(() =>
      window.axe
        .run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
        .then((r) =>
          r.violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          })),
        ),
    );
    assert.deepEqual(violations, [], `a11y ${width}`);
    await page.screenshot({
      path: path.join(out, `synthetic-100-${width}.png`),
      fullPage: true,
    });
    report.viewports.push(width);
    await context.close();
  }
  report.checks.push(
    "100 staff, 4 floors, 25 non-overlapping targets",
    "Review + pending reply visible in inbox",
    "Real activity semantics retained",
    "Observation mode + metric navigation",
    "Search + long names + dialog keyboard/scroll restoration",
    "Mobile map keyboard scroll",
    "Reduced motion + WCAG automated checks",
  );
  // Empty, offline and fetch failure must stay legible without fake active people.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  for (const mode of ["empty", "offline", "error"]) {
    await page.unroute("**/api/state");
    await page.route("**/api/state", (route) => {
      if (mode === "error")
        return route.fulfill({
          status: 503,
          json: { error: "연결을 확인한 뒤 다시 시도하세요." },
        });
      const state = structuredClone(original);
      if (mode === "empty") {
        state.employees = [];
        state.tasks = [];
        state.hosts = [];
        state.events = [];
      } else {
        state.hosts.forEach((host) => {
          host.lastSeen = "2000-01-01T00:00:00Z";
        });
        state.employees.forEach((e) => {
          e.runtime = {
            status: "offline",
            lastSeen: "2000-01-01T00:00:00Z",
            summary: "합성 연결 끊김",
          };
        });
      }
      return route.fulfill({ json: state });
    });
    await page.goto(base);
    if (mode === "error")
      await page
        .getByRole("button", { name: "다시 연결", exact: true })
        .waitFor();
    else {
      await page
        .getByRole("heading", { name: "사무실", exact: true })
        .waitFor();
      assert.equal(
        await page.locator(".scene-employee .is-working").count(),
        0,
      );
      if (mode === "empty") {
        const welcome = page.locator(".scene-empty");
        await welcome
          .getByRole("heading", {
            name: "첫 출근을 기다리고 있어요",
            exact: true,
          })
          .waitFor();
        const box = await welcome.boundingBox();
        assert(
          box.x >= 0 && box.x + box.width <= 390,
          "empty onboarding fits mobile viewport without horizontal scrolling",
        );
      } else
        assert.equal(
          await page.locator(".scene-employee.employee-unavailable").count(),
          25,
        );
    }
    assert(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )),
    );
    await page.screenshot({
      path: path.join(out, `${mode}-390.png`),
      fullPage: true,
    });
  }
  report.checks.push("Empty/offline/fetch-error states");
  await context.close();
  assert.deepEqual(failures, []);
  await writeFile(
    path.join(out, "verification.json"),
    JSON.stringify({ ...report, ok: true }, null, 2),
  );
  console.log(
    "PASS: isolated design workflow, 100 staff/4 floors, four widths, keyboard, reduced-motion, accessibility, empty/offline/error",
  );
} finally {
  await browser?.close();
  server.kill();
}
