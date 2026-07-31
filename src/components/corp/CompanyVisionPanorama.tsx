'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, MoveVertical, Sparkles } from 'lucide-react';
import styled from 'styled-components';

type PanoramaDirection = 'left-right' | 'right-left' | 'vertical';

const VISION_LANES: {
  id: string;
  direction: PanoramaDirection;
  directionLabel: string;
  title: string;
  accent: string;
  items: { title: string; description: string; outcome: string }[];
}[] = [
  {
    id: 'experience',
    direction: 'left-right',
    directionLabel: 'LEFT → RIGHT',
    title: '복잡함을 이해 가능한 경험으로',
    accent: '#60a5fa',
    items: [
      {
        title: '직관적인 AI 경험',
        description: '모델과 데이터의 복잡함을 숨기고 사용자가 다음 행동을 바로 이해하는 화면을 만듭니다.',
        outcome: 'Simple by design',
      },
      {
        title: '사람 중심의 판단',
        description: 'AI는 속도를 높이고 중요한 결정과 외부 실행은 사람이 확인하는 균형을 지킵니다.',
        outcome: 'Human in control',
      },
      {
        title: '누구나 닿는 제품',
        description: '모바일, 키보드, 다양한 사용 환경에서도 정보와 기능에 차별 없이 접근하게 합니다.',
        outcome: 'Accessible always',
      },
    ],
  },
  {
    id: 'operation',
    direction: 'right-left',
    directionLabel: 'RIGHT → LEFT',
    title: '데모를 넘어 신뢰할 수 있는 운영으로',
    accent: '#5eead4',
    items: [
      {
        title: '권한과 기록의 기본기',
        description: '인증, 역할, 감사 기록과 변경 이력을 제품의 처음부터 운영 구조에 포함합니다.',
        outcome: 'Secure foundation',
      },
      {
        title: '통제 가능한 자동화',
        description: '중복 방지, 승인, 재시도와 중단 기준을 갖춰 자동화가 예측 가능한 방식으로 움직이게 합니다.',
        outcome: 'Reliable workflow',
      },
      {
        title: '복구 가능한 품질',
        description: '오류를 숨기지 않고 빠르게 발견하고 원인을 추적하며 안전하게 되돌릴 수 있게 설계합니다.',
        outcome: 'Recover with clarity',
      },
    ],
  },
  {
    id: 'growth',
    direction: 'vertical',
    directionLabel: 'TOP ↕ BOTTOM',
    title: '위아래의 신호를 연결해 지속 가능한 성장으로',
    accent: '#f5c766',
    items: [
      {
        title: '성과를 정확히 측정',
        description: '사용 시간, 전환, 오류, 시청 유지와 제작 비용을 함께 보며 실제 변화를 확인합니다.',
        outcome: 'Measure what matters',
      },
      {
        title: '근거로 빠르게 학습',
        description: '현장의 피드백과 제품 데이터를 다음 가설과 우선순위에 연결해 학습 속도를 높입니다.',
        outcome: 'Learn continuously',
      },
      {
        title: '제품과 IP를 확장',
        description: '검증된 기능, 자동화와 콘텐츠를 재사용 가능한 자산으로 축적해 더 큰 성장으로 이어갑니다.',
        outcome: 'Scale with evidence',
      },
    ],
  },
];

