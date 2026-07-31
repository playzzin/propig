import { z } from 'zod';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { recordOpenRouterUsage } from '@/lib/server/openrouter-usage';
import {
    analyzeStoryboardDialogueTiming,
    appendStoryboardVideoAudioDirection,
    resolveStoryboardVideoAudioMode,
    STORYBOARD_VIDEO_AUDIO_MODES,
    type StoryboardVideoAudioMode,
} from '@/lib/storyboard-video-audio';

const OPENROUTER_VIDEO_BASE_URL = 'https://openrouter.ai/api/v1/videos';
const OPENROUTER_VIDEO_MODELS_URL = `${OPENROUTER_VIDEO_BASE_URL}/models`;
const VIDEO_MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
const OPENROUTER_REQUEST_TIMEOUT_MS = 45 * 1000;
const OPENROUTER_VIDEO_POLL_TIMEOUT_MS = 6 * 60 * 1000;
const OPENROUTER_VIDEO_POLL_INTERVAL_MS = 30 * 1000;
const OPENROUTER_VIDEO_DOWNLOAD_TIMEOUT_MS = 90 * 1000;

export const VideoModeSchema = z.enum(['generate', 'extend', 'edit']);
const VideoReferenceImageSchema = z.string().trim().min(1).max(280_000).refine(
    (value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || /^https:\/\//i.test(value),
    'Visual references must be HTTPS URLs or image data URLs.',
);
export const GenerateVideoRequestSchema = z.object({
    prompt: z.string().min(1),
    image: z.string().optional(),
    endImage: z.string().optional(),
    referenceImages: z.array(VideoReferenceImageSchema).max(2).optional(),
    provider: z.literal('openrouter').optional().default('openrouter'),
    mode: VideoModeSchema.default('generate'),
    videoUrl: z.string().url().optional(),
    duration: z.number().int().min(1).max(15).optional(),
    aspectRatio: z.string().optional(),
    resolution: z.enum(['480p', '720p', '1080p']).optional(),
    qualityMode: z.enum(['proof', 'final']).optional(),
    generateAudio: z.boolean().optional(),
    audioMode: z.enum(STORYBOARD_VIDEO_AUDIO_MODES).optional(),
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

export type GenerateVideoRequest = z.infer<typeof GenerateVideoRequestSchema>;
export type VideoInfraHint = {
    reasonCode: 'missing_api_key' | 'permission_denied' | 'rate_limited' | 'request_timeout' | 'invalid_request' | 'unsupported_provider' | 'unknown';
    message: string;
};

type OpenRouterVideoResponse = {
    id?: string;
    generation_id?: string;
    polling_url?: string;
    model?: string | null;
    status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';
    unsigned_urls?: string[];
    error?: string | { message?: string };
    usage?: { cost?: number };
};

type OpenRouterVideoModel = {
    id: string;
    name?: string;
    description?: string;
    supported_resolutions?: string[];
    supported_aspect_ratios?: string[];
    supported_sizes?: string[] | null;
    supported_durations?: number[];
    supported_frame_images?: string[] | boolean;
    supported_input_references?: boolean;
    generate_audio?: boolean;
    pricing_skus?: Record<string, string | number>;
};

export type OpenRouterVideoEstimate = {
    selection: 'automatic';
    modelId: string;
    modelName: string;
    requestedResolution: '480p' | '720p' | '1080p';
    resolvedResolution: string;
    requestedDuration: number;
    resolvedDuration: number;
    aspectRatio: string;
    rateUsdPerSecond: number | null;
    estimatedCostUsd: number | null;
};

export type OpenRouterVideoPreflight = OpenRouterVideoEstimate & {
    canSubmit: true;
    catalogModelCount: number;
    compatibleModelCount: number;
    capabilities: {
        firstFrame: boolean;
        lastFrame: boolean;
        visualReferences: boolean;
        audio: boolean;
        dialogueLipSync: boolean;
    };
    requestedInputs: {
        firstFrame: boolean;
        lastFrame: boolean;
        visualReferences: boolean;
        audioMode: StoryboardVideoAudioMode;
    };
    warnings: string[];
};

export const OpenRouterVideoCheckpointSchema = z.object({
    version: z.literal(1),
    checkpointKey: z.string().min(1),
    jobId: z.string().min(1),
    generationId: z.string().min(1).nullable(),
    pollingUrl: z.string().min(1).nullable(),
    modelId: z.string().min(1),
    modelName: z.string().min(1),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'expired']),
    submittedAt: z.string().min(1),
    lastPolledAt: z.string().min(1),
    qualityMode: z.enum(['proof', 'final']),
    requestedResolution: z.enum(['480p', '720p', '1080p']),
    resolvedResolution: z.string().min(1),
    durationApplied: z.number().int().positive(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
    firstFrameApplied: z.boolean(),
    endFrameApplied: z.boolean(),
    visualReferencesApplied: z.number().int().nonnegative(),
    audioApplied: z.boolean(),
    audioModeApplied: z.enum(STORYBOARD_VIDEO_AUDIO_MODES).default('silent'),
    lipSyncRequested: z.boolean().default(false),
});

export type OpenRouterVideoCheckpoint = z.infer<typeof OpenRouterVideoCheckpointSchema>;

export type OpenRouterVideoGenerationOptions = {
    checkpointKey?: string;
    resumeCheckpoint?: unknown;
    pollTimeoutMs?: number;
    onCheckpoint?: (checkpoint: OpenRouterVideoCheckpoint) => Promise<void>;
};

export class OpenRouterVideoPendingError extends Error {
    readonly checkpoint: OpenRouterVideoCheckpoint;

    constructor(checkpoint: OpenRouterVideoCheckpoint) {
        super('OpenRouter video generation is still processing and will resume automatically.');
        this.name = 'OpenRouterVideoPendingError';
        this.checkpoint = checkpoint;
    }
}

export function readOpenRouterVideoCheckpoint(value: unknown): OpenRouterVideoCheckpoint | null {
    const parsed = OpenRouterVideoCheckpointSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function isResumableOpenRouterVideoCheckpoint(value: unknown): boolean {
    const checkpoint = readOpenRouterVideoCheckpoint(value);
    return Boolean(
        checkpoint
        && (checkpoint.status === 'pending'
            || checkpoint.status === 'in_progress'
            || checkpoint.status === 'completed'),
    );
}

let cachedVideoModels: { expiresAt: number; models: OpenRouterVideoModel[] } | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const extractError = (payload: OpenRouterVideoResponse | null, fallback: string) =>
    typeof payload?.error === 'string' ? payload.error : payload?.error?.message || fallback;

const normalizeImage = (image?: string) => {
    const value = image?.trim();
    if (!value) return undefined;
    if (value.startsWith('data:image/') || /^https?:\/\//i.test(value)) return value;
    return `data:image/png;base64,${value}`;
};

export function deriveVideoInfraHint(rawMessage: string): VideoInfraHint {
    const lower = rawMessage.toLowerCase();
    if (lower.includes('missing_api_key') || lower.includes('api key is missing')) {
        return { reasonCode: 'missing_api_key', message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.' };
    }
    if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) {
        return { reasonCode: 'permission_denied', message: 'OpenRouter API 인증 또는 권한을 확인하세요.' };
    }
    if (lower.includes('rate limit') || lower.includes('429')) {
        return { reasonCode: 'rate_limited', message: 'OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.' };
    }
    if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('expired')) {
        return { reasonCode: 'request_timeout', message: 'OpenRouter 영상 생성 시간이 초과되었습니다.' };
    }
    if (lower.includes('extend') || lower.includes('edit') || lower.includes('unsupported') || lower.includes('not implemented')) {
        return { reasonCode: 'unsupported_provider', message: rawMessage };
    }
    if (lower.includes('invalid') || lower.includes('bad request') || lower.includes('400')) {
        return { reasonCode: 'invalid_request', message: 'OpenRouter가 영상 생성 요청을 거부했습니다.' };
    }
    return { reasonCode: 'unknown', message: 'OpenRouter 영상 생성에 실패했습니다. 모델과 요청을 확인하세요.' };
}

export function validateVideoPayload(payload: GenerateVideoRequest): string | null {
    if (payload.mode !== 'generate') {
        return 'OpenRouter 영상 API에서는 새 클립 생성 또는 참조 이미지 기반 생성을 사용하세요. 기존 영상의 직접 편집·연장은 지원하지 않습니다.';
    }
    if (resolveStoryboardVideoAudioMode(payload) === 'dialogue') {
        if (!payload.dialogue?.trim()) {
            return '대사·립싱크 모드에는 말할 대사가 필요합니다.';
        }
        const timing = analyzeStoryboardDialogueTiming(payload.dialogue, payload.duration ?? 6);
        if (!timing.fitsSupportedDuration) {
            return '대사가 15초 최대 길이를 넘습니다. 자연스러운 립싱크를 위해 문장을 여러 장면으로 나눠 주세요.';
        }
        if (timing.tone === 'over') {
            return `대사가 현재 장면보다 깁니다. 자연스러운 립싱크를 위해 길이를 ${timing.recommendedDurationSeconds}초 이상으로 맞춰 주세요.`;
        }
    }
    return null;
}

const parseVideoResponse = async (response: Response): Promise<OpenRouterVideoResponse | null> => {
    const raw = await response.text();
    if (!raw) return null;
    try { return JSON.parse(raw) as OpenRouterVideoResponse; } catch {
        if (!response.ok) throw new Error(raw.slice(0, 1000));
        return null;
    }
};

const requestVideo = async (url: string, apiKey: string, init?: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            ...init,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
                ...(process.env.NEXT_PUBLIC_SITE_URL ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL } : {}),
                'X-OpenRouter-Title': 'ProPig',
                ...init?.headers,
            },
            cache: 'no-store',
            signal: controller.signal,
        });
        const payload = await parseVideoResponse(response);
        if (!response.ok) throw new Error(extractError(payload, `OpenRouter HTTP ${response.status}`));
        return payload;
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error('OpenRouter video API request timed out after 45 seconds.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

function supportsValue(supported: string[] | undefined, value: string): boolean {
    return !supported?.length || supported.includes(value);
}

function supportsFrame(model: OpenRouterVideoModel, frameType: 'first_frame' | 'last_frame'): boolean {
    if (model.supported_frame_images === true) return true;
    const aliases = frameType === 'first_frame' ? ['first_frame', 'first'] : ['last_frame', 'last'];
    return Array.isArray(model.supported_frame_images)
        && model.supported_frame_images.some((value) => aliases.includes(value));
}

function supportsDuration(model: OpenRouterVideoModel, duration: number): boolean {
    return !model.supported_durations?.length || model.supported_durations.includes(duration);
}

function resolvedDurationFor(model: OpenRouterVideoModel, requested: number): number {
    const supported = model.supported_durations?.filter((duration) => Number.isInteger(duration) && duration > 0);
    if (!supported?.length || supported.includes(requested)) return requested;
    return [...supported].sort((left, right) => (
        Math.abs(left - requested) - Math.abs(right - requested)
        || left - right
    ))[0] || requested;
}

function supportsInputReferences(model: OpenRouterVideoModel): boolean {
    if (model.supported_input_references === true) return true;
    if (/^bytedance\/seedance-2\.0(?:-|$)/i.test(model.id)) return true;
    if (/^alibaba\/wan-2\.7(?:-|$)/i.test(model.id)) return true;
    const description = model.description?.toLowerCase() || '';
    return /\b(reference[- ]to[- ]video|reference images?|input_references)\b/.test(description);
}

function supportsDialogueLipSync(model: OpenRouterVideoModel): boolean {
    const id = model.id.toLowerCase();
    if (/^bytedance\/seedance-(?:2\.0|1\.5-pro)(?:-|$)/.test(id)) return true;
    if (/^alibaba\/wan-2\.6(?:-|$)/.test(id)) return true;
    const description = model.description?.toLowerCase() || '';
    return /\b(lip[- ]?sync|multi-character dialogue|spoken dialogue|speech synchronization|native synchronized audio|synchronized audio)\b/.test(description);
}

function dialogueModelQualityScore(model: OpenRouterVideoModel): number {
    const id = model.id.toLowerCase();
    if (/^bytedance\/seedance-2\.0(?:$|:)/.test(id)) return 9_000;
    if (/^alibaba\/wan-2\.6(?:-|$|:)/.test(id)) return 7_500;
    if (/^bytedance\/seedance-2\.0-fast(?:-|$|:)/.test(id)) return 6_000;
    if (/^bytedance\/seedance-1\.5-pro(?:-|$|:)/.test(id)) return 5_000;
    return supportsDialogueLipSync(model) ? 3_000 : 0;
}

function resolvedResolutionFor(model: OpenRouterVideoModel, requested: '480p' | '720p' | '1080p'): string | null {
    const supported = model.supported_resolutions;
    if (!supported?.length || supported.includes(requested)) return requested;
    const fallbacks = requested === '1080p'
        ? ['720p', '480p']
        : requested === '720p'
            ? ['480p', '1080p']
            : ['720p', '1080p'];
    const fallback = fallbacks.find((value) => supported.includes(value));
    if (fallback) return fallback;
    return supported[0] || null;
}

function parsePrice(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resolvePricedVideoSize(
    model: OpenRouterVideoModel,
    resolution: string,
    aspectRatio: string,
): { width: number; height: number } | null {
    const shortEdge = resolution === '4K'
        ? 2160
        : Number.parseInt(resolution, 10);
    const [aspectWidth, aspectHeight] = aspectRatio
        .split(':')
        .map((value) => Number(value));
    if (
        !Number.isFinite(shortEdge)
        || !Number.isFinite(aspectWidth)
        || !Number.isFinite(aspectHeight)
        || shortEdge <= 0
        || aspectWidth <= 0
        || aspectHeight <= 0
    ) {
        return null;
    }

    const targetRatio = aspectWidth / aspectHeight;
    const candidates = (model.supported_sizes || []).flatMap((size) => {
        const matched = /^(\d+)x(\d+)$/i.exec(size);
        if (!matched) return [];
        const width = Number(matched[1]);
        const height = Number(matched[2]);
        if (Math.min(width, height) !== shortEdge) return [];
        return [{ width, height, ratioDistance: Math.abs(width / height - targetRatio) }];
    });
    candidates.sort((left, right) => left.ratioDistance - right.ratioDistance);
    return candidates[0] || null;
}

function readPricing(
    model: OpenRouterVideoModel,
    resolution: string,
    duration: number,
    generateAudio: boolean,
    hasReferenceImage: boolean,
    referenceImageCount: number,
    aspectRatio: string,
): { rateUsdPerSecond: number | null; estimatedCostUsd: number | null } {
    const skus = model.pricing_skus || {};
    const resolutionKey = resolution.toLowerCase();
    const generationPrefix = hasReferenceImage ? 'image_to_video' : 'text_to_video';
    const rateCandidates = generateAudio
        ? [
            skus[`duration_seconds_with_audio_${resolutionKey}`],
            skus['duration_seconds_with_audio'],
            skus[`${generationPrefix}_duration_seconds_${resolutionKey}`],
            skus[`duration_seconds_${resolutionKey}`],
            skus['duration_seconds'],
        ]
        : [
            skus[`duration_seconds_without_audio_${resolutionKey}`],
            skus['duration_seconds_without_audio'],
            skus[`${generationPrefix}_duration_seconds_${resolutionKey}`],
            skus[`duration_seconds_${resolutionKey}`],
            skus['duration_seconds'],
        ];
    rateCandidates.push(
        skus[`per-video-second-${resolution.toLowerCase()}`],
        skus['per-video-second'],
    );
    for (const candidate of rateCandidates) {
        const rateUsdPerSecond = parsePrice(candidate);
        if (rateUsdPerSecond !== null) {
            const imageInputCents = parsePrice(skus.cents_per_image_input) ?? 0;
            const imageInputUsd = (imageInputCents / 100) * referenceImageCount;
            return {
                rateUsdPerSecond,
                estimatedCostUsd: Number(
                    (rateUsdPerSecond * duration + imageInputUsd).toFixed(6),
                ),
            };
        }
    }

    const centsRate = parsePrice(
        skus[`cents_per_video_output_second_${resolutionKey}`]
        ?? skus.cents_per_video_output_second,
    );
    if (centsRate !== null) {
        const rateUsdPerSecond = centsRate / 100;
        const imageInputCents = parsePrice(skus.cents_per_image_input) ?? 0;
        return {
            rateUsdPerSecond,
            estimatedCostUsd: Number(
                (
                    rateUsdPerSecond * duration
                    + (imageInputCents / 100) * referenceImageCount
                ).toFixed(6),
            ),
        };
    }

    const videoTokenRate = parsePrice(
        generateAudio
            ? skus.video_tokens
            : skus.video_tokens_without_audio ?? skus.video_tokens,
    );
    const pricedSize = resolvePricedVideoSize(model, resolution, aspectRatio);
    if (videoTokenRate !== null && pricedSize) {
        const videoTokens =
            (pricedSize.width * pricedSize.height * duration * 24) / 1024;
        const estimatedCostUsd = videoTokens * videoTokenRate;
        return {
            rateUsdPerSecond: Number(
                (estimatedCostUsd / duration).toFixed(6),
            ),
            estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
        };
    }

    const perGeneration = parsePrice(skus.generate);
    if (perGeneration !== null) {
        return {
            rateUsdPerSecond: Number((perGeneration / duration).toFixed(6)),
            estimatedCostUsd: perGeneration,
        };
    }

    return { rateUsdPerSecond: null, estimatedCostUsd: null };
}

function proofSpeedScore(model: OpenRouterVideoModel): number {
    const id = model.id.toLowerCase();
    if (id.includes('seedance-2.0-fast')) return 4;
    if (/(?:^|[-/])fast(?:$|-)/.test(id)) return 3;
    if (id.includes('lite')) return 2;
    return 0;
}

function capabilityScore(
    model: OpenRouterVideoModel,
    hasReferenceImage: boolean,
    hasEndReferenceImage: boolean,
    hasVisualReferenceImages: boolean,
    generateAudio: boolean,
    requiresLipSync: boolean,
): number {
    const resolutions = model.supported_resolutions || [];
    const aspects = model.supported_aspect_ratios || [];
    return (
        (hasReferenceImage && supportsFrame(model, 'first_frame') ? 10_000 : 0)
        + (hasEndReferenceImage && supportsFrame(model, 'last_frame') ? 8_000 : 0)
        + (hasVisualReferenceImages && supportsInputReferences(model) ? 6_000 : 0)
        + (requiresLipSync ? dialogueModelQualityScore(model) : 0)
        + (generateAudio && model.generate_audio === true ? 2_000 : 0)
        + (resolutions.includes('1080p') ? 1_000 : 0)
        + (resolutions.includes('2K') || resolutions.includes('4K') ? 500 : 0)
        + resolutions.length * 20
        + aspects.length
    );
}

async function discoverVideoModels(apiKey: string): Promise<OpenRouterVideoModel[]> {
    if (cachedVideoModels && cachedVideoModels.expiresAt > Date.now()) return cachedVideoModels.models;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);
    const response = await fetch(OPENROUTER_VIDEO_MODELS_URL, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(process.env.NEXT_PUBLIC_SITE_URL ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL } : {}),
            'X-OpenRouter-Title': 'ProPig',
        },
        cache: 'no-store',
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error(`OpenRouter video model discovery failed (${response.status}).`);
    const payload = await response.json() as { data?: unknown };
    const models = Array.isArray(payload.data)
        ? payload.data.filter((item): item is OpenRouterVideoModel => (
            Boolean(item)
            && typeof item === 'object'
            && typeof (item as { id?: unknown }).id === 'string'
        ))
        : [];
    if (!models.length) throw new Error('OpenRouter returned no available video models.');
    cachedVideoModels = { models, expiresAt: Date.now() + VIDEO_MODEL_CACHE_TTL_MS };
    return models;
}

