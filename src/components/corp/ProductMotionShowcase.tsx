'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, Repeat2 } from 'lucide-react';
import styled, { keyframes } from 'styled-components';
import ProductContentStudio from './ProductContentStudio';
import ProductServiceExplorer from './ProductServiceExplorer';
import { SHOWREEL_STEPS, SHOWREEL_STARTS, SHOWREEL_TOTAL_MS, resolveShowreelSelection, type ShowreelSelection, type ShowreelStep } from './ProductShowreelSequence';

const CHAPTERS = [
  { label: '웹·앱 개발', english: '그뚠웹과 그뚠앱, 하나로 이어지는 업무.', word: 'Global.', title: ['그뚠웹에서 넓게,', '그뚠앱으로 가볍게.'], description: '큰 화면에서 정리하고, 손안에서 이어가세요.\n그뚠이와 함께하는 한글 웹·앱 업무 공간입니다.', tags: ['PC 대시보드', '모바일 워크스페이스', '다국어 연결'], steps: ['PC에서 계획', '모바일에서 실행', '세계로 연결'], href: '#web-app', cta: '웹·앱 제품 보기' },
  { label: '업무자동화', english: 'CONNECTED AUTOMATION', word: 'Automate.', title: ['서류부터 프로그램까지,', '업무가 이어지도록.'], description: '18종 서류 작성부터 발행·이체·메시지·결제 연동까지.\n브라우저와 에이전트의 반복 작업도 자동화합니다.', tags: ['18종 서류', '세금계산서 발행', '급여이체', '카카오톡 발송', 'PG 결제 연결', '브라우저·에이전트'], steps: ['자료·작업 입력', '검토·승인', '실행·결과 확인'], href: '#automation', cta: '자동화 제품 보기' },
  { label: '생성형 콘텐츠', english: 'ONE STORY. EVERY CHANNEL.', word: 'Create.', title: ['브랜드의 이야기를,', '채널에 맞는 콘텐츠로.'], description: 'YouTube 영상, TikTok 숏폼, 블로그 글, Instagram 웹툰.\n채널을 선택해 완성된 콘텐츠를 직접 살펴보세요.', tags: ['영상·숏폼', '브랜드 블로그', '인스타 웹툰'], steps: ['이야기 기획', '콘텐츠 제작', '채널별 완성'], href: '#media', cta: null },
  { label: '크리에디터', english: 'CREATE. CURATE. CONNECT.', word: 'Sell.', title: ['콘텐츠를 상품으로,', '추천을 판매로.'], description: '생성형 콘텐츠 판매와 광고형 리셀러를 한곳에서.\n네이버스토어·쿠팡파트너스·알리·테무로 연결합니다.', tags: ['생성형 콘텐츠 판매', '광고형 리셀러', '상품·제휴 링크'], steps: ['콘텐츠·상품 선택', '판매·광고 연결', '전달·반응 확인'], href: '#partner', cta: '크리에디터 제품 보기' },
] as const;

const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const getMotion = () => window.matchMedia(motionQuery).matches;
const getServerMotion = () => false;
const timecode = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
type PlaybackFrame = { index: number; step: ShowreelStep; elapsedMs: number; cycle: number; tourCycle: number };
const INITIAL_FRAME: PlaybackFrame = { index: 0, step: SHOWREEL_STEPS[0], elapsedMs: 0, cycle: 0, tourCycle: 0 };
const CHAPTER_RANGES = CHAPTERS.map((_, chapter) => {
  const start = SHOWREEL_STEPS.findIndex(step => step.chapter === chapter);
  return { start: SHOWREEL_STARTS[start], duration: SHOWREEL_STEPS.filter(step => step.chapter === chapter).reduce((sum, step) => sum + step.durationMs, 0) };
});

function updateProgress(root: HTMLElement | null, frame: PlaybackFrame) {
  if (!root) return;
  const elapsed = SHOWREEL_STARTS[frame.index] + frame.elapsedMs;
  const range = CHAPTER_RANGES[frame.step.chapter];
  root.style.setProperty('--scene-progress', String(frame.elapsedMs / frame.step.durationMs));
  root.style.setProperty('--chapter-progress', String((elapsed - range.start) / range.duration));
  root.style.setProperty('--tour-progress', String(elapsed / SHOWREEL_TOTAL_MS));
}

