import type { MenuItem } from '@/types/menu';

export type PropigStoreAppId = 'memos' | 'habit' | 'bucket' | 'todo' | 'calculator' | 'finance';
export type PropigStoreAppStatus = 'available' | 'planned';
export type PropigWidgetId = 'memo' | 'habit' | 'bucket' | 'todo';

export interface PropigStoreApp {
  id: PropigStoreAppId;
  title: string;
  shortTitle: string;
  summary: string;
  description: string;
  path?: string;
  menuItemId?: string;
  icon: string;
  color: string;
  badge: string;
  status: PropigStoreAppStatus;
  widgetId?: PropigWidgetId;
}

export const PROPIG_STORE_APPS: PropigStoreApp[] = [
  {
    id: 'memos',
    title: '메모장',
    shortTitle: '메모',
    summary: '생각, 링크, 아이디어를 빠르게 기록합니다.',
    description: '개인 메모를 색상과 태그로 정리하고 대시보드에서 바로 작성합니다.',
    path: '/propig/memos',
    menuItemId: 'shop-memos',
    icon: 'file-lines',
    color: '#2dd4bf',
    badge: 'MEMO',
    status: 'available',
    widgetId: 'memo',
  },
  {
    id: 'habit',
    title: '습관 트래커',
    shortTitle: '습관',
    summary: '매일 반복하는 루틴과 기록 지표를 관리합니다.',
    description: '체크, 숫자, 운동, 평가형 습관을 날짜별로 기록하고 통계를 확인합니다.',
    path: '/habit-tracker',
    menuItemId: 'shop-habit-tracker',
    icon: 'calendar-check',
    color: '#42d392',
    badge: 'HABIT',
    status: 'available',
    widgetId: 'habit',
  },
  {
    id: 'bucket',
    title: '버킷리스트',
    shortTitle: '버킷',
    summary: '언젠가 할 목표를 날짜와 상태로 추적합니다.',
    description: '장기 목표, 진행 상태, 목표일을 한곳에서 관리합니다.',
    path: '/bucket-list',
    menuItemId: 'shop-bucket-list',
    icon: 'bullseye',
    color: '#f59e0b',
    badge: 'GOAL',
    status: 'available',
    widgetId: 'bucket',
  },
  {
    id: 'todo',
    title: '할일 일정표',
    shortTitle: '할일',
    summary: '오늘 할일과 반복 일정을 정리합니다.',
    description: '하루 일정, 반복 일정, 상시 할일을 대시보드에서 바로 처리합니다.',
    path: '/todo-list',
    menuItemId: 'shop-todo-list',
    icon: 'list-check',
    color: '#60a5fa',
    badge: 'PLAN',
    status: 'available',
    widgetId: 'todo',
  },
  {
    id: 'calculator',
    title: '계산기',
    shortTitle: '계산',
    summary: '마지막 계산값을 보관하고 필요한 계산식을 저장합니다.',
    description: '사칙연산 결과를 즉시 계산하고, 자주 쓰는 계산값은 저장 목록에 추가해 복사하거나 삭제할 수 있습니다.',
    path: '/propig/calculator',
    menuItemId: 'shop-calculator',
    icon: 'calculator',
    color: '#f472b6',
    badge: 'CALC',
    status: 'available',
  },
  {
    id: 'finance',
    title: '머니 플래너',
    shortTitle: '머니',
    summary: '개인 예산과 지출 루틴을 다루는 예정 앱입니다.',
    description: '출시되면 상점에서 등록한 사람에게만 좌측 메뉴와 위젯이 표시됩니다.',
    icon: 'wallet',
    color: '#a3e635',
    badge: 'SOON',
    status: 'planned',
  },
];

export const PROPIG_AVAILABLE_STORE_APPS = PROPIG_STORE_APPS.filter((app) => app.status === 'available');
export const PROPIG_AVAILABLE_STORE_APP_IDS = PROPIG_AVAILABLE_STORE_APPS.map((app) => app.id);
export const DEFAULT_PROPIG_INSTALLED_APP_IDS: PropigStoreAppId[] = ['memos'];
export const PROPIG_WIDGET_IDS: PropigWidgetId[] = ['memo', 'habit', 'bucket', 'todo'];

export const PROPIG_STORE_PAGE_MENU_ITEM: MenuItem = {
  id: 'shop-store',
  text: '상점',
  path: '/propig/store',
  icon: 'store',
  type: 'link',
  roles: ['admin', 'user', 'partner', 'guest'],
  position: ['ceo', 'manager', 'staff'],
  badge: 'STORE',
};

export const PROPIG_STORE_MENU_ITEMS: MenuItem[] = PROPIG_AVAILABLE_STORE_APPS.map((app) => ({
  id: app.menuItemId ?? `shop-${app.id}`,
  text: app.title,
  path: app.path,
  icon: app.icon,
  type: 'link',
  roles: ['admin', 'user', 'partner', 'guest'],
  position: ['ceo', 'manager', 'staff'],
  badge: app.badge,
  propigAppId: app.id,
}));

export function isPropigStoreAppId(value: unknown): value is PropigStoreAppId {
  return typeof value === 'string' && PROPIG_STORE_APPS.some((app) => app.id === value);
}

export function isAvailablePropigStoreAppId(value: unknown): value is PropigStoreAppId {
  return typeof value === 'string' && PROPIG_AVAILABLE_STORE_APP_IDS.includes(value as PropigStoreAppId);
}

export function getPropigStoreAppById(appId: PropigStoreAppId): PropigStoreApp | undefined {
  return PROPIG_STORE_APPS.find((app) => app.id === appId);
}

export function getPropigStoreAppForWidget(widgetId: PropigWidgetId): PropigStoreApp | undefined {
  return PROPIG_AVAILABLE_STORE_APPS.find((app) => app.widgetId === widgetId);
}

export function getPropigStoreAppIdForMenuItem(item: Pick<MenuItem, 'id' | 'path' | 'propigAppId'>): PropigStoreAppId | null {
  if (isAvailablePropigStoreAppId(item.propigAppId)) {
    return item.propigAppId;
  }

  return (
    PROPIG_AVAILABLE_STORE_APPS.find(
      (app) => app.menuItemId === item.id || Boolean(app.path && app.path === item.path),
    )?.id ?? null
  );
}
