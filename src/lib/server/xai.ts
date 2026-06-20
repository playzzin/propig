const XAI_BASE_URL = 'https://api.x.ai/v1';

export const XAI_IMAGE_MODEL = 'grok-imagine-image-quality';
export const XAI_VIDEO_MODEL = 'grok-imagine-video';

export type XaiImageResponse = {
    created?: number;
    data?: Array<{
        url?: string;
        b64_json?: string;
        revised_prompt?: string;
    }>;
    error?: {
        message?: string;
    };
    message?: string;
};

export type XaiVideoStartResponse = {
    request_id?: string;
    error?: {
        message?: string;
    };
    message?: string;
};

export type XaiVideoStatusResponse = {
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

export type XaiModelsResponse = {
    data?: Array<{
        id?: string;
        object?: string;
    }>;
    error?: {
        message?: string;
    };
    message?: string;
};

const SUPPORTED_ASPECT_RATIOS = new Set([
    '1:1',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '3:2',
    '2:3',
    '2:1',
    '1:2',
    '19.5:9',
    '9:19.5',
    '20:9',
    '9:20',
    'auto',
]);
const SUPPORTED_XAI_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const PREFERRED_XAI_TEXT_MODELS = [
    'grok-3-mini-fast',
    'grok-3-mini',
    'grok-3-fast',
    'grok-3',
    'grok-2-1212',
    'grok-2-latest',
];
const XAI_NON_TEXT_MODEL_KEYWORDS = [
    'imagine',
    'image',
    'video',
    'vision',
    'embed',
    'embedding',
    'audio',
    'transcribe',
    'whisper',
    'tts',
    'moderation',
];

type JsonLike = Record<string, unknown>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

function normalizeImageMimeType(contentType?: string | null) {
    if (!contentType) return '';
    return contentType.split(';')[0]?.trim().toLowerCase() || '';
}

function isSupportedXaiImageMimeType(contentType?: string | null) {
    return SUPPORTED_XAI_IMAGE_MIME_TYPES.has(normalizeImageMimeType(contentType));
}

export function normalizeXaiImageInput(image?: string): string | undefined {
    if (!image) return undefined;

    const trimmed = image.trim();
    if (!trimmed) return undefined;

    if (trimmed.startsWith('data:image/')) {
        return trimmed;
    }

    if (isHttpUrl(trimmed)) {
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

export async function toXaiImageObject(image?: string): Promise<{ url: string; type: 'image_url' } | undefined> {
    const normalized = normalizeXaiImageInput(image);
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

export function toXaiAspectRatio(aspectRatio?: string): string | undefined {
    if (!aspectRatio) return undefined;
    return SUPPORTED_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : undefined;
}

export function inferXaiImageResolution(width?: number, height?: number): '1k' | '2k' | undefined {
    const maxDimension = Math.max(width ?? 0, height ?? 0);
    if (maxDimension <= 0) return undefined;

    return maxDimension >= 1536 ? '2k' : '1k';
}

export function detectImageMimeType(base64: string): string {
    try {
        const bytes = Buffer.from(base64, 'base64');
        if (bytes.length < 12) return 'image/png';

        if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
        if (
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47
        ) {
            return 'image/png';
        }
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
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

        const brand = bytes.subarray(4, 12).toString('ascii').toLowerCase();
        if (brand.includes('avif')) return 'image/avif';
        if (brand.includes('heic') || brand.includes('heif')) return 'image/heic';
    } catch {
        return 'image/png';
    }

    return 'image/png';
}

export function extractXaiErrorMessage(payload: unknown, fallback = 'xAI request failed'): string {
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
        if (typeof record.detail === 'string') {
            return record.detail;
        }
        if (typeof record.details === 'string') {
            return record.details;
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

export async function fetchXaiJson<T>(
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
        throw new Error(
            extractXaiErrorMessage(parsed, `xAI request failed with HTTP ${response.status}`),
        );
    }
    if (!parsed) {
        throw new Error('xAI returned an empty response');
    }

    return parsed;
}

export async function pollXaiVideoGeneration(params: {
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

export async function listXaiModelIds(apiKey: string): Promise<string[]> {
    const response = await fetchXaiJson<XaiModelsResponse>('/models', {
        apiKey,
        method: 'GET',
    });

    if (!Array.isArray(response.data)) {
        return [];
    }

    return response.data
        .map((item) => (typeof item?.id === 'string' ? item.id.trim() : ''))
        .filter(Boolean);
}

export function pickPreferredXaiTextModel(modelIds: string[]): string | null {
    const normalized = modelIds
        .map((item) => item.trim())
        .filter(Boolean);

    for (const preferred of PREFERRED_XAI_TEXT_MODELS) {
        const exactMatch = normalized.find((item) => item === preferred);
        if (exactMatch) {
            return exactMatch;
        }
    }

    const textModel = normalized.find((item) => {
        const lower = item.toLowerCase();
        if (!lower.startsWith('grok-')) return false;
        return !XAI_NON_TEXT_MODEL_KEYWORDS.some((keyword) => lower.includes(keyword));
    });

    return textModel || null;
}

export async function resolveXaiTextModel(apiKey: string): Promise<string> {
    const modelIds = await listXaiModelIds(apiKey);
    const model = pickPreferredXaiTextModel(modelIds);

    if (!model) {
        throw new Error('No Grok text model is available for this xAI account.');
    }

    return model;
}
