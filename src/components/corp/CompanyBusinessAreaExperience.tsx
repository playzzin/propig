'use client';

import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BadgeDollarSign,
  Building2,
  Cable,
  CheckCircle2,
  Clapperboard,
  Footprints,
  Globe2,
  Handshake,
  MapPinned,
  Navigation,
  Radar,
  TimerReset,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import { CorpEditableSection, type CorpSectionEditorState } from '@/components/corp/CorpSectionEditOverlay';
import { getYouTubeEmbedUrl, YOUTUBE_EMBED_ALLOW } from '@/components/corp/corpMediaEmbed';
import { CORP_PAGE_SEED_BY_ID } from '@/constants/corpPageSeeds';
import type { CorpPage, CorpPageBlock } from '@/schemas/corpPageSchema';

type MediaShowcaseBlock = Extract<CorpPageBlock, { type: 'media-showcase' }>;
type BusinessMediaItem = MediaShowcaseBlock['data']['media'][number];

type BusinessArea = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  detailTitle: string;
  details: string[];
  image: string;
  imageAlt: string;
  icon: LucideIcon;
  accent: string;
  meta: string;
  statLabel: string;
  statValue: string;
};

type NationalSignal = {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  accent: string;
};

export type BusinessAreaExperienceConfig = {
  heroKicker: string;
  heroTitle: string;
  heroBody: string;
  heroActionLabel: string;
  heroActionHref: string;
  heroImage: string;
  areasTitle: string;
  businessAreas: BusinessArea[];
  mediaTitle: string;
  mediaBody: string;
  mediaItems: BusinessMediaItem[];
  nationalTitle: string;
  nationalBody: string;
  nationalSignals: NationalSignal[];
  nationalMapSrc: string;
  nationalMapTitle: string;
  globalKicker: string;
  globalTitle: string;
  globalBadge: string;
  globalMapSrc: string;
  globalMapTitle: string;
  globalMapMinHeight: number;
  realityItems: Array<{
    title: string;
    body: string;
    icon: LucideIcon;
  }>;
};

interface CompanyBusinessAreaExperienceProps {
  config?: BusinessAreaExperienceConfig;
  editor?: CorpSectionEditorState;
}

const businessAreas: BusinessArea[] = [
  {
    id: 'legwork',
    title: '레그워크',
    eyebrow: 'Legwork',
    description: '현장과 고객, 파트너 사이를 먼저 움직이며 사업 기회가 실제 실행으로 이어지도록 정리합니다.',
    detailTitle: '발로 확인한 정보가 가장 빠른 실행 기준이 됩니다.',
    details: [
      '현장 요구와 파트너 상황을 빠르게 확인해 실행 우선순위를 정합니다.',
      '말로만 남은 요청을 담당자, 일정, 다음 액션으로 분리합니다.',
      '지역 접점과 고객 반응을 모아 다음 사업 판단에 쓸 수 있게 정리합니다.',
    ],
    image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=82',
    imageAlt: '현장 미팅에서 팀이 사업 실행 방향을 논의하는 사진',
    icon: Footprints,
    accent: '#5eead4',
    meta: '현장 확인 / 관계 조율 / 실행 리포트',
    statLabel: 'Response',
    statValue: '1st move',
  },
  {
    id: 'engineering',
    title: '엔지니어링',
    eyebrow: 'Engineering',
    description: '아이디어를 실제 제품, 자동화, 데이터 흐름으로 바꾸는 기술 설계와 구현 영역입니다.',
    detailTitle: '운영을 버티는 구조는 설계와 자동화에서 시작됩니다.',
    details: [
      '반복 업무를 줄이는 내부 도구와 자동화 흐름을 설계합니다.',
      '데이터 수집, 분석, 리포트 흐름을 서비스 구조 안에 연결합니다.',
      '새 기능이 현장에서 유지될 수 있도록 배포와 운영 기준을 함께 만듭니다.',
    ],
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=82',
    imageAlt: '엔지니어링 장비와 회로가 보이는 기술 개발 사진',
    icon: Wrench,
    accent: '#60a5fa',
    meta: '서비스 설계 / 자동화 구축 / 데이터 연결',
    statLabel: 'Build',
    statValue: 'System',
  },
  {
    id: 'media',
    title: '미디어',
    eyebrow: 'Media',
    description: '브랜드의 메시지, 제품 장면, 프로젝트 결과를 콘텐츠로 만들고 전달 채널에 맞게 편집합니다.',
    detailTitle: '보여지는 장면까지 설계해야 사업 메시지가 남습니다.',
    details: [
      '소개 영상, 이미지, 숏폼, 발표 자료의 핵심 메시지를 구성합니다.',
      '사업 결과물을 고객이 이해하기 쉬운 장면과 문장으로 변환합니다.',
      '웹, SNS, 제안서 등 채널별로 콘텐츠 톤과 포맷을 조정합니다.',
    ],
    image: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=82',
    imageAlt: '카메라와 영상 제작 장비가 놓인 미디어 제작 사진',
    icon: Clapperboard,
    accent: '#f472b6',
    meta: '영상 기획 / 콘텐츠 편집 / 채널 운영',
    statLabel: 'Content',
    statValue: 'On air',
  },
  {
    id: 'agency',
    title: '에이전시',
    eyebrow: 'Agency',
    description: '기획, 제안, 실행, 운영을 묶어 고객과 파트너가 바로 움직일 수 있는 프로젝트 형태로 제공합니다.',
    detailTitle: '좋은 제안은 실행 가능한 역할표와 일정표를 함께 갖습니다.',
    details: [
      '브랜드, 캠페인, 서비스 프로젝트의 방향성과 실행 범위를 정리합니다.',
      '외부 파트너와 내부 실행 조직 사이의 역할과 책임을 조율합니다.',
      '기획서에서 끝나지 않도록 결과물, 일정, 운영 방식까지 관리합니다.',
    ],
    image: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=82',
    imageAlt: '에이전시 회의에서 프로젝트를 논의하는 사진',
    icon: Handshake,
    accent: '#f5c766',
    meta: '프로젝트 기획 / 제안 운영 / 파트너 조율',
    statLabel: 'Project',
    statValue: 'Ready',
  },
];

