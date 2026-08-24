'use client';

import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  ClipboardCheck,
  Coffee,
  Cpu,
  Eye,
  FileSearch,
  Gift,
  Handshake,
  HeartHandshake,
  HelpCircle,
  Home,
  Mail,
  Megaphone,
  MessageCircle,
  Network,
  NotebookPen,
  PiggyBank,
  ReceiptText,
  Route,
  ShieldCheck,
  Send,
  Soup,
  Sparkles,
  Store,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CORP_PAGE_DEFINITIONS } from '@/constants/corpPages';
import {
  AdvertisingScene,
  BriefCta,
  BriefFact,
  BriefFacts,
  BriefFootnote,
  BriefHeader,
  BusinessLab,
  BusinessPanel,
  BusinessTab,
  BusinessTabs,
  Chapter,
  ChapterIntro,
  ChapterLabel,
  ChapterLead,
  ChapterNav,
  ChapterNavButton,
  ChapterNavInner,
  ChapterTitle,
  ChemistryCopy,
  ChemistryPanel,
  ChemistryQuestion,
  ChemistryResult,
  ChemistrySection,
  Constellation,
  ContactButton,
  DayStep,
  EvidenceSection,
  EvidenceStatus,
  FaqItem,
  FaqList,
  FaqSection,
  FinalCopy,
  FinalSection,
  FormatCard,
  FormatGrid,
  FitColumn,
  FitGrid,
  Hero,
  HeroActions,
  HeroCopy,
  HeroLead,
  HeroMarquee,
  HeroTitle,
  HumanBrief,
  HundredDays,
  InvestmentLetter,
  JourneyRail,
  JourneySection,
  JourneyStep,
  Kicker,
  LetterMark,
  LevelCard,
  LevelGrid,
  LoopRail,
  LoopStep,
  MiniList,
  Page,
  PageInner,
  PanelLists,
  PanelTop,
  PrimaryAction,
  ProgressFill,
  ProgressTrack,
  PromiseCard,
  PromiseGrid,
  PromiseSection,
  PracticalBrief,
  QuestionCourt,
  QuestionList,
  RadioMeter,
  RadioPanel,
  Receipt,
  RecordGrid,
  RecordItem,
  SpendCard,
  SpendGrid,
  SponsorshipScene,
  StageCaption,
  StageCenter,
  StageNode,
  StoryAside,
  TextAction,
  ThesisCard,
  ThesisGrid,
} from './PartnershipHubExperience.styles';

export type PartnershipChapterId = 'business' | 'advertising' | 'investment' | 'sponsorship';

interface PartnershipHubExperienceProps {
  initialChapter?: PartnershipChapterId;
}

interface ChapterDefinition {
  id: PartnershipChapterId;
  number: string;
  label: string;
  eyebrow: string;
  title: string;
  summary: string;
  route: string;
  accent: string;
  icon: LucideIcon;
}

interface BusinessModel {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  summary: string;
  fit: string;
  steps: string[];
  outcomes: string[];
  accent: string;
  icon: LucideIcon;
}

interface BriefFactDefinition {
  label: string;
  value: string;
  note: string;
}

interface PartnershipBriefDefinition {
  eyebrow: string;
  title: string;
  description: string;
  facts: readonly BriefFactDefinition[];
  fit: readonly string[];
  pause: readonly string[];
  note: string;
  ctaLabel: string;
}

const CHAPTERS: readonly ChapterDefinition[] = [
  {
    id: 'business',
    number: '01',
    label: '사업',
    eyebrow: 'BUILD TOGETHER',
    title: '같이 벌기 전에, 같이 풀 문제부터 찾습니다.',
    summary: '접점·기술·운영을 연결해 작은 파일럿으로 가능성을 증명합니다.',
    route: '/corp/partnership/business',
    accent: '#5eead4',
    icon: Handshake,
  },
  {
    id: 'advertising',
    number: '02',
    label: '광고',
    eyebrow: 'BE REMEMBERED',
    title: '광고비보다 오래 남는 장면을 만듭니다.',
    summary: '노출 숫자만 세지 않고 사람이 기억하고 말하고 싶은 이야기를 설계합니다.',
    route: '/corp/partnership/advertising',
    accent: '#ffcf5a',
    icon: Megaphone,
  },
  {
    id: 'investment',
    number: '03',
    label: '투자',
    eyebrow: 'LONGER QUESTIONS',
    title: '돈보다 긴 질문을 함께 나눕니다.',
    summary: '좋은 날의 그래프뿐 아니라 어려운 날의 태도까지 솔직하게 엽니다.',
    route: '/corp/partnership/investment',
    accent: '#7dd3fc',
    icon: CircleDollarSign,
  },
  {
    id: 'sponsorship',
    number: '04',
    label: '후원',
    eyebrow: 'KEEP IT ALIVE',
    title: '거창한 명분보다 오늘의 계속을 돕습니다.',
    summary: '밥·월세·커피처럼 숨기지 않아도 되는 현실이 다음 업데이트로 돌아옵니다.',
    route: '/corp/partnership/sponsorship',
    accent: '#fb8da1',
    icon: HeartHandshake,
  },
] as const;

const BUSINESS_MODELS: readonly BusinessModel[] = [
  {
    id: 'market-entry',
    label: '시장 확장',
    eyebrow: 'MARKET ENTRY',
    title: '낯선 시장에 혼자 들어가지 않는 법',
    summary: '이미 신뢰받는 접점과 PRO PIG의 실행력을 묶어 새로운 고객군을 작게 검증합니다.',
    fit: '지역·업종 고객 접점이나 유통 채널을 가진 파트너',
    steps: ['공동 타깃 정의', '4–8주 파일럿 설계', '확장 조건과 중단 기준 합의'],
    outcomes: ['신규 고객 접점', '실증 데이터', '공동 영업 자료'],
    accent: '#5eead4',
    icon: Store,
  },
  {
    id: 'platform-sync',
    label: '기술 연결',
    eyebrow: 'PLATFORM SYNC',
    title: '두 서비스가 서로 말이 통하게 하는 법',
    summary: 'API와 데이터, 관리자 흐름을 연결해 양쪽 사용자의 반복 업무를 줄입니다.',
    fit: '연결 가능한 서비스·데이터·API를 운영하는 파트너',
    steps: ['연동 기능 선정', '데이터·권한 정책 검토', '테스트 환경과 단계 배포'],
    outcomes: ['공동 기능 출시', '중복 업무 자동화', '운영 리포트 일원화'],
    accent: '#7dd3fc',
    icon: Cpu,
  },
  {
    id: 'joint-operation',
    label: '공동 운영',
    eyebrow: 'JOINT OPERATION',
    title: '좋을 때만 친구인 제휴를 피하는 법',
    summary: '기획부터 정산까지 역할을 나누고, 일이 꼬였을 때 누가 풀지도 먼저 정합니다.',
    fit: '긴 호흡의 사업과 수익 모델을 함께 운영할 파트너',
    steps: ['공동 사업안 정리', '역할·비용 구조 합의', '운영 회의체와 회고 주기 설정'],
    outcomes: ['공동 브랜드 사업', '장기 운영 수익', '반복 가능한 실행 매뉴얼'],
    accent: '#f5c766',
    icon: Network,
  },
  {
    id: 'brand-growth',
    label: '브랜드 성장',
    eyebrow: 'BRAND GROWTH',
    title: '서로의 이름을 빌리지 않고 키우는 법',
    summary: '공동 메시지와 채널을 설계해 양쪽 브랜드가 함께 신뢰받는 장면을 만듭니다.',
    fit: '콘텐츠·미디어·커뮤니티 채널을 함께 키울 파트너',
    steps: ['공동 메시지 정의', '콘텐츠 패키지 구성', '채널별 성과와 반응 회고'],
    outcomes: ['브랜드 신뢰 강화', '캠페인 전환 데이터', '재사용 콘텐츠 자산'],
    accent: '#fb8da1',
    icon: Building2,
  },
] as const;

