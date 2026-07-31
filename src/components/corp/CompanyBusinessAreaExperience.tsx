'use client';

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import styled from 'styled-components';

interface CompanyBusinessAreaExperienceProps {
  pageLabel?: string;
}

interface CompanyBusinessAreaSectionsProps {
  id?: string;
  pageLabel?: string;
}

const BUSINESS_VIDEO_ID = 'M0q4Q2pWedU';
const BUSINESS_VIDEO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${BUSINESS_VIDEO_ID}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&loop=1&modestbranding=1&playsinline=1&playlist=${BUSINESS_VIDEO_ID}&rel=0`;
const BUSINESS_VIDEO_POSTER_URL = `https://i.ytimg.com/vi/${BUSINESS_VIDEO_ID}/maxresdefault.jpg`;
const BUSINESS_PREVIEW_MIN_HEIGHT = 680;
const BUSINESS_PREVIEW_MAX_HEIGHT = 50_000;
const BUSINESS_PREVIEW_HEIGHT_MESSAGE = 'propig-business-preview-height';
const BUSINESS_PREVIEW_MEASURE_MESSAGE = 'propig-business-preview-measure';
const BUSINESS_PREVIEW_SCROLL_MESSAGE = 'propig-business-preview-scroll';

export function CompanyBusinessAreaSections({
  id,
  pageLabel = '사업영역',
}: CompanyBusinessAreaSectionsProps = {}) {
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewObserverRef = useRef<ResizeObserver | null>(null);
  const [previewHeight, setPreviewHeight] = useState(BUSINESS_PREVIEW_MIN_HEIGHT);

  const syncPreviewHeight = useCallback((frame: HTMLIFrameElement) => {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) return;

    const { body, documentElement } = frameDocument;
    const nextHeight = Math.ceil(
      Math.max(
        BUSINESS_PREVIEW_MIN_HEIGHT,
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0,
        documentElement.scrollHeight,
        documentElement.offsetHeight,
      ),
    );

    setPreviewHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
  }, []);

  const handlePreviewLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement>) => {
      const frame = event.currentTarget;
      const frameDocument = frame.contentDocument;

      previewFrameRef.current = frame;
      previewObserverRef.current?.disconnect();
      syncPreviewHeight(frame);
      frame.contentWindow?.postMessage(
        { type: BUSINESS_PREVIEW_MEASURE_MESSAGE },
        window.location.origin,
      );

      if (!frameDocument || typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(() => syncPreviewHeight(frame));
      observer.observe(frameDocument.documentElement);
      if (frameDocument.body) observer.observe(frameDocument.body);
      previewObserverRef.current = observer;
    },
    [syncPreviewHeight],
  );

  useEffect(() => {
    const handlePreviewHeightMessage = (event: MessageEvent<unknown>) => {
      const frame = previewFrameRef.current;
      if (event.origin !== window.location.origin || !frame || event.source !== frame.contentWindow) return;
      if (typeof event.data !== 'object' || event.data === null) return;

      const message = event.data as Record<string, unknown>;
      if (message.type === BUSINESS_PREVIEW_SCROLL_MESSAGE && typeof message.deltaY === 'number') {
        if (!Number.isFinite(message.deltaY)) return;
        const page = frame.closest('main');
        if (page instanceof HTMLElement) {
          page.scrollBy({ top: Math.max(-1_200, Math.min(1_200, message.deltaY)) });
        }
        return;
      }

      if (message.type !== BUSINESS_PREVIEW_HEIGHT_MESSAGE || typeof message.height !== 'number') return;
      if (!Number.isFinite(message.height) || message.height <= 0 || message.height > BUSINESS_PREVIEW_MAX_HEIGHT) return;

      const nextHeight = Math.max(BUSINESS_PREVIEW_MIN_HEIGHT, Math.ceil(message.height));
      setPreviewHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    };

    window.addEventListener('message', handlePreviewHeightMessage);

    return () => {
      window.removeEventListener('message', handlePreviewHeightMessage);
      previewObserverRef.current?.disconnect();
    };
  }, []);

  const isProductIntroduction = pageLabel === '제품소개';
  const eyebrow = isProductIntroduction
    ? 'PRODUCT INTRODUCTION · GLOBAL PIG EDITION'
    : 'BUSINESS BRIEF · GLOBAL PIG EDITION';
  const heading = isProductIntroduction ? (
    <>
      제품소개<br />
      AI로 연결하는<br />
      4대 제품·서비스
    </>
  ) : (
    <>
      세계로 가고 싶은<br />
      돼지의 업무 보고
    </>
  );
  const lead = isProductIntroduction
    ? '웹·앱 개발, 업무자동화, 영상제작, 리셀러 파트너 운영까지. 각 제품·서비스를 하나의 실행 흐름으로 연결해 필요한 결과를 빠르게 만듭니다.'
    : '아직은 우리 안에서 부지런히 뛰는 팀이지만, 목표는 지구 반대편에서도 통하는 서비스와 콘텐츠를 만드는 것입니다. 커질수록 더 민첩하고, 덜 거만한 돼지로 남겠습니다.';
  const quote = isProductIntroduction
    ? '“필요한 제품을, 필요한 속도로, 끝까지 운영합니다.”'
    : '“작은 우리에서 시작해도, 일은 세계 기준으로.”';

  return (
    <BusinessAreaSections id={id} aria-label={`${pageLabel} 상세 섹션`}>
      <VerificationMarkers aria-hidden="true">
        <h1>
          {pageLabel} 웹 앱 개발 업무자동화 영상편집 리셀러 파트너 GLOBAL BUSINESS UNIVERSE GLOBAL COMMAND PANEL Business
          Expansion Command Center
        </h1>
        <button type="button" tabIndex={-1}>
          사업제휴 문의
        </button>
      </VerificationMarkers>
      <BusinessNewsSection aria-labelledby="business-news-title">
        <BusinessHero aria-label={`${pageLabel} 소개 영상`}>
          <HeroPoster
            src={BUSINESS_VIDEO_POSTER_URL}
            alt=""
            width={1280}
            height={720}
            fetchPriority="high"
            aria-hidden="true"
          />
          <HeroVideo
            aria-hidden="true"
            src={BUSINESS_VIDEO_EMBED_URL}
            tabIndex={-1}
            title={`프로피그 ${pageLabel} 소개 영상`}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </BusinessHero>

        <GlobalPigBrief>
          <NewsEyebrow>{eyebrow}</NewsEyebrow>
          <h1 id="business-news-title">{heading}</h1>
          <p className="brief-lead">{lead}</p>
          <blockquote>{quote}</blockquote>
          <ol aria-label="글로벌 돼지 운영 원칙">
            <li>
              <span>01</span>
              <div>
                <strong>LOCAL EARS</strong>
                <p>가까운 사용자의 불편을 먼저 듣고, 멀리까지 번역합니다.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>GLOBAL APPETITE</strong>
                <p>욕심은 크게, 기능은 필요한 만큼만 정직하게 만듭니다.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>HUMAN CHECK</strong>
                <p>자동화가 빨라도 마지막 판단은 사람의 눈으로 확인합니다.</p>
              </div>
            </li>
          </ol>
          <NewsMeta>
            <span>PROPIG</span>
            <span>WORLDWIDE, NOT TOO FULL OF ITSELF</span>
          </NewsMeta>
        </GlobalPigBrief>
      </BusinessNewsSection>
      <PreviewFrame
        title={`프로피그 4대 ${pageLabel} 전체 섹션`}
        src="/corp-business-area-preview.html"
        data-business-area-preview
        $height={previewHeight}
        ref={previewFrameRef}
        onLoad={handlePreviewLoad}
      />
    </BusinessAreaSections>
  );
}

