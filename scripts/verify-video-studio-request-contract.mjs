import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  VideoStudioJobRequestSchema,
  VIDEO_STUDIO_MAX_MERGE_CLIPS as nextMaxMergeClips,
  VIDEO_STUDIO_MAX_REPEAT_COUNT as nextMaxRepeatCount,
} from '../src/lib/video-studio-job-request.ts';
import { applyVideoStudioRepeatCost as applyNextRepeatCost } from '../src/lib/video-studio-repeat-cost.ts';
import {
  videoStudioJobRequestSchema,
  VIDEO_STUDIO_MAX_MERGE_CLIPS as functionsMaxMergeClips,
  VIDEO_STUDIO_MAX_REPEAT_COUNT as functionsMaxRepeatCount,
} from '../functions/src/videoStudio/request.ts';
import { applyVideoStudioRepeatCost as applyFunctionsRepeatCost } from '../functions/src/videoStudio/repeatCost.ts';

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/video-studio-job-request-contract.json', import.meta.url), 'utf8'),
);

function buildRequest(testCase) {
  const request = structuredClone(testCase.request);
  if (testCase.filledField) {
    request[testCase.filledField.name] = testCase.filledField.character.repeat(
      testCase.filledField.length,
    );
  }
  if (Number.isInteger(testCase.storageUrlLength)) {
    const prefix = 'https://firebasestorage.googleapis.com/';
    request.backgroundMusicUrl = prefix + 'a'.repeat(testCase.storageUrlLength - prefix.length);
  }
  if (Number.isInteger(testCase.imageDataUrlLength)) {
    const prefix = 'data:image/png;base64,';
    request.referenceImage = prefix + 'a'.repeat(testCase.imageDataUrlLength - prefix.length);
  }
  if (Number.isInteger(testCase.mergeClipCount)) {
    request.mergeClipIds = Array.from(
      { length: testCase.mergeClipCount },
      (_, index) => `clip-${index + 1}`,
    );
  }
  if (Number.isInteger(testCase.mergeEditCount)) {
    request.mergeClipEdits = Array.from(
      { length: testCase.mergeEditCount },
      (_, index) => ({
        clipId: request.mergeClipIds[index],
        transitionStyle: index === 0 ? 'fade' : 'cut',
      }),
    );
  }
  return request;
}

function issuePaths(result) {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

assert.equal(nextMaxRepeatCount, 12);
assert.equal(functionsMaxRepeatCount, nextMaxRepeatCount);
assert.equal(nextMaxMergeClips, 48);
assert.equal(functionsMaxMergeClips, nextMaxMergeClips);

for (const testCase of fixture.requestCases) {
  const request = buildRequest(testCase);
  const nextResult = VideoStudioJobRequestSchema.safeParse(request);
  const functionsResult = videoStudioJobRequestSchema.safeParse(request);

  assert.equal(nextResult.success, testCase.expected, `Next schema: ${testCase.name}`);
  assert.equal(functionsResult.success, testCase.expected, `Functions schema: ${testCase.name}`);
  assert.equal(
    functionsResult.success,
    nextResult.success,
    `Schema success parity: ${testCase.name}`,
  );

  if (nextResult.success && functionsResult.success) {
    assert.deepEqual(functionsResult.data, nextResult.data, `Normalized payload parity: ${testCase.name}`);
  } else if (testCase.issuePath) {
    assert.ok(
      issuePaths(nextResult).includes(testCase.issuePath),
      `Next schema should report ${testCase.issuePath}: ${testCase.name}`,
    );
    assert.ok(
      issuePaths(functionsResult).includes(testCase.issuePath),
      `Functions schema should report ${testCase.issuePath}: ${testCase.name}`,
    );
  }
}

for (const testCase of fixture.repeatCostCases) {
  const preflight = {
    canSubmit: testCase.initialCanSubmit,
    estimatedCostUsd: testCase.estimatedCostUsd,
    credit: {
      remainingUsd: testCase.remainingUsd,
      requiredUsd: testCase.estimatedCostUsd,
      isSufficient: null,
    },
  };
  const nextResult = applyNextRepeatCost(preflight, testCase.repeatCount);
  const functionsResult = applyFunctionsRepeatCost(preflight, testCase.repeatCount);

  assert.deepEqual(functionsResult, nextResult, `Repeat-cost parity: ${testCase.name}`);
  assert.equal(nextResult.repeatCount, testCase.repeatCount, testCase.name);
  assert.equal(nextResult.estimatedCostUsdPerSegment, testCase.estimatedCostUsd, testCase.name);
  assert.equal(nextResult.estimatedTotalCostUsd, testCase.expectedTotalUsd, testCase.name);
  assert.equal(nextResult.credit.requiredUsd, testCase.expectedTotalUsd, testCase.name);
  assert.equal(nextResult.credit.isSufficient, testCase.expectedSufficient, testCase.name);
  assert.equal(nextResult.canSubmit, testCase.expectedCanSubmit, testCase.name);
}

const [nextPreflightSource, functionsRouteSource] = await Promise.all([
  readFile(new URL('../src/lib/server/video-studio-preflight.ts', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/api/hostingVideoStudioRoutes.ts', import.meta.url), 'utf8'),
]);

for (const [name, source] of [
  ['Next preflight', nextPreflightSource],
  ['Functions preflight', functionsRouteSource],
]) {
  assert.match(source, /applyVideoStudioRepeatCost\(/, `${name} must apply the repeat total before submission.`);
  assert.match(source, /estimatedCostUsdPerSegment/, `${name} must store the per-segment estimate.`);
  assert.match(source, /estimatedTotalCostUsd/, `${name} must store the full repeat estimate.`);
}

console.log(
  `Video Studio request contract verified: ${fixture.requestCases.length} schema fixtures and ${fixture.repeatCostCases.length} repeat-cost fixtures.`,
);