async function selectVideoModel(params: {
    apiKey: string;
    duration: number;
    resolution: '480p' | '720p' | '1080p';
    aspectRatio: string;
    qualityMode: 'proof' | 'final';
    hasReferenceImage: boolean;
    hasEndReferenceImage: boolean;
    hasVisualReferenceImages: boolean;
    audioMode: StoryboardVideoAudioMode;
}) {
    const models = await discoverVideoModels(params.apiKey);
    const generateAudio = params.audioMode !== 'silent';
    const requiresLipSync = params.audioMode === 'dialogue';
    const compatible = models.flatMap((model) => {
        if (!supportsValue(model.supported_aspect_ratios, params.aspectRatio)) return [];
        const resolvedResolution = resolvedResolutionFor(model, params.resolution);
        if (!resolvedResolution) return [];
        const resolvedDuration = resolvedDurationFor(model, params.duration);
        const pricing = readPricing(
            model,
            resolvedResolution,
            resolvedDuration,
            generateAudio,
            params.hasReferenceImage,
            Number(params.hasReferenceImage)
                + Number(params.hasEndReferenceImage)
                + (params.hasVisualReferenceImages ? 1 : 0),
            params.aspectRatio,
        );
        return [{
            model,
            resolvedResolution,
            resolvedDuration,
            ...pricing,
        }];
    });
    if (!compatible.length) {
        throw new Error(`OpenRouter has no video model compatible with ${params.aspectRatio} ${params.resolution}.`);
    }
    const referenceCapable = params.hasReferenceImage
        ? compatible.filter(({ model }) => supportsFrame(model, 'first_frame'))
        : [];
    if (params.hasReferenceImage && !referenceCapable.length) {
        throw new Error('현재 조건에서 시작 프레임을 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.');
    }
    const referenceCandidates = params.hasReferenceImage ? referenceCapable : compatible;
    const endFrameCapable = params.hasEndReferenceImage
        ? referenceCandidates.filter(({ model }) => supportsFrame(model, 'last_frame'))
        : [];
    if (params.hasEndReferenceImage && !endFrameCapable.length) {
        throw new Error('현재 조건에서 마지막 프레임을 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.');
    }
    const endFrameCandidates = params.hasEndReferenceImage ? endFrameCapable : referenceCandidates;
    const visualReferenceCapable = params.hasVisualReferenceImages
        ? endFrameCandidates.filter(({ model }) => supportsInputReferences(model))
        : [];
    if (params.hasVisualReferenceImages && !visualReferenceCapable.length) {
        throw new Error('현재 조건에서 일관성 참조 이미지를 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.');
    }
    const visualReferenceCandidates = params.hasVisualReferenceImages
        ? visualReferenceCapable
        : endFrameCandidates;
    const audioCapable = generateAudio
        ? visualReferenceCandidates.filter(({ model }) => model.generate_audio === true)
        : [];
    if (generateAudio && !audioCapable.length) {
        throw new Error('현재 조건에서 오디오 생성을 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.');
    }
    const lipSyncCapable = requiresLipSync
        ? audioCapable.filter(({ model }) => supportsDialogueLipSync(model))
        : [];
    if (requiresLipSync && !lipSyncCapable.length) {
        throw new Error('현재 조건에서 한국어 대사·립싱크를 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.');
    }
    const capabilityCandidates = requiresLipSync
        ? lipSyncCapable
        : generateAudio
            ? audioCapable
            : visualReferenceCandidates;
    const exactDurationCandidates = capabilityCandidates.filter(({ model }) =>
        supportsDuration(model, params.duration),
    );
    const candidates = exactDurationCandidates.length
        ? exactDurationCandidates
        : capabilityCandidates;
    candidates.sort((left, right) => {
        const knownPriceDelta =
            Number(right.estimatedCostUsd !== null)
            - Number(left.estimatedCostUsd !== null);
        if (knownPriceDelta) return knownPriceDelta;

        if (params.qualityMode === 'final') {
            const capabilityDelta = capabilityScore(
                right.model,
                params.hasReferenceImage,
                params.hasEndReferenceImage,
                params.hasVisualReferenceImages,
                generateAudio,
                requiresLipSync,
            ) - capabilityScore(
                left.model,
                params.hasReferenceImage,
                params.hasEndReferenceImage,
                params.hasVisualReferenceImages,
                generateAudio,
                requiresLipSync,
            );
            if (capabilityDelta) return capabilityDelta;
        } else {
            const exactResolutionDelta =
                Number(right.resolvedResolution === params.resolution)
                - Number(left.resolvedResolution === params.resolution);
            if (exactResolutionDelta) return exactResolutionDelta;

            const speedDelta = proofSpeedScore(right.model) - proofSpeedScore(left.model);
            if (speedDelta) return speedDelta;
        }
        const leftCost = left.estimatedCostUsd ?? Number.POSITIVE_INFINITY;
        const rightCost = right.estimatedCostUsd ?? Number.POSITIVE_INFINITY;
        if (leftCost !== rightCost) return leftCost - rightCost;
        return left.model.id.localeCompare(right.model.id);
    });
    const selected = candidates[0];
    return {
        ...selected,
        catalogModelCount: models.length,
        compatibleModelCount: compatible.length,
        supportsFirstFrame: supportsFrame(selected.model, 'first_frame'),
        supportsEndFrame: supportsFrame(selected.model, 'last_frame'),
        supportsInputReferences: supportsInputReferences(selected.model),
        supportsAudio: selected.model.generate_audio === true,
        supportsDialogueLipSync: supportsDialogueLipSync(selected.model),
    };
}

