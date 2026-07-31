import { recordOpenRouterUsage } from '../openrouterUsage';
import { z } from 'zod';

const OPENROUTER_VIDEO_BASE_URL = 'https://openrouter.ai/api/v1/videos';
const OPENROUTER_VIDEO_MODELS_URL = `${OPENROUTER_VIDEO_BASE_URL}/models`;
const VIDEO_MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
const OPENROUTER_REQUEST_TIMEOUT_MS = 45 * 1000;
const OPENROUTER_VIDEO_POLL_TIMEOUT_MS = 6 * 60 * 1000;
const OPENROUTER_VIDEO_POLL_INTERVAL_MS = 30 * 1000;
const OPENROUTER_VIDEO_DOWNLOAD_TIMEOUT_MS = 90 * 1000;
const VIDEO_AUDIO_MODES = ['silent', 'ambient', 'dialogue'] as const;
type VideoAudioMode = (typeof VIDEO_AUDIO_MODES)[number];
const AUDIO_DIRECTION_HEADER = 'Audio direction:';
const VIDEO_DURATION_OPTIONS = [3, 4, 5, 6, 8, 10, 12, 15] as const;
const DIALOGUE_LEAD_SECONDS = 0.8;
const DIALOGUE_UNITS_PER_SECOND = 4.1;

type GenerateVideoRequest = {
    prompt: string;
    image?: string;
    endImage?: string;
    referenceImages?: string[];
    mode: 'generate' | 'extend' | 'edit';
    videoUrl?: string;
    duration?: number;
    aspectRatio?: string;
    resolution?: '480p' | '720p' | '1080p';
    qualityMode?: 'proof' | 'final';
    generateAudio?: boolean;
    audioMode?: VideoAudioMode;
    dialogue?: string;
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
        audioMode: VideoAudioMode;
    };
    warnings: string[];
};

type OpenRouterVideoResponse = {
    id?: string;
    generation_id?: string;
    polling_url?: string;
    model?: string | null;
    status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';
    unsigned_urls?: string[];
    error?: string | {
        code?: string;
        message?: string;
        param?: string;
        type?: string;
    };
    usage?: { cost?: number };
};

export const openRouterVideoCheckpointSchema = z.object({
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
    audioModeApplied: z.enum(VIDEO_AUDIO_MODES).default('silent'),
    lipSyncRequested: z.boolean().default(false),
});

export type OpenRouterVideoCheckpoint = z.infer<typeof openRouterVideoCheckpointSchema>;

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

export class OpenRouterVideoRequestError extends Error {
    readonly status: number | null;
    readonly code: string | null;
    readonly param: string | null;
    readonly providerType: string | null;

    constructor(params: {
        message: string;
        status?: number | null;
        code?: string | null;
        param?: string | null;
        providerType?: string | null;
    }) {
        super(params.message);
        this.name = 'OpenRouterVideoRequestError';
        this.status = params.status ?? null;
        this.code = params.code ?? null;
        this.param = params.param ?? null;
        this.providerType = params.providerType ?? null;
    }
}

export function isOpenRouterInputImagePrivacyError(error: unknown): boolean {
    const requestError = error instanceof OpenRouterVideoRequestError ? error : null;
    const normalized = `${requestError?.code || ''} ${error instanceof Error ? error.message : String(error)}`.toLowerCase();
    return normalized.includes('inputimagesensitivecontentdetected.privacyinformation')
        || normalized.includes('may contain real person')
        || (normalized.includes('input image') && normalized.includes('privacy'));
}

