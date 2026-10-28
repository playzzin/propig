'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronLeft, ChevronRight, Film, Heart, Instagram, LoaderCircle, MessageCircle, MoreHorizontal, Pause, Play, RotateCcw, Send, Youtube } from 'lucide-react';
import styled, { css, keyframes } from 'styled-components';

type ProductContentStudioProps = {
  playing: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onPlaybackChange: (playing: boolean) => void;
  selectedChannel?: number;
  onChannelChange?: (index: number) => void;
  automaticTour?: boolean;
  sceneElapsedMs?: number;
};

const CHANNELS = [
  { id: 'youtube', label: 'YouTube', format: '브랜드 영상', ratio: '16:9', icon: Youtube },
  { id: 'tiktok', label: 'TikTok', format: '숏폼 영상', ratio: '9:16', icon: Film },
  { id: 'blog', label: '블로그', format: '브랜드 아티클', ratio: 'ARTICLE', icon: BookOpen },
  { id: 'instagram', label: 'Instagram', format: '스토리 웹툰', ratio: 'WEBTOON', icon: Instagram },
] as const;

const COMIC_CAPTIONS = [
  '문은 열렸다. 다시 시작하는 이야기.',
  '수중에 남은 돈, 17만 원. 작은 시작이었다.',
  '갈 곳이 없어도, 내일을 포기하지 않았다.',
  '다시, 새로운 시작을 응원하는 사람들.',
  '내 첫 방. 화장실은 복도 끝에 있었다.',
  '창문도, 내 화장실도 없는 방에서 꿈을 키웠다.',
  '새벽이면 일을 구하러 나갔다.',
  '몸을 쓰고, 하루를 버텼다.',
  '다음에는, 화장실 있는 방으로.',
  '힘든 하루의 끝. 오늘도 수고했다.',
  '그렇게 하루하루 모아서, 새로운 문 앞에 섰다.',
  '내 첫 목표는, 화장실 있는 방이었다.',
];

// The original episode has unequal row heights; keep each speech bubble inside its source panel.
const COMIC_CROPS = [
  { y: 4, height: 248 }, { y: 262, height: 238 }, { y: 510, height: 238 },
  { y: 758, height: 230 }, { y: 996, height: 218 }, { y: 1224, height: 304 },
].flatMap(({ y, height }) => [8, 518].map((x) => ({ x, y, width: 498, height })));

function videoTime(seconds: number) {
  return `0:${String(Math.floor(Number.isFinite(seconds) ? seconds : 0)).padStart(2, '0')}`;
}

