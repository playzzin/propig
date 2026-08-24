'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import styled from 'styled-components';
import {
  Bot,
  ChevronDown,
  Clapperboard,
  Handshake,
  LockKeyhole,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

type TechnologyDetail = {
  title: string;
  body: string;
};

type TechnologyTab = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  consoleTitle: string;
  consoleBody: string;
  icon: LucideIcon;
  accent: string;
  accentSoft: string;
  metrics: readonly { value: string; label: string }[];
  capabilities: readonly {
    title: string;
    summary: string;
    chips: readonly string[];
    details: readonly TechnologyDetail[];
  }[];
};

type TechnologyVisual = {
  src: string;
  alt: string;
  stack: readonly string[];
};

const technologyTabs: readonly TechnologyTab[] = [
  {
    id: 'web',
    label: 'AI 웹·앱 개발',
    eyebrow: 'AI Web App',
    title: '업무에 바로 붙는 AI 웹앱 구조',
    description: '회사소개, ERP, CRM, 대시보드, SaaS까지 사용자가 바로 만들고 판단할 수 있는 제품 형태로 구현합니다.',
    consoleTitle: 'Live Web Console',
    consoleBody: '인증, 데이터, AI 응답, 관리자 흐름을 하나의 경험으로 연결해 실제 운영에 쓰이는 웹앱을 만듭니다.',
    icon: Bot,
    accent: '#047857',
    accentSoft: '#dff7ed',
    metrics: [
      { value: 'Next.js', label: '제품 프레임워크' },
      { value: 'AI', label: '업무 응답 레이어' },
      { value: 'ERP', label: '운영 연결' },
    ],
    capabilities: [
      {
        title: '운영형 웹제품',
        summary: '소개 페이지를 넘어 실제 업무 흐름과 다음 행동을 연결합니다.',
        chips: ['Next.js', 'React 19', 'Firebase', 'AI Search'],
        details: [
          { title: '핵심 기능', body: '콘텐츠, 문의, 관리 기능을 하나의 사용 시나리오로 연결합니다.' },
          { title: '도입 효과', body: '정적인 페이지보다 방문자가 다음 행동을 더 빠르게 선택할 수 있습니다.' },
        ],
      },
      {
        title: 'AI ERP와 대시보드',
        summary: '고객·상품·업무·성과 데이터를 판단 가능한 운영 화면으로 전환합니다.',
        chips: ['Firestore', 'Excel', 'Charts', 'Role Guard'],
        details: [
          { title: '핵심 기능', body: '입력 자료를 검증하고 집계·분석·보고 흐름으로 바꿉니다.' },
          { title: '도입 효과', body: '반복 입력과 수작업 확인 시간을 줄여 판단 속도를 높입니다.' },
        ],
      },
    ],
  },
  {
    id: 'automation',
    label: 'AI 업무자동화',
    eyebrow: 'AI Automation',
    title: '반복과 보고를 줄이는 자동화 레이어',
    description: '매일 반복되는 정리, 보고, 메일, 문서 작업을 AI 에이전트와 워크플로로 연결해 처리합니다.',
    consoleTitle: 'Automation Control',
    consoleBody: '문서·메일·파일·API 작업을 하나의 흐름으로 묶고, 검토가 필요한 지점만 사람이 확인합니다.',
    icon: Workflow,
    accent: '#0f766e',
    accentSoft: '#dff8f3',
    metrics: [
      { value: 'HITL', label: '사람 승인' },
      { value: 'API', label: '시스템 연결' },
      { value: 'LOG', label: '실행 기록' },
    ],
    capabilities: [
      {
        title: '문서와 메시지 자동화',
        summary: '계약·견적·보고서와 문의 메시지를 규칙에 맞춰 초안으로 만듭니다.',
        chips: ['DOCX', 'PDF', 'Gmail', 'Review'],
        details: [
          { title: '핵심 기능', body: '입력값을 문서 양식에 배치하고 누락 항목을 먼저 알려줍니다.' },
          { title: '도입 효과', body: '작성 시간과 형식 오류를 줄이고 검토 지점에 집중할 수 있습니다.' },
        ],
      },
      {
        title: 'ERP 작업 오케스트레이션',
        summary: '자료 검증부터 집계와 알림까지 단계별 결과를 추적합니다.',
        chips: ['RPA', 'API', 'Database', 'Workflow'],
        details: [
          { title: '핵심 기능', body: '자료 변환·계산·검증·출력 단계를 하나의 작업 흐름으로 처리합니다.' },
          { title: '도입 효과', body: '업무 담당자가 같은 데이터를 여러 번 옮기는 시간을 줄입니다.' },
        ],
      },
    ],
  },
  {
    id: 'video',
    label: 'AI 영상제작',
    eyebrow: 'AI Video Studio',
    title: '기술 설명을 영상 경험으로 바꾸는 제작 흐름',
    description: '제품소개, 기업홍보, 교육, 광고, 기술설명 영상을 AI 기반 기획과 편집 흐름으로 제작합니다.',
    consoleTitle: 'Video Render Board',
    consoleBody: '장면 생성, 자막, 음성, 편집 상태를 한 화면에서 추적해 설명을 더 이해하기 쉬운 경험으로 만듭니다.',
    icon: Clapperboard,
    accent: '#b45309',
    accentSoft: '#fff4d6',
    metrics: [
      { value: 'MASTER', label: '마스터 편집' },
      { value: '4K', label: '출력 품질' },
      { value: 'MULTI', label: '채널별 변환' },
    ],
    capabilities: [
      {
        title: '브랜드·기술 영상',
        summary: '복잡한 기술과 서비스를 짧고 선명한 메시지로 구성합니다.',
        chips: ['Storyboard', 'Runway', 'Veo', 'Edit'],
        details: [
          { title: '핵심 기능', body: '메시지와 장면 전환을 브랜드 문법에 맞춰 설계합니다.' },
          { title: '도입 효과', body: '긴 설명 문서를 이해하기 쉬운 시각 콘텐츠로 전환합니다.' },
        ],
      },
      {
        title: '숏폼·제품 시뮬레이션',
        summary: '반복 활용할 수 있는 짧은 영상과 가상 장면을 빠르게 제작합니다.',
        chips: ['Caption', 'Avatar', '3D', 'Motion'],
        details: [
          { title: '핵심 기능', body: '자막·내레이션·시각 효과를 목적에 맞춰 조합합니다.' },
          { title: '도입 효과', body: '촬영 부담 없이 다양한 채널에 맞는 콘텐츠를 확보합니다.' },
        ],
      },
    ],
  },
  {
    id: 'reseller',
    label: '리셀러 파트너',
    eyebrow: 'Partner Intelligence',
    title: '제품과 고객을 연결하는 파트너 운영망',
    description: '파트너 발굴부터 온보딩, 제품·가격 교육, 리드 협업, 고객 지원과 성과 분석까지 하나의 운영 흐름으로 연결합니다.',
    consoleTitle: 'Partner Operations Hub',
    consoleBody: '파트너별 제품 정보, 제안 자료, 영업 기회, 주문 현황과 지원 요청을 한 화면에서 연결해 공동 성장을 돕습니다.',
    icon: Handshake,
    accent: '#2563eb',
    accentSoft: '#e8f0ff',
    metrics: [
      { value: 'ONBOARD', label: '파트너 준비' },
      { value: 'DEAL', label: '공동 영업' },
      { value: 'INSIGHT', label: '성과 분석' },
    ],
    capabilities: [
      {
        title: '파트너 온보딩·세일즈 준비',
        summary: '제품 구조와 판매 기준을 표준화해 파트너가 고객에게 같은 품질로 제안할 수 있게 합니다.',
        chips: ['Partner Portal', 'Catalog', 'Quote', 'Enablement'],
        details: [
          { title: '핵심 기능', body: '제품 카탈로그, 가격 정책, 제안 자료와 교육 이력을 파트너별로 관리합니다.' },
          { title: '도입 효과', body: '온보딩 시간을 줄이고 제안 품질과 영업 대응 속도를 일정하게 유지합니다.' },
        ],
      },
      {
        title: '리드·고객 공동 운영',
        summary: '리드 배정부터 견적, 주문, 고객 지원과 성과 검토까지 파트너와 같은 기준으로 관리합니다.',
        chips: ['CRM', 'Lead Routing', 'Order', 'Analytics'],
        details: [
          { title: '핵심 기능', body: '공동 영업 상태, 고객 인수인계, 지원 이력과 매출 데이터를 파트너별로 연결합니다.' },
          { title: '도입 효과', body: '누락되는 영업 기회를 줄이고 재판매와 확장 기회를 데이터로 확인합니다.' },
        ],
      },
    ],
  },
  {
    id: 'secure',
    label: '비공개 기술',
    eyebrow: 'Secure Technology',
    title: '권한과 근거를 지키는 내부 기술 레이어',
    description: '에이전트, RAG, 비용 최적화, 지식 그래프를 권한과 보안 기준 안에서 운영합니다.',
    consoleTitle: 'Secure Technology Vault',
    consoleBody: '문서·권한·모델 흐름을 보안 기준 안에서 연결해 민감한 운영 정보도 안전하게 활용합니다.',
    icon: LockKeyhole,
    accent: '#7c3aed',
    accentSoft: '#efe8ff',
    metrics: [
      { value: 'LOCK', label: '보안 모드' },
      { value: 'RAG', label: '사내 지식' },
      { value: 'ROUTE', label: '모델 라우팅' },
    ],
    capabilities: [
      {
        title: 'Private RAG와 에이전트',
        summary: '내부 문서의 근거를 따라가며 필요한 범위 안에서 답합니다.',
        chips: ['Embedding', 'Permission', 'Citation', 'Planner'],
        details: [
          { title: '핵심 기능', body: '권한별 문서를 검색하고 답변 근거를 함께 확인합니다.' },
          { title: '도입 효과', body: '개인 기억에만 의존하지 않는 안전한 지식 활용이 가능합니다.' },
        ],
      },
      {
        title: '비용·지식 그래프 최적화',
        summary: '작업 난이도와 관계 데이터를 기준으로 더 효율적인 처리 경로를 찾습니다.',
        chips: ['Routing', 'Cache', 'Graph DB', 'Fallback'],
        details: [
          { title: '핵심 기능', body: '요청 성격에 맞는 모델과 데이터 연결 경로를 선택합니다.' },
          { title: '도입 효과', body: '안정성을 지키면서 불필요한 AI 사용 비용을 줄입니다.' },
        ],
      },
    ],
  },
];

