"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordOpenRouterUsage = exports.OpenRouterUsageReconciliationError = exports.nextKoreaDayStartMs = exports.toKoreaDateKey = exports.OPENROUTER_DAILY_COST_COLLECTION = exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION = exports.OPENROUTER_LOGICAL_OPERATION_KEY_VERSION = exports.OpenRouterDailyCostLimitError = exports.OpenRouterDuplicateOperationError = void 0;
exports.runWithOpenRouterUsageContext = runWithOpenRouterUsageContext;
exports.updateOpenRouterUsageContext = updateOpenRouterUsageContext;
exports.createOpenRouterStableImageIdentifier = createOpenRouterStableImageIdentifier;
exports.createOpenRouterLogicalOperationId = createOpenRouterLogicalOperationId;
exports.buildOpenRouterDailyCostAggregateIdentity = buildOpenRouterDailyCostAggregateIdentity;
exports.resolveOpenRouterDailyCostAggregateIdentity = resolveOpenRouterDailyCostAggregateIdentity;
exports.canReserveOpenRouterCost = canReserveOpenRouterCost;
exports.canReserveOpenRouterDailyCost = canReserveOpenRouterDailyCost;
exports.transitionOpenRouterDailyCostAggregate = transitionOpenRouterDailyCostAggregate;
exports.resolveOpenRouterDailyCostLimitUsd = resolveOpenRouterDailyCostLimitUsd;
exports.reconcileOpenRouterUsageState = reconcileOpenRouterUsageState;
exports.assertOpenRouterUsageBudget = assertOpenRouterUsageBudget;
exports.reserveOpenRouterUsage = reserveOpenRouterUsage;
exports.settleOpenRouterUsageReservation = settleOpenRouterUsageReservation;
exports.failOpenRouterUsageReservation = failOpenRouterUsageReservation;
const node_crypto_1 = require("node:crypto");
const node_async_hooks_1 = require("node:async_hooks");
const admin = require("firebase-admin");
const firestore_1 = require("./firestore");
const rateLimits_1 = require("./emoticonStudio/rateLimits");
class OpenRouterDuplicateOperationError extends Error {
    constructor(state) {
        super(`OpenRouter logical operation is already ${state}; a duplicate request was blocked.`);
        this.name = 'OpenRouterDuplicateOperationError';
        this.reservationState = state;
    }
}
exports.OpenRouterDuplicateOperationError = OpenRouterDuplicateOperationError;
class OpenRouterDailyCostLimitError extends Error {
    constructor(params) {
        super(`OpenRouter daily cost limit reached for ${params.day} (`
            + `${params.actualCostUsd.toFixed(4)} actual + `
            + `${params.inflightCostUsd.toFixed(4)} inflight + `
            + `${params.estimatedCostUsd.toFixed(4)} requested / `
            + `${params.dailyCostLimitUsd.toFixed(4)} USD).`);
        this.name = 'OpenRouterDailyCostLimitError';
        this.day = params.day;
        this.retryAtMs = params.retryAtMs;
    }
}
exports.OpenRouterDailyCostLimitError = OpenRouterDailyCostLimitError;
const usageContextStorage = new node_async_hooks_1.AsyncLocalStorage();
const SAFE_CONTEXT_ID = /^[A-Za-z0-9_-]{1,160}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const OPERATION_DOCUMENT_ID = /^operation_[a-f0-9]{64}$/;
const KOREA_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const KOREA_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;
const USD_EPSILON = 0.000001;
exports.OPENROUTER_LOGICAL_OPERATION_KEY_VERSION = 2;
exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION = 1;
exports.OPENROUTER_DAILY_COST_COLLECTION = 'openrouter_daily_costs';
function runWithOpenRouterUsageContext(context, task) {
    return usageContextStorage.run(Object.assign(Object.assign({}, (usageContextStorage.getStore() || {})), context), task);
}
function updateOpenRouterUsageContext(context) {
    const current = usageContextStorage.getStore();
    if (current)
        Object.assign(current, context);
}
const hash = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
const VOLATILE_URL_PARAMETER = /^(?:token|signature|expires?|credential|googleaccessid|policy|key-pair-id|x-goog-.+|x-amz-.+)$/i;
const decodeStoragePath = (value) => {
    try {
        return decodeURIComponent(value);
    }
    catch (_a) {
        return value;
    }
};
const storageIdentifierFromUrl = (url) => {
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname;
    const firebaseMatch = pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (firebaseMatch
        && (hostname === 'firebasestorage.googleapis.com' || hostname.endsWith('.firebasestorage.app'))) {
        return `storage:${decodeStoragePath(firebaseMatch[1])}/${decodeStoragePath(firebaseMatch[2])}`;
    }
    const storageApiMatch = pathname.match(/^\/download\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/);
    if (storageApiMatch && hostname === 'storage.googleapis.com') {
        return `storage:${decodeStoragePath(storageApiMatch[1])}/${decodeStoragePath(storageApiMatch[2])}`;
    }
    if (hostname === 'storage.googleapis.com') {
        const pathMatch = pathname.match(/^\/([^/]+)\/(.+)$/);
        if (pathMatch) {
            return `storage:${decodeStoragePath(pathMatch[1])}/${decodeStoragePath(pathMatch[2])}`;
        }
    }
    if (hostname.endsWith('.storage.googleapis.com')) {
        const bucketName = hostname.slice(0, -'.storage.googleapis.com'.length);
        const storagePath = pathname.replace(/^\/+/, '');
        if (bucketName && storagePath) {
            return `storage:${decodeStoragePath(bucketName)}/${decodeStoragePath(storagePath)}`;
        }
    }
    return null;
};
const contentIdentifierFromDataUrl = (value) => {
    const match = value.match(/^data:([^,]*?),([\s\S]*)$/);
    if (!match || !/^image\//i.test(match[1]))
        return null;
    try {
        const bytes = /;base64(?:;|$)/i.test(match[1])
            ? Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
            : Buffer.from(decodeURIComponent(match[2]), 'utf8');
        return `content-sha256:${(0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex')}`;
    }
    catch (_a) {
        return `content-sha256:${hash(value)}`;
    }
};
/**
 * Produces a token-independent image identity for idempotency. Firebase/GCS
 * URLs resolve to their object path, while inline images resolve to a content
 * hash. Other public URLs retain content-affecting parameters but discard
 * common expiring authorization parameters.
 */
function createOpenRouterStableImageIdentifier(value) {
    const normalized = value.trim();
    const dataIdentifier = contentIdentifierFromDataUrl(normalized);
    if (dataIdentifier)
        return dataIdentifier;
    if (normalized.startsWith('gs://')) {
        return `storage:${normalized.slice('gs://'.length).replace(/^\/+/, '')}`;
    }
    try {
        const url = new URL(normalized);
        const storageIdentifier = storageIdentifierFromUrl(url);
        if (storageIdentifier)
            return storageIdentifier;
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) {
            if (VOLATILE_URL_PARAMETER.test(key))
                url.searchParams.delete(key);
        }
        url.searchParams.sort();
        return `url-sha256:${hash(url.toString())}`;
    }
    catch (_a) {
        return `value-sha256:${hash(normalized)}`;
    }
}
const stableRequestValue = (value, ancestors = new Set()) => {
    if (value === null)
        return null;
    if (typeof value === 'string') {
        return /^(?:data:image\/|gs:\/\/|https?:\/\/)/i.test(value.trim())
            ? createOpenRouterStableImageIdentifier(value)
            : value;
    }
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'bigint')
        return value.toString();
    if (value instanceof Uint8Array) {
        return `content-sha256:${(0, node_crypto_1.createHash)('sha256').update(value).digest('hex')}`;
    }
    if (value instanceof Date)
        return value.toISOString();
    if (Array.isArray(value)) {
        if (ancestors.has(value))
            throw new Error('OpenRouter logical operation request cannot be cyclic.');
        const nextAncestors = new Set(ancestors).add(value);
        return value.map((item) => stableRequestValue(item, nextAncestors));
    }
    if (typeof value === 'object') {
        if (ancestors.has(value))
            throw new Error('OpenRouter logical operation request cannot be cyclic.');
        const nextAncestors = new Set(ancestors).add(value);
        return Object.fromEntries(Object.entries(value)
            .filter(([, item]) => item !== undefined && typeof item !== 'function' && typeof item !== 'symbol')
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableRequestValue(item, nextAncestors)]));
    }
    return String(value);
};
/**
 * Builds a deterministic, prompt-safe identifier for one logical provider call.
 * The unhashed request body is never persisted in usage accounting.
 */
