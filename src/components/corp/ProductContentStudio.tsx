'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, Film, Heart, LoaderCircle, MessageCircle, MoreHorizontal, Pause, Play, RotateCcw, Send, Volume2, VolumeX } from 'lucide-react';
import styled, { css, keyframes } from 'styled-components';
import ProductShowcaseWorkspace from './ProductShowcaseWorkspace';
import { BlogPlatformLogos, ContentBrandMark, ContentChannelMotion } from './ProductContentBrands';
import { useShowcaseYouTubePlayer } from './useShowcaseYouTubePlayer';

type ProductContentStudioProps = {
  playing: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onPlaybackChange: (playing: boolean) => void;
  selectedChannel?: number;
  onChannelChange?: (index: number) => void;
  automaticTour?: boolean;
  sceneElapsedMs?: number;
  introduction?: ReactNode;
  renderNavigation?: (controls: ReactNode) => ReactNode;
};

const CHANNELS = [
  { id: 'youtube', label: 'YouTube', format: 'Shorts 영상', ratio: 'SHORTS' },
  { id: 'tiktok', label: 'TikTok', format: '숏폼 영상', ratio: '9:16' },
  { id: 'blog', label: '블로그', format: '브랜드 아티클', ratio: 'ARTICLE' },
  { id: 'instagram', label: 'Instagram', format: '스토리 웹툰', ratio: 'WEBTOON' },
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
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function StudioVideo({ vertical, playing, reducedMotion, onSelect, onPlaybackChange }: ProductContentStudioProps & { vertical: boolean }) {
  const [explicitPlay, setExplicitPlay] = useState(false);
  const name = vertical ? 'TikTok' : 'YouTube';
  const videoId = vertical ? 'eiivhfQJFOA' : 'k56Wglp9hI4';
  const title = vertical ? '슈퍼그뚠' : '그뚠목욕';
  const sourceUrl = `https://youtube.com/shorts/${videoId}`;
  const shouldPlay = playing && (!reducedMotion || explicitPlay);
  const { hostRef, status, blocked, videoPlaying, position, duration, muted, play, pause, retry, seek, toggleMute } = useShowcaseYouTubePlayer({ videoId, title: `${name} · ${title}`, shouldPlay, onUserPlay: () => { setExplicitPlay(true); onPlaybackChange(true); }, onUserPause: () => onPlaybackChange(false) });

  function toggleVideo() {
    onSelect();
    if (videoPlaying || (shouldPlay && !blocked && status !== 'error')) {
      setExplicitPlay(false);
      pause();
      onPlaybackChange(false);
      return;
    }
    if (status === 'error') {
      retry();
    }
    setExplicitPlay(true);
    onPlaybackChange(true);
    play();
  }

  return (
    <VideoProduct data-video-format={vertical ? 'portrait' : 'landscape'} data-video-id={videoId} data-player-state={videoPlaying ? 'playing' : 'paused'} data-player-status={status} data-player-time={position} data-player-duration={duration} data-player-muted={muted}>
      <VideoCanvas $vertical={vertical}>
        {vertical ? <VerticalNote aria-hidden="true"><span>SHORT.<br />STORY.<br />IMPACT.</span><small>한 장면의 가능성</small></VerticalNote> : null}
        <VideoDevice $vertical={vertical}>
          <YouTubeHost ref={hostRef} data-youtube-host />
          {status === 'loading' && shouldPlay ? <MediaNotice role="status"><LoaderCircle size={19} aria-hidden="true" /><span>영상 준비 중</span></MediaNotice> : null}
          {status === 'error' ? <MediaNotice role="status"><Film size={24} aria-hidden="true" /><span>영상을 불러오지 못했습니다.</span><button type="button" onClick={toggleVideo}><RotateCcw size={15} aria-hidden="true" />다시 불러오기</button><a href={sourceUrl} target="_blank" rel="noopener noreferrer">YouTube에서 보기 <ArrowUpRight size={14} aria-hidden="true" /></a></MediaNotice> : null}
          {blocked && status !== 'error' ? <MediaNotice><button type="button" onClick={toggleVideo}><Play size={17} aria-hidden="true" />영상 재생</button></MediaNotice> : null}
        </VideoDevice>
        {vertical ? <VerticalMarkers aria-hidden="true"><i /><span>09<br /><b>16</b></span><small>VERTICAL<br />STORY</small></VerticalMarkers> : null}
      </VideoCanvas>
      <VideoDetails>
        <div data-video-brand={vertical ? 'tiktok' : 'youtube'}><ContentBrandMark channel={vertical ? 'tiktok' : 'youtube'} /><div><strong>{name} <span>{vertical ? '틱톡' : '유튜브'}</span></strong><small>{title} · simply pig</small></div></div>
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${name} 원본 영상 보기`}>원본 보기 <ArrowUpRight size={14} aria-hidden="true" /></a>
      </VideoDetails>
      <VideoControls>
        <button type="button" onClick={toggleVideo} aria-label={`${name} 영상 ${videoPlaying ? '일시정지' : '재생'}`}>
          {videoPlaying ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(position, duration)}
          disabled={duration <= 0 || status === 'error'}
          aria-label={`${name} 영상 재생 위치`}
          aria-valuetext={`${videoTime(position)} / ${videoTime(duration)}`}
          onChange={(event) => {
            onSelect();
            const nextPosition = Number(event.target.value);
            seek(nextPosition);
          }}
        />
        <span>{videoTime(position)}<small> / {videoTime(duration)}</small></span>
        <button type="button" onClick={toggleMute} aria-label={`${name} 소리 ${muted ? '켜기' : '끄기'}`} aria-pressed={!muted}>{muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}</button>
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
      <BlogMasthead><b>그뚠이의 블로그</b><BlogPlatformLogos /></BlogMasthead>
      <BlogArticle ref={articleRef} tabIndex={0} aria-label="블로그 시연 글: 그뚠이의 업무일지" onFocus={onSelect} onPointerDown={onSelect} onWheel={onSelect} onKeyDown={onSelect}>
        <ArticleCategory>그뚠이의 업무일지 <span>이야기 01</span></ArticleCategory>
        <ArticleByline><span>그</span><div><b>그뚠이 · 프로피그</b><small>브랜드 콘텐츠 시연 · 3분 읽기</small></div></ArticleByline>
        <ArticleIllustration data-blog-character="cover">
          <div><h4>할 일은 가볍게,<br /><em>하루는 여유롭게.</em></h4><p>반복되는 일은 맡겨두고,<br />나는 중요한 것부터 확인한다.</p><span>그뚠이의 조금 편한 하루 <ArrowUpRight size={14} aria-hidden="true" /></span></div>
          <Image src="/images/corp/products/global/ddunddun-work.png" alt="태블릿으로 오늘의 업무를 확인하는 그뚠이" width={280} height={280} unoptimized draggable={false} />
        </ArticleIllustration>
        <p>오늘도 책상에는 정리할 자료가 한가득이다. 견적서, 거래명세서, 이번 달 급여 자료까지. 하나씩 옮겨 적기 전에 그뚠이는 태블릿을 꺼내 오늘 할 일을 먼저 확인한다. 귀찮은 일일수록, 시작은 간단한 편이 좋다.</p>
        <h5>01. 같은 내용은 한 번만 입력하기</h5>
        <p>거래처 이름과 품목을 입력하면 필요한 서류의 초안으로 이어진다. 그뚠이는 금액과 날짜, 빠진 항목을 차례로 살펴본다. 반복 입력을 줄인 자리에는 꼼꼼하게 검토할 시간을 남긴다.</p>
        <ArticleFigure data-blog-character="story">
          <Image src="/images/corp/products/automation/geudduni-pc.png" alt="책상에 발을 올리고 컴퓨터로 업무를 지시하는 그뚠이" width={1448} height={1086} unoptimized draggable={false} />
          <figcaption>“자료 정리는 맡겼으니, 나는 확인부터.”<span>그뚠이의 업무자동화 장면</span></figcaption>
        </ArticleFigure>
        <h5>02. 자리를 옮겨도, 하던 일 그대로</h5>
        <p>책상에서는 그뚠웹으로 자료를 넓게 보고, 잠깐 밖에 나가서는 그뚠앱으로 진행 상황을 확인한다. 스마트폰으로 필요한 내용을 전달하고, 돌아와서 이어서 살펴본다. 화면이 바뀌어도 해야 할 일을 다시 찾는 수고는 줄이고 싶다.</p>
        <blockquote>“일은 차근차근.<br />여유는 조금 더.”</blockquote>
        <h5>03. 남은 시간은 새로운 이야기에</h5>
        <p>정리가 끝나면 오늘의 발견을 짧은 글로 남긴다. 업무 중 떠오른 아이디어, 직접 써 본 물건, 내일 해 보고 싶은 일까지. 글에 사진과 캐릭터를 더하고, 블로그·영상·웹툰으로 같은 이야기를 다르게 전한다.</p>
        <p>그뚠이의 하루는 이렇게 이어진다. 모든 일을 한꺼번에 바꾸기보다, 자주 반복하는 작은 일 하나부터 편하게 만드는 것. 프로피그가 웹·앱·자동화·콘텐츠를 함께 만드는 이유다.</p>
        <ArticleEnd><span>오늘의 기록 끝</span><b>내일은 또 무엇을 가볍게 해 볼까?</b></ArticleEnd>
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
      <InstagramMasthead><ContentBrandMark channel="instagram" /><span>Instagram</span><small>스토리 웹툰</small><MoreHorizontal size={19} aria-hidden="true" /></InstagramMasthead>
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

export default function ProductContentStudio({ playing, reducedMotion, onSelect, onPlaybackChange, selectedChannel, onChannelChange, automaticTour = false, sceneElapsedMs = 0, introduction, renderNavigation }: ProductContentStudioProps) {
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

  const controls = (
    <ChannelTabs $sidebar={Boolean(renderNavigation)} ref={tabsRef} role="tablist" aria-label="생성형 콘텐츠 채널" onKeyDown={navigateChannels}>
      {CHANNELS.map(({ id: channelId, label }, index) => <ChannelTab key={channelId} id={`${id}-tab-${channelId}`} role="tab" aria-selected={index === channelIndex} aria-controls={`${id}-panel`} tabIndex={index === channelIndex ? 0 : -1} type="button" onClick={() => selectChannel(index)}><ContentBrandMark channel={channelId} /><span>{label}</span></ChannelTab>)}
    </ChannelTabs>
  );
  const content = (
    <StudioCanvas data-product-canvas data-product-interactive>
      {introduction}
      <ContentChannelMotion channel={current.id} playing={playing} reducedMotion={reducedMotion} />
      {!renderNavigation ? controls : null}
      <ProductWindow role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${current.id}`}>
        <WindowBar>
          <span aria-hidden="true"><i /><i /><i /></span>
          {current.id === 'youtube' || current.id === 'tiktok' ? <b data-video-window-brand={current.id}><ContentBrandMark channel={current.id} />{current.label}</b> : <b>propig / {current.id}</b>}
          <small>{current.id === 'tiktok' ? '15초 · ' : ''}{current.ratio}</small>
        </WindowBar>
        <ContentViewport key={current.id} $playing={playing && !reducedMotion} data-content-preview={current.id}>
          {current.id === 'youtube' || current.id === 'tiktok' ? <StudioVideo vertical={current.id === 'tiktok'} playing={playing} reducedMotion={reducedMotion} onSelect={onSelect} onPlaybackChange={onPlaybackChange} /> : null}
          {current.id === 'blog' ? <BlogPreview onSelect={onSelect} playing={playing} reducedMotion={reducedMotion} automaticTour={automaticTour} sceneElapsedMs={sceneElapsedMs} /> : null}
          {current.id === 'instagram' ? <WebtoonPreview playing={playing} reducedMotion={reducedMotion} onSelect={onSelect} automaticTour={automaticTour} sceneElapsedMs={sceneElapsedMs} /> : null}
        </ContentViewport>
      </ProductWindow>
      <StudioFooter><span><i aria-hidden="true" />{current.format}</span><span>시연 콘텐츠 <b>·</b> ONE STORY, EVERY CHANNEL</span></StudioFooter>
    </StudioCanvas>
  );

  return (
    <Studio data-content-studio data-content-channel={current.id} $playing={playing} $reducedMotion={reducedMotion} $workspace={Boolean(renderNavigation)}>
      {renderNavigation ? <ProductShowcaseWorkspace navigation={renderNavigation(controls)}>{content}</ProductShowcaseWorkspace> : content}
    </Studio>
  );
}

