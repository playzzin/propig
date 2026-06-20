'use client';

import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Cpu,
  Crown,
  Database,
  Handshake,
  Headphones,
  HeartHandshake,
  Mail,
  Megaphone,
  Palette,
  Quote,
  Sparkles,
  Star,
  Target,
  UsersRound,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { CorpEditableSection, type CorpSectionEditorState } from '@/components/corp/CorpSectionEditOverlay';
import type { CorpPage } from '@/schemas/corpPageSchema';

type DepartmentKey = 'leadership' | 'product' | 'technology' | 'experience' | 'growth' | 'operation';
type DrawerTab = 'profile' | 'journey' | 'voice';

type ProfileMetric = {
  label: string;
  value: string;
};

type ProfileMilestone = {
  year: string;
  title: string;
  detail: string;
};

type StaffProfile = {
  id: string;
  name: string;
  englishName: string;
  role: string;
  department: string;
  departmentKey: DepartmentKey;
  location: string;
  status: string;
  summary: string;
  quote: string;
  accent: string;
  image: string;
  icon: LucideIcon;
  skills: string[];
  metrics: ProfileMetric[];
  milestones: ProfileMilestone[];
  cheers: string[];
};

type DepartmentOption = {
  id: DepartmentKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

type StaffFlowStep = {
  number: string;
  label: string;
  owner: string;
  icon: LucideIcon;
  details: string[];
};

type StaffFlowSummaryItem = {
  label: string;
  value: string;
};

export type StaffIntroConfig = {
  heroKicker: string;
  heroTitle: string;
  heroBody: string;
  heroActionLabel: string;
  heroActionHref: string;
  heroMediaUrl: string;
  heroSignalLabel: string;
  departmentTitle: string;
  departmentOptions: DepartmentOption[];
  peopleTitle: string;
  staffProfiles: StaffProfile[];
  featuredKeywords: string[];
  flowTitle: string;
  flowBody: string;
  flowSummaryItems: StaffFlowSummaryItem[];
  flowSteps: StaffFlowStep[];
};

interface StaffIntroOrgChartProps {
  config?: StaffIntroConfig;
  editor?: CorpSectionEditorState;
}

const departmentOptions: DepartmentOption[] = [
  { id: 'leadership', label: '리더십', description: '전략과 의사결정 흐름을 설계하는 경영 리드', icon: Crown },
  { id: 'product', label: '제품', description: '고객 문제를 제품 로드맵과 출시 기준으로 전환', icon: Building2 },
  { id: 'technology', label: '기술', description: '플랫폼, AI, 서비스 안정성을 만드는 엔지니어링 조직', icon: Cpu },
  { id: 'experience', label: '경험', description: '브랜드와 사용 흐름을 시각적 경험으로 정리', icon: Palette },
  { id: 'growth', label: '성장', description: '시장, 고객, 파트너 접점을 확장하는 성장 조직', icon: Megaphone },
  { id: 'operation', label: '운영', description: '일정, 리스크, 피플 프로세스를 안정화하는 운영 조직', icon: Workflow },
];

const staffProfiles: StaffProfile[] = [
  {
    id: 'yoon-taeo',
    name: '윤태오',
    englishName: 'Taeo Yoon',
    role: 'CEO',
    department: 'Executive Office',
    departmentKey: 'leadership',
    location: 'Seoul HQ',
    status: '전사 전략 총괄',
    summary: '사업 방향, 파트너십, 투자 판단을 하나의 실행 언어로 정렬합니다.',
    quote: '좋은 전략은 팀이 다음 행동을 바로 고를 수 있게 만들어야 합니다.',
    accent: '#2dd4bf',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=520&q=80',
    icon: Crown,
    skills: ['전략 설계', '파트너십', '조직 리듬', '의사결정'],
    metrics: [
      { label: '전략 리뷰', value: '42' },
      { label: '파트너 미팅', value: '18' },
      { label: '분기 OKR', value: '96%' },
    ],
    milestones: [
      { year: '2022', title: '프로픽 설립', detail: '핵심 사업 모델과 초기 조직 구조를 수립했습니다.' },
      { year: '2024', title: 'AI 운영 체계 전환', detail: '제품과 운영 전반에 자동화 기준을 도입했습니다.' },
      { year: '2026', title: 'B2B 확장 리드', detail: '파트너십 기반의 신규 매출 라인을 확장하고 있습니다.' },
    ],
    cheers: ['결정이 빠르고 기준이 명확합니다.', '회의 후 다음 액션이 분명해집니다.', '복잡한 이슈를 한 문장으로 정리합니다.'],
  },
  {
    id: 'park-geonwoo',
    name: '박건우',
    englishName: 'Geonwoo Park',
    role: 'CTO',
    department: 'Technology Lab',
    departmentKey: 'technology',
    location: 'Seoul HQ',
    status: '플랫폼 아키텍처',
    summary: '프론트엔드, 백엔드, 보안, 배포 체계를 안정적인 제품 기반으로 연결합니다.',
    quote: '기술 부채는 숨기는 것이 아니라 우선순위로 다루는 운영 과제입니다.',
    accent: '#60a5fa',
    image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=520&q=80',
    icon: Cpu,
    skills: ['시스템 설계', '보안', 'Next.js', '인프라'],
    metrics: [
      { label: '릴리즈 안정도', value: '99.8%' },
      { label: '자동화 파이프라인', value: '21' },
      { label: '리뷰 처리', value: '63' },
    ],
    milestones: [
      { year: '2021', title: '플랫폼 엔지니어링 리드', detail: '공통 API와 배포 표준을 정립했습니다.' },
      { year: '2023', title: '보안 기준 고도화', detail: '관리자 권한과 데이터 접근 흐름을 재설계했습니다.' },
      { year: '2025', title: 'AI 워크플로우 통합', detail: '사내 도구와 생성형 AI 기능을 서비스에 연결했습니다.' },
    ],
    cheers: ['장애 대응 때 가장 먼저 흐름을 잡아줍니다.', '리뷰가 날카롭지만 적용하기 쉽습니다.', '복잡한 구조도 차분하게 설명합니다.'],
  },
  {
    id: 'jung-seoyeon',
    name: '정서연',
    englishName: 'Seoyeon Jung',
    role: 'COO',
    department: 'Operations Office',
    departmentKey: 'operation',
    location: 'Seoul HQ',
    status: '운영 체계 총괄',
    summary: '일정, 예산, 리스크, 문서 체계를 정리해 팀의 실행 속도를 유지합니다.',
    quote: '운영의 목표는 사람이 덜 기억해도 시스템이 놓치지 않게 만드는 것입니다.',
    accent: '#f5b84b',
    image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=520&q=80',
    icon: BadgeCheck,
    skills: ['프로세스', '리스크 관리', '예산', '거버넌스'],
    metrics: [
      { label: '운영 자동화', value: '34' },
      { label: '리스크 닫힘', value: '91%' },
      { label: '문서 표준', value: '28' },
    ],
    milestones: [
      { year: '2020', title: '운영 컨설팅', detail: '성장 조직의 업무 흐름과 회의 체계를 설계했습니다.' },
      { year: '2023', title: '프로픽 운영 합류', detail: '전사 운영 대시보드와 문서 기준을 만들었습니다.' },
      { year: '2026', title: '실행 리듬 고도화', detail: '팀별 의사결정 기록과 리스크 추적을 자동화하고 있습니다.' },
    ],
    cheers: ['일정이 흔들릴 때 가장 믿을 수 있습니다.', '복잡한 요청도 깔끔하게 정리됩니다.', '회의가 짧아지고 결과가 남습니다.'],
  },
  {
    id: 'han-jimin',
    name: '한지민',
    englishName: 'Jimin Han',
    role: 'CMO',
    department: 'Brand Growth',
    departmentKey: 'growth',
    location: 'Seoul HQ',
    status: '브랜드 성장',
    summary: '시장 메시지, 콘텐츠, 캠페인 지표를 연결해 고객 접점을 확장합니다.',
    quote: '브랜드는 멋진 문장이 아니라 고객이 반복해서 기억하는 경험입니다.',
    accent: '#fb7185',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=520&q=80',
    icon: Megaphone,
    skills: ['브랜드 전략', '콘텐츠', '퍼널 분석', '캠페인'],
    metrics: [
      { label: '캠페인 실험', value: '56' },
      { label: '콘텐츠 전환', value: '+31%' },
      { label: '브랜드 세션', value: '24' },
    ],
    milestones: [
      { year: '2019', title: '그로스 마케팅 시작', detail: '데이터 기반 캠페인 운영을 담당했습니다.' },
      { year: '2022', title: '브랜드 리뉴얼', detail: '프로픽의 메시지와 콘텐츠 톤을 재정의했습니다.' },
      { year: '2025', title: 'B2B 채널 확장', detail: '기업 고객을 위한 리드 생성 흐름을 구축했습니다.' },
    ],
    cheers: ['고객 관점으로 메시지를 바꿔줍니다.', '아이디어가 빠르게 실험으로 이어집니다.', '말보다 숫자로 설득합니다.'],
  },
  {
    id: 'lee-dohyun',
    name: '이도현',
    englishName: 'Dohyun Lee',
    role: 'Head of Product',
    department: 'Product Strategy',
    departmentKey: 'product',
    location: 'Pangyo Studio',
    status: '제품 로드맵',
    summary: '고객 문제를 기능 요구사항과 출시 기준으로 바꾸고 우선순위를 조율합니다.',
    quote: '제품 결정은 모두가 좋아하는 답보다 고객 문제가 줄어드는 답을 골라야 합니다.',
    accent: '#38bdf8',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=520&q=80',
    icon: Building2,
    skills: ['로드맵', 'PRD', '고객 인터뷰', '우선순위'],
    metrics: [
      { label: '출시 기획', value: '17' },
      { label: '고객 인터뷰', value: '84' },
      { label: '스프린트 정렬', value: '92%' },
    ],
    milestones: [
      { year: '2020', title: 'SaaS PM', detail: '업무 자동화 제품의 초기 PM을 맡았습니다.' },
      { year: '2023', title: '프로픽 제품 합류', detail: '사용자 흐름과 기능 우선순위 체계를 정리했습니다.' },
      { year: '2026', title: '멀티 제품 로드맵', detail: '기업, 생산성, AI 도구 라인을 통합 관리합니다.' },
    ],
    cheers: ['요구사항이 명확해서 개발 속도가 납니다.', '고객 이야기를 제품 언어로 잘 바꿉니다.', '우선순위 논쟁을 잘 정리합니다.'],
  },
  {
    id: 'choi-minjun',
    name: '최민준',
    englishName: 'Minjun Choi',
    role: 'Engineering Lead',
    department: 'Platform Engineering',
    departmentKey: 'technology',
    location: 'Remote Core',
    status: '서비스 개발',
    summary: '서비스 UI, API, 배포 품질을 챙기며 제품팀의 실험 속도를 높입니다.',
    quote: '빠른 개발은 많은 코드를 쓰는 일이 아니라 되돌릴 수 있는 구조를 만드는 일입니다.',
    accent: '#2dd4bf',
    image: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=520&q=80',
    icon: Cpu,
    skills: ['React', 'Firebase', 'API 설계', '배포'],
    metrics: [
      { label: '릴리즈', value: '73' },
      { label: '성능 개선', value: '+44%' },
      { label: '리뷰 승인', value: '118' },
    ],
    milestones: [
      { year: '2021', title: '풀스택 전환', detail: '프론트엔드와 서버 운영을 함께 담당했습니다.' },
      { year: '2024', title: '플랫폼 리드', detail: '공통 컴포넌트와 서비스 템플릿을 만들었습니다.' },
      { year: '2026', title: 'AI 기능 생산화', detail: '생성형 AI 워크플로우를 운영 가능한 제품 기능으로 전환합니다.' },
    ],
    cheers: ['코드 리뷰가 실질적인 품질 개선으로 이어집니다.', '문제가 생기면 끝까지 재현합니다.', '제품 맥락을 이해하고 개발합니다.'],
  },
  {
    id: 'moon-harin',
    name: '문하린',
    englishName: 'Harin Moon',
    role: 'AI Lead',
    department: 'Data and AI',
    departmentKey: 'technology',
    location: 'Seoul HQ',
    status: '데이터 자동화',
    summary: '데이터 파이프라인, 모델 실험, 프롬프트 평가 체계를 운영합니다.',
    quote: 'AI 기능은 신기함보다 재현성과 평가 기준이 먼저입니다.',
    accent: '#a78bfa',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=520&q=80',
    icon: Database,
    skills: ['LLM 평가', '데이터 파이프라인', '분석', '자동화'],
    metrics: [
      { label: '모델 실험', value: '129' },
      { label: '평가 세트', value: '11' },
      { label: '자동 리포트', value: '37' },
    ],
    milestones: [
      { year: '2021', title: '데이터 분석가', detail: '사용자 행동과 전환 지표 분석을 담당했습니다.' },
      { year: '2023', title: 'AI 실험 환경 구축', detail: '프롬프트, 모델, 결과 평가 흐름을 표준화했습니다.' },
      { year: '2026', title: '에이전트 평가 체계', detail: '업무 자동화 에이전트의 품질 기준을 고도화합니다.' },
    ],
    cheers: ['모호한 데이터를 실행 가능한 지표로 바꿉니다.', 'AI 기능의 과장을 잘 걷어냅니다.', '실험 결과를 믿을 수 있게 만듭니다.'],
  },
  {
    id: 'seo-jiwoo',
    name: '서지우',
    englishName: 'Jiwoo Seo',
    role: 'Design Lead',
    department: 'Design Experience',
    departmentKey: 'experience',
    location: 'Pangyo Studio',
    status: 'UX 품질',
    summary: '브랜드, 화면 구조, 접근성 기준을 실제 사용감으로 연결합니다.',
    quote: '좋은 화면은 설명을 덜어도 사용자가 다음 행동을 알게 만듭니다.',
    accent: '#f97316',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=520&q=80',
    icon: Palette,
    skills: ['UX 설계', '디자인 시스템', '프로토타입', '접근성'],
    metrics: [
      { label: '화면 개선', value: '68' },
      { label: '컴포넌트', value: '52' },
      { label: 'QA 통과', value: '97%' },
    ],
    milestones: [
      { year: '2020', title: '제품 디자이너', detail: 'B2B 업무 도구의 핵심 화면을 설계했습니다.' },
      { year: '2023', title: '디자인 시스템 구축', detail: '반복 UI의 토큰과 컴포넌트 기준을 만들었습니다.' },
      { year: '2026', title: '고품질 인터랙션 확장', detail: '제품별 핵심 경험을 더 정교하게 다듬고 있습니다.' },
    ],
    cheers: ['디자인 리뷰가 사용자 관점으로 돌아옵니다.', '작은 디테일까지 집요하게 봅니다.', '복잡한 기능도 화면이 차분해집니다.'],
  },
  {
    id: 'kang-soyoon',
    name: '강소윤',
    englishName: 'Soyoon Kang',
    role: 'Customer Success Lead',
    department: 'Customer Success',
    departmentKey: 'growth',
    location: 'Seoul HQ',
    status: '고객 성공',
    summary: '고객 요청과 반복 이슈를 수집해 제품 개선 흐름으로 되돌립니다.',
    quote: '고객 지원은 문제를 해결하는 동시에 제품이 배워야 할 신호를 찾는 일입니다.',
    accent: '#22c55e',
    image: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=520&q=80',
    icon: Headphones,
    skills: ['VOC', '온보딩', '고객 교육', '문제 추적'],
    metrics: [
      { label: '고객 세션', value: '142' },
      { label: '해결 리드타임', value: '-36%' },
      { label: '제품 피드백', value: '89' },
    ],
    milestones: [
      { year: '2021', title: '고객 운영 담당', detail: 'B2B 고객의 온보딩과 운영 지원을 담당했습니다.' },
      { year: '2024', title: 'VOC 체계화', detail: '고객 요청을 제품 개선 티켓으로 연결했습니다.' },
      { year: '2026', title: '고객 성공 지표 운영', detail: '사용성, 만족도, 유지율 지표를 통합 관리합니다.' },
    ],
    cheers: ['고객의 말을 팀이 이해하는 언어로 바꿉니다.', '문제 상황에서도 톤이 안정적입니다.', '피드백 루프를 놓치지 않습니다.'],
  },
  {
    id: 'oh-junhyuk',
    name: '오준혁',
    englishName: 'Junhyuk Oh',
    role: 'Business Lead',
    department: 'Business Development',
    departmentKey: 'growth',
    location: 'Seoul HQ',
    status: '제휴 개발',
    summary: '파트너십, 제휴, 신규 수익 기회를 검토하고 실행 조건을 만듭니다.',
    quote: '좋은 제휴는 서로의 부족한 부분이 아니라 강한 부분을 더 크게 만듭니다.',
    accent: '#f59e0b',
    image: 'https://images.unsplash.com/photo-1557862921-37829c790f19?auto=format&fit=crop&w=520&q=80',
    icon: Handshake,
    skills: ['파트너십', '영업 전략', '계약 협의', '시장 검증'],
    metrics: [
      { label: '제휴 제안', value: '31' },
      { label: '계약 전환', value: '14' },
      { label: '신규 파이프라인', value: '+48%' },
    ],
    milestones: [
      { year: '2019', title: 'B2B 세일즈', detail: '기업 고객 대상 솔루션 영업을 담당했습니다.' },
      { year: '2023', title: '사업개발 리드', detail: '파트너 세그먼트와 제안 프로세스를 정리했습니다.' },
      { year: '2026', title: '채널 파트너 확장', detail: '외부 채널과 공동 사업 구조를 설계합니다.' },
    ],
    cheers: ['상대방의 니즈를 빠르게 파악합니다.', '협상 후 내부 액션이 명확합니다.', '기회를 숫자로 검증합니다.'],
  },
  {
    id: 'shin-areum',
    name: '신아름',
    englishName: 'Areum Shin',
    role: 'Operations Lead',
    department: 'Business Operations',
    departmentKey: 'operation',
    location: 'Remote Core',
    status: '프로세스 관리',
    summary: '일정, 문서, 품질 체크리스트를 표준화해 반복 업무의 부담을 낮춥니다.',
    quote: '체크리스트는 사람을 통제하는 도구가 아니라 놓침을 줄이는 합의입니다.',
    accent: '#94a3b8',
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=520&q=80',
    icon: Workflow,
    skills: ['PMO', '문서화', '품질 기준', '업무 자동화'],
    metrics: [
      { label: '운영 템플릿', value: '45' },
      { label: '누락 감소', value: '-52%' },
      { label: '프로젝트 지원', value: '26' },
    ],
    milestones: [
      { year: '2020', title: '프로젝트 매니저', detail: '다부서 협업 프로젝트의 일정과 리스크를 관리했습니다.' },
      { year: '2024', title: '운영 표준화', detail: '반복 업무 템플릿과 체크 기준을 만들었습니다.' },
      { year: '2026', title: '운영 자동화 확장', detail: '문서, 일정, 알림 흐름을 더 촘촘하게 자동화합니다.' },
    ],
    cheers: ['마감 전에 위험 신호를 먼저 알려줍니다.', '자료가 항상 찾기 쉬운 곳에 있습니다.', '운영이 조용하고 안정적입니다.'],
  },
  {
    id: 'kim-yerin',
    name: '김예린',
    englishName: 'Yerin Kim',
    role: 'People Lead',
    department: 'People and Culture',
    departmentKey: 'operation',
    location: 'Seoul HQ',
    status: '피플 컬처',
    summary: '채용, 온보딩, 평가, 조직문화 프로그램을 팀의 성장 속도에 맞춰 설계합니다.',
    quote: '좋은 문화는 문구가 아니라 팀이 반복해서 선택하는 행동입니다.',
    accent: '#e879f9',
    image: 'https://images.unsplash.com/photo-1551836022-deb4988cc6c0?auto=format&fit=crop&w=520&q=80',
    icon: HeartHandshake,
    skills: ['채용', '온보딩', '평가', '조직문화'],
    metrics: [
      { label: '온보딩 만족', value: '4.8' },
      { label: '채용 파이프라인', value: '64' },
      { label: '컬처 세션', value: '19' },
    ],
    milestones: [
      { year: '2020', title: 'HRBP', detail: '성장 조직의 채용과 평가 운영을 맡았습니다.' },
      { year: '2023', title: '프로픽 피플 리드', detail: '온보딩과 리뷰 체계를 회사에 맞게 설계했습니다.' },
      { year: '2026', title: '성장 문화 고도화', detail: '피드백, 학습, 협업 기준을 일상에 녹이고 있습니다.' },
    ],
    cheers: ['새 구성원이 빠르게 적응하게 돕습니다.', '피드백을 부담 없이 나누게 만듭니다.', '팀의 분위기를 세심하게 살핍니다.'],
  },
];

const featuredKeywords = ['전략', 'AI', '고객', '운영', '브랜드'];

const departmentKeySet = new Set<DepartmentKey>(['leadership', 'product', 'technology', 'experience', 'growth', 'operation']);

const iconMap: Record<string, LucideIcon> = {
  BadgeCheck,
  Building2,
  Cpu,
  Crown,
  Database,
  Handshake,
  Headphones,
  HeartHandshake,
  Megaphone,
  Palette,
  Sparkles,
  Star,
  Target,
  UsersRound,
  Workflow,
};

function findEnabledBlock(page: CorpPage | null | undefined, blockId: string) {
  return page?.blocks.find((block) => block.id === blockId && block.enabled !== false);
}

function getIconByName(name: string | null | undefined, fallback: LucideIcon) {
  return name ? iconMap[name] ?? fallback : fallback;
}

function getDepartmentKey(value: string | null | undefined, fallback: DepartmentKey) {
  return value && departmentKeySet.has(value as DepartmentKey) ? (value as DepartmentKey) : fallback;
}

export function buildStaffIntroConfig(page?: CorpPage | null): StaffIntroConfig {
  const heroBlock = findEnabledBlock(page, 'staff-hero');
  const departmentBlock = findEnabledBlock(page, 'staff-departments');
  const peopleBlock = findEnabledBlock(page, 'staff-people');
  const flowBlock = findEnabledBlock(page, 'staff-flow');
  const departmentFeatures = departmentBlock?.type === 'feature-grid' ? departmentBlock.data.features : [];
  const people = peopleBlock?.type === 'people-grid' ? peopleBlock.data.people : [];

  const nextDepartmentOptions = departmentOptions.map((department, index) => {
    const feature = departmentFeatures[index];

    return {
      ...department,
      id: getDepartmentKey(feature?.meta, department.id),
      label: feature?.title?.trim() || department.label,
      description: feature?.body?.trim() || department.description,
      icon: getIconByName(feature?.icon, department.icon),
    };
  });

  const nextStaffProfiles =
    people.length > 0
      ? people.map((person, index) => {
          const fallback = staffProfiles[index] ?? staffProfiles[index % staffProfiles.length]!;
          const personSkills = person.skills ?? [];
          const personMetrics = person.metrics ?? [];
          const personMilestones = person.milestones ?? [];
          const personCheers = person.cheers ?? [];
          const departmentKey = getDepartmentKey(person.departmentKey, fallback.departmentKey);
          const department =
            nextDepartmentOptions.find((option) => option.id === departmentKey) ??
            nextDepartmentOptions.find((option) => option.label === person.department) ??
            nextDepartmentOptions[0]!;
          const name = person.name.trim() || fallback.name;
          const role = person.role.trim() || fallback.role;

          return {
            ...fallback,
            id: fallback.id || `staff-${index + 1}`,
            name,
            role,
            englishName: person.englishName?.trim() || fallback.englishName,
            departmentKey: department.id,
            department: person.department?.trim() || department.label,
            location: person.location?.trim() || fallback.location,
            status: person.status?.trim() || role,
            summary: person.bio.trim() || fallback.summary,
            quote: person.quote?.trim() || person.bio.trim() || fallback.quote,
            accent: person.accent?.trim() || fallback.accent,
            image: person.imageUrl?.trim() || fallback.image,
            icon: getIconByName(person.icon, fallback.icon),
            skills: personSkills.length > 0 ? personSkills : fallback.skills,
            metrics: personMetrics.length > 0 ? personMetrics : fallback.metrics,
            milestones: personMilestones.length > 0 ? personMilestones : fallback.milestones,
            cheers: personCheers.length > 0 ? personCheers : fallback.cheers,
          };
        })
      : staffProfiles;

  const nextFeaturedKeywords = Array.from(new Set(nextStaffProfiles.flatMap((profile) => profile.skills.map((skill) => skill.trim()).filter(Boolean)))).slice(
    0,
    5,
  );

  return {
    heroKicker: heroBlock?.type === 'hero' ? heroBlock.data.kicker : 'Premium Team Directory',
    heroTitle: heroBlock?.type === 'hero' ? heroBlock.data.headline : '직원소개',
    heroBody:
      heroBlock?.type === 'hero'
        ? heroBlock.data.body
        : '프로픽의 핵심 구성원을 리더십, 제품, 기술, 경험, 성장, 운영 카테고리로 정리한 팀 프로필입니다. 각 전문 영역의 역할과 협업 흐름을 한눈에 보고, 상세 프로필에서 업무 히스토리까지 확인할 수 있습니다.',
    heroActionLabel: heroBlock?.type === 'hero' ? heroBlock.data.primaryLabel || '오늘의 직원 추천' : '오늘의 직원 추천',
    heroActionHref: heroBlock?.type === 'hero' ? heroBlock.data.primaryHref?.trim() || '' : '',
    heroMediaUrl:
      heroBlock?.type === 'hero'
        ? heroBlock.data.mediaUrl?.trim() || ''
        : 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1100&q=82',
    heroSignalLabel: peopleBlock?.type === 'people-grid' ? peopleBlock.data.title : 'Live Overview',
    departmentTitle: departmentBlock?.type === 'feature-grid' ? departmentBlock.data.title : '전문 영역별 구성',
    departmentOptions: nextDepartmentOptions,
    peopleTitle: peopleBlock?.type === 'people-grid' ? peopleBlock.data.title : '현재 적용 인물 카드',
    staffProfiles: nextStaffProfiles,
    featuredKeywords: nextFeaturedKeywords.length > 0 ? nextFeaturedKeywords : featuredKeywords,
    flowTitle: flowBlock?.type === 'timeline' ? flowBlock.data.title : '협업이 이어지는 방식',
    flowBody:
      flowBlock?.type === 'timeline'
        ? flowBlock.data.body.trim()
        : '전략 결정부터 제품 정의, 기술 실행, 고객 검증, 운영 정착까지 직원들이 이어받는 협업 흐름을 정리했습니다.',
    flowSummaryItems:
      flowBlock?.type === 'timeline'
        ? flowBlock.data.summaryItems.filter((item) => item.label.trim() || item.value.trim())
        : [
            { label: '협업 단계', value: '5 steps' },
            { label: '핵심 부서', value: '6 teams' },
            { label: '운영 축', value: '전략 · 제품 · 기술 · 검증 · 운영' },
          ],
    flowSteps:
      flowBlock?.type === 'timeline' && flowBlock.data.items.length > 0
        ? flowBlock.data.items.map((item, index) => ({
            number: item.date.trim() || String(index + 1).padStart(2, '0'),
            label: item.title.trim() || `단계 ${index + 1}`,
            owner: item.body.trim(),
            icon: getIconByName(item.icon, Workflow),
            details: (item.details ?? []).map((detail) => detail.trim()).filter(Boolean),
          }))
        : [
            { number: '01', label: '전략', owner: 'Executive Office가 방향과 의사결정 기준을 세웁니다.', icon: Crown, details: ['목표와 우선순위를 정리합니다.'] },
            { number: '02', label: '제품 정의', owner: 'Product Strategy가 고객 문제와 출시 기준을 정리합니다.', icon: Target, details: ['기능 범위와 출시 기준을 맞춥니다.'] },
            { number: '03', label: '기술 실행', owner: 'Technology Lab이 안정적인 서비스 구조로 구현합니다.', icon: Cpu, details: ['개발, 배포, 보안 기준을 연결합니다.'] },
            { number: '04', label: '고객 검증', owner: 'Customer Success가 피드백을 수집해 개선으로 연결합니다.', icon: Headphones, details: ['사용자 반응과 개선 요청을 수집합니다.'] },
            { number: '05', label: '운영 정착', owner: 'Operations Office가 반복 가능한 프로세스로 고정합니다.', icon: Workflow, details: ['반복 가능한 운영 절차로 정리합니다.'] },
          ],
  };
}

const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.08 },
  },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: 'easeOut' },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.34, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    y: 12,
    scale: 0.98,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