const ADVERTISING_FORMATS = [
  ['BRAND FILM', '브랜드의 이유를 한 편의 사람 이야기로', '스킵 버튼 앞에서도 3초는 더 머물고 싶은 장면을 만듭니다.', BookOpen],
  ['SOCIAL SERIES', '한 번 보고 끝나지 않는 연재형 콘텐츠', '알고리즘보다 먼저 사람의 단체 채팅방에 도착할 이야기를 찾습니다.', MessageCircle],
  ['EXPERIENCE', '직접 만지고 웃고 기억하는 캠페인', '광고를 놀다가 얻은 추억처럼 바꾸는 온·오프라인 경험입니다.', Sparkles],
  ['PERFORMANCE', '감성과 숫자가 서로 삐치지 않는 운영', '클릭뿐 아니라 댓글의 표정, 저장 이유, 재방문까지 함께 읽습니다.', BarChart3],
] as const;

const ADVERTISING_PROCESS = [
  ['01', '마음부터 인터뷰', '브랜드가 지키고 싶은 것과 고객이 진짜 서운한 지점을 함께 묻습니다.'],
  ['02', '한 문장에 모이기', '회의실에서만 멋있는 말 대신 친구에게 전할 수 있는 문장을 고릅니다.'],
  ['03', '작게 세상에 내놓기', '전체 예산을 태우기 전에 작은 소재와 채널로 안전하게 반응을 봅니다.'],
  ['04', '댓글의 표정 읽기', '왜 웃고, 왜 저장하고, 어디에서 멈췄는지 숫자와 말투를 같이 봅니다.'],
  ['05', '다음 편을 남기기', '성공과 실패를 재사용 가능한 기록으로 정리해 다음 캠페인을 더 똑똑하게 만듭니다.'],
] as const;

const INVESTMENT_THESES = [
  ['PROBLEM', '불편함을 오래 지켜본 팀', '유행하는 문제를 빌리지 않고 직접 겪고 반복해서 관찰한 문제를 고릅니다.', Eye],
  ['EXECUTION', '슬라이드보다 먼저 움직이는 팀', '완벽한 계획을 기다리기보다 작은 결과물을 내고 고객 반응으로 다음 결정을 만듭니다.', Route],
  ['ECONOMICS', '매출과 비용의 표정을 숨기지 않는 팀', '좋은 숫자만 확대하지 않고 성장 비용과 반복 구매 가능성을 같은 표에서 봅니다.', CircleDollarSign],
  ['PARTNERSHIP', '나쁜 소식도 빨리 말할 준비가 된 팀', '박수보다 이견을 견디고, 어려울 때 더 가까이 대화할 파트너를 기다립니다.', HeartHandshake],
] as const;

const INVESTMENT_QUESTIONS = [
  '대표가 휴가를 가도 일주일은 굴러갈 수 있나요?',
  '고객이 칭찬한 기능과 실제 돈을 낸 이유가 같은가요?',
  '이번 달 숫자가 덜 반짝이는 이유를 다음 달에도 같은 말로 설명할 건가요?',
  'AI가 없어도 필요한 사업이고, AI가 있으면 얼마나 더 좋아지나요?',
  '가장 뼈아픈 실패 하나가 지금의 운영 규칙을 어떻게 바꿨나요?',
  '투자금이 예상보다 늦어져도 지키고 싶은 약속은 무엇인가요?',
] as const;

const INVESTMENT_DAYS = [
  ['D+00', '같은 지도를 펼칩니다', '목적·의사결정·보고 방식과 서로 밟지 않을 선부터 맞춥니다.'],
  ['D+14', '숫자의 출처를 연결합니다', '핵심 지표의 정의와 원천 데이터를 정리해 같은 숫자를 다르게 읽는 일을 막습니다.'],
  ['D+30', '가장 위험한 가설을 깹니다', '시장·제품·운영 중 실패 비용이 큰 가정을 실제 실험으로 확인합니다.'],
  ['D+60', '사람과 시스템을 보강합니다', '한 사람의 체력으로 버티는 일을 채용·자동화·문서화로 팀의 역량으로 바꿉니다.'],
  ['D+100', '다음 300일을 결정합니다', '성과와 오차를 함께 리뷰하고 확장·집중·수정의 기준을 다시 합의합니다.'],
] as const;

const SPENDING_ITEMS = [
  ['월세 생존권', '천장이 있는 사무실 겸 방', Home, '#f5c766'],
  ['밥값 방어선', '회의 전 국밥, 회의 후 김밥', Soup, '#5eead4'],
  ['카페인 연구비', '새벽 배포를 위한 합법 연료', Coffee, '#fb8da1'],
] as const;

const SUPPORT_LEVELS = [
  ['3,000원부터', '커피 동료', '졸린 오후 한 시간을 깨우고 미뤄둔 오류 한 줄을 다시 보게 합니다.'],
  ['10,000원부터', '든든한 한 끼', '배고픔보다 아이디어를 먼저 생각할 수 있는 저녁 한 끼가 됩니다.'],
  ['30,000원부터', '반나절의 집중', '급한 생계 걱정을 잠시 내려놓고 기능 하나를 끝까지 다듬는 시간이 됩니다.'],
  ['100,000원부터', '한 달의 숨', '서버비와 생활비 사이에서 포기 대신 다음 업데이트를 고를 여유가 됩니다.'],
] as const;

const SUPPORT_LOOP = [
  ['01', '마음이 도착합니다', '금액보다 한 사람이 다른 사람의 계속을 응원한 마음으로 받습니다.'],
  ['02', '오늘을 지킵니다', '밥·월세·커피처럼 숨길 이유 없는 현실을 버티는 데 먼저 보탭니다.'],
  ['03', '서비스에 돌아옵니다', '버틴 시간은 덜 불편한 화면과 오래 살아남는 기능으로 되돌아옵니다.'],
  ['04', '기록으로 남깁니다', '좋았던 일뿐 아니라 늦어진 이유와 실패한 시도도 가능한 범위에서 나눕니다.'],
] as const;

