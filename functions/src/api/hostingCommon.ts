import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import { db } from '../firestore';

export { db };

export const USER_PERMISSION_KEYS = [
    'menuManagement',
    'userManagement',
    'projectBoardManagement',
    'photoManagement',
    'storageManagement',
] as const;

export type UserPermissionKey = (typeof USER_PERMISSION_KEYS)[number];
export type UserRole = 'admin' | 'user' | 'partner' | 'guest';
export type UserPermissions = Record<UserPermissionKey, boolean>;

export type UserAuth = {
    uid: string;
    email?: string;
};

export type AccessAuth = UserAuth & {
    isAdmin: boolean;
    role: UserRole;
    permissions: UserPermissions;
};

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

const DEFAULT_PERMISSIONS: UserPermissions = {
    menuManagement: false,
    userManagement: false,
    projectBoardManagement: false,
    photoManagement: false,
    storageManagement: false,
};

const PERMISSION_CLAIM_ALIASES: Record<UserPermissionKey, string> = {
    menuManagement: 'menuManager',
    userManagement: 'userManager',
    projectBoardManagement: 'projectBoardManager',
    photoManagement: 'photoManager',
    storageManagement: 'storageManager',
};

export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function allPermissions(): UserPermissions {
    return USER_PERMISSION_KEYS.reduce<UserPermissions>(
        (permissions, key) => ({ ...permissions, [key]: true }),
        { ...DEFAULT_PERMISSIONS },
    );
}

function parseBearerToken(req: Request): string {
    const header = req.header('authorization') || req.header('Authorization');
    const [scheme, token] = (header || '').split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        throw new ApiError(401, 'Authorization Bearer token is required.');
    }
    return token.trim();
}

function normalizeRole(value: unknown, fallback: UserRole): UserRole {
    return value === 'admin' || value === 'user' || value === 'partner' || value === 'guest'
        ? value
        : fallback;
}

function normalizePermissions(
    role: UserRole,
    value: unknown,
    claims: Record<string, unknown>,
): UserPermissions {
    if (role === 'admin') return allPermissions();
    const source = isRecord(value) ? value : {};
    return USER_PERMISSION_KEYS.reduce<UserPermissions>((permissions, key) => {
        permissions[key] =
            source[key] === true ||
            claims[key] === true ||
            claims[PERMISSION_CLAIM_ALIASES[key]] === true;
        return permissions;
    }, { ...DEFAULT_PERMISSIONS });
}