const switchIn = keyframes`from { opacity: .55; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); }`;
const spin = keyframes`to { transform: rotate(360deg); }`;

const Studio = styled.div<{ $playing: boolean; $reducedMotion: boolean; $workspace: boolean }>`
  container-type: inline-size; width: 100%; min-width: 0; padding: ${({ $workspace }) => $workspace ? '0' : '8px 8px 12px'}; color: #173b2e;
  *, *::before, *::after { box-sizing: border-box; }
  button { font: inherit; touch-action: manipulation; }
  [data-product-canvas] :is(button, input, article):focus-visible { outline: 3px solid #587e34 !important; outline-offset: -3px !important; }
  ${({ $playing }) => !$playing && css`*, *::before, *::after { animation-play-state: paused !important; }`}
  ${({ $reducedMotion }) => $reducedMotion && css`*, *::before, *::after { animation: none !important; transition: none !important; }`}
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
const StudioCanvas = styled.div`container-type: inline-size; min-width: 0; width: 100%;`;
const ChannelTabs = styled.div<{ $sidebar: boolean }>`display: grid; grid-template-columns: repeat(${({ $sidebar }) => $sidebar ? 2 : 4}, minmax(0, 1fr)); gap: 3px; margin: 5px 0 10px; padding: 3px; border: 1px solid #304b6b; border-radius: 7px; background: #081426;`;
const ChannelTab = styled.button`
  min-width: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 6px 4px; border: 0; border-radius: 4px; background: transparent; color: #bdc9da; font-size: 11px !important; font-weight: 650 !important; transition: background 180ms, color 180ms;
  &[aria-selected='true'] { background: #93c5fd; color: #07101f; }
  &:hover:not([aria-selected='true']) { background: #193a5d; color: #f3f7ff; }
  @container (max-width: 420px) { gap: 4px; font-size: 10px !important; [data-channel-logo] { width: 22px; height: 22px; > svg { width: 14px; height: 14px; } } }
  @container (max-width: 310px) { flex-direction: column; gap: 3px; font-size: 9px !important; }
`;
const ProductWindow = styled.div`overflow: hidden; border: 1px solid #375875; border-radius: 9px; background: #eef0e7; box-shadow: 0 18px 28px -18px #0008;`;
const WindowBar = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 13px; height: 30px; border-bottom: 1px solid #b7c7d9; background: #dce5ef;
  > span { display: flex; gap: 4px; } i { width: 5px; height: 5px; border: 1px solid #8b9eb4; border-radius: 50%; }
  b { font-size: 8px; font-weight: 500; font-family: ui-monospace, monospace; color: #435e7a; }
  [data-video-window-brand] { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 12px; font-weight: 750; color: #172e4a; }
  [data-video-window-brand] [data-channel-logo] { width: 21px; height: 21px; border-radius: 5px; > svg { width: 14px; height: 14px; } }
  small { font-size: 8px; font-weight: 700; letter-spacing: .08em; }
`;
const ContentViewport = styled.div<{ $playing: boolean }>`
  height: 400px; overflow: hidden; position: relative;
  ${({ $playing }) => $playing && css`animation: ${switchIn} 450ms ease both;`}
  @container (max-width: 420px) { height: 360px; }
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
  width: 100%; height: 100%; min-height: 200px; position: relative; overflow: hidden; background: #071322;
  ${({ $vertical }) => $vertical && css`width: 210px; min-height: 210px; flex-shrink: 0; border: 5px solid #102b22; border-radius: 18px; box-shadow: 0 8px 18px #19362630; z-index: 1;`}
`;
const YouTubeHost = styled.div`position: absolute; inset: 0; > iframe { display: block; width: 100%; height: 100%; border: 0; }`;
const VerticalNote = styled.div`
  position: absolute; left: 23px; top: 38px; color: #315578; > span { font-family: Georgia, serif; font-size: 26px; line-height: 1.13; } > small { display: block; margin-top: 14px; font-size: 9px; }
  @container (max-width: 520px) { left: 16px; top: 30px; > span { font-size: 18px; } > small { font-size: 8px; max-width: 45px; line-height: 1.7; } }
  @container (max-width: 350px) { display: none; }
`;
const VerticalMarkers = styled.div`
  position: absolute; right: 28px; bottom: 35px; display: grid; gap: 15px; color: #3f603c;
  i { width: 21px; height: 21px; border-top: 1px solid currentColor; border-right: 1px solid currentColor; justify-self: end; }
  > span { font-size: 34px; line-height: 1.1; font-family: Georgia, serif; text-align: right; } b { font-weight: 400; color: #4b603f; } small { font-size: 8px; line-height: 1.7; }
  @container (max-width: 420px) { right: 15px; > span { font-size: 24px; } small { font-size: 7px; } }
  @container (max-width: 350px) { display: none; }
`;
const MediaNotice = styled.div`
  position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: #102b22a8; color: #f3f7ff; padding: 18px; text-align: center;
  > span { font-size: 11px; line-height: 1.6; } > svg.lucide-loader-circle { animation: ${spin} 1s linear infinite; }
  button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 7px 12px; border: 1px solid #93c5fd; background: #93c5fd; color: #173b2e; border-radius: 5px; font-size: 11px; }
  a { display: inline-flex; align-items: center; gap: 5px; min-height: 44px; padding: 7px 12px; color: #fff; font-size: 11px; text-decoration: underline; }
`;
const VideoDetails = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 15px 0; flex-shrink: 0;
  > div { display: flex; align-items: center; gap: 8px; min-width: 0; }
  > div > div { display: grid; gap: 4px; min-width: 0; }
  strong { color: #172e4a; font-size: 13px; line-height: 1.4; font-weight: 750; }
  strong > span { margin-left: 3px; font-size: 10px; font-weight: 600; color: #435e7a; }
  small { font-size: 9px; line-height: 1.5; color: #58674f; }
  > svg { color: #4d7144; border: 1px solid #b7c5ab; border-radius: 50%; padding: 2px; width: 20px; height: 20px; flex-shrink: 0; }
  > a { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; min-height: 44px; padding: 0 3px; font-size: 10px; color: #315832; text-decoration: underline; }
  @container (max-width: 420px) { padding: 10px 11px 0; gap: 8px; strong { font-size: 12px; } }
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
  display: flex; align-items: center; justify-content: space-between; padding: 0 22px; height: 46px; flex-shrink: 0; border-bottom: 1px solid #dce0d2;
  > b { font-size: 13px; font-weight: 700; }
  @container (max-width: 520px) { padding: 0 15px; > b { display: none; } }
`;
const BlogArticle = styled.article`
  overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #b6c2a5 #f6f6ec; padding: 15px 30px 25px; flex: 1; min-height: 0;
  h4 { font-size: 24px; line-height: 1.5; margin: 14px 0; font-weight: 750; word-break: keep-all; } h4 em { font-style: normal; color: #537347; }
  > p { font-size: 13px; line-height: 2; color: #4c5b48; word-break: keep-all; margin: 20px 0; }
  h5 { font-size: 17px; line-height: 1.6; margin: 25px 0 12px; word-break: keep-all; }
  blockquote { margin: 25px 0; padding: 17px 20px; border-left: 3px solid #7c9c53; background: #eef1e0; color: #375632; font-size: 18px; font-weight: 650; line-height: 1.8; }
  @container (max-width: 420px) { padding: 12px 18px 22px; h4 { font-size: 20px; } > p { font-size: 12px; } h5 { font-size: 15px; } blockquote { padding: 14px; font-size: 16px; } }
`;
const ArticleCategory = styled.div`display: flex; justify-content: space-between; color: #596b4d; font-size: 8px; letter-spacing: .12em; span { color: #596b4d; }`;
const ArticleByline = styled.div`
  display: flex; gap: 9px; align-items: center; margin: 8px 0;
  > span { display: grid; place-items: center; width: 29px; height: 29px; background: #e0eac9; color: #3d5d34; border-radius: 50%; font-family: Georgia, serif; }
  > div { display: grid; gap: 4px; } b { font-size: 9px; } small { font-size: 8px; color: #5b6a50; }
`;
const ArticleIllustration = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) 42%; align-items: center; gap: 6px; padding: 10px 14px 6px 20px; background: #e5edcf; color: #254e31;
  > div { min-width: 0; } h4 { font-size: 23px; line-height: 1.45; margin: 0 0 10px; } p { font-size: 12px; line-height: 1.8; margin: 0; word-break: keep-all; }
  > div > span { display: flex; align-items: center; gap: 5px; margin-top: 13px; font-size: 9px; color: #4d6840; }
  > img { width: 100%; height: 150px; object-fit: contain; object-position: center bottom; }
  @container (max-width: 420px) { padding: 10px 7px 6px 12px; h4 { font-size: 17px; } p { font-size: 10px; } > div > span { font-size: 8px; gap: 3px; } > img { height: 120px; } }
`;
const ArticleFigure = styled.figure`
  display: grid; grid-template-columns: 48% minmax(0, 1fr); align-items: center; gap: 16px; margin: 22px 0; padding: 12px; background: #eef1e4; border-block: 1px solid #dce2cd;
  > img { display: block; width: 100%; height: auto; } figcaption { font-size: 14px; line-height: 1.8; font-weight: 700; color: #365332; word-break: keep-all; } figcaption span { display: block; margin-top: 8px; font-size: 9px; color: #5b6a50; font-weight: 400; }
  @container (max-width: 420px) { gap: 8px; padding: 8px; figcaption { font-size: 11px; } figcaption span { font-size: 8px; } }
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
