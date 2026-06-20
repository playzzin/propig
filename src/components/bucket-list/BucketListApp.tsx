'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styled, { css } from 'styled-components';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
  Edit3,
  Flag,
  HeartPulse,
  Loader2,
  LogIn,
  Map,
  Mountain,
  Palette,
  PiggyBank,
  Plus,
  RefreshCcw,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ensureFirestorePersistence } from '@/firebase/config';
import {
  bucketListService,
  type BucketCategory,
  type BucketCategoryOption,
  type BucketListDraft,
  type BucketListItem,
  type BucketStatus,
} from '@/services/bucketListService';

type FilterKey = 'all' | BucketStatus;
type CategoryFilterKey = 'all' | BucketCategory;

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  color: string;
}

interface StatusMeta {
  label: string;
  hint: string;
  icon: LucideIcon;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  travel: { label: '여행', icon: Mountain, color: '#0284c7' },
  growth: { label: '성장', icon: Sparkles, color: '#ca8a04' },
  career: { label: '커리어', icon: TrendingUp, color: '#059669' },
  relationship: { label: '관계', icon: Users, color: '#e11d48' },
  wealth: { label: '자산', icon: PiggyBank, color: '#7c3aed' },
  health: { label: '건강', icon: HeartPulse, color: '#0891b2' },
  creative: { label: '창작', icon: Palette, color: '#ea580c' },
};

const CATEGORY_COLORS = ['#0284c7', '#059669', '#ca8a04', '#e11d48', '#7c3aed', '#0891b2', '#ea580c'];

const STATUS_META: Record<BucketStatus, StatusMeta> = {
  planned: { label: '계획', hint: '언젠가 현실로 만들 일', icon: Circle },
  progress: { label: '진행', hint: '지금 움직이는 목표', icon: Compass },
  done: { label: '달성', hint: '기록으로 남긴 순간', icon: Check },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'planned', label: '계획' },
  { key: 'progress', label: '진행' },
  { key: 'done', label: '달성' },
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toHexChannel(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');
}

function hslToRgb(hue: number, saturation: number, lightness: number): { r: number; g: number; b: number } {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = lightness - chroma / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (huePrime >= 0 && huePrime < 1) {
    r = chroma;
    g = x;
  } else if (huePrime < 2) {
    r = x;
    g = chroma;
  } else if (huePrime < 3) {
    g = chroma;
    b = x;
  } else if (huePrime < 4) {
    g = x;
    b = chroma;
  } else if (huePrime < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return {
    r: (r + match) * 255,
    g: (g + match) * 255,
    b: (b + match) * 255,
  };
}

function strengthenCategoryColor(color: string): string {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;

  const rawHex = match[1];
  const hex = rawHex.length === 3
    ? rawHex.split('').map((char) => `${char}${char}`).join('')
    : rawHex;
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  let hue = 0;
  if (delta !== 0) {
    if (max === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hue = 60 * ((b - r) / delta + 2);
    } else {
      hue = 60 * ((r - g) / delta + 4);
    }
  }
  if (hue < 0) hue += 360;

  const strongSaturation = Math.max(saturation, 0.76);
  const strongLightness = Math.min(Math.max(clamp01(lightness), 0.34), 0.46);
  const { r: nextR, g: nextG, b: nextB } = hslToRgb(hue, strongSaturation, strongLightness);

  return `#${toHexChannel(nextR)}${toHexChannel(nextG)}${toHexChannel(nextB)}`;
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

function createEmptyDraft(category: BucketCategory = ''): BucketListDraft {
  return {
    title: '',
    note: '',
    category,
    priority: 'medium',
    targetDate: '',
  };
}

const emptyDraft: BucketListDraft = createEmptyDraft();

type DDayTone = 'none' | 'upcoming' | 'today' | 'overdue' | 'done';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function formatDate(value: string): string {
  if (!value) return '날짜 미정';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '날짜 미정';
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(date);
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (parsed.getFullYear() !== Number(year) || parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) {
    return null;
  }

  return parsed;
}

function getLocalDayIndex(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_IN_MS);
}

function getDDayInfo(targetDate: string, status: BucketStatus): { label: string; tone: DDayTone; ariaLabel: string } {
  const parsedTargetDate = parseDateOnly(targetDate);
  if (!parsedTargetDate) {
    return { label: 'D-DAY 미정', tone: 'none', ariaLabel: 'D-DAY 날짜 미정' };
  }

  const today = new Date();
  const diffDays = getLocalDayIndex(parsedTargetDate) - getLocalDayIndex(today);
  const completed = status === 'done';

  if (diffDays === 0) {
    return {
      label: 'D-DAY',
      tone: completed ? 'done' : 'today',
      ariaLabel: completed ? '오늘 목표일, 달성 완료' : '오늘이 목표일',
    };
  }

  if (diffDays > 0) {
    return {
      label: `D-${diffDays}`,
      tone: completed ? 'done' : 'upcoming',
      ariaLabel: completed ? `목표일까지 ${diffDays}일 남은 상태로 달성 완료` : `목표일까지 ${diffDays}일 남음`,
    };
  }

  const overdueDays = Math.abs(diffDays);
  return {
    label: `D+${overdueDays}`,
    tone: completed ? 'done' : 'overdue',
    ariaLabel: completed ? `목표일에서 ${overdueDays}일 지난 뒤 달성 완료` : `목표일에서 ${overdueDays}일 지남`,
  };
}

function getProgress(items: BucketListItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((item) => item.status === 'done').length / items.length) * 100);
}

