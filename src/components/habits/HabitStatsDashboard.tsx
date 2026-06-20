import React, { useMemo } from 'react';
import styled from 'styled-components';
import {
  Activity,
  Flame,
  Info,
  Trash2,
  Download,
  TrendingUp,
  Trophy,
  Calendar,
  AlertCircle,
  HelpCircle,
  Lightbulb,
  Gauge,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useHabitStatsInsight, HabitRecordPoint } from './useHabitStatsInsight';

// ----------------------------------------------------
// Interfaces
// ----------------------------------------------------

interface DashboardCategory {
  id: string;
  name: string;
  color: string;
}

interface DashboardHabit {
  id: string;
  name: string;
  categoryId: string;
  mode: string;
  unit?: string;
}

interface DashboardWorkspace {
  categories: DashboardCategory[];
  habits: DashboardHabit[];
}

interface CompletionChartDatum {
  date: string;
  completion: number;
  records: number;
}

interface CategoryChartDatum {
  id: string;
  name: string;
  color: string;
  value: number;
  habitCount: number;
  records: number;
  completed?: number;
  total: number;
}

interface HabitRankDatum {
  habit: DashboardHabit;
  percent: number;
  streak: number;
  records?: number;
  completed?: number;
  total?: number;
  metricText?: string;
}

interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  color: string;
  contributesToScore?: boolean;
}

interface HabitStatsSummary {
  percent: number;
  total?: number;
  touched?: number;
  completed?: number;
}

type HabitChartDatum = Record<string, unknown>;

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function formatPercentDelta(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0%';
  return `${value > 0 ? '+' : ''}${value}%`;
}

function formatNumber(value: number | undefined, unit = ''): string {
  if (value === undefined || !Number.isFinite(value)) return '기록 없음';
  const formatted = new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
  return `${formatted}${unit}`;
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface HabitStatsDashboardProps {
  workspace: DashboardWorkspace;
  hasLoaded: boolean;
  statsPeriod: 'weekly' | 'monthly';
  setStatsPeriod: (period: 'weekly' | 'monthly') => void;
  selectedStatsHabitId: string;
  setSelectedStatsHabitId: (id: string) => void;
  itemStatsChartMode: 'progress' | 'value';
  setItemStatsChartMode: (mode: 'progress' | 'value') => void;
  selectedStatsMetricId: string;
  setSelectedStatsMetricId: (id: string) => void;
  statsRangeLabel: string;
  statsPeriodLabel: string;
  statsPeriodUnitLabel: string;
  rangeKeys: string[];
  activeRecordDays: number;
  bestStreak: number;
  completionChartData: CompletionChartDatum[];
  completionAxisMax: number;
  categoryChartData: CategoryChartDatum[];
  habitRankData: HabitRankDatum[];
  selectedStatsHabit: DashboardHabit | null;
  selectedStatsHabitColor: string;
  selectedHabitUsesTrendValue: boolean;
  selectedHabitMetricDefinitions: MetricDefinition[];
  selectedHabitHasMetricBreakdown: boolean;
  selectedValueMetric: MetricDefinition | null;
  selectedHabitStats: HabitStatsSummary;
  selectedHabitMetricText: string;
  selectedHabitStreak: number;
  selectedHabitRecordData: HabitRecordPoint[];
  selectedHabitChartData: HabitChartDatum[];
  selectedHabitProgressAxisMax: number;
  selectedHabitVisibleRecordRows: HabitRecordPoint[];
  selectedHabitRecordRows: HabitRecordPoint[];
  deleteRecordForDate: (dateKey: string, habitId: string) => void;
  handleQuickRecord: (habit: DashboardHabit, dateKey: string) => Promise<void> | void;
  handleExportSelectedHabitCsv: () => void;
}

// ----------------------------------------------------
// Styled Components (Premium Glassmorphism & Neon Tech)
// ----------------------------------------------------

const DashboardContainer = styled.div`
  display: grid;
  gap: 16px;
  padding: 16px;
  background: var(--habit-panel);
`;

const GlassPanel = styled.div`
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(12px);
  padding: 18px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.3);
  }
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
`;

const SectionTitle = styled.h3`
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--habit-text);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;

  span {
    background: linear-gradient(135deg, #eef5f0, var(--habit-muted));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

// AI Smart Insight Card
const InsightCard = styled(GlassPanel)`
  background: linear-gradient(
    135deg,
    rgba(66, 211, 146, 0.06) 0%,
    rgba(99, 179, 255, 0.04) 50%,
    rgba(7, 10, 15, 0.4) 100%
  );
  border: 1px solid rgba(66, 211, 146, 0.15);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 100%;
    background: linear-gradient(180deg, #42d392, #63b3ff);
  }
`;

const InsightGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin-top: 14px;
`;

const InsightRow = styled.div<{ $type: 'success' | 'warning' | 'info' }>`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 8px;
  background: ${(props) => {
    if (props.$type === 'success') return 'rgba(66, 211, 146, 0.06)';
    if (props.$type === 'warning') return 'rgba(255, 122, 89, 0.06)';
    return 'rgba(99, 179, 255, 0.06)';
  }};
  border: 1px solid ${(props) => {
    if (props.$type === 'success') return 'rgba(66, 211, 146, 0.12)';
    if (props.$type === 'warning') return 'rgba(255, 122, 89, 0.12)';
    return 'rgba(99, 179, 255, 0.12)';
  }};

  svg {
    flex-shrink: 0;
    color: ${(props) => {
      if (props.$type === 'success') return '#42d392';
      if (props.$type === 'warning') return '#ff7a59';
      return '#63b3ff';
    }};
    margin-top: 2px;
  }

  div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  h4 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 800;
    color: var(--habit-text);
  }

  p {
    margin: 0;
    font-size: 0.76rem;
    line-height: 1.45;
    color: var(--habit-muted);
  }
`;

const InsightBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 99px;
  background: rgba(66, 211, 146, 0.12);
  border: 1px solid rgba(66, 211, 146, 0.25);
  color: #8af0bd;
  font-size: 0.72rem;
  font-weight: 800;
`;

// Metrics UI
const PremiumStatsSummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 8px;
`;

const PremiumStatTile = styled.div<{ $color: string }>`
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, ${(props) => props.$color} 10%, transparent),
    rgba(255, 255, 255, 0.015) 60%
  );
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background: ${(props) => props.$color};
    opacity: 0.4;
  }

  .title-group {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--habit-muted);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .value-group {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 10px;

    strong {
      font-size: 1.45rem;
      font-weight: 900;
      color: var(--habit-text);
      line-height: 1;
    }

    .trend-indicator {
      font-size: 0.68rem;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
    }
  }

  .stat-footer {
    font-size: 0.68rem;
    color: var(--habit-dim);
    margin-top: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const InsightMatrix = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
`;

const MatrixItem = styled.div<{ $color: string }>`
  min-height: 92px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 18%, rgba(255, 255, 255, 0.06));
  border-radius: 10px;
  padding: 12px;
  display: grid;
  align-content: space-between;
  gap: 10px;
  background:
    linear-gradient(135deg, color-mix(in srgb, ${(props) => props.$color} 9%, transparent), transparent 70%),
    rgba(255, 255, 255, 0.018);

  span {
    font-size: 0.7rem;
    font-weight: 800;
    color: var(--habit-muted);
  }

  strong {
    font-size: 1.15rem;
    font-weight: 900;
    color: var(--habit-text);
    line-height: 1.1;
  }

  small {
    font-size: 0.66rem;
    line-height: 1.35;
    color: var(--habit-dim);
  }
`;

const WeekdayGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 720px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`;

const WeekdayCell = styled.div<{ $percent: number; $active: boolean }>`
  min-height: 86px;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  align-content: space-between;
  background:
    linear-gradient(
      180deg,
      rgba(66, 211, 146, ${(props) => (props.$active ? Math.min(0.28, 0.05 + props.$percent / 420) : 0.02)}),
      rgba(255, 255, 255, 0.012)
    );

  span {
    font-size: 0.68rem;
    font-weight: 850;
    color: var(--habit-muted);
  }

  strong {
    font-size: 1rem;
    font-weight: 900;
    color: ${(props) => (props.$active ? 'var(--habit-text)' : 'var(--habit-dim)')};
  }

  small {
    font-size: 0.62rem;
    color: var(--habit-dim);
  }
`;

const MetricBreakdownGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
`;

const MetricBreakdownRow = styled.div<{ $color: string }>`
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 18%, rgba(255, 255, 255, 0.06));
  border-radius: 10px;
  padding: 12px;
  display: grid;
  gap: 10px;
  background: rgba(255, 255, 255, 0.016);

  .metric-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    color: var(--habit-text);
    font-size: 0.82rem;
    font-weight: 900;
  }

  .metric-dot {
    width: 9px;
    height: 9px;
    border-radius: 99px;
    background: ${(props) => props.$color};
    box-shadow: 0 0 10px color-mix(in srgb, ${(props) => props.$color} 65%, transparent);
  }

  .metric-values {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .metric-values span {
    display: grid;
    gap: 3px;
    font-size: 0.62rem;
    color: var(--habit-dim);
  }

  .metric-values strong {
    font-size: 0.82rem;
    color: var(--habit-text);
    overflow-wrap: anywhere;
  }
`;

const RecordHeatMap = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18px, 1fr));
  gap: 5px;
