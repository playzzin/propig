'use client';

import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  Handshake,
  Layers3,
  Megaphone,
  ShieldCheck,
  Target,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import { IntentPrefetchLink } from '@/components/navigation/IntentPrefetchLink';
import { CORP_PAGE_DEFINITIONS, type CorpPageDefinition } from '@/constants/corpPages';

interface CorpInfoPageProps {
  page: CorpPageDefinition;
}

type PageVisual = {
  eyebrow: string;
  accent: string;
  icon: LucideIcon;
  figureLabel: string;
  figureValue: string;
  figureCaption: string;
  panels: Array<{
    label: string;
    value: string;
    body: string;
    progress: number;
    icon: LucideIcon;
  }>;
};

function getPageVisual(page: CorpPageDefinition): PageVisual {
  if (page.path.includes('/advertising')) {
    return {
      eyebrow: 'Partnership Campaign OS',
      accent: '#f5c766',
      icon: Megaphone,
      figureLabel: 'Campaign Loop',
      figureValue: '4',
      figureCaption: '목표, 채널, 예산, 리포트',
      panels: [
        { label: 'Target', value: '01', body: '캠페인 목적과 고객군을 먼저 고정합니다.', progress: 78, icon: Target },
        { label: 'Channel', value: '02', body: '노출 채널과 제작 범위를 한 화면에서 비교합니다.', progress: 64, icon: Megaphone },
        { label: 'Report', value: '03', body: '성과 리포트를 재사용 가능한 구조로 정리합니다.', progress: 86, icon: BarChart3 },
      ],
    };
  }

  if (page.path.includes('/investment')) {
    return {
      eyebrow: 'Investor Relations Room',
      accent: '#60a5fa',
      icon: BarChart3,
      figureLabel: 'Deal Stages',
      figureValue: '5',
      figureCaption: '제안, 실사, 협상, 계약, 후속 관리',
      panels: [
        { label: 'IR Pack', value: 'Live', body: '핵심 지표와 서사를 투자 검토 기준으로 묶습니다.', progress: 72, icon: FileText },
        { label: 'Diligence', value: 'Ready', body: '실사 요청 자료와 답변 상태를 분리합니다.', progress: 61, icon: ShieldCheck },
        { label: 'Terms', value: 'Sync', body: '협상 쟁점과 결정 로그를 남깁니다.', progress: 68, icon: Handshake },
      ],
    };
  }

  if (page.path.includes('/careers/apply')) {
    return {
      eyebrow: 'Application Flow',
      accent: '#6ee7b7',
      icon: UserPlus,
      figureLabel: 'Apply Steps',
      figureValue: '3',
      figureCaption: '제출, 검토, 안내',
      panels: [
        { label: 'Submit', value: '01', body: '필수 제출 자료와 선택 자료를 구분합니다.', progress: 68, icon: FileText },
        { label: 'Review', value: '02', body: '검토 상태와 다음 연락 기준을 명확히 합니다.', progress: 76, icon: Clock3 },
        { label: 'Follow-up', value: '03', body: '개인정보와 결과 안내 흐름을 안전하게 유지합니다.', progress: 82, icon: ShieldCheck },
      ],
    };
  }

  return {
    eyebrow: 'Corporate Operations',
    accent: '#6ee7b7',
    icon: Layers3,
    figureLabel: 'Checklist',
    figureValue: String(page.checkpoints.length),
    figureCaption: '핵심 운영 기준',
    panels: [
      { label: 'Clarity', value: 'A', body: '페이지 목적과 사용자 다음 행동을 분리합니다.', progress: 84, icon: Gauge },
      { label: 'Content', value: 'Live', body: '소개 문구와 운영 지표를 같은 맥락으로 유지합니다.', progress: 76, icon: FileText },
      { label: 'Governance', value: 'Safe', body: '관리자 편집과 공개 페이지 품질 기준을 연결합니다.', progress: 70, icon: ShieldCheck },
    ],
  };
}

function getRelatedPages(page: CorpPageDefinition) {
  const sameCategory = CORP_PAGE_DEFINITIONS.filter(
    (candidate) => candidate.category === page.category && candidate.path !== page.path,
  );

  if (sameCategory.length > 0) return sameCategory.slice(0, 4);

  return CORP_PAGE_DEFINITIONS.filter((candidate) => candidate.path !== page.path).slice(0, 4);
}