function StudioVideo({ vertical, playing, reducedMotion, onSelect, onPlaybackChange }: ProductContentStudioProps & { vertical: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [explicitPlay, setExplicitPlay] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [blocked, setBlocked] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(12);
  const name = vertical ? 'TikTok' : 'YouTube';
  const file = vertical ? 'tiktok' : 'youtube';
  const shouldPlay = playing && (!reducedMotion || explicitPlay);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    if (shouldPlay) {
      video.play().catch((error: unknown) => {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) setBlocked(true);
      });
    } else {
      video.pause();
    }
    return () => { cancelled = true; video.pause(); };
  }, [shouldPlay]);

  function toggleVideo() {
    const video = videoRef.current;
    if (!video) return;
    onSelect();
    if (videoPlaying || (shouldPlay && !blocked && status !== 'error')) {
      setExplicitPlay(false);
      video.pause();
      onPlaybackChange(false);
      return;
    }
    if (status === 'error') {
      setStatus('loading');
      video.load();
    }
    setExplicitPlay(true);
    setBlocked(false);
    onPlaybackChange(true);
    video.play().catch(() => setBlocked(true));
  }

  return (
    <VideoProduct data-video-format={vertical ? 'portrait' : 'landscape'}>
      <VideoCanvas $vertical={vertical}>
        {vertical ? <VerticalNote aria-hidden="true"><span>SHORT.<br />STORY.<br />IMPACT.</span><small>한 장면의 가능성</small></VerticalNote> : null}
        <VideoDevice $vertical={vertical}>
          {vertical ? <PhoneSpeaker aria-hidden="true" /> : null}
          <video
            ref={videoRef}
            src={`/videos/corp/product-story-${file}.mp4`}
            poster={`/videos/corp/product-story-${file}.jpg`}
            preload="metadata"
            muted
            playsInline
            loop
            aria-label={`${name} 프로피그 브랜드 시연 영상, 무음`}
            onLoadedMetadata={(event) => {
              const nextDuration = event.currentTarget.duration;
              if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
            }}
            onCanPlay={() => setStatus('ready')}
            onWaiting={() => setStatus('loading')}
            onPlaying={() => { setStatus('ready'); setVideoPlaying(true); setBlocked(false); }}
            onPause={() => setVideoPlaying(false)}
            onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
            onError={() => { setStatus('error'); setVideoPlaying(false); }}
          >
            프로피그의 웹, 자동화, 콘텐츠가 하나의 이야기로 연결되는 브랜드 시연 영상입니다.
          </video>
          {status === 'loading' && shouldPlay ? <MediaNotice role="status"><LoaderCircle size={19} aria-hidden="true" /><span>영상 준비 중</span></MediaNotice> : null}
          {status === 'error' ? <MediaNotice role="status"><Film size={24} aria-hidden="true" /><span>영상을 불러오지 못했습니다.</span><button type="button" onClick={toggleVideo}><RotateCcw size={15} aria-hidden="true" />다시 불러오기</button></MediaNotice> : null}
          {blocked && status !== 'error' ? <MediaNotice><button type="button" onClick={toggleVideo}><Play size={17} aria-hidden="true" />영상 재생</button></MediaNotice> : null}
        </VideoDevice>
        {vertical ? <VerticalMarkers aria-hidden="true"><i /><span>09<br /><b>16</b></span><small>VERTICAL<br />STORY</small></VerticalMarkers> : null}
      </VideoCanvas>
      <VideoDetails><div><span>{vertical ? '매일의 아이디어가, 다음 콘텐츠로.' : '당신의 아이디어가 움직이기 시작하는 순간.'}</span><small>PROPIG STUDIO · 브랜드 시연 영상</small></div><Check size={15} aria-hidden="true" /></VideoDetails>
      <VideoControls>
        <button type="button" onClick={toggleVideo} aria-label={`${name} 영상 ${videoPlaying ? '일시정지' : '재생'}`}>
          {videoPlaying ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
        </button>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(position, duration)}
          aria-label={`${name} 영상 재생 위치`}
          aria-valuetext={`${videoTime(position)} / ${videoTime(duration)}`}
          onChange={(event) => {
            onSelect();
            const nextPosition = Number(event.target.value);
            if (videoRef.current && Number.isFinite(nextPosition)) videoRef.current.currentTime = nextPosition;
            setPosition(nextPosition);
          }}
        />
        <span>{videoTime(position)}<small> / {videoTime(duration)}</small></span>
        <span className="video-silent">무음 · 반복</span>
      </VideoControls>
    </VideoProduct>
  );
}

