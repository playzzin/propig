import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createServer } from "node:http";
import { connect } from "node:net";

// Synthetic, fixed-clock behavior checks. Never reads Office data or calls APIs.
const tools = createRequire(process.env.PROPIG_TOOLS_MANIFEST || "/home/hermes/.local/share/propig-tools/package.json");
const esbuild = tools("esbuild");
const root = path.resolve(import.meta.dirname, "../..");
const dir = path.join(root, "src/components/admin/hermes-office");
function load(name) {
  const result = esbuild.buildSync({ entryPoints: [path.join(dir, name)], bundle: true, write: false, platform: "node", format: "cjs" });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: tools, console });
  return module.exports;
}
let passed = 0;
function check(name, run) { run(); passed++; console.log(`PASS ${name}`); }
const now = Date.parse("2026-09-17T00:00:00.000Z");
const at = new Date(now - 1000).toISOString();
const future = new Date(now + 1000).toISOString();
const employee = { id: "fixture-employee", status: "active", hostId: "fixture-host" };
const task = { id: "fixture-task", employeeId: employee.id, status: "running", activity: "tool", updatedAt: at, telemetrySource: "hook" };
const state = { tasks: [task], hosts: [{ id: employee.hostId, lastSeen: at }], workflows: [], records: [], training: [] };
const { sceneActivity } = load("gameSceneState.ts");
check("game: explicit fresh work preserved", () => assert.equal(sceneActivity(state, employee, now).working, true));
check("game: missing telemetry must not imply work", () => {
  assert.equal(sceneActivity({ ...state, tasks: [{ ...task, telemetrySource: "" }] }, employee, now).working, false);
});
check("game: future timestamps cannot animate work", () => {
  assert.equal(sceneActivity({ ...state, tasks: [{ ...task, updatedAt: future }] }, employee, now).working, false);
});
check("game regressions: input wait, stale, inactive, meeting, training, result, ceremony", () => {
  const scene = (extra, person = employee) => sceneActivity({ ...state, ...extra }, person, now);
  assert.equal(scene({ tasks: [{ ...task, activity: "input_wait" }] }).label, "답변 대기");
  assert.equal(scene({ tasks: [{ ...task, updatedAt: "2000-01-01" }] }).working, false);
  assert.equal(scene({}, { ...employee, status: "inactive" }).label, "활동 중지");
  assert.equal(scene({ tasks: [{ ...task, workflowId: "meeting" }], workflows: [{ id: "meeting", kind: "meeting" }] }).kind, "meeting");
  assert.equal(scene({ tasks: [{ ...task, stage: "training" }] }).kind, "training");
  assert.equal(scene({ tasks: [{ ...task, status: "review", result: "fixture" }] }).result, true);
  assert.equal(scene({ tasks: [], records: [{ kind: "award", employeeId: employee.id, status: "verified", updatedAt: at }] }).ceremonial, true);
  for (const lastSeen of [future, "invalid", ""]) assert.equal(scene({ hosts: [{ id: employee.hostId, lastSeen }] }).working, false);
  assert.equal(scene({}, { ...employee, runtime: { status: "ready", lastSeen: at } }).working, true);
  assert.equal(scene({ tasks: [{ ...task, telemetrySource: "" }] }, { ...employee, runtime: { status: "ready", lastSeen: at } }).working, false);
});
check("observation helper exists independently of shared types", () => assert.ok(existsSync(path.join(dir, "dashboardEvidence.ts")), "missing truthful observation helper"));
const evidence = load("dashboardEvidence.ts");
const observation = { status: "success", observedAt: at, source: "fixture-only", evidenceRef: "fixture:1", validUntil: future, reasonCode: "fixture" };
check("observations: missing records default unknown, never failure", () => {
  for (const row of evidence.observationRows(employee, now)) {
    assert.equal(row.currentStatus, "unknown");
    assert.equal(row.label, "확인 필요");
  }
  assert.equal(evidence.observationRows(employee, now).length, 5);
});
check("observations: independent channel and historical status", () => {
  const rows = evidence.observationRows({ ...employee, observations: { modelCall: observation } }, now);
  assert.equal(rows.find(r => r.channel === "modelCall").currentStatus, "success");
  assert.equal(rows.find(r => r.channel === "telegramSend").currentStatus, "unknown");
  for (const update of [{ observedAt: null }, { observedAt: "bad" }, { observedAt: future }, { validUntil: null }, { validUntil: at }, { source: " " }, { evidenceRef: "" }]) {
    const result = evidence.assessObservation({ ...observation, ...update }, now);
    assert.equal(result.currentStatus, "unknown", JSON.stringify(update));
    assert.equal(result.historicalStatus, "success");
  }
});
check("observations: response refresh cannot renew facts", () => {
  const expired = { ...employee, observations: { gateway: { ...observation, validUntil: at } } };
  for (const generatedAt of [at, future]) assert.equal(evidence.observationRows({ ...expired, generatedAt }, now)[0].currentStatus, "unknown");
});
check("observations: TTL boundary/future/partial/unknown remain honest", () => {
  for (const update of [{ validUntil: new Date(now).toISOString() }, { status: "unknown" }, { reasonCode: "" }]) assert.equal(evidence.assessObservation({ ...observation, ...update }, now).currentStatus, "unknown");
  assert.equal(evidence.assessObservation({ status: "failure" }, now).historicalStatus, "failure");
  assert.equal(evidence.assessObservation({ ...observation, status: "failure" }, now).label, "중단 · 실패 관측");
});
check("delivery: six independent stages are exposed", () => assert.equal(typeof evidence.deliveryRows, "function"));
const delivery = { id: "fixture-evidence", stage: "test", status: "pass", observedAt: at, source: "fixture-only", evidenceRef: "fixture:log", scope: "합성 fixture 시험 (실상태 아님)", sourceRevision: "fixture-revision", attempt: 1, artifactRef: "fixture:artifact" };
check("delivery: legacy completed/text/revision never verify stages", () => {
  const rows = evidence.deliveryRows({ ...task, status: "completed", result: "all tests pass", revision: 123 }, now);
  assert.equal(rows.length, 6);
  assert.ok(rows.every(r => r.status === "unverified" && !r.verifiedCurrent && r.label === "근거 없음 · 미검증"));
});
check("delivery: current source must be independently known; attempt matters", () => {
  const input = { ...task, attempts: 1, deliveryEvidence: [delivery] };
  assert.equal(evidence.deliveryRows(input, now).find(r => r.stage === "test").verifiedCurrent, false);
  assert.equal(evidence.deliveryRows(input, now, "other").find(r => r.stage === "test").verifiedCurrent, false);
  const rows = evidence.deliveryRows(input, now, "fixture-revision");
  assert.equal(rows.find(r => r.stage === "test").verifiedCurrent, true);
  assert.equal(rows.filter(r => r.verifiedCurrent).length, 1);
  assert.equal(evidence.deliveryRows({ ...input, attempts: 2 }, now, "fixture-revision").find(r => r.stage === "test").verifiedCurrent, false);
  for (const update of [{ observedAt: null }, { observedAt: future }, { observedAt: "bad" }, { source: "" }, { evidenceRef: "" }, { sourceRevision: null }, { scope: "" }]) {
    assert.equal(evidence.deliveryRows({ ...input, deliveryEvidence: [{ ...delivery, ...update }] }, now, "fixture-revision").find(r => r.stage === "test").verifiedCurrent, false);
  }
});
check("delivery: latest failure supersedes pass, old attempt cannot mask current", () => {
  const input = { ...task, attempts: 1, deliveryEvidence: [delivery, { ...delivery, id: "later-fail", observedAt: new Date(now).toISOString(), status: "fail" }] };
  assert.equal(evidence.deliveryRows(input, now, "fixture-revision").find(r => r.stage === "test").status, "fail");
  input.deliveryEvidence.push({ ...delivery, id: "old-attempt", attempt: 0, observedAt: new Date(now).toISOString() });
  assert.equal(evidence.deliveryRows(input, now, "fixture-revision").find(r => r.stage === "test").status, "fail");
});
check("inbox: classification exports one source of truth", () => assert.equal(typeof evidence.attentionItems, "function"));
check("inbox: review/approval/input/failed/blocked/stale, dedup, no fabricated task", () => {
  const tasks = ["review", "approval", "failed", "blocked", "completed"].map(status => ({ ...task, id: status, status, updatedAt: at, nextAction: "다음 행동 텍스트" }));
  tasks.push({ ...task, id: "input", activity: "input_wait" }, { ...task, id: "stale", dependencyStale: true });
  const items = evidence.attentionItems([...tasks, tasks[0]], now);
  assert.equal(items.length, 7);
  assert.equal(new Set(items.map(i => i.task.id)).size, 7);
  assert.equal(items.find(i => i.task.id === "completed").priority, "hint");
  assert.equal(items.find(i => i.task.id === "review").nextAction, "다음 행동 텍스트");
  assert.equal(evidence.attentionItems([task], now).length, 0);
  assert.equal(evidence.waitingLabel(future, now), "대기 시간 미확인");
  assert.equal(evidence.waitingLabel("invalid", now), "대기 시간 미확인");
  assert.equal(evidence.waitingLabel(at, now), "1분 미만 경과");
});
check("taskDisplay regression: completed clarify is not pending; single attention owner", () => {
  const display = load("taskDisplay.ts");
  assert.equal(display.awaitingReply({ ...task, status: "completed", activity: "input_wait" }), false);
  assert.equal(display.taskDisplayStatus({ ...task, activity: "input_wait" }), "waiting_reply");
  assert.equal(display.needsAttention({ ...task, status: "review" }), true);
  assert.equal(display.needsAttention({ ...task, dependencyStale: true }), true);
  assert.equal(display.needsAttention({ ...task, status: "completed" }), false);
});
console.log(`PASS ${passed} synthetic behavior checks; no live certification`);

