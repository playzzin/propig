'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import styled from 'styled-components';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock3, Code2, Pause, Play, RotateCcw, Sparkles, Wallet, Weight } from 'lucide-react';
import { CeoMetricChart, CeoTrendChart } from './CeoStatisticsCharts';
import { CEO_METRICS, CEO_SCENARIOS, type CeoMetricId, type CeoStatisticsScenario } from './ceoStatisticsData';
import { ceoCharacterStages } from './ceoCharacterStages';

const DURATION = 20_000;
const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (listener: () => void) => {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
const subscribeVisibility = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};
const getReducedMotion = () => window.matchMedia(motionQuery).matches;
const getVisibility = () => document.visibilityState !== 'hidden';
const serverMotion = () => false;
const serverVisibility = () => true;
const icons = { skill: Code2, weight: Weight, time: Clock3, capital: Wallet };
const formatTime = (milliseconds: number) => `00:${String(Math.floor(milliseconds / 1000)).padStart(2, '0')}`;

function interpolateScenario(progress: number): CeoStatisticsScenario {
  const position = Math.min(4, Math.max(0, progress * 4));
  const index = Math.floor(position);
  const from = CEO_SCENARIOS[index];
  const to = CEO_SCENARIOS[Math.min(4, index + 1)];
  const fraction = position - index;
  const blend = fraction * fraction * (3 - 2 * fraction);
  const interpolate = (start: number, end: number) => Math.round(start + (end - start) * blend);
  const cash = from.cash.map((item, itemIndex) => ({ ...item, value: interpolate(item.value, to.cash[itemIndex].value) }));
  const values = {
    skill: interpolate(from.values.skill, to.values.skill),
    weight: interpolate(from.values.weight, to.values.weight),
    time: interpolate(from.values.time, to.values.time),
    capital: cash.reduce((sum, item) => sum + item.value, 0),
  };
  const spending = 1000 - values.capital;
  const foodShare = spending ? Math.round(-cash[1].value / spending * 100) : 0;
  const amount = (value: number) => value.toLocaleString('ko-KR');
  return {
    ...from,
    values,
    description: `기술력 ${values.skill} · 체중 ${values.weight}kg · 누적 작업 ${values.time}h · 잔고 ${amount(values.capital)}만원`,
    cash,
    skills: from.skills.map((item, itemIndex) => ({ ...item, value: interpolate(item.value, to.skills[itemIndex].value) })),
    insights: {
      skill: { ...from.insights.skill, tag: `현재 ${values.skill} Lv. / 최대 99 Lv.` },
      weight: { ...from.insights.weight, tag: `현재 ${values.weight}kg / 최종 150kg` },
      time: { ...from.insights.time, tag: `누적 작업 ${values.time}h / 최종 48h` },
      capital: {
        title: spending ? '지출의 주인공은 식대입니다.' : '아직은 든든한 시작 자본.',
        body: spending ? `총지출 ${amount(spending)}만원 중 식대가 ${foodShare}%입니다. AI 토큰·구독·장비 비용은 작은 비중으로 표시합니다.` : from.insights.capital.body,
        tag: `시작 1,000 − 지출 ${amount(spending)} = ${amount(values.capital)}만원`,
      },
    },
  };
}

