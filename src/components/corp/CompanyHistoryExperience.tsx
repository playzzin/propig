'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpRight, Baby, Bike, BookOpen, Code2,
  GraduationCap, HardHat, HeartHandshake, Rocket, TrainFront, UsersRound,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import {
  CEO_HISTORY_BIRTH_YEAR,
  CEO_HISTORY_CHAPTERS,
  CEO_HISTORY_DESCRIPTION,
  CEO_HISTORY_NOTE,
  CEO_HISTORY_TITLE,
  type CeoHistoryChapter,
  type CeoHistoryIcon,
} from './ceoHistoryData';

type MilestoneMotionState = 'inview' | 'past' | 'upcoming';
type HistoryStyle = CSSProperties & {
  '--history-accent': string;
  '--history-accent-2': string;
};

interface CompanyHistoryExperienceProps {
  embedded?: boolean;
  id?: string;
}

const HISTORY_ICONS: Record<CeoHistoryIcon, LucideIcon> = {
  birth: Baby,
  family: HeartHandshake,
  school: GraduationCap,
  delivery: Bike,
  train: TrainFront,
  construction: HardHat,
  team: UsersRound,
  code: Code2,
  future: Rocket,
};
const STORY_CURVE = 'M 14 28 C 28 28, 34 70, 48 70 S 68 112, 82 112 S 102 62, 116 62 S 136 128, 150 128 S 170 86, 184 86 S 204 35, 218 35 S 238 122, 252 122 S 272 58, 286 58';
const STORY_POINTS = [28, 70, 112, 62, 128, 86, 35, 122, 58];

function getAgeLabel(item: CeoHistoryChapter): string {
  const startAge = item.startYear - CEO_HISTORY_BIRTH_YEAR + 1;
  return item.endYear
    ? `${startAge}–${item.endYear - CEO_HISTORY_BIRTH_YEAR + 1}세`
    : `${startAge}세`;
}

function getPeriod(item: CeoHistoryChapter): string {
  return item.endYear ? `${item.startYear}–${item.endYear}` : String(item.startYear);
}

