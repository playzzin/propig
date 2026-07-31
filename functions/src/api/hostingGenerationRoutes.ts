import { randomUUID } from 'node:crypto';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import { recordOpenRouterUsage } from '../openrouterUsage';
import { generateOpenRouterVideo } from '../videoStudio/openrouter';
import {
    ApiError,
    parseJson,
    requireAccess,
    requireMethod,
    requireUser,
} from './hostingCommon';
import { enforceUserRateLimit, fetchExternalHttpUrl, normalizeExternalHttpUrl } from './security';
import { getHostingAiRuntime, runOpenRouterText } from './hostingAiRuntime';

const ImageReferenceRoleSchema = z.enum(['building', 'product', 'character', 'background', 'style']);
const GenerateImageSchema = z.object({
    prompt: z.string().trim().min(1).max(4000),
    negativePrompt: z.string().max(1500).optional(),
    aspectRatio: z.string().max(20).optional(),
    width: z.number().int().min(64).max(4096).optional(),
    height: z.number().int().min(64).max(4096).optional(),
    stylePreset: z.string().max(100).optional(),
    image: z.string().optional(),
    referenceImageBase64: z.string().optional(),
    referenceImageMimeType: z.string().optional(),
    referenceImages: z.array(z.object({
        role: ImageReferenceRoleSchema,
        image: z.string().min(1),
    })).max(5).optional(),
    numberOfImages: z.number().int().min(1).max(4).default(1),
    provider: z.literal('openrouter').optional().default('openrouter'),
});

type ParsedReference = {
    role: z.infer<typeof ImageReferenceRoleSchema>;
    base64: string;
    mimeType: string;
    byteLength: number;
};
type OpenRouterImageResponse = {
    data?: Array<{ b64_json?: string; media_type?: string; url?: string }>;
    usage?: { cost?: number };
    error?: { message?: string };
};
type OpenRouterImageRequestError = Error & { status: number };
type OpenRouterImageModel = {
    id: string;
    architecture?: { input_modalities?: string[]; output_modalities?: string[] };
    supported_parameters?: Record<string, unknown>;
};
type SelectedOpenRouterImageModel = {
    id: string;
    supportedParameters: Set<string> | null;
    selectionSource: 'discovered' | 'fallback';
};

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
const PREFERRED_AUTO_IMAGE_MODELS = [
    'openai/gpt-5-image',
    'openai/gpt-image-2',
    'openai/gpt-image-1',
    'google/gemini-3.1-flash-image',
    'google/gemini-2.5-flash-image',
    'bytedance-seed/seedream-4.5',
];
const IMAGE_MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedImageModels: { expiresAt: number; models: OpenRouterImageModel[] } | null = null;

async function readReferenceResponse(response: globalThis.Response): Promise<Buffer> {
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_REFERENCE_BYTES) {
        await response.body?.cancel();
        throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
    }
    const reader = response.body?.getReader();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_REFERENCE_BYTES) throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
        return buffer;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_REFERENCE_BYTES) {
            await reader.cancel();
            throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}

async function parseReference(
    role: ParsedReference['role'],
    rawValue: string,
    fallbackMimeType = 'image/png',
): Promise<ParsedReference> {
    const value = rawValue.trim();
    const dataUrl = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrl) {
        const mimeType = dataUrl[1].toLowerCase();
        const base64 = dataUrl[2].replace(/\s+/g, '');
        if (!ALLOWED_REFERENCE_TYPES.has(mimeType)) throw new ApiError(415, 'Unsupported reference image type.');
        const byteLength = Buffer.byteLength(base64, 'base64');
        if (byteLength > MAX_REFERENCE_BYTES) throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
        return { role, base64, mimeType, byteLength };
    }
    if (/^https?:\/\//i.test(value)) {
        const response = await fetchExternalHttpUrl(normalizeExternalHttpUrl(value), {
            headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8' },
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new ApiError(502, `Reference image could not be fetched (${response.status}).`);
        }
        const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
        if (!ALLOWED_REFERENCE_TYPES.has(mimeType)) {
            await response.body?.cancel();
            throw new ApiError(415, 'Unsupported reference image type.');
        }
        const buffer = await readReferenceResponse(response);
        return { role, base64: buffer.toString('base64'), mimeType, byteLength: buffer.length };
    }
    const mimeType = ALLOWED_REFERENCE_TYPES.has(fallbackMimeType) ? fallbackMimeType : 'image/png';
    const base64 = value.replace(/\s+/g, '');
    const byteLength = Buffer.byteLength(base64, 'base64');
    if (byteLength > MAX_REFERENCE_BYTES) throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
    return { role, base64, mimeType, byteLength };
}

