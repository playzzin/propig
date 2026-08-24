"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectEmoticonAnimationInputReferences = selectEmoticonAnimationInputReferences;
exports.endpointImageCost = endpointImageCost;
exports.scoreImageModelForEmoticons = scoreImageModelForEmoticons;
exports.validateGeneratedImageResult = validateGeneratedImageResult;
exports.isDefiniteImageRouteCompatibilityError = isDefiniteImageRouteCompatibilityError;
exports.resolveCompatibleImageBackgroundMode = resolveCompatibleImageBackgroundMode;
exports.generateEmoticonPose = generateEmoticonPose;
exports.generateEmoticonSpriteSheet = generateEmoticonSpriteSheet;
exports.generateEmoticonAnimationFrame = generateEmoticonAnimationFrame;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const zod_1 = require("zod");
const openrouterUsage_1 = require("../openrouterUsage");
const firestore_2 = require("../firestore");
const qualityStandards_1 = require("./qualityStandards");
const modelPolicy_1 = require("./modelPolicy");
const imageGenerationProvider_1 = require("./imageGenerationProvider");
const mockImageProvider_1 = require("./mockImageProvider");
const openRouterImageProvider_1 = require("./openRouterImageProvider");
// sharp's CommonJS export is the callable itself. A default import compiles to
// require('sharp').default without esModuleInterop and fails at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
const MAX_IMAGE_INPUT_REFERENCES = 4;
/**
 * OpenRouter image models used by the studio accept at most four image
 * references. Put the phase-appropriate canonical pose immediately after the
 * source identity so the image model sees an unambiguous left/right target;
 * the opposite pose remains comparison evidence rather than a pose to average.
 */
function selectEmoticonAnimationInputReferences(params) {
    var _a;
    const entries = [];
    const seen = new Set();
    const maxReferences = Math.max(1, Math.min(MAX_IMAGE_INPUT_REFERENCES, Math.round(params.maxReferences || MAX_IMAGE_INPUT_REFERENCES)));
    const add = (url, role) => {
        const normalized = url === null || url === void 0 ? void 0 : url.trim();
        if (!normalized || seen.has(normalized) || entries.length >= maxReferences)
            return;
        seen.add(normalized);
        entries.push({ url: normalized, role });
    };
    add(params.sourceImageUrl, 'primary source identity');
    // The accepted key pose and identity sheet must precede chronological
    // neighbours. Image-edit providers otherwise tend to copy the immediately
    // previous body pose instead of following the new frame direction.
    if (params.maxReferences !== undefined && maxReferences <= 3) {
        if (params.preferAlternatePose && params.alternateCanonicalPoseUrl) {
            add(params.alternateCanonicalPoseUrl, 'target-side motion guide for this phase; use pose direction only and never mirror asymmetric identity traits');
        }
        else {
            add(params.canonicalPoseUrl, 'target-side motion guide for this phase and approved render style');
        }
        // With a three-reference budget, identity evidence is more valuable
        // than an opposite pose that can pull asymmetric traits in two
        // directions. Neighbour frames are still reserved for repair calls.
        const identityEvidenceUrl = params.identityReferenceUrl || ((_a = params.additionalReferenceUrls) === null || _a === void 0 ? void 0 : _a[0]);
        add(identityEvidenceUrl, params.identityReferenceUrl
            ? 'canonical multi-view identity sheet'
            : 'supplemental user-provided identity reference');
        add(params.preferAlternatePose ? params.canonicalPoseUrl : params.alternateCanonicalPoseUrl, 'opposite-side comparison guide; never copy asymmetric identity traits');
    }
    else if (params.preferAlternatePose && params.alternateCanonicalPoseUrl) {
        add(params.alternateCanonicalPoseUrl, 'target-side motion guide for this phase; use pose direction only and never mirror asymmetric identity traits');
        add(params.canonicalPoseUrl, 'opposite-side comparison guide and approved render style; do not copy its limb direction');
    }
    else {
        add(params.canonicalPoseUrl, 'target-side motion guide for this phase and approved render style');
        add(params.alternateCanonicalPoseUrl, 'opposite-side comparison guide; use pose direction only and never mirror asymmetric identity traits');
    }
    if (maxReferences > 3)
        add(params.identityReferenceUrl, 'canonical multi-view identity sheet');
    add(params.previousFrameUrl, 'previous chronological frame for continuity only; ignore its pose');
    add(params.nextFrameUrl, 'next chronological frame for continuity only; ignore its pose');
    for (const referenceUrl of params.additionalReferenceUrls || []) {
        add(referenceUrl, 'supplemental identity reference');
    }
    if (!entries.length)
        throw new Error('An animation frame requires a primary source reference.');
    return {
        urls: entries.map((entry) => entry.url),
        roleSummary: `Input reference order: ${entries
            .map((entry, index) => `${index + 1} ${entry.role}`)
            .join('; ')}.`,
    };
}
const IMAGE_MODEL_CACHE_MS = 15 * 60 * 1000;
const IMAGE_ROUTE_SHARED_CACHE_MS = 12 * 60 * 1000;
const IMAGE_ROUTE_SHARED_CACHE_MAX_FUTURE_MS = 15 * 60 * 1000;
const IMAGE_ROUTE_SHARED_CACHE_COLLECTION = 'emoticonStudioOpenRouterRouteCache';
const IMAGE_ROUTE_HEALTH_COLLECTION = 'emoticonStudioOpenRouterRouteHealth';
const IMAGE_ROUTE_SHARED_CACHE_VERSION = 1;
const IMAGE_ROUTE_POLICY_VERSION = 4;
const IMAGE_ROUTE_TIMEOUT_QUARANTINE_MS = 6 * 60 * 60 * 1000;
const MODEL_DISCOVERY_TIMEOUT_MS = 30 * 1000;
// Image edits with several references regularly need more than three minutes.
// Keep the request bounded, but leave enough room for a legitimate provider
// response before declaring the billable request ambiguous.
const IMAGE_GENERATION_TIMEOUT_MS = 4 * 60 * 1000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 45 * 1000;
const MAX_IMAGE_RESULT_BYTES = 30 * 1024 * 1024;
const MAX_GENERATED_IMAGE_PIXELS = 64 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_COST_USD = 0.35;
const PREFERRED_MODELS = [
    'openai/gpt-5-image',
    'openai/gpt-image-2',
    'openai/gpt-image-1',
    'google/gemini-3.1-flash-image',
    'google/gemini-2.5-flash-image',
];
let modelCache = null;
const endpointCache = new Map();
function positiveCostOverride(raw, fallback) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 10
        ? Math.round(parsed * 10000) / 10000
        : fallback;
}
function supports(model, parameter) {
    if (Array.isArray(model.supported_parameters)) {
        return model.supported_parameters.includes(parameter);
    }
    return Boolean(model.supported_parameters && parameter in model.supported_parameters);
}
function endpointSupports(endpoint, parameter) {
    const supported = endpoint.supported_parameters;
    if (Array.isArray(supported))
        return supported.includes(parameter);
    return Boolean(supported && parameter in supported);
}
function endpointParameterValues(endpoint, parameter) {
    var _a;
    const supported = endpoint.supported_parameters;
    if (!supported || Array.isArray(supported))
        return [];
    const descriptor = supported[parameter];
    const rawValues = Array.isArray(descriptor)
        ? descriptor
        : descriptor && typeof descriptor === 'object'
            ? (_a = descriptor.values) !== null && _a !== void 0 ? _a : descriptor.enum
            : [];
    return Array.isArray(rawValues)
        ? rawValues.filter((value) => typeof value === 'string')
            .map((value) => value.trim().toLowerCase())
        : [];
}
function preferredEndpointBackgroundMode(endpoint) {
    if (!endpointSupports(endpoint, 'background'))
        return 'omit';
    const values = endpointParameterValues(endpoint, 'background');
    if (!values.length || values.includes('transparent'))
        return 'transparent';
    if (values.includes('auto'))
        return 'auto';
    return 'omit';
}
const IMAGE_BILLABLES = new Set(['input_reference', 'input_image', 'output_image']);
const IMAGE_PRICING_UNITS = new Set(['image', 'megapixel', 'token']);
const CONSERVATIVE_INPUT_REFERENCE_MEGAPIXELS = (2048 * 2048) / 1000000;
const OUTPUT_IMAGE_MEGAPIXELS = (1024 * 1024) / 1000000;
// OpenRouter's dedicated Image API now exposes several image endpoints with
// token-based image billing. Reserve an intentionally high 8K token envelope
// for the 1K output and for each reference so route selection remains
// fail-closed even though the discovery response does not publish token counts.
const CONSERVATIVE_OUTPUT_IMAGE_TOKENS = 8192;
const CONSERVATIVE_INPUT_REFERENCE_TOKENS = 8192;
/**
 * Calculates a conservative one-output request estimate from endpoint pricing.
 * Input-reference and input-image charges are additive. Pricing variants are
 * alternatives, so the most expensive variant in each billable/unit group is
 * used. Token-priced image rows use conservative 8K-token envelopes. Unknown
 * or malformed relevant pricing fails closed with null.
 */
