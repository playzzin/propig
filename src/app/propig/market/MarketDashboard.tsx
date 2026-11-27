'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import MarketChart, { priceText, type ChartMode } from './MarketChart';
import { findStocks, loadPrices } from './marketClient';
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

function MarketSession({ serviceKey, disconnect }: { serviceKey: string; disconnect: () => void }) {
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
        <button type="button" className={styles.secondary} onClick={disconnect}>인증키 지우기</button>
      </div>
    </>
  );
}

export default function MarketDashboard({ compact = false }: { compact?: boolean }) {
  const [serviceKey, setServiceKey] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = normalizeServiceKey(input);
    setInvalid(key === null);
    if (!key) return;
    setInput('');
    setServiceKey(key);
  }

  return (
    <div className={styles.dashboard} data-compact={compact || undefined}>
      {serviceKey ? (
        <MarketSession serviceKey={serviceKey} disconnect={() => setServiceKey(null)} />
      ) : (
        <section className={styles.connectCard}>
          <h2>시세 데이터 연결</h2>
          <p>공공데이터포털에서 지수시세와 주식시세 이용을 신청한 뒤 본인의 인증키를 입력하세요.</p>
          <form className={styles.form} onSubmit={connect} autoComplete="off">
            <label className={styles.field}>
              공공데이터포털 인증키
              <input type="password" required autoComplete="off" spellCheck={false} maxLength={512}
                aria-invalid={invalid} value={input} onChange={event => { setInput(event.target.value); setInvalid(false); }} />
            </label>
            <button className={styles.primary} type="submit">연결</button>
          </form>
          {invalid && <p className={styles.notice} role="alert">공공데이터포털에서 발급된 인증키를 확인해 주세요.</p>}
          <p className={styles.notice}>이 화면을 다시 열면 인증키를 다시 입력해야 합니다.</p>
        </section>
      )}
      <div className={styles.sources}>
        <span>금융위원회·한국거래소 제공 · 다음 영업일 오후 1시 이후 갱신</span>
        <a href={marketSources.index} target="_blank" rel="noreferrer">지수시세정보</a>
        <a href={marketSources.stock} target="_blank" rel="noreferrer">주식시세정보</a>
      </div>
    </div>
  );
}
