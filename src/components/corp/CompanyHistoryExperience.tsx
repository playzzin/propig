'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ChartLine,
  Database,
  Globe2,
  PieChart,
  Rocket,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';

type HistoryItem = {
  date: string;
  title: string;
  body: string;
  icon?: string;
  details?: string[];
};
type HistoryTone = {
  accent: string;
  accent2: string;
  icon: LucideIcon;
};
type MilestoneMotionState = 'inview' | 'past' | 'upcoming';
type HistoryStyle = CSSProperties & {
  '--history-accent': string;
  '--history-accent-2': string;
};

interface CompanyHistoryExperienceProps {
  embedded?: boolean;
  id?: string;
}

const HISTORY_TITLE = '그냥돼지 연혁';
const HISTORY_DESCRIPTION =
  '2016년부터 현재까지, 그냥돼지가 웹·앱 개발, 업무자동화, AI 영상제작·편집, 리셀러 파트너 운영을 하나의 실행 체계로 확장해 온 여정을 연도별로 정리했습니다. 제품을 만들고, 운영을 자동화하고, 이야기를 전달하며, 파트너와 함께 성장해 온 흐름을 한눈에 확인하세요.';
const PREVIEW_YEARS = ['2016', '2018', '2020', '2023', '2026'];

const HISTORY_ITEMS: readonly HistoryItem[] = [
  {
    date: '2016',
    title: '그냥돼지의 첫 제품 실험',
    body: '작은 아이디어를 실제 서비스로 옮기기 위해 웹·앱 개발의 기획, 디자인, 구현 흐름을 정리했습니다.',
    icon: 'building',
    details: ['제품 아이디어와 사용자 문제 정의', '웹·앱 개발 기본 작업 흐름 구축', '브랜드와 서비스 방향 설정'],
  },
  {
    date: '2017',
    title: '웹·앱 개발 프로젝트 확장',
    body: '소개 페이지부터 운영 도구까지 다양한 웹 프로젝트를 만들며 사용자 경험과 개발 기준을 쌓았습니다.',
    icon: 'briefcase',
    details: ['반응형 웹·앱 화면 설계', '사용자 흐름과 정보 구조 정비', '기획·디자인·개발 협업 기준 수립'],
  },
  {
    date: '2018',
    title: '운영형 웹 서비스 기준 정립',
    body: '단순 소개를 넘어 고객, 데이터, 관리자 흐름이 연결되는 운영형 웹 서비스의 기준을 만들었습니다.',
    icon: 'shield-halved',
    details: ['회원·권한·관리자 흐름 설계', '데이터 구조와 운영 화면 연결', '배포·점검 기준 정리'],
  },
  {
    date: '2019',
    title: '업무자동화 실험과 연결',
    body: '반복되는 정리, 보고, 메일, 문서 업무를 발견하고 자동화할 수 있는 흐름으로 연결하기 시작했습니다.',
    icon: 'chart-line',
    details: ['반복 업무 흐름 분석', '보고·알림 자동화 시나리오 설계', '사람 확인이 필요한 예외 기준 정의'],
  },
  {
    date: '2020',
    title: 'AI 웹·앱 제품화',
    body: 'AI 응답, 인증, 데이터, 관리자 기능을 하나의 제품 경험으로 연결하는 웹·앱 개발을 본격화했습니다.',
    icon: 'hard-drive',
    details: ['AI 기능이 결합된 서비스 화면 구현', '인증·데이터·운영 도구 통합', '실사용자 검증과 개선 주기 운영'],
  },
  {
    date: '2021',
    title: '업무자동화 서비스 고도화',
    body: 'AI 에이전트와 워크플로를 활용해 반복 업무는 줄이고, 승인과 복구가 가능한 자동화 기준을 다듬었습니다.',
    icon: 'chart-pie',
    details: ['문서·메일·데이터 처리 자동화', '승인·재시도·복구 흐름 설계', '운영 지표와 알림 체계 연결'],
  },
  {
    date: '2022',
    title: 'AI 영상제작·편집 시작',
    body: '복잡한 제품과 기술을 더 쉽게 전달할 수 있도록 기획부터 생성, 편집, 검수까지 영상 제작 흐름을 만들었습니다.',
    icon: 'check-circle',
    details: ['영상 브리프와 스토리보드 설계', 'AI 생성 자산·자막·음성 결합', '편집자 검수와 브랜드 기준 적용'],
  },
  {
    date: '2023',
    title: '영상 콘텐츠 운영 확대',
    body: '제품소개, 기업홍보, 교육, 광고를 위한 영상제작·편집 역량을 확장해 여러 채널의 메시지를 선명하게 만들었습니다.',
    icon: 'globe',
    details: ['브랜드·기술 설명 영상 제작', '숏폼과 채널별 편집본 운영', '자막·음향·색보정 품질 기준 정립'],
  },
  {
    date: '2024',
    title: '리셀러 파트너 운영 체계 구축',
    body: '파트너 발굴부터 온보딩, 제품 교육, 리드 협업, 고객 지원과 성과 분석까지 연결하는 공동 성장 기준을 만들었습니다.',
    icon: 'users',
    details: ['파트너 포털과 제품 카탈로그 정리', '가격·권한·주문 운영 기준 연결', '고객 지원과 성과 공유 흐름 구축'],
  },
  {
    date: '2025',
    title: '네 가지 전문영역 통합',
    body: '웹·앱 개발, 업무자동화, 영상제작·편집, 리셀러 파트너 운영을 하나의 실행 흐름으로 연결했습니다.',
    icon: 'star',
    details: ['제품·자동화·콘텐츠 운영 연계', '파트너와 고객 접점 통합', '성과를 다음 개선으로 연결하는 루프 정착'],
  },
  {
    date: '2026',
    title: 'AI 실행 플랫폼으로 다음 도약',
    body: '데이터와 AI를 바탕으로 더 빠르게 만들고, 더 안전하게 운영하며, 더 넓은 파트너와 성장할 다음 단계를 준비하고 있습니다.',
    icon: 'diagram-project',
    details: ['AI 기반 제품·운영 고도화', '사람의 판단이 살아 있는 자동화', '글로벌 파트너 확장 준비'],
  },
];

