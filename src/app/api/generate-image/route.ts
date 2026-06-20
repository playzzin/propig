import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { IMAGE_STYLE_PRESET_INSTRUCTIONS } from '@/constants/imageStylePresets';
import { getGeminiRuntimeConfig } from '@/lib/server/gemini';
import { requireUserAuth } from '@/lib/server/user-auth';
import {
    XAI_IMAGE_MODEL,
    XaiImageResponse,
    detectImageMimeType,
    fetchXaiJson,
    inferXaiImageResolution,
    toXaiAspectRatio,
    toXaiImageObject,
} from '@/lib/server/xai';

const GenerateImageRequestSchema = z.object({
    prompt: z.string().min(1),
    negativePrompt: z.string().optional(),
    aspectRatio: z.string().optional(),
    width: z.number().int().min(64).max(4096).optional(),
    height: z.number().int().min(64).max(4096).optional(),
    stylePreset: z.string().optional(),
    image: z.string().optional(),
    numberOfImages: z.number().int().min(1).max(4).optional(),
    provider: z.enum(['gemini', 'grok']).optional().default('gemini'),
});

type ParsedReferenceImage = {
    base64: string;
    mimeType: string;
};

type GeminiInlineData = {
    mimeType?: string;
    mime_type?: string;
    data?: string;
};

type GeminiPart = {
    inlineData?: GeminiInlineData;
    inline_data?: GeminiInlineData;
};

type GeminiResponse = {
    candidates?: Array<{
        content?: {
            parts?: GeminiPart[];
        };
    }>;
    promptFeedback?: {
        blockReason?: string;
    };
    error?: {
        message?: string;
    };
};

type ModelAttemptError = {
    model: string;
    message: string;
};

type GeneratedImageAsset = {
    base64?: string;
    mimeType?: string;
    url?: string;
};

type ImageInfraHint = {
    reasonCode:
        | 'api_key_expired'
        | 'billing_disabled'
        | 'permission_denied'
        | 'missing_api_key'
        | 'rate_limited'
        | 'request_timeout'
        | 'invalid_request'
        | 'unknown';
    message: string;
};

function parseReferenceImage(image?: string): ParsedReferenceImage | undefined {
    if (!image) return undefined;

    const trimmed = image.trim();
    if (!trimmed) return undefined;

    const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrlMatch) {
        return {
            mimeType: dataUrlMatch[1],
            base64: dataUrlMatch[2].trim(),
        };
    }

    return {
        mimeType: 'image/png',
        base64: trimmed,
    };
}

function buildPrompt(payload: z.infer<typeof GenerateImageRequestSchema>): string {
    const parts: string[] = [payload.prompt.trim()];

    if (payload.stylePreset && payload.stylePreset !== 'none') {
        parts.push(IMAGE_STYLE_PRESET_INSTRUCTIONS[payload.stylePreset] || `Style: ${payload.stylePreset}`);
    }
    if (payload.aspectRatio) {
        parts.push(`Aspect ratio: ${payload.aspectRatio}`);
    }
    if (payload.width && payload.height) {
        parts.push(`Target size: ${payload.width}x${payload.height}`);
    }
    if (payload.negativePrompt?.trim()) {
        parts.push(`Avoid: ${payload.negativePrompt.trim()}`);
    }

    parts.push('Return image output only.');
    return parts.join('\n');
}

function buildModelCandidates(configModel: string, imageModel?: string): string[] {
    const envImageModel = process.env.GEMINI_IMAGE_MODEL || process.env.NEXT_PUBLIC_GEMINI_IMAGE_MODEL || '';
    const candidates = [
        imageModel || '',
        envImageModel,
        configModel.includes('image') ? configModel : '',
        'gemini-3.1-flash-image-preview',
        'gemini-3-pro-image-preview',
        'gemini-2.5-flash-image',
        'gemini-2.0-flash-preview-image-generation',
        'gemini-2.0-flash-exp-image-generation',
    ]
        .filter(Boolean)
        .filter((model) => !model.startsWith('imagen-'));

    return Array.from(new Set(candidates));
}

const GEMINI_ASPECT_RATIOS = new Set([
    '1:1',
    '2:3',
    '3:2',
    '3:4',
    '4:3',
    '4:5',
    '5:4',
    '9:16',
    '16:9',
    '21:9',
]);

function getGreatestCommonDivisor(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);

    while (y) {
        const next = x % y;
        x = y;
        y = next;
    }

    return x || 1;
}

