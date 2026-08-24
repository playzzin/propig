import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const require = createRequire(import.meta.url);

const serverSchemaSource = read('functions/src/emoticonStudio/schema.ts');
const clientSchemaSource = read('src/schemas/emoticonStudio.ts');
const projectSchemaSource = read('src/schemas/emoticonProject.ts');
const projectServiceSource = read('src/services/emoticonProjectService.ts');
const studioServiceSource = read('src/services/emoticonStudioService.ts');
const routeSource = read('src/app/admin/emoticon-studio/page.tsx');
const startHubSource = read('src/app/admin/emoticon-studio/studio/StudioStartHub.tsx');
const composerSource = read('src/app/admin/emoticon-studio/studio/CreationComposer.tsx');
const studioHookSource = read('src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts');
const estimateSource = read('src/lib/emoticonGenerationEstimate.ts');
const directorSource = read('functions/src/emoticonStudio/director.ts');
const imageGenerationSource = read('functions/src/emoticonStudio/imageGeneration.ts');
const modelPolicySource = read('functions/src/emoticonStudio/modelPolicy.ts');
const triggerSource = read('functions/src/triggers/onEmoticonJobCreated.ts');
const rateLimitsSource = read('functions/src/emoticonStudio/rateLimits.ts');
const firestoreRules = read('firestore.rules');

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

function sourceSlice(source, startText, endText, label) {
  const start = source.indexOf(startText);
  assert.notEqual(start, -1, `${label}: start marker was not found.`);
  const end = source.indexOf(endText, start + startText.length);
  assert.notEqual(end, -1, `${label}: end marker was not found.`);
  return source.slice(start, end);
}

const schemaRuntime = require(path.join(root, 'functions/lib/emoticonStudio/schema.js'));
const directorRuntime = require(path.join(root, 'functions/lib/emoticonStudio/director.js'));
const imageGenerationRuntime = require(path.join(root, 'functions/lib/emoticonStudio/imageGeneration.js'));
const modelPolicyRuntime = require(path.join(root, 'functions/lib/emoticonStudio/modelPolicy.js'));
const rateLimitsRuntime = require(path.join(root, 'functions/lib/emoticonStudio/rateLimits.js'));
const animationContainerRuntime = require(path.join(root, 'functions/lib/emoticonStudio/animationContainer.js'));

assert.deepEqual(animationContainerRuntime.resolveEmoticonSpriteSheetLayout(8), { columns: 4, rows: 2, frameCount: 8 });
assert.deepEqual(animationContainerRuntime.resolveEmoticonSpriteSheetLayout(12), { columns: 4, rows: 3, frameCount: 12 });
assert.deepEqual(animationContainerRuntime.resolveEmoticonSpriteSheetLayout(16), { columns: 4, rows: 4, frameCount: 16 });
assert.deepEqual(animationContainerRuntime.resolveEmoticonSpriteSheetLayout(20), { columns: 5, rows: 4, frameCount: 20 });
assert.deepEqual(animationContainerRuntime.resolveEmoticonSpriteSheetLayout(24), { columns: 6, rows: 4, frameCount: 24 });

// The public contract is identical on both sides, while missing fields remain
// premium for jobs/projects that were persisted before this feature existed.
assert.deepEqual([...schemaRuntime.EMOTICON_RESOURCE_MODES], ['efficient', 'balanced', 'premium']);
for (const source of [serverSchemaSource, clientSchemaSource]) {
  requireMatch(
    source,
    /EMOTICON_RESOURCE_MODES\s*=\s*\['efficient',\s*'balanced',\s*'premium'\]\s+as const/,
    'Server and client must expose the same three resource modes.',
  );
  requireMatch(
    source,
    /resourceMode:\s*emoticonResourceModeSchema\.default\('premium'\)/,
    'A job without resourceMode must keep the legacy premium behavior.',
  );
  requireMatch(
    source,
    /aiGenerationProfile:\s*z\.literal\('gpt-light-v1'\)\.optional\(\)/,
    'Server and client schemas must accept only the versioned GPT Light profile.',
  );
}
requireMatch(
  projectSchemaSource,
  /resourceMode:\s*emoticonResourceModeSchema\.default\('premium'\)/,
  'A legacy project without resourceMode must normalize as premium.',
);
requireMatch(
  projectServiceSource,
  /resourceMode:\s*resourceMode\.success\s*\?\s*resourceMode\.data\s*:\s*'premium'/,
  'Legacy project normalization must fail safe to premium.',
);

const legacyRequest = schemaRuntime.emoticonJobRequestSchema.parse({
  sourceImageUrl: 'https://example.test/source.png',
  sourceStoragePath: 'users/test/emoticon-studio/sources/source.png',
  instruction: 'run happily',
  status: 'queued',
});
assert.equal(legacyRequest.resourceMode, 'premium');
assert.equal(schemaRuntime.emoticonJobRequestSchema.safeParse({
  ...legacyRequest,
  resourceMode: 'turbo',
}).success, false, 'Unknown resource modes must be rejected by the server schema.');
const gptLightRequest = schemaRuntime.emoticonJobRequestSchema.parse({
  ...legacyRequest,
  resourceMode: 'efficient',
  aiGenerationProfile: 'gpt-light-v1',
});
assert.equal(gptLightRequest.aiGenerationProfile, 'gpt-light-v1');
const balancedRequest = schemaRuntime.emoticonJobRequestSchema.parse({
  ...legacyRequest,
  resourceMode: 'balanced',
});
assert.equal(balancedRequest.resourceMode, 'balanced');
assert.equal(schemaRuntime.emoticonJobRequestSchema.safeParse({
  ...legacyRequest,
  resourceMode: 'efficient',
  aiGenerationProfile: 'gpt-light-v2',
}).success, false, 'Unknown GPT Light profile versions must be rejected by the server schema.');