async function parseReferences(payload: z.infer<typeof GenerateImageSchema>): Promise<ParsedReference[]> {
    const inputs = payload.referenceImages?.length
        ? payload.referenceImages
        : payload.image
            ? [{ role: 'style' as const, image: payload.image }]
            : payload.referenceImageBase64
                ? [{ role: 'style' as const, image: payload.referenceImageBase64 }]
                : [];
    const references: ParsedReference[] = [];
    let total = 0;
    for (const item of inputs) {
        const reference = await parseReference(
            item.role,
            item.image,
            payload.referenceImageMimeType || 'image/png',
        );
        total += reference.byteLength;
        if (total > MAX_TOTAL_REFERENCE_BYTES) {
            throw new ApiError(413, 'Combined reference images exceed the 16 MB limit.');
        }
        references.push(reference);
    }
    return references;
}

async function parseStoryboardReferences(
    inputs: Array<{ role: ParsedReference['role']; image: string }>,
): Promise<ParsedReference[]> {
    const references: ParsedReference[] = [];
    let total = 0;
    for (const item of inputs) {
        const reference = await parseReference(item.role, item.image);
        total += reference.byteLength;
        if (total > MAX_TOTAL_REFERENCE_BYTES) {
            throw new ApiError(413, 'Combined reference images exceed the 16 MB limit.');
        }
        references.push(reference);
    }
    return references;
}

