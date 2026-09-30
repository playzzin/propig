import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

// All requests target this synthetic, ephemeral server. No real bot inventory.
const data = await mkdtemp(path.join(os.tmpdir(), "office-phase2-"));
const python = process.env.OFFICE_PYTHON || path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe");
const server = spawn(python, ["-X", "utf8", "-B", "scripts/hermes-office/server.py", "--port", "0", "--data", data], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let browser;
const faults = [];
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Fixture startup timeout")), 15000);
    server.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    server.on("error", reject);
    server.on("exit", (code) => { if (code) reject(new Error(`Fixture exited ${code}`)); });
  });
  const key = (await readFile(path.join(data, "connector.key"), "utf8")).trim();
  const state = async () => (await fetch(`${base}/api/state`)).json();
  const call = async (route, body) => {
    const response = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  let current = await call("/api/ingest", { type: "inventory", eventId: "fixture-100", hostId: "fixture", at: new Date().toISOString(), employees: Array.from({ length: 100 }, (_, i) => ({ botId: String(i + 1), name: `검증 직원 ${i + 1}`, profile: `fixture-${i}`, model: "합성 테스트", capabilities: [], instructions: [] })) });
  assert.equal(current.employees.length, 100);
  assert.equal(current.settings.dispatchPaused, true);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => { faults.push(error.message); console.error("Fixture page error:", error.message); });
  await page.goto(base);
  await page.getByRole("heading", { name: "사무실", exact: true }).waitFor();
  assert.equal(await page.locator(".scene-employee").count(), 25);
  await page.getByRole("button", { name: "4F", exact: true }).click();
  assert.equal(await page.locator(".scene-employee").count(), 25);

  // Only confirmed pending input pauses the person, not a completed tool event.
  await page.getByRole("button", { name: "1F", exact: true }).click();
  await call("/api/ingest", { type: "agent:start", eventId: "reply-start", hostId: "fixture", botId: "1", runId: "reply-check", at: new Date().toISOString(), title: "추가 답변 검증", telemetrySource: "hook" });
  await call("/api/ingest", { type: "agent:step", eventId: "reply-wait", hostId: "fixture", botId: "1", runId: "reply-check", at: new Date().toISOString(), summary: "Telegram 답변을 기다리고 있습니다.", stage: "input_wait", telemetrySource: "observer", existingRunOnly: true });
  const waitingEmployee = page.locator(".scene-employee").filter({ hasText: "검증 직원 1" }).first();
  await waitingEmployee.getByText("답변 대기", { exact: true }).waitFor();
  assert.equal(await waitingEmployee.locator(".is-working").count(), 0);
  const inbox = page.locator(".office-feed section").filter({ has: page.getByRole("heading", { name: "대표 확인함", exact: true }) });
  await inbox.getByText("추가 답변 검증", { exact: true }).waitFor();
  await call("/api/ingest", { type: "agent:step", eventId: "reply-resume", hostId: "fixture", botId: "1", runId: "reply-check", at: new Date().toISOString(), summary: "Hermes가 다음 작업 단계를 처리하고 있습니다.", stage: "processing", telemetrySource: "hook" });
  await waitingEmployee.getByText("작업 중", { exact: true }).waitFor();
  assert.equal(await waitingEmployee.locator(".is-working").count(), 1);
  await call("/api/ingest", { type: "agent:step", eventId: "reply-tool-returned", hostId: "fixture", botId: "1", runId: "reply-check", at: new Date().toISOString(), summary: "도구 사용: clarify", stage: "tool", telemetrySource: "hook" });
  await page.reload();
  await waitingEmployee.getByText("작업 중", { exact: true }).waitFor();
  assert.equal(await waitingEmployee.getByText("답변 대기", { exact: true }).count(), 0);
  await call("/api/ingest", { type: "agent:end", eventId: "reply-end", hostId: "fixture", botId: "1", runId: "reply-check", at: new Date().toISOString(), result: "합성 답변 확인", telemetrySource: "hook" });

  // API fixtures seed the new feature panels; user navigation is exercised below.
  current = await call("/api/action", { type: "workflow.create", name: "단계별 검증 협업", goal: "조사 후 보고", kind: "project", employeeIds: current.employees.slice(0, 2).map((e) => e.id) });
  const plan = current.workflows.at(-1);
  current = await call("/api/action", { type: "workflow.launch", id: plan.id, revision: plan.revision });
  assert(current.tasks.some((t) => t.workflowId === plan.id));
  current = await call("/api/action", { type: "record.create", kind: "education", title: "검증 교육", content: "합성 교육 내용", evidence: "합성 연습 근거", employeeId: current.employees[0].id });
  let record = current.records.at(-1);
  current = await call("/api/action", { type: "record.update", id: record.id, revision: record.revision, status: "verified" });
  current = await call("/api/action", { type: "training.apply", recordId: record.id, employeeId: current.employees[0].id });
  assert.equal(current.training.at(-1).status, "active");
  await page.reload();

  await page.getByRole("button", { name: "프로젝트", exact: true }).click();
  await page.getByRole("button", { name: "협업 계획 만들기", exact: true }).click();
  const create = page.locator(".workflow-create");
  await create.getByLabel("계획 이름", { exact: true }).fill("화면에서 만든 협업");
  await create.getByLabel("함께 달성할 목표", { exact: true }).fill("실제 클릭으로 검토할 초안 만들기");
  await create.getByRole("checkbox", { name: "검증 직원 1", exact: true }).check();
  await create.getByRole("checkbox", { name: "검증 직원 2", exact: true }).check();
  await create.getByRole("button", { name: "검토할 계획 초안 만들기", exact: true }).click();
  await create.waitFor({ state: "hidden" });
  const card = page.locator(".workflow-list article").filter({ has: page.getByRole("heading", { name: "화면에서 만든 협업", exact: true }) });
  await card.getByRole("button", { name: "계획 편집", exact: true }).click();
  assert.deepEqual(faults, [], "No exception opening workflow editor");
  await page.locator(".workflow-editor").waitFor();
  await page.locator(".workflow-editor .workflow-step").first().locator("textarea").last().fill("실제 수정한 검증 기준");
  await page.getByRole("button", { name: "계획 저장", exact: true }).click();
  await page.locator(".workflow-editor").waitFor({ state: "hidden" });
  await card.getByRole("button", { name: "실제 업무로 등록", exact: true }).click();
  await card.getByText("실행 예약", { exact: true }).waitFor();
  current = await state();
  assert(current.tasks.some((t) => t.criteria === "실제 수정한 검증 기준"));

  await page.getByRole("button", { name: "교육·지식", exact: true }).click();
  await page.getByRole("button", { name: "이 버전 적용 철회", exact: true }).click();
  await page.getByText("철회됨", { exact: true }).waitFor();
  const trainingForm = page.locator("form").filter({ has: page.getByRole("button", { name: "검증 내용 적용", exact: true }) });
  await trainingForm.locator("[name=recordId]").selectOption(record.id);
  await trainingForm.locator("[name=employeeId]").selectOption(current.employees[0].id);
  await trainingForm.getByRole("button", { name: "검증 내용 적용", exact: true }).click();
  await page.getByText("적용 중", { exact: true }).waitFor();
  current = await state();
  assert.equal(current.training.length, 2);
  assert.equal(current.training[0].status, "rolled_back");
  assert.equal(current.training[1].status, "active");

  await page.getByRole("button", { name: "사무실", exact: true }).click();
  await page.getByRole("button", { name: "사무실 배치 편집", exact: true }).click();
  await page.getByRole("button", { name: "공용 공간 추가", exact: true }).click();
  await page.getByLabel("공간 이름", { exact: true }).fill("검증 회의 공간");
  await page.getByRole("button", { name: "공간 저장", exact: true }).click();
  await page.locator(".room-form").waitFor({ state: "hidden" });
  await page.locator(".seat-form select").selectOption(current.employees[0].id);
  await page.getByLabel("옮길 좌석 (1~100)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "자리 이동·교환", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('button[disabled].primary'));
  current = await state();
  assert.equal(current.employees[0].seat, 99);
  assert.equal(current.employees[99].seat, 0);
  assert(current.rooms.some((r) => r.name === "검증 회의 공간"));

  await page.getByRole("button", { name: "회사 설정", exact: true }).click();
  await page.getByRole("checkbox", { name: "Office 신규 실행 일시정지", exact: true }).uncheck();
  await page.getByRole("button", { name: "관찰·실행 설정 저장", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('button[disabled].primary'));
  assert.equal((await state()).settings.dispatchPaused, false);

  await page.getByRole("button", { name: "프로젝트", exact: true }).click();
  await page.getByRole("button", { name: "AI에게 분담안 요청", exact: true }).click();
  const aiForm = page.locator("form").filter({ has: page.getByRole("button", { name: "분담안 작성 업무 등록", exact: true }) });
  await aiForm.locator("[name=name]").fill("AI 검증 분담안");
  await aiForm.locator("[name=goal]").fill("테스트 JSON으로 검토 가능한 분담안 작성");
  await aiForm.locator("[name=plannerId]").selectOption(current.employees[0].id);
  await aiForm.getByRole("checkbox", { name: "검증 직원 1", exact: true }).check();
  await aiForm.getByRole("checkbox", { name: "검증 직원 2", exact: true }).check();
  await aiForm.getByRole("button", { name: "분담안 작성 업무 등록", exact: true }).click();
  await aiForm.waitFor({ state: "hidden" });
  current = await state();
  const planningTask = current.tasks.find((t) => t.stage === "planning");
  assert(planningTask && planningTask.status === "queued");
  await call("/api/ingest", { type: "agent:start", eventId: "ai-plan-start", hostId: "fixture", botId: "1", runId: "ai-plan", taskId: planningTask.id, at: new Date().toISOString() });
  const generated = { name: "가져온 AI 초안", goal: "테스트 목표", kind: "project", steps: [
    { id: "one", title: "자료 조사", request: "조사 결과 작성", employeeId: current.employees[0].id, criteria: "출처 포함", dependencies: [], stage: "research" },
    { id: "two", title: "보고 작성", request: "조사 결과 검토", employeeId: current.employees[1].id, criteria: "근거 확인", dependencies: ["one"], stage: "review" },
  ] };
  await call("/api/ingest", { type: "agent:end", eventId: "ai-plan-end", hostId: "fixture", botId: "1", runId: "ai-plan", at: new Date().toISOString(), result: JSON.stringify(generated) });
  await page.getByRole("button", { name: "분담안 가져오기", exact: true }).click();
  await page.getByRole("heading", { name: "가져온 AI 초안", exact: true }).waitFor();
  current = await state();
  assert.equal(current.workflows.at(-1).status, "draft");
  assert.equal(current.workflows.at(-1).sourceTaskId, planningTask.id);
  const tasksBeforePractice = current.tasks.length;
  await page.getByRole("button", { name: "교육·지식", exact: true }).click();
  const practice = page.locator("form").filter({ has: page.getByRole("button", { name: "실습 업무 배정", exact: true }) });
  await practice.locator("select").first().selectOption(record.id);
  await practice.locator("[name=employeeId]").selectOption(current.employees[0].id);
  await practice.locator("[name=exercise]").fill("출처 2개를 비교하는 합성 실습");
  await practice.locator("[name=criteria]").fill("출처와 결론 구분");
  await practice.getByRole("button", { name: "실습 업무 배정", exact: true }).click();
  await practice.getByRole("status").waitFor();
  current = await state();
  assert.equal(current.tasks.length, tasksBeforePractice + 1);
  assert.equal(current.tasks.at(-1).stage, "education");
  assert.equal(current.tasks.at(-1).status, "queued");

  const sections = ["사무실", "직원·조직", "업무 보드", "프로젝트", "기록 보관함", "성과·포상", "교육·지식", "회사 설정"];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const name of sections) {
      await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
      await page.getByRole("heading", { name, exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: overflow at ${width}`);
      if (name === "사무실") {
        for (const floorName of ["1F", "4F"]) {
        await page.getByRole("button", { name: floorName, exact: true }).click();
        const geometry = await page.evaluate(() => {
          const map = document.querySelector(".live-office-map").getBoundingClientRect();
          const employees = [...document.querySelectorAll(".scene-employee")].map((e) => ({ label: e.getAttribute("aria-label"), rect: e.getBoundingClientRect() }));
          const outside = employees.filter(({ rect: r }) => r.left < map.left - 2 || r.right > map.right + 2 || r.top < map.top - 2 || r.bottom > map.bottom + 2).map((e) => e.label);
          const overlaps = [];
          for (let i = 0; i < employees.length; i++) for (let j = i + 1; j < employees.length; j++) {
            const a = employees[i].rect, b = employees[j].rect;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 5) overlaps.push([employees[i].label, employees[j].label]);
          }
          const outsideRooms = [...document.querySelectorAll(".scene-room")].filter((e) => { const r = e.getBoundingClientRect(); return r.left < map.left - 2 || r.right > map.right + 2 || r.top < map.top - 2 || r.bottom > map.bottom + 2; }).length;
          return { outside, overlaps, outsideRooms };
        });
        assert.deepEqual(geometry, { outside: [], overlaps: [], outsideRooms: 0 }, `Room/employee geometry at ${width} ${floorName}`);
        }
      }
      if (name === "프로젝트") assert(await page.getByText("단계별 검증 협업", { exact: true }).count());
      if (name === "교육·지식") assert(await page.getByText("검증 교육", { exact: true }).count());
    }
  }
  assert.deepEqual(faults, []);
  console.log(JSON.stringify({ ok: true, employees: 100, viewports: [1440, 390], sections: sections.length, workflowTasks: (await state()).tasks.length, training: "active", faults }));
} finally {
  await browser?.close();
  server.kill();
  await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else { server.once("exit", resolve); setTimeout(resolve, 3000); } });
}