`;

const RecordHeatCell = styled.div<{ $score: number; $touched: boolean; $color: string }>`
  aspect-ratio: 1;
  min-width: 18px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: ${(props) => props.$touched
    ? `color-mix(in srgb, ${props.$color} ${Math.min(Math.max(props.$score, 16), 100)}%, rgba(255,255,255,0.035))`
    : 'rgba(255, 255, 255, 0.025)'};
`;

// Detail Layout Grid
const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 16px;

  @media (max-width: 1120px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

// Period Switches
const PeriodSwitch = styled.div`
  height: 36px;
  padding: 2px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  display: inline-grid;
  grid-template-columns: repeat(auto-fit, minmax(68px, 1fr));
  gap: 2px;
  background: rgba(7, 10, 15, 0.4);
`;

const PeriodButton = styled.button<{ $active: boolean }>`
  border: 0;
  border-radius: 6px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.74rem;
  font-weight: 800;
  color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-muted)')};
  background: ${(props) => (props.$active ? 'var(--habit-green)' : 'transparent')};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-text)')};
    background: ${(props) => (props.$active ? 'var(--habit-green)' : 'rgba(255,255,255,0.06)')};
  }
`;

const SelectWrap = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const StyledSelect = styled.select`
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 0 10px;
  background: rgba(7, 10, 15, 0.4);
  color: var(--habit-text);
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: var(--habit-green);
  }
`;

const ChartWrapper = styled.div`
  width: 100%;
  height: 250px;
  margin-top: 14px;
`;

const ChartTitle = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  h4 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--habit-text);
  }

  span {
    font-size: 0.72rem;
    color: var(--habit-muted);
  }
`;

// Sparkline Track
const MiniTrack = styled.div`
  height: 6px;
  margin-top: 6px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
`;