const workObservation = { ...observation, status: "running", source: task.telemetrySource, evidenceRef: task.id };
const invalidWork = [
  { status: "unknown" }, { status: "idle" }, { status: "success" }, { status: "failure" },
  { observedAt: null }, { observedAt: "invalid" }, { observedAt: future },
  { validUntil: null }, { validUntil: at }, { validUntil: new Date(now).toISOString() },
  { source: null }, { source: "worker" }, { evidenceRef: null }, { evidenceRef: "other-task" }, { reasonCode: "" },
];
check("F1: explicit invalid work overrides fresh legacy telemetry", () => {
  for (const update of invalidWork) {
    const person = { ...employee, observations: { work: { ...workObservation, ...update } } };
    const result = sceneActivity(state, person, now);
    assert.equal(result.working, false, JSON.stringify(update));
    assert.equal(result.label, "실행 확인 중");
  }
});
check("F1: matching running sources and legacy absence stay positive", () => {
  for (const source of ["hook", "observer", "worker"]) {
    const person = { ...employee, observations: { work: { ...workObservation, source } } };
    assert.equal(sceneActivity({ ...state, tasks: [{ ...task, telemetrySource: source }] }, person, now).working, true);
  }
  for (const observations of [undefined, {}, { modelCall: observation }]) {
    assert.equal(sceneActivity(state, { ...employee, observations }, now).working, true);
  }
});

