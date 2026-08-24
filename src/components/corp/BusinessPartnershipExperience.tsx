'use client';

import { useState, type KeyboardEvent } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CircleDot,
  ClipboardCheck,
  Cpu,
  Handshake,
  Mail,
  Megaphone,
  Network,
  Route,
  ShieldCheck,
  Store,
  Target,
  Timer,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import type { CorpPageDefinition } from '@/constants/corpPages';

interface BusinessPartnershipExperienceProps {
  page: CorpPageDefinition;
}

interface PartnershipTrack {
  id: string;
  eyebrow: string;
  shortLabel: string;
  title: string;
  summary: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  accent: string;
  icon: LucideIcon;
  figureLabel: string;
  figureValue: string;
  caption: string;
  fit: string;
  steps: string[];
  outcomes: string[];
}

const PARTNERSHIP_TRACKS: PartnershipTrack[] = [
  {
    id: 'market-entry',
    eyebrow: '01 · MARKET ENTRY',
    shortLabel: '시장 확장',
    title: '시장 진입 제휴',
    summary: '새로운 고객군을 작게 검증하고, 확장 가능한 영업 구조를 함께 만듭니다.',
    description:
      '지역, 업종, 커뮤니티처럼 이미 신뢰가 형성된 접점을 가진 파트너와 파일럿을 설계합니다. 제안서에서 끝나는 제휴가 아니라 고객 반응, 운영 비용, 반복 가능성을 함께 확인합니다.',
    imageUrl: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=86',
    imageAlt: '회의실에서 시장 진입 제휴 방향을 논의하는 비즈니스 팀',
    accent: '#5eead4',
    icon: Store,
    figureLabel: 'PILOT WINDOW',
    figureValue: '4–8주',
    caption: '작은 범위에서 검증한 뒤 확장 조건을 정합니다.',
    fit: '지역·업종 고객 접점과 유통 채널을 보유한 파트너',
    steps: ['공동 타깃 정의', '파일럿 운영 범위 확정', '성과 지표와 확장 기준 합의'],
    outcomes: ['신규 고객 접점 확보', '지역·업종별 실증 데이터', '파트너 공동 영업 자료'],
  },
  {
    id: 'platform-sync',
    eyebrow: '02 · PLATFORM SYNC',
    shortLabel: '기술 연결',
    title: '플랫폼 연동 제휴',
    summary: '서비스와 데이터 흐름을 연결해 양쪽 사용자의 업무 경험을 확장합니다.',
    description:
      'API, 데이터 피드, 관리자 워크플로우를 기준으로 실제 연동 가능한 지점을 찾습니다. 기술 검토와 운영 정책을 함께 다뤄 출시 이후에도 유지 가능한 제휴 구조를 만듭니다.',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=86',
    imageAlt: '플랫폼 연동과 자동화 개발을 상징하는 회로와 기술 장비',
    accent: '#7dd3fc',
    icon: Cpu,
    figureLabel: 'INTEGRATION',
    figureValue: 'API',
    caption: '데이터 흐름과 권한 정책을 먼저 맞춥니다.',
    fit: '고객 업무를 연결할 서비스·데이터·API를 운영하는 파트너',
    steps: ['연동 대상 기능 선정', '데이터·권한 정책 검토', '테스트 환경 구축과 단계 배포'],
    outcomes: ['공동 기능 출시', '중복 업무 자동화', '운영 리포트 일원화'],
  },
  {
    id: 'joint-operation',
    eyebrow: '03 · JOINT OPERATION',
    shortLabel: '공동 운영',
    title: '공동사업 운영 제휴',
    summary: '기획부터 정산까지 역할을 나누어 하나의 사업 단위로 함께 실행합니다.',
    description:
      '캠페인성 협업보다 긴 호흡의 운영 모델을 만들 때 적합합니다. 각자의 강점과 책임 범위를 명확히 나누고 일정과 정산 기준까지 초기에 고정해 실행 속도를 높입니다.',
    imageUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=86',
    imageAlt: '공동사업 운영을 위해 여러 사람이 업무를 조율하는 사무실',
    accent: '#f5c766',
    icon: Network,
    figureLabel: 'OPERATING MODEL',
    figureValue: 'R&R',
    caption: '역할, 일정, 정산 구조를 한 번에 설계합니다.',
    fit: '장기 운영 사업과 수익 모델을 함께 만들 역량을 보유한 파트너',
    steps: ['공동 사업안 정리', '역할과 비용 구조 합의', '운영 회의체와 리포트 주기 설정'],
    outcomes: ['공동 브랜드 사업화', '장기 운영 수익 모델', '반복 가능한 실행 매뉴얼'],
  },
  {
    id: 'brand-growth',
    eyebrow: '04 · BRAND GROWTH',
    shortLabel: '브랜드 성장',
    title: '브랜드 성장 제휴',
    summary: '콘텐츠와 채널을 함께 설계해 브랜드의 신뢰와 고객 도달을 넓힙니다.',
    description:
      '단순 노출형 홍보가 아니라 공동 메시지, 캠페인 구조, 고객 전환 흐름까지 함께 설계합니다. 파트너의 채널 자산과 PRO PIG의 제작·운영 역량을 결합해 반복 가능한 성장 프로그램으로 만듭니다.',
    imageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=86',
    imageAlt: '브랜드 성장 제휴 캠페인을 준비하는 현대적인 업무 공간',
    accent: '#fb7185',
    icon: Megaphone,
    figureLabel: 'GROWTH PROGRAM',
    figureValue: 'CO-MKT',
    caption: '공동 메시지와 채널 운영 계획을 함께 설계합니다.',
    fit: '콘텐츠·미디어·커뮤니티 채널을 함께 키울 브랜드 파트너',
    steps: ['공동 메시지와 타깃 정리', '콘텐츠·캠페인 패키지 구성', '채널별 성과 리포트 운영'],
    outcomes: ['브랜드 신뢰도 강화', '공동 캠페인 전환 데이터', '재사용 가능한 콘텐츠 자산'],
  },
];