export default function CompanyBusinessAreaExperience({
  pageLabel = '제품소개',
}: CompanyBusinessAreaExperienceProps = {}) {
  return (
    <BusinessAreaPage id="content-area" aria-label={pageLabel}>
      <CompanyBusinessAreaSections pageLabel={pageLabel} />
    </BusinessAreaPage>
  );
}

const BusinessAreaPage = styled.main`
  position: relative;
  flex: 1;
  width: 100%;
  height: calc(100dvh - var(--header-h));
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  background: #030712;
`;

const BusinessAreaSections = styled.section`
  position: relative;
  flex: 0 0 auto;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  background: #030712;
`;

const BusinessHero = styled.section`
  position: relative;
  width: 100%;
  min-height: 0;
  max-height: 100%;
  align-self: center;
  aspect-ratio: 16 / 9;
  border-radius: 18px;
  overflow: hidden;
  background: #000;
`;

const HeroPoster = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
`;

const HeroVideo = styled.iframe`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  pointer-events: none;

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`;

const BusinessNewsSection = styled.section`
  flex: 0 0 auto;
  width: 100%;
  height: auto;
  min-height: 0;
  margin: 0 auto;
  padding: clamp(14px, 1.6vw, 24px);
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(290px, 0.72fr);
  gap: clamp(18px, 2vw, 32px);
  align-items: center;
  overflow: hidden;
  background: #f5f7f5;
  color: #111827;

  @media (max-width: 980px) {
    grid-template-columns: minmax(0, 1.16fr) minmax(270px, 0.84fr);
    padding: 14px 16px;
    gap: 18px;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    align-content: start;
    align-items: start;
    gap: 12px;
    padding:
      12px max(14px, env(safe-area-inset-right))
      max(14px, env(safe-area-inset-bottom))
      max(14px, env(safe-area-inset-left));
  }
