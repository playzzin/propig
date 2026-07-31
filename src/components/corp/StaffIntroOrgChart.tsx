'use client';

import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  Crown,
  Gavel,
  Headphones,
  Layers3,
  Megaphone,
  Network,
  Palette,
  Rocket,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  UserRoundCheck,
  UserRoundPlus,
  UsersRound,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import styled, { createGlobalStyle, css } from 'styled-components';
import { CorpEditableSection, type CorpSectionEditorState } from '@/components/corp/CorpSectionEditOverlay';

type ExecutiveRole = 'CTO' | 'CMO' | 'CFO' | 'CLO';

type DepartmentId =
  | 'platform'
  | 'ai-data'
  | 'product-experience'
  | 'brand-marketing'
  | 'growth-sales'
  | 'customer-success'
  | 'finance-accounting'
  | 'strategy-operations'
  | 'legal-compliance'
  | 'people-culture';

type OpenPosition = {
  code: string;
  title: string;
};

type StaffProfile = {
  id: string;
  name: string;
  englishName: string;
  role: string;
  department: string;
  status: '운영중' | '구인중';
  bio: string;
  quote: string;
  reportsTo: string;
  avatarIndex: number | null;
  accent: string;
  skills: string[];
  responsibilities: string[];
};

type Department = {
  id: DepartmentId;
  label: string;
  englishLabel: string;
  executiveRole: ExecutiveRole;
  lead: StaffProfile;
  mandate: string;
  accent: string;
  soft: string;
  icon: LucideIcon;
  skills: string[];
  openings: OpenPosition[];
};

type ExecutiveGroup = {
  role: ExecutiveRole;
  profile: StaffProfile;
  focus: string;
  departmentIds: DepartmentId[];
};

