import * as admin from 'firebase-admin';
import type { UserRecord } from 'firebase-admin/auth';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import {
    ApiError,
    USER_PERMISSION_KEYS,
    allPermissions,
    db,
    formatTimestamp,
    isRecord,
    requireAccess,
    requireMethod,
    type UserPermissions,
    type UserRole,
    writeActivityLogSafely,
} from './hostingCommon';

const USER_POSITIONS = ['ceo', 'manager', 'staff', 'intern'] as const;
type UserPosition = (typeof USER_POSITIONS)[number];

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
const PageQuerySchema = z.object({ pageToken: z.string().min(1).max(2048).optional() }).strict();
const UPDATE_UNCERTAIN = {
  error: '변경이 일부 반영되었을 수 있습니다. 새로고침 후 상태를 확인해 주세요.',
  code: 'USER_UPDATE_UNCERTAIN',
};
const errorCode = (error: unknown): string | undefined =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined;

const UpdateUserSchema = safePayloadKeys.pipe(z.object({
    uid: z.string().min(1).max(128).refine((uid) => isSafeKey(uid, 128) && !uid.includes('/') && uid !== '.' && uid !== '..'),
    role: z.enum(['admin', 'user', 'partner', 'guest']),
    position: z.enum(USER_POSITIONS),
    siteAccess: booleanMap(80),
    menuAccess: booleanMap(160),
    permissions: z.object({
        menuManagement: z.boolean().optional(),
        userManagement: z.boolean().optional(),
        projectBoardManagement: z.boolean().optional(),
        photoManagement: z.boolean().optional(),
        storageManagement: z.boolean().optional(),
    }).strict().default({}),
    disabled: z.boolean().optional(),
}).strict());

type UserAccessDoc = {
    role?: unknown;
    position?: unknown;
    siteAccess?: unknown;
    menuAccess?: unknown;
    permissions?: unknown;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    updatedAt?: unknown;
    updatedBy?: unknown;
};

const storage = {
    canPersist: true,
    credentialMode: 'firebase-functions-runtime',
    message: null,
};

function normalizeRole(value: unknown, fallback: UserRole = 'user'): UserRole {
    return value === 'admin' || value === 'user' || value === 'partner' || value === 'guest'
        ? value
        : fallback;
}

function normalizePosition(value: unknown): UserPosition {
    return USER_POSITIONS.includes(value as UserPosition) ? value as UserPosition : 'staff';
}

function sanitizeBooleanMap(value: unknown, maxKeyLength: number): Record<string, boolean> {
    if (!isRecord(value)) return {};
    return Object.entries(value).reduce<Record<string, boolean>>((result, [key, enabled]) => {
        const normalized = key.trim();
        if (isSafeKey(normalized, maxKeyLength)) result[normalized] = enabled === true;
        return result;
    }, {});
}

function normalizePermissions(
    role: UserRole,
    value: unknown,
    claims: Record<string, unknown> = {},
): UserPermissions {
    if (role === 'admin') return allPermissions();
    const source = isRecord(value) ? value : {};
    const aliases: Record<(typeof USER_PERMISSION_KEYS)[number], string> = {
        menuManagement: 'menuManager',
        userManagement: 'userManager',
        projectBoardManagement: 'projectBoardManager',
        photoManagement: 'photoManager',
        storageManagement: 'storageManager',
    };
    return USER_PERMISSION_KEYS.reduce<UserPermissions>((result, key) => {
        result[key] = source[key] === true || claims[key] === true || claims[aliases[key]] === true;
        return result;
    }, {
        menuManagement: false,
        userManagement: false,
        projectBoardManagement: false,
        photoManagement: false,
        storageManagement: false,
    });
}

