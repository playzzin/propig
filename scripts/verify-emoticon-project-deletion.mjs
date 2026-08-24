import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(
  rootDirectory,
  'functions',
  'src',
  'emoticonStudio',
  'deleteProject.ts',
);
const indexPath = path.join(rootDirectory, 'functions', 'src', 'index.ts');
const clientPath = path.join(rootDirectory, 'src', 'services', 'emoticonProjectDeletionService.ts');
const resumeTriggerPath = path.join(
  rootDirectory,
  'functions',
  'src',
  'triggers',
  'resumeEmoticonProjectDeletions.ts',
);
const deletionUiPath = path.join(rootDirectory, 'src', 'app', 'admin', 'emoticon-studio', 'studio', 'AdvancedProjectTools.tsx');
const rulesPath = path.join(rootDirectory, 'firestore.rules');
const source = fs.readFileSync(sourcePath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');
const clientSource = fs.readFileSync(clientPath, 'utf8');
const resumeTriggerSource = fs.readFileSync(resumeTriggerPath, 'utf8');
const deletionUiSource = fs.readFileSync(deletionUiPath, 'utf8');
const rulesSource = fs.readFileSync(rulesPath, 'utf8');
const require = createRequire(import.meta.url);
const contract = require('../functions/lib/emoticonStudio/deleteProject.js');

assert.deepEqual(contract.EMOTICON_PROJECT_DELETION_MODES, [
  'project_only',
  'project_and_assets',
]);
assert.equal(contract.isSafeEmoticonDeletionId('project_123-ABC'), true);
assert.equal(contract.isSafeEmoticonDeletionId('../project'), false);
assert.equal(contract.isSafeEmoticonDeletionId('project/child'), false);
assert.equal(contract.isSafeEmoticonDeletionId(''), false);
assert.equal(contract.isSafeEmoticonDeletionId('x'.repeat(161)), false);

assert.equal(contract.isWorkingEmoticonJobStatus('queued'), true);
assert.equal(contract.isWorkingEmoticonJobStatus('rendering'), true);
assert.equal(contract.isWorkingEmoticonJobStatus('completed'), false);
assert.equal(contract.isWorkingEmoticonItemStatus('generating'), true);
assert.equal(contract.isWorkingEmoticonItemStatus('failed'), false);

assert.equal(
  contract.emoticonJobStoragePrefix('owner_1', 'job-1'),
  'users/owner_1/emoticon-studio/jobs/job-1/',
);
assert.throws(() => contract.emoticonJobStoragePrefix('owner/escape', 'job-1'));
assert.throws(() => contract.emoticonJobStoragePrefix('owner_1', '../job'));
assert.equal(
  contract.isOwnedEmoticonSourcePath(
    'owner_1',
    'users/owner_1/emoticon-studio/sources/123e4567-e89b-12d3-a456-426614174000.png',
  ),
  true,
);
assert.equal(
  contract.isOwnedEmoticonSourcePath(
    'owner_1',
    'users/owner_2/emoticon-studio/sources/source.png',
  ),
  false,
);
assert.equal(
  contract.isOwnedEmoticonSourcePath(
    'owner_1',
    'users/owner_1/emoticon-studio/sources/folder/source.png',
  ),
  false,
);
assert.equal(
  contract.emoticonSourceAssetId(
    'owner_1',
    'users/owner_1/emoticon-studio/sources/123e4567-e89b-12d3-a456-426614174000.png',
  ),
  '123e4567-e89b-12d3-a456-426614174000.png',
);
assert.throws(() => contract.emoticonSourceAssetId(
  'owner_1',
  'users/owner_2/emoticon-studio/sources/source.png',
));

const cancelledBatchItems = contract.cancelActiveEmoticonBatchItemsForDeletion([
  {
    itemId: 'pending-item',
    status: 'pending',
    progress: 0,
    attemptCount: 0,
    jobIds: [],
    currentJobId: null,
    enqueueError: null,
    jobError: null,
    deferredUntilMs: null,
  },
  {
    itemId: 'completed-item',
    status: 'completed',
    progress: 100,
    attemptCount: 1,
    jobIds: ['job-1'],
    currentJobId: 'job-1',
    enqueueError: null,
    jobError: null,
    deferredUntilMs: null,
  },
]);
assert.equal(cancelledBatchItems[0].status, 'cancelled');
assert.equal(cancelledBatchItems[0].progress, 100);
assert.equal(cancelledBatchItems[1].status, 'completed');

const requiredContracts = [
  "const OPERATION_COLLECTION = 'emoticonStudioProjectDeletions'",
  "const SOURCE_LOCK_COLLECTION = 'emoticonStudioSourceAssetLocks'",
  '.collection(SOURCE_LOCK_COLLECTION)',
  "process.env.EMOTICON_STUDIO_SOURCE_DELETE_LOCK_CONTRACT?.trim()",
  "reason: 'source_lock_rules_contract_not_enabled'",
  "deletionLocked: true",
  'deletionOperationId: operationId',
  "where('projectId', '==', params.projectId)",
  "where('generationStatus', 'in', [...ACTIVE_ITEM_STATUSES])",
  "'queued',",
  "'rendering',",
  "mode === 'project_only'",
  'retainOrDeleteProjectBatches',
  'batchesRefFor(params.userId)',
  'deletedBatches',
  'retainedBatches',
  'findReferencedSourcePaths',
  "projectDocument.ref.collection('items')",
  'isOwnedEmoticonSourcePath(params.userId, storagePath)',
  "file.delete({ ignoreNotFound: true })",
  "status: 'retryable_failed'",
  "status: 'completed'",
  "phase: 'completed'",
  'ITEM_DELETE_BATCH_SIZE',
  'JOB_DELETE_BATCH_SIZE',
  'BATCH_DELETE_BATCH_SIZE',
  'STORAGE_PAGE_SIZE',
  'countRetainedAssetsPaged',
  'deleteProjectJobsAndOwnedAssetsPaged',
  'assertNoActiveChildJobs',
  "where('parentJobId', 'in', params.parentJobIds.slice(0, 30))",
  'plannedDeletedAssetCount',
  "collection('sources')",
  'retainedAssetsCursor',
  'nextAttemptAt',
  'continueEmoticonProjectDeletion',
];
requiredContracts.forEach((snippet) => {
  assert.ok(source.includes(snippet), `Missing deletion safety contract: ${snippet}`);
});
assert.match(
  source,
  /phase:\s*params\.sourceDeletionEnabled\s*\?\s*'source_assets_checked'\s*:\s*'source_assets_retained_contract_gate'/,
  'The live paged deletion path must expose the source-retention contract-gate phase.',
);

const sourceLockPosition = source.indexOf('const lockState = await acquireSourceDeletionLock');
const referenceScanPosition = source.indexOf('const referenced = await findReferencedSourcePaths');
assert.ok(sourceLockPosition >= 0 && referenceScanPosition > sourceLockPosition,
  'Source assets must be locked before the cross-project/job reference scan.');
assert.equal(source.includes('.deleteFiles('), false,
  'Broad bucket prefix deletion is forbidden; every listed path must be checked.');
assert.match(indexSource, /import \{ deleteEmoticonProjectSafely \} from '\.\/emoticonStudio\/deleteProject';/);
assert.match(indexSource, /\bdeleteEmoticonProjectSafely,\s*\n/);
assert.match(indexSource, /\bresumeEmoticonProjectDeletions,\s*\n/);
assert.match(resumeTriggerSource, /schedule: 'every 5 minutes'/);
assert.match(resumeTriggerSource, /where\('nextAttemptAt', '<='/);
assert.match(resumeTriggerSource, /continueEmoticonProjectDeletion\(candidate\)/);
assert.match(clientSource, /httpsCallable<[\s\S]*?'deleteEmoticonProjectSafely'/);
assert.doesNotMatch(clientSource, /deleteDoc\(|transaction\.delete\(/);
assert.match(deletionUiSource, /value="project_only"/);
assert.match(deletionUiSource, /value="project_and_assets"/);
assert.match(deletionUiSource, /project-deletion-confirmation/);
assert.match(deletionUiSource, /deleteConfirmation !== project\.title/);
assert.match(rulesSource, /match \/emoticonStudioProjectDeletions\/\{operationId\}[\s\S]*?allow read, write: if false/);
assert.match(rulesSource, /match \/emoticonStudioSourceAssetLocks\/\{sourceAssetId\}[\s\S]*?allow read, write: if false/);
assert.match(rulesSource, /match \/emoticonProjects\/\{projectId\}[\s\S]*?allow delete: if false/);
assert.match(rulesSource, /writableEmoticonProject\(userId, projectId\)/);
assert.match(rulesSource, /validEmoticonParentJobLink\(userId, jobId\)/);
assert.match(
  rulesSource,
  /function validEmoticonProjectStructureRevision\(userId, projectId\)[\s\S]*getAfter\(projectPath\)\.data\.revision == get\(projectPath\)\.data\.get\('revision', 0\) \+ 1/,
);

console.log('Emoticon project safe-deletion contract checks passed.');
