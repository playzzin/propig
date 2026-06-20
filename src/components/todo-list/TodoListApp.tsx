'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styled, { css } from 'styled-components';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  AlertCircle,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  ClipboardList,
  Clock3,
  Edit3,
  LayoutGrid,
  ListTodo,
  Loader2,
  LogIn,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ensureFirestorePersistence } from '@/firebase/config';
import {
  DEFAULT_TODO_CATEGORIES,
  TODO_ANYTIME_COMPLETION_KEY,
  todoListService,
  type TodoCategoryOption,
  type TodoRecurrenceMode,
  type TodoTask,
  type TodoTaskDraft,
} from '@/services/todoListService';

type PlannerView = 'day' | 'week' | 'month' | 'list';
type StatusFilter = 'all' | 'open' | 'done';
type CategoryFilter = 'all' | string;

interface Occurrence {
  task: TodoTask;
  dateKey: string;
  completed: boolean;
}

const RECURRENCE_LABELS: Record<TodoRecurrenceMode, string> = {
  unscheduled: '날짜 없음',
  once: '특정일',
  daily: '일별',
  weekly: '주별',
  monthly: '월별',
  dates: '날짜별',
};

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const DATE_BAND_COLORS = ['#e11d48', '#059669', '#0284c7', '#7c3aed', '#ca8a04', '#ea580c', '#2563eb'];
const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const DAY_HOURS = Array.from({ length: 17 }, (_, index) => index + 6);
const DEFAULT_CATEGORY_COLOR = DEFAULT_TODO_CATEGORIES[0]?.color ?? '#4ade80';
const TODO_DEFAULT_VIEW_STORAGE_KEY = 'todo-list:default-view';

function isPlannerViewValue(value: string | null): value is PlannerView {
  return value === 'day' || value === 'week' || value === 'month' || value === 'list';
}

function getStoredPlannerDefaultView(): PlannerView {
  if (typeof window === 'undefined') return 'week';
  const stored = window.localStorage.getItem(TODO_DEFAULT_VIEW_STORAGE_KEY);
  return isPlannerViewValue(stored) ? stored : 'week';
}

interface ResetConfirmOptions {
  title: string;
  html: string;
  inputText: string;
  confirmButtonText: string;
  confirmButtonColor?: string;
}

async function confirmResetAction({
  title,
  html,
  inputText,
  confirmButtonText,
  confirmButtonColor = '#ff7a59',
}: ResetConfirmOptions): Promise<boolean> {
  const result = await Swal.fire({
    title,
    html,
    icon: 'warning',
    input: 'text',
    inputLabel: `실행하려면 아래에 "${inputText}"를 입력하세요.`,
    inputPlaceholder: inputText,
    inputValidator: (value) => (value?.trim() === inputText ? undefined : `"${inputText}"라고 입력해야 실행됩니다.`),
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: '취소',
    background: '#101820',
    color: '#eef5f0',
    confirmButtonColor,
    cancelButtonColor: '#596774',
  });

  return result.isConfirmed;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getTodayKey(): string {
  return toDateKey(new Date());
}

function formatFullDate(dateKey: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(parseDateKey(dateKey));
}

function formatMonthTitle(dateKey: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(parseDateKey(dateKey));
}

function formatCompactDate(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function getDateBandColor(date: Date): string {
  return DATE_BAND_COLORS[date.getDay()] ?? '#059669';
}

function getWeekDateKeys(dateKey: string): string[] {
  const start = startOfWeek(parseDateKey(dateKey));
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)));
}

function getMonthGridDateKeys(dateKey: string): string[] {
  const anchor = parseDateKey(dateKey);
  const first = startOfWeek(startOfMonth(anchor));
  return Array.from({ length: 42 }, (_, index) => toDateKey(addDays(first, index)));
}

function getMonthRangeDateKeys(dateKey: string): string[] {
  const start = startOfMonth(parseDateKey(dateKey));
  const end = endOfMonth(parseDateKey(dateKey));
  const keys: string[] = [];
  let current = start;

  while (current <= end) {
    keys.push(toDateKey(current));
    current = addDays(current, 1);
  }

  return keys;
}

function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
}

function uniqueSortedCompletionKeys(keys: string[]): string[] {
  return [...new Set(keys.filter((key) => key === TODO_ANYTIME_COMPLETION_KEY || /^\d{4}-\d{2}-\d{2}$/.test(key)))].sort();
}

function createDraft(dateKey = getTodayKey(), categoryId = ''): TodoTaskDraft {
  const date = parseDateKey(dateKey);
  return {
    title: '',
    note: '',
    categoryId,
    startDate: dateKey,
    time: '',
    recurrenceMode: 'once',
    weekdays: [date.getDay()],
    monthDays: [date.getDate()],
    dates: [dateKey],
  };
}

function taskToDraft(task: TodoTask): TodoTaskDraft {
  const startKey = task.startDate || getTodayKey();
  const start = parseDateKey(startKey);
  return {
    title: task.title,
    note: task.note,
    categoryId: task.categoryId,
    startDate: startKey,
    time: task.time,
    recurrenceMode: task.recurrence.mode,
    weekdays: task.recurrence.weekdays.length > 0 ? task.recurrence.weekdays : [start.getDay()],
    monthDays: task.recurrence.monthDays.length > 0 ? task.recurrence.monthDays : [start.getDate()],
    dates: task.recurrence.dates.length > 0 ? task.recurrence.dates : [startKey],
  };
}

