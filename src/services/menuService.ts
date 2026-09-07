import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { SiteDataType, SiteData, MenuItem, MenuServiceInterface } from '@/types/menu';
import { validateAllSites, validateSiteData } from '@/schemas/menuSchema';
import { ACCOUNT_MENU_SITE_ID, createDefaultAccountMenuSite } from '@/constants/accountMenu';
import { DEFAULT_SITE_HOME_MENU_ITEMS } from '@/constants/siteHome';
import { COMPANY_MENU_ITEMS } from '@/constants/companyMenu';
import { PROPIG_STORE_MENU_ITEMS, PROPIG_STORE_PAGE_MENU_ITEM } from '@/constants/propigStore';
import { auth, db } from '@/firebase/config';
import { USER_PERMISSION_KEYS, USER_POSITION_OPTIONS, USER_ROLE_OPTIONS } from '@/types/userAccess';
import { MENU_SETTINGS_VERSION } from '@/constants/menuSettingsContract';

class MenuService implements MenuServiceInterface {
  private readonly STORAGE_KEY = 'advanced_menu_manager_data';
  private readonly STORAGE_VERSION_KEY = 'advanced_menu_manager_data_version';
  private readonly REMOTE_COLLECTION = 'menuSettings';
  private readonly REMOTE_DOC_ID = 'sites';
  private readonly REMOTE_LOAD_TIMEOUT_MS = 1200;
  private readonly CURRENT_DATA_VERSION = MENU_SETTINGS_VERSION;
  private readonly RETIRED_MENU_PATHS = new Set([
    '/mandalart',
    '/admin/ai-workforce',
    '/admin/image-generator',
    '/corp/company/history',
  ]);
  private readonly RETIRED_MENU_ITEM_IDS = new Set([
    'admin-5',
    'admin-6',
    'admin-20',
    'corp-company-intro-history',
  ]);
  private readonly DEPRECATED_CORP_COMPANY_MENU_PATHS = new Set([
    '/corp/company/history',
    '/corp/company/founding-background',
    '/corp/company/vision',
    '/corp/company/vision-mission',
    '/corp/company/company-values',
    '/corp/company/social-contribution',
    '/corp/company/technology',
    '/corp/company/location',
  ]);
  private readonly DEPRECATED_CORP_COMPANY_MENU_ITEM_IDS = new Set([
    'corp-company-intro-4',
    'corp-company-intro-5',
    'corp-company-intro-6',
    'corp-company-intro-8',
    'corp-company-intro-9',
  ]);
  private readonly CURRENT_CORP_COMPANY_MENU_PATHS = new Set<string>(
    COMPANY_MENU_ITEMS.map((item) => item.href),
  );
  private readonly DEPRECATED_PROPIG_PAGE_PATHS = new Set([
    '/propig/tasks',
    '/propig/routines',
    '/propig/reflection',
    '/shop/orders',
    '/shop/delivery',
    '/shop/returns',
  ]);
  private readonly DEPRECATED_PROPIG_MENU_ITEM_IDS = new Set(['shop-1-1', 'shop-1-2', 'shop-1-3']);
  private readonly VALID_MENU_TYPES = new Set(['folder', 'link', 'divider']);
  private subscribers: Map<string, Set<(data: SiteData) => void>> = new Map();
  private allSitesCache: SiteDataType | null = null;
  private loadAllSitesPromise: Promise<SiteDataType> | null = null;
  private remoteMenuUnsubscribe: (() => void) | null = null;
  private remoteMenuSubscriberCount = 0;
  private liveSnapshotRevision = 0;

  async loadAllSites(): Promise<SiteDataType> {
    if (this.allSitesCache) {
      return this.serializeSites(this.allSitesCache);
    }

    if (this.loadAllSitesPromise) {
      return this.loadAllSitesPromise;
    }

    this.loadAllSitesPromise = this.loadAllSitesUncached().finally(() => {
      this.loadAllSitesPromise = null;
    });

    return this.loadAllSitesPromise;
  }

  getDefaultSites(): SiteDataType {
    return this.serializeSites(this.getDefaultData());
  }

  getCachedSites(): SiteDataType | null {
    return this.allSitesCache ? this.serializeSites(this.allSitesCache) : null;
  }

