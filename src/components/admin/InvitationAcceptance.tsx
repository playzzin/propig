'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { onAuthStateChanged } from 'firebase/auth';
import { z } from 'zod';
import { auth } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const invitationTokenSchema = z.string().min(32).max(512).regex(/^[A-Za-z0-9_-]+$/);
const timestamp = z.string().datetime({ offset: true });
export const invitationSchema = z.object({
  id: identifier, email: z.string().email().max(254), intendedRole: z.enum(['user', 'partner', 'guest']),
  status: z.enum(['pending', 'accepted', 'cancelled', 'expired']),
  createdAt: timestamp, expiresAt: timestamp, createdBy: z.string().min(1).max(128),
  acceptedBy: z.string().min(1).max(128).nullable(), acceptedAt: timestamp.nullable(),
}).refine(value => value.status !== 'accepted' || Boolean(value.acceptedBy && value.acceptedAt));
export type Invitation = z.infer<typeof invitationSchema>;
export const invitationRoles = { user: '일반 사용자', partner: '파트너', guest: '게스트' };
export const invitationStatuses = { pending: '대기', accepted: '수락', cancelled: '취소', expired: '만료' };

// SDK events, not just Context UID equality, distinguish A → B → A.
let generation = 0;
let observedUid: string | null = null;
let unsubscribeAuth: (() => void) | undefined;
const listeners = new Set<() => void>();
function sdkSnapshot() { return `${generation}:${auth.currentUser?.uid ?? ''}`; }
function subscribeSdk(listener: () => void) {
  listeners.add(listener);
  if (!unsubscribeAuth) {
    observedUid = auth.currentUser?.uid ?? null;
    unsubscribeAuth = onAuthStateChanged(auth, user => {
      const uid = user?.uid ?? null;
      if (uid !== observedUid) {
        observedUid = uid;
        generation += 1;
        for (const notify of listeners) notify();
      }
    });
  }
  return () => { listeners.delete(listener); if (!listeners.size) { unsubscribeAuth?.(); unsubscribeAuth = undefined; } };
}
export function useInvitationSdkSession() { return useSyncExternalStore(subscribeSdk, sdkSnapshot, () => 'server'); }
class StaleInvitationTask extends Error {}
export class InvitationFailure extends Error {}
export function invitationError(error: unknown) {
  return error instanceof InvitationFailure ? error.message : '연결 또는 응답 확인에 실패했습니다. 변경 요청은 이미 반영되었을 수 있으니 상태를 확인한 뒤 다시 시도해 주세요.';
}
function apiExplanation(payload: unknown, status: number) {
  const code = typeof payload === 'object' && payload !== null && 'code' in payload ? String(payload.code) : '';
  if (/EMAIL.*VERIF|VERIF.*EMAIL/.test(code)) return '이메일 인증이 필요합니다. 인증을 마친 뒤 이 화면에서 인증 상태를 다시 확인해 주세요.';
  if (/EMAIL.*MISMATCH|WRONG.*ACCOUNT/.test(code)) return '초대받은 이메일과 로그인 계정이 다릅니다. 로그아웃한 뒤 초대받은 계정으로 로그인해 주세요.';
  if (/EXPIRED/.test(code)) return '만료된 초대입니다. 관리자에게 새 링크를 요청해 주세요.';
  if (/CANCELLED|REVOKED/.test(code)) return '취소된 초대입니다. 관리자에게 확인해 주세요.';
  if (/ALREADY.*ACCEPT|NOT_PENDING|CONFLICT/.test(code) || status === 409) return '초대 상태가 변경되었거나 이미 수락되었습니다. 관리자 목록에서 현재 상태를 확인해 주세요.';
  if (status === 401) return '로그인 인증이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.';
  if (status === 403) return '이 계정으로 처리할 수 없습니다. 계정과 관리자 권한을 확인해 주세요.';
  if (status === 404 || /INVALID.*TOKEN|TOKEN.*INVALID|NOT_FOUND/.test(code)) return '유효하지 않거나 교체된 초대 링크입니다. 관리자에게 새 링크를 요청해 주세요.';
  if (status === 429) return '요청이 너무 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.';
  if (status === 400) return '초대를 처리할 수 없습니다. 이메일 인증·초대받은 계정·입력 내용을 확인하세요. 만료·취소·재발급된 링크라면 관리자에게 새 링크를 요청해 주세요.';
  return '요청 결과를 확인하지 못했습니다. 변경은 반영되었을 수 있으니 상태를 확인해 주세요.';
}