function sortItems(items: BucketListItem[]): BucketListItem[] {
  const statusWeight: Record<BucketStatus, number> = { progress: 0, planned: 1, done: 2 };

  return [...items].sort((a, b) => {
    if (statusWeight[a.status] !== statusWeight[b.status]) return statusWeight[a.status] - statusWeight[b.status];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function BucketListApp() {
  const { currentUser, loading: authLoading, loginWithGoogle, isConfigured } = useAuth();
  const [items, setItems] = useState<BucketListItem[]>([]);
  const [categories, setCategories] = useState<BucketCategoryOption[]>([]);
  const [draft, setDraft] = useState<BucketListDraft>(emptyDraft);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterKey>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<BucketListDraft>(emptyDraft);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryColor, setEditingCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      setItems([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    let unsubscribeItems: (() => void) | undefined;
    let unsubscribeCategories: (() => void) | undefined;
    let didCancel = false;

    const connect = async () => {
      try {
        setIsLoading(true);
        await ensureFirestorePersistence();
        await bucketListService.ensureDefaultCategories(currentUser.uid);

        unsubscribeItems = bucketListService.subscribe(
          currentUser.uid,
          (nextItems) => {
            if (didCancel) return;
            setItems(nextItems);
            setError(null);
            setIsLoading(false);
          },
          (nextError) => {
            if (didCancel) return;
            setError(nextError.message);
            setIsLoading(false);
          },
        );
        unsubscribeCategories = bucketListService.subscribeCategories(
          currentUser.uid,
          (nextCategories) => {
            if (didCancel) return;
            setCategories(nextCategories);
            setDraft((prev) => (nextCategories.some((category) => category.id === prev.category) ? prev : { ...prev, category: nextCategories[0]?.id ?? '' }));
            setEditDraft((prev) =>
              !prev.category || nextCategories.some((category) => category.id === prev.category)
                ? prev
                : { ...prev, category: nextCategories[0]?.id ?? '' },
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
      unsubscribeItems?.();
      unsubscribeCategories?.();
    };
  }, [authLoading, currentUser]);

  const statusFilteredItems = useMemo(() => {
    const nextItems = filter === 'all' ? items : items.filter((item) => item.status === filter);
    return nextItems;
  }, [filter, items]);

  const filteredItems = useMemo(() => {
    const nextItems = categoryFilter === 'all' ? statusFilteredItems : statusFilteredItems.filter((item) => item.category === categoryFilter);
    return sortItems(nextItems);
  }, [categoryFilter, statusFilteredItems]);

  const categoryCounts = useMemo(
    () =>
      statusFilteredItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.category] = (acc[item.category] ?? 0) + 1;
        return acc;
      }, {}),
    [statusFilteredItems],
  );

  const stats = useMemo(() => {
    const done = items.filter((item) => item.status === 'done').length;
    const progress = items.filter((item) => item.status === 'progress').length;
    const planned = items.filter((item) => item.status === 'planned').length;
    return { done, progress, planned, progressRate: getProgress(items) };
  }, [items]);
  const hasItemRecords = items.some((item) => item.status !== 'planned' || Boolean(item.completedAt));
  const hasWorkspaceData = items.length > 0 || categories.length > 0;
  const controlsDisabled = isSaving || isLoading;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser || isSaving) return;

    try {
      setIsSaving(true);
      const selectedCategory = categories.some((category) => category.id === draft.category) ? draft.category : categories[0]?.id ?? '';
      await bucketListService.create(currentUser.uid, { ...draft, category: selectedCategory });
      setDraft(createEmptyDraft(selectedCategory));
      setIsComposerOpen(false);
      toast.success('버킷리스트가 추가되었습니다.');
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : '추가에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (item: BucketListItem, nextStatus: BucketStatus) => {
    if (!currentUser) return;
    if (item.status === nextStatus) return;
    try {
      await bucketListService.update(currentUser.uid, item.id, { status: nextStatus });
      toast.success(`상태가 '${STATUS_META[nextStatus].label}'로 변경되었습니다.`);
    } catch {
      toast.error('상태 변경에 실패했습니다.');
    }
  };

  const removeItem = async (item: BucketListItem) => {
    if (!currentUser) return;
    const ok = window.confirm(`'${item.title}' 항목을 삭제할까요?`);
    if (!ok) return;

    try {
      await bucketListService.remove(currentUser.uid, item.id);
      toast.success('삭제되었습니다.');
    } catch {
      toast.error('삭제에 실패했습니다.');
    }
  };

  const startEdit = (item: BucketListItem) => {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      note: item.note,
      category: item.category,
      priority: item.priority,
      targetDate: item.targetDate,
    });
  };

  const saveEdit = async (item: BucketListItem) => {
    if (!currentUser) return;
    try {
      await bucketListService.update(currentUser.uid, item.id, editDraft);
      setEditingId(null);
      toast.success('수정되었습니다.');
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : '수정에 실패했습니다.');
    }
  };

  const createCategory = async () => {
    if (!currentUser) return;
    try {
      const categoryId = await bucketListService.createCategory(currentUser.uid, newCategoryName, newCategoryColor);
      setDraft((prev) => ({ ...prev, category: categoryId }));
      setNewCategoryName('');
      setNewCategoryColor(CATEGORY_COLORS[0]);
      toast.success('분류가 추가되었습니다.');
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : '분류 추가에 실패했습니다.');
    }
  };

  const startCategoryEdit = (category: BucketCategoryOption) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.label);
    setEditingCategoryColor(category.color);
  };

  const saveCategoryEdit = async (categoryId: string) => {
    if (!currentUser) return;
    try {
      await bucketListService.updateCategory(currentUser.uid, categoryId, {
        label: editingCategoryName,
        color: editingCategoryColor,
      });
      setEditingCategoryId(null);
      toast.success('분류가 수정되었습니다.');
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : '분류 수정에 실패했습니다.');
    }
  };

  const removeCategory = async (category: BucketCategoryOption) => {
    if (!currentUser) return;
    const inUse = items.some((item) => item.category === category.id);
    if (inUse) {
      toast.error('사용 중인 분류는 삭제할 수 없습니다.');
      return;
    }

    const ok = window.confirm(`'${category.label}' 분류를 삭제할까요?`);
    if (!ok) return;

    try {
      await bucketListService.removeCategory(currentUser.uid, category.id);
      toast.success('분류가 삭제되었습니다.');
    } catch {
      toast.error('분류 삭제에 실패했습니다.');
    }
  };

  const resetItemRecords = async () => {
    if (!currentUser || controlsDisabled) return;

    if (!hasItemRecords) {
      toast.info('초기화할 진행 기록이 없습니다.');
      return;
    }

    const confirmed = await confirmResetAction({
      title: '버킷리스트 진행 기록을 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#b8c4cf;font-size:13px;line-height:1.55;">
          <p style="margin:0;"><strong style="color:#ffe9a6;">분류와 목표 항목은 유지</strong>하고 진행/달성 상태만 계획 상태로 되돌립니다.</p>
          <p style="margin:0;">현재 기록: 진행 ${stats.progress}개 · 달성 ${stats.done}개</p>
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
      await bucketListService.resetItemRecords(currentUser.uid);
      toast.success('진행 기록을 초기화했습니다.');
    } catch {
      toast.error('진행 기록 초기화에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetItems = async () => {
    if (!currentUser || controlsDisabled) return;

    if (items.length === 0) {
      toast.info('초기화할 목표 항목이 없습니다.');
      return;
    }

    const confirmed = await confirmResetAction({
      title: '버킷리스트 목표 항목을 모두 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#b8c4cf;font-size:13px;line-height:1.55;">
          <p style="margin:0;"><strong style="color:#ffe9a6;">분류 ${categories.length}개는 유지</strong>하고 목표 항목 ${items.length}개를 모두 삭제합니다.</p>
          <p style="margin:0;color:#ffb19d;">삭제한 목표 항목과 진행 상태는 복구할 수 없습니다.</p>
        </div>
      `,
      inputText: '항목 초기화',
      confirmButtonText: '항목 초기화',
    });
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await bucketListService.removeAllItems(currentUser.uid);
      setEditingId(null);
      setFilter('all');
      toast.success('목표 항목을 모두 초기화했습니다.');
    } catch {
      toast.error('목표 항목 초기화에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetWorkspace = async () => {
    if (!currentUser || controlsDisabled) return;

    if (!hasWorkspaceData) {
      toast.info('초기화할 버킷리스트 데이터가 없습니다.');
      return;
    }

    const confirmed = await confirmResetAction({
      title: '버킷리스트 데이터를 모두 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#b8c4cf;font-size:13px;line-height:1.55;">
          <p style="margin:0;">이 작업은 <strong style="color:#ffd2c5;">목표 항목 ${items.length}개와 분류 ${categories.length}개</strong>를 모두 비웁니다.</p>
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
      await bucketListService.resetWorkspace(currentUser.uid);
      setDraft(createEmptyDraft());
      setEditDraft(createEmptyDraft());
      setEditingId(null);
      setEditingCategoryId(null);
      setFilter('all');
      setCategoryFilter('all');
      toast.success('버킷리스트 데이터를 초기화했습니다.');
    } catch {
      toast.error('버킷리스트 초기화에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const getCategoryMeta = (categoryId: string): CategoryMeta => {
    const customCategory = categories.find((category) => category.id === categoryId);
    const defaultMeta = CATEGORY_META[categoryId];
    const color = customCategory?.color ?? defaultMeta?.color ?? CATEGORY_COLORS[0];
    return {
      label: customCategory?.label ?? defaultMeta?.label ?? '분류 없음',
      color: strengthenCategoryColor(color),
      icon: defaultMeta?.icon ?? Sparkles,
    };
  };

  const activeCategoryMeta = categoryFilter === 'all' ? null : getCategoryMeta(categoryFilter);
  const boardHint = categoryFilter === 'all'
    ? filter === 'all'
      ? '전체 목표를 분류와 상태로 빠르게 훑어봅니다.'
      : STATUS_META[filter].hint
    : `${activeCategoryMeta?.label ?? '선택한 분류'} 목표만 보고 있습니다.`;

  if (authLoading) {
    return (
      <CenteredPanel>
        <Loader2 className="spin" size={24} />
        <span>버킷리스트를 준비하는 중입니다.</span>
      </CenteredPanel>
    );
  }

  if (!currentUser) {
    return (
      <Gate>
        <GateVisual>
          <Map size={54} />
          <span />
        </GateVisual>
        <h1>나만의 버킷리스트를 시작하세요</h1>
        <p>로그인하면 Cloud Firestore에 목표가 저장되고, 모바일 앱과 웹에서 같은 목록을 이어서 볼 수 있습니다.</p>
        <GateButton type="button" disabled={!isConfigured} onClick={() => void loginWithGoogle()}>
          <LogIn size={18} />
          Google로 시작하기
        </GateButton>
      </Gate>
    );
  }

  return (
    <Shell>
      <Hero>
        <HeroCopy>
          <Eyebrow>
            <Target size={15} />
            Life Atlas
          </Eyebrow>
          <h1>하고 싶은 일을 흘려보내지 않는 버킷리스트</h1>
          <p>목표를 작게 기록하고, 진행 중인 항목을 앞으로 당기며, 달성한 순간을 한 화면에 남깁니다.</p>
          <HeroActions>
            <ManageToggleButton
              type="button"
              $active={isManageOpen}
              onClick={() => setIsManageOpen((prev) => !prev)}
              aria-expanded={isManageOpen}
              aria-controls="bucket-management-panel"
            >
              <Settings2 size={16} />
              관리
            </ManageToggleButton>
          </HeroActions>
        </HeroCopy>
        <ProgressPanel>
          <ProgressHeader>
            <span>달성률</span>
            <strong>{stats.progressRate}%</strong>
          </ProgressHeader>
          <ProgressTrack aria-label={`달성률 ${stats.progressRate}%`}>
            <ProgressFill $value={stats.progressRate} />
          </ProgressTrack>
          <StatGrid>
            <StatItem>
              <strong>{items.length}</strong>
              <span>전체</span>
            </StatItem>
            <StatItem>
              <strong>{stats.progress}</strong>
              <span>진행</span>
            </StatItem>
            <StatItem>
              <strong>{stats.done}</strong>
              <span>달성</span>
            </StatItem>
            <StatItem>
              <strong>{stats.planned}</strong>
              <span>계획</span>
            </StatItem>
          </StatGrid>
        </ProgressPanel>
      </Hero>

      {isManageOpen ? (
        <ManagementPanel id="bucket-management-panel" aria-label="버킷리스트 관리">
          <CategoryManager>
            <CategoryManagerHeader>
              <FieldLabel>분류 관리</FieldLabel>
              <span>분류 {categories.length}개</span>
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
                aria-label="분류 색상"
              />
              <SmallButton type="button" onClick={() => void createCategory()} disabled={!newCategoryName.trim() || controlsDisabled}>
                추가
              </SmallButton>
            </CategoryCreateRow>
            <CategoryList>
              {categories.length === 0 ? (
                <CategoryEmpty>분류를 추가하면 목표를 등록할 수 있습니다.</CategoryEmpty>
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
                        <IconButton type="button" onClick={() => setEditingCategoryId(null)} title="취소" disabled={controlsDisabled}>
                          <X size={15} />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <CategoryDot $color={category.color} />
                        <CategoryName>{category.label}</CategoryName>
                        <IconButton type="button" onClick={() => startCategoryEdit(category)} title="분류 수정" disabled={controlsDisabled}>
                          <Edit3 size={15} />
                        </IconButton>
                        <IconButton type="button" onClick={() => void removeCategory(category)} title="분류 삭제" disabled={controlsDisabled}>
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
                버킷리스트 초기화
              </strong>
              <span>
                진행 기록만 되돌리거나, 목표 항목 {items.length}개와 분류 {categories.length}개까지 초기화할 수 있습니다.
              </span>
            </div>
            <DangerResetActions>
              <ResetActionButton type="button" $tone="warm" onClick={() => void resetItemRecords()} disabled={controlsDisabled || !hasItemRecords}>
                <CalendarDays size={16} />
                기록만 초기화
              </ResetActionButton>
              <ResetActionButton type="button" $tone="danger" onClick={() => void resetItems()} disabled={controlsDisabled || items.length === 0}>
                <Trash2 size={16} />
                항목 초기화
              </ResetActionButton>
              <ResetActionButton type="button" $tone="danger" onClick={() => void resetWorkspace()} disabled={controlsDisabled || !hasWorkspaceData}>
                <RefreshCcw size={16} />
                전체 초기화
              </ResetActionButton>
            </DangerResetActions>
          </DangerResetPanel>
        </ManagementPanel>
      ) : null}

      <Content>
        <Composer onSubmit={handleCreate} $open={isComposerOpen}>
          <ComposerTop>
            <div>
              <h2>새 목표</h2>
              <p>짧게 적어도 충분합니다. 날짜와 상태는 나중에 바꿀 수 있습니다.</p>
            </div>
            <ComposerActions>
              <MobileComposerToggle
                type="button"
                aria-controls="bucket-composer-body"
                aria-expanded={isComposerOpen}
                onClick={() => setIsComposerOpen((prev) => !prev)}
              >
                {isComposerOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <span>{isComposerOpen ? '접기' : '열기'}</span>
              </MobileComposerToggle>
              <SubmitButton type="submit" $formOpen={isComposerOpen} disabled={isSaving || !draft.title.trim() || categories.length === 0} title="추가">
                <ButtonIcon>{isSaving ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}</ButtonIcon>
                <span>추가</span>
              </SubmitButton>
            </ComposerActions>
          </ComposerTop>
          <ComposerBody id="bucket-composer-body" $open={isComposerOpen}>
            <TitleInput
              name="bucket-title"
              aria-label="새 목표 제목"
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="예: 아이슬란드 오로라 보기"
              maxLength={70}
            />
            <NoteInput
              name="bucket-note"
              aria-label="새 목표 메모"
              value={draft.note}
              onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="왜 하고 싶은지, 첫 행동은 무엇인지 기록하세요."
              rows={3}
              maxLength={180}
            />
            <FieldGroup>
              <FieldLabel>분류</FieldLabel>
              {categories.length === 0 ? (
                <CategoryEmpty>분류를 먼저 추가하세요.</CategoryEmpty>
              ) : (
                <CategoryChoiceGrid aria-label="새 목표 분류 선택">
                  {categories.map((category) => {
                    const categoryMeta = getCategoryMeta(category.id);
                    const CategoryIcon = categoryMeta.icon;
                    const isSelected = draft.category === category.id;

                    return (
                      <CategoryChoiceButton
                        key={category.id}
                        type="button"
                        $active={isSelected}
                        $accent={categoryMeta.color}
                        aria-pressed={isSelected}
                        onClick={() => setDraft((prev) => ({ ...prev, category: category.id }))}
                      >
                        <CategoryIcon size={16} />
                        <span>{category.label}</span>
                      </CategoryChoiceButton>
                    );
                  })}
                </CategoryChoiceGrid>
              )}
            </FieldGroup>

            <FieldRow>
              <FieldGroup>
                <FieldLabel>목표일</FieldLabel>
                <DateInput
                  name="bucket-target-date"
                  aria-label="새 목표 목표일"
                  type="date"
                  value={draft.targetDate}
                  onChange={(event) => setDraft((prev) => ({ ...prev, targetDate: event.target.value }))}
                />
                <DateHint>{getDDayInfo(draft.targetDate, 'planned').label}</DateHint>
              </FieldGroup>
            </FieldRow>
          </ComposerBody>

        </Composer>

        <Board>
          <BoardToolbar>
            <div>
              <h2>{activeCategoryMeta ? `${activeCategoryMeta.label} 목표` : '목록'}</h2>
              <p>{boardHint}</p>
            </div>
            <FilterRail>
              {FILTERS.map((item) => (
                <FilterButton
                  key={item.key}
                  type="button"
                  $active={filter === item.key}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                </FilterButton>
              ))}
            </FilterRail>
          </BoardToolbar>

          <CategoryFilterSection>
            <CategoryFilterHeader>
              <span>분류별 보기</span>
              <strong>{filteredItems.length}개 표시</strong>
            </CategoryFilterHeader>
            <CategoryFilterRail aria-label="분류 필터">
              <CategoryFilterButton
                type="button"
                $active={categoryFilter === 'all'}
                $accent="#facc15"
                aria-pressed={categoryFilter === 'all'}
                onClick={() => setCategoryFilter('all')}
              >
                <span>전체</span>
                <strong>{statusFilteredItems.length}</strong>
              </CategoryFilterButton>
              {categories.map((category) => {
                const isActive = categoryFilter === category.id;
                const categoryMeta = getCategoryMeta(category.id);

                return (
                  <CategoryFilterButton
                    key={category.id}
                    type="button"
                    $active={isActive}
                    $accent={categoryMeta.color}
                    aria-pressed={isActive}
                    onClick={() => setCategoryFilter(category.id)}
                  >
                    <CategoryDot $color={categoryMeta.color} />
                    <span>{category.label}</span>
                    <strong>{categoryCounts[category.id] ?? 0}</strong>
                  </CategoryFilterButton>
                );
              })}
            </CategoryFilterRail>
          </CategoryFilterSection>

          {isLoading ? (
            <EmptyState>
              <Loader2 className="spin" size={24} />
              <strong>Firestore에서 목록을 불러오는 중입니다.</strong>
            </EmptyState>
          ) : error ? (
            <EmptyState>
              <Flag size={26} />
              <strong>데이터를 불러오지 못했습니다.</strong>
              <span>{error}</span>
            </EmptyState>
          ) : filteredItems.length === 0 ? (
            <EmptyState>
              <Compass size={28} />
              <strong>아직 표시할 항목이 없습니다.</strong>
              <span>{categoryFilter === 'all' ? '왼쪽 입력 영역에서 첫 번째 목표를 추가해 보세요.' : '다른 분류를 보거나 새 목표의 분류를 바꿔 추가해 보세요.'}</span>
            </EmptyState>
          ) : (
            <CardGrid>
              {filteredItems.map((item) => {
                const category = getCategoryMeta(item.category);
                const CategoryIcon = category.icon;
                const StatusIcon = STATUS_META[item.status].icon;
                const isEditing = editingId === item.id;
                const dDayInfo = getDDayInfo(item.targetDate, item.status);

                return (
                  <BucketCard key={item.id} $status={item.status} $accent={category.color}>
                    <CategoryBand $accent={category.color}>
                      <span>
                        <CategoryIcon size={15} />
                        {category.label}
                      </span>
                    </CategoryBand>

                    {isEditing ? (
                      <EditForm>
                        <TitleInput
                          value={editDraft.title}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, title: event.target.value }))}
                          maxLength={70}
                        />
                        <NoteInput
                          value={editDraft.note}
                          onChange={(event) => setEditDraft((prev) => ({ ...prev, note: event.target.value }))}
                          rows={3}
                          maxLength={180}
                        />
                        <FieldRow>
                          <FieldGroup>
                            <FieldLabel>분류</FieldLabel>
                            <Select
                              value={editDraft.category}
                              onChange={(event) => setEditDraft((prev) => ({ ...prev, category: event.target.value as BucketCategory }))}
                            >
                              {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.label}
                                </option>
                              ))}
                            </Select>
                          </FieldGroup>
                          <FieldGroup>
                            <FieldLabel>목표일</FieldLabel>
                            <DateInput
                              type="date"
                              value={editDraft.targetDate}
                              onChange={(event) => setEditDraft((prev) => ({ ...prev, targetDate: event.target.value }))}
                            />
                            <DateHint>{getDDayInfo(editDraft.targetDate, item.status).label}</DateHint>
                          </FieldGroup>
                        </FieldRow>
                      </EditForm>
                    ) : (
                      <>
                        <h3>{item.title}</h3>
                        <p>{item.note || '메모가 없습니다. 수정 버튼으로 이유와 첫 행동을 남겨보세요.'}</p>
                      </>
                    )}

                    <CardMeta>
                      <DateMeta>
                        <MetaText>
                          <CalendarDays size={15} />
                          {formatDate(item.targetDate)}
                        </MetaText>
                        <DDayBadge $tone={dDayInfo.tone} aria-label={dDayInfo.ariaLabel}>
                          {dDayInfo.label}
                        </DDayBadge>
                      </DateMeta>
                      <StatusChip $status={item.status} htmlFor={`bucket-status-${item.id}`}>
                        <StatusIcon size={14} />
                        <StatusSelect
                          id={`bucket-status-${item.id}`}
                          value={item.status}
                          aria-label={`${item.title} 상태 변경`}
                          onChange={(event) => void updateStatus(item, event.target.value as BucketStatus)}
                        >
                          {FILTERS.filter((status) => status.key !== 'all').map((status) => (
                            <option key={status.key} value={status.key}>
                              {status.label}
                            </option>
                          ))}
                        </StatusSelect>
                      </StatusChip>
                    </CardMeta>

                    <CardActions>
                      {isEditing ? (
                        <>
                          <TextAction type="button" onClick={() => void saveEdit(item)}>
                            저장
                          </TextAction>
                          <IconButton type="button" onClick={() => setEditingId(null)} title="취소">
                            <X size={16} />
                          </IconButton>
                        </>
                      ) : (
                        <IconButton type="button" onClick={() => startEdit(item)} title="수정">
                          <Edit3 size={16} />
                        </IconButton>
                      )}
                      <IconButton type="button" onClick={() => void removeItem(item)} title="삭제">
                        <Trash2 size={16} />
                      </IconButton>
                    </CardActions>
                  </BucketCard>
                );
              })}
            </CardGrid>
          )}
        </Board>
      </Content>
    </Shell>
  );
}

const Shell = styled.main`
  height: 100%;
  min-height: 0;
  overflow: auto;
  background: #09100f;
  background-attachment: fixed;
  color: var(--text-main);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-bg);
    color: var(--text-main);
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 430px);
  align-items: end;
  gap: 22px;
  padding: 30px 32px 22px;
  animation: riseIn 0.62s cubic-bezier(0.2, 0.8, 0.2, 1) both;

  @keyframes riseIn {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    padding: 20px 16px 14px;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;

  h1 {
    max-width: 780px;
    margin: 10px 0;
    color: var(--text-bright);
    font-size: clamp(2rem, 3.6vw, 3.85rem);
    line-height: 1.04;
    letter-spacing: 0;
    text-wrap: balance;
  }

  body[data-propig-design='codeit'] & h1 {
    color: var(--codeit-text);
    font-size: clamp(2.25rem, 4.6vw, 4.35rem);
  }

  p {
    max-width: 640px;
    margin: 0;
    color: rgba(230, 237, 243, 0.76);
    font-size: 1rem;
    line-height: 1.7;
  }

  body[data-propig-design='codeit'] & p {
    color: var(--codeit-muted);
  }
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
`;

const ManageToggleButton = styled.button<{ $active: boolean }>`
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(250, 204, 21, 0.56)' : 'rgba(250, 204, 21, 0.24)')};
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'rgba(250, 204, 21, 0.2)' : 'rgba(250, 204, 21, 0.1)')};
  color: #fef3c7;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(250, 204, 21, 0.62);
    background: rgba(250, 204, 21, 0.18);
  }

  &:focus-visible {
    outline: 3px solid rgba(250, 204, 21, 0.24);
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

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #facc15;
  font-size: 0.82rem;
  font-weight: 900;
  text-transform: uppercase;

  body[data-propig-design='codeit'] & {
    color: var(--codeit-primary);
  }
`;

const ProgressPanel = styled.aside`
  position: relative;
  align-self: end;
  overflow: hidden;
  padding: 20px;
  border: 1px solid rgba(255, 226, 157, 0.17);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
    backdrop-filter: none;
  }
`;

const ProgressHeader = styled.div`
  position: relative;
  display: flex;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 12px;

  span {
    color: var(--text-muted);
    font-size: 0.88rem;
  }

  strong {
    color: var(--text-bright);
    font-size: 2.5rem;
    line-height: 0.9;
  }
`;

const ProgressTrack = styled.div`
  position: relative;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary-soft);
  }
