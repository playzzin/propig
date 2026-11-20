import { useCallback, useEffect, useId, useRef, useState } from "react";
import { fetchTaskHistory } from "./client";
import { historyLabels, TaskHistoryError } from "./taskHistoryApi.js";
import type { TaskHistoryEvent, TaskHistoryPage, TaskStatus } from "./types";

type Props = { taskId: string; currentStatus: TaskStatus | null; revision: number; connected: boolean };
const statuses: Record<TaskStatus, string> = {
  queued: "실행 대기", running: "진행 중", blocked: "도움 필요", review: "검토 대기",
  approval: "승인 대기", completed: "완료", failed: "실패", cancel_requested: "중지 요청", cancelled: "취소",
};
// Keyed scope also hides the old task synchronously, before passive cleanup.
export default function TaskHistory(props: Props) {
  return <HistoryScope key={props.taskId} {...props} />;
}
function HistoryScope({ taskId, currentStatus, revision, connected }: Props) {
  const heading = useId();
  const [page, setPage] = useState<TaskHistoryPage | null>(null);
  const [anchorRevision, setAnchorRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(true);
  const [error, setError] = useState<TaskHistoryError | null>(null);
  const [filter, setFilter] = useState("all");
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const currentPage = useRef<TaskHistoryPage | null>(null);
  const failedReset = useRef(true);
  const request = useCallback(async (reset: boolean) => {
    if (!reset && (pending.current || !currentPage.current?.hasMore)) return;
    const previous = currentPage.current;
    const nextCursor = reset ? null : previous!.nextCursor;
    // Preserve visible rows, but never reuse a pre-refresh/reconnect cursor.
    if (reset) currentPage.current = null;
    pending.current?.abort();
    const controller = new AbortController();
    const token = ++generation.current;
    pending.current = controller;
    failedReset.current = reset;
    setResetting(reset);
    setLoading(true);
    setError(null);
    try {
      const incoming = await fetchTaskHistory(taskId, nextCursor, controller.signal);
      if (token !== generation.current || controller.signal.aborted) return;
      if (nextCursor && incoming.nextCursor === nextCursor) throw new TaskHistoryError(true);
      const unique = new Map<string, TaskHistoryEvent>();
      for (const item of [...(reset ? [] : previous?.events ?? []), ...incoming.events]) {
        if (!unique.has(item.id)) unique.set(item.id, item);
      }
      const merged = { ...incoming, events: [...unique.values()] };
      currentPage.current = merged;
      if (reset) setAnchorRevision(incoming.snapshotRevision);
      setPage(merged);
    } catch (cause) {
      if (token === generation.current && !controller.signal.aborted) setError(cause instanceof TaskHistoryError ? cause : new TaskHistoryError());
    } finally {
      if (token === generation.current) {
        pending.current = null;
        setLoading(false);
      }
    }
  }, [taskId]);
  const invalidate = useCallback(() => {
    ++generation.current;
    pending.current?.abort();
    pending.current = null;
  }, []);
  useEffect(() => {
    void request(true);
    const online = () => { void request(true); };
    window.addEventListener("online", online);
    return () => {
      invalidate();
      window.removeEventListener("online", online);
    };
  }, [request, invalidate]);
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) void request(true);
    wasConnected.current = connected;
  }, [connected, request]);
  const visible = page?.events.filter(item => filter === "all" || item.kind === filter) ?? [];
  return (
    <section aria-labelledby={heading} style={{ overflowWrap: "anywhere", minWidth: 0 }}>
      <h3 id={heading}>업무 기록 타임라인</h3>
      <p>현재 저장된 업무 상태: {currentStatus ? statuses[currentStatus] : "업무 확인 불가"}</p>
      <p>업무 요약: 저장된 사건의 종류만 표시합니다. 종료 기록은 완료·승인 증명이 아닙니다.</p>
      <p className="muted">저장된 감사 기록만 · 최신 저장순 · 수집 범위 완전성 미확인<br />행위자 기록 없음 · 시도 연결 미기록 · 대상 직원은 행위자가 아닙니다.</p>
      <p><small>업무 ID: {taskId}</small></p>
      {!connected && <p role="status">상태 연결 확인 필요. 아래는 마지막으로 확인한 기록입니다.</p>}
      {page && revision > anchorRevision && <p role="status">상태가 갱신되었습니다. 새 기록 여부는 최신 기록 갱신으로 확인하세요.</p>}
      <button type="button" className="secondary" onClick={() => { void request(true); }}>최신 기록 갱신</button>
      <label style={{ display: "block", marginBlock: 12 }}>
        불러온 기록 분류
        <select value={filter} onChange={event => setFilter(event.target.value)} style={{ maxWidth: "100%" }}>
          <option value="all">전체 분류</option>
          {Object.entries(historyLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
      </label>
      <div role="status" aria-live="polite">{loading ? "기록을 불러오는 중…" : page ? `불러온 기록 ${page.events.length}건 · 표시 ${visible.length}건` : ""}</div>
      {loading && page && <p>아래는 이전 조회에서 마지막으로 확인한 기록입니다.</p>}
      {error && <div role="alert"><p>{error.message}</p>{page && <p>마지막 확인 기록입니다. 이번 조회는 실패했습니다.</p>}
        {!error.resetRequired && <button type="button" disabled={loading} onClick={() => { void request(failedReset.current); }}>기록 조회 다시 시도</button>}
      </div>}
      {page && !loading && !error && page.events.length === 0 && <p>저장된 업무 기록이 없습니다. 실제 활동이 없었다는 뜻은 아닙니다.</p>}
      {page && page.events.length > 0 && visible.length === 0 && <p>불러온 범위에 해당 분류가 없습니다. 더 불러올 기록이 있는지 확인하세요.</p>}
      <ol aria-label="저장된 업무 사건" style={{ paddingInlineStart: 24 }}>
        {visible.map(item => <li key={item.id} data-history-id={item.id} style={{ marginBlock: 16 }}>
          <strong>{historyLabels[item.kind]}</strong><br />
          {item.at ? <time dateTime={item.at}>{new Date(item.at).toLocaleString("ko-KR", { timeZoneName: "short" })}</time> : "시각 확인 불가"}<br />
          <small>대상 직원: {item.employeeId ? `직원 ID ${item.employeeId}` : "기록 없음"}<br />기록 참조: {item.evidenceRef}</small>
        </li>)}
      </ol>
      {page?.hasMore && <button type="button" className="secondary" disabled={loading || !!error?.resetRequired || (!!error && resetting)} onClick={() => { void request(false); }}>이전 기록 더 불러오기</button>}
      {page && !page.hasMore && <p className="muted">이번 조회 범위의 마지막 기록입니다. 모든 과거 활동의 완전성을 뜻하지 않습니다.</p>}
    </section>
  );
}
