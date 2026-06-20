import type { SiteData, SiteDataType } from '@/types/menu';

export const ACCOUNT_MENU_SITE_ID = 'account-menu';

export function createDefaultAccountMenuSite(): SiteData {
  return {
    name: '우측 메뉴',
    icon: 'user-gear',
    color: '#8b5cf6',
    positions: ['ceo', 'manager', 'staff'],
    menu: [],
    trash: [],
  };
}

export function isAccountMenuSite(siteId: string): boolean {
  return siteId === ACCOUNT_MENU_SITE_ID;
}

export function getSwitchableSiteEntries(sites: SiteDataType): Array<[string, SiteData]> {
  return Object.entries(sites).filter(([siteId]) => !isAccountMenuSite(siteId));
}

export function getSwitchableSiteIds(sites: SiteDataType): string[] {
  return Object.keys(sites).filter((siteId) => !isAccountMenuSite(siteId));
}
