import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const rateLimits = require(path.join(root, 'functions/lib/emoticonStudio/rateLimits.js'));
const imageGenerationRuntime = require(path.join(root, 'functions/lib/emoticonStudio/imageGeneration.js'));
const usageRuntime = require(path.join(root, 'functions/lib/openrouterUsage.js'));

const limits = rateLimits.getEmoticonStudioCostLimits({});
assert.equal(limits.dailyUsd, 25);
assert.equal(limits.perJobUsd, 8);
assert.equal(limits.perImageUsd, 0.35);

const animatedAuthorization = rateLimits.estimateEmoticonJobAuthorizationUsd({
  mode: 'generate',
  requestedFrameCount: 24,
  outputType: 'animated',
  limits,
});
assert.equal(animatedAuthorization, limits.perJobUsd);

const firstReservation = rateLimits.allocateEmoticonCostReservation({
  nowMs: 1_000,
  dailyLimitUsd: 10,
  requestedUsd: 6,
});
assert.equal(firstReservation.executeAtMs, 1_000);
assert.equal(firstReservation.state.reservedUsd, 6);
const deferredReservation = rateLimits.allocateEmoticonCostReservation({
  nowMs: 2_000,
  dailyLimitUsd: 10,
  requestedUsd: 6,
  state: firstReservation.state,
});
// 1970-01-02 00:00 KST is 1970-01-01 15:00 UTC.
assert.equal(deferredReservation.executeAtMs, 54_000_000);
assert.equal(deferredReservation.state.reservedUsd, 6);
assert.deepEqual(deferredReservation.state.reservationsByDay, { 0: 6, 1: 6 });
const settledFirstDay = rateLimits.settleEmoticonCostReservation({
  reservationsByDay: deferredReservation.state.reservationsByDay,
  dayBucket: 0,
  authorizedUsd: 6,
  accountedUsd: 0.4,
});
assert.deepEqual(settledFirstDay, { 0: 0.4, 1: 6 });
const reclaimedToday = rateLimits.allocateEmoticonCostReservation({
  nowMs: 3_000,
  dailyLimitUsd: 10,
  requestedUsd: 6,
  state: {
    dayBucket: 1,
    reservedUsd: 6,
    reservationsByDay: settledFirstDay,
  },
});
assert.equal(reclaimedToday.executeAtMs, 3_000);
assert.equal(reclaimedToday.state.reservationsByDay[0], 6.4);
assert.equal(reclaimedToday.state.reservationsByDay[1], 6);

assert.equal(imageGenerationRuntime.endpointImageCost({
  pricing: [
    { billable: 'output_image', unit: 'image', cost_usd: 0.04 },
    { billable: 'input_reference', unit: 'image', cost_usd: 0.01 },
    { billable: 'input_image', unit: 'megapixel', cost_usd: 0.005 },
  ],
}, 3), 0.132915);
assert.equal(imageGenerationRuntime.endpointImageCost({
  pricing: [
    { billable: 'output_image', unit: 'image', variant: 'standard', cost_usd: 0.02 },
    { billable: 'output_image', unit: 'image', variant: 'high', cost_usd: 0.05 },
  ],
}, 1), 0.05);
assert.equal(imageGenerationRuntime.endpointImageCost({
  pricing: [{ billable: 'output_image', unit: 'token', cost_usd: 0.00004 }],
}, 1), 0.32768);
assert.equal(imageGenerationRuntime.endpointImageCost({
  pricing: [
    { billable: 'output_image', unit: 'token', cost_usd: 0.00003 },
    { billable: 'input_image', unit: 'token', cost_usd: 0.0000003 },
  ],
}, 3), 0.253133);
assert.equal(imageGenerationRuntime.endpointImageCost({
  pricing: [{ billable: 'input_reference', unit: 'image', cost_usd: 0.01 }],
}, 1), null);

const logicalRequest = { model: 'test/model', messages: [{ role: 'user', content: 'hashed only' }] };
const logicalId = usageRuntime.createOpenRouterLogicalOperationId({
  operation: 'text',
  model: 'test/model',
  request: logicalRequest,
});
assert.equal(logicalId, usageRuntime.createOpenRouterLogicalOperationId({
  operation: 'text',
  model: 'test/model',
  request: logicalRequest,
}));
assert.notEqual(logicalId, usageRuntime.createOpenRouterLogicalOperationId({
  operation: 'text',
  model: 'test/model',
  request: { ...logicalRequest, messages: [{ role: 'user', content: 'changed' }] },
}));
assert.match(logicalId, /^[a-f0-9]{64}$/);

