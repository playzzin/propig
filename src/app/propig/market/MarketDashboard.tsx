'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isWindowsDashboard } from '@/lib/desktopWorkspaceRoute';
import { useMarketView } from '@/app/propig/_lib/dashboardPreferences';
import MarketChart, { priceText, type ChartMode } from './MarketChart';
import { connectAccountMarket, disconnectAccountMarket, findAccountStocks, loadAccountPrices, watchAccountMarket } from './accountMarketClient';
import { findStocks, loadPrices } from './marketClient';
import { forgetMarketConnection, marketConnectionScope, readMarketConnection, saveMarketConnection, subscribeMarketConnection } from './marketConnection';
import {
  indices, marketSources, normalizeServiceKey,
  type Instrument, type MarketStock, type PriceBar,
} from './marketData';
import styles from './MarketDashboard.module.css';

const periods = [
  { label: '1개월', months: 1 }, { label: '3개월', months: 3 },
  { label: '6개월', months: 6 }, { label: '1년', months: 12 },
] as const;

function periodStart(end: string, months: number) {
  const [year, month, day] = end.split('-').map(Number);
  const targetMonth = month - 1 - months;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

type LoadResult = { instrument: Instrument; refresh: number } & (
  { status: 'ready'; bars: PriceBar[] } | { status: 'error'; message: string }
);
type SearchResult = { status: 'idle' | 'loading' } |
  { status: 'ready'; matches: MarketStock[] } | { status: 'error'; message: string };
type DeviceConnection = { kind: 'device'; value: string; saved: boolean; revision: number };
type Source = DeviceConnection | { kind: 'account'; uid: string };

function usePriceHistory(source: Source, instrument: Instrument | null, refresh: number) {
  const [result, setResult] = useState<LoadResult | null>(null);
  useEffect(() => {
    if (!instrument) return;
    const controller = new AbortController();
    const request = source.kind === 'account'
      ? loadAccountPrices(source.uid, instrument, controller.signal)
      : loadPrices(source.value, instrument, controller.signal);
    void request.then(
      bars => {
        if (!controller.signal.aborted) setResult({ instrument, refresh, status: 'ready', bars });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({
          instrument, refresh, status: 'error',
          message: error instanceof Error ? error.message : '시세를 불러오지 못했습니다.',
        });
      },
    );
    return () => controller.abort();
  }, [source, instrument, refresh]);
  return result?.instrument === instrument && result.refresh === refresh ? result : null;
}

function IndexButton({ instrument, active, result, onClick }: {
  instrument: Instrument;
  active: boolean;
  result: LoadResult | null;
  onClick: () => void;
}) {
  const latest = result?.status === 'ready' ? result.bars.at(-1) : undefined;
  return (
    <button className={styles.index} type="button" aria-pressed={active} onClick={onClick}>
      <span>{instrument.name} <small>{instrument.code}</small></span>
      <strong>{latest ? priceText(latest.close) : '—'}</strong>
      <span className={styles.indexDate}>
        {latest ? <time dateTime={latest.date}>{latest.date}</time> : result ? '조회 결과 없음' : '불러오는 중'}
        {latest?.change !== undefined && latest.change !== null && (
          <small className={styles.change} data-direction={latest.change < 0 ? 'down' : latest.change > 0 ? 'up' : undefined}>
            {latest.change > 0 ? '+' : ''}{priceText(latest.change)}%
          </small>
        )}
      </span>
    </button>
  );
}

function MarketSession({ uid, source, children }: {
  uid: string | null; source: Source; children: ReactNode;
}) {
  const view = useMarketView(uid);
  // A device key can still provide quotes while its account's chart preferences are offline.
  const [draft, setDraft] = useState<{ instrument?: Instrument; months?: number; mode?: ChartMode } | null>(null);
  if (view.ready && draft) setDraft(null);
  const selected = draft?.instrument ?? view.instrument;
  const months = draft?.months ?? view.months;
  const mode = draft?.mode ?? view.mode;
  function selectInstrument(instrument: Instrument) {
    if (view.ready === false) setDraft(previous => ({ ...previous, instrument }));
    view.selectInstrument(instrument);
  }
  function setMonths(months: number) {
    if (view.ready === false) setDraft(previous => ({ ...previous, months }));
    view.setMonths(months);
  }
  function setMode(mode: ChartMode) {
    if (view.ready === false) setDraft(previous => ({ ...previous, mode }));
    view.setMode(mode);
  }
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchResult>({ status: 'idle' });
  const searchRequest = useRef<AbortController | null>(null);
  const kospi = usePriceHistory(source, indices[0], refresh);
  const kosdaq = usePriceHistory(source, indices[1], refresh);
  const stock = usePriceHistory(source, selected.kind === 'stock' ? selected : null, refresh);
  const result = selected.kind === 'stock' ? stock : selected.code === 'KOSPI' ? kospi : kosdaq;
  const rawBars = result?.status === 'ready' ? result.bars : [];
  const latest = rawBars.at(-1);
  const cutoff = latest ? periodStart(latest.date, months) : '';
  const bars = rawBars.filter(bar => bar.date >= cutoff);
  const unit = selected.kind === 'index' ? 'p' : '원';

  useEffect(() => () => searchRequest.current?.abort(), []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearch({ status: 'loading' });
    const request = source.kind === 'account'
      ? findAccountStocks(source.uid, term, controller.signal)
      : findStocks(source.value, term, controller.signal);
    void request.then(
      matches => {
        if (!controller.signal.aborted) setSearch({ status: 'ready', matches });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSearch({
          status: 'error',
          message: error instanceof Error ? error.message : '종목을 찾지 못했습니다.',
        });
      },
    );
  }

  return (
    <>
      <div className={styles.indices} aria-label="시장 지수">
        <IndexButton instrument={indices[0]} active={selected.kind === 'index' && selected.code === indices[0].code} result={kospi}
          onClick={() => selectInstrument(indices[0])} />
        <IndexButton instrument={indices[1]} active={selected.kind === 'index' && selected.code === indices[1].code} result={kosdaq}
          onClick={() => selectInstrument(indices[1])} />
      </div>
      <div className={styles.searchCard}>
        <form className={styles.form} onSubmit={submitSearch}>
          <label className={styles.field}>
            종목 검색
            <input type="search" placeholder="종목명 또는 코드" required minLength={2} maxLength={32}
              value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <button className={styles.primary} type="submit" disabled={query.trim().length < 2}>검색</button>
        </form>
        {search.status === 'loading' && <p role="status" className={styles.notice}>종목을 찾는 중…</p>}
        {search.status === 'error' && <p role="alert" className={styles.notice}>{search.message}</p>}
        {search.status === 'ready' && (search.matches.length ? (
          <ul className={styles.matches} aria-label="검색 결과">
            {search.matches.map(match => (
              <li key={match.code}>
                <button type="button" onClick={() => { selectInstrument(match); setSearch({ status: 'idle' }); }}>
                  <strong>{match.name}</strong> <span>{match.code} · {match.market}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p role="status" className={styles.notice}>검색 결과가 없습니다. 종목명이나 6자리 코드를 확인해 주세요.</p>)}
      </div>
      <section className={styles.chartCard} aria-label="선택한 종목 차트">
        <div className={styles.chartHeading}>
          <div>
            <h2>{selected.name} <small>{selected.code}</small></h2>
            {latest && <p><strong>{priceText(latest.close)} {unit}</strong> <time dateTime={latest.date}>{latest.date} 종가</time></p>}
          </div>
          <div className={styles.switches}>
            <div className={styles.segmented} role="group" aria-label="조회 기간">
              {periods.map(period => (
                <button type="button" aria-pressed={months === period.months} key={period.months}
                  onClick={() => setMonths(period.months)}>{period.label}</button>
              ))}
            </div>
            <div className={styles.segmented} role="group" aria-label="차트 형태">
              <button type="button" aria-pressed={mode === 'line'} onClick={() => setMode('line')}>종가선</button>
              <button type="button" aria-pressed={mode === 'candle'} onClick={() => setMode('candle')}>캔들</button>
            </div>
          </div>
        </div>
        {bars.length > 0 ? (
          <MarketChart key={selected.code + ':' + months} bars={bars} mode={mode} name={selected.name} unit={unit} />
        ) : (
          <div className={styles.empty} role="status">
            {result === null ? '시세를 불러오는 중…' : result.status === 'error' ? result.message : '선택한 항목의 시세가 없습니다.'}
          </div>
        )}
      </section>
      <div className={styles.sessionControls}>
        <button type="button" className={styles.secondary} onClick={() => setRefresh(count => count + 1)}>새로고침</button>
        {children}
      </div>
      {view.error && <p className={styles.notice} role="status">{view.error}{' '}
        <button type="button" className={styles.secondary} onClick={view.retry}>차트 설정 다시 동기화</button>
      </p>}
    </>
  );
}

const subscribeToHost = () => () => {};
const serverHost = () => 'checking' as const;

function marketHost() {
  const current = window as Window & { chrome?: { webview?: unknown }; __geuttunMarketProfile?: string };
  if (current.chrome?.webview && current.location.pathname.replace(/\/$/, '') === '/propig/desktop/market') {
    return current.__geuttunMarketProfile === 'persistent' ? 'windows-widget' : 'old-widget';
  }
  return isWindowsDashboard ? 'windows-main' : 'profile';
}

export default function MarketDashboard({ compact = false }: { compact?: boolean }) {
  const { currentUser, loading } = useAuth();
  const host = useSyncExternalStore(subscribeToHost, marketHost, serverHost);
  if (loading || host === 'checking') return <p className={styles.notice} role="status">시세 연결을 확인하는 중…</p>;
  const uid = currentUser?.uid ?? null;
  return <MarketProfile key={host + ':' + marketConnectionScope(uid)} uid={uid} compact={compact} host={host}/>;
}

function useAccountConnection(uid: string | null) {
  const [state, setState] = useState({ connected: false, known: false, revision: 0 });
  const [watchFailed, setWatchFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const expectedEcho = useRef<boolean | null>(null);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => {
    if (!mutation.current) return;
    mutation.current.abort();
    mutation.current = null;
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    // An offline Firestore listener can take a while to deliver its first snapshot.
    const timeout = window.setTimeout(() => { if (active) setWatchFailed(true); }, 5000);
    const unsubscribe = watchAccountMarket(uid, connected => {
      if (!active) return;
      window.clearTimeout(timeout);
      version.current++;
      const echoed = expectedEcho.current === connected;
      expectedEcho.current = null;
      setWatchFailed(false);
      setError('');
      if (!echoed) setState(previous => ({ connected, known: true, revision: previous.revision + 1 }));
    }, () => { if (active) { window.clearTimeout(timeout); setWatchFailed(true); } });
    return () => { active = false; window.clearTimeout(timeout); unsubscribe(); };
  }, [uid, attempt]);

  async function update(serviceKey: string | null) {
    if (!uid || mutation.current) return false;
    const controller = new AbortController();
    const before = version.current;
    mutation.current = controller;
    setBusy(true);
    setError('');
    try {
      if (serviceKey === null) await disconnectAccountMarket(uid, controller.signal);
      else await connectAccountMarket(uid, serviceKey, controller.signal);
      if (controller.signal.aborted) return false;
      // A newer marker from another device wins over a delayed callable response.
      if (before === version.current) {
        const connected = serviceKey !== null;
        expectedEcho.current = connected;
        setState(previous => ({ connected, known: true, revision: previous.revision + 1 }));
      }
      if (watchFailed) setAttempt(previous => previous + 1);
      return true;
    } catch (cause: unknown) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '계정 시세 연결을 변경할 수 없습니다.');
      return false;
    } finally {
      if (!controller.signal.aborted) {
        mutation.current = null;
        setBusy(false);
      }
    }
  }
  return { ...state, busy, error, watchFailed, update, retry: () => setAttempt(value => value + 1) };
}

type Editor = 'device' | 'account' | 'share-device';

function MarketProfile({ uid, compact, host }: { uid: string | null; compact: boolean; host: ReturnType<typeof marketHost> }) {
  const canRemember = host === 'profile' || host === 'windows-widget';
  // The Windows market widget already has a separate WebView profile for each native account.
  const scope = marketConnectionScope(host === 'windows-widget' ? null : uid);
  const account = useAccountConnection(uid);
  const sharedSource = useMemo<Source | null>(() => uid ? { kind: 'account', uid } : null, [uid]);
  const [connection, setConnection] = useState<DeviceConnection | null>(null);
  const [pending, setPending] = useState<'read' | 'write' | null>(canRemember ? 'read' : null);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState<Editor | null>(null);
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(canRemember);
  const [invalid, setInvalid] = useState(false);
  const [notice, setNotice] = useState('');
  const [mayHaveSavedKey, setMayHaveSavedKey] = useState(false);
  const generation = useRef(0);
  const nextVersion = useCallback(() => ++generation.current, []);
  const writing = useRef(false);
  const temporary = useRef(false);
  const checkingAccount = uid !== null && !account.known && !account.watchFailed;
  const source = account.connected ? sharedSource : checkingAccount ? null : connection;
  const busy = pending === 'write' || account.busy;

  function activate(value: string, saved: boolean) {
    setConnection(previous => previous?.value === value && previous.saved === saved
      ? previous : { kind: 'device', value, saved, revision: (previous?.revision ?? 0) + 1 });
  }

  const restore = useCallback(async () => {
    if (writing.current || temporary.current) return;
    const version = nextVersion();
    try {
      const value = await readMarketConnection(scope);
      if (version !== generation.current) return;
      if (value) activate(value, true);
      else setConnection(null);
      setMayHaveSavedKey(Boolean(value));
      setNotice('');
    } catch {
      if (version !== generation.current) return;
      setConnection(null);
      setMayHaveSavedKey(true);
      setNotice('기기에 저장된 연결을 확인할 수 없습니다.');
    } finally {
      if (version === generation.current) setPending(null);
    }
  }, [nextVersion, scope]);

  useEffect(() => {
    if (!canRemember) return;
    const unsubscribe = subscribeMarketConnection(scope, () => { void restore(); });
    void restore();
    return () => {
      nextVersion();
      unsubscribe();
      if (writing.current) {
        writing.current = false;
        temporary.current = false;
      }
    };
  }, [canRemember, nextVersion, restore, scope]);

  function openEditor(editor: Editor | null) {
    setInput('');
    setInvalid(false);
    setConsent(false);
    setRemember(canRemember && (connection?.saved ?? true));
    setEditing(editor);
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writing.current || account.busy) return;
    const toAccount = consent || editing === 'account' || editing === 'share-device';
    if (toAccount && (!consent || !uid)) return;
    const value = editing === 'share-device' ? connection?.value ?? null : normalizeServiceKey(input);
    setInvalid(value === null);
    if (!value) return;
    if (toAccount) {
      if (await account.update(value)) openEditor(null);
      return;
    }
    const version = nextVersion();
    writing.current = true;
    setPending('write');
    setInput('');
    let saved = false;
    let stored = mayHaveSavedKey;
    let superseded = false;
    let message = '';
    try {
      if (canRemember && remember) {
        saved = await saveMarketConnection(scope, value);
        superseded = !saved;
        stored = saved;
      } else if (canRemember && stored) {
        await forgetMarketConnection(scope);
        stored = false;
      }
    } catch {
      message = stored
        ? '새 인증키는 이 창에서만 사용합니다. 기기의 이전 연결이 남아 있을 수 있습니다.'
        : '이 기기에 저장할 수 없어 이 창에서만 연결했습니다.';
    }
    if (version !== generation.current) return;
    writing.current = false;
    temporary.current = !saved && !superseded;
    setEditing(null);
    if (superseded) {
      setConnection(null);
      setPending('read');
      void restore();
      return;
    }
    activate(value, saved);
    setMayHaveSavedKey(stored);
    setNotice(message);
    setPending(null);
    if (saved) void restore();
  }

  async function forgetDevice() {
    if (writing.current) return;
    const version = nextVersion();
    writing.current = true;
    temporary.current = true;
    setConnection(null);
    setEditing(null);
    setConsent(false);
    setInput('');
    setInvalid(false);
    setPending('write');
    try {
      if (canRemember) await forgetMarketConnection(scope);
      if (version !== generation.current) return;
      temporary.current = false;
      setMayHaveSavedKey(false);
      setNotice('');
    } catch {
      if (version !== generation.current) return;
      setMayHaveSavedKey(true);
      setNotice('이 창의 기기 연결을 해제했습니다. 기기에 저장된 인증키를 지우려면 다시 시도해 주세요.');
    } finally {
      if (version === generation.current) {
        writing.current = false;
        setPending(null);
      }
    }
  }

  return (
    <div className={styles.dashboard} data-compact={compact || undefined}>
      {host === 'windows-main' && <div className={styles.sessionControls}>
        <a className={styles.primary} href="propig-widgets:market">바탕화면에 띄우기</a>
      </div>}
      {!source && (pending === 'read' || checkingAccount) ? <p className={styles.notice} role="status">저장된 시세 연결을 확인하는 중…</p> : source && !editing ? (
        <MarketSession key={source.kind === 'account' ? 'account:' + account.revision : 'device:' + source.revision} uid={uid} source={source}>
          {source.kind === 'account' ? <>
            <small>이 계정으로 자동 연결</small>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => openEditor('account')}>계정 인증키 변경</button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void account.update(null)}>계정 연결 해제</button>
            {mayHaveSavedKey && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void forgetDevice()}>기기의 인증키 지우기</button>}
          </> : <>
            <small>{source.saved ? '이 기기에서 자동 연결' : '현재 창에서만 연결'}</small>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => openEditor('device')}>인증키 변경</button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void forgetDevice()}>인증키 지우기</button>
            {uid && <button type="button" className={styles.secondary} disabled={busy} onClick={() => openEditor('share-device')}>계정에 연결</button>}
          </>}
        </MarketSession>
      ) : (
        <section className={styles.connectCard}>
          <h2>{editing === 'share-device' ? '현재 인증키를 계정에 연결' : editing === 'account' ? '계정 인증키 변경' : editing ? '인증키 변경' : '시세 데이터 연결'}</h2>
          {editing !== 'share-device' && <p>공공데이터포털에서 지수시세와 주식시세 이용을 신청한 뒤 본인의 인증키를 입력하세요.</p>}
          <form onSubmit={connect} autoComplete="off">
            {editing !== 'share-device' && <div className={styles.form}>
              <label className={styles.field}>
                공공데이터포털 인증키
                <input type="password" required autoComplete="off" spellCheck={false} maxLength={512} disabled={busy}
                  aria-invalid={invalid} value={input} onChange={event => { setInput(event.target.value); setInvalid(false); }} />
              </label>
              <button className={styles.primary} type="submit" disabled={busy || (editing === 'account' && !consent)}>연결</button>
            </div>}
            {canRemember && editing !== 'share-device' && editing !== 'account' && <p className={styles.notice}><label>
              <input type="checkbox" checked={remember && !consent} disabled={busy || consent} onChange={event => setRemember(event.target.checked)} /> 이 기기에서 연결 기억
            </label></p>}
            {uid && <p className={styles.notice}>
              <label><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/> 이 계정에서 시세 연결 공유</label>
              <br/>인증키를 서버에 암호화해 저장하면 같은 계정으로 로그인한 웹·앱·위젯에서 시세를 볼 수 있습니다.
            </p>}
            {editing === 'share-device' && <button className={styles.primary} type="submit" disabled={busy || !consent || !connection}>계정에 연결</button>}
          </form>
          {invalid && <p className={styles.notice} role="alert">공공데이터포털에서 발급된 인증키를 확인해 주세요.</p>}
          {!consent && editing !== 'account' && editing !== 'share-device' && <p className={styles.notice}>{canRemember
            ? '기기 연결을 기억하면 현재 프로필에 인증키를 암호화해 저장합니다. 공용 기기에서는 선택을 해제하세요.'
            : host === 'old-widget' ? '이 버전의 Windows 위젯은 기기 연결을 현재 창에서만 사용합니다. 기기에서 자동 연결하려면 그뚠뎃을 업데이트하세요.'
            : 'Windows 메인 창에서 기기 연결은 창을 닫으면 해제됩니다.'}</p>}
          {editing && <button className={styles.secondary} type="button" disabled={busy} onClick={() => openEditor(null)}>취소</button>}
          {!source && mayHaveSavedKey && <button className={styles.secondary} type="button" disabled={busy}
            onClick={() => void forgetDevice()}>저장된 인증키 지우기</button>}
        </section>
      )}
      {account.error && <p className={styles.notice} role="alert">{account.error}</p>}
      {account.watchFailed && <p className={styles.notice} role="status">계정의 시세 연결 상태를 확인할 수 없습니다.{' '}
        <button type="button" className={styles.secondary} onClick={account.retry}>계정 연결 다시 확인</button>
      </p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.sources}>
        <span>금융위원회·한국거래소 제공 · 다음 영업일 오후 1시 이후 갱신</span>
        <a href={marketSources.index} target="_blank" rel="noreferrer">지수시세정보</a>
        <a href={marketSources.stock} target="_blank" rel="noreferrer">주식시세정보</a>
      </div>
    </div>
  );
}