const STYLE_INSTRUCTIONS: Record<string, string> = {
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

function buildImagePrompt(payload: z.infer<typeof GenerateImageSchema>, references: ParsedReference[]): string {
    const parts = [payload.prompt];
    if (payload.stylePreset && payload.stylePreset !== 'none') {
        parts.push(STYLE_INSTRUCTIONS[payload.stylePreset] || `Style: ${payload.stylePreset}`);
    }
    if (payload.aspectRatio) parts.push(`Aspect ratio: ${payload.aspectRatio}`);
    if (payload.width && payload.height) parts.push(`Target size: ${payload.width}x${payload.height}`);
    if (payload.negativePrompt?.trim()) parts.push(`Avoid: ${payload.negativePrompt.trim()}`);
    if (references.length) {
        parts.push(
            `Reference images are the visual source of truth (${references.map((item, index) => `#${index + 1} ${item.role}`).join(', ')}). ` +
            'Preserve each referenced building, product, character, background, and style faithfully. Keep distinct subjects separate and do not invent logos or readable text.',
        );
    }
    parts.push('Return image output only.');
    return parts.join('\n');
}

function imageInfraHint(message: string) {
    const lower = message.toLowerCase();
    if (lower.includes('missing') || lower.includes('not configured')) return { reasonCode: 'missing_api_key', error: 'OPENROUTER_API_KEY가 설정되지 않았습니다.' };
    if (lower.includes('permission') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) return { reasonCode: 'permission_denied', error: 'OpenRouter API 인증 또는 권한을 확인하세요.' };
    if (lower.includes('rate') || lower.includes('429')) return { reasonCode: 'rate_limited', error: 'OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.' };
    if (lower.includes('timeout')) return { reasonCode: 'request_timeout', error: 'OpenRouter 이미지 생성 시간이 초과되었습니다.' };
    if (lower.includes('invalid') || lower.includes('400')) return { reasonCode: 'invalid_request', error: 'OpenRouter가 이미지 생성 요청을 거부했습니다.' };
    return { reasonCode: 'unknown', error: 'OpenRouter 이미지 생성에 실패했습니다.' };
}

function hasImageParameter(model: OpenRouterImageModel, parameter: string): boolean {
    return Boolean(model.supported_parameters && parameter in model.supported_parameters);
}

function supportsRequestedImageInput(
    model: OpenRouterImageModel,
    payload: z.infer<typeof GenerateImageSchema>,
    references: ParsedReference[],
): boolean {
    const outputModalities = model.architecture?.output_modalities || [];
    if (!outputModalities.includes('image')) return false;
    if (references.length) {
        const inputModalities = model.architecture?.input_modalities || [];
        if (!inputModalities.includes('image') || !hasImageParameter(model, 'input_references')) return false;
    }
    if (payload.numberOfImages > 1 && !hasImageParameter(model, 'n')) return false;
    return true;
}

function scoreImageModel(model: OpenRouterImageModel, payload: z.infer<typeof GenerateImageSchema>): number {
    const preferredIndex = PREFERRED_AUTO_IMAGE_MODELS.indexOf(model.id);
    const preferenceScore = preferredIndex >= 0 ? PREFERRED_AUTO_IMAGE_MODELS.length - preferredIndex : 0;
    const canHonorRequestedFrame = Boolean(
        (payload.aspectRatio && /^\d{1,2}:\d{1,2}$/.test(payload.aspectRatio) && hasImageParameter(model, 'aspect_ratio')) ||
        (payload.width && payload.height && hasImageParameter(model, 'size')),
    );
    return (canHonorRequestedFrame ? 1_000 : 0) + (hasImageParameter(model, 'output_format') ? 100 : 0) + preferenceScore;
}

async function discoverOpenRouterImageModels(apiKey: string): Promise<OpenRouterImageModel[]> {
    if (cachedImageModels && cachedImageModels.expiresAt > Date.now()) return cachedImageModels.models;

    const response = await fetch('https://openrouter.ai/api/v1/images/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`OpenRouter image model discovery failed (${response.status}).`);
    const payload = await response.json() as { data?: OpenRouterImageModel[] };
    const models = Array.isArray(payload.data) ? payload.data.filter((model) => Boolean(model?.id)) : [];
    if (!models.length) throw new Error('OpenRouter returned no image models.');

    cachedImageModels = { models, expiresAt: Date.now() + IMAGE_MODEL_CACHE_TTL_MS };
    return models;
}

async function selectOpenRouterImageModel(params: {
    apiKey: string;
    payload: z.infer<typeof GenerateImageSchema>;
    references: ParsedReference[];
}): Promise<SelectedOpenRouterImageModel> {
    try {
        const models = await discoverOpenRouterImageModels(params.apiKey);
        const selected = models
            .filter((model) => supportsRequestedImageInput(model, params.payload, params.references))
            .sort((left, right) => scoreImageModel(right, params.payload) - scoreImageModel(left, params.payload))[0];
        if (selected) {
            return {
                id: selected.id,
                supportedParameters: new Set(Object.keys(selected.supported_parameters || {})),
                selectionSource: 'discovered',
            };
        }
    } catch (error) {
        console.warn('[hostingApi] OpenRouter image model discovery failed; using the compatibility fallback.', error);
    }

    return {
        id: AUTO_IMAGE_MODEL_FALLBACK,
        supportedParameters: null,
        selectionSource: 'fallback',
    };
}

function buildOpenRouterImageBody(params: {
    model: string;
    supportedParameters: Set<string> | null;
    payload: z.infer<typeof GenerateImageSchema>;
    prompt: string;
    references: ParsedReference[];
}, includePresentationOptions: boolean): Record<string, unknown> {
    const supports = (parameter: string) => !params.supportedParameters || params.supportedParameters.has(parameter);
    const body: Record<string, unknown> = {
        model: params.model,
        prompt: params.prompt,
    };
    if (params.payload.numberOfImages > 1 || supports('n')) body.n = params.payload.numberOfImages;

    // Presentation controls differ by OpenRouter image model. The first
    // request preserves the requested frame; a compatible retry drops only
    // controls the provider has explicitly rejected.
    if (includePresentationOptions) {
        if (supports('output_format')) body.output_format = 'png';
        if (params.payload.aspectRatio && /^\d{1,2}:\d{1,2}$/.test(params.payload.aspectRatio) && supports('aspect_ratio')) {
            body.aspect_ratio = params.payload.aspectRatio;
        } else if (params.payload.width && params.payload.height && supports('size')) {
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

async function requestOpenRouterImages(apiKey: string, body: Record<string, unknown>): Promise<OpenRouterImageResponse> {
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
    let data: OpenRouterImageResponse = {};
    try {
        data = JSON.parse(raw) as OpenRouterImageResponse;
    } catch {
        // The provider error below handles non-JSON responses.
    }
    if (!response.ok) {
        const error = new Error(data.error?.message || raw.slice(0, 1000) || `OpenRouter HTTP ${response.status}`) as OpenRouterImageRequestError;
        error.status = response.status;
        throw error;
    }
    return data;
}

function canRetryWithoutPresentationOptions(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const status = (error as Partial<OpenRouterImageRequestError>).status;
    if (status !== 400 && status !== 422) return false;
    return /(?:unsupported|unknown|invalid).{0,80}(?:parameter|size|aspect|format|resolution)|(?:size|aspect_ratio|output_format|resolution).{0,80}(?:unsupported|invalid|not allowed)/i.test(error.message);
}

export async function handleGenerateImage(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const rateLimit = await enforceUserRateLimit({
        namespace: 'hosting-generate-image',
        uid: auth.uid,
        maxRequests: 12,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
        res.set('Retry-After', String(rateLimit.retryAfterSeconds));
        throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    }
    const payload = parseJson(req, GenerateImageSchema);
    const runtime = await getHostingAiRuntime();
    if (!runtime.openRouterApiKey) throw new ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    try {
        const references = await parseReferences(payload);
        const prompt = buildImagePrompt(payload, references);
        const selectedImageModel = await selectOpenRouterImageModel({
            apiKey: runtime.openRouterApiKey,
            payload,
            references,
        });
        const requestParams = {
            model: selectedImageModel.id,
            supportedParameters: selectedImageModel.supportedParameters,
            payload,
            prompt,
            references,
        };
        let compatibilityFallback = false;
        let data: OpenRouterImageResponse;
        try {
            data = await requestOpenRouterImages(runtime.openRouterApiKey, buildOpenRouterImageBody(requestParams, true));
        } catch (error) {
            if (!canRetryWithoutPresentationOptions(error)) throw error;
            data = await requestOpenRouterImages(runtime.openRouterApiKey, buildOpenRouterImageBody(requestParams, false));
            compatibilityFallback = true;
        }
        const images = (data.data || []).flatMap((item) => {
            const mimeType = item.media_type || 'image/png';
            const url = item.url || (item.b64_json ? `data:${mimeType};base64,${item.b64_json}` : '');
            return url ? [{
                id: randomUUID(),
                url,
                mimeType,
                ...(item.b64_json ? { base64: item.b64_json } : {}),
            }] : [];
        });
        if (!images.length) throw new Error('OpenRouter returned no image data.');
        await recordOpenRouterUsage({
            operation: 'image',
            model: selectedImageModel.id,
            costUsd: data.usage?.cost,
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
                costUsd: data.usage?.cost,
                referenceImageCount: references.length,
                referenceRoles: references.map((item) => item.role),
                compatibilityFallback,
            },
        });
    } catch (error) {
        if (error instanceof ApiError) throw error;
        const rawMessage = error instanceof Error ? error.message : String(error);
        const hint = imageInfraHint(rawMessage);
        res.status(500).json({ success: false, ...hint, details: rawMessage });
    }
}

const VideoReferenceImageSchema = z.string().trim().min(1).max(280_000).refine(
    (value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || /^https:\/\//i.test(value),
    'Visual references must be HTTPS URLs or image data URLs.',
);

const GenerateVideoSchema = z.object({
    prompt: z.string().trim().min(1).max(4000),
    image: z.string().optional(),
    endImage: z.string().optional(),
    referenceImages: z.array(VideoReferenceImageSchema).max(2).optional(),
    provider: z.literal('openrouter').optional().default('openrouter'),
    mode: z.enum(['generate', 'extend', 'edit']).default('generate'),
    videoUrl: z.string().url().optional(),
    duration: z.number().int().min(1).max(15).optional(),
    aspectRatio: z.string().max(20).optional(),
    resolution: z.enum(['480p', '720p', '1080p']).optional(),
    qualityMode: z.enum(['proof', 'final']).optional(),
    generateAudio: z.boolean().optional(),
    audioMode: z.enum(['silent', 'ambient', 'dialogue']).optional(),
    dialogue: z.string().trim().max(240).optional(),
}).superRefine((value, context) => {
    if (value.audioMode === 'dialogue' && !value.dialogue?.trim()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dialogue'],
            message: '대사·립싱크 모드에는 말할 대사가 필요합니다.',
        });
    }
});

export async function handleGenerateVideo(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const rateLimit = await enforceUserRateLimit({
        namespace: 'hosting-generate-video',
        uid: auth.uid,
        maxRequests: 4,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const payload = parseJson(req, GenerateVideoSchema);
    if (payload.mode !== 'generate') {
        throw new ApiError(400, 'OpenRouter 영상 API에서는 새 클립 생성 또는 참조 이미지 기반 생성을 사용해 주세요.');
    }
    const result = await generateOpenRouterVideo(payload);
    res.status(200).json({
        success: true,
        provider: 'openrouter',
        videoId: result.metadata.requestId,
        videoUrl: result.videoUrl,
        metadata: result.metadata,
    });
}

const StoryboardRequestSchema = z.object({
    topic: z.string().trim().min(2).max(240),
    sceneCount: z.number().int().min(1).max(12),
    aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:3', '3:4']),
    stylePreset: z.string().trim().min(1).max(80),
    format: z.enum(['brand-film', 'product-launch', 'social-short', 'editorial']).default('brand-film'),
    referenceImages: z.array(z.object({
        role: ImageReferenceRoleSchema,
        image: z.string().trim().min(1).max(1_600_000),
    })).max(4).optional(),
});

const StoryboardSceneSchema = z.object({
    title: z.string().trim().min(1).max(80),
    duration: z.string().trim().min(1).max(40),
    narrativeBeat: z.string().trim().min(1).max(280),
    shotSize: z.string().trim().min(1).max(80),
    cameraDirection: z.string().trim().max(180),
    dialogueOrCaption: z.string().trim().max(240),
    visualPrompt: z.string().trim().min(1).max(900),
    imagePrompt: z.string().trim().min(80).max(1200),
    continuityAnchor: z.string().trim().min(1).max(280),
    transition: z.string().trim().min(1).max(180),
    negativePrompt: z.string().trim().max(360),
});

const StoryboardPlanSchema = z.object({
    title: z.string().trim().min(1).max(100),
    logline: z.string().trim().max(280),
    audience: z.string().trim().max(120),
    artDirection: z.string().trim().max(320),
    characterContinuity: z.string().trim().max(320),
    settingContinuity: z.string().trim().max(320),
    colorAndLighting: z.string().trim().max(220),
    scenes: z.array(StoryboardSceneSchema).min(1).max(12),
});

const SceneRedesignInputSchema = z.object({
    title: z.string().trim().min(1).max(80),
    duration: z.string().trim().max(40).default(''),
    narrativeBeat: z.string().trim().max(280).default(''),
    shotSize: z.string().trim().max(80).default(''),
    cameraDirection: z.string().trim().max(180).default(''),
    dialogueOrCaption: z.string().trim().max(240).default(''),
    visualPrompt: z.string().trim().max(900).default(''),
    imagePrompt: z.string().trim().max(1200).default(''),
    continuityAnchor: z.string().trim().max(280).default(''),
    transition: z.string().trim().max(180).default(''),
    negativePrompt: z.string().trim().max(360).default(''),
});

const StoryboardSceneRedesignRequestSchema = z.object({
    topic: z.string().trim().min(2).max(240),
    aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:3', '3:4']),
    stylePreset: z.string().trim().min(1).max(80),
    format: z.enum(['brand-film', 'product-launch', 'social-short', 'editorial']).default('brand-film'),
    artDirection: z.string().trim().max(320).default(''),
    characterContinuity: z.string().trim().max(320).default(''),
    settingContinuity: z.string().trim().max(320).default(''),
    colorAndLighting: z.string().trim().max(220).default(''),
    scene: SceneRedesignInputSchema,
    previousScene: SceneRedesignInputSchema.optional(),
    nextScene: SceneRedesignInputSchema.optional(),
    instruction: z.string().trim().max(600).default(''),
    referenceImages: z.array(z.object({
        role: ImageReferenceRoleSchema,
        image: z.string().trim().min(1).max(1_600_000),
    })).max(4).optional(),
});

const StoryboardFlowRedesignRequestSchema = z.object({
    topic: z.string().trim().min(2).max(240),
    aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:3', '3:4']),
    stylePreset: z.string().trim().min(1).max(80),
    format: z.enum(['brand-film', 'product-launch', 'social-short', 'editorial']).default('brand-film'),
    artDirection: z.string().trim().max(320).default(''),
    characterContinuity: z.string().trim().max(320).default(''),
    settingContinuity: z.string().trim().max(320).default(''),
    colorAndLighting: z.string().trim().max(220).default(''),
    previousScene: SceneRedesignInputSchema.optional(),
    scenes: z.array(SceneRedesignInputSchema).min(1).max(12),
    nextScene: SceneRedesignInputSchema.optional(),
    instruction: z.string().trim().max(600).default(''),
    referenceImages: z.array(z.object({
        role: ImageReferenceRoleSchema,
        image: z.string().trim().min(1).max(1_600_000),
    })).max(4).optional(),
});

function extractJsonObject(value: string): unknown {
    const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI response does not contain a complete JSON object.');
    return JSON.parse(cleaned.slice(start, end + 1));
}

function parseStoryboardPlanResponse(value: string): z.infer<typeof StoryboardPlanSchema> | null {
    try {
        const parsed = StoryboardPlanSchema.safeParse(extractJsonObject(value));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function parseStoryboardSceneResponse(value: string): z.infer<typeof StoryboardSceneSchema> | null {
    try {
        const parsed = StoryboardSceneSchema.safeParse(extractJsonObject(value));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function parseStoryboardFlowResponse(value: string): { scenes: z.infer<typeof StoryboardSceneSchema>[] } | null {
    try {
        const parsed = z.object({ scenes: z.array(StoryboardSceneSchema).min(1).max(12) }).safeParse(extractJsonObject(value));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function storyboardSystemPrompt(input: z.infer<typeof StoryboardRequestSchema>): string {
    return [
        'You are an award-winning Korean commercial storyboard director and image-generation prompt designer.',
        'Turn the supplied topic into a production-ready sequence of image-generation scenes, not a generic shot list.',
        `Return exactly ${input.sceneCount} scenes in a purposeful opening-to-closing arc.`,
        `Format: ${input.format}. Compose for ${input.aspectRatio}; visual style: ${input.stylePreset}.`,
        'Before writing, silently establish one continuity bible for recurring people, products, buildings, backgrounds, palette, lighting, and lens language.',
        input.referenceImages?.length
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
        'For dialogueOrCaption, provide only off-image context. Never ask the image model to render Korean text, UI, logos, or subtitles unless the topic explicitly requires it.',
        'Return exactly one JSON object with no markdown or explanation.',
        'Shape: {"title":"string","logline":"string","audience":"string","artDirection":"string","characterContinuity":"string","settingContinuity":"string","colorAndLighting":"string","scenes":[{"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}]}',
    ].join('\n');
}

function storyboardUserPrompt(input: z.infer<typeof StoryboardRequestSchema>): string {
    return JSON.stringify({
        topic: input.topic,
        sceneCount: input.sceneCount,
        aspectRatio: input.aspectRatio,
        stylePreset: input.stylePreset,
        format: input.format,
        referenceRoles: input.referenceImages?.map((reference, index) => ({ index: index + 1, role: reference.role })) ?? [],
    });
}

function storyboardMessages(
    input: z.infer<typeof StoryboardRequestSchema>,
    references: ParsedReference[],
    qualityIssue?: string,
) {
    const userText = qualityIssue
        ? `${storyboardUserPrompt(input)}\nQuality correction required: ${qualityIssue} Rebuild the complete plan from scratch and satisfy every JSON field exactly.`
        : storyboardUserPrompt(input);
    return [
        { role: 'system' as const, content: storyboardSystemPrompt(input) },
        {
            role: 'user' as const,
            content: references.length
                ? [
                    { type: 'text' as const, text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url' as const,
                        image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'low' as const },
                    })),
                ]
                : userText,
        },
    ];
}

function storyboardQualityIssue(
    plan: z.infer<typeof StoryboardPlanSchema> | null,
    count: number,
): string | null {
    if (!plan || plan.scenes.length !== count) return 'Scene count or response shape is invalid.';
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

function sceneRedesignContext(scene: z.infer<typeof SceneRedesignInputSchema> | undefined) {
    if (!scene) return null;
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

function storyboardSceneRedesignMessages(
    input: z.infer<typeof StoryboardSceneRedesignRequestSchema>,
    references: ParsedReference[],
    qualityIssue?: string,
) {
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
        referenceRoles: input.referenceImages?.map((reference, index) => ({ index: index + 1, role: reference.role })) ?? [],
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
        'Return exactly one JSON object with no markdown or commentary.',
        'Shape: {"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}',
    ].join('\n');
    return [
        { role: 'system' as const, content: systemPrompt },
        {
            role: 'user' as const,
            content: references.length
                ? [
                    { type: 'text' as const, text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url' as const,
                        image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'low' as const },
                    })),
                ]
                : userText,
        },
    ];
}

function storyboardSceneRedesignQualityIssue(scene: z.infer<typeof StoryboardSceneSchema> | null): string | null {
    if (!scene) return 'The response must include every required scene field using the requested JSON shape.';
    if (scene.imagePrompt.trim().split(/\s+/).length < 18) return 'The imagePrompt is too sparse; add concrete composition, light, material, and environment details.';
    if (!scene.continuityAnchor.trim() || !scene.transition.trim()) return 'State a concrete continuity anchor and transition to neighbouring scenes.';
    return null;
}

export async function handleGenerateImageStoryboard(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const input = parseJson(req, StoryboardRequestSchema, '주제와 장면 수를 확인해 주세요.');
    const rateLimit = await enforceUserRateLimit({
        namespace: 'image-storyboard-plan',
        uid: auth.uid,
        maxRequests: 10,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const references = await parseStoryboardReferences(input.referenceImages ?? []);
    const options = {
        temperature: 0.38,
        maxTokens: Math.min(6800, 1350 + input.sceneCount * 560),
        responseFormat: 'json_object' as const,
    };
    const requestPlan = (qualityIssue?: string) => runOpenRouterText({
        messages: storyboardMessages(input, references, qualityIssue),
        ...options,
    });
    let result = await requestPlan();
    let plan = parseStoryboardPlanResponse(result.content);
    let issue = storyboardQualityIssue(plan, input.sceneCount);
    if (issue) {
        result = await requestPlan(issue);
        plan = parseStoryboardPlanResponse(result.content);
        issue = storyboardQualityIssue(plan, input.sceneCount);
    }
    if (!plan || issue) throw new ApiError(422, 'AI 응답 형식이 장면 설계 기준과 맞지 않았습니다. 잠시 후 다시 시도하거나 장면 수를 줄여 주세요.');
    res.status(200).json({
        success: true,
        plan,
        provider: 'openrouter',
        model: result.model,
        referenceAnalysis: references.length ? 'visual' : 'brief-only',
    });
}

export async function handleRedesignImageStoryboardScene(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const input = parseJson(req, StoryboardSceneRedesignRequestSchema, '장면 재설계 입력값을 확인해 주세요.');
    const rateLimit = await enforceUserRateLimit({
        namespace: 'image-storyboard-scene-redesign',
        uid: auth.uid,
        maxRequests: 16,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);

    const references = await parseStoryboardReferences(input.referenceImages ?? []);
    const options = { temperature: 0.4, maxTokens: 1800, responseFormat: 'json_object' as const };
    const requestScene = (qualityIssue?: string) => runOpenRouterText({
        messages: storyboardSceneRedesignMessages(input, references, qualityIssue),
        ...options,
    });
    let result = await requestScene();
    let scene = parseStoryboardSceneResponse(result.content);
    let issue = storyboardSceneRedesignQualityIssue(scene);
    if (issue) {
        result = await requestScene(issue);
        scene = parseStoryboardSceneResponse(result.content);
        issue = storyboardSceneRedesignQualityIssue(scene);
    }
    if (!scene || issue) throw new ApiError(422, 'AI 응답 형식이 장면 재설계 기준과 맞지 않았습니다. 잠시 후 다시 시도해 주세요.');
    res.status(200).json({
        success: true,
        scene,
        provider: 'openrouter',
        model: result.model,
        referenceAnalysis: references.length ? 'visual' : 'brief-only',
    });
}

function storyboardFlowContext(scene: z.infer<typeof SceneRedesignInputSchema> | undefined) {
    if (!scene) return null;
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

function storyboardFlowMessages(
    input: z.infer<typeof StoryboardFlowRedesignRequestSchema>,
    references: ParsedReference[],
    qualityIssue?: string,
) {
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
        referenceRoles: input.referenceImages?.map((reference, index) => ({ index: index + 1, role: reference.role })) ?? [],
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
        'Return exactly one valid JSON object without markdown or commentary using this shape:',
        '{"scenes":[{"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}]}',
    ].join('\n');
    return [
        { role: 'system' as const, content: systemPrompt },
        {
            role: 'user' as const,
            content: references.length
                ? [
                    { type: 'text' as const, text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url' as const,
                        image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'low' as const },
                    })),
                ]
                : userText,
        },
    ];
}

function storyboardFlowQualityIssue(
    flow: { scenes: z.infer<typeof StoryboardSceneSchema>[] } | null,
    count: number,
): string | null {
    if (!flow || flow.scenes.length !== count) return 'The response must return exactly the requested number of scenes using the required JSON shape.';
    if (new Set(flow.scenes.map((scene) => scene.title.replace(/\s+/g, '').toLowerCase())).size !== count) return 'Scene titles are duplicated.';
    if (new Set(flow.scenes.map((scene) => scene.imagePrompt.replace(/\s+/g, '').toLowerCase())).size !== count) return 'Each scene requires a distinct image prompt and visual moment.';
    const incomplete = flow.scenes.find((scene) => scene.imagePrompt.trim().split(/\s+/).length < 18 || !scene.continuityAnchor.trim() || !scene.transition.trim());
    return incomplete ? `${incomplete.title} needs a concrete image prompt, continuity anchor, and transition.` : null;
}

export async function handleRedesignImageStoryboardFlow(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const input = parseJson(req, StoryboardFlowRedesignRequestSchema, '흐름 재기획 입력값을 확인해 주세요. 한 번에 최대 12개 장면까지 재기획할 수 있습니다.');
    const rateLimit = await enforceUserRateLimit({
        namespace: 'image-storyboard-flow-redesign',
        uid: auth.uid,
        maxRequests: 8,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);

    const references = await parseStoryboardReferences(input.referenceImages ?? []);
    const options = {
        temperature: 0.36,
        maxTokens: Math.min(6800, 1350 + input.scenes.length * 560),
        responseFormat: 'json_object' as const,
    };
    const requestFlow = (qualityIssue?: string) => runOpenRouterText({
        messages: storyboardFlowMessages(input, references, qualityIssue),
        ...options,
    });
    let result = await requestFlow();
    let flow = parseStoryboardFlowResponse(result.content);
    let issue = storyboardFlowQualityIssue(flow, input.scenes.length);
    if (issue) {
        result = await requestFlow(issue);
        flow = parseStoryboardFlowResponse(result.content);
        issue = storyboardFlowQualityIssue(flow, input.scenes.length);
    }
    if (!flow || issue) throw new ApiError(422, 'AI 응답 형식이 장면 흐름 재설계 기준과 맞지 않았습니다. 잠시 후 다시 시도해 주세요.');
    res.status(200).json({
        success: true,
        flow,
        provider: 'openrouter',
        model: result.model,
        referenceAnalysis: references.length ? 'visual' : 'brief-only',
    });
}

const ProjectBoardRequestSchema = z.object({
    mode: z.enum(['project', 'portfolio']),
    section: z.enum(['current', 'plan', 'goal']),
    title: z.string().optional(),
    categoryName: z.string().optional(),
    owner: z.string().optional(),
    dueDate: z.string().optional(),
    stageLabel: z.string().optional(),
    statusLabel: z.string().optional(),
    summary: z.string().optional(),
    currentBody: z.string().optional(),
    planBody: z.string().optional(),
    goalBody: z.string().optional(),
    tasks: z.array(z.object({ title: z.string().optional(), done: z.boolean().optional() })).optional(),
});

const ALLOWED_HTML_TAGS = new Set([
    'article', 'section', 'header', 'div', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'strong', 'em', 'b', 'i',
    'span', 'small', 'br',
]);

function sanitizeHtml(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
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
            if (!ALLOWED_HTML_TAGS.has(tag)) return '';
            if (match.startsWith('</')) return `</${tag}>`;
            if (tag === 'br') return '<br>';
            const attributes = Array.from(String(rawAttrs).matchAll(/\s(rowspan|colspan)=["']?(\d{1,2})["']?/gi))
                .map(([, name, rawValue]) => {
                    if (tag !== 'td' && tag !== 'th') return '';
                    return ` ${String(name).toLowerCase()}="${Math.max(1, Math.min(8, Number(rawValue) || 1))}"`;
                })
                .join('');
            return `<${tag}${attributes}>`;
        })
        .trim();
    return cleaned || undefined;
}

function projectSourceBody(payload: z.infer<typeof ProjectBoardRequestSchema>): string {
    if (payload.section === 'current') return payload.currentBody?.trim() || '';
    if (payload.section === 'plan') return payload.planBody?.trim() || '';
    return payload.goalBody?.trim() || '';
}

export async function handleGenerateProjectBoardContent(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireAccess(req, 'projectBoardManagement');
    const payload = parseJson(req, ProjectBoardRequestSchema);
    const title = payload.title?.trim();
    const sourceBody = projectSourceBody(payload);
    if (!title) throw new ApiError(400, '프로젝트 제목을 먼저 입력하세요.');
    if (!sourceBody) throw new ApiError(400, 'HTML로 구성할 본문을 먼저 입력하세요.');
    const rateLimit = await enforceUserRateLimit({
        namespace: 'project-board-content',
        uid: auth.uid,
        maxRequests: 10,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const responseKey = payload.section === 'current' ? 'currentHtml' : payload.section === 'plan' ? 'planHtml' : 'goalHtml';
    const result = await runOpenRouterText({
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
                content: JSON.stringify({ ...payload, sourceBody }, null, 2),
            },
        ],
        temperature: 0.28,
        maxTokens: 3600,
    });
    const raw = extractJsonObject(result.content);
    const record = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const html = sanitizeHtml(record[responseKey]);
    if (!html) throw new ApiError(502, 'AI가 사용할 수 있는 HTML 디자인을 반환하지 않았습니다.');
    res.status(200).json({
        success: true,
        provider: 'openrouter',
        model: result.model,
        content: { [responseKey]: html },
    });
}
