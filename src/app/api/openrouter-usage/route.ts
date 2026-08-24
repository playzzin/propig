import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db as adminDb, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import { requireAdminAuth } from '@/lib/server/admin-auth';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  range: z.enum(['7', '30', '90']).optional().default('30'),
});

const ReconciliationSchema = z
  .object({
    operationId: z.string().regex(/^operation_[a-f0-9]{64}$/),
    decision: z.enum(['charged', 'not_charged']),
    actualCostUsd: z.number().finite().min(0).max(100).optional(),
    note: z.string().max(300).transform((value) => value.trim()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === 'charged' && value.actualCostUsd === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['actualCostUsd'],
        message: '과금된 요청은 실제 비용이 필요합니다.',
      });
    }
    if (value.decision === 'not_charged' && value.actualCostUsd !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['actualCostUsd'],
        message: '과금되지 않은 요청에는 실제 비용을 입력할 수 없습니다.',
      });
    }
  });

type UsageOperation = 'text' | 'image' | 'video';
type UsageSource = 'next_server' | 'firebase_function';

type UsageRecord = {
  id: string;
  operation: UsageOperation;
  source: UsageSource;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
  day: string;
  occurredAt: string | null;
};

type UncertainUsageRecord = {
  id: string;
  operation: UsageOperation;
  model: string;
  estimatedCostUsd: number;
  reservedCostUsd: number;
  day: string;
  reservedAt: string | null;
  updatedAt: string | null;
  jobId: string;
  projectId: string | null;
  stage: string | null;
  requestId: string | null;
  provider: string | null;
};

type Aggregate = {
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  pricedRequestCount: number;
  pricedTotalTokens: number;
  costUsd: number;
};

const MAX_RECORDS = 10_000;
const MAX_UNCERTAIN_RECORDS = 100;

const emptyAggregate = (): Aggregate => ({
  requestCount: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  pricedRequestCount: 0,
  pricedTotalTokens: 0,
  costUsd: 0,
});

const toNonNegativeNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const toNonNegativeSafeInteger = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

const toOptionalCost = (value: unknown): number | null =>
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

const shiftDateKey = (dateKey: string, offsetDays: number): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
};

const buildDateKeys = (range: number): string[] => {
  const today = toKoreaDateKey(new Date());
  return Array.from({ length: range }, (_, index) => shiftDateKey(today, index - range + 1));
};

const toOccurredAtIso = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
};

const toOptionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const hashIdentifier = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const toUsageRecord = (id: string, raw: Record<string, unknown>): UsageRecord | null => {
  if (raw.provider !== 'openrouter') return null;
  if (Object.prototype.hasOwnProperty.call(raw, 'state') && raw.state !== 'settled') return null;
  if (raw.operation !== 'text' && raw.operation !== 'image' && raw.operation !== 'video') return null;
  if (raw.source !== 'next_server' && raw.source !== 'firebase_function') return null;
  if (typeof raw.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day)) return null;

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
    occurredAt: toOccurredAtIso(raw.occurredAt)
      || toOccurredAtIso(raw.settledAt)
      || toOccurredAtIso(raw.updatedAt)
      || toOccurredAtIso(raw.reservedAt),
  };
};

const toUncertainUsageRecord = (
  id: string,
  raw: Record<string, unknown>,
): UncertainUsageRecord | null => {
  if (
    raw.provider !== 'openrouter'
    || raw.source !== 'firebase_function'
    || raw.state !== 'uncertain'
  ) return null;
  if (raw.operation !== 'text' && raw.operation !== 'image' && raw.operation !== 'video') return null;
  if (typeof raw.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day)) return null;
  const jobId = toOptionalString(raw.jobId);
  if (!jobId) return null;

  return {
    id,
    operation: raw.operation,
    model: toOptionalString(raw.model) || 'unknown',
    estimatedCostUsd: toNonNegativeNumber(raw.estimatedCostUsd),
    reservedCostUsd: toNonNegativeNumber(raw.reservedCostUsd),
    day: raw.day,
    reservedAt: toOccurredAtIso(raw.reservedAt),
    updatedAt: toOccurredAtIso(raw.updatedAt),
    jobId,
    projectId: toOptionalString(raw.projectId),
    stage: toOptionalString(raw.stage),
    requestId: toOptionalString(raw.requestId),
    provider: toOptionalString(raw.endpointProviderTag) || toOptionalString(raw.endpointProviderSlug),
  };
};

class ReconciliationRequestError extends Error {
  constructor(
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'ReconciliationRequestError';
  }
}

