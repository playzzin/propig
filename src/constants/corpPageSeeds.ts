import type { CorpPage, CorpPageBlock, CorpPageTemplateKey } from '@/schemas/corpPageSchema';
import savedCorpPageOverrides from './corpPageSavedOverrides.json';

interface SeedPageMeta {
  slug: string;
  title: string;
  description: string;
  templateKey: CorpPageTemplateKey;
  menuIcon: string;
}

const SEED_PAGE_META: SeedPageMeta[] = [
  {
    slug: 'introduction',
    title: '회사소개',
    description: 'PRO PIG의 회사 방향, 운영 철학, 전국·글로벌 네트워크를 한 화면에서 소개합니다.',
    templateKey: 'company-introduction',
    menuIcon: 'building',
  },
  {
    slug: 'founding-background',
    title: '창업배경',
    description: '문제 인식, 실행 방식, 사업화 과정이 어떻게 PRO PIG의 출발점이 되었는지 정리합니다.',
    templateKey: 'founding-background',
    menuIcon: 'lightbulb',
  },
  {
    slug: 'ceo-intro',
    title: '대표소개',
    description: '대표의 이력과 캐릭터, 현장형 리더십을 솔직한 프로필 형식으로 소개합니다.',
    templateKey: 'ceo-intro',
    menuIcon: 'user-tie',
  },
  {
    slug: 'staff-intro',
    title: '직원소개',
    description: '팀별 역할, 핵심 구성원, 협업 흐름을 조직도와 인물 카드 중심으로 보여줍니다.',
    templateKey: 'staff-intro',
    menuIcon: 'users',
  },
  {
    slug: 'business-area',
    title: '사업영역',
    description: '레그워크, 엔지니어링, 미디어, 에이전시를 중심으로 실제 수행 영역을 소개합니다.',
    templateKey: 'business-area',
    menuIcon: 'briefcase',
  },
  {
    slug: 'technology',
    title: '기업기술',
    description: '데이터, AI, 자동화, 보안, 파트너 검증으로 이어지는 기술 실행 구조를 보여줍니다.',
    templateKey: 'technology',
    menuIcon: 'microchip',
  },
  {
    slug: 'social-contribution',
    title: '사회공헌',
    description: '추첨 공, 즉석복권, 기부 포인트를 활용한 참여형 사회공헌 이벤트를 소개합니다.',
    templateKey: 'social-contribution',
    menuIcon: 'hands-holding-heart',
  },
];

const foundingVideos = [
  {
    eyebrow: 'Chapter 01',
    title: '데이터로 남긴 첫 문제',
    description: '흩어진 요청과 반복 업무를 기록 가능한 데이터로 바꾸며 창업의 첫 기준을 세운 장면입니다.',
    label: '운영 데이터',
    source: '/corp/company-technology-data.mp4',
  },
  {
    eyebrow: 'Chapter 02',
    title: 'AI로 좁힌 실행 간격',
    description: '사람이 매번 판단하던 흐름을 보조하는 AI 구조를 붙여 더 빠른 실행 방식을 만들었습니다.',
    label: 'AI 실행',
    source: '/corp/company-technology-ai.mp4',
  },
  {
    eyebrow: 'Chapter 03',
    title: '자동화로 반복을 줄인 순간',
    description: '같은 설명과 확인을 반복하던 업무를 자동화해 팀이 문제 해결에 더 집중할 수 있게 했습니다.',
    label: '업무 자동화',
    source: '/corp/company-technology-automation.mp4',
  },
  {
    eyebrow: 'Chapter 04',
    title: '파트너와 함께 검증한 방식',
    description: '내부의 개선에 머물지 않고 파트너 환경에서 다시 검증하며 사업화 가능한 기준으로 정리했습니다.',
    label: '파트너 검증',
    source: '/corp/company-technology-partner.mp4',
  },
];

const staffProfiles = [
  {
    name: '윤태오',
    role: 'CEO · Executive Office',
    icon: 'Crown',
    imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=520&q=80',
    bio: '사업 방향, 파트너십, 투자 판단을 하나의 실행 언어로 정리합니다.',
  },
  {
    name: '박건우',
    role: 'CTO · Technology Lab',
    icon: 'Cpu',
    imageUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=520&q=80',
    bio: '프론트엔드, 백엔드, 보안, 배포 체계를 안정적인 제품 기반으로 연결합니다.',
  },
  {
    name: '정서연',
    role: 'COO · Operations Office',
    icon: 'BadgeCheck',
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=520&q=80',
    bio: '일정, 예산, 리스크, 문서 체계를 정리해 팀의 실행 속도를 유지합니다.',
  },
  {
    name: '한지민',
    role: 'CMO · Brand Growth',
    icon: 'Megaphone',
    imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=520&q=80',
    bio: '시장 메시지, 콘텐츠, 캠페인 지표를 연결해 고객 접점을 확장합니다.',
  },
  {
    name: '이도현',
    role: 'Head of Product · Product Strategy',
    icon: 'Building2',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=520&q=80',
    bio: '고객 문제를 기능 요구사항과 출시 기준으로 바꾸고 우선순위를 조율합니다.',
  },
  {
    name: '최민준',
    role: 'Engineering Lead · Technology Lab',
    icon: 'Cpu',
    imageUrl: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=520&q=80',
    bio: '서비스 구조와 릴리즈 흐름을 관리하며 개발 품질을 끌어올립니다.',
  },
  {
    name: '문하린',
    role: 'AI Lead · Data Platform',
    icon: 'Database',
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=520&q=80',
    bio: '데이터 수집, 분석, AI 보조 흐름을 제품 안에서 재사용 가능한 구조로 만듭니다.',
  },
  {
    name: '서지우',
    role: 'Design Lead · Experience Studio',
    icon: 'Palette',
    imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=520&q=80',
    bio: '브랜드와 제품 화면을 사용자가 바로 이해할 수 있는 경험으로 정리합니다.',
  },
  {
    name: '강소윤',
    role: 'Customer Success Lead · Experience',
    icon: 'Headphones',
    imageUrl: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=520&q=80',
    bio: '고객 피드백을 기록하고 제품 개선과 운영 기준으로 되돌립니다.',
  },
  {
    name: '오준혁',
    role: 'Business Lead · Partnership',
    icon: 'Handshake',
    imageUrl: 'https://images.unsplash.com/photo-1557862921-37829c790f19?auto=format&fit=crop&w=520&q=80',
    bio: '파트너 접점, 제안, 계약 전환 흐름을 실제 실행 단계로 연결합니다.',
  },
  {
    name: '신아름',
    role: 'Operations Lead · Operations Office',
    icon: 'Workflow',
    imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=520&q=80',
    bio: '프로젝트 일정과 내부 업무 흐름을 관리 가능한 프로세스로 고정합니다.',
  },
  {
    name: '김예린',
    role: 'People Lead · Culture',
    icon: 'HeartHandshake',
    imageUrl: 'https://images.unsplash.com/photo-1551836022-deb4988cc6c0?auto=format&fit=crop&w=520&q=80',
    bio: '채용, 온보딩, 팀 문화가 회사의 실행 방식과 같은 방향으로 이어지게 만듭니다.',
  },
];

const staffAccentColors = ['#2dd4bf', '#60a5fa', '#f5b84b', '#fb7185', '#38bdf8', '#2dd4bf'];

