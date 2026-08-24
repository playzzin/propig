import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assetLibraryStorageKey,
  buildAssetLibraryEntries,
  parseAssetLibraryPreferences,
} from '../src/app/admin/emoticon-studio/studio/assetLibraryModel.ts';

function completedStaticJob(overrides = {}) {
  return {
    id: 'job-original',
    userId: 'user-1',
    projectId: 'project-1',
    sourceImageUrl: 'https://example.com/source.png',
    sourceStoragePath: 'users/user-1/emoticon-studio/sources/source.png',
    instruction: '손을 흔드는 인사 이모티콘',
    status: 'completed',
    outputProfile: { type: 'static', width: 360, height: 360 },
    plan: { action: { frameCount: 1, imagePrompt: 'character waves a hand on a transparent background' } },
    specReport: { frameCount: 1, width: 360, height: 360, technicalPass: true, allOutputsPass: true },
    outputs: { png: { url: 'https://example.com/result.png' } },
    keyPoseStoragePath: 'users/user-1/emoticon-studio/jobs/job-original/key-pose.png',
    keyPoseGeneration: { model: 'mock/image-v1', provider: 'mock' },
    createdAt: { seconds: 100 },
    ...overrides,
  };
}

const original = completedStaticJob();
const edited = completedStaticJob({
  id: 'job-edited',
  parentJobId: 'job-original',
  outputs: { png: { url: 'https://example.com/edited.png' } },
  keyPoseStoragePath: 'users/user-1/emoticon-studio/jobs/job-edited/key-pose.png',
  createdAt: { toMillis: () => 120_000 },
});
const animated = completedStaticJob({
  id: 'job-animated',
  outputProfile: { type: 'animated', width: 320, height: 320 },
  plan: { action: { frameCount: 8, imagePrompt: 'animated wave' } },
  specReport: { frameCount: 8, width: 320, height: 320, technicalPass: true, allOutputsPass: true },
  outputs: { png: undefined },
  animationFrames: [{ url: 'https://example.com/frame-1.png', generationModel: 'frame/model', generationProvider: 'frame-provider' }],
  createdAt: { seconds: 110 },
});
const otherProject = completedStaticJob({ id: 'job-other', projectId: 'project-2' });

const entries = buildAssetLibraryEntries([original, edited, animated, otherProject], 'project-1');
assert.equal(entries.length, 4, 'three results and one deduplicated upload source should be available');
assert.equal(entries.filter((entry) => entry.kind === 'source').length, 1, 'the same uploaded source must not be duplicated across edits');
assert.equal(entries.find((entry) => entry.id === 'result:job-original')?.version, 'original');
assert.equal(entries.find((entry) => entry.id === 'result:job-edited')?.version, 'edited');
assert.equal(entries.find((entry) => entry.id === 'result:job-edited')?.prompt, 'character waves a hand on a transparent background');
assert.deepEqual(
  {
    model: entries.find((entry) => entry.id === 'result:job-original')?.model,
    provider: entries.find((entry) => entry.id === 'result:job-original')?.provider,
  },
  { model: 'mock/image-v1', provider: 'mock' },
  'generation model metadata must remain visible',
);
assert.ok(entries.find((entry) => entry.id === 'result:job-original')?.reusableFrame, 'verified static output should be reusable');
assert.equal(entries.find((entry) => entry.id === 'result:job-animated')?.reusableFrame, null, 'animated output must not enter the verified static copy path');
assert.equal(entries.some((entry) => entry.sourceJobId === 'job-other'), false, 'assets must be project scoped');

assert.deepEqual(parseAssetLibraryPreferences({
  schemaVersion: 1,
  favoriteIds: ['result:job-original', 'result:job-original', 42],
  deletedIds: ['result:job-edited', null],
}), {
  schemaVersion: 1,
  favoriteIds: ['result:job-original'],
  deletedIds: ['result:job-edited'],
}, 'persisted favorites and soft-deleted ids should be sanitized and deduplicated');
assert.deepEqual(parseAssetLibraryPreferences({ schemaVersion: 99, favoriteIds: ['unsafe'] }), {
  schemaVersion: 1,
  favoriteIds: [],
  deletedIds: [],
}, 'unknown local preference versions must fail closed');
assert.match(assetLibraryStorageKey('user/name', 'project name'), /user%2Fname:project%20name$/, 'storage scope must safely encode user and project ids');

const [librarySource, editorSource, manualFramesSource] = await Promise.all([
  readFile(new URL('../src/app/admin/emoticon-studio/studio/AssetLibrary.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/admin/emoticon-studio/studio/ProfessionalEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/admin/emoticon-studio/ManualFrameImportPanel.tsx', import.meta.url), 'utf8'),
]);
assert.match(librarySource, /localStorage\.setItem/, 'favorites and trash state must survive reloads');
assert.match(librarySource, /deletedIds/, 'soft deletion must remain recoverable metadata');
assert.doesNotMatch(librarySource, /deleteEmoticon|deleteObject|httpsCallable/, 'the gallery must not perform destructive server deletion');
assert.match(editorSource, /onAddToTimeline={queueLibraryFrames}/, 'the gallery must connect selected assets to the editor');
assert.match(manualFramesSource, /appendReusableFrames\(requestedFrames\)/, 'bulk asset requests must append to the manual frame timeline');
assert.match(manualFramesSource, /appliedReusableRequestIdsRef/, 'a bulk request must be applied at most once');

console.log('Emoticon asset library verification passed.');
