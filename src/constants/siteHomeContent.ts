import { CORP_PAGE_DEFINITIONS } from '@/constants/corpPages';
import { COMPANY_MENU_ITEMS } from '@/constants/companyMenu';
import type { SiteHomePageProps } from '@/components/site-home/SiteHomePage';

export const ADMIN_HOME_CONTENT: SiteHomePageProps = {
  eyebrow: 'ADMIN SITE',
  title: '관리 사이트 홈',
  description: '운영 도구, 콘텐츠 관리, AI 설정을 한 곳에서 시작하는 관리자 전용 첫 화면입니다.',
  accent: '#10b981',
  accentAlt: '#38bdf8',
  icon: 'shield-halved',
  metrics: [
    { label: '사이트 모드', value: '3', caption: '관리, 기업, propig' },
    { label: '핵심 도구', value: '6', caption: '메뉴와 운영 기능' },
    { label: '진입 방식', value: '홈', caption: '모드 전환 시 이동' },
  ],
  primaryLinks: [
    {
      label: '통합 메뉴 관리',
      path: '/admin/menu',
      icon: 'bars',
      description: '사이트별 좌측 메뉴와 권한 구조를 편집합니다.',
    },
    {
      label: '유저 관리',
      path: '/admin/users',
      icon: 'user-shield',
      description: '역할, 사이트 접근, 메뉴 관리 권한을 계정별로 설정합니다.',
    },
    {
      label: '시스템 설정',
      path: '/admin/system-settings',
      icon: 'gears',
      description: '로고, 파비콘, 공통 브랜드 설정을 관리합니다.',
    },
    {
      label: 'Storage',
      path: '/admin/storage',
      icon: 'hard-drive',
      description: '업무 파일과 폴더를 워크스페이스처럼 정리합니다.',
    },
    {
      label: '사진 관리',
      path: '/admin/photos',
      icon: 'images',
      description: '사이트에 쓰이는 사진첩과 이미지 자산을 관리합니다.',
    },
  ],
  sections: [
    {
      title: 'AI 운영',
      description: '콘텐츠 생성과 모델 설정을 빠르게 열 수 있습니다.',
      links: [
        {
          label: 'AI 이미지 생성기',
          path: '/admin/image-generator',
          icon: 'wand-magic-sparkles',
          description: '브랜드 이미지와 콘텐츠용 이미지를 생성합니다.',
        },
        {
          label: 'OpenRouter 설정',
          path: '/admin/openrouter-settings',
          icon: 'key',
          description: 'API 키와 모델별 적용 대상을 점검합니다.',
        },
        {
          label: 'OpenRouter 사용량',
          path: '/admin/openrouter-usage',
          icon: 'chart-line',
          description: '실제 비용과 토큰 사용량을 확인합니다.',
        },
        {
          label: 'YouTube 분석',
          path: '/youtube-analyze',
          icon: 'circle-play',
          description: '영상 분석 결과와 인사이트를 관리합니다.',
        },
      ],
    },
  ],
};

const corpProjectLinks = CORP_PAGE_DEFINITIONS.filter((page) => page.category !== '회사소개').slice(0, 6);

export const CORP_HOME_CONTENT: SiteHomePageProps = {
  eyebrow: 'CORPORATE SITE',
  title: '기업 사이트 홈',
  description: '회사소개, 프로젝트, 제휴, 채용 콘텐츠를 방문자 관점의 기업 사이트처럼 구성합니다.',
  accent: '#60a5fa',
  accentAlt: '#a78bfa',
  icon: 'building',
  prefetchLinks: false,
  metrics: [
    { label: '소개 섹션', value: String(COMPANY_MENU_ITEMS.length), caption: '회사 핵심 콘텐츠' },
    { label: '콘텐츠 그룹', value: '4', caption: '소개, 프로젝트, 제휴, 채용' },
    { label: '운영 목적', value: '브랜드', caption: '외부 공개형 흐름' },
  ],
  primaryLinks: COMPANY_MENU_ITEMS.map((page) => ({
    label: page.label,
    path: page.href,
    icon: page.icon,
    description: page.description,
  })),
  sections: [
    {
      title: '기업 운영 메뉴',
      description: '프로젝트와 제휴, 채용 화면으로 이어지는 주요 진입점입니다.',
      links: corpProjectLinks.map((page) => ({
        label: page.menuLabel,
        path: page.path,
        icon: page.category === '프로젝트' ? 'diagram-project' : page.category === '제휴하기' ? 'handshake' : 'user-plus',
        description: page.description,
      })),
    },
  ],
};

