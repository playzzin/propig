"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = exports.USER_PERMISSION_KEYS = exports.db = void 0;
exports.isRecord = isRecord;
exports.allPermissions = allPermissions;
exports.requireUser = requireUser;
exports.requireAccess = requireAccess;
exports.requireUserAccess = requireUserAccess;
exports.resolveUserAccessByUid = resolveUserAccessByUid;
exports.requireAdmin = requireAdmin;
exports.requireMethod = requireMethod;
exports.parseJson = parseJson;
exports.sendError = sendError;
exports.writeActivityLog = writeActivityLog;
exports.writeActivityLogSafely = writeActivityLogSafely;
exports.formatTimestamp = formatTimestamp;
const admin = require("firebase-admin");
const firestore_1 = require("../firestore");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return firestore_1.db; } });
exports.USER_PERMISSION_KEYS = [
    'menuManagement',
    'userManagement',
    'projectBoardManagement',
    'photoManagement',
    'storageManagement',
];
class ApiError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
const DEFAULT_PERMISSIONS = {
    menuManagement: false,
    userManagement: false,
    projectBoardManagement: false,
    photoManagement: false,
    storageManagement: false,
};
const PERMISSION_CLAIM_ALIASES = {
    menuManagement: 'menuManager',
    userManagement: 'userManager',
    projectBoardManagement: 'projectBoardManager',
    photoManagement: 'photoManager',
    storageManagement: 'storageManager',
};
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function allPermissions() {
    return exports.USER_PERMISSION_KEYS.reduce((permissions, key) => (Object.assign(Object.assign({}, permissions), { [key]: true })), Object.assign({}, DEFAULT_PERMISSIONS));
}
function parseBearerToken(req) {
    const header = req.header('authorization') || req.header('Authorization');
    const [scheme, token] = (header || '').split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        throw new ApiError(401, 'Authorization Bearer token is required.');
    }
    return token.trim();
}
function normalizeRole(value, fallback) {
    return value === 'admin' || value === 'user' || value === 'partner' || value === 'guest' ? value : fallback;
}
function normalizePermissions(role, value, claims) {
    if (role === 'admin')
        return allPermissions();
    const source = isRecord(value) ? value : {};
    return exports.USER_PERMISSION_KEYS.reduce((permissions, key) => {
        permissions[key] =
            source[key] === true || claims[key] === true || claims[PERMISSION_CLAIM_ALIASES[key]] === true;
        return permissions;
    }, Object.assign({}, DEFAULT_PERMISSIONS));
}
async function requireUser(req) {
    try {
        const decoded = await admin.auth().verifyIdToken(parseBearerToken(req));
        return {
            uid: decoded.uid,
            email: typeof decoded.email === 'string' ? decoded.email : undefined,
        };
    }
    catch (error) {
        if (error instanceof ApiError)
            throw error;
        throw new ApiError(401, 'The provided auth token is invalid.');
    }
}
async function requireAccess(req, permission) {
    const access = await requireUserAccess(req);
    if (!access.isAdmin && (!permission || access.permissions[permission] !== true)) {
        throw new ApiError(403, permission
            ? 'You do not have the requested management permission.'
            : 'Administrator access is required.');
    }
    return access;
}
/**
 * Resolves a signed-in user's access context without requiring a management
 * permission. Use it when a response contains administrator-only fields.
 */
