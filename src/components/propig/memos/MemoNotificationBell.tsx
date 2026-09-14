'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import styled from 'styled-components';
import { readAllMemoNotifications, readMemoNotification, subscribeMemoNotifications, type MemoNotification } from '@/services/memoReminderService';

export default function MemoNotificationBell({ uid }: { uid: string }) {
  const [items, setItems] = useState<MemoNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [marking, setMarking] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const unread = items.filter(item => !item.readAt).length;
  useEffect(() => subscribeMemoNotifications(uid, values => { setItems(values); setLoaded(true); setError(''); }, () => setError('알림을 불러오지 못했습니다. 다시 시도해주세요.')), [uid, retry]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const readAll = async () => {
    if (marking) return;
    setMarking(true);
    try { await readAllMemoNotifications(uid, items); setError(''); }
    catch { setError('읽음 표시를 저장하지 못했습니다. 다시 시도해주세요.'); }
    finally { setMarking(false); }
  };
  return <Container ref={root}>
    <button ref={trigger} type="button" className="toggle-btn" aria-label={`메모 알림함${unread ? `, 읽지 않은 알림 ${unread}개` : ''}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <Bell size={19} aria-hidden="true" />{unread > 0 && <Badge aria-hidden="true">{unread > 9 ? '9+' : unread}</Badge>}
    </button>
    {open && <Panel id={id} aria-label="메모 알림함">
      <div className="inbox-heading"><strong>메모 알림</strong><button type="button" aria-label="알림함 닫기" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={18} /></button></div>
      <div className="inbox-summary"><span>최근 알림 50개 · 읽지 않음 {unread}</span><button type="button" disabled={!unread || marking} onClick={() => void readAll()}>{marking ? '저장 중…' : '모두 읽음'}</button></div>
      {error && <p role="alert">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>다시 시도</button></p>}
      {!loaded && !error && <p role="status">알림을 불러오는 중…</p>}
      {loaded && !items.length && <p>도착한 알림이 없습니다.<br />메모에서 알림 날짜와 반복 주기를 설정해보세요.</p>}
      <ul>{items.map(item => <li key={item.id} data-unread={!item.readAt}>
        <Link href={`/propig/memos?memoId=${encodeURIComponent(item.memoId)}`} onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          if (!window.dispatchEvent(new CustomEvent('propig:before-navigation', { cancelable: true, detail: { href: `/propig/memos?memoId=${encodeURIComponent(item.memoId)}` } }))) { event.preventDefault(); return; }
          void readMemoNotification(uid, item.id).catch(() => setError('읽음 표시를 저장하지 못했습니다.'));
          if (window.location.pathname.replace(/\/$/, '') === '/propig/memos') {
            event.preventDefault();
            window.history.pushState(null, '', `/propig/memos?memoId=${encodeURIComponent(item.memoId)}`);
            window.dispatchEvent(new Event('propig:open-memo'));
          }
          setOpen(false);
        }}>
          <strong>{!item.readAt && <span className="unread-dot" aria-label="읽지 않음" />}{item.title}</strong>
          <time dateTime={new Date(item.scheduledAt).toISOString()}>{new Date(item.scheduledAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 한국 시간</time>
        </Link>
      </li>)}</ul>
    </Panel>}
  </Container>;
}

const Container = styled.div`
  position: relative; flex-shrink: 0;
  > button { position: relative; display: inline-flex; align-items: center; justify-content: center; }
`;
const Badge = styled.span`
  position: absolute; top: -2px; right: -3px; min-width: 17px; height: 17px; padding: 0 3px;
  background: #b42318; color: white; border-radius: 9px; font-size: 10px; line-height: 17px;
`;
const Panel = styled.section`
  position: absolute; top: calc(100% + 12px); right: 0; width: min(360px, calc(100vw - 24px));
  max-height: min(540px, calc(100dvh - 100px)); overflow-y: auto; overscroll-behavior: contain;
  border: 1px solid var(--border-color); border-radius: 14px; background: var(--bg-card, #fff);
  color: var(--text-primary); box-shadow: 0 12px 36px rgba(0,0,0,.14); z-index: 1200;
  .inbox-heading, .inbox-summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; }
  .inbox-heading { border-bottom: 1px solid var(--border-color); }
  .inbox-summary { font-size: 12px; }
  button { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 6px; border-radius: 6px; }
  button:disabled { opacity: .55; cursor: default; }
  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent-primary, #335dce); outline-offset: -2px; }
  p { margin: 0; padding: 20px 16px; font-size: 13px; line-height: 1.7; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { border-top: 1px solid var(--border-color); }
  li[data-unread='true'] { background: var(--bg-tertiary, #f3f6fa); }
  a { display: grid; gap: 7px; padding: 14px 16px; color: inherit; text-decoration: none; }
  a:hover { background: var(--bg-hover, #edf0f4); }
  strong { font-size: 14px; overflow-wrap: anywhere; }
  time { font-size: 12px; }
  .unread-dot { display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: #335dce; }
  @media (max-width: 640px) { position: fixed; top: 72px; right: 12px; }
`;