function inferStaffDepartmentKey(role: string) {
  const lowerRole = role.toLowerCase();
  if (lowerRole.includes('ceo') || lowerRole.includes('executive')) return 'leadership';
  if (lowerRole.includes('product')) return 'product';
  if (lowerRole.includes('cto') || lowerRole.includes('engineering') || lowerRole.includes('ai') || lowerRole.includes('data')) return 'technology';
  if (lowerRole.includes('design') || lowerRole.includes('experience') || lowerRole.includes('customer')) return 'experience';
  if (lowerRole.includes('cmo') || lowerRole.includes('business') || lowerRole.includes('partnership')) return 'growth';
  return 'operation';
}

function createStaffPeopleSeed() {
  return staffProfiles.map((profile, index) => {
    const [status, department = 'PRO PIG'] = profile.role.split('·').map((item) => item.trim());
    const profileNumber = String(index + 1).padStart(2, '0');

    return {
      ...profile,
      englishName: profile.name,
      department,
      departmentKey: inferStaffDepartmentKey(profile.role),
      location: index % 2 === 0 ? 'Seoul HQ' : 'Remote Core',
      status,
      quote: profile.bio,
      accent: staffAccentColors[index % staffAccentColors.length],
      skills: department.split(' ').filter(Boolean).slice(0, 2).concat(['실행', '협업']),
      metrics: [
        { label: '프로필', value: profileNumber },
        { label: '담당 영역', value: status },
        { label: '협업 지수', value: 'Live' },
      ],
      milestones: [
        { year: '2026', title: `${status} 역할 정리`, detail: profile.bio },
        { year: 'Now', title: department, detail: '현재 페이지에서 관리자가 상세 이력과 역할 설명을 직접 수정할 수 있습니다.' },
      ],
      cheers: ['역할과 책임이 명확합니다.', '팀 협업 흐름에 안정적으로 기여합니다.', '상세 프로필을 관리자에서 계속 갱신할 수 있습니다.'],
    };
  });
}

