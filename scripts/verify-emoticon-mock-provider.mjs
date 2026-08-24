import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const previousProvider = process.env.EMOTICON_STUDIO_PROVIDER;
const previousApiKey = process.env.OPENROUTER_API_KEY;
const previousFetch = globalThis.fetch;
let fetchCalls = 0;

process.env.EMOTICON_STUDIO_PROVIDER = 'mock';
delete process.env.OPENROUTER_API_KEY;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('Mock provider attempted an external network call.');
};

try {
  const imageGeneration = require(path.join(
    root,
    'functions/lib/emoticonStudio/imageGeneration.js',
  ));
  const director = require(path.join(
    root,
    'functions/lib/emoticonStudio/director.js',
  ));
  const animationContainer = require(path.join(
    root,
    'functions/lib/emoticonStudio/animationContainer.js',
  ));
  const renderer = require(path.join(
    root,
    'functions/lib/emoticonStudio/renderer.js',
  ));
  const providerContract = require(path.join(
    root,
    'functions/lib/emoticonStudio/imageGenerationProvider.js',
  ));
  const { OpenRouterImageProvider } = require(path.join(
    root,
    'functions/lib/emoticonStudio/openRouterImageProvider.js',
  ));
  const sharp = require(path.join(root, 'functions/node_modules/sharp'));

  assert.equal(providerContract.resolveEmoticonStudioImageProviderName(), 'mock');
  assert.equal(providerContract.resolveEmoticonStudioImageProviderName(' openrouter '), 'openrouter');
  assert.throws(
    () => providerContract.resolveEmoticonStudioImageProviderName('unknown'),
    /Unsupported EMOTICON_STUDIO_PROVIDER/,
  );

  let delegated = false;
  const openRouterProvider = new OpenRouterImageProvider(async () => {
    delegated = true;
    throw new Error('The missing-key delegate must not run.');
  });
  await assert.rejects(
    () => openRouterProvider.generate({
      kind: 'pose',
      apiKey: '',
      referenceImageUrls: ['https://example.test/source.png'],
      prompt: 'A valid isolated full character pose prompt.',
    }),
    /OPENROUTER_API_KEY is not configured/,
  );
  assert.equal(delegated, false);

  const sourceImageUrl = 'https://example.test/mock-character.png';
  const instruction = '캐릭터가 양팔과 양다리를 번갈아 움직이며 밝게 인사하는 12프레임 루프';
  const characterAnalysis = await director.analyzeEmoticonCharacter({
    apiKey: '',
    model: 'unused/mock-text-model',
    fallbackModels: [],
    sourceImageUrl,
    additionalReferenceUrls: ['https://example.test/mock-character-side.png'],
    resourceMode: 'premium',
  });
  assert.equal(characterAnalysis.referenceCount, 2);
  assert.equal(characterAnalysis.imageQuality.usableForGeneration, true);

  const repeatedAnalysis = await director.analyzeEmoticonCharacter({
    apiKey: '',
    model: 'unused/mock-text-model',
    fallbackModels: [],
    sourceImageUrl,
    additionalReferenceUrls: ['https://example.test/mock-character-side.png'],
    resourceMode: 'premium',
  });
  assert.deepEqual(repeatedAnalysis, characterAnalysis);

  const plan = await director.analyzeEmoticonDirection({
    apiKey: '',
    model: 'unused/mock-text-model',
    fallbackModels: [],
    sourceImageUrl,
    instruction,
    motionPreference: 'dynamic',
    resourceMode: 'premium',
  });
  assert.equal(plan.action.renderMode, 'dynamic');
  assert.equal(plan.action.frameCount, 12);
  assert.equal(plan.action.fps, 12);

  const sheetPlan = await director.planEmoticonCharacterSheet({
    apiKey: '',
    model: 'unused/mock-text-model',
    fallbackModels: [],
    characterAnalysis,
    request: '정면, 좌우 측면, 뒷면 참고 포즈를 만들어 주세요.',
    itemCount: 4,
  });
  assert.equal(sheetPlan.items.length, 4);
  assert.equal(new Set(sheetPlan.items.map((item) => item.pose)).size, 4);

  const frameSequence = await director.planEmoticonFrameSequence({
    apiKey: '',
    model: 'unused/mock-text-model',
    fallbackModels: [],
    sourceImageUrl,
    originalUserInstruction: instruction,
    plan,
  });
  assert.equal(frameSequence.frames.length, plan.action.frameCount);
  assert.deepEqual(
    director.validateEmoticonFrameSequenceSemantics({ plan, sequence: frameSequence }),
    [],
  );

  const poseRequest = {
    apiKey: '',
    preferredModel: 'unused/mock-image-model',
    sourceImageUrl,
    originalUserInstruction: instruction,
    plan,
    animationFrame: {
      direction: frameSequence.frames[0],
      frameCount: frameSequence.frames.length,
    },
    seed: 731,
    resourceMode: 'premium',
  };
  const poseA = await imageGeneration.generateEmoticonPose(poseRequest);
  const poseB = await imageGeneration.generateEmoticonPose(poseRequest);
  assert.equal(poseA.provider, 'mock');
  assert.equal(poseA.model, 'mock/emoticon-studio-v1');
  assert.equal(poseA.contentType, 'image/png');
  assert.equal(poseA.costUsd, 0);
  assert.match(poseA.requestId, /^mock_[a-f0-9]{32}$/);
  assert.equal(poseA.requestId, poseB.requestId);
  assert.deepEqual(poseA.buffer, poseB.buffer);
  await imageGeneration.validateGeneratedImageResult(poseA);
  const poseMetadata = await sharp(poseA.buffer).metadata();
  assert.equal(poseMetadata.width, 512);
  assert.equal(poseMetadata.height, 512);
  assert.equal(poseMetadata.hasAlpha, true);
  assert.equal((await renderer.inspectEmoticonAlphaIsolation(poseA.buffer)).passed, true);

  const layout = animationContainer.resolveEmoticonSpriteSheetLayout(
    frameSequence.frames.length,
  );
  const spriteRequest = {
    apiKey: '',
    preferredModel: 'unused/mock-image-model',
    sourceImageUrl,
    originalUserInstruction: instruction,
    plan,
    directions: frameSequence.frames,
    layout,
    seed: 911,
    resourceMode: 'efficient',
  };
  const spriteA = await imageGeneration.generateEmoticonSpriteSheet(spriteRequest);
  const spriteB = await imageGeneration.generateEmoticonSpriteSheet(spriteRequest);
  assert.equal(spriteA.provider, 'mock');
  assert.equal(spriteA.costUsd, 0);
  assert.equal(spriteA.requestId, spriteB.requestId);
  assert.deepEqual(spriteA.buffer, spriteB.buffer);
  const spriteMetadata = await sharp(spriteA.buffer).metadata();
  assert.equal(spriteMetadata.width, layout.columns * 256);
  assert.equal(spriteMetadata.height, layout.rows * 256);

  const extracted = await animationContainer.extractEmoticonSpriteSheetFrames(
    spriteA.buffer,
    layout,
  );
  assert.equal(extracted.frames.length, layout.frameCount);
  assert.equal(extracted.evidence.background, 'flat-color');
  const [variation, alphaInspections] = await Promise.all([
    renderer.evaluateEmoticonFrameVariation(extracted.frames, {
      requireSilhouetteVariation: true,
    }),
    Promise.all(extracted.frames.map((frame) => renderer.inspectEmoticonAlphaIsolation(frame))),
  ]);
  assert.equal(variation.passes, true, JSON.stringify(variation));
  assert.equal(variation.rigidMotionOnly, false);
  assert.equal(alphaInspections.every((inspection) => inspection.passed), true);

  const poseQuality = await director.evaluateEmoticonPose({
    apiKey: '',
    model: 'unused/mock-text-model',
    fallbackModels: [],
    sourceImageUrl,
    originalUserInstruction: instruction,
    generatedImageUrl: 'https://example.test/generated-mock-pose.png',
    plan,
  });
  assert.equal(poseQuality.overall, 100);
  assert.equal(poseQuality.correction, '');

  const motionQuality = await director.evaluateEmoticonMotion({
    apiKey: '',
    model: 'unused/mock-text-model',
    fallbackModels: [],
    sourceImageUrl,
    originalUserInstruction: instruction,
    frameUrls: frameSequence.frames.map(
      (_, index) => `https://example.test/generated-mock-frame-${index}.png`,
    ),
    plan,
  });
  assert.equal(motionQuality.overall, 100);
  assert.equal(motionQuality.cameraOnly, false);
  assert.deepEqual(motionQuality.problemFrameIndices, []);

  const hostingRuntimeSource = fs.readFileSync(
    path.join(root, 'functions/src/api/hostingAiRuntime.ts'),
    'utf8',
  );
  assert.match(hostingRuntimeSource, /EMOTICON_STUDIO_MOCK_RUNTIME_API_KEY/);
  assert.match(hostingRuntimeSource, /resolveEmoticonStudioImageProviderName\(\) === 'mock'/);
  assert.equal(fetchCalls, 0, 'Mock analysis and image generation must stay network-free.');

  console.log('Emoticon mock provider deterministic image, sprite-sheet, planning, and review flow verified.');
} finally {
  if (previousProvider === undefined) delete process.env.EMOTICON_STUDIO_PROVIDER;
  else process.env.EMOTICON_STUDIO_PROVIDER = previousProvider;
  if (previousApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = previousApiKey;
  globalThis.fetch = previousFetch;
}
