import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db as adminDb, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import { requireAdminAuth } from '@/lib/server/admin-auth';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  range: z.enum(['7', '30', '90']).optional().default('30'),
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

const toUsageRecord = (id: string, raw: Record<string, unknown>): UsageRecord | null => {
  if (raw.provider !== 'openrouter') return null;
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
    occurredAt: toOccurredAtIso(raw.occurredAt),
  };
};

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
    });
  }

  try {
    const rangeDays = Number(parsed.data.range);
    const dateKeys = buildDateKeys(rangeDays);
    const startDay = dateKeys[0];
    const endDay = dateKeys[dateKeys.length - 1];
    const snapshot = await adminDb
      .collection('openrouter_usage')
      .where('day', '>=', startDay)
      .where('day', '<=', endDay)
      .limit(MAX_RECORDS + 1)
      .get();

    const records = snapshot.docs
      .map((document) => toUsageRecord(document.id, document.data() as Record<string, unknown>))
      .filter((record): record is UsageRecord => record !== null)
      .sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || ''));
    const visibleRecords = records.slice(0, MAX_RECORDS);
    const summary = emptyAggregate();
    const daily = new Map(dateKeys.map((day) => [day, { day, ...emptyAggregate() }]));
    const byModel = new Map<string, Aggregate>();
    const byOperation = new Map<UsageOperation, Aggregate>();

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
    });
  } catch (error) {
    console.error('[OpenRouter Usage] Failed to load usage:', error);
    return NextResponse.json({ error: 'OpenRouter 사용량을 불러오지 못했습니다.' }, { status: 500 });
  }
}
