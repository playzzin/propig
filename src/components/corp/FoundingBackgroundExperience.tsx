'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Film,
  Flame,
  Gauge,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Swords,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import { CorpEditableSection, type CorpSectionEditorState } from '@/components/corp/CorpSectionEditOverlay';
import { getYouTubeEmbedUrl, YOUTUBE_EMBED_ALLOW } from '@/components/corp/corpMediaEmbed';
import type { CorpPage } from '@/schemas/corpPageSchema';

type OriginSignal = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type VideoBookPage = {
  eyebrow: string;
  title: string;
  description: string;
  label: string;
  source: string;
};

type PageTurnDirection = 'next' | 'prev';

type YouTubeStateChangeEvent = {
  data: number;
};

type YouTubePlayer = {
  destroy?: () => void;
  playVideo?: () => void;
  setVolume?: (volume: number) => void;
  unMute?: () => void;
};

type YouTubeReadyEvent = {
  target: YouTubePlayer;
};

type YouTubeApi = {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onReady?: (event: YouTubeReadyEvent) => void;
        onStateChange?: (event: YouTubeStateChangeEvent) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState?: {
    ENDED: number;
  };
};

type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

export type FoundingBackgroundConfig = {
  videoPages: VideoBookPage[];
  heroKicker: string;
  heroTitle: string;
  heroBody: string;
  problemImage: string;
  problemImageAlt: string;
  problemLabel: string;
  problemTitle: string;
  problemBody: string;
  buildImage: string;
  buildImageAlt: string;
  buildLabel: string;
  buildTitle: string;
  buildBody: string;
  originKicker: string;
  originTitle: string;
  originBody: string;
  originSignals: OriginSignal[];
  flowSteps: Array<{
    number: string;
    title: string;
    description: string;
    icon: LucideIcon;
  }>;
  quote: string;
  quoteCite: string;
};

interface FoundingBackgroundExperienceProps {
  config?: FoundingBackgroundConfig;
  editor?: CorpSectionEditorState;
  embedded?: boolean;
}

const videoBookPages: VideoBookPage[] = [
  {
    eyebrow: 'Chapter 01',
    title: '데이터로 남긴 첫 문제',
    description: '흩어진 요청과 반복 업무를 기록 가능한 데이터로 바꾸며 창업의 첫 기준을 세운 장면입니다.',
    label: '운영 데이터',
    source: '/corp/company-technology-data.mp4',
  },
  {
    eyebrow: 'Chapter 02',
    title: 'AI로 좁힌 실행 간격',
    description: '사람이 매번 판단하던 흐름을 보조하는 AI 구조를 붙여 더 빠른 실행 방식을 만들었습니다.',
    label: 'AI 실행',
    source: '/corp/company-technology-ai.mp4',
  },
  {
    eyebrow: 'Chapter 03',
    title: '자동화로 반복을 줄인 순간',
    description: '같은 설명과 확인을 반복하던 업무를 자동화해 팀이 문제 해결에 더 집중할 수 있게 했습니다.',
    label: '업무 자동화',
    source: '/corp/company-technology-automation.mp4',
  },
  {
    eyebrow: 'Chapter 04',
    title: '파트너와 함께 검증한 방식',
    description: '내부의 개선에 머물지 않고 파트너 환경에서 다시 검증하며 사업화 가능한 기준으로 정리했습니다.',
    label: '파트너 검증',
    source: '/corp/company-technology-partner.mp4',
  },
];

const originSignals: OriginSignal[] = [
  {
    title: '문제의 밀도',
    description: '현장 요청, 고객 피드백, 파트너 대응이 한꺼번에 몰리며 기존 방식의 한계가 먼저 보였습니다.',
    icon: Gauge,
  },
  {
    title: '실행의 증거',
    description: '멋진 선언보다 오늘 처리한 기록, 반복 가능한 절차, 다시 쓸 수 있는 기준을 먼저 쌓았습니다.',
    icon: BadgeCheck,
  },
  {
    title: '사업화의 방향',
    description: '각자 버티던 경험을 데이터와 운영 체계로 묶어 PRO PIG의 첫 제품 방향으로 정리했습니다.',
    icon: GitBranch,
  },
];

const iconMap: Record<string, LucideIcon> = {
  BadgeCheck,
  Film,
  Flame,
  Gauge,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Swords,
};

const FOUNDING_AUDIO_UNLOCK_STORAGE_KEY = 'propig:founding-background-audio-unlocked';

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeIframeApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube iframe API is only available in the browser.'));
  }

  const scopedWindow = window as YouTubeWindow;
  if (scopedWindow.YT?.Player) return Promise.resolve(scopedWindow.YT);

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previousReady = scopedWindow.onYouTubeIframeAPIReady;

      scopedWindow.onYouTubeIframeAPIReady = () => {
        previousReady?.();

        if (scopedWindow.YT?.Player) {
          resolve(scopedWindow.YT);
          return;
        }

        reject(new Error('YouTube iframe API did not initialize.'));
      };

      const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      if (existingScript) return;

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        youtubeApiPromise = null;
        reject(new Error('Failed to load YouTube iframe API.'));
      };
      document.head.appendChild(script);
    });
  }

  return youtubeApiPromise;
}

function findEnabledBlock(page: CorpPage | null | undefined, blockId: string) {
  return page?.blocks.find((block) => block.id === blockId && block.enabled !== false);
}

function getIconByName(name: string | null | undefined, fallback: LucideIcon) {
  return name ? iconMap[name] ?? fallback : fallback;
}

function getAutoplayYouTubeEmbedUrl(embedUrl: string | null, audioUnlocked = false) {
  if (!embedUrl) return null;

  try {
    const url = new URL(embedUrl);
    url.searchParams.set('autoplay', '1');
    url.searchParams.set('controls', '0');
    url.searchParams.set('disablekb', '1');
    url.searchParams.set('iv_load_policy', '3');
    url.searchParams.set('modestbranding', '1');
    url.searchParams.set('mute', audioUnlocked ? '0' : '1');
    url.searchParams.set('playsinline', '1');
    url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('rel', '0');

    if (typeof window !== 'undefined') {
      url.searchParams.set('origin', window.location.origin);
    }

    return url.toString();
  } catch {
    return embedUrl;
  }
}

function splitCaption(value: string | null | undefined, fallbackLabel: string, fallbackBody: string) {
  const [label, body] = (value ?? '').split('·').map((item) => item.trim());
  return {
    label: label || fallbackLabel,
    body: body || fallbackBody,
  };
}