export default function ProductMotionShowcase() {
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<PlaybackFrame>(INITIAL_FRAME);
  const keyboardChapterRef = useRef<number | null>(null);
  const [frame, setFrame] = useState<PlaybackFrame>(INITIAL_FRAME);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [staticScene, setStaticScene] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, getMotion, getServerMotion);
  const running = playing && visible && pageVisible && !reducedMotion;
  const chapter = frame.step.chapter;
  const current = CHAPTERS[chapter]!;
  const nextStep = SHOWREEL_STEPS[(frame.index + 1) % SHOWREEL_STEPS.length];
  const second = Math.floor((SHOWREEL_STARTS[frame.index] + frame.elapsedMs) / 1000);

  useEffect(() => {
    if (keyboardChapterRef.current !== null) {
      document.getElementById(`product-film-chapter-${keyboardChapterRef.current}`)?.focus();
      keyboardChapterRef.current = null;
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
  const followProductLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.location.hash === current.href) {
      event.preventDefault();
      document.getElementById('product-catalog')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  };
  const navigateChapters = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest('button[id^="product-film-chapter-"]')) return;
    const index = ['ArrowRight', 'ArrowDown'].includes(event.key) ? (chapter + 1) % CHAPTERS.length
      : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (chapter + CHAPTERS.length - 1) % CHAPTERS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? CHAPTERS.length - 1 : null;
    if (index === null) return;
    event.preventDefault();
    keyboardChapterRef.current = index === chapter ? null : index;
    seek({ chapter: index }, false);
    document.getElementById(`product-film-chapter-${index}`)?.focus();
  };

  const introduction = <Story data-product-story>
    <div><SceneMeta>{current.english}</SceneMeta><h3>{current.title[0]} <em>{current.title[1]}</em></h3><p>{current.description}</p></div>
    {current.cta && <SceneLink href={current.href} onClick={followProductLink}>{current.cta}<ArrowUpRight size={15} aria-hidden="true" /></SceneLink>}
  </Story>;
  const renderNavigation = (controls: ReactNode) => <ChapterNav role="group" aria-label="제품 쇼릴 챕터 선택" onKeyDown={navigateChapters}>
    <NavLabel>EXPLORE PRODUCTS<span>04</span></NavLabel>
    {CHAPTERS.map((item, index) => <ChapterGroup key={item.english} data-active={chapter === index}>
      <ChapterButton id={`product-film-chapter-${index}`} type="button" aria-pressed={chapter === index} onClick={() => seek({ chapter: index })} data-active={chapter === index} data-complete={index < chapter}>
        <span className="chapter-line" aria-hidden="true"><i /></span><span className="chapter-number">0{index + 1}</span><span className="chapter-copy"><strong>{item.label}</strong><small>{item.word.replace('.', '').toUpperCase()}</small></span><span className="chapter-action" aria-hidden="true">{chapter === index ? <span className="equalizer"><i /><i /><i /></span> : <ArrowUpRight size={15} />}</span>
      </ChapterButton>
      {chapter === index && <ChapterDetails>{controls}</ChapterDetails>}
    </ChapterGroup>)}
  </ChapterNav>;

  return (
    <Showcase ref={rootRef} id="product-business-panorama" aria-labelledby="product-film-title" data-chapter={chapter} data-step={frame.index} data-step-id={frame.step.id} data-running={running} data-reduced-motion={reducedMotion} data-playback-mode="tour" data-cycle={frame.cycle} data-tour-cycle={frame.tourCycle}>
      <Inner>
        <Cinema aria-label="프로피그 제품 모션 쇼릴">
          <FilmTop data-product-header><h2 id="product-film-title"><i aria-hidden="true" /> PRODUCT SHOWCASE</h2>
          <SequenceStatus aria-live={running ? 'off' : 'polite'}>
            <div><span>NOW {String(frame.index + 1).padStart(2, '0')}</span><strong data-current-step-label>{frame.step.label}</strong><small>{timecode(frame.elapsedMs / 1000)} / {timecode(frame.step.durationMs / 1000)}</small></div>
            <div><span>{frame.index === SHOWREEL_STEPS.length - 1 ? 'BACK TO START' : 'NEXT'}</span><b data-next-step-label>{nextStep.label}</b><ArrowRight size={14} aria-hidden="true" /></div>
            <i className="scene-progress" aria-hidden="true"><i /></i>
          </SequenceStatus>
          </FilmTop>
          <Stage ref={stageRef} data-running={running} data-reduced-motion={reducedMotion || staticScene} onFocusCapture={event => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-product-story] a') || !target.closest('[data-product-interactive]')) { setPlaying(false); setStaticScene(true); }
          }}>
            <Scene>
                {chapter === 2
                  ? <ProductContentStudio introduction={introduction} renderNavigation={renderNavigation} playing={playing && visible && pageVisible} reducedMotion={reducedMotion} selectedChannel={frame.step.channel ?? 0} onChannelChange={channel => seek({ chapter: 2, channel })} automaticTour sceneElapsedMs={frame.elapsedMs} onSelect={pauseForContent} onPlaybackChange={controlContentPlayback} />
                  : <ProductServiceExplorer introduction={introduction} renderNavigation={renderNavigation} chapter={chapter} playing={running} reducedMotion={reducedMotion || staticScene} cycle={frame.cycle} sceneElapsedMs={frame.elapsedMs} selection={{ variant: frame.step.variant ?? 0, platform: frame.step.platform }} onSelectionChange={selection => seek({ chapter, ...selection })} onInteract={pauseForContent} />}
            </Scene>
          </Stage>
          <Transport data-product-transport>
            <Playback>
              {reducedMotion ? <StaticLabel>동작 줄이기 · 직접 탐색</StaticLabel> : <Control type="button" onClick={togglePlayback} aria-label={playing ? '쇼릴 일시정지' : '쇼릴 재생'}>{playing ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}<span>{playing ? '일시정지' : '재생'}</span></Control>}
              <Time aria-label={`전체 ${SHOWREEL_TOTAL_MS / 1000}초 중 ${second}초`}><span>{timecode(second)}</span><span>/ {timecode(SHOWREEL_TOTAL_MS / 1000)}</span></Time>
            </Playback>
            <TransportNote><Repeat2 size={13} aria-hidden="true" />{reducedMotion ? '상세 장면을 선택해 살펴보세요' : '21개 상세 장면이 차례로 이어집니다'}</TransportNote>
            <Navigation><button type="button" aria-label="이전 장면" onClick={() => seek(frame.index - 1)}><ChevronLeft size={18} aria-hidden="true" /></button><span>{String(frame.index + 1).padStart(2, '0')}<b>/ {SHOWREEL_STEPS.length}</b></span><button type="button" aria-label="다음 장면" onClick={() => seek(frame.index + 1)}><ChevronRight size={18} aria-hidden="true" /></button></Navigation>
            <ExecutionLink href="#company-introduction-execution" aria-label="실행 과정 살펴보기"><span>실행 과정</span><ArrowDown size={15} aria-hidden="true" /></ExecutionLink>
          </Transport>
          <TourProgress role="progressbar" aria-label="전체 상세 장면 진행률" aria-valuemin={0} aria-valuemax={SHOWREEL_TOTAL_MS / 1000} aria-valuenow={second} aria-valuetext={`${SHOWREEL_STEPS.length}개 중 ${frame.index + 1}번째 장면, ${frame.step.label}`}><i /></TourProgress>
        </Cinema>
      </Inner>
    </Showcase>
  );
}