function getCategoryMeta(categories: TodoCategoryOption[], categoryId: string): TodoCategoryOption {
  return (
    categories.find((category) => category.id === categoryId) ?? {
      id: '',
      label: '분류 없음',
      color: DEFAULT_CATEGORY_COLOR,
      createdAt: '',
      updatedAt: '',
    }
  );
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

function getOccurrencesForDate(tasks: TodoTask[], dateKey: string): Occurrence[] {
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

function getOccurrencesForRange(tasks: TodoTask[], dateKeys: string[]): Occurrence[] {
  return dateKeys.flatMap((dateKey) => getOccurrencesForDate(tasks, dateKey));
}

function filterOccurrences(occurrences: Occurrence[], filter: StatusFilter): Occurrence[] {
  if (filter === 'open') return occurrences.filter((item) => !item.completed);
  if (filter === 'done') return occurrences.filter((item) => item.completed);
  return occurrences;
}

function getCompletionPercent(occurrences: Occurrence[]): number {
  if (occurrences.length === 0) return 0;
  return Math.round((occurrences.filter((item) => item.completed).length / occurrences.length) * 100);
}

function isTaskDoneInList(task: TodoTask): boolean {
  if (task.recurrence.mode === 'unscheduled') {
    return task.completedDates.includes(TODO_ANYTIME_COMPLETION_KEY);
  }

  return task.completedDates.length > 0;
}

function getListCompletionKey(task: TodoTask, selectedDate: string): string {
  if (task.recurrence.mode === 'unscheduled') return TODO_ANYTIME_COMPLETION_KEY;
  if (shouldOccurOn(task, selectedDate)) return selectedDate;
  if (shouldOccurOn(task, getTodayKey())) return getTodayKey();
  return task.completedDates[0] || task.startDate || getTodayKey();
}

function isCurrentMonth(dateKey: string, selectedDate: string): boolean {
  const date = parseDateKey(dateKey);
  const selected = parseDateKey(selectedDate);
  return date.getFullYear() === selected.getFullYear() && date.getMonth() === selected.getMonth();
}

export function TodoListApp() {
  const { currentUser, loading: authLoading, loginWithGoogle, isConfigured } = useAuth();
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [categories, setCategories] = useState<TodoCategoryOption[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => getTodayKey());
  const [view, setView] = useState<PlannerView>('week');
  const [defaultView, setDefaultView] = useState<PlannerView>('week');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [draft, setDraft] = useState<TodoTaskDraft>(() => createDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState(() => getTodayKey());
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryColor, setEditingCategoryColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedView = getStoredPlannerDefaultView();
      setView(storedView);
      setDefaultView(storedView);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser) {
      setTasks([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    let didCancel = false;
    let unsubscribeTasks: (() => void) | undefined;
    let unsubscribeCategories: (() => void) | undefined;

    const connect = async () => {
      try {
        setIsLoading(true);
        await ensureFirestorePersistence();
        await todoListService.ensureDefaultCategories(currentUser.uid);

        unsubscribeTasks = todoListService.subscribeTasks(
          currentUser.uid,
          (nextTasks) => {
            if (didCancel) return;
            setTasks(nextTasks);
            setError(null);
            setIsLoading(false);
          },
          (nextError) => {
            if (didCancel) return;
            setError(nextError.message);
            setIsLoading(false);
          },
        );

        unsubscribeCategories = todoListService.subscribeCategories(
          currentUser.uid,
          (nextCategories) => {
            if (didCancel) return;
            setCategories(nextCategories);
            setDraft((prev) =>
              nextCategories.some((category) => category.id === prev.categoryId)
                ? prev
                : { ...prev, categoryId: nextCategories[0]?.id ?? '' },
            );
            setCategoryFilter((prev) => (prev === 'all' || nextCategories.some((category) => category.id === prev) ? prev : 'all'));
            setError(null);
            setIsLoading(false);
          },
          (nextError) => {
            if (didCancel) return;
            setError(nextError.message);
            setIsLoading(false);
          },
        );
      } catch (nextError) {
        if (didCancel) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setIsLoading(false);
      }
    };

    connect();

    return () => {
      didCancel = true;
      unsubscribeTasks?.();
      unsubscribeCategories?.();
    };
  }, [authLoading, currentUser]);

  const rangeDateKeys = useMemo(() => {
    if (view === 'list') return [selectedDate];
    if (view === 'day') return [selectedDate];
    if (view === 'week') return getWeekDateKeys(selectedDate);
    return getMonthRangeDateKeys(selectedDate);
  }, [selectedDate, view]);

  const filteredTasks = useMemo(() => {
    if (categoryFilter === 'all') return tasks;
    return tasks.filter((task) => task.categoryId === categoryFilter);
  }, [categoryFilter, tasks]);

  const rangeAllOccurrences = useMemo(
    () => getOccurrencesForRange(filteredTasks, rangeDateKeys),
    [filteredTasks, rangeDateKeys],
  );
  const todayOccurrences = useMemo(() => getOccurrencesForDate(tasks, getTodayKey()), [tasks]);
  const todayDoneCount = todayOccurrences.filter((item) => item.completed).length;
  const todayOpenCount = todayOccurrences.length - todayDoneCount;
  const categoryTaskCounts = useMemo(
    () =>
      tasks.reduce<Record<string, number>>((acc, task) => {
        acc[task.categoryId] = (acc[task.categoryId] ?? 0) + 1;
        return acc;
      }, {}),
    [tasks],
  );
  const activeCategoryMeta = categoryFilter === 'all' ? null : getCategoryMeta(categories, categoryFilter);
  const categoryPrefix = activeCategoryMeta ? `${activeCategoryMeta.label} 분류 · ` : '';
  const selectedOccurrences = useMemo(
    () => filterOccurrences(getOccurrencesForDate(filteredTasks, selectedDate), statusFilter),
    [filteredTasks, selectedDate, statusFilter],
  );
  const listedTasks = useMemo(() => {
    return [...filteredTasks]
      .filter((task) => {
        if (statusFilter === 'open') return !isTaskDoneInList(task);
        if (statusFilter === 'done') return isTaskDoneInList(task);
        return true;
      })
      .sort((a, b) => {
        const aDone = isTaskDoneInList(a);
        const bDone = isTaskDoneInList(b);
        if (aDone !== bDone) return aDone ? 1 : -1;
        const aUnscheduled = a.recurrence.mode === 'unscheduled';
        const bUnscheduled = b.recurrence.mode === 'unscheduled';
        if (aUnscheduled !== bUnscheduled) return aUnscheduled ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [filteredTasks, statusFilter]);
  const monthGridDateKeys = useMemo(() => getMonthGridDateKeys(selectedDate), [selectedDate]);
  const completionPercent = getCompletionPercent(rangeAllOccurrences);
  const openCount = rangeAllOccurrences.filter((item) => !item.completed).length;
  const doneCount = rangeAllOccurrences.filter((item) => item.completed).length;
  const hasActiveFilters = statusFilter !== 'all' || categoryFilter !== 'all';
  const visibleListOpenCount = listedTasks.filter((task) => !isTaskDoneInList(task)).length;
  const overdueCount = useMemo(() => {
    const today = getTodayKey();
    return tasks.filter((task) => {
      if (task.recurrence.mode !== 'once') return false;
      return task.startDate < today && !task.completedDates.includes(task.startDate);
    }).length;
  }, [tasks]);
  const completedRecordCount = tasks.reduce((count, task) => count + task.completedDates.length, 0);
  const hasCompletionRecords = completedRecordCount > 0;
  const hasWorkspaceData = tasks.length > 0 || categories.length > 0;
  const controlsDisabled = isSaving || isLoading;

  const changeDefaultView = (nextView: PlannerView) => {
    setDefaultView(nextView);
    setView(nextView);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TODO_DEFAULT_VIEW_STORAGE_KEY, nextView);
    }
    toast.success('기본 보기 방식이 저장되었습니다.', { id: 'todo-default-view' });
  };

  const updateDraftDate = (dateKey: string) => {
    const date = parseDateKey(dateKey);
    setDraft((prev) => ({
      ...prev,
      startDate: dateKey,
      weekdays: prev.recurrenceMode === 'weekly' ? prev.weekdays : [date.getDay()],
      monthDays: prev.recurrenceMode === 'monthly' ? prev.monthDays : [date.getDate()],
      dates: prev.recurrenceMode === 'dates' ? uniqueSortedDates([...prev.dates, dateKey]) : [dateKey],
    }));
  };

  const resetDraft = (dateKey = selectedDate) => {
    const nextCategoryId =
      categoryFilter !== 'all' && categories.some((category) => category.id === categoryFilter)
        ? categoryFilter
        : categories[0]?.id ?? '';
    setDraft(createDraft(dateKey, nextCategoryId));
    setEditingId(null);
    setPendingDate(dateKey);
  };

  const openComposerForDate = (dateKey = selectedDate) => {
    resetDraft(dateKey);
    setIsComposerOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser || isSaving) return;

    try {
      setIsSaving(true);
      if (editingId) {
        await todoListService.update(currentUser.uid, editingId, draft);
      } else {
        await todoListService.create(currentUser.uid, draft);
      }
      if (draft.recurrenceMode === 'unscheduled') {
        setView('list');
      } else {
        setSelectedDate(draft.startDate);
      }
      resetDraft(draft.startDate || selectedDate);
      setIsComposerOpen(false);
      toast.success(editingId ? '할일을 수정했습니다.' : '할일을 추가했습니다.');
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleOccurrence = async (taskId: string, dateKey: string) => {
    if (!currentUser) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const exists = task.completedDates.includes(dateKey);
    const nextDates = exists
      ? task.completedDates.filter((item) => item !== dateKey)
      : uniqueSortedCompletionKeys([...task.completedDates, dateKey]);

    try {
      await todoListService.setCompletedDates(currentUser.uid, taskId, nextDates);
    } catch {
      toast.error('완료 상태 변경에 실패했습니다.');
    }
  };

  const removeTask = async (task: TodoTask) => {
    if (!currentUser) return;
    const ok = window.confirm(`'${task.title}' 할일을 삭제할까요?`);
    if (!ok) return;

    try {
      await todoListService.remove(currentUser.uid, task.id);
      if (editingId === task.id) resetDraft();
      toast.success('할일을 삭제했습니다.');
    } catch {
      toast.error('삭제에 실패했습니다.');
    }
  };

  const startEdit = (task: TodoTask) => {
    setEditingId(task.id);
    setDraft(taskToDraft(task));
    setPendingDate(task.startDate || getTodayKey());
    setIsComposerOpen(true);
  };

  const addExactDate = () => {
    if (!pendingDate) return;
    setDraft((prev) => ({ ...prev, dates: uniqueSortedDates([...prev.dates, pendingDate]) }));
  };

  const createCategory = async () => {
    if (!currentUser) return;

    try {
      const categoryId = await todoListService.createCategory(currentUser.uid, newCategoryName, newCategoryColor);
      setDraft((prev) => ({ ...prev, categoryId }));
      setNewCategoryName('');
      setNewCategoryColor(DEFAULT_CATEGORY_COLOR);
      toast.success('분류를 추가했습니다.');
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : '분류 추가에 실패했습니다.');
    }
  };

  const startCategoryEdit = (category: TodoCategoryOption) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.label);
    setEditingCategoryColor(category.color);
  };

  const saveCategoryEdit = async (categoryId: string) => {
    if (!currentUser) return;

    try {
      await todoListService.updateCategory(currentUser.uid, categoryId, {
        label: editingCategoryName,
        color: editingCategoryColor,
      });
      setEditingCategoryId(null);
      toast.success('분류를 수정했습니다.');
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : '분류 수정에 실패했습니다.');
    }
  };

  const removeCategory = async (category: TodoCategoryOption) => {
    if (!currentUser) return;
    const inUse = tasks.some((task) => task.categoryId === category.id);
    if (inUse) {
      toast.error('사용 중인 분류는 삭제할 수 없습니다.');
      return;
    }

    const ok = window.confirm(`'${category.label}' 분류를 삭제할까요?`);
    if (!ok) return;

    try {
      await todoListService.removeCategory(currentUser.uid, category.id);
      if (categoryFilter === category.id) setCategoryFilter('all');
      if (draft.categoryId === category.id) {
        setDraft((prev) => ({ ...prev, categoryId: categories.find((item) => item.id !== category.id)?.id ?? '' }));
      }
      toast.success('분류를 삭제했습니다.');
    } catch {
      toast.error('분류 삭제에 실패했습니다.');
    }
  };

  const resetCompletionRecords = async () => {
    if (!currentUser || controlsDisabled) return;

    if (!hasCompletionRecords) {
      toast.info('초기화할 완료 기록이 없습니다.');
      return;
    }

    const confirmed = await confirmResetAction({
      title: '할일 완료 기록을 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#b8c4cf;font-size:13px;line-height:1.55;">
          <p style="margin:0;"><strong style="color:#ffe9a6;">분류와 할일 항목은 유지</strong>하고 날짜별 완료 체크 기록만 비웁니다.</p>
          <p style="margin:0;">현재 완료 기록: ${completedRecordCount}개 · 할일 항목 ${tasks.length}개</p>
          <p style="margin:0;color:#ffb19d;">초기화 후에는 화면에서 되돌릴 수 없습니다.</p>
        </div>
      `,
      inputText: '기록 초기화',
      confirmButtonText: '기록만 초기화',
      confirmButtonColor: '#f8c64e',
    });
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await todoListService.resetCompletionRecords(currentUser.uid);
      toast.success('완료 기록을 초기화했습니다.');
    } catch {
      toast.error('완료 기록 초기화에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetTasks = async () => {
    if (!currentUser || controlsDisabled) return;

    if (tasks.length === 0) {
      toast.info('초기화할 할일 항목이 없습니다.');
      return;
    }

    const confirmed = await confirmResetAction({
      title: '할일 항목을 모두 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#b8c4cf;font-size:13px;line-height:1.55;">
          <p style="margin:0;"><strong style="color:#ffe9a6;">분류 ${categories.length}개는 유지</strong>하고 할일 항목 ${tasks.length}개를 모두 삭제합니다.</p>
          <p style="margin:0;color:#ffb19d;">삭제한 할일과 완료 기록은 복구할 수 없습니다.</p>
        </div>
      `,
      inputText: '항목 초기화',
      confirmButtonText: '항목 초기화',
    });
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await todoListService.removeAllTasks(currentUser.uid);
      resetDraft();
      setStatusFilter('all');
      toast.success('할일 항목을 모두 초기화했습니다.');
    } catch {
      toast.error('할일 항목 초기화에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetWorkspace = async () => {
    if (!currentUser || controlsDisabled) return;

    if (!hasWorkspaceData) {
      toast.info('초기화할 할일 데이터가 없습니다.');
      return;
    }

    const confirmed = await confirmResetAction({
      title: '할일 일정표 데이터를 모두 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#b8c4cf;font-size:13px;line-height:1.55;">
          <p style="margin:0;">이 작업은 <strong style="color:#ffd2c5;">할일 항목 ${tasks.length}개와 분류 ${categories.length}개</strong>를 모두 비웁니다.</p>
          <p style="margin:0;">초기화 후에는 기본 분류를 다시 생성합니다.</p>
          <p style="margin:0;color:#ffb19d;">초기화 후에는 화면에서 되돌릴 수 없습니다.</p>
        </div>
      `,
      inputText: '초기화',
      confirmButtonText: '전체 초기화',
    });
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await todoListService.resetWorkspace(currentUser.uid);
      resetDraft(getTodayKey());
      setCategoryFilter('all');
      setStatusFilter('all');
      setEditingCategoryId(null);
      toast.success('할일 일정표 데이터를 초기화했습니다.');
    } catch {
      toast.error('할일 일정표 초기화에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const shiftDate = (amount: number) => {
    const date = parseDateKey(selectedDate);
    if (view === 'month') {
      setSelectedDate(toDateKey(addMonths(date, amount)));
      return;
    }

    setSelectedDate(toDateKey(addDays(date, view === 'week' ? amount * 7 : amount)));
  };

  const renderOccurrence = (occurrence: Occurrence, compact = false) => {
    const { task, dateKey, completed } = occurrence;
    const category = getCategoryMeta(categories, task.categoryId);

    return (
      <TaskItem key={`${task.id}-${dateKey}`} $color={category.color} $done={completed} $compact={compact}>
        <TaskCheckButton
          type="button"
          onClick={() => void toggleOccurrence(task.id, dateKey)}
          aria-label={completed ? '미완료로 변경' : '완료로 변경'}
          title={completed ? '미완료로 변경' : '완료로 변경'}
        >
          {completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </TaskCheckButton>
        <TaskBody>
          <TaskTitleRow>
            <TaskTitle>{task.title}</TaskTitle>
          </TaskTitleRow>
          {!compact && task.note ? <TaskNote>{task.note}</TaskNote> : null}
          <TaskMeta>
            <span>{task.recurrence.mode === 'unscheduled' ? '목록' : task.time || '종일'}</span>
            <span>{RECURRENCE_LABELS[task.recurrence.mode]}</span>
            <span>{category.label}</span>
          </TaskMeta>
        </TaskBody>
        <TaskActions $compact={compact}>
          {!compact ? (
            <TaskActionButton type="button" onClick={() => startEdit(task)} title="수정" aria-label="수정">
              <Edit3 size={16} />
            </TaskActionButton>
          ) : null}
          <TaskActionButton
            type="button"
            onClick={() => void removeTask(task)}
            title="삭제"
            aria-label={`${task.title} 삭제`}
            $compact={compact}
            $danger
          >
            <Trash2 size={compact ? 14 : 16} />
          </TaskActionButton>
        </TaskActions>
      </TaskItem>
    );
  };

  if (authLoading) {
    return (
      <CenteredPanel>
        <Loader2 className="spin" size={24} />
        <span>할일 일정표를 준비하는 중입니다.</span>
      </CenteredPanel>
    );
  }

  if (!currentUser) {
    return (
      <Gate>
        <GateVisual>
          <ClipboardList size={54} />
          <span />
        </GateVisual>
        <h1>Firestore로 동기화되는 할일 일정표</h1>
        <p>로그인하면 분류와 반복 일정이 Cloud Firestore에 저장되고 다른 기기에서도 이어서 관리할 수 있습니다.</p>
        <GateButton type="button" disabled={!isConfigured} onClick={() => void loginWithGoogle()}>
          <LogIn size={18} />
          Google로 시작하기
        </GateButton>
      </Gate>
    );
  }

  return (
    <Shell>
      <HeaderBand>
        <HeroCopy>
          <Eyebrow>
            <ClipboardList size={16} />
            기본 할일 관리
          </Eyebrow>
          <h1>오늘 할일을 놓치지 않게 정리합니다</h1>
          <HeroMeta>
            <span>{formatFullDate(getTodayKey())}</span>
            <span>오늘 {todayOccurrences.length}개</span>
            <span>미완료 {todayOpenCount}개</span>
            <span>완료율 {getCompletionPercent(todayOccurrences)}%</span>
          </HeroMeta>
          <HeroActions>
            <ManageToggleButton
              type="button"
              $active={isManageOpen}
              onClick={() => setIsManageOpen((prev) => !prev)}
              aria-expanded={isManageOpen}
              aria-controls="todo-management-panel"
            >
              <Settings2 size={16} />
              관리
            </ManageToggleButton>
          </HeroActions>
        </HeroCopy>

        <KpiGrid>
          <KpiCard $tone="#2dd4bf">
            <span>오늘 일정</span>
            <strong>{todayOccurrences.length}</strong>
            <small>완료 {todayDoneCount}개</small>
          </KpiCard>
          <KpiCard $tone="#f59e0b">
            <span>남은 일정</span>
            <strong>{openCount}</strong>
            <small>선택 기간 기준</small>
          </KpiCard>
          <KpiCard $tone="#22d3ee">
            <span>완료율</span>
            <strong>{completionPercent}%</strong>
            <small>{doneCount}개 완료</small>
          </KpiCard>
          <KpiCard $tone="#fb7185">
            <span>기한 초과</span>
            <strong>{overdueCount}</strong>
            <small>일회성 미완료</small>
          </KpiCard>
        </KpiGrid>
      </HeaderBand>

      {isManageOpen ? (
        <ManagementPanel id="todo-management-panel" aria-label="할일 일정표 관리">
          <DefaultViewPanel>
            <DefaultViewCopy>
              <strong>
                <Settings2 size={16} />
                기본 보기
              </strong>
              <span>다음에 할일 일정표를 열 때 먼저 보여줄 화면을 선택합니다.</span>
            </DefaultViewCopy>
            <DefaultPlannerGrid aria-label="할일 일정표 기본 보기 선택">
              <DefaultPlannerButton
                type="button"
                $active={defaultView === 'day'}
                onClick={() => changeDefaultView('day')}
                aria-pressed={defaultView === 'day'}
              >
                <CalendarClock size={16} />
                <span>일간</span>
              </DefaultPlannerButton>
              <DefaultPlannerButton
                type="button"
                $active={defaultView === 'week'}
                onClick={() => changeDefaultView('week')}
                aria-pressed={defaultView === 'week'}
              >
                <CalendarRange size={16} />
                <span>주간</span>
              </DefaultPlannerButton>
              <DefaultPlannerButton
                type="button"
                $active={defaultView === 'month'}
                onClick={() => changeDefaultView('month')}
                aria-pressed={defaultView === 'month'}
              >
                <LayoutGrid size={16} />
                <span>월간</span>
              </DefaultPlannerButton>
              <DefaultPlannerButton
                type="button"
                $active={defaultView === 'list'}
                onClick={() => changeDefaultView('list')}
                aria-pressed={defaultView === 'list'}
              >
                <ListTodo size={16} />
                <span>목록</span>
              </DefaultPlannerButton>
            </DefaultPlannerGrid>
          </DefaultViewPanel>

          <CategoryManager>
            <CategoryManagerHeader>
              <BlockLabel>분류 관리</BlockLabel>
              <span>{categories.length}개</span>
            </CategoryManagerHeader>
            <CategoryCreateRow>
              <CategoryNameInput
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="새 분류"
                maxLength={18}
              />
              <ColorInput
                type="color"
                value={newCategoryColor}
                onChange={(event) => setNewCategoryColor(event.target.value)}
                aria-label="새 분류 색상"
              />
              <SmallButton type="button" onClick={() => void createCategory()} disabled={!newCategoryName.trim() || controlsDisabled}>
                추가
              </SmallButton>
            </CategoryCreateRow>
            <CategoryList>
              {categories.length === 0 ? (
                <CategoryEmpty>분류를 추가하면 할일을 등록할 수 있습니다.</CategoryEmpty>
              ) : null}
              {categories.map((category) => {
                const isEditing = editingCategoryId === category.id;
                return (
                  <CategoryRow key={category.id} $editing={isEditing}>
                    {isEditing ? (
                      <>
                        <CategoryNameInput
                          value={editingCategoryName}
                          onChange={(event) => setEditingCategoryName(event.target.value)}
                          maxLength={18}
                        />
                        <ColorInput
                          type="color"
                          value={editingCategoryColor}
                          onChange={(event) => setEditingCategoryColor(event.target.value)}
                          aria-label="분류 색상 수정"
                        />
                        <SmallButton type="button" onClick={() => void saveCategoryEdit(category.id)} disabled={controlsDisabled}>
                          저장
                        </SmallButton>
                        <IconButton type="button" onClick={() => setEditingCategoryId(null)} title="취소" aria-label="취소" disabled={controlsDisabled}>
                          <X size={15} />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <CategoryDot $color={category.color} />
                        <CategoryName>{category.label}</CategoryName>
                        <IconButton type="button" onClick={() => startCategoryEdit(category)} title="분류 수정" aria-label="분류 수정" disabled={controlsDisabled}>
                          <Edit3 size={15} />
                        </IconButton>
                        <IconButton
                          type="button"
                          onClick={() => void removeCategory(category)}
                          title="분류 삭제"
                          aria-label="분류 삭제"
                          disabled={controlsDisabled}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </>
                    )}
                  </CategoryRow>
                );
              })}
            </CategoryList>
          </CategoryManager>

          <DangerResetPanel>
            <div>
              <strong>
                <Trash2 size={16} />
                할일 일정표 초기화
              </strong>
              <span>
                완료 기록만 비우거나, 할일 항목 {tasks.length}개와 분류 {categories.length}개까지 초기화할 수 있습니다.
              </span>
            </div>
            <DangerResetActions>
              <ResetActionButton type="button" $tone="warm" onClick={() => void resetCompletionRecords()} disabled={controlsDisabled || !hasCompletionRecords}>
                <CalendarClock size={16} />
                기록만 초기화
              </ResetActionButton>
              <ResetActionButton type="button" $tone="danger" onClick={() => void resetTasks()} disabled={controlsDisabled || tasks.length === 0}>
                <Trash2 size={16} />
                항목 초기화
              </ResetActionButton>
              <ResetActionButton type="button" $tone="danger" onClick={() => void resetWorkspace()} disabled={controlsDisabled || !hasWorkspaceData}>
                <RotateCcw size={16} />
                전체 초기화
              </ResetActionButton>
            </DangerResetActions>
          </DangerResetPanel>
        </ManagementPanel>
      ) : null}

      <Workspace>
        <Composer onSubmit={handleSubmit} $open={isComposerOpen}>
          <PanelHeader>
            <div>
              <PanelTitle>{editingId ? '할일 수정' : '할일 추가'}</PanelTitle>
              <PanelHint>{editingId ? '수정 모드' : '빠른 입력'}</PanelHint>
            </div>
            <PanelActions>
              <MobileComposerToggle
                type="button"
                aria-controls="todo-composer-body"
                aria-expanded={isComposerOpen}
                onClick={() => setIsComposerOpen((prev) => !prev)}
              >
                {isComposerOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <span>{isComposerOpen ? '접기' : '열기'}</span>
              </MobileComposerToggle>
              <IconButton type="button" onClick={() => resetDraft()} title="초기화" aria-label="초기화">
                <RotateCcw size={16} />
              </IconButton>
            </PanelActions>
          </PanelHeader>

          <ComposerBody id="todo-composer-body" $open={isComposerOpen}>
          <FieldStack>
            <FieldLabel>
              제목
              <TextInput
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="할일 제목"
                maxLength={80}
              />
            </FieldLabel>
            <FieldLabel>
              메모
              <TextArea
                value={draft.note}
                onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="필요한 내용만 짧게"
                rows={3}
                maxLength={180}
              />
            </FieldLabel>
          </FieldStack>

          {draft.recurrenceMode === 'unscheduled' ? (
            <FloatingNotice>
              <ListTodo size={17} />
              <span>날짜 없이 저장됩니다. 캘린더가 아니라 전체 목록에서 바로 확인할 수 있습니다.</span>
            </FloatingNotice>
          ) : (
            <TwoColumnFields>
              <FieldLabel>
                날짜
                <DateInput type="date" value={draft.startDate} onChange={(event) => updateDraftDate(event.target.value)} />
              </FieldLabel>
              <FieldLabel>
                시간
                <TimeInput
                  type="time"
                  value={draft.time}
                  onChange={(event) => setDraft((prev) => ({ ...prev, time: event.target.value }))}
                />
              </FieldLabel>
            </TwoColumnFields>
          )}

          <FieldBlock>
            <BlockLabel>분류</BlockLabel>
            {categories.length === 0 ? (
              <CategoryEmpty>분류를 먼저 추가하세요.</CategoryEmpty>
            ) : (
              <CategoryChoiceGrid aria-label="할일 분류 선택">
                {categories.map((category) => {
                  const isSelected = draft.categoryId === category.id;

                  return (
                    <CategoryChoiceButton
                      key={category.id}
                      type="button"
                      $active={isSelected}
                      $color={category.color}
                      aria-pressed={isSelected}
                      onClick={() => setDraft((prev) => ({ ...prev, categoryId: category.id }))}
                    >
                      <CategoryDot $color={category.color} />
                      <span>{category.label}</span>
                    </CategoryChoiceButton>
                  );
                })}
              </CategoryChoiceGrid>
            )}
          </FieldBlock>

          <FieldBlock>
            <BlockLabel>방식</BlockLabel>
            <SegmentGrid $columns={6}>
              {(Object.keys(RECURRENCE_LABELS) as TodoRecurrenceMode[]).map((mode) => (
                <SegmentButton
                  key={mode}
                  type="button"
                  $active={draft.recurrenceMode === mode}
                  $color="#4ade80"
                  aria-pressed={draft.recurrenceMode === mode}
                  onClick={() => setDraft((prev) => ({ ...prev, recurrenceMode: mode }))}
                >
                  {RECURRENCE_LABELS[mode]}
                </SegmentButton>
              ))}
            </SegmentGrid>
          </FieldBlock>

          {draft.recurrenceMode === 'weekly' ? (
            <FieldBlock>
              <BlockLabel>반복 요일</BlockLabel>
              <WeekdayGrid>
                {WEEKDAY_LABELS.map((label, day) => (
                  <ChipButton
                    key={label}
                    type="button"
                    $active={draft.weekdays.includes(day)}
                    aria-pressed={draft.weekdays.includes(day)}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        weekdays: prev.weekdays.includes(day)
                          ? prev.weekdays.filter((item) => item !== day)
                          : [...prev.weekdays, day],
                      }))
                    }
                  >
                    {label}
                  </ChipButton>
                ))}
              </WeekdayGrid>
            </FieldBlock>
          ) : null}

          {draft.recurrenceMode === 'monthly' ? (
            <FieldBlock>
              <BlockLabel>반복 날짜</BlockLabel>
              <MonthDayGrid>
                {MONTH_DAYS.map((day) => (
                  <ChipButton
                    key={day}
                    type="button"
                    $active={draft.monthDays.includes(day)}
                    aria-pressed={draft.monthDays.includes(day)}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        monthDays: prev.monthDays.includes(day)
                          ? prev.monthDays.filter((item) => item !== day)
                          : [...prev.monthDays, day],
                      }))
                    }
                  >
                    {day}
                  </ChipButton>
                ))}
              </MonthDayGrid>
            </FieldBlock>
          ) : null}

          {draft.recurrenceMode === 'dates' ? (
            <FieldBlock>
              <BlockLabel>특정 날짜</BlockLabel>
              <ExactDateRow>
                <DateInput type="date" value={pendingDate} onChange={(event) => setPendingDate(event.target.value)} />
                <IconButton type="button" onClick={addExactDate} title="날짜 추가" aria-label="날짜 추가">
                  <Plus size={16} />
                </IconButton>
              </ExactDateRow>
              <ExactDateList>
                {draft.dates.map((dateKey) => (
                  <DatePill key={dateKey}>
                    {formatCompactDate(dateKey)}
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, dates: prev.dates.filter((item) => item !== dateKey) }))}
                      aria-label={`${dateKey} 삭제`}
                    >
                      <X size={13} />
                    </button>
                  </DatePill>
                ))}
              </ExactDateList>
            </FieldBlock>
          ) : null}

          <SubmitRow>
            <PrimaryButton type="submit" disabled={isSaving || !draft.title.trim() || !draft.categoryId}>
              {isSaving ? <Loader2 className="spin" size={17} /> : editingId ? <Save size={17} /> : <Plus size={17} />}
              {editingId ? '저장' : '추가'}
            </PrimaryButton>
            {editingId ? (
              <GhostButton type="button" onClick={() => resetDraft()}>
                취소
              </GhostButton>
            ) : null}
          </SubmitRow>
          </ComposerBody>
        </Composer>

        <PlannerPanel>
          <PlannerToolbar>
            <ToolbarTitle>
              <PanelTitle>
                {view === 'list' ? '전체 할일 목록' : view === 'month' ? formatMonthTitle(selectedDate) : formatFullDate(selectedDate)}
              </PanelTitle>
              <PanelHint>
                {view === 'list'
                  ? `${categoryPrefix}${listedTasks.length}개 중 ${visibleListOpenCount}개 미완료`
                  : `${categoryPrefix}${rangeAllOccurrences.length}개 일정 중 ${openCount}개 미완료`}
              </PanelHint>
            </ToolbarTitle>

            {view !== 'list' ? (
              <ToolbarControls>
                <IconButton type="button" onClick={() => shiftDate(-1)} title="이전" aria-label="이전">
                  <ChevronLeft size={17} />
                </IconButton>
                <TodayButton type="button" onClick={() => setSelectedDate(getTodayKey())}>
                  오늘
                </TodayButton>
                <IconButton type="button" onClick={() => shiftDate(1)} title="다음" aria-label="다음">
                  <ChevronRight size={17} />
                </IconButton>
              </ToolbarControls>
            ) : null}
          </PlannerToolbar>

          {error ? (
            <StatusBanner role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
            </StatusBanner>
          ) : null}

          <PlannerStats aria-label="현재 보기 요약">
            <PlannerStat>
              <Clock3 size={15} />
              <span>{view === 'list' ? '미완료' : '남은 일정'}</span>
              <strong>{view === 'list' ? visibleListOpenCount : openCount}</strong>
            </PlannerStat>
            <PlannerStat>
              <CheckCircle2 size={15} />
              <span>완료</span>
              <strong>{view === 'list' ? listedTasks.length - visibleListOpenCount : doneCount}</strong>
            </PlannerStat>
          </PlannerStats>

          <FilterBar>
            <SegmentedControl aria-label="보기 방식">
              <ViewButton type="button" $active={view === 'day'} aria-pressed={view === 'day'} onClick={() => setView('day')}>
                <CalendarClock size={15} />
                일간
              </ViewButton>
              <ViewButton type="button" $active={view === 'week'} aria-pressed={view === 'week'} onClick={() => setView('week')}>
                <CalendarRange size={15} />
                주간
              </ViewButton>
              <ViewButton type="button" $active={view === 'month'} aria-pressed={view === 'month'} onClick={() => setView('month')}>
                <LayoutGrid size={15} />
                월간
              </ViewButton>
              <ViewButton type="button" $active={view === 'list'} aria-pressed={view === 'list'} onClick={() => setView('list')}>
                <ListTodo size={15} />
                목록
              </ViewButton>
            </SegmentedControl>

            <SegmentedControl aria-label="완료 필터">
              {([
                ['all', '전체'],
                ['open', '미완료'],
                ['done', '완료'],
              ] as [StatusFilter, string][]).map(([key, label]) => (
                <ViewButton
                  key={key}
                  type="button"
                  $active={statusFilter === key}
                  aria-pressed={statusFilter === key}
                  onClick={() => setStatusFilter(key)}
                >
                  {label}
                </ViewButton>
              ))}
            </SegmentedControl>
          </FilterBar>

          <CategoryFilterSection>
            <CategoryFilterHeader>
              <span>분류별 보기</span>
              <strong>{filteredTasks.length}개 표시</strong>
            </CategoryFilterHeader>
            <CategoryRail aria-label="분류 필터">
              <CategoryFilterButton
                type="button"
                $active={categoryFilter === 'all'}
                $color="#4ade80"
                aria-pressed={categoryFilter === 'all'}
                onClick={() => setCategoryFilter('all')}
              >
                <span className="label">전체</span>
                <strong>{tasks.length}</strong>
              </CategoryFilterButton>
              {categories.map((category) => (
                <CategoryFilterButton
                  key={category.id}
                  type="button"
                  $active={categoryFilter === category.id}
                  $color={category.color}
                  aria-pressed={categoryFilter === category.id}
                  onClick={() => setCategoryFilter(category.id)}
                >
                  <CategoryDot $color={category.color} />
                  <span className="label">{category.label}</span>
                  <strong>{categoryTaskCounts[category.id] ?? 0}</strong>
                </CategoryFilterButton>
              ))}
            </CategoryRail>
          </CategoryFilterSection>

          <ProgressTrack aria-label={`완료율 ${completionPercent}%`}>
            <ProgressFill $value={completionPercent} />
          </ProgressTrack>

          {isLoading ? (
            <EmptyState>
              <Loader2 className="spin" size={26} />
              <strong>Firestore에서 일정을 불러오는 중입니다.</strong>
            </EmptyState>
          ) : null}

          {!isLoading && view === 'list' ? (
            <AllTaskList>
              {listedTasks.length > 0 ? (
                listedTasks.map((task) =>
                  renderOccurrence({
                    task,
                    dateKey: getListCompletionKey(task, selectedDate),
                    completed: isTaskDoneInList(task),
                  }),
                )
              ) : (
                <EmptyState>
                  <ListTodo size={28} />
                  <strong>목록에 표시할 할일이 없습니다.</strong>
                  {hasActiveFilters ? (
                    <EmptyStateAction
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setCategoryFilter('all');
                      }}
                    >
                      <RotateCcw size={15} />
                      필터 초기화
                    </EmptyStateAction>
                  ) : (
                    <EmptyStateAction type="button" onClick={() => openComposerForDate(selectedDate)}>
                      <Plus size={15} />
                      할일 추가
                    </EmptyStateAction>
                  )}
                </EmptyState>
              )}
            </AllTaskList>
          ) : null}

          {!isLoading && view === 'day' ? (
            <DaySchedule>
              <AllDayLane>
                <LaneLabel>
                  <Sparkles size={15} />
                  종일
                </LaneLabel>
                <LaneContent>
                  {selectedOccurrences.filter((item) => !item.task.time).length > 0 ? (
                    selectedOccurrences.filter((item) => !item.task.time).map((item) => renderOccurrence(item))
                  ) : (
                    <MutedText>종일 일정 없음</MutedText>
                  )}
                </LaneContent>
              </AllDayLane>

              <Timeline>
                {DAY_HOURS.map((hour) => {
                  const hourItems = selectedOccurrences.filter((item) => {
                    if (!item.task.time) return false;
                    return Number(item.task.time.slice(0, 2)) === hour;
                  });

                  return (
                    <TimeSlot key={hour}>
                      <TimeLabel>{String(hour).padStart(2, '0')}:00</TimeLabel>
                      <TimeContent>{hourItems.length > 0 ? hourItems.map((item) => renderOccurrence(item)) : <EmptyLine />}</TimeContent>
                    </TimeSlot>
                  );
                })}
              </Timeline>
            </DaySchedule>
          ) : null}

          {!isLoading && view === 'week' ? (
            <WeekGrid>
              {getWeekDateKeys(selectedDate).map((dateKey) => {
                const dayOccurrences = filterOccurrences(getOccurrencesForDate(filteredTasks, dateKey), statusFilter);
                const date = parseDateKey(dateKey);
                const active = dateKey === selectedDate;
                const accent = getDateBandColor(date);

                return (
                  <WeekColumn key={dateKey} $active={active} $accent={accent}>
                    <WeekHeaderButton type="button" $accent={accent} onClick={() => setSelectedDate(dateKey)}>
                      <span>{WEEKDAY_LABELS[date.getDay()]}</span>
                      <strong>{date.getDate()}</strong>
                      <small>{getCompletionPercent(dayOccurrences)}%</small>
                    </WeekHeaderButton>
                    <WeekTaskList>
                      {dayOccurrences.length > 0 ? (
                        dayOccurrences.map((item) => renderOccurrence(item, true))
                      ) : (
                        <WeekEmpty>비어 있음</WeekEmpty>
                      )}
                    </WeekTaskList>
                  </WeekColumn>
                );
              })}
            </WeekGrid>
          ) : null}

          {!isLoading && view === 'month' ? (
            <>
              <MonthWeekLabels>
                {['월', '화', '수', '목', '금', '토', '일'].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </MonthWeekLabels>
              <MonthGrid>
                {monthGridDateKeys.map((dateKey) => {
                  const date = parseDateKey(dateKey);
                  const dayOccurrences = filterOccurrences(getOccurrencesForDate(filteredTasks, dateKey), statusFilter);
                  const accent = getDateBandColor(date);

                  return (
                    <MonthCell
                      key={dateKey}
                      type="button"
                      $active={dateKey === selectedDate}
                      $muted={!isCurrentMonth(dateKey, selectedDate)}
                      $accent={accent}
                      onClick={() => setSelectedDate(dateKey)}
                    >
                      <MonthCellTop $accent={accent}>
                        <strong>{date.getDate()}</strong>
                        {dayOccurrences.length > 0 ? <small>{dayOccurrences.length}</small> : null}
                      </MonthCellTop>
                      <MonthTaskStack>
                        {dayOccurrences.slice(0, 3).map((item) => (
                          <MonthTaskChip
                            key={`${item.task.id}-${dateKey}`}
                            $color={getCategoryMeta(categories, item.task.categoryId).color}
                            $done={item.completed}
                          >
                            {item.task.title}
                          </MonthTaskChip>
                        ))}
                        {dayOccurrences.length > 3 ? <MoreText>+{dayOccurrences.length - 3}</MoreText> : null}
                      </MonthTaskStack>
                    </MonthCell>
                  );
                })}
              </MonthGrid>
              <SelectedDayDock>
                <PanelHeader>
                  <div>
                    <PanelTitle>{formatFullDate(selectedDate)}</PanelTitle>
                    <PanelHint>선택한 날짜의 일정</PanelHint>
                  </div>
                  <GhostButton type="button" onClick={() => setView('day')}>
                    일간 보기
                  </GhostButton>
                </PanelHeader>
                <DockList>
                  {selectedOccurrences.length > 0 ? (
                    selectedOccurrences.map((item) => renderOccurrence(item))
                  ) : (
                    <EmptyState>
                      <ListTodo size={28} />
                      <strong>등록된 일정이 없습니다.</strong>
                      <EmptyStateAction type="button" onClick={() => openComposerForDate(selectedDate)}>
                        <Plus size={15} />
                        이 날짜에 추가
                      </EmptyStateAction>
                    </EmptyState>
                  )}
                </DockList>
              </SelectedDayDock>
            </>
          ) : null}

          {!isLoading && view !== 'month' && view !== 'list' && selectedOccurrences.length === 0 ? (
            <EmptyState>
              <Target size={30} />
              <strong>표시할 할일이 없습니다.</strong>
              {hasActiveFilters ? (
                <EmptyStateAction
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setCategoryFilter('all');
                  }}
                >
                  <RotateCcw size={15} />
                  필터 초기화
                </EmptyStateAction>
              ) : (
                <EmptyStateAction type="button" onClick={() => openComposerForDate(selectedDate)}>
                  <Plus size={15} />
                  이 날짜에 추가
                </EmptyStateAction>
              )}
            </EmptyState>
          ) : null}
        </PlannerPanel>
      </Workspace>
    </Shell>
  );
}

export default TodoListApp;

const Shell = styled.main`
  height: 100%;
  min-height: 0;
  overflow: auto;
  color: #edf7ef;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(180deg, rgba(74, 222, 128, 0.1), transparent 260px),
    linear-gradient(135deg, #080b0a 0%, #101512 48%, #14100c 100%);
  background-size: 48px 48px, auto, auto;

  body[data-propig-design='codeit'] & {
    color: var(--text-main);
    background: var(--codeit-bg);
    background-size: auto;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const HeaderBand = styled.section`
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  align-items: end;
  padding: 24px 32px 16px;

  body[data-propig-design='codeit'] & {
    margin: 16px 32px 18px;
    padding: 20px;
    border: 1px solid var(--codeit-border);
    border-radius: var(--codeit-radius);
    background: var(--codeit-surface);
    box-shadow: var(--codeit-shadow-md);
    animation: todoCodeitRise 0.58s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes todoCodeitRise {
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
    padding: 16px 12px 12px;

    body[data-propig-design='codeit'] & {
      margin: 12px;
      padding: 14px;
    }
  }
`;

const HeroCopy = styled.div`
  min-width: 0;

  h1 {
    margin: 8px 0 10px;
    max-width: 760px;
    color: #fffdf5;
    font-size: 2.55rem;
    line-height: 1.06;
    letter-spacing: 0;
    overflow-wrap: break-word;
    word-break: keep-all;
  }

  body[data-propig-design='codeit'] & h1 {
    color: var(--codeit-text);
    font-size: clamp(2.1rem, 4vw, 3.9rem);
  }

  @media (max-width: 720px) {
    h1 {
      font-size: 1.85rem;
      line-height: 1.08;
    }
  }
`;

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #a7f3d0;
  font-size: 0.78rem;
  font-weight: 950;
  text-transform: uppercase;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-primary);
  }
`;

const HeroMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    min-height: 30px;
    padding: 6px 10px;
    border: 1px solid rgba(226, 232, 240, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.045);
    color: rgba(226, 232, 240, 0.78);
    font-size: 0.78rem;
    font-weight: 850;
  }

  body[data-propig-design='codeit'] & span {
    border-color: var(--codeit-border);
    background: rgba(255, 255, 255, 0.86);
    color: var(--codeit-muted);
  }
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
`;

const ManageToggleButton = styled.button<{ $active: boolean }>`
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(74, 222, 128, 0.56)' : 'rgba(74, 222, 128, 0.24)')};
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'rgba(74, 222, 128, 0.18)' : 'rgba(74, 222, 128, 0.1)')};
  color: #bbf7d0;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(74, 222, 128, 0.62);
    background: rgba(74, 222, 128, 0.16);
  }

  &:focus-visible {
    outline: 3px solid rgba(74, 222, 128, 0.22);
    outline-offset: 2px;
  }

  body[data-propig-design='codeit'] & {
    border-color: ${({ $active }) => ($active ? 'transparent' : 'var(--codeit-primary-border)')};
    background: ${({ $active }) => ($active ? 'var(--codeit-primary)' : 'var(--codeit-primary-soft)')};
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-primary)')};
  }

  body[data-propig-design='codeit'] &:hover {
    border-color: ${({ $active }) => ($active ? 'transparent' : 'var(--codeit-primary-border)')};
    background: ${({ $active }) => ($active ? 'var(--codeit-primary-hover)' : 'rgba(52, 81, 209, 0.13)')};
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-primary-hover)')};
  }
`;

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 620px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const KpiCard = styled.div<{ $tone: string }>`
  min-width: 0;
  min-height: 98px;
  padding: 14px;
  border: 1px solid ${({ $tone }) => `${$tone}42`};
  border-radius: 8px;
  background:
    linear-gradient(180deg, ${({ $tone }) => `${$tone}18`}, rgba(255, 255, 255, 0.035)),
    rgba(5, 9, 8, 0.56);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 18px 34px rgba(0, 0, 0, 0.22);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-sm);
    animation: todoKpiIn 0.52s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  body[data-propig-design='codeit'] &:hover {
    transform: translateY(-3px);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    border-color: ${({ $tone }) => `${$tone}55`};
    box-shadow: var(--codeit-shadow-md);
  }

  @keyframes todoKpiIn {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  span,
  strong,
  small {
    display: block;
  }

  span {
    color: rgba(226, 232, 240, 0.68);
    font-size: 0.76rem;
    font-weight: 850;
  }

  strong {
    margin-top: 12px;
    color: #fffdf5;
    font-size: 1.92rem;
    line-height: 0.92;
  }

  body[data-propig-design='codeit'] & strong {
    color: var(--codeit-text);
  }

  body[data-propig-design='codeit'] & span,
  body[data-propig-design='codeit'] & small {
    color: var(--codeit-muted);
  }

  small {
    margin-top: 8px;
    color: rgba(203, 213, 225, 0.58);
    font-size: 0.72rem;
    font-weight: 800;
  }

  @media (max-width: 620px) {
    min-height: 88px;

    strong {
      font-size: 1.5rem;
    }
  }
`;

const Workspace = styled.section`
  display: grid;
  grid-template-columns: minmax(320px, 372px) minmax(0, 1fr);
  gap: 18px;
  padding: 0 32px 32px;

  @media (max-width: 1320px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 720px) {
    padding: 0 12px 20px;
  }
`;

const panelSurface = css`
  border: 1px solid rgba(226, 232, 240, 0.12);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(18, 24, 21, 0.94), rgba(8, 12, 11, 0.94)),
    rgba(10, 13, 12, 0.9);
  box-shadow: 0 22px 54px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(18px);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
    backdrop-filter: none;
  }
`;

const ManagementPanel = styled.section`
  ${panelSurface}
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
  gap: 14px;
  margin: 0 32px 18px;
  padding: 16px;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 720px) {
    margin: 0 12px 14px;
    padding: 12px;
  }
`;

const DefaultViewPanel = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(74, 222, 128, 0.14);
  border-radius: 8px;
  background: rgba(74, 222, 128, 0.055);

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-primary-border);
    background: var(--codeit-primary-soft);
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const DefaultViewCopy = styled.div`
  display: grid;
  gap: 5px;

  strong {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #fffdf5;
    font-size: 0.9rem;
    font-weight: 950;
  }

  span {
    color: rgba(203, 213, 225, 0.68);
    font-size: 0.78rem;
    line-height: 1.45;
  }

  body[data-propig-design='codeit'] & strong {
    color: var(--codeit-text);
  }

  body[data-propig-design='codeit'] & span {
    color: var(--codeit-muted);
  }
`;

const DefaultPlannerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const DefaultPlannerButton = styled.button<{ $active: boolean }>`
  min-width: 0;
  min-height: 42px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(74, 222, 128, 0.58)' : 'rgba(226, 232, 240, 0.12)')};
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: ${({ $active }) => ($active ? 'rgba(74, 222, 128, 0.18)' : 'rgba(255, 255, 255, 0.035)')};
  color: ${({ $active }) => ($active ? '#bbf7d0' : 'rgba(203, 213, 225, 0.74)')};
  font-size: 0.82rem;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(74, 222, 128, 0.5);
    background: rgba(74, 222, 128, 0.12);
    color: #fffdf5;
  }

  &:focus-visible {
    outline: 3px solid rgba(74, 222, 128, 0.22);
    outline-offset: 2px;
  }

  body[data-propig-design='codeit'] & {
    border-color: ${({ $active }) => ($active ? 'var(--codeit-primary-border)' : 'var(--codeit-border)')};
    background: ${({ $active }) => ($active ? 'var(--codeit-primary-soft)' : '#ffffff')};
    color: ${({ $active }) => ($active ? 'var(--codeit-primary)' : 'var(--codeit-muted)')};
  }

  body[data-propig-design='codeit'] &:hover {
    border-color: var(--codeit-primary-border);
    background: var(--codeit-primary-soft);
    color: var(--codeit-text);
  }
`;

const Composer = styled.form<{ $open: boolean }>`
  ${panelSurface}
  position: sticky;
  top: 16px;
  align-self: start;
  display: grid;
  gap: 14px;
  max-height: calc(100vh - 154px);
  overflow: auto;
  padding: 18px;

  @media (max-width: 1320px) {
    position: static;
    max-height: none;
  }

  @media (max-width: 720px) {
    padding: ${({ $open }) => ($open ? '16px' : '14px')};
  }
`;

const PlannerPanel = styled.div`
  ${panelSurface}
  min-width: 0;
  min-height: 620px;
  padding: 18px;

  @media (max-width: 720px) {
    min-height: 520px;
    padding: 14px;
  }
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const PanelActions = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
`;

const MobileComposerToggle = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(74, 222, 128, 0.28);
  border-radius: 8px;
  background: rgba(74, 222, 128, 0.1);
  color: #bbf7d0;
  font-weight: 950;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid rgba(74, 222, 128, 0.22);
    outline-offset: 2px;
  }

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-primary-border);
    background: var(--codeit-primary-soft);
    color: var(--codeit-primary);
  }

  @media (max-width: 720px) {
    display: inline-flex;
  }
`;

const ComposerBody = styled.div<{ $open: boolean }>`
  display: grid;
  gap: 14px;

  @media (max-width: 720px) {
    display: ${({ $open }) => ($open ? 'grid' : 'none')};
  }
`;

const PanelTitle = styled.h2`
  margin: 0;
  color: #fffdf5;
  font-size: 1.02rem;
  font-weight: 950;
  letter-spacing: 0;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-text);
  }
