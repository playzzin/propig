'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Database,
  DollarSign,
  Image as ImageIcon,
  MessageSquare,
  RefreshCw,
  Settings,
  Video,
} from 'lucide-react';
import styled from 'styled-components';
import { useAuth } from '@/contexts/AuthContext';
import type {
  UncertainResolutionInput,
  UncertainUsageRecord,
  UsageOperation,
} from './UncertainUsageReconciliation';

const LoginModal = dynamic(() => import('@/components/LoginModal').then((module) => module.LoginModal));
const UncertainUsageReconciliation = dynamic(
  () => import('./UncertainUsageReconciliation').then((module) => module.UncertainUsageReconciliation),
);
const OpenRouterUsageCharts = dynamic(
  () => import('./OpenRouterUsageCharts').then((module) => module.OpenRouterUsageCharts),
  { loading: () => <ChartLoading role="status">사용량 차트를 준비하는 중입니다…</ChartLoading> },
);

type RangeDays = 7 | 30 | 90;

type UsageAggregate = {
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  pricedRequestCount: number;
  pricedTotalTokens: number;
  costUsd: number;
};

type UsageResponse = {
  rangeDays: RangeDays;
  recordingAvailable: boolean;
  message: string | null;
  summary: UsageAggregate;
  daily: Array<{ day: string } & UsageAggregate>;
  byModel: Array<{ model: string } & UsageAggregate>;
  byOperation: Array<{ operation: UsageOperation } & UsageAggregate>;
  recent: Array<{
    id: string;
    operation: UsageOperation;
    source: 'next_server' | 'firebase_function';
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number | null;
    day: string;
    occurredAt: string | null;
  }>;
  uncertainSummary: {
    count: number;
    reservedCostUsd: number;
  };
  uncertain: UncertainUsageRecord[];
  uncertainTruncated: boolean;
  truncated: boolean;
};

const RANGE_OPTIONS: Array<{ value: RangeDays; label: string }> = [
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
];

const formatNumber = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value);

const formatUsd = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '비용 미확인';
  const fractionDigits = value > 0 && value < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
};

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const formatChartDay = (value: string) => {
  const [, month, day] = value.split('-');
  return `${Number(month)}/${Number(day)}`;
};

const formatOccurredAt = (value: string | null, fallbackDay: string) => {
  if (!value) return `${fallbackDay} 기록`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${fallbackDay} 기록`;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const operationLabel = (operation: UsageOperation) => {
  switch (operation) {
    case 'text':
      return '텍스트';
    case 'image':
      return '이미지';
    case 'video':
      return '영상';
  }
};

const sourceLabel = (source: 'next_server' | 'firebase_function') =>
  source === 'firebase_function' ? 'Functions' : 'Next 서버';

async function fetchOpenRouterUsage(user: User, range: RangeDays): Promise<UsageResponse> {
  const token = await user.getIdToken();
  const response = await fetch(`/api/openrouter-usage?range=${range}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as (UsageResponse & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error || 'OpenRouter 사용량을 불러오지 못했습니다.');
  return payload as UsageResponse;
}