function endpointImageCost(endpoint, inputReferenceCount, outputMegapixels = OUTPUT_IMAGE_MEGAPIXELS, inputReferenceMegapixels = CONSERVATIVE_INPUT_REFERENCE_MEGAPIXELS, outputImageTokens = CONSERVATIVE_OUTPUT_IMAGE_TOKENS, inputReferenceTokens = CONSERVATIVE_INPUT_REFERENCE_TOKENS) {
    var _a, _b;
    const prices = endpoint.pricing || [];
    const relevant = prices.filter((price) => IMAGE_BILLABLES.has(price.billable || ''));
    if (!relevant.length || !relevant.some((price) => price.billable === 'output_image'))
        return null;
    const groupedMaximums = new Map();
    for (const price of relevant) {
        const billable = price.billable || '';
        const unit = ((_a = price.unit) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase()) || '';
        const cost = Number(price.cost_usd);
        if (!IMAGE_PRICING_UNITS.has(unit) || !Number.isFinite(cost) || cost < 0)
            return null;
        // Rows with different price.variant values are mutually exclusive
        // resolution/quality tiers; retaining the maximum is fail-safe.
        const key = `${billable}:${unit}`;
        groupedMaximums.set(key, Math.max((_b = groupedMaximums.get(key)) !== null && _b !== void 0 ? _b : 0, cost));
    }
    const referenceCount = Math.max(1, Math.min(MAX_IMAGE_INPUT_REFERENCES, inputReferenceCount));
    const safeOutputMegapixels = Number.isFinite(outputMegapixels) && outputMegapixels > 0
        ? outputMegapixels
        : OUTPUT_IMAGE_MEGAPIXELS;
    const safeInputMegapixels = Number.isFinite(inputReferenceMegapixels)
        && inputReferenceMegapixels > 0
        ? inputReferenceMegapixels
        : CONSERVATIVE_INPUT_REFERENCE_MEGAPIXELS;
    const safeOutputTokens = Number.isFinite(outputImageTokens) && outputImageTokens > 0
        ? Math.ceil(outputImageTokens)
        : CONSERVATIVE_OUTPUT_IMAGE_TOKENS;
    const safeInputTokens = Number.isFinite(inputReferenceTokens) && inputReferenceTokens > 0
        ? Math.ceil(inputReferenceTokens)
        : CONSERVATIVE_INPUT_REFERENCE_TOKENS;
    let total = 0;
    for (const [key, cost] of groupedMaximums) {
        const [billable, unit] = key.split(':');
        const output = billable === 'output_image';
        const itemCount = output ? 1 : referenceCount;
        const megapixels = output ? safeOutputMegapixels : safeInputMegapixels;
        const tokens = output ? safeOutputTokens : safeInputTokens;
        const unitQuantity = unit === 'megapixel'
            ? megapixels
            : unit === 'token'
                ? tokens
                : 1;
        total += cost * itemCount * unitQuantity;
    }
    return Number.isFinite(total) ? Math.round(total * 1000000) / 1000000 : null;
}
function scoreImageModelForEmoticons(model, configuredModel) {
    const preferredIndex = PREFERRED_MODELS.indexOf(model.id);
    return (model.id === configuredModel ? 2000 : 0)
        + (preferredIndex >= 0 ? 1000 - preferredIndex * 25 : 0)
        + (supports(model, 'input_references') ? 300 : 0)
        + (supports(model, 'background') ? 250 : 0)
        + (supports(model, 'quality') ? 160 : 0)
        + (supports(model, 'seed') ? 120 : 0)
        + (supports(model, 'output_format') ? 90 : 0)
        + (supports(model, 'aspect_ratio') || supports(model, 'size') || supports(model, 'resolution') ? 60 : 0)
        + (supports(model, 'n') ? 10 : 0);
}
async function discoverImageModels(apiKey, forceRefresh = false) {
    if (!forceRefresh && modelCache && modelCache.expiresAt > Date.now())
        return modelCache.models;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_DISCOVERY_TIMEOUT_MS);
    const response = await fetch('https://openrouter.ai/api/v1/images/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok)
        throw new Error(`OpenRouter image model discovery failed (${response.status}).`);
    const payload = await response.json();
    const models = Array.isArray(payload.data) ? payload.data.filter((model) => Boolean(model === null || model === void 0 ? void 0 : model.id)) : [];
    if (!models.length)
        throw new Error('OpenRouter returned no image models.');
    modelCache = { models, expiresAt: Date.now() + IMAGE_MODEL_CACHE_MS };
    return models;
}
async function discoverImageModelEndpoints(apiKey, model, forceRefresh = false) {
    var _a;
    const cached = endpointCache.get(model.id);
    if (!forceRefresh && cached && cached.expiresAt > Date.now())
        return cached.endpoints;
    const endpointPath = ((_a = model.endpoints) === null || _a === void 0 ? void 0 : _a.startsWith('/api/'))
        ? model.endpoints
        : `/api/v1/images/models/${model.id}/endpoints`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_DISCOVERY_TIMEOUT_MS);
    const response = await fetch(`https://openrouter.ai${endpointPath}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) {
        throw new Error(`OpenRouter image endpoint discovery failed (${response.status}).`);
    }
    const payload = await response.json();
    const endpoints = Array.isArray(payload.endpoints) ? payload.endpoints : [];
    endpointCache.set(model.id, { endpoints, expiresAt: Date.now() + IMAGE_MODEL_CACHE_MS });
    return endpoints;
}
const cachedCapabilitySchema = zod_1.z.string().trim().min(1).max(160);
const cachedPricingSchema = zod_1.z.object({
    billable: zod_1.z.enum(['input_reference', 'input_image', 'output_image']),
    cost_usd: zod_1.z.number().finite().nonnegative().max(10),
    unit: zod_1.z.enum(['image', 'megapixel', 'token']),
    variant: zod_1.z.string().trim().min(1).max(160).nullable(),
}).strict();
const firestoreTimestampSchema = zod_1.z.custom((value) => (typeof value === 'object'
    && value !== null
    && typeof value.toMillis === 'function'));
const cachedImageRouteSchema = zod_1.z.object({
    version: zod_1.z.literal(IMAGE_ROUTE_SHARED_CACHE_VERSION),
    policyVersion: zod_1.z.literal(IMAGE_ROUTE_POLICY_VERSION),
    configuredModelKey: zod_1.z.string().trim().min(1).max(400),
    inputReferenceCount: zod_1.z.number().int().min(1).max(MAX_IMAGE_INPUT_REFERENCES),
    maxImageCostUsd: zod_1.z.number().finite().positive().max(10),
    estimatedImageCostUsd: zod_1.z.number().finite().nonnegative().max(10),
    resourceMode: zod_1.z.enum(['efficient', 'balanced', 'premium']),
    routingPolicy: zod_1.z.enum(['quality-tier-price-first-v2', 'quality-first-v1']),
    backgroundMode: zod_1.z.enum(['transparent', 'auto', 'omit']),
    optionLevel: zod_1.z.enum(['full', 'required']),
    modelPolicyScore: zod_1.z.number().finite().int(),
    model: zod_1.z.object({
        id: zod_1.z.string().trim().min(1).max(400),
        inputModalities: zod_1.z.array(cachedCapabilitySchema).max(16),
        outputModalities: zod_1.z.array(cachedCapabilitySchema).max(16),
        supportedParameters: zod_1.z.array(cachedCapabilitySchema).max(128),
    }).strict(),
    endpoint: zod_1.z.object({
        providerTag: zod_1.z.string().trim().min(1).max(160),
        providerSlug: zod_1.z.string().trim().min(1).max(160).nullable(),
        supportedParameters: zod_1.z.array(cachedCapabilitySchema).max(128),
        allowedPassthroughParameters: zod_1.z.array(cachedCapabilitySchema).max(128),
        pricing: zod_1.z.array(cachedPricingSchema).min(1).max(64),
    }).strict(),
    expiresAt: firestoreTimestampSchema,
}).strict();
const selectedRouteCache = new Map();
function normalizedCapabilities(value) {
    const capabilities = Array.isArray(value) ? value : Object.keys(value || {});
    return [...new Set(capabilities
            .filter((capability) => typeof capability === 'string')
            .map((capability) => capability.trim())
            .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
}
function normalizedModalities(value) {
    return [...new Set((value || [])
            .filter((modality) => typeof modality === 'string')
            .map((modality) => modality.trim())
            .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
}
function cacheablePricing(endpoint) {
    var _a, _b, _c;
    const result = [];
    for (const price of endpoint.pricing || []) {
        const billable = (_a = price.billable) === null || _a === void 0 ? void 0 : _a.trim();
        const unit = (_b = price.unit) === null || _b === void 0 ? void 0 : _b.trim().toLowerCase();
        const cost = Number(price.cost_usd);
        if (!IMAGE_BILLABLES.has(billable || '')
            || !IMAGE_PRICING_UNITS.has(unit || '')
            || !Number.isFinite(cost)
            || cost < 0)
            continue;
        result.push({
            billable: billable,
            cost_usd: cost,
            unit: unit,
            variant: ((_c = price.variant) === null || _c === void 0 ? void 0 : _c.trim()) || null,
        });
    }
    return result;
}
function buildImageRouteCacheContext(params) {
    var _a;
    const configuredModel = ((_a = params.configuredModel) === null || _a === void 0 ? void 0 : _a.trim()) || undefined;
    const inputReferenceCount = Math.max(1, Math.min(MAX_IMAGE_INPUT_REFERENCES, Math.round(params.inputReferenceCount)));
    const configuredModelKey = configuredModel
        ? `configured:${configuredModel}`
        : 'preferred-model-list:v1';
    const routingPolicy = params.resourceMode === 'efficient'
        ? 'quality-tier-price-first-v2'
        : 'quality-first-v1';
    const identity = JSON.stringify({
        version: IMAGE_ROUTE_SHARED_CACHE_VERSION,
        policyVersion: IMAGE_ROUTE_POLICY_VERSION,
        configuredModelKey,
        inputReferenceCount,
        maxImageCostUsd: params.maxImageCostUsd.toFixed(4),
        resourceMode: params.resourceMode,
        routingPolicy,
    });
    return {
        cacheKey: `route_${(0, node_crypto_1.createHash)('sha256').update(identity).digest('hex')}`,
        configuredModel,
        configuredModelKey,
        inputReferenceCount,
        maxImageCostUsd: params.maxImageCostUsd,
        resourceMode: params.resourceMode,
        routingPolicy,
    };
}
function buildCachedImageRouteDocument(route, context, nowMs) {
    var _a, _b, _c, _d;
    const candidate = {
        version: IMAGE_ROUTE_SHARED_CACHE_VERSION,
        policyVersion: IMAGE_ROUTE_POLICY_VERSION,
        configuredModelKey: context.configuredModelKey,
        inputReferenceCount: context.inputReferenceCount,
        maxImageCostUsd: context.maxImageCostUsd,
        estimatedImageCostUsd: route.estimatedImageCostUsd,
        resourceMode: context.resourceMode,
        routingPolicy: context.routingPolicy,
        backgroundMode: route.backgroundMode,
        optionLevel: route.optionLevel,
        modelPolicyScore: scoreImageModelForEmoticons(route.model, context.configuredModel),
        model: {
            id: route.model.id.trim(),
            inputModalities: normalizedModalities((_a = route.model.architecture) === null || _a === void 0 ? void 0 : _a.input_modalities),
            outputModalities: normalizedModalities((_b = route.model.architecture) === null || _b === void 0 ? void 0 : _b.output_modalities),
            supportedParameters: normalizedCapabilities(route.model.supported_parameters),
        },
        endpoint: {
            providerTag: ((_c = route.endpoint.provider_tag) === null || _c === void 0 ? void 0 : _c.trim()) || '',
            providerSlug: ((_d = route.endpoint.provider_slug) === null || _d === void 0 ? void 0 : _d.trim()) || null,
            supportedParameters: normalizedCapabilities(route.endpoint.supported_parameters),
            allowedPassthroughParameters: normalizedCapabilities(route.endpoint.allowed_passthrough_parameters),
            pricing: cacheablePricing(route.endpoint),
        },
        expiresAt: firestore_1.Timestamp.fromMillis(nowMs + IMAGE_ROUTE_SHARED_CACHE_MS),
    };
    const parsed = cachedImageRouteSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
}
function selectedRouteFromCachedDocument(params) {
    var _a, _b, _c, _d;
    const parsed = cachedImageRouteSchema.safeParse(params.raw);
    if (!parsed.success)
        return null;
    const cached = parsed.data;
    let expiresAtMs;
    try {
        expiresAtMs = cached.expiresAt.toMillis();
    }
    catch (_e) {
        return null;
    }
    if (!Number.isFinite(expiresAtMs)
        || expiresAtMs <= params.nowMs
        || expiresAtMs > params.nowMs + IMAGE_ROUTE_SHARED_CACHE_MAX_FUTURE_MS
        || cached.configuredModelKey !== params.context.configuredModelKey
        || cached.inputReferenceCount !== params.context.inputReferenceCount
        || Math.abs(cached.maxImageCostUsd - params.context.maxImageCostUsd) > 0.000001
        || cached.resourceMode !== params.context.resourceMode
        || cached.routingPolicy !== params.context.routingPolicy
        || (params.context.resourceMode === 'efficient'
            && params.context.configuredModel === modelPolicy_1.EMOTICON_LIGHT_IMAGE_MODEL
            && cached.model.id !== modelPolicy_1.EMOTICON_LIGHT_IMAGE_MODEL))
        return null;
    const model = {
        id: cached.model.id,
        architecture: {
            input_modalities: cached.model.inputModalities,
            output_modalities: cached.model.outputModalities,
        },
        supported_parameters: cached.model.supportedParameters,
    };
    const endpoint = Object.assign(Object.assign({ provider_tag: cached.endpoint.providerTag }, (cached.endpoint.providerSlug ? { provider_slug: cached.endpoint.providerSlug } : {})), { supported_parameters: cached.endpoint.supportedParameters, allowed_passthrough_parameters: cached.endpoint.allowedPassthroughParameters, pricing: cached.endpoint.pricing.map((price) => (Object.assign({ billable: price.billable, cost_usd: price.cost_usd, unit: price.unit }, (price.variant ? { variant: price.variant } : {})))) });
    if (!((_b = (_a = model.architecture) === null || _a === void 0 ? void 0 : _a.input_modalities) === null || _b === void 0 ? void 0 : _b.includes('image'))
        || !((_c = model.architecture.output_modalities) === null || _c === void 0 ? void 0 : _c.includes('image'))
        || !supports(model, 'input_references')
        || !endpointSupports(endpoint, 'input_references')
        || !((_d = endpoint.provider_tag) === null || _d === void 0 ? void 0 : _d.trim())
        || cached.modelPolicyScore !== scoreImageModelForEmoticons(model, params.context.configuredModel))
        return null;
    const estimatedImageCostUsd = endpointImageCost(endpoint, params.context.inputReferenceCount);
    if (estimatedImageCostUsd === null
        || estimatedImageCostUsd > params.context.maxImageCostUsd
        || Math.abs(estimatedImageCostUsd - cached.estimatedImageCostUsd) > 0.000001)
        return null;
    return {
        model,
        endpoint,
        backgroundMode: cached.backgroundMode,
        optionLevel: cached.optionLevel,
        fallback: false,
        estimatedImageCostUsd,
        cacheKey: params.context.cacheKey,
        cacheSource: params.source,
        cacheContext: params.context,
    };
}
async function loadCachedImageRoute(context) {
    const nowMs = Date.now();
    const memoryDocument = selectedRouteCache.get(context.cacheKey);
    if (memoryDocument) {
        const memoryRoute = selectedRouteFromCachedDocument({
            raw: memoryDocument,
            context,
            source: 'memory',
            nowMs,
        });
        if (memoryRoute)
            return memoryRoute;
        selectedRouteCache.delete(context.cacheKey);
    }
    try {
        const snapshot = await firestore_2.db.collection(IMAGE_ROUTE_SHARED_CACHE_COLLECTION)
            .doc(context.cacheKey)
            .get();
        if (!snapshot.exists)
            return null;
        const firestoreRoute = selectedRouteFromCachedDocument({
            raw: snapshot.data(),
            context,
            source: 'firestore',
            nowMs,
        });
        if (!firestoreRoute)
            return null;
        const parsed = cachedImageRouteSchema.safeParse(snapshot.data());
        if (parsed.success)
            selectedRouteCache.set(context.cacheKey, parsed.data);
        return firestoreRoute;
    }
    catch (error) {
        logger.warn('[EmoticonStudio] OpenRouter image route cache read failed; using live discovery.', {
            cacheKey: context.cacheKey,
            error: error instanceof Error ? error.message : 'unknown_error',
        });
        return null;
    }
}
async function persistSelectedImageRoute(route) {
    if (route.cacheSource !== 'discovery')
        return;
    const document = buildCachedImageRouteDocument(route, route.cacheContext, Date.now());
    if (!document) {
        logger.warn('[EmoticonStudio] Verified OpenRouter image route was not cacheable.');
        return;
    }
    selectedRouteCache.set(route.cacheKey, document);
    try {
        await firestore_2.db.collection(IMAGE_ROUTE_SHARED_CACHE_COLLECTION)
            .doc(route.cacheKey)
            .set(document);
    }
    catch (error) {
        logger.warn('[EmoticonStudio] OpenRouter image route cache write failed; memory cache remains active.', {
            cacheKey: route.cacheKey,
            error: error instanceof Error ? error.message : 'unknown_error',
        });
    }
}
async function invalidateSelectedImageRoute(route) {
    selectedRouteCache.delete(route.cacheKey);
    modelCache = null;
    endpointCache.delete(route.model.id);
    try {
        await firestore_2.db.collection(IMAGE_ROUTE_SHARED_CACHE_COLLECTION)
            .doc(route.cacheKey)
            .delete();
    }
    catch (error) {
        logger.warn('[EmoticonStudio] Stale OpenRouter image route cache deletion failed.', {
            cacheKey: route.cacheKey,
            error: error instanceof Error ? error.message : 'unknown_error',
        });
    }
}
function routeHealthField(providerTag) {
    return `provider_${(0, node_crypto_1.createHash)('sha256').update(providerTag).digest('hex').slice(0, 24)}`;
}
async function loadQuarantinedProviderTags(cacheKey) {
    try {
        const snapshot = await firestore_2.db.collection(IMAGE_ROUTE_HEALTH_COLLECTION).doc(cacheKey).get();
        const nowMs = Date.now();
        return new Set(Object.values(snapshot.data() || {}).flatMap((entry) => {
            if (!entry || typeof entry !== 'object')
                return [];
            const candidate = entry;
            return typeof candidate.providerTag === 'string'
                && typeof candidate.expiresAtMs === 'number'
                && candidate.expiresAtMs > nowMs
                ? [candidate.providerTag]
                : [];
        }));
    }
    catch (error) {
        logger.warn('[EmoticonStudio] Image route health lookup failed; continuing with verified routes.', {
            cacheKey,
            error: error instanceof Error ? error.message : 'unknown_error',
        });
        return new Set();
    }
}
async function quarantineTimedOutImageRoute(route) {
    var _a;
    const providerTag = (_a = route.endpoint.provider_tag) === null || _a === void 0 ? void 0 : _a.trim();
    if (!providerTag)
        return;
    await invalidateSelectedImageRoute(route);
    const nowMs = Date.now();
    try {
        await firestore_2.db.collection(IMAGE_ROUTE_HEALTH_COLLECTION).doc(route.cacheKey).set({
            [routeHealthField(providerTag)]: {
                providerTag,
                expiresAtMs: nowMs + IMAGE_ROUTE_TIMEOUT_QUARANTINE_MS,
                reason: 'request_timeout',
                updatedAtMs: nowMs,
            },
        }, { merge: true });
    }
    catch (error) {
        logger.warn('[EmoticonStudio] Timed-out image route could not be quarantined persistently.', {
            cacheKey: route.cacheKey,
            providerTag,
            error: error instanceof Error ? error.message : 'unknown_error',
        });
    }
}
async function selectImageModel(apiKey, preferredModel, inputReferenceCount = 1, resourceMode = 'premium', options = {}) {
    var _a, _b;
    const maxImageCostUsd = positiveCostOverride(process.env.EMOTICON_STUDIO_MAX_IMAGE_COST_USD, DEFAULT_MAX_IMAGE_COST_USD);
    const configuredModel = (preferredModel === null || preferredModel === void 0 ? void 0 : preferredModel.trim()) || ((_a = process.env.OPENROUTER_IMAGE_MODEL) === null || _a === void 0 ? void 0 : _a.trim());
    const cacheContext = buildImageRouteCacheContext({
        configuredModel,
        inputReferenceCount,
        maxImageCostUsd,
        resourceMode,
    });
    if (!options.bypassRouteCache && !options.forceDiscovery) {
        const cachedRoute = await loadCachedImageRoute(cacheContext);
        if (cachedRoute) {
            const quarantined = await loadQuarantinedProviderTags(cacheContext.cacheKey);
            if (!quarantined.has(((_b = cachedRoute.endpoint.provider_tag) === null || _b === void 0 ? void 0 : _b.trim()) || ''))
                return cachedRoute;
            await invalidateSelectedImageRoute(cachedRoute);
        }
    }
    const quarantinedProviderTags = await loadQuarantinedProviderTags(cacheContext.cacheKey);
    const models = await discoverImageModels(apiKey, options.forceDiscovery);
    const compatible = models
        .filter((model) => {
        var _a, _b, _c, _d;
        return (((_b = (_a = model.architecture) === null || _a === void 0 ? void 0 : _a.input_modalities) === null || _b === void 0 ? void 0 : _b.includes('image'))
            && ((_d = (_c = model.architecture) === null || _c === void 0 ? void 0 : _c.output_modalities) === null || _d === void 0 ? void 0 : _d.includes('image'))
            && supports(model, 'input_references'));
    })
        .sort((left, right) => (scoreImageModelForEmoticons(right, configuredModel)
        - scoreImageModelForEmoticons(left, configuredModel)
        || left.id.localeCompare(right.id)));
    const exactLightModel = resourceMode === 'efficient'
        && configuredModel === modelPolicy_1.EMOTICON_LIGHT_IMAGE_MODEL;
    const candidates = exactLightModel
        ? compatible.filter((model) => model.id === modelPolicy_1.EMOTICON_LIGHT_IMAGE_MODEL)
        : compatible;
    if (!candidates.length) {
        if (exactLightModel) {
            throw new Error('GPT Light image generation is temporarily unavailable because '
                + `${modelPolicy_1.EMOTICON_LIGHT_IMAGE_MODEL} has no verified input-reference route.`);
        }
        throw new Error('OpenRouter returned no image model with verified input-reference support.');
    }
    for (const model of candidates.slice(0, 8)) {
        const endpoints = await discoverImageModelEndpoints(apiKey, model, options.forceDiscovery);
        const compatibleEndpoints = endpoints
            .filter((endpoint) => endpointSupports(endpoint, 'input_references'))
            // provider_tag is the only documented value safe to pass to
            // provider.only. provider_slug remains diagnostic metadata only.
            .filter((endpoint) => { var _a; return Boolean((_a = endpoint.provider_tag) === null || _a === void 0 ? void 0 : _a.trim()); })
            .filter((endpoint) => { var _a; return !quarantinedProviderTags.has(((_a = endpoint.provider_tag) === null || _a === void 0 ? void 0 : _a.trim()) || ''); })
            .filter((endpoint) => {
            const cost = endpointImageCost(endpoint, inputReferenceCount);
            return cost !== null && cost <= maxImageCostUsd;
        })
            .sort((left, right) => {
            var _a, _b;
            const leftCost = (_a = endpointImageCost(left, inputReferenceCount)) !== null && _a !== void 0 ? _a : maxImageCostUsd;
            const rightCost = (_b = endpointImageCost(right, inputReferenceCount)) !== null && _b !== void 0 ? _b : maxImageCostUsd;
            const coreQualityTier = (endpoint) => ((endpointSupports(endpoint, 'background') ? 2 : 0)
                + (endpointSupports(endpoint, 'seed') ? 1 : 0));
            const score = (endpoint) => {
                var _a;
                return ((endpointSupports(endpoint, 'background') ? 500 : 0)
                    + (endpointSupports(endpoint, 'output_format') ? 180 : 0)
                    + (endpointSupports(endpoint, 'quality') ? 100 : 0)
                    + (endpointSupports(endpoint, 'seed') ? 80 : 0)
                    - ((_a = endpointImageCost(endpoint, inputReferenceCount)) !== null && _a !== void 0 ? _a : maxImageCostUsd) * 100);
            };
            // GPT Light keeps its exact image model and first preserves
            // the two capabilities that prevent the most
            // background and cross-frame repair calls, then picks the
            // least expensive verified endpoint within that quality tier.
            if (resourceMode === 'efficient') {
                const coreTierDifference = coreQualityTier(right) - coreQualityTier(left);
                if (coreTierDifference !== 0)
                    return coreTierDifference;
                if (leftCost !== rightCost)
                    return leftCost - rightCost;
            }
            return score(right) - score(left);
        });
        const endpoint = compatibleEndpoints[0];
        const estimatedImageCostUsd = endpoint
            ? endpointImageCost(endpoint, inputReferenceCount)
            : null;
        if (endpoint && estimatedImageCostUsd !== null) {
            return {
                model,
                endpoint,
                backgroundMode: preferredEndpointBackgroundMode(endpoint),
                optionLevel: 'full',
                fallback: false,
                estimatedImageCostUsd,
                cacheKey: cacheContext.cacheKey,
                cacheSource: 'discovery',
                cacheContext,
            };
        }
    }
    throw new Error('OpenRouter endpoint discovery found no verified input-reference route with known pricing '
        + `at or below ${maxImageCostUsd.toFixed(4)} USD.`);
}
async function fetchImageBuffer(url) {
    var _a;
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedHost = (parsedUrl.protocol !== 'https:'
        || hostname === 'localhost'
        || hostname === '0.0.0.0'
        || hostname === '::1'
        || hostname.endsWith('.local')
        || /^127\./.test(hostname)
        || /^10\./.test(hostname)
        || /^192\.168\./.test(hostname)
        || /^169\.254\./.test(hostname)
        || /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname));
    if (blockedHost)
        throw new Error('Generated image URL is not a permitted public HTTPS address.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(parsedUrl, {
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok)
        throw new Error(`Generated image download failed (${response.status}).`);
    const contentType = ((_a = response.headers.get('content-type')) === null || _a === void 0 ? void 0 : _a.split(';')[0]) || 'image/png';
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!contentType.startsWith('image/'))
        throw new Error('OpenRouter returned a non-image result.');
    if (contentLength > MAX_IMAGE_RESULT_BYTES)
        throw new Error('Generated image exceeded the 30 MB safety limit.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_RESULT_BYTES)
        throw new Error('Generated image exceeded the 30 MB safety limit.');
    return { buffer, contentType };
}
async function validateGeneratedImageResult(image) {
    if (!image.contentType.startsWith('image/') || !image.buffer.byteLength) {
        throw new Error('OpenRouter returned a non-image result.');
    }
    try {
        const metadata = await sharp(image.buffer, {
            failOn: 'error',
            limitInputPixels: MAX_GENERATED_IMAGE_PIXELS,
        }).metadata();
        if (!metadata.width || !metadata.height) {
            throw new Error('missing_dimensions');
        }
        // Decode pixels, not only the container header, before allowing this
        // provider route into the shared cache.
        await sharp(image.buffer, {
            failOn: 'error',
            limitInputPixels: MAX_GENERATED_IMAGE_PIXELS,
        }).resize(1, 1, { fit: 'fill' }).raw().toBuffer();
    }
    catch (_a) {
        throw new Error('OpenRouter returned image bytes that could not be decoded safely.');
    }
}
function buildAnimationFrameDirection(params) {
    const { direction, frameCount, referenceOrder } = params;
    return [
        referenceOrder || '',
        `This is animation frame ${direction.frameIndex + 1} of ${frameCount}; phase: ${direction.phase}.`,
        `Exact body pose: ${direction.posePrompt}`,
        `Exact facial expression: ${direction.expressionPrompt}`,
        `Sequence continuity: ${direction.continuityPrompt}`,
        'POSE COMPLIANCE IS PRIMARY: place the left arm, right arm, left leg, right leg, hands, feet, torso, head, eyes, eyebrows, and mouth exactly as specified for this frame.',
        'All input images establish identity, outfit, proportions, palette, and render style. They do not authorize copying or averaging their body pose.',
        'Follow the actual role and order stated above for every reference. Only a reference explicitly labelled as a motion guide may influence left/right silhouette direction; identity sheets and chronological neighbours must never be treated as target poses.',
        'A chronological-neighbour image is continuity evidence only. Create a fresh target pose instead of making a tiny edit to that neighbour.',
        'At least one hand or foot must occupy a visibly different location from each neighbouring frame whenever the frame plan describes a new phase.',
        'When the target alternates sides, visibly lower the previously raised arm while raising the opposite arm; never keep the same arm raised and never replace a requested one-arm peak with both arms raised.',
        'FACIAL BEAT COMPLIANCE: render the exact eye or eyelid state, eyebrow angle, cheek tension, and mouth shape written for this frame. Do not copy one frozen face across the sequence; preparation, peak, and recovery must remain visibly different at emoticon thumbnail size.',
        'Keep the camera, character scale, canvas position, outfit, colors, proportions, facial identity, and line style locked.',
        'Keep every hand, foot, accessory, authorized interaction prop, and intentional motion accent structurally consistent; never create a detached prop, duplicated limb, second face, second body, undeclared fragment, or motion residue.',
        'Do not create apparent motion by shifting, zooming, rotating, or cropping one unchanged pose.',
    ].join(' ');
}
function requireOriginalUserInstruction(value) {
    const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 800);
    if (normalized.length < 2) {
        throw new Error('The original user instruction is required for image subject fidelity.');
    }
    return normalized;
}
function buildPrompt(params) {
    const { plan, correction, animationFrame } = params;
    const originalUserInstruction = requireOriginalUserInstruction(params.originalUserInstruction);
    const actionTemplate = (0, qualityStandards_1.getEmoticonActionTemplate)(plan);
    return [
        `AUTHORITATIVE ORIGINAL USER REQUEST: ${JSON.stringify(originalUserInstruction)}`,
        'MANDATORY SUBJECT FIDELITY: visibly communicate every requested action, emotion, expression, prop, direction, and ordered beat. Never replace the request with the neutral reference pose or a generic emoticon pose.',
        animationFrame
            ? 'FRAME-SPECIFIC TASK: create only the exact chronological pose and facial beat below. It overrides every generic or canonical pose description.'
            : plan.action.imagePrompt,
        animationFrame ? buildAnimationFrameDirection(animationFrame) : '',
        'Create exactly the same character identity as the reference image.',
        `Immutable traits: ${plan.characterProfile.immutableTraits.join('; ')}.`,
        `Style rules: ${plan.characterProfile.styleRules.join('; ')}.`,
        `Action: ${plan.action.action}. Emotion: ${plan.action.emotion}.`,
        `Authorized interaction props: ${plan.action.authorizedProps.length ? plan.action.authorizedProps.join('; ') : 'none'}.`,
        `Authorized compact motion accents: ${plan.action.motionAccents.length ? plan.action.motionAccents.join('; ') : 'none'}.`,
        `Action-specific animation rule: ${actionTemplate.frameGuidance}`,
        'Full body or complete intended pose fully visible, centered in a square canvas with generous safe margin.',
        'Exactly one isolated character only, with a clean unoccluded silhouette and genuine transparent alpha background.',
        'Keep all background pixels transparent. Do not generate scenery, floor, room, horizon, cast shadow, glow, ambient particles, texture, undeclared objects, duplicated limbs, a second face/body, or another character.',
        'The transparent area directly below and behind every foot must be completely empty RGBA transparency: no grey, beige, blue, or coloured oval, contact patch, floor mark, or grounding shadow may touch a shoe.',
        'An authorized prop may overlap only the intended gripping hand or body contact area. Nothing may cover the face or obscure the readable limb pose. Keep a clear safety margin around the complete character and authorized-prop silhouette.',
        `Do not include: ${plan.action.negativePrompt}; ${plan.characterProfile.negativeRules.join('; ')}.`,
        'No letters, no readable text, no speech bubble, no caption, no logo, no watermark, no scenery, no extra character.',
        !animationFrame
            ? 'This is one canonical key pose, not the whole timeline. For an alternating action, show exactly one readable side peak with one arm raised and the opposite arm lowered; never combine both temporal phases by raising both arms.'
            : '',
        correction ? `REPAIR PASS: create a fresh pose with a substantially clearer limb and facial change, not a small edit of the rejected frame. Reviewer correction: ${correction}` : '',
    ].filter(Boolean).join('\n');
}
function buildSpriteSheetPrompt(params) {
    const { plan, directions, layout } = params;
    const originalUserInstruction = requireOriginalUserInstruction(params.originalUserInstruction);
    const actionTemplate = (0, qualityStandards_1.getEmoticonActionTemplate)(plan);
    const cells = directions.map((direction, index) => [
        `Cell ${index + 1} (row ${Math.floor(index / layout.columns) + 1}, column ${(index % layout.columns) + 1})`,
        `phase=${direction.phase}`,
        `pose=${direction.posePrompt}`,
        `expression=${direction.expressionPrompt}`,
        `continuity=${direction.continuityPrompt}`,
    ].join(': '));
    return [
        `AUTHORITATIVE ORIGINAL USER REQUEST: ${JSON.stringify(originalUserInstruction)}`,
        'MANDATORY SUBJECT FIDELITY: the complete chronological sheet must visibly communicate every requested action, emotion, expression, prop, direction, and ordered beat. Never substitute a generic cycle or the neutral reference pose.',
        `SPRITE-SHEET ANIMATION TASK: draw exactly ${layout.frameCount} chronological full-body poses of one character in a strict ${layout.columns}-column by ${layout.rows}-row grid.`,
        'Read cells from left to right, then top to bottom. Every occupied cell is one distinct animation frame; do not merge phases or repeat one pose with only camera movement.',
        `Action: ${plan.action.action}. Emotion: ${plan.action.emotion}.`,
        `Immutable character traits: ${plan.characterProfile.immutableTraits.join('; ')}.`,
        `Style rules: ${plan.characterProfile.styleRules.join('; ')}.`,
        `Action-specific animation rule: ${actionTemplate.frameGuidance}`,
        `Authorized interaction props: ${plan.action.authorizedProps.length ? plan.action.authorizedProps.join('; ') : 'none'}.`,
        `Authorized compact motion accents: ${plan.action.motionAccents.length ? plan.action.motionAccents.join('; ') : 'none'}.`,
        'IDENTITY LOCK: every cell must depict exactly the same face, hair, outfit, body proportions, palette, line weight, and rendering style as the input character.',
        'MOTION REQUIREMENT: change the actual limb articulation, torso direction, weight distribution, and facial beat across the sequence. A translated, rotated, zoomed, mirrored, or shaken copy of one pose is invalid.',
        'GRID REQUIREMENT: equal-size cells, no borders or separator lines, one complete pose per cell, consistent character scale and camera, and at least 6% empty safety gutter inside every cell.',
        'BACKGROUND REQUIREMENT: fill every pixel behind every pose with one perfectly uniform pure chroma green #00FF00. No gradient, texture, shadow, floor, horizon, scenery, glow, or lighting variation in the green area.',
        'Keep the complete silhouette, hands, feet, authorized props, and motion accents inside its own cell. Never cross a cell boundary. No extra bodies, faces, limbs, fragments, contact shadows, captions, speech bubbles, letters, logos, or watermarks.',
        `Do not include: ${plan.action.negativePrompt}; ${plan.characterProfile.negativeRules.join('; ')}.`,
        'Exact chronological cell instructions:',
        ...cells,
    ].join('\n');
}
async function requestImage(params) {
    var _a, _b, _c, _d;
    const accepts = (parameter) => params.endpoint
        ? endpointSupports(params.endpoint, parameter)
        : !params.model.supported_parameters || supports(params.model, parameter);
    const providerTag = (_a = params.endpoint.provider_tag) === null || _a === void 0 ? void 0 : _a.trim();
    const providerSlug = (_b = params.endpoint.provider_slug) === null || _b === void 0 ? void 0 : _b.trim();
    const body = {
        model: params.model.id,
        prompt: params.prompt,
        input_references: params.referenceImageUrls.slice(0, MAX_IMAGE_INPUT_REFERENCES).map((url) => ({
            type: 'image_url',
            image_url: { url },
        })),
        provider: Object.assign(Object.assign({}, (providerTag ? { only: [providerTag] } : {})), { sort: 'price', allow_fallbacks: false }),
    };
    if (params.optionLevel === 'full') {
        if (accepts('n'))
            body.n = 1;
        if (accepts('aspect_ratio'))
            body.aspect_ratio = params.aspectRatio || '1:1';
        // Route pricing is reserved against a one-megapixel output. Keep the
        // size fallback within that envelope; providers that support the
        // aspect_ratio parameter may still choose a landscape 1K canvas.
        else if (accepts('size'))
            body.size = '1024x1024';
        else if (accepts('resolution'))
            body.resolution = '1K';
        if (accepts('output_format'))
            body.output_format = 'png';
        if (accepts('background') && params.backgroundMode !== 'omit') {
            body.background = params.backgroundMode;
        }
        if (accepts('quality'))
            body.quality = 'high';
        if (accepts('seed') && params.seed !== undefined)
            body.seed = params.seed;
    }
    const logicalOperationId = (0, openrouterUsage_1.createOpenRouterLogicalOperationId)({
        operation: 'image',
        model: params.model.id,
        request: { optionLevel: params.optionLevel, body },
    });
    const reservation = await (0, openrouterUsage_1.reserveOpenRouterUsage)({
        operation: 'image',
        model: params.model.id,
        logicalOperationId,
        estimatedCostUsd: params.estimatedImageCostUsd,
        providerSlug,
        providerTag,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_GENERATION_TIMEOUT_MS);
    let response;
    try {
        response = await fetch('https://openrouter.ai/api/v1/images', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${params.apiKey}`,
                'Content-Type': 'application/json',
                'X-OpenRouter-Title': 'ProPig Emoticon Studio',
                'X-Request-ID': reservation.requestId,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    }
    catch (error) {
        clearTimeout(timeout);
        await (0, openrouterUsage_1.failOpenRouterUsageReservation)(reservation, {
            ambiguous: true,
            reason: controller.signal.aborted ? 'request_timeout' : 'network_error',
        });
        if (controller.signal.aborted)
            throw new Error('OpenRouter image generation timed out; its cost state is uncertain and automatic replay was blocked.');
        throw error;
    }
    if (response.ok) {
        // Persist the conservative charge immediately after the successful HTTP
        // status, before consuming base64 image bytes or downloading a URL.
        try {
            await (0, openrouterUsage_1.settleOpenRouterUsageReservation)(reservation, {
                model: params.model.id,
                requestId: reservation.requestId,
                providerSlug,
                providerTag,
            });
        }
        catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    }
    let raw;
    try {
        raw = await response.text();
    }
    catch (error) {
        if (!response.ok) {
            const definiteNonBillable = response.status >= 400
                && response.status < 500
                && response.status !== 408;
            await (0, openrouterUsage_1.failOpenRouterUsageReservation)(reservation, {
                ambiguous: !definiteNonBillable,
                reason: `http_${response.status}_body_read_failed`,
            });
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
    }
    let payload = {};
    try {
        payload = JSON.parse(raw);
    }
    catch (_e) {
        // The normalized HTTP error below handles non-JSON provider responses.
    }
    if (!response.ok) {
        const definiteNonBillable = response.status >= 400
            && response.status < 500
            && response.status !== 408;
        await (0, openrouterUsage_1.failOpenRouterUsageReservation)(reservation, {
            ambiguous: !definiteNonBillable,
            reason: `http_${response.status}`,
        });
        const error = new Error(((_c = payload.error) === null || _c === void 0 ? void 0 : _c.message) || raw.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }
    const costUsd = await (0, openrouterUsage_1.settleOpenRouterUsageReservation)(reservation, {
        model: payload.model || params.model.id,
        costUsd: (_d = payload.usage) === null || _d === void 0 ? void 0 : _d.cost,
        requestId: payload.id || reservation.requestId,
        providerSlug,
        providerTag: payload.provider || providerTag,
    });
    return {
        payload,
        requestId: payload.id || reservation.requestId,
        costUsd,
    };
}
function isDefiniteImageRouteCompatibilityError(error) {
    const status = error.status;
    if (status !== 400 && status !== 404 && status !== 409 && status !== 422)
        return false;
    const message = error instanceof Error ? error.message : '';
    return /(?:model|provider|endpoint|routing|route|input[_\s-]?references?|unsupported|not supported|not available|no available|no provider|provider\.only|invalid (?:parameter|model|provider))/i
        .test(message);
}
function resolveCompatibleImageBackgroundMode(error, currentMode) {
    const status = error.status;
    if (status !== 400 && status !== 409 && status !== 422)
        return null;
    const message = error instanceof Error ? error.message : '';
    if (!/background/i.test(message)
        || !/(?:transparent|accepted|not supported|unsupported|invalid)/i.test(message))
        return null;
    if (currentMode === 'transparent') {
        return /(?:accepted|accepts?|allowed)[^\n]{0,120}\bauto\b|\bauto\b[^\n]{0,120}(?:accepted|supported|allowed)/i
            .test(message)
            ? 'auto'
            : 'omit';
    }
    if (currentMode === 'auto')
        return 'omit';
    return null;
}
async function generateOpenRouterEmoticonPose(params) {
    var _a, _b, _c;
    const originalUserInstruction = requireOriginalUserInstruction(params.originalUserInstruction);
    const maxInputReferences = Math.max(1, Math.min(MAX_IMAGE_INPUT_REFERENCES, Math.round(params.maxInputReferences || MAX_IMAGE_INPUT_REFERENCES)));
    const referenceImageUrls = [
        params.sourceImageUrl,
        ...(params.identityReferenceUrl ? [params.identityReferenceUrl] : []),
        ...(params.additionalReferenceUrls || []),
    ].filter((url, index, urls) => Boolean(url === null || url === void 0 ? void 0 : url.trim()) && urls.indexOf(url) === index)
        .slice(0, maxInputReferences);
    let selected = await selectImageModel(params.apiKey, params.preferredModel, referenceImageUrls.length, params.resourceMode);
    const prompt = params.promptOverride || buildPrompt({
        plan: params.plan,
        originalUserInstruction,
        correction: params.correction,
        animationFrame: params.animationFrame,
    });
    const requestSelectedRoute = (route) => {
        var _a, _b;
        return (0, openrouterUsage_1.runWithOpenRouterUsageContext)({
            providerSlug: (_a = route.endpoint.provider_slug) === null || _a === void 0 ? void 0 : _a.trim(),
            providerTag: (_b = route.endpoint.provider_tag) === null || _b === void 0 ? void 0 : _b.trim(),
        }, () => requestImage({
            apiKey: params.apiKey,
            model: route.model,
            endpoint: route.endpoint,
            referenceImageUrls,
            prompt,
            optionLevel: route.optionLevel,
            backgroundMode: route.backgroundMode,
            seed: params.seed,
            estimatedImageCostUsd: route.estimatedImageCostUsd,
            aspectRatio: params.aspectRatio,
        }));
    };
    let routeCacheEligible = true;
    const accounted = await (0, openrouterUsage_1.runWithOpenRouterUsageContext)({
        seed: params.seed,
        stage: 'image-generation',
    }, async () => {
        try {
            return await requestSelectedRoute(selected);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/timed? ?out|request_timeout|automatic replay was blocked/i.test(message)) {
                await quarantineTimedOutImageRoute(selected);
            }
            if (!isDefiniteImageRouteCompatibilityError(error) || params.maxRequestAttempts === 1) {
                if (isDefiniteImageRouteCompatibilityError(error)) {
                    await invalidateSelectedImageRoute(selected);
                }
                throw error;
            }
            const compatibleBackgroundMode = resolveCompatibleImageBackgroundMode(error, selected.backgroundMode);
            if (compatibleBackgroundMode) {
                // OpenRouter endpoint discovery currently exposes whether the
                // background parameter exists, but not its accepted values.
                // Learn the verified value once, then share it across frames
                // so every frame does not repeat the same non-billable 400.
                selected = Object.assign(Object.assign({}, selected), { backgroundMode: compatibleBackgroundMode, cacheSource: 'discovery' });
            }
            else if (selected.cacheSource !== 'discovery') {
                await invalidateSelectedImageRoute(selected);
                selected = await selectImageModel(params.apiKey, params.preferredModel, referenceImageUrls.length, params.resourceMode, { bypassRouteCache: true, forceDiscovery: true });
            }
            else if (selected.optionLevel === 'full') {
                // A definite 4xx compatibility rejection is non-billable.
                // Retry once with only the required image-edit fields; local
                // normalization and alpha inspection still enforce output
                // correctness after the provider accepts the request.
                selected = Object.assign(Object.assign({}, selected), { backgroundMode: 'omit', optionLevel: 'required', cacheSource: 'discovery' });
                routeCacheEligible = true;
            }
            else {
                await invalidateSelectedImageRoute(selected);
                throw error;
            }
            try {
                // Exactly one retry is allowed only after a definite
                // non-billable compatibility response. Accepted, timed-out,
                // network-failed, 408, and 429 requests are never replayed.
                return await requestSelectedRoute(selected);
            }
            catch (recoveryError) {
                if (isDefiniteImageRouteCompatibilityError(recoveryError)) {
                    await invalidateSelectedImageRoute(selected);
                }
                throw recoveryError;
            }
        }
    });
    const payload = accounted.payload;
    let image;
    try {
        const item = (_a = payload.data) === null || _a === void 0 ? void 0 : _a[0];
        if (!item)
            throw new Error('OpenRouter returned no image data.');
        if (item.b64_json) {
            const buffer = Buffer.from(item.b64_json, 'base64');
            if (buffer.byteLength > MAX_IMAGE_RESULT_BYTES) {
                throw new Error('Generated image exceeded the 30 MB safety limit.');
            }
            image = {
                buffer,
                contentType: item.media_type || 'image/png',
            };
        }
        else if (item.url) {
            image = await fetchImageBuffer(item.url);
        }
        else {
            throw new Error('OpenRouter returned an unsupported image result.');
        }
        await validateGeneratedImageResult(image);
    }
    catch (error) {
        // The response may already be billable, so never replay it. Evict the
        // route so the next logical operation performs fresh discovery.
        await invalidateSelectedImageRoute(selected);
        throw error;
    }
    if (routeCacheEligible)
        await persistSelectedImageRoute(selected);
    const providerSlug = (_b = selected.endpoint.provider_slug) === null || _b === void 0 ? void 0 : _b.trim();
    const providerTag = (_c = selected.endpoint.provider_tag) === null || _c === void 0 ? void 0 : _c.trim();
    return Object.assign(Object.assign({}, image), { model: payload.model || selected.model.id, provider: payload.provider || providerTag || providerSlug, requestId: accounted.requestId, costUsd: accounted.costUsd });
}
function collectPoseReferenceImageUrls(params) {
    const maxInputReferences = Math.max(1, Math.min(MAX_IMAGE_INPUT_REFERENCES, Math.round(params.maxInputReferences || MAX_IMAGE_INPUT_REFERENCES)));
    return [
        params.sourceImageUrl,
        ...(params.identityReferenceUrl ? [params.identityReferenceUrl] : []),
        ...(params.additionalReferenceUrls || []),
    ].filter((url, index, urls) => Boolean(url === null || url === void 0 ? void 0 : url.trim()) && urls.indexOf(url) === index)
        .slice(0, maxInputReferences);
}
function createImageGenerationProvider(openRouterTask) {
    return (0, imageGenerationProvider_1.resolveEmoticonStudioImageProviderName)() === 'mock'
        ? new mockImageProvider_1.MockImageProvider()
        : new openRouterImageProvider_1.OpenRouterImageProvider(() => openRouterTask());
}
async function generateEmoticonPose(params) {
    const originalUserInstruction = requireOriginalUserInstruction(params.originalUserInstruction);
    const request = {
        kind: 'pose',
        apiKey: params.apiKey,
        preferredModel: params.preferredModel,
        referenceImageUrls: collectPoseReferenceImageUrls(params),
        prompt: params.promptOverride || buildPrompt({
            plan: params.plan,
            originalUserInstruction,
            correction: params.correction,
            animationFrame: params.animationFrame,
        }),
        seed: params.seed,
        maxRequestAttempts: params.maxRequestAttempts,
        resourceMode: params.resourceMode,
        aspectRatio: params.aspectRatio,
    };
    const provider = createImageGenerationProvider(() => generateOpenRouterEmoticonPose(params));
    return provider.generate(request);
}
async function generateEmoticonSpriteSheet(params) {
    if (params.directions.length !== params.layout.frameCount
        || params.layout.columns * params.layout.rows < params.layout.frameCount) {
        throw new Error('Sprite-sheet directions do not match the requested grid.');
    }
    const gridRatio = params.layout.columns / params.layout.rows;
    const aspectRatio = gridRatio <= 1.12
        ? '1:1'
        : gridRatio <= 1.48
            ? '4:3'
            : '3:2';
    const poseParams = {
        apiKey: params.apiKey,
        preferredModel: params.preferredModel,
        sourceImageUrl: params.sourceImageUrl,
        originalUserInstruction: params.originalUserInstruction,
        identityReferenceUrl: params.identityReferenceUrl,
        additionalReferenceUrls: params.additionalReferenceUrls,
        plan: params.plan,
        promptOverride: buildSpriteSheetPrompt({
            plan: params.plan,
            originalUserInstruction: params.originalUserInstruction,
            directions: params.directions,
            layout: params.layout,
        }),
        aspectRatio,
        seed: params.seed,
        maxRequestAttempts: 2,
        resourceMode: params.resourceMode,
        maxInputReferences: 4,
    };
    const provider = createImageGenerationProvider(() => generateOpenRouterEmoticonPose(poseParams));
    return provider.generate({
        kind: 'sprite-sheet',
        apiKey: params.apiKey,
        preferredModel: params.preferredModel,
        referenceImageUrls: collectPoseReferenceImageUrls(poseParams),
        prompt: poseParams.promptOverride || '',
        seed: params.seed,
        maxRequestAttempts: 2,
        resourceMode: params.resourceMode,
        aspectRatio,
        layout: params.layout,
        directions: params.directions,
    });
}
async function generateEmoticonAnimationFrame(params) {
    const selectedReferences = selectEmoticonAnimationInputReferences({
        sourceImageUrl: params.sourceImageUrl,
        canonicalPoseUrl: params.canonicalPoseUrl,
        alternateCanonicalPoseUrl: params.alternateCanonicalPoseUrl,
        preferAlternatePose: params.direction.phase === 'opposite'
            || params.direction.phase === 'follow-through',
        previousFrameUrl: params.previousFrameUrl,
        nextFrameUrl: params.nextFrameUrl,
        identityReferenceUrl: params.identityReferenceUrl,
        additionalReferenceUrls: params.additionalReferenceUrls,
        maxReferences: params.maxInputReferences,
    });
    return (0, openrouterUsage_1.runWithOpenRouterUsageContext)({
        frameIndex: params.direction.frameIndex,
        seed: params.seed,
        stage: 'animation-frame',
    }, () => generateEmoticonPose({
        apiKey: params.apiKey,
        preferredModel: params.preferredModel,
        sourceImageUrl: selectedReferences.urls[0],
        originalUserInstruction: params.originalUserInstruction,
        additionalReferenceUrls: selectedReferences.urls.slice(1),
        plan: params.plan,
        animationFrame: {
            direction: params.direction,
            frameCount: params.frameCount,
            referenceOrder: selectedReferences.roleSummary,
        },
        correction: params.correction,
        seed: params.seed,
        maxRequestAttempts: params.maxRequestAttempts,
        resourceMode: params.resourceMode,
        maxInputReferences: params.maxInputReferences,
    }));
}
//# sourceMappingURL=imageGeneration.js.map