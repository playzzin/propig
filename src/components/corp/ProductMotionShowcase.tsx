'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEventHandler, type ReactNode } from 'react';
import { ArrowDown, ArrowUpRight, ChevronLeft, ChevronRight, List, Pause, Play } from 'lucide-react';
import styled from 'styled-components';
import ProductContentStudio from './ProductContentStudio';
import ProductServiceExplorer from './ProductServiceExplorer';
import { SHOWREEL_CHAPTERS as CHAPTERS, SHOWREEL_STEPS, SHOWREEL_STARTS, SHOWREEL_TOTAL_MS, resolveShowreelSelection, type ShowreelSelection, type ShowreelStep } from './ProductShowreelSequence';

const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const getMotion = () => window.matchMedia(motionQuery).matches;
const getServerMotion = () => false;
const timecode = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const NEXT_SCENE_PRELOAD_MS = 3000;
type PlaybackFrame = { index: number; step: ShowreelStep; elapsedMs: number; cycle: number; tourCycle: number };
const INITIAL_FRAME: PlaybackFrame = { index: 0, step: SHOWREEL_STEPS[0], elapsedMs: 0, cycle: 0, tourCycle: 0 };
const CHAPTER_RANGES = new Map(CHAPTERS.map(({ id }) => {
  const start = SHOWREEL_STEPS.findIndex(step => step.chapterId === id);
  const duration = SHOWREEL_STEPS.filter(step => step.chapterId === id).reduce((sum, step) => sum + step.durationMs, 0);
  return [id, { start: SHOWREEL_STARTS[start], duration }];
}));

function updateProgress(root: HTMLElement | null, frame: PlaybackFrame) {
  if (!root) return;
  const elapsed = SHOWREEL_STARTS[frame.index] + frame.elapsedMs;
  const range = CHAPTER_RANGES.get(frame.step.chapterId)!;
  root.style.setProperty('--scene-progress', String(frame.elapsedMs / frame.step.durationMs));
  root.style.setProperty('--chapter-progress', String((elapsed - range.start) / range.duration));
  root.style.setProperty('--tour-progress', String(elapsed / SHOWREEL_TOTAL_MS));
}

