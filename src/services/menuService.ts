import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { SiteDataType, SiteData, MenuItem, MenuServiceInterface } from '@/types/menu';
import { validateAllSites, validateSiteData } from '@/schemas/menuSchema';
import { ACCOUNT_MENU_SITE_ID, createDefaultAccountMenuSite } from '@/constants/accountMenu';
import { DEFAULT_SITE_HOME_MENU_ITEMS } from '@/constants/siteHome';
import { PROPIG_STORE_MENU_ITEMS, PROPIG_STORE_PAGE_MENU_ITEM } from '@/constants/propigStore';
import { auth, db } from '@/firebase/config';

class MenuService implements MenuServiceInterface {
  private readonly STORAGE_KEY = 'advanced_menu_manager_data';
  private readonly STORAGE_VERSION_KEY = 'advanced_menu_manager_data_version';
  private readonly REMOTE_COLLECTION = 'menuSettings';
  private readonly REMOTE_DOC_ID = 'sites';
  private readonly CURRENT_DATA_VERSION = 29;
  private readonly DEPRECATED_CORP_COMPANY_MENU_PATHS = new Set([
    '/corp/company/vision',
    '/corp/company/company-values',
    '/corp/company/history',
  ]);
  private readonly DEPRECATED_CORP_COMPANY_MENU_ITEM_IDS = new Set([
    'corp-company-intro-5',
    'corp-company-intro-8',
    'corp-company-intro-9',
  ]);
  private readonly DEPRECATED_PROPIG_PAGE_PATHS = new Set([
    '/propig/tasks',
    '/propig/routines',
    '/propig/reflection',
    '/shop/orders',
    '/shop/delivery',
    '/shop/returns',
  ]);
  private readonly DEPRECATED_PROPIG_MENU_ITEM_IDS = new Set(['shop-1-1', 'shop-1-2', 'shop-1-3']);
  private subscribers: Map<string, Set<(data: SiteData) => void>> = new Map();

