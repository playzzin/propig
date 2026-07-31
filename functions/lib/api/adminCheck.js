"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminCheck = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const firestore_1 = require("../firestore");
if (!admin.apps.length) {
    admin.initializeApp();
}
const USER_ROLE_OPTIONS = ['admin', 'user', 'partner', 'guest'];
const USER_POSITION_OPTIONS = ['ceo', 'manager', 'staff', 'intern'];
const USER_PERMISSION_KEYS = [
    'menuManagement',
    'userManagement',
    'projectBoardManagement',
    'photoManagement',
    'storageManagement',
];
const DEFAULT_USER_PERMISSIONS = {
    menuManagement: false,
    userManagement: false,
    projectBoardManagement: false,
    photoManagement: false,
    storageManagement: false,
};
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function parseBearerToken(req) {
    const authHeader = req.header('authorization') || req.header('Authorization');
    if (!authHeader)
        return null;
    const [scheme, token] = authHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer')
        return null;
    return token.trim();
}
function parseAdminUidAllowList() {
    const raw = process.env.ADMIN_UIDS || '';
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
function allPermissions() {
    return USER_PERMISSION_KEYS.reduce((acc, key) => (Object.assign(Object.assign({}, acc), { [key]: true })), Object.assign({}, DEFAULT_USER_PERMISSIONS));
}
function normalizeRole(value, fallback) {
    return USER_ROLE_OPTIONS.includes(value) ? value : fallback;
}
function normalizePosition(value) {
    return USER_POSITION_OPTIONS.includes(value)
        ? value
        : 'ceo';
}
function normalizeSiteAccess(value) {
    if (!isRecord(value))
        return {};
    return Object.entries(value).reduce((acc, [siteId, enabled]) => {
        if (siteId.trim()) {
            acc[siteId] = enabled === true;
        }
        return acc;
    }, {});
}
function normalizeMenuAccess(value) {
    if (!isRecord(value))
        return {};
    return Object.entries(value).reduce((acc, [menuKey, enabled]) => {
        if (menuKey.trim()) {
            acc[menuKey] = enabled === true;
        }
        return acc;
    }, {});
}
function normalizePermissions(role, value) {
    if (role === 'admin')
        return allPermissions();
    const source = isRecord(value) ? value : {};
    return {
        menuManagement: source.menuManagement === true,
        userManagement: source.userManagement === true,
        projectBoardManagement: source.projectBoardManagement === true,
        photoManagement: source.photoManagement === true,
        storageManagement: source.storageManagement === true,
    };
}
async function loadAdminCheckContext(req) {
    var _a, _b, _c, _d;
    const token = parseBearerToken(req);
    if (!token) {
        return { ok: false, status: 401, message: 'Authorization Bearer token is required.' };
    }
    if (!admin.apps.length) {
        return { ok: false, status: 500, message: 'Firebase Admin is not initialized.' };
    }
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const tokenClaims = decoded;
        const [authUser, adminDoc, accessDoc] = await Promise.all([
            admin.auth().getUser(decoded.uid).catch(() => null),
            firestore_1.db.collection('admins').doc(decoded.uid).get().catch(() => null),
            firestore_1.db.collection('userAccess').doc(decoded.uid).get().catch(() => null),
        ]);
        const adminData = (adminDoc === null || adminDoc === void 0 ? void 0 : adminDoc.exists) ? (_a = adminDoc.data()) !== null && _a !== void 0 ? _a : {} : {};
        const accessData = (accessDoc === null || accessDoc === void 0 ? void 0 : accessDoc.exists) ? (_b = accessDoc.data()) !== null && _b !== void 0 ? _b : {} : {};
        const allowList = parseAdminUidAllowList();
        const hasAdminClaim = tokenClaims.admin === true || tokenClaims.role === 'admin';
        const isAllowedByUid = allowList.length > 0 && allowList.includes(decoded.uid);
        const hasAdminDoc = (adminDoc === null || adminDoc === void 0 ? void 0 : adminDoc.exists) === true;
        const hasUserAccessAdmin = accessData.role === 'admin';
        if (!hasAdminClaim && !isAllowedByUid && !hasAdminDoc && !hasUserAccessAdmin) {
            return { ok: false, status: 403, message: 'Admin permission is required.' };
        }
        return {
            ok: true,
            uid: decoded.uid,
            email: typeof decoded.email === 'string' ? decoded.email : (_c = authUser === null || authUser === void 0 ? void 0 : authUser.email) !== null && _c !== void 0 ? _c : null,
            claims: (_d = authUser === null || authUser === void 0 ? void 0 : authUser.customClaims) !== null && _d !== void 0 ? _d : {},
            adminData,
            accessData,
            hasAdminDoc,
        };
    }
    catch (error) {
        logger.error('[Admin Check] verifyIdToken failed.', error);
        if (error instanceof Error && error.message.includes('Could not load the default credentials')) {
            return {
                ok: false,
                status: 500,
                message: 'Firebase Admin service account is required.',
            };
        }
        const detail = error instanceof Error ? error.message : String(error);
        return { ok: false, status: 401, message: `Invalid auth token. Detail: ${detail}` };
    }
}
exports.adminCheck = (0, https_1.onRequest)({ cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
    if (req.method !== 'GET') {
        res.status(405).json({ ok: false, message: 'Method not allowed.' });
        return;
    }
    const context = await loadAdminCheckContext(req);
    if (!context.ok) {
        res.status(context.status).json({ ok: false, message: context.message });
        return;
    }
    const role = normalizeRole((_b = (_a = context.accessData.role) !== null && _a !== void 0 ? _a : context.adminData.role) !== null && _b !== void 0 ? _b : context.claims.role, 'admin');
    const position = normalizePosition((_d = (_c = context.accessData.position) !== null && _c !== void 0 ? _c : context.adminData.position) !== null && _d !== void 0 ? _d : context.claims.position);
    const siteAccess = Object.assign(Object.assign(Object.assign({}, normalizeSiteAccess(context.claims.siteAccess)), normalizeSiteAccess(context.adminData.siteAccess)), normalizeSiteAccess(context.accessData.siteAccess));
    const menuAccess = Object.assign(Object.assign(Object.assign({}, normalizeMenuAccess(context.claims.menuAccess)), normalizeMenuAccess(context.adminData.menuAccess)), normalizeMenuAccess(context.accessData.menuAccess));
    const permissions = normalizePermissions(role, (_f = (_e = context.accessData.permissions) !== null && _e !== void 0 ? _e : context.adminData.permissions) !== null && _f !== void 0 ? _f : context.claims.permissions);
    res.status(200).json({
        ok: true,
        uid: context.uid,
        email: context.email,
        role,
        position,
        siteAccess,
        menuAccess,
        permissions,
        canWriteFirestore: Boolean(context.hasAdminDoc ||
            context.claims.admin === true ||
            context.claims.role === 'admin'),
    });
});
//# sourceMappingURL=adminCheck.js.map