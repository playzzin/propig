import { useEffect, useState } from "react";
import { z } from "zod";
import type { OfficeEvent } from "./types";
const historySchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      employeeId: z.string(),
      taskId: z.string(),
      summary: z.string(),
      at: z.string(),
    }),
  ),
});
export default function AuditLog({ revision }: { revision: number }) {
  const [offset, setOffset] = useState(0);
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/history?offset=${offset}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("저장된 활동·변경 기록을 불러오지 못했습니다.");
        return response.json();
      })
      .then((value) => {
        setEvents(historySchema.parse(value).events);
        setError("");
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "기록 확인 실패");
      });
    return () => controller.abort();
  }, [offset, revision]);
  return (
    <>
      <div className="panel">
        {error && <p role="alert">{error} 아래 내용이 남아 있다면 이전 조회에서 불러온 기록입니다. 이번 조회 결과가 아닙니다.</p>}
        {events.map((event) => (
          <div className="event-row" key={event.id}>
            <time>{new Date(event.at).toLocaleString("ko-KR")}</time>
            <p>{event.summary}</p>
          </div>
        ))}
        {!events.length && !error && (
          <p className="muted">아직 불러온 기록이 없습니다. 실제 활동이 없었다는 뜻은 아닙니다.</p>
        )}
      </div>
      <div className="history-controls">
        <button
          className="secondary"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          최근 기록
        </button>
        <span>
          {offset + 1}–{offset + events.length}
        </span>
        <button
          className="secondary"
          disabled={events.length < 100}
          onClick={() => setOffset(offset + 100)}
        >
          이전 기록
        </button>
      </div>
    </>
  );
}
