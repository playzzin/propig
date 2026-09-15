'use client';

import { useState, type KeyboardEvent } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Clapperboard,
  Handshake,
  MonitorSmartphone,
  Route,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';

type ExecutionStage = {
  eyebrow: string;
  title: string;
  objective: string;
  detail: string;
  deliverables: string[];
  checkpoint: string;
};

type ExecutionTrack = {
  id: string;
  eyebrow: string;
  title: string;
  role: string;
  summary: string;
  outcome: string;
  accent: string;
  accentSoft: string;
  icon: LucideIcon;
  stages: ExecutionStage[];
};

const EXECUTION_TRACKS: ExecutionTrack[] = [
  {
    id: 'product',
    eyebrow: '01 Product',
    title: 'AI 웹·앱 개발',
    role: 'AI Product Engineering',
    summary: '아이디어를 검증 가능한 서비스 구조와 실제 운영 제품으로 연결합니다.',
    outcome: '전략·UX·기술·운영이 끊기지 않는 프로덕션 제품',
    accent: '#1d4ed8',
    accentSoft: '#e8f0ff',
    icon: MonitorSmartphone,
    stages: [
      {
        eyebrow: 'Discover',
        title: '문제와 사용자 정의',
        objective: '기능보다 먼저 해결할 문제와 성공 기준을 선명하게 만듭니다.',
        detail: '사용자 인터뷰, 현행 업무 흐름, 검색·전환 데이터를 함께 살펴 핵심 여정과 우선순위를 정합니다.',
        deliverables: ['문제 정의서', '핵심 사용자 여정'],
        checkpoint: '측정 가능한 성공 지표 합의',
      },
      {
        eyebrow: 'Design',
        title: '서비스와 UX 설계',
        objective: '정보 구조와 화면 흐름을 빠르게 확인할 수 있는 형태로 만듭니다.',
        detail: '와이어프레임, 디자인 토큰, 권한별 화면과 AI 응답 상태를 설계해 개발 전에 사용성을 검증합니다.',
        deliverables: ['UX 프로토타입', '디자인 시스템'],
        checkpoint: '모바일·접근성·예외 흐름 검증',
      },
      {
        eyebrow: 'Build',
        title: '제품과 데이터 구축',
        objective: '프런트엔드, 데이터, 인증과 AI 기능을 안정적인 제품 구조로 구현합니다.',
        detail: '재사용 컴포넌트, 스키마, API 경계와 관리자 도구를 함께 구축해 기능 추가에도 흔들리지 않게 만듭니다.',
        deliverables: ['프로덕션 웹·앱', '관리자·데이터 구조'],
        checkpoint: '권한·성능·오류 복구 기준 통과',
      },
      {
        eyebrow: 'Validate',
        title: '통합 품질 검증',
        objective: '정상 화면뿐 아니라 느린 네트워크와 실패 상황까지 확인합니다.',
        detail: '타입 검사, 주요 사용자 여정, 키보드 접근, 반응형, 보안과 AI 응답 실패 시나리오를 실제 브라우저에서 점검합니다.',
        deliverables: ['검증 리포트', '출시·복구 체크리스트'],
        checkpoint: '데스크톱·모바일 출시 기준 충족',
      },
      {
        eyebrow: 'Operate',
        title: '출시와 성장 운영',
        objective: '사용 데이터를 다음 개선으로 연결하는 운영 루프를 정착시킵니다.',
        detail: '로그, 오류, 전환과 사용자 피드백을 읽고 개선 백로그와 릴리스 리듬을 운영 팀이 지속할 수 있게 정리합니다.',
        deliverables: ['운영 대시보드', '개선 로드맵'],
        checkpoint: '데이터 기반 개선 주기 정착',
      },
    ],
  },
  {
    id: 'automation',
    eyebrow: '02 Automation',
    title: 'AI 업무자동화',
    role: 'Intelligent Automation',
    summary: '반복 업무를 발견하고 사람의 승인과 복구가 가능한 자동화로 전환합니다.',
    outcome: '속도는 높이고 예외와 책임은 명확하게 통제하는 자동화',
    accent: '#047857',
    accentSoft: '#e1f8f0',
    icon: Workflow,
    stages: [
      {
        eyebrow: 'Measure',
        title: '업무 흐름 측정',
        objective: '시간과 오류가 많이 발생하는 반복 업무를 수치로 찾습니다.',
        detail: '담당자별 입력, 대기, 전달, 재작업 시간을 기록하고 자동화 효과와 위험을 함께 비교합니다.',
        deliverables: ['현행 프로세스 맵', '자동화 우선순위'],
        checkpoint: '효과·빈도·위험 기준 대상 확정',
      },
      {
        eyebrow: 'Control',
        title: '승인과 예외 설계',
        objective: 'AI가 할 일과 사람이 최종 판단할 지점을 구분합니다.',
        detail: '입력 검증, 승인 조건, 중복 방지, 재시도와 중단 기준을 먼저 설계해 잘못된 자동 실행을 예방합니다.',
        deliverables: ['승인 매트릭스', '예외·복구 시나리오'],
        checkpoint: '중요 외부 실행의 사람 승인 확보',
      },
      {
        eyebrow: 'Connect',
        title: '데이터와 도구 연결',
        objective: '메일, 문서, 웹, 스프레드시트와 사내 시스템을 한 흐름으로 잇습니다.',
        detail: 'API와 브라우저 자동화, AI 분류·요약을 조합하고 각 단계의 입력과 출력 형식을 명확하게 정의합니다.',
        deliverables: ['자동화 워크플로', '데이터 연결 명세'],
        checkpoint: '중복 없는 멱등 실행 확인',
      },
      {
        eyebrow: 'Observe',
        title: '기록과 모니터링',
        objective: '무엇이 언제 왜 실행되었는지 운영자가 바로 확인하게 합니다.',
        detail: '실행 상태, 처리 결과, 비용, 실패 원인과 재처리 기록을 남기는 운영 콘솔과 알림 체계를 구축합니다.',
        deliverables: ['운영 콘솔', '감사 로그·알림'],
        checkpoint: '실패 원인과 담당자 추적 가능',
      },
      {
        eyebrow: 'Scale',
        title: '안정화와 확장',
        objective: '작은 자동화를 팀 전체의 표준 업무 흐름으로 확장합니다.',
        detail: '실제 절감 시간과 오류율을 측정하고 권한, 처리량, 비용 기준을 보완해 다음 자동화 후보로 확장합니다.',
        deliverables: ['성과 리포트', '확장 운영 가이드'],
        checkpoint: '절감 효과와 안정성 동시 확인',
      },
    ],
  },
  {
    id: 'video',
    eyebrow: '03 AI Video',
    title: 'AI 영상제작·편집',
    role: 'AI Video Production',
    summary: '메시지 설계부터 생성·편집·검수·채널 변환까지 제작 흐름을 통합합니다.',
    outcome: 'AI의 속도와 편집자의 판단이 결합된 채널별 완성본',
    accent: '#be2948',
    accentSoft: '#ffe9ee',
    icon: Clapperboard,
    stages: [
      {
        eyebrow: 'Brief',
        title: '목표와 시청자 정의',
        objective: '영상이 누구에게 어떤 행동을 이끌어야 하는지 정합니다.',
        detail: '브랜드 목적, 핵심 메시지, 채널 맥락과 시청 지속 목표를 정리해 제작 판단의 기준을 만듭니다.',
        deliverables: ['크리에이티브 브리프', '성과 지표'],
        checkpoint: '한 문장 핵심 메시지 확정',
      },
      {
        eyebrow: 'Story',
        title: '대본과 장면 설계',
        objective: '정보의 순서와 감정의 리듬을 장면 단위로 설계합니다.',
        detail: '리서치 근거를 바탕으로 훅, 본문, 전환과 CTA를 구성하고 콘티와 스타일 프레임으로 시각 방향을 맞춥니다.',
        deliverables: ['대본·콘티', '스타일 프레임'],
        checkpoint: '메시지·장면·길이 정합성 확인',
      },
      {
        eyebrow: 'Create',
        title: '비주얼과 소스 제작',
        objective: '촬영과 생성형 자산을 목적에 맞는 품질로 준비합니다.',
        detail: '이미지, 영상, 보이스, 음악과 그래픽을 제작하고 출처, 사용 권한, 해상도와 색감을 함께 관리합니다.',
        deliverables: ['영상·이미지 소스', '음성·사운드 자산'],
        checkpoint: '저작권·브랜드·화질 기준 통과',
      },
      {
        eyebrow: 'Edit',
        title: '편집과 사람 검수',
        objective: 'AI 초안을 사람이 시청 경험의 완성도로 다듬습니다.',
        detail: '컷 리듬, 자막 가독성, 색보정, 사운드 밸런스와 사실 관계를 검수하고 이탈 구간을 줄입니다.',
        deliverables: ['마스터 영상', '검수 체크리스트'],
        checkpoint: '내용·자막·음향 최종 승인',
      },
      {
        eyebrow: 'Publish',
        title: '채널별 배포와 학습',
        objective: '하나의 마스터를 채널에 맞게 확장하고 반응을 학습합니다.',
        detail: '롱폼, 숏폼, 세로형, 썸네일과 자막본을 만들고 시청 유지, 클릭과 전환 데이터를 다음 편집에 반영합니다.',
        deliverables: ['채널별 납품본', '성과 분석 리포트'],
        checkpoint: '채널별 포맷·메타데이터 최적화',
      },
    ],
  },
  {
    id: 'reseller',
    eyebrow: '04 Partner',
    title: '리셀러 파트너',
    role: 'Reseller Partner System',
    summary: '파트너 발굴부터 고객 지원과 성과 관리까지 공동 성장의 기준을 만듭니다.',
    outcome: '파트너와 고객이 같은 기준으로 운영하는 재현 가능한 판매 체계',
    accent: '#1d4ed8',
    accentSoft: '#e8f0ff',
    icon: Handshake,
    stages: [
      {
        eyebrow: 'Qualify',
        title: '파트너 적합성 진단',
        objective: '고객군, 판매 역량과 제공 가치가 맞는 파트너를 선명하게 정의합니다.',
        detail: '시장, 보유 고객, 판매 방식, 기술 지원 역량과 성장 목표를 함께 검토해 협업 기준과 우선순위를 정합니다.',
        deliverables: ['파트너 프로필', '협업 적합성 기준'],
        checkpoint: '공동 목표와 역할 범위 합의',
      },
      {
        eyebrow: 'Onboard',
        title: '온보딩과 운영 기준',
        objective: '계약, 권한, 주문 흐름과 고객 인수인계 기준을 안전하게 준비합니다.',
        detail: '파트너 포털, 계정 권한, 제품 카탈로그, 가격 정책과 지원 접점을 연결해 첫 영업 전부터 같은 운영 기준을 맞춥니다.',
        deliverables: ['온보딩 체크리스트', '권한·운영 가이드'],
        checkpoint: '계정·권한·주문·지원 경로 확인',
      },
      {
        eyebrow: 'Enable',
        title: '제품·제안 역량 준비',
        objective: '파트너가 고객 과제를 제품 가치와 정확하게 연결할 수 있게 합니다.',
        detail: '제품 데모, 견적 기준, 제안 자료, 자주 묻는 질문과 성공 사례를 제공해 고객 상황별 대화와 제안을 준비합니다.',
        deliverables: ['세일즈 키트', '제품·가격 교육 자료'],
        checkpoint: '핵심 제품 메시지와 견적 기준 검수',
      },
      {
        eyebrow: 'Co-sell',
        title: '리드·견적 공동 운영',
        objective: '영업 기회가 고객 상담부터 주문까지 끊기지 않게 연결합니다.',
        detail: '리드 등록, 역할 분담, 견적 검토, 데모, 계약과 주문 상태를 함께 확인하고 필요한 기술·운영 지원을 제때 연결합니다.',
        deliverables: ['공동 영업 보드', '견적·수주 현황'],
        checkpoint: '고객 담당과 다음 행동 명확화',
      },
      {
        eyebrow: 'Review',
        title: '성과 분석과 확장',
        objective: '매출뿐 아니라 고객 성공과 파트너 운영 품질을 함께 개선합니다.',
        detail: '리드 전환, 수주, 재구매, 지원 요청과 고객 만족 데이터를 검토해 다음 교육, 캠페인과 확장 계획에 반영합니다.',
        deliverables: ['파트너 성과 리포트', '확장 실행 계획'],
        checkpoint: '다음 분기 공동 성장 목표 확정',
      },
    ],
  },
];