type OperatingStep = {
  index: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

interface StaffIntroOrgChartProps {
  editor?: CorpSectionEditorState;
}

const CEO_PROFILE: StaffProfile = {
  id: 'ceo-just-pig',
  name: '그냥돼지',
  englishName: 'JUST PIG',
  role: 'CEO · Chief Executive Officer',
  department: '대표실',
  status: '운영중',
  bio: '회사 전체의 비전과 우선순위를 결정하고, AI 조직이 사람의 판단 기준 안에서 일하도록 최종 책임을 맡습니다.',
  quote: '복잡한 조직일수록 결정 기준은 더 단순하고 선명해야 합니다.',
  reportsTo: '이사회 · 최종 책임',
  avatarIndex: 0,
  accent: '#77d7bd',
  skills: ['비전 설계', '최종 의사결정', '조직 운영', 'Human-in-the-loop'],
  responsibilities: ['전사 목표와 우선순위 승인', 'C-Suite 성과 기준 정렬', 'AI 권한과 리스크 최종 통제'],
};

const executiveGroups: ExecutiveGroup[] = [
  {
    role: 'CTO',
    focus: '제품·플랫폼·AI 기술 총괄',
    departmentIds: ['platform', 'ai-data', 'product-experience'],
    profile: {
      id: 'executive-cto',
      name: 'ATLAS',
      englishName: 'ATLAS',
      role: 'CTO · Chief Technology Officer',
      department: 'Technology Office',
      status: '운영중',
      bio: '플랫폼, AI 데이터, 제품 경험 조직의 기술 전략과 출시 품질을 총괄합니다.',
      quote: '좋은 기술은 복잡함을 감추는 것이 아니라 안전하게 관리합니다.',
      reportsTo: 'CEO · 그냥돼지',
      avatarIndex: 1,
      accent: '#2f6fed',
      skills: ['기술 전략', 'AI 아키텍처', '제품 품질', '보안'],
      responsibilities: ['기술 로드맵 승인', '아키텍처·보안 기준 수립', '3개 기술 부서 성과 검수'],
    },
  },
  {
    role: 'CMO',
    focus: '브랜드·성장·고객 경험 총괄',
    departmentIds: ['brand-marketing', 'growth-sales', 'customer-success'],
    profile: {
      id: 'executive-cmo',
      name: 'SIGNAL',
      englishName: 'SIGNAL',
      role: 'CMO · Chief Marketing Officer',
      department: 'Growth Office',
      status: '운영중',
      bio: '브랜드 메시지부터 영업 전환, 고객 성공까지 모든 시장 접점을 하나의 성장 흐름으로 연결합니다.',
      quote: '고객이 보내는 신호를 놓치지 않는 것이 성장의 시작입니다.',
      reportsTo: 'CEO · 그냥돼지',
      avatarIndex: 2,
      accent: '#cf5576',
      skills: ['브랜드 전략', 'Growth', '고객 데이터', '파트너십'],
      responsibilities: ['시장 포지셔닝 결정', '고객 획득·유지 지표 관리', '3개 성장 부서 캠페인 승인'],
    },
  },
  {
    role: 'CFO',
    focus: '재무·예산·전략 운영 총괄',
    departmentIds: ['finance-accounting', 'strategy-operations'],
    profile: {
      id: 'executive-cfo',
      name: 'VAULT',
      englishName: 'VAULT',
      role: 'CFO · Chief Financial Officer',
      department: 'Finance Office',
      status: '운영중',
      bio: '재무 건전성과 운영 효율을 수치로 관리하고, 중요한 투자 판단에 신뢰할 수 있는 기준을 제공합니다.',
      quote: '숫자는 결과를 설명하고, 기준은 다음 결정을 만듭니다.',
      reportsTo: 'CEO · 그냥돼지',
      avatarIndex: 3,
      accent: '#0d8f73',
      skills: ['재무 전략', 'FP&A', '예산 통제', '운영 효율'],
      responsibilities: ['현금 흐름과 손익 감독', '예산·투자안 검토', '전사 운영 효율 지표 관리'],
    },
  },
  {
    role: 'CLO',
    focus: '법무·준법·조직 문화 총괄',
    departmentIds: ['legal-compliance', 'people-culture'],
    profile: {
      id: 'executive-clo',
      name: 'LEX',
      englishName: 'LEX',
      role: 'CLO · Chief Legal Officer',
      department: 'Legal & People Office',
      status: '운영중',
      bio: '계약과 규제, 개인정보, 피플 정책을 함께 살펴 조직이 안전하고 지속 가능하게 성장하도록 돕습니다.',
      quote: '빠르게 움직일수록 지켜야 할 경계는 더 분명해야 합니다.',
      reportsTo: 'CEO · 그냥돼지',
      avatarIndex: 4,
      accent: '#9a6b26',
      skills: ['기업 법무', '컴플라이언스', '개인정보', 'People Policy'],
      responsibilities: ['계약·규제 리스크 승인', 'AI 준법 정책 관리', '조직 문화와 피플 정책 감독'],
    },
  },
];

const departments: Department[] = [
  {
    id: 'platform',
    label: '플랫폼개발부',
    englishLabel: 'Platform Engineering',
    executiveRole: 'CTO',
    lead: {
      id: 'lead-platform', name: 'ARCHI', englishName: 'ARCHI', role: 'AI 플랫폼팀장', department: '플랫폼개발부', status: '운영중',
      bio: '서비스 아키텍처와 배포 체계를 설계하고 안정적인 제품 기반을 책임집니다.', quote: '빠른 개발은 흔들리지 않는 기반 위에서 가능합니다.',
      reportsTo: 'CTO · ATLAS', avatarIndex: 5, accent: '#2f6fed', skills: ['시스템 설계', 'Backend', 'DevOps', '보안'],
      responsibilities: ['플랫폼 아키텍처 설계', '배포·관측 기준 관리', '9개 AI 전문 좌석 검수'],
    },
    mandate: '제품이 안정적으로 확장될 수 있는 플랫폼과 개발 운영 체계를 만듭니다.',
    accent: '#2f6fed',
    soft: '#edf3ff',
    icon: Code2,
    skills: ['시스템 설계', '개발', 'DevOps'],
    openings: [
      { code: 'PL-02', title: 'AI 시스템 엔지니어' }, { code: 'PL-03', title: 'AI 프론트엔드' },
      { code: 'PL-04', title: 'AI 백엔드' }, { code: 'PL-05', title: 'AI DevOps' },
      { code: 'PL-06', title: 'AI 클라우드 엔지니어' }, { code: 'PL-07', title: 'AI QA 자동화' },
      { code: 'PL-08', title: 'AI 보안 엔지니어' }, { code: 'PL-09', title: 'AI SRE' },
      { code: 'PL-10', title: 'AI 기술지원' },
    ],
  },
  {
    id: 'ai-data', label: 'AI데이터부', englishLabel: 'AI & Data Lab', executiveRole: 'CTO',
    lead: {
      id: 'lead-ai-data', name: 'NEURAL', englishName: 'NEURAL', role: 'AI 데이터팀장', department: 'AI데이터부', status: '운영중',
      bio: '데이터 품질과 AI 모델 운영 기준을 세워 재사용 가능한 지능형 업무 기반을 만듭니다.', quote: '좋은 AI는 좋은 데이터와 명확한 평가 기준에서 시작합니다.',
      reportsTo: 'CTO · ATLAS', avatarIndex: 6, accent: '#5f65d8', skills: ['Data', 'LLM', 'MLOps', '평가'],
      responsibilities: ['AI 모델·데이터 전략 수립', '평가·안전 기준 운영', '자동화 성과 품질 검수'],
    },
    mandate: '데이터 수집부터 AI 모델 평가와 운영 자동화까지 하나의 품질 체계로 관리합니다.',
    accent: '#5f65d8', soft: '#f0f1ff', icon: BrainCircuit, skills: ['AI', '데이터', '자동화'],
    openings: [
      { code: 'AD-02', title: 'AI ML 엔지니어' }, { code: 'AD-03', title: 'AI 데이터 엔지니어' },
      { code: 'AD-04', title: 'AI 분석가' }, { code: 'AD-05', title: 'AI 프롬프트 엔지니어' },
      { code: 'AD-06', title: 'AI MLOps' }, { code: 'AD-07', title: 'AI 평가 전문가' },
      { code: 'AD-08', title: 'AI 데이터 거버넌스' }, { code: 'AD-09', title: 'AI 자동화 설계자' },
      { code: 'AD-10', title: 'AI 리서처' },
    ],
  },
  {
    id: 'product-experience', label: '제품경험부', englishLabel: 'Product Experience', executiveRole: 'CTO',
    lead: {
      id: 'lead-product', name: 'CANVAS', englishName: 'CANVAS', role: 'AI 제품경험팀장', department: '제품경험부', status: '운영중',
      bio: '사용자 문제를 제품 로드맵과 명확한 인터페이스로 바꾸어 출시 경험을 완성합니다.', quote: '좋은 경험은 사용자가 고민할 필요 없는 흐름을 만듭니다.',
      reportsTo: 'CTO · ATLAS', avatarIndex: 7, accent: '#7659bd', skills: ['Product', 'UX', 'Design System', '리서치'],
      responsibilities: ['제품 로드맵 설계', 'UX·디자인 품질 관리', '사용자 검증과 출시 기준 운영'],
    },
    mandate: '고객 문제를 제품 전략, UX, 디자인 시스템으로 연결합니다.',
    accent: '#7659bd', soft: '#f5f0ff', icon: Palette, skills: ['제품', 'UX', '디자인'],
    openings: [
      { code: 'PX-02', title: 'AI 프로덕트 매니저' }, { code: 'PX-03', title: 'AI UX 리서처' },
      { code: 'PX-04', title: 'AI UX 디자이너' }, { code: 'PX-05', title: 'AI UI 디자이너' },
      { code: 'PX-06', title: 'AI 콘텐츠 디자이너' }, { code: 'PX-07', title: 'AI 디자인시스템' },
      { code: 'PX-08', title: 'AI 접근성 전문가' }, { code: 'PX-09', title: 'AI 프로토타이퍼' },
      { code: 'PX-10', title: 'AI 제품 분석가' },
    ],
  },
  {
    id: 'brand-marketing', label: '브랜드마케팅부', englishLabel: 'Brand Marketing', executiveRole: 'CMO',
    lead: {
      id: 'lead-brand', name: 'MUSE', englishName: 'MUSE', role: 'AI 브랜드마케팅팀장', department: '브랜드마케팅부', status: '운영중',
      bio: '브랜드 언어와 콘텐츠 품질을 관리해 모든 고객 접점에서 같은 인상을 만듭니다.', quote: '브랜드는 말하는 방식이 아니라 기억되는 방식입니다.',
      reportsTo: 'CMO · SIGNAL', avatarIndex: 8, accent: '#cf5576', skills: ['Brand', 'Content', 'Campaign', 'Creative'],
      responsibilities: ['브랜드 가이드 운영', '콘텐츠·캠페인 기획', '크리에이티브 품질 승인'],
    },
    mandate: '브랜드 전략과 콘텐츠, 캠페인을 일관된 고객 메시지로 통합합니다.',
    accent: '#cf5576', soft: '#fff0f4', icon: Megaphone, skills: ['브랜드', '콘텐츠', '캠페인'],
    openings: [
      { code: 'BM-02', title: 'AI 브랜드 전략가' }, { code: 'BM-03', title: 'AI 콘텐츠 에디터' },
      { code: 'BM-04', title: 'AI 카피라이터' }, { code: 'BM-05', title: 'AI 크리에이티브' },
      { code: 'BM-06', title: 'AI 영상 기획자' }, { code: 'BM-07', title: 'AI 소셜 매니저' },
      { code: 'BM-08', title: 'AI 캠페인 매니저' }, { code: 'BM-09', title: 'AI PR 매니저' },
      { code: 'BM-10', title: 'AI 브랜드 분석가' },
    ],
  },
  {
    id: 'growth-sales', label: '성장영업부', englishLabel: 'Growth & Sales', executiveRole: 'CMO',
    lead: {
      id: 'lead-growth', name: 'PULSE', englishName: 'PULSE', role: 'AI 성장영업팀장', department: '성장영업부', status: '운영중',
      bio: '고객 획득 실험과 영업 파이프라인을 연결해 측정 가능한 성장을 만듭니다.', quote: '성장은 감이 아니라 반복 가능한 실험의 결과입니다.',
      reportsTo: 'CMO · SIGNAL', avatarIndex: 9, accent: '#d25f45', skills: ['Growth', 'Sales', 'CRM', 'Analytics'],
      responsibilities: ['성장 실험 우선순위 관리', '영업 파이프라인 운영', '매출 전환 지표 검수'],
    },
    mandate: '시장 기회를 실험하고 영업 파이프라인과 매출 전환으로 연결합니다.',
    accent: '#d25f45', soft: '#fff2ee', icon: Rocket, skills: ['성장', '영업', 'CRM'],
    openings: [
      { code: 'GS-02', title: 'AI Growth Manager' }, { code: 'GS-03', title: 'AI 퍼포먼스 마케터' },
      { code: 'GS-04', title: 'AI 세일즈 개발' }, { code: 'GS-05', title: 'AI Account Executive' },
      { code: 'GS-06', title: 'AI CRM 매니저' }, { code: 'GS-07', title: 'AI Revenue Ops' },
      { code: 'GS-08', title: 'AI 파트너십' }, { code: 'GS-09', title: 'AI 시장 리서처' },
      { code: 'GS-10', title: 'AI Growth Analyst' },
    ],
  },
  {
    id: 'customer-success', label: '고객성공부', englishLabel: 'Customer Success', executiveRole: 'CMO',
    lead: {
      id: 'lead-customer', name: 'CARE', englishName: 'CARE', role: 'AI 고객성공팀장', department: '고객성공부', status: '운영중',
      bio: '고객이 제품 가치를 빠르게 경험하도록 온보딩, 지원, 피드백 흐름을 관리합니다.', quote: '고객의 성공이 반복될 때 제품의 성장도 지속됩니다.',
      reportsTo: 'CMO · SIGNAL', avatarIndex: 10, accent: '#a05f8f', skills: ['Onboarding', 'Support', 'VOC', 'Retention'],
      responsibilities: ['고객 온보딩 기준 운영', 'VOC·지원 품질 관리', '유지율과 만족도 개선'],
    },
    mandate: '온보딩부터 지원과 리텐션까지 고객이 성공하는 전체 여정을 운영합니다.',
    accent: '#a05f8f', soft: '#fbf0f8', icon: Headphones, skills: ['고객지원', 'VOC', '리텐션'],
    openings: [
      { code: 'CS-02', title: 'AI 온보딩 매니저' }, { code: 'CS-03', title: 'AI 고객지원' },
      { code: 'CS-04', title: 'AI VOC 분석가' }, { code: 'CS-05', title: 'AI 리텐션 매니저' },
      { code: 'CS-06', title: 'AI 교육 콘텐츠' }, { code: 'CS-07', title: 'AI 기술지원 코디네이터' },
      { code: 'CS-08', title: 'AI 커뮤니티 매니저' }, { code: 'CS-09', title: 'AI 고객품질 담당' },
      { code: 'CS-10', title: 'AI Success Analyst' },
    ],
  },
  {
    id: 'finance-accounting', label: '재무회계부', englishLabel: 'Finance & Accounting', executiveRole: 'CFO',
    lead: {
      id: 'lead-finance', name: 'FIN', englishName: 'FIN', role: 'AI 재무회계팀장', department: '재무회계부', status: '운영중',
      bio: '현금 흐름과 손익, 회계 기준을 투명하게 관리해 신뢰할 수 있는 숫자를 제공합니다.', quote: '정확한 숫자는 더 나은 판단을 가능하게 합니다.',
      reportsTo: 'CFO · VAULT', avatarIndex: 11, accent: '#0d8f73', skills: ['Accounting', 'FP&A', 'Tax', 'Treasury'],
      responsibilities: ['회계·결산 기준 운영', '현금 흐름과 예산 관리', '재무 리포트 품질 검수'],
    },
    mandate: '재무 건전성과 회계 투명성을 관리하고 모든 경영 판단의 수치 기준을 제공합니다.',
    accent: '#0d8f73', soft: '#ebfaf5', icon: CircleDollarSign, skills: ['재무', '회계', '세무'],
    openings: [
      { code: 'FA-02', title: 'AI FP&A' }, { code: 'FA-03', title: 'AI 회계 담당' },
      { code: 'FA-04', title: 'AI 세무 담당' }, { code: 'FA-05', title: 'AI 자금관리' },
      { code: 'FA-06', title: 'AI 예산관리' }, { code: 'FA-07', title: 'AI 원가분석' },
      { code: 'FA-08', title: 'AI 매출관리' }, { code: 'FA-09', title: 'AI 구매분석' },
      { code: 'FA-10', title: 'AI 재무리스크' },
    ],
  },
  {
    id: 'strategy-operations', label: '전략운영부', englishLabel: 'Strategy & Operations', executiveRole: 'CFO',
    lead: {
      id: 'lead-operations', name: 'ORBIT', englishName: 'ORBIT', role: 'AI 전략운영팀장', department: '전략운영부', status: '운영중',
      bio: '전사 목표를 실행 계획과 운영 지표로 전환해 부서 간 우선순위를 맞춥니다.', quote: '전략은 실행 순서와 책임자가 정해질 때 비로소 작동합니다.',
      reportsTo: 'CFO · VAULT', avatarIndex: 12, accent: '#247f91', skills: ['Strategy', 'PMO', 'Process', 'KPI'],
      responsibilities: ['전사 실행계획 관리', '운영 프로세스 최적화', '부서별 KPI 정렬'],
    },
    mandate: '전사 전략을 프로젝트, 프로세스, 운영 지표로 연결해 실행력을 높입니다.',
    accent: '#247f91', soft: '#edf8fa', icon: Workflow, skills: ['전략', 'PMO', '프로세스'],
    openings: [
      { code: 'SO-02', title: 'AI 전략기획' }, { code: 'SO-03', title: 'AI PMO' },
      { code: 'SO-04', title: 'AI 프로세스 설계' }, { code: 'SO-05', title: 'AI KPI 분석가' },
      { code: 'SO-06', title: 'AI 운영 매니저' }, { code: 'SO-07', title: 'AI 문서관리' },
      { code: 'SO-08', title: 'AI 구매운영' }, { code: 'SO-09', title: 'AI 리스크 운영' },
      { code: 'SO-10', title: 'AI Business Analyst' },
    ],
  },
  {
    id: 'legal-compliance', label: '법무준법부', englishLabel: 'Legal & Compliance', executiveRole: 'CLO',
    lead: {
      id: 'lead-legal', name: 'GUARD', englishName: 'GUARD', role: 'AI 법무준법팀장', department: '법무준법부', status: '운영중',
      bio: '계약과 규제 리스크를 사전에 점검하고 안전하게 실행할 수 있는 기준을 만듭니다.', quote: '예방 가능한 리스크는 실행 전에 제거해야 합니다.',
      reportsTo: 'CLO · LEX', avatarIndex: 13, accent: '#9a6b26', skills: ['Contract', 'Compliance', 'Privacy', 'IP'],
      responsibilities: ['계약 검토 기준 운영', '규제·준법 모니터링', 'AI 법무 결과물 승인'],
    },
    mandate: '계약, 규제, 개인정보, 지식재산 리스크를 사전에 통제합니다.',
    accent: '#9a6b26', soft: '#fff7e7', icon: Scale, skills: ['법무', '준법', '개인정보'],
    openings: [
      { code: 'LC-02', title: 'AI 계약관리' }, { code: 'LC-03', title: 'AI 컴플라이언스' },
      { code: 'LC-04', title: 'AI 개인정보보호' }, { code: 'LC-05', title: 'AI 지식재산' },
      { code: 'LC-06', title: 'AI 정책 리서치' }, { code: 'LC-07', title: 'AI 규제 모니터링' },
      { code: 'LC-08', title: 'AI 분쟁관리' }, { code: 'LC-09', title: 'AI 문서심사' },
      { code: 'LC-10', title: 'AI Legal Ops' },
    ],
  },
  {
    id: 'people-culture', label: '피플문화부', englishLabel: 'People & Culture', executiveRole: 'CLO',
    lead: {
      id: 'lead-people', name: 'HARMONY', englishName: 'HARMONY', role: 'AI 피플문화팀장', department: '피플문화부', status: '운영중',
      bio: '채용과 온보딩, 성과, 학습 체계를 연결해 사람과 AI가 함께 일하는 문화를 설계합니다.', quote: '좋은 문화는 누구나 같은 기준으로 성장할 수 있게 합니다.',
      reportsTo: 'CLO · LEX', avatarIndex: 14, accent: '#8f668c', skills: ['Recruiting', 'Culture', 'L&D', 'People Ops'],
      responsibilities: ['AI·인재 채용 체계 운영', '온보딩·학습 프로그램 관리', '성과·문화 지표 검수'],
    },
    mandate: '채용부터 성장과 문화까지 사람과 AI가 함께 일하는 운영 체계를 만듭니다.',
    accent: '#8f668c', soft: '#faf1f8', icon: UsersRound, skills: ['채용', '문화', 'People Ops'],
    openings: [
      { code: 'PC-02', title: 'AI 채용 매니저' }, { code: 'PC-03', title: 'AI People Ops' },
      { code: 'PC-04', title: 'AI 온보딩 매니저' }, { code: 'PC-05', title: 'AI L&D 매니저' },
      { code: 'PC-06', title: 'AI 성과관리' }, { code: 'PC-07', title: 'AI 조직문화 담당' },
      { code: 'PC-08', title: 'AI 노무 담당' }, { code: 'PC-09', title: 'AI People Analyst' },
      { code: 'PC-10', title: 'AI Engagement Manager' },
    ],
  },
];

function getOpenPositionProfile(department: Department, position: OpenPosition): StaffProfile {
  return {
    id: `opening-${department.id}-${position.code}`,
    name: position.title,
    englishName: position.code,
    role: `${position.code} · AI STAFF`,
    department: department.label,
    status: '구인중',
    bio: `${department.label}에서 ${position.title} 전문 과업을 맡을 예정인 AI 직원 좌석입니다. 현재 역할과 권한 범위를 설계하고 있습니다.`,
    quote: '팀장 검수 기준과 승인된 권한 안에서 정확하고 반복 가능한 결과를 만듭니다.',
    reportsTo: `${department.lead.role} · ${department.lead.name}`,
    avatarIndex: null,
    accent: department.accent,
    skills: [position.title.replace(/^AI\s*/, ''), ...department.skills],
    responsibilities: [`${position.title} 전문 과업 수행`, '팀장 검수 기준에 따른 결과물 제출', '보안·준법·데이터 정책 준수'],
  };
}

const operatingSteps: OperatingStep[] = [
  {
    index: '01',
    title: 'CEO · 방향 결정',
    body: '비전과 우선순위, 최종 책임의 기준을 한 문장으로 정렬합니다.',
    icon: Crown,
  },
  {
    index: '02',
    title: 'C-Suite · 전략 번역',
    body: 'CTO·CMO·CFO·CLO가 목표를 각 전문 영역의 실행 기준으로 바꿉니다.',
    icon: BriefcaseBusiness,
  },
  {
    index: '03',
    title: 'Team Lead · 업무 배분',
    body: '10개 부서의 AI 팀장이 각 10개 좌석의 역할, 품질, 협업 순서를 관리합니다.',
    icon: Workflow,
  },
  {
    index: '04',
    title: 'AI Staff · 결과 전달',
    body: '채용된 AI 직원은 승인된 권한 안에서 반복 업무와 전문 과업을 수행합니다.',
    icon: BrainCircuit,
  },
];

const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.06 },
  },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: 'easeOut' },
  },
};