export function buildFoundingBackgroundConfig(page?: CorpPage | null): FoundingBackgroundConfig {
  const heroBlock = findEnabledBlock(page, 'founding-hero');
  const mediaBlock = findEnabledBlock(page, 'founding-media');
  const featureBlock = findEnabledBlock(page, 'founding-features');
  const statementBlock = findEnabledBlock(page, 'founding-statement');
  const timelineBlock = findEnabledBlock(page, 'founding-timeline');
  const quoteBlock = findEnabledBlock(page, 'founding-quote');
  const media = mediaBlock?.type === 'media-showcase' ? mediaBlock.data.media : [];
  const videoMedia = media.filter((item) => item.type === 'video');
  const imageMedia = media.filter((item) => item.type === 'image');
  const problemCaption = splitCaption(imageMedia[0]?.caption, 'Problem Side', '요청은 늘고 기준은 흩어져 있던 출발점');
  const buildCaption = splitCaption(imageMedia[1]?.caption, 'Build Side', '흩어진 경험을 반복 가능한 운영 방식으로 전환');

  return {
    videoPages:
      videoMedia.length > 0
        ? videoMedia.map((item, index) => {
            const [eyebrow, label] = (item.caption ?? '').split('·').map((value) => value.trim());
            return {
              eyebrow: eyebrow || `Chapter ${String(index + 1).padStart(2, '0')}`,
              title: item.alt || videoBookPages[index]?.title || `영상 ${index + 1}`,
              description:
                item.description ||
                videoBookPages[index]?.description ||
                (mediaBlock?.type === 'media-showcase' ? mediaBlock.data.body : ''),
              label: label || videoBookPages[index]?.label || '영상',
              source: item.url,
            };
          })
        : videoBookPages,
    heroKicker: heroBlock?.type === 'hero' ? heroBlock.data.kicker : 'FOUNDING BACKGROUND',
    heroTitle:
      heroBlock?.type === 'hero'
        ? heroBlock.data.headline
        : '창업배경은 문제와 실행이 정면으로 부딪힌 순간에서 시작됐습니다.',
    heroBody:
      heroBlock?.type === 'hero'
        ? heroBlock.data.body
        : '왼쪽의 혼선은 매일 쌓이는 현장의 압박이고, 오른쪽의 체계는 그 압박을 버티며 만든 실행 방식입니다. PRO PIG는 둘 중 하나를 고르는 회사가 아니라, 두 장면이 충돌하는 지점에서 쓸모 있는 운영 기준을 만들었습니다.',
    problemImage: imageMedia[0]?.url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1100&q=82',
    problemImageAlt: imageMedia[0]?.alt || '복잡한 요청과 업무가 몰린 현장 상황 사진',
    problemLabel: problemCaption.label,
    problemTitle: imageMedia[0]?.alt || '현장의 혼선',
    problemBody: problemCaption.body,
    buildImage: imageMedia[1]?.url || 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1100&q=82',
    buildImageAlt: imageMedia[1]?.alt || '협업과 실행 체계가 정리되는 회의 사진',
    buildLabel: buildCaption.label,
    buildTitle: imageMedia[1]?.alt || '실행의 체계',
    buildBody: buildCaption.body,
    originKicker: featureBlock?.type === 'feature-grid' ? featureBlock.data.title : 'WHY WE STARTED',
    originTitle: statementBlock?.type === 'statement' ? statementBlock.data.title : '창업배경 섹션',
    originBody:
      statementBlock?.type === 'statement'
        ? statementBlock.data.body
        : '시작은 거창한 사업계획서보다 단순했습니다. 매번 새로 설명하고, 다시 확인하고, 급하게 처리하던 일을 더 안정적인 시스템으로 바꾸자는 문제의식이 창업의 기준이 됐습니다.',
    originSignals:
      featureBlock?.type === 'feature-grid' && featureBlock.data.features.length > 0
        ? featureBlock.data.features.map((feature, index) => ({
            title: feature.title,
            description: feature.body,
            icon: getIconByName(feature.icon, originSignals[index]?.icon ?? Gauge),
          }))
        : originSignals,
    flowSteps:
      timelineBlock?.type === 'timeline' && timelineBlock.data.items.length > 0
        ? timelineBlock.data.items.map((item) => ({
            number: item.date,
            title: item.title,
            description: item.body,
            icon: getIconByName(item.icon, Film),
          }))
        : [
            { number: '01', title: '불편을 기록', description: '현장 요청과 반복 업무를 기록으로 남겨 문제의 밀도를 확인했습니다.', icon: Film },
            { number: '02', title: '패턴을 분리', description: '반복되는 설명, 확인, 보고 흐름을 자동화 가능한 구조로 만들었습니다.', icon: GitBranch },
            { number: '03', title: '제품으로 고정', description: '검증된 방식을 제품 기준으로 정리하고 파트너 환경에서 다시 확인했습니다.', icon: ShieldCheck },
          ],
    quote:
      quoteBlock?.type === 'quote'
        ? quoteBlock.data.quote
        : '창업배경은 멋진 선언이 아니라 반복해서 부딪힌 문제를 끝까지 기록한 결과입니다.',
    quoteCite: quoteBlock?.type === 'quote' ? quoteBlock.data.cite ?? '' : 'PRO PIG Founding Story',
  };
}

