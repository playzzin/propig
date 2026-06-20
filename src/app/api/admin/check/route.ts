import { NextResponse, type NextRequest } from 'next/server';
import admin, { db as adminDb } from '@/lib/firebase-admin';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import {
  DEFAULT_USER_PERMISSIONS,
  USER_PERMISSION_KEYS,
  USER_POSITION_OPTIONS,
  USER_ROLE_OPTIONS,
  type ManagedUserPermissions,
  type ManagedUserPosition,
  type ManagedUserRole,
  type ManagedUserMenuAccess,
  type ManagedUserSiteAccess,
} from '@/types/userAccess';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const allPermissions = (): ManagedUserPermissions =>
  USER_PERMISSION_KEYS.reduce<ManagedUserPermissions>(
    (acc, key) => ({ ...acc, [key]: true }),
    { ...DEFAULT_USER_PERMISSIONS },
  );

const normalizeRole = (value: unknown, fallback: ManagedUserRole): ManagedUserRole =>
  USER_ROLE_OPTIONS.includes(value as ManagedUserRole) ? (value as ManagedUserRole) : fallback;

const normalizePosition = (value: unknown): ManagedUserPosition =>
  USER_POSITION_OPTIONS.includes(value as ManagedUserPosition)
    ? (value as ManagedUserPosition)
    : 'ceo';

const normalizeSiteAccess = (value: unknown): ManagedUserSiteAccess => {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<ManagedUserSiteAccess>((acc, [siteId, enabled]) => {
    if (siteId.trim()) {
      acc[siteId] = enabled === true;
    }
    return acc;
  }, {});
};

const normalizeMenuAccess = (value: unknown): ManagedUserMenuAccess => {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<ManagedUserMenuAccess>((acc, [menuKey, enabled]) => {
    if (menuKey.trim()) {
      acc[menuKey] = enabled === true;
    }
    return acc;
  }, {});
};

const normalizePermissions = (role: ManagedUserRole, value: unknown): ManagedUserPermissions => {
  if (role === 'admin') return allPermissions();
  const source = isRecord(value) ? value : {};
  return {
    menuManagement: source.menuManagement === true,
    userManagement: source.userManagement === true,
    projectBoardManagement: source.projectBoardManagement === true,
    photoManagement: source.photoManagement === true,
    storageManagement: source.storageManagement === true,
  };
};

export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);

  if (!authResult.ok) {
    return NextResponse.json({ ok: false, message: authResult.message }, { status: authResult.status });
  }

  const [authUser, adminDoc, userAccessDoc] = await Promise.all([
    admin.auth().getUser(authResult.uid).catch(() => null),
    adminDb.collection('admins').doc(authResult.uid).get().catch(() => null),
    adminDb.collection('userAccess').doc(authResult.uid).get().catch(() => null),
  ]);
  const claims = (authUser?.customClaims ?? {}) as Record<string, unknown>;
  const adminData = adminDoc?.exists ? adminDoc.data() ?? {} : {};
  const accessData = userAccessDoc?.exists ? userAccessDoc.data() ?? {} : {};
  const role = normalizeRole(accessData.role ?? adminData.role ?? claims.role, 'admin');
  const position = normalizePosition(accessData.position ?? adminData.position ?? claims.position);
  const siteAccess = {
    ...normalizeSiteAccess(claims.siteAccess),
    ...normalizeSiteAccess(adminData.siteAccess),
    ...normalizeSiteAccess(accessData.siteAccess),
  };
  const menuAccess = {
    ...normalizeMenuAccess(claims.menuAccess),
    ...normalizeMenuAccess(adminData.menuAccess),
    ...normalizeMenuAccess(accessData.menuAccess),
  };
  const permissions = normalizePermissions(
    role,
    accessData.permissions ?? adminData.permissions ?? claims.permissions,
  );

  return NextResponse.json({
    ok: true,
    uid: authResult.uid,
    email: authResult.email ?? authUser?.email ?? null,
    role,
    position,
    siteAccess,
    menuAccess,
    permissions,
    canWriteFirestore: Boolean(adminDoc?.exists || claims.admin === true || claims.role === 'admin'),
  });
}
