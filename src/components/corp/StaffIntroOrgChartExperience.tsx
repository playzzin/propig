'use client';

import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  Clapperboard,
  Code2,
  Compass,
  Crown,
  FlaskConical,
  Globe2,
  HeartHandshake,
  Landmark,
  Lightbulb,
  Megaphone,
  Network,
  Palette,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';

type PersonLevel = '경영진' | '총괄본부장' | '본부장' | '팀장' | '센터장';

type Person = {
  id: string;
  name: string;
  role: string;
  title: string;
  description: string;
  photoIndex: number;
  accent: string;
  level: PersonLevel;
  meta: string[];
  responsibilities: string[];
};

type Executive = Person & {
  focus: string;
};

type Team = {
  name: string;
  lead: string;
  photoIndex: number;
};

type Division = {
  id: string;
  label: string;
  englishLabel: string;
  executive: string;
  accent: string;
  accentStrong: string;
  icon: LucideIcon;
  head: Person;
  teams: Team[];
};

type SupportUnit = {
  id: string;
  label: string;
  executive: string;
  mission: string;
  accent: string;
  icon: LucideIcon;
  lead: Person;
};

const PROFILE_ATLAS_PATHS = [
  '/corp/staff-ai-agent-cast-v2-01.webp',
  '/corp/staff-ai-agent-cast-v2-02.webp',
  '/corp/staff-ai-agent-cast-v2-03.webp',
  '/corp/staff-ai-agent-cast-v2-04.webp',
  '/corp/staff-ai-agent-cast-v2-05.webp',
  '/corp/staff-ai-agent-cast-v2-06.webp',
  '/corp/staff-ai-agent-cast-v2-07.webp',
  '/corp/staff-ai-agent-cast-v2-08.webp',
] as const;

const CEO: Person = {
  id: 'ceo',
  name: '그냥돼지',
  role: 'CEO',
  title: '대표이사',
  description: '사람의 판단과 AI의 실행력을 연결해 회사의 비전, 우선순위, 최종 의사결정을 책임집니다.',
  photoIndex: 0,
  accent: '#6edfff',
  level: '경영진',
  meta: ['전략 수립', '의사 결정', '비전 제시'],
  responsibilities: ['전사 비전과 우선순위 확정', '경영진 의사결정 정렬', 'AI 권한과 리스크 최종 승인'],
};

const GENERAL_MANAGER: Person = {
  id: 'general-manager',
  name: 'CONTROL',
  role: '총괄본부장',
  title: '10개 전문 부서 운영 총괄',
  description: 'CEO의 전략을 10개 전문 부서의 실행 체계로 전환하고 부서 간 우선순위와 자원을 조율합니다.',
  photoIndex: 5,
  accent: '#48c7ff',
  level: '총괄본부장',
  meta: ['전사 운영', '우선순위 조정', '품질 관리'],
  responsibilities: ['CEO 전략을 실행계획으로 전환', '10개 전문 부서 목표와 일정 조율', '부서 간 자원과 품질 기준 관리'],
};

const CORE_EXECUTIVES: Executive[] = [
  {
    id: 'clo',
    name: 'LEX',
    role: 'CLO',
    title: 'AI윤리·법무총괄',
    focus: 'AI 윤리 · 법무 · 정책',
    description: 'AI 에이전트가 빠르게 일하되 법과 윤리의 경계를 넘지 않도록 실행 기준을 설계합니다.',
    photoIndex: 66,
    accent: '#52d7be',
    level: '경영진',
    meta: ['AI Ethics', 'Legal', 'Policy'],
    responsibilities: ['AI 윤리 원칙 수립', '계약·법무 리스크 검토', '에이전트 정책 기준 운영'],
  },
  {
    id: 'cpo',
    name: 'SCOUT',
    role: 'CPO',
    title: '피플·에이전트총괄',
    focus: '인재 · 에이전트 · 문화',
    description: '사람과 AI 에이전트가 서로의 강점을 살려 일할 수 있도록 역할과 협업 문화를 설계합니다.',
    photoIndex: 67,
    accent: '#61b8ff',
    level: '경영진',
    meta: ['People', 'Agent Ops', 'Culture'],
    responsibilities: ['인재·에이전트 역할 설계', '협업 문화와 평가 기준 운영', '핵심 역량 개발 지원'],
  },
  {
    id: 'cbo',
    name: 'COUNT',
    role: 'CBO',
    title: '사업관리총괄',
    focus: '수익 모델 · 원가 · 사업성',
    description: 'AI가 만든 속도가 실제 사업 성과로 이어지는지 숫자와 현실 감각으로 끈질기게 확인합니다.',
    photoIndex: 68,
    accent: '#f2a65c',
    level: '경영진',
    meta: ['Business', 'Unit Economics', 'Planning'],
    responsibilities: ['사업 모델과 수익성 검토', '프로젝트 원가 기준 관리', '신규 기회 사업성 평가'],
  },
  {
    id: 'cao',
    name: 'HUB',
    role: 'CAO',
    title: '운영지원총괄',
    focus: '워크스페이스 · 자원 · 지원',
    description: '혼자서도 여러 AI 팀을 운영할 수 있도록 도구, 자원, 일정과 업무 환경을 정돈합니다.',
    photoIndex: 69,
    accent: '#8f87ff',
    level: '경영진',
    meta: ['Administration', 'Workspace', 'Resources'],
    responsibilities: ['운영 자원과 일정 조정', '업무 도구·환경 표준화', '부서 공통 지원 체계 운영'],
  },
];

const EXECUTIVES: Executive[] = [
  {
    id: 'cto',
    name: 'ATLAS',
    role: 'CTO',
    title: '기술총괄이사',
    focus: '기술 전략 · R&D · 아키텍처',
    description: '플랫폼, AI 데이터, 제품 개발 조직의 기술 로드맵과 출시 품질을 총괄합니다.',
    photoIndex: 1,
    accent: '#4898ff',
    level: '경영진',
    meta: ['Technology', 'Architecture', 'R&D'],
    responsibilities: ['기술 로드맵 승인', '아키텍처·보안 기준 수립', '제품 개발 품질 검수'],
  },
  {
    id: 'cmo',
    name: 'SIGNAL',
    role: 'CMO',
    title: '마케팅총괄이사',
    focus: '브랜드 전략 · 마케팅 · 성장',
    description: '브랜드 메시지와 고객 획득 전략을 하나의 일관된 성장 흐름으로 연결합니다.',
    photoIndex: 3,
    accent: '#9a76ff',
    level: '경영진',
    meta: ['Brand', 'Growth', 'Customer'],
    responsibilities: ['브랜드 포지셔닝 결정', '마케팅 성과 지표 관리', '고객 접점 경험 정렬'],
  },
  {
    id: 'coo',
    name: 'ORBIT',
    role: 'COO',
    title: '운영총괄이사',
    focus: '사업 운영 · 프로세스 · 조직 관리',
    description: '전사 전략을 실행 가능한 업무 흐름으로 전환하고 조직 운영의 밀도를 높입니다.',
    photoIndex: 2,
    accent: '#42d5ca',
    level: '경영진',
    meta: ['Operations', 'Process', 'PMO'],
    responsibilities: ['전사 실행계획 운영', '핵심 프로세스 개선', '부서 간 협업 기준 정렬'],
  },
  {
    id: 'cfo',
    name: 'VAULT',
    role: 'CFO',
    title: '재무총괄이사',
    focus: '재무 전략 · 예산 · 리스크',
    description: '재무 건전성과 경영 리스크를 수치로 관리해 신뢰할 수 있는 판단 기준을 제공합니다.',
    photoIndex: 4,
    accent: '#f29b5c',
    level: '경영진',
    meta: ['Finance', 'Risk', 'Governance'],
    responsibilities: ['현금 흐름과 손익 감독', '예산·투자안 검토', '준법·경영 리스크 관리'],
  },
];

const TEAM_LEAD_CODES = [
  'SCOPE',
  'VENTURE',
  'TEMPO',
  'NOVA',
  'LINK',
  'PRISM',
  'CORE',
  'MATRIX',
  'SPARK',
  'VECTOR',
  'TENSOR',
  'FORGE',
  'CLOUD',
  'ORACLE',
  'PILOT',
  'FRAME',
  'PIXEL',
  'PROBE',
  'WAVE',
  'STORY',
  'METRIC',
  'FLOW',
  'TONE',
  'MOTION',
  'LOCAL',
  'GLOBAL',
  'ALLIANCE',
  'START',
  'INSIGHT',
  'PEOPLE',
  'LEDGER',
  'OFFICE',
] as const;

function createTeamRoster(names: string[], offset: number): Team[] {
  return names.map((name, index) => ({
    name,
    lead: `${TEAM_LEAD_CODES[(offset + index) % TEAM_LEAD_CODES.length]} 팀장`,
    photoIndex: offset + index + 11,
  }));
}

