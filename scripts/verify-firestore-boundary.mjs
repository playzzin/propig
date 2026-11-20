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
  /match \/ai_generations\/\{imageId\}\s*\{\s*allow read, delete: if isAdmin\(\) \|\| ownsExistingUserId\(\);\s*allow update: if isAdmin\(\) \|\| \(ownsExistingUserId\(\) && ownsIncomingUserId\(\)\);\s*allow create: if isAdmin\(\) \|\| ownsIncomingUserId\(\);/s,
  'ai_generations reads and deletes must stay owner-scoped and updates must preserve ownership.',
);

for (const collectionName of ['video_studio_projects', 'video_studio_clips', 'ai_generations', 'bookmarks', 'categories']) {
  assert.match(
    rules,
    new RegExp(`match \\/${collectionName}\\/\\{[^}]+\\}\\s*\\{[\\s\\S]*?allow update: if isAdmin\\(\\) \\|\\| \\(ownsExistingUserId\\(\\) && ownsIncomingUserId\\(\\)\\);`),
    `${collectionName} updates must not transfer documents into another user's namespace.`,
  );
}
assert.match(
  rules,
  /match \/driveItems\/\{itemId\}[\s\S]*request\.resource\.data\.ownerId == resource\.data\.ownerId/,
  'driveItems updates must preserve ownerId.',
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

for (const collectionName of ['users', 'openrouter_usage']) {
  assert.equal(
    rules.includes(`collection != '${collectionName}'`),
    true,
    `The broad admin write fallback must exclude ${collectionName}.`,
  );
}

assert.doesNotMatch(
  rules,
  /match \/\{document=\*\*\}\s*\{\s*allow read: if isAdmin\(\);\s*allow write: if isAdmin\(\);/s,
  'An unconditional recursive admin write fallback would bypass managed artifact validation.',
);

const broadUserSubcollectionRule = rules.match(
  /match \/\{collectionId\}\/\{document=\*\*\}\s*\{([\s\S]*?)\n\s*\}/,
)?.[1];

assert.ok(
  broadUserSubcollectionRule,
  'The broad user subcollection rule must remain explicit and auditable.',
);
assert.match(
  broadUserSubcollectionRule,
  /collectionId\s*!=\s*'storyboardArtifactCleanupCandidates'/,
  'The broad user subcollection rule must exclude server-owned storyboard cleanup candidates.',
);
assert.match(
  rules,
  /function isRetiredUserProgramCollection\(collectionId\)[\s\S]*!isRetiredUserProgramCollection\(collectionId\)/,
  'Retired user program collections must not fall through to broad owner writes.',
);
assert.match(
  rules,
  /function isRetiredServerProgramCollection\(collection\)[\s\S]*!isRetiredServerProgramCollection\(collection\)/,
  'Retired server program collections must not fall through to broad admin writes.',
);

console.log(`Firestore boundary verification passed (${requiredIndexes.length} composite indexes and managed artifact rules checked)`);