const PROFILE_ATLAS_PATH = '/corp/staff-ai-leaders-v1.webp';

function ProfilePhoto({ profile, size = 56, eager = false }: { profile: StaffProfile; size?: number; eager?: boolean }) {
  if (profile.avatarIndex === null) {
    return (
      <VacantPhotoFrame $accent={profile.accent} $size={size} aria-label="프로필 사진 등록 예정">
        <UserRoundPlus size={Math.max(18, Math.round(size * 0.32))} strokeWidth={1.9} aria-hidden="true" />
      </VacantPhotoFrame>
    );
  }

  const column = profile.avatarIndex % 4;
  const row = Math.floor(profile.avatarIndex / 4);

  return (
    <ProfilePhotoFrame $accent={profile.accent} $size={size}>
      <ProfilePhotoFallback aria-hidden="true">
        <UserRound size={Math.max(18, Math.round(size * 0.34))} strokeWidth={1.8} />
      </ProfilePhotoFallback>
      <ProfileAtlasImage
        src={PROFILE_ATLAS_PATH}
        alt={`${profile.name} 프로필 사진`}
        width={1024}
        height={1024}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        $column={column}
        $row={row}
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    </ProfilePhotoFrame>
  );
}

export function StaffIntroOrgChart({ editor }: StaffIntroOrgChartProps = {}) {
  const reduceMotion = useReducedMotion();
  const [activeDepartmentId, setActiveDepartmentId] = useState<DepartmentId>('platform');
  const [selectedProfile, setSelectedProfile] = useState<StaffProfile | null>(null);
  const lastProfileTriggerRef = useRef<HTMLElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const activeDepartment = departments.find((department) => department.id === activeDepartmentId) ?? departments[0];
  const activeExecutive = executiveGroups.find((group) => group.departmentIds.includes(activeDepartmentId)) ?? executiveGroups[0];
  const ActiveDepartmentIcon = activeDepartment.icon;

  const closeProfile = useCallback(() => {
    setSelectedProfile(null);
    window.setTimeout(() => lastProfileTriggerRef.current?.focus(), 0);
  }, []);

  const openProfile = useCallback((profile: StaffProfile, trigger: HTMLElement) => {
    lastProfileTriggerRef.current = trigger;
    setSelectedProfile(profile);
  }, []);

  useEffect(() => {
    if (!selectedProfile) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => drawerCloseRef.current?.focus(), 0);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeProfile();
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeProfile, selectedProfile]);

  const handleDrawerKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!firstElement || !lastElement) return;

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <Page id="staff-intro-page" aria-labelledby="staff-intro-title">
      <StaffIntroMotionStyles />
      <PageMotion variants={pageVariants} initial={reduceMotion ? false : 'hidden'} animate="visible">
        <CorpEditableSection blockId="staff-hero" label="첫 화면 수정" editor={editor}>
          <Hero variants={sectionVariants}>
            <HeroGridPattern aria-hidden="true" />
            <HeroCopy>
              <Eyebrow $inverse>
                <Sparkles size={15} strokeWidth={2.4} aria-hidden="true" />
                Premium Team Directory
              </Eyebrow>
              <HeroTitle id="staff-intro-title">
                직원소개
                <span>AI 조직을 역할부터 설계합니다.</span>
              </HeroTitle>
              <HeroDescription>
                CEO의 최종 결정이 네 명의 임원과 10개 전문 부서의 AI 팀장에게 이어지는 피라미드 조직입니다. 각 부서는
                팀장 1명과 구인중인 AI 팀원 9명, 총 10명 정원으로 운영됩니다.
              </HeroDescription>
              <HeroActions>
                <PrimaryLink href="#organization-chart">
                  조직도 보기
                  <ArrowDown size={17} strokeWidth={2.4} aria-hidden="true" />
                </PrimaryLink>
                <HeroStatus>
                  <span aria-hidden="true" />
                  90개 포지션 구인중
                </HeroStatus>
              </HeroActions>
            </HeroCopy>

            <CapacityPanel aria-label="AI 조직 정원 요약">
              <CapacityTopline>
                <span>AI Workforce Plan</span>
                <BadgeCheck size={19} strokeWidth={2.4} aria-hidden="true" />
              </CapacityTopline>
              <CapacityMain>
                <CapacityNumber>
                  <strong>105</strong>
                  <span>total seats</span>
                </CapacityNumber>
                <CapacityLegend>
                  <li>
                    <span />
                    CEO · C-Suite <strong>5</strong>
                  </li>
                  <li>
                    <span />
                    AI 부서 정원 <strong>100</strong>
                  </li>
                  <li>
                    <span />
                    현재 구인중 <strong>90</strong>
                  </li>
                </CapacityLegend>
              </CapacityMain>
              <CapacityProgress aria-label="전체 105개 좌석 중 15개 핵심 리더 좌석 운영중">
                <span style={{ width: '14.3%' }} />
              </CapacityProgress>
              <CapacityFootnote>
                <UserRoundCheck size={15} strokeWidth={2.4} aria-hidden="true" />
                핵심 구성원 15명 배치 완료
              </CapacityFootnote>
            </CapacityPanel>
          </Hero>
        </CorpEditableSection>

        <MetricRail variants={sectionVariants} aria-label="조직 현황">
          <MetricItem>
            <MetricIcon><Crown size={19} aria-hidden="true" /></MetricIcon>
            <div><strong>1</strong><span>CEO</span></div>
          </MetricItem>
          <MetricItem>
            <MetricIcon><BriefcaseBusiness size={19} aria-hidden="true" /></MetricIcon>
            <div><strong>4</strong><span>C-Suite 임원</span></div>
          </MetricItem>
          <MetricItem>
            <MetricIcon><Layers3 size={19} aria-hidden="true" /></MetricIcon>
            <div><strong>10</strong><span>AI 전문 부서</span></div>
          </MetricItem>
          <MetricItem>
            <MetricIcon><UsersRound size={19} aria-hidden="true" /></MetricIcon>
            <div><strong>10</strong><span>부서별 정원</span></div>
          </MetricItem>
          <MetricItem $highlight>
            <MetricIcon><UserRoundPlus size={19} aria-hidden="true" /></MetricIcon>
            <div><strong>90</strong><span>구인중</span></div>
          </MetricItem>
        </MetricRail>

        <CorpEditableSection blockId="staff-people" label="조직도 수정" editor={editor}>
          <OrganizationSection id="organization-chart" variants={sectionVariants} aria-labelledby="org-chart-title">
            <SectionHeader>
              <div>
                <Eyebrow>
                  <Network size={15} strokeWidth={2.4} aria-hidden="true" />
                  Pyramid Org Chart
                </Eyebrow>
                <h2 id="org-chart-title">CEO에서 팀까지, 책임이 선명한 조직</h2>
                <p>직원을 선택하면 상세 프로필을, 팀장을 선택하면 담당 부서의 10개 AI 좌석을 함께 확인할 수 있습니다.</p>
              </div>
              <HierarchyLegend aria-label="조직도 단계">
                <span><i />CEO</span>
                <ArrowRight size={14} aria-hidden="true" />
                <span><i />EXECUTIVE</span>
                <ArrowRight size={14} aria-hidden="true" />
                <span><i />TEAM LEAD</span>
              </HierarchyLegend>
            </SectionHeader>

            <OrgCanvas aria-label="CEO, 4명 임원, 10개 부서 팀장 피라미드 조직도">
              <LevelMarker><span>LEVEL 01</span><strong>Decision</strong></LevelMarker>
              <CeoNode
                type="button"
                onClick={(event) => openProfile(CEO_PROFILE, event.currentTarget)}
                aria-label="그냥돼지 CEO 상세 프로필 열기"
              >
                <ProfilePhoto profile={CEO_PROFILE} size={66} eager />
                <NodeIdentity>
                  <span>CHIEF EXECUTIVE OFFICER</span>
                  <strong>그냥돼지 <em>CEO</em></strong>
                  <p>비전 · 우선순위 · 최종 책임</p>
                </NodeIdentity>
                <NodeStatus><span />프로필 보기</NodeStatus>
              </CeoNode>

              <BranchGrid role="list" aria-label="C-Suite 및 부서 팀장">
                {executiveGroups.map((group) => {
                  const isActive = group.role === activeExecutive.role;
                  const groupDepartments = departments.filter((department) => group.departmentIds.includes(department.id));

                  return (
                    <BranchColumn
                      key={group.role}
                      role="listitem"
                      $accent={group.profile.accent}
                      $active={isActive}
                      data-performance-region="staff-org-node"
                    >
                      <ExecutiveButton
                        type="button"
                        $accent={group.profile.accent}
                        $soft={`color-mix(in srgb, ${group.profile.accent} 8%, white)`}
                        $active={isActive}
                        onClick={(event) => openProfile(group.profile, event.currentTarget)}
                        aria-label={`${group.profile.name} ${group.role} 상세 프로필 열기`}
                      >
                        <ExecutiveTopline>
                          <ProfilePhoto profile={group.profile} size={52} eager />
                          <ExecutiveStatus><span />EXECUTIVE AI</ExecutiveStatus>
                        </ExecutiveTopline>
                        <ExecutiveRole>{group.role}</ExecutiveRole>
                        <ExecutiveName>{group.profile.name}</ExecutiveName>
                        <ExecutiveFocus>{group.focus}</ExecutiveFocus>
                        <ViewBranch>
                          상세정보
                          <ArrowRight size={15} strokeWidth={2.5} aria-hidden="true" />
                        </ViewBranch>
                      </ExecutiveButton>

                      <BranchConnector aria-hidden="true"><ArrowDown size={14} strokeWidth={2.4} /></BranchConnector>

                      <DepartmentBranchList>
                        {groupDepartments.map((department) => {
                          const departmentIsActive = department.id === activeDepartmentId;

                          return (
                            <LeadNode
                              key={department.id}
                              type="button"
                              $accent={department.accent}
                              $active={departmentIsActive}
                              onClick={(event) => {
                                setActiveDepartmentId(department.id);
                                openProfile(department.lead, event.currentTarget);
                              }}
                              aria-label={`${department.lead.name} ${department.lead.role} 상세 프로필 열기`}
                              aria-pressed={departmentIsActive}
                            >
                              <ProfilePhoto profile={department.lead} size={42} />
                              <LeadNodeBody>
                                <LeadNodeTopline>
                                  <span>TEAM LEAD · {department.label}</span>
                                  <UserRoundCheck size={14} strokeWidth={2.4} aria-hidden="true" />
                                </LeadNodeTopline>
                                <strong>{department.lead.name}</strong>
                                <p>{department.lead.role}</p>
                                <LeadCapacity>
                                  <span><i />1 운영</span>
                                  <span><i />9 구인중</span>
                                </LeadCapacity>
                              </LeadNodeBody>
                            </LeadNode>
                          );
                        })}
                      </DepartmentBranchList>
                    </BranchColumn>
                  );
                })}
              </BranchGrid>
            </OrgCanvas>
          </OrganizationSection>
        </CorpEditableSection>

        <CorpEditableSection blockId="staff-departments" label="부서 정원 수정" editor={editor}>
          <DepartmentSection variants={sectionVariants} aria-labelledby="department-roster-title">
            <DepartmentHeading>
              <div>
                <Eyebrow>
                  <UsersRound size={15} strokeWidth={2.4} aria-hidden="true" />
                  Department Roster
                </Eyebrow>
                <h2 id="department-roster-title">10개 부서 · 각 10명의 AI 직원 구성</h2>
                <p>부서 탭을 선택해 팀장 프로필과 구인중인 9개 전문 포지션을 확인할 수 있습니다.</p>
              </div>
              <RosterSummary>
                <strong>1 / 10</strong>
                <span>부서별 현재 충원율</span>
              </RosterSummary>
            </DepartmentHeading>

            <DepartmentTabs role="tablist" aria-label="AI 부서 선택">
              {departments.map((department) => {
                const Icon = department.icon;
                const isActive = department.id === activeDepartmentId;

                return (
                  <DepartmentTab
                    key={department.id}
                    id={`department-tab-${department.id}`}
                    type="button"
                    role="tab"
                    $accent={department.accent}
                    $active={isActive}
                    aria-selected={isActive}
                    aria-controls="active-department-panel"
                    onClick={() => setActiveDepartmentId(department.id)}
                  >
                    <Icon size={17} strokeWidth={2.3} aria-hidden="true" />
                    <span>{department.label}</span>
                    <em>1/10</em>
                  </DepartmentTab>
                );
              })}
            </DepartmentTabs>

            <TeamPanel
              id="active-department-panel"
              role="tabpanel"
              aria-labelledby={`department-tab-${activeDepartment.id}`}
              $accent={activeDepartment.accent}
              $soft={activeDepartment.soft}
            >
              <TeamPanelHeader>
                <DepartmentTitleGroup>
                  <DepartmentMark $accent={activeDepartment.accent} $soft={activeDepartment.soft}>
                    <ActiveDepartmentIcon size={24} strokeWidth={2.2} aria-hidden="true" />
                  </DepartmentMark>
                  <div>
                    <span>{activeDepartment.englishLabel}</span>
                    <h3>{activeDepartment.label}</h3>
                    <p>{activeDepartment.mandate}</p>
                  </div>
                </DepartmentTitleGroup>
                <WorkforceMeter>
                  <div><span>운영 좌석</span><strong>1 / 10</strong></div>
                  <MeterTrack
                    role="progressbar"
                    aria-label={`${activeDepartment.label} 충원율 10%`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={10}
                  >
                    <span />
                  </MeterTrack>
                  <small>9명 구인중</small>
                </WorkforceMeter>
              </TeamPanelHeader>

              <RosterGrid>
                <LeadProfile
                  type="button"
                  $accent={activeDepartment.accent}
                  onClick={(event) => openProfile(activeDepartment.lead, event.currentTarget)}
                  aria-label={`${activeDepartment.lead.name} ${activeDepartment.lead.role} 상세 프로필 열기`}
                >
                  <LeadProfileBadge><BadgeCheck size={14} strokeWidth={2.5} aria-hidden="true" />배치 완료</LeadProfileBadge>
                  <ProfilePhoto profile={activeDepartment.lead} size={82} />
                  <span>SEAT 01 · TEAM LEAD</span>
                  <h4>{activeDepartment.lead.name}</h4>
                  <p>{activeDepartment.lead.role}</p>
                  <LeadProfileMeta>
                    <span><Target size={14} aria-hidden="true" />품질 기준 수립</span>
                    <span><Workflow size={14} aria-hidden="true" />업무 배분·검수</span>
                  </LeadProfileMeta>
                  <LeadProfileAction>상세 프로필 <ArrowRight size={15} aria-hidden="true" /></LeadProfileAction>
                </LeadProfile>

                <OpenRoster>
                  <OpenRosterHeader>
                    <div>
                      <span>OPEN POSITIONS</span>
                      <strong>AI 팀원 9명 · 구인중</strong>
                    </div>
                    <HiringBadge><span />채용 설계중</HiringBadge>
                  </OpenRosterHeader>
                  <OpenSeatGrid>
                    {activeDepartment.openings.map((position) => (
                      <OpenSeatCard
                        key={position.code}
                        type="button"
                        onClick={(event) => openProfile(getOpenPositionProfile(activeDepartment, position), event.currentTarget)}
                        aria-label={`${position.title}, 구인중 상세정보 열기`}
                      >
                        <SeatTopline>
                          <SeatCode>{position.code}</SeatCode>
                          <UserRoundPlus size={15} strokeWidth={2.2} aria-hidden="true" />
                        </SeatTopline>
                        <strong>{position.title}</strong>
                        <span><i />구인중</span>
                      </OpenSeatCard>
                    ))}
                  </OpenSeatGrid>
                </OpenRoster>
              </RosterGrid>

              <GovernanceNote>
                <ShieldCheck size={19} strokeWidth={2.3} aria-hidden="true" />
                <div>
                  <strong>Human-in-the-loop 운영 원칙</strong>
                  <span>모든 AI 직원은 팀장 검수와 임원 승인 범위 안에서만 업무를 수행합니다.</span>
                </div>
              </GovernanceNote>
            </TeamPanel>
          </DepartmentSection>
        </CorpEditableSection>

        <CorpEditableSection blockId="staff-flow" label="운영 흐름 수정" editor={editor}>
          <OperatingSection variants={sectionVariants} aria-labelledby="operating-model-title">
            <OperatingHeader>
              <div>
                <Eyebrow $inverse>
                  <ChartNoAxesCombined size={15} strokeWidth={2.4} aria-hidden="true" />
                  Operating Model
                </Eyebrow>
                <h2 id="operating-model-title">결정은 위에서, 실행은 빠르게</h2>
              </div>
              <p>의사결정 권한과 검수 책임을 분리해 AI 조직의 속도와 안전성을 함께 관리합니다.</p>
            </OperatingHeader>
            <FlowGrid>
              {operatingSteps.map((step) => {
                const Icon = step.icon;

                return (
                  <FlowStep key={step.index} data-performance-region="staff-flow-step">
                    <FlowStepTopline><span>{step.index}</span><Icon size={19} strokeWidth={2.2} aria-hidden="true" /></FlowStepTopline>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </FlowStep>
                );
              })}
            </FlowGrid>
            <HiringCallout>
              <div>
                <Gavel size={22} strokeWidth={2.2} aria-hidden="true" />
                <span><strong>90개의 AI 포지션</strong>을 단계적으로 채용할 준비가 되어 있습니다.</span>
              </div>
              <HiringLink href="/corp/careers/jobs">
                채용 계획 보기
                <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
              </HiringLink>
            </HiringCallout>
          </OperatingSection>
        </CorpEditableSection>
      </PageMotion>

      <AnimatePresence>
        {selectedProfile ? (
          <ProfileDrawerLayer
            key={selectedProfile.id}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.18 }}
          >
            <DrawerScrimClose type="button" onClick={closeProfile} aria-label="상세 프로필 닫기" />
            <ProfileDrawer
              role="dialog"
              aria-modal="true"
              aria-labelledby="staff-drawer-title"
              initial={reduceMotion ? false : { x: 36, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 36, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: 'easeOut' }}
              onKeyDown={handleDrawerKeyDown}
            >
              <DrawerHeader>
                <div>
                  <span>AI STAFF PROFILE</span>
                  <strong>{selectedProfile.department}</strong>
                </div>
                <DrawerCloseButton ref={drawerCloseRef} type="button" onClick={closeProfile} aria-label="상세 프로필 닫기">
                  <X size={20} strokeWidth={2.2} aria-hidden="true" />
                </DrawerCloseButton>
              </DrawerHeader>

              <DrawerBody>
                <DrawerIdentity $accent={selectedProfile.accent}>
                  <ProfilePhoto profile={selectedProfile} size={128} eager />
                  <DrawerIdentityCopy>
                    <DrawerStatus $open={selectedProfile.status === '구인중'}>
                      <span />{selectedProfile.status}
                    </DrawerStatus>
                    <span>{selectedProfile.englishName}</span>
                    <h2 id="staff-drawer-title">{selectedProfile.name}</h2>
                    <strong>{selectedProfile.role}</strong>
                  </DrawerIdentityCopy>
                </DrawerIdentity>

                <DrawerQuote>
                  <Sparkles size={18} strokeWidth={2.1} aria-hidden="true" />
                  <p>{selectedProfile.quote}</p>
                </DrawerQuote>

                <DrawerSection>
                  <span>PROFILE SUMMARY</span>
                  <p>{selectedProfile.bio}</p>
                </DrawerSection>

                <DrawerMetaGrid>
                  <DrawerMetaItem>
                    <span>소속</span>
                    <strong>{selectedProfile.department}</strong>
                  </DrawerMetaItem>
                  <DrawerMetaItem>
                    <span>보고 체계</span>
                    <strong>{selectedProfile.reportsTo}</strong>
                  </DrawerMetaItem>
                </DrawerMetaGrid>

                <DrawerSection>
                  <span>CORE SKILLS</span>
                  <DrawerSkillList>
                    {selectedProfile.skills.map((skill) => <li key={skill}>{skill}</li>)}
                  </DrawerSkillList>
                </DrawerSection>

                <DrawerSection>
                  <span>RESPONSIBILITIES</span>
                  <ResponsibilityList>
                    {selectedProfile.responsibilities.map((responsibility) => (
                      <li key={responsibility}>
                        <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden="true" />
                        <span>{responsibility}</span>
                      </li>
                    ))}
                  </ResponsibilityList>
                </DrawerSection>
              </DrawerBody>

              <DrawerFooter>
                {selectedProfile.status === '구인중' ? (
                  <DrawerPrimaryLink href="/corp/careers/jobs">
                    채용정보 확인
                    <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
                  </DrawerPrimaryLink>
                ) : (
                  <DrawerPrimaryButton type="button" onClick={closeProfile}>프로필 확인 완료</DrawerPrimaryButton>
                )}
              </DrawerFooter>
            </ProfileDrawer>
          </ProfileDrawerLayer>
        ) : null}
      </AnimatePresence>
    </Page>
  );
}

