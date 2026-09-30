'use client';

import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Bell, CheckSquare, Copy, Files, MessageSquare, Pin, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { MemoChecklistItem, StickyNote } from '@/types/stickyNote';
import { createId, uniqueTags } from '@/utils/stickyNoteUtils';
import { checklistContent, MAX_MEMO_LENGTH, splitMemo, toChecklist } from '@/utils/smartMemo';
import * as S from './SmartMemo.styles';
import MemoReminderSettings from './MemoReminderSettings';

type Props = {
  note: StickyNote;
  storageError: string | null;
  flushNote: (id: string) => Promise<void>;
  onUpdate: (id: string, patch: Partial<StickyNote>) => void;
  onDelete: (notes: StickyNote[]) => void;
  onDuplicate: (note: StickyNote) => void;
  onBack: () => void;
};

export default function SmartMemoEditor({ note, storageError, flushNote, onUpdate, onDelete, onDuplicate, onBack }: Props) {
  const { title, body } = splitMemo(note.content);
  const [tag, setTag] = useState('');
  const [commentItem, setCommentItem] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [reminderOpen, setReminderOpen] = useState(false);
  const items = note.checklistItems ?? [];
  const isChecklist = note.memoType === 'checklist';
  const patch = (value: Partial<StickyNote>) => onUpdate(note.id, value);
  const updateItems = (next: MemoChecklistItem[]) => {
    const content = checklistContent(title, next);
    if (content.length > Math.max(MAX_MEMO_LENGTH, note.content.length)) {
      toast.error('메모는 4,000자까지 입력할 수 있습니다.'); return;
    }
    patch({ memoType: 'checklist', checklistItems: next, content });
  };
  const addItem = (index: number) => {
    const id = createId();
    const next = [...items];
    next.splice(index, 0, { id, text: '', isChecked: false, comments: [] });
    updateItems(next);
    requestAnimationFrame(() => document.getElementById(`memo-check-${id}`)?.focus());
  };
  const moveItem = (index: number, direction: number) => {
    const next = [...items];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    updateItems(next);
  };
  const convertType = () => {
    if (isChecklist) { patch({ memoType: 'text' }); return; }
    const next = toChecklist(note, createId);
    if ((next.content?.length ?? 0) > Math.max(MAX_MEMO_LENGTH, note.content.length)) {
      toast.error('체크 표시를 넣을 공간이 부족합니다. 내용을 조금 줄여주세요.'); return;
    }
    patch(next);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(note.content); toast.success('메모를 복사했습니다.'); }
    catch { toast.error('복사하지 못했습니다. 내용을 선택해 복사해주세요.'); }
  };

  return <S.Editor data-smart-memo-editor data-note-id={note.id}>
    <S.EditorHeader>
      <S.BackButton type="button" onClick={onBack}><ArrowLeft size={16} />메모 목록</S.BackButton>
      <small role="status">{storageError ? '저장 상태를 확인해주세요' : '이 기기에 자동 저장'} · {isChecklist ? '체크리스트' : '일반 메모'}</small>
      <S.Button type="button" aria-label="상단 고정" aria-pressed={note.isPinned} onClick={() => patch({ isPinned: !note.isPinned })}><Pin size={16} /></S.Button>
      <S.Button type="button" aria-label="메모 복사" title="내용 복사" onClick={() => void copy()}><Copy size={16} /></S.Button>
      <S.Button type="button" aria-label="메모 복제" title="메모 복제" onClick={() => onDuplicate(note)}><Files size={16} /></S.Button>
      <S.Button $danger type="button" aria-label="메모 삭제" onClick={() => onDelete([note])}><Trash2 size={16} /></S.Button>
    </S.EditorHeader>
    <S.Title aria-label="메모 제목" placeholder="제목 없는 메모" value={title}
      maxLength={Math.max(title.length, MAX_MEMO_LENGTH - body.length - 1)}
      onChange={event => patch({ content: `${event.target.value}\n${body}`, ...(isChecklist ? { memoType: 'checklist' as const } : {}) })} />
    <S.Meta>
      <S.Button type="button" onClick={convertType} aria-label={isChecklist ? '일반 메모로 전환' : '체크리스트로 전환'}><CheckSquare size={16} />{isChecklist ? '일반 메모로' : '체크리스트로'}</S.Button>
      <label>색상<select aria-label="메모 색상" value={note.color} onChange={event => patch({ color: event.target.value as StickyNote['color'] })}>
        {Object.keys(S.COLORS).map((color, i) => <option key={color} value={color}>{['노랑', '라임', '하늘', '로즈', '보라', '회색'][i]}</option>)}
      </select></label>
      <label>중요도<select aria-label="메모 중요도" value={note.priority ?? 'medium'} onChange={event => patch({ priority: event.target.value as StickyNote['priority'] })}>
        <option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option>
      </select></label>
      <S.Button type="button" aria-expanded={reminderOpen} onClick={() => setReminderOpen(!reminderOpen)}><Bell size={16} />{note.reminderAt ? '알림 설정됨' : '알림'}</S.Button>
    </S.Meta>
    <S.Tags aria-label="메모 카테고리">
      {note.tags.map(value => <S.Button type="button" key={value} aria-label={`${value} 분류 해제`} onClick={() => patch({ tags: note.tags.filter(item => item !== value) })}>{value}<X size={13} /></S.Button>)}
      <form onSubmit={event => { event.preventDefault(); if (!tag.trim()) return; patch({ tags: uniqueTags([...note.tags, tag]).slice(0, 20) }); setTag(''); }}>
        <input aria-label="카테고리 이름" placeholder="카테고리 추가" value={tag} maxLength={40} onChange={event => setTag(event.target.value)} />
        <S.Button type="submit" aria-label="카테고리 추가" disabled={!tag.trim() || note.tags.length >= 20}><Plus size={16} /></S.Button>
      </form>
    </S.Tags>
    {reminderOpen && <MemoReminderSettings note={note} flushNote={flushNote} onUpdate={onUpdate} />}
    {isChecklist ? <S.Checklist aria-label="메모 체크리스트">
      <p>{items.filter(item => item.isChecked).length} / {items.length} 완료</p>
      <progress aria-label="체크리스트 진행률" value={items.filter(item => item.isChecked).length} max={Math.max(1, items.length)} />
      {items.map((item, index) => <div key={item.id}>
        <S.CheckRow>
          <input type="checkbox" aria-label={`항목 ${index + 1} 완료`} checked={item.isChecked} onChange={() => updateItems(items.map(value => value.id === item.id ? { ...value, isChecked: !value.isChecked } : value))} />
          <input type="text" id={`memo-check-${item.id}`} aria-label={`체크 항목 ${index + 1}`} value={item.text} placeholder="할 일을 입력하세요" maxLength={4000}
            style={item.isChecked ? { textDecoration: 'line-through', color: 'var(--text-muted)' } : undefined}
            onChange={event => updateItems(items.map(value => value.id === item.id ? { ...value, text: event.target.value } : value))}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === 'Enter') { event.preventDefault(); addItem(index + 1); }
              if (event.key === 'Backspace' && !item.text && !(item.comments?.length)) {
                event.preventDefault(); updateItems(items.filter(value => value.id !== item.id));
                requestAnimationFrame(() => document.getElementById(`memo-check-${items[Math.max(0, index - 1)]?.id}`)?.focus());
              }
            }} />
          <S.Button type="button" aria-label={`항목 ${index + 1} 위로`} disabled={index === 0} onClick={() => moveItem(index, -1)}><ArrowUp size={14} /></S.Button>
          <S.Button type="button" aria-label={`항목 ${index + 1} 아래로`} disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}><ArrowDown size={14} /></S.Button>
          <S.Button type="button" aria-label={`항목 ${index + 1} 댓글`} aria-expanded={commentItem === item.id} onClick={() => { setCommentItem(commentItem === item.id ? null : item.id); setComment(''); }}><MessageSquare size={14} /></S.Button>
          <S.Button type="button" aria-label={`항목 ${index + 1} 삭제`} onClick={() => updateItems(items.filter(value => value.id !== item.id))}><X size={14} /></S.Button>
        </S.CheckRow>
        {(item.comments?.length > 0 || commentItem === item.id) && <S.CommentArea>
          {(item.comments ?? []).map(value => <p key={value.id}><span>{value.text}</span><S.Button type="button" aria-label="댓글 삭제" onClick={() => updateItems(items.map(row => row.id === item.id ? { ...row, comments: row.comments.filter(entry => entry.id !== value.id) } : row))}><X size={13} /></S.Button></p>)}
          {commentItem === item.id && <form onSubmit={event => { event.preventDefault(); if (!comment.trim()) return; updateItems(items.map(row => row.id === item.id ? { ...row, comments: [...row.comments, { id: createId(), text: comment.trim(), createdAt: Date.now() }] } : row)); setComment(''); }}>
            <input aria-label="체크 항목 댓글" value={comment} maxLength={1000} placeholder="항목에 대한 메모" onChange={event => setComment(event.target.value)} />
            <S.Button type="submit" disabled={!comment.trim()}>추가</S.Button>
          </form>}
        </S.CommentArea>}
      </div>)}
      <S.Button type="button" onClick={() => addItem(items.length)}><Plus size={16} />항목 추가</S.Button>
    </S.Checklist> : <S.Content aria-label="메모 내용" placeholder="떠오른 생각을 자유롭게 적어보세요." value={body}
      maxLength={Math.max(body.length, MAX_MEMO_LENGTH - title.length - 1)} onChange={event => patch({ content: `${title}\n${event.target.value}` })} />}
    <S.EditorHeader><small>{note.content.length.toLocaleString('ko-KR')} / {MAX_MEMO_LENGTH.toLocaleString('ko-KR')}자 · {new Date(note.updatedAt).toLocaleString('ko-KR')} 수정</small></S.EditorHeader>
  </S.Editor>;
}