`;

const ProgressFill = styled.div<{ $value: number }>`
  width: ${({ $value }) => $value}%;
  height: 100%;
  border-radius: inherit;
  background: #22c55e;
  box-shadow: 0 0 18px rgba(34, 197, 94, 0.34);
  transition: width 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary);
    box-shadow: none;
    animation: none;
  }
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 16px;
`;

const StatItem = styled.div`
  min-width: 0;
  padding: 12px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
  text-align: center;

  strong,
  span {
    display: block;
  }

  strong {
    color: var(--text-bright);
    font-size: 1.2rem;
  }

  span {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface-soft);
    border-color: var(--codeit-border);
  }

  body[data-propig-design='codeit'] & strong {
    color: var(--codeit-text);
  }

  body[data-propig-design='codeit'] & span {
    color: var(--codeit-muted);
  }
`;

const Content = styled.section`
  display: grid;
  grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
  gap: 18px;
  padding: 0 32px 32px;
  animation: contentIn 0.7s 0.08s cubic-bezier(0.2, 0.8, 0.2, 1) both;

  @keyframes contentIn {
    from {
      opacity: 0;
      transform: translateY(22px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 1020px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 720px) {
    padding: 0 12px 20px;
  }
`;

const surfaceStyles = css`
  border: 1px solid rgba(255, 226, 157, 0.14);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: 0 22px 54px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.055);
  backdrop-filter: blur(16px);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
    backdrop-filter: none;
  }