const MiniFill = styled.div<{ $percent: number; $color: string }>`
  width: ${(props) => `${Math.min(props.$percent, 100)}%`};
  height: 100%;
  background: linear-gradient(90deg, ${(props) => props.$color}, color-mix(in srgb, ${(props) => props.$color} 60%, white));
  border-radius: 99px;
  box-shadow: 0 0 8px ${(props) => props.$color};
`;

// Dynamic Timeline Style
const TimelineContainer = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  margin-left: 10px;
  padding-left: 18px;
  border-left: 2px dashed rgba(255, 255, 255, 0.06);
  max-height: 480px;
  overflow-y: auto;
  gap: 14px;

  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 99px;
  }
`;

const TimelineItem = styled.div<{ $color: string }>`
  position: relative;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.015);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, ${(props) => props.$color} 30%, transparent);
    background: color-mix(in srgb, ${(props) => props.$color} 4%, transparent);
    box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.2);
  }

  &::before {
    content: '';
    position: absolute;
    left: -24px;
    top: 50%;
    transform: translateY(-50%);
    width: 10px;
    height: 10px;
    border-radius: 99px;
    background: ${(props) => props.$color};
    box-shadow: 0 0 8px ${(props) => props.$color};
  }
`;

const TimelineBadge = styled.div<{ $color: string }>`
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 800;
  color: ${(props) => props.$color};
  background: color-mix(in srgb, ${(props) => props.$color} 12%, transparent);
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 24%, transparent);
`;

const TimelineText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-left: 10px;
  flex-grow: 1;

  strong {
    font-size: 0.8rem;
    color: var(--habit-text);
    font-weight: 800;
  }

  span {
    font-size: 0.68rem;
    color: var(--habit-muted);
  }
`;

const TimelineScore = styled.div<{ $color: string }>`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;

  .score-val {
    font-size: 1.05rem;
    font-weight: 900;
    color: ${(props) => props.$color};
    line-height: 1;
  }
  .score-lbl {
    font-size: 0.62rem;
    color: var(--habit-dim);
  }
`;

const TimelineAction = styled.button`
  background: transparent;
  border: 0;
  color: var(--habit-dim);
  padding: 4px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  margin-left: 8px;

  &:hover {
    color: #ff7a59;
    background: rgba(255, 122, 89, 0.1);
  }
`;

// Grid / Table custom styling
const PremiumRankList = styled.div`
  display: grid;
  gap: 8px;
`;

const PremiumRankRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.015);
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.035);
  }
`;

const RankBadge = styled.div<{ $rank: number }>`
  width: 24px;
  height: 24px;
  border-radius: 99px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 900;
  margin-right: 10px;
  flex-shrink: 0;
  background: ${(props) => {
    if (props.$rank === 1) return 'linear-gradient(135deg, #ffd700, #ffa500)';
    if (props.$rank === 2) return 'linear-gradient(135deg, #c0c0c0, #808080)';
    if (props.$rank === 3) return 'linear-gradient(135deg, #cd7f32, #8b4513)';
    return 'rgba(255, 255, 255, 0.06)';
  }};
  color: ${(props) => (props.$rank <= 3 ? '#07100c' : 'var(--habit-muted)')};
  box-shadow: ${(props) => (props.$rank <= 3 ? '0 0 8px rgba(255, 215, 0, 0.2)' : 'none')};
`;

const InfoPanel = styled.div`
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: var(--habit-muted);
  background: rgba(7, 10, 15, 0.25);
  font-size: 0.7rem;
  line-height: 1.5;

  svg {
    color: var(--habit-green);
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

const CategoryStatRow = styled.div<{ $color: string }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.01);
  border-left: 3px solid ${(props) => props.$color};

  .details {
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
      font-size: 0.8rem;
      color: var(--habit-text);
    }
    span {
      font-size: 0.68rem;
      color: var(--habit-muted);
    }
  }

  .score {
    text-align: right;
    span {
      font-size: 0.95rem;
      font-weight: 850;
      color: ${(props) => props.$color};
    }
  }
`;

const CategoryCenterText = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;

  .value {
    font-size: 1.15rem;
    font-weight: 900;
    color: var(--habit-text);
  }
  .label {
    font-size: 0.62rem;
    color: var(--habit-muted);
    text-transform: uppercase;
  }
`;

const EmptyContainer = styled.div`
  padding: 40px;
  text-align: center;
  color: var(--habit-muted);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.01);
  display: grid;
  place-items: center;
  gap: 12px;

  svg {
    color: var(--habit-dim);
  }
`;

// Recharts Custom Tooltip
const customTooltipStyle = {
  background: 'rgba(16, 24, 33, 0.85)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '12px',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
  backdropFilter: 'blur(16px)',
  padding: '10px 14px',
  color: '#eef5f0',
  fontSize: '0.78rem',
};

// ----------------------------------------------------
// Main Component
// ----------------------------------------------------

