"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordOpenRouterUsage = void 0;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const firestore_1 = require("./firestore");
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
const buildUsageDocumentId = (entry) => `request_${(0, node_crypto_1.createHash)('sha256')
    .update(entry.requestId || '')
    .digest('hex')}`;
/** Records accounting metadata only; it never writes prompts, output, user IDs, or keys. */
const recordOpenRouterUsage = async (entry) => {
    try {
        if (!admin.apps.length)
            admin.initializeApp();
        const now = new Date();
        const usage = Object.assign(Object.assign({ provider: 'openrouter', operation: entry.operation, source: 'firebase_function', model: entry.model.trim() || 'unknown', promptTokens: toNonNegativeNumber(entry.promptTokens), completionTokens: toNonNegativeNumber(entry.completionTokens), totalTokens: toNonNegativeNumber(entry.totalTokens), costUsd: toOptionalCost(entry.costUsd) }, (entry.requestId ? { requestId: entry.requestId } : {})), { day: toKoreaDateKey(now), occurredAt: admin.firestore.FieldValue.serverTimestamp() });
        const collection = firestore_1.db.collection('openrouter_usage');
        if (!entry.requestId) {
            await collection.add(usage);
            return;
        }
        const document = collection.doc(buildUsageDocumentId(entry));
        await firestore_1.db.runTransaction(async (transaction) => {
            const existing = await transaction.get(collection.where('requestId', '==', entry.requestId).limit(1));
            if (!existing.empty)
                return;
            transaction.create(document, usage);
        });
    }
    catch (error) {
        // Usage recording must not turn a successful generation into an error.
        console.warn('[OpenRouter Usage] Failed to record usage:', error);
    }
};
exports.recordOpenRouterUsage = recordOpenRouterUsage;
//# sourceMappingURL=openrouterUsage.js.map