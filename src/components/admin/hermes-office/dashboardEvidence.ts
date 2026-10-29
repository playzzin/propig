import type { Task } from "./types";

// Local structural inputs mirror contract.md while shared types/client have another
// writer. No API parser, collector, mutation, or compatibility-silencing cast here.
export type ObservationStatus = "unknown" | "success" | "failure" | "running" | "idle";
export type ObservationChannel = "gateway" | "modelCall" | "telegramReceive" | "telegramSend" | "work";
export interface ObservationInput {
  status: ObservationStatus;
  observedAt: string | null;
  source: string | null;
  evidenceRef: string | null;
  validUntil: string | null;
  reasonCode: string;
}
export interface EmployeeEvidenceInput {
  id: string;
  observations?: Partial<Record<ObservationChannel, ObservationInput>>;
}
export const observationLabels: Record<ObservationStatus, string> = {
  unknown: "확인 필요", success: "완료 · 성공 관측", failure: "중단 · 실패 관측",
  running: "진행 중", idle: "대기",
};
const channels: { channel: ObservationChannel; title: string }[] = [
  { channel: "gateway", title: "게이트웨이" },
  { channel: "modelCall", title: "모델 호출" },
  { channel: "telegramReceive", title: "Telegram 수신" },
  { channel: "telegramSend", title: "Telegram 발신" },
  { channel: "work", title: "업무 활동" },
];
const present = (value: string | null | undefined): boolean => Boolean(value?.trim());
export function assessObservation(value: Partial<ObservationInput> | undefined, now: number) {
  const historicalStatus = value?.status || "unknown";
  const observed = Date.parse(value?.observedAt || "");
  const until = Date.parse(value?.validUntil || "");
  // The parser's missing-reason default is not evidence of a current observation.
  const reason = !value || historicalStatus === "unknown" ? "관측 근거 없음"
    : !present(value.source) || !present(value.evidenceRef) || !present(value.reasonCode) || value.reasonCode === "evidence_missing" ? "출처·근거 확인 필요"
    : !Number.isFinite(now) || !Number.isFinite(observed) || !Number.isFinite(until) ? "관측 시각·유효기한 확인 필요"
    : observed > now ? "미래 관측 시각 확인 필요"
    : until <= now || until < observed ? "유효기한 경과 · 재확인 필요" : "유효한 관측 근거";
  const currentStatus: ObservationStatus = reason === "유효한 관측 근거" ? historicalStatus : "unknown";
  return { currentStatus, historicalStatus, label: observationLabels[currentStatus], reason, evidence: value };
}
export function observationRows(employee: EmployeeEvidenceInput, now: number) {
  return channels.map(({ channel, title }) => ({ channel, title, ...assessObservation(employee.observations?.[channel], now) }));
}

export type DeliveryStage = "implementation" | "typecheck" | "test" | "ui" | "source-integration" | "deployment";
export interface DeliveryEvidenceInput {
  id: string;
  stage: DeliveryStage;
  status: "unverified" | "pass" | "fail" | "blocked";
  observedAt: string | null;
  source: string | null;
  evidenceRef: string | null;
  scope: string;
  sourceRevision: string | null;
  attempt: number;
  artifactRef: string | null;
}
export type TaskEvidenceInput = Task & { deliveryEvidence?: DeliveryEvidenceInput[] };
const stages: { stage: DeliveryStage; title: string }[] = [
  { stage: "implementation", title: "구현" }, { stage: "typecheck", title: "타입 검사" },
  { stage: "test", title: "시험" }, { stage: "ui", title: "화면 확인" },
  { stage: "source-integration", title: "원본 반영" }, { stage: "deployment", title: "배포" },
];
const deliveryLabels = { unverified: "미검증", pass: "통과 기록", fail: "실패 기록", blocked: "중단 기록" };

