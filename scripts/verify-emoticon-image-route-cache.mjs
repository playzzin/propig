import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'functions/src/emoticonStudio/imageGeneration.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const firestoreIndexes = fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8');
const require = createRequire(import.meta.url);
const runtime = require(path.join(root, 'functions/lib/emoticonStudio/imageGeneration.js'));
const rendererRuntime = require(path.join(root, 'functions/lib/emoticonStudio/renderer.js'));
const sharp = require(path.join(root, 'functions/node_modules/sharp'));

const section = (start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
};

assert.match(source, /IMAGE_ROUTE_SHARED_CACHE_MS = 12 \* 60 \* 1000/);
assert.match(source, /IMAGE_ROUTE_SHARED_CACHE_MAX_FUTURE_MS = 15 \* 60 \* 1000/);
assert.match(source, /IMAGE_ROUTE_SHARED_CACHE_COLLECTION = 'emoticonStudioOpenRouterRouteCache'/);
assert.match(source, /IMAGE_ROUTE_POLICY_VERSION = 4/);
assert.match(source, /import \{ EMOTICON_LIGHT_IMAGE_MODEL \} from '\.\/modelPolicy'/);
assert.match(source, /const selectedRouteCache = new Map/);
assert.match(
  firestoreIndexes,
  /"collectionGroup": "emoticonStudioOpenRouterRouteCache"[\s\S]{0,160}?"fieldPath": "expiresAt"[\s\S]{0,80}?"ttl": true/,
  'Expired shared route-cache documents must have a Firestore TTL policy.',
);

const cacheSchema = section('const cachedImageRouteSchema', 'type CachedImageRouteDocument');
for (const requiredField of [
  'configuredModelKey',
  'inputReferenceCount',
  'maxImageCostUsd',
  'estimatedImageCostUsd',
  'resourceMode',
  'routingPolicy',
  'backgroundMode',
  'optionLevel',
  'modelPolicyScore',
  'providerTag',
  'providerSlug',
  'supportedParameters',
  'pricing',
  'expiresAt',
]) {
  assert.match(cacheSchema, new RegExp(`\\b${requiredField}\\b`));
}
assert.match(cacheSchema, /\.strict\(\)/);

const cacheContext = section('function buildImageRouteCacheContext', 'function buildCachedImageRouteDocument');
assert.match(cacheContext, /quality-tier-price-first-v2/);
assert.match(cacheContext, /quality-first-v1/);
assert.match(cacheContext, /inputReferenceCount/);
assert.match(cacheContext, /maxImageCostUsd: params\.maxImageCostUsd\.toFixed\(4\)/);
assert.match(cacheContext, /createHash\('sha256'\)/);
assert.doesNotMatch(cacheContext, /apiKey|Authorization|prompt|sourceImage|referenceImage/);

const cacheDocument = section('function buildCachedImageRouteDocument', 'function selectedRouteFromCachedDocument');
assert.match(cacheDocument, /Timestamp\.fromMillis\(nowMs \+ IMAGE_ROUTE_SHARED_CACHE_MS\)/);
assert.match(cacheDocument, /scoreImageModelForEmoticons/);
assert.match(cacheDocument, /backgroundMode: route\.backgroundMode/);
assert.match(cacheDocument, /optionLevel: route\.optionLevel/);
assert.match(cacheDocument, /normalizedCapabilities/);
assert.match(cacheDocument, /cacheablePricing/);
assert.doesNotMatch(cacheDocument, /apiKey|Authorization|prompt|sourceImage|referenceImage/);

const cacheValidation = section('function selectedRouteFromCachedDocument', 'async function loadCachedImageRoute');
assert.match(cacheValidation, /cachedImageRouteSchema\.safeParse/);
assert.match(cacheValidation, /expiresAtMs <= params\.nowMs/);
assert.match(cacheValidation, /IMAGE_ROUTE_SHARED_CACHE_MAX_FUTURE_MS/);
assert.match(cacheValidation, /cached\.configuredModelKey !== params\.context\.configuredModelKey/);
assert.match(cacheValidation, /cached\.inputReferenceCount !== params\.context\.inputReferenceCount/);
assert.match(cacheValidation, /cached\.maxImageCostUsd - params\.context\.maxImageCostUsd/);
assert.match(cacheValidation, /cached\.resourceMode !== params\.context\.resourceMode/);
assert.match(cacheValidation, /cached\.routingPolicy !== params\.context\.routingPolicy/);
assert.match(
  cacheValidation,
  /params\.context\.resourceMode === 'efficient'[\s\S]{0,160}?params\.context\.configuredModel === EMOTICON_LIGHT_IMAGE_MODEL[\s\S]{0,160}?cached\.model\.id !== EMOTICON_LIGHT_IMAGE_MODEL/,
  'GPT Light must reject a cached route that points at any other image model.',
);
assert.match(cacheValidation, /supports\(model, 'input_references'\)/);
assert.match(cacheValidation, /endpointSupports\(endpoint, 'input_references'\)/);
assert.match(cacheValidation, /!endpoint\.provider_tag\?\.trim\(\)/);
assert.match(cacheValidation, /scoreImageModelForEmoticons/);
assert.match(cacheValidation, /estimatedImageCostUsd > params\.context\.maxImageCostUsd/);
assert.match(cacheValidation, /estimatedImageCostUsd - cached\.estimatedImageCostUsd/);
assert.match(cacheValidation, /backgroundMode: cached\.backgroundMode/);
assert.match(cacheValidation, /optionLevel: cached\.optionLevel/);

