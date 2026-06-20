import { z } from 'zod';
import { getGeminiRuntimeConfig } from '@/lib/server/gemini';
import {
    XAI_VIDEO_MODEL,
    XaiVideoStartResponse,
    extractXaiErrorMessage,
    fetchXaiJson,
    pollXaiVideoGeneration,
    toXaiAspectRatio,
    toXaiImageObject,
} from '@/lib/server/xai';

export const VideoModeSchema = z.enum(['generate', 'extend', 'edit']);

export const GenerateVideoRequestSchema = z.object({
    prompt: z.string().min(1),
    image: z.string().optional(),
    provider: z.enum(['gemini', 'grok']).default('gemini'),
    mode: VideoModeSchema.default('generate'),
    videoUrl: z.string().url().optional(),
    duration: z.number().int().min(1).max(15).optional(),
    aspectRatio: z.string().optional(),
    resolution: z.enum(['480p', '720p']).optional(),
});

export type GenerateVideoRequest = z.infer<typeof GenerateVideoRequestSchema>;

export type VideoInfraHint = {
    reasonCode:
        | 'missing_api_key'
        | 'permission_denied'
        | 'rate_limited'
        | 'request_timeout'
        | 'invalid_request'
        | 'unsupported_provider'
        | 'unknown';
    message: string;
};

export function deriveVideoInfraHint(rawMessage: string): VideoInfraHint {
    const lower = rawMessage.toLowerCase();

    if (
        lower.includes('api key is missing') ||
        lower.includes('api key missing') ||
        lower.includes('missing_api_key')
    ) {
        return {
            reasonCode: 'missing_api_key',
            message: 'Grok API key is not configured.',
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
            message: 'Grok API authentication or permissions are invalid.',
        };
    }

    if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429')) {
        return {
            reasonCode: 'rate_limited',
            message: 'Grok rate limit was reached. Retry after a short delay.',
        };
    }

    if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('expired')) {
        return {
            reasonCode: 'request_timeout',
            message: 'Grok video generation timed out before completion.',
        };
    }

    if (lower.includes('unsupported') || lower.includes('not implemented')) {
        return {
            reasonCode: 'unsupported_provider',
            message: rawMessage,
        };
    }

    if (lower.includes('invalid') || lower.includes('bad request') || lower.includes('400')) {
        return {
            reasonCode: 'invalid_request',
            message: 'Grok rejected the video generation request payload.',
        };
    }

    return {
        reasonCode: 'unknown',
        message: 'Video generation failed. Check the Grok provider settings and request payload.',
    };
}

export function validateVideoPayload(parsed: GenerateVideoRequest): string | null {
    if (parsed.mode === 'generate') {
        return null;
    }

    if (!parsed.videoUrl) {
        return `videoUrl is required when mode="${parsed.mode}"`;
    }

    if (parsed.mode === 'extend') {
        const duration = parsed.duration ?? 6;
        if (duration < 2 || duration > 10) {
            return 'Extend mode only supports duration between 2 and 10 seconds.';
        }
    }

    return null;
}

async function buildStartRequestBody(payload: GenerateVideoRequest): Promise<{
    endpoint: '/videos/generations' | '/videos/extensions' | '/videos/edits';
    body: Record<string, unknown>;
}> {
    const aspectRatio = toXaiAspectRatio(payload.aspectRatio);
    const image = await toXaiImageObject(payload.image);

    if (payload.mode === 'extend') {
        return {
            endpoint: '/videos/extensions',
            body: {
                model: XAI_VIDEO_MODEL,
                prompt: payload.prompt.trim(),
                duration: Math.max(2, Math.min(10, payload.duration ?? 6)),
                video: { url: payload.videoUrl },
            },
        };
    }

    if (payload.mode === 'edit') {
        return {
            endpoint: '/videos/edits',
            body: {
                model: XAI_VIDEO_MODEL,
                prompt: payload.prompt.trim(),
                video: { url: payload.videoUrl },
            },
        };
    }

    const body: Record<string, unknown> = {
        model: XAI_VIDEO_MODEL,
        prompt: payload.prompt.trim(),
        duration: payload.duration ?? 6,
        resolution: payload.resolution ?? '720p',
    };

    if (image) {
        body.image = image;
        if (aspectRatio) {
            body.aspect_ratio = aspectRatio;
        }
    } else {
        body.aspect_ratio = aspectRatio || '16:9';
    }

    return {
        endpoint: '/videos/generations',
        body,
    };
}

export async function generateGrokVideo(payload: GenerateVideoRequest): Promise<{
    success: true;
    provider: 'grok';
    videoId: string;
    videoUrl: string;
    metadata: {
        mode: GenerateVideoRequest['mode'];
        requestId: string;
        modelUsed: string;
        duration?: number;
        keySource: string;
    };
}> {
    const validationError = validateVideoPayload(payload);
    if (validationError) {
        throw new Error(validationError);
    }

    if (payload.provider !== 'grok') {
        throw new Error('Gemini video generation is not implemented on this server. Switch the provider to Grok for video generation.');
    }

    const runtimeConfig = await getGeminiRuntimeConfig();
    if (!runtimeConfig.grokApiKey) {
        throw new Error('Grok API key is missing. Configure GROK_API_KEY or set it in the admin settings.');
    }

    const startRequest = await buildStartRequestBody(payload);
    const startResponse = await fetchXaiJson<XaiVideoStartResponse>(startRequest.endpoint, {
        apiKey: runtimeConfig.grokApiKey,
        body: startRequest.body,
    });

    if (!startResponse.request_id) {
        throw new Error(extractXaiErrorMessage(startResponse, 'Grok did not return a video request id'));
    }

    const statusResponse = await pollXaiVideoGeneration({
        apiKey: runtimeConfig.grokApiKey,
        requestId: startResponse.request_id,
        pollIntervalMs: 5000,
        timeoutMs: 240000,
    });

    if (!statusResponse.video?.url) {
        throw new Error(extractXaiErrorMessage(statusResponse, 'Grok did not return a video URL'));
    }

    if (statusResponse.video.respect_moderation === false) {
        throw new Error('Grok video generation was blocked by moderation');
    }

    return {
        success: true,
        provider: 'grok',
        videoId: startResponse.request_id,
        videoUrl: statusResponse.video.url,
        metadata: {
            mode: payload.mode,
            requestId: startResponse.request_id,
            modelUsed: statusResponse.model || XAI_VIDEO_MODEL,
            duration: statusResponse.video.duration,
            keySource: runtimeConfig.source,
        },
    };
}