function normalizeGeminiAspectRatio(payload: z.infer<typeof GenerateImageRequestSchema>): string | undefined {
    const requested = payload.aspectRatio?.trim();
    if (requested && requested !== 'custom' && GEMINI_ASPECT_RATIOS.has(requested)) {
        return requested;
    }

    if (!payload.width || !payload.height) {
        return undefined;
    }

    const divisor = getGreatestCommonDivisor(payload.width, payload.height);
    const derived = `${Math.round(payload.width / divisor)}:${Math.round(payload.height / divisor)}`;
    if (GEMINI_ASPECT_RATIOS.has(derived)) {
        return derived;
    }

    const ratio = payload.width / payload.height;
    const nearest = Array.from(GEMINI_ASPECT_RATIOS).reduce((best, current) => {
        const [w, h] = current.split(':').map(Number);
        const currentDistance = Math.abs(w / h - ratio);
        const [bestW, bestH] = best.split(':').map(Number);
        const bestDistance = Math.abs(bestW / bestH - ratio);
        return currentDistance < bestDistance ? current : best;
    }, '1:1');

    return nearest;
}

function supportsGeminiImageSize(model: string): boolean {
    return model.startsWith('gemini-3');
}

function inferGeminiImageSize(width?: number, height?: number): '1K' | '2K' | '4K' | undefined {
    const maxSide = Math.max(width || 0, height || 0);
    if (!maxSide) return undefined;
    if (maxSide > 2048) return '4K';
    if (maxSide > 1024) return '2K';
    return '1K';
}

function buildGeminiGenerationConfig(
    model: string,
    payload: z.infer<typeof GenerateImageRequestSchema>,
): Record<string, unknown> {
    const imageConfig: Record<string, string> = {};
    const aspectRatio = normalizeGeminiAspectRatio(payload);

    if (aspectRatio) {
        imageConfig.aspectRatio = aspectRatio;
    }

    const imageSize = supportsGeminiImageSize(model)
        ? inferGeminiImageSize(payload.width, payload.height)
        : undefined;
    if (imageSize) {
        imageConfig.imageSize = imageSize;
    }

    return {
        responseModalities: ['TEXT', 'IMAGE'],
        temperature: 0.6,
        ...(Object.keys(imageConfig).length > 0
            ? {
                imageConfig,
            }
            : {}),
    };
}

function extractImagesFromGeminiResponse(data: GeminiResponse): GeneratedImageAsset[] {
    const parts = data.candidates?.[0]?.content?.parts || [];
    const images: GeneratedImageAsset[] = [];

    for (const part of parts) {
        const inline = part.inlineData || part.inline_data;
        if (!inline?.data) continue;

        images.push({
            base64: inline.data,
            mimeType: inline.mimeType || inline.mime_type || 'image/png',
        });
    }

    return images;
}

function extractImagesFromXaiResponse(data: XaiImageResponse): GeneratedImageAsset[] {
    const items = data.data || [];
    const images: GeneratedImageAsset[] = [];

    for (const item of items) {
        if (item.b64_json) {
            images.push({
                base64: item.b64_json,
                mimeType: detectImageMimeType(item.b64_json),
            });
            continue;
        }

        if (item.url) {
            images.push({ url: item.url });
        }
    }

    return images;
}

function deriveInfraHint(rawMessage: string, provider: 'gemini' | 'grok'): ImageInfraHint {
    const lower = rawMessage.toLowerCase();
    const providerLabel = provider === 'grok' ? 'Grok' : 'Gemini';

    if (!rawMessage) {
        return {
            reasonCode: 'unknown',
            message: `${providerLabel} image generation failed for an unknown reason.`,
        };
    }

    if (lower.includes('billing account') && (lower.includes('disabled') || lower.includes('closed'))) {
        return {
            reasonCode: 'billing_disabled',
            message: `${providerLabel} billing is disabled for the configured project/account.`,
        };
    }

    if (lower.includes('api key expired') || lower.includes('apikey expired')) {
        return {
            reasonCode: 'api_key_expired',
            message: `${providerLabel} API key has expired. Update the configured API key.`,
        };
    }

    if (
        lower.includes('api key is missing') ||
        lower.includes('api key missing') ||
        lower.includes('missing_api_key')
    ) {
        return {
            reasonCode: 'missing_api_key',
            message: `${providerLabel} API key is not configured.`,
        };
    }

    if (
        lower.includes('permission') ||
        lower.includes('forbidden') ||
        lower.includes('unauthorized') ||
        lower.includes('invalid api key') ||
        lower.includes('401') ||
        lower.includes('403')
    ) {
        return {
            reasonCode: 'permission_denied',
            message: `${providerLabel} API authentication or permissions are invalid.`,
        };
    }

    if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429')) {
        return {
            reasonCode: 'rate_limited',
            message: `${providerLabel} rate limit was reached. Retry after a short delay.`,
        };
    }

    if (lower.includes('timed out') || lower.includes('timeout')) {
        return {
            reasonCode: 'request_timeout',
            message: `${providerLabel} image generation timed out before completion.`,
        };
    }

    if (lower.includes('invalid') || lower.includes('bad request') || lower.includes('400')) {
        return {
            reasonCode: 'invalid_request',
            message: `${providerLabel} rejected the image request payload.`,
        };
    }

    return {
        reasonCode: 'unknown',
        message: `${providerLabel} image generation failed. Check the provider settings and request payload.`,
    };
}