export default function CompanyVisionPanorama({ motionDirection }: { motionDirection?: 'left' | 'right' } = {}) {
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = sectionRef.current;
    if (!root || typeof window === 'undefined') return undefined;

    const lanes = Array.from(root.querySelectorAll<HTMLElement>('[data-vision-lane]'));
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scrollRoot = root.closest('main');

    root.dataset.visionMotion = 'ready';

    if (motionQuery.matches || !('IntersectionObserver' in window)) {
      lanes.forEach((lane) => {
        lane.dataset.visionState = 'visible';
      });
      return undefined;
    }

    lanes.forEach((lane) => {
      lane.dataset.visionState = 'pending';
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.visionState = 'visible';
          observer.unobserve(entry.target);
        });
      },
      { root: scrollRoot, rootMargin: '0px 0px -8% 0px', threshold: 0.18 },
    );

    lanes.forEach((lane) => observer.observe(lane));
    return () => observer.disconnect();
  }, []);

  return (
    <VisionSection
      ref={sectionRef}
      id="company-introduction-vision"
      aria-labelledby="company-vision-title"
      data-dashboard-section-motion={motionDirection ? '' : undefined}
      data-dashboard-section-motion-state={motionDirection ? 'before' : undefined}
      data-dashboard-section-direction={motionDirection}
    >
      <VisionGlow aria-hidden="true" />
      <VisionInner>
        <VisionHeader>
          <VisionEyebrow translate="no">
            <Sparkles size={16} strokeWidth={2.4} aria-hidden="true" />
            SIMPLYPIG VISION
          </VisionEyebrow>
          <h2 id="company-vision-title">서로 다른 방향의 신호를 하나의 성장으로 연결합니다</h2>
          <p>
            좌에서 우로는 더 쉬운 경험을, 우에서 좌로는 더 단단한 운영을, 위아래로는 현장과 전략의 학습을 연결합니다.
            세 방향의 파노라마 안에 SIMPLYPIG이 만드는 아홉 가지 변화를 담았습니다.
          </p>
        </VisionHeader>

        <VisionLaneStack>
          {VISION_LANES.map((lane, laneIndex) => (
            <VisionLane
              key={lane.id}
              data-vision-lane=""
              data-vision-state="visible"
              data-direction={lane.direction}
              style={{ '--vision-accent': lane.accent } as React.CSSProperties}
            >
              <VisionLaneHeader>
                <span>
                  {lane.direction === 'left-right' ? <ArrowRight size={19} aria-hidden="true" /> : null}
                  {lane.direction === 'right-left' ? <ArrowLeft size={19} aria-hidden="true" /> : null}
                  {lane.direction === 'vertical' ? <MoveVertical size={19} aria-hidden="true" /> : null}
                  {lane.directionLabel}
                </span>
                <strong>{lane.title}</strong>
              </VisionLaneHeader>

              <VisionTrack>
                {lane.items.map((item, itemIndex) => (
                  <VisionCard key={item.title} data-vision-card="">
                    <VisionNumber>{String(laneIndex * 3 + itemIndex + 1).padStart(2, '0')}</VisionNumber>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <span translate="no">{item.outcome}</span>
                  </VisionCard>
                ))}
              </VisionTrack>
            </VisionLane>
          ))}
        </VisionLaneStack>
      </VisionInner>
    </VisionSection>
  );
}

const VisionSection = styled.section`
  position: relative;
  overflow: hidden;
  padding: 104px 20px;
  background:
    linear-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px),
    linear-gradient(145deg, #07101f 0%, #0a1830 52%, #081221 100%);
  background-size: 56px 56px;
  color: #ffffff;

  &[data-vision-motion='ready'] [data-vision-state='pending'] {
    opacity: 0;
  }

  &[data-vision-motion='ready'] [data-vision-state='pending'][data-direction='left-right'] {
    transform: translate3d(-88px, 0, 0);
  }

  &[data-vision-motion='ready'] [data-vision-state='pending'][data-direction='right-left'] {
    transform: translate3d(88px, 0, 0);
  }

  &[data-vision-motion='ready'] [data-vision-state='pending'][data-direction='vertical'] {
    transform: translate3d(0, 72px, 0);
  }

  @media (max-width: 720px) {
    padding: 76px 16px;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-vision-lane],
    [data-vision-state] {
      opacity: 1 !important;
      transform: none !important;
      transition: none !important;
    }
  }
`;

