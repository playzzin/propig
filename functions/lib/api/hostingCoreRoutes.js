"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleActivityLogs = handleActivityLogs;
exports.handleAdminActivityLogs = handleAdminActivityLogs;
exports.handleAdminMenuSites = handleAdminMenuSites;
exports.handleErpHomePreferences = handleErpHomePreferences;
exports.handleFetchImage = handleFetchImage;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const hostingCommon_1 = require("./hostingCommon");
const security_1 = require("./security");
const ActivityLogSchema = zod_1.z.object({
    action: zod_1.z.string().min(1).max(120),
    target: zod_1.z.object({
        type: zod_1.z.string().min(1).max(80),
        id: zod_1.z.string().max(240).optional().nullable(),
        path: zod_1.z.string().max(500).optional().nullable(),
        label: zod_1.z.string().max(240).optional().nullable(),
    }),
    summary: zod_1.z.string().max(700).optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    route: zod_1.z.string().max(500).optional(),
});
function mapActivityLog(snapshot) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const data = snapshot.data() || {};
    return {
        id: snapshot.id,
        action: typeof data.action === 'string' ? data.action : 'unknown',
        actor: {
            uid: typeof ((_a = data.actor) === null || _a === void 0 ? void 0 : _a.uid) === 'string' ? data.actor.uid : 'unknown',
            email: typeof ((_b = data.actor) === null || _b === void 0 ? void 0 : _b.email) === 'string' ? data.actor.email : null,
            role: typeof ((_c = data.actor) === null || _c === void 0 ? void 0 : _c.role) === 'string' ? data.actor.role : null,
            isAdmin: ((_d = data.actor) === null || _d === void 0 ? void 0 : _d.isAdmin) === true,
        },
        target: {
            type: typeof ((_e = data.target) === null || _e === void 0 ? void 0 : _e.type) === 'string' ? data.target.type : 'unknown',
            id: typeof ((_f = data.target) === null || _f === void 0 ? void 0 : _f.id) === 'string' ? data.target.id : null,
            path: typeof ((_g = data.target) === null || _g === void 0 ? void 0 : _g.path) === 'string' ? data.target.path : null,
            label: typeof ((_h = data.target) === null || _h === void 0 ? void 0 : _h.label) === 'string' ? data.target.label : null,
        },
        summary: typeof data.summary === 'string' ? data.summary : null,
        metadata: (0, hostingCommon_1.isRecord)(data.metadata) ? data.metadata : {},
        route: typeof data.route === 'string' ? data.route : null,
        userAgent: typeof data.userAgent === 'string' ? data.userAgent : null,
        createdAt: (0, hostingCommon_1.formatTimestamp)(data.createdAt),
    };
}
function matchesActivityFilters(log, input) {
    if (input.action && log.action !== input.action)
        return false;
    if (input.scope === 'erp-home' && !['erp_home.module_opened', 'erp_home.command_executed'].includes(log.action)) {
        return false;
    }
    if (input.scope === 'module-opened' && log.action !== 'erp_home.module_opened')
        return false;
    if (input.scope === 'command-executed' && log.action !== 'erp_home.command_executed')
        return false;
    const query = input.search.trim().toLocaleLowerCase('ko-KR');
    if (!query)
        return true;
    const haystack = [
        log.id,
        log.action,
        log.summary || '',
        log.target.label || '',
        log.target.path || '',
        log.target.id || '',
        log.target.type,
        log.actor.uid,
        log.actor.email || '',
        log.route || '',
        ...Object.values(log.metadata).filter((value) => ['string', 'number', 'boolean'].includes(typeof value)),
    ].join(' ').toLocaleLowerCase('ko-KR');
    return query.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
}
async function handleActivityLogs(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const payload = (0, hostingCommon_1.parseJson)(req, ActivityLogSchema, 'Invalid activity log payload.');
    const id = await (0, hostingCommon_1.writeActivityLog)(Object.assign({ auth, req }, payload));
    res.status(200).json({ ok: true, id });
}
async function handleAdminActivityLogs(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'GET');
    await (0, hostingCommon_1.requireAdmin)(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const scanLimit = Math.min(Math.max(Number(req.query.scanLimit) || 500, 1), 1000);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 240) : null;
    const selectedId = typeof req.query.log === 'string' ? req.query.log.slice(0, 240) : null;
    const actionValue = typeof req.query.action === 'string' ? req.query.action.trim().slice(0, 120) : '';
    const filters = {
        scope: typeof req.query.scope === 'string' ? req.query.scope : 'all',
        action: actionValue && actionValue !== 'all' ? actionValue : null,
        search: typeof req.query.q === 'string'
            ? req.query.q.trim().slice(0, 120)
            : typeof req.query.search === 'string'
                ? req.query.search.trim().slice(0, 120)
                : '',
    };
    const collection = hostingCommon_1.db.collection('activityLogs');
    const [cursorSnapshot, selectedSnapshot] = await Promise.all([
        cursor ? collection.doc(cursor).get() : Promise.resolve(null),
        selectedId ? collection.doc(selectedId).get() : Promise.resolve(null),
    ]);
    let query = collection.orderBy('createdAt', 'desc');
    if (cursorSnapshot === null || cursorSnapshot === void 0 ? void 0 : cursorSnapshot.exists)
        query = query.startAfter(cursorSnapshot);
    const selectedLog = (selectedSnapshot === null || selectedSnapshot === void 0 ? void 0 : selectedSnapshot.exists) ? mapActivityLog(selectedSnapshot) : null;
    const selectedLogMatched = selectedLog ? matchesActivityFilters(selectedLog, filters) : selectedId ? false : null;
    const resultLimit = selectedLog && selectedLogMatched && !cursor ? Math.max(limit - 1, 1) : limit;
    const logs = [];
    let scannedCount = 0;
    let hasMore = false;
    let lastScanned = null;
    while (logs.length < resultLimit && scannedCount < scanLimit) {
        const batchLimit = Math.min(Math.max(limit * 2, 50), 100, scanLimit - scannedCount);
        const snapshot = await query.limit(batchLimit + 1).get();
        const docs = snapshot.docs.slice(0, batchLimit);
        hasMore = snapshot.docs.length > batchLimit;
        for (const [index, doc] of docs.entries()) {
            lastScanned = doc;
            scannedCount += 1;
            const log = mapActivityLog(doc);
            if (matchesActivityFilters(log, filters) && log.id !== (selectedLog === null || selectedLog === void 0 ? void 0 : selectedLog.id))
                logs.push(log);
            if (logs.length >= resultLimit) {
                hasMore = hasMore || index < docs.length - 1;
                break;
            }
        }
        if (!hasMore || !lastScanned)
            break;
        query = collection.orderBy('createdAt', 'desc').startAfter(lastScanned);
    }
    if (selectedLog && selectedLogMatched && !cursor && !logs.some((log) => log.id === selectedLog.id)) {
        logs.unshift(selectedLog);
    }
    res.status(200).json({
        logs,
        nextCursor: hasMore && lastScanned ? lastScanned.id : null,
        matchedCount: logs.length,
        scannedCount,
        scanLimitReached: Boolean(hasMore && lastScanned),
        selectedLogMatched,
    });
}
const MENU_ITEM_TYPES = new Set(['folder', 'link', 'divider']);
function validateMenuItem(value, ancestors) {
    if (!(0, hostingCommon_1.isRecord)(value) || ancestors.has(value))
        return false;
    if (typeof value.id !== 'string' || !value.id || typeof value.text !== 'string' || !value.text)
        return false;
    for (const key of ['path', 'icon', 'propigAppId']) {
        if (value[key] !== undefined && typeof value[key] !== 'string')
            return false;
    }
    for (const key of ['expanded', 'external', 'hidden']) {
        if (value[key] !== undefined && typeof value[key] !== 'boolean')
            return false;
    }
    for (const key of ['roles', 'permissions', 'position']) {
        if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every((item) => typeof item === 'string'))) {
            return false;
        }
    }
    if (value.type !== undefined && (typeof value.type !== 'string' || !MENU_ITEM_TYPES.has(value.type)))
        return false;
    if (value.badge !== undefined && typeof value.badge !== 'string' && typeof value.badge !== 'number')
        return false;
    if (value.sub !== undefined) {
        if (!Array.isArray(value.sub))
            return false;
        ancestors.add(value);
        const valid = value.sub.every((item) => typeof item === 'string' || validateMenuItem(item, ancestors));
        ancestors.delete(value);
        if (!valid)
            return false;
    }
    return true;
}
function validateSites(value) {
    return (0, hostingCommon_1.isRecord)(value) && Object.values(value).every((site) => (0, hostingCommon_1.isRecord)(site) &&
        typeof site.name === 'string' &&
        Boolean(site.name) &&
        typeof site.icon === 'string' &&
        Boolean(site.icon) &&
        Array.isArray(site.menu) &&
        Array.isArray(site.trash) &&
        site.menu.every((item) => validateMenuItem(item, new Set())) &&
        site.trash.every((item) => validateMenuItem(item, new Set())));
}
function countMenuItems(items) {
    return items.reduce((total, item) => {
        if (!(0, hostingCommon_1.isRecord)(item))
            return total;
        return total + 1 + (Array.isArray(item.sub)
            ? countMenuItems(item.sub.filter((child) => typeof child !== 'string'))
            : 0);
    }, 0);
}
function summarizeSites(sites) {
    return {
        siteCount: Object.keys(sites).length,
        siteIds: Object.keys(sites),
        menuItemCount: Object.values(sites).reduce((total, site) => total + countMenuItems(Array.isArray(site.menu) ? site.menu : []), 0),
    };
}
async function handleAdminMenuSites(req, res) {
    var _a, _b;
    (0, hostingCommon_1.requireMethod)(req, 'PUT');
    const auth = await (0, hostingCommon_1.requireAccess)(req, 'menuManagement');
    if (!(0, hostingCommon_1.isRecord)(req.body) || !validateSites(req.body.sites)) {
        throw new hostingCommon_1.ApiError(400, '유효하지 않은 메뉴 데이터입니다.');
    }
    const ref = hostingCommon_1.db.collection('menuSettings').doc('sites');
    const current = await ref.get();
    const previousSites = current.exists && validateSites((_a = current.data()) === null || _a === void 0 ? void 0 : _a.sites) ? (_b = current.data()) === null || _b === void 0 ? void 0 : _b.sites : null;
    await ref.set({
        version: 45,
        sites: req.body.sites,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
    }, { merge: true });
    await (0, hostingCommon_1.writeActivityLogSafely)({
        auth,
        req,
        action: 'admin.menu.update',
        target: { type: 'menuSettings', id: 'sites', label: '통합 메뉴' },
        summary: '관리자 API를 통해 통합 메뉴를 저장했습니다.',
        metadata: {
            before: previousSites ? summarizeSites(previousSites) : null,
            after: summarizeSites(req.body.sites),
        },
    });
    res.status(200).json({ ok: true });
}
const ModuleHrefSchema = zod_1.z.string().trim().min(1).max(180).regex(/^\/[A-Za-z0-9/_?=&.#~-]*$/);
const ErpPreferencesSchema = zod_1.z.object({
    pinnedModuleHrefs: zod_1.z.array(ModuleHrefSchema).max(6).default([]),
});
function normalizePinnedModuleHrefs(value) {
    if (!Array.isArray(value))
        return [];
    return Array.from(new Set(value))
        .map((item) => ModuleHrefSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
        .slice(0, 6);
}
async function handleErpHomePreferences(req, res) {
    var _a, _b, _c;
    (0, hostingCommon_1.requireMethod)(req, ['GET', 'PUT']);
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const ref = hostingCommon_1.db.collection('users').doc(auth.uid).collection('preferences').doc('erpHome');
    if (req.method === 'GET') {
        const snapshot = await ref.get();
        res.status(200).json({
            pinnedModuleHrefs: normalizePinnedModuleHrefs((_a = snapshot.data()) === null || _a === void 0 ? void 0 : _a.pinnedModuleHrefs),
            updatedAt: (0, hostingCommon_1.formatTimestamp)((_b = snapshot.data()) === null || _b === void 0 ? void 0 : _b.updatedAt),
        });
        return;
    }
    const payload = (0, hostingCommon_1.parseJson)(req, ErpPreferencesSchema, 'Invalid ERP home preferences payload.');
    const pinnedModuleHrefs = normalizePinnedModuleHrefs(payload.pinnedModuleHrefs);
    await ref.set({
        pinnedModuleHrefs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: { uid: auth.uid, email: (_c = auth.email) !== null && _c !== void 0 ? _c : null },
    }, { merge: true });
    res.status(200).json({ pinnedModuleHrefs, updatedAt: new Date().toISOString() });
}
const FetchImageSchema = zod_1.z.object({
    url: zod_1.z.string().url().max(4096),
    fileName: zod_1.z.string().max(240).optional(),
});
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
const MIME_BY_EXTENSION = {
    avif: 'image/avif',
    gif: 'image/gif',
    ico: 'image/x-icon',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
};
async function readCappedImage(response) {
    var _a, _b;
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_IMAGE_BYTES) {
        await ((_a = response.body) === null || _a === void 0 ? void 0 : _a.cancel());
        throw new hostingCommon_1.ApiError(413, '이미지 크기가 100MB를 초과합니다.');
    }
    const reader = (_b = response.body) === null || _b === void 0 ? void 0 : _b.getReader();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_IMAGE_BYTES)
            throw new hostingCommon_1.ApiError(413, '이미지 크기가 100MB를 초과합니다.');
        return buffer;
    }
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
            await reader.cancel();
            throw new hostingCommon_1.ApiError(413, '이미지 크기가 100MB를 초과합니다.');
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}
async function handleFetchImage(req, res) {
    var _a, _b, _c, _d;
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    await (0, hostingCommon_1.requireUser)(req);
    const payload = (0, hostingCommon_1.parseJson)(req, FetchImageSchema, '이미지 원본 요청 형식이 올바르지 않습니다.');
    let safeUrl;
    try {
        safeUrl = (0, security_1.normalizeExternalHttpUrl)(payload.url);
    }
    catch (error) {
        throw new hostingCommon_1.ApiError(400, error instanceof Error ? error.message : '올바르지 않은 이미지 URL입니다.');
    }
    const source = await (0, security_1.fetchExternalHttpUrl)(safeUrl, {
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8,*/*;q=0.5' },
    });
    if (!source.ok) {
        await ((_a = source.body) === null || _a === void 0 ? void 0 : _a.cancel());
        throw new hostingCommon_1.ApiError(502, `이미지 원본을 불러오지 못했습니다. (${source.status})`);
    }
    const path = new URL(safeUrl).pathname;
    const extension = ((_b = (payload.fileName || path).toLowerCase().split('?')[0].match(/\.([a-z0-9]+)$/)) === null || _b === void 0 ? void 0 : _b[1]) || '';
    const sourceType = ((_c = source.headers.get('content-type')) === null || _c === void 0 ? void 0 : _c.split(';')[0].trim().toLowerCase()) || '';
    const fallbackType = MIME_BY_EXTENSION[extension] || '';
    if (!sourceType.startsWith('image/') && !(fallbackType && (!sourceType || sourceType === 'application/octet-stream'))) {
        await ((_d = source.body) === null || _d === void 0 ? void 0 : _d.cancel());
        throw new hostingCommon_1.ApiError(415, '이미지 파일만 불러올 수 있습니다.');
    }
    const buffer = await readCappedImage(source);
    res.set({
        'Content-Type': sourceType.startsWith('image/') ? sourceType : fallbackType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    });
    res.status(200).send(buffer);
}
//# sourceMappingURL=hostingCoreRoutes.js.map