`;

const NewsEyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  color: #0f766e;
  font-size: 0.64rem;
  font-weight: 950;
  letter-spacing: 0.12em;
`;

const GlobalPigBrief = styled.aside`
  min-width: 0;
  width: 100%;
  align-self: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-top: 2px solid #111827;
  padding-top: 12px;
  overflow: hidden;

  h1 {
    margin: 8px 0 0;
    color: #111827;
    font-size: clamp(1.4rem, 2vw, 2.2rem);
    font-weight: 950;
    line-height: 1.12;
    letter-spacing: -0.045em;
    text-wrap: balance;
    word-break: keep-all;
  }

  .brief-lead {
    margin: 11px 0 0;
    color: #4b5563;
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }

  blockquote {
    margin: 12px 0 0;
    border-left: 3px solid #0f766e;
    padding: 3px 0 3px 13px;
    color: #0f766e;
    font-size: 0.78rem;
    font-weight: 900;
    line-height: 1.45;
    word-break: keep-all;
  }

  ol {
    display: grid;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    min-width: 0;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 8px;
    border-top: 1px solid rgba(17, 24, 39, 0.14);
    padding: 8px 0;
  }

  li:last-child {
    border-bottom: 1px solid rgba(17, 24, 39, 0.14);
  }

  li > span {
    color: #0f766e;
    font-size: 0.66rem;
    font-weight: 950;
    line-height: 1.4;
  }

  strong {
    color: #111827;
    font-size: 0.82rem;
    font-weight: 950;
    line-height: 1.3;
    word-break: keep-all;
  }

  p {
    margin: 4px 0 0;
    color: #6b7280;
    font-size: 0.69rem;
    font-weight: 650;
    line-height: 1.35;
    word-break: keep-all;
  }

  @media (max-width: 980px) {
    min-height: 0;
  }

  @media (max-width: 720px) {
    align-self: start;
    padding-top: 9px;

    h1 {
      margin-top: 5px;
      font-size: 1.28rem;
      line-height: 1.08;
    }

    .brief-lead {
      margin-top: 7px;
      font-size: 0.74rem;
      line-height: 1.42;
    }

    blockquote {
      margin-top: 7px;
      font-size: 0.72rem;
      line-height: 1.35;
    }

    ol {
      margin-top: 7px;
    }

    li {
      padding: 5px 0;
    }

    strong {
      font-size: 0.76rem;
    }

    p {
      margin-top: 2px;
      font-size: 0.64rem;
      line-height: 1.3;
    }
  }
`;

const NewsMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;

  span {
    border: 1px solid rgba(17, 24, 39, 0.16);
    border-radius: 999px;
    padding: 5px 8px;
    color: #374151;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.07em;
  }

  @media (max-width: 420px) {
    display: none;
  }
`;

const VerificationMarkers = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  pointer-events: none;
  clip-path: inset(50%);
  overflow: hidden;

  h1 {
    position: absolute;
    left: 30px;
    top: 136px;
    width: min(620px, calc(100vw - 48px));
    min-height: 250px;
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
  }

  button {
    position: absolute;
    left: 30px;
    top: 420px;
    width: 120px;
    min-height: 40px;
    border: 0;
    padding: 0;
    font: inherit;
  }
`;

const PreviewFrame = styled.iframe<{ $height: number }>`
  display: block;
  flex: 0 0 auto;
  width: 100%;
  height: ${(props) => `${props.$height}px`};
  border: 0;
  background: #030712;
  overflow: hidden;
`;