function createOpenRouterLogicalOperationId(params) {
    const context = usageContextStorage.getStore() || {};
    // A continuation is another invocation of the same semantic stage, not a
    // new paid operation. Keeping the suffix would permit a checkpoint retry
    // to bypass the original usage reservation.
    const stableStage = typeof context.stage === 'string' && context.stage.trim()
        ? context.stage.trim().replace(/:continuation$/, '').slice(0, 80)
        : null;
    return hash(JSON.stringify({
        keyVersion: exports.OPENROUTER_LOGICAL_OPERATION_KEY_VERSION,
        operation: params.operation,
        model: params.model.trim(),
        jobId: typeof context.jobId === 'string' && SAFE_CONTEXT_ID.test(context.jobId)
            ? context.jobId
            : null,
        stage: stableStage,
        frameIndex: Number.isInteger(context.frameIndex) && context.frameIndex >= 0
            ? context.frameIndex
            : null,
        seed: Number.isInteger(context.seed) && context.seed >= 0
            ? context.seed
            : null,
        request: stableRequestValue(params.request),
    }));
}
const toNonNegativeNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const toOptionalCost = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const toKoreaDateKey = (date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const getPart = (type) => { var _a; return ((_a = parts.find((part) => part.type === type)) === null || _a === void 0 ? void 0 : _a.value) || ''; };
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
};
exports.toKoreaDateKey = toKoreaDateKey;
const nextKoreaDayStartMs = (timestampMs) => {
    const safeTimestampMs = Number.isFinite(timestampMs) ? timestampMs : Date.now();
    const currentDayBucket = Math.floor((safeTimestampMs + KOREA_UTC_OFFSET_MS) / DAY_MS);
    return (currentDayBucket + 1) * DAY_MS - KOREA_UTC_OFFSET_MS;
};
exports.nextKoreaDayStartMs = nextKoreaDayStartMs;
function buildOpenRouterDailyCostAggregateIdentity(userIdHash, day) {
    if (!SHA256_HEX.test(userIdHash) || !KOREA_DATE_KEY.test(day))
        return null;
    return {
        documentId: `emoticon_${hash(`${userIdHash}:${day}`)}`,
        day,
        userIdHash,
    };
}
function resolveOpenRouterDailyCostAggregateIdentity(usage) {
    const userIdHash = typeof usage.userIdHash === 'string' ? usage.userIdHash : '';
    const day = typeof usage.day === 'string' ? usage.day : '';
    const identity = buildOpenRouterDailyCostAggregateIdentity(userIdHash, day);
    if (!identity)
        return null;
    if (typeof usage.dailyCostAggregateId === 'string'
        && usage.dailyCostAggregateId !== identity.documentId)
        return null;
    return identity;
}
const authorizedJobCost = (job) => {
    const configured = job.openRouterAuthorizedCostUsd;
    // Paid requests require an explicit server-owned authorization. Missing,
    // malformed, and explicit-zero values all fail closed instead of silently
    // expanding a recovered or legacy job to a default budget.
    return typeof configured === 'number' && Number.isFinite(configured) && configured >= 0
        ? configured
        : 0;
};
const safeContext = () => {
    const context = usageContextStorage.getStore() || {};
    const userId = typeof context.userId === 'string' ? context.userId.trim() : '';
    const jobId = typeof context.jobId === 'string' && SAFE_CONTEXT_ID.test(context.jobId)
        ? context.jobId
        : '';
    return { context, userId, jobId };
};
function canReserveOpenRouterCost(params) {
    const authorized = toNonNegativeNumber(params.authorizedCostUsd);
    const actual = toNonNegativeNumber(params.actualCostUsd);
    const inflight = toNonNegativeNumber(params.inflightCostUsd);
    const estimated = toNonNegativeNumber(params.estimatedCostUsd);
    return authorized > 0 && actual + inflight + estimated <= authorized + USD_EPSILON;
}
function canReserveOpenRouterDailyCost(params) {
    const dailyLimit = toNonNegativeNumber(params.dailyCostLimitUsd);
    const actual = toNonNegativeNumber(params.actualCostUsd);
    const inflight = toNonNegativeNumber(params.inflightCostUsd);
    const estimated = toNonNegativeNumber(params.estimatedCostUsd);
    return dailyLimit > 0 && actual + inflight + estimated <= dailyLimit + USD_EPSILON;
}
/**
 * Applies a single reservation state change to the Korea-day aggregate. The
 * caller performs the read and write in the same Firestore transaction.
 */
