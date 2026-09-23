"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionInboxError = exports.ProductionInboxQuerySchema = exports.ProductionInboxSourceSchema = exports.PRODUCTION_INBOX_PAGE_SIZE = void 0;
exports.productionInboxErrorResponse = productionInboxErrorResponse;
exports.createProductionInboxService = createProductionInboxService;
const node_buffer_1 = require("node:buffer");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
// Keep byte-identical to functions/src/api/productionInbox.ts.
// This is a projection of existing stores, not a new truth store or a recovery API.
exports.PRODUCTION_INBOX_PAGE_SIZE = 25;
exports.ProductionInboxSourceSchema = zod_1.z.enum(['executions', 'saved', 'video', 'storyboards']);
const unsafeIdCharacters = /[\/\\\u0000-\u001f\u007f-\u009f]/u;
function safeId(value) {
    return typeof value === 'string' && value.length > 0 && value.trim() === value &&
        node_buffer_1.Buffer.byteLength(value, 'utf8') <= 1500 && value !== '.' && value !== '..' &&
        !unsafeIdCharacters.test(value) && !/^__.*__$/u.test(value);
}
const uidSchema = zod_1.z.string().min(1).max(128).refine(safeId);
const cursorSchema = zod_1.z.object({
    source: exports.ProductionInboxSourceSchema,
    uid: uidSchema,
    after: zod_1.z.string().refine(safeId),
}).strict();
exports.ProductionInboxQuerySchema = zod_1.z.object({
    source: exports.ProductionInboxSourceSchema.optional().default('executions'),
    cursor: zod_1.z.string().min(1).max(4096).optional(),
}).strict();
class ProductionInboxError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'ProductionInboxError';
    }
}
exports.ProductionInboxError = ProductionInboxError;
function productionInboxErrorResponse(error) {
    const status = error instanceof ProductionInboxError ? error.status : 503;
    return { status, body: { error: status === 400 ? '제작함 조회 조건이 올바르지 않습니다.'
                : status === 401 ? '현재 계정으로 다시 로그인해 주세요.' : '제작함을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' } };
}
function parseQuery(query) {
    let input = query;
    if (query instanceof URLSearchParams) {
        const record = Object.create(null);
        for (const [key, value] of query) {
            if (Object.prototype.hasOwnProperty.call(record, key))
                throw new ProductionInboxError(400, 'Invalid query');
            record[key] = value;
        }
        input = record;
    }
    const parsed = exports.ProductionInboxQuerySchema.safeParse(input);
    if (!parsed.success)
        throw new ProductionInboxError(400, 'Invalid query');
    return parsed.data;
}
function decodeCursor(cursor, source, uid) {
    try {
        if (!/^[A-Za-z0-9_-]+$/u.test(cursor))
            throw new Error();
        const raw = node_buffer_1.Buffer.from(cursor, 'base64url').toString('utf8');
        const parsed = cursorSchema.parse(JSON.parse(raw));
        // Canonical JSON also rejects duplicate keys and ambiguous UTF-8/base64 encodings.
        if (node_buffer_1.Buffer.from(JSON.stringify(parsed)).toString('base64url') !== cursor ||
            parsed.source !== source || parsed.uid !== uid)
            throw new Error();
        return parsed.after;
    }
    catch (_a) {
        throw new ProductionInboxError(400, 'Invalid cursor');
    }
}
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value : null;
}
function titleOf(data, kind) {
    for (const key of ['title', 'name', 'prompt']) {
        const value = data[key];
        if (typeof value === 'string' && value.trim()) {
            // Plain, untrusted display text only. Never interpret this string as HTML.
            return value.slice(0, 640).replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').trim().slice(0, 160) || '제목 없는 기록';
        }
    }
    return ({ image: '이미지 제작 기록', 'emoticon-plan': '이모티콘 기획 기록', video: '영상 제작 기록',
        storyboard: '제목 없는 스토리보드', unknown: '알 수 없는 제작 기록' })[kind];
}
function dateOf(value) {
    try {
        let date;
        if (value instanceof Date)
            date = value;
        else if (record(value) && typeof value.toDate === 'function') {
            date = value.toDate();
        }
        else if (typeof value === 'number' && Number.isFinite(value))
            date = new Date(value);
        else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(value) && value.length <= 40)
            date = new Date(value);
        else
            return null;
        return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }
    catch (_a) {
        return null;
    }
}
function kindOf(source, data) {
    if (source === 'storyboards')
        return 'storyboard';
    if (source === 'saved')
        return data.type === 'image' || data.type === 'video' ? data.type : 'unknown';
    if (source === 'executions')
        return data.operation === 'image-generation' ? 'image'
            : data.operation === 'emoticon-animation-plan' ? 'emoticon-plan' : 'unknown';
    // extract-frame produces a still image, not a video artifact.
    return data.kind === 'extract-frame' ? 'image'
        : ['generate', 'extend', 'continue', 'edit', 'merge'].includes(String(data.kind)) ? 'video' : 'unknown';
}
function statusOf(source, data, kind) {
    // Storyboard workflowStage is not an execution/completion status; don't infer from scenes.
    if (source === 'storyboards' || kind === 'unknown')
        return 'unknown';
    // ai_generations is written only after artifact upload succeeds. Not all executions are saved.
    if (source === 'saved')
        return 'completed';
    if (data.status === 'completed' || data.status === 'failed')
        return data.status;
    if (source === 'executions')
        return data.status === 'pending' ? 'pending'
            : data.status === 'uncertain' ? 'needs-review' : 'unknown';
    if (['queued', 'running', 'uploading'].includes(String(data.status)))
        return 'pending';
    // The authoritative video schema spells this "canceled". Cancellation is not completion.
    return data.status === 'canceled' ? 'needs-review' : 'unknown';
}
function storyboardHref(storyboardId, sceneId) {
    if (!safeId(storyboardId) || storyboardId.length > 240)
        return '/admin/storyboard';
    const params = new URLSearchParams({ storyboard: storyboardId });
    if (safeId(sceneId) && sceneId.length <= 240)
        params.set('scene', sceneId);
    return `/admin/storyboard?${params.toString()}`;
}
function hrefOf(source, id, data, kind) {
    if (source === 'storyboards')
        return storyboardHref(id);
    if (source === 'saved') {
        const provenance = record(data.artifactProvenance);
        if ((provenance === null || provenance === void 0 ? void 0 : provenance.kind) === 'storyboard-scene')
            return storyboardHref(provenance.storyboardId, provenance.sceneId);
    }
    return kind === 'emoticon-plan' ? '/admin/emoticon-studio' : '/admin/storyboard';
}
// Field masks keep large result payloads, provider URLs and credentials out of the read projection.
const fields = {
    executions: ['uid', 'operation', 'status', 'title', 'name', 'updatedAt', 'createdAt'],
    saved: ['userId', 'type', 'title', 'name', 'prompt', 'updatedAt', 'createdAt',
        'artifactProvenance.kind', 'artifactProvenance.storyboardId', 'artifactProvenance.sceneId'],
    video: ['userId', 'kind', 'status', 'title', 'name', 'updatedAt', 'createdAt'],
    storyboards: ['title', 'name', 'updatedAt', 'createdAt'],
};
function createProductionInboxService(deps) {
    return {
        async list(actor, query) {
            var _a;
            const actorUid = uidSchema.safeParse(actor === null || actor === void 0 ? void 0 : actor.uid);
            if (!actorUid.success)
                throw new ProductionInboxError(401, 'Invalid actor');
            const uid = actorUid.data;
            const { source, cursor } = parseQuery(query);
            const after = cursor ? decodeCursor(cursor, source, uid) : null;
            try {
                // Collection/path/owner field are selected only here, never from a cursor or input UID.
                let page = source === 'storyboards'
                    ? deps.db.collection('users').doc(uid).collection('imageStoryboards')
                    : source === 'executions' ? deps.db.collection('aiOperationReservations').where('uid', '==', uid)
                        : source === 'saved' ? deps.db.collection('ai_generations').where('userId', '==', uid)
                            : deps.db.collection('video_studio_jobs').where('userId', '==', uid);
                page = page.select(...fields[source]).orderBy(firestore_1.FieldPath.documentId()).limit(exports.PRODUCTION_INBOX_PAGE_SIZE);
                if (after)
                    page = page.startAfter(after);
                const snapshot = await page.get();
                const items = [];
                let skipped = 0;
                for (const document of snapshot.docs.slice(0, exports.PRODUCTION_INBOX_PAGE_SIZE)) {
                    try {
                        const data = record(document.data());
                        if (!safeId(document.id) || !data || (source !== 'storyboards' &&
                            data[source === 'executions' ? 'uid' : 'userId'] !== uid))
                            throw new Error();
                        const kind = kindOf(source, data);
                        items.push({ id: document.id, title: titleOf(data, kind), kind,
                            status: statusOf(source, data, kind), updatedAt: (_a = dateOf(data.updatedAt)) !== null && _a !== void 0 ? _a : dateOf(data.createdAt),
                            href: hrefOf(source, document.id, data, kind) });
                    }
                    catch (_b) {
                        skipped += 1;
                    }
                }
                const notes = [
                    '문서 ID 순서로 한 번에 최대 25개를 조회합니다. 날짜 정렬·검색은 불러온 기록 범위에만 적용됩니다.',
                    '현재 계정 소유가 확인된 서버 기록만 포함하며 로컬 초안과 소유자가 없는 기록은 포함하지 않습니다.',
                ];
                if (source === 'executions')
                    notes.push('실행 완료는 결과 저장을 보장하지 않습니다. 비용·결과 payload는 조회하지 않습니다.');
                if (source === 'saved')
                    notes.push('저장 완료된 결과 기록이며 전체 실행 이력이 아닙니다.');
                if (source === 'video')
                    notes.push('취소된 작업은 확인 필요로 표시하며 완료된 영상으로 취급하지 않습니다.');
                if (source === 'storyboards')
                    notes.push('스토리보드의 저장 여부로 제작 완료를 추정하지 않아 상태를 알 수 없음으로 표시합니다.');
                if (skipped)
                    notes.push(`형식 또는 소유권을 확인할 수 없는 기록 ${skipped}개를 제외했습니다.`);
                const last = snapshot.docs[Math.min(snapshot.docs.length, exports.PRODUCTION_INBOX_PAGE_SIZE) - 1];
                if (snapshot.docs.length >= exports.PRODUCTION_INBOX_PAGE_SIZE && !safeId(last === null || last === void 0 ? void 0 : last.id)) {
                    throw new Error('Cannot safely continue pagination');
                }
                const nextCursor = snapshot.docs.length >= exports.PRODUCTION_INBOX_PAGE_SIZE
                    ? node_buffer_1.Buffer.from(JSON.stringify({ source, uid, after: last.id })).toString('base64url') : null;
                return { source, items, nextCursor, order: 'loaded-only', notes };
            }
            catch (_c) {
                throw new ProductionInboxError(503, 'Inbox source unavailable');
            }
        },
    };
}
//# sourceMappingURL=productionInbox.js.map