async function reconcileOpenRouterUsage(user: User, input: UncertainResolutionInput): Promise<void> {
  const token = await user.getIdToken();
  const response = await fetch('/api/openrouter-usage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || '불확실 비용 정산을 처리하지 못했습니다.');
}

const operationIcon = (operation: UsageOperation) => {
  switch (operation) {
    case 'text':
      return MessageSquare;
    case 'image':
      return ImageIcon;
    case 'video':
      return Video;
  }
};

export default function OpenRouterUsagePage() {
  const { currentUser, loading: authLoading, isConfigured: authConfigured, error: authError } = useAuth();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<RangeDays>(30);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!authLoading || authLoadingTimedOut) return undefined;
    const timeoutId = window.setTimeout(() => setAuthLoadingTimedOut(true), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [authLoading, authLoadingTimedOut]);

  const isAuthChecking = authLoading && !authLoadingTimedOut;
  const canOpenLogin = authConfigured && !isAuthChecking;
  const usageQuery = useQuery({
    queryKey: ['openrouter-usage', currentUser?.uid ?? 'anonymous', range],
    queryFn: () => fetchOpenRouterUsage(currentUser as User, range),
    enabled: Boolean(currentUser),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const { mutateAsync: reconcileUsage } = useMutation({
    mutationFn: (input: UncertainResolutionInput) => {
      if (!currentUser) throw new Error('관리자 로그인이 필요합니다. 다시 로그인해 주세요.');
      return reconcileOpenRouterUsage(currentUser, input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['openrouter-usage'],
      });
    },
  });
  const handleReconcile = useCallback(
    async (input: UncertainResolutionInput) => {
      await reconcileUsage(input);
    },
    [reconcileUsage],
  );

  const summary = usageQuery.data?.summary;
  const hasKnownCost = Boolean(summary && summary.pricedRequestCount > 0);
  const costPerThousandTokens =
    summary && summary.pricedTotalTokens > 0 && summary.pricedRequestCount > 0
      ? (summary.costUsd / summary.pricedTotalTokens) * 1_000
      : null;

  if (!currentUser && !isAuthChecking) {
    return (
      <PageWrap $center>
        <LockedCard aria-labelledby="openrouter-usage-login-title">
          <LockEyebrow>ADMIN ONLY</LockEyebrow>
          <LockTitle id="openrouter-usage-login-title">사용량 대시보드에 로그인하세요</LockTitle>
          <LockCopy>
            OpenRouter의 실제 호출 비용, 토큰, 모델별 사용 현황은 관리자만 확인할 수 있습니다.
          </LockCopy>
          <Button type="button" onClick={() => setIsLoginOpen(true)} disabled={!canOpenLogin}>
            로그인하기
          </Button>
          {!canOpenLogin ? <ErrorText role="status">{authError ?? 'Firebase 인증 설정을 확인해 주세요.'}</ErrorText> : null}
        </LockedCard>
        {isLoginOpen ? <LoginModal isOpen onClose={() => setIsLoginOpen(false)} /> : null}
      </PageWrap>
    );
  }

  if (isAuthChecking || usageQuery.isLoading) {
    return (
      <PageWrap $center>
        <LoadingCard role="status">OpenRouter 사용량을 불러오는 중입니다…</LoadingCard>
      </PageWrap>
    );
  }

  const data = usageQuery.data;
  const empty = data?.summary.requestCount === 0;

  return (
    <PageWrap>
      <PageShell>
        <PageHeader>
          <HeaderCopy>
            <Eyebrow>OPENROUTER OBSERVABILITY</Eyebrow>
            <PageTitle>OpenRouter 사용량</PageTitle>
            <PageSubtitle>호출 비용과 토큰 기록을 모델·기능별로 확인합니다.</PageSubtitle>
          </HeaderCopy>
          <HeaderActions>
            <HeaderLink href="/admin/openrouter-settings">
              <Settings size={16} aria-hidden />
              설정 관리
            </HeaderLink>
            <Button type="button" onClick={() => usageQuery.refetch()} disabled={usageQuery.isFetching}>
              <RefreshCw size={16} aria-hidden />
              {usageQuery.isFetching ? '새로고침 중' : '새로고침'}
            </Button>
          </HeaderActions>
        </PageHeader>

        <InfoNotice>
          <Database size={17} aria-hidden />
          <span>비용은 OpenRouter 응답의 실제 <code>usage.cost</code>만 합산합니다. 프롬프트·결과·API 키·사용자 정보는 기록하지 않습니다.</span>
        </InfoNotice>

        <Toolbar>
          <RangeGroup aria-label="조회 기간">
            {RANGE_OPTIONS.map((option) => (
              <RangeButton
                key={option.value}
                type="button"
                $active={range === option.value}
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
              >
                최근 {option.label}
              </RangeButton>
            ))}
          </RangeGroup>
          <ToolbarMeta>한국 시간 기준 · {data?.rangeDays ?? range}일</ToolbarMeta>
        </Toolbar>

        {usageQuery.isError ? (
          <ErrorNotice role="alert">
            <Activity size={17} aria-hidden />
            <span>{usageQuery.error instanceof Error ? usageQuery.error.message : '사용량을 불러오는 중 오류가 발생했습니다.'}</span>
            <button type="button" onClick={() => usageQuery.refetch()}>다시 시도</button>
          </ErrorNotice>
        ) : null}

        {!data?.recordingAvailable ? (
          <ErrorNotice role="status">
            <Activity size={17} aria-hidden />
            <span>{data?.message || '사용량 기록 저장소를 사용할 수 없습니다.'}</span>
          </ErrorNotice>
        ) : null}

        {data?.truncated ? (
          <WarningNotice role="status">이 기간에 기록이 많아 최근 10,000건만 집계했습니다.</WarningNotice>
        ) : null}

        {data?.recordingAvailable ? (
          <UncertainUsageReconciliation
            summary={data.uncertainSummary || { count: 0, reservedCostUsd: 0 }}
            items={data.uncertain || []}
            truncated={Boolean(data.uncertainTruncated)}
            onResolve={handleReconcile}
          />
        ) : null}

        <KpiGrid>
          <KpiCard>
            <KpiIcon $tone="money"><DollarSign size={19} aria-hidden /></KpiIcon>
            <KpiLabel>실제 누적 비용</KpiLabel>
            <KpiValue>{hasKnownCost ? formatUsd(summary?.costUsd) : '비용 미확인'}</KpiValue>
            <KpiMeta>{summary ? `${formatNumber(summary.pricedRequestCount)}건의 비용 응답 기준` : '-'}</KpiMeta>
          </KpiCard>
          <KpiCard>
            <KpiIcon $tone="token"><BarChart3 size={19} aria-hidden /></KpiIcon>
            <KpiLabel>총 토큰</KpiLabel>
            <KpiValue>{formatNumber(summary?.totalTokens || 0)}</KpiValue>
            <KpiMeta>입력 {formatNumber(summary?.promptTokens || 0)} · 출력 {formatNumber(summary?.completionTokens || 0)}</KpiMeta>
          </KpiCard>
          <KpiCard>
            <KpiIcon $tone="request"><Activity size={19} aria-hidden /></KpiIcon>
            <KpiLabel>기록된 호출</KpiLabel>
            <KpiValue>{formatNumber(summary?.requestCount || 0)}</KpiValue>
            <KpiMeta>텍스트·이미지·영상 성공 호출</KpiMeta>
          </KpiCard>
          <KpiCard>
            <KpiIcon $tone="rate"><Database size={19} aria-hidden /></KpiIcon>
            <KpiLabel>1천 토큰당 비용</KpiLabel>
            <KpiValue>{formatUsd(costPerThousandTokens)}</KpiValue>
            <KpiMeta>비용이 확인된 {formatNumber(summary?.pricedTotalTokens || 0)} 토큰 기준</KpiMeta>
          </KpiCard>
        </KpiGrid>

        {empty ? (
          <EmptyState>
            <EmptyIcon><BarChart3 size={25} aria-hidden /></EmptyIcon>
            <div>
              <h2>아직 기록된 OpenRouter 사용량이 없습니다</h2>
              <p>이 기능을 배포한 뒤의 성공 호출부터 자동 기록됩니다. 과거 호출분은 원본 사용량 데이터가 없어 자동 복원되지 않습니다.</p>
            </div>
          </EmptyState>
        ) : (
          <>
            <OpenRouterUsageCharts
              data={(data?.daily || []).map((item) => ({ ...item, label: formatChartDay(item.day) }))}
              totalCostUsd={summary?.costUsd || 0}
              totalTokens={summary?.totalTokens || 0}
            />

            <BreakdownGrid>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>모델별 사용량</CardTitle>
                    <CardHint>비용 또는 토큰 기준으로 우선 정렬</CardHint>
                  </div>
                </CardHeader>
                <TableWrap>
                  <DataTable>
                    <thead><tr><th>모델</th><th>호출</th><th>토큰</th><th>실제 비용</th></tr></thead>
                    <tbody>
                      {(data?.byModel || []).slice(0, 8).map((item) => (
                        <tr key={item.model}>
                          <td><ModelName title={item.model}>{item.model}</ModelName></td>
                          <td>{formatNumber(item.requestCount)}</td>
                          <td>{formatCompactNumber(item.totalTokens)}</td>
                          <td>{item.pricedRequestCount ? formatUsd(item.costUsd) : '비용 미확인'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </TableWrap>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>기능별 사용량</CardTitle>
                    <CardHint>생성 종류별 호출과 비용 분포</CardHint>
                  </div>
                </CardHeader>
                <OperationList>
                  {(data?.byOperation || []).map((item) => {
                    const Icon = operationIcon(item.operation);
                    return (
                      <OperationRow key={item.operation}>
                        <OperationIcon $operation={item.operation}><Icon size={17} aria-hidden /></OperationIcon>
                        <OperationContent>
                          <strong>{operationLabel(item.operation)}</strong>
                          <span>{formatNumber(item.requestCount)}회 · {formatCompactNumber(item.totalTokens)} 토큰</span>
                        </OperationContent>
                        <OperationCost>{item.pricedRequestCount ? formatUsd(item.costUsd) : '비용 미확인'}</OperationCost>
                      </OperationRow>
                    );
                  })}
                </OperationList>
              </Card>
            </BreakdownGrid>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>최근 기록</CardTitle>
                  <CardHint>가장 최근 성공한 OpenRouter 호출 20건</CardHint>
                </div>
              </CardHeader>
              <TableWrap>
                <DataTable>
                  <thead><tr><th>시각</th><th>기능</th><th>모델</th><th>토큰</th><th>비용</th><th>실행 환경</th></tr></thead>
                  <tbody>
                    {(data?.recent || []).map((item) => {
                      const Icon = operationIcon(item.operation);
                      return (
                        <tr key={item.id}>
                          <td>{formatOccurredAt(item.occurredAt, item.day)}</td>
                          <td><OperationTag $operation={item.operation}><Icon size={13} aria-hidden />{operationLabel(item.operation)}</OperationTag></td>
                          <td><ModelName title={item.model}>{item.model}</ModelName></td>
                          <td>{formatNumber(item.totalTokens)}</td>
                          <td>{formatUsd(item.costUsd)}</td>
                          <td>{sourceLabel(item.source)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </TableWrap>
            </Card>
          </>
        )}
      </PageShell>
    </PageWrap>
  );
}

const PageWrap = styled.main<{ $center?: boolean }>`
  min-height: 100%;
  padding: clamp(16px, 2.5vw, 30px);
  display: flex;
  justify-content: center;
  align-items: ${({ $center }) => ($center ? 'center' : 'stretch')};
`;

const PageShell = styled.div`
  width: min(1440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const PageHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;

  @media (max-width: 680px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const HeaderCopy = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Eyebrow = styled.span`
  color: var(--primary-light);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
`;

const PageTitle = styled.h1`
  margin: 0;
  color: var(--text-main);
  font-size: clamp(1.5rem, 2.4vw, 2.1rem);
  font-weight: 850;
  line-height: 1.15;
`;

const PageSubtitle = styled.p`
  margin: 0;
  color: var(--text-muted);
  font-size: 0.92rem;
`;

const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const HeaderLink = styled(Link)`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 13px;
  border: 1px solid var(--border-medium);
  border-radius: 7px;
  background: rgba(255,255,255,0.035);
  color: var(--text-main);
  font-size: 0.84rem;
  font-weight: 800;
  text-decoration: none;
  touch-action: manipulation;
  transition: background-color 120ms ease, border-color 120ms ease;

  &:hover { background: rgba(255,255,255,0.07); border-color: rgba(148,163,184,.42); }
  &:focus-visible { outline: 3px solid rgba(16, 185, 129, 0.28); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const Button = styled.button`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 13px;
  border: 1px solid rgba(16, 185, 129, 0.4);
  border-radius: 7px;
  background: var(--primary);
  color: #04110d;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;

  &:disabled { opacity: 0.55; cursor: not-allowed; }
  &:hover:not(:disabled) { filter: brightness(1.06); }
  &:focus-visible { outline: 3px solid rgba(16, 185, 129, 0.28); outline-offset: 2px; }
`;

const InfoNotice = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px 14px;
  color: #bae6fd;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 8px;
  font-size: 0.84rem;
  line-height: 1.5;

  svg { flex: 0 0 auto; margin-top: 2px; }
  code { color: #e0f2fe; font-weight: 700; }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const RangeGroup = styled.div`
  display: inline-flex;
  padding: 3px;
  gap: 3px;
  border-radius: 8px;
  border: 1px solid var(--border-medium);
  background: rgba(255,255,255,0.025);
`;

const RangeButton = styled.button<{ $active: boolean }>`
  min-height: 44px;
  border: 0;
  border-radius: 5px;
  padding: 6px 10px;
  background: ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.18)' : 'transparent')};
  color: ${({ $active }) => ($active ? '#a7f3d0' : 'var(--text-muted)')};
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;

  &:focus-visible { outline: 2px solid rgba(16, 185, 129, 0.42); outline-offset: 1px; }
`;

const ToolbarMeta = styled.span`
  color: var(--text-muted);
  font-size: 0.78rem;
`;

const ErrorNotice = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 11px 13px;
  color: #fecaca;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 8px;
  font-size: 0.84rem;

  button { border: 0; padding: 0; background: transparent; color: #fecaca; font-weight: 800; text-decoration: underline; cursor: pointer; }
`;

const WarningNotice = styled.div`
  padding: 11px 13px;
  color: #fde68a;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 8px;
  font-size: 0.84rem;
`;

const KpiGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1100px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;

const KpiCard = styled.article`
  min-width: 0;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  column-gap: 10px;
  padding: 15px;
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 9px;
`;

const KpiIcon = styled.span<{ $tone: 'money' | 'token' | 'request' | 'rate' }>`
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  grid-row: span 2;
  border-radius: 8px;
  color: ${({ $tone }) => ($tone === 'money' ? '#6ee7b7' : $tone === 'token' ? '#93c5fd' : $tone === 'request' ? '#fbbf24' : '#c4b5fd')};
  background: ${({ $tone }) => ($tone === 'money' ? 'rgba(16,185,129,.13)' : $tone === 'token' ? 'rgba(59,130,246,.13)' : $tone === 'request' ? 'rgba(245,158,11,.13)' : 'rgba(139,92,246,.13)')};
`;

const KpiLabel = styled.span`
  color: var(--text-muted);
  font-size: 0.76rem;
  font-weight: 700;
`;

const KpiValue = styled.strong`
  min-width: 0;
  align-self: end;
  color: var(--text-main);
  font-size: clamp(1.04rem, 1.7vw, 1.34rem);
  line-height: 1.28;
  overflow-wrap: anywhere;
`;

const KpiMeta = styled.span`
  grid-column: 1 / -1;
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 0.73rem;
  line-height: 1.4;
`;

const EmptyState = styled.section`
  min-height: 250px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 28px;
  background: var(--bg-card);
  border: 1px dashed var(--border-medium);
  border-radius: 10px;
  text-align: left;

  h2 { margin: 0 0 6px; color: var(--text-main); font-size: 1.04rem; }
  p { max-width: 620px; margin: 0; color: var(--text-muted); font-size: .86rem; line-height: 1.6; }

  @media (max-width: 560px) { align-items: flex-start; flex-direction: column; }
`;

const EmptyIcon = styled.div`
  width: 50px;
  height: 50px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6ee7b7;
  border-radius: 12px;
  background: rgba(16,185,129,.13);
`;

const ChartLoading = styled.div`
  min-height: 310px;
  display: grid;
  place-items: center;
  padding: 24px;
  border: 1px solid var(--border-medium);
  border-radius: 9px;
  color: var(--text-muted);
  background: var(--bg-card);
  font-size: .82rem;
`;

const BreakdownGrid = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(310px, .7fr);
  gap: 16px;

  @media (max-width: 960px) { grid-template-columns: 1fr; }
`;

const Card = styled.section`
  min-width: 0;
  padding: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 9px;

  @media (max-width: 620px) { padding: 14px; }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 15px;
`;

const CardTitle = styled.h2`
  margin: 0;
  color: var(--text-main);
  font-size: 1rem;
  line-height: 1.3;
`;

const CardHint = styled.p`
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: .77rem;
  line-height: 1.45;
`;

const TableWrap = styled.div`
  overflow-x: auto;
  border: 1px solid rgba(148,163,184,.15);
  border-radius: 7px;
`;

const DataTable = styled.table`
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  color: var(--text-main);
  font-size: .8rem;

  th, td { padding: 11px 12px; text-align: left; border-bottom: 1px solid rgba(148,163,184,.13); }
  tr:last-child td { border-bottom: 0; }
  th { color: var(--text-muted); background: rgba(255,255,255,.025); font-size: .72rem; font-weight: 800; white-space: nowrap; }
  td:not(:first-child) { white-space: nowrap; }
`;

const ModelName = styled.span`
  display: inline-block;
  max-width: 270px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
`;

const OperationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const OperationRow = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  background: rgba(255,255,255,.025);
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 7px;
`;

const OperationIcon = styled.span<{ $operation: UsageOperation }>`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ $operation }) => ($operation === 'text' ? '#93c5fd' : $operation === 'image' ? '#f9a8d4' : '#c4b5fd')};
  background: ${({ $operation }) => ($operation === 'text' ? 'rgba(59,130,246,.13)' : $operation === 'image' ? 'rgba(236,72,153,.13)' : 'rgba(139,92,246,.13)')};
  border-radius: 7px;
`;

const OperationContent = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  strong { color: var(--text-main); font-size: .83rem; }
  span { color: var(--text-muted); font-size: .73rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

const OperationCost = styled.strong`
  color: var(--text-main);
  font-size: .78rem;
  white-space: nowrap;
`;

const OperationTag = styled.span<{ $operation: UsageOperation }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${({ $operation }) => ($operation === 'text' ? '#bfdbfe' : $operation === 'image' ? '#fbcfe8' : '#ddd6fe')};
  font-size: .74rem;
  font-weight: 800;
`;

const LockedCard = styled.section`
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 13px;
  padding: 26px;
  background: var(--bg-card);
  border: 1px solid rgba(16,185,129,.24);
  border-radius: 10px;
`;

const LockEyebrow = styled.span`
  color: var(--primary);
  font-size: .75rem;
  font-weight: 850;
  letter-spacing: .08em;
`;

const LockTitle = styled.h1`
  margin: 0;
  color: var(--text-main);
  font-size: 1.45rem;
`;

const LockCopy = styled.p`
  margin: 0;
  color: var(--text-muted);
  line-height: 1.6;
  font-size: .9rem;
`;

const ErrorText = styled.span`
  color: #fca5a5;
  font-size: .8rem;
`;

const LoadingCard = styled.div`
  width: min(520px, 100%);
  padding: 20px;
  color: var(--text-main);
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 9px;
`;