export default function CeoStatisticsExperience() {
  const root = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [focus, setFocus] = useState<CeoMetricId | null>(null);
  const [manuallySelected, setManuallySelected] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const elapsedRef = useRef(0);
  const reduced = useSyncExternalStore(subscribeMotion, getReducedMotion, serverMotion);
  const documentVisible = useSyncExternalStore(subscribeVisibility, getVisibility, serverVisibility);
  const progress = reduced && !manuallySelected ? 1 : elapsed / DURATION;
  const scenarioIndex = Math.min(4, Math.floor(progress * 4));
  const scenario = interpolateScenario(progress);
  const canRun = visible && documentVisible && !reduced;
  const step = Math.min(3, Math.floor(progress * 4));
  const active = focus ? CEO_METRICS.find(metric => metric.id === focus)! : CEO_METRICS[0];
  const insight = scenario.insights[active.id];
  const character = ceoCharacterStages[scenario.character];
  const expenses = scenario.cash.slice(1);
  const totalExpenses = Math.max(0, -expenses.reduce((sum, item) => sum + item.value, 0));
  const foodShare = Math.round(-(expenses.find(item => item.label === '식대')?.value ?? 0) / (totalExpenses || 1) * 100);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      // Resize and scroll can queue several crossings in one delivery.
      const entry = entries.filter(item => item.target === element).at(-1);
      if (entry) setVisible(entry.isIntersecting && entry.intersectionRatio > 0.01);
    }, { threshold: [0, 0.01] });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia(motionQuery);
    const stop = () => { if (media.matches) setPlaying(false); };
    media.addEventListener('change', stop);
    return () => media.removeEventListener('change', stop);
  }, []);

  useEffect(() => {
    if (!playing || !canRun) return;
    let raf = 0;
    let last: number | null = null;
    let painted = 0;
    const tick = (now: number) => {
      if (last !== null) elapsedRef.current = Math.min(DURATION, elapsedRef.current + Math.max(0, now - last));
      last = now;
      if (now - painted >= 30 || elapsedRef.current === DURATION) {
        setElapsed(elapsedRef.current);
        setFocus(CEO_METRICS[Math.min(3, Math.floor(elapsedRef.current / 5000))].id);
        painted = now;
      }
      if (elapsedRef.current < DURATION) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, canRun]);

  const resetStory = () => { elapsedRef.current = 0; setElapsed(0); };
  const chooseScenario = (index: number) => {
    setManuallySelected(true); setPlaying(false); setFocus(null);
    elapsedRef.current = index / 4 * DURATION;
    setElapsed(elapsedRef.current);
  };
  const chooseMetric = (id: CeoMetricId) => {
    setPlaying(false);
    setFocus(id);
  };
  const toggleStory = () => {
    if (reduced) return;
    setManuallySelected(true);
    if (!playing) {
      if (elapsedRef.current >= DURATION) resetStory();
      setFocus(CEO_METRICS[Math.min(3, Math.floor(elapsedRef.current / 5000))].id);
    }
    setPlaying(value => !value);
  };
  const restart = () => {
    setManuallySelected(true); resetStory(); setFocus('skill'); setPlaying(!reduced);
  };

  return (
    <Statistics ref={root} aria-labelledby="ceo-statistics-title" data-ceo-statistics
      data-scenario={scenario.id} data-story-playing={playing && !reduced} data-story-step={step}
      data-stage-index={scenarioIndex} data-story-elapsed={Math.round(progress * DURATION)} data-motion-running={canRun && playing}>
      <header className="lab-header">
        <div>
          <p className="eyebrow"><span /> GTUN LIFE LAB <span className="edition">PERSONAL EDITION / 01</span></p>
          <h2 id="ceo-statistics-title">실력은 오르고, <span>잔고는 내려가고.</span></h2>
          <p className="intro">기술력 10 → 99 · 체중 100 → 150kg · 잔고 1,000 → −100만원. 20초로 보는 그뚠이의 변화.</p>
        </div>
        <span className="lab-stamp"><Sparkles size={17} aria-hidden="true" /> 대표통계</span>
      </header>

      <div className="stage-comparison" data-ceo-stages>
        <table aria-label="누적 작업 단계별 통계">
          <thead><tr><th scope="col">누적 작업</th>{CEO_SCENARIOS.map((item, index) => <th key={item.id} scope="col" className={scenarioIndex === index ? 'is-current' : ''}><button type="button" aria-label={`${item.values.time}시간 단계 보기`} aria-pressed={scenarioIndex === index} onClick={() => chooseScenario(index)}>{item.values.time}<small>h</small></button></th>)}</tr></thead>
          <tbody>{CEO_METRICS.filter(metric => metric.id !== 'time').map(metric => <tr key={metric.id}><th scope="row">{metric.label}</th>{CEO_SCENARIOS.map((item, index) => <td key={item.id} className={`${scenarioIndex === index ? 'is-current ' : ''}${item.values[metric.id] < 0 ? 'is-negative' : ''}`} data-stage-value={`${item.id}-${metric.id}`}>{item.values[metric.id].toLocaleString('ko-KR')}<small>{metric.id === 'capital' ? '만' : metric.id === 'weight' ? 'kg' : ''}</small></td>)}</tr>)}</tbody>
        </table>
        <p>여러 작업 구간을 합한 누적 시간입니다. 시간을 누르면 그 단계로 이동합니다.</p>
      </div>

      <dl className="metric-strip">
        {CEO_METRICS.map(metric => {
          const Icon = icons[metric.id];
          const delta = scenario.values[metric.id] - CEO_SCENARIOS[0].values[metric.id];
          return <div key={metric.id} style={{ '--metric-ink': metric.ink, '--metric-color': metric.color } as CSSProperties}>
            <dt><Icon size={16} aria-hidden="true" />{metric.label}<span>{metric.english}</span></dt>
            <dd className={scenario.values[metric.id] < 0 ? 'below-zero' : undefined} aria-label={`${metric.label} ${scenario.values[metric.id]} ${metric.unit}`}>
              <span aria-hidden="true" data-ceo-stat-value={metric.id} data-value={scenario.values[metric.id]}>{scenario.values[metric.id].toLocaleString('ko-KR')}</span><small aria-hidden="true">{metric.unit}</small>
              <em className={delta < 0 ? 'negative' : ''} aria-label={`시작 대비 ${delta > 0 ? '+' : ''}${delta} ${metric.unit}`}>{delta === 0 ? '시작값' : <>{delta > 0 ? <ArrowUpRight size={13} aria-hidden="true" /> : <ArrowDownRight size={13} aria-hidden="true" />}{delta > 0 ? '+' : ''}{delta.toLocaleString('ko-KR')}</>}</em>
            </dd>
          </div>;
        })}
      </dl>

      <section className="expense-ledger" data-ceo-expenses aria-label="지출과 잔고 한눈에 보기">
        <div className="expense-heading"><h3>지출 한눈에 <small>만원</small></h3><span>{totalExpenses ? <>식대 <b>{foodShare}%</b></> : '지출 전'}</span></div>
        <table aria-label="자본 지출 요약">
          <thead><tr>{expenses.map(item => <th key={item.label} scope="col">{item.label}</th>)}</tr></thead>
          <tbody><tr>{expenses.map(item => <td key={item.label} data-ceo-expense={item.label} data-expense-value={item.value}><strong>{item.value < 0 ? '−' : ''}{Math.abs(item.value).toLocaleString('ko-KR')}</strong><span className="expense-share" aria-hidden="true"><i style={{ width: `${Math.abs(item.value) / (totalExpenses || 1) * 100}%` }} /></span></td>)}</tr></tbody>
        </table>
        <div className="expense-summary">
          <span>시작 <b>1,000만</b><span className="expense-separator" aria-hidden="true">−</span>지출 <b data-ceo-expense-total={totalExpenses}>{totalExpenses.toLocaleString('ko-KR')}만</b></span>
          <strong className={scenario.values.capital < 0 ? 'is-deficit' : ''} data-ceo-expense-balance={scenario.values.capital}>{scenario.values.capital < 0 ? '적자' : '잔액'} <b>{scenario.values.capital < 0 ? '−' : ''}{Math.abs(scenario.values.capital).toLocaleString('ko-KR')}<small>만원</small></b></strong>
        </div>
      </section>

      <div className="observatory">
        <div className="trend-panel">
          <div className="plot-heading"><div><span className="section-index">01 / THE BIG PICTURE</span><h3>세 곡선은 위로, 잔고는 아래로.</h3></div><span className="plot-unit">지표별 범위</span></div>
          <div className="trend-canvas"><CeoTrendChart scenario={scenario} progress={progress} activeMetric={focus} /></div>
          <div className="plot-legend" aria-label="통합 그래프 범례">{CEO_METRICS.map(metric => <span key={metric.id}><i style={{ background: metric.color }} />{metric.label} {scenario.values[metric.id].toLocaleString('ko-KR')}{metric.unit}</span>)}</div>
          <p className="plot-note">단위별 범위를 맞춘 변화 곡선입니다. 잔고 0선 아래는 적자입니다.</p>
        </div>
        <aside className="character-panel" aria-label="그뚠이의 한마디">
          <div className="character-title"><span>오늘의 그뚠이</span><b>{scenario.shortLabel}</b></div>
          <div className="character-picture">
            {failedImage === character.src ? <Weight size={76} strokeWidth={1} aria-hidden="true" /> : <img src={character.src} alt={character.alt} width={180} height={180} onError={() => setFailedImage(character.src)} />}
            <span className="character-spark" aria-hidden="true">✳</span>
          </div>
          <blockquote>{scenario.quote}</blockquote>
          <span className="character-caption">늘어나는 체중, 줄어드는 잔고.</span>
        </aside>
      </div>

      <div className="story-console">
        <div className="story-heading"><span className="section-index">02 / CONNECT THE DOTS</span><h3>{scenario.headline}</h3><p>{scenario.description}</p></div>
        <div className="playback-controls">
          <button className="play" type="button" onClick={toggleStory} disabled={reduced} aria-label={playing && !reduced ? '통계 이야기 일시정지' : '통계 이야기 재생'}>
            {playing && !reduced ? <Pause size={15} fill="currentColor" aria-hidden="true" /> : <Play size={15} fill="currentColor" aria-hidden="true" />}
            {reduced ? '동작 줄이기 사용 중' : playing ? '일시정지' : elapsed >= DURATION ? '한 번 더 보기' : elapsed > 0 ? '이어서 보기' : '20초 이야기 재생'}
          </button>
          <button className="restart" type="button" onClick={restart} aria-label="처음부터 다시 보기"><RotateCcw size={16} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="story-track" role="progressbar" aria-label="통계 이야기 진행" aria-valuemin={0} aria-valuemax={20} aria-valuenow={Math.floor(progress * 20)} aria-valuetext={`${Math.floor(progress * 20)}초 / 20초`}><span style={{ transform: `scaleX(${progress})` }} /></div>
      <div className="track-caption"><span>{reduced ? '모션 없이 단계를 선택해 비교할 수 있어요.' : '숫자·곡선·비용표가 같은 재생 위치에 맞춰 움직입니다.'}</span><b>{formatTime(progress * DURATION)} / 00:20</b></div>

      <div className="chart-grid">
        {CEO_METRICS.map((metric, index) => <article key={metric.id} className={focus === metric.id ? 'metric-card is-focused' : 'metric-card'} style={{ '--metric-ink': metric.ink, '--metric-color': metric.color } as CSSProperties}>
          <div className="card-heading"><span>0{index + 1}</span><h3>{metric.label}</h3><small>{metric.english}</small></div>
          <div className="detail-chart"><CeoMetricChart metric={metric.id} scenario={scenario} progress={progress} activeMetric={focus} /></div>
          <p>{metric.caption}</p>
          <button type="button" data-metric-focus={metric.id} aria-label={`${metric.label} 자세히 보기`} aria-pressed={focus === metric.id} onClick={() => chooseMetric(metric.id)}>{focus === metric.id ? '지금 읽는 이야기' : '숫자 뒤의 이야기'}<ArrowUpRight size={15} aria-hidden="true" /></button>
        </article>)}
      </div>

      <span className="stage-announcement" aria-live="polite" aria-atomic="true">{CEO_SCENARIOS[scenarioIndex].shortLabel} 단계. {CEO_SCENARIOS[scenarioIndex].headline}</span>
      <div className="insight" style={{ '--metric-ink': active.ink, '--metric-color': active.color } as CSSProperties}>
        <span className="insight-index">0{CEO_METRICS.findIndex(metric => metric.id === active.id) + 1}<small>{active.label}</small></span>
        <div><h3>{insight.title}</h3><p>{insight.body}</p><span className="insight-tag"><ArrowRight size={13} aria-hidden="true" />{insight.tag}</span></div>
      </div>
      <footer className="lab-footer"><span>© GTUN LIFE LAB</span><p>재미로 보는 창작 캐릭터 시나리오입니다. 금액은 만원 단위의 가상 예산이며 실제 측정값·자산이 아닙니다. 작업시간은 하루 시간이 아닌 여러 구간의 누적입니다.</p></footer>
    </Statistics>
  );
}

