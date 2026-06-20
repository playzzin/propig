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
    path: '/corp/company/founding-background',
    category: '회사소개',
    menuLabel: '창업배경',
    title: '창업배경',
    description: '회사가 시작된 계기와 문제 인식, 그리고 사업화 과정의 핵심 이력을 정리합니다.',
    checkpoints: [
      '시장 문제 정의와 초기 고객 페르소나를 명확히 기록합니다.',
      '창업 초기 의사결정과 제품 방향 전환 이유를 히스토리로 관리합니다.',
      '향후 IR/홍보 자료에서 재사용할 수 있도록 스토리 자산을 체계화합니다.',
    ],
  },
  {
    path: '/corp/company/ceo-intro',
    category: '회사소개',
    menuLabel: '대표소개',
    title: '대표소개',
    description: '대표자의 경력, 리더십 철학, 중장기 경영 방향을 소개합니다.',
    checkpoints: [
      '핵심 경력과 전문 분야를 최근 이력 중심으로 갱신합니다.',
      '중요 메시지는 3개 이내 핵심 문장으로 압축해 전달합니다.',
      '대외 발표/미디어용 프로필과 동일한 기준으로 유지합니다.',
    ],
  },
  {
    path: '/corp/company/staff-intro',
    category: '회사소개',
    menuLabel: '직원소개',
    title: '직원소개',
    description: '조직 구성원, 팀 역할, 협업 구조를 한눈에 볼 수 있도록 제공합니다.',
    checkpoints: [
      '팀별 미션과 담당 영역을 명확한 용어로 정의합니다.',
      '신규 입사자 온보딩에 활용 가능한 조직 맵을 포함합니다.',
      '부서 간 협업 접점을 표준 프로세스로 정리합니다.',
    ],
  },
  {
    path: '/corp/company/technology',
    category: '회사소개',
    menuLabel: '기업기술',
    title: '기업기술',
    description: '핵심 기술 스택, 차별화 포인트, 기술 경쟁력을 문서화합니다.',
    checkpoints: [
      '핵심 기술별 성능/안정성 지표를 주기적으로 측정합니다.',
      '보안/컴플라이언스 요구사항 반영 현황을 추적합니다.',
      '기술 로드맵과 제품 로드맵 간 연계를 명확히 유지합니다.',
    ],
  },
  {
    path: '/corp/company/business-area',
    category: '회사소개',
    menuLabel: '사업영역',
    title: '사업영역',
    description: '현재 운영 중인 사업군과 확장 예정 영역, 수익 구조를 설명합니다.',
    checkpoints: [
      '사업군별 매출 기여도와 성장률을 주기적으로 업데이트합니다.',
      '신규 사업 검증 단계(탐색/실험/확장)를 명확히 구분합니다.',
      '시장 진입 전략과 파트너십 전략을 함께 관리합니다.',
    ],
  },
  {
    path: '/corp/company/social-contribution',
    category: '회사소개',
    menuLabel: '사회공헌',
    title: '사회공헌',
    description: '기업의 사회적 책임 활동과 ESG 관점의 실천 과제를 관리합니다.',
    checkpoints: [
      '연간 사회공헌 목표와 실적을 정량 지표로 운영합니다.',
      '내부 구성원 참여 프로그램을 분기 단위로 점검합니다.',
      '대외 공개 가능한 성과 데이터를 표준 포맷으로 관리합니다.',
    ],
  },
  {
    path: '/corp/company/introduction',
    category: '회사소개',
    menuLabel: '회사소개',
    title: '회사소개',
    description: '회사의 핵심 방향, 제품 철학, 고객 가치 제안을 한눈에 전달합니다.',
    checkpoints: [
      '첫 화면에서 회사가 해결하는 문제와 핵심 가치를 명확히 보여줍니다.',
      '창업배경, 기업기술, 사업영역으로 이어지는 탐색 흐름을 제공합니다.',
      '대외 소개 자료와 동일한 톤의 메시지를 유지합니다.',
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
    path: '/corp/careers/talent',
    category: '인재채용',
    menuLabel: '인재상',
    title: '인재상',
    description: '회사가 찾는 인재의 역량, 태도, 협업 기준을 명확히 제시합니다.',
    checkpoints: [
      '핵심 역량을 직무군별로 구분해 정의합니다.',
      '평가 기준과 인터뷰 질문을 정합성 있게 관리합니다.',
      '채용 브랜딩 메시지를 내외부 커뮤니케이션에 반영합니다.',
    ],
  },
  {
    path: '/corp/careers/jobs',
    category: '인재채용',
    menuLabel: '채용정보',
    title: '채용정보',
    description: '채용 공고, 전형 일정, 채용 현황을 최신 상태로 유지합니다.',
    checkpoints: [
      '직무별 JD를 분기 단위로 업데이트합니다.',
      '전형 단계별 SLA와 후보자 경험 지표를 모니터링합니다.',
      '채용 채널별 전환율을 정리해 우선순위를 조정합니다.',
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
