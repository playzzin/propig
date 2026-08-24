import type { EmoticonResourceMode } from './schema';

export type EmoticonRateLimitedMode =
    | 'generate'
    | 'plan'
    | 'profile'
    | 'sheet_plan'
    | 'repair_frame'
    | 'rerender';

export type EmoticonRateReservationState = {
    minuteBucket: number;
    minuteCount: number;
    dayBucket: number;
    dayCount: number;
};

export type EmoticonCostReservationState = {
    dayBucket: number;
    reservedUsd: number;
    reservationsByDay: Record<string, number>;
};

export type EmoticonCostLimits = {
    dailyUsd: number;
    perJobUsd: number;
    perImageUsd: number;
    perTextRequestUsd: number;
};

export type EmoticonRecoveryExecutionGateResult =
    | { outcome: 'not-required' }
    | { outcome: 'ready' }
    | { outcome: 'deferred'; executeAtMs: number }
    | {
        outcome: 'blocked';
        reason:
            | 'missing-rate-reservation'
            | 'missing-cost-authorization'
            | 'settled-cost-reservation';
    };

export const DEFAULT_EMOTICON_COST_LIMITS: Readonly<EmoticonCostLimits> = {
    dailyUsd: 25,
    perJobUsd: 8,
    perImageUsd: 0.35,
    perTextRequestUsd: 0.25,
};

export const EMOTICON_COST_CONTROL_VERSION = 4;
export const LEGACY_EMOTICON_COST_CONTROL_VERSION = 3;

export const DEFAULT_EMOTICON_DAILY_LIMITS: Readonly<Record<EmoticonRateLimitedMode, number>> = {
    // Request counts protect throughput. Monetary ceilings are enforced
    // per provider call; allocateEmoticonCostReservation remains for v3 recovery.
    generate: 32,
    plan: 24,
    profile: 16,
    sheet_plan: 24,
    repair_frame: 24,
    rerender: 256,
};

/**
 * Recovery may reuse an execution reservation, but it must never invent one.
 * A missing reservation means the initial trigger did not reach its server-only
 * cost/rate gate, so continuing would bypass the safeguards applied to new jobs.
 */
export function assessEmoticonRecoveryExecutionGate(params: {
    mode: EmoticonRateLimitedMode | 'import_frames';
    job: Record<string, unknown>;
    nowMs: number;
}): EmoticonRecoveryExecutionGateResult {
    if (params.mode === 'import_frames') return { outcome: 'not-required' };

    const executeAtMs = params.job.rateLimitExecuteAtMs;
    if (
        typeof executeAtMs !== 'number'
        || !Number.isFinite(executeAtMs)
        || executeAtMs < 0
    ) {
        return { outcome: 'blocked', reason: 'missing-rate-reservation' };
    }

    const authorizedCostUsd = params.job.openRouterAuthorizedCostUsd;
    const costControlVersion = params.job.costControlVersion;
    const validV4DailyLimit = typeof params.job.openRouterDailyCostLimitUsd === 'number'
        && Number.isFinite(params.job.openRouterDailyCostLimitUsd)
        && params.job.openRouterDailyCostLimitUsd > 0;
    const validLegacyReservation = costControlVersion === LEGACY_EMOTICON_COST_CONTROL_VERSION
        && Number.isInteger(params.job.openRouterCostReservationDayBucket);
    const isZeroProviderEfficientGenerate = params.mode === 'generate'
        && params.job.resourceMode === 'efficient'
        && params.job.aiGenerationProfile !== 'gpt-light-v1'
        && authorizedCostUsd === 0;
    const validAuthorization = typeof authorizedCostUsd === 'number'
        && Number.isFinite(authorizedCostUsd)
        && authorizedCostUsd >= 0
        && (params.mode === 'rerender' || authorizedCostUsd > 0 || isZeroProviderEfficientGenerate)
        && (
            (costControlVersion === EMOTICON_COST_CONTROL_VERSION && validV4DailyLimit)
            || validLegacyReservation
        );
    if (!validAuthorization) {
        return { outcome: 'blocked', reason: 'missing-cost-authorization' };
    }

    if (
        params.mode !== 'rerender'
        && params.job.costReservationSettledAt !== undefined
        && params.job.costReservationSettledAt !== null
    ) {
        return { outcome: 'blocked', reason: 'settled-cost-reservation' };
    }

    if (executeAtMs > params.nowMs) return { outcome: 'deferred', executeAtMs };
    return { outcome: 'ready' };
}

const DAY_MS = 86_400_000;
const KOREA_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;

export function koreaDayBucket(timestampMs: number): number {
    return Math.floor((timestampMs + KOREA_UTC_OFFSET_MS) / DAY_MS);
}

function koreaDayStartMs(dayBucket: number): number {
    return dayBucket * DAY_MS - KOREA_UTC_OFFSET_MS;
}

