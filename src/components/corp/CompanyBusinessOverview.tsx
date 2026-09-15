"use client";

import { useState, type KeyboardEvent } from "react";
import {
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Clapperboard,
  ClipboardCheck,
  MonitorSmartphone,
  Route,
  Sparkles,
  UsersRound,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import styled from "styled-components";

type BusinessField = {
  id: string;
  eyebrow: string;
  title: string;
  role: string;
  summary: string;
  accent: string;
  icon: LucideIcon;
  status: string;
  engagementType: string;
  focus: string;
  details: {
    intro: string;
    services: string[];
    outputs: string[];
    process: string[];
  };
};

const BUSINESS_FIELDS: BusinessField[] = [
  {
    id: "ai-product",
    eyebrow: "01 Product",
    title: "AI 웹·앱 개발",
    role: "AI Product Engineering",
    summary:
      "기획, UX, 데이터, AI 기능, 배포를 연결해 실제 업무에 쓰이는 웹서비스와 앱을 만듭니다.",
    accent: "#60a5fa",
    icon: MonitorSmartphone,
    status: "제품 구축",
    engagementType: "웹·앱·SaaS 통합 개발",
    focus: "제품 완성도",
    details: {
      intro:
        "AI 웹·앱 개발은 아이디어를 단순한 화면이 아니라 사용자의 입력을 이해하고 다음 행동을 제안하는 제품으로 전환합니다. 정보 구조와 디자인 시스템부터 인증, 권한, 데이터 모델, 관리자 도구까지 한 흐름으로 설계합니다.",
      services: [
        "브랜드 사이트·SaaS·ERP·CRM 개발",
        "AI 검색·추천·요약·생성 기능 설계",
        "PWA·Capacitor 기반 멀티 디바이스 대응",
      ],
      outputs: ["제품 전략과 UX 설계", "프로덕션 웹·앱", "관리자·분석·운영 문서"],
      process: ["문제·사용자 분석", "프로토타입과 기술 설계", "개발·검증·운영 전환"],
    },
  },
  {
    id: "automation",
    eyebrow: "02 Automation",
    title: "AI 업무자동화",
    role: "Intelligent Automation",
    summary:
      "문서, 메일, 스프레드시트, 웹, 사내 시스템 사이의 반복 업무를 안전한 자동화 흐름으로 연결합니다.",
    accent: "#5eead4",
    icon: Workflow,
    status: "업무 연결",
    engagementType: "AI·API·RPA 오케스트레이션",
    focus: "통제 가능한 자동화",
    details: {
      intro:
        "AI 업무자동화는 단순한 매크로를 넘어 입력 검증, 사람 승인, 중복 실행 방지, 재시도, 실패 알림과 감사 기록을 갖춘 운영 시스템을 구축합니다. 담당자는 반복 입력보다 판단과 관계 관리에 집중할 수 있습니다.",
      services: [
        "반복 업무 발견과 자동화 우선순위 설계",
        "문서·메일·웹·API 데이터 연결",
        "AI 분류·요약·응답 초안과 승인 흐름",
      ],
      outputs: [
        "업무 프로세스 맵",
        "자동화 워크플로와 운영 콘솔",
        "예외·복구·감사 기준",
      ],
      process: ["현행 업무 측정", "자동화·승인 구조 설계", "단계별 적용과 운영 안정화"],
    },
  },
  {
    id: "ai-video",
    eyebrow: "03 AI Video",
    title: "AI 영상제작·편집",
    role: "AI Video Production",
    summary:
      "리서치와 대본부터 생성형 비주얼, 편집, 자막, 사운드, 채널별 변환까지 하나의 제작 흐름으로 운영합니다.",
    accent: "#fb7185",
    icon: Clapperboard,
    status: "미디어 제작",
    engagementType: "기획·생성·편집·렌더링",
    focus: "채널별 완성도",
    details: {
      intro:
        "AI 영상제작·편집은 AI의 속도와 편집자의 시선을 결합합니다. 브랜드 목적과 시청 맥락을 먼저 정의하고, 장면 리듬과 정보 밀도, 색감, 자막, 음향을 사람이 최종 검수해 완성도를 확보합니다.",
      services: [
        "브랜드 필름·제품 데모·교육 영상",
        "유튜브 롱폼·릴스·쇼츠 제작",
        "데이터 기반 반복 영상·다국어 버전 자동화",
      ],
      outputs: [
        "대본·콘티·스타일 프레임",
        "마스터 영상과 숏폼 패키지",
        "자막·썸네일·채널별 납품본",
      ],
      process: ["메시지·시청자 정의", "생성·촬영·편집", "품질 검수·포맷별 출력"],
    },
  },
  {
    id: "creator",
    eyebrow: "04 Creator",
    title: "AI 크리에이터",
    role: "Creator Growth System",
    summary:
      "고유한 관점과 브랜드 보이스를 콘텐츠 기획, 제작, 배포, 분석이 반복되는 크리에이터 성장 시스템으로 만듭니다.",
    accent: "#f5c766",
    icon: WandSparkles,
    status: "채널 성장",
    engagementType: "브랜드·콘텐츠·데이터 운영",
    focus: "지속 가능한 IP",
    details: {
      intro:
        "AI 크리에이터 영역은 유행을 복제하는 대신 누구에게 어떤 가치를 꾸준히 전달할지 설계합니다. 콘텐츠 필러와 포맷을 표준화하고 한 번의 핵심 콘텐츠를 여러 채널 자산으로 확장해 학습과 성장을 반복합니다.",
      services: [
        "개인·전문가·기업 채널 포지셔닝",
        "AI 리서치·아이디어·대본 제작 시스템",
        "롱폼·숏폼·블로그·뉴스레터 리퍼포징",
      ],
      outputs: [
        "브랜드 보이스와 콘텐츠 필러",
        "대본·썸네일·포맷 템플릿",
        "배포 캘린더와 성과 분석 리포트",
      ],
      process: [
        "전문성·시청자 분석",
        "콘텐츠 시스템 구축",
        "배포·분석·다음 기획 개선",
      ],
    },
  },
];

export default function CompanyBusinessOverview({ motionDirection }: { motionDirection?: 'left' | 'right' } = {}) {
  const [activeFieldId, setActiveFieldId] = useState(BUSINESS_FIELDS[0]!.id);
  const activeField =
    BUSINESS_FIELDS.find((field) => field.id === activeFieldId) ??
    BUSINESS_FIELDS[0]!;
  const orderedBusinessFields = [
    activeField,
    ...BUSINESS_FIELDS.filter((field) => field.id !== activeField.id),
  ];

  const selectField = (fieldId: string) => setActiveFieldId(fieldId);

  const focusField = (index: number) => {
    const field = BUSINESS_FIELDS[index];
    if (!field) return;

    selectField(field.id);
    requestAnimationFrame(() =>
      document.getElementById(`company-business-tab-${field.id}`)?.focus(),
    );
  };

  const handleFieldKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = BUSINESS_FIELDS.findIndex(
      (field) => field.id === activeField.id,
    );
    const lastIndex = BUSINESS_FIELDS.length - 1;
    const nextIndex =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? currentIndex === lastIndex
          ? 0
          : currentIndex + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? currentIndex === 0
            ? lastIndex
            : currentIndex - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;

    if (nextIndex === null) return;
    event.preventDefault();
    focusField(nextIndex);
  };

  return (
    <BusinessOverviewSection
      id="company-introduction-business"
      aria-labelledby="company-business-overview-title"
      $accent={activeField.accent}
      data-dashboard-section-motion={motionDirection ? '' : undefined}
      data-dashboard-section-motion-state={motionDirection ? 'before' : undefined}
      data-dashboard-section-direction={motionDirection}
    >
      <BusinessOverviewInner>
        <BusinessHero>
          <BusinessHeroCopy>
            <BusinessKicker>
              <BriefcaseBusiness
                size={16}
                strokeWidth={2.4}
                aria-hidden="true"
              />
              Business Areas
            </BusinessKicker>
            <h2 id="company-business-overview-title">제품소개</h2>
            <p>
              AI 웹·앱, 업무자동화, 영상제작·편집, 크리에이터 성장을 제품·서비스
              영역별로 정리했습니다. 각 항목을 선택하면 제공 범위와 주요
              산출물, 실행 흐름을 한 화면에서 확인할 수 있습니다.
            </p>
          </BusinessHeroCopy>

          <BusinessSignalPanel $accent={activeField.accent}>
            <Sparkles size={28} strokeWidth={2.2} aria-hidden="true" />
            <span>실행 영역</span>
            <strong>4</strong>
            <small>
              ‘{activeField.focus}’ 기준으로 사업 영역을 연결합니다.
            </small>
          </BusinessSignalPanel>
        </BusinessHero>

        <BusinessFieldGrid
          onKeyDown={handleFieldKeyDown}
          role="tablist"
          aria-label="제품소개 선택"
        >
          {BUSINESS_FIELDS.map((field, index) => {
            const FieldIcon = field.icon;
            const isActive = field.id === activeField.id;

            return (
              <BusinessFieldCard
                key={field.id}
                $active={isActive}
                $accent={field.accent}
              >
                <BusinessFieldButton
                  id={`company-business-tab-${field.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`company-business-details-${field.id}`}
                  onClick={() => selectField(field.id)}
                >
                  <BusinessFieldTop>
                    <BusinessFieldNumber>
                      {String(index + 1).padStart(2, "0")}
                    </BusinessFieldNumber>
                    <FieldIcon
                      size={23}
                      strokeWidth={2.35}
                      aria-hidden="true"
                    />
                  </BusinessFieldTop>
                  <BusinessFieldTitle>
                    <span>{field.eyebrow}</span>
                    <strong>{field.title}</strong>
                    <small>{field.role}</small>
                  </BusinessFieldTitle>
                  <BusinessFieldSummary>{field.summary}</BusinessFieldSummary>
                  <BusinessFieldMeta>
                    <span>{field.status}</span>
                    <span>{field.focus}</span>
                  </BusinessFieldMeta>
                </BusinessFieldButton>
              </BusinessFieldCard>
            );
          })}
        </BusinessFieldGrid>

        <BusinessAccordionSection aria-label="제품소개 상세 내용">
          {orderedBusinessFields.map((field) => {
            const isActive = field.id === activeField.id;
            const FieldIcon = field.icon;

            return (
              <BusinessAccordionItem
                key={field.id}
                $active={isActive}
                $accent={field.accent}
              >
                <BusinessAccordionButton
                  type="button"
                  aria-expanded={isActive}
                  aria-controls={`company-business-details-${field.id}`}
                  onClick={() => selectField(field.id)}
                >
                  <BusinessAccordionHeading>
                    <BusinessIconBox $accent={field.accent}>
                      <FieldIcon
                        size={21}
                        strokeWidth={2.35}
                        aria-hidden="true"
                      />
                    </BusinessIconBox>
                    <span>
                      <small>{field.eyebrow}</small>
                      <strong>{field.title}</strong>
                    </span>
                  </BusinessAccordionHeading>
                  <BusinessAccordionStatus>
                    <span>{field.status}</span>
                    <BusinessChevronWrap $active={isActive}>
                      <ChevronDown
                        size={19}
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                    </BusinessChevronWrap>
                  </BusinessAccordionStatus>
                </BusinessAccordionButton>

                <BusinessAccordionBody
                  id={`company-business-details-${field.id}`}
                  hidden={!isActive}
                >
                  <BusinessRoleIntro>
                    <strong>{field.role}</strong>
                    <p>{field.details.intro}</p>
                  </BusinessRoleIntro>

                  <BusinessDetailRows>
                    <BusinessDetailColumn>
                      <BusinessDetailLabel>
                        <ClipboardCheck
                          size={16}
                          strokeWidth={2.4}
                          aria-hidden="true"
                        />
                        핵심 제공
                      </BusinessDetailLabel>
                      <BusinessList>
                        {field.details.services.map((item) => (
                          <li key={item}>
                            <BadgeCheck
                              size={15}
                              strokeWidth={2.4}
                              aria-hidden="true"
                            />
                            {item}
                          </li>
                        ))}
                      </BusinessList>
                    </BusinessDetailColumn>

                    <BusinessDetailColumn>
                      <BusinessDetailLabel>
                        <UsersRound
                          size={16}
                          strokeWidth={2.4}
                          aria-hidden="true"
                        />
                        주요 산출
                      </BusinessDetailLabel>
                      <BusinessList>
                        {field.details.outputs.map((item) => (
                          <li key={item}>
                            <BadgeCheck
                              size={15}
                              strokeWidth={2.4}
                              aria-hidden="true"
                            />
                            {item}
                          </li>
                        ))}
                      </BusinessList>
                    </BusinessDetailColumn>

                    <BusinessDetailColumn>
                      <BusinessDetailLabel>
                        <Route size={16} strokeWidth={2.4} aria-hidden="true" />
                        진행 흐름
                      </BusinessDetailLabel>
                      <BusinessList>
                        {field.details.process.map((item) => (
                          <li key={item}>
                            <BadgeCheck
                              size={15}
                              strokeWidth={2.4}
                              aria-hidden="true"
                            />
                            {item}
                          </li>
                        ))}
                      </BusinessList>
                    </BusinessDetailColumn>
                  </BusinessDetailRows>

                  <BusinessInfoStrip>
                    <span>{field.engagementType}</span>
                    <span>{field.focus}</span>
                    <span><Bot size={15} strokeWidth={2.4} aria-hidden="true" /> SIMPLYPIG AI STUDIO</span>
                  </BusinessInfoStrip>
                </BusinessAccordionBody>
              </BusinessAccordionItem>
            );
          })}
        </BusinessAccordionSection>
      </BusinessOverviewInner>
    </BusinessOverviewSection>
  );
}

const BusinessOverviewSection = styled.section<{ $accent: string }>`
  position: relative;
  overflow: hidden;
  padding: 28px 20px;
  color: #f4f7ef;
  background:
    radial-gradient(
      circle at 12% 8%,
      ${(props) => `${props.$accent}22`},
      transparent 27%
    ),
    radial-gradient(circle at 88% 92%, rgba(96, 165, 250, 0.14), transparent 34%),
    linear-gradient(135deg, #06152e 0%, #0b2143 52%, #061126 100%);

  @media (max-width: 760px) {
    padding: 16px;
  }
`;

const BusinessOverviewInner = styled.div`
  width: min(100%, 1240px);
  margin: 0 auto;
  display: grid;
  gap: 18px;
`;

const BusinessHero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 330px);
  gap: 18px;
  align-items: stretch;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const BusinessHeroCopy = styled.div`
  min-width: 0;
  padding: 32px;
  border: 1px solid rgba(244, 247, 239, 0.12);
  border-radius: 8px;
  background: rgba(244, 247, 239, 0.055);

  h2 {
    margin: 16px 0 0;
    color: #ffffff;
    font-size: 2.55rem;
    font-weight: 950;
    line-height: 1.08;
    word-break: keep-all;
  }

  p {
    max-width: 780px;
    margin: 14px 0 0;
    color: rgba(244, 247, 239, 0.72);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.72;
    word-break: keep-all;
  }

  @media (max-width: 760px) {
    padding: 24px;

    h2 {
      font-size: 2rem;
    }
  }
`;

const BusinessKicker = styled.span`
  width: fit-content;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(244, 247, 239, 0.18);
  border-radius: 999px;
  background: rgba(244, 247, 239, 0.06);
  padding: 0 12px;
  color: rgba(244, 247, 239, 0.78);
  font-size: 0.78rem;
  font-weight: 900;
`;

const BusinessSignalPanel = styled.aside<{ $accent: string }>`
  min-width: 0;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  border: 1px solid ${(props) => `${props.$accent}55`};
  border-radius: 8px;
  background:
    linear-gradient(
      180deg,
      ${(props) => `${props.$accent}20`},
      rgba(244, 247, 239, 0.04)
    ),
    rgba(244, 247, 239, 0.045);
  padding: 24px;
  color: ${(props) => props.$accent};

  span {
    margin-top: 28px;
    color: rgba(244, 247, 239, 0.62);
    font-size: 0.78rem;
    font-weight: 900;
  }

  strong {
    margin-top: 8px;
    color: #ffffff;
    font-size: 3.3rem;
    font-weight: 950;
    line-height: 0.9;
  }

  small {
    margin-top: 12px;
    color: rgba(244, 247, 239, 0.68);
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const BusinessFieldGrid = styled.div`
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

const BusinessFieldCard = styled.article<{ $active: boolean; $accent: string }>`
  min-width: 0;
  border: 1px solid
    ${(props) =>
      props.$active ? `${props.$accent}88` : "rgba(244, 247, 239, 0.12)"};
  border-radius: 8px;
  background:
    linear-gradient(
      145deg,
      ${(props) =>
        props.$active ? `${props.$accent}19` : "rgba(244, 247, 239, 0.05)"},
      rgba(244, 247, 239, 0.028)
    ),
    rgba(9, 15, 12, 0.88);
  box-shadow: ${(props) =>
    props.$active ? `0 18px 44px ${props.$accent}16` : "none"};
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

const BusinessFieldButton = styled.button`
  width: 100%;
  min-width: 0;
  min-height: 244px;
  display: grid;
  align-content: start;
  gap: 16px;
  border: 0;
  background: transparent;
  padding: 20px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: -4px;
  }

  @media (max-width: 640px) {
    min-height: 210px;
  }
`;

const BusinessFieldTop = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;

  svg {
    color: #ffffff;
  }
`;

const BusinessFieldNumber = styled.span`
  color: rgba(244, 247, 239, 0.44);
  font-size: 0.78rem;
  font-weight: 950;
`;

const BusinessFieldTitle = styled.span`
  min-width: 0;
  display: grid;
  gap: 7px;

  span {
    color: rgba(244, 247, 239, 0.52);
    font-size: 0.72rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    color: #ffffff;
    font-size: 1.42rem;
    font-weight: 950;
    line-height: 1.16;
    word-break: keep-all;
  }

  small {
    color: rgba(244, 247, 239, 0.6);
    font-size: 0.82rem;
    font-weight: 800;
  }
`;

const BusinessFieldSummary = styled.p`
  min-width: 0;
  margin: 0;
  color: rgba(244, 247, 239, 0.72);
  font-size: 0.92rem;
  font-weight: 700;
  line-height: 1.58;
  word-break: keep-all;
`;

const BusinessFieldMeta = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: auto;

  span {
    min-height: 28px;
    border: 1px solid rgba(244, 247, 239, 0.12);
    border-radius: 999px;
    background: rgba(244, 247, 239, 0.05);
    padding: 5px 9px;
    color: rgba(244, 247, 239, 0.72);
    font-size: 0.72rem;
    font-weight: 850;
    line-height: 1.25;
  }
`;

const BusinessAccordionSection = styled.section`
  min-width: 0;
  display: grid;
  gap: 10px;
`;

const BusinessAccordionItem = styled.article<{
  $active: boolean;
  $accent: string;
}>`
  min-width: 0;
  overflow: hidden;
  border: 1px solid
    ${(props) =>
      props.$active ? `${props.$accent}88` : "rgba(244, 247, 239, 0.11)"};
  border-radius: 8px;
  background:
    linear-gradient(
      135deg,
      ${(props) =>
        props.$active ? `${props.$accent}15` : "rgba(244, 247, 239, 0.045)"},
      rgba(244, 247, 239, 0.025)
    ),
    rgba(8, 13, 11, 0.9);
`;

const BusinessAccordionButton = styled.button`
  width: 100%;
  min-width: 0;
  min-height: 84px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 0;
  background: transparent;
  padding: 18px 20px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: -4px;
  }

  @media (max-width: 560px) {
    align-items: flex-start;
  }
`;

const BusinessAccordionHeading = styled.span`
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
    text-transform: uppercase;
  }

  strong {
    color: #ffffff;
    font-size: 1.18rem;
    font-weight: 950;
    line-height: 1.2;
    word-break: keep-all;
  }
`;

const BusinessIconBox = styled.span<{ $accent: string }>`
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: ${(props) => props.$accent};
  color: #06110f;
`;

const BusinessAccordionStatus = styled.span`
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

const BusinessChevronWrap = styled.span<{ $active: boolean }>`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(244, 247, 239, 0.13);
  border-radius: 8px;
  transform: rotate(${(props) => (props.$active ? "180deg" : "0deg")});
  transition: transform 180ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const BusinessAccordionBody = styled.div`
  padding: 0 20px 20px 77px;
  animation: business-detail-reveal 220ms ease both;

  @keyframes business-detail-reveal {
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

const BusinessRoleIntro = styled.div`
  min-width: 0;

  strong {
    color: #ffffff;
    font-size: 0.98rem;
    font-weight: 950;
  }

  p {
    max-width: 900px;
    margin: 10px 0 0;
    color: rgba(244, 247, 239, 0.74);
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.72;
    word-break: keep-all;
  }
`;

const BusinessDetailRows = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
  border-top: 1px solid rgba(244, 247, 239, 0.1);
  padding-top: 18px;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const BusinessDetailColumn = styled.div`
  min-width: 0;
`;

const BusinessDetailLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 950;
`;

const BusinessList = styled.ul`
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
    font-weight: 700;
    line-height: 1.48;
    word-break: keep-all;
  }
`;

const BusinessInfoStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 20px;

  > span {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgba(244, 247, 239, 0.12);
    border-radius: 999px;
    background: rgba(244, 247, 239, 0.05);
    padding: 6px 10px;
    color: rgba(244, 247, 239, 0.72);
    font-size: 0.78rem;
    font-weight: 850;
  }
`;
