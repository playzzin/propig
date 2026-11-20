'use client';

import { useId } from 'react';
import styled from 'styled-components';
import {
  CEO_METRICS,
  CEO_TREND_LABELS,
  type CeoMetricId,
  type CeoStatisticsScenario,
} from './ceoStatisticsData';

interface ChartProps {
  scenario: CeoStatisticsScenario;
  progress: number;
  activeMetric: CeoMetricId | null;
}

type Point = { x: number; y: number };
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const polar = (radius: number, angle: number, cx = 140, cy = 112): Point => ({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
const polygon = (points: Point[]) => points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

function smoothPath(points: Point[]) {
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const third = (point.x - previous.x) / 3;
    return `${path} C ${previous.x + third} ${previous.y}, ${point.x - third} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

function trendY(metric: CeoMetricId, value: number) {
  const normalized = metric === 'weight' ? (value - 100) / 50
    : metric === 'time' ? (value - 12) / 36
      : metric === 'capital' ? (value + 100) / 1100 : value / 100;
  return 188 - clamp(normalized) * 176;
}

export function CeoTrendChart({ scenario, progress, activeMetric }: ChartProps) {
  const id = useId().replace(/:/g, '');
  const reveal = clamp(progress);
  const zero = trendY('capital', 0);
  const playhead = 8 + reveal * 704;
  const description = CEO_METRICS.map(metric => `${metric.label} ${metric.id === 'weight' ? 'kg' : metric.id === 'time' ? '누적 시간' : metric.unit}: ${scenario.trend[metric.id].join(', ')}`).join('. ');

  return (
    <TrendShell>
      <svg viewBox="0 0 720 200" preserveAspectRatio="none" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>{`${scenario.label} — 기술력·체중·누적 작업시간·자본의 통합 추이`}</title>
        <desc id={`${id}-desc`}>{`12시간부터 48시간까지 창작 캐릭터의 다섯 단계입니다. 기술력은 0~100, 체중은 100~150kg, 작업시간은 누적 12~48시간, 자본은 -100~1000만원의 각 범위로 표시합니다. 자본 0선 아래는 마이너스 잔고입니다. ${description}. 현재 ${CEO_METRICS.map(metric => `${metric.label} ${scenario.values[metric.id]}${metric.unit}`).join(', ')}.`}</desc>
        <defs>
          <clipPath id={`${id}-reveal`}><rect x="0" y="0" width={playhead} height="200" /></clipPath>
          <linearGradient id={`${id}-skill-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#77dfb4" stopOpacity=".16" />
            <stop offset="100%" stopColor="#77dfb4" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="8" y={zero} width="704" height={188 - zero} fill="#e8c1fa" fillOpacity=".07" />
        {[12, 56, 100, 144, 188].map(y => (
          <line key={y} x1="8" x2="712" y1={y} y2={y} stroke="#ffffff" strokeOpacity=".09" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
        ))}
        <line data-ceo-trend-zero={zero} x1="8" x2="712" y1={zero} y2={zero} stroke="#e8c1fa" strokeOpacity=".45" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        {CEO_TREND_LABELS.map((label, index) => (
          <line key={label} x1={8 + index * 704 / (CEO_TREND_LABELS.length - 1)} x2={8 + index * 704 / (CEO_TREND_LABELS.length - 1)} y1="12" y2="188" stroke="#ffffff" strokeOpacity=".045" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={playhead} x2={playhead} y1="12" y2="188" stroke="#ffffff" strokeOpacity=".28" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <g>
          {CEO_METRICS.map(metric => {
            const points = scenario.trend[metric.id].map((value, index, rows) => ({ x: 8 + index * 704 / (rows.length - 1), y: trendY(metric.id, value) }));
            const curve = smoothPath(points);
            const selected = activeMetric === metric.id;
            return (
              <g key={metric.id} opacity={!activeMetric || selected ? 1 : .65}>
                <path d={curve} fill="none" stroke={metric.color} strokeWidth="1.7" strokeOpacity=".18" vectorEffect="non-scaling-stroke" />
                <g clipPath={`url(#${id}-reveal)`}>
                  {metric.id === 'skill' && <path d={`${curve} L 712 188 L 8 188 Z`} fill={`url(#${id}-skill-area)`} />}
                  {selected && <path d={curve} fill="none" stroke={metric.color} strokeWidth="11" strokeOpacity=".1" vectorEffect="non-scaling-stroke" />}
                  <path data-ceo-stat-series={metric.id} d={curve} fill="none" stroke={metric.color} strokeWidth={selected ? 3.5 : 2.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </g>
                {points.map((point, index) => (
                  <circle key={index} data-ceo-trend-point={metric.id} data-ceo-trend-value={scenario.trend[metric.id][index]} data-value={scenario.trend[metric.id][index]} cx={point.x} cy={point.y} r={selected ? 3.4 : 2.4} fill="#10231f" stroke={metric.color} strokeWidth="1.7" opacity={index <= reveal * (points.length - 1) ? 1 : .22} vectorEffect="non-scaling-stroke">
                    <title>{`${metric.label} ${CEO_TREND_LABELS[index]} 단계: ${scenario.trend[metric.id][index]}${metric.unit}`}</title>
                  </circle>
                ))}
                <circle data-ceo-trend-current={metric.id} cx={playhead} cy={trendY(metric.id, scenario.values[metric.id])} r={selected ? 5 : 4} fill={metric.color} stroke="#10231f" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </g>
      </svg>
      <div className="trend-x-labels" aria-hidden="true">
        {CEO_TREND_LABELS.map((label, index) => <span key={label} style={{ left: `${index * 100 / (CEO_TREND_LABELS.length - 1)}%` }}>{label}</span>)}
      </div>
    </TrendShell>
  );
}

function SkillRadar({ scenario, progress }: Pick<ChartProps, 'scenario' | 'progress'>) {
  const angle = (index: number) => -Math.PI / 2 + index * Math.PI * 2 / 5;
  const vertices = scenario.skills.map((row, index) => polar(72 * clamp(row.value, 0, 100) / 100 * progress, angle(index)));
  return (
    <>
      <polygon points={polygon(scenario.skills.map((_, index) => polar(72, angle(index))))} fill="#eef1e9" fillOpacity=".6" />
      {[.25, .5, .75, 1].map(scale => <polygon key={scale} points={polygon(scenario.skills.map((_, index) => polar(72 * scale, angle(index))))} fill="none" stroke="#d2dacf" strokeWidth="1" />)}
      {scenario.skills.map((_, index) => { const point = polar(72, angle(index)); return <line key={index} x1="140" y1="112" x2={point.x} y2={point.y} stroke="#d2dacf" />; })}
      <polygon points={polygon(vertices)} fill="#77dfb4" fillOpacity=".32" stroke="#176044" strokeWidth="2.4" strokeLinejoin="round" />
      {vertices.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3.4" fill="#176044" stroke="#faf9f4" strokeWidth="1.5" />)}
      {scenario.skills.map((row, index) => {
        const point = polar(98, angle(index));
        const anchor = index === 0 ? 'middle' : index < 3 ? 'start' : 'end';
        return <text key={row.label} x={point.x} y={point.y - (index === 0 ? 0 : 4)} textAnchor={anchor} fill="#365449" fontSize="13" fontWeight="550"><tspan x={point.x}>{row.label}</tspan><tspan x={point.x} dy="16" fill="#176044" fontSize="12" fontWeight="700">{row.value}</tspan></text>;
      })}
      <text x="140" y="216" textAnchor="middle" fill="#5c6b60" fontSize="11.5">다섯 가지 재능, 하나의 스킬 트리</text>
    </>
  );
}

function WeightGauge({ value }: { value: number }) {
  const filled = clamp((value - 100) / 50);
  const angle = Math.PI - filled * Math.PI;
  const needle = { x: 140 + Math.cos(angle) * 65, y: 139 - Math.sin(angle) * 65 };
  return (
    <>
      <path d="M 48 139 A 92 92 0 0 1 232 139" fill="none" stroke="#ece5d9" strokeWidth="20" strokeLinecap="round" />
      <path d="M 48 139 A 92 92 0 0 1 232 139" fill="none" stroke="#eb9b62" strokeWidth="20" strokeLinecap="round" pathLength="100" strokeDasharray={`${filled * 100} 100`} opacity={filled > 0 ? 1 : 0} />
      {Array.from({ length: 11 }, (_, index) => {
        const theta = Math.PI - index / 10 * Math.PI;
        const start = { x: 140 + Math.cos(theta) * 75, y: 139 - Math.sin(theta) * 75 };
        const end = { x: 140 + Math.cos(theta) * (index % 5 === 0 ? 64 : 69), y: 139 - Math.sin(theta) * (index % 5 === 0 ? 64 : 69) };
        return <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#a99885" strokeWidth={index % 5 === 0 ? 1.6 : 1} />;
      })}
      <text x="140" y="22" textAnchor="middle" fill="#7e6248" fontSize="12">125</text>
      <text x="48" y="165" textAnchor="middle" fill="#7e6248" fontSize="12">100</text>
      <text x="232" y="165" textAnchor="middle" fill="#7e6248" fontSize="12">150</text>
      <line x1="140" y1="139" x2={needle.x} y2={needle.y} stroke="#944b21" strokeWidth="3" strokeLinecap="round" />
      <circle cx="140" cy="139" r="8" fill="#faf9f4" stroke="#944b21" strokeWidth="2" />
      <circle cx="140" cy="139" r="3" fill="#944b21" />
      <text x="140" y="186" textAnchor="middle" fill="#944b21" fontSize="25" fontWeight="650">{Math.round(value)}<tspan fontSize="13" dx="4">kg</tspan></text>
      <text x="140" y="207" textAnchor="middle" fill="#6e665b" fontSize="11.5">상상 속 캐릭터의 체중</text>
    </>
  );
}

function WorkHoursBars({ scenario, progress }: Pick<ChartProps, 'scenario' | 'progress'>) {
  const stages = scenario.trend.time;
  const slot = 244 / stages.length;
  const current = clamp(progress) * (stages.length - 1);
  return (
    <>
      <text x="18" y="22" fill="#546577" fontSize="11">누적 작업시간</text>
      {[24, 48].map(hours => <line key={hours} x1="18" x2="262" y1={148 - hours / 48 * 104} y2={148 - hours / 48 * 104} stroke="#d9dfe5" strokeDasharray="3 5" />)}
      <line x1="18" x2="262" y1="148" y2="148" stroke="#c5d1dc" />
      {stages.map((hours, index) => {
        const center = 18 + (index + .5) * slot;
        const height = hours / 48 * 104;
        const reached = index <= current;
        return <g key={index}><rect data-ceo-work-hours={hours} x={center - 13} y={148 - height} width="26" height={height} rx="4" fill={reached ? '#668dba' : '#e1e7ed'} /><text x={center} y={148 - height - 8} textAnchor="middle" fill={reached ? '#31587c' : '#687782'} fontSize="12" fontWeight="650">{hours}</text><text x={center} y="166" textAnchor="middle" fill="#546577" fontSize="11">{`0${index + 1}`}</text><title>{`${index + 1}단계 누적 작업시간 ${hours}시간`}</title></g>;
      })}
      <text x="140" y="193" textAnchor="middle" fill="#31587c" fontSize="26" fontWeight="650">{Math.round(scenario.values.time)}<tspan fontSize="13" dx="4">h</tspan></text>
      <text x="140" y="216" textAnchor="middle" fill="#546577" fontSize="11">하루가 아닌, 프로젝트 누적 시간</text>
    </>
  );
}

function CashWaterfall({ scenario }: Pick<ChartProps, 'scenario'>) {
  const total = scenario.cash.reduce((sum, row) => sum + row.value, 0);
  const changes = scenario.cash.map((row, index) => {
    const before = scenario.cash.slice(0, index).reduce((sum, item) => sum + item.value, 0);
    return { ...row, before, after: before + row.value };
  });
  const upper = 1000;
  const lower = -100;
  const y = (value: number) => 42 + (upper - value) / (upper - lower) * 126;
  const zero = y(0);
  const columns = changes.length + 1;
  const slot = 256 / columns;
  const barWidth = Math.min(32, slot * .66);
  const barX = (index: number) => 12 + index * slot + (slot - barWidth) / 2;
  const totalY = y(total);
  const totalColor = total < 0 ? '#9d493d' : '#825399';
  return (
    <>
      {lower < 0 && <rect x="12" y={zero} width="256" height={y(lower) - zero} fill="#f2ddd4" fillOpacity=".4" />}
      {[upper, lower].filter(value => value !== 0).map(value => <line key={value} x1="12" x2="268" y1={y(value)} y2={y(value)} stroke="#ddd8df" strokeDasharray="3 5" />)}
      <line data-ceo-cash-zero={zero} x1="12" x2="268" y1={zero} y2={zero} stroke="#a393a8" strokeWidth="1.2" />
      <text x="3" y={zero - 5} fill="#736677" fontSize="10">0</text>
      {changes.map((row, index) => {
        const x = barX(index);
        const high = Math.max(row.before, row.after);
        const from = y(row.before);
        const to = y(row.after);
        const fill = index === 0 ? '#c5b8cd' : row.value > 0 ? '#77bda2' : '#e7af85';
        return (
          <g key={row.label}>
            <line x1={x + barWidth} x2={barX(index + 1)} y1={y(row.after)} y2={y(row.after)} stroke="#a997b0" strokeDasharray="3 3" />
            <rect data-ceo-cash-value={row.value} x={x} y={Math.min(from, to)} width={barWidth} height={Math.abs(to - from)} rx="2.5" fill={fill} />
            <text x={x + barWidth / 2} y={y(high) - 8} textAnchor="middle" fill={row.value < 0 ? '#975a2e' : '#4c6557'} fontSize="12" fontWeight="650">{index > 0 && row.value > 0 ? '+' : ''}{row.value}</text>
            <text x={x + barWidth / 2} y="195" textAnchor="middle" fill="#645c65" fontSize="11.5">{row.label}</text>
          </g>
        );
      })}
      <rect data-ceo-cash-total={total} x={barX(changes.length)} y={Math.min(zero, totalY)} width={barWidth} height={Math.abs(totalY - zero)} rx="2.5" fill={totalColor} />
      <text x={barX(changes.length) + barWidth / 2} y={Math.min(zero, totalY) - 8} textAnchor="middle" fill={totalColor} fontSize="14" fontWeight="750">{total}</text>
      <text x={barX(changes.length) + barWidth / 2} y="195" textAnchor="middle" fill={totalColor} fontSize="11.5" fontWeight="650">잔고</text>
      <text x="140" y="216" textAnchor="middle" fill="#776a79" fontSize="11">단위: 만원 · 0선 아래는 마이너스 잔고</text>
    </>
  );
}

export function CeoMetricChart({ metric, scenario, progress, activeMetric }: ChartProps & { metric: CeoMetricId }) {
  const id = useId().replace(/:/g, '');
  const value = clamp(progress);
  const descriptions: Record<CeoMetricId, string> = {
    skill: `기술력 레이더. ${scenario.skills.map(row => `${row.label} ${row.value}`).join(', ')}. 각 축의 최대값은 100입니다.`,
    weight: `창작 캐릭터의 체중 계기판. 100부터 150kg 범위에서 현재 ${scenario.values.weight}kg입니다.`,
    time: `프로젝트 누적 작업시간입니다. 하루 시간 배분이 아닙니다. 다섯 단계 ${scenario.trend.time.map(hours => `${hours}시간`).join(', ')}. 현재 누적 ${scenario.values.time}시간입니다.`,
    capital: `창작 캐릭터의 자본 변화. 단위는 만원입니다. ${scenario.cash.map(row => `${row.label} ${row.value}만원`).join(', ')}. 최종 잔고 ${scenario.cash.reduce((sum, row) => sum + row.value, 0)}만원.`,
  };
  const label = CEO_METRICS.find(item => item.id === metric)?.label;
  return (
    <MetricSvg viewBox="0 0 280 220" data-ceo-stat-chart={metric} data-focused={activeMetric === metric} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>{`${scenario.label} ${label} 그래프`}</title>
      <desc id={`${id}-desc`}>{descriptions[metric]}</desc>
      {metric === 'skill' && <SkillRadar scenario={scenario} progress={1} />}
      {metric === 'weight' && <WeightGauge value={scenario.values.weight} />}
      {metric === 'time' && <WorkHoursBars scenario={scenario} progress={value} />}
      {metric === 'capital' && <CashWaterfall scenario={scenario} />}
    </MetricSvg>
  );
}

const TrendShell = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
  height: 200px;
  padding: 8px 8px 28px;
  box-sizing: border-box;
  > svg { display: block; width: 100%; height: 164px; overflow: visible; }
  .trend-x-labels { position: absolute; bottom: 0; height: 18px; left: calc(8px + (100% - 16px) / 90); right: calc(8px + (100% - 16px) / 90); color: #b4c4ba; font-size: 12px; font-variant-numeric: tabular-nums; }
  .trend-x-labels span { position: absolute; transform: translateX(-50%); white-space: nowrap; text-align: center; }
`;

const MetricSvg = styled.svg`
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 280 / 220;
  overflow: visible;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
`;
