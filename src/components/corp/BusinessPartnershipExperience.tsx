'use client';

import { useState, type KeyboardEvent } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  ChevronDown,
  Cpu,
  Handshake,
  Megaphone,
  Network,
  Route,
  ShieldCheck,
  Store,
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
  steps: string[];
  outcomes: string[];
}

const PARTNERSHIP_TRACKS: PartnershipTrack[] = [
  {
    id: 'market-entry',
    eyebrow: '01 Market Entry',
    title: '시장 진입 제휴',
    summary: '파트너의 접점과 PRO PIG의 실행력을 묶어 새로운 고객군을 빠르게 검증합니다.',
    description:
      '지역, 업종, 커뮤니티처럼 이미 신뢰가 형성된 접점을 가진 파트너와 함께 파일럿을 설계합니다. 제안서에서 끝나는 제휴가 아니라 고객 반응, 운영 비용, 반복 가능성을 함께 확인하는 방식입니다.',
    imageUrl: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=84',
    imageAlt: '회의실에서 시장 진입 제휴 방향을 논의하는 비즈니스 팀',
    accent: '#5eead4',
    icon: Store,
    figureLabel: 'Pilot Window',
    figureValue: '4-8주',
    caption: '작은 범위에서 검증하고 확장 조건을 정합니다.',
    steps: ['공동 타깃 정의', '파일럿 운영 범위 확정', '성과 지표와 확장 기준 합의'],
    outcomes: ['신규 고객 접점 확보', '지역/업종별 실증 데이터', '파트너 공동 영업 자료'],
  },
  {
    id: 'platform-sync',
    eyebrow: '02 Platform Sync',
    title: '플랫폼 연동 제휴',
    summary: '서비스, 데이터, 자동화 흐름을 연결해 양쪽 사용자가 한 번에 더 큰 가치를 얻도록 만듭니다.',
    description:
      'API, 데이터 피드, 관리자 워크플로우를 기준으로 실제 연동 가능한 지점을 찾습니다. 기술 검토와 운영 정책을 함께 다뤄 런칭 이후에도 유지 가능한 제휴 구조를 만듭니다.',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=84',
    imageAlt: '플랫폼 연동과 자동화 개발을 상징하는 회로와 기술 장비 사진',
    accent: '#60a5fa',
    icon: Cpu,
    figureLabel: 'Integration',
    figureValue: 'API',
    caption: '데이터 흐름과 권한 정책을 먼저 맞춥니다.',
    steps: ['연동 대상 기능 선정', '데이터/권한 정책 검토', '테스트 환경 구축과 단계 배포'],
    outcomes: ['공동 기능 출시', '중복 업무 자동화', '운영 리포트 일원화'],
  },
  {
    id: 'joint-operation',
    eyebrow: '03 Joint Operation',
    title: '공동사업 운영 제휴',
    summary: '기획, 제작, 운영, 정산까지 역할을 나누어 하나의 사업 단위로 함께 실행합니다.',
    description:
      '캠페인성 협업보다 긴 호흡의 운영 모델을 만들 때 적합합니다. 각자의 강점과 책임 범위를 명확히 나누고, 일정과 정산 기준까지 초기에 고정해 실행 속도를 높입니다.',
    imageUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=84',
    imageAlt: '공동사업 운영을 위해 여러 사람이 업무를 조율하는 사무실 사진',
    accent: '#f5c766',
    icon: Network,
    figureLabel: 'Operating Model',
    figureValue: 'R&R',
    caption: '역할, 일정, 정산 구조를 한 번에 설계합니다.',
    steps: ['공동 사업안 정리', '역할과 비용 구조 합의', '운영 회의체와 리포트 주기 설정'],
    outcomes: ['공동 브랜드 사업화', '장기 운영 수익 모델', '반복 가능한 실행 매뉴얼'],
  },
  {
    id: 'brand-growth',
    eyebrow: '04 Brand Growth',
    title: '브랜드 성장 제휴',
    summary: '콘텐츠, 캠페인, 유통 채널을 함께 설계해 양쪽 브랜드의 신뢰와 도달 범위를 넓힙니다.',
    description:
      '단순 노출형 홍보가 아니라 공동 메시지, 캠페인 구조, 고객 전환 흐름까지 함께 설계합니다. 파트너의 채널 자산과 PRO PIG의 제작/운영 역량을 결합해 반복 가능한 성장 프로그램으로 만듭니다.',
    imageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=84',
    imageAlt: '브랜드 성장 제휴 캠페인을 준비하는 현대적인 업무 공간',
    accent: '#fb7185',
    icon: Megaphone,
    figureLabel: 'Growth Program',
    figureValue: 'CO-MKT',
    caption: '공동 메시지와 채널 운영 계획을 함께 설계합니다.',
    steps: ['공동 메시지와 타깃 정리', '콘텐츠/캠페인 패키지 구성', '채널별 성과 리포트 운영'],
    outcomes: ['브랜드 신뢰도 강화', '공동 캠페인 전환 데이터', '재사용 가능한 콘텐츠 자산'],
  },
];

