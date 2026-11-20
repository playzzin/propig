'use client';

import { useEffect, useRef, useState } from 'react';
import type { StickyNote } from '@/types/stickyNote';
import { useAuth } from '@/contexts/AuthContext';
import { createId } from '@/utils/stickyNoteUtils';
import { reminderRepeatLabels, saveServerMemoReminder, subscribeMemoReminder, type MemoReminder, type ReminderRepeat } from '@/services/memoReminderService';
import * as S from './SmartMemo.styles';

// datetime-local is rendered in KST explicitly so repeats keep the same clock time.
const toInput = (at: number) => new Date(at + 9 * 3600000).toISOString().slice(0, 16);

export default function MemoReminderSettings({ note, flushNote, onUpdate }: {
  note: StickyNote; flushNote: (id: string) => Promise<void>; onUpdate: (id: string, patch: Partial<StickyNote>) => void;
}) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [reminder, setReminder] = useState<MemoReminder | null>(null);
  const [loaded, setLoaded] = useState(!uid);
  const [date, setDate] = useState(() => toInput(note.reminderAt && note.reminderAt > Date.now() ? note.reminderAt : Date.now() + 3600000));
  const [repeat, setRepeat] = useState<ReminderRepeat>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const edited = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!uid) return;
    return subscribeMemoReminder(uid, note.id, value => {
      setReminder(value); setLoaded(true); setError('');
      if (value && !edited.current) { if (value.nextAt) setDate(toInput(value.nextAt)); setRepeat(value.repeat); }
    }, () => { setError('서버 알림을 불러오지 못했습니다. 잠시 후 다시 열어주세요.'); });
  }, [uid, note.id]);

  const save = async (cancel: boolean) => {
    if (saving || !loaded) return;
    const at = cancel ? null : new Date(`${date}:00+09:00`).getTime();
    if (at !== null && (!Number.isFinite(at) || at <= Date.now() || at > Date.now() + 366 * 86400000)) {
      setError('현재부터 1년 이내의 미래 시간을 선택해주세요.'); return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      if (uid) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([flushNote(note.id), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('메모 동기화 대기 시간이 초과되었습니다.')), 15000); })]);
        } finally { clearTimeout(timeout); }
        await saveServerMemoReminder(uid, note.id, at, repeat, reminder?.revision ?? 0, createId());
        if (mounted.current) onUpdate(note.id, { reminderAt: null, reminderAcknowledgedAt: 0 });
      } else {
        onUpdate(note.id, { reminderAt: at, reminderAcknowledgedAt: 0 });
      }
      if (!mounted.current) return;
      edited.current = false;
      setMessage(cancel ? '알림을 해제했습니다.' : uid ? '서버에 알림을 예약했습니다.' : '이 기기에 알림을 저장했습니다.');
    } catch (failure) {
      if (!mounted.current) return;
      const code = (failure as { code?: string }).code;
      setError(code === 'functions/aborted' ? '다른 기기에서 변경되었습니다. 최신 설정을 확인한 뒤 다시 저장해주세요.' : '알림을 저장하지 못했습니다. 메모의 동기화와 연결 상태를 확인하고 다시 시도해주세요.');
    } finally { if (mounted.current) setSaving(false); }
  };

  return <S.Notice as="section" aria-label="메모 알림 설정">
    <span>{uid ? '메모장을 닫아도 상단 알림함에 도착합니다. 예약 시각부터 약 1분 안에 알려드려요.' : '로그인하면 서버 반복 알림을 사용할 수 있습니다. 비로그인 알림은 이 메모장을 열어 둔 동안 확인합니다.'}</span>
    {reminder && <span>서버 상태: {reminder.status === 'scheduled' ? `${toInput(reminder.nextAt!).replace('T', ' ')} · ${reminderRepeatLabels[reminder.repeat]}` : reminder.status === 'sent' ? '알림 발송 완료' : reminder.status === 'cancelled' ? '알림 해제됨' : '메모 또는 계정을 확인해주세요'}</span>}
    <form onSubmit={event => { event.preventDefault(); void save(false); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%', alignItems: 'center' }}>
      <label style={{ display: 'grid', gap: 4 }}>알림 날짜·시간 (한국 시간)
        <input type="datetime-local" aria-label="메모 알림 시간" value={date} disabled={saving} required onChange={event => { edited.current = true; setDate(event.target.value); }} />
      </label>
      {uid && <label style={{ display: 'grid', gap: 4 }}>반복 주기<select aria-label="알림 반복 주기" value={repeat} disabled={saving} onChange={event => { edited.current = true; setRepeat(event.target.value as ReminderRepeat); }}>
        {Object.entries(reminderRepeatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>}
      <S.Button type="submit" disabled={!loaded || saving}>{saving ? '저장 중…' : '알림 저장'}</S.Button>
      {(reminder?.status === 'scheduled' || note.reminderAt) && <S.Button type="button" disabled={!loaded || saving} onClick={() => void save(true)}>알림 해제</S.Button>}
    </form>
    {uid && <span>평일은 주말을 건너뛰고, 매월은 해당 날짜가 없으면 그달 마지막 날에 알립니다.</span>}
    {error && <span role="alert">{error}</span>}{message && <span role="status">{message}</span>}
  </S.Notice>;
}
