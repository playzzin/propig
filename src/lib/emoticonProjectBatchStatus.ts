import type { EmoticonBatchItem } from '@/schemas/emoticonStudio';
import type { EmoticonProjectItem } from '@/schemas/emoticonProject';

/**
 * A project item can be regenerated outside the batch that originally created
 * it. Only let a batch item affect the card while it still tracks the
 * project's current job; otherwise the newer standalone job is authoritative.
 */
export function trackedEmoticonBatchItem(
  batchItem: EmoticonBatchItem | undefined,
  projectItem: Pick<EmoticonProjectItem, 'jobId'>,
): EmoticonBatchItem | undefined {
  if (!batchItem) return undefined;
  if (!projectItem.jobId) return batchItem.currentJobId ? undefined : batchItem;
  return batchItem.currentJobId === projectItem.jobId || batchItem.jobIds.includes(projectItem.jobId)
    ? batchItem
    : undefined;
}
