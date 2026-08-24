"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_EMOTICON_DAILY_LIMITS = exports.LEGACY_EMOTICON_COST_CONTROL_VERSION = exports.EMOTICON_COST_CONTROL_VERSION = exports.DEFAULT_EMOTICON_COST_LIMITS = void 0;
exports.assessEmoticonRecoveryExecutionGate = assessEmoticonRecoveryExecutionGate;
exports.koreaDayBucket = koreaDayBucket;
exports.getEmoticonStudioCostLimits = getEmoticonStudioCostLimits;
exports.estimateEmoticonJobAuthorizationUsd = estimateEmoticonJobAuthorizationUsd;
exports.allocateEmoticonCostReservation = allocateEmoticonCostReservation;
exports.settleEmoticonCostReservation = settleEmoticonCostReservation;
exports.getEmoticonStudioDailyLimits = getEmoticonStudioDailyLimits;
exports.allocateEmoticonRateSlot = allocateEmoticonRateSlot;
exports.DEFAULT_EMOTICON_COST_LIMITS = {
    dailyUsd: 25,
    perJobUsd: 8,
    perImageUsd: 0.35,
    perTextRequestUsd: 0.25,
};
exports.EMOTICON_COST_CONTROL_VERSION = 4;
exports.LEGACY_EMOTICON_COST_CONTROL_VERSION = 3;
exports.DEFAULT_EMOTICON_DAILY_LIMITS = {
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
function assessEmoticonRecoveryExecutionGate(params) {
    if (params.mode === 'import_frames')
        return { outcome: 'not-required' };
    const executeAtMs = params.job.rateLimitExecuteAtMs;
    if (typeof executeAtMs !== 'number'
        || !Number.isFinite(executeAtMs)
        || executeAtMs < 0) {
        return { outcome: 'blocked', reason: 'missing-rate-reservation' };
    }
    const authorizedCostUsd = params.job.openRouterAuthorizedCostUsd;
    const costControlVersion = params.job.costControlVersion;
    const validV4DailyLimit = typeof params.job.openRouterDailyCostLimitUsd === 'number'
        && Number.isFinite(params.job.openRouterDailyCostLimitUsd)
        && params.job.openRouterDailyCostLimitUsd > 0;
    const validLegacyReservation = costControlVersion === exports.LEGACY_EMOTICON_COST_CONTROL_VERSION
        && Number.isInteger(params.job.openRouterCostReservationDayBucket);
    const isZeroProviderEfficientGenerate = params.mode === 'generate'
        && params.job.resourceMode === 'efficient'
        && params.job.aiGenerationProfile !== 'gpt-light-v1'
        && authorizedCostUsd === 0;
    const validAuthorization = typeof authorizedCostUsd === 'number'
        && Number.isFinite(authorizedCostUsd)
        && authorizedCostUsd >= 0
        && (params.mode === 'rerender' || authorizedCostUsd > 0 || isZeroProviderEfficientGenerate)
        && ((costControlVersion === exports.EMOTICON_COST_CONTROL_VERSION && validV4DailyLimit)
            || validLegacyReservation);
    if (!validAuthorization) {
        return { outcome: 'blocked', reason: 'missing-cost-authorization' };
    }
    if (params.mode !== 'rerender'
        && params.job.costReservationSettledAt !== undefined
        && params.job.costReservationSettledAt !== null) {
        return { outcome: 'blocked', reason: 'settled-cost-reservation' };
    }
    if (executeAtMs > params.nowMs)
        return { outcome: 'deferred', executeAtMs };
    return { outcome: 'ready' };
}
const DAY_MS = 86400000;
const KOREA_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;
function koreaDayBucket(timestampMs) {
    return Math.floor((timestampMs + KOREA_UTC_OFFSET_MS) / DAY_MS);
}
function koreaDayStartMs(dayBucket) {
    return dayBucket * DAY_MS - KOREA_UTC_OFFSET_MS;
}
function positiveIntegerOverride(raw, fallback) {
    const normalized = (raw === null || raw === void 0 ? void 0 : raw.trim()) || '';
    if (!/^[1-9]\d*$/.test(normalized))
        return fallback;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
}
function positiveCostOverride(raw, fallback) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 10000
        ? Math.round(parsed * 10000) / 10000
        : fallback;
}
function getEmoticonStudioCostLimits(environment = process.env) {
    return {
        dailyUsd: positiveCostOverride(environment.EMOTICON_STUDIO_DAILY_COST_USD, exports.DEFAULT_EMOTICON_COST_LIMITS.dailyUsd),
        perJobUsd: positiveCostOverride(environment.EMOTICON_STUDIO_MAX_JOB_COST_USD, exports.DEFAULT_EMOTICON_COST_LIMITS.perJobUsd),
        perImageUsd: positiveCostOverride(environment.EMOTICON_STUDIO_MAX_IMAGE_COST_USD, exports.DEFAULT_EMOTICON_COST_LIMITS.perImageUsd),
        perTextRequestUsd: positiveCostOverride(environment.EMOTICON_STUDIO_MAX_TEXT_REQUEST_COST_USD, exports.DEFAULT_EMOTICON_COST_LIMITS.perTextRequestUsd),
    };
}
function estimateEmoticonJobAuthorizationUsd(params) {
    if (params.mode === 'rerender')
        return 0;
    const isGptLightGeneration = params.mode === 'generate'
        && params.resourceMode === 'efficient'
        && params.aiGenerationProfile === 'gpt-light-v1';
    if (params.mode === 'generate'
        && params.resourceMode === 'efficient'
        && !isGptLightGeneration)
        return 0;
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
    if (params.mode === 'repair_frame')
        imageCalls = 1;
    else if (params.mode === 'generate') {
        const frameCount = Number.isInteger(params.requestedFrameCount)
            ? Math.max(1, Math.min(24, params.requestedFrameCount))
            : params.outputType === 'static' ? 1 : 24;
        imageCalls = params.outputType === 'static'
            ? 2
            : isGptLightGeneration
                ? Math.min(28, frameCount + 4)
                : Math.min(50, frameCount * 2 + 2);
    }
    const estimate = imageCalls * params.limits.perImageUsd + textAllowance;
    return Math.round(Math.min(params.limits.perJobUsd, Math.max(0.25, estimate)) * 10000) / 10000;
}
function allocateEmoticonCostReservation(params) {
    var _a, _b, _c;
    const currentDayBucket = koreaDayBucket(params.nowMs);
    const storedDayBucket = Number.isInteger((_a = params.state) === null || _a === void 0 ? void 0 : _a.dayBucket)
        ? params.state.dayBucket
        : currentDayBucket;
    const suppliedReservations = (_b = params.state) === null || _b === void 0 ? void 0 : _b.reservationsByDay;
    const reservationsByDay = suppliedReservations && typeof suppliedReservations === 'object'
        ? Object.entries(suppliedReservations).reduce((result, [key, value]) => {
            const bucket = Number(key);
            if (Number.isInteger(bucket)
                && bucket >= currentDayBucket - 1
                && bucket <= currentDayBucket + 32
                && typeof value === 'number'
                && Number.isFinite(value)
                && value >= 0)
                result[String(bucket)] = Math.round(value * 10000) / 10000;
            return result;
        }, {})
        : {};
    if (!Object.keys(reservationsByDay).length
        && typeof ((_c = params.state) === null || _c === void 0 ? void 0 : _c.reservedUsd) === 'number'
        && Number.isFinite(params.state.reservedUsd)
        && params.state.reservedUsd > 0) {
        reservationsByDay[String(storedDayBucket)] = Math.round(params.state.reservedUsd * 10000) / 10000;
    }
    const requestedUsd = Math.max(0, Math.min(params.dailyLimitUsd, params.requestedUsd));
    let dayBucket = currentDayBucket;
    while ((reservationsByDay[String(dayBucket)] || 0) + requestedUsd > params.dailyLimitUsd
        && dayBucket < currentDayBucket + 32) {
        dayBucket += 1;
    }
    const reservedUsd = Math.round(((reservationsByDay[String(dayBucket)] || 0) + requestedUsd) * 10000) / 10000;
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
function settleEmoticonCostReservation(params) {
    const result = Object.entries(params.reservationsByDay || {})
        .reduce((normalized, [key, value]) => {
        if (Number.isInteger(Number(key)) && Number.isFinite(value) && value >= 0) {
            normalized[String(Number(key))] = Math.round(value * 10000) / 10000;
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
    result[key] = Math.round(Math.max(0, reservedUsd - authorizedUsd + Math.min(authorizedUsd, accountedUsd)) * 10000) / 10000;
    return result;
}
function getEmoticonStudioDailyLimits(environment = process.env) {
    return {
        generate: positiveIntegerOverride(environment.EMOTICON_STUDIO_GENERATE_DAILY_LIMIT, exports.DEFAULT_EMOTICON_DAILY_LIMITS.generate),
        plan: positiveIntegerOverride(environment.EMOTICON_STUDIO_PLAN_DAILY_LIMIT, exports.DEFAULT_EMOTICON_DAILY_LIMITS.plan),
        profile: positiveIntegerOverride(environment.EMOTICON_STUDIO_PROFILE_DAILY_LIMIT, exports.DEFAULT_EMOTICON_DAILY_LIMITS.profile),
        sheet_plan: positiveIntegerOverride(environment.EMOTICON_STUDIO_SHEET_PLAN_DAILY_LIMIT, exports.DEFAULT_EMOTICON_DAILY_LIMITS.sheet_plan),
        repair_frame: positiveIntegerOverride(environment.EMOTICON_STUDIO_REPAIR_DAILY_LIMIT, exports.DEFAULT_EMOTICON_DAILY_LIMITS.repair_frame),
        rerender: positiveIntegerOverride(environment.EMOTICON_STUDIO_RERENDER_DAILY_LIMIT, exports.DEFAULT_EMOTICON_DAILY_LIMITS.rerender),
    };
}
function allocateEmoticonRateSlot(params) {
    var _a, _b, _c, _d;
    const minuteMs = 60000;
    const currentMinuteBucket = Math.floor(params.nowMs / minuteMs);
    const storedMinuteBucket = Number.isInteger((_a = params.state) === null || _a === void 0 ? void 0 : _a.minuteBucket)
        ? params.state.minuteBucket
        : currentMinuteBucket;
    const storedMinuteCount = Number.isInteger((_b = params.state) === null || _b === void 0 ? void 0 : _b.minuteCount)
        ? Math.max(0, params.state.minuteCount)
        : 0;
    let minuteBucket = Math.max(currentMinuteBucket, storedMinuteBucket);
    let minuteCount = minuteBucket === storedMinuteBucket ? storedMinuteCount : 0;
    if (minuteCount >= params.minuteLimit) {
        minuteBucket += 1;
        minuteCount = 0;
    }
    let dayBucket = koreaDayBucket(minuteBucket * minuteMs);
    const storedDayBucket = Number.isInteger((_c = params.state) === null || _c === void 0 ? void 0 : _c.dayBucket)
        ? params.state.dayBucket
        : dayBucket;
    let dayCount = storedDayBucket === dayBucket && Number.isInteger((_d = params.state) === null || _d === void 0 ? void 0 : _d.dayCount)
        ? Math.max(0, params.state.dayCount)
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
//# sourceMappingURL=rateLimits.js.map