'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, Repeat2 } from 'lucide-react';
import styled, { keyframes } from 'styled-components';
import ProductContentStudio from './ProductContentStudio';
import ProductServiceExplorer from './ProductServiceExplorer';
import { SHOWREEL_STEPS, SHOWREEL_STARTS, SHOWREEL_TOTAL_MS, resolveShowreelSelection, type ShowreelSelection, type ShowreelStep } from './ProductShowreelSequence';

const CHAPTERS = [
  { label: '웹·앱 개발', english: 'CONNECTED WEB EXPERIENCES', word: 'Global.', title: ['손안의 화면에서,', '세계의 고객까지.'], description: '휴대폰과 컴퓨터, 어디서나 같은 인터넷 웹.\n기기와 국경을 넘어 이어지는 서비스를 만듭니다.', tags: ['모바일 웹', 'PC 웹', '글로벌 연결'], steps: ['기기별 접속', '인터넷으로 연결', '세계로 확장'], href: '#web-app', cta: '웹·앱 제품 보기' },
  { label: '업무자동화', english: 'CONNECTED AUTOMATION', word: 'Automate.', title: ['서류부터 프로그램까지,', '업무가 이어지도록.'], description: '18종 서류 작성부터 발행·이체·메시지·결제 연동까지.\n브라우저와 에이전트의 반복 작업도 자동화합니다.', tags: ['18종 서류', '세금계산서 발행', '급여이체', '카카오톡 발송', 'PG 결제 연결', '브라우저·에이전트'], steps: ['자료·작업 입력', '검토·승인', '실행·결과 확인'], href: '#automation', cta: '자동화 제품 보기' },
  { label: '생성형 콘텐츠', english: 'ONE STORY. EVERY CHANNEL.', word: 'Create.', title: ['브랜드의 이야기를,', '채널에 맞는 콘텐츠로.'], description: 'YouTube 영상, TikTok 숏폼, 블로그 글, Instagram 웹툰.\n채널을 선택해 완성된 콘텐츠를 직접 살펴보세요.', tags: ['영상·숏폼', '브랜드 블로그', '인스타 웹툰'], steps: ['이야기 기획', '콘텐츠 제작', '채널별 완성'], href: '#media', cta: '콘텐츠 제품 보기' },
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
  const [frame, setFrame] = useState<PlaybackFrame>(INITIAL_FRAME);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [playbackMode, setPlaybackMode] = useState<'tour' | 'chapter'>('tour');
  const [staticScene, setStaticScene] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, getMotion, getServerMotion);
  const running = playing && visible && pageVisible && !reducedMotion;
  const chapter = frame.step.chapter;
  const current = CHAPTERS[chapter]!;
  const nextStep = SHOWREEL_STEPS[(frame.index + 1) % SHOWREEL_STEPS.length];
  const second = Math.floor((SHOWREEL_STARTS[frame.index] + frame.elapsedMs) / 1000);
  const activeStep = Math.min(2, Math.floor(frame.elapsedMs / (frame.step.durationMs / 3)));

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: 0 });
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
        const index = playbackMode === 'chapter' ? old.index : (old.index + 1) % SHOWREEL_STEPS.length;
        // Give every scene its complete animation, even after a slow foreground frame.
        next = { index, step: playbackMode === 'chapter' ? old.step : SHOWREEL_STEPS[index], elapsedMs: 0, cycle: old.cycle + 1, tourCycle: old.tourCycle + (playbackMode === 'tour' && index === 0 ? 1 : 0) };
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
  }, [running, playbackMode]);

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
    const index = event.key === 'ArrowRight' ? (chapter + 1) % CHAPTERS.length
      : event.key === 'ArrowLeft' ? (chapter + CHAPTERS.length - 1) % CHAPTERS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? CHAPTERS.length - 1 : null;
    if (index === null) return;
    event.preventDefault();
    seek({ chapter: index }, false);
    document.getElementById(`product-film-chapter-${index}`)?.focus();
  };

  return (
    <Showcase ref={rootRef} id="product-business-panorama" aria-labelledby="product-film-title" data-chapter={chapter} data-step={frame.index} data-step-id={frame.step.id} data-running={running} data-reduced-motion={reducedMotion} data-playback-mode={playbackMode} data-cycle={frame.cycle} data-tour-cycle={frame.tourCycle}>
      <Inner>
        <Cinema aria-label="프로피그 제품 모션 쇼릴">
          <FilmTop><h2 id="product-film-title"><i aria-hidden="true" /> PRODUCT SHOWCASE</h2><span>ONE CONTINUOUS STORY.</span><span>PROPIG / {String(frame.index + 1).padStart(2, '0')}—{SHOWREEL_STEPS.length}</span></FilmTop>
          <SequenceStatus aria-live={running ? 'off' : 'polite'}>
            <div><span>NOW {String(frame.index + 1).padStart(2, '0')}</span><strong data-current-step-label>{frame.step.label}</strong><small>{timecode(frame.elapsedMs / 1000)} / {timecode(frame.step.durationMs / 1000)}</small></div>
            <div><span>{playbackMode === 'chapter' ? 'REPEAT' : frame.index === SHOWREEL_STEPS.length - 1 ? 'BACK TO START' : 'NEXT'}</span><b data-next-step-label>{playbackMode === 'chapter' ? frame.step.label : nextStep.label}</b><ArrowRight size={14} aria-hidden="true" /></div>
            <i className="scene-progress" aria-hidden="true"><i /></i>
          </SequenceStatus>
          <Stage ref={stageRef} data-running={running} data-reduced-motion={reducedMotion || staticScene} onFocusCapture={event => {
            if (!(event.target as HTMLElement).closest('[data-product-interactive]')) { setPlaying(false); setStaticScene(true); }
          }}>
            <Scene key={chapter}>
              <Story data-product-story>
                <SceneMeta><span>{String(chapter + 1).padStart(2, '0')}</span><span>{current.english}</span></SceneMeta>
                <DisplayWord aria-hidden="true">{current.word}</DisplayWord>
                <h3>{current.title[0]}<br /><em>{current.title[1]}</em></h3>
                <p>{current.description}</p>
                <SceneTags aria-label={`${current.label} 주요 서비스`}>{current.tags.map(tag => <span key={tag}>{tag}</span>)}</SceneTags>
                <SceneLink href={current.href} onClick={followProductLink}>{current.cta}<ArrowUpRight size={17} aria-hidden="true" /></SceneLink>
              </Story>
              <ArtworkFrame data-product-interactive data-product-canvas>
                {chapter === 2
                  ? <ProductContentStudio playing={playing && visible && pageVisible} reducedMotion={reducedMotion} selectedChannel={frame.step.channel ?? 0} onChannelChange={channel => seek({ chapter: 2, channel })} automaticTour={playbackMode === 'tour'} sceneElapsedMs={frame.elapsedMs} onSelect={pauseForContent} onPlaybackChange={controlContentPlayback} />
                  : <ProductServiceExplorer chapter={chapter} playing={running} reducedMotion={reducedMotion || staticScene} cycle={frame.cycle} selection={{ variant: frame.step.variant ?? 0, platform: frame.step.platform }} onSelectionChange={selection => seek({ chapter, ...selection })} onInteract={pauseForContent} />}
              </ArtworkFrame>
              <SceneFooter><span>{current.label}</span><div>{current.steps.map((step, index) => <span key={step} data-active={staticScene || reducedMotion || index <= activeStep}><b>0{index + 1}</b>{step}{index < 2 ? <ArrowRight size={12} aria-hidden="true" /> : null}</span>)}</div><small>PRODUCT STORY</small></SceneFooter>
            </Scene>
          </Stage>
          <Transport>
            <Playback>
              {reducedMotion ? <StaticLabel>동작 줄이기 · 직접 탐색</StaticLabel> : <Control type="button" onClick={togglePlayback} aria-label={playing ? '쇼릴 일시정지' : '쇼릴 재생'}>{playing ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}<span>{playing ? '일시정지' : '재생'}</span></Control>}
              <Time aria-label={`전체 ${SHOWREEL_TOTAL_MS / 1000}초 중 ${second}초`}><span>{timecode(second)}</span><span>/ {timecode(SHOWREEL_TOTAL_MS / 1000)}</span></Time>
            </Playback>
            <TransportNote><Repeat2 size={13} aria-hidden="true" />{reducedMotion ? '상세 장면을 선택해 살펴보세요' : playbackMode === 'chapter' ? '현재 장면을 반복합니다' : '21개 상세 장면이 차례로 이어집니다'}</TransportNote>
            {!reducedMotion && <TourButton type="button" onClick={() => {
              if (playbackMode === 'chapter') { setPlaybackMode('tour'); seek(frame.step, true); }
              else setPlaybackMode('chapter');
            }}>{playbackMode === 'chapter' ? '전체 이어보기' : '현재 장면 반복'}</TourButton>}
            <Navigation><button type="button" aria-label="이전 장면" onClick={() => seek(frame.index - 1)}><ChevronLeft size={18} aria-hidden="true" /></button><span>{String(frame.index + 1).padStart(2, '0')}<b>/ {SHOWREEL_STEPS.length}</b></span><button type="button" aria-label="다음 장면" onClick={() => seek(frame.index + 1)}><ChevronRight size={18} aria-hidden="true" /></button></Navigation>
          </Transport>
          <TourProgress role="progressbar" aria-label="전체 상세 장면 진행률" aria-valuemin={0} aria-valuemax={SHOWREEL_TOTAL_MS / 1000} aria-valuenow={second} aria-valuetext={`${SHOWREEL_STEPS.length}개 중 ${frame.index + 1}번째 장면, ${frame.step.label}`}><i /></TourProgress>
        </Cinema>
        <ChapterNav role="group" aria-label="제품 쇼릴 챕터 선택" onKeyDown={navigateChapters}>
          {CHAPTERS.map((item, index) => <ChapterButton key={item.english} id={`product-film-chapter-${index}`} type="button" aria-pressed={chapter === index} onClick={() => seek({ chapter: index })} data-active={chapter === index} data-complete={index < chapter}><span className="chapter-line" aria-hidden="true"><i /></span><span className="chapter-number">0{index + 1}</span><span className="chapter-copy"><strong>{item.label}</strong><small>{item.word.replace('.', '').toUpperCase()}</small></span><span className="chapter-action" aria-hidden="true">{chapter === index ? <span className="equalizer"><i /><i /><i /></span> : <ArrowUpRight size={17} />}</span></ChapterButton>)}
        </ChapterNav>
        <Closing><span>하나의 아이디어에서, 다음 가능성까지.</span><p>21개 상세 장면을 순서대로 재생합니다. 메뉴를 누르면 그 장면부터 이어집니다.</p><a href="#company-introduction-execution">실행 과정 살펴보기 <ArrowDown size={14} aria-hidden="true" /></a></Closing>
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
  position: relative; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 68px; padding: 14px 24px; border-bottom: 1px solid #29405e; background: #0b1b32;
  > div { display: flex; align-items: center; gap: 13px; min-width: 0; }
  span { font-size: 9px; font-weight: 700; color: #93c5fd; white-space: nowrap; }
  strong { font-size: 16px; color: #f3f7ff; word-break: keep-all; }
  small { font-size: 10px; color: #a9bed7; font-variant-numeric: tabular-nums; white-space: nowrap; }
  b { font-size: 12px; color: #c2d5ed; font-weight: 500; word-break: keep-all; }
  svg { color: #93c5fd; flex-shrink: 0; }
  .scene-progress { position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: #1c3451; }
  .scene-progress > i { display: block; height: 100%; background: #5eead4; transform: scaleX(var(--scene-progress, 0)); transform-origin: left; }
  @container (max-width: 620px) { flex-direction: column; align-items: stretch; gap: 9px; padding: 12px 16px; > div { gap: 9px; } strong { font-size: 14px; } small { margin-left: auto; } b { font-size: 11px; } > div:last-of-type { justify-content: flex-end; } }
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
  width: 100%; padding: 26px 24px 0; color: var(--film-paper); background-color: #07101f; container-type: inline-size;
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
  min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 0 24px; border-bottom: 1px solid #29405e; background: #0c1c33;
  h2, span { display: inline-flex; gap: 8px; align-items: center; font-size: 9px; color: #adbed4; font-weight: 600; }
  h2 { margin: 0; font-size: 11px; font-weight: 750; color: #b9d9ff; }
  i { width: 6px; height: 6px; background: #5eead4; border-radius: 50%; box-shadow: 0 0 12px #5eead450; }
  @container (max-width: 620px) { padding: 0 14px; min-height: 42px; > span:first-of-type { display: none; } h2 { font-size: 10px; } > span { font-size: 8px; } }
`;
const Stage = styled.div`
  position: relative;
  &[data-running='false'] *, &[data-running='false'] *::before, &[data-running='false'] *::after { animation-play-state: paused !important; }
  &[data-reduced-motion='true'] * { animation: none !important; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;
const Scene = styled.div`
  min-height: 510px; display: grid; grid-template-columns: minmax(200px, .26fr) minmax(0, .74fr); align-items: center; gap: 0 22px; padding: 18px 20px 0 24px;
  animation: ${arrive} 700ms ease both;
  @container (min-width: 1250px) { grid-template-columns: minmax(220px, .24fr) minmax(0, .76fr); }
  @container (max-width: 760px) { grid-template-columns: 1fr; padding: 20px 16px 0; gap: 0; }
`;
const Story = styled.div`
  min-width: 0; padding: 20px 0 24px; position: relative; z-index: 1; animation: ${arrive} 700ms cubic-bezier(.2,.7,.2,1) both;
  h3 { font-size: 21px; font-weight: 700; line-height: 1.55; margin: 12px 0 0; word-break: keep-all; text-wrap: balance; }
  h3 em { font-style: normal; color: #93c5fd; }
  > p { white-space: pre-line; margin: 17px 0 16px; font-size: 11px; line-height: 1.9; color: #bdc9da; word-break: keep-all; }
  @container (min-width: 1250px) { h3 { font-size: 24px; } > p { font-size: 12px; } }
  @container (max-width: 760px) { padding: 0 0 12px; h3 { font-size: 22px; margin-top: 13px; } > p { margin: 10px 0 11px; font-size: 12px; } }
  @container (max-width: 340px) { h3 { font-size: 20px; } > p { font-size: 11px; white-space: normal; } }
`;
const SceneMeta = styled.div`
  display: flex; align-items: center; gap: 9px; color: #adbed4; font-size: 8px; font-weight: 650; letter-spacing: .1em;
  > span:first-child { display: grid; place-items: center; flex-shrink: 0; width: 27px; height: 27px; border: 1px solid #52769d; border-radius: 8px; color: #b9d9ff; background: #112842; font-variant-numeric: tabular-nums; }
`;
const DisplayWord = styled.div`
  margin-top: 18px; font-size: 48px; font-weight: 500; line-height: 1.1; font-family: Georgia, 'Times New Roman', serif; color: var(--film-paper);
  @container (min-width: 1250px) { font-size: 54px; }
  @container (max-width: 760px) { display: none; }
`;
const SceneTags = styled.div`
  display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 16px;
  > span { border: 1px solid #344b68; border-radius: 5px; padding: 5px 7px; color: #c2d5ed; font-size: 9px; line-height: 1.3; background: #10243d; }
  @container (max-width: 760px) { margin-bottom: 5px; > span { font-size: 10px; } }
`;
const SceneLink = styled.a`
  min-height: 44px; display: inline-flex; align-items: center; gap: 16px; color: #dbeafe; font-size: 11px; font-weight: 650; text-decoration: none;
  svg { color: #93c5fd; transition: transform 180ms ease; }
  &:hover svg { transform: translate(3px, -3px); }
`;
const ArtworkFrame = styled.div`
  width: 100%; min-width: 0; align-self: center;
  @container (max-width: 760px) { width: calc(100% + 16px); margin: 0 -8px 10px; }
`;
const SceneFooter = styled.div`
  grid-column: 1 / -1; min-height: 51px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid #29405e; padding: 10px 0;
  > span { font-size: 10px; color: #bdc9da; font-weight: 650; }
  > div { display: flex; gap: 16px; flex-wrap: wrap; }
  > div > span { display: inline-flex; gap: 7px; align-items: center; font-size: 10px; color: #adbed4; }
  > div > span[data-active='true'] { color: #a8cfff; }
  b { color: #93c5fd; font-size: 8px; font-weight: 600; }
  svg { margin-left: 4px; opacity: .7; }
  small { color: #adbed4; font-size: 8px; }
  @container (max-width: 900px) { > span { display: none; } }
  @container (max-width: 620px) { min-height: 45px; justify-content: center; > div { gap: 9px; } > div > span { font-size: 9px; gap: 5px; } small { display: none; } svg { margin-left: 0; } }
`;
const Transport = styled.div`
  min-height: 70px; padding: 10px 18px; border-top: 1px solid #29405e; background: #081426; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  @container (max-width: 620px) { padding: 9px 10px; gap: 8px; flex-wrap: wrap; }
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
`;
const TransportNote = styled.span`display: inline-flex; align-items: center; gap: 7px; font-size: 10px; color: #adbed4; @container (max-width: 1100px) { display: none; }`;
const TourButton = styled.button`
  min-height: 44px; padding: 0 12px; color: #b9d9ff; background: #112842; border: 1px solid #355879; border-radius: 8px; font-size: 10px !important; white-space: nowrap; transition: background 160ms, transform 160ms;
  &:hover { background: #1d3d60; transform: translateY(-2px); } &:active { transform: scale(.97); }
  @container (max-width: 620px) { order: 3; width: 100%; }
`;
const Navigation = styled.div`
  display: flex; align-items: center; gap: 9px;
  button { width: 44px; height: 44px; display: grid; place-items: center; background: #10243d; border: 1px solid #344b68; border-radius: 8px; color: #dbeafe; transition: background 160ms, transform 160ms; }
  button:hover { background: #1e4166; transform: translateY(-2px); } button:active { transform: scale(.94); }
  > span { display: inline-flex; gap: 6px; font-size: 10px; font-variant-numeric: tabular-nums; }
  b { color: #adbed4; font-weight: 400; }
  @container (max-width: 620px) { gap: 4px; > span { display: none; } }
`;
const ChapterNav = styled.div`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 16px 0 20px;
  @container (max-width: 760px) { gap: 9px; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px 0 16px; }
`;
const ChapterButton = styled.button`
  position: relative; overflow: hidden; min-width: 0; min-height: 90px; display: flex; align-items: center; gap: 12px; padding: 18px 16px; border: 1px solid #304b6b; border-radius: 12px; background: #0b1b32; color: #bdc9da; text-align: left;
  transition: transform 200ms cubic-bezier(.2,.7,.2,1), background 200ms, border-color 200ms, box-shadow 200ms;
  .chapter-line { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: #233d5b; overflow: hidden; }
  .chapter-line i { display: block; height: 100%; background: #60a5fa; transform: scaleX(0); transform-origin: left; }
  &[data-active='true'] { color: #f3f7ff; background: #153352; border-color: #60a5fa; box-shadow: 0 7px 24px #02060e50, inset 0 1px 0 #ffffff12; .chapter-line i { transform: scaleX(var(--chapter-progress)); } }
  &[data-complete='true'] .chapter-line i { transform: scaleX(1); }
  .chapter-number { display: grid; place-items: center; flex-shrink: 0; width: 34px; height: 34px; border-radius: 9px; background: #18304d; color: #a8cfff; font-size: 12px; font-variant-numeric: tabular-nums; }
  &[data-active='true'] .chapter-number { background: #60a5fa; color: #07101f; font-weight: 800; }
  .chapter-copy { display: grid; gap: 7px; }
  strong { font-size: 13px; font-weight: 750; word-break: keep-all; }
  small { font-size: 9px; color: #adbed4; }
  .chapter-action { margin-left: auto; display: flex; align-items: center; color: #93c5fd; }
  .chapter-action > svg { transition: transform 180ms; }
  &:hover { transform: translateY(-3px); border-color: #93c5fd; background: #153352; .chapter-action > svg { transform: translate(2px, -2px); } }
  &:active { transform: translateY(0) scale(.985); }
  .equalizer { display: inline-flex; align-items: center; gap: 3px; height: 19px; }
  .equalizer i { width: 3px; height: 16px; background: #93c5fd; border-radius: 2px; animation: ${equalize} 1.2s ease-in-out infinite; }
  .equalizer i:nth-child(2) { animation-delay: -.4s; } .equalizer i:nth-child(3) { animation-delay: -.8s; }
  [data-running='false'] & .equalizer i { animation-play-state: paused; }
  @container (max-width: 960px) { gap: 9px; padding: 15px 12px; strong { font-size: 11px; } .chapter-number { width: 28px; height: 30px; font-size: 11px; } .chapter-action { display: none; } }
  @container (max-width: 760px) { min-height: 80px; strong { font-size: 12px; } small { font-size: 8px; } }
  @media (prefers-reduced-motion: reduce) { transform: none !important; .equalizer i { animation: none; } }
`;
const Closing = styled.div`
  display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 14px 0 22px; border-top: 1px solid #29405e;
  > span { font-size: 11px; font-weight: 700; color: #d6e0ee; }
  > p { margin: 0; font-size: 9px; color: #adbed4; }
  > a { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; color: #a8cfff; font-size: 11px; text-decoration: none; }
  @container (max-width: 1100px) { flex-wrap: wrap; gap: 3px 20px; > p { order: 3; flex-basis: 100%; } }
  @container (max-width: 380px) { > span { font-size: 10px; } > a { font-size: 10px; gap: 5px; } }
`;