function createIntroductionBlocks(): CorpPageBlock[] {
  return [
    {
      id: 'introduction-hero',
      type: 'hero',
      enabled: true,
      data: {
        kicker: '회사소개',
        headline: '실제 화면과 운영 데이터를 함께 키우는 AI 운영 회사',
        body: 'PRO PIG는 기업 소개 사이트, 업무 생산성 앱, AI 자동화 도구를 한 제품군으로 묶어 기획, 개발, 검증, 운영 흐름을 빠르게 연결합니다. 현재 공개 페이지와 내부 도구가 같은 기준으로 업데이트되도록 콘텐츠, 수치, 그래프를 계속 정비하고 있습니다.',
        mediaUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80',
      },
    },
    {
      id: 'introduction-finance',
      type: 'metric-grid',
      enabled: true,
      data: {
        title: '현재 운영 현황',
        metrics: [
          { label: '회사 소개 섹션', value: '7개', caption: '소개, 창립, 대표, 직원, 기술, 사업, 사회공헌', icon: 'Sections' },
          { label: '핵심 제품 흐름', value: '6개', caption: '메모, 목표, 습관, 분석, 생성, 기업 운영', icon: 'Products' },
          { label: 'AI/자동화 흐름', value: '4개', caption: '분석, 요약, 생성, 검증 보조', icon: 'Automation' },
          { label: '관리 기능', value: '3개', caption: '메뉴, 페이지, 권한 관리', icon: 'Admin' },
          { label: '콘텐츠 상태', value: 'Live', caption: '발행 페이지와 편집 화면 동시 운영', icon: 'Live' },
          { label: '검증 방식', value: '2단계', caption: '코드 점검 후 브라우저 렌더링 확인', icon: 'QA' },
          { label: '기술 기반', value: 'Next.js', caption: 'Firebase 데이터, 인증, 배포 흐름 연결', icon: 'Stack' },
          { label: '현재 초점', value: '운영화', caption: '문구, 수치, 그래프를 실제 흐름과 정렬', icon: 'Focus' },
        ],
      },
    },
    {
      id: 'introduction-capital-allocation',
      type: 'metric-grid',
      enabled: true,
      data: {
        title: '운영 자원 배분',
        metrics: [
          { label: '제품 개발', value: '32%', caption: '핵심 화면과 기능 고도화', progress: 32, accent: '#2dd4bf' },
          { label: 'AI 자동화', value: '24%', caption: '분석, 생성, 요약 흐름 정비', progress: 24, accent: '#60a5fa' },
          { label: '기업 CMS', value: '18%', caption: '소개 페이지와 관리자 편집 구조', progress: 18, accent: '#f5c766' },
          { label: '콘텐츠', value: '14%', caption: '문구, 이미지, 섹션 상태 관리', progress: 14, accent: '#fb7185' },
          { label: 'QA/보안', value: '12%', caption: '권한, 렌더링, 배포 전 검증', progress: 12, accent: '#a78bfa' },
        ],
      },
    },
    {
      id: 'introduction-revenue-profit',
      type: 'metric-grid',
      enabled: true,
      data: {
        title: '운영 지표 추이',
        metrics: [
          {
            label: '2024',
            value: '2개',
            caption: '자동화 흐름',
            progress: 33,
            accent: '#2dd4bf',
            secondaryProgress: 25,
            secondaryAccent: '#f5c766',
            secondaryLabel: '자동화 흐름',
            secondaryValue: '1개',
            subLabel: '운영 모듈',
          },
          {
            label: '2025 H1',
            value: '3개',
            caption: '자동화 흐름',
            progress: 50,
            accent: '#2dd4bf',
            secondaryProgress: 50,
            secondaryAccent: '#f5c766',
            secondaryLabel: '자동화 흐름',
            secondaryValue: '2개',
            subLabel: '운영 모듈',
          },
          {
            label: '2025 H2',
            value: '5개',
            caption: '자동화 흐름',
            progress: 83,
            accent: '#2dd4bf',
            secondaryProgress: 75,
            secondaryAccent: '#f5c766',
            secondaryLabel: '자동화 흐름',
            secondaryValue: '3개',
            subLabel: '운영 모듈',
          },
          {
            label: '2026.06',
            value: '6개',
            caption: '자동화 흐름',
            progress: 100,
            accent: '#2dd4bf',
            secondaryProgress: 100,
            secondaryAccent: '#f5c766',
            secondaryLabel: '자동화 흐름',
            secondaryValue: '4개',
            subLabel: '운영 모듈',
          },
        ],
      },
    },
    {
      id: 'introduction-history',
      type: 'timeline',
      enabled: true,
      data: {
        title: 'PRO PIG 회사연혁',
        body: '제품 검증, 콘텐츠 운영, 자동화 적용, 품질 관리까지 현재 PRO PIG가 실제로 쌓아 온 흐름을 시간순으로 정리했습니다.',
        summaryItems: [
          { label: '기록 구간', value: '2023 - 2026' },
          { label: '핵심 단계', value: '4 stages' },
          { label: '성장 축', value: '제품 · AI · 운영' },
        ],
        items: [
          {
            date: '2023',
            title: '문제와 화면 구조 정리',
            body: '흩어진 업무 요청과 반복 대응을 제품 과제로 바꾸고, 회사 소개와 운영 도구가 함께 움직일 수 있는 화면 구조를 정리했습니다.',
            icon: '01',
            details: ['현장 요청 흐름 수집', '운영 문제와 제품 과제 연결', '초기 실행 기준 정리'],
          },
          {
            date: '2024',
            title: '제품형 운영 흐름 구축',
            body: '메모, 목표, 습관, 분석 같은 생산성 흐름을 제품 단위로 나누고, AI 보조 기능을 실제 사용 절차에 연결했습니다.',
            icon: '02',
            details: ['AI 워크플로우 적용', '내부 검토 프로세스 정착', '응답 품질 기준 수립'],
          },
          {
            date: '2025',
            title: '기업 콘텐츠와 도구 확장',
            body: '회사소개, 기업기술, 사업영역, 사회공헌 등 기업 페이지를 관리형 콘텐츠로 확장하고, 제품 화면과 같은 운영 기준을 적용했습니다.',
            icon: '03',
            details: ['파트너 운영 범위 확대', '재무 지표와 성장 지표 연결', '글로벌 협력 구조 정리'],
          },
          {
            date: '2026',
            title: 'AI·CMS 운영 기준 정착',
            body: '현재는 공개 페이지, 관리자 편집, AI 자동화, 브라우저 검증을 하나의 루프로 묶어 실제 화면과 데이터가 어긋나지 않게 정비하고 있습니다.',
            icon: '04',
            details: ['운영 기준 표준화', '고객과 파트너 신뢰도 강화', '상용 서비스 품질 관리'],
          },
        ],
      },
    },
    {
      id: 'introduction-values',
      type: 'feature-grid',
      enabled: true,
      data: {
        title: '현재 운영을 움직이는 10가지 기준',
        features: [
          {
            title: '현장 우선',
            body: '화면에 보이는 문제와 실제 사용 흐름을 먼저 확인합니다.',
            meta: '01 Field First',
            icon: '01',
            details: ['추상적인 선언보다 현재 페이지에서 사용자가 보는 상태를 기준으로 판단합니다.', '문구, 수치, 그래프가 실제 운영 흐름과 어긋나면 즉시 수정합니다.'],
          },
          {
            title: '데이터 기준',
            body: '감으로 판단하지 않고 기록, 지표, 화면 상태를 함께 봅니다.',
            meta: '02 Data Grounded',
            icon: '02',
            details: ['운영 현황은 숫자 카드와 그래프로 드러나야 합니다.', '정성 문구도 근거가 되는 기능, 섹션, 검증 단계와 연결합니다.'],
          },
          {
            title: '빠른 검증',
            body: '작게 고치고 실제 브라우저에서 바로 확인합니다.',
            meta: '03 Verify Fast',
            icon: '03',
            details: ['코드가 맞아도 화면에서 겹치거나 숨겨지면 완료로 보지 않습니다.', '데스크톱과 모바일에서 텍스트, 그래프, 섹션 노출을 함께 확인합니다.'],
          },
          {
            title: '자동화 우선순위',
            body: '반복되는 분석, 생성, 검증 흐름부터 자동화합니다.',
            meta: '04 Automation',
            icon: '04',
            details: ['사람의 판단이 필요한 구간과 자동 처리할 구간을 분리합니다.', 'AI 보조 기능은 실제 업무 시간을 줄이는 쪽에 먼저 배치합니다.'],
          },
          {
            title: '콘텐츠 일관성',
            body: '관리자 편집 데이터와 공개 페이지 문구가 같은 기준을 공유합니다.',
            meta: '05 Content Sync',
            icon: '05',
            details: ['회사소개, 기술, 사업영역의 톤을 하나의 운영 언어로 정리합니다.', '수정 가능한 데이터는 화면 반영 방식까지 함께 설계합니다.'],
          },
          {
            title: '보안과 권한',
            body: '관리 기능은 역할과 권한을 기준으로 접근 범위를 나눕니다.',
            meta: '06 Permission',
            icon: '06',
            details: ['편집, 발행, 메뉴 관리는 권한 확인을 거쳐 노출합니다.', '데이터 구조는 Firebase 규칙과 서비스 계층에서 함께 방어합니다.'],
          },
          {
            title: '파트너 책임 범위',
            body: '협업과 외부 연결은 역할, 일정, 결과물을 명확히 나눕니다.',
            meta: '07 Partner Scope',
            icon: '07',
            details: ['사업영역과 제휴 흐름은 실행 가능한 책임 범위로 표현합니다.', '파트너십 문구는 실제 운영 단계와 연결될 때만 사용합니다.'],
          },
          {
            title: '품질 회고',
            body: '작업 후에는 화면, 데이터, 유지보수성을 다시 확인합니다.',
            meta: '08 Review Loop',
            icon: '08',
            details: ['작은 문구 변경도 전체 섹션 흐름에 영향을 주는지 봅니다.', '숨겨진 섹션, 깨진 그래프, 오래된 수치를 재검토합니다.'],
          },
          {
            title: '사용자 경험 밀도',
            body: '첫 화면은 보기 좋게, 하단 섹션은 반복해서 읽기 쉽게 만듭니다.',
            meta: '09 UX Density',
            icon: '09',
            details: ['기업 사이트는 과장된 장식보다 스캔 가능한 정보 구조가 중요합니다.', '버튼, 그래프, 카드가 화면 크기에 따라 안정적으로 유지되게 합니다.'],
          },
          {
            title: '지속 가능한 운영',
            body: '발행 후에도 수정, 검증, 개선이 이어지는 구조를 유지합니다.',
            meta: '10 Continuous Ops',
            icon: '10',
            details: ['한 번 만든 페이지를 끝으로 보지 않고 현재 상태에 맞게 갱신합니다.', '제품, 콘텐츠, 운영 데이터를 같은 리듬으로 개선합니다.'],
          },
        ],
      },
    },
    {
      id: 'introduction-tech-knowledge',
      type: 'feature-grid',
      enabled: true,
      data: {
        title: '기술 소개',
        features: [
          {
            title: 'Data Signal',
            body: '흩어진 문의, 화면 상태, 운영 기록을 하나의 데이터 흐름으로 모아 다음 의사결정에 연결합니다.',
            meta: 'Webzine 01',
            icon: 'Data',
            mediaUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80',
            details: ['고객 신호와 내부 운영 기록을 같은 기준으로 정리합니다.', '반복되는 이슈와 주요 변화를 빠르게 찾습니다.'],
          },
          {
            title: 'AI Workflow',
            body: '문서 분류, 응답 초안, 콘텐츠 생성, 업무 요약을 AI 흐름으로 먼저 정리합니다.',
            meta: 'Webzine 02',
            icon: 'AI',
            mediaUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
            details: ['반복 문서와 고객 요청을 자동으로 분류합니다.', '응답 준비 시간을 줄이고 처리 기준을 일정하게 유지합니다.'],
          },
          {
            title: 'CMS Sync',
            body: '관리자에서 수정한 회사소개 데이터가 공개 페이지의 섹션, 문구, 그래프에 바로 이어지게 합니다.',
            meta: 'Webzine 03',
            icon: 'CMS',
            mediaUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
            details: ['섹션별 편집 단위를 데이터 블록으로 관리합니다.', '발행 전후의 문구와 수치가 같은 구조를 바라보게 합니다.'],
          },
          {
            title: 'Automation QA',
            body: '수정 후 코드와 브라우저 렌더링을 함께 확인해 숨겨진 섹션과 깨진 그래프를 줄입니다.',
            meta: 'Webzine 04',
            icon: 'QA',
            mediaUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80',
            details: ['데스크톱과 모바일에서 텍스트 겹침, 표시 상태, 그래프 비율을 확인합니다.', '수정된 화면은 로컬 서버에서 직접 렌더링해 검증합니다.'],
          },
          {
            title: 'Security Guardrail',
            body: '인증, 권한, Firestore 규칙, 관리 화면 접근을 분리해 운영 데이터의 변경 범위를 통제합니다.',
            meta: 'Webzine 05',
            icon: 'Security',
            mediaUrl: 'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?auto=format&fit=crop&w=900&q=80',
            details: ['관리 권한이 있는 사용자만 편집 진입점을 볼 수 있게 합니다.', '저장 전 데이터 구조를 스키마와 서비스 계층에서 정리합니다.'],
          },
        ],
      },
    },
    {
      id: 'introduction-vision',
      type: 'feature-grid',
      enabled: true,
      data: {
        title: '기업브랜드',
        features: [
          {
            title: '현재 상태를 한 화면에 연결',
            body: '제품과 기업 콘텐츠 현황을 운영자가 바로 읽을 수 있게 만듭니다.',
            meta: '01 Standard',
            icon: 'Standard',
            mediaUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
            details: ['흩어진 화면, 문구, 수치, 그래프를 같은 기준으로 정리해 관리 부담을 줄입니다.'],
          },
          {
            title: 'AI로 반복 업무 단축',
            body: '분석, 생성, 요약 같은 반복 업무를 AI 보조 흐름으로 줄입니다.',
            meta: '02 Decision',
            icon: 'Decision',
            mediaUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80',
            details: ['사람은 판단과 조율에 집중하고, 반복 입력과 초안 작성은 자동화 흐름으로 넘깁니다.'],
          },
          {
            title: '발행 가능한 콘텐츠 운영',
            body: '회사소개와 제품 화면을 관리자에서 지속적으로 갱신할 수 있게 합니다.',
            meta: '03 Growth',
            icon: 'Growth',
            mediaUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80',
            details: ['초안, 발행, 검증, 수정 루프를 유지해 현재 상태와 공개 문구 사이의 간격을 줄입니다.'],
          },
          {
            title: '검증 가능한 성장 구조',
            body: '운영 모듈과 자동화 흐름을 숫자로 추적하며 성장 기준을 명확히 합니다.',
            meta: '04 Trust',
            icon: 'Trust',
            mediaUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80',
            details: ['좋아 보이는 표현보다 실제로 확인 가능한 화면, 데이터, 검증 결과를 우선합니다.'],
          },
        ],
      },
    },
  ];
}