const nationalSignals: NationalSignal[] = [
  {
    label: 'Coverage',
    value: '17',
    caption: '시·도별 운영 거점',
    icon: MapPinned,
    accent: '#f5c766',
  },
  {
    label: 'Operating cells',
    value: '156',
    caption: '전국 고객 접점',
    icon: Building2,
    accent: '#60a5fa',
  },
  {
    label: 'Response route',
    value: 'Ansan',
    caption: '출발점 기준 연결 흐름',
    icon: Navigation,
    accent: '#2dd4bf',
  },
];

const iconMap: Record<string, LucideIcon> = {
  BadgeDollarSign,
  Building2,
  Cable,
  Clapperboard,
  Footprints,
  Globe2,
  Handshake,
  MapPinned,
  Navigation,
  Radar,
  TimerReset,
  Wrench,
};

function findEnabledBlock(page: CorpPage | null | undefined, blockId: string) {
  return page?.blocks.find((block) => block.id === blockId && block.enabled !== false);
}

function findEnabledBlockWithSeed(page: CorpPage | null | undefined, seedPage: CorpPage | undefined, blockId: string) {
  const pageBlock = page?.blocks.find((block) => block.id === blockId);
  if (pageBlock) return pageBlock.enabled === false ? undefined : pageBlock;
  return findEnabledBlock(seedPage, blockId);
}

function getIconByName(name: string | null | undefined, fallback: LucideIcon) {
  return name ? iconMap[name] ?? fallback : fallback;
}

function splitMeta(value: string | null | undefined) {
  const [eyebrow, detail] = (value ?? '').split('·').map((item) => item.trim());
  return {
    eyebrow,
    detail,
  };
}