const Page = styled.main`
  --org-ink: #13201d;
  --org-muted: #66736f;
  --org-line: #d9e1de;
  --org-surface: #ffffff;
  --org-canvas: #f3f6f5;
  --org-primary: #0f6b58;
  --org-primary-strong: #084c3f;
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--org-ink);
  background:
    linear-gradient(rgba(19, 32, 29, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(19, 32, 29, 0.025) 1px, transparent 1px),
    #edf1f0;
  background-size: 32px 32px;
  font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
`;

const PageMotion = styled(motion.div)`
  position: relative;
  width: min(1180px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  margin: 0 auto;
  padding: 32px 28px 72px;

  @media (max-width: 760px) {
    gap: 18px;
    padding: 16px 14px 48px;
  }
`;

const ProfilePhotoFrame = styled.div<{ $accent: string; $size: number }>`
  position: relative;
  flex: 0 0 auto;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, ${(props) => props.$accent} 34%, white);
  border-radius: 28%;
  background: #dce6e2;
  box-shadow: 0 8px 20px color-mix(in srgb, ${(props) => props.$accent} 14%, transparent);
`;

const ProfilePhotoFallback = styled.span`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #697a74;
  background: linear-gradient(145deg, #edf3f1, #d9e4e0);
`;

const ProfileAtlasImage = styled.img<{ $column: number; $row: number }>`
  position: absolute;
  z-index: 1;
  top: ${(props) => props.$row * -100}%;
  left: ${(props) => props.$column * -100}%;
  width: 400%;
  max-width: none;
  height: 400%;
  object-fit: cover;
  display: block;
`;

