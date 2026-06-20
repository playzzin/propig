'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Check,
  Circle,
  ClipboardList,
  Eye,
  EyeOff,
  Flag,
  GripVertical,
  Loader2,
  LogIn,
  Minus,
  NotebookPen,
  Palette,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Star,
  Target,
  Trash2,
} from 'lucide-react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import styled, { keyframes } from 'styled-components';
import { toast } from 'sonner';
import {
  getPropigStoreAppById,
  type PropigWidgetId,
} from '@/constants/propigStore';
import { useAuth } from '@/contexts/AuthContext';
import { db, ensureFirestorePersistence } from '@/firebase/config';
import { usePropigAppRegistry } from '@/hooks/usePropigAppRegistry';
import { useStickyNotes } from '@/hooks/useStickyNotes';
import {
  bucketListService,
  type BucketCategoryOption,
  type BucketListItem,
  type BucketStatus,
} from '@/services/bucketListService';
import {
  TODO_ANYTIME_COMPLETION_KEY,
  todoListService,
  type TodoCategoryOption,
  type TodoRecurrenceMode,
  type TodoTask,
  type TodoTaskDraft,
} from '@/services/todoListService';
import { TAG_COLOR_ORDER, type StickyNoteColor } from '@/types/stickyNote';

type WidgetId = PropigWidgetId;
type WidgetState = 'idle' | 'loading' | 'ready' | 'error';
type DdayTone = 'none' | 'overdue' | 'today' | 'upcoming' | 'done';
type MetricTone = 'memo' | 'habit' | 'todo' | 'bucket';
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

interface HabitCategory {
  id: string;
  name: string;
  color: string;
  order?: number;
}

interface ChoiceOption {
  id: string;
  label: string;
}

interface HabitItem {
  id: string;
  categoryId: string;
  name: string;
  order?: number;
  mode: RecordMode;
  target: number;
  unit: string;
  goalDirection?: 'increase' | 'decrease' | 'maintain';
  baseline?: number;
  minTarget?: number;
  maxTarget?: number;
  secondaryTarget?: number;
  secondaryUnit?: string;
  tertiaryTarget?: number;
  tertiaryUnit?: string;
  options?: ChoiceOption[];
}

interface SetEntry {
  id: string;
  reps: number;
  load: number;
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

interface TodoOccurrence {
  task: TodoTask;
  dateKey: string;
  completed: boolean;
}

interface WidgetChrome {
  renderTitle: (icon: ReactNode) => ReactNode;
  hideButton: ReactNode;
}

const WIDGET_LAYOUT_STORAGE_KEY = 'propig:widget-layout:v1';
const MEMO_ALL_CATEGORY = 'all';
const MEMO_UNTAGGED_CATEGORY = '__untagged__';
const MEMO_ALL_COLORS = 'all';
const HABIT_ALL_CATEGORY = 'all';
const DEFAULT_WIDGET_ORDER: WidgetId[] = ['memo', 'habit', 'bucket', 'todo'];
const WIDGET_LABELS: Record<WidgetId, string> = {
  memo: '메모장',
  habit: '습관 트래커',
  bucket: '버킷리스트',
  todo: '할일 일정표',
};

const EMPTY_HABIT_WORKSPACE: HabitWorkspace = {
  categories: [],
  habits: [],
  records: {},
};

const BUCKET_STATUS_LABELS: Record<BucketStatus, string> = {
  planned: '계획',
  progress: '진행',
  done: '완료',
};

const TODO_RECURRENCE_LABELS: Record<TodoRecurrenceMode, string> = {
  unscheduled: '상시',
  once: '하루',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  dates: '날짜',
};

const HABIT_MODE_LABELS: Record<RecordMode, string> = {
  check: '체크',
  cardio: '운동',
  strength: '근력',
  number: '숫자',
  sets: '세트',
  duration: '시간',
  rating: '점수',
  singleChoice: '선택',
  multiChoice: '복수',
  note: '메모',
};

const MAX_MEMO_LENGTH = 900;

type MemoColorFilter = StickyNoteColor | typeof MEMO_ALL_COLORS;

interface MemoColorOption {
  id: MemoColorFilter;
  label: string;
  count: number;
  color: string;
}

const MEMO_COLOR_LABELS: Record<StickyNoteColor, string> = {
  sun: '노랑',
  lime: '라임',
  sky: '하늘',
  rose: '로즈',
  violet: '보라',
  slate: '회색',
};

const MEMO_COLOR_VALUES: Record<StickyNoteColor, string> = {
  sun: '#ffd76a',
  lime: '#b8ff7a',
  sky: '#8fd8ff',
  rose: '#ff9fb2',
  violet: '#c6a7ff',
  slate: '#cfd6df',
};

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayKey(): string {
  return toDateKey(new Date());
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDashboardDate(dateKey: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(parseDateKey(dateKey));
}

function formatHabitDate(dateKey: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(parseDateKey(dateKey));
}

function formatDateStripDay(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function formatDateStripWeekday(dateKey: string): string {
  return new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(parseDateKey(dateKey));
}

function getDateStripKeys(selectedDateKey: string, todayKey: string): string[] {
  const diffFromToday = getDateKeyDayDiff(selectedDateKey, todayKey);
  const start =
    diffFromToday !== null && diffFromToday >= -3 && diffFromToday <= 10
      ? addDays(parseDateKey(todayKey), -3)
      : addDays(parseDateKey(selectedDateKey), -3);

  return Array.from({ length: 14 }, (_, index) => toDateKey(addDays(start, index)));
}

function formatTimeLabel(time: string): string {
  return time || '종일';
}

function getDateKeyDayDiff(dateKey: string, fromDateKey: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{4}-\d{2}-\d{2}$/.test(fromDateKey)) return null;
  const target = parseDateKey(dateKey);
  const from = parseDateKey(fromDateKey);
  if (Number.isNaN(target.getTime()) || Number.isNaN(from.getTime())) return null;

  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((targetUtc - fromUtc) / 86_400_000);
}

function formatBucketDday(targetDate: string, todayKey: string): string {
  const diff = getDateKeyDayDiff(targetDate, todayKey);
  if (diff === null) return '날짜 없음';
  if (diff === 0) return 'D-day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function getBucketDdayTone(item: BucketListItem, todayKey: string): DdayTone {
  if (item.status === 'done') return 'done';
  const diff = getDateKeyDayDiff(item.targetDate, todayKey);
  if (diff === null) return 'none';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}

function getBucketDateSortScore(item: BucketListItem, todayKey: string): number {
  const diff = getDateKeyDayDiff(item.targetDate, todayKey);
  if (diff === null) return Number.MAX_SAFE_INTEGER;
  if (diff < 0) return -10_000 + Math.abs(diff);
  return diff;
}

function readNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function normalizeMemoCategory(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 24);
}

function getMemoTitle(content: string): string {
  return (
    content
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '빈 메모'
  );
}

function getMemoPreview(content: string): string {
  return content.replace(/\s+/g, ' ').trim() || '내용 없음';
}

function getMemoTextareaRows(content: string): number {
  const visualRows = content.split('\n').reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / 34)), 0);
  return Math.max(4, visualRows + 1);
}

function formatMemoUpdatedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '';

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function uniqueSortedCompletionKeys(keys: string[]): string[] {
  return [...new Set(keys.filter((key) => key === TODO_ANYTIME_COMPLETION_KEY || /^\d{4}-\d{2}-\d{2}$/.test(key)))].sort();
}

function shouldOccurOn(task: TodoTask, dateKey: string): boolean {
  const recurrence = task.recurrence;

  if (recurrence.mode === 'unscheduled') return false;
  if (recurrence.mode === 'dates') return recurrence.dates.includes(dateKey);
  if (dateKey < task.startDate) return false;
  if (recurrence.mode === 'once') return dateKey === task.startDate;
  if (recurrence.mode === 'daily') return true;

  const date = parseDateKey(dateKey);
  if (recurrence.mode === 'weekly') return recurrence.weekdays.includes(date.getDay());
  return recurrence.monthDays.includes(date.getDate());
}

function getOccurrencesForDate(tasks: TodoTask[], dateKey: string): TodoOccurrence[] {
  return tasks
    .filter((task) => shouldOccurOn(task, dateKey))
    .map((task) => ({
      task,
      dateKey,
      completed: task.completedDates.includes(dateKey),
    }))
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const timeCompare = (a.task.time || '00:00').localeCompare(b.task.time || '00:00');
      if (timeCompare !== 0) return timeCompare;
      return new Date(b.task.createdAt).getTime() - new Date(a.task.createdAt).getTime();
    });
}

function createTodoDraft(title: string, categoryId: string, dateKey: string, time: string): TodoTaskDraft {
  const date = parseDateKey(dateKey);
  return {
    title,
    note: '',
    categoryId,
    startDate: dateKey,
    time,
    recurrenceMode: 'once',
    weekdays: [date.getDay()],
    monthDays: [date.getDate()],
    dates: [dateKey],
  };
}

function cycleBucketStatus(status: BucketStatus): BucketStatus {
  if (status === 'planned') return 'progress';
  if (status === 'progress') return 'done';
  return 'planned';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefined(entry)]),
  );
}

function isWidgetId(value: unknown): value is WidgetId {
  return value === 'memo' || value === 'habit' || value === 'bucket' || value === 'todo';
}

function isChoiceMode(mode: RecordMode): mode is 'singleChoice' | 'multiChoice' {
  return mode === 'singleChoice' || mode === 'multiChoice';
}

function normalizeWidgetOrder(value: unknown): WidgetId[] {
  const parsed = Array.isArray(value) ? value.filter(isWidgetId) : [];
  const unique = [...new Set(parsed)];
  return [...unique, ...DEFAULT_WIDGET_ORDER.filter((id) => !unique.includes(id))];
}

function normalizeHiddenWidgets(value: unknown): WidgetId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isWidgetId))];
}

function loadWidgetLayout(): { order: WidgetId[]; hidden: WidgetId[] } {
  if (typeof window === 'undefined') {
    return { order: DEFAULT_WIDGET_ORDER, hidden: [] };
  }

  try {
    const raw = window.localStorage.getItem(WIDGET_LAYOUT_STORAGE_KEY);
    if (!raw) return { order: DEFAULT_WIDGET_ORDER, hidden: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainRecord(parsed)) return { order: DEFAULT_WIDGET_ORDER, hidden: [] };
    return {
      order: normalizeWidgetOrder(parsed.order),
      hidden: normalizeHiddenWidgets(parsed.hidden),
    };
  } catch {
    return { order: DEFAULT_WIDGET_ORDER, hidden: [] };
  }
}

function isRecordMode(value: unknown): value is RecordMode {
  return (
    value === 'check' ||
    value === 'cardio' ||
    value === 'strength' ||
    value === 'number' ||
    value === 'sets' ||
    value === 'duration' ||
    value === 'rating' ||
    value === 'singleChoice' ||
    value === 'multiChoice' ||
    value === 'note'
  );
}

