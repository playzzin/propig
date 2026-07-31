'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBuilding,
  faBullhorn,
  faChartLine,
  faChevronDown,
  faCode,
  faFilm,
  faHelmetSafety,
  faRobot,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import styled from 'styled-components';
import { CompanyBusinessAreaSections } from '@/components/corp/CompanyBusinessAreaExperience';
import CompanyBusinessOverview from '@/components/corp/CompanyBusinessOverview';
import CompanyExecutionSystem from '@/components/corp/CompanyExecutionSystem';
import { CompanyHistoryExperience } from '@/components/corp/CompanyHistoryExperience';
import CompanyTechnologyOverview from '@/components/corp/CompanyTechnologyOverview';
import CompanyVisionPanorama from '@/components/corp/CompanyVisionPanorama';
import { getDashboardStyleCorpVariant } from '@/constants/dashboardStyleCorpRoutes';

type Dashboard2ExperienceVariant = 'introduction' | 'ceo';
type CeoDocumentTab = 'brands' | 'resume' | 'introduction' | 'analysis';

type NumberMetric = {
  label: string;
  value: number;
  unit: string;
  decimals?: number;
};

type IntroductionHeroSlide = {
  imageUrl: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  imageFit: 'contain' | 'cover';
  imagePosition: string;
  badge: string;
  accentHeading: string;
  headingSuffix: string;
  headingSecondLine: string;
  description: string;
  stats: NumberMetric[];
};

type CeoHeroAccordionItem = {
  eyebrow: string;
  title: string;
  summary: string;
  detail: string;
};

type CeoHeroMedia =
  | {
      type: 'image';
      url: string;
      alt: string;
      position: string;
    }
  | {
      type: 'youtube';
      videoId: string;
      title: string;
    };

type CeoHeroProfile = {
  id: string;
  media: CeoHeroMedia;
  badge: string;
  accentHeading: string;
  headingSuffix: string;
  headingSecondLine: string;
  description: string;
  stats: NumberMetric[];
  accordionItems: CeoHeroAccordionItem[];
};

type OperatingPanel = {
  key: string;
  eyebrow: string;
  title: string;
  summary: string;
  chartType: 'bar' | 'vertical-bar' | 'pie' | 'balance' | 'radar';
  score: string;
  accent: string;
  barData: { name: string; value: number }[];
  pieData: { name: string; value: number; color: string }[];
  balanceData: {
    name: string;
    leftLabel: string;
    leftValue: number;
    rightLabel: string;
    rightValue: number;
  }[];
};

type OperatingHighlight = {
  eyebrow: string;
  title: string;
  desc: string;
  metric: string;
  helper: string;
};

type PieMetric = OperatingPanel['pieData'][number];

type PieDonutSegment = PieMetric & {
  percentage: number;
  offset: number;
};

type BusinessOperationStage = {
  title: string;
  summary: string;
  detail: string;
  outcome: string;
};

type CeoDocumentTabOption = {
  id: CeoDocumentTab;
  label: string;
  eyebrow: string;
};

interface Dashboard2ExperienceProps {
  variant?: Dashboard2ExperienceVariant;
  enableBrandStory?: boolean;
  includeProductIntroduction?: boolean;
  includeCompanyHistory?: boolean;
}

type MotionControlProps = {
  animate?: unknown;
  initial?: unknown;
  transition?: unknown;
  variants?: unknown;
  viewport?: unknown;
  whileHover?: unknown;
  whileInView?: unknown;
};

type MotionlessProps<T extends HTMLElement> = React.HTMLAttributes<T> & MotionControlProps;

function stripMotionProps<T extends HTMLElement>({
  animate,
  initial,
  transition,
  variants,
  viewport,
  whileHover,
  whileInView,
  ...props
}: MotionlessProps<T>): React.HTMLAttributes<T> {
  void animate;
  void initial;
  void transition;
  void variants;
  void viewport;
  void whileHover;
  void whileInView;
  return props;
}

const motion = {
  article: React.forwardRef<HTMLElement, MotionlessProps<HTMLElement>>(function MotionlessArticle(props, ref) {
    return <article ref={ref} {...stripMotionProps(props)} />;
  }),
  div: React.forwardRef<HTMLDivElement, MotionlessProps<HTMLDivElement>>(function MotionlessDiv(props, ref) {
    return <div ref={ref} {...stripMotionProps(props)} />;
  }),
  em: React.forwardRef<HTMLElement, MotionlessProps<HTMLElement>>(function MotionlessEm(props, ref) {
    return <em ref={ref} {...stripMotionProps(props)} />;
  }),
  h1: React.forwardRef<HTMLHeadingElement, MotionlessProps<HTMLHeadingElement>>(function MotionlessH1(props, ref) {
    return <h1 ref={ref} {...stripMotionProps(props)} />;
  }),
  h2: React.forwardRef<HTMLHeadingElement, MotionlessProps<HTMLHeadingElement>>(function MotionlessH2(props, ref) {
    return <h2 ref={ref} {...stripMotionProps(props)} />;
  }),
  i: React.forwardRef<HTMLElement, MotionlessProps<HTMLElement>>(function MotionlessI(props, ref) {
    return <i ref={ref} {...stripMotionProps(props)} />;
  }),
  nav: React.forwardRef<HTMLElement, MotionlessProps<HTMLElement>>(function MotionlessNav(props, ref) {
    return <nav ref={ref} {...stripMotionProps(props)} />;
  }),
  p: React.forwardRef<HTMLParagraphElement, MotionlessProps<HTMLParagraphElement>>(function MotionlessP(props, ref) {
    return <p ref={ref} {...stripMotionProps(props)} />;
  }),
  section: React.forwardRef<HTMLElement, MotionlessProps<HTMLElement>>(function MotionlessSection(props, ref) {
    return <section ref={ref} {...stripMotionProps(props)} />;
  }),
  span: React.forwardRef<HTMLSpanElement, MotionlessProps<HTMLSpanElement>>(function MotionlessSpan(props, ref) {
    return <span ref={ref} {...stripMotionProps(props)} />;
  }),
};

const heroImageUrl =
  'https://firebasestorage.googleapis.com/v0/b/cyee-9c1e4.firebasestorage.app/o/gallery%2Fai-images%2Flogo%2Flogo_1779750129138.png?alt=media&token=579fa7a2-e3f4-4817-b516-12905bb4b391';

const introductionHeroSlides: IntroductionHeroSlide[] = [
  {
    imageUrl: '/propig-favicon.svg',
    imageAlt: 'SIMPLYPIG 브랜드 심볼',
    imageWidth: 512,
    imageHeight: 512,
    imageFit: 'contain',
    imagePosition: 'center',
    badge: 'SIMPLYPIG · AI CREATIVE TECHNOLOGY',
    accentHeading: '복잡한 기술',
    headingSuffix: '을',
    headingSecondLine: '단순한 성장으로 만듭니다',
    description:
      'SIMPLYPIG는 AI 웹·앱 개발, 업무자동화, 영상 제작·편집, 리셀러 파트너 운영을 하나의 실행 체계로 연결합니다. 이미지를 눌러 네 개의 전문 영역을 만나보세요.',
    stats: [
      { label: '전문 제품·서비스', value: 4, unit: '개' },
      { label: '통합 실행흐름', value: 1, unit: '개' },
      { label: '품질 검증단계', value: 6, unit: '단계' },
    ],
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1200&q=84',
    imageAlt: 'AI 웹서비스를 함께 설계하고 개발하는 제품팀',
    imageWidth: 1200,
    imageHeight: 900,
    imageFit: 'cover',
    imagePosition: 'center',
    badge: '01 · AI PRODUCT ENGINEERING',
    accentHeading: 'AI 웹·앱',
    headingSuffix: '을',
    headingSecondLine: '운영 가능한 제품으로',
    description:
      '전략과 UX부터 프론트엔드, 백엔드, 인증, 데이터, AI 기능, 배포까지 하나의 제품팀처럼 설계하고 구현합니다.',
    stats: [
      { label: '제품 레이어', value: 5, unit: '영역' },
      { label: '지원 디바이스', value: 3, unit: '유형' },
      { label: '운영 기준', value: 1, unit: '체계' },
    ],
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=84',
    imageAlt: '데이터와 시스템을 연결하는 AI 업무자동화 기술',
    imageWidth: 1200,
    imageHeight: 900,
    imageFit: 'cover',
    imagePosition: 'center',
    badge: '02 · INTELLIGENT AUTOMATION',
    accentHeading: '반복 업무',
    headingSuffix: '는',
    headingSecondLine: '안전한 자동화 흐름으로',
    description:
      '문서, 메일, 웹, 스프레드시트, 사내 시스템을 AI·API·RPA로 연결하고 승인, 예외, 재시도, 기록까지 통제합니다.',
    stats: [
      { label: '자동화 핵심축', value: 4, unit: '개' },
      { label: '사람 승인단계', value: 1, unit: '기준' },
      { label: '운영 안전장치', value: 5, unit: '종' },
    ],
  },
  {
    imageUrl: '/images/corp/technology/reseller-partner-stack.png',
    imageAlt: '리셀러 파트너 네트워크와 공동 영업 운영 화면',
    imageWidth: 1536,
    imageHeight: 1024,
    imageFit: 'cover',
    imagePosition: 'center',
    badge: '03 · AI MEDIA & RESELLER PARTNER',
    accentHeading: '영상과 파트너',
    headingSuffix: '를',
    headingSecondLine: '고객 접점으로',
    description:
      '기획, 생성, 편집, 자막, 사운드, 채널별 변환과 제품 정보, 영업 도구, 파트너 지원을 연결해 고객에게 일관된 제안을 전달합니다.',
    stats: [
      { label: '핵심 포맷', value: 4, unit: '종' },
      { label: '제작 파이프라인', value: 6, unit: '단계' },
      { label: '파트너 운영', value: 1, unit: '체계' },
    ],
  },
];

const heroStats: NumberMetric[] = [
  { label: '전문 제품·서비스', value: 4, unit: '개' },
  { label: '통합 실행흐름', value: 1, unit: '개' },
  { label: '품질 검증단계', value: 6, unit: '단계' },
];

const operatingHighlights = [
  {
    eyebrow: '사업 포트폴리오',
    title: '4대 전문영역의 연결',
    desc: '제품, 자동화, 영상, 리셀러 파트너 영역의 실행 비중을 한눈에 확인합니다.',
    metric: 'PIE',
    helper: '전문영역 구성',
  },
  {
    eyebrow: '실행 파이프라인',
    title: '전략부터 운영까지',
    desc: '기획, 구축, 자동화, 운영의 준비 수준을 세로 막대로 비교합니다.',
    metric: 'BAR',
    helper: '실행 준비도',
  },
  {
    eyebrow: '품질 균형',
    title: '5개 품질 기준 점검',
    desc: 'UX, AI, 미디어, 보안, 데이터의 균형을 레이더 그래프로 비교합니다.',
    metric: 'RADAR',
    helper: '통합 품질 분석',
  },
];

const operatingPanels: OperatingPanel[] = [
  {
    key: 'ai-business-share',
    eyebrow: 'SIMPLYPIG BUSINESS MIX',
    title: '4대 사업영역 구성 그래프',
    summary: 'AI 제품, 업무자동화, 영상제작, 리셀러 파트너 운영을 하나의 실행 포트폴리오로 보여줍니다.',
    chartType: 'pie',
    score: '88%',
    accent: '#00b894',
    barData: [],
    pieData: [
      { name: 'AI 제품', value: 30, color: '#00b894' },
      { name: '자동화', value: 25, color: '#4f7cff' },
      { name: 'AI 영상', value: 23, color: '#ff8a00' },
      { name: '리셀러 파트너', value: 22, color: '#2563eb' },
    ],
    balanceData: [],
  },
  {
    key: 'delivery-readiness',
    eyebrow: 'DELIVERY READINESS',
    title: '실행 파이프라인 준비도',
    summary: '전략, 제품 구축, 자동화, 운영 전환이 연결되는 수준을 세로 막대로 비교합니다.',
    chartType: 'vertical-bar',
    score: '92%',
    accent: '#4f7cff',
    barData: [
      { name: '전략', value: 90 },
      { name: '구축', value: 92 },
      { name: '자동화', value: 88 },
      { name: '운영', value: 86 },
    ],
    pieData: [],
    balanceData: [],
  },
  {
    key: 'quality-radar',
    eyebrow: 'AI QUALITY SYSTEM',
    title: '통합 품질 레이더 그래프',
    summary: 'UX, AI 활용성, 미디어 완성도, 보안, 데이터 구조의 균형을 비교합니다.',
    chartType: 'radar',
    score: '86%',
    accent: '#7c3aed',
    barData: [
      { name: 'UX 설계', value: 92 },
      { name: 'AI 활용', value: 88 },
      { name: '미디어 품질', value: 90 },
      { name: '보안·권한', value: 86 },
      { name: '데이터 구조', value: 89 },
    ],
    pieData: [],
    balanceData: [],
  },
];

const visionPillars = [
  {
    title: '복잡성을 단순한 경험으로',
    desc: 'AI 모델과 데이터의 복잡함은 숨기고 사용자가 바로 이해하고 행동할 수 있는 경험으로 번역합니다.',
    tone: '#4f7cff',
  },
  {
    title: '데모보다 운영 가능한 제품',
    desc: '빠른 프로토타입의 장점을 살리면서 권한, 기록, 복구, 유지보수까지 실제 운영 기준을 갖춥니다.',
    tone: '#00b894',
  },
  {
    title: '근거로 학습하는 성장',
    desc: '제품 사용과 업무 시간, 콘텐츠 반응을 다음 의사결정에 연결해 지속적인 개선 구조를 만듭니다.',
    tone: '#ff8a00',
  },
];

const businessCards = [
  {
    icon: faCode,
    title: 'AI 웹·앱 개발',
    desc: '전략, UX, 데이터, AI 기능, 배포를 하나의 제품 흐름으로 연결합니다.',
    detail: '브랜드 사이트, SaaS, ERP·CRM, 관리자 도구, PWA와 하이브리드 앱을 구현합니다.',
    color: '#4f7cff',
  },
  {
    icon: faRobot,
    title: 'AI 업무자동화',
    desc: '반복 업무를 AI·API·RPA로 연결하고 승인과 예외를 통제합니다.',
    detail: '문서, 메일, 웹, 데이터 처리의 속도와 일관성을 높이고 감사 가능한 기록을 남깁니다.',
    color: '#7c3aed',
  },
  {
    icon: faFilm,
    title: 'AI 영상제작·편집',
    desc: '기획, 생성형 비주얼, 편집, 자막, 사운드를 제작 파이프라인으로 묶습니다.',
    detail: '브랜드 필름, 제품 데모, 교육 영상, 유튜브 롱폼과 숏폼을 채널에 맞게 제작합니다.',
    color: '#00b894',
  },
  {
    icon: faBullhorn,
    title: '리셀러 파트너',
    desc: '제품·가격·제안 자료와 고객 지원 기준을 파트너 운영 시스템으로 연결합니다.',
    detail: '온보딩, 리드 배정, 견적, 주문, 고객 인수인계와 성과 분석으로 공동 성장을 돕습니다.',
    color: '#2563eb',
  },
];

const businessOperationStages: BusinessOperationStage[] = [
  {
    title: '문제 발견',
    summary: '사용자와 업무, 데이터의 핵심 문제를 정의합니다.',
    detail: '인터뷰와 현행 흐름 분석을 통해 반복 작업, 정보 단절, 전환 저하, 콘텐츠 병목을 구체적인 우선순위로 바꿉니다.',
    outcome: '문제 정의와 성공 기준 확정',
  },
  {
    title: '서비스 설계',
    summary: '화면, 데이터, AI, 콘텐츠의 전체 구조를 설계합니다.',
    detail: '정보 구조와 사용자 여정, 권한, AI 입력·출력, 사람 승인 지점, 측정 지표를 하나의 실행 가능한 설계로 정리합니다.',
    outcome: 'UX 프로토타입과 기술 구조 확정',
  },
  {
    title: '제품 구축',
    summary: '검증된 가설을 실제 제품과 제작 흐름으로 구현합니다.',
    detail: '재사용 가능한 컴포넌트와 스키마를 기반으로 웹·앱, AI 기능, 자동화, 미디어 자산과 운영 도구를 연결합니다.',
    outcome: '프로덕션 제품과 운영 콘솔 완성',
  },
  {
    title: '품질 검증',
    summary: '기능과 접근성, 성능, 보안, 콘텐츠 품질을 점검합니다.',
    detail: '자동 검사와 실제 브라우저 검증을 결합해 모바일, 느린 네트워크, 권한 부족, 중복 실행, 생성 오류 같은 상황까지 확인합니다.',
    outcome: '출시 기준과 복구 시나리오 확보',
  },
  {
    title: '운영과 성장',
    summary: '사용과 성과 데이터를 다음 버전에 반영합니다.',
    detail: '제품 로그, 업무 시간, 오류, 전환, 시청 데이터를 읽고 개선 가설과 백로그를 쌓아 팀이 지속적으로 성장할 수 있게 합니다.',
    outcome: '측정 가능한 성장 루프 정착',
  },
];