function BlogPreview({ onSelect, playing, reducedMotion, automaticTour = false, sceneElapsedMs = 0 }: Pick<ProductContentStudioProps, 'onSelect' | 'playing' | 'reducedMotion' | 'automaticTour' | 'sceneElapsedMs'>) {
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    if (!automaticTour || !playing || reducedMotion) {
      article.scrollTo({ top: article.scrollTop, behavior: 'instant' });
      return;
    }
    const progress = Math.max(0, Math.min(1, (sceneElapsedMs - 2000) / 18000));
    article.scrollTo({ top: (article.scrollHeight - article.clientHeight) * progress, behavior: sceneElapsedMs < 2000 ? 'instant' : 'smooth' });
  }, [automaticTour, playing, reducedMotion, sceneElapsedMs]);

  return (
    <BlogWindow>
      <BlogMasthead><b>PROPIG JOURNAL</b><span>IDEAS INTO EVERYDAY</span></BlogMasthead>
      <BlogArticle ref={articleRef} tabIndex={0} aria-label="블로그 시연 글: 반복 업무를 줄이면, 새로운 일이 시작됩니다" onFocus={onSelect} onPointerDown={onSelect} onWheel={onSelect} onKeyDown={onSelect}>
        <ArticleCategory>WORK &amp; POSSIBILITY <span>01</span></ArticleCategory>
        <h4>반복 업무를 줄이면,<br /><em>새로운 일이 시작됩니다.</em></h4>
        <ArticleByline><span>P</span><div><b>프로피그 에디토리얼</b><small>브랜드 콘텐츠 시연 · 3분 읽기</small></div></ArticleByline>
        <ArticleIllustration aria-hidden="true"><span>LESS ROUTINE.</span><b>MORE<br /><i>POSSIBILITY.</i></b><div><span>아이디어</span><ArrowUpRight size={28} /><span>새로운 일</span></div></ArticleIllustration>
        <p>좋은 아이디어는 언제나 거창한 곳에서 시작되지 않습니다. 같은 내용을 다시 입력하는 순간, 작은 화면에서 필요한 정보를 찾는 순간, 우리는 더 나은 방법을 떠올립니다.</p>
        <h5>한 번의 입력이 여러 서류로 이어지도록</h5>
        <p>견적서에 적은 거래처 정보를 거래명세서에 다시 입력하고, 매달 급여 자료를 새 문서로 옮기는 일. 이런 반복을 줄이면 사람은 숫자를 옮기는 대신 내용을 검토하고 다음 결정을 준비할 수 있습니다.</p>
        <blockquote>자동화로 아낀 시간을,<br />사람에게 필요한 일에 씁니다.</blockquote>
        <h5>하나의 이야기를, 채널에 맞는 표현으로</h5>
        <p>브랜드가 전하고 싶은 핵심은 같아도 표현은 달라질 수 있습니다. 블로그에서는 맥락을 차분하게 설명하고, 짧은 영상에서는 한 장면에 집중합니다. 웹툰은 인물의 작은 변화로 이야기를 이어 갑니다.</p>
        <h5>작게 시작해서, 실제 사용까지</h5>
        <p>프로피그는 웹과 앱, 업무자동화, 생성형 콘텐츠를 연결합니다. 실제로 사용하는 사람의 하루를 살펴보고, 필요한 기능부터 구현하고, 사용하며 발견한 문제를 다시 개선합니다.</p>
        <ArticleEnd><span>END OF STORY</span><b>당신의 다음 가능성을 만듭니다.</b></ArticleEnd>
      </BlogArticle>
      <ReadingHint><BookOpen size={13} aria-hidden="true" /><span>{automaticTour && playing && !reducedMotion ? '본문이 순서대로 펼쳐집니다. 화면을 누르면 멈춰 읽을 수 있어요.' : '화면 안을 스크롤해 본문을 읽어보세요.'}</span></ReadingHint>
    </BlogWindow>
  );
}

