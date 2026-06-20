'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import {
  Database,
  Handshake,
  Maximize2,
  Microchip,
  Monitor,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { CorpEditableSection, type CorpSectionEditorState } from '@/components/corp/CorpSectionEditOverlay';
import { getYouTubeEmbedUrl, YOUTUBE_EMBED_ALLOW } from '@/components/corp/corpMediaEmbed';
import { CORP_PAGE_SEED_BY_ID } from '@/constants/corpPageSeeds';
import type { CorpPage, CorpPageBlock } from '@/schemas/corpPageSchema';

type CompanyEmbedView = 'introduction' | 'technology';
type HeroBlock = Extract<CorpPageBlock, { type: 'hero' }>;
type MetricGridBlock = Extract<CorpPageBlock, { type: 'metric-grid' }>;
type TimelineBlock = Extract<CorpPageBlock, { type: 'timeline' }>;
type FeatureGridBlock = Extract<CorpPageBlock, { type: 'feature-grid' }>;
type MediaShowcaseBlock = Extract<CorpPageBlock, { type: 'media-showcase' }>;
type TechnologyMediaItem = MediaShowcaseBlock['data']['media'][number];

type TechnologyFeature = {
  title: string;
  body: string;
  meta: string;
  icon: LucideIcon;
  accent: string;
  details: string[];
};

type TechnologyMetric = {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  accent: string;
  progress?: number;
};

export type CompanyIntroductionConfig = {
  ariaLabel: string;
  initialHeight: number;
  minHeight: number;
  title: string;
  src: string;
  heroKicker: string;
  heroTitle: string;
  heroBody: string;
  heroActionLabel: string;
  heroActionHref: string;
  embedTitle: string;
  embedBody: string;
  mediaItems: TechnologyMediaItem[];
  featureTitle: string;
  technologyFeatures: TechnologyFeature[];
  metricsTitle: string;
  technologyMetrics: TechnologyMetric[];
};

const COMPANY_EMBED_VIEW_CONFIG: Record<
  CompanyEmbedView,
  {
    ariaLabel: string;
    initialHeight: number;
    minHeight: number;
    title: string;
  }
> = {
  introduction: {
    ariaLabel: '회사소개',
    initialHeight: 2200,
    minHeight: 900,
    title: 'PRO PIG 회사소개',
  },
  technology: {
    ariaLabel: '기업기술',
    initialHeight: 1200,
    minHeight: 720,
    title: 'PRO PIG 기업기술',
  },
};

const TECHNOLOGY_ICON_MAP: Record<string, LucideIcon> = {
  Database,
  Handshake,
  Maximize2,
  Microchip,
  Monitor,
  ShieldCheck,
  Sparkles,
  Workflow,
};

interface CompanyIntroductionExperienceProps {
  view?: CompanyEmbedView;
  config?: CompanyIntroductionConfig;
  editor?: CorpSectionEditorState;
  page?: CorpPage | null;
}

interface IntroductionBlocks {
  hero?: HeroBlock;
  finance?: MetricGridBlock;
  capitalAllocation?: MetricGridBlock;
  revenueProfit?: MetricGridBlock;
  history?: TimelineBlock;
  values?: FeatureGridBlock;
  techKnowledge?: FeatureGridBlock;
  vision?: FeatureGridBlock;
}

interface NativeIntroductionSection {
  blockId: keyof IntroductionBlocks;
  label: string;
  html: string;
}

interface NativeIntroductionSource {
  css: string;
  sections: NativeIntroductionSection[];
}

const INTRODUCTION_BLOCK_IDS: Record<keyof IntroductionBlocks, string> = {
  hero: 'introduction-hero',
  finance: 'introduction-finance',
  capitalAllocation: 'introduction-capital-allocation',
  revenueProfit: 'introduction-revenue-profit',
  history: 'introduction-history',
  values: 'introduction-values',
  techKnowledge: 'introduction-tech-knowledge',
  vision: 'introduction-vision',
};

const FINANCE_EDIT_TARGETS = [
  { blockId: 'introduction-finance', label: '현재 상태 수치' },
];

function hasPieGraphValues(block: MetricGridBlock | undefined) {
  return Boolean(
    block &&
      block.enabled !== false &&
      block.data.metrics.some((metric) => typeof metric.progress === 'number' || readNumberFromText(metric.value) !== undefined),
  );
}

function hasBarGraphValues(block: MetricGridBlock | undefined) {
  return Boolean(
    block &&
      block.enabled !== false &&
      block.data.metrics.some((metric) => typeof metric.progress === 'number' || typeof metric.secondaryProgress === 'number'),
  );
}

function getFinanceEditTargets(blocks: IntroductionBlocks) {
  const targets = [...FINANCE_EDIT_TARGETS];

  if (hasPieGraphValues(blocks.capitalAllocation)) {
    targets.push({ blockId: 'introduction-capital-allocation', label: '원형그래프' });
  }

  if (hasBarGraphValues(blocks.revenueProfit)) {
    targets.push({ blockId: 'introduction-revenue-profit', label: '막대그래프' });
  }

  return targets;
}

