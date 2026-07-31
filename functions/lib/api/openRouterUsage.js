"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openRouterUsage = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const firestore_1 = require("../firestore");
if (!admin.apps.length) {
    admin.initializeApp();
}
const MAX_RECORDS = 10000;
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
const toOccurredAtIso = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    if (value && typeof value === 'object' && 'toDate' in value) {
        try {
            return value.toDate().toISOString();
        }
        catch (_a) {
            return null;
        }
    }
    return null;
};
const toUsageRecord = (id, raw) => {
    if (raw.provider !== 'openrouter')
        return null;
    if (raw.operation !== 'text' && raw.operation !== 'image' && raw.operation !== 'video')
        return null;
    if (raw.source !== 'next_server' && raw.source !== 'firebase_function')
        return null;
    if (typeof raw.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day))
        return null;
    return {
        id,
        operation: raw.operation,
        source: raw.source,
        model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : 'unknown',
        promptTokens: toNonNegativeNumber(raw.promptTokens),
        completionTokens: toNonNegativeNumber(raw.completionTokens),
        totalTokens: toNonNegativeNumber(raw.totalTokens),
        costUsd: toOptionalCost(raw.costUsd),
        day: raw.day,
        occurredAt: toOccurredAtIso(raw.occurredAt),
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
const hasAdminAccess = async (uid, claims) => {
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
exports.openRouterUsage = (0, https_1.onRequest)({ cors: true, timeoutSeconds: 60, memory: '256MiB' }, async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
    }
    const token = parseBearerToken(req.header('authorization') || req.header('Authorization'));
    if (!token) {
        res.status(401).json({ error: 'Authorization Bearer token is required.' });
        return;
    }
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        if (!await hasAdminAccess(decoded.uid, decoded)) {
            res.status(403).json({ error: '관리자 권한이 없습니다.' });
            return;
        }
        const rawRange = Array.isArray(req.query.range) ? req.query.range[0] : req.query.range;
        if (rawRange && rawRange !== '7' && rawRange !== '30' && rawRange !== '90') {
            res.status(400).json({ error: '조회 기간이 올바르지 않습니다.' });
            return;
        }
        const rangeDays = rawRange === '7' ? 7 : rawRange === '90' ? 90 : 30;
        const dateKeys = buildDateKeys(rangeDays);
        const startDay = dateKeys[0];
        const endDay = dateKeys[dateKeys.length - 1];
        const snapshot = await firestore_1.db
            .collection('openrouter_usage')
            .where('day', '>=', startDay)
            .where('day', '<=', endDay)
            .limit(MAX_RECORDS + 1)
            .get();
        const records = snapshot.docs
            .map((document) => toUsageRecord(document.id, document.data()))
            .filter((record) => record !== null)
            .sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || ''))
            .slice(0, MAX_RECORDS);
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
        res.status(200).json({
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
        });
    }
    catch (error) {
        logger.error('[OpenRouter Usage] Failed to load usage.', error);
        res.status(500).json({ error: 'OpenRouter 사용량을 불러오지 못했습니다.' });
    }
});
//# sourceMappingURL=openRouterUsage.js.map