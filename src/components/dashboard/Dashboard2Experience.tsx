'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faChevronDown,
} from '@fortawesome/free-solid-svg-icons';
import styled from 'styled-components';
import { BarChart3, PieChart, Scale } from 'lucide-react';
import FounderStory from '@/components/corp/FounderStory';
import CeoGreeting from '@/components/corp/CeoGreeting';
import { ceoCharacterStages } from '@/components/corp/ceoCharacterStages';
import { getDashboardStyleCorpVariant } from '@/constants/dashboardStyleCorpRoutes';

const CompanyHistoryExperience = dynamic(
  () => import('@/components/corp/CompanyHistoryExperience').then((module) => module.CompanyHistoryExperience),
  { loading: () => <DeferredCorpSection /> },
);
const CompanyTechnologyOverview = dynamic(
  () => import('@/components/corp/CompanyTechnologyOverview'),
  { loading: () => <DeferredCorpSection /> },
);

function DeferredCorpSection() {
  return (
    <section
      role="status"
      aria-live="polite"
      style={{ minHeight: 240, display: 'grid', placeItems: 'center', padding: 24, color: '#64748b' }}
    >
      회사 콘텐츠를 준비하는 중입니다…
    </section>
  );
}

type Dashboard2ExperienceVariant = 'introduction' | 'ceo';
type CeoDocumentTab = 'greeting' | 'resume' | 'introduction' | 'analysis';

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
  detail: React.ReactNode;
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

type CeoDocumentTabOption = {
  id: CeoDocumentTab;
  label: string;
  eyebrow: string;
};

