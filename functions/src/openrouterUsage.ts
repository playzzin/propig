import { createHash } from 'node:crypto';
import * as admin from 'firebase-admin';
import { db } from './firestore';

export type OpenRouterUsageOperation = 'text' | 'image' | 'video';

type OpenRouterUsageEntry = {
    operation: OpenRouterUsageOperation;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    requestId?: string;
};

const toNonNegativeNumber = (value: number | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const toOptionalCost = (value: number | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const toKoreaDateKey = (date: Date): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value || '';

    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
};

const buildUsageDocumentId = (entry: OpenRouterUsageEntry): string =>
    `request_${createHash('sha256')
        .update(entry.requestId || '')
        .digest('hex')}`;

/** Records accounting metadata only; it never writes prompts, output, user IDs, or keys. */
export const recordOpenRouterUsage = async (entry: OpenRouterUsageEntry): Promise<void> => {
    try {
        if (!admin.apps.length) admin.initializeApp();
        const now = new Date();
        const usage = {
            provider: 'openrouter',
            operation: entry.operation,
            source: 'firebase_function',
            model: entry.model.trim() || 'unknown',
            promptTokens: toNonNegativeNumber(entry.promptTokens),
            completionTokens: toNonNegativeNumber(entry.completionTokens),
            totalTokens: toNonNegativeNumber(entry.totalTokens),
            costUsd: toOptionalCost(entry.costUsd),
            ...(entry.requestId ? { requestId: entry.requestId } : {}),
            day: toKoreaDateKey(now),
            occurredAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const collection = db.collection('openrouter_usage');

        if (!entry.requestId) {
            await collection.add(usage);
            return;
        }

        const document = collection.doc(buildUsageDocumentId(entry));
        await db.runTransaction(async (transaction) => {
            const existing = await transaction.get(
                collection.where('requestId', '==', entry.requestId).limit(1),
            );
            if (!existing.empty) return;
            transaction.create(document, usage);
        });
    } catch (error) {
        // Usage recording must not turn a successful generation into an error.
        console.warn('[OpenRouter Usage] Failed to record usage:', error);
    }
};