export function readOpenRouterVideoCheckpoint(value: unknown): OpenRouterVideoCheckpoint | null {
    const parsed = openRouterVideoCheckpointSchema.safeParse(value);
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
const normalizeImage = (image?: string) => {
    const value = image?.trim();
    if (!value) return undefined;
    if (value.startsWith('data:image/') || /^https?:\/\//i.test(value)) return value;
    return `data:image/png;base64,${value}`;
};
const extractErrorDetails = (payload: OpenRouterVideoResponse | null, fallback: string) => (
    typeof payload?.error === 'string'
        ? { message: payload.error }
        : {
            message: payload?.error?.message || fallback,
            code: payload?.error?.code,
            param: payload?.error?.param,
            providerType: payload?.error?.type,
        }
);
const toOpenRouterVideoRequestError = (
    payload: OpenRouterVideoResponse | null,
    fallback: string,
    status?: number | null,
) => new OpenRouterVideoRequestError({
    ...extractErrorDetails(payload, fallback),
    status,
});

function resolveVideoAudioMode(payload: Pick<GenerateVideoRequest, 'audioMode' | 'generateAudio'>): VideoAudioMode {
    if (payload.audioMode) return payload.audioMode;
    return payload.generateAudio ? 'ambient' : 'silent';
}

function analyzeDialogueTiming(dialogue: string | null | undefined, durationSeconds: number) {
    const normalized = dialogue?.trim() || '';
    const hangulAndNumbers = normalized.match(/[\p{Script=Hangul}\p{N}]/gu)?.length || 0;
    const latinUnits = (normalized.match(/[A-Za-z]+/g) || []).reduce(
        (sum, word) => sum + Math.max(1, Math.ceil(word.length / 4)),
        0,
    );
    const speechUnits = hangulAndNumbers + latinUnits;
    const safeDuration = Math.max(1, Math.min(15, Math.round(durationSeconds)));
    const capacityUnits = Math.max(
        1,
        Math.floor(Math.max(0.5, safeDuration - DIALOGUE_LEAD_SECONDS) * DIALOGUE_UNITS_PER_SECOND),
    );
    const estimatedSeconds = speechUnits
        ? Number((speechUnits / DIALOGUE_UNITS_PER_SECOND + DIALOGUE_LEAD_SECONDS).toFixed(1))
        : 0;
    const requiredDuration = Math.max(3, Math.ceil(estimatedSeconds));
    const recommendedDurationSeconds = VIDEO_DURATION_OPTIONS.find(
        (candidate) => candidate >= requiredDuration,
    ) || VIDEO_DURATION_OPTIONS[VIDEO_DURATION_OPTIONS.length - 1];
    const maxSupportedDuration = VIDEO_DURATION_OPTIONS[VIDEO_DURATION_OPTIONS.length - 1];
    const maxCapacityUnits = Math.floor(
        (maxSupportedDuration - DIALOGUE_LEAD_SECONDS) * DIALOGUE_UNITS_PER_SECOND,
    );

    return {
        estimatedSeconds,
        recommendedDurationSeconds,
        isOver: speechUnits > capacityUnits,
        fitsSupportedDuration: speechUnits <= maxCapacityUnits,
    };
}

function appendVideoAudioDirection(
    prompt: string,
    audioMode: VideoAudioMode,
    dialogue?: string | null,
    durationSeconds = 6,
): string {
    const normalizedPrompt = prompt.trim();
    if (audioMode === 'silent' || normalizedPrompt.includes(`\n\n${AUDIO_DIRECTION_HEADER}\n`)) {
        return normalizedPrompt;
    }
    if (audioMode === 'ambient') {
        return [
            normalizedPrompt,
            AUDIO_DIRECTION_HEADER,
            'Generate synchronized production audio that matches the visible location, movement, materials, and camera distance. Keep it natural and restrained. Do not invent narration, spoken dialogue, or background music.',
        ].join('\n\n');
    }
    const timing = analyzeDialogueTiming(dialogue, durationSeconds);
    return [
        normalizedPrompt,
        AUDIO_DIRECTION_HEADER,
        `Generate native synchronized dialogue audio. The visible on-screen speaker must say exactly this Korean dialogue without translating, paraphrasing, or adding words: ${JSON.stringify(dialogue?.trim() || '')}.`,
        `Deliver the complete line naturally within ${durationSeconds} seconds, including a short visual lead-in and a clean reaction beat after speaking. The estimated spoken length is about ${timing.estimatedSeconds.toFixed(1)} seconds.`,
        'Keep the speaking face clearly visible in a stable front or three-quarter medium close-up whenever the storyboard allows it. The lips, jaw, and cheeks must remain unobstructed; avoid extreme profile angles, fast head turns, hand-over-mouth gestures, cuts, and camera shake while speaking.',
        'Match every visible mouth movement to the spoken phonemes with natural timing, breathing, expression, and room acoustics. Use one stable Korean speaker voice identity for this character and keep it consistent across every storyboard scene. Keep dialogue clean and centered over subtle room tone. Do not add narration, extra speakers, background music, subtitles, captions, or readable text.',
    ].join('\n\n');
}

const parseResponse = async (response: Response): Promise<OpenRouterVideoResponse | null> => {
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
                'X-OpenRouter-Title': 'ProPig Video Studio',
                ...init?.headers,
            },
            cache: 'no-store',
            signal: controller.signal,
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
            throw toOpenRouterVideoRequestError(
                payload,
                `OpenRouter HTTP ${response.status}`,
                response.status,
            );
        }
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
            'X-OpenRouter-Title': 'ProPig Video Studio',
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
    audioMode: VideoAudioMode;
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
    audioMode?: VideoAudioMode;
}): Promise<OpenRouterVideoPreflight> {
    const requestedInputs = {
        firstFrame: Boolean(params.hasReferenceImage),
        lastFrame: Boolean(params.hasEndReferenceImage),
        visualReferences: Boolean(params.hasVisualReferenceImages),
        audioMode: (params.audioMode || 'silent') as VideoAudioMode,
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
            'OpenRouter prioritizes first/last frames when frame images and general references are both provided. This scene keeps frame continuity and does not directly apply the general references.',
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
    audioMode?: VideoAudioMode;
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
            throw toOpenRouterVideoRequestError(result, `OpenRouter video job ${status}`);
        }

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) break;
        await sleep(Math.min(OPENROUTER_VIDEO_POLL_INTERVAL_MS, remainingMs));
    }

    throw new OpenRouterVideoPendingError(checkpoint);
};

