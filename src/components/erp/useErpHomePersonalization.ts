'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { fetchErpHomePreferences, saveErpHomePreferences } from '@/services/erpHomePreferenceService';

export type ModuleDomain = 'admin' | 'corporate' | 'workflow' | 'ai';
export type PreferenceSyncState = 'local' | 'checking' | 'syncing' | 'synced' | 'error';

export interface PreferenceSyncStatus {
  state: PreferenceSyncState;
  label: string;
  detail: string;
}

interface UseErpHomePersonalizationOptions<TModule> {
  currentUser: User | null;
  modulesByHref: ReadonlyMap<string, TModule>;
}

const ERP_PINNED_MODULES_STORAGE_KEY = 'erp-home:pinned-module-hrefs';
const ERP_RECENT_MODULES_STORAGE_KEY = 'erp-home:recent-module-hrefs';
export const ERP_RECENT_COMMANDS_STORAGE_KEY = 'erp-home:recent-command-ids:v1';
const ERP_DOMAIN_FILTER_STORAGE_KEY = 'erp-home:module-domain-filter:v1';

export const PERSONAL_MODULE_LIMIT = 6;
export const RECENT_MODULE_LIMIT = 4;
export const RECENT_COMMAND_LIMIT = 5;

const LOCAL_SYNC_STATUS: PreferenceSyncStatus = {
  state: 'local',
  label: '로컬 저장',
  detail: '이 기기에 저장됩니다.',
};

export function readStoredHrefList(key: string): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function writeStoredHrefList(key: string, hrefs: string[]): boolean {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(key, JSON.stringify(hrefs));
    return true;
  } catch {
    return false;
  }
}

export function moveHrefToFront(hrefs: string[], href: string, limit: number): string[] {
  return [href, ...hrefs.filter((item) => item !== href)].slice(0, limit);
}

function isModuleDomain(value: string | null): value is ModuleDomain {
  return value === 'admin' || value === 'corporate' || value === 'workflow' || value === 'ai';
}

function readStoredModuleDomain(): ModuleDomain | null {
  if (typeof window === 'undefined') return null;

  try {
    const storedValue = window.localStorage.getItem(ERP_DOMAIN_FILTER_STORAGE_KEY);
    return isModuleDomain(storedValue) ? storedValue : null;
  } catch {
    return null;
  }
}

function writeStoredModuleDomain(domain: ModuleDomain): boolean {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(ERP_DOMAIN_FILTER_STORAGE_KEY, domain);
    return true;
  } catch {
    return false;
  }
}

function mergeHrefLists(limit: number, ...hrefLists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const hrefList of hrefLists) {
    for (const href of hrefList) {
      if (!href || seen.has(href)) continue;
      seen.add(href);
      merged.push(href);
      if (merged.length >= limit) return merged;
    }
  }

  return merged;
}

function areHrefListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((href, index) => href === right[index]);
}

