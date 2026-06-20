import * as admin from 'firebase-admin';

const XAI_BASE_URL = 'https://api.x.ai/v1';
const XAI_VIDEO_MODEL = 'grok-imagine-video';

const SUPPORTED_ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']);
const SUPPORTED_XAI_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

type JsonLike = Record<string, unknown>;

type GenerateVideoRequest = {
    prompt: string;
    image?: string;
    mode: 'generate' | 'extend' | 'edit';
    videoUrl?: string;
    duration?: number;
    aspectRatio?: string;
    resolution?: '480p' | '720p';
};

type RuntimeConfig = {
    grokApiKey: string;
    source: 'firestore' | 'env' | 'none';
};

type XaiVideoStartResponse = {
    request_id?: string;
    error?: {
        message?: string;
    };
    message?: string;
};

type XaiVideoStatusResponse = {
    status?: 'pending' | 'done' | 'failed' | 'expired';
    model?: string;
    video?: {
        url?: string;
        duration?: number;
        respect_moderation?: boolean;
    };
    error?: {
        message?: string;
    };
    message?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

function normalizeImageMimeType(contentType?: string | null) {
    if (!contentType) return '';
    return contentType.split(';')[0]?.trim().toLowerCase() || '';
}

function isSupportedXaiImageMimeType(contentType?: string | null) {
    return SUPPORTED_XAI_IMAGE_MIME_TYPES.has(normalizeImageMimeType(contentType));
}

function detectImageMimeType(base64: string): string {
    try {
        const bytes = Buffer.from(base64, 'base64');
        if (bytes.length < 12) return 'image/png';

        if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
            return 'image/png';
        }
        if (
            bytes[0] === 0x52 &&
            bytes[1] === 0x49 &&
            bytes[2] === 0x46 &&
            bytes[3] === 0x46 &&
            bytes[8] === 0x57 &&
            bytes[9] === 0x45 &&
            bytes[10] === 0x42 &&
            bytes[11] === 0x50
        ) {
            return 'image/webp';
        }
    } catch {
        return 'image/png';
    }

    return 'image/png';
}

function normalizeImageInput(image?: string): string | undefined {
    if (!image) return undefined;

    const trimmed = image.trim();
    if (!trimmed) return undefined;

    if (trimmed.startsWith('data:image/') || isHttpUrl(trimmed)) {
        return trimmed;
    }

    return `data:image/png;base64,${trimmed}`;
}

async function fetchSupportedImageDataUrl(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl, {
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`Image URL could not be fetched: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const headerMimeType = normalizeImageMimeType(response.headers.get('content-type'));
    const detectedMimeType = normalizeImageMimeType(detectImageMimeType(base64));
    const mimeType = isSupportedXaiImageMimeType(headerMimeType)
        ? headerMimeType
        : isSupportedXaiImageMimeType(detectedMimeType)
            ? detectedMimeType
            : '';

    if (!mimeType) {
        throw new Error(
            `Image URL could not be fetched: Unsupported content-type encountered when downloading image. The only supported content types are ["image/jpeg", "image/jpg", "image/png", "image/webp"]`,
        );
    }

    return `data:${mimeType};base64,${base64}`;
}

async function toXaiImageObject(image?: string): Promise<{ url: string; type: 'image_url' } | undefined> {
    const normalized = normalizeImageInput(image);
    if (!normalized) return undefined;

    let url = normalized;
    if (isHttpUrl(normalized)) {
        url = await fetchSupportedImageDataUrl(normalized);
    }

    return {
        url,
        type: 'image_url',
    };
}

function toXaiAspectRatio(aspectRatio?: string): string | undefined {
    if (!aspectRatio) return undefined;
    return SUPPORTED_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : undefined;
}

function extractXaiErrorMessage(payload: unknown, fallback = 'xAI request failed'): string {
    if (!payload) return fallback;
    if (typeof payload === 'string') return payload;

    if (typeof payload === 'object') {
        const record = payload as JsonLike;
        const error = record.error;
        if (error && typeof error === 'object' && typeof (error as JsonLike).message === 'string') {
            return String((error as JsonLike).message);
        }
        if (typeof record.message === 'string') {
            return record.message;
        }
    }

    return fallback;
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text) as T;
    } catch {
        if (!response.ok) {
            throw new Error(text);
        }
        return null;
    }
}

async function fetchXaiJson<T>(
    path: string,
    params: {
        apiKey: string;
        method?: 'GET' | 'POST';
        body?: Record<string, unknown>;
    },
): Promise<T> {
    const headers: HeadersInit = {
        Authorization: `Bearer ${params.apiKey}`,
    };

    if (params.body) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${XAI_BASE_URL}${path}`, {
        method: params.method ?? (params.body ? 'POST' : 'GET'),
        headers,
        body: params.body ? JSON.stringify(params.body) : undefined,
        cache: 'no-store',
    });

    const parsed = await parseJsonResponse<T>(response);
    if (!response.ok) {
        throw new Error(extractXaiErrorMessage(parsed, `xAI request failed with HTTP ${response.status}`));
    }
    if (!parsed) {
        throw new Error('xAI returned an empty response');
    }

    return parsed;
}