const ceoHeroStats: NumberMetric[] = [
  { label: '대표 상세 소개서', value: 3, unit: '가지' },
  { label: '판단 루프', value: 4, unit: '단계' },
  { label: '현장 기준', value: 100, unit: '%' },
];

const ceoHeroAccordionItems: CeoHeroAccordionItem[] = [
  {
    eyebrow: '01 / Message',
    title: '대표 메시지',
    summary: '말보다 실행 기준으로 남는 리더십',
    detail:
      '대표소개는 긴 인사말보다 조직이 반복해서 따라갈 수 있는 기준을 먼저 보여줘야 합니다. 현장, 책임, 신뢰를 핵심 메시지로 정리했습니다.',
  },
  {
    eyebrow: '02 / Field',
    title: '현장 중심 기준',
    summary: '책상 위 계획보다 현장 신호를 먼저 확인',
    detail:
      '운영 판단은 현장 상황, 구성원의 반응, 고객의 요구에서 출발합니다. 사진 옆에 핵심 기준을 배치해 대표의 방향이 첫 화면에서 바로 읽히도록 했습니다.',
  },
  {
    eyebrow: '03 / Decision',
    title: '의사결정 방식',
    summary: '경청, 판단, 실행, 회고로 이어지는 루프',
    detail:
      '문제를 확인하고 기준을 선택한 뒤 실행을 위임하며 결과를 기록합니다. 대표의 역할을 단순 소개가 아니라 실행 구조로 보여줍니다.',
  },
  {
    eyebrow: '04 / People',
    title: '구성원과 협력사',
    summary: '팀과 파트너가 같은 기준으로 움직이는 구조',
    detail:
      '리더 한 명의 감각에 의존하지 않고, 구성원과 협력사가 이해할 수 있는 언어로 운영 기준을 공유하는 것을 강조했습니다.',
  },
  {
    eyebrow: '05 / Trust',
    title: '책임 경영 약속',
    summary: '결정의 이유와 결과가 기록으로 남는 방식',
    detail:
      '신뢰는 좋은 문구보다 반복 가능한 실행에서 만들어집니다. 결정의 이유, 실행 과정, 결과 회고를 함께 남기는 책임 경영을 전면에 배치했습니다.',
  },
];

const ceoHeroProfiles: CeoHeroProfile[] = [
  {
    id: 'field-execution',
    media: {
      type: 'image',
      url:
        'https://firebasestorage.googleapis.com/v0/b/propig-63524.firebasestorage.app/o/images%2Falbums%2FeQ1HpopP0IN7FIiUq55E%2Foriginals%2Fupload_1780878151365_0_ChatGPT-Image-2026%EB%85%84-6%EC%9B%94-6%EC%9D%BC-%EC%98%A4%EC%A0%84-01_00_13.png?alt=media&token=b1af846e-ebce-41a8-98b0-25b525d8d626',
      alt: '대표 소개 사진 - 현장과 실행 리더십',
      position: 'center 18%',
    },
    badge: 'CEO PROFILE · 01 / 03',
    accentHeading: '현장과 실행',
    headingSuffix: '으로',
    headingSecondLine: '변화를 만드는 리더십',
    description: '현장의 신호를 먼저 읽고, 실행과 책임으로 결과를 만드는 대표의 기준을 소개합니다.',
    stats: ceoHeroStats,
    accordionItems: ceoHeroAccordionItems,
  },
  {
    id: 'people-trust',
    media: {
      type: 'image',
      url:
        'https://firebasestorage.googleapis.com/v0/b/propig-63524.firebasestorage.app/o/images%2Falbums%2FeQ1HpopP0IN7FIiUq55E%2Foriginals%2Fupload_1780878139007_0_ChatGPT-Image-2026%EB%85%84-6%EC%9B%94-6%EC%9D%BC-%EC%98%A4%EC%A0%84-12_19_28.png?alt=media&token=259cb144-d16d-468b-9196-da64b6b990b3',
      alt: '대표 소개 사진 - 사람과 신뢰 리더십',
      position: 'center 20%',
    },
    badge: 'CEO PROFILE · 02 / 03',
    accentHeading: '사람과 신뢰',
    headingSuffix: '로',
    headingSecondLine: '함께 성장하는 리더십',
    description: '구성원·협력사·현장이 같은 기준으로 움직일 수 있도록, 소통과 신뢰의 방식을 정리합니다.',
    stats: [
      { label: '협업 원칙', value: 4, unit: '가지' },
      { label: '신뢰의 기준', value: 3, unit: '단계' },
      { label: '현장 우선', value: 100, unit: '%' },
    ],
    accordionItems: [
      {
        eyebrow: '01 / Team',
        title: '함께 결정하는 리더십',
        summary: '의견을 빠르게 모으고 결정의 이유를 투명하게 공유합니다.',
        detail:
          '현장과 사무실의 정보를 한쪽으로 치우치지 않게 듣고, 필요한 결정은 책임 있게 정리해 팀이 같은 방향으로 실행할 수 있도록 돕습니다.',
      },
      {
        eyebrow: '02 / Trust',
        title: '신뢰를 쌓는 실행',
        summary: '말보다 약속을 지키는 반복으로 관계의 기준을 만듭니다.',
        detail:
          '작은 약속도 기록하고 결과까지 확인합니다. 일관된 실행이 구성원과 협력사 모두에게 예측 가능한 협업 경험을 만든다고 믿습니다.',
      },
      {
        eyebrow: '03 / Communication',
        title: '명확한 소통 방식',
        summary: '필요한 정보는 제때 공유하고, 애매한 지시는 줄입니다.',
        detail:
          '무엇을 왜 하는지, 누가 언제까지 맡는지를 분명하게 맞춥니다. 불필요한 재확인을 줄여 현장이 본업에 집중할 수 있게 합니다.',
      },
      {
        eyebrow: '04 / Growth',
        title: '서로의 성장을 만드는 구조',
        summary: '개인의 경험이 팀의 다음 판단에 남도록 연결합니다.',
        detail:
          '현장에서 얻은 배움과 개선점을 팀의 공통 기준으로 남겨, 다음 프로젝트에서 더 나은 선택을 할 수 있는 운영 기반을 만듭니다.',
      },
      {
        eyebrow: '05 / Responsibility',
        title: '끝까지 책임지는 약속',
        summary: '결정 이후의 과정과 결과까지 함께 확인합니다.',
        detail:
          '결과가 기대와 다를 때도 원인을 숨기지 않고 함께 돌아봅니다. 피드백을 다음 행동으로 연결하는 것이 지속되는 신뢰의 출발점입니다.',
      },
    ],
  },
  {
    id: 'ceo-intro-film',
    media: {
      type: 'youtube',
      videoId: 'RWZBqAUy7is',
      title: '대표 소개 영상',
    },
    badge: 'CEO FILM · 03 / 03',
    accentHeading: '영상으로 보는',
    headingSuffix: ' 대표의 이야기',
    headingSecondLine: '현장에서 시작되는 변화',
    description: '대표의 메시지와 회사의 방향을 영상으로 확인해 보세요.',
    stats: [
      { label: '대표 소개 영상', value: 1, unit: '편' },
      { label: '자동 재생', value: 1, unit: '개' },
      { label: '한 번 재생', value: 1, unit: '회' },
    ],
    accordionItems: [
      {
        eyebrow: '01 / Message',
        title: '대표 메시지',
        summary: '대표의 이야기를 배경 영상으로 차분하게 전합니다.',
        detail: '화면의 흐름을 방해하지 않도록 영상은 자동으로 재생되며, 핵심 메시지는 우측에서 읽을 수 있습니다.',
      },
      {
        eyebrow: '02 / Direction',
        title: '현장과 실행',
        summary: '일하는 현장과 실행의 방향을 영상의 분위기와 함께 보여줍니다.',
        detail: '사진 한 장에 담기 어려운 현장의 움직임을 자연스럽게 전달해 대표소개 페이지의 몰입도를 높입니다.',
      },
      {
        eyebrow: '03 / Together',
        title: '함께 만드는 변화',
        summary: '구성원과 파트너가 함께 만들어 가는 방향을 담았습니다.',
        detail: '대표의 메시지가 구성원의 실행과 연결되어, 지속 가능한 변화로 이어지는 모습을 소개합니다.',
      },
    ],
  },
];

const ceoOperatingHighlights: OperatingHighlight[] = [
  {
    eyebrow: '원칙 정렬',
    title: '대표 메시지를 운영 기준으로',
    desc: 'CEO 소개를 인물 홍보가 아니라 조직이 따르는 판단 기준으로 보여줍니다.',
    metric: 'CORE',
    helper: '대표 상세 소개서',
  },
  {
    eyebrow: '현장 판단',
    title: '결정 흐름이 보이는 구조',
    desc: '문제 확인, 기준 선택, 실행, 회고까지 리더십의 작동 방식을 시각화합니다.',
    metric: 'LOOP',
    helper: '의사결정 루프',
  },
  {
    eyebrow: '책임 확장',
    title: '조직이 따라 할 수 있는 방식',
    desc: '대표 개인의 이력이 아니라 팀과 협력사가 공유할 수 있는 운영 언어로 재구성합니다.',
    metric: 'SCALE',
    helper: '책임 경영 기준',
  },
];

const ceoOperatingPanels: OperatingPanel[] = [
  {
    key: 'leadership-principle',
    eyebrow: 'CEO 리더십 지표',
    title: '원칙 실행 그래프',
    summary: '현장, 책임, 신뢰라는 대표 메시지의 핵심 기준이 조직 운영에서 얼마나 선명하게 드러나는지 보여줍니다.',
    chartType: 'bar',
    score: '94%',
    accent: '#2563eb',
    barData: [
      { name: '현장', value: 94 },
      { name: '책임', value: 91 },
      { name: '신뢰', value: 96 },
    ],
    pieData: [],
    balanceData: [],
  },
  {
    key: 'decision-loop',
    eyebrow: 'CEO 리더십 지표',
    title: '판단 비중 그래프',
    summary: '대표 메시지가 어느 영역에 무게를 두는지 현장 실행, 구성원 성장, 파트너 신뢰로 나누어 확인합니다.',
    chartType: 'pie',
    score: '89%',
    accent: '#00b894',
    barData: [],
    pieData: [
      { name: '현장 실행', value: 42, color: '#2563eb' },
      { name: '구성원 성장', value: 31, color: '#00b894' },
      { name: '파트너 신뢰', value: 27, color: '#ff8a00' },
    ],
    balanceData: [],
  },
  {
    key: 'responsibility-balance',
    eyebrow: 'CEO 리더십 지표',
    title: '책임 균형 그래프',
    summary: '대표가 강조하는 빠른 실행과 신중한 검토, 현장 자율과 본사 기준의 균형을 비교합니다.',
    chartType: 'balance',
    score: '86%',
    accent: '#7c3aed',
    barData: [],
    pieData: [],
    balanceData: [
      { name: '판단 속도', leftLabel: '실행', leftValue: 57, rightLabel: '검토', rightValue: 43 },
      { name: '운영 기준', leftLabel: '현장', leftValue: 61, rightLabel: '본사', rightValue: 39 },
      { name: '성장 방식', leftLabel: '도전', leftValue: 52, rightLabel: '안정', rightValue: 48 },
    ],
  },
];

const ceoVisionPillars = [
  {
    title: '전문 분야: 일단 손대봄',
    desc: '정해진 한 가지보다, 필요한 곳에 먼저 끼어들어 끝까지 확인하는 쪽에 가깝습니다.',
    tone: '#2d61ff',
  },
  {
    title: '업무 방식: 만능인 척하기',
    desc: '사실 이도저도 아니지만, 모르는 일도 일단 해보며 다음에 덜 헤매는 방법을 남깁니다.',
    tone: '#ffb000',
  },
  {
    title: '성과 해석: 얻어걸려도 기록',
    desc: '하다 보면 예상 밖의 기회가 오기도 합니다. 운 좋았던 이유까지 적어 두고 다음 실행에 씁니다.',
    tone: '#ff6955',
  },
];

const ceoBusinessCards = [
  {
    icon: faHelmetSafety,
    title: '안전 우선 판단',
    desc: '속도보다 안전 기준을 먼저 세우고 현장이 흔들리지 않게 관리합니다.',
    detail: '위험 요소를 미리 확인하고 책임자가 즉시 대응할 수 있는 흐름을 강조합니다.',
    color: '#2563eb',
  },
  {
    icon: faUsers,
    title: '구성원 성장',
    desc: '사람의 경험과 역할을 존중하며 팀이 스스로 판단할 수 있는 기준을 만듭니다.',
    detail: '리더 한 명의 감각이 아니라 조직 전체가 재현할 수 있는 운영 언어를 남깁니다.',
    color: '#7c3aed',
  },
  {
    icon: faChartLine,
    title: '데이터형 경영',
    desc: '느낌과 보고서 사이의 간격을 줄이고 숫자로 확인 가능한 결정을 지향합니다.',
    detail: '공수, 일정, 품질, 이슈 기록을 같은 화면에서 확인하는 문화를 만듭니다.',
    color: '#00b894',
  },
  {
    icon: faBuilding,
    title: '파트너 신뢰',
    desc: '협력사와 고객에게 설명 가능한 기준으로 약속을 관리합니다.',
    detail: '관계의 안정성은 투명한 기록과 반복 가능한 실행에서 시작된다는 메시지를 담았습니다.',
    color: '#ff8a00',
  },
];

const ceoBusinessPipelines = ['현장 경청', '문제 정의', '기준 정렬', '실행 위임', '결과 확인', '다음 개선'];

const ceoDocumentTabs: CeoDocumentTabOption[] = [
  { id: 'brands', label: '대표브랜드', eyebrow: 'BRAND' },
  { id: 'resume', label: '대표이력서', eyebrow: 'RESUME' },
  { id: 'introduction', label: '대표소개서', eyebrow: 'STORY' },
  { id: 'analysis', label: '대표통계분석', eyebrow: 'ANALYSIS' },
];

const ceoBrandCollection = [
  {
    name: 'SIMPLYPIG',
    category: 'Corporate Identity',
    description: '기술, 콘텐츠, 운영을 하나의 실행 체계로 연결하는 기업 브랜드입니다.',
    imageUrl: '/propig-favicon.svg',
    imageAlt: 'SIMPLYPIG 브랜드 심볼',
    imageWidth: 64,
    imageHeight: 64,
    imageStyle: 'symbol',
  },
  {
    name: 'PROPIG',
    category: 'Product Brand',
    description: '일의 흐름을 단순하게 만들고 성장을 돕는 AI 기반 제품 브랜드입니다.',
    imageUrl: '/icons/icon-512.webp',
    imageAlt: 'PROPIG 돼지 캐릭터 브랜드 이미지',
    imageWidth: 512,
    imageHeight: 512,
    imageStyle: 'cover',
  },
  {
    name: 'KIBA',
    category: 'Professional Brand',
    description: '검증 가능한 경영 분석과 실행 방법론을 시각화한 전문 브랜드입니다.',
    imageUrl: '/corp/kiba-dashboard/hero-logo.png',
    imageAlt: 'KIBA 한국경영분석연구원 브랜드 로고',
    imageWidth: 1716,
    imageHeight: 886,
    imageStyle: 'wide',
  },
];

const ceoResumeExperience = [
  {
    period: '현재',
    role: '경영 및 사업 총괄',
    organization: 'SIMPLYPIG · 대표이사',
    description: '사업 방향과 브랜드 원칙을 정립하고 제품, 콘텐츠, 운영 조직의 실행 우선순위를 조율합니다.',
  },
  {
    period: '핵심 프로젝트',
    role: 'AI 제품·업무 자동화 체계 구축',
    organization: '전략 · UX · 개발 · 운영',
    description: '현장 문제를 발견하고 설계, 구축, 검증, 운영으로 이어지는 반복 가능한 실행 체계를 만듭니다.',
  },
  {
    period: '브랜드 운영',
    role: '콘텐츠·크리에이터 성장 시스템',
    organization: '브랜드 · 미디어 · 데이터',
    description: '브랜드 메시지를 콘텐츠로 확장하고 채널별 반응을 다음 기획과 운영 개선에 연결합니다.',
  },
];

const ceoResumeSkills = ['사업 전략', 'AI 서비스 기획', '웹·앱 구축', '업무 자동화', '브랜드 운영', '콘텐츠 제작'];