const VisionGlow = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 10% 10%, rgba(96, 165, 250, 0.17), transparent 28%),
    radial-gradient(circle at 88% 44%, rgba(94, 234, 212, 0.12), transparent 30%),
    radial-gradient(circle at 44% 96%, rgba(245, 199, 102, 0.1), transparent 28%);
`;

const VisionInner = styled.div`
  position: relative;
  z-index: 1;
  width: min(1240px, 100%);
  margin: 0 auto;
`;

const VisionHeader = styled.header`
  max-width: 900px;

  h2 {
    margin: 18px 0 0;
    font-size: clamp(2.15rem, 4.8vw, 4.15rem);
    font-weight: 950;
    line-height: 1.08;
    word-break: keep-all;
  }

  p {
    max-width: 820px;
    margin: 20px 0 0;
    color: #bdc9da;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.75;
    word-break: keep-all;
  }
`;

const VisionEyebrow = styled.span`
  width: fit-content;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(147, 197, 253, 0.34);
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.12);
  padding: 0 13px;
  color: #a8cfff;
  font-size: 0.76rem;
  font-weight: 950;
  letter-spacing: 0.08em;
`;

const VisionLaneStack = styled.div`
  display: grid;
  gap: 18px;
  margin-top: 52px;
`;

const VisionLane = styled.div`
  overflow: hidden;
  border: 1px solid rgba(203, 213, 225, 0.14);
  border-radius: 18px;
  background: rgba(10, 24, 48, 0.74);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  transition: opacity 620ms ease, transform 720ms cubic-bezier(0.2, 0.8, 0.2, 1);

  &[data-direction='vertical'] article:nth-child(1) {
    transform: translateY(-12px);
  }

  &[data-direction='vertical'] article:nth-child(3) {
    transform: translateY(12px);
  }

  @media (max-width: 820px) {
    &[data-direction='vertical'] article:nth-child(1),
    &[data-direction='vertical'] article:nth-child(3) {
      transform: none;
    }
  }
`;

const VisionLaneHeader = styled.header`
  display: grid;
  grid-template-columns: minmax(150px, 0.34fr) minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid rgba(203, 213, 225, 0.12);
  padding: 18px 22px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--vision-accent) 14%, transparent), transparent 68%);

  span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--vision-accent);
    font-size: 0.7rem;
    font-weight: 950;
    letter-spacing: 0.08em;
  }

  strong {
    color: #eff6ff;
    font-size: 1rem;
    font-weight: 950;
    line-height: 1.4;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
    gap: 8px;
  }
`;

const VisionTrack = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));

  article + article {
    border-left: 1px solid rgba(203, 213, 225, 0.12);
  }

  @media (max-width: 820px) {
    grid-template-columns: 1fr;

    article + article {
      border-top: 1px solid rgba(203, 213, 225, 0.12);
      border-left: 0;
    }
  }
`;

const VisionCard = styled.article`
  min-width: 0;
  min-height: 248px;
  display: flex;
  flex-direction: column;
  padding: 26px 24px;
  transition: background 180ms ease, transform 180ms ease;

  h3 {
    margin: 24px 0 0;
    color: #ffffff;
    font-size: 1.2rem;
    font-weight: 950;
    line-height: 1.28;
    word-break: keep-all;
  }

  p {
    margin: 12px 0 0;
    color: #adbbcf;
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.68;
    word-break: keep-all;
  }

  > span:last-child {
    width: fit-content;
    margin-top: auto;
    padding-top: 22px;
    color: var(--vision-accent);
    font-size: 0.7rem;
    font-weight: 950;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  &:hover {
    background: color-mix(in srgb, var(--vision-accent) 9%, transparent);
    transform: translateY(-3px);
  }

  @media (max-width: 820px) {
    min-height: 220px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

const VisionNumber = styled.span`
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--vision-accent) 54%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--vision-accent) 11%, transparent);
  color: var(--vision-accent);
  font-size: 0.72rem;
  font-weight: 950;
`;