function transitionOpenRouterDailyCostAggregate(params) {
    var _a, _b;
    const currentActual = safeStoredMoney((_a = params.aggregate) === null || _a === void 0 ? void 0 : _a.actualCostUsd);
    const currentInflight = safeStoredMoney((_b = params.aggregate) === null || _b === void 0 ? void 0 : _b.inflightCostUsd);
    const actualDelta = typeof params.actualDeltaUsd === 'number'
        && Number.isFinite(params.actualDeltaUsd)
        ? params.actualDeltaUsd
        : 0;
    const inflightDelta = typeof params.inflightDeltaUsd === 'number'
        && Number.isFinite(params.inflightDeltaUsd)
        ? params.inflightDeltaUsd
        : 0;
    const nextActual = currentActual + actualDelta;
    const nextInflight = currentInflight + inflightDelta;
    if (nextActual < -USD_EPSILON || nextInflight < -USD_EPSILON) {
        throw new Error('OpenRouter daily cost aggregate transition would become negative.');
    }
    if (!Number.isFinite(nextActual) || !Number.isFinite(nextInflight)) {
        throw new Error('OpenRouter daily cost aggregate transition is not finite.');
    }
    return {
        actualCostUsd: Math.max(0, nextActual),
        inflightCostUsd: Math.max(0, nextInflight),
    };
}
function resolveOpenRouterDailyCostLimitUsd(params = {}) {
    var _a, _b, _c;
    const configured = (0, rateLimits_1.getEmoticonStudioCostLimits)(params.environment).dailyUsd;
    const storedLimits = [
        ['job.openRouterDailyCostLimitUsd', (_a = params.job) === null || _a === void 0 ? void 0 : _a.openRouterDailyCostLimitUsd],
        ['usage.dailyCostLimitUsd', (_b = params.usage) === null || _b === void 0 ? void 0 : _b.dailyCostLimitUsd],
        ['aggregate.dailyCostLimitUsd', (_c = params.aggregate) === null || _c === void 0 ? void 0 : _c.dailyCostLimitUsd],
    ].flatMap(([field, value]) => {
        if (value === undefined || value === null)
            return [];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            throw new Error(`OpenRouter ${String(field)} is invalid.`);
        }
        return [value];
    });
    // A lowered limit takes effect immediately; an older lower snapshot is
    // never silently expanded during the same Korea day.
    return Math.min(configured, ...storedLimits);
}
function requireDailyAggregateMoney(aggregate, field) {
    const value = aggregate[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`OpenRouter daily cost aggregate ${field} is invalid.`);
    }
    return value;
}
class OpenRouterUsageReconciliationError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'OpenRouterUsageReconciliationError';
        this.code = code;
    }
}
exports.OpenRouterUsageReconciliationError = OpenRouterUsageReconciliationError;
const reconciliationError = (code, message) => {
    throw new OpenRouterUsageReconciliationError(code, message);
};
const requireStoredCost = (value, field, maximum = Number.MAX_SAFE_INTEGER) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
        return reconciliationError('invalid_data', `${field} is not a valid reconciliation cost.`);
    }
    return value;
};
const optionalStoredCost = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : 0);
const safeStoredMoney = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);
const safeStoredCounter = (value) => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0);
/**
 * Calculates one uncertain-usage reconciliation without Firestore dependencies.
 * The caller adds server timestamps and applies these explicit values in a
 * transaction. Raw administrator identifiers are deliberately not accepted.
 */