export default function CompanyExecutionSystem({ motionDirection }: { motionDirection?: 'left' | 'right' } = {}) {
  const [activeTrackId, setActiveTrackId] = useState(EXECUTION_TRACKS[0]!.id);
  const activeTrack = EXECUTION_TRACKS.find((track) => track.id === activeTrackId) ?? EXECUTION_TRACKS[0]!;
  const ActiveIcon = activeTrack.icon;

  const focusTrack = (index: number) => {
    const track = EXECUTION_TRACKS[index];
    if (!track) return;

    setActiveTrackId(track.id);
    requestAnimationFrame(() => document.getElementById(`company-execution-tab-${track.id}`)?.focus());
  };

  const handleTrackKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const lastIndex = EXECUTION_TRACKS.length - 1;
    const nextIndex =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? currentIndex === lastIndex
          ? 0
          : currentIndex + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
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
    focusTrack(nextIndex);
  };

  return (
    <ExecutionSection
      id="company-introduction-execution"
      aria-labelledby="company-execution-title"
      data-dashboard-section-motion={motionDirection ? '' : undefined}
      data-dashboard-section-motion-state={motionDirection ? 'before' : undefined}
      data-dashboard-section-direction={motionDirection}
    >
      <ExecutionInner>
        <ExecutionHeader>
          <ExecutionEyebrow translate="no">
            <Route size={16} strokeWidth={2.4} aria-hidden="true" />
            Integrated Execution System
          </ExecutionEyebrow>
          <h2 id="company-execution-title">통합 실행 체계</h2>
          <p>
            네 가지 전문 영역 중 하나를 선택하면 해당 사업이 실제 결과로 이어지는 다섯 단계를 확인할 수 있습니다.
            각 단계의 목표, 실행 내용, 산출물과 검증 기준까지 구체적으로 정리했습니다.
          </p>
        </ExecutionHeader>

        <ExecutionTabs role="tablist" aria-label="통합 실행 영역 선택">
          {EXECUTION_TRACKS.map((track, index) => {
            const TrackIcon = track.icon;
            const isActive = track.id === activeTrack.id;

            return (
              <ExecutionTab
                key={track.id}
                id={`company-execution-tab-${track.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="company-execution-panel"
                tabIndex={isActive ? 0 : -1}
                $active={isActive}
                $accent={track.accent}
                $accentSoft={track.accentSoft}
                onClick={() => setActiveTrackId(track.id)}
                onKeyDown={(event) => handleTrackKeyDown(event, index)}
              >
                <span>
                  <TrackIcon size={21} strokeWidth={2.35} aria-hidden="true" />
                  <small>{track.eyebrow}</small>
                </span>
                <strong>{track.title}</strong>
                <p>{track.summary}</p>
                <em>{isActive ? '5단계 보기' : '선택하기'} <ArrowRight size={15} aria-hidden="true" /></em>
              </ExecutionTab>
            );
          })}
        </ExecutionTabs>

        <ExecutionPanel
          key={activeTrack.id}
          id="company-execution-panel"
          role="tabpanel"
          aria-labelledby={`company-execution-tab-${activeTrack.id}`}
          aria-live="polite"
          style={{ '--execution-accent': activeTrack.accent, '--execution-soft': activeTrack.accentSoft } as React.CSSProperties}
        >
          <ExecutionPanelHeader>
            <ExecutionPanelIcon aria-hidden="true">
              <ActiveIcon size={28} strokeWidth={2.2} />
            </ExecutionPanelIcon>
            <div>
              <span>{activeTrack.role}</span>
              <h3>{activeTrack.title} · 5단계 실행 로드맵</h3>
              <p>{activeTrack.outcome}</p>
            </div>
          </ExecutionPanelHeader>

          <ExecutionStageGrid aria-label={`${activeTrack.title} 실행 5단계`}>
            {activeTrack.stages.map((stage, index) => (
              <ExecutionStageCard key={stage.title} data-execution-stage="">
                <ExecutionStageTop>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <span>{stage.eyebrow}</span>
                </ExecutionStageTop>
                <h4>{stage.title}</h4>
                <strong>{stage.objective}</strong>
                <p>{stage.detail}</p>
                <ExecutionDeliverables>
                  {stage.deliverables.map((deliverable) => (
                    <span key={deliverable}>{deliverable}</span>
                  ))}
                </ExecutionDeliverables>
                <ExecutionCheckpoint>
                  <BadgeCheck size={16} strokeWidth={2.4} aria-hidden="true" />
                  <span>{stage.checkpoint}</span>
                </ExecutionCheckpoint>
              </ExecutionStageCard>
            ))}
          </ExecutionStageGrid>
        </ExecutionPanel>
      </ExecutionInner>
    </ExecutionSection>
  );
}

const ExecutionSection = styled.section`
  position: relative;
  overflow: hidden;
  padding: 100px 20px;
  background:
    linear-gradient(rgba(30, 64, 175, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(30, 64, 175, 0.045) 1px, transparent 1px),
    #f6f8fc;
  background-size: 48px 48px;

  @media (max-width: 720px) {
    padding: 72px 16px;
  }
`;

const ExecutionInner = styled.div`
  width: min(1240px, 100%);
  margin: 0 auto;
`;

const ExecutionHeader = styled.header`
  max-width: 840px;

  h2 {
    margin: 16px 0 0;
    color: #14213d;
    font-size: clamp(2.1rem, 4.5vw, 3.8rem);
    font-weight: 950;
    line-height: 1.08;
    word-break: keep-all;
  }

  p {
    max-width: 780px;
    margin: 18px 0 0;
    color: #526078;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.75;
    word-break: keep-all;
  }
`;

const ExecutionEyebrow = styled.span`
  width: fit-content;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #bfd1ff;
  border-radius: 999px;
  background: #e9efff;
  padding: 0 13px;
  color: #234aa3;
  font-size: 0.76rem;
  font-weight: 950;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const ExecutionTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 42px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 580px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @media (max-width: 350px) {
    grid-template-columns: 1fr;
  }
`;

const ExecutionTab = styled.button<{ $active: boolean; $accent: string; $accentSoft: string }>`
  min-width: 0;
  min-height: 218px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border: 1px solid ${(props) => (props.$active ? props.$accent : '#dce3ee')};
  border-radius: 14px;
  background: ${(props) => (props.$active ? props.$accentSoft : 'rgba(255, 255, 255, 0.92)')};
  padding: 22px;
  color: #17213a;
  text-align: left;
  cursor: pointer;
  box-shadow: ${(props) => (props.$active ? `0 22px 44px ${props.$accent}24` : '0 12px 28px rgba(32, 46, 76, 0.06)')};
  transform: ${(props) => (props.$active ? 'translateY(-4px)' : 'none')};
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;

  > span:first-child {
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${(props) => props.$accent};
  }

  small {
    font-size: 0.7rem;
    font-style: normal;
    font-weight: 950;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  > strong {
    margin-top: 18px;
    font-size: 1.14rem;
    font-weight: 950;
    line-height: 1.25;
    word-break: keep-all;
  }

  p {
    margin: 10px 0 0;
    color: #5d6a80;
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.58;
    word-break: keep-all;
  }

  em {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: auto;
    padding-top: 18px;
    color: ${(props) => props.$accent};
    font-size: 0.78rem;
    font-style: normal;
    font-weight: 950;
  }

  &:hover {
    border-color: ${(props) => props.$accent};
    transform: translateY(-4px);
  }

  &:focus-visible {
    outline: 3px solid ${(props) => `${props.$accent}55`};
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;

    &:hover {
      transform: none;
    }
  }

  @media (max-width: 580px) {
    min-height: 224px;
    padding: 17px 15px;

    > span:first-child {
      align-items: flex-start;
    }

    small {
      font-size: 0.61rem;
    }

    > strong {
      margin-top: 15px;
      font-size: 0.98rem;
    }

    p {
      font-size: 0.73rem;
      line-height: 1.5;
    }

    em {
      font-size: 0.7rem;
    }
  }
`;

const ExecutionPanel = styled.div`
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--execution-accent) 32%, #dce3ee);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 34px 80px rgba(31, 47, 82, 0.11);
  animation: execution-panel-in 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both;

  @keyframes execution-panel-in {
    from {
      opacity: 0;
      transform: translateY(14px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ExecutionPanelHeader = styled.header`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 28px 30px;
  border-bottom: 1px solid #e5eaf2;
  background: linear-gradient(110deg, var(--execution-soft), #ffffff 70%);

  > div:last-child {
    min-width: 0;
  }

  span {
    color: var(--execution-accent);
    font-size: 0.72rem;
    font-weight: 950;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h3 {
    margin: 8px 0 0;
    color: #17213a;
    font-size: clamp(1.35rem, 2.4vw, 2rem);
    font-weight: 950;
    line-height: 1.2;
    word-break: keep-all;
  }

  p {
    margin: 8px 0 0;
    color: #5e6a7d;
    font-size: 0.9rem;
    font-weight: 750;
    line-height: 1.55;
    word-break: keep-all;
  }

  @media (max-width: 600px) {
    padding: 24px 20px;
  }
`;

const ExecutionPanelIcon = styled.div`
  width: 54px;
  height: 54px;
  flex: 0 0 54px;
  display: grid;
  place-items: center;
  border: 1px solid var(--execution-accent);
  border-radius: 12px;
  background: #ffffff;
  color: var(--execution-accent);
`;

const ExecutionStageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px;
  background: #e5eaf2;

  @media (max-width: 1120px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    background: #f7f9fc;
    padding: 16px;
  }

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const ExecutionStageCard = styled.article`
  min-width: 0;
  min-height: 430px;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  padding: 24px 20px;

  h4 {
    margin: 22px 0 0;
    color: #17213a;
    font-size: 1.08rem;
    font-weight: 950;
    line-height: 1.25;
    word-break: keep-all;
  }

  > strong {
    margin-top: 10px;
    color: #34435c;
    font-size: 0.82rem;
    font-weight: 900;
    line-height: 1.55;
    word-break: keep-all;
  }

  > p {
    margin: 12px 0 0;
    color: #667287;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.65;
    word-break: keep-all;
  }

  @media (max-width: 1120px) {
    min-height: 360px;
    border: 1px solid #e3e8f0;
    border-radius: 12px;
  }

  @media (max-width: 680px) {
    min-height: 0;
  }
`;

const ExecutionStageTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  b {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: var(--execution-accent);
    color: #ffffff;
    font-size: 0.76rem;
    font-weight: 950;
  }

  span {
    color: var(--execution-accent);
    font-size: 0.68rem;
    font-weight: 950;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
`;

const ExecutionDeliverables = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 18px;

  span {
    border-radius: 999px;
    background: var(--execution-soft);
    padding: 6px 8px;
    color: var(--execution-accent);
    font-size: 0.67rem;
    font-weight: 900;
  }
`;

const ExecutionCheckpoint = styled.footer`
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: auto;
  padding-top: 20px;
  color: var(--execution-accent);

  svg {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  span {
    font-size: 0.72rem;
    font-weight: 950;
    line-height: 1.45;
    word-break: keep-all;
  }
`;