// The unified Studio owns new-work defaults and cost disclosure. The route is
// only a thin canonical boundary; request settings live in the start hub,
// composer, and stateful Studio hook.
requireMatch(routeSource, /return <EmoticonStudioPage\s*\/>/, 'The canonical route must render the unified Studio.');
requireMatch(
  startHubSource,
  /onStartAi\(\{ files, title: title\.trim\(\), platform, outputType, frameCount: 8 \}\)/,
  'AI projects must start with the eight-frame default.',
);
requireMatch(
  composerSource,
  /project\.items\[0\]\?\.motion\.frameCount \|\| 8/,
  'The composer must preserve project timing and fall back to eight frames.',
);
requireMatch(
  composerSource,
  /useState<EmoticonResourceMode>\(project\.generationSettings\.resourceMode\)/,
  'The composer must initialize quality from the project default.',
);
requireMatch(
  composerSource,
  /estimateEmoticonAiCalls\(outputType, frameCount, mode\)/,
  'The composer must disclose estimated AI calls for the selected settings.',
);
for (const mode of ['efficient', 'balanced']) {
  requireMatch(estimateSource, new RegExp(`resourceMode === '${mode}'`), `The estimator must account for ${mode} mode.`);
}
requireMatch(estimateSource, /return \{ min: frames \+ 5, max: \(frames \* 2\) \+ 8 \}/, 'The estimator must account for premium mode.');
requireMatch(projectServiceSource, /const formats = \[profile\.preferredFormat\]/, 'New projects must initially render only their preferred format.');
requireMatch(
  projectServiceSource,
  /generationSettings:\s*\{[\s\S]{0,220}?resourceMode:\s*'efficient'[\s\S]{0,140}?formats,[\s\S]{0,140}?preferredFormat:\s*profile\.preferredFormat/,
  'New projects must persist efficient mode and preferred-format-only settings.',
);
requireMatch(
  projectServiceSource,
  /function defaultMotion\(emoticonType:[\s\S]{0,80}?frameCount = 8[\s\S]{0,220}?frameCount:\s*1[\s\S]{0,160}?frameCount,\s*durationMs:\s*1000/,
  'New animated project items must default to eight frames.',
);
requireMatch(
  projectServiceSource,
  /const frameCount = emoticonType === 'static'[\s\S]{0,260}?profile\.maxFrameCount[\s\S]{0,140}?createProjectItems\(itemCount, emoticonType, frameCount\)/,
  'Start frame count must be clamped to the selected platform and persisted.',
);
requireMatch(
  studioHookSource,
  /const formats: EmoticonExportFormat\[\] = normalizedIntent\.outputType === 'static'[\s\S]{0,260}?platformProfile\.allowedFormats\.includes\(format\)[\s\S]{0,120}?formats\.push\(platformProfile\.preferredFormat\)/,
  'The Studio must clamp requested formats and fall back to the preferred format.',
);
requireMatch(
  studioHookSource,
  /resourceMode:\s*normalizedIntent\.qualityMode,[\s\S]{0,100}?formats,/,
  'Selected quality and formats must reach each paid job.',
);
requireMatch(
  studioHookSource,
  /normalizedIntent\.outputType === 'animated' \? \{[\s\S]{0,80}?motionOverride:\s*\{[\s\S]{0,120}?fps,[\s\S]{0,80}?frameCount:\s*normalizedIntent\.frameCount[\s\S]{0,80}?durationMs:\s*normalizedIntent\.durationMs/,
  'Animated requests must explicitly submit their timing.',
);

// Existing stored documents still normalize through the schema default, while
// every newly created paid job must make its cost policy explicit.
requireMatch(
  firestoreRules,
  /'motionPreference',\s*'resourceMode',\s*'formats'/,
  'resourceMode must be an allowed job-create field.',
);
requireMatch(
  firestoreRules,
  /keys\(\)\.hasAll\(\[[\s\S]{0,320}?'resourceMode'/,
  'Firestore must require an explicit resourceMode on every new job.',
);
requireMatch(
  firestoreRules,
  /request\.resource\.data\.resourceMode in \['efficient',\s*'balanced',\s*'premium'\]/,
  'Firestore must validate the explicit resourceMode on every new job.',
);
requireMatch(
  firestoreRules,
  /'resourceMode',\s*'aiGenerationProfile',\s*'formats'/,
  'Firestore must allow the versioned GPT Light profile on new jobs.',
);
requireMatch(
  firestoreRules,
  /!request\.resource\.data\.keys\(\)\.hasAny\(\['aiGenerationProfile'\]\)\s*\|\|\s*request\.resource\.data\.aiGenerationProfile == 'gpt-light-v1'/,
  'Firestore must reject unknown AI generation profiles while allowing legacy jobs without one.',
);
requireMatch(
  studioServiceSource,
  /const EMOTICON_GPT_LIGHT_PROFILE = 'gpt-light-v1'[\s\S]{0,260}?resourceMode === 'efficient'[\s\S]{0,120}?aiGenerationProfile: EMOTICON_GPT_LIGHT_PROFILE/,
  'The client service must map new efficient work to the GPT Light profile.',
);
const submitJobBlock = sourceSlice(
  studioServiceSource,
  'export async function submitEmoticonJob',
  'export async function createEmoticonTemplatePlan',
  'new generation job submission',
);
requireMatch(
  submitJobBlock,
  /mode:\s*'generate',[\s\S]{0,120}?resourceMode:\s*input\.resourceMode,[\s\S]{0,100}?\.\.\.lightGenerationProfile\(input\.resourceMode\)/,
  'Every newly submitted efficient generation job must persist the versioned GPT Light profile.',
);

// Efficient planning honors eight frames and omits a repeated source-image
// upload. The default function argument deliberately preserves premium's floor.
const timingFixture = {
  action: {
    fps: 8,
    frameCount: 8,
    durationMs: 1_000,
  },
};
assert.equal(
  directorRuntime.normalizeEmoticonPlanTiming(timingFixture, 8).action.frameCount,
  8,
  'Efficient timing must not expand eight requested frames.',
);
assert.equal(
  directorRuntime.normalizeEmoticonPlanTiming(timingFixture).action.frameCount,
  12,
  'The default timing policy must retain the premium/legacy 12-frame floor.',
);
requireMatch(
  directorSource,
  /normalizeEmoticonPlanTiming\([\s\S]{0,260}?params\.resourceMode === 'efficient'\s*\?\s*8\s*:\s*12/,
  'Direction analysis must choose the timing floor from resourceMode.',
);
requireMatch(
  directorSource,
  /includeSourceImage\?:\s*boolean[\s\S]{0,520}?includeSourceImage\s*=\s*params\.includeSourceImage\s*!==\s*false/,
  'Frame planning must support a profile-only efficient request.',
);
requireMatch(
  directorSource,
  /\.\.\.\(includeSourceImage\s*\?\s*\[\{\s*type:\s*'image_url'[\s\S]{0,180}?\}\]\s*:\s*\[\]\)/,
  'The planner must actually omit image content when includeSourceImage is false.',
);
requireMatch(
  triggerSource,
  /includeSourceImage:\s*params\.resourceMode\s*!==\s*'efficient'/,
  'Efficient frame planning must call the planner without the source image.',
);

// Efficient jobs are split by an explicit version fence: pre-profile jobs keep
// the zero-provider composite, while newly submitted GPT Light jobs reserve a
// bounded Sol-low + GPT Image Mini budget. Premium remains unchanged.
const syntheticLimits = {
  perTextRequestUsd: 0.1,
  perImageUsd: 1,
  perJobUsd: 100,
};
const legacyEfficientAuthorization = rateLimitsRuntime.estimateEmoticonJobAuthorizationUsd({
  mode: 'generate',
  requestedFrameCount: 8,
  outputType: 'animated',
  resourceMode: 'efficient',
  limits: syntheticLimits,
});
const gptLightAuthorization = rateLimitsRuntime.estimateEmoticonJobAuthorizationUsd({
  mode: 'generate',
  requestedFrameCount: 8,
  outputType: 'animated',
  resourceMode: 'efficient',
  aiGenerationProfile: 'gpt-light-v1',
  limits: syntheticLimits,
});
const premiumAuthorization = rateLimitsRuntime.estimateEmoticonJobAuthorizationUsd({
  mode: 'generate',
  requestedFrameCount: 8,
  outputType: 'animated',
  resourceMode: 'premium',
  limits: syntheticLimits,
});
const balancedAuthorization = rateLimitsRuntime.estimateEmoticonJobAuthorizationUsd({
  mode: 'generate',
  requestedFrameCount: 8,
  outputType: 'animated',
  resourceMode: 'balanced',
  limits: syntheticLimits,
});
assert.equal(legacyEfficientAuthorization, 0, 'A legacy efficient job without a profile must remain zero-provider.');
assert.equal(gptLightAuthorization, 12.6, 'GPT Light animated authorization must be (F + 4) images plus six text calls.');
assert.equal(balancedAuthorization, premiumAuthorization, 'Balanced mode must reserve the safe full budget before selective repair reduces actual calls.');
assert.equal(premiumAuthorization, 18.6, 'Premium authorization must be (2F + 2) images plus six text calls.');
assert.equal(
  rateLimitsRuntime.estimateEmoticonJobAuthorizationUsd({
    mode: 'generate',
    requestedFrameCount: 8,
    outputType: 'animated',
    limits: syntheticLimits,
  }),
  premiumAuthorization,
  'Missing resourceMode must reserve the legacy premium budget.',
);
assert.equal(
  rateLimitsRuntime.estimateEmoticonJobAuthorizationUsd({
    mode: 'generate',
    requestedFrameCount: 1,
    outputType: 'static',
    resourceMode: 'efficient',
    aiGenerationProfile: 'gpt-light-v1',
    limits: syntheticLimits,
  }),
  2.3,
  'GPT Light static generation must reserve two image calls plus three text calls.',
);
assert.equal(
  rateLimitsRuntime.estimateEmoticonJobAuthorizationUsd({
    mode: 'plan',
    limits: syntheticLimits,
  }),
  0.25,
  'One-call planning authorization must use the minimum safe reservation floor.',
);
requireMatch(
  rateLimitsSource,
  /const isGptLightGeneration =[\s\S]{0,180}?params\.aiGenerationProfile === 'gpt-light-v1'/,
  'Paid efficient authorization must be gated by the exact GPT Light profile.',
);
requireMatch(
  rateLimitsSource,
  /params\.resourceMode === 'efficient'[\s\S]{0,100}?&& !isGptLightGeneration[\s\S]{0,30}?\) return 0/,
  'Only legacy efficient generation may exit the authorization calculator at zero.',
);
requireMatch(rateLimitsSource, /\?\s*3[\s\S]{0,180}?\:\s*6/, 'Static and animated generation must reserve three and six text calls respectively.');
requireMatch(rateLimitsSource, /isGptLightGeneration[\s\S]{0,80}?frameCount \+ 4/, 'GPT Light image authorization must use F+4.');
requireMatch(rateLimitsSource, /frameCount\s*\*\s*2\s*\+\s*2/, 'Premium image authorization must use 2F+2.');

const configuredPolicyFixture = {
  resourceMode: 'efficient',
  configuredTextModel: 'configured/premium-text',
  configuredImageModel: 'configured/premium-image',
  configuredFallbackModels: ['configured/fallback-a', 'configured/fallback-b'],
};
assert.deepEqual(
  modelPolicyRuntime.resolveEmoticonGenerationModelPolicy(configuredPolicyFixture),
  {
    textModel: 'openai/gpt-5.6-sol',
    imageModel: 'openai/gpt-image-1-mini',
    fallbackModels: [],
    reasoningEffort: 'low',
  },
  'GPT Light must pin Sol low and GPT Image Mini without a silent fallback.',
);
assert.deepEqual(
  modelPolicyRuntime.resolveEmoticonGenerationModelPolicy({
    ...configuredPolicyFixture,
    resourceMode: 'premium',
  }),
  {
    textModel: configuredPolicyFixture.configuredTextModel,
    imageModel: configuredPolicyFixture.configuredImageModel,
    fallbackModels: configuredPolicyFixture.configuredFallbackModels,
  },
  'Premium must keep the configured model policy unchanged.',
);
assert.deepEqual(
  modelPolicyRuntime.resolveEmoticonGenerationModelPolicy({
    ...configuredPolicyFixture,
    resourceMode: 'balanced',
  }),
  {
    textModel: configuredPolicyFixture.configuredTextModel,
    imageModel: configuredPolicyFixture.configuredImageModel,
    fallbackModels: configuredPolicyFixture.configuredFallbackModels,
  },
  'Balanced mode must use the configured models while limiting repair work later in the pipeline.',
);
requireMatch(modelPolicySource, /EMOTICON_LIGHT_TEXT_MODEL = 'openai\/gpt-5\.6-sol'/, 'The light text policy must pin GPT-5.6 Sol.');
requireMatch(modelPolicySource, /EMOTICON_LIGHT_IMAGE_MODEL = 'openai\/gpt-image-1-mini'/, 'The light image policy must pin GPT Image 1 Mini.');
requireMatch(modelPolicySource, /fallbackModels:\s*\[\][\s\S]{0,80}?reasoningEffort:\s*EMOTICON_LIGHT_REASONING_EFFORT/, 'GPT Light must fail closed and request low reasoning.');

const efficientTriggerIndex = triggerSource.indexOf("parsed.data.mode === 'generate'");
const runtimeResolutionIndex = triggerSource.indexOf('const runtime = await resolveEmoticonAiRuntime');
assert.ok(efficientTriggerIndex >= 0 && runtimeResolutionIndex > efficientTriggerIndex,
  'The legacy efficient compatibility branch must run before OpenRouter runtime/key resolution.');
const efficientCompositeBlock = sourceSlice(
  triggerSource,
  "if (\n            parsed.data.mode === 'generate'",
  'const runtime = await resolveEmoticonAiRuntime',
  'legacy zero-provider efficient composite',
);
requireMatch(
  efficientCompositeBlock,
  /parsed\.data\.resourceMode === 'efficient'[\s\S]{0,100}?parsed\.data\.aiGenerationProfile !== EMOTICON_GPT_LIGHT_PROFILE/,
  'Initial local-composite execution must exclude versioned GPT Light jobs.',
);
requireMatch(efficientCompositeBlock, /prepareCanonicalSource/,
  'Legacy fast composite must normalize the user-owned source on the server.');
requireMatch(efficientCompositeBlock, /renderEfficientCompositeJob/,
  'Legacy fast composite must use the deterministic renderer path.');
assert.doesNotMatch(efficientCompositeBlock, /resolveEmoticonAiRuntime|generateEmoticonPose|runAnalysisPipeline/,
  'Legacy fast composite must not resolve or call an AI provider.');
const continuedEfficientIndex = triggerSource.indexOf("request.data.mode === 'generate'");
const continuedRuntimeIndex = triggerSource.indexOf('const runtime = await resolveEmoticonAiRuntime', continuedEfficientIndex);
assert.ok(continuedEfficientIndex >= 0 && continuedRuntimeIndex > continuedEfficientIndex,
  'Recovered legacy efficient jobs must also check the local path before OpenRouter runtime resolution.');
const continuedEfficientBlock = sourceSlice(
  triggerSource,
  "if (\n                request.data.mode === 'generate'",
  'const runtime = await resolveEmoticonAiRuntime',
  'continued legacy zero-provider efficient composite',
);
requireMatch(
  continuedEfficientBlock,
  /request\.data\.resourceMode === 'efficient'[\s\S]{0,100}?request\.data\.aiGenerationProfile !== EMOTICON_GPT_LIGHT_PROFILE/,
  'Continuation local-composite execution must exclude versioned GPT Light jobs.',
);
requireMatch(
  triggerSource,
  /const useGptLight = params\.resourceMode === 'efficient'[\s\S]{0,100}?params\.aiGenerationProfile === EMOTICON_GPT_LIGHT_PROFILE/,
  'Runtime model replacement must require both efficient mode and the exact GPT Light profile.',
);
const runtimeSnapshotBlock = sourceSlice(
  triggerSource,
  'const resolvedRuntime: EmoticonAiRuntime =',
  'await params.update({ openRouterRuntimeSnapshot: snapshot });',
  'GPT Light runtime snapshot',
);
requireMatch(
  runtimeSnapshotBlock,
  /policy\.reasoningEffort[\s\S]{0,90}?reasoningEffort:\s*policy\.reasoningEffort/,
  'The resolved runtime must retain the low reasoning policy.',
);
requireMatch(
  runtimeSnapshotBlock,
  /resolvedRuntime\.reasoningEffort[\s\S]{0,120}?reasoningEffort:\s*resolvedRuntime\.reasoningEffort/,
  'The runtime snapshot must persist low reasoning across continuations.',
);
requireMatch(
  runtimeSnapshotBlock,
  /resolvedRuntime\.policyId[\s\S]{0,90}?policyId:\s*resolvedRuntime\.policyId/,
  'The runtime snapshot must persist the GPT Light policy identity.',
);
requireMatch(
  triggerSource,
  /resolveEmoticonAiRuntime\(\{[\s\S]{0,180}?aiGenerationProfile:\s*parsed\.data\.aiGenerationProfile/,
  'Initial execution must pass the profile fence into runtime resolution.',
);
requireMatch(
  triggerSource,
  /runAnalysisPipeline\(\{[\s\S]{0,240}?reasoningEffort:\s*runtime\.reasoningEffort/,
  'Initial analysis must receive the frozen low reasoning setting.',
);

// Efficient and balanced repair is bounded, resumable, and repairs only
// explicitly flagged frames with both temporal neighbours. Premium retains
// suffix regeneration.
const continuationBase = {
  stage: 'generation',
  pass: 2,
  startIndex: 2,
  nextFrameIndex: 8,
  totalGenerationCalls: 8,
  correction: 'Fix the isolated frame while retaining identity.',
  repairFrameIndices: [2, 5],
  nextRepairCursor: 0,
};
assert.equal(schemaRuntime.emoticonFrameContinuationSchema.safeParse(continuationBase).success, true);
assert.equal(schemaRuntime.emoticonFrameContinuationSchema.safeParse({
  ...continuationBase,
  repairFrameIndices: [1, 2, 3],
}).success, false, 'Selective repair checkpoints must reject more than two frames.');
for (const source of [serverSchemaSource, clientSchemaSource]) {
  requireMatch(
    source,
    /repairFrameIndices:\s*z\.array\([\s\S]{0,100}?\)\.max\(2\)\.optional\(\)/,
    'Server and client continuation schemas must cap selective repair at two frames.',
  );
}
requireMatch(
  triggerSource,
  /validProblemIndices\.length\s*>\s*0[\s\S]{0,120}?validProblemIndices\.length\s*<=\s*2[\s\S]{0,120}?!review\.cameraOnly/,
  'Efficient repair selection must accept only one or two local, non-camera-only defects.',
);
const spriteGenerationBlock = sourceSlice(
  triggerSource,
  'const generateSpriteSheetFrames = async',
  'const repairSelectedFrames = async',
  'GPT Light sprite-sheet generation',
);
requireMatch(spriteGenerationBlock, /resolveEmoticonSpriteSheetLayout\(frameCount\)/,
  'GPT Light must derive one explicit sprite grid from the requested frame count.');
requireMatch(spriteGenerationBlock, /generateEmoticonSpriteSheet\(\{[\s\S]{0,700}?directions:\s*plannedFrameSequence\.frames/,
  'The planned chronological poses must reach the one-call sprite-sheet generator.');
assert.ok(
  spriteGenerationBlock.indexOf("fileName: 'generated-sprite-sheet.png'")
    < spriteGenerationBlock.indexOf('extractEmoticonSpriteSheetFrames(spriteSheetBuffer, layout)'),
  'The paid sheet response must be checkpointed before local extraction.',
);
requireMatch(spriteGenerationBlock, /evaluateEmoticonFrameVariation\(extracted\.frames/,
  'A generated sheet must prove real frame variation before review or rendering.');
requireMatch(spriteGenerationBlock, /inspectEmoticonAlphaIsolation/,
  'Every extracted sheet cell must pass local transparent-background inspection.');
requireMatch(spriteGenerationBlock, /sprite-sheet-frame-/,
  'Accepted sheet cells must be persisted as independent chronological frames.');
const generationDispatchBlock = sourceSlice(
  triggerSource,
  "if (continuation.stage === 'generation')",
  'const reviewFrames = async',
  'frame generation dispatch',
);
requireMatch(generationDispatchBlock, /continuation\.pass === 1[\s\S]{0,220}?await generateSpriteSheetFrames\(\)/,
  'Every fresh animation quality mode must create one requested-count sprite sheet before local splitting.');
requireMatch(generationDispatchBlock, /if \(!spriteSheetReady\)[\s\S]{0,240}?await generateFrames\(/,
  'A rejected sheet must fall back to real per-frame generation rather than a rigid composite.');
requireMatch(imageGenerationSource, /SPRITE-SHEET ANIMATION TASK:[\s\S]{0,2600}?pure chroma green #00FF00/,
  'The Mini request must specify a strict chronological green-screen grid.');
requireMatch(imageGenerationSource, /translated, rotated, zoomed, mirrored, or shaken copy of one pose is invalid/,
  'The sprite prompt must explicitly reject one-pose camera motion.');

// The original request remains an independent, authoritative subject contract
// after the director has derived a plan. Generation and review must never
// validate only the same potentially drifted plan against itself.
const framePlanningSubjectBlock = sourceSlice(
  directorSource,
  'export async function planEmoticonFrameSequence',
  'export async function evaluateEmoticonPose',
  'frame-planning subject fidelity',
);
requireMatch(framePlanningSubjectBlock, /originalUserInstruction:\s*string/,
  'Frame planning must require the original user instruction separately from the AI plan.');
requireMatch(framePlanningSubjectBlock, /originalUserInstruction,[\s\S]{0,260}?requestedAction:\s*params\.plan\.action\.action/,
  'Frame planning must send the original request beside the derived action.');
const poseReviewSubjectBlock = sourceSlice(
  directorSource,
  'export async function evaluateEmoticonPose',
  'export async function evaluateEmoticonMotion',
  'static-pose subject review',
);
requireMatch(poseReviewSubjectBlock, /Judge actionClarity against the authoritative originalUserInstruction/,
  'Static review must score visible fidelity to the original request.');
requireMatch(poseReviewSubjectBlock, /originalUserInstruction,[\s\S]{0,220}?requestedAction:\s*params\.plan\.action\.action/,
  'Static review must compare the original request with the derived action.');
const motionReviewSubjectBlock = directorSource.slice(
  directorSource.indexOf('export async function evaluateEmoticonMotion'),
);
requireMatch(motionReviewSubjectBlock, /Judge actionClarity against the authoritative originalUserInstruction/,
  'Sequence review must score the complete animation against the original request.');
requireMatch(imageGenerationSource, /AUTHORITATIVE ORIGINAL USER REQUEST:[\s\S]{0,300}?MANDATORY SUBJECT FIDELITY/,
  'Image prompts must carry an explicit original-request subject lock.');
requireMatch(
  spriteGenerationBlock,
  /generateEmoticonSpriteSheet\(\{[\s\S]{0,260}?originalUserInstruction:\s*params\.originalUserInstruction/,
  'Sprite generation must receive the original request independently of frame directions.',
);
requireMatch(
  triggerSource,
  /generateEmoticonPose\(\{[\s\S]{0,260}?originalUserInstruction:\s*params\.request\.instruction/,
  'Static image generation must receive the stored original request.',
);
requireMatch(
  triggerSource,
  /reviewPose\(\{[\s\S]{0,320}?originalUserInstruction:\s*params\.request\.instruction/,
  'Static result review must receive the stored original request.',
);
requireMatch(
  triggerSource,
  /renderAiFrameSequenceOutputs\(\{[\s\S]{0,420}?originalUserInstruction:\s*request\.data\.instruction/,
  'Recovered animation generation must retain the stored original request.',
);
const selectiveRepairBlock = sourceSlice(
  triggerSource,
  'const repairSelectedFrames = async',
  "if (continuation.stage === 'generation')",
  'selective repair',
);
requireMatch(selectiveRepairBlock, /previousFrameIndex\s*=\s*\(frameIndex\s*-\s*1\s*\+\s*frameCount\)\s*%\s*frameCount/, 'Selective repair needs the previous loop neighbour.');
requireMatch(selectiveRepairBlock, /nextFrameIndex\s*=\s*\(frameIndex\s*\+\s*1\)\s*%\s*frameCount/, 'Selective repair needs the next loop neighbour.');
requireMatch(selectiveRepairBlock, /previousFrameUrl:\s*frameUrls\[previousFrameIndex\]/, 'Previous-frame context must reach image generation.');
requireMatch(selectiveRepairBlock, /nextFrameUrl:\s*frameUrls\[nextFrameIndex\]/, 'Next-frame context must reach image generation.');
requireMatch(selectiveRepairBlock, /maxRequestAttempts:\s*1/, 'Each selected repair must remain a single image request.');
requireMatch(selectiveRepairBlock, /nextRepairCursor:\s*repairCursor\s*\+\s*1/, 'Selective repair progress must be checkpointed for recovery.');

requireMatch(
  triggerSource,
  /!isVerifiedBodyMotion\(review, params\.plan\)[\s\S]{0,100}?firstPassUsesSpriteSheet\s*\|\|\s*selectiveRepairIndices\.length\s*>\s*0/,
  'Efficient and balanced hard-pass results must repair either a rejected whole sheet or at most two isolated frames.',
);
requireMatch(
  triggerSource,
  /params\.resourceMode !== 'premium' && !firstPassUsesSpriteSheet[\s\S]{0,420}?repairFrameIndices:\s*selectiveRepairIndices/,
  'Efficient and balanced modes must checkpoint only their selected repair frames.',
);
const premiumRepairBlock = sourceSlice(
  triggerSource,
  'const fullRepairStartIndex = firstPassUsesSpriteSheet ? 0 : repairStartIndex;',
  'await ensureContinuationBudget({',
  'full/suffix repair',
);
requireMatch(premiumRepairBlock, /frameUrls\.splice\(fullRepairStartIndex\)/,
  'Premium repair must discard its affected suffix and sheet fallback must discard the whole sheet.');
requireMatch(premiumRepairBlock, /generateFrames\(\{[\s\S]{0,160}?startIndex:\s*fullRepairStartIndex[\s\S]{0,100}?pass:\s*2/,
  'Premium and sheet fallback repairs must regenerate real frames as pass two.');
requireMatch(triggerSource, /const repairedReview\s*=\s*await reviewFrames\(2\)/, 'Every repair path must receive a full second sequence review.');
const finalAcceptanceIndex = triggerSource.lastIndexOf('if (!isVerifiedBodyMotion(review, params.plan))');
const repairIndex = triggerSource.indexOf('const shouldAutoRepair');
assert.ok(finalAcceptanceIndex > repairIndex, 'Final hard motion acceptance must remain after all optional repair logic.');
requireMatch(
  triggerSource.slice(finalAcceptanceIndex, finalAcceptanceIndex + 1_600),
  /throw new Error\([\s\S]*AI image frame sequence was not a verified character animation/,
  'A sequence that still fails hard acceptance must fail closed.',
);

// The mode survives reservation, continuation/recovery, retries, rerenders,
// and one-frame repair jobs instead of silently reverting mid-pipeline.
requireMatch(
  triggerSource,
  /reserveRateLimitSlot\(\{[\s\S]{0,700}?resourceMode:\s*parsed\.data\.resourceMode/,
  'Cost reservation must use the parsed resource mode.',
);
requireMatch(
  triggerSource,
  /renderAiFrameSequenceOutputs\(\{[\s\S]{0,700}?resourceMode:\s*request\.data\.resourceMode/,
  'Recovered frame generation must retain the stored resource mode.',
);
for (const pattern of [
  /resourceMode:\s*params\.job\.resourceMode/,
  /resourceMode:\s*params\.parentJob\.resourceMode/,
  /resourceMode:\s*job\.resourceMode/,
]) {
  requireMatch(studioServiceSource, pattern, 'Retry, rerender, and repair paths must retain resourceMode.');
}

// Initial efficient image calls carry at most three references. At that cap,
// source + phase pose + identity sheet win over the opposite pose.
requireMatch(
  triggerSource,
  /maxInputReferences:\s*params\.resourceMode === 'efficient'\s*\?\s*3\s*:\s*4/,
  'Initial efficient animation frames must cap input references at three.',
);
requireMatch(
  triggerSource,
  /maxInputReferences:\s*params\.request\.resourceMode === 'efficient'\s*\?\s*3\s*:\s*4/,
  'Efficient key-pose generation must cap input references at three.',
);
requireMatch(
  imageGenerationSource,
  /maxReferences !== undefined && maxReferences <= 3[\s\S]{0,900}?identityEvidenceUrl\s*=\s*params\.identityReferenceUrl\s*\|\|\s*params\.additionalReferenceUrls\?\.\[0\][\s\S]{0,500}?add\(params\.preferAlternatePose \? params\.canonicalPoseUrl : params\.alternateCanonicalPoseUrl/,
  'The three-reference selector must add the identity sheet before the opposite pose.',
);

const references = imageGenerationRuntime.selectEmoticonAnimationInputReferences({
  sourceImageUrl: 'https://example.test/source.png',
  canonicalPoseUrl: 'https://example.test/canonical.png',
  alternateCanonicalPoseUrl: 'https://example.test/opposite.png',
  identityReferenceUrl: 'https://example.test/identity-sheet.png',
  previousFrameUrl: 'https://example.test/previous.png',
  nextFrameUrl: 'https://example.test/next.png',
  maxReferences: 3,
});
assert.deepEqual(references.urls, [
  'https://example.test/source.png',
  'https://example.test/canonical.png',
  'https://example.test/identity-sheet.png',
]);
const oppositeReferences = imageGenerationRuntime.selectEmoticonAnimationInputReferences({
  sourceImageUrl: 'https://example.test/source.png',
  canonicalPoseUrl: 'https://example.test/canonical.png',
  alternateCanonicalPoseUrl: 'https://example.test/opposite.png',
  preferAlternatePose: true,
  identityReferenceUrl: 'https://example.test/identity-sheet.png',
  maxReferences: 3,
});
assert.deepEqual(oppositeReferences.urls, [
  'https://example.test/source.png',
  'https://example.test/opposite.png',
  'https://example.test/identity-sheet.png',
]);
assert.ok(references.urls.length <= 3 && oppositeReferences.urls.length <= 3);

const rawIdentityFallbackReferences = imageGenerationRuntime.selectEmoticonAnimationInputReferences({
  sourceImageUrl: 'https://example.test/source.png',
  canonicalPoseUrl: 'https://example.test/canonical.png',
  alternateCanonicalPoseUrl: 'https://example.test/opposite.png',
  additionalReferenceUrls: ['https://example.test/user-reference.png'],
  maxReferences: 3,
});
assert.deepEqual(rawIdentityFallbackReferences.urls, [
  'https://example.test/source.png',
  'https://example.test/canonical.png',
  'https://example.test/user-reference.png',
]);

requireMatch(
  triggerSource,
  /preserveExistingDownloadToken[\s\S]{0,900}?firebaseStorageDownloadTokens[\s\S]{0,500}?existingDownloadToken\s*\|\|\s*randomUUID\(\)/,
  'Canonical asset URLs must keep their download token stable across continuations.',
);
requireMatch(
  triggerSource,
  /readCanonicalReferenceCheckpoint\([\s\S]{0,900}?canonicalReferenceCheckpoint\s*\|\|\s*await prepareCanonicalReferenceSet/,
  'Continuation must reuse its canonical reference checkpoint before rebuilding assets.',
);
requireMatch(
  triggerSource,
  /ensureFrameBuffersHydrated[\s\S]{0,800}?missingIndices[\s\S]{0,900}?downloadStoredAnimationFrames/,
  'Stored frame pixels must be hydrated lazily only for review or rendering.',
);
requireMatch(
  triggerSource,
  /const EMOTICON_UPLOAD_CONCURRENCY\s*=\s*3[\s\S]{0,1600}?await Promise\.all\(workers\)/,
  'Derived output uploads must use a bounded concurrency pool.',
);
requireMatch(
  triggerSource,
  /while \(!failed && nextIndex < items\.length\)[\s\S]{0,500}?failed = true[\s\S]{0,500}?await Promise\.all\(workers\);[\s\S]{0,100}?if \(failed\) throw firstError/,
  'A failed upload worker must stop new work and wait for in-flight uploads before returning.',
);
const compositedUploadBlock = sourceSlice(
  triggerSource,
  'async function uploadCompositedFrameSequence',
  'function assertRenderedFilesPassedInspection',
  'composited frame upload',
);
requireMatch(
  compositedUploadBlock,
  /mapWithConcurrency\([\s\S]{0,180}?EMOTICON_UPLOAD_CONCURRENCY/,
  'Composited frame uploads must use the bounded pool instead of serial network waits.',
);
requireMatch(
  compositedUploadBlock,
  /if \(params\.onProgress\) await params\.onProgress\(uploaded\)/,
  'Derived upload progress must checkpoint once after the ordered batch completes.',
);
const frameReviewBlock = sourceSlice(
  triggerSource,
  'const reviewFrames = async',
  'let review = params.motionReview',
  'frame review',
);
const localAlphaIndex = frameReviewBlock.indexOf('alphaProblemFrameIndices');
const paidReviewIndex = frameReviewBlock.indexOf('reviewImageFrameSequence({');
assert.ok(localAlphaIndex >= 0 && paidReviewIndex > localAlphaIndex,
  'Local alpha isolation must reject invalid frames before the paid sequence review.');
requireMatch(
  frameReviewBlock,
  /if \(!localVariation\.passes\)[\s\S]{0,900}?cameraOnly:\s*localVariation\.rigidMotionOnly[\s\S]{0,180}?problemFrameIndices:\s*localVariationProblemFrameIndices/,
  'Rigid-only motion must be marked camera-only while isolated duplicate/outlier frames remain selectively repairable.',
);
requireMatch(
  frameReviewBlock,
  /alphaProblemFrameIndices[\s\S]{0,900}?cameraOnly:\s*false[\s\S]{0,180}?problemFrameIndices:\s*alphaProblemFrameIndices\.slice\(0, 8\)/,
  'One or two locally invalid alpha frames must remain eligible for bounded selective repair.',
);
requireMatch(
  studioServiceSource,
  /export function subscribeEmoticonJobs[\s\S]{0,900}?where\(documentId\(\), 'in', chunk\)/,
  'Project previews must use bounded live document subscriptions instead of per-item polling.',
);
requireMatch(
  studioServiceSource,
  /const chunkResults:[\s\S]{0,600}?failedChunks\.size[\s\S]{0,260}?params\.onChange\(chunkResults\.flatMap/,
  'Chunked preview subscriptions must publish only a complete, error-free aggregate snapshot.',
);
requireMatch(
  studioHookSource,
  /return subscribeEmoticonJobs\(\{[\s\S]{0,260}?jobIds:\s*trackedJobIds,[\s\S]{0,120}?onChange:\s*setTrackedJobs/,
  'The unified Studio must consume the bounded live job subscription.',
);
requireMatch(
  studioHookSource,
  /const reconcileTrackedJobs = async \(\) => \{[\s\S]{0,500}?getEmoticonJobFromServer\([\s\S]{0,1800}?window\.setInterval\(\(\) => void reconcileTrackedJobs\(\), 30_000\)/,
  'The unified Studio must reconcile missed terminal updates from the server.',
);
assert.doesNotMatch(
  studioHookSource,
  /shouldPollWorkingFast|pollAttempt\s*<\s*40|activeProjectWorkingJobIdSignature/,
  'Project previews must not repeatedly read every job through polling or working-state resubscriptions.',
);

console.log('Emoticon resource-mode cost, latency, compatibility, and quality safeguards verified.');