const VacantPhotoFrame = styled.div<{ $accent: string; $size: number }>`
  flex: 0 0 auto;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  display: grid;
  place-items: center;
  border: 1px dashed color-mix(in srgb, ${(props) => props.$accent} 50%, #c6d2ce);
  border-radius: 28%;
  color: ${(props) => props.$accent};
  background:
    linear-gradient(135deg, color-mix(in srgb, ${(props) => props.$accent} 10%, white), #ffffff);
`;

const Hero = styled(motion.section)`
  position: relative;
  min-height: 430px;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  gap: 36px;
  align-items: center;
  overflow: hidden;
  padding: 48px;
  border: 1px solid rgba(119, 215, 189, 0.2);
  border-radius: 30px;
  color: #f5fbf9;
  background:
    radial-gradient(circle at 80% 15%, rgba(119, 215, 189, 0.14), transparent 32%),
    linear-gradient(135deg, #071313 0%, #102422 58%, #0b1918 100%);
  box-shadow: 0 24px 70px rgba(15, 39, 34, 0.16);

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  @media (max-width: 760px) {
    min-height: auto;
    padding: 28px 22px 22px;
    border-radius: 24px;
  }
`;

const HeroGridPattern = styled.div`
  position: absolute;
  inset: 0;
  opacity: 0.4;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(119, 215, 189, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(119, 215, 189, 0.055) 1px, transparent 1px);
  background-size: 38px 38px;
  mask-image: linear-gradient(90deg, #000, transparent 72%);
`;

const HeroCopy = styled.div`
  position: relative;
  z-index: 1;
  min-width: 0;
`;

const Eyebrow = styled.span<{ $inverse?: boolean }>`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: ${(props) => (props.$inverse ? '#8de6cd' : 'var(--org-primary)')};
  font-size: 0.74rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.11em;
  text-transform: uppercase;
`;

const HeroTitle = styled.h1`
  display: grid;
  gap: 10px;
  margin: 20px 0 0;
  color: #ffffff;
  font-size: 4.1rem;
  font-weight: 950;
  line-height: 0.98;
  letter-spacing: -0.02em;
  word-break: keep-all;
  text-wrap: balance;

  span {
    max-width: 650px;
    color: rgba(232, 246, 241, 0.74);
    font-size: 1.08rem;
    font-weight: 760;
    line-height: 1.5;
    letter-spacing: 0;
  }

  @media (max-width: 760px) {
    margin-top: 16px;
    font-size: 2.7rem;

    span {
      font-size: 0.94rem;
    }
  }
`;