export function CorpInfoPage({ page }: CorpInfoPageProps) {
  const visual = getPageVisual(page);
  const VisualIcon = visual.icon;
  const relatedPages = getRelatedPages(page);

  return (
    <Page id="content-area" aria-labelledby="corp-info-title" $accent={visual.accent}>
      <PageInner>
        <Hero>
          <HeroCopy>
            <Kicker $accent={visual.accent}>
              <VisualIcon size={16} strokeWidth={2.4} aria-hidden="true" />
              {visual.eyebrow}
            </Kicker>
            <h1 id="corp-info-title">{page.title}</h1>
            <p>{page.description}</p>
            <HeroActions>
              <ActionLink href="/corp" prefetch={false}>
                전체 메뉴
                <Layers3 size={16} strokeWidth={2.4} aria-hidden="true" />
              </ActionLink>
              {relatedPages[0] ? (
                <ActionLink href={relatedPages[0].path} prefetch={false}>
                  다음 섹션
                  <ArrowUpRight size={16} strokeWidth={2.4} aria-hidden="true" />
                </ActionLink>
              ) : null}
            </HeroActions>
          </HeroCopy>

          <SignalPanel $accent={visual.accent}>
            <span>{visual.figureLabel}</span>
            <strong>{visual.figureValue}</strong>
            <p>{visual.figureCaption}</p>
          </SignalPanel>
        </Hero>

        <PanelGrid aria-label={`${page.title} 운영 지표`}>
          {visual.panels.map((panel) => {
            const PanelIcon = panel.icon;
            return (
              <MetricPanel key={panel.label} $accent={visual.accent} $progress={panel.progress}>
                <PanelIcon size={19} strokeWidth={2.4} aria-hidden="true" />
                <span>{panel.label}</span>
                <strong>{panel.value}</strong>
                <p>{panel.body}</p>
                <div aria-hidden="true">
                  <b />
                </div>
              </MetricPanel>
            );
          })}
        </PanelGrid>

        <ContentGrid>
          <CheckpointSection aria-labelledby="corp-checkpoints-title">
            <SectionHead>
              <span>{page.category}</span>
              <h2 id="corp-checkpoints-title">운영 체크포인트</h2>
              <p>페이지가 공개 정보로만 끝나지 않도록 관리 주기, 품질 기준, 다음 행동을 함께 보여줍니다.</p>
            </SectionHead>

            <CheckpointGrid>
              {page.checkpoints.map((point, index) => (
                <CheckpointCard key={point} $accent={visual.accent}>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <CheckCircle2 size={19} strokeWidth={2.5} aria-hidden="true" />
                  <p>{point}</p>
                </CheckpointCard>
              ))}
            </CheckpointGrid>
          </CheckpointSection>

          <RolePanel $accent={visual.accent} aria-label={`${page.title} 페이지 역할`}>
            <span>Page Role</span>
            <strong>{page.menuLabel}</strong>
            <p>
              이 페이지는 방문자가 필요한 정보를 빠르게 판단하고, 관리자에게는 업데이트 기준을 남기는
              운영 단위입니다.
            </p>
            <small>{page.path}</small>
          </RolePanel>
        </ContentGrid>

        <RelatedSection aria-labelledby="corp-related-title">
          <SectionHead>
            <span>Next Routes</span>
            <h2 id="corp-related-title">관련 메뉴</h2>
          </SectionHead>
          <RelatedGrid>
            {relatedPages.map((relatedPage) => (
              <RelatedLink
                key={relatedPage.path}
                href={relatedPage.path}
                prefetch={false}
                $accent={visual.accent}
              >
                <span>{relatedPage.category}</span>
                <strong>{relatedPage.menuLabel}</strong>
                <p>{relatedPage.description}</p>
                <ArrowUpRight size={17} strokeWidth={2.4} aria-hidden="true" />
              </RelatedLink>
            ))}
          </RelatedGrid>
        </RelatedSection>
      </PageInner>
    </Page>
  );
}

const Page = styled.main<{ $accent: string }>`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: clamp(18px, 3vw, 34px);
  color: #edf6ff;
  background:
    radial-gradient(circle at 18% 10%, ${(props) => `${props.$accent}1f`}, transparent 28%),
    radial-gradient(circle at 84% 16%, rgba(96, 165, 250, 0.14), transparent 30%),
    linear-gradient(135deg, #06090f, #0c111c 54%, #080a0f);

  &,
  * {
    letter-spacing: 0;
  }
`;

const PageInner = styled.div`
  width: min(1180px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 18px;
`;

const Hero = styled.section`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
  gap: 18px;
  align-items: stretch;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
  padding: clamp(28px, 5vw, 50px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.105), rgba(255, 255, 255, 0.035)),
    rgba(255, 255, 255, 0.04);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.32);

  h1 {
    margin: 18px 0 0;
    color: #ffffff;
    font-size: clamp(2.35rem, 5vw, 5rem);
    line-height: 1;
    font-weight: 950;
    word-break: keep-all;
  }

  p {
    max-width: 760px;
    margin: 18px 0 0;
    color: rgba(237, 246, 255, 0.7);
    font-size: 1rem;
    line-height: 1.74;
    word-break: keep-all;
  }
`;

const Kicker = styled.span<{ $accent: string }>`
  width: fit-content;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid ${(props) => `${props.$accent}48`};
  border-radius: 999px;
  color: ${(props) => props.$accent};
  background: ${(props) => `${props.$accent}12`};
  font-size: 0.76rem;
  font-weight: 950;
  text-transform: uppercase;
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
`;

