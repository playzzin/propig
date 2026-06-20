'use client';

import {
  CheckCircle2,
  CircuitBoard,
  HeartHandshake,
  Landmark,
  Layers3,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import type { CorpPageDefinition } from '@/constants/corpPages';
import { BusinessPartnershipExperience } from './BusinessPartnershipExperience';
import { CareersJobsExperience } from './CareersJobsExperience';
import { SponsorshipExperience } from './SponsorshipExperience';

interface CorpInfoPageProps {
  page: CorpPageDefinition;
}

interface DetailPanel {
  title: string;
  body: string;
  meta: string;
}

interface PageVisual {
  eyebrow: string;
  lead: string;
  figureLabel: string;
  figureValue: string;
  figureCaption: string;
  accent: string;
  icon: LucideIcon;
  panels: DetailPanel[];
}

const COMPANY_PAGE_VISUALS: Record<string, PageVisual> = {
  '/corp/company/technology': {
    eyebrow: 'TECH OPERATING SYSTEM',
    lead: '기술 이름을 나열하기보다 데이터, 자동화, 운영 안정성이 실제 업무에서 어떻게 연결되는지 보여주는 페이지입니다.',
    figureLabel: 'Core Layers',
    figureValue: '3',
    figureCaption: '데이터 / 자동화 / 운영 기준',
    accent: '#60a5fa',
    icon: CircuitBoard,
    panels: [
      { title: '데이터 흐름', body: '수집과 분석 기준을 먼저 정리해 기술 설명이 실제 의사결정으로 이어지게 합니다.', meta: 'Input to insight' },
      { title: '자동화 범위', body: '반복 업무를 줄이는 지점과 사람이 판단해야 하는 지점을 분리합니다.', meta: 'Human in control' },
      { title: '운영 안정성', body: '배포, 보안, 장애 대응 기준을 함께 보여 기술 신뢰도를 높입니다.', meta: 'Reliable system' },
    ],
  },
  '/corp/company/social-contribution': {
    eyebrow: 'SOCIAL IMPACT',
    lead: '사회공헌을 이벤트 기록이 아니라 참여 방식, 실적, 공개 가능한 지표로 관리하는 페이지입니다.',
    figureLabel: 'Review Cycle',
    figureValue: 'Q',
    figureCaption: '분기 단위 활동 점검',
    accent: '#fb7185',
    icon: HeartHandshake,
    panels: [
      { title: '활동 기준', body: '후원, 봉사, ESG 활동이 어떤 원칙으로 선택되는지 기준을 먼저 보여줍니다.', meta: 'Clear criteria' },
      { title: '참여 구조', body: '내부 구성원이 어떻게 참여하고 기록하는지 운영 흐름을 정리합니다.', meta: 'Team participation' },
      { title: '공개 지표', body: '외부에 공개 가능한 성과와 내부 관리 지표를 구분해 신뢰도를 높입니다.', meta: 'Open metric' },
    ],
  },
};

const DEFAULT_VISUAL: PageVisual = {
  eyebrow: 'CORPORATE OPERATIONS',
  lead: '운영 기준, 책임 범위, 업데이트 주기를 한 화면에서 확인할 수 있도록 구성한 관리 페이지입니다.',
  figureLabel: 'Checklist',
  figureValue: '3',
  figureCaption: '핵심 운영 항목',
  accent: '#10b981',
  icon: Layers3,
  panels: [
    { title: '운영 기준', body: '페이지의 핵심 정보를 일관된 기준으로 유지합니다.', meta: 'Standard' },
    { title: '업데이트', body: '변경이 필요한 항목을 주기적으로 점검합니다.', meta: 'Refresh' },
    { title: '활용 범위', body: '내부 관리와 외부 소개에 모두 활용 가능한 구조를 유지합니다.', meta: 'Reusable' },
  ],
};

function getPageVisual(page: CorpPageDefinition) {
  return COMPANY_PAGE_VISUALS[page.path] ?? DEFAULT_VISUAL;
}

export function CorpInfoPage({ page }: CorpInfoPageProps) {
  if (page.path === '/corp/partnership/business') {
    return <BusinessPartnershipExperience page={page} />;
  }

  if (page.path === '/corp/careers/jobs') {
    return <CareersJobsExperience page={page} />;
  }

  if (page.path === '/corp/partnership/sponsorship') {
    return <SponsorshipExperience page={page} />;
  }

  const visual = getPageVisual(page);
  const VisualIcon = visual.icon;

  return (
    <Page id="content-area" aria-labelledby="corp-info-title" $accent={visual.accent}>
      <PageInner>
        <Hero>
          <HeroCopy>
            <Kicker $accent={visual.accent}>{visual.eyebrow}</Kicker>
            <h1 id="corp-info-title">{page.title}</h1>
            <p>{visual.lead}</p>
          </HeroCopy>

          <SignalPanel $accent={visual.accent}>
            <IconFrame $accent={visual.accent}>
              <VisualIcon size={30} strokeWidth={2.2} aria-hidden="true" />
            </IconFrame>
            <span>{visual.figureLabel}</span>
            <strong>{visual.figureValue}</strong>
            <small>{visual.figureCaption}</small>
          </SignalPanel>
        </Hero>

        <ContentGrid>
          <CheckpointSection aria-labelledby="corp-checkpoints-title">
            <SectionHeader>
              <span>{page.category}</span>
              <h2 id="corp-checkpoints-title">운영 체크포인트</h2>
              <p>{page.description}</p>
            </SectionHeader>

            <CheckpointGrid>
              {page.checkpoints.map((point, index) => (
                <CheckpointCard key={point} $accent={visual.accent}>
                  <CardNumber>{String(index + 1).padStart(2, '0')}</CardNumber>
                  <CheckCircle2 size={19} strokeWidth={2.5} aria-hidden="true" />
                  <p>{point}</p>
                </CheckpointCard>
              ))}
            </CheckpointGrid>
          </CheckpointSection>

          <FocusPanel $accent={visual.accent} aria-label={`${page.title} 운영 요약`}>
            <Landmark size={24} strokeWidth={2.2} aria-hidden="true" />
            <span>PAGE ROLE</span>
            <strong>{page.menuLabel}</strong>
            <p>{page.description}</p>
          </FocusPanel>
        </ContentGrid>

        <DetailGrid aria-label={`${page.title} 상세 운영 구조`}>
          {visual.panels.map((panel) => (
            <DetailCard key={panel.title} $accent={visual.accent}>
              <small>{panel.meta}</small>
              <h3>{panel.title}</h3>
              <p>{panel.body}</p>
            </DetailCard>
          ))}
        </DetailGrid>
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
  padding: 24px;
  color: #edf8f4;
  background:
    linear-gradient(135deg, rgba(6, 17, 15, 0.98) 0%, rgba(13, 21, 31, 0.98) 54%, rgba(7, 9, 13, 1) 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 96px);

  @media (max-width: 720px) {
    padding: 16px;
  }
`;

const PageInner = styled.div`
  width: min(100%, 1240px);
  margin: 0 auto;
  display: grid;
  gap: 18px;
`;

const Hero = styled.section`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 330px);
  gap: 18px;
  align-items: stretch;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
  padding: 34px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.035)),
    linear-gradient(180deg, rgba(6, 17, 15, 0.32), rgba(6, 17, 15, 0.08));

  h1 {
    margin: 14px 0 0;
    color: #ffffff;
    font-size: 2.35rem;
    line-height: 1.12;
    letter-spacing: 0;
    font-weight: 950;
    overflow-wrap: anywhere;
  }

  p {
    max-width: 760px;
    margin: 16px 0 0;
    color: rgba(237, 248, 244, 0.72);
    font-size: 1rem;
    line-height: 1.72;
    word-break: keep-all;
  }

  @media (max-width: 720px) {
    padding: 24px;

    h1 {
      font-size: 1.95rem;
    }
  }
