import { NextResponse, type NextRequest } from 'next/server';
import admin, { db as adminDb } from '@/lib/firebase-admin';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import {
  USER_POSITION_OPTIONS,
  type ManagedUserPosition,
  type ManagedUserMenuAccess,
  type ManagedUserSiteAccess,
} from '@/types/userAccess';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);


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
  const role = authResult.role;
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
  const permissions = authResult.permissions;

  return NextResponse.json({
    ok: true,
    uid: authResult.uid,
    email: authResult.email ?? authUser?.email ?? null,
    role,
    position,
    siteAccess,
    menuAccess,
    permissions,
    canWriteFirestore: true,
  });
}