const ActionLink = styled(IntentPrefetchLink).attrs({ intentPrefetch: true })`
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #edf6ff;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.84rem;
  font-weight: 950;
  text-decoration: none;
  transition: transform 0.18s ease, background 0.18s ease;

  &:hover,
  &:focus-visible {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.09);
    outline: none;
  }
`;

const SignalPanel = styled.aside<{ $accent: string }>`
  min-width: 0;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 24px;
  border: 1px solid ${(props) => `${props.$accent}3d`};
  border-radius: 8px;
  background:
    linear-gradient(180deg, ${(props) => `${props.$accent}18`}, rgba(255, 255, 255, 0.045)),
    rgba(255, 255, 255, 0.04);

  span {
    color: rgba(237, 246, 255, 0.58);
    font-size: 0.76rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    margin-top: 10px;
    color: #ffffff;
    font-size: 4.4rem;
    line-height: 0.92;
    font-weight: 950;
  }

  p {
    margin: 14px 0 0;
    color: rgba(237, 246, 255, 0.66);
    line-height: 1.54;
  }
`;

const PanelGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const MetricPanel = styled.article<{ $accent: string; $progress: number }>`
  min-width: 0;
  min-height: 180px;
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 18px;
  border: 1px solid ${(props) => `${props.$accent}2f`};
  border-radius: 8px;
  background:
    linear-gradient(145deg, ${(props) => `${props.$accent}12`}, transparent 58%),
    rgba(255, 255, 255, 0.052);

  svg,
  span {
    color: ${(props) => props.$accent};
  }

  span {
    font-size: 0.76rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    color: #ffffff;
    font-size: 1.72rem;
    font-weight: 950;
  }

  p {
    margin: 0;
    color: rgba(237, 246, 255, 0.66);
    line-height: 1.55;
    word-break: keep-all;
  }

  div {
    height: 7px;
    margin-top: auto;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  b {
    display: block;
    width: ${(props) => props.$progress}%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, ${(props) => props.$accent}, #60a5fa);
  }
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
  gap: 18px;
  align-items: stretch;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const CheckpointSection = styled.section`
  min-width: 0;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.052);

  @media (max-width: 640px) {
    padding: 18px;
  }
`;

const SectionHead = styled.header`
  min-width: 0;

  span {
    color: rgba(237, 246, 255, 0.48);
    font-size: 0.76rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  h2 {
    margin: 8px 0 0;
    color: #ffffff;
    font-size: clamp(1.35rem, 2.4vw, 2rem);
    line-height: 1.14;
    font-weight: 950;
  }

  p {
    max-width: 720px;
    margin: 10px 0 0;
    color: rgba(237, 246, 255, 0.64);
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const CheckpointGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
  }
`;

const CheckpointCard = styled.article<{ $accent: string }>`
  min-width: 0;
  min-height: 170px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px 12px;
  align-content: start;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);

  b {
    color: rgba(237, 246, 255, 0.4);
    font-size: 0.8rem;
  }

  svg {
    color: ${(props) => props.$accent};
  }

  p {
    grid-column: 1 / -1;
    margin: 4px 0 0;
    color: rgba(237, 246, 255, 0.72);
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const RolePanel = styled.aside<{ $accent: string }>`
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 24px;
  border: 1px solid ${(props) => `${props.$accent}35`};
  border-radius: 8px;
  background:
    linear-gradient(145deg, ${(props) => `${props.$accent}12`}, transparent 60%),
    rgba(255, 255, 255, 0.055);

  span {
    color: ${(props) => props.$accent};
    font-size: 0.74rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    color: #ffffff;
    font-size: 1.72rem;
    line-height: 1.1;
    font-weight: 950;
    word-break: keep-all;
  }

  p,
  small {
    margin: 0;
    color: rgba(237, 246, 255, 0.64);
    line-height: 1.62;
    word-break: keep-all;
  }

  small {
    padding-top: 12px;
    color: rgba(237, 246, 255, 0.42);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    word-break: break-all;
  }
`;

const RelatedSection = styled.section`
  display: grid;
  gap: 14px;
  padding-bottom: 44px;
`;

const RelatedGrid = styled.div`
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

const RelatedLink = styled(IntentPrefetchLink).attrs({ intentPrefetch: true })<{ $accent: string }>`
  position: relative;
  min-width: 0;
  min-height: 168px;
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  color: #edf6ff;
  background: rgba(255, 255, 255, 0.052);
  text-decoration: none;
  transition: transform 0.18s ease, border-color 0.18s ease;

  span {
    color: ${(props) => props.$accent};
    font-size: 0.72rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 1.04rem;
    font-weight: 950;
  }

  p {
    margin: 0;
    color: rgba(237, 246, 255, 0.62);
    font-size: 0.82rem;
    line-height: 1.52;
    word-break: keep-all;
  }

  svg {
    position: absolute;
    right: 16px;
    bottom: 16px;
    color: ${(props) => props.$accent};
  }

  &:hover,
  &:focus-visible {
    transform: translateY(-2px);
    border-color: ${(props) => `${props.$accent}55`};
    outline: none;
  }
`;
