import type { MenuItem, SiteDataType } from '@/types/menu';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';

export const DEFAULT_SITE_HOME_PATHS: Record<string, string> = {
  admin: '/admin',
  blog: '/blog',
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
  blog: {
    id: 'blog-home',
    text: '블로그 대시보드',
    path: DEFAULT_SITE_HOME_PATHS.blog,
    icon: 'pen-nib',
    type: 'link',
    roles: ['admin', 'user', 'partner', 'guest'],
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

function isInternalPath(path: string | undefined): path is string {
  return Boolean(path?.startsWith('/') && !path.startsWith('//') && !/[\\\s]/.test(path));
}

function findFirstMenuPath(items: MenuItem[]): string | null {
  for (const item of items) {
    if (item.hidden || item.external || item.type === 'divider') continue;
    if (isInternalPath(item.path)) {
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

const SHARED_APP_PATHS = ['/habit-tracker', '/todo-list', '/bucket-list', '/bookmarks', '/sticky-notes'];

function matchesPath(pathname: string, root: string): boolean {
  return pathname === root || (root !== '/' && pathname.startsWith(`${root}/`));
}

function menuMatchLength(items: MenuItem[], pathname: string): number {
  let length = 0;
  for (const item of items) {
    if (item.hidden || item.external || item.type === 'divider') continue;
    if (isInternalPath(item.path) && matchesPath(pathname, item.path)) length = Math.max(length, item.path.length);
    if (item.sub) length = Math.max(length, menuMatchLength(item.sub.filter((child): child is MenuItem => typeof child !== 'string'), pathname));
  }
  return length;
}

export function getRouteSite(pathname: string | null, sites: SiteDataType = {}, preferredSite?: string | null): string | null {
  if (!pathname) return null;
  for (const [siteId, home] of Object.entries(DEFAULT_SITE_HOME_PATHS)) {
    if (matchesPath(pathname, home)) return siteId;
  }
  if (matchesPath(pathname, '/shop')) return 'shop';

  const matches = getSwitchableSiteEntries(sites)
    .map(([id, site]) => ({ id, length: menuMatchLength(site.menu, pathname) }))
    .filter(({ length }) => length > 0)
    .sort((a, b) => b.length - a.length);
  // Shared tools keep the site they were opened from when that site owns the menu.
  if (matches.some(({ id }) => id === preferredSite)) return preferredSite ?? null;
  if (SHARED_APP_PATHS.some((root) => matchesPath(pathname, root))) return 'shop';
  return matches[0]?.id ?? null;
}

export function getSiteHomePath(siteId: string, siteData?: SiteDataType): string {
  const defaultPath = DEFAULT_SITE_HOME_PATHS[siteId];
  if (defaultPath) {
    return defaultPath;
  }

  const firstMenuPath = siteData?.[siteId]?.menu ? findFirstMenuPath(siteData[siteId].menu) : null;
  return firstMenuPath ?? '/';
}