function positiveIntegerOverride(raw: string | undefined, fallback: number): number {
    const normalized = raw?.trim() || '';
    if (!/^[1-9]\d*$/.test(normalized)) return fallback;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function positiveCostOverride(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 10_000
        ? Math.round(parsed * 10_000) / 10_000
        : fallback;
}

export function getEmoticonStudioCostLimits(
    environment: Record<string, string | undefined> = process.env,
): Readonly<EmoticonCostLimits> {
    return {
        dailyUsd: positiveCostOverride(
            environment.EMOTICON_STUDIO_DAILY_COST_USD,
            DEFAULT_EMOTICON_COST_LIMITS.dailyUsd,
        ),
        perJobUsd: positiveCostOverride(
            environment.EMOTICON_STUDIO_MAX_JOB_COST_USD,
            DEFAULT_EMOTICON_COST_LIMITS.perJobUsd,
        ),
        perImageUsd: positiveCostOverride(
            environment.EMOTICON_STUDIO_MAX_IMAGE_COST_USD,
            DEFAULT_EMOTICON_COST_LIMITS.perImageUsd,
        ),
        perTextRequestUsd: positiveCostOverride(
            environment.EMOTICON_STUDIO_MAX_TEXT_REQUEST_COST_USD,
            DEFAULT_EMOTICON_COST_LIMITS.perTextRequestUsd,
        ),
    };
}

export function estimateEmoticonJobAuthorizationUsd(params: {
    mode: EmoticonRateLimitedMode;
    requestedFrameCount?: number;
    outputType?: 'static' | 'animated';
    resourceMode?: EmoticonResourceMode;
    aiGenerationProfile?: string;
    limits: EmoticonCostLimits;
}): number {
    if (params.mode === 'rerender') return 0;
    const isGptLightGeneration = params.mode === 'generate'
        && params.resourceMode === 'efficient'
        && params.aiGenerationProfile === 'gpt-light-v1';
    if (
        params.mode === 'generate'
        && params.resourceMode === 'efficient'
        && !isGptLightGeneration
    ) return 0;
    const textRequestCount = params.mode === 'generate'
        ? params.outputType === 'static'
            // Direction, pose review, and at most one corrected-pose review.
            ? 3
            // Direction, pose review, frame plan, sequence review, and at most
            // one corrected-pose plus one repair review.
            : 6
        : params.mode === 'repair_frame'
            // Repaired pose review plus repaired sequence review.
            ? 2
            // Planning/profile/sheet jobs each make one structured request.
            : 1;
    const textAllowance = params.limits.perTextRequestUsd * textRequestCount;
    let imageCalls = 0;
    if (params.mode === 'repair_frame') imageCalls = 1;
    else if (params.mode === 'generate') {
        const frameCount = Number.isInteger(params.requestedFrameCount)
            ? Math.max(1, Math.min(24, params.requestedFrameCount as number))
            : params.outputType === 'static' ? 1 : 24;
        imageCalls = params.outputType === 'static'
            ? 2
            : isGptLightGeneration
                ? Math.min(28, frameCount + 4)
                : Math.min(50, frameCount * 2 + 2);
    }
    const estimate = imageCalls * params.limits.perImageUsd + textAllowance;
    return Math.round(Math.min(params.limits.perJobUsd, Math.max(0.25, estimate)) * 10_000) / 10_000;
}

export function allocateEmoticonCostReservation(params: {
    nowMs: number;
    dailyLimitUsd: number;
    requestedUsd: number;
    state?: Partial<EmoticonCostReservationState>;
}): { executeAtMs: number; state: EmoticonCostReservationState } {
    const currentDayBucket = koreaDayBucket(params.nowMs);
    const storedDayBucket = Number.isInteger(params.state?.dayBucket)
        ? params.state!.dayBucket as number
        : currentDayBucket;
    const suppliedReservations = params.state?.reservationsByDay;
    const reservationsByDay = suppliedReservations && typeof suppliedReservations === 'object'
        ? Object.entries(suppliedReservations).reduce<Record<string, number>>((result, [key, value]) => {
            const bucket = Number(key);
            if (
                Number.isInteger(bucket)
                && bucket >= currentDayBucket - 1
                && bucket <= currentDayBucket + 32
                && typeof value === 'number'
                && Number.isFinite(value)
                && value >= 0
            ) result[String(bucket)] = Math.round(value * 10_000) / 10_000;
            return result;
        }, {})
        : {};
    if (
        !Object.keys(reservationsByDay).length
        && typeof params.state?.reservedUsd === 'number'
        && Number.isFinite(params.state.reservedUsd)
        && params.state.reservedUsd > 0
    ) {
        reservationsByDay[String(storedDayBucket)] = Math.round(params.state.reservedUsd * 10_000) / 10_000;
    }
    const requestedUsd = Math.max(0, Math.min(params.dailyLimitUsd, params.requestedUsd));
    let dayBucket = currentDayBucket;
    while (
        (reservationsByDay[String(dayBucket)] || 0) + requestedUsd > params.dailyLimitUsd
        && dayBucket < currentDayBucket + 32
    ) {
        dayBucket += 1;
    }
    const reservedUsd = Math.round(
        ((reservationsByDay[String(dayBucket)] || 0) + requestedUsd) * 10_000,
    ) / 10_000;
    reservationsByDay[String(dayBucket)] = reservedUsd;
    return {
        executeAtMs: dayBucket === currentDayBucket ? params.nowMs : koreaDayStartMs(dayBucket),
        state: {
            dayBucket,
            reservedUsd,
            reservationsByDay,
        },
    };
}

export function settleEmoticonCostReservation(params: {
    reservationsByDay?: Record<string, number>;
    dayBucket: number;
    authorizedUsd: number;
    accountedUsd: number;
}): Record<string, number> {
    const result = Object.entries(params.reservationsByDay || {})
        .reduce<Record<string, number>>((normalized, [key, value]) => {
            if (Number.isInteger(Number(key)) && Number.isFinite(value) && value >= 0) {
                normalized[String(Number(key))] = Math.round(value * 10_000) / 10_000;
            }
            return normalized;
        }, {});
    const key = String(params.dayBucket);
    const reservedUsd = result[key] || 0;
    const authorizedUsd = Number.isFinite(params.authorizedUsd)
        ? Math.max(0, params.authorizedUsd)
        : 0;
    const accountedUsd = Number.isFinite(params.accountedUsd)
        ? Math.max(0, params.accountedUsd)
        : 0;
    result[key] = Math.round(
        Math.max(0, reservedUsd - authorizedUsd + Math.min(authorizedUsd, accountedUsd)) * 10_000,
    ) / 10_000;
    return result;
}

export function getEmoticonStudioDailyLimits(
    environment: Record<string, string | undefined> = process.env,
): Readonly<Record<EmoticonRateLimitedMode, number>> {
    return {
        generate: positiveIntegerOverride(
            environment.EMOTICON_STUDIO_GENERATE_DAILY_LIMIT,
            DEFAULT_EMOTICON_DAILY_LIMITS.generate,
        ),
        plan: positiveIntegerOverride(
            environment.EMOTICON_STUDIO_PLAN_DAILY_LIMIT,
            DEFAULT_EMOTICON_DAILY_LIMITS.plan,
        ),
        profile: positiveIntegerOverride(
            environment.EMOTICON_STUDIO_PROFILE_DAILY_LIMIT,
            DEFAULT_EMOTICON_DAILY_LIMITS.profile,
        ),
        sheet_plan: positiveIntegerOverride(
            environment.EMOTICON_STUDIO_SHEET_PLAN_DAILY_LIMIT,
            DEFAULT_EMOTICON_DAILY_LIMITS.sheet_plan,
        ),
        repair_frame: positiveIntegerOverride(
            environment.EMOTICON_STUDIO_REPAIR_DAILY_LIMIT,
            DEFAULT_EMOTICON_DAILY_LIMITS.repair_frame,
        ),
        rerender: positiveIntegerOverride(
            environment.EMOTICON_STUDIO_RERENDER_DAILY_LIMIT,
            DEFAULT_EMOTICON_DAILY_LIMITS.rerender,
        ),
    };
}

export function allocateEmoticonRateSlot(params: {
    nowMs: number;
    minuteLimit: number;
    dailyLimit: number;
    state?: Partial<EmoticonRateReservationState>;
}): { executeAtMs: number; state: EmoticonRateReservationState } {
    const minuteMs = 60_000;
    const currentMinuteBucket = Math.floor(params.nowMs / minuteMs);
    const storedMinuteBucket = Number.isInteger(params.state?.minuteBucket)
        ? params.state!.minuteBucket as number
        : currentMinuteBucket;
    const storedMinuteCount = Number.isInteger(params.state?.minuteCount)
        ? Math.max(0, params.state!.minuteCount as number)
        : 0;
    let minuteBucket = Math.max(currentMinuteBucket, storedMinuteBucket);
    let minuteCount = minuteBucket === storedMinuteBucket ? storedMinuteCount : 0;
    if (minuteCount >= params.minuteLimit) {
        minuteBucket += 1;
        minuteCount = 0;
    }

    let dayBucket = koreaDayBucket(minuteBucket * minuteMs);
    const storedDayBucket = Number.isInteger(params.state?.dayBucket)
        ? params.state!.dayBucket as number
        : dayBucket;
    let dayCount = storedDayBucket === dayBucket && Number.isInteger(params.state?.dayCount)
        ? Math.max(0, params.state!.dayCount as number)
        : 0;
    if (dayCount >= params.dailyLimit) {
        dayBucket = Math.max(dayBucket, storedDayBucket + 1);
        minuteBucket = Math.ceil(koreaDayStartMs(dayBucket) / minuteMs);
        minuteCount = 0;
        dayCount = 0;
    }
    return {
        executeAtMs: minuteBucket === currentMinuteBucket
            ? params.nowMs
            : minuteBucket * minuteMs,
        state: {
            minuteBucket,
            minuteCount: minuteCount + 1,
            dayBucket,
            dayCount: dayCount + 1,
        },
    };
}
