'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isWindowsDashboard } from '@/lib/desktopWorkspaceRoute';
import MarketChart, { priceText, type ChartMode } from './MarketChart';
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

function usePriceHistory(key: string, instrument: Instrument | null, refresh: number) {
  const [result, setResult] = useState<LoadResult | null>(null);
  useEffect(() => {
    if (!instrument) return;
    const controller = new AbortController();
    void loadPrices(key, instrument, controller.signal).then(
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
  }, [key, instrument, refresh]);
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

function MarketSession({ serviceKey, saved, edit, disconnect }: {
  serviceKey: string; saved: boolean; edit: () => void; disconnect: () => void;
}) {
  const [selected, setSelected] = useState<Instrument>(indices[0]);
  const [mode, setMode] = useState<ChartMode>('line');
  const [months, setMonths] = useState<number>(periods[1].months);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchResult>({ status: 'idle' });
  const searchRequest = useRef<AbortController | null>(null);
  const kospi = usePriceHistory(serviceKey, indices[0], refresh);
  const kosdaq = usePriceHistory(serviceKey, indices[1], refresh);
  const stock = usePriceHistory(serviceKey, selected.kind === 'stock' ? selected : null, refresh);
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
    void findStocks(serviceKey, term, controller.signal).then(
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
        <IndexButton instrument={indices[0]} active={selected === indices[0]} result={kospi}
          onClick={() => setSelected(indices[0])} />
        <IndexButton instrument={indices[1]} active={selected === indices[1]} result={kosdaq}
          onClick={() => setSelected(indices[1])} />
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
                <button type="button" onClick={() => { setSelected(match); setSearch({ status: 'idle' }); }}>
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
        <button type="button" className={styles.secondary} onClick={edit}>인증키 변경</button>
        <button type="button" className={styles.secondary} onClick={disconnect}>인증키 지우기</button>
        <small>{saved ? '이 기기에서 자동 연결' : '현재 창에서만 연결'}</small>
      </div>
    </>
  );
}

const subscribeToHost = () => () => {};
const serverHost = () => 'checking' as const;

export default function MarketDashboard({ compact = false }: { compact?: boolean }) {
  const { currentUser, loading } = useAuth();
  const host = useSyncExternalStore(subscribeToHost, () => {
    if (isWindowsDashboard) return 'windows-main' as const;
    const current = window as Window & { chrome?: { webview?: unknown }; __geuttunMarketProfile?: string };
    return compact && current.chrome?.webview && current.__geuttunMarketProfile !== 'persistent' ? 'temporary' : 'profile';
  }, serverHost);
  if (host === 'windows-main') return (
    <div className={styles.dashboard}>
      <div className={styles.connectCard}>
        <a className={styles.primary} href="propig-widgets:market">국내 증시 위젯 열기</a>
        <p>앱 상단의 위젯 메뉴에서도 국내 증시를 열 수 있습니다.</p>
      </div>
    </div>
  );
  if (loading || host === 'checking') return <p className={styles.notice} role="status">시세 연결을 확인하는 중…</p>;
  const scope = marketConnectionScope(currentUser?.uid ?? null);
  return <MarketProfile key={host + ':' + scope} scope={scope} compact={compact} canRemember={host === 'profile'} />;
}

type Connection = { value: string; saved: boolean; revision: number };

function MarketProfile({ scope, compact, canRemember }: { scope: string; compact: boolean; canRemember: boolean }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [pending, setPending] = useState<'read' | 'write' | null>(canRemember ? 'read' : null);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [remember, setRemember] = useState(canRemember);
  const [invalid, setInvalid] = useState(false);
  const [notice, setNotice] = useState('');
  const [mayHaveSavedKey, setMayHaveSavedKey] = useState(false);
  const generation = useRef(0);
  const nextVersion = useCallback(() => ++generation.current, []);
  const writing = useRef(false);
  const temporary = useRef(false);

  function activate(value: string, saved: boolean) {
    setConnection(previous => previous?.value === value && previous.saved === saved
      ? previous : { value, saved, revision: (previous?.revision ?? 0) + 1 });
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
      setNotice('기기에 저장된 연결을 확인할 수 없습니다. 인증키를 입력하면 이 창에서 시세를 볼 수 있습니다.');
    } finally {
      if (version === generation.current) setPending(null);
    }
  }, [nextVersion, scope]);

  useEffect(() => {
    if (!canRemember) return;
    const unsubscribe = subscribeMarketConnection(scope, () => { void restore(); });
    void restore();
    return () => { nextVersion(); unsubscribe(); };
  }, [canRemember, nextVersion, restore, scope]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writing.current) return;
    const value = normalizeServiceKey(input);
    setInvalid(value === null);
    if (!value) return;
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
    setEditing(false);
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

  async function disconnect() {
    if (writing.current) return;
    const version = nextVersion();
    writing.current = true;
    temporary.current = true;
    setConnection(null);
    setEditing(false);
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
      setNotice('이 창의 연결을 해제했습니다. 기기에 저장된 인증키를 지우려면 다시 시도해 주세요.');
    } finally {
      if (version === generation.current) {
        writing.current = false;
        setPending(null);
      }
    }
  }

  return (
    <div className={styles.dashboard} data-compact={compact || undefined}>
      {pending === 'read' ? <p className={styles.notice} role="status">저장된 시세 연결을 확인하는 중…</p> : connection && !editing ? (
        <MarketSession key={connection.revision} serviceKey={connection.value} saved={connection.saved}
          edit={() => { setRemember(connection.saved); setEditing(true); }} disconnect={() => void disconnect()} />
      ) : (
        <section className={styles.connectCard}>
          <h2>{editing ? '인증키 변경' : '시세 데이터 연결'}</h2>
          <p>공공데이터포털에서 지수시세와 주식시세 이용을 신청한 뒤 본인의 인증키를 입력하세요.</p>
          <form onSubmit={connect} autoComplete="off">
            <div className={styles.form}>
              <label className={styles.field}>
                공공데이터포털 인증키
                <input type="password" required autoComplete="off" spellCheck={false} maxLength={512} disabled={pending === 'write'}
                  aria-invalid={invalid} value={input} onChange={event => { setInput(event.target.value); setInvalid(false); }} />
              </label>
              <button className={styles.primary} type="submit" disabled={pending === 'write'}>연결</button>
            </div>
            {canRemember && <p className={styles.notice}><label>
              <input type="checkbox" checked={remember} disabled={pending === 'write'} onChange={event => setRemember(event.target.checked)} /> 이 기기에서 연결 기억
            </label></p>}
          </form>
          {invalid && <p className={styles.notice} role="alert">공공데이터포털에서 발급된 인증키를 확인해 주세요.</p>}
          <p className={styles.notice}>{canRemember
            ? '선택하면 이 기기의 현재 프로필에 인증키를 암호화해 저장합니다. 공용 기기에서는 선택을 해제하세요.'
            : '이 버전의 Windows 위젯은 현재 창에서만 연결됩니다. 자동 연결을 사용하려면 그뚠뎃을 업데이트하세요.'}</p>
          {editing && connection && <button className={styles.secondary} type="button" disabled={pending === 'write'}
            onClick={() => { setInput(''); setInvalid(false); setEditing(false); }}>취소</button>}
          {!connection && mayHaveSavedKey && <button className={styles.secondary} type="button" disabled={pending === 'write'}
            onClick={() => void disconnect()}>저장된 인증키 지우기</button>}
        </section>
      )}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.sources}>
        <span>금융위원회·한국거래소 제공 · 다음 영업일 오후 1시 이후 갱신</span>
        <a href={marketSources.index} target="_blank" rel="noreferrer">지수시세정보</a>
        <a href={marketSources.stock} target="_blank" rel="noreferrer">주식시세정보</a>
      </div>
    </div>
  );
}
