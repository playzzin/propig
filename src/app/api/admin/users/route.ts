import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { UserRecord } from 'firebase-admin/auth';
import { z } from 'zod';
import { managedUserRevision, reserveUserUpdate, finishUserUpdate, markUserUpdateUncertain,
  UserUpdateSafetyError, userAccessAudit, type UserUpdateGuard } from '@/lib/server/admin-user-update-safety';
import admin, { db as adminDb, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import { requireAdminOrPermissionAuth } from '@/lib/server/admin-auth';
import { writeActivityLogSafely } from '@/lib/server/activity-log';
import {
  DEFAULT_USER_PERMISSIONS,
  USER_PERMISSION_KEYS,
  USER_POSITION_OPTIONS,
  USER_ROLE_OPTIONS,
  type AdminUsersStorageStatus,
  type ManagedUserAccess,
  type ManagedUserMenuAccess,
  type ManagedUserPermissions,
  type ManagedUserRecord,
  type ManagedUserRole,
  type ManagedUserSiteAccess,
} from '@/types/userAccess';

export const dynamic = 'force-dynamic';

// Keep validation and paging contracts in parity with the other admin-users entrypoint.
const isSafeKey = (key: string, maxLength: number): boolean =>
  key.length > 0 && key.length <= maxLength && key === key.trim() &&
  !/[\u0000-\u001f\u007f]/.test(key) && !/^__.*__$/.test(key) &&
  key !== 'prototype' && !Object.prototype.hasOwnProperty.call(Object.prototype, key);
const booleanMap = (maxKeyLength: number) => z.record(
  z.string().refine((key) => isSafeKey(key, maxKeyLength)), z.boolean(),
).refine((value) => Object.keys(value).length <= 100).default({});
// Inspect raw own keys before Zod can strip prototype-related keys.
const safePayloadKeys = z.unknown().refine((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return [record, record.siteAccess, record.menuAccess, record.permissions].every((entry) =>
    !entry || typeof entry !== 'object' || Object.keys(entry).every((key) => isSafeKey(key, 160)),
  );
});
const PageQuerySchema = z.object({ pageToken: z.string().min(1).max(2048).optional(), uid: z.string().min(1).max(128).regex(/^[^/\x00-\x1f]+$/).optional() }).strict().refine(value => !(value.uid && value.pageToken));
const UPDATE_UNCERTAIN = {
  error: '변경이 일부 반영되었을 수 있습니다. 새로고침 후 상태를 확인하고 관리자에게 복구를 요청해 주세요.',
  code: 'USER_UPDATE_UNCERTAIN',
};
const errorCode = (error: unknown): string | undefined =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined;

const UpdateUserSchema = safePayloadKeys.pipe(z.object({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  uid: z.string().min(1).max(128).refine((uid) => isSafeKey(uid, 128) && !uid.includes('/') && uid !== '.' && uid !== '..'),
  role: z.enum(USER_ROLE_OPTIONS),
  position: z.enum(USER_POSITION_OPTIONS),
  siteAccess: booleanMap(80),
  menuAccess: booleanMap(160),
  permissions: z
    .object({
      menuManagement: z.boolean().optional(),
      userManagement: z.boolean().optional(),
      projectBoardManagement: z.boolean().optional(),
      photoManagement: z.boolean().optional(),
      storageManagement: z.boolean().optional(),
    }).strict()
    .default({}),
  disabled: z.boolean().optional(),
}).strict());

type UserAccessDoc = Partial<ManagedUserAccess> & {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  disabled?: boolean;
  emailVerified?: boolean;
  providerIds?: string[];
  updatedAt?: unknown;
  updatedBy?: string | null;
};

const USER_ACCESS_COLLECTION = 'userAccess';
const ADMINS_COLLECTION = 'admins';
const LIST_USERS_PAGE_SIZE = 100;
const json = (body: unknown, init: { status?: number } = {}) =>
  NextResponse.json(body, { ...init, headers: { 'Cache-Control': 'no-store' } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getStorageStatus = (): AdminUsersStorageStatus => {
  const status = getFirebaseAdminStatus();
  return {
    canPersist: status.canPersistToFirestore,
    credentialMode: status.credentialMode,
    message: status.message,
  };
};

const markStorageAvailable = (storage: AdminUsersStorageStatus): AdminUsersStorageStatus => ({
  ...storage,
  canPersist: true,
  message: null,
});

const normalizeRole = (value: unknown, fallback: ManagedUserRole = 'user'): ManagedUserRole => {
  return USER_ROLE_OPTIONS.includes(value as ManagedUserRole) ? (value as ManagedUserRole) : fallback;
};

const normalizePosition = (value: unknown) => {
  return USER_POSITION_OPTIONS.includes(value as (typeof USER_POSITION_OPTIONS)[number])
    ? (value as (typeof USER_POSITION_OPTIONS)[number])
    : 'staff';
};

const sanitizeSiteAccess = (value: unknown): ManagedUserSiteAccess => {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<ManagedUserSiteAccess>((acc, [siteId, enabled]) => {
    const normalizedSiteId = siteId.trim();
    if (!isSafeKey(normalizedSiteId, 80)) return acc;
    acc[normalizedSiteId] = enabled === true;
    return acc;
  }, {});
};

const sanitizeMenuAccess = (value: unknown): ManagedUserMenuAccess => {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<ManagedUserMenuAccess>((acc, [menuKey, enabled]) => {
    const normalizedMenuKey = menuKey.trim();
    if (!isSafeKey(normalizedMenuKey, 160)) return acc;
    acc[normalizedMenuKey] = enabled === true;
    return acc;
  }, {});
};

const normalizePermissions = (
  role: ManagedUserRole,
  value: unknown,
  customClaims: Record<string, unknown> = {},
): ManagedUserPermissions => {
  if (role === 'admin') {
    return USER_PERMISSION_KEYS.reduce<ManagedUserPermissions>(
      (acc, key) => ({ ...acc, [key]: true }),
      { ...DEFAULT_USER_PERMISSIONS },
    );
  }

  const permissionSource = isRecord(value) ? value : {};
  return {
    menuManagement:
      permissionSource.menuManagement === true ||
      customClaims.menuManager === true ||
      customClaims.menuManagement === true,
    userManagement:
      permissionSource.userManagement === true ||
      customClaims.userManager === true ||
      customClaims.userManagement === true,
    projectBoardManagement:
      permissionSource.projectBoardManagement === true ||
      customClaims.projectBoardManager === true ||
      customClaims.projectBoardManagement === true,
    photoManagement:
      permissionSource.photoManagement === true ||
      customClaims.photoManager === true ||
      customClaims.photoManagement === true,
    storageManagement:
      permissionSource.storageManagement === true ||
      customClaims.storageManager === true ||
      customClaims.storageManagement === true,
  };
};

const formatTimestamp = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (isRecord(value) && typeof value.toDate === 'function') {
    try {
      return (value.toDate as () => Date)().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') return value;
  return null;
};

const buildManagedUser = (
  user: UserRecord,
  accessDoc: UserAccessDoc | null,
  hasAdminDoc: boolean,
): ManagedUserRecord => {
  const customClaims = isRecord(user.customClaims) ? user.customClaims : {};
  const docPermissions = accessDoc?.permissions;
  const customSiteAccess = sanitizeSiteAccess(customClaims.siteAccess);
  const docSiteAccess = sanitizeSiteAccess(accessDoc?.siteAccess);
  const customMenuAccess = sanitizeMenuAccess(customClaims.menuAccess);
  const docMenuAccess = sanitizeMenuAccess(accessDoc?.menuAccess);
  const claimAdmin = customClaims.admin === true || customClaims.role === 'admin';
  const role: ManagedUserRole = claimAdmin || hasAdminDoc
    ? 'admin' : normalizeRole(accessDoc?.role ?? customClaims.role);
  const permissions = normalizePermissions(role, docPermissions ?? customClaims.permissions, customClaims);

  return {
    revision: managedUserRevision(user, accessDoc, hasAdminDoc),
    uid: user.uid,
    email: user.email ?? accessDoc?.email ?? null,
    displayName: user.displayName ?? accessDoc?.displayName ?? null,
    photoURL: user.photoURL ?? accessDoc?.photoURL ?? null,
    disabled: user.disabled,
    emailVerified: user.emailVerified,
    providerIds: user.providerData.map((provider) => provider.providerId),
    createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : null,
    lastSignInAt: user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toISOString() : null,
    role,
    position: normalizePosition(accessDoc?.position ?? customClaims.position),
    siteAccess: { ...customSiteAccess, ...docSiteAccess },
    menuAccess: { ...customMenuAccess, ...docMenuAccess },
    permissions,
    updatedAt: formatTimestamp(accessDoc?.updatedAt),
    updatedBy: typeof accessDoc?.updatedBy === 'string' ? accessDoc.updatedBy : null,
    isAdminDocLinked: hasAdminDoc,
  };
};

const loadAccessDocs = async (users: UserRecord[]) => {
  const empty = {
    accessDocs: new Map<string, UserAccessDoc>(),
    adminDocs: new Set<string>(),
  };

  if (users.length === 0) return empty;

  const accessRefs = users.map((user) => adminDb.collection(USER_ACCESS_COLLECTION).doc(user.uid));
  const adminRefs = users.map((user) => adminDb.collection(ADMINS_COLLECTION).doc(user.uid));
  const [accessSnapshots, adminSnapshots] = await Promise.all([
    adminDb.getAll(...accessRefs),
    adminDb.getAll(...adminRefs),
  ]);

  const accessDocs = new Map<string, UserAccessDoc>();
  const adminDocs = new Set<string>();

  accessSnapshots.forEach((snapshot) => {
    if (snapshot.exists) {
      accessDocs.set(snapshot.id, snapshot.data() as UserAccessDoc);
    }
  });

  adminSnapshots.forEach((snapshot) => {
    if (snapshot.exists) {
      adminDocs.add(snapshot.id);
    }
  });

  return { accessDocs, adminDocs };
};

const sortUsers = (users: ManagedUserRecord[]): ManagedUserRecord[] =>
  [...users].sort((a, b) => {
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (a.role !== 'admin' && b.role === 'admin') return 1;
    return (a.email || a.displayName || a.uid).localeCompare(b.email || b.displayName || b.uid);
  });

export async function GET(request: NextRequest) {
  const authResult = await requireAdminOrPermissionAuth(request, 'userManagement');
  if (!authResult.ok) {
    return json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    const query = request.nextUrl.searchParams;
    const payload = PageQuerySchema.safeParse(Object.fromEntries(query));
    if (!payload.success || query.getAll('pageToken').length > 1 || query.getAll('uid').length > 1) {
      return json({ error: '목록 조회 조건이 올바르지 않습니다.' }, { status: 400 });
    }
    const page = payload.data.uid
      ? { users: [await admin.auth().getUser(payload.data.uid)], pageToken: undefined }
      : await admin.auth().listUsers(LIST_USERS_PAGE_SIZE, payload.data.pageToken);
    const authUsers = page.users;
    // Never display editable fallback permissions when authoritative documents cannot be read.
    const { accessDocs, adminDocs } = await loadAccessDocs(authUsers);
    const storage = markStorageAvailable(getStorageStatus());

    const users = sortUsers(
      authUsers.map((user) => buildManagedUser(user, accessDocs.get(user.uid) ?? null, adminDocs.has(user.uid))),
    );

    return json({ users, storage, nextPageToken: page.pageToken ?? null });
  } catch (error) {
    console.error('[Admin Users GET Error]', error);
    return json(
      { error: errorCode(error) === 'auth/user-not-found' ? '사용자를 찾을 수 없습니다.' : errorCode(error) === 'auth/invalid-page-token' ? '목록 조회 조건이 올바르지 않습니다.' : '사용자 목록 저장소에 연결할 수 없습니다.' },
      { status: errorCode(error) === 'auth/user-not-found' ? 404 : errorCode(error) === 'auth/invalid-page-token' ? 400 : 503 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAdminOrPermissionAuth(request, 'userManagement');
  if (!authResult.ok) {
    return json({ error: authResult.message }, { status: authResult.status });
  }

  let mutationStarted = false;
  let updateGuard: UserUpdateGuard | undefined;
  try {
    let body: unknown;
    try { body = await request.json(); } catch {
      return json({ error: '요청 데이터가 올바르지 않습니다.' }, { status: 400 });
    }
    if (isRecord(body) && !Object.prototype.hasOwnProperty.call(body, 'expectedRevision')) {
      throw new UserUpdateSafetyError('USER_UPDATE_CONFLICT');
    }
    const payload = UpdateUserSchema.safeParse(body);
    if (!payload.success) {
      return json(
        { error: '요청 데이터가 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    const { uid, role, position, disabled } = payload.data;
    if (authResult.isAdmin && uid === authResult.uid && (role !== 'admin' || disabled === true)) {
      return json(
        { error: '현재 로그인한 관리자 계정의 관리자 권한 해제 또는 비활성화는 허용되지 않습니다.' },
        { status: 400 },
      );
    }

    if (!authResult.isAdmin && uid === authResult.uid) {
      return json(
        { error: '사용자 관리 권한으로는 본인 계정 권한을 변경할 수 없습니다.' },
        { status: 400 },
      );
    }

    const accessRef = adminDb.collection(USER_ACCESS_COLLECTION).doc(uid);
    const adminRef = adminDb.collection(ADMINS_COLLECTION).doc(uid);
    const [targetUser, existingAccessSnapshot, existingAdminSnapshot] = await Promise.all([
      admin.auth().getUser(uid),
      accessRef.get(),
      adminRef.get(),
    ]);
    const storage = markStorageAvailable(getStorageStatus());
    const existingAccess = existingAccessSnapshot.exists ? (existingAccessSnapshot.data() as UserAccessDoc) : null;
    const beforeUser = buildManagedUser(targetUser, existingAccess, existingAdminSnapshot.exists);
    if (beforeUser.revision !== payload.data.expectedRevision) {
        throw new UserUpdateSafetyError('USER_UPDATE_CONFLICT');
    }
    const existingClaims = isRecord(targetUser.customClaims) ? targetUser.customClaims : {};
    const targetIsAdmin =
      existingClaims.admin === true ||
      existingClaims.role === 'admin' ||
      existingAccess?.role === 'admin' ||
      existingAdminSnapshot.exists;

    if (!authResult.isAdmin && (targetIsAdmin || role === 'admin')) {
      return json(
        { error: '사용자 관리 권한으로는 관리자 계정을 변경하거나 관리자 역할을 부여할 수 없습니다.' },
        { status: 403 },
      );
    }

    const permissions = normalizePermissions(role, payload.data.permissions);
    const siteAccess = sanitizeSiteAccess(payload.data.siteAccess);
    const menuAccess = sanitizeMenuAccess(payload.data.menuAccess);
    const nextClaims = {
      ...existingClaims,
      admin: role === 'admin',
      role,
      position,
      siteAccess,
      menuAccess,
      permissions,
      ...permissions,
      menuManager: permissions.menuManagement,
      userManager: permissions.userManagement,
      projectBoardManager: permissions.projectBoardManagement,
      photoManager: permissions.photoManagement,
      storageManager: permissions.storageManagement,
    };

    if (Buffer.byteLength(JSON.stringify(nextClaims), 'utf8') > 1000) {
      return json({ error: '권한 데이터가 Firebase custom claims 한도(1000바이트)를 초과합니다.' }, { status: 400 });
    }


    updateGuard = await reserveUserUpdate(adminDb, uid, payload.data.expectedRevision, beforeUser.revision,
      async (transaction) => {
        const currentAuth = await admin.auth().getUser(uid);
        const [currentAccess, currentAdmin] = await Promise.all([
          transaction.get(accessRef), transaction.get(adminRef),
        ]);
        return managedUserRevision(currentAuth, currentAccess.exists ? currentAccess.data() : null, currentAdmin.exists);
      });

    // Auth and Firestore are not atomic: even a rejected write may have reached the service.
    mutationStarted = true;
    if (typeof disabled === 'boolean' && disabled !== targetUser.disabled) {
      await admin.auth().updateUser(uid, { disabled });
    }

    await admin.auth().setCustomUserClaims(uid, nextClaims);

    const updatedUser = await admin.auth().getUser(uid);
    const providerIds = updatedUser.providerData.map((provider) => provider.providerId);
    const batch = adminDb.batch();

    batch.set(
      accessRef,
      {
        uid,
        email: updatedUser.email ?? null,
        displayName: updatedUser.displayName ?? null,
        photoURL: updatedUser.photoURL ?? null,
        disabled: updatedUser.disabled,
        emailVerified: updatedUser.emailVerified,
        providerIds,
        role,
        position,
        siteAccess,
        menuAccess,
        permissions,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: authResult.uid,
      },
      { mergeFields: ['uid', 'email', 'displayName', 'photoURL', 'disabled', 'emailVerified',
        'providerIds', 'role', 'position', 'siteAccess', 'menuAccess', 'permissions', 'updatedAt', 'updatedBy'] },
    );

    if (role === 'admin') {
      batch.set(
        adminRef,
        {
          uid,
          email: updatedUser.email ?? null,
          displayName: updatedUser.displayName ?? null,
          photoURL: updatedUser.photoURL ?? null,
          role,
          position,
          menuAccess,
          permissions,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: authResult.uid,
        },
        { mergeFields: ['uid', 'email', 'displayName', 'photoURL', 'role', 'position',
          'menuAccess', 'permissions', 'updatedAt', 'updatedBy'] },
      );
    } else {
      batch.delete(adminRef);
    }

    await batch.commit();

    const [accessSnapshot, adminSnapshot] = await Promise.all([accessRef.get(), adminRef.get()]);
    const user = buildManagedUser(
      updatedUser,
      accessSnapshot.exists ? (accessSnapshot.data() as UserAccessDoc) : null,
      adminSnapshot.exists,
    );

    await finishUserUpdate(adminDb, updateGuard);
    updateGuard = undefined;

    await writeActivityLogSafely({
      auth: authResult,
      request,
      action: 'admin.user.update',
      target: {
        type: USER_ACCESS_COLLECTION,
        id: uid,
        label: updatedUser.email ?? updatedUser.displayName ?? uid,
      },
      summary: `${updatedUser.email ?? uid} 계정 권한을 변경했습니다.`,
      metadata: {
        before: userAccessAudit(beforeUser),
        after: userAccessAudit(user),
      },
    });

    return json({ ok: true, user, storage });
  } catch (error) {
    console.error('[Admin Users PATCH Error]', error);
    if (mutationStarted) {
      if (updateGuard) await markUserUpdateUncertain(adminDb, updateGuard);
      return json(UPDATE_UNCERTAIN, { status: 503 });
    }
    if (error instanceof UserUpdateSafetyError) {
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    const code = errorCode(error);
    const notFound = code === 'auth/user-not-found';
    const invalid = code === 'auth/invalid-uid' || code === 'auth/invalid-argument';
    return json({ error: notFound ? '사용자를 찾을 수 없습니다.' : invalid
      ? '요청 데이터가 올바르지 않습니다.' : '사용자 권한 저장소에 연결할 수 없습니다.' },
    { status: notFound ? 404 : invalid ? 400 : 503 });
  }
}
