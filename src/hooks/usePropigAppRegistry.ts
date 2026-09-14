'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  uid: string | null;
  installedAppIds: PropigStoreAppId[];
}
const localKey = (uid: string | null) => uid ? `${LOCAL_STORAGE_KEY}:user:${encodeURIComponent(uid)}` : LOCAL_STORAGE_KEY;

function normalizeInstalledAppIds(value: unknown, fallback: PropigStoreAppId[]): PropigStoreAppId[] {
  if (!Array.isArray(value)) return fallback;
  return Array.from(new Set(value.filter(isAvailablePropigStoreAppId)));
}
function readLocalRegistry(uid: string | null): PropigStoreAppId[] {
  try {
    const raw = window.localStorage.getItem(localKey(uid));
    return raw ? normalizeInstalledAppIds(JSON.parse(raw), DEFAULT_PROPIG_INSTALLED_APP_IDS) : DEFAULT_PROPIG_INSTALLED_APP_IDS;
  } catch {
    return DEFAULT_PROPIG_INSTALLED_APP_IDS;
  }
}
function publishRegistry(uid: string | null, installedAppIds: PropigStoreAppId[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(localKey(uid), JSON.stringify(installedAppIds));
  } catch {
    // Restricted browsers retain session-only state; cloud ACK is still authoritative.
  }
  window.dispatchEvent(new CustomEvent<RegistryEventDetail>(REGISTRY_EVENT, { detail: { uid, installedAppIds } }));
}
function createRegistryRef(uid: string) {
  return doc(db, 'users', uid, 'propigStore', 'registration');
}
interface RegistryState {
  installedAppIds: PropigStoreAppId[];
  isLoading: boolean;
  isAwaitingServer: boolean;
  savingAppId: PropigStoreAppId | null;
  isSavingOrder: boolean;
  error: string | null;
}
function initialState(): RegistryState {
  return { installedAppIds: DEFAULT_PROPIG_INSTALLED_APP_IDS, isLoading: true, isAwaitingServer: false, savingAppId: null, isSavingOrder: false, error: null };
}

