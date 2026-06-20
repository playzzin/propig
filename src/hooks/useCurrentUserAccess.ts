'use client';

import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase/config';
import {
  DEFAULT_USER_PERMISSIONS,
  USER_PERMISSION_KEYS,
  USER_POSITION_OPTIONS,
  USER_ROLE_OPTIONS,
  type ManagedUserAccess,
  type ManagedUserMenuAccess,
  type ManagedUserPermissions,
  type ManagedUserPosition,
  type ManagedUserRole,
  type ManagedUserSiteAccess,
} from '@/types/userAccess';

type UserAccessDoc = Partial<ManagedUserAccess>;
type ServerAccessPayload = Partial<ManagedUserAccess> & {
  ok?: boolean;
};

const ACCESS_CHECK_TIMEOUT_MS = 7000;

const allPermissions = (): ManagedUserPermissions =>
  USER_PERMISSION_KEYS.reduce<ManagedUserPermissions>(
    (acc, key) => ({ ...acc, [key]: true }),
    { ...DEFAULT_USER_PERMISSIONS },
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeRole = (value: unknown, fallback: ManagedUserRole): ManagedUserRole =>
  USER_ROLE_OPTIONS.includes(value as ManagedUserRole) ? (value as ManagedUserRole) : fallback;

const normalizePosition = (value: unknown): ManagedUserPosition =>
  USER_POSITION_OPTIONS.includes(value as ManagedUserPosition)
    ? (value as ManagedUserPosition)
    : 'staff';

const normalizeSiteAccess = (value: unknown): ManagedUserSiteAccess => {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<ManagedUserSiteAccess>((acc, [siteId, enabled]) => {
    if (!siteId.trim()) return acc;
    acc[siteId] = enabled === true;
    return acc;
  }, {});
};

const normalizeMenuAccess = (value: unknown): ManagedUserMenuAccess => {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<ManagedUserMenuAccess>((acc, [menuKey, enabled]) => {
    if (!menuKey.trim()) return acc;
    acc[menuKey] = enabled === true;
    return acc;
  }, {});
};

async function withAccessTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), ACCESS_CHECK_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchServerAccess(token: string): Promise<ServerAccessPayload | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ACCESS_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch('/api/admin/check', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return (await response.json()) as ServerAccessPayload;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

const normalizePermissions = (
  role: ManagedUserRole,
  value: unknown,
  customClaims: Record<string, unknown>,
): ManagedUserPermissions => {
  if (role === 'admin') return allPermissions();

  const source = isRecord(value) ? value : {};
  return {
    menuManagement:
      source.menuManagement === true ||
      customClaims.menuManager === true ||
      customClaims.menuManagement === true,
    userManagement:
      source.userManagement === true ||
      customClaims.userManager === true ||
      customClaims.userManagement === true,
    projectBoardManagement:
      source.projectBoardManagement === true ||
      customClaims.projectBoardManager === true ||
      customClaims.projectBoardManagement === true,
    photoManagement:
      source.photoManagement === true ||
      customClaims.photoManager === true ||
      customClaims.photoManagement === true,
    storageManagement:
      source.storageManagement === true ||
      customClaims.storageManager === true ||
      customClaims.storageManagement === true,
  };
};

export function useCurrentUserAccess() {
  const { currentUser, loading } = useAuth();

  const query = useQuery<ManagedUserAccess>({
    queryKey: ['current-user-access', currentUser?.uid ?? 'anonymous'],
    enabled: Boolean(currentUser),
    retry: false,
    queryFn: async () => {
      if (!currentUser) {
        return {
          role: 'guest',
          position: 'staff',
          siteAccess: {},
          menuAccess: {},
          permissions: { ...DEFAULT_USER_PERMISSIONS },
        };
      }

      const tokenResult = await withAccessTimeout(currentUser.getIdTokenResult(false).catch(() => null), null);
      const serverAccessRequest = tokenResult?.token ? fetchServerAccess(tokenResult.token) : Promise.resolve(null);

      const [accessDoc, adminDoc, serverAccess] = await Promise.all([
        withAccessTimeout(getDoc(doc(db, 'userAccess', currentUser.uid)).catch(() => null), null),
        withAccessTimeout(getDoc(doc(db, 'admins', currentUser.uid)).catch(() => null), null),
        serverAccessRequest,
      ]);
      const claims = (tokenResult?.claims ?? {}) as Record<string, unknown>;
      const access = accessDoc?.exists() ? (accessDoc.data() as UserAccessDoc) : {};
      const hasAdminAuthority =
        claims.admin === true ||
        claims.role === 'admin' ||
        adminDoc?.exists() === true ||
        serverAccess?.role === 'admin';
      const role = normalizeRole(access.role ?? serverAccess?.role ?? claims.role, hasAdminAuthority ? 'admin' : 'user');

      return {
        role,
        position: normalizePosition(access.position ?? serverAccess?.position ?? claims.position),
        siteAccess: {
          ...normalizeSiteAccess(claims.siteAccess),
          ...normalizeSiteAccess(serverAccess?.siteAccess),
          ...normalizeSiteAccess(access.siteAccess),
        },
        menuAccess: {
          ...normalizeMenuAccess(claims.menuAccess),
          ...normalizeMenuAccess(serverAccess?.menuAccess),
          ...normalizeMenuAccess(access.menuAccess),
        },
        permissions: normalizePermissions(role, access.permissions ?? serverAccess?.permissions ?? claims.permissions, claims),
      };
    },
  });

  return {
    currentUser,
    isLoading: loading || (Boolean(currentUser) && query.isLoading),
    access:
      query.data ??
      ({
        role: currentUser ? 'user' : 'guest',
        position: 'staff',
        siteAccess: {},
        menuAccess: {},
        permissions: { ...DEFAULT_USER_PERMISSIONS },
      } satisfies ManagedUserAccess),
    error: query.error,
    refetch: query.refetch,
  };
}
