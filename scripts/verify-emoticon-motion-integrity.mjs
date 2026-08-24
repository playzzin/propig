import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');

const director = readSource('functions/src/emoticonStudio/director.ts');
const imageGeneration = readSource('functions/src/emoticonStudio/imageGeneration.ts');
const qualityStandards = readSource('functions/src/emoticonStudio/qualityStandards.ts');
const renderer = readSource('functions/src/emoticonStudio/renderer.ts');
const outputPlanPolicy = readSource('functions/src/emoticonStudio/outputPlanPolicy.ts');
const functionsSchema = readSource('functions/src/emoticonStudio/schema.ts');
const clientSchema = readSource('src/schemas/emoticonStudio.ts');
const trigger = readSource('functions/src/triggers/onEmoticonJobCreated.ts');
const editor = readSource('src/app/admin/emoticon-studio/studio/ProfessionalEditor.tsx');
const service = readSource('src/services/emoticonStudioService.ts');
const require = createRequire(import.meta.url);
const {
  applyEmoticonMotionPolicy,
  normalizeEmoticonFrameSequenceCandidate,
  normalizeEmoticonPlanTiming,
  validateEmoticonFrameSequenceSemantics,
} = require('../functions/lib/emoticonStudio/director.js');
const {
  emoticonFrameSequenceSchema,
} = require('../functions/lib/emoticonStudio/schema.js');
const {
  selectEmoticonAnimationInputReferences,
} = require('../functions/lib/emoticonStudio/imageGeneration.js');
const {
  normalizeEmoticonPlanForOutputProfile,
} = require('../functions/lib/emoticonStudio/outputPlanPolicy.js');
const {
  getEmoticonMotionAcceptanceRequirements,
  meetsEmoticonDynamicKeyPoseAcceptance,
  meetsEmoticonMotionAcceptance,
  meetsEmoticonPoseAcceptance,
} = require('../functions/lib/emoticonStudio/qualityStandards.js');
const {
  evaluateEmoticonFrameVariation,
  inspectEmoticonAlphaIsolation,
  normalizeGeneratedEmoticonPose,
} = require('../functions/lib/emoticonStudio/renderer.js');
const sharp = require('../functions/node_modules/sharp');

