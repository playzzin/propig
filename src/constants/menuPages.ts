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
  { path: '/blog', label: '블로그 대시보드', group: '블로그', icon: 'pen-nib', keywords: ['blog', 'dashboard', 'content'] },
  { path: '/', label: '사이트 홈', group: '공통', icon: 'house', keywords: ['site home', 'main'] },
  { path: '/sticky-notes', label: '스티커 메모', group: '관리', icon: 'note-sticky', keywords: ['sticky notes', 'memo'] },
  { path: '/bookmarks', label: '스마트 북마크', group: '관리', icon: 'bookmark', keywords: ['bookmarks'] },
  { path: '/youtube-analyze', label: 'YouTube 분석', group: '관리', icon: 'circle-play', keywords: ['youtube', 'analyze'] },
  { path: '/habit-tracker', label: '습관 트래커', group: '관리', icon: 'calendar-check', keywords: ['habit', 'tracker', 'routine'] },
  { path: '/todo-list', label: '할일 일정표', group: '관리', icon: 'list', keywords: ['todo', 'tasks', 'planner', 'schedule'] },
  { path: '/habit-tracker/stats', label: '습관 통계', group: '관리', icon: 'chart-line', keywords: ['habit', 'stats', 'analytics'] },
  { path: '/habit-tracker/manual', label: '습관 설명서', group: '관리', icon: 'book-open', keywords: ['habit', 'manual', 'guide', 'help'] },
  { path: '/admin/image-generator', label: 'AI 이미지 생성기', group: '관리', icon: 'wand-magic-sparkles', keywords: ['ai image generator'] },
  { path: '/admin/storyboard', label: '스토리보드 영상 제작', group: '관리', icon: 'clapperboard', keywords: ['storyboard', 'video production', 'ai video', '영상 제작'] },
  { path: '/admin/emoticon-studio', label: 'AI 이모티콘 스튜디오', group: '관리', icon: 'face-smile', keywords: ['ai emoticon', 'animated sticker', 'webp', 'gif'] },
  { path: '/admin/openrouter-settings', label: 'OpenRouter 운영 센터', group: '관리', icon: 'gear', keywords: ['ai settings', 'openrouter settings', 'model fallback'] },
  { path: '/admin/openrouter-usage', label: 'OpenRouter 사용량', group: '관리', icon: 'chart-line', keywords: ['openrouter usage', 'ai cost', 'token usage', 'billing'] },
  { path: '/admin/photos', label: '사진첩', group: '관리', icon: 'images', keywords: ['photos', 'gallery'] },
  { path: '/admin/storage', label: 'Storage', group: '관리', icon: 'hard-drive', keywords: ['storage'] },
  { path: '/admin/users', label: '유저 관리', group: '관리', icon: 'users', keywords: ['users', 'permissions', 'access control'] },
  { path: '/admin/activity-logs', label: '작업 히스토리', group: '관리', icon: 'clock-rotate-left', keywords: ['activity', 'logs', 'audit', 'history'] },
  { path: '/admin/menu', label: '통합 메뉴 관리', group: '관리', icon: 'bars', keywords: ['menu admin'] },
  { path: '/corp/company/introduction', label: '회사소개', group: '기업', icon: 'building', keywords: ['company introduction'] },
  { path: '/corp/company/ceo-intro', label: '대표소개', group: '기업', icon: 'user-tie', keywords: ['ceo intro', 'greeting', 'leader'] },
  { path: '/corp/company/staff-intro', label: '직원소개', group: '기업', icon: 'users', keywords: ['staff intro', 'organization', 'people'] },
  { path: '/corp/company/product-introduction', label: '제품소개', group: '기업', icon: 'briefcase', keywords: ['product introduction', 'products', 'business area'] },
  { path: '/corp/project', label: '프로젝트 개요', group: '프로젝트', icon: 'diagram-project', keywords: ['project overview'] },
  { path: '/corp/portfolio', label: '포트폴리오', group: '프로젝트', icon: 'briefcase', keywords: ['portfolio'] },
  { path: '/corp/partnership/business', label: '사업 제휴', group: '제휴', icon: 'handshake', keywords: ['business partnership'] },
  { path: '/corp/partnership/advertising', label: '광고 제휴', group: '제휴', icon: 'bullhorn', keywords: ['advertising partnership'] },
  { path: '/corp/partnership/investment', label: '투자 제휴', group: '제휴', icon: 'chart-line', keywords: ['investment partnership'] },
  { path: '/corp/partnership/sponsorship', label: '후원 제휴', group: '제휴', icon: 'heart', keywords: ['sponsorship partnership'] },
  { path: '/corp/careers/jobs', label: '채용정보', group: '채용', icon: 'briefcase', keywords: ['jobs', 'careers', '인재풀'] },
  { path: '/corp/careers/apply', label: '지원하기', group: '채용', icon: 'paper-plane', keywords: ['apply', 'application', '지원', '인재풀'] },
  { path: '/propig', label: '대시보드', group: '자기관리', icon: 'bullseye', keywords: ['propig', 'self management', 'dashboard'] },
  { path: '/propig/store', label: '상점', group: '자기관리', icon: 'store', keywords: ['propig', 'store', 'shop', 'apps', 'program'] },
  { path: '/propig/memos', label: '메모장', group: '자기관리', icon: 'file-lines', keywords: ['memo', 'note', 'basic memo', 'propig'] },
  { path: '/propig/calculator', label: '계산기', group: '자기관리', icon: 'calculator', keywords: ['calculator', 'calc', 'propig'] },
];

export function getMenuPageIcon(page: MenuPageOption | undefined): string {
  return page?.icon || 'link';
}
