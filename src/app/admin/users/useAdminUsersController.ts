'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { auth } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUserAccess } from '@/hooks/useCurrentUserAccess';
import type { ManagedUserRecord } from '@/types/userAccess';
import { buildDraft, changeSummary, equalDraft, userAckSchema, usersPageSchema, type UserDraft, type UsersPage } from './userManagementModel';

// UID equality alone cannot distinguish A → B → A while Context is still on A.
let authGeneration = 0;
let observedUid: string | null = null;
let stopAuth: (() => void) | undefined;
const authListeners = new Set<() => void>();
function authSnapshot() { return `${authGeneration}:${auth.currentUser?.uid ?? ''}`; }
function subscribeAuth(listener: () => void) {
  authListeners.add(listener);
  if (!stopAuth) {
    observedUid = auth.currentUser?.uid ?? null;
    stopAuth = onAuthStateChanged(auth, user => {
      const uid = user?.uid ?? null;
      if (uid !== observedUid) {
        observedUid = uid;
        authGeneration += 1;
        for (const notify of authListeners) notify();
      }
    });
  }
  return () => {
    authListeners.delete(listener);
    if (!authListeners.size) { stopAuth?.(); stopAuth = undefined; }
  };
}
export function useAdminUsersSession() {
  const authentication = useAuth();
  const accessQuery = useCurrentUserAccess();
  const sdkSession = useSyncExternalStore(subscribeAuth, authSnapshot, () => 'server');
  const currentUser = authentication.currentUser;
  const loading = authentication.loading || accessQuery.isLoading || sdkSession === 'server';
  const isFullAdmin = accessQuery.access.role === 'admin';
  const allowed = !loading && !accessQuery.error && Boolean(currentUser) &&
    currentUser?.uid === auth.currentUser?.uid && currentUser?.uid === accessQuery.currentUser?.uid &&
    (isFullAdmin || accessQuery.access.permissions.userManagement === true);
  // Loading/authority transitions unmount the editor; restored authority gets a fresh instance.
  return { ...authentication, accessQuery, sdkSession, loading, allowed, isFullAdmin,
    sessionKey: `${sdkSession}:${currentUser?.uid ?? ''}:${accessQuery.access.role}:${accessQuery.access.permissions.userManagement}` };
}

class StaleRequest extends Error {}
class RequestFailure extends Error {
  constructor(message: string, readonly uncertain = false, readonly reloadRequired = false) { super(message); }
}
export const ADMIN_USERS_DEADLINE_MS = 20_000;
type Editor = { identity: symbol; uid: string; source: ManagedUserRecord; base: UserDraft; draft: UserDraft; revision: number };
type CurrentUser = NonNullable<ReturnType<typeof useAuth>['currentUser']>;

