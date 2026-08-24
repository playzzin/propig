/**
 * Job health is intentionally independent from Firestore and UI code so the
 * timeout behaviour can be tested without a browser or Firebase emulator.
 */
export const EMOTICON_QUEUE_STALL_THRESHOLD_MS = 90 * 1000;
export const EMOTICON_PROCESSING_STALL_THRESHOLD_MS = 11 * 60 * 1000;

const WORKING_JOB_STATUSES = new Set([
  'queued',
  'analyzing',
  'generating',
  'validating',
  'animating',
  'rendering',
]);

type TimestampLike = {
  toDate?: () => Date;
  toMillis?: () => number;
};

type JobHealthInput = {
  status?: string | null;
  statusMessage?: string | null;
  updatedAt?: unknown;
  deferredUntilMs?: number | null;
};

export type EmoticonJobStallState =
  | 'queue_not_started'
  | 'processing_stalled'
  | null;

function getTimestampMs(timestamp: unknown): number | null {
  if (!timestamp || typeof timestamp !== 'object') return null;

  const timestampLike = timestamp as TimestampLike;

  if (typeof timestampLike.toMillis === 'function') {
    const value = timestampLike.toMillis();
    return Number.isFinite(value) ? value : null;
  }

  if (typeof timestampLike.toDate === 'function') {
    const value = timestampLike.toDate().getTime();
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

/**
 * A queued job should receive a first server update promptly. Later phases can
 * take longer because they include OpenRouter analysis and media rendering.
 */
export function getEmoticonJobStallState(
  job: JobHealthInput,
  nowMs = Date.now(),
): EmoticonJobStallState {
  if (!job.status || !WORKING_JOB_STATUSES.has(job.status)) return null;

  // A cost-protected batch slot is deliberately waiting, not stalled. The
  // server scheduler releases it automatically at this timestamp.
  if (
    typeof job.deferredUntilMs === 'number'
    && Number.isFinite(job.deferredUntilMs)
    && job.deferredUntilMs > nowMs
  ) return null;

  const updatedAtMs = getTimestampMs(job.updatedAt);
  if (!updatedAtMs || nowMs < updatedAtMs) return null;

  const thresholdMs = job.status === 'queued'
    ? EMOTICON_QUEUE_STALL_THRESHOLD_MS
    : EMOTICON_PROCESSING_STALL_THRESHOLD_MS;

  if (nowMs - updatedAtMs < thresholdMs) return null;

  return job.status === 'queued' ? 'queue_not_started' : 'processing_stalled';
}

export function isEmoticonJobStalled(
  job: JobHealthInput,
  nowMs = Date.now(),
): boolean {
  return getEmoticonJobStallState(job, nowMs) !== null;
}

/**
 * Recent-job cards must not keep showing an obsolete queue message after the
 * job has already failed, been cancelled, or stopped heartbeating. Keep this
 * presentation rule beside the stall detector so every UI uses the same clock.
 */
export function getEmoticonJobHistoryStatusLabel(
  job: JobHealthInput,
  nowMs = Date.now(),
): string {
  const stallState = getEmoticonJobStallState(job, nowMs);
  if (stallState === 'queue_not_started') {
    return '처리 시작 지연 · 작업을 열어 다시 시작 가능';
  }
  if (stallState === 'processing_stalled') {
    return '처리 중단 감지 · 작업을 열어 복구 가능';
  }
  if (job.status === 'completed') return '완성';
  if (job.status === 'failed') return '실패';
  if (job.status === 'cancelled') return '취소됨';
  return job.statusMessage?.trim() || '상태 확인 중';
}
