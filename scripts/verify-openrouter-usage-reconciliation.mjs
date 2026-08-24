import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const runtime = require(path.join(root, 'functions/lib/openrouterUsage.js'));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const operationId = `operation_${'a'.repeat(64)}`;
const adminUidHash = 'b'.repeat(64);
const userId = 'usage-owner';
const baseUsage = {
  provider: 'openrouter',
  source: 'firebase_function',
  state: 'uncertain',
  reservedCostUsd: 0.35,
  userIdHash: sha256(userId),
  jobId: 'job-1',
};
const baseJob = {
  id: 'job-1',
  userId,
  openRouterInflightCostUsd: 0.2,
  openRouterActualCostUsd: 0.1,
  openRouterUsageRequestCount: 2,
};

const charged = runtime.reconcileOpenRouterUsageState({
  operationId,
  decision: 'charged',
  actualCostUsd: 0.12,
  note: ' Activity 확인 ',
  reconciledByAdminUidHash: adminUidHash,
  usage: baseUsage,
  job: baseJob,
});
assert.equal(charged.outcome, 'updated');
assert.equal(charged.accountedCostUsd, 0.12);
assert.equal(charged.usageUpdate.state, 'settled');
assert.equal(charged.usageUpdate.costSource, 'admin_reconciliation');
assert.equal(charged.usageUpdate.reconciliationNote, 'Activity 확인');
assert.equal(charged.usageUpdate.reconciledByAdminUidHash, adminUidHash);
assert.equal(charged.usageUpdate.reservedCostUsd, 0);
assert.equal(charged.jobUpdate.openRouterInflightCostUsd, 0);
assert.equal(charged.jobUpdate.openRouterActualCostUsd, 0.22);
assert.equal(charged.jobUpdate.openRouterUsageRequestCount, 3);

const notCharged = runtime.reconcileOpenRouterUsageState({
  operationId,
  decision: 'not_charged',
  reconciledByAdminUidHash: adminUidHash,
  usage: { ...baseUsage, reservedCostUsd: 0.1 },
  job: baseJob,
});
assert.equal(notCharged.outcome, 'updated');
assert.equal(notCharged.accountedCostUsd, 0);
assert.equal(notCharged.usageUpdate.state, 'failed');
assert.equal(notCharged.usageUpdate.failureReason, 'admin_confirmed_not_charged');
assert.equal(notCharged.jobUpdate.openRouterInflightCostUsd, 0.1);
assert.equal(notCharged.jobUpdate.openRouterActualCostUsd, 0.1);
assert.equal(notCharged.jobUpdate.openRouterUsageRequestCount, 2);

const detached = runtime.reconcileOpenRouterUsageState({
  operationId,
  decision: 'not_charged',
  reconciledByAdminUidHash: adminUidHash,
  usage: baseUsage,
  job: { ...baseJob, userId: 'different-owner' },
});
assert.equal(detached.reconciliationJobUpdated, false);
assert.equal(detached.jobUpdate, null);
assert.equal(detached.usageUpdate.reconciliationJobUpdated, false);

const idempotent = runtime.reconcileOpenRouterUsageState({
  operationId,
  decision: 'charged',
  actualCostUsd: 99,
  reconciledByAdminUidHash: adminUidHash,
  usage: {
    ...baseUsage,
    state: 'settled',
    reconciliationDecision: 'charged',
    reconciliationJobUpdated: true,
    costUsd: 0.12,
  },
  job: baseJob,
});
assert.equal(idempotent.outcome, 'idempotent');
assert.equal(idempotent.accountedCostUsd, 0.12);
assert.equal(idempotent.reconciliationJobUpdated, true);
assert.equal(idempotent.usageUpdate, null);
assert.equal(idempotent.jobUpdate, null);

const expectReconciliationError = (callback, code) => {
  assert.throws(callback, (error) => (
    error instanceof runtime.OpenRouterUsageReconciliationError && error.code === code
  ));
};

expectReconciliationError(() => runtime.reconcileOpenRouterUsageState({
  operationId,
  decision: 'not_charged',
  reconciledByAdminUidHash: adminUidHash,
  usage: {
    ...baseUsage,
    state: 'settled',
    reconciliationDecision: 'charged',
    costUsd: 0.12,
  },
}), 'conflict');

expectReconciliationError(() => runtime.reconcileOpenRouterUsageState({
  operationId,
  decision: 'not_charged',
  actualCostUsd: 0,
  reconciledByAdminUidHash: adminUidHash,
  usage: baseUsage,
}), 'invalid_input');

expectReconciliationError(() => runtime.reconcileOpenRouterUsageState({
  operationId,
  decision: 'not_charged',
  reconciledByAdminUidHash: adminUidHash,
  usage: { ...baseUsage, source: 'next_server' },
}), 'invalid_data');