export function useErpHomePersonalization<TModule>({
  currentUser,
  modulesByHref,
}: UseErpHomePersonalizationOptions<TModule>) {
  const [activeModuleDomain, setActiveModuleDomain] = useState<ModuleDomain>('workflow');
  const [pinnedModuleHrefs, setPinnedModuleHrefs] = useState<string[]>([]);
  const [recentModuleHrefs, setRecentModuleHrefs] = useState<string[]>([]);
  const [preferenceSyncStatus, setPreferenceSyncStatus] = useState<PreferenceSyncStatus>(LOCAL_SYNC_STATUS);

  const pinnedModuleHrefSet = useMemo(() => new Set(pinnedModuleHrefs), [pinnedModuleHrefs]);
  const pinnedModules = useMemo(
    () => pinnedModuleHrefs.map((href) => modulesByHref.get(href)).filter((module): module is TModule => Boolean(module)),
    [modulesByHref, pinnedModuleHrefs],
  );
  const recentModules = useMemo(
    () =>
      recentModuleHrefs
        .filter((href) => !pinnedModuleHrefSet.has(href))
        .map((href) => modulesByHref.get(href))
        .filter((module): module is TModule => Boolean(module)),
    [modulesByHref, pinnedModuleHrefSet, recentModuleHrefs],
  );
  const hasPersonalModules = pinnedModules.length > 0 || recentModules.length > 0;

  const getKnownModuleHrefs = useCallback(
    (hrefs: string[], limit = PERSONAL_MODULE_LIMIT) => hrefs.filter((href) => modulesByHref.has(href)).slice(0, limit),
    [modulesByHref],
  );

  const persistPinnedModuleHrefs = useCallback(
    (nextHrefs: string[]) => {
      const normalizedHrefs = getKnownModuleHrefs(nextHrefs);
      const savedLocally = writeStoredHrefList(ERP_PINNED_MODULES_STORAGE_KEY, normalizedHrefs);

      if (!currentUser) {
        setPreferenceSyncStatus(
          savedLocally
            ? LOCAL_SYNC_STATUS
            : { state: 'error', label: '로컬 저장 실패', detail: '브라우저 저장소를 사용할 수 없습니다.' },
        );
        return;
      }

      setPreferenceSyncStatus({
        state: 'syncing',
        label: '동기화 중',
        detail: savedLocally ? '계정 선호도에 저장 중입니다.' : '계정 저장은 진행 중이며, 로컬 저장은 제한되었습니다.',
      });

      void saveErpHomePreferences(currentUser, normalizedHrefs)
        .then(() => {
          setPreferenceSyncStatus({
            state: 'synced',
            label: '서버 동기화됨',
            detail: savedLocally ? '로그인 계정에 저장되었습니다.' : '계정에는 저장됐지만 로컬 저장은 제한되었습니다.',
          });
        })
        .catch((error) => {
          console.warn('[ERP Home] Failed to sync pinned modules:', error);
          setPreferenceSyncStatus({
            state: 'error',
            label: '동기화 실패',
            detail: savedLocally ? '로컬 저장은 유지됩니다.' : '브라우저와 서버 저장에 실패했습니다.',
          });
        });
    },
    [currentUser, getKnownModuleHrefs],
  );

  useEffect(() => {
    const storageTimer = window.setTimeout(() => {
      const storedDomain = readStoredModuleDomain();
      if (storedDomain) setActiveModuleDomain(storedDomain);
      setPinnedModuleHrefs(readStoredHrefList(ERP_PINNED_MODULES_STORAGE_KEY).slice(0, PERSONAL_MODULE_LIMIT));
      setRecentModuleHrefs(readStoredHrefList(ERP_RECENT_MODULES_STORAGE_KEY).slice(0, RECENT_MODULE_LIMIT));
    }, 0);

    return () => window.clearTimeout(storageTimer);
  }, []);

  useEffect(() => {
    if (currentUser) return undefined;

    const statusTimer = window.setTimeout(() => {
      setPreferenceSyncStatus(LOCAL_SYNC_STATUS);
    }, 0);

    return () => window.clearTimeout(statusTimer);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;

    const controller = new AbortController();
    const statusTimer = window.setTimeout(() => {
      setPreferenceSyncStatus({
        state: 'checking',
        label: '서버 확인 중',
        detail: '계정 선호도를 불러오고 있습니다.',
      });
    }, 0);

    void fetchErpHomePreferences(currentUser, controller.signal)
      .then((preferences) => {
        if (controller.signal.aborted) return;

        const localHrefs = readStoredHrefList(ERP_PINNED_MODULES_STORAGE_KEY);
        const remoteHrefs = getKnownModuleHrefs(preferences.pinnedModuleHrefs);
        const mergedHrefs = getKnownModuleHrefs(mergeHrefLists(PERSONAL_MODULE_LIMIT, localHrefs, remoteHrefs));

        setPinnedModuleHrefs(mergedHrefs);
        const savedLocally = writeStoredHrefList(ERP_PINNED_MODULES_STORAGE_KEY, mergedHrefs);

        if (!areHrefListsEqual(mergedHrefs, remoteHrefs)) {
          setPreferenceSyncStatus({
            state: 'syncing',
            label: '동기화 중',
            detail: '로컬 바로가기를 계정에 반영 중입니다.',
          });
          void saveErpHomePreferences(currentUser, mergedHrefs)
            .then(() => {
              if (controller.signal.aborted) return;
              setPreferenceSyncStatus({
                state: 'synced',
                label: '서버 동기화됨',
                detail: savedLocally ? '계정과 이 기기가 같은 바로가기를 사용합니다.' : '계정에는 저장됐지만 로컬 저장은 제한되었습니다.',
              });
            })
            .catch((error) => {
              if (controller.signal.aborted) return;
              console.warn('[ERP Home] Failed to backfill pinned modules:', error);
              setPreferenceSyncStatus({
                state: 'error',
                label: '동기화 실패',
                detail: savedLocally ? '로컬 바로가기는 유지됩니다.' : '브라우저와 서버 저장에 실패했습니다.',
              });
            });
          return;
        }

        setPreferenceSyncStatus({
          state: savedLocally ? 'synced' : 'error',
          label: savedLocally ? '서버 동기화됨' : '로컬 저장 실패',
          detail: savedLocally ? '계정 선호도를 불러왔습니다.' : '계정 선호도는 확인했지만 이 기기에는 저장하지 못했습니다.',
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn('[ERP Home] Failed to load pinned modules:', error);
          setPreferenceSyncStatus({
            state: 'error',
            label: '동기화 실패',
            detail: '로컬 바로가기로 계속 사용할 수 있습니다.',
          });
        }
      });

    return () => {
      window.clearTimeout(statusTimer);
      controller.abort();
    };
  }, [currentUser, getKnownModuleHrefs]);

  const togglePinnedModule = useCallback(
    (href: string) => {
      setPinnedModuleHrefs((current) => {
        const next = current.includes(href)
          ? current.filter((item) => item !== href)
          : moveHrefToFront(current, href, PERSONAL_MODULE_LIMIT);
        const normalizedNext = getKnownModuleHrefs(next);
        persistPinnedModuleHrefs(normalizedNext);
        return normalizedNext;
      });
    },
    [getKnownModuleHrefs, persistPinnedModuleHrefs],
  );

  const rememberRecentModule = useCallback(
    (href: string) => {
      setRecentModuleHrefs((current) => {
        const next = getKnownModuleHrefs(moveHrefToFront(current, href, RECENT_MODULE_LIMIT), RECENT_MODULE_LIMIT);
        writeStoredHrefList(ERP_RECENT_MODULES_STORAGE_KEY, next);
        return next;
      });
    },
    [getKnownModuleHrefs],
  );

  const resetPersonalWorkspace = useCallback(() => {
    setPinnedModuleHrefs([]);
    setRecentModuleHrefs([]);
    const pinnedCleared = writeStoredHrefList(ERP_PINNED_MODULES_STORAGE_KEY, []);
    const recentCleared = writeStoredHrefList(ERP_RECENT_MODULES_STORAGE_KEY, []);

    if (currentUser) {
      setPreferenceSyncStatus({
        state: 'syncing',
        label: '초기화 동기화 중',
        detail: '계정 바로가기를 비우고 있습니다.',
      });
      void saveErpHomePreferences(currentUser, [])
        .then(() => {
          setPreferenceSyncStatus({
            state: 'synced',
            label: '초기화됨',
            detail: pinnedCleared && recentCleared ? '로컬과 계정 바로가기를 비웠습니다.' : '계정은 비웠지만 로컬 저장소는 제한되었습니다.',
          });
        })
        .catch((error) => {
          console.warn('[ERP Home] Failed to reset pinned modules:', error);
          setPreferenceSyncStatus({
            state: 'error',
            label: '초기화 동기화 실패',
            detail: pinnedCleared || recentCleared ? '로컬 바로가기는 비웠습니다.' : '브라우저와 서버 저장에 실패했습니다.',
          });
        });
      return;
    }

    setPreferenceSyncStatus(
      pinnedCleared && recentCleared
        ? { state: 'local', label: '초기화됨', detail: '이 기기의 바로가기를 비웠습니다.' }
        : { state: 'error', label: '초기화 실패', detail: '브라우저 저장소를 변경할 수 없습니다.' },
    );
  }, [currentUser]);

  const selectModuleDomain = useCallback((domain: ModuleDomain) => {
    setActiveModuleDomain(domain);
    writeStoredModuleDomain(domain);
  }, []);

  return {
    activeModuleDomain,
    pinnedModuleHrefs,
    recentModuleHrefs,
    preferenceSyncStatus,
    pinnedModuleHrefSet,
    pinnedModules,
    recentModules,
    hasPersonalModules,
    togglePinnedModule,
    rememberRecentModule,
    resetPersonalWorkspace,
    selectModuleDomain,
  };
}