`;

const ManagementPanel = styled.section`
  ${surfaceStyles}
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

const Composer = styled.form<{ $open: boolean }>`
  ${surfaceStyles}
  align-self: start;
  position: sticky;
  top: 16px;
  padding: 20px;

  @media (max-width: 1020px) {
    position: static;
  }

  @media (max-width: 720px) {
    padding: ${({ $open }) => ($open ? '16px' : '14px')};
  }
`;

const ComposerTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--text-bright);
    font-size: 1.05rem;
  }

  p {
    margin-top: 5px;
    color: var(--text-muted);
    font-size: 0.84rem;
    line-height: 1.45;
  }

  @media (max-width: 520px) {
    align-items: stretch;
  }
`;

const ComposerActions = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;

  @media (max-width: 520px) {
    justify-content: space-between;
  }
`;

const MobileComposerToggle = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(250, 204, 21, 0.28);
  border-radius: 8px;
  background: rgba(250, 204, 21, 0.1);
  color: #fef3c7;
  font-weight: 950;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid rgba(250, 204, 21, 0.24);
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
  @media (max-width: 720px) {
    display: ${({ $open }) => ($open ? 'block' : 'none')};
  }
`;

const inputStyles = css`
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(4, 10, 17, 0.72);
  color: #f8fafc;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;

  &:hover {
    border-color: rgba(250, 204, 21, 0.32);
    background: rgba(8, 15, 24, 0.86);
  }

  &:focus {
    border-color: rgba(250, 204, 21, 0.62);
    box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.12);
    background: rgba(9, 17, 27, 0.95);
  }

  &::placeholder {
    color: rgba(180, 190, 205, 0.68);
  }

  body[data-propig-design='codeit'] & {
    background: #ffffff;
    border-color: var(--codeit-border-strong);
    color: var(--codeit-text);
    color-scheme: light;
  }

  body[data-propig-design='codeit'] &:hover {
    border-color: var(--codeit-primary-border);
    background: #ffffff;
  }

  body[data-propig-design='codeit'] &:focus {
    border-color: var(--codeit-primary);
    box-shadow: 0 0 0 3px rgba(52, 81, 209, 0.11);
    background: #ffffff;
  }