function createTechnologyBlocks(): CorpPageBlock[] {
  return [
    {
      id: 'technology-hero',
      type: 'hero',
      enabled: true,
      data: {
        kicker: 'COMPANY TECHNOLOGY',
        headline: 'PRO PIG 기업기술',
        body: '현재 공개 페이지는 기술 소개용 iframe을 중심으로 데이터, AI, 자동화, 보안, 파트너 검증 흐름을 보여줍니다.',
        mediaUrl: '/corp/company-world-map.html?view=technology',
        primaryLabel: '사업영역 보기',
        primaryHref: '/corp/company/business-area',
      },
    },
    {
      id: 'technology-embed',
      type: 'media-showcase',
      enabled: true,
      data: {
        title: '현재 적용 iframe과 기술 영상',
        body: '기업기술 페이지에서 쓰는 iframe 및 기술 관련 영상 주소입니다.',
        media: [
          {
            url: '/corp/company-world-map.html?view=technology',
            type: 'embed',
            alt: 'PRO PIG 기업기술',
            caption: '현재 기업기술 페이지 iframe · initialHeight 1200 · minHeight 720',
            description: '기업기술 공개 화면에서 사용하는 기본 iframe입니다.',
            height: 720,
          },
          {
            url: '/corp/company-technology-data.mp4',
            type: 'video',
            alt: '운영 데이터 영상',
            caption: '데이터로 남긴 첫 문제',
            description: '흩어진 운영 기록을 다시 볼 수 있는 데이터 구조로 정리합니다.',
          },
          {
            url: '/corp/company-technology-ai.mp4',
            type: 'video',
            alt: 'AI 실행 영상',
            caption: 'AI로 좁힌 실행 간격',
            description: '반복 판단과 응답 흐름을 AI가 보조해 실행 속도를 높입니다.',
          },
          {
            url: '/corp/company-technology-automation.mp4',
            type: 'video',
            alt: '업무 자동화 영상',
            caption: '자동화로 반복을 줄인 순간',
            description: '설명, 확인, 보고처럼 반복되는 업무를 자동화 흐름으로 묶습니다.',
          },
          {
            url: '/corp/company-technology-partner.mp4',
            type: 'video',
            alt: '파트너 검증 영상',
            caption: '파트너와 함께 검증한 방식',
            description: '내부 개선에 머물지 않고 파트너 환경에서 다시 검증합니다.',
          },
        ],
      },
    },
    {
      id: 'technology-features',
      type: 'feature-grid',
      enabled: true,
      data: {
        title: '기술 실행 구조',
        features: [
          {
            title: '운영 데이터',
            body: '흩어진 요청, 처리 기록, 고객 피드백을 다시 쓸 수 있는 데이터 구조로 정리합니다.',
            meta: 'Data',
            icon: 'Database',
            accent: '#5eead4',
            details: ['요청과 처리 기록을 남깁니다.', '고객 피드백을 다음 실행 기준으로 연결합니다.'],
          },
          {
            title: 'AI 실행 보조',
            body: '반복 판단과 응답 흐름을 AI가 보조해 팀의 실행 간격을 줄입니다.',
            meta: 'AI',
            icon: 'Sparkles',
            accent: '#f5b84b',
            details: ['반복 응답의 초안을 빠르게 정리합니다.', '실행자가 최종 판단할 수 있는 근거를 모읍니다.'],
          },
          {
            title: '업무 자동화',
            body: '설명, 확인, 보고처럼 반복되는 업무를 자동화해 핵심 문제 해결에 집중합니다.',
            meta: 'Automation',
            icon: 'Workflow',
            accent: '#60a5fa',
            details: ['확인과 보고 루틴을 자동화합니다.', '반복 작업 시간을 운영 개선에 돌립니다.'],
          },
          {
            title: '보안 기준',
            body: '관리자 권한, 데이터 접근, 배포 흐름을 운영 가능한 보안 기준 안에서 관리합니다.',
            meta: 'Security',
            icon: 'ShieldCheck',
            accent: '#fb7185',
            details: ['권한과 접근 범위를 분리합니다.', '운영 중인 배포 흐름을 추적합니다.'],
          },
          {
            title: '파트너 검증',
            body: '내부 개선에 머물지 않고 파트너 환경에서 다시 검증해 사업화 기준으로 고정합니다.',
            meta: 'Partner',
            icon: 'Handshake',
            accent: '#a7f3d0',
            details: ['파트너 환경에서 실제 반응을 확인합니다.', '검증 결과를 다음 사업 기준으로 정리합니다.'],
          },
        ],
      },
    },
    {
      id: 'technology-metrics',
      type: 'metric-grid',
      enabled: true,
      data: {
        title: '적용 정보',
        metrics: [
          { label: 'iframe view', value: 'technology', caption: 'company-world-map.html의 기술 뷰', icon: 'Microchip', accent: '#5eead4', progress: 100 },
          { label: 'initial height', value: '1200', caption: '공개 페이지 초기 iframe 높이', icon: 'Maximize2', accent: '#f5b84b', progress: 86 },
          { label: 'min height', value: '720', caption: '메시지 resize 이후 최소 높이', icon: 'Monitor', accent: '#60a5fa', progress: 60 },
        ],
      },
    },
  ];
}

