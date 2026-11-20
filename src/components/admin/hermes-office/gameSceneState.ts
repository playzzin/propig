import type { Employee, OfficeRoom, Snapshot } from "./types";
import { awaitingReply } from "./taskDisplay";
import { assessObservation, type EmployeeEvidenceInput } from "./dashboardEvidence";

// Presentation windows are not gateway/model/Telegram health checks.
function freshTime(value: string, now: number, windowMs: number): boolean {
  const age = now - Date.parse(value);
  return Number.isFinite(age) && age >= 0 && age < windowMs;
}

export interface SceneActivity {
  working: boolean;
  waiting: boolean;
  unavailable: boolean;
  result: boolean;
  ceremonial: boolean;
  kind: OfficeRoom["kind"];
  label: string;
}

export function sceneActivity(
  state: Snapshot,
  employee: Employee & EmployeeEvidenceInput,
  now: number,
): SceneActivity {
  const task = state.tasks.find(
    (t) => t.employeeId === employee.id && t.status === "running",
  );
  const host = state.hosts.find((h) => h.id === employee.hostId);
  const ready =
    employee.runtime?.status === "ready" &&
    freshTime(employee.runtime.lastSeen, now, 45000);
  const observed = !!host && freshTime(host.lastSeen, now, 45000);
  const unavailable = employee.status !== "active" || (!ready && !observed);
  const waiting = awaitingReply(task) && !unavailable;
  const work = employee.observations?.work;
  // Only a missing channel retains legacy presentation. Explicit unknown or
  // invalid evidence must not be promoted by fresh task/host timestamps.
  const workConfirmed = !Object.prototype.hasOwnProperty.call(employee.observations || {}, "work") ||
    (assessObservation(work, now).currentStatus === "running" &&
      work?.source === task?.telemetrySource && work?.evidenceRef === task?.id);
  const working = Boolean(
    task &&
    workConfirmed &&
    !waiting &&
    !unavailable &&
    freshTime(task.updatedAt, now, 60000) &&
    ["hook", "observer", "worker"].includes(task.telemetrySource || ""),
  );
  const result =
    !task &&
    state.tasks.some(
      (t) =>
        t.employeeId === employee.id &&
        ["review", "approval"].includes(t.status) &&
        !!t.result &&
        freshTime(t.finishedAt || t.updatedAt, now, 45000),
    );
  let kind: OfficeRoom["kind"] = "work";
  let label =
    employee.status !== "active"
      ? "활동 중지"
      : unavailable
        ? "연결 끊김"
        : waiting
          ? "답변 대기"
          : working
            ? "작업 중"
            : task
              ? "실행 확인 중"
              : result
                ? "결과 도착"
                : "대기";
  let ceremonial = false;
  if (
    working &&
    state.workflows.some(
      (w) => w.id === task?.workflowId && w.kind === "meeting",
    )
  ) {
    kind = "meeting";
    label = "회의 의견 작성";
  } else if (working && ["training", "education"].includes(task?.stage || "")) {
    kind = "training";
    label = "교육 업무 중";
  } else if (!task && !unavailable) {
    if (
      state.records.some(
        (r) =>
          r.kind === "award" &&
          r.employeeId === employee.id &&
          ["verified", "completed"].includes(r.status) &&
          freshTime(r.updatedAt, now, 30000),
      )
    ) {
      kind = "awards";
      label = "포상 기록 · 축하 연출";
      ceremonial = true;
    } else if (
      state.training.some(
        (t) =>
          t.employeeId === employee.id &&
          t.status === "active" &&
          freshTime(t.createdAt, now, 30000),
      )
    ) {
      kind = "training";
      label = "교육 적용 · 안내 연출";
      ceremonial = true;
    }
  }
  return { working, waiting, unavailable, result, ceremonial, kind, label };
}