export default function FoundingBackgroundExperience({ config, editor, embedded = false }: FoundingBackgroundExperienceProps = {}) {
  const activeConfig = config ?? buildFoundingBackgroundConfig();
  const [activeVideoPage, setActiveVideoPage] = useState(0);
  const [pageTurnDirection, setPageTurnDirection] = useState<PageTurnDirection>('next');
  const [duelSwapped, setDuelSwapped] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef = useRef(false);
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const videoPageTotal = Math.max(activeConfig.videoPages.length, 1);
  const safeActiveVideoPage = activeVideoPage % videoPageTotal;
  const selectedVideoPage = activeConfig.videoPages[safeActiveVideoPage] ?? videoBookPages[0];
  const selectedVideoEmbedUrl = getAutoplayYouTubeEmbedUrl(getYouTubeEmbedUrl(selectedVideoPage.source), audioUnlocked);
  const currentPageLabel = String(safeActiveVideoPage + 1).padStart(2, '0');
  const leftPhoto = duelSwapped
    ? { image: activeConfig.buildImage, alt: activeConfig.buildImageAlt }
    : { image: activeConfig.problemImage, alt: activeConfig.problemImageAlt };
  const rightPhoto = duelSwapped
    ? { image: activeConfig.problemImage, alt: activeConfig.problemImageAlt }
    : { image: activeConfig.buildImage, alt: activeConfig.buildImageAlt };

  const flipVideoPage = useCallback((direction: PageTurnDirection) => {
    setPageTurnDirection(direction);
    setActiveVideoPage((currentPage) => {
      if (direction === 'next') return (currentPage + 1) % videoPageTotal;
      return (currentPage - 1 + videoPageTotal) % videoPageTotal;
    });
  }, [setActiveVideoPage, setPageTurnDirection, videoPageTotal]);

  const selectVideoPage = useCallback((nextPage: number) => {
    if (nextPage === activeVideoPage) return;

    setPageTurnDirection(nextPage > activeVideoPage ? 'next' : 'prev');
    setActiveVideoPage(nextPage);
  }, [activeVideoPage, setActiveVideoPage, setPageTurnDirection]);

  const handleVideoEnded = useCallback(() => {
    if (videoPageTotal <= 1) return;
    flipVideoPage('next');
  }, [flipVideoPage, videoPageTotal]);

  const swapDuelImages = useCallback(() => {
    setDuelSwapped((current) => !current);
  }, [setDuelSwapped]);

  const playCurrentMedia = useCallback((unlockAudio = false) => {
    if (unlockAudio) {
      audioUnlockedRef.current = true;
      setAudioUnlocked(true);
    }

    const shouldPlayWithAudio = audioUnlockedRef.current;
    if (shouldPlayWithAudio) youtubePlayerRef.current?.unMute?.();
    youtubePlayerRef.current?.setVolume?.(100);
    youtubePlayerRef.current?.playVideo?.();

    const video = htmlVideoRef.current;
    if (!video) return;

    video.muted = !shouldPlayWithAudio;
    video.volume = 1;
    void video.play().catch(() => {
      // Browser autoplay policies can still require a user gesture.
    });
  }, [setAudioUnlocked]);

  useEffect(() => {
    if (!selectedVideoEmbedUrl || !youtubeIframeRef.current) return;

    let cancelled = false;
    let player: YouTubePlayer | null = null;

    loadYouTubeIframeApi()
      .then((api) => {
        if (cancelled || !youtubeIframeRef.current) return;

        player = new api.Player(youtubeIframeRef.current, {
          events: {
            onReady: (event) => {
              youtubePlayerRef.current = event.target;
              playCurrentMedia(audioUnlockedRef.current);
            },
            onStateChange: (event) => {
              const endedState = api.PlayerState?.ENDED ?? 0;
              if (event.data === endedState) handleVideoEnded();
            },
          },
        });
      })
      .catch(() => {
        // Autoplay still works when the API script is unavailable; only auto-advance is skipped.
      });

    return () => {
      cancelled = true;
      if (youtubePlayerRef.current === player) youtubePlayerRef.current = null;
      player?.destroy?.();
    };
  }, [handleVideoEnded, playCurrentMedia, selectedVideoEmbedUrl]);

  useEffect(() => {
    const userActivation = navigator.userActivation;
    const storedAudioUnlock = window.sessionStorage.getItem(FOUNDING_AUDIO_UNLOCK_STORAGE_KEY) === '1';

    if (storedAudioUnlock || userActivation?.isActive || userActivation?.hasBeenActive) {
      const unlockTimer = window.setTimeout(() => playCurrentMedia(true), 0);
      return () => window.clearTimeout(unlockTimer);
    }

    return undefined;
  }, [playCurrentMedia]);

  useEffect(() => {
    playCurrentMedia(audioUnlockedRef.current);
    const unlockCurrentMedia = () => playCurrentMedia(true);
    const unlockPointerOptions: AddEventListenerOptions = { passive: true, capture: true };
    const unlockKeyOptions: AddEventListenerOptions = { capture: true };

    window.addEventListener('pointerdown', unlockCurrentMedia, unlockPointerOptions);
    window.addEventListener('mousedown', unlockCurrentMedia, unlockPointerOptions);
    window.addEventListener('click', unlockCurrentMedia, unlockPointerOptions);
    window.addEventListener('touchstart', unlockCurrentMedia, unlockPointerOptions);
    window.addEventListener('keydown', unlockCurrentMedia, unlockKeyOptions);

    return () => {
      window.removeEventListener('pointerdown', unlockCurrentMedia, unlockPointerOptions);
      window.removeEventListener('mousedown', unlockCurrentMedia, unlockPointerOptions);
      window.removeEventListener('click', unlockCurrentMedia, unlockPointerOptions);
      window.removeEventListener('touchstart', unlockCurrentMedia, unlockPointerOptions);
      window.removeEventListener('keydown', unlockCurrentMedia, unlockKeyOptions);
    };
  }, [playCurrentMedia, selectedVideoEmbedUrl, selectedVideoPage.source]);

  return (
    <Page
      as={embedded ? 'section' : undefined}
      id={embedded ? undefined : 'content-area'}
      aria-labelledby="founding-title"
      $embedded={embedded}
    >
      <CorpEditableSection blockId="founding-media" label="영상/사진 수정" editor={editor}>
      <VideoBookSection aria-label="책장 스타일 창업배경 영상">
        <VideoBookStage>
          <BookControls aria-label="영상 책장 넘기기">
            <IconButton type="button" onClick={() => flipVideoPage('prev')} aria-label="이전 영상 보기">
              <ChevronLeft size={21} strokeWidth={2.5} aria-hidden="true" />
            </IconButton>
            <PageCounter>
              <strong>{currentPageLabel}</strong>
              <span>/ {String(videoPageTotal).padStart(2, '0')}</span>
            </PageCounter>
            <IconButton type="button" onClick={() => flipVideoPage('next')} aria-label="다음 영상 보기">
              <ChevronRight size={21} strokeWidth={2.5} aria-hidden="true" />
            </IconButton>
          </BookControls>

          <BookSpread key={`${activeVideoPage}-${pageTurnDirection}-spread`} $direction={pageTurnDirection}>
            <BookPage $variant="video">
              <VideoShell>
                {selectedVideoEmbedUrl ? (
                  <iframe
                    ref={youtubeIframeRef}
                    key={selectedVideoEmbedUrl}
                    src={selectedVideoEmbedUrl}
                    title={`${selectedVideoPage.title} 영상`}
                    loading="lazy"
                    allow={YOUTUBE_EMBED_ALLOW}
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <video
                    ref={htmlVideoRef}
                    key={selectedVideoPage.source}
                    src={selectedVideoPage.source}
                    autoPlay
                    muted={!audioUnlocked}
                    playsInline
                    preload="auto"
                    onEnded={handleVideoEnded}
                    aria-label={`${selectedVideoPage.title} 영상`}
                  />
                )}
              </VideoShell>
            </BookPage>

            <BookPage $variant="copy">
              <PageLabel>{selectedVideoPage.eyebrow}</PageLabel>
              <h3>{selectedVideoPage.title}</h3>
              <p>{selectedVideoPage.description}</p>
              <PageMeta>
                <Film size={18} strokeWidth={2.5} aria-hidden="true" />
                {selectedVideoPage.label}
              </PageMeta>
            </BookPage>

            <PageTurnSheet
              key={`${activeVideoPage}-${pageTurnDirection}`}
              $direction={pageTurnDirection}
              aria-hidden="true"
            />
          </BookSpread>

          <ChapterRail aria-label="영상 챕터 선택">
            {activeConfig.videoPages.map((page, index) => (
              <ChapterButton
                key={page.source}
                type="button"
                $active={index === safeActiveVideoPage}
                aria-pressed={index === safeActiveVideoPage}
                onClick={() => selectVideoPage(index)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {page.label}
              </ChapterButton>
            ))}
          </ChapterRail>
        </VideoBookStage>
      </VideoBookSection>
      </CorpEditableSection>

      <CorpEditableSection blockId="founding-hero" label="대결 섹션 수정" editor={editor}>
      <HeroSection aria-label="창업배경 사진 대결 구도">
        <HeroCopy>
          <Kicker>
            <Sparkles size={17} strokeWidth={2.5} aria-hidden="true" />
            {activeConfig.heroKicker}
          </Kicker>
          <h1 id="founding-title">{activeConfig.heroTitle}</h1>
          <p>{activeConfig.heroBody}</p>
        </HeroCopy>

        <DuelStage aria-label="현장 문제 사진과 실행 체계 사진의 대결 애니메이션">
          <PhotoCard $side="left">
            <PhotoVisual
              key={`left-${leftPhoto.image}`}
              $image={leftPhoto.image}
              role="img"
              aria-label={leftPhoto.alt}
            />
          </PhotoCard>

          <VersusMark type="button" onClick={swapDuelImages} aria-label="좌우 사진 바꾸기">
            <i aria-hidden="true" />
            <strong>VS</strong>
            <Swords size={24} strokeWidth={2.5} aria-hidden="true" />
          </VersusMark>

          <PhotoCard $side="right">
            <PhotoVisual
              key={`right-${rightPhoto.image}`}
              $image={rightPhoto.image}
              role="img"
              aria-label={rightPhoto.alt}
            />
          </PhotoCard>
        </DuelStage>
      </HeroSection>
      </CorpEditableSection>

      <OriginSection aria-labelledby="origin-section-title">
        <CorpEditableSection blockId="founding-statement" label="WHY 문구 수정" editor={editor}>
        <SectionHeader>
          <Kicker>
            <Flame size={17} strokeWidth={2.5} aria-hidden="true" />
            {activeConfig.originKicker}
          </Kicker>
          <h2 id="origin-section-title">{activeConfig.originTitle}</h2>
          <p>{activeConfig.originBody}</p>
        </SectionHeader>
        </CorpEditableSection>

        <CorpEditableSection blockId="founding-features" label="WHY 카드 수정" editor={editor}>
        <SignalGrid>
          {activeConfig.originSignals.map((signal) => {
            const Icon = signal.icon;

            return (
              <SignalCard key={signal.title}>
                <Icon size={21} strokeWidth={2.5} aria-hidden="true" />
                <strong>{signal.title}</strong>
                <p>{signal.description}</p>
              </SignalCard>
              );
            })}
        </SignalGrid>
        </CorpEditableSection>

        <CorpEditableSection blockId="founding-timeline" label="흐름 단계 수정" editor={editor}>
        <FlowPanel>
          {activeConfig.flowSteps.map((step, index) => (
            <Fragment key={`${step.number}-${step.title}`}>
              <FlowStep key={`${step.number}-${step.title}`}>
                <span>{step.number}</span>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </FlowStep>
              {index < activeConfig.flowSteps.length - 1 && (
                <ArrowRight key={`${step.number}-arrow`} size={18} strokeWidth={2.5} aria-hidden="true" />
              )}
            </Fragment>
          ))}
          <ShieldCheck size={22} strokeWidth={2.5} aria-hidden="true" />
        </FlowPanel>
        </CorpEditableSection>

        <CorpEditableSection blockId="founding-quote" label="창업 인용문 수정" editor={editor}>
        <FoundingQuote>
          <p>{activeConfig.quote}</p>
          {activeConfig.quoteCite ? <cite>{activeConfig.quoteCite}</cite> : null}
        </FoundingQuote>
        </CorpEditableSection>
      </OriginSection>
    </Page>
  );
}

const Page = styled.main<{ $embedded: boolean }>`
  --founding-bg: #090d16;
  --founding-card: rgba(19, 25, 38, 0.74);
  --founding-border: rgba(199, 210, 254, 0.16);
  --founding-soft: rgba(226, 232, 240, 0.08);
  --founding-text: #f8fafc;
  --founding-muted: #cbd5e1;
  --founding-faint: #94a3b8;
  --founding-blue: #3b82f6;
  --founding-indigo: #6366f1;
  --founding-violet: #a855f7;
  --founding-emerald: #10b981;
  --founding-amber: #fbbf24;
  flex: ${(props) => (props.$embedded ? '0 0 auto' : '1')};
  min-width: 0;
  min-height: ${(props) => (props.$embedded ? 'auto' : '0')};
  overflow-y: ${(props) => (props.$embedded ? 'visible' : 'auto')};
  overflow-x: hidden;
  isolation: isolate;
  position: relative;
  width: 100%;
  margin: ${(props) => (props.$embedded ? '34px 0 0' : '0')};
  padding: 40px 32px 64px;
  color: var(--founding-text);
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.032) 1px, transparent 1px),
    radial-gradient(circle at 18% 20%, rgba(99, 102, 241, 0.22), transparent 34%),
    radial-gradient(circle at 84% 26%, rgba(16, 185, 129, 0.14), transparent 31%),
    radial-gradient(circle at 52% 82%, rgba(168, 85, 247, 0.11), transparent 35%),
    var(--founding-bg);
  background-size: 64px 64px, 64px 64px, auto, auto, auto, auto;
  border-top: ${(props) => (props.$embedded ? '1px solid rgba(226, 232, 240, 0.12)' : '0')};

  @media (max-width: 760px) {
    padding: 22px 12px 42px;
  }
`;

const VideoBookSection = styled.section`
  width: min(1160px, 100%);
  margin: 0 auto 30px;
  position: relative;
  overflow: hidden;
  padding: 18px;
  border: 1px solid rgba(226, 232, 240, 0.12);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(34, 211, 238, 0.11), transparent 28%),
    linear-gradient(315deg, rgba(251, 191, 36, 0.11), transparent 28%),
    rgba(15, 23, 42, 0.76);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.18),
    inset -12px -14px 30px rgba(2, 6, 23, 0.62),
    0 28px 78px rgba(0, 0, 0, 0.32);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(115deg, transparent 0 46%, rgba(255, 255, 255, 0.08) 47%, transparent 49%),
      repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 22px);
    opacity: 0.45;
  }

  @media (max-width: 760px) {
    margin-bottom: 22px;
    padding: 10px;
  }
`;

const VideoBookStage = styled.div`
  min-width: 0;
  position: relative;
  z-index: 1;
  display: grid;
  gap: 12px;
`;

const BookControls = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;

  @media (max-width: 520px) {
    justify-content: space-between;
  }
`;

const IconButton = styled.button`
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 1px solid rgba(226, 232, 240, 0.16);
  border-radius: 999px;
  color: var(--founding-text);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)),
    rgba(15, 23, 42, 0.74);
  cursor: pointer;
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.18),
    inset -7px -8px 16px rgba(2, 6, 23, 0.54);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(94, 234, 212, 0.44);
    background:
      linear-gradient(145deg, rgba(94, 234, 212, 0.2), rgba(251, 191, 36, 0.08)),
      rgba(15, 23, 42, 0.82);
  }

  &:focus-visible {
    outline: 3px solid rgba(94, 234, 212, 0.34);
    outline-offset: 3px;
  }
