'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckSquare, FileText, FolderPlus, Pin, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { useStickyNotes } from '@/hooks/useStickyNotes';
import type { StickyNote } from '@/types/stickyNote';
import { createId, normalizeTagKey, uniqueTags } from '@/utils/stickyNoteUtils';
import { filterSmartMemos, hasMemoCategory, isReminderDue, MAX_MEMO_LENGTH, splitMemo, type SmartMemoSort } from '@/utils/smartMemo';
import SmartMemoEditor from './SmartMemoEditor';
import * as S from './SmartMemo.styles';

const Preferences = z.object({ sort: z.enum(['updated_desc', 'created_desc', 'title_asc']).default('updated_desc'), categories: z.array(z.string().max(40)).default([]) });

export default function SmartMemoWorkspace() {
  const { currentUser } = useAuth();
  return <MemoSession key={currentUser?.uid ?? 'anonymous'} owner={currentUser?.uid ?? 'anonymous'} />;
}

function MemoSession({ owner }: { owner: string }) {
  const { notes, storageError, createNote, updateNote, deleteNote, restoreNote, flushNote } = useStickyNotes();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileEditing, setMobileEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('all');
  const [color, setColor] = useState('all');
  const [pinned, setPinned] = useState(false);
  const [sort, setSort] = useState<SmartMemoSort>('updated_desc');
  const [quick, setQuick] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<StickyNote[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [manageCategories, setManageCategories] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  const prefsKey = `propig-smart-memo:v1:${owner}`;
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  useEffect(() => {
    const task = window.setTimeout(() => {
      try {
        const parsed = Preferences.safeParse(JSON.parse(localStorage.getItem(prefsKey) ?? '{}'));
        if (parsed.success) { setSort(parsed.data.sort); setCategories(parsed.data.categories); }
      } catch { /* Optional view preferences do not block editing. */ }
      setPreferencesLoaded(true);
      const memoId = new URLSearchParams(window.location.search).get('memoId');
      if (memoId) { setActiveId(memoId); setMobileEditing(true); }
    }, 0);
    return () => clearTimeout(task);
  }, [prefsKey]);
  useEffect(() => {
    const openMemo = () => {
      const id = new URLSearchParams(window.location.search).get('memoId');
      if (id) { setActiveId(id); setMobileEditing(true); setSearch(''); setCategory(''); setType('all'); setColor('all'); setPinned(false); }
    };
    window.addEventListener('propig:open-memo', openMemo);
    window.addEventListener('popstate', openMemo);
    return () => { window.removeEventListener('propig:open-memo', openMemo); window.removeEventListener('popstate', openMemo); };
  }, []);
  useEffect(() => {
    if (!preferencesLoaded) return;
    try { localStorage.setItem(prefsKey, JSON.stringify({ sort, categories })); } catch { /* Notes have their own visible storage error. */ }
  }, [categories, sort, prefsKey, preferencesLoaded]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const allCategories = useMemo(() => uniqueTags([...categories, ...notes.flatMap(note => note.tags)]).sort((a, b) => a.localeCompare(b, 'ko')), [categories, notes]);
  const visible = useMemo(() => filterSmartMemos(notes, search, category, type, pinned, sort).filter(note => color === 'all' || note.color === color), [notes, search, category, type, pinned, sort, color]);
  const activeNote = notes.find(note => note.id === activeId) ?? null;
  const due = notes.filter(note => isReminderDue(note, now));
  const selectedNotes = notes.filter(note => selected.has(note.id));
  const resetFilters = () => { setSearch(''); setCategory(''); setType('all'); setColor('all'); setPinned(false); };
  const selectNote = (id: string) => { setActiveId(id); setMobileEditing(true); };
  const create = (memoType: 'text' | 'checklist' = 'text', content = '') => {
    const id = createNote();
    updateNote(id, { content, memoType, ...(memoType === 'checklist' ? { checklistItems: [] } : {}), tags: category && category !== '__unfiled' ? [category] : [] });
    resetFilters(); selectNote(id);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="메모 제목"]')?.focus());
  };
  const createRef = useRef(create);
  useEffect(() => { createRef.current = create; });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); return; }
      if (event.key.toLowerCase() === 'n' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault(); createRef.current();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  const remove = (targets: StickyNote[]) => {
    setUndo(targets); targets.forEach(note => deleteNote(note.id));
    setSelected(new Set()); setMobileEditing(false);
    if (targets.some(note => note.id === activeId)) setActiveId(null);
  };
  const duplicate = (note: StickyNote) => {
    const id = createNote();
    const { title, body } = splitMemo(note.content);
    const content = `${title} (사본)\n${body}`;
    updateNote(id, { content: content.length <= MAX_MEMO_LENGTH ? content : note.content, tags: [...note.tags], color: note.color,
      memoType: note.memoType ?? 'text', checklistItems: (note.checklistItems ?? []).map(item => ({ ...item, id: createId(), comments: item.comments.map(entry => ({ ...entry, id: createId() })) })),
      priority: note.priority ?? 'medium', isPinned: false, reminderAt: null });
    resetFilters(); selectNote(id); toast.success('메모를 복제했습니다.');
  };
  const renameCategory = () => {
    const next = categoryDraft.trim().replace(/\s+/g, ' ');
    if (!category || category === '__unfiled' || !next || next === '__unfiled') return;
    notes.filter(note => hasMemoCategory(note, category)).forEach(note => updateNote(note.id, { tags: uniqueTags(note.tags.map(tag => normalizeTagKey(tag) === normalizeTagKey(category) ? next : tag)) }));
    setCategories(uniqueTags([...allCategories.filter(name => normalizeTagKey(name) !== normalizeTagKey(category)), next])); setCategory(next); setCategoryDraft('');
  };
  const removeCategory = () => {
    notes.filter(note => hasMemoCategory(note, category)).forEach(note => updateNote(note.id, { tags: note.tags.filter(tag => normalizeTagKey(tag) !== normalizeTagKey(category)) }));
    setCategories(allCategories.filter(name => normalizeTagKey(name) !== normalizeTagKey(category))); setCategory('');
    toast.success('분류를 해제했습니다. 메모 내용은 유지됩니다.');
  };

  return <S.Workspace aria-label="스마트 메모장" data-basic-memo-workspace $editing={mobileEditing && !!activeNote}>
    <S.Toolbar data-memo-controls>
      <S.Button $primary type="button" onClick={() => create()}><Plus size={17} />새 메모</S.Button>
      <S.Button type="button" onClick={() => create('checklist')}><CheckSquare size={17} />체크리스트</S.Button>
      <input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="제목, 내용, 카테고리 검색" aria-label="메모 검색" />
      <select value={sort} onChange={event => setSort(event.target.value as SmartMemoSort)} aria-label="메모 정렬"><option value="updated_desc">최근 수정순</option><option value="created_desc">최근 생성순</option><option value="title_asc">제목순</option></select>
      <S.Button type="button" aria-label="카테고리 관리" aria-expanded={manageCategories} onClick={() => setManageCategories(!manageCategories)}><FolderPlus size={17} />분류</S.Button>
    </S.Toolbar>
    <S.QuickForm data-memo-controls onSubmit={event => { event.preventDefault(); if (!quick.trim()) return; create('text', quick.trim()); setQuick(''); }}>
      <input aria-label="빠른 메모" placeholder="빠르게 적고 Enter로 저장" maxLength={MAX_MEMO_LENGTH} value={quick} onChange={event => setQuick(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }} />
      <S.Button type="submit" disabled={!quick.trim()}>추가</S.Button>
    </S.QuickForm>
    <S.FilterBar data-memo-controls aria-label="카테고리 필터">
      <S.Button type="button" aria-pressed={!category} onClick={() => setCategory('')}>전체 {notes.length}</S.Button>
      <S.Button type="button" aria-pressed={category === '__unfiled'} onClick={() => setCategory('__unfiled')}>미분류</S.Button>
      {allCategories.map(name => <S.Button key={name} type="button" aria-pressed={normalizeTagKey(category) === normalizeTagKey(name)} onClick={() => setCategory(name)}>{name} {notes.filter(note => hasMemoCategory(note, name)).length}</S.Button>)}
    </S.FilterBar>
    <S.Toolbar data-memo-controls>
      <S.Button type="button" aria-pressed={pinned} onClick={() => setPinned(!pinned)}><Pin size={15} />고정만</S.Button>
      <select aria-label="메모 유형 필터" value={type} onChange={event => setType(event.target.value)}><option value="all">모든 유형</option><option value="text">일반 메모</option><option value="checklist">체크리스트</option></select>
      <select aria-label="메모 색상 필터" value={color} onChange={event => setColor(event.target.value)}><option value="all">모든 색상</option>{Object.keys(S.COLORS).map((name, i) => <option key={name} value={name}>{['노랑', '라임', '하늘', '로즈', '보라', '회색'][i]}</option>)}</select>
      {(search || category || type !== 'all' || color !== 'all' || pinned) && <S.Button type="button" onClick={resetFilters} aria-label="필터 초기화"><RotateCcw size={15} /></S.Button>}
      <small aria-live="polite">{visible.length}개</small>
    </S.Toolbar>
    {manageCategories && <S.Notice data-memo-controls>
      <input aria-label="분류 이름" value={categoryDraft} maxLength={40} placeholder="새 분류 또는 변경할 이름" onChange={event => setCategoryDraft(event.target.value)} />
      <S.Button type="button" disabled={!categoryDraft.trim()} onClick={() => { const name = categoryDraft.trim().replace(/\s+/g, ' '); if (name === '__unfiled') return; setCategories(uniqueTags([...allCategories, name])); setCategory(name); setCategoryDraft(''); }}>분류 만들기</S.Button>
      {category && category !== '__unfiled' && <><S.Button type="button" disabled={!categoryDraft.trim()} onClick={renameCategory}>이름 변경</S.Button><S.Button type="button" onClick={removeCategory}>분류 삭제</S.Button></>}
    </S.Notice>}
    {selectedNotes.length > 0 && <S.Notice>
      <span>{selectedNotes.length}개 선택</span>
      <select aria-label="선택 메모 카테고리 이동" value="" onChange={event => { const value = event.target.value; if (!value) return; selectedNotes.forEach(note => updateNote(note.id, { tags: value === '__unfiled' ? [] : [value] })); setSelected(new Set()); }}>
        <option value="">분류 이동</option><option value="__unfiled">미분류</option>{allCategories.map(name => <option value={name} key={name}>{name}</option>)}
      </select>
      <S.Button $danger type="button" onClick={() => remove(selectedNotes)}><Trash2 size={15} />선택 삭제</S.Button>
      <S.Button type="button" onClick={() => setSelected(new Set())}>선택 해제</S.Button>
    </S.Notice>}
    {undo.length > 0 && <S.Notice role="status"><span>{undo.length}개 메모를 삭제했습니다.</span><S.Button type="button" onClick={() => { undo.forEach(restoreNote); selectNote(undo[0].id); resetFilters(); setUndo([]); }}><RotateCcw size={15} />삭제 되돌리기</S.Button><S.Button type="button" aria-label="삭제 안내 닫기" onClick={() => setUndo([])}><X size={15} /></S.Button></S.Notice>}
    {storageError && <S.Notice role="alert"><span>{storageError}</span></S.Notice>}
    {due.length > 0 && <S.Notice role="status"><Bell size={16} /><span>확인할 메모 알림 {due.length}개 · {splitMemo(due[0].content).title || '제목 없는 메모'}</span><S.Button type="button" onClick={() => { resetFilters(); selectNote(due[0].id); }}>메모 확인</S.Button><S.Button type="button" onClick={() => due.forEach(note => updateNote(note.id, { reminderAcknowledgedAt: Math.max(Date.now(), note.reminderAt ?? 0) }))}>알림 모두 확인</S.Button></S.Notice>}
    <S.Body $editing={mobileEditing && !!activeNote}>
      <S.List data-smart-memo-list data-basic-memo-list aria-label="메모 목록">
        {visible.length > 0 && <S.Button type="button" onClick={() => setSelected(current => visible.every(note => current.has(note.id)) ? new Set() : new Set(visible.map(note => note.id)))}>{visible.every(note => selected.has(note.id)) ? '전체 선택 해제' : '전체 선택'}</S.Button>}
        {visible.map(note => { const { title, body } = splitMemo(note.content); return <S.ListRow key={note.id} $active={note.id === activeId} $color={S.COLORS[note.color]} data-basic-memo-id={note.id}>
          <input type="checkbox" aria-label={`${title || '제목 없는 메모'} 선택`} checked={selected.has(note.id)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(note.id)) next.delete(note.id); else next.add(note.id); return next; })} />
          <button type="button" onClick={() => selectNote(note.id)} aria-label={`${title || '제목 없는 메모'} 열기`} aria-current={note.id === activeId ? 'true' : undefined}>
            <strong>{note.isPinned && <Pin size={12} aria-label="고정됨" />} {title || '제목 없는 메모'}</strong><p>{body || (note.memoType === 'checklist' ? '항목을 추가해보세요' : '내용 없음')}</p>
            <small>{note.memoType === 'checklist' && <span>완료 {(note.checklistItems ?? []).filter(item => item.isChecked).length}/{note.checklistItems?.length ?? 0}</span>}{note.priority === 'high' && <span>중요</span>}{note.tags.map(tag => <span key={tag}>#{tag}</span>)}<span>{new Date(note.updatedAt).toLocaleDateString('ko-KR')}</span></small>
          </button>
        </S.ListRow>; })}
        {!visible.length && <S.Empty><Search size={26} /><strong>{notes.length ? '조건에 맞는 메모가 없습니다' : '첫 메모를 남겨보세요'}</strong><p>{notes.length ? '필터를 바꾸거나 새 메모를 만들어보세요.' : '생각은 메모로, 할 일은 체크리스트로 정리하세요.'}</p>{notes.length > 0 && <S.Button type="button" onClick={resetFilters}>필터 초기화</S.Button>}</S.Empty>}
      </S.List>
      {activeNote ? <SmartMemoEditor key={activeNote.id} note={activeNote} storageError={storageError} flushNote={flushNote} onUpdate={updateNote} onDelete={remove} onDuplicate={duplicate} onBack={() => setMobileEditing(false)} />
        : <S.Editor data-smart-memo-editor><S.Empty><FileText size={34} /><strong>생각을 정리하는 나만의 메모장</strong><p>메모를 선택하거나 새로 만들어 바로 편집하세요.<br />Ctrl/⌘ + N 새 메모 · Ctrl/⌘ + K 검색</p><S.Button $primary type="button" onClick={() => create()}>새 메모 만들기</S.Button></S.Empty></S.Editor>}
    </S.Body>
  </S.Workspace>;
}