function normalizeHabitCategory(value: unknown, index: number): HabitCategory | null {
  if (!isPlainRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;

  return {
    id: value.id,
    name: value.name.trim() || '기본',
    color: typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color : '#42d392',
    order: typeof value.order === 'number' ? value.order : index,
  };
}

function normalizeChoiceOption(value: unknown): ChoiceOption | null {
  if (!isPlainRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string') return null;
  return { id: value.id, label: value.label };
}

function normalizeHabitItem(value: unknown, index: number): HabitItem | null {
  if (
    !isPlainRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.categoryId !== 'string' ||
    typeof value.name !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    categoryId: value.categoryId,
    name: value.name.trim() || '습관',
    order: typeof value.order === 'number' ? value.order : index,
    mode: isRecordMode(value.mode) ? value.mode : 'check',
    target: typeof value.target === 'number' ? value.target : 1,
    unit: typeof value.unit === 'string' ? value.unit : '회',
    goalDirection:
      value.goalDirection === 'decrease' || value.goalDirection === 'maintain' || value.goalDirection === 'increase'
        ? value.goalDirection
        : undefined,
    baseline: typeof value.baseline === 'number' ? value.baseline : undefined,
    minTarget: typeof value.minTarget === 'number' ? value.minTarget : undefined,
    maxTarget: typeof value.maxTarget === 'number' ? value.maxTarget : undefined,
    secondaryTarget: typeof value.secondaryTarget === 'number' ? value.secondaryTarget : undefined,
    secondaryUnit: typeof value.secondaryUnit === 'string' ? value.secondaryUnit : undefined,
    tertiaryTarget: typeof value.tertiaryTarget === 'number' ? value.tertiaryTarget : undefined,
    tertiaryUnit: typeof value.tertiaryUnit === 'string' ? value.tertiaryUnit : undefined,
    options: Array.isArray(value.options) ? value.options.map(normalizeChoiceOption).filter((item): item is ChoiceOption => Boolean(item)) : [],
  };
}

function normalizeHabitRecord(value: unknown): HabitRecord {
  return isPlainRecord(value) ? (removeUndefined(value) as HabitRecord) : {};
}

function normalizeHabitRecords(value: unknown): HabitWorkspace['records'] {
  if (!isPlainRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([dateKey, rawRecords]) => {
      const dayRecords = isPlainRecord(rawRecords)
        ? Object.fromEntries(Object.entries(rawRecords).map(([habitId, record]) => [habitId, normalizeHabitRecord(record)]))
        : {};
      return [dateKey, dayRecords];
    }),
  );
}

function normalizeHabitWorkspace(value: unknown): HabitWorkspace {
  if (!isPlainRecord(value)) return EMPTY_HABIT_WORKSPACE;

  const categories = Array.isArray(value.categories)
    ? value.categories.map(normalizeHabitCategory).filter((item): item is HabitCategory => Boolean(item))
    : [];
  const habits = Array.isArray(value.habits)
    ? value.habits.map(normalizeHabitItem).filter((item): item is HabitItem => Boolean(item))
    : [];

  return {
    categories,
    habits,
    records: normalizeHabitRecords(value.records),
  };
}

function createHabitWorkspaceRef(uid: string) {
  return doc(db, 'users', uid, 'habitTracker', 'workspace');
}

async function saveHabitWorkspace(uid: string, workspace: HabitWorkspace): Promise<void> {
  const payload = removeUndefined(workspace) as Record<string, unknown>;
  await ensureFirestorePersistence();
  await setDoc(createHabitWorkspaceRef(uid), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}

function isHabitRecordDone(record?: HabitRecord): boolean {
  if (!record) return false;
  if (record.checked) return true;
  if (typeof record.value === 'number' && record.value > 0) return true;
  if (typeof record.distance === 'number' && record.distance > 0) return true;
  if (typeof record.minutes === 'number' && record.minutes > 0) return true;
  if (typeof record.rating === 'number' && record.rating > 0) return true;
  if (record.selectedOptionId) return true;
  if (Array.isArray(record.selectedOptionIds) && record.selectedOptionIds.length > 0) return true;
  if (Array.isArray(record.sets) && record.sets.some((entry) => entry.reps > 0 || entry.load > 0)) return true;
  if (Array.isArray(record.todos) && record.todos.some((todo) => todo.done || todo.text.trim())) return true;
  return Boolean(record.note?.trim());
}

function getHabitCategoryName(categories: HabitCategory[], categoryId: string): string {
  return categories.find((category) => category.id === categoryId)?.name ?? '기본';
}

function getHabitCategoryColor(categories: HabitCategory[], categoryId: string): string {
  return categories.find((category) => category.id === categoryId)?.color ?? '#42d392';
}

function getHabitChoiceOptions(habit: Pick<HabitItem, 'options'>): ChoiceOption[] {
  if (!Array.isArray(habit.options)) return [];
  return habit.options.filter((option) => option.id.trim() && option.label.trim());
}

function getSelectedOptionIds(habit: HabitItem, record?: HabitRecord): string[] {
  if (!record) return [];
  const optionIds = new Set(getHabitChoiceOptions(habit).map((option) => option.id));
  const rawIds =
    habit.mode === 'singleChoice'
      ? [record.selectedOptionId ?? record.selectedOptionIds?.[0]]
      : [...(record.selectedOptionIds ?? []), record.selectedOptionId];

  return Array.from(new Set(rawIds.filter((id): id is string => Boolean(id && optionIds.has(id)))));
}

function makeQuickId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getNextHabitOrder(habits: HabitItem[], categoryId: string): number {
  return habits
    .filter((habit) => habit.categoryId === categoryId)
    .reduce((max, habit) => Math.max(max, typeof habit.order === 'number' ? habit.order : 0), -1) + 1;
}

function getWidgetStatusText(state: WidgetState, currentUser: unknown): string {
  if (!currentUser) return '로그인 필요';
  if (state === 'loading') return '동기화 중';
  if (state === 'error') return '연결 오류';
  return '바로 사용 가능';
}

function useBucketWidget(uid: string | undefined) {
  const [items, setItems] = useState<BucketListItem[]>([]);
  const [categories, setCategories] = useState<BucketCategoryOption[]>([]);
  const [state, setState] = useState<WidgetState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }

    let unsubscribeItems: (() => void) | undefined;
    let unsubscribeCategories: (() => void) | undefined;
    let didCancel = false;

    const connect = async () => {
      try {
        setState('loading');
        await ensureFirestorePersistence();
        await bucketListService.ensureDefaultCategories(uid);

        unsubscribeItems = bucketListService.subscribe(
          uid,
          (nextItems) => {
            if (didCancel) return;
            setItems(nextItems);
            setState('ready');
            setError(null);
          },
          (nextError) => {
            if (didCancel) return;
            setError(nextError.message);
            setState('error');
          },
        );

        unsubscribeCategories = bucketListService.subscribeCategories(
          uid,
          (nextCategories) => {
            if (didCancel) return;
            setCategories(nextCategories);
            setState('ready');
            setError(null);
          },
          (nextError) => {
            if (didCancel) return;
            setError(nextError.message);
            setState('error');
          },
        );
      } catch (nextError) {
        if (didCancel) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setState('error');
      }
    };

    void connect();

    return () => {
      didCancel = true;
      unsubscribeItems?.();
      unsubscribeCategories?.();
    };
  }, [uid]);

  const createItem = useCallback(
    async (title: string) => {
      if (!uid) return;
      const category = categories[0]?.id;
      if (!category) {
        toast.error('버킷리스트 분류를 불러온 뒤 다시 시도해주세요.');
        return;
      }

      await bucketListService.create(uid, {
        title,
        note: '',
        category,
        priority: 'medium',
        targetDate: '',
      });
    },
    [categories, uid],
  );

  const updateStatus = useCallback(
    async (item: BucketListItem) => {
      if (!uid) return;
      await bucketListService.update(uid, item.id, { status: cycleBucketStatus(item.status) });
    },
    [uid],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      if (!uid) return;
      await bucketListService.remove(uid, itemId);
    },
    [uid],
  );

  return {
    items: uid ? items : [],
    categories: uid ? categories : [],
    state: uid ? state : 'idle',
    error: uid ? error : null,
    createItem,
    updateStatus,
    removeItem,
  };
}

function useTodoWidget(uid: string | undefined, todayKey: string) {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [categories, setCategories] = useState<TodoCategoryOption[]>([]);
  const [state, setState] = useState<WidgetState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }

    let unsubscribeTasks: (() => void) | undefined;
    let unsubscribeCategories: (() => void) | undefined;
    let didCancel = false;

    const connect = async () => {
      try {
        setState('loading');
        await ensureFirestorePersistence();
        await todoListService.ensureDefaultCategories(uid);

        unsubscribeTasks = todoListService.subscribeTasks(
          uid,
          (nextTasks) => {
            if (didCancel) return;
            setTasks(nextTasks);
            setState('ready');
            setError(null);
          },
          (nextError) => {
            if (didCancel) return;
            setError(nextError.message);
            setState('error');
          },
        );

        unsubscribeCategories = todoListService.subscribeCategories(
          uid,
          (nextCategories) => {
            if (didCancel) return;
            setCategories(nextCategories);
            setState('ready');
            setError(null);
          },
          (nextError) => {
            if (didCancel) return;
            setError(nextError.message);
            setState('error');
          },
        );
      } catch (nextError) {
        if (didCancel) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setState('error');
      }
    };

    void connect();

    return () => {
      didCancel = true;
      unsubscribeTasks?.();
      unsubscribeCategories?.();
    };
  }, [uid]);

  const todayOccurrences = useMemo(() => getOccurrencesForDate(tasks, todayKey), [tasks, todayKey]);
  const anytimeTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.recurrence.mode === 'unscheduled' && !task.completedDates.includes(TODO_ANYTIME_COMPLETION_KEY))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [tasks],
  );

  const createTask = useCallback(
    async (title: string, time: string) => {
      if (!uid) return;
      const categoryId = categories[0]?.id;
      if (!categoryId) {
        toast.error('할일 분류를 불러온 뒤 다시 시도해주세요.');
        return;
      }

      await todoListService.create(uid, createTodoDraft(title, categoryId, todayKey, time));
    },
    [categories, todayKey, uid],
  );

  const toggleTask = useCallback(
    async (task: TodoTask, completionKey: string) => {
      if (!uid) return;
      const exists = task.completedDates.includes(completionKey);
      const nextDates = exists
        ? task.completedDates.filter((dateKey) => dateKey !== completionKey)
        : uniqueSortedCompletionKeys([...task.completedDates, completionKey]);
      await todoListService.setCompletedDates(uid, task.id, nextDates);
    },
    [uid],
  );

  const removeTask = useCallback(
    async (taskId: string) => {
      if (!uid) return;
      await todoListService.remove(uid, taskId);
    },
    [uid],
  );

  return {
    tasks: uid ? tasks : [],
    categories: uid ? categories : [],
    state: uid ? state : 'idle',
    error: uid ? error : null,
    todayOccurrences: uid ? todayOccurrences : [],
    anytimeTasks: uid ? anytimeTasks : [],
    createTask,
    toggleTask,
    removeTask,
  };
}

function useHabitWidget(uid: string | undefined, selectedDateKey: string) {
  const [workspace, setWorkspace] = useState<HabitWorkspace>(EMPTY_HABIT_WORKSPACE);
  const [state, setState] = useState<WidgetState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let didCancel = false;

    const connect = async () => {
      try {
        setState('loading');
        await ensureFirestorePersistence();

        unsubscribe = onSnapshot(
          createHabitWorkspaceRef(uid),
          (snapshot) => {
            if (didCancel) return;
            setWorkspace(normalizeHabitWorkspace(snapshot.data()));
            setState('ready');
            setError(null);
          },
          (nextError) => {
            if (didCancel) return;
            setError(nextError.message);
            setState('error');
          },
        );
      } catch (nextError) {
        if (didCancel) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setState('error');
      }
    };

    void connect();

    return () => {
      didCancel = true;
      unsubscribe?.();
    };
  }, [uid]);

  const effectiveWorkspace = uid ? workspace : EMPTY_HABIT_WORKSPACE;
  const selectedRecords = useMemo(
    () => effectiveWorkspace.records[selectedDateKey] ?? {},
    [effectiveWorkspace.records, selectedDateKey],
  );
  const sortedHabits = useMemo(
    () =>
      [...effectiveWorkspace.habits].sort((a, b) => {
        const categoryCompare = getHabitCategoryName(effectiveWorkspace.categories, a.categoryId).localeCompare(
          getHabitCategoryName(effectiveWorkspace.categories, b.categoryId),
          'ko-KR',
        );
        if (categoryCompare !== 0) return categoryCompare;
        return (a.order ?? 0) - (b.order ?? 0);
      }),
    [effectiveWorkspace.categories, effectiveWorkspace.habits],
  );

  const createHabit = useCallback(
    async (name: string, categoryId?: string) => {
      if (!uid) return;
      const fallbackCategoryId = makeQuickId('habit-category');
      const category = workspace.categories.find((item) => item.id === categoryId) ?? workspace.categories[0] ?? {
        id: fallbackCategoryId,
        name: '루틴',
        color: '#42d392',
        order: 0,
      };
      const categories = workspace.categories.length > 0 ? workspace.categories : [category];
      const habit: HabitItem = {
        id: makeQuickId('habit'),
        categoryId: category.id,
        name,
        order: getNextHabitOrder(workspace.habits, category.id),
        mode: 'check',
        target: 1,
        unit: '회',
        goalDirection: 'increase',
        options: [],
      };
      const nextWorkspace = { ...workspace, categories, habits: [...workspace.habits, habit] };
      setWorkspace(nextWorkspace);
      await saveHabitWorkspace(uid, nextWorkspace);
    },
    [uid, workspace],
  );

  const saveHabitRecord = useCallback(
    async (habitId: string, patch: Partial<HabitRecord>) => {
      if (!uid) return;
      const currentDay = workspace.records[selectedDateKey] ?? {};
      const currentRecord = currentDay[habitId] ?? {};
      const nextRecord: HabitRecord = {
        ...currentRecord,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      const nextWorkspace: HabitWorkspace = {
        ...workspace,
        records: {
          ...workspace.records,
          [selectedDateKey]: {
            ...currentDay,
            [habitId]: removeUndefined(nextRecord) as HabitRecord,
          },
        },
      };
      setWorkspace(nextWorkspace);
      await saveHabitWorkspace(uid, nextWorkspace);
    },
    [selectedDateKey, uid, workspace],
  );

  const toggleHabit = useCallback(
    async (habit: HabitItem) => {
      if (!uid || habit.mode !== 'check') return;
      const currentRecord = selectedRecords[habit.id] ?? {};
      await saveHabitRecord(habit.id, { checked: !currentRecord.checked });
    },
    [saveHabitRecord, selectedRecords, uid],
  );

  return {
    workspace: effectiveWorkspace,
    state: uid ? state : 'idle',
    error: uid ? error : null,
    selectedRecords,
    sortedHabits,
    createHabit,
    saveHabitRecord,
    toggleHabit,
  };
}

