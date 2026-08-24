'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  FolderKanban,
  History,
  ImagePlus,
  LoaderCircle,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import styled from 'styled-components';
import { getEmoticonJobHistoryStatusLabel } from '@/lib/emoticonJobHealth';
import type { EmoticonJob } from '@/schemas/emoticonStudio';
import {
  deleteEmoticonJobSafely,
  EMOTICON_JOB_HISTORY_PAGE_SIZE,
  listEmoticonJobHistoryPage,
  type EmoticonJobHistoryCursor,
} from '@/services/emoticonJobHistoryService';

type HistoryFilter = 'all' | 'working' | 'completed' | 'attention';

type EmoticonJobHistoryPanelProps = {
  userId: string;
  activeJobId: string | null;
  onClose: () => void;
  onSelect: (jobId: string) => void;
  onDeleted: (jobId: string) => void;
};

const WORKING_STATUSES = new Set<EmoticonJob['status']>([
  'queued',
  'analyzing',
  'generating',
  'validating',
  'animating',
  'rendering',
]);

const MODE_LABELS: Partial<Record<EmoticonJob['mode'], string>> = {
  generate: '일반 생성',
  plan: '구성 기획',
  profile: '캐릭터 분석',
  sheet_plan: '시트 기획',
  import_frames: '프레임 가져오기',
  rerender: '다시 렌더링',
  repair_frame: '프레임 교체',
};

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1750;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding:
    max(18px, env(safe-area-inset-top))
    max(18px, env(safe-area-inset-right))
    max(18px, env(safe-area-inset-bottom))
    max(18px, env(safe-area-inset-left));
  background: rgb(3 5 11 / 78%);
  backdrop-filter: blur(8px);

  @media (max-width: 680px) {
    padding: 0;
  }
