"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOTICON_BATCH_MAX_JOB_HISTORY = exports.EMOTICON_BATCH_MAX_CONCURRENCY = exports.EMOTICON_BATCH_MAX_ITEMS = exports.EMOTICON_BATCH_ITEM_STATUSES = exports.EMOTICON_BATCH_STATUSES = void 0;
exports.resolveEmoticonBatchExecutionSlot = resolveEmoticonBatchExecutionSlot;
exports.releaseEmoticonBatchExecutionSlot = releaseEmoticonBatchExecutionSlot;
exports.resolveEmoticonBatchRetryDisposition = resolveEmoticonBatchRetryDisposition;
exports.mapJobToEmoticonBatchItemState = mapJobToEmoticonBatchItemState;
exports.deriveEmoticonBatchAggregate = deriveEmoticonBatchAggregate;
exports.EMOTICON_BATCH_STATUSES = [
    'preparing',
    'running',
    'deferred',
    'completed',
    'partial',
    'failed',
    'cancelled',
];
exports.EMOTICON_BATCH_ITEM_STATUSES = [
    'pending',
    'queued',
    'running',
    'deferred',
    'completed',
    'failed',
    'cancelled',
    'not_enqueued',
];
exports.EMOTICON_BATCH_MAX_ITEMS = 64;
exports.EMOTICON_BATCH_MAX_CONCURRENCY = 3;
exports.EMOTICON_BATCH_MAX_JOB_HISTORY = 8;
const SAFE_JOB_ID = /^[A-Za-z0-9_-]{1,160}$/;
function normalizedExecutionJobIds(jobIds) {
    return [...new Set(jobIds)]
        .filter((jobId) => SAFE_JOB_ID.test(jobId))
        .slice(0, exports.EMOTICON_BATCH_MAX_CONCURRENCY);
}
function resolveEmoticonBatchExecutionSlot(params) {
    const executionJobIds = normalizedExecutionJobIds(params.executionJobIds);
    const requestedConcurrency = Number.isInteger(params.requestedConcurrency)
        ? Math.max(1, Math.min(exports.EMOTICON_BATCH_MAX_CONCURRENCY, params.requestedConcurrency))
        : 1;
    if (executionJobIds.includes(params.jobId)) {
        return { outcome: 'held', executionJobIds };
    }
    if (executionJobIds.length >= requestedConcurrency) {
        return { outcome: 'deferred', executionJobIds };
    }
    return {
        outcome: 'acquired',
        executionJobIds: [...executionJobIds, params.jobId],
    };
}
function releaseEmoticonBatchExecutionSlot(executionJobIds, jobId) {
    return normalizedExecutionJobIds(executionJobIds)
        .filter((executionJobId) => executionJobId !== jobId);
}
const ACTIVE_JOB_STATUSES = new Set([
    'queued',
    'analyzing',
    'generating',
    'validating',
    'animating',
    'rendering',
]);
function resolveEmoticonBatchRetryDisposition(params) {
    if (params.batchCurrentJobId !== params.projectCurrentJobId) {
        return 'project_item_replaced';
    }
    if (params.projectGenerationStatus === 'completed'
        || params.currentJobStatus === 'completed') {
        return 'project_item_completed';
    }
    if (params.projectGenerationStatus === 'queued'
        || params.projectGenerationStatus === 'generating'
        || ACTIVE_JOB_STATUSES.has(String(params.currentJobStatus || ''))) {
        return 'project_item_active';
    }
    return 'eligible';
}
function boundedProgress(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(100, Math.round(value)))
        : 0;
}
function mapJobToEmoticonBatchItemState(params) {
    var _a;
    const nowMs = (_a = params.nowMs) !== null && _a !== void 0 ? _a : Date.now();
    const rawStatus = typeof params.jobStatus === 'string' ? params.jobStatus : '';
    const deferredUntilMs = typeof params.deferredUntilMs === 'number'
        && Number.isFinite(params.deferredUntilMs)
        && params.deferredUntilMs > nowMs
        ? Math.round(params.deferredUntilMs)
        : null;
    let status;
    if (rawStatus === 'completed')
        status = 'completed';
    else if (rawStatus === 'failed')
        status = 'failed';
    else if (rawStatus === 'cancelled')
        status = 'cancelled';
    else if (rawStatus === 'queued' && deferredUntilMs !== null)
        status = 'deferred';
    else if (rawStatus === 'queued')
        status = 'queued';
    else if (ACTIVE_JOB_STATUSES.has(rawStatus))
        status = 'running';
    else
        status = params.current.status;
    const resolved = status === 'completed'
        || status === 'failed'
        || status === 'cancelled';
    const jobIds = params.current.jobIds.includes(params.jobId)
        ? params.current.jobIds
        : [...params.current.jobIds, params.jobId].slice(-exports.EMOTICON_BATCH_MAX_JOB_HISTORY);
    return Object.assign(Object.assign({}, params.current), { status, progress: resolved ? 100 : boundedProgress(params.jobProgress), jobIds, currentJobId: params.jobId, enqueueError: null, jobError: typeof params.jobError === 'string' && params.jobError.trim()
            ? params.jobError.trim().slice(0, 240)
            : null, deferredUntilMs });
}
function deriveEmoticonBatchAggregate(items, cancelRequested) {
    const counts = {
        total: items.length,
        pending: 0,
        queued: 0,
        running: 0,
        deferred: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        notEnqueued: 0,
    };
    let progressTotal = 0;
    items.forEach((item) => {
        if (item.status === 'not_enqueued')
            counts.notEnqueued += 1;
        else
            counts[item.status] += 1;
        progressTotal += boundedProgress(item.progress);
    });
    const activeCount = counts.pending + counts.queued + counts.running + counts.deferred;
    let status;
    if (counts.pending > 0)
        status = 'preparing';
    else if (counts.queued > 0 || counts.running > 0)
        status = 'running';
    else if (counts.deferred > 0)
        status = 'deferred';
    else if (cancelRequested)
        status = 'cancelled';
    else if (counts.completed === counts.total)
        status = 'completed';
    else if (counts.failed + counts.notEnqueued === counts.total)
        status = 'failed';
    else if (counts.cancelled === counts.total)
        status = 'cancelled';
    else
        status = 'partial';
    return {
        counts,
        progressPercent: counts.total
            ? Math.max(0, Math.min(100, Math.round(progressTotal / counts.total)))
            : 0,
        status,
        terminal: activeCount === 0,
    };
}
//# sourceMappingURL=batchContract.js.map