function findTypedBlock<T extends CorpPageBlock['type']>(
  page: CorpPage | null | undefined,
  blockId: string,
  type: T,
): Extract<CorpPageBlock, { type: T }> | undefined {
  const block = page?.blocks.find((item) => item.id === blockId);
  return block?.type === type ? (block as Extract<CorpPageBlock, { type: T }>) : undefined;
}

function getTechnologyIcon(name: string | null | undefined, fallback: LucideIcon) {
  return name ? TECHNOLOGY_ICON_MAP[name] ?? fallback : fallback;
}

function getIntroductionBlocks(page?: CorpPage | null): IntroductionBlocks {
  const seedPage = CORP_PAGE_SEED_BY_ID.introduction;

  return {
    hero: findTypedBlock(page, 'introduction-hero', 'hero') ?? findTypedBlock(seedPage, 'introduction-hero', 'hero'),
    finance:
      findTypedBlock(page, 'introduction-finance', 'metric-grid') ??
      findTypedBlock(seedPage, 'introduction-finance', 'metric-grid'),
    capitalAllocation:
      findTypedBlock(page, 'introduction-capital-allocation', 'metric-grid') ??
      findTypedBlock(seedPage, 'introduction-capital-allocation', 'metric-grid'),
    revenueProfit:
      findTypedBlock(page, 'introduction-revenue-profit', 'metric-grid') ??
      findTypedBlock(seedPage, 'introduction-revenue-profit', 'metric-grid'),
    history:
      findTypedBlock(page, 'introduction-history', 'timeline') ?? findTypedBlock(seedPage, 'introduction-history', 'timeline'),
    values:
      findTypedBlock(page, 'introduction-values', 'feature-grid') ??
      findTypedBlock(seedPage, 'introduction-values', 'feature-grid'),
    techKnowledge:
      findTypedBlock(page, 'introduction-tech-knowledge', 'feature-grid') ??
      findTypedBlock(seedPage, 'introduction-tech-knowledge', 'feature-grid'),
    vision:
      findTypedBlock(page, 'introduction-vision', 'feature-grid') ?? findTypedBlock(seedPage, 'introduction-vision', 'feature-grid'),
  };
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderImmediateHero(block: HeroBlock | undefined) {
  const data = block?.data;
  const kicker = data?.kicker || '회사소개';
  const headline = data?.headline || '실제 화면과 운영 데이터를 함께 키우는 AI 운영 회사';
  const body =
    data?.body ||
    'PRO PIG는 기업 소개 사이트, 업무 생산성 앱, AI 자동화 도구를 한 제품군으로 묶어 기획, 개발, 검증, 운영 흐름을 빠르게 연결합니다.';
  const mediaUrl = data?.mediaUrl;

  return `
    <section class="immediate-intro-section immediate-intro-hero">
      <div class="immediate-intro-media">
        ${
          mediaUrl
            ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(headline)}" loading="eager" />`
            : '<div class="immediate-intro-media-fallback" aria-hidden="true"></div>'
        }
      </div>
      <div class="immediate-intro-copy">
        <span>${escapeHtml(kicker)}</span>
        <h1>${escapeHtml(headline)}</h1>
        <p>${escapeHtml(body)}</p>
      </div>
    </section>
  `;
}

function renderImmediateMetrics(block: MetricGridBlock | undefined, title: string) {
  const metrics = block?.enabled === false ? [] : block?.data.metrics ?? [];
  if (metrics.length === 0) return '';

  return `
    <section class="immediate-intro-section immediate-intro-metrics">
      <header>
        <span>Operating Data</span>
        <h2>${escapeHtml(block?.data.title || title)}</h2>
      </header>
      <div class="immediate-intro-metric-grid">
        ${metrics
          .map(
            (metric) => `
              <article>
                <span>${escapeHtml(metric.label)}</span>
                <strong>${escapeHtml(metric.value)}</strong>
                <p>${escapeHtml(metric.caption)}</p>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderImmediateFinance(blocks: IntroductionBlocks) {
  const financeHtml = renderImmediateMetrics(blocks.finance, '운영 현황');
  const capitalHtml = renderImmediateMetrics(blocks.capitalAllocation, '자본 배분');
  const revenueHtml = renderImmediateMetrics(blocks.revenueProfit, '매출과 수익');

  return `
    <section class="immediate-intro-finance">
      ${financeHtml}
      ${capitalHtml}
      ${revenueHtml}
    </section>
  `;
}

function renderImmediateTimeline(block: TimelineBlock | undefined) {
  const items = block?.enabled === false ? [] : block?.data.items ?? [];
  if (items.length === 0) return '';

  return `
    <section class="immediate-intro-section immediate-intro-timeline">
      <header>
        <span>History</span>
        <h2>${escapeHtml(block?.data.title || '회사연혁')}</h2>
        <p>${escapeHtml(block?.data.body)}</p>
      </header>
      <div class="immediate-intro-timeline-list">
        ${items
          .map(
            (item) => `
              <article>
                <time>${escapeHtml(item.date)}</time>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.body)}</p>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderImmediateFeatures(block: FeatureGridBlock | undefined, eyebrow: string, fallbackTitle: string) {
  const features = block?.enabled === false ? [] : block?.data.features ?? [];
  if (features.length === 0) return '';

  return `
    <section class="immediate-intro-section immediate-intro-features">
      <header>
        <span>${escapeHtml(eyebrow)}</span>
        <h2>${escapeHtml(block?.data.title || fallbackTitle)}</h2>
      </header>
      <div class="immediate-intro-feature-grid">
        ${features
          .map(
            (feature) => `
              <article>
                <strong>${escapeHtml(feature.title)}</strong>
                <p>${escapeHtml(feature.body)}</p>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function createImmediateIntroductionSource(blocks: IntroductionBlocks): NativeIntroductionSource {
  return {
    css: `
      .company-introduction-native .immediate-intro-section,
      .company-introduction-native .immediate-intro-finance {
        width: min(1160px, calc(100% - 48px));
        margin: 28px auto;
      }

      .company-introduction-native .immediate-intro-hero {
        min-height: 520px;
        display: grid;
        grid-template-columns: minmax(0, 0.94fr) minmax(0, 1.06fr);
        gap: 40px;
        align-items: center;
        padding: 42px;
        border: 1px solid rgba(226, 232, 240, 0.12);
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.74);
        box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.12), 0 30px 80px rgba(0, 0, 0, 0.3);
      }

      .company-introduction-native .immediate-intro-media {
        min-height: 360px;
        overflow: hidden;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.9);
      }

      .company-introduction-native .immediate-intro-media img,
      .company-introduction-native .immediate-intro-media-fallback {
        display: block;
        width: 100%;
        height: 100%;
        min-height: inherit;
        object-fit: cover;
      }

      .company-introduction-native .immediate-intro-media-fallback {
        background:
          linear-gradient(135deg, rgba(94, 234, 212, 0.18), transparent 46%),
          linear-gradient(315deg, rgba(129, 140, 248, 0.2), transparent 42%),
          #111827;
      }

      .company-introduction-native .immediate-intro-copy,
      .company-introduction-native .immediate-intro-section header {
        display: grid;
        gap: 14px;
      }

      .company-introduction-native .immediate-intro-copy span,
      .company-introduction-native .immediate-intro-section header span {
        width: fit-content;
        min-height: 32px;
        display: inline-flex;
        align-items: center;
        border: 1px solid rgba(129, 140, 248, 0.28);
        border-radius: 999px;
        padding: 0 12px;
        color: #c7d2fe;
        background: rgba(99, 102, 241, 0.16);
        font-size: 0.78rem;
        font-weight: 900;
      }

      .company-introduction-native .immediate-intro-copy h1 {
        margin: 0;
        color: #f8fafc;
        font-size: clamp(2.5rem, 5vw, 5rem);
        line-height: 1.02;
        word-break: keep-all;
      }

      .company-introduction-native .immediate-intro-copy p,
      .company-introduction-native .immediate-intro-section header p,
      .company-introduction-native .immediate-intro-feature-grid p,
      .company-introduction-native .immediate-intro-metric-grid p,
      .company-introduction-native .immediate-intro-timeline-list p {
        margin: 0;
        color: #cbd5e1;
        line-height: 1.72;
        word-break: keep-all;
      }

      .company-introduction-native .immediate-intro-section h2 {
        margin: 0;
        color: #f8fafc;
        font-size: clamp(1.7rem, 3vw, 3rem);
        line-height: 1.12;
      }

      .company-introduction-native .immediate-intro-metric-grid,
      .company-introduction-native .immediate-intro-feature-grid,
      .company-introduction-native .immediate-intro-timeline-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .company-introduction-native .immediate-intro-metric-grid article,
      .company-introduction-native .immediate-intro-feature-grid article,
      .company-introduction-native .immediate-intro-timeline-list article {
        min-width: 0;
        display: grid;
        gap: 8px;
        padding: 18px;
        border: 1px solid rgba(226, 232, 240, 0.1);
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.62);
      }

      .company-introduction-native .immediate-intro-metric-grid span,
      .company-introduction-native .immediate-intro-timeline-list time {
        color: #5eead4;
        font-size: 0.78rem;
        font-weight: 900;
      }

      .company-introduction-native .immediate-intro-metric-grid strong {
        color: #fef3c7;
        font-size: 1.6rem;
      }

      .company-introduction-native .immediate-intro-feature-grid strong,
      .company-introduction-native .immediate-intro-timeline-list strong {
        color: #f8fafc;
        font-size: 1.08rem;
      }

      @media (max-width: 820px) {
        .company-introduction-native .immediate-intro-section,
        .company-introduction-native .immediate-intro-finance {
          width: min(100% - 24px, 1160px);
          margin: 16px auto;
        }

        .company-introduction-native .immediate-intro-hero,
        .company-introduction-native .immediate-intro-metric-grid,
        .company-introduction-native .immediate-intro-feature-grid,
        .company-introduction-native .immediate-intro-timeline-list {
          grid-template-columns: 1fr;
        }

        .company-introduction-native .immediate-intro-hero {
          min-height: 0;
          padding: 20px;
        }
      }
    `,
    sections: [
      blocks.hero ? { blockId: 'hero', label: '회사소개 메인 수정', html: renderImmediateHero(blocks.hero) } : null,
      blocks.finance || blocks.capitalAllocation || blocks.revenueProfit
        ? { blockId: 'finance', label: '재무 섹션 수정', html: renderImmediateFinance(blocks) }
        : null,
      blocks.history ? { blockId: 'history', label: '회사연혁 수정', html: renderImmediateTimeline(blocks.history) } : null,
      blocks.values
        ? { blockId: 'values', label: '기업이념 수정', html: renderImmediateFeatures(blocks.values, 'Values', '기업이념') }
        : null,
      blocks.vision
        ? { blockId: 'vision', label: '기업브랜드 수정', html: renderImmediateFeatures(blocks.vision, 'Brand', '기업브랜드') }
        : null,
    ].filter((section): section is NativeIntroductionSection => Boolean(section)),
  };
}

export function buildCompanyIntroductionConfig(page?: CorpPage | null, view: CompanyEmbedView = 'introduction'): CompanyIntroductionConfig {
  const viewConfig = COMPANY_EMBED_VIEW_CONFIG[view];
  const seedPage = view === 'technology' ? CORP_PAGE_SEED_BY_ID.technology : undefined;
  const heroBlock = findTypedBlock(page, `${view}-hero`, 'hero') ?? findTypedBlock(seedPage, `${view}-hero`, 'hero');
  const embedBlock =
    findTypedBlock(page, `${view}-embed`, 'media-showcase') ?? findTypedBlock(seedPage, `${view}-embed`, 'media-showcase');
  const featuresBlock =
    findTypedBlock(page, `${view}-features`, 'feature-grid') ?? findTypedBlock(seedPage, `${view}-features`, 'feature-grid');
  const metricsBlock =
    findTypedBlock(page, `${view}-metrics`, 'metric-grid') ?? findTypedBlock(seedPage, `${view}-metrics`, 'metric-grid');
  const mediaItems = embedBlock?.enabled === false ? [] : embedBlock?.data.media ?? [];
  const mediaItem = mediaItems.find((item) => item.type === 'embed') ?? mediaItems[0];
  const heroMediaUrl = heroBlock?.type === 'hero' ? heroBlock.data.mediaUrl : undefined;
  const technologyFeatures =
    featuresBlock?.enabled === false
      ? []
      : (featuresBlock?.data.features ?? []).map((feature, index) => ({
          title: feature.title.trim() || `기술 항목 ${index + 1}`,
          body: feature.body.trim(),
          meta: feature.meta?.trim() || 'Technology',
          icon: getTechnologyIcon(feature.icon, Microchip),
          accent: feature.accent?.trim() || ['#5eead4', '#f5b84b', '#60a5fa', '#fb7185', '#a7f3d0'][index % 5]!,
          details: (feature.details ?? []).map((detail) => detail.trim()).filter(Boolean),
        }));
  const technologyMetrics =
    metricsBlock?.enabled === false
      ? []
      : (metricsBlock?.data.metrics ?? []).map((metric, index) => ({
          label: metric.label.trim() || `지표 ${index + 1}`,
          value: metric.value.trim(),
          caption: metric.caption.trim(),
          icon: getTechnologyIcon(metric.icon, Microchip),
          accent: metric.accent?.trim() || ['#5eead4', '#f5b84b', '#60a5fa'][index % 3]!,
          progress: metric.progress,
        }));

  return {
    ...viewConfig,
    initialHeight: mediaItem?.height ?? viewConfig.initialHeight,
    title: mediaItem?.alt || (heroBlock?.type === 'hero' ? heroBlock.data.headline : '') || viewConfig.title,
    src: mediaItem?.url || heroMediaUrl || `/corp/company-world-map.html?view=${view}`,
    minHeight: mediaItem?.height ?? viewConfig.minHeight,
    heroKicker: heroBlock?.type === 'hero' ? heroBlock.data.kicker : 'COMPANY TECHNOLOGY',
    heroTitle: heroBlock?.type === 'hero' ? heroBlock.data.headline : viewConfig.title,
    heroBody: heroBlock?.type === 'hero' ? heroBlock.data.body : '',
    heroActionLabel: heroBlock?.type === 'hero' ? heroBlock.data.primaryLabel || '' : '',
    heroActionHref: heroBlock?.type === 'hero' ? heroBlock.data.primaryHref || '' : '',
    embedTitle: embedBlock?.type === 'media-showcase' ? embedBlock.data.title : viewConfig.title,
    embedBody: embedBlock?.type === 'media-showcase' ? embedBlock.data.body : '',
    mediaItems,
    featureTitle: featuresBlock?.type === 'feature-grid' ? featuresBlock.data.title : '기술 실행 구조',
    technologyFeatures,
    metricsTitle: metricsBlock?.type === 'metric-grid' ? metricsBlock.data.title : '적용 정보',
    technologyMetrics,
  };
}

export default function CompanyIntroductionExperience({
  view = 'introduction',
  config,
  editor,
  page,
}: CompanyIntroductionExperienceProps) {
  if (view === 'introduction') {
    return <NativeCompanyIntroduction page={page} editor={editor} />;
  }

  return <CompanyEmbedExperience view={view} config={config} editor={editor} />;
}

function NativeCompanyIntroduction({ page, editor }: { page?: CorpPage | null; editor?: CorpSectionEditorState }) {
  const blocks = useMemo(() => getIntroductionBlocks(page), [page]);
  const source = useMemo(() => createImmediateIntroductionSource(blocks), [blocks]);

  return (
    <NativePage
      id="content-area"
      className="company-introduction-native"
      data-company-introduction-native
      aria-label="회사소개"
      $scrollable={Boolean(editor)}
    >
      <NativeIntroductionStyles $css={source.css} />
      <NativeStack className="partner-page">
        {source.sections.map((section) => {
          const block = blocks[section.blockId];
          if (block?.enabled === false) return null;
          const sectionContent = <NativeSection dangerouslySetInnerHTML={{ __html: section.html }} />;

          if (section.blockId === 'finance') {
            return (
              <NativeFinanceEditableSection key={section.blockId} editor={editor} blocks={blocks}>
                {sectionContent}
              </NativeFinanceEditableSection>
            );
          }

          return (
            <CorpEditableSection key={section.blockId} blockId={INTRODUCTION_BLOCK_IDS[section.blockId]} label={section.label} editor={editor}>
              {sectionContent}
            </CorpEditableSection>
          );
        })}
      </NativeStack>
    </NativePage>
  );
}

function NativeFinanceEditableSection({
  editor,
  blocks,
  children,
}: {
  editor?: CorpSectionEditorState;
  blocks: IntroductionBlocks;
  children: ReactNode;
}) {
  if (!editor) return <>{children}</>;

  const editTargets = getFinanceEditTargets(blocks);
  const selectedBlockId = editor.selectedBlockId;
  const isSelected = editTargets.some((target) => target.blockId === selectedBlockId);

  return (
    <FinanceEditableShell $selected={isSelected} data-corp-section="introduction-finance">
      <FinanceEditToolbar aria-label="재무 대시보드 편집 메뉴">
        {editTargets.map((target) => (
          <button
            key={target.blockId}
            type="button"
            aria-pressed={selectedBlockId === target.blockId}
            onClick={() => editor.onSelectBlock?.(target.blockId)}
          >
            <Settings size={13} />
            {target.label}
          </button>
        ))}
      </FinanceEditToolbar>
      {children}
    </FinanceEditableShell>
  );
}

function readNumberFromText(value: string | undefined) {
  const match = value?.match(/\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function CompanyEmbedExperience({
  view,
  config,
  editor,
}: {
  view: CompanyEmbedView;
  config?: CompanyIntroductionConfig;
  editor?: CorpSectionEditorState;
}) {
  const viewConfig = config ?? buildCompanyIntroductionConfig(null, view);
  const [frameSize, setFrameSize] = useState(() => ({
    height: viewConfig.initialHeight,
    src: viewConfig.src,
  }));
  const frameHeight = frameSize.src === viewConfig.src ? frameSize.height : viewConfig.initialHeight;
  const supportingMediaItems = viewConfig.mediaItems.filter((item) => item.type !== 'embed' || item.url !== viewConfig.src);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const data = event.data as { source?: string; action?: string; height?: number } | null;
      if (data?.source !== 'propig-partner-page' || data.action !== 'resize' || !data.height) return;

      setFrameSize({
        height: Math.max(viewConfig.minHeight, Math.ceil(data.height)),
        src: viewConfig.src,
      });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [viewConfig.minHeight, viewConfig.src]);

  return (
    <EmbedPage id="content-area" aria-label={viewConfig.ariaLabel}>
      <CorpEditableSection blockId={`${view}-hero`} label="기술 상단 문구 수정" editor={editor}>
        <TechnologyHero>
          <TechnologyHeroCopy>
            <SectionLabel>{viewConfig.heroKicker}</SectionLabel>
            <h1>{viewConfig.heroTitle}</h1>
            {viewConfig.heroBody ? <p>{viewConfig.heroBody}</p> : null}
            {viewConfig.heroActionLabel && viewConfig.heroActionHref ? (
              <TechHeroLink href={viewConfig.heroActionHref}>
                <Microchip size={17} strokeWidth={2.4} aria-hidden="true" />
                {viewConfig.heroActionLabel}
              </TechHeroLink>
            ) : null}
          </TechnologyHeroCopy>
          <TechnologyHeroPanel aria-label="기술 페이지 적용 요약">
            <span>Live Embed</span>
            <strong>{viewConfig.title}</strong>
            <small>{viewConfig.src}</small>
          </TechnologyHeroPanel>
        </TechnologyHero>
      </CorpEditableSection>

      <CorpEditableSection blockId={`${view}-embed`} label="iframe/영상 수정" editor={editor}>
        <TechnologyFrameSection>
          <TechnologySectionHead>
            <SectionLabel>Embedded Technology View</SectionLabel>
            <h2>{viewConfig.embedTitle}</h2>
            {viewConfig.embedBody ? <p>{viewConfig.embedBody}</p> : null}
          </TechnologySectionHead>
          <MapFrame
            key={viewConfig.src}
            src={viewConfig.src}
            title={viewConfig.title}
            loading="lazy"
            style={{ height: `${frameHeight}px` }}
          />
          {supportingMediaItems.length > 0 ? (
            <TechnologyMediaRail aria-label="기술 관련 미디어">
              {supportingMediaItems.map((item) => (
                <TechnologyMediaCard key={`${item.type}-${item.url}`}>
                  <TechnologyMediaPreview>{renderTechnologyMediaPreview(item)}</TechnologyMediaPreview>
                  <div>
                    <span>{item.type}</span>
                    <strong>{item.caption || item.alt}</strong>
                    {item.description ? <p>{item.description}</p> : null}
                  </div>
                </TechnologyMediaCard>
              ))}
            </TechnologyMediaRail>
          ) : null}
        </TechnologyFrameSection>
      </CorpEditableSection>

      <CorpEditableSection blockId={`${view}-features`} label="기술 실행 구조 수정" editor={editor}>
        <TechnologyFeatureSection>
          <TechnologySectionHead>
            <SectionLabel>Execution Architecture</SectionLabel>
            <h2>{viewConfig.featureTitle}</h2>
          </TechnologySectionHead>
          <TechnologyFeatureGrid>
            {viewConfig.technologyFeatures.map((feature) => {
              const Icon = feature.icon;

              return (
                <TechnologyFeatureCard key={`${feature.meta}-${feature.title}`} $accent={feature.accent}>
                  <TechnologyFeatureIcon>
                    <Icon size={20} strokeWidth={2.4} aria-hidden="true" />
                  </TechnologyFeatureIcon>
                  <span>{feature.meta}</span>
                  <strong>{feature.title}</strong>
                  <p>{feature.body}</p>
                  {feature.details.length > 0 ? (
                    <TechnologyDetailList>
                      {feature.details.slice(0, 4).map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </TechnologyDetailList>
                  ) : null}
                </TechnologyFeatureCard>
              );
            })}
          </TechnologyFeatureGrid>
        </TechnologyFeatureSection>
      </CorpEditableSection>

      <CorpEditableSection blockId={`${view}-metrics`} label="적용 정보 수정" editor={editor}>
        <TechnologyMetricSection>
          <TechnologySectionHead>
            <SectionLabel>Applied Status</SectionLabel>
            <h2>{viewConfig.metricsTitle}</h2>
          </TechnologySectionHead>
          <TechnologyMetricGrid>
            {viewConfig.technologyMetrics.map((metric) => {
              const Icon = metric.icon;

              return (
                <TechnologyMetricCard key={`${metric.label}-${metric.value}`} $accent={metric.accent}>
                  <Icon size={19} strokeWidth={2.4} aria-hidden="true" />
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <p>{metric.caption}</p>
                  {typeof metric.progress === 'number' ? <TechnologyProgress $value={metric.progress} /> : null}
                </TechnologyMetricCard>
              );
            })}
          </TechnologyMetricGrid>
        </TechnologyMetricSection>
      </CorpEditableSection>
    </EmbedPage>
  );
}

function getTechnologyMediaTitle(item: TechnologyMediaItem) {
  return item.alt || item.caption || '기술 미디어';
}

function renderTechnologyMediaPreview(item: TechnologyMediaItem) {
  const youtubeEmbedUrl = getYouTubeEmbedUrl(item.url);
  const title = getTechnologyMediaTitle(item);

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
    return <video src={item.url} controls muted playsInline preload="metadata" />;
  }

  if (item.type === 'image') {
    return <img src={item.url} alt={item.alt} loading="lazy" />;
  }

  return <iframe src={item.url} title={title} loading="lazy" />;
}

const NativeIntroductionStyles = createGlobalStyle<{ $css: string }>`
  ${(props) => props.$css}

  .company-introduction-native .company-photo,
  .company-introduction-native .company-photo-layer {
    filter: none !important;
    background-blend-mode: normal !important;
  }

  .company-introduction-native .company-photo::before,
  .company-introduction-native .company-photo-layer::after {
    background: none !important;
    opacity: 0 !important;
  }

  .company-introduction-native .company-photo-badge {
    backdrop-filter: none !important;
  }

  .company-introduction-native .company-pie-center::after {
    content: attr(data-total-label);
  }

  .company-introduction-native .tech-knowledge-section {
    display: grid;
  }
`;

const NativePage = styled.main<{ $scrollable: boolean }>`
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  overflow: auto;
  scrollbar-width: ${(props) => (props.$scrollable ? 'auto' : 'none')};
  -ms-overflow-style: ${(props) => (props.$scrollable ? 'auto' : 'none')};
  color: var(--text, #f2fff9);
  background:
    linear-gradient(90deg, rgba(6, 17, 15, 0.62), transparent 21%, transparent 79%, rgba(6, 17, 15, 0.62)),
    linear-gradient(180deg, rgba(6, 17, 15, 0.16), transparent 38%, rgba(6, 17, 15, 0.58)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    radial-gradient(circle at 26% 25%, rgba(45, 212, 191, 0.18), transparent 38%),
    radial-gradient(circle at 74% 56%, rgba(245, 199, 102, 0.12), transparent 34%),
    var(--bg, #06110f);
  background-size: auto, auto, 54px 54px, 54px 54px, auto, auto, auto;
  font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
  -webkit-font-smoothing: antialiased;

  &,
  * {
    box-sizing: border-box;
    letter-spacing: 0;
  }

  &::-webkit-scrollbar {
    width: ${(props) => (props.$scrollable ? '12px' : '0')};
    height: ${(props) => (props.$scrollable ? '12px' : '0')};
  }
`;

const NativeStack = styled.div`
  min-height: 100%;
`;

const NativeSection = styled.div`
  min-width: 0;
`;

const FinanceEditableShell = styled.div<{ $selected: boolean }>`
  position: relative;
  min-width: 0;
  border-radius: 8px;
  outline: ${(props) => (props.$selected ? '2px solid rgba(94, 234, 212, 0.94)' : '1px dashed rgba(94, 234, 212, 0.34)')};
  outline-offset: ${(props) => (props.$selected ? '4px' : '3px')};
  transition:
    outline-color 160ms ease,
    outline-offset 160ms ease;
`;

const FinanceEditToolbar = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 14;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  max-width: min(520px, calc(100% - 20px));

  button {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgba(94, 234, 212, 0.46);
    border-radius: 8px;
    padding: 0 10px;
    color: #05201d;
    background: rgba(94, 234, 212, 0.92);
    box-shadow: 0 14px 34px rgba(2, 6, 23, 0.32);
    font-size: 0.76rem;
    font-weight: 950;
    cursor: pointer;
  }

  button[aria-pressed='true'],
  button:hover,
  button:focus-visible {
    color: #042f2e;
    background: #ffffff;
    outline: none;
  }
`;

const EmbedPage = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  gap: 18px;
  width: 100%;
  overflow: auto;
  padding: 28px;
  color: #f4fff9;
  background:
    linear-gradient(90deg, rgba(6, 17, 15, 0.72), transparent 22%, transparent 78%, rgba(6, 17, 15, 0.72)),
    linear-gradient(180deg, rgba(6, 17, 15, 0.2), transparent 40%, rgba(6, 17, 15, 0.7)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    radial-gradient(circle at 20% 16%, rgba(94, 234, 212, 0.18), transparent 34%),
    radial-gradient(circle at 82% 44%, rgba(245, 184, 75, 0.12), transparent 32%),
    #06110f;
  background-size: auto, auto, 54px 54px, 54px 54px, auto, auto, auto;
  font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;

  &,
  * {
    box-sizing: border-box;
    letter-spacing: 0;
  }

  @media (max-width: 760px) {
    padding: 14px;
    gap: 14px;
  }
`;

const TechnologyHero = styled.section`
  width: min(1180px, 100%);
  margin: 0 auto;
  min-height: 300px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
  gap: 18px;
  padding: 28px;
  border: 1px solid rgba(174, 194, 184, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.03)),
    rgba(5, 14, 13, 0.78);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.32);
  overflow: hidden;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    padding: 22px;
  }
`;

const TechnologyHeroCopy = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;

  h1 {
    max-width: 740px;
    margin: 18px 0 0;
    color: #ffffff;
    font-size: clamp(2.4rem, 6vw, 4.9rem);
    font-weight: 950;
    line-height: 1.02;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    max-width: 760px;
    margin: 18px 0 0;
    color: rgba(237, 248, 244, 0.74);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.72;
    word-break: keep-all;
  }
`;

const SectionLabel = styled.span`
  width: fit-content;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid rgba(94, 234, 212, 0.34);
  border-radius: 8px;
  color: #bdfef4;
  background: rgba(45, 212, 191, 0.11);
  font-size: 0.76rem;
  font-weight: 950;
  line-height: 1;
  letter-spacing: 0;
  text-transform: uppercase;
`;

const TechHeroLink = styled.a`
  width: fit-content;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin-top: 24px;
  padding: 0 15px;
  border-radius: 8px;
  color: #06110f;
  background: linear-gradient(90deg, #5eead4, #f5b84b);
  font-size: 0.9rem;
  font-weight: 950;
  text-decoration: none;
  box-shadow: 0 16px 34px rgba(45, 212, 191, 0.2);
`;

const TechnologyHeroPanel = styled.aside`
  min-width: 0;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border: 1px solid rgba(245, 184, 75, 0.24);
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(245, 184, 75, 0.11), transparent 58%),
    rgba(255, 255, 255, 0.055);

  span {
    color: #5eead4;
    font-size: 0.78rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    color: #ffffff;
    font-size: 1.35rem;
    font-weight: 950;
    line-height: 1.16;
    word-break: keep-all;
  }

  small {
    color: rgba(237, 248, 244, 0.6);
    font-size: 0.8rem;
    font-weight: 750;
    line-height: 1.45;
    word-break: break-all;
  }
`;

const TechnologySectionShell = styled.section`
  width: min(1180px, 100%);
  margin: 0 auto;
  min-width: 0;
  display: grid;
  gap: 16px;
  padding: 22px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.052);

  @media (max-width: 760px) {
    padding: 16px;
  }
`;

const TechnologyFrameSection = TechnologySectionShell;
const TechnologyFeatureSection = TechnologySectionShell;
const TechnologyMetricSection = TechnologySectionShell;

const TechnologySectionHead = styled.header`
  min-width: 0;

  h2 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: 1.9rem;
    font-weight: 950;
    line-height: 1.16;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    max-width: 840px;
    margin: 10px 0 0;
    color: rgba(237, 248, 244, 0.66);
    font-size: 0.94rem;
    font-weight: 700;
    line-height: 1.62;
    word-break: keep-all;
  }
`;

const MapFrame = styled.iframe`
  width: 100%;
  min-height: 420px;
  flex: 1 0 auto;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  display: block;
  background: #06110f;
`;

const TechnologyMediaRail = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1080px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const TechnologyMediaCard = styled.article`
  min-width: 0;
  display: grid;
  gap: 10px;

  > div:last-child {
    min-width: 0;
  }

  span {
    color: #5eead4;
    font-size: 0.72rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 4px;
    color: #ffffff;
    font-size: 0.95rem;
    font-weight: 950;
    line-height: 1.28;
    word-break: keep-all;
  }

  p {
    margin: 6px 0 0;
    color: rgba(237, 248, 244, 0.58);
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.45;
    word-break: keep-all;
  }
`;

const TechnologyMediaPreview = styled.div`
  min-width: 0;
  aspect-ratio: 16 / 9;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);

  video,
  img,
  iframe {
    width: 100%;
    height: 100%;
    display: block;
    border: 0;
    object-fit: cover;
  }
`;

const TechnologyFeatureGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1180px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const TechnologyFeatureCard = styled.article<{ $accent: string }>`
  min-width: 0;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 32%, rgba(174, 194, 184, 0.14));
  border-radius: 8px;
  background:
    linear-gradient(145deg, color-mix(in srgb, ${(props) => props.$accent} 12%, transparent), transparent 58%),
    rgba(5, 14, 13, 0.54);

  > span {
    margin-top: 14px;
    color: ${(props) => props.$accent};
    font-size: 0.72rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    margin-top: 7px;
    color: #ffffff;
    font-size: 1.08rem;
    font-weight: 950;
    line-height: 1.18;
    word-break: keep-all;
  }

  p {
    margin: 10px 0 0;
    color: rgba(237, 248, 244, 0.64);
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const TechnologyFeatureIcon = styled.div`
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #06110f;
  background: #5eead4;
`;

const TechnologyDetailList = styled.ul`
  display: grid;
  gap: 6px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;

  li {
    position: relative;
    padding-left: 12px;
    color: rgba(237, 248, 244, 0.58);
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1.42;
    word-break: keep-all;
  }

  li::before {
    content: "";
    position: absolute;
    top: 0.58em;
    left: 0;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #f5b84b;
  }
`;

const TechnologyMetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const TechnologyMetricCard = styled.article<{ $accent: string }>`
  min-width: 0;
  min-height: 156px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 30%, rgba(174, 194, 184, 0.14));
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);

  svg {
    color: ${(props) => props.$accent};
  }

  span {
    margin-top: 12px;
    color: rgba(237, 248, 244, 0.62);
    font-size: 0.78rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  strong {
    margin-top: 5px;
    color: #ffffff;
    font-size: 1.8rem;
    font-weight: 950;
    line-height: 1.05;
    word-break: keep-all;
  }

  p {
    margin: 9px 0 0;
    color: rgba(237, 248, 244, 0.58);
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.45;
    word-break: keep-all;
  }
`;

const TechnologyProgress = styled.div<{ $value: number }>`
  height: 5px;
  margin-top: auto;
  border-radius: 999px;
  background:
    linear-gradient(90deg, #5eead4 0 ${(props) => Math.max(0, Math.min(100, props.$value))}%, rgba(255, 255, 255, 0.12) 0 100%);
`;