export async function preflightOpenRouterVideo(params: {
    apiKey: string;
    duration: number;
    resolution: '480p' | '720p' | '1080p';
    aspectRatio: string;
    qualityMode?: 'proof' | 'final';
    hasReferenceImage?: boolean;
    hasEndReferenceImage?: boolean;
    hasVisualReferenceImages?: boolean;
    audioMode?: StoryboardVideoAudioMode;
}): Promise<OpenRouterVideoPreflight> {
    const requestedInputs = {
        firstFrame: Boolean(params.hasReferenceImage),
        lastFrame: Boolean(params.hasEndReferenceImage),
        visualReferences: Boolean(params.hasVisualReferenceImages),
        audioMode: (params.audioMode || 'silent') as StoryboardVideoAudioMode,
    };
    const visualReferencesCanBeApplied =
        requestedInputs.visualReferences
        && !requestedInputs.firstFrame
        && !requestedInputs.lastFrame;
    const selected = await selectVideoModel({
        ...params,
        qualityMode: params.qualityMode || 'proof',
        hasReferenceImage: requestedInputs.firstFrame,
        hasEndReferenceImage: requestedInputs.lastFrame,
        hasVisualReferenceImages: visualReferencesCanBeApplied,
        audioMode: requestedInputs.audioMode,
    });
    const warnings: string[] = [];
    if (requestedInputs.visualReferences && !visualReferencesCanBeApplied) {
        warnings.push(
            'OpenRouter는 시작·마지막 프레임과 일반 참조 이미지를 함께 받으면 프레임을 우선합니다. 이 장면에서는 프레임 연속성을 유지하고 일반 참조 이미지는 직접 적용하지 않습니다.',
        );
    }
    if (selected.resolvedResolution !== params.resolution) {
        warnings.push(
            `요청한 ${params.resolution} 대신 ${selected.resolvedResolution} 해상도로 생성됩니다.`,
        );
    }
    if (selected.resolvedDuration !== params.duration) {
        warnings.push(
            `요청한 ${params.duration}초 대신 모델이 지원하는 ${selected.resolvedDuration}초로 생성됩니다.`,
        );
    }
    if (selected.estimatedCostUsd === null) {
        warnings.push('선택된 모델의 예상 가격을 확인하지 못했습니다.');
    }

    return {
        selection: 'automatic',
        canSubmit: true,
        modelId: selected.model.id,
        modelName: selected.model.name || selected.model.id,
        requestedResolution: params.resolution,
        resolvedResolution: selected.resolvedResolution,
        requestedDuration: params.duration,
        resolvedDuration: selected.resolvedDuration,
        aspectRatio: params.aspectRatio,
        rateUsdPerSecond: selected.rateUsdPerSecond,
        estimatedCostUsd: selected.estimatedCostUsd,
        catalogModelCount: selected.catalogModelCount,
        compatibleModelCount: selected.compatibleModelCount,
        capabilities: {
            firstFrame: selected.supportsFirstFrame,
            lastFrame: selected.supportsEndFrame,
            visualReferences: selected.supportsInputReferences,
            audio: selected.supportsAudio,
            dialogueLipSync: selected.supportsDialogueLipSync,
        },
        requestedInputs,
        warnings,
    };
}

