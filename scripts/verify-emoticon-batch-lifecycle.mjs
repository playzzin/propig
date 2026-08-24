import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { trackedEmoticonBatchItem } from '../src/lib/emoticonProjectBatchStatus.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const contract = require(path.join(root, 'functions/lib/emoticonStudio/batchContract.js'));

const item = (itemId, status, progress = 0) => ({
  itemId,
  status,
  progress,
  attemptCount: 1,
  jobIds: [],
  currentJobId: null,
  enqueueError: null,
  jobError: null,
  deferredUntilMs: null,
});

const staleBatchItem = {
  ...item('stale-item', 'failed', 100),
  currentJobId: 'batch-job-a',
  jobIds: ['batch-job-a'],
  jobError: 'old batch failure',
};
assert.equal(
  trackedEmoticonBatchItem(staleBatchItem, { jobId: 'standalone-job-b' }),
  undefined,
  'A superseded batch must not override a newer standalone job on the project item.',
);
assert.equal(
  trackedEmoticonBatchItem(staleBatchItem, { jobId: 'batch-job-a' }),
  staleBatchItem,
  'The batch remains authoritative while the project item still points at its job.',
);
const notYetEnqueuedBatchItem = { ...staleBatchItem, currentJobId: null };
assert.equal(
  trackedEmoticonBatchItem(notYetEnqueuedBatchItem, { jobId: null }),
  notYetEnqueuedBatchItem,
  'A not-yet-enqueued batch item may drive an item that has no job yet.',
);
assert.equal(
  trackedEmoticonBatchItem(staleBatchItem, { jobId: null }),
  undefined,
  'A project item with no job must not inherit an older enqueued batch job.',
);

assert.equal(contract.deriveEmoticonBatchAggregate([
  item('a', 'pending'),
  item('b', 'pending'),
], false).status, 'preparing');
assert.equal(contract.deriveEmoticonBatchAggregate([
  item('a', 'running', 40),
  item('b', 'deferred', 0),
], false).status, 'running');
assert.equal(contract.deriveEmoticonBatchAggregate([
  item('a', 'deferred'),
  item('b', 'deferred'),
], false).status, 'deferred');
assert.deepEqual(
  contract.deriveEmoticonBatchAggregate([
    item('a', 'completed', 100),
    item('b', 'failed', 100),
  ], false),
  {
    counts: {
      total: 2,
      pending: 0,
      queued: 0,
      running: 0,
      deferred: 0,
      completed: 1,
      failed: 1,
      cancelled: 0,
      notEnqueued: 0,
    },
    progressPercent: 100,
    status: 'partial',
    terminal: true,
  },
);
assert.equal(contract.deriveEmoticonBatchAggregate([
  item('a', 'failed', 100),
  item('b', 'not_enqueued', 100),
], false).status, 'failed');
assert.equal(contract.deriveEmoticonBatchAggregate([
  item('a', 'completed', 100),
  item('b', 'cancelled', 100),
], true).status, 'cancelled');

const deferred = contract.mapJobToEmoticonBatchItemState({
  current: item('a', 'pending'),
  jobId: 'job_a',
  jobStatus: 'queued',
  jobProgress: 2,
  deferredUntilMs: 20_000,
  nowMs: 10_000,
});
assert.equal(deferred.status, 'deferred');
assert.equal(deferred.currentJobId, 'job_a');
assert.deepEqual(deferred.jobIds, ['job_a']);
assert.deepEqual(
  contract.mapJobToEmoticonBatchItemState({
    current: deferred,
    jobId: 'job_a',
    jobStatus: 'queued',
    jobProgress: 2,
    deferredUntilMs: 20_000,
    nowMs: 10_000,
  }).jobIds,
  ['job_a'],
  'Repeated trigger delivery must not duplicate a job id.',
);
assert.equal(contract.mapJobToEmoticonBatchItemState({
  current: deferred,
  jobId: 'job_a',
  jobStatus: 'failed',
  jobProgress: 68,
  jobError: 'provider failed',
}).progress, 100);