function createFoundingBlocks(): CorpPageBlock[] {
  return [
    {
      id: 'founding-hero',
      type: 'hero',
      enabled: true,
      data: {
        kicker: 'FOUNDING BACKGROUND',
        headline: '창업배경은 문제와 실행이 정면으로 부딪힌 순간에서 시작됐습니다.',
        body: '왼쪽의 혼선은 매일 쌓이는 현장의 압박이고, 오른쪽의 체계는 그 압박을 버티며 만든 실행 방식입니다. PRO PIG는 두 장면이 충돌하는 지점에서 쓸모 있는 운영 기준을 만들었습니다.',
        mediaUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1100&q=82',
        primaryLabel: '사업영역 보기',
        primaryHref: '/corp/company/business-area',
      },
    },
    {
      id: 'founding-media',
      type: 'media-showcase',
      enabled: true,
      data: {
        title: '현재 적용 사진과 영상',
        body: '창업배경 페이지의 책장형 영상, 문제/실행 사진 URL입니다.',
        media: [
          ...foundingVideos.map((page) => ({
            url: page.source,
            type: 'video' as const,
            alt: page.title,
            caption: `${page.eyebrow} · ${page.label}`,
            description: page.description,
          })),
          {
            url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1100&q=82',
            type: 'image' as const,
            alt: '현장의 혼선',
            caption: 'Problem Side · 요청은 늘고 기준은 흩어져 있던 출발점',
          },
          {
            url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1100&q=82',
            type: 'image' as const,
            alt: '실행의 체계',
            caption: 'Build Side · 흩어진 경험을 반복 가능한 운영 방식으로 전환',
          },
        ],
      },
    },
    {
      id: 'founding-features',
      type: 'feature-grid',
      enabled: true,
      data: {
        title: 'WHY WE STARTED',
        features: [
          {
            title: '문제의 밀도',
            body: '현장 요청, 고객 피드백, 파트너 대응이 한꺼번에 몰리며 기존 방식의 한계가 먼저 보였습니다.',
            meta: 'Origin Signal',
            icon: 'Gauge',
          },
          {
            title: '실행의 증거',
            body: '멋진 선언보다 오늘 처리한 기록, 반복 가능한 절차, 다시 쓸 수 있는 기준을 먼저 쌓았습니다.',
            meta: 'Origin Signal',
            icon: 'BadgeCheck',
          },
          {
            title: '사업화의 방향',
            body: '각자 버티던 경험을 데이터와 운영 체계로 묶어 PRO PIG의 첫 제품 방향으로 정리했습니다.',
            meta: 'Origin Signal',
            icon: 'GitBranch',
          },
        ],
      },
    },
    {
      id: 'founding-statement',
      type: 'statement',
      enabled: true,
      data: {
        eyebrow: 'WHY WE STARTED',
        title: '창업배경 섹션',
        body: '시작은 거창한 사업계획서보다 단순했습니다. 매번 새로 설명하고, 다시 확인하고, 급하게 처리하던 일을 더 안정적인 시스템으로 바꾸자는 문제의식이 창업의 기준이 됐습니다.',
        items: ['불편을 기록', '패턴을 분리', '제품으로 고정'],
      },
    },
    {
      id: 'founding-timeline',
      type: 'timeline',
      enabled: true,
      data: {
        title: '문제가 제품 방향이 된 흐름',
        body: '',
        summaryItems: [],
        items: [
          { date: '01', title: '불편을 기록', body: '현장 요청과 반복 업무를 기록으로 남겨 문제의 밀도를 확인했습니다.', icon: 'Film' },
          { date: '02', title: '패턴을 분리', body: '반복되는 설명, 확인, 보고 흐름을 따로 떼어 자동화 가능한 구조로 만들었습니다.', icon: 'GitBranch' },
          { date: '03', title: '제품으로 고정', body: '검증된 방식을 제품 기준으로 정리하고 파트너 환경에서 다시 확인했습니다.', icon: 'ShieldCheck' },
        ],
      },
    },
    {
      id: 'founding-quote',
      type: 'quote',
      enabled: true,
      data: {
        quote: '창업배경은 멋진 선언이 아니라 반복해서 부딪힌 문제를 끝까지 기록한 결과입니다.',
        cite: 'PRO PIG Founding Story',
      },
    },
  ];
}