export function BusinessPartnershipExperience({ page }: BusinessPartnershipExperienceProps) {
  const [activeTrackId, setActiveTrackId] = useState(PARTNERSHIP_TRACKS[0].id);
  const activeTrack = PARTNERSHIP_TRACKS.find((track) => track.id === activeTrackId) ?? PARTNERSHIP_TRACKS[0];
  const ActiveIcon = activeTrack.icon;

  const handleAccordionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = PARTNERSHIP_TRACKS.findIndex((track) => track.id === activeTrackId);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveTrackId(PARTNERSHIP_TRACKS[(currentIndex + 1) % PARTNERSHIP_TRACKS.length].id);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveTrackId(PARTNERSHIP_TRACKS[(currentIndex - 1 + PARTNERSHIP_TRACKS.length) % PARTNERSHIP_TRACKS.length].id);
    }
  };

  return (
    <Page id="content-area" aria-labelledby="business-partnership-title" $accent={activeTrack.accent}>
      <PageInner>
        <Hero>
          <Kicker>
            <Handshake size={16} strokeWidth={2.4} aria-hidden="true" />
            Partnership Business
          </Kicker>
          <TitleGroup>
            <h1 id="business-partnership-title">사업제휴</h1>
            <p>
              접점, 기술, 운영 역량을 서로 맞물리게 설계해 실제 실행 가능한 제휴 모델을 만듭니다.
              아래 4가지 방식 중 협업 목적에 맞는 구조를 선택할 수 있습니다.
            </p>
          </TitleGroup>
        </Hero>

        <PartnershipLayout>
          <VisualPanel $accent={activeTrack.accent} aria-live="polite">
            <ImageFrame>
              <PartnershipImage key={activeTrack.id} src={activeTrack.imageUrl} alt={activeTrack.imageAlt} />
              <ImageShade />
              <ImageMeta>
                <IconBadge $accent={activeTrack.accent}>
                  <ActiveIcon size={22} strokeWidth={2.3} aria-hidden="true" />
                </IconBadge>
                <span>{activeTrack.eyebrow}</span>
                <strong>{activeTrack.title}</strong>
              </ImageMeta>
            </ImageFrame>

            <SignalStrip $accent={activeTrack.accent}>
              <SignalItem>
                <span>{activeTrack.figureLabel}</span>
                <strong>{activeTrack.figureValue}</strong>
              </SignalItem>
              <SignalCaption>{activeTrack.caption}</SignalCaption>
            </SignalStrip>
          </VisualPanel>

          <AccordionPanel onKeyDown={handleAccordionKeyDown} aria-label={`${page.title} 유형`}>
            {PARTNERSHIP_TRACKS.map((track, index) => {
              const isActive = track.id === activeTrack.id;
              const TrackIcon = track.icon;

              return (
                <AccordionItem key={track.id} $active={isActive} $accent={track.accent}>
                  <AccordionButton
                    type="button"
                    aria-expanded={isActive}
                    aria-controls={`${track.id}-panel`}
                    onClick={() => setActiveTrackId(track.id)}
                  >
                    <Number>{String(index + 1).padStart(2, '0')}</Number>
                    <TrackIcon size={22} strokeWidth={2.35} aria-hidden="true" />
                    <AccordionTitle>
                      <span>{track.eyebrow}</span>
                      <strong>{track.title}</strong>
                      <small>{track.summary}</small>
                    </AccordionTitle>
                    <ChevronWrap $active={isActive}>
                      <ChevronDown size={19} strokeWidth={2.5} aria-hidden="true" />
                    </ChevronWrap>
                  </AccordionButton>

                  <AccordionBody id={`${track.id}-panel`} hidden={!isActive}>
                    <p>{track.description}</p>

                    <DetailColumns>
                      <DetailBlock>
                        <DetailLabel>
                          <Route size={16} strokeWidth={2.4} aria-hidden="true" />
                          진행 흐름
                        </DetailLabel>
                        <ul>
                          {track.steps.map((step) => (
                            <li key={step}>
                              <BadgeCheck size={15} strokeWidth={2.5} aria-hidden="true" />
                              {step}
                            </li>
                          ))}
                        </ul>
                      </DetailBlock>

                      <DetailBlock>
                        <DetailLabel>
                          <ShieldCheck size={16} strokeWidth={2.4} aria-hidden="true" />
                          기대 성과
                        </DetailLabel>
                        <ul>
                          {track.outcomes.map((outcome) => (
                            <li key={outcome}>
                              <ArrowUpRight size={15} strokeWidth={2.5} aria-hidden="true" />
                              {outcome}
                            </li>
                          ))}
                        </ul>
                      </DetailBlock>
                    </DetailColumns>
                  </AccordionBody>
                </AccordionItem>
              );
            })}
          </AccordionPanel>
        </PartnershipLayout>

        <BottomBand>
          <BottomMetric>
            <Building2 size={21} strokeWidth={2.25} aria-hidden="true" />
            <span>검토 기준</span>
            <strong>상호 고객 가치</strong>
          </BottomMetric>
          <BottomMetric>
            <Route size={21} strokeWidth={2.25} aria-hidden="true" />
            <span>진행 방식</span>
            <strong>파일럿 후 확장</strong>
          </BottomMetric>
          <BottomMetric>
            <ShieldCheck size={21} strokeWidth={2.25} aria-hidden="true" />
            <span>계약 원칙</span>
            <strong>역할과 지표 선합의</strong>
          </BottomMetric>
        </BottomBand>
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
  padding: 28px;
  color: #f4f7ef;
  background:
    radial-gradient(circle at 16% 8%, ${(props) => `${props.$accent}1f`}, transparent 28%),
    linear-gradient(135deg, #07100d 0%, #101412 46%, #0b0d0b 100%);

  @media (max-width: 760px) {
    padding: 16px;
  }
`;

const PageInner = styled.div`
  width: min(100%, 1240px);
  margin: 0 auto;
  display: grid;
  gap: 20px;
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  gap: 22px;
  align-items: end;
  padding: 10px 0 4px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
`;

const Kicker = styled.span`
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(244, 247, 239, 0.18);
  border-radius: 999px;
  color: rgba(244, 247, 239, 0.78);
  background: rgba(244, 247, 239, 0.06);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0;
`;

const TitleGroup = styled.div`
  min-width: 0;

  h1 {
    margin: 0;
    color: #ffffff;
    font-size: 2.65rem;
    line-height: 1.08;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    max-width: 780px;
    margin: 14px 0 0;
    color: rgba(244, 247, 239, 0.72);
    font-size: 1rem;
    line-height: 1.72;
    word-break: keep-all;
  }

  @media (max-width: 760px) {
    h1 {
      font-size: 2rem;
    }
  }
`;

const PartnershipLayout = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(420px, 1.05fr);
  gap: 20px;
  align-items: start;

  @media (max-width: 1040px) {
    grid-template-columns: 1fr;
  }
`;

const VisualPanel = styled.aside<{ $accent: string }>`
  position: sticky;
  top: 18px;
  min-width: 0;
  display: grid;
  gap: 12px;

  @media (max-width: 1040px) {
    position: static;
  }
`;

const ImageFrame = styled.div`
  position: relative;
  min-height: clamp(360px, 56vh, 640px);
  overflow: hidden;
  border: 1px solid rgba(244, 247, 239, 0.14);
  border-radius: 8px;
  background: #111612;

  @media (max-width: 760px) {
    min-height: 310px;
  }
`;

const PartnershipImage = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  animation: imageReveal 420ms ease both;

  @keyframes imageReveal {
    from {
      opacity: 0.62;
      transform: scale(1.018);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`;

const ImageShade = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(7, 16, 13, 0.04), rgba(7, 16, 13, 0.78)),
    linear-gradient(90deg, rgba(7, 16, 13, 0.62), transparent 62%);
`;

const ImageMeta = styled.div`
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: 24px;
  display: grid;
  gap: 9px;

  span {
    color: rgba(244, 247, 239, 0.68);
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0;
  }

  strong {
    color: #ffffff;
    font-size: clamp(1.75rem, 4vw, 3.15rem);
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }
`;

const IconBadge = styled.div<{ $accent: string }>`
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #06110f;
  background: ${(props) => props.$accent};
  box-shadow: 0 18px 42px ${(props) => `${props.$accent}33`};
`;

const SignalStrip = styled.div<{ $accent: string }>`
  display: grid;
  grid-template-columns: minmax(140px, 0.42fr) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const SignalItem = styled.div`
  min-width: 0;
  min-height: 104px;
  padding: 18px;
  border: 1px solid rgba(244, 247, 239, 0.12);
  border-radius: 8px;
  background: rgba(244, 247, 239, 0.07);

  span {
    display: block;
    color: rgba(244, 247, 239, 0.54);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 10px;
    color: #ffffff;
    font-size: 2rem;
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }
`;

const SignalCaption = styled.p`
  min-width: 0;
  min-height: 104px;
  margin: 0;
  padding: 18px;
  border: 1px solid rgba(244, 247, 239, 0.12);
  border-radius: 8px;
  display: flex;
  align-items: center;
  color: rgba(244, 247, 239, 0.76);
  background: rgba(244, 247, 239, 0.05);
  line-height: 1.62;
  word-break: keep-all;
`;

const AccordionPanel = styled.div`
  min-width: 0;
  display: grid;
  gap: 12px;
`;

const AccordionItem = styled.article<{ $active: boolean; $accent: string }>`
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${(props) => (props.$active ? `${props.$accent}88` : 'rgba(244, 247, 239, 0.12)')};
  border-radius: 8px;
  background:
    linear-gradient(135deg, ${(props) => (props.$active ? `${props.$accent}18` : 'rgba(244, 247, 239, 0.055)')}, rgba(244, 247, 239, 0.03)),
    rgba(10, 16, 13, 0.86);
  box-shadow: ${(props) => (props.$active ? `0 22px 52px ${props.$accent}18` : 'none')};
  transition:
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease;
`;

const AccordionButton = styled.button`
  width: 100%;
  min-width: 0;
  min-height: 112px;
  border: 0;
  padding: 20px;
  display: grid;
  grid-template-columns: 38px 32px minmax(0, 1fr) 34px;
  gap: 14px;
  align-items: start;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;

  svg {
    margin-top: 3px;
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: -4px;
  }

  @media (max-width: 560px) {
    grid-template-columns: 32px minmax(0, 1fr) 30px;

    > svg {
      display: none;
    }
  }
`;

const Number = styled.span`
  color: rgba(244, 247, 239, 0.46);
  font-size: 0.78rem;
  font-weight: 950;
`;

const AccordionTitle = styled.span`
  min-width: 0;
  display: grid;
  gap: 7px;

  span {
    color: rgba(244, 247, 239, 0.52);
    font-size: 0.72rem;
    font-weight: 950;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  strong {
    color: #ffffff;
    font-size: 1.34rem;
    line-height: 1.18;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }

  small {
    max-width: 620px;
    color: rgba(244, 247, 239, 0.68);
    font-size: 0.93rem;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const ChevronWrap = styled.span<{ $active: boolean }>`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(244, 247, 239, 0.13);
  border-radius: 8px;
  transform: rotate(${(props) => (props.$active ? '180deg' : '0deg')});
  transition: transform 180ms ease;
`;

const AccordionBody = styled.div`
  padding: 0 20px 22px 104px;
  animation: bodyReveal 220ms ease both;

  p {
    max-width: 760px;
    margin: 0;
    color: rgba(244, 247, 239, 0.78);
    line-height: 1.72;
    word-break: keep-all;
  }

  @keyframes bodyReveal {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 560px) {
    padding-left: 20px;
  }
`;

const DetailColumns = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const DetailBlock = styled.div`
  min-width: 0;
  padding: 16px;
  border: 1px solid rgba(244, 247, 239, 0.1);
  border-radius: 8px;
  background: rgba(244, 247, 239, 0.045);

  ul {
    display: grid;
    gap: 10px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    color: rgba(244, 247, 239, 0.73);
    font-size: 0.9rem;
    line-height: 1.45;
    word-break: keep-all;
  }
`;

const DetailLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 950;
`;

const BottomBand = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 840px) {
    grid-template-columns: 1fr;
  }
`;

const BottomMetric = styled.div`
  min-width: 0;
  min-height: 112px;
  padding: 18px;
  border: 1px solid rgba(244, 247, 239, 0.12);
  border-radius: 8px;
  display: grid;
  gap: 7px;
  align-content: start;
  background: rgba(244, 247, 239, 0.05);

  svg {
    color: #5eead4;
  }

  span {
    color: rgba(244, 247, 239, 0.52);
    font-size: 0.75rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  strong {
    color: #ffffff;
    font-size: 1.06rem;
    line-height: 1.3;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }
`;
