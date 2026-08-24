import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

const requiredIndexes = [
  {
    collectionGroup: 'ai_generations',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
];

function normalizeField(field) {
  return {
    fieldPath: field.fieldPath,
    order: field.order,
    arrayConfig: field.arrayConfig,
  };
}

function hasRequiredIndex(indexes, required) {
  return indexes.some((index) => {
    assert.equal(typeof index.collectionGroup, 'string', 'Firestore index collectionGroup must be a string.');
    assert.equal(typeof index.queryScope, 'string', `Firestore index ${index.collectionGroup} queryScope must be a string.`);
    assert.equal(Array.isArray(index.fields), true, `Firestore index ${index.collectionGroup} fields must be an array.`);

    return (
      index.collectionGroup === required.collectionGroup &&
      index.queryScope === required.queryScope &&
      JSON.stringify(index.fields.map(normalizeField)) === JSON.stringify(required.fields.map(normalizeField))
    );
  });
}

const indexConfig = JSON.parse(await readFile(path.join(root, 'firestore.indexes.json'), 'utf8'));
const indexes = indexConfig.indexes ?? [];
const firebaseConfig = JSON.parse(await readFile(path.join(root, 'firebase.json'), 'utf8'));
const clientFirebaseConfig = await readFile(path.join(root, 'src/firebase/config.ts'), 'utf8');
const functionsFirestoreConfig = await readFile(path.join(root, 'functions/src/firestore.ts'), 'utf8');
const videoStudioService = await readFile(path.join(root, 'src/services/videoStudioService.ts'), 'utf8');

assert.equal(
  firebaseConfig.firestore?.database,
  'pppp',
  'Firestore rules and indexes must target the named database used by the app and Functions.',
);

assert.match(
  clientFirebaseConfig,
  /EXPECTED_FIRESTORE_DATABASE_ID = 'pppp'/,
  'The browser client must use the same named Firestore database as Firebase deployment config.',
);
assert.doesNotMatch(
  clientFirebaseConfig,
  /NEXT_PUBLIC_FIREBASE_DATABASE_ID\s*\|\|\s*['"]\(default\)['"]/,
  'The browser client must never silently fall back to the default Firestore database.',
);
assert.match(
  functionsFirestoreConfig,
  /EXPECTED_FIRESTORE_DATABASE_ID = 'pppp'[\s\S]*configuredDatabaseId !== EXPECTED_FIRESTORE_DATABASE_ID/,
  'Cloud Functions must default to the same named Firestore database.',
);

for (const required of requiredIndexes) {
  assert.equal(
    hasRequiredIndex(indexes, required),
    true,
    `Missing Firestore composite index for ${required.collectionGroup}: ${required.fields
      .map((field) => `${field.fieldPath} ${field.order}`)
      .join(', ')}`,
  );
}

const rules = await readFile(path.join(root, 'firestore.rules'), 'utf8');

assert.match(
  rules,
  /match \/ai_generations\/\{imageId\}\s*\{\s*allow read, update, delete: if isAdmin\(\) \|\| ownsExistingUserId\(\);\s*allow create: if isAdmin\(\) \|\| ownsIncomingUserId\(\);/s,
  'ai_generations reads must stay limited to owner/admin access.',
);

assert.doesNotMatch(
  rules,
  /match \/ai_generations\/\{imageId\}\s*\{\s*allow read: if signedIn\(\);/s,
  'ai_generations must not allow every signed-in user to read every generation document.',
);

assert.match(
  rules,
  /match \/video_studio_jobs\/\{jobId\}\s*\{\s*allow read: if isAdmin\(\) \|\| ownsExistingUserId\(\);[\s\S]*allow create, update, delete: if isAdmin\(\);/,
  'Paid video jobs must be readable by their owner but writable only through privileged server routes.',
);
assert.doesNotMatch(
  videoStudioService,
  /async (createJob|updateJob)\(/,
  'The browser service must not expose direct Firestore writes for paid video jobs.',
);

for (const collectionName of ['managedArtifacts', 'managedArtifactContents', 'managedArtifactPaths']) {
  assert.match(
    rules,
    new RegExp(`match \\/${collectionName}\\/\\{[^}]+\\}`),
    `Missing explicit Firestore rules for ${collectionName}.`,
  );
  assert.equal(
    rules.includes(`collection != '${collectionName}'`),
    true,
    `The broad admin write fallback must exclude ${collectionName} so its validation rules remain effective.`,
  );
}

for (const collectionName of [
  'users',
  'openrouter_usage',
  'openrouter_daily_costs',
  'emoticonStudioRateLimits',
  'emoticonStudioOpenRouterRouteCache',
  'emoticonStudioUploadLimits',
  'emoticonStudioContinuations',
  'emoticonStudioDeferredJobs',
  'emoticonStudioCharacterProfiles',
]) {
  assert.equal(
    rules.includes(`collection != '${collectionName}'`),
    true,
    `The broad admin write fallback must exclude ${collectionName}.`,
  );
}

for (const collectionName of [
  'openrouter_daily_costs',
  'emoticonStudioRateLimits',
  'emoticonStudioOpenRouterRouteCache',
  'emoticonStudioUploadLimits',
  'emoticonStudioContinuations',
  'emoticonStudioDeferredJobs',
  'emoticonStudioCharacterProfiles',
]) {
  assert.match(
    rules,
    new RegExp(`match \/${collectionName}\/\\{[^}]+\\}[\\s\\S]*allow write: if false;`),
    `${collectionName} must remain server-owned even for an admin browser client.`,
  );
}

assert.doesNotMatch(
  rules,
  /match \/\{document=\*\*\}\s*\{\s*allow read: if isAdmin\(\);\s*allow write: if isAdmin\(\);/s,
  'An unconditional recursive admin write fallback would bypass managed artifact validation.',
);

assert.match(
  rules,
  /function validEmoticonJobCreate\(userId, jobId\)[\s\S]*request\.resource\.data\.status == 'queued'[\s\S]*request\.resource\.data\.progress == 0/,
  'Emoticon job creation must be limited to a fresh queued request.',
);

assert.match(
  rules,
  /function validEmoticonJobCancellation\(userId\)[\s\S]*affectedKeys\(\)\.hasOnly\(\[[\s\S]*'cancelRequestedAt', 'updatedAt'/,
  'Emoticon job updates must be limited to a cancellation request.',
);

assert.match(
  rules,
  /match \/emoticonJobs\/\{jobId\}[\s\S]*allow create: if isAdmin\(\) && validEmoticonJobCreate\(userId, jobId\);[\s\S]*allow update: if validEmoticonJobCancellation\(userId\);[\s\S]*allow delete: if false;/,
  'Emoticon job server-owned result fields must not be writable by the client.',
);

assert.match(
  rules,
  /function validEmoticonBatchJobLink\(userId\)[\s\S]*emoticonBatches[\s\S]*itemIds\.hasAny\(\[request\.resource\.data\.projectItemId\]\)[\s\S]*!get\(batchPath\)\.data\.keys\(\)\.hasAny\(\['cancelRequestedAt'\]\)/,
  'A batch-linked job must belong to a live server-owned batch and one of its items.',
);

assert.match(
  rules,
  /match \/emoticonBatches\/\{batchId\}[\s\S]*allow read: if isOwner\(userId\) \|\| isAdmin\(\);[\s\S]*allow create, update, delete: if false;/,
  'Emoticon batch aggregation must remain server-owned.',
);

const broadUserSubcollectionRule = rules.match(
  /match \/\{collectionId\}\/\{document=\*\*\}\s*\{([\s\S]*?)\n\s*\}/,
)?.[1];

assert.ok(
  broadUserSubcollectionRule,
  'The broad user subcollection rule must remain explicit and auditable.',
);

for (const collectionName of [
  'emoticonJobs',
  'emoticonBatches',
  'emoticonStudioSourceAssetLocks',
  'emoticonStudioSourceAssets',
  'storyboardArtifactCleanupCandidates',
  'emoticonProjects',
]) {
  assert.match(
    broadUserSubcollectionRule,
    new RegExp(`collectionId\\s*!=\\s*'${collectionName}'`),
    `The broad user subcollection rule must exclude server-owned ${collectionName}.`,
  );
}

assert.match(
  rules,
  /match \/emoticonProjects\/\{projectId\}[\s\S]*match \/items\/\{itemId\}[\s\S]*validEmoticonProjectItemLease\(userId, projectId, itemId\)[\s\S]*validEmoticonProjectItemHistoryLink\(userId, projectId, itemId\)[\s\S]*validEmoticonProjectItemReset\(\)/,
  'Emoticon project item server fields need explicit transition rules.',
);

assert.match(
  rules,
  /function validEmoticonProjectItemLease\(userId, projectId, itemId\)[\s\S]*existsAfter\(jobPath\)[\s\S]*getAfter\(jobPath\)\.data\.projectItemId == itemId/,
  'A queued item lease must be tied to its atomically-created job.',
);

assert.match(
  rules,
  /function validEmoticonProjectItemHistoryLink\(userId, projectId, itemId\)[\s\S]*specReport\.technicalPass == true[\s\S]*motion\.frameCount == get\(jobPath\)\.data\.specReport\.frameCount/,
  'Selecting a completed history result must synchronize its inspected animation timing.',
);

assert.match(
  rules,
  /function validEmoticonProjectItemEditorUpdate\(\)[\s\S]*!\(resource\.data\.generationStatus in \['queued', 'generating'\]\)[\s\S]*hasNone\(\[[\s\S]*'jobId', 'generationStatus', 'validationErrors', 'activeJobCreatedAtMs'/,
  'Ordinary item edits must preserve server-owned generation state.',
);

console.log(`Firestore boundary verification passed (${requiredIndexes.length} composite indexes, managed artifact rules, and emoticon job ownership checked)`);
