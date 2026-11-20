'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import styled from 'styled-components';

export type OpenRouterUsageChartPoint = {
  day: string;
  label: string;
  costUsd: number;
  totalTokens: number;
};

type Props = {
  data: OpenRouterUsageChartPoint[];
  totalCostUsd: number;
  totalTokens: number;
};

const formatUsd = (value: number) => {
  const fractionDigits = value > 0 && value < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
};

const formatNumber = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value);
const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function OpenRouterUsageCharts({ data, totalCostUsd, totalTokens }: Props) {
  return (
    <ChartGrid aria-label="OpenRouter 사용량 추이">
      <ChartCard>
        <CardHeader>
          <div>
            <CardTitle>일별 실제 비용</CardTitle>
            <CardHint>비용 응답이 있는 호출만 USD로 합산</CardHint>
          </div>
          <MetricBadge>{formatUsd(totalCostUsd)}</MetricBadge>
        </CardHeader>
        <ChartFrame aria-label="일별 OpenRouter 실제 비용 차트">
          <AreaChart
            responsive
            style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 220 }}
            data={data}
            margin={{ top: 12, right: 8, left: -14, bottom: 0 }}
          >
            <defs>
              <linearGradient id="openrouter-cost-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.34} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.13)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={(value) => `$${formatCompactNumber(Number(value))}`} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              labelFormatter={(_, payload) => payload?.[0]?.payload?.day || ''}
              formatter={(value: number | string | undefined) => [formatUsd(Number(value || 0)), '실제 비용']}
              contentStyle={{ background: '#101925', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 8, color: '#e5edf6' }}
            />
            <Area type="monotone" dataKey="costUsd" stroke="#34d399" strokeWidth={2.25} fill="url(#openrouter-cost-gradient)" />
          </AreaChart>
        </ChartFrame>
      </ChartCard>

      <ChartCard>
        <CardHeader>
          <div>
            <CardTitle>일별 토큰</CardTitle>
            <CardHint>입력과 출력 토큰을 모두 포함</CardHint>
          </div>
          <MetricBadge>{formatCompactNumber(totalTokens)}</MetricBadge>
        </CardHeader>
        <ChartFrame aria-label="일별 OpenRouter 토큰 차트">
          <BarChart
            responsive
            style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 220 }}
            data={data}
            margin={{ top: 12, right: 8, left: -14, bottom: 0 }}
          >
            <CartesianGrid stroke="rgba(148,163,184,0.13)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={(value) => formatCompactNumber(Number(value))} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              labelFormatter={(_, payload) => payload?.[0]?.payload?.day || ''}
              formatter={(value: number | string | undefined) => [formatNumber(Number(value || 0)), '토큰']}
              contentStyle={{ background: '#101925', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 8, color: '#e5edf6' }}
            />
            <Bar dataKey="totalTokens" fill="#60a5fa" radius={[5, 5, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ChartFrame>
      </ChartCard>
    </ChartGrid>
  );
}

export const OpenRouterUsageChartsLoading = styled.div`
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

const ChartGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  @media (max-width: 960px) { grid-template-columns: 1fr; }
`;

const ChartCard = styled.section`
  min-width: 0;
  min-height: 310px;
  display: flex;
  flex-direction: column;
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

const MetricBadge = styled.span`
  flex: 0 0 auto;
  padding: 5px 8px;
  color: #a7f3d0;
  background: rgba(16,185,129,.12);
  border: 1px solid rgba(16,185,129,.2);
  border-radius: 999px;
  font-size: .74rem;
  font-weight: 800;
`;

const ChartFrame = styled.div`
  min-height: 220px;
  flex: 1;
`;
