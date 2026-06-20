'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import styled from 'styled-components';
import {
  ChevronDown,
  Clock3,
  Copy,
  FileText,
  Minimize2,
  Palette,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SortDesc,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { useStickyNotes } from '@/hooks/useStickyNotes';
import { TAG_COLOR_ORDER, type StickyNote, type StickyNoteColor } from '@/types/stickyNote';
import { applyPinnedAndSort } from '@/utils/stickyNoteUtils';
import type { SortMode } from '@/utils/stickyNoteUtils';

const MAX_MEMO_LENGTH = 4000;

const COLOR_LABELS: Record<StickyNoteColor, string> = {
  sun: '노랑',
  lime: '라임',
  sky: '하늘',
  rose: '로즈',
  violet: '보라',
  slate: '회색',
};

const COLOR_VALUES: Record<StickyNoteColor, string> = {
  sun: '#ffd76a',
  lime: '#b8ff7a',
  sky: '#8fd8ff',
  rose: '#ff9fb2',
  violet: '#c6a7ff',
  slate: '#cfd6df',
};

const formatUpdatedAt = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) return '';

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const splitMemoContent = (content: string) => {
  const normalized = content.replace(/\r\n/g, '\n');
  const [title = '', ...bodyLines] = normalized.split('\n');
  return {
    title,
    body: bodyLines.join('\n'),
  };
};

const getMemoTitle = (content: string) => {
  return splitMemoContent(content).title.trim() || '새 메모';
};

const getMemoPreview = (content: string) => {
  const normalized = splitMemoContent(content).body.replace(/\s+/g, ' ').trim();
  return normalized || '내용 없음';
};

type MemoEditorProps = {
  note: StickyNote;
  textareaFocusRef: MutableRefObject<string | null>;
  onFocusMemo: (noteId: string) => void;
  onChangeContent: (noteId: string, content: string) => void;
};

function MemoEditor({ note, textareaFocusRef, onFocusMemo, onChangeContent }: MemoEditorProps) {
  const [draftContent, setDraftContent] = useState(note.content);
  const [isEditing, setIsEditing] = useState(false);
  const isComposingRef = useRef(false);

  const commitDraft = useCallback((nextContent: string) => {
    if (nextContent === note.content) return;
    onChangeContent(note.id, nextContent);
  }, [note.content, note.id, onChangeContent]);

  useEffect(() => {
    if (!isEditing || draftContent === note.content || isComposingRef.current) return;

    const timerId = window.setTimeout(() => {
      commitDraft(draftContent);
    }, 350);

    return () => window.clearTimeout(timerId);
  }, [commitDraft, draftContent, isEditing, note.content]);

  const activeContent = isEditing ? draftContent : note.content;

  const updateDraftContent = (nextContent: string) => {
    setDraftContent(nextContent.slice(0, MAX_MEMO_LENGTH));
  };

  const openOnFocus = () => {
    if (!isEditing) {
      setDraftContent(note.content);
    }
    setIsEditing(true);
    if (textareaFocusRef.current === note.id) return;
    onFocusMemo(note.id);
  };

  const finishEditing = () => {
    setIsEditing(false);
    if (!isComposingRef.current) {
      commitDraft(draftContent);
    }
  };

  const beginComposition = () => {
    isComposingRef.current = true;
  };

  const finishComposition = (content: string) => {
    const nextContent = content.slice(0, MAX_MEMO_LENGTH);
    isComposingRef.current = false;
    setDraftContent(nextContent);
    commitDraft(nextContent);
  };

  return (
    <textarea
      value={activeContent}
      maxLength={MAX_MEMO_LENGTH}
      placeholder={`제목\n메모 내용을 입력하세요`}
      aria-label="메모 내용"
      onChange={(event) => updateDraftContent(event.target.value)}
      onCompositionStart={beginComposition}
      onCompositionEnd={(event) => finishComposition(event.currentTarget.value)}
      onFocus={openOnFocus}
      onBlur={finishEditing}
    />
  );
}

