'use client';

import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  HeartHandshake,
  PartyPopper,
  Route,
  UserRoundPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import type { CorpPageDefinition } from '@/constants/corpPages';

interface CareersJobsExperienceProps {
  page: CorpPageDefinition;
}

interface WantedField {
  id: string;
  eyebrow: string;
  title: string;
  role: string;
  summary: string;
  accent: string;
  icon: LucideIcon;
  status: string;
  employmentType: string;
  location: string;
  details: {
    intro: string;
    responsibilities: string[];
    requirements: string[];
    process: string[];
  };
}

const WANTED_FIELDS: WantedField[] = [
  {
    id: 'staff',
    eyebrow: '01 · Staff',
    title: '직원구함',
    role: '실행력 있는 인간 멀티툴',
    summary: '회의에서 고개만 끄덕이지 않고, 아이디어를 결과물로 바꿀 동료를 모십니다.',
    accent: '#60a5fa',
    icon: BriefcaseBusiness,
    status: '상시 채용',
    employmentType: '정규직 / 프로젝트 계약',
    location: '안산 / 하이브리드',
    details: {
      intro:
        'PRO PIG는 “누가 해주겠지”라는 말이 사무실에 정착하기 전에 일을 끝내는 팀입니다. 일은 진지하게, 회의는 짧게, 커피는 각자 취향대로 마시며 결과를 만드는 동료를 찾습니다.',
      responsibilities: [
        '생각난 아이디어를 회의록에서 끝내지 않고 실제 화면·문서·결과물로 옮기기',
        'AI에게 반복 업무를 맡기되, 최종 검수는 인간의 눈과 양심으로 하기',
        '문제가 생기면 “괜찮습니다”로 덮지 말고 “막혔습니다”라고 먼저 공유하기',
        '동료의 좋은 제안에는 박수를, 아쉬운 제안에는 근거 있는 태클을 보내기',
      ],
      requirements: [
        '마감 직전의 초인적 집중력보다 평소의 꾸준함을 갖춘 분',
        '슬랙·노션·커피 중 두 가지 이상과 평화롭게 공존 가능한 분',
        '내 업무뿐 아니라 팀의 다음 병목도 한 번쯤 살펴보는 분',
        '직급보다 결과물과 약속을 더 중요하게 생각하는 분',
      ],
      process: [
        '이력서 또는 “이건 내가 진짜 잘했다” 싶은 작업물 1개 제출',
        '실무 대화: 일하는 방식과 밈 취향의 교집합 확인',
        '가벼운 과제 또는 함께 커피 마시며 문제 푸는 시간',
        '조건 협의 후 첫 출근, 그리고 팀 단체방 이모지 세례',
      ],
    },
  },
  {
    id: 'friends',
    eyebrow: '02 · Friends',
    title: '친구구함',
    role: '퇴근 후에도 어색하지 않은 장기 동료',
    summary: '별일 없어도 안부를 묻고, 취향과 아이디어를 편하게 나눌 친구를 찾습니다.',
    accent: '#5eead4',
    icon: UserRoundPlus,
    status: '상시 채용',
    employmentType: '비정규 우정직 / 장기 계약',
    location: '온라인 + 수도권',
    details: {
      intro:
        '급한 업무는 없지만 오래 갈 가능성이 높은 포지션입니다. 재미있는 일이 생기면 가장 먼저 공유하고, 힘든 날에는 말없이 옆자리를 내어줄 수 있는 친구를 기다립니다.',
      responsibilities: [
        '별일 없는 날에도 “뭐 해?”라는 안부를 가끔 먼저 보내기',
        '맛집·전시·영화·게임·새 취미를 함께 검토하고 필요하면 즉시 실행하기',
        '상대방의 한숨에 정답부터 내놓기보다 일단 충분히 들어주기',
        '약속을 바꿔야 할 때는 잠수 대신 사전 공지와 다음 일정 제안하기',
      ],
      requirements: [
        '읽씹은 가끔 가능하지만 잠수는 프로젝트 종료 사유라는 데 동의하는 분',
        '취향이 달라도 “왜 좋아해?”부터 물어보는 분',
        '연락 템포가 다르면 서로의 기본값을 합의할 수 있는 분',
        '자기 이야기만큼 상대의 소소한 근황도 기억해 주는 분',
      ],
      process: [
        '지원 메시지에 최근 가장 웃겼던 일 한 가지 첨부',
        '관심사 사전 인터뷰: 음악·음식·주말 사용법 중 자유 선택',
        '안전한 공개 장소에서 1차 커피 또는 산책',
        '첫 만남 후 서로의 재지원 의사 확인, 잘 맞으면 장기 계약 전환',
      ],
    },
  },
  {
    id: 'girlfriend',
    eyebrow: '03 · Love',
    title: '여친구함',
    role: '서로의 편이 되어 줄 장기 파트너',
    summary: '솔직한 대화와 배려를 바탕으로 일상과 미래를 천천히 나눌 여자친구를 찾습니다.',
    accent: '#fb7185',
    icon: HeartHandshake,
    status: '진지하게 채용 중',
    employmentType: '연애직 / 상호 동의 계약',
    location: '수도권 / 협의',
    details: {
      intro:
        '화려한 스펙보다 대화가 잘 통하고 함께 있을 때 마음이 편한 관계를 원합니다. 연애를 상대방의 일정 파괴 프로젝트로 만들지 않고, 좋은 날과 힘든 날을 자연스럽게 나눌 수 있으면 좋겠습니다.',
      responsibilities: [
        '“오늘 뭐 해?”라는 질문에 “아무거나” 대신 최소 한 가지 선택지를 제안하기',
        '좋은 일은 두 배로 기뻐하고, 힘든 일은 해결책보다 공감부터 제공하기',
        '각자의 일·친구·혼자만의 시간을 존중하면서도 필요한 순간에는 든든하게 출석하기',
        '기념일을 암기 시험으로 만들지 않고 서로의 방식으로 잘 챙기기',
      ],
      requirements: [
        '성인으로서 서로의 경계와 관계의 속도를 존중하는 분',
        '잠수에 대응하는 방법이 와이파이 문제 하나뿐인 분',
        '솔직함을 무례함으로 포장하지 않고 대화로 조율하는 분',
        '다정함과 유머를 함께 나누며 상대를 바꾸려 하지 않는 분',
      ],
      process: [
        '지원서 대신 나를 잘 보여 주는 자기소개와 좋아하는 데이트 한 가지 제출',
        '대화 면접: 가치관·연락 방식·주말 사용법을 편하게 확인',
        '안전한 공개 장소에서 1차 만남, 귀가 후 무사 귀가 보고는 선택 아닌 필수',
        '서로의 재지원 의사가 맞으면 상호 합의 후 정식 연애직 전환',
      ],
    },
  },
  {
    id: 'other',
    eyebrow: '04 · Other',
    title: '기타구함',
    role: '정의되지 않은 빈칸을 채울 특별 인재',
    summary: '운동메이트, 여행동행, 밥친구처럼 아직 이름 붙이기 전인 모든 포지션의 지원을 기다립니다.',
    accent: '#f5c766',
    icon: PartyPopper,
    status: '수시 접수',
    employmentType: '단기 / 장기 / 한 번 웃고 끝',
    location: '전국 / 생각보다 가까운 곳',
    details: {
      intro:
        '모든 사람은 어느 날 갑자기 필요한 직무가 됩니다. 운동메이트, 여행동행, 반려식물 상담사, 점심 메뉴 결정권자처럼 공고에 이름이 없다고 지원 기회까지 없는 것은 아닙니다.',
      responsibilities: [
        '새벽 운동·점심 탐험·주말 여행·반려식물 구조 등 맞춤형 미션 수행',
        '특이한 취미가 있다면 입문 장벽을 낮춰 주고, 없더라도 함께 찾아보기',
        '매칭된 역할의 범위와 연락 빈도를 서로에게 명확하게 안내하기',
        '필요하지 않은 날에는 과한 출근 독촉 없이 각자의 일상을 존중하기',
      ],
      requirements: [
        '자기소개 한 문장으로 자신을 너무 과장하지 않는 분',
        '“기타”라는 말에 서운함보다 가능성을 느끼는 분',
        '일정 변경이나 거절을 개인적인 패배로 해석하지 않는 분',
        '기존 공고에 없는 포지션을 새로 제안할 용기가 있는 분',
      ],
      process: [
        '지원하고 싶은 역할을 자유 형식으로 기재',
        '3문장 미니 인터뷰: 왜 필요한지, 무엇을 할지, 언제 가능한지',
        '서로의 기대치·비용·연락 주기를 짧고 명확하게 조율',
        '필요한 날 기분 좋게 출근 또는 합류, 아니면 다음 공고를 기다리기',
      ],
    },
  },
];

