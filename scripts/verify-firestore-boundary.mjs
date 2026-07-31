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

assert.doesNotMatch(
  rules,
  /match \/\{document=\*\*\}\s*\{\s*allow read: if isAdmin\(\);\s*allow write: if isAdmin\(\);/s,
  'An unconditional recursive admin write fallback would bypass managed artifact validation.',
);

console.log(`Firestore boundary verification passed (${requiredIndexes.length} composite indexes and managed artifact rules checked)`);