interface ResetConfirmOptions {
  title: string;
  html: string;
  inputText: string;
  confirmButtonText: string;
}

async function confirmResetAction({ title, html, inputText, confirmButtonText }: ResetConfirmOptions): Promise<boolean> {
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
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#475569',
    background: '#111827',
    color: '#f8fafc',
  });

  return result.isConfirmed;
}

export default function BasicMemoAccordion() {
  const { notes, storageError, createNote, updateNote, deleteNote, clearNotes, clearAllNotesData } = useStickyNotes();
  const textareaFocusRef = useRef<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [colorFilter, setColorFilter] = useState<StickyNoteColor | 'all'>('all');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('updated_desc');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [isManageOpen, setIsManageOpen] = useState(false);

  const filteredNotes = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    const visible = notes.filter((note) => {
      if (pinnedOnly && !note.isPinned) return false;
      if (colorFilter !== 'all' && note.color !== colorFilter) return false;
      if (normalizedSearch && !note.content.toLowerCase().includes(normalizedSearch)) return false;
      return true;
    });

    return applyPinnedAndSort(visible, sortMode);
  }, [colorFilter, notes, pinnedOnly, searchText, sortMode]);
  const pinnedCount = notes.filter((note) => note.isPinned).length;

  const allVisibleOpen = filteredNotes.length > 0 && filteredNotes.every((note) => openIds.has(note.id));

  const focusMemoTextarea = useCallback((noteId: string) => {
    if (typeof window === 'undefined') return;

    textareaFocusRef.current = noteId;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const memoInput = document.querySelector<HTMLTextAreaElement>(`[data-basic-memo-id="${noteId}"] textarea[aria-label="메모 내용"]`);
        memoInput?.focus({ preventScroll: true });
        textareaFocusRef.current = null;
      });
    });
  }, []);

  const handleCreateMemo = useCallback(() => {
    const noteId = createNote();
    setOpenIds((current) => new Set(current).add(noteId));
    focusMemoTextarea(noteId);
  }, [createNote, focusMemoTextarea]);

  const toggleMemo = useCallback((noteId: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allVisibleOpen) {
      setOpenIds((current) => {
        const next = new Set(current);
        filteredNotes.forEach((note) => next.delete(note.id));
        return next;
      });
      return;
    }

    setOpenIds((current) => {
      const next = new Set(current);
      filteredNotes.forEach((note) => next.add(note.id));
      return next;
    });
  }, [allVisibleOpen, filteredNotes]);

  const resetFilters = useCallback(() => {
    setSearchText('');
    setColorFilter('all');
    setPinnedOnly(false);
  }, []);

  const updateMemoContent = useCallback((noteId: string, content: string) => {
    updateNote(noteId, { content });
  }, [updateNote]);

  const openMemoForEdit = useCallback((noteId: string) => {
    setOpenIds((current) => new Set(current).add(noteId));
  }, []);

  const copyMemo = useCallback(async (content: string) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(content);
      toast.success(content.trim() ? '메모를 복사했습니다.' : '빈 메모를 복사했습니다.', { duration: 1800 });
    } catch {
      toast.error('클립보드 복사에 실패했습니다.', { duration: 2400 });
    }
  }, []);

  const togglePin = useCallback((note: StickyNote) => {
    updateNote(note.id, { isPinned: !note.isPinned });
    toast.success(note.isPinned ? '메모 고정을 해제했습니다.' : '메모를 상단에 고정했습니다.', { duration: 1600 });
  }, [updateNote]);

  const confirmDelete = useCallback(async (note: StickyNote) => {
    const result = await Swal.fire({
      title: '메모를 삭제할까요?',
      text: '삭제한 메모는 복구할 수 없습니다.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '삭제',
      cancelButtonText: '취소',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#475569',
      background: '#111827',
      color: '#f8fafc',
    });

    if (!result.isConfirmed) return;

    deleteNote(note.id);
    setOpenIds((current) => {
      const next = new Set(current);
      next.delete(note.id);
      return next;
    });
    toast.success('메모를 삭제했습니다.', { duration: 1800 });
  }, [deleteNote]);

  const resetMemoItems = useCallback(async () => {
    if (notes.length === 0) {
      toast.info('초기화할 메모가 없습니다.', { duration: 1800 });
      return;
    }

    const confirmed = await confirmResetAction({
      title: '메모 항목을 모두 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#cbd5e1;font-size:13px;line-height:1.55;">
          <p style="margin:0;"><strong style="color:#fde68a;">색상 분류 설정은 유지</strong>하고 메모 ${notes.length}개를 모두 삭제합니다.</p>
          <p style="margin:0;color:#fca5a5;">삭제한 메모는 복구할 수 없습니다.</p>
        </div>
      `,
      inputText: '메모 초기화',
      confirmButtonText: '메모 초기화',
    });
    if (!confirmed) return;

    try {
      await clearNotes();
      resetFilters();
      setOpenIds(new Set());
      toast.success('메모 항목을 모두 초기화했습니다.', { duration: 1800 });
    } catch {
      toast.error('메모 초기화에 실패했습니다.', { duration: 2400 });
    }
  }, [clearNotes, notes.length, resetFilters]);

  const resetMemoWorkspace = useCallback(async () => {
    if (notes.length === 0) {
      toast.info('초기화할 메모 데이터가 없습니다.', { duration: 1800 });
      return;
    }

    const confirmed = await confirmResetAction({
      title: '메모장 데이터를 모두 초기화할까요?',
      html: `
        <div style="text-align:left;display:grid;gap:10px;color:#cbd5e1;font-size:13px;line-height:1.55;">
          <p style="margin:0;">이 작업은 <strong style="color:#fecaca;">메모 ${notes.length}개와 메모 색상/분류 설정</strong>을 모두 비웁니다.</p>
          <p style="margin:0;color:#fca5a5;">초기화 후에는 화면에서 되돌릴 수 없습니다.</p>
        </div>
      `,
      inputText: '초기화',
      confirmButtonText: '전체 초기화',
    });
    if (!confirmed) return;

    try {
      await clearAllNotesData();
      resetFilters();
      setSortMode('updated_desc');
      setOpenIds(new Set());
      toast.success('메모장 데이터를 모두 초기화했습니다.', { duration: 1800 });
    } catch {
      toast.error('메모장 초기화에 실패했습니다.', { duration: 2400 });
    }
  }, [clearAllNotesData, notes.length, resetFilters]);

  return (
    <MemoWorkspace data-basic-memo-workspace>
      <MemoToolbar>
        <PrimaryButton type="button" onClick={handleCreateMemo} title="새 메모">
          <Plus size={17} strokeWidth={2.3} />
          <span>새 메모</span>
        </PrimaryButton>

        <GhostButton
          type="button"
          onClick={() => setIsManageOpen((prev) => !prev)}
          title="메모장 관리"
          aria-expanded={isManageOpen}
          aria-controls="basic-memo-management"
        >
          <Settings2 size={16} strokeWidth={2.2} />
          <span>관리</span>
        </GhostButton>

        <GhostButton
          type="button"
          onClick={() => setPinnedOnly((prev) => !prev)}
          disabled={pinnedCount === 0}
          title="상단 고정 메모만 보기"
          aria-pressed={pinnedOnly}
        >
          <Pin size={16} strokeWidth={2.2} />
          <span>고정 {pinnedCount}</span>
        </GhostButton>

        <SearchField>
          <Search size={16} strokeWidth={2.2} aria-hidden="true" />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="메모 검색"
            aria-label="메모 검색"
          />
        </SearchField>

        <ColorFilterControl aria-label="색상 카테고리">
          <Palette size={16} strokeWidth={2.2} aria-hidden="true" />
          <AllColorButton
            type="button"
            $active={colorFilter === 'all'}
            onClick={() => setColorFilter('all')}
            title="전체 색상"
            aria-label="전체 색상"
          />
          {TAG_COLOR_ORDER.map((color) => (
            <ColorDotButton
              key={color}
              type="button"
              $color={color}
              $active={colorFilter === color}
              onClick={() => setColorFilter(color)}
              title={COLOR_LABELS[color]}
              aria-label={`${COLOR_LABELS[color]} 메모만 보기`}
            />
          ))}
        </ColorFilterControl>

        <SelectControl>
          <SortDesc size={16} strokeWidth={2.2} aria-hidden="true" />
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            aria-label="메모 정렬"
          >
            <option value="updated_desc">최근 수정순</option>
            <option value="created_desc">최근 생성순</option>
          </select>
        </SelectControl>

        <ToolbarSpacer />

        <GhostButton
          type="button"
          onClick={toggleAll}
          disabled={filteredNotes.length === 0}
          title={allVisibleOpen ? '모두 접기' : '모두 열기'}
        >
          <Minimize2 size={16} strokeWidth={2.2} />
          <span>{allVisibleOpen ? '모두 접기' : '모두 열기'}</span>
        </GhostButton>

        <MemoMeta aria-label="메모 개수">
          <span>총 {notes.length}개</span>
          <span>표시 {filteredNotes.length}개</span>
        </MemoMeta>
      </MemoToolbar>

      {isManageOpen ? (
        <MemoManagementPanel id="basic-memo-management" aria-label="메모장 관리">
          <ManagementCopy>
            <strong>
              <Trash2 size={16} strokeWidth={2.2} />
              메모장 초기화
            </strong>
            <span>메모 항목 {notes.length}개를 정리하거나, 메모와 색상/분류 설정을 함께 초기화할 수 있습니다.</span>
          </ManagementCopy>
          <ManagementActions>
            <ResetActionButton type="button" $tone="danger" onClick={() => void resetMemoItems()} disabled={notes.length === 0}>
              <Trash2 size={16} strokeWidth={2.2} />
              메모 초기화
            </ResetActionButton>
            <ResetActionButton type="button" $tone="danger" onClick={() => void resetMemoWorkspace()} disabled={notes.length === 0}>
              <RotateCcw size={16} strokeWidth={2.2} />
              전체 초기화
            </ResetActionButton>
          </ManagementActions>
        </MemoManagementPanel>
      ) : null}

      {storageError ? <StorageNotice title={storageError}>{storageError}</StorageNotice> : null}

      <MemoList aria-label="기본형 메모 목록" data-basic-memo-list>
        {notes.length === 0 ? (
          <EmptyState>
            <FileText size={34} strokeWidth={1.8} />
            <strong>메모가 없습니다</strong>
            <PrimaryButton type="button" onClick={handleCreateMemo} title="새 메모 만들기">
              <Plus size={17} strokeWidth={2.3} />
              <span>새 메모 만들기</span>
            </PrimaryButton>
          </EmptyState>
        ) : null}

        {notes.length > 0 && filteredNotes.length === 0 ? (
          <EmptyState>
            <Search size={34} strokeWidth={1.8} />
            <strong>조건에 맞는 메모가 없습니다</strong>
            <GhostButton type="button" onClick={resetFilters} title="필터 초기화">
              <RotateCcw size={16} strokeWidth={2.2} />
              <span>필터 초기화</span>
            </GhostButton>
          </EmptyState>
        ) : null}

        {filteredNotes.map((note) => {
          const isOpen = openIds.has(note.id);
          const panelId = `basic-memo-panel-${note.id}`;
          const title = getMemoTitle(note.content);
          const preview = getMemoPreview(note.content);

          return (
            <MemoItem key={note.id} data-basic-memo-id={note.id} $open={isOpen}>
              <MemoSummaryButton
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleMemo(note.id)}
              >
                <MemoColorMarker $color={note.color} title={COLOR_LABELS[note.color]} aria-hidden="true" />
                <MemoSummaryText>
                  <MemoTitleLine>
                    <strong>{title}</strong>
                    {note.isPinned ? (
                      <PinnedBadge>
                        <Pin size={12} strokeWidth={2.4} />
                        고정
                      </PinnedBadge>
                    ) : null}
                  </MemoTitleLine>
                  <span>{preview}</span>
                </MemoSummaryText>

                <MemoSummarySide>
                  <TimeStamp>
                    <Clock3 size={14} strokeWidth={2.1} />
                    {formatUpdatedAt(note.updatedAt)}
                  </TimeStamp>
                  <ChevronIcon $open={isOpen}>
                    <ChevronDown size={18} strokeWidth={2.4} />
                  </ChevronIcon>
                </MemoSummarySide>
              </MemoSummaryButton>

              {isOpen ? (
                <MemoPanel id={panelId}>
                  <MemoEditor
                    note={note}
                    textareaFocusRef={textareaFocusRef}
                    onFocusMemo={openMemoForEdit}
                    onChangeContent={updateMemoContent}
                  />

                  <PanelActions>
                    <span>{note.content.length.toLocaleString('ko-KR')} / {MAX_MEMO_LENGTH.toLocaleString('ko-KR')}</span>
                    <IconButton type="button" onClick={() => togglePin(note)} title={note.isPinned ? '상단 고정 해제' : '상단 고정'}>
                      <Pin size={16} strokeWidth={2.2} fill={note.isPinned ? 'currentColor' : 'none'} />
                    </IconButton>
                    <PanelColorGroup aria-label="메모 색상 변경">
                      {TAG_COLOR_ORDER.map((color) => (
                        <ColorDotButton
                          key={color}
                          type="button"
                          $color={color}
                          $active={note.color === color}
                          onClick={() => updateNote(note.id, { color })}
                          title={COLOR_LABELS[color]}
                          aria-label={`${COLOR_LABELS[color]}로 변경`}
                        />
                      ))}
                    </PanelColorGroup>
                    <IconButton type="button" onClick={() => copyMemo(note.content)} title="메모 복사">
                      <Copy size={16} strokeWidth={2.2} />
                    </IconButton>
                    <DangerButton type="button" onClick={() => confirmDelete(note)} title="메모 삭제">
                      <Trash2 size={16} strokeWidth={2.2} />
                    </DangerButton>
                  </PanelActions>
                </MemoPanel>
              ) : null}
            </MemoItem>
          );
        })}
      </MemoList>
    </MemoWorkspace>
  );
}

const MemoWorkspace = styled.section`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018)),
    var(--bg-card);

  body[data-propig-design='codeit'] & {
    background: rgba(255, 255, 255, 0.92);
    border-color: rgba(28, 39, 76, 0.1);
    box-shadow: 0 22px 54px rgba(30, 41, 59, 0.08);
    animation: memoWorkspaceIn 0.58s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes memoWorkspaceIn {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const MemoToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 66px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(0, 0, 0, 0.1);
  overflow-x: auto;
  scrollbar-width: none;

  body[data-propig-design='codeit'] & {
    background: #f8f9ff;
    border-bottom-color: rgba(28, 39, 76, 0.1);
  }

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: 760px) {
    min-height: 58px;
    padding: 9px 8px;
    gap: 8px;
    align-items: stretch;
    flex-wrap: wrap;
    overflow: visible;
  }
`;

const MemoManagementPanel = styled.section`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 10px 14px 0;
  padding: 12px 14px;
  border: 1px solid rgba(239, 68, 68, 0.24);
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(16, 185, 129, 0.05)),
    rgba(15, 23, 42, 0.42);

  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
    margin: 8px 8px 0;
    padding: 11px;
  }
`;

const ManagementCopy = styled.div`
  min-width: 0;

  strong {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-main);
    font-size: 0.94rem;
    font-weight: 900;
  }

  span {
    display: block;
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 0.82rem;
    line-height: 1.45;
  }
