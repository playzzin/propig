"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openRouterUsage = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const zod_1 = require("zod");
const firestore_1 = require("../firestore");
const openrouterUsage_1 = require("../openrouterUsage");
if (!admin.apps.length) {
    admin.initializeApp();
}
const MAX_RECORDS = 10000;
const MAX_UNCERTAIN_RECORDS = 100;
const SAFE_CONTEXT_ID = /^[A-Za-z0-9_-]{1,160}$/;
const OPERATION_DOCUMENT_ID = /^operation_[a-f0-9]{64}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const reconcileRequestSchema = zod_1.z.object({
    operationId: zod_1.z.string().regex(OPERATION_DOCUMENT_ID),
    decision: zod_1.z.enum(['charged', 'not_charged']),
    actualCostUsd: zod_1.z.number().finite().min(0).max(100).optional(),
    note: zod_1.z.string().trim().max(300).optional(),
}).strict().superRefine((value, context) => {
    if (value.decision === 'charged' && value.actualCostUsd === undefined) {
        context.addIssue({
            code: 'custom',
            path: ['actualCostUsd'],
            message: 'A charged decision requires actualCostUsd.',
        });
    }
    if (value.decision === 'not_charged' && value.actualCostUsd !== undefined) {
        context.addIssue({
            code: 'custom',
            path: ['actualCostUsd'],
            message: 'A not-charged decision cannot include actualCostUsd.',
        });
    }
});
class UsageNotFoundError extends Error {
    constructor() {
        super('OpenRouter usage operation was not found.');
        this.name = 'UsageNotFoundError';
    }
}
const emptyAggregate = () => ({
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    pricedRequestCount: 0,
    pricedTotalTokens: 0,
    costUsd: 0,
});
const toNonNegativeNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const toOptionalCost = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const toSafeString = (value, maxLength) => {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
};
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
const shiftDateKey = (dateKey, offsetDays) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const value = new Date(Date.UTC(year, month - 1, day));
    value.setUTCDate(value.getUTCDate() + offsetDays);
    return value.toISOString().slice(0, 10);
};
const buildDateKeys = (range) => {
    const today = toKoreaDateKey(new Date());
    return Array.from({ length: range }, (_, index) => shiftDateKey(today, index - range + 1));
};
const toTimestampIso = (value) => {
    if (value instanceof Date && Number.isFinite(value.getTime()))
        return value.toISOString();
    if (value && typeof value === 'object' && 'toDate' in value) {
        try {
            const date = value.toDate();
            return Number.isFinite(date.getTime()) ? date.toISOString() : null;
        }
        catch (_a) {
            return null;
        }
    }
    return null;
};
const firstTimestampIso = (...values) => {
    for (const value of values) {
        const timestamp = toTimestampIso(value);
        if (timestamp)
            return timestamp;
    }
    return null;
};
const isUsageOperation = (value) => value === 'text' || value === 'image' || value === 'video';
const toUsageRecord = (id, raw) => {
    if (raw.provider !== 'openrouter')
        return null;
    if (raw.state !== undefined && raw.state !== 'settled')
        return null;
    if (!isUsageOperation(raw.operation))
        return null;
    if (raw.source !== 'next_server' && raw.source !== 'firebase_function')
        return null;
    if (typeof raw.day !== 'string' || !DATE_KEY.test(raw.day))
        return null;
    return {
        id,
        operation: raw.operation,
        source: raw.source,
        model: toSafeString(raw.model, 200) || 'unknown',
        promptTokens: toNonNegativeNumber(raw.promptTokens),
        completionTokens: toNonNegativeNumber(raw.completionTokens),
        totalTokens: toNonNegativeNumber(raw.totalTokens),
        costUsd: toOptionalCost(raw.costUsd),
        day: raw.day,
        occurredAt: firstTimestampIso(raw.occurredAt, raw.settledAt, raw.updatedAt, raw.reservedAt),
    };
};
const toUncertainUsageRecord = (id, raw) => {
    if (!OPERATION_DOCUMENT_ID.test(id))
        return null;
    if (raw.provider !== 'openrouter' || raw.source !== 'firebase_function')
        return null;
    if (raw.state !== 'uncertain' || !isUsageOperation(raw.operation))
        return null;
    if (typeof raw.day !== 'string' || !DATE_KEY.test(raw.day))
        return null;
    const jobId = typeof raw.jobId === 'string' && SAFE_CONTEXT_ID.test(raw.jobId)
        ? raw.jobId
        : null;
    if (!jobId)
        return null;
    const projectId = typeof raw.projectId === 'string' && SAFE_CONTEXT_ID.test(raw.projectId)
        ? raw.projectId
        : null;
    return {
        id,
        operation: raw.operation,
        model: toSafeString(raw.model, 200) || 'unknown',
        estimatedCostUsd: toNonNegativeNumber(raw.estimatedCostUsd),
        reservedCostUsd: toNonNegativeNumber(raw.reservedCostUsd),
        day: raw.day,
        reservedAt: toTimestampIso(raw.reservedAt),
        updatedAt: toTimestampIso(raw.updatedAt),
        jobId,
        projectId,
        stage: toSafeString(raw.stage, 80),
        requestId: toSafeString(raw.requestId, 160),
        provider: toSafeString(raw.endpointProviderTag, 80)
            || toSafeString(raw.endpointProviderSlug, 80),
    };
};
const addToAggregate = (aggregate, record) => {
    aggregate.requestCount += 1;
    aggregate.promptTokens += record.promptTokens;
    aggregate.completionTokens += record.completionTokens;
    aggregate.totalTokens += record.totalTokens;
    if (record.costUsd !== null) {
        aggregate.pricedRequestCount += 1;
        aggregate.pricedTotalTokens += record.totalTokens;
        aggregate.costUsd += record.costUsd;
    }
};
const parseBearerToken = (header) => {
    if (!header)
        return null;
    const [scheme, token] = header.split(' ');
    return (scheme === null || scheme === void 0 ? void 0 : scheme.toLowerCase()) === 'bearer' && token ? token.trim() : null;
};
const isAdmin = async (uid, claims) => {
    var _a;
    if (claims.admin === true || claims.role === 'admin')
        return true;
    const allowedUids = (process.env.ADMIN_UIDS || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (allowedUids.includes(uid))
        return true;
    const [adminDoc, accessDoc] = await Promise.all([
        firestore_1.db.collection('admins').doc(uid).get().catch(() => null),
        firestore_1.db.collection('userAccess').doc(uid).get().catch(() => null),
    ]);
    return (adminDoc === null || adminDoc === void 0 ? void 0 : adminDoc.exists) === true || ((_a = accessDoc === null || accessDoc === void 0 ? void 0 : accessDoc.data()) === null || _a === void 0 ? void 0 : _a.role) === 'admin';
};
const parseRequestBody = (body) => {
    if (Buffer.isBuffer(body))
        return JSON.parse(body.toString('utf8'));
    if (typeof body === 'string')
        return JSON.parse(body);
    return body;
};
const loadUsageReport = async (rawRange) => {
    if (rawRange && rawRange !== '7' && rawRange !== '30' && rawRange !== '90') {
        throw new openrouterUsage_1.OpenRouterUsageReconciliationError('invalid_input', 'The usage range is invalid.');
    }
    const rangeDays = rawRange === '7' ? 7 : rawRange === '90' ? 90 : 30;
    const dateKeys = buildDateKeys(rangeDays);
    const startDay = dateKeys[0];
    const endDay = dateKeys[dateKeys.length - 1];
    const [snapshot, uncertainSnapshot] = await Promise.all([
        firestore_1.db.collection('openrouter_usage')
            .where('day', '>=', startDay)
            .where('day', '<=', endDay)
            .limit(MAX_RECORDS + 1)
            .get(),
        firestore_1.db.collection('openrouter_usage')
            .where('state', '==', 'uncertain')
            .orderBy('updatedAt', 'desc')
            .limit(MAX_UNCERTAIN_RECORDS + 1)
            .get(),
    ]);
    const records = snapshot.docs
        .map((document) => toUsageRecord(document.id, document.data()))
        .filter((record) => record !== null)
        .sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || '') || b.id.localeCompare(a.id))
        .slice(0, MAX_RECORDS);
    const uncertain = uncertainSnapshot.docs
        .map((document) => toUncertainUsageRecord(document.id, document.data()))
        .filter((record) => record !== null)
        .sort((a, b) => ((b.updatedAt || b.reservedAt || '').localeCompare(a.updatedAt || a.reservedAt || '')
        || b.id.localeCompare(a.id)))
        .slice(0, MAX_UNCERTAIN_RECORDS);
    const summary = emptyAggregate();
    const daily = new Map(dateKeys.map((day) => [day, Object.assign({ day }, emptyAggregate())]));
    const byModel = new Map();
    const byOperation = new Map();
    for (const record of records) {
        addToAggregate(summary, record);
        const dailyAggregate = daily.get(record.day);
        if (dailyAggregate)
            addToAggregate(dailyAggregate, record);
        const modelAggregate = byModel.get(record.model) || emptyAggregate();
        addToAggregate(modelAggregate, record);
        byModel.set(record.model, modelAggregate);
        const operationAggregate = byOperation.get(record.operation) || emptyAggregate();
        addToAggregate(operationAggregate, record);
        byOperation.set(record.operation, operationAggregate);
    }
    return {
        rangeDays,
        recordingAvailable: true,
        message: null,
        summary,
        daily: Array.from(daily.values()),
        byModel: Array.from(byModel.entries())
            .map(([model, aggregate]) => (Object.assign({ model }, aggregate)))
            .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens),
        byOperation: ['text', 'image', 'video'].map((operation) => (Object.assign({ operation }, (byOperation.get(operation) || emptyAggregate())))),
        recent: records.slice(0, 20),
        truncated: snapshot.size > MAX_RECORDS,
        uncertainSummary: {
            count: uncertain.length,
            reservedCostUsd: uncertain.reduce((sum, record) => sum + record.reservedCostUsd, 0),
        },
        uncertain,
        uncertainTruncated: uncertainSnapshot.size > MAX_UNCERTAIN_RECORDS,
    };
};
const reconcileUsageOperation = async (params) => {
    const usageRef = firestore_1.db.collection('openrouter_usage').doc(params.operationId);
    return firestore_1.db.runTransaction(async (transaction) => {
        const usageSnapshot = await transaction.get(usageRef);
        if (!usageSnapshot.exists)
            throw new UsageNotFoundError();
        const usage = usageSnapshot.data();
        const jobId = typeof usage.jobId === 'string' && SAFE_CONTEXT_ID.test(usage.jobId)
            ? usage.jobId
            : null;
        const usageUserIdHash = typeof usage.userIdHash === 'string' ? usage.userIdHash : null;
        const helperInput = Object.assign(Object.assign(Object.assign({ operationId: params.operationId, decision: params.decision }, (params.actualCostUsd !== undefined ? { actualCostUsd: params.actualCostUsd } : {})), (params.note ? { note: params.note } : {})), { reconciledByAdminUidHash: params.adminUidHash, usage });
        let matchedJob = null;
        let transition = (0, openrouterUsage_1.reconcileOpenRouterUsageState)(helperInput);
        const aggregateBackfillOnly = transition.outcome === 'idempotent'
            && usage.dailyCostAccountingVersion !== openrouterUsage_1.OPENROUTER_DAILY_COST_AGGREGATE_VERSION;
        if (transition.outcome === 'idempotent' && !aggregateBackfillOnly)
            return transition;
        const dailyCostIdentity = (0, openrouterUsage_1.resolveOpenRouterDailyCostAggregateIdentity)(usage);
        if (!dailyCostIdentity) {
            throw new openrouterUsage_1.OpenRouterUsageReconciliationError('invalid_data', 'The usage operation daily cost identity is invalid.');
        }
        const dailyCostRef = firestore_1.db.collection(openrouterUsage_1.OPENROUTER_DAILY_COST_COLLECTION)
            .doc(dailyCostIdentity.documentId);
        const [jobsSnapshot, dailyCostSnapshot] = await Promise.all([
            transition.outcome === 'updated' && jobId && usageUserIdHash
                ? transaction.get(firestore_1.db.collectionGroup('emoticonJobs').where('id', '==', jobId).limit(2))
                : Promise.resolve(null),
            transaction.get(dailyCostRef),
        ]);
        if (transition.outcome === 'updated' && jobsSnapshot) {
            for (const jobDocument of jobsSnapshot.docs) {
                const candidate = (0, openrouterUsage_1.reconcileOpenRouterUsageState)(Object.assign(Object.assign({}, helperInput), { job: jobDocument.data() }));
                if (candidate.jobUpdate) {
                    transition = candidate;
                    matchedJob = jobDocument;
                    break;
                }
            }
        }
        if (transition.outcome === 'updated' && !transition.usageUpdate) {
            throw new openrouterUsage_1.OpenRouterUsageReconciliationError('invalid_data', 'The reconciliation transition did not include a usage update.');
        }
        const storedDailyCost = dailyCostSnapshot.data() || {};
        if (dailyCostSnapshot.exists
            && (storedDailyCost.day !== dailyCostIdentity.day
                || storedDailyCost.userIdHash !== dailyCostIdentity.userIdHash)) {
            throw new openrouterUsage_1.OpenRouterUsageReconciliationError('invalid_data', 'The daily cost aggregate ownership is invalid.');
        }
        const readDailyCost = (field) => {
            const value = storedDailyCost[field];
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
                throw new openrouterUsage_1.OpenRouterUsageReconciliationError('invalid_data', `The daily cost aggregate ${field} is invalid.`);
            }
            return value;
        };
        const currentDailyActualCostUsd = dailyCostSnapshot.exists
            ? readDailyCost('actualCostUsd')
            : 0;
        const dailyInflightWasAccounted = usage.dailyCostAccountingVersion
            === openrouterUsage_1.OPENROUTER_DAILY_COST_AGGREGATE_VERSION
            && usage.dailyCostInflightAccounted === true;
        const currentDailyInflightCostUsd = dailyCostSnapshot.exists
            ? readDailyCost('inflightCostUsd')
            : dailyInflightWasAccounted
                ? transition.reservedCostUsd
                : 0;
        let nextDailyCost;
        try {
            nextDailyCost = (0, openrouterUsage_1.transitionOpenRouterDailyCostAggregate)({
                aggregate: {
                    actualCostUsd: currentDailyActualCostUsd,
                    inflightCostUsd: currentDailyInflightCostUsd,
                },
                actualDeltaUsd: transition.accountedCostUsd,
                inflightDeltaUsd: dailyInflightWasAccounted
                    ? -transition.reservedCostUsd
                    : 0,
            });
        }
        catch (error) {
            throw new openrouterUsage_1.OpenRouterUsageReconciliationError('invalid_data', error instanceof Error ? error.message : 'The daily cost transition is invalid.');
        }
        const dailyCostLimitUsd = (0, openrouterUsage_1.resolveOpenRouterDailyCostLimitUsd)({
            usage,
            aggregate: storedDailyCost,
        });
        const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
        const deleteField = admin.firestore.FieldValue.delete();
        if (aggregateBackfillOnly) {
            transaction.update(usageRef, {
                dailyCostAccountingVersion: openrouterUsage_1.OPENROUTER_DAILY_COST_AGGREGATE_VERSION,
                dailyCostInflightAccounted: false,
                dailyCostBackfilledAt: serverTimestamp,
                updatedAt: serverTimestamp,
            });
        }
        else {
            transaction.update(usageRef, Object.assign(Object.assign(Object.assign(Object.assign({}, transition.usageUpdate), { dailyCostAccountingVersion: openrouterUsage_1.OPENROUTER_DAILY_COST_AGGREGATE_VERSION, dailyCostInflightAccounted: false, reconciledAt: serverTimestamp, updatedAt: serverTimestamp }), (transition.usageUpdate.reconciliationNote
                ? {}
                : { reconciliationNote: deleteField })), (params.decision === 'charged'
                ? {
                    settledAt: serverTimestamp,
                    failureReason: deleteField,
                    failedAt: deleteField,
                }
                : { settledAt: deleteField })));
        }
        transaction.set(dailyCostRef, {
            version: openrouterUsage_1.OPENROUTER_DAILY_COST_AGGREGATE_VERSION,
            scope: 'emoticon_studio_user',
            userIdHash: dailyCostIdentity.userIdHash,
            day: dailyCostIdentity.day,
            dailyCostLimitUsd,
            actualCostUsd: nextDailyCost.actualCostUsd,
            inflightCostUsd: nextDailyCost.inflightCostUsd,
            reconciliationCount: admin.firestore.FieldValue.increment(1),
            createdAt: dailyCostSnapshot.exists
                ? storedDailyCost.createdAt || serverTimestamp
                : serverTimestamp,
            updatedAt: serverTimestamp,
        }, { merge: true });
        if (matchedJob && transition.jobUpdate) {
            transaction.update(matchedJob.ref, Object.assign(Object.assign({}, transition.jobUpdate), { openRouterUsageUpdatedAt: serverTimestamp }));
        }
        return transition;
    });
};
exports.openRouterUsage = (0, https_1.onRequest)({ cors: true, timeoutSeconds: 60, memory: '256MiB' }, async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        res.status(405).json({ error: 'Method not allowed.' });
        return;
    }
    const token = parseBearerToken(req.header('authorization') || req.header('Authorization'));
    if (!token) {
        res.status(401).json({ error: 'Authorization Bearer token is required.' });
        return;
    }
    let decoded;
    try {
        decoded = await admin.auth().verifyIdToken(token);
    }
    catch (_a) {
        res.status(401).json({ error: 'The authorization token is invalid or expired.' });
        return;
    }
    if (!await isAdmin(decoded.uid, decoded)) {
        res.status(403).json({ error: 'Administrator access is required.' });
        return;
    }
    try {
        if (req.method === 'GET') {
            const rawRange = Array.isArray(req.query.range) ? req.query.range[0] : req.query.range;
            const report = await loadUsageReport(typeof rawRange === 'string' ? rawRange : undefined);
            res.status(200).json(report);
            return;
        }
        let rawBody;
        try {
            rawBody = parseRequestBody(req.body);
        }
        catch (_b) {
            res.status(400).json({ error: 'The request body must be valid JSON.' });
            return;
        }
        const parsed = reconcileRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
            res.status(400).json({ error: 'The reconciliation request is invalid.' });
            return;
        }
        const adminUidHash = (0, node_crypto_1.createHash)('sha256').update(decoded.uid).digest('hex');
        const transition = await reconcileUsageOperation(Object.assign(Object.assign(Object.assign({ operationId: parsed.data.operationId, decision: parsed.data.decision }, (parsed.data.actualCostUsd !== undefined
            ? { actualCostUsd: parsed.data.actualCostUsd }
            : {})), (parsed.data.note ? { note: parsed.data.note } : {})), { adminUidHash }));
        res.status(200).json({
            operationId: parsed.data.operationId,
            state: transition.decision === 'charged' ? 'settled' : 'failed',
            decision: transition.decision,
            accountedCostUsd: transition.accountedCostUsd,
            jobUpdated: transition.reconciliationJobUpdated,
            alreadyReconciled: transition.outcome === 'idempotent',
        });
    }
    catch (error) {
        if (error instanceof UsageNotFoundError) {
            res.status(404).json({ error: 'The OpenRouter usage operation was not found.' });
            return;
        }
        if (error instanceof openrouterUsage_1.OpenRouterUsageReconciliationError) {
            const status = error.code === 'invalid_input' ? 400 : 409;
            res.status(status).json({
                error: error.code === 'conflict'
                    ? 'The usage operation has already been finalized with another outcome.'
                    : 'The usage operation cannot be reconciled safely.',
            });
            return;
        }
        logger.error('[OpenRouter Usage] Request failed.', {
            method: req.method,
            errorName: error instanceof Error ? error.name : 'UnknownError',
        });
        res.status(500).json({ error: 'The OpenRouter usage request could not be completed.' });
    }
});
//# sourceMappingURL=openRouterUsage.js.map