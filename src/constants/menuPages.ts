export interface MenuPageOption {
  path: string;
  label: string;
  group: string;
  icon?: string;
  keywords?: string[];
}

export const MENU_PAGE_OPTIONS: MenuPageOption[] = [
  { path: '/bucket-list', label: '버킷리스트', group: '관리', icon: 'bullseye', keywords: ['bucket list', 'goals', 'wishlist'] },
  { path: '/admin', label: '관리 홈', group: '관리', icon: 'shield-halved', keywords: ['dashboard', 'home'] },
  { path: '/', label: '사이트 홈', group: '공통', icon: 'house', keywords: ['site home', 'main'] },
  { path: '/sticky-notes', label: '스티커 메모', group: '관리', icon: 'note-sticky', keywords: ['sticky notes', 'memo'] },
  { path: '/bookmarks', label: '스마트 북마크', group: '관리', icon: 'bookmark', keywords: ['bookmarks'] },
  { path: '/youtube-analyze', label: 'YouTube 분석', group: '관리', icon: 'circle-play', keywords: ['youtube', 'analyze'] },
  { path: '/mandalart', label: '만다라트', group: '관리', icon: 'diagram-project', keywords: ['mandalart'] },
  { path: '/habit-tracker', label: '습관 트래커', group: '관리', icon: 'calendar-check', keywords: ['habit', 'tracker', 'routine'] },
  { path: '/todo-list', label: '할일 일정표', group: '관리', icon: 'list', keywords: ['todo', 'tasks', 'planner', 'schedule'] },
  { path: '/habit-tracker/stats', label: '습관 통계', group: '관리', icon: 'chart-line', keywords: ['habit', 'stats', 'analytics'] },
  { path: '/habit-tracker/manual', label: '습관 설명서', group: '관리', icon: 'book-open', keywords: ['habit', 'manual', 'guide', 'help'] },
  { path: '/admin/image-generator', label: 'AI 이미지 생성기', group: '관리', icon: 'wand-magic-sparkles', keywords: ['ai image generator'] },
  { path: '/admin/gemini-settings', label: 'Gemini 설정 센터', group: '관리', icon: 'gear', keywords: ['gemini settings'] },
  { path: '/admin/photos', label: '사진첩', group: '관리', icon: 'images', keywords: ['photos', 'gallery'] },
  { path: '/admin/storage', label: 'Storage', group: '관리', icon: 'hard-drive', keywords: ['storage'] },
  { path: '/admin/users', label: '유저 관리', group: '관리', icon: 'users', keywords: ['users', 'permissions', 'access control'] },
  { path: '/admin/menu', label: '통합 메뉴 관리', group: '관리', icon: 'bars', keywords: ['menu admin'] },
  { path: '/corp/company/founding-background', label: '창립 배경', group: '기업', icon: 'building', keywords: ['company founding background'] },
  { path: '/corp/company/ceo-intro', label: '대표 소개', group: '기업', icon: 'user-tie', keywords: ['ceo intro'] },
  { path: '/corp/company/staff-intro', label: '구성원 소개', group: '기업', icon: 'users', keywords: ['staff intro'] },
  { path: '/corp/company/technology', label: '기술', group: '기업', icon: 'gear', keywords: ['technology'] },
  { path: '/corp/company/business-area', label: '사업 영역', group: '기업', icon: 'briefcase', keywords: ['business area'] },
  { path: '/corp/company/social-contribution', label: '사회 공헌', group: '기업', icon: 'handshake', keywords: ['social contribution'] },
  { path: '/corp/company/introduction', label: '회사소개', group: '기업', icon: 'building', keywords: ['company introduction'] },
  { path: '/corp/project', label: '프로젝트 개요', group: '프로젝트', icon: 'diagram-project', keywords: ['project overview'] },
  { path: '/corp/portfolio', label: '포트폴리오', group: '프로젝트', icon: 'briefcase', keywords: ['portfolio'] },
  { path: '/corp/partnership/business', label: '사업 제휴', group: '제휴', icon: 'handshake', keywords: ['business partnership'] },
  { path: '/corp/partnership/advertising', label: '광고 제휴', group: '제휴', icon: 'bullhorn', keywords: ['advertising partnership'] },
  { path: '/corp/partnership/investment', label: '투자 제휴', group: '제휴', icon: 'chart-line', keywords: ['investment partnership'] },
  { path: '/corp/partnership/sponsorship', label: '후원 제휴', group: '제휴', icon: 'heart', keywords: ['sponsorship partnership'] },
  { path: '/corp/careers/talent', label: '인재상', group: '채용', icon: 'user-graduate', keywords: ['talent'] },
  { path: '/corp/careers/jobs', label: '채용 공고', group: '채용', icon: 'briefcase', keywords: ['jobs'] },
  { path: '/corp/careers/apply', label: '입사 지원', group: '채용', icon: 'file', keywords: ['apply'] },
  { path: '/propig', label: '대시보드', group: '자기관리', icon: 'bullseye', keywords: ['propig', 'self management', 'dashboard'] },
  { path: '/propig/store', label: '상점', group: '자기관리', icon: 'store', keywords: ['propig', 'store', 'shop', 'apps', 'program'] },
  { path: '/propig/memos', label: '메모장', group: '자기관리', icon: 'file-lines', keywords: ['memo', 'note', 'basic memo', 'propig'] },
  { path: '/propig/calculator', label: '계산기', group: '자기관리', icon: 'calculator', keywords: ['calculator', 'calc', 'propig'] },
];

export function getMenuPageIcon(page: MenuPageOption | undefined): string {
  return page?.icon || 'link';
}