`;

const TitleInput = styled.input`
  ${inputStyles}
  height: 48px;
  padding: 0 14px;
  font-size: 0.96rem;
`;

const NoteInput = styled.textarea`
  ${inputStyles}
  resize: vertical;
  min-height: 92px;
  margin-top: 10px;
  padding: 12px 14px;
  line-height: 1.5;
`;

const FieldRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-top: 14px;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const FieldGroup = styled.div`
  display: grid;
  min-width: 0;
  gap: 6px;
`;

const FieldLabel = styled.span`
  color: rgba(226, 232, 240, 0.82);
  font-size: 0.74rem;
  font-weight: 900;

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

const CategoryChoiceButton = styled.button<{ $active: boolean; $accent: string }>`
  min-width: 0;
  min-height: 42px;
  padding: 0 11px;
  border: 1px solid ${({ $active, $accent }) => ($active ? `${$accent}8f` : 'rgba(255, 255, 255, 0.12)')};
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  background: ${({ $active, $accent }) => ($active ? `${$accent}24` : 'rgba(4, 10, 17, 0.56)')};
  color: ${({ $active, $accent }) => ($active ? '#fffdf5' : `${$accent}`)};
  font-size: 0.82rem;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  svg {
    flex: 0 0 auto;
  }

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ $accent }) => `${$accent}80`};
    background: ${({ $accent }) => `${$accent}1f`};
    color: #fffdf5;
  }

  &:focus-visible {
    outline: 3px solid ${({ $accent }) => `${$accent}3d`};
    outline-offset: 2px;
  }

  body[data-propig-design='codeit'] & {
    border-color: ${({ $active, $accent }) => ($active ? `${$accent}70` : 'var(--codeit-border)')};
    background: ${({ $active, $accent }) => ($active ? `${$accent}18` : '#ffffff')};
    color: var(--codeit-text);
  }

  body[data-propig-design='codeit'] &:hover {
    background: ${({ $accent }) => `${$accent}15`};
    color: var(--codeit-text);
  }
`;

