'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { z } from 'zod';
import { useAdminUsersSession } from '@/app/admin/users/useAdminUsersController';
import { AdminBudgetRequestError, useAdminBudgetTasks } from '@/hooks/useAdminBudgetTasks';
import { UncertainUsageReconciliation, type UncertainResolutionInput } from './UncertainUsageReconciliation';

const money = z.number().finite().nonnegative();
const policySchema = z.object({ dailyLimitUsd: money.max(1000).nullable(), revision: z.string().regex(/^[a-f0-9]{64}$/) });
const textOrNull = z.string().nullable();
const reportSchema = z.object({
  uid: z.string().min(1).max(128), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timeZone: z.literal('UTC'),
  policy: policySchema,
  budget: z.object({ limitUsd: money, accountedUsd: money, reservedUsd: money, remainingUsd: money }),
  uncertain: z.array(z.object({ id: z.string().min(1).max(1500), operation: z.literal('image'), model: textOrNull, estimatedCostUsd: money.nullable(), reservedCostUsd: money.nullable(), day: textOrNull, reservedAt: textOrNull, updatedAt: textOrNull, jobId: textOrNull, projectId: textOrNull, stage: textOrNull, requestId: textOrNull, provider: textOrNull })).max(100),
  uncertainSummary: z.object({ count: z.number().int().nonnegative(), reservedCostUsd: money }), uncertainTruncated: z.boolean(), notes: z.array(z.string()),
});
type Report = z.infer<typeof reportSchema>;
const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(value);
const safeError = (error: unknown) => error instanceof AdminBudgetRequestError ? error.message : '응답을 확인하지 못했습니다. 새로 조회해 반영 여부를 확인해 주세요.';
export default function ImageBudgetPanel() {
  const session = useAdminUsersSession();
  if (session.loading) return <Panel><p role="status">이미지 비용 관리 권한을 확인하고 있습니다.</p></Panel>;
  if (!session.allowed || !session.isFullAdmin || !session.currentUser) return <Panel><h2>이미지 예산·비용 확인</h2><p>전체 관리자 계정으로 로그인하면 사용할 수 있습니다.</p></Panel>;
  return <AccountBrowser key={session.sessionKey} actorUid={session.currentUser.uid} />;
}
function AccountBrowser({ actorUid }: { actorUid: string }) {
  const [selectedUid, setSelectedUid] = useState(() => typeof window === 'undefined' ? actorUid : new URLSearchParams(window.location.search).get('uid') || actorUid);
  const [inputUid, setInputUid] = useState(selectedUid);
  return <Panel aria-labelledby="image-budget-heading">
    <h2 id="image-budget-heading">사용자별 이미지 예산·비용 확인</h2>
    <p>이미지 생성에 실제 적용되는 일일 한도입니다. 팀별·텍스트·영상 공통 예산이 아니며, 기존 사용량 통계와 별도로 관리합니다.</p>
    <form onSubmit={event => { event.preventDefault(); const uid = inputUid.trim(); if (uid && uid !== selectedUid && window.confirm('다른 계정을 조회하면 저장하지 않은 입력은 사라집니다. 계속할까요?')) setSelectedUid(uid); }}>
      <label htmlFor="budget-target-uid">대상 사용자 UID</label><input id="budget-target-uid" required maxLength={128} autoComplete="off" value={inputUid} onChange={event => setInputUid(event.target.value)} />
      <button type="submit">계정 예산 조회</button>
    </form>
    <BudgetWorkspace key={selectedUid} actorUid={actorUid} targetUid={selectedUid} />
  </Panel>;
}
function BudgetWorkspace({ actorUid, targetUid }: { actorUid: string; targetUid: string }) {
  const begin = useAdminBudgetTasks(actorUid);
  const lock = useRef(false);
  const [data, setData] = useState<Report | null>(null);
  const [limit, setLimit] = useState('');
  const [useDefault, setUseDefault] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const read = useCallback(async (task: ReturnType<typeof begin>) => {
    const report = reportSchema.parse(await task.request(`/api/admin/image-budgets?uid=${encodeURIComponent(targetUid)}`));
    if (report.uid !== targetUid) throw new AdminBudgetRequestError('조회 대상과 응답 계정이 일치하지 않습니다.');
    if (!task.isCurrent()) throw new AdminBudgetRequestError('이전 계정의 조회를 취소했습니다.');
    setData(report); setUseDefault(report.policy.dailyLimitUsd === null); setLimit(report.policy.dailyLimitUsd === null ? '' : String(report.policy.dailyLimitUsd)); setBlocked(false);
  }, [targetUid]);
  const refresh = useCallback(async () => {
    if (lock.current) return;
    lock.current = true; const task = begin();
    if (!task.isCurrent()) { lock.current = false; return; }
    setBusy(true); setError('');
    try { await read(task); }
    catch (failure) { if (task.isCurrent()) { setError(safeError(failure)); setBlocked(true); } }
    finally { if (task.isCurrent()) { lock.current = false; setBusy(false); } }
  }, [begin, read]);
  useEffect(() => { let live = true; queueMicrotask(() => { if (live) void refresh(); }); return () => { live = false; }; }, [refresh]);
  async function savePolicy(event: React.FormEvent) {
    event.preventDefault();
    if (!data || busy || blocked || lock.current) return;
    const dailyLimitUsd = useDefault ? null : Number(limit);
    if (!useDefault && (!limit.trim() || !Number.isFinite(dailyLimitUsd) || dailyLimitUsd! < 0 || dailyLimitUsd! > 1000)) { setError('일일 한도를 0~1000 USD로 입력해 주세요.'); return; }
    if (!window.confirm(`대상 UID ${targetUid}의 이미지 일일 한도를 ${dailyLimitUsd === null ? '서버 기본값' : usd(dailyLimitUsd)}으로 저장할까요? 0 USD는 새 이미지 생성을 중지합니다.`)) return;
    lock.current = true; const task = begin(); setBusy(true); setError(''); setNotice('');
    try {
      const result = z.object({ ok: z.literal(true), policy: policySchema }).parse(await task.request('/api/admin/image-budgets', 'PATCH', { uid: targetUid, expectedRevision64: data.policy.revision, dailyLimitUsd }));
      if (result.policy.dailyLimitUsd !== dailyLimitUsd) throw new AdminBudgetRequestError('저장 응답이 요청 한도와 다릅니다. 다시 조회해 주세요.');
      if (!task.isCurrent()) return;
      setNotice('이미지 일일 한도를 저장했습니다. 이미 진행 중인 요청의 비용 예약은 해제하지 않습니다.');
      try { await read(task); } catch { if (task.isCurrent()) { setBlocked(true); setError('한도 저장은 확인했지만 최신 잔액 조회에 실패했습니다. 다시 조회해 주세요.'); } }
    } catch (failure) { if (task.isCurrent()) { setError(safeError(failure)); setBlocked(true); } }
    finally { if (task.isCurrent()) { lock.current = false; setBusy(false); } }
  }
  async function reconcile(input: UncertainResolutionInput): Promise<void> {
    if (!data || busy || blocked || lock.current) throw new AdminBudgetRequestError('다른 요청이 처리 중이거나 최신 상태 조회가 필요합니다.');
    if (!data.uncertain.some(item => item.id === input.operationId)) throw new AdminBudgetRequestError('현재 조회한 계정의 비용 기록이 아닙니다.');
    lock.current = true; const task = begin(); setBusy(true); setError(''); setNotice('');
    try {
      const result = z.object({ ok: z.literal(true), id: z.string(), status: z.literal('reconciled'), decision: z.enum(['charged', 'not_charged']), actualCostUsd: money }).parse(await task.request('/api/admin/image-budgets', 'POST', { ...input, uid: targetUid }));
      if (result.id !== input.operationId || result.decision !== input.decision || result.actualCostUsd !== (input.decision === 'charged' ? input.actualCostUsd : 0)) throw new AdminBudgetRequestError('정산 응답을 확인하지 못했습니다. 다시 조회해 주세요.');
      if (!task.isCurrent()) throw new AdminBudgetRequestError('이전 계정의 정산 화면을 닫았습니다.');
      setNotice('확인 근거에 따라 내부 비용 원장을 정산했습니다. 환불이나 같은 요청의 재생성을 실행한 것이 아닙니다.');
      try { await read(task); } catch { if (task.isCurrent()) { setBlocked(true); setError('정산 저장은 확인했지만 최신 잔액 조회에 실패했습니다. 다시 조회해 주세요.'); } }
    } catch (failure) { if (task.isCurrent()) { setError(safeError(failure)); setBlocked(true); } throw new AdminBudgetRequestError(safeError(failure)); }
    finally { if (task.isCurrent()) { lock.current = false; setBusy(false); } }
  }
  return <div>
    <p><strong>현재 조회 UID: {targetUid}</strong></p><button type="button" disabled={busy} onClick={() => void refresh()}>예산·비용 다시 조회</button>
    {busy && <p role="status">예산 기록을 확인하고 있습니다.</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {blocked && <p>반영 여부를 확인하기 전에는 한도 변경·정산을 다시 실행하지 않습니다.</p>}
    {data && <>
      <p>예산 기준일: {data.day} · UTC (한국 시간 오전 9시 경계)</p>
      <Stats><div>적용 한도<strong>{usd(data.budget.limitUsd)}</strong></div><div>보수적으로 반영된 비용<strong>{usd(data.budget.accountedUsd)}</strong></div><div>진행 중 예약<strong>{usd(data.budget.reservedUsd)}</strong></div><div>추가 사용 가능<strong>{usd(data.budget.remainingUsd)}</strong></div></Stats>
      <p>반영된 비용에는 추정·미확정 금액이 포함될 수 있습니다. 공급자의 확정 청구액과 같다고 해석하지 마세요.</p>
      {data.notes.map(note => <p key={note}>{note}</p>)}
      <form onSubmit={event => void savePolicy(event)}>
        <h3>이미지 일일 한도 설정</h3>
        <label><input type="checkbox" checked={useDefault} disabled={busy || blocked} onChange={event => setUseDefault(event.target.checked)} /> 서버 기본값 사용</label>
        <label htmlFor="image-daily-limit">사용자 지정 한도 (USD)</label><input id="image-daily-limit" type="number" min="0" max="1000" step="0.000001" disabled={busy || blocked || useDefault} value={limit} onChange={event => setLimit(event.target.value)} />
        <p>0 USD는 새 이미지 생성을 중지합니다. 기존 완료 결과 조회·진행 중 예약은 유지됩니다. 다른 제작 도구의 예산은 변경하지 않습니다.</p>
        <button type="submit" disabled={busy || blocked}>이미지 한도 저장</button>
      </form>
      <p>미확정 내역은 선택 계정의 전체 기간 기록입니다. 위 예산 요약은 현재 UTC 기준일에만 해당합니다.</p>
      <UncertainUsageReconciliation summary={data.uncertainSummary} items={data.uncertain} truncated={data.uncertainTruncated} onResolve={reconcile} />
    </>}
  </div>;
}
const Panel = styled.section`
  border:1px solid #d1daea;border-radius:14px;padding:20px;background:var(--surface-primary,#fff);color:var(--text-primary,#172033);overflow-wrap:anywhere;
  h2{font-size:1.3rem;}p{line-height:1.65;}form{margin:18px 0;padding:14px 0;border-top:1px solid #d1daea;}label{display:block;margin:10px 0;}
  input:not([type=checkbox]){display:block;width:100%;max-width:600px;min-width:0;min-height:44px;box-sizing:border-box;padding:10px;border:1px solid #97a7c3;border-radius:8px;font:inherit;background:#fff;color:#172033;}
  input[type=checkbox]{width:20px;height:20px;vertical-align:middle;}button{min-height:44px;padding:10px 14px;border:1px solid #97a7c3;border-radius:8px;background:#eef3ff;color:#183b7c;font:inherit;cursor:pointer;margin:6px 4px 6px 0;}button:disabled{opacity:.6;cursor:not-allowed;} :is(input,button):focus-visible{outline:3px solid #4674d5;outline-offset:3px;}
  @media(max-width:600px){padding:14px;}
`;
const Stats = styled.div`display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;>div{border:1px solid #d1daea;padding:12px;border-radius:8px;font-size:.9rem;}strong{display:block;margin-top:8px;font-size:1.1rem;}@media(max-width:850px){grid-template-columns:repeat(2,minmax(0,1fr));}`;
