import React, { useState } from "react";
import {
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  RotateCcw,
  Users,
  ShieldCheck,
} from "lucide-react";
import type { Action, Snapshot, Task, Workflow, WorkflowStep } from "./types";

type Props = {
  state: Snapshot;
  act: (action: Action) => Promise<boolean>;
  busy: boolean;
};
const employeeName = (state: Snapshot, id: string) =>
  state.employees.find((e) => e.id === id)?.name || "담당 미지정";
const workflowLabels: Record<string, string> = {
  draft: "계획 초안",
  active: "진행 상태로 기록됨",
  completed: "완료로 기록됨",
  cancelled: "취소",
};
function L({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{title}</span>
      {children}
    </label>
  );
}

const taskLabel: Record<string, string> = {
  queued: "실행 대기",
  blocked: "도움 필요 · 이유 확인",
  running: "진행 상태로 기록됨",
  review: "결과 검토",
  approval: "최종 완료 결정 대기",
  completed: "완료로 기록됨",
  failed: "실패",
  cancel_requested: "중지 요청",
  cancelled: "취소",
};
function AIPlanning({ state, act, busy }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("project");
  const [imported, setImported] = useState<string[]>([]);
  const available = state.employees.filter((e) => e.status === "active");
  const plans = state.tasks.filter((t) => t.stage === "planning");
  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="view-heading">
        <div>
          <h3>AI에게 업무 나누기 초안 요청</h3>
          <p>
            직원에게 계획 작성을 맡기고, 결과를 확인한 뒤 편집할 초안으로 가져옵니다. 가져오기와 실제 업무 등록은 별도 단계입니다.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => setOpen(!open)}
        >
          {open ? "AI 요청 닫기" : "AI에게 분담안 요청"}
        </button>
      </div>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            if (
              await act({
                type: "workflow.plan",
                name: d.get("name"),
                goal: d.get("goal"),
                kind: d.get("kind"),
                plannerId: d.get("plannerId"),
                employeeIds: d.getAll("employeeIds"),
              })
            )
              setOpen(false);
          }}
        >
          <div className="form-grid">
            <L title="AI 분담안 이름">
              <input name="name" required maxLength={200} />
            </L>
            <L title="계획할 업무 종류">
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="project">공동 프로젝트</option>
                <option value="meeting">한 차례 회의</option>
              </select>
            </L>
          </div>
          <L title="AI 분담 목표">
            <textarea
              name="goal"
              required
              placeholder="달성할 목표와 결과물, 제약을 적어주세요."
            />
          </L>
          <L title="분담안을 작성할 직원">
            <select name="plannerId" required>
              <option value="">계획 담당 선택</option>
              {available.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </L>
          <fieldset>
            <legend>
              업무에 참여할 직원 ·{" "}
              {kind === "meeting" ? "최대 9명 · 의장 요약 별도" : "최대 10명"}
            </legend>
            <div className="participant-list">
              {available.map((e) => (
                <label className="check" key={e.id}>
                  <input name="employeeIds" type="checkbox" value={e.id} />
                  {e.name}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="inline-note">
            실제 AI 작업이므로 모델 사용량이 발생할 수 있습니다. 현재 실행
            승인·일시정지·횟수 한도를 따릅니다. 결과를 가져와도 다음 업무를 자동
            실행하지 않습니다.
          </p>
          <button className="primary" disabled={busy || !available.length}>
            분담안 작성 업무 등록
          </button>
        </form>
      )}
      {plans.map((task) => (
        <article key={task.id} className="capability">
          <div className="workflow-title">
            <div>
              <strong>{task.title}</strong>
              <p>
                {employeeName(state, task.employeeId)} ·{" "}
                {taskLabel[task.status] || task.status}
              </p>
            </div>
            {task.result &&
              ["review", "approval", "completed"].includes(task.status) && (
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    imported.includes(task.id) ||
                    Boolean(task.planningWorkflowId)
                  }
                  onClick={async () => {
                    if (await act({ type: "workflow.import", taskId: task.id }))
                      setImported((ids) => [...ids, task.id]);
                  }}
                >
                  {imported.includes(task.id) || task.planningWorkflowId
                    ? "가져온 분담안"
                    : "결과를 계획 초안으로 가져오기"}
                </button>
              )}
          </div>
          <p>{task.summary || "계획 진행 설명이 아직 기록되지 않았습니다."}</p>
          {task.result && (
            <details>
              <summary>AI가 작성한 원본 결과</summary>
              <p className="preserve-lines">{task.result}</p>
            </details>
          )}
        </article>
      ))}
    </section>
  );
}

