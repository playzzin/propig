import { NextRequest } from 'next/server';
import admin, { db as adminDb } from '@/lib/firebase-admin';
import {
    DEFAULT_USER_PERMISSIONS,
    USER_PERMISSION_KEYS,
    USER_ROLE_OPTIONS,
    type ManagedUserPermissionKey,
    type ManagedUserPermissions,
    type ManagedUserRole,
} from '@/types/userAccess';

type AdminAuthSuccess = {
    ok: true;
    uid: string;
    email?: string;
    isAdmin: true;
    role: ManagedUserRole;
    permissions: ManagedUserPermissions;
};

type AdminAuthFailure = {
    ok: false;
    status: 401 | 403 | 500;
    message: string;
};

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure;
export type AdminOrPermissionAuthResult =
    | {
        ok: true;
        uid: string;
        email?: string;
        isAdmin: boolean;
        role: ManagedUserRole;
        permissions: ManagedUserPermissions;
    }
    | AdminAuthFailure;

type DecodedAuthToken = {
    uid: string;
    email?: unknown;
    admin?: unknown;
    role?: unknown;
    permissions?: unknown;
    [key: string]: unknown;
};

const PERMISSION_CLAIM_ALIASES: Record<ManagedUserPermissionKey, string> = {
    menuManagement: 'menuManager',
    userManagement: 'userManager',
    projectBoardManagement: 'projectBoardManager',
    photoManagement: 'photoManager',
    storageManagement: 'storageManager',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const allPermissions = (): ManagedUserPermissions =>
    USER_PERMISSION_KEYS.reduce<ManagedUserPermissions>(
        (acc, key) => ({ ...acc, [key]: true }),
        { ...DEFAULT_USER_PERMISSIONS },
    );

const normalizeRole = (value: unknown, fallback: ManagedUserRole): ManagedUserRole =>
    USER_ROLE_OPTIONS.includes(value as ManagedUserRole) ? (value as ManagedUserRole) : fallback;

const normalizePermissions = (
    role: ManagedUserRole,
    value: unknown,
    customClaims: Record<string, unknown>,
): ManagedUserPermissions => {
    if (role === 'admin') return allPermissions();

    const source = isRecord(value) ? value : {};
    return USER_PERMISSION_KEYS.reduce<ManagedUserPermissions>((acc, key) => {
        const alias = PERMISSION_CLAIM_ALIASES[key];
        acc[key] = source[key] === true || customClaims[key] === true || customClaims[alias] === true;
        return acc;
    }, { ...DEFAULT_USER_PERMISSIONS });
};

const parseBearerToken = (request: NextRequest): string | null => {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader) return null;
    const [scheme, token] = authHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
    return token.trim();
};

const parseAdminUidAllowList = (): string[] => {
    const raw = process.env.GEMINI_ADMIN_UIDS || process.env.ADMIN_UIDS || '';
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

const loadAccessContext = async (decoded: DecodedAuthToken) => {
    const customClaims = decoded as Record<string, unknown>;
    const allowList = parseAdminUidAllowList();
    const hasAdminClaim = decoded.admin === true || decoded.role === 'admin';
    const isAllowedByUid = allowList.length > 0 && allowList.includes(decoded.uid);

    const [adminDoc, accessDoc] =
        hasAdminClaim || isAllowedByUid
            ? [null, null]
            : await Promise.all([
                adminDb
                    .collection('admins')
                    .doc(decoded.uid)
                    .get()
                    .catch(() => null),
                adminDb
                    .collection('userAccess')
                    .doc(decoded.uid)
                    .get()
                    .catch(() => null),
            ]);

    const adminData = adminDoc?.exists ? adminDoc.data() ?? {} : {};
    const accessData = accessDoc?.exists ? accessDoc.data() ?? {} : {};
    const hasAdminDoc = adminDoc?.exists === true;
    const hasUserAccessAdmin = accessData.role === 'admin';
    const isAdmin = hasAdminClaim || isAllowedByUid || hasAdminDoc || hasUserAccessAdmin;
    const role = normalizeRole(
        accessData.role ?? adminData.role ?? decoded.role,
        isAdmin ? 'admin' : 'user',
    );

    return {
        isAdmin,
        role: isAdmin ? 'admin' : role,
        permissions: normalizePermissions(
            isAdmin ? 'admin' : role,
            accessData.permissions ?? adminData.permissions ?? decoded.permissions,
            customClaims,
        ),
    };
};

export const requireAdminAuth = async (request: NextRequest): Promise<AdminAuthResult> => {
    const token = parseBearerToken(request);
    if (!token) {
        return { ok: false, status: 401, message: 'Authorization Bearer token is required.' };
    }

    if (!admin.apps.length) {
        return { ok: false, status: 500, message: 'Firebase Admin is not initialized.' };
    }

    try {
        const decoded = (await admin.auth().verifyIdToken(token)) as DecodedAuthToken;
        const access = await loadAccessContext(decoded);

        if (!access.isAdmin) {
            return { ok: false, status: 403, message: '관리자 권한이 없습니다.' };
        }

        return {
            ok: true,
            uid: decoded.uid,
            email: typeof decoded.email === 'string' ? decoded.email : undefined,
            isAdmin: true,
            role: 'admin',
            permissions: allPermissions(),
        };
    } catch (error) {
        console.error('[Admin Auth Error] verifyIdToken failed:', error);

        if (error instanceof Error && error.message.includes('Could not load the default credentials')) {
            return {
                ok: false,
                status: 500,
                message: 'Firebase Admin service account is required.',
            };
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        return { ok: false, status: 401, message: `Invalid auth token. Detail: ${errorMessage}` };
    }
};

export const requireAdminOrPermissionAuth = async (
    request: NextRequest,
    permission: ManagedUserPermissionKey,
): Promise<AdminOrPermissionAuthResult> => {
    const token = parseBearerToken(request);
    if (!token) {
        return { ok: false, status: 401, message: 'Authorization Bearer token is required.' };
    }

    if (!admin.apps.length) {
        return { ok: false, status: 500, message: 'Firebase Admin is not initialized.' };
    }

    try {
        const decoded = (await admin.auth().verifyIdToken(token)) as DecodedAuthToken;
        const access = await loadAccessContext(decoded);

        if (!access.isAdmin && access.permissions[permission] !== true) {
            return { ok: false, status: 403, message: '요청한 관리 권한이 없습니다.' };
        }

        return {
            ok: true,
            uid: decoded.uid,
            email: typeof decoded.email === 'string' ? decoded.email : undefined,
            isAdmin: access.isAdmin,
            role: access.role,
            permissions: access.permissions,
        };
    } catch (error) {
        console.error('[Admin Permission Auth Error] verifyIdToken failed:', error);

        if (error instanceof Error && error.message.includes('Could not load the default credentials')) {
            return {
                ok: false,
                status: 500,
                message: 'Firebase Admin service account is required.',
            };
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        return { ok: false, status: 401, message: `Invalid auth token. Detail: ${errorMessage}` };
    }
};
