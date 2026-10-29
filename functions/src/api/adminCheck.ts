import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { db } from '../firestore';

if (!admin.apps.length) {
    admin.initializeApp();
}

type HeaderReadableRequest = {
    header(name: string): string | undefined;
};

type ManagedUserRole = 'admin' | 'user' | 'partner' | 'guest';
type ManagedUserPosition = 'ceo' | 'manager' | 'staff' | 'intern';
type ManagedUserPermissionKey =
    | 'menuManagement'
    | 'userManagement'
    | 'projectBoardManagement'
    | 'photoManagement'
    | 'storageManagement';
type ManagedUserPermissions = Record<ManagedUserPermissionKey, boolean>;
type ManagedUserSiteAccess = Record<string, boolean>;
type ManagedUserMenuAccess = Record<string, boolean>;

type AdminCheckContext =
    | {
        ok: true;
        uid: string;
        email: string | null;
        claims: Record<string, unknown>;
        adminData: Record<string, unknown>;
        accessData: Record<string, unknown>;
    }
    | {
        ok: false;
        status: 401 | 403 | 500;
        message: string;
    };

const USER_POSITION_OPTIONS: readonly ManagedUserPosition[] = ['ceo', 'manager', 'staff', 'intern'];
const USER_PERMISSION_KEYS: readonly ManagedUserPermissionKey[] = [
    'menuManagement',
    'userManagement',
    'projectBoardManagement',
    'photoManagement',
    'storageManagement',
];

const DEFAULT_USER_PERMISSIONS: ManagedUserPermissions = {
    menuManagement: false,
    userManagement: false,
    projectBoardManagement: false,
    photoManagement: false,
    storageManagement: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseBearerToken(req: HeaderReadableRequest): string | null {
    const authHeader = req.header('authorization') || req.header('Authorization');
    if (!authHeader) return null;

    const [scheme, token] = authHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;

    return token.trim();
}

function parseAdminUidAllowList(): string[] {
    const raw = process.env.ADMIN_UIDS || '';
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function allPermissions(): ManagedUserPermissions {
    return USER_PERMISSION_KEYS.reduce<ManagedUserPermissions>(
        (acc, key) => ({ ...acc, [key]: true }),
        { ...DEFAULT_USER_PERMISSIONS },
    );
}


function normalizePosition(value: unknown): ManagedUserPosition {
    return USER_POSITION_OPTIONS.includes(value as ManagedUserPosition)
        ? (value as ManagedUserPosition)
        : 'ceo';
}

function normalizeSiteAccess(value: unknown): ManagedUserSiteAccess {
    if (!isRecord(value)) return {};

    return Object.entries(value).reduce<ManagedUserSiteAccess>((acc, [siteId, enabled]) => {
        if (siteId.trim()) {
            acc[siteId] = enabled === true;
        }
        return acc;
    }, {});
}

function normalizeMenuAccess(value: unknown): ManagedUserMenuAccess {
    if (!isRecord(value)) return {};

    return Object.entries(value).reduce<ManagedUserMenuAccess>((acc, [menuKey, enabled]) => {
        if (menuKey.trim()) {
            acc[menuKey] = enabled === true;
        }
        return acc;
    }, {});
}


async function loadAdminCheckContext(req: HeaderReadableRequest): Promise<AdminCheckContext> {
    const token = parseBearerToken(req);
    if (!token) {
        return { ok: false, status: 401, message: 'Authorization Bearer token is required.' };
    }

    if (!admin.apps.length) {
        return { ok: false, status: 500, message: 'Firebase Admin is not initialized.' };
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const tokenClaims = decoded as DecodedIdToken & Record<string, unknown>;
        const [authUser, adminDoc, accessDoc] = await Promise.all([
            admin.auth().getUser(decoded.uid).catch(() => null),
            db.collection('admins').doc(decoded.uid).get().catch(() => null),
            db.collection('userAccess').doc(decoded.uid).get().catch(() => null),
        ]);

        const adminData = adminDoc?.exists ? adminDoc.data() ?? {} : {};
        const accessData = accessDoc?.exists ? accessDoc.data() ?? {} : {};
        const allowList = parseAdminUidAllowList();
        const hasAdminClaim = tokenClaims.admin === true || tokenClaims.role === 'admin';
        const isAllowedByUid = allowList.length > 0 && allowList.includes(decoded.uid);
        const hasAdminDoc = adminDoc?.exists === true;
        const hasUserAccessAdmin = accessData.role === 'admin';

        if (!hasAdminClaim && !isAllowedByUid && !hasAdminDoc && !hasUserAccessAdmin) {
            return { ok: false, status: 403, message: 'Admin permission is required.' };
        }

        return {
            ok: true,
            uid: decoded.uid,
            email: typeof decoded.email === 'string' ? decoded.email : authUser?.email ?? null,
            claims: authUser?.customClaims ?? {},
            adminData,
            accessData,
        };
    } catch (error) {
        logger.error('[Admin Check] verifyIdToken failed.', error);

        if (error instanceof Error && error.message.includes('Could not load the default credentials')) {
            return {
                ok: false,
                status: 500,
                message: 'Firebase Admin service account is required.',
            };
        }

        return { ok: false, status: 401, message: 'Invalid auth token.' };
    }
}

export const adminCheck = onRequest({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ ok: false, message: 'Method not allowed.' });
        return;
    }

    const context = await loadAdminCheckContext(req);
    if (!context.ok) {
        res.status(context.status).json({ ok: false, message: context.message });
        return;
    }

    const role: ManagedUserRole = 'admin';
    const position = normalizePosition(context.accessData.position ?? context.adminData.position ?? context.claims.position);
    const siteAccess = {
        ...normalizeSiteAccess(context.claims.siteAccess),
        ...normalizeSiteAccess(context.adminData.siteAccess),
        ...normalizeSiteAccess(context.accessData.siteAccess),
    };
    const menuAccess = {
        ...normalizeMenuAccess(context.claims.menuAccess),
        ...normalizeMenuAccess(context.adminData.menuAccess),
        ...normalizeMenuAccess(context.accessData.menuAccess),
    };
    const permissions = allPermissions();

    res.status(200).json({
        ok: true,
        uid: context.uid,
        email: context.email,
        role,
        position,
        siteAccess,
        menuAccess,
        permissions,
        canWriteFirestore: true,
    });
});