`;

const PageCounter = styled.div`
  min-width: 88px;
  min-height: 42px;
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  padding: 0 12px;
  border: 1px solid rgba(226, 232, 240, 0.12);
  border-radius: 999px;
  color: var(--founding-muted);
  background: rgba(15, 23, 42, 0.58);

  strong {
    color: var(--founding-text);
    font-size: 1.08rem;
  }

  span {
    font-size: 0.8rem;
    font-weight: 800;
  }
`;

const BookSpread = styled.div<{ $direction: PageTurnDirection }>`
  --book-copy-page-width: clamp(280px, 31%, 380px);
  min-height: 520px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--book-copy-page-width);
  position: relative;
  overflow: hidden;
  perspective: 1800px;
  transform-style: preserve-3d;
  border: 1px solid rgba(15, 23, 42, 0.3);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(2, 6, 23, 0.42), transparent 49%, rgba(2, 6, 23, 0.48) 51%, transparent),
    #eef2f7;
  box-shadow:
    0 22px 56px rgba(0, 0, 0, 0.34),
    inset 0 0 0 1px rgba(255, 255, 255, 0.28);

  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(100% - var(--book-copy-page-width));
    z-index: 3;
    width: 18px;
    pointer-events: none;
    transform: translateX(-50%);
    background:
      linear-gradient(90deg, rgba(15, 23, 42, 0.28), rgba(255, 255, 255, 0.26), rgba(15, 23, 42, 0.22)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.28), transparent 22%, transparent 78%, rgba(15, 23, 42, 0.16));
    opacity: ${(props) => (props.$direction === 'next' ? 0.9 : 0.78)};
  }

  > article:first-of-type {
    animation: ${(props) => (props.$direction === 'next' ? 'videoPageSettleNext' : 'videoPageSettlePrev')} 760ms
      cubic-bezier(0.2, 0.72, 0.16, 1) both;
  }

  > article:nth-of-type(2) {
    animation: ${(props) => (props.$direction === 'next' ? 'copyPageSettleNext' : 'copyPageSettlePrev')} 760ms
      cubic-bezier(0.2, 0.72, 0.16, 1) both;
  }

  @keyframes copyPageSettleNext {
    0% {
      transform: translateX(22px) rotateY(-7deg);
      filter: brightness(0.94);
    }

    100% {
      transform: translateX(0) rotateY(0deg);
      filter: brightness(1);
    }
  }

  @keyframes copyPageSettlePrev {
    0% {
      transform: translateX(16px) rotateY(-5deg);
      filter: brightness(0.94);
    }

    100% {
      transform: translateX(0) rotateY(0deg);
      filter: brightness(1);
    }
  }

  @keyframes videoPageSettleNext {
    0% {
      transform: translateX(-18px) rotateY(5deg) scale(0.985);
    }

    100% {
      transform: translateX(0) rotateY(0deg) scale(1);
    }
  }

  @keyframes videoPageSettlePrev {
    0% {
      transform: translateX(-24px) rotateY(7deg) scale(0.985);
    }

    100% {
      transform: translateX(0) rotateY(0deg) scale(1);
    }
  }

  @media (max-width: 700px) {
    --book-copy-page-width: 100%;
    min-height: 0;
    grid-template-columns: 1fr;

    &::before {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    > article:first-of-type,
    > article:nth-of-type(2) {
      animation: none;
    }
  }
`;

const BookPage = styled.article<{ $variant: 'copy' | 'video' }>`
  min-width: 0;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: ${(props) => (props.$variant === 'copy' ? 'center' : 'stretch')};
  gap: 14px;
  padding: ${(props) => (props.$variant === 'copy' ? '26px' : '0')};
  color: ${(props) => (props.$variant === 'copy' ? '#111827' : 'var(--founding-text)')};
  background:
    ${(props) =>
      props.$variant === 'copy'
        ? 'linear-gradient(90deg, rgba(15, 23, 42, 0.08), transparent 12%), repeating-linear-gradient(0deg, rgba(15, 23, 42, 0.045) 0 1px, transparent 1px 29px), #f8fafc'
        : '#050812'};

  h3 {
    margin: 0;
    max-width: 310px;
    font-size: 1.78rem;
    line-height: 1.14;
    letter-spacing: 0;
    word-break: keep-all;
    overflow-wrap: break-word;
  }

  p {
    margin: 0;
    max-width: 320px;
    color: #334155;
    font-size: 1rem;
    line-height: 1.72;
    word-break: keep-all;
    overflow-wrap: break-word;
  }

  @media (max-width: 700px) {
    padding: ${(props) => (props.$variant === 'copy' ? '22px' : '0')};

    h3 {
      max-width: none;
      font-size: 1.62rem;
    }

    p {
      max-width: none;
    }
  }
`;

const PageLabel = styled.span`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(15, 23, 42, 0.13);
  border-radius: 999px;
  color: #0f766e;
  background: rgba(20, 184, 166, 0.1);
  font-size: 0.74rem;
  font-weight: 950;
`;

const PageMeta = styled.span`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  margin-top: 6px;
  padding: 0 12px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 999px;
  color: #0f172a;
  background: rgba(251, 191, 36, 0.18);
  font-size: 0.82rem;
  font-weight: 900;

  svg {
    color: #d97706;
  }
`;

const VideoShell = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: #020617;

  video,
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 520px;
    border: 0;
    object-fit: cover;
    filter: none;
    pointer-events: none;
    background: #020617;
  }

  @media (max-width: 700px) {
    video,
    iframe {
      min-height: 260px;
      aspect-ratio: 16 / 10;
    }
  }
`;

const PageTurnSheet = styled.div<{ $direction: PageTurnDirection }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${(props) => (props.$direction === 'next' ? 'calc(100% - var(--book-copy-page-width))' : '0')};
  z-index: 4;
  width: ${(props) => (props.$direction === 'next' ? 'var(--book-copy-page-width)' : 'calc(100% - var(--book-copy-page-width))')};
  pointer-events: none;
  transform-origin: ${(props) => (props.$direction === 'next' ? 'left center' : 'right center')};
  backface-visibility: hidden;
  transform-style: preserve-3d;
  background:
    linear-gradient(
      ${(props) => (props.$direction === 'next' ? '96deg' : '264deg')},
      rgba(20, 184, 166, 0.22),
      transparent 8%,
      transparent 84%,
      rgba(251, 191, 36, 0.18)
    ),
    linear-gradient(
      ${(props) => (props.$direction === 'next' ? '90deg' : '270deg')},
      rgba(15, 23, 42, 0.32),
      rgba(255, 255, 255, 0.9) 16%,
      rgba(248, 250, 252, 0.96) 48%,
      rgba(203, 213, 225, 0.76) 82%,
      rgba(15, 23, 42, 0.34)
    ),
    repeating-linear-gradient(0deg, rgba(15, 23, 42, 0.045) 0 1px, transparent 1px 28px),
    #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-left-color: ${(props) => (props.$direction === 'next' ? 'rgba(15, 23, 42, 0.32)' : 'rgba(255, 255, 255, 0.52)')};
  border-right-color: ${(props) => (props.$direction === 'next' ? 'rgba(255, 255, 255, 0.52)' : 'rgba(15, 23, 42, 0.32)')};
  box-shadow:
    ${(props) => (props.$direction === 'next' ? '-22px' : '22px')} 0 42px rgba(15, 23, 42, 0.42),
    inset ${(props) => (props.$direction === 'next' ? '10px' : '-10px')} 0 18px rgba(255, 255, 255, 0.5),
    inset ${(props) => (props.$direction === 'next' ? '-16px' : '16px')} 0 22px rgba(15, 23, 42, 0.18);
  filter: drop-shadow(${(props) => (props.$direction === 'next' ? '-18px' : '18px')} 0 24px rgba(2, 6, 23, 0.3));
  animation: ${(props) => (props.$direction === 'next' ? 'turnNextPage' : 'turnPrevPage')} 1080ms cubic-bezier(0.18, 0.78, 0.14, 1)
    both;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    ${(props) => (props.$direction === 'next' ? 'left: 0;' : 'right: 0;')}
    width: 9px;
    background:
      linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.22), transparent),
      rgba(15, 23, 42, 0.1);
    filter: blur(0.2px);
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(115deg, transparent 0 38%, rgba(255, 255, 255, 0.82) 48%, transparent 60%),
      linear-gradient(
        ${(props) => (props.$direction === 'next' ? '90deg' : '270deg')},
        rgba(15, 23, 42, 0.18),
        transparent 18%,
        transparent 72%,
        rgba(15, 23, 42, 0.12)
      );
    opacity: 0;
    animation: paperGlint 1080ms cubic-bezier(0.18, 0.78, 0.14, 1) both;
  }

  @keyframes turnNextPage {
    0% {
      opacity: 0.98;
      transform: rotateY(0deg);
    }

    34% {
      opacity: 1;
      transform: rotateY(-58deg) translateX(-6px) scaleX(1.02);
    }

    62% {
      opacity: 0.82;
      transform: rotateY(-112deg) translateX(-15px) scaleX(0.9);
    }

    100% {
      opacity: 0;
      transform: rotateY(-172deg) translateX(-28px) scaleX(0.78);
    }
  }

  @keyframes turnPrevPage {
    0% {
      opacity: 0.98;
      transform: rotateY(0deg);
    }

    34% {
      opacity: 1;
      transform: rotateY(58deg) translateX(6px) scaleX(1.02);
    }

    62% {
      opacity: 0.82;
      transform: rotateY(112deg) translateX(15px) scaleX(0.9);
    }

    100% {
      opacity: 0;
      transform: rotateY(172deg) translateX(28px) scaleX(0.78);
    }
  }

  @keyframes paperGlint {
    0%,
    100% {
      opacity: 0;
      transform: translateX(${(props) => (props.$direction === 'next' ? '-34%' : '34%')});
    }

    46% {
      opacity: 0.62;
      transform: translateX(0);
    }
  }

  @media (max-width: 700px) {
    left: 0;
    width: 100%;
    transform-origin: ${(props) => (props.$direction === 'next' ? 'left center' : 'right center')};
    background:
      linear-gradient(
        ${(props) => (props.$direction === 'next' ? '96deg' : '264deg')},
        rgba(20, 184, 166, 0.2),
        transparent 9%,
        transparent 84%,
        rgba(251, 191, 36, 0.16)
      ),
      linear-gradient(
        ${(props) => (props.$direction === 'next' ? '90deg' : '270deg')},
        rgba(15, 23, 42, 0.28),
        rgba(255, 255, 255, 0.95) 17%,
        rgba(248, 250, 252, 0.98) 48%,
        rgba(203, 213, 225, 0.78) 80%,
        rgba(15, 23, 42, 0.34)
      ),
      repeating-linear-gradient(0deg, rgba(15, 23, 42, 0.05) 0 1px, transparent 1px 27px),
      #f8fafc;
    animation: ${(props) => (props.$direction === 'next' ? 'turnNextMobilePage' : 'turnPrevMobilePage')} 1080ms
      cubic-bezier(0.18, 0.78, 0.14, 1) both;
  }

  @keyframes turnNextMobilePage {
    0% {
      opacity: 0.98;
      transform: rotateY(0deg) translateX(0) scaleX(1);
    }

    46% {
      opacity: 1;
      transform: rotateY(-78deg) translateX(-7%) scaleX(0.92);
    }

    100% {
      opacity: 0;
      transform: rotateY(-168deg) translateX(-18%) scaleX(0.66);
    }
  }

  @keyframes turnPrevMobilePage {
    0% {
      opacity: 0.98;
      transform: rotateY(0deg) translateX(0) scaleX(1);
    }

    46% {
      opacity: 1;
      transform: rotateY(78deg) translateX(7%) scaleX(0.92);
    }

    100% {
      opacity: 0;
      transform: rotateY(168deg) translateX(18%) scaleX(0.66);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 0;
  }
`;

const ChapterRail = styled.div`
  min-width: 0;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 234, 212, 0.48) transparent;

  &::-webkit-scrollbar {
    height: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(94, 234, 212, 0.38);
    border-radius: 999px;
  }

  @media (max-width: 520px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow: visible;
  }