const HeroDescription = styled.p`
  max-width: 670px;
  margin: 22px 0 0;
  color: rgba(226, 240, 235, 0.72);
  font-size: 0.97rem;
  font-weight: 650;
  line-height: 1.82;
  word-break: keep-all;

  @media (max-width: 760px) {
    margin-top: 18px;
    font-size: 0.9rem;
    line-height: 1.72;
  }
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 28px;
`;

const PrimaryLink = styled(Link)`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 18px;
  border-radius: 12px;
  color: #062c24;
  background: #84e5ca;
  box-shadow: 0 12px 28px rgba(56, 189, 153, 0.2);
  font-size: 0.84rem;
  font-weight: 900;
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(132, 229, 202, 0.22);
  transition: transform 160ms ease, background 160ms ease;

  &:hover {
    transform: translateY(-2px);
    background: #a1efd9;
  }

  &:focus-visible {
    outline: 3px solid #ffffff;
    outline-offset: 3px;
  }
`;

const HeroStatus = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(237, 248, 245, 0.72);
  font-size: 0.8rem;
  font-weight: 800;

  > span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ffbf69;
    box-shadow: 0 0 0 5px rgba(255, 191, 105, 0.12);
  }
`;

const CapacityPanel = styled.aside`
  position: relative;
  z-index: 1;
  min-width: 0;
  padding: 24px;
  border: 1px solid rgba(137, 228, 203, 0.18);
  border-radius: 22px;
  background: rgba(235, 250, 245, 0.07);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);

  @media (max-width: 760px) {
    padding: 20px;
  }
`;

const CapacityTopline = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: #8de6cd;

  span {
    font-size: 0.69rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
`;

const CapacityMain = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 24px;
  align-items: center;
  margin-top: 28px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
    gap: 18px;
  }
`;

const CapacityNumber = styled.div`
  display: grid;
  gap: 2px;
  font-variant-numeric: tabular-nums;

  strong {
    color: #ffffff;
    font-size: 4rem;
    font-weight: 950;
    line-height: 0.9;
  }

  span {
    color: rgba(224, 240, 235, 0.52);
    font-size: 0.65rem;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
`;

const CapacityLegend = styled.ul`
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 7px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    color: rgba(232, 244, 240, 0.68);
    font-size: 0.72rem;
    font-weight: 720;
  }

  li > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #77d7bd;
  }

  li:nth-child(2) > span { background: #75a6ff; }
  li:nth-child(3) > span { background: #ffbf69; }
  strong { color: #ffffff; font-size: 0.82rem; }
`;

const CapacityProgress = styled.div`
  height: 5px;
  margin-top: 26px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #77d7bd, #b4f1df);
  }
`;

const CapacityFootnote = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
  color: rgba(230, 244, 239, 0.66);
  font-size: 0.72rem;
  font-weight: 800;
`;

const MetricRail = styled(motion.section)`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--org-line);
  border-radius: 18px;
  background: var(--org-line);
  box-shadow: 0 12px 36px rgba(25, 50, 43, 0.06);

  @media (max-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const MetricItem = styled.article<{ $highlight?: boolean }>`
  min-width: 0;
  min-height: 98px;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 20px;
  background: ${(props) => (props.$highlight ? '#fff8ed' : '#ffffff')};
  font-variant-numeric: tabular-nums;

  &:last-child {
    @media (max-width: 860px) {
      grid-column: 1 / -1;
    }
  }

  > div:last-child {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  strong {
    color: var(--org-ink);
    font-size: 1.55rem;
    font-weight: 950;
    line-height: 1;
  }

  span {
    color: var(--org-muted);
    font-size: 0.72rem;
    font-weight: 800;
    white-space: nowrap;
  }

  @media (max-width: 520px) {
    min-height: 86px;
    padding: 16px;
  }
`;

const MetricIcon = styled.div`
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: var(--org-primary);
  background: #eaf5f1;
`;

const OrganizationSection = styled(motion.section)`
  padding: 34px;
  border: 1px solid var(--org-line);
  border-radius: 26px;
  background: var(--org-surface);
  box-shadow: 0 18px 50px rgba(25, 50, 43, 0.07);
  scroll-margin-top: 20px;

  @media (max-width: 760px) {
    padding: 22px 16px;
    border-radius: 22px;
  }
`;

const SectionHeader = styled.header`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 28px;

  > div:first-child { min-width: 0; }

  h2 {
    margin: 12px 0 0;
    color: var(--org-ink);
    font-size: 2rem;
    font-weight: 950;
    line-height: 1.22;
    letter-spacing: -0.015em;
    word-break: keep-all;
    text-wrap: balance;
  }

  p {
    margin: 10px 0 0;
    color: var(--org-muted);
    font-size: 0.86rem;
    font-weight: 650;
    line-height: 1.65;
    word-break: keep-all;
  }

  @media (max-width: 820px) {
    align-items: start;
    flex-direction: column;

    h2 { font-size: 1.55rem; }
  }
`;

const HierarchyLegend = styled.div`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--org-line);
  border-radius: 11px;
  background: #f7f9f8;
  color: #7b8783;

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.59rem;
    font-weight: 900;
    letter-spacing: 0.06em;
  }

  i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--org-primary);
  }

  @media (max-width: 520px) {
    width: 100%;
    justify-content: space-between;
    gap: 4px;
  }
`;

const OrgCanvas = styled.div`
  position: relative;
  margin-top: 28px;
  padding: 34px 20px 26px;
  overflow: hidden;
  border: 1px solid #e2e8e5;
  border-radius: 20px;
  background:
    linear-gradient(rgba(23, 70, 58, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(23, 70, 58, 0.035) 1px, transparent 1px),
    #f6f8f7;
  background-size: 24px 24px;

  @media (max-width: 760px) {
    padding: 24px 14px 18px;
  }
`;

const LevelMarker = styled.div`
  position: absolute;
  top: 20px;
  left: 20px;
  display: grid;
  gap: 3px;

  span {
    color: var(--org-primary);
    font-size: 0.58rem;
    font-weight: 950;
    letter-spacing: 0.12em;
  }

  strong {
    color: #8b9692;
    font-size: 0.66rem;
    font-weight: 800;
  }

  @media (max-width: 760px) { display: none; }
`;

const CeoNode = styled.button`
  position: relative;
  width: min(420px, 100%);
  min-height: 118px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 15px;
  align-items: center;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid rgba(119, 215, 189, 0.28);
  border-radius: 18px;
  color: #f1f8f5;
  background: #0c201c;
  box-shadow: 0 16px 34px rgba(14, 39, 32, 0.15);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;

  &:hover {
    transform: translateY(-3px);
    border-color: rgba(119, 215, 189, 0.62);
    box-shadow: 0 20px 40px rgba(14, 39, 32, 0.22);
  }

  &:focus-visible {
    outline: 3px solid #77d7bd;
    outline-offset: 4px;
  }

  &::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    width: 1px;
    height: 34px;
    background: #9bb3ab;
  }

  @media (max-width: 640px) {
    grid-template-columns: auto minmax(0, 1fr);

    &::after { left: 28px; height: 32px; }
  }
`;

const NodeIdentity = styled.div`
  min-width: 0;

  > span {
    color: #8de6cd;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.11em;
  }

  strong {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin-top: 5px;
    color: #ffffff;
    font-size: 1.25rem;
    font-weight: 950;
  }

  em {
    color: #8de6cd;
    font-size: 0.78rem;
    font-style: normal;
    font-weight: 900;
  }

  p {
    margin: 5px 0 0;
    color: rgba(230, 242, 238, 0.62);
    font-size: 0.72rem;
    font-weight: 700;
  }
`;

const NodeStatus = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid rgba(141, 230, 205, 0.2);
  border-radius: 999px;
  color: rgba(225, 242, 236, 0.75);
  background: rgba(141, 230, 205, 0.07);
  font-size: 0.6rem;
  font-weight: 850;
  white-space: nowrap;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #77d7bd;
  }

  @media (max-width: 640px) { display: none; }
`;

const BranchGrid = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 66px;

  &::before {
    content: "";
    position: absolute;
    top: -34px;
    left: 12.5%;
    right: 12.5%;
    height: 1px;
    background: #9bb3ab;
  }

  @media (max-width: 1000px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;

    &::before { display: none; }
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
    gap: 16px;
    margin-top: 32px;
    padding-left: 28px;

    &::before {
      display: block;
      top: 0;
      bottom: 34px;
      left: 0;
      right: auto;
      width: 1px;
      height: auto;
    }
  }
`;

const BranchColumn = styled.article<{ $accent: string; $active: boolean }>`
  position: relative;
  min-width: 0;
  content-visibility: auto;
  contain-intrinsic-size: 430px;

  &::before {
    content: "";
    position: absolute;
    left: 50%;
    bottom: 100%;
    width: 1px;
    height: 34px;
    background: ${(props) => (props.$active ? props.$accent : '#9bb3ab')};
  }

  @media (max-width: 1000px) and (min-width: 621px) {
    &::before { display: none; }
  }

  @media (max-width: 620px) {
    &::before {
      left: -28px;
      bottom: auto;
      top: 36px;
      width: 28px;
      height: 1px;
    }
  }
`;

const ExecutiveButton = styled.button<{ $accent: string; $soft: string; $active: boolean }>`
  width: 100%;
  min-height: 214px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 16px;
  border: 1px solid ${(props) => (props.$active ? props.$accent : '#dfe6e3')};
  border-radius: 16px;
  color: var(--org-ink);
  background: ${(props) => (props.$active ? props.$soft : '#ffffff')};
  box-shadow: ${(props) => (props.$active ? `0 14px 30px color-mix(in srgb, ${props.$accent} 16%, transparent)` : '0 8px 22px rgba(32, 54, 48, 0.05)')};
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, background 160ms ease;

  &:hover { transform: translateY(-3px); border-color: ${(props) => props.$accent}; }
  &:focus-visible { outline: 3px solid ${(props) => props.$accent}; outline-offset: 3px; }