export const HabitStatsDashboard: React.FC<HabitStatsDashboardProps> = ({
  workspace,
  hasLoaded,
  statsPeriod,
  setStatsPeriod,
  selectedStatsHabitId: _selectedStatsHabitId,
  setSelectedStatsHabitId,
  itemStatsChartMode,
  setItemStatsChartMode,
  selectedStatsMetricId: _selectedStatsMetricId,
  setSelectedStatsMetricId,
  statsRangeLabel,
  statsPeriodLabel,
  statsPeriodUnitLabel,
  rangeKeys,
  activeRecordDays,
  bestStreak,
  completionChartData,
  completionAxisMax,
  categoryChartData,
  habitRankData,
  selectedStatsHabit,
  selectedStatsHabitColor,
  selectedHabitUsesTrendValue,
  selectedHabitMetricDefinitions,
  selectedHabitHasMetricBreakdown,
  selectedValueMetric,
  selectedHabitStats,
  selectedHabitMetricText,
  selectedHabitStreak,
  selectedHabitRecordData,
  selectedHabitChartData,
  selectedHabitProgressAxisMax,
  selectedHabitVisibleRecordRows,
  selectedHabitRecordRows,
  deleteRecordForDate,
  handleQuickRecord,
  handleExportSelectedHabitCsv,
}) => {
  // 1. AI 스마트 인사이트 계산
  const insightResult = useHabitStatsInsight(
    selectedStatsHabit?.name ?? '선택된 항목 없음',
    selectedHabitRecordData,
    selectedHabitStreak
  );

  // 2. 카테고리 균형 도넛 차트 평균 달성률
  const categoryAverage = useMemo(() => {
    if (categoryChartData.length === 0) return 0;
    const total = categoryChartData.reduce((sum, cat) => sum + cat.value, 0);
    return Math.round(total / categoryChartData.length);
  }, [categoryChartData]);

  const activeSelectedRecords = useMemo(
    () => selectedHabitRecordData.filter((point) => point.touched),
    [selectedHabitRecordData]
  );

  const completedSelectedRecords = useMemo(
    () => activeSelectedRecords.filter((point) => point.completed).length,
    [activeSelectedRecords]
  );

  const selectedAverageScore = useMemo(() => {
    const score = average(activeSelectedRecords.map((point) => point.score));
    return score === undefined ? 0 : Math.round(score);
  }, [activeSelectedRecords]);

  const selectedBestPoint = useMemo(
    () => activeSelectedRecords.reduce<HabitRecordPoint | null>(
      (best, point) => (!best || point.score > best.score ? point : best),
      null
    ),
    [activeSelectedRecords]
  );

  const selectedTrendDelta = useMemo(() => {
    if (activeSelectedRecords.length < 4) return 0;
    const midpoint = Math.floor(activeSelectedRecords.length / 2);
    const previousAverage = average(activeSelectedRecords.slice(0, midpoint).map((point) => point.score)) ?? 0;
    const recentAverage = average(activeSelectedRecords.slice(midpoint).map((point) => point.score)) ?? 0;
    return Math.round(recentAverage - previousAverage);
  }, [activeSelectedRecords]);

  const selectedRecordRate = Math.round((activeSelectedRecords.length / Math.max(rangeKeys.length, 1)) * 100);
  const activeDayRate = Math.round((activeRecordDays / Math.max(rangeKeys.length, 1)) * 100);
  const selectedCompleteRate = Math.round((completedSelectedRecords / Math.max(rangeKeys.length, 1)) * 100);

  const weekdayPerformance = useMemo(() => {
    const baseStats = Array.from({ length: 7 }, (_, index) => ({
      dayIndex: index,
      label: WEEKDAY_NAMES[index],
      scores: [] as number[],
      count: 0,
    }));

    activeSelectedRecords.forEach((point) => {
      const date = new Date(`${point.dateKey}T00:00:00`);
      if (Number.isNaN(date.getTime())) return;
      const stat = baseStats[date.getDay()];
      stat.scores.push(point.score);
      stat.count += 1;
    });

    return baseStats.map((stat) => ({
      ...stat,
      averageScore: Math.round(average(stat.scores) ?? 0),
    }));
  }, [activeSelectedRecords]);

  const metricBreakdown = useMemo(() => {
    return selectedHabitMetricDefinitions.map((metric) => {
      const values = activeSelectedRecords
        .map((point) => point.metrics[metric.id]?.value)
        .filter((value): value is number => value !== undefined && Number.isFinite(value));
      const progressValues = activeSelectedRecords
        .map((point) => point.metrics[metric.id]?.progress)
        .filter((value): value is number => value !== undefined && Number.isFinite(value));
      const firstValue = values[0];
      const latestValue = values[values.length - 1];

      return {
        metric,
        averageValue: average(values),
        bestValue: values.length > 0 ? Math.max(...values) : undefined,
        latestValue,
        valueDelta: firstValue !== undefined && latestValue !== undefined ? latestValue - firstValue : undefined,
        averageProgress: Math.round(average(progressValues) ?? 0),
      };
    });
  }, [activeSelectedRecords, selectedHabitMetricDefinitions]);

  if (!workspace || workspace.habits.length === 0) {
    return (
      <DashboardContainer>
        <EmptyContainer>
          <HelpCircle size={40} />
          <h4>통계를 낼 습관 항목이 존재하지 않습니다.</h4>
          <p>습관 항목을 먼저 생성하고 매일 기록을 남겨보세요!</p>
        </EmptyContainer>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer>
      {/* ----------------------------------------------------
          AI Smart Insight 리포트 영역
          ---------------------------------------------------- */}
      {selectedStatsHabit && (
        <InsightCard>
          <SectionHeader style={{ marginBottom: '8px' }}>
            <SectionTitle>
              <Lightbulb size={18} style={{ color: '#42d392' }} />
              <span>AI 스마트 통계 인사이트</span>
            </SectionTitle>
            <InsightBadge>
              <Activity size={12} />
              실천 기조: {insightResult.trendLabel} ({insightResult.touchedRecordsCount}일 분석)
            </InsightBadge>
          </SectionHeader>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: 'var(--habit-muted)', lineHeight: '1.4' }}>
            기록 데이터를 심층 마이닝하여 행동 패턴과 실천 성향을 정밀 분석해 드립니다.
          </p>
          <InsightGrid>
            {insightResult.coachingMessages.map((msg) => (
              <InsightRow key={msg.id} $type={msg.type}>
                {msg.type === 'success' ? (
                  <Flame size={16} />
                ) : msg.type === 'warning' ? (
                  <AlertCircle size={16} />
                ) : (
                  <Info size={16} />
                )}
                <div>
                  <h4>{msg.title}</h4>
                  <p>{msg.content}</p>
                </div>
              </InsightRow>
            ))}
          </InsightGrid>
        </InsightCard>
      )}

      {/* ----------------------------------------------------
          핵심 지표 프리미엄 요약 카드 Grid (Growth Indicator 탑재)
          ---------------------------------------------------- */}
      <PremiumStatsSummaryGrid>
        <PremiumStatTile $color={selectedStatsHabitColor}>
          <div className="title-group">
            <span>{statsPeriodUnitLabel} 달성률</span>
            <TrendingUp size={14} style={{ color: selectedStatsHabitColor }} />
          </div>
          <div className="value-group">
            <strong>{selectedHabitStats.percent}%</strong>
            {selectedHabitStreak >= 3 && (
              <span className="trend-indicator" style={{ color: '#42d392' }}>
                연속 유지
              </span>
            )}
          </div>
          <div className="stat-footer">{selectedStatsHabit?.name ?? '습관'} · {selectedHabitMetricText}</div>
        </PremiumStatTile>

        <PremiumStatTile $color="#63b3ff">
          <div className="title-group">
            <span>선택 습관 기록률</span>
            <Calendar size={14} style={{ color: '#63b3ff' }} />
          </div>
          <div className="value-group">
            <strong>{selectedRecordRate}%</strong>
            <span className="trend-indicator" style={{ color: '#63b3ff' }}>
              {selectedHabitRecordRows.length}/{rangeKeys.length}일
            </span>
          </div>
          <div className="stat-footer">{statsRangeLabel} 기간 내 실제 입력 비중</div>
        </PremiumStatTile>

        <PremiumStatTile $color="#f8c64e">
          <div className="title-group">
            <span>현재 연속 일수</span>
            <Flame size={14} style={{ color: '#f8c64e' }} />
          </div>
          <div className="value-group">
            <strong>{selectedHabitStreak}일</strong>
            {selectedHabitStreak > 0 ? (
              <span className="trend-indicator" style={{ color: '#42d392' }}>
                진행 중
              </span>
            ) : (
              <span className="trend-indicator" style={{ color: 'var(--habit-muted)' }}>
                재시작 필요
              </span>
            )}
          </div>
          <div className="stat-footer">전체 항목 최장 연속: {bestStreak}일</div>
        </PremiumStatTile>

        <PremiumStatTile $color="#ff7a59">
          <div className="title-group">
            <span>요일 밸런스</span>
            <Trophy size={14} style={{ color: '#ff7a59' }} />
          </div>
          <div className="value-group">
            <strong style={{ fontSize: '1.05rem' }}>{insightResult.bestDayLabel}</strong>
            <span className="trend-indicator" style={{ color: '#42d392' }}>
              {insightResult.bestDayScore}% Best
            </span>
          </div>
          <div className="stat-footer">집중 요일: {insightResult.worstDayLabel} ({insightResult.worstDayScore}%)</div>
        </PremiumStatTile>
      </PremiumStatsSummaryGrid>

      <GlassPanel>
        <SectionHeader>
          <SectionTitle>
            <Gauge size={18} style={{ color: '#42d392' }} />
            <span>통계 완성도 진단</span>
          </SectionTitle>
          <span style={{ fontSize: '0.72rem', color: 'var(--habit-muted)' }}>
            {statsRangeLabel} · {statsPeriodLabel} 기준
          </span>
        </SectionHeader>
        <InsightMatrix>
          <MatrixItem $color="#42d392">
            <span>전체 기록 커버리지</span>
            <strong>{activeDayRate}%</strong>
            <small>{rangeKeys.length}일 중 {activeRecordDays}일에 하나 이상 기록했습니다.</small>
          </MatrixItem>
          <MatrixItem $color={selectedStatsHabitColor}>
            <span>선택 습관 평균 점수</span>
            <strong>{selectedAverageScore}%</strong>
            <small>기록된 날짜만 기준으로 평균 달성 강도를 계산했습니다.</small>
          </MatrixItem>
          <MatrixItem $color="#f8c64e">
            <span>목표 완료 밀도</span>
            <strong>{selectedCompleteRate}%</strong>
            <small>{completedSelectedRecords}/{rangeKeys.length}일이 100% 이상입니다.</small>
          </MatrixItem>
          <MatrixItem $color={selectedTrendDelta >= 0 ? '#42d392' : '#ff7a59'}>
            <span>최근 흐름 변화</span>
            <strong>{formatPercentDelta(selectedTrendDelta)}</strong>
            <small>선택 기간의 앞 구간 평균과 뒤 구간 평균을 비교했습니다.</small>
          </MatrixItem>
          <MatrixItem $color="#63b3ff">
            <span>최고 기록일</span>
            <strong>{selectedBestPoint ? `${selectedBestPoint.score}%` : '기록 없음'}</strong>
            <small>{selectedBestPoint ? `${selectedBestPoint.dateKey} · ${selectedBestPoint.metricText}` : '선택 기간 기록이 필요합니다.'}</small>
          </MatrixItem>
        </InsightMatrix>
      </GlassPanel>

      <StatsGrid>
        <GlassPanel>
          <SectionHeader>
            <SectionTitle>
              <Calendar size={18} style={{ color: '#63b3ff' }} />
              <span>요일별 실천 패턴</span>
            </SectionTitle>
            <span style={{ fontSize: '0.72rem', color: 'var(--habit-muted)' }}>선택 습관 기록 기준</span>
          </SectionHeader>
          <WeekdayGrid>
            {weekdayPerformance.map((day) => (
              <WeekdayCell key={day.dayIndex} $percent={day.averageScore} $active={day.count > 0}>
                <span>{day.label}요일</span>
                <strong>{day.count > 0 ? `${day.averageScore}%` : '-'}</strong>
                <small>{day.count}회 기록</small>
              </WeekdayCell>
            ))}
          </WeekdayGrid>
        </GlassPanel>

        <GlassPanel>
          <SectionHeader>
            <SectionTitle>
              <Activity size={18} style={{ color: selectedStatsHabitColor }} />
              <span>기간 기록 히트맵</span>
            </SectionTitle>
            <span style={{ fontSize: '0.72rem', color: 'var(--habit-muted)' }}>색이 진할수록 달성률이 높습니다.</span>
          </SectionHeader>
          <RecordHeatMap>
            {selectedHabitRecordData.map((point) => (
              <RecordHeatCell
                key={point.dateKey}
                $score={point.score}
                $touched={point.touched}
                $color={selectedStatsHabitColor}
                title={`${point.dateKey} · ${point.touched ? `${point.score}% · ${point.metricText}` : '기록 없음'}`}
              />
            ))}
          </RecordHeatMap>
        </GlassPanel>
      </StatsGrid>

      {metricBreakdown.length > 0 && (
        <GlassPanel>
          <SectionHeader>
            <SectionTitle>
              <TrendingUp size={18} style={{ color: selectedStatsHabitColor }} />
              <span>지표별 상세 해석</span>
            </SectionTitle>
            <span style={{ fontSize: '0.72rem', color: 'var(--habit-muted)' }}>
              목표 반영 지표와 참고 지표를 분리해서 확인합니다.
            </span>
          </SectionHeader>
          <MetricBreakdownGrid>
            {metricBreakdown.map(({ metric, averageValue, bestValue, latestValue, valueDelta, averageProgress }) => (
              <MetricBreakdownRow key={metric.id} $color={metric.color}>
                <div className="metric-head">
                  <span>{metric.label}</span>
                  <i className="metric-dot" aria-hidden="true" />
                </div>
                <div className="metric-values">
                  <span>
                    평균
                    <strong>{formatNumber(averageValue, metric.unit)}</strong>
                  </span>
                  <span>
                    최고
                    <strong>{formatNumber(bestValue, metric.unit)}</strong>
                  </span>
                  <span>
                    최근
                    <strong>{formatNumber(latestValue, metric.unit)}</strong>
                  </span>
                </div>
                <MiniTrack>
                  <MiniFill $percent={averageProgress} $color={metric.color} />
                </MiniTrack>
                <small style={{ color: 'var(--habit-dim)', fontSize: '0.66rem' }}>
                  평균 달성률 {averageProgress}% · 첫 기록 대비 {valueDelta === undefined ? '비교 불가' : formatNumber(valueDelta, metric.unit)}
                  {metric.contributesToScore === false ? ' · 평균 점수 제외 지표' : ''}
                </small>
              </MetricBreakdownRow>
            ))}
          </MetricBreakdownGrid>
        </GlassPanel>
      )}

      {/* ----------------------------------------------------
          개별 습관 흐름분석 패널 (Glassmorphism + Dynamic Chart)
          ---------------------------------------------------- */}
      <GlassPanel style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${selectedStatsHabitColor} 5%, transparent), transparent 40%), rgba(255, 255, 255, 0.02)`
      }}>
        {selectedStatsHabit ? (
          <>
            <SectionHeader>
              <SelectWrap>
                <SectionTitle>
                  <Activity size={18} style={{ color: selectedStatsHabitColor }} />
                  <span>{selectedStatsHabit.name} 흐름 분석</span>
                </SectionTitle>
                <StyledSelect
                  value={selectedStatsHabit.id}
                  onChange={(e) => setSelectedStatsHabitId(e.target.value)}
                  aria-label="통계 대상 습관 선택"
                >
                  {workspace.habits.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </StyledSelect>
              </SelectWrap>
              <SelectWrap>
                {selectedHabitUsesTrendValue && (
                  <PeriodSwitch>
                    <PeriodButton $active={itemStatsChartMode === 'progress'} onClick={() => setItemStatsChartMode('progress')}>
                      달성률
                    </PeriodButton>
                    <PeriodButton $active={itemStatsChartMode === 'value'} onClick={() => setItemStatsChartMode('value')}>
                      실제값
                    </PeriodButton>
                  </PeriodSwitch>
                )}
                {selectedHabitHasMetricBreakdown && itemStatsChartMode === 'value' && (
                  <PeriodSwitch>
                    {selectedHabitMetricDefinitions.map((metric) => (
                      <PeriodButton
                        key={metric.id}
                        $active={selectedValueMetric?.id === metric.id}
                        onClick={() => setSelectedStatsMetricId(metric.id)}
                      >
                        {metric.label}
                      </PeriodButton>
                    ))}
                  </PeriodSwitch>
                )}
                <button
                  type="button"
                  onClick={handleExportSelectedHabitCsv}
                  title="CSV 내보내기"
                  style={{
                    height: '36px',
                    width: '36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(7,10,15,0.4)',
                    color: 'var(--habit-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                >
                  <Download size={15} />
                </button>
              </SelectWrap>
            </SectionHeader>

            <DetailGrid>
              <div>
                <ChartTitle>
                  <h4>실천 시계열 흐름</h4>
                  <span>기준: {statsPeriodLabel} ({statsRangeLabel})</span>
                </ChartTitle>
                <ChartWrapper>
                  {hasLoaded ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={selectedHabitChartData}>
                        <defs>
                          <linearGradient id="selectedHabitFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={selectedStatsHabitColor} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={selectedStatsHabitColor} stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255, 255, 255, 0.03)" vertical={false} />
                        <XAxis dataKey="dateLabel" tick={{ fill: '#91a0ac', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis
                          tick={{ fill: '#91a0ac', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          domain={selectedHabitUsesTrendValue && itemStatsChartMode === 'value' ? ['auto', 'auto'] : [0, selectedHabitProgressAxisMax]}
                        />
                        <Tooltip contentStyle={customTooltipStyle} />
                        {!(selectedHabitUsesTrendValue && itemStatsChartMode === 'value') && (
                          <ReferenceLine y={100} stroke="rgba(66, 211, 146, 0.3)" strokeDasharray="4 4" label={{ value: '목표 100%', fill: '#91a0ac', fontSize: 10 }} />
                        )}
                        {selectedHabitHasMetricBreakdown ? (
                          itemStatsChartMode === 'value' && selectedValueMetric ? (
                            <Line
                              type="monotone"
                              dataKey={`metric_${selectedValueMetric.id}`}
                              name={selectedValueMetric.label}
                              unit={selectedValueMetric.unit}
                              stroke={selectedValueMetric.color}
                              strokeWidth={3}
                              dot={{ strokeWidth: 1, r: 3 }}
                            />
                          ) : (
                            selectedHabitMetricDefinitions.map((metric) => (
                              <Line
                                type="monotone"
                                key={metric.id}
                                dataKey={`metricProgress_${metric.id}`}
                                name={`${metric.label} 달성률`}
                                unit="%"
                                stroke={metric.color}
                                strokeWidth={metric.contributesToScore === false ? 1.8 : 2.5}
                                strokeDasharray={metric.contributesToScore === false ? '4 4' : undefined}
                                dot={false}
                              />
                            ))
                          )
                        ) : (
                          <Area
                            type="monotone"
                            dataKey={selectedHabitUsesTrendValue && itemStatsChartMode === 'value' ? 'value' : 'score'}
                            name={selectedHabitUsesTrendValue && itemStatsChartMode === 'value' ? '기록값' : '달성률'}
                            unit={selectedHabitUsesTrendValue && itemStatsChartMode === 'value' ? (selectedStatsHabit.unit || '') : '%'}
                            stroke={selectedStatsHabitColor}
                            strokeWidth={3}
                            fill="url(#selectedHabitFill)"
                          />
                        )}
                        {selectedHabitUsesTrendValue && !selectedHabitHasMetricBreakdown && itemStatsChartMode === 'value' && (
                          <Line
                            type="monotone"
                            dataKey="movingAverage"
                            name="7일 평균선"
                            unit={selectedStatsHabit.unit || ''}
                            stroke="#f8c64e"
                            strokeWidth={2}
                            dot={false}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--habit-muted)' }}>통계 로딩 중...</div>
                  )}
                </ChartWrapper>

                <InfoPanel style={{ marginTop: '16px' }}>
                  <Info size={14} />
                  <span>
                    <strong>계산 산식 및 분석 리포트 기준:</strong> 달성률은 선택된 목표 지향성 및 가중치 조건에 따라 정량 연산됩니다. 100%를 초과하는 수치는 목표 초과 달성 성과를 반사하며, 참고 지표는 전체 평균 스코어 연산에서 배제됩니다.
                  </span>
                </InfoPanel>
              </div>

              {/* ----------------------------------------------------
                  기록 히스토리 타임라인 피드 개편
                  ---------------------------------------------------- */}
              <div>
                <ChartTitle style={{ marginBottom: '12px' }}>
                  <h4>수직 타임라인 기록</h4>
                  <span>최근 입력 순</span>
                </ChartTitle>

                <TimelineContainer>
                  {selectedHabitRecordRows.length > 0 ? (
                    selectedHabitVisibleRecordRows.map((point) => (
                      <TimelineItem
                        key={point.dateKey}
                        $color={selectedStatsHabitColor}
                        onClick={() => void handleQuickRecord(selectedStatsHabit, point.dateKey)}
                        title="기록 즉시 편집"
                      >
                        <TimelineBadge $color={selectedStatsHabitColor}>
                          {point.dateLabel}
                        </TimelineBadge>

                        <TimelineText>
                          <strong>{point.metricText || '기록값 없음'}</strong>
                          <span>{point.dateKey} · {point.completed ? '🎯 목표 달성' : '🏃 실천 진행 중'}</span>
                          {point.score > 100 && (
                            <div style={{ marginTop: '4px' }}>
                              <span style={{ fontSize: '0.62rem', color: selectedStatsHabitColor, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', border: `1px solid color-mix(in srgb, ${selectedStatsHabitColor} 30%, transparent)` }}>
                                목표 초과 +{point.score - 100}%
                              </span>
                            </div>
                          )}
                        </TimelineText>

                        <TimelineScore $color={selectedStatsHabitColor}>
                          <span className="score-val">{point.score}%</span>
                          <span className="score-lbl">달성률</span>
                        </TimelineScore>

                        <TimelineAction
                          type="button"
                          title="기록 삭제"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRecordForDate(point.dateKey, selectedStatsHabit.id);
                          }}
                        >
                          <Trash2 size={13} />
                        </TimelineAction>
                      </TimelineItem>
                    ))
                  ) : (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--habit-muted)', fontSize: '0.78rem' }}>
                      선택된 분석 기간에 실천 기록이 존재하지 않습니다.
                    </div>
                  )}
                </TimelineContainer>
              </div>
            </DetailGrid>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>선택된 항목 정보를 로딩 중입니다...</div>
        )}
      </GlassPanel>

      {/* ----------------------------------------------------
          하단 분석 카드 섹션 (Area Chart / Bar Chart / HeatMap)
          ---------------------------------------------------- */}
      <StatsGrid>
        <GlassPanel>
          <SectionHeader>
            <SectionTitle>
              <Activity size={18} style={{ color: '#42d392' }} />
              <span>전체 습관 종합 달성률</span>
            </SectionTitle>
            <PeriodSwitch>
              <PeriodButton $active={statsPeriod === 'weekly'} onClick={() => setStatsPeriod('weekly')}>
                주별
              </PeriodButton>
              <PeriodButton $active={statsPeriod === 'monthly'} onClick={() => setStatsPeriod('monthly')}>
                월별
              </PeriodButton>
            </PeriodSwitch>
          </SectionHeader>

          <ChartTitle>
            <h4>{statsPeriod === 'weekly' ? '최근 12주 달성도 추이' : '최근 12개월 달성도 추이'}</h4>
            <span>평균 스코어 시각화</span>
          </ChartTitle>

          <ChartWrapper>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={completionChartData}>
                <defs>
                  <linearGradient id="comfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#42d392" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#42d392" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255, 255, 255, 0.03)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#91a0ac', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#91a0ac', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, completionAxisMax]} />
                <Tooltip contentStyle={customTooltipStyle} />
                <Area type="monotone" dataKey="completion" stroke="#42d392" strokeWidth={3} fill="url(#comfill)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </GlassPanel>

        <GlassPanel>
          <SectionHeader>
            <SectionTitle>
              <TrendingUp size={18} style={{ color: '#63b3ff' }} />
              <span>기록 빈도 분석</span>
            </SectionTitle>
          </SectionHeader>

          <ChartTitle>
            <h4>{statsPeriod === 'weekly' ? '주간' : '월간'} 누적 입력 볼륨</h4>
            <span>실행 횟수 합계</span>
          </ChartTitle>

          <ChartWrapper>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completionChartData}>
                <CartesianGrid stroke="rgba(255, 255, 255, 0.03)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#91a0ac', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#91a0ac', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={customTooltipStyle} />
                <Bar dataKey="records" fill="#63b3ff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </GlassPanel>
      </StatsGrid>

      {/* ----------------------------------------------------
          카테고리 밸런스 도넛 차트 및 항목 랭킹 카드 섹션
          ---------------------------------------------------- */}
      <StatsGrid>
        <GlassPanel>
          <SectionHeader>
            <SectionTitle>
              <Trophy size={18} style={{ color: '#f8c64e' }} />
              <span>카테고리 실천 균형</span>
            </SectionTitle>
          </SectionHeader>

          <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: '16px', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '150px', height: '150px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {categoryChartData.map((entry) => (
                      <Cell key={entry.id} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <CategoryCenterText>
                <div className="value">{categoryAverage}%</div>
                <div className="label">평균 달성</div>
              </CategoryCenterText>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {categoryChartData.map((category) => (
                <CategoryStatRow key={category.id} $color={category.color}>
                  <div className="details">
                    <strong>{category.name}</strong>
                    <span>항목 {category.habitCount}개 · 기록 {category.records}/{category.total}</span>
                    <MiniTrack style={{ width: '100px', height: '4px', marginTop: '3px' }}>
                      <MiniFill $percent={category.value} $color={category.color} />
                    </MiniTrack>
                  </div>
                  <div className="score">
                    <span>{category.value}%</span>
                  </div>
                </CategoryStatRow>
              ))}
            </div>
          </div>
        </GlassPanel>

        <GlassPanel>
          <SectionHeader>
            <SectionTitle>
              <Trophy size={18} style={{ color: '#ffd700' }} />
              <span>습관 항목 랭킹</span>
            </SectionTitle>
            <span style={{ fontSize: '0.68rem', color: 'var(--habit-muted)' }}>달성률 및 Streak 기반</span>
          </SectionHeader>

          <PremiumRankList>
            {habitRankData.slice(0, 5).map(({ habit, percent, streak }, idx) => {
              const category = workspace.categories.find((item) => item.id === habit.categoryId);
              const color = category?.color ?? '#42d392';
              return (
                <PremiumRankRow key={habit.id}>
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <RankBadge $rank={idx + 1}>{idx + 1}</RankBadge>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--habit-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {habit.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--habit-muted)', marginTop: '2px' }}>
                        {category?.name ?? '카테고리'} · {streak}일 연속 실천
                      </div>
                      <MiniTrack style={{ width: '120px', height: '4px', marginTop: '4px' }}>
                        <MiniFill $percent={percent} $color={color} />
                      </MiniTrack>
                    </div>
                  </div>

                  <TimelineScore $color={color}>
                    <span className="score-val">{percent}%</span>
                    <span className="score-lbl">달성률</span>
                  </TimelineScore>
                </PremiumRankRow>
              );
            })}
          </PremiumRankList>
        </GlassPanel>
      </StatsGrid>
    </DashboardContainer>
  );
};

export default HabitStatsDashboard;