const ceoIntroductionItems = [
  {
    eyebrow: '01 · MOTIVATION',
    title: '사업을 시작한 이유',
    summary: '복잡한 문제를 누구나 실행할 수 있는 단순한 흐름으로 바꾸고 싶었습니다.',
    detail:
      '현장에는 좋은 아이디어가 많지만 기술, 시간, 정보의 간격 때문에 실행으로 이어지지 못하는 경우가 많습니다. SIMPLYPIG은 그 간격을 줄이고, 작은 실행이 실제 성과와 다음 성장으로 연결되는 구조를 만들기 위해 시작했습니다.',
  },
  {
    eyebrow: '02 · STRENGTH',
    title: '대표의 핵심 역량',
    summary: '전략을 문서에 머물게 하지 않고 제품과 운영 체계까지 연결합니다.',
    detail:
      '문제를 정의한 뒤 사용자 경험, 기술 구조, 콘텐츠, 운영 지표를 하나의 관점으로 정렬합니다. 필요한 경우 직접 프로토타입을 만들고 검증하며, 팀이 반복해서 사용할 수 있는 기준과 도구로 정리합니다.',
  },
  {
    eyebrow: '03 · LEADERSHIP',
    title: '협업과 리더십 방식',
    summary: '명확한 기준을 함께 공유하고 결정의 이유와 결과를 투명하게 남깁니다.',
    detail:
      '구성원이 자신의 전문성을 충분히 발휘할 수 있도록 목적과 우선순위를 먼저 맞춥니다. 결정은 빠르게 내리되 과정과 결과를 기록하고, 피드백을 다음 행동으로 연결해 신뢰가 축적되는 협업 환경을 지향합니다.',
  },
  {
    eyebrow: '04 · VISION',
    title: '앞으로 만들고 싶은 변화',
    summary: '사람과 AI가 각자의 강점을 살려 더 가치 있는 일에 집중하는 환경을 만듭니다.',
    detail:
      '반복 업무는 기술로 줄이고 사람은 판단, 창의, 관계에 더 집중할 수 있어야 합니다. SIMPLYPIG은 접근하기 쉬운 AI 제품과 실행 가능한 콘텐츠를 통해 개인과 조직의 지속 가능한 성장을 돕겠습니다.',
  },
];