assert.equal(contract.resolveEmoticonBatchRetryDisposition({
  batchCurrentJobId: 'job_a',
  projectCurrentJobId: 'job_a',
  projectGenerationStatus: 'failed',
  currentJobStatus: 'failed',
}), 'eligible');
assert.equal(contract.resolveEmoticonBatchRetryDisposition({
  batchCurrentJobId: 'job_a',
  projectCurrentJobId: 'job_b',
  projectGenerationStatus: 'completed',
  currentJobStatus: 'failed',
}), 'project_item_replaced');
assert.equal(contract.resolveEmoticonBatchRetryDisposition({
  batchCurrentJobId: 'job_a',
  projectCurrentJobId: 'job_a',
  projectGenerationStatus: 'completed',
  currentJobStatus: 'failed',
}), 'project_item_completed');
assert.equal(contract.resolveEmoticonBatchRetryDisposition({
  batchCurrentJobId: 'job_a',
  projectCurrentJobId: 'job_a',
  projectGenerationStatus: 'failed',
  currentJobStatus: 'rendering',
}), 'project_item_active');

const firstSlot = contract.resolveEmoticonBatchExecutionSlot({
  executionJobIds: [],
  requestedConcurrency: 2,
  jobId: 'job_a',
});
assert.deepEqual(firstSlot, { outcome: 'acquired', executionJobIds: ['job_a'] });
assert.deepEqual(contract.resolveEmoticonBatchExecutionSlot({
  executionJobIds: firstSlot.executionJobIds,
  requestedConcurrency: 2,
  jobId: 'job_a',
}), { outcome: 'held', executionJobIds: ['job_a'] });
const secondSlot = contract.resolveEmoticonBatchExecutionSlot({
  executionJobIds: firstSlot.executionJobIds,
  requestedConcurrency: 2,
  jobId: 'job_b',
});
assert.deepEqual(secondSlot, { outcome: 'acquired', executionJobIds: ['job_a', 'job_b'] });
assert.equal(contract.resolveEmoticonBatchExecutionSlot({
  executionJobIds: secondSlot.executionJobIds,
  requestedConcurrency: 2,
  jobId: 'job_c',
}).outcome, 'deferred');
assert.deepEqual(
  contract.releaseEmoticonBatchExecutionSlot(secondSlot.executionJobIds, 'job_a'),
  ['job_b'],
);