export function buildBusinessAreaConfig(page?: CorpPage | null): BusinessAreaExperienceConfig {
  const seedPage = CORP_PAGE_SEED_BY_ID['business-area'];
  const heroBlock = findEnabledBlockWithSeed(page, seedPage, 'business-hero');
  const areasBlock = findEnabledBlockWithSeed(page, seedPage, 'business-areas');
  const mediaBlock = findEnabledBlockWithSeed(page, seedPage, 'business-media');
  const metricsBlock = findEnabledBlockWithSeed(page, seedPage, 'business-metrics');
  const ctaBlock = findEnabledBlockWithSeed(page, seedPage, 'business-cta');
  const features = areasBlock?.type === 'feature-grid' ? areasBlock.data.features : [];
  const media = mediaBlock?.type === 'media-showcase' ? mediaBlock.data.media : [];
  const imageMedia = media.filter((item) => item.type === 'image');
  const embedMedia = media.filter((item) => item.type === 'embed');

  return {
    heroKicker: heroBlock?.type === 'hero' ? heroBlock.data.kicker : 'BUSINESS AREA LINEUP',
    heroTitle: heroBlock?.type === 'hero' ? heroBlock.data.headline : '사업영역',
    heroBody:
      heroBlock?.type === 'hero'
        ? heroBlock.data.body
        : '레그워크, 엔지니어링, 미디어, 에이전시를 중심으로 실제 실행 가능한 사업 영역을 소개합니다.',
    heroActionLabel: heroBlock?.type === 'hero' ? heroBlock.data.primaryLabel || '문의하기' : '문의하기',
    heroActionHref: heroBlock?.type === 'hero' ? heroBlock.data.primaryHref || '/corp/partnership/business' : '/corp/partnership/business',
    heroImage:
      heroBlock?.type === 'hero'
        ? heroBlock.data.mediaUrl || businessAreas[0].image
        : businessAreas[0].image,
    areasTitle: areasBlock?.type === 'feature-grid' ? areasBlock.data.title : '현재 적용 사업 카드',
    businessAreas: businessAreas.map((area, index) => {
      const feature = features[index];
      const image = imageMedia[index];
      const meta = splitMeta(feature?.meta);

      return {
        ...area,
        title: feature?.title?.trim() || area.title,
        eyebrow: meta.eyebrow || area.eyebrow,
        description: feature?.body?.trim() || area.description,
        detailTitle: feature?.subtitle?.trim() || feature?.body?.trim() || area.detailTitle,
        details:
          feature?.details && feature.details.length > 0
            ? feature.details
            : meta.detail
              ? meta.detail.split('/').map((item) => item.trim()).filter(Boolean)
              : area.details,
        image: feature?.mediaUrl?.trim() || image?.url || area.image,
        imageAlt: feature?.mediaAlt?.trim() || image?.alt || area.imageAlt,
        icon: getIconByName(feature?.icon, area.icon),
        accent: feature?.accent?.trim() || area.accent,
        meta: meta.detail || area.meta,
        statLabel: feature?.statLabel?.trim() || area.statLabel,
        statValue: feature?.statValue?.trim() || area.statValue,
      };
    }),
    mediaTitle: mediaBlock?.type === 'media-showcase' ? mediaBlock.data.title : '현재 적용 이미지와 지도 iframe',
    mediaBody:
      mediaBlock?.type === 'media-showcase'
        ? mediaBlock.data.body
        : '사업영역 카드 이미지, 전국 지도, 글로벌 네트워크 iframe 주소입니다.',
    mediaItems: media,
    nationalTitle:
      metricsBlock?.type === 'metric-grid'
        ? metricsBlock.data.title
        : '전국 네트워크가 먼저 정리되어야 글로벌 연결도 덜 흔들립니다.',
    nationalBody:
      mediaBlock?.type === 'media-showcase'
        ? mediaBlock.data.body
        : '첨부된 한국 지도 대시보드를 사업영역 안에 배치했습니다. 지역을 선택하면 권역별 운영 정보가 표시되고, 국내 거점에서 전국으로 뻗는 연결 흐름을 바로 확인할 수 있습니다.',
    nationalSignals:
      metricsBlock?.type === 'metric-grid' && metricsBlock.data.metrics.length > 0
        ? metricsBlock.data.metrics.map((metric, index) => ({
            label: metric.label,
            value: metric.value,
            caption: metric.caption,
            icon: getIconByName(metric.icon, nationalSignals[index]?.icon ?? MapPinned),
            accent: nationalSignals[index]?.accent ?? '#5eead4',
          }))
        : nationalSignals,
    nationalMapSrc: embedMedia[0]?.url || '/corp/company-korea-map.html',
    nationalMapTitle: embedMedia[0]?.alt || 'PRO PIG 전국 네트워크 지도',
    globalKicker: 'GLOBAL NETWORK, BUT PRACTICAL',
    globalTitle: embedMedia[1]?.caption || '지도 위 핀 네 개로 시작하지만, 사업은 답장 속도에서 갈립니다.',
    globalBadge: ctaBlock?.type === 'cta' ? ctaBlock.data.label : 'exaggeration filtered',
    globalMapSrc: embedMedia[1]?.url || '/corp/company-world-map.html?view=network',
    globalMapTitle: embedMedia[1]?.alt || 'PRO PIG 글로벌 네트워크 사업영역 지도',
    globalMapMinHeight: embedMedia[1]?.height ?? 620,
    realityItems:
      ctaBlock?.type === 'cta'
        ? [
            { title: ctaBlock.data.title, body: ctaBlock.data.body, icon: TimerReset },
            { title: ctaBlock.data.label, body: ctaBlock.data.href, icon: BadgeDollarSign },
            { title: '운영력', body: '파트너가 많아 보이는 것보다 일이 덜 꼬이는 구조를 만듭니다.', icon: Cable },
          ]
        : [
            { title: '속도', body: '글로벌 회의보다 빠른 1차 응답을 우선합니다.', icon: TimerReset },
            { title: '수익성', body: '보여주기용 제휴보다 계산이 맞는 연결만 남깁니다.', icon: BadgeDollarSign },
            { title: '운영력', body: '파트너가 많아 보이는 것보다 일이 덜 꼬이는 구조를 만듭니다.', icon: Cable },
          ],
  };
}