export function deriveVideoInfraHint(rawMessage: string): string {
    const lower = rawMessage.toLowerCase();
    if (
        lower.includes('inputimagesensitivecontentdetected.privacyinformation')
        || lower.includes('may contain real person')
        || (lower.includes('input image') && lower.includes('privacy'))
    ) {
        return '참조 사진에 실제 인물이 포함되었거나 그렇게 감지되어 모델이 요청을 받지 않았습니다. 이 장면에서 사진 없이 다시 만들거나 인물 사진을 교체해 주세요.';
    }
    if (lower.includes('api key') || lower.includes('missing_api_key')) return 'OPENROUTER_API_KEY가 설정되지 않았습니다.';
    if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('unauthorized')) return 'OpenRouter API 인증 또는 권한을 확인하세요.';
    if (lower.includes('rate limit') || lower.includes('429')) return 'OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.';
    if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('expired')) return 'OpenRouter 영상 생성 시간이 초과되었습니다.';
    return rawMessage;
}

export async function generateOpenRouterVideo(
    payload: GenerateVideoRequest,
    options: OpenRouterVideoGenerationOptions = {},
): Promise<{
    videoUrl: string;
    metadata: {
        mode: GenerateVideoRequest['mode'];
        modelUsed: string;
        requestId: string;
        costUsd?: number;
        keySource: 'env';
        selectionSource: 'catalog';
        estimatedCostUsd: number | null;
        resolvedResolution: string;
        durationApplied: number;
        firstFrameApplied: boolean;
        endFrameApplied: boolean;
        visualReferencesApplied: number;
        audioApplied: boolean;
        audioModeApplied: VideoAudioMode;
        lipSyncRequested: boolean;
    };
}> {
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing.');
    const audioMode = resolveVideoAudioMode(payload);
    const duration = payload.duration ?? 6;
    if (audioMode === 'dialogue' && !payload.dialogue?.trim()) {
        throw new Error('대사·립싱크 모드에는 말할 대사가 필요합니다.');
    }
    if (audioMode === 'dialogue') {
        const timing = analyzeDialogueTiming(payload.dialogue, duration);
        if (!timing.fitsSupportedDuration) {
            throw new Error('대사가 15초 최대 길이를 넘습니다. 자연스러운 립싱크를 위해 문장을 여러 장면으로 나눠 주세요.');
        }
        if (timing.isOver) {
            throw new Error(`대사가 현재 장면보다 깁니다. 자연스러운 립싱크를 위해 길이를 ${timing.recommendedDurationSeconds}초 이상으로 맞춰 주세요.`);
        }
    }

    const requestedResolution = payload.resolution ?? '720p';
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
            apiKey,
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
            prompt: appendVideoAudioDirection(
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

        const submitted = await requestVideo(OPENROUTER_VIDEO_BASE_URL, apiKey, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        if (!submitted?.id) {
            throw toOpenRouterVideoRequestError(
                submitted,
                'OpenRouter did not return a video job id.',
            );
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
            apiKey,
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
    await recordOpenRouterUsage({
        operation: 'video',
        model: completed.model || checkpoint.modelId,
        costUsd: completed.usage?.cost,
        requestId: checkpoint.jobId,
    });

    return {
        videoUrl: completed.unsigned_urls?.[0]
            || `${OPENROUTER_VIDEO_BASE_URL}/${checkpoint.jobId}/content?index=0`,
        metadata: {
            mode: payload.mode,
            modelUsed: completed.model || checkpoint.modelId,
            requestId: checkpoint.jobId,
            costUsd: completed.usage?.cost,
            keySource: 'env',
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
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENROUTER_VIDEO_DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(sourceUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error(`OpenRouter video content download failed: HTTP ${response.status}`);
    return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') || 'video/mp4',
    };
}
