export type GoalDirection = 'increase' | 'decrease' | 'maintain';
export type MetricAggregationMode = 'average' | 'sum' | 'max' | 'min' | 'latest';

export interface HabitRecordMetricPoint {
  value?: number;
  progress: number;
  movingAverage?: number;
}

export interface TrendMetricDefinition {
  id: string;
  label: string;
  unit: string;
  color: string;
  target?: number;
  contributesToScore?: boolean;
}

export interface MetricGoalConfig {
  direction?: GoalDirection;
  aggregation?: MetricAggregationMode;
  baseline?: number;
  target?: number;
  minTarget?: number;
  maxTarget?: number;
}

export type MetricGoalScoreConfig = Required<Pick<MetricGoalConfig, 'direction' | 'target'>> & MetricGoalConfig;

export interface TrendValueSummary {
  values: number[];
  average?: number;
  aggregate?: number;
  first?: number;
  last?: number;
}

export interface HabitTrendStats {
  average?: number;
  previousAverage?: number;
  change?: number;
  previousChange?: number;
  progress: number;
  progressLabel: string;
  trendLabel: string;
}

export interface HabitMetricSummary extends TrendMetricDefinition {
  aggregation: MetricAggregationMode;
  average?: number;
  previousAverage?: number;
  change?: number;
  previousChange?: number;
  previousProgress: number;
  progress: number;
  direction: GoalDirection;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isMetricAggregationMode(value: unknown): value is MetricAggregationMode {
  return value === 'average' || value === 'sum' || value === 'max' || value === 'min' || value === 'latest';
}

export function normalizeMetricGoalConfig(value: unknown): MetricGoalConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const source = value as Partial<Record<keyof MetricGoalConfig, unknown>>;
  const direction = source.direction === 'decrease' || source.direction === 'maintain' || source.direction === 'increase'
    ? source.direction
    : undefined;
  const aggregation = isMetricAggregationMode(source.aggregation) ? source.aggregation : undefined;
  const goal: MetricGoalConfig = {};

  if (direction) goal.direction = direction;
  if (aggregation) goal.aggregation = aggregation;

  const baseline = readFiniteNumber(source.baseline);
  const target = readFiniteNumber(source.target);
  const minTarget = readFiniteNumber(source.minTarget);
  const maxTarget = readFiniteNumber(source.maxTarget);

  if (baseline !== undefined) goal.baseline = baseline;
  if (target !== undefined) goal.target = target;
  if (minTarget !== undefined) goal.minTarget = minTarget;
  if (maxTarget !== undefined) goal.maxTarget = maxTarget;

  return Object.keys(goal).length > 0 ? goal : undefined;
}

export function getGoalScore(goal: MetricGoalScoreConfig, value?: number): number {
  if (value === undefined || !Number.isFinite(value)) return 0;

  const direction = goal.direction;
  const target = Number.isFinite(goal.target) ? Number(goal.target) : 0;

  if (direction === 'decrease') {
    const baseline = Number.isFinite(goal.baseline) ? Number(goal.baseline) : undefined;
    if (baseline !== undefined && baseline > target) {
      return Math.max((baseline - value) / (baseline - target), 0);
    }

    if (value <= target) return target > 0 ? Math.max(target / Math.max(value, 0.000001), 1) : 1;
    return target > 0 ? clamp(target / value, 0, 1) : 0;
  }

  if (direction === 'maintain') {
    const rawMin = Number.isFinite(goal.minTarget) ? Number(goal.minTarget) : target;
    const rawMax = Number.isFinite(goal.maxTarget) ? Number(goal.maxTarget) : target;
    const min = Math.min(rawMin, rawMax);
    const max = Math.max(rawMin, rawMax);
    if (value >= min && value <= max) return 1;
    if (value < min) return min > 0 ? clamp(value / min, 0, 1) : 0;
    return value > 0 ? clamp(max / value, 0, 1) : 0;
  }

  const baseline = Number.isFinite(goal.baseline) ? Number(goal.baseline) : undefined;
  if (baseline !== undefined && target > baseline) {
    return Math.max((value - baseline) / (target - baseline), 0);
  }

  if (target > 0) return Math.max(value / target, 0);
  return value > 0 ? 1 : 0;
}