`;

const ManagementActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;

  @media (max-width: 760px) {
    justify-content: stretch;
  }
`;

const ResetActionButton = styled.button<{ $tone: 'danger' }>`
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid rgba(239, 68, 68, 0.34);
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.12);
  color: #fecaca;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(239, 68, 68, 0.48);
    background: rgba(239, 68, 68, 0.18);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (max-width: 760px) {
    flex: 1 1 132px;
  }
`;

const PrimaryButton = styled.button`
  flex: 0 0 auto;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid rgba(16, 185, 129, 0.34);
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.16);
  color: var(--text-bright);
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;

  &:hover {
    border-color: rgba(16, 185, 129, 0.55);
    background: rgba(16, 185, 129, 0.22);
    transform: translateY(-1px);
  }

  body[data-propig-design='codeit'] & {
    border-color: transparent;
    background: var(--codeit-primary);
    color: #ffffff;
    box-shadow: 0 10px 24px rgba(52, 81, 209, 0.16);
  }

  body[data-propig-design='codeit'] &:hover {
    border-color: transparent;
    background: var(--codeit-primary-hover);
  }
`;

const SearchField = styled.label`
  flex: 0 1 340px;
  min-width: 210px;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-dim);

  input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-main);
    font: inherit;
    font-size: 0.92rem;
  }

  input::placeholder {
    color: var(--text-dim);
  }

  &:focus-within {
    border-color: rgba(16, 185, 129, 0.42);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
  }

  @media (max-width: 760px) {
    order: 1;
    flex: 1 1 180px;
    min-width: 0;
  }
`;