function reconcileOpenRouterUsageState(input) {
    var _a, _b;
    if (!OPERATION_DOCUMENT_ID.test(input.operationId)) {
        return reconciliationError('invalid_input', 'The usage operation ID is invalid.');
    }
    if (input.decision !== 'charged' && input.decision !== 'not_charged') {
        return reconciliationError('invalid_input', 'The reconciliation decision is invalid.');
    }
    if (!SHA256_HEX.test(input.reconciledByAdminUidHash)) {
        return reconciliationError('invalid_input', 'The administrator audit hash is invalid.');
    }
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length > 300) {
        return reconciliationError('invalid_input', 'The reconciliation note is too long.');
    }
    if (input.decision === 'charged') {
        if (typeof input.actualCostUsd !== 'number'
            || !Number.isFinite(input.actualCostUsd)
            || input.actualCostUsd < 0
            || input.actualCostUsd > 100) {
            return reconciliationError('invalid_input', 'A charged decision requires a valid actual cost.');
        }
    }
    else if (input.actualCostUsd !== undefined) {
        return reconciliationError('invalid_input', 'A not-charged decision cannot include an actual cost.');
    }
    if (input.usage.provider !== 'openrouter'
        || input.usage.source !== 'firebase_function') {
        return reconciliationError('invalid_data', 'The usage record is not an OpenRouter operation.');
    }
    const expectedState = input.decision === 'charged' ? 'settled' : 'failed';
    if (input.usage.reconciliationDecision === input.decision
        && input.usage.state === expectedState) {
        const accountedCostUsd = input.decision === 'charged'
            ? requireStoredCost(input.usage.costUsd, 'costUsd', 100)
            : optionalStoredCost(input.usage.costUsd);
        return {
            outcome: 'idempotent',
            decision: input.decision,
            accountedCostUsd,
            reservedCostUsd: 0,
            reconciliationJobUpdated: input.usage.reconciliationJobUpdated === true,
            usageUpdate: null,
            jobUpdate: null,
        };
    }
    if (input.usage.state !== 'uncertain') {
        return reconciliationError('conflict', 'The usage operation is not awaiting reconciliation or has a different decision.');
    }
    const reservedCostUsd = requireStoredCost(input.usage.reservedCostUsd, 'reservedCostUsd');
    const accountedCostUsd = input.decision === 'charged' ? input.actualCostUsd : 0;
    const usageUserIdHash = typeof input.usage.userIdHash === 'string'
        && SHA256_HEX.test(input.usage.userIdHash)
        ? input.usage.userIdHash
        : null;
    const usageJobId = typeof input.usage.jobId === 'string'
        && SAFE_CONTEXT_ID.test(input.usage.jobId)
        ? input.usage.jobId
        : null;
    const jobUserId = typeof ((_a = input.job) === null || _a === void 0 ? void 0 : _a.userId) === 'string' && input.job.userId.trim()
        ? input.job.userId.trim()
        : null;
    const jobId = typeof ((_b = input.job) === null || _b === void 0 ? void 0 : _b.id) === 'string' ? input.job.id : null;
    const ownsJob = Boolean(input.job
        && usageUserIdHash
        && usageJobId
        && jobUserId
        && jobId === usageJobId
        && hash(jobUserId) === usageUserIdHash);
    let jobUpdate = null;
    if (ownsJob && input.job) {
        const currentInflightCostUsd = safeStoredMoney(input.job.openRouterInflightCostUsd);
        const currentActualCostUsd = safeStoredMoney(input.job.openRouterActualCostUsd);
        const currentRequestCount = safeStoredCounter(input.job.openRouterUsageRequestCount);
        const nextActualCostUsd = currentActualCostUsd + accountedCostUsd;
        if (!Number.isFinite(nextActualCostUsd) || nextActualCostUsd > Number.MAX_SAFE_INTEGER) {
            return reconciliationError('invalid_data', 'The reconciled job cost would be invalid.');
        }
        if (input.decision === 'charged' && currentRequestCount >= Number.MAX_SAFE_INTEGER) {
            return reconciliationError('invalid_data', 'The reconciled request count would be invalid.');
        }
        jobUpdate = {
            openRouterInflightCostUsd: Math.max(0, currentInflightCostUsd - reservedCostUsd),
            openRouterActualCostUsd: nextActualCostUsd,
            openRouterUsageRequestCount: currentRequestCount + (input.decision === 'charged' ? 1 : 0),
        };
    }
    const reconciliationJobUpdated = jobUpdate !== null;
    return {
        outcome: 'updated',
        decision: input.decision,
        accountedCostUsd,
        reservedCostUsd,
        reconciliationJobUpdated,
        usageUpdate: Object.assign(Object.assign({ state: expectedState, reservedCostUsd: 0, costUsd: accountedCostUsd, costSource: 'admin_reconciliation', reconciliationDecision: input.decision, reconciledActualCostUsd: accountedCostUsd, reconciledByAdminUidHash: input.reconciledByAdminUidHash, reconciliationJobUpdated }, (note ? { reconciliationNote: note } : {})), (input.decision === 'not_charged'
            ? { failureReason: 'admin_confirmed_not_charged' }
            : {})),
        jobUpdate,
    };
}
/** Legacy read-only check. New paid Emoticon Studio requests use reserveOpenRouterUsage. */
async function assertOpenRouterUsageBudget(estimatedRequestCostUsd) {
    const { userId, jobId } = safeContext();
    if (!userId || !jobId)
        return;
    const jobSnapshot = await firestore_1.db.doc(`users/${userId}/emoticonJobs/${jobId}`).get();
    if (!jobSnapshot.exists)
        throw new Error('The OpenRouter cost budget job no longer exists.');
    const job = jobSnapshot.data() || {};
    const authorizedCostUsd = authorizedJobCost(job);
    const actualCostUsd = toNonNegativeNumber(job.openRouterActualCostUsd);
    const inflightCostUsd = toNonNegativeNumber(job.openRouterInflightCostUsd);
    const estimated = toNonNegativeNumber(estimatedRequestCostUsd);
    if (!canReserveOpenRouterCost({
        authorizedCostUsd,
        actualCostUsd,
        inflightCostUsd,
        estimatedCostUsd: estimated,
    })) {
        throw new Error(`OpenRouter job cost budget reached (${actualCostUsd.toFixed(4)} actual + `
            + `${inflightCostUsd.toFixed(4)} reserved / ${authorizedCostUsd.toFixed(4)} USD).`);
    }
}
/**
 * Atomically reserves job budget before a paid provider request. A deterministic
 * operation document prevents concurrent, replayed, settled, or uncertain calls
 * from issuing the same external request again.
 */