const EXPANDED_TEAM_LEAD_CODES = [
  'NORTH',
  'SCENARIO',
  'MOMENTUM',
  'RADAR',
  'FRONTIER',
  'PORTFOLIO',
  'BEACON',
  'BLUEPRINT',
  'CATALYST',
  'AGENDA',
  'WELCOME',
  'LISTEN',
  'RELAY',
  'ECHO',
  'JOURNEY',
  'GUIDE',
  'RENEW',
  'CIRCLE',
  'SERVICE',
  'TRUST',
  'BUDGET',
  'BALANCE',
  'TAXON',
  'TREASURY',
  'SIGN',
  'AUDIT',
  'PROCURE',
  'CONTRACT',
  'REVENUE',
  'RISK',
  'TALENT',
  'CULTURE',
  'GROW',
  'REWARD',
  'WELLNESS',
  'COACH',
  'ENGAGE',
  'WORKFORCE',
  'INSIDE',
  'TOGETHER',
  'MARKET',
  'ENTERPRISE',
  'SOLUTION',
  'PARTNER',
  'ABROAD',
  'ALLY',
  'PUBLIC',
  'PROPOSAL',
  'CHANNEL',
  'PIPELINE',
] as const;

function createExpandedTeamRoster(names: string[], codeOffset: number, photoStart: number): Team[] {
  return names.map((name, index) => ({
    name,
    lead: `${EXPANDED_TEAM_LEAD_CODES[codeOffset + index]} 팀장`,
    photoIndex: photoStart + index,
  }));
}

const DIVISIONS: Division[] = [
  {
    id: 'development',
    label: '개발팀',
    englishLabel: 'DEVELOPMENT',
    executive: '총괄본부장',
    accent: '#5d9cff',
    accentStrong: '#1858d6',
    icon: Code2,
    head: {
      id: 'development-head',
      name: 'ARCHI',
      role: '개발팀 본부장',
      title: '본부장',
      description: '제품 아이디어를 안정적인 웹·앱·플랫폼 서비스로 구현하고 출시 품질을 책임집니다.',
      photoIndex: 6,
      accent: '#5d9cff',
      level: '본부장',
      meta: ['제품 개발', '플랫폼', '품질'],
      responsibilities: ['개발 로드맵과 아키텍처 수립', '제품 출시 일정과 품질 관리', '개발 표준과 보안 기준 운영'],
    },
    teams: createTeamRoster(
      ['웹개발팀', '앱개발팀', '백엔드팀', '프론트엔드팀', '플랫폼팀', 'API팀', 'QA팀', 'DevOps팀', '데이터개발팀', '보안개발팀'],
      0,
    ),
  },
  {
    id: 'automation',
    label: '자동화팀',
    englishLabel: 'AUTOMATION',
    executive: '총괄본부장',
    accent: '#35d4da',
    accentStrong: '#078b9e',
    icon: Workflow,
    head: {
      id: 'automation-head',
      name: 'NEURAL',
      role: '자동화팀 본부장',
      title: '본부장',
      description: 'AI와 자동화 기술로 반복 업무를 줄이고 조직 전체의 실행 속도와 정확도를 높입니다.',
      photoIndex: 7,
      accent: '#35d4da',
      level: '본부장',
      meta: ['AI 자동화', 'RPA', 'Operations'],
      responsibilities: ['업무 자동화 과제 발굴', 'AI 에이전트와 RPA 운영', '자동화 성과와 안정성 관리'],
    },
    teams: createTeamRoster(
      ['업무자동화팀', 'AI 자동화팀', 'RPA팀', 'AI 에이전트팀', '데이터파이프라인팀', '품질자동화팀', '배포자동화팀', '운영자동화팀', '마케팅자동화팀', '고객지원자동화팀'],
      10,
    ),
  },
  {
    id: 'media',
    label: '미디어팀',
    englishLabel: 'MEDIA',
    executive: '총괄본부장',
    accent: '#9b7cff',
    accentStrong: '#5d38c8',
    icon: Clapperboard,
    head: {
      id: 'media-head',
      name: 'CANVAS',
      role: '미디어팀 본부장',
      title: '본부장',
      description: '기획부터 촬영·편집·배포까지 브랜드의 메시지를 완성도 높은 미디어로 전달합니다.',
      photoIndex: 8,
      accent: '#9b7cff',
      level: '본부장',
      meta: ['영상 기획', '프로덕션', '미디어 운영'],
      responsibilities: ['영상 콘텐츠 제작 방향 수립', '스튜디오와 제작 일정 관리', '채널별 미디어 품질 운영'],
    },
    teams: createTeamRoster(
      ['영상기획팀', '촬영팀', '편집팀', '모션그래픽팀', '음향팀', '라이브팀', '숏폼팀', '미디어운영팀', '스튜디오팀', '콘텐츠QA팀'],
      20,
    ),
  },
  {
    id: 'creator',
    label: '크리에디터팀',
    englishLabel: 'CREATOR',
    executive: '총괄본부장',
    accent: '#4e9fff',
    accentStrong: '#1768d8',
    icon: Palette,
    head: {
      id: 'creator-head',
      name: 'MUSE',
      role: '크리에디터팀 본부장',
      title: '본부장',
      description: '브랜드의 생각을 글·이미지·그래픽·캐릭터로 확장해 기억에 남는 콘텐츠를 만듭니다.',
      photoIndex: 9,
      accent: '#4e9fff',
      level: '본부장',
      meta: ['콘텐츠', '크리에이티브', '브랜드'],
      responsibilities: ['크리에이티브 방향 수립', '콘텐츠 제작 품질 관리', '브랜드 비주얼 일관성 운영'],
    },
    teams: createTeamRoster(
      ['콘텐츠기획팀', '카피라이팅팀', '그래픽팀', '일러스트팀', '3D팀', '캐릭터팀', '브랜드콘텐츠팀', '소셜콘텐츠팀', '웹콘텐츠팀', '크리에이티브QA팀'],
      30,
    ),
  },
  {
    id: 'marketing',
    label: '마케팅팀',
    englishLabel: 'MARKETING',
    executive: '총괄본부장',
    accent: '#55c96c',
    accentStrong: '#23863a',
    icon: Megaphone,
    head: {
      id: 'marketing-head',
      name: 'PULSE',
      role: '마케팅팀 본부장',
      title: '본부장',
      description: '고객 신호를 분석해 브랜드 인지도와 측정 가능한 성장을 함께 만듭니다.',
      photoIndex: 10,
      accent: '#55c96c',
      level: '본부장',
      meta: ['캠페인', '콘텐츠', '퍼포먼스'],
      responsibilities: ['마케팅 전략 수립', '콘텐츠·캠페인 운영', '성과 데이터 분석'],
    },
    teams: createTeamRoster(
      ['디지털마케팅팀', '콘텐츠마케팅팀', '퍼포먼스팀', 'CRM팀', '브랜드마케팅팀', 'SEO팀', '소셜미디어팀', '그로스팀', '캠페인팀', '시장조사팀'],
      40,
    ),
  },
  {
    id: 'strategy',
    label: '전략기획부',
    englishLabel: 'STRATEGY',
    executive: '총괄본부장',
    accent: '#64b6ff',
    accentStrong: '#245fba',
    icon: Compass,
    head: {
      id: 'strategy-head',
      name: 'COMPASS',
      role: '전략기획부 본부장',
      title: '본부장',
      description: '시장과 조직의 신호를 연결해 전사 전략, 실행 우선순위, 성과 기준을 선명하게 설계합니다.',
      photoIndex: 70,
      accent: '#64b6ff',
      level: '본부장',
      meta: ['Corporate Strategy', 'Planning', 'Performance'],
      responsibilities: ['중장기 전사 전략 수립', '핵심 과제와 KPI 정렬', '경영 의사결정 자료 총괄'],
    },
    teams: createExpandedTeamRoster(
      ['경영기획팀', '사업전략팀', 'PMO팀', '성과관리팀', '리서치팀', '신사업기획팀', '포트폴리오팀', '데이터전략팀', '혁신기획팀', '이사회운영팀'],
      0,
      75,
    ),
  },
  {
    id: 'customer-success',
    label: '고객성공부',
    englishLabel: 'CUSTOMER SUCCESS',
    executive: '총괄본부장',
    accent: '#42d4c8',
    accentStrong: '#098d88',
    icon: HeartHandshake,
    head: {
      id: 'customer-success-head',
      name: 'CARE',
      role: '고객성공부 본부장',
      title: '본부장',
      description: '고객의 도입부터 활용, 재계약까지 모든 여정을 연결해 오래 지속되는 성공 경험을 만듭니다.',
      photoIndex: 71,
      accent: '#42d4c8',
      level: '본부장',
      meta: ['Customer Success', 'CX', 'Retention'],
      responsibilities: ['고객 성공 전략과 지표 수립', '고객 여정과 VOC 개선', '재계약·확장 기회 관리'],
    },
    teams: createExpandedTeamRoster(
      ['고객온보딩팀', '고객케어팀', '기술지원팀', 'VOC팀', 'CX기획팀', '고객교육팀', '리뉴얼팀', '커뮤니티팀', '서비스운영팀', '고객품질팀'],
      10,
      85,
    ),
  },
  {
    id: 'finance-management',
    label: '재무관리부',
    englishLabel: 'FINANCE',
    executive: '총괄본부장',
    accent: '#f3ad64',
    accentStrong: '#b56925',
    icon: Landmark,
    head: {
      id: 'finance-management-head',
      name: 'LEDGER',
      role: '재무관리부 본부장',
      title: '본부장',
      description: '현금 흐름과 손익, 계약과 위험을 하나의 운영 기준으로 묶어 지속 가능한 성장을 지원합니다.',
      photoIndex: 72,
      accent: '#f3ad64',
      level: '본부장',
      meta: ['Finance', 'Accounting', 'Risk'],
      responsibilities: ['재무 계획과 결산 총괄', '자금·세무·내부통제 운영', '수익성과 경영 리스크 관리'],
    },
    teams: createExpandedTeamRoster(
      ['재무기획팀', '회계팀', '세무팀', '자금팀', 'IR팀', '내부통제팀', '구매팀', '계약관리팀', '매출운영팀', '리스크관리팀'],
      20,
      95,
    ),
  },
  {
    id: 'people-culture',
    label: '피플문화부',
    englishLabel: 'PEOPLE & CULTURE',
    executive: '총괄본부장',
    accent: '#bd83f4',
    accentStrong: '#7042b5',
    icon: UsersRound,
    head: {
      id: 'people-culture-head',
      name: 'HARMONY',
      role: '피플문화부 본부장',
      title: '본부장',
      description: '사람과 AI 에이전트가 함께 성장하도록 채용, 역량, 보상, 조직 문화를 일관된 경험으로 설계합니다.',
      photoIndex: 73,
      accent: '#bd83f4',
      level: '본부장',
      meta: ['People Ops', 'Culture', 'Learning'],
      responsibilities: ['인재·에이전트 운영 전략 수립', '성장·평가·보상 체계 관리', '건강한 협업 문화와 경험 설계'],
    },
    teams: createExpandedTeamRoster(
      ['채용팀', '피플운영팀', '인재개발팀', '조직문화팀', '성과관리팀', '보상팀', '복지팀', 'AI인사팀', '인력분석팀', '워크플레이스팀'],
      30,
      105,
    ),
  },
  {
    id: 'business-expansion',
    label: '사업확장부',
    englishLabel: 'BUSINESS GROWTH',
    executive: '총괄본부장',
    accent: '#74d67c',
    accentStrong: '#2d8f45',
    icon: Globe2,
    head: {
      id: 'business-expansion-head',
      name: 'BRIDGE',
      role: '사업확장부 본부장',
      title: '본부장',
      description: '고객과 파트너, 국내외 시장을 연결해 새로운 매출 기회와 반복 가능한 성장 경로를 만듭니다.',
      photoIndex: 74,
      accent: '#74d67c',
      level: '본부장',
      meta: ['Business Development', 'Sales', 'Partnership'],
      responsibilities: ['시장 확장과 영업 전략 수립', '파트너십·채널 생태계 구축', '파이프라인과 제안 품질 관리'],
    },
    teams: createExpandedTeamRoster(
      ['국내영업팀', '엔터프라이즈팀', '솔루션영업팀', '파트너십팀', '글로벌사업팀', '제휴사업팀', '공공사업팀', '제안전략팀', '채널영업팀', '영업운영팀'],
      40,
      115,
    ),
  },
];