`;

const ChapterButton = styled.button<{ $active: boolean }>`
  flex: 0 0 auto;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(94, 234, 212, 0.58)' : 'rgba(226, 232, 240, 0.13)')};
  border-radius: 999px;
  color: ${(props) => (props.$active ? '#f8fafc' : 'var(--founding-muted)')};
  background: ${(props) =>
    props.$active
      ? 'linear-gradient(135deg, rgba(20, 184, 166, 0.42), rgba(251, 191, 36, 0.2)), rgba(15, 23, 42, 0.86)'
      : 'rgba(15, 23, 42, 0.54)'};
  font-size: 0.84rem;
  font-weight: 900;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: ${(props) => (props.$active ? '0 10px 24px rgba(20, 184, 166, 0.18)' : 'none')};
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;

  span {
    color: ${(props) => (props.$active ? '#fde68a' : 'var(--founding-faint)')};
    font-size: 0.72rem;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(94, 234, 212, 0.44);
  }

  &:focus-visible {
    outline: 3px solid rgba(94, 234, 212, 0.34);
    outline-offset: 3px;
  }

  @media (max-width: 520px) {
    width: 100%;
    white-space: normal;
  }
`;

const HeroSection = styled.section`
  width: min(1160px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 24px;
`;

const HeroCopy = styled.header`
  max-width: 860px;
  display: grid;
  gap: 14px;

  h1 {
    margin: 0;
    color: var(--founding-text);
    font-size: clamp(2.1rem, 5vw, 4.8rem);
    line-height: 1.05;
    letter-spacing: 0;
    word-break: keep-all;
    overflow-wrap: break-word;
  }

  p {
    margin: 0;
    max-width: 760px;
    color: var(--founding-muted);
    font-size: 1.05rem;
    line-height: 1.82;
    word-break: keep-all;
    overflow-wrap: break-word;
  }
`;

const Kicker = styled.span`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid rgba(165, 180, 252, 0.22);
  border-radius: 999px;
  color: #c7d2fe;
  background: rgba(99, 102, 241, 0.12);
  font-size: 0.78rem;
  font-weight: 900;
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.16),
    inset -7px -8px 18px rgba(2, 6, 23, 0.62);