`;

const Panel = styled.section`
  position: relative;
  width: min(1040px, 100%);
  height: min(820px, 100%);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 22px;
  color: #eef0f7;
  background: #11131a;
  box-shadow: 0 28px 100px rgb(0 0 0 / 48%);

  button { touch-action: manipulation; }

  &:focus-visible {
    outline: 3px solid rgb(124 92 255 / 48%);
    outline-offset: 3px;
  }

  @media (max-width: 680px) {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 0;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px 16px;
  border-bottom: 1px solid rgb(255 255 255 / 7%);

  > div { min-width: 0; }
  h2 { margin: 0; font-size: 1.08rem; line-height: 1.35; }
  p { margin: 6px 0 0; color: #8f96a6; font-size: .76rem; line-height: 1.55; }

  > button {
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid rgb(255 255 255 / 8%);
    border-radius: 12px;
    color: #aeb4c2;
    background: rgb(255 255 255 / 3%);
    cursor: pointer;
  }
  > button:hover:not(:disabled) { color: #fff; background: rgb(255 255 255 / 7%); }
  > button:focus-visible { outline: 2px solid #8c78ff; outline-offset: 2px; }
  > button:disabled { cursor: wait; opacity: .5; }

  @media (max-width: 680px) {
    padding:
      max(16px, env(safe-area-inset-top))
      16px
      14px;
  }
`;

const Controls = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 14px;
  padding: 14px 24px;
  border-bottom: 1px solid rgb(255 255 255 / 7%);
  background: rgb(255 255 255 / 1.5%);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    padding: 12px 16px;
  }
`;

const SearchBox = styled.label`
  min-width: 0;
  height: 44px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  box-sizing: border-box;
  padding: 0 13px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 11px;
  color: #777f90;
  background: #0c0e14;

  &:focus-within { border-color: rgb(124 92 255 / 65%); box-shadow: 0 0 0 3px rgb(124 92 255 / 13%); }
  input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: #f3f4f8;
    background: transparent;
    font: inherit;
    font-size: .78rem;
  }
  input::placeholder { color: #686f7f; }
`;

const FilterGroup = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  overflow-x: auto;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 11px;
  background: #0c0e14;
  scrollbar-width: none;

  &::-webkit-scrollbar { display: none; }
  button {
    min-height: 34px;
    flex: 0 0 auto;
    padding: 0 11px;
    border: 0;
    border-radius: 8px;
    color: #8f96a6;
    background: transparent;
    font: inherit;
    font-size: .7rem;
    font-weight: 750;
    cursor: pointer;
  }
  button[aria-pressed='true'] { color: #f0edff; background: rgb(124 92 255 / 22%); }
  button:hover { color: #fff; }
  button:focus-visible { outline: 2px solid #8c78ff; outline-offset: 1px; }

  @media (max-width: 520px) {
    button { min-height: 40px; padding: 0 13px; }
  }
`;

const Scroller = styled.div`
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 24px max(24px, env(safe-area-inset-bottom));
  scrollbar-width: thin;

  @media (max-width: 680px) {
    padding: 14px 12px max(18px, env(safe-area-inset-bottom));
  }
`;

const Summary = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
  color: #858d9d;
  font-size: .68rem;

  strong { color: #bec4d0; font-weight: 700; }
`;

const JobList = styled.div`
  display: grid;
  gap: 8px;
`;

const JobRow = styled.article<{ $active: boolean }>`
  content-visibility: auto;
  contain-intrinsic-size: 0 82px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 78px;
  padding: 9px 10px;
  border: 1px solid ${({ $active }) => ($active ? 'rgb(124 92 255 / 62%)' : 'rgb(255 255 255 / 7%)')};
  border-radius: 13px;
  background: ${({ $active }) => ($active ? 'rgb(124 92 255 / 8%)' : 'rgb(255 255 255 / 2%)')};

  &:hover { border-color: rgb(124 92 255 / 30%); }
`;

const JobMain = styled.button`
  min-width: 0;
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr) 112px 122px;
  gap: 13px;
  align-items: center;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:focus-visible { outline: 2px solid #8c78ff; outline-offset: 4px; border-radius: 7px; }

  @media (max-width: 800px) {
    grid-template-columns: 56px minmax(0, 1fr);
  }
`;

const Thumb = styled.span`
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 10px;
  color: #7968d6;
  background:
    linear-gradient(135deg, rgb(124 92 255 / 10%), transparent),
    rgb(255 255 255 / 3%);

  img { width: 100%; height: 100%; object-fit: contain; }

  @media (max-width: 800px) {
    width: 56px;
    height: 56px;
  }
`;

const JobMeta = styled.span`
  min-width: 0;
  display: block;

  strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { color: #edf0f6; font-size: .77rem; line-height: 1.35; }
  small { margin-top: 6px; color: #777f90; font-size: .65rem; }
`;

const Context = styled.span`
  min-width: 0;
  display: block;
  color: #a2a9b7;
  font-size: .68rem;
  line-height: 1.45;

  strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { font-weight: 650; }
  small { margin-top: 4px; color: #6f7788; }

  @media (max-width: 800px) { display: none; }
`;

const StatusColumn = styled.span`
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: 6px;

  small { color: #747c8c; font-size: .63rem; font-variant-numeric: tabular-nums; white-space: nowrap; }

  @media (max-width: 800px) { display: none; }
`;

const StatusPill = styled.span<{ $tone: HistoryFilter }>`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid ${({ $tone }) => (
    $tone === 'completed' ? 'rgb(34 197 94 / 24%)'
      : $tone === 'attention' ? 'rgb(245 158 11 / 28%)'
        : 'rgb(124 92 255 / 28%)'
  )};
  border-radius: 999px;
  color: ${({ $tone }) => (
    $tone === 'completed' ? '#84dca2'
      : $tone === 'attention' ? '#e7bb68'
        : '#b1a5ff'
  )};
  background: ${({ $tone }) => (
    $tone === 'completed' ? 'rgb(34 197 94 / 7%)'
      : $tone === 'attention' ? 'rgb(245 158 11 / 7%)'
        : 'rgb(124 92 255 / 8%)'
  )};
  font-size: .62rem;
  font-weight: 750;
  white-space: nowrap;
`;

const DeleteButton = styled.button`
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 10px;
  color: #858d9d;
  background: transparent;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: rgb(239 68 68 / 40%); color: #ff8f8f; background: rgb(239 68 68 / 7%); }
  &:focus-visible { outline: 2px solid #ef6262; outline-offset: 2px; }
  &:disabled { cursor: not-allowed; opacity: .35; }

  @media (max-width: 520px) { width: 44px; height: 44px; }
`;

const ConfirmOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgb(3 5 11 / 66%);
  backdrop-filter: blur(5px);

  @media (max-width: 520px) {
    align-items: end;
    padding: 10px 10px max(10px, env(safe-area-inset-bottom));
  }
`;

const ConfirmDialog = styled.section`
  width: min(520px, 100%);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  margin: 2px 0 0;
  padding: 13px;
  border: 1px solid rgb(239 68 68 / 26%);
  border-radius: 11px;
  color: #f0b4b4;
  background: rgb(239 68 68 / 7%);
  box-shadow: 0 18px 70px rgb(0 0 0 / 40%);

  > svg { color: #ef7777; }
  strong { display: block; color: #ffd4d4; font-size: .73rem; }
  p { margin: 4px 0 0; color: #b9969b; font-size: .65rem; line-height: 1.5; }

  @media (max-width: 680px) {
    grid-template-columns: auto minmax(0, 1fr);
    > div:last-child { grid-column: 1 / -1; }
  }
`;

const ConfirmActions = styled.div`
  display: flex;
  gap: 7px;

  button {
    min-height: 40px;
    padding: 0 13px;
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: 9px;
    color: #cbd0db;
    background: rgb(255 255 255 / 4%);
    font: inherit;
    font-size: .68rem;
    font-weight: 750;
    cursor: pointer;
  }
  button[data-danger='true'] { border-color: #c63e3e; color: #fff; background: #b83232; }
  button:hover:not(:disabled) { filter: brightness(1.12); }
  button:focus-visible { outline: 2px solid #ef7777; outline-offset: 2px; }
  button:disabled { cursor: wait; opacity: .55; }

  @media (max-width: 520px) {
    display: grid;
    grid-template-columns: 1fr 1.35fr;
    button { min-height: 44px; }
  }
`;

const MessageBox = styled.div`
  min-height: 240px;
  display: grid;
  place-items: center;
  padding: 28px;
  border: 1px dashed rgb(255 255 255 / 10%);
  border-radius: 14px;
  color: #7f8797;
  text-align: center;

  > div { max-width: 420px; }
  svg { margin-bottom: 12px; color: #7060c8; }
  strong { display: block; color: #c9ced8; font-size: .82rem; }
  p { margin: 7px 0 0; font-size: .7rem; line-height: 1.55; }
  button {
    min-height: 42px;
    margin-top: 15px;
    padding: 0 14px;
    border: 1px solid rgb(124 92 255 / 40%);
    border-radius: 9px;
    color: #e7e2ff;
    background: rgb(124 92 255 / 13%);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
`;

const LoadMore = styled.button`
  width: 100%;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  border: 1px solid rgb(124 92 255 / 28%);
  border-radius: 11px;
  color: #cfc8ff;
  background: rgb(124 92 255 / 7%);
  font: inherit;
  font-size: .72rem;
  font-weight: 750;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: rgb(124 92 255 / 55%); background: rgb(124 92 255 / 12%); }
  &:focus-visible { outline: 2px solid #8c78ff; outline-offset: 2px; }
  &:disabled { cursor: wait; opacity: .6; }
  svg { animation: spin .9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { svg { animation: none; } }
`;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value) {
    const candidate = (value as { toDate?: unknown }).toDate;
    if (typeof candidate === 'function') {
      const date = candidate.call(value);
      return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
    }
  }
  if (value && typeof value === 'object' && 'seconds' in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  return null;
}

function formatJobDate(value: unknown): string {
  const date = toDate(value);
  if (!date) return '날짜 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function jobTone(job: EmoticonJob): Exclude<HistoryFilter, 'all'> {
  if (WORKING_STATUSES.has(job.status)) return 'working';
  if (job.status === 'completed') return 'completed';
  return 'attention';
}

function jobTitle(job: EmoticonJob): string {
  return job.plan?.action.title?.trim()
    || job.sheetPlan?.requestSummary?.trim()
    || job.instruction.trim()
    || '이름 없는 작업';
}

function jobThumbnail(job: EmoticonJob): string {
  return job.outputs?.png?.url
    || job.outputs?.gif?.url
    || job.outputs?.webp?.url
    || job.compositedFrames?.[0]?.url
    || job.keyPoseUrl
    || job.sourceImageUrl
    || '';
}

function deletionErrorMessage(error: unknown): string {
  const fallback = '작업을 삭제하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (!message || message.length > 260) return fallback;
  return message.replace(/^FirebaseError:\s*/i, '');
}

export function EmoticonJobHistoryPanel({
  userId,
  activeJobId,
  onClose,
  onSelect,
  onDeleted,
}: EmoticonJobHistoryPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmTitleId = useId();
  const confirmDescriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const confirmDialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const cursorRef = useRef<EmoticonJobHistoryCursor | null>(null);
  const hasMoreRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const [jobs, setJobs] = useState<EmoticonJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [deleteTarget, setDeleteTarget] = useState<EmoticonJob | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const loadMore = useCallback(async (reset = false) => {
    if (loadInFlightRef.current || (!reset && !hasMoreRef.current)) return;
    loadInFlightRef.current = true;
    setIsLoading(true);
    setLoadError('');
    try {
      const page = await listEmoticonJobHistoryPage({
        userId,
        pageSize: EMOTICON_JOB_HISTORY_PAGE_SIZE,
        cursor: reset ? null : cursorRef.current,
      });
      cursorRef.current = page.nextCursor;
      hasMoreRef.current = page.hasMore;
      setHasMore(page.hasMore);
      setJobs((current) => {
        const next = reset ? [] : current;
        const byId = new Map(next.map((job) => [job.id, job]));
        page.jobs.forEach((job) => byId.set(job.id, job));
        return [...byId.values()];
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '작업 기록을 불러오지 못했습니다.');
    } finally {
      loadInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadMore(true);
  }, [loadMore]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const scrollContainer = previousFocus?.closest<HTMLElement>('main')
      ?? document.querySelector<HTMLElement>('main');
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const bodyScrollY = window.scrollY;
    const previousScrollContainerInert = scrollContainer?.inert ?? false;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${bodyScrollY}px`;
    document.body.style.width = '100%';
    if (scrollContainer) scrollContainer.inert = true;
    const focusFrame = window.requestAnimationFrame(() => {
      if (window.matchMedia('(min-width: 681px)').matches) {
        searchRef.current?.focus({ preventScroll: true });
      } else panelRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      if (scrollContainer) scrollContainer.inert = previousScrollContainerInert;
      window.scrollTo({ top: bodyScrollY, behavior: 'instant' });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (deleteTarget) confirmCancelRef.current?.focus({ preventScroll: true });
  }, [deleteTarget]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (deletingJobId) return;
        if (deleteTarget) {
          setDeleteTarget(null);
          setDeleteError('');
        } else onClose();
        return;
      }
      const focusRoot = deleteTarget ? confirmDialogRef.current : panelRef.current;
      if (event.key !== 'Tab' || !focusRoot) return;
      const focusable = [...focusRoot.querySelectorAll<HTMLElement>([
        'button:not(:disabled)',
        'input:not(:disabled)',
        '[tabindex]:not([tabindex="-1"])',
      ].join(','))];
      if (!focusable.length) {
        event.preventDefault();
        focusRoot.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!focusRoot.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [deleteTarget, deletingJobId, onClose]);

  const visibleJobs = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLocaleLowerCase('ko-KR');
    return jobs.filter((job) => {
      if (filter !== 'all' && jobTone(job) !== filter) return false;
      if (!normalizedSearch) return true;
      return [jobTitle(job), job.instruction, job.projectId, MODE_LABELS[job.mode]]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('ko-KR').includes(normalizedSearch));
    });
  }, [deferredSearch, filter, jobs]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || deletingJobId) return;
    setDeletingJobId(deleteTarget.id);
    setDeleteError('');
    try {
      const result = await deleteEmoticonJobSafely(deleteTarget.id);
      setJobs((current) => current.filter((job) => job.id !== deleteTarget.id));
      onDeleted(deleteTarget.id);
      setDeleteTarget(null);
      toast.success(result.deleted
        ? `작업 기록을 삭제했습니다${result.deletedAssets ? ` · 결과 파일 ${result.deletedAssets}개 정리` : ''}.`
        : '이미 삭제된 작업입니다.');
    } catch (error) {
      setDeleteError(deletionErrorMessage(error));
    } finally {
      setDeletingJobId(null);
    }
  }, [deleteTarget, deletingJobId, onDeleted]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <Overlay
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !deletingJobId) onClose();
      }}
    >
      <Panel
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isLoading || Boolean(deletingJobId)}
        tabIndex={-1}
      >
        <Header>
          <div>
            <h2 id={titleId}>전체 작업</h2>
            <p id={descriptionId}>지금까지 만든 작업을 오래된 기록까지 이어서 확인하고, 더 이상 필요 없는 결과를 정리할 수 있습니다.</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(deletingJobId)} aria-label="전체 작업 닫기">
            <X size={19} aria-hidden="true" />
          </button>
        </Header>

        <Controls>
          <SearchBox>
            <Search size={17} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              name="emoticon-job-history-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="불러온 작업에서 제목·내용 검색…"
              autoComplete="off"
              aria-label="불러온 작업 검색"
            />
          </SearchBox>
          <FilterGroup aria-label="작업 상태 필터">
            {([
              ['all', '전체'],
              ['working', '진행 중'],
              ['completed', '완료'],
              ['attention', '확인 필요'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </FilterGroup>
        </Controls>

        <Scroller>
          <Summary aria-live="polite">
            <strong>{visibleJobs.length}개 표시</strong>
            <span>{jobs.length}개 불러옴{hasMore ? ' · 이전 기록 더 있음' : ' · 마지막 기록까지 불러옴'}</span>
          </Summary>

          {loadError && !jobs.length ? (
            <MessageBox role="alert">
              <div>
                <AlertTriangle size={25} aria-hidden="true" />
                <strong>작업 기록을 불러오지 못했습니다</strong>
                <p>{loadError}</p>
                <button type="button" onClick={() => void loadMore(true)}>다시 시도</button>
              </div>
            </MessageBox>
          ) : isLoading && !jobs.length ? (
            <MessageBox role="status">
              <div>
                <LoaderCircle size={25} aria-hidden="true" />
                <strong>전체 작업을 불러오는 중입니다</strong>
                <p>저장된 기록을 최신 순서로 정리하고 있어요.</p>
              </div>
            </MessageBox>
          ) : !visibleJobs.length ? (
            <MessageBox>
              <div>
                <History size={25} aria-hidden="true" />
                <strong>{jobs.length ? '조건에 맞는 작업이 없습니다' : '아직 저장된 작업이 없습니다'}</strong>
                <p>{jobs.length ? '검색어나 상태 필터를 바꿔 보세요.' : '새 이모티콘을 만들면 여기에 차례로 쌓입니다.'}</p>
              </div>
            </MessageBox>
          ) : (
            <JobList aria-label="전체 이모티콘 작업">
              {visibleJobs.map((job) => {
                const title = jobTitle(job);
                const thumbnail = jobThumbnail(job);
                const tone = jobTone(job);
                const isWorking = tone === 'working';
                const isDeleting = deletingJobId === job.id;
                const isConfirming = deleteTarget?.id === job.id;
                return (
                  <JobRow key={job.id} $active={job.id === activeJobId}>
                    <JobMain
                      type="button"
                      onClick={() => onSelect(job.id)}
                      aria-label={`${title} 작업 열기`}
                      aria-current={job.id === activeJobId ? 'true' : undefined}
                    >
                      <Thumb>
                        {thumbnail ? (
                          <img src={thumbnail} width={60} height={60} loading="lazy" alt="" />
                        ) : (
                          <ImagePlus size={21} aria-hidden="true" />
                        )}
                      </Thumb>
                      <JobMeta>
                        <strong>{title}</strong>
                        <small>{getEmoticonJobHistoryStatusLabel(job, Date.now())} · {formatJobDate(job.createdAt)}</small>
                      </JobMeta>
                      <Context>
                        <strong>{MODE_LABELS[job.mode] || '이모티콘 작업'}</strong>
                        <small>{job.projectId ? '프로젝트 연결됨' : '빠른 생성'}</small>
                      </Context>
                      <StatusColumn>
                        <StatusPill $tone={tone}>{getEmoticonJobHistoryStatusLabel(job, Date.now())}</StatusPill>
                        <small>{formatJobDate(job.createdAt)}</small>
                      </StatusColumn>
                    </JobMain>
                    <DeleteButton
                      type="button"
                      disabled={isWorking || Boolean(deletingJobId)}
                      title={isWorking ? '진행 중인 작업은 완료하거나 취소한 뒤 삭제할 수 있습니다.' : '작업 삭제'}
                      aria-label={isWorking ? `${title} 작업은 진행 중이라 삭제할 수 없음` : `${title} 작업 삭제`}
                      aria-expanded={isConfirming}
                      onClick={() => {
                        setDeleteTarget(job);
                        setDeleteError('');
                      }}
                    >
                      {isDeleting ? <LoaderCircle size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}
                    </DeleteButton>
                  </JobRow>
                );
              })}
            </JobList>
          )}

          {loadError && jobs.length ? <MessageBox role="alert"><div><p>{loadError}</p></div></MessageBox> : null}
          {hasMore ? (
            <LoadMore type="button" disabled={isLoading} onClick={() => void loadMore()}>
              {isLoading ? <LoaderCircle size={16} aria-hidden="true" /> : <FolderKanban size={16} aria-hidden="true" />}
              {isLoading ? '이전 작업 불러오는 중…' : `이전 작업 ${EMOTICON_JOB_HISTORY_PAGE_SIZE}개 더 보기`}
            </LoadMore>
          ) : null}
        </Scroller>
        {deleteTarget ? (
          <ConfirmOverlay
            role="presentation"
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget || deletingJobId) return;
              setDeleteTarget(null);
              setDeleteError('');
            }}
          >
            <ConfirmDialog
              ref={confirmDialogRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={confirmTitleId}
              aria-describedby={confirmDescriptionId}
              aria-busy={Boolean(deletingJobId)}
              tabIndex={-1}
            >
              <AlertTriangle size={20} aria-hidden="true" />
              <div>
                <strong id={confirmTitleId}>“{jobTitle(deleteTarget)}” 작업을 영구 삭제할까요?</strong>
                <p id={confirmDescriptionId}>
                  작업 기록과 이 작업 전용 결과 파일을 삭제합니다. 원본 이미지는 보존되며,
                  프로젝트의 현재 결과라면 해당 항목은 생성 전 상태로 돌아갑니다.
                </p>
                {deleteError ? <p role="alert">{deleteError}</p> : null}
              </div>
              <ConfirmActions>
                <button
                  ref={confirmCancelRef}
                  type="button"
                  disabled={Boolean(deletingJobId)}
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteError('');
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  data-danger="true"
                  disabled={Boolean(deletingJobId)}
                  onClick={() => void handleDelete()}
                >
                  {deletingJobId ? '삭제 중…' : '영구 삭제'}
                </button>
              </ConfirmActions>
            </ConfirmDialog>
          </ConfirmOverlay>
        ) : null}
      </Panel>
    </Overlay>,
    document.body,
  );
}