`;

const PanelHint = styled.p`
  margin: 5px 0 0;
  color: rgba(203, 213, 225, 0.62);
  font-size: 0.8rem;
  line-height: 1.45;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-muted);
  }
`;

const FieldStack = styled.div`
  display: grid;
  gap: 10px;
`;

const inputStyles = css`
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(226, 232, 240, 0.13);
  border-radius: 8px;
  background: rgba(3, 7, 6, 0.72);
  color: #f8fafc;
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    border-color: rgba(74, 222, 128, 0.3);
  }

  &:focus {
    border-color: rgba(74, 222, 128, 0.62);
    box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.12);
    background: rgba(7, 13, 11, 0.94);
  }

  &::placeholder {
    color: rgba(148, 163, 184, 0.66);
  }

  body[data-propig-design='codeit'] & {
    background: #ffffff;
    border-color: var(--codeit-border-strong);
    color: var(--codeit-text);
    color-scheme: light;
  }

  body[data-propig-design='codeit'] &:hover {
    border-color: var(--codeit-primary-border);
  }

  body[data-propig-design='codeit'] &:focus {
    border-color: var(--codeit-primary);
    box-shadow: 0 0 0 3px rgba(52, 81, 209, 0.11);
    background: #ffffff;
  }
`;

const TextInput = styled.input`
  ${inputStyles}
  height: 46px;
  padding: 0 13px;
  font-size: 0.95rem;
  font-weight: 850;
