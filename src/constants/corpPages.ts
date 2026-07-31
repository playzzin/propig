export interface CorpPageDefinition {
  path: string;
  category: '회사소개' | '프로젝트' | '제휴하기' | '인재채용';
  menuLabel: string;
  title: string;
  description: string;
  checkpoints: string[];
}

export const CORP_PAGE_DEFINITIONS: CorpPageDefinition[] = [
  {
    path: '/corp/company/introduction',
    category: '회사소개',
    menuLabel: '회사소개',
    title: '회사소개',
    description: '회사의 핵심 방향, 운영 철학, 고객 가치 제안을 한눈에 전달합니다.',
    checkpoints: [
      '첫 화면에서 회사가 해결하는 문제와 핵심 가치를 명확히 보여줍니다.',
      '대표소개, 회사연혁, 직원소개로 이어지는 탐색 흐름을 제공합니다.',
      '대외 소개 자료와 동일한 톤의 메시지를 유지합니다.',
    ],
  },
  {
    path: '/corp/company/ceo-intro',
    category: '회사소개',
    menuLabel: '대표소개',
    title: '대표소개',
    description: '대표자의 경영 철학, 운영 원칙, 고객과 파트너를 향한 약속을 소개합니다.',
    checkpoints: [
      '대표 메시지는 핵심 문장 중심으로 압축해 전달합니다.',
      '회사소개와 회사연혁 사이의 연결 문맥을 유지합니다.',
      '대외 발표/미디어용 프로필과 동일한 기준으로 관리합니다.',
    ],
  },
  {
    path: '/corp/company/history',
    category: '회사소개',
    menuLabel: '회사연혁',
    title: '회사연혁',
    description: '회사의 성장 흐름과 운영 체계가 축적된 과정을 타임라인으로 보여줍니다.',
    checkpoints: [
      '연도별 사건보다 신뢰가 축적된 이유를 함께 설명합니다.',
      '모바일에서도 한 줄 흐름이 끊기지 않는 Timeline UI를 유지합니다.',
      '직원소개와 제품소개로 이어지는 문맥을 제공합니다.',
    ],
  },
  {
    path: '/corp/company/staff-intro',
    category: '회사소개',
    menuLabel: '직원소개',
    title: '직원소개',
    description: '조직 구성, 팀 역할, 협업 구조를 계층형 카드로 한눈에 볼 수 있도록 제공합니다.',
    checkpoints: [
      '팀별 미션과 담당 영역을 명확한 용어로 정의합니다.',
      '신규 입사자와 외부 파트너가 이해 가능한 조직 맵을 포함합니다.',
      '부서 간 협업 접점을 표준 프로세스로 정리합니다.',
    ],
  },
  {
    path: '/corp/company/product-introduction',
    category: '회사소개',
    menuLabel: '제품소개',
    title: '제품소개',
    description: '현재 제공하는 제품·서비스와 각 영역의 실행 범위를 소개합니다.',
    checkpoints: [
      '제품·서비스별 제공 범위와 운영 상태를 주기적으로 업데이트합니다.',
      '신규 제품 검증 단계(탐색/실험/확장)를 명확히 구분합니다.',
      '시장 진입 전략과 파트너십 전략을 함께 관리합니다.',
    ],
  },
  {
    path: '/corp/project',
    category: '프로젝트',
    menuLabel: '프로젝트',
    title: '프로젝트',
    description: '진행 중/예정 프로젝트의 일정, 책임자, 리스크를 통합 관리합니다.',
    checkpoints: [
      '프로젝트별 목표, 산출물, 일정 베이스라인을 확정합니다.',
      '주간 리스크 리뷰와 의사결정 로그를 남깁니다.',
      '완료 후 회고를 통해 재사용 가능한 템플릿을 축적합니다.',
    ],
  },
  {
    path: '/corp/portfolio',
    category: '프로젝트',
    menuLabel: '포트폴리오',
    title: '포트폴리오',
    description: '완료된 프로젝트의 결과물과 핵심 성과를 포트폴리오 형태로 관리합니다.',
    checkpoints: [
      '사례별 문제/해결/성과를 동일한 구조로 정리합니다.',
      '수치 성과와 고객 피드백을 함께 아카이빙합니다.',
      '영업 제안서에서 재사용 가능한 자료 단위를 유지합니다.',
    ],
  },
  {
    path: '/corp/partnership/business',
    category: '제휴하기',
    menuLabel: '사업제휴',
    title: '사업제휴',
    description: '사업 제휴 검토, 진행 현황, 계약 이행 조건을 관리합니다.',
    checkpoints: [
      '제휴 목적과 상호 기대 성과를 문서화합니다.',
      '법무/재무 검토 항목을 체크리스트로 표준화합니다.',
      '제휴 이후 성과 측정 지표를 사전에 합의합니다.',
    ],
  },
  {
    path: '/corp/partnership/advertising',
    category: '제휴하기',
    menuLabel: '광고제휴',
    title: '광고제휴',
    description: '브랜드/광고 캠페인 제휴 요청과 집행 결과를 체계적으로 관리합니다.',
    checkpoints: [
      '캠페인 목적과 타깃 세그먼트를 명확히 정의합니다.',
      '채널별 예산/효율 지표를 일관된 방식으로 추적합니다.',
      '성과 리포트를 표준 템플릿으로 축적합니다.',
    ],
  },
  {
    path: '/corp/partnership/investment',
    category: '제휴하기',
    menuLabel: '투자제휴',
    title: '투자제휴',
    description: '투자 제안, 실사 대응, 협상 이슈를 단계별로 관리합니다.',
    checkpoints: [
      'IR 핵심 지표와 최신 재무 데이터를 동기화합니다.',
      '실사 요청 자료를 카테고리별로 버전 관리합니다.',
      '협상 쟁점과 결정 사항을 타임라인으로 기록합니다.',
    ],
  },
  {
    path: '/corp/partnership/sponsorship',
    category: '제휴하기',
    menuLabel: '후원하기',
    title: '후원하기',
    description: '후원 프로그램, 선정 기준, 집행 결과를 투명하게 관리합니다.',
    checkpoints: [
      '후원 대상 선정 기준을 사전에 공개 가능한 형태로 정의합니다.',
      '후원 집행 내역과 결과 보고 체계를 표준화합니다.',
      '브랜드 가치와의 정합성을 정기적으로 점검합니다.',
    ],
  },
  {
    path: '/corp/careers/jobs',
    category: '인재채용',
    menuLabel: '채용정보',
    title: '채용정보',
    description: '직원 · 친구 · 여친 · 기타, 서로 다른 네 포지션의 유쾌한 채용공고를 운영합니다.',
    checkpoints: [
      '직원구함, 친구구함, 여친구함, 기타구함을 실제 채용공고 형식으로 안내합니다.',
      '담당 업무, 자격 요건, 전형 절차를 포지션별 풍자와 함께 구체적으로 소개합니다.',
      '상호 존중과 안전한 소통을 모든 포지션의 기본 원칙으로 둡니다.',
    ],
  },
  {
    path: '/corp/careers/apply',
    category: '인재채용',
    menuLabel: '지원하기',
    title: '지원하기',
    description: '지원 접수 절차와 필수 제출 자료를 안내하고 접수 상태를 관리합니다.',
    checkpoints: [
      '지원자 제출 항목과 검토 기준을 명확히 고지합니다.',
      '자동 응답/진행 안내 메시지를 표준화합니다.',
      '개인정보 보관/파기 정책을 프로세스에 반영합니다.',
    ],
  },
];

const CORP_PAGE_MAP: Record<string, CorpPageDefinition> = CORP_PAGE_DEFINITIONS.reduce(
  (acc, page) => {
    const key = page.path.replace(/^\/corp\/?/, '');
    acc[key] = page;
    return acc;
  },
  {} as Record<string, CorpPageDefinition>
);

export function getCorpPageBySlug(slug: string[]): CorpPageDefinition | undefined {
  return CORP_PAGE_MAP[slug.join('/')];
}

export function getCorpPageByPath(pathname: string): CorpPageDefinition | undefined {
  if (!pathname.startsWith('/corp/')) return undefined;
  const key = pathname.replace(/^\/corp\/?/, '');
  return CORP_PAGE_MAP[key];
}