const DIVISION_TIERS = [
  {
    id: 'core',
    label: '기존 핵심 5개 부서',
    description: '기술·자동화·미디어·크리에이티브·마케팅 실행 조직',
    divisions: DIVISIONS.slice(0, 5),
  },
  {
    id: 'expanded',
    label: '확장 전문 5개 부서',
    description: '전략·고객·재무·피플·사업 확장을 책임지는 신규 조직',
    divisions: DIVISIONS.slice(5, 10),
  },
] as const;

const SUPPORT_UNITS: SupportUnit[] = [
  {
    id: 'data-center',
    label: '데이터분석센터',
    executive: 'CTO',
    mission: '데이터 기반 의사결정 · BI · 예측 모델링',
    accent: '#8d7bff',
    icon: BarChart3,
    lead: {
      id: 'data-center-lead',
      name: 'GRID',
      role: '데이터분석센터장',
      title: '센터장',
      description: '흩어진 데이터를 경영진과 각 부서가 바로 활용할 수 있는 지표와 인사이트로 만듭니다.',
      photoIndex: 61,
      accent: '#8d7bff',
      level: '센터장',
      meta: ['BI', '데이터 모델링', 'Forecast'],
      responsibilities: ['공통 KPI 정의', '경영 대시보드 운영', '예측 모델과 리포트 제공'],
    },
  },
  {
    id: 'ai-ops',
    label: 'AI 오퍼레이션센터',
    executive: 'COO',
    mission: 'AI 서비스 운영 · 모니터링 · 자동화',
    accent: '#50c9ef',
    icon: Workflow,
    lead: {
      id: 'ai-ops-lead',
      name: 'FLOW',
      role: 'AI 오퍼레이션센터장',
      title: '센터장',
      description: 'AI 에이전트의 작업 흐름과 품질 지표를 모니터링하고 반복 업무를 자동화합니다.',
      photoIndex: 62,
      accent: '#50c9ef',
      level: '센터장',
      meta: ['Automation', 'Monitoring', 'Quality'],
      responsibilities: ['AI 운영 지표 모니터링', '업무 자동화 설계', '장애·품질 이슈 대응'],
    },
  },
  {
    id: 'security',
    label: '보안 & 컴플라이언스팀',
    executive: 'CFO',
    mission: '정보보안 · 시스템 보안 · 준법 관리',
    accent: '#52d7be',
    icon: ShieldCheck,
    lead: {
      id: 'security-lead',
      name: 'SHIELD',
      role: '보안 & 컴플라이언스 팀장',
      title: '팀장',
      description: '정보보안, 개인정보, AI 준법 기준을 제품과 업무 프로세스 전반에 적용합니다.',
      photoIndex: 63,
      accent: '#52d7be',
      level: '팀장',
      meta: ['Security', 'Privacy', 'Compliance'],
      responsibilities: ['보안 정책과 점검 운영', '개인정보 처리 기준 관리', 'AI 준법 리스크 검토'],
    },
  },
  {
    id: 'rnd',
    label: 'R&D 랩',
    executive: 'CTO',
    mission: '미래 기술 연구 · PoC · 프로토타이핑',
    accent: '#b17cf6',
    icon: FlaskConical,
    lead: {
      id: 'rnd-lead',
      name: 'NOVA',
      role: 'R&D 랩장',
      title: '랩장',
      description: '새로운 AI 기술의 가능성을 짧은 실험과 프로토타입으로 검증합니다.',
      photoIndex: 64,
      accent: '#b17cf6',
      level: '센터장',
      meta: ['Research', 'PoC', 'Prototype'],
      responsibilities: ['신기술 탐색과 검증', 'PoC·프로토타입 제작', '제품화 가능성 평가'],
    },
  },
  {
    id: 'brand-communication',
    label: '브랜드커뮤니케이션팀',
    executive: 'CMO',
    mission: 'PR · 대외 커뮤니케이션 · 브랜드 가치',
    accent: '#729aff',
    icon: Megaphone,
    lead: {
      id: 'brand-communication-lead',
      name: 'VOICE',
      role: '브랜드커뮤니케이션 팀장',
      title: '팀장',
      description: '회사의 비전과 성과를 일관된 언어로 정리해 고객과 시장에 전달합니다.',
      photoIndex: 65,
      accent: '#729aff',
      level: '팀장',
      meta: ['PR', 'Communication', 'Brand'],
      responsibilities: ['대외 메시지와 PR 운영', '브랜드 콘텐츠 관리', '이슈 커뮤니케이션 지원'],
    },
  },
];

const PRINCIPLES = [
  { label: '협업', body: '함께 성장하는 원팀 문화', icon: UsersRound, accent: '#5b9cff' },
  { label: '혁신', body: '끊임없는 도전과 창의적 사고', icon: Lightbulb, accent: '#46d7ed' },
  { label: '전문성', body: '각 분야 전문가의 시너지', icon: Target, accent: '#7b86ff' },
  { label: '신뢰', body: '투명한 소통과 책임감', icon: ShieldCheck, accent: '#bd73ef' },
];

const hierarchyVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.055, delayChildren: 0.05 },
  },
};

const riseVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'easeOut' } },
};

const divisionTierVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.075, delayChildren: 0.08 },
  },
};

const divisionCardVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 135, damping: 19, mass: 0.8 },
  },
};

function buildTeamPerson(division: Division, team: Team): Person {
  return {
    id: `${division.id}-${team.name}`,
    name: team.lead.replace(/\s*팀장$/, ''),
    role: team.name,
    title: '팀장',
    description: `${division.label} 안에서 ${team.name}의 목표, 역할 배분, 결과 품질을 책임집니다.`,
    photoIndex: team.photoIndex,
    accent: division.accent,
    level: '팀장',
    meta: [division.label, team.name, division.executive],
    responsibilities: [`${team.name} 실행계획 수립`, '팀 결과물 품질 검수', '본부·유관 조직 협업'],
  };
}