const Statistics = styled.section`
  --lab-paper: #faf9f4;
  --lab-ink: #1c342c;
  --lab-muted: #66736a;
  --lab-rule: #dfe3d8;
  color: var(--lab-ink);
  background: var(--lab-paper);
  border-radius: 14px;
  padding: 24px;
  container-type: inline-size;
  overflow-anchor: none;
  min-width: 0;
  font-variant-numeric: tabular-nums;
  *, *::before, *::after { box-sizing: border-box; }
  h2, h3, p, dl, dd, blockquote { margin: 0; }
  button { font: inherit; cursor: pointer; touch-action: manipulation; }
  button:focus-visible { outline: 3px solid #376aef; outline-offset: 4px; }
  button:disabled { cursor: default; }
  .lab-header { display: flex; gap: 20px; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; }
  .eyebrow { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 700; letter-spacing: .09em; }
  .eyebrow > span:first-child { width: 7px; height: 7px; background: #287254; border-radius: 50%; }
  .edition { color: var(--lab-muted); margin-left: 10px; font-size: 9px; }
  h2 { margin-top: 14px; font-size: 32px; font-weight: 680; line-height: 1.35; word-break: keep-all; }
  h2 > span { color: #597a62; }
  .intro { margin-top: 10px; color: var(--lab-muted); font-size: 13px; line-height: 1.8; word-break: keep-all; }
  .lab-stamp { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 650; white-space: nowrap; border: 1px solid #b7c9b3; border-radius: 50px; padding: 8px 12px; }
  .stage-comparison { border-top: 1px solid var(--lab-rule); border-bottom: 1px solid var(--lab-rule); padding: 10px 0; }
  .stage-comparison table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .stage-comparison table, .expense-ledger table { color: var(--lab-ink); }
  .stage-comparison th, .expense-ledger th { background: transparent; }
  .stage-comparison thead, .stage-comparison tbody, .stage-comparison tr, .expense-ledger thead, .expense-ledger tbody, .expense-ledger tr { background: transparent; }
  .stage-comparison th, .stage-comparison td { text-align: center; padding: 4px 8px; font-size: 12px; font-weight: 500; line-height: 1.35; border: 0; color: var(--lab-ink); }
  .stage-comparison th:first-child { width: 90px; text-align: left; color: var(--lab-muted); font-size: 11px; }
  .stage-comparison thead th { padding-top: 0; padding-bottom: 4px; }
  .stage-comparison thead th:not(:first-child) { padding: 0; }
  .stage-comparison button { width: 100%; min-height: 36px; color: #34523e; background: #edf0e6; border: 0; font-size: 13px; font-weight: 650; border-radius: 5px; }
  .stage-comparison button[aria-pressed='true'] { background: #244b3c; color: #fff; }
  .stage-comparison button:hover:not([aria-pressed='true']) { background: #dde7d8; }
  .stage-comparison td.is-current { background: #eaf0e3; }
  .stage-comparison td.is-negative { color: #a34132; font-weight: 650; }
  .stage-comparison small { font-size: 10px; margin-left: 2px; font-weight: 500; }
  .stage-comparison > p { margin-top: 7px; font-size: 10px; color: var(--lab-muted); line-height: 1.5; }
  .metric-strip { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); padding: 20px 0; }
  .metric-strip > div { min-width: 0; padding: 0 20px; border-right: 1px solid var(--lab-rule); }
  .metric-strip > div:first-child { padding-left: 0; }
  .metric-strip > div:last-child { padding-right: 0; border-right: 0; }
  dt { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--metric-ink); font-weight: 600; }
  dt > span { margin-left: auto; color: var(--lab-muted); font-size: 8px; font-weight: 500; letter-spacing: .03em; }
  dd { display: flex; align-items: baseline; gap: 7px; margin-top: 9px; }
  dd > span { font-size: 38px; font-weight: 500; line-height: 1.1; }
  dd small { font-size: 12px; color: var(--lab-muted); }
  dd em { display: inline-flex; align-items: center; font-style: normal; margin-left: auto; color: var(--metric-ink); font-size: 10px; white-space: nowrap; }
  dd em.negative { color: #b14e34; }
  dd.below-zero > span { color: #a34132; }
  .expense-ledger { display: grid; grid-template-columns: 126px minmax(0,1fr) auto; align-items: center; gap: 20px; margin-bottom: 18px; padding: 12px 16px; border: 1px solid #dfd7ca; border-radius: 8px; background: #f3efe5; }
  .expense-heading h3 { font-size: 12px; font-weight: 650; }
  .expense-heading > span { display: block; margin-top: 5px; color: #914b27; font-size: 11px; }
  .expense-heading b { font-size: 15px; margin-left: 3px; }
  .expense-ledger table { width: 100%; table-layout: fixed; border-collapse: collapse; }
  .expense-ledger th { padding: 0 9px 5px; text-align: left; color: #62685e; font-size: 11px; font-weight: 500; }
  .expense-ledger td { padding: 0 9px; vertical-align: top; }
  .expense-ledger td strong { color: #5b5349; font-size: 16px; font-weight: 600; white-space: nowrap; }
  .expense-ledger td:first-child strong, .expense-ledger th:first-child { color: #914b27; }
  .expense-ledger small { font-size: 10px; font-weight: 500; margin-left: 3px; }
  .expense-share { display: block; height: 3px; margin-top: 5px; background: #e1ded2; overflow: hidden; border-radius: 3px; }
  .expense-share i { display: block; height: 100%; background: #7e8c79; }
  .expense-ledger td:first-child .expense-share i { background: #c97d46; }
  .expense-summary { border-left: 1px solid #d6d1c3; padding-left: 20px; min-width: 170px; }
  .expense-summary > span { display: block; color: #62685e; font-size: 10px; }
  .expense-summary > span b { font-weight: 600; }
  .expense-separator { padding: 0 6px; }
  .expense-summary > strong { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; margin-top: 4px; color: #28563e; font-size: 11px; font-weight: 600; }
  .expense-summary > strong b { font-size: 22px; line-height: 1.2; font-weight: 600; }
  .expense-summary > strong.is-deficit { color: #a34132; }
  .observatory { display: grid; grid-template-columns: minmax(0,1fr) 200px; overflow: hidden; border-radius: 10px; background: #10231f; }
  .trend-panel { min-width: 0; padding: 20px 22px 16px; color: #edf5ed; }
  .plot-heading { display: flex; gap: 10px; align-items: flex-end; justify-content: space-between; }
  .section-index { display: block; font-size: 9px; font-weight: 600; letter-spacing: .07em; color: #526a5b; }
  .plot-heading .section-index { color: #99b3a5; }
  .plot-heading h3 { margin-top: 7px; font-size: 19px; font-weight: 550; }
  .plot-unit { font-size: 9px; color: #a7b9af; white-space: nowrap; }
  .trend-canvas { margin-top: 14px; min-width: 0; }
  .plot-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; padding-top: 8px; }
  .plot-legend > span { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; color: #d1ded5; }
  .plot-legend i { width: 14px; height: 3px; border-radius: 5px; }
  .plot-note { margin-top: 14px; border-top: 1px solid #30483d; padding-top: 12px; font-size: 10px; line-height: 1.7; color: #9bb4a5; word-break: keep-all; }
  .character-panel { background: #e7eddf; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #294832; }
  .character-title { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 6px; font-size: 10px; }
  .character-title b { font-size: 9px; font-weight: 500; padding: 4px 7px; border: 1px solid #afc0a5; border-radius: 30px; }
  .character-picture { position: relative; width: 138px; height: 138px; margin: 14px 0 10px; display: grid; place-items: center; border-radius: 50%; background: #f5f4e9; }
  .character-picture img { width: 100%; height: 100%; object-fit: contain; border-radius: inherit; mix-blend-mode: multiply; }
  .character-spark { position: absolute; right: -4px; top: 8px; font-size: 34px; color: #638953; }
  blockquote { white-space: pre-line; text-align: center; font-size: 15px; font-weight: 600; line-height: 1.8; min-height: 54px; }
  .character-caption { margin-top: 13px; font-size: 10px; color: #516247; }
  .story-console { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 22px 0 14px; }
  .story-heading { min-width: 0; }
  .story-heading h3 { font-size: 19px; font-weight: 600; margin-top: 8px; line-height: 1.5; word-break: keep-all; }
  .story-heading p { font-size: 11px; color: var(--lab-muted); line-height: 1.7; margin-top: 5px; max-width: 600px; word-break: keep-all; }
  .playback-controls { display: flex; gap: 7px; flex-shrink: 0; }
  .playback-controls button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 40px; border-radius: 7px; font-size: 11px; font-weight: 600; border: 1px solid #d1daca; }
  .play { padding: 8px 12px; min-width: 142px; color: #fff; background: #244b3c; }
  .play:disabled { background: #e6ebdf; color: #54644e; }
  .restart { width: 40px; padding: 0; color: #244b3c; background: transparent; }
  .restart:hover { background: #e9eee3; }
  .story-track { height: 3px; border-radius: 3px; background: #dbe1d3; overflow: hidden; }
  .story-track > span { display: block; width: 100%; height: 100%; background: #3a7755; transform-origin: left; }
  .track-caption { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 8px 0 22px; color: var(--lab-muted); font-size: 9px; }
  .track-caption b { flex-shrink: 0; font-weight: 500; }
  .chart-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; }
  .metric-card { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--lab-rule); border-radius: 8px; padding: 15px 12px 12px; background: #fffefb; transition: border-color .2s, background .2s; }
  .metric-card.is-focused { border-color: var(--metric-ink); background: #f2f5ec; }
  .card-heading { display: flex; align-items: center; gap: 7px; }
  .card-heading > span { font-size: 10px; color: #586b58; }
  .card-heading h3 { font-size: 14px; font-weight: 650; }
  .card-heading small { margin-left: auto; font-size: 8px; color: var(--lab-muted); }
  .detail-chart { margin: 10px -6px 0; min-width: 0; }
  .detail-chart svg { display: block; width: 100%; height: auto; }
  .metric-card > p { min-height: 36px; font-size: 10px; color: var(--lab-muted); line-height: 1.8; word-break: keep-all; margin: auto 0 12px; }
  .metric-card > button { width: 100%; min-height: 36px; display: flex; justify-content: space-between; align-items: center; border: 0; border-top: 1px solid var(--lab-rule); border-radius: 0; padding: 10px 0 0; color: var(--metric-ink); background: transparent; font-size: 10px; font-weight: 600; }
  .metric-card > button:hover { text-decoration: underline; text-underline-offset: 3px; }
  .insight { display: flex; gap: 20px; padding: 24px 0; margin-top: 22px; border-top: 1px solid var(--lab-rule); border-bottom: 1px solid var(--lab-rule); }
  .insight-index { width: 64px; flex-shrink: 0; color: var(--metric-ink); font-size: 38px; font-weight: 350; line-height: 1; }
  .insight-index small { display: block; font-size: 10px; font-weight: 600; margin-top: 8px; }
  .insight h3 { font-size: 17px; font-weight: 650; line-height: 1.5; word-break: keep-all; }
  .insight p { color: var(--lab-muted); font-size: 12px; line-height: 1.9; margin-top: 7px; word-break: keep-all; }
  .insight-tag { display: inline-flex; align-items: center; gap: 6px; color: var(--metric-ink); margin-top: 10px; font-size: 10px; }
  .stage-announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .lab-footer { display: flex; align-items: flex-start; gap: 24px; padding-top: 20px; color: var(--lab-muted); }
  .lab-footer > span { white-space: nowrap; font-size: 8px; letter-spacing: .04em; margin-top: 2px; }
  .lab-footer p { font-size: 9px; line-height: 1.8; word-break: keep-all; max-width: 680px; }

  @container (max-width: 900px) {
    .expense-ledger { grid-template-columns: 100px minmax(0,1fr); gap: 10px 14px; }
    .expense-summary { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: baseline; border-left: 0; border-top: 1px solid #d6d1c3; padding: 8px 0 0; }
    .expense-summary > strong { margin-top: 0; }
    .metric-strip > div { padding: 0 12px; }
    dt > span { display: none; }
    dd { flex-wrap: wrap; gap: 4px; }
    dd > span { font-size: 32px; }
    dd em { width: 100%; margin: 3px 0 0; }
    .chart-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .detail-chart { max-width: 290px; width: 100%; margin: 6px auto 0; }
    .metric-card { padding: 18px; }
    .card-heading h3 { font-size: 16px; }
    .metric-card > p, .metric-card > button { font-size: 12px; }
    .metric-card > p { min-height: auto; }
    .story-console { align-items: flex-start; flex-direction: column; }
    .observatory { grid-template-columns: minmax(0,1fr) 190px; }
    .character-panel { padding: 16px 12px; }
    .character-picture { width: 145px; height: 145px; }
    .trend-panel { padding: 22px 18px 16px; }
  }
  @container (max-width: 560px) {
    .expense-ledger { display: block; padding: 12px; margin-bottom: 14px; }
    .expense-heading { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
    .expense-heading > span { margin-top: 0; }
    .expense-ledger th, .expense-ledger td { padding-left: 5px; padding-right: 5px; }
    .expense-ledger th:first-child, .expense-ledger td:first-child { padding-left: 0; }
    .expense-ledger th:last-child, .expense-ledger td:last-child { padding-right: 0; }
    .expense-ledger td strong { font-size: 15px; }
    .expense-summary { margin-top: 10px; }
    .expense-summary > strong { gap: 8px; }
    .expense-summary > strong b { font-size: 20px; }
    .lab-header { padding-bottom: 20px; }
    h2 { font-size: 25px; }
    h2 > span { display: block; }
    .intro { font-size: 12px; }
    .edition, .lab-stamp { display: none; }
    .stage-comparison th, .stage-comparison td { padding: 4px 2px; font-size: 11px; }
    .stage-comparison th:first-child { width: 45px; font-size: 10px; word-break: keep-all; }
    .stage-comparison button { min-height: 44px; font-size: 12px; padding: 0; }
    .stage-comparison small { font-size: 9px; margin-left: 1px; }
    .stage-comparison > p { font-size: 9px; }
    .metric-strip { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 20px 0; }
    .metric-strip > div { padding: 0 16px; }
    .metric-strip > div:nth-child(odd) { padding-left: 0; }
    .metric-strip > div:nth-child(even) { border-right: 0; }
    dd > span { font-size: 37px; }
    dd em { width: auto; margin: 0 0 0 6px; }
    .observatory { grid-template-columns: 1fr; }
    .trend-panel { padding: 20px 14px 16px; }
    .plot-heading h3 { font-size: 18px; }
    .plot-legend { gap: 8px 12px; }
    .character-panel { display: grid; grid-template-columns: 104px minmax(0,1fr); column-gap: 12px; padding: 16px; }
    .character-title { grid-column: 2; grid-row: 1; align-self: end; }
    .character-picture { grid-column: 1; grid-row: 1 / 4; width: 100px; height: 100px; margin: 0; }
    .character-spark { font-size: 26px; right: -2px; top: -2px; }
    blockquote { grid-column: 2; grid-row: 2; text-align: left; font-size: 12px; line-height: 1.8; min-height: 44px; margin-top: 8px; }
    .character-caption { grid-column: 2; font-size: 9px; margin-top: 6px; }
    .story-heading h3 { font-size: 18px; }
    .story-heading p { font-size: 12px; }
    .playback-controls { width: 100%; }
    .playback-controls button { height: 44px; font-size: 12px; }
    .play { flex: 1; }
    .restart { width: 44px; }
    .chart-grid { grid-template-columns: 1fr; gap: 14px; }
    .metric-card { padding: 20px; }
    .card-heading small { font-size: 9px; }
    .metric-card > button { min-height: 44px; }
    .insight { gap: 14px; }
    .insight-index { width: 45px; font-size: 31px; }
    .insight h3 { font-size: 16px; }
    .lab-footer { flex-direction: column; gap: 8px; }
  }
  @media (max-width: 720px) { padding: 20px 16px; border-radius: 10px; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
