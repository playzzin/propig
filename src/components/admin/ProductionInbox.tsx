'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { onAuthStateChanged } from 'firebase/auth';
import { z } from 'zod';
import { auth } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

const sources = { executions: 'AI 실행 이력', saved: '저장된 이미지·영상', video: '영상 작업', storyboards: '스토리보드' };
type Source = keyof typeof sources;
const statuses = { pending: '진행 중', completed: '완료', failed: '실패·중단', 'needs-review': '확인 필요', unknown: '상태 미상' };
const kinds = { image: '이미지', 'emoticon-plan': '이모티콘 기획', video: '영상', storyboard: '스토리보드', unknown: '분류 미상' };
function isToolLink(href: string) {
  if (!href.startsWith('/admin/')) return false;
  const url = new URL(href, 'https://propig.invalid');
  return url.origin === 'https://propig.invalid' && ['/admin/storyboard', '/admin/emoticon-studio'].includes(url.pathname) &&
    !url.hash && [...url.searchParams.keys()].every(key => ['storyboard', 'storyboardMode', 'scene'].includes(key));
}
const itemSchema = z.object({
  id: z.string().min(1).max(1500), title: z.string().max(160),
  kind: z.enum(['image', 'emoticon-plan', 'video', 'storyboard', 'unknown']),
  status: z.enum(['pending', 'completed', 'failed', 'needs-review', 'unknown']),
  updatedAt: z.string().datetime({ offset: true }).nullable(), href: z.string().max(3000).refine(isToolLink),
});
const pageSchema = z.object({ source: z.enum(['executions', 'saved', 'video', 'storyboards']), items: z.array(itemSchema).max(25), nextCursor: z.string().max(4096).nullable(), order: z.literal('loaded-only'), notes: z.array(z.string().max(600)).max(12) });
type Item = z.infer<typeof itemSchema>;
class InboxFailure extends Error {}
let version = 0;
let observed: string | null = null;
let stop: (() => void) | undefined;
const subscribers = new Set<() => void>();
function snapshot() { return `${version}:${auth.currentUser?.uid ?? ''}`; }
function subscribe(callback: () => void) {
  subscribers.add(callback);
  if (!stop) {
    observed = auth.currentUser?.uid ?? null;
    stop = onAuthStateChanged(auth, user => {
      if ((user?.uid ?? null) !== observed) { observed = user?.uid ?? null; version += 1; subscribers.forEach(fn => fn()); }
    });
  }
  return () => { subscribers.delete(callback); if (!subscribers.size) { stop?.(); stop = undefined; } };
}
export default function ProductionInbox() {
  const session = useAuth();
  const sdk = useSyncExternalStore(subscribe, snapshot, () => 'server');
  const [source, setSource] = useState<Source>('executions');
  const [loginError, setLoginError] = useState('');
  return <Shell id="content-area">
    <nav aria-label="제작 작업함 탐색"><Link href="/admin">관리자 홈</Link><Link href="/admin/storyboard">스토리보드 제작</Link><Link href="/admin/emoticon-studio">이모티콘 스튜디오</Link></nav>
    <h1>내 제작 작업함</h1>
    <p>현재 로그인한 계정의 실행 이력과 저장 결과를 확인합니다. 여기서는 새 생성·재시도·삭제를 실행하지 않습니다.</p>
    {session.loading || sdk === 'server' ? <p role="status">로그인을 확인하고 있습니다.</p> : !session.currentUser ? <Card>
      <h2>로그인이 필요합니다</h2><p>작업을 생성했던 계정으로 로그인하세요.</p>
      <button type="button" disabled={!session.isConfigured} onClick={() => { setLoginError(''); void session.loginWithGoogle().catch(() => setLoginError('로그인을 완료하지 못했습니다. 팝업과 계정을 확인해 주세요.')); }}>Google로 로그인</button>
      {loginError && <p role="alert">{loginError}</p>}
    </Card> : session.currentUser.uid !== auth.currentUser?.uid ? <p role="status">계정 전환을 확인하고 있습니다.</p> : <>
      <label>조회 대상<select aria-label="조회 대상" value={source} onChange={event => setSource(event.target.value as Source)}>{Object.entries(sources).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <Results key={`${sdk}:${session.currentUser.uid}:${source}`} uid={session.currentUser.uid} sdk={sdk} source={source} />
    </>}
    <Card><h2>이 기기에만 있는 초안</h2><p>이모티콘 스튜디오의 로컬 초안·IndexedDB 자산은 서버 작업 목록에 포함하지 않습니다. 계정 소유가 확인되지 않은 기기 초안을 현재 사용자에게 자동으로 연결하거나 공유하지 않습니다.</p><Link href="/admin/emoticon-studio">기존 이모티콘 스튜디오 열기</Link></Card>
  </Shell>;
}
function Results({ uid, sdk, source }: { uid: string; sdk: string; source: Source }) {
  const [items, setItems] = useState<Item[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState('');
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(100);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const user = auth.currentUser;
    const current = () => live && user?.uid === uid && auth.currentUser?.uid === uid && snapshot() === sdk;
    const assert = () => { if (!current() || controller.signal.aborted) throw new Error('stale'); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (!current()) return;
      setPending(true); setError('');
      try {
        const data = await Promise.race([
          (async () => {
            const token = await user!.getIdToken(); assert();
            const query = new URLSearchParams({ source, ...(cursor ? { cursor } : {}) });
            const response = await fetch(`/api/production-inbox?${query}`, { signal: controller.signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` } }); assert();
            if (!response.ok) throw new InboxFailure(response.status === 401 ? '로그인이 만료되었습니다. 다시 로그인해 주세요.' : '작업 목록을 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.');
            const result = pageSchema.parse(await response.json()); assert();
            if (result.source !== source || (cursor && result.nextCursor === cursor)) throw new InboxFailure('작업 목록 응답을 확인하지 못했습니다.');
            return result;
          })(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new InboxFailure('조회 시간이 초과되었습니다. 다시 조회해 주세요.')); }, 20_000); }),
        ]);
        if (!current()) return;
        setItems(previous => [...new Map((cursor ? [...previous, ...data.items] : data.items).map(item => [item.id, item])).values()]);
        setNotes(data.notes); setNextCursor(data.nextCursor); setLoaded(true);
      } catch (failure) {
        if (current()) setError(failure instanceof z.ZodError ? '작업 목록의 형식을 확인하지 못했습니다. 기존 결과를 보존했습니다.' : failure instanceof InboxFailure ? failure.message : '작업 목록에 연결하지 못했습니다. 다시 조회해 주세요.');
      } finally { clearTimeout(timer); if (current()) setPending(false); }
    };
    queueMicrotask(() => { if (live) void run(); });
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [uid, sdk, source, cursor, reload]);
  const filtered = useMemo(() => items.filter(item => (status === 'all' || item.status === status) && `${item.title} ${item.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => (b.updatedAt ? Date.parse(b.updatedAt) : 0) - (a.updatedAt ? Date.parse(a.updatedAt) : 0) || a.id.localeCompare(b.id)), [items, status, search]);
  return <>
    <Card>
      <h2>{sources[source]}</h2><p>불러온 {items.length}건 안에서만 검색·필터·최근순 정렬합니다. 서버 전체의 최신 작업 순서는 아닙니다.</p>
      <Controls><label>작업 검색<input aria-label="작업 검색" value={search} onChange={event => { setSearch(event.target.value); setVisible(100); }} placeholder="제목 또는 작업 ID" /></label>
      <label>상태 필터<select aria-label="상태 필터" value={status} onChange={event => { setStatus(event.target.value); setVisible(100); }}><option value="all">모든 상태</option>{Object.entries(statuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <button type="button" disabled={pending} onClick={() => { setCursor(''); setReload(value => value + 1); }}>처음부터 새로고침</button></Controls>
      {pending && <p role="status">작업 목록을 불러오고 있습니다.</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" disabled={pending} onClick={() => setReload(value => value + 1)}>다시 조회</button></div>}
      {notes.map(note => <p key={note}>{note}</p>)}
    </Card>
    {loaded && !pending && filtered.length === 0 && <p role="status">불러온 범위에 표시할 작업이 없습니다. 필터를 바꾸거나 다음 작업을 더 불러오세요.</p>}
    {filtered.slice(0, visible).map(item => <Card as="article" key={item.id} aria-label={item.title || item.id}>
      <h3>{item.title || '제목 없는 작업'}</h3><p><strong>{statuses[item.status]}</strong> · {kinds[item.kind]}</p>
      <p>마지막 기록: {item.updatedAt ? new Date(item.updatedAt).toLocaleString('ko-KR') : '시각 정보 없음'}</p>
      <details><summary>작업 식별 정보</summary><code>{item.id}</code></details>
      {item.status === 'needs-review' && <p>이미 과금되었을 수 있습니다. 상태 확인 전 새 생성으로 재시도하지 마세요.</p>}
      <Link href={item.href}>기존 제작 도구에서 확인</Link>
    </Card>)}
    <Controls>{filtered.length > visible && <button type="button" onClick={() => setVisible(value => value + 100)}>불러온 항목 더 표시</button>}
    {nextCursor && <button type="button" disabled={pending} onClick={() => setCursor(nextCursor)}>서버 작업 더 불러오기</button>}</Controls>
  </>;
}
const Shell = styled.main`
  height:100%; overflow:auto; padding:24px; color:var(--text-primary,#172033); background:var(--background-primary,#f5f7fb); overflow-wrap:anywhere;
  > * { max-width:1080px; margin-left:auto; margin-right:auto; } nav {display:flex;flex-wrap:wrap;gap:10px;} h1{font-size:1.7rem;}h2{font-size:1.2rem;}p{line-height:1.65;}
  label{display:block;} input,select{display:block;width:100%;min-width:0;padding:10px;border:1px solid #97a7c3;border-radius:8px;font:inherit;background:#fff;color:#172033;}
  a,button,input,select,summary{min-height:44px;box-sizing:border-box;}a,button{display:inline-flex;align-items:center;padding:10px 14px;}a{color:#315cba;}button{border:1px solid #97a7c3;border-radius:8px;background:#eef3ff;color:#183b7c;font:inherit;cursor:pointer;}button:disabled{opacity:.6;cursor:not-allowed;}
  :is(button,a,input,select,summary):focus-visible{outline:3px solid #4674d5;outline-offset:3px;}summary{cursor:pointer;padding-top:10px;}code{font-size:.85rem;}@media(max-width:600px){padding:16px;}
`;
const Card = styled.section`padding:18px;margin-top:16px;margin-bottom:16px;border:1px solid #d1daea;border-radius:12px;background:var(--surface-primary,#fff);`;
const Controls = styled.div`display:flex;align-items:end;flex-wrap:wrap;gap:12px;>label{flex:1;min-width:180px;}@media(max-width:600px){>label{width:100%;}}`;