const cacheLoad = section('async function loadCachedImageRoute', 'async function persistSelectedImageRoute');
assert.ok(
  cacheLoad.indexOf('selectedRouteCache.get') < cacheLoad.indexOf('.get();'),
  'Warm-instance memory cache must be checked before the shared Firestore cache.',
);
assert.match(cacheLoad, /using live discovery/);
assert.match(cacheLoad, /return null/);

const cachePersistence = section('async function persistSelectedImageRoute', 'async function invalidateSelectedImageRoute');
assert.match(cachePersistence, /route\.cacheSource !== 'discovery'/);
assert.match(cachePersistence, /buildCachedImageRouteDocument/);
assert.match(cachePersistence, /\.set\(document\)/);
assert.doesNotMatch(cachePersistence, /apiKey|Authorization|prompt|sourceImage|referenceImage/);

const cacheInvalidation = section('async function invalidateSelectedImageRoute', 'async function selectImageModel');
assert.match(cacheInvalidation, /selectedRouteCache\.delete/);
assert.match(cacheInvalidation, /modelCache = null/);
assert.match(cacheInvalidation, /endpointCache\.delete/);
assert.match(cacheInvalidation, /\.delete\(\)/);

const selector = section('async function selectImageModel', 'async function fetchImageBuffer');
assert.match(selector, /loadCachedImageRoute\(cacheContext\)/);
assert.match(selector, /discoverImageModels\(apiKey, options\.forceDiscovery\)/);
assert.match(selector, /discoverImageModelEndpoints\(apiKey, model, options\.forceDiscovery\)/);
assert.match(
  selector,
  /const exactLightModel = resourceMode === 'efficient'\s*&& configuredModel === EMOTICON_LIGHT_IMAGE_MODEL/,
  'The exact GPT Light selector must activate only for efficient jobs configured with GPT Image 1 Mini.',
);
assert.match(
  selector,
  /const candidates = exactLightModel\s*\? compatible\.filter\(\(model\) => model\.id === EMOTICON_LIGHT_IMAGE_MODEL\)\s*: compatible/,
  'GPT Light discovery must restrict candidates to the configured GPT Image 1 Mini model.',
);
assert.match(
  selector,
  /if \(!candidates\.length\) \{\s*if \(exactLightModel\) \{[\s\S]{0,260}?has no verified input-reference route/,
  'GPT Light must fail closed when the exact image model has no verified route.',
);
assert.match(selector, /resourceMode === 'efficient'[\s\S]{0,400}?coreQualityTier\(right\) - coreQualityTier\(left\)[\s\S]{0,260}?leftCost - rightCost/);
assert.match(source, /function endpointParameterValues[\s\S]{0,900}?values[\s\S]{0,300}?enum/,
  'Endpoint discovery must inspect advertised parameter values when present.');
assert.match(selector, /backgroundMode: preferredEndpointBackgroundMode\(endpoint\)/,
  'The first image request must prefer an advertised transparent or auto background value.');
assert.match(selector, /cacheSource: 'discovery'/);

const compatibilityClassifier = section(
  'function isDefiniteImageRouteCompatibilityError',
  'async function generateOpenRouterEmoticonPose',
);
assert.match(compatibilityClassifier, /status !== 400 && status !== 404 && status !== 409 && status !== 422/);
assert.match(compatibilityClassifier, /model\|provider\|endpoint\|routing\|route/);
assert.doesNotMatch(compatibilityClassifier, /408|429|timeout|network/i);
assert.match(compatibilityClassifier, /resolveCompatibleImageBackgroundMode/);
assert.match(compatibilityClassifier, /currentMode === 'transparent'/);
assert.match(compatibilityClassifier, /currentMode === 'auto'/);

const requestBody = section('async function requestImage', 'function isDefiniteImageRouteCompatibilityError');
const optionalBody = section("if (params.optionLevel === 'full')", '    const logicalOperationId');
assert.match(requestBody, /backgroundMode: ImageBackgroundMode/);
assert.match(optionalBody, /params\.backgroundMode !== 'omit'/);
assert.doesNotMatch(
  optionalBody,
  /\}\s*else\s*\{/,
  'The required compatibility request must not retain optional image parameters.',
);

const compatibilityRecovery = section(
  'const accounted = await runWithOpenRouterUsageContext',
  '    const payload = accounted.payload',
);
assert.match(compatibilityRecovery, /params\.maxRequestAttempts === 1/);
assert.match(compatibilityRecovery, /resolveCompatibleImageBackgroundMode/);
assert.match(compatibilityRecovery, /backgroundMode: 'omit'/);
assert.match(compatibilityRecovery, /optionLevel: 'required'/);
assert.match(compatibilityRecovery, /bypassRouteCache: true, forceDiscovery: true/);
assert.equal(
  (compatibilityRecovery.match(/return await requestSelectedRoute\(selected\)/g) || []).length,
  2,
  'The compatibility path must contain exactly one initial request and one safe retry.',
);
assert.match(compatibilityRecovery, /Accepted, timed-out/);
assert.match(compatibilityRecovery, /408, and 429 requests are never replayed/);

assert.ok(
  source.indexOf('await validateGeneratedImageResult(image)')
    < source.indexOf('persistSelectedImageRoute(selected)'),
  'Only a route whose returned bytes fully decode may enter the shared cache.',
);
const payloadValidation = section('const payload = accounted.payload', 'if (routeCacheEligible)');
assert.match(payloadValidation, /await validateGeneratedImageResult\(image\)/);
assert.match(payloadValidation, /catch \(error\)[\s\S]{0,260}?await invalidateSelectedImageRoute\(selected\)[\s\S]{0,120}?throw error/);
assert.doesNotMatch(payloadValidation, /requestSelectedRoute/, 'A paid malformed image response must never be replayed.');

assert.equal(runtime.endpointImageCost({
  supported_parameters: ['input_references'],
  pricing: [
    { billable: 'output_image', unit: 'image', cost_usd: 0.04 },
    { billable: 'input_reference', unit: 'image', cost_usd: 0.01 },
  ],
}, 3), 0.07);

await assert.rejects(
  () => runtime.validateGeneratedImageResult({
    buffer: Buffer.from('not-an-image'),
    contentType: 'image/png',
  }),
  /could not be decoded safely/,
  'Corrupt provider bytes must fail before route-cache persistence.',
);

const backgroundError = Object.assign(new Error(
  'background "transparent" not supported. Accepted: auto, opaque',
), { status: 400 });
assert.equal(
  runtime.resolveCompatibleImageBackgroundMode(backgroundError, 'transparent'),
  'auto',
  'A provider that explicitly accepts auto must keep the full quality profile and switch only the background value.',
);
const unsupportedBackgroundError = Object.assign(new Error(
  'background parameter is not supported',
), { status: 422 });
assert.equal(
  runtime.resolveCompatibleImageBackgroundMode(unsupportedBackgroundError, 'transparent'),
  'omit',
  'A route that rejects the background parameter must omit it on the one safe retry.',
);
assert.equal(
  runtime.resolveCompatibleImageBackgroundMode(Object.assign(new Error('rate limited'), { status: 429 }), 'transparent'),
  null,
  '429 responses must never enable an automatic image replay.',
);
assert.equal(
  runtime.isDefiniteImageRouteCompatibilityError(Object.assign(new Error('image_not_found'), { status: 404 })),
  false,
  'A generic missing-image 404 must not be misclassified as a provider-route incompatibility.',
);
assert.equal(
  runtime.isDefiniteImageRouteCompatibilityError(Object.assign(new Error(
    'No provider for openai/gpt-image-2 supports background transparent. Accepted: auto, opaque',
  ), { status: 404 })),
  true,
  'A provider capability 404 must remain recoverable by route selection.',
);

const opaqueProviderResult = await sharp({
  create: {
    width: 360,
    height: 360,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
}).composite([{
  input: await sharp({
    create: {
      width: 120,
      height: 180,
      channels: 4,
      background: { r: 35, g: 55, b: 95, alpha: 1 },
    },
  }).png().toBuffer(),
  left: 120,
  top: 90,
}]).png().toBuffer();
const normalizedOpaqueProviderResult = await rendererRuntime.normalizeGeneratedEmoticonPose(
  opaqueProviderResult,
);
const normalizedOpaqueInspection = await rendererRuntime.inspectEmoticonAlphaIsolation(
  normalizedOpaqueProviderResult,
);
assert.equal(
  normalizedOpaqueInspection.passed,
  true,
  'An opaque flat provider background must be removed locally and pass the same alpha gate before delivery.',
);
await assert.rejects(
  () => runtime.validateGeneratedImageResult({
    buffer: Buffer.from('plain text'),
    contentType: 'text/plain',
  }),
  /non-image result/,
  'A forged non-image MIME type must fail before route-cache persistence.',
);

console.log('Emoticon OpenRouter cross-instance image route cache safety verified.');