`;

const ExecutiveTopline = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const ExecutiveStatus = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #73807c;
  font-size: 0.54rem;
  font-weight: 900;
  letter-spacing: 0.07em;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #23a986;
  }
`;

const ExecutiveRole = styled.strong`
  margin-top: 18px;
  color: var(--org-ink);
  font-size: 1.65rem;
  font-weight: 950;
  line-height: 1;
`;

const ExecutiveName = styled.span`
  margin-top: 5px;
  color: #78837f;
  font-size: 0.63rem;
  font-weight: 900;
  letter-spacing: 0.13em;
`;

const ExecutiveFocus = styled.p`
  margin: 11px 0 0;
  color: #66736f;
  font-size: 0.7rem;
  font-weight: 720;
  line-height: 1.45;
  word-break: keep-all;
`;

const ViewBranch = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 14px;
  color: var(--org-primary);
  font-size: 0.68rem;
  font-weight: 900;
`;

const BranchConnector = styled.div`
  position: relative;
  width: 1px;
  height: 34px;
  display: grid;
  place-items: end center;
  margin: 0 auto;
  color: #7f928c;
  background: #b5c3be;

  svg { transform: translateY(7px); background: #f6f8f7; }
`;

const DepartmentBranchList = styled.div`
  display: grid;
  gap: 8px;
`;

const LeadNode = styled.button<{ $accent: string; $active: boolean }>`
  width: 100%;
  min-height: 112px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 11px;
  align-items: start;
  padding: 13px;
  border: 1px solid ${(props) => (props.$active ? props.$accent : '#dfe6e3')};
  border-radius: 15px;
  color: var(--org-ink);
  background: ${(props) => (props.$active ? `color-mix(in srgb, ${props.$accent} 7%, white)` : '#ffffff')};
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;

  &:hover {
    transform: translateY(-2px);
    border-color: ${(props) => props.$accent};
    box-shadow: 0 10px 24px rgba(34, 58, 51, 0.08);
  }

  &:focus-visible {
    outline: 3px solid ${(props) => props.$accent};
    outline-offset: 2px;
  }

  @media (max-width: 620px) {
    min-height: 104px;
  }
`;

const LeadNodeBody = styled.div`
  min-width: 0;

  > strong {
    display: block;
    margin-top: 8px;
    color: var(--org-ink);
    font-size: 0.92rem;
    font-weight: 950;
  }

  > p {
    margin: 3px 0 0;
    color: #697571;
    font-size: 0.7rem;
    font-weight: 750;
  }
`;

const LeadNodeTopline = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--org-primary);

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.55rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }
`;

const LeadCapacity = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 13px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #78847f;
    font-size: 0.6rem;
    font-weight: 820;
  }

  i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #24a784;
  }

  span:last-child i { background: #f0a34a; }
`;

const DepartmentSection = styled(motion.section)`
  padding: 34px;
  border: 1px solid var(--org-line);
  border-radius: 26px;
  background: #ffffff;
  box-shadow: 0 18px 50px rgba(25, 50, 43, 0.07);

  @media (max-width: 760px) {
    padding: 22px 16px;
    border-radius: 22px;
  }
`;

const DepartmentHeading = styled.header`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;

  h2 {
    margin: 12px 0 0;
    color: var(--org-ink);
    font-size: 2rem;
    font-weight: 950;
    line-height: 1.22;
    letter-spacing: -0.015em;
    word-break: keep-all;
    text-wrap: balance;
  }

  p {
    margin: 9px 0 0;
    color: var(--org-muted);
    font-size: 0.84rem;
    font-weight: 650;
    line-height: 1.6;
    word-break: keep-all;
  }

  @media (max-width: 760px) {
    align-items: start;
    flex-direction: column;

    h2 { font-size: 1.55rem; }
  }
`;

const RosterSummary = styled.div`
  flex: 0 0 auto;
  display: grid;
  gap: 3px;
  min-width: 142px;
  padding: 13px 15px;
  border: 1px solid #ead7bb;
  border-radius: 12px;
  background: #fff9ef;

  strong { color: #8d5f1d; font-size: 1.2rem; font-weight: 950; }
  span { color: #8c7a61; font-size: 0.61rem; font-weight: 800; }
`;

const DepartmentTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-top: 24px;

  @media (max-width: 1000px) and (min-width: 761px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 760px) {
    display: flex;
    overflow-x: auto;
    padding: 2px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;

    &::-webkit-scrollbar { display: none; }
  }
`;

const DepartmentTab = styled.button<{ $accent: string; $active: boolean }>`
  min-width: 0;
  min-height: 48px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  padding: 0 13px;
  border: 1px solid ${(props) => (props.$active ? props.$accent : '#dce4e1')};
  border-radius: 12px;
  color: ${(props) => (props.$active ? props.$accent : '#5f6d68')};
  background: ${(props) => (props.$active ? `color-mix(in srgb, ${props.$accent} 8%, white)` : '#ffffff')};
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;

  &:hover { transform: translateY(-2px); border-color: ${(props) => props.$accent}; }
  &:focus-visible { outline: 3px solid ${(props) => props.$accent}; outline-offset: 2px; }

  span { overflow: hidden; font-size: 0.72rem; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
  em { color: #84908c; font-size: 0.62rem; font-style: normal; font-weight: 850; }

  @media (max-width: 760px) {
    flex: 0 0 190px;
    scroll-snap-align: start;
  }
`;

const TeamPanel = styled.div<{ $accent: string; $soft: string }>`
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid ${(props) => `color-mix(in srgb, ${props.$accent} 36%, #dbe3e0)`};
  border-radius: 20px;
  background: linear-gradient(180deg, ${(props) => props.$soft} 0, #ffffff 220px);
`;

const TeamPanelHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 28px;
  border-bottom: 1px solid rgba(117, 134, 128, 0.16);

  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
    padding: 22px;
  }
`;

const DepartmentTitleGroup = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16px;

  > div:last-child { min-width: 0; }

  span {
    color: #71807b;
    font-size: 0.61rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h3 {
    margin: 4px 0 0;
    color: var(--org-ink);
    font-size: 1.55rem;
    font-weight: 950;
    line-height: 1.15;
  }

  p {
    max-width: 620px;
    margin: 8px 0 0;
    color: #66736f;
    font-size: 0.78rem;
    font-weight: 650;
    line-height: 1.6;
    word-break: keep-all;
  }

  @media (max-width: 520px) { align-items: flex-start; }
`;

const DepartmentMark = styled.div<{ $accent: string; $soft: string }>`
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: 1px solid ${(props) => `color-mix(in srgb, ${props.$accent} 28%, white)`};
  border-radius: 17px;
  color: ${(props) => props.$accent};
  background: ${(props) => props.$soft};
`;

const WorkforceMeter = styled.div`
  flex: 0 0 190px;
  padding: 14px;
  border: 1px solid rgba(99, 117, 110, 0.16);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.76);

  > div:first-child {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  span, small { color: #74817c; font-size: 0.61rem; font-weight: 800; }
  strong { color: var(--org-ink); font-size: 0.88rem; font-weight: 950; }
  small { display: block; margin-top: 7px; text-align: right; }

  @media (max-width: 760px) { flex-basis: auto; }
`;

const MeterTrack = styled.div`
  height: 5px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #e6ece9;

  span {
    display: block;
    width: 10%;
    height: 100%;
    border-radius: inherit;
    background: #1ca27f;
  }
`;

const RosterGrid = styled.div`
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 18px;
  padding: 24px;

  @media (max-width: 900px) { grid-template-columns: 1fr; }
  @media (max-width: 760px) { padding: 18px; }
`;

const LeadProfile = styled.button<{ $accent: string }>`
  position: relative;
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 22px;
  overflow: hidden;
  border: 1px solid ${(props) => `color-mix(in srgb, ${props.$accent} 36%, #d8e0dd)`};
  border-radius: 17px;
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(35, 60, 53, 0.07);
  color: var(--org-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;

  &:hover {
    transform: translateY(-3px);
    border-color: ${(props) => props.$accent};
    box-shadow: 0 16px 36px rgba(35, 60, 53, 0.12);
  }

  &:focus-visible {
    outline: 3px solid ${(props) => props.$accent};
    outline-offset: 3px;
  }

  > ${ProfilePhotoFrame} {
    margin-top: 20px;
  }

  > span {
    display: block;
    margin-top: 20px;
    color: #7b8883;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  h4 {
    margin: 6px 0 0;
    color: var(--org-ink);
    font-size: 1.5rem;
    font-weight: 950;
  }

  > p {
    margin: 4px 0 0;
    color: #65726e;
    font-size: 0.78rem;
    font-weight: 800;
  }
`;

const LeadProfileBadge = styled.div`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 999px;
  color: #0a745b;
  background: #e7f7f2;
  font-size: 0.6rem;
  font-weight: 900;
`;

const LeadProfileAction = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: auto;
  padding-top: 18px;
  color: var(--org-primary);
  font-size: 0.68rem;
  font-weight: 900;
`;

const LeadProfileMeta = styled.div`
  display: grid;
  gap: 9px;
  margin-top: 22px;
  padding-top: 17px;
  border-top: 1px solid #e5ebe8;

  span {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #687671;
    font-size: 0.68rem;
    font-weight: 780;
  }
`;

const OpenRoster = styled.div`
  min-width: 0;
  padding: 18px;
  border: 1px solid #e0e7e4;
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.78);
`;

const OpenRosterHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;

  > div { display: grid; gap: 4px; }
  > div > span { color: #8a9692; font-size: 0.56rem; font-weight: 900; letter-spacing: 0.11em; }
  strong { color: var(--org-ink); font-size: 0.9rem; font-weight: 920; }
`;

const HiringBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid #efd9b8;
  border-radius: 999px;
  color: #8f631f;
  background: #fff8ec;
  font-size: 0.58rem;
  font-weight: 900;
  white-space: nowrap;

  span { width: 6px; height: 6px; border-radius: 50%; background: #efa441; }
`;

const OpenSeatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;

  @media (max-width: 620px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 350px) { grid-template-columns: 1fr; }
`;

const OpenSeatCard = styled.button`
  min-width: 0;
  width: 100%;
  min-height: 108px;
  display: flex;
  flex-direction: column;
  padding: 12px;
  border: 1px dashed #cbd6d1;
  border-radius: 12px;
  color: var(--org-ink);
  background: #fbfcfc;
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;

  &:hover { transform: translateY(-2px); border-color: #e3a44e; background: #fffaf2; }
  &:focus-visible { outline: 3px solid #e3a44e; outline-offset: 2px; }

  > strong {
    min-height: 2.7em;
    margin-top: 12px;
    color: #4f5d58;
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1.35;
    word-break: keep-all;
  }

  > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: auto;
    color: #9a6a22;
    font-size: 0.59rem;
    font-weight: 850;
  }

  i { width: 5px; height: 5px; border-radius: 50%; background: #eda03a; }
`;

const SeatTopline = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #98a39f;
`;

const SeatCode = styled.span`
  color: #8d9995;
  font-size: 0.56rem;
  font-weight: 900;
  letter-spacing: 0.07em;
`;

const GovernanceNote = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 24px 24px;
  padding: 14px 16px;
  border: 1px solid #d8e5e0;
  border-radius: 13px;
  color: #0d745e;
  background: #eff8f5;

  div { min-width: 0; display: grid; gap: 3px; }
  strong { font-size: 0.72rem; font-weight: 920; }
  span { color: #58716a; font-size: 0.68rem; font-weight: 680; line-height: 1.45; }

  @media (max-width: 760px) { align-items: flex-start; margin: 0 18px 18px; }
`;

const OperatingSection = styled(motion.section)`
  overflow: hidden;
  padding: 36px;
  border: 1px solid rgba(117, 215, 188, 0.18);
  border-radius: 26px;
  color: #eef8f5;
  background: #0b1b18;
  box-shadow: 0 18px 50px rgba(18, 45, 38, 0.14);

  @media (max-width: 760px) { padding: 24px 18px; border-radius: 22px; }
`;

const OperatingHeader = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.7fr);
  gap: 32px;
  align-items: end;

  h2 {
    margin: 12px 0 0;
    color: #ffffff;
    font-size: 2rem;
    font-weight: 950;
    line-height: 1.2;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }

  > p {
    margin: 0;
    color: rgba(222, 240, 234, 0.62);
    font-size: 0.82rem;
    font-weight: 650;
    line-height: 1.65;
    word-break: keep-all;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    gap: 16px;

    h2 { font-size: 1.55rem; }
  }
`;

const FlowGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 28px;

  @media (max-width: 860px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

const FlowStep = styled.article`
  min-height: 174px;
  padding: 18px;
  border: 1px solid rgba(151, 222, 203, 0.13);
  border-radius: 15px;
  background: rgba(229, 247, 241, 0.045);
  content-visibility: auto;
  contain-intrinsic-size: 174px;

  > strong {
    display: block;
    margin-top: 24px;
    color: #f4fbf8;
    font-size: 0.84rem;
    font-weight: 900;
  }

  > p {
    margin: 9px 0 0;
    color: rgba(220, 237, 232, 0.59);
    font-size: 0.7rem;
    font-weight: 640;
    line-height: 1.6;
    word-break: keep-all;
  }
`;

const FlowStepTopline = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #83dec5;

  span { font-size: 0.62rem; font-weight: 900; letter-spacing: 0.1em; }
`;

const HiringCallout = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 12px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 196, 112, 0.18);
  border-radius: 14px;
  background: rgba(255, 190, 96, 0.07);

  > div { display: flex; align-items: center; gap: 11px; color: #ffc575; }
  > div span { color: rgba(239, 246, 244, 0.7); font-size: 0.75rem; font-weight: 680; }
  > div strong { color: #ffffff; font-weight: 900; }

  @media (max-width: 680px) { align-items: stretch; flex-direction: column; }
`;

const HiringLink = styled(Link)`
  flex: 0 0 auto;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border-radius: 10px;
  color: #0c332b;
  background: #e8f8f3;
  font-size: 0.7rem;
  font-weight: 900;
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(141, 230, 205, 0.2);
  transition: transform 150ms ease, background 150ms ease;

  &:hover { transform: translateY(-2px); background: #ffffff; }
  &:focus-visible { outline: 3px solid #8de6cd; outline-offset: 3px; }
`;

const ProfileDrawerLayer = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  justify-content: flex-end;
`;

const DrawerScrimClose = styled.button`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: rgba(5, 18, 16, 0.58);
  backdrop-filter: blur(5px);
  cursor: default;

  &:focus-visible {
    outline: 3px solid #8de6cd;
    outline-offset: -6px;
  }
`;

const ProfileDrawer = styled(motion.aside)`
  position: relative;
  z-index: 1;
  width: min(500px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--org-ink);
  background: #f7f9f8;
  box-shadow: -28px 0 80px rgba(8, 28, 23, 0.24);

  @media (max-width: 560px) {
    width: 100%;
  }
`;

const DrawerHeader = styled.header`
  flex: 0 0 auto;
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 18px 14px 24px;
  border-bottom: 1px solid #dce4e1;
  background: rgba(255, 255, 255, 0.94);

  > div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  span {
    color: var(--org-primary);
    font-size: 0.58rem;
    font-weight: 950;
    letter-spacing: 0.12em;
  }

  strong {
    overflow: hidden;
    color: #53615c;
    font-size: 0.76rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const DrawerCloseButton = styled.button`
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid #d8e1de;
  border-radius: 12px;
  color: #4f5f5a;
  background: #ffffff;
  cursor: pointer;
  touch-action: manipulation;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;

  &:hover {
    color: #0c6e58;
    border-color: #77cbb5;
    background: #eef8f5;
  }

  &:focus-visible {
    outline: 3px solid #0f8067;
    outline-offset: 2px;
  }
`;

const DrawerBody = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-auto-rows: max-content;
  align-content: start;
  gap: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px;

  @media (max-width: 560px) {
    padding: 20px 18px;
  }
`;

const DrawerIdentity = styled.section<{ $accent: string }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  padding: 22px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 30%, #dce4e1);
  border-radius: 20px;
  background:
    radial-gradient(circle at 90% 10%, color-mix(in srgb, ${(props) => props.$accent} 14%, transparent), transparent 38%),
    #ffffff;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
    align-items: start;
  }
`;

const DrawerIdentityCopy = styled.div`
  min-width: 0;

  > span:not(:first-child) {
    display: block;
    margin-top: 14px;
    color: #7c8884;
    font-size: 0.6rem;
    font-weight: 900;
    letter-spacing: 0.13em;
  }

  h2 {
    margin: 4px 0 0;
    color: var(--org-ink);
    font-size: 1.9rem;
    font-weight: 950;
    line-height: 1.08;
    word-break: keep-all;
    text-wrap: balance;
  }

  > strong {
    display: block;
    margin-top: 8px;
    color: #5f6e69;
    font-size: 0.76rem;
    font-weight: 800;
    line-height: 1.45;
  }
`;

const DrawerStatus = styled.span<{ $open: boolean }>`
  width: fit-content;
  display: inline-flex !important;
  align-items: center;
  gap: 7px;
  margin: 0 !important;
  padding: 6px 9px;
  border-radius: 999px;
  color: ${(props) => (props.$open ? '#8d611e' : '#087057')} !important;
  background: ${(props) => (props.$open ? '#fff5e5' : '#e8f7f2')};
  font-size: 0.62rem !important;
  font-weight: 900 !important;
  letter-spacing: 0 !important;

  span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${(props) => (props.$open ? '#eca33f' : '#19a17e')};
  }
`;

const DrawerQuote = styled.blockquote`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 11px;
  margin: 0;
  padding: 16px 18px;
  border-left: 3px solid #28a884;
  border-radius: 0 14px 14px 0;
  color: #0d715b;
  background: #eaf7f3;

  p {
    margin: 0;
    color: #48645c;
    font-size: 0.77rem;
    font-weight: 740;
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const DrawerSection = styled.section`
  padding: 18px;
  border: 1px solid #dfe6e3;
  border-radius: 16px;
  background: #ffffff;

  > span {
    color: var(--org-primary);
    font-size: 0.58rem;
    font-weight: 950;
    letter-spacing: 0.11em;
  }

  > p {
    margin: 11px 0 0;
    color: #5e6c67;
    font-size: 0.77rem;
    font-weight: 650;
    line-height: 1.7;
    word-break: keep-all;
  }
`;

const DrawerMetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const DrawerMetaItem = styled.div`
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 14px;
  border: 1px solid #dfe6e3;
  border-radius: 13px;
  background: #ffffff;

  span {
    color: #85918d;
    font-size: 0.58rem;
    font-weight: 850;
  }

  strong {
    overflow: hidden;
    color: #34443f;
    font-size: 0.71rem;
    font-weight: 880;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const DrawerSkillList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;

  li {
    padding: 7px 9px;
    border: 1px solid #dce6e2;
    border-radius: 999px;
    color: #46615a;
    background: #f5f8f7;
    font-size: 0.64rem;
    font-weight: 820;
  }
`;

const ResponsibilityList = styled.ul`
  display: grid;
  gap: 10px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 9px;
    align-items: start;
    color: #0d765e;
  }

  li span {
    color: #586862;
    font-size: 0.72rem;
    font-weight: 720;
    line-height: 1.5;
  }
`;

const DrawerFooter = styled.footer`
  flex: 0 0 auto;
  padding: 14px 24px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid #dce4e1;
  background: rgba(255, 255, 255, 0.96);

  @media (max-width: 560px) {
    padding-right: 18px;
    padding-left: 18px;
  }
`;

const drawerPrimaryStyles = css`
  width: 100%;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 0;
  border-radius: 12px;
  color: #ffffff;
  background: #0d705a;
  font-size: 0.76rem;
  font-weight: 900;
  text-decoration: none;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 150ms ease, background 150ms ease;

  &:hover { transform: translateY(-2px); background: #095744; }
  &:focus-visible { outline: 3px solid #43c29f; outline-offset: 3px; }
`;

const DrawerPrimaryLink = styled(Link)`
  ${drawerPrimaryStyles}
`;

const DrawerPrimaryButton = styled.button`
  ${drawerPrimaryStyles}
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