async function pollXaiVideoGeneration(params: {
    apiKey: string;
    requestId: string;
    pollIntervalMs?: number;
    timeoutMs?: number;
}): Promise<XaiVideoStatusResponse> {
    const pollIntervalMs = params.pollIntervalMs ?? 5000;
    const timeoutMs = params.timeoutMs ?? 180000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const statusResponse = await fetchXaiJson<XaiVideoStatusResponse>(`/videos/${params.requestId}`, {
            apiKey: params.apiKey,
            method: 'GET',
        });

        if (statusResponse.status === 'done') {
            return statusResponse;
        }

        if (statusResponse.status === 'failed') {
            throw new Error(extractXaiErrorMessage(statusResponse, 'Grok video generation failed'));
        }

        if (statusResponse.status === 'expired') {
            throw new Error('Grok video generation request expired before completion');
        }

        await sleep(pollIntervalMs);
    }

    throw new Error(`Grok video generation timed out after ${Math.round(timeoutMs / 1000)} seconds`);
}

async function getRuntimeConfig(): Promise<RuntimeConfig> {
    const envApiKey = process.env.GROK_API_KEY || '';

    try {
        const snapshot = await admin.firestore().collection('system_settings').doc('gemini').get();
        const firestoreApiKey = snapshot.exists ? String(snapshot.data()?.grokApiKey || '').trim() : '';

        return {
            grokApiKey: firestoreApiKey || envApiKey,
            source: firestoreApiKey ? 'firestore' : envApiKey ? 'env' : 'none',
        };
    } catch {
        return {
            grokApiKey: envApiKey,
            source: envApiKey ? 'env' : 'none',
        };
    }
}

function validatePayload(payload: GenerateVideoRequest) {
    if (payload.mode === 'generate') {
        return;
    }

    if (!payload.videoUrl) {
        throw new Error(`videoUrl is required when mode="${payload.mode}"`);
    }

    if (payload.mode === 'extend') {
        const duration = payload.duration ?? 6;
        if (duration < 2 || duration > 10) {
            throw new Error('Extend mode only supports duration between 2 and 10 seconds.');
        }
    }
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

export function deriveVideoInfraHint(rawMessage: string): string {
    const lower = rawMessage.toLowerCase();

    if (lower.includes('api key') || lower.includes('missing_api_key')) {
        return 'Grok API key is not configured.';
    }

    if (
        lower.includes('permission') ||
        lower.includes('forbidden') ||
        lower.includes('unauthorized') ||
        lower.includes('invalid api key')
    ) {
        return 'Grok API authentication or permissions are invalid.';
    }

    if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429')) {
        return 'Grok rate limit was reached. Retry after a short delay.';
    }

    if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('expired')) {
        return 'Grok video generation timed out before completion.';
    }

    return rawMessage;
}

export async function generateGrokVideo(payload: GenerateVideoRequest): Promise<{
    videoUrl: string;
    metadata: {
        mode: GenerateVideoRequest['mode'];
        modelUsed: string;
        duration?: number;
        keySource: string;
    };
}> {
    validatePayload(payload);

    const runtimeConfig = await getRuntimeConfig();
    if (!runtimeConfig.grokApiKey) {
        throw new Error('Grok API key is missing. Configure GROK_API_KEY or set it in system settings.');
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
        videoUrl: statusResponse.video.url,
        metadata: {
            mode: payload.mode,
            modelUsed: statusResponse.model || XAI_VIDEO_MODEL,
            duration: statusResponse.video.duration,
            keySource: runtimeConfig.source,
        },
    };
}