  async loadAllSites(): Promise<SiteDataType> {
    try {
      const remote = await this.loadRemoteSites();
      if (remote) {
        this.persistLocal(remote.data);
        if (remote.changed) {
          void this.saveRemoteSites(remote.data);
        }
        return remote.data;
      }

      const stored = this.readLocalStorage(this.STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored);
        if (validateAllSites(parsed)) {
          const normalized = this.normalizeMenuData(parsed);
          const { data: migratedData, changed } = this.migrateData(normalized);
          if (changed) {
            this.persistLocal(migratedData);
          }
          void this.saveRemoteSites(migratedData);
          return migratedData;
        }
      }

      const defaults = this.getDefaultData();
      const { data: migratedDefaults, changed } = this.migrateData(defaults);
      if (changed) {
        this.persistLocal(migratedDefaults);
      }
      void this.saveRemoteSites(migratedDefaults);
      return migratedDefaults;
    } catch (error) {
      console.error('Failed to load sites:', error);
      return this.getDefaultData();
    }
  }

  async saveSite(siteId: string, data: SiteData): Promise<void> {
    try {
      if (!validateSiteData(data)) {
        throw new Error('Invalid site data');
      }

      const allSites = await this.loadAllSites();
      allSites[siteId] = data;

      this.persistLocal(allSites);
      await this.saveRemoteSites(allSites);

      this.notifySubscribers(siteId, data);
    } catch (error) {
      console.error('Failed to save site:', error);
      throw error;
    }
  }

  subscribeToMenuChanges(siteId: string, callback: (data: SiteData) => void): () => void {
    if (!this.subscribers.has(siteId)) {
      this.subscribers.set(siteId, new Set());
    }

    this.subscribers.get(siteId)!.add(callback);

    let disposed = false;
    this.loadAllSites().then((allSites) => {
      if (disposed) return;
      if (allSites[siteId]) {
        callback(allSites[siteId]);
      }
    });

    const unsubscribeRemote = onSnapshot(
      this.getRemoteDocRef(),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const remote = this.parseRemoteSnapshot(snapshot.data());
        if (!remote) return;
        this.persistLocal(remote.data);
        this.notifyAllSubscribers(remote.data);
      },
      (error) => {
        console.warn('Failed to subscribe to remote menu data:', error);
      },
    );

    return () => {
      disposed = true;
      unsubscribeRemote();
      const subs = this.subscribers.get(siteId);
      if (subs) {
        subs.delete(callback);
      }
    };
  }

  private readLocalStorage(key: string): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  }

  private persistLocal(data: SiteDataType): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    window.localStorage.setItem(this.STORAGE_VERSION_KEY, String(this.CURRENT_DATA_VERSION));
  }

  private getSavedLocalVersion(): number {
    return Number(this.readLocalStorage(this.STORAGE_VERSION_KEY) || '1');
  }

  private getRemoteDocRef() {
    return doc(db, this.REMOTE_COLLECTION, this.REMOTE_DOC_ID);
  }

  private serializeSites(data: SiteDataType): SiteDataType {
    return JSON.parse(JSON.stringify(data)) as SiteDataType;
  }

  private parseRemoteSnapshot(value: unknown): { data: SiteDataType; changed: boolean } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const payload = value as { sites?: unknown; version?: unknown };
    if (!validateAllSites(payload.sites)) return null;

    const normalized = this.normalizeMenuData(payload.sites as SiteDataType);
    return this.migrateData(normalized, Number(payload.version || '1'));
  }

  private async loadRemoteSites(): Promise<{ data: SiteDataType; changed: boolean } | null> {
    try {
      const snapshot = await getDoc(this.getRemoteDocRef());
      if (!snapshot.exists()) return null;
      return this.parseRemoteSnapshot(snapshot.data());
    } catch (error) {
      console.warn('Failed to load remote menu data:', error);
      return null;
    }
  }

  private async saveRemoteSites(data: SiteDataType): Promise<void> {
    let clientWriteSucceeded = false;
    try {
      await setDoc(
        this.getRemoteDocRef(),
        {
          version: this.CURRENT_DATA_VERSION,
          sites: this.serializeSites(data),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      clientWriteSucceeded = true;
    } catch (error) {
      console.warn('Failed to save remote menu data:', error);
    }

    if (clientWriteSucceeded) return;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/admin/menu-sites', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sites: this.serializeSites(data),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        console.warn('Failed to save remote menu data through API:', payload.error || response.statusText);
      }
    } catch (error) {
      console.warn('Failed to save remote menu data through API:', error);
    }
  }

  private notifySubscribers(siteId: string, data: SiteData): void {
    const subs = this.subscribers.get(siteId);
    if (subs) {
      subs.forEach((callback) => callback(data));
    }
  }

  private notifyAllSubscribers(allSites: SiteDataType): void {
    for (const [siteId, callbacks] of this.subscribers.entries()) {
      const siteData = allSites[siteId];
      if (!siteData) continue;
      callbacks.forEach((callback) => callback(siteData));
    }
  }

  private normalizeMenuData(data: SiteDataType): SiteDataType {
    const normalized: SiteDataType = {};

    for (const [siteId, siteData] of Object.entries(data)) {
      normalized[siteId] = {
        ...siteData,
        menu: this.normalizeMenuItems(siteData.menu),
      };
    }

    return normalized;
  }

  private normalizeMenuItems(items: MenuItem[]): MenuItem[] {
    return items.map((item) => {
      const normalized: MenuItem = { ...item };

      if (item.sub && Array.isArray(item.sub)) {
        normalized.sub = item.sub.map((subItem) => {
          if (typeof subItem === 'string') {
            return subItem;
          }
          return this.normalizeMenuItems([subItem])[0];
        });
      }

      return normalized;
    });
  }

  private migrateData(data: SiteDataType, sourceVersion = this.getSavedLocalVersion()): { data: SiteDataType; changed: boolean } {
    const savedVersion = sourceVersion;
    const accountMenuMigration = this.ensureAccountMenuSite(data);
    let nextData = accountMenuMigration.data;
    let changed = accountMenuMigration.changed;

    if (!Number.isFinite(savedVersion) || savedVersion < this.CURRENT_DATA_VERSION) {
      const migrationResult = this.applyCorpBusinessTemplate(nextData);
      nextData = migrationResult.data;
      changed = changed || migrationResult.changed;

      const adminMigration = this.applyAdminGeminiMenu(nextData);
      nextData = adminMigration.data;
      changed = changed || adminMigration.changed;

      const photosMigration = this.applyAdminPhotosMenu(nextData);
      nextData = photosMigration.data;
      changed = changed || photosMigration.changed;

      const storageMigration = this.applyAdminStorageMenu(nextData);
      nextData = storageMigration.data;
      changed = changed || storageMigration.changed;

      const usersMigration = this.applyAdminUsersMenu(nextData);
      nextData = usersMigration.data;
      changed = changed || usersMigration.changed;

      const permissionMenuMigration = this.applyAdminPermissionMenuAccess(nextData);
      nextData = permissionMenuMigration.data;
      changed = changed || permissionMenuMigration.changed;

      const projectBoardCleanup = this.cleanupAdminProjectBoardMenu(nextData);
      nextData = projectBoardCleanup.data;
      changed = changed || projectBoardCleanup.changed;

      const habitTrackerMigration = this.applyAdminHabitTrackerMenu(nextData);
      nextData = habitTrackerMigration.data;
      changed = changed || habitTrackerMigration.changed;

      const bucketListMigration = this.applyAdminBucketListMenu(nextData);
      nextData = bucketListMigration.data;
      changed = changed || bucketListMigration.changed;

      const todoListMigration = this.applyAdminTodoListMenu(nextData);
      nextData = todoListMigration.data;
      changed = changed || todoListMigration.changed;

      // Video Studio 제거 마이그레이션
      const cleanupMigration = this.cleanupVideoStudioMenu(nextData);
      nextData = cleanupMigration.data;
      changed = changed || cleanupMigration.changed;

      const taxMenuMigration = this.cleanupAdminTaxFolderMenu(nextData);
      nextData = taxMenuMigration.data;
      changed = changed || taxMenuMigration.changed;

      const homeMigration = this.applySiteHomePages(nextData);
      nextData = homeMigration.data;
      changed = changed || homeMigration.changed;

      const propigMigration = this.applyPropigSelfManagementMenu(nextData);
      nextData = propigMigration.data;
      changed = changed || propigMigration.changed;

      const propigMemoMigration = this.applyPropigMemoMenu(nextData);
      nextData = propigMemoMigration.data;
      changed = changed || propigMemoMigration.changed;

      const deprecatedPropigPageMigration = this.cleanupDeprecatedPropigPageMenus(nextData);
      nextData = deprecatedPropigPageMigration.data;
      changed = changed || deprecatedPropigPageMigration.changed;

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(this.STORAGE_VERSION_KEY, String(this.CURRENT_DATA_VERSION));
      }
      if (savedVersion !== this.CURRENT_DATA_VERSION) {
        changed = true;
      }
    }

    const propigMenuNormalization = this.applyPropigSelfManagementMenu(nextData);
    nextData = propigMenuNormalization.data;
    changed = changed || propigMenuNormalization.changed;

    const propigStoreMenuSync = this.applyPropigMemoMenu(nextData);
    nextData = propigStoreMenuSync.data;
    changed = changed || propigStoreMenuSync.changed;

    const deprecatedPropigPageSync = this.cleanupDeprecatedPropigPageMenus(nextData);
    nextData = deprecatedPropigPageSync.data;
    changed = changed || deprecatedPropigPageSync.changed;

    const pageMakerCleanup = this.cleanupAdminPageMakerMenu(nextData);
    nextData = pageMakerCleanup.data;
    changed = changed || pageMakerCleanup.changed;

    return { data: nextData, changed };
  }

  private ensureAccountMenuSite(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    if (data[ACCOUNT_MENU_SITE_ID]) {
      return { data, changed: false };
    }

    return {
      data: {
        ...data,
        [ACCOUNT_MENU_SITE_ID]: createDefaultAccountMenuSite(),
      },
      changed: true,
    };
  }

  private applySiteHomePages(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    let nextData = data;
    let changed = false;

    for (const [siteId, homeItem] of Object.entries(DEFAULT_SITE_HOME_MENU_ITEMS)) {
      const site = nextData[siteId];
      if (!site) continue;

      const existingIndex = site.menu.findIndex(
        (item) =>
          item.id === homeItem.id ||
          item.path === homeItem.path ||
          (siteId === 'admin' && item.id === 'admin-1'),
      );
      const existingItem = existingIndex >= 0 ? site.menu[existingIndex] : undefined;
      const nextHomeItem: MenuItem = {
        ...existingItem,
        ...homeItem,
        roles: existingItem?.roles ?? homeItem.roles,
        position: existingItem?.position ?? homeItem.position,
      };
      const nextMenu = site.menu.filter(
        (item, index) => index !== existingIndex && item.id !== homeItem.id && item.path !== homeItem.path,
      );

      const currentFirst = site.menu[0];
      const isAlreadyFirst =
        currentFirst &&
        currentFirst.id === nextHomeItem.id &&
        currentFirst.path === nextHomeItem.path &&
        currentFirst.text === nextHomeItem.text &&
        currentFirst.icon === nextHomeItem.icon;

      if (isAlreadyFirst && nextMenu.length === site.menu.length - 1) {
        continue;
      }

      nextData = {
        ...nextData,
        [siteId]: {
          ...site,
          menu: [nextHomeItem, ...nextMenu],
        },
      };
      changed = true;
    }

    return { data: nextData, changed };
  }

  private applyPropigSelfManagementMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const shopSite = data.shop;
    if (!shopSite) {
      return { data, changed: false };
    }

    const pathMap: Record<string, string> = {
      '/shop': '/propig',
    };
    const homeItem = DEFAULT_SITE_HOME_MENU_ITEMS.shop;
    const homeRoles = Array.from(new Set([...(homeItem.roles ?? []), 'guest']));

    const normalizePropigItems = (items: MenuItem[]): MenuItem[] =>
      items.map((item) => {
        if (item.id === homeItem.id || item.path === '/shop' || item.path === homeItem.path) {
          return {
            ...item,
            ...homeItem,
            roles: Array.from(new Set([...(item.roles ?? []), ...homeRoles])),
            position: item.position ?? homeItem.position,
          };
        }

        const nextItem: MenuItem = {
          ...item,
          path: item.path ? pathMap[item.path] ?? item.path : item.path,
        };

        if (item.sub) {
          nextItem.sub = item.sub.map((subItem) =>
            typeof subItem === 'string' ? subItem : normalizePropigItems([subItem])[0],
          );
        }

        return nextItem;
      });

    const normalizedMenu = normalizePropigItems(shopSite.menu);
    const cleanedMenu = this.removeDeprecatedPropigPageMenuItems(normalizedMenu);
    const hasHome = cleanedMenu.items.some((item) => item.id === homeItem.id);
    const nextMenu = [
      ...(hasHome ? [] : [{ ...homeItem, roles: homeRoles }]),
      ...cleanedMenu.items,
    ];
    const nextSite: SiteData = {
      ...shopSite,
      name: 'propig',
      icon: 'bullseye',
      color: '#22c55e',
      positions: ['ceo', 'manager', 'staff'],
      menu: nextMenu,
    };
    const changed = cleanedMenu.changed || JSON.stringify(nextSite) !== JSON.stringify(shopSite);

    return changed
      ? {
          data: {
            ...data,
            shop: nextSite,
          },
          changed: true,
        }
      : { data, changed: false };
  }

  private createPropigMemoMenuItem(): MenuItem {
    return { ...PROPIG_STORE_MENU_ITEMS[0] };
  }

  private getPropigFixedMenuItems(): MenuItem[] {
    return [PROPIG_STORE_PAGE_MENU_ITEM, ...PROPIG_STORE_MENU_ITEMS];
  }

  private applyPropigMemoMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const shopSite = data.shop;
    if (!shopSite) {
      return { data, changed: false };
    }

    const fixedPropigItems = this.getPropigFixedMenuItems();
    const nextStoreMenuItems = fixedPropigItems.map((storeItem) => {
      const existingItem = shopSite.menu.find(
        (item) =>
          item.id === storeItem.id ||
          item.path === storeItem.path ||
          (storeItem.propigAppId && item.propigAppId === storeItem.propigAppId),
      );

      return {
        ...storeItem,
        text: existingItem?.text?.trim() ? existingItem.text : storeItem.text,
        icon: existingItem?.icon ?? storeItem.icon,
        badge: existingItem?.badge ?? storeItem.badge,
        hidden: existingItem?.hidden ?? storeItem.hidden,
        external: existingItem?.external ?? storeItem.external,
        roles: Array.from(new Set([...(storeItem.roles ?? []), ...(existingItem?.roles ?? []), 'guest'])),
        position: existingItem?.position ?? storeItem.position,
      } satisfies MenuItem;
    });

    const nextMenu = shopSite.menu.filter(
      (item) =>
        !fixedPropigItems.some(
          (storeItem) =>
            item.id === storeItem.id ||
            item.path === storeItem.path ||
            (storeItem.propigAppId && item.propigAppId === storeItem.propigAppId),
        ),
    );
    const homeIndex = nextMenu.findIndex((item) => item.id === DEFAULT_SITE_HOME_MENU_ITEMS.shop.id || item.path === '/propig');
    const insertIndex = homeIndex >= 0 ? homeIndex + 1 : 0;
    nextMenu.splice(insertIndex, 0, ...nextStoreMenuItems);

    const nextSite: SiteData = {
      ...shopSite,
      menu: nextMenu,
    };

    return JSON.stringify(nextSite) !== JSON.stringify(shopSite)
      ? {
          data: {
            ...data,
            shop: nextSite,
          },
          changed: true,
        }
      : { data, changed: false };
  }

  private cleanupDeprecatedPropigPageMenus(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    let nextData = data;
    let changed = false;

    for (const [siteId, site] of Object.entries(data)) {
      const menuCleanup = this.removeDeprecatedPropigPageMenuItems(site.menu);
      const trashCleanup = this.removeDeprecatedPropigPageMenuItems(site.trash);

      if (!menuCleanup.changed && !trashCleanup.changed) {
        continue;
      }

      nextData = {
        ...nextData,
        [siteId]: {
          ...site,
          menu: menuCleanup.items,
          trash: trashCleanup.items,
        },
      };
      changed = true;
    }

    return { data: nextData, changed };
  }

  private removeDeprecatedPropigPageMenuItems(items: MenuItem[]): { items: MenuItem[]; changed: boolean } {
    let changed = false;
    const nextItems: MenuItem[] = [];

    for (const item of items) {
      if (this.isDeprecatedPropigPageMenuItem(item)) {
        changed = true;
        continue;
      }

      let nextItem = item;
      if (item.sub && Array.isArray(item.sub)) {
        const nextSub: (string | MenuItem)[] = [];

        for (const subItem of item.sub) {
          if (typeof subItem === 'string') {
            nextSub.push(subItem);
            continue;
          }

          const cleanupResult = this.removeDeprecatedPropigPageMenuItems([subItem]);
          changed = changed || cleanupResult.changed;
          nextSub.push(...cleanupResult.items);
        }

        nextItem = {
          ...item,
          sub: nextSub,
        };

        if (nextSub.length !== item.sub.length) {
          changed = true;
        }
      }

      if (nextItem.id === 'shop-1' && (!nextItem.sub || nextItem.sub.length === 0)) {
        changed = true;
        continue;
      }

      nextItems.push(nextItem);
    }

    return { items: nextItems, changed };
  }

  private isDeprecatedPropigPageMenuItem(item: MenuItem): boolean {
    return (
      this.DEPRECATED_PROPIG_MENU_ITEM_IDS.has(item.id) ||
      Boolean(item.path && this.DEPRECATED_PROPIG_PAGE_PATHS.has(item.path))
    );
  }

  private cleanupAdminPageMakerMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    let nextData = data;
    let changed = false;

    for (const [siteId, site] of Object.entries(data)) {
      const menuCleanup = this.removeAdminPageMakerMenuItems(site.menu);
      const trashCleanup = this.removeAdminPageMakerMenuItems(site.trash);

      if (!menuCleanup.changed && !trashCleanup.changed) {
        continue;
      }

      nextData = {
        ...nextData,
        [siteId]: {
          ...site,
          menu: menuCleanup.items,
          trash: trashCleanup.items,
        },
      };
      changed = true;
    }

    return { data: nextData, changed };
  }

  private removeAdminPageMakerMenuItems(items: MenuItem[]): { items: MenuItem[]; changed: boolean } {
    let changed = false;
    const nextItems: MenuItem[] = [];

    for (const item of items) {
      if (this.isAdminPageMakerMenuItem(item)) {
        changed = true;
        continue;
      }

      if (item.sub && Array.isArray(item.sub)) {
        const nextSub: (string | MenuItem)[] = [];

        for (const subItem of item.sub) {
          if (typeof subItem === 'string') {
            nextSub.push(subItem);
            continue;
          }

          const cleanupResult = this.removeAdminPageMakerMenuItems([subItem]);
          changed = changed || cleanupResult.changed;
          nextSub.push(...cleanupResult.items);
        }

        nextItems.push({
          ...item,
          sub: nextSub,
        });

        if (nextSub.length !== item.sub.length) {
          changed = true;
        }

        continue;
      }

      nextItems.push(item);
    }

    return { items: nextItems, changed };
  }

  private isAdminPageMakerMenuItem(item: MenuItem): boolean {
    return (
      item.id === 'admin-17' ||
      item.path === '/admin/company-pages' ||
      item.path === '/admin/company-introduction-editor' ||
      item.path === '/admin/ceo-intro-media'
    );
  }

  private cleanupVideoStudioMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = adminSite.menu.some((item) => item.id === 'admin-7-video');
    if (!exists) {
      return { data, changed: false };
    }

    const nextMenu = adminSite.menu.filter((item) => item.id !== 'admin-7-video');

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: nextMenu,
        },
      },
      changed: true,
    };
  }

  private cleanupAdminTaxFolderMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const taxMenuIndex = adminSite.menu.findIndex((item) => this.containsAdminTaxMenuItem(item));
    if (taxMenuIndex < 0) {
      return { data, changed: false };
    }

    const nextMenu = [...adminSite.menu];
    nextMenu.splice(taxMenuIndex, 1, this.createAdminTaxMenuItem());

    const cleanupResult = this.removeAdminTaxMenuItems(nextMenu.filter((_, index) => index !== taxMenuIndex));
    const dedupedMenu = [...cleanupResult.items];
    dedupedMenu.splice(taxMenuIndex, 0, this.createAdminTaxMenuItem());

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: dedupedMenu,
        },
      },
      changed: true,
    };
  }

  private createAdminTaxMenuItem(): MenuItem {
    return {
      id: 'admin-10',
      text: '세무관리',
      path: '/admin/tax/purchase-sales/full-inquiry',
      icon: 'calculator',
      type: 'link',
      roles: ['admin'],
      position: ['ceo', 'manager'],
    };
  }

  private containsAdminTaxMenuItem(item: MenuItem): boolean {
    if (this.isAdminTaxMenuItem(item)) {
      return true;
    }

    if (!item.sub) {
      return false;
    }

    return item.sub.some((subItem) =>
      typeof subItem !== 'string' && this.containsAdminTaxMenuItem(subItem),
    );
  }

  private isAdminTaxMenuItem(item: MenuItem): boolean {
    return (
      item.id === 'admin-10' ||
      item.id === 'admin-10-1' ||
      item.id === 'admin-10-1-1' ||
      item.path === '/admin/tax/purchase-sales/full-inquiry'
    );
  }

  private removeAdminTaxMenuItems(items: MenuItem[]): { items: MenuItem[]; changed: boolean } {
    let changed = false;
    const nextItems: MenuItem[] = [];

    for (const item of items) {
      if (this.isAdminTaxMenuItem(item)) {
        changed = true;
        continue;
      }

      if (item.sub && Array.isArray(item.sub)) {
        const nextSub: (string | MenuItem)[] = [];

        for (const subItem of item.sub) {
          if (typeof subItem === 'string') {
            nextSub.push(subItem);
            continue;
          }

          const cleanupResult = this.removeAdminTaxMenuItems([subItem]);
          changed = changed || cleanupResult.changed;
          nextSub.push(...cleanupResult.items);
        }

        nextItems.push({
          ...item,
          sub: nextSub,
        });
        continue;
      }

      nextItems.push(item);
    }

    return { items: nextItems, changed };
  }

  private applyCorpBusinessTemplate(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const corpSite = data.corp;
    if (!corpSite) {
      return { data, changed: false };
    }

    const templateMenu = this.getCorpBusinessTemplateMenu();
    const nextMenu = [...corpSite.menu];
    let changed = false;

    for (const templateItem of templateMenu) {
      const existingIndex = nextMenu.findIndex(
        (item) => item.id === templateItem.id || Boolean(item.path && templateItem.path && item.path === templateItem.path),
      );

      if (existingIndex < 0) {
        nextMenu.push(this.normalizeMenuItems([templateItem])[0]);
        changed = true;
        continue;
      }

      const existingItem = nextMenu[existingIndex];
      const mergedSub = this.mergeTemplateSubMenu(existingItem.sub, templateItem.sub);
      if (mergedSub.changed) {
        nextMenu[existingIndex] = {
          ...existingItem,
          sub: mergedSub.sub,
        };
        changed = true;
      }
    }

    if (!changed) {
      return { data, changed: false };
    }

    return {
      data: {
        ...data,
        corp: {
          ...corpSite,
          menu: nextMenu,
        },
      },
      changed: true,
    };
  }

  private mergeTemplateSubMenu(
    existingSub: MenuItem['sub'] | undefined,
    templateSub: MenuItem['sub'] | undefined,
  ): { sub: MenuItem['sub']; changed: boolean } {
    if (!templateSub || templateSub.length === 0) {
      return { sub: existingSub, changed: false };
    }

    const existingItems = existingSub ?? [];
    const usedExistingIndexes = new Set<number>();
    const nextSub: NonNullable<MenuItem['sub']> = [];

    for (const templateChild of templateSub) {
      if (typeof templateChild === 'string') continue;

      const existingIndex = existingItems.findIndex(
        (item, index) =>
          !usedExistingIndexes.has(index) &&
          typeof item !== 'string' &&
          (item.id === templateChild.id || Boolean(item.path && templateChild.path && item.path === templateChild.path)),
      );

      if (existingIndex >= 0) {
        nextSub.push(existingItems[existingIndex]);
        usedExistingIndexes.add(existingIndex);
        continue;
      }

      nextSub.push(this.normalizeMenuItems([templateChild])[0]);
    }

    existingItems.forEach((item, index) => {
      if (!usedExistingIndexes.has(index) && !this.isDeprecatedCorpCompanyMenuItem(item)) {
        nextSub.push(item);
      }
    });

    const changed =
      nextSub.length !== existingItems.length ||
      nextSub.some((item, index) => item !== existingItems[index]);

    return { sub: nextSub, changed };
  }

  private isDeprecatedCorpCompanyMenuItem(item: string | MenuItem): boolean {
    if (typeof item === 'string') return false;
    return (
      this.DEPRECATED_CORP_COMPANY_MENU_ITEM_IDS.has(item.id) ||
      Boolean(item.path && this.DEPRECATED_CORP_COMPANY_MENU_PATHS.has(item.path))
    );
  }

  private applyAdminGeminiMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = adminSite.menu.some((item) => item.id === 'admin-8');
    if (exists) {
      return { data, changed: false };
    }

    const geminiMenu: MenuItem = {
      id: 'admin-8',
      text: 'Gemini 설정 센터',
      path: '/admin/gemini-settings',
      icon: 'key',
      type: 'link',
      roles: ['admin'],
      position: ['ceo', 'manager'],
      badge: 'AI',
    };

    const dividerIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = dividerIndex >= 0 ? dividerIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, geminiMenu);

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: nextMenu,
        },
      },
      changed: true,
    };
  }

  private applyAdminPhotosMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = adminSite.menu.some((item) => item.id === 'admin-9');
    if (exists) {
      return { data, changed: false };
    }

    const photosMenu: MenuItem = {
      id: 'admin-9',
      text: '사진첩',
      path: '/admin/photos',
      icon: 'images',
      type: 'link',
      roles: ['admin', 'user'],
      permissions: ['photoManagement'],
      position: ['ceo', 'manager', 'staff'],
    };

    const targetIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = targetIndex >= 0 ? targetIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, photosMenu);

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: nextMenu,
        },
      },
      changed: true,
    };
  }

  private applyAdminStorageMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = adminSite.menu.some((item) => item.id === 'admin-11' || item.path === '/admin/storage');
    if (exists) {
      return { data, changed: false };
    }

    const storageMenu: MenuItem = {
      id: 'admin-11',
      text: 'Storage',
      path: '/admin/storage',
      icon: 'hard-drive',
      type: 'link',
      roles: ['admin', 'user'],
      permissions: ['storageManagement'],
      position: ['ceo', 'manager', 'staff'],
      badge: 'DRIVE',
    };

    const targetIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = targetIndex >= 0 ? targetIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, storageMenu);

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: nextMenu,
        },
      },
      changed: true,
    };
  }

  private applyAdminUsersMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = adminSite.menu.some((item) => item.id === 'admin-13' || item.path === '/admin/users');
    if (exists) {
      return { data, changed: false };
    }

    const usersMenu: MenuItem = {
      id: 'admin-13',
      text: '유저 관리',
      path: '/admin/users',
      icon: 'user-shield',
      type: 'link',
      roles: ['admin'],
      permissions: ['userManagement'],
      position: ['ceo', 'manager'],
      badge: 'AUTH',
    };

    const targetIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = targetIndex >= 0 ? targetIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, usersMenu);

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: nextMenu,
        },
      },
      changed: true,
    };
  }

  private applyAdminPermissionMenuAccess(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const permissionByPath: Record<string, NonNullable<MenuItem['permissions']>[number]> = {
      '/admin/users': 'userManagement',
      '/admin/menu': 'menuManagement',
      '/admin/photos': 'photoManagement',
      '/admin/storage': 'storageManagement',
    };

    const patchItems = (items: MenuItem[]): { items: MenuItem[]; changed: boolean } => {
      let changed = false;
      const nextItems = items.map((item) => {
        let nextItem = item;
        const requiredPermission = item.path ? permissionByPath[item.path] : undefined;

        if (requiredPermission && !(item.permissions || []).includes(requiredPermission)) {
          nextItem = {
            ...nextItem,
            permissions: [...(item.permissions || []), requiredPermission],
          };
          changed = true;
        }

        if (nextItem.sub && Array.isArray(nextItem.sub)) {
          const nextSub = nextItem.sub.map((subItem) => {
            if (typeof subItem === 'string') return subItem;

            const patched = patchItems([subItem]);
            changed = changed || patched.changed;
            return patched.items[0];
          });

          if (nextSub !== nextItem.sub) {
            nextItem = {
              ...nextItem,
              sub: nextSub,
            };
          }
        }

        return nextItem;
      });

      return { items: nextItems, changed };
    };

    const patched = patchItems(adminSite.menu);
    return patched.changed
      ? {
          data: {
            ...data,
            admin: {
              ...adminSite,
              menu: patched.items,
            },
          },
          changed: true,
        }
      : { data, changed: false };
  }

  private cleanupAdminProjectBoardMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const nextMenu = adminSite.menu.filter(
      (item) => item.id !== 'admin-12' && item.path !== '/admin/corp-project-board',
    );
    const nextTrash = adminSite.trash.filter(
      (item) => item.id !== 'admin-12' && item.path !== '/admin/corp-project-board',
    );

    if (nextMenu.length === adminSite.menu.length && nextTrash.length === adminSite.trash.length) {
      return { data, changed: false };
    }

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: nextMenu,
          trash: nextTrash,
        },
      },
      changed: true,
    };
  }

  private applyAdminHabitTrackerMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = adminSite.menu.some((item) => item.id === 'admin-14' || item.path === '/habit-tracker');
    if (exists) {
      return { data, changed: false };
    }

    const habitTrackerMenu: MenuItem = {
      id: 'admin-14',
      text: '습관 트래커',
      path: '/habit-tracker',
      icon: 'calendar-check',
      type: 'link',
      roles: ['admin', 'user'],
      position: ['ceo', 'manager', 'staff'],
    };

    const targetIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = targetIndex >= 0 ? targetIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, habitTrackerMenu);

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: nextMenu,
        },
      },
      changed: true,
    };
  }

  private applyAdminBucketListMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = adminSite.menu.some((item) => item.id === 'admin-15' || item.path === '/bucket-list');
    if (exists) {
      return { data, changed: false };
    }

    const bucketListMenu: MenuItem = {
      id: 'admin-15',
      text: '버킷리스트',
      path: '/bucket-list',
      icon: 'bullseye',
      type: 'link',
      roles: ['admin', 'user'],
      position: ['ceo', 'manager', 'staff'],
      badge: 'NEW',
    };

    const habitIndex = adminSite.menu.findIndex((item) => item.id === 'admin-14' || item.path === '/habit-tracker');
    const targetIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = habitIndex >= 0 ? habitIndex + 1 : targetIndex >= 0 ? targetIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, bucketListMenu);

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: nextMenu,
        },
      },
      changed: true,
    };
  }

  private applyAdminTodoListMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = adminSite.menu.some((item) => item.id === 'admin-16' || item.path === '/todo-list');
    if (exists) {
      return { data, changed: false };
    }

    const todoListMenu: MenuItem = {
      id: 'admin-16',
      text: '할일 일정표',
      path: '/todo-list',
      icon: 'list-check',
      type: 'link',
      roles: ['admin', 'user'],
      position: ['ceo', 'manager', 'staff'],
      badge: 'PLAN',
    };

    const bucketIndex = adminSite.menu.findIndex((item) => item.id === 'admin-15' || item.path === '/bucket-list');
    const habitIndex = adminSite.menu.findIndex((item) => item.id === 'admin-14' || item.path === '/habit-tracker');
    const targetIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex =
      bucketIndex >= 0 ? bucketIndex + 1 : habitIndex >= 0 ? habitIndex + 1 : targetIndex >= 0 ? targetIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, todoListMenu);

    return {
      data: {
        ...data,
        admin: {
          ...adminSite,
          menu: nextMenu,
        },
      },
      changed: true,
    };
  }

  private getCorpBusinessTemplateMenu(): MenuItem[] {
    return [
      {
        id: 'corp-company-intro',
        text: '회사소개',
        icon: 'circle-info',
        type: 'folder',
        roles: [],
        position: ['ceo', 'manager', 'staff'],
        sub: [
          {
            id: 'corp-company-intro-0',
            text: '회사소개',
            path: '/corp/company/introduction',
            icon: 'building',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-company-intro-1',
            text: '창업배경',
            path: '/corp/company/founding-background',
            icon: 'lightbulb',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-company-intro-2',
            text: '대표소개',
            path: '/corp/company/ceo-intro',
            icon: 'user-tie',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-company-intro-3',
            text: '직원소개',
            path: '/corp/company/staff-intro',
            icon: 'users',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-company-intro-4',
            text: '기업기술',
            path: '/corp/company/technology',
            icon: 'microchip',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-company-intro-6',
            text: '사업영역',
            path: '/corp/company/business-area',
            icon: 'briefcase',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-company-intro-7',
            text: '사회공헌',
            path: '/corp/company/social-contribution',
            icon: 'hands-holding-heart',
            type: 'link',
            roles: [],
          },
        ],
      },
      {
        id: 'corp-project',
        text: '프로젝트',
        icon: 'diagram-project',
        type: 'folder',
        roles: [],
        position: ['ceo', 'manager', 'staff'],
        sub: [
          {
            id: 'corp-project-1',
            text: '프로젝트',
            path: '/corp/project',
            icon: 'folder-open',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-project-2',
            text: '포트폴리오',
            path: '/corp/portfolio',
            icon: 'images',
            type: 'link',
            roles: [],
          },
        ],
      },
      {
        id: 'corp-partnership',
        text: '제휴하기',
        icon: 'handshake',
        type: 'folder',
        roles: [],
        position: ['ceo', 'manager', 'staff'],
        sub: [
          {
            id: 'corp-partnership-1',
            text: '사업제휴',
            path: '/corp/partnership/business',
            icon: 'briefcase',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-partnership-2',
            text: '광고제휴',
            path: '/corp/partnership/advertising',
            icon: 'bullhorn',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-partnership-3',
            text: '투자제휴',
            path: '/corp/partnership/investment',
            icon: 'chart-line',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-partnership-4',
            text: '후원하기',
            path: '/corp/partnership/sponsorship',
            icon: 'gift',
            type: 'link',
            roles: [],
          },
        ],
      },
      {
        id: 'corp-career',
        text: '인재채용',
        icon: 'user-plus',
        type: 'folder',
        roles: [],
        position: ['ceo', 'manager', 'staff'],
        sub: [
          {
            id: 'corp-career-1',
            text: '인재상',
            path: '/corp/careers/talent',
            icon: 'star',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-career-2',
            text: '채용정보',
            path: '/corp/careers/jobs',
            icon: 'clipboard-list',
            type: 'link',
            roles: [],
          },
          {
            id: 'corp-career-3',
            text: '지원하기',
            path: '/corp/careers/apply',
            icon: 'paper-plane',
            type: 'link',
            roles: [],
          },
        ],
      },
    ];
  }

  validateMenu(menu: MenuItem[]): boolean {
    try {
      return menu.every((item) => this.validateMenuItem(item));
    } catch {
      return false;
    }
  }

  private validateMenuItem(item: MenuItem): boolean {
    if (!item.id || !item.text) return false;

    if (item.sub && Array.isArray(item.sub)) {
      return item.sub.every((subItem) => {
        if (typeof subItem === 'string') return true;
        return this.validateMenuItem(subItem as MenuItem);
      });
    }

    return true;
  }

  private getDefaultData(): SiteDataType {
    return {
      admin: {
        name: '통합 관리',
        icon: 'shield-halved',
        color: '#10b981',
        positions: ['ceo', 'manager', 'staff'],
        menu: [
          {
            id: 'admin-1',
            text: '시스템 대시보드',
            path: '/',
            icon: 'chart-line',
            type: 'link',
            roles: ['admin'],
            position: ['ceo', 'manager', 'staff'],
          },
          {
            id: 'admin-2',
            text: '스티커 메모',
            path: '/sticky-notes',
            icon: 'note-sticky',
            type: 'link',
            roles: ['admin', 'user'],
            position: ['manager', 'staff'],
          },
          {
            id: 'admin-3',
            text: '스마트 북마크',
            path: '/bookmarks',
            icon: 'bookmark',
            type: 'link',
            roles: ['admin', 'user'],
            position: ['manager', 'staff'],
          },
          {
            id: 'admin-4',
            text: 'YouTube 분석',
            path: '/youtube-analyze',
            icon: 'circle-play',
            type: 'link',
            roles: ['admin', 'user'],
            position: ['staff'],
          },
          {
            id: 'admin-5',
            text: '만다라트',
            path: '/mandalart',
            icon: 'bullseye',
            type: 'link',
            roles: ['admin', 'user'],
            position: ['manager', 'staff'],
          },
          {
            id: 'admin-14',
            text: '습관 트래커',
            path: '/habit-tracker',
            icon: 'calendar-check',
            type: 'link',
            roles: ['admin', 'user'],
            position: ['ceo', 'manager', 'staff'],
          },
          {
            id: 'admin-16',
            text: '할일 일정표',
            path: '/todo-list',
            icon: 'list-check',
            type: 'link',
            roles: ['admin', 'user'],
            position: ['ceo', 'manager', 'staff'],
            badge: 'PLAN',
          },
          {
            id: 'admin-6',
            text: 'AI 이미지 생성기',
            path: '/admin/image-generator',
            icon: 'wand-magic-sparkles',
            type: 'link',
            roles: ['admin'],
            position: ['ceo', 'manager'],
          },
          {
            id: 'admin-8',
            text: 'Gemini 설정 센터',
            path: '/admin/gemini-settings',
            icon: 'key',
            type: 'link',
            roles: ['admin'],
            position: ['ceo', 'manager'],
            badge: 'AI',
          },
          {
            id: 'admin-9',
            text: '사진첩',
            path: '/admin/photos',
            icon: 'images',
            type: 'link',
            roles: ['admin', 'user'],
            permissions: ['photoManagement'],
            position: ['ceo', 'manager', 'staff'],
          },
          {
            id: 'admin-11',
            text: 'Storage',
            path: '/admin/storage',
            icon: 'hard-drive',
            type: 'link',
            roles: ['admin', 'user'],
            permissions: ['storageManagement'],
            position: ['ceo', 'manager', 'staff'],
            badge: 'DRIVE',
          },
          {
            id: 'admin-13',
            text: '유저 관리',
            path: '/admin/users',
            icon: 'user-shield',
            type: 'link',
            roles: ['admin'],
            permissions: ['userManagement'],
            position: ['ceo', 'manager'],
            badge: 'AUTH',
          },
          {
            id: 'admin-10',
            text: '세무관리',
            path: '/admin/tax/purchase-sales/full-inquiry',
            icon: 'calculator',
            type: 'link',
            roles: ['admin'],
            position: ['ceo', 'manager'],
          },
          {
            id: 'admin-divider-1',
            text: '구분선',
            type: 'divider',
          },
          {
            id: 'admin-7',
            text: '통합 메뉴 관리',
            path: '/admin/menu',
            icon: 'bars',
            type: 'link',
            roles: ['admin'],
            permissions: ['menuManagement'],
            position: ['ceo'],
            badge: 'NEW',
          },
        ],
        trash: [],
      },
      corp: {
        name: '기업 관리',
        icon: 'building',
        color: '#6366f1',
        positions: ['ceo', 'manager', 'staff'],
        menu: [DEFAULT_SITE_HOME_MENU_ITEMS.corp, ...this.getCorpBusinessTemplateMenu()],
        trash: [],
      },
      shop: {
        name: 'propig',
        icon: 'bullseye',
        color: '#22c55e',
        positions: ['ceo', 'manager', 'staff'],
        menu: [
          {
            ...DEFAULT_SITE_HOME_MENU_ITEMS.shop,
          },
          ...this.getPropigFixedMenuItems(),
        ],
        trash: [],
      },
      [ACCOUNT_MENU_SITE_ID]: createDefaultAccountMenuSite(),
    };
  }

  async saveAllSites(data: SiteDataType): Promise<void> {
    try {
      if (!validateAllSites(data)) {
        throw new Error('Invalid data structure');
      }

      const normalizedData = this.normalizeMenuData(data);
      this.persistLocal(normalizedData);
      await this.saveRemoteSites(normalizedData);
      this.notifyAllSubscribers(normalizedData);
    } catch (error) {
      console.error('Failed to save all sites:', error);
      throw error;
    }
  }

  generateId(): string {
    return `menu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  findMenuItem(menu: MenuItem[], id: string): MenuItem | null {
    for (const item of menu) {
      if (item.id === id) return item;

      if (item.sub) {
        for (const subItem of item.sub) {
          if (typeof subItem !== 'string') {
            const found = this.findMenuItem([subItem], id);
            if (found) return found;
          }
        }
      }
    }

    return null;
  }

  removeMenuItem(menu: MenuItem[], id: string): MenuItem[] {
    return menu
      .filter((item) => item.id !== id)
      .map((item) => {
        if (item.sub) {
          return {
            ...item,
            sub: item.sub
              .filter((subItem) => {
                if (typeof subItem === 'string') return true;
                return subItem.id !== id;
              })
              .map((subItem) => {
                if (typeof subItem === 'string') return subItem;
                return this.removeMenuItem([subItem], id)[0] || subItem;
              }),
          };
        }
        return item;
      });
  }
}

export const menuService = new MenuService();
