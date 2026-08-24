import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const upload = read('functions', 'src', 'emoticonStudio', 'uploadSource.ts');
const cleanup = read('functions', 'src', 'triggers', 'cleanupEmoticonSourceAssets.ts');
const index = read('functions', 'src', 'index.ts');
const clientService = read('src', 'services', 'emoticonStudioService.ts');
const studioHook = read('src', 'app', 'admin', 'emoticon-studio', 'studio', 'useEmoticonStudio.ts');
const characterSetup = read('src', 'app', 'admin', 'emoticon-studio', 'studio', 'CharacterSetupStep.tsx');
const rules = read('firestore.rules');
const indexes = JSON.parse(read('firestore.indexes.json'));

for (const snippet of [
  "createHash('sha256').update(normalized).digest('hex')",
  "const assetId = sha256",
  "const SOURCE_ASSET_COLLECTION = 'emoticonStudioSourceAssets'",
  'preconditionOpts: { ifGenerationMatch: 0 }',
  "state: 'pending'",
  "state: 'upload_failed'",
  'SOURCE_ASSET_PENDING_TTL_MS',
]) {
  assert.ok(upload.includes(snippet), `Missing idempotent source upload contract: ${snippet}`);
}

for (const snippet of [
  "schedule: 'every 30 minutes'",
  '.collectionGroup(SOURCE_ASSET_COLLECTION)',
  ".where('expiresAt', '<='",
  'referencedPathsForOwner(userId, candidates)',
  "state: 'attached'",
  "state: 'delete_pending'",
  "asset.previousState !== 'delete_pending'",
  'const finalPass = await referencedPathsForOwner(',
  "state: 'deleted'",
  '.file(asset.storagePath).delete({ ignoreNotFound: true })',
  'purgeAt:',
]) {
  assert.ok(cleanup.includes(snippet), `Missing source cleanup contract: ${snippet}`);
}

assert.match(index, /\bcleanupEmoticonSourceAssets,\s*\n/);
assert.match(index, /\buploadEmoticonSource,\s*\n/);
assert.match(clientService, /emoticonSourceResponseSchema\.safeParse\(response\.data\)/, 'Callable source responses must be validated before use.');
assert.match(clientService, /getEmoticonSourceUploadErrorMessage/, 'Source upload failures need an actionable error mapper.');
assert.match(clientService, /'functions\/not-found'/, 'A missing deployed upload function must be diagnosed clearly.');
assert.match(clientService, /uploadEmoticonSource 함수의 배포 상태를 확인/, 'Connection errors must point maintainers to the upload function deployment.');
assert.match(studioHook, /const addReferences = useCallback/);
assert.match(studioHook, /candidate\.sourceStoragePath === reference\.sourceStoragePath/);
assert.match(studioHook, /const removeReference = useCallback/);
assert.match(studioHook, /const updateReferenceRole = useCallback/);
assert.match(characterSetup, /onAddReferences/);
assert.match(characterSetup, /onRemoveReference/);
assert.match(characterSetup, /onReferenceRoleChange/);
assert.match(
  rules,
  /match \/emoticonStudioSourceAssets\/\{sourceAssetId\}[\s\S]*?allow read, write: if false/,
);
assert.ok(
  indexes.fieldOverrides.some((entry) => (
    entry.collectionGroup === 'emoticonStudioSourceAssets'
    && entry.fieldPath === 'purgeAt'
    && entry.ttl === true
  )),
  'The deleted source registry must have a Firestore TTL policy.',
);

console.log('Emoticon source lifecycle checks passed.');
