import { z } from "zod";
import type { TaskHistoryPage } from "./types";

export const historyLabels = {
  "task.create": "업무 등록 기록",
  "workflow.task": "업무 예약 기록",
  "agent:start": "시작 이벤트 기록",
  "agent:step": "진척 이벤트 기록",
  "agent:end": "종료 이벤트 기록",
  "agent:error": "오류 관련 이벤트 기록",
  "agent:cancelled": "중단 관련 이벤트 기록",
  "task.review": "검토 기록",
  "task.update": "업무 변경 기록",
  "task.dependency_stale": "선행 근거 변경 기록",
  "workflow.handoff": "업무 인계 기록",
  "workflow.cancel": "계획 취소 관련 기록",
  "workflow.plan": "계획 업무 등록 기록",
  "workflow.import": "계획 가져오기 기록",
  "record.create": "회사 기록 등록",
  "record.update": "회사 기록 변경",
  unknown: "기타 이벤트 기록",
} as const;

const id = z.string().regex(/^[a-f0-9]{32}$/);
const cursor = z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/);
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/).refine(value => {
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60
    && Number.isFinite(Date.parse(value));
});
const event = z.object({
  id, kind: z.enum(Object.keys(historyLabels) as [keyof typeof historyLabels, ...(keyof typeof historyLabels)[]]),
  employeeId: id.nullable(), taskId: id, at: timestamp.nullable(), safeLabel: z.string(),
  attempt: z.null(), evidenceRef: id, legacy: z.literal(true),
}).strict().refine(value => value.safeLabel === historyLabels[value.kind] && value.evidenceRef === value.id);
const schema = z.object({
  events: z.array(event).max(100), nextCursor: cursor.nullable(), hasMore: z.boolean(),
  snapshotRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), coverage: z.literal("stored-audit-only"),
}).strict().refine(value => value.hasMore ? value.events.length === 100 && value.nextCursor !== null : value.nextCursor === null);

export class TaskHistoryError extends Error {
  constructor(public readonly resetRequired = false) {
    super(resetRequired ? "조회 위치를 확인할 수 없습니다. 최신 기록을 갱신하세요." : "기록을 불러오지 못했습니다. 다시 시도하세요.");
  }
}
export function parseTaskHistory(data: unknown, taskId: string): TaskHistoryPage {
  const parsed = schema.safeParse(data);
  if (!id.safeParse(taskId).success || !parsed.success || parsed.data.events.some(item => item.taskId !== taskId)) throw new TaskHistoryError();
  return parsed.data;
}
export async function fetchTaskHistory(taskId: string, nextCursor: string | null, signal: AbortSignal): Promise<TaskHistoryPage> {
  if (!id.safeParse(taskId).success || (nextCursor !== null && !cursor.safeParse(nextCursor).success)) throw new TaskHistoryError(true);
  const query = new URLSearchParams({ taskId });
  if (nextCursor !== null) query.set("cursor", nextCursor);
  const response = await fetch(`/api/history?${query}`, { signal, cache: "no-store" });
  if (!response.ok) throw new TaskHistoryError(response.status === 400);
  return parseTaskHistory(await response.json(), taskId);
}