`;

const TextArea = styled.textarea`
  ${inputStyles}
  min-height: 86px;
  resize: vertical;
  padding: 12px 13px;
  line-height: 1.5;
`;

const TwoColumnFields = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const FieldLabel = styled.label`
  display: grid;
  gap: 6px;
  min-width: 0;
  color: rgba(226, 232, 240, 0.74);
  font-size: 0.73rem;
  font-weight: 950;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-muted);
  }
`;

const FloatingNotice = styled.div`
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid rgba(74, 222, 128, 0.22);
  border-radius: 8px;
  background: rgba(74, 222, 128, 0.08);
  color: rgba(220, 252, 231, 0.9);
  font-size: 0.78rem;
  font-weight: 850;
  line-height: 1.45;

  svg {
    flex: 0 0 auto;
    color: #86efac;
  }

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-primary-border);
    background: var(--codeit-primary-soft);
    color: var(--codeit-text);
  }

  body[data-propig-design='codeit'] & svg {
    color: var(--codeit-primary);
  }
`;

const DateInput = styled.input`
  ${inputStyles}
  height: 42px;
  padding: 0 10px;
  color-scheme: dark;

  body[data-propig-design='codeit'] & {
    color-scheme: light;
  }
`;

const TimeInput = styled(DateInput)``;

const FieldBlock = styled.div`
  display: grid;
  gap: 8px;