export function usePropigAppRegistry() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? null;
  // A new identity gets a fresh generation even for A -> B -> A. Never expose
  // the previous owner's state on the render before effect cleanup runs.
  const session = useMemo(() => ({
    uid, state: initialState(), ready: false, busy: false, active: false,
    loadFailed: false, loadGeneration: 0, hasSnapshot: false,
    bindSubscription: null as (() => void) | null,
  }), [uid]);
  const currentSession = useRef(session);
  currentSession.current = session;
  const [view, setView] = useState({ session, state: session.state });
  const state = view.session === session ? view.state : session.state;

  useEffect(() => {
    session.active = true;
    let alive = true;
    const current = () => alive && currentSession.current === session;
    const update = (patch: Partial<RegistryState>) => {
      if (!current()) return;
      session.state = { ...session.state, ...patch };
      setView({ session, state: session.state });
    };
    let unsubscribe: (() => void) | undefined;
    if (!uid) {
      session.ready = true;
      update({ installedAppIds: readLocalRegistry(uid), isLoading: false });
    } else {
      const bindSubscription = () => {
        if (!current()) return;
        // Invalidate before unsubscribe: even queued callbacks from the old
        // listener cannot make this attempt writable or replace its state.
        const generation = ++session.loadGeneration;
        session.ready = false;
        session.loadFailed = false;
        update({ isLoading: true, isAwaitingServer: false, error: null });
        const previousUnsubscribe = unsubscribe;
        unsubscribe = undefined;
        const currentLoad = () => current() && session.loadGeneration === generation && !session.loadFailed;
        const failLoad = (snapshotError: unknown) => {
          if (!currentLoad()) return;
          session.ready = false;
          session.loadFailed = true;
          console.warn('Failed to load propig app registry:', snapshotError);
          update({
            // Keep the last same-account view after a successful snapshot.
            ...(session.hasSnapshot || session.busy ? {} : { installedAppIds: readLocalRegistry(uid) }),
            isLoading: false,
            error: '앱 등록 정보를 불러오지 못했습니다.',
          });
        };
        try {
          previousUnsubscribe?.();
          unsubscribe = onSnapshot(createRegistryRef(uid), { includeMetadataChanges: true }, (snapshot) => {
            if (!currentLoad()) return;
            const isAwaitingServer = snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites;
            session.ready = !isAwaitingServer;
            session.hasSnapshot = true;
            update({ isAwaitingServer });
            // Local pending snapshots must not replace the saved rollback baseline.
            if (session.busy) return;
            const data = snapshot.exists() ? snapshot.data() as { installedAppIds?: unknown } : undefined;
            update({
              // A cache miss is not proof that the server registry is absent.
              ...(isAwaitingServer && !snapshot.exists() ? {} : {
                installedAppIds: normalizeInstalledAppIds(data?.installedAppIds, DEFAULT_PROPIG_INSTALLED_APP_IDS),
              }),
              isLoading: false, isAwaitingServer, error: null,
            });
          }, failLoad);
        } catch (snapshotError) {
          // Reference creation and synchronous listener setup failures are also
          // recoverable, without turning a failed read into a writable fallback.
          failLoad(snapshotError);
        }
      };
      session.bindSubscription = bindSubscription;
      bindSubscription();
    }
    const handleRegistryChange = (event: Event) => {
      const detail = (event as CustomEvent<RegistryEventDetail>).detail;
      if (!current() || !session.ready || session.busy || detail?.uid !== uid) return;
      update({ installedAppIds: normalizeInstalledAppIds(detail.installedAppIds, DEFAULT_PROPIG_INSTALLED_APP_IDS) });
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (!current() || !session.ready || session.busy || event.key !== localKey(uid)) return;
      update({ installedAppIds: readLocalRegistry(uid) });
    };
    window.addEventListener(REGISTRY_EVENT, handleRegistryChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      alive = false;
      session.active = false;
      session.ready = false;
      session.bindSubscription = null;
      ++session.loadGeneration;
      unsubscribe?.();
      window.removeEventListener(REGISTRY_EVENT, handleRegistryChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [session, uid]);

  const loadGeneration = session.loadGeneration;
  const canRetryLoad = Boolean(uid && session.active && session.loadFailed && !session.busy && !state.isLoading && !state.savingAppId && !state.isSavingOrder);
  // No-op when unavailable. Capture the attempt as well as the account session
  // so a retained handler cannot retry a later failure (even synchronously).
  const retryLoad = useCallback(() => {
    if (!uid || !session.active || currentSession.current !== session ||
      session.loadGeneration !== loadGeneration || !session.loadFailed ||
      session.busy || session.state.isLoading || session.state.savingAppId || session.state.isSavingOrder) return;
    session.bindSubscription?.();
  }, [session, uid, loadGeneration]);

  const saveInstalledAppIds = useCallback(async (
    transform: (ids: PropigStoreAppId[]) => PropigStoreAppId[],
    sourceAppId: PropigStoreAppId | null,
  ) => {
    const current = () => session.active && currentSession.current === session;
    if (!current() || !session.ready) throw new Error('앱 등록 정보를 먼저 불러와 주세요.');
    // Synchronous lock covers same-batch calls before React renders disabled UI.
    if (session.busy) throw new Error('앱 등록 정보를 저장 중입니다. 잠시 후 다시 시도해 주세요.');
    const previous = session.state.installedAppIds;
    const normalized = normalizeInstalledAppIds(transform(previous), []);
    if (normalized.length === previous.length && normalized.every((id, index) => id === previous[index])) return;
    session.busy = true;
    const update = (patch: Partial<RegistryState>) => {
      if (!current()) return;
      session.state = { ...session.state, ...patch };
      setView({ session, state: session.state });
    };
    update({ installedAppIds: normalized, savingAppId: sourceAppId, isSavingOrder: sourceAppId === null, error: null });
    try {
      if (uid) {
        await ensureFirestorePersistence();
        if (!current() || !session.ready) throw new Error('사용자 또는 앱 등록 상태가 변경되었습니다.');
        await setDoc(createRegistryRef(uid), { installedAppIds: normalized, updatedAt: serverTimestamp(), version: 1 }, { merge: true });
        if (!current()) throw new Error('사용자가 변경되었습니다.');
      }
      // Publish only after cloud ACK, never leak an optimistic failure to peers.
      publishRegistry(uid, normalized);
    } catch (saveError) {
      update({ installedAppIds: previous, error: '앱 등록 정보를 저장하지 못했습니다.' });
      throw saveError;
    } finally {
      session.busy = false;
      update({ savingAppId: null, isSavingOrder: false });
    }
  }, [session, uid]);

  const installApp = useCallback(async (appId: PropigStoreAppId) => {
    if (!isAvailablePropigStoreAppId(appId)) return;
    await saveInstalledAppIds(ids => ids.includes(appId) ? ids : [...ids, appId], appId);
  }, [saveInstalledAppIds]);
  const uninstallApp = useCallback(async (appId: PropigStoreAppId) => {
    if (!isAvailablePropigStoreAppId(appId)) return;
    await saveInstalledAppIds(ids => ids.filter(id => id !== appId), appId);
  }, [saveInstalledAppIds]);
  const toggleApp = useCallback(async (appId: PropigStoreAppId) => {
    if (!isAvailablePropigStoreAppId(appId)) return;
    await saveInstalledAppIds(ids => ids.includes(appId) ? ids.filter(id => id !== appId) : [...ids, appId], appId);
  }, [saveInstalledAppIds]);
  const reorderApps = useCallback(async (ids: PropigStoreAppId[]) => {
    await saveInstalledAppIds(() => ids, null);
  }, [saveInstalledAppIds]);
  const moveApp = useCallback(async (appId: PropigStoreAppId, direction: -1 | 1) => {
    await saveInstalledAppIds(ids => {
      const index = ids.indexOf(appId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return ids;
      const next = [...ids];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    }, null);
  }, [saveInstalledAppIds]);
  const installedAppIdSet = useMemo(() => new Set(state.installedAppIds), [state.installedAppIds]);
  const isInstalled = useCallback((appId: PropigStoreAppId) => installedAppIdSet.has(appId), [installedAppIdSet]);
  return { ...state, canRetryLoad, retryLoad, installedAppIdSet, isInstalled, installApp, uninstallApp, toggleApp, reorderApps, moveApp };
}
