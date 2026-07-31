import { randomUUID } from 'node:crypto';
import { recordOpenRouterUsage } from '../openrouterUsage';
import { getEmoticonActionTemplate } from './qualityStandards';
import type { EmoticonFrameDirection, EmoticonPlan } from './schema';

export type ImageModel = {
    id: string;
    architecture?: { input_modalities?: string[]; output_modalities?: string[] };
    supported_parameters?: string[] | Record<string, unknown>;
};

type ImageResponse = {
    data?: Array<{ b64_json?: string; media_type?: string; url?: string }>;
    usage?: { cost?: number };
    error?: { message?: string };
};

type GeneratedPose = {
    buffer: Buffer;
    contentType: string;
    model: string;
    costUsd?: number;
};

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

let modelCache: { expiresAt: number; models: ImageModel[] } | null = null;

function supports(model: ImageModel, parameter: string): boolean {
    if (Array.isArray(model.supported_parameters)) {
        return model.supported_parameters.includes(parameter);
    }
    return Boolean(model.supported_parameters && parameter in model.supported_parameters);
}

export function scoreImageModelForEmoticons(model: ImageModel, configuredModel?: string): number {
    const preferredIndex = PREFERRED_MODELS.indexOf(model.id);
    return (model.id === configuredModel ? 2_000 : 0)
        + (preferredIndex >= 0 ? 1_000 - preferredIndex * 25 : 0)
        + (supports(model, 'input_references') ? 300 : 0)
        + (supports(model, 'background') ? 250 : 0)
        + (supports(model, 'quality') ? 160 : 0)
        + (supports(model, 'seed') ? 120 : 0)
        + (supports(model, 'output_format') ? 90 : 0)
        + (supports(model, 'aspect_ratio') || supports(model, 'size') || supports(model, 'resolution') ? 60 : 0)
        + (supports(model, 'n') ? 10 : 0);
}

async function discoverImageModels(apiKey: string): Promise<ImageModel[]> {
    if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.models;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_DISCOVERY_TIMEOUT_MS);
    const response = await fetch('https://openrouter.ai/api/v1/images/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error(`OpenRouter image model discovery failed (${response.status}).`);
    const payload = await response.json() as { data?: ImageModel[] };
    const models = Array.isArray(payload.data) ? payload.data.filter((model) => Boolean(model?.id)) : [];
    if (!models.length) throw new Error('OpenRouter returned no image models.');
    modelCache = { models, expiresAt: Date.now() + IMAGE_MODEL_CACHE_MS };
    return models;
}

async function selectImageModel(apiKey: string): Promise<{ model: ImageModel; fallback: boolean }> {
    try {
        const models = await discoverImageModels(apiKey);
        const configuredModel = process.env.OPENROUTER_IMAGE_MODEL?.trim();
        const compatible = models
            .filter((model) => (
                model.architecture?.input_modalities?.includes('image')
                && model.architecture?.output_modalities?.includes('image')
                && supports(model, 'input_references')
            ))
            .sort((left, right) => (
                scoreImageModelForEmoticons(right, configuredModel)
                - scoreImageModelForEmoticons(left, configuredModel)
                || left.id.localeCompare(right.id)
            ));
        if (compatible[0]) return { model: compatible[0], fallback: false };
    } catch (error) {
        console.warn('[Emoticon Studio] Image model discovery failed.', error);
    }
    return {
        model: {
            id: process.env.OPENROUTER_IMAGE_MODEL?.trim() || 'openai/gpt-image-1',
            supported_parameters: undefined,
        },
        fallback: true,
    };
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedHost = (
        parsedUrl.protocol !== 'https:'
        || hostname === 'localhost'
        || hostname === '0.0.0.0'
        || hostname === '::1'
        || hostname.endsWith('.local')
        || /^127\./.test(hostname)
        || /^10\./.test(hostname)
        || /^192\.168\./.test(hostname)
        || /^169\.254\./.test(hostname)
        || /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)
    );
    if (blockedHost) throw new Error('Generated image URL is not a permitted public HTTPS address.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(parsedUrl, {
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error(`Generated image download failed (${response.status}).`);
    const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/png';
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!contentType.startsWith('image/')) throw new Error('OpenRouter returned a non-image result.');
    if (contentLength > MAX_IMAGE_RESULT_BYTES) throw new Error('Generated image exceeded the 30 MB safety limit.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_RESULT_BYTES) throw new Error('Generated image exceeded the 30 MB safety limit.');
    return { buffer, contentType };
}