export function useAdminUsersController({ currentUser, sdkSession, isFullAdmin, siteIds, permissionManagedMenuKeys }: {
  currentUser: CurrentUser; sdkSession: string; isFullAdmin: boolean; siteIds: string[]; permissionManagedMenuKeys: Set<string>;
}) {
  const queryClient = useQueryClient();
  const instanceId = useId();
  // Invitation review resolves the exact account rather than searching only the first Auth page.
  const [targetUid] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('uid') ?? '');
  const queryKey = useMemo(() => ['admin-users', currentUser.uid, sdkSession, instanceId, targetUid] as const, [currentUser.uid, sdkSession, instanceId, targetUid]);
  const lifecycle = useRef({ live: false, generation: 0 });
  const controllers = useRef(new Set<AbortController>());
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const refreshLock = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [uncertainUsers, setUncertainUsers] = useState<Record<string, string>>({});
  const uncertainRef = useRef<Record<string, string>>({});
  const dirty = Boolean(editor && !equalDraft(editor.base, editor.draft));
  const summary = editor ? changeSummary(editor.base, editor.draft) : [];

  const isLive = useCallback((generation: number) => lifecycle.current.live && lifecycle.current.generation === generation &&
    auth.currentUser?.uid === currentUser.uid && authSnapshot() === sdkSession, [currentUser.uid, sdkSession]);
  useLayoutEffect(() => {
    lifecycle.current.live = true;
    lifecycle.current.generation += 1;
    const invalidate = () => {
      lifecycle.current.live = false;
      lifecycle.current.generation += 1;
      for (const controller of controllers.current) controller.abort();
      void queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.removeQueries({ queryKey, exact: true });
    };
    const unsubscribe = subscribeAuth(invalidate);
    return () => { unsubscribe(); invalidate(); };
  }, [queryClient, queryKey]);

  // Deadline starts BEFORE token acquisition and also bounds JSON decoding.
  const request = useCallback(async (path: string, body?: { uid: string; expectedRevision: string } & UserDraft, signal?: AbortSignal) => {
    const generation = lifecycle.current.generation;
    const controller = new AbortController();
    controllers.current.add(controller);
    let submitted = false;
    const assert = () => { if (!isLive(generation) || controller.signal.aborted) throw new StaleRequest(); };
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    const stopped = new Promise<never>((_, reject) => {
      abortListener = () => reject(new StaleRequest());
      controller.signal.addEventListener('abort', abortListener, { once: true });
      timer = setTimeout(() => {
        reject(new RequestFailure(body ? '저장 응답 시간이 초과되었습니다. 서버 반영 여부를 단정할 수 없습니다. 새로고침으로 상태를 확인하세요.' : '목록 요청 시간이 초과되었습니다. 다시 시도해 주세요.', Boolean(body)));
        controller.abort();
      }, ADMIN_USERS_DEADLINE_MS);
    });
    try {
      return await Promise.race([stopped, (async () => {
        assert();
        const token = await currentUser.getIdToken();
        assert();
        submitted = Boolean(body);
        const response = await fetch(path, {
          method: body ? 'PATCH' : 'GET', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        assert();
        const payload: unknown = await response.json();
        assert();
        if (!response.ok) {
          const error = payload as { code?: string; error?: string };
          const uncertain = Boolean(body && (error?.code === 'USER_UPDATE_UNCERTAIN' || response.status >= 500));
          const reloadRequired = Boolean(body && ['USER_UPDATE_CONFLICT', 'USER_UPDATE_IN_PROGRESS', 'USER_UPDATE_ACTOR_UNSAFE'].includes(error?.code ?? ''));
          throw new RequestFailure(uncertain ? '일부 변경이 반영되었을 수 있습니다. 다시 저장하지 말고 새로고침으로 계정 상태를 확인하세요.' :
            (typeof error?.error === 'string' ? error.error : '요청을 처리하지 못했습니다.'), uncertain, reloadRequired);
        }
        return payload;
      })()]);
    } catch (error) {
      if (error instanceof StaleRequest || error instanceof RequestFailure) throw error;
      throw new RequestFailure(body && submitted ? '연결 또는 응답 확인에 실패했습니다. 서버 반영 여부를 새로고침으로 확인하세요.' : '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.', Boolean(body && submitted));
    } finally {
      clearTimeout(timer);
      if (abortListener) controller.signal.removeEventListener('abort', abortListener);
      signal?.removeEventListener('abort', abort);
      controllers.current.delete(controller);
    }
  }, [currentUser, isLive]);

  const usersQuery = useInfiniteQuery({
    queryKey, initialPageParam: null as string | null, retry: false, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async ({ pageParam, signal }) => {
      const generation = lifecycle.current.generation;
      const result = usersPageSchema.parse(await request(`/api/admin/users${targetUid ? `?uid=${encodeURIComponent(targetUid)}` : pageParam ? `?pageToken=${encodeURIComponent(pageParam)}` : ''}`, undefined, signal));
      if (!isLive(generation)) throw new StaleRequest();
      return result;
    },
    getNextPageParam: (page, pages) => page.nextPageToken && !pages.slice(0, -1).some(previous => previous.nextPageToken === page.nextPageToken) ? page.nextPageToken : undefined,
  });
  const users = useMemo(() => [...new Map((usersQuery.data?.pages ?? []).flatMap(page => page.users).map(user => [user.uid, user])).values()], [usersQuery.data]);
  const selectedUser = editor ? users.find(user => user.uid === editor.uid) ?? editor.source : null;
  const canEditSelectedUser = Boolean(selectedUser && (isFullAdmin || (selectedUser.uid !== currentUser.uid && selectedUser.role !== 'admin')));
  const selectedUid = editor?.uid ?? '';
  const selectedIdentity = editor?.identity;
  const uncertain = uncertainUsers[selectedUid] ?? '';

  const publish = (next: Editor | null) => { editorRef.current = next; setEditor(next); };
  const confirmLeave = () => {
    if (saveLock.current) return window.confirm('저장 요청이 진행 중입니다. 화면을 떠나도 서버에서 반영될 수 있습니다. 이동할까요?');
    const value = editorRef.current;
    return !value || equalDraft(value.base, value.draft) || window.confirm('저장하지 않은 변경 사항을 버릴까요?');
  };
  const selectUser = (uid: string) => {
    if (!isLive(lifecycle.current.generation) || uid === editorRef.current?.uid || !confirmLeave()) return false;
    const user = users.find(item => item.uid === uid);
    if (!user) return false;
    const draft = buildDraft(user, siteIds);
    publish({ identity: Symbol(uid), uid, source: user, base: draft, draft, revision: 0 });
    setSaveError('');
    return true;
  };
  const closeEditor = () => { if (confirmLeave()) { publish(null); setSaveError(''); return true; } return false; };
  // Every handler is bound to the rendered selected UID; a same-tick selection cannot write its old draft to a new target.
  const setDraft = (update: (previous: UserDraft | null) => UserDraft | null) => {
    const value = editorRef.current;
    if (!isLive(lifecycle.current.generation) || !value || value.identity !== selectedIdentity || !canEditSelectedUser || refreshLock.current) return;
    const next = update(value.draft);
    if (!next || (value.uid === currentUser.uid && (next.disabled || (value.source.role === 'admin' && next.role !== 'admin'))) || (!isFullAdmin && next.role === 'admin')) return;
    publish({ ...value, draft: next, revision: value.revision + 1 });
  };
  const discardDraft = () => {
    if (saveLock.current || !confirmLeave()) return;
    const value = editorRef.current;
    if (value) publish({ ...value, draft: value.base, revision: value.revision + 1 });
    setSaveError('');
  };

  const handleSave = async () => {
    const value = editorRef.current;
    const generation = lifecycle.current.generation;
    if (saveLock.current || refreshLock.current || usersQuery.isFetching || !isLive(generation) || !value || value.identity !== selectedIdentity || !canEditSelectedUser ||
      uncertainRef.current[value.uid] || equalDraft(value.base, value.draft) || usersQuery.data?.pages[0]?.storage.canPersist === false) return;
    if (value.uid === currentUser.uid && (value.draft.disabled || (value.source.role === 'admin' && value.draft.role !== 'admin'))) return;
    if (!isFullAdmin && (value.uid === currentUser.uid || value.source.role === 'admin' || value.draft.role === 'admin')) return;
    const risks = [value.draft.role === 'admin' && value.base.role !== 'admin' ? '관리자로 승격하면 모든 사이트와 관리 기능에 접근할 수 있습니다.' : '',
      value.draft.permissions.userManagement && !value.base.permissions.userManagement ? '유저 관리 권한을 부여하면 다른 사용자 계정과 권한을 관리할 수 있습니다.' : '',
      value.draft.disabled && !value.base.disabled ? '계정을 비활성화하면 이 사용자의 로그인이 차단됩니다.' : ''].filter(Boolean);
    if (risks.length && !window.confirm(`${value.source.displayName || value.source.email || value.uid}\nUID: ${value.uid}\n${risks.join('\n')}\n이 변경을 저장할까요?`)) return;
    // Synchronous lock: not React pending state, and always before the first await.
    saveLock.current = true;
    setSaving(true); setSaveError('');
    const submitted: UserDraft = { ...value.draft, menuAccess: Object.fromEntries(Object.entries(value.draft.menuAccess).filter(([key]) => !permissionManagedMenuKeys.has(key))) };
    try {
      const raw = await request('/api/admin/users', { uid: value.uid, expectedRevision: value.source.revision, ...submitted });
      if (!isLive(generation)) return;
      const parsed = userAckSchema.safeParse(raw);
      if (!parsed.success || parsed.data.user.uid !== value.uid) throw new RequestFailure('저장 확인 응답이 올바르지 않습니다. 새로고침으로 서버 상태를 확인하세요.', true);
      const payload = parsed.data;
      queryClient.setQueryData<InfiniteData<UsersPage, string | null>>(queryKey, previous => previous && ({
        ...previous, pages: previous.pages.map(page => ({ ...page, storage: payload.storage, users: page.users.map(user => user.uid === payload.user.uid ? payload.user : user) })),
      }));
      const latest = editorRef.current;
      // A close/reopen of the same UID is a distinct editor, too.
      if (latest && latest.identity === value.identity) {
        const base = buildDraft(payload.user, siteIds);
        publish({ ...latest, source: payload.user, base, draft: latest.revision === value.revision ? base : latest.draft });
        toast.success(latest.revision === value.revision ? '사용자 권한을 저장했습니다.' : '요청한 변경을 저장했습니다. 저장 중 수정한 초안은 남아 있습니다.');
      }
    } catch (error) {
      if (!isLive(generation) || error instanceof StaleRequest) return;
      const message = error instanceof Error ? error.message : '저장에 실패했습니다.';
      if (error instanceof RequestFailure && (error.uncertain || error.reloadRequired)) {
        uncertainRef.current = { ...uncertainRef.current, [value.uid]: message };
        setUncertainUsers(uncertainRef.current);
      }
      if (editorRef.current?.identity === value.identity) { setSaveError(message); toast.error(message); }
    } finally {
      if (isLive(generation)) { saveLock.current = false; setSaving(false); }
    }
  };

  const refresh = async () => {
    if (refreshLock.current || saveLock.current || !confirmLeave()) return;
    const generation = lifecycle.current.generation;
    refreshLock.current = true; setRefreshing(true);
    try {
      const result = await usersQuery.refetch();
      if (!isLive(generation) || result.isError || !result.data) return;
      const loaded = new Map(result.data.pages.flatMap(page => page.users).map(user => [user.uid, user]));
      uncertainRef.current = Object.fromEntries(Object.entries(uncertainRef.current).filter(([uid]) => !loaded.has(uid)));
      setUncertainUsers(uncertainRef.current);
      const latest = editorRef.current;
      if (latest) {
        const user = loaded.get(latest.uid);
        if (user) { const draft = buildDraft(user, siteIds); publish({ identity: latest.identity, uid: user.uid, source: user, base: draft, draft, revision: latest.revision + 1 }); }
        else { publish(null); }
      }
      setSaveError('');
    } finally { if (isLive(generation)) { refreshLock.current = false; setRefreshing(false); } }
  };

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const value = editorRef.current;
      if (saveLock.current || (value && !equalDraft(value.base, value.draft))) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  return { targetUid, usersQuery, users, selectedUser, selectedUid, draft: editor?.draft ?? null, setDraft, selectUser, closeEditor, confirmLeave,
    canEditSelectedUser: canEditSelectedUser && !refreshing, dirty, summary, saving, saveError, uncertain,
    handleSave, refresh, refreshing, discardDraft, storage: usersQuery.data?.pages[0]?.storage };
}