const PARTNERSHIP_BRIEFS: Record<PartnershipChapterId, PartnershipBriefDefinition> = {
  business: {
    eyebrow: 'PILOT BRIEF · 계약서보다 먼저 맞출 것',
    title: '작게 시작해도, 역할과 끝나는 기준은 크게 적습니다.',
    description: '“같이 해보죠”가 담당자 없는 단체 채팅방으로 끝나지 않도록 첫 실험의 범위와 책임, 멈출 조건까지 한 장에 정리합니다.',
    facts: [
      { label: '추천 대상', value: '고객 접점·기술·운영 자산 중 하나를 가진 팀', note: '회사 크기보다 서로 보완할 실제 자원을 봅니다.' },
      { label: '첫 결과', value: '탐색 1–2주 · 파일럿 4–8주', note: '범위와 의사결정 속도에 따라 달라지는 목표 일정입니다.' },
      { label: '첫 미팅 준비물', value: '문제 한 문장 · 담당자 · 제공 가능한 자원', note: '완성된 사업계획서는 없어도 괜찮습니다.' },
      { label: '함께 남길 것', value: '역할표 · 파일럿안 · 성공/중단 기준 · 회고', note: '확장하지 않더라도 다음 판단에 쓸 기록을 남깁니다.' },
    ],
    fit: ['고객의 불편을 구체적으로 설명할 수 있습니다.', '실무 담당자와 의사결정자가 대화에 참여합니다.', '작은 실험으로 먼저 확인할 수 있습니다.', '불리한 결과도 숨기지 않고 함께 봅니다.'],
    pause: ['“시너지”는 많지만 고객 문제가 보이지 않습니다.', '역할·비용·위험을 한쪽에만 맡기려 합니다.', '검증 전에 장기 독점이나 대규모 계약을 먼저 원합니다.'],
    note: '비용·수익 배분은 범위와 역할을 확인한 뒤 공동 견적과 서면 합의로 정합니다. 이 페이지는 특정 매출이나 제휴 성과를 보장하지 않습니다.',
    ctaLabel: '4–8주 파일럿 제안하기',
  },
  advertising: {
    eyebrow: 'CAMPAIGN BRIEF · 감성과 정산이 만나는 곳',
    title: '좋은 장면을 만들기 전에, 무엇을 얼마나 책임질지 적습니다.',
    description: '재미있는 카피 뒤에 제작 범위와 사용 권리, 예산과 측정 기준을 숨기지 않습니다. 그래야 브랜드도 만드는 사람도 오래 웃을 수 있습니다.',
    facts: [
      { label: '추천 대상', value: '고객 문제와 타깃이 분명한 브랜드', note: '유명한 브랜드보다 말할 이유가 있는 브랜드를 기다립니다.' },
      { label: '첫 결과', value: '브리프 1주 · 파일럿 소재 2–4주', note: '검수 횟수와 제작 난이도에 따라 일정은 달라집니다.' },
      { label: '첫 미팅 준비물', value: '제품 정보 · 브랜드 가이드 · 타깃 · 예산 범위', note: '숨겨야 할 규제나 표현 제한도 먼저 알려주세요.' },
      { label: '함께 남길 것', value: '핵심 문장 · 파일럿 소재 · 채널 리포트 · 다음 실험', note: '좋았던 숫자만 고르지 않고 해석과 오차를 같이 적습니다.' },
    ],
    fit: ['브랜드가 시작된 이유를 사람의 말로 들려줄 수 있습니다.', '타깃의 하루와 불편을 구체적으로 알고 있습니다.', '피드백을 모으고 결정할 한 명이 있습니다.', '예산 범위와 우선순위를 솔직하게 조정할 수 있습니다.'],
    pause: ['바이럴·매출·노출을 무조건 보장해달라고 요청합니다.', '협찬 사실을 숨기거나 오해를 만드는 표현을 원합니다.', '무제한 수정과 무기한 사용 권리를 기본으로 생각합니다.'],
    note: '제작비·매체비·사용 권리·수정 횟수·측정 지표는 브리프 뒤 서면으로 합의합니다. 최종 견적은 채널과 제작 범위가 정해진 뒤 안내합니다.',
    ctaLabel: '캠페인 브리프 보내기',
  },
  investment: {
    eyebrow: 'OPEN NOTE · 좋은 숫자와 나쁜 소식을 같은 표에',
    title: '투자 판단에 필요한 것은 기대감보다 출처와 맥락입니다.',
    description: '반짝이는 숫자를 늘어놓기보다 어떻게 계산했는지, 어디에서 틀릴 수 있는지, 자금을 어디에 쓸지부터 차분히 엽니다.',
    facts: [
      { label: '추천 대상', value: '긴 질문과 투명한 운영을 함께할 파트너', note: '박수보다 검증과 건강한 이견을 환영합니다.' },
      { label: '첫 대화', value: '소개 미팅 30–45분 · 자료 확인 목표 2–4주', note: '검토 범위와 자료 준비 상태에 따라 달라집니다.' },
      { label: '첫 미팅 준비물', value: '지표 출처 · 단위경제 · 핵심 위험 · 자금 사용안', note: '모르는 숫자는 모른다고 표시해도 됩니다.' },
      { label: '함께 남길 것', value: '질문 기록 · 데이터룸 목록 · 판단 원칙 · 100일 지도', note: '합의가 이뤄진 경우에만 다음 운영 지도로 이어갑니다.' },
    ],
    fit: ['나쁜 소식을 좋은 소식만큼 빠르게 공유합니다.', '핵심 지표의 정의와 원천을 확인할 수 있습니다.', '불편한 질문을 공격이 아니라 검증으로 받아들입니다.', '의사결정과 이해상충을 투명하게 기록합니다.'],
    pause: ['수익·기업가치 상승을 보장하는 표현을 요구합니다.', '좋은 숫자만 공유하고 원천 확인을 거부합니다.', '신원 확인 전 민감한 정보나 송금을 재촉합니다.'],
    note: '현재 라운드·기업가치·지분 구조·조건은 실제 검토가 시작되면 신원과 필요 범위를 확인한 뒤 공유합니다. 본 페이지는 증권의 모집·매출이나 투자 권유가 아닙니다.',
    ctaLabel: '소개 자료와 미팅 요청하기',
  },
  sponsorship: {
    eyebrow: 'SUPPORT NOTE · 마음이 어디에 머무는지',
    title: '응원의 크기보다 사용처와 약속을 먼저 보여드립니다.',
    description: '후원은 지분도 주문서도 아닙니다. 계속 만들 시간을 선물받는 일인 만큼 가능한 범위의 기록과 취소·환불 조건을 결제보다 먼저 설명합니다.',
    facts: [
      { label: '추천 대상', value: '서비스가 계속 살아 있기를 바라는 동료', note: '금액보다 관계의 의미와 경계를 함께 이해하는 분입니다.' },
      { label: '후원 방식', value: '일시·정기 방식은 문의 뒤 안내', note: '현재 이 페이지에는 실제 결제 기능이 연결되어 있지 않습니다.' },
      { label: '준비물', value: '없음 · 이름/닉네임 공개 여부는 선택', note: '응원만 보내고 조용히 지나가도 충분합니다.' },
      { label: '함께 남길 것', value: '사용 목적 · 월간 운영 메모 · 실제 기록', note: '기록이 쌓이는 범위 안에서 순차적으로 공개합니다.' },
    ],
    fit: ['서비스 뒤 사람의 생활비도 운영비임을 이해합니다.', '후원을 통제권이나 기능 주문권으로 바꾸지 않습니다.', '업데이트가 늦을 수 있다는 현실을 함께 견딥니다.', '공개 가능한 범위의 투명성에 동의합니다.'],
    pause: ['투자 수익·지분·원금 보장을 기대합니다.', '즉시 기능 반영이나 운영 개입을 조건으로 겁니다.', '개인정보 공개 또는 숨은 대가를 요구합니다.'],
    note: '현재는 사용 목적을 설명하는 안내 단계이며 결제 기능은 연결되어 있지 않습니다. 향후 결제를 열 경우 결제 수단·해지·취소·환불 기준을 결제 전에 명확히 표시합니다.',
    ctaLabel: '후원 방식과 사용처 확인하기',
  },
};