const ColorFilterControl = styled.div`
  flex: 0 0 auto;
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-dim);

  @media (max-width: 760px) {
    order: 2;
    flex: 1 1 220px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

const AllColorButton = styled.button<{ $active?: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid ${({ $active }) => ($active ? 'var(--primary-light)' : 'rgba(255, 255, 255, 0.24)')};
  background: conic-gradient(#ffd76a, #b8ff7a, #8fd8ff, #ff9fb2, #c6a7ff, #cfd6df, #ffd76a);
  padding: 0;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;

  &:hover {
    transform: scale(1.12);
  }
`;

const ColorDotButton = styled.button<{ $color: StickyNoteColor; $active?: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.22);
  background: ${({ $color }) => COLOR_VALUES[$color]};
  padding: 0;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;

  ${({ $active }) =>
    $active
      ? `
        transform: scale(1.12);
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.22);
        border-color: rgba(255, 255, 255, 0.65);
      `
      : ''}

  &:hover {
    transform: scale(1.12);
  }
`;

const SelectControl = styled.label`
  flex: 0 0 auto;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-dim);

  select {
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-main);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  option {
    background: var(--bg-card);
  }

  @media (max-width: 760px) {
    order: 3;
    flex: 1 1 156px;
    min-width: 0;
  }
`;

const ToolbarSpacer = styled.div`
  flex: 1 0 12px;

  @media (max-width: 1180px) {
    display: none;
  }