const HISTORY_TONES_BY_YEAR: Record<string, HistoryTone> = {
  '2016': { accent: '#f97316', accent2: '#fbbf24', icon: Building2 },
  '2017': { accent: '#38bdf8', accent2: '#22d3ee', icon: BriefcaseBusiness },
  '2018': { accent: '#22c55e', accent2: '#34d399', icon: ShieldCheck },
  '2019': { accent: '#ec4899', accent2: '#e879f9', icon: BadgeCheck },
  '2020': { accent: '#8b5cf6', accent2: '#a78bfa', icon: UsersRound },
  '2021': { accent: '#3b82f6', accent2: '#60a5fa', icon: ChartLine },
  '2022': { accent: '#14b8a6', accent2: '#2dd4bf', icon: BadgeCheck },
  '2023': { accent: '#84cc16', accent2: '#34d399', icon: Globe2 },
  '2024': { accent: '#10b981', accent2: '#4ade80', icon: Database },
  '2025': { accent: '#0ea5e9', accent2: '#38bdf8', icon: Globe2 },
  '2026': { accent: '#fb7185', accent2: '#fb923c', icon: Rocket },
};

const HISTORY_ICON_BY_NAME: Record<string, LucideIcon> = {
  building: Building2,
  city: Building2,
  briefcase: BriefcaseBusiness,
  'shield-halved': ShieldCheck,
  trophy: BadgeCheck,
  users: UsersRound,
  'chart-line': ChartLine,
  award: BadgeCheck,
  'network-wired': Globe2,
  seedling: Database,
  globe: Globe2,
  rocket: Rocket,
  'hard-drive': Database,
  'chart-pie': PieChart,
};

const FALLBACK_TONES = PREVIEW_YEARS.map((year) => HISTORY_TONES_BY_YEAR[year]!);

function getYear(value: string): string {
  return value.match(/\d{4}/)?.[0] ?? value;
}

function getTone(item: HistoryItem, index: number): HistoryTone {
  const year = getYear(item.date);
  const fallback = HISTORY_TONES_BY_YEAR[year] ?? FALLBACK_TONES[index % FALLBACK_TONES.length]!;
  const Icon = HISTORY_ICON_BY_NAME[item.icon ?? ''] ?? fallback.icon;

  return { ...fallback, icon: Icon };
}