export function CompanyHistoryExperience({
  embedded = false,
  id,
}: CompanyHistoryExperienceProps = {}) {
  const items = CEO_HISTORY_CHAPTERS;
  const surfaceRef = useRef<HTMLElement | null>(null);
  const scrollRootRef = useRef<HTMLElement | Window | null>(null);
  const activeIndexRef = useRef(0);
  const pinnedIndexRef = useRef<number | null>(null);
  const releasePinTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const motionSignatureRef = useRef('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [motionStates, setMotionStates] = useState<MilestoneMotionState[]>([]);
  const activeChapter = items[activeIndex] ?? items[0]!;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const scheduleMotionUpdate = useCallback((root: HTMLElement | Window, surface: HTMLElement) => {
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      if ((root instanceof HTMLElement && !root.isConnected) || !surface.isConnected) return;

      const milestones = Array.from(surface.querySelectorAll<HTMLElement>('[data-history-item]'));
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const isWindowRoot = root === window;
      const rootRect = isWindowRoot
        ? { top: 0, height: window.innerHeight }
        : (root as HTMLElement).getBoundingClientRect();
      const viewportHeight = Math.max(1, isWindowRoot ? window.innerHeight : (root as HTMLElement).clientHeight || rootRect.height);
      const scrollableHeight = Math.max(
        1,
        isWindowRoot
          ? document.documentElement.scrollHeight - window.innerHeight
          : (root as HTMLElement).scrollHeight - (root as HTMLElement).clientHeight,
      );
      const scrollTop = isWindowRoot ? window.scrollY : (root as HTMLElement).scrollTop;
      const pageProgress = Math.min(1, Math.max(0, scrollTop / scrollableHeight));
      const timeline = surface.querySelector<HTMLElement>('.history-timeline');
      const timelineRect = timeline?.getBoundingClientRect();
      const timelineTop = timelineRect ? timelineRect.top - rootRect.top : 0;
      const timelineHeight = Math.max(1, timelineRect?.height ?? 1);
      const timelineProgress = motionQuery.matches
        ? 1
        : Math.min(1, Math.max(0, (viewportHeight * 0.5 - timelineTop) / timelineHeight));
      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      const nextMotionStates: MilestoneMotionState[] = [];

      surface.style.setProperty('--page-scroll-progress', pageProgress.toFixed(4));
      surface.style.setProperty('--history-scroll-progress', timelineProgress.toFixed(4));

      milestones.forEach((milestone, index) => {
        const rect = milestone.getBoundingClientRect();
        const top = rect.top - rootRect.top;
        const bottom = rect.bottom - rootRect.top;
        const inView = motionQuery.matches || (bottom > viewportHeight * 0.14 && top < viewportHeight * 0.84);
        const past = !motionQuery.matches && bottom <= viewportHeight * 0.14;
        const upcoming = !motionQuery.matches && top >= viewportHeight * 0.84;
        const distance = Math.abs((top + bottom) / 2 - viewportHeight * 0.48);
        if (inView || past) milestone.dataset.historyRevealed = 'true';
        const drift = motionQuery.matches ? 0 : Math.max(-12, Math.min(12, (viewportHeight * 0.5 - top) / viewportHeight * 12));
        milestone.style.setProperty('--history-drift', `${drift.toFixed(1)}px`);

        nextMotionStates[index] = inView ? 'inview' : past ? 'past' : upcoming ? 'upcoming' : 'upcoming';

        if (inView && distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      const motionSignature = nextMotionStates.join('|');
      if (motionSignature !== motionSignatureRef.current) {
        motionSignatureRef.current = motionSignature;
        setMotionStates(nextMotionStates);
      }

      if (pinnedIndexRef.current === null && nearestIndex >= 0 && nearestIndex !== activeIndexRef.current) {
        activeIndexRef.current = nearestIndex;
        setActiveIndex(nearestIndex);
      }
    });
  }, []);

  const handleRootScroll = useCallback(
    (event: Event) => {
      const root = event.currentTarget;
      const surface = surfaceRef.current;
      if (root instanceof HTMLElement && surface) {
        scheduleMotionUpdate(root, surface);
      } else if (root === window && surface) {
        scheduleMotionUpdate(window, surface);
      }
    },
    [scheduleMotionUpdate],
  );

  const setSurfaceRef = useCallback(
    (node: HTMLElement | null) => {
      const previousRoot = scrollRootRef.current;
      const embeddedMain = node && embedded ? node.closest<HTMLElement>('main') : null;
      const mainOverflowY = embeddedMain ? window.getComputedStyle(embeddedMain).overflowY : '';
      const mainIsScrollRoot = Boolean(
        embeddedMain &&
          /(auto|scroll|overlay)/.test(mainOverflowY) &&
          embeddedMain.scrollHeight > embeddedMain.clientHeight + 1,
      );
      const nextRoot: HTMLElement | Window | null = node
        ? embedded
          ? mainIsScrollRoot
            ? embeddedMain
            : window
          : node
        : null;
      if (previousRoot === nextRoot && surfaceRef.current === node) return;

      if (previousRoot !== nextRoot) previousRoot?.removeEventListener('scroll', handleRootScroll);
      surfaceRef.current = node;
      scrollRootRef.current = nextRoot;
      if (nextRoot !== previousRoot) nextRoot?.addEventListener('scroll', handleRootScroll, { passive: true });
    },
    [embedded, handleRootScroll],
  );

  useEffect(() => {
    const root = scrollRootRef.current;
    const surface = surfaceRef.current;
    if (!root || !surface || items.length === 0) return undefined;

    const timeline = surface.querySelector<HTMLElement>('.history-timeline');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const schedule = () => scheduleMotionUpdate(root, surface);

    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    motionQuery.addEventListener('change', schedule);

    const resizeObserver = new ResizeObserver(schedule);
    if (root instanceof HTMLElement) resizeObserver.observe(root);
    if (surface !== root) resizeObserver.observe(surface);
    if (timeline) resizeObserver.observe(timeline);

    schedule();

    return () => {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pageshow', schedule);
      motionQuery.removeEventListener('change', schedule);
      resizeObserver.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (releasePinTimerRef.current !== null) {
        window.clearTimeout(releasePinTimerRef.current);
        releasePinTimerRef.current = null;
      }
    };
  }, [items.length, scheduleMotionUpdate]);

  const activateMilestone = (index: number, moveFocus = false) => {
    const target = surfaceRef.current?.querySelector<HTMLElement>(`[data-history-index='${index}']`);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    pinnedIndexRef.current = index;
    activeIndexRef.current = index;
    setActiveIndex(index);
    target?.setAttribute('data-history-revealed', 'true');
    if (moveFocus) target?.querySelector<HTMLButtonElement>('.history-milestone-button')?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });

    if (releasePinTimerRef.current !== null) window.clearTimeout(releasePinTimerRef.current);
    releasePinTimerRef.current = window.setTimeout(() => {
      pinnedIndexRef.current = null;
    }, reducedMotion ? 0 : 900);
  };

  const sectionId = id ?? (embedded ? 'company-introduction-history' : 'content-area');
  const Heading = embedded ? 'h2' : 'h1';

  return (
    <HistoryPage
      as={embedded ? 'section' : 'main'}
      ref={setSurfaceRef}
      id={sectionId}
      aria-labelledby="company-history-title"
      $embedded={embedded}
      style={{ '--active-history-accent': activeChapter.accent } as CSSProperties}
    >
      <span className="history-page-progress" aria-hidden="true" />
      <div className="history-background" aria-hidden="true" />
      <div className="history-shell">
        <header className="history-header">
          <div className="history-title-block">
            <span className="history-title-pill"><BookOpen size={15} aria-hidden="true" /> PIG Timeline</span>
            <Heading id="company-history-title">{CEO_HISTORY_TITLE}</Heading>
            <p className="history-lead">인생 장르는 몇 번 바뀌어도,<br />다음 장은 직접 쓴다.</p>
            <p className="history-description">{CEO_HISTORY_DESCRIPTION}</p>
            <button className="history-start" type="button" onClick={() => activateMilestone(0, true)}>
              첫 장부터 읽기 <ArrowDown size={17} aria-hidden="true" />
            </button>
          </div>
          <aside className="history-year-window" aria-label="생애 이야기 미리보기">
            <div className="history-preview-heading">
              <span>THE STORY SO FAR</span>
              <span>1983 — 2027</span>
            </div>
            <div className="history-preview-current" key={activeChapter.id}>
              <span className="history-preview-number">{String(activeIndex + 1).padStart(2, '0')}<small> / {String(items.length).padStart(2, '0')}</small></span>
              <strong>{activeChapter.phase}</strong>
              <span>{activeChapter.title}</span>
            </div>
            <div className="history-pulse-chart" aria-hidden="true">
              <svg viewBox="0 0 300 148" focusable="false">
                <defs>
                  <linearGradient id="historyPreviewStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="45%" stopColor="#fb7185" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>
                <path className="history-chart-track" d={STORY_CURVE} />
                <path className="history-chart-line" pathLength="1" d={STORY_CURVE} />
                {items.map((item, index) => (
                  <circle
                    key={item.id}
                    className={`history-chart-dot${index <= activeIndex ? ' is-active' : ''}${index === activeIndex ? ' is-current' : ''}`}
                    cx={14 + index * 34}
                    cy={STORY_POINTS[index]}
                    r="4"
                    style={{ '--dot-color': item.accent } as CSSProperties}
                  />
                ))}
              </svg>
              <div className="history-chart-years"><span>탄생</span><span>10대</span><span>20대</span><span>30대</span><span>40대</span></div>
            </div>
            <p className="history-preview-caption">굴곡도, 다시 시작한 순간도. 모두 내 이야기.</p>
          </aside>
        </header>

        <nav className="history-chapters" aria-label="시기별 이야기 바로가기">
          {items.map((item, index) => (
            <button key={item.id} type="button" aria-current={activeIndex === index ? 'step' : undefined}
              aria-controls={`history-chapter-${item.id}`}
              onClick={() => activateMilestone(index, true)}>
              <span>{String(index + 1).padStart(2, '0')}</span>{item.phase}
            </button>
          ))}
        </nav>
        <p className="history-period-note">{CEO_HISTORY_NOTE}</p>

        <section className="history-timeline" role="list" aria-label="그뚠이 시기별 생애 이야기">
          <span className="history-rail" aria-hidden="true" />
          <span className="history-rail-progress" aria-hidden="true" />
          <span className="history-rail-head" aria-hidden="true" />
          {items.map((item, index) => {
            const Icon = HISTORY_ICONS[item.icon];
            const isActive = activeIndex === index;
            const motionState = motionStates[index] ?? 'upcoming';
            const style: HistoryStyle = { '--history-accent': item.accent, '--history-accent-2': item.accent2 };
            return (
              <article
                key={item.id}
                id={`history-chapter-${item.id}`}
                className={`history-milestone ${index % 2 === 0 ? 'is-left' : 'is-right'} is-${motionState}${isActive ? ' is-active' : ''}`}
                role="listitem"
                data-history-item
                data-history-index={index}
                data-history-year={item.startYear}
                data-history-age={getAgeLabel(item)}
                data-history-phase={item.phase}
                style={style}
              >
                <span className="history-ghost-year" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span className="history-node" aria-hidden="true" />
                <div className="history-card">
                  <div className="history-card-top">
                    <div>
                      <span className="history-chapter-label">CHAPTER {String(index + 1).padStart(2, '0')}</span>
                      <span className="history-phase">{item.phase}</span>
                      <span className="history-period">{getPeriod(item)} <span aria-hidden="true">·</span> {getAgeLabel(item)}{item.planned ? ' · 예정' : ''}</span>
                    </div>
                    <span className="history-card-icon" aria-hidden="true"><Icon size={25} strokeWidth={1.8} /></span>
                  </div>
                  <h3 id={`history-title-${item.id}`}>{item.title}</h3>
                  <p className="history-card-body">{item.body}</p>
                  <blockquote className="history-card-quote"><span aria-hidden="true">“</span>{item.quote}</blockquote>
                  <ul className="history-points" aria-label={`${item.phase} 주요 장면`}>
                    {item.details.map((detail) => <li key={detail}>{detail}</li>)}
                  </ul>
                  <button
                    className="history-milestone-button"
                    type="button"
                    aria-pressed={isActive}
                    aria-label={`${item.phase} · ${getPeriod(item)}년 · ${getAgeLabel(item)} · ${item.title}${item.planned ? ' · 예정' : ''} 장면 선택`}
                    onClick={() => activateMilestone(index)}
                  >
                    <span>{isActive ? '지금 읽는 장면' : '이 장면 읽기'}</span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
        <footer className="history-ending">
          <Code2 size={26} aria-hidden="true" />
          <span>TO BE CONTINUED</span>
          <strong>다음 장은, 지금 만드는 중.</strong>
          <p>삽을 들던 손으로 키보드를 두드리며.<br />그뚠이의 이야기는 계속됩니다.</p>
          <button type="button" onClick={() => activateMilestone(0, true)}>처음부터 다시 읽기 <ArrowUp size={16} aria-hidden="true" /></button>
        </footer>
      </div>
    </HistoryPage>
  );
}

const HistoryPage = styled.main<{ $embedded: boolean }>`
  --history-scroll-progress: 0;
  --page-scroll-progress: 0;
  --active-history-accent: #fbbf24;
  position: relative;
  flex: ${({ $embedded }) => $embedded ? '0 0 auto' : '1'};
  min-width: 0;
  min-height: 0;
  overflow: ${({ $embedded }) => $embedded ? 'hidden' : 'auto'};
  color: #f8fafc;
  color-scheme: dark;
  background: #090f1c;
  font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif;

  &, * { box-sizing: border-box; letter-spacing: 0; }
  button { font: inherit; cursor: pointer; touch-action: manipulation; }
  button:focus-visible { outline: 3px solid #7dd3fc; outline-offset: 5px; }

  .history-page-progress {
    position: absolute;
    inset: 0 0 auto;
    z-index: 4;
    height: 3px;
    background: linear-gradient(90deg, #fbbf24, #fb7185 45%, #38bdf8);
    transform: scaleX(var(--page-scroll-progress));
    transform-origin: left;
  }
  .history-background {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse at 0% 0%, #173444 0%, transparent 18%),
      radial-gradient(ellipse at 100% 15%, #251c32 0%, transparent 26%),
      linear-gradient(90deg, #ffffff03 1px, transparent 1px);
    background-size: auto, auto, 64px 64px;
  }
  .history-shell { position: relative; width: min(1152px, calc(100% - 56px)); margin: auto; padding: 52px 0 64px; }
  .history-header { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(280px, .85fr); gap: 38px; align-items: center; }
  .history-title-block { min-width: 0; animation: history-intro 600ms ease-out both; }
  .history-title-pill { display: inline-flex; align-items: center; gap: 8px; color: #a5d7ed; font-size: 12px; font-weight: 800; }
  .history-header h1, .history-header h2 { margin: 20px 0 18px; color: #fff; font-size: 52px; font-weight: 900; line-height: 1.15; word-break: keep-all; }
  .history-lead { margin: 0; color: #eef5fb; font-size: 23px; font-weight: 750; line-height: 1.55; word-break: keep-all; }
  .history-description { max-width: 540px; margin: 18px 0 0; color: #aebdce; font-size: 15px; line-height: 1.9; word-break: keep-all; }
  .history-start, .history-ending button { display: inline-flex; align-items: center; justify-content: center; gap: 12px; min-height: 44px; margin-top: 24px; border: 1px solid #87bbd454; border-radius: 999px; padding: 10px 18px; color: #e0f2fe; background: #83c7eb0c; font-size: 13px; font-weight: 750; transition: background .2s, border-color .2s; }
  .history-start:hover, .history-ending button:hover { background: #83c7eb20; border-color: #7dd3fc; }
  .history-start svg { transition: transform .2s; }
  .history-start:hover svg { transform: translateY(3px); }

  .history-year-window { padding: 22px; border: 1px solid #ffffff16; border-radius: 24px; background: #ffffff04; animation: history-intro 650ms 100ms ease-out both; }
  .history-preview-heading { display: flex; justify-content: space-between; gap: 12px; color: #a5b4c6; font-size: 10px; font-weight: 750; }
  .history-preview-current { min-height: 160px; padding-top: 20px; animation: history-label-in 280ms ease-out both; }
  .history-preview-number { display: block; font-size: 46px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--active-history-accent); }
  .history-preview-number small { color: #8091a7; font-size: 16px; }
  .history-preview-current strong { display: block; margin-top: 10px; color: #f1f5f9; font-size: 19px; line-height: 1.4; }
  .history-preview-current > span:last-child { display: block; margin-top: 6px; color: #afbed0; font-size: 13px; line-height: 1.6; }
  .history-pulse-chart { padding-top: 8px; }
  .history-pulse-chart svg { display: block; width: 100%; height: 144px; overflow: visible; }
  .history-chart-track { fill: none; stroke: #8a9bb329; stroke-width: 2; stroke-linecap: round; }
  .history-chart-line { fill: none; stroke: url('#historyPreviewStroke'); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: calc(1 - var(--history-scroll-progress)); transition: stroke-dashoffset 180ms linear; }
  .history-chart-dot { fill: #172536; stroke: var(--dot-color); stroke-width: 2; opacity: .6; transition: fill .25s, opacity .25s, r .25s; }
  .history-chart-dot.is-active { fill: var(--dot-color); opacity: 1; }
  .history-chart-dot.is-current { r: 6px; stroke: #f8fafc; }
  .history-chart-years { display: flex; justify-content: space-between; gap: 8px; color: #a6b4c5; font-size: 10px; font-weight: 650; }
  .history-preview-caption { margin: 18px 0 0; padding-top: 16px; border-top: 1px solid #ffffff12; color: #9bacc0; font-size: 12px; line-height: 1.7; }

  .history-chapters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 40px; }
  .history-chapters button { display: flex; align-items: center; gap: 10px; min-width: 0; min-height: 48px; padding: 10px 14px; border: 1px solid #a0b3ca20; border-radius: 10px; background: #ffffff03; color: #c3cedb; font-size: 13px; font-weight: 700; text-align: left; transition: border-color .2s, color .2s, background .2s; }
  .history-chapters button > span { flex: 0 0 auto; color: #71869f; font-size: 11px; font-variant-numeric: tabular-nums; }
  .history-chapters button:hover, .history-chapters button[aria-current='step'] { color: #f8fafc; border-color: color-mix(in srgb, var(--active-history-accent) 50%, #a0b3ca20); background: color-mix(in srgb, var(--active-history-accent) 8%, transparent); }
  .history-chapters button[aria-current='step'] > span { color: var(--active-history-accent); }
  .history-period-note { margin: 14px 0 0; color: #8e9fb6; font-size: 12px; line-height: 1.7; }

  .history-timeline { position: relative; margin-top: 50px; padding: 0 0 24px; }
  .history-rail, .history-rail-progress, .history-rail-head { position: absolute; left: 50%; pointer-events: none; }
  .history-rail, .history-rail-progress { top: 0; bottom: 0; width: 2px; transform: translateX(-50%); }
  .history-rail { background: #a4b7cf22; }
  .history-rail-progress { background: linear-gradient(#fbbf24, #fb7185 45%, #38bdf8); transform: translateX(-50%) scaleY(var(--history-scroll-progress)); transform-origin: top; }
  .history-rail-head { top: calc(var(--history-scroll-progress) * 100%); z-index: 3; width: 10px; height: 10px; border-radius: 50%; background: #fff; box-shadow: 0 0 18px 4px var(--active-history-accent); transform: translate(-50%, -50%); opacity: min(1, calc(var(--history-scroll-progress) * 10)); }

  .history-milestone { --history-enter-x: -24px; --history-drift: 0px; position: relative; width: calc(50% - 46px); min-width: 0; margin-bottom: 56px; opacity: .72; transform: translate3d(var(--history-enter-x), 28px, 0); transition: opacity .45s ease, transform .65s cubic-bezier(.16, 1, .3, 1); }
  .history-milestone.is-left { margin-right: calc(50% + 46px); }
  .history-milestone.is-right { --history-enter-x: 24px; margin-left: calc(50% + 46px); }
  .history-milestone[data-history-revealed='true'], .history-milestone.is-active { opacity: 1; transform: translate3d(0, 0, 0); }
  .history-milestone:last-child { margin-bottom: 0; }
  .history-milestone::before { content: ''; position: absolute; top: 48px; width: 46px; height: 1px; background: color-mix(in srgb, var(--history-accent) 45%, transparent); transform: scaleX(0); transition: transform .45s .12s ease; }
  .history-milestone.is-left::before { right: -46px; transform-origin: right; }
  .history-milestone.is-right::before { left: -46px; transform-origin: left; }
  .history-milestone[data-history-revealed='true']::before { transform: scaleX(1); }
  .history-node { position: absolute; top: 37px; z-index: 2; width: 24px; height: 24px; border: 1px solid var(--history-accent); border-radius: 50%; background: #0b1525; box-shadow: inset 0 0 0 6px #0b1525; transition: background .25s, box-shadow .25s; }
  .history-milestone.is-left .history-node { right: -58px; }
  .history-milestone.is-right .history-node { left: -58px; }
  .history-milestone.is-active .history-node { background: var(--history-accent); box-shadow: inset 0 0 0 6px #0b1525, 0 0 18px color-mix(in srgb, var(--history-accent) 30%, transparent); }
  .history-milestone.is-active .history-node::after { content: ''; position: absolute; inset: -6px; border: 1px solid var(--history-accent); border-radius: 50%; animation: history-node-arrive 700ms ease-out both; }
  .history-ghost-year { position: absolute; top: 30px; pointer-events: none; color: color-mix(in srgb, var(--history-accent) 17%, transparent); font-size: 120px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; transform: translateY(var(--history-drift)); }
  .history-milestone.is-left .history-ghost-year { left: calc(100% + 92px); }
  .history-milestone.is-right .history-ghost-year { right: calc(100% + 92px); }

  .history-card { position: relative; padding: 26px; border: 1px solid #9fb0c027; border-top: 2px solid color-mix(in srgb, var(--history-accent) 75%, transparent); border-radius: 20px; background: linear-gradient(130deg, color-mix(in srgb, var(--history-accent) 6%, transparent), transparent 55%), #111b2a; box-shadow: 0 18px 40px #0000001c; transition: border-color .3s, box-shadow .3s; }
  .history-milestone.is-active .history-card { border-color: color-mix(in srgb, var(--history-accent) 65%, #9fb0c027); box-shadow: 0 18px 44px #00000024, 0 0 26px color-mix(in srgb, var(--history-accent) 6%, transparent); }
  .history-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .history-card-top > div { min-width: 0; }
  .history-chapter-label { display: block; color: var(--history-accent); font-size: 10px; font-weight: 800; }
  .history-phase { display: block; margin-top: 8px; color: #f8fafc; font-size: 27px; font-weight: 850; line-height: 1.3; word-break: keep-all; }
  .history-period { display: block; margin-top: 9px; color: #9fb2c9; font-size: 12px; line-height: 1.7; font-variant-numeric: tabular-nums; }
  .history-period > span { margin: 0 3px; }
  .history-card-icon { display: grid; flex: 0 0 46px; place-items: center; width: 46px; height: 46px; border: 1px solid color-mix(in srgb, var(--history-accent) 28%, transparent); border-radius: 14px; color: var(--history-accent); background: color-mix(in srgb, var(--history-accent) 9%, transparent); }
  .history-milestone[data-history-revealed='true'] .history-card-icon svg { animation: history-icon-arrive .55s .15s ease-out both; }
  .history-card h3 { margin: 26px 0 14px; color: #f8fafc; font-size: 23px; font-weight: 800; line-height: 1.5; word-break: keep-all; }
  .history-card-body { margin: 0; color: #bfccda; font-size: 15px; line-height: 1.95; word-break: keep-all; }
  .history-card-quote { position: relative; margin: 24px 0 20px; padding: 0 0 0 16px; border-left: 2px solid var(--history-accent); color: #e4edf7; font-size: 15px; font-weight: 650; line-height: 1.85; word-break: keep-all; }
  .history-card-quote > span { display: block; height: 24px; color: var(--history-accent); font-family: Georgia, serif; font-size: 38px; font-weight: 400; line-height: 1; }
  .history-points { display: flex; flex-wrap: wrap; gap: 7px; margin: 0; padding: 0; list-style: none; }
  .history-points li { max-width: 100%; padding: 5px 9px; border: 1px solid #98aec41c; border-radius: 6px; color: #a6b8cd; background: #ffffff03; font-size: 11px; line-height: 1.65; word-break: keep-all; }
  .history-milestone-button { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 44px; margin-top: 20px; padding: 12px 0 0; border: 0; border-top: 1px solid #9fb2c91c; border-radius: 0; color: #9fb2c9; background: transparent; font-size: 12px; text-align: left; }
  .history-milestone-button:hover, .history-milestone-button[aria-pressed='true'] { color: var(--history-accent); }
  .history-milestone-button svg { transition: transform .2s; }
  .history-milestone-button:hover svg { transform: translate(2px, -2px); }

  .history-ending { display: flex; flex-direction: column; align-items: center; margin-top: 60px; padding: 38px 16px 0; border-top: 1px solid #9fb2c926; text-align: center; }
  .history-ending > svg { color: #7dd3fc; }
  .history-ending > span { margin-top: 16px; color: #9ab2ca; font-size: 10px; font-weight: 750; }
  .history-ending strong { margin-top: 12px; font-size: 28px; font-weight: 800; line-height: 1.5; word-break: keep-all; }
  .history-ending p { margin: 12px 0 0; color: #9fb2c9; font-size: 14px; line-height: 1.9; }

  @keyframes history-intro { from { opacity: .5; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes history-label-in { from { opacity: .5; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes history-icon-arrive { from { opacity: .5; transform: translateY(5px) rotate(-8deg); } to { opacity: 1; transform: translateY(0) rotate(0); } }
  @keyframes history-node-arrive { from { opacity: .6; transform: scale(.7); } to { opacity: 0; transform: scale(1.7); } }

  @media (max-width: 980px) {
    .history-header { grid-template-columns: 1fr; gap: 30px; }
    .history-header h1, .history-header h2 { font-size: 44px; }
    .history-description { max-width: none; }
    .history-year-window { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; }
    .history-preview-heading, .history-preview-caption { grid-column: 1 / -1; }
    .history-preview-current { min-height: 0; }
    .history-pulse-chart { padding-top: 16px; }
  }
  @media (max-width: 880px) {
    .history-rail, .history-rail-progress, .history-rail-head { left: 12px; }
    .history-milestone, .history-milestone.is-left, .history-milestone.is-right { --history-enter-x: 0px; width: calc(100% - 44px); margin-left: 44px; margin-right: 0; margin-bottom: 32px; }
    .history-milestone::before, .history-milestone.is-left::before, .history-milestone.is-right::before { left: -32px; right: auto; width: 32px; transform-origin: left; }
    .history-milestone.is-left .history-node, .history-milestone.is-right .history-node { left: -44px; right: auto; }
    .history-ghost-year { display: none; }
  }
  @media (max-width: 620px) {
    .history-shell { width: calc(100% - 28px); padding: 32px 0 42px; }
    .history-header h1, .history-header h2 { font-size: 38px; }
    .history-lead { font-size: 19px; }
    .history-description { font-size: 14px; }
    .history-year-window { display: block; padding: 18px; border-radius: 18px; }
    .history-preview-current { min-height: 150px; }
    .history-pulse-chart svg { height: 128px; }
    .history-chapters { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 28px; }
    .history-chapters button { gap: 8px; padding: 9px 10px; font-size: 12px; }
    .history-chapters button:last-child { grid-column: 1 / -1; }
    .history-period-note { font-size: 11px; }
    .history-timeline { margin-top: 32px; }
    .history-rail, .history-rail-progress, .history-rail-head { left: 8px; }
    .history-milestone, .history-milestone.is-left, .history-milestone.is-right { width: calc(100% - 30px); margin-left: 30px; }
    .history-milestone::before, .history-milestone.is-left::before, .history-milestone.is-right::before { left: -22px; width: 22px; top: 35px; }
    .history-node { top: 27px; width: 18px; height: 18px; }
    .history-milestone.is-left .history-node, .history-milestone.is-right .history-node { left: -31px; }
    .history-milestone.is-active .history-node { box-shadow: inset 0 0 0 4px #0b1525; }
    .history-card { padding: 19px 16px 14px; border-radius: 16px; }
    .history-card-top { gap: 8px; }
    .history-card-icon { flex-basis: 35px; width: 35px; height: 35px; border-radius: 10px; }
    .history-card-icon svg { width: 21px; height: 21px; }
    .history-phase { font-size: 22px; }
    .history-period { font-size: 11px; }
    .history-card h3 { margin-top: 20px; font-size: 20px; }
    .history-card-body { font-size: 14px; line-height: 1.9; }
    .history-card-quote { margin: 20px 0 16px; padding-left: 12px; font-size: 14px; }
    .history-ending { margin-top: 34px; }
    .history-ending strong { font-size: 23px; }
  }
  @media (prefers-reduced-motion: reduce) {
    &, *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    .history-title-block, .history-year-window, .history-preview-current, .history-milestone, .history-milestone.is-left, .history-milestone.is-right { opacity: 1; transform: none; }
    .history-milestone::before { transform: scaleX(1); }
    .history-ghost-year { transform: none; }
    .history-chart-line { stroke-dashoffset: 0; }
    .history-card-icon svg { opacity: 1; transform: none; }
  }
`;