async function requireUserAccess(req) {
    const user = await requireUser(req);
    return resolveUserAccessByUid(user.uid, user.email);
}
async function resolveUserAccessByUid(uid, email) {
    var _a, _b, _c, _d;
    const authUser = await admin
        .auth()
        .getUser(uid)
        .catch(() => null);
    const claims = ((authUser === null || authUser === void 0 ? void 0 : authUser.customClaims) || {});
    const allowList = (process.env.ADMIN_UIDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const claimedAdmin = claims.admin === true || claims.role === 'admin' || allowList.includes(uid);
    const [adminDoc, accessDoc] = claimedAdmin
        ? [null, null]
        : await Promise.all([
            firestore_1.db.collection('admins').doc(uid).get(),
            firestore_1.db.collection('userAccess').doc(uid).get(),
        ]);
    const adminData = (adminDoc === null || adminDoc === void 0 ? void 0 : adminDoc.exists) ? adminDoc.data() || {} : {};
    const accessData = (accessDoc === null || accessDoc === void 0 ? void 0 : accessDoc.exists) ? accessDoc.data() || {} : {};
    const isAdmin = claimedAdmin || (adminDoc === null || adminDoc === void 0 ? void 0 : adminDoc.exists) === true || accessData.role === 'admin';
    const storedRole = normalizeRole((_b = (_a = accessData.role) !== null && _a !== void 0 ? _a : adminData.role) !== null && _b !== void 0 ? _b : claims.role, isAdmin ? 'admin' : 'user');
    const role = isAdmin ? 'admin' : storedRole;
    const permissions = normalizePermissions(role, (_d = (_c = accessData.permissions) !== null && _c !== void 0 ? _c : adminData.permissions) !== null && _d !== void 0 ? _d : claims.permissions, claims);
    return { uid, email, isAdmin, role, permissions };
}
async function requireAdmin(req) {
    return requireAccess(req);
}
function requireMethod(req, allowed) {
    const methods = Array.isArray(allowed) ? allowed : [allowed];
    if (!methods.includes(req.method)) {
        throw new ApiError(405, 'Method not allowed.');
    }
}
function parseJson(req, schema, message = 'Invalid request payload.') {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        throw new ApiError(400, message, parsed.error.issues);
    }
    return parsed.data;
}
function sendError(res, error) {
    if (error instanceof ApiError) {
        res.status(error.status).json(Object.assign({ success: false, error: error.message }, (error.details ? { issues: error.details } : {})));
        return;
    }
    console.error('[hostingApi] Unhandled route error:', error);
    res.status(500).json({ success: false, error: 'Unexpected server error.' });
}
const MAX_LOG_STRING_LENGTH = 700;
const MAX_LOG_ARRAY_LENGTH = 40;
const MAX_LOG_OBJECT_KEYS = 60;
const MAX_LOG_DEPTH = 4;
function truncateLogString(value) {
    return value.length > MAX_LOG_STRING_LENGTH ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}...` : value;
}
function sanitizeLogValue(value, depth = 0) {
    if (value === undefined || value === null)
        return null;
    if (typeof value === 'string')
        return truncateLogString(value);
    if (typeof value === 'number' || typeof value === 'boolean')
        return value;
    if (value instanceof Date)
        return value.toISOString();
    if (value instanceof admin.firestore.Timestamp)
        return value.toDate().toISOString();
    if (depth >= MAX_LOG_DEPTH)
        return '[truncated]';
    if (Array.isArray(value)) {
        return value.slice(0, MAX_LOG_ARRAY_LENGTH).map((item) => sanitizeLogValue(item, depth + 1));
    }
    if (typeof value === 'object') {
        return Object.entries(value)
            .slice(0, MAX_LOG_OBJECT_KEYS)
            .reduce((result, [key, item]) => {
            if (key.trim())
                result[truncateLogString(key)] = sanitizeLogValue(item, depth + 1);
            return result;
        }, {});
    }
    return String(value);
}
async function writeActivityLog(input) {
    var _a, _b;
    const referer = input.req.header('referer');
    let route = input.route || input.req.path;
    if (!input.route && referer) {
        try {
            const url = new URL(referer);
            route = `${url.pathname}${url.search}`;
        }
        catch (_c) {
            // The request path is a safe fallback for a malformed Referer.
        }
    }
    const ref = await firestore_1.db.collection('activityLogs').add({
        action: truncateLogString(input.action.trim()),
        actor: {
            uid: input.auth.uid,
            email: (_a = input.auth.email) !== null && _a !== void 0 ? _a : null,
            role: (_b = input.auth.role) !== null && _b !== void 0 ? _b : null,
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
        userAgent: input.req.header('user-agent') ? truncateLogString(input.req.header('user-agent') || '') : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
}
async function writeActivityLogSafely(input) {
    await writeActivityLog(input).catch((error) => {
        console.warn('[hostingApi] Failed to write activity log:', error);
    });
}
function formatTimestamp(value) {
    if (value instanceof admin.firestore.Timestamp)
        return value.toDate().toISOString();
    if (typeof value === 'string')
        return value;
    return null;
}
//# sourceMappingURL=hostingCommon.js.map