async function callGeminiImageModel(
    apiKey: string,
    model: string,
    payload: z.infer<typeof GenerateImageRequestSchema>,
    prompt: string,
    referenceImage?: ParsedReferenceImage,
): Promise<GeminiResponse> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    if (referenceImage?.base64) {
        parts.push({
            inlineData: {
                mimeType: referenceImage.mimeType,
                data: referenceImage.base64,
            },
        });
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: buildGeminiGenerationConfig(model, payload),
        }),
    });

    const text = await response.text();
    let parsed: GeminiResponse = {};
    try {
        parsed = JSON.parse(text) as GeminiResponse;
    } catch {
        parsed = {};
    }

    if (!response.ok) {
        const message = parsed.error?.message || text || `Gemini HTTP ${response.status}`;
        throw new Error(message);
    }

    return parsed;
}

async function generateImagesWithFallbackModels(params: {
    apiKey: string;
    models: string[];
    payload: z.infer<typeof GenerateImageRequestSchema>;
    prompt: string;
    numberOfImages: number;
    referenceImage?: ParsedReferenceImage;
}): Promise<{ modelUsed: string; images: GeneratedImageAsset[] }> {
    const errors: ModelAttemptError[] = [];

    for (const model of params.models) {
        try {
            const allImages: GeneratedImageAsset[] = [];

            for (let index = 0; index < params.numberOfImages; index += 1) {
                const response = await callGeminiImageModel(
                    params.apiKey,
                    model,
                    params.payload,
                    params.prompt,
                    params.referenceImage,
                );

                const images = extractImagesFromGeminiResponse(response);
                if (images.length === 0) {
                    const blockReason = response.promptFeedback?.blockReason;
                    throw new Error(
                        blockReason
                            ? `No image returned (blockReason=${blockReason})`
                            : 'No image returned by model',
                    );
                }

                allImages.push(images[0]);
            }

            return { modelUsed: model, images: allImages };
        } catch (error) {
            errors.push({
                model,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const joined = errors.map((item) => `${item.model}: ${item.message}`).join(' | ');
    throw new Error(`All Gemini image models failed. ${joined}`);
}

async function generateImagesWithGrok(params: {
    apiKey: string;
    prompt: string;
    numberOfImages: number;
    referenceImage?: ParsedReferenceImage;
    aspectRatio?: string;
    width?: number;
    height?: number;
}): Promise<{ modelUsed: string; images: GeneratedImageAsset[]; revisedPrompt?: string }> {
    const aspectRatio = toXaiAspectRatio(params.aspectRatio);
    const resolution = inferXaiImageResolution(params.width, params.height);
    const referenceImageDataUri = params.referenceImage
        ? `data:${params.referenceImage.mimeType};base64,${params.referenceImage.base64}`
        : undefined;
    const xaiImage = toXaiImageObject(referenceImageDataUri);

    const baseBody: Record<string, unknown> = {
        model: XAI_IMAGE_MODEL,
        prompt: params.prompt,
        response_format: 'b64_json',
    };

    if (aspectRatio) {
        baseBody.aspect_ratio = aspectRatio;
    }

    if (resolution) {
        baseBody.resolution = resolution;
    }

    if (xaiImage) {
        const allImages: GeneratedImageAsset[] = [];
        let revisedPrompt: string | undefined;

        for (let index = 0; index < params.numberOfImages; index += 1) {
            const response = await fetchXaiJson<XaiImageResponse>('/images/edits', {
                apiKey: params.apiKey,
                body: {
                    ...baseBody,
                    image: xaiImage,
                },
            });

            const images = extractImagesFromXaiResponse(response);
            if (images.length === 0) {
                throw new Error('Grok returned no image data for the edit request');
            }

            revisedPrompt = revisedPrompt || response.data?.[0]?.revised_prompt;
            allImages.push(images[0]);
        }

        return {
            modelUsed: XAI_IMAGE_MODEL,
            images: allImages,
            revisedPrompt,
        };
    }

    const response = await fetchXaiJson<XaiImageResponse>('/images/generations', {
        apiKey: params.apiKey,
        body: {
            ...baseBody,
            n: params.numberOfImages,
        },
    });

    const images = extractImagesFromXaiResponse(response);
    if (images.length === 0) {
        throw new Error('Grok returned no image data');
    }

    return {
        modelUsed: XAI_IMAGE_MODEL,
        images,
        revisedPrompt: response.data?.[0]?.revised_prompt,
    };
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const body = await req.json();
        const parsed = GenerateImageRequestSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid request payload', issues: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const runtimeConfig = await getGeminiRuntimeConfig();
        const prompt = buildPrompt(payload);
        const numberOfImages = payload.numberOfImages ?? 1;
        const referenceImage = parseReferenceImage(payload.image);

        if (payload.provider === 'grok') {
            if (!runtimeConfig.grokApiKey) {
                return NextResponse.json(
                    {
                        success: false,
                        reasonCode: 'missing_api_key',
                        error: 'Grok API key is missing. Configure GROK_API_KEY or set it in the admin settings.',
                    },
                    { status: 500 },
                );
            }

            const generated = await generateImagesWithGrok({
                apiKey: runtimeConfig.grokApiKey,
                prompt,
                numberOfImages,
                referenceImage,
                aspectRatio: payload.aspectRatio,
                width: payload.width,
                height: payload.height,
            });

            const images = generated.images.map((image) => {
                const id = randomUUID();
                const url = image.url || `data:${image.mimeType || 'image/png'};base64,${image.base64}`;

                return {
                    id,
                    url,
                    mimeType: image.mimeType,
                    base64: image.base64,
                };
            });

            return NextResponse.json({
                success: true,
                provider: 'grok',
                imageId: images[0].id,
                imageUrl: images[0].url,
                images,
                revisedPrompt: generated.revisedPrompt || prompt,
                metadata: {
                    count: images.length,
                    modelUsed: generated.modelUsed,
                    keySource: runtimeConfig.source,
                },
            });
        }

        if (!runtimeConfig.apiKey) {
            return NextResponse.json(
                {
                    success: false,
                    reasonCode: 'missing_api_key',
                    error: 'Gemini API key is missing. Configure GEMINI_API_KEY or functions/.env.',
                    details: `keySource=${runtimeConfig.source}`,
                },
                { status: 500 },
            );
        }

        const generated = await generateImagesWithFallbackModels({
            apiKey: runtimeConfig.apiKey,
            models: buildModelCandidates(runtimeConfig.model, runtimeConfig.imageModel),
            payload,
            prompt,
            numberOfImages,
            referenceImage,
        });

        const images = generated.images.map((image) => {
            const id = randomUUID();
            return {
                id,
                url: `data:${image.mimeType || 'image/png'};base64,${image.base64}`,
                mimeType: image.mimeType,
                base64: image.base64,
            };
        });

        return NextResponse.json({
            success: true,
            provider: 'gemini',
            imageId: images[0].id,
            imageUrl: images[0].url,
            images,
            revisedPrompt: prompt,
            metadata: {
                count: images.length,
                modelUsed: generated.modelUsed,
                keySource: runtimeConfig.source,
            },
        });
    } catch (error) {
        console.error('[API] generate-image failed:', error);

        const rawMessage = error instanceof Error ? error.message : 'Failed to generate image';
        const provider = rawMessage.toLowerCase().includes('grok') || rawMessage.toLowerCase().includes('xai')
            ? 'grok'
            : 'gemini';
        const hint = deriveInfraHint(rawMessage, provider);

        return NextResponse.json(
            {
                success: false,
                reasonCode: hint.reasonCode,
                error: hint.message,
                details: rawMessage,
            },
            { status: 500 },
        );
    }
}