const RECORD_PRINCIPLES = [
  ['문제와 가설', '무엇을 바꾸려 했고 어떤 가정을 확인했는지 시작점을 기록합니다.'],
  ['결정과 담당', '누가 무엇을 결정했고 비용과 위험을 어떻게 나눴는지 남깁니다.'],
  ['결과와 오차', '목표와 실제 결과의 차이, 예상 밖의 반응을 좋은 것과 나쁜 것 모두 적습니다.'],
  ['다음 선택', '확장·수정·종료 중 무엇을 골랐는지, 다음 사람이 이어갈 이유까지 공유합니다.'],
] as const;

const PARTNERSHIP_FAQ = [
  ['어떤 제휴인지 아직 이름을 못 정했는데 문의해도 되나요?', '네. 해결하고 싶은 문제, 함께하고 싶은 이유, 가능한 일정만 적어주세요. 내용을 읽고 사업·광고·투자·후원 중 가장 가까운 대화로 연결하겠습니다.'],
  ['예산이나 회사 규모가 작아도 괜찮나요?', '괜찮습니다. 규모보다 문제의 선명도와 실행할 사람을 먼저 봅니다. 다만 가능한 범위와 포기해야 할 우선순위는 첫 대화에서 솔직하게 맞춥니다.'],
  ['제안서는 어떤 형식으로 보내야 하나요?', '정해진 서식은 없습니다. ① 누구인지 ② 해결할 문제 ③ 기대 결과 ④ 희망 기간·예산 범위 ⑤ 제공 가능한 자원, 이 다섯 줄이면 첫 검토에 충분합니다.'],
  ['민감한 자료는 처음부터 보내야 하나요?', '아닙니다. 첫 메일에는 공개 가능한 최소 정보만 보내주세요. 신원과 검토 필요성을 확인한 뒤 필요한 경우 비밀유지 조건을 먼저 맞추고 자료 범위를 정합니다.'],
  ['파일럿이 잘 맞지 않으면 중간에 멈출 수 있나요?', '가능합니다. 시작 전에 성공·중단 기준을 함께 적고, 종료할 때 정산·데이터 처리·학습 기록까지 합의해 관계가 상처로만 남지 않게 합니다.'],
  ['광고 섹션의 88·96 같은 숫자는 실제 성과인가요?', '아닙니다. 페이지의 분위기를 설명하는 콘셉트 온도 예시입니다. 실제 캠페인은 합의한 노출·전환·저장·반응 지표와 측정 기간을 별도 리포트로 구분해 전달합니다.'],
  ['지금 이 페이지에서 바로 후원 결제가 되나요?', '아닙니다. 현재는 후원 목적과 운영 원칙을 설명하는 단계입니다. 결제 기능을 연결할 때는 결제 수단과 해지·취소·환불 조건을 누르기 전에 확인할 수 있게 안내합니다.'],
  ['문의하면 언제 답을 받을 수 있나요?', '먼저 접수 여부와 다음 대화가 가능한 일정을 회신합니다. 검토에 시간이 더 필요하면 침묵 대신 현재 상태와 다음 안내 시점을 알려드리겠습니다.'],
] as const;

const CHEMISTRY_QUESTIONS = [
  ['problem', '함께 해결할 고객 문제를 한 문장으로 말할 수 있다.'],
  ['roles', '각자 맡을 일과 맡지 않을 일을 솔직하게 정할 수 있다.'],
  ['measure', '성공 기준뿐 아니라 멈출 기준도 함께 합의할 수 있다.'],
  ['truth', '잘 안 됐을 때 잠수 대신 회고를 선택할 수 있다.'],
] as const;

const CHEMISTRY_RESULTS = [
  ['아직은 명함만 교환한 사이', '괜찮습니다. 좋은 제휴도 첫 질문 하나에서 시작합니다.'],
  ['커피 한 잔은 가능', '거창한 계약서보다 서로의 문제를 더 들어볼 타이밍입니다.'],
  ['두 번째 미팅을 잡아도 됨', '공통분모가 보입니다. 이제 역할과 기준을 조금 더 구체화해보세요.'],
  ['파일럿 얘기해볼 타이밍', '작은 실험을 설계할 만큼 신뢰의 재료가 모였습니다.'],
  ['이미 같은 편 냄새가 납니다', '축하합니다. 이제 좋은 의도를 실제 운영 방식으로 바꿀 차례입니다.'],
] as const;

const SHARED_JOURNEY = [
  ['01', '사정부터 듣기', '무엇을 팔지보다 왜 이 제휴가 필요한지, 각자가 무엇을 두려워하는지부터 듣습니다.'],
  ['02', '역할을 번역하기', '멋있는 직함 대신 누가 언제 무엇을 결정하고 책임지는지 평범한 말로 적습니다.'],
  ['03', '작게 약속하기', '처음부터 영원한 사랑을 약속하지 않고 4–8주의 확인 가능한 파일럿으로 시작합니다.'],
  ['04', '함께 틀려보기', '예상과 다른 결과가 나오면 책임자를 찾기 전에 가설과 데이터를 다시 봅니다.'],
  ['05', '다음 장 결정하기', '확장·수정·종료 중 어떤 선택도 실패로 숨기지 않고 배운 것을 다음 결정에 남깁니다.'],
] as const;

const PARTNERSHIP_PROMISES = CHAPTERS.map((chapter) => {
  const definition = CORP_PAGE_DEFINITIONS.find((page) => page.path === chapter.route);
  return {
    ...chapter,
    checkpoints: definition?.checkpoints ?? [],
  };
});

function getChapterIndex(chapterId: PartnershipChapterId): number {
  return CHAPTERS.findIndex((chapter) => chapter.id === chapterId);
}