function buildManagedUser(user: UserRecord, access: UserAccessDoc | null, hasAdminDoc: boolean) {
    const claims = isRecord(user.customClaims) ? user.customClaims : {};
    const claimAdmin = claims.admin === true || claims.role === 'admin';
    const role: UserRole = claimAdmin || hasAdminDoc
        ? 'admin' : normalizeRole(access?.role ?? claims.role);
    return {
        uid: user.uid,
        email: user.email ?? access?.email ?? null,
        displayName: user.displayName ?? access?.displayName ?? null,
        photoURL: user.photoURL ?? access?.photoURL ?? null,
        disabled: user.disabled,
        emailVerified: user.emailVerified,
        providerIds: user.providerData.map((provider) => provider.providerId),
        createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : null,
        lastSignInAt: user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toISOString() : null,
        role,
        position: normalizePosition(access?.position ?? claims.position),
        siteAccess: {
            ...sanitizeBooleanMap(claims.siteAccess, 80),
            ...sanitizeBooleanMap(access?.siteAccess, 80),
        },
        menuAccess: {
            ...sanitizeBooleanMap(claims.menuAccess, 160),
            ...sanitizeBooleanMap(access?.menuAccess, 160),
        },
        permissions: normalizePermissions(role, access?.permissions ?? claims.permissions, claims),
        updatedAt: formatTimestamp(access?.updatedAt),
        updatedBy: typeof access?.updatedBy === 'string' ? access.updatedBy : null,
        isAdminDocLinked: hasAdminDoc,
    };
}

async function handleList(req: Request, res: Response): Promise<void> {
    await requireAccess(req, 'userManagement');
    const payload = PageQuerySchema.safeParse(req.query);
    if (!payload.success) throw new ApiError(400, '목록 조회 조건이 올바르지 않습니다.');
    const page = await admin.auth().listUsers(100, payload.data.pageToken);
    const users = page.users;
    const accessRefs = users.map((user) => db.collection('userAccess').doc(user.uid));
    const adminRefs = users.map((user) => db.collection('admins').doc(user.uid));
    const [accessSnapshots, adminSnapshots] = users.length
        ? await Promise.all([db.getAll(...accessRefs), db.getAll(...adminRefs)])
        : [[], []];
    const accessDocs = new Map(
        accessSnapshots
            .filter((snapshot) => snapshot.exists)
            .map((snapshot) => [snapshot.id, snapshot.data() as UserAccessDoc]),
    );
    const adminDocs = new Set(
        adminSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id),
    );
    const managedUsers = users
        .map((user) => buildManagedUser(user, accessDocs.get(user.uid) || null, adminDocs.has(user.uid)))
        .sort((left, right) => {
            if (left.role === 'admin' && right.role !== 'admin') return -1;
            if (left.role !== 'admin' && right.role === 'admin') return 1;
            return (left.email || left.displayName || left.uid).localeCompare(
                right.email || right.displayName || right.uid,
            );
        });
    res.status(200).json({ users: managedUsers, storage, nextPageToken: page.pageToken ?? null });
}

