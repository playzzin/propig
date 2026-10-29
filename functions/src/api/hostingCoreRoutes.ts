import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import {
    ApiError,
    db,
    formatTimestamp,
    isRecord,
    parseJson,
    requireAccess,
    requireAdmin,
    requireMethod,
    requireUser,
    writeActivityLog,
    writeActivityLogSafely,
} from './hostingCommon';
import { enforceUserRateLimit, fetchExternalHttpUrl, normalizeExternalHttpUrl } from './security';

type ActivityLogRecord = {
    id: string;
    action: string;
    actor: { uid: string; email: string | null; role: string | null; isAdmin: boolean };
    target: { type: string; id: string | null; path: string | null; label: string | null };
    summary: string | null;
    metadata: Record<string, unknown>;
    route: string | null;
    userAgent: string | null;
    createdAt: string | null;
};

const ActivityLogSchema = z.object({
    action: z.string().min(1).max(120),
    target: z.object({
        type: z.string().min(1).max(80),
        id: z.string().max(240).optional().nullable(),
        path: z.string().max(500).optional().nullable(),
        label: z.string().max(240).optional().nullable(),
    }),
    summary: z.string().max(700).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    route: z.string().max(500).optional(),
});

function mapActivityLog(
    snapshot: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
): ActivityLogRecord {
    const data = snapshot.data() || {};
    return {
        id: snapshot.id,
        action: typeof data.action === 'string' ? data.action : 'unknown',
        actor: {
            uid: typeof data.actor?.uid === 'string' ? data.actor.uid : 'unknown',
            email: typeof data.actor?.email === 'string' ? data.actor.email : null,
            role: typeof data.actor?.role === 'string' ? data.actor.role : null,
            isAdmin: data.actor?.isAdmin === true,
        },
        target: {
            type: typeof data.target?.type === 'string' ? data.target.type : 'unknown',
            id: typeof data.target?.id === 'string' ? data.target.id : null,
            path: typeof data.target?.path === 'string' ? data.target.path : null,
            label: typeof data.target?.label === 'string' ? data.target.label : null,
        },
        summary: typeof data.summary === 'string' ? data.summary : null,
        metadata: isRecord(data.metadata) ? data.metadata : {},
        route: typeof data.route === 'string' ? data.route : null,
        userAgent: typeof data.userAgent === 'string' ? data.userAgent : null,
        createdAt: formatTimestamp(data.createdAt),
    };
}