const storagePath = 'users/usage-owner/emoticon-studio/jobs/job-1/frame 01.png';
const storageUrlA = `https://firebasestorage.googleapis.com/v0/b/propig.appspot.com/o/${encodeURIComponent(storagePath)}?alt=media&token=download-token-a`;
const storageUrlB = `https://firebasestorage.googleapis.com/v0/b/propig.appspot.com/o/${encodeURIComponent(storagePath)}?token=download-token-b&alt=media`;
assert.equal(
  usageRuntime.createOpenRouterStableImageIdentifier(storageUrlA),
  `storage:propig.appspot.com/${storagePath}`,
);
assert.equal(
  usageRuntime.createOpenRouterStableImageIdentifier(storageUrlA),
  usageRuntime.createOpenRouterStableImageIdentifier(storageUrlB),
  'Rotating a Firebase download token must not change the stable image identity.',
);
assert.equal(
  usageRuntime.createOpenRouterStableImageIdentifier('data:image/png;base64,aGVsbG8='),
  usageRuntime.createOpenRouterStableImageIdentifier('data:image/webp;base64,aGVsbG8='),
  'Inline image identity must be based on decoded bytes rather than its data URL metadata.',
);
assert.equal(
  usageRuntime.createOpenRouterStableImageIdentifier('https://cdn.example.test/reference.png?fit=cover&token=a'),
  usageRuntime.createOpenRouterStableImageIdentifier('https://cdn.example.test/reference.png?token=b&fit=cover'),
  'Expiring authorization parameters must not change a non-Storage reference identity.',
);
assert.notEqual(
  usageRuntime.createOpenRouterStableImageIdentifier('https://cdn.example.test/reference.png?fit=cover&token=a'),
  usageRuntime.createOpenRouterStableImageIdentifier('https://cdn.example.test/reference.png?fit=contain&token=a'),
  'Content-affecting URL parameters must remain part of a reference identity.',
);

const operationContext = {
  userId: 'usage-owner',
  jobId: 'job-1',
  stage: 'animation-frame',
  frameIndex: 3,
  seed: 1303,
};
const contextualLogicalId = (context, request, model = 'test/image-model') => (
  usageRuntime.runWithOpenRouterUsageContext(context, async () => (
    usageRuntime.createOpenRouterLogicalOperationId({ operation: 'image', model, request })
  ))
);
const stableLogicalIdA = await contextualLogicalId(operationContext, {
  prompt: 'same frame',
  input_references: [{ type: 'image_url', image_url: { url: storageUrlA } }],
});
const stableLogicalIdB = await contextualLogicalId(operationContext, {
  input_references: [{ image_url: { url: storageUrlB }, type: 'image_url' }],
  prompt: 'same frame',
});
assert.equal(
  stableLogicalIdA,
  stableLogicalIdB,
  'Object order and expiring download tokens must not alter the logical OpenRouter operation.',
);
assert.equal(stableLogicalIdA, await contextualLogicalId({
  ...operationContext,
  stage: 'animation-frame:continuation',
}, {
  prompt: 'same frame',
  input_references: [{ type: 'image_url', image_url: { url: storageUrlB } }],
}), 'A continuation invocation must reuse the original semantic-stage operation key.');
assert.notEqual(stableLogicalIdA, await contextualLogicalId({ ...operationContext, jobId: 'job-2' }, {
  prompt: 'same frame',
  input_references: [{ type: 'image_url', image_url: { url: storageUrlB } }],
}));
assert.notEqual(stableLogicalIdA, await contextualLogicalId({ ...operationContext, stage: 'repair-frame' }, {
  prompt: 'same frame',
  input_references: [{ type: 'image_url', image_url: { url: storageUrlB } }],
}));
assert.notEqual(stableLogicalIdA, await contextualLogicalId({ ...operationContext, frameIndex: 4 }, {
  prompt: 'same frame',
  input_references: [{ type: 'image_url', image_url: { url: storageUrlB } }],
}));
assert.notEqual(stableLogicalIdA, await contextualLogicalId({ ...operationContext, seed: 1304 }, {
  prompt: 'same frame',
  input_references: [{ type: 'image_url', image_url: { url: storageUrlB } }],
}));
assert.notEqual(stableLogicalIdA, await contextualLogicalId(operationContext, {
  prompt: 'same frame',
  input_references: [{ type: 'image_url', image_url: { url: storageUrlB } }],
}, 'test/other-image-model'));
assert.equal(usageRuntime.canReserveOpenRouterCost({
  authorizedCostUsd: 0,
  actualCostUsd: 0,
  inflightCostUsd: 0,
  estimatedCostUsd: 0,
}), false);
assert.equal(usageRuntime.canReserveOpenRouterCost({
  authorizedCostUsd: 1,
  actualCostUsd: 0.6,
  inflightCostUsd: 0.3,
  estimatedCostUsd: 0.2,
}), false);
assert.equal(usageRuntime.canReserveOpenRouterCost({
  authorizedCostUsd: 1,
  actualCostUsd: 0.6,
  inflightCostUsd: 0.3,
  estimatedCostUsd: 0.1,
}), true);

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const imageGeneration = read('functions/src/emoticonStudio/imageGeneration.ts');
const trigger = read('functions/src/triggers/onEmoticonJobCreated.ts');
const usage = read('functions/src/openrouterUsage.ts');
const director = read('functions/src/emoticonStudio/director.ts');
const functionSchema = read('functions/src/emoticonStudio/schema.ts');
const clientSchema = read('src/schemas/emoticonStudio.ts');
const batches = read('functions/src/emoticonStudio/batches.ts');