const PROCESS_STEPS = [
  {
    number: '01',
    title: '제안 접수',
    description: '협업 목적, 보유 자산, 희망 일정과 기대 결과를 확인합니다.',
    icon: ClipboardCheck,
  },
  {
    number: '02',
    title: '적합성 검토',
    description: '고객 가치와 실행 가능성, 역할, 리스크를 함께 검토합니다.',
    icon: Target,
  },
  {
    number: '03',
    title: '파일럿 설계',
    description: '작은 범위의 실행안과 담당자, 일정, 측정 지표를 확정합니다.',
    icon: Route,
  },
  {
    number: '04',
    title: '운영과 확장',
    description: '결과를 리뷰하고 계약·정산·확장 조건을 다음 단계에 반영합니다.',
    icon: ArrowRight,
  },
];

const PROPOSAL_CHECKLIST = [
  '함께 해결하고 싶은 고객 문제와 제휴 목적',
  '파트너가 제공할 수 있는 채널·기술·운영 자산',
  '희망 시작 시점과 성공 여부를 판단할 기준',
];

export function BusinessPartnershipExperience({ page }: BusinessPartnershipExperienceProps) {
  const [activeTrackId, setActiveTrackId] = useState(PARTNERSHIP_TRACKS[0].id);
  const activeTrack = PARTNERSHIP_TRACKS.find((track) => track.id === activeTrackId) ?? PARTNERSHIP_TRACKS[0];
  const ActiveIcon = activeTrack.icon;

  const activateTrack = (trackId: string) => {
    setActiveTrackId(trackId);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % PARTNERSHIP_TRACKS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + PARTNERSHIP_TRACKS.length) % PARTNERSHIP_TRACKS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = PARTNERSHIP_TRACKS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTrack = PARTNERSHIP_TRACKS[nextIndex];
    activateTrack(nextTrack.id);
    document.getElementById(`partnership-tab-${nextTrack.id}`)?.focus();
  };

  return (
    <Page id="content-area" aria-labelledby="business-partnership-title" data-business-partnership-page>
      <PageInner>
        <Hero>
          <HeroCopy>
            <Kicker>
              <Handshake size={16} strokeWidth={2.3} aria-hidden="true" />
              PRO PIG BUSINESS PARTNERSHIP
            </Kicker>

            <HeroTitle id="business-partnership-title">
              사업의 다음 장을,
              <em>함께 실행합니다.</em>
            </HeroTitle>

            <HeroLead>
              아이디어를 교환하는 데서 멈추지 않습니다. 서로의 접점과 기술, 운영 역량을 연결해 고객에게
              닿는 제휴 모델을 설계하고 작은 실행으로 가능성을 증명합니다.
            </HeroLead>

            <HeroActions>
              <PrimaryAction href="#partnership-types">
                제휴 방식 살펴보기
                <ArrowDownRight size={18} strokeWidth={2.3} aria-hidden="true" />
              </PrimaryAction>
              <SecondaryAction href="#proposal-guide">제안 준비하기</SecondaryAction>
            </HeroActions>

            <HeroFacts aria-label="사업제휴 핵심 원칙">
              <li>
                <CircleDot size={14} aria-hidden="true" />
                4가지 협업 모델
              </li>
              <li>
                <Timer size={14} aria-hidden="true" />
                작은 파일럿부터 시작
              </li>
              <li>
                <ShieldCheck size={14} aria-hidden="true" />
                역할과 지표 선합의
              </li>
            </HeroFacts>
          </HeroCopy>

          <PartnershipBlueprint aria-label="파트너십 실행 구조">
            <BlueprintHeader>
              <span>PARTNERSHIP BLUEPRINT</span>
              <strong>서로의 강점이 고객 가치가 되는 구조</strong>
            </BlueprintHeader>

            <BlueprintFlow>
              <BlueprintNode>
                <Building2 size={21} strokeWidth={2.1} aria-hidden="true" />
                <span>PARTNER</span>
                <strong>접점 · 전문성 · 채널</strong>
              </BlueprintNode>

              <FlowConnector aria-hidden="true">
                <span />
                <Handshake size={18} />
                <span />
              </FlowConnector>

              <BlueprintNode $highlight>
                <UsersRound size={21} strokeWidth={2.1} aria-hidden="true" />
                <span>PRO PIG</span>
                <strong>기획 · 기술 · 운영</strong>
              </BlueprintNode>
            </BlueprintFlow>

            <BlueprintResult>
              <Target size={22} strokeWidth={2.2} aria-hidden="true" />
              <div>
                <span>SHARED OUTCOME</span>
                <strong>측정 가능한 공동 고객 가치</strong>
              </div>
              <ArrowRight size={20} strokeWidth={2.2} aria-hidden="true" />
            </BlueprintResult>

            <BlueprintPrinciples>
              <div>
                <span>01</span>
                <strong>고객 문제부터</strong>
              </div>
              <div>
                <span>02</span>
                <strong>작게 검증</strong>
              </div>
              <div>
                <span>03</span>
                <strong>확장 기준 합의</strong>
              </div>
            </BlueprintPrinciples>
          </PartnershipBlueprint>
        </Hero>

        <ContentSection id="partnership-types" aria-labelledby="partnership-types-title">
          <SectionHeading>
            <SectionIndex>01 / PARTNERSHIP MODELS</SectionIndex>
            <SectionCopy>
              <h2 id="partnership-types-title">목적에 맞는 협업 방식을 선택하세요.</h2>
              <p>
                시장 확장부터 기술 연동, 공동 운영, 브랜드 성장까지 필요한 실행 구조에 따라 제휴 모델을
                살펴볼 수 있습니다.
              </p>
            </SectionCopy>
          </SectionHeading>

          <TrackTabs role="tablist" aria-label={`${page.title} 유형`} data-partnership-tabs>
            {PARTNERSHIP_TRACKS.map((track, index) => {
              const isActive = track.id === activeTrack.id;
              const TrackIcon = track.icon;

              return (
                <TrackTab
                  key={track.id}
                  id={`partnership-tab-${track.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`partnership-panel-${track.id}`}
                  tabIndex={isActive ? 0 : -1}
                  $active={isActive}
                  $accent={track.accent}
                  onClick={() => activateTrack(track.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  <TrackTabTop>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <TrackIcon size={20} strokeWidth={2.2} aria-hidden="true" />
                  </TrackTabTop>
                  <strong>{track.shortLabel}</strong>
                  <small>{track.title}</small>
                </TrackTab>
              );
            })}
          </TrackTabs>

          <TrackShowcase
            key={activeTrack.id}
            id={`partnership-panel-${activeTrack.id}`}
            role="tabpanel"
            tabIndex={0}
            aria-labelledby={`partnership-tab-${activeTrack.id}`}
            $accent={activeTrack.accent}
          >
            <TrackMedia>
              <ImageFallback aria-hidden="true">
                <ActiveIcon size={44} strokeWidth={1.7} />
                <span>PRO PIG PARTNERSHIP</span>
                <strong>{activeTrack.shortLabel}</strong>
              </ImageFallback>
              <PartnershipImage
                src={activeTrack.imageUrl}
                alt={activeTrack.imageAlt}
                width={1600}
                height={1067}
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
              <ImageShade />
              <MediaHeader>
                <TrackIconBadge $accent={activeTrack.accent}>
                  <ActiveIcon size={22} strokeWidth={2.25} aria-hidden="true" />
                </TrackIconBadge>
                <span>{activeTrack.eyebrow}</span>
              </MediaHeader>
              <MediaCaption>
                <span>{activeTrack.figureLabel}</span>
                <strong>{activeTrack.figureValue}</strong>
                <p>{activeTrack.caption}</p>
              </MediaCaption>
            </TrackMedia>

            <TrackNarrative>
              <NarrativeHeading>
                <span>{activeTrack.shortLabel}</span>
                <h3>{activeTrack.title}</h3>
                <strong>{activeTrack.summary}</strong>
              </NarrativeHeading>

              <TrackDescription>{activeTrack.description}</TrackDescription>

              <FitStatement>
                <Target size={18} strokeWidth={2.25} aria-hidden="true" />
                <div>
                  <span>이런 파트너와 잘 맞습니다</span>
                  <strong>{activeTrack.fit}</strong>
                </div>
              </FitStatement>

              <DetailColumns>
                <DetailBlock>
                  <DetailLabel>
                    <Route size={16} strokeWidth={2.3} aria-hidden="true" />
                    진행 흐름
                  </DetailLabel>
                  <ul>
                    {activeTrack.steps.map((step) => (
                      <li key={step}>
                        <BadgeCheck size={16} strokeWidth={2.4} aria-hidden="true" />
                        {step}
                      </li>
                    ))}
                  </ul>
                </DetailBlock>

                <DetailBlock>
                  <DetailLabel>
                    <ShieldCheck size={16} strokeWidth={2.3} aria-hidden="true" />
                    기대 성과
                  </DetailLabel>
                  <ul>
                    {activeTrack.outcomes.map((outcome) => (
                      <li key={outcome}>
                        <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
                        {outcome}
                      </li>
                    ))}
                  </ul>
                </DetailBlock>
              </DetailColumns>
            </TrackNarrative>
          </TrackShowcase>
        </ContentSection>

        <ContentSection aria-labelledby="partnership-process-title">
          <SectionHeading>
            <SectionIndex>02 / HOW WE WORK</SectionIndex>
            <SectionCopy>
              <h2 id="partnership-process-title">제안이 실행으로 이어지는 4단계</h2>
              <p>처음부터 큰 계약을 전제로 하지 않습니다. 필요한 검토를 마친 뒤 측정 가능한 범위로 시작합니다.</p>
            </SectionCopy>
          </SectionHeading>

          <ProcessRail>
            {PROCESS_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <ProcessStep key={step.number}>
                  <ProcessMarker>
                    <span>{step.number}</span>
                    <StepIcon size={20} strokeWidth={2.2} aria-hidden="true" />
                  </ProcessMarker>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  {index < PROCESS_STEPS.length - 1 ? <ProcessLine aria-hidden="true" /> : null}
                </ProcessStep>
              );
            })}
          </ProcessRail>
        </ContentSection>

        <ProposalPanel id="proposal-guide" aria-labelledby="proposal-guide-title" data-proposal-guide>
          <ProposalCopy>
            <SectionIndex>03 / START A CONVERSATION</SectionIndex>
            <h2 id="proposal-guide-title">좋은 제안은 목적과 역할, 기준이 분명합니다.</h2>
            <p>
              완성된 기획서가 없어도 괜찮습니다. 아래 세 가지 내용을 알려주시면 가장 적합한 제휴 모델부터
              함께 정리하겠습니다.
            </p>

            <ProposalActionRow>
              <PrimaryAction href="mailto:support@propig.com?subject=PRO%20PIG%20사업제휴%20문의">
                제휴 제안 보내기
                <Mail size={18} strokeWidth={2.3} aria-hidden="true" />
              </PrimaryAction>
              <ActionNote>support@propig.com</ActionNote>
            </ProposalActionRow>
          </ProposalCopy>

          <ProposalChecklist>
            <ChecklistHeader>
              <ClipboardCheck size={21} strokeWidth={2.2} aria-hidden="true" />
              <div>
                <span>PROPOSAL CHECKLIST</span>
                <strong>제안 전에 준비하면 좋은 내용</strong>
              </div>
            </ChecklistHeader>
            <ol>
              {PROPOSAL_CHECKLIST.map((item, index) => (
                <li key={item}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <p>{item}</p>
                  <Check size={17} strokeWidth={2.4} aria-hidden="true" />
                </li>
              ))}
            </ol>
          </ProposalChecklist>
        </ProposalPanel>

        <ClosingStatement>
          <Handshake size={22} strokeWidth={2.1} aria-hidden="true" />
          <p>제휴는 계약서보다 먼저, 함께 움직일 수 있는 운영 방식에서 시작됩니다.</p>
          <strong>BUILD TOGETHER.</strong>
        </ClosingStatement>
      </PageInner>
    </Page>
  );
}

const Page = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  color-scheme: dark;
  color: #f8fafc;
  background-color: #090d14;

  @media (prefers-reduced-motion: reduce) {
    scroll-behavior: auto;
  }
`;

const PageInner = styled.div`
  width: min(100%, 1320px);
  margin: 0 auto;
  padding: 34px 32px 56px;

  @media (max-width: 720px) {
    padding:
      22px max(16px, env(safe-area-inset-right))
      max(36px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(390px, 0.94fr);
  gap: 54px;
  align-items: center;
  min-height: min(680px, calc(100vh - 132px));
  padding: 42px 0 64px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.12);

  @media (max-width: 1080px) {
    gap: 32px;
  }

  @media (max-width: 940px) {
    grid-template-columns: 1fr;
    min-height: auto;
    padding: 24px 0 48px;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
`;

const Kicker = styled.span`
  display: inline-flex;
  width: fit-content;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid rgba(125, 211, 252, 0.28);
  border-radius: 999px;
  align-items: center;
  gap: 8px;
  color: #bae6fd;
  background-color: rgba(125, 211, 252, 0.08);
  font-size: 0.72rem;
  font-weight: 850;
`;

const HeroTitle = styled.h1`
  max-width: 760px;
  margin: 30px 0 0;
  color: #f8fafc;
  font-size: 4rem;
  line-height: 1.08;
  font-weight: 900;
  text-wrap: balance;
  word-break: keep-all;

  em {
    display: block;
    margin-top: 8px;
    color: #7dd3fc;
    font-style: normal;
  }

  @media (max-width: 1120px) {
    font-size: 3.35rem;
  }

  @media (max-width: 620px) {
    margin-top: 24px;
    font-size: 2.45rem;
    line-height: 1.14;
  }
`;

const HeroLead = styled.p`
  max-width: 720px;
  margin: 24px 0 0;
  color: rgba(226, 232, 240, 0.72);
  font-size: 1.05rem;
  line-height: 1.82;
  word-break: keep-all;

  @media (max-width: 620px) {
    font-size: 0.96rem;
    line-height: 1.72;
  }
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
`;

const PrimaryAction = styled.a`
  min-height: 48px;
  padding: 0 18px;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #09111b;
  background-color: #f8fafc;
  font-size: 0.9rem;
  font-weight: 900;
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(125, 211, 252, 0.16);
  transition: background-color 160ms ease, transform 160ms ease, border-color 160ms ease;

  &:hover {
    border-color: #bae6fd;
    background-color: #bae6fd;
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 0.01ms;
  }
`;

const SecondaryAction = styled.a`
  min-height: 48px;
  padding: 0 18px;
  border: 1px solid rgba(226, 232, 240, 0.16);
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #e2e8f0;
  background-color: rgba(255, 255, 255, 0.045);
  font-size: 0.9rem;
  font-weight: 850;
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(125, 211, 252, 0.16);
  transition: background-color 160ms ease, border-color 160ms ease;

  &:hover {
    border-color: rgba(125, 211, 252, 0.38);
    background-color: rgba(125, 211, 252, 0.09);
  }

  &:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 0.01ms;
  }
`;

const HeroFacts = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 28px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: rgba(203, 213, 225, 0.62);
    font-size: 0.78rem;
    font-weight: 750;
  }

  svg {
    color: #7dd3fc;
  }
`;

const PartnershipBlueprint = styled.aside`
  position: relative;
  min-width: 0;
  padding: 22px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  border-radius: 16px;
  background-color: #0e151f;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.28);

  &::before {
    content: '';
    position: absolute;
    inset: 10px;
    border: 1px solid rgba(226, 232, 240, 0.05);
    border-radius: 11px;
    pointer-events: none;
  }

  @media (max-width: 520px) {
    padding: 16px;
    border-radius: 12px;
  }
`;

const BlueprintHeader = styled.div`
  position: relative;
  display: grid;
  gap: 7px;
  padding: 4px 4px 20px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.1);

  span {
    color: #7dd3fc;
    font-size: 0.68rem;
    font-weight: 900;
  }

  strong {
    color: #f8fafc;
    font-size: 1.02rem;
    line-height: 1.4;
    font-weight: 850;
    word-break: keep-all;
  }
`;

const BlueprintFlow = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 20px 0 14px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const BlueprintNode = styled.div<{ $highlight?: boolean }>`
  min-width: 0;
  min-height: 132px;
  padding: 17px;
  border: 1px solid ${(props) => (props.$highlight ? 'rgba(125, 211, 252, 0.36)' : 'rgba(226, 232, 240, 0.11)')};
  border-radius: 11px;
  display: grid;
  align-content: center;
  gap: 10px;
  color: ${(props) => (props.$highlight ? '#7dd3fc' : '#cbd5e1')};
  background-color: ${(props) => (props.$highlight ? 'rgba(125, 211, 252, 0.08)' : 'rgba(255, 255, 255, 0.035)')};

  span {
    color: rgba(203, 213, 225, 0.52);
    font-size: 0.66rem;
    font-weight: 900;
  }

  strong {
    color: #f8fafc;
    font-size: 0.9rem;
    line-height: 1.45;
    font-weight: 850;
    word-break: keep-all;
  }
`;

const FlowConnector = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7dd3fc;

  span {
    width: 13px;
    height: 1px;
    background-color: rgba(125, 211, 252, 0.42);
  }

  svg {
    margin: 0 5px;
  }

  @media (max-width: 520px) {
    min-height: 38px;
    transform: rotate(90deg);
  }
`;

const BlueprintResult = styled.div`
  position: relative;
  min-height: 78px;
  padding: 15px 16px;
  border: 1px solid rgba(94, 234, 212, 0.27);
  border-radius: 11px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 22px;
  gap: 11px;
  align-items: center;
  color: #5eead4;
  background-color: rgba(94, 234, 212, 0.075);

  div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  span {
    color: rgba(153, 246, 228, 0.65);
    font-size: 0.64rem;
    font-weight: 900;
  }

  strong {
    color: #f8fafc;
    font-size: 0.89rem;
    line-height: 1.4;
    font-weight: 850;
    word-break: keep-all;
  }
`;

const BlueprintPrinciples = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;

  div {
    min-width: 0;
    padding: 10px 4px 2px;
    display: grid;
    gap: 4px;
  }

  span {
    color: rgba(125, 211, 252, 0.58);
    font-size: 0.64rem;
    font-weight: 900;
  }

  strong {
    color: rgba(226, 232, 240, 0.7);
    font-size: 0.74rem;
    line-height: 1.4;
    font-weight: 800;
    word-break: keep-all;
  }
`;

const ContentSection = styled.section`
  scroll-margin-top: 24px;
  padding: 72px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.12);

  @media (max-width: 720px) {
    padding: 52px 0;
  }
`;

const SectionHeading = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 0.38fr) minmax(0, 1fr);
  gap: 28px;
  align-items: start;
  margin-bottom: 30px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    gap: 11px;
    margin-bottom: 24px;
  }
`;

const SectionIndex = styled.span`
  color: #7dd3fc;
  font-size: 0.7rem;
  font-weight: 900;
`;

const SectionCopy = styled.div`
  min-width: 0;

  h2 {
    margin: 0;
    color: #f8fafc;
    font-size: 2rem;
    line-height: 1.25;
    font-weight: 900;
    text-wrap: balance;
    word-break: keep-all;
  }

  p {
    max-width: 760px;
    margin: 12px 0 0;
    color: rgba(203, 213, 225, 0.66);
    font-size: 0.94rem;
    line-height: 1.72;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    h2 {
      font-size: 1.55rem;
    }
  }
`;

const TrackTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;

  @media (max-width: 920px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TrackTab = styled.button<{ $active: boolean; $accent: string }>`
  position: relative;
  min-width: 0;
  min-height: 118px;
  padding: 15px 16px;
  overflow: hidden;
  border: 1px solid ${(props) => (props.$active ? `${props.$accent}8c` : 'rgba(226, 232, 240, 0.12)')};
  border-radius: 11px;
  display: grid;
  align-content: start;
  gap: 6px;
  color: ${(props) => (props.$active ? props.$accent : 'rgba(203, 213, 225, 0.6)')};
  background-color: ${(props) => (props.$active ? `${props.$accent}12` : 'rgba(255, 255, 255, 0.035)')};
  text-align: left;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(125, 211, 252, 0.16);
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;

  &::after {
    content: '';
    position: absolute;
    left: 15px;
    right: 15px;
    bottom: 0;
    height: 2px;
    background-color: ${(props) => (props.$active ? props.$accent : 'transparent')};
  }

  &:hover {
    border-color: ${(props) => `${props.$accent}66`};
    background-color: ${(props) => `${props.$accent}0d`};
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid ${(props) => props.$accent};
    outline-offset: 3px;
  }

  > strong {
    margin-top: 4px;
    color: #f8fafc;
    font-size: 0.96rem;
    line-height: 1.35;
    font-weight: 900;
    word-break: keep-all;
  }

  > small {
    color: rgba(203, 213, 225, 0.55);
    font-size: 0.72rem;
    line-height: 1.35;
    font-weight: 750;
    word-break: keep-all;
  }

  @media (max-width: 520px) {
    min-height: 108px;
    padding: 13px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 0.01ms;
  }
`;

const TrackTabTop = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  span {
    font-size: 0.66rem;
    font-weight: 950;
    font-variant-numeric: tabular-nums;
  }
`;

const TrackShowcase = styled.article<{ $accent: string }>`
  min-width: 0;
  border: 1px solid rgba(226, 232, 240, 0.13);
  border-top-color: ${(props) => `${props.$accent}8f`};
  border-radius: 14px;
  display: grid;
  grid-template-columns: minmax(0, 0.94fr) minmax(0, 1.06fr);
  overflow: hidden;
  background-color: #0d131c;
  animation: showcaseReveal 260ms ease both;

  &:focus-visible {
    outline: 2px solid ${(props) => props.$accent};
    outline-offset: 4px;
  }

  @keyframes showcaseReveal {
    from {
      opacity: 0.68;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const TrackMedia = styled.figure`
  position: relative;
  min-width: 0;
  min-height: 570px;
  margin: 0;
  overflow: hidden;
  background-color: #111827;

  @media (max-width: 980px) {
    min-height: 440px;
  }

  @media (max-width: 620px) {
    min-height: 360px;
  }
`;

const ImageFallback = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 9px;
  color: rgba(125, 211, 252, 0.62);
  background-color: #101923;
  text-align: center;

  span {
    margin-top: 4px;
    color: rgba(125, 211, 252, 0.5);
    font-size: 0.66rem;
    font-weight: 900;
  }

  strong {
    color: rgba(248, 250, 252, 0.82);
    font-size: 1rem;
    font-weight: 900;
  }
`;

const PartnershipImage = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  opacity: 1;
  animation: mediaReveal 420ms ease both;

  &[hidden] {
    display: none;
  }

  @keyframes mediaReveal {
    from {
      opacity: 0.7;
      transform: scale(1.02);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ImageShade = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-color: rgba(4, 9, 15, 0.48);
`;

const MediaHeader = styled.div`
  position: absolute;
  top: 22px;
  left: 22px;
  right: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;

  > span {
    color: rgba(248, 250, 252, 0.78);
    font-size: 0.68rem;
    font-weight: 900;
    text-align: right;
  }
`;

const TrackIconBadge = styled.span<{ $accent: string }>`
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  border: 1px solid ${(props) => `${props.$accent}99`};
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #071019;
  background-color: ${(props) => props.$accent};
`;

const MediaCaption = styled.figcaption`
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: 22px;
  padding: 18px;
  border: 1px solid rgba(248, 250, 252, 0.15);
  border-radius: 11px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px 16px;
  align-items: end;
  background-color: rgba(8, 13, 20, 0.84);
  backdrop-filter: blur(12px);

  span {
    color: rgba(203, 213, 225, 0.62);
    font-size: 0.66rem;
    font-weight: 900;
  }

  strong {
    grid-row: 1 / 3;
    grid-column: 2;
    color: #ffffff;
    font-size: 1.72rem;
    line-height: 1;
    font-weight: 950;
    font-variant-numeric: tabular-nums;
  }

  p {
    margin: 0;
    color: rgba(226, 232, 240, 0.76);
    font-size: 0.82rem;
    line-height: 1.5;
    word-break: keep-all;
  }

  @media (max-width: 520px) {
    left: 14px;
    right: 14px;
    bottom: 14px;
    padding: 14px;

    strong {
      font-size: 1.35rem;
    }
  }
`;

const TrackNarrative = styled.div`
  min-width: 0;
  padding: 38px;
  display: flex;
  flex-direction: column;

  @media (max-width: 620px) {
    padding: 24px 18px;
  }
`;

const NarrativeHeading = styled.div`
  display: grid;
  gap: 9px;

  span {
    color: #7dd3fc;
    font-size: 0.7rem;
    font-weight: 900;
  }

  h3 {
    margin: 0;
    color: #f8fafc;
    font-size: 2.05rem;
    line-height: 1.2;
    font-weight: 900;
    text-wrap: balance;
    word-break: keep-all;
  }

  > strong {
    max-width: 620px;
    color: rgba(226, 232, 240, 0.78);
    font-size: 1rem;
    line-height: 1.6;
    font-weight: 800;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    h3 {
      font-size: 1.65rem;
    }
  }
`;

const TrackDescription = styled.p`
  margin: 22px 0 0;
  color: rgba(203, 213, 225, 0.66);
  font-size: 0.92rem;
  line-height: 1.76;
  word-break: keep-all;
`;

const FitStatement = styled.div`
  margin-top: 24px;
  padding: 15px 0;
  border-top: 1px solid rgba(226, 232, 240, 0.11);
  border-bottom: 1px solid rgba(226, 232, 240, 0.11);
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 11px;
  align-items: start;
  color: #7dd3fc;

  div {
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  span {
    color: rgba(125, 211, 252, 0.72);
    font-size: 0.7rem;
    font-weight: 900;
  }

  strong {
    color: #e2e8f0;
    font-size: 0.86rem;
    line-height: 1.48;
    font-weight: 800;
    word-break: keep-all;
  }
`;

const DetailColumns = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  margin-top: auto;
  padding-top: 28px;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
    gap: 22px;
    margin-top: 0;
  }
`;

const DetailBlock = styled.div`
  min-width: 0;

  ul {
    display: grid;
    gap: 10px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 19px minmax(0, 1fr);
    gap: 8px;
    color: rgba(203, 213, 225, 0.68);
    font-size: 0.83rem;
    line-height: 1.46;
    word-break: keep-all;
  }

  li svg {
    margin-top: 2px;
    color: #7dd3fc;
  }
`;

const DetailLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #f8fafc;
  font-size: 0.8rem;
  font-weight: 900;
`;

const ProcessRail = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const ProcessStep = styled.li`
  position: relative;
  min-width: 0;
  min-height: 240px;
  padding: 22px;
  border: 1px solid rgba(226, 232, 240, 0.11);
  border-right-width: 0;
  background-color: rgba(255, 255, 255, 0.025);

  &:first-child {
    border-radius: 12px 0 0 12px;
  }

  &:last-child {
    border-right-width: 1px;
    border-radius: 0 12px 12px 0;
  }

  h3 {
    margin: 34px 0 0;
    color: #f8fafc;
    font-size: 1.05rem;
    line-height: 1.35;
    font-weight: 900;
  }

  p {
    margin: 10px 0 0;
    color: rgba(203, 213, 225, 0.62);
    font-size: 0.84rem;
    line-height: 1.65;
    word-break: keep-all;
  }

  @media (max-width: 900px) {
    min-height: 210px;
    border-right-width: 1px;
    border-radius: 12px !important;
  }

  @media (max-width: 560px) {
    min-height: 190px;
  }
`;

const ProcessMarker = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #7dd3fc;

  span {
    color: rgba(125, 211, 252, 0.72);
    font-size: 0.68rem;
    font-weight: 950;
    font-variant-numeric: tabular-nums;
  }
`;

const ProcessLine = styled.span`
  position: absolute;
  top: 55px;
  left: 22px;
  right: -1px;
  height: 1px;
  background-color: rgba(125, 211, 252, 0.24);
  pointer-events: none;

  @media (max-width: 900px) {
    display: none;
  }
`;

const ProposalPanel = styled.section`
  position: relative;
  scroll-margin-top: 24px;
  margin-top: 72px;
  padding: 42px;
  border: 1px solid rgba(125, 211, 252, 0.23);
  border-radius: 16px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(380px, 0.82fr);
  gap: 46px;
  align-items: center;
  overflow: hidden;
  background-color: #0d151f;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 42px;
    width: 112px;
    height: 3px;
    background-color: #7dd3fc;
  }

  @media (max-width: 940px) {
    grid-template-columns: 1fr;
    gap: 30px;
  }

  @media (max-width: 620px) {
    margin-top: 52px;
    padding: 28px 18px;
    border-radius: 12px;

    &::before {
      left: 18px;
    }
  }
`;

const ProposalCopy = styled.div`
  min-width: 0;

  h2 {
    max-width: 680px;
    margin: 17px 0 0;
    color: #f8fafc;
    font-size: 2.25rem;
    line-height: 1.25;
    font-weight: 900;
    text-wrap: balance;
    word-break: keep-all;
  }

  > p {
    max-width: 640px;
    margin: 16px 0 0;
    color: rgba(203, 213, 225, 0.68);
    font-size: 0.92rem;
    line-height: 1.72;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    h2 {
      font-size: 1.65rem;
    }
  }
`;

const ProposalActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 26px;
`;

const ActionNote = styled.span`
  color: rgba(203, 213, 225, 0.58);
  font-size: 0.78rem;
  font-weight: 750;
`;

const ProposalChecklist = styled.div`
  min-width: 0;
  padding: 20px;
  border: 1px solid rgba(226, 232, 240, 0.12);
  border-radius: 12px;
  background-color: rgba(255, 255, 255, 0.035);

  ol {
    display: grid;
    gap: 0;
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    min-width: 0;
    min-height: 66px;
    padding: 12px 0;
    border-top: 1px solid rgba(226, 232, 240, 0.09);
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 20px;
    gap: 10px;
    align-items: center;
  }

  li > span {
    color: #7dd3fc;
    font-size: 0.65rem;
    font-weight: 950;
  }

  li p {
    margin: 0;
    color: rgba(226, 232, 240, 0.76);
    font-size: 0.84rem;
    line-height: 1.5;
    font-weight: 750;
    word-break: keep-all;
  }

  li > svg {
    color: #5eead4;
  }
`;

const ChecklistHeader = styled.div`
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 11px;
  align-items: start;
  color: #7dd3fc;

  div {
    display: grid;
    gap: 4px;
  }

  span {
    color: rgba(125, 211, 252, 0.7);
    font-size: 0.65rem;
    font-weight: 900;
  }

  strong {
    color: #f8fafc;
    font-size: 0.9rem;
    line-height: 1.4;
    font-weight: 850;
  }
`;

const ClosingStatement = styled.footer`
  min-height: 84px;
  padding: 20px 0 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  color: #7dd3fc;

  p {
    margin: 0;
    color: rgba(203, 213, 225, 0.66);
    font-size: 0.82rem;
    line-height: 1.5;
    word-break: keep-all;
  }

  strong {
    color: rgba(125, 211, 252, 0.66);
    font-size: 0.68rem;
    font-weight: 950;
  }

  @media (max-width: 620px) {
    grid-template-columns: 28px minmax(0, 1fr);

    strong {
      grid-column: 2;
    }
  }
`;