const technologyVisuals: Record<string, TechnologyVisual> = {
  web: {
    src: '/images/corp/technology/web-app-stack.webp',
    alt: 'AI 웹 애플리케이션 기술 구조를 표현한 추상 일러스트',
    stack: ['Next.js', 'React 19', 'TypeScript', 'Firebase'],
  },
  automation: {
    src: '/images/corp/technology/automation-stack.webp',
    alt: 'AI 업무 자동화 흐름을 표현한 추상 일러스트',
    stack: ['OpenRouter', 'Firebase Functions', 'React Query', 'Zod'],
  },
  video: {
    src: '/images/corp/technology/video-stack.webp',
    alt: 'AI 영상 제작과 렌더링 파이프라인을 표현한 추상 일러스트',
    stack: ['Remotion', 'FFmpeg', 'React', 'Firebase Storage'],
  },
  reseller: {
    src: '/images/corp/technology/reseller-partner-stack.webp',
    alt: '리셀러 파트너 네트워크와 공동 영업 흐름을 표현한 추상 일러스트',
    stack: ['Partner Portal', 'CRM', 'Quote', 'Analytics'],
  },
  secure: {
    src: '/images/corp/technology/secure-stack.webp',
    alt: '보안 AI 기술의 권한과 감사 흐름을 표현한 추상 일러스트',
    stack: ['Firebase Auth', 'Firestore Rules', 'Firebase Admin', 'Sentry'],
  },
};