assert.match(director, /requiresTrueBodyMotion/);
assert.match(director, /applyEmoticonMotionPolicy/);
assert.match(director, /motionPreference === 'stable'/);
assert.match(director, /minimumFrameCount = 12/);
assert.match(director, /params\.resourceMode === 'efficient' \? 8 : 12/);
assert.match(director, /shouldUseDynamicFrames/);
assert.doesNotMatch(director, /renderMode: 'dynamic',[\s\S]{0,160}fps: 8,[\s\S]{0,80}durationMs: 1000/);
assert.match(director, /normal and dynamic requests/);
assert.match(director, /planEmoticonFrameSequence/);
assert.match(director, /directorSummary: \{ type: 'string', minLength: 1, maxLength: 320 \}/);
assert.match(director, /imagePrompt: \{ type: 'string', minLength: 20, maxLength: 2400 \}/);
assert.match(director, /immutableTraits:[\s\S]{0,180}items: \{ type: 'string', minLength: 1, maxLength: 160 \}/);
assert.match(director, /title: \{ type: 'string', minLength: 1, maxLength: 60 \}/);
assert.match(director, /formatFirstSchemaIssue\(parsed\.error\)/);
assert.match(director, /sequenceSummary: \{ type: 'string', minLength: 1, maxLength: 320 \}/);
assert.match(director, /normalizeEmoticonFrameSequenceCandidate\(extractJsonObject\(content\)\)/);
assert.match(director, /Return exactly \$\{frameCount\} chronological frames/);
assert.match(director, /Frame 0 and the final frame must connect smoothly/);
assert.match(director, /validateEmoticonFrameSequenceSemantics/);
assert.match(director, /previous frame plan was rejected before image generation/i);
assert.match(director, /attempt < 2/);
assert.match(director, /evaluateEmoticonMotion/);
assert.match(director, /limbPoseChange/);
assert.match(director, /facialExpressionChange/);
assert.match(director, /frameConsistency/);
assert.match(director, /loopContinuity/);
assert.match(director, /backgroundClean/);
assert.match(director, /singleCharacter/);
assert.match(director, /occlusionFree/);
assert.match(director, /problemFrameIndices/);
assert.match(director, /Inspect every supplied frame/);
assert.match(director, /cameraOnly/);
assert.match(director, /correction: 'Recreate one isolated full character/);

const overlongFrameSequence = normalizeEmoticonFrameSequenceCandidate({
  sequenceSummary: ` ${'s'.repeat(360)} `,
  frames: Array.from({ length: 8 }, (_, frameIndex) => ({
    frameIndex,
    phase: frameIndex === 0 ? 'start' : frameIndex === 7 ? 'loop-return' : 'action',
    posePrompt: ` ${'p'.repeat(760)} `,
    expressionPrompt: ` ${'e'.repeat(430)} `,
    continuityPrompt: ` ${'c'.repeat(430)} `,
  })),
});
const recoveredFrameSequence = emoticonFrameSequenceSchema.safeParse(overlongFrameSequence);
assert.equal(recoveredFrameSequence.success, true);
assert.equal(recoveredFrameSequence.data.sequenceSummary.length, 320);
assert.equal(recoveredFrameSequence.data.frames[0].posePrompt.length, 700);
assert.equal(recoveredFrameSequence.data.frames[0].expressionPrompt.length, 400);
assert.equal(recoveredFrameSequence.data.frames[0].continuityPrompt.length, 400);

const duplicateLoopSequence = normalizeEmoticonFrameSequenceCandidate({
  sequenceSummary: 'loop fixture',
  frames: Array.from({ length: 8 }, (_, frameIndex) => ({
    frameIndex,
    phase: frameIndex === 0 || frameIndex === 7 ? 'start' : 'action',
    posePrompt: frameIndex === 0 || frameIndex === 7
      ? 'Both arms down in exactly the same neutral starting pose.'
      : `Distinct action pose ${frameIndex} with clearly changing hands and feet.`,
    expressionPrompt: 'Clearly readable eyes, eyebrows, cheeks, and mouth.',
    continuityPrompt: 'Connect smoothly to the next chronological pose.',
  })),
});
assert.equal(duplicateLoopSequence.frames[7].phase, 'loop-return');
assert.notEqual(duplicateLoopSequence.frames[7].posePrompt, duplicateLoopSequence.frames[0].posePrompt);
assert.match(duplicateLoopSequence.frames[7].posePrompt, /distinct pre-start recovery/i);

assert.match(qualityStandards, /EMOTICON_MOTION_ACCEPTANCE/);
assert.match(qualityStandards, /limbOrExpressionChange: 68/);
assert.match(qualityStandards, /frameConsistency: 72/);
assert.match(qualityStandards, /backgroundClean: 88/);
assert.match(qualityStandards, /singleCharacter/);
assert.match(qualityStandards, /occlusionFree: 85/);
assert.match(qualityStandards, /referenceOverrideIdentity: 80/);
assert.match(qualityStandards, /referenceOverrideStyleConsistency: 80/);
assert.match(qualityStandards, /EMOTICON_PREMIUM_MOTION_TARGET = 95/);
assert.match(qualityStandards, /scoreEmoticonMotionQuality/);
assert.match(qualityStandards, /getEmoticonPremiumMotionDeficits/);
assert.match(qualityStandards, /getEmoticonActionTemplate/);
assert.match(qualityStandards, /eight-step running cycle/);

const highNumericPoseWithConservativeReferenceFlag = {
  overall: 75,
  identity: 80,
  allReferencesConsistent: false,
  actionClarity: 90,
  styleConsistency: 85,
  backgroundClean: 100,
  singleCharacter: true,
  occlusionFree: 90,
  issues: [],
  correction: '',
};
assert.equal(meetsEmoticonPoseAcceptance(highNumericPoseWithConservativeReferenceFlag), true);
assert.equal(meetsEmoticonPoseAcceptance({
  ...highNumericPoseWithConservativeReferenceFlag,
  identity: 79,
}), false);
assert.equal(meetsEmoticonDynamicKeyPoseAcceptance({
  overall: 60,
  identity: 70,
  allReferencesConsistent: false,
  actionClarity: 80,
  styleConsistency: 70,
  backgroundClean: 100,
  singleCharacter: true,
  occlusionFree: 100,
  issues: [],
  correction: '',
}), true);
assert.equal(meetsEmoticonDynamicKeyPoseAcceptance({
  overall: 60,
  identity: 69,
  allReferencesConsistent: false,
  actionClarity: 80,
  styleConsistency: 70,
  backgroundClean: 100,
  singleCharacter: true,
  occlusionFree: 100,
  issues: [],
  correction: '',
}), false);

const acceptedMotion = {
  overall: 80,
  identity: 84,
  allReferencesConsistent: false,
  actionClarity: 80,
  styleConsistency: 84,
  limbPoseChange: 82,
  facialExpressionChange: 75,
  frameConsistency: 82,
  loopContinuity: 75,
  backgroundClean: 100,
  singleCharacter: true,
  occlusionFree: 90,
  cameraOnly: false,
  problemFrameIndices: [],
  issues: [],
  correction: '',
};
assert.equal(meetsEmoticonMotionAcceptance(acceptedMotion), true);
assert.equal(meetsEmoticonMotionAcceptance({ ...acceptedMotion, styleConsistency: 79 }), false);
assert.equal(meetsEmoticonMotionAcceptance({
  ...acceptedMotion,
  limbPoseChange: 0,
  facialExpressionChange: 88,
}, { requireLimbMotion: true, requireExpressionMotion: true }), false);
assert.equal(meetsEmoticonMotionAcceptance({
  ...acceptedMotion,
  limbPoseChange: 88,
  facialExpressionChange: 0,
}, { requireLimbMotion: true, requireExpressionMotion: true }), false);

assert.match(imageGeneration, /generateEmoticonAnimationFrame/);
assert.match(imageGeneration, /additionalReferenceUrls/);
assert.match(imageGeneration, /POSE COMPLIANCE IS PRIMARY/);
assert.match(imageGeneration, /never keep the same arm raised/);
assert.match(imageGeneration, /Exact body pose/);
assert.match(imageGeneration, /Exact facial expression/);
assert.match(imageGeneration, /Exactly one isolated character only/);
assert.match(imageGeneration, /detached prop, duplicated limb, second face, second body/);
assert.match(imageGeneration, /Action-specific animation rule/);
assert.match(imageGeneration, /accepts\('seed'\)/);
assert.match(imageGeneration, /MAX_IMAGE_INPUT_REFERENCES = 4/);
assert.match(imageGeneration, /previous chronological frame for continuity only/);
assert.match(imageGeneration, /target-side motion guide for this phase/);
assert.match(imageGeneration, /preferAlternatePose: params\.direction\.phase === 'opposite'/);
assert.match(imageGeneration, /FACIAL BEAT COMPLIANCE/);
assert.match(imageGeneration, /FRAME-SPECIFIC TASK/);
assert.ok(
  imageGeneration.indexOf("animationFrame ? buildAnimationFrameDirection(animationFrame) : ''")
    < imageGeneration.indexOf("'Create exactly the same character identity as the reference image.'"),
  'The exact frame direction must precede generic identity/style instructions.',
);
assert.doesNotMatch(
  imageGeneration,
  /additionalReferenceUrls:\s*\[\s*\.\.\.\(params\.additionalReferenceUrls[^\]]+params\.previousFrameUrl/s,
);

const fourIdentityReferences = selectEmoticonAnimationInputReferences({
  sourceImageUrl: 'https://example.test/source.png',
  canonicalPoseUrl: 'https://example.test/canonical-pose.png',
  alternateCanonicalPoseUrl: 'https://example.test/canonical-pose-mirrored.png',
  identityReferenceUrl: 'https://example.test/identity-sheet.png',
  additionalReferenceUrls: [
    'https://example.test/identity-2.png',
    'https://example.test/identity-3.png',
    'https://example.test/identity-4.png',
  ],
  previousFrameUrl: 'https://example.test/previous.png',
  nextFrameUrl: 'https://example.test/next.png',
});
assert.deepEqual(fourIdentityReferences.urls, [
  'https://example.test/source.png',
  'https://example.test/canonical-pose.png',
  'https://example.test/canonical-pose-mirrored.png',
  'https://example.test/identity-sheet.png',
]);
assert.match(fourIdentityReferences.roleSummary, /2 target-side motion guide/);
assert.match(fourIdentityReferences.roleSummary, /3 opposite-side comparison guide/);

const oppositePhaseReferences = selectEmoticonAnimationInputReferences({
  sourceImageUrl: 'https://example.test/source.png',
  canonicalPoseUrl: 'https://example.test/canonical-pose.png',
  alternateCanonicalPoseUrl: 'https://example.test/canonical-pose-mirrored.png',
  identityReferenceUrl: 'https://example.test/identity-sheet.png',
  preferAlternatePose: true,
});
assert.deepEqual(oppositePhaseReferences.urls, [
  'https://example.test/source.png',
  'https://example.test/canonical-pose-mirrored.png',
  'https://example.test/canonical-pose.png',
  'https://example.test/identity-sheet.png',
]);
assert.match(oppositePhaseReferences.roleSummary, /2 target-side motion guide/);

const sequentialReferences = selectEmoticonAnimationInputReferences({
  sourceImageUrl: 'https://example.test/source.png',
  additionalReferenceUrls: [
    'https://example.test/identity-2.png',
    'https://example.test/identity-3.png',
    'https://example.test/identity-4.png',
  ],
  previousFrameUrl: 'https://example.test/previous.png',
});
assert.deepEqual(sequentialReferences.urls, [
  'https://example.test/source.png',
  'https://example.test/previous.png',
  'https://example.test/identity-2.png',
  'https://example.test/identity-3.png',
]);

assert.match(renderer, /renderImageSequenceEmoticon/);
assert.match(renderer, /normalizeCharacterSequence/);
assert.match(renderer, /const union = bounds\.reduce/);
assert.match(renderer, /removeDistantResidualComponents/);
assert.match(renderer, /removeGroundShadowBands/);
assert.match(renderer, /component\.touchesBorder/);
assert.match(renderer, /It is never a valid sticker component/);
assert.match(renderer, /sanitizeTransparentPixelRgb/);
assert.match(renderer, /duplicate silhouettes only in RGB/);
assert.match(renderer, /inspectEmoticonAlphaIsolation/);
assert.match(renderer, /tiny, disconnected artifacts/);
assert.match(renderer, /evaluateEmoticonFrameVariation/);
assert.match(renderer, /FRAME_DUPLICATE_THRESHOLD/);
assert.match(renderer, /FRAME_SILHOUETTE_DUPLICATE_THRESHOLD/);
assert.match(renderer, /allPairDuplicateFrameIndices/);
assert.match(renderer, /applyMotion: false/);

assert.match(trigger, /isVerifiedBodyMotion/);
assert.match(trigger, /meetsEmoticonMotionAcceptance/);
assert.match(trigger, /meetsEmoticonPremiumMotionTarget/);
assert.match(trigger, /buildPremiumMotionCorrection/);
assert.match(trigger, /premiumQualityTarget: EMOTICON_PREMIUM_MOTION_TARGET/);
assert.match(trigger, /meetsEmoticonPoseAcceptance/);
assert.match(trigger, /meetsEmoticonDynamicKeyPoseAcceptance/);
assert.match(
  trigger,
  /hasAcceptedPoseReview:[\s\S]{0,260}?meetsEmoticonDynamicKeyPoseAcceptance\(savedRepair\.data\.poseReview\)/,
);
assert.doesNotMatch(
  trigger,
  /hasAcceptedPoseReview:[\s\S]{0,260}?meetsEmoticonPoseAcceptance\(savedRepair\.data\.poseReview\)/,
);
assert.match(trigger, /rejecting the unverified pose/);
assert.match(trigger, /correction: quality\.correction\.trim\(\)/);
assert.match(trigger, /generateEmoticonAnimationFrame/);
assert.match(trigger, /key-pose-mirrored\.png/);
assert.match(trigger, /alternateCanonicalPoseUrl: mirroredPoseUrl/);
assert.match(trigger, /renderImageSequenceEmoticon/);
assert.match(trigger, /evaluateEmoticonFrameVariation/);
assert.match(trigger, /applyAlphaIsolationEvidence/);
assert.match(trigger, /applyMotionAlphaIsolationEvidence/);
assert.match(trigger, /downloadStoredAnimationFrames/);
assert.match(trigger, /reused-ai-frame-/);
assert.match(trigger, /animationFrames/);
assert.match(trigger, /verifyReusableDynamicParent/);
assert.match(trigger, /Create a new AI generation instead of rerendering this legacy or unverified animation/);
assert.match(trigger, /planEmoticonFrameSequence/);
assert.match(trigger, /startIndex: 0, pass: 1/);
assert.match(trigger, /repairPasses: 1/);
assert.match(trigger, /problemFrameIndices/);
assert.match(trigger, /frameIndex < frameCount/);
assert.doesNotMatch(trigger, /falling back to keyframe motion/);
assert.doesNotMatch(trigger, /generateOpenRouterVideo/);
assert.doesNotMatch(trigger, /renderVideoEmoticon/);

const isolatedFixture = await sharp({
  create: {
    width: 64,
    height: 64,
    channels: 4,
    background: { r: 22, g: 44, b: 66, alpha: 0 },
  },
}).composite([{
  input: Buffer.from('<svg width="24" height="40"><rect width="24" height="40" fill="red"/></svg>'),
  left: 20,
  top: 12,
}]).png().toBuffer();
const isolatedInspection = await inspectEmoticonAlphaIsolation(isolatedFixture);
assert.equal(isolatedInspection.passed, true);
assert.equal(isolatedInspection.transparentBorderRatio, 1);

const opaqueFixture = await sharp({
  create: {
    width: 64,
    height: 64,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
}).png().toBuffer();
assert.equal((await inspectEmoticonAlphaIsolation(opaqueFixture)).passed, false);

const connectedShadowFixture = await sharp({
  create: {
    width: 256,
    height: 256,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 0 },
  },
}).composite([{
  input: Buffer.from('<svg width="150" height="120"><rect x="60" y="0" width="32" height="95" rx="12" fill="#1769aa"/><rect x="48" y="82" width="58" height="28" rx="12" fill="#202020"/><ellipse cx="75" cy="108" rx="70" ry="10" fill="#b8b4aa"/></svg>'),
  left: 53,
  top: 136,
}]).png().toBuffer();
const cleanedShadowFixture = await normalizeGeneratedEmoticonPose(connectedShadowFixture);
const { data: cleanedShadowPixels, info: cleanedShadowInfo } = await sharp(cleanedShadowFixture)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let visibleBottomBandPixels = 0;
for (let y = 244; y < cleanedShadowInfo.height; y += 1) {
  for (let x = 0; x < cleanedShadowInfo.width; x += 1) {
    if (cleanedShadowPixels[(y * cleanedShadowInfo.width + x) * 4 + 3] > 32) visibleBottomBandPixels += 1;
  }
}
assert.equal(visibleBottomBandPixels, 0);

assert.match(editor, /rerenderEmoticonJob\(\{/);
assert.match(editor, /props\.job\.compositedFrames\?\.length \? props\.job\.compositedFrames : props\.job\.animationFrames/);
assert.match(service, /canReuseEmoticonAnimationFrames/);
assert.match(service, /job\.status === 'completed'/);
assert.match(functionsSchema, /durationMs: z\.number\(\)\.int\(\)\.min\(700\)\.max\(3000\)/);
assert.match(functionsSchema, /frameCount: z\.number\(\)\.int\(\)\.min\(4\)\.max\(24\)/);
assert.match(outputPlanPolicy, /outputProfile\.type !== 'static'/);
assert.match(trigger, /emoticonStoredPlanSchema\.safeParse\(job\.plan\)/);
assert.match(trigger, /normalizeEmoticonPlanForOutputProfile\(configuredPlan, outputProfile\)/);
assert.match(clientSchema, /hasExactStaticPlan/);

const timingPlan = {
  directorSummary: '달리는 캐릭터의 복합 동작',
  characterProfile: {
    summary: 'test',
    immutableTraits: ['same face'],
    palette: [],
    styleRules: ['same line'],
    negativeRules: ['no background'],
  },
  action: {
    title: '달리기',
    emotion: '신남',
    action: '팔다리를 크게 움직이며 달리기',
    intensity: 'exaggerated',
    motionType: 'dynamic',
    renderMode: 'dynamic',
    durationMs: 2000,
    frameCount: 20,
    fps: 10,
    loopDescription: 'smooth loop',
    imagePrompt: 'A sufficiently detailed frame prompt for a running character.',
    videoPrompt: 'A sufficiently detailed motion prompt with distinct running poses.',
    negativePrompt: 'background',
  },
  bubble: {
    text: '',
    style: 'none',
    position: 'top',
    entrance: 'none',
    font: 'clean',
    timeline: { mode: 'full', startFrame: 0, endFrame: null, cues: [] },
  },
  suggestedPresets: [],
};
assert.deepEqual(getEmoticonMotionAcceptanceRequirements(timingPlan), {
  requireLimbMotion: true,
  requireExpressionMotion: true,
});
const semanticPhases = [
  'start',
  'anticipation',
  'action',
  'opposite',
  'follow-through',
  'recovery',
];
const semanticallyValidSequence = {
  sequenceSummary: 'A complete alternating running cycle with facial beats.',
  frames: Array.from({ length: 20 }, (_, frameIndex) => ({
    frameIndex,
    phase: frameIndex === 19 ? 'loop-return' : semanticPhases[frameIndex % semanticPhases.length],
    posePrompt: `Frame ${frameIndex}: left arm angle ${frameIndex} with right arm opposite; left leg contact ${frameIndex} and right foot recovery ${frameIndex}.`,
    expressionPrompt: `Frame ${frameIndex}: eyes, eyebrows, cheeks, and mouth use facial beat ${frameIndex}.`,
    continuityPrompt: `Frame ${frameIndex} keeps identity fixed and connects into the next distinct running pose.`,
  })),
};
assert.deepEqual(validateEmoticonFrameSequenceSemantics({
  plan: timingPlan,
  sequence: semanticallyValidSequence,
}), []);
const semanticallyDuplicatedSequence = {
  ...semanticallyValidSequence,
  frames: semanticallyValidSequence.frames.map((frame, index) => (
    index === 8 ? { ...semanticallyValidSequence.frames[2], frameIndex: 8 } : frame
  )),
};
assert.match(
  validateEmoticonFrameSequenceSemantics({
    plan: timingPlan,
    sequence: semanticallyDuplicatedSequence,
  }).join(' '),
  /repeat the same pose/i,
);
const automaticTiming = normalizeEmoticonPlanTiming(applyEmoticonMotionPolicy({
  plan: timingPlan,
  motionPreference: 'auto',
}));
assert.equal(automaticTiming.action.renderMode, 'dynamic');
assert.equal(automaticTiming.action.frameCount, 20);
assert.equal(automaticTiming.action.fps, 10);
assert.equal(automaticTiming.action.durationMs, 2000);
assert.notEqual(automaticTiming.action.frameCount, 8);

const staticPlan = normalizeEmoticonPlanForOutputProfile({
  ...timingPlan,
  bubble: {
    ...timingPlan.bubble,
    entrance: 'pop',
    timeline: {
      mode: 'cues',
      startFrame: 3,
      endFrame: 9,
      cues: [{ id: 'cue-1', text: '안녕', startFrame: 3, endFrame: 5 }],
    },
  },
}, { type: 'static' });
assert.deepEqual({
  renderMode: staticPlan.action.renderMode,
  frameCount: staticPlan.action.frameCount,
  fps: staticPlan.action.fps,
  durationMs: staticPlan.action.durationMs,
}, {
  renderMode: 'stable',
  frameCount: 1,
  fps: 1,
  durationMs: 0,
});
assert.equal(staticPlan.bubble.text, '안녕');
assert.equal(staticPlan.bubble.entrance, 'none');
assert.match(staticPlan.directorSummary, /정지 PNG 대표 포즈/);
assert.match(staticPlan.action.videoPrompt, /Static PNG output selected/);
assert.deepEqual(staticPlan.bubble.timeline, {
  mode: 'full',
  startFrame: 0,
  endFrame: null,
  cues: [],
});
assert.strictEqual(
  normalizeEmoticonPlanForOutputProfile(timingPlan, { type: 'animated' }),
  timingPlan,
);

const minimumDynamicTiming = normalizeEmoticonPlanTiming({
  ...timingPlan,
  action: {
    ...timingPlan.action,
    durationMs: 1000,
    frameCount: 8,
    fps: 8,
  },
});
assert.ok(minimumDynamicTiming.action.frameCount >= 12);
assert.ok(minimumDynamicTiming.action.frameCount <= 24);
const efficientMinimumDynamicTiming = normalizeEmoticonPlanTiming({
  ...timingPlan,
  action: {
    ...timingPlan.action,
    durationMs: 1000,
    frameCount: 8,
    fps: 8,
  },
}, 8);
assert.equal(efficientMinimumDynamicTiming.action.frameCount, 8);

async function buildVariationFixture(left, color) {
  const shape = await sharp({
    create: {
      width: 24,
      height: 42,
      channels: 4,
      background: color,
    },
  }).png().toBuffer();
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: shape, left, top: 11 }]).png().toBuffer();
}

const sameSilhouetteDifferentColors = await Promise.all(
  Array.from({ length: 8 }, (_, index) => buildVariationFixture(20, {
    r: 30 + (index * 20),
    g: 80 + (index * 10),
    b: 200 - (index * 15),
    alpha: 1,
  })),
);
const colorNoiseMotion = await evaluateEmoticonFrameVariation(
  sameSilhouetteDifferentColors,
  { requireSilhouetteVariation: true },
);
assert.equal(colorNoiseMotion.passes, false);
assert.ok(colorNoiseMotion.duplicateFrameIndices.length > 0);

const rigidOnlyMotion = await Promise.all(
  Array.from({ length: 8 }, (_, index) => buildVariationFixture(4 + (index * 6), {
    r: 235,
    g: 180,
    b: 90,
    alpha: 1,
  })),
);
const rigidOnlyInspection = await evaluateEmoticonFrameVariation(
  rigidOnlyMotion,
  { requireSilhouetteVariation: true },
);
assert.equal(rigidOnlyInspection.passes, false, 'Moving one unchanged pose must fail true-motion validation.');
assert.equal(rigidOnlyInspection.rigidMotionOnly, true);
assert.ok(rigidOnlyInspection.alignedMedianDifference < 0.028);

const articulatedMotion = await Promise.all(Array.from({ length: 8 }, async (_, index) => sharp(Buffer.from(`
  <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
    <circle cx="64" cy="57" r="25" fill="#efb45a" stroke="#172033" stroke-width="7"/>
    <circle cx="64" cy="27" r="16" fill="#ffd1a8" stroke="#172033" stroke-width="6"/>
    <line x1="45" y1="52" x2="${12 + (index * 11)}" y2="${20 + ((index % 3) * 28)}" stroke="#172033" stroke-width="11" stroke-linecap="round"/>
    <line x1="82" y1="55" x2="${112 - (index * 8)}" y2="${105 - ((index % 4) * 22)}" stroke="#172033" stroke-width="11" stroke-linecap="round"/>
    <line x1="53" y1="78" x2="${25 + (index * 7)}" y2="116" stroke="#172033" stroke-width="12" stroke-linecap="round"/>
    <line x1="75" y1="78" x2="${108 - (index * 6)}" y2="116" stroke="#172033" stroke-width="12" stroke-linecap="round"/>
  </svg>
`)).png().toBuffer()));
const articulatedInspection = await evaluateEmoticonFrameVariation(
  articulatedMotion,
  { requireSilhouetteVariation: true },
);
assert.equal(articulatedInspection.passes, true, 'Distinct articulated poses must pass true-motion validation.');
assert.equal(articulatedInspection.rigidMotionOnly, false);

const poseA = await buildVariationFixture(4, { r: 240, g: 240, b: 240, alpha: 1 });
const poseB = await buildVariationFixture(20, { r: 240, g: 240, b: 240, alpha: 1 });
const poseC = await buildVariationFixture(36, { r: 240, g: 240, b: 240, alpha: 1 });
const nonAdjacentDuplicates = await evaluateEmoticonFrameVariation([
  poseA,
  poseB,
  poseC,
  poseA,
  poseB,
  poseC,
  poseA,
  poseB,
]);
assert.equal(nonAdjacentDuplicates.passes, false);
assert.ok(nonAdjacentDuplicates.duplicateFrameIndices.includes(3));

console.log('Emoticon true-motion integrity checks passed.');
