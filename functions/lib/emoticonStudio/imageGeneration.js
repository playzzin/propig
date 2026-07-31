"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreImageModelForEmoticons = scoreImageModelForEmoticons;
exports.generateEmoticonPose = generateEmoticonPose;
exports.generateEmoticonAnimationFrame = generateEmoticonAnimationFrame;
const node_crypto_1 = require("node:crypto");
const openrouterUsage_1 = require("../openrouterUsage");
const qualityStandards_1 = require("./qualityStandards");
const IMAGE_MODEL_CACHE_MS = 15 * 60 * 1000;
const MODEL_DISCOVERY_TIMEOUT_MS = 30 * 1000;
const IMAGE_GENERATION_TIMEOUT_MS = 3 * 60 * 1000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 45 * 1000;
const MAX_IMAGE_RESULT_BYTES = 30 * 1024 * 1024;
const PREFERRED_MODELS = [
    'openai/gpt-5-image',
    'openai/gpt-image-2',
    'openai/gpt-image-1',
    'google/gemini-3.1-flash-image',
    'google/gemini-2.5-flash-image',
];
let modelCache = null;
function supports(model, parameter) {
    if (Array.isArray(model.supported_parameters)) {
        return model.supported_parameters.includes(parameter);
    }
    return Boolean(model.supported_parameters && parameter in model.supported_parameters);
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
async function discoverImageModels(apiKey) {
    if (modelCache && modelCache.expiresAt > Date.now())
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
async function selectImageModel(apiKey) {
    var _a, _b;
    try {
        const models = await discoverImageModels(apiKey);
        const configuredModel = (_a = process.env.OPENROUTER_IMAGE_MODEL) === null || _a === void 0 ? void 0 : _a.trim();
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
        if (compatible[0])
            return { model: compatible[0], fallback: false };
    }
    catch (error) {
        console.warn('[Emoticon Studio] Image model discovery failed.', error);
    }
    return {
        model: {
            id: ((_b = process.env.OPENROUTER_IMAGE_MODEL) === null || _b === void 0 ? void 0 : _b.trim()) || 'openai/gpt-image-1',
            supported_parameters: undefined,
        },
        fallback: true,
    };
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
function buildAnimationFrameDirection(params) {
    const { direction, frameCount } = params;
    return [
        `This is animation frame ${direction.frameIndex + 1} of ${frameCount}; phase: ${direction.phase}.`,
        `Exact body pose: ${direction.posePrompt}`,
        `Exact facial expression: ${direction.expressionPrompt}`,
        `Sequence continuity: ${direction.continuityPrompt}`,
        'Change the character itself from the previous frame: adjust limbs, torso, eyes, eyebrows, and mouth as the action and emotion require.',
        'Keep the camera, character scale, canvas position, outfit, colors, proportions, facial identity, and line style locked.',
        'Keep every hand, foot, accessory, and line connected to the one character; do not leave duplicate limbs, detached fragments, or motion residue.',
        'Do not create apparent motion by shifting, zooming, rotating, or cropping one unchanged pose.',
    ].join(' ');
}
function buildPrompt(params) {
    const { plan, correction, animationFrame } = params;
    const actionTemplate = (0, qualityStandards_1.getEmoticonActionTemplate)(plan);
    return [
        plan.action.imagePrompt,
        'Create exactly the same character identity as the reference image.',
        `Immutable traits: ${plan.characterProfile.immutableTraits.join('; ')}.`,
        `Style rules: ${plan.characterProfile.styleRules.join('; ')}.`,
        `Action: ${plan.action.action}. Emotion: ${plan.action.emotion}.`,
        `Action-specific animation rule: ${actionTemplate.frameGuidance}`,
        'Full body or complete intended pose fully visible, centered in a square canvas with generous safe margin.',
        'Exactly one isolated character only, with a clean unoccluded silhouette and genuine transparent alpha background.',
        'Keep all background pixels transparent. Do not generate scenery, floor, room, horizon, cast shadow, glow, speed-line residue, particles, texture, detached prop, duplicated limb, second face, second body, or another character.',
        'Nothing may overlap or cover the character face, hands, limbs, or outline. Keep a clear safety margin around the complete silhouette.',
        `Do not include: ${plan.action.negativePrompt}; ${plan.characterProfile.negativeRules.join('; ')}.`,
        'No letters, no readable text, no speech bubble, no caption, no logo, no watermark, no scenery, no extra character.',
        animationFrame ? buildAnimationFrameDirection(animationFrame) : '',
        correction ? `Quality correction from the reviewer: ${correction}` : '',
    ].filter(Boolean).join('\n');
}
async function requestImage(params) {
    var _a;
    const accepts = (parameter) => !params.model.supported_parameters || supports(params.model, parameter);
    const body = {
        model: params.model.id,
        prompt: params.prompt,
        input_references: params.referenceImageUrls.slice(0, 2).map((url) => ({
            type: 'image_url',
            image_url: { url },
        })),
    };
    if (params.includeOptions) {
        if (accepts('n'))
            body.n = 1;
        if (accepts('aspect_ratio'))
            body.aspect_ratio = '1:1';
        else if (accepts('size'))
            body.size = '1024x1024';
        else if (accepts('resolution'))
            body.resolution = '1K';
        if (accepts('output_format'))
            body.output_format = 'png';
        if (accepts('background'))
            body.background = 'transparent';
        if (accepts('quality'))
            body.quality = 'high';
        if (accepts('seed') && params.seed !== undefined)
            body.seed = params.seed;
    }
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
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    }
    catch (error) {
        if (controller.signal.aborted)
            throw new Error('OpenRouter image generation timed out.');
        throw error;
    }
    finally {
        clearTimeout(timeout);
    }
    const raw = await response.text();
    let payload = {};
    try {
        payload = JSON.parse(raw);
    }
    catch (_b) {
        // The normalized HTTP error below handles non-JSON provider responses.
    }
    if (!response.ok) {
        const error = new Error(((_a = payload.error) === null || _a === void 0 ? void 0 : _a.message) || raw.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return payload;
}
async function generateEmoticonPose(params) {
    var _a, _b, _c;
    const selected = await selectImageModel(params.apiKey);
    const prompt = buildPrompt({
        plan: params.plan,
        correction: params.correction,
        animationFrame: params.animationFrame,
    });
    const referenceImageUrls = [
        params.sourceImageUrl,
        ...(params.additionalReferenceUrls || []),
    ];
    let payload;
    try {
        payload = await requestImage({
            apiKey: params.apiKey,
            model: selected.model,
            referenceImageUrls,
            prompt,
            includeOptions: true,
            seed: params.seed,
        });
    }
    catch (error) {
        const status = error.status;
        if (status !== 400 && status !== 422)
            throw error;
        payload = await requestImage({
            apiKey: params.apiKey,
            model: selected.model,
            referenceImageUrls,
            prompt,
            includeOptions: false,
            seed: params.seed,
        });
    }
    const item = (_a = payload.data) === null || _a === void 0 ? void 0 : _a[0];
    if (!item)
        throw new Error('OpenRouter returned no image data.');
    let image;
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
    await (0, openrouterUsage_1.recordOpenRouterUsage)({
        operation: 'image',
        model: selected.model.id,
        costUsd: (_b = payload.usage) === null || _b === void 0 ? void 0 : _b.cost,
        requestId: (0, node_crypto_1.randomUUID)(),
    });
    return Object.assign(Object.assign({}, image), { model: selected.model.id, costUsd: (_c = payload.usage) === null || _c === void 0 ? void 0 : _c.cost });
}
async function generateEmoticonAnimationFrame(params) {
    return generateEmoticonPose({
        apiKey: params.apiKey,
        sourceImageUrl: params.sourceImageUrl,
        additionalReferenceUrls: [params.previousFrameUrl],
        plan: params.plan,
        animationFrame: {
            direction: params.direction,
            frameCount: params.frameCount,
        },
        correction: params.correction,
        seed: params.seed,
    });
}
//# sourceMappingURL=imageGeneration.js.map