export async function estimateOpenRouterVideo(params: {
    apiKey: string;
    duration: number;
    resolution: '480p' | '720p' | '1080p';
    aspectRatio: string;
    qualityMode?: 'proof' | 'final';
    hasReferenceImage?: boolean;
    hasEndReferenceImage?: boolean;
    hasVisualReferenceImages?: boolean;
    audioMode?: StoryboardVideoAudioMode;
}): Promise<OpenRouterVideoEstimate> {
    return preflightOpenRouterVideo(params);
}

function resolveOpenRouterPollingUrl(checkpoint: OpenRouterVideoCheckpoint): string {
    const fallback = `${OPENROUTER_VIDEO_BASE_URL}/${encodeURIComponent(checkpoint.jobId)}`;
    if (!checkpoint.pollingUrl?.trim()) return fallback;

    try {
        const pollingUrl = new URL(checkpoint.pollingUrl, 'https://openrouter.ai');
        if (
            pollingUrl.protocol === 'https:'
            && pollingUrl.hostname === 'openrouter.ai'
            && pollingUrl.pathname.startsWith('/api/v1/videos/')
        ) {
            return pollingUrl.toString();
        }
    } catch {
        return fallback;
    }
    return fallback;
}

const pollVideo = async (params: {
    apiKey: string;
    checkpoint: OpenRouterVideoCheckpoint;
    timeoutMs: number;
    onCheckpoint?: (checkpoint: OpenRouterVideoCheckpoint) => Promise<void>;
}): Promise<{ response: OpenRouterVideoResponse; checkpoint: OpenRouterVideoCheckpoint }> => {
    const deadline = Date.now() + Math.max(1_000, params.timeoutMs);
    let checkpoint = params.checkpoint;

    while (true) {
        const result = await requestVideo(
            resolveOpenRouterPollingUrl(checkpoint),
            params.apiKey,
            { method: 'GET' },
        );
        const status = result?.status || 'pending';
        checkpoint = {
            ...checkpoint,
            generationId: result?.generation_id || checkpoint.generationId,
            modelId: result?.model || checkpoint.modelId,
            status,
            lastPolledAt: new Date().toISOString(),
        };
        await params.onCheckpoint?.(checkpoint);

        if (status === 'completed') {
            return { response: result || {}, checkpoint };
        }
        if (status === 'failed' || status === 'cancelled' || status === 'expired') {
            throw new Error(extractError(result, `OpenRouter video job ${status}`));
        }

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) break;
        await sleep(Math.min(OPENROUTER_VIDEO_POLL_INTERVAL_MS, remainingMs));
    }

    throw new OpenRouterVideoPendingError(checkpoint);
};