function ProfilePhoto({
  person,
  size,
  priority = false,
}: {
  person: Pick<Person, 'name' | 'photoIndex' | 'accent'>;
  size: number;
  priority?: boolean;
}) {
  const atlasIndex = Math.floor(person.photoIndex / 16);
  const atlasPath = PROFILE_ATLAS_PATHS[atlasIndex] ?? PROFILE_ATLAS_PATHS[0];
  const localPhotoIndex = person.photoIndex % 16;
  const column = localPhotoIndex % 4;
  const row = Math.floor(localPhotoIndex / 4);

  return (
    <Portrait data-portrait="" $size={size} $accent={person.accent}>
      <AtlasImage
        src={atlasPath}
        alt={`${person.name} 프로필`}
        width={1280}
        height={1280}
        priority={priority}
        loading={priority ? 'eager' : 'lazy'}
        sizes={`${size * 4}px`}
        $column={column}
        $row={row}
      />
    </Portrait>
  );
}

export function StaffIntroOrgChartExperience() {
  const reduceMotion = useReducedMotion();
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);

  const openProfile = useCallback((person: Person, trigger: HTMLElement) => {
    lastTriggerRef.current = trigger;
    setSelectedPerson(person);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedPerson(null);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!selectedPerson) return;

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeProfile();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (drawerRef.current?.contains(event.target)) return;
      if (lastTriggerRef.current?.contains(event.target)) return;
      setSelectedPerson(null);
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [closeProfile, selectedPerson]);

  return (
    <Page id="staff-intro-page">
      <StaffIntroMotionStyles />
      <OrgBoard
        variants={hierarchyVariants}
        initial={reduceMotion ? false : 'hidden'}
        animate="visible"
        aria-labelledby="staff-intro-title"
      >
        <TopStage variants={riseVariants}>
          <HeroCopy>
            <HeroEyebrow>
              <span>AI DRIVEN</span>
              <i />
              <span>DATA POWERED</span>
              <i />
              <span>PEOPLE CENTERED</span>
            </HeroEyebrow>
            <HeroTitle id="staff-intro-title">
              AI와 사람이 함께 만드는{' '}
              <span>미래형 조직도</span>
            </HeroTitle>
            <HeroDescription>기술과 창의, 협업으로 가치를 창출하는 스마트한 조직 구조</HeroDescription>
            <PrincipleRail aria-label="조직 핵심 가치">
              {PRINCIPLES.map((principle) => {
                const Icon = principle.icon;
                return (
                  <PrincipleItem key={principle.label}>
                    <PrincipleIcon $accent={principle.accent}>
                      <Icon size={23} strokeWidth={1.9} aria-hidden="true" />
                    </PrincipleIcon>
                    <div>
                      <strong>{principle.label}</strong>
                      <span>{principle.body}</span>
                    </div>
                  </PrincipleItem>
                );
              })}
            </PrincipleRail>
          </HeroCopy>

          <LeadershipStage aria-label="대표이사와 핵심 경영진">
            <ExecutiveArea>
              <ExecutiveHeading>
                <Workflow size={20} strokeWidth={1.9} aria-hidden="true" />
                <strong>핵심운영진</strong>
              </ExecutiveHeading>
              <ExecutiveConnector aria-hidden="true"><span /></ExecutiveConnector>
              <ExecutiveGrid>
                {CORE_EXECUTIVES.map((executive) => (
                  <ExecutiveCard
                    key={executive.id}
                    type="button"
                    $accent={executive.accent}
                    onClick={(event) => openProfile(executive, event.currentTarget)}
                    aria-label={`${executive.name} ${executive.role} 상세 프로필 열기`}
                  >
                    <ExecutivePhoto>
                      <ProfilePhoto person={executive} size={92} priority />
                      <RoleChip data-role-chip="">{executive.role}</RoleChip>
                    </ExecutivePhoto>
                    <ExecutiveIdentity>
                      <strong>{executive.name}</strong>
                      <span>{executive.title}</span>
                    </ExecutiveIdentity>
                    <p>{executive.focus}</p>
                    <CardAction>
                      상세정보
                      <ArrowRight size={13} strokeWidth={2.5} aria-hidden="true" />
                    </CardAction>
                  </ExecutiveCard>
                ))}
              </ExecutiveGrid>
            </ExecutiveArea>

            <CeoColumn data-ceo-column="">
              <CeoCard
                type="button"
                onClick={(event) => openProfile(CEO, event.currentTarget)}
                aria-label={`${CEO.name} ${CEO.role} 상세 프로필 열기`}
              >
                <RoleChip data-role-chip="">{CEO.role}</RoleChip>
                <ProfilePhoto person={CEO} size={164} priority />
                <CeoIdentity>
                  <strong>{CEO.name}</strong>
                  <span>{CEO.title}</span>
                </CeoIdentity>
                <CeoMission>전략 수립 · 의사 결정 · 비전 제시</CeoMission>
                <CardAction>
                  프로필 보기
                  <ArrowRight size={14} strokeWidth={2.5} aria-hidden="true" />
                </CardAction>
              </CeoCard>
              <CeoConnector aria-hidden="true">
                <span />
                <i />
              </CeoConnector>
              <GeneralManagerCard
                type="button"
                onClick={(event) => openProfile(GENERAL_MANAGER, event.currentTarget)}
                aria-label={`${GENERAL_MANAGER.name} ${GENERAL_MANAGER.role} 상세 프로필 열기`}
              >
                <ProfilePhoto person={GENERAL_MANAGER} size={92} priority />
                <GeneralManagerIdentity>
                  <RoleChip data-role-chip="">{GENERAL_MANAGER.role}</RoleChip>
                  <strong>{GENERAL_MANAGER.name}</strong>
                  <span>{GENERAL_MANAGER.title}</span>
                  <p>10개 전문 부서의 목표·일정·품질을 총괄합니다.</p>
                </GeneralManagerIdentity>
              </GeneralManagerCard>
              <GeneralManagerConnector aria-hidden="true"><span /></GeneralManagerConnector>
            </CeoColumn>

            <ExecutiveArea>
              <ExecutiveHeading>
                <UsersRound size={20} strokeWidth={1.9} aria-hidden="true" />
                <strong>경영진</strong>
              </ExecutiveHeading>
              <ExecutiveConnector aria-hidden="true"><span /></ExecutiveConnector>
              <ExecutiveGrid>
                {EXECUTIVES.map((executive) => (
                  <ExecutiveCard
                    key={executive.id}
                    type="button"
                    $accent={executive.accent}
                    onClick={(event) => openProfile(executive, event.currentTarget)}
                    aria-label={`${executive.name} ${executive.role} 상세 프로필 열기`}
                  >
                    <ExecutivePhoto>
                      <ProfilePhoto person={executive} size={92} priority />
                      <RoleChip data-role-chip="">{executive.role}</RoleChip>
                    </ExecutivePhoto>
                    <ExecutiveIdentity>
                      <strong>{executive.name}</strong>
                      <span>{executive.title}</span>
                    </ExecutiveIdentity>
                    <p>{executive.focus}</p>
                    <CardAction>
                      상세정보
                      <ArrowRight size={13} strokeWidth={2.5} aria-hidden="true" />
                    </CardAction>
                  </ExecutiveCard>
                ))}
              </ExecutiveGrid>
            </ExecutiveArea>
          </LeadershipStage>
        </TopStage>

        <DivisionSection variants={riseVariants} aria-labelledby="division-title">
          <SectionTopline>
            <div>
              <SectionEyebrow>
                <Network size={16} strokeWidth={2.1} aria-hidden="true" />
                DIVISION NETWORK
              </SectionEyebrow>
              <h2 id="division-title">10개 전문 부서</h2>
              <SectionIntro>기존 5개 핵심 부서 아래에 5개 전문 부서를 확장해 실행과 성장을 함께 연결합니다.</SectionIntro>
            </div>
            <SectionSummary>
              <span><strong>10</strong>개 부서</span>
              <span><strong>10</strong>명 본부장</span>
              <span><strong>100</strong>명 팀장</span>
            </SectionSummary>
          </SectionTopline>
          <DivisionTiers>
            {DIVISION_TIERS.map((tier, tierIndex) => (
              <motion.div
                key={tier.id}
                variants={divisionTierVariants}
                initial={reduceMotion ? false : 'hidden'}
                whileInView="visible"
                viewport={{ once: true, amount: 0.08 }}
              >
                <DivisionTier>
                  <DivisionTierHeader>
                    <div>
                      <span>{String(tierIndex + 1).padStart(2, '0')}</span>
                      <strong>{tier.label}</strong>
                    </div>
                    <p>{tier.description}</p>
                  </DivisionTierHeader>
                  <DivisionConnector aria-hidden="true">
                    <span />
                    {tier.divisions.map((division) => <i key={division.id} />)}
                  </DivisionConnector>
                  <DivisionScroller>
                    <DivisionGrid>
                      {tier.divisions.map((division) => {
                        const Icon = division.icon;
                        return (
                          <motion.div key={division.id} variants={divisionCardVariants} style={{ minWidth: 0 }}>
                            <DivisionCard
                              data-performance-region="staff-org-node"
                              $accent={division.accent}
                              $accentStrong={division.accentStrong}
                            >
                              <DivisionHeader>
                                <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
                                <div>
                                  <span>{division.englishLabel}</span>
                                  <strong>{division.label}</strong>
                                </div>
                              </DivisionHeader>
                              <DivisionHead
                                type="button"
                                onClick={(event) => openProfile(division.head, event.currentTarget)}
                                aria-label={`${division.head.name} ${division.head.role} 상세 프로필 열기`}
                              >
                                <ProfilePhoto person={division.head} size={78} />
                                <div>
                                  <strong>{division.head.name}</strong>
                                  <span>{division.head.title}</span>
                                  <p>{division.head.description}</p>
                                </div>
                              </DivisionHead>
                              <TeamList>
                                {division.teams.map((team) => {
                                  const teamPerson = buildTeamPerson(division, team);
                                  return (
                                    <TeamButton
                                      key={team.name}
                                      type="button"
                                      onClick={(event) => openProfile(teamPerson, event.currentTarget)}
                                      aria-label={`${team.name} ${team.lead} 상세 프로필 열기`}
                                    >
                                      <ProfilePhoto person={teamPerson} size={36} />
                                      <div>
                                        <strong>{team.name}</strong>
                                        <span>{team.lead}</span>
                                      </div>
                                    </TeamButton>
                                  );
                                })}
                              </TeamList>
                              <DivisionFooter>
                                <span>{division.executive} 직속 · 팀장 10명</span>
                                <BadgeCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                              </DivisionFooter>
                            </DivisionCard>
                          </motion.div>
                        );
                      })}
                    </DivisionGrid>
                  </DivisionScroller>
                </DivisionTier>
              </motion.div>
            ))}
          </DivisionTiers>
        </DivisionSection>

        <SupportSection variants={riseVariants} aria-labelledby="support-title">
          <SupportTitle>
            <span><Network size={21} strokeWidth={1.9} aria-hidden="true" /></span>
            <div>
              <small>STRATEGIC SUPPORT</small>
              <h2 id="support-title">전략적 지원 조직</h2>
            </div>
          </SupportTitle>
          <SupportGrid>
            {SUPPORT_UNITS.map((unit) => {
              const Icon = unit.icon;
              return (
                <SupportCard
                  key={unit.id}
                  type="button"
                  data-performance-region="staff-flow-step"
                  $accent={unit.accent}
                  onClick={(event) => openProfile(unit.lead, event.currentTarget)}
                  aria-label={`${unit.label} ${unit.lead.name} 상세 프로필 열기`}
                >
                  <ProfilePhoto person={unit.lead} size={62} />
                  <SupportCopy>
                    <div>
                      <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                      <strong>{unit.label}</strong>
                    </div>
                    <p>{unit.mission}</p>
                    <span>{unit.lead.title} {unit.lead.name}</span>
                  </SupportCopy>
                  <SupportArrow><ArrowRight size={15} strokeWidth={2.4} aria-hidden="true" /></SupportArrow>
                </SupportCard>
              );
            })}
          </SupportGrid>
        </SupportSection>

        <BottomRail variants={riseVariants}>
          <div>
            <Sparkles size={17} strokeWidth={2.1} aria-hidden="true" />
            <span>AI와 사람이 각자의 강점을 연결해 더 빠르고 선명하게 일합니다.</span>
          </div>
          <Link href="/corp/careers/jobs">
            함께할 포지션 보기
            <ArrowRight size={15} strokeWidth={2.4} aria-hidden="true" />
          </Link>
        </BottomRail>
      </OrgBoard>

      <AnimatePresence>
        {selectedPerson ? (
          <DrawerLayer
            key="profile-drawer"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ProfileDrawer
              ref={drawerRef}
              role="dialog"
              aria-modal="false"
              aria-labelledby="profile-drawer-title"
              initial={reduceMotion ? false : { opacity: 0, x: 42, y: 12, scale: 0.965 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 36, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 27, mass: 0.78 }}
            >
              <DrawerAccent $accent={selectedPerson.accent} aria-hidden="true" />
              <DrawerHeader>
                <div>
                  <span>PROFILE DIRECTORY</span>
                  <strong>{selectedPerson.level} 상세정보</strong>
                </div>
                <DrawerClose ref={closeButtonRef} type="button" onClick={closeProfile} aria-label="프로필 닫기">
                  <X size={20} strokeWidth={2.2} aria-hidden="true" />
                </DrawerClose>
              </DrawerHeader>
              <DrawerBody>
                <DrawerHero $accent={selectedPerson.accent}>
                  <ProfilePhoto person={selectedPerson} size={112} priority />
                  <div>
                    <DrawerRole>{selectedPerson.role}</DrawerRole>
                    <h2 id="profile-drawer-title">{selectedPerson.name}</h2>
                    <span>{selectedPerson.title}</span>
                  </div>
                </DrawerHero>
                <DrawerQuote>
                  <Crown size={17} strokeWidth={2} aria-hidden="true" />
                  <p>{selectedPerson.description}</p>
                </DrawerQuote>
                <DrawerSection>
                  <span>CORE EXPERTISE</span>
                  <MetaList>
                    {selectedPerson.meta.map((item) => <li key={item}>{item}</li>)}
                  </MetaList>
                </DrawerSection>
                <DrawerSection>
                  <span>KEY RESPONSIBILITIES</span>
                  <ResponsibilityList>
                    {selectedPerson.responsibilities.map((item) => (
                      <li key={item}>
                        <CheckCircle2 size={16} strokeWidth={2.1} aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ResponsibilityList>
                </DrawerSection>
              </DrawerBody>
              <DrawerFooter>
                <Link href="/corp/careers/jobs">
                  채용 포지션 확인
                  <ArrowRight size={15} strokeWidth={2.4} aria-hidden="true" />
                </Link>
              </DrawerFooter>
            </ProfileDrawer>
          </DrawerLayer>
        ) : null}
      </AnimatePresence>
    </Page>
  );
}

const Page = styled.main`
  --board-bg: #020919;
  --board-surface: rgba(8, 24, 52, 0.82);
  --board-surface-strong: rgba(8, 28, 62, 0.94);
  --board-line: rgba(98, 181, 255, 0.38);
  --board-ink: #f5f9ff;
  --board-muted: #9eb1ca;
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 100%;
  overflow-x: hidden;
  color: var(--board-ink);
  background: #010713;
  color-scheme: dark;
  font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;

  button,
  a {
    touch-action: manipulation;
    -webkit-tap-highlight-color: rgba(102, 215, 255, 0.18);
  }
`;

const OrgBoard = styled(motion.div)`
  position: relative;
  isolation: isolate;
  width: 100%;
  min-height: 100%;
  display: grid;
  gap: 32px;
  padding: clamp(28px, 3.1vw, 54px) clamp(18px, 2.5vw, 42px) 56px;
  overflow: hidden;
  background:
    radial-gradient(circle at 45% 3%, rgba(26, 91, 186, 0.22), transparent 27%),
    radial-gradient(circle at 98% 16%, rgba(90, 65, 202, 0.16), transparent 25%),
    linear-gradient(rgba(55, 129, 214, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(55, 129, 214, 0.045) 1px, transparent 1px),
    var(--board-bg);
  background-size: auto, auto, 34px 34px, 34px 34px, auto;

  &::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(180deg, transparent 0%, rgba(1, 7, 19, 0.1) 60%, rgba(1, 7, 19, 0.76) 100%);
  }

  @media (max-width: 760px) {
    gap: 24px;
    padding: 22px 14px 42px;
  }
`;

const TopStage = styled(motion.section)`
  display: grid;
  gap: clamp(26px, 2.4vw, 38px);
`;

const HeroCopy = styled.div`
  min-width: 0;
  display: grid;
  justify-items: center;
  text-align: center;
`;

const HeroEyebrow = styled.span`
  width: fit-content;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 16px;
  border: 1px solid rgba(92, 184, 255, 0.7);
  border-radius: 999px;
  color: #65e7ff;
  background: rgba(5, 19, 43, 0.72);
  box-shadow: 0 0 24px rgba(44, 165, 255, 0.08);
  font-size: 0.65rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  white-space: nowrap;

  i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #d5ddff;
  }

  span:last-child {
    color: #e4d8ff;
  }

  @media (max-width: 560px) {
    width: 100%;
    justify-content: center;
    gap: 7px;
    padding: 0 10px;
    font-size: 0.53rem;
    letter-spacing: 0.07em;
  }
`;

const HeroTitle = styled.h1`
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.26em;
  min-height: 54px;
  margin: 16px 0 0;
  color: #f8fbff;
  font-size: clamp(2.4rem, 3vw, 3.2rem);
  font-weight: 950;
  line-height: 1.08;
  letter-spacing: -0.035em;
  word-break: keep-all;
  text-wrap: balance;
  white-space: nowrap;

  span {
    display: inline;
    color: transparent;
    background: linear-gradient(90deg, #80c9ff 0%, #8490ff 49%, #d08eff 100%);
    background-clip: text;
    -webkit-background-clip: text;
  }

  @media (max-width: 1180px) {
    font-size: 2.35rem;
  }

  @media (max-width: 760px) {
    display: block;
    font-size: 2.3rem;
    letter-spacing: -0.025em;
    white-space: normal;

    span {
      display: block;
      margin-top: 5px;
    }
  }
`;

const HeroDescription = styled.p`
  margin: 13px 0 0;
  color: #d8e4f4;
  font-size: clamp(0.9rem, 1.05vw, 1.12rem);
  font-weight: 670;
  line-height: 1.65;
  word-break: keep-all;
`;

const PrincipleRail = styled.div`
  width: min(100%, 1040px);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed rgba(83, 181, 255, 0.32);

  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 10px;
  }
`;

const LeadershipStage = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 276px) minmax(0, 1fr);
  gap: clamp(14px, 1.4vw, 22px);
  align-items: start;

  @media (max-width: 1180px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;

    > [data-ceo-column] {
      grid-column: 1 / -1;
      grid-row: 1;
    }
  }

  @media (max-width: 700px) {
    grid-template-columns: 1fr;

    > [data-ceo-column] {
      grid-column: auto;
      grid-row: auto;
      order: -1;
    }
  }
`;

const PrincipleItem = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  align-items: center;

  > div:last-child {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  strong {
    color: #f1f6ff;
    font-size: 0.74rem;
    font-weight: 900;
  }

  span {
    color: #8498b6;
    font-size: 0.58rem;
    font-weight: 680;
    line-height: 1.35;
    word-break: keep-all;
  }
`;

const PrincipleIcon = styled.div<{ $accent: string }>`
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 64%, transparent);
  border-radius: 12px;
  color: ${(props) => props.$accent};
  background: color-mix(in srgb, ${(props) => props.$accent} 10%, rgba(5, 18, 42, 0.82));
`;

const CeoColumn = styled.div`
  position: relative;
  display: grid;
  justify-items: center;
`;

const CeoCard = styled.button`
  position: relative;
  width: min(238px, 100%);
  min-height: 314px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 18px 16px;
  overflow: hidden;
  border: 1px solid rgba(111, 180, 255, 0.72);
  border-radius: 18px;
  color: var(--board-ink);
  background:
    linear-gradient(180deg, rgba(35, 91, 176, 0.22), rgba(6, 22, 49, 0.91)),
    var(--board-surface);
  box-shadow: 0 22px 54px rgba(0, 0, 0, 0.24), inset 0 1px rgba(255, 255, 255, 0.05);
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 50% 28%, rgba(68, 147, 255, 0.22), transparent 35%),
      linear-gradient(135deg, transparent 60%, rgba(126, 105, 255, 0.1));
  }

  &:hover {
    transform: translateY(-4px);
    border-color: #8feaff;
    box-shadow: 0 26px 62px rgba(0, 0, 0, 0.32), 0 0 28px rgba(70, 165, 255, 0.13);
  }

  &:focus-visible {
    outline: 3px solid #7ee8ff;
    outline-offset: 4px;
  }

  > [data-role-chip] {
    position: absolute;
    z-index: 3;
    top: 16px;
    right: 14px;
  }

  > [data-portrait] {
    margin-top: 9px;
  }

  @media (max-width: 840px) {
    width: min(280px, 100%);
  }
`;

const Portrait = styled.span<{ $size: number; $accent: string }>`
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  display: block;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 68%, white);
  border-radius: 18px;
  background: #132439;
  box-shadow: 0 10px 28px color-mix(in srgb, ${(props) => props.$accent} 18%, transparent);
`;

const AtlasImage = styled(Image)<{ $column: number; $row: number }>`
  position: absolute;
  z-index: 1;
  top: ${(props) => props.$row * -100}%;
  left: ${(props) => props.$column * -100}%;
  width: 400%;
  max-width: none;
  height: 400%;
  object-fit: cover;
`;

const RoleChip = styled.span`
  min-height: 29px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid rgba(135, 218, 255, 0.56);
  border-radius: 7px;
  color: #ffffff;
  background: linear-gradient(135deg, #1688e4, #614ed7);
  box-shadow: 0 6px 16px rgba(50, 103, 225, 0.26);
  font-size: 0.72rem;
  font-weight: 950;
  line-height: 1;
`;

const CeoIdentity = styled.div`
  position: relative;
  z-index: 1;
  display: grid;
  gap: 3px;
  margin-top: 12px;
  text-align: center;

  strong {
    color: #ffffff;
    font-size: 1.35rem;
    font-weight: 950;
  }

  span {
    color: #d0dded;
    font-size: 0.76rem;
    font-weight: 720;
  }
`;

const CeoMission = styled.span`
  position: relative;
  z-index: 1;
  width: 100%;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(116, 182, 255, 0.23);
  color: #abc0dc;
  font-size: 0.64rem;
  font-weight: 720;
  text-align: center;
`;

const CardAction = styled.span`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  color: #7fdcff;
  font-size: 0.6rem;
  font-weight: 850;
`;

const CeoConnector = styled.div`
  width: 100%;
  height: 32px;
  display: grid;
  justify-items: center;

  span {
    width: 1px;
    height: 26px;
    background: linear-gradient(#c8e9ff, rgba(80, 151, 222, 0.38));
  }

  i {
    width: 7px;
    height: 7px;
    margin-top: -3px;
    border-radius: 50%;
    background: #e9f7ff;
    box-shadow: 0 0 12px rgba(118, 204, 255, 0.74);
  }
`;

const GeneralManagerCard = styled.button`
  width: min(276px, 100%);
  min-height: 136px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 14px;
  border: 1px solid rgba(72, 199, 255, 0.66);
  border-radius: 16px;
  color: var(--board-ink);
  background:
    radial-gradient(circle at 15% 30%, rgba(62, 177, 255, 0.2), transparent 42%),
    linear-gradient(135deg, rgba(22, 75, 140, 0.58), rgba(5, 25, 57, 0.94));
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.24), inset 0 1px rgba(255, 255, 255, 0.06);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;

  &:hover {
    transform: translateY(-3px);
    border-color: #9cecff;
    box-shadow: 0 22px 46px rgba(0, 0, 0, 0.3), 0 0 26px rgba(72, 199, 255, 0.12);
  }

  &:focus-visible {
    outline: 3px solid #7ee8ff;
    outline-offset: 4px;
  }

  @media (max-width: 840px) {
    width: min(320px, 100%);
  }
`;

const GeneralManagerIdentity = styled.div`
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: 4px;

  > [data-role-chip] {
    min-height: 24px;
    margin-bottom: 2px;
    padding-inline: 8px;
    font-size: 0.6rem;
  }

  strong {
    color: #ffffff;
    font-size: 1rem;
    font-weight: 950;
  }

  > span:not([data-role-chip]) {
    color: #cae0f4;
    font-size: 0.65rem;
    font-weight: 760;
  }

  p {
    margin: 2px 0 0;
    color: #8eabc8;
    font-size: 0.56rem;
    font-weight: 650;
    line-height: 1.45;
    word-break: keep-all;
  }
`;

const GeneralManagerConnector = styled.div`
  width: 100%;
  height: 34px;
  display: grid;
  justify-items: center;

  span {
    width: 1px;
    height: 34px;
    background: linear-gradient(#d5f1ff, rgba(80, 151, 222, 0.22));
  }
`;

const ExecutiveArea = styled.div`
  min-width: 0;
`;

const ExecutiveHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #d9e7fb;

  svg {
    color: #8aa8ff;
  }

  strong {
    font-size: 0.96rem;
    font-weight: 900;
  }
`;

const ExecutiveConnector = styled.div`
  position: relative;
  height: 28px;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 50%;
    width: 1px;
    height: 12px;
    background: #c8e9ff;
  }

  span {
    position: absolute;
    top: 12px;
    left: 25%;
    right: 25%;
    height: 1px;
    background: linear-gradient(90deg, rgba(92, 171, 241, 0.28), #bce2ff, rgba(92, 171, 241, 0.28));
  }

  @media (max-width: 650px) {
    display: none;
  }
`;

const ExecutiveGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
`;

const ExecutiveCard = styled.button<{ $accent: string }>`
  position: relative;
  min-width: 0;
  min-height: 222px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 10px 13px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 58%, rgba(99, 170, 240, 0.42));
  border-radius: 15px;
  color: var(--board-ink);
  background:
    linear-gradient(180deg, color-mix(in srgb, ${(props) => props.$accent} 13%, transparent), transparent 50%),
    rgba(5, 21, 48, 0.88);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 170ms ease, border-color 170ms ease, background 170ms ease;

  &::before {
    content: "";
    position: absolute;
    top: -29px;
    left: 50%;
    width: 1px;
    height: 29px;
    background: color-mix(in srgb, ${(props) => props.$accent} 60%, #bce2ff);
  }

  &:hover {
    transform: translateY(-4px);
    border-color: color-mix(in srgb, ${(props) => props.$accent} 78%, white);
    background:
      linear-gradient(180deg, color-mix(in srgb, ${(props) => props.$accent} 19%, transparent), transparent 55%),
      rgba(6, 25, 56, 0.95);
  }

  &:focus-visible {
    outline: 3px solid ${(props) => props.$accent};
    outline-offset: 3px;
  }

  > p {
    min-height: 2.8em;
    margin: 9px 0 0;
    color: #a9bcd6;
    font-size: 0.58rem;
    font-weight: 680;
    line-height: 1.45;
    text-align: center;
    word-break: keep-all;
  }

  @media (max-width: 650px) {
    min-height: 214px;

    &::before {
      display: none;
    }
  }
`;

const ExecutivePhoto = styled.div`
  position: relative;

  > ${RoleChip} {
    position: absolute;
    z-index: 3;
    top: -2px;
    right: -7px;
    min-height: 24px;
    padding: 0 7px;
    font-size: 0.61rem;
  }
`;

const ExecutiveIdentity = styled.div`
  display: grid;
  gap: 2px;
  margin-top: 9px;
  text-align: center;

  strong {
    color: #ffffff;
    font-size: 0.88rem;
    font-weight: 930;
  }

  span {
    color: #c8d7eb;
    font-size: 0.62rem;
    font-weight: 700;
  }
`;

const DivisionSection = styled(motion.section)`
  position: relative;
  min-width: 0;
`;

const SectionTopline = styled.header`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;

  h2 {
    margin: 7px 0 0;
    color: #f4f8ff;
    font-size: 1.45rem;
    font-weight: 950;
  }

  @media (max-width: 650px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const SectionIntro = styled.p`
  max-width: 680px;
  margin: 8px 0 0;
  color: #8fa6c3;
  font-size: 0.72rem;
  font-weight: 660;
  line-height: 1.55;
  word-break: keep-all;
`;

const SectionEyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #62dff4;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.12em;
`;

const SectionSummary = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px;
  border: 1px solid rgba(101, 163, 230, 0.22);
  border-radius: 12px;
  background: rgba(5, 19, 43, 0.62);

  span {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border-radius: 8px;
    color: #afc0d9;
    background: rgba(77, 137, 205, 0.09);
    font-size: 0.62rem;
    font-weight: 760;
  }

  strong {
    color: #75e4ff;
    font-size: 0.88rem;
    font-weight: 950;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 560px) {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));

    span {
      justify-content: center;
      padding-inline: 5px;
      font-size: 0.56rem;
    }
  }