// Caller must supply an independently verified source revision, never task.revision.
// First-bundle UI deliberately omits it: no live source-revision collector exists.
export function deliveryRows(task: TaskEvidenceInput, now: number, currentSourceRevision?: string) {
  return stages.map(({ stage, title }) => {
    const history = (task.deliveryEvidence || []).filter(e => e.stage === stage);
    const matching = history.filter(e => e.attempt === task.attempts);
    const candidates = matching.length ? matching : history;
    const evidence = [...candidates].sort((a, b) => {
      // Invalid dates must not silently disappear behind an older green result.
      const aTime = Date.parse(a.observedAt || "");
      const bTime = Date.parse(b.observedAt || "");
      const timeOrder = (Number.isFinite(bTime) ? bTime : Infinity) - (Number.isFinite(aTime) ? aTime : Infinity);
      const rank = { fail: 3, blocked: 2, unverified: 1, pass: 0 };
      return (Number.isNaN(timeOrder) ? 0 : timeOrder) || rank[b.status] - rank[a.status] || a.id.localeCompare(b.id);
    })[0];
    const time = Date.parse(evidence?.observedAt || "");
    const current = Boolean(evidence && present(currentSourceRevision) &&
      evidence.sourceRevision === currentSourceRevision && present(evidence.sourceRevision) &&
      Number.isInteger(task.attempts) && evidence.attempt === task.attempts &&
      present(evidence.id) && present(evidence.source) && present(evidence.evidenceRef) && present(evidence.scope) &&
      Number.isFinite(now) && Number.isFinite(time) && time <= now);
    const status = evidence?.status || "unverified";
    const verifiedCurrent = current && status === "pass";
    const label = !evidence ? "근거 없음 · 미검증"
      : verifiedCurrent ? "현행 검증 완료"
      : `${deliveryLabels[status]} · ${current ? "현행 근거" : "현행 검증 미확인"}`;
    return { stage, title, evidence, history, status, verifiedCurrent, label };
  });
}

// Shared by taskDisplay and the existing inbox. One task can have several reasons,
// but it retains one detail/review entry and never triggers an automatic action.
export function attentionReasons(task: Task): string[] {
  const reasons: string[] = [];
  if (task.status === "running" && task.activity === "input_wait") reasons.push("답변 대기");
  const labels: Partial<Record<Task["status"], string>> = {
    blocked: "중단 · 도움 필요", failed: "중단 · 실행 실패", review: "검토 대기", approval: "승인 대기",
  };
  const label = labels[task.status];
  if (label) reasons.push(label);
  if (task.dependencyStale) reasons.push("선행 근거 변경");
  return reasons;
}
export function waitingLabel(since: string, now: number): string {
  const elapsed = now - Date.parse(since);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "대기 시간 미확인";
  if (elapsed < 60000) return "1분 미만 경과";
  return `${Math.floor(elapsed / 60000)}분 경과`;
}
export function attentionItems<T extends TaskEvidenceInput>(tasks: T[], now: number) {
  const seen = new Set<string>();
  return tasks.flatMap(task => {
    if (seen.has(task.id)) return [];
    seen.add(task.id);
    const reasons = attentionReasons(task);
    const priority = reasons.length ? "action" : "hint";
    if (!reasons.length && task.status === "completed") reasons.push("업무 완료 · 단계별 검증 확인 필요");
    if (!reasons.length) return [];
    const count = deliveryRows(task, now).filter(row => row.evidence).length;
    return [{ task, reasons, priority, waiting: waitingLabel(task.updatedAt, now),
      nextAction: task.nextAction?.trim() || "상세에서 요청과 근거를 확인하세요.",
      evidenceLabel: count ? `${count}/6단계 기록 있음 · 현행 검증 미확인` : "단계별 근거 없음" }];
  }).sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "action" ? -1 : 1) ||
    (Date.parse(b.task.updatedAt) || 0) - (Date.parse(a.task.updatedAt) || 0));
}