export default function ProductMotionShowcase({ onCatalogLink }: { onCatalogLink: MouseEventHandler<HTMLAnchorElement> }) {
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<PlaybackFrame>(INITIAL_FRAME);
  const chapterFocusRef = useRef<number | null>(null);
  const preloadedImages = useRef(new Set<string>());
  const [frame, setFrame] = useState<PlaybackFrame>(INITIAL_FRAME);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [staticScene, setStaticScene] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, getMotion, getServerMotion);
  const running = playing && visible && pageVisible && !reducedMotion;
  const chapter = CHAPTERS.findIndex(item => item.id === frame.step.chapterId);
  const current = CHAPTERS[chapter];
  const categoryHref = `#${current.id}`;
  const nextStep = SHOWREEL_STEPS[(frame.index + 1) % SHOWREEL_STEPS.length];
  const preloadNext = running && frame.elapsedMs >= frame.step.durationMs - NEXT_SCENE_PRELOAD_MS;
  const second = Math.floor((SHOWREEL_STARTS[frame.index] + frame.elapsedMs) / 1000);

  useEffect(() => {
    if (chapterFocusRef.current !== null) {
      document.getElementById(`product-film-chapter-${chapterFocusRef.current}`)?.focus({ preventScroll: true });
      chapterFocusRef.current = null;
    }
  }, [chapter]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(entries => {
      const entry = entries.filter(item => item.target === stage).at(-1);
      if (entry) setVisible(entry.isIntersecting);
    }, { threshold: 0 });
    observer.observe(stage);
    const updateVisibility = () => setPageVisible(!document.hidden);
    const motion = window.matchMedia(motionQuery);
    const stopForMotionPreference = () => { setPlaying(false); setStaticScene(true); };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    motion.addEventListener('change', stopForMotionPreference);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', updateVisibility);
      motion.removeEventListener('change', stopForMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    let request = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const old = timelineRef.current;
      const elapsedMs = old.elapsedMs + Math.max(0, now - previous);
      previous = now;
      let next = { ...old, elapsedMs };
      if (elapsedMs >= old.step.durationMs) {
        const index = (old.index + 1) % SHOWREEL_STEPS.length;
        // Give every scene its complete animation, even after a slow foreground frame.
        next = { index, step: SHOWREEL_STEPS[index], elapsedMs: 0, cycle: old.cycle + 1, tourCycle: old.tourCycle + (index === 0 ? 1 : 0) };
      }
      timelineRef.current = next;
      updateProgress(rootRef.current, next);
      if (next.cycle !== old.cycle || Math.floor(next.elapsedMs / 1000) !== Math.floor(old.elapsedMs / 1000)) {
        setFrame({ ...next, elapsedMs: Math.floor(next.elapsedMs / 1000) * 1000 });
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [running]);

  useEffect(() => {
    if (!preloadNext || !nextStep.images) return;
    const requested = preloadedImages.current;
    for (const source of nextStep.images) {
      if (frame.step.images?.includes(source) || requested.has(source)) continue;
      requested.add(source);
      const image = new window.Image();
      image.fetchPriority = 'low';
      image.onerror = () => requested.delete(source);
      image.src = source;
    }
  }, [frame.step.images, nextStep, preloadNext]);

  const seek = (selection: ShowreelSelection | number, resume = playing) => {
    const resolved = typeof selection === 'number'
      ? { index: (selection + SHOWREEL_STEPS.length) % SHOWREEL_STEPS.length, step: SHOWREEL_STEPS[(selection + SHOWREEL_STEPS.length) % SHOWREEL_STEPS.length] }
      : resolveShowreelSelection(selection);
    const next = { ...resolved, elapsedMs: 0, cycle: timelineRef.current.cycle + 1, tourCycle: timelineRef.current.tourCycle };
    timelineRef.current = next;
    setFrame(next);
    updateProgress(rootRef.current, next);
    setStaticScene(!resume || reducedMotion);
    setPlaying(resume);
  };

  const togglePlayback = () => {
    if (!playing && staticScene) seek(frame.step, true);
    else setPlaying(value => !value);
  };
  const pauseForContent = () => setPlaying(false);
  const controlContentPlayback = (next: boolean) => {
    if (next && staticScene) seek(frame.step, true);
    else setPlaying(next);
  };
  const navigateChapters = (event: KeyboardEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-chapter-index]');
    if (!button) return;
    const focusedChapter = Number(button.dataset.chapterIndex);
    const index = ['ArrowRight', 'ArrowDown'].includes(event.key) ? (focusedChapter + 1) % CHAPTERS.length
      : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (focusedChapter + CHAPTERS.length - 1) % CHAPTERS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? CHAPTERS.length - 1 : null;
    if (index === null) return;
    event.preventDefault();
    chapterFocusRef.current = index === chapter ? null : index;
    seek({ chapterId: CHAPTERS[index].id }, false);
    document.getElementById(`product-film-chapter-${index}`)?.focus();
  };

  const introduction = <Story data-product-story>
    <div><h3>{current.title[0]} <em>{current.title[1]}</em></h3><p>{current.description}</p></div>
    {current.cta && <SceneLink href={categoryHref} onClick={onCatalogLink}>{current.cta}<ArrowUpRight size={15} aria-hidden="true" /></SceneLink>}
  </Story>;
  const renderNavigation = (controls: ReactNode) => <ChapterNav role="group" aria-label="제품 쇼릴 챕터 선택" onKeyDown={navigateChapters}>
    <ChapterGrid>
      {CHAPTERS.map((item, index) => <ChapterButton
        key={item.id}
        id={`product-film-chapter-${index}`}
        data-chapter-index={index}
        type="button"
        aria-pressed={chapter === index}
        onClick={event => {
          if (chapter !== index && document.activeElement === event.currentTarget) chapterFocusRef.current = index;
          seek({ chapterId: item.id });
        }}
        data-active={chapter === index}
        data-complete={index < chapter}
      >
        <strong>{item.label}</strong>
        <span className="chapter-line" aria-hidden="true"><i /></span>
        <ChevronRight size={16} aria-hidden="true" />
      </ChapterButton>
      )}
    </ChapterGrid>
    <ChapterDetails>{controls}</ChapterDetails>
  </ChapterNav>;

  return (
    <Showcase ref={rootRef} id="product-business-panorama" aria-labelledby="product-film-title" data-chapter={chapter} data-chapter-id={current.id} data-showreel-product-id={frame.step.productId} data-step={frame.index} data-step-id={frame.step.id} data-running={running} data-reduced-motion={reducedMotion} data-playback-mode="tour" data-cycle={frame.cycle} data-tour-cycle={frame.tourCycle}>
      <Inner>
        <Cinema aria-label="프로피그 제품 모션 쇼릴">
          <FilmTop data-product-header>
            <FilmSummary>
              <h2 id="product-film-title">프로피그 제품 쇼릴</h2>
              <SequenceStatus aria-live={running ? 'off' : 'polite'}>
                <div>
                  <span>NOW</span><strong data-current-step-label>{frame.step.label}</strong>
                  <small>{timecode(frame.elapsedMs / 1000)} / {timecode(frame.step.durationMs / 1000)}</small>
                  <i className="scene-progress" aria-hidden="true"><i /></i>
                </div>
                <div><span>다음</span><b data-next-step-label>{nextStep.label}</b></div>
              </SequenceStatus>
              <CatalogJump href="#product-catalog" onClick={onCatalogLink}><List size={17} aria-hidden="true" />제품 목록</CatalogJump>
            </FilmSummary>
            <Transport data-product-transport>
              <Navigation role="group" aria-label="쇼릴 재생 제어">
                <button type="button" aria-label="이전 장면" onClick={() => seek(frame.index - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
                {!reducedMotion && <Control type="button" onClick={togglePlayback} aria-label={playing ? '쇼릴 일시정지' : '쇼릴 재생'}>
                  {playing ? <Pause size={15} fill="currentColor" aria-hidden="true" /> : <Play size={15} fill="currentColor" aria-hidden="true" />}
                  <span>{playing ? '일시정지' : '재생'}</span>
                </Control>}
                <button type="button" aria-label="다음 장면" onClick={() => seek(frame.index + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
              </Navigation>
              <Playback>
                <span aria-label={`장면 ${frame.index + 1} / ${SHOWREEL_STEPS.length}`}>{frame.index + 1} / {SHOWREEL_STEPS.length}</span>
                <Time aria-label={`전체 ${SHOWREEL_TOTAL_MS / 1000}초 중 ${second}초`}><span>{timecode(second)}</span><span>/ {timecode(SHOWREEL_TOTAL_MS / 1000)}</span></Time>
                {reducedMotion && <StaticLabel>동작 줄이기</StaticLabel>}
              </Playback>
              <ExecutionLink href="#company-introduction-execution" aria-label="실행 과정 살펴보기"><span>실행 과정</span><ArrowDown size={15} aria-hidden="true" /></ExecutionLink>
            </Transport>
            <TourProgress role="progressbar" aria-label="전체 상세 장면 진행률" aria-valuemin={0} aria-valuemax={SHOWREEL_TOTAL_MS / 1000} aria-valuenow={second} aria-valuetext={`${SHOWREEL_STEPS.length}개 중 ${frame.index + 1}번째 장면, ${frame.step.label}`}><i /></TourProgress>
          </FilmTop>
          <Stage
            ref={stageRef}
            data-running={running}
            data-reduced-motion={reducedMotion || staticScene}
            onFocusCapture={event => {
              const target = event.target as HTMLElement;
              const chapterHasKeyboardFocus = event.relatedTarget && target.matches('button[data-chapter-index]:focus-visible');
              if (chapterHasKeyboardFocus || target.closest('[data-product-story] a') || !target.closest('[data-product-interactive]')) {
                setPlaying(false);
                setStaticScene(true);
              }
            }}
          >
            {current.id === 'media' ? (
              <ProductContentStudio
                introduction={introduction}
                renderNavigation={renderNavigation}
                playing={playing && visible && pageVisible}
                reducedMotion={reducedMotion}
                selectedChannel={frame.step.channel}
                onChannelChange={channel => seek({ chapterId: current.id, channel })}
                automaticTour
                sceneElapsedMs={frame.elapsedMs}
                onSelect={pauseForContent}
                onPlaybackChange={controlContentPlayback}
              />
            ) : (
              <ProductServiceExplorer
                introduction={introduction}
                renderNavigation={renderNavigation}
                chapter={chapter}
                playing={running}
                reducedMotion={reducedMotion || staticScene}
                cycle={frame.cycle}
                sceneElapsedMs={frame.elapsedMs}
                selection={{ variant: frame.step.variant ?? 0, platform: frame.step.platform }}
                onSelectionChange={selection => seek({ chapterId: current.id, ...selection })}
                onInteract={pauseForContent}
              />
            )}
          </Stage>
        </Cinema>
      </Inner>
    </Showcase>
  );
}

const SequenceStatus = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto);
  align-items: center;
  gap: 16px;
  min-width: 0;

  > div { position: relative; display: flex; align-items: center; gap: 9px; min-width: 0; }
  span { font-size: 10px; font-weight: 700; color: #8fb5dd; white-space: nowrap; }
  strong, b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { font-size: 16px; color: #f3f7ff; }
  small { font-size: 11px; color: #adbed4; font-variant-numeric: tabular-nums; white-space: nowrap; }
  b { font-size: 13px; color: #c2d5ed; font-weight: 550; }
  .scene-progress { position: absolute; inset: auto 0 -5px; height: 2px; background: #243e57; }
  .scene-progress > i { display: block; height: 100%; background: #5eead4; transform: scaleX(var(--scene-progress, 0)); transform-origin: left; }

  @container product-showreel (max-width: 680px) {
    grid-column: 1 / -1;
    grid-row: 2;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 9px;
    padding-bottom: 6px;
    > div { gap: 6px; }
    > div:last-of-type { justify-content: flex-end; }
    strong { font-size: 13px; }
    b { font-size: 12px; }
    small { display: none; }
  }
`;
const TourProgress = styled.div`
  height: 3px; background: #203b5c; overflow: hidden;
  > i { display: block; height: 100%; background: #93c5fd; transform: scaleX(var(--tour-progress, 0)); transform-origin: left; }
`;
const Showcase = styled.section`
  --film-paper: #f3f7ff;
  --film-ink: #f3f7ff;
  --film-muted: #adbed4;
  --film-lime: #93c5fd;
  --film-line: #29405e;
  --chapter-progress: 0;
  --showcase-background: linear-gradient(#94a3b80e 1px, transparent 1px), linear-gradient(90deg, #94a3b80e 1px, transparent 1px), linear-gradient(145deg, #07101f 0%, #0a1830 52%, #081221 100%);
  width: 100%; padding: 18px 24px 0; color: var(--film-paper); background-color: #07101f; container-type: inline-size; container-name: product-showreel;
  #content-area &#product-business-panorama { background-image: var(--showcase-background) !important; background-size: 56px 56px, 56px 56px, 100% 100%; }
  a, button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  button { font: inherit; cursor: pointer; }
  :is(a, button):focus-visible { outline: 3px solid #93c5fd; outline-offset: 4px; }
  @media (max-width: 600px) { padding: 12px 12px 0; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
`;
const Inner = styled.div`max-width: 1480px; margin: 0 auto;`;
const Cinema = styled.div`
  overflow: hidden; color: var(--film-paper); background: #0a1830; border: 1px solid #2b4260; border-radius: 16px; box-shadow: 0 24px 70px #02060e40;
  :is(a, button):focus-visible { outline-color: #93c5fd; outline-offset: -3px; }
  @container (max-width: 600px) { border-radius: 12px; }
`;
const FilmTop = styled.div`
  background: #0c1c33;
`;
const FilmSummary = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 24px;
  min-height: 64px;
  padding: 6px 18px;

  h2 {
    margin: 0;
    color: #e0edff;
    font-size: 14px;
    font-weight: 750;
    word-break: keep-all;
  }

  @container product-showreel (max-width: 680px) {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px 12px;
    padding: 5px 10px 0;
    h2 { font-size: 13px; }
  }
`;
const CatalogJump = styled.a`
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-inline: 14px;
  border-radius: 8px;
  background: #9de6d6;
  color: #092620;
  font-size: 13px;
  font-weight: 750;
  text-decoration: none;
  white-space: nowrap;

  &:hover { background: #c6f5e9; }
  &:focus-visible { outline-color: #092620; }
  @container product-showreel (max-width: 680px) { gap: 5px; padding-inline: 10px; font-size: 12px; }
`;
const Stage = styled.div`
  position: relative;
  &[data-running='false'] *, &[data-running='false'] *::before, &[data-running='false'] *::after { animation-play-state: paused !important; }
  &[data-reduced-motion='true'] * { animation: none !important; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;
const Story = styled.div`
  min-width: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 0 0 14px; color: #f3f7ff;
  > div { min-width: 0; }
  h3 { font-size: 28px; font-weight: 750; line-height: 1.32; margin: 0; word-break: keep-all; text-wrap: balance; }
  h3 em { font-style: normal; color: #93c5fd; }
  p { margin: 10px 0 0; font-size: 15px; line-height: 1.7; color: #bdc9da; word-break: keep-all; }
  @container (max-width: 620px) { flex-wrap: wrap; gap: 0; padding-bottom: 8px; h3 { font-size: 22px; margin-top: 0; } p { margin-top: 8px; font-size: 13px; } }
`;
const SceneLink = styled.a`
  min-height: 44px; display: inline-flex; align-items: center; gap: 8px; color: #dbeafe; font-size: 11px; font-weight: 650; text-decoration: none; white-space: nowrap; flex-shrink: 0;
  svg { color: #93c5fd; transition: transform 180ms ease; }
  &:hover svg { transform: translate(3px, -3px); }
`;
const Transport = styled.div`
  min-height: 52px;
  padding: 3px 18px;
  border-top: 1px solid #273f59;
  background: #0a192e;
  display: flex;
  align-items: center;
  gap: 14px;

  @container product-showreel (max-width: 680px) { padding-inline: 8px; gap: 8px; }
  @container product-showreel (max-width: 340px) { padding-inline: 6px; gap: 5px; }
`;
const Playback = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  color: #dbeafe;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  @container product-showreel (max-width: 680px) { gap: 8px; font-size: 10px; }
  @container product-showreel (max-width: 340px) { gap: 5px; }
`;
const Control = styled.button``;
const StaticLabel = styled.span`
  color: #a8cfff;
  @container product-showreel (max-width: 340px) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
`;
const Time = styled.span`
  display: inline-flex;
  gap: 5px;
  font-family: ui-monospace, monospace;
  color: #adbed4;
  > span:first-child { color: #f3f7ff; }
  @container product-showreel (max-width: 340px) { > span:last-child { display: none; } }
`;
const Navigation = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  > button {
    min-width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid #3a5677;
    border-radius: 8px;
    background: #10243d;
    color: #dbeafe;
    transition: background 160ms;
  }
  > button:hover { background: #1e4166; }
  > ${Control} { padding-inline: 11px; font-size: 12px; font-weight: 700; background: #173b62; border-color: #5079a1; }
  @container product-showreel (max-width: 680px) { gap: 3px; > ${Control} { padding-inline: 8px; font-size: 11px; } }
`;
const ChapterNav = styled.div`
  display: grid;
  gap: 14px;
  @container product-showreel (max-width: 760px) { gap: 7px; }
`;
const ChapterGrid = styled.div`
  display: grid;
  gap: 6px;
  @container product-showreel (max-width: 760px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }
`;
const ChapterDetails = styled.div`
  min-width: 0;
  padding-top: 14px;
  border-top: 1px solid #29405e;
  @container product-showreel (max-width: 760px) { padding-top: 7px; }
`;
const ChapterButton = styled.button`
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #304b6b;
  border-radius: 8px;
  background: #0b1b32;
  color: #bdc9da;
  text-align: left;
  transition: background 160ms, border-color 160ms;

  .chapter-line { position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: #233d5b; }
  .chapter-line i { display: block; height: 100%; background: #9de6d6; transform: scaleX(0); transform-origin: left; }
  &[data-active='true'] {
    color: #f3f7ff;
    background: #183654;
    border-color: #86bcef;
    .chapter-line i { transform: scaleX(var(--chapter-progress)); }
  }
  &[data-complete='true'] .chapter-line i { transform: scaleX(1); background: #6895bd; }
  strong { font-size: 13px; font-weight: 750; line-height: 1.3; word-break: keep-all; }
  svg { flex-shrink: 0; color: #93c5fd; }
  &:hover { border-color: #93c5fd; background: #153352; }

  @container product-showreel (max-width: 760px) {
    min-height: 44px;
    justify-content: center;
    padding: 4px;
    text-align: center;
    strong { font-size: 11px; }
    svg { display: none; }
  }
`;
const ExecutionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  min-width: 44px;
  margin-left: auto;
  padding-inline: 9px;
  border: 1px solid #344b68;
  border-radius: 8px;
  color: #b9d9ff;
  font-size: 11px;
  text-decoration: none;
  white-space: nowrap;

  &:hover { background: #17314c; }
  @container product-showreel (max-width: 680px) { padding-inline: 0; > span { display: none; } }
`;