`;

const DivisionTiers = styled.div`
  display: grid;
  gap: clamp(30px, 3vw, 46px);
  margin-top: 24px;
`;

const DivisionTier = styled.div`
  min-width: 0;
`;

const DivisionTierHeader = styled.header`
  min-height: 46px;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  padding: 0 2px;

  > div {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  > div > span {
    min-width: 31px;
    min-height: 25px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(97, 203, 255, 0.4);
    border-radius: 7px;
    color: #6cdbf7;
    background: rgba(36, 125, 179, 0.14);
    font-size: 0.55rem;
    font-weight: 900;
  }

  strong {
    color: #e8f2ff;
    font-size: 0.88rem;
    font-weight: 900;
  }

  p {
    margin: 0;
    color: #718baa;
    font-size: 0.61rem;
    font-weight: 680;
    text-align: right;
    word-break: keep-all;
  }

  @media (max-width: 650px) {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;

    p {
      text-align: left;
    }
  }
`;

const DivisionConnector = styled.div`
  position: relative;
  min-width: 0;
  height: 34px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 10px;

  span {
    position: absolute;
    top: 13px;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(90deg, rgba(55, 143, 226, 0.25), #549fe8 16%, #87b9ea 50%, #549fe8 84%, rgba(55, 143, 226, 0.25));

    &::after {
      content: "";
      position: absolute;
      top: -1px;
      left: 0;
      width: 8%;
      height: 3px;
      border-radius: 999px;
      background: linear-gradient(90deg, transparent, #b8efff, transparent);
      filter: drop-shadow(0 0 8px rgba(94, 215, 255, 0.92));
      animation: division-signal 5.8s cubic-bezier(0.45, 0, 0.2, 1) infinite;
    }
  }

  i {
    position: relative;

    &::before {
      content: "";
      position: absolute;
      top: 13px;
      left: 50%;
      width: 1px;
      height: 21px;
      background: rgba(91, 169, 237, 0.78);
    }
  }

  @media (max-width: 1180px) {
    display: none;
  }

  @keyframes division-signal {
    0%,
    12% {
      opacity: 0;
      transform: translateX(0);
    }
    22% {
      opacity: 1;
    }
    78% {
      opacity: 1;
    }
    88%,
    100% {
      opacity: 0;
      transform: translateX(1150%);
    }
  }
`;

const DivisionScroller = styled.div`
  min-width: 0;
  overflow: visible;
`;

const DivisionGrid = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1180px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    gap: 14px;
  }
`;

const DivisionCard = styled.article<{ $accent: string; $accentStrong: string }>`
  container-type: inline-size;
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 62%, rgba(61, 126, 194, 0.46));
  border-radius: 14px;
  background:
    linear-gradient(180deg, color-mix(in srgb, ${(props) => props.$accentStrong} 14%, transparent), transparent 34%),
    rgba(5, 20, 46, 0.92);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.18), inset 0 1px rgba(255, 255, 255, 0.04);
  content-visibility: auto;
  contain-intrinsic-size: 682px;
  transition: border-color 180ms ease, box-shadow 180ms ease, filter 180ms ease;

  &:hover {
    border-color: color-mix(in srgb, ${(props) => props.$accent} 82%, white);
    box-shadow:
      0 24px 52px rgba(0, 0, 0, 0.28),
      0 0 30px color-mix(in srgb, ${(props) => props.$accent} 12%, transparent),
      inset 0 1px rgba(255, 255, 255, 0.06);
    filter: saturate(1.07);
  }
`;

const DivisionHeader = styled.header`
  min-height: 55px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 11px;
  color: #ffffff;
  background: linear-gradient(135deg, color-mix(in srgb, currentColor 12%, transparent), rgba(255, 255, 255, 0.035));
  border-bottom: 1px solid rgba(150, 202, 255, 0.2);

  > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  span {
    overflow: hidden;
    color: #9eb8da;
    font-size: 0.47rem;
    font-weight: 850;
    letter-spacing: 0.06em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    overflow: hidden;
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 920;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const DivisionHead = styled.button`
  width: 100%;
  min-height: 154px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  padding: 11px;
  border: 0;
  border-bottom: 1px solid rgba(122, 181, 238, 0.16);
  color: inherit;
  background: rgba(10, 31, 65, 0.3);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 160ms ease;

  &:hover {
    background: rgba(25, 62, 111, 0.45);
  }

  &:hover > div {
    transform: translateX(3px);
  }

  &:focus-visible {
    outline: 3px solid #79e3ff;
    outline-offset: -3px;
  }

  > div {
    min-width: 0;
    transition: transform 160ms ease;
  }

  strong {
    display: block;
    overflow: hidden;
    color: #ffffff;
    font-size: 0.76rem;
    font-weight: 930;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    display: block;
    margin-top: 3px;
    color: #b8c8df;
    font-size: 0.56rem;
    font-weight: 760;
  }

  p {
    display: -webkit-box;
    margin: 7px 0 0;
    overflow: hidden;
    color: #8297b4;
    font-size: 0.49rem;
    font-weight: 640;
    line-height: 1.42;
    word-break: keep-all;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  @media (max-width: 760px) {
    grid-template-columns: auto minmax(0, 1fr);

    strong {
      font-size: 0.9rem;
    }

    span {
      font-size: 0.67rem;
    }

    p {
      font-size: 0.61rem;
      -webkit-line-clamp: 2;
    }
  }
`;

const TeamList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @container (max-width: 230px) {
    grid-template-columns: 1fr;
  }
`;

const TeamButton = styled.button`
  min-width: 0;
  width: 100%;
  min-height: 70px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  padding: 7px 8px;
  border: 0;
  border-bottom: 1px solid rgba(110, 168, 224, 0.12);
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 150ms ease;

  &:nth-child(odd) {
    border-right: 1px solid rgba(110, 168, 224, 0.12);
  }

  &:hover {
    background: rgba(66, 130, 199, 0.13);
  }

  &:hover > div {
    transform: translateX(2px);
  }

  &:focus-visible {
    outline: 3px solid #79e3ff;
    outline-offset: -3px;
  }

  > div {
    min-width: 0;
    display: grid;
    gap: 3px;
    transition: transform 150ms ease;
  }

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #d8e8fb;
    font-size: 0.59rem;
    font-weight: 850;
  }

  span {
    color: #8499b5;
    font-size: 0.5rem;
    font-weight: 680;
  }

  @container (max-width: 230px) {
    min-height: 52px;
    padding-inline: 10px;

    &:nth-child(odd) {
      border-right: 0;
    }

    strong {
      font-size: 0.56rem;
    }
  }

  @media (max-width: 760px) {
    min-height: 64px;

    strong {
      font-size: 0.73rem;
    }

    span {
      font-size: 0.62rem;
    }
  }
`;

const DivisionFooter = styled.footer`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  color: #83cfff;
  background: rgba(6, 18, 41, 0.78);

  span {
    font-size: 0.49rem;
    font-weight: 820;
  }
`;

const SupportSection = styled(motion.section)`
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 22px;
  align-items: center;
  padding-top: 28px;
  border-top: 1px solid rgba(70, 151, 224, 0.34);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const SupportTitle = styled.header`
  display: grid;
  justify-items: start;
  gap: 12px;

  > span {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(112, 180, 255, 0.42);
    border-radius: 12px;
    color: #7dbbff;
    background: rgba(37, 91, 156, 0.16);
  }

  small {
    color: #738eaf;
    font-size: 0.53rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  h2 {
    margin: 4px 0 0;
    color: #f0f6ff;
    font-size: 1.05rem;
    font-weight: 940;
    line-height: 1.25;
    word-break: keep-all;
  }

  @media (max-width: 900px) {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }
`;

const SupportGrid = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1500px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > :last-child {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;

    > :last-child {
      grid-column: auto;
    }
  }
`;

const SupportCard = styled.button<{ $accent: string }>`
  position: relative;
  min-width: 0;
  min-height: 128px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 14px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 48%, rgba(75, 139, 207, 0.42));
  border-radius: 13px;
  color: inherit;
  background:
    linear-gradient(135deg, color-mix(in srgb, ${(props) => props.$accent} 10%, transparent), transparent 48%),
    rgba(6, 21, 47, 0.88);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
  content-visibility: auto;
  contain-intrinsic-size: 128px;

  &:hover {
    transform: translateY(-3px);
    border-color: ${(props) => props.$accent};
    background:
      linear-gradient(135deg, color-mix(in srgb, ${(props) => props.$accent} 16%, transparent), transparent 52%),
      rgba(8, 27, 59, 0.96);
  }

  &:focus-visible {
    outline: 3px solid ${(props) => props.$accent};
    outline-offset: 3px;
  }
`;

const SupportCopy = styled.div`
  min-width: 0;

  > div {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #91c7ff;
  }

  strong {
    overflow: hidden;
    color: #eaf3ff;
    font-size: 0.7rem;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    min-height: 2.8em;
    margin: 8px 0 0;
    color: #91a5c0;
    font-size: 0.56rem;
    font-weight: 650;
    line-height: 1.4;
    word-break: keep-all;
  }

  > span {
    display: block;
    margin-top: 9px;
    color: #c3d5ec;
    font-size: 0.58rem;
    font-weight: 760;
  }
`;

const SupportArrow = styled.span`
  position: absolute;
  right: 10px;
  bottom: 9px;
  color: #6fc6ff;
`;

const BottomRail = styled(motion.footer)`
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 13px 16px;
  border: 1px solid rgba(83, 162, 231, 0.23);
  border-radius: 13px;
  background: rgba(6, 20, 44, 0.78);

  > div {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #77dff5;
  }

  > div span {
    color: #9fb3ce;
    font-size: 0.69rem;
    font-weight: 680;
  }

  a {
    flex: 0 0 auto;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 13px;
    border: 1px solid rgba(109, 210, 255, 0.48);
    border-radius: 9px;
    color: #e9f8ff;
    background: rgba(33, 123, 188, 0.2);
    font-size: 0.66rem;
    font-weight: 850;
    text-decoration: none;
    transition: transform 150ms ease, background 150ms ease;
  }

  a:hover {
    transform: translateY(-2px);
    background: rgba(33, 123, 188, 0.34);
  }

  a:focus-visible {
    outline: 3px solid #6ee3ff;
    outline-offset: 3px;
  }

  @media (max-width: 650px) {
    align-items: stretch;
    flex-direction: column;

    a {
      width: 100%;
    }
  }
`;

const DrawerLayer = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 3000;
  pointer-events: none;
`;

const ProfileDrawer = styled(motion.aside)`
  position: absolute;
  z-index: 1;
  top: clamp(76px, 8vh, 104px);
  right: clamp(12px, 1.6vw, 26px);
  bottom: clamp(12px, 1.6vw, 24px);
  width: min(438px, calc(100vw - 28px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  border: 1px solid rgba(105, 191, 255, 0.48);
  border-radius: 22px;
  color: #edf6ff;
  background:
    radial-gradient(circle at 86% 0%, rgba(72, 119, 221, 0.18), transparent 34%),
    linear-gradient(180deg, rgba(7, 22, 47, 0.985), rgba(4, 15, 34, 0.99));
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(132, 222, 255, 0.06) inset,
    0 0 48px rgba(66, 170, 238, 0.1);

  @media (max-width: 700px) {
    top: auto;
    right: 10px;
    bottom: 10px;
    left: 10px;
    width: auto;
    height: min(74dvh, 680px);
    max-height: min(74dvh, 680px);
    border-radius: 20px;
  }
`;

const DrawerAccent = styled.div<{ $accent: string }>`
  position: absolute;
  z-index: 4;
  top: 0;
  left: 26px;
  right: 26px;
  height: 2px;
  border-radius: 0 0 999px 999px;
  background: linear-gradient(90deg, transparent, ${(props) => props.$accent}, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, ${(props) => props.$accent} 55%, transparent);
`;

const DrawerHeader = styled.header`
  flex: 0 0 auto;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 13px 16px 13px 22px;
  border-bottom: 1px solid rgba(104, 174, 241, 0.2);
  background: rgba(5, 17, 38, 0.94);

  > div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  span {
    color: #69ddf4;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  strong {
    color: #b7c9df;
    font-size: 0.72rem;
    font-weight: 760;
  }
`;

const DrawerClose = styled.button`
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(106, 178, 243, 0.26);
  border-radius: 11px;
  color: #cce1f8;
  background: rgba(18, 48, 85, 0.5);
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;

  &:hover {
    color: #ffffff;
    border-color: #6ddff6;
    background: rgba(37, 93, 145, 0.64);
  }

  &:focus-visible {
    outline: 3px solid #6ddff6;
    outline-offset: 2px;
  }
`;

const DrawerBody = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-auto-rows: max-content;
  align-content: start;
  gap: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 22px;

  @media (max-width: 520px) {
    padding: 18px 14px;
  }
`;

const DrawerHero = styled.section<{ $accent: string }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  padding: 20px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 50%, rgba(87, 150, 211, 0.4));
  border-radius: 18px;
  background:
    radial-gradient(circle at 90% 12%, color-mix(in srgb, ${(props) => props.$accent} 18%, transparent), transparent 34%),
    rgba(8, 27, 57, 0.84);

  > div {
    min-width: 0;
  }

  h2 {
    margin: 7px 0 0;
    color: #ffffff;
    font-size: 1.8rem;
    font-weight: 950;
    line-height: 1.05;
    word-break: keep-all;
  }

  > div > span:last-child {
    display: block;
    margin-top: 7px;
    color: #b2c5dc;
    font-size: 0.74rem;
    font-weight: 720;
  }

  @media (max-width: 390px) {
    grid-template-columns: 1fr;
  }
`;

const DrawerRole = styled.span`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid rgba(107, 219, 244, 0.4);
  border-radius: 7px;
  color: #7ee8ff;
  background: rgba(23, 124, 165, 0.18);
  font-size: 0.62rem;
  font-weight: 880;
`;

const DrawerQuote = styled.blockquote`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 16px 17px;
  border-left: 3px solid #57d7ef;
  border-radius: 0 13px 13px 0;
  color: #69ddf4;
  background: rgba(21, 91, 126, 0.18);

  p {
    margin: 0;
    color: #b8cde4;
    font-size: 0.76rem;
    font-weight: 680;
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const DrawerSection = styled.section`
  padding: 17px;
  border: 1px solid rgba(97, 161, 222, 0.2);
  border-radius: 14px;
  background: rgba(8, 25, 52, 0.72);

  > span {
    color: #73dff5;
    font-size: 0.57rem;
    font-weight: 900;
    letter-spacing: 0.11em;
  }
`;

const MetaList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;

  li {
    padding: 7px 9px;
    border: 1px solid rgba(108, 169, 225, 0.23);
    border-radius: 999px;
    color: #bfd3ea;
    background: rgba(27, 59, 95, 0.48);
    font-size: 0.64rem;
    font-weight: 760;
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
    color: #63dbf2;
  }

  span {
    color: #afc3db;
    font-size: 0.7rem;
    font-weight: 690;
    line-height: 1.5;
  }
`;

const DrawerFooter = styled.footer`
  flex: 0 0 auto;
  padding: 14px 22px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(104, 174, 241, 0.2);
  background: rgba(5, 17, 38, 0.94);

  a {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 11px;
    color: #03101e;
    background: linear-gradient(135deg, #75e8ff, #7da7ff);
    font-size: 0.72rem;
    font-weight: 900;
    text-decoration: none;
    transition: transform 150ms ease, filter 150ms ease;
  }

  a:hover {
    transform: translateY(-2px);
    filter: brightness(1.07);
  }

  a:focus-visible {
    outline: 3px solid #ffffff;
    outline-offset: 3px;
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