function buildAnimationFrameDirection(params: {
    direction: EmoticonFrameDirection;
    frameCount: number;
}): string {
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

function buildPrompt(params: {
    plan: EmoticonPlan;
    correction?: string;
    animationFrame?: { direction: EmoticonFrameDirection; frameCount: number };
}): string {
    const { plan, correction, animationFrame } = params;
    const actionTemplate = getEmoticonActionTemplate(plan);
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

async function requestImage(params: {
    apiKey: string;
    model: ImageModel;
    referenceImageUrls: string[];
    prompt: string;
    includeOptions: boolean;
    seed?: number;
}): Promise<ImageResponse> {
    const accepts = (parameter: string) => !params.model.supported_parameters || supports(params.model, parameter);
    const body: Record<string, unknown> = {
        model: params.model.id,
        prompt: params.prompt,
        input_references: params.referenceImageUrls.slice(0, 2).map((url) => ({
            type: 'image_url',
            image_url: { url },
        })),
    };
    if (params.includeOptions) {
        if (accepts('n')) body.n = 1;
        if (accepts('aspect_ratio')) body.aspect_ratio = '1:1';
        else if (accepts('size')) body.size = '1024x1024';
        else if (accepts('resolution')) body.resolution = '1K';
        if (accepts('output_format')) body.output_format = 'png';
        if (accepts('background')) body.background = 'transparent';
        if (accepts('quality')) body.quality = 'high';
        if (accepts('seed') && params.seed !== undefined) body.seed = params.seed;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_GENERATION_TIMEOUT_MS);
    let response: Response;
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
    } catch (error) {
        if (controller.signal.aborted) throw new Error('OpenRouter image generation timed out.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
    const raw = await response.text();
    let payload: ImageResponse = {};
    try {
        payload = JSON.parse(raw) as ImageResponse;
    } catch {
        // The normalized HTTP error below handles non-JSON provider responses.
    }
    if (!response.ok) {
        const error = new Error(payload.error?.message || raw.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
    }
    return payload;
}

export async function generateEmoticonPose(params: {
    apiKey: string;
    sourceImageUrl: string;
    plan: EmoticonPlan;
    correction?: string;
    additionalReferenceUrls?: string[];
    animationFrame?: { direction: EmoticonFrameDirection; frameCount: number };
    seed?: number;
}): Promise<GeneratedPose> {
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
    let payload: ImageResponse;
    try {
        payload = await requestImage({
            apiKey: params.apiKey,
            model: selected.model,
            referenceImageUrls,
            prompt,
            includeOptions: true,
            seed: params.seed,
        });
    } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (status !== 400 && status !== 422) throw error;
        payload = await requestImage({
            apiKey: params.apiKey,
            model: selected.model,
            referenceImageUrls,
            prompt,
            includeOptions: false,
            seed: params.seed,
        });
    }
    const item = payload.data?.[0];
    if (!item) throw new Error('OpenRouter returned no image data.');
    let image: { buffer: Buffer; contentType: string };
    if (item.b64_json) {
        const buffer = Buffer.from(item.b64_json, 'base64');
        if (buffer.byteLength > MAX_IMAGE_RESULT_BYTES) {
            throw new Error('Generated image exceeded the 30 MB safety limit.');
        }
        image = {
            buffer,
            contentType: item.media_type || 'image/png',
        };
    } else if (item.url) {
        image = await fetchImageBuffer(item.url);
    } else {
        throw new Error('OpenRouter returned an unsupported image result.');
    }
    await recordOpenRouterUsage({
        operation: 'image',
        model: selected.model.id,
        costUsd: payload.usage?.cost,
        requestId: randomUUID(),
    });
    return {
        ...image,
        model: selected.model.id,
        costUsd: payload.usage?.cost,
    };
}

export async function generateEmoticonAnimationFrame(params: {
    apiKey: string;
    sourceImageUrl: string;
    previousFrameUrl: string;
    plan: EmoticonPlan;
    direction: EmoticonFrameDirection;
    frameCount: number;
    correction?: string;
    seed?: number;
}): Promise<GeneratedPose> {
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
