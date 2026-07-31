import { ACCOUNT_MENU_SITE_ID, getSwitchableSiteIds } from '@/constants/accountMenu';
import type { MenuItem, Position, Role, SiteDataType } from '@/types/menu';
import type { ManagedUserMenuAccess, ManagedUserPermissionKey, ManagedUserPermissions } from '@/types/userAccess';

const ADMIN_SITE_PERMISSION_KEYS: ManagedUserPermissionKey[] = [
  'menuManagement',
  'userManagement',
  'projectBoardManagement',
  'photoManagement',
  'storageManagement',
];

interface SiteAccessOptions {
  role: Role | string;
  siteAccess?: Record<string, boolean>;
  permissions?: Partial<ManagedUserPermissions>;
}

interface MenuAccessOptions extends SiteAccessOptions {
  siteId: string;
  position: Position;
  menuAccess?: ManagedUserMenuAccess;
}

export function getMenuAccessKey(siteId: string, item: Pick<MenuItem, 'id'>): string {
  return `${siteId}:${item.id}`;
}

export function hasAdminSiteAccess(options: SiteAccessOptions): boolean {
  if (options.role === 'admin') return true;
  if (options.siteAccess?.admin === true) return true;
  return ADMIN_SITE_PERMISSION_KEYS.some((permission) => options.permissions?.[permission] === true);
}

export function isSelectableSiteMode(siteId: string | null | undefined): siteId is string {
  return Boolean(siteId && siteId !== ACCOUNT_MENU_SITE_ID);
}

export function canAccessSiteMode(
  siteId: string | null | undefined,
  sites: SiteDataType,
  options: SiteAccessOptions,
): siteId is string {
  if (!isSelectableSiteMode(siteId)) return false;
  if (!sites[siteId]) return false;
  if (options.role === 'admin') return true;
  if (siteId === 'admin') return hasAdminSiteAccess(options);
  return options.siteAccess?.[siteId] !== false;
}

export function getFirstAccessibleSiteId(
  sites: SiteDataType,
  options: SiteAccessOptions,
  preferredSiteIds: Array<string | null | undefined> = [],
): string | null {
  const orderedSiteIds = [
    ...preferredSiteIds.filter(isSelectableSiteMode),
    ...getSwitchableSiteIds(sites),
  ];
  const seen = new Set<string>();

  for (const siteId of orderedSiteIds) {
    if (seen.has(siteId)) continue;
    seen.add(siteId);
    if (canAccessSiteMode(siteId, sites, options)) return siteId;
  }

  return null;
}

export function filterMenuItemsForAccess(items: MenuItem[], options: MenuAccessOptions): MenuItem[] {
  const hasItemAccess = (item: MenuItem): boolean => {
    if (item.hidden) return false;
    if (item.type === 'divider') return true;
    if (options.role === 'admin') return true;

    const requiredPermissions = item.permissions || [];
    if (requiredPermissions.length > 0) {
      return requiredPermissions.some((permission) => options.permissions?.[permission] === true);
    }

    const explicitMenuAccess = options.menuAccess?.[getMenuAccessKey(options.siteId, item)];
    if (explicitMenuAccess === false) return false;
    if (explicitMenuAccess === true) return true;

    const hasRoleAccess =
      !item.roles ||
      item.roles.length === 0 ||
      item.roles.includes(options.role);
    if (!hasRoleAccess) return false;

    const hasPositionAccess =
      !item.position ||
      item.position.length === 0 ||
      item.position.includes(options.position);
    return hasPositionAccess;
  };

  return items.reduce<MenuItem[]>((acc, item) => {
    if (item.hidden) return acc;

    const filteredSub = item.sub && Array.isArray(item.sub)
      ? item.sub
          .map((subItem) => {
            if (typeof subItem === 'string') return subItem;
            return filterMenuItemsForAccess([subItem], options)[0];
          })
          .filter(Boolean)
      : undefined;
    const hasVisibleChildren = Boolean(filteredSub?.some((subItem) => typeof subItem !== 'string'));
    const canShowItem = hasItemAccess(item) || hasVisibleChildren;

    if (!canShowItem) return acc;

    acc.push(filteredSub ? { ...item, sub: filteredSub } : item);
    return acc;
  }, []);
}