const usageRuntimeSource = read('functions/src/openrouterUsage.ts');
const functionsApi = read('functions/src/api/openRouterUsage.ts');
const nextApi = read('src/app/api/openrouter-usage/route.ts');
const usagePage = read('src/app/admin/openrouter-usage/page.tsx');
const reconciliationUi = read('src/app/admin/openrouter-usage/UncertainUsageReconciliation.tsx');
const firestoreRules = read('firestore.rules');
const indexes = JSON.parse(read('firestore.indexes.json'));

for (const api of [functionsApi, nextApi]) {
  assert.match(api, /operation_\[a-f0-9\]/i);
  assert.match(api, /charged/);
  assert.match(api, /not_charged/);
  assert.match(api, /actualCostUsd/);
  assert.match(api, /100/);
  assert.match(api, /state[^\n]+uncertain|uncertain[^\n]+state/);
  assert.match(api, /source[^\n]+firebase_function|firebase_function[^\n]+source/);
  assert.match(api, /collectionGroup\(['"]emoticonJobs['"]\)/);
  assert.match(api, /where\(['"]id['"],\s*['"]==['"],\s*jobId\)/);
  assert.match(api, /limit\(2\)/);
  assert.match(api, /userIdHash/);
  assert.match(api, /reconciledByAdminUidHash/);
  assert.match(api, /reconciliationJobUpdated/);
  assert.match(api, /alreadyReconciled/);
  assert.match(api, /jobUpdated/);
  assert.match(api, /state/);
  assert.match(api, /runTransaction/);
  assert.match(api, /settledAt/);
  assert.match(api, /reservedAt/);
  assert.doesNotMatch(api, /reconciledByAdminUid\s*:/);
}

assert.match(functionsApi, /verifyIdToken/);
assert.match(functionsApi, /isAdmin/);
assert.match(functionsApi, /req\.method/);
assert.match(nextApi, /requireAdminAuth/);
assert.match(nextApi, /export async function POST/);
assert.match(nextApi, /\.strict\(\)/);
assert.match(nextApi, /MAX_UNCERTAIN_RECORDS \+ 1/);
assert.match(nextApi, /Object\.prototype\.hasOwnProperty\.call\(raw, ['"]state['"]\)/);

assert.match(usageRuntimeSource, /reconcileOpenRouterUsageState/);
assert.match(usageRuntimeSource, /openRouterInflightCostUsd:\s*Math\.max\(0/);
assert.match(usageRuntimeSource, /costSource:\s*['"]admin_reconciliation['"]/);
assert.match(usageRuntimeSource, /admin_confirmed_not_charged/);
assert.doesNotMatch(usageRuntimeSource, /reconciledByAdminUid\s*:/);
assert.match(nextApi, /Math\.max\(0/);
assert.match(nextApi, /costSource:\s*['"]admin_reconciliation['"]/);
assert.match(nextApi, /admin_confirmed_not_charged/);

assert.match(usagePage, /useMutation/);
assert.match(usagePage, /invalidateQueries/);
assert.match(usagePage, /<HeaderLink href="\/admin\/openrouter-settings">/);
assert.doesNotMatch(usagePage, /window\.location\.assign/);
assert.match(reconciliationUi, /https:\/\/openrouter\.ai\/activity/);
assert.match(reconciliationUi, /role="dialog"/);
assert.match(reconciliationUi, /aria-modal="true"/);
assert.match(reconciliationUi, /event\.key === ['"]Escape['"]/);
assert.match(reconciliationUi, /querySelectorAll<HTMLElement>/);
assert.match(reconciliationUi, /inputMode="decimal"/);
assert.match(reconciliationUi, /maxLength=\{300\}/);
assert.match(reconciliationUi, /aria-live="polite"/);
assert.match(reconciliationUi, /min-height:\s*44px/);
assert.match(reconciliationUi, /prefers-reduced-motion:\s*reduce/);
assert.match(reconciliationUi, /중복 과금/);

assert.match(
  firestoreRules,
  /collection != ['"]openrouter_usage['"]/,
  'Client-side admin writes must not bypass the server reconciliation audit.',
);
assert.ok(indexes.indexes.some((index) => (
  index.collectionGroup === 'openrouter_usage'
  && index.queryScope === 'COLLECTION'
  && index.fields?.some((field) => field.fieldPath === 'state' && field.order === 'ASCENDING')
  && index.fields?.some((field) => field.fieldPath === 'updatedAt' && field.order === 'DESCENDING')
)), 'Missing the uncertain usage state/updatedAt index.');
assert.ok(indexes.fieldOverrides.some((override) => (
  override.collectionGroup === 'emoticonJobs'
  && override.fieldPath === 'id'
  && override.indexes?.some((index) => (
    index.queryScope === 'COLLECTION_GROUP' && index.order === 'ASCENDING'
  ))
)), 'Missing the collection-group job ID index used by reconciliation.');

console.log('OpenRouter uncertain-usage reconciliation, privacy, idempotency, and UI safety verified.');
