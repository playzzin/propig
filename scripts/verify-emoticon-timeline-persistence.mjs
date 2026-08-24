import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEmoticonAnimationTimelineFromJob,
  getEmoticonAnimationTimelineContentSignature,
  getEmoticonJobTimelineId,
} from '../src/lib/emoticonAnimationTimeline.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const editRecipe = {
  schemaVersion: 1,
  revision: 3,
  crop: { left: 0.1, right: 0, top: 0, bottom: 0.05 },
  scale: 1.1,
  offsetX: 0.02,
  offsetY: -0.03,
  flipHorizontal: false,
  rotationDeg: 2,
  transparentPadding: 0.1,
  brightness: 0.1,
  contrast: -0.1,
  saturation: 0.2,
};
const frame = (kind, index) => ({
  url: `https://example.com/${kind}-${index}.png`,
  storagePath: `users/user/emoticonJobs/job-animated/${kind}-${index}.png`,
  fileName: `${kind}-${index}.png`,
  contentType: 'image/png',
  sizeBytes: 1_024 + index,
});
const completedJob = {
  id: 'job-animated',
  status: 'completed',
  projectId: 'project-1',
  projectItemId: 'item-1',
  outputProfile: { type: 'animated', loopCount: 0 },
  animationFrames: [frame('animation', 0), frame('animation', 1)],
  compositedFrames: [frame('composited', 0), frame('composited', 1)],
  manualImportReport: { frameDurationsMs: [120, 180] },
  editRecipe,
  renderOverrides: {
    bubble: {
      text: '',
      style: 'shout',
      timeline: {
        mode: 'cues',
        startFrame: 0,
        endFrame: 1,
        cues: [{ id: 'cue-1', text: '출발!', startFrame: 0, endFrame: 1 }],
      },
    },
  },
  specReport: {
    durationMs: 300,
    loop: true,
    technicalPass: true,
    allOutputsPass: true,
  },
};

const timeline = buildEmoticonAnimationTimelineFromJob({
  projectId: 'project-1',
  itemId: 'item-1',
  job: completedJob,
  loopMode: 'ping_pong',
});
assert.ok(timeline, 'A verified completed animation must create a timeline.');
assert.equal(timeline.id, getEmoticonJobTimelineId(completedJob.id));
assert.match(timeline.id, /^[A-Za-z0-9_-]{1,160}$/);
assert.deepEqual(timeline.frames.map((item) => item.durationMs), [120, 180]);
assert.deepEqual(timeline.frames.map((item) => item.sourceFrameIndex), [0, 1]);
assert.ok(timeline.frames.every((item) => item.sourceJobId === completedJob.id));
assert.ok(timeline.frames.every((item) => item.assetId.startsWith('frame_asset_')));
assert.deepEqual(timeline.frames.map((item) => item.editRecipe), [editRecipe, editRecipe]);
assert.deepEqual(timeline.textTrack.cues, completedJob.renderOverrides.bubble.timeline.cues);
assert.deepEqual(timeline.playback, { loopMode: 'ping_pong', loopCount: 0 });

const repeated = buildEmoticonAnimationTimelineFromJob({
  projectId: 'project-1',
  itemId: 'item-1',
  job: completedJob,
  loopMode: 'ping_pong',
});
assert.ok(repeated);
assert.equal(
  getEmoticonAnimationTimelineContentSignature(repeated),
  getEmoticonAnimationTimelineContentSignature(timeline),
  'The same completed job must produce an idempotent timeline snapshot.',
);

const distributed = buildEmoticonAnimationTimelineFromJob({
  projectId: 'project-1',
  itemId: 'item-1',
  job: {
    ...completedJob,
    id: 'job-distributed',
    animationFrames: Array.from({ length: 4 }, (_, index) => frame('source', index)),
    compositedFrames: undefined,
    manualImportReport: undefined,
    editRecipe: undefined,
    renderOverrides: {
      bubble: {
        text: '안녕',
        style: 'rounded',
        timeline: { mode: 'intro', startFrame: 0, endFrame: null, cues: [] },
      },
    },
    specReport: { ...completedJob.specReport, durationMs: 1_001 },
  },
});
assert.ok(distributed);
assert.equal(distributed.frames.reduce((sum, item) => sum + item.durationMs, 0), 1_001);
assert.ok(distributed.frames.every((item) => item.durationMs >= 40 && item.durationMs <= 2_000));
assert.deepEqual(
  distributed.textTrack.cues.map(({ text, startFrame, endFrame }) => ({ text, startFrame, endFrame })),
  [{ text: '안녕', startFrame: 0, endFrame: 1 }],
);
assert.notEqual(distributed.frames[0].assetId, timeline.frames[0].assetId);

assert.equal(buildEmoticonAnimationTimelineFromJob({
  projectId: 'project-1',
  itemId: 'item-1',
  job: { ...completedJob, status: 'working' },
}), null);
assert.equal(buildEmoticonAnimationTimelineFromJob({
  projectId: 'project-1',
  itemId: 'item-1',
  job: { ...completedJob, outputProfile: { type: 'static', loopCount: 1 } },
}), null);

const service = read('src/services/emoticonStudioV2Service.ts');
const hook = read('src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts');
assert.match(service, /transaction\.get\(jobRef\)[\s\S]*?emoticonJobSchema\.safeParse/);
assert.match(service, /getEmoticonAnimationTimelineContentSignature\(existing\)[\s\S]*?sameContent/);
assert.match(service, /revision: existing \? existing\.revision \+ \(sameContent \? 0 : 1\) : 0/);
assert.match(service, /if \(!sameContent\) \{[\s\S]*?transaction\.set\(timelineRef/);
assert.match(service, /latestCreationTurnId === turn\.id[\s\S]*?transaction\.update\(projectRef/);
assert.match(service, /latestTimelineId: timeline\.id[\s\S]*?revision: projectRevision \+ 1/);
assert.match(service, /export async function getEmoticonAnimationTimeline/);
assert.match(service, /export function subscribeEmoticonAnimationTimeline/);
assert.match(hook, /subscribeEmoticonAnimationTimeline\([\s\S]*?setTimelineState/);
assert.match(hook, /buildEmoticonAnimationTimelineFromJob\([\s\S]*?saveEmoticonAnimationTimeline/);
assert.match(hook, /timelineSyncKeysRef[\s\S]*?shouldAttemptProjectLink \? 'link' : 'store'/);
assert.match(hook, /const updateReferenceRole = useCallback/,
  'Reference-role editing added in parallel must remain intact.');

console.log('Emoticon animation timeline persistence contracts verified.');
