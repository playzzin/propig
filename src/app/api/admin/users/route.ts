import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { UserRecord } from 'firebase-admin/auth';
import { z } from 'zod';
import admin, { db as adminDb, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import { requireAdminOrPermissionAuth } from '@/lib/server/admin-auth';
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

const UpdateUserSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(USER_ROLE_OPTIONS),
  position: z.enum(USER_POSITION_OPTIONS),
  siteAccess: z.record(z.string(), z.boolean()).default({}),
  menuAccess: z.record(z.string(), z.boolean()).default({}),
  permissions: z
    .object({
      menuManagement: z.boolean().optional(),
      userManagement: z.boolean().optional(),
      projectBoardManagement: z.boolean().optional(),
      photoManagement: z.boolean().optional(),
      storageManagement: z.boolean().optional(),
    })
    .default({}),
  disabled: z.boolean().optional(),
});

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
const LIST_USERS_PAGE_SIZE = 1000;
const LIST_USERS_LIMIT = 5000;

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
    if (!normalizedSiteId || normalizedSiteId.length > 80) return acc;
    acc[normalizedSiteId] = enabled === true;
    return acc;
  }, {});
};

const sanitizeMenuAccess = (value: unknown): ManagedUserMenuAccess => {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<ManagedUserMenuAccess>((acc, [menuKey, enabled]) => {
    const normalizedMenuKey = menuKey.trim();
    if (!normalizedMenuKey || normalizedMenuKey.length > 160) return acc;
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

const listUsers = async (): Promise<UserRecord[]> => {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;

  do {
    const page = await admin.auth().listUsers(LIST_USERS_PAGE_SIZE, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken && users.length < LIST_USERS_LIMIT);

  return users.slice(0, LIST_USERS_LIMIT);
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
  const fallbackRole: ManagedUserRole = claimAdmin || hasAdminDoc ? 'admin' : 'user';
  const role = normalizeRole(accessDoc?.role ?? customClaims.role, fallbackRole);
  const permissions = normalizePermissions(role, docPermissions ?? customClaims.permissions, customClaims);

  return {
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
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    let storage = getStorageStatus();
    const authUsers = await listUsers();
    let accessDocs = new Map<string, UserAccessDoc>();
    let adminDocs = new Set<string>();

    try {
      const docs = await loadAccessDocs(authUsers);
      accessDocs = docs.accessDocs;
      adminDocs = docs.adminDocs;
      storage = markStorageAvailable(storage);
    } catch (error) {
      console.warn('[Admin Users] Failed to load Firestore access docs:', error);
    }

    const users = sortUsers(
      authUsers.map((user) => buildManagedUser(user, accessDocs.get(user.uid) ?? null, adminDocs.has(user.uid))),
    );

    return NextResponse.json({ users, storage });
  } catch (error) {
    console.error('[Admin Users GET Error]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '사용자 목록을 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAdminOrPermissionAuth(request, 'userManagement');
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    const payload = UpdateUserSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: '요청 데이터가 올바르지 않습니다.', issues: payload.error.issues },
        { status: 400 },
      );
    }

    const storage = markStorageAvailable(getStorageStatus());
    if (!storage.canPersist) {
      return NextResponse.json(
        { error: storage.message || 'Firestore 저장 설정이 필요합니다.', storage },
        { status: 503 },
      );
    }

    const { uid, role, position, disabled } = payload.data;
    if (authResult.isAdmin && uid === authResult.uid && (role !== 'admin' || disabled === true)) {
      return NextResponse.json(
        { error: '현재 로그인한 관리자 계정의 관리자 권한 해제 또는 비활성화는 허용되지 않습니다.' },
        { status: 400 },
      );
    }

    if (!authResult.isAdmin && uid === authResult.uid) {
      return NextResponse.json(
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
    const existingAccess = existingAccessSnapshot.exists ? (existingAccessSnapshot.data() as UserAccessDoc) : null;
    const existingClaims = isRecord(targetUser.customClaims) ? targetUser.customClaims : {};
    const targetIsAdmin =
      existingClaims.admin === true ||
      existingClaims.role === 'admin' ||
      existingAccess?.role === 'admin' ||
      existingAdminSnapshot.exists;

    if (!authResult.isAdmin && (targetIsAdmin || role === 'admin')) {
      return NextResponse.json(
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
      menuManager: permissions.menuManagement,
      userManager: permissions.userManagement,
      projectBoardManager: permissions.projectBoardManagement,
      photoManager: permissions.photoManagement,
      storageManager: permissions.storageManagement,
    };

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
      { merge: true },
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
        { merge: true },
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

    return NextResponse.json({ ok: true, user, storage });
  } catch (error) {
    console.error('[Admin Users PATCH Error]', error);
    const message = error instanceof Error ? error.message : '사용자 권한을 저장하지 못했습니다.';
    const status = message.includes('no user record') || message.includes('auth/user-not-found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