if (process.argv.includes("--ui")) {
  // Focused OfficeApp component fixture, not build.mjs/Next/production build.
  // Shared client deliberately mocked until its exclusive writer hands off.
  const appRequire = createRequire(process.env.PROPIG_APP_MANIFEST || "/mnt/c/Users/playz/propig/package.json");
  const { chromium } = tools("playwright-core");
  const out = process.env.DASHBOARD_QA_OUT || path.resolve(root, `evidence/ui-${process.pid}`);
  assert.equal(existsSync(out), false, "never overwrite prior UI evidence");
  mkdirSync(out, { recursive: true });
  const fullEmployee = { ...employee, revision: 1, botId: "fixture", name: "합성 시험 직원", username: "fixture", avatar: "", character: "robot", color: "#287d70", departmentId: "", title: "시험 담당", managerId: "", profile: "fixture", model: "합성 모델 · 실호출 아님", seat: 0, lastSeen: at, createdAt: at, capabilities: [], instructions: [] };
  const fullTask = { ...task, title: "합성 검토 업무", request: "합성 행동시험", projectId: "", criteria: "fixture 확인", summary: "시험용 기록", nextAction: "근거를 검토하세요", result: "합성 결과", dependencies: [], participants: [], createdAt: at, dueAt: "", revision: 1, source: "fixture", attempts: 1, status: "review" };
  const fixture = { revision: 1, generatedAt: new Date(now).toISOString(), employees: [fullEmployee], hosts: [{ id: employee.hostId, name: "합성 호스트", lastSeen: at, status: "online" }], tasks: [fullTask, { ...fullTask, id: "legacy-completed", title: "합성 기존 완료", status: "completed" }], departments: [], projects: [], workflows: [], training: [], rooms: [], events: [], records: [], settings: { companyName: "합성 fixture · 실상태 아님", dispatchPaused: true, autoDiscover: false, discoveryIntervalMinutes: 10, dailyRunLimit: 0, taskTimeoutMinutes: 20, maxConcurrent: 1, maxEmployees: 100 } };
  const bundle = await esbuild.build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import OfficeApp from './OfficeApp'; createRoot(document.getElementById('root')).render(<OfficeApp/>);`, loader: "tsx", resolveDir: dir },
    bundle: true, write: false, outfile: "fixture.js", format: "iife", platform: "browser", jsx: "automatic",
    plugins: [{ name: "isolated-fixture", setup(build) {
      build.onResolve({ filter: /^\.\/client$/ }, () => ({ path: "client", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `import {useState} from 'react'; export function useOffice(){ const [state,setState]=useState(window.fixture); window.fixtureUpdate=setState; return {state,connected:true,error:'',busy:false,act:async action=>{window.fixtureActions.push(action);return false;},refresh:async()=>{}};} export async function discover(){throw new Error('fixture does not discover');}`, resolveDir: dir }));
      build.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: tools.resolve(args.path) }));
      build.onResolve({ filter: /^(lucide-react|zod)$/ }, args => ({ path: appRequire.resolve(args.path) }));
    } }],
  });
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/") { response.writeHead(405); response.end(); return; }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end('<!doctype html><html lang="ko"><head><title>합성 UI 시험</title></head><body><div id="root"></div></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  let browser;
  const faults = [];
  try {
    assert(![3010, 3002, 3000].includes(port), "reserved ports forbidden");
    console.log(`owned synthetic loopback PID=${process.pid} port=${port}`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    // Only this owned loopback fixture is reachable; client remains an explicit mock.
    await context.route("**/*", route => route.request().url() === `${origin}/` ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on("pageerror", error => faults.push(error.message));
    page.on("console", message => { if (message.type() === "error") faults.push(message.text()); });
    await page.clock.install({ time: new Date(now) });
    await page.goto(origin);
    await page.evaluate(value => { window.fixture = value; window.fixtureActions = []; }, fixture);
    for (const output of bundle.outputFiles) {
      if (output.path.endsWith(".css")) await page.addStyleTag({ content: output.text });
      else await page.addScriptTag({ content: output.text });
    }
    await page.getByRole("heading", { name: "사무실", exact: true }).waitFor();
    assert.equal(await page.locator("[data-dashboard-observations]").count(), 1, "truthful channel panel must render");
    assert.equal(await page.locator("[data-observation-channel]").count(), 5);
    assert.equal(await page.locator('[data-current-status="unknown"]').count(), 5);
    const updateFixture = async value => {
      await page.evaluate(value => window.fixtureUpdate(value), value);
      await page.locator('.game-actor').getByText(value.employees[0].name, { exact: true }).waitFor();
    };
    let sequence = 0;
    for (const update of [...invalidWork, null, undefined]) {
      const value = structuredClone(fixture);
      value.tasks = [{ ...fullTask, status: "running" }];
      value.employees[0].name = `합성 음성군 ${sequence++}`;
      value.employees[0].observations = { work: update == null ? update : { ...workObservation, ...update } };
      await updateFixture(value);
      assert.equal(await page.locator('.game-actor.executing, .game-character.is-working, .game-typing').count(), 0, JSON.stringify(update));
      assert.match(await page.locator('.game-actor').getAttribute('aria-label'), /실행 확인 중/);
    }
    for (const source of ["hook", "observer", "worker", undefined]) {
      const value = structuredClone(fixture);
      value.tasks = [{ ...fullTask, status: "running", telemetrySource: source || "hook" }];
      value.employees[0].name = `합성 양성군 ${sequence++}`;
      if (source) value.employees[0].observations = { work: { ...workObservation, source } };
      await updateFixture(value);
      for (const selector of ['.game-actor.executing', '.game-character.is-working', '.game-typing']) assert.equal(await page.locator(selector).count(), 1);
    }
    console.log("PASS F1 actual actor: invalid work has no executing/working/typing; matching sources and legacy preserved");
    const longFixture = structuredClone(fixture);
    longFixture.employees[0].name = "합성 긴 다음 행동";
    const longAction = "현재 업무의 관측 근거와 담당자 확인 내용을 끝까지 읽고 다음 검토 단계에 필요한 자료를 정리해 주세요. ".repeat(12).trim();
    longFixture.tasks[0].nextAction = longAction;
    await page.setViewportSize({ width: 390, height: 844 });
    await updateFixture(longFixture);
    const next = page.locator('.dashboard-attention-row p').filter({ hasText: /^다음 행동:/ }).first();
    assert.equal((await next.textContent()).trim(), `다음 행동: ${longAction}`);
    const dimensions = await next.evaluate(p => ({ client: p.clientHeight, scroll: p.scrollHeight, clamp: getComputedStyle(p).webkitLineClamp, overflow: getComputedStyle(p).overflow }));
    console.log("F2 actual", JSON.stringify(dimensions));
    await page.screenshot({ path: path.join(out, "long-next-action-390.png"), fullPage: true });
    assert(dimensions.client >= dimensions.scroll, "390px nextAction must be fully readable");
    assert.equal(dimensions.clamp, "none");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "long nextAction no horizontal overflow");
    await updateFixture(fixture);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByText("합성 검토 업무", { exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    assert.equal(await dialog.locator("[data-delivery-stage]").count(), 6);
    assert.equal(await dialog.getByText("근거 없음 · 미검증", { exact: true }).count(), 6);
    assert.equal(await dialog.getByText("현행 검증 완료", { exact: true }).count(), 0);
    assert(await dialog.locator('[name=status] option[value="approval"]').count());
    await page.keyboard.press("Escape");
    await page.getByText("합성 기존 완료", { exact: true }).first().click();
    assert.equal(await dialog.locator('[name=status]').inputValue(), "completed");
    assert.equal(await dialog.getByText("근거 없음 · 미검증", { exact: true }).count(), 6);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "관람 모드", exact: true }).click();
    await page.getByRole("button", { name: /^확인할 업무/ }).click();
    // The product focuses in requestAnimationFrame; advance the installed clock
    // through that frame before retaining the original focus assertion.
    await page.clock.runFor(20);
    assert.equal(await page.evaluate(() => document.activeElement.id), "office-inbox");
    await page.getByRole("button", { name: "지도 확대", exact: true }).click();
    await page.getByRole("button", { name: "전체 보기", exact: true }).click();
    await page.screenshot({ path: path.join(out, "dashboard-1440.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "390px no document overflow");
    await page.screenshot({ path: path.join(out, "dashboard-390.png"), fullPage: true });
    assert.deepEqual(await page.evaluate(() => window.fixtureActions), [], "display and navigation issue zero actions");
    await page.getByText("합성 검토 업무", { exact: true }).first().click();
    await dialog.locator('[name=qualityScore]').fill("80");
    await dialog.locator('[name=reviewNote]').fill("합성 검토 기록");
    await dialog.getByRole("button", { name: "검토 결과 저장", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fixtureActions), [{ type: "task.review", id: "fixture-task", revision: 1, qualityScore: 80, reviewNote: "합성 검토 기록", accepted: true }]);
    await page.keyboard.press("Escape");
    const structured = structuredClone(fixture);
    structured.tasks[0].deliveryEvidence = [delivery];
    structured.employees[0].observations = { modelCall: { ...observation, validUntil: new Date(now + 60000).toISOString() }, telegramSend: { ...observation, status: "failure", validUntil: at } };
    await page.evaluate(value => window.fixtureUpdate(value), structured);
    await page.locator('[data-dashboard-observations] summary').first().click();
    await page.locator('[data-observation-channel="modelCall"] strong').getByText("완료 · 성공 관측", { exact: true }).waitFor();
    assert.equal(await page.locator('[data-observation-channel="telegramSend"]').getAttribute("data-current-status"), "unknown");
    await page.screenshot({ path: path.join(out, "observations-390.png"), fullPage: true });
    await page.getByText("합성 검토 업무", { exact: true }).first().click();
    await dialog.locator('[data-delivery-stage="test"] summary').click();
    await dialog.getByText(delivery.scope, { exact: true }).waitFor();
    assert.equal(await dialog.getByText("현행 검증 완료", { exact: true }).count(), 0);
    assert.equal(await dialog.locator('[data-delivery-stage="test"] dd').first().innerText(), "통과 기록", "record status is understandable Korean");

    await page.screenshot({ path: path.join(out, "delivery-390.png"), fullPage: true });
    await page.addScriptTag({ content: tools("axe-core").source });
    const a11y = await page.evaluate(async () => (await window.axe.run(document.querySelector('.dashboard-delivery'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    assert.deepEqual(a11y, [], "delivery accessibility");
    await page.keyboard.press("Escape");
    const observationA11y = await page.evaluate(async () => (await window.axe.run(document.querySelector('[data-dashboard-observations]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    assert.deepEqual(observationA11y, [], "observations accessibility");
    await page.clock.fastForward(70000);
    assert.equal(await page.locator('[data-observation-channel="modelCall"]').getAttribute("data-current-status"), "unknown", "freshness expires without a fetch");
    structured.generatedAt = new Date(now + 70000).toISOString();
    await page.evaluate(value => window.fixtureUpdate(value), structured);
    assert.equal(await page.locator('[data-observation-channel="modelCall"]').getAttribute("data-current-status"), "unknown");
    const many = structuredClone(fixture);
    many.employees = Array.from({ length: 100 }, (_, index) => ({ ...fullEmployee, id: `staff-${index}`, name: `합성 직원 ${index + 1}`, seat: index }));
    await page.evaluate(value => window.fixtureUpdate(value), many);
    await page.getByRole("button", { name: "4F", exact: true }).click();
    assert.equal(await page.locator('.scene-employee').count(), 25);
    assert((await page.locator('[data-dashboard-observations]').boundingBox()).height < 600, "100 staff observation panel must not bury game/inbox");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "100 staff no overflow");
    await page.screenshot({ path: path.join(out, "100-staff-390.png"), fullPage: true });
    for (const width of [768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px no overflow`);
    }
    const empty = { ...fixture, employees: [], tasks: [], hosts: [] };
    await page.evaluate(value => window.fixtureUpdate(value), empty);
    await page.getByText("표시할 직원이 없습니다. 서비스 성공·실패를 추정하지 않습니다.", { exact: true }).waitFor();
    assert.equal(await page.locator('.dashboard-attention-row').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.fixtureActions), [{ type: "task.review", id: "fixture-task", revision: 1, qualityScore: 80, reviewNote: "합성 검토 기록", accepted: true }], "no automatic action on refresh/expiry");
    assert.deepEqual(faults, []);
    writeFileSync(path.join(out, "verification.json"), JSON.stringify({ synthetic: true, sharedClientMocked: true, liveVerified: false, viewports: [390, 768, 1440, 1920], observationA11y, deliveryA11y: a11y, faults, passed: true, ownedLoopback: { pid: process.pid, port }, f2: dimensions, automaticActions: 0, mockReviewActions: 1 }, null, 2), { flag: "wx" });
    console.log("PASS synthetic OfficeApp browser: five channels, six stages, legacy completion, review action captured only in mock, freshness expiry/refresh, 100 staff/four floors, inbox navigation, game zoom, 390px, delivery axe, zero automatic actions/page errors");
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); reject(new Error("owned server still reachable")); });
      socket.once("error", error => error.code === "ECONNREFUSED" ? resolve() : reject(error));
    });
    console.log(`owned loopback closed PID=${process.pid} port=${port}; reconnect ECONNREFUSED; browser closed`);
  }
}