const arrive = keyframes`
  from { opacity: .35; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
`;

const equalize = keyframes`0%, 100% { transform: scaleY(.4); } 50% { transform: scaleY(1); }`;
const SequenceStatus = styled.div`
  display: flex; flex: 1; min-width: 0; align-items: center; justify-content: space-between; gap: 16px; min-height: 58px; padding-left: 20px; border-left: 1px solid #29405e;
  > div { display: flex; align-items: center; gap: 13px; min-width: 0; }
  span { font-size: 9px; font-weight: 700; color: #93c5fd; white-space: nowrap; }
  strong { font-size: 16px; color: #f3f7ff; word-break: keep-all; }
  small { font-size: 10px; color: #a9bed7; font-variant-numeric: tabular-nums; white-space: nowrap; }
  b { font-size: 12px; color: #c2d5ed; font-weight: 500; word-break: keep-all; }
  svg { color: #93c5fd; flex-shrink: 0; }
  .scene-progress { position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: #1c3451; }
  .scene-progress > i { display: block; height: 100%; background: #5eead4; transform: scaleX(var(--scene-progress, 0)); transform-origin: left; }
  @container (max-width: 620px) { flex-basis: 100%; flex-wrap: wrap; gap: 6px; min-height: 42px; padding: 0 0 8px; border-left: 0; > div { gap: 8px; } strong { font-size: 13px; } small { font-size: 9px; } b { font-size: 10px; } > div:last-of-type { margin-left: auto; } }
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
  position: relative; min-height: 60px; display: flex; align-items: center; gap: 20px; padding: 0 20px; border-bottom: 1px solid #29405e; background: #0c1c33;
  > h2 { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; margin: 0; font-size: 11px; font-weight: 750; color: #b9d9ff; }
  > h2 > i { width: 6px; height: 6px; background: #5eead4; border-radius: 50%; box-shadow: 0 0 12px #5eead450; }
  @container (max-width: 620px) { flex-wrap: wrap; gap: 4px; padding: 10px 14px 0; > h2 { font-size: 10px; min-height: 22px; } }
`;
const Stage = styled.div`
  position: relative;
  &[data-running='false'] *, &[data-running='false'] *::before, &[data-running='false'] *::after { animation-play-state: paused !important; }
  &[data-reduced-motion='true'] * { animation: none !important; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;
const Scene = styled.div`
  min-width: 0; animation: ${arrive} 500ms ease both;