export default function CompanyTechnologyOverview({ motionDirection }: { motionDirection?: 'left' | 'right' } = {}) {
  const [activeTabId, setActiveTabId] = useState(technologyTabs[0]!.id);
  const [openCapabilityIndex, setOpenCapabilityIndex] = useState(0);
  const activeTab = useMemo(
    () => technologyTabs.find((tab) => tab.id === activeTabId) ?? technologyTabs[0]!,
    [activeTabId],
  );
  const ActiveIcon = activeTab.icon;
  const activeVisual = technologyVisuals[activeTab.id] ?? technologyVisuals.web;

  const selectTab = (tabId: string) => {
    setActiveTabId(tabId);
    setOpenCapabilityIndex(0);
  };

  const focusTab = (index: number) => {
    const tab = technologyTabs[index];
    if (!tab) return;

    selectTab(tab.id);
    requestAnimationFrame(() => document.getElementById(`company-technology-tab-${tab.id}`)?.focus());
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const lastIndex = technologyTabs.length - 1;
    const nextIndex =
      event.key === 'ArrowRight'
        ? currentIndex === lastIndex
          ? 0
          : currentIndex + 1
        : event.key === 'ArrowLeft'
          ? currentIndex === 0
            ? lastIndex
            : currentIndex - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? lastIndex
              : null;

    if (nextIndex === null) return;
    event.preventDefault();
    focusTab(nextIndex);
  };

  return (
    <TechnologySection
      id="company-introduction-technology"
      aria-labelledby="company-technology-overview-title"
      data-dashboard-section-motion={motionDirection ? '' : undefined}
      data-dashboard-section-motion-state={motionDirection ? 'before' : undefined}
      data-dashboard-section-direction={motionDirection}
    >
      <TechnologyInner>
        <TechnologyHeader>
          <div>
            <TechnologyEyebrow>SIMPLYPIG TECHNOLOGY</TechnologyEyebrow>
            <h2 id="company-technology-overview-title">AI를 실제 서비스로 만드는 기술 스택</h2>
            <p>
              웹·앱, 업무자동화, 영상, 리셀러 파트너, 보안 기술을 영역별로 살펴보고 실제 적용 구조와 도입 효과까지 확인할 수 있습니다.
            </p>
          </div>
        </TechnologyHeader>

        <TechnologyTabs role="tablist" aria-label="기업기술 영역 선택">
          {technologyTabs.map((tab, index) => {
            const TabIcon = tab.icon;
            const isActive = tab.id === activeTab.id;
            return (
              <TechnologyTabButton
                key={tab.id}
                id={`company-technology-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`company-technology-panel-${tab.id}`}
                $active={isActive}
                $accent={tab.accent}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <TabIcon size={17} strokeWidth={2.4} aria-hidden="true" />
                <span>{tab.label}</span>
              </TechnologyTabButton>
            );
          })}
        </TechnologyTabs>

        <TechnologyPanel
          id={`company-technology-panel-${activeTab.id}`}
          role="tabpanel"
          aria-labelledby={`company-technology-tab-${activeTab.id}`}
          style={{ '--technology-accent': activeTab.accent, '--technology-soft': activeTab.accentSoft } as React.CSSProperties}
        >
          <TechnologyPanelHead>
            <TechnologyIcon $accent={activeTab.accent} $soft={activeTab.accentSoft} aria-hidden="true">
              <ActiveIcon size={27} strokeWidth={2.2} />
            </TechnologyIcon>
            <div>
              <span>{activeTab.eyebrow}</span>
              <h3>{activeTab.title}</h3>
              <p>{activeTab.description}</p>
            </div>
          </TechnologyPanelHead>

          <TechnologyBody>
            <TechnologyConsole>
              <TechnologyConsoleTop>
                <span aria-hidden="true"><i /><i /><i /></span>
                <small>SIMPLYPIG TECHNOLOGY</small>
              </TechnologyConsoleTop>
              <TechnologyStackVisual>
                <img
                  key={activeVisual.src}
                  data-technology-stack-image
                  src={activeVisual.src}
                  alt={activeVisual.alt}
                  width={1280}
                  height={720}
                  loading="lazy"
                  decoding="async"
                />
                <TechnologyStackVisualMeta>
                  <small>ACTUAL STACK</small>
                  <div aria-label={`${activeTab.label}에 실제 적용한 기술 스택`}>
                    {activeVisual.stack.map((stack) => <span key={stack} translate="no">{stack}</span>)}
                  </div>
                </TechnologyStackVisualMeta>
              </TechnologyStackVisual>
              <strong>{activeTab.consoleTitle}</strong>
              <p>{activeTab.consoleBody}</p>
              <TechnologySignalList aria-label={`${activeTab.label} 운영 신호`}>
                <li>운영 데이터 연결</li>
                <li>검증 가능한 흐름</li>
                <li>사람 중심의 최종 판단</li>
              </TechnologySignalList>
              <TechnologyMetrics aria-label={`${activeTab.label} 핵심 지표`}>
                {activeTab.metrics.map((metric) => (
                  <article key={metric.label}>
                    <strong>{metric.value}</strong>
                    <span>{metric.label}</span>
                  </article>
                ))}
              </TechnologyMetrics>
            </TechnologyConsole>

            <TechnologyAccordion aria-label={`${activeTab.label} 상세 기능`}>
              {activeTab.capabilities.map((capability, index) => {
                const isOpen = index === openCapabilityIndex;
                const panelId = `company-technology-capability-${activeTab.id}-${index}`;
                const buttonId = `company-technology-capability-button-${activeTab.id}-${index}`;
                return (
                  <TechnologyAccordionItem key={capability.title} $open={isOpen}>
                    <TechnologyAccordionButton
                      id={buttonId}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpenCapabilityIndex(isOpen ? -1 : index)}
                    >
                      <TechnologyAccordionNumber>{String(index + 1).padStart(2, '0')}</TechnologyAccordionNumber>
                      <span>
                        <strong>{capability.title}</strong>
                        <small>{capability.summary}</small>
                      </span>
                      <ChevronDown size={20} strokeWidth={2.6} aria-hidden="true" />
                    </TechnologyAccordionButton>
                    <TechnologyAccordionPanel
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      aria-hidden={!isOpen}
                      $open={isOpen}
                    >
                      <TechnologyChipList>
                        {capability.chips.map((chip) => <span key={chip}>{chip}</span>)}
                      </TechnologyChipList>
                      <TechnologyDetailList>
                        {capability.details.map((detail) => (
                          <article key={detail.title}>
                            <strong>{detail.title}</strong>
                            <p>{detail.body}</p>
                          </article>
                        ))}
                      </TechnologyDetailList>
                    </TechnologyAccordionPanel>
                  </TechnologyAccordionItem>
                );
              })}
            </TechnologyAccordion>
          </TechnologyBody>
        </TechnologyPanel>
      </TechnologyInner>
    </TechnologySection>
  );
}

const TechnologySection = styled.section`
  position: relative;
  overflow: hidden;
  padding: 112px 20px;
  background:
    radial-gradient(circle at 8% 16%, rgba(16, 185, 129, 0.18), transparent 26%),
    radial-gradient(circle at 92% 80%, rgba(37, 99, 235, 0.14), transparent 28%),
    linear-gradient(135deg, #f4fbf8 0%, #f7fbff 56%, #fdfcf6 100%);

  &::before,
  &::after {
    content: '';
    position: absolute;
    pointer-events: none;
  }

  &::before {
    inset: 0;
    opacity: 0.65;
    background-image:
      linear-gradient(rgba(15, 23, 42, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(15, 23, 42, 0.045) 1px, transparent 1px);
    background-size: 48px 48px;
  }

  &::after {
    right: -120px;
    bottom: -180px;
    width: 480px;
    height: 480px;
    border: 1px solid rgba(15, 118, 110, 0.12);
    border-radius: 50%;
    box-shadow: 0 0 0 54px rgba(37, 99, 235, 0.04), 0 0 0 108px rgba(16, 185, 129, 0.035);
  }

  @media (max-width: 720px) {
    padding: 76px 16px;
  }
`;

const TechnologyInner = styled.div`
  position: relative;
  z-index: 1;
  width: min(1180px, 100%);
  margin: 0 auto;
`;

const TechnologyHeader = styled.header`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 28px;

  h2 {
    max-width: 820px;
    margin: 14px 0 0;
    color: #111827;
    font-size: clamp(2rem, 4vw, 3.35rem);
    font-weight: 950;
    line-height: 1.14;
    letter-spacing: -0.04em;
    word-break: keep-all;
  }

  p {
    max-width: 760px;
    margin: 18px 0 0;
    color: #475569;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.72;
    word-break: keep-all;
  }

  @media (max-width: 720px) {
    display: grid;
    align-items: start;
    gap: 20px;

    h2 {
      font-size: 2rem;
      letter-spacing: -0.035em;
    }
  }
`;

const TechnologyEyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border: 1px solid #99e9c4;
  border-radius: 999px;
  background: #e4f9ed;
  padding: 0 12px;
  color: #047857;
  font-size: 0.76rem;
  font-weight: 950;
  letter-spacing: 0.08em;
`;

const TechnologyTabs = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 42px;
  overflow-x: auto;
  padding: 4px 2px 10px;
  scrollbar-width: thin;
`;

const TechnologyTabButton = styled.button<{ $active: boolean; $accent: string }>`
  min-height: 48px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid ${(props) => (props.$active ? props.$accent : '#d7e1e7')};
  border-radius: 8px;
  background: ${(props) => (props.$active ? props.$accent : 'rgba(255, 255, 255, 0.78)')};
  padding: 0 15px;
  color: ${(props) => (props.$active ? '#ffffff' : '#475569')};
  font: inherit;
  font-size: 0.87rem;
  font-weight: 900;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, color 160ms ease;

  &:hover {
    transform: translateY(-2px);
    border-color: ${(props) => props.$accent};
    color: ${(props) => (props.$active ? '#ffffff' : props.$accent)};
  }

  &:focus-visible {
    outline: 3px solid #2563eb;
    outline-offset: 3px;
  }
`;

const TechnologyPanel = styled.div`
  margin-top: 16px;
  border: 1px solid color-mix(in srgb, var(--technology-accent) 26%, #dce5e9);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 30px 74px rgba(15, 23, 42, 0.12);
  overflow: hidden;
`;

const TechnologyPanelHead = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 30px 32px 28px;
  border-bottom: 1px solid #e3eaf0;
  background: linear-gradient(115deg, var(--technology-soft), rgba(255, 255, 255, 0.72) 54%);

  > div:last-child {
    min-width: 0;
  }

  span {
    display: block;
    color: var(--technology-accent);
    font-size: 0.72rem;
    font-weight: 950;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h3 {
    margin: 8px 0 0;
    color: #172033;
    font-size: 1.58rem;
    font-weight: 950;
    line-height: 1.2;
    word-break: keep-all;
  }

  p {
    max-width: 760px;
    margin: 9px 0 0;
    color: #526070;
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.62;
    word-break: keep-all;
  }

  @media (max-width: 640px) {
    padding: 24px 20px;

    h3 {
      font-size: 1.32rem;
    }
  }
`;

const TechnologyIcon = styled.div<{ $accent: string; $soft: string }>`
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  display: grid;
  place-items: center;
  border: 1px solid ${(props) => props.$accent};
  border-radius: 8px;
  background: ${(props) => props.$soft};
  color: ${(props) => props.$accent};
`;

const TechnologyBody = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 0.94fr) minmax(360px, 1.06fr);
  gap: 24px;
  padding: 24px 32px 32px;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 640px) {
    gap: 16px;
    padding: 16px 20px 22px;
  }
`;

const TechnologyConsole = styled.aside`
  min-height: 500px;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 40%),
    #111827;
  padding: 22px;
  color: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);

  > strong {
    margin-top: 18px;
    font-size: 1.3rem;
    font-weight: 950;
    line-height: 1.18;
  }

  > p {
    margin: 10px 0 0;
    color: #c8d4e2;
    font-size: 0.88rem;
    font-weight: 700;
    line-height: 1.62;
    word-break: keep-all;
  }
`;

const TechnologyConsoleTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;

  > span {
    display: inline-flex;
    gap: 6px;
  }

  i {
    width: 8px;
    height: 8px;
    display: block;
    border-radius: 50%;
    background: #f59e0b;
  }

  i:nth-child(2) { background: #22c55e; }
  i:nth-child(3) { background: #60a5fa; }

  small {
    color: #93c5fd;
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }
`;

const TechnologyStackVisual = styled.figure`
  position: relative;
  min-height: 176px;
  overflow: hidden;
  margin: 18px 0 0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 9px;
  background: #0b1220;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.28);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(180deg, rgba(5, 11, 22, 0.08) 0%, rgba(5, 11, 22, 0.14) 42%, rgba(5, 11, 22, 0.9) 100%),
      linear-gradient(90deg, rgba(5, 11, 22, 0.48), transparent 48%);
  }

  img {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
    display: block;
    object-fit: cover;
  }

  @media (max-width: 640px) {
    min-height: 162px;
  }
`;

const TechnologyStackVisualMeta = styled.figcaption`
  position: absolute;
  z-index: 1;
  right: 12px;
  bottom: 12px;
  left: 12px;

  small {
    display: block;
    color: #bfdbfe;
    font-size: 0.61rem;
    font-weight: 950;
    letter-spacing: 0.12em;
  }

  > div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 7px;
  }

  span {
    border: 1px solid color-mix(in srgb, var(--technology-accent) 70%, #ffffff);
    border-radius: 999px;
    background: rgba(5, 11, 22, 0.76);
    padding: 4px 7px;
    color: #ffffff;
    font-size: 0.62rem;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.01em;
    backdrop-filter: blur(8px);
  }
`;

const TechnologySignalList = styled.ul`
  display: grid;
  gap: 8px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;

  li {
    position: relative;
    padding-left: 15px;
    color: #e2e8f0;
    font-size: 0.78rem;
    font-weight: 800;
  }

  li::before {
    content: '';
    position: absolute;
    top: 0.38em;
    left: 0;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--technology-accent);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--technology-accent) 18%, transparent);
  }
`;

const TechnologyMetrics = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: auto;
  padding-top: 24px;

  article {
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    padding: 12px 9px;
  }

  strong,
  span {
    display: block;
    overflow-wrap: anywhere;
  }

  strong {
    color: #ffffff;
    font-size: 0.96rem;
    font-weight: 950;
    line-height: 1.1;
  }

  span {
    margin-top: 5px;
    color: #aab9c9;
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 1.35;
  }

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const TechnologyAccordion = styled.div`
  display: grid;
  align-content: start;
  gap: 10px;
`;

const TechnologyAccordionItem = styled.article<{ $open: boolean }>`
  overflow: hidden;
  border: 1px solid ${(props) => (props.$open ? 'color-mix(in srgb, var(--technology-accent) 50%, #dce5e9)' : '#dce5e9')};
  border-radius: 10px;
  background: ${(props) => (props.$open ? '#ffffff' : '#fbfdff')};
  box-shadow: ${(props) => (props.$open ? '0 14px 28px rgba(15, 23, 42, 0.08)' : 'none')};
`;

const TechnologyAccordionButton = styled.button`
  width: 100%;
  min-height: 92px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 12px;
  border: 0;
  background: transparent;
  padding: 16px;
  color: #172033;
  font: inherit;
  text-align: left;
  cursor: pointer;

  > span:nth-child(2) {
    min-width: 0;
  }

  strong,
  small {
    display: block;
    word-break: keep-all;
  }

  strong {
    font-size: 0.98rem;
    font-weight: 950;
    line-height: 1.25;
  }

  small {
    margin-top: 4px;
    color: #64748b;
    font-size: 0.77rem;
    font-weight: 700;
    line-height: 1.45;
  }

  svg {
    color: var(--technology-accent);
    transition: transform 180ms ease;
  }

  &[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }

  &:focus-visible {
    outline: 3px solid #2563eb;
    outline-offset: -3px;
  }
`;

const TechnologyAccordionNumber = styled.span`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--technology-soft);
  color: var(--technology-accent);
  font-size: 0.72rem;
  font-weight: 950;
`;

const TechnologyAccordionPanel = styled.div<{ $open: boolean }>`
  display: grid;
  grid-template-rows: ${(props) => (props.$open ? '1fr' : '0fr')};
  opacity: ${(props) => (props.$open ? 1 : 0)};
  transition: grid-template-rows 200ms ease, opacity 160ms ease;

  > * {
    min-height: 0;
    overflow: hidden;
  }
`;

const TechnologyChipList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0 16px 14px 62px;

  span {
    border-radius: 999px;
    background: var(--technology-soft);
    padding: 5px 8px;
    color: var(--technology-accent);
    font-size: 0.68rem;
    font-weight: 900;
  }

  @media (max-width: 520px) {
    padding-left: 16px;
  }
`;

const TechnologyDetailList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 0 16px 16px 62px;

  article {
    min-width: 0;
    border-left: 3px solid var(--technology-accent);
    background: #f8fafc;
    padding: 12px;
  }

  strong {
    color: #27364a;
    font-size: 0.78rem;
    font-weight: 950;
  }

  p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.5;
    word-break: keep-all;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    padding-left: 16px;
  }
`;