export async function requireUser(req: Request): Promise<UserAuth> {
    try {
        const decoded = await admin.auth().verifyIdToken(parseBearerToken(req));
        return {
            uid: decoded.uid,
            email: typeof decoded.email === 'string' ? decoded.email : undefined,
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(401, 'The provided auth token is invalid.');
    }
}

export async function requireAccess(
    req: Request,
    permission?: UserPermissionKey,
): Promise<AccessAuth> {
    const user = await requireUser(req);
    const authUser = await admin.auth().getUser(user.uid).catch(() => null);
    const claims = (authUser?.customClaims || {}) as Record<string, unknown>;
    const allowList = (process.env.ADMIN_UIDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const claimedAdmin = claims.admin === true || claims.role === 'admin' || allowList.includes(user.uid);

    const [adminDoc, accessDoc] = claimedAdmin
        ? [null, null]
        : await Promise.all([
            db.collection('admins').doc(user.uid).get(),
            db.collection('userAccess').doc(user.uid).get(),
        ]);

    const adminData = adminDoc?.exists ? adminDoc.data() || {} : {};
    const accessData = accessDoc?.exists ? accessDoc.data() || {} : {};
    const isAdmin =
        claimedAdmin ||
        adminDoc?.exists === true ||
        accessData.role === 'admin';
    const storedRole = normalizeRole(
        accessData.role ?? adminData.role ?? claims.role,
        isAdmin ? 'admin' : 'user',
    );
    const role: UserRole = isAdmin ? 'admin' : storedRole;
    const permissions = normalizePermissions(
        role,
        accessData.permissions ?? adminData.permissions ?? claims.permissions,
        claims,
    );

    if (!isAdmin && (!permission || permissions[permission] !== true)) {
        throw new ApiError(403, permission ? '요청한 관리 권한이 없습니다.' : '관리자 권한이 필요합니다.');
    }

    return { ...user, isAdmin, role, permissions };
}

export async function requireAdmin(req: Request): Promise<AccessAuth> {
    return requireAccess(req);
}

export function requireMethod(req: Request, allowed: string | string[]): void {
    const methods = Array.isArray(allowed) ? allowed : [allowed];
    if (!methods.includes(req.method)) {
        throw new ApiError(405, 'Method not allowed.');
    }
}

export function parseJson<T extends z.ZodType>(
    req: Request,
    schema: T,
    message = 'Invalid request payload.',
): z.infer<T> {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        throw new ApiError(400, message, parsed.error.issues);
    }
    return parsed.data;
}

export function sendError(res: Response, error: unknown): void {
    if (error instanceof ApiError) {
        res.status(error.status).json({
            success: false,
            error: error.message,
            ...(error.details ? { issues: error.details } : {}),
        });
        return;
    }

    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    console.error('[hostingApi] Unhandled route error:', error);
    res.status(500).json({ success: false, error: message });
}

const MAX_LOG_STRING_LENGTH = 700;
const MAX_LOG_ARRAY_LENGTH = 40;
const MAX_LOG_OBJECT_KEYS = 60;
const MAX_LOG_DEPTH = 4;

function truncateLogString(value: string): string {
    return value.length > MAX_LOG_STRING_LENGTH
        ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}...`
        : value;
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return truncateLogString(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
    if (depth >= MAX_LOG_DEPTH) return '[truncated]';
    if (Array.isArray(value)) {
        return value.slice(0, MAX_LOG_ARRAY_LENGTH).map((item) => sanitizeLogValue(item, depth + 1));
    }
    if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
            .slice(0, MAX_LOG_OBJECT_KEYS)
            .reduce<Record<string, unknown>>((result, [key, item]) => {
                if (key.trim()) result[truncateLogString(key)] = sanitizeLogValue(item, depth + 1);
                return result;
            }, {});
    }
    return String(value);
}

export async function writeActivityLog(input: {
    auth: UserAuth & Partial<Pick<AccessAuth, 'role' | 'isAdmin'>>;
    req: Request;
    action: string;
    target: { type: string; id?: string | null; path?: string | null; label?: string | null };
    summary?: string;
    metadata?: Record<string, unknown>;
    route?: string | null;
}): Promise<string> {
    const referer = input.req.header('referer');
    let route = input.route || input.req.path;
    if (!input.route && referer) {
        try {
            const url = new URL(referer);
            route = `${url.pathname}${url.search}`;
        } catch {
            // The request path is a safe fallback for a malformed Referer.
        }
    }

    const ref = await db.collection('activityLogs').add({
        action: truncateLogString(input.action.trim()),
        actor: {
            uid: input.auth.uid,
            email: input.auth.email ?? null,
            role: input.auth.role ?? null,
            isAdmin: input.auth.isAdmin === true,
        },
        target: {
            type: truncateLogString(input.target.type.trim()),
            id: input.target.id ? truncateLogString(input.target.id) : null,
            path: input.target.path ? truncateLogString(input.target.path) : null,
            label: input.target.label ? truncateLogString(input.target.label) : null,
        },
        summary: input.summary ? truncateLogString(input.summary) : null,
        metadata: sanitizeLogValue(input.metadata || {}),
        route: route ? truncateLogString(route) : null,
        userAgent: input.req.header('user-agent')
            ? truncateLogString(input.req.header('user-agent') || '')
            : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
}

export async function writeActivityLogSafely(
    input: Parameters<typeof writeActivityLog>[0],
): Promise<void> {
    await writeActivityLog(input).catch((error) => {
        console.warn('[hostingApi] Failed to write activity log:', error);
    });
}

export function formatTimestamp(value: unknown): string | null {
    if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
    if (typeof value === 'string') return value;
    return null;
}