assert.match(imageGeneration, /\/api\/v1\/images\/models\/\$\{model\.id\}\/endpoints/);
assert.match(imageGeneration, /endpointSupports\(endpoint, 'input_references'\)/);
assert.doesNotMatch(imageGeneration, /max_price:/);
assert.match(imageGeneration, /allow_fallbacks: false/);
assert.match(imageGeneration, /providerTag \? \{ only: \[providerTag\] \}/);
assert.doesNotMatch(imageGeneration, /providerSlug \? \{ only:/);
assert.doesNotMatch(imageGeneration, /provider_slug \|\| params\.endpoint.*provider_tag/);
assert.match(imageGeneration, /IMAGE_BILLABLES.*input_reference.*input_image.*output_image/);
assert.match(imageGeneration, /IMAGE_PRICING_UNITS.*image.*megapixel.*token/);
assert.match(imageGeneration, /CONSERVATIVE_OUTPUT_IMAGE_TOKENS = 8_192/);
assert.match(imageGeneration, /unit === 'token'/);
assert.match(imageGeneration, /price\.variant/);
assert.match(imageGeneration, /return null/);
assert.match(imageGeneration, /no verified input-reference route with known pricing/);
assert.match(imageGeneration, /optionLevel: 'required'/);
assert.match(imageGeneration, /canonical multi-view identity sheet/);
assert.match(imageGeneration, /runWithOpenRouterUsageContext/);
assert.match(imageGeneration, /reserveOpenRouterUsage/);
assert.match(imageGeneration, /failOpenRouterUsageReservation/);
assert.match(imageGeneration, /settleOpenRouterUsageReservation/);
assert.ok(
  imageGeneration.indexOf('settleOpenRouterUsageReservation(reservation')
    < imageGeneration.indexOf('raw = await response.text()'),
  'Image HTTP success must settle before response image bytes are consumed.',
);
assert.doesNotMatch(imageGeneration, /assertOpenRouterUsageBudget/);
assert.doesNotMatch(imageGeneration, /recordOpenRouterUsage/);
assert.match(imageGeneration, /IMAGE_GENERATION_TIMEOUT_MS = 4 \* 60 \* 1000/);
assert.match(imageGeneration, /IMAGE_ROUTE_TIMEOUT_QUARANTINE_MS = 6 \* 60 \* 60 \* 1000/);
assert.match(imageGeneration, /quarantineTimedOutImageRoute\(selected\)/);
assert.match(imageGeneration, /quarantinedProviderTags\.has/);
assert.match(trigger, /MIN_IMAGE_CALL_BUDGET_MS = 330_000/);
assert.match(trigger, /isAmbiguousImageGenerationTimeout/);
assert.match(trigger, /failureCode: 'image-provider-timeout'/);
assert.match(trigger, /retryStrategy: 'new-job'/);

assert.match(trigger, /getHostingAiRuntime/);
assert.doesNotMatch(trigger, /getOpenRouterRuntimeConfig/);
assert.match(trigger, /identity-reference-sheet\.png/);
assert.match(trigger, /canonicalPoseUrl: params\.poseUrl/);
assert.match(trigger, /alternateCanonicalPoseUrl: mirroredPoseUrl/);
assert.doesNotMatch(trigger, /previousFrameUrl: pass === 1 \? previousFrameUrl : undefined/);
assert.doesNotMatch(trigger, /nextFrameUrl: frameIndex === frameCount - 1 \? frameUrls\[0\]/);
assert.match(trigger, /buildAnimationFrameSeed/);
assert.match(trigger, /generationRequestId: generated\.requestId/);
assert.match(trigger, /compositedFrames/);
assert.match(trigger, /openRouterAuthorizedCostUsd: authorizedCostUsd/);
assert.match(trigger, /parseEmoticonAiRuntimeSnapshot\(params\.job\.openRouterRuntimeSnapshot\)/);
assert.match(trigger, /openRouterRuntimeSnapshot: snapshot/);
assert.match(trigger, /costControlVersion: EMOTICON_COST_CONTROL_VERSION/);
assert.match(trigger, /LEGACY_EMOTICON_COST_CONTROL_VERSION/);
assert.doesNotMatch(trigger, /costControlVersion: 2/);
assert.match(trigger, /costReservationsByDay/);
assert.match(trigger, /onEmoticonJobTerminalSettled/);
assert.match(trigger, /settleTerminalJobCostReservation/);

assert.match(usage, /AsyncLocalStorage<OpenRouterUsageContext>/);
assert.match(usage, /OPENROUTER_LOGICAL_OPERATION_KEY_VERSION = 2/);
assert.match(usage, /createOpenRouterStableImageIdentifier/);
assert.match(usage, /logicalOperationKeyVersion: OPENROUTER_LOGICAL_OPERATION_KEY_VERSION/);
assert.match(usage, /frameIndex: Number\.isInteger\(context\.frameIndex\)/);
assert.match(usage, /seed: Number\.isInteger\(context\.seed\)/);
assert.match(usage, /userIdHash/);
assert.match(usage, /openRouterActualCostUsd/);
assert.match(usage, /assertOpenRouterUsageBudget/);
assert.match(usage, /openRouterInflightCostUsd/);
assert.match(usage, /reserveOpenRouterUsage/);
assert.match(usage, /settleOpenRouterUsageReservation/);
assert.match(usage, /failOpenRouterUsageReservation/);
assert.match(usage, /authorized > 0 && actual \+ inflight \+ estimated <= authorized/);
assert.doesNotMatch(usage, /configuredJobBudgetFallback/);
assert.doesNotMatch(usage, /EMOTICON_STUDIO_MAX_JOB_COST_USD\s*\|\|\s*8/);
assert.match(
  usage,
  /Missing,[\s\S]*explicit-zero values all fail closed[\s\S]*return typeof configured === 'number'/,
);
assert.match(usage, /existingState === 'inflight'.*existingState === 'uncertain'.*existingState === 'settled'/s);
assert.match(usage, /state: params\.ambiguous \? 'uncertain' : 'failed'/);
assert.match(usage, /suppliedCostUsd \?\? \(state === 'settled'/);
assert.match(usage, /transaction\.update\(jobRef/);
assert.doesNotMatch(usage, /transaction\.set\(jobRef/);
assert.doesNotMatch(usage, /userId:\s*userId/);

assert.match(director, /createOpenRouterLogicalOperationId/);
assert.match(director, /reserveOpenRouterUsage/);
assert.match(director, /failOpenRouterUsageReservation/);
assert.match(director, /settleOpenRouterUsageReservation/);
assert.ok(
  director.indexOf('settleOpenRouterUsageReservation(reservation')
    < director.indexOf('raw = await response.text()'),
  'Text HTTP success must settle before response parsing.',
);
assert.doesNotMatch(director, /assertOpenRouterUsageBudget/);
assert.doesNotMatch(director, /recordOpenRouterUsage/);

for (const source of [director, functionSchema, clientSchema]) {
  assert.match(source, /authorizedProps/);
  assert.match(source, /motionAccents/);
}
assert.match(clientSchema, /compositedFrames/);
assert.match(clientSchema, /openRouterAuthorizedCostUsd/);
assert.match(batches, /if \(!currentAggregate\.terminal\)/);

console.log('Emoticon OpenRouter cost, routing, identity, and final-frame safety verified.');
