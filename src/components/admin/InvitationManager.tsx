'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useAdminUsersSession } from '@/app/admin/users/useAdminUsersController';
import {
  InvitationCard, InvitationFailure, InvitationShell, invitationError, invitationRoles,
  invitationSchema, invitationStatuses, invitationTokenSchema, useInvitationSdkSession, useInvitationTasks,
  type Invitation,
} from './InvitationAcceptance';

const pageSchema = z.object({ invitations: z.array(invitationSchema).max(200), nextCursor: z.string().min(1).max(4096).nullable() });
const issueSchema = z.object({ invitation: invitationSchema, token: invitationTokenSchema });
type Session = ReturnType<typeof useAdminUsersSession>;

export default function InvitationManager() {
  const session = useAdminUsersSession();
  const sdk = useInvitationSdkSession();
  return <InvitationShell id="content-area" data-client-ready={!session.loading && sdk !== 'server'}>
    <nav aria-label="관리자 탐색"><Link href="/admin">관리자 홈</Link><Link href="/admin/users">유저 관리</Link></nav>
    {session.loading || sdk === 'server' ? <p role="status">관리자 권한을 확인하고 있습니다.</p> :
      !session.currentUser ? <AdminLogin key={sdk} session={session} sdk={sdk} /> :
        !session.allowed || !session.isFullAdmin ? <InvitationCard><h1>전체 관리자 권한이 필요합니다</h1><p>초대 발급과 목록은 전체 관리자만 사용할 수 있습니다. 담당 관리자에게 문의해 주세요.</p></InvitationCard> :
          <ManagerContent key={`${session.sessionKey}:${sdk}`} uid={session.currentUser.uid} scope={`${session.sessionKey}:${sdk}`} />}
  </InvitationShell>;
}
function AdminLogin({ session, sdk }: { session: Session; sdk: string }) {
  const begin = useInvitationTasks(null, sdk);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function login() {
    if (lock.current || !session.isConfigured) return;
    lock.current = true;
    const task = begin();
    setBusy(true); setError('');
    try { await task.run(async () => { await session.loginWithGoogle(); }); }
    catch { if (task.isCurrent()) setError('로그인을 완료하지 못했습니다. 팝업과 계정을 확인한 뒤 다시 시도해 주세요.'); }
    finally { if (task.isCurrent()) { lock.current = false; setBusy(false); } }
  }
  return <InvitationCard><h1>로그인이 필요합니다</h1><p>초대를 관리하려면 전체 관리자 계정으로 로그인하세요.</p><button type="button" disabled={busy || !session.isConfigured} onClick={() => void login()}>Google로 로그인</button>{error && <p role="alert">{error}</p>}</InvitationCard>;
}
function ManagerContent({ uid, scope }: { uid: string; scope: string }) {
  const begin = useInvitationTasks(uid, scope);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<Invitation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const cursors = useRef(new Set<string>());
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Invitation['intendedRole']>('user');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState('');
  const linkRef = useRef<HTMLTextAreaElement>(null);
  const [copyNotice, setCopyNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);

  const load = useCallback(async (next: string | null = null) => {
    if (lock.current) return;
    lock.current = true;
    const task = begin();
    if (!task.isCurrent()) { lock.current = false; return; }
    setBusy(true); setError('');
    try {
      const payload = await task.request(`/api/admin/invitations${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, 'GET');
      const result = pageSchema.safeParse(payload);
      if (!result.success) throw new InvitationFailure('목록 응답 형식을 확인하지 못했습니다. 다시 불러오거나 관리자에게 문의해 주세요.');
      if (!task.isCurrent()) return;
      if (!next) cursors.current.clear();
      else cursors.current.add(next);
      const nextCursor = result.data.nextCursor;
      if (nextCursor && cursors.current.has(nextCursor)) throw new InvitationFailure('목록 페이지가 반복되어 추가 로딩을 중단했습니다. 목록을 새로고침해 주세요.');
      setItems(previous => [...new Map([...(next ? previous : []), ...result.data.invitations].map(item => [item.id, item])).values()]);
      setCursor(nextCursor); setLoaded(true);
      if (!next) setUncertain(false);
    } catch (failure) { if (task.isCurrent()) setError(invitationError(failure)); }
    finally { if (task.isCurrent()) { lock.current = false; setBusy(false); } }
  }, [begin]);
  useEffect(() => {
    let live = true;
    queueMicrotask(() => { if (live) void load(); });
    return () => { live = false; };
  }, [load]);

  async function mutate(action: 'create' | 'cancel' | 'reissue', item?: Invitation) {
    if (lock.current || uncertain) return;
    if (action !== 'create' && (!item || !window.confirm(action === 'cancel' ? `${item.email} 초대를 취소할까요? 기존 링크는 사용할 수 없습니다.` : `${item.email} 초대를 재발급할까요? 기존 링크는 무효가 되며 새 링크를 다시 전달해야 합니다.`))) return;
    lock.current = true;
    const task = begin();
    if (!task.isCurrent()) { lock.current = false; return; }
    // Preserve all editable values; a response must not overwrite newer input.
    const submittedEmail = email.trim().toLowerCase();
    const submittedRole = role;
    setBusy(true); setError(''); setNotice(''); setLink(''); setCopyNotice('');
    try {
      const payload = await task.request('/api/admin/invitations', action === 'create' ? 'POST' : 'PATCH', action === 'create' ?
        { email: submittedEmail, intendedRole: submittedRole } : { id: item!.id, action });
      const result = (action === 'cancel' ? z.object({ invitation: invitationSchema }) : issueSchema).safeParse(payload);
      if (!result.success) throw new InvitationFailure('변경 응답을 확인하지 못했습니다. 목록을 새로고침해 상태를 확인하세요. 링크를 잃었다면 재발급이 필요합니다.');
      const invitation = result.data.invitation;
      if ((item && invitation.id !== item.id) || (action === 'cancel' ? invitation.status !== 'cancelled' : invitation.status !== 'pending') ||
        (action === 'create' && (invitation.email.toLowerCase() !== submittedEmail || invitation.intendedRole !== submittedRole))) throw new InvitationFailure('요청과 응답이 일치하지 않습니다. 목록을 새로고침해 상태를 확인하세요.');
      if (!task.isCurrent()) return;
      setItems(previous => [invitation, ...previous.filter(row => row.id !== invitation.id)]);
      if ('token' in result.data) {
        const token = invitationTokenSchema.parse(result.data.token);
        setLink(`${window.location.origin}/invite#${new URLSearchParams({ id: invitation.id, token }).toString()}`);
        setNotice('새 링크를 발급했습니다. 이메일은 자동으로 발송되지 않습니다. 아래 링크를 복사해 초대받은 사람에게만 전달하세요.');
      } else setNotice('초대를 취소했습니다. 기존 링크는 사용할 수 없습니다.');
    } catch (failure) {
      if (task.isCurrent()) { setError(invitationError(failure)); setUncertain(true); }
    } finally { if (task.isCurrent()) { lock.current = false; setBusy(false); } }
  }
  async function copy() {
    const task = begin();
    const currentLink = link;
    try {
      await task.run(async () => { await navigator.clipboard.writeText(currentLink); });
      if (task.isCurrent() && linkRef.current?.value === currentLink) setCopyNotice('링크를 복사했습니다. 비공개로 전달하세요.');
    } catch {
      if (task.isCurrent() && linkRef.current?.value === currentLink) {
        setCopyNotice('자동 복사를 사용할 수 없습니다. 아래 링크를 선택해 직접 복사하세요.');
        linkRef.current?.focus(); linkRef.current?.select();
      }
    }
  }
  return <>
    <h1>온보딩 초대 관리</h1>
    <p>이메일로 가입 대상자를 초대하고 수락 여부를 확인합니다. 팀 공간 생성이나 권한 자동 부여 기능이 아닙니다.</p>
    <InvitationCard aria-labelledby="invitation-create-title">
      <h2 id="invitation-create-title">초대 링크 발급</h2>
      <form onSubmit={event => { event.preventDefault(); void mutate('create'); }}>
        <label htmlFor="invitation-email">초대받을 이메일<input id="invitation-email" type="email" required maxLength={254} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label htmlFor="invitation-role">검토 요청 역할<select id="invitation-role" value={role} onChange={event => setRole(event.target.value as Invitation['intendedRole'])}>{Object.entries(invitationRoles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <small>유효기간은 기본 7일입니다. 선택한 역할은 검토용이며 수락 후 관리자가 유저 관리에서 별도로 승인합니다. 이메일은 자동 발송되지 않습니다.</small>
        <button type="submit" disabled={busy || uncertain}>{busy ? '처리 중…' : '초대 링크 발급'}</button>
      </form>
    </InvitationCard>
    {error && <p role="alert">{error}{uncertain && ' 중복 발급을 막기 위해 목록 새로고침 후 다시 시도할 수 있습니다.'}</p>}
    {notice && <p role="status">{notice}</p>}
    {link && <InvitationCard aria-labelledby="invitation-link-title"><h2 id="invitation-link-title">이번에 발급한 비공개 링크</h2><p>이 링크는 지금만 확인할 수 있습니다. 페이지 이동·새로고침·다음 변경 시 사라지며, 다시 확인할 수 없으므로 복사해 안전하게 전달하세요.</p><label htmlFor="invitation-link">초대 링크<textarea id="invitation-link" ref={linkRef} rows={3} readOnly value={link} onFocus={event => event.currentTarget.select()} /></label><button type="button" onClick={() => void copy()}>링크 복사</button><button type="button" onClick={() => { setLink(''); setCopyNotice(''); }}>링크 숨기기</button>{copyNotice && <p role="status">{copyNotice}</p>}</InvitationCard>}
    <InvitationCard aria-labelledby="invitation-list-title">
      <h2 id="invitation-list-title">초대 목록</h2>
      <p>불러온 {items.length}건 기준 · {Object.entries(invitationStatuses).map(([status, label]) => `${label} ${items.filter(item => item.status === status).length}건`).join(' · ')}</p>
      <button type="button" disabled={busy} onClick={() => void load()}>목록 새로고침</button>
      {busy && <p role="status">요청을 처리하고 있습니다.</p>}
      {loaded && items.length === 0 && <p>아직 발급된 초대가 없습니다.</p>}
      {items.map(item => <InvitationCard as="article" key={item.id} aria-label={`${item.email} 초대`}>
        <h3>{item.email}</h3><p>{invitationStatuses[item.status]} · {invitationRoles[item.intendedRole]} (검토 요청)</p>
        <p>발급: <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('ko-KR')}</time><br />만료: <time dateTime={item.expiresAt}>{new Date(item.expiresAt).toLocaleString('ko-KR')}</time></p>
        {item.status === 'accepted' && item.acceptedBy ? <><p>수락 완료 · 역할 및 접근 권한은 별도 검토가 필요합니다.</p><Link href={`/admin/users?uid=${encodeURIComponent(item.acceptedBy)}`}>수락한 사용자 권한 검토</Link></> : <>
          {item.status === 'pending' && <button type="button" disabled={busy || uncertain} onClick={() => void mutate('cancel', item)}>초대 취소</button>}
          {item.status !== 'cancelled' ? <button type="button" disabled={busy || uncertain} onClick={() => void mutate('reissue', item)}>링크 재발급</button> : <p>취소된 초대는 다시 사용할 수 없습니다. 필요한 경우 위 양식에서 새 초대를 발급하세요.</p>}
        </>}
      </InvitationCard>)}
      {cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)}>초대 더 불러오기</button>}
    </InvitationCard>
  </>;
}
