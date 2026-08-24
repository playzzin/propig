import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const backendSource = read('functions', 'src', 'emoticonStudio', 'deleteJob.ts');
const indexSource = read('functions', 'src', 'index.ts');
const clientSource = read('src', 'services', 'emoticonJobHistoryService.ts');
const panelSource = read('src', 'app', 'admin', 'emoticon-studio', 'EmoticonJobHistoryPanel.tsx');
const pageSource = read('src', 'app', 'admin', 'emoticon-studio', 'studio', 'EmoticonStudioPage.tsx');
const jobTriggerSource = read('functions', 'src', 'triggers', 'onEmoticonJobCreated.ts');
const rulesSource = read('firestore.rules');
const require = createRequire(import.meta.url);
const contract = require('../functions/lib/emoticonStudio/deleteJob.js');

assert.equal(contract.isSafeEmoticonJobDeletionId('job_123-ABC'), true);
assert.equal(contract.isSafeEmoticonJobDeletionId('../job'), false);
assert.equal(contract.isSafeEmoticonJobDeletionId('job/child'), false);
assert.equal(contract.isSafeEmoticonJobDeletionId(''), false);
assert.equal(contract.isSafeEmoticonJobDeletionId('x'.repeat(161)), false);
assert.equal(
  contract.emoticonJobDeletionStoragePrefix('owner_1', 'job-1'),
  'users/owner_1/emoticon-studio/jobs/job-1/',
);
assert.throws(() => contract.emoticonJobDeletionStoragePrefix('owner/escape', 'job-1'));
assert.throws(() => contract.emoticonJobDeletionStoragePrefix('owner_1', '../job'));

const unlinkedItem = contract.unlinkDeletedJobFromProjectItem({
  revision: 3,
  jobId: 'job-1',
  generationStatus: 'completed',
  validationErrors: ['old'],
  editHistory: [
    { sourceJobId: 'source', resultJobId: 'job-1' },
    { sourceJobId: 'source', resultJobId: 'job-2' },
  ],
}, 'job-1');
assert.equal(unlinkedItem.changed, true);
assert.equal(unlinkedItem.currentResultRemoved, true);
assert.equal(unlinkedItem.item.jobId, null);
assert.equal(unlinkedItem.item.generationStatus, 'planned');
assert.equal(unlinkedItem.item.revision, 4);
assert.deepEqual(unlinkedItem.item.validationErrors, []);
assert.equal(unlinkedItem.item.editHistory.length, 1);

const historyOnlyUnlink = contract.unlinkDeletedJobFromProjectItem({
  revision: 1,
  jobId: 'job-3',
  editHistory: [{ sourceJobId: 'job-1', resultJobId: 'job-2' }],
}, 'job-1');
assert.equal(historyOnlyUnlink.changed, true);
assert.equal(historyOnlyUnlink.currentResultRemoved, false);
assert.equal(historyOnlyUnlink.item.jobId, 'job-3');

const unlinkedBatch = contract.unlinkDeletedJobFromBatch({
  executionJobIds: ['job-1', 'job-live'],
  items: [{
    itemId: 'item-1',
    jobIds: ['job-old', 'job-1'],
    currentJobId: 'job-1',
  }],
}, 'job-1');
assert.equal(unlinkedBatch.changed, true);
assert.deepEqual(unlinkedBatch.executionJobIds, ['job-live']);
assert.deepEqual(unlinkedBatch.items[0].jobIds, ['job-old']);
assert.equal(unlinkedBatch.items[0].currentJobId, 'job-old');

[
  "where('parentJobId', '==', params.jobId)",
  "where('profileJobId', '==', params.jobId)",
  '!TERMINAL_JOB_STATUSES.has(job.status)',
  'deletionLocked: true',
  "file.delete({ ignoreNotFound: true })",
  'isOwnedJobAssetPath(prefix, file.name)',
  'unlinkDeletedJobFromProjectItem',
  'unlinkDeletedJobFromBatch',
  'transaction.delete(jobRef)',
].forEach((snippet) => {
  assert.ok(backendSource.includes(snippet), `Missing job deletion safety contract: ${snippet}`);
});
assert.equal(backendSource.includes('.deleteFiles('), false,
  'Broad bucket prefix deletion is forbidden; each asset path must be checked.');
assert.match(indexSource, /import \{ deleteEmoticonJobSafely \} from '\.\/emoticonStudio\/deleteJob';/);
assert.match(indexSource, /\bdeleteEmoticonJobSafely,\s*\n/);
assert.match(clientSource, /orderBy\('createdAt', 'desc'\)/);
assert.match(clientSource, /startAfter\(params\.cursor\)/);
assert.match(clientSource, /limit\(input\.pageSize \+ 1\)/);
assert.match(clientSource, /'deleteEmoticonJobSafely'/);
assert.doesNotMatch(clientSource, /deleteDoc\(|transaction\.delete\(/);
assert.match(panelSource, /전체 작업/);
assert.match(panelSource, /이전 작업 .*더 보기/);
assert.match(panelSource, /영구 삭제/);
assert.match(panelSource, /진행 중인 작업은 완료하거나 취소한 뒤 삭제/);
assert.match(panelSource, /content-visibility:\s*auto/);
assert.match(pageSource, /전체 작업 이력/);
assert.match(pageSource, /dynamic\([\s\S]*?EmoticonJobHistoryPanel/);
assert.match(jobTriggerSource, /profileJob\.deletionLocked === true/);
assert.match(jobTriggerSource, /parent\.deletionLocked === true/);
assert.match(
  rulesSource,
  /match \/emoticonJobs\/\{jobId\}[\s\S]*?allow delete: if false/,
  'Clients must not be able to bypass the callable deletion boundary.',
);

console.log('Emoticon job history pagination and safe-deletion contract checks passed.');