async function handleUpdate(req: Request, res: Response): Promise<void> {
    const auth = await requireAccess(req, 'userManagement');
    let body: unknown = req.body;
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
        try { body = JSON.parse(body.toString()); } catch {
            throw new ApiError(400, '요청 데이터가 올바르지 않습니다.');
        }
    }
    const parsed = UpdateUserSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, '요청 데이터가 올바르지 않습니다.');
    const payload = parsed.data;
    if (auth.isAdmin && payload.uid === auth.uid && (payload.role !== 'admin' || payload.disabled === true)) {
        throw new ApiError(400, '현재 로그인한 관리자 계정은 관리자 권한을 해제하거나 비활성화할 수 없습니다.');
    }
    if (!auth.isAdmin && payload.uid === auth.uid) {
        throw new ApiError(400, '사용자 관리 권한으로 본인 계정 권한을 변경할 수 없습니다.');
    }

    const accessRef = db.collection('userAccess').doc(payload.uid);
    const adminRef = db.collection('admins').doc(payload.uid);
    const [targetUser, accessSnapshot, adminSnapshot] = await Promise.all([
        admin.auth().getUser(payload.uid),
        accessRef.get(),
        adminRef.get(),
    ]);
    const existingAccess = accessSnapshot.exists ? accessSnapshot.data() as UserAccessDoc : null;
    const existingClaims = isRecord(targetUser.customClaims) ? targetUser.customClaims : {};
    const targetIsAdmin =
        existingClaims.admin === true ||
        existingClaims.role === 'admin' ||
        existingAccess?.role === 'admin' ||
        adminSnapshot.exists;
    if (!auth.isAdmin && (targetIsAdmin || payload.role === 'admin')) {
        throw new ApiError(403, '사용자 관리 권한으로 관리자 계정을 변경하거나 관리자 역할을 부여할 수 없습니다.');
    }

    const permissions = normalizePermissions(payload.role, payload.permissions);
    const siteAccess = sanitizeBooleanMap(payload.siteAccess, 80);
    const menuAccess = sanitizeBooleanMap(payload.menuAccess, 160);
    const claims = {
        ...existingClaims,
        admin: payload.role === 'admin',
        role: payload.role,
        position: payload.position,
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
    if (Buffer.byteLength(JSON.stringify(claims), 'utf8') > 1000) {
        throw new ApiError(400, '권한 데이터가 Firebase custom claims 한도(1000바이트)를 초과합니다.');
    }
    // Everything after the first mutation attempt is potentially partially applied.
    try {
        if (typeof payload.disabled === 'boolean' && payload.disabled !== targetUser.disabled) {
            await admin.auth().updateUser(payload.uid, { disabled: payload.disabled });
        }
        await admin.auth().setCustomUserClaims(payload.uid, claims);
        const updatedUser = await admin.auth().getUser(payload.uid);
        const batch = db.batch();
        batch.set(accessRef, {
            uid: payload.uid,
            email: updatedUser.email ?? null,
            displayName: updatedUser.displayName ?? null,
            photoURL: updatedUser.photoURL ?? null,
            disabled: updatedUser.disabled,
            emailVerified: updatedUser.emailVerified,
            providerIds: updatedUser.providerData.map((provider) => provider.providerId),
            role: payload.role,
            position: payload.position,
            siteAccess,
            menuAccess,
            permissions,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: auth.uid,
        }, { mergeFields: ['uid', 'email', 'displayName', 'photoURL', 'disabled', 'emailVerified',
            'providerIds', 'role', 'position', 'siteAccess', 'menuAccess', 'permissions', 'updatedAt', 'updatedBy'] });
        if (payload.role === 'admin') {
            batch.set(adminRef, {
                uid: payload.uid,
                email: updatedUser.email ?? null,
                displayName: updatedUser.displayName ?? null,
                photoURL: updatedUser.photoURL ?? null,
                role: payload.role,
                position: payload.position,
                menuAccess,
                permissions,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: auth.uid,
            }, { mergeFields: ['uid', 'email', 'displayName', 'photoURL', 'role', 'position',
                'menuAccess', 'permissions', 'updatedAt', 'updatedBy'] });
        } else {
            batch.delete(adminRef);
        }
        await batch.commit();
        const [nextAccess, nextAdmin] = await Promise.all([accessRef.get(), adminRef.get()]);
        const user = buildManagedUser(
            updatedUser,
            nextAccess.exists ? nextAccess.data() as UserAccessDoc : null,
            nextAdmin.exists,
        );
        await writeActivityLogSafely({
            auth,
            req,
            action: 'admin.user.update',
            target: {
                type: 'userAccess',
                id: payload.uid,
                label: updatedUser.email ?? updatedUser.displayName ?? payload.uid,
            },
            summary: `${updatedUser.email ?? payload.uid} 계정 권한을 변경했습니다.`,
            metadata: {
                before: {
                    role: targetIsAdmin ? 'admin' : normalizeRole(existingAccess?.role ?? existingClaims.role),
                    disabled: targetUser.disabled,
                    hadAdminDoc: adminSnapshot.exists,
                },
                after: {
                    role: user.role,
                    position: user.position,
                    disabled: user.disabled,
                    permissions: user.permissions,
                    siteAccessCount: Object.keys(user.siteAccess).length,
                    menuAccessCount: Object.keys(user.menuAccess).length,
                    hasAdminDoc: nextAdmin.exists,
                },
            },
        });
        res.status(200).json({ ok: true, user, storage });
    } catch (error) {
        console.error('[Admin Users PATCH Uncertain]', error);
        res.status(503).json(UPDATE_UNCERTAIN);
    }
}

export async function handleAdminUsers(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
        requireMethod(req, ['GET', 'PATCH']);
        if (req.method === 'GET') return await handleList(req, res);
        return await handleUpdate(req, res);
    } catch (error) {
        if (error instanceof ApiError) {
            res.status(error.status).json({ error: error.message });
            return;
        }
        console.error('[Admin Users Error]', error);
        const code = errorCode(error);
        const notFound = req.method === 'PATCH' && code === 'auth/user-not-found';
        const invalid = code === 'auth/invalid-page-token' || code === 'auth/invalid-uid' || code === 'auth/invalid-argument';
        res.status(notFound ? 404 : invalid ? 400 : 503).json({
            error: notFound ? '사용자를 찾을 수 없습니다.' : invalid
                ? '요청 데이터가 올바르지 않습니다.' : '사용자 권한 저장소에 연결할 수 없습니다.',
        });
    }
}