const Select = styled.select`
  ${inputStyles}
  height: 44px;
  padding: 0 34px 0 12px;
  color: #f8fafc;
  color-scheme: dark;
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, #e2e8f0 50%),
    linear-gradient(135deg, #e2e8f0 50%, transparent 50%);
  background-position:
    calc(100% - 17px) 18px,
    calc(100% - 11px) 18px;
  background-size:
    6px 6px,
    6px 6px;
  background-repeat: no-repeat;

  option {
    background: #101820;
    color: #f8fafc;
  }

  body[data-propig-design='codeit'] & {
    color: var(--codeit-text);
    color-scheme: light;
    appearance: auto;
    background-image: none;
    padding-right: 12px;
  }

  body[data-propig-design='codeit'] & option {
    background: #ffffff;
    color: var(--codeit-text);
  }
`;

const DateInput = styled.input`
  ${inputStyles}
  height: 44px;
  padding: 0 12px;
  color-scheme: dark;

  &::-webkit-calendar-picker-indicator {
    cursor: pointer;
    filter: invert(1) sepia(0.4) saturate(1.4);
    opacity: 0.78;
  }

  body[data-propig-design='codeit'] & {
    color-scheme: light;
  }

  body[data-propig-design='codeit'] &::-webkit-calendar-picker-indicator {
    filter: none;
  }
`;

