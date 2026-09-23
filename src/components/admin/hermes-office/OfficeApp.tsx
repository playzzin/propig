import React, { useEffect, useRef, useState } from "react";
import {
  Building2,
  Users,
  ClipboardList,
  FolderKanban,
  BookOpen,
  Trophy,
  GraduationCap,
  Settings,
  Plus,
  Search,
  X,
  ArrowUpRight,
  Radio,
  Download,
  RefreshCw,
  Sprout,
  Monitor,
  Activity,
  CircleCheck,
  Inbox,
  Maximize2,
  Minimize2,
  ArrowRight,
  CalendarDays,
  Pause,
  Cable,
} from "lucide-react";
import { useOffice, discover } from "./client";
import AuditLog from "./AuditLog";
import TaskHistory from "./TaskHistory";
import type { Employee, Task, CompanyRecord, Action } from "./types";
import "./office.css";
import OfficeScene from "./OfficeScene";
import OfficeMetric from "./OfficeMetric";
import "./office-theme.css";
import {
  awaitingReply,
  taskDisplayStatus,
} from "./taskDisplay";
import {
  attentionItems,
  deliveryRows,
  observationLabels,
  observationRows,
  type EmployeeEvidenceInput,
  type TaskEvidenceInput,
} from "./dashboardEvidence";
import {
  WorkflowCenter,
  PerformanceDetails,
  TrainingCenter,
  ExecutionSettings,
  ReviewTask,
} from "./CompanyFeatures";

const nav = [
  ["office", "사무실", Building2],
  ["employees", "직원·조직", Users],
  ["tasks", "업무 보드", ClipboardList],
  ["projects", "프로젝트", FolderKanban],
  ["records", "기록 보관함", BookOpen],
  ["performance", "성과·포상", Trophy],
  ["education", "교육·지식", GraduationCap],
  ["settings", "회사 설정", Settings],
] as const;
const labels: Record<string, string> = {
  queued: "실행 대기",
  running: "진행 상태로 저장됨",
  waiting_reply: "답변 대기",
  blocked: "도움 필요 · 이유 확인",
  review: "결과 확인 대기",
  approval: "최종 완료 결정 대기",
  completed: "완료로 기록됨",
  failed: "실행 실패 기록",
  cancelled: "취소로 기록됨",
  cancel_requested: "중지 요청 · 종료 확인 전",
  draft: "초안",
  verified: "검증됨",
  candidate: "검증 후보",
  archived: "보관",
  active: "명부에서 사용",
  inactive: "명부에서 사용 중지",
  award: "포상",
  feedback: "개선 면담",
  education: "교육",
  knowledge: "지식",
  meeting: "회의",
};
const transitions: Record<string, string[]> = {
  queued: ["blocked", "cancelled"],
  blocked: ["queued", "cancelled"],
  running: ["cancel_requested"],
  review: ["approval", "queued", "cancelled"],
  approval: ["completed", "review", "cancelled"],
  failed: ["queued", "cancelled"],
  cancel_requested: [],
  cancelled: [],
  completed: [],
};
const characterName = (v: string) =>
  (
    ({ "🤖": "robot", "🐱": "cat", "🧑": "person", "🌱": "mascot" }) as Record<
      string,
      string
    >
  )[v] ||
  v ||
  "robot";