function createCeoBlocks(): CorpPageBlock[] {
  return [
    {
      id: 'ceo-hero',
      type: 'hero',
      enabled: true,
      data: {
        kicker: 'CEO PROFILE',
        headline: '대표소개, 이번엔 솔직하게 접어 봤습니다.',
        body: '공식 이력과 생활형 현장 감각을 한 화면에서 보여주는 대표 프로필 페이지입니다.',
        mediaUrl: '/corp/ceo-intro-satire.png',
        primaryLabel: '직원소개 보기',
        primaryHref: '/corp/company/staff-intro',
      },
    },
    {
      id: 'ceo-media',
      type: 'media-showcase',
      enabled: true,
      data: {
        title: '대표 이미지',
        body: '현재 대표소개 페이지에서 사용하는 이미지 주소입니다.',
        media: [
          {
            url: '/corp/ceo-intro-satire.png',
            type: 'image',
            alt: '공사 현장 분위기의 대표 인물 사진',
            caption: '대표소개 메인 포트레이트',
          },
        ],
      },
    },
    {
      id: 'ceo-profile-sections',
      type: 'feature-grid',
      enabled: true,
      data: {
        title: '프로필 섹션',
        features: [
          {
            title: '신체 스펙',
            body: '키 약 180cm, 전성기 체중 약 145kg, 시력 좌 0.6 / 우 0.3, 혈액형 B형, 술은 안 마시는 타입이라는 설정을 담습니다.',
            meta: '01',
            icon: 'Activity',
            details: [
              '키: 약 180cm. 실제로는 조금 모자라지만, 프로필에는 언제나 반올림의 미학이 있다.',
              '몸무게: 전성기 최대 약 145kg. 현재는 110kg-120kg 사이를 유동적으로 왕복한다.',
              '시력: 좌 0.6 / 우 0.3. 멀리 있는 리스크보다 눈앞의 위기를 먼저 보는 타입.',
              '혈액형: B형. 자기 페이스가 강하고, 핑계도 비교적 빠르게 나온다.',
              '음주/흡연: 술은 안 마신다. 담배는 많이 핀다. 건강관리는 늘 다음 분기 핵심 과제다.',
              '특이사항: 중량급 체형이지만 위기 상황에서는 경량급 기동성을 보인다. 도망갈 때만큼은 조직 내 최상위권.',
            ],
          },
          {
            title: '학력',
            body: '서울대학교, 하버드, 예일 같은 드림 스쿨과 실제 최종학력 고졸 사이의 간극을 유머러스하게 보여줍니다.',
            meta: '02',
            icon: 'GraduationCap',
            details: [
              '서울대학교 법과대학: 학사(LL.B) 2003.03-2007.02를 꿈꿨다.',
              '하버드대학교 로스쿨: 법학석사(LL.M) 2008.08-2009.05도 상상 속에서는 꽤 진지했다.',
              '예일대학교 로스쿨: 법학박사(J.S.D.) 2009.09-2014.05까지 가는 장기 시나리오도 있었다.',
              '실제 최종학력: 고졸. 대신 현장학, 생존전략, 재기론은 비공식 전공처럼 오래 수강했다.',
            ],
          },
          {
            title: '경력',
            body: '10대 중반부터 현재까지 배달, 현장, 영업, 인력 업무를 거친 생활형 타임라인입니다.',
            meta: '03',
            icon: 'BriefcaseBusiness',
            details: [
              '10대 중반: 문화일보 석간배달과 음식점 배달로 노동의 기본기를 배웠다.',
              '10대 후반: 각종 비공식 아르바이트를 경험했다. 공식 이력서에는 적기 난감한 챕터.',
              '20대 초반: 사행성 오락실 근무 및 운영. 확률과 리스크를 몸으로 익혔다.',
              '20대 중반: 휴대폰 판매와 운영. 말발, 손님 응대, 재고 스트레스를 한 번에 배웠다.',
              '20대 후반: 공익근무와 휴대폰 내구제. 제도권과 비제도권 사이를 오갔다.',
              '30대 초반: 도박 등으로 한 번 무너졌다. 경력 공백이 아니라 인생 손절매 구간.',
              '30대 중반: 인력사무실 운영. 사람, 현장, 돈의 속도를 동시에 관리했다.',
              '30대 후반: 건설시공팀과 인력사무실 운영. 현장형 리더십의 흙먼지 버전.',
              '40대 초반: 징역 복역 후 잠깐 열심히 살았다. “잠깐”이라는 표현이 이력의 핵심 포인트다.',
              '현재: 노가다, 배달, 대리, 택배 등 다양한 일을 경험 중. 직함보다 생계 대응력이 먼저다.',
            ],
          },
          {
            title: '기술 및 자격증',
            body: '1종 보통, 1종 대형, 2종 소형 면허와 현장 감각, 빠른 실행력을 핵심 역량으로 정리합니다.',
            meta: '04',
            icon: 'BadgeCheck',
            details: [
              '운전면허: 1종 보통, 1종 대형, 2종 소형 보유.',
              '현장 기술: 배달 동선, 대리운전 감각, 택배 적재, 인력 배치, 급한 상황 판단에 강하다.',
              '대표 역량: 계획서보다 빠른 실행, 회의보다 빠른 이동, 포장보다 빠른 인정.',
            ],
          },
          {
            title: '범죄 경력',
            body: '형사 이력과 생활 기록을 숨기지 않고 솔직한 메시지로 정리하는 투명경영 섹션입니다.',
            meta: '05',
            icon: 'ShieldAlert',
            details: [
              '형사 이력: 징역 1년. 미화할 수 없고, 숨기기에도 이미 너무 진한 구간.',
              '주요 경력: 사기, 폭행, 재물손괴 등 잡범 경력 보유.',
              '생활 기록: 과태료, 범칙금 등 자잘한 행정 이력도 다수. 성실함의 방향이 가끔 잘못 잡혔다.',
              '현재 메시지: 깨끗한 척보다 덜 위험한 건, 적어도 더럽게 지나온 길을 알고 있다는 점이다.',
            ],
          },
        ],
      },
    },
    {
      id: 'ceo-identity',
      type: 'statement',
      enabled: true,
      data: {
        eyebrow: '비공식 대표 약력',
        title: '포장지는 얇고, 이력은 두껍다.',
        body: '학벌과 무결점 대신 현장, 시행착오, 재기, 생활력을 들고 온 대표. 이 소개는 장점만 광내는 기업 프로필 대신, 흠집까지 드러내는 풍자 버전이다.',
        items: ['대표 요약 키커, 제목, 본문을 별도 섹션에서 수정합니다.', '그래프 수치 카드는 빠른 정보 블록에서 수정합니다.'],
      },
    },
    {
      id: 'ceo-facts',
      type: 'metric-grid',
      enabled: true,
      data: {
        title: '빠른 정보',
        metrics: [
          {
            label: '최종학력',
            value: '고졸',
            caption: '현장과 생존 전략을 오래 배운 타입',
            icon: 'GraduationCap',
            progress: 58,
            accent: '#60a5fa',
            subLabel: '검증',
            subValue: '실전형',
          },
          {
            label: '면허',
            value: '1종 대형',
            caption: '바퀴 달린 것과 현장 동선에 강한 프로필',
            icon: 'BadgeCheck',
            progress: 84,
            accent: '#34d399',
            subLabel: '가동성',
            subValue: '높음',
          },
          {
            label: '주요 전공',
            value: '현장 생존',
            caption: '직함보다 생활력과 실행력을 앞세웁니다.',
            icon: 'Scale',
            progress: 91,
            accent: '#a78bfa',
            subLabel: '생존력',
            subValue: '상',
          },
        ],
      },
    },
    {
      id: 'ceo-timeline',
      type: 'timeline',
      enabled: true,
      data: {
        title: '생활력이 먼저였던 타임라인',
        body: '결론: 번듯함은 약하고, 생존력은 강한 대표. 그래서 이 소개는 홍보자료보다 자백서에 가깝다.',
        summaryItems: [],
        items: [
          { date: '10대', title: '배달과 현장 경험', body: '신문, 배달, 각종 아르바이트를 통해 노동의 기본기를 배웠습니다.', icon: 'UserRound' },
          { date: '20대', title: '영업과 운영', body: '여행사, 의류 판매, 공익근무, 대리운전 등 말과 대응의 현장을 거쳤습니다.', icon: 'BriefcaseBusiness' },
          { date: '30대', title: '인력사무소 운영', body: '사람, 현장, 돈의 속도를 동시에 관리하며 운영 감각을 키웠습니다.', icon: 'Scale' },
          { date: '현재', title: '대표 역할', body: '멋진 직함보다 빠른 인정, 실행, 책임을 우선하는 대표 캐릭터로 정리됩니다.', icon: 'Sparkles' },
        ],
      },
    },
  ];
}

function createStaffBlocks(): CorpPageBlock[] {
  return [
    {
      id: 'staff-hero',
      type: 'hero',
      enabled: true,
      data: {
        kicker: 'TEAM DIRECTORY',
        headline: '직원소개',
        body: '팀별 필터, 인물 카드, 상세 프로필 drawer로 구성된 현재 직원소개 페이지의 핵심 데이터를 관리합니다.',
        mediaUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1100&q=82',
        primaryLabel: '사업영역 보기',
        primaryHref: '/corp/company/business-area',
      },
    },
    {
      id: 'staff-departments',
      type: 'feature-grid',
      enabled: true,
      data: {
        title: '부서 필터',
        features: [
          { title: '리더십', body: '전략과 의사결정 흐름을 설계하는 경영 리드', meta: 'leadership', icon: 'Crown' },
          { title: '제품', body: '고객 문제를 제품 로드맵과 출시 기준으로 전환', meta: 'product', icon: 'Building2' },
          { title: '기술', body: '플랫폼, AI, 서비스 안정성을 만드는 엔지니어링 조직', meta: 'technology', icon: 'Cpu' },
          { title: '경험', body: '브랜드와 사용 흐름을 시각적 경험으로 정리', meta: 'experience', icon: 'Palette' },
          { title: '성장', body: '시장, 고객, 파트너 접점을 확장하는 성장 조직', meta: 'growth', icon: 'Megaphone' },
          { title: '운영', body: '일정, 리스크, 프로세스를 안정화하는 운영 조직', meta: 'operation', icon: 'Workflow' },
        ],
      },
    },
    {
      id: 'staff-people',
      type: 'people-grid',
      enabled: true,
      data: {
        title: '현재 적용 인물 카드',
        people: createStaffPeopleSeed(),
      },
    },
    {
      id: 'staff-flow',
      type: 'timeline',
      enabled: true,
      data: {
        title: '협업이 이어지는 방식',
        body: '전략 결정부터 제품 정의, 기술 실행, 고객 검증, 운영 정착까지 직원들이 이어받는 협업 흐름을 정리했습니다.',
        summaryItems: [
          { label: '협업 단계', value: '5 steps' },
          { label: '핵심 부서', value: '6 teams' },
          { label: '운영 축', value: '전략 · 제품 · 기술 · 검증 · 운영' },
        ],
        items: [
          { date: '01', title: '전략', body: 'Executive Office가 방향과 의사결정 기준을 세웁니다.', icon: 'Crown', details: ['목표와 우선순위를 정리합니다.'] },
          { date: '02', title: '제품 정의', body: 'Product Strategy가 고객 문제와 출시 기준을 정리합니다.', icon: 'Target', details: ['기능 범위와 출시 기준을 맞춥니다.'] },
          { date: '03', title: '기술 실행', body: 'Technology Lab이 안정적인 서비스 구조로 구현합니다.', icon: 'Cpu', details: ['개발, 배포, 보안 기준을 연결합니다.'] },
          { date: '04', title: '고객 검증', body: 'Customer Success가 피드백을 수집해 개선으로 연결합니다.', icon: 'Headphones', details: ['사용자 반응과 개선 요청을 수집합니다.'] },
          { date: '05', title: '운영 정착', body: 'Operations Office가 반복 가능한 프로세스로 고정합니다.', icon: 'Workflow', details: ['반복 가능한 운영 절차로 정리합니다.'] },
        ],
      },
    },
  ];
}

