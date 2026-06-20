'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db, ensureFirestorePersistence } from '@/firebase/config';
import {
  DEFAULT_PROPIG_INSTALLED_APP_IDS,
  isAvailablePropigStoreAppId,
  type PropigStoreAppId,
} from '@/constants/propigStore';

const LOCAL_STORAGE_KEY = 'propig:installed-apps:v1';
const REGISTRY_EVENT = 'propig-app-registry-change';

interface RegistryEventDetail {
  installedAppIds: PropigStoreAppId[];
}

function normalizeInstalledAppIds(value: unknown, fallback: PropigStoreAppId[]): PropigStoreAppId[] {
  if (!Array.isArray(value)) return fallback;
  return Array.from(new Set(value.filter(isAvailablePropigStoreAppId)));
}

function readLocalRegistry(): PropigStoreAppId[] {
  if (typeof window === 'undefined') return DEFAULT_PROPIG_INSTALLED_APP_IDS;

  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return DEFAULT_PROPIG_INSTALLED_APP_IDS;
    return normalizeInstalledAppIds(JSON.parse(raw), DEFAULT_PROPIG_INSTALLED_APP_IDS);
  } catch {
    return DEFAULT_PROPIG_INSTALLED_APP_IDS;
  }
}

function writeLocalRegistry(installedAppIds: PropigStoreAppId[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(installedAppIds));
  } catch {
    // Restricted browsers can still use the in-memory state for this session.
  }
}

function emitRegistryChange(installedAppIds: PropigStoreAppId[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RegistryEventDetail>(REGISTRY_EVENT, { detail: { installedAppIds } }));
}

function createRegistryRef(uid: string) {
  return doc(db, 'users', uid, 'propigStore', 'registration');
}

export function usePropigAppRegistry() {
  const { currentUser } = useAuth();
  const [installedAppIds, setInstalledAppIds] = useState<PropigStoreAppId[]>(DEFAULT_PROPIG_INSTALLED_APP_IDS);
  const [isLoading, setIsLoading] = useState(true);
  const [savingAppId, setSavingAppId] = useState<PropigStoreAppId | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setInstalledAppIds(readLocalRegistry());
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    const unsubscribe = onSnapshot(
      createRegistryRef(uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          setInstalledAppIds(DEFAULT_PROPIG_INSTALLED_APP_IDS);
          setIsLoading(false);
          setError(null);
          return;
        }

        const data = snapshot.data() as { installedAppIds?: unknown };
        setInstalledAppIds(normalizeInstalledAppIds(data.installedAppIds, DEFAULT_PROPIG_INSTALLED_APP_IDS));
        setIsLoading(false);
        setError(null);
      },
      (snapshotError) => {
        console.warn('Failed to load propig app registry:', snapshotError);
        setInstalledAppIds(readLocalRegistry());
        setIsLoading(false);
        setError('앱 등록 정보를 불러오지 못했습니다.');
      },
    );

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    const handleRegistryChange = (event: Event) => {
      const detail = (event as CustomEvent<RegistryEventDetail>).detail;
      setInstalledAppIds(normalizeInstalledAppIds(detail?.installedAppIds, DEFAULT_PROPIG_INSTALLED_APP_IDS));
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== LOCAL_STORAGE_KEY) return;
      setInstalledAppIds(readLocalRegistry());
    };

    window.addEventListener(REGISTRY_EVENT, handleRegistryChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener(REGISTRY_EVENT, handleRegistryChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const installedAppIdSet = useMemo(() => new Set(installedAppIds), [installedAppIds]);

  const saveInstalledAppIds = useCallback(
    async (nextInstalledAppIds: PropigStoreAppId[], sourceAppId: PropigStoreAppId | null) => {
      const normalized = normalizeInstalledAppIds(nextInstalledAppIds, []);
      setInstalledAppIds(normalized);
      setSavingAppId(sourceAppId);
      setIsSavingOrder(sourceAppId === null);
      setError(null);
      writeLocalRegistry(normalized);
      emitRegistryChange(normalized);

      if (!uid) {
        setSavingAppId(null);
        setIsSavingOrder(false);
        return;
      }

      try {
        await ensureFirestorePersistence();
        await setDoc(
          createRegistryRef(uid),
          {
            installedAppIds: normalized,
            updatedAt: serverTimestamp(),
            version: 1,
          },
          { merge: true },
        );
      } catch (saveError) {
        console.warn('Failed to save propig app registry:', saveError);
        setError('앱 등록 정보를 저장하지 못했습니다.');
      } finally {
        setSavingAppId(null);
        setIsSavingOrder(false);
      }
    },
    [uid],
  );

  const installApp = useCallback(
    async (appId: PropigStoreAppId) => {
      if (!isAvailablePropigStoreAppId(appId) || installedAppIdSet.has(appId)) return;
      await saveInstalledAppIds([...installedAppIds, appId], appId);
    },
    [installedAppIdSet, installedAppIds, saveInstalledAppIds],
  );

  const uninstallApp = useCallback(
    async (appId: PropigStoreAppId) => {
      if (!isAvailablePropigStoreAppId(appId) || !installedAppIdSet.has(appId)) return;
      await saveInstalledAppIds(installedAppIds.filter((installedAppId) => installedAppId !== appId), appId);
    },
    [installedAppIdSet, installedAppIds, saveInstalledAppIds],
  );

  const toggleApp = useCallback(
    async (appId: PropigStoreAppId) => {
      if (installedAppIdSet.has(appId)) {
        await uninstallApp(appId);
        return;
      }
      await installApp(appId);
    },
    [installApp, installedAppIdSet, uninstallApp],
  );

  const reorderApps = useCallback(
    async (nextInstalledAppIds: PropigStoreAppId[]) => {
      await saveInstalledAppIds(nextInstalledAppIds, null);
    },
    [saveInstalledAppIds],
  );

  const moveApp = useCallback(
    async (appId: PropigStoreAppId, direction: -1 | 1) => {
      const currentIndex = installedAppIds.indexOf(appId);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= installedAppIds.length) return;

      const nextInstalledAppIds = [...installedAppIds];
      [nextInstalledAppIds[currentIndex], nextInstalledAppIds[targetIndex]] = [
        nextInstalledAppIds[targetIndex],
        nextInstalledAppIds[currentIndex],
      ];
      await saveInstalledAppIds(nextInstalledAppIds, null);
    },
    [installedAppIds, saveInstalledAppIds],
  );

  const isInstalled = useCallback((appId: PropigStoreAppId) => installedAppIdSet.has(appId), [installedAppIdSet]);

  return {
    installedAppIds,
    installedAppIdSet,
    isLoading,
    savingAppId,
    isSavingOrder,
    error,
    isInstalled,
    installApp,
    uninstallApp,
    toggleApp,
    reorderApps,
    moveApp,
  };
}