  private async loadAllSitesUncached(): Promise<SiteDataType> {
    try {
      const remote = await this.loadRemoteSitesWithTimeout();
      // A live snapshot may have arrived while the bootstrap read was pending.
      if (this.allSitesCache) return this.serializeSites(this.allSitesCache);
      if (remote) {
        this.persistLocal(remote);
        return this.rememberSites(remote);
      }

      const stored = this.readLocalStorage(this.STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored);
        if (validateAllSites(parsed)) {
          const normalized = this.normalizeMenuData(parsed);
          const normalizedChanged = this.hasDataChanged(parsed as SiteDataType, normalized);
          const { data: migratedData, changed } = this.migrateData(normalized);
          if (normalizedChanged || changed) {
            this.persistLocal(migratedData);
          }

          // A timed-out remote read is not evidence that the remote document is
          // missing. Keep the offline fallback read-only so app startup cannot
          // compete with navigation or overwrite a newer remote menu snapshot.
          return this.rememberSites(migratedData);
        }
      }

      const defaults = this.getDefaultData();
      const { data: migratedDefaults, changed } = this.migrateData(defaults);
      if (changed) {
        this.persistLocal(migratedDefaults);
      }
      return this.rememberSites(migratedDefaults);
    } catch (error) {
      console.error('Failed to load sites:', error);
      return this.rememberSites(this.getDefaultData());
    }
  }

  async saveSite(siteId: string, data: SiteData): Promise<void> {
    try {
      const normalizedSite = this.normalizeSiteData(data);
      const cleanedSite = this.cleanupRetiredMenuItems({
        [siteId]: normalizedSite,
      }).data[siteId];

      if (!validateSiteData(cleanedSite)) {
        throw new Error('Invalid site data');
      }

      const allSites = await this.loadAllSites();
      allSites[siteId] = cleanedSite;

      await this.saveRemoteSites(allSites);
      this.liveSnapshotRevision++;
      this.persistLocal(allSites);
      this.rememberSites(allSites);

      this.notifySubscribers(siteId, cleanedSite);
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
    if (this.allSitesCache?.[siteId]) {
      queueMicrotask(() => {
        if (!disposed && this.allSitesCache?.[siteId]) {
          callback(this.allSitesCache[siteId]);
        }
      });
    } else {
      this.loadAllSites().then((allSites) => {
        if (disposed) return;
        if (allSites[siteId]) {
          callback(allSites[siteId]);
        }
      });
    }

    const releaseRemoteSubscription = this.retainRemoteMenuSubscription();

    return () => {
      disposed = true;
      releaseRemoteSubscription();
      const subs = this.subscribers.get(siteId);
      if (subs) {
        subs.delete(callback);
      }
    };
  }

  private readLocalStorage(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private persistLocal(data: SiteDataType): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      window.localStorage.setItem(this.STORAGE_VERSION_KEY, String(this.CURRENT_DATA_VERSION));
    } catch {
      // Browser storage is an optional cache, never a prerequisite for live menus.
    }
  }

  private getSavedLocalVersion(): number {
    return Number(this.readLocalStorage(this.STORAGE_VERSION_KEY) || '1');
  }

  private getRemoteDocRef() {
    return doc(db, this.REMOTE_COLLECTION, this.REMOTE_DOC_ID);
  }

  private retainRemoteMenuSubscription(): () => void {
    this.remoteMenuSubscriberCount += 1;

    if (!this.remoteMenuUnsubscribe) {
      this.remoteMenuUnsubscribe = onSnapshot(
        this.getRemoteDocRef(),
        (snapshot) => {
          if (!snapshot.exists()) return;
          const remote = this.parseRemoteSnapshot(snapshot.data());
          if (!remote) return;
          this.liveSnapshotRevision += 1;
          this.persistLocal(remote);
          this.rememberSites(remote);
          this.notifyAllSubscribers(remote);
        },
        (error) => {
          console.warn('Failed to subscribe to remote menu data:', error);
        },
      );
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.remoteMenuSubscriberCount = Math.max(0, this.remoteMenuSubscriberCount - 1);

      if (this.remoteMenuSubscriberCount === 0) {
        this.remoteMenuUnsubscribe?.();
        this.remoteMenuUnsubscribe = null;
      }
    };
  }

  private serializeSites(data: SiteDataType): SiteDataType {
    return JSON.parse(JSON.stringify(data)) as SiteDataType;
  }

  private rememberSites(data: SiteDataType): SiteDataType {
    this.allSitesCache = this.serializeSites(data);
    return data;
  }

  private hasDataChanged(left: SiteDataType, right: SiteDataType): boolean {
    return JSON.stringify(left) !== JSON.stringify(right);
  }

  private parseRemoteSnapshot(value: unknown): SiteDataType | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const payload = value as { sites?: unknown; version?: unknown };
    if (!validateAllSites(payload.sites)) return null;

    const normalized = this.normalizeMenuData(payload.sites as SiteDataType);
    const migration = this.migrateData(normalized, Number(payload.version || '1'));
    return migration.data;
  }

  private async loadRemoteSites(): Promise<SiteDataType | null> {
    try {
      const snapshot = await getDoc(this.getRemoteDocRef());
      if (!snapshot.exists()) return null;
      return this.parseRemoteSnapshot(snapshot.data());
    } catch (error) {
      console.warn('Failed to load remote menu data:', error);
      return null;
    }
  }

  private async loadRemoteSitesWithTimeout(): Promise<SiteDataType | null> {
    const timedOut = { timedOut: true } as const;
    const revisionAtStart = this.liveSnapshotRevision;
    const remotePromise = this.loadRemoteSites();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<typeof timedOut>((resolve) => {
      timeoutId = setTimeout(() => resolve(timedOut), this.REMOTE_LOAD_TIMEOUT_MS);
    });

    const result = await Promise.race([remotePromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);

    if (result && 'timedOut' in result) {
      void remotePromise.then((remote) => {
        if (!remote || this.liveSnapshotRevision !== revisionAtStart) return;
        this.persistLocal(remote);
        this.rememberSites(remote);
        this.notifyAllSubscribers(remote);
      });

      return null;
    }

    return result;
  }

  private async saveRemoteSites(data: SiteDataType): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('로그인이 필요합니다. 편집 내용은 아직 저장되지 않았습니다.');

    // Both Next runtime and Firebase Hosting implement this authenticated API.
    // A direct Firestore write first would publish an unacknowledged local
    // snapshot and may remain queued offline after the UI reports failure.
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('저장 응답을 확인하지 못했습니다. 변경 내용은 유지되며 다시 저장할 수 있습니다.'));
      }, 15000);
    });
    const requestSave = async () => {
      const token = await currentUser.getIdToken();
      if (controller.signal.aborted) throw new Error('메뉴 저장 시간이 초과되었습니다.');
      if (auth.currentUser !== currentUser) throw new Error('로그인 상태가 변경되었습니다. 다시 시도해 주세요.');
      const response = await fetch('/api/admin/menu-sites', {
        method: 'PUT',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sites: this.serializeSites(data) }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error || '서버에서 메뉴 저장을 확인하지 못했습니다. 다시 시도해 주세요.');
      }
    };
    try {
      await Promise.race([requestSave(), deadline]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
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
      const normalizedSiteId = siteId.trim();
      if (!normalizedSiteId || !siteData) continue;
      normalized[normalizedSiteId] = this.normalizeSiteData(siteData);
    }

    return normalized;
  }

  private normalizeSiteData(siteData: SiteData): SiteData {
    const positions = Array.isArray(siteData.positions)
      ? this.sanitizeStringArray(siteData.positions, USER_POSITION_OPTIONS) as SiteData['positions'] | undefined
      : undefined;

    return {
      name: siteData.name.trim(),
      icon: siteData.icon.trim() || 'globe',
      ...(typeof siteData.color === 'string' && siteData.color.trim() ? { color: siteData.color.trim() } : {}),
      ...(positions?.length ? { positions } : {}),
      menu: this.normalizeMenuItems(siteData.menu || []),
      trash: this.normalizeMenuItems(siteData.trash || []),
    };
  }

  private normalizeMenuItems(items: MenuItem[]): MenuItem[] {
    const seenIds = new Set<string>();
    const seenPaths = new Set<string>();

    const normalizeList = (rawItems: Array<MenuItem | string>, allowStrings: boolean): Array<MenuItem | string> => {
      const normalizedItems: Array<MenuItem | string> = [];
      const seenStrings = new Set<string>();

      for (const rawItem of rawItems) {
        if (typeof rawItem === 'string') {
          const label = rawItem.trim();
          if (allowStrings && label && !seenStrings.has(label)) {
            seenStrings.add(label);
            normalizedItems.push(label);
          }
          continue;
        }

        const normalizedItem = normalizeItem(rawItem);
        if (normalizedItem) {
          normalizedItems.push(normalizedItem);
        }
      }

      return normalizedItems;
    };

    const normalizeItem = (item: MenuItem): MenuItem | null => {
      const id = item.id?.trim();
      const text = item.text?.trim();
      if (!id || !text || seenIds.has(id)) return null;

      const path = this.normalizeMenuPath(item.path);
      if (path && seenPaths.has(path)) return null;

      seenIds.add(id);
      if (path) seenPaths.add(path);

      const requestedType = typeof item.type === 'string' && this.VALID_MENU_TYPES.has(item.type)
        ? item.type
        : undefined;
      const normalizedSub = Array.isArray(item.sub) ? normalizeList(item.sub, true) : [];
      const type = requestedType ?? (normalizedSub.length > 0 ? 'folder' : 'link');
      const icon = typeof item.icon === 'string' && item.icon.trim() ? item.icon.trim() : undefined;
      const roles = this.sanitizeStringArray(item.roles, USER_ROLE_OPTIONS);
      const permissions = this.sanitizeStringArray(item.permissions, USER_PERMISSION_KEYS) as MenuItem['permissions'] | undefined;
      const position = this.sanitizeStringArray(item.position, USER_POSITION_OPTIONS) as MenuItem['position'] | undefined;
      const badge =
        typeof item.badge === 'number'
          ? item.badge
          : typeof item.badge === 'string' && item.badge.trim()
            ? item.badge.trim()
            : undefined;

      const normalized: MenuItem = {
        id,
        text,
        type,
      };

      if (type !== 'divider' && path) normalized.path = path;
      if (type !== 'divider' && icon) normalized.icon = icon;
      if (roles?.length) normalized.roles = roles;
      if (permissions?.length) normalized.permissions = permissions;
      if (position?.length) normalized.position = position;
      if (badge !== undefined) normalized.badge = badge;
      if (item.external === true) normalized.external = true;
      if (item.hidden === true) normalized.hidden = true;
      if (typeof item.expanded === 'boolean') normalized.expanded = item.expanded;
      if (typeof item.propigAppId === 'string' && item.propigAppId.trim()) {
        normalized.propigAppId = item.propigAppId.trim();
      }
      if (normalizedSub.length > 0 || type === 'folder') {
        normalized.sub = normalizedSub;
      }

      return normalized;
    };

    return normalizeList(items, false).filter((item): item is MenuItem => typeof item !== 'string');
  }

  private normalizeMenuPath(path: unknown): string | undefined {
    if (typeof path !== 'string') return undefined;
    const trimmedPath = path.trim();
    if (!trimmedPath) return undefined;
    if (trimmedPath.startsWith('/')) return trimmedPath;
    if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmedPath)) return trimmedPath;
    return undefined;
  }

  private sanitizeStringArray(
    value: unknown,
    allowedValues?: readonly string[],
  ): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const allowed = allowedValues ? new Set(allowedValues) : null;
    const normalized = value.reduce<string[]>((acc, item) => {
      if (typeof item !== 'string') return acc;
      const trimmed = item.trim();
      if (!trimmed || acc.includes(trimmed)) return acc;
      if (allowed && !allowed.has(trimmed)) return acc;
      acc.push(trimmed);
      return acc;
    }, []);

    return normalized.length > 0 ? normalized : undefined;
  }

  private migrateData(
    data: SiteDataType,
    sourceVersion = this.getSavedLocalVersion(),
    persistLocalVersion = true,
  ): { data: SiteDataType; changed: boolean } {
    const savedVersion = sourceVersion;
    const accountMenuMigration = this.ensureAccountMenuSite(data);
    let nextData = accountMenuMigration.data;
    let changed = accountMenuMigration.changed;

    const blogDashboardMigration = this.ensureBlogDashboardSite(nextData);
    nextData = blogDashboardMigration.data;
    changed = changed || blogDashboardMigration.changed;

    const retiredMenuCleanup = this.cleanupRetiredMenuItems(nextData);
    nextData = retiredMenuCleanup.data;
    changed = changed || retiredMenuCleanup.changed;

    if (!Number.isFinite(savedVersion) || savedVersion < this.CURRENT_DATA_VERSION) {
      const migrationResult = this.applyCorpBusinessTemplate(nextData);
      nextData = migrationResult.data;
      changed = changed || migrationResult.changed;

      const corpHomeCleanup = this.cleanupCorpHomeMenu(nextData);
      nextData = corpHomeCleanup.data;
      changed = changed || corpHomeCleanup.changed;

      const adminMigration = this.applyAdminOpenRouterMenu(nextData);
      nextData = adminMigration.data;
      changed = changed || adminMigration.changed;

      const storyboardStudioMigration = this.applyAdminStoryboardStudioMenu(nextData);
      nextData = storyboardStudioMigration.data;
      changed = changed || storyboardStudioMigration.changed;

      const emoticonStudioMigration = this.applyAdminEmoticonStudioMenu(nextData);
      nextData = emoticonStudioMigration.data;
      changed = changed || emoticonStudioMigration.changed;

      const openRouterUsageMigration = this.applyAdminOpenRouterUsageMenu(nextData);
      nextData = openRouterUsageMigration.data;
      changed = changed || openRouterUsageMigration.changed;

      const photosMigration = this.applyAdminPhotosMenu(nextData);
      nextData = photosMigration.data;
      changed = changed || photosMigration.changed;

      const storageMigration = this.applyAdminStorageMenu(nextData);
      nextData = storageMigration.data;
      changed = changed || storageMigration.changed;

      const usersMigration = this.applyAdminUsersMenu(nextData);
      nextData = usersMigration.data;
      changed = changed || usersMigration.changed;

      const activityLogsMigration = this.applyAdminActivityLogsMenu(nextData);
      nextData = activityLogsMigration.data;
      changed = changed || activityLogsMigration.changed;

      const workspaceFilesCleanup = this.cleanupAdminWorkspaceFilesMenu(nextData);
      nextData = workspaceFilesCleanup.data;
      changed = changed || workspaceFilesCleanup.changed;

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

      const postHomeCorpCleanup = this.cleanupCorpHomeMenu(nextData);
      nextData = postHomeCorpCleanup.data;
      changed = changed || postHomeCorpCleanup.changed;

      const propigMigration = this.applyPropigSelfManagementMenu(nextData);
      nextData = propigMigration.data;
      changed = changed || propigMigration.changed;

      const propigMemoMigration = this.applyPropigMemoMenu(nextData);
      nextData = propigMemoMigration.data;
      changed = changed || propigMemoMigration.changed;

      const deprecatedPropigPageMigration = this.cleanupDeprecatedPropigPageMenus(nextData);
      nextData = deprecatedPropigPageMigration.data;
      changed = changed || deprecatedPropigPageMigration.changed;

      if (persistLocalVersion && typeof window !== 'undefined') {
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

    const workspaceFilesCleanup = this.cleanupAdminWorkspaceFilesMenu(nextData);
    nextData = workspaceFilesCleanup.data;
    changed = changed || workspaceFilesCleanup.changed;

    const storyboardStudioSync = this.applyAdminStoryboardStudioMenu(nextData);
    nextData = storyboardStudioSync.data;
    changed = changed || storyboardStudioSync.changed;

    const emoticonStudioSync = this.applyAdminEmoticonStudioMenu(nextData);
    nextData = emoticonStudioSync.data;
    changed = changed || emoticonStudioSync.changed;

    const corpBusinessTemplateSync = this.applyCorpBusinessTemplate(nextData);
    nextData = corpBusinessTemplateSync.data;
    changed = changed || corpBusinessTemplateSync.changed;

    const corpHomeCleanup = this.cleanupCorpHomeMenu(nextData);
    nextData = corpHomeCleanup.data;
    changed = changed || corpHomeCleanup.changed;

    return { data: nextData, changed };
  }

  private cleanupRetiredMenuItems(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    let nextData = data;
    let changed = false;

    for (const [siteId, site] of Object.entries(data)) {
      const menuCleanup = this.removeRetiredMenuItems(site.menu);
      const trashCleanup = this.removeRetiredMenuItems(site.trash);

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

  private removeRetiredMenuItems(items: MenuItem[]): { items: MenuItem[]; changed: boolean } {
    let changed = false;
    const nextItems: MenuItem[] = [];

    for (const item of items) {
      if (
        this.RETIRED_MENU_ITEM_IDS.has(item.id) ||
        (typeof item.path === 'string' && this.RETIRED_MENU_PATHS.has(item.path))
      ) {
        changed = true;
        continue;
      }

      if (!item.sub || !Array.isArray(item.sub)) {
        nextItems.push(item);
        continue;
      }

      const nextSub: (string | MenuItem)[] = [];
      for (const subItem of item.sub) {
        if (typeof subItem === 'string') {
          nextSub.push(subItem);
          continue;
        }

        const nestedCleanup = this.removeRetiredMenuItems([subItem]);
        changed = changed || nestedCleanup.changed;
        nextSub.push(...nestedCleanup.items);
      }

      nextItems.push({
        ...item,
        sub: nextSub,
      });
    }

    return { items: nextItems, changed };
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

  private createDefaultBlogSite(): SiteData {
    return {
      name: '블로그',
      icon: 'pen-nib',
      color: '#f59e0b',
      positions: ['ceo', 'manager', 'staff'],
      menu: [{ ...DEFAULT_SITE_HOME_MENU_ITEMS.blog }],
      trash: [],
    };
  }

  private ensureBlogDashboardSite(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const defaultHome = DEFAULT_SITE_HOME_MENU_ITEMS.blog;
    const blogSite = data.blog;

    if (!blogSite) {
      return {
        data: {
          ...data,
          blog: this.createDefaultBlogSite(),
        },
        changed: true,
      };
    }

    const existingIndex = blogSite.menu.findIndex(
      (item) => item.id === defaultHome.id || item.path === defaultHome.path,
    );
    const existingHome = existingIndex >= 0 ? blogSite.menu[existingIndex] : undefined;
    const nextHome: MenuItem = {
      ...existingHome,
      ...defaultHome,
      roles: existingHome?.roles ?? defaultHome.roles,
      position: existingHome?.position ?? defaultHome.position,
    };
    const nextMenu = [
      nextHome,
      ...blogSite.menu.filter((item, index) => index !== existingIndex && item.id !== defaultHome.id && item.path !== defaultHome.path),
    ];
    const nextBlogSite: SiteData = {
      ...blogSite,
      menu: nextMenu,
    };

    if (JSON.stringify(nextBlogSite) === JSON.stringify(blogSite)) {
      return { data, changed: false };
    }

    return {
      data: {
        ...data,
        blog: nextBlogSite,
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

  private cleanupCorpHomeMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const corpSite = data.corp;
    if (!corpSite) {
      return { data, changed: false };
    }

    const nextMenu = corpSite.menu.filter((item) => item.id !== 'corp-home' && item.path !== '/corp');
    if (nextMenu.length === corpSite.menu.length) {
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
      roles: [],
      position: [],
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
      if (templateItem.id === 'corp-partnership') {
        const requiresPartnershipNormalization =
          existingItem.text !== templateItem.text ||
          existingItem.path !== templateItem.path ||
          existingItem.icon !== templateItem.icon ||
          existingItem.type !== templateItem.type ||
          Boolean(existingItem.sub?.length);

        if (requiresPartnershipNormalization) {
          const normalizedPartnershipItem: MenuItem = {
            ...existingItem,
            text: templateItem.text,
            path: templateItem.path,
            icon: templateItem.icon,
            type: templateItem.type,
          };
          delete normalizedPartnershipItem.sub;
          nextMenu[existingIndex] = normalizedPartnershipItem;
          changed = true;
        }
        continue;
      }

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

      const existingPathIndex = existingItems.findIndex(
        (item, index) =>
          !usedExistingIndexes.has(index) &&
          typeof item !== 'string' &&
          Boolean(item.path && templateChild.path && item.path === templateChild.path),
      );
      const existingIndex =
        existingPathIndex >= 0
          ? existingPathIndex
          : existingItems.findIndex(
              (item, index) =>
                !usedExistingIndexes.has(index) &&
                typeof item !== 'string' &&
                !this.isDeprecatedCorpBusinessMenuItem(item) &&
                item.id === templateChild.id,
            );

      if (existingIndex >= 0) {
        const existingItem = existingItems[existingIndex];
        nextSub.push(
          typeof existingItem === 'string'
            ? existingItem
            : {
                ...existingItem,
                text: templateChild.text,
                path: templateChild.path,
                icon: templateChild.icon,
                type: templateChild.type,
              },
        );
        usedExistingIndexes.add(existingIndex);
        continue;
      }

      nextSub.push(this.normalizeMenuItems([templateChild])[0]);
    }

    existingItems.forEach((item, index) => {
      if (!usedExistingIndexes.has(index) && !this.isDeprecatedCorpBusinessMenuItem(item)) {
        nextSub.push(item);
      }
    });

    const seenKeys = new Set<string>();
    const dedupedSub: NonNullable<MenuItem['sub']> = [];
    let dedupedChanged = false;

    for (const item of nextSub) {
      const key =
        typeof item === 'string'
          ? `string:${item}`
          : item.id
            ? `id:${item.id}`
            : item.path
              ? `path:${item.path}`
              : '';

      if (key && seenKeys.has(key)) {
        dedupedChanged = true;
        continue;
      }

      if (key) {
        seenKeys.add(key);
      }
      dedupedSub.push(item);
    }

    const changed =
      dedupedChanged ||
      dedupedSub.length !== existingItems.length ||
      dedupedSub.some((item, index) => item !== existingItems[index]);

    return { sub: dedupedSub, changed };
  }

  private isDeprecatedCorpCompanyMenuItem(item: string | MenuItem): boolean {
    if (typeof item === 'string') return false;
    if (item.path && this.CURRENT_CORP_COMPANY_MENU_PATHS.has(item.path)) {
      return false;
    }
    return (
      this.DEPRECATED_CORP_COMPANY_MENU_ITEM_IDS.has(item.id) ||
      Boolean(item.path && this.DEPRECATED_CORP_COMPANY_MENU_PATHS.has(item.path))
    );
  }

  private isDeprecatedCorpBusinessMenuItem(item: string | MenuItem): boolean {
    if (this.isDeprecatedCorpCompanyMenuItem(item)) return true;
    if (typeof item === 'string') return false;

    return item.id === 'corp-career-1' || item.path === '/corp/careers/talent';
  }

  private menuTreeContains(
    items: MenuItem[],
    predicate: (item: MenuItem) => boolean,
  ): boolean {
    return items.some((item) => {
      if (predicate(item)) return true;
      const childItems = (item.sub || []).filter((subItem): subItem is MenuItem => typeof subItem !== 'string');
      return childItems.length > 0 && this.menuTreeContains(childItems, predicate);
    });
  }

  private siteHasMenuTarget(site: SiteData, id: string, path?: string): boolean {
    const matchesTarget = (item: MenuItem) => item.id === id || Boolean(path && item.path === path);
    return this.menuTreeContains(site.menu, matchesTarget) || this.menuTreeContains(site.trash, matchesTarget);
  }

  private migrateOpenRouterMenuItems(items: MenuItem[]): { items: MenuItem[]; changed: boolean } {
    let changed = false;

    const nextItems = items.map((item) => {
      let nextSub = item.sub;
      if (item.sub?.some((subItem) => typeof subItem !== 'string')) {
        const nestedItems = item.sub.filter((subItem): subItem is MenuItem => typeof subItem !== 'string');
        const nestedMigration = this.migrateOpenRouterMenuItems(nestedItems);
        if (nestedMigration.changed) {
          let nestedIndex = 0;
          nextSub = item.sub.map((subItem) =>
            typeof subItem === 'string' ? subItem : nestedMigration.items[nestedIndex++],
          );
          changed = true;
        }
      }

      const isOpenRouterMenu = item.id === 'admin-8';
      if (!isOpenRouterMenu) {
        return nextSub === item.sub ? item : { ...item, sub: nextSub };
      }

      changed = true;
      return {
        ...item,
        text: 'OpenRouter 운영 센터',
        path: '/admin/openrouter-settings',
        ...(nextSub ? { sub: nextSub } : {}),
      };
    });

    return { items: nextItems, changed };
  }

  private applyAdminOpenRouterMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const menuMigration = this.migrateOpenRouterMenuItems(adminSite.menu);
    const trashMigration = this.migrateOpenRouterMenuItems(adminSite.trash);
    if (menuMigration.changed || trashMigration.changed) {
      return {
        data: {
          ...data,
          admin: {
            ...adminSite,
            menu: menuMigration.items,
            trash: trashMigration.items,
          },
        },
        changed: true,
      };
    }

    const exists = this.siteHasMenuTarget(adminSite, 'admin-8', '/admin/openrouter-settings');
    if (exists) {
      return { data, changed: false };
    }

    const openRouterMenu: MenuItem = {
      id: 'admin-8',
      text: 'OpenRouter 운영 센터',
      path: '/admin/openrouter-settings',
      icon: 'key',
      type: 'link',
      roles: ['admin'],
      position: ['ceo', 'manager'],
      badge: 'AI',
    };

    const dividerIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = dividerIndex >= 0 ? dividerIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, openRouterMenu);

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

  private applyAdminOpenRouterUsageMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = this.siteHasMenuTarget(adminSite, 'admin-19', '/admin/openrouter-usage');
    if (exists) {
      return { data, changed: false };
    }

    const usageMenu: MenuItem = {
      id: 'admin-19',
      text: 'OpenRouter 사용량',
      path: '/admin/openrouter-usage',
      icon: 'chart-line',
      type: 'link',
      roles: ['admin'],
      position: ['ceo', 'manager'],
      badge: 'USAGE',
    };

    const settingsIndex = adminSite.menu.findIndex(
      (item) => item.id === 'admin-8' || item.path === '/admin/openrouter-settings',
    );
    const insertIndex = settingsIndex >= 0 ? settingsIndex + 1 : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, usageMenu);

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

  private applyAdminStoryboardStudioMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = this.siteHasMenuTarget(adminSite, 'admin-21', '/admin/storyboard');
    if (exists) {
      return { data, changed: false };
    }

    const storyboardStudioMenu: MenuItem = {
      id: 'admin-21',
      text: '스토리보드 영상 제작',
      path: '/admin/storyboard',
      icon: 'clapperboard',
      type: 'link',
      roles: ['admin'],
      position: ['ceo', 'manager'],
      badge: 'VIDEO',
    };

    const dividerIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = dividerIndex >= 0 ? dividerIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, storyboardStudioMenu);

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

  private applyAdminEmoticonStudioMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = this.siteHasMenuTarget(adminSite, 'admin-22', '/admin/emoticon-studio');
    if (exists) {
      return { data, changed: false };
    }

    const emoticonStudioMenu: MenuItem = {
      id: 'admin-22',
      text: '반자동 이모티콘 스튜디오',
      path: '/admin/emoticon-studio',
      icon: 'wand-magic-sparkles',
      type: 'link',
      roles: ['admin'],
      position: ['ceo', 'manager'],
      badge: 'CHATGPT',
    };

    const storyboardIndex = adminSite.menu.findIndex(
      (item) => item.id === 'admin-21' || item.path === '/admin/storyboard',
    );
    const dividerIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = storyboardIndex >= 0
      ? storyboardIndex + 1
      : dividerIndex >= 0
        ? dividerIndex
        : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, emoticonStudioMenu);

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

    const exists = this.siteHasMenuTarget(adminSite, 'admin-9', '/admin/photos');
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

    const exists = this.siteHasMenuTarget(adminSite, 'admin-11', '/admin/storage');
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

    const exists = this.siteHasMenuTarget(adminSite, 'admin-13', '/admin/users');
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

  private applyAdminActivityLogsMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    const adminSite = data.admin;
    if (!adminSite) {
      return { data, changed: false };
    }

    const exists = this.siteHasMenuTarget(adminSite, 'admin-17', '/admin/activity-logs');
    if (exists) {
      return { data, changed: false };
    }

    const activityLogsMenu: MenuItem = {
      id: 'admin-17',
      text: '작업 히스토리',
      path: '/admin/activity-logs',
      icon: 'clock-rotate-left',
      type: 'link',
      roles: ['admin'],
      position: ['ceo', 'manager'],
      badge: 'LOG',
    };

    const usersIndex = adminSite.menu.findIndex((item) => item.id === 'admin-13' || item.path === '/admin/users');
    const targetIndex = adminSite.menu.findIndex((item) => item.id === 'admin-divider-1');
    const insertIndex = usersIndex >= 0 ? usersIndex + 1 : targetIndex >= 0 ? targetIndex : adminSite.menu.length;
    const nextMenu = [...adminSite.menu];
    nextMenu.splice(insertIndex, 0, activityLogsMenu);

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

  private cleanupAdminWorkspaceFilesMenu(data: SiteDataType): { data: SiteDataType; changed: boolean } {
    let nextData = data;
    let changed = false;

    for (const [siteId, site] of Object.entries(data)) {
      const menuCleanup = this.removeAdminWorkspaceFilesMenuItems(site.menu);
      const trashCleanup = this.removeAdminWorkspaceFilesMenuItems(site.trash);

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

  private removeAdminWorkspaceFilesMenuItems(items: MenuItem[]): { items: MenuItem[]; changed: boolean } {
    let changed = false;
    const nextItems: MenuItem[] = [];

    for (const item of items) {
      if (item.id === 'admin-18' || item.path === '/admin/workspace-files') {
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

          const cleanupResult = this.removeAdminWorkspaceFilesMenuItems([subItem]);
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

    const exists = this.siteHasMenuTarget(adminSite, 'admin-14', '/habit-tracker');
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

    const exists = this.siteHasMenuTarget(adminSite, 'admin-15', '/bucket-list');
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

    const exists = this.siteHasMenuTarget(adminSite, 'admin-16', '/todo-list');
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

  private getCorpCompanyTemplateMenuItems(): MenuItem[] {
    return COMPANY_MENU_ITEMS.map((item) => ({
      id: `corp-company-intro-${item.id}`,
      text: item.label,
      path: item.href,
      icon: item.icon,
      type: 'link',
      roles: [],
    }));
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
        sub: this.getCorpCompanyTemplateMenuItems(),
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
        path: '/corp/partnership/business',
        icon: 'handshake',
        type: 'link',
        roles: [],
        position: ['ceo', 'manager', 'staff'],
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
            id: 'admin-21',
            text: '스토리보드 영상 제작',
            path: '/admin/storyboard',
            icon: 'clapperboard',
            type: 'link',
            roles: ['admin'],
            position: ['ceo', 'manager'],
            badge: 'VIDEO',
          },
          {
            id: 'admin-22',
            text: '반자동 이모티콘 스튜디오',
            path: '/admin/emoticon-studio',
            icon: 'wand-magic-sparkles',
            type: 'link',
            roles: ['admin'],
            position: ['ceo', 'manager'],
            badge: 'CHATGPT',
          },
          {
            id: 'admin-8',
            text: 'OpenRouter 운영 센터',
            path: '/admin/openrouter-settings',
            icon: 'key',
            type: 'link',
            roles: ['admin'],
            position: ['ceo', 'manager'],
            badge: 'AI',
          },
          {
            id: 'admin-19',
            text: 'OpenRouter 사용량',
            path: '/admin/openrouter-usage',
            icon: 'chart-line',
            type: 'link',
            roles: ['admin'],
            position: ['ceo', 'manager'],
            badge: 'USAGE',
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
            id: 'admin-17',
            text: '작업 히스토리',
            path: '/admin/activity-logs',
            icon: 'clock-rotate-left',
            type: 'link',
            roles: ['admin'],
            position: ['ceo', 'manager'],
            badge: 'LOG',
          },
          {
            id: 'admin-10',
            text: '세무관리',
            path: '/admin/tax/purchase-sales/full-inquiry',
            icon: 'calculator',
            type: 'link',
            roles: [],
            position: [],
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
      blog: this.createDefaultBlogSite(),
      corp: {
        name: '기업 관리',
        icon: 'building',
        color: '#6366f1',
        positions: ['ceo', 'manager', 'staff'],
        menu: this.getCorpBusinessTemplateMenu(),
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
      const normalizedData = this.normalizeMenuData(data);
      const cleanedData = this.cleanupRetiredMenuItems(normalizedData).data;

      if (!validateAllSites(cleanedData)) {
        throw new Error('Invalid data structure');
      }

      await this.saveRemoteSites(cleanedData);
      this.liveSnapshotRevision++;
      this.persistLocal(cleanedData);
      this.rememberSites(cleanedData);
      this.notifyAllSubscribers(cleanedData);
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