const addToAggregate = (aggregate: Aggregate, record: UsageRecord) => {
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

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = QuerySchema.safeParse({ range: request.nextUrl.searchParams.get('range') || undefined });
  if (!parsed.success) return NextResponse.json({ error: '조회 기간이 올바르지 않습니다.' }, { status: 400 });

  if (!getFirebaseAdminStatus().canPersistToFirestore) {
    return NextResponse.json({
      rangeDays: Number(parsed.data.range),
      recordingAvailable: false,
      message: 'Firebase Admin 자격 증명이 없어 사용량 기록을 조회할 수 없습니다.',
      summary: emptyAggregate(),
      daily: [],
      byModel: [],
      byOperation: [],
      recent: [],
      truncated: false,
      uncertainSummary: { count: 0, reservedCostUsd: 0 },
      uncertain: [],
      uncertainTruncated: false,
    });
  }

  try {
    const rangeDays = Number(parsed.data.range);
    const dateKeys = buildDateKeys(rangeDays);
    const startDay = dateKeys[0];
    const endDay = dateKeys[dateKeys.length - 1];
    const usageCollection = adminDb.collection('openrouter_usage');
    const [snapshot, uncertainSnapshot] = await Promise.all([
      usageCollection
        .where('day', '>=', startDay)
        .where('day', '<=', endDay)
        .limit(MAX_RECORDS + 1)
        .get(),
      usageCollection
        .where('state', '==', 'uncertain')
        .orderBy('updatedAt', 'desc')
        .limit(MAX_UNCERTAIN_RECORDS + 1)
        .get(),
    ]);

    const records = snapshot.docs
      .map((document) => toUsageRecord(document.id, document.data() as Record<string, unknown>))
      .filter((record): record is UsageRecord => record !== null)
      .sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || ''));
    const visibleRecords = records.slice(0, MAX_RECORDS);
    const summary = emptyAggregate();
    const daily = new Map(dateKeys.map((day) => [day, { day, ...emptyAggregate() }]));
    const byModel = new Map<string, Aggregate>();
    const byOperation = new Map<UsageOperation, Aggregate>();
    const uncertainRecords = uncertainSnapshot.docs
      .map((document) => (
        toUncertainUsageRecord(document.id, document.data() as Record<string, unknown>)
      ))
      .filter((record): record is UncertainUsageRecord => record !== null);
    const visibleUncertainRecords = uncertainRecords.slice(0, MAX_UNCERTAIN_RECORDS);

    for (const record of visibleRecords) {
      addToAggregate(summary, record);
      const dailyAggregate = daily.get(record.day);
      if (dailyAggregate) addToAggregate(dailyAggregate, record);

      const modelAggregate = byModel.get(record.model) || emptyAggregate();
      addToAggregate(modelAggregate, record);
      byModel.set(record.model, modelAggregate);

      const operationAggregate = byOperation.get(record.operation) || emptyAggregate();
      addToAggregate(operationAggregate, record);
      byOperation.set(record.operation, operationAggregate);
    }

    return NextResponse.json({
      rangeDays,
      recordingAvailable: true,
      message: null,
      summary,
      daily: Array.from(daily.values()),
      byModel: Array.from(byModel.entries())
        .map(([model, aggregate]) => ({ model, ...aggregate }))
        .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens),
      byOperation: (['text', 'image', 'video'] as const).map((operation) => ({
        operation,
        ...(byOperation.get(operation) || emptyAggregate()),
      })),
      recent: visibleRecords.slice(0, 20),
      truncated: snapshot.size > MAX_RECORDS,
      uncertainSummary: {
        count: visibleUncertainRecords.length,
        reservedCostUsd: visibleUncertainRecords.reduce(
          (total, record) => total + record.reservedCostUsd,
          0,
        ),
      },
      uncertain: visibleUncertainRecords,
      uncertainTruncated: uncertainSnapshot.size > MAX_UNCERTAIN_RECORDS,
    });
  } catch (error) {
    console.error('[OpenRouter Usage] Failed to load usage:', error);
    return NextResponse.json({ error: 'OpenRouter 사용량을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = ReconciliationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '정산 요청 형식이 올바르지 않습니다.' },
      { status: 400 },
    );
  }

  if (!getFirebaseAdminStatus().canPersistToFirestore) {
    return NextResponse.json(
      { error: 'Firebase Admin 자격 증명이 없어 비용을 정산할 수 없습니다.' },
      { status: 503 },
    );
  }

  const { operationId, decision, actualCostUsd, note } = parsed.data;
  if (decision === 'charged' && actualCostUsd === undefined) {
    return NextResponse.json(
      { error: '과금된 요청은 실제 비용이 필요합니다.' },
      { status: 400 },
    );
  }

  try {
    const usageRef = adminDb.collection('openrouter_usage').doc(operationId);
    const adminUidHash = hashIdentifier(auth.uid);
    const result = await adminDb.runTransaction(async (transaction) => {
      const usageSnapshot = await transaction.get(usageRef);
      if (!usageSnapshot.exists) {
        throw new ReconciliationRequestError(404, '정산할 OpenRouter 사용 기록을 찾을 수 없습니다.');
      }

      const usage = usageSnapshot.data() as Record<string, unknown>;
      if (usage.provider !== 'openrouter' || usage.source !== 'firebase_function') {
        throw new ReconciliationRequestError(404, '정산할 OpenRouter 사용 기록을 찾을 수 없습니다.');
      }

      const existingDecision = usage.reconciliationDecision;
      if (existingDecision === 'charged' || existingDecision === 'not_charged') {
        if (existingDecision !== decision) {
          throw new ReconciliationRequestError(409, '이미 반대 결정으로 정산된 요청입니다.');
        }
        return {
          operationId,
          state: existingDecision === 'charged' ? 'settled' as const : 'failed' as const,
          decision,
          accountedCostUsd: existingDecision === 'charged'
            ? toNonNegativeNumber(usage.costUsd)
            : 0,
          jobUpdated: usage.reconciliationJobUpdated === true,
          alreadyReconciled: true,
        };
      }

      if (usage.state !== 'uncertain') {
        throw new ReconciliationRequestError(409, '불확실 상태의 요청만 수동 정산할 수 있습니다.');
      }

      const jobId = toOptionalString(usage.jobId);
      const usageUserIdHash = toOptionalString(usage.userIdHash);
      let matchingJob:
        | FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
        | null = null;

      if (jobId && usageUserIdHash) {
        const jobsSnapshot = await transaction.get(
          adminDb
            .collectionGroup('emoticonJobs')
            .where('id', '==', jobId)
            .limit(2),
        );
        const matchingJobs = jobsSnapshot.docs.filter((jobSnapshot) => {
          const jobData = jobSnapshot.data();
          const jobUserId = jobData.userId;
          return jobData.id === jobId
            && typeof jobUserId === 'string'
            && hashIdentifier(jobUserId) === usageUserIdHash;
        });
        if (matchingJobs.length === 1) matchingJob = matchingJobs[0];
      }

      const reservedCostUsd = toNonNegativeNumber(usage.reservedCostUsd);
      const accountedCostUsd = decision === 'charged' && actualCostUsd !== undefined
        ? actualCostUsd
        : 0;
      const jobUpdated = matchingJob !== null;
      const timestamp = FieldValue.serverTimestamp();
      const usageUpdate = {
        state: decision === 'charged' ? 'settled' : 'failed',
        costUsd: accountedCostUsd,
        costSource: 'admin_reconciliation',
        reservedCostUsd: 0,
        reconciliationDecision: decision,
        ...(note ? { reconciliationNote: note } : {}),
        reconciledActualCostUsd: accountedCostUsd,
        reconciledByAdminUidHash: adminUidHash,
        reconciledAt: timestamp,
        reconciliationJobUpdated: jobUpdated,
        ...(decision === 'charged'
          ? { settledAt: timestamp }
          : {
              failedAt: timestamp,
              failureReason: 'admin_confirmed_not_charged',
            }),
        updatedAt: timestamp,
      };
      transaction.update(usageRef, usageUpdate);

      if (matchingJob) {
        const jobData = matchingJob.data();
        const currentActualCostUsd = toNonNegativeNumber(jobData.openRouterActualCostUsd);
        const currentInflightCostUsd = toNonNegativeNumber(jobData.openRouterInflightCostUsd);
        const currentRequestCount = toNonNegativeSafeInteger(jobData.openRouterUsageRequestCount);
        transaction.update(matchingJob.ref, {
          ...(decision === 'charged'
            ? {
                openRouterActualCostUsd: currentActualCostUsd + accountedCostUsd,
                openRouterUsageRequestCount: currentRequestCount + 1,
              }
            : {}),
          openRouterInflightCostUsd: Math.max(0, currentInflightCostUsd - reservedCostUsd),
          openRouterUsageUpdatedAt: timestamp,
        });
      }

      return {
        operationId,
        state: decision === 'charged' ? 'settled' as const : 'failed' as const,
        decision,
        accountedCostUsd,
        jobUpdated,
        alreadyReconciled: false,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReconciliationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[OpenRouter Usage] Failed to reconcile uncertain usage:', error);
    return NextResponse.json(
      { error: 'OpenRouter 불확실 비용을 정산하지 못했습니다.' },
      { status: 500 },
    );
  }
}