async function reserveOpenRouterUsage(params) {
    if (!admin.apps.length)
        admin.initializeApp();
    const { context, userId, jobId } = safeContext();
    if (!userId || !jobId) {
        throw new Error('OpenRouter paid requests require a valid Emoticon Studio job context.');
    }
    const logicalOperationId = params.logicalOperationId.trim();
    if (!/^[a-f0-9]{64}$/i.test(logicalOperationId)) {
        throw new Error('OpenRouter logical operation ID must be a SHA-256 digest.');
    }
    const estimatedCostUsd = toOptionalCost(params.estimatedCostUsd);
    if (estimatedCostUsd === null) {
        throw new Error('OpenRouter estimated request cost must be a non-negative finite number.');
    }
    const documentId = `operation_${hash(`${hash(userId)}:${jobId}:${logicalOperationId}`)}`;
    const requestId = `emoticon-${documentId.slice('operation_'.length, 'operation_'.length + 32)}`;
    const jobRef = firestore_1.db.doc(`users/${userId}/emoticonJobs/${jobId}`);
    const usageRef = firestore_1.db.collection('openrouter_usage').doc(documentId);
    const now = new Date();
    const dailyCostDay = (0, exports.toKoreaDateKey)(now);
    const dailyCostIdentity = buildOpenRouterDailyCostAggregateIdentity(hash(userId), dailyCostDay);
    if (!dailyCostIdentity) {
        throw new Error('OpenRouter daily cost aggregate identity could not be created.');
    }
    const dailyCostRef = firestore_1.db.collection(exports.OPENROUTER_DAILY_COST_COLLECTION)
        .doc(dailyCostIdentity.documentId);
    await firestore_1.db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d, _e;
        // All reads happen before writes so the transaction is valid on Firestore.
        const [jobSnapshot, usageSnapshot, dailyCostSnapshot] = await Promise.all([
            transaction.get(jobRef),
            transaction.get(usageRef),
            transaction.get(dailyCostRef),
        ]);
        if (!jobSnapshot.exists) {
            throw new Error('The OpenRouter cost budget job no longer exists.');
        }
        const existingState = (_a = usageSnapshot.data()) === null || _a === void 0 ? void 0 : _a.state;
        if (existingState === 'inflight' || existingState === 'uncertain' || existingState === 'settled') {
            throw new OpenRouterDuplicateOperationError(existingState);
        }
        const job = jobSnapshot.data() || {};
        const authorizedCostUsd = authorizedJobCost(job);
        const actualCostUsd = toNonNegativeNumber(job.openRouterActualCostUsd);
        const inflightCostUsd = toNonNegativeNumber(job.openRouterInflightCostUsd);
        if (!canReserveOpenRouterCost({
            authorizedCostUsd,
            actualCostUsd,
            inflightCostUsd,
            estimatedCostUsd,
        })) {
            throw new Error(`OpenRouter job cost budget reached (${actualCostUsd.toFixed(4)} actual + `
                + `${inflightCostUsd.toFixed(4)} reserved / ${authorizedCostUsd.toFixed(4)} USD).`);
        }
        const storedDailyCost = dailyCostSnapshot.data() || {};
        if (dailyCostSnapshot.exists
            && (storedDailyCost.day !== dailyCostIdentity.day
                || storedDailyCost.userIdHash !== dailyCostIdentity.userIdHash)) {
            throw new Error('OpenRouter daily cost aggregate ownership is invalid.');
        }
        const dailyActualCostUsd = dailyCostSnapshot.exists
            ? requireDailyAggregateMoney(storedDailyCost, 'actualCostUsd')
            : 0;
        const dailyInflightCostUsd = dailyCostSnapshot.exists
            ? requireDailyAggregateMoney(storedDailyCost, 'inflightCostUsd')
            : 0;
        const dailyCostLimitUsd = resolveOpenRouterDailyCostLimitUsd({
            job,
            aggregate: storedDailyCost,
        });
        if (!canReserveOpenRouterDailyCost({
            dailyCostLimitUsd,
            actualCostUsd: dailyActualCostUsd,
            inflightCostUsd: dailyInflightCostUsd,
            estimatedCostUsd,
        })) {
            throw new OpenRouterDailyCostLimitError({
                day: dailyCostIdentity.day,
                actualCostUsd: dailyActualCostUsd,
                inflightCostUsd: dailyInflightCostUsd,
                estimatedCostUsd,
                dailyCostLimitUsd,
                retryAtMs: (0, exports.nextKoreaDayStartMs)(now.getTime()),
            });
        }
        const nextDailyCost = transitionOpenRouterDailyCostAggregate({
            aggregate: {
                actualCostUsd: dailyActualCostUsd,
                inflightCostUsd: dailyInflightCostUsd,
            },
            inflightDeltaUsd: estimatedCostUsd,
        });
        const providerSlug = ((_b = params.providerSlug) === null || _b === void 0 ? void 0 : _b.trim()) || ((_c = context.providerSlug) === null || _c === void 0 ? void 0 : _c.trim());
        const providerTag = ((_d = params.providerTag) === null || _d === void 0 ? void 0 : _d.trim()) || ((_e = context.providerTag) === null || _e === void 0 ? void 0 : _e.trim());
        transaction.set(usageRef, Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ provider: 'openrouter', operation: params.operation, source: 'firebase_function', state: 'inflight', model: params.model.trim() || 'unknown', logicalOperationHash: logicalOperationId, logicalOperationKeyVersion: exports.OPENROUTER_LOGICAL_OPERATION_KEY_VERSION, requestId,
            estimatedCostUsd, reservedCostUsd: estimatedCostUsd, userIdHash: hash(userId), jobId, dailyCostAggregateId: dailyCostIdentity.documentId, dailyCostAccountingVersion: exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION, dailyCostInflightAccounted: true, dailyCostLimitUsd }, (typeof context.projectId === 'string' && SAFE_CONTEXT_ID.test(context.projectId)
            ? { projectId: context.projectId }
            : {})), (typeof context.batchId === 'string' && SAFE_CONTEXT_ID.test(context.batchId)
            ? { batchId: context.batchId }
            : {})), (Number.isInteger(context.frameIndex) && context.frameIndex >= 0
            ? { frameIndex: context.frameIndex }
            : {})), (Number.isInteger(context.seed) && context.seed >= 0
            ? { seed: context.seed }
            : {})), (typeof context.stage === 'string' && context.stage.trim()
            ? { stage: context.stage.trim().slice(0, 80) }
            : {})), (providerSlug ? { endpointProviderSlug: providerSlug.slice(0, 80) } : {})), (providerTag ? { endpointProviderTag: providerTag.slice(0, 80) } : {})), { day: (0, exports.toKoreaDateKey)(now), attemptCount: admin.firestore.FieldValue.increment(1), reservedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
        transaction.set(dailyCostRef, {
            version: exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION,
            scope: 'emoticon_studio_user',
            userIdHash: dailyCostIdentity.userIdHash,
            day: dailyCostIdentity.day,
            dailyCostLimitUsd,
            actualCostUsd: nextDailyCost.actualCostUsd,
            inflightCostUsd: nextDailyCost.inflightCostUsd,
            reservationCount: admin.firestore.FieldValue.increment(1),
            createdAt: dailyCostSnapshot.exists
                ? storedDailyCost.createdAt || admin.firestore.FieldValue.serverTimestamp()
                : admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        // update(), rather than set(..., merge), guarantees a deleted job is
        // never recreated by accounting.
        transaction.update(jobRef, {
            openRouterInflightCostUsd: admin.firestore.FieldValue.increment(estimatedCostUsd),
            openRouterUsageUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });
    return {
        documentId,
        logicalOperationId,
        requestId,
        estimatedCostUsd,
        operation: params.operation,
        model: params.model.trim() || 'unknown',
        userId,
        jobId,
        dailyCostAggregateId: dailyCostIdentity.documentId,
        dailyCostDay: dailyCostIdentity.day,
    };
}
/**
 * Settles a successful HTTP response. Call this before consuming or validating
 * a potentially large response body. Missing provider cost is charged at the
 * conservative reserved estimate; a later call may reconcile exact usage.
 */
async function settleOpenRouterUsageReservation(reservation, entry) {
    if (!admin.apps.length)
        admin.initializeApp();
    const usageRef = firestore_1.db.collection('openrouter_usage').doc(reservation.documentId);
    const jobRef = firestore_1.db.doc(`users/${reservation.userId}/emoticonJobs/${reservation.jobId}`);
    let accountedCostUsd = reservation.estimatedCostUsd;
    await firestore_1.db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d, _e, _f;
        const [jobSnapshot, usageSnapshot] = await Promise.all([
            transaction.get(jobRef),
            transaction.get(usageRef),
        ]);
        if (!jobSnapshot.exists) {
            throw new Error('The OpenRouter cost budget job no longer exists.');
        }
        if (!usageSnapshot.exists) {
            throw new Error('OpenRouter usage reservation no longer exists.');
        }
        const usage = usageSnapshot.data() || {};
        const dailyCostIdentity = resolveOpenRouterDailyCostAggregateIdentity(usage);
        if (!dailyCostIdentity
            || (reservation.dailyCostAggregateId
                && reservation.dailyCostAggregateId !== dailyCostIdentity.documentId)
            || (reservation.dailyCostDay && reservation.dailyCostDay !== dailyCostIdentity.day)) {
            throw new Error('OpenRouter usage daily cost identity is invalid.');
        }
        const dailyCostRef = firestore_1.db.collection(exports.OPENROUTER_DAILY_COST_COLLECTION)
            .doc(dailyCostIdentity.documentId);
        const dailyCostSnapshot = await transaction.get(dailyCostRef);
        const storedDailyCost = dailyCostSnapshot.data() || {};
        if (dailyCostSnapshot.exists
            && (storedDailyCost.day !== dailyCostIdentity.day
                || storedDailyCost.userIdHash !== dailyCostIdentity.userIdHash)) {
            throw new Error('OpenRouter daily cost aggregate ownership is invalid.');
        }
        const state = usage.state;
        if (state !== 'inflight' && state !== 'settled') {
            throw new Error(`OpenRouter usage reservation cannot settle from state ${String(state)}.`);
        }
        const previousAccountedCostUsd = state === 'settled'
            ? toNonNegativeNumber(usage.costUsd)
            : 0;
        const suppliedCostUsd = toOptionalCost(entry.costUsd);
        accountedCostUsd = suppliedCostUsd !== null && suppliedCostUsd !== void 0 ? suppliedCostUsd : (state === 'settled'
            ? previousAccountedCostUsd
            : reservation.estimatedCostUsd);
        const actualDelta = accountedCostUsd - previousAccountedCostUsd;
        const reservedCostUsd = state === 'inflight'
            ? toNonNegativeNumber(usage.reservedCostUsd)
            : 0;
        const dailyInflightWasAccounted = usage.dailyCostAccountingVersion
            === exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION
            && usage.dailyCostInflightAccounted === true;
        const dailyCostWasAccounted = usage.dailyCostAccountingVersion
            === exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION;
        const currentDailyActualCostUsd = dailyCostSnapshot.exists
            ? requireDailyAggregateMoney(storedDailyCost, 'actualCostUsd')
            : state === 'settled' && dailyCostWasAccounted
                ? previousAccountedCostUsd
                : 0;
        const currentDailyInflightCostUsd = dailyCostSnapshot.exists
            ? requireDailyAggregateMoney(storedDailyCost, 'inflightCostUsd')
            : state === 'inflight' && dailyInflightWasAccounted
                ? reservedCostUsd
                : 0;
        const nextDailyCost = transitionOpenRouterDailyCostAggregate({
            aggregate: {
                actualCostUsd: currentDailyActualCostUsd,
                inflightCostUsd: currentDailyInflightCostUsd,
            },
            actualDeltaUsd: state === 'settled' && !dailyCostWasAccounted
                ? accountedCostUsd
                : actualDelta,
            inflightDeltaUsd: state === 'inflight' && dailyInflightWasAccounted
                ? -reservedCostUsd
                : 0,
        });
        const dailyCostLimitUsd = resolveOpenRouterDailyCostLimitUsd({
            job: jobSnapshot.data() || {},
            usage,
            aggregate: storedDailyCost,
        });
        transaction.update(usageRef, Object.assign(Object.assign(Object.assign({ state: 'settled', model: entry.model.trim() || reservation.model, promptTokens: toNonNegativeNumber(entry.promptTokens), completionTokens: toNonNegativeNumber(entry.completionTokens), totalTokens: toNonNegativeNumber(entry.totalTokens), costUsd: accountedCostUsd, costSource: suppliedCostUsd === null ? 'reservation_estimate' : 'provider_usage', providerRequestId: entry.requestId || reservation.requestId }, (((_a = entry.providerSlug) === null || _a === void 0 ? void 0 : _a.trim())
            ? { endpointProviderSlug: entry.providerSlug.trim().slice(0, 80) }
            : {})), (((_b = entry.providerTag) === null || _b === void 0 ? void 0 : _b.trim())
            ? { endpointProviderTag: entry.providerTag.trim().slice(0, 80) }
            : {})), { reservedCostUsd: 0, dailyCostAccountingVersion: exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION, dailyCostInflightAccounted: false, settledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        transaction.set(dailyCostRef, Object.assign(Object.assign({ version: exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION, scope: 'emoticon_studio_user', userIdHash: dailyCostIdentity.userIdHash, day: dailyCostIdentity.day, dailyCostLimitUsd, actualCostUsd: nextDailyCost.actualCostUsd, inflightCostUsd: nextDailyCost.inflightCostUsd }, (state === 'inflight'
            ? { settledCount: admin.firestore.FieldValue.increment(1) }
            : { costAdjustmentCount: admin.firestore.FieldValue.increment(1) })), { createdAt: dailyCostSnapshot.exists
                ? storedDailyCost.createdAt || admin.firestore.FieldValue.serverTimestamp()
                : admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
        transaction.update(jobRef, Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (state === 'inflight'
            ? {
                openRouterInflightCostUsd: admin.firestore.FieldValue.increment(-reservedCostUsd),
                openRouterUsageRequestCount: admin.firestore.FieldValue.increment(1),
            }
            : {})), (Math.abs(actualDelta) > USD_EPSILON
            ? { openRouterActualCostUsd: admin.firestore.FieldValue.increment(actualDelta) }
            : {})), { openRouterLastModel: entry.model.trim() || reservation.model }), (((_c = entry.providerTag) === null || _c === void 0 ? void 0 : _c.trim()) || ((_d = entry.providerSlug) === null || _d === void 0 ? void 0 : _d.trim())
            ? { openRouterLastProvider: ((_e = entry.providerTag) === null || _e === void 0 ? void 0 : _e.trim()) || ((_f = entry.providerSlug) === null || _f === void 0 ? void 0 : _f.trim()) }
            : {})), { openRouterUsageUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }));
    });
    return accountedCostUsd;
}
/**
 * Releases a definitely rejected request or retains an ambiguous request as
 * uncertain. Uncertain reservations intentionally keep their budget hold so a
 * retry cannot accidentally double-bill the job.
 */
async function failOpenRouterUsageReservation(reservation, params) {
    if (!admin.apps.length)
        admin.initializeApp();
    const usageRef = firestore_1.db.collection('openrouter_usage').doc(reservation.documentId);
    const jobRef = firestore_1.db.doc(`users/${reservation.userId}/emoticonJobs/${reservation.jobId}`);
    await firestore_1.db.runTransaction(async (transaction) => {
        var _a;
        const [jobSnapshot, usageSnapshot] = await Promise.all([
            transaction.get(jobRef),
            transaction.get(usageRef),
        ]);
        if (!usageSnapshot.exists || ((_a = usageSnapshot.data()) === null || _a === void 0 ? void 0 : _a.state) !== 'inflight')
            return;
        const usage = usageSnapshot.data() || {};
        const reservedCostUsd = toNonNegativeNumber(usage.reservedCostUsd);
        const dailyInflightWasAccounted = usage.dailyCostAccountingVersion
            === exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION
            && usage.dailyCostInflightAccounted === true;
        const dailyCostIdentity = resolveOpenRouterDailyCostAggregateIdentity(usage);
        if (!dailyCostIdentity) {
            throw new Error('OpenRouter usage daily cost identity is invalid.');
        }
        const dailyCostRef = firestore_1.db.collection(exports.OPENROUTER_DAILY_COST_COLLECTION)
            .doc(dailyCostIdentity.documentId);
        const dailyCostSnapshot = await transaction.get(dailyCostRef);
        const storedDailyCost = dailyCostSnapshot.data() || {};
        if (dailyCostSnapshot.exists
            && (storedDailyCost.day !== dailyCostIdentity.day
                || storedDailyCost.userIdHash !== dailyCostIdentity.userIdHash)) {
            throw new Error('OpenRouter daily cost aggregate ownership is invalid.');
        }
        const currentDailyActualCostUsd = dailyCostSnapshot.exists
            ? requireDailyAggregateMoney(storedDailyCost, 'actualCostUsd')
            : 0;
        const currentDailyInflightCostUsd = dailyCostSnapshot.exists
            ? requireDailyAggregateMoney(storedDailyCost, 'inflightCostUsd')
            : dailyInflightWasAccounted
                ? reservedCostUsd
                : 0;
        const inflightDeltaUsd = params.ambiguous
            ? dailyInflightWasAccounted ? 0 : reservedCostUsd
            : dailyInflightWasAccounted ? -reservedCostUsd : 0;
        const nextDailyCost = transitionOpenRouterDailyCostAggregate({
            aggregate: {
                actualCostUsd: currentDailyActualCostUsd,
                inflightCostUsd: currentDailyInflightCostUsd,
            },
            inflightDeltaUsd,
        });
        const dailyCostLimitUsd = resolveOpenRouterDailyCostLimitUsd({
            job: jobSnapshot.data() || {},
            usage,
            aggregate: storedDailyCost,
        });
        transaction.update(usageRef, Object.assign(Object.assign({ state: params.ambiguous ? 'uncertain' : 'failed', failureReason: params.reason.slice(0, 160) }, (params.ambiguous ? {} : { reservedCostUsd: 0 })), { dailyCostAccountingVersion: exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION, dailyCostInflightAccounted: params.ambiguous, failedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        transaction.set(dailyCostRef, Object.assign(Object.assign({ version: exports.OPENROUTER_DAILY_COST_AGGREGATE_VERSION, scope: 'emoticon_studio_user', userIdHash: dailyCostIdentity.userIdHash, day: dailyCostIdentity.day, dailyCostLimitUsd, actualCostUsd: nextDailyCost.actualCostUsd, inflightCostUsd: nextDailyCost.inflightCostUsd }, (params.ambiguous
            ? { uncertainCount: admin.firestore.FieldValue.increment(1) }
            : { failedCount: admin.firestore.FieldValue.increment(1) })), { createdAt: dailyCostSnapshot.exists
                ? storedDailyCost.createdAt || admin.firestore.FieldValue.serverTimestamp()
                : admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
        if (jobSnapshot.exists) {
            transaction.update(jobRef, Object.assign(Object.assign({}, (!params.ambiguous && reservedCostUsd > 0
                ? { openRouterInflightCostUsd: admin.firestore.FieldValue.increment(-reservedCostUsd) }
                : {})), { openRouterUsageUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        }
    });
}
const buildUsageDocumentId = (entry) => `request_${hash(entry.requestId || '')}`;
/**
 * Legacy best-effort accounting for non-reserved integrations. Emoticon Studio
 * paid calls must use reserve/settle above so accounting failure is propagated.
 */
const recordOpenRouterUsage = async (entry) => {
    var _a, _b, _c, _d;
    try {
        if (!admin.apps.length)
            admin.initializeApp();
        const now = new Date();
        const { context, userId, jobId } = safeContext();
        const projectId = typeof context.projectId === 'string' && SAFE_CONTEXT_ID.test(context.projectId)
            ? context.projectId
            : undefined;
        const batchId = typeof context.batchId === 'string' && SAFE_CONTEXT_ID.test(context.batchId)
            ? context.batchId
            : undefined;
        const actualCostUsd = toOptionalCost(entry.costUsd);
        const usage = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ provider: 'openrouter', operation: entry.operation, source: 'firebase_function', state: 'settled', model: entry.model.trim() || 'unknown', promptTokens: toNonNegativeNumber(entry.promptTokens), completionTokens: toNonNegativeNumber(entry.completionTokens), totalTokens: toNonNegativeNumber(entry.totalTokens), costUsd: actualCostUsd }, (entry.requestId ? { requestId: entry.requestId } : {})), (userId ? { userIdHash: hash(userId) } : {})), (projectId ? { projectId } : {})), (jobId ? { jobId } : {})), (batchId ? { batchId } : {})), (Number.isInteger(context.frameIndex) && context.frameIndex >= 0
            ? { frameIndex: context.frameIndex }
            : {})), (Number.isInteger(context.seed) && context.seed >= 0
            ? { seed: context.seed }
            : {})), (typeof context.stage === 'string' && context.stage.trim()
            ? { stage: context.stage.trim().slice(0, 80) }
            : {})), (((_a = entry.providerSlug) === null || _a === void 0 ? void 0 : _a.trim()) || ((_b = context.providerSlug) === null || _b === void 0 ? void 0 : _b.trim())
            ? { endpointProviderSlug: (entry.providerSlug || context.providerSlug).trim().slice(0, 80) }
            : {})), (((_c = entry.providerTag) === null || _c === void 0 ? void 0 : _c.trim()) || ((_d = context.providerTag) === null || _d === void 0 ? void 0 : _d.trim())
            ? { endpointProviderTag: (entry.providerTag || context.providerTag).trim().slice(0, 80) }
            : {})), { day: (0, exports.toKoreaDateKey)(now), occurredAt: admin.firestore.FieldValue.serverTimestamp() });
        const collection = firestore_1.db.collection('openrouter_usage');
        if (!entry.requestId) {
            await collection.add(usage);
            return;
        }
        const document = collection.doc(buildUsageDocumentId(entry));
        await firestore_1.db.runTransaction(async (transaction) => {
            const jobRef = userId && jobId
                ? firestore_1.db.doc(`users/${userId}/emoticonJobs/${jobId}`)
                : null;
            const reads = [transaction.get(document)];
            if (jobRef)
                reads.push(transaction.get(jobRef));
            const [existing, jobSnapshot] = await Promise.all(reads);
            if (existing.exists)
                return;
            transaction.create(document, usage);
            if (jobRef && (jobSnapshot === null || jobSnapshot === void 0 ? void 0 : jobSnapshot.exists)) {
                transaction.update(jobRef, Object.assign(Object.assign(Object.assign(Object.assign({ openRouterUsageRequestCount: admin.firestore.FieldValue.increment(1) }, (actualCostUsd !== null
                    ? { openRouterActualCostUsd: admin.firestore.FieldValue.increment(actualCostUsd) }
                    : {})), { openRouterLastModel: usage.model }), (entry.providerTag || entry.providerSlug || context.providerTag || context.providerSlug
                    ? {
                        openRouterLastProvider: entry.providerTag
                            || entry.providerSlug
                            || context.providerTag
                            || context.providerSlug,
                    }
                    : {})), { openRouterUsageUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }));
            }
        });
    }
    catch (error) {
        // Legacy call sites remain best-effort. Reserved Emoticon Studio calls
        // intentionally use the strict APIs above and never reach this catch.
        console.warn('[OpenRouter Usage] Failed to record usage:', error);
    }
};
exports.recordOpenRouterUsage = recordOpenRouterUsage;
//# sourceMappingURL=openrouterUsage.js.map