export default function CompanyBusinessAreaExperience({ config, editor }: CompanyBusinessAreaExperienceProps = {}) {
  const activeConfig = config ?? buildBusinessAreaConfig();
  const [activeAreaId, setActiveAreaId] = useState(activeConfig.businessAreas[0].id);
  const [networkFrameHeight, setNetworkFrameHeight] = useState(620);
  const activeArea = activeConfig.businessAreas.find((area) => area.id === activeAreaId) ?? activeConfig.businessAreas[0];

  useEffect(() => {
    function handleAtlasMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      const data = event.data as { source?: string; action?: string; height?: number } | null;

      if (data?.source === 'propig-partner-page' && data.action === 'resize' && data.height) {
        setNetworkFrameHeight(Math.max(activeConfig.globalMapMinHeight, Math.ceil(data.height)));
        return;
      }

      if (data?.source !== 'propig-atlas' || data.action !== 'open-world') return;

      document.getElementById('global-network-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }

    window.addEventListener('message', handleAtlasMessage);

    return () => {
      window.removeEventListener('message', handleAtlasMessage);
    };
  }, [activeConfig.globalMapMinHeight]);

  return (
    <Page id="content-area" aria-labelledby="area-title">
      <AreaBand aria-labelledby="area-title">
        <BusinessShowcase>
          <CorpEditableSection blockId="business-hero" label="사업영역 첫 화면 수정" editor={editor}>
          <BusinessHeroPanel $image={activeConfig.heroImage}>
            <BusinessHeroCopy>
              <Kicker>
                <MapPinned size={17} strokeWidth={2.5} aria-hidden="true" />
                {activeConfig.heroKicker}
              </Kicker>
              <h1 id="area-title">{activeConfig.heroTitle}</h1>
              <p>{activeConfig.heroBody}</p>
              {activeConfig.heroActionLabel && activeConfig.heroActionHref ? (
                <HeroActionLink href={activeConfig.heroActionHref}>
                  <ArrowUpRight size={17} strokeWidth={2.5} aria-hidden="true" />
                  {activeConfig.heroActionLabel}
                </HeroActionLink>
              ) : null}
            </BusinessHeroCopy>
            <BusinessHeroStatus>
              <span>Active Area</span>
              <ActiveAreaPill $accent={activeArea.accent}>{activeArea.title}</ActiveAreaPill>
              <small>{activeArea.meta}</small>
            </BusinessHeroStatus>
          </BusinessHeroPanel>
          </CorpEditableSection>

          <CorpEditableSection blockId="business-areas" label="사업 카드 수정" editor={editor}>
          <BusinessSectionHeader>
            <span>Business Cards</span>
            <h2>{activeConfig.areasTitle}</h2>
          </BusinessSectionHeader>
          <BusinessGrid aria-label="사업영역 선택 카드">
            {activeConfig.businessAreas.map((area, index) => {
              const Icon = area.icon;
              const isActive = activeArea.id === area.id;

              return (
                <BusinessCardButton
                  key={area.id}
                  type="button"
                  $accent={area.accent}
                  $active={isActive}
                  aria-pressed={isActive}
                  aria-controls="business-area-detail"
                  onClick={() => setActiveAreaId(area.id)}
                >
                  <CardIndex>{String(index + 1).padStart(2, '0')}</CardIndex>
                  <CardIcon>
                    <Icon size={22} strokeWidth={2.35} aria-hidden="true" />
                  </CardIcon>
                  <span>{area.eyebrow}</span>
                  <strong>{area.title}</strong>
                  <p>{area.description}</p>
                  <small>{area.meta}</small>
                </BusinessCardButton>
              );
            })}
          </BusinessGrid>

          <BusinessDetailPanel id="business-area-detail" $accent={activeArea.accent}>
            <DetailPhoto $image={activeArea.image} role="img" aria-label={activeArea.imageAlt}>
              <PhotoOverlay>
                <span>{activeArea.eyebrow}</span>
                <strong>{activeArea.title}</strong>
              </PhotoOverlay>
            </DetailPhoto>
            <DetailCopy>
              <DetailStat $accent={activeArea.accent}>
                <span>{activeArea.statLabel}</span>
                <strong>{activeArea.statValue}</strong>
              </DetailStat>
              <h3>{activeArea.detailTitle}</h3>
              <p>{activeArea.description}</p>
              <DetailList>
                {activeArea.details.map((detail) => (
                  <li key={detail}>
                    <CheckCircle2 size={17} strokeWidth={2.5} aria-hidden="true" />
                    <span>{detail}</span>
                  </li>
                ))}
              </DetailList>
              <DetailMeta>
                <ArrowUpRight size={18} strokeWidth={2.5} aria-hidden="true" />
                {activeArea.meta}
              </DetailMeta>
            </DetailCopy>
          </BusinessDetailPanel>
          </CorpEditableSection>
        </BusinessShowcase>
      </AreaBand>

      <CorpEditableSection blockId="business-metrics" label="전국 지표 수정" editor={editor}>
      <NationalNetworkBand aria-labelledby="national-network-title">
        <NationalNetworkHeader>
          <div>
            <Kicker>
              <MapPinned size={17} strokeWidth={2.5} aria-hidden="true" />
              NATIONAL NETWORK
            </Kicker>
            <h2 id="national-network-title">{activeConfig.nationalTitle}</h2>
            <p>{activeConfig.nationalBody}</p>
          </div>
          <NationalSignalRail aria-label="전국 네트워크 요약 지표">
            {activeConfig.nationalSignals.map((signal) => {
              const Icon = signal.icon;

              return (
                <NationalSignalItem key={signal.label} $accent={signal.accent}>
                  <Icon size={18} strokeWidth={2.5} aria-hidden="true" />
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <small>{signal.caption}</small>
                </NationalSignalItem>
              );
            })}
          </NationalSignalRail>
        </NationalNetworkHeader>

        <NationalMapPanel>
          <MapFrame
            src={activeConfig.nationalMapSrc}
            title={activeConfig.nationalMapTitle}
            loading="lazy"
          />
        </NationalMapPanel>
      </NationalNetworkBand>
      </CorpEditableSection>

      <CorpEditableSection blockId="business-media" label="지도/이미지 수정" editor={editor}>
      <NetworkBand id="global-network-section" aria-labelledby="network-title">
        <NetworkHeader>
          <div>
            <Kicker>
              <Globe2 size={17} strokeWidth={2.5} aria-hidden="true" />
              {activeConfig.globalKicker}
            </Kicker>
            <h2 id="network-title">{activeConfig.globalTitle}</h2>
          </div>
          <NetworkBadge>
            <Radar size={18} strokeWidth={2.5} aria-hidden="true" />
            {activeConfig.globalBadge}
          </NetworkBadge>
        </NetworkHeader>

        <NetworkLayout>
          <MapPanel>
            <MapFrame
              src={activeConfig.globalMapSrc}
              title={activeConfig.globalMapTitle}
              loading="lazy"
              style={{ height: `${networkFrameHeight}px`, minHeight: `${networkFrameHeight}px` }}
            />
          </MapPanel>
        </NetworkLayout>
        {activeConfig.mediaItems.length > 0 ? (
          <BusinessMediaInventory>
            <BusinessMediaHeader>
              <span>Media Inventory</span>
              <strong>{activeConfig.mediaTitle}</strong>
              <p>{activeConfig.mediaBody}</p>
            </BusinessMediaHeader>
            <BusinessMediaGrid>
              {activeConfig.mediaItems.map((item) => (
                <BusinessMediaCard key={`${item.type}-${item.url}`}>
                  <BusinessMediaPreview $image={item.type === 'image' ? item.url : ''}>
                    {renderBusinessMediaPreview(item)}
                  </BusinessMediaPreview>
                  <div>
                    <span>{item.type}</span>
                    <strong>{item.caption || item.alt}</strong>
                    <p>{item.description || item.alt}</p>
                    <small>{item.url}</small>
                  </div>
                </BusinessMediaCard>
              ))}
            </BusinessMediaGrid>
          </BusinessMediaInventory>
        ) : null}
      </NetworkBand>
      </CorpEditableSection>

      <CorpEditableSection blockId="business-cta" label="운영 기준 수정" editor={editor}>
      <RealityBand aria-label="사업영역 운영 기준">
        {activeConfig.realityItems.map((item) => {
          const Icon = item.icon;

          return (
            <RealityItem key={`${item.title}-${item.body}`}>
              <Icon size={22} strokeWidth={2.4} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </div>
            </RealityItem>
          );
        })}
      </RealityBand>
      </CorpEditableSection>
    </Page>
  );
}

function getBusinessMediaTitle(item: BusinessMediaItem) {
  return item.alt || item.caption || '사업영역 미디어';
}

function renderBusinessMediaPreview(item: BusinessMediaItem) {
  const youtubeEmbedUrl = getYouTubeEmbedUrl(item.url);
  const title = getBusinessMediaTitle(item);

  if (youtubeEmbedUrl) {
    return (
      <iframe
        src={youtubeEmbedUrl}
        title={title}
        loading="lazy"
        allow={YOUTUBE_EMBED_ALLOW}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  if (item.type === 'video') {
    return <video src={item.url} muted playsInline preload="metadata" />;
  }

  if (item.type === 'embed') {
    return <iframe src={item.url} title={title} loading="lazy" />;
  }

  return null;
}

const Page = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.028) 1px, transparent 1px),
    linear-gradient(135deg, rgba(20, 184, 166, 0.16), transparent 360px),
    linear-gradient(315deg, rgba(245, 158, 11, 0.12), transparent 360px),
    #07110f;
  background-size: 48px 48px, 48px 48px, auto, auto, auto;
  color: #ecfff9;

  @media (max-width: 768px) {
    padding: 14px;
  }
`;

const Kicker = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #5eead4;
  font-size: 0.78rem;
  font-weight: 950;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const NetworkBand = styled.section`
  max-width: 1280px;
  margin: 0 auto 16px;
  border: 1px solid rgba(213, 255, 242, 0.16);
  border-radius: 8px;
  background: rgba(4, 13, 12, 0.92);
  overflow: hidden;
`;

const NetworkHeader = styled.div`
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 24px;
  border-bottom: 1px solid rgba(213, 255, 242, 0.14);

  h2 {
    margin: 10px 0 0;
    max-width: 860px;
    color: #f2fff9;
    font-size: 1.42rem;
    line-height: 1.28;
    font-weight: 900;
    letter-spacing: 0;
  }

  @media (max-width: 768px) {
    flex-direction: column;
    padding: 18px;
  }
`;

const NetworkBadge = styled.div`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(245, 199, 102, 0.36);
  border-radius: 999px;
  color: #fff3c4;
  background: rgba(245, 158, 11, 0.1);
  font-size: 0.78rem;
  font-weight: 900;
  text-transform: uppercase;
`;

const NationalNetworkBand = styled.section`
  max-width: 1280px;
  margin: 0 auto 16px;
  border: 1px solid rgba(213, 255, 242, 0.16);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(96, 165, 250, 0.08), transparent 42%),
    rgba(4, 13, 12, 0.93);
  overflow: hidden;
