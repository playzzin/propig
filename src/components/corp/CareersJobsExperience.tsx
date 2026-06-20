'use client';

import { useState, type KeyboardEvent } from 'react';
import {
  BadgeCheck,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  Code2,
  Headphones,
  Megaphone,
  Route,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import type { CorpPageDefinition } from '@/constants/corpPages';

interface CareersJobsExperienceProps {
  page: CorpPageDefinition;
}

interface JobField {
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

const JOB_FIELDS: JobField[] = [
  {
    id: 'product-strategy',
    eyebrow: '01 Product',
    title: '서비스 기획',
    role: 'Product Strategist',
    summary: '사용자 문제를 기능 요구사항, 화면 흐름, 운영 기준으로 정리하는 포지션입니다.',
    accent: '#5eead4',
    icon: Sparkles,
    status: '상시 검토',
    employmentType: '정규직 / 프로젝트',
    location: 'Seoul / Hybrid',
    details: {
      intro:
        '서비스 기획자는 고객의 요구와 내부 운영 흐름을 연결해 실제 구현 가능한 화면과 정책으로 정리합니다. 빠른 실행보다 문제 정의와 우선순위 판단을 선명하게 만드는 역할입니다.',
      responsibilities: ['신규 기능 요구사항 정리', '관리자/사용자 화면 플로우 설계', '릴리즈 범위와 검증 기준 작성'],
      requirements: ['웹 서비스 기획 또는 운영 경험', '문서화와 이해관계자 조율 역량', '데이터 기반 의사결정에 익숙한 분'],
      process: ['서류 검토', '실무 과제 또는 포트폴리오 리뷰', '직무 인터뷰', '최종 조건 협의'],
    },
  },
  {
    id: 'frontend-engineer',
    eyebrow: '02 Engineering',
    title: '프론트엔드 개발',
    role: 'Frontend Engineer',
    summary: 'Next.js 기반 화면, 인터랙션, 관리자 도구를 안정적으로 구현하는 포지션입니다.',
    accent: '#60a5fa',
    icon: Code2,
    status: '채용중',
    employmentType: '정규직',
    location: 'Remote Friendly',
    details: {
      intro:
        '프론트엔드 개발자는 기획과 디자인을 실제 제품 화면으로 구현하고, 운영 중인 기능의 품질과 성능을 관리합니다. 컴포넌트 구조와 사용자 흐름을 함께 보는 역량을 중요하게 봅니다.',
      responsibilities: ['Next.js/React 화면 개발', '관리자 기능과 데이터 연동 구현', '반응형 UI와 접근성 품질 개선'],
      requirements: ['React 기반 서비스 개발 경험', 'TypeScript와 컴포넌트 설계 이해', '디자인 의도를 UI로 해석하는 능력'],
      process: ['서류 검토', '코드 리뷰형 기술 인터뷰', '협업 방식 인터뷰', '최종 합류 일정 조율'],
    },
  },
  {
    id: 'brand-growth',
    eyebrow: '03 Growth',
    title: '브랜드 마케팅',
    role: 'Brand Growth Manager',
    summary: '브랜드 메시지, 콘텐츠, 캠페인 운영을 통해 고객 접점을 확장하는 포지션입니다.',
    accent: '#fb7185',
    icon: Megaphone,
    status: '포트폴리오 우대',
    employmentType: '정규직 / 계약직',
    location: 'Seoul / Hybrid',
    details: {
      intro:
        '브랜드 마케팅 담당자는 제품이 가진 실제 가치를 고객 언어로 바꾸고, 콘텐츠와 캠페인으로 시장 반응을 만듭니다. 예쁜 문구보다 전환 가능한 메시지와 실행력을 중요하게 봅니다.',
      responsibilities: ['브랜드 메시지와 콘텐츠 기획', 'SNS/제휴 캠페인 운영', '성과 리포트와 개선안 작성'],
      requirements: ['콘텐츠 또는 캠페인 운영 경험', '카피라이팅과 시각 자료 협업 역량', '성과 지표를 읽고 개선하는 습관'],
      process: ['서류 및 포트폴리오 검토', '캠페인 사례 인터뷰', '실무진 미팅', '최종 조건 협의'],
    },
  },
  {
    id: 'customer-ops',
    eyebrow: '04 Operations',
    title: '고객 운영',
    role: 'Customer Operations Manager',
    summary: '고객 문의, 운영 정책, 내부 프로세스를 안정적으로 관리하는 포지션입니다.',
    accent: '#f5c766',
    icon: Headphones,
    status: '인재풀 등록',
    employmentType: '정규직 / 파트타임',
    location: 'Ansan / Hybrid',
    details: {
      intro:
        '고객 운영 담당자는 고객 문의와 내부 업무 흐름을 정리해 서비스의 신뢰도를 유지합니다. 반복되는 문제를 기록하고 개선 과제로 연결하는 꼼꼼함이 핵심입니다.',
      responsibilities: ['고객 문의 응대와 이슈 분류', '운영 매뉴얼과 FAQ 관리', '반복 이슈 리포트 작성'],
      requirements: ['고객 응대 또는 서비스 운영 경험', '정확한 기록과 커뮤니케이션 역량', '문제를 구조화해 개선하는 태도'],
      process: ['서류 검토', '운영 상황 대응 인터뷰', '팀 핏 인터뷰', '근무 조건 협의'],
    },
  },
];

export function CareersJobsExperience({ page }: CareersJobsExperienceProps) {
  const [activeFieldId, setActiveFieldId] = useState(JOB_FIELDS[0].id);
  const activeField = JOB_FIELDS.find((field) => field.id === activeFieldId) ?? JOB_FIELDS[0];

  const handleFieldKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = JOB_FIELDS.findIndex((field) => field.id === activeFieldId);

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveFieldId(JOB_FIELDS[(currentIndex + 1) % JOB_FIELDS.length].id);
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveFieldId(JOB_FIELDS[(currentIndex - 1 + JOB_FIELDS.length) % JOB_FIELDS.length].id);
    }
  };

  return (
    <Page id="content-area" aria-labelledby="careers-jobs-title" $accent={activeField.accent}>
      <PageInner>
        <Hero>
          <HeroCopy>
            <Kicker>
              <BriefcaseBusiness size={16} strokeWidth={2.4} aria-hidden="true" />
              Careers Open Roles
            </Kicker>
            <h1 id="careers-jobs-title">채용정보</h1>
            <p>PRO PIG에서 함께 만들 모집분야를 직무별로 정리했습니다. 역할, 주요 업무, 자격요건, 전형 흐름을 한 화면에서 확인할 수 있습니다.</p>
          </HeroCopy>

          <SignalPanel $accent={activeField.accent}>
            <UsersRound size={28} strokeWidth={2.2} aria-hidden="true" />
            <span>모집분야</span>
            <strong>4</strong>
            <small>{page.description}</small>
          </SignalPanel>
        </Hero>

        <FieldGrid onKeyDown={handleFieldKeyDown} aria-label={`${page.title} 모집분야`}>
          {JOB_FIELDS.map((field, index) => {
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

        <AccordionSection aria-label={`${page.title} 상세 내용`}>
          {JOB_FIELDS.map((field) => {
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
                        주요 업무
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
`;

const FieldButton = styled.button`
  width: 100%;
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
