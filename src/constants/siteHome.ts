import type { MenuItem, SiteDataType } from '@/types/menu';

export const DEFAULT_SITE_HOME_PATHS: Record<string, string> = {
  admin: '/admin',
  corp: '/corp',
  shop: '/propig',
};

export const DEFAULT_SITE_HOME_MENU_ITEMS: Record<string, MenuItem> = {
  admin: {
    id: 'admin-home',
    text: '관리 홈',
    path: DEFAULT_SITE_HOME_PATHS.admin,
    icon: 'house',
    type: 'link',
    roles: ['admin'],
    position: ['ceo', 'manager', 'staff'],
  },
  corp: {
    id: 'corp-home',
    text: '기업 홈',
    path: DEFAULT_SITE_HOME_PATHS.corp,
    icon: 'house',
    type: 'link',
    roles: [],
    position: ['ceo', 'manager', 'staff'],
  },
  shop: {
    id: 'shop-home',
    text: '대시보드',
    path: DEFAULT_SITE_HOME_PATHS.shop,
    icon: 'bullseye',
    type: 'link',
    roles: ['admin', 'user', 'partner', 'guest'],
    position: ['ceo', 'manager', 'staff'],
  },
};

function findFirstMenuPath(items: MenuItem[]): string | null {
  for (const item of items) {
    if (item.path) {
      return item.path;
    }

    if (Array.isArray(item.sub)) {
      const childPath = findFirstMenuPath(
        item.sub.filter((subItem): subItem is MenuItem => typeof subItem !== 'string'),
      );

      if (childPath) {
        return childPath;
      }
    }
  }

  return null;
}

export function getSiteHomePath(siteId: string, siteData?: SiteDataType): string {
  const defaultPath = DEFAULT_SITE_HOME_PATHS[siteId];
  if (defaultPath) {
    return defaultPath;
  }

  const firstMenuPath = siteData?.[siteId]?.menu ? findFirstMenuPath(siteData[siteId].menu) : null;
  return firstMenuPath ?? '/admin';
}
