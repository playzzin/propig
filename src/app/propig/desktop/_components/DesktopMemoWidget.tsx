'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Check, PenLine, Pin, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { saveStickyNoteText, startStickyNoteText, subscribeStickyNotes } from '@/hooks/useStickyNotes';
import type { StickyNote } from '@/types/stickyNote';
import { MAX_MEMO_LENGTH, splitMemo } from '@/utils/smartMemo';
import { applyPinnedAndSort } from '@/utils/stickyNoteUtils';
import styles from './DesktopMemoWidget.module.css';

type Snapshot = { notes: StickyNote[]; status: 'loading' | 'cached' | 'ready' | 'error' };
type Draft = ReturnType<typeof startStickyNoteText>;
type SaveFeedback = { text: string; error: boolean };

const RECENT_LIMIT = 8;

export default function DesktopMemoWidget() {
  const { currentUser } = useAuth();
  return currentUser
    ? <MemoWidgetAccount key={currentUser.uid} uid={currentUser.uid} />
    : <div className={styles.message} role="status">ProPig 계정을 확인하는 중입니다.</div>;
}

function MemoWidgetAccount({ uid }: { uid: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ notes: [], status: 'loading' });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const pendingSave = useRef<Promise<void> | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const editingId = draft?.id;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const fail = () => {
      if (active) setSnapshot(previous => ({ ...previous, status: 'error' }));
    };
    try {
      unsubscribe = subscribeStickyNotes(uid, (notes, fromCache) => {
        if (active) setSnapshot({ notes, status: fromCache ? 'cached' : 'ready' });
      }, fail);
    } catch {
      queueMicrotask(fail);
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [uid, loadAttempt]);

  useEffect(() => {
    if (editingId) editor.current?.focus();
  }, [editingId]);

  const ready = snapshot.status === 'ready';
  const visibleNotes = snapshot.notes.filter(note => !note.isArchived);
  const pinnedNotes = visibleNotes.filter(note => note.isPinned);
  const recentNotes = applyPinnedAndSort(visibleNotes.filter(note => !note.isPinned), 'updated_desc').slice(0, RECENT_LIMIT);
  const notes = [...applyPinnedAndSort(pinnedNotes, 'updated_desc'), ...recentNotes];
  const maxLength = Math.max(MAX_MEMO_LENGTH, draft?.previousContent?.length ?? 0);
  const canSave = ready && !saving && !!draft
    && (draft.previousContent === undefined ? !!draft.content.trim() : draft.content !== draft.previousContent);

  const closeEditor = () => {
    setDraft(null);
    requestAnimationFrame(() => newButton.current?.focus());
  };

  const chooseNote = (note: StickyNote) => {
    setFeedback(null);
    setDraft({ id: note.id, content: note.content, previousContent: note.content });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !canSave || pendingSave.current) return;
    setSaving(true);
    setFeedback(null);
    const write = saveStickyNoteText(uid, draft);
    pendingSave.current = write;
    try {
      await write;
      closeEditor();
      setFeedback({ text: '메모를 저장했어요.', error: false });
    } catch (error) {
      const text = error instanceof Error && error.name !== 'FirebaseError'
        ? error.message
        : '메모를 저장하지 못했어요. 연결을 확인한 뒤 다시 저장해 주세요.';
      setFeedback({ text, error: true });
    } finally {
      pendingSave.current = null;
      setSaving(false);
    }
  };

  const editorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || saving) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setFeedback(null);
      closeEditor();
    }
  };

  return (
    <main className={styles.widget} aria-label="메모 위젯">
      <header className={styles.heading}>
        <h1>메모</h1>
        <button
          className={styles.primary}
          type="button"
          ref={newButton}
          disabled={!ready || !!draft}
          onClick={() => {
            setFeedback(null);
            setDraft(startStickyNoteText(snapshot.notes));
          }}
        >
          <Plus size={17} aria-hidden="true" /> 새 메모
        </button>
      </header>

      {draft ? (
        <form className={styles.composer} onSubmit={submit} aria-busy={saving}>
          <label htmlFor="desktop-memo-text">{draft.previousContent === undefined ? '새 메모 내용' : '메모 내용 편집'}</label>
          <textarea
            id="desktop-memo-text"
            ref={editor}
            value={draft.content}
            maxLength={maxLength}
            readOnly={saving}
            onKeyDown={editorKeyDown}
            onChange={event => {
              setFeedback(null);
              setDraft({ ...draft, content: event.target.value });
            }}
            rows={4}
            placeholder="첫 줄에 제목을 쓰고 아래에 내용을 적어 보세요."
          />
          <div className={styles.formActions}>
            <button className={styles.secondary} type="button" disabled={saving} onClick={() => {
              setFeedback(null);
              closeEditor();
            }}>취소</button>
            <button className={styles.primary} type="submit" disabled={!canSave} aria-keyshortcuts="Control+Enter">
              <Check size={16} aria-hidden="true" /> {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      ) : null}

      {feedback ? <p className={styles.message} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p> : null}
      {snapshot.status === 'loading' || snapshot.status === 'cached' ? (
        <p className={styles.message} role="status">{snapshot.status === 'loading' ? '메모를 불러오는 중입니다.' : '계정과 동기화를 기다리고 있습니다.'}</p>
      ) : null}
      {snapshot.status === 'error' ? (
        <div className={styles.message} role="alert">
          <p>메모를 불러오지 못했습니다.</p>
          <button className={styles.secondary} type="button" onClick={() => {
            setSnapshot(previous => ({ ...previous, status: 'loading' }));
            setLoadAttempt(previous => previous + 1);
          }}><RefreshCw size={15} aria-hidden="true" /> 다시 불러오기</button>
        </div>
      ) : null}
      {ready && notes.length === 0 ? <p className={styles.message}>아직 메모가 없어요.</p> : null}

      {notes.length > 0 ? (
        <ul className={styles.notes} aria-label="고정 및 최근 메모">
          {notes.map(note => {
            const { title, body } = splitMemo(note.content);
            const checklist = note.memoType === 'checklist';
            const checklistItems = note.checklistItems ?? [];
            return (
              <li key={note.id} className={styles.note} data-color={note.color}>
                <div className={styles.noteDetails}>
                  <strong className={styles.noteTitle}>
                    {note.isPinned ? <Pin size={13} aria-label="고정됨" /> : null}
                    <span>{title.trim() || '제목 없는 메모'}</span>
                  </strong>
                  {checklist ? (
                    <p>{checklistItems.filter(item => item.isChecked).length}/{checklistItems.length} 완료 · 본창에서 편집</p>
                  ) : (
                    <p>{body.trim() || '내용 없음'}</p>
                  )}
                </div>
                {checklist ? null : (
                  <button
                    className={styles.edit}
                    type="button"
                    disabled={!ready || !!draft}
                    aria-label={`${title.trim() || '제목 없는 메모'} 편집`}
                    onClick={() => chooseNote(note)}
                  >
                    <PenLine size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