function WebtoonPreview({ playing, reducedMotion, onSelect, automaticTour = false, sceneElapsedMs = 0 }: Pick<ProductContentStudioProps, 'playing' | 'reducedMotion' | 'onSelect' | 'automaticTour' | 'sceneElapsedMs'>) {
  const [selectedPanel, setPanel] = useState(0);
  const [automatic, setAutomatic] = useState(true);
  const moving = automatic && playing && !reducedMotion;
  const followsTour = automaticTour && automatic && !reducedMotion;
  const panel = followsTour ? Math.min(COMIC_CAPTIONS.length - 1, Math.floor(Math.max(0, sceneElapsedMs) / 4000)) : selectedPanel;
  const crop = COMIC_CROPS[panel];
  const aspectRatio = crop.width / crop.height;

  useEffect(() => {
    if (!moving || followsTour) return;
    const timer = window.setInterval(() => setPanel((current) => (current + 1) % COMIC_CAPTIONS.length), 4000);
    return () => window.clearInterval(timer);
  }, [moving, followsTour]);

  function turnPanel(direction: number) {
    onSelect();
    setAutomatic(false);
    setPanel((panel + direction + COMIC_CAPTIONS.length) % COMIC_CAPTIONS.length);
  }

  return (
    <InstagramWindow>
      <InstagramMasthead><span>Instagram</span><small>스토리 웹툰</small><MoreHorizontal size={19} aria-hidden="true" /></InstagramMasthead>
      <InstagramAuthor><span>P</span><div><b>propig.story</b><small>그뚠이 스토리 · 1화 창업배경</small></div><span className="comic-original">시연</span></InstagramAuthor>
      <ComicViewport><ComicFrame key={panel} role="img" aria-label={`웹툰 ${panel + 1}번째 컷. ${COMIC_CAPTIONS[panel]}`} data-comic-panel={panel + 1} data-comic-ratio={aspectRatio} $moving={moving} style={{ aspectRatio, width: `min(100%, ${aspectRatio * 100}cqh)` }}>
        <Image src="/images/corp/founder-story/episode-1.png" width={1024} height={1536} alt="" unoptimized aria-hidden="true" style={{ width: `${1024 / crop.width * 100}%`, height: `${1536 / crop.height * 100}%`, left: `${-crop.x / crop.width * 100}%`, top: `${-crop.y / crop.height * 100}%` }} />
        <span aria-hidden="true">{String(panel + 1).padStart(2, '0')} / 12</span>
      </ComicFrame></ComicViewport>
      <ComicReactions aria-hidden="true"><Heart size={20} /><MessageCircle size={20} /><Send size={19} /><span>한 컷씩 이어지는 브랜드 이야기</span></ComicReactions>
      <ComicCaption aria-live={automatic ? 'off' : 'polite'}><b>propig.story</b> {COMIC_CAPTIONS[panel]}</ComicCaption>
      <ComicToolbar><ComicNavigation>
        <button type="button" onClick={() => turnPanel(-1)} aria-label="웹툰 이전 컷"><ChevronLeft size={19} aria-hidden="true" /></button>
        <span role="img" aria-label={`전체 12컷 중 ${panel + 1}번째 컷`}>{COMIC_CAPTIONS.map((_, index) => <i key={index} data-active={index === panel} />)}</span>
        <button type="button" onClick={() => turnPanel(1)} aria-label="웹툰 다음 컷"><ChevronRight size={19} aria-hidden="true" /></button>
      </ComicNavigation>
      <ComicAuto type="button" aria-label={`웹툰 자동 넘김 ${automatic ? '끄기' : '켜기'}`} aria-pressed={automatic} onClick={() => { onSelect(); setPanel(panel); setAutomatic((value) => !value); }}>{automatic ? <Pause size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}<span>자동 넘김</span></ComicAuto></ComicToolbar>
    </InstagramWindow>
  );
}