`;

const DuelStage = styled.div`
  min-height: 500px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 118px minmax(0, 1fr);
  gap: 0;
  align-items: center;
  position: relative;
  padding: 20px;
  border: 1px solid rgba(226, 232, 240, 0.1);
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.1), transparent 34%),
    rgba(15, 23, 42, 0.64);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.18),
    inset -12px -14px 28px rgba(2, 6, 23, 0.62),
    0 28px 76px rgba(0, 0, 0, 0.34);
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: -24% 48% -24% auto;
    width: 180px;
    background: linear-gradient(180deg, transparent, rgba(99, 102, 241, 0.38), rgba(16, 185, 129, 0.3), transparent);
    filter: blur(18px);
    animation: clashPulse 3.4s ease-in-out infinite;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.032) 1px, transparent 1px);
    background-size: 52px 52px;
    opacity: 0.22;
  }

  @keyframes clashPulse {
    0%,
    100% {
      transform: translateX(-16px) rotate(10deg);
      opacity: 0.48;
    }

    50% {
      transform: translateX(16px) rotate(-10deg);
      opacity: 0.9;
    }
  }

  @media (max-width: 900px) {
    min-height: 0;
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 14px;

    &::before {
      inset: 42% -20% auto -20%;
      width: auto;
      height: 110px;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      animation: none;
    }
  }
