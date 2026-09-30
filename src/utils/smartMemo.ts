import type { StickyNote, MemoChecklistItem } from '../types/stickyNote';
import { normalizeTagKey } from './stickyNoteUtils';

export const MAX_MEMO_LENGTH = 4000;
export type SmartMemoSort = 'updated_desc' | 'created_desc' | 'title_asc';

export function splitMemo(content: string) {
  const [title = '', ...body] = content.replace(/\r\n/g, '\n').split('\n');
  return { title, body: body.join('\n') };
}

export function checklistContent(title: string, items: MemoChecklistItem[]) {
  return [title, ...items.map(item => `${item.isChecked ? '[x]' : '[ ]'} ${item.text}`)].join('\n');
}

export function toChecklist(note: StickyNote, makeId: () => string): Partial<StickyNote> {
  const { title, body } = splitMemo(note.content);
  const previous = [...(note.checklistItems ?? [])];
  const items = body.split('\n').filter(line => line.trim()).map(line => {
    const text = line.replace(/^\s*(?:[-*]\s+)?\[[ xX]\]\s*/, '');
    const oldIndex = previous.findIndex(item => item.text === text);
    const old = oldIndex >= 0 ? previous.splice(oldIndex, 1)[0] : undefined;
    return { id: old?.id ?? makeId(), text, isChecked: /^\s*(?:[-*]\s+)?\[[xX]\]/.test(line), comments: old?.comments ?? [] };
  });
  // Keep commented items visible even if their text was removed in a legacy editor.
  items.push(...previous.filter(item => item.comments.length > 0));
  return { memoType: 'checklist', checklistItems: items, content: checklistContent(title, items) };
}

export function hasMemoCategory(note: StickyNote, category: string) {
  return note.tags.some(tag => normalizeTagKey(tag) === normalizeTagKey(category));
}

export function filterSmartMemos(notes: StickyNote[], query: string, category: string, type: string, pinned: boolean, sort: SmartMemoSort) {
  const search = query.trim().toLocaleLowerCase();
  return notes.filter(note => {
    if (pinned && !note.isPinned) return false;
    if (category === '__unfiled' ? note.tags.length > 0 : category && !hasMemoCategory(note, category)) return false;
    if (type !== 'all' && (note.memoType ?? 'text') !== type) return false;
    return !search || [note.content, ...note.tags, ...(note.checklistItems ?? []).flatMap(item => (item.comments ?? []).map(comment => comment.text))].join('\n').toLocaleLowerCase().includes(search);
  }).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || (sort === 'title_asc'
    ? splitMemo(a.content).title.localeCompare(splitMemo(b.content).title, 'ko')
    : sort === 'created_desc' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
}

// Legacy editors only know content. A plain-text edit must not leave an active,
// stale checklist that would overwrite the new text when the smart editor opens.
export function normalizeSmartMemoPatch(note: StickyNote, patch: Partial<StickyNote>): Partial<StickyNote> {
  if (patch.content !== undefined && patch.content !== note.content && note.memoType === 'checklist' && patch.memoType === undefined && patch.checklistItems === undefined) {
    return { ...patch, memoType: 'text' };
  }
  return patch;
}

export function isReminderDue(note: StickyNote, now: number) {
  return typeof note.reminderAt === 'number' && note.reminderAt <= now && (note.reminderAcknowledgedAt ?? 0) < note.reminderAt;
}
