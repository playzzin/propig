import { BarChart3, Clapperboard, Code2, Compass, FlaskConical, Globe2, HeartHandshake, Landmark, Megaphone, Palette, ShieldCheck, UsersRound, Workflow, type LucideIcon } from 'lucide-react';

export type PersonLevel = '경영진' | '총괄본부장' | '본부장' | '팀장' | '센터장';

export type Person = {
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

export type Executive = Person & {
  focus: string;
};

export type Team = {
  name: string;
  lead: string;
  photoIndex: number;
};

export type Division = {
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

export type SupportUnit = {
  id: string;
  label: string;
  executive: string;
  mission: string;
  accent: string;
  icon: LucideIcon;
  lead: Person;
};

export const PROFILE_ATLAS_PATHS = [
  '/corp/staff-ai-agent-cast-v2-01.webp',
  '/corp/staff-ai-agent-cast-v2-02.webp',
  '/corp/staff-ai-agent-cast-v2-03.webp',
  '/corp/staff-ai-agent-cast-v2-04.webp',
  '/corp/staff-ai-agent-cast-v2-05.webp',
  '/corp/staff-ai-agent-cast-v2-06.webp',
  '/corp/staff-ai-agent-cast-v2-07.webp',
  '/corp/staff-ai-agent-cast-v2-08.webp',
] as const;

export const CEO: Person = {
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

export const GENERAL_MANAGER: Person = {
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

export const CORE_EXECUTIVES: Executive[] = [
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

export const EXECUTIVES: Executive[] = [
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

export const TEAM_LEAD_CODES = [
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

export function createTeamRoster(names: string[], offset: number): Team[] {
  return names.map((name, index) => ({
    name,
    lead: `${TEAM_LEAD_CODES[(offset + index) % TEAM_LEAD_CODES.length]} 팀장`,
    photoIndex: offset + index + 11,
  }));
}

export const EXPANDED_TEAM_LEAD_CODES = [
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

export function createExpandedTeamRoster(names: string[], codeOffset: number, photoStart: number): Team[] {
  return names.map((name, index) => ({
    name,
    lead: `${EXPANDED_TEAM_LEAD_CODES[codeOffset + index]} 팀장`,
    photoIndex: photoStart + index,
  }));
}

export const DIVISIONS: Division[] = [
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

export const DIVISION_TIERS = [
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

export const SUPPORT_UNITS: SupportUnit[] = [
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


export function buildTeamPerson(division: Division, team: Team): Person {
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