`;

const BlockLabel = styled.span`
  color: rgba(226, 232, 240, 0.74);
  font-size: 0.73rem;
  font-weight: 950;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-muted);
  }
`;

const CategoryChoiceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const CategoryChoiceButton = styled.button<{ $active: boolean; $color: string }>`
  min-width: 0;
  min-height: 42px;
  padding: 0 11px;
  border: 1px solid ${({ $active, $color }) => ($active ? `${$color}8c` : 'rgba(226, 232, 240, 0.12)')};
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  background: ${({ $active, $color }) => ($active ? `${$color}22` : 'rgba(255, 255, 255, 0.035)')};
  color: ${({ $active }) => ($active ? '#fffdf5' : 'rgba(203, 213, 225, 0.78)')};
  font-size: 0.8rem;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ $color }) => `${$color}80`};
    background: ${({ $color }) => `${$color}1f`};
    color: #fffdf5;
  }

  &:focus-visible {
    outline: 3px solid ${({ $color }) => `${$color}38`};
    outline-offset: 2px;
  }

  body[data-propig-design='codeit'] & {
    border-color: ${({ $active, $color }) => ($active ? `${$color}70` : 'var(--codeit-border)')};
    background: ${({ $active, $color }) => ($active ? `${$color}18` : '#ffffff')};
    color: var(--codeit-text);
  }

  body[data-propig-design='codeit'] &:hover {
    background: ${({ $color }) => `${$color}15`};
    color: var(--codeit-text);
  }