`;

const GhostButton = styled.button`
  flex: 0 0 auto;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-muted);
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  &:hover:not(:disabled) {
    color: var(--text-main);
    border-color: var(--border-medium);
    background: rgba(255, 255, 255, 0.065);
  }

  &[aria-pressed='true'] {
    color: var(--primary-light);
    border-color: rgba(16, 185, 129, 0.38);
    background: rgba(16, 185, 129, 0.13);
  }

  body[data-propig-design='codeit'] &[aria-pressed='true'] {
    color: var(--codeit-primary);
    border-color: var(--codeit-primary-border);
    background: var(--codeit-primary-soft);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 760px) {
    order: 4;
    flex: 1 1 128px;
  }
`;

const MemoMeta = styled.div`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-dim);
  font-size: 0.8rem;
  font-weight: 800;
  white-space: nowrap;

  @media (max-width: 1180px) {
    display: none;
  }
`;

const StorageNotice = styled.div`
  margin: 10px 14px 0;
  padding: 9px 11px;
  border: 1px solid rgba(239, 68, 68, 0.24);
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  font-size: 0.84rem;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MemoList = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;

  @media (max-width: 760px) {
    padding: 9px 8px 12px;
    gap: 8px;
  }
`;

const EmptyState = styled.div`
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 13px;
  color: var(--text-muted);
  text-align: center;

  strong {
    color: var(--text-main);
    font-size: 1.02rem;
  }