const DateHint = styled.span`
  min-height: 18px;
  color: #facc15;
  font-size: 0.76rem;
  font-weight: 900;

  body[data-propig-design='codeit'] & {
    color: #8a5a00;
  }
`;

const CategoryManager = styled.div`
  margin-top: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  margin-bottom: 10px;

  span:last-child {
    color: rgba(203, 213, 225, 0.58);
    font-size: 0.72rem;
    white-space: nowrap;
  }

  body[data-propig-design='codeit'] & span:last-child {
    color: var(--codeit-faint);
  }
`;

const CategoryCreateRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px 58px;
  gap: 8px;
`;

const CategoryList = styled.div`
  display: grid;
  gap: 7px;
  margin-top: 10px;
  max-height: 152px;
  overflow: auto;
`;

const CategoryRow = styled.div<{ $editing?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $editing }) => ($editing ? 'minmax(0, 1fr) 42px 58px 34px' : '14px minmax(0, 1fr) auto auto')};
  align-items: center;
  gap: 8px;
  min-height: 34px;

  @media (max-width: 520px) {
    grid-template-columns: ${({ $editing }) => ($editing ? 'minmax(0, 1fr) 42px' : '14px minmax(0, 1fr) auto auto')};

    & > button:first-of-type {
      grid-column: ${({ $editing }) => ($editing ? '1 / -1' : 'auto')};
    }
  }
`;

const CategoryEmpty = styled.div`
  padding: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  color: rgba(203, 213, 225, 0.72);
  font-size: 0.8rem;
  text-align: center;

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-border);
    color: var(--codeit-muted);
  }
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
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
  transition: transform 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    background: #ffffff;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.24);
  }

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
  background: rgba(127, 29, 29, 0.2);

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

const SubmitButton = styled.button<{ $formOpen?: boolean }>`
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-width: 118px;
  height: 44px;
  padding: 0 16px 0 10px;
  border: 1px solid rgba(34, 197, 94, 0.72);
  border-radius: 8px;
  background: #22c55e;
  color: #04120a;
  font-weight: 950;
  cursor: pointer;
  overflow: hidden;
  box-shadow: 0 12px 28px rgba(34, 197, 94, 0.22);
  transition:
    transform 0.22s ease,
    opacity 0.2s ease,
    box-shadow 0.22s ease;

  &:hover {
    transform: translateY(-2px);
    background: #34d399;
    box-shadow: 0 18px 38px rgba(34, 197, 94, 0.24);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.48;
    transform: none;
    box-shadow: none;
  }

  span {
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    display: ${({ $formOpen }) => ($formOpen ? 'inline-flex' : 'none')};
  }

  body[data-propig-design='codeit'] & {
    border-color: transparent;
    background: var(--codeit-primary);
    color: #ffffff;
    box-shadow: 0 12px 28px rgba(52, 81, 209, 0.18);
  }

  body[data-propig-design='codeit'] &:hover {
    background: var(--codeit-primary-hover);
    box-shadow: 0 18px 38px rgba(52, 81, 209, 0.2);
  }
`;

const ButtonIcon = styled.span`
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(4, 18, 10, 0.12);
`;

const Board = styled.div`
  ${surfaceStyles}
  min-width: 0;
  padding: 18px;
`;

const BoardToolbar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--text-bright);
    font-size: 1.05rem;
  }

  p {
    margin-top: 5px;
    color: var(--text-muted);
    font-size: 0.84rem;
  }

  @media (max-width: 720px) {
    flex-direction: column;
  }
`;

const CategoryFilterSection = styled.div`
  margin-bottom: 16px;
`;

const CategoryFilterHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;

  span {
    color: rgba(226, 232, 240, 0.82);
    font-size: 0.76rem;
    font-weight: 950;
  }

  strong {
    color: rgba(203, 213, 225, 0.62);
    font-size: 0.74rem;
    font-weight: 900;
  }

  body[data-propig-design='codeit'] & span {
    color: var(--codeit-text);
  }

  body[data-propig-design='codeit'] & strong {
    color: var(--codeit-muted);
  }
`;

const CategoryFilterRail = styled.div`
  display: flex;
  gap: 8px;
  padding: 2px 1px 5px;
  overflow-x: auto;
`;

const CategoryFilterButton = styled.button<{ $active: boolean; $accent: string }>`
  flex: 0 0 auto;
  min-height: 36px;
  max-width: 190px;
  padding: 0 10px;
  border: 1px solid ${({ $active, $accent }) => ($active ? `${$accent}8a` : 'rgba(255, 255, 255, 0.12)')};
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: ${({ $active, $accent }) => ($active ? `${$accent}22` : 'rgba(255, 255, 255, 0.035)')};
  color: ${({ $active }) => ($active ? '#fffdf5' : 'rgba(203, 213, 225, 0.76)')};
  font-size: 0.78rem;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  span {
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
    background: rgba(3, 7, 18, 0.38);
    color: ${({ $accent }) => $accent};
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ $accent }) => `${$accent}80`};
    color: #fffdf5;
  }

  &:focus-visible {
    outline: 3px solid ${({ $accent }) => `${$accent}38`};
    outline-offset: 2px;
  }

  body[data-propig-design='codeit'] & {
    border-color: ${({ $active, $accent }) => ($active ? `${$accent}70` : 'var(--codeit-border)')};
    background: ${({ $active, $accent }) => ($active ? `${$accent}18` : '#ffffff')};
    color: ${({ $active }) => ($active ? 'var(--codeit-text)' : 'var(--codeit-muted)')};
  }

  body[data-propig-design='codeit'] & strong {
    background: var(--codeit-surface-soft);
  }

  body[data-propig-design='codeit'] &:hover {
    color: var(--codeit-text);
  }
`;

const FilterRail = styled.div`
  display: flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-border);
    background: var(--codeit-surface-soft);
  }

  @media (max-width: 720px) {
    width: 100%;
    overflow-x: auto;
  }