function createBusinessBlocks(): CorpPageBlock[] {
  return [
    {
      id: 'business-hero',
      type: 'hero',
      enabled: true,
      data: {
        kicker: 'BUSINESS AREA LINEUP',
        headline: '사업영역',
        body: '레그워크, 엔지니어링, 미디어, 에이전시를 중심으로 실제 실행 가능한 사업 영역을 소개합니다.',
        mediaUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=82',
        primaryLabel: '사회공헌 보기',
        primaryHref: '/corp/company/social-contribution',
      },
    },
    {
      id: 'business-areas',
      type: 'feature-grid',
      enabled: true,
      data: {
        title: '현재 적용 사업 카드',
        features: [
          {
            title: '레그워크',
            body: '현장과 고객, 파트너 사이를 먼저 움직이며 사업 기회가 실제 실행으로 이어지도록 정리합니다.',
            meta: 'Legwork · 현장 확인 / 관계 조율 / 실행 리포트',
            icon: 'Footprints',
            subtitle: '발로 확인한 정보가 가장 빠른 실행 기준이 됩니다.',
            mediaUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=82',
            mediaAlt: '현장 미팅에서 팀이 사업 실행 방향을 논의하는 사진',
            accent: '#5eead4',
            statLabel: 'Response',
            statValue: '1st move',
            details: [
              '현장 요구와 파트너 상황을 빠르게 확인해 실행 우선순위를 정합니다.',
              '말로만 남은 요청을 담당자, 일정, 다음 액션으로 분리합니다.',
              '지역 접점과 고객 반응을 모아 다음 사업 판단에 쓸 수 있게 정리합니다.',
            ],
          },
          {
            title: '엔지니어링',
            body: '아이디어를 실제 제품, 자동화, 데이터 흐름으로 바꾸는 기술 설계와 구현 영역입니다.',
            meta: 'Engineering · 서비스 설계 / 자동화 구축 / 데이터 연결',
            icon: 'Wrench',
            subtitle: '운영을 버티는 구조는 설계와 자동화에서 시작됩니다.',
            mediaUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=82',
            mediaAlt: '엔지니어링 장비와 회로가 보이는 기술 개발 사진',
            accent: '#60a5fa',
            statLabel: 'Build',
            statValue: 'System',
            details: [
              '반복 업무를 줄이는 내부 도구와 자동화 흐름을 설계합니다.',
              '데이터 수집, 분석, 리포트 흐름을 서비스 구조 안에 연결합니다.',
              '새 기능이 현장에서 유지될 수 있도록 배포와 운영 기준을 함께 만듭니다.',
            ],
          },
          {
            title: '미디어',
            body: '브랜드 메시지, 제품 화면, 프로젝트 결과를 콘텐츠로 만들고 채널에 맞게 편집합니다.',
            meta: 'Media · 영상 기획 / 콘텐츠 편집 / 채널 운영',
            icon: 'Clapperboard',
            subtitle: '보여지는 장면까지 설계해야 사업 메시지가 남습니다.',
            mediaUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=82',
            mediaAlt: '카메라와 영상 제작 장비가 놓인 미디어 제작 사진',
            accent: '#f472b6',
            statLabel: 'Content',
            statValue: 'On air',
            details: [
              '소개 영상, 이미지, 숏폼, 발표 자료의 핵심 메시지를 구성합니다.',
              '사업 결과물을 고객이 이해하기 쉬운 장면과 문장으로 변환합니다.',
              '웹, SNS, 제안서 등 채널별로 콘텐츠 톤과 포맷을 조정합니다.',
            ],
          },
          {
            title: '에이전시',
            body: '기획, 제안, 실행, 운영을 묶어 고객과 파트너가 바로 움직일 수 있는 프로젝트 형태로 제공합니다.',
            meta: 'Agency · 프로젝트 기획 / 제안 운영 / 파트너 조율',
            icon: 'Handshake',
            subtitle: '좋은 제안은 실행 가능한 역할표와 일정표를 함께 갖습니다.',
            mediaUrl: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=82',
            mediaAlt: '에이전시 회의에서 프로젝트를 논의하는 사진',
            accent: '#f5c766',
            statLabel: 'Project',
            statValue: 'Ready',
            details: [
              '브랜드, 캠페인, 서비스 프로젝트의 방향성과 실행 범위를 정리합니다.',
              '외부 파트너와 내부 실행 조직 사이의 역할과 책임을 조율합니다.',
              '기획서에서 끝나지 않도록 결과물, 일정, 운영 방식까지 관리합니다.',
            ],
          },
        ],
      },
    },
    {
      id: 'business-media',
      type: 'media-showcase',
      enabled: true,
      data: {
        title: '현재 적용 이미지와 지도 iframe',
        body: '사업영역 카드 이미지, 한국 지도, 글로벌 네트워크 iframe 주소입니다.',
        media: [
          {
            url: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=82',
            type: 'image',
            alt: '레그워크 현장 미팅',
            caption: '레그워크 카드 이미지',
            description: '현장 요구와 파트너 상황을 빠르게 확인하는 사업 실행 이미지입니다.',
          },
          {
            url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=82',
            type: 'image',
            alt: '엔지니어링 장비와 코드',
            caption: '엔지니어링 카드 이미지',
            description: '자동화, 데이터 연결, 서비스 구조를 보여주는 기술 실행 이미지입니다.',
          },
          {
            url: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=82',
            type: 'image',
            alt: '미디어 제작 장비',
            caption: '미디어 카드 이미지',
            description: '브랜드 메시지와 결과물을 콘텐츠로 정리하는 미디어 이미지입니다.',
          },
          {
            url: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=82',
            type: 'image',
            alt: '에이전시 회의',
            caption: '에이전시 카드 이미지',
            description: '기획, 제안, 실행, 운영을 조율하는 프로젝트 이미지입니다.',
          },
          {
            url: '/corp/company-korea-map.html',
            type: 'embed',
            alt: '전국 운영 지도',
            caption: '한국 지도 iframe',
            description: '전국 운영 거점과 연결 흐름을 보여주는 지도 iframe입니다.',
            height: 520,
          },
          {
            url: '/corp/company-world-map.html?view=network',
            type: 'embed',
            alt: '글로벌 네트워크 지도',
            caption: '글로벌 네트워크 iframe',
            description: '국내 거점에서 외부 네트워크로 확장되는 연결 지도를 보여줍니다.',
            height: 620,
          },
        ],
      },
    },
    {
      id: 'business-metrics',
      type: 'metric-grid',
      enabled: true,
      data: {
        title: '전국 운영 신호',
        metrics: [
          { label: 'Coverage', value: '17', caption: '시·도별 운영 거점', icon: 'MapPinned' },
          { label: 'Operating cells', value: '156', caption: '전국 고객 접점', icon: 'Building2' },
          { label: 'Response route', value: 'Ansan', caption: '출발점 기준 연결 흐름', icon: 'Navigation' },
        ],
      },
    },
    {
      id: 'business-cta',
      type: 'cta',
      enabled: true,
      data: {
        title: '사업영역 상담 연결',
        body: '관심 있는 사업 영역과 파트너십 방향을 관리자에서 수정해 발행본에 반영할 수 있습니다.',
        label: '사업제휴 문의',
        href: '/corp/partnership/business',
      },
    },
  ];
}