export const PROPIG_HOME_CONTENT: SiteHomePageProps = {
  eyebrow: 'PROPIG SELF MANAGEMENT',
  title: 'propig 자기관리 대시보드',
  description: '목표 설계, 습관 기록, 일정 관리, 메모장, 버킷리스트를 한 화면에서 이어가는 개인 성장 워크스페이스입니다.',
  accent: '#22c55e',
  accentAlt: '#38bdf8',
  icon: 'bullseye',
  metrics: [
    { label: '목표 설계', value: '5', caption: '핵심 관리 도구' },
    { label: '습관 기록', value: '월간', caption: '캘린더 기반 추적' },
    { label: '일정 관리', value: '반복', caption: '할 일과 일정 정리' },
  ],
  primaryLinks: [],
  sections: [
    {
      title: '자기관리 흐름',
      description: 'propig에서 목표, 습관, 일정, 메모, 장기 목표를 관리하는 핵심 진입점입니다.',
      links: [
        {
          label: '메모장',
          path: '/propig/memos',
          icon: 'file-lines',
          description: '생각, 할 일 보조 기록, 아이디어를 빠르게 적고 다시 찾습니다.',
        },
        {
          label: '습관 기록',
          path: '/habit-tracker',
          icon: 'calendar-check',
          description: '반복 루틴을 날짜별로 체크하고 누적 흐름을 확인합니다.',
        },
        {
          label: '할일 일정표',
          path: '/todo-list',
          icon: 'list',
          description: '반복 일정과 특정 날짜 할 일을 캘린더로 관리합니다.',
        },
        {
          label: '버킷리스트',
          path: '/bucket-list',
          icon: 'star',
          description: '장기 목표와 달성 기록을 한 곳에 모아봅니다.',
        },
      ],
    },
  ],
};

export const BLOG_HOME_CONTENT: SiteHomePageProps = {
  eyebrow: 'BLOG WORKSPACE',
  title: '블로그 작업 대시보드',
  description: '글감 수집, 구성 설계, 시각 자료 준비를 하나의 흐름으로 연결해 콘텐츠 작업을 빠르게 시작하세요.',
  accent: '#f59e0b',
  accentAlt: '#fb7185',
  icon: 'pen-nib',
  prefetchLinks: false,
  metrics: [
    { label: '시작 지점', value: '글감', caption: '북마크에서 소재를 모읍니다' },
    { label: '기획 도구', value: '2개', caption: '아이디어와 영상 인사이트를 정리합니다' },
    { label: '미디어 준비', value: '연결됨', caption: '사진첩과 AI 이미지 도구를 활용합니다' },
  ],
  primaryLinks: [
    {
      label: '글감 수집',
      path: '/bookmarks',
      icon: 'bookmark',
      description: '참고할 링크와 자료를 저장해 다음 글의 소재로 정리합니다.',
    },
    {
      label: '대표 이미지 준비',
      path: '/admin/image-generator',
      icon: 'wand-magic-sparkles',
      description: '콘텐츠 주제에 맞는 AI 이미지를 만들어 시각 자료를 준비합니다.',
    },
  ],
  sections: [
    {
      title: '콘텐츠 준비 흐름',
      description: '글을 쓰기 전에 필요한 자료와 메시지를 빠르게 정리할 수 있는 도구입니다.',
      links: [
        {
          label: '기본 메모',
          path: '/propig/memos',
          icon: 'file-lines',
          description: '제목 후보, 개요, 초안 메모를 가볍게 기록합니다.',
        },
        {
          label: 'YouTube 분석',
          path: '/youtube-analyze',
          icon: 'circle-play',
          description: '영상 콘텐츠에서 핵심 인사이트와 참고 소재를 추출합니다.',
        },
        {
          label: '사진첩',
          path: '/admin/photos',
          icon: 'images',
          description: '이미지 자산을 찾아 글의 시각 자료로 활용합니다.',
        },
      ],
    },
  ],
};

export const SHOP_HOME_CONTENT = PROPIG_HOME_CONTENT;