interface Dashboard2ExperienceProps {
  variant?: Dashboard2ExperienceVariant;
  enableBrandStory?: boolean;
  includeCompanyHistory?: boolean;
  showIntroductionHero?: boolean;
  showTechnologyOverview?: boolean;
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
    imageUrl: '/images/corp/technology/reseller-partner-stack.webp',
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

const ceoHeroStats: NumberMetric[] = [
  { label: '대표 상세 소개서', value: 3, unit: '가지' },
  { label: '판단 루프', value: 4, unit: '단계' },
  { label: '현장 기준', value: 100, unit: '%' },
];

const ceoHeroAccordionItems: CeoHeroAccordionItem[] = [
  {
    eyebrow: '01 / Physical',
    title: '신체정보',
    summary: '2m에는 조금 못 미치는, 존재감은 대형급',
    detail: (
      <>
        <dl className="resume-facts">
          <div><dt>키</dt><dd><b>176<span> cm</span></b><small>2m 조금 안 됨. ‘조금’의 기준은 본인 마음.</small></dd></div>
          <div><dt>몸무게</dt><dd><b>MAX 0.15<span> ton</span></b><small>최대 150kg. 존재감도 묵직하게.</small></dd></div>
          <div><dt>혈액형</dt><dd><b>B<span>형</span></b><small>혈액형은 한 글자, 설명할 이야기는 장편.</small></dd></div>
          <div><dt>BMI · 비만지수</dt><dd><b className="resume-text-value">초고도비만</b><small>본인 소개: 지방도 많지만 골격과 근육량도 많음.</small></dd></div>
        </dl>
        <p className="resume-aside">“숨 좀 깊게 쉬면 10kg은 쉽게 왔다 갔다함.”<span>— 체중계와 협상 중인 그뚠이의 농담</span></p>
        <ul className="resume-tags" aria-label="신체 특징"><li>고기 위주 식습관</li><li>큰 골격 · 많은 근육량</li><li>큰 얼굴 · 확실한 존재감</li></ul>
      </>
    ),
  },
  {
    eyebrow: '02 / Personality',
    title: '성격정보',
    summary: '덩치는 묵직하게, 도망은 민첩하게',
    detail: (
      <>
        <div className="resume-quotes">
          <p><span>생존 본능</span><b>뚠뚠하지만 비겁해서<br />도망이 빠르다.</b><small>몸은 중량급, 위기 감지 후 퇴장은 경량급.</small></p>
          <p><span>본인 피셜 · 성격 어록</span><b>강자에게 지랄하고,<br />약자에게 더 지랄하고.</b><small>입담에는 브레이크가 없는 편.</small></p>
        </div>
        <ol className="resume-principles" aria-label="그뚠이의 업무 삼박자">
          <li><span>계획은</span><b>장엄하게</b></li>
          <li><span>설계는</span><b>디테일하게</b></li>
          <li><span>실행은</span><b>느긋하게</b></li>
        </ol>
        <p className="resume-footnote">머릿속에는 이미 대하드라마. 실행 버튼은 여유롭게 누르는 중.</p>
      </>
    ),
  },
  {
    eyebrow: '03 / Education',
    title: '학력정보',
    summary: '초등학교 졸업 → 중학교 5곳 → 검정고시',
    detail: (
      <>
        <ol className="resume-journey">
          <li><span>첫 번째 졸업장</span><b>초등학교 졸업</b><p>배움의 첫 코스, 정상 완주.</p></li>
          <li><span>학교생활 순회 편</span><b>중학교 5곳 전학</b><p>교실은 바뀌고, 자기소개 경험치는 쌓이고.</p></li>
          <li><span>최종학력</span><b>검정고시 졸업</b><p>정해진 길을 조금 돌아, 나만의 방식으로 마침표.</p></li>
        </ol>
        <p className="resume-footnote">학교 이름보다 전학 에피소드가 더 긴 이력서.</p>
      </>
    ),
  },
  {
    eyebrow: '04 / Career',
    title: '경력정보',
    summary: '삽부터 키보드까지, 직업 장르를 넘나든 경력',
    detail: (
      <>
        <ul className="resume-careers">
          <li><b>건설 일용직</b><span>현장에서 시작한 실전 튜토리얼.</span></li>
          <li><b>택배 · 배달 · 대리운전</b><span>물건도, 음식도, 사람도 목적지까지.</span></li>
          <li><b>사행성 오락실 운영</b><span>이력서에서 빼지 않은 인생의 한 챕터.</span></li>
          <li><b>광고회사 부장</b><span>이번에는 사람의 시선을 움직이는 일.</span></li>
          <li><b>휴대폰 TM 사무실 운영</b><span>전화기 너머의 세상과 영업 중.</span></li>
          <li><b>직업소개소 소장</b><span>일을 하다가, 사람과 일을 연결하는 쪽으로.</span></li>
          <li><b>건설 시공 운영</b><span>다시 현장으로. 이번에는 운영까지.</span></li>
        </ul>
        <div className="resume-current"><span>현재 하는 일</span><b>외주개발 프리랜서 PM</b><p>현장에서 쌓은 이야기를, 이제 프로젝트로 풀어가는 중.</p></div>
      </>
    ),
  },
  {
    eyebrow: '05 / Skills',
    title: '기술정보',
    summary: '핸들도 잡고, 프로젝트 방향도 잡고',
    detail: (
      <>
        <p className="resume-label">보유 운전면허</p>
        <ul className="resume-licenses">
          <li><b>1종 대형</b><span>큰 차 담당</span></li>
          <li><b>1종 보통</b><span>일상의 기동력</span></li>
          <li><b>2종 소형</b><span>두 바퀴까지</span></li>
        </ul>
        <dl className="resume-skills">
          <div><dt>프로젝트 운영</dt><dd>외주개발 PM · 현장 요구 파악 · 업무 조율</dd></div>
          <div><dt>디지털 실무</dt><dd>AI 서비스 기획 · 웹·앱 구축 · 업무 자동화 · 콘텐츠 제작</dd></div>
          <div><dt>현장 실무</dt><dd>건설 시공 운영 · 영업 · 사무실 운영 · 인력 연결</dd></div>
        </dl>
        <p className="resume-footnote">운전면허는 종류별로, 실무 경험은 장르별로. 기타 생존 기술은 현장에서 업데이트.</p>
      </>
    ),
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

const ceoDocumentTabs: CeoDocumentTabOption[] = [
  { id: 'greeting', label: '대표인사말', eyebrow: 'GREETING' },
  { id: 'resume', label: '대표이력서', eyebrow: 'RESUME' },
  { id: 'introduction', label: '창업배경', eyebrow: 'STORY' },
  { id: 'analysis', label: '대표통계', eyebrow: 'ANALYSIS' },
];

const companyBrandCollection = [
  {
    name: 'CYENG 청연 ERP',
    category: 'ERP Brand',
    description: '현장과 사무실의 업무를 연결하고 일상의 운영을 체계적으로 관리하는 ERP 브랜드입니다.',
    imageUrl: '/images/corp/brands/cyeng-erp.png',
    imageAlt: '은색과 파란색 CY 심볼의 CYENG 청연 ERP 로고',
    imageWidth: 1254,
    imageHeight: 1254,
    imageStyle: 'erp',
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
    name: '그뚠스토리',
    category: 'Webtoon Brand',
    description: '작은 목표에서 시작한 창업과 일상, 그 뒤의 솔직한 이야기를 웹툰으로 전하는 브랜드입니다.',
    imageUrl: '/images/corp/founder-story/geuttun-story-brand.png',
    imageAlt: '곱슬머리 웹툰 주인공과 붓글씨로 표현한 그뚠스토리 브랜드 이미지',
    imageWidth: 1254,
    imageHeight: 1254,
    imageStyle: 'story',
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
  includeCompanyHistory = false,
  showIntroductionHero = true,
  showTechnologyOverview = true,
}: Dashboard2ExperienceProps = {}) {
  const pathname = usePathname();
  const routeVariant = getDashboardStyleCorpVariant(pathname);
  const resolvedVariant = routeVariant ?? variant ?? 'introduction';
  const pageRef = useRef<HTMLElement | null>(null);
  const nextBrandStoryImageRef = useRef<HTMLImageElement | null>(null);
  const nextCeoProfileImageRef = useRef<HTMLImageElement | null>(null);
  const shouldReduceMotion = true;
  const [brandStorySlideIndex, setBrandStorySlideIndex] = useState(0);
  const [selectedOperatingState, setSelectedOperatingState] = useState({ variant: resolvedVariant, index: -1 });
  const [openCeoHeroAccordionState, setOpenCeoHeroAccordionState] = useState({ variant: resolvedVariant, index: 0 });
  const [activeCeoProfileIndex, setActiveCeoProfileIndex] = useState(0);
  const [failedCeoProfileImages, setFailedCeoProfileImages] = useState<Record<string, boolean>>({});
  const [activeCeoDocumentTab, setActiveCeoDocumentTab] = useState<CeoDocumentTab>('greeting');
  const barInView = true;
  const isCeoVariant = resolvedVariant === 'ceo';
  const isBrandStoryActive = enableBrandStory && !isCeoVariant;
  const shouldRenderIntroductionHero = isCeoVariant || showIntroductionHero;
  const activeCeoProfile = ceoHeroProfiles[activeCeoProfileIndex] ?? ceoHeroProfiles[0]!;
  const activeBrandStorySlide =
    introductionHeroSlides[brandStorySlideIndex] ?? introductionHeroSlides[0]!;
  const selectedOperatingIndex = selectedOperatingState.variant === resolvedVariant
    ? selectedOperatingState.index : -1;
  const openCeoHeroAccordionIndex =
    openCeoHeroAccordionState.variant === resolvedVariant ? openCeoHeroAccordionState.index : 0;
  const activeHeroStats = isCeoVariant
    ? activeCeoProfile.stats
    : isBrandStoryActive
      ? activeBrandStorySlide.stats
      : heroStats;
  const activeOperatingHighlights = isCeoVariant ? ceoOperatingHighlights : operatingHighlights;
  const activeOperatingPanels = isCeoVariant ? ceoOperatingPanels : operatingPanels;
  const selectedPanel = activeOperatingPanels[selectedOperatingIndex] ?? activeOperatingPanels[0];
  const selectedPieSegments = getPieDonutSegments(selectedPanel.pieData);
  const activeCeoMedia = activeCeoProfile.media;
  const ceoPhotoFallback = isCeoVariant && failedCeoProfileImages[activeCeoProfile.id]
    ? ceoCharacterStages[activeCeoProfileIndex] ?? ceoCharacterStages[0]
    : null;
  const activeCeoVideo = isCeoVariant && activeCeoMedia.type === 'youtube' ? activeCeoMedia : null;
  const heroImageSrc = isCeoVariant
    ? activeCeoMedia.type === 'image'
      ? ceoPhotoFallback?.src ?? activeCeoMedia.url
      : heroImageUrl
    : isBrandStoryActive
      ? activeBrandStorySlide.imageUrl
      : heroImageUrl;
  const heroImageAlt = isCeoVariant
    ? activeCeoMedia.type === 'image'
      ? ceoPhotoFallback ? `그뚠이 대표 캐릭터 — ${ceoPhotoFallback.alt}` : activeCeoMedia.alt
      : ''
    : isBrandStoryActive
      ? activeBrandStorySlide.imageAlt
      : '청연ENG ERP 대시보드 비주얼';
  const heroImageFit = isCeoVariant
    ? ceoPhotoFallback ? 'contain' : 'cover'
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

  const handleOperatingSelection = (index: number, fromFooter = false) => {
    setSelectedOperatingState({
      variant: resolvedVariant,
      index: selectedOperatingIndex === index ? -1 : index,
    });
    if (fromFooter) {
      window.requestAnimationFrame(() => {
        const trigger = document.getElementById(`dashboard2-operating-trigger-${activeOperatingHighlights[index]?.metric.toLowerCase()}`);
        trigger?.focus({ preventScroll: true });
        trigger?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      });
    }
  };

  const operatingContent = (
    <OperatingInner>
      <OperatingCopy variants={revealVariant}>
        <p>{isCeoVariant ? 'CEO LEADERSHIP' : 'COMPANY STATISTICS'}</p>
        <h2>{isCeoVariant ? '대표통계' : '회사통계'}</h2>
        <span>
          {isCeoVariant
            ? '원칙 정렬, 현장 판단, 책임 확장. 아래 버튼을 눌러 각 지표를 펼쳐보세요.'
            : '사업 포트폴리오, 실행 파이프라인, 품질 균형. 아래 버튼을 눌러 회사의 주요 지표를 펼쳐보세요.'}
        </span>
      </OperatingCopy>

      <OperatingAccordion role="group" aria-label={isCeoVariant ? '대표통계 항목 선택' : '회사통계 항목 선택'}>
        {activeOperatingHighlights.map((item, index) => {
          const isSelected = selectedOperatingIndex === index;
          const triggerId = `dashboard2-operating-trigger-${item.metric.toLowerCase()}`;
          const StatIcon = (isCeoVariant ? [BarChart3, PieChart, Scale] : [PieChart, BarChart3, Scale])[index] ?? BarChart3;

          return (
            <OperatingAccordionTrigger
              key={item.title}
              id={triggerId}
              type="button"
              data-dashboard-operating-tab={item.metric.toLowerCase()}
              aria-expanded={isSelected}
              aria-controls="dashboard2-operating-panel"
              onClick={() => handleOperatingSelection(index)}
              className={isSelected ? 'is-selected' : undefined}
            >
                  <small className="stat-number">0{index + 1} · {item.metric}</small>
                  <span className="stat-icon" aria-hidden="true"><span><StatIcon size={32} strokeWidth={1.7} /></span></span>
                  <strong className="stat-label">{item.eyebrow}</strong>
                  <em className="stat-title">{isCeoVariant ? activeOperatingPanels[index].title : item.title}</em>
                  <i className="stat-action">{isSelected ? '접기' : '펼쳐 보기'}<FontAwesomeIcon icon={faChevronDown} aria-hidden="true" /></i>
            </OperatingAccordionTrigger>
          );
        })}
      </OperatingAccordion>

      <ChartPanel
        key={`${resolvedVariant}-stat-${selectedOperatingIndex}`}
        id="dashboard2-operating-panel"
        hidden={selectedOperatingIndex < 0}
        role="region"
        aria-labelledby={`dashboard2-operating-trigger-${(activeOperatingHighlights[selectedOperatingIndex] ?? activeOperatingHighlights[0]).metric.toLowerCase()}`}
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
        {selectedOperatingIndex >= 0 ? (
          <div className="ceo-stat-footer">
            <p><strong>{activeOperatingHighlights[selectedOperatingIndex].helper}</strong>{activeOperatingHighlights[selectedOperatingIndex].desc}</p>
            <button type="button" className="ceo-stat-close" onClick={() => handleOperatingSelection(selectedOperatingIndex, true)}>이 통계 접기</button>
          </div>
        ) : null}
      </ChartPanel>
    </OperatingInner>
  );


  const introductionHero = shouldRenderIntroductionHero ? (
      <HeroSection id="dashboard2-intro" $isCeo={isCeoVariant} aria-label={isCeoVariant ? '대표이력서 상세' : undefined}>
        {!isCeoVariant ? <><HeroGrid aria-hidden="true" /><HeroWash aria-hidden="true" /></> : null}
        <HeroInner $isCeo={isCeoVariant}>
          <motion.div
            className={isCeoVariant ? 'ceo-hero-photo' : undefined}
            initial={shouldReduceMotion ? false : { opacity: 0, x: -40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, delay: 0.1 }}
          >
            <HeroImageCard $isPortrait={isCeoVariant}>
              {!isCeoVariant ? <HeroImageGlow aria-hidden="true" /> : null}
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
                    onError={() => {
                      if (isCeoVariant && activeCeoMedia.type === 'image' && !ceoPhotoFallback) {
                        setFailedCeoProfileImages((current) => ({ ...current, [activeCeoProfile.id]: true }));
                      }
                    }}
                    width={isBrandStoryActive ? activeBrandStorySlide.imageWidth : 1024}
                    height={isBrandStoryActive ? activeBrandStorySlide.imageHeight : 1280}
                    style={{ objectFit: heroImageFit, objectPosition: heroImagePosition }}
                    decoding="async"
                    loading="eager"
                    fetchPriority="high"
                  />
                  {isCeoVariant ? <span className="ceo-profile-caption" aria-hidden="true">사진을 누르면 다음 소개를 볼 수 있어요.</span> : <HeroStoryCue aria-hidden="true">
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
                  </HeroStoryCue>}
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
            <CeoHeroAccordionColumn className="ceo-hero-copy" aria-label="대표 이력 정보">
              <CeoHeroAccordionList className="ceo-hero-accordion">
                {ceoHeroAccordionItems.map((item, index) => {
                  const isOpen = openCeoHeroAccordionIndex === index;
                  const panelId = `ceo-hero-accordion-${index}`;

                  return (
                    <article key={item.title} className={isOpen ? 'is-open' : undefined}>
                      <button
                        type="button"
                        id={`ceo-resume-heading-${index}`}
                        data-ceo-hero-accordion-trigger={index}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => setOpenCeoHeroAccordionState({ variant: resolvedVariant, index: isOpen ? -1 : index })}
                      >
                        <span className="resume-heading">
                          <span className="resume-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                          <span>
                            <small>{item.eyebrow.split(' / ')[1].toUpperCase()}</small>
                            <strong>{item.title}</strong>
                            <em>{item.summary}</em>
                          </span>
                        </span>
                        <i className={isOpen ? 'is-open' : undefined}>
                          <FontAwesomeIcon icon={faChevronDown} />
                        </i>
                      </button>
                      <div id={panelId} role="region" aria-labelledby={`ceo-resume-heading-${index}`} aria-hidden={!isOpen} className={isOpen ? 'is-open' : undefined}>
                        <div className="resume-detail">{item.detail}</div>
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
                  <HeroActionLink href="/corp/company/product-introduction#product-business-panorama">
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
  ) : null;

  return (
    <PageShell
      ref={pageRef}
      id="content-area"
      aria-labelledby={isCeoVariant ? 'ceo-document-title' : shouldRenderIntroductionHero ? 'dashboard2-title' : undefined}
      aria-label={shouldRenderIntroductionHero ? undefined : '회사소개'}
      $squareSections={isBrandStoryActive}
    >
      {!isCeoVariant && !isBrandStoryActive && showIntroductionHero ? (
        <TopNotice>SIMPLYPIG의 AI 기술과 실행 역량을 기존 대시보드 스타일 안에 구성했습니다.</TopNotice>
      ) : null}

      {isCeoVariant ? (
        <BusinessSection id="ceo-document-section" aria-labelledby="ceo-document-title">
        <SectionInner initial={shouldReduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.18 }} variants={staggerVariant}>
          <SectionHeading>
            <motion.p variants={revealVariant}>CEO PROFILE</motion.p>
            <motion.h1 id="ceo-document-title" variants={revealVariant}>대표소개서</motion.h1>
            <motion.span variants={revealVariant}>
              방문자에게는 대표의 방향을, 구성원에게는 판단 기준을, 파트너에게는 신뢰의 근거를 보여줍니다.
            </motion.span>
          </SectionHeading>

          <CeoDocumentHub variants={revealVariant}>
            <CeoDocumentTabs role="tablist" aria-label="대표소개서 탭 선택">
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
              {activeCeoDocumentTab === 'greeting' ? <CeoGreeting /> : null}

              {activeCeoDocumentTab === 'resume' ? introductionHero : null}

              {activeCeoDocumentTab === 'introduction' ? <FounderStory /> : null}

              {activeCeoDocumentTab === 'analysis' ? (
                <StatisticsPresentation>
                  {operatingContent}
                </StatisticsPresentation>
              ) : null}
            </CeoDocumentPanel>
          </CeoDocumentHub>
        </SectionInner>
        </BusinessSection>
      ) : null}

      {!isCeoVariant ? introductionHero : null}

      {!isCeoVariant ? (
        <BusinessSection id="company-brands" aria-label="회사 브랜드">
          <SectionInner>
                  <CompanyBrandIntro>
                    <div>
                      <span>BRAND PORTFOLIO</span>
                      <h3>기술과 일상을 연결하는 브랜드</h3>
                    </div>
                    <p>업무를 연결하는 ERP, 일상을 돕는 제품, 경험을 전하는 웹툰. 서로 다른 브랜드가 SIMPLYPIG의 방향을 함께 만들어갑니다.</p>
                  </CompanyBrandIntro>

                  <CompanyBrandGrid>
                    {companyBrandCollection.map((brand) => (
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
                  </CompanyBrandGrid>
          </SectionInner>
        </BusinessSection>
      ) : null}

      {!isCeoVariant && showTechnologyOverview ? <CompanyTechnologyOverview /> : null}


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
          <StatisticsPresentation as="div" data-company-statistics>
            {operatingContent}
          </StatisticsPresentation>
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
              <CompanySecondaryAction href="/corp/company/product-introduction#company-introduction-execution">
                실행 방식 다시 보기
              </CompanySecondaryAction>
            </CompanyNextStepActions>
          </CompanyNextStepInner>
        </CompanyNextStepSection>
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
  font-family: 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif;
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
  background: ${({ $isCeo }) => ($isCeo ? 'transparent' : '#f8fafc')};
  color: #111827;
  padding: ${({ $isCeo }) => ($isCeo ? '24px 4px' : '64px 20px 80px')};

  @media (max-width: 640px) {
    padding: ${({ $isCeo }) => ($isCeo ? '10px 0' : '48px 20px 56px')};
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

  > .ceo-hero-photo {
    grid-column: 1;
    grid-row: 1;
    align-self: start;
    order: 2;
  }

  > .ceo-hero-copy > .ceo-hero-accordion {
    grid-column: 2;
    grid-row: 1;
    align-self: start;
    margin-top: 0;
    order: 3;
  }

  h1, .ceo-hero-title {
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

    h1, .ceo-hero-title {
      font-size: 3.15rem;
    }
  }

  @media (max-width: 640px) {
    h1, .ceo-hero-title {
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
    box-shadow: ${(props) => (props.$isPortrait ? 'none' : '0 32px 90px rgba(15, 23, 42, 0.18)')};
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

  .ceo-profile-caption { display: block; margin-top: 12px; color: #64748b; font-size: 12px; line-height: 1.7; text-align: left; }

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

  h1, .ceo-hero-title {
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
    h1, .ceo-hero-title {
      font-size: 2.55rem;
    }
  }

  @media (max-width: 640px) {
    h1, .ceo-hero-title {
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
  gap: 0;
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid #d9e1ec;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);

  .resume-heading { display: flex; align-items: center; gap: 13px; min-width: 0; }
  .resume-number { width: 36px; height: 36px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: #eaf1ff; color: #1d4ed8; font-size: 0.72rem; font-weight: 950; }


  article {
    overflow: hidden;
    border: 0;
    border-bottom: 1px solid #e7ebf1;
    border-radius: 0;
    background: #ffffff;
    box-shadow: none;
    transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  }

  article:last-child { border-bottom: 0; }

  article.is-open { background: #f8faff; }

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
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    font-weight: 950;
  }

  strong {
    display: block;
    margin-top: 5px;
    color: #111827;
    font-size: 1.15rem;
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

  article > div > .resume-detail {
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

  article > div.is-open > .resume-detail {
    padding: 14px 16px 16px;
  }

  .resume-detail p { margin: 0; font-size: 0.88rem; line-height: 1.75; font-weight: 500; }
  .resume-detail b { font-weight: 850; }
  .resume-detail small { margin-top: 5px; color: #475569; font-size: 0.78rem; font-weight: 500; letter-spacing: 0; line-height: 1.65; }
  .resume-detail ul, .resume-detail ol { margin: 0; padding: 0; list-style: none; }
  .resume-detail dl, .resume-detail dd { margin: 0; }
  .resume-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 24px; }
  .resume-facts dt { margin-bottom: 5px; color: #475569; font-size: 0.75rem; }
  .resume-facts dd > b { display: block; color: #163d83; font-size: 1.65rem; line-height: 1.3; font-variant-numeric: tabular-nums; }
  .resume-facts dd > b > span { font-size: 0.9rem; }
  .resume-facts dd > b.resume-text-value { font-size: 1.2rem; }
  .resume-detail .resume-aside { margin-top: 22px; padding: 12px 0 12px 14px; border-left: 3px solid #2563eb; color: #1e3a5f; font-weight: 700; }
  .resume-aside > span { display: block; margin-top: 3px; color: #64748b; font-size: 0.74rem; font-weight: 500; }
  .resume-detail .resume-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
  .resume-tags li { padding: 4px 8px; border-radius: 4px; background: #e8eef8; color: #334155; font-size: 0.72rem; }
  .resume-quotes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
  .resume-quotes p > span, .resume-current > span, .resume-journey li > span { display: block; margin-bottom: 6px; color: #1d4ed8; font-size: 0.73rem; font-weight: 750; }
  .resume-quotes b { display: block; color: #182d4c; font-size: 1.07rem; line-height: 1.7; }
  .resume-detail .resume-principles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 24px; padding-top: 18px; border-top: 1px solid #d9e1ec; }
  .resume-principles span { display: block; color: #475569; font-size: 0.78rem; }
  .resume-principles b { display: block; margin-top: 5px; color: #163d83; font-size: 1.07rem; }
  .resume-detail .resume-footnote { margin-top: 18px; color: #52627a; font-size: 0.78rem; }
  .resume-journey { display: grid; gap: 20px; }
  .resume-journey li { position: relative; padding-left: 20px; border-left: 2px solid #cedaf0; }
  .resume-journey li::before { position: absolute; top: 5px; left: -5px; width: 8px; height: 8px; border-radius: 50%; background: #2563eb; content: ''; }
  .resume-journey b { display: block; color: #182d4c; font-size: 1.05rem; }
  .resume-journey li p { margin-top: 4px; }
  .resume-careers li { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid #e1e7f0; }
  .resume-careers li:first-child { padding-top: 0; }
  .resume-careers b { color: #182d4c; font-size: 0.87rem; }
  .resume-careers li > span { color: #52627a; font-size: 0.8rem; }
  .resume-current { margin-top: 18px; padding-left: 14px; border-left: 3px solid #2563eb; }
  .resume-current > b { display: block; color: #163d83; font-size: 1.15rem; }
  .resume-current p { margin-top: 5px; }
  .resume-detail .resume-label { margin-bottom: 10px; color: #475569; font-size: 0.76rem; font-weight: 750; }
  .resume-licenses { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .resume-licenses li { padding: 12px 8px; border: 1px solid #d3dded; border-radius: 6px; background: #fff; text-align: center; }
  .resume-licenses b { display: block; color: #163d83; font-size: 0.95rem; }
  .resume-licenses span { display: block; margin-top: 4px; color: #52627a; font-size: 0.72rem; }
  .resume-detail .resume-skills { display: grid; gap: 12px; margin-top: 20px; }
  .resume-skills dt { color: #182d4c; font-size: 0.83rem; font-weight: 800; }
  .resume-skills dd { margin-top: 3px; color: #52627a; font-size: 0.82rem; }

  @media (prefers-reduced-motion: reduce) {
    article, i, article > div, article > div > .resume-detail { transition: none; }
  }

  @media (max-width: 640px) {
    .resume-facts { gap: 18px 14px; }
    .resume-facts dd > b { font-size: 1.4rem; }
    .resume-quotes { grid-template-columns: 1fr; gap: 18px; }
    .resume-careers li { grid-template-columns: 1fr; gap: 2px; }
    .resume-principles b { font-size: 0.93rem; }
    .resume-licenses b { font-size: 0.85rem; }

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
  gap: 14px;
  align-items: stretch;
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

const OperatingAccordion = styled.div`
  display: grid;
  gap: 10px;
`;

const OperatingAccordionTrigger = styled.button`
  width: 100%;
  min-width: 0;
  border: 1px solid #e2e5ee;
  border-radius: 8px;
  background: #ffffff;
  padding: 20px 22px;
  color: #24242a;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 12px 30px rgba(21, 27, 45, 0.04);
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;

  > span {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  > span > span {
    min-width: 0;
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
    line-height: 1.3;
    word-break: keep-all;
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

  em,
  i {
    font-style: normal;
  }

  em {
    display: block;
    margin-top: 12px;
    color: #475569;
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.65;
    word-break: keep-all;
  }

  i {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-top: 14px;
    color: #1d4ed8;
    font-size: 0.78rem;
    font-weight: 950;
  }

  i svg {
    flex: 0 0 auto;
    transition: transform 0.18s ease;
  }

  &:hover {
    border-color: #cbd7ff;
    background: #fbfcff;
  }

  &:focus-visible {
    outline: 3px solid rgba(79, 124, 255, 0.42);
    outline-offset: 2px;
  }

  &.is-selected {
    border-color: #4f7cff;
    background: #f0f4ff;
    box-shadow: 0 16px 36px rgba(79, 124, 255, 0.14);
  }

  &.is-selected b {
    background: #1d4ed8;
  }

  &.is-selected i svg {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    i svg {
      transition: none;
    }
  }

  @media (max-width: 560px) {
    padding: 18px;
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

  h1, h2 {
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
    h1, h2 {
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


const CeoDocumentHub = styled(motion.section)`
  margin-top: 36px;
`;

const StatisticsPresentation = styled.section`
  padding: 4px 0;
  overflow-anchor: none;

  ${OperatingCopy} {
    padding: 20px 0 8px;
    border: 0;
    background: transparent;
    box-shadow: none;
    h2 { font-size: 32px; line-height: 1.35; }
    > span { margin-top: 14px; font-size: 15px; font-weight: 400; }
  }

  ${OperatingAccordion} {
    grid-template-columns: repeat(3, minmax(144px, 1fr));
    gap: 12px;
    overflow-x: auto;
    padding: 10px 3px 14px;
    scrollbar-width: thin;
    scrollbar-color: #b9c9e4 transparent;
  }

  &[data-company-statistics] ${OperatingAccordion} {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: visible;
  }

  ${OperatingAccordionTrigger} {
    display: grid;
    grid-template-rows: auto 64px auto 1fr auto;
    justify-items: center;
    gap: 10px;
    padding: 18px 12px;
    border-radius: 14px;
    text-align: center;
    box-shadow: none;
    scroll-margin: 88px 8px 20px;

    .stat-number { color: #64748b; font-size: 12px; font-weight: 750; }
    .stat-icon { display: grid; place-items: center; justify-content: center; gap: 0; width: 64px; height: 64px; border-radius: 18px; background: #edf3ff; color: #2563eb; transition: transform 240ms ease; }
    .stat-icon > span { display: grid; place-items: center; }
    .stat-label { margin: 0; font-size: 17px; line-height: 1.5; }
    .stat-title { margin: 0; font-size: 13px; line-height: 1.6; font-weight: 400; color: #64748b; }
    .stat-action { justify-content: center; gap: 6px; margin: 4px 0 0; font-size: 12px; font-weight: 650; }
    .stat-action svg { width: 14px; height: 14px; }

    &.is-selected { border-color: #2563eb; background: #edf3ff; box-shadow: none; }
    &.is-selected .stat-number { color: #2563eb; }
    &.is-selected .stat-icon > span { animation: ceo-stat-pop 480ms ease both; }
    &:focus-visible .stat-icon { transform: translateY(-4px) rotate(-4deg); }
    &:active .stat-icon { transform: translateY(2px) scale(0.94); }
  }

  ${ChartPanel} {
    border-radius: 14px;
    animation: ceo-stat-reveal 240ms ease both;
    &[hidden] { display: none; }
    [data-dashboard-chart-bar], [data-dashboard-chart-segment] { animation: ceo-stat-bar 600ms ease both; }
  }

  .ceo-stat-footer { margin-top: 28px; padding-top: 20px; border-top: 1px solid #334155; }
  .ceo-stat-footer p { margin: 0; color: #cbd5e1; font-size: 13px; line-height: 1.7; word-break: keep-all; }
  .ceo-stat-footer p strong { display: block; margin-bottom: 6px; color: #e2e8f0; }
  .ceo-stat-close { display: block; margin: 24px auto 0; min-height: 44px; border: 1px solid #64748b; border-radius: 8px; padding: 10px 20px; background: transparent; color: #e2e8f0; font-size: 13px; cursor: pointer; }
  .ceo-stat-close:hover { background: #1e293b; }
  .ceo-stat-close:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }

  @keyframes ceo-stat-pop {
    0%, 100% { transform: translateY(0) rotate(0); }
    40% { transform: translateY(-6px) rotate(-7deg); }
    70% { transform: translateY(-1px) rotate(4deg); }
  }
  @keyframes ceo-stat-reveal {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes ceo-stat-bar {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }

  @media (hover: hover) and (pointer: fine) {
    ${OperatingAccordionTrigger}:hover { border-color: #2563eb; background: #edf3ff; }
    ${OperatingAccordionTrigger}:hover .stat-icon { transform: translateY(-4px) rotate(-4deg); }
    ${OperatingAccordionTrigger}:active .stat-icon { transform: translateY(2px) scale(0.94); }
  }
  @media (max-width: 640px) {
    ${OperatingCopy} h2 { font-size: 25px; }
    ${OperatingAccordion} { gap: 10px; }
    ${ChartHead} { flex-direction: column; }
    ${ChartHead} h3 { font-size: 23px; }
    &[data-company-statistics] ${OperatingAccordion} { gap: 8px; }
    &[data-company-statistics] ${OperatingAccordionTrigger} {
      grid-template-rows: auto 40px minmax(36px, auto) auto;
      gap: 8px;
      padding: 14px 6px;
      .stat-number { font-size: 10px; }
      .stat-icon { width: 40px; height: 40px; border-radius: 12px; }
      .stat-icon svg { width: 24px; height: 24px; }
      .stat-label { font-size: 13px; line-height: 1.4; }
      .stat-title { display: none; }
      .stat-action { font-size: 11px; gap: 4px; }
      .stat-action svg { width: 11px; height: 11px; }
    }
  }
  @media (prefers-reduced-motion: reduce) {
    ${OperatingAccordionTrigger} .stat-icon { transform: none !important; transition: none; }
    ${OperatingAccordionTrigger}.is-selected .stat-icon > span, ${ChartPanel},
    ${ChartPanel} [data-dashboard-chart-bar], ${ChartPanel} [data-dashboard-chart-segment] { animation: none; }
  }
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

  > #founder-story { padding: 24px 0; }

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

const CompanyBrandIntro = styled.header`
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

const CompanyBrandGrid = styled.div`
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