`;

const NationalNetworkHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
  gap: 18px;
  align-items: stretch;
  padding: 22px 24px;
  border-bottom: 1px solid rgba(213, 255, 242, 0.14);

  h2 {
    margin: 10px 0 0;
    max-width: 850px;
    color: #f2fff9;
    font-size: 1.46rem;
    line-height: 1.28;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    margin: 12px 0 0;
    max-width: 760px;
    color: #a9c4bc;
    font-size: 0.94rem;
    line-height: 1.72;
    font-weight: 650;
    word-break: keep-all;
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 768px) {
    padding: 18px;

    h2 {
      font-size: 1.28rem;
    }
  }
`;

const NationalSignalRail = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const NationalSignalItem = styled.div<{ $accent: string }>`
  min-width: 0;
  min-height: 122px;
  display: grid;
  align-content: center;
  gap: 5px;
  border: 1px solid rgba(213, 255, 242, 0.14);
  border-radius: 8px;
  padding: 14px;
  background:
    linear-gradient(145deg, ${(props) => `${props.$accent}1f`}, transparent 54%),
    rgba(9, 23, 21, 0.84);
  color: ${(props) => props.$accent};

  span {
    color: #87a8a0;
    font-size: 0.68rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    color: #f8fafc;
    font-size: 1.45rem;
    line-height: 1.05;
    font-weight: 950;
  }

  small {
    color: #a9c4bc;
    font-size: 0.78rem;
    line-height: 1.38;
    font-weight: 750;
    word-break: keep-all;
  }
`;