`;
const Story = styled.div`
  min-width: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 0 0 14px; color: #f3f7ff;
  > div { min-width: 0; }
  h3 { font-size: 28px; font-weight: 700; line-height: 1.4; margin: 6px 0 0; word-break: keep-all; text-wrap: balance; }
  h3 em { font-style: normal; color: #93c5fd; }
  p { margin: 10px 0 0; font-size: 15px; line-height: 1.7; color: #bdc9da; word-break: keep-all; }
  @container (max-width: 620px) { flex-wrap: wrap; gap: 0; padding-bottom: 8px; h3 { font-size: 22px; margin-top: 0; } p { margin-top: 8px; font-size: 13px; } }
`;
const SceneMeta = styled.div`
  color: #9fbad5; font-size: 10px; font-weight: 650; letter-spacing: .1em;
  @container (max-width: 620px) { display: none; }
`;
const SceneLink = styled.a`
  min-height: 44px; display: inline-flex; align-items: center; gap: 8px; color: #dbeafe; font-size: 11px; font-weight: 650; text-decoration: none; white-space: nowrap; flex-shrink: 0;
  svg { color: #93c5fd; transition: transform 180ms ease; }
  &:hover svg { transform: translate(3px, -3px); }
`;
const Transport = styled.div`
  min-height: 54px; padding: 4px 12px; border-top: 1px solid #29405e; background: #081426; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  @container (max-width: 620px) { padding: 4px 6px; gap: 5px; }
`;
const Playback = styled.div`display: flex; align-items: center; gap: 14px; @container (max-width: 620px) { gap: 8px; }`;
const Control = styled.button`
  display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; border: 1px solid #4775a4; border-radius: 8px; background: #173b62; color: #e2efff; padding: 0 14px; font-size: 11px !important; transition: background 160ms, transform 160ms;
  svg { width: 13px; height: 13px; }
  &:hover { background: #245586; transform: translateY(-2px); } &:active { transform: translateY(0) scale(.97); }
  @container (max-width: 620px) { padding: 0 10px; font-size: 10px !important; }
`;
const StaticLabel = styled.span`font-size: 10px; color: #a8cfff;`;
const Time = styled.span`
  display: inline-flex; gap: 7px; font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums; font-size: 10px; color: #adbed4; > span:first-child { color: #f3f7ff; }
  @container (max-width: 380px) { gap: 4px; font-size: 9px; }
  @container (max-width: 620px) { > span:last-child { display: none; } }
  @container (max-width: 340px) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;
const TransportNote = styled.span`display: inline-flex; align-items: center; gap: 7px; font-size: 10px; color: #adbed4; @container (max-width: 1100px) { display: none; }`;
const Navigation = styled.div`
  display: flex; align-items: center; gap: 9px;
  button { width: 44px; height: 44px; display: grid; place-items: center; background: #10243d; border: 1px solid #344b68; border-radius: 8px; color: #dbeafe; transition: background 160ms, transform 160ms; }
  button:hover { background: #1e4166; transform: translateY(-2px); } button:active { transform: scale(.94); }
  > span { display: inline-flex; gap: 6px; font-size: 10px; font-variant-numeric: tabular-nums; }
  b { color: #adbed4; font-weight: 400; }
  @container (max-width: 620px) { gap: 4px; > span { display: none; } }
`;
const ChapterNav = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px;
  @container product-showreel (max-width: 760px) { gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
const NavLabel = styled.div`
  display: flex; justify-content: space-between; padding: 0 5px 6px; color: #8daac8; font-size: 9px; letter-spacing: .07em;
  span { color: #5eead4; }
  @container product-showreel (max-width: 760px) { display: none; }
`;
const ChapterGroup = styled.div`
  min-width: 0;
  @container product-showreel (max-width: 760px) { display: contents; }
`;
const ChapterDetails = styled.div`
  min-width: 0; padding: 10px 0 4px;
  @container product-showreel (max-width: 760px) { grid-column: 1 / -1; order: 1; padding: 3px 0 0; }
`;
const ChapterButton = styled.button`
  position: relative; overflow: hidden; width: 100%; min-width: 0; min-height: 54px; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #304b6b; border-radius: 7px; background: #0b1b32; color: #bdc9da; text-align: left;
  transition: transform 200ms cubic-bezier(.2,.7,.2,1), background 200ms, border-color 200ms, box-shadow 200ms;
  .chapter-line { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: #233d5b; overflow: hidden; }
  .chapter-line i { display: block; height: 100%; background: #60a5fa; transform: scaleX(0); transform-origin: left; }
  &[data-active='true'] { color: #f3f7ff; background: #153352; border-color: #60a5fa; box-shadow: 0 7px 24px #02060e50, inset 0 1px 0 #ffffff12; .chapter-line i { transform: scaleX(var(--chapter-progress)); } }
  &[data-complete='true'] .chapter-line i { transform: scaleX(1); }
  .chapter-number { display: grid; place-items: center; flex-shrink: 0; width: 28px; height: 30px; border-radius: 7px; background: #18304d; color: #a8cfff; font-size: 11px; font-variant-numeric: tabular-nums; }
  &[data-active='true'] .chapter-number { background: #60a5fa; color: #07101f; font-weight: 800; }
  .chapter-copy { display: grid; gap: 4px; }
  strong { font-size: 12px; font-weight: 750; word-break: keep-all; }
  small { font-size: 9px; color: #adbed4; }
  .chapter-action { margin-left: auto; display: flex; align-items: center; color: #93c5fd; }
  .chapter-action > svg { transition: transform 180ms; }
  &:hover { border-color: #93c5fd; background: #153352; .chapter-action > svg { transform: translate(2px, -2px); } }
  &:active { transform: translateY(0) scale(.985); }
  .equalizer { display: inline-flex; align-items: center; gap: 3px; height: 19px; }
  .equalizer i { width: 3px; height: 16px; background: #93c5fd; border-radius: 2px; animation: ${equalize} 1.2s ease-in-out infinite; }
  .equalizer i:nth-child(2) { animation-delay: -.4s; } .equalizer i:nth-child(3) { animation-delay: -.8s; }
  [data-running='false'] & .equalizer i { animation-play-state: paused; }
  @container product-showreel (max-width: 960px) { gap: 8px; strong { font-size: 11px; } .chapter-action { display: none; } }
  @container product-showreel (max-width: 760px) { min-height: 44px; padding: 6px 8px; strong { font-size: 12px; } small { display: none; } }
  @media (prefers-reduced-motion: reduce) { transform: none !important; .equalizer i { animation: none; } }
`;
const ExecutionLink = styled.a`
  display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; min-width: 44px; color: #a8cfff; font-size: 11px; text-decoration: none; white-space: nowrap;
  @container (max-width: 620px) { border: 1px solid #344b68; border-radius: 8px; > span { display: none; } }
`;
