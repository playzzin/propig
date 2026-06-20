
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { StickyNoteCard } from './StickyNoteCard';
import { useStickyNotes } from '@/hooks/useStickyNotes';
import { StickyNote, StickyNoteColor, TAG_COLOR_ORDER } from '@/types/stickyNote';
import {
  applyPinnedAndSort,
  SortMode
} from '@/utils/stickyNoteUtils';
import { DndContext, DragEndEvent, DragStartEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import {
  BoardWrapper,
  Toolbar,
  Viewport,
  Canvas,
  EmptyState,
  ColorDot,
} from '@/styles/StickyNotes.styles';
import styled from 'styled-components';

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.14);
  color: var(--text-bright);
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex: 0 0 auto;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(16, 185, 129, 0.4);
  }

  body[data-propig-design='codeit'] & {
    background: var(--codeit-primary);
    border-color: transparent;
    color: #ffffff;
    box-shadow: 0 10px 24px rgba(52, 81, 209, 0.18);
  }

  @media (max-width: 720px) {
    height: 40px;
    padding: 0 12px;
    border-radius: 10px;
  }
`;

const ToolbarField = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  height: 40px;
  padding: 0 12px;
  min-width: 180px;
  flex: 0 0 auto;

  body[data-propig-design='codeit'] & {
    background: #ffffff;
    border-color: var(--codeit-border);
  }

  input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-main);
    font-size: 0.9rem;
  }

  @media (max-width: 720px) {
    flex-basis: 176px;
    min-width: 176px;
    padding: 0 10px;
  }
`;

const ToolbarSelect = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  height: 40px;
  padding: 0 12px;
  flex: 0 0 auto;

  body[data-propig-design='codeit'] & {
    background: #ffffff;
    border-color: var(--codeit-border);
  }

  select {
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-main);
    font-size: 0.9rem;
    option {
      background: var(--bg-card);
    }
  }

  @media (max-width: 720px) {
    min-width: 124px;
    padding: 0 10px;
  }
`;

const ToolbarChip = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: ${({ $active }) => $active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)'};
  color: ${({ $active }) => $active ? 'var(--primary-light)' : 'var(--text-muted)'};
  cursor: pointer;
  transition: all 0.2s;
  border-color: ${({ $active }) => $active ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)'};
  white-space: nowrap;
  flex: 0 0 auto;

  &:hover {
    color: var(--text-bright);
    background: rgba(255, 255, 255, 0.06);
  }

  body[data-propig-design='codeit'] & {
    background: ${({ $active }) => ($active ? 'var(--codeit-primary-soft)' : '#ffffff')};
    border-color: ${({ $active }) => ($active ? 'var(--codeit-primary-border)' : 'var(--codeit-border)')};
    color: ${({ $active }) => ($active ? 'var(--codeit-primary)' : 'var(--codeit-muted)')};
  }

  body[data-propig-design='codeit'] &:hover {
    color: var(--codeit-text);
    background: var(--codeit-primary-soft);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const ColorFilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  height: 40px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  flex: 0 0 auto;
`;

