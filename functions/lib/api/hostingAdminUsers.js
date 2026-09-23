"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminUsers = handleAdminUsers;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const adminUserUpdateSafety_1 = require("./adminUserUpdateSafety");
const hostingCommon_1 = require("./hostingCommon");
const USER_POSITIONS = ['ceo', 'manager', 'staff', 'intern'];
// Keep validation and paging contracts in parity with the other admin-users entrypoint.
const isSafeKey = (key, maxLength) => key.length > 0 && key.length <= maxLength && key === key.trim() &&
    !/[\u0000-\u001f\u007f]/.test(key) && !/^__.*__$/.test(key) &&
    key !== 'prototype' && !Object.prototype.hasOwnProperty.call(Object.prototype, key);
const booleanMap = (maxKeyLength) => zod_1.z.record(zod_1.z.string().refine((key) => isSafeKey(key, maxKeyLength)), zod_1.z.boolean()).refine((value) => Object.keys(value).length <= 100).default({});
// Inspect raw own keys before Zod can strip prototype-related keys.
const safePayloadKeys = zod_1.z.unknown().refine((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const record = value;
    return [record, record.siteAccess, record.menuAccess, record.permissions].every((entry) => !entry || typeof entry !== 'object' || Object.keys(entry).every((key) => isSafeKey(key, 160)));
});
const PageQuerySchema = zod_1.z.object({ pageToken: zod_1.z.string().min(1).max(2048).optional(), uid: zod_1.z.string().min(1).max(128).regex(/^[^/\x00-\x1f]+$/).optional() }).strict().refine(value => !(value.uid && value.pageToken));
const UPDATE_UNCERTAIN = {
    error: '변경이 일부 반영되었을 수 있습니다. 새로고침 후 상태를 확인하고 관리자에게 복구를 요청해 주세요.',
    code: 'USER_UPDATE_UNCERTAIN',
};
const errorCode = (error) => error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined;
const UpdateUserSchema = safePayloadKeys.pipe(zod_1.z.object({
    expectedRevision: zod_1.z.string().regex(/^[a-f0-9]{64}$/),
    uid: zod_1.z.string().min(1).max(128).refine((uid) => isSafeKey(uid, 128) && !uid.includes('/') && uid !== '.' && uid !== '..'),
    role: zod_1.z.enum(['admin', 'user', 'partner', 'guest']),
    position: zod_1.z.enum(USER_POSITIONS),
    siteAccess: booleanMap(80),
    menuAccess: booleanMap(160),
    permissions: zod_1.z.object({
        menuManagement: zod_1.z.boolean().optional(),
        userManagement: zod_1.z.boolean().optional(),
        projectBoardManagement: zod_1.z.boolean().optional(),
        photoManagement: zod_1.z.boolean().optional(),
        storageManagement: zod_1.z.boolean().optional(),
    }).strict().default({}),
    disabled: zod_1.z.boolean().optional(),
}).strict());
const storage = {
    canPersist: true,
    credentialMode: 'firebase-functions-runtime',
    message: null,
};
function normalizeRole(value, fallback = 'user') {
    return value === 'admin' || value === 'user' || value === 'partner' || value === 'guest'
        ? value
        : fallback;
}
function normalizePosition(value) {
    return USER_POSITIONS.includes(value) ? value : 'staff';
}
function sanitizeBooleanMap(value, maxKeyLength) {
    if (!(0, hostingCommon_1.isRecord)(value))
        return {};
    return Object.entries(value).reduce((result, [key, enabled]) => {
        const normalized = key.trim();
        if (isSafeKey(normalized, maxKeyLength))
            result[normalized] = enabled === true;
        return result;
    }, {});
}
function normalizePermissions(role, value, claims = {}) {
    if (role === 'admin')
        return (0, hostingCommon_1.allPermissions)();
    const source = (0, hostingCommon_1.isRecord)(value) ? value : {};
    const aliases = {
        menuManagement: 'menuManager',
        userManagement: 'userManager',
        projectBoardManagement: 'projectBoardManager',
        photoManagement: 'photoManager',
        storageManagement: 'storageManager',
    };
    return hostingCommon_1.USER_PERMISSION_KEYS.reduce((result, key) => {
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
function buildManagedUser(user, access, hasAdminDoc) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const claims = (0, hostingCommon_1.isRecord)(user.customClaims) ? user.customClaims : {};
    const claimAdmin = claims.admin === true || claims.role === 'admin';
    const role = claimAdmin || hasAdminDoc
        ? 'admin' : normalizeRole((_a = access === null || access === void 0 ? void 0 : access.role) !== null && _a !== void 0 ? _a : claims.role);
    return {
        revision: (0, adminUserUpdateSafety_1.managedUserRevision)(user, access, hasAdminDoc),
        uid: user.uid,
        email: (_c = (_b = user.email) !== null && _b !== void 0 ? _b : access === null || access === void 0 ? void 0 : access.email) !== null && _c !== void 0 ? _c : null,
        displayName: (_e = (_d = user.displayName) !== null && _d !== void 0 ? _d : access === null || access === void 0 ? void 0 : access.displayName) !== null && _e !== void 0 ? _e : null,
        photoURL: (_g = (_f = user.photoURL) !== null && _f !== void 0 ? _f : access === null || access === void 0 ? void 0 : access.photoURL) !== null && _g !== void 0 ? _g : null,
        disabled: user.disabled,
        emailVerified: user.emailVerified,
        providerIds: user.providerData.map((provider) => provider.providerId),
        createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : null,
        lastSignInAt: user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toISOString() : null,
        role,
        position: normalizePosition((_h = access === null || access === void 0 ? void 0 : access.position) !== null && _h !== void 0 ? _h : claims.position),
        siteAccess: Object.assign(Object.assign({}, sanitizeBooleanMap(claims.siteAccess, 80)), sanitizeBooleanMap(access === null || access === void 0 ? void 0 : access.siteAccess, 80)),
        menuAccess: Object.assign(Object.assign({}, sanitizeBooleanMap(claims.menuAccess, 160)), sanitizeBooleanMap(access === null || access === void 0 ? void 0 : access.menuAccess, 160)),
        permissions: normalizePermissions(role, (_j = access === null || access === void 0 ? void 0 : access.permissions) !== null && _j !== void 0 ? _j : claims.permissions, claims),
        updatedAt: (0, hostingCommon_1.formatTimestamp)(access === null || access === void 0 ? void 0 : access.updatedAt),
        updatedBy: typeof (access === null || access === void 0 ? void 0 : access.updatedBy) === 'string' ? access.updatedBy : null,
        isAdminDocLinked: hasAdminDoc,
    };
}
async function handleList(req, res) {
    var _a;
    await (0, hostingCommon_1.requireAccess)(req, 'userManagement');
    const payload = PageQuerySchema.safeParse(req.query);
    if (!payload.success)
        throw new hostingCommon_1.ApiError(400, '목록 조회 조건이 올바르지 않습니다.');
    const page = payload.data.uid
        ? { users: [await admin.auth().getUser(payload.data.uid)], pageToken: undefined }
        : await admin.auth().listUsers(100, payload.data.pageToken);
    const users = page.users;
    const accessRefs = users.map((user) => hostingCommon_1.db.collection('userAccess').doc(user.uid));
    const adminRefs = users.map((user) => hostingCommon_1.db.collection('admins').doc(user.uid));
    const [accessSnapshots, adminSnapshots] = users.length
        ? await Promise.all([hostingCommon_1.db.getAll(...accessRefs), hostingCommon_1.db.getAll(...adminRefs)])
        : [[], []];
    const accessDocs = new Map(accessSnapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => [snapshot.id, snapshot.data()]));
    const adminDocs = new Set(adminSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id));
    const managedUsers = users
        .map((user) => buildManagedUser(user, accessDocs.get(user.uid) || null, adminDocs.has(user.uid)))
        .sort((left, right) => {
        if (left.role === 'admin' && right.role !== 'admin')
            return -1;
        if (left.role !== 'admin' && right.role === 'admin')
            return 1;
        return (left.email || left.displayName || left.uid).localeCompare(right.email || right.displayName || right.uid);
    });
    res.status(200).json({ users: managedUsers, storage, nextPageToken: (_a = page.pageToken) !== null && _a !== void 0 ? _a : null });
}
async function handleUpdate(req, res) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const auth = await (0, hostingCommon_1.requireAccess)(req, 'userManagement');
    let body = req.body;
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
        try {
            body = JSON.parse(body.toString());
        }
        catch (_k) {
            throw new hostingCommon_1.ApiError(400, '요청 데이터가 올바르지 않습니다.');
        }
    }
    if ((0, hostingCommon_1.isRecord)(body) && !Object.prototype.hasOwnProperty.call(body, 'expectedRevision')) {
        throw new adminUserUpdateSafety_1.UserUpdateSafetyError('USER_UPDATE_CONFLICT');
    }
    const parsed = UpdateUserSchema.safeParse(body);
    if (!parsed.success)
        throw new hostingCommon_1.ApiError(400, '요청 데이터가 올바르지 않습니다.');
    const payload = parsed.data;
    if (auth.isAdmin && payload.uid === auth.uid && (payload.role !== 'admin' || payload.disabled === true)) {
        throw new hostingCommon_1.ApiError(400, '현재 로그인한 관리자 계정은 관리자 권한을 해제하거나 비활성화할 수 없습니다.');
    }
    if (!auth.isAdmin && payload.uid === auth.uid) {
        throw new hostingCommon_1.ApiError(400, '사용자 관리 권한으로 본인 계정 권한을 변경할 수 없습니다.');
    }
    const accessRef = hostingCommon_1.db.collection('userAccess').doc(payload.uid);
    const adminRef = hostingCommon_1.db.collection('admins').doc(payload.uid);
    const [targetUser, accessSnapshot, adminSnapshot] = await Promise.all([
        admin.auth().getUser(payload.uid),
        accessRef.get(),
        adminRef.get(),
    ]);
    const existingAccess = accessSnapshot.exists ? accessSnapshot.data() : null;
    const beforeUser = buildManagedUser(targetUser, existingAccess, adminSnapshot.exists);
    if (beforeUser.revision !== payload.expectedRevision) {
        throw new adminUserUpdateSafety_1.UserUpdateSafetyError('USER_UPDATE_CONFLICT');
    }
    const existingClaims = (0, hostingCommon_1.isRecord)(targetUser.customClaims) ? targetUser.customClaims : {};
    const targetIsAdmin = existingClaims.admin === true ||
        existingClaims.role === 'admin' ||
        (existingAccess === null || existingAccess === void 0 ? void 0 : existingAccess.role) === 'admin' ||
        adminSnapshot.exists;
    if (!auth.isAdmin && (targetIsAdmin || payload.role === 'admin')) {
        throw new hostingCommon_1.ApiError(403, '사용자 관리 권한으로 관리자 계정을 변경하거나 관리자 역할을 부여할 수 없습니다.');
    }
    const permissions = normalizePermissions(payload.role, payload.permissions);
    const siteAccess = sanitizeBooleanMap(payload.siteAccess, 80);
    const menuAccess = sanitizeBooleanMap(payload.menuAccess, 160);
    const claims = Object.assign(Object.assign(Object.assign(Object.assign({}, existingClaims), { admin: payload.role === 'admin', role: payload.role, position: payload.position, siteAccess,
        menuAccess,
        permissions }), permissions), { menuManager: permissions.menuManagement, userManager: permissions.userManagement, projectBoardManager: permissions.projectBoardManagement, photoManager: permissions.photoManagement, storageManager: permissions.storageManagement });
    if (Buffer.byteLength(JSON.stringify(claims), 'utf8') > 1000) {
        throw new hostingCommon_1.ApiError(400, '권한 데이터가 Firebase custom claims 한도(1000바이트)를 초과합니다.');
    }
    const updateGuard = await (0, adminUserUpdateSafety_1.reserveUserUpdate)(hostingCommon_1.db, payload.uid, payload.expectedRevision, beforeUser.revision, async (transaction) => {
        const currentAuth = await admin.auth().getUser(payload.uid);
        const [currentAccess, currentAdmin] = await Promise.all([
            transaction.get(accessRef), transaction.get(adminRef),
        ]);
        return (0, adminUserUpdateSafety_1.managedUserRevision)(currentAuth, currentAccess.exists ? currentAccess.data() : null, currentAdmin.exists);
    }, auth.isAdmin ? {
        uid: auth.uid,
        readCurrentUser: () => admin.auth().getUser(auth.uid),
    } : undefined); // Delegated gates/target serialization stay unchanged.
    // Everything after the first mutation attempt is potentially partially applied.
    try {
        if (typeof payload.disabled === 'boolean' && payload.disabled !== targetUser.disabled) {
            await admin.auth().updateUser(payload.uid, { disabled: payload.disabled });
        }
        await admin.auth().setCustomUserClaims(payload.uid, claims);
        const updatedUser = await admin.auth().getUser(payload.uid);
        const batch = hostingCommon_1.db.batch();
        batch.set(accessRef, {
            uid: payload.uid,
            email: (_a = updatedUser.email) !== null && _a !== void 0 ? _a : null,
            displayName: (_b = updatedUser.displayName) !== null && _b !== void 0 ? _b : null,
            photoURL: (_c = updatedUser.photoURL) !== null && _c !== void 0 ? _c : null,
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
                email: (_d = updatedUser.email) !== null && _d !== void 0 ? _d : null,
                displayName: (_e = updatedUser.displayName) !== null && _e !== void 0 ? _e : null,
                photoURL: (_f = updatedUser.photoURL) !== null && _f !== void 0 ? _f : null,
                role: payload.role,
                position: payload.position,
                menuAccess,
                permissions,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: auth.uid,
            }, { mergeFields: ['uid', 'email', 'displayName', 'photoURL', 'role', 'position',
                    'menuAccess', 'permissions', 'updatedAt', 'updatedBy'] });
        }
        else {
            batch.delete(adminRef);
        }
        await batch.commit();
        const [nextAccess, nextAdmin] = await Promise.all([accessRef.get(), adminRef.get()]);
        const user = buildManagedUser(updatedUser, nextAccess.exists ? nextAccess.data() : null, nextAdmin.exists);
        await (0, adminUserUpdateSafety_1.finishUserUpdate)(hostingCommon_1.db, updateGuard);
        await (0, hostingCommon_1.writeActivityLogSafely)({
            auth,
            req,
            action: 'admin.user.update',
            target: {
                type: 'userAccess',
                id: payload.uid,
                label: (_h = (_g = updatedUser.email) !== null && _g !== void 0 ? _g : updatedUser.displayName) !== null && _h !== void 0 ? _h : payload.uid,
            },
            summary: `${(_j = updatedUser.email) !== null && _j !== void 0 ? _j : payload.uid} 계정 권한을 변경했습니다.`,
            metadata: {
                before: (0, adminUserUpdateSafety_1.userAccessAudit)(beforeUser),
                after: (0, adminUserUpdateSafety_1.userAccessAudit)(user),
            },
        });
        res.status(200).json({ ok: true, user, storage });
    }
    catch (error) {
        console.error('[Admin Users PATCH Uncertain]', error);
        await (0, adminUserUpdateSafety_1.markUserUpdateUncertain)(hostingCommon_1.db, updateGuard);
        res.status(503).json(UPDATE_UNCERTAIN);
    }
}
async function handleAdminUsers(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        (0, hostingCommon_1.requireMethod)(req, ['GET', 'PATCH']);
        if (req.method === 'GET')
            return await handleList(req, res);
        return await handleUpdate(req, res);
    }
    catch (error) {
        if (error instanceof adminUserUpdateSafety_1.UserUpdateSafetyError) {
            res.status(error.status).json({ error: error.message, code: error.code });
            return;
        }
        if (error instanceof hostingCommon_1.ApiError) {
            res.status(error.status).json({ error: error.message });
            return;
        }
        console.error('[Admin Users Error]', error);
        const code = errorCode(error);
        const notFound = code === 'auth/user-not-found';
        const invalid = code === 'auth/invalid-page-token' || code === 'auth/invalid-uid' || code === 'auth/invalid-argument';
        res.status(notFound ? 404 : invalid ? 400 : 503).json({
            error: notFound ? '사용자를 찾을 수 없습니다.' : invalid
                ? '요청 데이터가 올바르지 않습니다.' : '사용자 권한 저장소에 연결할 수 없습니다.',
        });
    }
}
//# sourceMappingURL=hostingAdminUsers.js.map