`;

const PhotoCard = styled.article<{ $side: 'left' | 'right' }>`
  min-width: 0;
  min-height: 430px;
  position: relative;
  z-index: 1;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.13);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.82);
  transform: ${(props) => (props.$side === 'left' ? 'rotate(-2.4deg) translateX(18px)' : 'rotate(2.4deg) translateX(-18px)')};
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.18),
    inset -10px -12px 24px rgba(2, 6, 23, 0.66),
    0 24px 58px rgba(0, 0, 0, 0.34);
  animation: ${(props) => (props.$side === 'left' ? 'leftStrike' : 'rightStrike')} 4.6s ease-in-out infinite;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background:
      linear-gradient(120deg, transparent 0 42%, rgba(255, 255, 255, 0.22) 50%, transparent 58%),
      linear-gradient(180deg, rgba(2, 6, 23, 0.04), rgba(2, 6, 23, 0.18));
    opacity: 0.44;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
    background-size: 42px 42px;
    mix-blend-mode: screen;
    opacity: 0.42;
  }

  @keyframes leftStrike {
    0%,
    100% {
      transform: rotate(-2.4deg) translateX(18px) scale(1);
    }

    45% {
      transform: rotate(-1deg) translateX(36px) scale(1.018);
    }

    55% {
      transform: rotate(-3deg) translateX(10px) scale(0.995);
    }
  }

  @keyframes rightStrike {
    0%,
    100% {
      transform: rotate(2.4deg) translateX(-18px) scale(1);
    }

    45% {
      transform: rotate(1deg) translateX(-36px) scale(1.018);
    }

    55% {
      transform: rotate(3deg) translateX(-10px) scale(0.995);
    }
  }

  @media (max-width: 900px) {
    min-height: 360px;
    transform: none;
    animation: none;
  }

  @media (max-width: 520px) {
    min-height: 310px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const PhotoVisual = styled.div<{ $image: string }>`
  position: absolute;
  inset: 0;
  background-image: url(${(props) => props.$image});
  background-position: center;
  background-size: cover;
  filter: saturate(0.98) contrast(1.03) brightness(0.94);
  transform: scale(1.05);
  animation: photoSwapIn 520ms cubic-bezier(0.2, 0.72, 0.16, 1) both;

  @keyframes photoSwapIn {
    0% {
      opacity: 0.58;
      transform: scale(1.1);
      filter: saturate(0.86) contrast(1) brightness(0.78) blur(8px);
    }

    100% {
      opacity: 1;
      transform: scale(1.05);
      filter: saturate(0.98) contrast(1.03) brightness(0.94) blur(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const VersusMark = styled.button`
  width: 118px;
  height: 118px;
  z-index: 3;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  justify-self: center;
  position: relative;
  padding: 0;
  border: 1px solid rgba(226, 232, 240, 0.16);
  border-radius: 999px;
  appearance: none;
  color: #f8fafc;
  font: inherit;
  background:
    radial-gradient(circle at 32% 25%, rgba(255, 255, 255, 0.22), transparent 28%),
    linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(99, 102, 241, 0.96), rgba(168, 85, 247, 0.92));
  cursor: pointer;
  box-shadow:
    0 0 0 10px rgba(99, 102, 241, 0.11),
    0 0 42px rgba(99, 102, 241, 0.54),
    inset 1px 1px 0 rgba(255, 255, 255, 0.26),
    inset -10px -12px 20px rgba(30, 41, 59, 0.58);
  animation: badgeImpact 4.6s ease-in-out infinite;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    filter 180ms ease;

  i {
    width: 36px;
    height: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.64);
  }

  strong {
    font-size: 2.1rem;
    line-height: 1;
    font-weight: 950;
  }

  i,
  strong,
  svg {
    pointer-events: none;
  }

  &:hover {
    border-color: rgba(94, 234, 212, 0.7);
    box-shadow:
      0 0 0 12px rgba(20, 184, 166, 0.14),
      0 0 52px rgba(94, 234, 212, 0.5),
      inset 1px 1px 0 rgba(255, 255, 255, 0.28),
      inset -10px -12px 20px rgba(30, 41, 59, 0.58);
    filter: brightness(1.08);
  }

  &:focus-visible {
    outline: 3px solid rgba(94, 234, 212, 0.42);
    outline-offset: 5px;
  }

  @keyframes badgeImpact {
    0%,
    100% {
      transform: scale(1) rotate(0deg);
    }

    46% {
      transform: scale(1.08) rotate(-4deg);
    }

    56% {
      transform: scale(0.98) rotate(4deg);
    }
  }

  @media (max-width: 900px) {
    width: 92px;
    height: 92px;
    margin: -6px 0;

    strong {
      font-size: 1.6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const OriginSection = styled.section`
  width: min(1160px, 100%);
  margin: 26px auto 0;
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid rgba(226, 232, 240, 0.1);
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.1), transparent 34%),
    rgba(15, 23, 42, 0.64);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.16),
    inset -10px -12px 24px rgba(2, 6, 23, 0.62),
    0 24px 68px rgba(0, 0, 0, 0.28);

  @media (max-width: 760px) {
    padding: 14px;
  }
`;

const SectionHeader = styled.header`
  display: grid;
  gap: 12px;

  h2 {
    margin: 0;
    color: var(--founding-text);
    font-size: clamp(1.7rem, 3vw, 2.8rem);
    line-height: 1.16;
    word-break: keep-all;
  }

  p {
    margin: 0;
    max-width: 820px;
    color: var(--founding-muted);
    font-size: 1rem;
    line-height: 1.78;
    word-break: keep-all;
  }
`;

const SignalGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const SignalCard = styled.article`
  min-width: 0;
  display: grid;
  gap: 10px;
  padding: 18px;
  border: 1px solid rgba(226, 232, 240, 0.08);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.58);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.12),
    inset -8px -10px 20px rgba(2, 6, 23, 0.56);

  svg {
    color: #a5b4fc;
  }

  strong {
    color: var(--founding-text);
    font-size: 1.08rem;
  }

  p {
    margin: 0;
    color: var(--founding-muted);
    font-size: 0.96rem;
    line-height: 1.66;
    word-break: keep-all;
  }
`;

const FlowPanel = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(165, 180, 252, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(99, 102, 241, 0.12), transparent 56%),
    rgba(15, 23, 42, 0.58);
  color: #c7d2fe;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 234, 212, 0.48) transparent;

  &::-webkit-scrollbar {
    height: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(94, 234, 212, 0.38);
    border-radius: 999px;
  }

  > svg:last-child {
    margin-left: auto;
    color: var(--founding-emerald);
    flex: 0 0 auto;
  }
`;

const FlowStep = styled.div`
  flex: 0 0 auto;
  min-width: 150px;
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid rgba(226, 232, 240, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.034);

  span {
    color: var(--founding-faint);
    font-size: 0.74rem;
    font-weight: 900;
  }

  strong {
    color: var(--founding-text);
    font-size: 0.98rem;
  }

  p {
    margin: 0;
    color: var(--founding-muted);
    font-size: 0.82rem;
    line-height: 1.48;
    word-break: keep-all;
  }
`;

const FoundingQuote = styled.figure`
  margin: 0;
  display: grid;
  gap: 10px;
  padding: 20px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(59, 130, 246, 0.08)),
    rgba(15, 23, 42, 0.68);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.14),
    0 18px 48px rgba(0, 0, 0, 0.22);

  p {
    margin: 0;
    color: var(--founding-text);
    font-size: clamp(1.05rem, 2vw, 1.42rem);
    line-height: 1.62;
    font-weight: 850;
    word-break: keep-all;
  }

  cite {
    color: #fde68a;
    font-size: 0.82rem;
    font-style: normal;
    font-weight: 950;
  }
`;