function createSocialBlocks(): CorpPageBlock[] {
  return [
    {
      id: 'social-hero',
      type: 'hero',
      enabled: true,
      data: {
        kicker: 'SOCIAL IMPACT LOTTERY',
        headline: '사회공헌 로또 스테이션',
        body: '추첨 공, 즉석복권, 기부 포인트를 한 화면에서 운영하는 사내 참여 이벤트입니다.',
        mediaUrl: '/corp/social-lottery-draw-machine.png',
        primaryLabel: '사업제휴 문의',
        primaryHref: '/corp/partnership/business',
      },
    },
    {
      id: 'social-media',
      type: 'media-showcase',
      enabled: true,
      data: {
        title: '현재 적용 추첨기 이미지',
        body: '사회공헌 페이지에서 사용하는 실제 로또 추첨기 이미지 주소입니다.',
        media: [
          {
            url: '/corp/social-lottery-draw-machine.png',
            type: 'image',
            alt: '사회공헌 로또 추첨기',
            caption: '로또 추첨기 메인 이미지',
            description: '사회공헌 로또 스테이션에서 사용하는 추첨기 대표 이미지입니다.',
          },
        ],
      },
    },
    {
      id: 'social-scratch',
      type: 'feature-grid',
      enabled: true,
      data: {
        title: '즉석복권 숫자 아이콘',
        features: [
          { title: '기부 포인트', body: '50P 보상 숫자 아이콘입니다.', meta: '#fb7185', icon: '01' },
          { title: '봉사 포인트', body: '40P 보상 숫자 아이콘입니다.', meta: '#38bdf8', icon: '02' },
          { title: '그린 포인트', body: '35P 보상 숫자 아이콘입니다.', meta: '#34d399', icon: '03' },
          { title: '선물 포인트', body: '30P 보상 숫자 아이콘입니다.', meta: '#f5c766', icon: '04' },
          { title: '응원 포인트', body: '25P 보상 숫자 아이콘입니다.', meta: '#a78bfa', icon: '05' },
        ],
      },
    },
    {
      id: 'social-impact',
      type: 'metric-grid',
      enabled: true,
      data: {
        title: '임팩트 미션',
        metrics: [
          { label: '지역 아동 식사', value: '120P', caption: '기부 포인트 120P', icon: 'Gift' },
          { label: '환경 키트', value: '220P', caption: '미션 포인트 220P', icon: 'Leaf' },
          { label: '참여 매칭데이', value: '360P', caption: '미션 포인트 360P', icon: 'BadgeCheck' },
        ],
      },
    },
    {
      id: 'social-log',
      type: 'statement',
      enabled: true,
      data: {
        eyebrow: 'ACTIVITY LOG',
        title: '기본 운영 기록',
        body: '참여 전 대기 상태에서 표시되는 기본 활동 로그입니다.',
        items: ['사회공헌 이벤트 대기 · 참여 기록 · 0P', '기부 포인트 보드 준비 · 운영 기록 · 0P'],
      },
    },
  ];
}

function createBlocks(slug: string): CorpPageBlock[] {
  switch (slug) {
    case 'introduction':
      return createIntroductionBlocks();
    case 'founding-background':
      return createFoundingBlocks();
    case 'ceo-intro':
      return createCeoBlocks();
    case 'staff-intro':
      return createStaffBlocks();
    case 'business-area':
      return createBusinessBlocks();
    case 'technology':
      return createTechnologyBlocks();
    case 'social-contribution':
      return createSocialBlocks();
    default:
      return [
        {
          id: `${slug}-hero`,
          type: 'hero',
          enabled: true,
          data: {
            kicker: 'COMPANY CMS',
            headline: '회사소개 페이지',
            body: '관리자에서 초안을 수정하고 발행할 수 있는 회사소개 CMS 기본 페이지입니다.',
            primaryLabel: '문의하기',
            primaryHref: '/corp/partnership/business',
          },
        },
      ];
  }
}

const SAVED_CORP_PAGE_OVERRIDES = savedCorpPageOverrides as CorpPage[];
const SAVED_CORP_PAGE_OVERRIDE_BY_ID = new Map(
  SAVED_CORP_PAGE_OVERRIDES.map((page) => [page.id, page]),
);

function applySavedOverride(seed: CorpPage): CorpPage {
  const override = SAVED_CORP_PAGE_OVERRIDE_BY_ID.get(seed.id);
  if (!override) return seed;

  return {
    ...seed,
    ...override,
    id: seed.id,
    slug: seed.slug,
    status: 'draft',
    order: seed.order,
    hidden: override.hidden ?? seed.hidden,
    templateKey: seed.templateKey,
    blocks: override.blocks.length > 0 ? override.blocks : seed.blocks,
    menu: {
      ...seed.menu,
      ...override.menu,
    },
    seo: {
      ...seed.seo,
      ...override.seo,
    },
    templateSettings: {
      ...seed.templateSettings,
      ...override.templateSettings,
    },
  };
}

const BASE_CORP_PAGE_SEEDS: CorpPage[] = SEED_PAGE_META.map((page, index) => ({
  id: page.slug,
  slug: page.slug,
  title: page.title,
  description: page.description,
  status: 'draft',
  order: (index + 1) * 10,
  hidden: false,
  templateKey: page.templateKey,
  blocks: createBlocks(page.slug),
  menu: {
    label: page.title,
    icon: page.menuIcon,
  },
  seo: {
    title: `${page.title} | 회사소개`,
    description: page.description,
  },
  templateSettings:
    page.slug === 'social-contribution'
      ? {
          socialContribution: {
            initialImpactPoints: 0,
            lottoWarmupMs: 700,
            lottoStepIntervalMs: 2050,
            lottoRollDurationMs: 1840,
            scratchRevealThreshold: 54,
            noticeText: '실제 구매/환급 없는 모의 이벤트',
          },
        }
      : {},
}));

export const CORP_PAGE_SEEDS: CorpPage[] = BASE_CORP_PAGE_SEEDS.map(applySavedOverride);

export const CORP_PAGE_SEED_BY_ID = CORP_PAGE_SEEDS.reduce<Record<string, CorpPage>>((acc, page) => {
  acc[page.id] = page;
  return acc;
}, {});