export default function ProductContentStudio({ playing, reducedMotion, onSelect, onPlaybackChange, selectedChannel, onChannelChange, automaticTour = false, sceneElapsedMs = 0 }: ProductContentStudioProps) {
  const [selectedChannelIndex, setChannelIndex] = useState(0);
  const channelIndex = selectedChannel !== undefined && Number.isFinite(selectedChannel) ? Math.max(0, Math.min(CHANNELS.length - 1, Math.floor(selectedChannel))) : selectedChannelIndex;
  const id = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  const current = CHANNELS[channelIndex];

  function selectChannel(index: number) {
    setChannelIndex(index);
    if (onChannelChange) onChannelChange(index);
    else onSelect();
  }

  function navigateChannels(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? CHANNELS.length - 1 : (channelIndex + (event.key === 'ArrowRight' ? 1 : -1) + CHANNELS.length) % CHANNELS.length;
    selectChannel(next);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <Studio data-content-studio data-content-channel={current.id} $playing={playing} $reducedMotion={reducedMotion}>
      <StudioHeading><div><i aria-hidden="true" /><span>CONTENT STUDIO</span></div><small>{automaticTour ? '채널별 콘텐츠를 순서대로 재생합니다' : '채널을 눌러 직접 살펴보세요'}</small></StudioHeading>
      <ChannelTabs ref={tabsRef} role="tablist" aria-label="생성형 콘텐츠 채널" onKeyDown={navigateChannels}>
        {CHANNELS.map(({ id: channelId, label, icon: Icon }, index) => <ChannelTab key={channelId} id={`${id}-tab-${channelId}`} role="tab" aria-selected={index === channelIndex} aria-controls={`${id}-panel`} tabIndex={index === channelIndex ? 0 : -1} type="button" onClick={() => selectChannel(index)}><Icon size={15} aria-hidden="true" /><span>{label}</span></ChannelTab>)}
      </ChannelTabs>
      <ProductWindow role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${current.id}`}>
        <WindowBar><span><i /><i /><i /></span><b>propig / {current.id}</b><small>{current.ratio}</small></WindowBar>
        <ContentViewport key={current.id} $playing={playing && !reducedMotion} data-content-preview={current.id}>
          {current.id === 'youtube' || current.id === 'tiktok' ? <StudioVideo vertical={current.id === 'tiktok'} playing={playing} reducedMotion={reducedMotion} onSelect={onSelect} onPlaybackChange={onPlaybackChange} /> : null}
          {current.id === 'blog' ? <BlogPreview onSelect={onSelect} playing={playing} reducedMotion={reducedMotion} automaticTour={automaticTour} sceneElapsedMs={sceneElapsedMs} /> : null}
          {current.id === 'instagram' ? <WebtoonPreview playing={playing} reducedMotion={reducedMotion} onSelect={onSelect} automaticTour={automaticTour} sceneElapsedMs={sceneElapsedMs} /> : null}
        </ContentViewport>
      </ProductWindow>
      <StudioFooter><span><i aria-hidden="true" />{current.format}</span><span>시연 콘텐츠 <b>·</b> ONE STORY, EVERY CHANNEL</span></StudioFooter>
    </Studio>
  );
}

const switchIn = keyframes`from { opacity: .55; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); }`;
const spin = keyframes`to { transform: rotate(360deg); }`;
const pulse = keyframes`0%, 100% { opacity: .45; } 50% { opacity: 1; }`;

const Studio = styled.div<{ $playing: boolean; $reducedMotion: boolean }>`
  container-type: inline-size; width: 100%; min-width: 0; padding: 8px 8px 12px; color: #173b2e;
  *, *::before, *::after { box-sizing: border-box; }
  button { font: inherit; touch-action: manipulation; }
  :is(button, input, article):focus-visible { outline: 3px solid #587e34 !important; outline-offset: -3px !important; }
  ${({ $playing }) => !$playing && css`*, *::before, *::after { animation-play-state: paused !important; }`}
  ${({ $reducedMotion }) => $reducedMotion && css`*, *::before, *::after { animation: none !important; transition: none !important; }`}
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
const StudioHeading = styled.div`
  display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 32px; color: #d6e5fa;
  > div { display: flex; align-items: center; gap: 7px; }
  i { width: 5px; height: 5px; background: #93c5fd; border-radius: 50%; animation: ${pulse} 3s ease-in-out infinite; }
  span { font-size: 9px; font-weight: 750; letter-spacing: .12em; }
  small { font-size: 9px; color: #adbed4; }
  @container (max-width: 380px) { small { font-size: 8px; } span { font-size: 8px; } }
`;
const ChannelTabs = styled.div`display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; margin: 5px 0 10px; padding: 3px; border: 1px solid #304b6b; border-radius: 7px; background: #081426;`;
const ChannelTab = styled.button`
  min-width: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 6px 4px; border: 0; border-radius: 4px; background: transparent; color: #bdc9da; font-size: 11px !important; font-weight: 650 !important; transition: background 180ms, color 180ms;
  &[aria-selected='true'] { background: #93c5fd; color: #07101f; }
  &:hover:not([aria-selected='true']) { background: #193a5d; color: #f3f7ff; }
  svg { flex-shrink: 0; }
  @container (max-width: 420px) { gap: 4px; font-size: 10px !important; svg { width: 12px; height: 12px; } }
  @container (max-width: 310px) { flex-direction: column; gap: 3px; font-size: 9px !important; }
`;
const ProductWindow = styled.div`overflow: hidden; border: 1px solid #375875; border-radius: 9px; background: #eef0e7; box-shadow: 0 18px 28px -18px #0008;`;
const WindowBar = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 13px; height: 30px; border-bottom: 1px solid #b7c7d9; background: #dce5ef;
  > span { display: flex; gap: 4px; } i { width: 5px; height: 5px; border: 1px solid #8b9eb4; border-radius: 50%; }
  b { font-size: 8px; font-weight: 500; font-family: ui-monospace, monospace; color: #435e7a; }
  small { font-size: 8px; font-weight: 700; letter-spacing: .08em; }
`;
const ContentViewport = styled.div<{ $playing: boolean }>`
  height: clamp(394px, calc(56.25cqw + 90px), 650px); overflow: hidden; position: relative;
  ${({ $playing }) => $playing && css`animation: ${switchIn} 450ms ease both;`}
  @container (max-width: 420px) { height: 372px; &[data-content-preview='youtube'] { height: calc(56.25cqw + 90px); } }
`;
const StudioFooter = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 35px; color: #adbed4;
  > span { display: inline-flex; align-items: center; gap: 6px; font-size: 8px; }
  > span:first-child { color: #d6e5fa; font-size: 10px; }
  i { width: 4px; height: 4px; background: #93c5fd; border-radius: 50%; } b { font-weight: 400; opacity: .65; }
  @container (max-width: 420px) { > span:last-child { font-size: 0; } > span:last-child::after { content: '시연 콘텐츠'; font-size: 9px; } b { display: none; } }
`;
const VideoProduct = styled.div`height: 100%; display: flex; flex-direction: column; background: #f5f4ed;`;
const VideoCanvas = styled.div<{ $vertical: boolean }>`
  flex: 1; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #071322;
  ${({ $vertical }) => $vertical && css`background: #d6e2ef; padding: 10px;`}
`;
const VideoDevice = styled.div<{ $vertical: boolean }>`
  width: 100%; position: relative; overflow: hidden; aspect-ratio: 16 / 9; max-height: 100%; background: #17392b;
  video { display: block; width: 100%; height: 100%; object-fit: contain; }
  ${({ $vertical }) => $vertical && css`height: 100%; width: auto; aspect-ratio: 9 / 16; border: 5px solid #102b22; border-radius: 23px; box-shadow: 0 8px 18px #19362630; z-index: 1; video { object-fit: cover; }`}
`;
const PhoneSpeaker = styled.div`position: absolute; z-index: 2; top: 3px; left: 50%; transform: translateX(-50%); width: 35%; height: 10px; border-radius: 0 0 8px 8px; background: #102b22;`;
const VerticalNote = styled.div`
  position: absolute; left: 23px; top: 38px; color: #315578; > span { font-family: Georgia, serif; font-size: 26px; line-height: 1.13; } > small { display: block; margin-top: 14px; font-size: 9px; }
  @container (max-width: 520px) { left: 16px; top: 30px; > span { font-size: 18px; } > small { font-size: 8px; max-width: 45px; line-height: 1.7; } }
  @container (max-width: 350px) { left: 10px; > span { font-size: 14px; } > small { display: none; } }
`;
const VerticalMarkers = styled.div`
  position: absolute; right: 28px; bottom: 35px; display: grid; gap: 15px; color: #3f603c;
  i { width: 21px; height: 21px; border-top: 1px solid currentColor; border-right: 1px solid currentColor; justify-self: end; }
  > span { font-size: 34px; line-height: 1.1; font-family: Georgia, serif; text-align: right; } b { font-weight: 400; color: #4b603f; } small { font-size: 8px; line-height: 1.7; }
  @container (max-width: 420px) { right: 15px; > span { font-size: 24px; } small { font-size: 7px; } }
`;
const MediaNotice = styled.div`
  position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: #102b22a8; color: #f3f7ff; padding: 18px; text-align: center;
  > span { font-size: 11px; line-height: 1.6; } > svg.lucide-loader-circle { animation: ${spin} 1s linear infinite; }
  button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 7px 12px; border: 1px solid #93c5fd; background: #93c5fd; color: #173b2e; border-radius: 5px; font-size: 11px; }
`;
const VideoDetails = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 15px 0; flex-shrink: 0;
  > div { display: grid; gap: 5px; } span { font-size: 11px; line-height: 1.6; font-weight: 750; } small { font-size: 8px; color: #58674f; }
  > svg { color: #4d7144; border: 1px solid #b7c5ab; border-radius: 50%; padding: 2px; width: 20px; height: 20px; flex-shrink: 0; }
  @container (max-width: 420px) { padding: 10px 11px 0; span { font-size: 10px; } }
`;
const VideoControls = styled.div`
  display: flex; align-items: center; gap: 9px; padding: 0 12px 1px; flex-shrink: 0;
  button { display: grid; place-items: center; min-height: 44px; min-width: 44px; border: 0; background: transparent; color: #173b2e; }
  input { min-width: 0; width: 100%; height: 44px; accent-color: #46713b; cursor: pointer; margin: 0; }
  > span { flex-shrink: 0; font-size: 9px; font-variant-numeric: tabular-nums; } small { color: #58674f; font-size: 8px; }
  .video-silent { font-size: 8px; color: #58674f; margin-left: 7px; }
  @container (max-width: 420px) { gap: 6px; padding: 0 7px 1px; .video-silent { display: none; } }
`;
const BlogWindow = styled.div`height: 100%; display: flex; flex-direction: column; background: #fcfbf4;`;
const BlogMasthead = styled.div`
  display: flex; align-items: center; justify-content: space-between; padding: 0 22px; height: 38px; flex-shrink: 0; border-bottom: 1px solid #dce0d2;
  b { font-family: Georgia, serif; font-size: 13px; font-weight: 500; } span { font-size: 7px; letter-spacing: .1em; color: #58674f; }
  @container (max-width: 420px) { padding: 0 15px; span { display: none; } }
`;
const BlogArticle = styled.article`
  overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #b6c2a5 #f6f6ec; padding: 23px 30px 30px; flex: 1; min-height: 0;
  h4 { font-size: 24px; line-height: 1.5; margin: 14px 0; font-weight: 750; word-break: keep-all; } h4 em { font-style: normal; color: #537347; }
  > p { font-size: 13px; line-height: 2; color: #4c5b48; word-break: keep-all; margin: 20px 0; }
  h5 { font-size: 17px; line-height: 1.6; margin: 25px 0 12px; word-break: keep-all; }
  blockquote { margin: 25px 0; padding: 17px 20px; border-left: 3px solid #7c9c53; background: #eef1e0; color: #375632; font-size: 18px; font-weight: 650; line-height: 1.8; }
  @container (max-width: 420px) { padding: 20px 18px 25px; h4 { font-size: 20px; } > p { font-size: 12px; } h5 { font-size: 15px; } blockquote { padding: 14px; font-size: 16px; } }
`;
const ArticleCategory = styled.div`display: flex; justify-content: space-between; color: #596b4d; font-size: 8px; letter-spacing: .12em; span { color: #596b4d; }`;
const ArticleByline = styled.div`
  display: flex; gap: 9px; align-items: center; margin: 16px 0 23px;
  > span { display: grid; place-items: center; width: 29px; height: 29px; background: #e0eac9; color: #3d5d34; border-radius: 50%; font-family: Georgia, serif; }
  > div { display: grid; gap: 4px; } b { font-size: 9px; } small { font-size: 8px; color: #5b6a50; }
`;
const ArticleIllustration = styled.div`
  padding: 24px; background: #dce9b7; color: #254e31; overflow: hidden; position: relative;
  > span { font-size: 8px; letter-spacing: .12em; } > b { font-family: Georgia, serif; display: block; font-size: 32px; line-height: 1.06; margin-top: 16px; font-weight: 400; } i { color: #53763b; font-style: normal; }
  > div { display: flex; align-items: center; gap: 14px; margin-top: 21px; border-top: 1px solid #728f5440; padding-top: 14px; } > div span { font-size: 10px; }
  @container (max-width: 420px) { padding: 20px; > b { font-size: 26px; } }
`;
const ArticleEnd = styled.div`display: grid; gap: 12px; padding-top: 20px; border-top: 1px solid #d4ddc7; span { font-size: 8px; color: #607250; letter-spacing: .12em; } b { font-size: 13px; }`;
const ReadingHint = styled.div`display: flex; justify-content: center; align-items: center; gap: 7px; min-height: 30px; flex-shrink: 0; border-top: 1px solid #dce0d2; background: #f1f3e8; color: #55684a; font-size: 9px;`;
const InstagramWindow = styled.div`height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #fcfbf7;`;
const InstagramMasthead = styled.div`
  display: flex; align-items: center; gap: 12px; min-height: 34px; padding: 0 17px; border-bottom: 1px solid #e3e5dc; flex-shrink: 0;
  > span { font-size: 17px; font-family: Georgia, serif; font-style: italic; } > small { font-size: 8px; color: #5a6a51; } > svg { margin-left: auto; }
`;
const InstagramAuthor = styled.div`
  display: flex; align-items: center; gap: 9px; min-height: 45px; padding: 6px 17px; flex-shrink: 0;
  > span:first-child { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid #c6846d; border-radius: 50%; font-family: Georgia, serif; font-size: 14px; color: #5c6f47; background: #edf1dd; }
  > div { display: grid; gap: 3px; } b { font-size: 9px; } small { font-size: 8px; color: #606d58; } .comic-original { margin-left: auto; font-size: 8px; color: #596d4b; }
`;
const ComicViewport = styled.div`container-type: size; display: grid; place-items: center; flex: 1; min-height: 0; overflow: hidden; background: #eeeae0;`;
const ComicFrame = styled.div<{ $moving: boolean }>`
  position: relative; flex-shrink: 0; width: min(100%, 398px); aspect-ratio: 2 / 1; overflow: hidden; background: #d5d3c7;
  > img { position: absolute; width: 200%; max-width: none !important; height: 600%; }
  > span { position: absolute; right: 11px; top: 10px; color: white; font-size: 8px; padding: 4px 7px; border-radius: 12px; background: #142a23c9; font-variant-numeric: tabular-nums; }
  ${({ $moving }) => $moving && css`animation: ${switchIn} 500ms ease both;`}
`;
const ComicReactions = styled.div`
  display: flex; align-items: center; gap: 12px; min-height: 35px; padding: 0 17px; flex-shrink: 0;
  > span { margin-left: auto; font-size: 8px; color: #5f6d52; } > svg:first-child { color: #af6657; }
  @container (max-width: 420px) { gap: 10px; > span { font-size: 7px; } }
`;
const ComicCaption = styled.p`padding: 0 17px; min-height: 30px; margin: 0; flex-shrink: 0; font-size: 10px; line-height: 1.8; color: #52614a; word-break: keep-all; b { color: #23472d; font-size: 9px; margin-right: 5px; }`;
const ComicToolbar = styled.div`display: flex; align-items: center; justify-content: center; min-height: 44px; flex-shrink: 0; border-top: 1px solid #e0e4d6; background: #f1f3e7;`;
const ComicNavigation = styled.div`
  display: flex; justify-content: center; align-items: center; gap: 8px; min-height: 44px; flex: 1; min-width: 0;
  button { display: grid; place-items: center; width: 44px; height: 44px; border: 0; background: transparent; color: #3b6032; }
  > span { display: flex; gap: 5px; } i { width: 4px; height: 4px; background: #cbd3c0; border-radius: 50%; } i[data-active='true'] { background: #56753d; transform: scale(1.3); }
`;
const ComicAuto = styled.button`
  display: flex; justify-content: center; align-items: center; gap: 6px; min-height: 44px; min-width: 44px; padding: 0 13px; flex-shrink: 0; border: 0; border-left: 1px solid #dce2ce; background: transparent; color: #596f49; font-size: 9px !important;
  @container (max-width: 420px) { padding: 0 10px; > span { display: none; } }
`;