`;

const CategoryEmpty = styled.div`
  min-height: 42px;
  padding: 11px 12px;
  border: 1px dashed rgba(226, 232, 240, 0.14);
  border-radius: 8px;
  color: rgba(148, 163, 184, 0.78);
  font-size: 0.78rem;
  line-height: 1.45;

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-border);
    color: var(--codeit-muted);
  }
`;

const CategoryManager = styled.div`
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(226, 232, 240, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-border);
    background: var(--codeit-surface-soft);
  }
`;

const CategoryManagerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  span:last-child {
    color: rgba(203, 213, 225, 0.58);
    font-size: 0.72rem;
    font-weight: 850;
  }

  body[data-propig-design='codeit'] & span:last-child {
    color: var(--codeit-faint);
  }
`;

const CategoryCreateRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px 58px;
  gap: 8px;

  @media (max-width: 420px) {
    grid-template-columns: minmax(0, 1fr) 42px;

    button {
      grid-column: 1 / -1;
      width: 100%;
    }
  }
`;

const CategoryList = styled.div`
  display: grid;
  gap: 7px;
  max-height: 166px;
  overflow: auto;
`;

const CategoryRow = styled.div<{ $editing: boolean }>`
  display: grid;
  grid-template-columns: ${({ $editing }) =>
    $editing ? 'minmax(0, 1fr) 42px 58px 40px' : '14px minmax(0, 1fr) 40px 40px'};
  align-items: center;
  gap: 8px;
  min-height: 40px;
`;

const CategoryNameInput = styled.input`
  ${inputStyles}
  height: 34px;
  padding: 0 10px;
  font-size: 0.82rem;
`;

const ColorInput = styled.input`
  width: 42px;
  height: 34px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(4, 10, 17, 0.72);
  cursor: pointer;

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-border);
    background: #ffffff;
  }
`;

const SmallButton = styled.button`
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(226, 232, 240, 0.72);
  border-radius: 8px;
  background: #f8fafc;
  color: #111827;
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

`;

const CategoryDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: ${({ $color }) => $color};
  box-shadow: 0 0 14px ${({ $color }) => `${$color}80`};
`;

const CategoryName = styled.span`
  min-width: 0;
  color: #e2e8f0;
  font-size: 0.82rem;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-text);
  }
`;

const DangerResetPanel = styled.div`
  display: grid;
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(255, 122, 89, 0.28);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 122, 89, 0.12), rgba(74, 222, 128, 0.06)),
    rgba(4, 10, 17, 0.48);

  strong {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #fff7ed;
    font-size: 0.95rem;
    font-weight: 950;
  }

  span {
    display: block;
    margin-top: 6px;
    color: rgba(254, 226, 226, 0.76);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  body[data-propig-design='codeit'] & {
    background: rgba(255, 107, 107, 0.08);
    border-color: rgba(255, 107, 107, 0.24);
  }

  body[data-propig-design='codeit'] & strong {
    color: var(--codeit-text);
  }

  body[data-propig-design='codeit'] & span {
    color: var(--codeit-muted);
  }
`;

const DangerResetActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const ResetActionButton = styled.button<{ $tone: 'warm' | 'danger' }>`
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid ${({ $tone }) => ($tone === 'warm' ? 'rgba(250, 204, 21, 0.38)' : 'rgba(255, 122, 89, 0.38)')};
  border-radius: 8px;
  background: ${({ $tone }) => ($tone === 'warm' ? 'rgba(250, 204, 21, 0.12)' : 'rgba(255, 122, 89, 0.14)')};
  color: ${({ $tone }) => ($tone === 'warm' ? '#fde68a' : '#fecaca')};
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: ${({ $tone }) => ($tone === 'warm' ? 'rgba(250, 204, 21, 0.62)' : 'rgba(255, 122, 89, 0.62)')};
    background: ${({ $tone }) => ($tone === 'warm' ? 'rgba(250, 204, 21, 0.18)' : 'rgba(255, 122, 89, 0.2)')};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  body[data-propig-design='codeit'] & {
    background: ${({ $tone }) => ($tone === 'warm' ? 'rgba(245, 159, 0, 0.12)' : 'rgba(255, 107, 107, 0.12)')};
    border-color: ${({ $tone }) => ($tone === 'warm' ? 'rgba(245, 159, 0, 0.32)' : 'rgba(255, 107, 107, 0.32)')};
    color: ${({ $tone }) => ($tone === 'warm' ? '#8a5a00' : '#b42318')};
  }
`;

const SegmentGrid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr));
  gap: 5px;
  padding: 4px;
  border: 1px solid rgba(226, 232, 240, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-border);
    background: var(--codeit-surface-soft);
  }

  @media (max-width: 980px) {
    grid-template-columns: repeat(${({ $columns }) => Math.min($columns, 3)}, minmax(0, 1fr));
  }

  @media (max-width: 420px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SegmentButton = styled.button<{ $active: boolean; $color: string }>`
  min-width: 0;
  min-height: 34px;
  border: 0;
  border-radius: 7px;
  background: ${({ $active, $color }) => ($active ? `${$color}22` : 'transparent')};
  color: ${({ $active }) => ($active ? '#fffdf5' : 'rgba(203, 213, 225, 0.68)')};
  font-size: 0.76rem;
  font-weight: 950;
  cursor: pointer;
  transition:
    color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    color: #fffdf5;
  }

  body[data-propig-design='codeit'] & {
    background: ${({ $active, $color }) => ($active ? `${$color}18` : 'transparent')};
    color: ${({ $active }) => ($active ? 'var(--codeit-text)' : 'var(--codeit-muted)')};
  }

  body[data-propig-design='codeit'] &:hover {
    color: var(--codeit-text);
  }
`;

const WeekdayGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
`;

const MonthDayGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 5px;
  max-height: 142px;
  overflow: auto;
`;

const ChipButton = styled.button<{ $active: boolean }>`
  height: 32px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(74, 222, 128, 0.5)' : 'rgba(226, 232, 240, 0.1)')};
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'rgba(74, 222, 128, 0.16)' : 'rgba(255, 255, 255, 0.035)')};
  color: ${({ $active }) => ($active ? '#bbf7d0' : 'rgba(203, 213, 225, 0.74)')};
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;

  body[data-propig-design='codeit'] & {
    border-color: ${({ $active }) => ($active ? 'var(--codeit-primary-border)' : 'var(--codeit-border)')};
    background: ${({ $active }) => ($active ? 'var(--codeit-primary-soft)' : '#ffffff')};
    color: ${({ $active }) => ($active ? 'var(--codeit-primary)' : 'var(--codeit-muted)')};
  }
`;

const ExactDateRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 8px;
`;

const ExactDateList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const DatePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 6px 0 9px;
  border: 1px solid rgba(34, 211, 238, 0.26);
  border-radius: 999px;
  background: rgba(34, 211, 238, 0.1);
  color: #a5f3fc;
  font-size: 0.76rem;
  font-weight: 900;

  button {
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    cursor: pointer;
  }
`;

const SubmitRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const PrimaryButton = styled.button`
  min-width: 112px;
  height: 42px;
  padding: 0 14px;
  border: 1px solid rgba(74, 222, 128, 0.58);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #4ade80, #16a34a);
  color: #04120a;
  font-weight: 950;
  cursor: pointer;
  box-shadow: 0 14px 28px rgba(22, 163, 74, 0.22);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary);
    border-color: var(--codeit-primary);
    color: #ffffff;
    box-shadow: 0 12px 28px rgba(37, 87, 214, 0.18);
  }

  body[data-propig-design='codeit'] &:hover:not(:disabled) {
    background: var(--codeit-primary-hover);
    border-color: var(--codeit-primary-hover);
    box-shadow: 0 16px 34px rgba(37, 87, 214, 0.2);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }
`;

const GhostButton = styled.button`
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(226, 232, 240, 0.12);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.82);
  font-weight: 900;
  cursor: pointer;
`;

const IconButton = styled.button`
  width: 40px;
  height: 40px;
  border: 1px solid rgba(226, 232, 240, 0.12);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.86);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(74, 222, 128, 0.38);
    background: rgba(74, 222, 128, 0.1);
    color: #fff;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }
`;

const PlannerToolbar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;

  @media (max-width: 720px) {
    flex-direction: column;
  }
`;

const ToolbarTitle = styled.div`
  min-width: 0;
`;

const ToolbarControls = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
`;

const StatusBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(251, 113, 133, 0.34);
  border-radius: 8px;
  background: rgba(251, 113, 133, 0.1);
  color: #fecdd3;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.45;

  svg {
    flex: 0 0 auto;
    margin-top: 1px;
  }
`;

const PlannerStats = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
`;

const PlannerStat = styled.div`
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(226, 232, 240, 0.1);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(226, 232, 240, 0.78);
  font-size: 0.76rem;
  font-weight: 850;

  svg {
    color: #86efac;
  }

  strong {
    color: #fffdf5;
    font-size: 0.86rem;
    font-variant-numeric: tabular-nums;
  }
`;

const TodayButton = styled.button`
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(250, 204, 21, 0.28);
  border-radius: 8px;
  background: rgba(250, 204, 21, 0.1);
  color: #fde68a;
  font-weight: 950;
  cursor: pointer;
`;

const FilterBar = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
`;

const SegmentedControl = styled.div`
  display: inline-flex;
  gap: 5px;
  padding: 4px;
  border: 1px solid rgba(226, 232, 240, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  overflow-x: auto;
`;

const ViewButton = styled.button<{ $active: boolean }>`
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: ${({ $active }) => ($active ? 'rgba(74, 222, 128, 0.15)' : 'transparent')};
  color: ${({ $active }) => ($active ? '#bbf7d0' : 'rgba(203, 213, 225, 0.72)')};
  font-size: 0.8rem;
  font-weight: 950;
  white-space: nowrap;
  cursor: pointer;
`;

const CategoryFilterSection = styled.div`
  margin-top: 12px;
`;

const CategoryFilterHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;

  span {
    color: rgba(226, 232, 240, 0.78);
    font-size: 0.74rem;
    font-weight: 950;
  }

  strong {
    color: rgba(203, 213, 225, 0.58);
    font-size: 0.72rem;
    font-weight: 900;
  }
`;

const CategoryRail = styled.div`
  display: flex;
  gap: 7px;
  padding-bottom: 2px;
  overflow-x: auto;
`;

const CategoryFilterButton = styled.button<{ $active: boolean; $color: string }>`
  flex: 0 0 auto;
  min-height: 34px;
  max-width: 190px;
  padding: 0 10px;
  border: 1px solid ${({ $active, $color }) => ($active ? `${$color}7a` : 'rgba(226, 232, 240, 0.1)')};
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: ${({ $active, $color }) => ($active ? `${$color}1f` : 'rgba(255, 255, 255, 0.035)')};
  color: ${({ $active }) => ($active ? '#fffdf5' : 'rgba(203, 213, 225, 0.72)')};
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  span.label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    min-width: 24px;
    height: 22px;
    padding: 0 7px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(3, 7, 6, 0.42);
    color: ${({ $color }) => $color};
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ $color }) => `${$color}80`};
    color: #fffdf5;
  }

  &:focus-visible {
    outline: 3px solid ${({ $color }) => `${$color}38`};
    outline-offset: 2px;
  }
`;

const ProgressTrack = styled.div`
  height: 8px;
  margin: 14px 0 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $value: number }>`
  width: ${({ $value }) => $value}%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4ade80, #22d3ee, #facc15);
  transition: width 0.35s ease;

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary);
  }
`;

const DaySchedule = styled.div`
  display: grid;
  gap: 14px;
`;

const AllDayLane = styled.div`
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 12px;
  align-items: start;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const LaneLabel = styled.div`
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(226, 232, 240, 0.7);
  font-size: 0.78rem;
  font-weight: 950;
`;

const LaneContent = styled.div`
  display: grid;
  gap: 8px;
`;

const MutedText = styled.span`
  min-height: 40px;
  padding: 11px 12px;
  border: 1px dashed rgba(226, 232, 240, 0.12);
  border-radius: 8px;
  color: rgba(148, 163, 184, 0.7);
  font-size: 0.8rem;
`;

const Timeline = styled.div`
  display: grid;
  gap: 0;
`;

const TimeSlot = styled.div`
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 12px;
  min-height: 64px;
  border-top: 1px solid rgba(226, 232, 240, 0.08);

  &:last-child {
    border-bottom: 1px solid rgba(226, 232, 240, 0.08);
  }

  @media (max-width: 620px) {
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 8px;
  }
`;

const TimeLabel = styled.div`
  padding-top: 14px;
  color: rgba(148, 163, 184, 0.74);
  font-size: 0.75rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
`;

const TimeContent = styled.div`
  display: grid;
  gap: 8px;
  padding: 8px 0;
`;

const EmptyLine = styled.div`
  height: 1px;
  margin-top: 22px;
  background: linear-gradient(90deg, rgba(226, 232, 240, 0.1), transparent);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-border);
  }
`;

const TaskItem = styled.article<{ $color: string; $done: boolean; $compact: boolean }>`
  min-width: 0;
  display: grid;
  grid-template-columns: ${({ $compact }) => ($compact ? '28px minmax(0, 1fr) 30px' : '34px minmax(0, 1fr) auto')};
  gap: ${({ $compact }) => ($compact ? '6px' : '10px')};
  align-items: start;
  padding: ${({ $compact }) => ($compact ? '9px' : '12px')};
  border: 1px solid ${({ $color }) => `${$color}42`};
  border-radius: 8px;
  background:
    linear-gradient(90deg, ${({ $color }) => `${$color}18`}, transparent 54%),
    rgba(255, 255, 255, 0.04);
  opacity: ${({ $done }) => ($done ? 0.62 : 1)};

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-sm);
  }
`;

