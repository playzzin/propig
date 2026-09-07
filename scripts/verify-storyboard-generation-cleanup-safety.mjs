import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [
  historyService,
  storyboardImageHook,
  nextDeleteRoute,
  functionsDeleteRoute,
  rules,
  storyboardSchema,
] = await Promise.all([
  read('src/services/imageGenerationService.ts'),
  read('src/hooks/useStoryboardImageGeneration.ts'),
  read('src/app/api/storyboards/[storyboardId]/route.ts'),
  read('functions/src/api/hostingStoryboardRoutes.ts'),
  read('firestore.rules'),
  read('src/schemas/imageStoryboard.ts'),
]);

assert.match(historyService, /storagePath:\s*fileName/);
assert.match(historyService, /artifactProvenance:\s*params\.artifactProvenance \?\? null/);
assert.match(storyboardImageHook, /window\.location\.pathname !== '\/admin\/storyboard'/);
assert.match(storyboardImageHook, /artifactProvenance:\s*readStoryboardGenerationProvenance\(\)/);

for (const source of [nextDeleteRoute, functionsDeleteRoute]) {
  assert.match(source, /provenance\.kind !== ["']storyboard-scene["']/);
  assert.match(source, /provenance\.storyboardId !== params\.storyboardId/);
  assert.match(source, /status:\s*["']reference_audit_required["']/);
  assert.match(source, /automaticDeletionAllowed:\s*false/);
  assert.match(source, /storagePath\.startsWith\(`ai_generations\/\$\{params\.userId\}\/[`)]/);
  assert.doesNotMatch(source, /deleteFiles\(\{\s*prefix:\s*`ai_generations\//);
  assert.doesNotMatch(source, /collection\([^)]*AI_GENERATIONS[^)]*\)\.doc\([^)]*\)\.delete\(/);
  assert.match(source, /function isSafeFirestoreDocumentId\(value: string\): boolean/);
  assert.match(source, /value\.length <= 240/);
  assert.match(source, /!value\.includes\(["']\/["']\)/);
  assert.match(source, /createHash\(["']sha256["']\)/);
  assert.match(source, /\.doc\(cleanupCandidateId\(params\.storyboardId, generationId\)\)/);
  assert.doesNotMatch(source, /\.doc\(`\$\{params\.storyboardId\}__\$\{generationId\}`\)/);
}

const safeFirestoreIdFixture = [
  { value: 'generated-123', expected: true },
  { value: 'nested/document', expected: false },
  { value: '..', expected: false },
  { value: '.', expected: false },
  { value: 'x'.repeat(241), expected: false },
];
const fixtureGuard = (value) => value.length > 0
  && value.length <= 240
  && !value.includes('/')
  && value !== '.'
  && value !== '..';
safeFirestoreIdFixture.forEach(({ value, expected }) => {
  assert.equal(fixtureGuard(value), expected, `Unexpected Firestore id result for ${value.slice(0, 24)}`);
});

assert.match(
  rules,
  /match \/storyboardArtifactCleanupCandidates\/\{candidateId\}[\s\S]*allow read: if isOwner\(userId\) \|\| isAdmin\(\);[\s\S]*allow create, update, delete: if false;/,
);
assert.match(rules, /collectionId != 'storyboardArtifactCleanupCandidates'/);

assert.match(
  storyboardSchema,
  /generatedImage:\s*z\.object\([\s\S]*storagePath:[\s\S]*\.nullable\(\)\.optional\(\),[\s\S]*provenance:\s*StoryboardGeneratedImageProvenanceSchema\.optional\(\)/,
);
assert.match(
  storyboardSchema,
  /StoryboardGeneratedImageProvenanceSchema = z\.object\([\s\S]*kind: z\.literal\('storyboard-scene'\)[\s\S]*storyboardId:[\s\S]*sceneId:[\s\S]*\.nullable\(\)\.default\(null\)/,
);

console.log('Storyboard generation cleanup safety verification passed.');