const ColorFilterAll = styled.button<{ $active?: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 2px solid ${({ $active }) => $active ? 'var(--primary-light)' : 'rgba(255,255,255,0.2)'};
  background: conic-gradient(#ffd76a, #b8ff7a, #8fd8ff, #ff9fb2, #c6a7ff, #cfd6df, #ffd76a);
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;

  &:hover {
    transform: scale(1.15);
  }
`;

const ToolbarDivider = styled.div`
  width: 1px;
  height: 24px;
  background: var(--border-subtle);
  flex-shrink: 0;

  @media (max-width: 720px) {
    display: none;
  }
`;

const MetaInfo = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-dim);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;

  @media (max-width: 1400px) {
    display: none;
  }

  @media (max-width: 720px) {
    display: none;
  }
`;

const ErrorBadge = styled.span`
  display: inline-flex;
  align-items: center;
  max-width: 360px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
`;

const MobileNotesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px;
  min-height: 100%;
`;

const CANVAS_WIDTH = 4000;
const CANVAS_HEIGHT = 2400;
const NOTE_GAP = 20;

type ResizeState = {
  noteId: string;
  startClientX: number;
  startClientY: number;
  originW: number;
  originH: number;
} | null;

export default function StickyNotesBoard() {
  const { currentUser } = useAuth();
  const {
    notes,
    setNotes,
    storageError,
    createNote: _createNote,
    updateNote,
    deleteNote,
    bringToFront,
  } = useStickyNotes();

  const boardRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<ResizeState>(null);
  const rafRef = useRef<number | null>(null);

  const [searchText, setSearchText] = useState('');
  const [colorFilter, setColorFilter] = useState<StickyNoteColor | 'all'>('all');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('updated_desc');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [isMobileBoard, setIsMobileBoard] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const syncMobileBoard = () => setIsMobileBoard(mediaQuery.matches);

    syncMobileBoard();
    mediaQuery.addEventListener('change', syncMobileBoard);
    return () => mediaQuery.removeEventListener('change', syncMobileBoard);
  }, []);

  const createNote = useCallback(() => {
    const viewport = viewportRef.current;
    const v = viewport
      ? {
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        clientWidth: viewport.clientWidth,
        clientHeight: viewport.clientHeight,
      }
      : undefined;
    const noteId = _createNote(v);

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const memoInput = document.querySelector<HTMLTextAreaElement>(`[data-sticky-note-id="${noteId}"] textarea[aria-label="메모 내용"]`);
          memoInput?.focus({ preventScroll: true });
        });
      });
    }
  }, [_createNote]);

  const resetFilters = () => {
    setSearchText('');
    setColorFilter('all');
    setPinnedOnly(false);
  };

  const toggleCollapse = useCallback((noteId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedIds(new Set(notes.map(n => n.id)));
  }, [notes]);

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  const allCollapsed = notes.length > 0 && collapsedIds.size >= notes.length;

  // Auto-arrange: place notes in a grid without overlap
  const autoArrange = useCallback(() => {
    const viewport = viewportRef.current;
    const scrollLeft = viewport ? viewport.scrollLeft : 0;
    const scrollTop = viewport ? viewport.scrollTop : 0;

    setNotes(prev => {
      const sorted = applyPinnedAndSort([...prev], sortMode);
      const arranged: StickyNote[] = [];

      // Use a simple grid packing approach
      let curX = scrollLeft + NOTE_GAP;
      let curY = scrollTop + NOTE_GAP;
      let rowMaxH = 0;
      const viewportWidth = viewport ? viewport.clientWidth : 1200;

      for (const note of sorted) {
        // If this note would go beyond viewport width, wrap to next row
        if (curX + note.w > scrollLeft + viewportWidth - NOTE_GAP && curX > scrollLeft + NOTE_GAP) {
          curX = scrollLeft + NOTE_GAP;
          curY += rowMaxH + NOTE_GAP;
          rowMaxH = 0;
        }

        arranged.push({
          ...note,
          x: Math.min(curX, CANVAS_WIDTH - note.w),
          y: Math.min(curY, CANVAS_HEIGHT - note.h),
          updatedAt: Date.now(),
        });

        curX += note.w + NOTE_GAP;
        rowMaxH = Math.max(rowMaxH, note.h);
      }

      // Sync positions to Firestore
      if (currentUser) {
        for (const n of arranged) {
          const original = prev.find(o => o.id === n.id);
          if (original && (original.x !== n.x || original.y !== n.y)) {
            updateNote(n.id, { x: n.x, y: n.y });
          }
        }
      }

      return arranged;
    });
  }, [currentUser, setNotes, sortMode, updateNote]);

  const filteredNotes = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const visible = notes.filter((n) => {
      if (pinnedOnly && !n.isPinned) return false;
      if (colorFilter !== 'all' && n.color !== colorFilter) return false;

      if (normalizedSearch) {
        const inContent = n.content.toLowerCase().includes(normalizedSearch);
        if (!inContent) return false;
      }

      return true;
    });

    return applyPinnedAndSort(visible, sortMode);
  }, [colorFilter, notes, pinnedOnly, searchText, sortMode]);
  const pinnedCount = notes.filter((note) => note.isPinned).length;

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    bringToFront(active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    const noteId = active.id as string;

    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const newX = Math.max(0, Math.min(CANVAS_WIDTH - note.w, note.x + delta.x));
    const newY = Math.max(0, Math.min(CANVAS_HEIGHT - note.h, note.y + delta.y));

    updateNote(noteId, { x: newX, y: newY });
  };

  // Resize Logic
  const startResize = (note: StickyNote, e: React.PointerEvent) => {
    e.stopPropagation();
    bringToFront(note.id);
    if (boardRef.current) boardRef.current.setPointerCapture(e.pointerId);

    resizeRef.current = {
      noteId: note.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originW: note.w,
      originH: note.h
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const { startClientX, startClientY, originW, originH, noteId } = resizeRef.current;

    if (rafRef.current) return;

    const dx = e.clientX - startClientX;
    const dy = e.clientY - startClientY;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setNotes(prev => prev.map(n => {
        if (n.id !== noteId) return n;
        return {
          ...n,
          w: Math.max(200, originW + dx),
          h: Math.max(120, originH + dy)
        };
      }));
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const { noteId } = resizeRef.current;
    resizeRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (boardRef.current) boardRef.current.releasePointerCapture(e.pointerId);

    const target = notes.find(n => n.id === noteId);
    if (target) {
      updateNote(noteId, { w: target.w, h: target.h });
    }
  };

  // Keyboard
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNote();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createNote]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <BoardWrapper
        ref={boardRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Toolbar>
          <PrimaryButton type="button" onClick={createNote}>
            <i className="fa-solid fa-plus" />
            새 메모
          </PrimaryButton>

          <ToolbarDivider />

          <ToolbarField>
            <i className="fa-solid fa-magnifying-glass" style={{ opacity: 0.5 }} />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="메모 검색..."
            />
          </ToolbarField>

          <ToolbarDivider />

          {/* Color filter as inline dots */}
          <ColorFilterGroup aria-label="색상 카테고리">
            <ColorFilterAll
              type="button"
              $active={colorFilter === 'all'}
              title="전체 색상"
              onClick={() => setColorFilter('all')}
            />
            {TAG_COLOR_ORDER.map((c) => (
              <ColorDot
                key={c}
                type="button"
                $color={c}
                $active={colorFilter === c}
                title={c}
                onClick={() => setColorFilter(c)}
                style={{ width: 20, height: 20 }}
              />
            ))}
          </ColorFilterGroup>

          <ToolbarDivider />

          <ToolbarSelect>
            <i className="fa-solid fa-arrow-down-wide-short" style={{ opacity: 0.5 }} />
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="updated_desc">최근 수정</option>
              <option value="created_desc">최근 생성</option>
            </select>
          </ToolbarSelect>

          <PrimaryButton type="button" onClick={autoArrange} title="메모를 겹치지 않게 자동 정렬">
            <i className="fa-solid fa-table-cells-large" />
            정렬
          </PrimaryButton>

          <ToolbarDivider />

          <ToolbarChip
            type="button"
            onClick={() => setPinnedOnly((prev) => !prev)}
            $active={pinnedOnly}
            disabled={pinnedCount === 0}
            title="상단 고정 메모만 보기"
          >
            <i className="fa-solid fa-thumbtack" />
            고정 {pinnedCount}
          </ToolbarChip>

          <ToolbarChip
            type="button"
            onClick={allCollapsed ? expandAll : collapseAll}
            $active={allCollapsed}
            title={allCollapsed ? '모두 펼치기' : '모두 접기'}
          >
            <i className={`fa-solid ${allCollapsed ? 'fa-expand' : 'fa-compress'}`} />
            {allCollapsed ? '펼치기' : '접기'}
          </ToolbarChip>

          <MetaInfo>
            <span>{currentUser ? `계정: ${currentUser.email ?? '로그인됨'}` : '게스트 모드(로컬 저장)'}</span>
            <span>총 {notes.length}개</span>
            <span>표시 {filteredNotes.length}개</span>
            <span>Ctrl/⌘+N</span>
            {storageError && <ErrorBadge title={storageError}>{storageError}</ErrorBadge>}
          </MetaInfo>
        </Toolbar>

        <Viewport ref={viewportRef} data-sticky-viewport data-mobile-board={isMobileBoard ? 'true' : undefined}>
          {notes.length === 0 && (
            <EmptyState>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-main)' }}>메모가 없습니다</div>
              <div style={{ maxWidth: '520px', fontSize: '0.88rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
                상단의 &apos;새 메모&apos; 버튼 또는 Ctrl/⌘+N으로 빠르게 메모를 추가하세요.
              </div>
              <PrimaryButton type="button" onClick={createNote}>
                <i className="fa-solid fa-plus" />
                새 메모 만들기
              </PrimaryButton>
            </EmptyState>
          )}

          {notes.length > 0 && filteredNotes.length === 0 && (
            <EmptyState>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-main)' }}>조건에 맞는 메모가 없습니다</div>
              <div style={{ maxWidth: '520px', fontSize: '0.88rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
                검색어/색상 설정으로 인해 표시할 메모가 없습니다. 필터를 초기화하세요.
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <PrimaryButton type="button" onClick={resetFilters}>
                  <i className="fa-solid fa-rotate-left" />
                  필터 초기화
                </PrimaryButton>
              </div>
            </EmptyState>
          )}
          {isMobileBoard && filteredNotes.length > 0 ? (
            <MobileNotesList>
              {filteredNotes.map((note) => (
                <StickyNoteCard
                  key={note.id}
                  note={note}
                  isCollapsed={collapsedIds.has(note.id)}
                  isMobileLayout
                  onToggleCollapse={toggleCollapse}
                  onSelect={() => bringToFront(note.id)}
                  onResizeStart={(e) => startResize(note, e)}
                  onChangeContent={(content) => updateNote(note.id, { content })}
                  onChangeColor={(color) => updateNote(note.id, { color })}
                  onTogglePin={() => updateNote(note.id, { isPinned: !note.isPinned })}
                  onDelete={() => deleteNote(note.id)}
                />
              ))}
            </MobileNotesList>
          ) : (
            <Canvas width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
              {filteredNotes.map((note) => (
                <StickyNoteCard
                  key={note.id}
                  note={note}
                  isCollapsed={collapsedIds.has(note.id)}
                  onToggleCollapse={toggleCollapse}
                  onSelect={() => bringToFront(note.id)}
                  onResizeStart={(e) => startResize(note, e)}
                  onChangeContent={(content) => updateNote(note.id, { content })}
                  onChangeColor={(color) => updateNote(note.id, { color })}
                  onTogglePin={() => updateNote(note.id, { isPinned: !note.isPinned })}
                  onDelete={() => deleteNote(note.id)}
                />
              ))}
            </Canvas>
          )}
        </Viewport>
      </BoardWrapper>
    </DndContext>
  );
}