const NationalMapPanel = styled.div`
  min-height: 640px;
  background: #08110f;

  iframe {
    min-height: 640px;
  }

  @media (max-width: 768px) {
    min-height: 620px;

    iframe {
      min-height: 620px;
    }
  }
`;

const NetworkLayout = styled.div`
  display: grid;
  grid-template-columns: 1fr;
`;

const BusinessMediaInventory = styled.section`
  display: grid;
  gap: 14px;
  padding: 18px 20px 22px;
  border-top: 1px solid rgba(213, 255, 242, 0.14);

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const BusinessMediaHeader = styled.header`
  min-width: 0;

  span {
    color: #5eead4;
    font-size: 0.72rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 6px;
    color: #ffffff;
    font-size: 1.24rem;
    font-weight: 950;
    line-height: 1.2;
    word-break: keep-all;
  }

  p {
    max-width: 780px;
    margin: 8px 0 0;
    color: #a9c4bc;
    font-size: 0.88rem;
    font-weight: 700;
    line-height: 1.58;
    word-break: keep-all;
  }
`;

const BusinessMediaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const BusinessMediaCard = styled.article`
  min-width: 0;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid rgba(213, 255, 242, 0.14);
  border-radius: 8px;
  background: rgba(9, 23, 21, 0.74);

  span {
    color: #5eead4;
    font-size: 0.68rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 4px;
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 950;
    line-height: 1.24;
    word-break: keep-all;
  }

  p,
  small {
    display: block;
    margin: 5px 0 0;
    color: #a9c4bc;
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 1.38;
  }

  small {
    color: rgba(213, 255, 242, 0.48);
    word-break: break-all;
  }
`;

const BusinessMediaPreview = styled.div<{ $image: string }>`
  width: 92px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 1px solid rgba(213, 255, 242, 0.14);
  border-radius: 8px;
  color: #5eead4;
  background:
    linear-gradient(180deg, rgba(4, 13, 12, 0.08), rgba(4, 13, 12, 0.68)),
    ${(props) => (props.$image ? `url(${props.$image}) center / cover` : 'rgba(255, 255, 255, 0.055)')};
  overflow: hidden;

  video,
  iframe {
    width: 100%;
    height: 100%;
    display: block;
    border: 0;
    object-fit: cover;
    background: #06110f;
  }