const TaskCheckButton = styled.button`
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #bbf7d0;
  cursor: pointer;
`;

const TaskBody = styled.div`
  min-width: 0;
`;

const TaskTitleRow = styled.div`
  min-width: 0;
`;

const TaskTitle = styled.strong`
  min-width: 0;
  color: #fffdf5;
  font-size: 0.9rem;
  line-height: 1.35;
  overflow-wrap: anywhere;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-text);
  }
`;

const TaskNote = styled.p`
  margin: 5px 0 0;
  color: rgba(203, 213, 225, 0.68);
  font-size: 0.78rem;
  line-height: 1.45;
  overflow-wrap: anywhere;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-muted);
  }
`;

const TaskMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 7px;

  span {
    min-height: 22px;
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(3, 7, 6, 0.42);
    color: rgba(203, 213, 225, 0.76);
    font-size: 0.68rem;
    font-weight: 850;
  }

  body[data-propig-design='codeit'] & span {
    background: var(--codeit-surface-soft);
    color: var(--codeit-muted);
  }
`;

const TaskActions = styled.div<{ $compact?: boolean }>`
  display: flex;
  gap: ${({ $compact }) => ($compact ? '0' : '6px')};
  justify-content: flex-end;
`;

const TaskActionButton = styled.button<{ $compact?: boolean; $danger?: boolean }>`
  width: ${({ $compact }) => ($compact ? '28px' : '34px')};
  height: ${({ $compact }) => ($compact ? '28px' : '34px')};
  border: 1px solid ${({ $danger }) => ($danger ? 'rgba(251, 113, 133, 0.22)' : 'rgba(226, 232, 240, 0.12)')};
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $danger }) => ($danger ? 'rgba(251, 113, 133, 0.08)' : 'rgba(255, 255, 255, 0.04)')};
  color: ${({ $danger }) => ($danger ? '#fecdd3' : 'rgba(226, 232, 240, 0.86)')};
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ $danger }) => ($danger ? 'rgba(251, 113, 133, 0.54)' : 'rgba(74, 222, 128, 0.38)')};
    background: ${({ $danger }) => ($danger ? 'rgba(251, 113, 133, 0.15)' : 'rgba(74, 222, 128, 0.1)')};
    color: #fff;
  }

  body[data-propig-design='codeit'] & {
    border-color: ${({ $danger }) => ($danger ? 'rgba(255, 107, 107, 0.24)' : 'var(--codeit-border)')};
    background: ${({ $danger }) => ($danger ? 'rgba(255, 107, 107, 0.08)' : '#ffffff')};
    color: ${({ $danger }) => ($danger ? '#b42318' : 'var(--codeit-muted)')};
  }

  body[data-propig-design='codeit'] &:hover {
    border-color: ${({ $danger }) => ($danger ? 'rgba(255, 107, 107, 0.38)' : 'var(--codeit-primary-border)')};
    background: ${({ $danger }) => ($danger ? 'rgba(255, 107, 107, 0.12)' : 'var(--codeit-primary-soft)')};
    color: ${({ $danger }) => ($danger ? '#b42318' : 'var(--codeit-text)')};
  }
`;

const WeekGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(136px, 1fr));
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
`;

const WeekColumn = styled.div<{ $active: boolean; $accent: string }>`
  min-width: 136px;
  border: 1px solid ${({ $active, $accent }) => ($active ? `${$accent}c2` : `${$accent}52`)};
  border-radius: 8px;
  background: ${({ $active, $accent }) => ($active ? `${$accent}1f` : 'rgba(255, 255, 255, 0.032)')};
  overflow: hidden;

  body[data-propig-design='codeit'] & {
    background: ${({ $active, $accent }) => ($active ? `${$accent}16` : '#ffffff')};
    border-color: ${({ $active, $accent }) => ($active ? `${$accent}9c` : 'var(--codeit-border)')};
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-sm);
  }
`;

const WeekHeaderButton = styled.button<{ $accent: string }>`
  width: 100%;
  min-height: 78px;
  border: 0;
  display: grid;
  gap: 3px;
  place-items: center;
  background: ${({ $accent }) => $accent};
  color: #ffffff;
  cursor: pointer;
  box-shadow: inset 0 -1px 0 rgba(2, 6, 23, 0.24);

  body[data-propig-design='codeit'] & {
    background: ${({ $accent }) => $accent};
    color: #ffffff;
  }

  span {
    color: rgba(255, 255, 255, 0.86);
    font-size: 0.76rem;
    font-weight: 950;
  }

  body[data-propig-design='codeit'] & span {
    color: rgba(255, 255, 255, 0.86);
  }

  strong {
    color: #ffffff;
    font-size: 1.55rem;
    line-height: 1;
  }

  small {
    min-height: 22px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(2, 6, 23, 0.22);
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 900;
  }

  body[data-propig-design='codeit'] & small {
    color: #ffffff;
  }
`;

const WeekTaskList = styled.div`
  display: grid;
  gap: 7px;
  padding: 8px;
`;

const WeekEmpty = styled.div`
  min-height: 72px;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(226, 232, 240, 0.1);
  border-radius: 8px;
  color: rgba(148, 163, 184, 0.68);
  font-size: 0.75rem;
  font-weight: 850;

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-border);
    color: var(--codeit-muted);
  }
`;

const MonthWeekLabels = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;

  span {
    color: rgba(203, 213, 225, 0.68);
    font-size: 0.76rem;
    font-weight: 950;
    text-align: center;
  }

  body[data-propig-design='codeit'] & span {
    color: var(--codeit-muted);
  }
`;

const MonthGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(86px, 1fr));
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
`;

const MonthCell = styled.button<{ $active: boolean; $muted: boolean; $accent: string }>`
  min-width: 86px;
  min-height: 112px;
  padding: 0 9px 9px;
  border: 1px solid ${({ $active, $accent }) => ($active ? `${$accent}c2` : `${$accent}42`)};
  border-radius: 8px;
  background: ${({ $active, $accent }) => ($active ? `${$accent}1f` : 'rgba(255, 255, 255, 0.032)')};
  color: ${({ $muted }) => ($muted ? 'rgba(148, 163, 184, 0.42)' : '#f8fafc')};
  text-align: left;
  cursor: pointer;
  overflow: hidden;

  body[data-propig-design='codeit'] & {
    background: ${({ $active, $accent }) => ($active ? `${$accent}16` : '#ffffff')};
    border-color: ${({ $active, $accent }) => ($active ? `${$accent}9c` : 'var(--codeit-border)')};
    color: ${({ $muted }) => ($muted ? 'var(--codeit-faint)' : 'var(--codeit-text)')};
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-sm);
  }
`;

const MonthCellTop = styled.div<{ $accent: string }>`
  min-height: 32px;
  margin: 0 -9px 9px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: ${({ $accent }) => $accent};
  color: #ffffff;
  box-shadow: inset 0 -1px 0 rgba(2, 6, 23, 0.24);

  strong {
    color: #ffffff;
    font-size: 0.88rem;
    font-weight: 950;
  }

  small {
    min-width: 20px;
    height: 20px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(2, 6, 23, 0.24);
    color: #ffffff;
    font-size: 0.68rem;
    font-weight: 950;
  }

  body[data-propig-design='codeit'] & small {
    background: rgba(2, 6, 23, 0.24);
    color: #ffffff;
  }
`;

const MonthTaskStack = styled.div`
  display: grid;
  gap: 5px;
  margin-top: 9px;
`;

const MonthTaskChip = styled.span<{ $color: string; $done: boolean }>`
  min-width: 0;
  height: 22px;
  padding: 4px 7px;
  border-radius: 7px;
  background: ${({ $color }) => `${$color}20`};
  color: ${({ $done }) => ($done ? 'rgba(203, 213, 225, 0.52)' : '#f8fafc')};
  font-size: 0.68rem;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};

  body[data-propig-design='codeit'] & {
    color: ${({ $done }) => ($done ? 'var(--codeit-faint)' : 'var(--codeit-text)')};
  }
`;

const MoreText = styled.span`
  color: rgba(203, 213, 225, 0.58);
  font-size: 0.68rem;
  font-weight: 900;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-muted);
  }
`;

const SelectedDayDock = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.1);

  body[data-propig-design='codeit'] & {
    border-top-color: var(--codeit-border);
  }
`;

const DockList = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 12px;
`;

const AllTaskList = styled.div`
  display: grid;
  gap: 8px;
`;

const EmptyState = styled.div`
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgba(226, 232, 240, 0.13);
  border-radius: 8px;
  color: rgba(148, 163, 184, 0.72);
  text-align: center;

  strong {
    color: rgba(226, 232, 240, 0.82);
    font-size: 0.9rem;
  }

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-border);
    color: var(--codeit-muted);
  }

  body[data-propig-design='codeit'] & strong {
    color: var(--codeit-text);
  }
`;

const EmptyStateAction = styled.button`
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(74, 222, 128, 0.34);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: rgba(74, 222, 128, 0.1);
  color: #bbf7d0;
  font-size: 0.78rem;
  font-weight: 900;
  cursor: pointer;

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-primary-border);
    background: var(--codeit-primary-soft);
    color: var(--codeit-primary);
  }
`;

const CenteredPanel = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #080b0a;
  color: rgba(226, 232, 240, 0.78);

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const Gate = styled(CenteredPanel)`
  flex-direction: column;
  padding: 24px;
  text-align: center;
  background:
    linear-gradient(180deg, rgba(74, 222, 128, 0.12), transparent 280px),
    #080b0a;

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    color: var(--codeit-muted);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
  }

  h1 {
    margin: 8px 0 0;
    max-width: 640px;
    color: #fffdf5;
    font-size: clamp(1.8rem, 6vw, 3.2rem);
    letter-spacing: 0;
    word-break: keep-all;
  }

  body[data-propig-design='codeit'] & h1 {
    color: var(--codeit-text);
  }

  p {
    max-width: 540px;
    margin: 4px 0 12px;
    line-height: 1.7;
  }
`;

const GateVisual = styled.div`
  position: relative;
  display: grid;
  place-items: center;
  width: 118px;
  height: 118px;
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.22), rgba(250, 204, 21, 0.16));
  color: #bbf7d0;

  span {
    position: absolute;
    inset: 12px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 22px;
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary-soft);
    color: var(--codeit-primary);
  }

  body[data-propig-design='codeit'] & span {
    border-color: var(--codeit-primary-border);
  }
`;

const GateButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 8px;
  background: #f8fafc;
  color: #101318;
  font-weight: 900;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary);
    color: #ffffff;
    box-shadow: 0 12px 28px rgba(52, 81, 209, 0.18);
  }
`;
