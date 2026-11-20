import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const data = await mkdtemp(path.join(os.tmpdir(), "hermes-office-fixture-"));
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
try {
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("fixture server timeout")),
      15000,
    );
    server.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    server.on("error", reject);
  });
  const key = (await readFile(path.join(data, "connector.key"), "utf8")).trim();
  const call = async (route, body) => {
    const response = await fetch(`${base}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  let state = await call("/api/ingest", {
    type: "inventory",
    eventId: "fixture-inventory",
    hostId: "fixture",
    hostName: "테스트 전용",
    at: new Date().toISOString(),
    employees: Array.from({ length: 100 }, (_, i) => ({
      botId: String(i + 1),
      name: `검증 직원 ${i + 1}`,
      username: `fixture_${i + 1}`,
      profile: `fixture-${i + 1}`,
      model: "TEST ONLY",
      capabilities: [],
      instructions: [],
    })),
  });
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("heading", { name: "사무실", exact: true }).waitFor();
  assert.equal(await page.locator(".scene-employee").count(), 25);
  await page.getByRole("button", { name: "4F", exact: true }).click();
  assert.equal(await page.locator(".scene-employee").count(), 25);
  await page.getByRole("button", { name: "직원·조직", exact: true }).click();
  await page.getByRole("button", { name: "부서 만들기" }).click();
  await page.getByRole("dialog").locator("[name=name]").fill("기획실");
  await page
    .getByRole("dialog")
    .locator("button[type=submit], button.primary")
    .last()
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.locator(".employee-card").first().click();
  await page
    .getByRole("dialog")
    .locator("[name=departmentId]")
    .selectOption({ label: "기획실" });
  await page.getByRole("dialog").locator("[name=title]").fill("팀장");
  await page.getByRole("button", { name: "직원 정보 저장" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "업무 등록", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.locator("[name=title]").fill("소개 자료 작성 검증");
  await dialog
    .locator("[name=request]")
    .fill("테스트 전용 소개 자료를 작성합니다.");
  await dialog.locator("[name=criteria]").fill("제목과 본문을 확인합니다.");
  await dialog.locator("[name=employeeId]").selectOption(state.employees[0].id);
  await dialog.getByRole("button", { name: "업무 등록", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.tasks.length, 1);
  const taskId = state.tasks[0].id;
  await call("/api/action", { type: "settings.update", dispatchPaused: false });
  await call("/api/ingest", {
    type: "agent:start",
    eventId: "fixture-start",
    runId: "fixture-run",
    taskId,
    hostId: "fixture",
    botId: "1",
    at: new Date().toISOString(),
  });
  await call("/api/ingest", {
    type: "agent:end",
    eventId: "fixture-end",
    runId: "fixture-run",
    hostId: "fixture",
    botId: "1",
    at: new Date().toISOString(),
    result: "검증 제목과 본문",
    summary: "테스트 결과를 작성했습니다.",
  });
  await page.getByRole("button", { name: /^업무 보드/ }).click();
  await page.locator(".badge-review").first().waitFor();
  await page
    .getByRole("button", { name: /소개 자료 작성 검증/ })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  state = await (await fetch(`${base}/api/state`)).json();
  const changed = await call("/api/action", {
    type: "task.update",
    id: taskId,
    revision: state.tasks[0].revision,
    summary: "다른 창에서 갱신한 실제 기록",
  });
  await page
    .locator(".page-footer")
    .filter({ hasText: `기록 버전 ${changed.revision}` })
    .waitFor();
  await dialog.getByRole("button", { name: "업무 기록 저장" }).click();
  await dialog.getByRole("alert").waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: /소개 자료 작성 검증/ })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog.locator("[name=status]").selectOption("approval");
  await dialog.getByRole("button", { name: "업무 기록 저장" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: /소개 자료 작성 검증/ })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .locator("[name=status]")
    .selectOption("completed");
  await page.getByRole("button", { name: "업무 기록 저장" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: /소개 자료 작성 검증/ })
    .first()
    .click();
  await page.getByRole("button", { name: "다음 직원에게 인계" }).click();
  dialog = page.getByRole("dialog");
  await dialog.locator("[name=title]").fill("소개 자료 후속 검토");
  await dialog.locator("[name=criteria]").fill("선행 결과 확인");
  await dialog.locator("[name=employeeId]").selectOption(state.employees[1].id);
  await dialog.getByRole("button", { name: "업무 등록", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "성과·포상", exact: true }).click();
  await page.getByRole("button", { name: "포상·피드백", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.locator("[name=title]").fill("검증 완료상");
  await dialog.locator("[name=taskId]").selectOption(taskId);
  await dialog.locator("[name=employeeId]").selectOption(state.employees[0].id);
  await dialog
    .locator("[name=content]")
    .fill("요구사항을 충족한 결과물을 만들었습니다.");
  await dialog.locator("[name=evidence]").fill("소개 자료 검토·승인 완료");
  await dialog.getByRole("button", { name: "초안으로 기록" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "교육·지식", exact: true }).click();
  await page
    .getByRole("button", { name: "교육·지식 등록", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.locator("[name=title]").fill("출처 교육");
  await dialog.locator("[name=content]").fill("출처를 표시하는 연습");
  await dialog.locator("[name=evidence]").fill("연습 결과 확인");
  await dialog.getByRole("button", { name: "초안으로 기록" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /출처 교육/ }).click();
  await page
    .getByRole("dialog")
    .locator("[name=status]")
    .selectOption("verified");
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.employees.length, 100);
  assert.equal(state.tasks[0].status, "completed");
  assert.deepEqual(state.tasks[1].dependencies, [taskId]);
  assert.equal(state.records.length, 2);
  assert.equal(
    state.records.find((r) => r.kind === "education").status,
    "verified",
  );
  const report = await (await fetch(`${base}/api/export`)).text();
  assert(report.includes("검증 완료상"));
  await page.reload();
  await page.getByRole("heading", { name: "사무실", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: isolated 100 employees/4 floors, department assignment, task→review→approval→completed, award, education verification, export, reload; no live data mutations",
  );
} finally {
  if (browser) await browser.close();
  server.kill();
}