export function CompanyHistoryExperience({
  embedded = false,
  id,
}: CompanyHistoryExperienceProps = {}) {
  const items = HISTORY_ITEMS;
  const surfaceRef = useRef<HTMLElement | null>(null);
  const scrollRootRef = useRef<HTMLElement | Window | null>(null);
  const activeIndexRef = useRef(0);
  const pinnedIndexRef = useRef<number | null>(null);
  const releasePinTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const motionSignatureRef = useRef('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [motionStates, setMotionStates] = useState<MilestoneMotionState[]>([]);
  const activeTone = items.length > 0 ? getTone(items[activeIndex] ?? items[0]!, activeIndex) : FALLBACK_TONES[0]!;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const scheduleMotionUpdate = useCallback((root: HTMLElement | Window, surface: HTMLElement) => {
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      if ((root instanceof HTMLElement && !root.isConnected) || !surface.isConnected) return;

      const milestones = Array.from(surface.querySelectorAll<HTMLElement>('[data-history-item]'));
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const isWindowRoot = root === window;
      const rootRect = isWindowRoot
        ? { top: 0, height: window.innerHeight }
        : (root as HTMLElement).getBoundingClientRect();
      const viewportHeight = Math.max(1, isWindowRoot ? window.innerHeight : (root as HTMLElement).clientHeight || rootRect.height);
      const scrollableHeight = Math.max(
        1,
        isWindowRoot
          ? document.documentElement.scrollHeight - window.innerHeight
          : (root as HTMLElement).scrollHeight - (root as HTMLElement).clientHeight,
      );
      const scrollTop = isWindowRoot ? window.scrollY : (root as HTMLElement).scrollTop;
      const pageProgress = Math.min(1, Math.max(0, scrollTop / scrollableHeight));
      const timeline = surface.querySelector<HTMLElement>('.history-timeline');
      const timelineRect = timeline?.getBoundingClientRect();
      const timelineTop = timelineRect ? timelineRect.top - rootRect.top : 0;
      const timelineHeight = Math.max(1, timelineRect?.height ?? 1);
      const timelineProgress = motionQuery.matches
        ? 1
        : Math.min(1, Math.max(0, (viewportHeight * 0.5 - timelineTop) / timelineHeight));
      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      const nextMotionStates: MilestoneMotionState[] = [];

      surface.style.setProperty('--page-scroll-progress', pageProgress.toFixed(4));
      surface.style.setProperty('--history-scroll-progress', timelineProgress.toFixed(4));

      milestones.forEach((milestone, index) => {
        const rect = milestone.getBoundingClientRect();
        const top = rect.top - rootRect.top;
        const bottom = rect.bottom - rootRect.top;
        const inView = motionQuery.matches || (bottom > viewportHeight * 0.14 && top < viewportHeight * 0.84);
        const past = !motionQuery.matches && bottom <= viewportHeight * 0.14;
        const upcoming = !motionQuery.matches && top >= viewportHeight * 0.84;
        const distance = Math.abs((top + bottom) / 2 - viewportHeight * 0.48);

        nextMotionStates[index] = inView ? 'inview' : past ? 'past' : upcoming ? 'upcoming' : 'upcoming';

        if (inView && distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      const motionSignature = nextMotionStates.join('|');
      if (motionSignature !== motionSignatureRef.current) {
        motionSignatureRef.current = motionSignature;
        setMotionStates(nextMotionStates);
      }

      if (pinnedIndexRef.current === null && nearestIndex >= 0 && nearestIndex !== activeIndexRef.current) {
        activeIndexRef.current = nearestIndex;
        setActiveIndex(nearestIndex);
      }
    });
  }, []);

  const handleRootScroll = useCallback(
    (event: Event) => {
      const root = event.currentTarget;
      const surface = surfaceRef.current;
      if (root instanceof HTMLElement && surface) {
        scheduleMotionUpdate(root, surface);
      } else if (root === window && surface) {
        scheduleMotionUpdate(window, surface);
      }
    },
    [scheduleMotionUpdate],
  );

  const setSurfaceRef = useCallback(
    (node: HTMLElement | null) => {
      const previousRoot = scrollRootRef.current;
      const embeddedMain = node && embedded ? node.closest<HTMLElement>('main') : null;
      const mainOverflowY = embeddedMain ? window.getComputedStyle(embeddedMain).overflowY : '';
      const mainIsScrollRoot = Boolean(
        embeddedMain &&
          /(auto|scroll|overlay)/.test(mainOverflowY) &&
          embeddedMain.scrollHeight > embeddedMain.clientHeight + 1,
      );
      const nextRoot: HTMLElement | Window | null = node
        ? embedded
          ? mainIsScrollRoot
            ? embeddedMain
            : window
          : node
        : null;
      if (previousRoot === nextRoot && surfaceRef.current === node) return;

      if (previousRoot !== nextRoot) previousRoot?.removeEventListener('scroll', handleRootScroll);
      surfaceRef.current = node;
      scrollRootRef.current = nextRoot;
      if (nextRoot !== previousRoot) nextRoot?.addEventListener('scroll', handleRootScroll, { passive: true });
    },
    [embedded, handleRootScroll],
  );

  useEffect(() => {
    const root = scrollRootRef.current;
    const surface = surfaceRef.current;
    if (!root || !surface || items.length === 0) return undefined;

    const timeline = surface.querySelector<HTMLElement>('.history-timeline');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const schedule = () => scheduleMotionUpdate(root, surface);

    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    motionQuery.addEventListener('change', schedule);

    const resizeObserver = new ResizeObserver(schedule);
    if (root instanceof HTMLElement) resizeObserver.observe(root);
    if (surface !== root) resizeObserver.observe(surface);
    if (timeline) resizeObserver.observe(timeline);

    schedule();

    return () => {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pageshow', schedule);
      motionQuery.removeEventListener('change', schedule);
      resizeObserver.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (releasePinTimerRef.current !== null) {
        window.clearTimeout(releasePinTimerRef.current);
        releasePinTimerRef.current = null;
      }
    };
  }, [items.length, scheduleMotionUpdate]);

  const activateMilestone = (index: number) => {
    const target = surfaceRef.current?.querySelector<HTMLElement>(`[data-history-index='${index}']`);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    pinnedIndexRef.current = index;
    activeIndexRef.current = index;
    setActiveIndex(index);
    target?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });

    if (releasePinTimerRef.current !== null) window.clearTimeout(releasePinTimerRef.current);
    releasePinTimerRef.current = window.setTimeout(() => {
      pinnedIndexRef.current = null;
    }, reducedMotion ? 0 : 900);
  };

  if (items.length === 0) {
    return (
      <EmptyState as={embedded ? 'section' : 'main'} id={id ?? (embedded ? 'company-introduction-history' : 'content-area')}>
        <strong>그냥돼지 연혁을 준비하고 있습니다.</strong>
        <p>공개할 성장 기록이 등록되면 이곳에 표시됩니다.</p>
      </EmptyState>
    );
  }

  const sectionId = id ?? (embedded ? 'company-introduction-history' : 'content-area');
  const Heading = embedded ? 'h2' : 'h1';

  return (
    <HistoryPage
      as={embedded ? 'section' : 'main'}
      ref={setSurfaceRef}
      id={sectionId}
      aria-labelledby="company-history-title"
      $embedded={embedded}
      style={{ '--active-history-accent': activeTone.accent } as CSSProperties}
    >
      <span className="history-page-progress" aria-hidden="true" />
      <div className="history-background" aria-hidden="true">
        <span className="history-background-mesh" />
        <span className="history-background-grid" />
      </div>

      <div className="history-shell">
        <header className="history-header">
          <div className="history-title-block">
            <div className="history-title-pill">
              <Building2 size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>PIG Timeline</span>
            </div>
            <Heading id="company-history-title">{HISTORY_TITLE}</Heading>
            <p>{HISTORY_DESCRIPTION}</p>
          </div>

          <aside className="history-year-window" aria-label="그냥돼지 성장 그래프">
            <div className="history-pulse-top">
              <div>
              <span className="history-pulse-eyebrow">Growth Timeline</span>
                <strong>성장 흐름 미리보기</strong>
              </div>
              <span className="history-pulse-badge">{items.length} milestones</span>
            </div>
            <div className="history-pulse-chart" aria-hidden="true">
              <svg viewBox="0 0 304 152" focusable="false">
                <defs>
                  <linearGradient id="historyPreviewStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="52%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#fb7185" />
                  </linearGradient>
                </defs>
                <path className="history-chart-glow" d="M 18 118 C 48 110, 54 86, 86 92 S 126 110, 152 104 S 190 72, 218 56 S 258 44, 286 34" />
                <path className="history-chart-line" d="M 18 118 C 48 110, 54 86, 86 92 S 126 110, 152 104 S 190 72, 218 56 S 258 44, 286 34" />
                <path className="history-chart-tracer" d="M 18 118 C 48 110, 54 86, 86 92 S 126 110, 152 104 S 190 72, 218 56 S 258 44, 286 34" />
                {[
                  { year: '2016', x: 18, y: 118, color: '#22d3ee' },
                  { year: '2018', x: 86, y: 92, color: '#38bdf8' },
                  { year: '2020', x: 152, y: 104, color: '#a78bfa' },
                  { year: '2023', x: 218, y: 56, color: '#34d399' },
                  { year: '2026', x: 286, y: 34, color: '#fb7185' },
                ].map((dot) => {
                  const activeYear = Number(getYear(items[activeIndex]?.date ?? ''));
                  const dotYear = Number(dot.year);
                  const isActive = Number.isFinite(activeYear) && dotYear <= activeYear;
                  const isCurrent = dotYear === activeYear;
                  return (
                    <circle
                      key={dot.year}
                      className={`history-chart-dot${isActive ? ' is-active' : ''}${isCurrent ? ' is-current' : ''}`}
                      cx={dot.x}
                      cy={dot.y}
                      r="6"
                      style={{ '--dot-color': dot.color } as CSSProperties}
                    />
                  );
                })}
              </svg>
              <div className="history-chart-years">
                {PREVIEW_YEARS.map((year) => (
                  <span key={year}>{year}</span>
                ))}
              </div>
            </div>
          </aside>
        </header>

        <section className="history-timeline" role="list" aria-label="그냥돼지 제품·서비스 연혁 타임라인">
          <span className="history-rail" aria-hidden="true" />
          <span className="history-rail-progress" aria-hidden="true" />
          <span className="history-rail-head" aria-hidden="true" />
          {items.map((item, index) => {
            const year = getYear(item.date);
            const tone = getTone(item, index);
            const Icon = tone.icon;
            const isActive = activeIndex === index;
            const motionState = motionStates[index] ?? (index === 0 ? 'inview' : 'upcoming');
            const style = {
              '--history-accent': tone.accent,
              '--history-accent-2': tone.accent2,
            } as HistoryStyle;

            return (
              <article
                key={`${year}-${item.title}`}
                className={`history-milestone ${index % 2 === 0 ? 'is-left' : 'is-right'} is-${motionState}${isActive ? ' is-active' : ''}`}
                role="listitem"
                data-history-item
                data-history-index={index}
                data-history-year={year}
                style={style}
              >
                <span className="history-ghost-year" aria-hidden="true">
                  {year}
                </span>
                <span className="history-node" aria-hidden="true" />
                <button
                  className="history-milestone-button"
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`${year} ${item.title}`}
                  onClick={() => activateMilestone(index)}
                >
                  <span className="history-card-top">
                    <span>
                      <span className="history-year-label">Year</span>
                      <span className="history-year">{year}</span>
                    </span>
                    <span className="history-card-icon" aria-hidden="true">
                      <Icon size={22} strokeWidth={2.15} />
                    </span>
                  </span>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                  <span className="history-card-rule" aria-hidden="true" />
                  {item.details?.length ? (
                    <ul className="history-points" aria-label={`${year} 주요 내용`}>
                      {item.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </button>
              </article>
            );
          })}
        </section>
      </div>
    </HistoryPage>
  );
}

const HistoryPage = styled.main<{ $embedded: boolean }>`
  --history-scroll-progress: 0;
  --page-scroll-progress: 0;
  --active-history-accent: #22d3ee;
  position: relative;
  flex: ${(props) => (props.$embedded ? '0 0 auto' : '1')};
  min-width: 0;
  min-height: ${(props) => (props.$embedded ? 'auto' : '0')};
  overflow: ${(props) => (props.$embedded ? 'hidden' : 'auto')};
  color: #f8fafc;
  color-scheme: dark;
  background:
    radial-gradient(circle at 20% 12%, rgba(34, 211, 238, 0.13), transparent 29%),
    radial-gradient(circle at 88% 10%, rgba(236, 72, 153, 0.12), transparent 26%),
    radial-gradient(circle at 70% 72%, rgba(251, 146, 60, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(2, 8, 23, 0.98), rgba(3, 7, 18, 0.98)),
    #020617;
  font-family: 'Pretendard Variable', Pretendard, 'SUIT Variable', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  &,
  * {
    box-sizing: border-box;
    letter-spacing: 0;
  }

  .history-page-progress {
    position: ${(props) => (props.$embedded ? 'absolute' : 'sticky')};
    top: 0;
    z-index: 40;
    display: block;
    width: 100%;
    height: 4px;
    background: linear-gradient(90deg, #22d3ee, #e879f9 52%, #fb923c);
    box-shadow: 0 0 24px rgba(34, 211, 238, 0.36);
    transform: scaleX(var(--page-scroll-progress));
    transform-origin: left center;
  }

  .history-background,
  .history-background-mesh,
  .history-background-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .history-background {
    overflow: hidden;
  }

  .history-background-mesh {
    background:
      radial-gradient(circle at 14% 2%, rgba(34, 211, 238, 0.18), transparent 24%),
      radial-gradient(circle at 76% 24%, rgba(167, 139, 250, 0.13), transparent 24%),
      radial-gradient(circle at 90% 86%, rgba(251, 113, 133, 0.11), transparent 28%);
    opacity: 0.84;
  }

  .history-background-grid {
    background:
      linear-gradient(90deg, rgba(148, 163, 184, 0.055) 1px, transparent 1px),
      linear-gradient(0deg, rgba(148, 163, 184, 0.04) 1px, transparent 1px),
      radial-gradient(circle at 50% 34%, color-mix(in srgb, var(--active-history-accent) 10%, transparent), transparent 34%);
    background-size: 78px 78px, 78px 78px, auto;
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.95), rgba(0, 0, 0, 0.2));
    opacity: 0.64;
  }

  .history-shell {
    position: relative;
    z-index: 1;
    width: min(1152px, calc(100% - 48px));
    margin: 0 auto;
    padding: 58px 0 106px;
  }

  .history-header {
    display: grid;
    grid-template-columns: minmax(0, 1.14fr) minmax(320px, 0.82fr);
    gap: 58px;
    align-items: end;
  }

  .history-title-block {
    min-width: 0;
  }

  .history-title-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    color: #cffafe;
    background: rgba(255, 255, 255, 0.08);
    box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.12);
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
  }

  .history-title-pill svg {
    color: #67e8f9;
  }

  .history-header h1,
  .history-header h2 {
    max-width: 760px;
    margin: 24px 0 0;
    color: #ffffff;
    font-size: 64px;
    font-weight: 950;
    line-height: 0.98;
    overflow-wrap: break-word;
    text-shadow: 0 26px 80px rgba(34, 211, 238, 0.16);
    word-break: keep-all;
  }

  .history-header p {
    max-width: 720px;
    margin: 20px 0 0;
    color: #cbd5e1;
    font-size: 16px;
    line-height: 1.78;
    word-break: keep-all;
  }

  .history-year-window {
    position: relative;
    min-width: 0;
    padding: 20px;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 32px;
    background:
      linear-gradient(145deg, color-mix(in srgb, var(--active-history-accent) 10%, transparent), transparent 42%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.064), rgba(255, 255, 255, 0.018)),
      rgba(15, 23, 42, 0.72);
    box-shadow:
      0 24px 72px rgba(0, 0, 0, 0.36),
      inset 1px 1px 0 rgba(255, 255, 255, 0.12),
      inset -1px -1px 0 rgba(15, 23, 42, 0.9);
    transition: border-color 0.28s ease, background 0.28s ease;
  }

  .history-pulse-top {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .history-pulse-eyebrow,
  .history-year-label {
    display: block;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 950;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .history-year-window strong {
    display: block;
    margin-top: 8px;
    color: #ffffff;
    font-size: 24px;
    font-weight: 950;
    line-height: 1.15;
    word-break: keep-all;
  }

  .history-pulse-badge {
    flex: 0 0 auto;
    min-height: 26px;
    display: inline-flex;
    align-items: center;
    padding: 0 11px;
    border-radius: 999px;
    color: #e0f2fe;
    background: rgba(148, 163, 184, 0.18);
    font-size: 10px;
    font-weight: 950;
  }

  .history-pulse-chart {
    position: relative;
    min-height: 216px;
    padding: 16px;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.13);
    border-radius: 28px;
    background:
      linear-gradient(90deg, rgba(148, 163, 184, 0.065) 1px, transparent 1px),
      linear-gradient(0deg, rgba(148, 163, 184, 0.05) 1px, transparent 1px),
      rgba(2, 6, 23, 0.74);
    background-size: 42px 42px, 42px 42px, auto;
  }

  .history-pulse-chart svg {
    display: block;
    width: 100%;
    height: 152px;
    overflow: visible;
  }

  .history-chart-glow {
    fill: none;
    stroke: rgba(236, 72, 153, 0.28);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 10;
    filter: blur(7px);
  }

  .history-chart-line {
    fill: none;
    stroke: url('#historyPreviewStroke');
    stroke-dasharray: 360;
    stroke-dashoffset: calc(360 - 360 * var(--history-scroll-progress));
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 4;
    transition: stroke-dashoffset 0.2s ease-out;
  }

  .history-chart-tracer {
    fill: none;
    stroke: #f8fafc;
    stroke-dasharray: 42 318;
    stroke-dashoffset: 0;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 5;
    filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.92)) drop-shadow(0 0 14px rgba(34, 211, 238, 0.72));
    animation: history-chart-tracer-move 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
  }

  .history-chart-dot {
    fill: #f8fafc;
    stroke: var(--dot-color);
    stroke-width: 3;
    opacity: 0.62;
    filter: drop-shadow(0 0 8px var(--dot-color));
    transition: opacity 0.24s ease, r 0.24s ease, filter 0.24s ease;
  }

  .history-chart-dot.is-active {
    opacity: 1;
    filter: drop-shadow(0 0 14px var(--dot-color));
  }

  .history-chart-dot.is-current {
    r: 8px;
  }

  .history-chart-years {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 850;
    text-align: center;
  }

  .history-timeline {
    position: relative;
    display: block;
    min-height: 1260px;
    margin-top: 82px;
    padding: 0 0 24px;
  }

  .history-rail,
  .history-rail-progress,
  .history-rail-head {
    position: absolute;
    top: 0;
    left: 50%;
    width: 2px;
    border-radius: 999px;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .history-rail {
    bottom: 0;
    background: rgba(148, 163, 184, 0.18);
    box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.8);
  }

  .history-rail-progress {
    bottom: 0;
    background: linear-gradient(180deg, #22d3ee, #a78bfa 48%, #fb923c);
    box-shadow:
      0 0 8px rgba(255, 255, 255, 0.62),
      0 0 28px rgba(34, 211, 238, 0.72),
      0 0 58px rgba(167, 139, 250, 0.32);
    transform: translateX(-50%) scaleY(var(--history-scroll-progress));
    transform-origin: top;
    will-change: transform;
  }

  .history-rail-head {
    top: calc(var(--history-scroll-progress) * 100%);
    z-index: 2;
    width: 14px;
    height: 14px;
    margin-top: -7px;
    border: 2px solid rgba(255, 255, 255, 0.92);
    border-radius: 50%;
    background: #dffcff;
    box-shadow:
      0 0 10px 3px rgba(255, 255, 255, 0.82),
      0 0 30px 8px color-mix(in srgb, var(--active-history-accent) 78%, transparent),
      0 0 82px 18px color-mix(in srgb, var(--active-history-accent) 32%, transparent);
    opacity: min(1, calc(var(--history-scroll-progress) * 7));
    will-change: top, opacity;
  }

  .history-milestone {
    --history-enter-x: 0px;
    --history-enter-rotation: 0deg;
    position: relative;
    width: calc(50% - 56px);
    min-width: 0;
    margin-bottom: 70px;
    opacity: 0.18;
    filter: blur(7px) saturate(0.7);
    transform: translate3d(var(--history-enter-x), 46px, 0) rotate(var(--history-enter-rotation));
    transform-origin: center;
    will-change: opacity, filter, transform;
    transition:
      opacity 0.42s ease,
      filter 0.42s ease,
      transform 0.72s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .history-milestone.is-left {
    margin-right: calc(50% + 56px);
    --history-enter-x: -96px;
    --history-enter-rotation: -2deg;
  }

  .history-milestone.is-right {
    margin-left: calc(50% + 56px);
    --history-enter-x: 96px;
    --history-enter-rotation: 2deg;
  }

  .history-milestone.is-inview,
  .history-milestone.is-past,
  .history-milestone.is-active {
    opacity: 1;
    filter: none;
    transform: translate3d(0, 0, 0) rotate(0);
  }

  .history-milestone.is-upcoming {
    opacity: 0.34;
    filter: blur(4px) saturate(0.78);
  }

  .history-milestone:last-child {
    margin-bottom: 0;
  }

  .history-ghost-year {
    position: absolute;
    top: 96px;
    z-index: 0;
    color: rgba(226, 232, 240, 0.1);
    font-size: 112px;
    font-weight: 950;
    line-height: 0.8;
    pointer-events: none;
    text-shadow: 0 0 34px rgba(34, 211, 238, 0.1), 0 0 80px rgba(255, 255, 255, 0.05);
    transition: color 0.32s ease, text-shadow 0.32s ease, transform 0.32s ease;
  }

  .history-milestone.is-inview .history-ghost-year,
  .history-milestone.is-active .history-ghost-year {
    color: color-mix(in srgb, var(--history-accent) 24%, rgba(248, 250, 252, 0.14));
    text-shadow:
      0 0 26px color-mix(in srgb, var(--history-accent) 36%, transparent),
      0 0 96px color-mix(in srgb, var(--history-accent) 24%, transparent);
    transform: scale(1.02);
  }

  .history-milestone.is-left .history-ghost-year {
    left: calc(100% + 142px);
  }

  .history-milestone.is-right .history-ghost-year {
    right: calc(100% + 142px);
  }

  .history-milestone-button {
    position: relative;
    z-index: 1;
    width: 100%;
    min-height: 286px;
    display: grid;
    grid-template-rows: auto auto auto 1fr;
    gap: 14px;
    padding: 28px;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-top: 3px solid var(--history-accent);
    border-radius: 30px;
    color: inherit;
    background:
      linear-gradient(145deg, color-mix(in srgb, var(--history-accent) 12%, transparent), transparent 38%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.058), rgba(255, 255, 255, 0.014)),
      rgba(15, 23, 42, 0.8);
    box-shadow:
      0 26px 72px rgba(0, 0, 0, 0.34),
      inset 1px 1px 0 rgba(255, 255, 255, 0.12),
      inset -1px -1px 0 rgba(15, 23, 42, 0.9);
    cursor: pointer;
    text-align: left;
    touch-action: manipulation;
    transition: border-color 0.26s ease, box-shadow 0.26s ease, transform 0.26s ease, background 0.26s ease;
  }

  .history-milestone.is-inview .history-milestone-button::after {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 42%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16), transparent);
    content: '';
    opacity: 0;
    pointer-events: none;
    transform: translateX(-180%) skewX(-18deg);
    animation: history-card-sweep 760ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  .history-milestone.is-inview .history-milestone-button {
    border-color: color-mix(in srgb, var(--history-accent) 42%, rgba(148, 163, 184, 0.22));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--history-accent) 12%, transparent),
      0 26px 72px rgba(0, 0, 0, 0.34),
      inset 1px 1px 0 rgba(255, 255, 255, 0.14),
      inset -1px -1px 0 rgba(15, 23, 42, 0.88);
  }

  .history-milestone.is-active .history-milestone-button,
  .history-milestone-button:hover,
  .history-milestone-button:focus-visible {
    border-color: color-mix(in srgb, var(--history-accent) 68%, rgba(148, 163, 184, 0.22));
    box-shadow:
      0 32px 86px color-mix(in srgb, var(--history-accent) 18%, transparent),
      0 26px 72px rgba(0, 0, 0, 0.34),
      inset 1px 1px 0 rgba(255, 255, 255, 0.14),
      inset -1px -1px 0 rgba(15, 23, 42, 0.88);
    transform: translateY(-8px) scale(1.01);
  }

  .history-milestone-button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--history-accent) 68%, #ffffff);
    outline-offset: 4px;
  }

  .history-milestone::before {
    position: absolute;
    top: 55px;
    width: 58px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--history-accent));
    content: '';
    opacity: 0.35;
    transform: scaleX(0.28);
    transition: transform 0.5s ease, opacity 0.5s ease;
  }

  .history-milestone.is-left::before {
    right: -58px;
  }

  .history-milestone.is-right::before {
    left: -58px;
    background: linear-gradient(90deg, var(--history-accent), transparent);
  }

  .history-milestone.is-inview::before {
    opacity: 1;
    transform: scaleX(1);
  }

  .history-node {
    position: absolute;
    top: 43px;
    z-index: 3;
    width: 24px;
    height: 24px;
    border: 4px solid #020617;
    border-radius: 999px;
    background: #020617;
    box-shadow:
      inset 0 0 0 4px var(--history-accent),
      0 0 0 8px color-mix(in srgb, var(--history-accent) 12%, transparent),
      0 0 26px var(--history-accent);
    pointer-events: none;
  }

  .history-milestone.is-left .history-node {
    right: -68px;
  }

  .history-milestone.is-right .history-node {
    left: -68px;
  }

  .history-milestone.is-inview .history-node::after,
  .history-milestone.is-active .history-node::after {
    position: absolute;
    inset: -10px;
    border: 1px solid var(--history-accent);
    border-radius: inherit;
    content: '';
    animation: history-node-pulse 2.1s ease-out infinite;
  }

  .history-card-top {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 18px;
  }

  .history-year {
    display: block;
    margin-top: 4px;
    color: #f8fafc;
    font-size: 44px;
    font-weight: 950;
    line-height: 0.95;
    opacity: 0.76;
    filter: blur(0.9px) brightness(0.86);
    text-shadow:
      0 1px 0 rgba(255, 255, 255, 0.18),
      0 0 18px rgba(248, 250, 252, 0.18),
      0 0 42px color-mix(in srgb, var(--history-accent) 18%, transparent);
    -webkit-text-stroke: 1px rgba(255, 255, 255, 0.08);
    transition: color 0.28s ease, filter 0.28s ease, opacity 0.28s ease, text-shadow 0.28s ease, transform 0.28s ease;
  }

  .history-milestone.is-inview .history-year,
  .history-milestone.is-active .history-year {
    color: #ffffff;
    opacity: 1;
    filter: blur(0) brightness(1.16);
    text-shadow:
      0 1px 0 rgba(255, 255, 255, 0.28),
      0 0 14px color-mix(in srgb, var(--history-accent) 42%, transparent),
      0 0 48px color-mix(in srgb, var(--history-accent) 32%, transparent),
      0 0 92px color-mix(in srgb, var(--history-accent) 18%, transparent);
    animation: history-year-glow 2.4s ease-in-out infinite;
  }

  .history-milestone.is-inview .history-year-label,
  .history-milestone.is-active .history-year-label {
    color: color-mix(in srgb, var(--history-accent) 82%, #ffffff);
    text-shadow: 0 0 18px color-mix(in srgb, var(--history-accent) 32%, transparent);
  }

  .history-card-icon {
    flex: 0 0 auto;
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    color: #ffffff;
    background: linear-gradient(135deg, var(--history-accent), var(--history-accent-2));
    box-shadow: 0 14px 34px color-mix(in srgb, var(--history-accent) 38%, transparent);
  }

  .history-milestone-button strong {
    position: relative;
    z-index: 1;
    color: #ffffff;
    font-size: 22px;
    font-weight: 950;
    line-height: 1.25;
    word-break: keep-all;
  }

  .history-milestone-button small {
    position: relative;
    z-index: 1;
    display: block;
    color: #dbeafe;
    font-size: 14px;
    line-height: 1.72;
    word-break: keep-all;
  }

  .history-card-rule {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 1px;
    margin: 2px 0 0;
    background: linear-gradient(90deg, var(--history-accent), transparent);
    opacity: 0.82;
  }

  .history-points {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    color: #f1f5f9;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.4;
    list-style: none;
  }

  .history-points li {
    position: relative;
    padding-left: 15px;
    word-break: keep-all;
  }

  .history-points li::before {
    position: absolute;
    top: 0.58em;
    left: 0;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--history-accent);
    box-shadow: 0 0 14px var(--history-accent);
    content: '';
  }

  @keyframes history-node-pulse {
    0% {
      opacity: 0.85;
      transform: scale(0.82);
    }
    100% {
      opacity: 0;
      transform: scale(1.82);
    }
  }

  @keyframes history-year-glow {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-4px);
    }
  }

  @keyframes history-card-sweep {
    0% {
      opacity: 0;
      transform: translateX(-180%) skewX(-18deg);
    }
    28% {
      opacity: 0.7;
    }
    100% {
      opacity: 0;
      transform: translateX(420%) skewX(-18deg);
    }
  }

  @keyframes history-chart-tracer-move {
    from {
      stroke-dashoffset: 0;
    }
    to {
      stroke-dashoffset: -318;
    }
  }

  @media (max-width: 980px) {
    .history-shell {
      width: min(100% - 36px, 1152px);
      padding-top: 42px;
    }

    .history-header {
      grid-template-columns: 1fr;
      gap: 34px;
      align-items: start;
    }

    .history-header h1,
    .history-header h2 {
      font-size: 52px;
    }

    .history-year-window {
      max-width: 520px;
    }

    .history-timeline {
      margin-top: 62px;
    }

    .history-milestone {
      width: calc(50% - 42px);
    }

    .history-milestone.is-left {
      margin-right: calc(50% + 42px);
    }

    .history-milestone.is-right {
      margin-left: calc(50% + 42px);
    }

    .history-milestone::before {
      width: 42px;
    }

    .history-milestone.is-left::before {
      right: -42px;
    }

    .history-milestone.is-right::before {
      left: -42px;
    }

    .history-milestone.is-left .history-node {
      right: -54px;
    }

    .history-milestone.is-right .history-node {
      left: -54px;
    }
  }

  @media (max-width: 620px) {
    .history-shell {
      width: min(100% - 28px, 1152px);
      padding: 30px 0 64px;
    }

    .history-title-pill {
      min-height: 32px;
      font-size: 11px;
    }

    .history-header h1,
    .history-header h2 {
      font-size: 38px;
      line-height: 1.08;
    }

    .history-header p {
      font-size: 14px;
      line-height: 1.72;
    }

    .history-year-window {
      padding: 16px;
      border-radius: 24px;
    }

    .history-year-window strong {
      font-size: 21px;
    }

    .history-pulse-chart {
      min-height: 166px;
      padding: 12px;
      border-radius: 20px;
    }

    .history-pulse-chart svg {
      height: 112px;
    }

    .history-chart-years {
      font-size: 10px;
    }

    .history-timeline {
      min-height: auto;
      margin-top: 42px;
      padding-left: 34px;
    }

    .history-rail,
    .history-rail-progress,
    .history-rail-head {
      left: 10px;
    }

    .history-milestone,
    .history-milestone.is-left,
    .history-milestone.is-right {
      width: 100%;
      margin-right: 0;
      margin-bottom: 34px;
      margin-left: 0;
      --history-enter-x: 0px;
      --history-enter-rotation: 0deg;
      transform: translate3d(0, 32px, 0);
    }

    .history-milestone.is-inview,
    .history-milestone.is-past,
    .history-milestone.is-active {
      transform: translate3d(0, 0, 0) rotate(0);
    }

    .history-milestone::before,
    .history-milestone.is-left::before,
    .history-milestone.is-right::before {
      top: 36px;
      right: auto;
      left: -34px;
      width: 34px;
      background: linear-gradient(90deg, var(--history-accent), transparent);
    }

    .history-milestone.is-left .history-node,
    .history-milestone.is-right .history-node {
      top: 24px;
      right: auto;
      left: -36px;
    }

    .history-ghost-year {
      display: none;
    }

    .history-milestone-button {
      min-height: 250px;
      padding: 22px 18px;
      border-radius: 22px;
    }

    .history-year {
      font-size: 36px;
    }

    .history-card-icon {
      width: 48px;
      height: 48px;
      border-radius: 16px;
    }

    .history-milestone-button strong {
      font-size: 20px;
    }

    .history-milestone-button small {
      font-size: 13px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      animation: none !important;
      transition: none !important;
    }

    .history-chart-line {
      stroke-dashoffset: 0 !important;
    }

    .history-milestone,
    .history-milestone.is-left,
    .history-milestone.is-right {
      opacity: 1 !important;
      filter: none !important;
      transform: none !important;
    }
  }
`;

const EmptyState = styled.main`
  flex: 1;
  display: grid;
  place-content: center;
  gap: 8px;
  min-height: 0;
  padding: 32px;
  color: #e2e8f0;
  background: #020617;
  text-align: center;

  p {
    margin: 0;
    color: rgba(226, 232, 240, 0.6);
  }
`;
