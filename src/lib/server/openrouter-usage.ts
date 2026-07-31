import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db as adminDb, getFirebaseAdminStatus } from '@/lib/firebase-admin';

export type OpenRouterUsageOperation = 'text' | 'image' | 'video';
export type OpenRouterUsageSource = 'next_server';

export type OpenRouterUsageEntry = {
  operation: OpenRouterUsageOperation;
  source: OpenRouterUsageSource;
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

/**
 * Stores only accounting metadata. Prompts, generated content, user identifiers,
 * and API credentials are deliberately excluded from this collection.
 */
export const recordOpenRouterUsage = async (entry: OpenRouterUsageEntry): Promise<void> => {
  if (!getFirebaseAdminStatus().canPersistToFirestore) return;

  try {
    const now = new Date();
    const usage = {
      provider: 'openrouter',
      operation: entry.operation,
      source: entry.source,
      model: entry.model.trim() || 'unknown',
      promptTokens: toNonNegativeNumber(entry.promptTokens),
      completionTokens: toNonNegativeNumber(entry.completionTokens),
      totalTokens: toNonNegativeNumber(entry.totalTokens),
      costUsd: toOptionalCost(entry.costUsd),
      ...(entry.requestId ? { requestId: entry.requestId } : {}),
      day: toKoreaDateKey(now),
      occurredAt: FieldValue.serverTimestamp(),
    };
    const collection = adminDb.collection('openrouter_usage');

    if (!entry.requestId) {
      await collection.add(usage);
      return;
    }

    const document = collection.doc(buildUsageDocumentId(entry));
    await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(
        collection.where('requestId', '==', entry.requestId).limit(1),
      );
      if (!existing.empty) return;
      transaction.create(document, usage);
    });
  } catch (error) {
    // Accounting must never make a completed customer request fail.
    console.warn('[OpenRouter Usage] Failed to record usage:', error);
  }
};
