'use client';

import { httpsCallable } from 'firebase/functions';
import { asiaNortheastFunctions } from '@/firebase/functions';

export const EMOTICON_PROJECT_DELETION_MODES = [
  'project_only',
  'project_and_assets',
] as const;

export type EmoticonProjectDeletionMode = typeof EMOTICON_PROJECT_DELETION_MODES[number];

export type EmoticonProjectDeletionCounts = {
  deletedItems: number;
  deletedBatches: number;
  deletedJobs: number;
  deletedJobAssets: number;
  deletedSourceAssets: number;
  retainedJobs: number;
  retainedBatches: number;
  retainedJobAssets: number;
  retainedSourceAssets: number;
};

export type EmoticonProjectDeletionResult = {
  operationId: string;
  projectId: string;
  mode: EmoticonProjectDeletionMode;
  status: 'processing' | 'retryable_failed' | 'completed';
  phase: string;
  sourceCleanup:
    | 'retained_by_mode'
    | 'guarded_unreferenced_cleanup'
    | 'retained_until_source_lock_rules_enabled';
  counts: EmoticonProjectDeletionCounts;
};

const callable = () => httpsCallable<
  { projectId: string; mode: EmoticonProjectDeletionMode },
  EmoticonProjectDeletionResult
>(asiaNortheastFunctions, 'deleteEmoticonProjectSafely');

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function isRetryableDeletionError(error: unknown): boolean {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? String((error as { code: string }).code).replace(/^functions\//, '')
    : '';
  return [
    'aborted',
    'cancelled',
    'deadline-exceeded',
    'internal',
    'resource-exhausted',
    'unavailable',
    'unknown',
  ].includes(code);
}

/**
 * Continues the same idempotent deletion operation when the server yielded or
 * another invocation still owns its short lease. The backend remains the
 * authority for project ownership, active jobs, asset paths, and reference use.
 */
export async function deleteEmoticonProjectSafely(params: {
  projectId: string;
  mode: EmoticonProjectDeletionMode;
  maxContinuationAttempts?: number;
}): Promise<EmoticonProjectDeletionResult> {
  const projectId = params.projectId.trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(projectId)) {
    throw new Error('올바른 프로젝트 번호가 필요합니다.');
  }

  const maxAttempts = Math.max(1, Math.min(8, params.maxContinuationAttempts ?? 4));
  let latest: EmoticonProjectDeletionResult | null = null;
  let latestError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await waitForRetry(Math.min(4_000, 800 * (attempt + 1)));
    try {
      const response = await callable()({ projectId, mode: params.mode });
      latest = response.data;
      latestError = null;
      if (latest.status === 'completed') return latest;
      // processing과 retryable_failed 모두 같은 operationId에서 멱등적으로
      // 이어진다. 브라우저가 닫혀도 서버 스케줄러가 nextAttemptAt을 따라
      // 계속 처리하므로 여기서는 짧은 범위만 재시도한다.
    } catch (error) {
      latestError = error;
      if (!isRetryableDeletionError(error)) throw error;
    }
  }

  if (!latest) {
    if (latestError instanceof Error) throw latestError;
    throw new Error('프로젝트 삭제 작업을 시작하지 못했습니다.');
  }
  return latest;
}