const pretty = (v: string) => labels[v] || v;
const evidenceDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const when = (v: string) => {
  if (!v) return "미확인";
  const date = new Date(v);
  return Number.isFinite(date.getTime()) ? evidenceDateFormatter.format(date) : "시각 확인 불가";
};
function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value}`}>{pretty(value)}</span>;
}
const capabilityKinds: Record<string, string> = {
  skill: "업무 방법 안내(스킬)", toolset: "작업 도구 모음",
  integration: "외부 서비스 연결 설정", runtime: "업무 실행 프로그램",
  library: "보조 프로그램", instruction: "업무 지침",
};
function CapabilityDetails({ item: c }: { item: Employee["capabilities"][number] }) {
  const registration = c.kind === "integration" && c.status === "설치 확인"
    ? "연결 설정이 등록됨 — 접속 성공을 확인한 것은 아닙니다."
    : c.kind === "runtime" && c.status === "설치 확인"
      ? "프로그램 정보가 수집됨 — 실행 성공을 확인한 것은 아닙니다."
      : c.kind === "instruction" && c.status === "원문 요약 보기"
        ? "지침 내용이 수집됨 — 현재 적용 여부는 별도 확인이 필요합니다."
        : ({ "설치 확인": "설치 기록 있음", "설정 확인": "설정에 등록됨", "선언 확인": "필요 프로그램으로 선언됨 — 설치 확인과 다릅니다." } as Record<string, string>)[c.status]
          || "등록 상태를 해석할 수 없습니다. 기술 상세의 수집값을 확인하세요.";
  return (
    <div className="capability" style={{ overflowWrap: "anywhere", minWidth: 0 }}>
      <strong>{c.name}</strong>
      <p>{capabilityKinds[c.kind] || "분류 확인 필요"}</p>
      <p>이 도구가 하는 일 · 수집된 설명: {c.description || "설명이 아직 수집되지 않았습니다."}</p>
      <p>언제 쓰나요: {c.description ? "수집된 설명이 맡길 일과 맞는지 먼저 비교하세요. 구체적인 사용 조건은 이 목록에 따로 기록되지 않았습니다." : "용도 설명을 먼저 확인해야 사용 시점을 판단할 수 있습니다."}</p>
      <p>설치·등록: {registration}</p>
      <p>지금 쓸 수 있나요: 실행 시험 결과가 이 목록에 없어 확인이 필요합니다.</p>
      <p>지금 쓰고 있나요: 이 업무에서 사용 중임을 보여주는 기록은 이 목록에 없습니다.</p>
      <p>입력·결과 예시: 별도 명세가 수집되지 않았습니다. 설명만으로 입력 형식이나 결과를 보장하지 않습니다.</p>
      <p>권한·비용: 이 항목의 접근 범위와 비용은 확인되지 않았습니다. 목록에 있다는 이유로 실행 권한이 추가되지는 않습니다.</p>
      <details>
        <summary>기술 상세 · 버전·상태·출처</summary>
        <dl>
          <dt>수집된 분류</dt><dd>{c.kind || "분류 미확인"}</dd>
          <dt>수집된 상태</dt><dd>{c.status || "상태 미확인"}</dd>
          <dt>버전</dt><dd>{c.version || "버전 미확인"}</dd>
          <dt>출처</dt><dd>{c.source || "출처 미확인"}</dd>
        </dl>
      </details>
    </div>
  );
}
function evidenceTime(value: string | null | undefined): string {
  return value && Number.isFinite(Date.parse(value)) ? when(value) : "미확인";
}
function DecisionGuidance({ task }: { task: Task }) {
  const [decision, reason, recommendation, effect] = task.dependencyStale
    ? ["앞 업무의 결과가 바뀌었습니다. 이 결과도 다시 확인해 주세요.", "이 업무가 사용한 선행 결과의 변경이 기록됐습니다.", "사용했던 결과와 새 결과를 비교한 뒤 재작업 필요 여부를 확인하세요.", "검토 통과는 제한됩니다. 수정 요청은 현재 결과와 종료 시각을 비우고 재작업을 예약합니다."]
    : awaitingReply(task)
      ? ["추가 질문에 답해 주세요.", "사용자 답변을 기다리는 상태로 기록돼 있습니다.", "Telegram의 해당 봇 대화에서 실제 질문을 확인하고 답하세요.", "이 화면에는 답변 전송 기능이 없습니다. 답변 뒤 실제 재개 여부는 별도로 확인하세요."]
      : task.status === "review"
        ? ["결과가 완료 조건을 충족하는지 확인해 주세요.", "결과 확인을 기다리는 상태입니다.", "요청·완료 조건·결과를 비교하고 검토 근거를 남기세요.", "검토 통과는 최종 완료 결정 단계로 이동할 뿐, 최종 완료나 배포가 아닙니다."]
        : task.status === "approval"
          ? ["검토한 결과를 업무 완료로 기록할지 결정해 주세요.", "최종 완료 결정이 남은 상태입니다.", "결과와 검토 의견을 확인한 뒤 업무 상태에서 완료를 선택하고 저장하세요.", "완료로 저장하면 업무 기록만 바뀝니다. 배포·권한 증가·서비스 정상 인증은 아닙니다."]
          : ["blocked", "failed"].includes(task.status)
            ? ["막힌 이유와 다시 시도할 조건을 확인해 주세요.", task.status === "failed" ? "실행 실패가 기록돼 있습니다." : "도움이 필요한 상태로 기록돼 있습니다.", "진행 기록·다음 행동·먼저 필요한 업무를 확인하세요. 원인이 해결됐는지 확인 전 재실행을 권하지 않습니다.", "실행 대기로 저장하면 조건에 따라 재실행과 사용량이 발생할 수 있습니다. 저장만으로 복구되는 것은 아닙니다."]
            : task.status === "completed"
              ? ["완료 기록과 실제 반영 여부를 따로 확인해 주세요.", "완료 상태만으로 현재 서비스 반영을 증명할 수 없습니다.", "결과와 아래 단계별 확인 근거를 살펴보세요.", "실제 사용 가능 여부는 별도 확인이 필요합니다. 일반 완료 업무의 기록 저장은 제한됩니다."]
              : ["저장된 업무 상태와 다음 행동을 확인해 주세요.", "업무 등록과 실제 실행은 서로 다릅니다.", "담당자·요청·다음 행동을 확인하세요.", "상태를 저장해도 실제 성공이 확인되는 것은 아닙니다. 중지 요청도 종료 확인 전에는 완료가 아닙니다."];
  return (
    <>
      <p>결정할 일: {decision}</p>
      <p>왜 확인하나요: {reason}</p>
      <p>먼저 할 일 · 화면의 확인 순서 안내: {recommendation}</p>
      <p>추천 근거: 현재 저장된 상태와 결과 확인 절차를 기준으로 한 안내이며, 담당자의 별도 추천안은 아닙니다.</p>
      <p>처리하면: {effect}</p>
    </>
  );
}
function TaskFacts({ task, owner }: { task: Task; owner: string }) {
  return (
    <span style={{ display: "grid", gap: 8, overflowWrap: "anywhere", fontSize: 12, lineHeight: 1.7 }}>
      <span>담당: {owner}</span>
      <span>저장된 상태: {pretty(taskDisplayStatus(task))} — 실제 실행 확인과 별개</span>
      <span>막힘·문제: {task.dependencyStale ? "앞 업무의 결과 변경 — 다시 확인 필요" : ["blocked", "failed"].includes(task.status) ? task.summary || "구체적인 이유가 기록되지 않았습니다. 다음 행동과 선행 업무를 확인하세요." : "별도 막힘 사유 없음 — 문제가 없다는 증명은 아닙니다."}</span>
      <span>다음 행동: {task.nextAction || "아직 기록되지 않았습니다. 업무 상세에서 요청과 근거를 확인하세요."}</span>
      <span>결과: {task.result ? "결과 내용 있음 — 상세에서 완료 조건과 비교하세요." : "아직 결과 내용 없음"}</span>
      <span>검토: {task.reviewNote || "검토 의견이 아직 기록되지 않았습니다."}</span>
      <span>실제 화면 반영·사용 가능 여부: 확인 필요</span>
      <span>마지막 기록 수정: {when(task.updatedAt)}</span>
      <span>이 업무의 마지막 실제 활동: 확인 불가 — 기록 수정 시각과 다릅니다.</span>
    </span>
  );
}
function responseTime(snapshot: { revision: number; generatedAt?: string }): string {
  return evidenceTime(snapshot.generatedAt);
}
const ObservationDetails = React.memo(function ObservationDetails({ employee, now }: { employee: EmployeeEvidenceInput; now: number }) {
  return (
    <div className="dashboard-observation-grid">
      {observationRows(employee, now).map(row => (
        <article key={row.channel} data-observation-channel={row.channel} data-current-status={row.currentStatus}>
          <h4>{{ gateway: "봇 연결 통로", modelCall: "AI 응답 요청", telegramReceive: "Telegram 메시지 받기", telegramSend: "Telegram 메시지 보내기", work: "실제 업무 활동" }[row.channel]}</h4>
          <strong>{row.label}</strong>
          <p>{row.reason}</p>
          <details>
            <summary>기술 상세 · 확인 시각과 출처</summary>
            <dl>
            <dt>확인한 시각</dt><dd>{evidenceTime(row.evidence?.observedAt)}</dd>
            <dt>출처</dt><dd>{row.evidence?.source || "미확인"}</dd>
            <dt>근거</dt><dd>{row.evidence?.evidenceRef || "없음"}</dd>
            <dt>이 확인을 믿을 수 있는 기한</dt><dd>{evidenceTime(row.evidence?.validUntil)}</dd>
            <dt>기록 상태</dt><dd>{observationLabels[row.historicalStatus]}</dd>
            <dt>사유 코드</dt><dd>{row.evidence?.reasonCode || "미수집"}</dd>
            </dl>
          </details>
        </article>
      ))}
    </div>
  );
});
function ObservationDisclosure({ employee, now }: { employee: Employee; now: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>{employee.name} · 연결·작업 상태 5종 중 {observationRows(employee, now).filter(row => row.currentStatus === "unknown").length}종 확인 필요</summary>
      {expanded && <ObservationDetails employee={employee} now={now} />}
    </details>
  );
}
function DeliveryDetails({ task, now }: { task: TaskEvidenceInput; now: number }) {
  return (
    <section className="dashboard-delivery" aria-label="단계별 검증 근거">
      <h3>단계별 검증 근거</h3>
      <p>완료로 기록된 업무라도 실제 화면에 반영됐는지는 별도로 확인해야 합니다. 현재 버전에 대한 확인 근거가 없으면 확인 필요로 표시합니다.</p>
      <ol>
        {deliveryRows(task, now).map(row => (
          <li key={row.stage} data-delivery-stage={row.stage}>
            <div><strong>{{ implementation: "변경 내용 작성", typecheck: "코드 형식 검사", test: "기능 시험", ui: "화면에서 직접 확인", "source-integration": "정식 소스에 반영", deployment: "사용 중인 서비스에 반영" }[row.stage]}</strong><span>{row.label}</span></div>
            {row.evidence && <details>
              <summary>기록 근거 {row.history.length}건 보기 (현행 검증과 별개)</summary>
              {row.history.map((item, index) => (
                <dl key={`${item.id}-${index}`}>
                  <dt>기록 상태</dt><dd>{{ unverified: "미검증", pass: "통과 기록", fail: "중단 · 실패 기록", blocked: "중단 기록" }[item.status]}</dd>
                  <dt>범위</dt><dd>{item.scope || "미확인"}</dd>
                  <dt>관측 시각</dt><dd>{evidenceTime(item.observedAt)}</dd>
                  <dt>출처</dt><dd>{item.source || "미확인"}</dd>
                  <dt>근거</dt><dd>{item.evidenceRef || "없음"}</dd>
                  <dt>소스 버전</dt><dd>{item.sourceRevision || "미확인"}</dd>
                  <dt>시도</dt><dd>{item.attempt} · 현재 업무 시도 {task.attempts ?? "미확인"}</dd>
                  <dt>산출물</dt><dd>{item.artifactRef || "없음"}</dd>
                </dl>
              ))}
            </details>}
          </li>
        ))}
      </ol>
    </section>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <Sprout size={28} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
function Avatar({ e }: { e: Employee }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`avatar character-${characterName(e.character)}`}
      style={{ "--employee": e.color || "#287d70" } as React.CSSProperties}
    >
      {e.avatar && !failed ? (
        <img
          src={e.avatar}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{e.name.slice(0, 2)}</span>
      )}
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],summary",
          ) || [],
        ).filter((node) => node.getClientRects().length > 0);
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="닫기"
            onClick={close}
          >
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default function OfficeApp() {
  const { state: s, error, connected, busy, act, refresh } = useOffice();
  const [taskDraft, setTaskDraft] = useState<Task | undefined>();
  const [recordDraft, setRecordDraft] = useState<CompanyRecord | undefined>();
  const [handoffTask, setHandoffTask] = useState<Task | undefined>();
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);
  const hostStatus = (lastSeen: string) =>
    clock >= Date.parse(lastSeen) && clock - Date.parse(lastSeen) <= 45000 ? "관찰 기록 있음" : "관찰 확인 필요";
  const [view, setView] = useState<string>("office"),
    [query, setQuery] = useState(""),
    [floor, setFloor] = useState(0),
    [observe, setObserve] = useState(false),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState(""),
    [notice, setNotice] = useState(""),
    [discovering, setDiscovering] = useState(false);
  const close = React.useCallback(() => setModal(""), []);
  const changeView = (next: string) => {
    setObserve(false);
    setView(next);
    setQuery("");
  };
  const save = async (action: Action) => {
    if (await act(action)) {
      setNotice("저장했습니다. 업무 기록에 반영되었습니다.");
      close();
    }
  };
  const scan = async () => {
    setDiscovering(true);
    try {
      const r = await discover();
      setNotice(`확인한 봇 ${r.found}개. ${r.warnings.join(" ")}`);
      await refresh();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "봇 정보를 확인하지 못했습니다.",
      );
    } finally {
      setDiscovering(false);
    }
  };
  if (!s)
    return (
      <div className="office-app boot">
        <Building2 size={38} />
        <h1>AI 직원 사무실</h1>
        <p>{error || "회사 기록을 불러오고 있습니다."}</p>
        {error && <button onClick={() => void refresh()}>다시 연결</button>}
      </div>
    );
  const employees = s.employees.filter((e) =>
    `${e.name} ${e.title} ${e.username}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const employee = (id: string) => s.employees.find((e) => e.id === id);
  const attentionTasks = attentionItems(s.tasks, clock);
  const readyEmployees = s.employees.filter(
    (e) =>
      e.runtime?.status === "ready" &&
      clock >= Date.parse(e.runtime.lastSeen) &&
      clock - Date.parse(e.runtime.lastSeen) < 45000,
  ).length;
  const recentActivity = [...s.events]
    .reverse()
    .filter(
      (event) =>
        Boolean(event.taskId) ||
        !["runtime:status", "inventory", "heartbeat"].includes(event.kind),
    )
    .slice(0, 5);
  const shownActivity = recentActivity.length
    ? recentActivity
    : [...s.events].reverse().slice(0, 4);
  const department = (id: string) =>
    s.departments.find((d) => d.id === id)?.name || "소속 미지정";
  const open = (kind: string, id = "") => {
    setHandoffTask(undefined);
    setTaskDraft(
      kind === "task" ? s.tasks.find((task) => task.id === id) : undefined,
    );
    setRecordDraft(
      kind === "record"
        ? s.records.find((record) => record.id === id)
        : undefined,
    );
    setSelected(id);
    setModal(kind);
  };
  const chosenEmployee = employee(selected),
    chosenTask = taskDraft,
    chosenRecord = recordDraft;
  const latestTask = s.tasks.find((task) => task.id === selected);
  const employeeOptions = (
    <>
      <option value="">직원 선택</option>
      {s.employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name} · {e.title || "직책 미지정"}
        </option>
      ))}
    </>
  );
  const taskRow = (t: Task) => (
    <button className="task-row" key={t.id} onClick={() => open("task", t.id)}>
      <div>
        <strong>{t.title}</strong>
        <p>
          {employee(t.employeeId)?.name || "담당 미지정"} ·{" "}
          {t.summary || "진행 설명이 아직 기록되지 않았습니다."}
        </p>
      </div>
      <Badge value={taskDisplayStatus(t)} />
      <ArrowUpRight size={16} />
    </button>
  );
  const recordRow = (r: CompanyRecord) => (
    <button
      className="record-row"
      key={r.id}
      onClick={() => open("record", r.id)}
    >
      <span className="record-icon">
        {r.kind === "award" ? (
          <Trophy />
        ) : r.kind === "education" ? (
          <GraduationCap />
        ) : (
          <BookOpen />
        )}
      </span>
      <div>
        <small>
          {pretty(r.kind)} · {employee(r.employeeId)?.name || "회사 공통"}
        </small>
        <strong>{r.title}</strong>
        <p>{r.content}</p>
      </div>
      <Badge value={r.status} />
    </button>
  );
  const formSubmit =
    (type: string, extra: Record<string, unknown> = {}) =>
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = Object.fromEntries(
        new FormData(event.currentTarget).entries(),
      );
      const action: Action = { type, ...extra, ...data };
      if (
        type === "task.update" &&
        action.status === s.tasks.find((t) => t.id === extra.id)?.status
      )
        delete action.status;
      if ("seat" in action) action.seat = Number(action.seat) - 1;
      if ("maxConcurrent" in action)
        action.maxConcurrent = Number(action.maxConcurrent);
      if (type === "task.create") {
        action.dependencies = new FormData(event.currentTarget).getAll(
          "dependencies",
        );
        action.participants = new FormData(event.currentTarget).getAll(
          "participants",
        );
      }
      void save(action);
    };
  const actionButton = (
    <button
      className="primary"
      onClick={() =>
        open(
          view === "projects"
            ? "project"
            : view === "records"
              ? "record-new"
              : view === "education"
                ? "education-new"
                : view === "performance"
                  ? "award-new"
                  : "task-new",
        )
      }
    >
      <Plus size={16} />
      {view === "projects"
        ? "프로젝트 만들기"
        : view === "records"
          ? "기록 남기기"
          : view === "education"
            ? "교육·지식 등록"
            : view === "performance"
              ? "포상·피드백"
              : "업무 등록"}
    </button>
  );
  return (
    <div className={`office-app ${observe ? "observe" : ""}`}>
      <a className="skip-link" href="#office-main">
        본문으로 이동
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changeView("office");
          }}
        >
          <span className="brand-mark">
            <Building2 size={25} />
          </span>
          <span>
            HERMES<small>AI 직원 사무실</small>
          </span>
        </a>
        <button
          className="workspace-switch"
          onClick={() => changeView("employees")}
        >
          <span className="workspace-symbol">
            <Building2 size={18} />
          </span>
          <span>
            <strong>{s.settings.companyName}</strong>
            <small>우리 팀 · 직원 {s.employees.length}명</small>
          </span>
          <ArrowUpRight size={14} />
        </button>
        <div className="company-label">
          회사 운영 <span>업무 공간</span>
        </div>
        <nav aria-label="주 메뉴">
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={view === key ? "selected" : ""}
              aria-current={view === key ? "page" : undefined}
              onClick={() => {
                changeView(key);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === "tasks" && (
                <small>
                  {
                    s.tasks.filter(
                      (t) =>
                        t.status !== "completed" && t.status !== "cancelled",
                    ).length
                  }
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-connection">
            <span className={`live-dot ${connected ? "" : "offline"}`} />
            {connected ? "회사 기록을 받아오는 중" : "기록 연결 확인 중"}
          </div>
          <p>
            기록 연결과 실제 작업 성공은 별개입니다
            <br />
            현재 {s.employees.length}명 · 최대 100명
          </p>
          <a href="/api/export">
            <Download size={14} /> 회사 기록 내보내기
          </a>
        </div>
      </aside>
      <main id="office-main" tabIndex={-1}>
        <header className="topbar">
          <div>
            <span className="eyebrow">
              <Building2 size={12} /> 업무 공간{" "}
              <span aria-hidden="true">/</span> {s.settings.companyName}
            </span>
            <h1>{nav.find((n) => n[0] === view)?.[1]}</h1>
          </div>
          <div className="header-actions">
            <button
              className="secondary"
              onClick={() => void scan()}
              disabled={discovering}
            >
              <RefreshCw size={15} />
              {discovering ? "확인 중…" : "직원 연결 정보 확인"}
            </button>
            {actionButton}
          </div>
        </header>
        <p className="inline-note">먼저 대표 확인함에서 내 결정이 필요한 일을 보고, 업무 보드에서 담당자와 다음 행동을 확인하세요. 직원 연결 정보 확인은 등록 정보를 다시 수집하며 실행 성공 검사는 아닙니다.</p>
        {!connected && (
          <div className="alert">
            연결이 끊겨 마지막 저장 상태를 표시합니다. 새 활동이 도착하면
            자동으로 갱신합니다.
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label="알림 닫기" onClick={() => setNotice("")}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="content">
          {view === "office" && (
            <>
              <section className="overview">
                <div className="intro">
                  <h2>우리 팀의 하루</h2>
                  <p>
                    {s.employees.length
                      ? "누가 무엇을 맡았는지, 내 결정이 필요한 일은 무엇인지 확인하세요. 직원의 움직임만으로 실제 성공을 판단하지 않습니다."
                      : "첫 직원의 연결을 확인하고 사무실을 시작하세요."}
                  </p>
                </div>
                <div className="office-date">
                  <CalendarDays size={15} />
                  <time dateTime={new Date(clock).toISOString()}>
                    {new Date(clock).toLocaleDateString("ko-KR", {
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    })}
                  </time>
                </div>
              </section>
              <div className="office-metrics" aria-label="회사 현황">
                <OfficeMetric
                  label="함께하는 직원"
                  value={s.employees.length}
                  unit="명"
                  detail="직원·조직 살펴보기"
                  icon={Users}
                  tone="team"
                  onClick={() => changeView("employees")}
                />
                <OfficeMetric
                  label="진행 상태로 저장된 업무"
                  value={
                    s.tasks.filter(
                      (t) => t.status === "running" && !awaitingReply(t),
                    ).length
                  }
                  unit="건"
                  detail="저장 상태 기준 · 실제 활동은 관측 근거 확인"
                  icon={Activity}
                  tone="active"
                  onClick={() => changeView("tasks")}
                />
                <OfficeMetric
                  label="확인할 업무"
                  value={attentionTasks.length}
                  unit="건"
                  detail="검토·승인·도움 요청"
                  icon={Inbox}
                  tone="attention"
                  onClick={() => {
                    setObserve(false);
                    requestAnimationFrame(() =>
                      document.getElementById("office-inbox")?.focus(),
                    );
                  }}
                />
                <OfficeMetric
                  label="완료로 기록된 업무"
                  value={s.tasks.filter((t) => t.status === "completed").length}
                  unit="건"
                  detail="업무 완료 기록 · 단계별 검증과 별개"
                  icon={CircleCheck}
                  tone="complete"
                  onClick={() => changeView("performance")}
                />
              </div>
              <div className="office-connection-bar">
                <span className="connection-reading">
                  <span className={`live-dot ${connected ? "" : "offline"}`} />
                  {connected ? "실시간 기록 연결" : "마지막 저장 기록"}
                </span>
                <span>
                  <Cable size={14} />
                  업무를 받을 준비 기록 {readyEmployees}/{s.employees.length}명 · 실제 작업 성공은 별도 확인
                </span>
                <button onClick={() => changeView("settings")}>
                  <Pause size={13} />
                  {s.settings.dispatchPaused
                    ? "사무실 업무 배정 일시정지"
                    : "사무실 업무 배정 허용"}
                  <ArrowUpRight size={13} />
                </button>
              </div>
              <section className="dashboard-observations" data-dashboard-observations aria-label="독립 채널 관측 상태">
                <h3>연결과 작업 상태를 따로 확인해요</h3>
                <p>기록 연결·업무 준비·직원 움직임은 AI 응답이나 Telegram 메시지 송수신 성공을 뜻하지 않습니다. 근거가 없으면 실패가 아닌 확인 필요로 표시합니다.</p>
                <p className="dashboard-response-time">화면용 정보를 만든 시각: {responseTime(s)} · 실제 작업 시각이 아닙니다. 새로고침만으로 작업 근거가 새로 확인되지는 않습니다.</p>
                <div className="dashboard-people" role="region" aria-label="직원별 관측 근거" tabIndex={0}>
                  {s.employees.map(e => (
                    <ObservationDisclosure key={e.id} employee={e} now={clock} />
                  ))}
                </div>
                {!s.employees.length && <p>표시할 직원이 없습니다. 서비스 성공·실패를 추정하지 않습니다.</p>}
              </section>
              <div className="office-columns">
                <section className="floor-panel">
                  <div className="section-heading">
                    <div>
                      <h3>
                        <span className="section-index">01</span>우리의 사무실
                      </h3>
                      <p>직원을 선택하면 업무와 보유 역량을 볼 수 있어요.</p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setObserve(!observe)}
                      aria-pressed={observe}
                    >
                      {observe ? (
                        <Minimize2 size={14} />
                      ) : (
                        <Maximize2 size={14} />
                      )}
                      {observe ? "크게 보기 닫기" : "사무실 크게 보기"}
                    </button>
                  </div>
                  <div className="floor-tools">
                    <div className="floor-tabs">
                      {Array.from(
                        {
                          length: Math.max(
                            1,
                            Math.ceil(
                              Math.max(
                                s.employees.length,
                                ...s.employees.map((e) => e.seat + 1),
                                ...s.rooms.map((r) => (r.floor + 1) * 25),
                              ) / 25,
                            ),
                          ),
                        },
                        (_, i) => (
                          <button
                            key={i}
                            className={floor === i ? "active" : ""}
                            aria-pressed={floor === i}
                            onClick={() => setFloor(i)}
                          >
                            {i + 1}F
                          </button>
                        ),
                      )}
                    </div>
                    <span>
                      <span className="live-dot" />
                      작업 중 <span className="legend-idle" />
                      대기
                    </span>
                  </div>
                  <OfficeScene
                    state={s}
                    floor={floor}
                    busy={busy}
                    act={act}
                    now={clock}
                    openEmployee={(id) => open("employee", id)}
                    scan={() => void scan()}
                    discovering={discovering}
                  />
                </section>
                <aside className="office-feed">
                  <section id="office-inbox" tabIndex={-1}>
                    <div className="section-heading">
                      <h3>
                        <Inbox size={17} />
                        대표 확인함
                      </h3>
                      <span className="count">{attentionTasks.length}</span>
                    </div>
                    {attentionTasks.slice(0, 3).map(item => (
                      <button className="task-row dashboard-attention-row" key={item.task.id} onClick={() => open("task", item.task.id)}>
                        <div>
                          <strong>{item.task.title}</strong>
                          <DecisionGuidance task={item.task} />
                          <p>{item.reasons.join(" · ")}</p>
                          <p>{employee(item.task.employeeId)?.name || "담당 미지정"} · {item.waiting} (마지막 기록 수정 이후)</p>
                          <p>다음 행동: {item.nextAction}</p>
                          <p>{item.task.nextAction?.trim() ? "위 다음 행동은 업무에 저장된 내용입니다." : "다음 행동이 기록되지 않아 확인 순서만 안내합니다."}</p>
                          <small>{item.evidenceLabel}</small>
                        </div>
                        <Badge value={taskDisplayStatus(item.task)} />
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                    {!attentionTasks.length && (
                      <div className="quiet">
                        <span>
                          <CircleCheck size={23} />
                        </span>
                        <strong>지금 확인할 일이 없어요</strong>
                        <p>검토·승인·도움 요청과 완료 근거 확인 안내가 여기에 모입니다.</p>
                      </div>
                    )}
                    {attentionTasks.length > 0 && (
                      <button
                        className="panel-link"
                        onClick={() => changeView("tasks")}
                      >
                        업무 보드에서 전체 보기
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </section>
                  <section>
                    <div className="section-heading">
                      <h3>최근 저장된 소식</h3>
                      <Radio size={16} />
                    </div>
                    <div
                      className="activity-list"
                      tabIndex={0}
                      role="region"
                      aria-label="최근 사무실 소식"
                    >
                      {shownActivity.map((e) => (
                        <div className="activity" key={e.id}>
                          <span
                            className={`activity-dot ${e.taskId ? "has-task" : ""}`}
                          />
                          <div>
                            <p>{e.summary}</p>
                            <small>{when(e.at)}</small>
                          </div>
                        </div>
                      ))}
                      {!s.events.length && (
                        <p className="muted">
                          불러온 소식이 없습니다. 이곳에는 실제 실행 외의 기록 변경도 표시됩니다.
                        </p>
                      )}
                    </div>
                    <button
                      className="panel-link"
                      onClick={() => changeView("records")}
                    >
                      기록 보관함 열기
                      <ArrowRight size={14} />
                    </button>
                  </section>
                </aside>
              </div>
            </>
          )}
          {view === "employees" && (
            <>
              <div className="view-heading">
                <div>
                  <h2>함께하는 직원 {s.employees.length}명</h2>
                  <p>직원의 담당 업무와 소속을 보고, 연결 정보를 확인하세요. 직원을 선택하면 수집된 업무 방법과 도구를 살펴볼 수 있습니다.</p>
                </div>
                <button
                  className="secondary"
                  onClick={() => open("department")}
                >
                  부서 만들기
                </button>
              </div>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="직원 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름, 직책, 텔레그램 이름 검색"
                />
              </label>
              <div className="department-chips">
                {s.departments.map((d) => (
                  <button key={d.id} onClick={() => open("department", d.id)}>
                    {d.name}{" "}
                    <small>
                      {
                        s.employees.filter((e) => e.departmentId === d.id)
                          .length
                      }
                    </small>
                  </button>
                ))}
              </div>
              <div className="employee-grid">
                {employees.map((e) => (
                  <button
                    className="employee-card"
                    key={e.id}
                    onClick={() => open("employee", e.id)}
                  >
                    <Avatar e={e} />
                    <div>
                      <h3>{e.name}</h3>
                      <p>
                        {department(e.departmentId)} ·{" "}
                        {e.title || "직책 미지정"}
                      </p>
                      <small>
                        {e.model || "모델 미확인"} ·{" "}
                        {e.profile || "프로필 미확인"}
                      </small>
                    </div>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
              {!employees.length && (
                <Empty
                  title="아직 표시할 직원이 없어요"
                  detail="봇 정보 확인으로 연결된 직원을 찾거나 검색어를 바꿔보세요."
                />
              )}
            </>
          )}
          {view === "tasks" && (
            <>
              <div className="view-heading">
                <div>
                  <h2>업무의 시작부터 결과까지</h2>
                  <p>
                    담당자와 다음 행동을 먼저 확인하세요. 열은 저장된 상태로 나누며, 답변 대기는 진행 기록 열에 포함됩니다. 업무 등록은 실행 시작이나 성공을 뜻하지 않습니다.
                  </p>
                </div>
              </div>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="업무 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="업무 제목 검색"
                />
              </label>
              <div className="kanban">
                {[
                  ["queued", "실행 대기"],
                  ["running", "진행 기록"],
                  ["review", "결과 확인"],
                  ["approval", "최종 결정"],
                  ["completed", "완료 기록"],
                  ["other", "도움·중지"],
                ].map(([status, label]) => (
                  <section key={status}>
                    <h3>
                      {label}
                      <small>
                        {
                          s.tasks.filter(
                            (t) =>
                              (status === "other"
                                ? ![
                                    "queued",
                                    "running",
                                    "review",
                                    "approval",
                                    "completed",
                                  ].includes(t.status)
                                : t.status === status) &&
                              t.title.includes(query),
                          ).length
                        }
                      </small>
                    </h3>
                    {s.tasks
                      .filter(
                        (t) =>
                          (status === "other"
                            ? ![
                                "queued",
                                "running",
                                "review",
                                "approval",
                                "completed",
                              ].includes(t.status)
                            : t.status === status) && t.title.includes(query),
                      )
                      .map((t) => (
                        <button
                          className="work-card"
                          key={t.id}
                          onClick={() => open("task", t.id)}
                        >
                          <Badge value={taskDisplayStatus(t)} />
                          <strong>{t.title}</strong>
                          <p>{t.summary || t.request}</p>
                          <TaskFacts task={t} owner={employee(t.employeeId)?.name || "담당 미지정"} />
                        </button>
                      ))}
                  </section>
                ))}
              </div>
              {!s.tasks.length && (
                <Empty
                  title="첫 업무를 등록하세요"
                  detail="목표, 담당 직원, 완료 조건을 정하면 업무 기록을 시작할 수 있습니다."
                />
              )}
            </>
          )}
          {view === "projects" && (
            <>
              <div className="view-heading">
                <div>
                  <h2>여러 직원이 함께할 일을 관리하세요</h2>
                  <p>
                    목표와 담당자, 먼저 필요한 결과를 확인하세요. 계획 초안 만들기와 실제 업무 등록은 별도 단계입니다.
                  </p>
                </div>
              </div>
              <div className="project-grid">
                {s.projects.map((p) => (
                  <section className="panel" key={p.id}>
                    <span className="eyebrow">프로젝트</span>
                    <h3>{p.name}</h3>
                    <p>{p.goal}</p>
                    <small>
                      책임자 {employee(p.ownerId)?.name || "미지정"}
                    </small>
                    <div className="project-progress">
                      <span
                        style={{
                          width: `${s.tasks.filter((t) => t.projectId === p.id).length ? (s.tasks.filter((t) => t.projectId === p.id && t.status === "completed").length / s.tasks.filter((t) => t.projectId === p.id).length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <p>
                      {
                        s.tasks.filter(
                          (t) =>
                            t.projectId === p.id && t.status === "completed",
                        ).length
                      }{" "}
                      / {s.tasks.filter((t) => t.projectId === p.id).length}개
                      업무가 완료로 기록됨 — 실제 반영 여부는 각 업무에서 확인
                    </p>
                    {s.tasks.filter((t) => t.projectId === p.id).map(taskRow)}
                    <button
                      className="secondary"
                      onClick={() => open("task-new", p.id)}
                    >
                      <Plus size={14} /> 연결 업무 등록
                    </button>
                  </section>
                ))}
              </div>
              {!s.projects.length && (
                <Empty
                  title="첫 프로젝트를 시작하세요"
                  detail="공동 목표와 책임자를 정하고 여러 직원의 업무를 연결합니다."
                />
              )}
              <WorkflowCenter state={s} act={act} busy={busy} />
            </>
          )}
          {view === "records" && (
            <>
              <div className="view-heading">
                <div>
                  <h2>누구나 이해하는 회사 기록</h2>
                  <p>
                    무엇을 했고, 무엇이 나왔고, 다음에 무엇을 해야 하는지
                    남깁니다.
                  </p>
                </div>
                <a className="secondary" href="/api/export">
                  <Download size={15} /> 보고서 내보내기
                </a>
              </div>
              <div className="panel">
                {s.records.map(recordRow)}
                {!s.records.length && (
                  <Empty
                    title="아직 남긴 기록이 없어요"
                    detail="회의, 개선 의견과 지식을 근거와 함께 기록하세요."
                  />
                )}
              </div>
              <h3 className="subheading">저장된 활동·변경 기록</h3>
              <AuditLog revision={s.revision} />
            </>
          )}
          {view === "performance" && (
            <>
              <div className="view-heading">
                <div>
                  <h2>성과는 결과와 근거로</h2>
                  <p>
                    메시지 수로 순위를 만들지 않습니다. 완료된 업무와 실제
                    기여를 확인하세요.
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>직원</th>
                      <th>진행 상태 기록</th>
                      <th>완료 기록</th>
                      <th>결과 확인·최종 결정</th>
                      <th>포상 기록</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.employees.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => open("employee", e.id)}
                          >
                            {e.name}
                          </button>
                        </td>
                        <td>
                          {
                            s.tasks.filter(
                              (t) =>
                                t.employeeId === e.id && t.status === "running",
                            ).length
                          }
                        </td>
                        <td>
                          {
                            s.tasks.filter(
                              (t) =>
                                t.employeeId === e.id &&
                                t.status === "completed",
                            ).length
                          }
                        </td>
                        <td>
                          {
                            s.tasks.filter(
                              (t) =>
                                t.employeeId === e.id &&
                                ["review", "approval"].includes(t.status),
                            ).length
                          }
                        </td>
                        <td>
                          {
                            s.records.filter(
                              (r) =>
                                r.employeeId === e.id && r.kind === "award",
                            ).length
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="subheading">칭찬과 개선</h3>
              <div className="panel">
                {s.records
                  .filter((r) => ["award", "feedback"].includes(r.kind))
                  .map(recordRow)}
                {!s.records.some((r) =>
                  ["award", "feedback"].includes(r.kind),
                ) && (
                  <Empty
                    title="근거 있는 칭찬을 남겨보세요"
                    detail="완료 업무를 연결해 포상하거나 구체적인 개선 요구를 기록합니다."
                  />
                )}
              </div>
              <PerformanceDetails state={s} />
            </>
          )}
          {view === "education" && (
            <>
              <div className="view-heading">
                <div>
                  <h2>업무 방법을 기록하고 실제 결과로 확인하세요</h2>
                  <p>
                    교육 내용을 기록하고 연습 결과와 근거를 확인하세요. 모델을 재훈련하거나 도구 권한을 바꾸는 기능은 아닙니다.
                  </p>
                </div>
              </div>
              <div className="education-path">
                <span>학습 후보</span>
                <span>연습·검토</span>
                <span>근거 확인</span>
                <span>검증된 지식</span>
              </div>
              <div className="panel">
                {s.records
                  .filter((r) => ["education", "knowledge"].includes(r.kind))
                  .map(recordRow)}
                {!s.records.some((r) =>
                  ["education", "knowledge"].includes(r.kind),
                ) && (
                  <Empty
                    title="첫 교육이나 학습 후보를 등록하세요"
                    detail="목표, 교육 자료와 검증 방법을 적고 실제 결과를 근거로 남깁니다."
                  />
                )}
              </div>
              <TrainingCenter state={s} act={act} busy={busy} />
            </>
          )}
          {view === "settings" && (
            <>
              <div className="view-heading">
                <div>
                  <h2>회사 운영 기준</h2>
                  <p>직원 수와 실제 동시 실행 수는 따로 관리합니다.</p>
                </div>
              </div>
              <form
                className="panel settings-form"
                onSubmit={formSubmit("settings.update")}
              >
                <Field label="회사 이름">
                  <input
                    name="companyName"
                    required
                    defaultValue={s.settings.companyName}
                  />
                </Field>
                <Field label="동시에 맡길 업무 수 (1~100)">
                  <input
                    name="maxConcurrent"
                    type="number"
                    min="1"
                    max="100"
                    required
                    defaultValue={s.settings.maxConcurrent}
                  />
                </Field>
                <p className="muted">
                  한도는 업무 배정 기준입니다. 연결된 실행 환경에서도 제한을
                  적용해야 합니다.
                </p>
                <button className="primary" disabled={busy}>
                  설정 저장
                </button>
              </form>
              <h3 className="subheading">실행 환경</h3>
              <div className="panel">
                {s.hosts.map((h) => (
                  <div className="event-row" key={h.id}>
                    <Monitor size={20} />
                    <div>
                      <strong>{h.name}</strong>
                      <p>
                        마지막 확인 {when(h.lastSeen)} ·{" "}
                        {hostStatus(h.lastSeen)}
                      </p>
                    </div>
                  </div>
                ))}
                {!s.hosts.length && (
                  <p className="muted">
                    아직 확인된 PC·서버가 없습니다. 봇 정보 확인으로 시작하세요.
                  </p>
                )}
              </div>
              <ExecutionSettings state={s} act={act} busy={busy} now={clock} />
            </>
          )}
        </div>
        <footer className="page-footer">
          AI 직원 사무실{" "}
          <span>저장된 상태와 실제 활동은 구분해 확인하세요 · 기록 버전 {s.revision}</span>
        </footer>
      </main>
      {modal && (
        <Modal
          title={
            modal === "employee"
              ? "직원 상세"
              : modal === "task"
                ? "업무 상세"
                : modal === "department"
                  ? "부서 설정"
                  : modal === "project"
                    ? "프로젝트 만들기"
                    : modal === "task-new"
                      ? "업무 등록"
                      : modal === "record"
                        ? "기록 상세"
                        : "회사 기록 남기기"
          }
          close={close}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {modal === "employee" && chosenEmployee && (
            <>
              <div className="employee-profile">
                <Avatar e={chosenEmployee} />
                <div>
                  <h3>{chosenEmployee.name}</h3>
                  <p>
                    @{chosenEmployee.username || "미확인"} · 봇{" "}
                    {chosenEmployee.botId}
                  </p>
                  <Badge value={chosenEmployee.status} />
                </div>
              </div>
              <form
                onSubmit={formSubmit("employee.update", {
                  id: chosenEmployee.id,
                  revision: chosenEmployee.revision,
                })}
              >
                <div className="form-grid">
                  <Field label="직원 이름">
                    <input
                      name="name"
                      required
                      defaultValue={chosenEmployee.name}
                    />
                  </Field>
                  <Field label="직책">
                    <input name="title" defaultValue={chosenEmployee.title} />
                  </Field>
                  <Field label="부서">
                    <select
                      name="departmentId"
                      defaultValue={chosenEmployee.departmentId}
                    >
                      <option value="">소속 미지정</option>
                      {s.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="보고 대상">
                    <select
                      name="managerId"
                      defaultValue={chosenEmployee.managerId}
                    >
                      <option value="">없음</option>
                      {s.employees
                        .filter((e) => e.id !== chosenEmployee.id)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="캐릭터">
                    <select
                      name="character"
                      defaultValue={characterName(chosenEmployee.character)}
                    >
                      <option value="person">사람</option>
                      <option value="robot">로봇</option>
                      <option value="cat">고양이</option>
                      <option value="mascot">마스코트</option>
                    </select>
                  </Field>
                  <Field label="캐릭터 소품">
                    <select
                      name="accessory"
                      defaultValue={chosenEmployee.accessory || "none"}
                    >
                      <option value="none">없음</option>
                      <option value="glasses">안경</option>
                      <option value="headset">헤드셋</option>
                      <option value="tie">넥타이</option>
                    </select>
                  </Field>
                  <Field label="대표 색상">
                    <input
                      type="color"
                      name="color"
                      defaultValue={chosenEmployee.color || "#287d70"}
                    />
                  </Field>
                  <Field label="좌석 번호 (1~100)">
                    <input
                      name="seat"
                      type="number"
                      min="1"
                      max="100"
                      defaultValue={chosenEmployee.seat + 1}
                    />
                  </Field>
                  <Field label="명부 상태 · 지금 작업 중인지와는 다릅니다">
                    <select name="status" defaultValue={chosenEmployee.status}>
                      <option value="active">명부에서 사용</option>
                      <option value="inactive">명부에서 사용 중지</option>
                    </select>
                  </Field>
                </div>
                <button className="primary" disabled={busy}>
                  직원 정보 저장
                </button>
              </form>
              <details>
                <summary>기술 상세 · 모델과 실행 위치</summary>
                <dl>
                  <dt>모델</dt>
                  <dd>{chosenEmployee.model || "미확인"}</dd>
                  <dt>프로필</dt>
                  <dd>{chosenEmployee.profile || "미확인"}</dd>
                  <dt>실행 위치</dt>
                  <dd>
                    {s.hosts.find((h) => h.id === chosenEmployee.hostId)
                      ?.name ||
                      chosenEmployee.hostId ||
                      "미확인"}
                  </dd>
                  <dt>기록 관찰 연결</dt>
                  <dd>
                    {hostStatus(
                      s.hosts.find((h) => h.id === chosenEmployee.hostId)
                        ?.lastSeen || "",
                    )}
                  </dd>
                  <dt>마지막 명부 확인 · 실제 작업 시각과 다를 수 있음</dt>
                  <dd>{when(chosenEmployee.lastSeen)}</dd>
                </dl>
              </details>
              {[
                ["업무 방법과 도구 — 수집된 항목", chosenEmployee.capabilities],
                ["수집된 업무 지침과 출처 — 현재 적용 여부는 별도 확인", chosenEmployee.instructions],
              ].map(([title, items]) => (
                <details key={title as string}>
                  <summary>
                    {title as string} (
                    {(items as Employee["capabilities"]).length})
                  </summary>
                  <p className="muted">수집된 항목 수이며 전체 설치 목록을 보장하지 않습니다. 설치·사용 가능·현재 사용은 서로 다릅니다.</p>
                  {(items as Employee["capabilities"]).map((c, i) => (
                    <CapabilityDetails key={`${c.name}-${i}`} item={c} />
                  ))}
                  {!(items as Employee["capabilities"]).length && (
                    <p className="muted">
                      수집된 정보가 없습니다. 설치·사용 가능·실행 검증을
                      구분하여 표시합니다.
                    </p>
                  )}
                </details>
              ))}
              <details>
                <summary>이 사무실에서 업무를 받을 준비</summary>
                <p>
                  {chosenEmployee.runtime?.status === "ready" &&
                  clock >= Date.parse(chosenEmployee.runtime.lastSeen) &&
                  clock - Date.parse(chosenEmployee.runtime.lastSeen) < 45000
                    ? "실행 준비 기록 있음 · 모델·Telegram 성공과 별개"
                    : "실행 준비 미확인"}
                </p>
                <p>
                  {chosenEmployee.runtime?.summary ||
                    "명부 관찰과 실제 실행 준비는 다릅니다."}
                </p>
              </details>
              <details className="dashboard-observations">
                <summary>연결과 작업 상태의 확인 근거</summary>
                <ObservationDetails employee={chosenEmployee} now={clock} />
              </details>
              <h3 className="subheading">관련 업무</h3>
              {s.tasks
                .filter(
                  (t) =>
                    t.employeeId === chosenEmployee.id ||
                    t.participants.includes(chosenEmployee.id),
                )
                .map(taskRow)}
              <h3 className="subheading">포상·교육·개선 기록</h3>
              {s.records
                .filter((r) => r.employeeId === chosenEmployee.id)
                .map(recordRow)}
            </>
          )}
          {modal === "department" && (
            <form
              onSubmit={formSubmit(
                "department.save",
                selected ? { id: selected } : {},
              )}
            >
              <Field label="부서 이름">
                <input
                  name="name"
                  required
                  defaultValue={
                    s.departments.find((d) => d.id === selected)?.name
                  }
                />
              </Field>
              <Field label="담당 업무">
                <textarea
                  name="description"
                  defaultValue={
                    s.departments.find((d) => d.id === selected)?.description
                  }
                />
              </Field>
              <button className="primary" disabled={busy}>
                부서 저장
              </button>
            </form>
          )}
          {modal === "project" && (
            <form onSubmit={formSubmit("project.create")}>
              <Field label="프로젝트 이름">
                <input name="name" required />
              </Field>
              <Field label="공동 목표">
                <textarea name="goal" required />
              </Field>
              <Field label="책임자">
                <select name="ownerId" required>
                  {employeeOptions}
                </select>
              </Field>
              <button
                className="primary"
                disabled={busy || !s.employees.length}
              >
                프로젝트 만들기
              </button>
            </form>
          )}
          {modal === "task-new" && (
            <form onSubmit={formSubmit("task.create")}>
              <p className="inline-note">
                업무를 등록해도 바로 시작한 것은 아닙니다. 실제 실행을 연결하는 프로그램의 시작 확인이 필요합니다.
              </p>
              <Field label="업무 제목">
                <input name="title" required />
              </Field>
              <Field label="요청 내용">
                <textarea
                  name="request"
                  required
                  defaultValue={
                    handoffTask
                      ? `${handoffTask.title}의 결과를 인계받아 후속 업무를 수행합니다.\n다음 담당자가 할 일을 작성해주세요.`
                      : ""
                  }
                />
              </Field>
              <Field label="완료 조건">
                <textarea
                  name="criteria"
                  required
                  placeholder="어떤 결과가 나오면 완료인가요?"
                />
              </Field>
              <div className="form-grid">
                <Field label="담당 직원">
                  <select name="employeeId" required>
                    {employeeOptions}
                  </select>
                </Field>
                <Field label="프로젝트">
                  <select name="projectId" defaultValue={selected}>
                    <option value="">없음</option>
                    {s.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="기한 (선택)">
                <input type="datetime-local" name="dueAt" />
              </Field>
              <details>
                <summary>함께할 직원·먼저 끝나야 하는 일</summary>
                <p className="muted">
                  선행 업무가 끝나야 다음 작업을 진행할 수 있습니다.
                </p>
                <fieldset>
                  <legend>협업 직원</legend>
                  {s.employees.map((e) => (
                    <label className="check" key={e.id}>
                      <input type="checkbox" name="participants" value={e.id} />
                      {e.name}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>선행 업무</legend>
                  {s.tasks.map((t) => (
                    <label className="check" key={t.id}>
                      <input
                        type="checkbox"
                        name="dependencies"
                        value={t.id}
                        defaultChecked={handoffTask?.id === t.id}
                      />
                      {t.title}
                    </label>
                  ))}
                </fieldset>
              </details>
              <button
                className="primary"
                disabled={busy || !s.employees.length}
              >
                업무 등록
              </button>
            </form>
          )}
          {modal === "task" && chosenTask && (
            <>
              <div className="task-title">
                {latestTask ? <>
                <Badge value={taskDisplayStatus(latestTask)} />
                <h3>{latestTask.title}</h3>
                <p>{latestTask.request}</p>
                <TaskFacts task={latestTask} owner={employee(latestTask.employeeId)?.name || "담당 미지정"} />
                {awaitingReply(latestTask) && (
                  <p role="status">
                    Telegram의 해당 봇에서 실제 질문을 확인하고 답하세요. 답변 뒤 재개 여부는 별도로 확인해야 합니다.
                  </p>
                )}
                <small>
                  {employee(latestTask.employeeId)?.name} ·{" "}
                  {when(latestTask.createdAt)} · {latestTask.source}
                </small>
                </> : <p role="status">최신 목록에서 이 업무를 찾을 수 없어 현재 상태·결과·검토 의견은 확인 불가입니다. 삭제되었거나 최신 정보를 받지 못했을 수 있습니다.</p>}
              </div>
              {latestTask && <DeliveryDetails task={latestTask} now={clock} />}
              <section aria-label="결정과 처리 영향" style={{ overflowWrap: "anywhere" }}>
                <h3>결정 전에 확인하세요</h3>
                {latestTask ? <DecisionGuidance task={latestTask} /> : <p>최신 업무 정보가 없어 지금 필요한 결정과 처리 가능 여부는 확인 불가입니다. 이전 자료를 현재 사실로 판단하지 마세요.</p>}
                {latestTask?.reviewNote && <p>저장된 검토 의견: {latestTask.reviewNote}</p>}
                <p>저장하지 않고 닫아도 진행 중인 업무는 멈추지 않습니다. 닫기는 보류·중지 요청이 아닙니다.</p>
              </section>
              <TaskHistory taskId={selected} currentStatus={s.tasks.find(t => t.id === selected)?.status ?? null} revision={s.revision} connected={connected} />
              <form
                onSubmit={formSubmit("task.update", {
                  id: chosenTask.id,
                  revision: chosenTask.revision,
                })}
              >
                <p className="muted">위의 읽기 전용 요약과 결정 안내는 가장 최근에 받은 동일 업무 정보를 보여줍니다. ‘업무 기록 저장’의 편집 항목은 창을 열 때의 기록과 작성 중인 입력을 유지합니다. 새 정보가 도착해도 이 입력과 저장 기준 버전은 자동으로 바뀌지 않습니다. 저장 시 충돌 여부와 실제 저장 결과를 확인하세요.</p>
                <Field label="업무 상태">
                  <select name="status" defaultValue={chosenTask.status}>
                    {Array.from(
                      new Set([
                        chosenTask.status,
                        ...(transitions[chosenTask.status] || []),
                      ]),
                    ).map((status) => (
                      <option key={status} value={status}>
                        {pretty(status)}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="muted">
                  실행 기록과 저장한 업무 상태를 구분해 확인하세요. 완료 전에는 결과와 완료 조건을 비교해야 합니다. 상태 저장은 배포나 서비스 성공 확인이 아닙니다.
                </p>
                <p className="inline-note">
                  결과 확인 대기 또는 실행 실패 기록에서 실행 대기로 바꾸고 ‘업무 기록 저장’을 누르면 현재 결과·품질 점수·검토 의견·종료 시각을 비웁니다. 결과 확인 대기에서 다시 보내면 재작업 횟수도 늘어납니다. 실행 조건이 갖춰지면 다시 실행되며 사용량이 발생할 수 있습니다. 아래의 별도 ‘검토 의견과 결정 저장’에서 수정 요청을 선택하는 경로와 다릅니다. 별도 수정 요청은 입력한 점수와 검토 의견을 저장하고, 현재 결과·종료 시각을 비우며 재작업 횟수를 늘려 새 실행을 예약합니다.
                </p>
                <Field label="진행한 일">
                  <textarea name="summary" defaultValue={chosenTask.summary} />
                </Field>
                <Field label="결과물·결과 내용">
                  <textarea name="result" defaultValue={chosenTask.result} />
                </Field>
                <Field label="완료 조건">
                  <textarea
                    name="criteria"
                    required
                    defaultValue={chosenTask.criteria}
                  />
                </Field>
                <Field label="다음에 할 일">
                  <textarea
                    name="nextAction"
                    defaultValue={chosenTask.nextAction}
                  />
                </Field>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    ["completed", "cancelled"].includes(chosenTask.status)
                  }
                >
                  업무 기록 저장
                </button>
              </form>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setHandoffTask(chosenTask);
                  setSelected(chosenTask.projectId);
                  setModal("task-new");
                }}
              >
                다음 직원에게 맡길 업무 작성
              </button>
              {!latestTask && <p className="inline-note">아래 별도 검토 입력이 남아 있어도 이전 자료이며 현재 사실이 아닙니다. 최신 업무 정보는 확인 불가이므로 다시 확인한 뒤 결정하세요.</p>}
              <ReviewTask
                task={s.tasks.find((t) => t.id === chosenTask.id) || chosenTask}
                act={async (action) => {
                  const success = await act(action);
                  if (success) close();
                  return success;
                }}
                busy={busy}
              />
              <details>
                <summary>
                  이전에 제출한 결과와 다시 실행한 기록 (
                  {chosenTask.resultVersions?.length || 0})
                </summary>
                {chosenTask.resultVersions?.map((v, i) => (
                  <div className="capability" key={i}>
                    <strong>
                      {v.attempt}번째 실행 · {when(v.at)}
                    </strong>
                    <p className="preserve-lines">{v.result}</p>
                    <small>
                      수집된 비용{" "}
                      {v.usage.costUsd === null
                        ? "미수집"
                        : `${v.usage.costUsd}`}
                    </small>
                  </div>
                ))}
              </details>
              <details>
                <summary>함께한 직원과 전달받은 결과</summary>
                {chosenTask.dependencyStale && (
                  <p className="inline-note">
                    이 업무에서 사용한 선행 결과가 변경되었습니다. 기존 결과물을
                    검토하고 재작업 필요 여부를 확인하세요.
                  </p>
                )}
                {chosenTask.dependencySnapshots?.map((snapshot, index) => (
                  <details key={index}>
                    <summary>
                      {s.tasks.find((t) => t.id === snapshot.taskId)?.title ||
                        "선행 업무"}{" "}
                      · 사용한 결과 {snapshot.revision}판{" "}
                      {snapshot.stale ? "· 변경됨" : ""}
                    </summary>
                    <p className="muted">
                      {snapshot.attempt}번째 선행 실행 결과를 이 업무의{" "}
                      {snapshot.consumedByAttempt}번째 실행에서 사용했습니다.
                    </p>
                    <p className="preserve-lines">{snapshot.result}</p>
                  </details>
                ))}
                <p>
                  참여 직원:{" "}
                  {chosenTask.participants
                    .map((id) => employee(id)?.name || id)
                    .join(", ") || "없음"}
                </p>
                <p>
                  선행 업무:{" "}
                  {chosenTask.dependencies
                    .map((id) => s.tasks.find((t) => t.id === id)?.title || id)
                    .join(", ") || "없음"}
                </p>
              </details>
            </>
          )}
          {["record-new", "education-new", "award-new"].includes(modal) && (
            <form onSubmit={formSubmit("record.create")}>
              <Field label="기록 종류">
                <select
                  name="kind"
                  defaultValue={
                    modal === "education-new"
                      ? "education"
                      : modal === "award-new"
                        ? "award"
                        : "meeting"
                  }
                >
                  {[
                    "meeting",
                    "award",
                    "feedback",
                    "education",
                    "knowledge",
                  ].map((k) => (
                    <option key={k} value={k}>
                      {pretty(k)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="제목">
                <input name="title" required />
              </Field>
              <Field label="대상 직원 (선택)">
                <select name="employeeId">{employeeOptions}</select>
              </Field>
              <Field label="근거 업무 (포상은 완료 업무 필수)">
                <select name="taskId">
                  <option value="">없음</option>
                  {s.tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} · {pretty(t.status)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="내용·결정·다음 행동">
                <textarea
                  name="content"
                  required
                  placeholder="무엇을 했나요? 무엇을 개선하거나 확인해야 하나요?"
                />
              </Field>
              <Field label="증거·교육 결과">
                <textarea
                  name="evidence"
                  placeholder="결과물 위치, 검토 내용, 재현 결과를 남기세요."
                />
              </Field>
              <button className="primary" disabled={busy}>
                초안 저장
              </button>
            </form>
          )}
          {modal === "record" && chosenRecord && (
            <>
              <div className="task-title">
                <Badge value={chosenRecord.kind} />
                <h3>{chosenRecord.title}</h3>
                <small>
                  {employee(chosenRecord.employeeId)?.name || "회사 공통"} ·{" "}
                  {when(chosenRecord.createdAt)}
                </small>
              </div>
              <form
                onSubmit={formSubmit("record.update", {
                  id: chosenRecord.id,
                  revision: chosenRecord.revision,
                })}
              >
                <Field label="내용·결정·다음 행동">
                  <textarea
                    name="content"
                    required
                    defaultValue={chosenRecord.content}
                  />
                </Field>
                <Field label="검증 근거">
                  <textarea
                    name="evidence"
                    defaultValue={chosenRecord.evidence}
                  />
                </Field>
                <Field label="검토 상태">
                  <select name="status" defaultValue={chosenRecord.status}>
                    {Array.from(
                      new Set([
                        chosenRecord.status,
                        "draft",
                        "candidate",
                        "verified",
                        "completed",
                        "archived",
                      ]),
                    ).map((k) => (
                      <option key={k} value={k}>
                        {pretty(k)}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="muted">
                  교육·지식의 검증과 완료에는 근거가 필요합니다. 지침이나 모델은
                  이 기록만으로 자동 변경되지 않습니다.
                </p>
                <button className="primary" disabled={busy}>
                  기록 저장
                </button>
              </form>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