export async function generateOpenRouterVideo(
    payload: GenerateVideoRequest,
    options: OpenRouterVideoGenerationOptions = {},
): Promise<{
    success: true;
    provider: 'openrouter';
    videoId: string;
    videoUrl: string;
    metadata: {
        mode: GenerateVideoRequest['mode'];
        requestId: string;
        modelUsed: string;
        keySource: string;
        costUsd?: number;
        selectionSource: 'catalog';
        estimatedCostUsd: number | null;
        resolvedResolution: string;
        durationApplied: number;
        firstFrameApplied: boolean;
        endFrameApplied: boolean;
        visualReferencesApplied: number;
        audioApplied: boolean;
        audioModeApplied: StoryboardVideoAudioMode;
        lipSyncRequested: boolean;
    };
}> {
    const validationError = validateVideoPayload(payload);
    if (validationError) throw new Error(validationError);

    const runtime = await getAIRuntimeConfig();
    if (!runtime.openRouterApiKey) throw new Error('OPENROUTER_API_KEY is missing.');

    const duration = payload.duration ?? 6;
    const requestedResolution = payload.resolution || '720p';
    const aspectRatio = payload.aspectRatio || '16:9';
    const referenceImage = normalizeImage(payload.image);
    const requestedEndFrameImage = normalizeImage(payload.endImage);
    const visualReferenceImages = (payload.referenceImages || [])
        .map(normalizeImage)
        .filter((image): image is string => Boolean(image))
        .slice(0, 2);
    const canApplyVisualReferences =
        visualReferenceImages.length > 0
        && !referenceImage
        && !requestedEndFrameImage;
    const checkpointKey = options.checkpointKey || 'direct';
    const qualityMode = payload.qualityMode || 'proof';
    const audioMode = resolveStoryboardVideoAudioMode(payload);
    const resumeCheckpoint = readOpenRouterVideoCheckpoint(options.resumeCheckpoint);
    const canResume = Boolean(
        resumeCheckpoint
        && resumeCheckpoint.checkpointKey === checkpointKey
        && isResumableOpenRouterVideoCheckpoint(resumeCheckpoint),
    );

    let checkpoint: OpenRouterVideoCheckpoint;
    if (canResume && resumeCheckpoint) {
        checkpoint = resumeCheckpoint;
    } else {
        const selected = await selectVideoModel({
            apiKey: runtime.openRouterApiKey,
            duration,
            resolution: requestedResolution,
            aspectRatio,
            qualityMode,
            hasReferenceImage: Boolean(referenceImage),
            hasEndReferenceImage: Boolean(requestedEndFrameImage),
            hasVisualReferenceImages: canApplyVisualReferences,
            audioMode,
        });
        const firstFrameImage = selected.supportsFirstFrame ? referenceImage : undefined;
        const endFrameImage = selected.supportsEndFrame ? requestedEndFrameImage : undefined;
        const appliedVisualReferences =
            canApplyVisualReferences && selected.supportsInputReferences
                ? visualReferenceImages
                : [];
        const audioApplied = audioMode !== 'silent' && selected.supportsAudio;
        const lipSyncRequested = audioMode === 'dialogue';
        const body: Record<string, unknown> = {
            model: selected.model.id,
            prompt: appendStoryboardVideoAudioDirection(
                payload.prompt,
                audioMode,
                payload.dialogue,
                selected.resolvedDuration,
            ),
            duration: selected.resolvedDuration,
            resolution: selected.resolvedResolution,
            aspect_ratio: aspectRatio,
        };
        body.generate_audio = audioApplied;
        const frameImages: Array<Record<string, unknown>> = [];
        if (firstFrameImage) {
            frameImages.push({
                type: 'image_url',
                image_url: { url: firstFrameImage },
                frame_type: 'first_frame',
            });
        }
        if (endFrameImage) {
            frameImages.push({
                type: 'image_url',
                image_url: { url: endFrameImage },
                frame_type: 'last_frame',
            });
        }
        if (frameImages.length) body.frame_images = frameImages;
        if (appliedVisualReferences.length) {
            body.input_references = appliedVisualReferences.map((image) => ({
                type: 'image_url',
                image_url: { url: image },
            }));
        }

        const submitted = await requestVideo(OPENROUTER_VIDEO_BASE_URL, runtime.openRouterApiKey, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        if (!submitted?.id) {
            throw new Error(extractError(submitted, 'OpenRouter did not return a video job id.'));
        }

        const submittedAt = new Date().toISOString();
        checkpoint = {
            version: 1,
            checkpointKey,
            jobId: submitted.id,
            generationId: submitted.generation_id || null,
            pollingUrl: submitted.polling_url || null,
            modelId: submitted.model || selected.model.id,
            modelName: selected.model.name || selected.model.id,
            status: submitted.status || 'pending',
            submittedAt,
            lastPolledAt: submittedAt,
            qualityMode,
            requestedResolution,
            resolvedResolution: selected.resolvedResolution,
            durationApplied: selected.resolvedDuration,
            estimatedCostUsd: selected.estimatedCostUsd,
            firstFrameApplied: Boolean(firstFrameImage),
            endFrameApplied: Boolean(endFrameImage),
            visualReferencesApplied: appliedVisualReferences.length,
            audioApplied,
            audioModeApplied: audioMode,
            lipSyncRequested,
        };
        await options.onCheckpoint?.(checkpoint);
    }

    let polled: Awaited<ReturnType<typeof pollVideo>>;
    try {
        polled = await pollVideo({
            apiKey: runtime.openRouterApiKey,
            checkpoint,
            timeoutMs: options.pollTimeoutMs ?? OPENROUTER_VIDEO_POLL_TIMEOUT_MS,
            onCheckpoint: options.onCheckpoint,
        });
    } catch (error) {
        if (error instanceof OpenRouterVideoPendingError && !options.onCheckpoint) {
            throw new Error('OpenRouter video generation is still processing. Use a queued studio job so it can resume safely.');
        }
        throw error;
    }

    const completed = polled.response;
    checkpoint = polled.checkpoint;
    const videoUrl = completed.unsigned_urls?.[0]
        || `${OPENROUTER_VIDEO_BASE_URL}/${checkpoint.jobId}/content?index=0`;
    await recordOpenRouterUsage({
        operation: 'video',
        source: 'next_server',
        model: completed.model || checkpoint.modelId,
        costUsd: completed.usage?.cost,
        requestId: checkpoint.jobId,
    });
    return {
        success: true,
        provider: 'openrouter',
        videoId: checkpoint.jobId,
        videoUrl,
        metadata: {
            mode: payload.mode,
            requestId: checkpoint.jobId,
            modelUsed: completed.model || checkpoint.modelId,
            keySource: runtime.source,
            costUsd: completed.usage?.cost,
            selectionSource: 'catalog',
            estimatedCostUsd: checkpoint.estimatedCostUsd,
            resolvedResolution: checkpoint.resolvedResolution,
            durationApplied: checkpoint.durationApplied,
            firstFrameApplied: checkpoint.firstFrameApplied,
            endFrameApplied: checkpoint.endFrameApplied,
            visualReferencesApplied: checkpoint.visualReferencesApplied,
            audioApplied: checkpoint.audioApplied,
            audioModeApplied: checkpoint.audioModeApplied,
            lipSyncRequested: checkpoint.lipSyncRequested,
        },
    };
}

export async function downloadOpenRouterVideo(sourceUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    const runtime = await getAIRuntimeConfig();
    if (!runtime.openRouterApiKey) throw new Error('OPENROUTER_API_KEY is missing.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENROUTER_VIDEO_DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(sourceUrl, {
        headers: { Authorization: `Bearer ${runtime.openRouterApiKey}` },
        cache: 'no-store',
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error(`OpenRouter video content download failed: HTTP ${response.status}`);
    return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') || 'video/mp4',
    };
}
