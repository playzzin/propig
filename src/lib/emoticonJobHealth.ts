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
  updatedAt?: unknown;
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
