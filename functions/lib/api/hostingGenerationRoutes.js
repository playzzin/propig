"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGenerateImage = handleGenerateImage;
exports.handleGenerateVideo = handleGenerateVideo;
exports.handleGenerateImageStoryboard = handleGenerateImageStoryboard;
exports.handleRedesignImageStoryboardScene = handleRedesignImageStoryboardScene;
exports.handleRedesignImageStoryboardFlow = handleRedesignImageStoryboardFlow;
exports.handleGenerateProjectBoardContent = handleGenerateProjectBoardContent;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const openrouterUsage_1 = require("../openrouterUsage");
const openrouter_1 = require("../videoStudio/openrouter");
const dialogue_1 = require("../videoStudio/dialogue");
const hostingCommon_1 = require("./hostingCommon");
const security_1 = require("./security");
const hostingAiRuntime_1 = require("./hostingAiRuntime");
const ImageReferenceRoleSchema = zod_1.z.enum(['building', 'product', 'character', 'background', 'style']);
const StoryboardDialogueOrCaptionSchema = zod_1.z.preprocess((value) => typeof value === 'string' ? (0, dialogue_1.normalizeVideoSpokenDialogue)(value) : value, zod_1.z.string().trim().max(240));
const GenerateImageSchema = zod_1.z.object({
    prompt: zod_1.z.string().trim().min(1).max(4000),
    negativePrompt: zod_1.z.string().max(1500).optional(),
    aspectRatio: zod_1.z.string().max(20).optional(),
    width: zod_1.z.number().int().min(64).max(4096).optional(),
    height: zod_1.z.number().int().min(64).max(4096).optional(),
    stylePreset: zod_1.z.string().max(100).optional(),
    image: zod_1.z.string().optional(),
    referenceImageBase64: zod_1.z.string().optional(),
    referenceImageMimeType: zod_1.z.string().optional(),
    referenceImages: zod_1.z.array(zod_1.z.object({
        role: ImageReferenceRoleSchema,
        image: zod_1.z.string().min(1),
    })).max(5).optional(),
    numberOfImages: zod_1.z.number().int().min(1).max(4).default(1),
    resourceMode: zod_1.z.enum(['efficient', 'balanced', 'premium']).default('premium'),
    provider: zod_1.z.literal('openrouter').optional().default('openrouter'),
});
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_REFERENCE_BYTES = 16 * 1024 * 1024;
const ALLOWED_REFERENCE_TYPES = new Set([
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
]);
const AUTO_IMAGE_MODEL_FALLBACK = 'openai/gpt-image-1';
const EFFICIENT_STORYBOARD_IMAGE_MODEL = 'openai/gpt-image-1-mini';
const PREFERRED_AUTO_IMAGE_MODELS = [
    'openai/gpt-5-image',
    'openai/gpt-image-2',
    'openai/gpt-image-1',
    'google/gemini-3.1-flash-image',
    'google/gemini-2.5-flash-image',
    'bytedance-seed/seedream-4.5',
];
const IMAGE_MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedImageModels = null;
async function readReferenceResponse(response) {
    var _a, _b;
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_REFERENCE_BYTES) {
        await ((_a = response.body) === null || _a === void 0 ? void 0 : _a.cancel());
        throw new hostingCommon_1.ApiError(413, 'Reference image exceeds the 8 MB limit.');
    }
    const reader = (_b = response.body) === null || _b === void 0 ? void 0 : _b.getReader();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_REFERENCE_BYTES)
            throw new hostingCommon_1.ApiError(413, 'Reference image exceeds the 8 MB limit.');
        return buffer;
    }
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        if (total > MAX_REFERENCE_BYTES) {
            await reader.cancel();
            throw new hostingCommon_1.ApiError(413, 'Reference image exceeds the 8 MB limit.');
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}
async function parseReference(role, rawValue, fallbackMimeType = 'image/png') {
    var _a, _b, _c;
    const value = rawValue.trim();
    const dataUrl = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrl) {
        const mimeType = dataUrl[1].toLowerCase();
        const base64 = dataUrl[2].replace(/\s+/g, '');
        if (!ALLOWED_REFERENCE_TYPES.has(mimeType))
            throw new hostingCommon_1.ApiError(415, 'Unsupported reference image type.');
        const byteLength = Buffer.byteLength(base64, 'base64');
        if (byteLength > MAX_REFERENCE_BYTES)
            throw new hostingCommon_1.ApiError(413, 'Reference image exceeds the 8 MB limit.');
        return { role, base64, mimeType, byteLength };
    }
    if (/^https?:\/\//i.test(value)) {
        const response = await (0, security_1.fetchExternalHttpUrl)((0, security_1.normalizeExternalHttpUrl)(value), {
            headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8' },
        });
        if (!response.ok) {
            await ((_a = response.body) === null || _a === void 0 ? void 0 : _a.cancel());
            throw new hostingCommon_1.ApiError(502, `Reference image could not be fetched (${response.status}).`);
        }
        const mimeType = ((_b = response.headers.get('content-type')) === null || _b === void 0 ? void 0 : _b.split(';')[0].trim().toLowerCase()) || '';
        if (!ALLOWED_REFERENCE_TYPES.has(mimeType)) {
            await ((_c = response.body) === null || _c === void 0 ? void 0 : _c.cancel());
            throw new hostingCommon_1.ApiError(415, 'Unsupported reference image type.');
        }
        const buffer = await readReferenceResponse(response);
        return { role, base64: buffer.toString('base64'), mimeType, byteLength: buffer.length };
    }
    const mimeType = ALLOWED_REFERENCE_TYPES.has(fallbackMimeType) ? fallbackMimeType : 'image/png';
    const base64 = value.replace(/\s+/g, '');
    const byteLength = Buffer.byteLength(base64, 'base64');
    if (byteLength > MAX_REFERENCE_BYTES)
        throw new hostingCommon_1.ApiError(413, 'Reference image exceeds the 8 MB limit.');
    return { role, base64, mimeType, byteLength };
}
async function parseReferences(payload) {
    var _a;
    const inputs = ((_a = payload.referenceImages) === null || _a === void 0 ? void 0 : _a.length)
        ? payload.referenceImages
        : payload.image
            ? [{ role: 'style', image: payload.image }]
            : payload.referenceImageBase64
                ? [{ role: 'style', image: payload.referenceImageBase64 }]
                : [];
    const references = await Promise.all(inputs.map((item) => parseReference(item.role, item.image, payload.referenceImageMimeType || 'image/png')));
    const total = references.reduce((sum, reference) => sum + reference.byteLength, 0);
    if (total > MAX_TOTAL_REFERENCE_BYTES) {
        throw new hostingCommon_1.ApiError(413, 'Combined reference images exceed the 16 MB limit.');
    }
    return references;
}
async function parseStoryboardReferences(inputs) {
    const references = await Promise.all(inputs.map((item) => parseReference(item.role, item.image)));
    const total = references.reduce((sum, reference) => sum + reference.byteLength, 0);
    if (total > MAX_TOTAL_REFERENCE_BYTES) {
        throw new hostingCommon_1.ApiError(413, 'Combined reference images exceed the 16 MB limit.');
    }
    return references;
}
const STYLE_INSTRUCTIONS = {
    clean: 'Style: clean modern digital design, precise spacing, crisp edges, refined commercial quality.',
    realistic: 'Style: photorealistic editorial image, natural lighting, believable lens perspective and detailed materials.',
    illustration: 'Style: polished brand illustration, clean silhouettes, balanced color blocking and smooth gradients.',
    minimal: 'Style: minimal composition, generous negative space, one clear focal subject and restrained color palette.',
    'project-board': 'Style: polished Korean corporate project board image, exact 16:9 hero composition, premium operations mood, no readable text.',
    'product-shot': 'Style: premium product advertising shot, controlled studio lighting and sharp material detail.',
    cinematic: 'Style: cinematic frame, dramatic key lighting, atmospheric depth and film-grade color.',
    luxury: 'Style: luxury magazine visual, refined materials, controlled highlights and elegant contrast.',
    isometric: 'Style: isometric 3D illustration, precise geometry, soft shadows and organized spatial depth.',
    watercolor: 'Style: watercolor illustration, soft pigment blooms, paper texture and handcrafted finish.',
    'retro-poster': 'Style: retro poster artwork, vintage print texture, bold simplified shapes and warm muted inks.',
    'pixel-art': 'Style: crisp pixel art, limited expressive palette, disciplined visible pixels and no blur.',
    anime: 'Style: modern anime-inspired visual, clean linework, expressive cel shading and vivid environmental lighting.',
    'line-art': 'Style: refined line art, confident ink strokes, mostly monochrome with one accent color.',
};
function buildImagePrompt(payload, references) {
    var _a;
    const parts = [payload.prompt];
    if (payload.stylePreset && payload.stylePreset !== 'none') {
        parts.push(STYLE_INSTRUCTIONS[payload.stylePreset] || `Style: ${payload.stylePreset}`);
    }
    if (payload.aspectRatio)
        parts.push(`Aspect ratio: ${payload.aspectRatio}`);
    if (payload.width && payload.height)
        parts.push(`Target size: ${payload.width}x${payload.height}`);
    if ((_a = payload.negativePrompt) === null || _a === void 0 ? void 0 : _a.trim())
        parts.push(`Avoid: ${payload.negativePrompt.trim()}`);
    if (references.length) {
        parts.push(`Reference images are the visual source of truth (${references.map((item, index) => `#${index + 1} ${item.role}`).join(', ')}). ` +
            'Preserve each referenced building, product, character, background, and style faithfully. Keep distinct subjects separate and do not invent logos or readable text.');
    }
    parts.push('Return image output only.');
    return parts.join('\n');
}
function imageInfraHint(message) {
    const lower = message.toLowerCase();
    if (lower.includes('missing') || lower.includes('not configured'))
        return { reasonCode: 'missing_api_key', error: 'OPENROUTER_API_KEY가 설정되지 않았습니다.' };
    if (lower.includes('permission') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('403'))
        return { reasonCode: 'permission_denied', error: 'OpenRouter API 인증 또는 권한을 확인하세요.' };
    if (lower.includes('rate') || lower.includes('429'))
        return { reasonCode: 'rate_limited', error: 'OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.' };
    if (lower.includes('timeout'))
        return { reasonCode: 'request_timeout', error: 'OpenRouter 이미지 생성 시간이 초과되었습니다.' };
    if (lower.includes('invalid') || lower.includes('400'))
        return { reasonCode: 'invalid_request', error: 'OpenRouter가 이미지 생성 요청을 거부했습니다.' };
    return { reasonCode: 'unknown', error: 'OpenRouter 이미지 생성에 실패했습니다.' };
}
function hasImageParameter(model, parameter) {
    return Boolean(model.supported_parameters && parameter in model.supported_parameters);
}
function supportsRequestedImageInput(model, payload, references) {
    var _a, _b;
    const outputModalities = ((_a = model.architecture) === null || _a === void 0 ? void 0 : _a.output_modalities) || [];
    if (!outputModalities.includes('image'))
        return false;
    if (references.length) {
        const inputModalities = ((_b = model.architecture) === null || _b === void 0 ? void 0 : _b.input_modalities) || [];
        if (!inputModalities.includes('image') || !hasImageParameter(model, 'input_references'))
            return false;
    }
    if (payload.numberOfImages > 1 && !hasImageParameter(model, 'n'))
        return false;
    return true;
}
function scoreImageModel(model, payload) {
    const preferredIndex = PREFERRED_AUTO_IMAGE_MODELS.indexOf(model.id);
    const preferenceScore = preferredIndex >= 0 ? PREFERRED_AUTO_IMAGE_MODELS.length - preferredIndex : 0;
    const canHonorRequestedFrame = Boolean((payload.aspectRatio && /^\d{1,2}:\d{1,2}$/.test(payload.aspectRatio) && hasImageParameter(model, 'aspect_ratio')) ||
        (payload.width && payload.height && hasImageParameter(model, 'size')));
    return (canHonorRequestedFrame ? 1000 : 0) + (hasImageParameter(model, 'output_format') ? 100 : 0) + preferenceScore;
}
async function discoverOpenRouterImageModels(apiKey) {
    if (cachedImageModels && cachedImageModels.expiresAt > Date.now())
        return cachedImageModels.models;
    const response = await fetch('https://openrouter.ai/api/v1/images/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok)
        throw new Error(`OpenRouter image model discovery failed (${response.status}).`);
    const payload = await response.json();
    const models = Array.isArray(payload.data) ? payload.data.filter((model) => Boolean(model === null || model === void 0 ? void 0 : model.id)) : [];
    if (!models.length)
        throw new Error('OpenRouter returned no image models.');
    cachedImageModels = { models, expiresAt: Date.now() + IMAGE_MODEL_CACHE_TTL_MS };
    return models;
}
async function selectOpenRouterImageModel(params) {
    try {
        const models = await discoverOpenRouterImageModels(params.apiKey);
        const compatibleModels = models.filter((model) => supportsRequestedImageInput(model, params.payload, params.references));
        const efficientModel = params.payload.resourceMode === 'efficient'
            ? compatibleModels.find((model) => model.id === EFFICIENT_STORYBOARD_IMAGE_MODEL)
            : null;
        if (efficientModel) {
            return {
                id: efficientModel.id,
                supportedParameters: new Set(Object.keys(efficientModel.supported_parameters || {})),
                selectionSource: 'efficient',
            };
        }
        const configuredModel = compatibleModels.find((model) => model.id === params.configuredModel);
        if (configuredModel) {
            return {
                id: configuredModel.id,
                supportedParameters: new Set(Object.keys(configuredModel.supported_parameters || {})),
                selectionSource: 'configured',
            };
        }
        const selected = compatibleModels
            .sort((left, right) => scoreImageModel(right, params.payload) - scoreImageModel(left, params.payload))[0];
        if (selected) {
            return {
                id: selected.id,
                supportedParameters: new Set(Object.keys(selected.supported_parameters || {})),
                selectionSource: 'discovered',
            };
        }
    }
    catch (error) {
        console.warn('[hostingApi] OpenRouter image model discovery failed; using the compatibility fallback.', error);
    }
    return {
        id: params.payload.resourceMode === 'efficient'
            ? EFFICIENT_STORYBOARD_IMAGE_MODEL
            : params.configuredModel || AUTO_IMAGE_MODEL_FALLBACK,
        supportedParameters: null,
        selectionSource: 'fallback',
    };
}
function buildOpenRouterImageBody(params, includePresentationOptions) {
    const supports = (parameter) => !params.supportedParameters || params.supportedParameters.has(parameter);
    const body = {
        model: params.model,
        prompt: params.prompt,
    };
    if (params.payload.numberOfImages > 1 || supports('n'))
        body.n = params.payload.numberOfImages;
    // Presentation controls differ by OpenRouter image model. The first
    // request preserves the requested frame; a compatible retry drops only
    // controls the provider has explicitly rejected.
    if (includePresentationOptions) {
        if (supports('output_format'))
            body.output_format = 'png';
        const requestedAspectRatio = params.payload.aspectRatio && /^\d{1,2}:\d{1,2}$/.test(params.payload.aspectRatio)
            ? params.payload.aspectRatio
            : undefined;
        const requestedRatioValue = requestedAspectRatio
            ? requestedAspectRatio.split(':').map(Number)
            : [];
        const aspectRatio = params.model === EFFICIENT_STORYBOARD_IMAGE_MODEL &&
            requestedAspectRatio &&
            !new Set(['1:1', '3:2', '2:3', 'auto']).has(requestedAspectRatio)
            ? requestedRatioValue[0] >= requestedRatioValue[1]
                ? '3:2'
                : '2:3'
            : requestedAspectRatio;
        if (aspectRatio && supports('aspect_ratio')) {
            body.aspect_ratio = aspectRatio;
        }
        else if (params.payload.width && params.payload.height && supports('size')) {
            body.size = `${params.payload.width}x${params.payload.height}`;
        }
    }
    if (params.references.length) {
        body.input_references = params.references.map((reference) => ({
            type: 'image_url',
            image_url: { url: `data:${reference.mimeType};base64,${reference.base64}` },
        }));
    }
    return body;
}
async function requestOpenRouterImages(apiKey, body) {
    var _a;
    const response = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-OpenRouter-Title': 'ProPig Firebase Functions',
        },
        body: JSON.stringify(body),
    });
    const raw = await response.text();
    let data = {};
    try {
        data = JSON.parse(raw);
    }
    catch (_b) {
        // The provider error below handles non-JSON responses.
    }
    if (!response.ok) {
        const error = new Error(((_a = data.error) === null || _a === void 0 ? void 0 : _a.message) || raw.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return data;
}
function canRetryWithoutPresentationOptions(error) {
    if (!(error instanceof Error))
        return false;
    const status = error.status;
    if (status !== 400 && status !== 422)
        return false;
    return /(?:unsupported|not supported|unknown|invalid).{0,80}(?:parameter|size|aspect|format|resolution)|(?:size|aspect_ratio|output_format|resolution).{0,80}(?:unsupported|not supported|invalid|not allowed)/i.test(error.message);
}
async function handleGenerateImage(req, res) {
    var _a, _b;
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const rateLimit = await (0, security_1.enforceUserRateLimit)({
        namespace: 'hosting-generate-image',
        uid: auth.uid,
        maxRequests: 12,
        windowMs: 60000,
    });
    if (!rateLimit.allowed) {
        res.set('Retry-After', String(rateLimit.retryAfterSeconds));
        throw new hostingCommon_1.ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    }
    const payload = (0, hostingCommon_1.parseJson)(req, GenerateImageSchema);
    const runtime = await (0, hostingAiRuntime_1.getHostingAiRuntime)();
    if (!runtime.openRouterApiKey)
        throw new hostingCommon_1.ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    try {
        const references = await parseReferences(payload);
        const prompt = buildImagePrompt(payload, references);
        const selectedImageModel = await selectOpenRouterImageModel({
            apiKey: runtime.openRouterApiKey,
            payload,
            references,
            configuredModel: runtime.imageModel,
        });
        const requestParams = {
            model: selectedImageModel.id,
            supportedParameters: selectedImageModel.supportedParameters,
            payload,
            prompt,
            references,
        };
        let compatibilityFallback = false;
        let data;
        try {
            data = await requestOpenRouterImages(runtime.openRouterApiKey, buildOpenRouterImageBody(requestParams, true));
        }
        catch (error) {
            if (!canRetryWithoutPresentationOptions(error))
                throw error;
            data = await requestOpenRouterImages(runtime.openRouterApiKey, buildOpenRouterImageBody(requestParams, false));
            compatibilityFallback = true;
        }
        const images = (data.data || []).flatMap((item) => {
            const mimeType = item.media_type || 'image/png';
            const url = item.url || (item.b64_json ? `data:${mimeType};base64,${item.b64_json}` : '');
            return url ? [Object.assign({ id: (0, node_crypto_1.randomUUID)(), url,
                    mimeType }, (item.b64_json ? { base64: item.b64_json } : {}))] : [];
        });
        if (!images.length)
            throw new Error('OpenRouter returned no image data.');
        await (0, openrouterUsage_1.recordOpenRouterUsage)({
            operation: 'image',
            model: selectedImageModel.id,
            costUsd: (_a = data.usage) === null || _a === void 0 ? void 0 : _a.cost,
        });
        res.status(200).json({
            success: true,
            provider: 'openrouter',
            imageId: images[0].id,
            imageUrl: images[0].url,
            images,
            revisedPrompt: prompt,
            metadata: {
                count: images.length,
                modelUsed: selectedImageModel.id,
                modelSelection: selectedImageModel.selectionSource,
                keySource: runtime.source,
                costUsd: (_b = data.usage) === null || _b === void 0 ? void 0 : _b.cost,
                referenceImageCount: references.length,
                referenceRoles: references.map((item) => item.role),
                compatibilityFallback,
            },
        });
    }
    catch (error) {
        if (error instanceof hostingCommon_1.ApiError)
            throw error;
        const rawMessage = error instanceof Error ? error.message : String(error);
        const hint = imageInfraHint(rawMessage);
        res.status(500).json(Object.assign(Object.assign({ success: false }, hint), { details: rawMessage }));
    }
}
const VideoReferenceImageSchema = zod_1.z.string().trim().min(1).max(280000).refine((value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || /^https:\/\//i.test(value), 'Visual references must be HTTPS URLs or image data URLs.');
const GenerateVideoSchema = zod_1.z.object({
    prompt: zod_1.z.string().trim().min(1).max(4000),
    image: zod_1.z.string().optional(),
    endImage: zod_1.z.string().optional(),
    referenceImages: zod_1.z.array(VideoReferenceImageSchema).max(2).optional(),
    provider: zod_1.z.literal('openrouter').optional().default('openrouter'),
    mode: zod_1.z.enum(['generate', 'extend', 'edit']).default('generate'),
    videoUrl: zod_1.z.string().url().optional(),
    duration: zod_1.z.number().int().min(1).max(15).optional(),
    aspectRatio: zod_1.z.string().max(20).optional(),
    resolution: zod_1.z.enum(['480p', '720p', '1080p']).optional(),
    qualityMode: zod_1.z.enum(['proof', 'final']).optional(),
    generateAudio: zod_1.z.boolean().optional(),
    audioMode: zod_1.z.enum(['silent', 'ambient', 'dialogue']).optional(),
    dialogue: zod_1.z.string().trim().max(240).optional(),
}).superRefine((value, context) => {
    var _a;
    if (value.audioMode === 'dialogue' && !((_a = value.dialogue) === null || _a === void 0 ? void 0 : _a.trim())) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['dialogue'],
            message: '대사·립싱크 모드에는 말할 대사가 필요합니다.',
        });
    }
});
async function handleGenerateVideo(req, res) {
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireAdmin)(req);
    const rateLimit = await (0, security_1.enforceUserRateLimit)({
        namespace: 'hosting-generate-video',
        uid: auth.uid,
        maxRequests: 4,
        windowMs: 60000,
    });
    if (!rateLimit.allowed)
        throw new hostingCommon_1.ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const payload = (0, hostingCommon_1.parseJson)(req, GenerateVideoSchema);
    if (payload.mode !== 'generate') {
        throw new hostingCommon_1.ApiError(400, 'OpenRouter 영상 API에서는 새 클립 생성 또는 참조 이미지 기반 생성을 사용해 주세요.');
    }
    const result = await (0, openrouter_1.generateOpenRouterVideo)(payload);
    res.status(200).json({
        success: true,
        provider: 'openrouter',
        videoId: result.metadata.requestId,
        videoUrl: result.videoUrl,
        metadata: result.metadata,
    });
}
const StoryboardRequestSchema = zod_1.z.object({
    topic: zod_1.z.string().trim().min(2).max(240),
    sceneCount: zod_1.z.number().int().min(1).max(12),
    aspectRatio: zod_1.z.enum(['1:1', '9:16', '16:9', '4:3', '3:4']),
    stylePreset: zod_1.z.string().trim().min(1).max(80),
    format: zod_1.z.enum(['brand-film', 'product-launch', 'social-short', 'editorial']).default('brand-film'),
    referenceImages: zod_1.z.array(zod_1.z.object({
        role: ImageReferenceRoleSchema,
        image: zod_1.z.string().trim().min(1).max(1600000),
    })).max(4).optional(),
});
const StoryboardSceneSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(80),
    duration: zod_1.z.string().trim().min(1).max(40),
    narrativeBeat: zod_1.z.string().trim().min(1).max(280),
    shotSize: zod_1.z.string().trim().min(1).max(80),
    cameraDirection: zod_1.z.string().trim().max(180),
    dialogueOrCaption: StoryboardDialogueOrCaptionSchema,
    visualPrompt: zod_1.z.string().trim().min(1).max(900),
    imagePrompt: zod_1.z.string().trim().min(80).max(1200),
    continuityAnchor: zod_1.z.string().trim().min(1).max(280),
    transition: zod_1.z.string().trim().min(1).max(180),
    negativePrompt: zod_1.z.string().trim().max(360),
});
const StoryboardPlanSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(100),
    logline: zod_1.z.string().trim().max(280),
    audience: zod_1.z.string().trim().max(120),
    artDirection: zod_1.z.string().trim().max(320),
    characterContinuity: zod_1.z.string().trim().max(320),
    settingContinuity: zod_1.z.string().trim().max(320),
    colorAndLighting: zod_1.z.string().trim().max(220),
    scenes: zod_1.z.array(StoryboardSceneSchema).min(1).max(12),
});
const SceneRedesignInputSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(80),
    duration: zod_1.z.string().trim().max(40).default(''),
    narrativeBeat: zod_1.z.string().trim().max(280).default(''),
    shotSize: zod_1.z.string().trim().max(80).default(''),
    cameraDirection: zod_1.z.string().trim().max(180).default(''),
    dialogueOrCaption: StoryboardDialogueOrCaptionSchema.default(''),
    visualPrompt: zod_1.z.string().trim().max(900).default(''),
    imagePrompt: zod_1.z.string().trim().max(1200).default(''),
    continuityAnchor: zod_1.z.string().trim().max(280).default(''),
    transition: zod_1.z.string().trim().max(180).default(''),
    negativePrompt: zod_1.z.string().trim().max(360).default(''),
});
const StoryboardSceneRedesignRequestSchema = zod_1.z.object({
    topic: zod_1.z.string().trim().min(2).max(240),
    aspectRatio: zod_1.z.enum(['1:1', '9:16', '16:9', '4:3', '3:4']),
    stylePreset: zod_1.z.string().trim().min(1).max(80),
    format: zod_1.z.enum(['brand-film', 'product-launch', 'social-short', 'editorial']).default('brand-film'),
    artDirection: zod_1.z.string().trim().max(320).default(''),
    characterContinuity: zod_1.z.string().trim().max(320).default(''),
    settingContinuity: zod_1.z.string().trim().max(320).default(''),
    colorAndLighting: zod_1.z.string().trim().max(220).default(''),
    scene: SceneRedesignInputSchema,
    previousScene: SceneRedesignInputSchema.optional(),
    nextScene: SceneRedesignInputSchema.optional(),
    instruction: zod_1.z.string().trim().max(600).default(''),
    referenceImages: zod_1.z.array(zod_1.z.object({
        role: ImageReferenceRoleSchema,
        image: zod_1.z.string().trim().min(1).max(1600000),
    })).max(4).optional(),
});
const StoryboardFlowRedesignRequestSchema = zod_1.z.object({
    topic: zod_1.z.string().trim().min(2).max(240),
    aspectRatio: zod_1.z.enum(['1:1', '9:16', '16:9', '4:3', '3:4']),
    stylePreset: zod_1.z.string().trim().min(1).max(80),
    format: zod_1.z.enum(['brand-film', 'product-launch', 'social-short', 'editorial']).default('brand-film'),
    artDirection: zod_1.z.string().trim().max(320).default(''),
    characterContinuity: zod_1.z.string().trim().max(320).default(''),
    settingContinuity: zod_1.z.string().trim().max(320).default(''),
    colorAndLighting: zod_1.z.string().trim().max(220).default(''),
    previousScene: SceneRedesignInputSchema.optional(),
    scenes: zod_1.z.array(SceneRedesignInputSchema).min(1).max(12),
    nextScene: SceneRedesignInputSchema.optional(),
    instruction: zod_1.z.string().trim().max(600).default(''),
    referenceImages: zod_1.z.array(zod_1.z.object({
        role: ImageReferenceRoleSchema,
        image: zod_1.z.string().trim().min(1).max(1600000),
    })).max(4).optional(),
});
function extractJsonObject(value) {
    const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start)
        throw new Error('AI response does not contain a complete JSON object.');
    return JSON.parse(cleaned.slice(start, end + 1));
}
function parseStoryboardPlanResponse(value) {
    try {
        const parsed = StoryboardPlanSchema.safeParse(extractJsonObject(value));
        return parsed.success ? parsed.data : null;
    }
    catch (_a) {
        return null;
    }
}
function parseStoryboardSceneResponse(value) {
    try {
        const parsed = StoryboardSceneSchema.safeParse(extractJsonObject(value));
        return parsed.success ? parsed.data : null;
    }
    catch (_a) {
        return null;
    }
}
function parseStoryboardFlowResponse(value) {
    try {
        const parsed = zod_1.z.object({ scenes: zod_1.z.array(StoryboardSceneSchema).min(1).max(12) }).safeParse(extractJsonObject(value));
        return parsed.success ? parsed.data : null;
    }
    catch (_a) {
        return null;
    }
}
function storyboardSystemPrompt(input) {
    var _a;
    return [
        'You are an award-winning Korean commercial storyboard director and image-generation prompt designer.',
        'Turn the supplied topic into a production-ready sequence of image-generation scenes, not a generic shot list.',
        `Return exactly ${input.sceneCount} scenes in a purposeful opening-to-closing arc.`,
        `Format: ${input.format}. Compose for ${input.aspectRatio}; visual style: ${input.stylePreset}.`,
        'Before writing, silently establish one continuity bible for recurring people, products, buildings, backgrounds, palette, lighting, and lens language.',
        ((_a = input.referenceImages) === null || _a === void 0 ? void 0 : _a.length)
            ? 'Inspect every attached visual reference. Its labelled role is the source of truth: preserve depicted identity, product geometry, architecture, materials, palette, and environment. Do not invent unreferenced brand marks or merge distinct subjects.'
            : 'No visual reference was attached. State practical continuity details that can be carried through all generated scenes.',
        'Every scene must show one clear, feasible visual moment. Do not create collages, conflicting actions, or repeated hero frames.',
        'Vary shot scale and composition intentionally while keeping the same subject identity, product geometry, wardrobe, environment, palette, and time-of-day coherent.',
        'narrativeBeat must explain what changes emotionally or informationally. transition must explain how this scene flows from the preceding scene; for scene one, describe its opening hook.',
        'continuityAnchor must state the exact recurring visual details this scene must preserve.',
        'visualPrompt is a concise Korean director-facing visual brief: subject, action, composition, environment, and visual priority.',
        'Write all user-facing fields in Korean. imagePrompt and negativePrompt must be English.',
        'imagePrompt must be a single, detailed English prompt including focal subject, exact action, foreground/midground/background, lens or composition, lighting, materials, and finish. Do not include labels, markdown, or conflicting instructions.',
        'negativePrompt is a compact English comma-separated exclusion list. Exclude artifacts, unwanted people/objects, and readable text unless the topic explicitly needs it.',
        'Keep imagePrompt between 120 and 900 English characters, visualPrompt under 700 Korean characters, and negativePrompt under 300 English characters.',
        'dialogueOrCaption must contain only the exact words a visible character will speak. Do not include speaker labels, action descriptions, quotation marks, narration, subtitles, or camera directions. Use an empty string when nobody speaks.',
        'Return exactly one JSON object with no markdown or explanation.',
        'Shape: {"title":"string","logline":"string","audience":"string","artDirection":"string","characterContinuity":"string","settingContinuity":"string","colorAndLighting":"string","scenes":[{"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}]}',
    ].join('\n');
}
function storyboardUserPrompt(input) {
    var _a, _b;
    return JSON.stringify({
        topic: input.topic,
        sceneCount: input.sceneCount,
        aspectRatio: input.aspectRatio,
        stylePreset: input.stylePreset,
        format: input.format,
        referenceRoles: (_b = (_a = input.referenceImages) === null || _a === void 0 ? void 0 : _a.map((reference, index) => ({ index: index + 1, role: reference.role }))) !== null && _b !== void 0 ? _b : [],
    });
}
function storyboardMessages(input, references, qualityIssue) {
    const userText = qualityIssue
        ? `${storyboardUserPrompt(input)}\nQuality correction required: ${qualityIssue} Rebuild the complete plan from scratch and satisfy every JSON field exactly.`
        : storyboardUserPrompt(input);
    return [
        { role: 'system', content: storyboardSystemPrompt(input) },
        {
            role: 'user',
            content: references.length
                ? [
                    { type: 'text', text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url',
                        image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'low' },
                    })),
                ]
                : userText,
        },
    ];
}
function storyboardQualityIssue(plan, count) {
    if (!plan || plan.scenes.length !== count)
        return 'Scene count or response shape is invalid.';
    if (new Set(plan.scenes.map((scene) => scene.title.replace(/\s+/g, '').toLowerCase())).size !== count) {
        return 'Scene titles are duplicated.';
    }
    if (new Set(plan.scenes.map((scene) => scene.imagePrompt.replace(/\s+/g, '').toLowerCase())).size !== count) {
        return 'Image prompts are duplicated.';
    }
    if (plan.scenes.some((scene) => scene.imagePrompt.split(/\s+/).length < 18)) {
        return 'One or more image prompts are not detailed enough.';
    }
    return null;
}
function sceneRedesignContext(scene) {
    if (!scene)
        return null;
    return {
        title: scene.title,
        duration: scene.duration,
        narrativeBeat: scene.narrativeBeat,
        shotSize: scene.shotSize,
        cameraDirection: scene.cameraDirection,
        visualPrompt: scene.visualPrompt,
        imagePrompt: scene.imagePrompt,
        continuityAnchor: scene.continuityAnchor,
        transition: scene.transition,
    };
}
function storyboardSceneRedesignMessages(input, references, qualityIssue) {
    var _a, _b;
    const userText = JSON.stringify({
        topic: input.topic,
        frame: input.aspectRatio,
        stylePreset: input.stylePreset,
        format: input.format,
        continuityBible: {
            artDirection: input.artDirection,
            characterContinuity: input.characterContinuity,
            settingContinuity: input.settingContinuity,
            colorAndLighting: input.colorAndLighting,
        },
        previousScene: sceneRedesignContext(input.previousScene),
        currentScene: sceneRedesignContext(input.scene),
        nextScene: sceneRedesignContext(input.nextScene),
        redesignInstruction: input.instruction || 'Improve this scene with a clearer visual hierarchy and a more distinctive, feasible moment.',
        referenceRoles: (_b = (_a = input.referenceImages) === null || _a === void 0 ? void 0 : _a.map((reference, index) => ({ index: index + 1, role: reference.role }))) !== null && _b !== void 0 ? _b : [],
        qualityIssue,
    });
    const systemPrompt = [
        'You are a Korean commercial storyboard director revising exactly one production scene.',
        'Preserve the continuity bible and the before/after relationship with neighbouring scenes, but rebuild the current scene to satisfy the redesign instruction.',
        `Compose for ${input.aspectRatio}; visual style: ${input.stylePreset}.`,
        references.length
            ? 'Treat attached reference images as visual source-of-truth. Preserve labelled subjects, product geometry, architecture, materials, and palette. Do not merge distinct subjects or invent logos/readable text.'
            : 'Use the supplied continuity bible as the source of truth for recurring identity, setting, and lighting.',
        'Deliver one feasible, focused frame rather than a collage. State what must remain visually fixed and how it transitions to adjacent scenes.',
        'Write user-facing fields in Korean. imagePrompt and negativePrompt must be English.',
        'imagePrompt must be a detailed single image-generation prompt with subject, action, foreground/midground/background, composition or lens, lighting, material cues, and finish.',
        'negativePrompt must be compact English comma-separated exclusions.',
        'dialogueOrCaption must contain only the exact spoken words, without speaker labels, action descriptions, quotation marks, narration, subtitles, or camera directions. Use an empty string when nobody speaks.',
        'Return exactly one JSON object with no markdown or commentary.',
        'Shape: {"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}',
    ].join('\n');
    return [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: references.length
                ? [
                    { type: 'text', text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url',
                        image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'low' },
                    })),
                ]
                : userText,
        },
    ];
}
function storyboardSceneRedesignQualityIssue(scene) {
    if (!scene)
        return 'The response must include every required scene field using the requested JSON shape.';
    if (scene.imagePrompt.trim().split(/\s+/).length < 18)
        return 'The imagePrompt is too sparse; add concrete composition, light, material, and environment details.';
    if (!scene.continuityAnchor.trim() || !scene.transition.trim())
        return 'State a concrete continuity anchor and transition to neighbouring scenes.';
    return null;
}
async function handleGenerateImageStoryboard(req, res) {
    var _a;
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const input = (0, hostingCommon_1.parseJson)(req, StoryboardRequestSchema, '주제와 장면 수를 확인해 주세요.');
    const rateLimit = await (0, security_1.enforceUserRateLimit)({
        namespace: 'image-storyboard-plan',
        uid: auth.uid,
        maxRequests: 10,
        windowMs: 60000,
    });
    if (!rateLimit.allowed)
        throw new hostingCommon_1.ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const references = await parseStoryboardReferences((_a = input.referenceImages) !== null && _a !== void 0 ? _a : []);
    const options = {
        temperature: 0.38,
        maxTokens: Math.min(6800, 1350 + input.sceneCount * 560),
        responseFormat: 'json_object',
    };
    const requestPlan = (qualityIssue) => (0, hostingAiRuntime_1.runOpenRouterText)(Object.assign({ messages: storyboardMessages(input, references, qualityIssue) }, options));
    let result = await requestPlan();
    let plan = parseStoryboardPlanResponse(result.content);
    let issue = storyboardQualityIssue(plan, input.sceneCount);
    if (issue) {
        result = await requestPlan(issue);
        plan = parseStoryboardPlanResponse(result.content);
        issue = storyboardQualityIssue(plan, input.sceneCount);
    }
    if (!plan || issue)
        throw new hostingCommon_1.ApiError(422, 'AI 응답 형식이 장면 설계 기준과 맞지 않았습니다. 잠시 후 다시 시도하거나 장면 수를 줄여 주세요.');
    res.status(200).json({
        success: true,
        plan,
        provider: 'openrouter',
        model: result.model,
        referenceAnalysis: references.length ? 'visual' : 'brief-only',
    });
}
async function handleRedesignImageStoryboardScene(req, res) {
    var _a;
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const input = (0, hostingCommon_1.parseJson)(req, StoryboardSceneRedesignRequestSchema, '장면 재설계 입력값을 확인해 주세요.');
    const rateLimit = await (0, security_1.enforceUserRateLimit)({
        namespace: 'image-storyboard-scene-redesign',
        uid: auth.uid,
        maxRequests: 16,
        windowMs: 60000,
    });
    if (!rateLimit.allowed)
        throw new hostingCommon_1.ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const references = await parseStoryboardReferences((_a = input.referenceImages) !== null && _a !== void 0 ? _a : []);
    const options = { temperature: 0.4, maxTokens: 1800, responseFormat: 'json_object' };
    const requestScene = (qualityIssue) => (0, hostingAiRuntime_1.runOpenRouterText)(Object.assign({ messages: storyboardSceneRedesignMessages(input, references, qualityIssue) }, options));
    let result = await requestScene();
    let scene = parseStoryboardSceneResponse(result.content);
    let issue = storyboardSceneRedesignQualityIssue(scene);
    if (issue) {
        result = await requestScene(issue);
        scene = parseStoryboardSceneResponse(result.content);
        issue = storyboardSceneRedesignQualityIssue(scene);
    }
    if (!scene || issue)
        throw new hostingCommon_1.ApiError(422, 'AI 응답 형식이 장면 재설계 기준과 맞지 않았습니다. 잠시 후 다시 시도해 주세요.');
    res.status(200).json({
        success: true,
        scene,
        provider: 'openrouter',
        model: result.model,
        referenceAnalysis: references.length ? 'visual' : 'brief-only',
    });
}
function storyboardFlowContext(scene) {
    if (!scene)
        return null;
    return {
        title: scene.title,
        duration: scene.duration,
        narrativeBeat: scene.narrativeBeat,
        shotSize: scene.shotSize,
        cameraDirection: scene.cameraDirection,
        dialogueOrCaption: scene.dialogueOrCaption,
        visualPrompt: scene.visualPrompt,
        imagePrompt: scene.imagePrompt,
        continuityAnchor: scene.continuityAnchor,
        transition: scene.transition,
    };
}
function storyboardFlowMessages(input, references, qualityIssue) {
    var _a, _b;
    const userText = JSON.stringify({
        topic: input.topic,
        frame: input.aspectRatio,
        stylePreset: input.stylePreset,
        format: input.format,
        continuityBible: {
            artDirection: input.artDirection,
            characterContinuity: input.characterContinuity,
            settingContinuity: input.settingContinuity,
            colorAndLighting: input.colorAndLighting,
        },
        fixedPreviousScene: storyboardFlowContext(input.previousScene),
        scenesToReplan: input.scenes.map(storyboardFlowContext),
        fixedNextScene: storyboardFlowContext(input.nextScene),
        redesignInstruction: input.instruction || 'Rebuild the progression with clearer emotional escalation, purposeful dialogue placement, and natural scene-to-scene visual continuity.',
        referenceRoles: (_b = (_a = input.referenceImages) === null || _a === void 0 ? void 0 : _a.map((reference, index) => ({ index: index + 1, role: reference.role }))) !== null && _b !== void 0 ? _b : [],
        qualityIssue,
    });
    const systemPrompt = [
        'You are a Korean commercial storyboard director revising a consecutive sequence for AI video production.',
        `Replan exactly ${input.scenes.length} supplied scenes in the same order. Do not add, remove, merge, or change the overall premise.`,
        'The preceding and following scenes, when supplied, are fixed anchors. Preserve the continuity bible and make the sequence flow naturally between them.',
        'Each scene must be one feasible, focused shot with a distinct progression beat. Dialogue must serve the visual moment rather than repeat narration.',
        `Compose for ${input.aspectRatio} and the ${input.stylePreset} style preset.`,
        references.length
            ? 'Treat attached references as visual source of truth. Preserve labelled subjects, product geometry, architecture, materials, and palette. Do not invent logos or readable text.'
            : 'Use the supplied continuity bible as the source of truth for recurring identity, setting, and lighting.',
        'Write user-facing fields in Korean. imagePrompt and negativePrompt must be English.',
        'imagePrompt must contain subject, action, foreground/midground/background, composition or lens, lighting, material cues, and visual finish. Keep it between 120 and 900 English characters.',
        'dialogueOrCaption must contain only the exact spoken words, without speaker labels, action descriptions, quotation marks, narration, subtitles, or camera directions. Use an empty string when nobody speaks and keep spoken lines brief enough for the stated duration.',
        'Return exactly one valid JSON object without markdown or commentary using this shape:',
        '{"scenes":[{"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}]}',
    ].join('\n');
    return [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: references.length
                ? [
                    { type: 'text', text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url',
                        image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'low' },
                    })),
                ]
                : userText,
        },
    ];
}
function storyboardFlowQualityIssue(flow, count) {
    if (!flow || flow.scenes.length !== count)
        return 'The response must return exactly the requested number of scenes using the required JSON shape.';
    if (new Set(flow.scenes.map((scene) => scene.title.replace(/\s+/g, '').toLowerCase())).size !== count)
        return 'Scene titles are duplicated.';
    if (new Set(flow.scenes.map((scene) => scene.imagePrompt.replace(/\s+/g, '').toLowerCase())).size !== count)
        return 'Each scene requires a distinct image prompt and visual moment.';
    const incomplete = flow.scenes.find((scene) => scene.imagePrompt.trim().split(/\s+/).length < 18 || !scene.continuityAnchor.trim() || !scene.transition.trim());
    return incomplete ? `${incomplete.title} needs a concrete image prompt, continuity anchor, and transition.` : null;
}
async function handleRedesignImageStoryboardFlow(req, res) {
    var _a;
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    const input = (0, hostingCommon_1.parseJson)(req, StoryboardFlowRedesignRequestSchema, '흐름 재기획 입력값을 확인해 주세요. 한 번에 최대 12개 장면까지 재기획할 수 있습니다.');
    const rateLimit = await (0, security_1.enforceUserRateLimit)({
        namespace: 'image-storyboard-flow-redesign',
        uid: auth.uid,
        maxRequests: 8,
        windowMs: 60000,
    });
    if (!rateLimit.allowed)
        throw new hostingCommon_1.ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const references = await parseStoryboardReferences((_a = input.referenceImages) !== null && _a !== void 0 ? _a : []);
    const options = {
        temperature: 0.36,
        maxTokens: Math.min(6800, 1350 + input.scenes.length * 560),
        responseFormat: 'json_object',
    };
    const requestFlow = (qualityIssue) => (0, hostingAiRuntime_1.runOpenRouterText)(Object.assign({ messages: storyboardFlowMessages(input, references, qualityIssue) }, options));
    let result = await requestFlow();
    let flow = parseStoryboardFlowResponse(result.content);
    let issue = storyboardFlowQualityIssue(flow, input.scenes.length);
    if (issue) {
        result = await requestFlow(issue);
        flow = parseStoryboardFlowResponse(result.content);
        issue = storyboardFlowQualityIssue(flow, input.scenes.length);
    }
    if (!flow || issue)
        throw new hostingCommon_1.ApiError(422, 'AI 응답 형식이 장면 흐름 재설계 기준과 맞지 않았습니다. 잠시 후 다시 시도해 주세요.');
    res.status(200).json({
        success: true,
        flow,
        provider: 'openrouter',
        model: result.model,
        referenceAnalysis: references.length ? 'visual' : 'brief-only',
    });
}
const ProjectBoardRequestSchema = zod_1.z.object({
    mode: zod_1.z.enum(['project', 'portfolio']),
    section: zod_1.z.enum(['current', 'plan', 'goal']),
    title: zod_1.z.string().optional(),
    categoryName: zod_1.z.string().optional(),
    owner: zod_1.z.string().optional(),
    dueDate: zod_1.z.string().optional(),
    stageLabel: zod_1.z.string().optional(),
    statusLabel: zod_1.z.string().optional(),
    summary: zod_1.z.string().optional(),
    currentBody: zod_1.z.string().optional(),
    planBody: zod_1.z.string().optional(),
    goalBody: zod_1.z.string().optional(),
    tasks: zod_1.z.array(zod_1.z.object({ title: zod_1.z.string().optional(), done: zod_1.z.boolean().optional() })).optional(),
});
const ALLOWED_HTML_TAGS = new Set([
    'article', 'section', 'header', 'div', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'strong', 'em', 'b', 'i',
    'span', 'small', 'br',
]);
function sanitizeHtml(value) {
    if (typeof value !== 'string')
        return undefined;
    const cleaned = value
        .replace(/```(?:html)?/gi, '')
        .replace(/```/g, '')
        .replace(/<!doctype[^>]*>/gi, '')
        .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)\b[\s\S]*?<\/(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)>/gi, '')
        .replace(/<(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)\b[^>]*\/?>/gi, '')
        .replace(/<\/?([a-z][a-z0-9-]*)([^>]*)>/gi, (match, rawTag, rawAttrs) => {
        const tag = String(rawTag).toLowerCase();
        if (!ALLOWED_HTML_TAGS.has(tag))
            return '';
        if (match.startsWith('</'))
            return `</${tag}>`;
        if (tag === 'br')
            return '<br>';
        const attributes = Array.from(String(rawAttrs).matchAll(/\s(rowspan|colspan)=["']?(\d{1,2})["']?/gi))
            .map(([, name, rawValue]) => {
            if (tag !== 'td' && tag !== 'th')
                return '';
            return ` ${String(name).toLowerCase()}="${Math.max(1, Math.min(8, Number(rawValue) || 1))}"`;
        })
            .join('');
        return `<${tag}${attributes}>`;
    })
        .trim();
    return cleaned || undefined;
}
function projectSourceBody(payload) {
    var _a, _b, _c;
    if (payload.section === 'current')
        return ((_a = payload.currentBody) === null || _a === void 0 ? void 0 : _a.trim()) || '';
    if (payload.section === 'plan')
        return ((_b = payload.planBody) === null || _b === void 0 ? void 0 : _b.trim()) || '';
    return ((_c = payload.goalBody) === null || _c === void 0 ? void 0 : _c.trim()) || '';
}
async function handleGenerateProjectBoardContent(req, res) {
    var _a;
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireAccess)(req, 'projectBoardManagement');
    const payload = (0, hostingCommon_1.parseJson)(req, ProjectBoardRequestSchema);
    const title = (_a = payload.title) === null || _a === void 0 ? void 0 : _a.trim();
    const sourceBody = projectSourceBody(payload);
    if (!title)
        throw new hostingCommon_1.ApiError(400, '프로젝트 제목을 먼저 입력하세요.');
    if (!sourceBody)
        throw new hostingCommon_1.ApiError(400, 'HTML로 구성할 본문을 먼저 입력하세요.');
    const rateLimit = await (0, security_1.enforceUserRateLimit)({
        namespace: 'project-board-content',
        uid: auth.uid,
        maxRequests: 10,
        windowMs: 60000,
    });
    if (!rateLimit.allowed)
        throw new hostingCommon_1.ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const responseKey = payload.section === 'current' ? 'currentHtml' : payload.section === 'plan' ? 'planHtml' : 'goalHtml';
    const result = await (0, hostingAiRuntime_1.runOpenRouterText)({
        messages: [
            {
                role: 'system',
                content: [
                    'You are a Korean corporate HTML layout designer.',
                    'Return exactly one JSON object and only the requested section.',
                    `Response shape: {"${responseKey}":"<section>...</section>"}.`,
                    'Transform supplied source text into display-only semantic HTML without inventing facts.',
                    `Allowed tags: ${Array.from(ALLOWED_HTML_TAGS).join(', ')}.`,
                    'Do not use class, id, style, data/event attributes, links, images, forms, scripts, SVG, or external resources.',
                    'Keep Korean copy concise and professional.',
                ].join('\n'),
            },
            {
                role: 'user',
                content: JSON.stringify(Object.assign(Object.assign({}, payload), { sourceBody }), null, 2),
            },
        ],
        temperature: 0.28,
        maxTokens: 3600,
    });
    const raw = extractJsonObject(result.content);
    const record = typeof raw === 'object' && raw !== null ? raw : {};
    const html = sanitizeHtml(record[responseKey]);
    if (!html)
        throw new hostingCommon_1.ApiError(502, 'AI가 사용할 수 있는 HTML 디자인을 반환하지 않았습니다.');
    res.status(200).json({
        success: true,
        provider: 'openrouter',
        model: result.model,
        content: { [responseKey]: html },
    });
}
//# sourceMappingURL=hostingGenerationRoutes.js.map