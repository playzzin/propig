'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled, { css } from 'styled-components';
import Swal from 'sweetalert2';
import { toast } from 'sonner';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  Dumbbell,
  Flame,
  Gauge,
  LogIn,
  ListPlus,
  Download,
  Info,
  Minus,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  Star,
  SquareCheckBig,
  Tags,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
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
import { useAuth } from '@/contexts/AuthContext';
import { db, ensureFirestorePersistence } from '@/firebase/config';
import {
  getGoalScore,
  normalizeMetricGoalConfig,
  type GoalDirection,
  type HabitMetricSummary,
  type HabitRecordMetricPoint,
  type HabitTrendStats,
  type MetricAggregationMode,
  type MetricGoalConfig,
  type MetricGoalScoreConfig,
  type TrendMetricDefinition,
  type TrendValueSummary,
} from './habitMetricStats';
import { HabitStatsDashboard } from './HabitStatsDashboard';

type HabitView = 'daily' | 'stats' | 'manage' | 'manual';
type ManageSection = 'habits' | 'categories';
type DailyRecordLayout = 'detail' | 'simple';
type RecordMode =
  | 'check'
  | 'cardio'
  | 'strength'
  | 'number'
  | 'sets'
  | 'duration'
  | 'rating'
  | 'singleChoice'
  | 'multiChoice'
  | 'note';
type StatsPeriod = 'weekly' | 'monthly';
type WeekendTone = 'weekday' | 'saturday' | 'sunday';
type ItemStatsChartMode = 'progress' | 'value';

interface HabitTrackerAppProps {
  initialView?: HabitView;
}

interface HabitCategory {
  id: string;
  name: string;
  color: string;
  order?: number;
}

interface HabitItem {
  id: string;
  categoryId: string;
  name: string;
  order?: number;
  mode: RecordMode;
  target: number;
  unit: string;
  goalDirection?: GoalDirection;
  baseline?: number;
  minTarget?: number;
  maxTarget?: number;
  metricGoals?: Record<string, MetricGoalConfig>;
  secondaryTarget?: number;
  secondaryUnit?: string;
  tertiaryTarget?: number;
  tertiaryUnit?: string;
  options?: ChoiceOption[];
}

interface CategoryDraft {
  name: string;
  color: string;
  order: number;
}

interface SetEntry {
  id: string;
  reps: number;
  load: number;
}

interface ChoiceOption {
  id: string;
  label: string;
}

interface TodoEntry {
  id: string;
  text: string;
  done: boolean;
}

interface HabitRecord {
  checked?: boolean;
  value?: number;
  distance?: number;
  minutes?: number;
  load?: number;
  reps?: number;
  setCount?: number;
  rating?: number;
  note?: string;
  todos?: TodoEntry[];
  sets?: SetEntry[];
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  updatedAt?: string;
}

interface HabitWorkspace {
  categories: HabitCategory[];
  habits: HabitItem[];
  records: Record<string, Record<string, HabitRecord>>;
}

interface StatsSummary {
  total: number;
  touched: number;
  completed: number;
  percent: number;
}

interface StatsBucket {
  id: string;
  label: string;
  caption: string;
  startKey: string;
  endKey: string;
  dateKeys: string[];
  stats: StatsSummary;
}

interface HabitRecordPoint {
  dateKey: string;
  dateLabel: string;
  score: number;
  value?: number;
  movingAverage?: number;
  touched: boolean;
  completed: boolean;
  metricText: string;
  metrics: Record<string, HabitRecordMetricPoint>;
}

interface HabitChartPoint extends HabitRecordPoint {
  [key: string]: string | number | boolean | Record<string, HabitRecordMetricPoint> | undefined;
}

interface QuickRecordField {
  id: string;
  label: string;
  unit: string;
  value?: number;
  step: number;
  placeholder: number;
}

interface HabitDraft {
  name: string;
  categoryId: string;
  order: number;
  mode: RecordMode;
  target: number;
  unit: string;
  goalDirection?: GoalDirection;
  baseline?: number;
  minTarget?: number;
  maxTarget?: number;
  metricGoals?: Record<string, MetricGoalConfig>;
  secondaryTarget?: number;
  secondaryUnit?: string;
  tertiaryTarget?: number;
  tertiaryUnit?: string;
  options: ChoiceOption[];
  suggestedCategoryName?: string;
  suggestedCategoryColor?: string;
}

interface ModeMeta {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  unit: string;
  target: number;
  secondaryUnit?: string;
  secondaryTarget?: number;
  tertiaryUnit?: string;
  tertiaryTarget?: number;
}

interface HabitPreset {
  id: string;
  label: string;
  summary: string;
  categoryName: string;
  categoryColor: string;
  mode: RecordMode;
  target?: number;
  unit?: string;
  goalDirection?: GoalDirection;
  secondaryTarget?: number;
  secondaryUnit?: string;
  tertiaryTarget?: number;
  tertiaryUnit?: string;
  options?: string[];
}

const DATE_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const CATEGORY_COLORS = ['#42d392', '#ff7a59', '#63b3ff', '#f8c64e', '#a78bfa', '#2dd4bf'];
const WEEKEND_ACCENTS: Record<Exclude<WeekendTone, 'weekday'>, { text: string; border: string; background: string; solid: string }> = {
  saturday: {
    text: '#0ea5e9',
    border: 'rgba(2, 132, 199, 0.72)',
    background: 'rgba(2, 132, 199, 0.14)',
    solid: '#0284c7',
  },
  sunday: {
    text: '#f43f5e',
    border: 'rgba(225, 29, 72, 0.72)',
    background: 'rgba(225, 29, 72, 0.14)',
    solid: '#e11d48',
  },
};
const EMPTY_WORKSPACE: HabitWorkspace = {
  categories: [],
  habits: [],
  records: {},
};
const EMPTY_STATS_SUMMARY: StatsSummary = { total: 0, touched: 0, completed: 0, percent: 0 };

const MODE_META: Record<RecordMode, ModeMeta> = {
  check: { label: '체크만 하기', shortLabel: '체크', icon: SquareCheckBig, unit: '회', target: 1 },
  cardio: { label: '거리 + 시간', shortLabel: '거리', icon: Timer, unit: 'km', target: 10, secondaryUnit: '분', secondaryTarget: 60 },
  strength: { label: '무게 + 회수 + 세트', shortLabel: '근력', icon: Dumbbell, unit: 'kg', target: 50, secondaryUnit: '회', secondaryTarget: 3, tertiaryUnit: '세트', tertiaryTarget: 5 },
  number: { label: '숫자로 기록', shortLabel: '숫자', icon: Gauge, unit: '회', target: 10 },
  sets: { label: '상세 세트', shortLabel: '세트', icon: Dumbbell, unit: '회', target: 36 },
  duration: { label: '시간으로 기록', shortLabel: '시간', icon: Timer, unit: '분', target: 30 },
  rating: { label: '별점으로 기록', shortLabel: '점수', icon: Star, unit: '점', target: 5 },
  singleChoice: { label: '하나 고르기', shortLabel: '선택', icon: Target, unit: '개', target: 1 },
  multiChoice: { label: '여러 개 고르기', shortLabel: '복수', icon: ListPlus, unit: '개', target: 1 },
  note: { label: '기존 메모', shortLabel: '메모', icon: ListPlus, unit: '개', target: 1 },
};

const SELECTABLE_RECORD_MODES: RecordMode[] = ['check', 'duration', 'number', 'rating', 'cardio', 'strength', 'singleChoice', 'multiChoice'];
const TREND_RECORD_MODES: RecordMode[] = ['cardio', 'strength', 'number', 'sets', 'duration', 'rating'];
const DEFAULT_CHOICE_LABELS = ['선택 항목 1', '선택 항목 2', '선택 항목 3'];
const TREND_METRIC_COLORS = ['#42d392', '#63b3ff', '#f8c64e', '#ff7a59', '#a78bfa'];
const DAILY_RECORD_LAYOUT_STORAGE_KEY = 'habit-tracker:daily-record-layout';
const QUICK_HABIT_PRESETS: HabitPreset[] = [
  { id: 'supplement', label: '영양제', summary: '체크만 하기', categoryName: '건강', categoryColor: '#42d392', mode: 'check' },
  { id: 'meditation', label: '명상', summary: '10분 기록', categoryName: '마음', categoryColor: '#a78bfa', mode: 'duration', target: 10, unit: '분' },
  { id: 'water', label: '물 마시기', summary: '하루 8잔', categoryName: '건강', categoryColor: '#42d392', mode: 'number', target: 8, unit: '잔' },
  { id: 'condition', label: '컨디션', summary: '별점 5점', categoryName: '건강', categoryColor: '#42d392', mode: 'rating', target: 5, unit: '점' },
  { id: 'running', label: '러닝', summary: '5km + 30분', categoryName: '운동', categoryColor: '#63b3ff', mode: 'cardio', target: 5, unit: 'km', secondaryTarget: 30, secondaryUnit: '분' },
  { id: 'workout', label: '근력 운동', summary: '40kg / 10회 / 3세트', categoryName: '운동', categoryColor: '#63b3ff', mode: 'strength', target: 40, unit: 'kg', secondaryTarget: 10, secondaryUnit: '회', tertiaryTarget: 3, tertiaryUnit: '세트' },
  { id: 'meal-choice', label: '식사 컨디션', summary: '하나 고르기', categoryName: '식단', categoryColor: '#ff7a59', mode: 'singleChoice', options: ['가볍게', '보통', '든든하게'] },
  { id: 'evening-routine', label: '저녁 루틴', summary: '여러 개 고르기', categoryName: '루틴', categoryColor: '#2dd4bf', mode: 'multiChoice', options: ['스트레칭', '정리', '일기'] },
];
const STARTER_HABIT_PRESET_IDS = QUICK_HABIT_PRESETS.map((preset) => preset.id);
const GOAL_DIRECTION_META: Record<GoalDirection, { label: string; shortLabel: string; hint: string }> = {
  increase: {
    label: '올리기',
    shortLabel: '상승',
    hint: '값이 높아질수록 좋은 항목입니다.',
  },
  decrease: {
    label: '낮추기',
    shortLabel: '감소',
    hint: '값이 낮아질수록 좋은 항목입니다.',
  },
  maintain: {
    label: '범위 유지',
    shortLabel: '유지',
    hint: '정해둔 범위 안에 들어오면 성공입니다.',
  },
};
const METRIC_AGGREGATION_META: Record<MetricAggregationMode, { label: string; shortLabel: string }> = {
  average: { label: '평균', shortLabel: '평균' },
  sum: { label: '합계', shortLabel: '합계' },
  max: { label: '최고', shortLabel: '최고' },
  min: { label: '최저', shortLabel: '최저' },
  latest: { label: '최신값', shortLabel: '최신' },
};
const METRIC_AGGREGATION_OPTIONS = Object.keys(METRIC_AGGREGATION_META) as MetricAggregationMode[];
const HISTORY_ROW_LIMIT = 80;

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function getWeekendTone(date: Date): WeekendTone {
  const day = date.getDay();
  if (day === 6) return 'saturday';
  if (day === 0) return 'sunday';
  return 'weekday';
}

function getWeekendAccent(tone: WeekendTone, key: keyof (typeof WEEKEND_ACCENTS)['saturday'], fallback: string): string {
  if (tone === 'weekday') return fallback;
  return WEEKEND_ACCENTS[tone][key];
}

function getDateBandColor(tone: WeekendTone, active: boolean): string {
  if (tone === 'weekday') return active ? 'var(--habit-green)' : '#059669';
  return WEEKEND_ACCENTS[tone].solid;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addCalendarMonths(date: Date, amount: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function getStartOfWeek(date: Date): Date {
  const next = new Date(date);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function readFiniteRecordNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isChoiceMode(mode: RecordMode): mode is 'singleChoice' | 'multiChoice' {
  return mode === 'singleChoice' || mode === 'multiChoice';
}

function isTrendGoalMode(mode: RecordMode): boolean {
  return TREND_RECORD_MODES.includes(mode);
}

function normalizeGoalDirection(mode: RecordMode, value: unknown): GoalDirection | undefined {
  if (!isTrendGoalMode(mode)) return undefined;
  return value === 'decrease' || value === 'maintain' || value === 'increase' ? value : 'increase';
}

function isStatsPeriodValue(value: string | null): value is StatsPeriod {
  return value === 'weekly' || value === 'monthly';
}

function isDailyRecordLayoutValue(value: string | null): value is DailyRecordLayout {
  return value === 'detail' || value === 'simple';
}

function isItemStatsChartModeValue(value: string | null): value is ItemStatsChartMode {
  return value === 'progress' || value === 'value';
}

function normalizeMetricGoals(mode: RecordMode, value: unknown): Record<string, MetricGoalConfig> | undefined {
  if (!isTrendGoalMode(mode) || !value || typeof value !== 'object') return undefined;

  const validMetricIds = new Set(getTrendMetricDefinitions({ ...MODE_META[mode], id: 'draft', categoryId: 'draft', name: 'draft', mode }).map((metric) => metric.id));
  const goals = Object.entries(value as Record<string, unknown>).reduce<Record<string, MetricGoalConfig>>((acc, [metricId, rawGoal]) => {
    if (!validMetricIds.has(metricId) || !rawGoal || typeof rawGoal !== 'object') return acc;

    const goal = normalizeMetricGoalConfig(rawGoal);
    if (goal) acc[metricId] = goal;
    return acc;
  }, {});

  return Object.keys(goals).length > 0 ? goals : undefined;
}

function createChoiceOption(label: string): ChoiceOption {
  return { id: makeId('choice'), label };
}

function createDefaultChoiceOptions(mode: RecordMode): ChoiceOption[] {
  if (!isChoiceMode(mode)) return [];
  return DEFAULT_CHOICE_LABELS.map((label) => createChoiceOption(label));
}

function normalizeChoiceOptions(options: unknown): ChoiceOption[] {
  if (!Array.isArray(options)) return [];

  const seen = new Set<string>();
  return options.reduce<ChoiceOption[]>((acc, option, index) => {
    if (!option || typeof option !== 'object') return acc;
    const source = option as Partial<ChoiceOption>;
    const label = typeof source.label === 'string' ? source.label.trim() : '';
    if (!label) return acc;

    const rawId = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `choice-${index + 1}`;
    const id = seen.has(rawId) ? `${rawId}-${index + 1}` : rawId;
    seen.add(id);
    acc.push({ id, label });
    return acc;
  }, []);
}

function getHabitChoiceOptions(habit: Pick<HabitItem, 'mode' | 'options'>): ChoiceOption[] {
  return normalizeChoiceOptions(habit.options);
}

function formatMonthDay(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function formatYearMonth(date: Date): string {
  return `${String(date.getFullYear()).slice(2)}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatStatsRange(period: StatsPeriod, dateKey: string): string {
  const date = parseDateKey(dateKey);

  if (period === 'weekly') {
    const start = getStartOfWeek(date);
    const end = addDays(start, 6);
    return `${formatMonthDay(toDateKey(start))} - ${formatMonthDay(toDateKey(end))}`;
  }

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function getDateKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  let current = new Date(start);

  while (current <= end) {
    keys.push(toDateKey(current));
    current = addDays(current, 1);
  }

  return keys;
}

function getModeDefaults(mode: RecordMode): Pick<HabitItem, 'target' | 'unit' | 'secondaryTarget' | 'secondaryUnit' | 'tertiaryTarget' | 'tertiaryUnit'> {
  const meta = MODE_META[mode];
  return {
    target: meta.target,
    unit: meta.unit,
    secondaryTarget: meta.secondaryTarget,
    secondaryUnit: meta.secondaryUnit,
    tertiaryTarget: meta.tertiaryTarget,
    tertiaryUnit: meta.tertiaryUnit,
  };
}

function normalizeSortOrder(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(parsed)) return Math.max(1, fallback);
  return Math.max(1, Math.round(parsed));
}

function getNextCategoryOrder(categories: HabitCategory[]): number {
  return categories.reduce((max, category, index) => Math.max(max, normalizeSortOrder(category.order, index + 1)), 0) + 1;
}

function getNextHabitOrder(habits: HabitItem[], categoryId?: string): number {
  return habits
    .filter((habit) => !categoryId || habit.categoryId === categoryId)
    .reduce((max, habit, index) => Math.max(max, normalizeSortOrder(habit.order, index + 1)), 0) + 1;
}

function sortCategoriesByOrder(categories: HabitCategory[]): HabitCategory[] {
  return categories
    .map((category, index) => ({ category, index }))
    .sort((a, b) => {
      const orderDiff = normalizeSortOrder(a.category.order, a.index + 1) - normalizeSortOrder(b.category.order, b.index + 1);
      return orderDiff || a.index - b.index;
    })
    .map(({ category }) => category);
}

function sortHabitsByOrder(habits: HabitItem[], categories: HabitCategory[]): HabitItem[] {
  const categoryPositionById = new Map(
    sortCategoriesByOrder(categories).map((category, index) => [category.id, index]),
  );

  return habits
    .map((habit, index) => ({ habit, index }))
    .sort((a, b) => {
      const categoryDiff = (categoryPositionById.get(a.habit.categoryId) ?? Number.MAX_SAFE_INTEGER)
        - (categoryPositionById.get(b.habit.categoryId) ?? Number.MAX_SAFE_INTEGER);
      const orderDiff = normalizeSortOrder(a.habit.order, a.index + 1) - normalizeSortOrder(b.habit.order, b.index + 1);
      return categoryDiff || orderDiff || a.index - b.index;
    })
    .map(({ habit }) => habit);
}

function createInitialWorkspace(): HabitWorkspace {
  return {
    categories: [...EMPTY_WORKSPACE.categories],
    habits: [...EMPTY_WORKSPACE.habits],
    records: { ...EMPTY_WORKSPACE.records },
  };
}

function isWorkspace(value: unknown): value is HabitWorkspace {
  if (!value || typeof value !== 'object') return false;
  const target = value as HabitWorkspace;
  return Array.isArray(target.categories) && Array.isArray(target.habits) && Boolean(target.records);
}

function normalizeWorkspace(value: unknown): HabitWorkspace {
  if (!isWorkspace(value)) return createInitialWorkspace();

  const categories = value.categories.reduce<HabitCategory[]>((acc, category, index) => {
    if (!category?.id || !category.name || !/^#[0-9a-fA-F]{6}$/.test(category.color)) {
      return acc;
    }

    acc.push({
      id: category.id,
      name: category.name,
      color: category.color,
      order: normalizeSortOrder(category.order, index + 1),
    });
    return acc;
  }, []);
  const categoryIds = new Set(categories.map((category) => category.id));

  const habits = value.habits.reduce<HabitItem[]>((acc, habit, index) => {
    if (
      !habit?.id ||
      !habit.name ||
      !categoryIds.has(habit.categoryId) ||
      typeof habit.mode !== 'string' ||
      !(habit.mode in MODE_META) ||
      !Number.isFinite(habit.target) ||
      !habit.unit
    ) {
      return acc;
    }

    const normalizedHabit: HabitItem = {
      id: habit.id,
      categoryId: habit.categoryId,
      name: habit.name,
      order: normalizeSortOrder(habit.order, index + 1),
      mode: habit.mode,
      target: Number(habit.target),
      unit: habit.unit,
    };

    const goalDirection = normalizeGoalDirection(habit.mode, habit.goalDirection);
    if (goalDirection) {
      normalizedHabit.goalDirection = goalDirection;
    }

    if (goalDirection && Number.isFinite(habit.baseline)) {
      normalizedHabit.baseline = Number(habit.baseline);
    }

    if (goalDirection && Number.isFinite(habit.minTarget)) {
      normalizedHabit.minTarget = Number(habit.minTarget);
    }

    if (goalDirection && Number.isFinite(habit.maxTarget)) {
      normalizedHabit.maxTarget = Number(habit.maxTarget);
    }

    const metricGoals = normalizeMetricGoals(habit.mode, habit.metricGoals);
    if (metricGoals) {
      normalizedHabit.metricGoals = metricGoals;
    }

    if (Number.isFinite(habit.secondaryTarget) && habit.secondaryUnit) {
      normalizedHabit.secondaryTarget = Number(habit.secondaryTarget);
      normalizedHabit.secondaryUnit = habit.secondaryUnit;
    }

    if (Number.isFinite(habit.tertiaryTarget) && habit.tertiaryUnit) {
      normalizedHabit.tertiaryTarget = Number(habit.tertiaryTarget);
      normalizedHabit.tertiaryUnit = habit.tertiaryUnit;
    }

    const options = normalizeChoiceOptions((habit as HabitItem).options);
    if (options.length > 0) {
      normalizedHabit.options = options;
    }

    acc.push(normalizedHabit);
    return acc;
  }, []);
  const habitIds = new Set(habits.map((habit) => habit.id));

  const records = Object.entries(value.records ?? {}).reduce<HabitWorkspace['records']>((acc, [dateKey, dailyRecords]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !dailyRecords || typeof dailyRecords !== 'object') {
      return acc;
    }

    const nextDailyRecords = Object.entries(dailyRecords).reduce<Record<string, HabitRecord>>((recordAcc, [habitId, record]) => {
      if (!habitIds.has(habitId) || !record || typeof record !== 'object') return recordAcc;
      recordAcc[habitId] = record as HabitRecord;
      return recordAcc;
    }, {});

    if (Object.keys(nextDailyRecords).length > 0) {
      acc[dateKey] = nextDailyRecords;
    }

    return acc;
  }, {});

  return {
    categories: sortCategoriesByOrder(categories),
    habits: sortHabitsByOrder(habits, categories),
    records,
  };
}

function removeUndefinedFields<T extends object>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

function sanitizeWorkspaceForFirestore(workspace: HabitWorkspace): HabitWorkspace {
  const normalized = normalizeWorkspace(workspace);
  const records = Object.entries(normalized.records).reduce<HabitWorkspace['records']>((acc, [dateKey, dailyRecords]) => {
    const nextDailyRecords = Object.entries(dailyRecords).reduce<Record<string, HabitRecord>>((recordAcc, [habitId, record]) => {
      recordAcc[habitId] = removeUndefinedFields(record);
      return recordAcc;
    }, {});

    if (Object.keys(nextDailyRecords).length > 0) {
      acc[dateKey] = nextDailyRecords;
    }

    return acc;
  }, {});

  const categories = normalized.categories.map((category) => removeUndefinedFields(category));
  const habits = normalized.habits.map((habit) => removeUndefinedFields(habit));

  return { ...normalized, categories, habits, records };
}

function applyRecordPatch(workspace: HabitWorkspace, dateKey: string, habitId: string, patch: Partial<HabitRecord>): HabitWorkspace {
  const dailyRecords = workspace.records[dateKey] ?? {};
  const currentRecord = dailyRecords[habitId] ?? {};
  const nextRecord = removeUndefinedFields({
    ...currentRecord,
    ...patch,
    updatedAt: new Date().toISOString(),
  });

  return {
    ...workspace,
    records: {
      ...workspace.records,
      [dateKey]: {
        ...dailyRecords,
        [habitId]: nextRecord,
      },
    },
  };
}

function removeRecordFromWorkspace(workspace: HabitWorkspace, dateKey: string, habitId: string): HabitWorkspace {
  const dailyRecords = workspace.records[dateKey] ?? {};
  const nextDailyRecords = { ...dailyRecords };
  const nextRecords = { ...workspace.records };
  delete nextDailyRecords[habitId];

  if (Object.keys(nextDailyRecords).length > 0) {
    nextRecords[dateKey] = nextDailyRecords;
  } else {
    delete nextRecords[dateKey];
  }

  return {
    ...workspace,
    records: nextRecords,
  };
}

function createHabitDraft(categoryId = '', mode: RecordMode = 'check', order = 1): HabitDraft {
  return {
    name: '',
    categoryId,
    order,
    mode,
    goalDirection: normalizeGoalDirection(mode, undefined),
    metricGoals: undefined,
    options: createDefaultChoiceOptions(mode),
    ...getModeDefaults(mode),
  };
}

function createHabitDraftFromPreset(preset: HabitPreset, categoryId = '', order = 1): HabitDraft {
  const defaults = getModeDefaults(preset.mode);

  return {
    ...createHabitDraft(categoryId, preset.mode, order),
    name: preset.label,
    target: preset.target ?? defaults.target,
    unit: preset.unit ?? defaults.unit,
    goalDirection: normalizeGoalDirection(preset.mode, preset.goalDirection),
    secondaryTarget: preset.secondaryTarget ?? defaults.secondaryTarget,
    secondaryUnit: preset.secondaryUnit ?? defaults.secondaryUnit,
    tertiaryTarget: preset.tertiaryTarget ?? defaults.tertiaryTarget,
    tertiaryUnit: preset.tertiaryUnit ?? defaults.tertiaryUnit,
    options: preset.options?.map((label) => createChoiceOption(label)) ?? createDefaultChoiceOptions(preset.mode),
    suggestedCategoryName: categoryId ? undefined : preset.categoryName,
    suggestedCategoryColor: categoryId ? undefined : preset.categoryColor,
  };
}

function ensureHabitCategory(
  categories: HabitCategory[],
  name = '기본 루틴',
  color = CATEGORY_COLORS[0],
): { categories: HabitCategory[]; categoryId: string } {
  const normalizedName = name.trim() || '기본 루틴';
  const existing = categories.find((category) => category.name.trim() === normalizedName);

  if (existing) {
    return { categories, categoryId: existing.id };
  }

  const category: HabitCategory = {
    id: makeId('cat'),
    name: normalizedName,
    color,
    order: getNextCategoryOrder(categories),
  };

  return { categories: [...categories, category], categoryId: category.id };
}

function createHabitFromPreset(preset: HabitPreset, categoryId: string, order = 1): HabitItem {
  const defaults = getModeDefaults(preset.mode);
  const habit: HabitItem = {
    id: makeId('habit'),
    categoryId,
    name: preset.label,
    order,
    mode: preset.mode,
    target: preset.target ?? defaults.target,
    unit: preset.unit ?? defaults.unit,
  };
  const goalDirection = normalizeGoalDirection(preset.mode, preset.goalDirection);

  if (goalDirection) {
    habit.goalDirection = goalDirection;
  }

  if (preset.secondaryTarget && preset.secondaryUnit) {
    habit.secondaryTarget = preset.secondaryTarget;
    habit.secondaryUnit = preset.secondaryUnit;
  } else if (defaults.secondaryTarget && defaults.secondaryUnit) {
    habit.secondaryTarget = defaults.secondaryTarget;
    habit.secondaryUnit = defaults.secondaryUnit;
  }

  if (preset.tertiaryTarget && preset.tertiaryUnit) {
    habit.tertiaryTarget = preset.tertiaryTarget;
    habit.tertiaryUnit = preset.tertiaryUnit;
  } else if (defaults.tertiaryTarget && defaults.tertiaryUnit) {
    habit.tertiaryTarget = defaults.tertiaryTarget;
    habit.tertiaryUnit = defaults.tertiaryUnit;
  }

  if (isChoiceMode(preset.mode)) {
    habit.options = preset.options?.map((label) => createChoiceOption(label)) ?? createDefaultChoiceOptions(preset.mode);
  }

  return sanitizeHabitGoalsForSave(habit).habit;
}

function createWorkspaceWithPresetHabits(workspace: HabitWorkspace, presets: HabitPreset[]): HabitWorkspace {
  let categories = [...workspace.categories];
  const existingHabitNames = new Set(workspace.habits.map((habit) => habit.name.trim()));
  const presetHabits = presets.reduce<HabitItem[]>((acc, preset) => {
    if (existingHabitNames.has(preset.label)) return acc;

    const ensured = ensureHabitCategory(categories, preset.categoryName, preset.categoryColor);
    categories = ensured.categories;
    existingHabitNames.add(preset.label);
    acc.push(createHabitFromPreset(preset, ensured.categoryId, getNextHabitOrder([...workspace.habits, ...acc], ensured.categoryId)));
    return acc;
  }, []);

  return {
    ...workspace,
    categories,
    habits: [...workspace.habits, ...presetHabits],
  };
}

function createWorkspaceDocRef(uid: string) {
  return doc(db, 'users', uid, 'habitTracker', 'workspace');
}

async function openMutationNotice(options: {
  title: string;
  text: string;
  confirmButtonText: string;
  icon?: 'info' | 'question' | 'warning';
}) {
  const result = await Swal.fire({
    title: options.title,
    text: options.text,
    icon: options.icon ?? 'question',
    showCancelButton: true,
    confirmButtonText: options.confirmButtonText,
    cancelButtonText: '취소',
    background: '#101821',
    color: '#eef5f0',
    confirmButtonColor: '#42d392',
    cancelButtonColor: '#596774',
  });

  return result.isConfirmed;
}

function getSetTotal(record?: HabitRecord): number {
  return (record?.sets ?? []).reduce((sum, entry) => sum + (Number(entry.reps) || 0), 0);
}

function getStrengthRecord(record?: HabitRecord) {
  const legacySets = record?.sets ?? [];
  const load = Number(record?.load) || Math.max(0, ...legacySets.map((entry) => Number(entry.load) || 0));
  const reps = Number(record?.reps) || (legacySets.length === 1 ? Number(legacySets[0]?.reps) || 0 : 0);
  const setCount = Number(record?.setCount) || legacySets.length;
  const totalReps = reps > 0 && setCount > 0 ? reps * setCount : getSetTotal(record);
  const volume = load * totalReps;

  return { load, reps, setCount, totalReps, volume };
}

function getTodoEntries(record?: HabitRecord): TodoEntry[] {
  if (record?.todos?.length) return record.todos;
  if (record?.note?.trim()) {
    return [{ id: 'legacy-note', text: record.note.trim(), done: false }];
  }
  return [];
}

function getTodoStats(record?: HabitRecord) {
  const todos = getTodoEntries(record);
  const done = todos.filter((todo) => todo.done).length;
  return {
    todos,
    total: todos.length,
    done,
    percent: todos.length > 0 ? done / todos.length : 0,
  };
}

function getSelectedOptionIds(habit: HabitItem, record?: HabitRecord): string[] {
  if (!record) return [];
  const optionIds = new Set(getHabitChoiceOptions(habit).map((option) => option.id));
  const rawIds = habit.mode === 'singleChoice'
    ? [record.selectedOptionId ?? record.selectedOptionIds?.[0]]
    : [...(record.selectedOptionIds ?? []), record.selectedOptionId];

  return Array.from(new Set(rawIds.filter((id): id is string => Boolean(id && optionIds.has(id)))));
}

function getChoiceRecordLabel(habit: HabitItem, record?: HabitRecord): string {
  const options = getHabitChoiceOptions(habit);
  const selectedIds = getSelectedOptionIds(habit, record);
  if (selectedIds.length === 0) return '선택 없음';

  const selectedLabels = selectedIds
    .map((id) => options.find((option) => option.id === id)?.label)
    .filter((label): label is string => Boolean(label));

  if (habit.mode === 'singleChoice') return selectedLabels[0] ?? '선택됨';
  if (selectedLabels.length <= 2) return selectedLabels.join(', ');
  return `${selectedLabels.slice(0, 2).join(', ')} 외 ${selectedLabels.length - 2}개`;
}

function getChoiceScore(habit: HabitItem, record?: HabitRecord): number {
  const selectedCount = getSelectedOptionIds(habit, record).length;
  if (habit.mode === 'singleChoice') return selectedCount > 0 ? 1 : 0;

  const optionCount = getHabitChoiceOptions(habit).length;
  return optionCount > 0 ? clamp(selectedCount / optionCount, 0, 1) : 0;
}

function getHabitTargetLabel(habit: HabitItem): string {
  if (isTrendGoalMode(habit.mode) && getHabitGoalDirection(habit) !== 'increase') {
    return getTrendGoalLabel(habit);
  }

  if (habit.mode === 'cardio') {
    return `${formatCompactNumber(habit.target)}${habit.unit} · ${formatCompactNumber(habit.secondaryTarget ?? 0)}${habit.secondaryUnit ?? '분'}`;
  }

  if (habit.mode === 'strength') {
    return `${formatCompactNumber(habit.target)}${habit.unit} · ${formatCompactNumber(habit.secondaryTarget ?? 0)}${habit.secondaryUnit ?? '회'} · ${formatCompactNumber(habit.tertiaryTarget ?? 0)}${habit.tertiaryUnit ?? '세트'}`;
  }

  if (isChoiceMode(habit.mode)) {
    return `${getHabitChoiceOptions(habit).length}개 선택지`;
  }

  return `${formatCompactNumber(habit.target)}${habit.unit}`;
}

function getRecordMetricLabel(habit: HabitItem, record?: HabitRecord): string {
  if (!record) return '기록 없음';

  if (isTrendGoalMode(habit.mode) && getHabitGoalDirection(habit) !== 'increase' && habit.mode !== 'cardio' && habit.mode !== 'strength') {
    const trendValue = getTrendRecordValue(habit, record);
    if (trendValue !== undefined) return `${formatCompactNumber(trendValue)}${getQuickRecordUnit(habit)}`;
  }

  if (habit.mode === 'cardio') {
    const distance = Number(record.distance ?? record.value) || 0;
    const minutes = Number(record.minutes) || 0;
    if (distance <= 0 && minutes <= 0) return '기록 없음';
    return `${formatCompactNumber(distance)}${habit.unit} · ${formatCompactNumber(minutes)}${habit.secondaryUnit ?? '분'}`;
  }

  if (habit.mode === 'strength') {
    const strength = getStrengthRecord(record);
    if (strength.load <= 0 && strength.totalReps <= 0 && strength.setCount <= 0) return '기록 없음';
    return `${formatCompactNumber(strength.load)}${habit.unit} · ${formatCompactNumber(strength.reps)}${habit.secondaryUnit ?? '회'} · ${formatCompactNumber(strength.setCount)}${habit.tertiaryUnit ?? '세트'}`;
  }

  if (habit.mode === 'sets') {
    const reps = getSetTotal(record);
    return reps > 0 ? `${formatCompactNumber(reps)}${habit.unit}` : '기록 없음';
  }

  if (habit.mode === 'duration') {
    return record.minutes ? `${formatCompactNumber(record.minutes)}${habit.unit}` : '기록 없음';
  }

  if (habit.mode === 'number') {
    return record.value ? `${formatCompactNumber(record.value)}${habit.unit}` : '기록 없음';
  }

  if (habit.mode === 'rating') {
    return record.rating ? `${formatCompactNumber(record.rating)}${habit.unit}` : '기록 없음';
  }

  if (isChoiceMode(habit.mode)) {
    return getChoiceRecordLabel(habit, record);
  }

  if (habit.mode === 'check') return record.checked ? '완료' : '미완료';
  const todoStats = getTodoStats(record);
  return todoStats.total > 0 ? `${todoStats.done}/${todoStats.total} 완료` : '기록 없음';
}

function getQuickRecordValue(habit: HabitItem, record?: HabitRecord): number | undefined {
  if (!record) return undefined;

  if (habit.mode === 'cardio') return Number(record.distance ?? record.value) || undefined;
  if (habit.mode === 'strength') return Number(record.load) || undefined;
  if (habit.mode === 'number') return Number(record.value) || undefined;
  if (habit.mode === 'sets') return getSetTotal(record) || undefined;
  if (habit.mode === 'duration') return Number(record.minutes) || undefined;
  if (habit.mode === 'rating') return Number(record.rating) || undefined;
  return undefined;
}

function getTrendRecordValue(habit: HabitItem, record?: HabitRecord): number | undefined {
  if (!isTrendGoalMode(habit.mode)) return undefined;
  if (!record) return undefined;

  if (habit.mode === 'cardio') return readFiniteRecordNumber(record.distance) ?? readFiniteRecordNumber(record.value);
  if (habit.mode === 'strength') return readFiniteRecordNumber(record.load);
  if (habit.mode === 'number') return readFiniteRecordNumber(record.value);
  if (habit.mode === 'sets') return record.sets ? getSetTotal(record) : undefined;
  if (habit.mode === 'duration') return readFiniteRecordNumber(record.minutes);
  if (habit.mode === 'rating') return readFiniteRecordNumber(record.rating);
  return undefined;
}

function getTrendMetricDefinitions(habit: HabitItem): TrendMetricDefinition[] {
  if (habit.mode === 'cardio') {
    return [
      { id: 'distance', label: '거리', unit: habit.unit, target: habit.target, color: TREND_METRIC_COLORS[0] },
      {
        id: 'minutes',
        label: '시간',
        unit: habit.secondaryUnit ?? '분',
        target: habit.secondaryTarget,
        color: TREND_METRIC_COLORS[1],
      },
    ];
  }

  if (habit.mode === 'strength') {
    return [
      { id: 'load', label: '중량', unit: habit.unit, target: habit.target, color: TREND_METRIC_COLORS[0] },
      {
        id: 'reps',
        label: '횟수',
        unit: habit.secondaryUnit ?? '회',
        target: habit.secondaryTarget,
        color: TREND_METRIC_COLORS[1],
      },
      {
        id: 'setCount',
        label: '세트',
        unit: habit.tertiaryUnit ?? '세트',
        target: habit.tertiaryTarget,
        color: TREND_METRIC_COLORS[2],
      },
      {
        id: 'volume',
        label: '총 볼륨',
        unit: `${habit.unit}x${habit.secondaryUnit ?? '회'}`,
        target: habit.target * (habit.secondaryTarget ?? 1) * (habit.tertiaryTarget ?? 1),
        color: TREND_METRIC_COLORS[3],
        contributesToScore: false,
      },
    ];
  }

  if (habit.mode === 'sets') {
    return [{ id: 'sets', label: '총 횟수', unit: habit.unit, target: habit.target, color: TREND_METRIC_COLORS[0] }];
  }

  if (habit.mode === 'duration') {
    return [{ id: 'minutes', label: '시간', unit: habit.unit, target: habit.target, color: TREND_METRIC_COLORS[0] }];
  }

  if (habit.mode === 'rating') {
    return [{ id: 'rating', label: '평점', unit: habit.unit, target: habit.target, color: TREND_METRIC_COLORS[0] }];
  }

  if (habit.mode === 'number') {
    return [{ id: 'value', label: '수치', unit: habit.unit, target: habit.target, color: TREND_METRIC_COLORS[0] }];
  }

  return [];
}

function getScoredTrendMetricDefinitions(habit: HabitItem): TrendMetricDefinition[] {
  return getTrendMetricDefinitions(habit).filter((metric) => metric.contributesToScore !== false);
}

function getDefaultMetricAggregation(habit: HabitItem, metric: TrendMetricDefinition): MetricAggregationMode {
  if (habit.mode === 'cardio') return 'sum';
  if (habit.mode === 'strength') {
    if (metric.id === 'load') return 'max';
    if (metric.id === 'volume') return 'sum';
    if (metric.id === 'setCount') return 'sum';
    return 'average';
  }
  if (habit.mode === 'sets' || habit.mode === 'duration') return 'sum';
  if (habit.mode === 'rating') return 'average';
  if (habit.mode === 'number') return 'latest';
  return 'average';
}

function getMetricAggregationMode(habit: HabitItem, metric: TrendMetricDefinition): MetricAggregationMode {
  const explicitAggregation = habit.metricGoals?.[metric.id]?.aggregation;
  return explicitAggregation ?? getDefaultMetricAggregation(habit, metric);
}

function aggregateMetricValues(values: number[], aggregation: MetricAggregationMode): number | undefined {
  if (values.length === 0) return undefined;

  if (aggregation === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (aggregation === 'max') return Math.max(...values);
  if (aggregation === 'min') return Math.min(...values);
  if (aggregation === 'latest') return values[values.length - 1];
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createMaintainMetricGoal(target = 0, aggregation: MetricAggregationMode = 'average'): MetricGoalConfig {
  const tolerance = Math.max(Math.abs(target) * 0.05, 1);
  return {
    direction: 'maintain',
    aggregation,
    target,
    minTarget: target - tolerance,
    maxTarget: target + tolerance,
  };
}

function createDirectionalMetricGoal(
  direction: GoalDirection,
  target = 0,
  aggregation: MetricAggregationMode = 'average',
): MetricGoalConfig {
  if (direction === 'maintain') return createMaintainMetricGoal(target, aggregation);
  return { direction, target, aggregation };
}

function createPresetMetricGoals(habit: HabitItem, presetId: string): Record<string, MetricGoalConfig> | undefined {
  const metrics = getTrendMetricDefinitions(habit);
  if (metrics.length === 0) return undefined;
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  const goal = (metricId: string, direction: GoalDirection, aggregation?: MetricAggregationMode): MetricGoalConfig | undefined => {
    const metric = byId.get(metricId);
    if (!metric) return undefined;
    return createDirectionalMetricGoal(direction, metric.target ?? 0, aggregation ?? getDefaultMetricAggregation(habit, metric));
  };
  const assignGoal = (
    acc: Record<string, MetricGoalConfig>,
    metricId: string,
    direction: GoalDirection,
    aggregation?: MetricAggregationMode,
  ) => {
    const nextGoal = goal(metricId, direction, aggregation);
    if (nextGoal) acc[metricId] = nextGoal;
  };

  if (habit.mode === 'strength' && presetId === 'strength-default') {
    const goals: Record<string, MetricGoalConfig> = {};
    assignGoal(goals, 'load', 'increase', 'max');
    assignGoal(goals, 'reps', 'maintain', 'average');
    assignGoal(goals, 'setCount', 'maintain', 'sum');
    assignGoal(goals, 'volume', 'increase', 'sum');
    return goals;
  }

  if (habit.mode === 'cardio' && presetId === 'cardio-endurance') {
    const goals: Record<string, MetricGoalConfig> = {};
    assignGoal(goals, 'distance', 'increase', 'sum');
    assignGoal(goals, 'minutes', 'increase', 'sum');
    return goals;
  }

  if (habit.mode === 'cardio' && presetId === 'cardio-efficiency') {
    const goals: Record<string, MetricGoalConfig> = {};
    assignGoal(goals, 'distance', 'increase', 'sum');
    assignGoal(goals, 'minutes', 'decrease', 'sum');
    return goals;
  }

  return metrics.reduce<Record<string, MetricGoalConfig>>((acc, metric) => {
    if (presetId === 'decrease') {
      acc[metric.id] = createDirectionalMetricGoal('decrease', metric.target ?? 0, getDefaultMetricAggregation(habit, metric));
      return acc;
    }

    if (presetId === 'maintain') {
      acc[metric.id] = createMaintainMetricGoal(metric.target ?? 0, getDefaultMetricAggregation(habit, metric));
      return acc;
    }

    acc[metric.id] = createDirectionalMetricGoal('increase', metric.target ?? 0, getDefaultMetricAggregation(habit, metric));
    return acc;
  }, {});
}

function getGoalPresetOptions(habit: HabitItem): Array<{ id: string; label: string; description: string }> {
  if (habit.mode === 'strength') {
    return [
      { id: 'strength-default', label: '3단 운동 기본', description: '중량은 최고값으로 올리고, 횟수와 세트는 유지합니다.' },
      { id: 'increase', label: '전부 올리기', description: '모든 핵심 지표를 목표 이상으로 올립니다.' },
      { id: 'maintain', label: '범위 유지', description: '모든 핵심 지표를 설정 범위 안에 유지합니다.' },
    ];
  }

  if (habit.mode === 'cardio') {
    return [
      { id: 'cardio-endurance', label: '거리/시간 누적', description: '거리와 시간을 기간 합계로 올립니다.' },
      { id: 'cardio-efficiency', label: '거리 올리고 시간 줄이기', description: '거리는 늘리고 시간은 낮추는 기준입니다.' },
      { id: 'maintain', label: '범위 유지', description: '거리와 시간을 안정적인 범위에 둡니다.' },
    ];
  }

  if (habit.mode === 'duration') {
    return [
      { id: 'maintain', label: '수면/시간 범위', description: '기간별 평균 시간을 범위 안에 유지합니다.' },
      { id: 'increase', label: '시간 늘리기', description: '시간 합계를 목표 이상으로 올립니다.' },
    ];
  }

  if (habit.mode === 'number') {
    return [
      { id: 'increase', label: '수치 올리기', description: '최신값을 목표 이상으로 올립니다.' },
      { id: 'decrease', label: '수치 낮추기', description: '최신값을 목표 이하로 낮춥니다.' },
      { id: 'maintain', label: '범위 유지', description: '최신값을 범위 안에 유지합니다.' },
    ];
  }

  return [
    { id: 'increase', label: '목표 이상', description: '기간 집계값을 목표 이상으로 올립니다.' },
    { id: 'maintain', label: '범위 유지', description: '기간 집계값을 범위 안에 유지합니다.' },
  ];
}

function getTrendMetricValue(habit: HabitItem, record: HabitRecord | undefined, metricId: string): number | undefined {
  if (!record) return undefined;

  if (habit.mode === 'cardio') {
    if (metricId === 'distance') return readFiniteRecordNumber(record.distance) ?? readFiniteRecordNumber(record.value);
    if (metricId === 'minutes') return readFiniteRecordNumber(record.minutes);
  }

  if (habit.mode === 'strength') {
    const hasSetEntries = Boolean(record.sets?.length);
    const strength = getStrengthRecord(record);
    if (metricId === 'load') return readFiniteRecordNumber(record.load) ?? (hasSetEntries ? strength.load : undefined);
    if (metricId === 'reps') return readFiniteRecordNumber(record.reps)
      ?? (hasSetEntries ? strength.reps || strength.totalReps : undefined);
    if (metricId === 'setCount') return readFiniteRecordNumber(record.setCount) ?? (hasSetEntries ? record.sets?.length : undefined);
    if (metricId === 'volume') {
      const hasStrengthValue =
        readFiniteRecordNumber(record.load) !== undefined ||
        readFiniteRecordNumber(record.reps) !== undefined ||
        readFiniteRecordNumber(record.setCount) !== undefined ||
        Boolean(record.sets?.length);

      return hasStrengthValue ? getStrengthRecord(record).volume : undefined;
    }
  }

  if (metricId === 'sets') return record.sets ? getSetTotal(record) : undefined;
  if (metricId === 'minutes') return readFiniteRecordNumber(record.minutes);
  if (metricId === 'rating') return readFiniteRecordNumber(record.rating);
  if (metricId === 'value') return readFiniteRecordNumber(record.value);

  return undefined;
}

function getMetricProgressPercent(habit: HabitItem, metric: TrendMetricDefinition, value?: number): number {
  if (value === undefined) return 0;
  return Math.round(getGoalScore(getMetricGoalConfig(habit, metric), value) * 100);
}

function getMetricBreakdownScore(habit: HabitItem, record?: HabitRecord): number | undefined {
  const metrics = getScoredTrendMetricDefinitions(habit);
  if (metrics.length <= 1) return undefined;

  const total = metrics.reduce((sum, metric) => {
    const value = getTrendMetricValue(habit, record, metric.id);
    return sum + getGoalScore(getMetricGoalConfig(habit, metric), value);
  }, 0);

  return total / metrics.length;
}

function getScoreTrackPercent(percent: number): number {
  return clamp(percent, 0, 100);
}

function getPercentAxisMax(values: number[]): number {
  const maxValue = values.reduce((max, value) => (Number.isFinite(value) ? Math.max(max, value) : max), 0);
  return Math.max(100, Math.ceil(maxValue / 10) * 10);
}

function getQuickRecordUnit(habit: HabitItem): string {
  if (habit.mode === 'check' || isChoiceMode(habit.mode) || habit.mode === 'note') return '';
  return habit.unit;
}

function getHabitGoalDirection(habit: HabitItem): GoalDirection {
  return normalizeGoalDirection(habit.mode, habit.goalDirection) ?? 'increase';
}

function getMetricGoalConfig(habit: HabitItem, metric: TrendMetricDefinition): MetricGoalScoreConfig {
  const primaryMetricId = getTrendMetricDefinitions(habit)[0]?.id;
  const explicitGoal = habit.metricGoals?.[metric.id];
  const isPrimary = metric.id === primaryMetricId;
  const fallbackTarget = metric.target ?? (isPrimary ? habit.target : 0);
  const direction = explicitGoal?.direction ?? (isPrimary ? getHabitGoalDirection(habit) : 'increase');
  const target = Number.isFinite(explicitGoal?.target)
    ? Number(explicitGoal?.target)
    : Number.isFinite(fallbackTarget)
      ? Number(fallbackTarget)
      : 0;

  return {
    direction,
    aggregation: explicitGoal?.aggregation ?? getDefaultMetricAggregation(habit, metric),
    target,
    baseline: Number.isFinite(explicitGoal?.baseline)
      ? Number(explicitGoal?.baseline)
      : isPrimary
        ? habit.baseline
        : undefined,
    minTarget: Number.isFinite(explicitGoal?.minTarget)
      ? Number(explicitGoal?.minTarget)
      : isPrimary
        ? habit.minTarget
        : undefined,
    maxTarget: Number.isFinite(explicitGoal?.maxTarget)
      ? Number(explicitGoal?.maxTarget)
      : isPrimary
        ? habit.maxTarget
        : undefined,
  };
}

function getMetricGoalLabel(metric: TrendMetricDefinition, goal: MetricGoalConfig): string {
  const direction = goal.direction ?? 'increase';

  if (direction === 'maintain') {
    const rawMin = Number.isFinite(goal.minTarget) ? Number(goal.minTarget) : goal.target ?? 0;
    const rawMax = Number.isFinite(goal.maxTarget) ? Number(goal.maxTarget) : goal.target ?? 0;
    return `${formatCompactNumber(Math.min(rawMin, rawMax))}-${formatCompactNumber(Math.max(rawMin, rawMax))}${metric.unit} 유지`;
  }

  const directionText = direction === 'decrease' ? '이하' : '이상';
  return `${formatCompactNumber(goal.target ?? 0)}${metric.unit} ${directionText}`;
}

function getGoalConfigIssues(goal: MetricGoalConfig, unit: string): string[] {
  const direction = goal.direction ?? 'increase';
  const target = Number.isFinite(goal.target) ? Number(goal.target) : 0;
  const baseline = Number.isFinite(goal.baseline) ? Number(goal.baseline) : undefined;
  const issues: string[] = [];

  if (direction === 'decrease' && target <= 0 && baseline === undefined) {
    issues.push(`감소 목표가 0${unit}이면 기준값이 있어야 초과 달성률을 안정적으로 계산할 수 있습니다.`);
  }

  if (direction === 'increase' && baseline !== undefined && baseline >= target) {
    issues.push('시작 기준값이 목표보다 높거나 같아 기준값을 제외하고 계산합니다.');
  }

  if (direction === 'decrease' && baseline !== undefined && baseline <= target) {
    issues.push('시작 기준값이 목표보다 낮거나 같아 기준값을 제외하고 계산합니다.');
  }

  if (direction === 'maintain') {
    const min = Number.isFinite(goal.minTarget) ? Number(goal.minTarget) : target;
    const max = Number.isFinite(goal.maxTarget) ? Number(goal.maxTarget) : target;
    if (min === max) {
      issues.push('유지 하한과 상한이 같아 자동으로 작은 허용 범위를 만듭니다.');
    }
  }

  return issues;
}

function sanitizeGoalConfig(goal: MetricGoalConfig, unit: string): { goal: MetricGoalConfig; warnings: string[] } {
  const warnings = getGoalConfigIssues(goal, unit);
  const direction = goal.direction ?? 'increase';
  const target = Number.isFinite(goal.target) ? Number(goal.target) : 0;
  const nextGoal: MetricGoalConfig = { ...goal, direction, target };

  if (direction === 'increase' && Number.isFinite(nextGoal.baseline) && Number(nextGoal.baseline) >= target) {
    nextGoal.baseline = undefined;
  }

  if (direction === 'decrease') {
    if (Number.isFinite(nextGoal.baseline) && Number(nextGoal.baseline) <= target) {
      nextGoal.baseline = undefined;
    }

    if (target <= 0 && nextGoal.baseline === undefined) {
      nextGoal.baseline = Math.max(1, Math.abs(target) + 1);
      warnings.push(`기준값을 ${formatCompactNumber(nextGoal.baseline)}${unit}로 자동 보정했습니다.`);
    }
  }

  if (direction === 'maintain') {
    const rawMin = Number.isFinite(nextGoal.minTarget) ? Number(nextGoal.minTarget) : target;
    const rawMax = Number.isFinite(nextGoal.maxTarget) ? Number(nextGoal.maxTarget) : target;
    const min = Math.min(rawMin, rawMax);
    const max = Math.max(rawMin, rawMax);

    if (min === max) {
      const tolerance = Math.max(Math.abs(target) * 0.05, 1);
      nextGoal.minTarget = min - tolerance;
      nextGoal.maxTarget = max + tolerance;
    } else {
      nextGoal.minTarget = min;
      nextGoal.maxTarget = max;
    }
  }

  return { goal: removeUndefinedFields(nextGoal), warnings };
}

function sanitizeHabitGoalsForSave(habit: HabitItem): { habit: HabitItem; warnings: string[] } {
  if (!isTrendGoalMode(habit.mode)) return { habit, warnings: [] };

  const warnings: string[] = [];
  const primaryGoal = sanitizeGoalConfig({
    direction: habit.goalDirection ?? 'increase',
    target: habit.target,
    baseline: habit.baseline,
    minTarget: habit.minTarget,
    maxTarget: habit.maxTarget,
  }, habit.unit);
  warnings.push(...primaryGoal.warnings);

  const nextHabit: HabitItem = {
    ...habit,
    goalDirection: primaryGoal.goal.direction,
    baseline: primaryGoal.goal.baseline,
    minTarget: primaryGoal.goal.minTarget,
    maxTarget: primaryGoal.goal.maxTarget,
  };

  const metrics = getTrendMetricDefinitions(nextHabit);
  const nextMetricGoals = metrics.reduce<Record<string, MetricGoalConfig>>((acc, metric) => {
    const goal = getMetricGoalConfig(nextHabit, metric);
    const sanitized = sanitizeGoalConfig(goal, metric.unit);
    warnings.push(...sanitized.warnings.map((warning) => `${metric.label}: ${warning}`));
    acc[metric.id] = sanitized.goal;
    return acc;
  }, {});

  nextHabit.metricGoals = Object.keys(nextMetricGoals).length > 0 ? nextMetricGoals : undefined;

  return {
    habit: removeUndefinedFields(nextHabit),
    warnings: Array.from(new Set(warnings)),
  };
}

function getTrendTargetRange(habit: HabitItem): { min: number; max: number } {
  const fallbackTarget = Number.isFinite(habit.target) ? Number(habit.target) : 0;
  const rawMin = Number.isFinite(habit.minTarget) ? Number(habit.minTarget) : fallbackTarget;
  const rawMax = Number.isFinite(habit.maxTarget) ? Number(habit.maxTarget) : fallbackTarget;

  return {
    min: Math.min(rawMin, rawMax),
    max: Math.max(rawMin, rawMax),
  };
}

function getDirectionalScore(habit: HabitItem, value?: number): number {
  return getGoalScore(
    {
      direction: getHabitGoalDirection(habit),
      target: Number.isFinite(habit.target) ? Number(habit.target) : 0,
      baseline: habit.baseline,
      minTarget: habit.minTarget,
      maxTarget: habit.maxTarget,
    },
    value,
  );
}

function getDirectionalProgress(habit: HabitItem, average?: number): number {
  if (average === undefined) return 0;
  return Math.round(getDirectionalScore(habit, average) * 100);
}

function shouldUsePrimaryTrendScore(habit: HabitItem): boolean {
  if (!isTrendGoalMode(habit.mode)) return false;
  if (habit.mode === 'cardio' || habit.mode === 'strength') {
    return getHabitGoalDirection(habit) !== 'increase';
  }
  return true;
}

function getTrendGoalLabel(habit: HabitItem): string {
  if (!isTrendGoalMode(habit.mode)) return '완료 기준';

  const direction = getHabitGoalDirection(habit);
  const unit = getQuickRecordUnit(habit);

  if (direction === 'maintain') {
    const range = getTrendTargetRange(habit);
    return `${formatCompactNumber(range.min)}-${formatCompactNumber(range.max)}${unit} 유지`;
  }

  const baselineText = Number.isFinite(habit.baseline)
    ? `기준 ${formatCompactNumber(Number(habit.baseline))}${unit} · `
    : '';
  const directionText = direction === 'decrease' ? '이하로 낮추기' : '이상으로 올리기';

  return `${baselineText}목표 ${formatCompactNumber(habit.target)}${unit} ${directionText}`;
}

function getTrendChangeLabel(habit: HabitItem, change?: number): string {
  if (change === undefined) return '변화 없음';
  const unit = getQuickRecordUnit(habit);
  const prefix = change > 0 ? '+' : '';
  return `${prefix}${formatCompactNumber(change)}${unit}`;
}

function getQuickInputStep(habit: HabitItem): number {
  if (habit.mode === 'cardio') return 0.1;
  if (habit.mode === 'strength') return 0.5;
  return 1;
}

function getQuickRecordFields(habit: HabitItem, record?: HabitRecord): QuickRecordField[] {
  if (habit.mode === 'cardio') {
    return [
      {
        id: 'distance',
        label: '거리',
        unit: habit.unit,
        value: readFiniteRecordNumber(record?.distance) ?? readFiniteRecordNumber(record?.value),
        step: getQuickInputStep(habit),
        placeholder: habit.target,
      },
      {
        id: 'minutes',
        label: '시간',
        unit: habit.secondaryUnit ?? '분',
        value: readFiniteRecordNumber(record?.minutes),
        step: 1,
        placeholder: habit.secondaryTarget ?? 60,
      },
    ];
  }

  if (habit.mode === 'strength') {
    const strength = getStrengthRecord(record);
    return [
      {
        id: 'load',
        label: '중량',
        unit: habit.unit,
        value: readFiniteRecordNumber(record?.load) ?? (record?.sets?.length ? strength.load : undefined),
        step: getQuickInputStep(habit),
        placeholder: habit.target,
      },
      {
        id: 'reps',
        label: '횟수',
        unit: habit.secondaryUnit ?? '회',
        value: readFiniteRecordNumber(record?.reps) ?? (record?.sets?.length ? strength.reps || strength.totalReps : undefined),
        step: 1,
        placeholder: habit.secondaryTarget ?? 3,
      },
      {
        id: 'setCount',
        label: '세트',
        unit: habit.tertiaryUnit ?? '세트',
        value: readFiniteRecordNumber(record?.setCount) ?? (record?.sets?.length ? strength.setCount : undefined),
        step: 1,
        placeholder: habit.tertiaryTarget ?? 5,
      },
    ];
  }

  if (habit.mode === 'sets') {
    return [
      {
        id: 'sets',
        label: '총 횟수',
        unit: habit.unit,
        value: record?.sets ? getSetTotal(record) : undefined,
        step: 1,
        placeholder: habit.target,
      },
    ];
  }

  if (habit.mode === 'duration') {
    return [
      {
        id: 'minutes',
        label: '시간',
        unit: habit.unit,
        value: readFiniteRecordNumber(record?.minutes),
        step: 1,
        placeholder: habit.target,
      },
    ];
  }

  if (habit.mode === 'number') {
    return [
      {
        id: 'value',
        label: '수치',
        unit: habit.unit,
        value: readFiniteRecordNumber(record?.value),
        step: 1,
        placeholder: habit.target,
      },
    ];
  }

  return [];
}

function createQuickRecordPatchFromValues(habit: HabitItem, values: Record<string, number | undefined>): Partial<HabitRecord> {
  const nonNegative = (id: string) => {
    const value = values[id];
    return value !== undefined && value >= 0 ? value : undefined;
  };

  if (habit.mode === 'cardio') {
    return { distance: nonNegative('distance'), minutes: nonNegative('minutes'), value: undefined };
  }

  if (habit.mode === 'strength') {
    return { load: nonNegative('load'), reps: nonNegative('reps'), setCount: nonNegative('setCount') };
  }

  if (habit.mode === 'sets') {
    const reps = nonNegative('sets');
    return { sets: reps !== undefined ? [{ id: makeId('set'), reps, load: 0 }] : undefined };
  }

  if (habit.mode === 'duration') return { minutes: nonNegative('minutes') };
  if (habit.mode === 'number') return { value: nonNegative('value') };

  return {};
}

function getQuickRecordDisplay(habit: HabitItem, record?: HabitRecord): { value: string; unit: string; active: boolean } {
  if (habit.mode === 'check') {
    return {
      value: record?.checked ? 'V' : '0',
      unit: '',
      active: Boolean(record?.checked),
    };
  }

  if (isChoiceMode(habit.mode)) {
    const selectedIds = getSelectedOptionIds(habit, record);
    const options = getHabitChoiceOptions(habit);
    const selectedLabel = options.find((option) => option.id === selectedIds[0])?.label;

    return {
      value: selectedIds.length === 0 ? '0' : habit.mode === 'singleChoice' ? selectedLabel ?? '선택' : `${selectedIds.length}`,
      unit: habit.mode === 'multiChoice' && selectedIds.length > 0 ? '개' : '',
      active: selectedIds.length > 0,
    };
  }

  if (habit.mode === 'note') {
    const todoStats = getTodoStats(record);
    return {
      value: todoStats.total > 0 ? `${todoStats.done}/${todoStats.total}` : '0',
      unit: todoStats.total > 0 ? '완료' : '',
      active: todoStats.total > 0,
    };
  }

  if (habit.mode === 'cardio') {
    const distance = Number(record?.distance ?? record?.value) || 0;
    const minutes = Number(record?.minutes) || 0;
    return {
      value: distance > 0 || minutes > 0 ? `${formatCompactNumber(distance)}/${formatCompactNumber(minutes)}` : '0',
      unit: `${habit.unit}/${habit.secondaryUnit ?? '분'}`,
      active: distance > 0 || minutes > 0,
    };
  }

  if (habit.mode === 'strength') {
    const strength = getStrengthRecord(record);
    return {
      value: strength.load > 0 || strength.reps > 0 || strength.setCount > 0
        ? `${formatCompactNumber(strength.load)}/${formatCompactNumber(strength.reps)}/${formatCompactNumber(strength.setCount)}`
        : '0',
      unit: `${habit.unit}/${habit.secondaryUnit ?? '회'}/${habit.tertiaryUnit ?? '세트'}`,
      active: strength.load > 0 || strength.reps > 0 || strength.setCount > 0,
    };
  }

  const value = getQuickRecordValue(habit, record);
  return {
    value: value ? formatCompactNumber(value) : '0',
    unit: getQuickRecordUnit(habit),
    active: Boolean(value),
  };
}

function getHabitAggregateLabel(habit: HabitItem, workspace: HabitWorkspace, dateKeys: string[]): string {
  const records = dateKeys.map((dateKey) => workspace.records[dateKey]?.[habit.id]).filter(Boolean) as HabitRecord[];

  if (records.length === 0) return '기록 없음';

  if (isTrendGoalMode(habit.mode) && getHabitGoalDirection(habit) !== 'increase') {
    const values = records
      .map((record) => getTrendRecordValue(habit, record))
      .filter((value): value is number => value !== undefined);
    const average = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return `평균 ${formatCompactNumber(average)}${getQuickRecordUnit(habit)} · ${getTrendGoalLabel(habit)}`;
  }

  if (habit.mode === 'cardio') {
    const distance = records.reduce((sum, record) => sum + (Number(record.distance ?? record.value) || 0), 0);
    const minutes = records.reduce((sum, record) => sum + (Number(record.minutes) || 0), 0);
    return `거리 ${formatCompactNumber(distance)}${habit.unit} · 시간 ${formatCompactNumber(minutes)}${habit.secondaryUnit ?? '분'}`;
  }

  if (habit.mode === 'strength') {
    const totals = records.reduce(
      (acc, record) => {
        const strength = getStrengthRecord(record);
        return {
          maxLoad: Math.max(acc.maxLoad, strength.load),
          sets: acc.sets + strength.setCount,
          volume: acc.volume + strength.volume,
        };
      },
      { maxLoad: 0, sets: 0, volume: 0 },
    );
    return `최고 ${formatCompactNumber(totals.maxLoad)}${habit.unit} · ${formatCompactNumber(totals.sets)}${habit.tertiaryUnit ?? '세트'} · 볼륨 ${formatCompactNumber(totals.volume, 0)}kg`;
  }

  if (habit.mode === 'duration') {
    const minutes = records.reduce((sum, record) => sum + (Number(record.minutes) || 0), 0);
    return `시간 ${formatCompactNumber(minutes)}${habit.unit}`;
  }

  if (habit.mode === 'number') {
    const value = records.reduce((sum, record) => sum + (Number(record.value) || 0), 0);
    return `합계 ${formatCompactNumber(value)}${habit.unit}`;
  }

  if (habit.mode === 'sets') {
    const reps = records.reduce((sum, record) => sum + getSetTotal(record), 0);
    return `합계 ${formatCompactNumber(reps)}${habit.unit}`;
  }

  if (habit.mode === 'rating') {
    const ratings = records.map((record) => Number(record.rating) || 0).filter((rating) => rating > 0);
    const average = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
    return `평균 ${formatCompactNumber(average)}${habit.unit}`;
  }

  if (isChoiceMode(habit.mode)) {
    const options = getHabitChoiceOptions(habit);
    const selectedCounts = records.map((record) => getSelectedOptionIds(habit, record).length);
    const selectedTotal = selectedCounts.reduce((sum, count) => sum + count, 0);
    if (habit.mode === 'singleChoice') {
      const optionCounts = options.map((option) => ({
        label: option.label,
        count: records.filter((record) => getSelectedOptionIds(habit, record).includes(option.id)).length,
      }));
      const topOption = optionCounts.sort((a, b) => b.count - a.count)[0];
      return topOption?.count ? `선택 ${selectedTotal}회 · 최다 ${topOption.label}` : `선택 ${selectedTotal}회`;
    }

    return `선택 ${selectedTotal}/${records.length * Math.max(options.length, 1)}`;
  }

  const todoTotal = records.reduce((sum, record) => sum + getTodoStats(record).total, 0);
  const todoDone = records.reduce((sum, record) => sum + getTodoStats(record).done, 0);
  return `완료 ${todoDone}/${todoTotal}`;
}

function isRecordTouched(habit: HabitItem, record?: HabitRecord): boolean {
  if (!record) return false;
  if (isTrendGoalMode(habit.mode) && getHabitGoalDirection(habit) !== 'increase') {
    return getTrendRecordValue(habit, record) !== undefined;
  }
  if (habit.mode === 'check') return Boolean(record.checked);
  if (habit.mode === 'cardio') return (Number(record.distance ?? record.value) || 0) > 0 || (Number(record.minutes) || 0) > 0;
  if (habit.mode === 'strength') {
    const strength = getStrengthRecord(record);
    return strength.load > 0 || strength.reps > 0 || strength.setCount > 0 || strength.totalReps > 0;
  }
  if (habit.mode === 'number') return typeof record.value === 'number' && record.value > 0;
  if (habit.mode === 'sets') return getSetTotal(record) > 0;
  if (habit.mode === 'duration') return typeof record.minutes === 'number' && record.minutes > 0;
  if (habit.mode === 'rating') return typeof record.rating === 'number' && record.rating > 0;
  if (isChoiceMode(habit.mode)) return getSelectedOptionIds(habit, record).length > 0;
  return getTodoStats(record).total > 0;
}

function getRecordScore(habit: HabitItem, record?: HabitRecord): number {
  if (!record) return 0;
  const metricBreakdownScore = getMetricBreakdownScore(habit, record);
  if (metricBreakdownScore !== undefined) return metricBreakdownScore;
  if (shouldUsePrimaryTrendScore(habit)) return getDirectionalScore(habit, getTrendRecordValue(habit, record));

  if (habit.mode === 'check') return record.checked ? 1 : 0;
  if (habit.mode === 'cardio') {
    const distanceScore = clamp((Number(record.distance ?? record.value) || 0) / Math.max(habit.target, 1), 0, 1);
    const minuteTarget = Math.max(habit.secondaryTarget ?? 0, 1);
    const minuteScore = clamp((Number(record.minutes) || 0) / minuteTarget, 0, 1);
    return (distanceScore + minuteScore) / 2;
  }
  if (habit.mode === 'strength') {
    const strength = getStrengthRecord(record);
    const loadScore = clamp(strength.load / Math.max(habit.target, 1), 0, 1);
    const repsScore = clamp(strength.reps / Math.max(habit.secondaryTarget ?? 1, 1), 0, 1);
    const setScore = clamp(strength.setCount / Math.max(habit.tertiaryTarget ?? 1, 1), 0, 1);
    return (loadScore + repsScore + setScore) / 3;
  }
  if (habit.mode === 'number') return clamp((record.value ?? 0) / Math.max(habit.target, 1), 0, 1);
  if (habit.mode === 'sets') return clamp(getSetTotal(record) / Math.max(habit.target, 1), 0, 1);
  if (habit.mode === 'duration') return clamp((record.minutes ?? 0) / Math.max(habit.target, 1), 0, 1);
  if (habit.mode === 'rating') return clamp((record.rating ?? 0) / Math.max(habit.target, 1), 0, 1);
  if (isChoiceMode(habit.mode)) return getChoiceScore(habit, record);
  const todoStats = getTodoStats(record);
  return todoStats.total > 0 ? todoStats.percent : 0;
}

function calculateDayStats(workspace: HabitWorkspace, dateKey: string, habits = workspace.habits) {
  const dailyRecords = workspace.records[dateKey] ?? {};
  const total = habits.length;
  const score = habits.reduce((sum, habit) => sum + getRecordScore(habit, dailyRecords[habit.id]), 0);
  const touched = habits.filter((habit) => isRecordTouched(habit, dailyRecords[habit.id])).length;
  const completed = habits.filter((habit) => getRecordScore(habit, dailyRecords[habit.id]) >= 1).length;

  return {
    total,
    touched,
    completed,
    percent: total > 0 ? Math.round((score / total) * 100) : 0,
  };
}

function calculateRangeStats(workspace: HabitWorkspace, dateKeys: string[], habits = workspace.habits): StatsSummary {
  if (dateKeys.length === 0) {
    return { total: 0, touched: 0, completed: 0, percent: 0 };
  }

  const aggregate = dateKeys.reduce(
    (acc, dateKey) => {
      const stats = calculateDayStats(workspace, dateKey, habits);
      return {
        total: acc.total + stats.total,
        touched: acc.touched + stats.touched,
        completed: acc.completed + stats.completed,
        percentTotal: acc.percentTotal + stats.percent,
      };
    },
    { total: 0, touched: 0, completed: 0, percentTotal: 0 },
  );

  return {
    total: aggregate.total,
    touched: aggregate.touched,
    completed: aggregate.completed,
    percent: Math.round(aggregate.percentTotal / dateKeys.length),
  };
}

function createStatsBuckets(workspace: HabitWorkspace, baseDateKey: string, period: StatsPeriod): StatsBucket[] {
  const baseDate = parseDateKey(baseDateKey);
  const bucketCount = 12;

  return Array.from({ length: bucketCount }, (_, index) => {
    const offset = index - bucketCount + 1;

    if (period === 'weekly') {
      const start = addDays(getStartOfWeek(baseDate), offset * 7);
      const end = addDays(start, 6);
      const startKey = toDateKey(start);
      const endKey = toDateKey(end);
      const dateKeys = getDateKeysBetween(start, end);

      return {
        id: startKey,
        label: formatMonthDay(startKey),
        caption: `${formatMonthDay(startKey)}-${formatMonthDay(endKey)}`,
        startKey,
        endKey,
        dateKeys,
        stats: calculateRangeStats(workspace, dateKeys),
      };
    }

    const start = addMonths(getStartOfMonth(baseDate), offset);
    const end = addDays(addMonths(start, 1), -1);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    const dateKeys = getDateKeysBetween(start, end);

    return {
      id: startKey,
      label: formatYearMonth(start),
      caption: `${start.getFullYear()}년 ${start.getMonth() + 1}월`,
      startKey,
      endKey,
      dateKeys,
      stats: calculateRangeStats(workspace, dateKeys),
    };
  });
}

function calculateStreak(habit: HabitItem, records: HabitWorkspace['records'], baseDateKey: string): number {
  let streak = 0;
  const baseDate = parseDateKey(baseDateKey);

  for (let offset = 0; offset > -120; offset -= 1) {
    const dateKey = toDateKey(addDays(baseDate, offset));
    const record = records[dateKey]?.[habit.id];
    if (!isRecordTouched(habit, record)) break;
    streak += 1;
  }

  return streak;
}

function summarizeTrendValues(habit: HabitItem, workspace: HabitWorkspace, dateKeys: string[]): TrendValueSummary {
  const primaryMetric = getTrendMetricDefinitions(habit)[0];
  const aggregation = primaryMetric ? getMetricAggregationMode(habit, primaryMetric) : 'average';
  const values = dateKeys
    .map((dateKey) => getTrendRecordValue(habit, workspace.records[dateKey]?.[habit.id]))
    .filter((value): value is number => value !== undefined && Number.isFinite(value));

  if (values.length === 0) return { values };

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const aggregate = aggregateMetricValues(values, aggregation);

  return {
    values,
    average: aggregate ?? average,
    aggregate,
    first: values[0],
    last: values[values.length - 1],
  };
}

function summarizeTrendMetricValues(
  habit: HabitItem,
  workspace: HabitWorkspace,
  dateKeys: string[],
  metric: TrendMetricDefinition,
): TrendValueSummary {
  const aggregation = getMetricAggregationMode(habit, metric);
  const values = dateKeys
    .map((dateKey) => getTrendMetricValue(habit, workspace.records[dateKey]?.[habit.id], metric.id))
    .filter((value): value is number => value !== undefined && Number.isFinite(value));

  if (values.length === 0) return { values };

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    values,
    average,
    aggregate: aggregateMetricValues(values, aggregation),
    first: values[0],
    last: values[values.length - 1],
  };
}

function calculateHabitMetricSummaries(
  habit: HabitItem,
  workspace: HabitWorkspace,
  dateKeys: string[],
  previousDateKeys: string[],
): HabitMetricSummary[] {
  return getTrendMetricDefinitions(habit).map((metric) => {
    const current = summarizeTrendMetricValues(habit, workspace, dateKeys, metric);
    const previous = summarizeTrendMetricValues(habit, workspace, previousDateKeys, metric);
    const change = current.first !== undefined && current.last !== undefined ? current.last - current.first : undefined;
    const currentAggregate = current.aggregate ?? current.average;
    const previousAggregate = previous.aggregate ?? previous.average;
    const previousChange = currentAggregate !== undefined && previousAggregate !== undefined ? currentAggregate - previousAggregate : undefined;
    const goal = getMetricGoalConfig(habit, metric);

    return {
      ...metric,
      aggregation: getMetricAggregationMode(habit, metric),
      average: currentAggregate,
      previousAverage: previousAggregate,
      change,
      previousChange,
      previousProgress: getMetricProgressPercent(habit, metric, previousAggregate),
      progress: getMetricProgressPercent(habit, metric, currentAggregate),
      direction: goal.direction,
    };
  });
}

function calculateHabitTrendStats(
  habit: HabitItem,
  workspace: HabitWorkspace,
  dateKeys: string[],
  previousDateKeys: string[],
): HabitTrendStats {
  if (!isTrendGoalMode(habit.mode)) {
    return {
      progress: 0,
      progressLabel: '수치 통계 없음',
      trendLabel: '변화 없음',
    };
  }

  const current = summarizeTrendValues(habit, workspace, dateKeys);
  const previous = summarizeTrendValues(habit, workspace, previousDateKeys);
  const change = current.first !== undefined && current.last !== undefined ? current.last - current.first : undefined;
  const previousChange = current.average !== undefined && previous.average !== undefined ? current.average - previous.average : undefined;
  const progress = getDirectionalProgress(habit, current.average);
  const unit = getQuickRecordUnit(habit);
  const primaryMetric = getTrendMetricDefinitions(habit)[0];
  const aggregation = primaryMetric ? getMetricAggregationMode(habit, primaryMetric) : 'average';
  const averageText = current.average !== undefined ? `${formatCompactNumber(current.average)}${unit}` : '기록 없음';

  return {
    average: current.average,
    previousAverage: previous.average,
    change,
    previousChange,
    progress,
    progressLabel: `${GOAL_DIRECTION_META[getHabitGoalDirection(habit)].shortLabel} ${progress}% · ${METRIC_AGGREGATION_META[aggregation].shortLabel} ${averageText}`,
    trendLabel: getTrendChangeLabel(habit, change),
  };
}

function getRangeDateKeys(baseDateKey: string, count: number): string[] {
  const baseDate = parseDateKey(baseDateKey);
  return Array.from({ length: count }, (_, index) => toDateKey(addDays(baseDate, index - count + 1)));
}

function getPreviousDateKeys(dateKeys: string[]): string[] {
  if (dateKeys.length === 0) return [];
  const startDate = parseDateKey(dateKeys[0]);
  return Array.from({ length: dateKeys.length }, (_, index) => toDateKey(addDays(startDate, index - dateKeys.length)));
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatCompactNumber(value: number, maximumFractionDigits = 1): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

function getSimpleLogColumnTemplate(columnCount: number, selectedColumn: number, activeTrack: string, quietTrack: string): string {
  if (columnCount <= 0) return '';
  const activeIndex = selectedColumn >= 0 ? Math.min(selectedColumn, columnCount - 1) : 0;
  return Array.from({ length: columnCount }, (_, index) => (index === activeIndex ? activeTrack : quietTrack)).join(' ');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeCsvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadTextFile(fileName: string, content: string, type: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const Page = styled.main`
  --habit-bg: #070a0f;
  --habit-panel: rgba(13, 19, 28, 0.94);
  --habit-panel-strong: rgba(17, 25, 36, 0.98);
  --habit-line: rgba(189, 203, 220, 0.14);
  --habit-line-strong: rgba(189, 203, 220, 0.24);
  --habit-text: #eef5f0;
  --habit-muted: #91a0ac;
  --habit-dim: #596774;
  --habit-green: #42d392;
  --habit-coral: #ff7a59;
  --habit-blue: #63b3ff;
  --habit-yellow: #f8c64e;

  flex: 1;
  min-height: 0;
  height: calc(100vh - var(--header-h));
  overflow-y: auto;
  padding: 28px;
  color: var(--habit-text);
  background:
    linear-gradient(135deg, rgba(66, 211, 146, 0.07), transparent 34%),
    linear-gradient(315deg, rgba(255, 122, 89, 0.08), transparent 36%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 72px),
    var(--habit-bg);

  body[data-propig-design='codeit'] & {
    --habit-bg: var(--codeit-bg);
    --habit-panel: rgba(255, 255, 255, 0.92);
    --habit-panel-strong: var(--codeit-surface);
    --habit-line: var(--codeit-border);
    --habit-line-strong: var(--codeit-primary-border);
    --habit-text: var(--codeit-text);
    --habit-muted: var(--codeit-muted);
    --habit-dim: var(--codeit-faint);
    --habit-green: var(--codeit-primary);
    --habit-coral: var(--codeit-danger);
    --habit-blue: var(--codeit-primary);
    --habit-yellow: var(--codeit-warning);
    background: var(--codeit-bg);
  }

  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--habit-green);
    outline-offset: 2px;
  }

  @media (max-width: 720px) {
    padding: 8px;
  }
`;

const Shell = styled.div`
  width: min(1640px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;

  @media (max-width: 720px) {
    gap: 8px;
  }
`;

const HeaderBand = styled.section`
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(18, 27, 39, 0.95), rgba(9, 14, 21, 0.92)),
    var(--habit-panel);
  padding: 18px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  box-shadow: 0 22px 55px rgba(0, 0, 0, 0.26);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
    backdrop-filter: none;
    animation: habitCodeitRise 0.58s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes habitCodeitRise {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 10px;
  }
`;

const HeaderCopy = styled.div`
  min-width: 0;
`;

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--habit-green);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0;

  @media (max-width: 720px) {
    gap: 6px;
    font-size: 0.66rem;

    svg {
      width: 13px;
      height: 13px;
    }
  }
`;

const Title = styled.h1`
  margin: 8px 0 0;
  color: var(--habit-text);
  font-size: clamp(1.55rem, 2vw, 2.35rem);
  line-height: 1.08;
  font-weight: 950;
  letter-spacing: 0;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-text);
    font-size: clamp(1.9rem, 3.4vw, 3.35rem);
  }

  @media (max-width: 720px) {
    margin-top: 3px;
    font-size: 1.18rem;
  }
`;

const Description = styled.p`
  margin: 8px 0 0;
  max-width: 760px;
  color: var(--habit-muted);
  font-size: 0.94rem;
  line-height: 1.6;

  @media (max-width: 720px) {
    display: none;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;

  @media (max-width: 720px) {
    width: 100%;
    justify-content: space-between;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;

    nav {
      grid-column: 1 / -1;
    }
  }
`;

const ViewTabs = styled.nav`
  height: 42px;
  padding: 3px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  display: inline-grid;
  grid-template-columns: repeat(4, minmax(78px, 1fr));
  gap: 3px;

  @media (max-width: 720px) {
    min-width: 0;
    width: 100%;
    height: 34px;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface-soft);
    border-color: var(--codeit-border);
  }
`;

const ViewTab = styled(Link)<{ $active: boolean }>`
  min-width: 0;
  border-radius: 6px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-muted)')};
  background: ${(props) => (props.$active ? 'var(--habit-green)' : 'transparent')};
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 950;
  transition: background 0.18s ease, color 0.18s ease;

  &:hover {
    color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-text)')};
    background: ${(props) => (props.$active ? 'var(--habit-green)' : 'rgba(255, 255, 255, 0.07)')};
  }

  body[data-propig-design='codeit'] & {
    color: ${(props) => (props.$active ? '#ffffff' : 'var(--codeit-muted)')};
    background: ${(props) => (props.$active ? 'var(--codeit-primary)' : 'transparent')};
    box-shadow: ${(props) => (props.$active ? '0 8px 18px rgba(52, 81, 209, 0.18)' : 'none')};
  }

  body[data-propig-design='codeit'] &:hover {
    color: ${(props) => (props.$active ? '#ffffff' : 'var(--codeit-text)')};
    background: ${(props) => (props.$active ? 'var(--codeit-primary-hover)' : 'var(--codeit-primary-soft)')};
  }
`;

const IconButton = styled.button<{ $tone?: 'primary' | 'ghost' | 'danger' | 'warm' }>`
  min-height: 38px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--habit-text);
  background: rgba(255, 255, 255, 0.04);
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  ${(props) =>
    props.$tone === 'primary' &&
    css`
      border-color: rgba(66, 211, 146, 0.44);
      background: linear-gradient(135deg, #42d392, #2dd4bf);
      color: #06110d;
    `}

  body[data-propig-design='codeit'] & {
    ${(props) =>
      props.$tone === 'primary' &&
      css`
        border-color: transparent;
        background: var(--codeit-primary);
        color: #ffffff;
        box-shadow: 0 12px 28px rgba(52, 81, 209, 0.18);
      `}
  }

  ${(props) =>
    props.$tone === 'warm' &&
    css`
      border-color: rgba(248, 198, 78, 0.38);
      background: rgba(248, 198, 78, 0.12);
      color: #ffe9a6;
    `}

  ${(props) =>
    props.$tone === 'danger' &&
    css`
      border-color: rgba(255, 122, 89, 0.35);
      background: rgba(255, 122, 89, 0.1);
      color: #ffb19d;
    `}

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: var(--habit-line-strong);
    background: ${(props) => (props.$tone === 'primary' ? 'linear-gradient(135deg, #64e6ad, #45e0cf)' : 'rgba(255, 255, 255, 0.07)')};
  }

  body[data-propig-design='codeit'] &:hover:not(:disabled) {
    background: ${(props) => (props.$tone === 'primary' ? 'var(--codeit-primary-hover)' : 'var(--codeit-primary-soft)')};
    border-color: var(--codeit-primary-border);
    color: ${(props) => (props.$tone === 'primary' ? '#ffffff' : 'var(--codeit-text)')};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  @media (max-width: 720px) {
    min-height: 32px;
    border-radius: 7px;
    padding: 0 9px;
    gap: 6px;
    font-size: 0.72rem;

    svg {
      width: 14px;
      height: 14px;
    }
  }
`;

const IconOnlyButton = styled(IconButton)`
  width: 38px;
  padding: 0;
  flex-shrink: 0;

  @media (max-width: 720px) {
    width: 32px;
    min-height: 32px;
  }
`;

const MetricGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 720px) {
    gap: 6px;
  }

  @media (max-width: 360px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const MetricTile = styled.div`
  min-height: 116px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 15px;
  background:
    linear-gradient(180deg, rgba(18, 27, 39, 0.86), rgba(10, 15, 22, 0.92)),
    var(--habit-panel);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-sm);
    animation: habitMetricIn 0.52s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  body[data-propig-design='codeit'] &:hover {
    transform: translateY(-3px);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    box-shadow: var(--codeit-shadow-md);
  }

  @keyframes habitMetricIn {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 720px) {
    min-height: 64px;
    padding: 8px;
    gap: 5px;
  }
`;

const MetricTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--habit-muted);
  font-size: 0.78rem;
  font-weight: 900;

  @media (max-width: 720px) {
    gap: 6px;
    font-size: 0.66rem;
    line-height: 1.2;
  }
`;

const MetricIcon = styled.span<{ $color: string }>`
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 40%, transparent);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => props.$color};
  background: color-mix(in srgb, ${(props) => props.$color} 14%, transparent);

  @media (max-width: 720px) {
    width: 24px;
    height: 24px;
    border-radius: 6px;

    svg {
      width: 13px;
      height: 13px;
    }
  }
`;

const MetricValue = styled.strong`
  color: var(--habit-text);
  font-size: 1.72rem;
  line-height: 1;
  font-weight: 950;
  letter-spacing: 0;

  @media (max-width: 720px) {
    font-size: 1.08rem;
  }
`;

const MetricSub = styled.span`
  color: var(--habit-dim);
  font-size: 0.78rem;
  line-height: 1.4;

  @media (max-width: 720px) {
    display: none;
  }
`;

const WorkspaceGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;

  @media (max-width: 1120px) {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 720px) {
    gap: 8px;
  }
`;

const Surface = styled.section`
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(17, 25, 36, 0.92), rgba(9, 14, 21, 0.95)),
    var(--habit-panel);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
    backdrop-filter: none;
  }
`;

const SidePanel = styled(Surface)`
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 12px;

  @media (max-width: 1120px) {
    position: static;
  }

  @media (max-width: 720px) {
    padding: 8px;
    gap: 8px;
  }
`;

const PanelHeading = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 720px) {
    gap: 8px;
  }

  @media (max-width: 560px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const PanelTitle = styled.h2`
  margin: 0;
  color: var(--habit-text);
  font-size: 0.96rem;
  font-weight: 950;
  letter-spacing: 0;

  @media (max-width: 720px) {
    font-size: 0.84rem;
  }
`;

const PanelHint = styled.p`
  margin: 4px 0 0;
  color: var(--habit-muted);
  font-size: 0.78rem;
  line-height: 1.45;

  @media (max-width: 720px) {
    display: none;
  }
`;

const CategoryList = styled.div`
  display: grid;
  gap: 7px;

  @media (max-width: 720px) {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
`;

const CategoryRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 7px;
  align-items: stretch;

  @media (max-width: 720px) {
    flex: 0 0 auto;
    grid-template-columns: minmax(104px, auto) auto auto;
    gap: 5px;
  }
`;

const CategoryButton = styled.button<{ $active: boolean; $color: string }>`
  width: 100%;
  min-height: 48px;
  border: 1px solid ${(props) => (props.$active ? props.$color : 'var(--habit-line)')};
  border-radius: 8px;
  padding: 8px 10px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  color: ${(props) => (props.$active ? 'var(--habit-text)' : 'var(--habit-muted)')};
  background: ${(props) => (props.$active ? `color-mix(in srgb, ${props.$color} 16%, transparent)` : 'rgba(255, 255, 255, 0.03)')};
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  &:hover {
    border-color: ${(props) => props.$color};
    color: var(--habit-text);
  }

  @media (max-width: 720px) {
    width: auto;
    min-width: 108px;
    min-height: 34px;
    grid-template-columns: 13px minmax(0, 1fr) auto;
    gap: 7px;
    padding: 5px 8px;
    font-size: 0.76rem;

    svg {
      width: 13px;
      height: 13px;
    }
  }
`;

const InlineActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const CategoryOrderControls = styled.div`
  display: grid;
  grid-template-rows: repeat(2, 1fr);
  gap: 4px;

  @media (max-width: 720px) {
    gap: 3px;
  }
`;

const CategoryOrderButton = styled.button`
  width: 34px;
  min-height: 22px;
  border: 1px solid var(--habit-line);
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--habit-muted);
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(66, 211, 146, 0.48);
    color: var(--habit-text);
    background: rgba(66, 211, 146, 0.1);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }

  @media (max-width: 720px) {
    width: 30px;
    min-height: 16px;

    svg {
      width: 12px;
      height: 12px;
    }
  }
`;

const RecordOrderControls = styled(CategoryOrderControls)<{ $compact?: boolean }>`
  align-self: center;
  gap: ${(props) => (props.$compact ? '2px' : '4px')};
`;

const RecordOrderButton = styled(CategoryOrderButton)<{ $compact?: boolean }>`
  width: ${(props) => (props.$compact ? '26px' : '32px')};
  min-height: ${(props) => (props.$compact ? '18px' : '22px')};
  border-color: rgba(255, 255, 255, 0.1);
  color: var(--habit-text);
  background: rgba(2, 6, 23, 0.18);

  @media (max-width: 720px) {
    width: ${(props) => (props.$compact ? '19px' : '28px')};
    min-height: ${(props) => (props.$compact ? '13px' : '16px')};
    border-radius: 5px;
  }
`;

const MicroButton = styled.button<{ $tone?: 'danger' | 'ghost' }>`
  width: 38px;
  height: 48px;
  border: 1px solid ${(props) => (props.$tone === 'danger' ? 'rgba(255, 122, 89, 0.35)' : 'var(--habit-line)')};
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => (props.$tone === 'danger' ? '#ffb19d' : 'var(--habit-muted)')};
  background: ${(props) => (props.$tone === 'danger' ? 'rgba(255, 122, 89, 0.09)' : 'rgba(255, 255, 255, 0.035)')};
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: ${(props) => (props.$tone === 'danger' ? 'rgba(255, 122, 89, 0.62)' : 'var(--habit-line-strong)')};
    color: ${(props) => (props.$tone === 'danger' ? '#ffd0c3' : 'var(--habit-text)')};
    background: ${(props) => (props.$tone === 'danger' ? 'rgba(255, 122, 89, 0.15)' : 'rgba(255, 255, 255, 0.07)')};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  @media (max-width: 720px) {
    width: 32px;
    height: 34px;
  }
`;

const ColorDot = styled.span<{ $color: string }>`
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: ${(props) => props.$color};
  box-shadow: 0 0 0 4px color-mix(in srgb, ${(props) => props.$color} 17%, transparent);

  @media (max-width: 720px) {
    width: 9px;
    height: 9px;
    box-shadow: 0 0 0 3px color-mix(in srgb, ${(props) => props.$color} 17%, transparent);
  }
`;

const CategoryName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 900;
`;

const CountBadge = styled.span`
  min-width: 28px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--habit-muted);
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.72rem;
  font-weight: 950;

  @media (max-width: 720px) {
    min-width: 22px;
    height: 20px;
    font-size: 0.66rem;
  }
`;

const OrderBadge = styled.span`
  min-height: 24px;
  border: 1px solid rgba(99, 179, 255, 0.32);
  border-radius: 999px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #b7dbff;
  background: rgba(99, 179, 255, 0.1);
  font-size: 0.68rem;
  font-weight: 950;
  white-space: nowrap;

  @media (max-width: 720px) {
    min-height: 20px;
    padding: 0 6px;
    font-size: 0.62rem;
  }
`;

const FormBlock = styled.div`
  border-top: 1px solid var(--habit-line);
  padding-top: 14px;
  display: grid;
  gap: 10px;
`;

const FieldLabel = styled.label`
  display: grid;
  gap: 6px;
  color: var(--habit-muted);
  font-size: 0.74rem;
  font-weight: 900;
`;

const TextInput = styled.input.attrs({ autoComplete: 'off' })`
  width: 100%;
  min-width: 0;
  height: 40px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 0 11px;
  color: var(--habit-text);
  background: rgba(255, 255, 255, 0.045);
  outline: none;
  font: inherit;

  &::placeholder {
    color: var(--habit-dim);
  }

  &:focus {
    border-color: rgba(66, 211, 146, 0.62);
    box-shadow: 0 0 0 3px rgba(66, 211, 146, 0.13);
  }
`;

const NumberInput = styled(TextInput).attrs({ type: 'number' })``;

const SelectInput = styled.select`
  width: 100%;
  min-width: 0;
  height: 40px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 0 11px;
  color: var(--habit-text);
  background: #111923;
  outline: none;
  font: inherit;

  &:focus {
    border-color: rgba(66, 211, 146, 0.62);
    box-shadow: 0 0 0 3px rgba(66, 211, 146, 0.13);
  }
`;

const InlineFields = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(80px, 0.45fr);
  gap: 8px;

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const TripleFields = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Palette = styled.div`
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
`;

const ColorSwatch = styled.button<{ $color: string; $active: boolean }>`
  width: 30px;
  height: 30px;
  border: 2px solid ${(props) => (props.$active ? '#ffffff' : 'transparent')};
  border-radius: 8px;
  background: ${(props) => props.$color};
  cursor: pointer;
  box-shadow: ${(props) => (props.$active ? `0 0 0 3px color-mix(in srgb, ${props.$color} 30%, transparent)` : 'none')};
`;

const SidePanelActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  ${IconButton} {
    width: 100%;
  }
`;

const ManageTabs = styled.div`
  height: 42px;
  padding: 3px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(112px, 1fr));
  gap: 3px;
  background: rgba(255, 255, 255, 0.04);

  @media (max-width: 640px) {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const DefaultRecordLayoutPanel = styled.div`
  padding: 14px;
  border-bottom: 1px solid rgba(66, 211, 146, 0.16);
  display: grid;
  grid-template-columns: minmax(220px, 0.78fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  background:
    linear-gradient(135deg, rgba(66, 211, 146, 0.075), rgba(99, 179, 255, 0.045)),
    rgba(255, 255, 255, 0.018);

  > div:first-child {
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  strong {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--habit-text);
    font-size: 0.88rem;
    font-weight: 950;
  }

  > div:first-child span {
    color: var(--habit-muted);
    font-size: 0.75rem;
    font-weight: 800;
    line-height: 1.45;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const DefaultRecordLayoutActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 430px) {
    grid-template-columns: 1fr;
  }
`;

const DefaultRecordLayoutButton = styled.button<{ $active: boolean }>`
  min-width: 0;
  min-height: 42px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(66, 211, 146, 0.58)' : 'var(--habit-line)')};
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-muted)')};
  background: ${(props) => (props.$active ? 'var(--habit-green)' : 'rgba(255, 255, 255, 0.04)')};
  font-size: 0.8rem;
  font-weight: 950;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(66, 211, 146, 0.58);
    color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-text)')};
    background: ${(props) => (props.$active ? 'var(--habit-green)' : 'rgba(66, 211, 146, 0.1)')};
  }

  &:focus-visible {
    outline: 3px solid rgba(66, 211, 146, 0.22);
    outline-offset: 2px;
  }
`;

const DangerResetPanel = styled.div`
  padding: 14px;
  border-bottom: 1px solid rgba(255, 122, 89, 0.18);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background:
    linear-gradient(135deg, rgba(255, 122, 89, 0.09), rgba(255, 255, 255, 0.012) 58%),
    rgba(255, 255, 255, 0.018);

  > div {
    min-width: 240px;
    display: grid;
    gap: 5px;
  }

  strong {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #ffd2c5;
    font-size: 0.88rem;
    font-weight: 950;
  }

  span {
    color: var(--habit-muted);
    font-size: 0.75rem;
    font-weight: 800;
    line-height: 1.45;
  }

  ${IconButton} {
    min-width: 142px;
  }
`;

const DangerResetActions = styled.div`
  && {
    min-width: 0;
    display: flex;
    grid-template-columns: none;
    flex-direction: row;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  @media (max-width: 640px) {
    && {
      width: 100%;
      justify-content: stretch;
    }

    ${IconButton} {
      flex: 1 1 150px;
    }
  }
`;

const ManageTabButton = styled.button<{ $active: boolean }>`
  border: 0;
  border-radius: 6px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-muted)')};
  background: ${(props) => (props.$active ? 'var(--habit-green)' : 'transparent')};
  font: inherit;
  font-size: 0.8rem;
  font-weight: 950;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;

  &:hover {
    color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-text)')};
    background: ${(props) => (props.$active ? 'var(--habit-green)' : 'rgba(255, 255, 255, 0.07)')};
  }
`;

const ManageComposer = styled.div`
  scroll-margin-top: 18px;
  padding: 22px;
  border-bottom: 1px solid var(--habit-line);
  background:
    linear-gradient(180deg, rgba(66, 211, 146, 0.055), rgba(255, 255, 255, 0.018)),
    rgba(255, 255, 255, 0.02);

  @media (max-width: 720px) {
    padding: 16px;
  }
`;

const ManageForm = styled(FormBlock)`
  border-top: 0;
  padding-top: 0;
  gap: 18px;

  ${TextInput},
  ${NumberInput},
  ${SelectInput} {
    min-height: 56px;
    padding-inline: 14px;
    font-size: 1rem;
  }

  ${FieldLabel} {
    gap: 8px;
    font-size: 0.82rem;
  }

  ${InlineFields} {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  ${TripleFields} {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
    gap: 12px;
  }

  @media (max-width: 720px) {
    ${TripleFields} {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

const ManageFormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: start;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ManageWideField = styled.div`
  grid-column: span 2;

  @media (max-width: 640px) {
    grid-column: auto;
  }
`;

const ManageActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 2px;

  @media (max-width: 480px) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);

    ${IconButton} {
      width: 100%;
    }
  }
`;

const EmptyStateActions = styled.div`
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const PresetLauncher = styled.div`
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 14px;
  display: grid;
  gap: 12px;
  background:
    linear-gradient(135deg, rgba(66, 211, 146, 0.08), rgba(99, 179, 255, 0.04)),
    rgba(255, 255, 255, 0.026);
`;

const PresetHeaderActions = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
`;

const HabitPresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const HabitPresetButton = styled.button<{ $color: string; $active: boolean }>`
  min-height: 82px;
  border: 1px solid ${(props) => (props.$active ? props.$color : 'var(--habit-line)')};
  border-radius: 8px;
  padding: 11px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  color: var(--habit-text);
  background:
    linear-gradient(135deg, color-mix(in srgb, ${(props) => props.$color} ${(props) => (props.$active ? 18 : 10)}%, transparent), transparent 70%),
    rgba(255, 255, 255, 0.035);
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: ${(props) => props.$color};
    background:
      linear-gradient(135deg, color-mix(in srgb, ${(props) => props.$color} 18%, transparent), transparent 70%),
      rgba(255, 255, 255, 0.055);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  svg {
    width: 18px;
    height: 18px;
  }

  strong,
  span,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    display: block;
    font-size: 0.86rem;
    font-weight: 950;
  }

  span {
    display: block;
    margin-top: 3px;
    color: var(--habit-muted);
    font-size: 0.72rem;
    font-weight: 850;
  }

  small {
    display: block;
    margin-top: 5px;
    color: ${(props) => props.$color};
    font-size: 0.66rem;
    font-weight: 950;
  }
`;

const PresetIcon = styled.span<{ $color: string }>`
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 36%, transparent);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => props.$color};
  background: color-mix(in srgb, ${(props) => props.$color} 13%, transparent);
`;

const AdvancedSettingsToggle = styled.button<{ $active: boolean }>`
  min-height: 42px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(99, 179, 255, 0.5)' : 'var(--habit-line)')};
  border-radius: 8px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  justify-self: start;
  color: ${(props) => (props.$active ? '#b7dbff' : 'var(--habit-muted)')};
  background: ${(props) => (props.$active ? 'rgba(99, 179, 255, 0.12)' : 'rgba(255, 255, 255, 0.035)')};
  font: inherit;
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: rgba(99, 179, 255, 0.62);
    color: var(--habit-text);
  }
`;

const AutoCategoryNote = styled.div`
  min-height: 42px;
  border: 1px dashed rgba(66, 211, 146, 0.34);
  border-radius: 8px;
  padding: 9px 11px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8af0bd;
  background: rgba(66, 211, 146, 0.07);
  font-size: 0.76rem;
  font-weight: 900;
`;

const GoalSettingsPanel = styled.div`
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 14px;
  display: grid;
  gap: 12px;
  background:
    linear-gradient(135deg, rgba(99, 179, 255, 0.07), transparent 48%),
    rgba(255, 255, 255, 0.026);
`;

const GoalDirectionSwitch = styled.div`
  min-height: 42px;
  padding: 3px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
  background: rgba(255, 255, 255, 0.04);

  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const GoalDirectionButton = styled.button<{ $active: boolean }>`
  border: 0;
  border-radius: 6px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-muted)')};
  background: ${(props) => (props.$active ? 'var(--habit-green)' : 'transparent')};
  font: inherit;
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;

  &:hover {
    color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-text)')};
    background: ${(props) => (props.$active ? 'var(--habit-green)' : 'rgba(255, 255, 255, 0.07)')};
  }

  body[data-propig-design='codeit'] & {
    color: ${(props) => (props.$active ? '#ffffff' : 'var(--habit-muted)')};
    background: ${(props) => (props.$active ? 'var(--codeit-primary)' : 'transparent')};
    box-shadow: ${(props) => (props.$active ? '0 8px 18px rgba(52, 81, 209, 0.18)' : 'none')};
  }

  body[data-propig-design='codeit'] &:hover {
    color: ${(props) => (props.$active ? '#ffffff' : 'var(--codeit-text)')};
    background: ${(props) => (props.$active ? 'var(--codeit-primary-hover)' : 'var(--codeit-primary-soft)')};
  }
`;

const GoalMetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
`;

const GoalMetricCard = styled.div<{ $color: string }>`
  min-width: 0;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 32%, transparent);
  border-radius: 8px;
  padding: 12px;
  display: grid;
  gap: 10px;
  background:
    linear-gradient(135deg, color-mix(in srgb, ${(props) => props.$color} 10%, transparent), transparent 62%),
    rgba(255, 255, 255, 0.028);
`;

const CompactGoalSwitch = styled(GoalDirectionSwitch)`
  min-height: 34px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
`;

const CompactGoalButton = styled(GoalDirectionButton)`
  min-height: 28px;
  padding: 0 6px;
  font-size: 0.68rem;
`;

const PresetStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
`;

const PresetButton = styled.button`
  min-height: 34px;
  border: 1px solid var(--habit-line);
  border-radius: 999px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--habit-text);
  background: rgba(255, 255, 255, 0.045);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 900;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--habit-line-strong);
    background: rgba(255, 255, 255, 0.075);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const GoalIssueText = styled.p`
  margin: 0;
  color: #ffb19d;
  font-size: 0.68rem;
  font-weight: 850;
  line-height: 1.45;
`;

const ManageListGrid = styled.div`
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ManageCardActions = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;

  ${IconButton} {
    min-height: 38px;
  }
`;

const CategoryManageGrid = styled.div`
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
`;

const CategoryManageCard = styled.article<{ $color: string }>`
  min-width: 0;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 34%, var(--habit-line));
  border-radius: 8px;
  padding: 13px;
  display: grid;
  gap: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, ${(props) => props.$color} 11%, transparent), transparent 62%),
    rgba(255, 255, 255, 0.035);
`;

const CategoryCardTop = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
`;

const CategoryCardName = styled.strong`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--habit-text);
  font-size: 0.95rem;
  font-weight: 950;
`;

const CategoryCardMeta = styled.div`
  color: var(--habit-muted);
  font-size: 0.76rem;
  font-weight: 850;
`;

const MainPanel = styled(Surface)`
  min-width: 0;
  overflow: hidden;
`;

const DailyHeader = styled.div`
  padding: 14px;
  border-bottom: 1px solid var(--habit-line);
  display: grid;
  gap: 12px;

  @media (max-width: 720px) {
    padding: 8px;
    gap: 8px;
  }
`;

const DailyHeaderActions = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;

  @media (max-width: 560px) {
    width: 100%;
    justify-content: stretch;

    ${IconButton} {
      flex: 1;
    }
  }
`;

const MonthNavigator = styled.div`
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 38px;
  gap: 10px;
  align-items: stretch;

  @media (max-width: 640px) {
    grid-template-columns: 32px minmax(0, 1fr) 32px;
    gap: 6px;
  }
`;

const MonthDisplay = styled.div`
  min-width: 0;
  min-height: 46px;
  border: 1px solid rgba(66, 211, 146, 0.28);
  border-radius: 8px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--habit-text);
  background:
    linear-gradient(135deg, rgba(66, 211, 146, 0.11), rgba(99, 179, 255, 0.08)),
    rgba(255, 255, 255, 0.035);
  text-align: center;

  svg {
    flex: 0 0 auto;
    color: var(--habit-green);
  }

  strong {
    min-width: 0;
    font-size: 1rem;
    font-weight: 950;
    white-space: nowrap;
  }

  span {
    color: var(--habit-muted);
    font-size: 0.74rem;
    font-weight: 900;
    white-space: nowrap;
  }

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-primary-border);
    background:
      linear-gradient(135deg, var(--codeit-primary-soft), rgba(255, 255, 255, 0.88)),
      #ffffff;
  }

  @media (max-width: 520px) {
    min-height: 40px;
    padding: 0 9px;
    gap: 6px;

    strong {
      font-size: 0.86rem;
    }

    span {
      font-size: 0.66rem;
    }
  }

  @media (max-width: 380px) {
    svg {
      display: none;
    }
  }
`;

const ViewSettingsGroup = styled.div`
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--habit-muted);
  font-size: 0.74rem;
  font-weight: 950;

  @media (max-width: 560px) {
    flex: 1 1 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
  }
`;

const ViewSettingsLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;

  @media (max-width: 420px) {
    span {
      display: none;
    }
  }
`;

const RecordLayoutSwitch = styled.div`
  height: 38px;
  padding: 3px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(58px, 1fr));
  gap: 3px;
  background: rgba(255, 255, 255, 0.04);

  @media (max-width: 560px) {
    flex: 1;
    height: 34px;
  }
`;

const RecordLayoutButton = styled.button<{ $active: boolean }>`
  border: 0;
  border-radius: 6px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-muted)')};
  background: ${(props) => (props.$active ? 'var(--habit-green)' : 'transparent')};
  font: inherit;
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;

  &:hover {
    color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-text)')};
    background: ${(props) => (props.$active ? 'var(--habit-green)' : 'rgba(255, 255, 255, 0.07)')};
  }

  @media (max-width: 720px) {
    padding: 0 8px;
    gap: 5px;
    font-size: 0.72rem;

    svg {
      width: 13px;
      height: 13px;
    }
  }
`;

const DateTools = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;

  @media (max-width: 640px) {
    grid-template-columns: 32px minmax(0, 1fr) 32px;
    gap: 6px;
  }
`;

const DateRail = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(9, minmax(72px, 1fr));
  gap: 7px;
  overflow-x: auto;

  @media (max-width: 720px) {
    grid-template-columns: repeat(9, 48px);
    gap: 4px;
  }

  @media (max-width: 380px) {
    grid-template-columns: repeat(9, 44px);
  }
`;

const DateButton = styled.button<{ $active: boolean; $percent: number; $weekendTone: WeekendTone }>`
  min-width: 72px;
  min-height: 70px;
  border: 1px solid ${(props) => getWeekendAccent(props.$weekendTone, 'border', props.$active ? 'rgba(66, 211, 146, 0.75)' : 'var(--habit-line)')};
  border-radius: 8px;
  padding: 0 8px 8px;
  display: grid;
  align-content: start;
  gap: 5px;
  justify-items: stretch;
  color: ${(props) => (props.$active ? 'var(--habit-text)' : 'var(--habit-muted)')};
  background: ${(props) =>
    props.$weekendTone === 'weekday'
      ? props.$active
        ? 'rgba(66, 211, 146, 0.11)'
        : 'rgba(255, 255, 255, 0.03)'
      : getWeekendAccent(props.$weekendTone, 'background', 'rgba(255, 255, 255, 0.03)')};
  cursor: pointer;
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    width: ${(props) => props.$percent}%;
    background: ${(props) => (props.$percent >= 80 ? 'var(--habit-green)' : props.$percent >= 45 ? 'var(--habit-yellow)' : 'var(--habit-coral)')};
  }

  strong {
    color: ${(props) => getWeekendAccent(props.$weekendTone, 'text', 'var(--habit-text)')};
    font-size: 1.08rem;
    font-weight: 950;
  }

  span,
  small {
    font-size: 0.72rem;
    font-weight: 900;
  }

  span {
    min-height: 25px;
    margin: 0 -8px 1px;
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    background: ${(props) => getDateBandColor(props.$weekendTone, props.$active)};
    box-shadow: inset 0 -1px 0 rgba(2, 6, 23, 0.22);
  }

  small {
    color: var(--habit-dim);
  }

  @media (max-width: 720px) {
    min-width: 48px;
    min-height: 48px;
    padding: 0 5px 5px;
    gap: 2px;

    strong {
      font-size: 0.82rem;
    }

    span {
      min-height: 18px;
      margin: 0 -5px 0;
      padding: 0 5px;
    }

    span,
    small {
      font-size: 0.58rem;
    }
  }

  @media (max-width: 380px) {
    min-width: 44px;
    min-height: 46px;

    strong {
      font-size: 0.76rem;
    }

    span,
    small {
      font-size: 0.54rem;
    }
  }
`;

const SimpleLogScroller = styled.div`
  padding: 12px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: 720px) {
    padding: 6px;
  }
`;

const SimpleLogGrid = styled.div<{ $columns: number; $selectedColumn: number }>`
  width: 100%;
  display: grid;
  grid-template-columns: minmax(148px, 1.32fr) repeat(${(props) => props.$columns}, minmax(54px, 1fr));
  align-items: stretch;
  gap: 4px;

  @media (max-width: 720px) {
    grid-template-columns: minmax(112px, 1.7fr) ${(props) =>
      getSimpleLogColumnTemplate(props.$columns, props.$selectedColumn, 'minmax(46px, 1.35fr)', 'minmax(24px, 0.72fr)')};
    gap: 3px;
  }

  @media (max-width: 380px) {
    grid-template-columns: minmax(96px, 1.55fr) ${(props) =>
      getSimpleLogColumnTemplate(props.$columns, props.$selectedColumn, 'minmax(44px, 1.28fr)', 'minmax(22px, 0.64fr)')};
    gap: 2px;
  }
`;

const SimpleHeaderCell = styled.div`
  min-height: 58px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px 8px 4px 4px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  color: var(--habit-muted);
  background: rgba(255, 255, 255, 0.035);
  font-size: 0.78rem;
  font-weight: 950;

  @media (max-width: 720px) {
    min-height: 32px;
    padding: 4px 3px;
    font-size: 0.58rem;
  }
`;

const SimpleDateHeader = styled(SimpleHeaderCell)<{ $active: boolean; $weekendTone: WeekendTone }>`
  justify-content: center;
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 5px;
  padding: 0 10px 9px;
  color: ${(props) => (props.$active ? 'var(--habit-text)' : 'var(--habit-muted)')};
  border-color: ${(props) => getWeekendAccent(props.$weekendTone, 'border', props.$active ? 'rgba(66, 211, 146, 0.44)' : 'rgba(255, 255, 255, 0.04)')};
  background: ${(props) =>
    props.$weekendTone === 'weekday'
      ? props.$active
        ? 'rgba(66, 211, 146, 0.11)'
        : 'rgba(255, 255, 255, 0.035)'
      : getWeekendAccent(props.$weekendTone, 'background', 'rgba(255, 255, 255, 0.035)')};
  overflow: hidden;

  span {
    width: calc(100% + 20px);
    min-height: 24px;
    margin: 0 -10px 1px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    background: ${(props) => getDateBandColor(props.$weekendTone, props.$active)};
    box-shadow: inset 0 -1px 0 rgba(2, 6, 23, 0.22);
    font-size: 0.72rem;
  }

  strong {
    color: ${(props) => getWeekendAccent(props.$weekendTone, 'text', 'var(--habit-text)')};
    font-size: 1rem;
    font-weight: 950;
  }

  small {
    color: var(--item-color);
    font-size: 0.7rem;
    font-weight: 950;
  }

  @media (max-width: 720px) {
    min-height: 32px;
    padding: 0 2px 4px;
    gap: 2px;
    line-height: 1;

    span {
      width: calc(100% + 4px);
      min-height: 15px;
      margin: 0 -2px 0;
      font-size: 0.48rem;
    }

    strong {
      font-size: 0.62rem;
    }
  }

  @media (max-width: 380px) {
    span {
      font-size: 0.46rem;
    }

    strong {
      font-size: 0.58rem;
    }
  }
`;

const SimpleHabitLabel = styled.div<{ $color: string }>`
  min-height: 74px;
  border: 1px solid var(--habit-line);
  border-radius: 4px 8px 8px 4px;
  padding: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-items: stretch;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.045);

  @media (max-width: 720px) {
    min-height: 52px;
  }
`;

const SimpleHabitCategoryBand = styled.div<{ $color: string }>`
  min-height: 26px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  color: #ffffff;
  background: ${(props) => props.$color};
  box-shadow: inset 0 -1px 0 rgba(2, 6, 23, 0.22);
  font-size: 0.68rem;
  font-weight: 950;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    min-height: 16px;
    padding: 0 5px;
    font-size: 0.46rem;
  }
`;

const SimpleHabitBody = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 12px 10px;

  @media (max-width: 720px) {
    grid-template-columns: 16px minmax(0, 1fr) auto;
    gap: 3px;
    padding: 4px 5px 5px;
  }

  strong,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    display: block;
    color: var(--habit-text);
    font-size: 0.94rem;
    font-weight: 950;

    @media (max-width: 720px) {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      white-space: normal;
      font-size: 0.66rem;
      line-height: 1.12;
    }
  }

  small {
    display: block;
    margin-top: 3px;
    color: var(--habit-muted);
    font-size: 0.7rem;
    font-weight: 900;

    @media (max-width: 720px) {
      margin-top: 2px;
      font-size: 0.52rem;
    }

    @media (max-width: 380px) {
      font-size: 0.48rem;
    }
  }
`;

const SimpleProgressRing = styled.span<{ $percent: number; $color: string }>`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  background: conic-gradient(
    ${(props) => props.$color} ${(props) => props.$percent * 3.6}deg,
    rgba(255, 255, 255, 0.12) 0
  );

  &::after {
    content: '';
    width: 18px;
    height: 18px;
    border-radius: inherit;
    background: #202832;
  }

  @media (max-width: 720px) {
    width: 16px;
    height: 16px;

    &::after {
      width: 10px;
      height: 10px;
    }
  }
`;

const SimpleRecordCell = styled.button<{ $active: boolean; $selected: boolean; $color: string }>`
  min-width: 0;
  min-height: 74px;
  border: 1px solid ${(props) => (props.$selected ? 'rgba(66, 211, 146, 0.58)' : 'var(--habit-line)')};
  border-radius: 8px;
  padding: 8px 6px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 2px;
  color: ${(props) => (props.$active ? props.$color : 'var(--habit-dim)')};
  background: ${(props) =>
    props.$active
      ? `color-mix(in srgb, ${props.$color} 16%, rgba(255, 255, 255, 0.045))`
      : 'rgba(255, 255, 255, 0.035)'};
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: ${(props) => props.$color};
    color: ${(props) => (props.$active ? props.$color : 'var(--habit-text)')};
    background: ${(props) => `color-mix(in srgb, ${props.$color} 13%, rgba(255, 255, 255, 0.055))`};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  strong {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
    font-size: 1rem;
    line-height: 1;
    font-weight: 950;
  }

  span {
    color: ${(props) => (props.$active ? 'inherit' : 'var(--habit-dim)')};
    font-size: 0.72rem;
    font-weight: 900;
  }

  @media (max-width: 720px) {
    min-height: 52px;
    padding: ${(props) => (props.$selected ? '5px 4px' : '5px 1px')};
    border-radius: 6px;
    gap: ${(props) => (props.$selected ? '2px' : '1px')};

    strong {
      white-space: ${(props) => (props.$selected ? 'normal' : 'nowrap')};
      overflow-wrap: anywhere;
      font-size: ${(props) => (props.$selected ? '0.76rem' : '0.58rem')};
      line-height: 1.05;
    }

    span {
      font-size: ${(props) => (props.$selected ? '0.52rem' : '0.46rem')};
      line-height: 1;
    }
  }

  @media (max-width: 380px) {
    min-height: 50px;

    strong {
      font-size: ${(props) => (props.$selected ? '0.7rem' : '0.54rem')};
    }

    span {
      display: ${(props) => (props.$selected ? 'block' : 'none')};
    }
  }
`;

const HabitGrid = styled.div`
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 960px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const HabitCard = styled.article<{ $color: string }>`
  min-width: 0;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 34%, var(--habit-line));
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
`;

const HabitCategoryBand = styled.div<{ $color: string }>`
  min-height: 38px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #ffffff;
  background: ${(props) => props.$color};
  box-shadow: inset 0 -1px 0 rgba(2, 6, 23, 0.24);
  font-size: 0.78rem;
  font-weight: 950;

  span,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    flex: 0 0 auto;
    opacity: 0.82;
    font-size: 0.68rem;
    font-weight: 900;
  }
`;

const HabitCardHead = styled.div`
  padding: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
`;

const HabitName = styled.h3`
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--habit-text);
  font-size: 0.98rem;
  font-weight: 950;
`;

const HabitMeta = styled.div`
  margin-top: 5px;
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  color: var(--habit-muted);
  font-size: 0.73rem;
  font-weight: 850;
`;

const ModePill = styled.span<{ $color: string }>`
  min-height: 24px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 38%, transparent);
  border-radius: 999px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: ${(props) => props.$color};
  background: color-mix(in srgb, ${(props) => props.$color} 12%, transparent);
`;

const ProgressTrack = styled.div`
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $percent: number; $color: string }>`
  width: ${(props) => getScoreTrackPercent(props.$percent)}%;
  height: 100%;
  background: ${(props) => props.$color};
  transition: width 0.2s ease;
`;

const ControlArea = styled.div`
  padding: 12px;
  display: grid;
  gap: 10px;
`;

const ToggleRecordButton = styled.button<{ $active: boolean }>`
  min-height: 78px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(66, 211, 146, 0.72)' : 'var(--habit-line)')};
  border-radius: 8px;
  padding: 14px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  color: ${(props) => (props.$active ? 'var(--habit-text)' : 'var(--habit-muted)')};
  background: ${(props) =>
    props.$active
      ? 'linear-gradient(135deg, rgba(66, 211, 146, 0.18), rgba(45, 212, 191, 0.1))'
      : 'rgba(255, 255, 255, 0.045)'};
  cursor: pointer;
  font-weight: 950;
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(66, 211, 146, 0.68);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }
`;

const CheckBoxMark = styled.span<{ $active: boolean }>`
  width: 34px;
  height: 34px;
  border: 2px solid ${(props) => (props.$active ? 'var(--habit-green)' : 'var(--habit-line-strong)')};
  border-radius: 7px;
  display: inline-grid;
  place-items: center;
  color: ${(props) => (props.$active ? '#06110d' : 'transparent')};
  background: ${(props) => (props.$active ? 'linear-gradient(135deg, #42d392, #2dd4bf)' : 'rgba(255, 255, 255, 0.035)')};
  box-shadow: ${(props) => (props.$active ? '0 0 0 4px rgba(66, 211, 146, 0.13)' : 'none')};

  svg {
    width: 21px;
    height: 21px;
    stroke-width: 3;
  }
`;

const CheckModePreview = styled.div`
  min-height: 76px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 14px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  background:
    linear-gradient(135deg, rgba(66, 211, 146, 0.11), rgba(45, 212, 191, 0.04)),
    rgba(255, 255, 255, 0.035);

  strong {
    display: block;
    color: var(--habit-text);
    font-size: 0.93rem;
    font-weight: 950;
  }

  span {
    display: block;
    margin-top: 3px;
    color: var(--habit-muted);
    font-size: 0.76rem;
    font-weight: 850;
  }
`;

const InputWithUnit = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
`;

const MetricInputGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const TargetUnitPair = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(92px, 0.75fr);
  gap: 10px;

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const UnitText = styled.span`
  min-width: 46px;
  color: var(--habit-muted);
  font-size: 0.82rem;
  font-weight: 900;
`;

const ChoiceOptionEditor = styled.div`
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 12px;
  display: grid;
  gap: 10px;
  background: rgba(255, 255, 255, 0.026);
`;

const ChoiceEditorHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--habit-muted);
  font-size: 0.78rem;
  font-weight: 950;
`;

const ChoiceOptionRow = styled.div`
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 42px;
  gap: 10px;
  align-items: center;
`;

const ChoiceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ChoiceButton = styled.button<{ $active: boolean; $mode: 'single' | 'multi' }>`
  min-height: 44px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(66, 211, 146, 0.72)' : 'var(--habit-line)')};
  border-radius: 8px;
  padding: 8px 10px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-text)')};
  background: ${(props) => (props.$active ? 'linear-gradient(135deg, #42d392, #2dd4bf)' : 'rgba(255, 255, 255, 0.035)')};
  cursor: pointer;
  text-align: left;
  font-weight: 950;

  svg {
    width: 18px;
    height: 18px;
    padding: ${(props) => (props.$mode === 'single' ? '3px' : '0')};
    border: ${(props) => (props.$mode === 'single' ? '2px solid currentColor' : '0')};
    border-radius: ${(props) => (props.$mode === 'single' ? '999px' : '4px')};
  }

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const RecordHint = styled.div`
  min-height: 34px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 7px 10px;
  color: var(--habit-muted);
  background: rgba(255, 255, 255, 0.03);
  font-size: 0.76rem;
  font-weight: 900;
`;

const QuickRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const SetList = styled.div`
  display: grid;
  gap: 8px;
`;

const SetRow = styled.div`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) minmax(0, 1fr) 34px;
  gap: 7px;
  align-items: center;
`;

const SetIndex = styled.span`
  color: var(--habit-muted);
  font-size: 0.78rem;
  font-weight: 950;
`;

const RatingRow = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
`;

const RatingButton = styled.button<{ $active: boolean }>`
  min-height: 48px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(248, 198, 78, 0.68)' : 'var(--habit-line)')};
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => (props.$active ? '#f8c64e' : 'var(--habit-dim)')};
  background: ${(props) => (props.$active ? 'rgba(248, 198, 78, 0.13)' : 'rgba(255, 255, 255, 0.035)')};
  cursor: pointer;
`;

const EmptyState = styled.div`
  min-height: 280px;
  padding: 28px;
  display: grid;
  place-items: center;
  color: var(--habit-muted);
  text-align: center;
`;

const StatsGrid = styled.div`
  padding: 14px;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 12px;

  @media (max-width: 1120px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StatsToolbar = styled.div`
  padding: 14px;
  border-bottom: 1px solid var(--habit-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const PeriodSwitch = styled.div`
  height: 40px;
  padding: 3px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(74px, 1fr));
  gap: 3px;
  background: rgba(255, 255, 255, 0.04);
`;

const PeriodButton = styled.button<{ $active: boolean }>`
  border: 0;
  border-radius: 6px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-muted)')};
  background: ${(props) => (props.$active ? 'var(--habit-green)' : 'transparent')};
  font: inherit;
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;

  &:hover {
    color: ${(props) => (props.$active ? '#07100c' : 'var(--habit-text)')};
    background: ${(props) => (props.$active ? 'var(--habit-green)' : 'rgba(255, 255, 255, 0.07)')};
  }

  @media (max-width: 560px) {
    padding: 0 8px;
    font-size: 0.72rem;
  }
`;

const RangeNavigator = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const RangeLabel = styled.div`
  min-height: 38px;
  min-width: 150px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--habit-text);
  background: rgba(255, 255, 255, 0.035);
  font-size: 0.82rem;
  font-weight: 950;
`;

const WeekdayStrip = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 7px;

  @media (max-width: 720px) {
    grid-template-columns: repeat(7, minmax(42px, 1fr));
    overflow-x: auto;
  }
`;

const WeekdayCell = styled.div<{ $percent: number; $weekendTone: WeekendTone }>`
  min-height: 72px;
  border: 1px solid
    ${(props) => getWeekendAccent(props.$weekendTone, 'border', props.$percent > 0 ? 'rgba(66, 211, 146, 0.36)' : 'var(--habit-line)')};
  border-radius: 8px;
  padding: 9px 8px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 3px;
  color: var(--habit-muted);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent),
    ${(props) => {
      if (props.$weekendTone !== 'weekday' && props.$percent === 0) return getWeekendAccent(props.$weekendTone, 'background', 'rgba(255, 255, 255, 0.03)');
      if (props.$percent >= 80) return 'rgba(66, 211, 146, 0.14)';
      if (props.$percent >= 45) return 'rgba(99, 179, 255, 0.11)';
      if (props.$percent > 0) return 'rgba(248, 198, 78, 0.1)';
      return 'rgba(255, 255, 255, 0.03)';
    }};

  strong {
    color: ${(props) => getWeekendAccent(props.$weekendTone, 'text', 'var(--habit-text)')};
    font-size: 0.9rem;
    font-weight: 950;
  }

  span,
  small {
    font-size: 0.72rem;
    font-weight: 900;
  }

  small {
    color: ${(props) => (props.$percent > 0 ? 'var(--habit-green)' : 'var(--habit-dim)')};
  }

  span {
    color: ${(props) => getWeekendAccent(props.$weekendTone, 'text', 'inherit')};
  }
`;

const StatsColumn = styled.div`
  min-width: 0;
  display: grid;
  gap: 12px;
`;

const ChartPanel = styled.div`
  min-width: 0;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.035);
`;

const ChartTitle = styled.div`
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--habit-text);
  font-weight: 950;
`;

const ChartCaption = styled.span`
  color: var(--habit-muted);
  font-size: 0.76rem;
  font-weight: 850;
`;

const ChartBox = styled.div`
  width: 100%;
  height: 250px;

  @media (max-width: 720px) {
    height: 220px;
  }
`;

const ChartFallback = styled.div`
  width: 100%;
  height: 100%;
  border: 1px dashed var(--habit-line);
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--habit-muted);
  background: rgba(255, 255, 255, 0.025);
  font-size: 0.82rem;
  font-weight: 900;
`;

const SyncPill = styled.span<{ $state: 'ready' | 'saving' | 'locked' }>`
  min-height: 34px;
  border: 1px solid
    ${(props) =>
      props.$state === 'ready'
        ? 'rgba(66, 211, 146, 0.36)'
        : props.$state === 'saving'
          ? 'rgba(248, 198, 78, 0.42)'
          : 'rgba(255, 122, 89, 0.34)'};
  border-radius: 999px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: ${(props) =>
    props.$state === 'ready' ? '#8af0bd' : props.$state === 'saving' ? '#ffe9a6' : '#ffb19d'};
  background: ${(props) =>
    props.$state === 'ready'
      ? 'rgba(66, 211, 146, 0.1)'
      : props.$state === 'saving'
        ? 'rgba(248, 198, 78, 0.1)'
        : 'rgba(255, 122, 89, 0.1)'};
  font-size: 0.76rem;
  font-weight: 950;
  white-space: nowrap;

  @media (max-width: 720px) {
    min-height: 32px;
    padding: 0 9px;
    gap: 5px;
    font-size: 0.68rem;
  }
`;

const GatePanel = styled.section`
  min-height: 360px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 28px;
  display: grid;
  place-items: center;
  text-align: center;
  background:
    linear-gradient(180deg, rgba(17, 25, 36, 0.92), rgba(9, 14, 21, 0.95)),
    var(--habit-panel);

  body[data-propig-design='codeit'] & {
    background: #ffffff;
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
  }
`;

const GateContent = styled.div`
  width: min(520px, 100%);
  display: grid;
  justify-items: center;
  gap: 14px;

  svg {
    color: var(--habit-green);
  }

  h2 {
    margin: 0;
    color: var(--habit-text);
    font-size: 1.35rem;
    font-weight: 950;
  }

  p {
    margin: 0;
    color: var(--habit-muted);
    line-height: 1.6;
  }
`;

const CategoryStatList = styled.div`
  display: grid;
  gap: 8px;
`;

const CategoryStatRow = styled.div<{ $color: string }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  color: var(--habit-muted);
  font-size: 0.78rem;
  font-weight: 900;

  strong {
    color: var(--habit-text);
  }

  & > div > span {
    color: ${(props) => props.$color};
  }
`;

const ScoreColumn = styled.div`
  min-width: 78px;
  display: grid;
  justify-items: end;
  gap: 4px;
`;

const ScoreValue = styled.span<{ $color: string }>`
  color: ${(props) => props.$color};
  font-size: 1.05rem;
  font-weight: 950;
  line-height: 1;
`;

const ScoreMeta = styled.small`
  color: var(--habit-muted);
  font-size: 0.68rem;
  font-weight: 900;
  white-space: nowrap;
`;

const MiniTrack = styled.div`
  height: 9px;
  margin-top: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
`;

const MiniFill = styled.div<{ $percent: number; $color: string }>`
  width: ${(props) => {
    const percent = getScoreTrackPercent(props.$percent);
    return percent > 0 ? `max(${percent}%, 4px)` : '0';
  }};
  height: 100%;
  background: linear-gradient(90deg, ${(props) => props.$color}, color-mix(in srgb, ${(props) => props.$color} 62%, white));
`;

const HabitRankList = styled.div`
  display: grid;
  gap: 8px;
`;

const HabitRankRow = styled.div`
  min-height: 54px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 9px 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  background: rgba(255, 255, 255, 0.032);
`;

const RankName = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--habit-text);
  font-weight: 950;
`;

const RankMeta = styled.div`
  margin-top: 3px;
  color: var(--habit-muted);
  font-size: 0.72rem;
  font-weight: 850;
`;

const HeatMap = styled.div<{ $columns?: number }>`
  display: grid;
  grid-template-columns: repeat(${(props) => props.$columns ?? 14}, minmax(14px, 1fr));
  gap: 5px;

  @media (max-width: 520px) {
    grid-template-columns: repeat(6, minmax(32px, 1fr));
  }
`;

const HeatCell = styled.div<{ $percent: number }>`
  aspect-ratio: 1;
  border: 1px solid var(--habit-line);
  border-radius: 5px;
  background: ${(props) => {
    if (props.$percent >= 80) return 'rgba(66, 211, 146, 0.9)';
    if (props.$percent >= 55) return 'rgba(99, 179, 255, 0.72)';
    if (props.$percent >= 25) return 'rgba(248, 198, 78, 0.6)';
    if (props.$percent > 0) return 'rgba(255, 122, 89, 0.52)';
    return 'rgba(255, 255, 255, 0.04)';
  }};
`;

const ItemStatsPanel = styled(ChartPanel)<{ $color: string }>`
  --item-color: ${(props) => props.$color};

  margin: 14px 14px 0;
  display: grid;
  gap: 14px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--item-color) 12%, transparent), transparent 42%),
    rgba(255, 255, 255, 0.035);

  @media (max-width: 720px) {
    margin: 8px 8px 0;
    padding: 10px;
    gap: 10px;
  }
`;

const ItemStatsHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 340px) auto;
  gap: 12px;
  align-items: start;

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ItemStatsSelect = styled(SelectInput)`
  height: 42px;
  font-weight: 900;
`;

const ItemStatsSummaryGrid = styled.div`
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  background: rgba(7, 10, 15, 0.26);

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ItemStatTile = styled.div`
  min-width: 0;
  min-height: 84px;
  padding: 13px;
  display: grid;
  align-content: center;
  gap: 6px;
  border-right: 1px solid var(--habit-line);

  &:last-child {
    border-right: 0;
  }

  span {
    color: var(--habit-muted);
    font-size: 0.72rem;
    font-weight: 900;
  }

  strong {
    color: var(--habit-text);
    font-size: 1.05rem;
    font-weight: 950;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  &:first-child strong {
    color: var(--item-color);
    font-size: 1.35rem;
  }

  @media (max-width: 980px) {
    &:nth-child(2) {
      border-right: 0;
    }
  }

  @media (max-width: 520px) {
    min-height: 62px;
    border-right: 0;
    border-bottom: 1px solid var(--habit-line);

    &:last-child {
      border-bottom: 0;
    }
  }
`;

const ItemMetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
`;

const ItemMetricCard = styled.div<{ $color: string }>`
  min-width: 0;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 34%, transparent);
  border-radius: 8px;
  padding: 11px;
  display: grid;
  gap: 7px;
  background:
    linear-gradient(135deg, color-mix(in srgb, ${(props) => props.$color} 12%, transparent), transparent 58%),
    rgba(255, 255, 255, 0.032);

  strong {
    color: var(--habit-text);
    font-size: 0.9rem;
    font-weight: 950;
  }
`;

const MetricInlineList = styled.div`
  margin-top: 7px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const MetricInlinePill = styled.span<{ $color: string }>`
  min-height: 22px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 34%, transparent);
  border-radius: 999px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  color: ${(props) => props.$color};
  background: color-mix(in srgb, ${(props) => props.$color} 10%, transparent);
  font-size: 0.68rem;
  font-weight: 900;
`;

const OverGoalBadge = styled.span<{ $color: string }>`
  width: fit-content;
  min-height: 22px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 42%, transparent);
  border-radius: 999px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  color: ${(props) => props.$color};
  background: color-mix(in srgb, ${(props) => props.$color} 13%, transparent);
  font-size: 0.68rem;
  font-weight: 950;
`;

const MetricCardTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--habit-muted);
  font-size: 0.72rem;
  font-weight: 900;
`;

const MetricDot = styled.span<{ $color: string }>`
  width: 9px;
  height: 9px;
  border-radius: 999px;
  flex: 0 0 auto;
  background: ${(props) => props.$color};
  box-shadow: 0 0 0 4px color-mix(in srgb, ${(props) => props.$color} 16%, transparent);
`;

const ItemStatsContentGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
  gap: 12px;
  align-items: start;

  @media (max-width: 1060px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ItemChartBox = styled(ChartBox)`
  height: 230px;

  @media (max-width: 720px) {
    height: 210px;
  }
`;

const CalculationPanel = styled.div`
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 11px 12px;
  display: grid;
  gap: 7px;
  color: var(--habit-muted);
  background: rgba(7, 10, 15, 0.22);
  font-size: 0.72rem;
  font-weight: 850;
  line-height: 1.5;

  strong {
    color: var(--habit-text);
  }
`;

const TableDisclosure = styled.details`
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(7, 10, 15, 0.18);

  summary {
    min-height: 36px;
    padding: 0 11px;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--habit-muted);
    font-size: 0.72rem;
    font-weight: 950;
  }
`;

const DataTableWrap = styled.div`
  max-height: 240px;
  overflow: auto;
`;

const DataTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;

  th,
  td {
    border-top: 1px solid var(--habit-line);
    padding: 8px;
    text-align: left;
    white-space: nowrap;
  }

  th {
    color: var(--habit-muted);
    font-weight: 950;
    background: rgba(255, 255, 255, 0.035);
  }

  td {
    color: var(--habit-text);
    font-weight: 800;
  }
`;

const ScreenReaderOnly = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const ItemRecordList = styled.div`
  max-height: 720px;
  overflow-y: auto;
  display: grid;
  gap: 7px;
`;

const ItemRecordRow = styled.div`
  min-height: 58px;
  border: 1px solid var(--habit-line);
  border-left: 3px solid var(--item-color);
  border-radius: 8px;
  padding: 9px 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  background: rgba(255, 255, 255, 0.032);
  cursor: pointer;

  & > div {
    min-width: 0;
  }

  strong {
    display: block;
    color: var(--habit-text);
    font-size: 0.82rem;
    font-weight: 950;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  @media (max-width: 520px) {
    grid-template-columns: auto minmax(0, 1fr);

    ${ScoreColumn} {
      grid-column: 2;
      justify-items: start;
    }
  }
`;

const RecordDateBadge = styled.span`
  min-width: 58px;
  min-height: 32px;
  border: 1px solid color-mix(in srgb, var(--item-color) 42%, transparent);
  border-radius: 8px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--item-color);
  background: color-mix(in srgb, var(--item-color) 12%, transparent);
  font-size: 0.74rem;
  font-weight: 950;
  white-space: nowrap;
`;

const ItemRecordEmpty = styled.div`
  min-height: 190px;
  border: 1px dashed var(--habit-line);
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--habit-muted);
  background: rgba(255, 255, 255, 0.025);
  font-size: 0.82rem;
  font-weight: 900;
  text-align: center;
`;

const ManualShell = styled.section`
  display: grid;
  gap: 14px;
`;

const ManualHero = styled.section`
  min-height: 360px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 22px;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
  gap: 22px;
  align-items: center;
  background:
    linear-gradient(135deg, rgba(66, 211, 146, 0.12), transparent 42%),
    linear-gradient(315deg, rgba(99, 179, 255, 0.14), transparent 44%),
    rgba(15, 23, 33, 0.95);
  box-shadow: 0 22px 55px rgba(0, 0, 0, 0.28);

  @media (max-width: 980px) {
    grid-template-columns: minmax(0, 1fr);
    min-height: auto;
  }

  @media (max-width: 720px) {
    padding: 12px;
    gap: 12px;
  }
`;

const ManualHeroCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 14px;

  h2 {
    margin: 0;
    color: var(--habit-text);
    font-size: clamp(1.7rem, 2.45vw, 2.72rem);
    line-height: 1.12;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    margin: 0;
    max-width: 720px;
    color: var(--habit-muted);
    font-size: 0.98rem;
    line-height: 1.65;
    word-break: keep-all;
  }

  @media (max-width: 720px) {
    gap: 10px;

    h2 {
      font-size: 1.5rem;
    }

    p {
      font-size: 0.84rem;
    }
  }
`;

const ManualQuickNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  a {
    min-height: 34px;
    border: 1px solid var(--habit-line);
    border-radius: 999px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--habit-text);
    background: rgba(255, 255, 255, 0.045);
    text-decoration: none;
    font-size: 0.74rem;
    font-weight: 900;
  }

  a:hover {
    border-color: var(--habit-line-strong);
    background: rgba(255, 255, 255, 0.075);
  }
`;

const ManualHeroStats = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ManualHeroStat = styled.div<{ $color: string }>`
  min-height: 78px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 30%, var(--habit-line));
  border-radius: 8px;
  padding: 11px;
  display: grid;
  align-content: space-between;
  gap: 8px;
  background: color-mix(in srgb, ${(props) => props.$color} 10%, rgba(255, 255, 255, 0.035));

  span {
    color: var(--habit-muted);
    font-size: 0.72rem;
    font-weight: 900;
  }

  strong {
    color: ${(props) => props.$color};
    font-size: 1.35rem;
    font-weight: 950;
    line-height: 1;
  }
`;

const ManualVisualFrame = styled.div`
  min-width: 0;
  border: 1px solid rgba(189, 203, 220, 0.2);
  border-radius: 8px;
  padding: 14px;
  display: grid;
  gap: 12px;
  background:
    linear-gradient(180deg, rgba(238, 245, 240, 0.08), transparent),
    rgba(7, 10, 15, 0.46);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 18px 38px rgba(0, 0, 0, 0.26);
`;

const ManualMockToolbar = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;

  span {
    min-height: 28px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #07100c;
    background: var(--habit-green);
    font-size: 0.68rem;
    font-weight: 950;
  }

  span:not(:first-child) {
    color: var(--habit-muted);
    background: rgba(255, 255, 255, 0.065);
  }
`;

const ManualMockLayout = styled.div`
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 10px;

  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ManualMockSide = styled.div`
  display: grid;
  gap: 6px;
`;

const ManualMockSideRow = styled.div<{ $color: string; $active?: boolean }>`
  min-height: 34px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} ${(props) => (props.$active ? 48 : 18)}%, var(--habit-line));
  border-radius: 7px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: ${(props) => (props.$active ? 'var(--habit-text)' : 'var(--habit-muted)')};
  background: color-mix(in srgb, ${(props) => props.$color} ${(props) => (props.$active ? 16 : 7)}%, transparent);
  font-size: 0.68rem;
  font-weight: 900;
`;

const ManualMockMain = styled.div`
  min-width: 0;
  display: grid;
  gap: 8px;
`;

const ManualMockDateRail = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;

  span {
    min-height: 48px;
    border: 1px solid rgba(189, 203, 220, 0.13);
    border-radius: 7px;
    padding: 6px;
    display: grid;
    align-content: center;
    color: var(--habit-muted);
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.62rem;
    font-weight: 900;
  }

  span:nth-child(3) {
    border-color: rgba(66, 211, 146, 0.62);
    color: var(--habit-text);
    background: rgba(66, 211, 146, 0.12);
  }
`;

const ManualMockCardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;

  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ManualMockCard = styled.div<{ $color: string }>`
  min-height: 86px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 25%, var(--habit-line));
  border-radius: 8px;
  padding: 10px;
  display: grid;
  gap: 8px;
  background: linear-gradient(180deg, color-mix(in srgb, ${(props) => props.$color} 9%, transparent), rgba(255, 255, 255, 0.03));

  strong {
    color: var(--habit-text);
    font-size: 0.78rem;
    font-weight: 950;
  }
`;

const ManualMockProgress = styled.div<{ $percent: number; $color: string }>`
  height: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;

  &::before {
    content: '';
    display: block;
    width: ${(props) => props.$percent}%;
    height: 100%;
    border-radius: inherit;
    background: ${(props) => props.$color};
  }
`;

const ManualSection = styled.section`
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 18px;
  display: grid;
  gap: 16px;
  background:
    linear-gradient(180deg, rgba(17, 25, 36, 0.9), rgba(9, 14, 21, 0.95)),
    var(--habit-panel);

  @media (max-width: 720px) {
    padding: 10px;
    gap: 10px;
  }
`;

const ManualSectionHeader = styled.div`
  max-width: 940px;
  display: grid;
  gap: 7px;

  h3 {
    margin: 0;
    color: var(--habit-text);
    font-size: 1.22rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: var(--habit-muted);
    font-size: 0.86rem;
    line-height: 1.6;
  }
`;

const ManualPill = styled.span<{ $color?: string }>`
  width: fit-content;
  min-height: 28px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color ?? '#42d392'} 34%, transparent);
  border-radius: 999px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${(props) => props.$color ?? '#8af0bd'};
  background: color-mix(in srgb, ${(props) => props.$color ?? '#42d392'} 10%, transparent);
  font-size: 0.7rem;
  font-weight: 950;
`;

const ManualGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
`;

const ManualGuideCard = styled.article<{ $color?: string }>`
  min-width: 0;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color ?? '#42d392'} 24%, var(--habit-line));
  border-radius: 8px;
  padding: 13px;
  display: grid;
  gap: 9px;
  background:
    linear-gradient(135deg, color-mix(in srgb, ${(props) => props.$color ?? '#42d392'} 8%, transparent), transparent 60%),
    rgba(255, 255, 255, 0.032);

  svg {
    color: ${(props) => props.$color ?? '#42d392'};
  }

  h4 {
    margin: 0;
    color: var(--habit-text);
    font-size: 0.94rem;
    font-weight: 950;
    line-height: 1.32;
  }

  p {
    margin: 0;
    color: var(--habit-muted);
    font-size: 0.78rem;
    line-height: 1.55;
  }

  dl {
    margin: 0;
    display: grid;
    gap: 7px;
  }

  div {
    min-width: 0;
  }

  dt {
    color: var(--habit-text);
    font-size: 0.72rem;
    font-weight: 950;
  }

  dd {
    margin: 2px 0 0;
    color: var(--habit-muted);
    font-size: 0.74rem;
    line-height: 1.5;
  }

  ul {
    margin: 0;
    padding-left: 17px;
    display: grid;
    gap: 5px;
    color: var(--habit-muted);
    font-size: 0.76rem;
    line-height: 1.5;
  }

  li::marker {
    color: ${(props) => props.$color ?? '#42d392'};
  }
`;

const ManualStepList = styled.ol`
  margin: 0;
  padding: 0;
  display: grid;
  gap: 9px;
  list-style: none;
  counter-reset: manual-step;
`;

const ManualStepItem = styled.li<{ $color?: string }>`
  min-height: 72px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 12px 12px 12px 52px;
  display: grid;
  gap: 4px;
  position: relative;
  background: rgba(255, 255, 255, 0.032);
  counter-increment: manual-step;

  &::before {
    content: counter(manual-step);
    position: absolute;
    left: 12px;
    top: 12px;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: #07100c;
    background: ${(props) => props.$color ?? 'var(--habit-green)'};
    font-size: 0.82rem;
    font-weight: 950;
  }

  strong {
    color: var(--habit-text);
    font-size: 0.86rem;
    font-weight: 950;
  }

  span {
    color: var(--habit-muted);
    font-size: 0.78rem;
    line-height: 1.5;
  }
`;

const ManualSplit = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(320px, 1.1fr);
  gap: 14px;

  @media (max-width: 960px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ManualDetailList = styled.div`
  display: grid;
  gap: 8px;
`;

const ManualDetailRow = styled.div<{ $color?: string }>`
  border-left: 3px solid ${(props) => props.$color ?? 'var(--habit-green)'};
  border-radius: 7px;
  padding: 10px 12px;
  display: grid;
  gap: 4px;
  background: rgba(255, 255, 255, 0.03);

  strong {
    color: var(--habit-text);
    font-size: 0.84rem;
    font-weight: 950;
  }

  span {
    color: var(--habit-muted);
    font-size: 0.76rem;
    line-height: 1.5;
  }
`;

const ManualChartPreview = styled.div`
  min-height: 260px;
  border: 1px solid var(--habit-line);
  border-radius: 8px;
  padding: 13px;
  display: grid;
  align-content: end;
  gap: 11px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 42px),
    rgba(255, 255, 255, 0.03);
`;

const ManualChartBars = styled.div`
  min-height: 160px;
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 7px;
  align-items: end;
`;

const ManualChartBar = styled.span<{ $height: number; $color: string }>`
  min-height: ${(props) => props.$height}%;
  border-radius: 8px 8px 3px 3px;
  background: linear-gradient(180deg, ${(props) => props.$color}, color-mix(in srgb, ${(props) => props.$color} 35%, transparent));
  box-shadow: 0 0 18px color-mix(in srgb, ${(props) => props.$color} 22%, transparent);
`;

const ManualFormula = styled.div`
  border: 1px solid rgba(248, 198, 78, 0.28);
  border-radius: 8px;
  padding: 12px;
  display: grid;
  gap: 8px;
  color: #ffe9a6;
  background: rgba(248, 198, 78, 0.08);
  font-size: 0.8rem;
  font-weight: 900;
  line-height: 1.55;

  small {
    color: var(--habit-muted);
    font-size: 0.74rem;
    font-weight: 800;
  }
`;

const ManualInlineActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const ManualProcessMap = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 920px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ManualProcessNode = styled.div<{ $color: string }>`
  min-height: 128px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$color} 30%, var(--habit-line));
  border-radius: 8px;
  padding: 13px;
  display: grid;
  align-content: space-between;
  gap: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, ${(props) => props.$color} 10%, transparent), transparent 70%),
    rgba(255, 255, 255, 0.032);

  span {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: #07100c;
    background: ${(props) => props.$color};
    font-weight: 950;
  }

  strong {
    color: var(--habit-text);
    font-size: 0.9rem;
    font-weight: 950;
  }

  p {
    margin: 0;
    color: var(--habit-muted);
    font-size: 0.76rem;
    line-height: 1.5;
  }
`;

const ManualSpecGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 10px;
`;

const ManualChecklist = styled.div`
  border: 1px solid rgba(66, 211, 146, 0.24);
  border-radius: 8px;
  padding: 13px;
  display: grid;
  gap: 9px;
  background: rgba(66, 211, 146, 0.055);

  strong {
    color: var(--habit-text);
    font-size: 0.9rem;
    font-weight: 950;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 6px;
    color: var(--habit-muted);
    font-size: 0.78rem;
    line-height: 1.55;
  }

  li::marker {
    color: var(--habit-green);
  }
`;

const tooltipStyle = {
  background: '#101821',
  border: '1px solid rgba(189, 203, 220, 0.2)',
  borderRadius: 8,
  color: '#eef5f0',
} as const;

export function HabitTrackerApp({ initialView = 'daily' }: HabitTrackerAppProps) {
  const {
    currentUser,
    loading: authLoading,
    loginWithGoogle,
    isConfigured,
  } = useAuth();
  const [workspace, setWorkspace] = useState<HabitWorkspace>(() => createInitialWorkspace());
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [dailyRecordLayout, setDailyRecordLayout] = useState<DailyRecordLayout>('simple');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('weekly');
  const [selectedStatsHabitId, setSelectedStatsHabitId] = useState('');
  const [itemStatsChartMode, setItemStatsChartMode] = useState<ItemStatsChartMode>('progress');
  const [selectedStatsMetricId, setSelectedStatsMetricId] = useState('');
  const [statsUrlReady, setStatsUrlReady] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [manageSection, setManageSection] = useState<ManageSection>('habits');
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>({ name: '', color: CATEGORY_COLORS[0], order: 1 });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [habitDraft, setHabitDraft] = useState<HabitDraft>(() => createHabitDraft());
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [showAdvancedHabitSettings, setShowAdvancedHabitSettings] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedLayout = window.localStorage.getItem(DAILY_RECORD_LAYOUT_STORAGE_KEY);
      if (isDailyRecordLayoutValue(storedLayout)) {
        setDailyRecordLayout(storedLayout);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const orderedCategories = useMemo(() => sortCategoriesByOrder(workspace.categories), [workspace.categories]);
  const orderedHabits = useMemo(() => sortHabitsByOrder(workspace.habits, workspace.categories), [workspace.categories, workspace.habits]);

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser) {
      setWorkspace(createInitialWorkspace());
      setHasLoaded(true);
      return;
    }

    let didCancel = false;
    setHasLoaded(false);

    const bootstrap = async () => {
      try {
        await ensureFirestorePersistence();
        if (didCancel) return;

        return onSnapshot(
          createWorkspaceDocRef(currentUser.uid),
          (snapshot) => {
            const nextWorkspace = snapshot.exists()
              ? normalizeWorkspace(snapshot.data())
              : createInitialWorkspace();
            setWorkspace(nextWorkspace);
            setHasLoaded(true);
          },
          (error) => {
            console.error('Failed to subscribe habit tracker workspace:', error);
            toast.error('습관 데이터를 불러오지 못했습니다.');
            setHasLoaded(true);
          },
        );
      } catch (error) {
        console.error('Failed to initialize habit tracker workspace:', error);
        toast.error('습관 데이터베이스 연결에 실패했습니다.');
        setHasLoaded(true);
        return undefined;
      }
    };

    let unsubscribe: (() => void) | undefined;
    bootstrap().then((nextUnsubscribe) => {
      if (didCancel) {
        nextUnsubscribe?.();
        return;
      }

      unsubscribe = nextUnsubscribe;
    });

    return () => {
      didCancel = true;
      unsubscribe?.();
    };
  }, [authLoading, currentUser]);

  useEffect(() => {
    if (editingHabitId) return;
    if (habitDraft.categoryId) return;
    if (habitDraft.suggestedCategoryName) return;

    const fallbackCategoryId = selectedCategoryId !== 'all'
      ? selectedCategoryId
      : orderedCategories[0]?.id ?? '';

    if (fallbackCategoryId) {
      setHabitDraft((prev) => ({ ...prev, categoryId: fallbackCategoryId }));
    }
  }, [editingHabitId, habitDraft.categoryId, habitDraft.suggestedCategoryName, orderedCategories, selectedCategoryId]);

  const persistWorkspace = useCallback(
    async (nextWorkspace: HabitWorkspace, message = '변경사항이 데이터베이스에 저장되었습니다.', toastId = 'habit-workspace-save') => {
      if (!currentUser) {
        toast.error('로그인 후 습관 데이터를 저장할 수 있습니다.');
        return false;
      }

      const safeWorkspace = sanitizeWorkspaceForFirestore(nextWorkspace);
      setWorkspace(safeWorkspace);
      setIsSaving(true);

      try {
        await ensureFirestorePersistence();
        await setDoc(
          createWorkspaceDocRef(currentUser.uid),
          {
            ...safeWorkspace,
            version: 1,
            userId: currentUser.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        toast.success(message, { id: toastId });
        return true;
      } catch (error) {
        console.error('Failed to save habit tracker workspace:', error);
        toast.error('데이터베이스 저장에 실패했습니다.', { id: toastId });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser],
  );

  const habitCountByCategory = useMemo(() => {
    const counts = orderedCategories.reduce<Record<string, number>>((acc, category) => {
      acc[category.id] = 0;
      return acc;
    }, {});

    for (const habit of orderedHabits) {
      counts[habit.categoryId] = (counts[habit.categoryId] ?? 0) + 1;
    }

    return counts;
  }, [orderedCategories, orderedHabits]);

  const recordCountByHabit = useMemo(() => {
    const counts = orderedHabits.reduce<Record<string, number>>((acc, habit) => {
      acc[habit.id] = 0;
      return acc;
    }, {});

    for (const dailyRecords of Object.values(workspace.records)) {
      for (const habitId of Object.keys(dailyRecords)) {
        if (habitId in counts) counts[habitId] += 1;
      }
    }

    return counts;
  }, [orderedHabits, workspace.records]);

  const activeCategory = useMemo(
    () => orderedCategories.find((category) => category.id === selectedCategoryId) ?? null,
    [orderedCategories, selectedCategoryId],
  );
  const categoryById = useMemo(() => new Map(orderedCategories.map((category) => [category.id, category])), [orderedCategories]);
  const categoryDisplayOrderById = useMemo(
    () => new Map(orderedCategories.map((category, index) => [category.id, index + 1])),
    [orderedCategories],
  );
  const habitDisplayOrderById = useMemo(() => {
    const displayOrderById = new Map<string, { order: number; total: number }>();
    const habitsByCategoryId = new Map<string, HabitItem[]>();

    for (const habit of orderedHabits) {
      const habits = habitsByCategoryId.get(habit.categoryId) ?? [];
      habits.push(habit);
      habitsByCategoryId.set(habit.categoryId, habits);
    }

    for (const habits of habitsByCategoryId.values()) {
      habits.forEach((habit, index) => {
        displayOrderById.set(habit.id, { order: index + 1, total: habits.length });
      });
    }

    return displayOrderById;
  }, [orderedHabits]);

  const visibleHabits = useMemo(() => {
    if (selectedCategoryId === 'all') return orderedHabits;
    return orderedHabits.filter((habit) => habit.categoryId === selectedCategoryId);
  }, [orderedHabits, selectedCategoryId]);
  const recordModeOptions = SELECTABLE_RECORD_MODES;

  const selectedDayStats = useMemo(
    () => calculateDayStats(workspace, selectedDate, visibleHabits),
    [selectedDate, visibleHabits, workspace],
  );

  const statsBuckets = useMemo(() => createStatsBuckets(workspace, selectedDate, statsPeriod), [selectedDate, statsPeriod, workspace]);
  const activeStatsBucket = useMemo(() => statsBuckets[statsBuckets.length - 1], [statsBuckets]);
  const activeStatsDateKeys = useMemo(() => activeStatsBucket?.dateKeys ?? [], [activeStatsBucket]);
  const activeStats = useMemo(
    () => activeStatsBucket?.stats ?? { total: 0, touched: 0, completed: 0, percent: 0 },
    [activeStatsBucket],
  );
  const statsRangeLabel = useMemo(() => formatStatsRange(statsPeriod, selectedDate), [selectedDate, statsPeriod]);
  const statsPeriodLabel = statsPeriod === 'weekly' ? '주별' : '월별';
  const statsPeriodUnitLabel = statsPeriod === 'weekly' ? '주간' : '월간';
  const rangeKeys = useMemo(
    () => (activeStatsDateKeys.length > 0 ? activeStatsDateKeys : getRangeDateKeys(selectedDate, 7)),
    [activeStatsDateKeys, selectedDate],
  );
  const previousRangeKeys = useMemo(() => getPreviousDateKeys(rangeKeys), [rangeKeys]);
  const activeRecordDays = useMemo(() => {
    return activeStatsDateKeys.filter((dateKey) => calculateDayStats(workspace, dateKey).touched > 0).length;
  }, [activeStatsDateKeys, workspace]);
  const weeklyDayData = useMemo(() => {
    return activeStatsDateKeys.slice(0, 7).map((dateKey, index) => {
      const date = parseDateKey(dateKey);
      return {
        dateKey,
        dayLabel: WEEKDAY_LABELS[index] ?? DATE_LABELS[date.getDay()],
        dateLabel: formatMonthDay(dateKey),
        weekendTone: getWeekendTone(date),
        stats: calculateDayStats(workspace, dateKey),
      };
    });
  }, [activeStatsDateKeys, workspace]);

  const bestStreak = useMemo(() => {
    return orderedHabits.reduce(
      (max, habit) => Math.max(max, calculateStreak(habit, workspace.records, selectedDate)),
      0,
    );
  }, [orderedHabits, selectedDate, workspace.records]);

  const selectedDateObject = useMemo(() => parseDateKey(selectedDate), [selectedDate]);
  const selectedMonthLabel = useMemo(
    () => `${selectedDateObject.getFullYear()}년 ${selectedDateObject.getMonth() + 1}월`,
    [selectedDateObject],
  );
  const dateRail = useMemo(() => getRangeDateKeys(selectedDate, 9).reverse(), [selectedDate]);
  const simpleDateKeys = useMemo(() => getRangeDateKeys(selectedDate, 7).reverse(), [selectedDate]);
  const simpleSelectedDateIndex = useMemo(() => simpleDateKeys.indexOf(selectedDate), [selectedDate, simpleDateKeys]);

  const completionChartData = useMemo(() => {
    return statsBuckets.map((bucket) => ({
      date: bucket.label,
      period: bucket.caption,
      completion: bucket.stats.percent,
      records: bucket.stats.touched,
    }));
  }, [statsBuckets]);
  const completionAxisMax = useMemo(
    () => getPercentAxisMax(completionChartData.map((point) => point.completion)),
    [completionChartData],
  );

  const categoryChartData = useMemo(() => {
    return orderedCategories.map((category) => {
      const categoryHabits = orderedHabits.filter((habit) => habit.categoryId === category.id);
      const stats = categoryHabits.length > 0
        ? calculateRangeStats(workspace, rangeKeys, categoryHabits)
        : { total: 0, touched: 0, completed: 0, percent: 0 };
      return {
        id: category.id,
        name: category.name,
        value: stats.percent,
        records: stats.touched,
        completed: stats.completed,
        total: stats.total,
        habitCount: categoryHabits.length,
        color: category.color,
      };
    });
  }, [orderedCategories, orderedHabits, rangeKeys, workspace]);

  const habitRankData = useMemo(() => {
    return orderedHabits
      .map((habit) => {
        const stats = calculateRangeStats(workspace, rangeKeys, [habit]);
        return {
          habit,
          percent: stats.percent,
          records: stats.touched,
          completed: stats.completed,
          total: stats.total,
          metricText: getHabitAggregateLabel(habit, workspace, rangeKeys),
          streak: calculateStreak(habit, workspace.records, selectedDate),
        };
      })
      .sort((a, b) => b.percent - a.percent || b.streak - a.streak);
  }, [orderedHabits, rangeKeys, selectedDate, workspace]);

  const selectedStatsHabit = useMemo(() => {
    if (orderedHabits.length === 0) return null;
    return orderedHabits.find((habit) => habit.id === selectedStatsHabitId) ?? orderedHabits[0];
  }, [orderedHabits, selectedStatsHabitId]);

  const selectedStatsHabitCategory = selectedStatsHabit ? categoryById.get(selectedStatsHabit.categoryId) ?? null : null;
  const selectedStatsHabitColor = selectedStatsHabitCategory?.color ?? '#42d392';
  const selectedHabitUsesTrendValue = selectedStatsHabit ? isTrendGoalMode(selectedStatsHabit.mode) : false;
  const selectedHabitMetricDefinitions = useMemo(
    () => (selectedStatsHabit ? getTrendMetricDefinitions(selectedStatsHabit) : []),
    [selectedStatsHabit],
  );
  const selectedHabitHasMetricBreakdown = selectedHabitMetricDefinitions.length > 1;
  const selectedValueMetric = useMemo(() => {
    if (!selectedHabitHasMetricBreakdown) return null;
    return selectedHabitMetricDefinitions.find((metric) => metric.id === selectedStatsMetricId)
      ?? selectedHabitMetricDefinitions[0]
      ?? null;
  }, [selectedHabitHasMetricBreakdown, selectedHabitMetricDefinitions, selectedStatsMetricId]);
  const selectedHabitStats = useMemo(
    () => (selectedStatsHabit ? calculateRangeStats(workspace, rangeKeys, [selectedStatsHabit]) : EMPTY_STATS_SUMMARY),
    [rangeKeys, selectedStatsHabit, workspace],
  );
  const selectedHabitMetricText = useMemo(
    () => (selectedStatsHabit ? getHabitAggregateLabel(selectedStatsHabit, workspace, rangeKeys) : '기록 없음'),
    [rangeKeys, selectedStatsHabit, workspace],
  );
  const selectedHabitStreak = useMemo(
    () => (selectedStatsHabit ? calculateStreak(selectedStatsHabit, workspace.records, selectedDate) : 0),
    [selectedDate, selectedStatsHabit, workspace.records],
  );
  const selectedHabitTrendStats = useMemo(
    () => (selectedStatsHabit && isTrendGoalMode(selectedStatsHabit.mode)
      ? calculateHabitTrendStats(selectedStatsHabit, workspace, rangeKeys, previousRangeKeys)
      : null),
    [previousRangeKeys, rangeKeys, selectedStatsHabit, workspace],
  );
  const selectedHabitMetricSummaries = useMemo(
    () => (selectedStatsHabit
      ? calculateHabitMetricSummaries(selectedStatsHabit, workspace, rangeKeys, previousRangeKeys)
      : []),
    [previousRangeKeys, rangeKeys, selectedStatsHabit, workspace],
  );
  const selectedScoredMetricSummaries = useMemo(
    () => selectedHabitMetricSummaries.filter((metric) => metric.contributesToScore !== false),
    [selectedHabitMetricSummaries],
  );
  const selectedMetricProgressAverage = useMemo(() => {
    if (selectedScoredMetricSummaries.length === 0) return undefined;
    const total = selectedScoredMetricSummaries.reduce((sum, metric) => sum + metric.progress, 0);
    return Math.round(total / selectedScoredMetricSummaries.length);
  }, [selectedScoredMetricSummaries]);
  const selectedMetricComparableCount = useMemo(() => {
    return selectedScoredMetricSummaries.filter((metric) => metric.average !== undefined && metric.previousAverage !== undefined).length;
  }, [selectedScoredMetricSummaries]);
  const selectedMetricImprovedCount = useMemo(() => {
    return selectedScoredMetricSummaries.filter((metric) => (
      metric.average !== undefined &&
      metric.previousAverage !== undefined &&
      metric.progress > metric.previousProgress
    )).length;
  }, [selectedScoredMetricSummaries]);
  const selectedHabitRecordData = useMemo<HabitRecordPoint[]>(() => {
    if (!selectedStatsHabit) return [];

    const points = rangeKeys.map((dateKey) => {
      const record = workspace.records[dateKey]?.[selectedStatsHabit.id];
      const value = getTrendRecordValue(selectedStatsHabit, record);
      const score = Math.round(getRecordScore(selectedStatsHabit, record) * 100);
      const metrics = selectedHabitMetricDefinitions.reduce<Record<string, HabitRecordMetricPoint>>((acc, metric) => {
        const metricValue = getTrendMetricValue(selectedStatsHabit, record, metric.id);
        acc[metric.id] = {
          value: metricValue,
          progress: getMetricProgressPercent(selectedStatsHabit, metric, metricValue),
        };
        return acc;
      }, {});

      const point: HabitRecordPoint = {
        dateKey,
        dateLabel: formatMonthDay(dateKey),
        score,
        value,
        touched: isRecordTouched(selectedStatsHabit, record),
        completed: score >= 100,
        metricText: getRecordMetricLabel(selectedStatsHabit, record),
        metrics,
      };

      return point;
    });

    return points.map((point, index) => {
      const movingValues = points
        .slice(Math.max(index - 6, 0), index + 1)
        .map((item) => item.value)
        .filter((value): value is number => value !== undefined);
      const metrics = selectedHabitMetricDefinitions.reduce<Record<string, HabitRecordMetricPoint>>((acc, metric) => {
        const metricValues = points
          .slice(Math.max(index - 6, 0), index + 1)
          .map((item) => item.metrics[metric.id]?.value)
          .filter((value): value is number => value !== undefined);
        const currentMetric = point.metrics[metric.id] ?? { progress: 0 };

        acc[metric.id] = {
          ...currentMetric,
          movingAverage: metricValues.length > 0
            ? metricValues.reduce((sum, metricValue) => sum + metricValue, 0) / metricValues.length
            : undefined,
        };
        return acc;
      }, {});

      return {
        ...point,
        movingAverage: movingValues.length > 0
          ? movingValues.reduce((sum, value) => sum + value, 0) / movingValues.length
          : undefined,
        metrics,
      };
    });
  }, [rangeKeys, selectedHabitMetricDefinitions, selectedStatsHabit, workspace.records]);
  const selectedHabitChartData = useMemo<HabitChartPoint[]>(() => {
    return selectedHabitRecordData.map((point) => {
      const chartPoint: HabitChartPoint = { ...point };

      for (const [metricId, metricPoint] of Object.entries(point.metrics)) {
        chartPoint[`metric_${metricId}`] = metricPoint.value;
        chartPoint[`metricProgress_${metricId}`] = metricPoint.progress;
        chartPoint[`metricMovingAverage_${metricId}`] = metricPoint.movingAverage;
      }

      return chartPoint;
    });
  }, [selectedHabitRecordData]);
  const selectedHabitProgressAxisMax = useMemo(() => {
    if (selectedHabitHasMetricBreakdown) {
      return getPercentAxisMax(selectedHabitRecordData.flatMap((point) => (
        selectedHabitMetricDefinitions.map((metric) => point.metrics[metric.id]?.progress ?? 0)
      )));
    }

    return getPercentAxisMax(selectedHabitRecordData.map((point) => point.score));
  }, [selectedHabitHasMetricBreakdown, selectedHabitMetricDefinitions, selectedHabitRecordData]);
  const selectedHabitRecordRows = useMemo(
    () => selectedHabitRecordData.filter((point) => point.touched).reverse(),
    [selectedHabitRecordData],
  );
  const selectedHabitVisibleRecordRows = useMemo(
    () => selectedHabitRecordRows.slice(0, HISTORY_ROW_LIMIT),
    [selectedHabitRecordRows],
  );
  const selectedHabitBestScore = useMemo(
    () => selectedHabitRecordData.reduce((best, point) => Math.max(best, point.score), 0),
    [selectedHabitRecordData],
  );
  const selectedHabitOverGoalPercent = useMemo(() => {
    const progress = selectedHabitHasMetricBreakdown && selectedMetricProgressAverage !== undefined
      ? selectedMetricProgressAverage
      : selectedHabitTrendStats?.progress ?? selectedHabitStats.percent;
    return Math.max(progress - 100, 0);
  }, [selectedHabitHasMetricBreakdown, selectedHabitStats.percent, selectedHabitTrendStats, selectedMetricProgressAverage]);
  const selectedHabitBestOverGoalPoint = useMemo(
    () => selectedHabitRecordData.filter((point) => point.score > 100).sort((a, b) => b.score - a.score)[0],
    [selectedHabitRecordData],
  );
  const chartAccessibilitySummary = useMemo(() => {
    if (!selectedStatsHabit) return '선택된 항목이 없습니다.';
    const overGoalText = selectedHabitOverGoalPercent > 0 ? ` 목표를 ${selectedHabitOverGoalPercent}% 초과했습니다.` : '';
    return `${selectedStatsHabit.name}의 선택 기간 달성률은 ${selectedHabitHasMetricBreakdown && selectedMetricProgressAverage !== undefined ? selectedMetricProgressAverage : selectedHabitStats.percent}%입니다.${overGoalText}`;
  }, [selectedHabitHasMetricBreakdown, selectedHabitOverGoalPercent, selectedHabitStats.percent, selectedMetricProgressAverage, selectedStatsHabit]);
  const activeRecordModeCount = useMemo(() => new Set(orderedHabits.map((habit) => habit.mode)).size, [orderedHabits]);
  const storedRecordDayCount = useMemo(() => Object.keys(workspace.records).length, [workspace.records]);
  const storedRecordEntryCount = useMemo(
    () => Object.values(workspace.records).reduce((total, dailyRecords) => total + Object.keys(dailyRecords).length, 0),
    [workspace.records],
  );
  const hasHabitRecords = storedRecordEntryCount > 0;
  const hasHabitTrackerData = orderedCategories.length > 0 || orderedHabits.length > 0 || storedRecordDayCount > 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initialView !== 'stats') {
      setStatsUrlReady(true);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const period = params.get('period');
    const habitId = params.get('habit');
    const chartMode = params.get('chart');
    const metricId = params.get('metric');

    if (isStatsPeriodValue(period)) setStatsPeriod(period);
    if (habitId) setSelectedStatsHabitId(habitId);
    if (isItemStatsChartModeValue(chartMode)) setItemStatsChartMode(chartMode);
    if (metricId) setSelectedStatsMetricId(metricId);
    setStatsUrlReady(true);
  }, [initialView]);

  useEffect(() => {
    if (!selectedHabitHasMetricBreakdown) {
      if (selectedStatsMetricId) setSelectedStatsMetricId('');
      return;
    }

    const fallbackMetricId = selectedHabitMetricDefinitions[0]?.id ?? '';
    const hasSelectedMetric = selectedHabitMetricDefinitions.some((metric) => metric.id === selectedStatsMetricId);
    if (!hasSelectedMetric && fallbackMetricId) {
      setSelectedStatsMetricId(fallbackMetricId);
    }
  }, [selectedHabitHasMetricBreakdown, selectedHabitMetricDefinitions, selectedStatsMetricId]);

  useEffect(() => {
    if (initialView !== 'stats' || !statsUrlReady || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    params.set('period', statsPeriod);
    params.set('chart', itemStatsChartMode);

    if (selectedStatsHabit?.id) {
      params.set('habit', selectedStatsHabit.id);
    } else {
      params.delete('habit');
    }

    if (selectedHabitHasMetricBreakdown && itemStatsChartMode === 'value' && selectedValueMetric?.id) {
      params.set('metric', selectedValueMetric.id);
    } else {
      params.delete('metric');
    }

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [
    itemStatsChartMode,
    selectedHabitHasMetricBreakdown,
    selectedStatsHabit,
    selectedValueMetric,
    statsPeriod,
    statsUrlReady,
    initialView,
  ]);

  const patchRecordForDate = useCallback(
    (dateKey: string, habitId: string, patch: Partial<HabitRecord>) => {
      setWorkspace((prev) => applyRecordPatch(prev, dateKey, habitId, patch));
    },
    [],
  );

  const saveRecordForDate = useCallback(
    (dateKey: string, habitId: string, patch: Partial<HabitRecord>) => {
      const nextWorkspace = applyRecordPatch(workspace, dateKey, habitId, patch);
      void persistWorkspace(nextWorkspace, '기록이 저장되었습니다.', 'habit-record-save');
    },
    [persistWorkspace, workspace],
  );
  const deleteRecordForDate = useCallback(
    (dateKey: string, habitId: string) => {
      const nextWorkspace = removeRecordFromWorkspace(workspace, dateKey, habitId);
      void persistWorkspace(nextWorkspace, '기록이 삭제되었습니다.', 'habit-record-delete');
    },
    [persistWorkspace, workspace],
  );
  const handleExportWorkspaceJson = useCallback(() => {
    const payload = JSON.stringify(sanitizeWorkspaceForFirestore(workspace), null, 2);
    downloadTextFile(`habit-tracker-backup-${selectedDate}.json`, payload, 'application/json;charset=utf-8');
  }, [selectedDate, workspace]);
  const handleExportSelectedHabitCsv = useCallback(() => {
    if (!selectedStatsHabit) return;

    const rows = [
      ['date', 'habit', 'category', 'mode', 'scorePercent', 'completed', 'summary', ...selectedHabitMetricDefinitions.map((metric) => `${metric.label}(${metric.unit})`)],
      ...selectedHabitRecordData.map((point) => [
        point.dateKey,
        selectedStatsHabit.name,
        selectedStatsHabitCategory?.name ?? '',
        selectedStatsHabit.mode,
        point.score,
        point.completed ? 'true' : 'false',
        point.metricText,
        ...selectedHabitMetricDefinitions.map((metric) => point.metrics[metric.id]?.value ?? ''),
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
    downloadTextFile(`habit-${selectedStatsHabit.name}-${statsPeriod}-${selectedDate}.csv`, csv, 'text/csv;charset=utf-8');
  }, [selectedDate, selectedHabitMetricDefinitions, selectedHabitRecordData, selectedStatsHabit, selectedStatsHabitCategory, statsPeriod]);

  const patchRecord = useCallback(
    (habitId: string, patch: Partial<HabitRecord>) => {
      patchRecordForDate(selectedDate, habitId, patch);
    },
    [patchRecordForDate, selectedDate],
  );

  const saveRecord = useCallback(
    (habitId: string, patch: Partial<HabitRecord>) => {
      saveRecordForDate(selectedDate, habitId, patch);
    },
    [saveRecordForDate, selectedDate],
  );

  const handleRecordInputBlur = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    const recordControl = event.currentTarget.closest('[data-record-control]');
    const nextTarget = event.relatedTarget;

    if (recordControl && nextTarget instanceof Node && recordControl.contains(nextTarget)) {
      return;
    }

    void persistWorkspace(workspace, '기록이 저장되었습니다.', 'habit-record-save');
  }, [persistWorkspace, workspace]);

  const handleRecordInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  }, []);

  const resetCategoryDraft = useCallback(() => {
    setEditingCategoryId(null);
    setCategoryDraft({ name: '', color: CATEGORY_COLORS[0], order: getNextCategoryOrder(workspace.categories) });
  }, [workspace.categories]);

  const scrollManageComposerIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      document.getElementById('habit-manage-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const handleStartEditCategory = useCallback((category: HabitCategory) => {
    setManageSection('categories');
    setSelectedCategoryId(category.id);
    setEditingCategoryId(category.id);
    setCategoryDraft({
      name: category.name,
      color: category.color,
      order: normalizeSortOrder(category.order, orderedCategories.findIndex((item) => item.id === category.id) + 1),
    });
    scrollManageComposerIntoView();
  }, [orderedCategories, scrollManageComposerIntoView]);

  const handleSubmitCategory = useCallback(async () => {
    const name = categoryDraft.name.trim();
    if (!name) {
      toast.error('카테고리 이름을 입력해주세요.');
      return;
    }
    const order = normalizeSortOrder(categoryDraft.order, getNextCategoryOrder(workspace.categories));

    if (editingCategoryId) {
      const target = workspace.categories.find((category) => category.id === editingCategoryId);
      if (!target) {
        toast.error('수정할 카테고리를 찾지 못했습니다.');
        resetCategoryDraft();
        return;
      }

      const nextWorkspace = {
        ...workspace,
        categories: workspace.categories.map((category) =>
          category.id === editingCategoryId ? { ...category, name, color: categoryDraft.color, order } : category,
        ),
      };
      const saved = await persistWorkspace(nextWorkspace, '카테고리가 수정되었습니다.', 'habit-category-save');
      if (saved) resetCategoryDraft();
      return;
    }

    const nextCategory: HabitCategory = {
      id: makeId('cat'),
      name,
      color: categoryDraft.color,
      order,
    };
    const nextWorkspace = {
      ...workspace,
      categories: [...workspace.categories, nextCategory],
    };
    const saved = await persistWorkspace(nextWorkspace, '카테고리가 추가되었습니다.', 'habit-category-save');

    if (saved) {
      setSelectedCategoryId(nextCategory.id);
      setHabitDraft((prev) => ({ ...prev, categoryId: nextCategory.id }));
      setCategoryDraft({ name: '', color: CATEGORY_COLORS[0], order: getNextCategoryOrder(nextWorkspace.categories) });
      setEditingCategoryId(null);
    }
  }, [categoryDraft, editingCategoryId, persistWorkspace, resetCategoryDraft, workspace]);

  const handleMoveCategory = useCallback(async (categoryId: string, direction: -1 | 1) => {
    const currentIndex = orderedCategories.findIndex((category) => category.id === categoryId);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedCategories.length) {
      return;
    }

    const reorderedCategories = [...orderedCategories];
    const [movedCategory] = reorderedCategories.splice(currentIndex, 1);
    reorderedCategories.splice(targetIndex, 0, movedCategory);

    const orderByCategoryId = new Map(reorderedCategories.map((category, index) => [category.id, index + 1]));
    const nextWorkspace = {
      ...workspace,
      categories: workspace.categories.map((category, index) => ({
        ...category,
        order: orderByCategoryId.get(category.id) ?? normalizeSortOrder(category.order, index + 1),
      })),
    };

    const saved = await persistWorkspace(nextWorkspace, '카테고리 순서가 변경되었습니다.', 'habit-category-order-save');
    if (!saved) return;

    if (editingCategoryId) {
      const editingCategory = nextWorkspace.categories.find((category) => category.id === editingCategoryId);
      if (editingCategory) {
        setCategoryDraft((prev) => ({
          ...prev,
          order: normalizeSortOrder(editingCategory.order, targetIndex + 1),
        }));
      }
    }
  }, [editingCategoryId, orderedCategories, persistWorkspace, workspace]);

  const handleDeleteCategory = useCallback(
    async (categoryId: string) => {
      const target = workspace.categories.find((category) => category.id === categoryId);
      if (!target) return;

      const habitIds = new Set(workspace.habits.filter((habit) => habit.categoryId === categoryId).map((habit) => habit.id));
      const confirmed = await openMutationNotice({
        title: '카테고리를 삭제할까요?',
        text: `'${target.name}' 카테고리와 연결된 항목 ${habitIds.size}개, 해당 기록이 함께 삭제됩니다.`,
        confirmButtonText: '삭제',
        icon: 'warning',
      });
      if (!confirmed) return;

      const nextWorkspace = {
        ...workspace,
        categories: workspace.categories.filter((category) => category.id !== categoryId),
        habits: workspace.habits.filter((habit) => !habitIds.has(habit.id)),
        records: Object.fromEntries(
          Object.entries(workspace.records).map(([dateKey, dailyRecords]) => [
            dateKey,
            Object.fromEntries(Object.entries(dailyRecords).filter(([habitId]) => !habitIds.has(habitId))),
          ]),
        ),
      };
      const saved = await persistWorkspace(nextWorkspace, '카테고리가 삭제되었습니다.', 'habit-category-save');

      if (saved) {
        if (editingCategoryId === categoryId) resetCategoryDraft();
        if (habitDraft.categoryId === categoryId) {
          setHabitDraft((prev) => ({ ...prev, categoryId: sortCategoriesByOrder(nextWorkspace.categories)[0]?.id ?? '' }));
        }
        setSelectedCategoryId('all');
      }
    },
    [editingCategoryId, habitDraft.categoryId, persistWorkspace, resetCategoryDraft, workspace],
  );

  const handleHabitModeChange = useCallback((mode: RecordMode) => {
    if (!isTrendGoalMode(mode)) {
      setShowAdvancedHabitSettings(false);
    }

    setHabitDraft((prev) => ({
      ...prev,
      mode,
      ...getModeDefaults(mode),
      goalDirection: normalizeGoalDirection(mode, prev.goalDirection),
      baseline: isTrendGoalMode(mode) ? prev.baseline : undefined,
      minTarget: isTrendGoalMode(mode) ? prev.minTarget : undefined,
      maxTarget: isTrendGoalMode(mode) ? prev.maxTarget : undefined,
      metricGoals: normalizeMetricGoals(mode, prev.metricGoals),
      options: isChoiceMode(mode)
        ? (prev.options.length > 0 ? prev.options : createDefaultChoiceOptions(mode))
        : [],
    }));
  }, []);

  const resetHabitDraft = useCallback(() => {
    setEditingHabitId(null);
    setShowAdvancedHabitSettings(false);
    const categoryId = selectedCategoryId !== 'all' ? selectedCategoryId : orderedCategories[0]?.id ?? '';
    setHabitDraft(createHabitDraft(categoryId, 'check', getNextHabitOrder(workspace.habits, categoryId)));
  }, [orderedCategories, selectedCategoryId, workspace.habits]);

  const handleStartEditHabit = useCallback((habit: HabitItem) => {
    const editableMode = SELECTABLE_RECORD_MODES.includes(habit.mode) ? habit.mode : 'multiChoice';
    const habitOptions = getHabitChoiceOptions(habit);
    const categoryHabits = orderedHabits.filter((item) => item.categoryId === habit.categoryId);
    const categoryHabitIndex = categoryHabits.findIndex((item) => item.id === habit.id);
    setManageSection('habits');
    setSelectedCategoryId(habit.categoryId);
    setEditingHabitId(habit.id);
    setShowAdvancedHabitSettings(Boolean(habit.metricGoals || habit.baseline !== undefined || habit.minTarget !== undefined || habit.maxTarget !== undefined));
    setHabitDraft({
      name: habit.name,
      categoryId: habit.categoryId,
      order: categoryHabitIndex >= 0 ? categoryHabitIndex + 1 : normalizeSortOrder(habit.order, 1),
      mode: editableMode,
      target: habit.target,
      unit: habit.unit,
      goalDirection: normalizeGoalDirection(editableMode, habit.goalDirection),
      baseline: habit.baseline,
      minTarget: habit.minTarget,
      maxTarget: habit.maxTarget,
      metricGoals: normalizeMetricGoals(editableMode, habit.metricGoals),
      secondaryTarget: habit.secondaryTarget,
      secondaryUnit: habit.secondaryUnit,
      tertiaryTarget: habit.tertiaryTarget,
      tertiaryUnit: habit.tertiaryUnit,
      options: isChoiceMode(editableMode)
        ? (habitOptions.length > 0 ? habitOptions : createDefaultChoiceOptions(editableMode))
        : [],
      suggestedCategoryName: undefined,
      suggestedCategoryColor: undefined,
    });
    scrollManageComposerIntoView();
  }, [orderedHabits, scrollManageComposerIntoView]);

  const handleSubmitHabit = useCallback(async () => {
    const name = habitDraft.name.trim();
    let nextCategories = workspace.categories;
    let categoryId = habitDraft.categoryId || activeCategory?.id || orderedCategories[0]?.id || '';

    if (categoryId && !workspace.categories.some((category) => category.id === categoryId)) {
      categoryId = '';
    }

    if (!categoryId) {
      const ensured = ensureHabitCategory(nextCategories, habitDraft.suggestedCategoryName, habitDraft.suggestedCategoryColor);
      nextCategories = ensured.categories;
      categoryId = ensured.categoryId;
    }

    if (!name) {
      toast.error('항목 이름을 입력해주세요.');
      return;
    }

    const choiceOptions = normalizeChoiceOptions(habitDraft.options);
    if (isChoiceMode(habitDraft.mode) && choiceOptions.length === 0) {
      toast.error('선택 항목을 1개 이상 입력해주세요.');
      return;
    }

    const defaults = MODE_META[habitDraft.mode];
    const goalDirection = normalizeGoalDirection(habitDraft.mode, habitDraft.goalDirection);
    const rawTarget = Number(habitDraft.target);
    const targetFloor = goalDirection === 'decrease' ? 0 : 1;
    const order = normalizeSortOrder(habitDraft.order, getNextHabitOrder(workspace.habits, categoryId));
    let nextHabit: HabitItem = {
      id: editingHabitId ?? makeId('habit'),
      categoryId,
      name,
      order,
      mode: habitDraft.mode,
      target: Number.isFinite(rawTarget) ? Math.max(rawTarget, targetFloor) : defaults.target,
      unit: habitDraft.unit.trim() || defaults.unit,
    };

    if (goalDirection) {
      nextHabit.goalDirection = goalDirection;

      if (Number.isFinite(habitDraft.baseline)) {
        nextHabit.baseline = Number(habitDraft.baseline);
      }

      if (goalDirection === 'maintain') {
        const rawMin = Number.isFinite(habitDraft.minTarget) ? Number(habitDraft.minTarget) : nextHabit.target;
        const rawMax = Number.isFinite(habitDraft.maxTarget) ? Number(habitDraft.maxTarget) : nextHabit.target;
        nextHabit.minTarget = Math.min(rawMin, rawMax);
        nextHabit.maxTarget = Math.max(rawMin, rawMax);
      }
    }

    const metricGoals = normalizeMetricGoals(habitDraft.mode, habitDraft.metricGoals);
    if (metricGoals) {
      nextHabit.metricGoals = metricGoals;
    }

    const sanitized = sanitizeHabitGoalsForSave(nextHabit);
    if (sanitized.warnings.length > 0) {
      const result = await Swal.fire({
        title: '목표값을 보정합니다',
        html: `<div style="text-align:left;display:grid;gap:8px;">${sanitized.warnings.slice(0, 6).map((warning) => `<p style="margin:0;color:#b8c4cf;font-size:13px;">${escapeHtml(warning)}</p>`).join('')}</div>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '보정 후 저장',
        cancelButtonText: '다시 수정',
        background: '#101821',
        color: '#eef5f0',
        confirmButtonColor: '#42d392',
        cancelButtonColor: '#596774',
      });

      if (!result.isConfirmed) return;
      nextHabit = sanitized.habit;
    }

    if (isChoiceMode(habitDraft.mode)) {
      nextHabit.options = choiceOptions;
    }

    if (defaults.secondaryTarget && defaults.secondaryUnit) {
      nextHabit.secondaryTarget = Math.max(Number(habitDraft.secondaryTarget) || defaults.secondaryTarget, 1);
      nextHabit.secondaryUnit = habitDraft.secondaryUnit?.trim() || defaults.secondaryUnit;
    }

    if (defaults.tertiaryTarget && defaults.tertiaryUnit) {
      nextHabit.tertiaryTarget = Math.max(Number(habitDraft.tertiaryTarget) || defaults.tertiaryTarget, 1);
      nextHabit.tertiaryUnit = habitDraft.tertiaryUnit?.trim() || defaults.tertiaryUnit;
    }

    if (editingHabitId) {
      const target = workspace.habits.find((habit) => habit.id === editingHabitId);
      if (!target) {
        toast.error('수정할 항목을 찾지 못했습니다.');
        resetHabitDraft();
        return;
      }

      const nextWorkspace = {
        ...workspace,
        categories: nextCategories,
        habits: workspace.habits.map((habit) => (habit.id === editingHabitId ? nextHabit : habit)),
      };
      const saved = await persistWorkspace(nextWorkspace, '항목이 수정되었습니다.', 'habit-item-save');
      if (saved) {
        setEditingHabitId(null);
        setShowAdvancedHabitSettings(false);
        setHabitDraft(createHabitDraft(categoryId, 'check', getNextHabitOrder(nextWorkspace.habits, categoryId)));
      }
      return;
    }

    const nextWorkspace = {
      ...workspace,
      categories: nextCategories,
      habits: [...workspace.habits, nextHabit],
    };
    const saved = await persistWorkspace(nextWorkspace, '항목이 추가되었습니다.', 'habit-item-save');
    if (saved) {
      setSelectedCategoryId(categoryId);
      setEditingHabitId(null);
      setShowAdvancedHabitSettings(false);
      setHabitDraft(createHabitDraft(categoryId, 'check', getNextHabitOrder(nextWorkspace.habits, categoryId)));
    }
  }, [activeCategory?.id, editingHabitId, habitDraft, orderedCategories, persistWorkspace, resetHabitDraft, workspace]);

  const handleMoveHabit = useCallback(async (habitId: string, direction: -1 | 1) => {
    const target = workspace.habits.find((habit) => habit.id === habitId);
    if (!target) return;

    const categoryHabits = orderedHabits.filter((habit) => habit.categoryId === target.categoryId);
    const currentIndex = categoryHabits.findIndex((habit) => habit.id === habitId);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= categoryHabits.length) {
      return;
    }

    const reorderedHabits = [...categoryHabits];
    const [movedHabit] = reorderedHabits.splice(currentIndex, 1);
    reorderedHabits.splice(targetIndex, 0, movedHabit);

    const orderByHabitId = new Map(reorderedHabits.map((habit, index) => [habit.id, index + 1]));
    const nextWorkspace = {
      ...workspace,
      habits: workspace.habits.map((habit, index) => (
        habit.categoryId === target.categoryId
          ? { ...habit, order: orderByHabitId.get(habit.id) ?? normalizeSortOrder(habit.order, index + 1) }
          : habit
      )),
    };

    const saved = await persistWorkspace(nextWorkspace, '항목 순서가 변경되었습니다.', 'habit-item-order-save');
    if (!saved || !editingHabitId) return;

    const editingHabit = nextWorkspace.habits.find((habit) => habit.id === editingHabitId);
    if (editingHabit?.categoryId === target.categoryId) {
      setHabitDraft((prev) => ({
        ...prev,
        order: normalizeSortOrder(editingHabit.order, prev.order),
      }));
    }
  }, [editingHabitId, orderedHabits, persistWorkspace, workspace]);

  const handleDeleteHabit = useCallback(async (habitId: string) => {
    const target = workspace.habits.find((habit) => habit.id === habitId);
    if (!target) return;

    const confirmed = await openMutationNotice({
      title: '항목을 삭제할까요?',
      text: `'${target.name}' 항목과 날짜별 기록이 함께 삭제됩니다.`,
      confirmButtonText: '삭제',
      icon: 'warning',
    });
    if (!confirmed) return;

    const nextWorkspace = {
      ...workspace,
      habits: workspace.habits.filter((habit) => habit.id !== habitId),
      records: Object.fromEntries(
        Object.entries(workspace.records).map(([dateKey, dailyRecords]) => {
          const remainingRecords = { ...dailyRecords };
          delete remainingRecords[habitId];
          return [dateKey, remainingRecords];
        }),
      ),
    };
    const saved = await persistWorkspace(nextWorkspace, '항목이 삭제되었습니다.', 'habit-item-save');
    if (saved && editingHabitId === habitId) resetHabitDraft();
  }, [editingHabitId, persistWorkspace, resetHabitDraft, workspace]);

  const shiftDate = useCallback(
    (amount: number) => {
      setSelectedDate((prev) => toDateKey(addDays(parseDateKey(prev), amount)));
    },
    [setSelectedDate],
  );

  const shiftMonth = useCallback(
    (amount: number) => {
      setSelectedDate((prev) => toDateKey(addCalendarMonths(parseDateKey(prev), amount)));
    },
    [setSelectedDate],
  );

  const handleDailyRecordLayoutChange = useCallback((layout: DailyRecordLayout) => {
    setDailyRecordLayout(layout);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DAILY_RECORD_LAYOUT_STORAGE_KEY, layout);
    }
  }, []);

  const handleDefaultDailyRecordLayoutChange = useCallback((layout: DailyRecordLayout) => {
    handleDailyRecordLayoutChange(layout);
    toast.success('기록 기본 방식이 저장되었습니다.', { id: 'habit-default-record-layout' });
  }, [handleDailyRecordLayoutChange]);

  const shiftStatsPeriod = useCallback(
    (amount: number) => {
      setSelectedDate((prev) => {
        const current = parseDateKey(prev);
        if (statsPeriod === 'weekly') return toDateKey(addDays(current, amount * 7));
        return toDateKey(addMonths(current, amount));
      });
    },
    [statsPeriod],
  );

  const addHabitDraftOption = useCallback(() => {
    setHabitDraft((prev) => ({
      ...prev,
      options: [
        ...(prev.options.length > 0 ? prev.options : createDefaultChoiceOptions(prev.mode)),
        createChoiceOption(`선택 항목 ${prev.options.length + 1}`),
      ],
    }));
  }, []);

  const updateHabitDraftOption = useCallback((optionId: string, label: string) => {
    setHabitDraft((prev) => ({
      ...prev,
      options: prev.options.map((option) => (option.id === optionId ? { ...option, label } : option)),
    }));
  }, []);

  const removeHabitDraftOption = useCallback((optionId: string) => {
    setHabitDraft((prev) => {
      if (prev.options.length <= 1) return prev;
      return {
        ...prev,
        options: prev.options.filter((option) => option.id !== optionId),
      };
    });
  }, []);

  const handleApplyHabitPreset = useCallback((preset: HabitPreset) => {
    const selectedCategory = selectedCategoryId !== 'all'
      ? orderedCategories.find((category) => category.id === selectedCategoryId)
      : null;
    const presetCategory = orderedCategories.find((category) => category.name === preset.categoryName);
    const categoryId = presetCategory?.id ?? selectedCategory?.id ?? '';
    const order = categoryId ? getNextHabitOrder(workspace.habits, categoryId) : 1;

    setManageSection('habits');
    setEditingHabitId(null);
    setShowAdvancedHabitSettings(false);
    setHabitDraft(createHabitDraftFromPreset(preset, categoryId, order));
    toast.info(`${preset.label} 기본값을 채웠습니다.`, { id: 'habit-preset-fill' });
  }, [orderedCategories, selectedCategoryId, workspace.habits]);

  const handleCreateStarterPack = useCallback(async () => {
    if (!currentUser || !hasLoaded || isSaving) return;

    const starterPresets = QUICK_HABIT_PRESETS.filter((preset) => STARTER_HABIT_PRESET_IDS.includes(preset.id));
    const nextWorkspace = createWorkspaceWithPresetHabits(workspace, starterPresets);
    const addedCount = nextWorkspace.habits.length - workspace.habits.length;

    if (addedCount <= 0) {
      toast.info('이미 시작 프리셋이 추가되어 있습니다.', { id: 'habit-starter-pack' });
      return;
    }

    const saved = await persistWorkspace(nextWorkspace, `시작 습관 ${addedCount}개가 추가되었습니다.`, 'habit-starter-pack');

    if (saved) {
      setManageSection('habits');
      setSelectedCategoryId('all');
      setEditingHabitId(null);
      setShowAdvancedHabitSettings(false);
      const firstCategoryId = sortCategoriesByOrder(nextWorkspace.categories)[0]?.id ?? '';
      setHabitDraft(createHabitDraft(firstCategoryId, 'check', getNextHabitOrder(nextWorkspace.habits, firstCategoryId)));
    }
  }, [currentUser, hasLoaded, isSaving, persistWorkspace, workspace]);

  const handleResetHabitRecords = useCallback(async () => {
    if (!currentUser || !hasLoaded || isSaving) return;

    if (!hasHabitRecords) {
      toast.info('초기화할 기록이 없습니다.', { id: 'habit-reset-records' });
      return;
    }

    const result = await Swal.fire({
      title: '날짜별 기록만 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#b8c4cf;font-size:13px;line-height:1.55;">
          <p style="margin:0;"><strong style="color:#ffe9a6;">카테고리와 습관 항목은 그대로 유지</strong>하고 날짜별 기록만 비웁니다.</p>
          <p style="margin:0;">현재 기록: 기록 날짜 ${storedRecordDayCount}일 · 기록 항목 ${storedRecordEntryCount}개</p>
          <p style="margin:0;color:#ffb19d;">초기화 후에는 화면에서 되돌릴 수 없습니다. 필요한 경우 먼저 데이터를 백업해 주세요.</p>
        </div>
      `,
      icon: 'warning',
      input: 'text',
      inputLabel: '실행하려면 아래에 "기록 초기화"를 입력하세요.',
      inputPlaceholder: '기록 초기화',
      inputValidator: (value) => (value?.trim() === '기록 초기화' ? undefined : '"기록 초기화"라고 입력해야 실행됩니다.'),
      showCancelButton: true,
      confirmButtonText: '기록만 초기화',
      cancelButtonText: '취소',
      background: '#101821',
      color: '#eef5f0',
      confirmButtonColor: '#f8c64e',
      cancelButtonColor: '#596774',
    });

    if (!result.isConfirmed) return;

    const nextWorkspace: HabitWorkspace = {
      ...workspace,
      records: {},
    };
    const saved = await persistWorkspace(nextWorkspace, '날짜별 기록이 모두 초기화되었습니다.', 'habit-reset-records');

    if (saved) {
      setSelectedStatsMetricId('');
      setItemStatsChartMode('progress');
    }
  }, [
    currentUser,
    hasHabitRecords,
    hasLoaded,
    isSaving,
    persistWorkspace,
    storedRecordDayCount,
    storedRecordEntryCount,
    workspace,
  ]);

  const handleResetHabitTrackerData = useCallback(async () => {
    if (!currentUser || !hasLoaded || isSaving) return;

    const categoryCount = workspace.categories.length;
    const habitCount = workspace.habits.length;
    const recordDayCount = Object.keys(workspace.records).length;

    if (categoryCount === 0 && habitCount === 0 && recordDayCount === 0) {
      toast.info('초기화할 습관 트래커 데이터가 없습니다.', { id: 'habit-reset-all' });
      return;
    }

    const result = await Swal.fire({
      title: '습관 트래커 데이터를 모두 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#b8c4cf;font-size:13px;line-height:1.55;">
          <p style="margin:0;">이 작업은 <strong style="color:#ffd2c5;">카테고리, 습관 항목, 날짜별 기록</strong>을 모두 비웁니다.</p>
          <p style="margin:0;">현재 데이터: 카테고리 ${categoryCount}개 · 항목 ${habitCount}개 · 기록 날짜 ${recordDayCount}일</p>
          <p style="margin:0;color:#ffb19d;">초기화 후에는 화면에서 되돌릴 수 없습니다. 필요한 경우 먼저 데이터를 백업해 주세요.</p>
        </div>
      `,
      icon: 'warning',
      input: 'text',
      inputLabel: '실행하려면 아래에 "초기화"를 입력하세요.',
      inputPlaceholder: '초기화',
      inputValidator: (value) => (value?.trim() === '초기화' ? undefined : '"초기화"라고 입력해야 실행됩니다.'),
      showCancelButton: true,
      confirmButtonText: '전체 초기화',
      cancelButtonText: '취소',
      background: '#101821',
      color: '#eef5f0',
      confirmButtonColor: '#ff7a59',
      cancelButtonColor: '#596774',
    });

    if (!result.isConfirmed) return;

    const nextWorkspace = createInitialWorkspace();
    const saved = await persistWorkspace(nextWorkspace, '습관 트래커 데이터가 모두 초기화되었습니다.', 'habit-reset-all');

    if (saved) {
      setSelectedCategoryId('all');
      setManageSection('habits');
      setEditingCategoryId(null);
      setEditingHabitId(null);
      setShowAdvancedHabitSettings(false);
      setSelectedStatsHabitId('');
      setSelectedStatsMetricId('');
      setItemStatsChartMode('progress');
      setCategoryDraft({ name: '', color: CATEGORY_COLORS[0], order: 1 });
      setHabitDraft(createHabitDraft('', 'check', 1));
    }
  }, [currentUser, hasLoaded, isSaving, persistWorkspace, workspace]);

  const handleLogin = useCallback(async () => {
    if (!isConfigured) {
      toast.error('Firebase 설정이 필요합니다.');
      return;
    }

    try {
      await loginWithGoogle();
      toast.success('로그인되었습니다.', { id: 'habit-login' });
    } catch (error) {
      console.error('Failed to sign in for habit tracker:', error);
      toast.error('로그인에 실패했습니다.', { id: 'habit-login' });
    }
  }, [isConfigured, loginWithGoogle]);

  const syncState: 'ready' | 'saving' | 'locked' = !currentUser ? 'locked' : isSaving ? 'saving' : 'ready';
  const controlsDisabled = !currentUser || !hasLoaded || isSaving;
  const recordInputDisabled = !currentUser || !hasLoaded;

  const handleQuickRecord = useCallback(
    async (habit: HabitItem, dateKey: string) => {
      if (controlsDisabled) return;

      const record = workspace.records[dateKey]?.[habit.id] ?? {};

      if (habit.mode === 'check') {
        saveRecordForDate(dateKey, habit.id, { checked: !record.checked });
        return;
      }

      if (habit.mode === 'rating') {
        const maxRating = Math.min(Math.max(Math.round(habit.target), 1), 5);
        const currentRating = Number(record.rating) || 0;
        const nextRating = currentRating >= maxRating ? undefined : currentRating + 1;
        saveRecordForDate(dateKey, habit.id, { rating: nextRating });
        return;
      }

      if (isChoiceMode(habit.mode)) {
        const options = getHabitChoiceOptions(habit);
        if (options.length === 0) {
          toast.error('선택 항목을 먼저 추가해주세요.');
          return;
        }

        const selectedIds = getSelectedOptionIds(habit, record);

        if (habit.mode === 'singleChoice') {
          const currentIndex = options.findIndex((option) => option.id === selectedIds[0]);
          const nextOption = options[currentIndex + 1] ?? (currentIndex < 0 ? options[0] : undefined);
          saveRecordForDate(dateKey, habit.id, {
            selectedOptionId: nextOption?.id,
            selectedOptionIds: undefined,
          });
          return;
        }

        const nextOption = options.find((option) => !selectedIds.includes(option.id));
        saveRecordForDate(dateKey, habit.id, {
          selectedOptionIds: nextOption ? [...selectedIds, nextOption.id] : undefined,
          selectedOptionId: undefined,
        });
        return;
      }

      if (habit.mode === 'note') {
        toast.info('메모형 기록은 날짜 기준에서 입력해주세요.');
        return;
      }

      const fields = getQuickRecordFields(habit, record);
      const fieldHtml = fields
        .map((field) => {
          const value = field.value !== undefined ? String(field.value) : '';
          return `
            <label class="quick-record-field" for="habit-quick-${field.id}">
              <span>${escapeHtml(field.label)}</span>
              <div>
                <input
                  id="habit-quick-${field.id}"
                  type="number"
                  min="0"
                  step="${field.step}"
                  inputmode="decimal"
                  value="${escapeHtml(value)}"
                  placeholder="${escapeHtml(String(field.placeholder))}"
                />
                <em>${escapeHtml(field.unit)}</em>
              </div>
            </label>
          `;
        })
        .join('');

      const result = await Swal.fire({
        title: `${habit.name} 기록`,
        html: `
          <div class="quick-record-modal">
            <p>${escapeHtml(formatMonthDay(dateKey))} 기록값을 입력하세요. ${
              fields.length > 1 ? '필요한 수치만 입력해도 저장됩니다.' : '빈 값은 기록을 비웁니다.'
            }</p>
            <div class="quick-record-fields">${fieldHtml}</div>
          </div>
          <style>
            .quick-record-modal { text-align: left; }
            .quick-record-modal p { margin: 0 0 14px; color: #91a0ac; font-size: 13px; font-weight: 800; }
            .quick-record-fields { display: grid; gap: 10px; }
            .quick-record-field { display: grid; gap: 6px; color: #91a0ac; font-size: 12px; font-weight: 900; }
            .quick-record-field div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
            .quick-record-field input {
              min-width: 0;
              height: 42px;
              border: 1px solid rgba(189, 203, 220, 0.22);
              border-radius: 8px;
              padding: 0 12px;
              color: #eef5f0;
              background: rgba(255, 255, 255, 0.055);
              font: inherit;
              outline: none;
            }
            .quick-record-field input:focus {
              border-color: rgba(66, 211, 146, 0.68);
              box-shadow: 0 0 0 3px rgba(66, 211, 146, 0.12);
            }
            .quick-record-field em { min-width: 38px; color: #91a0ac; font-style: normal; font-weight: 950; }
          </style>
        `,
        preConfirm: () => {
          const popup = Swal.getPopup();
          if (!popup) return false;

          const values = fields.reduce<Record<string, number | undefined>>((acc, field) => {
            const input = popup.querySelector<HTMLInputElement>(`#habit-quick-${field.id}`);
            const parsed = readNumber(input?.value ?? '');
            acc[field.id] = parsed;
            return acc;
          }, {});

          const hasNegativeValue = Object.values(values).some((value) => value !== undefined && value < 0);
          if (hasNegativeValue) {
            Swal.showValidationMessage('0 이상의 숫자를 입력해주세요.');
            return false;
          }

          return values;
        },
        showCancelButton: true,
        confirmButtonText: '저장',
        cancelButtonText: '취소',
        background: '#101821',
        color: '#eef5f0',
        confirmButtonColor: '#42d392',
        cancelButtonColor: '#596774',
      });

      if (!result.isConfirmed) return;

      saveRecordForDate(
        dateKey,
        habit.id,
        createQuickRecordPatchFromValues(habit, result.value as Record<string, number | undefined>),
      );
    },
    [controlsDisabled, saveRecordForDate, workspace.records],
  );

  const handleQuickStatsRecord = useCallback(
    (habit: { id: string }, dateKey: string) => {
      const targetHabit = orderedHabits.find((item) => item.id === habit.id);
      if (!targetHabit) return undefined;
      return handleQuickRecord(targetHabit, dateKey);
    },
    [handleQuickRecord, orderedHabits],
  );

  const renderHabitOrderControls = (habit: HabitItem, compact = false) => {
    const habitPosition = habitDisplayOrderById.get(habit.id);
    if (!habitPosition || habitPosition.total <= 1) return null;

    const canMoveHabitUp = habitPosition.order > 1;
    const canMoveHabitDown = habitPosition.order < habitPosition.total;

    return (
      <RecordOrderControls $compact={compact} role="group" aria-label={`${habit.name} 항목 순서 변경`}>
        <RecordOrderButton
          type="button"
          $compact={compact}
          onClick={(event) => {
            event.stopPropagation();
            void handleMoveHabit(habit.id, -1);
          }}
          disabled={controlsDisabled || !canMoveHabitUp}
          title={`${habit.name} 위로 이동`}
          aria-label={`${habit.name} 항목 위로 이동`}
        >
          <ChevronUp size={compact ? 11 : 13} />
        </RecordOrderButton>
        <RecordOrderButton
          type="button"
          $compact={compact}
          onClick={(event) => {
            event.stopPropagation();
            void handleMoveHabit(habit.id, 1);
          }}
          disabled={controlsDisabled || !canMoveHabitDown}
          title={`${habit.name} 아래로 이동`}
          aria-label={`${habit.name} 항목 아래로 이동`}
        >
          <ChevronDown size={compact ? 11 : 13} />
        </RecordOrderButton>
      </RecordOrderControls>
    );
  };

  const renderHabitTargetFields = () => {
    if (habitDraft.mode === 'check') {
      return (
        <CheckModePreview>
          <CheckBoxMark $active>
            <Check />
          </CheckBoxMark>
          <div>
            <strong>V 박스체크</strong>
            <span>완료 여부만 박스 체크로 기록합니다.</span>
          </div>
        </CheckModePreview>
      );
    }

    if (habitDraft.mode === 'cardio') {
      return (
        <InlineFields>
          <FieldLabel>
            1단 목표 / 단위
            <TargetUnitPair>
              <NumberInput min={habitDraft.goalDirection === 'decrease' ? 0 : 1} step={0.1} value={habitDraft.target} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, target: readNumber(event.target.value) ?? (prev.goalDirection === 'decrease' ? 0 : 1) }))} />
              <TextInput value={habitDraft.unit} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, unit: event.target.value }))} />
            </TargetUnitPair>
          </FieldLabel>
          <FieldLabel>
            2단 목표 / 단위
            <TargetUnitPair>
              <NumberInput min={1} value={habitDraft.secondaryTarget ?? 60} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, secondaryTarget: readNumber(event.target.value) ?? 1 }))} />
              <TextInput value={habitDraft.secondaryUnit ?? '분'} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, secondaryUnit: event.target.value }))} />
            </TargetUnitPair>
          </FieldLabel>
        </InlineFields>
      );
    }

    if (habitDraft.mode === 'strength') {
      return (
        <TripleFields>
          <FieldLabel>
            1단 목표 / 단위
            <TargetUnitPair>
              <NumberInput min={habitDraft.goalDirection === 'decrease' ? 0 : 1} step={0.5} value={habitDraft.target} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, target: readNumber(event.target.value) ?? (prev.goalDirection === 'decrease' ? 0 : 1) }))} />
              <TextInput value={habitDraft.unit} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, unit: event.target.value }))} />
            </TargetUnitPair>
          </FieldLabel>
          <FieldLabel>
            2단 목표 / 단위
            <TargetUnitPair>
              <NumberInput min={1} value={habitDraft.secondaryTarget ?? 3} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, secondaryTarget: readNumber(event.target.value) ?? 1 }))} />
              <TextInput value={habitDraft.secondaryUnit ?? '회'} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, secondaryUnit: event.target.value }))} />
            </TargetUnitPair>
          </FieldLabel>
          <FieldLabel>
            3단 목표 / 단위
            <TargetUnitPair>
              <NumberInput min={1} value={habitDraft.tertiaryTarget ?? 5} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, tertiaryTarget: readNumber(event.target.value) ?? 1 }))} />
              <TextInput value={habitDraft.tertiaryUnit ?? '세트'} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, tertiaryUnit: event.target.value }))} />
            </TargetUnitPair>
          </FieldLabel>
        </TripleFields>
      );
    }

    if (isChoiceMode(habitDraft.mode)) {
      return (
        <ChoiceOptionEditor>
          <ChoiceEditorHead>
            <span>{habitDraft.mode === 'singleChoice' ? '하루에 하나만 선택' : '여러 항목 중복 선택 가능'}</span>
            <IconButton type="button" $tone="ghost" onClick={addHabitDraftOption} disabled={controlsDisabled}>
              <Plus size={15} />
              더 추가
            </IconButton>
          </ChoiceEditorHead>
          {habitDraft.options.map((option, index) => (
            <ChoiceOptionRow key={option.id}>
              <SetIndex>{index + 1}</SetIndex>
              <TextInput value={option.label} disabled={controlsDisabled} onChange={(event) => updateHabitDraftOption(option.id, event.target.value)} placeholder={`선택 항목 ${index + 1}`} />
              <IconOnlyButton type="button" $tone="danger" disabled={controlsDisabled || habitDraft.options.length <= 1} onClick={() => removeHabitDraftOption(option.id)} title="선택 항목 줄이기" aria-label={`${option.label || `선택 항목 ${index + 1}`} 삭제`}>
                <Minus size={16} />
              </IconOnlyButton>
            </ChoiceOptionRow>
          ))}
          <RecordHint>+ 버튼으로 선택지를 늘리고 - 버튼으로 줄입니다. 빈 선택지는 저장 시 제외됩니다.</RecordHint>
        </ChoiceOptionEditor>
      );
    }

    return (
      <InlineFields>
        <FieldLabel>
          목표
          <NumberInput min={habitDraft.goalDirection === 'decrease' ? 0 : 1} value={habitDraft.target} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, target: readNumber(event.target.value) ?? (prev.goalDirection === 'decrease' ? 0 : 1) }))} />
        </FieldLabel>
        <FieldLabel>
          단위
          <TextInput value={habitDraft.unit} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, unit: event.target.value }))} />
        </FieldLabel>
      </InlineFields>
    );
  };

  const renderTrendGoalFields = () => {
    if (!isTrendGoalMode(habitDraft.mode)) return null;

    const direction = habitDraft.goalDirection ?? 'increase';
    const unit = habitDraft.unit || MODE_META[habitDraft.mode].unit;
    const target = Number.isFinite(Number(habitDraft.target)) ? Number(habitDraft.target) : MODE_META[habitDraft.mode].target;
    const targetStep = habitDraft.mode === 'cardio' || habitDraft.mode === 'strength' ? 0.1 : 1;
    const draftHabitForMetrics: HabitItem = {
      id: 'draft',
      categoryId: habitDraft.categoryId || 'draft',
      name: habitDraft.name || 'draft',
      mode: habitDraft.mode,
      target,
      unit,
      goalDirection: direction,
      baseline: habitDraft.baseline,
      minTarget: habitDraft.minTarget,
      maxTarget: habitDraft.maxTarget,
      metricGoals: habitDraft.metricGoals,
      secondaryTarget: habitDraft.secondaryTarget,
      secondaryUnit: habitDraft.secondaryUnit,
      tertiaryTarget: habitDraft.tertiaryTarget,
      tertiaryUnit: habitDraft.tertiaryUnit,
    };
    const metricDefinitions = getTrendMetricDefinitions(draftHabitForMetrics);
    const hasMetricBreakdown = metricDefinitions.length > 1;
    const goalPresets = getGoalPresetOptions(draftHabitForMetrics);
    const applyGoalPreset = (presetId: string) => {
      const nextMetricGoals = createPresetMetricGoals(draftHabitForMetrics, presetId);
      const firstMetricGoal = nextMetricGoals?.[metricDefinitions[0]?.id ?? ''];
      setHabitDraft((prev) => ({
        ...prev,
        goalDirection: firstMetricGoal?.direction ?? (presetId === 'decrease' ? 'decrease' : presetId === 'maintain' ? 'maintain' : 'increase'),
        minTarget: firstMetricGoal?.minTarget ?? prev.minTarget,
        maxTarget: firstMetricGoal?.maxTarget ?? prev.maxTarget,
        metricGoals: nextMetricGoals,
      }));
    };
    const updateMetricGoal = (metricId: string, patch: MetricGoalConfig) => {
      setHabitDraft((prev) => {
        const nextGoal = removeUndefinedFields({
          ...(prev.metricGoals?.[metricId] ?? {}),
          ...patch,
        });
        const nextMetricGoals = {
          ...(prev.metricGoals ?? {}),
          [metricId]: nextGoal,
        };

        if (Object.keys(nextGoal).length === 0) {
          delete nextMetricGoals[metricId];
        }

        return {
          ...prev,
          metricGoals: Object.keys(nextMetricGoals).length > 0 ? nextMetricGoals : undefined,
        };
      });
    };

    return (
      <GoalSettingsPanel>
        <PanelHeading>
          <div>
            <PanelTitle>목표 해석</PanelTitle>
            <PanelHint>{hasMetricBreakdown ? '2단/3단의 각 수치를 별도 목표로 계산합니다.' : GOAL_DIRECTION_META[direction].hint}</PanelHint>
          </div>
        </PanelHeading>
        <PresetStrip aria-label="목표 프리셋">
          {goalPresets.map((preset) => (
            <PresetButton type="button" key={preset.id} disabled={controlsDisabled} onClick={() => applyGoalPreset(preset.id)} title={preset.description}>
              <Settings2 size={13} />
              {preset.label}
            </PresetButton>
          ))}
        </PresetStrip>
        {hasMetricBreakdown ? (
          <GoalMetricGrid>
            {metricDefinitions.map((metric) => {
              const goal = getMetricGoalConfig(draftHabitForMetrics, metric);
              const metricStep = metric.id === 'load' || metric.id === 'distance' ? 0.1 : 1;
              const metricTarget = Number.isFinite(goal.target) ? Number(goal.target) : metric.target ?? 0;
              const metricIssues = getGoalConfigIssues(goal, metric.unit);

              return (
                <GoalMetricCard key={metric.id} $color={metric.color}>
                  <MetricCardTop>
                    <span>{metric.label}</span>
                    <MetricDot $color={metric.color} />
                  </MetricCardTop>
                  <RankMeta>{getMetricGoalLabel(metric, goal)}</RankMeta>
                  <CompactGoalSwitch aria-label={`${metric.label} 목표 해석 방식`}>
                    {(['increase', 'decrease', 'maintain'] as GoalDirection[]).map((nextDirection) => (
                      <CompactGoalButton
                        type="button"
                        key={nextDirection}
                        $active={goal.direction === nextDirection}
                        disabled={controlsDisabled}
                        onClick={() => updateMetricGoal(metric.id, {
                          direction: nextDirection,
                          target: metricTarget,
                          minTarget: nextDirection === 'maintain' ? goal.minTarget ?? metricTarget : goal.minTarget,
                          maxTarget: nextDirection === 'maintain' ? goal.maxTarget ?? metricTarget : goal.maxTarget,
                        })}
                      >
                        {GOAL_DIRECTION_META[nextDirection].label}
                      </CompactGoalButton>
                      ))}
                  </CompactGoalSwitch>
                  <FieldLabel>
                    통계 방식
                    <SelectInput
                      value={getMetricAggregationMode(draftHabitForMetrics, metric)}
                      disabled={controlsDisabled}
                      onChange={(event) => updateMetricGoal(metric.id, { aggregation: event.target.value as MetricAggregationMode })}
                    >
                      {METRIC_AGGREGATION_OPTIONS.map((aggregation) => (
                        <option key={aggregation} value={aggregation}>
                          {METRIC_AGGREGATION_META[aggregation].label}
                        </option>
                      ))}
                    </SelectInput>
                  </FieldLabel>
                  {goal.direction === 'maintain' ? (
                    <InlineFields>
                      <FieldLabel>
                        하한
                        <InputWithUnit>
                          <NumberInput step={metricStep} value={goal.minTarget ?? metricTarget} disabled={controlsDisabled} onChange={(event) => updateMetricGoal(metric.id, { minTarget: readNumber(event.target.value) ?? metricTarget, target: metricTarget })} />
                          <UnitText>{metric.unit}</UnitText>
                        </InputWithUnit>
                      </FieldLabel>
                      <FieldLabel>
                        상한
                        <InputWithUnit>
                          <NumberInput step={metricStep} value={goal.maxTarget ?? metricTarget} disabled={controlsDisabled} onChange={(event) => updateMetricGoal(metric.id, { maxTarget: readNumber(event.target.value) ?? metricTarget, target: metricTarget })} />
                          <UnitText>{metric.unit}</UnitText>
                        </InputWithUnit>
                      </FieldLabel>
                    </InlineFields>
                  ) : (
                    <InlineFields>
                      <FieldLabel>
                        목표
                        <InputWithUnit>
                          <NumberInput min={goal.direction === 'decrease' ? 0 : 1} step={metricStep} value={metricTarget} disabled={controlsDisabled} onChange={(event) => updateMetricGoal(metric.id, { target: readNumber(event.target.value) ?? metricTarget })} />
                          <UnitText>{metric.unit}</UnitText>
                        </InputWithUnit>
                      </FieldLabel>
                      <FieldLabel>
                        기준값
                        <InputWithUnit>
                          <NumberInput min={0} step={metricStep} value={goal.baseline ?? ''} placeholder="선택…" disabled={controlsDisabled} onChange={(event) => updateMetricGoal(metric.id, { baseline: readNumber(event.target.value), target: metricTarget })} />
                          <UnitText>{metric.unit}</UnitText>
                        </InputWithUnit>
                      </FieldLabel>
                    </InlineFields>
                  )}
                  {metricIssues.length > 0 ? <GoalIssueText>{metricIssues[0]}</GoalIssueText> : null}
                </GoalMetricCard>
              );
            })}
          </GoalMetricGrid>
        ) : (
          <>
            {metricDefinitions[0] ? (
              <FieldLabel>
                통계 방식
                <SelectInput
                  value={getMetricAggregationMode(draftHabitForMetrics, metricDefinitions[0])}
                  disabled={controlsDisabled}
                  onChange={(event) => updateMetricGoal(metricDefinitions[0].id, { aggregation: event.target.value as MetricAggregationMode })}
                >
                  {METRIC_AGGREGATION_OPTIONS.map((aggregation) => (
                    <option key={aggregation} value={aggregation}>
                      {METRIC_AGGREGATION_META[aggregation].label}
                    </option>
                  ))}
                </SelectInput>
              </FieldLabel>
            ) : null}
            <GoalDirectionSwitch aria-label="목표 해석 방식">
              {(['increase', 'decrease', 'maintain'] as GoalDirection[]).map((nextDirection) => (
                <GoalDirectionButton
                  type="button"
                  key={nextDirection}
                  $active={direction === nextDirection}
                  disabled={controlsDisabled}
                  onClick={() => {
                    setHabitDraft((prev) => ({
                      ...prev,
                      goalDirection: nextDirection,
                      minTarget: nextDirection === 'maintain' ? prev.minTarget ?? target : prev.minTarget,
                      maxTarget: nextDirection === 'maintain' ? prev.maxTarget ?? target : prev.maxTarget,
                    }));
                  }}
                >
                  {GOAL_DIRECTION_META[nextDirection].label}
                </GoalDirectionButton>
              ))}
            </GoalDirectionSwitch>
            {direction === 'maintain' ? (
              <InlineFields>
                <FieldLabel>
                  유지 하한
                  <InputWithUnit>
                    <NumberInput step={targetStep} value={habitDraft.minTarget ?? target} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, minTarget: readNumber(event.target.value) ?? target }))} />
                    <UnitText>{unit}</UnitText>
                  </InputWithUnit>
                </FieldLabel>
                <FieldLabel>
                  유지 상한
                  <InputWithUnit>
                    <NumberInput step={targetStep} value={habitDraft.maxTarget ?? target} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, maxTarget: readNumber(event.target.value) ?? target }))} />
                    <UnitText>{unit}</UnitText>
                  </InputWithUnit>
                </FieldLabel>
              </InlineFields>
            ) : (
              <InlineFields>
                <FieldLabel>
                  시작 기준값
                  <InputWithUnit>
                    <NumberInput min={0} step={targetStep} value={habitDraft.baseline ?? ''} placeholder="선택…" disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, baseline: readNumber(event.target.value) }))} />
                    <UnitText>{unit}</UnitText>
                  </InputWithUnit>
                </FieldLabel>
                <RecordHint>
                  {direction === 'decrease'
                    ? `기록값이 ${formatCompactNumber(target)}${unit} 이하가 되면 완료로 계산됩니다.`
                    : `기록값이 ${formatCompactNumber(target)}${unit} 이상이면 완료로 계산됩니다.`}
                </RecordHint>
              </InlineFields>
            )}
          </>
        )}
      </GoalSettingsPanel>
    );
  };

  const renderCategoryForm = () => (
    <ManageForm>
      <PanelHeading>
        <div>
          <PanelTitle>{editingCategoryId ? '카테고리 수정' : '새 카테고리'}</PanelTitle>
          <PanelHint>루틴을 묶을 그룹 이름과 색상을 관리합니다.</PanelHint>
        </div>
      </PanelHeading>
      <ManageFormGrid>
        <ManageWideField>
          <FieldLabel>
            이름
            <TextInput value={categoryDraft.name} disabled={controlsDisabled} onChange={(event) => setCategoryDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="예: 수면, 식단, 공부" />
          </FieldLabel>
        </ManageWideField>
        <FieldLabel>
          순번
          <NumberInput min={1} value={categoryDraft.order} disabled={controlsDisabled} onChange={(event) => setCategoryDraft((prev) => ({ ...prev, order: readNumber(event.target.value) ?? prev.order }))} />
        </FieldLabel>
        <FieldLabel as="div">
          색상
          <Palette aria-label="카테고리 색상">
            {CATEGORY_COLORS.map((color) => (
              <ColorSwatch type="button" key={color} $color={color} $active={categoryDraft.color === color} disabled={controlsDisabled} onClick={() => setCategoryDraft((prev) => ({ ...prev, color }))} title={color} />
            ))}
          </Palette>
        </FieldLabel>
      </ManageFormGrid>
      <ManageActions>
        <IconButton type="button" $tone="primary" onClick={() => void handleSubmitCategory()} disabled={controlsDisabled || !categoryDraft.name.trim()}>
          {editingCategoryId ? <Pencil size={16} /> : <Plus size={16} />}
          {editingCategoryId ? '수정 저장' : '카테고리 추가'}
        </IconButton>
        {editingCategoryId ? (
          <IconButton type="button" $tone="ghost" onClick={resetCategoryDraft} disabled={controlsDisabled}>
            <X size={16} />
            취소
          </IconButton>
        ) : null}
      </ManageActions>
    </ManageForm>
  );

  const renderHabitForm = () => (
    <ManageForm>
      <PanelHeading>
        <div>
          <PanelTitle>{editingHabitId ? '항목 수정' : '새 항목'}</PanelTitle>
          <PanelHint>프리셋을 고르거나 이름만 입력해도 바로 시작할 수 있습니다.</PanelHint>
        </div>
      </PanelHeading>
      {!editingHabitId ? (
        <PresetLauncher>
          <PanelHeading>
            <div>
              <PanelTitle>빠른 시작</PanelTitle>
              <PanelHint>기록 방식별 예시를 하나씩 채워보고 바로 저장할 수 있습니다.</PanelHint>
            </div>
            {orderedHabits.length === 0 ? (
              <PresetHeaderActions>
                <IconButton type="button" $tone="primary" onClick={() => void handleCreateStarterPack()} disabled={controlsDisabled}>
                  <Plus size={16} />
                  방식별 예시 추가
                </IconButton>
              </PresetHeaderActions>
            ) : null}
          </PanelHeading>
          <HabitPresetGrid>
            {QUICK_HABIT_PRESETS.map((preset) => {
              const ModeIcon = MODE_META[preset.mode].icon;
              const active = habitDraft.name === preset.label && habitDraft.mode === preset.mode;

              return (
                <HabitPresetButton
                  type="button"
                  key={preset.id}
                  $color={preset.categoryColor}
                  $active={active}
                  disabled={controlsDisabled}
                  onClick={() => handleApplyHabitPreset(preset)}
                  title={`${preset.label} ${preset.summary}`}
                >
                  <PresetIcon $color={preset.categoryColor}>
                    <ModeIcon />
                  </PresetIcon>
                  <span>
                    <strong>{preset.label}</strong>
                    <span>{preset.summary}</span>
                    <small>{preset.categoryName}</small>
                  </span>
                </HabitPresetButton>
              );
            })}
          </HabitPresetGrid>
        </PresetLauncher>
      ) : null}
      {!habitDraft.categoryId && orderedCategories.length === 0 ? (
        <AutoCategoryNote>
          <Info size={15} />
          저장할 때 카테고리를 자동으로 만듭니다.
        </AutoCategoryNote>
      ) : null}
      <ManageFormGrid>
        <ManageWideField>
          <FieldLabel>
            항목 이름
            <TextInput value={habitDraft.name} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder={activeCategory ? `${activeCategory.name}에 추가` : '전체 중 첫 카테고리에 추가'} />
          </FieldLabel>
        </ManageWideField>
        <FieldLabel>
          순번
          <NumberInput min={1} value={habitDraft.order} disabled={controlsDisabled} onChange={(event) => setHabitDraft((prev) => ({ ...prev, order: readNumber(event.target.value) ?? prev.order }))} />
        </FieldLabel>
        <FieldLabel>
          카테고리
          <SelectInput
            value={habitDraft.categoryId}
            disabled={controlsDisabled}
            onChange={(event) => {
              const nextCategoryId = event.target.value;
              setHabitDraft((prev) => ({
                ...prev,
                categoryId: nextCategoryId,
                order: editingHabitId && nextCategoryId === prev.categoryId
                  ? prev.order
                  : getNextHabitOrder(workspace.habits, nextCategoryId),
                suggestedCategoryName: undefined,
                suggestedCategoryColor: undefined,
              }));
            }}
          >
            <option value="">{orderedCategories.length ? '자동 선택' : '자동 생성'}</option>
            {orderedCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryDisplayOrderById.get(category.id) ?? category.order}. {category.name}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>
        <FieldLabel>
          기록 방식
          <SelectInput value={habitDraft.mode} disabled={controlsDisabled} onChange={(event) => handleHabitModeChange(event.target.value as RecordMode)}>
            {recordModeOptions.map((mode) => {
              const meta = MODE_META[mode];
              return (
                <option key={mode} value={mode}>
                  {meta.label}
                </option>
              );
            })}
          </SelectInput>
        </FieldLabel>
      </ManageFormGrid>
      {renderHabitTargetFields()}
      {isTrendGoalMode(habitDraft.mode) ? (
        <AdvancedSettingsToggle
          type="button"
          $active={showAdvancedHabitSettings}
          disabled={controlsDisabled}
          onClick={() => setShowAdvancedHabitSettings((prev) => !prev)}
        >
          <Settings2 size={15} />
          {showAdvancedHabitSettings ? '고급 목표 닫기' : '고급 목표 설정'}
        </AdvancedSettingsToggle>
      ) : null}
      {showAdvancedHabitSettings ? renderTrendGoalFields() : null}
      <ManageActions>
        <IconButton type="button" $tone="primary" onClick={() => void handleSubmitHabit()} disabled={controlsDisabled || !habitDraft.name.trim()}>
          {editingHabitId ? <Pencil size={16} /> : <Plus size={16} />}
          {editingHabitId ? '수정 저장' : '항목 추가'}
        </IconButton>
        {editingHabitId ? (
          <IconButton type="button" $tone="ghost" onClick={resetHabitDraft} disabled={controlsDisabled}>
            <X size={16} />
            취소
          </IconButton>
        ) : null}
      </ManageActions>
    </ManageForm>
  );

  const renderManualView = () => {
    const buttonGuide = [
      {
        title: '기록',
        icon: CalendarDays,
        color: '#42d392',
        body: '오늘 한 일을 표시하는 곳입니다. 했으면 체크하고, 공부 시간이나 물 마신 잔 수처럼 숫자가 있으면 숫자로 적습니다.',
      },
      {
        title: '통계',
        icon: BarChart3,
        color: '#63b3ff',
        body: '내가 얼마나 꾸준히 했는지 보는 점수표입니다. 이번 주와 이번 달에 잘한 습관, 더 연습할 습관을 확인합니다.',
      },
      {
        title: '관리',
        icon: Tags,
        color: '#f8c64e',
        body: '습관을 만들고 고치는 곳입니다. 건강, 운동, 공부 같은 상자를 만들고 그 안에 물 마시기, 산책하기 같은 할 일을 넣습니다.',
      },
      {
        title: '동기화',
        icon: Save,
        color: '#ff7a59',
        body: '내 기록을 인터넷 저장 공간에 안전하게 저장하는 버튼입니다. 다른 기기에서 볼 때도 같은 기록을 불러올 수 있게 도와줍니다.',
      },
    ];
    const recordModeGuide: Array<{ mode: RecordMode; detail: string }> = [
      { mode: 'check', detail: '했는지 안 했는지만 표시합니다. 예: 영양제 먹기, 숙제 끝내기, 출석 체크.' },
      { mode: 'duration', detail: '몇 분 동안 했는지 적습니다. 예: 독서 20분, 공부 30분, 스트레칭 10분.' },
      { mode: 'number', detail: '몇 번, 몇 개, 몇 잔처럼 숫자를 적습니다. 예: 물 8잔, 단어 30개, 줄넘기 100번.' },
      { mode: 'rating', detail: '별점으로 느낌을 남깁니다. 예: 오늘 기분 4점, 집중도 3점, 수업 이해도 5점.' },
      { mode: 'cardio', detail: '움직인 거리와 시간을 같이 적습니다. 예: 산책 2km 25분, 달리기 1km 8분.' },
      { mode: 'strength', detail: '운동할 때 무게, 몇 번 했는지, 몇 세트를 했는지 적습니다. 예: 2kg 10회 3세트.' },
      { mode: 'singleChoice', detail: '여러 보기 중 하나만 고릅니다. 예: 오늘 기분 좋음/보통/아쉬움.' },
      { mode: 'multiChoice', detail: '여러 보기를 같이 고릅니다. 예: 저녁 루틴에서 양치, 가방 챙기기, 일기 쓰기 체크.' },
    ];
    const chartBarData = [
      { height: 42, color: '#42d392' },
      { height: 68, color: '#63b3ff' },
      { height: 54, color: '#f8c64e' },
      { height: 86, color: '#42d392' },
      { height: 74, color: '#63b3ff' },
      { height: 96, color: '#42d392' },
      { height: 58, color: '#ff7a59' },
      { height: 82, color: '#f8c64e' },
    ];
    const manualSectionCount = 16;
    const workflowGuide = [
      {
        title: '정하기',
        color: '#42d392',
        body: '먼저 어떤 습관을 만들지 정합니다. 건강, 운동, 공부 같은 상자를 만들고 그 안에 할 일을 넣습니다.',
      },
      {
        title: '기록하기',
        color: '#63b3ff',
        body: '오늘 한 일을 기록 화면에 남깁니다. 체크, 숫자, 시간, 별점 중 맞는 방법으로 적습니다.',
      },
      {
        title: '살펴보기',
        color: '#f8c64e',
        body: '통계 화면에서 이번 주에 잘한 것과 조금 더 연습할 것을 살펴봅니다.',
      },
      {
        title: '고치기',
        color: '#ff7a59',
        body: '목표가 너무 쉽거나 어렵다면 목표 숫자를 바꿉니다. 작은 목표부터 시작하면 오래 할 수 있습니다.',
      },
    ];
    const kidWordGuide = [
      {
        title: '카테고리',
        color: '#42d392',
        body: '비슷한 습관을 담는 상자입니다. 예: 건강 상자, 운동 상자, 공부 상자.',
      },
      {
        title: '항목',
        color: '#63b3ff',
        body: '매일 할 작은 일입니다. 예: 물 8잔, 독서 20분, 영어 단어 10개.',
      },
      {
        title: '기록',
        color: '#f8c64e',
        body: '오늘 했는지 남기는 표시입니다. 체크하거나 숫자를 적으면 기록이 됩니다.',
      },
      {
        title: '통계',
        color: '#ff7a59',
        body: '내 기록을 모아서 보여주는 점수표입니다. 잘한 날과 빠진 날을 쉽게 볼 수 있습니다.',
      },
    ];
    const syncGuide = [
      {
        title: '로그인 필요',
        icon: LogIn,
        color: '#ff7a59',
        body: '로그인하지 않으면 설명서는 볼 수 있지만 기록을 저장할 수 없습니다. 내 기록장을 쓰려면 먼저 로그인합니다.',
      },
      {
        title: '기록을 불러오는 중',
        icon: RefreshCcw,
        color: '#63b3ff',
        body: '전에 저장한 습관과 기록을 가져오는 중입니다. 이때는 잠깐 기다리면 버튼이 다시 눌립니다.',
      },
      {
        title: '저장 준비 끝',
        icon: Save,
        color: '#42d392',
        body: '내 기록장이 준비된 상태입니다. 이제 기록, 관리, 통계를 사용할 수 있고 동기화 버튼도 누를 수 있습니다.',
      },
      {
        title: '동기화 중',
        icon: RefreshCcw,
        color: '#f8c64e',
        body: '기록을 저장하는 중입니다. 끝날 때까지 같은 버튼을 여러 번 누르지 말고 잠깐 기다립니다.',
      },
    ];
    const dailyScenarioGuide = [
      {
        title: '아침: 오늘 항목 확인',
        color: '#42d392',
        body: '기록 탭에서 오늘 날짜가 맞는지 봅니다. 오늘 해야 할 습관을 한 번 훑어봅니다.',
      },
      {
        title: '실행 직후: 바로 입력',
        color: '#63b3ff',
        body: '습관을 끝낸 바로 뒤에 기록합니다. 숙제를 끝냈으면 체크, 책을 20분 읽었으면 20분이라고 적습니다.',
      },
      {
        title: '저녁: 빈 항목 정리',
        color: '#f8c64e',
        body: '저녁에는 빠뜨린 습관이 있는지 봅니다. 하지 못한 것은 거짓으로 채우지 말고 빈칸으로 둡니다.',
      },
      {
        title: '주말: 통계로 조정',
        color: '#ff7a59',
        body: '주말에는 통계를 봅니다. 너무 어려운 목표는 조금 낮추고, 계속 쉬운 목표는 조금 올립니다.',
      },
    ];
    const recordModeDeepGuide: Array<{ mode: RecordMode; bestFor: string; savedData: string; scoreRule: string; caution: string; color: string }> = [
      {
        mode: 'check',
        bestFor: '했는지 안 했는지만 보면 될 때',
        savedData: '체크했는지 여부',
        scoreRule: '체크되면 100%, 체크하지 않으면 0%',
        caution: '몇 번 했는지 알고 싶다면 숫자형을 쓰는 것이 더 좋습니다.',
        color: '#42d392',
      },
      {
        mode: 'duration',
        bestFor: '몇 분 했는지가 중요한 습관',
        savedData: '분 단위 시간',
        scoreRule: '적은 시간이 목표 시간보다 같거나 많으면 완료',
        caution: '처음에는 정말 할 수 있는 시간으로 잡습니다. 예: 60분보다 10분부터 시작.',
        color: '#63b3ff',
      },
      {
        mode: 'number',
        bestFor: '횟수, 개수, 잔 수, 페이지 수',
        savedData: '숫자 값',
        scoreRule: '적은 숫자가 목표 숫자에 가까울수록 달성률이 올라감',
        caution: '목표가 너무 낮으면 매일 100%가 됩니다. 1~2주 뒤에 조금 조정합니다.',
        color: '#2dd4bf',
      },
      {
        mode: 'rating',
        bestFor: '기분, 집중도, 만족도처럼 느낌을 남길 때',
        savedData: '별점 값',
        scoreRule: '별점이 목표 별점에 가까울수록 달성률이 올라감',
        caution: '별점은 느낌을 적는 방식입니다. 정확한 숫자가 필요하면 숫자형을 씁니다.',
        color: '#f8c64e',
      },
      {
        mode: 'cardio',
        bestFor: '달리기, 자전거, 산책처럼 거리와 시간이 함께 필요한 운동',
        savedData: '거리와 시간',
        scoreRule: '거리 목표와 시간 목표를 각각 보고 점수를 계산',
        caution: '거리 목표와 시간 목표가 다르게 필요하면 고급 목표를 켭니다.',
        color: '#63b3ff',
      },
      {
        mode: 'strength',
        bestFor: '근력 운동처럼 무게, 횟수, 세트를 같이 적을 때',
        savedData: '무게, 반복 횟수, 세트 수',
        scoreRule: '무게, 반복, 세트를 각각 보고 항목 점수에 반영',
        caution: '처음 쓰는 학생은 무게보다 자세와 횟수를 먼저 기록하는 편이 쉽습니다.',
        color: '#a78bfa',
      },
      {
        mode: 'singleChoice',
        bestFor: '하루 상태를 하나만 고를 때',
        savedData: '고른 보기 1개',
        scoreRule: '보기를 고르면 기록한 날로 계산',
        caution: '좋음/보통/아쉬움처럼 보기 이름을 쉽게 씁니다.',
        color: '#f8c64e',
      },
      {
        mode: 'multiChoice',
        bestFor: '체크리스트처럼 여러 개를 같이 고를 때',
        savedData: '고른 보기 목록',
        scoreRule: '고른 개수가 많을수록 진행률이 올라감',
        caution: '보기가 너무 많으면 힘듭니다. 3~6개 정도가 적당합니다.',
        color: '#2dd4bf',
      },
    ];
    const statsDetailGuide = [
      {
        title: '달성률',
        color: '#42d392',
        detail: '목표에 얼마나 가까이 갔는지 보여주는 숫자입니다. 100%는 목표를 다 했다는 뜻이고, 50%는 절반쯤 했다는 뜻입니다.',
      },
      {
        title: '기록된 항목',
        color: '#63b3ff',
        detail: '실제로 기록을 남긴 습관의 수입니다. 목표를 못 채웠더라도 기록을 남겼다면 내 생활을 잘 살펴본 것입니다.',
      },
      {
        title: '기록한 날짜',
        color: '#f8c64e',
        detail: '이번 주나 이번 달에 기록을 남긴 날의 수입니다. 매일 완벽하지 않아도 빈 날이 줄어들면 좋아지고 있는 것입니다.',
      },
      {
        title: '최장 연속',
        color: '#ff7a59',
        detail: '며칠 동안 계속 기록했는지 보여줍니다. 하루 빠졌다고 실패가 아니고, 다시 이어가면 됩니다.',
      },
      {
        title: '카테고리 균형',
        color: '#2dd4bf',
        detail: '건강, 운동, 공부 상자별로 얼마나 잘했는지 비교합니다. 한 상자만 너무 낮으면 목표가 너무 많거나 어려울 수 있습니다.',
      },
      {
        title: '항목 랭킹',
        color: '#a78bfa',
        detail: '잘되고 있는 습관을 순서대로 보여줍니다. 낮은 습관은 더 작은 목표로 나누면 쉬워집니다.',
      },
    ];
    const mobileUsageGuide = [
      {
        title: '모바일 상단 탭',
        color: '#42d392',
        body: '휴대폰에서는 기록, 통계, 관리, 설명서 버튼이 작게 모입니다. 원하는 버튼을 눌러 화면을 바꿉니다.',
      },
      {
        title: '날짜 보기',
        color: '#63b3ff',
        body: '오늘 하루를 자세히 기록할 때 씁니다. 카드에서 체크하거나 숫자, 별점, 보기를 바로 고릅니다.',
      },
      {
        title: '항목 보기',
        color: '#f8c64e',
        body: '같은 습관을 여러 날짜로 볼 때 씁니다. 빠뜨린 날을 찾거나 며칠치를 확인할 때 편합니다.',
      },
      {
        title: '짧은 이름 쓰기',
        color: '#ff7a59',
        body: '휴대폰 화면은 작습니다. 항목 이름은 물 8잔, 독서 20분처럼 짧게 쓰면 보기 쉽습니다.',
      },
    ];
    const goalExampleGuide = [
      {
        title: '러닝 5km 이상',
        color: '#42d392',
        body: '달리기처럼 거리와 시간이 있는 운동입니다. 5km를 목표로 정하면 얼마나 가까이 갔는지 점수로 볼 수 있습니다.',
      },
      {
        title: '카페인 1잔 이하',
        color: '#ff7a59',
        body: '적을수록 좋은 목표입니다. 0~1잔이면 성공이고, 더 많이 마시면 점수가 낮아집니다.',
      },
      {
        title: '수면 7~8시간 유지',
        color: '#f8c64e',
        body: '너무 적어도, 너무 많아도 좋지 않은 목표입니다. 7시간에서 8시간 사이면 성공으로 볼 수 있습니다.',
      },
      {
        title: '근력 운동 볼륨 관리',
        color: '#63b3ff',
        body: '운동을 자세히 적고 싶을 때 씁니다. 무게, 반복 횟수, 세트 수를 따로 볼 수 있습니다.',
      },
    ];
    const backupChecklist = [
      '카테고리를 지우면 그 안에 있던 습관과 기록도 같이 지워집니다.',
      '항목을 지우면 그 항목의 날짜별 기록만 지워지고 다른 항목은 남아 있습니다.',
      'CSV는 표로 보는 파일이고, JSON은 전체 기록장을 보관하는 파일입니다.',
      '많이 지우기 전에는 통계 화면에서 JSON 백업을 먼저 내려받는 것이 안전합니다.',
    ];
    const faqGuide = [
      {
        title: '기록했는데 달성률이 0%로 보일 때',
        color: '#ff7a59',
        body: '목표 숫자와 단위를 확인합니다. 예를 들어 30분 목표인데 30초처럼 잘못 적으면 점수가 이상하게 보일 수 있습니다.',
      },
      {
        title: '항목이 너무 많아 기록이 귀찮을 때',
        color: '#63b3ff',
        body: '매일 꼭 보는 습관은 5~8개 정도로 줄입니다. 너무 많으면 오래 하기 어렵습니다.',
      },
      {
        title: '통계가 실제 체감과 다를 때',
        color: '#f8c64e',
        body: '완료율만 보지 말고 기록한 날짜와 실제 숫자도 같이 봅니다. 목표가 너무 쉬우면 점수가 높게 보일 수 있습니다.',
      },
      {
        title: '새 루틴을 시작할 때',
        color: '#42d392',
        body: '처음 1주일은 쉬운 목표로 시작합니다. 계속 성공하면 다음 주에 목표를 조금 올립니다.',
      },
    ];

    return (
      <ManualShell>
        <ManualHero>
          <ManualHeroCopy>
            <ManualPill>
              <BookOpen size={14} />
              초등학생도 쉽게 보는 설명서
            </ManualPill>
            <h2>오늘 한 일을 기록하고, 내 습관을 키우는 방법</h2>
            <p>
              이 설명서는 처음 쓰는 학생도 바로 따라 할 수 있게 만들었습니다.
              기록은 오늘 한 일을 남기는 것이고, 통계는 내가 얼마나 꾸준히 했는지 보여주는 점수표입니다.
              관리 화면에서는 습관을 만들고, 기록 화면에서는 매일 표시하고, 통계 화면에서는 잘한 점과 더 해볼 점을 확인합니다.
            </p>
            <ManualQuickNav aria-label="설명서 목차">
              <a href="#manual-start"><Check size={13} /> 시작 순서</a>
              <a href="#manual-workflow"><Activity size={13} /> 흐름</a>
              <a href="#manual-sync"><Save size={13} /> 동기화</a>
              <a href="#manual-buttons"><Info size={13} /> 버튼</a>
              <a href="#manual-daily"><Clock3 size={13} /> 하루 예시</a>
              <a href="#manual-record"><CalendarDays size={13} /> 기록</a>
              <a href="#manual-mobile"><Settings2 size={13} /> 모바일</a>
              <a href="#manual-record-modes"><ListPlus size={13} /> 방식</a>
              <a href="#manual-stats"><BarChart3 size={13} /> 통계</a>
              <a href="#manual-stats-read"><Flame size={13} /> 해석</a>
              <a href="#manual-manage"><Tags size={13} /> 관리</a>
              <a href="#manual-manage-fields"><Pencil size={13} /> 필드</a>
              <a href="#manual-goals"><Settings2 size={13} /> 고급 목표</a>
              <a href="#manual-backup"><Download size={13} /> 백업</a>
              <a href="#manual-ops"><Trophy size={13} /> 점검</a>
              <a href="#manual-faq"><Info size={13} /> FAQ</a>
            </ManualQuickNav>
            <ManualHeroStats>
              <ManualHeroStat $color="#42d392">
                <span>설명 범위</span>
                <strong>{manualSectionCount}개</strong>
              </ManualHeroStat>
              <ManualHeroStat $color="#63b3ff">
                <span>현재 지원 기록 방식</span>
                <strong>{recordModeGuide.length}개</strong>
              </ManualHeroStat>
            <ManualHeroStat $color="#f8c64e">
                <span>목표 종류</span>
                <strong>3종</strong>
              </ManualHeroStat>
            </ManualHeroStats>
            <ManualInlineActions>
              <IconButton as={Link} href="/habit-tracker/manage" $tone="primary">
                <Plus size={16} />
                항목 만들기
              </IconButton>
              <IconButton as={Link} href="/habit-tracker/stats" $tone="ghost">
                <BarChart3 size={16} />
                통계 보기
              </IconButton>
            </ManualInlineActions>
          </ManualHeroCopy>

          <ManualVisualFrame role="img" aria-label="습관 트래커 화면 구성 미리보기">
            <ManualMockToolbar>
              <span>기록</span>
              <span>통계</span>
              <span>관리</span>
              <span>설명서</span>
            </ManualMockToolbar>
            <ManualMockLayout>
              <ManualMockSide>
                <ManualMockSideRow $color="#eef5f0" $active>전체 <b>{orderedHabits.length}</b></ManualMockSideRow>
                <ManualMockSideRow $color="#42d392">건강 <b>3</b></ManualMockSideRow>
                <ManualMockSideRow $color="#63b3ff">운동 <b>2</b></ManualMockSideRow>
                <ManualMockSideRow $color="#f8c64e">공부 <b>4</b></ManualMockSideRow>
              </ManualMockSide>
              <ManualMockMain>
                <ManualMockDateRail>
                  <span>월<br />42%</span>
                  <span>화<br />65%</span>
                  <span>오늘<br />86%</span>
                  <span>목<br />0%</span>
                  <span>금<br />0%</span>
                </ManualMockDateRail>
                <ManualMockCardGrid>
                  <ManualMockCard $color="#42d392">
                    <strong>물 마시기</strong>
                    <ManualMockProgress $percent={100} $color="#42d392" />
                    <ModePill $color="#42d392"><SquareCheckBig size={12} /> 완료</ModePill>
                  </ManualMockCard>
                  <ManualMockCard $color="#63b3ff">
                    <strong>러닝</strong>
                    <ManualMockProgress $percent={74} $color="#63b3ff" />
                    <ModePill $color="#63b3ff"><Timer size={12} /> 3.7km · 22분</ModePill>
                  </ManualMockCard>
                </ManualMockCardGrid>
              </ManualMockMain>
            </ManualMockLayout>
          </ManualVisualFrame>
        </ManualHero>

        <ManualSection id="manual-start">
          <ManualSectionHeader>
            <ManualPill $color="#42d392"><Check size={14} /> 처음 시작</ManualPill>
            <h3>처음 쓰는 순서</h3>
            <p>먼저 습관 상자를 만들고, 그 안에 매일 할 일을 넣습니다. 그다음 기록 화면에서 오늘 한 일을 표시하고, 통계 화면에서 얼마나 꾸준히 했는지 봅니다.</p>
          </ManualSectionHeader>
          <ManualStepList>
            <ManualStepItem $color="#42d392">
              <strong>1. 로그인해서 내 기록장 준비하기</strong>
              <span>Google로 로그인하면 내 습관 기록장이 만들어집니다. 로그인 전에는 설명서만 볼 수 있고 기록은 저장되지 않습니다.</span>
            </ManualStepItem>
            <ManualStepItem $color="#63b3ff">
              <strong>2. 관리 화면에서 습관 만들기</strong>
              <span>건강, 운동, 공부 같은 카테고리를 만들고, 그 안에 물 마시기, 독서 20분 같은 항목을 넣습니다.</span>
            </ManualStepItem>
            <ManualStepItem $color="#f8c64e">
              <strong>3. 기록 화면에서 오늘의 루틴 입력</strong>
              <span>오늘 날짜를 고른 뒤 한 일을 표시합니다. 했으면 체크하고, 시간이 있으면 몇 분인지, 횟수가 있으면 몇 번인지 적습니다.</span>
            </ManualStepItem>
            <ManualStepItem $color="#ff7a59">
              <strong>4. 통계 화면에서 점수표 보기</strong>
              <span>이번 주에 잘한 습관과 빠진 습관을 봅니다. 목표가 너무 어렵다면 다음 주에는 조금 쉽게 바꿉니다.</span>
            </ManualStepItem>
          </ManualStepList>
          <ManualGrid>
            {kidWordGuide.map((item) => (
              <ManualGuideCard key={item.title} $color={item.color}>
                <Info size={22} />
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </ManualGuideCard>
            ))}
          </ManualGrid>
        </ManualSection>

        <ManualSection id="manual-workflow">
          <ManualSectionHeader>
            <ManualPill $color="#2dd4bf"><Activity size={14} /> 전체 운영 흐름</ManualPill>
            <h3>습관 트래커는 네 단계로 씁니다</h3>
            <p>한 번에 완벽하게 하려고 하지 않아도 됩니다. 정하기, 기록하기, 살펴보기, 고치기를 반복하면 습관이 조금씩 자랍니다.</p>
          </ManualSectionHeader>
          <ManualProcessMap>
            {workflowGuide.map((step, index) => (
              <ManualProcessNode key={step.title} $color={step.color}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </div>
              </ManualProcessNode>
            ))}
          </ManualProcessMap>
          <ManualChecklist>
            <strong>처음 만들 때 쉽게 하는 방법</strong>
            <ul>
              <li>카테고리는 건강, 운동, 공부, 마음처럼 짧은 이름으로 만듭니다.</li>
              <li>항목은 한 번에 할 수 있는 작은 행동으로 씁니다. 예: 운동하기보다 산책 20분, 공부하기보다 영어 단어 10개.</li>
              <li>목표는 처음부터 크게 잡지 않습니다. 일주일 동안 자주 성공할 수 있는 작은 목표가 좋습니다.</li>
              <li>했는지만 보면 체크형, 몇 번 했는지 보면 숫자형, 기분이나 집중도는 별점형을 씁니다.</li>
            </ul>
          </ManualChecklist>
        </ManualSection>

        <ManualSection id="manual-sync">
          <ManualSectionHeader>
            <ManualPill $color="#63b3ff"><Save size={14} /> 로그인과 동기화 상태</ManualPill>
            <h3>내 기록장이 저장되는지 먼저 봅니다</h3>
            <p>동기화는 내 기록을 인터넷 저장 공간에 보관하는 일입니다. 상단 상태를 보면 지금 기록해도 되는지, 잠깐 기다려야 하는지 알 수 있습니다.</p>
          </ManualSectionHeader>
          <ManualGrid>
            {syncGuide.map((item) => {
              const SyncIcon = item.icon;
              return (
                <ManualGuideCard key={item.title} $color={item.color}>
                  <SyncIcon size={22} />
                  <h4>{item.title}</h4>
                  <p>{item.body}</p>
                </ManualGuideCard>
              );
            })}
          </ManualGrid>
          <ManualFormula>
            저장 흐름: 로그인 → 기록 불러오기 → 저장 준비 끝 → 기록하기 → 동기화
            <small>인터넷이 느릴 때는 같은 버튼을 여러 번 누르지 말고, 저장 상태가 돌아오는지 잠깐 기다린 뒤 다시 시도합니다.</small>
          </ManualFormula>
        </ManualSection>

        <ManualSection id="manual-buttons">
          <ManualSectionHeader>
            <ManualPill $color="#63b3ff"><Info size={14} /> 상단 버튼</ManualPill>
            <h3>버튼을 누르면 어디로 가나요?</h3>
            <p>기록, 통계, 관리, 설명서 버튼은 화면을 바꾸는 버튼입니다. 동기화 버튼은 지금까지 적은 내용을 저장하는 버튼입니다.</p>
          </ManualSectionHeader>
          <ManualGrid>
            {buttonGuide.map((item) => {
              const GuideIcon = item.icon;
              return (
                <ManualGuideCard key={item.title} $color={item.color}>
                  <GuideIcon size={22} />
                  <h4>{item.title}</h4>
                  <p>{item.body}</p>
                </ManualGuideCard>
              );
            })}
            <ManualGuideCard $color="#a78bfa">
              <BookOpen size={22} />
              <h4>설명서</h4>
              <p>지금 보고 있는 도움말입니다. 버튼 뜻, 기록 방법, 통계 보는 법을 모를 때 다시 읽으면 됩니다.</p>
            </ManualGuideCard>
          </ManualGrid>
        </ManualSection>

        <ManualSection id="manual-daily">
          <ManualSectionHeader>
            <ManualPill $color="#42d392"><Clock3 size={14} /> 하루 사용 예시</ManualPill>
            <h3>하루 기록은 이렇게 하면 쉽습니다</h3>
            <p>기록은 길게 쓰는 숙제가 아닙니다. 한 일을 끝낸 뒤 바로 체크하거나 숫자만 적으면 됩니다.</p>
          </ManualSectionHeader>
          <ManualProcessMap>
            {dailyScenarioGuide.map((step, index) => (
              <ManualProcessNode key={step.title} $color={step.color}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </div>
              </ManualProcessNode>
            ))}
          </ManualProcessMap>
          <ManualChecklist>
            <strong>하루 기록 약속</strong>
            <ul>
              <li>하지 않은 것은 빈칸으로 둡니다. 거짓으로 채우면 나중에 점수표가 헷갈립니다.</li>
              <li>숫자가 정확히 기억나지 않으면 조금 작게 적습니다. 예: 27분인지 30분인지 헷갈리면 25분.</li>
              <li>매일 고치기 어렵다면 목표가 너무 복잡한 것입니다. 체크형이나 선택형으로 단순하게 바꿉니다.</li>
              <li>하루를 놓쳐도 괜찮습니다. 다음 날 다시 기록하면 됩니다.</li>
            </ul>
          </ManualChecklist>
        </ManualSection>

        <ManualSection id="manual-record">
          <ManualSectionHeader>
            <ManualPill $color="#42d392"><CalendarDays size={14} /> 기록 화면</ManualPill>
            <h3>오늘 한 일을 표시하는 화면입니다</h3>
            <p>기록 화면에서는 오늘 날짜를 고르고, 내가 한 습관을 하나씩 표시합니다. 왼쪽에서는 상자를 고르고, 위쪽에서는 날짜를 고릅니다.</p>
          </ManualSectionHeader>
          <ManualSplit>
            <ManualDetailList>
              <ManualDetailRow $color="#42d392">
                <strong>카테고리 필터</strong>
                <span>전체를 누르면 모든 습관이 보이고, 건강이나 공부를 누르면 그 상자에 들어 있는 습관만 보입니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#63b3ff">
                <strong>날짜 레일</strong>
                <span>위쪽 날짜 줄입니다. 화살표로 날짜를 옮기고, 각 날짜의 퍼센트로 그날 얼마나 했는지 바로 볼 수 있습니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#f8c64e">
                <strong>보기 설정: 날짜 / 항목</strong>
                <span>날짜 보기는 오늘 하루를 자세히 적을 때 좋고, 항목 보기는 같은 습관을 여러 날짜로 볼 때 좋습니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#ff7a59">
                <strong>기록 저장 방식</strong>
                <span>체크와 보기는 누르면 바로 저장됩니다. 숫자나 시간은 적은 뒤 입력 칸 밖을 누르거나 저장 버튼을 누르면 저장됩니다.</span>
              </ManualDetailRow>
            </ManualDetailList>
            <ManualGrid>
              {recordModeGuide.map(({ mode, detail }) => {
                const meta = MODE_META[mode];
                const ModeIcon = meta.icon;
                const color = mode === 'check' ? '#42d392' : mode === 'cardio' || mode === 'strength' ? '#63b3ff' : mode === 'rating' ? '#f8c64e' : '#2dd4bf';
                return (
                  <ManualGuideCard key={mode} $color={color}>
                    <ModeIcon size={21} />
                    <h4>{meta.label}</h4>
                    <p>{detail}</p>
                  </ManualGuideCard>
                );
              })}
            </ManualGrid>
          </ManualSplit>
        </ManualSection>

        <ManualSection id="manual-mobile">
          <ManualSectionHeader>
            <ManualPill $color="#2dd4bf"><Settings2 size={14} /> 모바일과 보기 설정</ManualPill>
            <h3>휴대폰에서는 더 짧게 보고 빠르게 누릅니다</h3>
            <p>휴대폰 화면은 작아서 한 번에 모든 내용이 보이지 않습니다. 날짜 보기와 항목 보기를 바꾸면 더 쉽게 기록할 수 있습니다.</p>
          </ManualSectionHeader>
          <ManualGrid>
            {mobileUsageGuide.map((item) => (
              <ManualGuideCard key={item.title} $color={item.color}>
                <Settings2 size={22} />
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </ManualGuideCard>
            ))}
          </ManualGrid>
          <ManualFormula>
            날짜 보기 = 오늘 자세히 기록, 항목 보기 = 같은 습관을 여러 날짜로 보기
            <small>휴대폰에서 습관이 많으면 먼저 건강, 운동, 공부 같은 카테고리를 고른 뒤 입력하면 더 빨리 찾을 수 있습니다.</small>
          </ManualFormula>
        </ManualSection>

        <ManualSection id="manual-record-modes">
          <ManualSectionHeader>
            <ManualPill $color="#2dd4bf"><ListPlus size={14} /> 기록 방식 선택 가이드</ManualPill>
            <h3>습관마다 알맞은 기록 방법을 고릅니다</h3>
            <p>모든 습관을 같은 방법으로 적을 필요는 없습니다. 했는지만 보면 체크, 시간을 보면 시간, 몇 번 했는지 보면 숫자를 고릅니다.</p>
          </ManualSectionHeader>
          <ManualSpecGrid>
            {recordModeDeepGuide.map((guide) => {
              const meta = MODE_META[guide.mode];
              const ModeIcon = meta.icon;
              return (
                <ManualGuideCard key={guide.mode} $color={guide.color}>
                  <ModeIcon size={22} />
                  <h4>{meta.label}</h4>
                  <dl>
                    <div>
                      <dt>언제 쓰나요?</dt>
                      <dd>{guide.bestFor}</dd>
                    </div>
                    <div>
                      <dt>무엇을 남기나요?</dt>
                      <dd>{guide.savedData}</dd>
                    </div>
                    <div>
                      <dt>점수 기준</dt>
                      <dd>{guide.scoreRule}</dd>
                    </div>
                    <div>
                      <dt>조심할 점</dt>
                      <dd>{guide.caution}</dd>
                    </div>
                  </dl>
                </ManualGuideCard>
              );
            })}
          </ManualSpecGrid>
        </ManualSection>

        <ManualSection id="manual-stats">
          <ManualSectionHeader>
            <ManualPill $color="#63b3ff"><BarChart3 size={14} /> 통계 화면</ManualPill>
            <h3>통계 화면은 내 습관 점수표입니다</h3>
            <p>통계에서는 내가 얼마나 꾸준히 했는지, 어떤 습관을 잘하고 있는지, 어떤 습관이 어려운지 볼 수 있습니다.</p>
          </ManualSectionHeader>
          <ManualSplit>
            <ManualChartPreview>
              <ManualChartBars>
                {chartBarData.map((bar, index) => (
                  <ManualChartBar key={`${bar.color}-${index}`} $height={bar.height} $color={bar.color} />
                ))}
              </ManualChartBars>
              <ManualFormula>
                달성률 = 목표에 얼마나 가까이 갔는지 보여주는 점수
                <small>100%는 목표를 다 했다는 뜻입니다. 100%를 넘으면 목표보다 더 많이 한 날이라는 뜻입니다.</small>
              </ManualFormula>
            </ManualChartPreview>
            <ManualDetailList>
              <ManualDetailRow $color="#42d392">
                <strong>주별 / 월별 전환</strong>
                <span>주별은 이번 주 모습을 보고, 월별은 한 달 동안 꾸준했는지 볼 때 씁니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#63b3ff">
                <strong>항목별 기록 통계</strong>
                <span>습관 하나를 고르면 그 습관의 점수와 실제 숫자를 볼 수 있습니다. 예: 독서 시간, 물 마신 잔 수, 달린 거리.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#f8c64e">
                <strong>기록 히스토리</strong>
                <span>전에 적은 기록을 날짜별로 모아 보여줍니다. 잘못 적은 날은 눌러서 고칠 수 있습니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#ff7a59">
                <strong>CSV / JSON 백업</strong>
                <span>기록을 파일로 보관하는 기능입니다. CSV는 표 파일, JSON은 전체 기록장을 저장하는 파일입니다.</span>
              </ManualDetailRow>
            </ManualDetailList>
          </ManualSplit>
        </ManualSection>

        <ManualSection id="manual-stats-read">
          <ManualSectionHeader>
            <ManualPill $color="#63b3ff"><Flame size={14} /> 통계 해석</ManualPill>
            <h3>점수표를 읽는 쉬운 방법</h3>
            <p>점수만 보고 좋다, 나쁘다를 바로 정하지 않습니다. 기록한 날짜, 실제 숫자, 카테고리를 같이 보면 더 정확합니다.</p>
          </ManualSectionHeader>
          <ManualSpecGrid>
            {statsDetailGuide.map((item) => (
              <ManualGuideCard key={item.title} $color={item.color}>
                <Activity size={22} />
                <h4>{item.title}</h4>
                <p>{item.detail}</p>
              </ManualGuideCard>
            ))}
          </ManualSpecGrid>
          <ManualFormula>
            보는 순서: 기록한 날짜 → 기록한 습관 수 → 달성률 → 실제 숫자 → 카테고리 균형
            <small>먼저 꾸준히 적었는지 봅니다. 그다음 목표를 채웠는지 보면 원인을 더 쉽게 찾을 수 있습니다.</small>
          </ManualFormula>
        </ManualSection>

        <ManualSection id="manual-manage">
          <ManualSectionHeader>
            <ManualPill $color="#f8c64e"><Tags size={14} /> 관리 화면</ManualPill>
            <h3>습관 상자와 할 일을 만드는 곳입니다</h3>
            <p>관리 화면에서는 카테고리라는 상자를 만들고, 그 안에 매일 할 작은 습관을 넣습니다. 색상은 기록 화면과 통계 화면에서도 같이 보입니다.</p>
          </ManualSectionHeader>
          <ManualGrid>
            <ManualGuideCard $color="#42d392">
              <ListPlus size={22} />
              <h4>빠른 시작 프리셋</h4>
              <p>처음부터 모두 만들기 어렵다면 예시 습관을 한 번에 넣어볼 수 있습니다. 마음에 들지 않는 항목은 나중에 고치면 됩니다.</p>
            </ManualGuideCard>
            <ManualGuideCard $color="#63b3ff">
              <Target size={22} />
              <h4>항목 이름과 목표</h4>
              <p>항목 이름은 물 8잔, 독서 20분처럼 짧게 씁니다. 목표는 하루에 실제로 할 수 있는 숫자로 정합니다.</p>
            </ManualGuideCard>
            <ManualGuideCard $color="#f8c64e">
              <Tags size={22} />
              <h4>카테고리 색상과 순번</h4>
              <p>색상은 상자를 구분하는 표시입니다. 순번은 화면에 보이는 순서입니다. 자주 보는 습관은 앞쪽에 두면 편합니다.</p>
            </ManualGuideCard>
            <ManualGuideCard $color="#ff7a59">
              <Trash2 size={22} />
              <h4>삭제 주의</h4>
              <p>습관이나 카테고리를 지우면 그동안 적은 기록도 같이 지워질 수 있습니다. 지우기 전에는 꼭 한 번 더 확인합니다.</p>
            </ManualGuideCard>
          </ManualGrid>
        </ManualSection>

        <ManualSection id="manual-manage-fields">
          <ManualSectionHeader>
            <ManualPill $color="#f8c64e"><Pencil size={14} /> 관리 화면 상세</ManualPill>
            <h3>습관을 만들 때 무엇을 적어야 하나요?</h3>
            <p>습관 이름, 순서, 목표, 단위를 쉽게 적으면 매일 기록하기도 쉽고 나중에 점수표도 이해하기 쉽습니다.</p>
          </ManualSectionHeader>
          <ManualSplit>
            <ManualDetailList>
              <ManualDetailRow $color="#42d392">
                <strong>항목 이름</strong>
                <span>매일 할 일을 짧게 씁니다. 좋은 예: 물 8잔, 산책 20분, 영어 단어 10개. 너무 넓은 이름인 건강관리, 공부하기는 피합니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#63b3ff">
                <strong>순번</strong>
                <span>화면에 보이는 순서입니다. 아침에 하는 습관은 앞쪽, 저녁에 하는 습관은 뒤쪽에 두면 찾기 쉽습니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#f8c64e">
                <strong>목표와 단위</strong>
                <span>목표 숫자와 단위를 같이 적습니다. 예: 30분, 5km, 8잔, 3세트. 숫자만 적으면 무엇을 뜻하는지 헷갈릴 수 있습니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#ff7a59">
                <strong>수정 저장</strong>
                <span>목표를 바꾸면 앞으로 보이는 점수도 달라질 수 있습니다. 큰 변경을 하기 전에는 지금 기록을 한 번 확인합니다.</span>
              </ManualDetailRow>
            </ManualDetailList>
            <ManualChecklist>
              <strong>카테고리를 쉽게 만드는 기준</strong>
              <ul>
                <li>카테고리는 너무 많지 않게 만듭니다. 건강, 운동, 공부, 마음 정도면 시작하기 쉽습니다.</li>
                <li>색상은 뜻을 정해 둡니다. 예: 건강은 초록, 운동은 파랑, 조심할 항목은 주황.</li>
                <li>한 카테고리에 습관이 너무 많으면 둘로 나눕니다.</li>
                <li>카테고리를 지우기 전에는 안에 어떤 습관이 들어 있는지 먼저 봅니다.</li>
              </ul>
            </ManualChecklist>
          </ManualSplit>
        </ManualSection>

        <ManualSection id="manual-goals">
          <ManualSectionHeader>
            <ManualPill $color="#a78bfa"><Settings2 size={14} /> 고급 목표 설정</ManualPill>
            <h3>목표를 더 자세히 정하고 싶을 때 씁니다</h3>
            <p>대부분은 기본 목표만 써도 충분합니다. 하지만 적을수록 좋은 목표, 정해진 범위 안에 있어야 좋은 목표, 운동처럼 숫자가 여러 개인 목표는 고급 목표를 쓰면 됩니다.</p>
          </ManualSectionHeader>
          <ManualGrid>
            <ManualGuideCard $color="#42d392">
              <TrendingUp size={22} />
              <h4>올리기</h4>
              <p>많을수록 좋은 목표입니다. 예: 독서 30분 이상, 물 8잔 이상, 달리기 1km 이상.</p>
            </ManualGuideCard>
            <ManualGuideCard $color="#ff7a59">
              <Gauge size={22} />
              <h4>낮추기</h4>
              <p>적을수록 좋은 목표입니다. 예: 스마트폰 60분 이하, 야식 0회, 카페인 1잔 이하.</p>
            </ManualGuideCard>
            <ManualGuideCard $color="#f8c64e">
              <Target size={22} />
              <h4>범위 유지</h4>
              <p>너무 적어도, 너무 많아도 좋지 않을 때 씁니다. 예: 수면 7~8시간, 공부 난이도 3~4점.</p>
            </ManualGuideCard>
            <ManualGuideCard $color="#63b3ff">
              <Activity size={22} />
              <h4>지표별 목표</h4>
              <p>운동처럼 숫자가 여러 개일 때 씁니다. 예: 달리기는 거리와 시간, 근력 운동은 무게와 횟수를 따로 봅니다.</p>
            </ManualGuideCard>
          </ManualGrid>
          <ManualFormula>
            기준값은 출발점, 목표값은 도착점입니다.
            <small>예: 독서가 지금 20분이고 목표가 40분이면, 30분을 읽은 날은 절반쯤 좋아진 것으로 볼 수 있습니다.</small>
          </ManualFormula>
          <ManualSpecGrid>
            {goalExampleGuide.map((item) => (
              <ManualGuideCard key={item.title} $color={item.color}>
                <Target size={22} />
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </ManualGuideCard>
            ))}
          </ManualSpecGrid>
          <ManualChecklist>
            <strong>고급 목표가 필요한 경우</strong>
            <ul>
              <li>많을수록 좋은 습관과 적을수록 좋은 습관이 섞여 있을 때</li>
              <li>목표가 한 숫자가 아니라 7~8시간처럼 범위일 때</li>
              <li>달리기나 근력 운동처럼 숫자를 여러 개 적어야 할 때</li>
              <li>평균, 합계, 최고 기록처럼 통계를 더 자세히 보고 싶을 때</li>
            </ul>
          </ManualChecklist>
        </ManualSection>

        <ManualSection id="manual-backup">
          <ManualSectionHeader>
            <ManualPill $color="#ff7a59"><Download size={14} /> 백업과 삭제</ManualPill>
            <h3>기록을 지우기 전에는 꼭 확인합니다</h3>
            <p>습관을 지우면 그동안 적은 날짜별 기록도 함께 지워질 수 있습니다. 중요한 기록은 파일로 보관한 뒤 정리하는 것이 안전합니다.</p>
          </ManualSectionHeader>
          <ManualSplit>
            <ManualChecklist>
              <strong>지우기 전 확인할 것</strong>
              <ul>
                {backupChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </ManualChecklist>
            <ManualDetailList>
              <ManualDetailRow $color="#42d392">
                <strong>CSV 내보내기</strong>
                <span>기록을 표 모양 파일로 저장합니다. 날짜, 습관 이름, 숫자, 달성률을 한눈에 볼 수 있습니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#63b3ff">
                <strong>JSON 백업</strong>
                <span>전체 기록장을 통째로 보관하는 파일입니다. 큰 정리를 하기 전에 내려받으면 안전합니다.</span>
              </ManualDetailRow>
              <ManualDetailRow $color="#ff7a59">
                <strong>동기화 버튼</strong>
                <span>지금 적은 내용을 인터넷 저장 공간에 저장합니다. 로그인하지 않았거나 저장 중일 때는 버튼을 누를 수 없습니다.</span>
              </ManualDetailRow>
            </ManualDetailList>
          </ManualSplit>
        </ManualSection>

        <ManualSection id="manual-ops">
          <ManualSectionHeader>
            <ManualPill $color="#2dd4bf"><Trophy size={14} /> 운영 점검</ManualPill>
            <h3>오래 쓰기 쉬운 습관장으로 만드는 기준</h3>
            <p>좋은 습관장은 복잡하지 않아야 합니다. 매일 빠르게 기록하고, 가끔 통계를 보며 목표를 조금씩 고치면 됩니다.</p>
          </ManualSectionHeader>
          <ManualGrid>
            <ManualGuideCard $color="#42d392">
              <Check size={22} />
              <h4>입력은 10초 안에 끝나야 합니다</h4>
              <p>자주 쓰는 습관은 체크, 별점, 선택형처럼 빨리 누를 수 있게 만듭니다.</p>
            </ManualGuideCard>
            <ManualGuideCard $color="#63b3ff">
              <Clock3 size={22} />
              <h4>통계는 주 1회만 깊게 봐도 됩니다</h4>
              <p>매일은 기록만 하고, 주말에 통계를 봅니다. 다음 주 목표를 조금 쉽게 또는 조금 어렵게 바꿉니다.</p>
            </ManualGuideCard>
            <ManualGuideCard $color="#f8c64e">
              <Download size={22} />
              <h4>큰 수정 전에는 백업합니다</h4>
              <p>카테고리나 습관을 많이 지우기 전에는 JSON 백업으로 전체 기록장을 보관합니다.</p>
            </ManualGuideCard>
          </ManualGrid>
        </ManualSection>

        <ManualSection id="manual-faq">
          <ManualSectionHeader>
            <ManualPill $color="#42d392"><Info size={14} /> 문제 해결</ManualPill>
            <h3>자주 헷갈리는 질문</h3>
            <p>처음 사용할 때 많이 헷갈리는 상황을 쉬운 말로 정리했습니다.</p>
          </ManualSectionHeader>
          <ManualSpecGrid>
            {faqGuide.map((item) => (
              <ManualGuideCard key={item.title} $color={item.color}>
                <Info size={22} />
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </ManualGuideCard>
            ))}
          </ManualSpecGrid>
        </ManualSection>
      </ManualShell>
    );
  };

  const renderRecordControl = (habit: HabitItem) => {
    const record = workspace.records[selectedDate]?.[habit.id] ?? {};

    if (habit.mode === 'check') {
      const checked = Boolean(record.checked);
      return (
        <ToggleRecordButton
          type="button"
          $active={checked}
          disabled={controlsDisabled}
          onClick={() => saveRecord(habit.id, { checked: !checked })}
        >
          <CheckBoxMark $active={checked}>
            <Check />
          </CheckBoxMark>
          <span>{checked ? '완료됨' : '박스 체크'}</span>
        </ToggleRecordButton>
      );
    }

    if (habit.mode === 'cardio') {
      return (
        <>
          <MetricInputGrid>
            <FieldLabel>
              1단
              <InputWithUnit>
                <NumberInput
                  min={0}
                  step={0.1}
                  value={record.distance ?? ''}
                  disabled={recordInputDisabled}
                  onChange={(event) => patchRecord(habit.id, { distance: readNumber(event.target.value) })}
                  onBlur={handleRecordInputBlur}
                  onKeyDown={handleRecordInputKeyDown}
                  placeholder={`${habit.target}`}
                />
                <UnitText>{habit.unit}</UnitText>
              </InputWithUnit>
            </FieldLabel>
            <FieldLabel>
              2단
              <InputWithUnit>
                <NumberInput
                  min={0}
                  value={record.minutes ?? ''}
                  disabled={recordInputDisabled}
                  onChange={(event) => patchRecord(habit.id, { minutes: readNumber(event.target.value) })}
                  onBlur={handleRecordInputBlur}
                  onKeyDown={handleRecordInputKeyDown}
                  placeholder={`${habit.secondaryTarget ?? 60}`}
                />
                <UnitText>{habit.secondaryUnit ?? '분'}</UnitText>
              </InputWithUnit>
            </FieldLabel>
          </MetricInputGrid>
          <RecordHint>예: 10km · 60분처럼 2개의 수치를 함께 기록합니다. 현재 {getRecordMetricLabel(habit, record)}</RecordHint>
        </>
      );
    }

    if (habit.mode === 'strength') {
      const strength = getStrengthRecord(record);

      return (
        <>
          <MetricInputGrid>
            <FieldLabel>
              1단
              <InputWithUnit>
                <NumberInput
                  min={0}
                  step={0.5}
                  value={record.load ?? ''}
                  disabled={recordInputDisabled}
                  onChange={(event) => patchRecord(habit.id, { load: readNumber(event.target.value) })}
                  onBlur={handleRecordInputBlur}
                  onKeyDown={handleRecordInputKeyDown}
                  placeholder={`${habit.target}`}
                />
                <UnitText>{habit.unit}</UnitText>
              </InputWithUnit>
            </FieldLabel>
            <FieldLabel>
              2단
              <InputWithUnit>
                <NumberInput
                  min={0}
                  value={record.reps ?? ''}
                  disabled={recordInputDisabled}
                  onChange={(event) => patchRecord(habit.id, { reps: readNumber(event.target.value) })}
                  onBlur={handleRecordInputBlur}
                  onKeyDown={handleRecordInputKeyDown}
                  placeholder={`${habit.secondaryTarget ?? 3}`}
                />
                <UnitText>{habit.secondaryUnit ?? '회'}</UnitText>
              </InputWithUnit>
            </FieldLabel>
            <FieldLabel>
              3단
              <InputWithUnit>
                <NumberInput
                  min={0}
                  value={record.setCount ?? ''}
                  disabled={recordInputDisabled}
                  onChange={(event) => patchRecord(habit.id, { setCount: readNumber(event.target.value) })}
                  onBlur={handleRecordInputBlur}
                  onKeyDown={handleRecordInputKeyDown}
                  placeholder={`${habit.tertiaryTarget ?? 5}`}
                />
                <UnitText>{habit.tertiaryUnit ?? '세트'}</UnitText>
              </InputWithUnit>
            </FieldLabel>
          </MetricInputGrid>
          <RecordHint>
            예: 50kg · 3회 · 5세트처럼 3개의 수치를 함께 기록합니다. 볼륨 {formatCompactNumber(strength.volume, 0)}kg, 총 {formatCompactNumber(strength.totalReps)}회
          </RecordHint>
        </>
      );
    }

    if (habit.mode === 'number') {
      return (
        <>
          <InputWithUnit>
            <NumberInput
              min={0}
              value={record.value ?? ''}
              disabled={recordInputDisabled}
              onChange={(event) => patchRecord(habit.id, { value: readNumber(event.target.value) })}
              onBlur={handleRecordInputBlur}
              onKeyDown={handleRecordInputKeyDown}
              placeholder={`${habit.target}`}
            />
            <UnitText>{habit.unit}</UnitText>
          </InputWithUnit>
          <QuickRow>
            {[1, 3, 5].map((amount) => (
              <IconButton
                type="button"
                key={amount}
                $tone="ghost"
                disabled={controlsDisabled}
                onClick={() => saveRecord(habit.id, { value: (record.value ?? 0) + amount })}
                title={`${amount}${habit.unit} 더하기`}
              >
                <Plus size={14} />
                {amount}
              </IconButton>
            ))}
          </QuickRow>
        </>
      );
    }

    if (habit.mode === 'sets') {
      const sets = record.sets ?? [];

      return (
        <>
          <SetList>
            {sets.map((entry, index) => (
              <SetRow key={entry.id}>
                <SetIndex>{index + 1}</SetIndex>
                <NumberInput
                  min={0}
                  value={entry.reps || ''}
                  placeholder="횟수"
                  disabled={recordInputDisabled}
                  onChange={(event) => {
                    const nextSets = sets.map((setEntry, setIndex) =>
                      setIndex === index ? { ...setEntry, reps: readNumber(event.target.value) ?? 0 } : setEntry,
                    );
                    patchRecord(habit.id, { sets: nextSets });
                  }}
                  onBlur={handleRecordInputBlur}
                  onKeyDown={handleRecordInputKeyDown}
                />
                <NumberInput
                  min={0}
                  value={entry.load || ''}
                  placeholder="중량"
                  disabled={recordInputDisabled}
                  onChange={(event) => {
                    const nextSets = sets.map((setEntry, setIndex) =>
                      setIndex === index ? { ...setEntry, load: readNumber(event.target.value) ?? 0 } : setEntry,
                    );
                    patchRecord(habit.id, { sets: nextSets });
                  }}
                  onBlur={handleRecordInputBlur}
                  onKeyDown={handleRecordInputKeyDown}
                />
                <IconOnlyButton
                  type="button"
                  $tone="danger"
                  disabled={controlsDisabled}
                  onClick={() => saveRecord(habit.id, { sets: sets.filter((_, setIndex) => setIndex !== index) })}
                  title="세트 삭제"
                  aria-label={`${index + 1}세트 삭제`}
                >
                  <Minus size={16} />
                </IconOnlyButton>
              </SetRow>
            ))}
          </SetList>
          <IconButton
            type="button"
            $tone="warm"
            disabled={controlsDisabled}
            onClick={() =>
              saveRecord(habit.id, {
                sets: [...sets, { id: makeId('set'), reps: 10, load: 0 }],
              })
            }
          >
            <Plus size={16} />
            세트 추가
          </IconButton>
        </>
      );
    }

    if (habit.mode === 'duration') {
      return (
        <>
          <InputWithUnit>
            <NumberInput
              min={0}
              value={record.minutes ?? ''}
              disabled={recordInputDisabled}
              onChange={(event) => patchRecord(habit.id, { minutes: readNumber(event.target.value) })}
              onBlur={handleRecordInputBlur}
              onKeyDown={handleRecordInputKeyDown}
              placeholder={`${habit.target}`}
            />
            <UnitText>{habit.unit}</UnitText>
          </InputWithUnit>
          <QuickRow>
            {[10, 25, 50].map((amount) => (
              <IconButton
                type="button"
                key={amount}
                $tone="ghost"
                disabled={controlsDisabled}
                onClick={() => saveRecord(habit.id, { minutes: (record.minutes ?? 0) + amount })}
                title={`${amount}분 더하기`}
              >
                <Clock3 size={14} />
                {amount}
              </IconButton>
            ))}
          </QuickRow>
        </>
      );
    }

    if (habit.mode === 'rating') {
      const target = Math.max(habit.target, 5);

      return (
        <RatingRow>
          {Array.from({ length: Math.min(target, 5) }, (_, index) => index + 1).map((rating) => (
            <RatingButton
              type="button"
              key={rating}
              $active={(record.rating ?? 0) >= rating}
              disabled={controlsDisabled}
              onClick={() => saveRecord(habit.id, { rating })}
              title={`${rating}점`}
            >
              <Star size={18} fill={(record.rating ?? 0) >= rating ? 'currentColor' : 'none'} />
            </RatingButton>
          ))}
        </RatingRow>
      );
    }

    if (isChoiceMode(habit.mode)) {
      const options = getHabitChoiceOptions(habit);
      const selectedIds = getSelectedOptionIds(habit, record);
      const isSingle = habit.mode === 'singleChoice';

      if (options.length === 0) {
        return <RecordHint>항목 수정에서 선택 항목을 먼저 추가해주세요.</RecordHint>;
      }

      return (
        <>
          <ChoiceGrid>
            {options.map((option) => {
              const active = selectedIds.includes(option.id);
              return (
                <ChoiceButton
                  type="button"
                  key={option.id}
                  $active={active}
                  $mode={isSingle ? 'single' : 'multi'}
                  disabled={controlsDisabled}
                  onClick={() => {
                    if (isSingle) {
                      saveRecord(habit.id, {
                        selectedOptionId: active ? undefined : option.id,
                        selectedOptionIds: undefined,
                      });
                      return;
                    }

                    const nextIds = active
                      ? selectedIds.filter((id) => id !== option.id)
                      : [...selectedIds, option.id];
                    saveRecord(habit.id, {
                      selectedOptionIds: nextIds,
                      selectedOptionId: undefined,
                    });
                  }}
                  title={option.label}
                >
                  <Check size={16} />
                  <span>{option.label}</span>
                </ChoiceButton>
              );
            })}
          </ChoiceGrid>
          <RecordHint>
            {isSingle
              ? '단일선택은 하루에 하나만 체크됩니다.'
              : `중복선택은 여러 항목을 함께 체크할 수 있습니다. 현재 ${selectedIds.length}/${options.length}개 선택`}
          </RecordHint>
        </>
      );
    }

    return (
      <RecordHint>기존 메모 기록 방식입니다. 항목 수정에서 단일선택 또는 중복선택으로 변경해서 사용해주세요.</RecordHint>
    );
  };

  return (
    <Page id="content-area">
      <Shell>
        <HeaderBand>
          <HeaderCopy>
            <Eyebrow>
              <Activity size={16} />
              DAILY OPERATING SYSTEM
            </Eyebrow>
            <Title>습관 트래커</Title>
            <Description>
              프리셋으로 빠르게 만들고, 오늘 해야 할 습관만 날짜별로 체크합니다.
            </Description>
          </HeaderCopy>

          <HeaderActions>
            <ViewTabs aria-label="습관 트래커 화면">
              <ViewTab href="/habit-tracker" $active={initialView === 'daily'}>
                <CalendarDays size={15} />
                기록
              </ViewTab>
              <ViewTab href="/habit-tracker/stats" $active={initialView === 'stats'}>
                <BarChart3 size={15} />
                통계
              </ViewTab>
              <ViewTab href="/habit-tracker/manage" $active={initialView === 'manage'}>
                <Tags size={15} />
                관리
              </ViewTab>
              <ViewTab href="/habit-tracker/manual" $active={initialView === 'manual'}>
                <BookOpen size={15} />
                설명서
              </ViewTab>
            </ViewTabs>
            <SyncPill $state={syncState}>
              {syncState === 'saving' ? <RefreshCcw size={14} /> : <Save size={14} />}
              {syncState === 'locked' ? '로그인 필요' : syncState === 'saving' ? '저장 중' : '저장 준비 끝'}
            </SyncPill>
            <IconButton
              type="button"
              $tone="primary"
              onClick={() => void persistWorkspace(workspace, '현재 습관 기록이 저장되었습니다.', 'habit-manual-save')}
              disabled={!currentUser || !hasLoaded || isSaving}
            >
              <Save size={16} />
              동기화
            </IconButton>
          </HeaderActions>
        </HeaderBand>

        {initialView !== 'manual' && !currentUser ? (
          <GatePanel>
            <GateContent>
              <LogIn size={42} />
              <h2>로그인 후 습관 데이터를 저장합니다</h2>
              <p>카테고리, 항목, 날짜별 기록과 통계를 내 계정 기록장에 저장합니다.</p>
              <IconButton type="button" $tone="primary" onClick={() => void handleLogin()} disabled={!isConfigured || authLoading}>
                <LogIn size={16} />
                Google 로그인
              </IconButton>
              {!isConfigured ? <PanelHint>Firebase 환경 설정이 필요합니다.</PanelHint> : null}
            </GateContent>
          </GatePanel>
        ) : initialView !== 'manual' && !hasLoaded ? (
          <GatePanel>
            <GateContent>
              <RefreshCcw size={42} />
              <h2>저장된 기록을 불러오는 중</h2>
              <p>전에 만든 카테고리, 항목, 날짜별 기록을 가져오고 있습니다.</p>
            </GateContent>
          </GatePanel>
        ) : (
          <>
        {initialView !== 'daily' ? (
          <MetricGrid>
            {initialView === 'manual' ? (
              <>
                <MetricTile>
                  <MetricTop>
                    <span>설명 섹션</span>
                    <MetricIcon $color="#42d392">
                      <BookOpen size={17} />
                    </MetricIcon>
                  </MetricTop>
                  <MetricValue>16개</MetricValue>
                  <MetricSub>시작, 버튼, 기록 방법, 점수표, 저장 파일까지 쉬운 말로 설명</MetricSub>
                </MetricTile>
                <MetricTile>
                  <MetricTop>
                    <span>기록 방식</span>
                    <MetricIcon $color="#63b3ff">
                      <ListPlus size={17} />
                    </MetricIcon>
                  </MetricTop>
                  <MetricValue>{SELECTABLE_RECORD_MODES.length}개</MetricValue>
                  <MetricSub>체크, 숫자, 시간, 별점, 운동, 보기 고르기 지원</MetricSub>
                </MetricTile>
                <MetricTile>
                  <MetricTop>
                    <span>목표 종류</span>
                    <MetricIcon $color="#f8c64e">
                      <Target size={17} />
                    </MetricIcon>
                  </MetricTop>
                  <MetricValue>3종</MetricValue>
                  <MetricSub>많을수록 좋은 목표, 적을수록 좋은 목표, 알맞은 범위 설명</MetricSub>
                </MetricTile>
                <MetricTile>
                  <MetricTop>
                    <span>기록 보관</span>
                    <MetricIcon $color="#ff7a59">
                      <Download size={17} />
                    </MetricIcon>
                  </MetricTop>
                  <MetricValue>CSV/JSON</MetricValue>
                  <MetricSub>표 파일과 전체 기록장 파일의 차이 설명</MetricSub>
                </MetricTile>
              </>
            ) : (
              <>
                <MetricTile>
                  <MetricTop>
                    <span>{initialView === 'stats' ? `${statsPeriodUnitLabel} 달성률` : '카테고리'}</span>
                    <MetricIcon $color="#42d392">
                      <Target size={17} />
                    </MetricIcon>
                  </MetricTop>
                  <MetricValue>
                    {initialView === 'stats' ? `${activeStats.percent}%` : `${orderedCategories.length}개`}
                  </MetricValue>
                  <MetricSub>
                    {initialView === 'stats'
                      ? `${activeStats.completed}/${activeStats.total}개 기록 슬롯 완료`
                      : '현재 운영 중인 루틴 그룹'}
                  </MetricSub>
                </MetricTile>
                <MetricTile>
                  <MetricTop>
                    <span>{initialView === 'manage' ? '관리 항목' : '기록된 항목'}</span>
                    <MetricIcon $color="#63b3ff">
                      <ListPlus size={17} />
                    </MetricIcon>
                  </MetricTop>
                  <MetricValue>{initialView === 'stats' ? activeStats.touched : orderedHabits.length}</MetricValue>
                  <MetricSub>{initialView === 'stats' ? `${statsRangeLabel} 누적 입력` : '추가·수정·삭제 가능한 전체 항목'}</MetricSub>
                </MetricTile>
                <MetricTile>
                  <MetricTop>
                    <span>{initialView === 'stats' ? '기록한 날짜' : '기록 방식'}</span>
                    <MetricIcon $color="#f8c64e">
                      <TrendingUp size={17} />
                    </MetricIcon>
                  </MetricTop>
                  <MetricValue>{initialView === 'stats' ? `${activeRecordDays}일` : `${activeRecordModeCount}개`}</MetricValue>
                  <MetricSub>{initialView === 'stats' ? `${statsPeriodUnitLabel} 내 기록이 있는 날짜` : '사용 중인 입력 타입 수'}</MetricSub>
                </MetricTile>
                <MetricTile>
                  <MetricTop>
                    <span>{initialView === 'manage' ? '저장 일수' : '최장 연속'}</span>
                    <MetricIcon $color="#ff7a59">
                      <Flame size={17} />
                    </MetricIcon>
                  </MetricTop>
                  <MetricValue>{initialView === 'manage' ? storedRecordDayCount : bestStreak}일</MetricValue>
                  <MetricSub>{initialView === 'manage' ? '기록 데이터가 저장된 날짜' : '선택일에서 끊기지 않은 기록'}</MetricSub>
                </MetricTile>
              </>
            )}
          </MetricGrid>
        ) : null}

        {initialView === 'manual' ? (
          renderManualView()
        ) : (
        <WorkspaceGrid>
          <SidePanel>
            <PanelHeading>
              <div>
                <PanelTitle>{initialView === 'manage' ? '카테고리 관리' : '카테고리'}</PanelTitle>
                <PanelHint>
                  {initialView === 'manage'
                    ? `${orderedCategories.length}개 그룹, ${orderedHabits.length}개 항목 관리`
                    : `${orderedCategories.length}개 그룹, ${orderedHabits.length}개 항목 필터`}
                </PanelHint>
              </div>
            </PanelHeading>

            <CategoryList>
              <CategoryButton
                type="button"
                $active={selectedCategoryId === 'all'}
                $color="#eef5f0"
                onClick={() => setSelectedCategoryId('all')}
              >
                <Tags size={15} />
                <CategoryName>전체</CategoryName>
                <CountBadge>{orderedHabits.length}</CountBadge>
              </CategoryButton>

              {orderedCategories.map((category, categoryIndex) => (
                <CategoryRow key={category.id}>
                  <CategoryButton
                    type="button"
                    $active={selectedCategoryId === category.id}
                    $color={category.color}
                    onClick={() => setSelectedCategoryId(category.id)}
                  >
                    <ColorDot $color={category.color} />
                    <CategoryName>{categoryIndex + 1}. {category.name}</CategoryName>
                    <CountBadge>{habitCountByCategory[category.id] ?? 0}</CountBadge>
                  </CategoryButton>
                  {initialView === 'daily' || initialView === 'manage' ? (
                    <CategoryOrderControls role="group" aria-label={`${category.name} 카테고리 순서 변경`}>
                      <CategoryOrderButton
                        type="button"
                        onClick={() => void handleMoveCategory(category.id, -1)}
                        disabled={controlsDisabled || categoryIndex === 0}
                        title={`${category.name} 위로 이동`}
                        aria-label={`${category.name} 카테고리 위로 이동`}
                      >
                        <ChevronUp size={14} />
                      </CategoryOrderButton>
                      <CategoryOrderButton
                        type="button"
                        onClick={() => void handleMoveCategory(category.id, 1)}
                        disabled={controlsDisabled || categoryIndex === orderedCategories.length - 1}
                        title={`${category.name} 아래로 이동`}
                        aria-label={`${category.name} 카테고리 아래로 이동`}
                      >
                        <ChevronDown size={14} />
                      </CategoryOrderButton>
                    </CategoryOrderControls>
                  ) : null}
                  {initialView === 'manage' ? (
                    <InlineActions>
                      <MicroButton type="button" onClick={() => handleStartEditCategory(category)} disabled={controlsDisabled} title="카테고리 수정">
                        <Pencil size={15} />
                      </MicroButton>
                      <MicroButton
                        type="button"
                        $tone="danger"
                        onClick={() => handleDeleteCategory(category.id)}
                        disabled={controlsDisabled}
                        title="카테고리 삭제"
                      >
                        <Trash2 size={15} />
                      </MicroButton>
                    </InlineActions>
                  ) : null}
                </CategoryRow>
              ))}
            </CategoryList>

            {initialView === 'manage' ? (
              <SidePanelActions>
                <IconButton type="button" $tone="primary" onClick={() => { setManageSection('habits'); resetHabitDraft(); scrollManageComposerIntoView(); }} disabled={controlsDisabled}>
                  <Plus size={16} />
                  새 항목
                </IconButton>
                <IconButton type="button" $tone="ghost" onClick={() => { setManageSection('categories'); resetCategoryDraft(); scrollManageComposerIntoView(); }} disabled={controlsDisabled}>
                  <Tags size={16} />
                  새 카테고리
                </IconButton>
              </SidePanelActions>
            ) : null}
          </SidePanel>

          <MainPanel>
            {initialView === 'manage' ? (
              <>
                <StatsToolbar>
                  <div>
                    <PanelTitle>관리 도구</PanelTitle>
                    <PanelHint>입력 폼을 넓은 작업 영역으로 분리해 항목과 카테고리를 관리합니다.</PanelHint>
                  </div>
                  <ManageTabs aria-label="관리 유형">
                    <ManageTabButton type="button" $active={manageSection === 'habits'} onClick={() => setManageSection('habits')}>
                      <ListPlus size={15} />
                      항목 관리
                    </ManageTabButton>
                    <ManageTabButton type="button" $active={manageSection === 'categories'} onClick={() => setManageSection('categories')}>
                      <Tags size={15} />
                      카테고리 관리
                    </ManageTabButton>
                  </ManageTabs>
                </StatsToolbar>

                <DefaultRecordLayoutPanel>
                  <div>
                    <strong>
                      <Settings2 size={16} />
                      기록 기본 방식
                    </strong>
                    <span>기록 화면에 처음 들어왔을 때 날짜 기준으로 볼지, 항목 기준으로 볼지 선택합니다.</span>
                  </div>
                  <DefaultRecordLayoutActions aria-label="습관 기록 기본 방식 선택">
                    <DefaultRecordLayoutButton
                      type="button"
                      $active={dailyRecordLayout === 'detail'}
                      onClick={() => handleDefaultDailyRecordLayoutChange('detail')}
                      aria-pressed={dailyRecordLayout === 'detail'}
                    >
                      <CalendarDays size={16} />
                      <span>날짜 기록</span>
                    </DefaultRecordLayoutButton>
                    <DefaultRecordLayoutButton
                      type="button"
                      $active={dailyRecordLayout === 'simple'}
                      onClick={() => handleDefaultDailyRecordLayoutChange('simple')}
                      aria-pressed={dailyRecordLayout === 'simple'}
                    >
                      <ListPlus size={16} />
                      <span>항목 기록</span>
                    </DefaultRecordLayoutButton>
                  </DefaultRecordLayoutActions>
                </DefaultRecordLayoutPanel>

                <DangerResetPanel>
                  <div>
                    <strong>
                      <Trash2 size={16} />
                      습관 트래커 초기화
                    </strong>
                    <span>
                      기록만 비우거나, 카테고리 {orderedCategories.length}개와 항목 {orderedHabits.length}개까지 모두 초기화할 수 있습니다.
                    </span>
                  </div>
                  <DangerResetActions>
                    <IconButton
                      type="button"
                      $tone="warm"
                      onClick={() => void handleResetHabitRecords()}
                      disabled={controlsDisabled || !hasHabitRecords}
                      title="카테고리와 습관 항목은 유지하고 날짜별 기록만 초기화"
                    >
                      <CalendarDays size={16} />
                      기록만 초기화
                    </IconButton>
                    <IconButton
                      type="button"
                      $tone="danger"
                      onClick={() => void handleResetHabitTrackerData()}
                      disabled={controlsDisabled || !hasHabitTrackerData}
                      title="카테고리, 습관 항목, 날짜별 기록 전체 초기화"
                    >
                      <RefreshCcw size={16} />
                      전체 초기화
                    </IconButton>
                  </DangerResetActions>
                </DangerResetPanel>

                {manageSection === 'habits' ? (
                  <>
                    <ManageComposer id="habit-manage-composer">{renderHabitForm()}</ManageComposer>
                    <StatsToolbar>
                      <div>
                        <PanelTitle>{activeCategory?.name ?? '전체'} 항목 목록</PanelTitle>
                        <PanelHint>{visibleHabits.length}개 항목 · 위/아래 버튼으로 카테고리 안의 순서를 바꿉니다.</PanelHint>
                      </div>
                      <RangeNavigator>
                        {editingHabitId ? (
                          <IconButton type="button" $tone="ghost" onClick={resetHabitDraft} disabled={controlsDisabled}>
                            <X size={16} />
                            편집 취소
                          </IconButton>
                        ) : null}
                        <IconButton type="button" $tone="primary" onClick={() => { resetHabitDraft(); scrollManageComposerIntoView(); }} disabled={controlsDisabled}>
                          <Plus size={16} />
                          새 항목
                        </IconButton>
                      </RangeNavigator>
                    </StatsToolbar>

                    {visibleHabits.length > 0 ? (
                      <ManageListGrid>
                        {visibleHabits.map((habit) => {
                          const category = categoryById.get(habit.categoryId);
                          const color = category?.color ?? '#42d392';
                          const meta = MODE_META[habit.mode];
                          const ModeIcon = meta.icon;
                          const recordCount = recordCountByHabit[habit.id] ?? 0;
                          const categoryLabel = category ? `${categoryDisplayOrderById.get(category.id) ?? category.order}. ${category.name}` : '카테고리 없음';
                          const habitPosition = habitDisplayOrderById.get(habit.id);
                          const habitDisplayOrder = habitPosition?.order ?? normalizeSortOrder(habit.order, 1);
                          const canMoveHabitUp = Boolean(habitPosition && habitPosition.order > 1);
                          const canMoveHabitDown = Boolean(habitPosition && habitPosition.order < habitPosition.total);

                          return (
                            <HabitCard key={habit.id} $color={color}>
                              <HabitCategoryBand $color={color}>
                                <span>{categoryLabel}</span>
                                <small>항목 #{habitDisplayOrder}</small>
                              </HabitCategoryBand>
                              <ProgressTrack>
                                <ProgressFill $percent={100} $color={color} />
                              </ProgressTrack>
                              <HabitCardHead>
                                <div>
                                  <HabitName>{habit.name}</HabitName>
                                  <HabitMeta>
                                    <ModePill $color={color}>
                                      <ModeIcon size={13} />
                                      {meta.label}
                                    </ModePill>
                                    <OrderBadge>순번 {habitDisplayOrder}</OrderBadge>
                                    <span>목표 {getHabitTargetLabel(habit)}</span>
                                    {isTrendGoalMode(habit.mode) ? <span>{GOAL_DIRECTION_META[getHabitGoalDirection(habit)].label}</span> : null}
                                    <span>기록 {recordCount}일</span>
                                  </HabitMeta>
                                </div>
                                <ManageCardActions>
                                  <CategoryOrderControls role="group" aria-label={`${habit.name} 항목 순서 변경`}>
                                    <CategoryOrderButton
                                      type="button"
                                      onClick={() => void handleMoveHabit(habit.id, -1)}
                                      disabled={controlsDisabled || !canMoveHabitUp}
                                      title={`${habit.name} 위로 이동`}
                                      aria-label={`${habit.name} 항목 위로 이동`}
                                    >
                                      <ChevronUp size={14} />
                                    </CategoryOrderButton>
                                    <CategoryOrderButton
                                      type="button"
                                      onClick={() => void handleMoveHabit(habit.id, 1)}
                                      disabled={controlsDisabled || !canMoveHabitDown}
                                      title={`${habit.name} 아래로 이동`}
                                      aria-label={`${habit.name} 항목 아래로 이동`}
                                    >
                                      <ChevronDown size={14} />
                                    </CategoryOrderButton>
                                  </CategoryOrderControls>
                                  <IconButton type="button" $tone="ghost" onClick={() => handleStartEditHabit(habit)} disabled={controlsDisabled}>
                                    <Pencil size={16} />
                                    수정
                                  </IconButton>
                                  <IconButton type="button" $tone="danger" onClick={() => handleDeleteHabit(habit.id)} disabled={controlsDisabled}>
                                    <Trash2 size={16} />
                                    삭제
                                  </IconButton>
                                </ManageCardActions>
                              </HabitCardHead>
                              <ControlArea>
                                <RecordHint>
                                  {isChoiceMode(habit.mode)
                                    ? `${getHabitChoiceOptions(habit).length}개 선택지`
                                    : `${MODE_META[habit.mode].label} · ${getHabitTargetLabel(habit)}`}
                                </RecordHint>
                              </ControlArea>
                            </HabitCard>
                          );
                        })}
                      </ManageListGrid>
                    ) : (
                      <EmptyState>
                        <div>
                          <Trophy size={34} />
                          <p>관리할 항목이 없습니다.</p>
                          {orderedHabits.length === 0 ? (
                            <EmptyStateActions>
                              <IconButton type="button" $tone="primary" onClick={() => void handleCreateStarterPack()} disabled={controlsDisabled}>
                                <Plus size={16} />
                                방식별 예시 추가
                              </IconButton>
                              <IconButton type="button" $tone="ghost" onClick={() => scrollManageComposerIntoView()} disabled={controlsDisabled}>
                                <Pencil size={16} />
                                직접 만들기
                              </IconButton>
                            </EmptyStateActions>
                          ) : null}
                        </div>
                      </EmptyState>
                    )}
                  </>
                ) : (
                  <>
                    <ManageComposer id="habit-manage-composer">{renderCategoryForm()}</ManageComposer>
                    <StatsToolbar>
                      <div>
                        <PanelTitle>카테고리 목록</PanelTitle>
                        <PanelHint>{orderedCategories.length}개 그룹 · 순번이 낮은 카테고리부터 기록 화면에 표시됩니다.</PanelHint>
                      </div>
                      <RangeNavigator>
                        {editingCategoryId ? (
                          <IconButton type="button" $tone="ghost" onClick={resetCategoryDraft} disabled={controlsDisabled}>
                            <X size={16} />
                            편집 취소
                          </IconButton>
                        ) : null}
                        <IconButton type="button" $tone="primary" onClick={() => { resetCategoryDraft(); scrollManageComposerIntoView(); }} disabled={controlsDisabled}>
                          <Plus size={16} />
                          새 카테고리
                        </IconButton>
                      </RangeNavigator>
                    </StatsToolbar>

                    {orderedCategories.length > 0 ? (
                      <CategoryManageGrid>
                        {orderedCategories.map((category) => (
                          <CategoryManageCard key={category.id} $color={category.color}>
                            <CategoryCardTop>
                              <ColorDot $color={category.color} />
                              <div>
                                <CategoryCardName>{category.name}</CategoryCardName>
                                <CategoryCardMeta>순번 {categoryDisplayOrderById.get(category.id) ?? category.order} · {habitCountByCategory[category.id] ?? 0}개 항목</CategoryCardMeta>
                              </div>
                            </CategoryCardTop>
                            <ManageCardActions>
                              <IconButton type="button" $tone="ghost" onClick={() => handleStartEditCategory(category)} disabled={controlsDisabled}>
                                <Pencil size={16} />
                                수정
                              </IconButton>
                              <IconButton type="button" $tone="danger" onClick={() => handleDeleteCategory(category.id)} disabled={controlsDisabled}>
                                <Trash2 size={16} />
                                삭제
                              </IconButton>
                            </ManageCardActions>
                          </CategoryManageCard>
                        ))}
                      </CategoryManageGrid>
                    ) : (
                      <EmptyState>
                        <div>
                          <Trophy size={34} />
                          <p>관리할 카테고리가 없습니다.</p>
                          <EmptyStateActions>
                            <IconButton type="button" $tone="primary" onClick={() => { setManageSection('habits'); scrollManageComposerIntoView(); }} disabled={controlsDisabled}>
                              <Plus size={16} />
                              항목부터 만들기
                            </IconButton>
                          </EmptyStateActions>
                        </div>
                      </EmptyState>
                    )}
                  </>
                )}
              </>
            ) : initialView === 'daily' ? (
              <>
                <DailyHeader>
                  <PanelHeading>
                    <div>
                      <PanelTitle>{activeCategory?.name ?? '전체'} 기록</PanelTitle>
                      <PanelHint>
                        {selectedDayStats.touched}/{selectedDayStats.total}개 입력, 달성률 {selectedDayStats.percent}%
                      </PanelHint>
                    </div>
                    <DailyHeaderActions>
                      <ViewSettingsGroup>
                        <ViewSettingsLabel>
                          <Settings2 size={14} />
                          <span>보기 설정</span>
                        </ViewSettingsLabel>
                        <RecordLayoutSwitch aria-label="기록 보기 설정">
                          <RecordLayoutButton type="button" $active={dailyRecordLayout === 'detail'} onClick={() => handleDailyRecordLayoutChange('detail')}>
                            날짜
                          </RecordLayoutButton>
                          <RecordLayoutButton type="button" $active={dailyRecordLayout === 'simple'} onClick={() => handleDailyRecordLayoutChange('simple')}>
                            항목
                          </RecordLayoutButton>
                        </RecordLayoutSwitch>
                      </ViewSettingsGroup>
                      <IconButton as={Link} href="/habit-tracker/stats" $tone="ghost">
                        <BarChart3 size={16} />
                        전체 기록
                      </IconButton>
                      <IconButton type="button" onClick={() => setSelectedDate(toDateKey(new Date()))}>
                        오늘
                      </IconButton>
                    </DailyHeaderActions>
                  </PanelHeading>
                  <MonthNavigator aria-label="월 이동">
                    <IconOnlyButton type="button" onClick={() => shiftMonth(-1)} title="이전 월" aria-label="이전 월">
                      <ChevronLeft size={17} />
                    </IconOnlyButton>
                    <MonthDisplay>
                      <CalendarDays size={15} />
                      <strong>{selectedMonthLabel}</strong>
                      <span>{formatMonthDay(selectedDate)} 선택</span>
                    </MonthDisplay>
                    <IconOnlyButton type="button" onClick={() => shiftMonth(1)} title="다음 월" aria-label="다음 월">
                      <ChevronRight size={17} />
                    </IconOnlyButton>
                  </MonthNavigator>
                  <DateTools>
                    <IconOnlyButton type="button" onClick={() => shiftDate(-1)} title="이전 날짜" aria-label="이전 날짜">
                      <ChevronLeft size={17} />
                    </IconOnlyButton>
                    <DateRail>
                      {dateRail.map((dateKey) => {
                        const date = parseDateKey(dateKey);
                        const stats = calculateDayStats(workspace, dateKey, visibleHabits);
                        return (
                          <DateButton
                            type="button"
                            key={dateKey}
                            $active={dateKey === selectedDate}
                            $percent={stats.percent}
                            $weekendTone={getWeekendTone(date)}
                            onClick={() => setSelectedDate(dateKey)}
                          >
                            <span>{DATE_LABELS[date.getDay()]}</span>
                            <strong>{date.getDate()}</strong>
                            <small>{stats.percent}%</small>
                          </DateButton>
                        );
                      })}
                    </DateRail>
                    <IconOnlyButton type="button" onClick={() => shiftDate(1)} title="다음 날짜" aria-label="다음 날짜">
                      <ChevronRight size={17} />
                    </IconOnlyButton>
                  </DateTools>
                </DailyHeader>

                {visibleHabits.length > 0 ? (
                  dailyRecordLayout === 'simple' ? (
                    <SimpleLogScroller>
                      <SimpleLogGrid $columns={simpleDateKeys.length} $selectedColumn={simpleSelectedDateIndex}>
                        <SimpleHeaderCell>습관</SimpleHeaderCell>
                        {simpleDateKeys.map((dateKey) => {
                          const date = parseDateKey(dateKey);
                          return (
                            <SimpleDateHeader key={dateKey} $active={dateKey === selectedDate} $weekendTone={getWeekendTone(date)}>
                              <span>{DATE_LABELS[date.getDay()]}</span>
                              <strong>{date.getDate()}</strong>
                            </SimpleDateHeader>
                          );
                        })}

                        {visibleHabits.map((habit) => {
                          const category = categoryById.get(habit.categoryId);
                          const color = category?.color ?? '#42d392';
                          const meta = MODE_META[habit.mode];
                          const categoryLabel = category ? `${categoryDisplayOrderById.get(category.id) ?? category.order}. ${category.name}` : '카테고리 없음';
                          const selectedRecord = workspace.records[selectedDate]?.[habit.id];
                          const selectedScore = Math.round(getRecordScore(habit, selectedRecord) * 100);
                          const habitPosition = habitDisplayOrderById.get(habit.id);
                          const habitDisplayOrder = habitPosition?.order ?? normalizeSortOrder(habit.order, 1);

                          return (
                            <React.Fragment key={habit.id}>
                              <SimpleHabitLabel $color={color}>
                                <SimpleHabitCategoryBand $color={color}>
                                  <span>{categoryLabel}</span>
                                </SimpleHabitCategoryBand>
                                <SimpleHabitBody>
                                  <SimpleProgressRing $percent={selectedScore} $color={color} />
                                  <div>
                                    <strong>{habit.name}</strong>
                                    <small>#{habitDisplayOrder} · {meta.shortLabel}</small>
                                  </div>
                                  {renderHabitOrderControls(habit, true)}
                                </SimpleHabitBody>
                              </SimpleHabitLabel>
                              {simpleDateKeys.map((dateKey) => {
                                const record = workspace.records[dateKey]?.[habit.id];
                                const display = getQuickRecordDisplay(habit, record);
                                return (
                                  <SimpleRecordCell
                                    type="button"
                                    key={`${habit.id}-${dateKey}`}
                                    $active={display.active}
                                    $selected={dateKey === selectedDate}
                                    $color={color}
                                    disabled={controlsDisabled}
                                    onClick={() => {
                                      setSelectedDate(dateKey);
                                      void handleQuickRecord(habit, dateKey);
                                    }}
                                    title={`${habit.name} ${formatMonthDay(dateKey)} 항목 기준 기록`}
                                  >
                                    <strong>{display.value}</strong>
                                    {display.unit ? <span>{display.unit}</span> : null}
                                  </SimpleRecordCell>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </SimpleLogGrid>
                    </SimpleLogScroller>
                  ) : (
                    <HabitGrid>
                      {visibleHabits.map((habit) => {
                        const category = categoryById.get(habit.categoryId);
                        const color = category?.color ?? '#42d392';
                        const meta = MODE_META[habit.mode];
                        const ModeIcon = meta.icon;
                        const record = workspace.records[selectedDate]?.[habit.id];
                        const score = Math.round(getRecordScore(habit, record) * 100);
                        const categoryLabel = category ? `${categoryDisplayOrderById.get(category.id) ?? category.order}. ${category.name}` : '카테고리 없음';
                        const habitPosition = habitDisplayOrderById.get(habit.id);
                        const habitDisplayOrder = habitPosition?.order ?? normalizeSortOrder(habit.order, 1);

                        return (
                          <HabitCard key={habit.id} $color={color}>
                            <HabitCategoryBand $color={color}>
                              <span>{categoryLabel}</span>
                              <small>항목 #{habitDisplayOrder}</small>
                            </HabitCategoryBand>
                            <ProgressTrack>
                              <ProgressFill $percent={score} $color={color} />
                            </ProgressTrack>
                            <HabitCardHead>
                              <div>
                                <HabitName>{habit.name}</HabitName>
                                <HabitMeta>
                                  <ModePill $color={color}>
                                    <ModeIcon size={13} />
                                    {meta.label}
                                  </ModePill>
                                  <OrderBadge>순번 {habitDisplayOrder}</OrderBadge>
                                  <span>목표 {getHabitTargetLabel(habit)}</span>
                                  <span>{getRecordMetricLabel(habit, record)}</span>
                                  <span>{score}%</span>
                                </HabitMeta>
                              </div>
                              {renderHabitOrderControls(habit)}
                            </HabitCardHead>
                            <ControlArea data-record-control>{renderRecordControl(habit)}</ControlArea>
                          </HabitCard>
                        );
                      })}
                    </HabitGrid>
                  )
                ) : (
                  <EmptyState>
                    <div>
                      <Trophy size={34} />
                      <p>선택한 카테고리에 항목이 없습니다.</p>
                      {orderedHabits.length === 0 ? (
                        <EmptyStateActions>
                          <IconButton type="button" $tone="primary" onClick={() => void handleCreateStarterPack()} disabled={controlsDisabled}>
                            <Plus size={16} />
                            방식별 예시 추가
                          </IconButton>
                          <IconButton as={Link} href="/habit-tracker/manage" $tone="ghost">
                            <Pencil size={16} />
                            직접 만들기
                          </IconButton>
                        </EmptyStateActions>
                      ) : null}
                    </div>
                  </EmptyState>
                )}
              </>
            ) : (
              <>
                <HabitStatsDashboard
                  workspace={workspace}
                  hasLoaded={hasLoaded}
                  statsPeriod={statsPeriod}
                  setStatsPeriod={setStatsPeriod}
                  selectedStatsHabitId={selectedStatsHabit?.id ?? ''}
                  setSelectedStatsHabitId={setSelectedStatsHabitId}
                  itemStatsChartMode={itemStatsChartMode}
                  setItemStatsChartMode={setItemStatsChartMode}
                  selectedStatsMetricId={selectedValueMetric?.id ?? selectedStatsMetricId}
                  setSelectedStatsMetricId={setSelectedStatsMetricId}
                  statsRangeLabel={statsRangeLabel}
                  statsPeriodLabel={statsPeriodLabel}
                  statsPeriodUnitLabel={statsPeriodUnitLabel}
                  rangeKeys={rangeKeys}
                  activeRecordDays={activeRecordDays}
                  bestStreak={bestStreak}
                  completionChartData={completionChartData}
                  completionAxisMax={completionAxisMax}
                  categoryChartData={categoryChartData}
                  habitRankData={habitRankData}
                  selectedStatsHabit={selectedStatsHabit}
                  selectedStatsHabitColor={selectedStatsHabitColor}
                  selectedHabitUsesTrendValue={selectedHabitUsesTrendValue}
                  selectedHabitMetricDefinitions={selectedHabitMetricDefinitions}
                  selectedHabitHasMetricBreakdown={selectedHabitHasMetricBreakdown}
                  selectedValueMetric={selectedValueMetric}
                  selectedHabitStats={selectedHabitStats}
                  selectedHabitMetricText={selectedHabitMetricText}
                  selectedHabitStreak={selectedHabitStreak}
                  selectedHabitRecordData={selectedHabitRecordData}
                  selectedHabitChartData={selectedHabitChartData}
                  selectedHabitProgressAxisMax={selectedHabitProgressAxisMax}
                  selectedHabitVisibleRecordRows={selectedHabitVisibleRecordRows}
                  selectedHabitRecordRows={selectedHabitRecordRows}
                  deleteRecordForDate={deleteRecordForDate}
                  handleQuickRecord={handleQuickStatsRecord}
                  handleExportSelectedHabitCsv={handleExportSelectedHabitCsv}
                />
                {false ? (
                  <>
                    <ItemStatsPanel $color={selectedStatsHabitColor}>
                      <ItemStatsHeader>
                        <div>
                          <PanelTitle>항목별 통계</PanelTitle>
                          <PanelHint>{statsRangeLabel} 기준으로 선택한 항목의 달성률과 기록값을 봅니다.</PanelHint>
                        </div>
                        <ItemStatsSelect
                          value={selectedStatsHabit?.id ?? ''}
                          onChange={(event) => setSelectedStatsHabitId(event.target.value)}
                          aria-label="통계를 볼 항목"
                        >
                          {orderedHabits.map((habit) => (
                            <option key={habit.id} value={habit.id}>
                              {habit.name}
                            </option>
                          ))}
                        </ItemStatsSelect>
                        <RangeNavigator>
                          <IconButton type="button" $tone="ghost" onClick={() => setStatsPeriod('weekly')} disabled={statsPeriod === 'weekly'}>
                            주간
                          </IconButton>
                          <IconButton type="button" $tone="ghost" onClick={() => setStatsPeriod('monthly')} disabled={statsPeriod === 'monthly'}>
                            월간
                          </IconButton>
                          <IconButton type="button" $tone="primary" onClick={handleExportSelectedHabitCsv} disabled={!selectedStatsHabit}>
                            <Download size={16} />
                            CSV
                          </IconButton>
                        </RangeNavigator>
                      </ItemStatsHeader>

                      {selectedStatsHabit ? (
                        <>
                          <ItemStatsSummaryGrid>
                            <ItemStatTile>
                              <span>달성률</span>
                              <strong>{selectedHabitHasMetricBreakdown && selectedMetricProgressAverage !== undefined ? selectedMetricProgressAverage : selectedHabitStats.percent}%</strong>
                            </ItemStatTile>
                            <ItemStatTile>
                              <span>기록</span>
                              <strong>{selectedHabitStats.touched}/{selectedHabitStats.total}</strong>
                            </ItemStatTile>
                            <ItemStatTile>
                              <span>요약</span>
                              <strong>{selectedHabitMetricText}</strong>
                            </ItemStatTile>
                            <ItemStatTile>
                              <span>연속</span>
                              <strong>{selectedHabitStreak}일</strong>
                            </ItemStatTile>
                          </ItemStatsSummaryGrid>

                          {selectedHabitMetricSummaries.length > 1 ? (
                            <ItemMetricGrid>
                              {selectedHabitMetricSummaries.map((metric) => (
                                <ItemMetricCard key={metric.id} $color={metric.color}>
                                  <MetricCardTop>
                                    <span>{metric.label}</span>
                                    <MetricDot $color={metric.color} />
                                  </MetricCardTop>
                                  <strong>
                                    {metric.average !== undefined ? `${formatCompactNumber(metric.average)}${metric.unit}` : '기록 없음'}
                                  </strong>
                                  <MiniTrack>
                                    <MiniFill $percent={metric.progress} $color={metric.color} />
                                  </MiniTrack>
                                </ItemMetricCard>
                              ))}
                            </ItemMetricGrid>
                          ) : null}

                          <ItemStatsContentGrid>
                            <div>
                              <ChartTitle>
                                <span>{selectedStatsHabit!.name} 기록 추이</span>
                                <ChartCaption>{itemStatsChartMode === 'value' ? '기록값' : '달성률'} 기준</ChartCaption>
                              </ChartTitle>
                              <RangeNavigator>
                                <IconButton type="button" $tone="ghost" onClick={() => setItemStatsChartMode('progress')} disabled={itemStatsChartMode === 'progress'}>
                                  달성률
                                </IconButton>
                                {selectedHabitUsesTrendValue ? (
                                  <IconButton type="button" $tone="ghost" onClick={() => setItemStatsChartMode('value')} disabled={itemStatsChartMode === 'value'}>
                                    기록값
                                  </IconButton>
                                ) : null}
                                {selectedValueMetric ? (
                                  <ItemStatsSelect
                                    value={selectedValueMetric!.id}
                                    onChange={(event) => setSelectedStatsMetricId(event.target.value)}
                                    aria-label="기록값 지표"
                                  >
                                    {selectedHabitMetricDefinitions.map((metric) => (
                                      <option key={metric.id} value={metric.id}>
                                        {metric.label}
                                      </option>
                                    ))}
                                  </ItemStatsSelect>
                                ) : null}
                              </RangeNavigator>
                              <ItemChartBox>
                                {selectedHabitRecordData.length > 0 ? (
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={selectedHabitRecordData}>
                                      <defs>
                                        <linearGradient id="itemRecordFill" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor={selectedStatsHabitColor} stopOpacity={0.42} />
                                          <stop offset="95%" stopColor={selectedStatsHabitColor} stopOpacity={0.04} />
                                        </linearGradient>
                                      </defs>
                                      <CartesianGrid stroke="rgba(189, 203, 220, 0.1)" vertical={false} />
                                      <XAxis dataKey="dateLabel" tick={{ fill: '#91a0ac', fontSize: 12 }} axisLine={false} tickLine={false} />
                                      <YAxis tick={{ fill: '#91a0ac', fontSize: 12 }} axisLine={false} tickLine={false} />
                                      <Tooltip contentStyle={tooltipStyle} />
                                      {selectedHabitHasMetricBreakdown && itemStatsChartMode === 'progress' ? (
                                        selectedHabitMetricDefinitions.length > 0 ? (
                                          selectedHabitMetricDefinitions.map((metric) => (
                                            <Line
                                              key={metric.id}
                                        dataKey={`metricProgress_${metric.id}`}
                                        name={`${metric.label} 달성률`}
                                        unit="%"
                                        stroke={metric.color}
                                        strokeWidth={metric.contributesToScore === false ? 1.7 : 2.4}
                                        strokeDasharray={metric.contributesToScore === false ? '4 4' : undefined}
                                        dot={false}
                                      />
                                    ))
                                  ) : null
                                ) : (
                                  <Area
                                    type="monotone"
                                    dataKey={selectedHabitUsesTrendValue && itemStatsChartMode === 'value' ? 'value' : 'score'}
                                    name={selectedHabitUsesTrendValue && itemStatsChartMode === 'value' ? '기록값' : '달성률'}
                                    unit={selectedHabitUsesTrendValue && itemStatsChartMode === 'value' ? getQuickRecordUnit(selectedStatsHabit!) : '%'}
                                    stroke={selectedStatsHabitColor}
                                    strokeWidth={3}
                                    fill="url(#itemRecordFill)"
                                  />
                                )}
                                {selectedHabitUsesTrendValue && !selectedHabitHasMetricBreakdown && itemStatsChartMode === 'value' ? (
                                  <Line
                                    type="monotone"
                                    dataKey="movingAverage"
                                    name="7일 평균"
                                    unit={getQuickRecordUnit(selectedStatsHabit!)}
                                    stroke="#f8c64e"
                                    strokeWidth={2}
                                    dot={false}
                                  />
                                ) : null}
                              </ComposedChart>
                            </ResponsiveContainer>
                          ) : (
                            <ChartFallback>통계 준비 중</ChartFallback>
                          )}
                          <ScreenReaderOnly>{chartAccessibilitySummary}</ScreenReaderOnly>
                        </ItemChartBox>
                        <CalculationPanel>
                          <strong><Info size={13} /> 계산 기준</strong>
                          <span>
                            달성률은 선택한 목표 해석과 지표별 통계 방식으로 계산합니다. 목표를 넘기면 100%를 초과하며,
                            총 볼륨처럼 참고 지표로 표시된 값은 평균 달성률에는 넣지 않습니다.
                          </span>
                        </CalculationPanel>
                        <TableDisclosure>
                          <summary>표로 보기</summary>
                          <DataTableWrap>
                            <DataTable>
                              <thead>
                                <tr>
                                  <th>날짜</th>
                                  <th>달성률</th>
                                  <th>기록</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedHabitRecordData.map((point) => (
                                  <tr key={point.dateKey}>
                                    <td>{point.dateKey}</td>
                                    <td>{point.score}%</td>
                                    <td>{point.metricText}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </DataTable>
                          </DataTableWrap>
                        </TableDisclosure>
                      </div>

                      <div>
                        <ChartTitle>
                          <span>기록 히스토리</span>
                          <ChartCaption>입력된 날짜만 표시</ChartCaption>
                        </ChartTitle>
                        <ItemRecordList>
                          {selectedHabitRecordRows.length > 0 ? (
                            selectedHabitVisibleRecordRows.map((point) => (
                              <ItemRecordRow
                                key={point.dateKey}
                                role="button"
                                tabIndex={0}
                                onClick={() => void handleQuickRecord(selectedStatsHabit!, point.dateKey)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    void handleQuickRecord(selectedStatsHabit!, point.dateKey);
                                  }
                                }}
                                title="기록 수정"
                              >
                                <RecordDateBadge>{point.dateLabel}</RecordDateBadge>
                                <div>
                                  <strong>{point.metricText}</strong>
                                  <RankMeta>{point.dateKey} · {point.completed ? '목표 완료' : '진행 기록'}</RankMeta>
                                  {point.score > 100 ? <OverGoalBadge $color={selectedStatsHabitColor}>목표 초과 +{point.score - 100}%</OverGoalBadge> : null}
                                  {selectedHabitHasMetricBreakdown ? (
                                    <MetricInlineList>
                                      {selectedHabitMetricDefinitions.map((metric) => {
                                        const metricPoint = point.metrics[metric.id];
                                        return metricPoint?.value !== undefined ? (
                                          <MetricInlinePill key={metric.id} $color={metric.color}>
                                            {metric.label} {formatCompactNumber(metricPoint.value)}{metric.unit}
                                          </MetricInlinePill>
                                        ) : null;
                                      })}
                                    </MetricInlineList>
                                  ) : null}
                                  <MiniTrack>
                                    <MiniFill $percent={point.score} $color={selectedStatsHabitColor} />
                                  </MiniTrack>
                                </div>
                                <ScoreColumn>
                                  <ScoreValue $color={selectedStatsHabitColor}>{point.score}%</ScoreValue>
                                  <ScoreMeta>달성률</ScoreMeta>
                                  <IconOnlyButton
                                    type="button"
                                    $tone="danger"
                                    title="기록 삭제"
                                    aria-label={`${point.dateLabel} 기록 삭제`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      deleteRecordForDate(point.dateKey, selectedStatsHabit!.id);
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </IconOnlyButton>
                                </ScoreColumn>
                              </ItemRecordRow>
                            ))
                          ) : (
                            <ItemRecordEmpty>선택한 기간에 입력된 기록이 없습니다.</ItemRecordEmpty>
                          )}
                          {selectedHabitRecordRows.length > selectedHabitVisibleRecordRows.length ? (
                            <ItemRecordEmpty>성능을 위해 최근 {HISTORY_ROW_LIMIT}개만 먼저 표시합니다.</ItemRecordEmpty>
                          ) : null}
                        </ItemRecordList>
                      </div>
                    </ItemStatsContentGrid>
                  </>
                ) : (
                  <ItemRecordEmpty>통계를 낼 항목을 먼저 추가해주세요.</ItemRecordEmpty>
                )}
              </ItemStatsPanel>
              <StatsGrid>
                <StatsColumn>
                  <ChartPanel>
                    <ChartTitle>
                      <span>{statsPeriod === 'weekly' ? '최근 12주 달성률' : '최근 12개월 달성률'}</span>
                      <ChartCaption>{statsPeriodLabel} 평균</ChartCaption>
                    </ChartTitle>
                    <ChartBox>
                      {hasLoaded ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={completionChartData}>
                            <defs>
                              <linearGradient id="completionFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#42d392" stopOpacity={0.52} />
                                <stop offset="95%" stopColor="#42d392" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(189, 203, 220, 0.1)" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: '#91a0ac', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#91a0ac', fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, completionAxisMax]} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Area type="monotone" dataKey="completion" stroke="#42d392" strokeWidth={3} fill="url(#completionFill)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <ChartFallback>통계 준비 중</ChartFallback>
                      )}
                    </ChartBox>
                  </ChartPanel>

                  <ChartPanel>
                    <ChartTitle>
                      <span>기록 빈도</span>
                      <ChartCaption>{statsPeriod === 'weekly' ? '주간' : '월간'} 누적 입력 항목 수</ChartCaption>
                    </ChartTitle>
                    <ChartBox>
                      {hasLoaded ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={completionChartData}>
                            <CartesianGrid stroke="rgba(189, 203, 220, 0.1)" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: '#91a0ac', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#91a0ac', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Bar dataKey="records" fill="#63b3ff" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <ChartFallback>통계 준비 중</ChartFallback>
                      )}
                    </ChartBox>
                  </ChartPanel>

                  <ChartPanel>
                    <ChartTitle>
                      <span>{statsPeriod === 'weekly' ? '12주 리듬맵' : '12개월 리듬맵'}</span>
                      <ChartCaption>색이 진할수록 기간 평균이 높음</ChartCaption>
                    </ChartTitle>
                    <HeatMap $columns={12}>
                      {statsBuckets.map((bucket) => (
                        <HeatCell
                          key={bucket.id}
                          $percent={bucket.stats.percent}
                          title={`${bucket.caption} ${bucket.stats.percent}%`}
                        />
                      ))}
                    </HeatMap>
                  </ChartPanel>
                </StatsColumn>

                <StatsColumn>
                  <ChartPanel>
                    <ChartTitle>
                      <span>카테고리 균형</span>
                      <ChartCaption>{statsRangeLabel} 평균</ChartCaption>
                    </ChartTitle>
                    <ChartBox>
                      {hasLoaded ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={categoryChartData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={4}>
                              {categoryChartData.map((entry) => (
                                <Cell key={entry.id} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <ChartFallback>통계 준비 중</ChartFallback>
                      )}
                    </ChartBox>
                    <CategoryStatList>
                      {categoryChartData.map((category) => (
                        <CategoryStatRow key={category.id} $color={category.color}>
                          <div>
                            <strong>{category.name}</strong>
                            <RankMeta>
                              항목 {category.habitCount}개 · 기록 {category.records}/{category.total} · 완료 {category.completed}
                            </RankMeta>
                            <MiniTrack>
                              <MiniFill $percent={category.value} $color={category.color} />
                            </MiniTrack>
                          </div>
                          <ScoreColumn>
                            <ScoreValue $color={category.color}>{category.value}%</ScoreValue>
                            <ScoreMeta>달성률</ScoreMeta>
                          </ScoreColumn>
                        </CategoryStatRow>
                      ))}
                    </CategoryStatList>
                  </ChartPanel>

                  <ChartPanel>
                    <ChartTitle>
                      <span>항목 랭킹</span>
                      <ChartCaption>{statsPeriodUnitLabel} 달성률 / 연속일</ChartCaption>
                    </ChartTitle>
                    <HabitRankList>
                      {habitRankData.map(({ habit, percent, records, completed, total, metricText, streak }) => {
                        const category = categoryById.get(habit.categoryId);
                        const color = category?.color ?? '#42d392';
                        return (
                          <HabitRankRow key={habit.id}>
                            <div>
                              <RankName>{habit.name}</RankName>
                              <RankMeta>
                                {category?.name ?? '카테고리 없음'} · {MODE_META[habit.mode].label} · {metricText} · 기록 {records}/{total} · 완료 {completed}
                              </RankMeta>
                              <MiniTrack>
                                <MiniFill $percent={percent} $color={color} />
                              </MiniTrack>
                            </div>
                            <ScoreColumn>
                              <ScoreValue $color={color}>{percent}%</ScoreValue>
                              <ModePill $color={color}>
                                <Flame size={13} />
                                {streak}일
                              </ModePill>
                            </ScoreColumn>
                          </HabitRankRow>
                        );
                      })}
                    </HabitRankList>
                  </ChartPanel>

                  <ChartPanel>
                    <ChartTitle>
                      <span>운영 지표</span>
                      <ChartCaption>현재 구성</ChartCaption>
                    </ChartTitle>
                    <CategoryStatList>
                      <CategoryStatRow $color="#42d392">
                        <div>
                          <strong>카테고리</strong>
                          <MiniTrack>
                            <MiniFill $percent={100} $color="#42d392" />
                          </MiniTrack>
                        </div>
                        <span>{orderedCategories.length}개</span>
                      </CategoryStatRow>
                      <CategoryStatRow $color="#63b3ff">
                        <div>
                          <strong>항목</strong>
                          <MiniTrack>
                            <MiniFill $percent={100} $color="#63b3ff" />
                          </MiniTrack>
                        </div>
                        <span>{orderedHabits.length}개</span>
                      </CategoryStatRow>
                      <CategoryStatRow $color="#f8c64e">
                        <div>
                          <strong>저장 일수</strong>
                          <MiniTrack>
                            <MiniFill $percent={100} $color="#f8c64e" />
                          </MiniTrack>
                        </div>
                        <span>{Object.keys(workspace.records).length}일</span>
                      </CategoryStatRow>
                    </CategoryStatList>
                  </ChartPanel>
                </StatsColumn>
              </StatsGrid>
                  </>
                ) : null}
              </>
            )}
          </MainPanel>
        </WorkspaceGrid>
        )}
          </>
        )}
      </Shell>
    </Page>
  );
}

export default HabitTrackerApp;