function SortableWidget({
  id,
  label,
  children,
  onHide,
}: {
  id: WidgetId;
  label: string;
  children: (chrome: WidgetChrome) => ReactNode;
  onHide: (id: WidgetId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const chrome: WidgetChrome = {
    renderTitle: (icon) => (
      <WidgetTitle>
        <WidgetTitleHandle type="button" {...attributes} {...listeners} aria-label={label} title="제목을 잡고 이동">
          <GripVertical size={16} />
          {icon}
          <span>{label}</span>
        </WidgetTitleHandle>
      </WidgetTitle>
    ),
    hideButton: (
      <HideWidgetButton type="button" onClick={() => onHide(id)} aria-label={`${label} 숨기기`} title="숨기기">
        <EyeOff size={15} />
        숨김
      </HideWidgetButton>
    ),
  };

  return (
    <SortableWidgetFrame
      ref={setNodeRef}
      $dragging={isDragging}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {children(chrome)}
    </SortableWidgetFrame>
  );
}

export default function PropigDashboard() {
  const { currentUser, loading: authLoading, isConfigured, loginWithGoogle } = useAuth();
  const appRegistry = usePropigAppRegistry();
  const router = useRouter();
  const [memoDraft, setMemoDraft] = useState('');
  const [memoCategoryDraft, setMemoCategoryDraft] = useState('');
  const [memoCategoryFilter, setMemoCategoryFilter] = useState<string>(MEMO_ALL_CATEGORY);
  const [memoColorDraft, setMemoColorDraft] = useState<StickyNoteColor>('lime');
  const [memoColorFilter, setMemoColorFilter] = useState<MemoColorFilter>(MEMO_ALL_COLORS);
  const [habitCategoryFilter, setHabitCategoryFilter] = useState<string>(HABIT_ALL_CATEGORY);
  const [habitDraft, setHabitDraft] = useState('');
  const [bucketDraft, setBucketDraft] = useState('');
  const [todoDraft, setTodoDraft] = useState('');
  const [todoTime, setTodoTime] = useState('');
  const [habitDateKey, setHabitDateKey] = useState(() => getTodayKey());
  const [todoDateKey, setTodoDateKey] = useState(() => getTodayKey());
  const [openHabitRecordIds, setOpenHabitRecordIds] = useState<string[]>([]);
  const [openMemoIds, setOpenMemoIds] = useState<string[]>([]);
  const [openBucketIds, setOpenBucketIds] = useState<string[]>([]);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(DEFAULT_WIDGET_ORDER);
  const [hiddenWidgetIds, setHiddenWidgetIds] = useState<WidgetId[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const todayKey = useMemo(() => getTodayKey(), []);
  const dateLabel = useMemo(() => formatDashboardDate(todayKey), [todayKey]);
  const uid = currentUser?.uid;
  const installedWidgetIds = useMemo(
    () =>
      new Set(
        appRegistry.installedAppIds
          .map((appId) => getPropigStoreAppById(appId)?.widgetId)
          .filter((widgetId): widgetId is WidgetId => Boolean(widgetId)),
      ),
    [appRegistry.installedAppIds],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { notes, storageError, createNote, updateNote, deleteNote } = useStickyNotes();
  const bucket = useBucketWidget(uid);
  const todo = useTodoWidget(uid, todoDateKey);
  const habit = useHabitWidget(uid, habitDateKey);

  useEffect(() => {
    const savedLayout = loadWidgetLayout();
    setWidgetOrder(savedLayout.order);
    setHiddenWidgetIds(savedLayout.hidden);
    setLayoutReady(true);
  }, []);

  useEffect(() => {
    if (!layoutReady || typeof window === 'undefined') return;
    window.localStorage.setItem(WIDGET_LAYOUT_STORAGE_KEY, JSON.stringify({ order: widgetOrder, hidden: hiddenWidgetIds }));
  }, [hiddenWidgetIds, layoutReady, widgetOrder]);

  const toggleHabitRecordEditor = useCallback((habitId: string) => {
    setOpenHabitRecordIds((current) =>
      current.includes(habitId) ? current.filter((id) => id !== habitId) : [...current, habitId],
    );
  }, []);

  const toggleMemoAccordion = useCallback((noteId: string) => {
    setOpenMemoIds((current) => (current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId]));
  }, []);

  const toggleBucketAccordion = useCallback((bucketId: string) => {
    setOpenBucketIds((current) => (current.includes(bucketId) ? current.filter((id) => id !== bucketId) : [...current, bucketId]));
  }, []);

  const memoBaseNotes = useMemo(() => notes.filter((note) => !note.isArchived), [notes]);
  const memoCategoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    let untaggedCount = 0;

    for (const note of memoBaseNotes) {
      const tags = note.tags.map(normalizeMemoCategory).filter(Boolean);
      if (tags.length === 0) {
        untaggedCount += 1;
        continue;
      }

      for (const tag of tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return [
      { id: MEMO_ALL_CATEGORY, label: '전체', count: memoBaseNotes.length },
      ...Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko-KR'))
        .map(([label, count]) => ({ id: label, label, count })),
      ...(untaggedCount > 0 ? [{ id: MEMO_UNTAGGED_CATEGORY, label: '미분류', count: untaggedCount }] : []),
    ];
  }, [memoBaseNotes]);

  useEffect(() => {
    if (memoCategoryOptions.some((option) => option.id === memoCategoryFilter)) return;
    setMemoCategoryFilter(MEMO_ALL_CATEGORY);
  }, [memoCategoryFilter, memoCategoryOptions]);

  const memoColorOptions = useMemo<MemoColorOption[]>(
    () => [
      { id: MEMO_ALL_COLORS, label: '전체', count: memoBaseNotes.length, color: '#2dd4bf' },
      ...TAG_COLOR_ORDER.map((color) => ({
        id: color,
        label: MEMO_COLOR_LABELS[color],
        count: memoBaseNotes.filter((note) => note.color === color).length,
        color: MEMO_COLOR_VALUES[color],
      })),
    ],
    [memoBaseNotes],
  );

  useEffect(() => {
    const noteIds = new Set(memoBaseNotes.map((note) => note.id));
    setOpenMemoIds((current) => {
      const next = current.filter((id) => noteIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [memoBaseNotes]);

  useEffect(() => {
    const bucketIds = new Set(bucket.items.map((item) => item.id));
    setOpenBucketIds((current) => {
      const next = current.filter((id) => bucketIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [bucket.items]);

  const activeNotes = useMemo(
    () =>
      memoBaseNotes
        .filter((note) => {
          if (memoColorFilter !== MEMO_ALL_COLORS && note.color !== memoColorFilter) return false;
          if (memoCategoryFilter === MEMO_ALL_CATEGORY) return true;
          const tags = note.tags.map(normalizeMemoCategory).filter(Boolean);
          if (memoCategoryFilter === MEMO_UNTAGGED_CATEGORY) return tags.length === 0;
          return tags.includes(memoCategoryFilter);
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [memoBaseNotes, memoCategoryFilter, memoColorFilter],
  );

  const habitCategoryOptions = useMemo(
    () => [
      { id: HABIT_ALL_CATEGORY, label: '전체', count: habit.sortedHabits.length, color: '#42d392' },
      ...[...habit.workspace.categories]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'ko-KR'))
        .map((category) => ({
          id: category.id,
          label: category.name,
          count: habit.sortedHabits.filter((item) => item.categoryId === category.id).length,
          color: category.color,
        })),
    ],
    [habit.sortedHabits, habit.workspace.categories],
  );
  const activeHabitCategoryFilter = habitCategoryOptions.some((option) => option.id === habitCategoryFilter)
    ? habitCategoryFilter
    : HABIT_ALL_CATEGORY;
  const visibleHabits = useMemo(
    () =>
      (activeHabitCategoryFilter === HABIT_ALL_CATEGORY
        ? habit.sortedHabits
        : habit.sortedHabits.filter((item) => item.categoryId === activeHabitCategoryFilter)
      ).slice(0, 6),
    [activeHabitCategoryFilter, habit.sortedHabits],
  );

  const visibleBuckets = useMemo(
    () =>
      [...bucket.items]
        .sort((a, b) => {
          const statusRank: Record<BucketStatus, number> = { progress: 0, planned: 1, done: 2 };
          const doneCompare = (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
          if (doneCompare !== 0) return doneCompare;

          const dateCompare = getBucketDateSortScore(a, todayKey) - getBucketDateSortScore(b, todayKey);
          if (dateCompare !== 0) return dateCompare;

          if (a.status !== b.status) return statusRank[a.status] - statusRank[b.status];
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        })
        .slice(0, 5),
    [bucket.items, todayKey],
  );

  const memoCount = memoBaseNotes.length;
  const habitTotalCount = habit.sortedHabits.length;
  const habitDoneCount = habit.sortedHabits.filter((item) => isHabitRecordDone(habit.selectedRecords[item.id])).length;
  const todoTodayTotal = todo.todayOccurrences.length + todo.anytimeTasks.length;
  const todoDoneCount =
    todo.todayOccurrences.filter((item) => item.completed).length +
    todo.anytimeTasks.filter((task) => task.completedDates.includes(TODO_ANYTIME_COMPLETION_KEY)).length;
  const todoOpenCount = Math.max(0, todoTodayTotal - todoDoneCount);
  const bucketOpenCount = bucket.items.filter((item) => item.status !== 'done').length;
  const dailyTotalCount = (installedWidgetIds.has('habit') ? habitTotalCount : 0) + (installedWidgetIds.has('todo') ? todoTodayTotal : 0);
  const dailyDoneCount = (installedWidgetIds.has('habit') ? habitDoneCount : 0) + (installedWidgetIds.has('todo') ? todoDoneCount : 0);
  const dailyProgress = dailyTotalCount > 0 ? Math.round((dailyDoneCount / dailyTotalCount) * 100) : 0;
  const heroStatus = currentUser
    ? dailyTotalCount > 0
      ? `${dailyDoneCount}/${dailyTotalCount} 완료`
      : `${appRegistry.installedAppIds.length}개 앱 등록됨`
    : '로그인 전 미리보기';
  const heroDetail =
    appRegistry.error ??
    (currentUser
      ? '상점 등록 상태가 좌측 메뉴와 대시보드 위젯에 반영됩니다.'
      : '비로그인 상태에서는 이 브라우저에만 앱 등록 상태가 저장됩니다.');
  const visibleWidgetIds = useMemo(
    () => widgetOrder.filter((id) => installedWidgetIds.has(id) && !hiddenWidgetIds.includes(id)),
    [hiddenWidgetIds, installedWidgetIds, widgetOrder],
  );
  const hiddenWidgets = useMemo(
    () => widgetOrder.filter((id) => installedWidgetIds.has(id) && hiddenWidgetIds.includes(id)),
    [hiddenWidgetIds, installedWidgetIds, widgetOrder],
  );

  const handleWidgetDragEnd = useCallback((event: DragEndEvent) => {
    const activeId = event.active.id;
    const overId = event.over?.id;
    if (!isWidgetId(activeId) || !isWidgetId(overId) || activeId === overId) return;

    setWidgetOrder((current) => {
      const oldIndex = current.indexOf(activeId);
      const newIndex = current.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }, []);

  const hideWidget = useCallback((id: WidgetId) => {
    setHiddenWidgetIds((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const showWidget = useCallback((id: WidgetId) => {
    setHiddenWidgetIds((current) => current.filter((item) => item !== id));
  }, []);

  const resetWidgetLayout = useCallback(() => {
    setWidgetOrder(DEFAULT_WIDGET_ORDER);
    setHiddenWidgetIds([]);
  }, []);

  const openRoute = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const handleSignIn = async () => {
    if (!isConfigured || isSigningIn) return;
    try {
      setIsSigningIn(true);
      await loginWithGoogle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleMemoSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = memoDraft.trim();
    if (!content) return;

    const filterCategory =
      memoCategoryFilter !== MEMO_ALL_CATEGORY && memoCategoryFilter !== MEMO_UNTAGGED_CATEGORY ? memoCategoryFilter : '';
    const category = normalizeMemoCategory(memoCategoryDraft) || filterCategory;
    const noteId = createNote();
    updateNote(noteId, { content: content.slice(0, MAX_MEMO_LENGTH), color: memoColorDraft, tags: category ? [category] : [] });
    setMemoDraft('');
    setOpenMemoIds((current) => [noteId, ...current.filter((id) => id !== noteId)]);
    setMemoColorFilter(memoColorDraft);
    if (category) setMemoCategoryFilter(category);
    toast.success('메모를 추가했습니다.');
  };

  const handleHabitSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = habitDraft.trim();
    if (!uid || !name) return;
    const categoryId = activeHabitCategoryFilter === HABIT_ALL_CATEGORY ? undefined : activeHabitCategoryFilter;

    try {
      setSavingKey('habit:create');
      await habit.createHabit(name, categoryId);
      setHabitDraft('');
      toast.success('습관을 추가했습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '습관 저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleBucketSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = bucketDraft.trim();
    if (!uid || !title) return;

    try {
      setSavingKey('bucket:create');
      await bucket.createItem(title);
      setBucketDraft('');
      toast.success('버킷리스트에 추가했습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '버킷 저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleTodoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = todoDraft.trim();
    if (!uid || !title) return;

    try {
      setSavingKey('todo:create');
      await todo.createTask(title, todoTime);
      setTodoDraft('');
      setTodoTime('');
      toast.success('오늘 일정에 추가했습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '할일 저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleTodoRemove = async (task: TodoTask) => {
    if (!uid) return;
    const ok = window.confirm(`'${task.title}' 할일을 삭제할까요?`);
    if (!ok) return;

    try {
      await todo.removeTask(task.id);
      toast.success('할일을 삭제했습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '할일 삭제에 실패했습니다.');
    }
  };

  const isDataLocked = authLoading || !currentUser;

  const renderDateStrip = (selectedDateKey: string, onSelect: (dateKey: string) => void, label: string) => (
    <DateStrip aria-label={label}>
      {getDateStripKeys(selectedDateKey, todayKey).map((dateKey) => {
        const diff = getDateKeyDayDiff(dateKey, todayKey);
        const quickLabel = diff === -1 ? '어제' : diff === 0 ? '오늘' : diff === 1 ? '내일' : formatDateStripWeekday(dateKey);

        return (
          <DateChipButton
            key={dateKey}
            type="button"
            $active={dateKey === selectedDateKey}
            $today={diff === 0}
            onClick={() => onSelect(dateKey)}
            aria-pressed={dateKey === selectedDateKey}
          >
            <span>{quickLabel}</span>
            <strong>{formatDateStripDay(dateKey)}</strong>
          </DateChipButton>
        );
      })}
    </DateStrip>
  );

  const saveHabitPatch = (habitId: string, patch: Partial<HabitRecord>) => {
    void habit.saveHabitRecord(habitId, patch).catch((error) => {
      toast.error(error instanceof Error ? error.message : '습관 기록 저장에 실패했습니다.');
    });
  };

  const renderHabitRecordControls = (item: HabitItem, record: HabitRecord) => {
    const disabled = isDataLocked;

    if (item.mode === 'check') {
      return (
        <HabitQuickControls>
          <PrimaryRecordButton type="button" disabled={disabled} onClick={() => saveHabitPatch(item.id, { checked: !record.checked })}>
            {record.checked ? <Check size={15} /> : <Circle size={15} />}
            {record.checked ? '완료됨' : '체크'}
          </PrimaryRecordButton>
        </HabitQuickControls>
      );
    }

    if (item.mode === 'cardio') {
      return (
        <HabitMetricGrid>
          <RecordInputGroup>
            <span>거리</span>
            <RecordNumberInput
              min={0}
              step={0.1}
              value={record.distance ?? ''}
              disabled={disabled}
              onChange={(event) => saveHabitPatch(item.id, { distance: readNumber(event.target.value) })}
              placeholder={`${item.target}`}
            />
            <em>{item.unit}</em>
          </RecordInputGroup>
          <RecordInputGroup>
            <span>시간</span>
            <RecordNumberInput
              min={0}
              value={record.minutes ?? ''}
              disabled={disabled}
              onChange={(event) => saveHabitPatch(item.id, { minutes: readNumber(event.target.value) })}
              placeholder={`${item.secondaryTarget ?? 60}`}
            />
            <em>{item.secondaryUnit ?? '분'}</em>
          </RecordInputGroup>
        </HabitMetricGrid>
      );
    }

    if (item.mode === 'strength') {
      return (
        <HabitMetricGrid>
          <RecordInputGroup>
            <span>무게</span>
            <RecordNumberInput
              min={0}
              step={0.5}
              value={record.load ?? ''}
              disabled={disabled}
              onChange={(event) => saveHabitPatch(item.id, { load: readNumber(event.target.value) })}
              placeholder={`${item.target}`}
            />
            <em>{item.unit}</em>
          </RecordInputGroup>
          <RecordInputGroup>
            <span>횟수</span>
            <RecordNumberInput
              min={0}
              value={record.reps ?? ''}
              disabled={disabled}
              onChange={(event) => saveHabitPatch(item.id, { reps: readNumber(event.target.value) })}
              placeholder={`${item.secondaryTarget ?? 10}`}
            />
            <em>{item.secondaryUnit ?? '회'}</em>
          </RecordInputGroup>
          <RecordInputGroup>
            <span>세트</span>
            <RecordNumberInput
              min={0}
              value={record.setCount ?? ''}
              disabled={disabled}
              onChange={(event) => saveHabitPatch(item.id, { setCount: readNumber(event.target.value) })}
              placeholder={`${item.tertiaryTarget ?? 3}`}
            />
            <em>{item.tertiaryUnit ?? '세트'}</em>
          </RecordInputGroup>
        </HabitMetricGrid>
      );
    }

    if (item.mode === 'number') {
      return (
        <HabitQuickControls>
          <RecordInputGroup>
            <span>값</span>
            <RecordNumberInput
              min={0}
              value={record.value ?? ''}
              disabled={disabled}
              onChange={(event) => saveHabitPatch(item.id, { value: readNumber(event.target.value) })}
              placeholder={`${item.target}`}
            />
            <em>{item.unit}</em>
          </RecordInputGroup>
          {[1, 3, 5].map((amount) => (
            <QuickRecordButton key={amount} type="button" disabled={disabled} onClick={() => saveHabitPatch(item.id, { value: (record.value ?? 0) + amount })}>
              +{amount}
            </QuickRecordButton>
          ))}
        </HabitQuickControls>
      );
    }

    if (item.mode === 'sets') {
      const sets = record.sets ?? [];
      return (
        <SetEditor>
          {sets.slice(0, 3).map((entry, index) => (
            <SetEditorRow key={entry.id}>
              <span>{index + 1}</span>
              <RecordNumberInput
                min={0}
                value={entry.reps || ''}
                disabled={disabled}
                onChange={(event) => {
                  const nextSets = sets.map((setEntry) =>
                    setEntry.id === entry.id ? { ...setEntry, reps: readNumber(event.target.value) ?? 0 } : setEntry,
                  );
                  saveHabitPatch(item.id, { sets: nextSets });
                }}
                placeholder="횟수"
              />
              <RecordNumberInput
                min={0}
                value={entry.load || ''}
                disabled={disabled}
                onChange={(event) => {
                  const nextSets = sets.map((setEntry) =>
                    setEntry.id === entry.id ? { ...setEntry, load: readNumber(event.target.value) ?? 0 } : setEntry,
                  );
                  saveHabitPatch(item.id, { sets: nextSets });
                }}
                placeholder="무게"
              />
              <TinyIconButton type="button" disabled={disabled} onClick={() => saveHabitPatch(item.id, { sets: sets.filter((setEntry) => setEntry.id !== entry.id) })}>
                <Minus size={14} />
              </TinyIconButton>
            </SetEditorRow>
          ))}
          <QuickRecordButton
            type="button"
            disabled={disabled}
            onClick={() => saveHabitPatch(item.id, { sets: [...sets, { id: makeQuickId('set'), reps: 10, load: 0 }] })}
          >
            <Plus size={14} />
            세트 추가
          </QuickRecordButton>
        </SetEditor>
      );
    }

    if (item.mode === 'duration') {
      return (
        <HabitQuickControls>
          <RecordInputGroup>
            <span>시간</span>
            <RecordNumberInput
              min={0}
              value={record.minutes ?? ''}
              disabled={disabled}
              onChange={(event) => saveHabitPatch(item.id, { minutes: readNumber(event.target.value) })}
              placeholder={`${item.target}`}
            />
            <em>{item.unit}</em>
          </RecordInputGroup>
          {[10, 25, 50].map((amount) => (
            <QuickRecordButton key={amount} type="button" disabled={disabled} onClick={() => saveHabitPatch(item.id, { minutes: (record.minutes ?? 0) + amount })}>
              +{amount}
            </QuickRecordButton>
          ))}
        </HabitQuickControls>
      );
    }

    if (item.mode === 'rating') {
      const target = Math.min(Math.max(Math.round(item.target || 5), 1), 5);
      return (
        <RatingControls>
          {Array.from({ length: target }, (_, index) => index + 1).map((rating) => (
            <RatingButton
              key={rating}
              type="button"
              disabled={disabled}
              $active={(record.rating ?? 0) >= rating}
              onClick={() => saveHabitPatch(item.id, { rating: record.rating === rating ? undefined : rating })}
              aria-label={`${rating}점`}
            >
              <Star size={17} fill={(record.rating ?? 0) >= rating ? 'currentColor' : 'none'} />
            </RatingButton>
          ))}
        </RatingControls>
      );
    }

    if (isChoiceMode(item.mode)) {
      const options = getHabitChoiceOptions(item);
      const selectedIds = getSelectedOptionIds(item, record);
      const isSingle = item.mode === 'singleChoice';

      if (options.length === 0) {
        return <RecordHintText>전체 화면에서 선택 항목을 먼저 추가하세요.</RecordHintText>;
      }

      return (
        <ChoiceControls>
          {options.map((option) => {
            const active = selectedIds.includes(option.id);
            return (
              <ChoiceRecordButton
                key={option.id}
                type="button"
                disabled={disabled}
                $active={active}
                onClick={() => {
                  if (isSingle) {
                    saveHabitPatch(item.id, {
                      selectedOptionId: active ? undefined : option.id,
                      selectedOptionIds: undefined,
                    });
                    return;
                  }

                  const nextIds = active ? selectedIds.filter((id) => id !== option.id) : [...selectedIds, option.id];
                  saveHabitPatch(item.id, {
                    selectedOptionIds: nextIds,
                    selectedOptionId: undefined,
                  });
                }}
              >
                <Check size={14} />
                {option.label}
              </ChoiceRecordButton>
            );
          })}
        </ChoiceControls>
      );
    }

    return (
      <HabitNoteInput
        value={record.note ?? ''}
        disabled={disabled}
        onChange={(event) => saveHabitPatch(item.id, { note: event.target.value })}
        placeholder="기록 메모"
        rows={2}
      />
    );
  };

  const renderWidget = (id: WidgetId, chrome: WidgetChrome) => {
    if (id === 'memo') {
      return (
        <WidgetPanel $accent="#2dd4bf">
          <WidgetHeader>
            {chrome.renderTitle(<NotebookPen size={20} />)}
            <WidgetHeaderActions>
              <WidgetLink href="/propig/memos" aria-label="메모장 전체 보기">
                <ArrowUpRight size={17} />
              </WidgetLink>
              {chrome.hideButton}
            </WidgetHeaderActions>
          </WidgetHeader>

          <WidgetRouteBar aria-label="메모장 보기 옵션">
            <WidgetRoutePill href="/propig/memos">
              <NotebookPen size={14} />
              전체 메모
            </WidgetRoutePill>
          </WidgetRouteBar>

          <QuickForm data-propig-memo-form onSubmit={handleMemoSubmit}>
            <MemoInput
              value={memoDraft}
              maxLength={MAX_MEMO_LENGTH}
              onChange={(event) => setMemoDraft(event.target.value)}
              placeholder="바로 적기"
              rows={4}
            />
            <PrimaryButton type="submit" disabled={!memoDraft.trim()}>
              <Plus size={16} />
              추가
            </PrimaryButton>
          </QuickForm>

          <MemoCategoryPanel>
            <MemoCategoryInput
              value={memoCategoryDraft}
              onChange={(event) => setMemoCategoryDraft(event.target.value)}
              placeholder="카테고리"
              maxLength={24}
            />
            <MemoColorPicker aria-label="새 메모 색상 선택">
              <MemoColorPickerLabel>
                <Palette size={14} />
                새 메모 색상
              </MemoColorPickerLabel>
              <MemoColorSwatches>
                {TAG_COLOR_ORDER.map((color) => (
                  <MemoColorSwatch
                    key={color}
                    type="button"
                    $color={MEMO_COLOR_VALUES[color]}
                    $active={memoColorDraft === color}
                    onClick={() => setMemoColorDraft(color)}
                    aria-pressed={memoColorDraft === color}
                    aria-label={`${MEMO_COLOR_LABELS[color]} 색상 선택`}
                    title={MEMO_COLOR_LABELS[color]}
                  />
                ))}
              </MemoColorSwatches>
            </MemoColorPicker>
            <MemoCategoryScroller aria-label="메모 카테고리 필터">
              {memoCategoryOptions.map((option) => (
                <MemoCategoryChip
                  key={option.id}
                  type="button"
                  $active={memoCategoryFilter === option.id}
                  onClick={() => setMemoCategoryFilter(option.id)}
                >
                  {option.label}
                  <span>{option.count}</span>
                </MemoCategoryChip>
              ))}
            </MemoCategoryScroller>
            <MemoColorScroller aria-label="메모 색상 카테고리 필터">
              {memoColorOptions.map((option) => (
                <MemoColorCategoryChip
                  key={option.id}
                  type="button"
                  $active={memoColorFilter === option.id}
                  $color={option.color}
                  onClick={() => setMemoColorFilter(option.id)}
                  aria-pressed={memoColorFilter === option.id}
                >
                  {option.id === MEMO_ALL_COLORS ? null : <MemoColorDot $color={option.color} aria-hidden="true" />}
                  {option.label}
                  <span>{option.count}</span>
                </MemoColorCategoryChip>
              ))}
            </MemoColorScroller>
          </MemoCategoryPanel>

          <StatusText>{storageError ?? `${activeNotes.length}개 표시 중`}</StatusText>
          <MemoRowList data-propig-memo-row-list>
            {activeNotes.length > 0 ? (
              activeNotes.map((note) => {
                const open = openMemoIds.includes(note.id);
                const colorValue = MEMO_COLOR_VALUES[note.color];

                return (
                  <MemoAccordionItem key={note.id}>
                    <DataRow
                      $done={false}
                      $accent={colorValue}
                      role="button"
                      tabIndex={0}
                      title={open ? '메모 접기' : '메모 펼치기'}
                      aria-expanded={open}
                      onClick={() => toggleMemoAccordion(note.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        toggleMemoAccordion(note.id);
                      }}
                    >
                      <MemoColorDot $color={colorValue} title={MEMO_COLOR_LABELS[note.color]} aria-hidden="true" />
                      <RowMain>
                        <RowTitle>{getMemoTitle(note.content)}</RowTitle>
                        <RowMeta>
                          {formatMemoUpdatedAt(note.updatedAt)}
                          <span>{MEMO_COLOR_LABELS[note.color]}</span>
                          {note.tags.length > 0 ? (
                            note.tags.slice(0, 2).map((tag) => <MemoTag key={tag}>{tag}</MemoTag>)
                          ) : (
                            <MemoTag $muted>미분류</MemoTag>
                          )}
                        </RowMeta>
                      </RowMain>
                      <AccordionState $open={open}>{open ? '열림' : '보기'}</AccordionState>
                      <IconButton
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMemoIds((current) => current.filter((id) => id !== note.id));
                          deleteNote(note.id);
                        }}
                        aria-label="메모 삭제"
                        title="삭제"
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </DataRow>
                    {open ? (
                      <MemoInlinePanel $color={colorValue}>
                        <MemoInlineTextarea
                          data-propig-memo-inline-editor
                          value={note.content}
                          maxLength={MAX_MEMO_LENGTH}
                          onChange={(event) => updateNote(note.id, { content: event.target.value.slice(0, MAX_MEMO_LENGTH) })}
                          placeholder="메모 내용을 입력하세요."
                          aria-label="메모 내용"
                          rows={getMemoTextareaRows(note.content)}
                        />
                        <MemoInlineFooter>
                          <MemoInlinePreview>{getMemoPreview(note.content)}</MemoInlinePreview>
                          <MemoInlineSwatches aria-label="메모 색상 변경">
                            {TAG_COLOR_ORDER.map((color) => (
                              <MemoColorSwatch
                                key={color}
                                type="button"
                                $color={MEMO_COLOR_VALUES[color]}
                                $active={note.color === color}
                                onClick={() => updateNote(note.id, { color })}
                                aria-pressed={note.color === color}
                                aria-label={`${MEMO_COLOR_LABELS[color]}로 변경`}
                                title={MEMO_COLOR_LABELS[color]}
                              />
                            ))}
                          </MemoInlineSwatches>
                        </MemoInlineFooter>
                      </MemoInlinePanel>
                    ) : null}
                  </MemoAccordionItem>
                );
              })
            ) : (
              <EmptyState>{memoBaseNotes.length > 0 ? '선택한 조건에 맞는 메모가 없습니다.' : '첫 메모를 추가하세요.'}</EmptyState>
            )}
          </MemoRowList>
        </WidgetPanel>
      );
    }

    if (id === 'habit') {
      return (
        <WidgetPanel $accent="#42d392">
          <WidgetHeader>
            {chrome.renderTitle(<Target size={20} />)}
            <WidgetHeaderActions>
              <WidgetLink href="/habit-tracker" aria-label="습관 트래커 전체 보기">
                <ArrowUpRight size={17} />
              </WidgetLink>
              {chrome.hideButton}
            </WidgetHeaderActions>
          </WidgetHeader>

          <WidgetRouteBar aria-label="습관 트래커 보기 선택">
            <WidgetRoutePill href="/habit-tracker">
              <Target size={14} />
              기록
            </WidgetRoutePill>
            <WidgetRoutePill href="/habit-tracker/stats">
              <BarChart3 size={14} />
              통계
            </WidgetRoutePill>
            <WidgetRoutePill href="/habit-tracker/manage">
              <Settings2 size={14} />
              관리
            </WidgetRoutePill>
          </WidgetRouteBar>

          <HabitDateBar>
            <HabitDateLabel>
              <CalendarDays size={15} />
              {formatHabitDate(habitDateKey)}
            </HabitDateLabel>
            <HabitDateInput
              type="date"
              value={habitDateKey}
              onChange={(event) => setHabitDateKey(event.target.value || todayKey)}
              aria-label="습관 기록 날짜"
            />
          </HabitDateBar>

          {renderDateStrip(habitDateKey, setHabitDateKey, '습관 날짜 빠른 선택')}

          <HabitCategoryScroller aria-label="습관 분류 선택">
            {habitCategoryOptions.map((option) => (
              <HabitCategoryChip
                key={option.id}
                type="button"
                $active={activeHabitCategoryFilter === option.id}
                $color={option.color}
                onClick={() => setHabitCategoryFilter(option.id)}
                aria-pressed={activeHabitCategoryFilter === option.id}
              >
                {option.label}
                <span>{option.count}</span>
              </HabitCategoryChip>
            ))}
          </HabitCategoryScroller>

          <QuickForm onSubmit={(event) => void handleHabitSubmit(event)}>
            <TextInput
              value={habitDraft}
              onChange={(event) => setHabitDraft(event.target.value)}
              placeholder={activeHabitCategoryFilter === HABIT_ALL_CATEGORY ? '오늘부터 할 습관' : '선택한 분류에 습관 추가'}
              disabled={isDataLocked}
            />
            <PrimaryButton type="submit" disabled={isDataLocked || !habitDraft.trim() || savingKey === 'habit:create'}>
              {savingKey === 'habit:create' ? <SpinningLoader size={16} /> : <Plus size={16} />}
              추가
            </PrimaryButton>
          </QuickForm>

          <StatusText>{habit.error ?? getWidgetStatusText(habit.state, currentUser)}</StatusText>
          <RowList>
            {visibleHabits.length > 0 ? (
              visibleHabits.map((item) => {
                const record = habit.selectedRecords[item.id] ?? {};
                const done = isHabitRecordDone(record);
                const color = getHabitCategoryColor(habit.workspace.categories, item.categoryId);
                const isCheckMode = item.mode === 'check';
                const editorOpen = openHabitRecordIds.includes(item.id);
                return (
                  <HabitRecordGroup key={item.id}>
                    <DataRow
                      $done={done}
                      $accent={color}
                      role={isCheckMode ? undefined : 'button'}
                      tabIndex={isCheckMode ? undefined : 0}
                      onClick={isCheckMode ? undefined : () => toggleHabitRecordEditor(item.id)}
                      onKeyDown={(event) => {
                        if (isCheckMode || (event.key !== 'Enter' && event.key !== ' ')) return;
                        event.preventDefault();
                        toggleHabitRecordEditor(item.id);
                      }}
                    >
                      {isCheckMode ? (
                        <CheckButton
                          type="button"
                          disabled={!currentUser}
                          onClick={(event) => {
                            event.stopPropagation();
                            void habit.toggleHabit(item);
                          }}
                          aria-label={`${item.name} 체크`}
                          title="체크"
                        >
                          {done ? <Check size={16} /> : <Circle size={16} />}
                        </CheckButton>
                      ) : (
                        <RecordToggleButton
                          type="button"
                          disabled={!currentUser}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleHabitRecordEditor(item.id);
                          }}
                          aria-expanded={editorOpen}
                          aria-label={`${item.name} 기록 ${editorOpen ? '접기' : '펼치기'}`}
                          title={editorOpen ? '기록 접기' : '기록 펼치기'}
                          $open={editorOpen}
                        >
                          <ChevronDown size={16} />
                        </RecordToggleButton>
                      )}
                      <RowMain>
                        <RowTitle>{item.name}</RowTitle>
                        <RowMeta>
                          {getHabitCategoryName(habit.workspace.categories, item.categoryId)} · {HABIT_MODE_LABELS[item.mode]}
                        </RowMeta>
                      </RowMain>
                      {isCheckMode ? null : <AccordionState $open={editorOpen}>{editorOpen ? '열림' : '기록'}</AccordionState>}
                    </DataRow>
                    {!isCheckMode && editorOpen ? <HabitInlineEditor>{renderHabitRecordControls(item, record)}</HabitInlineEditor> : null}
                  </HabitRecordGroup>
                );
              })
            ) : (
              <EmptyState>
                {currentUser
                  ? activeHabitCategoryFilter === HABIT_ALL_CATEGORY
                    ? '첫 습관을 추가하세요.'
                    : '선택한 분류에 습관이 없습니다.'
                  : '로그인하면 습관을 쓸 수 있습니다.'}
              </EmptyState>
            )}
          </RowList>
        </WidgetPanel>
      );
    }

    if (id === 'bucket') {
      return (
        <WidgetPanel $accent="#f59e0b">
          <WidgetHeader>
            {chrome.renderTitle(<Flag size={20} />)}
            <WidgetHeaderActions>
              <WidgetLink href="/bucket-list" aria-label="버킷리스트 전체 보기">
                <ArrowUpRight size={17} />
              </WidgetLink>
              {chrome.hideButton}
            </WidgetHeaderActions>
          </WidgetHeader>

          <WidgetRouteBar aria-label="버킷리스트 보기 옵션">
            <WidgetRoutePill href="/bucket-list">
              <Flag size={14} />
              전체 버킷
            </WidgetRoutePill>
          </WidgetRouteBar>

          <QuickForm onSubmit={(event) => void handleBucketSubmit(event)}>
            <TextInput
              value={bucketDraft}
              onChange={(event) => setBucketDraft(event.target.value)}
              placeholder="하고 싶은 일"
              disabled={isDataLocked}
            />
            <PrimaryButton type="submit" disabled={isDataLocked || !bucketDraft.trim() || savingKey === 'bucket:create'}>
              {savingKey === 'bucket:create' ? <SpinningLoader size={16} /> : <Plus size={16} />}
              추가
            </PrimaryButton>
          </QuickForm>

          <StatusText>{bucket.error ?? getWidgetStatusText(bucket.state, currentUser)}</StatusText>
          <RowList>
            {visibleBuckets.length > 0 ? (
              visibleBuckets.map((item) => {
                const category = bucket.categories.find((nextCategory) => nextCategory.id === item.category);
                const accent = category?.color ?? '#f59e0b';
                const open = openBucketIds.includes(item.id);
                const panelId = `propig-bucket-panel-${item.id}`;

                return (
                  <BucketAccordionItem key={item.id}>
                    <DataRow
                      $done={item.status === 'done'}
                      $accent={accent}
                      role="button"
                      tabIndex={0}
                      title={open ? '버킷 내용 닫기' : '버킷 내용 보기'}
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggleBucketAccordion(item.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        toggleBucketAccordion(item.id);
                      }}
                    >
                      <StatusPill
                        type="button"
                        $status={item.status}
                        onClick={(event) => {
                          event.stopPropagation();
                          void bucket.updateStatus(item);
                        }}
                      >
                        {BUCKET_STATUS_LABELS[item.status]}
                      </StatusPill>
                      <RowMain>
                        <RowTitle>{item.title}</RowTitle>
                        <RowMeta>
                          <span>{category?.label ?? '기본'}</span>
                          <DdayPill $tone={getBucketDdayTone(item, todayKey)}>{formatBucketDday(item.targetDate, todayKey)}</DdayPill>
                          {item.targetDate ? <span>{item.targetDate}</span> : null}
                        </RowMeta>
                      </RowMain>
                      <AccordionState $open={open}>{open ? '열림' : '보기'}</AccordionState>
                      <IconButton
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenBucketIds((current) => current.filter((id) => id !== item.id));
                          void bucket.removeItem(item.id);
                        }}
                        aria-label="버킷 삭제"
                        title="삭제"
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </DataRow>
                    {open ? (
                      <BucketInlinePanel id={panelId} role="region" aria-label={`${item.title} 내용`} $accent={accent}>
                        <BucketInlineNote>
                          {item.note || '메모가 없습니다. 버킷리스트 전체 보기에서 이유와 첫 행동을 적어보세요.'}
                        </BucketInlineNote>
                        <BucketInlineMeta>
                          <BucketInlineMetaItem>
                            <span>분류</span>
                            <strong>{category?.label ?? '기본'}</strong>
                          </BucketInlineMetaItem>
                          <BucketInlineMetaItem>
                            <span>목표일</span>
                            <strong>{item.targetDate || '날짜 없음'}</strong>
                          </BucketInlineMetaItem>
                          <BucketInlineMetaItem>
                            <span>상태</span>
                            <strong>{BUCKET_STATUS_LABELS[item.status]}</strong>
                          </BucketInlineMetaItem>
                        </BucketInlineMeta>
                        <BucketPanelActions>
                          <SecondaryInlineButton type="button" onClick={() => openRoute('/bucket-list')}>
                            <ArrowUpRight size={14} />
                            전체 보기
                          </SecondaryInlineButton>
                        </BucketPanelActions>
                      </BucketInlinePanel>
                    ) : null}
                  </BucketAccordionItem>
                );
              })
            ) : (
              <EmptyState>{currentUser ? '첫 버킷을 추가하세요.' : '로그인하면 버킷리스트를 쓸 수 있습니다.'}</EmptyState>
            )}
          </RowList>
        </WidgetPanel>
      );
    }

    return (
      <WidgetPanel $accent="#60a5fa">
        <WidgetHeader>
          {chrome.renderTitle(<ClipboardList size={20} />)}
          <WidgetHeaderActions>
            <WidgetLink href="/todo-list" aria-label="할일 일정표 전체 보기">
              <ArrowUpRight size={17} />
            </WidgetLink>
            {chrome.hideButton}
          </WidgetHeaderActions>
        </WidgetHeader>

        <HabitDateBar>
          <HabitDateLabel>
            <CalendarDays size={15} />
            {formatHabitDate(todoDateKey)}
          </HabitDateLabel>
          <HabitDateInput
            type="date"
            value={todoDateKey}
            onChange={(event) => setTodoDateKey(event.target.value || todayKey)}
            aria-label="할일 일정 날짜"
          />
        </HabitDateBar>

        {renderDateStrip(todoDateKey, setTodoDateKey, '할일 날짜 빠른 선택')}

        <ScheduleForm onSubmit={(event) => void handleTodoSubmit(event)}>
          <TextInput
            value={todoDraft}
            onChange={(event) => setTodoDraft(event.target.value)}
            placeholder="오늘 할일"
            disabled={isDataLocked}
          />
          <TimeInput value={todoTime} onChange={(event) => setTodoTime(event.target.value)} type="time" aria-label="시간" disabled={isDataLocked} />
          <PrimaryButton type="submit" disabled={isDataLocked || !todoDraft.trim() || savingKey === 'todo:create'}>
            {savingKey === 'todo:create' ? <SpinningLoader size={16} /> : <Plus size={16} />}
            추가
          </PrimaryButton>
        </ScheduleForm>

        <StatusText>{todo.error ?? getWidgetStatusText(todo.state, currentUser)}</StatusText>
        <RowList>
          {todo.todayOccurrences.length > 0 || todo.anytimeTasks.length > 0 ? (
            <>
              {todo.todayOccurrences.slice(0, 5).map(({ task, dateKey, completed }) => (
                <DataRow
                  key={`${task.id}-${dateKey}`}
                  $done={completed}
                  $accent={todo.categories.find((category) => category.id === task.categoryId)?.color ?? '#60a5fa'}
                >
                  <CheckButton type="button" onClick={() => void todo.toggleTask(task, dateKey)} aria-label={`${task.title} 완료`}>
                    {completed ? <Check size={16} /> : <Circle size={16} />}
                  </CheckButton>
                  <RowMain>
                    <RowTitle>{task.title}</RowTitle>
                    <RowMeta>
                      <CalendarDays size={13} /> {formatTimeLabel(task.time)} · {TODO_RECURRENCE_LABELS[task.recurrence.mode]}
                    </RowMeta>
                  </RowMain>
                  <IconButton
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleTodoRemove(task);
                    }}
                    aria-label={`${task.title} 삭제`}
                    title="삭제"
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </DataRow>
              ))}
              {todo.anytimeTasks.slice(0, Math.max(0, 5 - todo.todayOccurrences.length)).map((task) => (
                <DataRow key={task.id} $done={false} $accent={todo.categories.find((category) => category.id === task.categoryId)?.color ?? '#60a5fa'}>
                  <CheckButton type="button" onClick={() => void todo.toggleTask(task, TODO_ANYTIME_COMPLETION_KEY)} aria-label={`${task.title} 완료`}>
                    <Circle size={16} />
                  </CheckButton>
                  <RowMain>
                    <RowTitle>{task.title}</RowTitle>
                    <RowMeta>상시 · {todo.categories.find((category) => category.id === task.categoryId)?.label ?? '기본'}</RowMeta>
                  </RowMain>
                  <IconButton
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleTodoRemove(task);
                    }}
                    aria-label={`${task.title} 삭제`}
                    title="삭제"
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </DataRow>
              ))}
            </>
          ) : (
            <EmptyState>{currentUser ? '오늘 할일을 추가하세요.' : '로그인하면 일정표를 쓸 수 있습니다.'}</EmptyState>
          )}
        </RowList>
      </WidgetPanel>
    );
  };

  return (
    <DashboardShell>
      <DashboardHeader>
        <HeaderCopy>
          <DateText>
            <CalendarDays size={15} />
            {dateLabel}
          </DateText>
          <PageTitle>위젯 대시보드</PageTitle>
          <HeroSummary>
            <span>{heroStatus}</span>
            <em>{heroDetail}</em>
          </HeroSummary>
          <ProgressTrack aria-label={`오늘 루틴 진행률 ${dailyProgress}%`}>
            <ProgressFill $value={dailyProgress} />
          </ProgressTrack>
        </HeaderCopy>

        <HeaderActions>
          {installedWidgetIds.has('memo') ? (
            <MetricTile $tone="memo">
              <NotebookPen size={17} />
              <MetricCopy>
                <strong>{memoCount}</strong>
                <span>메모</span>
              </MetricCopy>
            </MetricTile>
          ) : null}
          {installedWidgetIds.has('habit') ? (
            <MetricTile $tone="habit">
              <Target size={17} />
              <MetricCopy>
                <strong>
                  {habitDoneCount}/{habitTotalCount}
                </strong>
                <span>습관</span>
              </MetricCopy>
            </MetricTile>
          ) : null}
          {installedWidgetIds.has('todo') ? (
            <MetricTile $tone="todo">
              <ClipboardList size={17} />
              <MetricCopy>
                <strong>{todoOpenCount}</strong>
                <span>할일</span>
              </MetricCopy>
            </MetricTile>
          ) : null}
          {installedWidgetIds.has('bucket') ? (
            <MetricTile $tone="bucket">
              <Flag size={17} />
              <MetricCopy>
                <strong>{bucketOpenCount}</strong>
                <span>버킷</span>
              </MetricCopy>
            </MetricTile>
          ) : null}
          {!currentUser ? (
            <LoginButton type="button" onClick={() => void handleSignIn()} disabled={authLoading || !isConfigured || isSigningIn}>
              {isSigningIn ? <SpinningLoader size={16} /> : <LogIn size={16} />}
              로그인
            </LoginButton>
          ) : null}
        </HeaderActions>
      </DashboardHeader>

      <LayoutBar>
        <LayoutTitle>
          <SlidersHorizontal size={17} />
          위젯 배치
        </LayoutTitle>
        <LayoutActions>
          {hiddenWidgets.length > 0 ? (
            hiddenWidgets.map((id) => (
              <ShowWidgetButton key={id} type="button" onClick={() => showWidget(id)}>
                <Eye size={15} />
                {WIDGET_LABELS[id]}
              </ShowWidgetButton>
            ))
          ) : (
            <LayoutStatus>전체 표시</LayoutStatus>
          )}
          <ResetLayoutButton type="button" onClick={resetWidgetLayout}>
            <RotateCcw size={15} />
            초기화
          </ResetLayoutButton>
        </LayoutActions>
      </LayoutBar>

      {visibleWidgetIds.length > 0 ? (
        <DndContext id="propig-widget-sort" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleWidgetDragEnd}>
          <SortableContext items={visibleWidgetIds} strategy={rectSortingStrategy}>
            <WidgetGrid>
              {visibleWidgetIds.map((id) => (
                <SortableWidget key={id} id={id} label={WIDGET_LABELS[id]} onHide={hideWidget}>
                  {(chrome) => renderWidget(id, chrome)}
                </SortableWidget>
              ))}
            </WidgetGrid>
          </SortableContext>
        </DndContext>
      ) : (
        <AllHiddenState>상점에서 앱을 등록하면 대시보드 위젯이 표시됩니다.</AllHiddenState>
      )}
    </DashboardShell>
  );
}

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

const accordionReveal = keyframes`
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const DashboardShell = styled.main`
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  --bg: #07110e;
  --surface: #0e1715;
  --surface-raised: #121f1b;
  --surface-soft: #17241f;
  --surface-hover: #1d3129;
  --border: #243831;
  --border-strong: #38564a;
  --text: #eff8f1;
  --muted: #a4b4aa;
  --faint: #74847b;
  --accent: #42d392;
  --accent-soft: rgba(66, 211, 146, 0.14);
  --accent-border: rgba(66, 211, 146, 0.42);
  --danger: #ff8f8f;
  --danger-soft: rgba(255, 104, 104, 0.12);
  --warning: #f7c76d;
  --blue: #8fb8ff;
  background:
    linear-gradient(90deg, rgba(66, 211, 146, 0.1) 0 1px, transparent 1px 100%),
    linear-gradient(180deg, rgba(143, 184, 255, 0.07) 0 1px, transparent 1px 100%),
    linear-gradient(145deg, #07110e 0%, #091211 43%, #13150f 100%);
  background-size: 72px 72px, 72px 72px, auto;
  color: var(--text);
  color-scheme: dark;
  isolation: isolate;
  overflow-y: auto;
  padding: clamp(16px, 3vw, 34px);
  position: relative;

  body[data-propig-design='codeit'] & {
    --bg: var(--codeit-bg);
    --surface: var(--codeit-surface);
    --surface-raised: var(--codeit-surface);
    --surface-soft: var(--codeit-surface-soft);
    --surface-hover: #eef2f8;
    --border: rgba(31, 36, 51, 0.1);
    --border-strong: rgba(31, 36, 51, 0.16);
    --text: var(--codeit-text);
    --muted: var(--codeit-muted);
    --faint: var(--codeit-faint);
    --accent: var(--codeit-primary);
    --accent-soft: var(--codeit-primary-soft);
    --accent-border: var(--codeit-primary-border);
    --danger: var(--codeit-danger);
    --danger-soft: var(--codeit-danger-soft);
    --warning: var(--codeit-warning);
    --blue: var(--codeit-primary);
    background: var(--codeit-bg);
    color-scheme: light;
  }

  &::before {
    background: linear-gradient(120deg, rgba(66, 211, 146, 0.18), transparent 38%, rgba(143, 184, 255, 0.12));
    content: '';
    inset: 0;
    opacity: 0.52;
    pointer-events: none;
    position: absolute;
    z-index: 0;
  }

  body[data-propig-design='codeit'] &::before {
    background: none;
    opacity: 0;
  }

  > * {
    position: relative;
    z-index: 1;
  }

  @media (max-width: 720px) {
    padding: 18px 16px calc(30px + env(safe-area-inset-bottom));
  }
`;

const DashboardHeader = styled.header`
  align-items: flex-end;
  display: flex;
  gap: 18px;
  justify-content: space-between;
  margin: 0 auto 16px;
  max-width: 1240px;
  padding: 10px 0 18px;
  position: relative;

  &::after {
    background: linear-gradient(90deg, rgba(66, 211, 146, 0.44), rgba(143, 184, 255, 0.24), transparent);
    bottom: 0;
    content: '';
    height: 1px;
    left: 0;
    position: absolute;
    right: 0;
  }

  body[data-propig-design='codeit'] &::after {
    background: var(--codeit-border);
  }

  @media (max-width: 860px) {
    align-items: stretch;
    flex-direction: column;
  }

  body[data-propig-design='codeit'] & {
    align-items: center;
    background: var(--codeit-surface);
    border: 1px solid var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
    margin-bottom: 18px;
    padding: clamp(18px, 3vw, 30px);
    backdrop-filter: none;
  }

  body[data-propig-design='codeit'] &::after {
    display: none;
  }
`;

const HeaderCopy = styled.div`
  flex: 1 1 auto;
  max-width: 620px;
  min-width: 0;

  @media (max-width: 860px) {
    max-width: none;
  }
`;

const DateText = styled.p`
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.9rem;
  font-weight: 700;
  gap: 7px;
  margin: 0 0 6px;
`;

const PageTitle = styled.h1`
  font-size: clamp(1.55rem, 3vw, 2.4rem);
  letter-spacing: 0;
  line-height: 1.05;
  margin: 0;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-text);
    font-size: clamp(2.05rem, 4vw, 3.6rem);
    font-weight: 950;
  }
`;

const HeroSummary = styled.div`
  align-items: center;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.9rem;
  font-weight: 800;
  gap: 8px 12px;
  margin-top: 10px;

  span {
    color: #c8f5db;
  }

  em {
    color: var(--faint);
    font-style: normal;
  }

  body[data-propig-design='codeit'] & span {
    color: var(--codeit-primary);
  }
`;

const ProgressTrack = styled.div`
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 999px;
  height: 8px;
  margin-top: 14px;
  max-width: 420px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $value: number }>`
  background: linear-gradient(90deg, #2dd4bf, #42d392 52%, #f7c76d);
  border-radius: inherit;
  height: 100%;
  transition: width 0.32s ease;
  width: ${({ $value }) => $value}%;
`;

const HeaderActions = styled.div`
  align-items: stretch;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  max-width: 560px;

  @media (max-width: 860px) {
    justify-content: flex-start;
  }

  @media (max-width: 520px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-width: none;

    > button {
      grid-column: 1 / -1;
    }
  }
`;

const metricToneColor: Record<MetricTone, string> = {
  memo: '#2dd4bf',
  habit: '#42d392',
  todo: '#60a5fa',
  bucket: '#f59e0b',
};

const MetricTile = styled.div<{ $tone: MetricTone }>`
  align-items: center;
  background:
    linear-gradient(180deg, rgba(18, 31, 27, 0.92), rgba(8, 15, 14, 0.9)),
    ${({ $tone }) => `linear-gradient(90deg, ${metricToneColor[$tone]}24, transparent)`};
  border: 1px solid ${({ $tone }) => `${metricToneColor[$tone]}55`};
  border-radius: 8px;
  display: flex;
  gap: 9px;
  min-height: 42px;
  min-width: 76px;
  padding: 8px 12px;
  position: relative;

  svg {
    color: ${({ $tone }) => metricToneColor[$tone]};
    flex: 0 0 auto;
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: ${({ $tone }) => `${metricToneColor[$tone]}40`};
    box-shadow: var(--codeit-shadow-sm);
  }
`;

const MetricCopy = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: 1.05rem;
    line-height: 1;
  }

  span {
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 700;
    white-space: nowrap;
  }
`;

const LoginButton = styled.button`
  align-items: center;
  background: linear-gradient(135deg, #42d392, #2dd4bf);
  border: 0;
  border-radius: 8px;
  color: #06110d;
  cursor: pointer;
  display: inline-flex;
  font-weight: 800;
  gap: 7px;
  justify-content: center;
  min-height: 42px;
  padding: 0 14px;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease;

  &:hover:not(:disabled) {
    box-shadow: 0 10px 26px rgba(45, 212, 191, 0.2);
    transform: translateY(-1px);
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary);
    color: #ffffff;
    box-shadow: 0 12px 28px rgba(37, 87, 214, 0.2);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

const LayoutBar = styled.section`
  align-items: center;
  background: rgba(8, 15, 14, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  backdrop-filter: blur(16px);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin: 0 auto 14px;
  max-width: 1240px;
  padding: 11px 12px;

  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-sm);
  }
`;

const LayoutTitle = styled.div`
  align-items: center;
  color: var(--text);
  display: inline-flex;
  font-size: 0.9rem;
  font-weight: 900;
  gap: 8px;
  white-space: nowrap;
`;

const LayoutActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;

  @media (max-width: 760px) {
    justify-content: flex-start;
  }
`;

const LayoutStatus = styled.span`
  color: #c8f5db;
  font-size: 0.82rem;
  font-weight: 800;
  padding: 0 6px;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-muted);
  }
`;

const ShowWidgetButton = styled.button`
  align-items: center;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  color: #baf5d0;
  cursor: pointer;
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 900;
  gap: 6px;
  min-height: 32px;
  padding: 0 11px;
  white-space: nowrap;

  &:hover {
    background: rgba(66, 211, 146, 0.2);
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary-soft);
    border-color: var(--codeit-primary-border);
    color: var(--codeit-primary);
  }

  body[data-propig-design='codeit'] &:hover {
    background: rgba(52, 81, 209, 0.13);
    color: var(--codeit-primary-hover);
  }
`;

const ResetLayoutButton = styled.button`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 900;
  gap: 6px;
  min-height: 32px;
  padding: 0 11px;
  white-space: nowrap;

  &:hover {
    background: var(--surface-hover);
  }
`;

const WidgetGrid = styled.section`
  align-items: start;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0 auto;
  max-width: 1240px;

  @media (max-width: 940px) {
    grid-template-columns: 1fr;
  }
`;

const SortableWidgetFrame = styled.div<{ $dragging: boolean }>`
  display: flex;
  flex-direction: column;
  min-width: 0;
  opacity: ${({ $dragging }) => ($dragging ? 0.72 : 1)};
  position: relative;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
  z-index: ${({ $dragging }) => ($dragging ? 3 : 1)};
`;

const HideWidgetButton = styled.button`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 900;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  white-space: nowrap;

  &:hover {
    background: var(--danger-soft);
    border-color: rgba(255, 143, 143, 0.38);
    color: var(--danger);
  }
`;

const WidgetPanel = styled.section<{ $accent: string }>`
  background:
    linear-gradient(180deg, rgba(18, 31, 27, 0.98), rgba(8, 15, 14, 0.98)),
    ${({ $accent }) => `linear-gradient(135deg, ${$accent}18, transparent 42%)`};
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  border-top: 4px solid ${({ $accent }) => $accent};
  box-shadow:
    0 18px 44px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  min-height: 392px;
  min-width: 0;
  overflow: hidden;
  padding: clamp(14px, 2vw, 20px);
  position: relative;

  &::before {
    background: ${({ $accent }) => `linear-gradient(90deg, ${$accent}66, transparent 52%)`};
    content: '';
    height: 1px;
    left: 0;
    opacity: 0.9;
    position: absolute;
    right: 0;
    top: 0;
  }

  @media (max-width: 520px) {
    min-height: 360px;
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
    animation: propigCodeitCardIn 0.58s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  body[data-propig-design='codeit'] &::before {
    background: ${({ $accent }) => $accent};
    opacity: 0.35;
  }

  body[data-propig-design='codeit'] &:hover {
    transform: translateY(-3px);
    transition: transform 0.22s ease, box-shadow 0.22s ease;
    box-shadow: var(--codeit-shadow-lg);
  }

  @keyframes propigCodeitCardIn {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`;

const WidgetHeader = styled.div`
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 14px;
  min-width: 0;
`;

const WidgetTitle = styled.h2`
  align-items: center;
  display: flex;
  font-size: 1.08rem;
  gap: 8px;
  letter-spacing: 0;
  line-height: 1.2;
  margin: 0;
  min-width: 0;
`;

const WidgetTitleHandle = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text);
  cursor: grab;
  display: inline-flex;
  font: inherit;
  font-weight: 900;
  gap: 7px;
  min-height: 34px;
  min-width: 0;
  padding: 0 8px 0 0;

  svg:first-child {
    color: var(--faint);
    flex: 0 0 auto;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover,
  &:focus-visible {
    background: var(--surface-soft);
    border-color: var(--border);
  }

  &:active {
    cursor: grabbing;
  }
`;

const WidgetHeaderActions = styled.div`
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  gap: 7px;
`;

const WidgetLink = styled(Link)`
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  display: inline-flex;
  height: 34px;
  justify-content: center;
  text-decoration: none;
  width: 34px;

  &:hover {
    background: var(--surface-hover);
  }
`;

const WidgetRouteBar = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: -4px 0 12px;
`;

const WidgetRoutePill = styled(Link)`
  align-items: center;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 999px;
  color: #c8f5db;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 900;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  text-decoration: none;
  white-space: nowrap;

  svg {
    color: var(--accent);
    flex: 0 0 auto;
  }

  &:hover,
  &:focus-visible {
    background: var(--accent-soft);
    border-color: var(--accent-border);
    outline: none;
  }

  body[data-propig-design='codeit'] & {
    background: #ffffff;
    border-color: var(--codeit-border);
    color: var(--codeit-primary);
  }

  body[data-propig-design='codeit'] &:hover,
  body[data-propig-design='codeit'] &:focus-visible {
    background: var(--codeit-primary-soft);
    border-color: var(--codeit-primary-border);
    color: var(--codeit-primary-hover);
  }
`;

const QuickForm = styled.form`
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  margin-bottom: 8px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const ScheduleForm = styled(QuickForm)`
  grid-template-columns: minmax(0, 1fr) 118px auto;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const controlBase = `
  background: rgba(5, 12, 10, 0.72);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font: inherit;
  font-size: 0.95rem;
  min-width: 0;
  outline: none;

  &:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(66, 211, 146, 0.18);
  }

  &:disabled {
    background: rgba(255, 255, 255, 0.025);
    border-color: rgba(255, 255, 255, 0.06);
    color: var(--faint);
    cursor: not-allowed;
  }

  &::placeholder {
    color: var(--faint);
  }

  body[data-propig-design='codeit'] & {
    background: #ffffff;
    border-color: var(--codeit-border-strong);
    color: var(--codeit-text);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  }

  body[data-propig-design='codeit'] &:focus {
    border-color: rgba(52, 81, 209, 0.42);
    box-shadow: 0 0 0 3px rgba(52, 81, 209, 0.12);
  }

  body[data-propig-design='codeit'] &:disabled {
    background: #eef1f8;
    border-color: rgba(28, 39, 76, 0.08);
    color: #98a2b3;
  }
`;

const TextInput = styled.input`
  ${controlBase}
  height: 42px;
  padding: 0 12px;
`;

const TimeInput = styled.input`
  ${controlBase}
  height: 42px;
  padding: 0 10px;
`;

const MemoInput = styled.textarea`
  ${controlBase}
  min-height: 96px;
  padding: 11px 12px;
  resize: vertical;
`;

const PrimaryButton = styled.button`
  align-items: center;
  background: linear-gradient(135deg, #42d392, #2dd4bf);
  border: 0;
  border-radius: 8px;
  color: #06110d;
  cursor: pointer;
  display: inline-flex;
  font-weight: 800;
  gap: 7px;
  height: 42px;
  justify-content: center;
  padding: 0 14px;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease;
  white-space: nowrap;

  &:hover:not(:disabled) {
    box-shadow: 0 10px 24px rgba(45, 212, 191, 0.18);
    transform: translateY(-1px);
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary);
    color: #ffffff;
    box-shadow: 0 12px 28px rgba(52, 81, 209, 0.18);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StatusText = styled.p`
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 700;
  margin: 0 0 10px;
  min-height: 18px;
`;

const RowList = styled.div`
  display: grid;
  gap: 8px;
`;

const MemoRowList = styled(RowList)`
  padding-right: 2px;
`;

const MemoAccordionItem = styled.div`
  display: grid;
  gap: 6px;
`;

const BucketAccordionItem = styled.div`
  display: grid;
  gap: 6px;
`;

const MemoCategoryPanel = styled.div`
  display: grid;
  gap: 8px;
  margin-bottom: 8px;
`;

const MemoCategoryInput = styled.input`
  ${controlBase}
  height: 38px;
  padding: 0 12px;
`;

const MemoColorPicker = styled.div`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  min-height: 38px;
  padding: 7px 9px;

  @media (max-width: 520px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const MemoColorPickerLabel = styled.span`
  align-items: center;
  color: #c8f5db;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 900;
  gap: 6px;
  white-space: nowrap;

  svg {
    color: var(--accent);
    flex: 0 0 auto;
  }

  body[data-propig-design='codeit'] & {
    color: var(--codeit-muted);
  }
`;

const MemoColorSwatches = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
`;

const MemoColorSwatch = styled.button<{ $active: boolean; $color: string }>`
  background: ${({ $color }) => $color};
  border: 2px solid ${({ $active }) => ($active ? '#eff8f1' : 'rgba(255, 255, 255, 0.24)')};
  border-radius: 999px;
  box-shadow: ${({ $active, $color }) => ($active ? `0 0 0 3px ${$color}42` : 'none')};
  cursor: pointer;
  height: 24px;
  padding: 0;
  transition:
    box-shadow 0.16s ease,
    transform 0.16s ease;
  width: 24px;

  &:hover,
  &:focus-visible {
    outline: none;
    transform: translateY(-1px);
  }
`;

const MemoCategoryScroller = styled.div`
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const MemoCategoryChip = styled.button<{ $active: boolean }>`
  align-items: center;
  background: ${({ $active }) => ($active ? 'var(--accent)' : 'var(--surface-soft)')};
  border: 1px solid ${({ $active }) => ($active ? 'var(--accent)' : 'var(--border)')};
  border-radius: 999px;
  color: ${({ $active }) => ($active ? '#06110d' : 'var(--text)')};
  cursor: pointer;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 900;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  white-space: nowrap;

  span {
    align-items: center;
    background: ${({ $active }) => ($active ? 'rgba(6, 17, 13, 0.14)' : 'rgba(255, 255, 255, 0.07)')};
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.7rem;
    height: 18px;
    justify-content: center;
    min-width: 18px;
    padding: 0 5px;
  }

  body[data-propig-design='codeit'] & {
    background: ${({ $active }) => ($active ? 'var(--codeit-primary)' : '#ffffff')};
    border-color: ${({ $active }) => ($active ? 'var(--codeit-primary)' : 'var(--codeit-border)')};
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-text)')};
  }

  body[data-propig-design='codeit'] & span {
    background: ${({ $active }) => ($active ? 'rgba(255, 255, 255, 0.2)' : 'var(--codeit-surface-soft)')};
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-muted)')};
  }
`;

const MemoColorScroller = styled(MemoCategoryScroller)`
  padding-bottom: 4px;
`;

const MemoColorCategoryChip = styled.button<{ $active: boolean; $color: string }>`
  align-items: center;
  background: ${({ $active, $color }) => ($active ? `${$color}` : 'var(--surface-soft)')};
  border: 1px solid ${({ $active, $color }) => ($active ? `${$color}` : `${$color}99`)};
  border-radius: 999px;
  color: ${({ $active }) => ($active ? '#06110d' : 'var(--text)')};
  cursor: pointer;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 900;
  gap: 7px;
  height: 30px;
  padding: 0 10px;
  white-space: nowrap;

  span {
    align-items: center;
    background: ${({ $active }) => ($active ? 'rgba(6, 17, 13, 0.14)' : 'rgba(255, 255, 255, 0.07)')};
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.7rem;
    height: 18px;
    justify-content: center;
    min-width: 18px;
    padding: 0 5px;
  }

  body[data-propig-design='codeit'] & {
    background: ${({ $active, $color }) => ($active ? $color : '#ffffff')};
    color: var(--codeit-text);
  }

  body[data-propig-design='codeit'] & span {
    background: ${({ $active }) => ($active ? 'rgba(255, 255, 255, 0.24)' : 'var(--codeit-surface-soft)')};
    color: var(--codeit-text);
  }
`;

const MemoColorDot = styled.i<{ $color: string }>`
  background: ${({ $color }) => $color};
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  flex: 0 0 auto;
  height: 10px;
  line-height: 0;
  width: 10px;
`;

const HabitCategoryScroller = styled.div`
  display: flex;
  gap: 7px;
  margin: -2px 0 10px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const HabitCategoryChip = styled.button<{ $active: boolean; $color: string }>`
  align-items: center;
  background: ${({ $active }) => ($active ? 'var(--accent)' : 'var(--surface-soft)')};
  border: 1px solid ${({ $active, $color }) => ($active ? 'var(--accent)' : $color)};
  border-radius: 999px;
  color: ${({ $active }) => ($active ? '#06110d' : 'var(--text)')};
  cursor: pointer;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 900;
  gap: 7px;
  height: 30px;
  padding: 0 10px;
  white-space: nowrap;

  &::before {
    background: ${({ $active, $color }) => ($active ? '#06110d' : $color)};
    border-radius: 999px;
    content: '';
    height: 7px;
    width: 7px;
  }

  span {
    align-items: center;
    background: ${({ $active }) => ($active ? 'rgba(6, 17, 13, 0.14)' : 'rgba(255, 255, 255, 0.07)')};
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.7rem;
    height: 18px;
    justify-content: center;
    min-width: 18px;
    padding: 0 5px;
  }

  body[data-propig-design='codeit'] & {
    background: ${({ $active }) => ($active ? 'var(--codeit-primary)' : '#ffffff')};
    border-color: ${({ $active, $color }) => ($active ? 'var(--codeit-primary)' : $color)};
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-text)')};
  }

  body[data-propig-design='codeit'] &::before {
    background: ${({ $active, $color }) => ($active ? '#ffffff' : $color)};
  }

  body[data-propig-design='codeit'] & span {
    background: ${({ $active }) => ($active ? 'rgba(255, 255, 255, 0.2)' : 'var(--codeit-surface-soft)')};
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-muted)')};
  }
`;

const HabitDateBar = styled.div`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 8px 10px;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const HabitDateLabel = styled.div`
  align-items: center;
  color: #baf5d0;
  display: inline-flex;
  font-size: 0.86rem;
  font-weight: 900;
  gap: 7px;
  white-space: nowrap;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-primary);
  }
`;

const HabitDateInput = styled.input`
  ${controlBase}
  height: 34px;
  padding: 0 10px;
`;

const DateStrip = styled.div`
  display: grid;
  gap: 7px;
  grid-auto-columns: 64px;
  grid-auto-flow: column;
  margin: -2px 0 10px;
  overflow-x: auto;
  padding: 2px 1px 6px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const DateChipButton = styled.button<{ $active: boolean; $today: boolean }>`
  align-items: center;
  background: ${({ $active, $today }) => ($active ? 'var(--accent)' : $today ? 'var(--accent-soft)' : 'var(--surface-soft)')};
  border: 1px solid ${({ $active, $today }) => ($active ? 'var(--accent)' : $today ? 'var(--accent-border)' : 'var(--border)')};
  border-radius: 8px;
  color: ${({ $active, $today }) => ($active ? '#06110d' : $today ? '#baf5d0' : 'var(--text)')};
  cursor: pointer;
  display: grid;
  gap: 2px;
  min-height: 54px;
  padding: 7px 6px;
  scroll-snap-align: start;
  text-align: center;

  span {
    font-size: 0.72rem;
    font-weight: 900;
    line-height: 1;
  }

  strong {
    font-size: 0.9rem;
    line-height: 1.1;
  }

  body[data-propig-design='codeit'] & {
    color: ${({ $active, $today }) => ($active ? '#ffffff' : $today ? 'var(--codeit-primary)' : 'var(--codeit-text)')};
  }
`;

const HabitRecordGroup = styled.div`
  display: grid;
  gap: 6px;
`;

const HabitInlineEditor = styled.div`
  animation: ${accordionReveal} 0.16s ease;
  background: #0c1511;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 10px;
`;

const HabitQuickControls = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const PrimaryRecordButton = styled.button`
  align-items: center;
  background: var(--accent);
  border: 0;
  border-radius: 8px;
  color: #06110d;
  cursor: pointer;
  display: inline-flex;
  font-size: 0.84rem;
  font-weight: 900;
  gap: 7px;
  min-height: 36px;
  padding: 0 12px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const HabitMetricGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
`;

const RecordInputGroup = styled.label`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: grid;
  gap: 6px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 38px;
  padding: 6px 8px;

  span,
  em {
    color: var(--muted);
    font-size: 0.74rem;
    font-style: normal;
    font-weight: 900;
    white-space: nowrap;
  }
`;

const RecordNumberInput = styled.input.attrs({ type: 'number' })`
  background: transparent;
  border: 0;
  color: var(--text);
  font: inherit;
  font-size: 0.92rem;
  font-weight: 900;
  min-width: 0;
  outline: none;
  width: 100%;

  &:disabled {
    color: var(--faint);
    cursor: not-allowed;
  }
`;

const QuickRecordButton = styled.button`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 900;
  gap: 6px;
  min-height: 36px;
  padding: 0 10px;

  &:hover {
    background: var(--surface-hover);
    border-color: var(--accent-border);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const SetEditor = styled.div`
  display: grid;
  gap: 8px;
`;

const SetEditorRow = styled.div`
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr) 34px;

  span {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 900;
    text-align: center;
  }
`;

const TinyIconButton = styled.button`
  align-items: center;
  background: var(--danger-soft);
  border: 1px solid rgba(255, 143, 143, 0.38);
  border-radius: 8px;
  color: var(--danger);
  cursor: pointer;
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const RatingControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const RatingButton = styled.button<{ $active: boolean }>`
  align-items: center;
  background: ${({ $active }) => ($active ? 'rgba(247, 199, 109, 0.16)' : 'var(--surface-soft)')};
  border: 1px solid ${({ $active }) => ($active ? 'rgba(247, 199, 109, 0.5)' : 'var(--border)')};
  border-radius: 8px;
  color: ${({ $active }) => ($active ? 'var(--warning)' : 'var(--faint)')};
  cursor: pointer;
  display: inline-flex;
  height: 36px;
  justify-content: center;
  width: 36px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const ChoiceControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
`;

const ChoiceRecordButton = styled.button<{ $active: boolean }>`
  align-items: center;
  background: ${({ $active }) => ($active ? 'var(--accent-soft)' : 'var(--surface-soft)')};
  border: 1px solid ${({ $active }) => ($active ? 'var(--accent-border)' : 'var(--border)')};
  border-radius: 999px;
  color: ${({ $active }) => ($active ? '#baf5d0' : 'var(--text)')};
  cursor: pointer;
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 900;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  body[data-propig-design='codeit'] & {
    color: ${({ $active }) => ($active ? 'var(--codeit-primary)' : 'var(--codeit-text)')};
  }
`;

const RecordHintText = styled.p`
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.4;
  margin: 0;
`;

const HabitNoteInput = styled.textarea`
  ${controlBase}
  min-height: 66px;
  padding: 9px 10px;
  resize: vertical;
`;

const DataRow = styled.div<{ $done: boolean; $accent: string }>`
  align-items: center;
  background: ${({ $done }) =>
    $done ? 'rgba(255, 255, 255, 0.04)' : 'linear-gradient(180deg, rgba(23, 36, 31, 0.96), rgba(12, 21, 17, 0.96))'};
  border: 1px solid ${({ $done }) => ($done ? 'var(--border)' : 'var(--border-strong)')};
  border-left: 4px solid ${({ $accent }) => $accent};
  border-radius: 8px;
  display: flex;
  gap: 10px;
  min-height: 58px;
  min-width: 0;
  padding: 8px 10px;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;

  &[role='button'],
  &[role='link'] {
    cursor: pointer;
  }

  &[role='button']:hover,
  &[role='link']:hover {
    background: ${({ $done }) => ($done ? 'rgba(255, 255, 255, 0.06)' : 'var(--surface-hover)')};
    transform: translateY(-1px);
  }

  &[role='button']:focus-visible,
  &[role='link']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const MemoInlinePanel = styled.div<{ $color: string }>`
  animation: ${accordionReveal} 0.16s ease;
  background:
    linear-gradient(180deg, rgba(9, 18, 15, 0.98), rgba(7, 14, 12, 0.98)),
    ${({ $color }) => `linear-gradient(135deg, ${$color}1f, transparent 48%)`};
  border: 1px solid ${({ $color }) => `${$color}55`};
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 10px;
`;

const MemoInlineTextarea = styled.textarea`
  ${controlBase}
  field-sizing: content;
  line-height: 1.45;
  min-height: 104px;
  overflow: hidden;
  padding: 10px 11px;
  resize: vertical;
`;

const MemoInlineFooter = styled.div`
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  min-width: 0;

  @media (max-width: 560px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const MemoInlinePreview = styled.span`
  color: var(--muted);
  display: -webkit-box;
  flex: 1;
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1.35;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`;

const MemoInlineSwatches = styled.div`
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 7px;
`;

const BucketInlinePanel = styled.div<{ $accent: string }>`
  animation: ${accordionReveal} 0.16s ease;
  background:
    linear-gradient(180deg, rgba(9, 18, 15, 0.98), rgba(7, 14, 12, 0.98)),
    ${({ $accent }) => `linear-gradient(135deg, ${$accent}22, transparent 48%)`};
  border: 1px solid ${({ $accent }) => `${$accent}55`};
  border-radius: 8px;
  display: grid;
  gap: 10px;
  padding: 10px;
`;

const BucketInlineNote = styled.p`
  color: var(--text);
  font-size: 0.84rem;
  font-weight: 800;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

const BucketInlineMeta = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const BucketInlineMetaItem = styled.div`
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 8px 9px;

  span {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 900;
  }

  strong {
    color: #dff8e8;
    font-size: 0.82rem;
    font-weight: 900;
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;

const BucketPanelActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const SecondaryInlineButton = styled.button`
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 900;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;

  &:hover {
    background: var(--surface-hover);
    border-color: var(--accent-border);
  }
`;

const RowMain = styled.div`
  flex: 1;
  min-width: 0;
`;

const RowTitle = styled.div`
  color: var(--text);
  display: -webkit-box;
  font-size: 0.94rem;
  font-weight: 800;
  line-height: 1.25;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`;

const RowMeta = styled.div`
  align-items: center;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.78rem;
  font-weight: 700;
  gap: 4px;
  line-height: 1.25;
  margin-top: 4px;
`;

const MemoTag = styled.span<{ $muted?: boolean }>`
  background: ${({ $muted }) => ($muted ? 'rgba(255, 255, 255, 0.06)' : 'var(--accent-soft)')};
  border: 1px solid ${({ $muted }) => ($muted ? 'var(--border)' : 'var(--accent-border)')};
  border-radius: 999px;
  color: ${({ $muted }) => ($muted ? 'var(--muted)' : '#baf5d0')};
  display: inline-flex;
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1;
  padding: 4px 7px;

  body[data-propig-design='codeit'] & {
    color: ${({ $muted }) => ($muted ? 'var(--codeit-muted)' : 'var(--codeit-primary)')};
  }
`;

const IconButton = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;

  &:hover {
    background: var(--danger-soft);
    border-color: rgba(255, 143, 143, 0.38);
    color: var(--danger);
  }
`;

const CheckButton = styled.button`
  align-items: center;
  background: #0c1511;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--accent);
  cursor: pointer;
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;

  &:disabled {
    color: var(--faint);
    cursor: not-allowed;
  }

  body[data-propig-design='codeit'] & {
    background: #ffffff;
    border-color: var(--codeit-border);
  }
`;

const RecordToggleButton = styled(CheckButton)<{ $open: boolean }>`
  color: var(--accent);

  svg {
    transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
    transition: transform 0.16s ease;
  }
`;

const AccordionState = styled.span<{ $open: boolean }>`
  align-items: center;
  background: ${({ $open }) => ($open ? 'var(--accent-soft)' : 'rgba(255, 255, 255, 0.06)')};
  border: 1px solid ${({ $open }) => ($open ? 'var(--accent-border)' : 'var(--border)')};
  border-radius: 999px;
  color: ${({ $open }) => ($open ? '#baf5d0' : 'var(--muted)')};
  display: inline-flex;
  font-size: 0.72rem;
  font-weight: 900;
  height: 26px;
  justify-content: center;
  min-width: 44px;
  padding: 0 9px;

  body[data-propig-design='codeit'] & {
    color: ${({ $open }) => ($open ? 'var(--codeit-primary)' : 'var(--codeit-muted)')};
  }
`;

const StatusPill = styled.button<{ $status: BucketStatus }>`
  background: ${({ $status }) =>
    $status === 'done' ? 'var(--accent-soft)' : $status === 'progress' ? 'rgba(247, 199, 109, 0.16)' : 'rgba(143, 184, 255, 0.14)'};
  border: 1px solid
    ${({ $status }) =>
      $status === 'done' ? 'var(--accent-border)' : $status === 'progress' ? 'rgba(247, 199, 109, 0.48)' : 'rgba(143, 184, 255, 0.42)'};
  border-radius: 999px;
  color: ${({ $status }) => ($status === 'done' ? '#baf5d0' : $status === 'progress' ? 'var(--warning)' : 'var(--blue)')};
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 900;
  height: 30px;
  min-width: 48px;
  padding: 0 10px;
  white-space: nowrap;

  body[data-propig-design='codeit'] & {
    color: ${({ $status }) => ($status === 'done' ? 'var(--codeit-primary)' : $status === 'progress' ? 'var(--warning)' : 'var(--blue)')};
  }
`;

const DdayPill = styled.span<{ $tone: DdayTone }>`
  align-items: center;
  background: ${({ $tone }) =>
    $tone === 'done'
      ? 'rgba(255, 255, 255, 0.06)'
      : $tone === 'overdue'
        ? 'var(--danger-soft)'
        : $tone === 'today'
          ? 'var(--accent)'
          : $tone === 'upcoming'
            ? 'rgba(143, 184, 255, 0.14)'
            : 'rgba(255, 255, 255, 0.06)'};
  border: 1px solid
    ${({ $tone }) =>
      $tone === 'done'
        ? 'var(--border)'
        : $tone === 'overdue'
          ? 'rgba(255, 143, 143, 0.38)'
          : $tone === 'today'
            ? 'var(--accent)'
            : $tone === 'upcoming'
              ? 'rgba(143, 184, 255, 0.42)'
              : 'var(--border)'};
  border-radius: 999px;
  color: ${({ $tone }) =>
    $tone === 'done'
      ? 'var(--muted)'
      : $tone === 'overdue'
        ? 'var(--danger)'
        : $tone === 'today'
          ? '#06110d'
          : $tone === 'upcoming'
            ? 'var(--blue)'
            : 'var(--muted)'};
  display: inline-flex;
  font-size: 0.72rem;
  font-weight: 900;
  height: 22px;
  padding: 0 8px;
  white-space: nowrap;
`;

const EmptyState = styled.div`
  align-items: center;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018));
  border: 1px dashed rgba(164, 180, 170, 0.34);
  border-radius: 8px;
  color: var(--muted);
  display: flex;
  font-size: 0.9rem;
  font-weight: 800;
  gap: 10px;
  min-height: 64px;
  padding: 14px;

  &::before {
    background: linear-gradient(135deg, #42d392, #60a5fa);
    border-radius: 999px;
    box-shadow: 0 0 0 5px rgba(66, 211, 146, 0.08);
    content: '';
    flex: 0 0 auto;
    height: 9px;
    width: 9px;
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface-soft);
    border-color: var(--codeit-border-strong);
  }

  body[data-propig-design='codeit'] &::before {
    background: var(--codeit-success);
  }
`;

const AllHiddenState = styled(EmptyState)`
  margin: 0 auto;
  max-width: 1240px;
`;

const SpinningLoader = styled(Loader2)`
  animation: ${spin} 1s linear infinite;
`;