function getPartnershipMailto(chapterId: PartnershipChapterId): string {
  const chapter = CHAPTERS.find((item) => item.id === chapterId) ?? CHAPTERS[0];
  const subject = `[PRO PIG 제휴] ${chapter.label} 문의`;
  const body = [
    '안녕하세요. PRO PIG 제휴 페이지를 보고 연락드립니다.',
    '',
    `관심 있는 제휴: ${chapter.label}`,
    '1. 저희는 누구인가요?',
    '2. 함께 해결하고 싶은 문제는 무엇인가요?',
    '3. 기대하는 결과는 무엇인가요?',
    '4. 희망 기간과 예산 범위는 어떻게 되나요?',
    '5. 저희가 제공할 수 있는 자원은 무엇인가요?',
    '',
    '담당자 이름 / 연락처:',
  ].join('\n');

  return `mailto:support@propig.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function getGeneralPartnershipMailto(): string {
  const subject = '[PRO PIG 제휴] 유형을 함께 찾고 싶어요';
  const body = [
    '안녕하세요. 아직 제휴의 이름은 못 정했지만 함께 풀고 싶은 문제가 있어 연락드립니다.',
    '',
    '1. 저희는 누구인가요?',
    '2. 함께 해결하고 싶은 문제는 무엇인가요?',
    '3. 기대하는 결과는 무엇인가요?',
    '4. 희망 기간과 예산 범위는 어떻게 되나요?',
    '5. 저희가 제공할 수 있는 자원은 무엇인가요?',
    '',
    '담당자 이름 / 연락처:',
  ].join('\n');

  return `mailto:support@propig.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function PartnershipBriefBoard({ chapterId }: { chapterId: PartnershipChapterId }) {
  const brief = PARTNERSHIP_BRIEFS[chapterId];
  const chapter = CHAPTERS.find((item) => item.id === chapterId) ?? CHAPTERS[0];
  const titleId = `partnership-${chapterId}-brief-title`;

  return (
    <PracticalBrief $accent={chapter.accent} aria-labelledby={titleId}>
      <BriefHeader>
        <div>
          <span><ClipboardCheck size={17} aria-hidden="true" />{brief.eyebrow}</span>
          <h3 id={titleId}>{brief.title}</h3>
          <p>{brief.description}</p>
        </div>
        <BriefCta href={getPartnershipMailto(chapterId)}>
          <Send size={17} aria-hidden="true" />{brief.ctaLabel}<ArrowRight size={16} aria-hidden="true" />
        </BriefCta>
      </BriefHeader>

      <BriefFacts>
        {brief.facts.map((fact) => (
          <BriefFact key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
            <small>{fact.note}</small>
          </BriefFact>
        ))}
      </BriefFacts>

      <FitGrid>
        <FitColumn $tone="fit">
          <span><CheckCircle2 size={17} aria-hidden="true" />이런 팀과 잘 맞습니다</span>
          <ul>{brief.fit.map((item) => <li key={item}>{item}</li>)}</ul>
        </FitColumn>
        <FitColumn $tone="pause">
          <span><CircleAlert size={17} aria-hidden="true" />이 경우엔 잠깐 멈춰 확인합니다</span>
          <ul>{brief.pause.map((item) => <li key={item}>{item}</li>)}</ul>
        </FitColumn>
      </FitGrid>

      <BriefFootnote><NotebookPen size={18} aria-hidden="true" /><p>{brief.note}</p></BriefFootnote>
    </PracticalBrief>
  );
}

export function PartnershipHubExperience({ initialChapter = 'business' }: PartnershipHubExperienceProps) {
  const pageRef = useRef<HTMLElement | null>(null);
  const initialScrollCompleteRef = useRef(false);
  const [activeChapter, setActiveChapter] = useState<PartnershipChapterId>(initialChapter);
  const [activeBusinessModelId, setActiveBusinessModelId] = useState(BUSINESS_MODELS[0].id);
  const [chemistryChecks, setChemistryChecks] = useState<Set<string>>(() => new Set());

  const activeBusinessModel =
    BUSINESS_MODELS.find((model) => model.id === activeBusinessModelId) ?? BUSINESS_MODELS[0];
  const ActiveBusinessIcon = activeBusinessModel.icon;
  const chemistryResult = CHEMISTRY_RESULTS[chemistryChecks.size];

  const scrollToChapter = useCallback((chapterId: PartnershipChapterId, smooth = true) => {
    const target = document.getElementById(`partnership-${chapterId}`);
    if (!target) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: smooth && !reducedMotion ? 'smooth' : 'auto', block: 'start' });
    setActiveChapter(chapterId);
  }, []);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;

    const revealNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealNodes.forEach((node) => node.setAttribute('data-reveal-state', 'visible'));
      return;
    }

    revealNodes.forEach((node) => node.setAttribute('data-reveal-state', 'waiting'));
    root.setAttribute('data-motion-ready', 'true');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const node = entry.target as HTMLElement;
          node.setAttribute('data-reveal-state', 'visible');
          observer.unobserve(node);
        });
      },
      { root, rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );

    revealNodes.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      root.removeAttribute('data-motion-ready');
    };
  }, []);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || !('IntersectionObserver' in window)) return;

    const chapters = CHAPTERS.map((chapter) =>
      document.getElementById(`partnership-${chapter.id}`),
    ).filter((chapter): chapter is HTMLElement => Boolean(chapter));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        const chapterId = visible?.target.getAttribute('data-chapter') as PartnershipChapterId | null;
        if (chapterId) setActiveChapter(chapterId);
      },
      { root, rootMargin: '-18% 0px -62% 0px', threshold: [0.05, 0.2, 0.45] },
    );

    chapters.forEach((chapter) => observer.observe(chapter));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (initialChapter === 'business' || initialScrollCompleteRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      scrollToChapter(initialChapter, false);
      initialScrollCompleteRef.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initialChapter, scrollToChapter]);

  const handleChapterKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % CHAPTERS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + CHAPTERS.length) % CHAPTERS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = CHAPTERS.length - 1;
    else return;

    event.preventDefault();
    const nextChapter = CHAPTERS[nextIndex] ?? CHAPTERS[0];
    document.getElementById(`partnership-nav-${nextChapter.id}`)?.focus();
    scrollToChapter(nextChapter.id);
  };

  const handleBusinessTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % BUSINESS_MODELS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + BUSINESS_MODELS.length) % BUSINESS_MODELS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = BUSINESS_MODELS.length - 1;
    else return;

    event.preventDefault();
    const nextModel = BUSINESS_MODELS[nextIndex] ?? BUSINESS_MODELS[0];
    setActiveBusinessModelId(nextModel.id);
    document.getElementById(`business-model-tab-${nextModel.id}`)?.focus();
  };

  const toggleChemistryCheck = (questionId: string) => {
    setChemistryChecks((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  return (
    <Page ref={pageRef} id="content-area" aria-labelledby="partnership-hub-title" data-partnership-hub>
      <PageInner>
        <Hero data-reveal>
          <HeroCopy>
            <Kicker><Handshake size={17} aria-hidden="true" />PRO PIG · OPEN PARTNERSHIP HOUSE</Kicker>
            <HeroTitle id="partnership-hub-title">
              같이 해볼까요?
              <em>단, 서로의 사정부터 듣고요.</em>
            </HeroTitle>
            <HeroLead>
              제휴는 네 칸짜리 메뉴가 아니라 한 사람과 한 사람이 같은 문제 앞에 서는 일이라고 믿습니다.
              사업·광고·투자·후원을 한 공간에 모아, 지금 우리에게 필요한 관계부터 편하게 골라보세요.
            </HeroLead>
            <HeroActions>
              <PrimaryAction type="button" onClick={() => scrollToChapter('business')}>
                네 가지 인연 만나기 <ArrowDownRight size={18} aria-hidden="true" />
              </PrimaryAction>
              <TextAction href={getGeneralPartnershipMailto()}>
                일단 이야기부터 <Mail size={17} aria-hidden="true" />
              </TextAction>
            </HeroActions>
          </HeroCopy>

          <Constellation aria-label="사업, 광고, 투자, 후원이 하나의 제휴로 연결되는 구조">
            <StageCenter><Handshake size={31} aria-hidden="true" /><strong>우리</strong><span>같은 문제 앞에 서기</span></StageCenter>
            {CHAPTERS.map((chapter, index) => {
              const Icon = chapter.icon;
              return (
                <StageNode key={chapter.id} $accent={chapter.accent} $index={index}>
                  <Icon size={19} aria-hidden="true" />
                  <span>{chapter.label}</span>
                </StageNode>
              );
            })}
            <StageCaption>계약서보다 먼저 · 이해 → 실험 → 신뢰</StageCaption>
          </Constellation>
        </Hero>

        <HeroMarquee aria-label="제휴 원칙">
          <span>사업은 같이 벌 방법</span><i aria-hidden="true" />
          <span>광고는 같이 기억될 방법</span><i aria-hidden="true" />
          <span>투자는 같이 견딜 방법</span><i aria-hidden="true" />
          <span>후원은 같이 계속할 방법</span>
        </HeroMarquee>

        <ChapterNav aria-label="제휴 유형 바로가기">
          <ChapterNavInner>
            {CHAPTERS.map((chapter, index) => {
              const Icon = chapter.icon;
              const isActive = activeChapter === chapter.id;
              return (
                <ChapterNavButton
                  key={chapter.id}
                  id={`partnership-nav-${chapter.id}`}
                  type="button"
                  $accent={chapter.accent}
                  $active={isActive}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={() => scrollToChapter(chapter.id)}
                  onKeyDown={(event) => handleChapterKeyDown(event, index)}
                >
                  <span>{chapter.number}</span><Icon size={18} aria-hidden="true" /><strong>{chapter.label}</strong>
                </ChapterNavButton>
              );
            })}
          </ChapterNavInner>
        </ChapterNav>

        <Chapter
          id="partnership-business"
          data-chapter="business"
          $accent="#5eead4"
          aria-labelledby="partnership-business-title"
          data-reveal
        >
          <ChapterIntro>
            <ChapterLabel><Handshake size={18} aria-hidden="true" />01 · BUSINESS PARTNERSHIP</ChapterLabel>
            <ChapterTitle id="partnership-business-title">좋을 때 악수하는 사이보다,<br /><em>일이 꼬였을 때 같이 푸는 사이.</em></ChapterTitle>
            <ChapterLead>아이디어를 교환하는 데서 멈추지 않습니다. 접점과 기술, 운영 역량을 연결해 고객에게 닿는 작은 실행으로 가능성을 증명합니다.</ChapterLead>
          </ChapterIntro>

          <StoryAside>
            <span>제휴 소개팅 프로필</span>
            <strong>좋아하는 타입</strong>
            <p>고객 문제를 솔직히 말하는 팀, 잘하는 것만큼 못하는 것도 말할 수 있는 팀, 실패 기준까지 같이 정할 수 있는 팀.</p>
            <small>첫 만남부터 “시너지”를 세 번 이상 말하면 조금 긴장합니다.</small>
          </StoryAside>

          <PartnershipBriefBoard chapterId="business" />

          <BusinessLab>
            <BusinessTabs role="tablist" aria-label="사업 제휴 방식">
              {BUSINESS_MODELS.map((model, index) => {
                const Icon = model.icon;
                const isActive = activeBusinessModel.id === model.id;
                return (
                  <BusinessTab
                    key={model.id}
                    id={`business-model-tab-${model.id}`}
                    type="button"
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    aria-selected={isActive}
                    aria-controls="business-model-panel"
                    $accent={model.accent}
                    $active={isActive}
                    onClick={() => setActiveBusinessModelId(model.id)}
                    onKeyDown={(event) => handleBusinessTabKeyDown(event, index)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span><Icon size={20} aria-hidden="true" /><strong>{model.label}</strong>
                  </BusinessTab>
                );
              })}
            </BusinessTabs>

            <BusinessPanel
              key={activeBusinessModel.id}
              id="business-model-panel"
              role="tabpanel"
              tabIndex={0}
              aria-labelledby={`business-model-tab-${activeBusinessModel.id}`}
              $accent={activeBusinessModel.accent}
            >
              <PanelTop>
                <span><ActiveBusinessIcon size={24} aria-hidden="true" />{activeBusinessModel.eyebrow}</span>
                <h3>{activeBusinessModel.title}</h3>
                <p>{activeBusinessModel.summary}</p>
                <strong><Target size={17} aria-hidden="true" />이런 파트너와 잘 맞습니다 · {activeBusinessModel.fit}</strong>
              </PanelTop>
              <PanelLists>
                <MiniList><span><Route size={16} aria-hidden="true" />진행 흐름</span><ul>{activeBusinessModel.steps.map((item) => <li key={item}><BadgeCheck size={15} aria-hidden="true" />{item}</li>)}</ul></MiniList>
                <MiniList><span><Sparkles size={16} aria-hidden="true" />함께 남길 것</span><ul>{activeBusinessModel.outcomes.map((item) => <li key={item}><ArrowRight size={15} aria-hidden="true" />{item}</li>)}</ul></MiniList>
              </PanelLists>
            </BusinessPanel>
          </BusinessLab>
        </Chapter>

        <Chapter
          id="partnership-advertising"
          data-chapter="advertising"
          $accent="#ffcf5a"
          aria-labelledby="partnership-advertising-title"
          data-reveal
        >
          <ChapterIntro>
            <ChapterLabel><Megaphone size={18} aria-hidden="true" />02 · ADVERTISING PARTNERSHIP</ChapterLabel>
            <ChapterTitle id="partnership-advertising-title">광고비를 태우지 않고,<br /><em>마음에 불을 붙입니다.</em></ChapterTitle>
            <ChapterLead>사람은 광고를 보기 위해 하루를 시작하지 않습니다. 그래서 끼어드는 광고보다 기억하고 싶은 이야기, 친구에게 한 번쯤 말하고 싶은 장면을 만듭니다.</ChapterLead>
          </ChapterIntro>

          <PartnershipBriefBoard chapterId="advertising" />

          <AdvertisingScene>
            <HumanBrief>
              <span>THE HUMAN BRIEF</span>
              <blockquote>“우리 제품을 알리고 싶어요”보다<br />“이 사람의 오늘을 조금 낫게 하고 싶어요”에서 시작합니다.</blockquote>
              <p>웃기되 사람을 낮추지 않고, 감성적이되 성과를 숨기지 않습니다. 좋은 광고는 브랜드가 크게 말한 기록보다 누군가 자기 이야기처럼 조용히 저장한 장면이라고 믿습니다.</p>
            </HumanBrief>
            <RadioPanel aria-label="광고 감정 주파수">
              <strong>LIVE EMOTION RADIO <em>ON AIR</em></strong>
              <RadioMeter $value={88} $delay={0}><span>웃음</span><i><b /></i><small>88</small></RadioMeter>
              <RadioMeter $value={96} $delay={1}><span>공감</span><i><b /></i><small>96</small></RadioMeter>
              <RadioMeter $value={18} $delay={2}><span>과장</span><i><b /></i><small>18</small></RadioMeter>
              <RadioMeter $value={100} $delay={3}><span>진심</span><i><b /></i><small>100</small></RadioMeter>
              <p>※ 88·96·100은 감정 방향을 설명하는 콘셉트 온도 예시이며, 실제 집행 성과가 아닙니다.</p>
            </RadioPanel>
          </AdvertisingScene>

          <FormatGrid>
            {ADVERTISING_FORMATS.map(([eyebrow, title, body, Icon], index) => (
              <FormatCard key={eyebrow} $index={index}>
                <span>{String(index + 1).padStart(2, '0')} · {eyebrow}</span><Icon size={22} aria-hidden="true" />
                <h3>{title}</h3><p>{body}</p>
              </FormatCard>
            ))}
          </FormatGrid>

          <JourneyRail aria-label="광고 캠페인 진행 과정">
            {ADVERTISING_PROCESS.map(([number, title, body]) => (
              <JourneyStep key={number} $accent="#ffcf5a"><span>{number}</span><i aria-hidden="true" /><h3>{title}</h3><p>{body}</p></JourneyStep>
            ))}
          </JourneyRail>
        </Chapter>

        <Chapter
          id="partnership-investment"
          data-chapter="investment"
          $accent="#7dd3fc"
          aria-labelledby="partnership-investment-title"
          data-reveal
        >
          <ChapterIntro>
            <ChapterLabel><CircleDollarSign size={18} aria-hidden="true" />03 · INVESTMENT PARTNERSHIP</ChapterLabel>
            <ChapterTitle id="partnership-investment-title">좋은 날의 그래프보다,<br /><em>어려운 날의 태도를 봐주세요.</em></ChapterTitle>
            <ChapterLead>투자는 통장에 찍히는 숫자보다 오래 남는 관계입니다. 박수만 보내는 분보다 나쁜 소식에도 더 좋은 질문으로 다음 결정을 함께 만드는 파트너를 기다립니다.</ChapterLead>
          </ChapterIntro>

          <PartnershipBriefBoard chapterId="investment" />

          <InvestmentLetter>
            <LetterMark><HeartHandshake size={31} aria-hidden="true" /></LetterMark>
            <div><span>LETTER FROM THE BUILDER</span><h3>“투자금이 떨어질까 두려운 회사가 아니라,<br />신뢰가 떨어질까 두려운 회사를 만들겠습니다.”</h3><p>모든 일이 예상대로 흘러가지는 않을 겁니다. 중요한 건 숫자가 흔들릴 때 고객을 속이지 않고, 동료를 소모하지 않고, 무엇을 배웠는지 정확히 말할 수 있는 팀이 되는 일입니다.</p></div>
          </InvestmentLetter>

          <ThesisGrid>
            {INVESTMENT_THESES.map(([eyebrow, title, body, Icon], index) => (
              <ThesisCard key={eyebrow} $index={index}><span>{String(index + 1).padStart(2, '0')} · {eyebrow}</span><Icon size={21} aria-hidden="true" /><h3>{title}</h3><p>{body}</p></ThesisCard>
            ))}
          </ThesisGrid>

          <QuestionCourt>
            <div><FileSearch size={28} aria-hidden="true" /><span>FRIENDLY DUE DILIGENCE</span><h3>불편하지만 회사를 건강하게 만드는 질문들</h3><p>정답을 꾸미는 자리보다 자료를 열고 모르는 부분은 모른다고 말할 수 있는 대화를 원합니다.</p></div>
            <QuestionList>{INVESTMENT_QUESTIONS.map((question, index) => <li key={question}><span>{String(index + 1).padStart(2, '0')}</span><p>{question}</p></li>)}</QuestionList>
          </QuestionCourt>

          <HundredDays aria-label="투자 이후 첫 100일">
            {INVESTMENT_DAYS.map(([day, title, body]) => <DayStep key={day}><span>{day}</span><h3>{title}</h3><p>{body}</p></DayStep>)}
          </HundredDays>
        </Chapter>

        <Chapter
          id="partnership-sponsorship"
          data-chapter="sponsorship"
          $accent="#fb8da1"
          aria-labelledby="partnership-sponsorship-title"
          data-reveal
        >
          <ChapterIntro>
            <ChapterLabel><PiggyBank size={18} aria-hidden="true" />04 · PERSONAL SURVIVAL SPONSOR</ChapterLabel>
            <ChapterTitle id="partnership-sponsorship-title">후원금은 거창한 곳으로 순간이동하지 않고,<br /><em>오늘을 버티는 생활비에 합류합니다.</em></ChapterTitle>
            <ChapterLead>운영자가 밥 먹고, 월세 내고, 커피 마시며 서비스를 계속 만지는 데 보탭니다. 투명성은 높이고 품격은 일부러 조금 낮춘 솔직한 후원 안내입니다.</ChapterLead>
          </ChapterIntro>

          <PartnershipBriefBoard chapterId="sponsorship" />

          <SponsorshipScene>
            <Receipt aria-label="후원금 사용 영수증">
              <span><ReceiptText size={24} aria-hidden="true" />영수증 같은 진실</span>
              <strong>생활비</strong>
              <p>대단한 연구재단이 아니라, 다음 화면이 나올 때까지 사람 한 명이 계속 일할 수 있는 비용입니다.</p>
              <i aria-hidden="true" />
              <small>감사함 100% · 과장 0% · 다음 업데이트 가능성 ↑</small>
            </Receipt>
            <SpendGrid>
              {SPENDING_ITEMS.map(([label, body, Icon, tone]) => <SpendCard key={label} $tone={tone}><Icon size={23} aria-hidden="true" /><span>{label}</span><strong>{body}</strong></SpendCard>)}
            </SpendGrid>
          </SponsorshipScene>

          <LevelGrid aria-label="후원 금액이 만드는 시간 예시">
            {SUPPORT_LEVELS.map(([amount, title, body], index) => <LevelCard key={title}><span>{String(index + 1).padStart(2, '0')} · {amount}</span><h3>{title}</h3><p>{body}</p><i aria-hidden="true" /></LevelCard>)}
          </LevelGrid>

          <LoopRail aria-label="후원이 서비스로 돌아오는 과정">
            {SUPPORT_LOOP.map(([number, title, body]) => <LoopStep key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div><ArrowRight size={18} aria-hidden="true" /></LoopStep>)}
          </LoopRail>
        </Chapter>

        <ChemistrySection aria-labelledby="partnership-chemistry-title" data-reveal>
          <ChemistryCopy>
            <span><Sparkles size={18} aria-hidden="true" />10초 제휴 궁합 셀프체크</span>
            <h2 id="partnership-chemistry-title">우리, 계약서 쓰기 전에<br />커피부터 마셔도 될까요?</h2>
            <p>정답 시험이 아닙니다. 서로의 기대와 불안을 얼마나 솔직하게 꺼낼 준비가 됐는지 확인하는 가벼운 체크입니다.</p>
          </ChemistryCopy>
          <ChemistryPanel>
            <div role="group" aria-label="제휴 궁합 조건">
              {CHEMISTRY_QUESTIONS.map(([id, label], index) => {
                const selected = chemistryChecks.has(id);
                return <ChemistryQuestion key={id} type="button" aria-pressed={selected} $selected={selected} onClick={() => toggleChemistryCheck(id)}><span>{selected ? <Check size={16} aria-hidden="true" /> : String(index + 1).padStart(2, '0')}</span><strong>{label}</strong></ChemistryQuestion>;
              })}
            </div>
            <ChemistryResult key={chemistryChecks.size} role="status" aria-live="polite">
              <span>MATCH {chemistryChecks.size} / {CHEMISTRY_QUESTIONS.length}</span>
              <strong>{chemistryResult[0]}</strong><p>{chemistryResult[1]}</p>
              <ProgressTrack aria-hidden="true"><ProgressFill $value={(chemistryChecks.size / CHEMISTRY_QUESTIONS.length) * 100} /></ProgressTrack>
            </ChemistryResult>
          </ChemistryPanel>
        </ChemistrySection>

        <JourneySection aria-labelledby="partnership-journey-title" data-reveal>
          <ChapterIntro>
            <ChapterLabel><Route size={18} aria-hidden="true" />05 · ONE SHARED JOURNEY</ChapterLabel>
            <ChapterTitle id="partnership-journey-title">네 가지 제휴,<br /><em>결국 같은 다섯 걸음입니다.</em></ChapterTitle>
            <ChapterLead>관계의 이름은 달라도 좋은 제휴가 움직이는 방식은 비슷합니다. 이해하고, 역할을 나누고, 작게 실험하고, 함께 틀리고, 다음 장을 결정합니다.</ChapterLead>
          </ChapterIntro>
          <JourneyRail>{SHARED_JOURNEY.map(([number, title, body]) => <JourneyStep key={number} $accent="#5eead4"><span>{number}</span><i aria-hidden="true" /><h3>{title}</h3><p>{body}</p></JourneyStep>)}</JourneyRail>
        </JourneySection>

        <PromiseSection aria-labelledby="partnership-promises-title" data-reveal>
          <ChapterIntro>
            <ChapterLabel><ShieldCheck size={18} aria-hidden="true" />06 · PROMISES WE DO NOT HIDE</ChapterLabel>
            <ChapterTitle id="partnership-promises-title">재미와 성장보다 먼저,<br /><em>서로를 지킬 선.</em></ChapterTitle>
            <ChapterLead>멋진 문구가 아니라 실제 검토와 운영에서 사용할 기준입니다. 좋은 관계는 기대를 크게 말하는 일보다 지킬 수 있는 약속을 정확히 적는 데서 시작합니다.</ChapterLead>
          </ChapterIntro>
          <PromiseGrid>
            {PARTNERSHIP_PROMISES.map((promise) => {
              const Icon = promise.icon;
              return <PromiseCard key={promise.id} $accent={promise.accent}><span><Icon size={19} aria-hidden="true" />{promise.label} 제휴</span><ul>{promise.checkpoints.map((checkpoint) => <li key={checkpoint}><CheckCircle2 size={16} aria-hidden="true" />{checkpoint}</li>)}</ul></PromiseCard>;
            })}
          </PromiseGrid>
        </PromiseSection>

        <EvidenceSection aria-labelledby="partnership-evidence-title" data-reveal>
          <ChapterIntro>
            <ChapterLabel><Eye size={18} aria-hidden="true" />07 · HONEST EVIDENCE LOG</ChapterLabel>
            <ChapterTitle id="partnership-evidence-title">성과를 꾸며내지 않고,<br /><em>과정부터 공개합니다.</em></ChapterTitle>
            <ChapterLead>아직 없는 성공 사례를 그럴듯한 숫자로 채우지 않습니다. 실제 파일럿이 끝나고 공개 동의를 받은 범위가 생기면 목표·실행·결과를 구분해 차곡차곡 남기겠습니다.</ChapterLead>
          </ChapterIntro>

          <EvidenceStatus>
            <div>
              <span><BadgeCheck size={17} aria-hidden="true" />현재 공개 상태</span>
              <strong>완성된 사례를 꾸며 넣지 않았습니다.</strong>
              <p>지금 보이는 기간과 결과물은 협업을 설계하기 위한 목표 범위입니다. 실제 사례가 생기면 기대치와 실제 결과의 차이까지 기록합니다.</p>
            </div>
            <small>CONTENT STATUS<strong>사례 축적 중</strong><time dateTime="2026-08-18">콘텐츠 기준 업데이트 · 2026.08.18</time></small>
          </EvidenceStatus>

          <RecordGrid aria-label="향후 공개할 제휴 기록 기준">
            {RECORD_PRINCIPLES.map(([title, body], index) => (
              <RecordItem key={title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </RecordItem>
            ))}
          </RecordGrid>
        </EvidenceSection>

        <FaqSection aria-labelledby="partnership-faq-title" data-reveal>
          <ChapterIntro>
            <ChapterLabel><HelpCircle size={18} aria-hidden="true" />08 · BEFORE YOU WRITE</ChapterLabel>
            <ChapterTitle id="partnership-faq-title">메일을 쓰다 멈춘 마음까지,<br /><em>미리 답해둘게요.</em></ChapterTitle>
            <ChapterLead>제안서 형식, 작은 예산, 자료 보안처럼 첫 연락을 망설이게 만드는 질문을 모았습니다. 여기에 없는 고민은 정답을 만들지 말고 그대로 보내주세요.</ChapterLead>
          </ChapterIntro>

          <FaqList>
            {PARTNERSHIP_FAQ.map(([question, answer], index) => (
              <FaqItem key={question}>
                <summary><span>{String(index + 1).padStart(2, '0')}</span><strong>{question}</strong></summary>
                <p>{answer}</p>
              </FaqItem>
            ))}
          </FaqList>
        </FaqSection>

        <FinalSection aria-labelledby="partnership-final-title" data-reveal>
          <FinalCopy>
            <span>NO PERFECT DECK REQUIRED</span>
            <h2 id="partnership-final-title">완벽한 제안서보다,<br />진짜 고민 한 줄이면 충분합니다.</h2>
            <p>“예산은 작지만 같이 웃을 일을 만들고 싶어요.” “아직 숫자는 작지만 오래 풀고 싶은 문제가 있어요.” 같은 솔직한 이야기부터 환영합니다.</p>
          </FinalCopy>
          <div>
            <ContactButton href={getGeneralPartnershipMailto()}><Mail size={20} aria-hidden="true" /><span><small>다섯 줄 질문이 자동으로 준비됩니다</small><strong>우리 이야기 시작하기</strong></span><ArrowRight size={20} aria-hidden="true" /></ContactButton>
            <p><Gift size={16} aria-hidden="true" />사업·광고·투자·후원 중 이름을 못 정했어도 괜찮습니다.</p>
          </div>
        </FinalSection>
      </PageInner>
    </Page>
  );
}

export function isPartnershipChapterId(value: string): value is PartnershipChapterId {
  return getChapterIndex(value as PartnershipChapterId) >= 0;
}
