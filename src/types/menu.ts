import type { ManagedUserMenuAccess, ManagedUserPermissionKey, ManagedUserPermissions } from '@/types/userAccess';

export interface MenuItem {
  id: string;
  text: string;
  path?: string;
  icon?: string;
  roles?: string[];
  permissions?: ManagedUserPermissionKey[];
  type?: 'folder' | 'link' | 'divider';
  sub?: (string | MenuItem)[];
  expanded?: boolean;
  position?: Position[];
  badge?: string | number;
  external?: boolean;
  hidden?: boolean;
  propigAppId?: string;
}

export interface SiteData {
  name: string;
  icon: string;
  color?: string;
  menu: MenuItem[];
  trash: MenuItem[];
  positions?: Position[];
}

export interface EditHistory {
  state: SiteDataType;
  timestamp: number;
}

export type Role = 'admin' | 'user' | 'partner' | 'guest';

export type Position = 'ceo' | 'manager' | 'staff' | 'intern';

export type SiteId = string;

export interface SiteDataType {
  [siteId: string]: SiteData;
}

export interface MenuServiceInterface {
  loadAllSites(): Promise<SiteDataType>;
  saveSite(siteId: string, data: SiteData): Promise<void>;
  validateMenu(menu: MenuItem[]): boolean;
  subscribeToMenuChanges(siteId: string, callback: (data: SiteData) => void): () => void;
}

export interface UserContext {
  role: Role;
  position: Position;
  siteId: SiteId;
}

export interface MenuContextType {
  currentSite: SiteId;
  setCurrentSite: (siteId: SiteId) => void;
  currentPosition: Position;
  setCurrentPosition: (position: Position) => void;
  userRole: Role;
  siteAccess: Record<string, boolean>;
  menuAccess: ManagedUserMenuAccess;
  permissions: ManagedUserPermissions;
  filteredMenu: MenuItem[];
  isLoading: boolean;
  siteData: SiteDataType;
  activePath: string;
}
