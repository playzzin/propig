import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import axe from "axe-core";

// All activity is synthetic. The temporary server cannot dispatch provider work.
const data = await mkdtemp(path.join(os.tmpdir(), "office-game-"));
const out = path.resolve("output/hermes-office-qa/game");
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
const faults = [];
const checks = [];
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
  });
  const key = (await readFile(path.join(data, "connector.key"), "utf8")).trim();
  const ingest = async (body) => {
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
  await ingest({
    type: "inventory",
    eventId: "game-roster",
    hostId: "game",
    at: new Date().toISOString(),
    employees: Array.from({ length: 8 }, (_, i) => ({
      botId: String(i + 1),
      name: `게임 검증 직원 ${i + 1}`,
      profile: `game-${i}`,
      model: "합성 모델",
      capabilities: [],
      instructions: [],
    })),
  });
  for (const id of [2, 3, 7])
    await ingest({
      type: "agent:start",
      eventId: `start-${id}`,
      hostId: "game",
      botId: String(id),
      runId: `game-${id}`,
      title: "게임 동작 검증",
      at: new Date().toISOString(),
      telemetrySource: "hook",
    });
  let current = await (await fetch(`${base}/api/state`)).json();
  assert.equal(current.settings.dispatchPaused, true);
  const employee = (i) => current.employees[i - 1];
  employee(1).color = "#b77657";
  const task = (i) =>
    current.tasks.find((t) => t.employeeId === employee(i).id);
  task(3).stage = "input_wait";
  task(3).activity = "input_wait";
  employee(8).status = "inactive";
  current.records.push({
    id: "game-award",
    kind: "award",
    title: "검증용 포상",
    employeeId: employee(5).id,
    taskId: "",
    content: "합성 축하 기록",
    status: "verified",
    evidence: "테스트",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 1,
  });
  current.workflows.push({
    id: "game-meeting",
    name: "합성 회의",
    goal: "화면 이동 검증",
    kind: "meeting",
    status: "running",
    projectId: "",
    createdAt: new Date().toISOString(),
    revision: 1,
    steps: [],
  });
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
    bypassCSP: true,
  });
  // Dispatch revision signals deterministically; actual SSE transport is covered by phase2-check.
  await context.addInitScript(() => {
    window.EventSource = class extends EventTarget {
      constructor() {
        super();
        window.__officeRevision = () =>
          this.dispatchEvent(new Event("revision"));
      }
      close() {}
    };
  });
  await context.route("**/api/state", (route) => {
    const state = structuredClone(current);
    // The UI clock is captured before this response. Keep synthetic observations
    // behind that clock and refresh the work evidence together with its task.
    const observed = Date.now() - 2000;
    const now = new Date(observed).toISOString();
    state.generatedAt = new Date().toISOString();
    state.hosts.forEach((h) => {
      h.lastSeen = now;
    });
    state.tasks.forEach((t) => {
      t.updatedAt =
        t.employeeId === employee(7).id ? "2000-01-01T00:00:00Z" : now;
      const person = state.employees.find((e) => e.id === t.employeeId);
      person.observations.work = {
        status: t.status === "running" ? "running" : "idle",
        observedAt: t.updatedAt,
        validUntil: new Date(Date.parse(t.updatedAt) + 60000).toISOString(),
        source: t.telemetrySource,
        evidenceRef: t.id,
        reasonCode: "task_lifecycle",
      };
    });
    state.records.forEach((r) => {
      r.updatedAt = now;
    });
    return route.fulfill({ json: state });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => faults.push(e.message));
  const actor = (i) =>
    page.getByRole("button", { name: new RegExp(`^게임 검증 직원 ${i},`) });
  const refresh = async () => {
    current.revision++;
    await page.evaluate(() => window.__officeRevision());
  };
  const animation = (i) =>
    actor(i)
      .locator(".figure-arm.left")
      .evaluate((el) => getComputedStyle(el).animationName);
  const point = (i) => actor(i).evaluate((el) => ({
    x: Number(el.dataset.pointX),
    y: Number(el.dataset.pointY),
  }));
  const waitForMotion = async (i, phase, destination) => {
    try {
      await page.waitForFunction(
        ({ index, expectedPhase, expectedDestination }) => {
          const el = document.querySelector(`[aria-label^="게임 검증 직원 ${index},"]`);
          return el?.dataset.phase === expectedPhase &&
            el.dataset.destination === expectedDestination &&
            el.dataset.moving === String(expectedPhase === "walking");
        },
        { index: i, expectedPhase: phase, expectedDestination: destination },
      );
    } catch (cause) {
      const actual = await actor(i).evaluate((el) => ({
        phase: el.dataset.phase, destination: el.dataset.destination,
        pointX: el.dataset.pointX, pointY: el.dataset.pointY,
        typing: el.dataset.typing, label: el.getAttribute("aria-label"),
      }));
      throw new Error(`Synthetic actor ${i} expected ${phase}/${destination}: ${JSON.stringify(actual)}`, { cause });
    }
  };
  await page.goto(base);
  await actor(1).waitFor();
  assert.equal(
    await actor(1)
      .locator(".figure-body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(183, 118, 87)",
    "saved employee costume color is preserved",
  );
  await actor(2).locator(".is-working").waitFor();
  await waitForMotion(2, "stationary", "desk");
  const originalDesk = await point(2);
  assert.equal(await actor(2).locator(".is-working").count(), 1);
  assert.equal(await animation(2), "game-type-left");
  for (const i of [1, 3, 5, 7, 8])
    assert.equal(
      await actor(i).locator(".is-working").count(),
      0,
      `employee ${i} must not type`,
    );
  assert.equal(
    await actor(3).locator(".scene-status").innerText(),
    "답변 대기",
  );
  assert.equal(
    await actor(7).locator(".scene-status").innerText(),
    "확인 필요 · 실행 확인 중",
  );
  assert.equal(
    await actor(8).locator(".scene-status").innerText(),
    "활동 중지",
  );
  const awardDesk = await point(5);
  await waitForMotion(5, "hold", "awards");
  assert.match(await actor(5).getAttribute("aria-label"), /안전 경로 없음 · 현재 위치 유지/);
  await page.waitForTimeout(150);
  assert.deepEqual(await point(5), awardDesk, "an unsafe default layout preserves the actor's position");
  assert.equal(await actor(5).evaluate((el) => el.classList.contains("in-room")), false);
  checks.push("Unsafe default room paths hold position and expose the reason without claiming arrival");

  // Deliberately spacious synthetic rooms test travel independently of the
  // default layout's narrow passages; this is only a mocked response.
  current.rooms = ["meeting", "training", "awards"].map((kind, index) => ({
    ...current.rooms.find((room) => room.kind === kind && room.floor === 0),
    x: 2 + index * 33, y: 72, width: 28, height: 20,
  }));
  await refresh();
  await waitForMotion(5, "stationary", "awards");
  assert(
    await actor(5).evaluate((el) => el.classList.contains("in-room")),
    "the spacious synthetic award room has a reachable reserved place",
  );
  assert.match(await actor(5).locator(".scene-status").innerText(), /연출/);
  const overlaps = await page.locator(".game-nameplate").evaluateAll((plates) =>
    plates.some((plate) => {
      const a = plate.getBoundingClientRect();
      return [...document.querySelectorAll(".game-actor .scene-status")]
        .filter((s) => s.parentElement !== plate.parentElement)
        .some((s) => {
          const b = s.getBoundingClientRect();
          return (
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top
          );
        });
    }),
  );
  assert.equal(overlaps, false, "nameplates do not cover the next row status");
  checks.push(
    "Only fresh active work types; idle, input-wait, stale, inactive and ceremony remain distinct",
  );
  employee(8).status = "active";
  employee(8).hostId = "offline-test-host";
  await refresh();
  await actor(8)
    .locator(".scene-status")
    .getByText("관측 확인 필요 · 마지막 기록", { exact: true })
    .waitFor();
  await page.addScriptTag({ content: axe.source });
  const a11y = await page.evaluate(async () =>
    (
      await window.axe.run(document.querySelector(".game-world"), {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      })
    ).violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  );
  assert.deepEqual(
    a11y,
    [],
    "game states including offline initials meet automated accessibility checks",
  );
  checks.push(
    "Game accessibility passes with offline, initials-only profiles and all visible states",
  );
  await page
    .locator(".game-world")
    .screenshot({ path: path.join(out, "office-8.png") });

  const viewport = page.locator(".game-viewport");
  const mapWidth = () =>
    page
      .locator(".game-map")
      .evaluate((el) => el.getBoundingClientRect().width);
  const before = await mapWidth();
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  assert((await mapWidth()) > before);
  await page.getByRole("button", { name: "지도 축소", exact: true }).click();
  assert((await mapWidth()) < before + 2);
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  assert(
    await viewport.evaluate(
      (el) =>
        el.scrollWidth <= el.clientWidth + 1 &&
        el.scrollHeight <= el.clientHeight + 1,
    ),
  );
  await page
    .getByRole("button", { name: "지도 기본 크기", exact: true })
    .click();
  checks.push(
    "Zoom in/out, reset and fit operate on the world without document overflow",
  );

  // A real status transition changes the destination; the original desk stays put.
  task(2).workflowId = "game-meeting";
  await refresh();
  await actor(2)
    .locator(".scene-status")
    .getByText("회의 의견 작성", { exact: true })
    .waitFor();
  await waitForMotion(2, "walking", "meeting");
  assert.equal(await actor(2).locator(".is-working").count(), 0, "walking is not a working pose");
  assert.equal(await page.locator(".game-station").count(), 10);
  assert.equal(await page.locator(".game-desk-art.is-active").count(), 0);
  await waitForMotion(2, "stationary", "meeting");
  assert.equal(await actor(2).locator(".is-working").count(), 1, "working pose starts after arrival");
  assert.equal(await animation(2), "game-type-left");
  assert(await actor(2).evaluate((el) => el.classList.contains("in-room")));
  const roomInside = await actor(2).evaluate((el) => {
    const x = Number(el.dataset.pointX), y = Number(el.dataset.pointY);
    const room = document
      .querySelector(".game-room.room-meeting");
    // Movement uses a world-local foot circle; the label container is decorative.
    const radius = 14;
    return (
      x - radius >= room.offsetLeft &&
      x + radius <= room.offsetLeft + room.offsetWidth &&
      y - radius >= room.offsetTop &&
      y + radius <= room.offsetTop + room.offsetHeight
    );
  });
  assert(roomInside, "arrived meeting actor's foot circle fits its room");
  assert.notDeepEqual(await point(2), originalDesk, "arrival moved the actor away from its desk");
  checks.push(
    "Meeting transition walks to an actual room, leaves its desk, and fits the room",
  );

  task(2).workflowId = "";
  task(2).stage = "training";
  await refresh();
  await actor(2)
    .locator(".scene-status")
    .getByText("교육 업무 중", { exact: true })
    .waitFor();
  await waitForMotion(2, "walking", "training");
  await page
    .getByRole("button", { name: "애니메이션 끄기", exact: true })
    .click();
  await waitForMotion(2, "paused", "training");
  const pausedPoint = await point(2);
  await page.waitForTimeout(150);
  assert.deepEqual(await point(2), pausedPoint, "motion off preserves the current point without teleporting");
  assert.equal(await animation(2), "none");
  assert.equal(await page.locator('[data-moving="true"]').count(), 0);
  assert.equal(
    await actor(2).evaluate(
      (el) =>
        el.getAnimations().filter((a) => a.playState === "running").length,
    ),
    0,
  );
  await page.reload();
  await page
    .getByRole("button", { name: "애니메이션 켜기", exact: true })
    .waitFor();
  assert.equal(await animation(2), "none");
  await page
    .getByRole("button", { name: "애니메이션 켜기", exact: true })
    .click();
  await waitForMotion(2, "walking", "training");
  assert.equal(await actor(2).locator(".is-working").count(), 0, "resuming motion does not pose before arrival");
  await waitForMotion(2, "stationary", "training");
  assert.equal(await actor(2).locator(".is-working").count(), 1);
  assert.equal(await animation(2), "game-type-left");
  checks.push(
    "Motion off cancels walking and CSS motion; preference survives reload and resumes",
  );

  task(2).status = "review";
  task(2).result = "합성 완료 결과";
  task(2).finishedAt = new Date().toISOString();
  await refresh();
  await actor(2)
    .locator(".scene-status")
    .getByText("검토 대기", { exact: true })
    .waitFor();
  await waitForMotion(2, "stationary", "review");
  assert.equal(await actor(2).locator(".is-working").count(), 0);
  assert(!(await actor(2).evaluate((el) => el.classList.contains("in-room"))));
  assert.deepEqual(await point(2), originalDesk, "missing review room falls back to the original desk");
  checks.push(
    "Review-pending work returns to its desk when no review room exists, without typing or claiming completion",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "동작 줄이기 적용 중", exact: true })
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "동작 줄이기 적용 중", exact: true })
      .isDisabled(),
  );
  assert.equal(
    await page
      .locator(".game-world")
      .evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      ),
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  assert(await viewport.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page
    .locator(".game-world")
    .screenshot({ path: path.join(out, "office-fit-390.png") });
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  assert(await viewport.evaluate((el) => el.scrollWidth > el.clientWidth + 1));
  checks.push(
    "System reduced-motion disables all game animation; mobile overview and scroll work",
  );
  assert.deepEqual(faults, []);
  await writeFile(
    path.join(out, "verification.json"),
    JSON.stringify(
      { ok: true, synthetic: true, paidCalls: 0, checks, faults },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${checks.length} game scenarios; motion, destinations, truthfulness, zoom and mobile; zero paid calls`,
  );
} finally {
  await browser?.close();
  server.kill();
}