`;

const MapPanel = styled.div`
  min-width: 0;
  min-height: 0;
  background: #06110f;
  overflow: hidden;

  @media (max-width: 768px) {
    min-height: 0;
  }
`;

const MapFrame = styled.iframe`
  display: block;
  width: 100%;
  height: 100%;
  min-height: 580px;
  border: 0;
  background: #06110f;
  color-scheme: dark;

  @media (max-width: 768px) {
    min-height: 520px;
  }
`;

const AreaBand = styled.section`
  max-width: 1280px;
  margin: 0 auto 16px;
  display: grid;
  grid-template-columns: 1fr;
`;

const ActiveAreaPill = styled.div<{ $accent: string }>`
  width: fit-content;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  padding: 0 13px;
  border: 1px solid ${(props) => `${props.$accent}66`};
  border-radius: 999px;
  color: ${(props) => props.$accent};
  background: ${(props) => `${props.$accent}14`};
  font-size: 0.85rem;
  font-weight: 950;
`;

const BusinessHeroPanel = styled.section<{ $image: string }>`
  min-width: 0;
  min-height: 360px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
  gap: 18px;
  padding: 28px;
  border: 1px solid rgba(213, 255, 242, 0.16);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(4, 13, 12, 0.74), rgba(4, 13, 12, 0.38)),
    linear-gradient(180deg, rgba(4, 13, 12, 0.12), rgba(4, 13, 12, 0.84)),
    url(${(props) => props.$image}) center / cover;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.3);
  overflow: hidden;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    min-height: 0;
    padding: 22px;
  }
`;

const BusinessHeroCopy = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;

  h1 {
    max-width: 760px;
    margin: 18px 0 0;
    color: #ffffff;
    font-size: clamp(2.65rem, 7vw, 5.4rem);
    font-weight: 950;
    line-height: 1;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    max-width: 760px;
    margin: 18px 0 0;
    color: rgba(236, 255, 249, 0.78);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.72;
    word-break: keep-all;
  }
`;

const HeroActionLink = styled.a`
  width: fit-content;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin-top: 24px;
  padding: 0 15px;
  border-radius: 8px;
  color: #06110f;
  background: linear-gradient(90deg, #5eead4, #f5c766);
  font-size: 0.9rem;
  font-weight: 950;
  text-decoration: none;
  box-shadow: 0 16px 34px rgba(45, 212, 191, 0.2);
`;

const BusinessHeroStatus = styled.aside`
  min-width: 0;
  align-self: end;
  display: grid;
  gap: 10px;
  padding: 18px;
  border: 1px solid rgba(213, 255, 242, 0.16);
  border-radius: 8px;
  background: rgba(4, 13, 12, 0.74);
  backdrop-filter: blur(12px);

  > span {
    color: #5eead4;
    font-size: 0.74rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  small {
    color: rgba(236, 255, 249, 0.68);
    font-size: 0.78rem;
    font-weight: 750;
    line-height: 1.45;
    word-break: keep-all;
  }
`;

const BusinessShowcase = styled.div`
  --business-card-min-height: 220px;

  min-width: 0;
  display: grid;
  gap: 12px;

  @media (max-width: 520px) {
    --business-card-min-height: 210px;
  }
`;

const BusinessSectionHeader = styled.header`
  min-width: 0;
  display: grid;
  gap: 6px;
  border: 1px solid rgba(213, 255, 242, 0.16);
  border-radius: 8px;
  padding: 16px;
  background: rgba(6, 17, 15, 0.88);

  span {
    color: #5eead4;
    font-size: 0.72rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: #ffffff;
    font-size: 1.3rem;
    font-weight: 950;
    line-height: 1.2;
    word-break: keep-all;
  }
`;

const BusinessGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1080px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const BusinessCardButton = styled.button<{ $accent: string; $active: boolean }>`
  min-width: 0;
  min-height: var(--business-card-min-height);
  border: 1px solid ${(props) => (props.$active ? props.$accent : 'rgba(213, 255, 242, 0.16)')};
  border-radius: 8px;
  padding: 16px;
  background:
    linear-gradient(135deg, ${(props) => `${props.$accent}${props.$active ? '38' : '1f'}`}, transparent 50%),
    rgba(8, 21, 19, ${(props) => (props.$active ? '0.98' : '0.9')});
  color: inherit;
  text-align: left;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  box-shadow: ${(props) => (props.$active ? `0 0 0 1px ${props.$accent}26, 0 18px 44px rgba(0, 0, 0, 0.28)` : 'none')};
  transform: translateY(${(props) => (props.$active ? '-2px' : '0')});
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;

  &:hover,
  &:focus-visible {
    border-color: ${(props) => props.$accent};
    box-shadow: 0 0 0 1px ${(props) => `${props.$accent}22`};
    transform: translateY(-2px);
    outline: none;
  }

  span {
    margin-top: 14px;
    color: ${(props) => props.$accent};
    font-size: 0.74rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    margin-top: 6px;
    color: #f8fafc;
    font-size: 1.08rem;
    line-height: 1.25;
    font-weight: 950;
    word-break: keep-all;
  }

  p {
    margin: 10px 0 0;
    color: #a9c4bc;
    font-size: 0.84rem;
    line-height: 1.58;
    font-weight: 650;
    word-break: keep-all;
  }

  small {
    margin-top: auto;
    padding-top: 14px;
    color: #d7fff2;
    font-size: 0.72rem;
    line-height: 1.42;
    font-weight: 850;
    word-break: keep-all;
  }

`;

const CardIndex = styled.i`
  font-style: normal;
  color: rgba(236, 255, 249, 0.45);
  font-size: 0.74rem;
  font-weight: 950;
`;

const CardIcon = styled.div`
  width: 44px;
  height: 44px;
  margin-top: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ecfff9;
  background: rgba(255, 255, 255, 0.06);
`;

const BusinessDetailPanel = styled.article<{ $accent: string }>`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(340px, 0.92fr) minmax(0, 1.08fr);
  min-height: 386px;
  overflow: hidden;
  border: 1px solid ${(props) => `${props.$accent}55`};
  border-radius: 8px;
  background:
    linear-gradient(135deg, ${(props) => `${props.$accent}1f`}, transparent 42%),
    rgba(4, 13, 12, 0.94);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.26);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    min-height: 0;
  }
`;

const DetailPhoto = styled.div<{ $image: string }>`
  min-height: 360px;
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(180deg, transparent 42%, rgba(4, 13, 12, 0.92)),
    url(${(props) => props.$image}) center / cover;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
    background-size: 44px 44px;
    mix-blend-mode: screen;
    opacity: 0.18;
  }

  @media (max-width: 760px) {
    min-height: 280px;
  }
`;

const PhotoOverlay = styled.div`
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: 22px;
  display: grid;
  gap: 7px;
  z-index: 1;

  span {
    width: fit-content;
    padding: 6px 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    color: #ecfff9;
    background: rgba(4, 13, 12, 0.62);
    font-size: 0.78rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: clamp(2rem, 4vw, 3.5rem);
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
    text-shadow: 0 14px 32px rgba(0, 0, 0, 0.48);
    word-break: keep-all;
  }
`;

const DetailCopy = styled.div`
  min-width: 0;
  padding: 24px;
  display: grid;
  align-content: center;
  gap: 14px;

  h3 {
    margin: 0;
    color: #f8fafc;
    font-size: clamp(1.42rem, 2.5vw, 2.18rem);
    line-height: 1.18;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }

  > p {
    margin: 0;
    color: #a9c4bc;
    font-size: 0.98rem;
    line-height: 1.76;
    font-weight: 650;
    word-break: keep-all;
  }

  @media (max-width: 760px) {
    padding: 18px;
  }
`;

const DetailStat = styled.div<{ $accent: string }>`
  width: fit-content;
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid ${(props) => `${props.$accent}4d`};
  border-radius: 999px;
  background: ${(props) => `${props.$accent}12`};

  span {
    color: ${(props) => props.$accent};
    font-size: 0.72rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    color: #fff9df;
    font-size: 0.92rem;
    font-weight: 950;
  }
`;

const DetailList = styled.ul`
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 9px;
    align-items: flex-start;
    color: #cde4dc;
    font-size: 0.9rem;
    line-height: 1.58;
    font-weight: 700;
    word-break: keep-all;
  }

  svg {
    margin-top: 2px;
    color: #5eead4;
  }
`;

const DetailMeta = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(213, 255, 242, 0.14);
  border-radius: 8px;
  color: #d7fff2;
  background: rgba(255, 255, 255, 0.045);
  font-size: 0.82rem;
  line-height: 1.3;
  font-weight: 900;
  word-break: keep-all;
`;

const RealityBand = styled.section`
  max-width: 1280px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const RealityItem = styled.div`
  min-height: 92px;
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid rgba(213, 255, 242, 0.16);
  border-radius: 8px;
  padding: 16px;
  background: rgba(4, 13, 12, 0.9);
  color: #5eead4;

  div {
    min-width: 0;
  }

  strong,
  span {
    display: block;
  }

  strong {
    color: #f8fafc;
    font-size: 0.98rem;
    font-weight: 950;
  }

  span {
    margin-top: 4px;
    color: #a9c4bc;
    font-size: 0.86rem;
    line-height: 1.5;
    font-weight: 650;
  }
`;