function matchesActivityFilters(
    log: ActivityLogRecord,
    input: { scope: string; action: string | null; search: string },
): boolean {
    if (input.action && log.action !== input.action) return false;
    if (input.scope === 'erp-home' && !['erp_home.module_opened', 'erp_home.command_executed'].includes(log.action)) {
        return false;
    }
    if (input.scope === 'module-opened' && log.action !== 'erp_home.module_opened') return false;
    if (input.scope === 'command-executed' && log.action !== 'erp_home.command_executed') return false;
    const query = input.search.trim().toLocaleLowerCase('ko-KR');
    if (!query) return true;
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

export async function handleActivityLogs(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const payload = parseJson(req, ActivityLogSchema, 'Invalid activity log payload.');
    const id = await writeActivityLog({ auth, req, ...payload });
    res.status(200).json({ ok: true, id });
}

export async function handleAdminActivityLogs(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'GET');
    await requireAdmin(req);
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
    const collection = db.collection('activityLogs');
    const [cursorSnapshot, selectedSnapshot] = await Promise.all([
        cursor ? collection.doc(cursor).get() : Promise.resolve(null),
        selectedId ? collection.doc(selectedId).get() : Promise.resolve(null),
    ]);
    let query: FirebaseFirestore.Query = collection.orderBy('createdAt', 'desc');
    if (cursorSnapshot?.exists) query = query.startAfter(cursorSnapshot);
    const selectedLog = selectedSnapshot?.exists ? mapActivityLog(selectedSnapshot) : null;
    const selectedLogMatched = selectedLog ? matchesActivityFilters(selectedLog, filters) : selectedId ? false : null;
    const resultLimit = selectedLog && selectedLogMatched && !cursor ? Math.max(limit - 1, 1) : limit;
    const logs: ActivityLogRecord[] = [];
    let scannedCount = 0;
    let hasMore = false;
    let lastScanned: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    while (logs.length < resultLimit && scannedCount < scanLimit) {
        const batchLimit = Math.min(Math.max(limit * 2, 50), 100, scanLimit - scannedCount);
        const snapshot = await query.limit(batchLimit + 1).get();
        const docs = snapshot.docs.slice(0, batchLimit);
        hasMore = snapshot.docs.length > batchLimit;
        for (const [index, doc] of docs.entries()) {
            lastScanned = doc;
            scannedCount += 1;
            const log = mapActivityLog(doc);
            if (matchesActivityFilters(log, filters) && log.id !== selectedLog?.id) logs.push(log);
            if (logs.length >= resultLimit) {
                hasMore = hasMore || index < docs.length - 1;
                break;
            }
        }
        if (!hasMore || !lastScanned) break;
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

function validateMenuItem(value: unknown, ancestors: Set<object>): boolean {
    if (!isRecord(value) || ancestors.has(value)) return false;
    if (typeof value.id !== 'string' || !value.id || typeof value.text !== 'string' || !value.text) return false;
    for (const key of ['path', 'icon', 'propigAppId']) {
        if (value[key] !== undefined && typeof value[key] !== 'string') return false;
    }
    for (const key of ['expanded', 'external', 'hidden']) {
        if (value[key] !== undefined && typeof value[key] !== 'boolean') return false;
    }
    for (const key of ['roles', 'permissions', 'position']) {
        if (value[key] !== undefined && (!Array.isArray(value[key]) || !(value[key] as unknown[]).every((item) => typeof item === 'string'))) {
            return false;
        }
    }
    if (value.type !== undefined && (typeof value.type !== 'string' || !MENU_ITEM_TYPES.has(value.type))) return false;
    if (value.badge !== undefined && typeof value.badge !== 'string' && typeof value.badge !== 'number') return false;
    if (value.sub !== undefined) {
        if (!Array.isArray(value.sub)) return false;
        ancestors.add(value);
        const valid = value.sub.every((item) => typeof item === 'string' || validateMenuItem(item, ancestors));
        ancestors.delete(value);
        if (!valid) return false;
    }
    return true;
}

function validateSites(value: unknown): value is Record<string, Record<string, unknown>> {
    return isRecord(value) && Object.values(value).every((site) =>
        isRecord(site) &&
        typeof site.name === 'string' &&
        Boolean(site.name) &&
        typeof site.icon === 'string' &&
        Boolean(site.icon) &&
        Array.isArray(site.menu) &&
        Array.isArray(site.trash) &&
        site.menu.every((item) => validateMenuItem(item, new Set())) &&
        site.trash.every((item) => validateMenuItem(item, new Set())),
    );
}

function countMenuItems(items: unknown[]): number {
    return items.reduce<number>((total, item) => {
        if (!isRecord(item)) return total;
        return total + 1 + (Array.isArray(item.sub)
            ? countMenuItems(item.sub.filter((child) => typeof child !== 'string'))
            : 0);
    }, 0);
}

function summarizeSites(sites: Record<string, Record<string, unknown>>) {
    return {
        siteCount: Object.keys(sites).length,
        siteIds: Object.keys(sites),
        menuItemCount: Object.values(sites).reduce(
            (total, site) => total + countMenuItems(Array.isArray(site.menu) ? site.menu : []),
            0,
        ),
    };
}

export async function handleAdminMenuSites(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'PUT');
    const auth = await requireAccess(req, 'menuManagement');
    if (!isRecord(req.body) || !validateSites(req.body.sites)) {
        throw new ApiError(400, '유효하지 않은 메뉴 데이터입니다.');
    }
    const ref = db.collection('menuSettings').doc('sites');
    const current = await ref.get();
    const previousSites = current.exists && validateSites(current.data()?.sites) ? current.data()?.sites : null;
    await ref.set({
        // Keep synchronized with src/constants/menuSettingsContract.ts. The
        // admin-menu contract verifier crosses the independent deploy boundary.
        version: 46,
        sites: req.body.sites,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
    }, { mergeFields: ['version', 'sites', 'updatedAt', 'updatedBy'] });
    await writeActivityLogSafely({
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

const ModuleHrefSchema = z.string().trim().min(1).max(180).regex(/^\/[A-Za-z0-9/_?=&.#~-]*$/);
const ErpPreferencesSchema = z.object({
    pinnedModuleHrefs: z.array(ModuleHrefSchema).max(6).default([]),
});

function normalizePinnedModuleHrefs(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value))
        .map((item) => ModuleHrefSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
        .slice(0, 6);
}

export async function handleErpHomePreferences(req: Request, res: Response): Promise<void> {
    requireMethod(req, ['GET', 'PUT']);
    const auth = await requireUser(req);
    const ref = db.collection('users').doc(auth.uid).collection('preferences').doc('erpHome');
    if (req.method === 'GET') {
        const snapshot = await ref.get();
        res.status(200).json({
            pinnedModuleHrefs: normalizePinnedModuleHrefs(snapshot.data()?.pinnedModuleHrefs),
            updatedAt: formatTimestamp(snapshot.data()?.updatedAt),
        });
        return;
    }
    const payload = parseJson(req, ErpPreferencesSchema, 'Invalid ERP home preferences payload.');
    const pinnedModuleHrefs = normalizePinnedModuleHrefs(payload.pinnedModuleHrefs);
    await ref.set({
        pinnedModuleHrefs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: { uid: auth.uid, email: auth.email ?? null },
    }, { merge: true });
    res.status(200).json({ pinnedModuleHrefs, updatedAt: new Date().toISOString() });
}

const FetchImageSchema = z.object({
    url: z.string().url().max(4096),
    fileName: z.string().max(240).optional(),
});
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
    avif: 'image/avif',
    gif: 'image/gif',
    ico: 'image/x-icon',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
};

async function readCappedImage(response: globalThis.Response): Promise<Buffer> {
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_IMAGE_BYTES) {
        await response.body?.cancel();
        throw new ApiError(413, '이미지 크기가 25MB를 초과합니다.');
    }
    const reader = response.body?.getReader();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_IMAGE_BYTES) throw new ApiError(413, '이미지 크기가 25MB를 초과합니다.');
        return buffer;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
            await reader.cancel();
            throw new ApiError(413, '이미지 크기가 25MB를 초과합니다.');
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}

export async function handleFetchImage(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const rateLimit = await enforceUserRateLimit({
        namespace: 'fetch-image',
        uid: auth.uid,
        maxRequests: 30,
        windowMs: 60_000,
    });
    if ('retryAfterSeconds' in rateLimit) {
        res.set('Retry-After', String(rateLimit.retryAfterSeconds));
        throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    }
    const payload = parseJson(req, FetchImageSchema, '이미지 원본 요청 형식이 올바르지 않습니다.');
    let safeUrl: string;
    try {
        safeUrl = normalizeExternalHttpUrl(payload.url);
    } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : '올바르지 않은 이미지 URL입니다.');
    }
    const source = await fetchExternalHttpUrl(safeUrl, {
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8,*/*;q=0.5' },
    });
    if (!source.ok) {
        await source.body?.cancel();
        throw new ApiError(502, `이미지 원본을 불러오지 못했습니다. (${source.status})`);
    }
    const path = new URL(safeUrl).pathname;
    const extension = (payload.fileName || path).toLowerCase().split('?')[0].match(/\.([a-z0-9]+)$/)?.[1] || '';
    const sourceType = source.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
    const fallbackType = MIME_BY_EXTENSION[extension] || '';
    if (!sourceType.startsWith('image/') && !(fallbackType && (!sourceType || sourceType === 'application/octet-stream'))) {
        await source.body?.cancel();
        throw new ApiError(415, '이미지 파일만 불러올 수 있습니다.');
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