// Entire deadline includes SDK token acquisition, transport, and response parsing.
export function useInvitationTasks(uid: string | null, scope: string) {
  const lifecycle = useRef({ live: false, revision: 0 });
  const controllers = useRef(new Set<AbortController>());
  useLayoutEffect(() => {
    lifecycle.current.live = true;
    lifecycle.current.revision += 1;
    const invalidate = () => {
      lifecycle.current.live = false;
      lifecycle.current.revision += 1;
      for (const controller of controllers.current) controller.abort();
    };
    const stop = subscribeSdk(invalidate);
    return () => { stop(); invalidate(); };
  }, [uid, scope]);
  return useCallback(() => {
    const revision = lifecycle.current.revision;
    const sdk = sdkSnapshot();
    const isCurrent = () => lifecycle.current.live && lifecycle.current.revision === revision &&
      (auth.currentUser?.uid ?? null) === uid && sdkSnapshot() === sdk;
    const run = async <T,>(operation: (signal: AbortSignal, assert: () => void) => Promise<T>): Promise<T> => {
      const controller = new AbortController();
      controllers.current.add(controller);
      const assert = () => { if (!isCurrent() || controller.signal.aborted) throw new StaleInvitationTask(); };
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abortListener: (() => void) | undefined;
      const stopped = new Promise<never>((_, reject) => {
        abortListener = () => reject(new StaleInvitationTask());
        controller.signal.addEventListener('abort', abortListener, { once: true });
        timer = setTimeout(() => {
          reject(new InvitationFailure('응답 시간이 초과되었습니다. 변경은 이미 반영되었을 수 있습니다. 관리자에게 상태를 확인해 주세요.'));
          controller.abort();
        }, 20_000);
      });
      try {
        assert();
        return await Promise.race([stopped, operation(controller.signal, assert)]);
      } finally {
        clearTimeout(timer);
        if (abortListener) controller.signal.removeEventListener('abort', abortListener);
        controllers.current.delete(controller);
      }
    };
    const request = (path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown) => run(async (signal, assert) => {
      const user = auth.currentUser;
      if (!user || user.uid !== uid) throw new StaleInvitationTask();
      const token = await user.getIdToken();
      assert();
      const response = await fetch(path, {
        method, signal, cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert();
      const payload: unknown = await response.json();
      assert();
      if (!response.ok) throw new InvitationFailure(apiExplanation(payload, response.status));
      return payload;
    });
    return { isCurrent, run, request };
  }, [uid]);
}

type Secret = { id: string; token: string };
export default function InvitationAcceptance() {
  const captured = useRef<{ secret: Secret | null } | null>(null);
  const [fragment, setFragment] = useState<{ secret: Secret | null } | null>(null);
  const authentication = useAuth();
  const sdk = useInvitationSdkSession();
  useEffect(() => {
    if (!captured.current) {
      const parameters = new URLSearchParams(window.location.hash.slice(1));
      const result = z.object({ id: identifier, token: invitationTokenSchema }).safeParse({ id: parameters.get('id'), token: parameters.get('token') });
      captured.current = { secret: result.success && parameters.getAll('id').length === 1 && parameters.getAll('token').length === 1 ? result.data : null };
      // Capture once in memory before erasing; StrictMode replay must not reread the empty hash.
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
    let live = true;
    queueMicrotask(() => { if (live) setFragment(captured.current); });
    return () => { live = false; };
  }, []);
  return <InvitationShell id="content-area" data-client-ready={Boolean(fragment)}>
    <h1>ProPig 초대 수락</h1>
    <p>초대받은 이메일 계정으로 온보딩을 접수하세요. 수락만으로 역할이나 접근 권한이 부여되지 않습니다.</p>
    {!fragment || authentication.loading || sdk === 'server' ? <p role="status">초대와 로그인 상태를 확인하고 있습니다.</p> :
      !fragment.secret ? <p role="alert">유효한 초대 링크가 없습니다. 관리자에게 받은 원본 링크를 다시 열어 주세요.</p> :
        <AcceptanceActions key={`${sdk}:${authentication.currentUser?.uid ?? ''}`} secret={fragment.secret} sdk={sdk} />}
    <Link href="/propig">ProPig 홈</Link>
  </InvitationShell>;
}
function AcceptanceActions({ secret, sdk }: { secret: Secret; sdk: string }) {
  const { currentUser, loading, isConfigured, loginWithGoogle, logout } = useAuth();
  const begin = useInvitationTasks(currentUser?.uid ?? null, sdk);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(currentUser?.emailVerified === true);
  const [success, setSuccess] = useState(false);
  const ready = !loading && isConfigured && currentUser?.uid === auth.currentUser?.uid;
  async function perform(action: 'login' | 'logout' | 'refresh' | 'accept') {
    if (lock.current || loading || !isConfigured) return;
    if (action !== 'login' && (!ready || !currentUser)) return;
    if (action === 'accept' && (!verified || !auth.currentUser?.emailVerified || success)) return;
    lock.current = true;
    const task = begin();
    if (!task.isCurrent()) { lock.current = false; return; }
    setBusy(true); setError('');
    try {
      if (action === 'login' || action === 'logout') {
        await task.run(async () => { if (action === 'login') await loginWithGoogle(); else await logout(); });
      } else if (action === 'refresh') {
        await task.run(async (_signal, assert) => {
          await currentUser!.reload(); assert();
          await currentUser!.getIdToken(true); assert();
        });
        if (task.isCurrent()) setVerified(auth.currentUser?.emailVerified === true);
      } else {
        const payload = await task.request('/api/invitations/accept', 'POST', secret);
        const result = z.object({ ok: z.literal(true), invitation: invitationSchema, accessReviewRequired: z.literal(true) }).safeParse(payload);
        if (!result.success || result.data.invitation.id !== secret.id || result.data.invitation.status !== 'accepted' || result.data.invitation.acceptedBy !== currentUser!.uid) throw new InvitationFailure('수락 응답을 확인하지 못했습니다. 관리자에게 접수 상태를 확인해 주세요.');
        if (task.isCurrent()) setSuccess(true);
      }
    } catch (failure) {
      if (task.isCurrent()) setError(action === 'login' ? '로그인을 완료하지 못했습니다. 팝업 허용과 계정을 확인한 뒤 다시 시도해 주세요.' : invitationError(failure));
    } finally { if (task.isCurrent()) { lock.current = false; setBusy(false); } }
  }
  return <InvitationCard>
    {success ? <><h2>온보딩 접수가 완료되었습니다</h2><p role="status">관리자가 기존 유저 관리 화면에서 계정을 검토하고 승인합니다. 역할·접근 권한·공유 범위는 자동으로 변경되지 않습니다.</p></> : <>
      {!isConfigured && <p role="alert">현재 로그인을 사용할 수 없습니다. 관리자에게 문의해 주세요.</p>}
      {!currentUser ? <><p>초대받은 이메일의 Google 계정으로 로그인하세요. 로그인 후 수락 버튼을 직접 눌러야 합니다.</p><button type="button" disabled={busy || !isConfigured || loading} onClick={() => void perform('login')}>Google로 로그인</button></> : <>
        <p>현재 계정: <strong>{currentUser.email ?? '이메일 없음'}</strong></p>
        {!ready ? <p role="status">계정 상태를 확인하고 있습니다.</p> : !verified ? <><p>이메일 인증이 필요합니다. 인증 메일에서 인증을 완료한 뒤 아래 버튼을 누르세요. 이 페이지를 새로고침하면 메모리의 초대가 사라지므로 원본 초대 링크가 다시 필요합니다.</p><button type="button" disabled={busy} onClick={() => void perform('refresh')}>이메일 인증 상태 다시 확인</button></> : <><p>초대받은 이메일과 현재 계정이 같은지 확인해 주세요.</p><button type="button" disabled={busy || !ready} onClick={() => void perform('accept')}>{busy ? '처리 중…' : '초대 수락'}</button></>}
        <button type="button" disabled={busy || !ready} onClick={() => void perform('logout')}>다른 계정으로 로그인 (로그아웃)</button>
      </>}
    </>}
    {error && <p role="alert">{error}</p>}
  </InvitationCard>;
}

export const InvitationShell = styled.main`
  width: 100%; min-height: 0; height: 100%; overflow-y: auto; overflow-x: hidden;
  padding: 24px; box-sizing: border-box; color: var(--text-primary, #172033);
  background: var(--background-primary, #f5f7fb); overflow-wrap: anywhere;
  > * { max-width: 1040px; margin-left: auto; margin-right: auto; }
  h1 { font-size: 1.65rem; margin-top: 0; } h2 { font-size: 1.15rem; }
  p { line-height: 1.65; } nav { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
  a, button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 10px 14px; box-sizing: border-box; }
  a { color: #315cba; } button { border: 1px solid #97a7c3; border-radius: 8px; background: #eef3ff; color: #183b7c; cursor: pointer; font: inherit; }
  button:disabled { opacity: .6; cursor: not-allowed; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid #4674d5; outline-offset: 3px; }
  input, select, textarea { display: block; width: 100%; min-width: 0; min-height: 44px; border: 1px solid #97a7c3; border-radius: 7px; padding: 10px; box-sizing: border-box; font: inherit; color: #172033; background: #fff; }
  label { display: grid; gap: 7px; margin-bottom: 14px; } form { display: grid; gap: 8px; }
  [role='alert'] { color: #a42c2c; } small { line-height: 1.6; }
  @media (max-width: 600px) { padding: 16px; }
`;
export const InvitationCard = styled.section`
  padding: 18px; margin-bottom: 18px; border: 1px solid var(--border-color, #d4dce8); border-radius: 12px;
  background: var(--background-secondary, #fff); min-width: 0;
  button { margin: 4px 8px 4px 0; } p:first-child { margin-top: 0; }
`;