const clientSchema = fs.readFileSync(path.join(root, 'src/schemas/emoticonStudio.ts'), 'utf8');
const functionSchema = fs.readFileSync(path.join(root, 'functions/src/emoticonStudio/schema.ts'), 'utf8');
const batchFunctions = fs.readFileSync(path.join(root, 'functions/src/emoticonStudio/batches.ts'), 'utf8');
const jobTrigger = fs.readFileSync(path.join(root, 'functions/src/triggers/onEmoticonJobCreated.ts'), 'utf8');
const deferredRelease = fs.readFileSync(path.join(root, 'functions/src/triggers/releaseDeferredEmoticonJobs.ts'), 'utf8');
const jobRecovery = fs.readFileSync(path.join(root, 'functions/src/emoticonStudio/jobRecovery.ts'), 'utf8');
const deletionFunctions = fs.readFileSync(path.join(root, 'functions/src/emoticonStudio/deleteProject.ts'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/services/emoticonStudioService.ts'), 'utf8');
const studioHook = fs.readFileSync(path.join(root, 'src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts'), 'utf8');
const resultCard = fs.readFileSync(path.join(root, 'src/app/admin/emoticon-studio/studio/CreationResultCard.tsx'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const indexes = JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8'));

for (const status of contract.EMOTICON_BATCH_STATUSES) {
  assert.match(clientSchema, new RegExp(`'${status}'`));
  assert.match(functionSchema, /EMOTICON_BATCH_STATUSES/);
}
assert.match(clientSchema, /emoticonBatchSchema/);
assert.match(functionSchema, /emoticonBatchSchema/);
assert.match(clientSchema, /batchId: z\.string\(\)\.regex/);
assert.match(functionSchema, /batchId: z\.string\(\)\.regex/);
assert.match(clientSchema, /executionJobIds: z\.array[\s\S]*?\.max\(3\)\.default\(\[\]\)/);
assert.match(functionSchema, /executionJobIds: z\.array[\s\S]*?\.max\(3\)\.default\(\[\]\)/);
for (const schema of [clientSchema, functionSchema]) {
  assert.match(schema, /enqueueRoundId: z\.string\(\)\.regex/);
  assert.match(schema, /enqueueProjectItemRevision: z\.number\(\)\.int\(\)\.nonnegative\(\)\.optional\(\)/);
  assert.match(schema, /enqueueItemAttempts: z\.record/);
  assert.match(schema, /enqueueItemRevisions: z\.record/);
  assert.match(schema, /enqueueRoundLeaseExpiresAtMs: z\.number\(\)\.int\(\)\.nonnegative\(\)\.optional\(\)/);
  assert.match(schema, /batchEnqueueRoundId: z\.string\(\)\.regex/);
  assert.match(schema, /batchRetryRound: z\.number\(\)\.int\(\)/);
  assert.match(schema, /batchItemAttemptCount: z\.number\(\)\.int\(\)/);
  assert.match(schema, /const pendingItemsAreCurrent = batch\.items/);
  assert.match(schema, /batch\.enqueueRoundLeaseExpiresAtMs <= batch\.enqueueRoundOpenedAtMs/);
}

for (const callable of [
  'createEmoticonBatch',
  'recordEmoticonBatchEnqueueResult',
  'finalizeEmoticonBatchEnqueue',
  'refreshEmoticonBatch',
  'retryFailedEmoticonBatchItems',
  'cancelEmoticonBatch',
]) assert.match(batchFunctions, new RegExp(`export const ${callable} = onCall`));
assert.match(batchFunctions, /onEmoticonBatchJobWritten = onDocumentWritten/);
assert.match(batchFunctions, /where\('batchId', '==', batchId\)/);
assert.match(batchFunctions, /item\.status === 'failed' \|\| item\.status === 'not_enqueued'/);
assert.match(batchFunctions, /item\.attemptCount < 8/);
assert.match(batchFunctions, /batch\.lastRetryRequestId === retryRequestId/);
assert.match(batchFunctions, /if \(!currentAggregate\.terminal\)/);
assert.match(batchFunctions, /실행 중인 항목이 모두 끝난 뒤 실패 항목을 다시 시도해 주세요/);
assert.match(batchFunctions, /lastRetryItemIds: retryItemIds/);
assert.match(batchFunctions, /lastRetryProjectRevision: projectRevision/);
assert.match(batchFunctions, /lastRetryTargets: retryTargets/);
assert.match(batchFunctions, /lastRetrySkippedItems: skippedItems/);
assert.match(batchFunctions, /projectRevision,/);
assert.match(batchFunctions, /resolveEmoticonBatchRetryDisposition/);
assert.match(batchFunctions, /batchJobId !== projectJobId|project_item_replaced/);
assert.match(batchFunctions, /itemRevision: projectItem\.revision/);
assert.match(batchFunctions, /projectSnapshot\.data\(\)\?\.deletionLocked === true/);
assert.match(batchFunctions, /ACTIVE_JOB_STATUSES\.has\(String\(job\.status\)\)/);
assert.match(batchFunctions, /export async function claimEmoticonBatchExecutionSlot/);
assert.match(batchFunctions, /resolveEmoticonBatchExecutionSlot/);
assert.match(batchFunctions, /TERMINAL_JOB_STATUSES\.has\(String\(latestJob\.status\)\)/);
assert.match(batchFunctions, /executionJobIds: releasedExecutionJobIds/);
assert.match(batchFunctions, /batch\.projectRevision !== project\.revision/);
assert.match(batchFunctions, /const retryResult = await db\.runTransaction\(async \(transaction\) => \{[\s\S]*?const retryTargets: EmoticonBatchRetryTarget\[\] = \[\];/);
assert.doesNotMatch(batchFunctions, /let retryTargets: EmoticonBatchRetryTarget/);
assert.doesNotMatch(batchFunctions, /let skippedItems: EmoticonBatchRetrySkippedItem/);
assert.match(batchFunctions, /return \{ batchId, \.\.\.retryResult \};/);
assert.match(batchFunctions, /enqueueRoundId: proposedEnqueueRoundId/);
assert.match(batchFunctions, /attemptCount,[\s\S]*?enqueueRoundId: proposedEnqueueRoundId[\s\S]*?enqueueProjectItemRevision: projectItem\.revision/);
assert.match(batchFunctions, /function itemMatchesEnqueueRound/);
assert.match(batchFunctions, /function jobMatchesCurrentEnqueueRound/);
assert.match(batchFunctions, /if \(!itemMatchesEnqueueRound\(batch, current, fence, itemAttemptCount\)\) return false/);
assert.match(batchFunctions, /jobMatchesCurrentEnqueueRound\(batch, current, job\)/);
assert.match(batchFunctions, /projectItem\.revision !== current\.enqueueProjectItemRevision/);
assert.match(batchFunctions, /expectedRound: fence/);
assert.match(batchFunctions, /closePending: false/);
assert.match(batchFunctions, /closeExpiredRound: true/);
assert.match(batchFunctions, /batch\.enqueueRoundLeaseExpiresAtMs <= nowMs/);
assert.match(batchFunctions, /closesExpectedRound/);
assert.match(batchFunctions, /projectItemSnapshots\[itemIndex\]\.data\(\)\?\.revision[\s\S]*?item\.enqueueProjectItemRevision/);
assert.match(batchFunctions, /아직 실행 중인 작업이 있습니다\. 상태를 새로고침한 뒤 다시 시도해 주세요/);

const rateReservationIndex = jobTrigger.indexOf('const reservation = await reserveRateLimitSlot({');
const batchSlotClaimIndex = jobTrigger.indexOf('const batchSlot = await claimEmoticonBatchExecutionSlot({');
const projectSyncIndex = jobTrigger.indexOf("generationStatus: 'generating'", batchSlotClaimIndex);
assert.ok(
  rateReservationIndex >= 0
  && batchSlotClaimIndex > rateReservationIndex
  && projectSyncIndex > batchSlotClaimIndex,
  'A batch execution slot must be claimed after rate reservation and before provider execution.',
);
assert.match(jobTrigger, /reason: 'batch_concurrency'/);
assert.match(jobTrigger, /batchId\?: string;[\s\S]*?projectId\?: string;[\s\S]*?projectItemId\?: string;/);
assert.match(jobTrigger, /transaction\.create\(queueRef, \{[\s\S]*?params\.batchId \? \{ batchId: params\.batchId \} : \{\}/);
assert.match(jobTrigger, /reason: 'batch_concurrency'[\s\S]*?batchId: parsed\.data\.batchId[\s\S]*?projectItemId: parsed\.data\.projectItemId/);
assert.match(deferredRelease, /resolveEmoticonBatchExecutionSlot/);
assert.match(deferredRelease, /requestedConcurrency: batch!\.requestedConcurrency/);
assert.match(deferredRelease, /return 'deferred' as const/);
assert.match(deferredRelease, /executionJobIds: slot\.executionJobIds/);
const immediateWakeStart = deferredRelease.indexOf('export async function wakeNextDeferredEmoticonBatchJob');
const schedulerFallbackStart = deferredRelease.indexOf('export const releaseDeferredEmoticonJobs = onSchedule');
assert.ok(
  immediateWakeStart >= 0 && schedulerFallbackStart > immediateWakeStart,
  'Immediate batch wake-up must coexist with the minute scheduler fallback.',
);
assert.match(deferredRelease.slice(schedulerFallbackStart), /schedule: '\* \* \* \* \*'/);
const immediateWake = deferredRelease.slice(immediateWakeStart, schedulerFallbackStart);
assert.match(immediateWake, /deferredQueueDocumentId\(params\.userId, jobId\)/);
assert.match(immediateWake, /\.slice\(0, 64\)/);
assert.match(immediateWake, /parsedBatch\.data\.requestedConcurrency|parsedBatch\.data\.executionJobIds/);
assert.doesNotMatch(immediateWake, /\.where\(/, 'Immediate wake-up should use bounded deterministic queue reads.');
assert.match(deferredRelease, /queued\.reason !== 'batch_concurrency'/);
assert.match(deferredRelease, /queued\.executeAtMs > nowMs && !immediateBatchWake/);
assert.match(deferredRelease, /job\.batchId !== immediateBatchWake\.batchId/);
assert.match(deferredRelease, /const queueIdentityMismatch = \([\s\S]*?queued\.projectItemId !== job\.projectItemId/);
assert.match(deferredRelease, /batch\.projectRevision === currentProjectRevision/);
assert.match(deferredRelease, /itemSnapshot\.data\(\)\?\.jobId === jobId/);
assert.match(deferredRelease, /batch\.cancelRequestedAt/);
assert.match(batchFunctions, /const releasedExecutionSlot = await db\.runTransaction/);
assert.match(batchFunctions, /if \(releasedExecutionSlot\) \{[\s\S]*?wakeNextDeferredEmoticonBatchJob\(\{ userId, batchId \}\)/);
assert.match(batchFunctions, /Immediate batch slot wake-up failed/);
const terminalTransactionEnd = batchFunctions.indexOf('if (releasedExecutionSlot) {');
const terminalTransactionStart = batchFunctions.lastIndexOf(
  'const releasedExecutionSlot = await db.runTransaction',
  terminalTransactionEnd,
);
assert.ok(
  terminalTransactionStart >= 0 && terminalTransactionEnd > terminalTransactionStart,
  'The immediate wake-up must run only after the terminal slot-release transaction commits.',
);
for (const source of [deferredRelease, jobRecovery]) {
  assert.match(source, /job\.batchEnqueueRoundId === batch\.enqueueRoundId/);
  assert.match(source, /job\.batchRetryRound === batch\.retryRound/);
  assert.match(source, /job\.batchItemAttemptCount === batchItem\.attemptCount/);
  assert.match(source, /batch\.enqueueItemAttempts\?\.\[batchItem\.itemId\]/);
}
assert.match(deletionFunctions, /executionJobIds: \[\]/);

const turnCreateIndex = studioHook.indexOf('const turn = await createEmoticonCreationTurn({');
const itemLoopIndex = studioHook.indexOf('for (const [index, item] of selectedItems.entries()) {', turnCreateIndex);
const turnLinkIndex = studioHook.indexOf('await linkCreationTurnJobs({', itemLoopIndex);
assert.ok(
  turnCreateIndex >= 0 && itemLoopIndex > turnCreateIndex && turnLinkIndex > itemLoopIndex,
  'The unified Studio must create one Turn before jobs and link every created job afterward.',
);
assert.match(studioHook, /const selectedItems = generationItems\.slice\(0, itemCount\)/);
assert.match(studioHook, /createdJobIds\.push\(result\.jobId\)/);
assert.match(studioHook, /await linkCreationTurnJobs\(\{ userId: currentUser\.uid, turn, jobIds: createdJobIds, formats \}\)/);
assert.match(studioHook, /if \(createdTurn\) \{[\s\S]{0,140}?if \(createdJobIds\.length\) \{[\s\S]{0,220}?linkCreationTurnJobs/);
assert.match(studioHook, /toast\.error\(createdJobIds\.length \? `\$\{message\} 시작된 \$\{createdJobIds\.length\}개 작업은 계속 진행됩니다/);
assert.match(service, /subscribeRecentEmoticonBatches/);
assert.match(service, /where\('projectId', '==', params\.projectId\)/);
assert.match(service, /batch\.projectRevision !== projectRevision/);
assert.match(service, /batchItem\.status !== 'pending'/);
assert.match(service, /batchItem\.currentJobId !== null/);
assert.match(service, /lastRetryProjectRevision !== projectRevision/);
assert.match(service, /retryTarget\.itemRevision !== projectItemRevision/);
assert.match(service, /emoticonBatchRetryResultSchema\.safeParse\(response\.data\)/);
assert.match(service, /batch\.enqueueRoundId !== params\.batchEnqueueRoundId/);
assert.match(service, /batchItem\.attemptCount !== params\.batchItemAttemptCount/);
assert.match(service, /batchItem\.enqueueProjectItemRevision !== params\.expectedProjectItemRevision/);
assert.match(service, /batch\.enqueueRoundLeaseExpiresAtMs <= activeJobCreatedAtMs/);
assert.match(service, /batchEnqueueRoundId: params\.batchEnqueueRoundId/);
assert.match(service, /emoticonBatchEnqueueRoundSchema\.safeParse\(response\.data\)/);
assert.match(resultCard, /props\.jobs\.length > 1/);
assert.match(resultCard, /aria-label="다른 생성 결과"/);
assert.match(resultCard, /onSelectJob\(job\)/);
assert.match(resultCard, /staticAnimationJobs\.length >= 2/);
assert.match(resultCard, /<StaticAnimationBuilder/);

assert.match(rules, /match \/emoticonBatches\/\{batchId\}[\s\S]*allow create, update, delete: if false;/);
assert.match(rules, /function validEmoticonBatchJobLink\(userId\)/);
assert.match(rules, /get\(batchPath\)\.data\.projectRevision == request\.resource\.data\.projectRevision/);
assert.match(rules, /get\(batchPath\)\.data\.projectRevision is int/);
assert.match(rules, /request\.resource\.data\.projectRevision == get\(projectPath\)\.data\.revision/);
assert.match(rules, /get\(batchPath\)\.data\.enqueueRoundId == request\.resource\.data\.batchEnqueueRoundId/);
assert.match(rules, /enqueueItemAttempts\.get\(request\.resource\.data\.projectItemId, -1\)/);
assert.match(rules, /enqueueItemRevisions\.get\(request\.resource\.data\.projectItemId, -1\)/);
assert.match(rules, /enqueueRoundLeaseExpiresAtMs > request\.time\.toMillis\(\)/);
assert.match(rules, /collectionId != 'emoticonBatches'/);
assert.ok(indexes.indexes.some((index) => (
  index.collectionGroup === 'emoticonBatches'
  && index.queryScope === 'COLLECTION'
  && index.fields.some((field) => field.fieldPath === 'projectId' && field.order === 'ASCENDING')
  && index.fields.some((field) => field.fieldPath === 'createdAt' && field.order === 'DESCENDING')
)));

console.log('Emoticon batch lifecycle contract verified.');