export function StaffIntroOrgChart({ config, editor }: StaffIntroOrgChartProps = {}) {
  const activeConfig = config ?? buildStaffIntroConfig();
  const reduceMotion = useReducedMotion();
  const [activeDepartment, setActiveDepartment] = useState<DepartmentKey>('leadership');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('profile');
  const [spotlightCursor, setSpotlightCursor] = useState(0);
  const [spotlight, setSpotlight] = useState({ x: 68, y: 12 });

  const categorySections = useMemo(
    () =>
      activeConfig.departmentOptions.map((option) => ({
        ...option,
        profiles: activeConfig.staffProfiles.filter((profile) => profile.departmentKey === option.id),
      })),
    [activeConfig.departmentOptions, activeConfig.staffProfiles],
  );

  const activeCategorySection = categorySections.find((category) => category.id === activeDepartment) ?? categorySections[0]!;
  const featuredPool = activeCategorySection.profiles.length > 0 ? activeCategorySection.profiles : activeConfig.staffProfiles;
  const selectedProfile = selectedId ? activeConfig.staffProfiles.find((profile) => profile.id === selectedId) ?? null : null;
  const featuredProfile = featuredPool[spotlightCursor % featuredPool.length] ?? activeConfig.staffProfiles[0]!;
  const activeTotalMilestones = activeConfig.staffProfiles.reduce((sum, profile) => sum + profile.milestones.length, 0);

  const openProfile = (profileId: string) => {
    setSelectedId(profileId);
    setDrawerTab('profile');
  };

  const openSpotlightProfile = () => {
    const profile = featuredPool[spotlightCursor % featuredPool.length] ?? staffProfiles[0]!;
    setSpotlightCursor((current) => current + 1);
    openProfile(profile.id);
  };

  const handleHeroAction = () => {
    if (activeConfig.heroActionHref) {
      window.location.assign(activeConfig.heroActionHref);
      return;
    }

    openSpotlightProfile();
  };

  return (
    <Page
      id="staff-intro-page"
      aria-labelledby="staff-intro-title"
      $spotlightX={spotlight.x}
      $spotlightY={spotlight.y}
      onPointerMove={(event) => {
        if (reduceMotion) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.round(((event.clientX - rect.left) / rect.width) * 100);
        const y = Math.round(((event.clientY - rect.top) / rect.height) * 100);
        setSpotlight({ x, y });
      }}
    >
      <StaffIntroMotionStyles />
      <PageMotion variants={pageVariants} initial={reduceMotion ? false : 'hidden'} animate="visible">
        <CorpEditableSection blockId="staff-hero" label="첫 화면 수정" editor={editor}>
        <Hero variants={sectionVariants}>
          <HeroCopy>
            <SectionPill>
              <UsersRound size={15} strokeWidth={2.4} aria-hidden="true" />
              {activeConfig.heroKicker}
            </SectionPill>
            <HeroTitle id="staff-intro-title">{activeConfig.heroTitle}</HeroTitle>
            <HeroText>{activeConfig.heroBody}</HeroText>
            <HeroActions>
              <PrimaryButton type="button" onClick={handleHeroAction}>
                <Sparkles size={17} strokeWidth={2.5} aria-hidden="true" />
                {activeConfig.heroActionLabel}
              </PrimaryButton>
              <HeroSignal>
                <span>{featuredProfile.name}</span>
                <strong>{featuredProfile.role}</strong>
              </HeroSignal>
            </HeroActions>
          </HeroCopy>

          <HeroPanel aria-label="직원소개 요약">
            <HeroPanelHeader>
              <span>{activeConfig.heroSignalLabel}</span>
              <BadgeCheck size={18} strokeWidth={2.5} aria-hidden="true" />
            </HeroPanelHeader>
            {activeConfig.heroMediaUrl ? (
              <HeroPanelMedia>
                <img src={activeConfig.heroMediaUrl} alt={`${activeConfig.heroTitle} 대표 이미지`} />
              </HeroPanelMedia>
            ) : null}
            <StatGrid>
              <StatItem>
                <strong>{activeConfig.staffProfiles.length}</strong>
                <span>핵심 구성원</span>
              </StatItem>
              <StatItem>
                <strong>{activeConfig.departmentOptions.length}</strong>
                <span>전문 영역</span>
              </StatItem>
              <StatItem>
                <strong>{activeTotalMilestones}</strong>
                <span>주요 이력</span>
              </StatItem>
              <StatItem>
                <strong>{activeConfig.featuredKeywords.length}</strong>
                <span>대표 역량</span>
              </StatItem>
            </StatGrid>
            <KeywordRail aria-label="대표 역량">
              {activeConfig.featuredKeywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </KeywordRail>
          </HeroPanel>
        </Hero>
        </CorpEditableSection>

        <CorpEditableSection blockId="staff-departments" label="부서 수정" editor={editor}>
        <CategoryBar variants={sectionVariants} aria-label="직원 카테고리">
          <CategoryBarIntro>
            <span>Category Map</span>
            <strong>{activeConfig.departmentTitle}</strong>
          </CategoryBarIntro>

          <CategoryScroller>
            {categorySections.map((option) => {
              const Icon = option.icon;
              const isActive = activeDepartment === option.id;

              return (
                <CategoryButton
                  key={option.id}
                  type="button"
                  $active={isActive}
                  onClick={() => setActiveDepartment(option.id)}
                  aria-pressed={isActive}
                >
                  <Icon size={15} strokeWidth={2.5} aria-hidden="true" />
                  <span>{option.label}</span>
                  <em>{option.profiles.length}</em>
                </CategoryButton>
              );
            })}
          </CategoryScroller>
        </CategoryBar>
        </CorpEditableSection>

        <CorpEditableSection blockId="staff-people" label="인물 카드 수정" editor={editor}>
        <DirectoryHeader variants={sectionVariants}>
          <div>
            <SectionLabel>{activeConfig.peopleTitle}</SectionLabel>
            <h2>{activeCategorySection.label} 구성원</h2>
          </div>
          <DirectoryMeta>
            <strong>{activeCategorySection.profiles.length}</strong>
            <span>명 · 선택됨</span>
          </DirectoryMeta>
        </DirectoryHeader>

        <CategoryDirectory variants={sectionVariants}>
          {(() => {
            const category = activeCategorySection;
            const CategoryIconComponent = category.icon;

            return (
              <CategorySection key={category.id} id={`staff-category-${category.id}`}>
                <CategoryHeader>
                  <CategoryTitle>
                    <CategoryIcon>
                      <CategoryIconComponent size={19} strokeWidth={2.5} aria-hidden="true" />
                    </CategoryIcon>
                    <div>
                      <span>전문 영역</span>
                      <h3>{category.label}</h3>
                      <p>{category.description}</p>
                    </div>
                  </CategoryTitle>
                  <CategoryCount>
                    <strong>{category.profiles.length}</strong>
                    <span>명</span>
                  </CategoryCount>
                </CategoryHeader>

                <ProfileGrid>
                  {category.profiles.map((profile) => {
                    const Icon = profile.icon;

                    return (
                      <ProfileCard
                        key={profile.id}
                        type="button"
                        $accent={profile.accent}
                        variants={cardVariants}
                        initial={reduceMotion ? false : 'hidden'}
                        animate="visible"
                        exit="exit"
                        layout={!reduceMotion}
                        onClick={() => openProfile(profile.id)}
                        aria-label={`${profile.name} 상세 프로필 열기`}
                      >
                        <CardMedia $accent={profile.accent}>
                          <img src={profile.image} alt={`${profile.name} 프로필 사진`} loading="lazy" />
                          <CardStatus>
                            <Star size={13} strokeWidth={2.8} aria-hidden="true" />
                            {profile.status}
                          </CardStatus>
                        </CardMedia>
                        <CardBody>
                          <ProfileIdentity>
                            <span>{profile.department}</span>
                            <h3>{profile.name}</h3>
                            <strong>{profile.role}</strong>
                          </ProfileIdentity>
                          <ProfileSummary>{profile.summary}</ProfileSummary>
                          <SkillList aria-label={`${profile.name} 핵심 역량`}>
                            {profile.skills.slice(0, 3).map((skill) => (
                              <SkillChip key={skill}>{skill}</SkillChip>
                            ))}
                          </SkillList>
                          <CardBottom>
                            <Icon size={18} strokeWidth={2.5} aria-hidden="true" />
                            <span>프로필 보기</span>
                            <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
                          </CardBottom>
                        </CardBody>
                      </ProfileCard>
                    );
                  })}
                </ProfileGrid>
              </CategorySection>
            );
          })()}
        </CategoryDirectory>
        </CorpEditableSection>

        <CorpEditableSection blockId="staff-flow" label="협업 흐름 수정" editor={editor}>
        <FlowSection variants={sectionVariants} aria-labelledby="staff-flow-title">
          <FlowHeader>
            <div>
              <SectionLabel>Collaboration Flow</SectionLabel>
              <h2 id="staff-flow-title">{activeConfig.flowTitle}</h2>
              {activeConfig.flowBody ? <FlowIntro>{activeConfig.flowBody}</FlowIntro> : null}
            </div>
            {activeConfig.flowSummaryItems.length > 0 ? (
              <FlowSummaryGrid>
                {activeConfig.flowSummaryItems.map((item) => (
                  <FlowSummaryItem key={`${item.label}-${item.value}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </FlowSummaryItem>
                ))}
              </FlowSummaryGrid>
            ) : null}
          </FlowHeader>
          <FlowList>
            {activeConfig.flowSteps.map((step, index, list) => {
              const Icon = step.icon;

              return (
                <FlowStep key={`${step.number}-${step.label}`}>
                  <FlowIcon>
                    <Icon size={18} strokeWidth={2.5} aria-hidden="true" />
                  </FlowIcon>
                  <div>
                    <FlowIndex>{step.number}</FlowIndex>
                    <strong>{step.label}</strong>
                    {step.owner ? <span>{step.owner}</span> : null}
                    {step.details.length > 0 ? (
                      <FlowDetailList>
                        {step.details.slice(0, 3).map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </FlowDetailList>
                    ) : null}
                  </div>
                  {index < list.length - 1 && <ArrowRight size={18} strokeWidth={2.5} aria-hidden="true" />}
                </FlowStep>
              );
            })}
          </FlowList>
        </FlowSection>
        </CorpEditableSection>
      </PageMotion>

      <AnimatePresence>
        {selectedProfile && (
          <>
            <DrawerBackdrop
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSelectedId(null)}
            />
            <Drawer
              $accent={selectedProfile.accent}
              initial={reduceMotion ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="staff-drawer-title"
            >
              <DrawerTop>
                <span>Employee Spotlight</span>
                <IconButton type="button" onClick={() => setSelectedId(null)} aria-label="상세 프로필 닫기">
                  <X size={18} strokeWidth={2.5} />
                </IconButton>
              </DrawerTop>

              <DrawerContent>
                <DrawerHero>
                  <DrawerAvatar $accent={selectedProfile.accent}>
                    <img src={selectedProfile.image} alt={`${selectedProfile.name} 프로필 사진`} />
                  </DrawerAvatar>
                  <DrawerIdentity>
                    <span>{selectedProfile.department}</span>
                    <h2 id="staff-drawer-title">{selectedProfile.name}</h2>
                    <strong>{selectedProfile.role}</strong>
                    <p>{selectedProfile.englishName} · {selectedProfile.location}</p>
                  </DrawerIdentity>
                </DrawerHero>

                <DrawerTabs aria-label="상세 프로필 탭">
                  {[
                    { id: 'profile' as const, label: '소개' },
                    { id: 'journey' as const, label: '이력' },
                    { id: 'voice' as const, label: '응원' },
                  ].map((tab) => (
                    <DrawerTabButton key={tab.id} type="button" $active={drawerTab === tab.id} onClick={() => setDrawerTab(tab.id)}>
                      {tab.label}
                    </DrawerTabButton>
                  ))}
                </DrawerTabs>

                {drawerTab === 'profile' && (
                  <TabPanel>
                    <QuotePanel>
                      <Quote size={18} strokeWidth={2.5} aria-hidden="true" />
                      <p>{selectedProfile.quote}</p>
                    </QuotePanel>
                    <MetricGrid>
                      {selectedProfile.metrics.map((metric) => (
                        <DrawerMetric key={metric.label}>
                          <strong>{metric.value}</strong>
                          <span>{metric.label}</span>
                        </DrawerMetric>
                      ))}
                    </MetricGrid>
                    <DrawerSection>
                      <h3>핵심 역량</h3>
                      <SkillList>
                        {selectedProfile.skills.map((skill) => (
                          <SkillChip key={skill}>{skill}</SkillChip>
                        ))}
                      </SkillList>
                    </DrawerSection>
                    <ContactRow>
                      <a href={`mailto:${selectedProfile.id}@propig.co.kr`}>
                        <Mail size={16} strokeWidth={2.5} aria-hidden="true" />
                        이메일
                      </a>
                      <a href="#staff-intro-page">
                        <CalendarDays size={16} strokeWidth={2.5} aria-hidden="true" />
                        미팅 요청
                      </a>
                    </ContactRow>
                  </TabPanel>
                )}

                {drawerTab === 'journey' && (
                  <TabPanel>
                    <Timeline>
                      {selectedProfile.milestones.map((milestone) => (
                        <TimelineItem key={`${selectedProfile.id}-${milestone.year}-${milestone.title}`} $accent={selectedProfile.accent}>
                          <span>{milestone.year}</span>
                          <div>
                            <strong>{milestone.title}</strong>
                            <p>{milestone.detail}</p>
                          </div>
                        </TimelineItem>
                      ))}
                    </Timeline>
                  </TabPanel>
                )}

                {drawerTab === 'voice' && (
                  <TabPanel>
                    <CheerList>
                      {selectedProfile.cheers.map((cheer) => (
                        <CheerItem key={cheer}>
                          <Sparkles size={17} strokeWidth={2.5} aria-hidden="true" />
                          <p>{cheer}</p>
                        </CheerItem>
                      ))}
                    </CheerList>
                  </TabPanel>
                )}
              </DrawerContent>
            </Drawer>
          </>
        )}
      </AnimatePresence>
    </Page>
  );
}

const Page = styled.main<{ $spotlightX: number; $spotlightY: number }>`
  --spotlight-x: ${(props) => props.$spotlightX}%;
  --spotlight-y: ${(props) => props.$spotlightY}%;
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 28px;
  color: #edf8f4;
  background:
    radial-gradient(circle at var(--spotlight-x) var(--spotlight-y), rgba(45, 212, 191, 0.18), transparent 28rem),
    linear-gradient(135deg, rgba(5, 18, 17, 0.98), rgba(18, 15, 13, 0.98)),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 72px),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 72px);
  font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;

  &::after {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.18;
    background-image: linear-gradient(rgba(255, 255, 255, 0.32) 1px, transparent 1px);
    background-size: 100% 6px;
    mix-blend-mode: overlay;
  }

  @media (max-width: 760px) {
    padding: 14px;
  }
`;

const PageMotion = styled(motion.div)`
  position: relative;
  z-index: 1;
  width: min(1200px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 18px;
`;

const Hero = styled(motion.section)`
  min-height: 410px;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 18px;
  padding: 30px;
  border: 1px solid rgba(174, 194, 184, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.035)),
    rgba(5, 14, 13, 0.82);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(18px);
  overflow: hidden;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 760px) {
    min-height: auto;
    padding: 22px;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const SectionPill = styled.span`
  width: fit-content;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid rgba(45, 212, 191, 0.42);
  border-radius: 8px;
  color: #bdfef4;
  background: rgba(45, 212, 191, 0.12);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0;
`;

const HeroTitle = styled.h1`
  max-width: 760px;
  margin: 18px 0 0;
  color: #fbfffd;
  font-size: 4rem;
  font-weight: 950;
  line-height: 1.02;
  letter-spacing: 0;
  word-break: keep-all;

  @media (max-width: 760px) {
    font-size: 2.8rem;
  }

  @media (max-width: 420px) {
    font-size: 2.25rem;
  }
`;

const HeroText = styled.p`
  max-width: 760px;
  margin: 18px 0 0;
  color: rgba(237, 248, 244, 0.72);
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.72;
  letter-spacing: 0;
  word-break: keep-all;
`;

const HeroActions = styled.div`
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
`;

const PrimaryButton = styled.button`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  color: #06110f;
  background: linear-gradient(90deg, #5eead4, #f5b84b);
  font-size: 0.92rem;
  font-weight: 950;
  letter-spacing: 0;
  cursor: pointer;
  box-shadow: 0 14px 30px rgba(45, 212, 191, 0.2);
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 18px 38px rgba(245, 184, 75, 0.2);
  }

  &:focus-visible {
    outline: 2px solid #f8fffc;
    outline-offset: 3px;
  }
`;

const HeroSignal = styled.div`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid rgba(174, 194, 184, 0.18);
  border-radius: 8px;
  color: rgba(237, 248, 244, 0.74);
  background: rgba(255, 255, 255, 0.045);
  font-size: 0.86rem;
  font-weight: 800;

  span {
    color: #ffffff;
    font-weight: 950;
  }

  strong {
    color: #f5b84b;
    font-weight: 900;
  }
`;

const HeroPanel = styled.aside`
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 22px;
  border: 1px solid rgba(174, 194, 184, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.045)),
    rgba(7, 18, 17, 0.86);
  overflow: hidden;
`;

const HeroPanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #5eead4;

  span {
    color: #f8fffc;
    font-size: 0.84rem;
    font-weight: 950;
    letter-spacing: 0;
  }
`;

const HeroPanelMedia = styled.figure`
  position: relative;
  min-width: 0;
  height: clamp(120px, 14vw, 168px);
  margin: 0;
  border: 1px solid rgba(174, 194, 184, 0.14);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);

  img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 45%, rgba(5, 14, 13, 0.48));
    pointer-events: none;
  }
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
`;

const StatItem = styled.div`
  min-width: 0;
  min-height: 104px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 14px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.052);

  strong {
    color: #ffffff;
    font-size: 2.25rem;
    font-weight: 950;
    line-height: 1;
    letter-spacing: 0;
  }

  span {
    margin-top: 8px;
    color: rgba(237, 248, 244, 0.64);
    font-size: 0.8rem;
    font-weight: 850;
    letter-spacing: 0;
  }
`;

const KeywordRail = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    border: 1px solid rgba(245, 184, 75, 0.28);
    border-radius: 8px;
    color: #ffe0a0;
    background: rgba(245, 184, 75, 0.1);
    font-size: 0.8rem;
    font-weight: 900;
    letter-spacing: 0;
  }
`;

const CategoryBar = styled(motion.nav)`
  position: sticky;
  top: 0;
  z-index: 4;
  display: grid;
  grid-template-columns: minmax(190px, 260px) minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 12px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  background: rgba(5, 16, 15, 0.82);
  backdrop-filter: blur(18px);

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const CategoryBarIntro = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  span {
    color: #5eead4;
    font-size: 0.72rem;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  strong {
    color: #ffffff;
    font-size: 0.98rem;
    font-weight: 950;
    line-height: 1.2;
    letter-spacing: 0;
    word-break: keep-all;
  }
`;

const IconButton = styled.button`
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(174, 194, 184, 0.14);
  border-radius: 8px;
  color: rgba(237, 248, 244, 0.72);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;

  &:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
  }

  &:focus-visible {
    outline: 2px solid #5eead4;
    outline-offset: 2px;
  }
`;

const CategoryScroller = styled.div`
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 1px;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 234, 212, 0.48) transparent;

  &::-webkit-scrollbar {
    height: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(94, 234, 212, 0.38);
    border-radius: 999px;
  }

  @media (max-width: 980px) {
    justify-content: flex-start;
  }
`;

const CategoryButton = styled.button<{ $active: boolean }>`
  flex: 0 0 auto;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(94, 234, 212, 0.78)' : 'rgba(174, 194, 184, 0.16)')};
  border-radius: 8px;
  color: ${(props) => (props.$active ? '#effffb' : 'rgba(237, 248, 244, 0.72)')};
  background: ${(props) => (props.$active ? 'rgba(45, 212, 191, 0.18)' : 'rgba(255, 255, 255, 0.045)')};
  font-size: 0.82rem;
  font-weight: 850;
  letter-spacing: 0;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(94, 234, 212, 0.64);
    color: #effffb;
    background: rgba(45, 212, 191, 0.14);
  }

  em {
    min-width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: ${(props) => (props.$active ? '#06110f' : 'rgba(237, 248, 244, 0.68)')};
    background: ${(props) => (props.$active ? '#5eead4' : 'rgba(255, 255, 255, 0.08)')};
    font-style: normal;
    font-size: 0.74rem;
    font-weight: 950;
  }

  &:focus-visible {
    outline: 2px solid #5eead4;
    outline-offset: 2px;
  }
`;

const DirectoryHeader = styled(motion.section)`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;

  h2 {
    margin: 8px 0 0;
    color: #ffffff;
    font-size: 1.8rem;
    font-weight: 950;
    line-height: 1.18;
    letter-spacing: 0;
    word-break: keep-all;
  }
`;

const SectionLabel = styled.span`
  width: fit-content;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border-radius: 8px;
  color: #06110f;
  background: linear-gradient(90deg, #5eead4, #f5b84b);
  font-size: 0.76rem;
  font-weight: 950;
  letter-spacing: 0;
`;

const DirectoryMeta = styled.div`
  min-height: 42px;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);

  strong {
    color: #ffffff;
    font-size: 1.6rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  span {
    color: rgba(237, 248, 244, 0.64);
    font-size: 0.82rem;
    font-weight: 850;
  }
`;

const CategoryDirectory = styled(motion.div)`
  display: grid;
  gap: 18px;
`;

const CategorySection = styled.section`
  scroll-margin-top: 92px;
  min-width: 0;
  display: grid;
  gap: 14px;
  padding: 20px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.025)),
    rgba(255, 255, 255, 0.035);

  @media (max-width: 760px) {
    scroll-margin-top: 130px;
    padding: 16px;
  }
`;

const CategoryHeader = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  @media (max-width: 620px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const CategoryTitle = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 12px;

  span {
    color: #5eead4;
    font-size: 0.8rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  h3 {
    margin: 4px 0 0;
    color: #ffffff;
    font-size: 1.34rem;
    font-weight: 950;
    line-height: 1.16;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    margin: 7px 0 0;
    color: rgba(237, 248, 244, 0.66);
    font-size: 0.88rem;
    font-weight: 700;
    line-height: 1.45;
    letter-spacing: 0;
    word-break: keep-all;
  }
`;

const CategoryIcon = styled.div`
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(94, 234, 212, 0.3);
  border-radius: 8px;
  color: #5eead4;
  background: rgba(45, 212, 191, 0.12);
`;

const CategoryCount = styled.div`
  flex: 0 0 auto;
  min-height: 40px;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 0 11px;
  border: 1px solid rgba(245, 184, 75, 0.24);
  border-radius: 8px;
  color: #ffe0a0;
  background: rgba(245, 184, 75, 0.08);

  strong {
    color: #ffffff;
    font-size: 1.35rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  span {
    font-size: 0.78rem;
    font-weight: 900;
  }
`;

const ProfileGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 1160px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 880px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
`;

const ProfileCard = styled(motion.button)<{ $accent: string }>`
  min-width: 0;
  min-height: 430px;
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  color: inherit;
  background:
    linear-gradient(145deg, color-mix(in srgb, ${(props) => props.$accent} 12%, transparent), transparent 52%),
    rgba(255, 255, 255, 0.055);
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.24);
  overflow: hidden;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease;

  &:hover {
    transform: translateY(-4px);
    border-color: color-mix(in srgb, ${(props) => props.$accent} 72%, transparent);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.34);
  }

  &:focus-visible {
    outline: 2px solid ${(props) => props.$accent};
    outline-offset: 3px;
  }
`;

const CardMedia = styled.div<{ $accent: string }>`
  position: relative;
  min-height: 180px;
  overflow: hidden;
  background:
    linear-gradient(180deg, transparent 42%, rgba(0, 0, 0, 0.66)),
    color-mix(in srgb, ${(props) => props.$accent} 22%, #07100f);

  img {
    width: 100%;
    height: 220px;
    display: block;
    object-fit: cover;
    filter: saturate(0.96) contrast(1.03);
    transform: scale(1.01);
    transition: transform 0.32s ease;
  }

  ${ProfileCard}:hover & img {
    transform: scale(1.05);
  }
`;

const CardStatus = styled.span`
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 8px;
  color: #ffffff;
  background: rgba(5, 14, 13, 0.68);
  backdrop-filter: blur(12px);
  font-size: 0.8rem;
  font-weight: 900;
  letter-spacing: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const CardBody = styled.div`
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 18px;
`;

const ProfileIdentity = styled.div`
  min-width: 0;

  span {
    display: block;
    color: #5eead4;
    font-size: 0.78rem;
    font-weight: 950;
    letter-spacing: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h3 {
    margin: 7px 0 0;
    color: #ffffff;
    font-size: 1.45rem;
    font-weight: 950;
    line-height: 1.15;
    letter-spacing: 0;
    word-break: keep-all;
  }

  strong {
    display: block;
    margin-top: 7px;
    color: rgba(237, 248, 244, 0.72);
    font-size: 0.9rem;
    font-weight: 850;
    line-height: 1.35;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }
`;

const ProfileSummary = styled.p`
  margin: 14px 0 0;
  color: rgba(237, 248, 244, 0.66);
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.58;
  letter-spacing: 0;
  word-break: keep-all;
`;

const SkillList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 16px;
`;

const SkillChip = styled.span`
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  color: rgba(237, 248, 244, 0.82);
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0;
`;

const CardBottom = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 18px;
  color: rgba(237, 248, 244, 0.74);

  svg:first-child {
    color: #f5b84b;
  }

  span {
    min-width: 0;
    font-size: 0.84rem;
    font-weight: 900;
    letter-spacing: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const FlowSection = styled(motion.section)`
  scroll-margin-top: 96px;
  min-width: 0;
  padding: 28px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.052);

  h2 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: 1.8rem;
    font-weight: 950;
    line-height: 1.18;
    letter-spacing: 0;
    word-break: keep-all;
  }

  @media (max-width: 760px) {
    padding: 20px;
  }
`;

const FlowHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 360px);
  gap: 18px;
  align-items: start;
  margin-bottom: 22px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const FlowIntro = styled.p`
  max-width: 720px;
  margin: 12px 0 0;
  color: rgba(237, 248, 244, 0.68);
  font-size: 0.94rem;
  font-weight: 700;
  line-height: 1.62;
  letter-spacing: 0;
  word-break: keep-all;
`;

const FlowSummaryGrid = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const FlowSummaryItem = styled.div`
  min-width: 0;
  min-height: 72px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 12px;
  border: 1px solid rgba(245, 184, 75, 0.18);
  border-radius: 8px;
  background: rgba(245, 184, 75, 0.075);

  span {
    color: rgba(255, 232, 186, 0.72);
    font-size: 0.74rem;
    font-weight: 900;
    letter-spacing: 0;
  }

  strong {
    margin-top: 5px;
    color: #ffffff;
    font-size: 1.08rem;
    font-weight: 950;
    line-height: 1.2;
    letter-spacing: 0;
    word-break: keep-all;
  }
`;

const FlowList = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const FlowStep = styled.div`
  min-width: 0;
  min-height: 126px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 22px;
  align-items: start;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  background: rgba(5, 14, 13, 0.44);

  strong,
  span {
    display: block;
    min-width: 0;
  }

  strong {
    color: #ffffff;
    font-size: 0.95rem;
    font-weight: 950;
    line-height: 1.24;
    letter-spacing: 0;
    word-break: keep-all;
  }

  span {
    margin-top: 5px;
    color: rgba(237, 248, 244, 0.58);
    font-size: 0.78rem;
    font-weight: 750;
    line-height: 1.42;
    word-break: keep-all;
  }

  > svg {
    align-self: center;
    color: rgba(245, 184, 75, 0.88);
  }

  @media (max-width: 980px) {
    grid-template-columns: 38px minmax(0, 1fr);

    > svg {
      display: none;
    }
  }
`;

const FlowIndex = styled.b`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  min-height: 22px;
  margin-bottom: 9px;
  padding: 0 8px;
  border-radius: 8px;
  color: #06110f;
  background: #f5b84b;
  font-size: 0.72rem;
  font-weight: 950;
  line-height: 1;
  letter-spacing: 0;
`;

const FlowDetailList = styled.ul`
  display: grid;
  gap: 5px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;

  li {
    position: relative;
    padding-left: 11px;
    color: rgba(237, 248, 244, 0.54);
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.38;
    word-break: keep-all;
  }

  li::before {
    content: "";
    position: absolute;
    top: 0.58em;
    left: 0;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #5eead4;
  }
`;

const FlowIcon = styled.div`
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #5eead4;
  background: rgba(45, 212, 191, 0.12);
`;

const DrawerBackdrop = styled(motion.div)`
  --staff-drawer-top-offset: calc(var(--header-h, 64px) + 64px);
  position: fixed;
  inset: var(--staff-drawer-top-offset) 0 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.44);
  backdrop-filter: blur(4px);

  @media (max-width: 768px) {
    --staff-drawer-top-offset: calc(var(--header-h, 64px) + 58px);
  }
`;

const Drawer = styled(motion.aside)<{ $accent: string }>`
  --staff-drawer-top-offset: calc(var(--header-h, 64px) + 64px);
  position: fixed;
  top: var(--staff-drawer-top-offset);
  right: 0;
  bottom: 0;
  z-index: 31;
  width: min(620px, 100%);
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(174, 194, 184, 0.18);
  color: #edf8f4;
  background:
    linear-gradient(145deg, color-mix(in srgb, ${(props) => props.$accent} 10%, transparent), transparent 44%),
    rgba(7, 18, 17, 0.98);
  box-shadow: -28px 0 70px rgba(0, 0, 0, 0.4);

  @media (max-width: 768px) {
    --staff-drawer-top-offset: calc(var(--header-h, 64px) + 58px);
  }
`;

const DrawerTop = styled.header`
  min-height: 70px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 22px;
  border-bottom: 1px solid rgba(174, 194, 184, 0.14);

  span {
    color: #5eead4;
    font-size: 0.78rem;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0;
  }
`;

const DrawerContent = styled.div`
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 24px;

  @media (max-width: 520px) {
    padding: 18px;
  }
`;

const DrawerHero = styled.section`
  min-width: 0;
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 18px;
  align-items: center;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const DrawerAvatar = styled.div<{ $accent: string }>`
  width: 132px;
  height: 132px;
  padding: 4px;
  border-radius: 8px;
  background: linear-gradient(135deg, ${(props) => props.$accent}, #f5b84b);
  box-shadow: 0 18px 34px color-mix(in srgb, ${(props) => props.$accent} 22%, transparent);

  img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    border-radius: 6px;
  }
`;

const DrawerIdentity = styled.div`
  min-width: 0;

  span {
    color: #5eead4;
    font-size: 0.78rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  h2 {
    margin: 8px 0 0;
    color: #ffffff;
    font-size: 2.15rem;
    font-weight: 950;
    line-height: 1.08;
    letter-spacing: 0;
    word-break: keep-all;
  }

  strong {
    display: block;
    margin-top: 8px;
    color: rgba(237, 248, 244, 0.82);
    font-size: 1rem;
    font-weight: 900;
    letter-spacing: 0;
  }

  p {
    margin: 8px 0 0;
    color: rgba(237, 248, 244, 0.56);
    font-size: 0.86rem;
    font-weight: 750;
    line-height: 1.45;
  }
`;

const DrawerTabs = styled.nav`
  display: flex;
  gap: 8px;
  margin-top: 26px;
  border-bottom: 1px solid rgba(174, 194, 184, 0.14);
`;

const DrawerTabButton = styled.button<{ $active: boolean }>`
  min-height: 42px;
  padding: 0 4px;
  border: 0;
  border-bottom: 2px solid ${(props) => (props.$active ? '#5eead4' : 'transparent')};
  color: ${(props) => (props.$active ? '#ffffff' : 'rgba(237, 248, 244, 0.56)')};
  background: transparent;
  font-size: 0.9rem;
  font-weight: 950;
  letter-spacing: 0;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #5eead4;
    outline-offset: 3px;
  }
`;

const TabPanel = styled.section`
  display: grid;
  gap: 16px;
  margin-top: 20px;
`;

const QuotePanel = styled.figure`
  min-width: 0;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 12px;
  margin: 0;
  padding: 18px;
  border: 1px solid rgba(245, 184, 75, 0.2);
  border-radius: 8px;
  color: #ffe3ad;
  background: rgba(245, 184, 75, 0.08);

  p {
    margin: 0;
    color: rgba(255, 245, 225, 0.9);
    font-size: 0.96rem;
    font-weight: 750;
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const DrawerMetric = styled.div`
  min-height: 88px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 14px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);

  strong {
    color: #ffffff;
    font-size: 1.7rem;
    font-weight: 950;
    line-height: 1;
    letter-spacing: 0;
  }

  span {
    margin-top: 7px;
    color: rgba(237, 248, 244, 0.6);
    font-size: 0.78rem;
    font-weight: 850;
  }
`;

const DrawerSection = styled.section`
  min-width: 0;

  h3 {
    margin: 0;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 950;
    letter-spacing: 0;
  }
`;

const ContactRow = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  a {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(174, 194, 184, 0.16);
    border-radius: 8px;
    color: rgba(237, 248, 244, 0.82);
    background: rgba(255, 255, 255, 0.055);
    font-size: 0.86rem;
    font-weight: 900;
    text-decoration: none;
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const Timeline = styled.div`
  display: grid;
  gap: 12px;
`;

const TimelineItem = styled.article<{ $accent: string }>`
  min-width: 0;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-left: 3px solid ${(props) => props.$accent};
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.052);

  span {
    color: ${(props) => props.$accent};
    font-size: 0.9rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  strong {
    display: block;
    color: #ffffff;
    font-size: 0.96rem;
    font-weight: 950;
    line-height: 1.35;
  }

  p {
    margin: 6px 0 0;
    color: rgba(237, 248, 244, 0.64);
    font-size: 0.86rem;
    font-weight: 650;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const CheerList = styled.div`
  display: grid;
  gap: 12px;
`;

const CheerItem = styled.article`
  min-width: 0;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 16px;
  border: 1px solid rgba(174, 194, 184, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.052);

  svg {
    color: #5eead4;
  }

  p {
    margin: 0;
    color: rgba(237, 248, 244, 0.74);
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const StaffIntroMotionStyles = createGlobalStyle`
  @media (prefers-reduced-motion: reduce) {
    #staff-intro-page *,
    #staff-intro-page *::before,
    #staff-intro-page *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
`;