function formatNumber(value: number, decimals = 0): string {
  return Number(value || 0).toLocaleString('ko-KR', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function getPieDonutSegments(data: PieMetric[]): PieDonutSegment[] {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 0;

  return data.map((item) => {
    const percentage = (item.value / total) * 100;
    const segment = { ...item, percentage, offset };
    offset += percentage;
    return segment;
  });
}

const RADAR_CENTER = 110;
const RADAR_RADIUS = 78;
const RADAR_GRID_LEVELS = [0.25, 0.5, 0.75, 1] as const;

function getRadarPoint(index: number, total: number, value = 100) {
  const angle = -Math.PI / 2 + (index / Math.max(total, 1)) * Math.PI * 2;
  const radius = (RADAR_RADIUS * value) / 100;

  return {
    x: RADAR_CENTER + Math.cos(angle) * radius,
    y: RADAR_CENTER + Math.sin(angle) * radius,
  };
}

function getRadarPolygonPoints(data: OperatingPanel['barData'], valueRatio = 1) {
  return data
    .map((item, index) => {
      const point = getRadarPoint(index, data.length, item.value * valueRatio);
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(' ');
}

function getRadarLabelPosition(index: number, total: number) {
  const angle = -Math.PI / 2 + (index / Math.max(total, 1)) * Math.PI * 2;
  const left = 50 + Math.cos(angle) * 47;
  const top = 50 + Math.sin(angle) * 47;
  const horizontalShift = Math.cos(angle) > 0.35 ? '-100%' : Math.cos(angle) < -0.35 ? '0' : '-50%';
  const verticalShift = Math.sin(angle) > 0.45 ? '-100%' : Math.sin(angle) < -0.45 ? '0' : '-50%';

  return {
    left: `${left.toFixed(2)}%`,
    top: `${top.toFixed(2)}%`,
    transform: `translate(${horizontalShift}, ${verticalShift})`,
    textAlign: Math.cos(angle) > 0.35 ? 'right' : Math.cos(angle) < -0.35 ? 'left' : 'center',
  } as const;
}

function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {formatNumber(value, decimals)}
      {suffix}
    </span>
  );
}

export default function Dashboard2Experience({
  variant,
  enableBrandStory = false,
  includeProductIntroduction = false,
  includeCompanyHistory = false,
}: Dashboard2ExperienceProps = {}) {
  const pathname = usePathname();
  const routeVariant = getDashboardStyleCorpVariant(pathname);
  const resolvedVariant = routeVariant ?? variant ?? 'introduction';
  const pageRef = useRef<HTMLElement | null>(null);
  const nextBrandStoryImageRef = useRef<HTMLImageElement | null>(null);
  const nextCeoProfileImageRef = useRef<HTMLImageElement | null>(null);
  const shouldReduceMotion = true;
  const [brandStorySlideIndex, setBrandStorySlideIndex] = useState(0);
  const [selectedOperatingState, setSelectedOperatingState] = useState({ variant: resolvedVariant, index: 0 });
  const [selectedBusinessStageState, setSelectedBusinessStageState] = useState({ variant: resolvedVariant, index: 0 });
  const [openCeoHeroAccordionState, setOpenCeoHeroAccordionState] = useState({ variant: resolvedVariant, index: 0 });
  const [activeCeoProfileIndex, setActiveCeoProfileIndex] = useState(0);
  const [activeCeoDocumentTab, setActiveCeoDocumentTab] = useState<CeoDocumentTab>('brands');
  const [openCeoIntroductionIndex, setOpenCeoIntroductionIndex] = useState(0);
  const barInView = true;
  const isCeoVariant = resolvedVariant === 'ceo';
  const isBrandStoryActive = enableBrandStory && !isCeoVariant;
  const activeCeoProfile = ceoHeroProfiles[activeCeoProfileIndex] ?? ceoHeroProfiles[0]!;
  const activeBrandStorySlide =
    introductionHeroSlides[brandStorySlideIndex] ?? introductionHeroSlides[0]!;
  const selectedOperatingIndex = selectedOperatingState.variant === resolvedVariant ? selectedOperatingState.index : 0;
  const selectedBusinessStageIndex =
    selectedBusinessStageState.variant === resolvedVariant ? selectedBusinessStageState.index : 0;
  const openCeoHeroAccordionIndex =
    openCeoHeroAccordionState.variant === resolvedVariant ? openCeoHeroAccordionState.index : 0;
  const activeHeroStats = isCeoVariant
    ? activeCeoProfile.stats
    : isBrandStoryActive
      ? activeBrandStorySlide.stats
      : heroStats;
  const activeOperatingHighlights = isCeoVariant ? ceoOperatingHighlights : operatingHighlights;
  const activeOperatingPanels = isCeoVariant ? ceoOperatingPanels : operatingPanels;
  const activeVisionPillars = isCeoVariant ? ceoVisionPillars : visionPillars;
  const activeBusinessCards = isCeoVariant ? ceoBusinessCards : businessCards;
  const selectedBusinessStage =
    businessOperationStages[selectedBusinessStageIndex] ?? businessOperationStages[0]!;
  const selectedPanel = activeOperatingPanels[selectedOperatingIndex] ?? activeOperatingPanels[0];
  const selectedPieSegments = getPieDonutSegments(selectedPanel.pieData);
  const activeCeoMedia = activeCeoProfile.media;
  const activeCeoVideo = isCeoVariant && activeCeoMedia.type === 'youtube' ? activeCeoMedia : null;
  const heroImageSrc = isCeoVariant
    ? activeCeoMedia.type === 'image'
      ? activeCeoMedia.url
      : heroImageUrl
    : isBrandStoryActive
      ? activeBrandStorySlide.imageUrl
      : heroImageUrl;
  const heroImageAlt = isCeoVariant
    ? activeCeoMedia.type === 'image'
      ? activeCeoMedia.alt
      : ''
    : isBrandStoryActive
      ? activeBrandStorySlide.imageAlt
      : '청연ENG ERP 대시보드 비주얼';
  const heroImageFit = isCeoVariant
    ? 'cover'
    : isBrandStoryActive
      ? activeBrandStorySlide.imageFit
      : 'contain';
  const heroImagePosition = isCeoVariant
    ? activeCeoMedia.type === 'image'
      ? activeCeoMedia.position
      : 'center'
    : isBrandStoryActive
      ? activeBrandStorySlide.imagePosition
      : 'center';
  const introHeroBadge = isBrandStoryActive ? activeBrandStorySlide.badge : 'SIMPLYPIG · AI CREATIVE TECHNOLOGY';
  const introHeroAccentHeading = isBrandStoryActive ? activeBrandStorySlide.accentHeading : '복잡한 기술';
  const introHeroHeadingSuffix = isBrandStoryActive ? activeBrandStorySlide.headingSuffix : '을';
  const introHeroHeadingSecondLine = isBrandStoryActive
    ? activeBrandStorySlide.headingSecondLine
    : '단순한 성장으로 만듭니다';
  const introHeroDescription = isBrandStoryActive
    ? activeBrandStorySlide.description
    : 'AI 웹·앱 개발, 업무자동화, 영상 제작·편집, 리셀러 파트너 운영을 전략부터 운영까지 하나의 실행 체계로 연결합니다.';

  useEffect(() => {
    if (!isBrandStoryActive || typeof window === 'undefined') return undefined;

    const nextSlide = introductionHeroSlides[(brandStorySlideIndex + 1) % introductionHeroSlides.length];
    if (!nextSlide) return undefined;

    const nextImage = new window.Image();
    nextImage.decoding = 'async';
    nextImage.fetchPriority = 'high';
    nextImage.src = nextSlide.imageUrl;
    nextBrandStoryImageRef.current = nextImage;

    return () => {
      if (nextBrandStoryImageRef.current === nextImage) {
        nextBrandStoryImageRef.current = null;
      }
    };
  }, [brandStorySlideIndex, isBrandStoryActive]);

  useEffect(() => {
    if (!isCeoVariant || typeof window === 'undefined') return undefined;

    const nextProfile = ceoHeroProfiles[(activeCeoProfileIndex + 1) % ceoHeroProfiles.length];
    if (!nextProfile || nextProfile.media.type !== 'image') return undefined;

    const nextImage = new window.Image();
    nextImage.decoding = 'async';
    nextImage.fetchPriority = 'high';
    nextImage.src = nextProfile.media.url;
    nextCeoProfileImageRef.current = nextImage;

    return () => {
      if (nextCeoProfileImageRef.current === nextImage) {
        nextCeoProfileImageRef.current = null;
      }
    };
  }, [activeCeoProfileIndex, isCeoVariant]);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || typeof window === 'undefined') return undefined;

    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-dashboard-motion]'));
    const sectionTargets = Array.from(root.querySelectorAll<HTMLElement>('[data-dashboard-section-motion]'));
    if (targets.length === 0 && sectionTargets.length === 0) return undefined;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let observer: IntersectionObserver | null = null;
    let sectionObserver: IntersectionObserver | null = null;

    const setAllVisible = () => {
      targets.forEach((element) => {
        element.dataset.dashboardMotionState = 'visible';
        element.style.setProperty('--dashboard-motion-lift', '0px');
      });
      sectionTargets.forEach((element) => {
        element.dataset.dashboardSectionMotionState = 'visible';
      });
    };

    const syncSectionMotionState = () => {
      if (motionQuery.matches) {
        setAllVisible();
        return;
      }

      const rootRect = root.getBoundingClientRect();
      const viewportTop = Math.max(rootRect.top, 0);
      const viewportBottom = Math.min(rootRect.bottom, window.innerHeight);

      sectionTargets.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const nextState =
          rect.bottom <= viewportTop + 1
            ? 'after'
            : rect.top >= viewportBottom - 1
              ? 'before'
              : 'visible';
        element.dataset.dashboardSectionMotionState = nextState;
      });
    };

    const syncScrollMotion = () => {
      frame = 0;

      if (motionQuery.matches) {
        setAllVisible();
        return;
      }

      const rootRect = root.getBoundingClientRect();
      const viewportTop = Math.max(rootRect.top, 0);
      const viewportBottom = Math.min(rootRect.bottom, window.innerHeight);
      const viewportCenter = viewportTop + (viewportBottom - viewportTop) / 2;
      const motionRange = Math.max((viewportBottom - viewportTop) / 2, 180);

      targets.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const distance = Math.max(-1, Math.min(1, (elementCenter - viewportCenter) / motionRange));
        const amplitude = element.dataset.dashboardMotion === 'chart' ? 22 : 14;
        element.style.setProperty('--dashboard-motion-lift', `${(distance * amplitude).toFixed(1)}px`);
      });
    };

    const requestSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncScrollMotion);
    };

    const handleMotionPreferenceChange = () => {
      if (motionQuery.matches) {
        observer?.disconnect();
        observer = null;
        sectionObserver?.disconnect();
        sectionObserver = null;
        setAllVisible();
      } else {
        targets.forEach((element, index) => {
          if (element.dataset.dashboardMotionState !== 'visible') {
            element.dataset.dashboardMotionState = 'pending';
          }
          element.style.setProperty('--dashboard-motion-delay', `${Math.min(index * 55, 220)}ms`);
        });
        syncSectionMotionState();
      }

      requestSync();
    };

    if (motionQuery.matches) {
      setAllVisible();
    } else {
      targets.forEach((element, index) => {
        element.dataset.dashboardMotionState = element.dataset.dashboardMotionState === 'visible' ? 'visible' : 'pending';
        element.style.setProperty('--dashboard-motion-delay', `${Math.min(index * 55, 220)}ms`);
      });

      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                (entry.target as HTMLElement).dataset.dashboardMotionState = 'visible';
              }
            });
          },
          { root, rootMargin: '0px 0px -8% 0px', threshold: [0.18, 0.36] },
        );
        targets.forEach((element) => observer?.observe(element));
      } else {
        setAllVisible();
      }

      if ('IntersectionObserver' in window) {
        sectionObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const element = entry.target as HTMLElement;

              if (entry.isIntersecting) {
                element.dataset.dashboardSectionMotionState = 'visible';
                return;
              }

              const hasPassedViewportTop = entry.rootBounds
                ? entry.boundingClientRect.bottom <= entry.rootBounds.top + 1
                : entry.boundingClientRect.top < 0;
              element.dataset.dashboardSectionMotionState = hasPassedViewportTop ? 'after' : 'before';
            });
          },
          { root, rootMargin: '0px 0px -6% 0px', threshold: 0.12 },
        );

        sectionTargets.forEach((element) => {
          element.dataset.dashboardSectionMotionState = 'before';
          sectionObserver?.observe(element);
        });
        syncSectionMotionState();
      }
    }

    requestSync();
    const handleScroll = () => {
      syncSectionMotionState();
      requestSync();
    };
    root.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    motionQuery.addEventListener('change', handleMotionPreferenceChange);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      sectionObserver?.disconnect();
      root.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      motionQuery.removeEventListener('change', handleMotionPreferenceChange);
    };
  }, [resolvedVariant]);

  const revealVariant = useMemo(
    () => ({
      hidden: { opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 34 },
      visible: { opacity: 1, y: 0, transition: { duration: shouldReduceMotion ? 0 : 0.72 } },
    }),
    [shouldReduceMotion],
  );

  const staggerVariant = useMemo(
    () => ({
      hidden: {},
      visible: {
        transition: {
          staggerChildren: shouldReduceMotion ? 0 : 0.09,
          delayChildren: shouldReduceMotion ? 0 : 0.08,
        },
      },
    }),
    [shouldReduceMotion],
  );

  const handleNextBrandStorySlide = () => {
    setBrandStorySlideIndex((currentIndex) => (currentIndex + 1) % introductionHeroSlides.length);
  };

  const handleNextCeoProfile = () => {
    setActiveCeoProfileIndex((currentIndex) => (currentIndex + 1) % ceoHeroProfiles.length);
    setOpenCeoHeroAccordionState({ variant: resolvedVariant, index: 0 });
  };

  const handleHeroImageKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();

    if (isCeoVariant) {
      handleNextCeoProfile();
      return;
    }

    handleNextBrandStorySlide();
  };

  const handleCeoDocumentTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % ceoDocumentTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + ceoDocumentTabs.length) % ceoDocumentTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = ceoDocumentTabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = ceoDocumentTabs[nextIndex];
    if (!nextTab) return;

    setActiveCeoDocumentTab(nextTab.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`ceo-document-tab-${nextTab.id}`)?.focus();
    });
  };

  const operatingContent = (
    <OperatingInner>
      <OperatingCopy variants={revealVariant}>
        <p>{isCeoVariant ? '대표 리더십 패키지' : 'AI 실행 역량'}</p>
        <h2>{isCeoVariant ? '대표 메시지가 운영 기준으로 보이는 화면' : '아이디어를 운영 가능한 결과로 만드는 역량'}</h2>
        <span>
          {isCeoVariant
            ? '대표의 원칙, 판단 루프, 현장 책임을 같은 정보 구조로 확인할 수 있습니다.'
            : '제품, 자동화, 미디어, 리셀러 파트너 역량을 실행 관점에서 비교해 지금 우선할 다음 단계를 빠르게 찾을 수 있게 구성했습니다.'}
        </span>
        <OperatingTabs>
          {activeOperatingHighlights.map((item, index) => {
            const isSelected = selectedOperatingIndex === index;
            return (
              <button
                key={item.title}
                type="button"
                data-dashboard-operating-tab={item.metric.toLowerCase()}
                aria-pressed={isSelected}
                onClick={() => setSelectedOperatingState({ variant: resolvedVariant, index })}
                className={isSelected ? 'is-selected' : undefined}
              >
                <span>
                  <small>{item.eyebrow}</small>
                  <strong>{item.title}</strong>
                </span>
                <b>{item.metric}</b>
                <em>{item.desc}</em>
                <i>{item.helper}</i>
              </button>
            );
          })}
        </OperatingTabs>
      </OperatingCopy>

      <ChartPanel
        data-dashboard-motion="chart"
        data-dashboard-motion-state="visible"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 34 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false, amount: 0.24 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.72 }}
      >
        <ChartHead>
          <div>
            <p>{selectedPanel.eyebrow}</p>
            <h3>{selectedPanel.title}</h3>
            <span>{selectedPanel.summary}</span>
          </div>
          <ScoreBox>
            <span>현재 수준</span>
            <strong>{selectedPanel.score}</strong>
          </ScoreBox>
        </ChartHead>
        <ChartCanvas>
          {selectedPanel.chartType === 'bar' ? (
            <BarStack aria-label={`${selectedPanel.title} 데이터`}>
              {selectedPanel.barData.map((row) => (
                <BarRow key={row.name}>
                  <span>{row.name}</span>
                  <b>
                    <motion.i
                      data-dashboard-chart-bar=""
                      initial={{ width: shouldReduceMotion || barInView ? `${row.value}%` : '0%' }}
                      animate={{ width: shouldReduceMotion || barInView ? `${row.value}%` : '0%' }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.62 }}
                      style={{ backgroundColor: selectedPanel.accent }}
                    />
                  </b>
                  <strong>{row.value}%</strong>
                </BarRow>
              ))}
            </BarStack>
          ) : null}

          {selectedPanel.chartType === 'vertical-bar' ? (
            <VerticalBarChart aria-label={`${selectedPanel.title} 데이터`}>
              {selectedPanel.barData.map((row) => (
                <article key={row.name}>
                  <div>
                    <i
                      data-dashboard-chart-vertical=""
                      style={{ height: `${row.value}%`, backgroundColor: selectedPanel.accent }}
                    />
                  </div>
                  <strong>{row.value}%</strong>
                  <span>{row.name}</span>
                </article>
              ))}
            </VerticalBarChart>
          ) : null}

          {selectedPanel.chartType === 'pie' ? (
            <PieGrid>
              <PieDonut
                data-dashboard-chart-donut=""
                aria-label={`${selectedPanel.title} 비중`}
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.55 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
              >
                <svg viewBox="0 0 220 220" aria-hidden="true">
                  <circle className="pie-track" cx="110" cy="110" r="78" pathLength="100" />
                  {selectedPieSegments.map((entry, index) => (
                    <circle
                      key={entry.name}
                      className="pie-segment"
                      data-dashboard-chart-donut-segment=""
                      cx="110"
                      cy="110"
                      r="78"
                      pathLength="100"
                      stroke={entry.color}
                      style={
                        {
                          '--pie-segment-dasharray': `${entry.percentage.toFixed(3)} ${(100 - entry.percentage).toFixed(3)}`,
                          '--pie-segment-offset': `${-entry.offset.toFixed(3)}`,
                          '--pie-delay': `${index * 110}ms`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </svg>
                <span>
                  <strong>{selectedPanel.score}</strong>
                  <em>종합</em>
                </span>
              </PieDonut>
              <LegendStack>
                {selectedPanel.pieData.map((entry) => (
                  <div key={entry.name}>
                    <span style={{ backgroundColor: entry.color }} />
                    <strong>{entry.name}</strong>
                    <b>{entry.value}%</b>
                  </div>
                ))}
              </LegendStack>
            </PieGrid>
          ) : null}

          {selectedPanel.chartType === 'balance' ? (
            <BalanceStack>
              {selectedPanel.balanceData.map((item) => {
                const total = item.leftValue + item.rightValue || 1;
                const leftPercent = Math.round((item.leftValue / total) * 100);
                const rightPercent = 100 - leftPercent;

                return (
                  <BalanceRow key={item.name}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {leftPercent}:{rightPercent}
                      </span>
                    </div>
                    <BalanceBar>
                      <small>{item.leftLabel}</small>
                      <b>
                        <motion.i
                          data-dashboard-chart-segment="left"
                          initial={{ width: shouldReduceMotion ? `${leftPercent}%` : '0%' }}
                          whileInView={{ width: `${leftPercent}%` }}
                          viewport={{ once: true, amount: 0.6 }}
                          transition={{ duration: shouldReduceMotion ? 0 : 0.6 }}
                        >
                          {leftPercent}%
                        </motion.i>
                        <motion.em
                          data-dashboard-chart-segment="right"
                          initial={{ width: shouldReduceMotion ? `${rightPercent}%` : '0%' }}
                          whileInView={{ width: `${rightPercent}%` }}
                          viewport={{ once: true, amount: 0.6 }}
                          transition={{ duration: shouldReduceMotion ? 0 : 0.6, delay: shouldReduceMotion ? 0 : 0.12 }}
                        >
                          {rightPercent}%
                        </motion.em>
                      </b>
                      <small>{item.rightLabel}</small>
                    </BalanceBar>
                  </BalanceRow>
                );
              })}
            </BalanceStack>
          ) : null}

          {selectedPanel.chartType === 'radar' ? (
            <RadarChart aria-label={`${selectedPanel.title} 데이터`}>
              <RadarOrbit>
                <svg viewBox="0 0 220 220" aria-hidden="true">
                  <circle className="radar-orbit" cx="110" cy="110" r="104" />
                  <circle className="radar-orbit-inner" cx="110" cy="110" r="92" />
                  {RADAR_GRID_LEVELS.map((level) => (
                    <polygon
                      key={level}
                      points={getRadarPolygonPoints(selectedPanel.barData, level)}
                      className="radar-grid"
                    />
                  ))}
                  {selectedPanel.barData.map((item, index) => {
                    const point = getRadarPoint(index, selectedPanel.barData.length);
                    return (
                      <line
                        key={item.name}
                        x1={RADAR_CENTER}
                        y1={RADAR_CENTER}
                        x2={point.x}
                        y2={point.y}
                        className="radar-axis"
                      />
                    );
                  })}
                  <g data-dashboard-chart-radar="">
                    <polygon points={getRadarPolygonPoints(selectedPanel.barData)} className="radar-value" />
                    {selectedPanel.barData.map((item, index) => {
                      const point = getRadarPoint(index, selectedPanel.barData.length, item.value);
                      return <circle key={item.name} cx={point.x} cy={point.y} r="4" className="radar-dot" />;
                    })}
                  </g>
                </svg>
                {selectedPanel.barData.map((item, index) => (
                  <RadarCornerLabel
                    key={item.name}
                    data-radar-corner-label=""
                    style={getRadarLabelPosition(index, selectedPanel.barData.length)}
                  >
                    <span>{item.name}</span>
                    <strong>{item.value}%</strong>
                  </RadarCornerLabel>
                ))}
              </RadarOrbit>
            </RadarChart>
          ) : null}
        </ChartCanvas>
      </ChartPanel>
    </OperatingInner>
  );


  return (
    <PageShell
      ref={pageRef}
      id="content-area"
      aria-labelledby="dashboard2-title"
      $squareSections={isBrandStoryActive}
    >
      {!isCeoVariant && !isBrandStoryActive ? (
        <TopNotice>SIMPLYPIG의 AI 기술과 실행 역량을 기존 대시보드 스타일 안에 구성했습니다.</TopNotice>
      ) : null}

      <HeroSection id="dashboard2-intro" $isCeo={isCeoVariant}>
        <HeroGrid aria-hidden="true" />
        <HeroWash aria-hidden="true" />
        <HeroInner $isCeo={isCeoVariant}>
          <motion.div
            className={isCeoVariant ? 'ceo-hero-photo' : undefined}
            initial={shouldReduceMotion ? false : { opacity: 0, x: -40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, delay: 0.1 }}
          >
            <HeroImageCard $isPortrait={isCeoVariant}>
              <HeroImageGlow aria-hidden="true" />
              {activeCeoVideo ? (
                <>
                  <HeroVideoFrame>
                    <iframe
                      src={`https://www.youtube.com/embed/${activeCeoVideo.videoId}?autoplay=1&mute=0&controls=0&disablekb=1&fs=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3`}
                      title="대표 소개 배경 영상"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      aria-hidden="true"
                      tabIndex={-1}
                    />
                  </HeroVideoFrame>
                  <HeroProfileReturnButton
                    type="button"
                    data-ceo-hero-profile-trigger={activeCeoProfileIndex}
                    onClick={handleNextCeoProfile}
                    aria-label="처음 대표 소개로 돌아가기"
                  >
                    <span>
                      <small>{activeCeoProfile.badge}</small>
                      <strong>처음 대표 소개로</strong>
                    </span>
                    <i aria-hidden="true">
                      <FontAwesomeIcon icon={faArrowRight} />
                    </i>
                  </HeroProfileReturnButton>
                </>
              ) : isBrandStoryActive || isCeoVariant ? (
                <HeroImageButton
                  type="button"
                  data-ceo-hero-profile-trigger={isCeoVariant ? activeCeoProfileIndex : undefined}
                  onClick={isCeoVariant ? handleNextCeoProfile : handleNextBrandStorySlide}
                  onKeyDown={handleHeroImageKeyDown}
                  aria-label={
                    isCeoVariant
                      ? `${heroImageAlt}. 다른 대표 소개 버전과 우측 메뉴 보기, 현재 ${activeCeoProfileIndex + 1}/${ceoHeroProfiles.length}`
                      : `${heroImageAlt}. 다음 브랜드 장면 보기, 현재 ${brandStorySlideIndex + 1}/${introductionHeroSlides.length}`
                  }
                >
                  <img
                    key={heroImageSrc}
                    src={heroImageSrc}
                    alt={heroImageAlt}
                    width={isBrandStoryActive ? activeBrandStorySlide.imageWidth : 1024}
                    height={isBrandStoryActive ? activeBrandStorySlide.imageHeight : 1280}
                    style={{ objectFit: heroImageFit, objectPosition: heroImagePosition }}
                    decoding="async"
                    loading="eager"
                    fetchPriority="high"
                  />
                  <HeroStoryCue aria-hidden="true">
                    <span>
                      <small>
                        {isCeoVariant
                          ? `${activeCeoProfile.badge} · 클릭하여 전환`
                          : `BRAND STORY · ${brandStorySlideIndex + 1}/${introductionHeroSlides.length}`}
                      </small>
                      <strong>
                        {isCeoVariant
                          ? '다른 대표 소개 보기'
                          : brandStorySlideIndex === introductionHeroSlides.length - 1
                            ? '처음 장면으로'
                            : '다음 장면 보기'}
                      </strong>
                    </span>
                    <i>
                      <FontAwesomeIcon icon={faArrowRight} />
                    </i>
                  </HeroStoryCue>
                </HeroImageButton>
              ) : (
                <img
                  src={heroImageSrc}
                  alt={heroImageAlt}
                  style={{ objectFit: heroImageFit, objectPosition: heroImagePosition }}
                />
              )}
            </HeroImageCard>
          </motion.div>

          {isCeoVariant ? (
            <CeoHeroAccordionColumn className="ceo-hero-copy" key={activeCeoProfile.id} aria-label="대표소개 핵심 메시지" aria-live="polite" aria-atomic="true">
              <StatusBadge className="ceo-hero-badge">
                <span />
                {activeCeoProfile.badge}
              </StatusBadge>
              <h1 id="dashboard2-title" className="ceo-hero-title">
                <GradientText>{activeCeoProfile.accentHeading}</GradientText>{activeCeoProfile.headingSuffix}
                <br />
                {activeCeoProfile.headingSecondLine}
              </h1>
              <p className="ceo-hero-description">{activeCeoProfile.description}</p>

              <CeoHeroAccordionList className="ceo-hero-accordion">
                {activeCeoProfile.accordionItems.map((item, index) => {
                  const isOpen = openCeoHeroAccordionIndex === index;
                  const panelId = `ceo-hero-accordion-${index}`;

                  return (
                    <article key={item.title} className={isOpen ? 'is-open' : undefined}>
                      <button
                        type="button"
                        data-ceo-hero-accordion-trigger={index}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => setOpenCeoHeroAccordionState({ variant: resolvedVariant, index: isOpen ? -1 : index })}
                      >
                        <span>
                          <small>{item.eyebrow}</small>
                          <strong>{item.title}</strong>
                          <em>{item.summary}</em>
                        </span>
                        <i className={isOpen ? 'is-open' : undefined}>
                          <FontAwesomeIcon icon={faChevronDown} />
                        </i>
                      </button>
                      <div id={panelId} aria-hidden={!isOpen} className={isOpen ? 'is-open' : undefined}>
                        <p>{item.detail}</p>
                      </div>
                    </article>
                  );
                })}
              </CeoHeroAccordionList>
            </CeoHeroAccordionColumn>
          ) : (
            <motion.div
              key={isBrandStoryActive ? activeBrandStorySlide.imageUrl : 'company-introduction-default'}
              initial={shouldReduceMotion ? false : 'hidden'}
              animate="visible"
              variants={staggerVariant}
              aria-live={isBrandStoryActive ? 'polite' : undefined}
              aria-atomic={isBrandStoryActive ? true : undefined}
            >
              <motion.div variants={revealVariant}>
                <StatusBadge>
                  <span />
                  {introHeroBadge}
                </StatusBadge>
              </motion.div>
              <motion.h1 id="dashboard2-title" variants={revealVariant}>
                <GradientText>{introHeroAccentHeading}</GradientText>
                {introHeroHeadingSuffix}
                <br />
                {introHeroHeadingSecondLine}
              </motion.h1>
              <motion.p variants={revealVariant}>{introHeroDescription}</motion.p>

              {!isCeoVariant ? (
                <HeroActionGroup variants={revealVariant} aria-label="회사소개 주요 안내">
                  <HeroActionLink href="#company-introduction-business">
                    제품소개 살펴보기
                    <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                  </HeroActionLink>
                  <HeroSecondaryAction href="/corp/partnership/business">
                    사업 제휴 문의
                  </HeroSecondaryAction>
                </HeroActionGroup>
              ) : null}

              <HeroMetricGrid variants={revealVariant}>
                {activeHeroStats.map((stat) => (
                  <MetricCard key={stat.label} data-dashboard-motion="metric" data-dashboard-motion-state="pending">
                    <span>{stat.label}</span>
                    <strong>
                      <AnimatedNumber value={stat.value} decimals={stat.decimals} />
                      <em>{stat.unit}</em>
                    </strong>
                  </MetricCard>
                ))}
              </HeroMetricGrid>
            </motion.div>
          )}
        </HeroInner>
      </HeroSection>

      {!isCeoVariant ? (
        includeProductIntroduction ? (
          <CompanyBusinessAreaSections id="company-introduction-business" pageLabel="제품소개" />
        ) : (
          <CompanyBusinessOverview motionDirection="left" />
        )
      ) : null}

      {!isCeoVariant ? <CompanyTechnologyOverview motionDirection="right" /> : null}

      {!isCeoVariant ? <CompanyExecutionSystem motionDirection="left" /> : null}

      {!isCeoVariant ? <CompanyVisionPanorama motionDirection="right" /> : null}

      {!isCeoVariant && includeCompanyHistory ? <CompanyHistoryExperience embedded /> : null}

      {!isCeoVariant ? (
        <OperatingSection
          id="dashboard2-operating"
          data-dashboard-section-motion=""
          data-dashboard-section-motion-state="before"
          data-dashboard-section-direction="left"
          initial={shouldReduceMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, amount: 0.22 }}
          variants={staggerVariant}
        >
          {operatingContent}
        </OperatingSection>
      ) : null}

      {!isCeoVariant ? (
        <CompanyNextStepSection aria-labelledby="company-next-step-title">
          <CompanyNextStepInner>
            <CompanyNextStepCopy>
              <span>START WITH THE RIGHT SIGNAL</span>
              <h2 id="company-next-step-title">다음 실행을 함께 설계할 준비가 되어 있습니다</h2>
              <p>
                제품 구축, 업무자동화, AI 영상, 리셀러 파트너 운영 중 지금 가장 중요한 과제를 알려주세요.
                현황과 목표에 맞는 첫 실행 단계를 함께 정리합니다.
              </p>
            </CompanyNextStepCopy>
            <CompanyNextStepActions>
              <CompanyPrimaryAction href="/corp/partnership/business">
                사업 제휴 문의
                <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
              </CompanyPrimaryAction>
              <CompanySecondaryAction href="#company-introduction-execution">
                실행 방식 다시 보기
              </CompanySecondaryAction>
            </CompanyNextStepActions>
          </CompanyNextStepInner>
        </CompanyNextStepSection>
      ) : null}

      {isCeoVariant ? (
        <DarkSection>
          <CeoVisionDispatch aria-labelledby="ceo-vision-title">
            <CeoVisionDispatchHeader>
              <span>CEO 비전 · 사장에서 날아온 메모</span>
              <h2 id="ceo-vision-title">
                그냥돼지입니다.
                <br />
                만능 엔터테이너입니다.
              </h2>
              <p>사실 이도저도 아닌데, 하다 보면 얻어걸리는 게 현실입니다.</p>
            </CeoVisionDispatchHeader>

            <CeoVisionStamp aria-label="오늘의 비전 결재: 일단 해봄">
              <small>오늘의 비전 결재</small>
              <strong>일단 해봄</strong>
              <span>실패해도 다음엔 덜 헤맴</span>
            </CeoVisionStamp>

            <CeoVisionNoteGrid>
              {activeVisionPillars.map((pillar, index) => (
                <article key={pillar.title}>
                  <span style={{ backgroundColor: pillar.tone }}>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{pillar.title}</h3>
                    <p>{pillar.desc}</p>
                  </div>
                </article>
              ))}
            </CeoVisionNoteGrid>
          </CeoVisionDispatch>
        </DarkSection>
      ) : null}

      {isCeoVariant ? (
        <BusinessSection>
        <SectionInner initial={shouldReduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.18 }} variants={staggerVariant}>
          <SectionHeading>
            <motion.p variants={revealVariant}>대표 상세 소개서</motion.p>
            <motion.h2 variants={revealVariant}>
              대표의 브랜드, 이력, 소개와 통계 분석을 한곳에서
            </motion.h2>
            <motion.span variants={revealVariant}>
              방문자에게는 대표의 방향을, 구성원에게는 판단 기준을, 파트너에게는 신뢰의 근거를 보여줍니다.
            </motion.span>
          </SectionHeading>

          <CeoDocumentHub variants={revealVariant}>
            <CeoDocumentTabs role="tablist" aria-label="대표 상세 소개서 탭 선택">
              {ceoDocumentTabs.map((tab, index) => {
                const isActive = activeCeoDocumentTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    id={`ceo-document-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="ceo-document-panel"
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveCeoDocumentTab(tab.id)}
                    onKeyDown={(event) => handleCeoDocumentTabKeyDown(event, index)}
                  >
                    <small>{tab.eyebrow}</small>
                    <strong>{tab.label}</strong>
                  </button>
                );
              })}
            </CeoDocumentTabs>

            <CeoDocumentPanel
              id="ceo-document-panel"
              role="tabpanel"
              aria-labelledby={`ceo-document-tab-${activeCeoDocumentTab}`}
              tabIndex={0}
            >
              {activeCeoDocumentTab === 'brands' ? (
                <>
                  <CeoDocumentIntro>
                    <div>
                      <span>BRAND PORTFOLIO</span>
                      <h3>대표가 이끄는 브랜드</h3>
                    </div>
                    <p>기업의 방향과 제품의 개성을 이미지 중심으로 한눈에 확인할 수 있습니다.</p>
                  </CeoDocumentIntro>

                  <CeoBrandGrid>
                    {ceoBrandCollection.map((brand) => (
                      <article key={brand.name}>
                        <div className={`brand-image brand-image--${brand.imageStyle}`}>
                          <img
                            src={brand.imageUrl}
                            alt={brand.imageAlt}
                            width={brand.imageWidth}
                            height={brand.imageHeight}
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <footer>
                          <small>{brand.category}</small>
                          <h4>{brand.name}</h4>
                          <p>{brand.description}</p>
                        </footer>
                      </article>
                    ))}
                  </CeoBrandGrid>
                </>
              ) : null}

              {activeCeoDocumentTab === 'resume' ? (
                <CeoResumePaper>
                  <CeoResumeAside>
                    <img
                      src="/propig-favicon.svg"
                      alt="SIMPLYPIG 브랜드 심볼"
                      width="64"
                      height="64"
                      loading="lazy"
                      decoding="async"
                    />
                    <span>CEO RESUME</span>
                    <h3>SIMPLYPIG<br />대표이사</h3>
                    <p>현장 문제를 기술과 콘텐츠, 운영 체계로 전환하는 실행형 리더</p>

                    <dl>
                      <div>
                        <dt>직책</dt>
                        <dd>대표이사 · CEO</dd>
                      </div>
                      <div>
                        <dt>소속</dt>
                        <dd>SIMPLYPIG</dd>
                      </div>
                      <div>
                        <dt>전문 분야</dt>
                        <dd>AI 전략 · 제품 · 자동화</dd>
                      </div>
                      <div>
                        <dt>운영 기준</dt>
                        <dd>현장 · 실행 · 책임</dd>
                      </div>
                    </dl>
                  </CeoResumeAside>

                  <CeoResumeBody>
                    <section>
                      <header>
                        <span>01</span>
                        <div>
                          <small>PROFILE</small>
                          <h4>경력 요약</h4>
                        </div>
                      </header>
                      <p>
                        사업 전략부터 AI 서비스, 웹·앱, 업무 자동화, 콘텐츠 제작까지 서로 다른 전문 영역을
                        하나의 실행 흐름으로 연결합니다.
                      </p>
                    </section>

                    <section>
                      <header>
                        <span>02</span>
                        <div>
                          <small>EXPERIENCE</small>
                          <h4>주요 경력</h4>
                        </div>
                      </header>
                      <CeoResumeTimeline>
                        {ceoResumeExperience.map((experience) => (
                          <article key={experience.role}>
                            <small>{experience.period}</small>
                            <div>
                              <h5>{experience.role}</h5>
                              <strong>{experience.organization}</strong>
                              <p>{experience.description}</p>
                            </div>
                          </article>
                        ))}
                      </CeoResumeTimeline>
                    </section>

                    <section>
                      <header>
                        <span>03</span>
                        <div>
                          <small>CORE SKILLS</small>
                          <h4>핵심 역량</h4>
                        </div>
                      </header>
                      <CeoResumeSkills>
                        {ceoResumeSkills.map((skill) => <li key={skill}>{skill}</li>)}
                      </CeoResumeSkills>
                    </section>
                  </CeoResumeBody>
                </CeoResumePaper>
              ) : null}

              {activeCeoDocumentTab === 'introduction' ? (
                <CeoIntroductionLayout>
                  <CeoIntroductionLead>
                    <span>SELF INTRODUCTION</span>
                    <h3>대표소개서</h3>
                    <p>
                      사업을 시작한 이유부터 리더십과 미래 방향까지, 자기소개서의 핵심 문항을
                      아코디언으로 구성했습니다.
                    </p>
                    <strong>문항을 선택해 자세한 내용을 확인하세요.</strong>
                  </CeoIntroductionLead>

                  <CeoIntroductionAccordion>
                    {ceoIntroductionItems.map((item, index) => {
                      const isOpen = openCeoIntroductionIndex === index;
                      const panelId = `ceo-introduction-panel-${index}`;

                      return (
                        <article key={item.title} className={isOpen ? 'is-open' : undefined}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => setOpenCeoIntroductionIndex(isOpen ? -1 : index)}
                          >
                            <span>
                              <small>{item.eyebrow}</small>
                              <strong>{item.title}</strong>
                              <em>{item.summary}</em>
                            </span>
                            <i aria-hidden="true">
                              <FontAwesomeIcon icon={faChevronDown} />
                            </i>
                          </button>
                          <motion.div
                            id={panelId}
                            hidden={!isOpen}
                            initial={false}
                            animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                            transition={{ duration: shouldReduceMotion ? 0 : 0.24 }}
                          >
                            <p>{item.detail}</p>
                          </motion.div>
                        </article>
                      );
                    })}
                  </CeoIntroductionAccordion>
                </CeoIntroductionLayout>
              ) : null}

              {activeCeoDocumentTab === 'analysis' ? (
                <CeoLeadershipAnalytics>
                  {operatingContent}
                </CeoLeadershipAnalytics>
              ) : null}
            </CeoDocumentPanel>
          </CeoDocumentHub>


          <BusinessGrid>
            {activeBusinessCards.map((card) => (
              <motion.article key={card.title} variants={revealVariant} whileHover={shouldReduceMotion ? undefined : { y: -7 }}>
                <i style={{ backgroundColor: card.color }}>
                  <FontAwesomeIcon icon={card.icon} />
                </i>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
                <small>{card.detail}</small>
              </motion.article>
            ))}
          </BusinessGrid>

          <PipelinePanel variants={revealVariant}>
            <div>
              <span>{isCeoVariant ? '리더십 수행 흐름' : '사업 수행 흐름'}</span>
              <h3>{isCeoVariant ? '한 결정을 실행으로 완성하는 단계' : '하나의 아이디어를 성장 자산으로 완성하는 5단계'}</h3>
            </div>
            {isCeoVariant ? (
              <PipelineGrid>
                {ceoBusinessPipelines.map((item, index) => (
                  <article key={item}>
                    <b>{index + 1}</b>
                    <strong>{item}</strong>
                  </article>
                ))}
              </PipelineGrid>
            ) : (
              <>
                <PipelineGrid aria-label="사업 운영 5단계">
                  {businessOperationStages.map((stage, index) => {
                    const isSelected = selectedBusinessStageIndex === index;
                    const detailId = 'business-operation-stage-detail';

                    return (
                      <button
                        key={stage.title}
                        type="button"
                        aria-pressed={isSelected}
                        aria-controls={detailId}
                        className={isSelected ? 'is-selected' : undefined}
                        onClick={() => setSelectedBusinessStageState({ variant: resolvedVariant, index })}
                      >
                        <b>{String(index + 1).padStart(2, '0')}</b>
                        <strong>{stage.title}</strong>
                        <span>{stage.summary}</span>
                      </button>
                    );
                  })}
                </PipelineGrid>

                <BusinessStageDetail
                  key={selectedBusinessStage.title}
                  id="business-operation-stage-detail"
                  aria-live="polite"
                >
                  <div>
                    <span>STEP {String(selectedBusinessStageIndex + 1).padStart(2, '0')}</span>
                    <h4>{selectedBusinessStage.title}</h4>
                  </div>
                  <div>
                    <p>{selectedBusinessStage.detail}</p>
                    <strong>{selectedBusinessStage.outcome}</strong>
                  </div>
                </BusinessStageDetail>
              </>
            )}
          </PipelinePanel>

        </SectionInner>
        </BusinessSection>
      ) : null}
    </PageShell>
  );
}

const PageShell = styled.main<{ $squareSections: boolean }>`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  background: #eef1f4;
  color: #333236;
  font-family: Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif;
  letter-spacing: 0;

  * {
    box-sizing: border-box;
    letter-spacing: 0;
  }

  button,
  a {
    font: inherit;
  }

  > section {
    margin-bottom: 16px;
    border-radius: ${({ $squareSections }) => ($squareSections ? '0' : '26px')};
    overflow: hidden;
  }

  > :last-child {
    margin-bottom: 0;
  }

  > :first-child {
    margin-bottom: 16px;
    border-radius: ${({ $squareSections }) => ($squareSections ? '0' : '16px')};
  }

  h1,
  h2,
  h3 {
    text-wrap: balance;
  }

  button {
    touch-action: manipulation;
  }

  @media (max-width: 640px) {
    padding: 10px;

    > section {
      margin-bottom: 10px;
      border-radius: ${({ $squareSections }) => ($squareSections ? '0' : '20px')};
    }

    > :first-child {
      margin-bottom: 10px;
      border-radius: ${({ $squareSections }) => ($squareSections ? '0' : '12px')};
    }

    [data-dashboard-section-motion-state='before'][data-dashboard-section-direction='left'] {
      --dashboard-section-motion-x: 0px;
    }

    [data-dashboard-section-motion-state='before'][data-dashboard-section-direction='right'] {
      --dashboard-section-motion-x: 0px;
    }

    [data-dashboard-section-motion-state='after'][data-dashboard-section-direction='left'] {
      --dashboard-section-motion-x: 0px;
    }

    [data-dashboard-section-motion-state='after'][data-dashboard-section-direction='right'] {
      --dashboard-section-motion-x: 0px;
    }
  }

  [data-dashboard-motion] {
    --dashboard-motion-delay: 0ms;
    --dashboard-motion-lift: 0px;
    opacity: 1;
    transform: translate3d(0, var(--dashboard-motion-lift), 0) scale(1);
    transform-origin: center;
    transition:
      opacity 0.46s ease var(--dashboard-motion-delay),
      transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
    will-change: opacity, transform;
  }

  [data-dashboard-motion-state='pending'] {
    opacity: 0;
    transform: translate3d(0, calc(var(--dashboard-motion-lift) + 28px), 0) scale(0.985);
  }

  [data-dashboard-section-motion] {
    --dashboard-section-motion-x: 0px;
    opacity: 1;
    transition: opacity 0.5s ease;
    will-change: opacity;
  }

  [data-dashboard-section-motion] > * {
    transform: translate3d(var(--dashboard-section-motion-x), 0, 0);
    transition: transform 0.56s cubic-bezier(0.22, 0.84, 0.28, 1);
    will-change: transform;
  }

  [data-dashboard-section-motion-state='before'][data-dashboard-section-direction='left'] {
    --dashboard-section-motion-x: 0px;
  }

  [data-dashboard-section-motion-state='before'][data-dashboard-section-direction='right'] {
    --dashboard-section-motion-x: 0px;
  }

  [data-dashboard-section-motion-state='after'][data-dashboard-section-direction='left'] {
    --dashboard-section-motion-x: 0px;
  }

  [data-dashboard-section-motion-state='after'][data-dashboard-section-direction='right'] {
    --dashboard-section-motion-x: 0px;
  }

  [data-dashboard-chart-bar],
  [data-dashboard-chart-segment] {
    transform: scaleX(1);
    transform-origin: left center;
  }

  [data-dashboard-chart-vertical] {
    transform: scaleY(1);
    transform-origin: center bottom;
  }

  [data-dashboard-chart-radar] {
    opacity: 1;
    transform: scale(1);
    transform-box: fill-box;
    transform-origin: center;
  }

  [data-dashboard-chart-donut-segment] {
    stroke-dasharray: var(--pie-segment-dasharray);
    stroke-dashoffset: var(--pie-segment-offset);
  }

  [data-dashboard-chart-segment='right'] {
    transform-origin: right center;
  }

  [data-dashboard-motion-state='pending'] [data-dashboard-chart-bar],
  [data-dashboard-motion-state='pending'] [data-dashboard-chart-segment] {
    transform: scaleX(0);
  }

  [data-dashboard-motion-state='pending'] [data-dashboard-chart-vertical] {
    transform: scaleY(0);
  }

  [data-dashboard-motion-state='pending'] [data-dashboard-chart-radar] {
    opacity: 0;
    transform: scale(0.78);
  }

  [data-dashboard-motion-state='pending'] [data-dashboard-chart-donut-segment] {
    stroke-dasharray: 0 100;
  }

  [data-dashboard-motion-state='visible'] [data-dashboard-chart-bar],
  [data-dashboard-motion-state='visible'] [data-dashboard-chart-segment] {
    animation: dashboard-chart-grow 0.72s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  [data-dashboard-motion-state='visible'] [data-dashboard-chart-vertical] {
    animation: dashboard-chart-rise 0.72s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  [data-dashboard-motion-state='visible'] [data-dashboard-chart-radar] {
    animation: dashboard-radar-reveal 0.62s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  [data-dashboard-motion-state='visible'] [data-dashboard-chart-donut-segment] {
    animation: dashboard-donut-segment-fill 0.62s cubic-bezier(0.2, 0.8, 0.2, 1) var(--pie-delay) both;
  }

  [data-dashboard-motion-state='pending'] [data-dashboard-chart-donut] {
    opacity: 0;
    transform: scale(0.92);
  }

  [data-dashboard-motion-state='visible'] [data-dashboard-chart-donut] {
    animation: dashboard-donut-reveal 0.68s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes dashboard-chart-grow {
    from {
      transform: scaleX(0);
    }

    to {
      transform: scaleX(1);
    }
  }

  @keyframes dashboard-donut-reveal {
    from {
      opacity: 0;
      transform: scale(0.92);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes dashboard-donut-segment-fill {
    from {
      stroke-dasharray: 0 100;
    }

    to {
      stroke-dasharray: var(--pie-segment-dasharray);
    }
  }

  @keyframes dashboard-chart-rise {
    from {
      transform: scaleY(0);
    }

    to {
      transform: scaleY(1);
    }
  }

  @keyframes dashboard-radar-reveal {
    from {
      opacity: 0;
      transform: scale(0.78);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-dashboard-motion],
    [data-dashboard-section-motion],
    [data-dashboard-motion-state='pending'],
    [data-dashboard-chart-donut],
    [data-dashboard-chart-bar],
    [data-dashboard-chart-segment],
    [data-dashboard-chart-vertical],
    [data-dashboard-chart-radar],
    [data-dashboard-chart-donut-segment] {
      opacity: 1 !important;
      transform: none !important;
      transition: none !important;
      animation: none !important;
      will-change: auto;
    }

    [data-dashboard-chart-donut-segment] {
      stroke-dasharray: var(--pie-segment-dasharray) !important;
      stroke-dashoffset: var(--pie-segment-offset) !important;
    }

    [data-dashboard-section-motion] > * {
      transform: none !important;
      transition: none !important;
      will-change: auto;
    }
  }
`;

const TopNotice = styled.div`
  background: #080c16;
  padding: 12px 16px;
  color: #f7f8fb;
  font-size: 0.875rem;
  font-weight: 800;
  text-align: center;
`;

const HeroSection = styled.section<{ $isCeo?: boolean }>`
  position: relative;
  overflow: hidden;
  background: #f8fafc;
  color: #111827;
  padding: ${({ $isCeo }) => ($isCeo ? '48px 20px 56px' : '64px 20px 80px')};

  @media (max-width: 640px) {
    padding: ${({ $isCeo }) => ($isCeo ? '32px 20px 44px' : '48px 20px 56px')};
  }
`;

const HeroGrid = styled.div`
  position: absolute;
  inset: 0;
  opacity: 0.8;
  background-image:
    linear-gradient(rgba(15, 23, 42, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.055) 1px, transparent 1px);
  background-size: 64px 64px;
`;

const HeroWash = styled.div`
  position: absolute;
  inset: 0 auto 0 0;
  width: 48%;
  background: linear-gradient(90deg, #dff8f2 0%, #eef6ff 64%, transparent 100%);
`;

const HeroInner = styled.div<{ $isCeo?: boolean }>`
  position: relative;
  z-index: 1;
  width: min(1180px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(280px, 0.72fr) minmax(0, 1.28fr);
  gap: ${({ $isCeo }) => ($isCeo ? '20px' : '40px')};
  align-items: ${({ $isCeo }) => ($isCeo ? 'start' : 'center')};

  > .ceo-hero-copy {
    display: contents;
  }

  > .ceo-hero-copy > .ceo-hero-badge,
  > .ceo-hero-copy > .ceo-hero-title,
  > .ceo-hero-copy > .ceo-hero-description {
    grid-column: 1 / -1;
    order: 1;
  }

  > .ceo-hero-photo {
    grid-column: 1;
    grid-row: 4;
    align-self: start;
    order: 2;
  }

  > .ceo-hero-copy > .ceo-hero-accordion {
    grid-column: 2;
    grid-row: 4;
    align-self: start;
    margin-top: 0;
    order: 3;
  }

  h1 {
    margin: 28px 0 0;
    color: #111827;
    font-size: 4rem;
    font-weight: 950;
    line-height: 1.05;
    text-wrap: balance;
    word-break: keep-all;
  }

  p {
    max-width: 720px;
    margin: 24px 0 0;
    color: #334155;
    font-size: 1.18rem;
    font-weight: 700;
    line-height: 1.75;
    word-break: keep-all;
  }

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;

    > .ceo-hero-photo,
    > .ceo-hero-copy > .ceo-hero-accordion {
      grid-column: 1;
      grid-row: auto;
    }

    h1 {
      font-size: 3.15rem;
    }
  }

  @media (max-width: 640px) {
    h1 {
      font-size: 2.35rem;
    }

    p {
      font-size: 1rem;
    }
  }
`;

const HeroImageCard = styled.div<{ $isPortrait?: boolean }>`
  position: relative;
  width: ${(props) => (props.$isPortrait ? 'min(460px, 100%)' : 'min(420px, 100%)')};

  img {
    position: relative;
    width: 100%;
    aspect-ratio: ${(props) => (props.$isPortrait ? '4 / 5' : '1')};
    display: block;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
    object-fit: contain;
    box-shadow: 0 32px 90px rgba(15, 23, 42, 0.18);
    transition: transform 180ms ease, box-shadow 180ms ease;
  }
`;

const HeroImageGlow = styled.div`
  position: absolute;
  inset: -20px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(0, 184, 148, 0.18), rgba(79, 124, 255, 0.14), transparent);
  filter: blur(48px);
  pointer-events: none;
`;

const HeroImageButton = styled.button`
  position: relative;
  z-index: 1;
  width: 100%;
  display: block;
  margin: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  padding: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  img {
    animation: brand-story-image-in 280ms ease both;
  }

  &:hover img {
    transform: translateY(-2px) scale(1.006);
    box-shadow: 0 38px 96px rgba(15, 23, 42, 0.23);
  }

  &:active img {
    transform: scale(0.995);
  }

  &:focus-visible {
    outline: 3px solid #2563eb;
    outline-offset: 5px;
  }

  @keyframes brand-story-image-in {
    from {
      opacity: 0.35;
      filter: saturate(0.72);
    }

    to {
      opacity: 1;
      filter: saturate(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    img {
      animation: none;
      transition: none;
    }

    &:hover img,
    &:active img {
      transform: none;
    }
  }
`;

const HeroVideoFrame = styled.div`
  position: relative;
  z-index: 1;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #0f172a;
  box-shadow: 0 32px 90px rgba(15, 23, 42, 0.18);

  iframe {
    position: absolute;
    top: 0;
    left: 50%;
    width: 177.78%;
    height: 100%;
    border: 0;
    pointer-events: none;
    transform: translateX(-50%);
  }
`;

const HeroProfileReturnButton = styled.button`
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  border: 1px solid #dbe4ef;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.96);
  padding: 10px 12px;
  color: #111827;
  text-align: left;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;

  > span {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  small,
  strong {
    display: block;
  }

  small {
    color: #047857;
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }

  strong {
    font-size: 0.86rem;
    font-weight: 900;
  }

  i {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    background: #111827;
    color: #ffffff;
    font-size: 0.8rem;
    font-style: normal;
  }

  &:hover {
    border-color: #93c5fd;
    box-shadow: 0 16px 34px rgba(15, 23, 42, 0.14);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 3px solid #2563eb;
    outline-offset: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover,
    &:active {
      transform: none;
    }
  }
`;

const HeroStoryCue = styled.span`
  position: relative;
  z-index: 1;
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  border: 1px solid #dbe4ef;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.96);
  padding: 10px 12px;
  color: #111827;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);
  pointer-events: none;

  > span {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  small,
  strong {
    display: block;
  }

  small {
    color: #047857;
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }

  strong {
    font-size: 0.86rem;
    font-weight: 900;
  }

  i {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    background: #111827;
    color: #ffffff;
    font-size: 0.8rem;
    font-style: normal;
  }
`;

const StatusBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  background: #dcfce7;
  padding: 8px 16px;
  color: #047857;
  font-size: 0.9rem;
  font-weight: 900;

  span {
    width: 8px;
    height: 8px;
    border-radius: 8px;
    background: #10b981;
  }

  @media (max-width: 640px) {
    gap: 7px;
    padding: 8px 12px;
    font-size: 0.67rem;
    letter-spacing: 0.035em;
    white-space: nowrap;

    span {
      width: 7px;
      height: 7px;
    }
  }
`;

const GradientText = styled.span`
  background: linear-gradient(90deg, #059669, #0891b2, #2563eb);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
`;

const HeroMetricGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 32px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const HeroActionGroup = styled(motion.nav)`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 24px;

  @media (max-width: 640px) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
`;

const HeroActionLink = styled.a`
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid #111827;
  border-radius: 8px;
  background: #111827;
  padding: 0 16px;
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 180ms ease, border-color 180ms ease, transform 180ms ease;

  &:hover {
    border-color: #0f766e;
    background: #0f766e;
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 3px solid #2563eb;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

const HeroSecondaryAction = styled.a`
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.78);
  padding: 0 16px;
  color: #1e293b;
  font-size: 0.9rem;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
  transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease;

  &:hover {
    border-color: #94a3b8;
    background: #ffffff;
    color: #0f766e;
  }

  &:focus-visible {
    outline: 3px solid #2563eb;
    outline-offset: 3px;
  }

  @media (max-width: 640px) {
    width: 100%;
  }
`;

const CeoHeroAccordionColumn = styled.div`
  min-width: 0;
  align-self: start;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;

  h1 {
    max-width: 780px;
    margin: 12px 0 0;
    color: #111827;
    font-size: 2.9rem;
    font-weight: 950;
    line-height: 1.08;
    word-break: keep-all;
  }

  > p {
    max-width: 760px;
    margin: 10px 0 0;
    color: #334155;
    font-size: 1.02rem;
    font-weight: 750;
    line-height: 1.7;
    word-break: keep-all;
  }

  @media (max-width: 1024px) {
    h1 {
      font-size: 2.55rem;
    }
  }

  @media (max-width: 640px) {
    h1 {
      font-size: 2rem;
      line-height: 1.18;
    }

    > p {
      font-size: 0.95rem;
    }
  }
`;

const CeoHeroAccordionList = styled.div`
  display: grid;
  gap: 10px;
  margin-top: 16px;

  article {
    overflow: hidden;
    border: 1px solid #dbe3ef;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.055);
    transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  }

  article.is-open {
    border-color: #93c5fd;
    background: #ffffff;
    box-shadow: 0 18px 44px rgba(37, 99, 235, 0.12);
  }

  button {
    width: 100%;
    min-height: 72px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 42px;
    align-items: center;
    gap: 16px;
    border: 0;
    background: transparent;
    padding: 14px 16px;
    color: #111827;
    text-align: left;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: -3px;
    }
  }

  small {
    display: block;
    color: #2563eb;
    font-size: 0.72rem;
    font-weight: 950;
  }

  strong {
    display: block;
    margin-top: 5px;
    color: #111827;
    font-size: 1.02rem;
    font-weight: 950;
    line-height: 1.25;
    word-break: keep-all;
  }

  em {
    display: block;
    margin-top: 5px;
    color: #475569;
    font-size: 0.86rem;
    font-style: normal;
    font-weight: 750;
    line-height: 1.45;
    word-break: keep-all;
  }

  i {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #eff6ff;
    color: #2563eb;
    transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease;
  }

  i.is-open {
    transform: rotate(180deg);
    background: #2563eb;
    color: #ffffff;
  }

  article > div {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition: grid-template-rows 0.22s ease, opacity 0.18s ease;
  }

  article > div.is-open {
    grid-template-rows: 1fr;
    opacity: 1;
  }

  article > div p {
    min-height: 0;
    overflow: hidden;
    margin: 0;
    border-top: 1px solid #e8edf7;
    padding: 0 16px;
    color: #334155;
    font-size: 0.9rem;
    font-weight: 750;
    line-height: 1.68;
    word-break: keep-all;
    transition: padding 0.22s ease;
  }

  article > div.is-open p {
    padding: 14px 16px 16px;
  }

  @media (max-width: 640px) {
    button {
      min-height: 72px;
      grid-template-columns: minmax(0, 1fr) 38px;
      gap: 12px;
      padding: 13px;
    }

    i {
      width: 38px;
      height: 38px;
    }
  }
`;

const MetricCard = styled.div`
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #ffffff;
  padding: 18px 20px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);

  > span {
    color: #334155;
    font-size: 0.78rem;
    font-weight: 900;
  }

  strong {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    margin-top: 8px;
    color: #111827;
    font-size: 2rem;
    font-weight: 950;
  }

  em {
    padding-bottom: 4px;
    color: #0891b2;
    font-size: 0.9rem;
    font-style: normal;
    font-weight: 900;
  }
`;

const OperatingSection = styled(motion.section)`
  border-block: 1px solid #e8eaf1;
  background: #f7f8fb;
  padding: 64px 20px;
`;

const CompanyNextStepSection = styled.section`
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(45, 212, 191, 0.16), transparent 34%),
    linear-gradient(310deg, rgba(96, 165, 250, 0.18), transparent 38%),
    #0d1726;
  padding: 72px 20px;
  color: #ffffff;

  &::after {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(226, 232, 240, 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(226, 232, 240, 0.07) 1px, transparent 1px);
    background-size: 52px 52px;
    content: '';
    opacity: 0.54;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    padding: 52px 20px;
  }
`;

const CompanyNextStepInner = styled.div`
  position: relative;
  z-index: 1;
  width: min(1180px, 100%);
  margin: 0 auto;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 32px;

  @media (max-width: 820px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const CompanyNextStepCopy = styled.div`
  max-width: 720px;

  > span {
    color: #99f6e4;
    font-size: 0.72rem;
    font-weight: 950;
    letter-spacing: 0.1em;
  }

  h2 {
    margin: 14px 0 0;
    color: #ffffff;
    font-size: clamp(2rem, 4vw, 3.2rem);
    font-weight: 950;
    line-height: 1.13;
    word-break: keep-all;
  }

  p {
    margin: 16px 0 0;
    color: #cbd5e1;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.72;
    word-break: keep-all;
  }
`;

const CompanyNextStepActions = styled.div`
  min-width: min(100%, 264px);
  display: grid;
  gap: 10px;

  @media (max-width: 820px) {
    width: min(100%, 360px);
  }

  @media (max-width: 640px) {
    width: 100%;
  }
`;

const CompanyPrimaryAction = styled.a`
  min-height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border: 1px solid #f8fafc;
  border-radius: 8px;
  background: #f8fafc;
  padding: 0 16px;
  color: #0f172a;
  font-size: 0.92rem;
  font-weight: 950;
  text-decoration: none;
  transition: background-color 180ms ease, border-color 180ms ease, transform 180ms ease;

  &:hover {
    border-color: #99f6e4;
    background: #99f6e4;
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 3px solid #ffffff;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

const CompanySecondaryAction = styled.a`
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(226, 232, 240, 0.32);
  border-radius: 8px;
  padding: 0 16px;
  color: #e2e8f0;
  font-size: 0.87rem;
  font-weight: 900;
  text-decoration: none;
  transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;

  &:hover {
    border-color: rgba(153, 246, 228, 0.7);
    background: rgba(153, 246, 228, 0.1);
    color: #ffffff;
  }

  &:focus-visible {
    outline: 3px solid #99f6e4;
    outline-offset: 3px;
  }
`;

const OperatingInner = styled.div`
  width: min(1180px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(300px, 0.92fr) minmax(0, 1.08fr);
  gap: 24px;
  align-items: stretch;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const OperatingCopy = styled(motion.div)`
  min-width: 0;
  border: 1px solid #e2e5ee;
  border-radius: 8px;
  background: #ffffff;
  padding: 32px;
  box-shadow: 0 18px 45px rgba(21, 27, 45, 0.05);

  > p {
    margin: 0;
    color: #1d4ed8;
    font-size: 0.9rem;
    font-weight: 950;
  }

  h2 {
    margin: 12px 0 0;
    color: #24242a;
    font-size: 2.25rem;
    font-weight: 950;
    line-height: 1.15;
    word-break: keep-all;
  }

  > span {
    display: block;
    margin-top: 20px;
    color: #475569;
    font-size: 1rem;
    font-weight: 650;
    line-height: 1.75;
    word-break: keep-all;
  }
`;

const OperatingTabs = styled.div`
  display: grid;
  gap: 12px;
  margin-top: 28px;

  button {
    width: 100%;
    border: 1px solid #eef0f6;
    border-radius: 8px;
    background: #fbfcff;
    padding: 16px;
    color: #24242a;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;

    &:hover {
      border-color: #cbd7ff;
      background: #ffffff;
      transform: translateX(4px);
    }

    &:focus-visible {
      outline: 2px solid #4f7cff;
      outline-offset: 2px;
    }

    &.is-selected {
      border-color: #4f7cff;
      background: #f0f4ff;
      box-shadow: 0 16px 36px rgba(79, 124, 255, 0.14);
    }

    > span {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    small {
      display: block;
      color: #7c3aed;
      font-size: 0.72rem;
      font-weight: 950;
    }

    strong {
      display: block;
      margin-top: 8px;
      font-size: 1.12rem;
      font-weight: 950;
    }

    b {
      flex: 0 0 auto;
      border-radius: 8px;
      background: #111827;
      padding: 8px 12px;
      color: #ffffff;
      font-size: 0.9rem;
      font-weight: 950;
    }

    &.is-selected b {
      background: #1d4ed8;
    }

    em,
    i {
      display: block;
      font-style: normal;
    }

    em {
      margin-top: 12px;
      color: #475569;
      font-size: 0.9rem;
      font-weight: 700;
      line-height: 1.65;
    }

    i {
      margin-top: 10px;
      color: #1d4ed8;
      font-size: 0.78rem;
      font-weight: 950;
    }
  }
`;

const ChartPanel = styled(motion.div)`
  min-width: 0;
  border: 1px solid #273244;
  border-radius: 8px;
  background: #111827;
  padding: 32px;
  color: #ffffff;
  box-shadow: 0 24px 70px rgba(17, 24, 39, 0.18);

  @media (max-width: 720px) {
    padding: 20px;
  }
`;

const ChartHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;

  p {
    margin: 0;
    color: #9bbcff;
    font-size: 0.9rem;
    font-weight: 950;
  }

  h3 {
    margin: 12px 0 0;
    font-size: 2rem;
    font-weight: 950;
  }

  span {
    display: block;
    max-width: 560px;
    margin-top: 12px;
    color: #c7d0df;
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.75;
    word-break: keep-all;
  }

  @media (max-width: 720px) {
    flex-direction: column;

    h3 {
      font-size: 1.65rem;
    }
  }
`;

const ScoreBox = styled.div`
  flex: 0 0 auto;
  min-width: 110px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  padding: 12px 16px;
  text-align: right;

  span {
    margin: 0;
    color: #c7d0df;
    font-size: 0.76rem;
    font-weight: 800;
  }

  strong {
    display: block;
    margin-top: 4px;
    color: #9bbcff;
    font-size: 2rem;
    font-weight: 950;
  }
`;

const ChartCanvas = styled.div`
  min-width: 0;
  margin-top: 28px;
  overflow: hidden;
  border: 1px solid #273244;
  border-radius: 8px;
  background: #182133;
  padding: 16px;

  @media (max-width: 720px) {
    padding: 8px;
  }
`;

const BarStack = styled.div`
  min-height: 320px;
  display: grid;
  align-content: center;
  gap: 26px;
  padding: 20px 6px;
`;

const BarRow = styled.div`
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 52px;
  gap: 14px;
  align-items: center;

  > span {
    color: #dbeafe;
    font-size: 0.9rem;
    font-weight: 900;
  }

  > b {
    height: 42px;
    overflow: hidden;
    border-radius: 8px;
    background:
      repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px 16px),
      #243049;
  }

  > b i {
    display: block;
    height: 100%;
    border-radius: inherit;
    box-shadow: 0 14px 32px rgba(79, 124, 255, 0.24);
  }

  strong {
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 950;
    text-align: right;
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr 52px;

    > span {
      grid-column: 1 / -1;
    }
  }
`;

const VerticalBarChart = styled.div`
  min-height: 320px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  align-items: end;
  padding: 18px 8px 8px;

  article {
    min-width: 0;
    display: grid;
    grid-template-rows: 220px auto auto;
    gap: 8px;
    text-align: center;
  }

  article > div {
    height: 220px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    overflow: hidden;
    border-radius: 8px;
    background:
      repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px 20%),
      #243049;
  }

  article > div i {
    width: min(64px, 68%);
    min-height: 8px;
    display: block;
    border-radius: 8px 8px 0 0;
    box-shadow: 0 -14px 30px rgba(79, 124, 255, 0.22);
  }

  strong {
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 950;
  }

  span {
    min-width: 0;
    color: #aab6c8;
    font-size: 0.82rem;
    font-weight: 850;
    line-height: 1.35;
    word-break: keep-all;
  }

  @media (max-width: 520px) {
    gap: 10px;
    padding-inline: 0;

    article {
      grid-template-rows: 190px auto auto;
    }

    article > div {
      height: 190px;
    }
  }
`;

const PieGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(180px, 0.95fr);
  gap: 16px;
  align-items: center;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const PieDonut = styled(motion.div)`
  width: min(320px, 100%);
  aspect-ratio: 1;
  position: relative;
  display: grid;
  place-items: center;
  justify-self: center;
  border-radius: 50%;
  background: #243049;
  padding: 14px;
  overflow: hidden;
  box-shadow:
    0 22px 54px rgba(0, 0, 0, 0.22),
    inset 0 0 0 1px rgba(255, 255, 255, 0.12);

  svg {
    position: absolute;
    inset: 14px;
    width: calc(100% - 28px);
    height: calc(100% - 28px);
    transform: rotate(-90deg);
  }

  .pie-track,
  .pie-segment {
    fill: none;
    stroke-width: 30;
  }

  .pie-track {
    stroke: #344158;
  }

  .pie-segment {
    stroke-linecap: butt;
  }

  > span {
    position: relative;
    z-index: 1;
    width: 46%;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 4px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 28%, #2f3d55, #151d2c 72%);
    box-shadow: inset 0 0 0 1px #36445d, 0 8px 18px rgba(3, 7, 18, 0.28);
  }

  strong {
    color: #ffffff;
    font-size: 2.1rem;
    font-weight: 950;
  }

  em {
    color: #aab6c8;
    font-size: 0.82rem;
    font-style: normal;
    font-weight: 900;
  }
`;

const LegendStack = styled.div`
  display: grid;
  gap: 12px;

  div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-radius: 8px;
    background: #111827;
    padding: 12px 16px;
  }

  span {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
    border-radius: 8px;
  }

  strong {
    min-width: 0;
    margin-right: auto;
    color: #c7d0df;
    font-size: 0.9rem;
    font-weight: 850;
  }

  b {
    color: #ffffff;
    font-size: 0.9rem;
    font-weight: 950;
  }
`;

const RadarChart = styled.div`
  min-height: 410px;
  display: grid;
  place-items: center;

  @media (max-width: 720px) {
    min-height: 330px;
  }
`;

const RadarOrbit = styled.div`
  position: relative;
  width: min(100%, 410px);
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, rgba(124, 58, 237, 0.16) 0 18%, transparent 19%),
    radial-gradient(circle at center, rgba(124, 58, 237, 0.08), rgba(15, 23, 42, 0.28) 68%, rgba(8, 13, 24, 0.8) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(167, 139, 250, 0.28),
    inset 0 0 48px rgba(124, 58, 237, 0.12),
    0 28px 58px rgba(2, 6, 23, 0.28);

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .radar-orbit,
  .radar-orbit-inner {
    fill: none;
    stroke: rgba(167, 139, 250, 0.3);
    stroke-width: 1;
  }

  .radar-orbit-inner {
    stroke: rgba(148, 163, 184, 0.16);
    stroke-dasharray: 3 5;
  }

  .radar-grid {
    fill: rgba(124, 58, 237, 0.025);
    stroke: rgba(148, 163, 184, 0.34);
    stroke-width: 0.75;
  }

  .radar-axis {
    stroke: rgba(148, 163, 184, 0.3);
    stroke-width: 0.75;
  }

  .radar-value {
    fill: #7c3aed;
    fill-opacity: 0.38;
    stroke: #c4b5fd;
    stroke-width: 2.8;
    filter: drop-shadow(0 0 8px rgba(167, 139, 250, 0.42));
  }

  .radar-dot {
    fill: #ffffff;
    stroke: #7c3aed;
    stroke-width: 2;
  }

  @media (max-width: 720px) {
    width: min(100%, 330px);
  }
`;

const RadarCornerLabel = styled.div`
  position: absolute;
  z-index: 2;
  min-width: 82px;
  max-width: 104px;
  border: 1px solid rgba(167, 139, 250, 0.34);
  border-radius: 10px;
  background: rgba(9, 14, 27, 0.9);
  padding: 7px 9px;
  box-shadow: 0 8px 18px rgba(2, 6, 23, 0.28);
  pointer-events: none;

  span,
  strong {
    display: block;
    font-variant-numeric: tabular-nums;
  }

  span {
    color: #cbd5e1;
    font-size: 0.67rem;
    font-weight: 850;
    line-height: 1.25;
    word-break: keep-all;
  }

  strong {
    margin-top: 3px;
    color: #ddd6fe;
    font-size: 0.9rem;
    font-weight: 950;
  }

  @media (max-width: 720px) {
    min-width: 58px;
    max-width: 64px;
    padding: 6px 7px;

    span {
      font-size: 0.58rem;
    }

    strong {
      font-size: 0.78rem;
    }
  }
`;

const BalanceStack = styled.div`
  display: grid;
  gap: 20px;
`;

const BalanceRow = styled.div`
  border-radius: 8px;
  background: #111827;
  padding: 16px;

  > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  strong {
    color: #ffffff;
    font-size: 0.95rem;
    font-weight: 950;
  }

  span {
    color: #c7d0df;
    font-size: 0.8rem;
    font-weight: 800;
  }
`;

const BalanceBar = styled.div`
  display: grid;
  grid-template-columns: auto minmax(170px, 1fr) auto;
  gap: 12px;
  align-items: center;

  small {
    color: #aab6c8;
    font-size: 0.75rem;
    font-weight: 800;
  }

  b {
    height: 44px;
    display: flex;
    overflow: hidden;
    border-radius: 8px;
    background: #243049;
  }

  i,
  em {
    min-width: 0;
    display: flex;
    align-items: center;
    padding: 0 12px;
    color: #ffffff;
    font-size: 0.75rem;
    font-style: normal;
    font-weight: 950;
    white-space: nowrap;
  }

  i {
    justify-content: flex-start;
    background: #7c3aed;
  }

  em {
    justify-content: flex-end;
    background: #4f7cff;
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;

    small:last-child {
      text-align: right;
    }
  }
`;

const SectionInner = styled(motion.div)`
  width: min(1180px, 100%);
  margin: 0 auto;

  > p {
    margin: 0;
    color: #73a4ff;
    font-size: 1rem;
    font-weight: 950;
  }

  > h2 {
    max-width: 900px;
    margin: 16px 0 0;
    font-size: 3rem;
    font-weight: 950;
    line-height: 1.18;
    word-break: keep-all;
  }

  @media (max-width: 720px) {
    > h2 {
      font-size: 2.15rem;
    }
  }
`;

const DarkSection = styled.section`
  background: #080c16;
  padding: 80px 20px;
  color: #ffffff;
`;

const CeoVisionDispatch = styled.section`
  width: min(1180px, 100%);
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1.36fr) minmax(220px, 0.64fr);
  gap: 28px;
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.17);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.09), transparent 42%),
    #101c33;
  padding: 40px;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.32);
  animation: ceo-vision-dispatch-fly-in 0.72s cubic-bezier(0.2, 0.9, 0.3, 1) both;

  &::before {
    width: 180px;
    height: 180px;
    position: absolute;
    top: -88px;
    right: -50px;
    border: 20px solid rgba(255, 176, 0, 0.16);
    border-radius: 50%;
    content: '';
  }

  &::after {
    position: absolute;
    top: 28px;
    right: 190px;
    color: rgba(255, 255, 255, 0.25);
    content: '↗  ↗  ↗';
    font-size: 1.25rem;
    font-weight: 950;
    letter-spacing: 0.22em;
    transform: rotate(-18deg);
  }

  @keyframes ceo-vision-dispatch-fly-in {
    from {
      opacity: 0;
      transform: translate3d(-44px, 28px, 0) rotate(-2.5deg);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0) rotate(0deg);
    }
  }

  @media (max-width: 800px) {
    grid-template-columns: 1fr;
    gap: 22px;
    padding: 28px;
  }

  @media (max-width: 520px) {
    border-radius: 18px;
    padding: 22px;

    &::after {
      top: 16px;
      right: 16px;
      font-size: 0.9rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const CeoVisionDispatchHeader = styled.header`
  position: relative;
  z-index: 1;

  > span {
    display: inline-flex;
    border: 1px solid rgba(255, 176, 0, 0.45);
    border-radius: 999px;
    background: rgba(255, 176, 0, 0.1);
    padding: 7px 11px;
    color: #ffd778;
    font-size: 0.74rem;
    font-weight: 950;
    letter-spacing: 0.08em;
  }

  h2 {
    max-width: 700px;
    margin: 18px 0 0;
    color: #ffffff;
    font-size: 3.6rem;
    font-weight: 950;
    line-height: 1.08;
    word-break: keep-all;
  }

  p {
    max-width: 590px;
    margin: 20px 0 0;
    color: #d2dbe9;
    font-size: 1.08rem;
    font-weight: 700;
    line-height: 1.75;
    word-break: keep-all;
  }

  @media (max-width: 800px) {
    h2 {
      font-size: 3rem;
    }
  }

  @media (max-width: 520px) {
    h2 {
      font-size: 2rem;
    }

    p {
      font-size: 0.96rem;
    }
  }
`;

const CeoVisionStamp = styled.aside`
  min-height: 196px;
  position: relative;
  z-index: 1;
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 105, 85, 0.82);
  border-radius: 50%;
  background: rgba(62, 22, 28, 0.45);
  color: #ff9a8b;
  text-align: center;
  transform: rotate(7deg);

  &::before,
  &::after {
    position: absolute;
    inset: 8px;
    border: 1px dashed rgba(255, 154, 139, 0.72);
    border-radius: 50%;
    content: '';
  }

  &::after {
    inset: 17px;
    border-style: solid;
    opacity: 0.35;
  }

  small,
  strong,
  span {
    position: relative;
    z-index: 1;
  }

  small {
    font-size: 0.72rem;
    font-weight: 950;
    letter-spacing: 0.08em;
  }

  strong {
    margin-top: 6px;
    color: #fff1ed;
    font-size: 1.55rem;
    font-weight: 950;
  }

  span {
    max-width: 150px;
    margin-top: 8px;
    color: #ffc6bc;
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1.45;
    word-break: keep-all;
  }

  @media (max-width: 800px) {
    width: min(220px, 100%);
    min-height: 172px;
    justify-self: end;
  }

  @media (max-width: 520px) {
    justify-self: center;
  }
`;

const CeoVisionNoteGrid = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  article {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 14px;
    background: rgba(6, 12, 24, 0.4);
    padding: 18px;
  }

  article > span {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    color: #07101d;
    font-size: 0.74rem;
    font-weight: 950;
  }

  h3 {
    margin: 0;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 950;
    line-height: 1.35;
    word-break: keep-all;
  }

  p {
    margin: 8px 0 0;
    color: #bac7da;
    font-size: 0.84rem;
    font-weight: 650;
    line-height: 1.65;
    word-break: keep-all;
  }

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`;

const _SystemSection = styled.section`
  background: #f7f8fb;
  padding: 80px 20px;
`;

const SectionHeading = styled.div`
  text-align: center;

  p {
    margin: 0;
    color: #1d4ed8;
    font-size: 1rem;
    font-weight: 950;
  }

  h2 {
    margin: 16px 0 0;
    color: #24242a;
    font-size: 3rem;
    font-weight: 950;
    line-height: 1.18;
    word-break: keep-all;
  }

  span {
    display: block;
    max-width: 720px;
    margin: 20px auto 0;
    color: #475569;
    font-size: 1rem;
    line-height: 1.75;
    word-break: keep-all;
  }

  @media (max-width: 720px) {
    h2 {
      font-size: 2.15rem;
    }
  }
`;

const _StepGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  margin-top: 48px;

  article {
    border: 1px solid #e2e5ee;
    border-radius: 8px;
    background: #ffffff;
    padding: 28px;
    box-shadow: 0 18px 45px rgba(21, 27, 45, 0.05);
  }

  i {
    width: 56px;
    height: 56px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #ffffff;
    font-size: 1.35rem;
  }

  h3 {
    margin: 28px 0 0;
    color: #24242a;
    font-size: 1.5rem;
    font-weight: 950;
  }

  p {
    margin: 16px 0 0;
    color: #475569;
    line-height: 1.65;
  }

  @media (max-width: 920px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const _ArchitecturePanel = styled(motion.div)`
  margin-top: 56px;
  border: 1px solid #dce2ef;
  border-radius: 8px;
  background: #ffffff;
  padding: 28px;
  box-shadow: 0 22px 60px rgba(21, 27, 45, 0.06);

  > div:first-child {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  span {
    display: block;
    color: #7c3aed;
    font-size: 0.86rem;
    font-weight: 950;
  }

  h3 {
    margin: 8px 0 0;
    color: #24242a;
    font-size: 1.8rem;
    font-weight: 950;
  }

  p {
    margin: 8px 0 0;
    color: #475569;
    font-weight: 750;
  }
`;

const _ArchitectureGrid = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 32px;

  article {
    position: relative;
    background: #ffffff;
  }

  b {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #111827;
    color: #ffffff;
    font-size: 1.1rem;
  }

  strong {
    display: block;
    margin-top: 18px;
    color: #24242a;
    font-size: 1.2rem;
    font-weight: 950;
  }

  p {
    margin-top: 8px;
    color: #475569;
    font-size: 0.9rem;
    line-height: 1.65;
  }

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const _SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 48px;

  article {
    display: flex;
    align-items: center;
    gap: 16px;
    border: 1px solid #eef0f6;
    border-radius: 8px;
    background: #ffffff;
    padding: 20px;
    box-shadow: 0 14px 36px rgba(21, 27, 45, 0.05);
  }

  i {
    width: 48px;
    height: 48px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #ffffff;
    font-size: 1.15rem;
  }

  span {
    color: #475569;
    font-size: 0.86rem;
    font-weight: 850;
  }

  strong {
    display: block;
    margin-top: 4px;
    color: #24242a;
    font-size: 1.25rem;
    font-weight: 950;
  }

  p {
    margin: 4px 0 0;
    color: #475569;
    font-size: 0.86rem;
  }

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const _HighlightBlock = styled(motion.div)`
  margin-top: 48px;

  > div:first-child {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  p {
    margin: 0;
    color: #047857;
    font-size: 0.9rem;
    font-weight: 950;
  }

  h3 {
    margin: 8px 0 0;
    color: #24242a;
    font-size: 1.8rem;
    font-weight: 950;
  }
`;

const _SiteGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;

  article {
    border: 1px solid #e2e5ee;
    border-radius: 8px;
    background: #ffffff;
    padding: 24px;
    box-shadow: 0 18px 45px rgba(21, 27, 45, 0.05);
  }

  article > div:first-child {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  span {
    color: #1d4ed8;
    font-size: 0.85rem;
    font-weight: 950;
  }

  b {
    border-radius: 8px;
    background: #f0f4ff;
    padding: 8px 12px;
    color: #1d4ed8;
    font-size: 0.85rem;
  }

  h4 {
    margin: 8px 0 0;
    color: #24242a;
    font-size: 1.25rem;
    font-weight: 950;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 24px 0 0;
  }

  dl div {
    border-radius: 8px;
    background: #f7f8fb;
    padding: 16px;
  }

  dt {
    color: #475569;
    font-size: 0.75rem;
    font-weight: 800;
  }

  dd {
    margin: 4px 0 0;
    color: #24242a;
    font-size: 1.35rem;
    font-weight: 950;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
  }

  footer span {
    border: 1px solid #e2e5ee;
    border-radius: 8px;
    padding: 6px 10px;
    color: #334155;
    font-size: 0.75rem;
  }

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const BusinessSection = styled.section`
  background: #ffffff;
  padding: 80px 20px;
`;

const BusinessGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  margin-top: 48px;

  article {
    border: 1px solid #e2e5ee;
    border-radius: 8px;
    background: #ffffff;
    padding: 24px;
    box-shadow: 0 18px 45px rgba(21, 27, 45, 0.05);
  }

  i {
    width: 50px;
    height: 50px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #ffffff;
    font-size: 1.1rem;
  }

  h3 {
    margin: 20px 0 0;
    color: #24242a;
    font-size: 1.2rem;
    font-weight: 950;
  }

  p,
  small {
    display: block;
    color: #475569;
    line-height: 1.65;
  }

  p {
    margin: 12px 0 0;
    font-size: 0.92rem;
    font-weight: 750;
  }

  small {
    margin-top: 12px;
    font-size: 0.8rem;
    font-weight: 700;
  }

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const PipelinePanel = styled(motion.div)`
  margin-top: 48px;
  border: 1px solid #e2e5ee;
  border-radius: 8px;
  background: #f7f8fb;
  padding: 24px;

  > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  span {
    color: #c2410c;
    font-size: 0.9rem;
    font-weight: 950;
  }

  h3 {
    margin: 8px 0 0;
    color: #24242a;
    font-size: 1.6rem;
    font-weight: 950;
  }
`;

const PipelineGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-top: 24px;

  &[aria-label] {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  article {
    border: 1px solid #e4e8f2;
    border-radius: 8px;
    background: #ffffff;
    padding: 16px;
    text-align: center;
  }

  b {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #111827;
    color: #ffffff;
  }

  strong {
    display: block;
    margin-top: 12px;
    color: #333236;
    font-size: 0.85rem;
    font-weight: 950;
  }

  button {
    min-width: 0;
    border: 1px solid #e4e8f2;
    border-radius: 8px;
    background: #ffffff;
    padding: 16px;
    color: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.2s ease;
  }

  button:hover {
    border-color: #94a3b8;
    transform: translateY(-2px);
  }

  button:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.35);
    outline-offset: 2px;
  }

  button.is-selected {
    border-color: #2563eb;
    box-shadow: 0 12px 24px rgba(37, 99, 235, 0.16);
  }

  button b {
    background: #2563eb;
  }

  button span {
    display: block;
    margin-top: 10px;
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }

  @media (max-width: 820px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    &[aria-label] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }

    button:hover {
      transform: none;
    }
  }
`;

const BusinessStageDetail = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 0.72fr) minmax(0, 1.28fr);
  gap: 24px;
  margin-top: 16px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
  padding: 24px;
  animation: business-stage-detail-in 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both;

  @keyframes business-stage-detail-in {
    from {
      opacity: 0;
      transform: translateY(12px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  > div:first-child {
    align-self: start;
  }

  span {
    display: block;
    color: #2563eb;
    font-size: 0.78rem;
    font-weight: 950;
  }

  h4 {
    margin: 8px 0 0;
    color: #1e3a8a;
    font-size: 1.35rem;
    font-weight: 950;
  }

  p {
    margin: 0;
    color: #334155;
    font-size: 0.94rem;
    font-weight: 700;
    line-height: 1.7;
    word-break: keep-all;
  }

  strong {
    display: block;
    margin-top: 14px;
    color: #1d4ed8;
    font-size: 0.85rem;
    font-weight: 950;
  }

  strong::before {
    content: '결과 · ';
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const CeoDocumentHub = styled(motion.section)`
  margin-top: 36px;
`;

const CeoLeadershipAnalytics = styled.section`
  padding: 4px 0;
`;

const CeoDocumentTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  background: #eef2f7;
  padding: 8px;

  button {
    min-width: 0;
    min-height: 72px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 5px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    padding: 12px 18px;
    color: #64748b;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease,
      color 0.18s ease;
  }

  button:hover {
    color: #1d4ed8;
  }

  button[aria-selected='true'] {
    border-color: #d7e2f2;
    background: #ffffff;
    color: #172554;
    box-shadow: 0 8px 22px rgba(30, 64, 175, 0.1);
  }

  button:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.32);
    outline-offset: 2px;
  }

  small {
    color: #2563eb;
    font-size: 0.68rem;
    font-weight: 950;
    letter-spacing: 0.12em;
  }

  strong {
    font-size: 1rem;
    font-weight: 950;
  }

  @media (max-width: 620px) {
    gap: 5px;
    padding: 5px;

    button {
      min-height: 62px;
      align-items: center;
      padding: 10px 7px;
      text-align: center;
    }

    small {
      font-size: 0.59rem;
    }

    strong {
      font-size: 0.86rem;
    }
  }

  @media (max-width: 480px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    button {
      min-height: 58px;
      padding: 9px 10px;
    }

    strong {
      font-size: 0.9rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
`;

const CeoDocumentPanel = styled.div`
  margin-top: 16px;
  border: 1px solid #dfe6ef;
  border-radius: 16px;
  background: #f8fafc;
  padding: 28px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.06);

  &:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.28);
    outline-offset: 3px;
  }

  @media (max-width: 720px) {
    padding: 18px;
  }

  @media (max-width: 480px) {
    margin-right: -4px;
    margin-left: -4px;
    border-radius: 12px;
    padding: 14px;
  }
`;

const CeoDocumentIntro = styled.header`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 22px;

  span {
    color: #2563eb;
    font-size: 0.72rem;
    font-weight: 950;
    letter-spacing: 0.12em;
  }

  h3 {
    margin: 6px 0 0;
    color: #172033;
    font-size: 1.65rem;
    font-weight: 950;
    line-height: 1.2;
  }

  p {
    max-width: 460px;
    margin: 0;
    color: #64748b;
    font-size: 0.88rem;
    font-weight: 700;
    line-height: 1.65;
    text-align: right;
    word-break: keep-all;
  }

  @media (max-width: 720px) {
    display: block;

    p {
      margin-top: 10px;
      text-align: left;
    }
  }
`;

const CeoBrandGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;

  article {
    min-width: 0;
    overflow: hidden;
    border: 1px solid #dfe6ef;
    border-radius: 12px;
    background: #ffffff;
  }

  .brand-image {
    height: 190px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #071523;
  }

  .brand-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .brand-image--symbol {
    background:
      radial-gradient(circle at 50% 40%, rgba(34, 197, 94, 0.18), transparent 50%),
      #07130e;
  }

  .brand-image--symbol img {
    width: 112px;
    height: 112px;
  }

  .brand-image--cover img {
    object-fit: cover;
  }

  .brand-image--wide img {
    padding: 8px;
  }

  footer {
    padding: 18px;
  }

  footer small {
    color: #2563eb;
    font-size: 0.68rem;
    font-weight: 950;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h4 {
    margin: 7px 0 0;
    color: #172033;
    font-size: 1.16rem;
    font-weight: 950;
  }

  footer p {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.6;
    word-break: keep-all;
  }

  @media (max-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    article:last-child {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;

    article:last-child {
      grid-column: auto;
    }

    .brand-image {
      height: 176px;
    }
  }
`;

const CeoResumePaper = styled.article`
  display: grid;
  grid-template-columns: minmax(250px, 0.35fr) minmax(0, 0.65fr);
  overflow: hidden;
  border: 1px solid #d9e1ec;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const CeoResumeAside = styled.aside`
  background:
    linear-gradient(160deg, rgba(37, 99, 235, 0.18), transparent 48%),
    #0b1424;
  padding: 34px 30px;
  color: #ffffff;

  > img {
    display: block;
    width: 58px;
    height: 58px;
    margin-bottom: 28px;
    border-radius: 14px;
  }

  > span {
    color: #7db0ff;
    font-size: 0.7rem;
    font-weight: 950;
    letter-spacing: 0.14em;
  }

  > h3 {
    margin: 10px 0 0;
    font-size: 2rem;
    font-weight: 950;
    line-height: 1.18;
  }

  > p {
    margin: 16px 0 0;
    color: #c8d5e7;
    font-size: 0.88rem;
    font-weight: 700;
    line-height: 1.7;
    word-break: keep-all;
  }

  dl {
    display: grid;
    gap: 0;
    margin: 32px 0 0;
    border-top: 1px solid rgba(255, 255, 255, 0.14);
  }

  dl div {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 13px 0;
  }

  dt,
  dd {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.5;
  }

  dt {
    color: #7db0ff;
    font-weight: 900;
  }

  dd {
    color: #eef4ff;
    font-weight: 750;
  }

  @media (max-width: 820px) {
    > h3 br {
      display: none;
    }
  }

  @media (max-width: 560px) {
    padding: 26px 22px;
  }
`;

const CeoResumeBody = styled.div`
  display: grid;
  gap: 30px;
  padding: 34px;

  > section > header {
    display: flex;
    align-items: center;
    gap: 13px;
    margin-bottom: 16px;
  }

  > section > header > span {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #eaf1ff;
    color: #1d4ed8;
    font-size: 0.72rem;
    font-weight: 950;
  }

  header small {
    display: block;
    color: #2563eb;
    font-size: 0.62rem;
    font-weight: 950;
    letter-spacing: 0.12em;
  }

  h4 {
    margin: 3px 0 0;
    color: #172033;
    font-size: 1.15rem;
    font-weight: 950;
  }

  > section > p {
    margin: 0;
    color: #475569;
    font-size: 0.88rem;
    font-weight: 700;
    line-height: 1.75;
    word-break: keep-all;
  }

  @media (max-width: 560px) {
    gap: 26px;
    padding: 26px 22px;
  }
`;

const CeoResumeTimeline = styled.div`
  display: grid;
  gap: 0;

  article {
    display: grid;
    grid-template-columns: 94px minmax(0, 1fr);
    gap: 18px;
    padding: 15px 0;
    border-top: 1px solid #e7ebf1;
  }

  article:first-child {
    padding-top: 0;
    border-top: 0;
  }

  article > small {
    color: #2563eb;
    font-size: 0.72rem;
    font-weight: 950;
    line-height: 1.5;
  }

  h5 {
    margin: 0;
    color: #172033;
    font-size: 0.94rem;
    font-weight: 950;
  }

  strong {
    display: block;
    margin-top: 4px;
    color: #64748b;
    font-size: 0.74rem;
    font-weight: 850;
  }

  p {
    margin: 7px 0 0;
    color: #64748b;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.65;
    word-break: keep-all;
  }

  @media (max-width: 560px) {
    article {
      grid-template-columns: 1fr;
      gap: 5px;
    }
  }
`;

const CeoResumeSkills = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    border: 1px solid #cbdcfb;
    border-radius: 7px;
    background: #f3f7ff;
    padding: 8px 11px;
    color: #1e40af;
    font-size: 0.74rem;
    font-weight: 850;
  }
`;

const CeoIntroductionLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(240px, 0.72fr) minmax(0, 1.28fr);
  gap: 28px;
  align-items: start;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const CeoIntroductionLead = styled.header`
  position: sticky;
  top: 16px;
  border-radius: 12px;
  background:
    linear-gradient(145deg, rgba(37, 99, 235, 0.16), transparent 55%),
    #0b1424;
  padding: 28px;
  color: #ffffff;

  > span {
    color: #7db0ff;
    font-size: 0.68rem;
    font-weight: 950;
    letter-spacing: 0.14em;
  }

  h3 {
    margin: 10px 0 0;
    font-size: 1.7rem;
    font-weight: 950;
  }

  p {
    margin: 14px 0 0;
    color: #c8d5e7;
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.72;
    word-break: keep-all;
  }

  strong {
    display: block;
    margin-top: 22px;
    border-top: 1px solid rgba(255, 255, 255, 0.14);
    padding-top: 16px;
    color: #eaf2ff;
    font-size: 0.75rem;
    font-weight: 850;
  }

  @media (max-width: 860px) {
    position: static;
  }
`;

const CeoIntroductionAccordion = styled.div`
  display: grid;
  gap: 10px;

  article {
    overflow: hidden;
    border: 1px solid #dfe6ef;
    border-radius: 10px;
    background: #ffffff;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }

  article.is-open {
    border-color: #b9cff8;
    box-shadow: 0 12px 28px rgba(37, 99, 235, 0.08);
  }

  button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border: 0;
    background: transparent;
    padding: 18px 20px;
    color: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }

  button:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.3);
    outline-offset: -3px;
  }

  button > span {
    min-width: 0;
  }

  button small {
    display: block;
    color: #2563eb;
    font-size: 0.62rem;
    font-weight: 950;
    letter-spacing: 0.1em;
  }

  button strong {
    display: block;
    margin-top: 5px;
    color: #172033;
    font-size: 1rem;
    font-weight: 950;
  }

  button em {
    display: block;
    margin-top: 6px;
    color: #64748b;
    font-size: 0.78rem;
    font-style: normal;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }

  button i {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #edf3ff;
    color: #1d4ed8;
    transition: transform 0.18s ease;
  }

  article.is-open button i {
    transform: rotate(180deg);
  }

  article > div {
    overflow: hidden;
  }

  article > div p {
    margin: 0;
    border-top: 1px solid #edf0f5;
    padding: 17px 20px 20px;
    color: #475569;
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.75;
    word-break: keep-all;
  }

  @media (max-width: 560px) {
    button {
      padding: 16px;
    }

    article > div p {
      padding: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    article,
    button i {
      transition: none;
    }
  }
`;


const _ImpactSection = styled.section`
  background: #111827;
  padding: 80px 20px;
  color: #ffffff;
`;

const _ImpactLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.1fr);
  gap: 40px;
  align-items: center;

  > div:first-child p {
    margin: 0;
    color: #73a4ff;
    font-size: 1rem;
    font-weight: 950;
  }

  h2 {
    margin: 16px 0 0;
    font-size: 3rem;
    font-weight: 950;
    line-height: 1.18;
    word-break: keep-all;
  }

  span {
    display: block;
    margin-top: 24px;
    color: #c7d0df;
    font-size: 1.05rem;
    line-height: 1.75;
    word-break: keep-all;
  }

  @media (max-width: 960px) {
    grid-template-columns: 1fr;

    h2 {
      font-size: 2.15rem;
    }
  }
`;

const _ImpactCardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;

  article {
    border: 1px solid #273244;
    border-radius: 8px;
    background: #182133;
    padding: 24px;
  }

  i {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #4f7cff;
    color: #ffffff;
  }

  h3 {
    margin: 24px 0 0;
    font-size: 1.2rem;
    font-weight: 950;
  }

  p {
    margin: 16px 0 0;
    color: #c7d0df;
    font-size: 0.9rem;
    line-height: 1.7;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const _ImpactMetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 48px;

  article {
    border: 1px solid #273244;
    border-radius: 8px;
    background: #182133;
    padding: 24px;
  }

  span {
    color: #9bbcff;
    font-size: 0.9rem;
    font-weight: 950;
  }

  strong {
    display: block;
    margin-top: 12px;
    font-size: 2rem;
    font-weight: 950;
  }

  p {
    margin: 12px 0 0;
    color: #c7d0df;
    font-size: 0.9rem;
    line-height: 1.6;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const _FinalCta = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 48px;
  border: 1px solid #273244;
  border-radius: 8px;
  background: #182133;
  padding: 28px;

  div {
    display: grid;
    gap: 6px;
  }

  strong {
    font-size: 1.6rem;
    font-weight: 950;
  }

  span {
    color: #c7d0df;
    font-size: 0.9rem;
    font-weight: 750;
  }

  button {
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 0;
    border-radius: 8px;
    background: #ffffff;
    padding: 0 20px;
    color: #24242a;
    font-size: 0.9rem;
    font-weight: 950;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid #9bbcff;
      outline-offset: 2px;
    }
  }

  @media (max-width: 640px) {
    align-items: stretch;
    flex-direction: column;
  }
`;