export function CareersJobsExperience({ page }: CareersJobsExperienceProps) {
  const [activeFieldId, setActiveFieldId] = useState(WANTED_FIELDS[0].id);
  const activeField = WANTED_FIELDS.find((field) => field.id === activeFieldId) ?? WANTED_FIELDS[0];

  const handleFieldKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = WANTED_FIELDS.findIndex((field) => field.id === activeFieldId);

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveFieldId(WANTED_FIELDS[(currentIndex + 1) % WANTED_FIELDS.length].id);
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveFieldId(WANTED_FIELDS[(currentIndex - 1 + WANTED_FIELDS.length) % WANTED_FIELDS.length].id);
    }
  };

  return (
    <Page id="content-area" aria-labelledby="careers-jobs-title" $accent={activeField.accent}>
      <PageInner>
        <Hero>
          <HeroCopy>
            <Kicker>
              <UsersRound size={16} strokeWidth={2.4} aria-hidden="true" />
              PRO PIG Recruitment Notice
            </Kicker>
            <h1 id="careers-jobs-title">채용공고</h1>
            <p>PRO PIG는 일할 직원, 퇴근 후 친구, 서로를 아끼는 여친, 그리고 설명하기 어려운 기타 인재를 찾습니다. 포지션은 달라도 공통 지원 자격은 한 가지, 서로에게 무례하지 않을 것.</p>
          </HeroCopy>

          <SignalPanel $accent={activeField.accent}>
            <UsersRound size={28} strokeWidth={2.2} aria-hidden="true" />
            <span>모집 포지션</span>
            <strong>4</strong>
            <small>{page.description}</small>
          </SignalPanel>
        </Hero>

        <FieldGrid onKeyDown={handleFieldKeyDown} aria-label={`${page.title} 모집 공고`}>
          {WANTED_FIELDS.map((field, index) => {
            const FieldIcon = field.icon;
            const isActive = field.id === activeField.id;

            return (
              <FieldCard key={field.id} $active={isActive} $accent={field.accent}>
                <FieldButton
                  type="button"
                  aria-pressed={isActive}
                  aria-controls={`${field.id}-details`}
                  onClick={() => setActiveFieldId(field.id)}
                >
                  <FieldTop>
                    <FieldNumber>{String(index + 1).padStart(2, '0')}</FieldNumber>
                    <FieldIcon size={23} strokeWidth={2.35} aria-hidden="true" />
                  </FieldTop>
                  <FieldTitle>
                    <span>{field.eyebrow}</span>
                    <strong>{field.title}</strong>
                    <small>{field.role}</small>
                  </FieldTitle>
                  <FieldSummary>{field.summary}</FieldSummary>
                  <FieldMeta>
                    <span>{field.status}</span>
                    <span>{field.location}</span>
                  </FieldMeta>
                </FieldButton>
              </FieldCard>
            );
          })}
        </FieldGrid>

        <AccordionSection aria-label={`${page.title} 상세 채용 공고`}>
          {WANTED_FIELDS.map((field) => {
            const isActive = field.id === activeField.id;
            const FieldIcon = field.icon;

            return (
              <AccordionItem key={field.id} $active={isActive} $accent={field.accent}>
                <AccordionButton
                  type="button"
                  aria-expanded={isActive}
                  aria-controls={`${field.id}-details`}
                  onClick={() => setActiveFieldId(field.id)}
                >
                  <AccordionHeading>
                    <IconBox $accent={field.accent}>
                      <FieldIcon size={21} strokeWidth={2.35} aria-hidden="true" />
                    </IconBox>
                    <span>
                      <small>{field.eyebrow}</small>
                      <strong>{field.title}</strong>
                    </span>
                  </AccordionHeading>
                  <AccordionStatus>
                    <span>{field.status}</span>
                    <ChevronWrap $active={isActive}>
                      <ChevronDown size={19} strokeWidth={2.5} aria-hidden="true" />
                    </ChevronWrap>
                  </AccordionStatus>
                </AccordionButton>

                <AccordionBody id={`${field.id}-details`} hidden={!isActive}>
                  <RoleIntro>
                    <strong>{field.role}</strong>
                    <p>{field.details.intro}</p>
                  </RoleIntro>

                  <DetailRows>
                    <DetailColumn>
                      <DetailLabel>
                        <ClipboardCheck size={16} strokeWidth={2.4} aria-hidden="true" />
                        담당 업무
                      </DetailLabel>
                      <List>
                        {field.details.responsibilities.map((item) => (
                          <li key={item}>
                            <BadgeCheck size={15} strokeWidth={2.4} aria-hidden="true" />
                            {item}
                          </li>
                        ))}
                      </List>
                    </DetailColumn>

                    <DetailColumn>
                      <DetailLabel>
                        <UsersRound size={16} strokeWidth={2.4} aria-hidden="true" />
                        자격 요건
                      </DetailLabel>
                      <List>
                        {field.details.requirements.map((item) => (
                          <li key={item}>
                            <BadgeCheck size={15} strokeWidth={2.4} aria-hidden="true" />
                            {item}
                          </li>
                        ))}
                      </List>
                    </DetailColumn>

                    <DetailColumn>
                      <DetailLabel>
                        <Route size={16} strokeWidth={2.4} aria-hidden="true" />
                        전형 절차
                      </DetailLabel>
                      <List>
                        {field.details.process.map((item) => (
                          <li key={item}>
                            <BadgeCheck size={15} strokeWidth={2.4} aria-hidden="true" />
                            {item}
                          </li>
                        ))}
                      </List>
                    </DetailColumn>
                  </DetailRows>

                  <InfoStrip>
                    <span>{field.employmentType}</span>
                    <span>{field.location}</span>
                    <ApplyLink href={`/corp/careers/apply?position=${field.id}`}>
                      지원하기
                      <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
                    </ApplyLink>
                  </InfoStrip>
                </AccordionBody>
              </AccordionItem>
            );
          })}
        </AccordionSection>
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
    radial-gradient(circle at 12% 8%, ${(props) => `${props.$accent}22`}, transparent 27%),
    linear-gradient(135deg, #08100e 0%, #121714 52%, #090b0a 100%);

  @media (max-width: 760px) {
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 330px);
  gap: 18px;
  align-items: stretch;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
  padding: 32px;
  border: 1px solid rgba(244, 247, 239, 0.12);
  border-radius: 8px;
  background: rgba(244, 247, 239, 0.055);

  h1 {
    margin: 16px 0 0;
    color: #ffffff;
    font-size: 2.55rem;
    line-height: 1.08;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
    text-wrap: balance;
  }

  p {
    max-width: 780px;
    margin: 14px 0 0;
    color: rgba(244, 247, 239, 0.72);
    font-size: 1rem;
    line-height: 1.72;
    word-break: keep-all;
    text-wrap: pretty;
  }

  @media (max-width: 760px) {
    padding: 24px;

    h1 {
      font-size: 2rem;
    }
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

const SignalPanel = styled.aside<{ $accent: string }>`
  min-width: 0;
  min-height: 220px;
  padding: 24px;
  border: 1px solid ${(props) => `${props.$accent}55`};
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  color: ${(props) => props.$accent};
  background:
    linear-gradient(180deg, ${(props) => `${props.$accent}20`}, rgba(244, 247, 239, 0.04)),
    rgba(244, 247, 239, 0.045);

  span {
    margin-top: 28px;
    color: rgba(244, 247, 239, 0.62);
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0;
  }

  strong {
    margin-top: 8px;
    color: #ffffff;
    font-size: 3.3rem;
    line-height: 0.9;
    font-weight: 950;
    letter-spacing: 0;
  }

  small {
    margin-top: 12px;
    color: rgba(244, 247, 239, 0.68);
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const FieldGrid = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1120px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FieldCard = styled.article<{ $active: boolean; $accent: string }>`
  height: 100%;
  min-width: 0;
  border: 1px solid ${(props) => (props.$active ? `${props.$accent}88` : 'rgba(244, 247, 239, 0.12)')};
  border-radius: 8px;
  background:
    linear-gradient(145deg, ${(props) => (props.$active ? `${props.$accent}19` : 'rgba(244, 247, 239, 0.05)')}, rgba(244, 247, 239, 0.028)),
    rgba(9, 15, 12, 0.88);
  box-shadow: ${(props) => (props.$active ? `0 18px 44px ${props.$accent}16` : 'none')};
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;

  &:hover {
    transform: translateY(-2px);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

const FieldButton = styled.button`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 244px;
  border: 0;
  padding: 20px;
  display: grid;
  gap: 16px;
  align-content: start;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: -4px;
  }

  @media (max-width: 640px) {
    min-height: 210px;
  }
`;

const FieldTop = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;

  svg {
    color: #ffffff;
  }
`;

const FieldNumber = styled.span`
  color: rgba(244, 247, 239, 0.44);
  font-size: 0.78rem;
  font-weight: 950;
`;

const FieldTitle = styled.span`
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
    font-size: 1.42rem;
    line-height: 1.16;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }

  small {
    color: rgba(244, 247, 239, 0.6);
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0;
  }
`;

const FieldSummary = styled.p`
  min-width: 0;
  margin: 0;
  color: rgba(244, 247, 239, 0.72);
  font-size: 0.92rem;
  line-height: 1.58;
  word-break: keep-all;
`;

const FieldMeta = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: auto;

  span {
    min-height: 28px;
    padding: 5px 9px;
    border: 1px solid rgba(244, 247, 239, 0.12);
    border-radius: 999px;
    color: rgba(244, 247, 239, 0.72);
    background: rgba(244, 247, 239, 0.05);
    font-size: 0.72rem;
    font-weight: 850;
    line-height: 1.25;
  }
`;

const AccordionSection = styled.section`
  min-width: 0;
  display: grid;
  gap: 10px;
`;

const AccordionItem = styled.article<{ $active: boolean; $accent: string }>`
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${(props) => (props.$active ? `${props.$accent}88` : 'rgba(244, 247, 239, 0.11)')};
  border-radius: 8px;
  background:
    linear-gradient(135deg, ${(props) => (props.$active ? `${props.$accent}15` : 'rgba(244, 247, 239, 0.045)')}, rgba(244, 247, 239, 0.025)),
    rgba(8, 13, 11, 0.9);
`;

const AccordionButton = styled.button`
  width: 100%;
  min-width: 0;
  min-height: 84px;
  border: 0;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: -4px;
  }

  @media (max-width: 560px) {
    align-items: flex-start;
  }
`;

const AccordionHeading = styled.span`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 13px;

  > span {
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  small {
    color: rgba(244, 247, 239, 0.52);
    font-size: 0.72rem;
    font-weight: 950;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  strong {
    color: #ffffff;
    font-size: 1.18rem;
    line-height: 1.2;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }
`;

const IconBox = styled.span<{ $accent: string }>`
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #06110f;
  background: ${(props) => props.$accent};
`;

const AccordionStatus = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;

  > span {
    color: rgba(244, 247, 239, 0.64);
    font-size: 0.8rem;
    font-weight: 900;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    > span {
      display: none;
    }
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

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const AccordionBody = styled.div`
  padding: 0 20px 20px 77px;
  animation: detailReveal 220ms ease both;

  @keyframes detailReveal {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 720px) {
    padding-left: 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const RoleIntro = styled.div`
  min-width: 0;

  strong {
    color: #ffffff;
    font-size: 0.98rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  p {
    max-width: 900px;
    margin: 10px 0 0;
    color: rgba(244, 247, 239, 0.74);
    line-height: 1.72;
    word-break: keep-all;
  }
`;

const DetailRows = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid rgba(244, 247, 239, 0.1);

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const DetailColumn = styled.div`
  min-width: 0;
`;

const DetailLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 950;
`;

const List = styled.ul`
  display: grid;
  gap: 10px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    color: rgba(244, 247, 239, 0.72);
    font-size: 0.9rem;
    line-height: 1.48;
    word-break: keep-all;
  }
`;

const InfoStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;

  span {
    min-height: 30px;
    padding: 6px 10px;
    border: 1px solid rgba(244, 247, 239, 0.12);
    border-radius: 999px;
    color: rgba(244, 247, 239, 0.72);
    background: rgba(244, 247, 239, 0.05);
    font-size: 0.78rem;
    font-weight: 850;
  }
`;

const ApplyLink = styled(Link)`
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 11px;
  border: 1px solid rgba(96, 165, 250, 0.5);
  border-radius: 999px;
  color: #dbeafe;
  background: rgba(96, 165, 250, 0.12);
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1.25;
  text-decoration: none;
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
  touch-action: manipulation;

  &:hover,
  &:focus-visible {
    border-color: #93c5fd;
    background: rgba(96, 165, 250, 0.22);
    transform: translateY(-1px);
    outline: 2px solid #ffffff;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover,
    &:focus-visible {
      transform: none;
    }
  }
`;