`;

const FilterButton = styled.button<{ $active: boolean }>`
  min-width: 58px;
  height: 34px;
  border: 0;
  border-radius: 7px;
  background: ${({ $active }) => ($active ? 'rgba(250, 204, 21, 0.18)' : 'transparent')};
  color: ${({ $active }) => ($active ? '#fef3c7' : 'rgba(203, 213, 225, 0.74)')};
  font-weight: 900;
  cursor: pointer;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    color: #f8fafc;
  }

  body[data-propig-design='codeit'] & {
    background: ${({ $active }) => ($active ? 'var(--codeit-primary)' : 'transparent')};
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-muted)')};
  }

  body[data-propig-design='codeit'] &:hover {
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-text)')};
    background: ${({ $active }) => ($active ? 'var(--codeit-primary-hover)' : 'var(--codeit-primary-soft)')};
  }
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const BucketCard = styled.article<{ $status: BucketStatus; $accent: string }>`
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 238px;
  padding: 16px;
  border: 1px solid ${({ $accent }) => `${$accent}48`};
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.052);
  opacity: ${({ $status }) => ($status === 'done' ? 0.78 : 1)};
  overflow: hidden;
  transform: translateY(0);
  animation: cardIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  transition:
    transform 0.22s ease,
    border-color 0.22s ease,
    background-color 0.22s ease,
    box-shadow 0.22s ease;

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    border-color: var(--codeit-border);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-sm);
  }

  &:hover {
    transform: translateY(-4px);
    border-color: ${({ $accent }) => `${$accent}88`};
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
  }

  body[data-propig-design='codeit'] &:hover {
    border-color: ${({ $accent }) => `${$accent}55`};
    box-shadow: var(--codeit-shadow-md);
  }

  h3 {
    position: relative;
    margin: 0 0 8px;
    color: var(--text-bright);
    font-size: 1.12rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  body[data-propig-design='codeit'] & h3 {
    color: var(--codeit-text);
  }

  p {
    position: relative;
    margin: 0;
    color: rgba(230, 237, 243, 0.7);
    font-size: 0.9rem;
    line-height: 1.58;
    overflow-wrap: anywhere;
  }

  body[data-propig-design='codeit'] & p {
    color: var(--codeit-muted);
  }

  @keyframes cardIn {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.985);
    }
    to {
      opacity: ${({ $status }) => ($status === 'done' ? 0.78 : 1)};
      transform: translateY(0) scale(1);
    }
  }
`;

const CategoryBand = styled.div<{ $accent: string }>`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 42px;
  margin: -16px -16px 16px;
  padding: 0 16px;
  background: ${({ $accent }) => $accent};
  color: #ffffff;
  box-shadow: inset 0 -1px 0 rgba(2, 6, 23, 0.24);

  span {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.84rem;
    font-weight: 950;
    text-shadow: 0 1px 1px rgba(2, 6, 23, 0.28);
  }

  svg {
    flex: 0 0 auto;
  }
`;

const CardMeta = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
`;

const MetaText = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-muted);
  font-size: 0.82rem;
`;

const DateMeta = styled.div`
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  min-width: 0;
`;

const DDayBadge = styled.span<{ $tone: DDayTone }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid
    ${({ $tone }) =>
      $tone === 'today'
        ? 'rgba(250, 204, 21, 0.58)'
        : $tone === 'overdue'
          ? 'rgba(251, 113, 133, 0.52)'
          : $tone === 'done'
            ? 'rgba(52, 211, 153, 0.42)'
            : $tone === 'upcoming'
              ? 'rgba(56, 189, 248, 0.42)'
              : 'rgba(255, 255, 255, 0.12)'};
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === 'today'
      ? 'rgba(250, 204, 21, 0.18)'
      : $tone === 'overdue'
        ? 'rgba(251, 113, 133, 0.15)'
        : $tone === 'done'
          ? 'rgba(52, 211, 153, 0.14)'
          : $tone === 'upcoming'
            ? 'rgba(56, 189, 248, 0.14)'
            : 'rgba(255, 255, 255, 0.06)'};
  color:
    ${({ $tone }) =>
      $tone === 'today'
        ? '#fef3c7'
        : $tone === 'overdue'
          ? '#fda4af'
          : $tone === 'done'
            ? '#86efac'
            : $tone === 'upcoming'
              ? '#7dd3fc'
              : 'rgba(203, 213, 225, 0.72)'};
  font-size: 0.8rem;
  font-weight: 950;
  white-space: nowrap;
`;

const StatusChip = styled.label<{ $status: BucketStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 5px 0 9px;
  border-radius: 999px;
  background: ${({ $status }) =>
    $status === 'done' ? 'rgba(52, 211, 153, 0.16)' : $status === 'progress' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.09)'};
  color: ${({ $status }) => ($status === 'done' ? '#86efac' : $status === 'progress' ? '#7dd3fc' : 'var(--text-muted)')};
  font-size: 0.8rem;
  font-weight: 900;
`;

const StatusSelect = styled.select`
  min-width: 58px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  outline: none;
  color-scheme: dark;

  option {
    background: #101820;
    color: #f8fafc;
  }
`;

const CardActions = styled.div`
  position: relative;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 14px;
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(226, 232, 240, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.72);
  color: rgba(226, 232, 240, 0.9);
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  transition:
    transform 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(34, 197, 94, 0.42);
    background: rgba(34, 197, 94, 0.14);
    color: #ffffff;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }
`;

const TextAction = styled.button`
  height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(52, 211, 153, 0.35);
  border-radius: 8px;
  background: rgba(52, 211, 153, 0.14);
  color: #a7f3d0;
  font-weight: 900;
  cursor: pointer;
`;

const EditForm = styled.div`
  position: relative;
  margin-top: 12px;
`;

const EmptyState = styled.div`
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 26px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: var(--text-muted);
  text-align: center;

  strong {
    color: var(--text-main);
  }
`;

const CenteredPanel = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--bg-base);
  color: var(--text-muted);

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
  background: var(--bg-base);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface);
    color: var(--codeit-muted);
    border-radius: var(--codeit-radius);
    box-shadow: var(--codeit-shadow-md);
  }

  h1 {
    margin: 8px 0 0;
    max-width: 620px;
    color: var(--text-bright);
    font-size: clamp(1.8rem, 6vw, 3.2rem);
    line-height: 1.16;
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
  background: rgba(52, 211, 153, 0.18);
  color: #facc15;
  animation: floatBadge 3.8s ease-in-out infinite;

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

  @keyframes floatBadge {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-7px);
    }
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
  background: var(--text-bright);
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