`;

const MemoItem = styled.article<{ $open: boolean }>`
  border: 1px solid ${({ $open }) => ($open ? 'rgba(16, 185, 129, 0.34)' : 'var(--border-subtle)')};
  border-radius: 12px;
  background: ${({ $open }) => ($open ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255, 255, 255, 0.03)')};
  overflow: hidden;
  transition: border-color 0.18s ease, background 0.18s ease;

  body[data-propig-design='codeit'] & {
    border-color: ${({ $open }) => ($open ? 'var(--codeit-primary-border)' : 'var(--codeit-border)')};
    background: ${({ $open }) => ($open ? 'var(--codeit-primary-soft)' : '#ffffff')};
    box-shadow: 0 10px 26px rgba(30, 41, 59, 0.05);
  }
`;

const MemoSummaryButton = styled.button`
  width: 100%;
  min-height: 66px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.035);
  }

  @media (max-width: 760px) {
    min-height: 62px;
    padding: 11px 10px;
    gap: 10px;
  }
`;

const MemoColorMarker = styled.span<{ $color: StickyNoteColor }>`
  flex: 0 0 auto;
  width: 10px;
  align-self: stretch;
  min-height: 42px;
  border-radius: 999px;
  background: ${({ $color }) => COLOR_VALUES[$color]};
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.16) inset;
`;

const MemoSummaryText = styled.span`
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong {
    color: var(--text-main);
    font-size: 0.97rem;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  span {
    color: var(--text-muted);
    font-size: 0.84rem;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const MemoTitleLine = styled.span`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;

  strong {
    min-width: 0;
  }
`;

const PinnedBadge = styled.em`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.12);
  color: var(--primary-light);
  font-size: 0.68rem;
  font-style: normal;
  font-weight: 900;

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-primary-border);
    background: var(--codeit-primary-soft);
    color: var(--codeit-primary);
  }
`;

const MemoSummarySide = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 760px) {
    gap: 6px;
  }
`;

const TimeStamp = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-dim);
  font-size: 0.78rem;
  font-weight: 750;
  white-space: nowrap;

  @media (max-width: 760px) {
    display: none;
  }
`;

const ChevronIcon = styled.span<{ $open: boolean }>`
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  color: var(--text-muted);
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
  transition: transform 0.18s ease, color 0.18s ease, border-color 0.18s ease;
`;

const MemoPanel = styled.div`
  border-top: 1px solid var(--border-subtle);
  padding: 0 14px 14px;

  textarea {
    width: 100%;
    min-height: 236px;
    margin-top: 14px;
    padding: 14px;
    resize: vertical;
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    outline: none;
    background: rgba(4, 7, 12, 0.32);
    color: var(--text-main);
    font: inherit;
    font-size: 0.95rem;
    line-height: 1.55;
  }

  body[data-propig-design='codeit'] & textarea {
    background: #ffffff;
    border-color: var(--codeit-border-strong);
    color: var(--codeit-text);
  }

  textarea::placeholder {
    color: var(--text-dim);
  }

  textarea:focus {
    border-color: rgba(16, 185, 129, 0.42);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
  }

  @media (max-width: 760px) {
    padding: 0 10px 11px;

    textarea {
      min-height: 210px;
      margin-top: 11px;
      padding: 12px;
      font-size: 0.94rem;
    }
  }
`;

const PanelActions = styled.div`
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;

  span {
    margin-right: auto;
    color: var(--text-dim);
    font-size: 0.78rem;
    font-weight: 800;
  }
`;

const PanelColorGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 36px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);

  @media (max-width: 760px) {
    order: -1;
    width: 100%;
  }
`;

const IconButton = styled.button`
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  &:hover {
    color: var(--text-main);
    border-color: var(--border-medium);
    background: rgba(255, 255, 255, 0.065);
  }
`;

const DangerButton = styled(IconButton)`
  color: #fca5a5;

  &:hover {
    border-color: rgba(239, 68, 68, 0.34);
    background: rgba(239, 68, 68, 0.12);
    color: #fecaca;
  }
`;