`;

const Kicker = styled.span<{ $accent: string }>`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid ${(props) => `${props.$accent}55`};
  border-radius: 999px;
  color: ${(props) => props.$accent};
  background: ${(props) => `${props.$accent}14`};
  font-size: 0.76rem;
  font-weight: 950;
  letter-spacing: 0;
`;

const SignalPanel = styled.aside<{ $accent: string }>`
  min-width: 0;
  min-height: 220px;
  padding: 24px;
  border: 1px solid ${(props) => `${props.$accent}36`};
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background:
    linear-gradient(180deg, ${(props) => `${props.$accent}20`}, rgba(255, 255, 255, 0.045)),
    rgba(6, 17, 15, 0.42);

  span {
    margin-top: 28px;
    color: rgba(237, 248, 244, 0.66);
    font-size: 0.78rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  strong {
    margin-top: 8px;
    color: #ffffff;
    font-size: 3.2rem;
    line-height: 0.9;
    font-weight: 950;
    letter-spacing: 0;
  }

  small {
    margin-top: 12px;
    color: rgba(237, 248, 244, 0.68);
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const IconFrame = styled.div<{ $accent: string }>`
  width: 58px;
  height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: ${(props) => props.$accent};
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid ${(props) => `${props.$accent}44`};
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
  padding: 26px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.052);

  @media (max-width: 720px) {
    padding: 20px;
  }
`;

const SectionHeader = styled.div`
  min-width: 0;

  span {
    color: rgba(237, 248, 244, 0.54);
    font-size: 0.78rem;
    font-weight: 900;
  }

  h2 {
    margin: 8px 0 0;
    color: #ffffff;
    font-size: 1.45rem;
    line-height: 1.2;
    letter-spacing: 0;
  }

  p {
    max-width: 760px;
    margin: 10px 0 0;
    color: rgba(237, 248, 244, 0.66);
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const CheckpointGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
  }
`;

const CheckpointCard = styled.article<{ $accent: string }>`
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px 12px;
  align-content: start;
  min-height: 172px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: rgba(6, 17, 15, 0.36);

  svg {
    color: ${(props) => props.$accent};
  }

  p {
    grid-column: 1 / -1;
    margin: 6px 0 0;
    color: rgba(237, 248, 244, 0.78);
    line-height: 1.68;
    word-break: keep-all;
  }
`;

const CardNumber = styled.span`
  color: rgba(237, 248, 244, 0.42);
  font-size: 0.8rem;
  font-weight: 950;
`;

const FocusPanel = styled.aside<{ $accent: string }>`
  min-width: 0;
  padding: 24px;
  border: 1px solid ${(props) => `${props.$accent}33`};
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.058);

  svg {
    color: ${(props) => props.$accent};
  }

  span {
    display: block;
    margin-top: 20px;
    color: rgba(237, 248, 244, 0.52);
    font-size: 0.74rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  strong {
    display: block;
    margin-top: 8px;
    color: #ffffff;
    font-size: 1.7rem;
    line-height: 1.14;
    font-weight: 950;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }

  p {
    margin: 14px 0 0;
    color: rgba(237, 248, 244, 0.68);
    line-height: 1.7;
    word-break: keep-all;
  }
`;

const DetailGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const DetailCard = styled.article<{ $accent: string }>`
  min-width: 0;
  min-height: 190px;
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background:
    linear-gradient(180deg, ${(props) => `${props.$accent}12`}, rgba(255, 255, 255, 0.035)),
    rgba(6, 17, 15, 0.32);

  small {
    color: ${(props) => props.$accent};
    font-size: 0.76rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  h3 {
    margin: 14px 0 0;
    color: #ffffff;
    font-size: 1.08rem;
    line-height: 1.25;
    letter-spacing: 0;
  }

  p {
    margin: 12px 0 0;
    color: rgba(237, 248, 244, 0.68);
    line-height: 1.65;
    word-break: keep-all;
  }
`;