export function WorkflowCenter({ state, act, busy }: Props) {
  const [creating, setCreating] = useState(false),
    [editing, setEditing] = useState<Workflow | null>(null),
    [kind, setKind] = useState("project");
  const [ordered, setOrdered] = useState<string[]>([]);
  const available = state.employees.filter((e) => e.status === "active");
  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (await act({ type: "workflow.create", ...data, employeeIds: ordered })) {
      setCreating(false);
      setOrdered([]);
    }
  };
  const changeStep = (
    id: string,
    key: keyof WorkflowStep,
    value: string | string[],
  ) =>
    setEditing((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step) =>
              step.id === id ? { ...step, [key]: value } : step,
            ),
          }
        : null,
    );
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      editing &&
      (await act({
        type: "workflow.update",
        id: editing.id,
        revision: editing.revision,
        steps: editing.steps,
      }))
    )
      setEditing(null);
  };
  return (
    <section className="company-feature">
      <div className="view-heading">
        <div>
          <h2>함께 일할 순서와 회의 계획</h2>
          <p>정해진 틀로 초안을 만들고 직접 확인한 뒤 업무 대기열에 등록합니다.</p>
        </div>
        <button className="primary" onClick={() => setCreating(!creating)}>
          <Plus size={15} />
          {creating ? "입력 닫기" : "협업 계획 만들기"}
        </button>
      </div>
      <AIPlanning state={state} act={act} busy={busy} />
      {creating && (
        <form className="panel workflow-create" onSubmit={create}>
          <div className="form-grid">
            <L title="계획 이름">
              <input name="name" required maxLength={200} />
            </L>
            <L title="진행 방식">
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="project">공동 프로젝트</option>
                <option value="meeting">한 차례 의견 수렴 + 의장 요약</option>
              </select>
            </L>
          </div>
          <L title="함께 달성할 목표">
            <textarea name="goal" required />
          </L>
          <L title="기본 계획 틀">
            <select
              name="template"
              key={kind}
              defaultValue={kind === "meeting" ? "meeting" : "research"}
            >
              {kind === "meeting" ? (
                <option value="meeting">참여자 의견 → 의장 요약</option>
              ) : (
                <>
                  <option value="research">조사 → 기획 → 검토</option>
                  <option value="delivery">자료 준비 → 제작 → 검토</option>
                  <option value="development">요구사항 → 구현 → 검증</option>
                </>
              )}
            </select>
          </L>
          <fieldset>
            <legend>참여 직원 · 선택한 순서대로 역할 배정</legend>
            <div className="participant-list">
              {available.map((employee) => (
                <label className="check" key={employee.id}>
                  <input
                    type="checkbox"
                    checked={ordered.includes(employee.id)}
                    onChange={(e) =>
                      setOrdered((ids) =>
                        e.target.checked
                          ? [...ids, employee.id]
                          : ids.filter((id) => id !== employee.id),
                      )
                    }
                  />
                  {employee.name}
                  {ordered.includes(employee.id) && (
                    <span className="order-number">
                      {ordered.indexOf(employee.id) + 1}
                    </span>
                  )}
                </label>
              ))}
            </div>
            {!available.length && (
              <p className="muted">명부에서 사용하도록 등록된 직원을 먼저 확인하세요.</p>
            )}
          </fieldset>
          {ordered.length > 0 && (
            <ol className="ordered-team">
              {ordered.map((id, index) => (
                <li key={id}>
                  <span>{employeeName(state, id)}</span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={index === 0}
                    onClick={() =>
                      setOrdered((ids) => {
                        const next = [...ids];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        return next;
                      })
                    }
                  >
                    앞으로
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="inline-note">
            {kind === "meeting"
              ? "회의는 최대 10명의 의견과 의장 요약 1회로 끝납니다. 반복 대화를 자동으로 이어가지 않습니다."
              : "계획은 최대 20단계입니다. 실제 결과가 생긴 선행 단계만 다음 업무로 인계됩니다."}{" "}
            생성 뒤 담당자와 완료 조건을 수정할 수 있습니다.
          </p>
          <button
            className="primary"
            disabled={
              busy ||
              !ordered.length ||
              ordered.length > (kind === "meeting" ? 10 : 20)
            }
          >
            검토할 계획 초안 만들기
          </button>
        </form>
      )}
      {editing && (
        <form className="panel workflow-editor" onSubmit={save}>
          <div className="section-heading">
            <h3>{editing.name} · 단계 편집</h3>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(null)}
            >
              닫기
            </button>
          </div>
          <p className="muted">
            변경은 저장 후 반영됩니다. 동시에 변경된 계획은 다시 열어
            확인하세요.
          </p>
          {editing.steps.map((step, index) => (
            <fieldset className="workflow-step" key={step.id}>
              <legend>{index + 1}단계</legend>
              <div className="form-grid">
                <L title="단계 제목">
                  <input
                    required
                    value={step.title}
                    onChange={(e) =>
                      changeStep(step.id, "title", e.target.value)
                    }
                  />
                </L>
                <L title="담당 직원">
                  <select
                    required
                    value={step.employeeId}
                    onChange={(e) =>
                      changeStep(step.id, "employeeId", e.target.value)
                    }
                  >
                    <option value="">직원 선택</option>
                    {available.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </L>
              </div>
              <L title="역할">
                {editing.kind === "meeting" ? (
                  <select
                    value={step.stage}
                    onChange={(e) =>
                      changeStep(step.id, "stage", e.target.value)
                    }
                  >
                    <option value="discussion">참여자 의견</option>
                    <option value="chair">의장 요약</option>
                  </select>
                ) : (
                  <input
                    required
                    value={step.stage}
                    onChange={(e) =>
                      changeStep(step.id, "stage", e.target.value)
                    }
                  />
                )}
              </L>
              <L title="구체적인 지시">
                <textarea
                  required
                  value={step.request}
                  onChange={(e) =>
                    changeStep(step.id, "request", e.target.value)
                  }
                />
              </L>
              <L title="완료 조건">
                <textarea
                  required
                  value={step.criteria}
                  onChange={(e) =>
                    changeStep(step.id, "criteria", e.target.value)
                  }
                />
              </L>
              <fieldset>
                <legend>먼저 결과가 필요한 단계</legend>
                {editing.steps
                  .filter((other) => other.id !== step.id)
                  .map((other) => (
                    <label key={other.id} className="check">
                      <input
                        type="checkbox"
                        checked={step.dependencies.includes(other.id)}
                        onChange={(e) =>
                          changeStep(
                            step.id,
                            "dependencies",
                            e.target.checked
                              ? [...step.dependencies, other.id]
                              : step.dependencies.filter(
                                  (id) => id !== other.id,
                                ),
                          )
                        }
                      />
                      {other.title}
                    </label>
                  ))}
              </fieldset>
              <button
                type="button"
                className="text-button danger-text"
                disabled={editing.steps.length <= 1}
                onClick={() =>
                  setEditing((current) =>
                    current
                      ? {
                          ...current,
                          steps: current.steps
                            .filter((s) => s.id !== step.id)
                            .map((s) => ({
                              ...s,
                              dependencies: s.dependencies.filter(
                                (id) => id !== step.id,
                              ),
                            })),
                        }
                      : null,
                  )
                }
              >
                <Trash2 size={13} /> 단계 제거
              </button>
            </fieldset>
          ))}
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              disabled={
                editing.steps.length >= (editing.kind === "meeting" ? 11 : 20)
              }
              onClick={() =>
                setEditing((current) =>
                  current
                    ? {
                        ...current,
                        steps: [
                          ...current.steps,
                          {
                            id: crypto.randomUUID(),
                            title: "새 단계",
                            request: "",
                            criteria: "",
                            employeeId: available[0]?.id || "",
                            dependencies: [],
                            taskId: "",
                            stage: "실행",
                          },
                        ],
                      }
                    : null,
                )
              }
            >
              <Plus size={14} /> 단계 추가
            </button>
            <button className="primary" disabled={busy}>
              계획 저장
            </button>
          </div>
        </form>
      )}
      <div className="workflow-list">
        {state.workflows.map((workflow) => (
          <article className="panel" key={workflow.id}>
            <div className="workflow-title">
              <div>
                <span className="eyebrow">
                  {workflow.kind === "meeting" ? "회의 계획" : "협업 순서"}
                </span>
                <h3>{workflow.name}</h3>
              </div>
              <span className="badge">
                {workflowLabels[workflow.status] || workflow.status}
              </span>
            </div>
            <p>{workflow.goal}</p>
            <ol className="workflow-track">
              {workflow.steps.map((step) => {
                const task = state.tasks.find((t) => t.id === step.taskId);
                return (
                  <li key={step.id}>
                    <strong>{step.title}</strong>
                    <small>
                      {employeeName(state, step.employeeId)} ·{" "}
                      {step.stage === "chair"
                        ? "의장 요약"
                        : step.stage === "discussion"
                          ? "참여자 의견"
                          : step.stage}
                    </small>
                    <p>{step.criteria}</p>
                    <span className="badge">
                      {task
                        ? {
                            queued: "실행 대기",
                            running: "진행 상태로 기록됨",
                            review: "결과 확인 대기",
                            approval: "최종 완료 결정 대기",
                            completed: "완료로 기록됨",
                            failed: "실패",
                            blocked: "도움 필요",
                            cancelled: "취소",
                            cancel_requested: "중지 요청",
                          }[task.status]
                        : "계획 단계"}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="button-row">
              {workflow.status === "draft" && (
                <>
                  <button
                    className="secondary"
                    onClick={() => setEditing(structuredClone(workflow))}
                  >
                    계획 편집
                  </button>
                  <button
                    className="primary"
                    disabled={busy || editing?.id === workflow.id}
                    onClick={() =>
                      void act({
                        type: "workflow.launch",
                        id: workflow.id,
                        revision: workflow.revision,
                      })
                    }
                  >
                    <Play size={13} /> 계획을 업무 대기열에 등록
                  </button>
                </>
              )}
              {["draft", "active"].includes(workflow.status) && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act({
                      type: "workflow.cancel",
                      id: workflow.id,
                      revision: workflow.revision,
                    })
                  }
                >
                  계획 취소·진행 업무 중지 요청
                </button>
              )}
            </div>
            {workflow.status === "draft" && (
              <p className="muted">
                아직 실행하지 않은 초안입니다. 등록해도 실행 일시정지 상태이면 대기합니다. 실제 실행 조건이 갖춰지면 사용량이 발생할 수 있습니다.
              </p>
            )}
            {["draft", "active"].includes(workflow.status) && <p className="inline-note">계획 취소는 대기 업무를 취소하고 진행 업무에는 중지를 요청합니다. 실제 종료까지 확인한 것은 아닙니다.</p>}
          </article>
        ))}
      </div>
      {!state.workflows.length && !creating && (
        <div className="empty">
          <Users size={28} />
          <h3>함께 완수할 일을 설계하세요</h3>
          <p>
            자료 조사, 제작, 검토를 이어주거나 한 번의 회의를 준비할 수
            있습니다.
          </p>
        </div>
      )}
    </section>
  );
}

export function ReviewTask({
  task,
  act,
  busy,
}: {
  task: Task;
  act: Props["act"];
  busy: boolean;
}) {
  if (!["review", "approval"].includes(task.status) && !(task.status === "completed" && task.dependencyStale)) return null;
  return (
    <section className="review-box">
      <h3>
        <ShieldCheck size={17} /> 결과가 요청대로 나왔는지 확인
      </h3>
      <p className="muted">
        실제 결과와 완료 조건을 비교해 근거를 남기세요. 검토 통과는 최종 완료 결정 단계로 이동하며, 완료·배포가 아닙니다.
      </p>
      <p className="inline-note">수정 요청은 보류가 아닙니다. 현재 결과와 종료 시각을 비우고 재작업 횟수를 늘려 새 실행을 예약합니다. 실행 조건이 갖춰지면 사용량이 발생할 수 있습니다.</p>
      {task.dependencyStale && <p className="inline-note">앞 업무의 결과가 바뀌어 검토 통과가 제한됩니다. 사용한 결과와 최신 결과를 비교하세요.</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          await act({
            type: "task.review",
            id: task.id,
            revision: task.revision,
            qualityScore: Number(d.get("qualityScore")),
            reviewNote: d.get("reviewNote"),
            accepted: d.get("decision") === "accept",
          });
        }}
      >
        <L title="품질 점수 (0~100)">
          <input
            name="qualityScore"
            type="number"
            min="0"
            max="100"
            required
            defaultValue={task.qualityScore ?? ""}
          />
        </L>
        <L title="검토 근거">
          <textarea
            name="reviewNote"
            required
            defaultValue={task.reviewNote || ""}
            placeholder="완료 조건 중 무엇을 충족했고 무엇을 보완해야 하나요?"
          />
        </L>
        <L title="검토 결과">
          <select name="decision" defaultValue={task.dependencyStale ? "rework" : "accept"}>
            <option value="accept" disabled={task.dependencyStale}>검토 통과 · 최종 완료 결정은 다음 단계</option>
            <option value="rework">다시 작업 요청 · 새 실행이 예약됩니다</option>
          </select>
        </L>
        <button className="primary" disabled={busy}>
          검토 의견과 결정 저장
        </button>
      </form>
    </section>
  );
}

export function PerformanceDetails({ state }: Pick<Props, "state">) {
  const completed = state.tasks.filter((t) => t.status === "completed");
  const scored = state.tasks.filter((t) => typeof t.qualityScore === "number");
  const timed = completed.filter(
    (t) =>
      t.dueAt &&
      t.finishedAt &&
      Number.isFinite(Date.parse(t.dueAt)) &&
      Number.isFinite(Date.parse(t.finishedAt!)),
  );
  const onTime = timed.filter(
    (t) => Date.parse(t.finishedAt!) <= Date.parse(t.dueAt),
  );
  const usage = state.tasks.filter(
    (t) =>
      t.usage &&
      ((t.usage.inputTokens ?? 0) > 0 ||
        (t.usage.outputTokens ?? 0) > 0 ||
        t.usage.costUsd !== null),
  );
  const cost = usage.filter((t) => t.usage?.costUsd != null);
  return (
    <section className="company-feature">
      <div className="evidence-metrics">
        {[
          [
            "사람이 남긴 검토 점수",
            scored.length
              ? `${(scored.reduce((n, t) => n + (t.qualityScore ?? 0), 0) / scored.length).toFixed(1)} / 100`
              : "평가 없음",
            `${scored.length}개 업무의 실제 검토 점수`,
          ],
          [
            "기한 준수",
            timed.length ? `${onTime.length} / ${timed.length}건` : "측정 없음",
            "기한과 완료 시각이 모두 있는 업무",
          ],
          [
            "재작업",
            `${state.tasks.reduce((n, t) => n + (t.reworkCount || 0), 0)}회`,
            "검토에서 수정 요청한 횟수",
          ],
          [
            "기록으로 확인된 비용",
            cost.length
              ? `$${cost.reduce((n, t) => n + (t.usage?.costUsd ?? 0), 0).toFixed(4)}`
              : "미수집",
            `${cost.length}개 업무의 기록값 · 전체 비용 추정 아님`,
          ],
        ].map(([label, value, detail]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>

      <h3 className="subheading">직원별 실적과 확인 근거</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>직원</th>
              <th>완료 기록</th>
              <th>진행 기록</th>
              <th>검토 점수</th>
              <th>재작업</th>
              <th>기한 준수</th>
              <th>수집 비용</th>
            </tr>
          </thead>
          <tbody>
            {state.employees.map((employee) => {
              const tasks = state.tasks.filter(
                (t) => t.employeeId === employee.id,
              );
              const done = tasks.filter((t) => t.status === "completed");
              const quality = tasks.filter((t) => t.qualityScore != null);
              const scheduled = done.filter(
                (t) =>
                  t.dueAt &&
                  t.finishedAt &&
                  Number.isFinite(Date.parse(t.dueAt)) &&
                  Number.isFinite(Date.parse(t.finishedAt!)),
              );
              const costs = tasks.filter((t) => t.usage?.costUsd != null);
              return (
                <tr key={employee.id}>
                  <td>{employee.name}</td>
                  <td>{done.length}건</td>
                  <td>
                    {tasks.filter((t) => t.status === "running").length}건
                  </td>
                  <td>
                    {quality.length
                      ? (
                          quality.reduce(
                            (n, t) => n + (t.qualityScore ?? 0),
                            0,
                          ) / quality.length
                        ).toFixed(1)
                      : "미평가"}
                    {quality.length > 0 && <small> · {quality.length}건</small>}
                  </td>
                  <td>
                    {tasks.reduce((n, t) => n + (t.reworkCount || 0), 0)}회
                  </td>
                  <td>
                    {scheduled.length
                      ? scheduled.filter(
                          (t) =>
                            Date.parse(t.finishedAt!) <= Date.parse(t.dueAt),
                        ).length +
                        " / " +
                        scheduled.length
                      : "미측정"}
                  </td>
                  <td>
                    {costs.length
                      ? "$" +
                        costs
                          .reduce((n, t) => n + (t.usage?.costUsd ?? 0), 0)
                          .toFixed(4)
                      : "미수집"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="panel" style={{ marginTop: 16 }}>
        <summary>기록에 근거한 포상·교육 검토 제안</summary>
        <p className="muted">
          완료·품질 80점 이상은 포상 검토, 재작업 기록은 교육 검토 대상으로
          표시하는 규칙 기반 제안입니다. 업무 난이도와 외부 사유는 대표가
          확인하며 인사나 권한은 자동 변경하지 않습니다.
        </p>
        {state.employees.map((employee) => {
          const tasks = state.tasks.filter((t) => t.employeeId === employee.id);
          const good = tasks.filter(
            (t) => t.status === "completed" && (t.qualityScore ?? -1) >= 80,
          );
          const rework = tasks.filter((t) => (t.reworkCount || 0) > 0);
          if (!good.length && !rework.length) return null;
          return (
            <div className="capability" key={employee.id}>
              <strong>{employee.name}</strong>
              {good.length > 0 && (
                <p>
                  포상 검토 근거:{" "}
                  {good
                    .map((t) => t.title + " (품질 " + t.qualityScore + "점)")
                    .join(", ")}
                </p>
              )}
              {rework.length > 0 && (
                <p>
                  교육 검토 근거:{" "}
                  {rework
                    .map(
                      (t) =>
                        t.title +
                        " (재작업 " +
                        t.reworkCount +
                        "회" +
                        (t.reviewNote ? " · " + t.reviewNote : "") +
                        ")",
                    )
                    .join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </details>
      <p className="muted">비용이 미수집인 업무는 0원이 아닙니다. 이 표는 전체 청구액이 아닌 수집된 기록입니다.</p>
      <details>
        <summary>기술 상세 · AI가 처리한 글 조각 수(토큰)</summary>
      <p className="muted">
        수집된 입력량{" "}
        {usage
          .reduce((n, t) => n + (t.usage?.inputTokens || 0), 0)
          .toLocaleString()}{" "}
        · 출력{" "}
        {usage
          .reduce((n, t) => n + (t.usage?.outputTokens || 0), 0)
          .toLocaleString()}{" "}
        · 미수집 작업을 0원으로 평가하지 않습니다.
      </p>
      </details>
      <details className="panel">
        <summary>평가 근거 업무 보기</summary>
        {state.tasks
          .filter(
            (t) =>
              t.qualityScore != null ||
              (t.reworkCount || 0) > 0 ||
              t.usage?.costUsd != null,
          )
          .map((t) => (
            <div className="event-row" key={t.id}>
              <div>
                <strong>{t.title}</strong>
                <p>
                  {employeeName(state, t.employeeId)} · 품질{" "}
                  {t.qualityScore ?? "미평가"} · 재작업 {t.reworkCount || 0}회
                </p>
                <p>{t.reviewNote || "검토 내용 미수집"}</p>
                <small>
                  비용{" "}
                  {t.usage?.costUsd != null ? `$${t.usage.costUsd}` : "미수집"}{" "}
                  · 출처 {t.telemetrySource || "미확인"}
                </small>
              </div>
            </div>
          ))}
      </details>
    </section>
  );
}

function TrainingPractice({ state, act, busy }: Props) {
  const [recordId, setRecordId] = useState("");
  const [message, setMessage] = useState("");
  const records = state.records.filter(
    (r) =>
      ["education", "knowledge"].includes(r.kind) && r.status === "verified",
  );
  const selected = records.find((r) => r.id === recordId);
  return (
    <section className="panel" style={{ margin: "20px 0" }}>
      <h3>검증된 교육으로 실제 실습</h3>
      <p className="muted">
        직원에게 연습 업무를 배정합니다. 실제 결과물은 업무 보드에서 검토하고
        평가하세요.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!selected) return;
          const d = new FormData(e.currentTarget);
          const success = await act({
            type: "task.create",
            employeeId: d.get("employeeId"),
            title: "교육 실습 · " + selected.title,
            request:
              "교육 자료: " +
              selected.title +
              "\n" +
              selected.content +
              "\n\n실습 과제: " +
              d.get("exercise") +
              "\n실제 수행 결과와 확인 근거, 남은 문제를 작성하세요.",
            criteria: d.get("criteria"),
            stage: "education",
          });
          if (success)
            setMessage(
              "실습 업무를 등록했습니다. 실행 설정에 따라 진행하며 업무 보드에서 결과를 검토할 수 있습니다.",
            );
        }}
      >
        <div className="form-grid">
          <L title="실습할 검증 교육">
            <select
              required
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
            >
              <option value="">교육 선택</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </L>
          <L title="실습할 직원">
            <select name="employeeId" required key={recordId}>
              <option value="">직원 선택</option>
              {state.employees
                .filter(
                  (e) =>
                    e.status === "active" &&
                    (!selected?.employeeId || selected.employeeId === e.id),
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </L>
        </div>
        <L title="실습 과제">
          <textarea
            name="exercise"
            required
            placeholder="학습한 내용을 적용해 실제로 수행할 과제를 적어주세요."
          />
        </L>
        <L title="실습 통과 조건">
          <textarea
            name="criteria"
            required
            placeholder="무엇을 확인해야 교육 효과를 검증할 수 있나요?"
          />
        </L>
        <button className="primary" disabled={busy || !selected}>
          연습 업무를 대기열에 등록
        </button>
        <p className="inline-note">실제 AI 연습 업무입니다. 실행 조건에 따라 사용량이 발생할 수 있습니다. 등록만으로 실습이나 교육 효과가 확인되지는 않습니다.</p>
        {message && (
          <p role="status" className="inline-note">
            {message}
          </p>
        )}
      </form>
      <h4 className="subheading">실습 업무 기록</h4>
      {state.tasks
        .filter((t) => t.stage === "education")
        .map((t) => (
          <div className="event-row" key={t.id}>
            <div>
              <strong>{t.title}</strong>
              <p>
                {employeeName(state, t.employeeId)} · {taskLabel[t.status]} ·
                품질 {t.qualityScore ?? "미평가"}
              </p>
              <p>
                {t.reviewNote || t.summary || "실제 수행 결과를 기다립니다."}
              </p>
              {t.result && (
                <details>
                  <summary>실습 결과</summary>
                  <p className="preserve-lines">{t.result}</p>
                </details>
              )}
            </div>
          </div>
        ))}
    </section>
  );
}

export function TrainingCenter({ state, act, busy }: Props) {
  const records = state.records.filter(
    (r) =>
      ["education", "knowledge"].includes(r.kind) && r.status === "verified",
  );
  return (
    <section className="company-feature">
      <div className="view-heading">
        <div>
          <h2>확인한 업무 방법을 다음 업무에 참고로 전달</h2>
          <p>
            선택한 직원의 다음 사무실 업무에 참고 지침으로 전달합니다. 원래 Hermes 지침 파일·모델·도구 권한은 변경하지 않습니다.
          </p>
        </div>
      </div>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          await act({
            type: "training.apply",
            recordId: d.get("recordId"),
            employeeId: d.get("employeeId"),
          });
        }}
      >
        <div className="form-grid">
          <L title="검증된 교육·지식">
            <select name="recordId" required>
              <option value="">기록 선택</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ·{" "}
                  {r.employeeId
                    ? employeeName(state, r.employeeId)
                    : "회사 공통"}
                </option>
              ))}
            </select>
          </L>
          <L title="적용할 직원">
            <select name="employeeId" required>
              <option value="">직원 선택</option>
              {state.employees
                .filter((e) => e.status === "active")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </L>
        </div>
        <button className="primary" disabled={busy || !records.length}>
          <CheckCircle2 size={15} /> 다음 업무에 참고 지침 적용
        </button>
        {!records.length && (
          <p className="muted">
            근거가 있는 교육·지식 기록을 먼저 검증 상태로 저장하세요.
          </p>
        )}
      </form>
      <TrainingPractice state={state} act={act} busy={busy} />
      <h3 className="subheading">적용 버전과 되돌리기</h3>
      {state.training.map((training) => (
        <article className="panel training-entry" key={training.id}>
          <div className="workflow-title">
            <div>
              <h3>
                {employeeName(state, training.employeeId)} · 교육 v
                {training.version}
              </h3>
              <small>
                {state.records.find((r) => r.id === training.recordId)?.title ||
                  "교육 기록"}{" "}
                · {new Date(training.createdAt).toLocaleString("ko-KR")}
              </small>
            </div>
            <span className="badge">
              {training.status === "active" ? "적용 중" : "철회됨"}
            </span>
          </div>
          <p className="preserve-lines">{training.content}</p>
          <details>
            <summary>적용 당시 검증 근거</summary>
            <p className="preserve-lines">{training.evidence}</p>
          </details>
          {training.status === "active" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act({ type: "training.rollback", id: training.id })
              }
            >
              <RotateCcw size={14} /> 다음 업무부터 이 지침 사용 안 함
            </button>
          )}
          <p className="muted">적용 철회는 이후 업무의 참고 사용을 중단합니다. 이미 진행한 업무는 되돌리지 않습니다.</p>
        </article>
      ))}
      {!state.training.length && (
        <p className="muted">아직 직원에게 적용한 교육 버전이 없습니다.</p>
      )}
    </section>
  );
}

export function ExecutionSettings({
  state,
  act,
  busy,
  now,
}: Props & { now: number }) {
  return (
    <section className="company-feature">
      <h3 className="subheading">직원 정보 확인과 새 업무 실행 설정</h3>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          await act({
            type: "settings.update",
            autoDiscover: d.get("autoDiscover") === "on",
            dispatchPaused: d.get("dispatchPaused") === "on",
            discoveryIntervalMinutes: Number(d.get("discoveryIntervalMinutes")),
            dailyRunLimit: Number(d.get("dailyRunLimit")),
            taskTimeoutMinutes: Number(d.get("taskTimeoutMinutes")),
          });
        }}
      >
        <label className="check">
          <input
            name="autoDiscover"
            type="checkbox"
            defaultChecked={state.settings.autoDiscover}
          />
          새 봇 명부 자동 확인
        </label>
        <label className="check">
          <input
            name="dispatchPaused"
            type="checkbox"
            defaultChecked={state.settings.dispatchPaused}
          />
          이 사무실의 새 업무 실행 막기
        </label>
        <p className="inline-note">
          일시정지를 풀면 실행 준비가 된 직원의 대기 업무가 실행되어 사용량이 발생할 수 있습니다. 이 설정은 이미 진행 중인 업무와 Telegram 직접 요청을 멈추지 않습니다. 진행 업무는 해당 업무에서 별도로 중지를 요청하세요.
        </p>
        <div className="form-grid">
          <L title="명부 확인 간격 (분)">
            <input
              type="number"
              name="discoveryIntervalMinutes"
              min="5"
              max="1440"
              defaultValue={state.settings.discoveryIntervalMinutes}
              required
            />
          </L>
          <L title="하루 실행 한도 · 매일 오전 9시(한국시간) 기준">
            <input
              type="number"
              name="dailyRunLimit"
              min="1"
              max="1000"
              defaultValue={state.settings.dailyRunLimit}
              required
            />
          </L>
          <L title="업무당 시간 한도 (분)">
            <input
              type="number"
              name="taskTimeoutMinutes"
              min="1"
              max="240"
              defaultValue={state.settings.taskTimeoutMinutes}
              required
            />
          </L>
        </div>
        <button className="primary" disabled={busy}>
          직원 정보 확인·새 업무 실행 기준 저장
        </button>
      </form>
      <div className="runtime-grid">
        {state.employees.map((e) => (
          <div className="runtime-row" key={e.id}>
            <strong>{e.name}</strong>
            <span
              className={`badge ${e.runtime?.status === "ready" ? "badge-active" : ""}`}
            >
              {e.runtime?.status === "ready" &&
              now - Date.parse(e.runtime.lastSeen) < 45000
                ? "업무를 받을 준비 기록 있음 · 실제 성공은 별도 확인"
                : e.runtime?.status === "error"
                  ? "실행 오류"
                  : "실행 준비 미확인"}
            </span>
            <p>
              {e.runtime?.summary ||
                "명부 관찰과 실행 준비는 별도로 확인합니다."}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
