"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterVideoPendingError = exports.openRouterVideoCheckpointSchema = void 0;
exports.readOpenRouterVideoCheckpoint = readOpenRouterVideoCheckpoint;
exports.isResumableOpenRouterVideoCheckpoint = isResumableOpenRouterVideoCheckpoint;
exports.preflightOpenRouterVideo = preflightOpenRouterVideo;
exports.estimateOpenRouterVideo = estimateOpenRouterVideo;
exports.deriveVideoInfraHint = deriveVideoInfraHint;
exports.generateOpenRouterVideo = generateOpenRouterVideo;
exports.downloadOpenRouterVideo = downloadOpenRouterVideo;
const openrouterUsage_1 = require("../openrouterUsage");
const zod_1 = require("zod");
const OPENROUTER_VIDEO_BASE_URL = 'https://openrouter.ai/api/v1/videos';
const OPENROUTER_VIDEO_MODELS_URL = `${OPENROUTER_VIDEO_BASE_URL}/models`;
const VIDEO_MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
const OPENROUTER_REQUEST_TIMEOUT_MS = 45 * 1000;
const OPENROUTER_VIDEO_POLL_TIMEOUT_MS = 6 * 60 * 1000;
const OPENROUTER_VIDEO_POLL_INTERVAL_MS = 30 * 1000;
const OPENROUTER_VIDEO_DOWNLOAD_TIMEOUT_MS = 90 * 1000;
const VIDEO_AUDIO_MODES = ['silent', 'ambient', 'dialogue'];
const AUDIO_DIRECTION_HEADER = 'Audio direction:';
const VIDEO_DURATION_OPTIONS = [3, 4, 5, 6, 8, 10, 12, 15];
const DIALOGUE_LEAD_SECONDS = 0.8;
const DIALOGUE_UNITS_PER_SECOND = 4.1;
exports.openRouterVideoCheckpointSchema = zod_1.z.object({
    version: zod_1.z.literal(1),
    checkpointKey: zod_1.z.string().min(1),
    jobId: zod_1.z.string().min(1),
    generationId: zod_1.z.string().min(1).nullable(),
    pollingUrl: zod_1.z.string().min(1).nullable(),
    modelId: zod_1.z.string().min(1),
    modelName: zod_1.z.string().min(1),
    status: zod_1.z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'expired']),
    submittedAt: zod_1.z.string().min(1),
    lastPolledAt: zod_1.z.string().min(1),
    qualityMode: zod_1.z.enum(['proof', 'final']),
    requestedResolution: zod_1.z.enum(['480p', '720p', '1080p']),
    resolvedResolution: zod_1.z.string().min(1),
    durationApplied: zod_1.z.number().int().positive(),
    estimatedCostUsd: zod_1.z.number().nonnegative().nullable(),
    firstFrameApplied: zod_1.z.boolean(),
    endFrameApplied: zod_1.z.boolean(),
    visualReferencesApplied: zod_1.z.number().int().nonnegative(),
    audioApplied: zod_1.z.boolean(),
    audioModeApplied: zod_1.z.enum(VIDEO_AUDIO_MODES).default('silent'),
    lipSyncRequested: zod_1.z.boolean().default(false),
});
class OpenRouterVideoPendingError extends Error {
    constructor(checkpoint) {
        super('OpenRouter video generation is still processing and will resume automatically.');
        this.name = 'OpenRouterVideoPendingError';
        this.checkpoint = checkpoint;
    }
}
exports.OpenRouterVideoPendingError = OpenRouterVideoPendingError;
function readOpenRouterVideoCheckpoint(value) {
    const parsed = exports.openRouterVideoCheckpointSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
function isResumableOpenRouterVideoCheckpoint(value) {
    const checkpoint = readOpenRouterVideoCheckpoint(value);
    return Boolean(checkpoint
        && (checkpoint.status === 'pending'
            || checkpoint.status === 'in_progress'
            || checkpoint.status === 'completed'));
}
let cachedVideoModels = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeImage = (image) => {
    const value = image === null || image === void 0 ? void 0 : image.trim();
    if (!value)
        return undefined;
    if (value.startsWith('data:image/') || /^https?:\/\//i.test(value))
        return value;
    return `data:image/png;base64,${value}`;
};
const extractError = (payload, fallback) => { var _a; return typeof (payload === null || payload === void 0 ? void 0 : payload.error) === 'string' ? payload.error : ((_a = payload === null || payload === void 0 ? void 0 : payload.error) === null || _a === void 0 ? void 0 : _a.message) || fallback; };
function resolveVideoAudioMode(payload) {
    if (payload.audioMode)
        return payload.audioMode;
    return payload.generateAudio ? 'ambient' : 'silent';
}
function analyzeDialogueTiming(dialogue, durationSeconds) {
    var _a;
    const normalized = (dialogue === null || dialogue === void 0 ? void 0 : dialogue.trim()) || '';
    const hangulAndNumbers = ((_a = normalized.match(/[\p{Script=Hangul}\p{N}]/gu)) === null || _a === void 0 ? void 0 : _a.length) || 0;
    const latinUnits = (normalized.match(/[A-Za-z]+/g) || []).reduce((sum, word) => sum + Math.max(1, Math.ceil(word.length / 4)), 0);
    const speechUnits = hangulAndNumbers + latinUnits;
    const safeDuration = Math.max(1, Math.min(15, Math.round(durationSeconds)));
    const capacityUnits = Math.max(1, Math.floor(Math.max(0.5, safeDuration - DIALOGUE_LEAD_SECONDS) * DIALOGUE_UNITS_PER_SECOND));
    const estimatedSeconds = speechUnits
        ? Number((speechUnits / DIALOGUE_UNITS_PER_SECOND + DIALOGUE_LEAD_SECONDS).toFixed(1))
        : 0;
    const requiredDuration = Math.max(3, Math.ceil(estimatedSeconds));
    const recommendedDurationSeconds = VIDEO_DURATION_OPTIONS.find((candidate) => candidate >= requiredDuration) || VIDEO_DURATION_OPTIONS[VIDEO_DURATION_OPTIONS.length - 1];
    const maxSupportedDuration = VIDEO_DURATION_OPTIONS[VIDEO_DURATION_OPTIONS.length - 1];
    const maxCapacityUnits = Math.floor((maxSupportedDuration - DIALOGUE_LEAD_SECONDS) * DIALOGUE_UNITS_PER_SECOND);
    return {
        estimatedSeconds,
        recommendedDurationSeconds,
        isOver: speechUnits > capacityUnits,
        fitsSupportedDuration: speechUnits <= maxCapacityUnits,
    };
}
function appendVideoAudioDirection(prompt, audioMode, dialogue, durationSeconds = 6) {
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
        `Generate native synchronized dialogue audio. The visible on-screen speaker must say exactly this Korean dialogue without translating, paraphrasing, or adding words: ${JSON.stringify((dialogue === null || dialogue === void 0 ? void 0 : dialogue.trim()) || '')}.`,
        `Deliver the complete line naturally within ${durationSeconds} seconds, including a short visual lead-in and a clean reaction beat after speaking. The estimated spoken length is about ${timing.estimatedSeconds.toFixed(1)} seconds.`,
        'Keep the speaking face clearly visible in a stable front or three-quarter medium close-up whenever the storyboard allows it. The lips, jaw, and cheeks must remain unobstructed; avoid extreme profile angles, fast head turns, hand-over-mouth gestures, cuts, and camera shake while speaking.',
        'Match every visible mouth movement to the spoken phonemes with natural timing, breathing, expression, and room acoustics. Use one stable Korean speaker voice identity for this character and keep it consistent across every storyboard scene. Keep dialogue clean and centered over subtle room tone. Do not add narration, extra speakers, background music, subtitles, captions, or readable text.',
    ].join('\n\n');
}
const parseResponse = async (response) => {
    const raw = await response.text();
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch (_a) {
        if (!response.ok)
            throw new Error(raw.slice(0, 1000));
        return null;
    }
};
const requestVideo = async (url, apiKey, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, Object.assign(Object.assign({}, init), { headers: Object.assign(Object.assign(Object.assign({ Authorization: `Bearer ${apiKey}` }, ((init === null || init === void 0 ? void 0 : init.body) ? { 'Content-Type': 'application/json' } : {})), { 'X-OpenRouter-Title': 'ProPig Video Studio' }), init === null || init === void 0 ? void 0 : init.headers), cache: 'no-store', signal: controller.signal }));
        const payload = await parseResponse(response);
        if (!response.ok)
            throw new Error(extractError(payload, `OpenRouter HTTP ${response.status}`));
        return payload;
    }
    catch (error) {
        if (controller.signal.aborted) {
            throw new Error('OpenRouter video API request timed out after 45 seconds.');
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
    }
};
function supportsValue(supported, value) {
    return !(supported === null || supported === void 0 ? void 0 : supported.length) || supported.includes(value);
}
function supportsFrame(model, frameType) {
    if (model.supported_frame_images === true)
        return true;
    const aliases = frameType === 'first_frame' ? ['first_frame', 'first'] : ['last_frame', 'last'];
    return Array.isArray(model.supported_frame_images)
        && model.supported_frame_images.some((value) => aliases.includes(value));
}
function supportsDuration(model, duration) {
    var _a;
    return !((_a = model.supported_durations) === null || _a === void 0 ? void 0 : _a.length) || model.supported_durations.includes(duration);
}
function resolvedDurationFor(model, requested) {
    var _a;
    const supported = (_a = model.supported_durations) === null || _a === void 0 ? void 0 : _a.filter((duration) => Number.isInteger(duration) && duration > 0);
    if (!(supported === null || supported === void 0 ? void 0 : supported.length) || supported.includes(requested))
        return requested;
    return [...supported].sort((left, right) => (Math.abs(left - requested) - Math.abs(right - requested)
        || left - right))[0] || requested;
}
function supportsInputReferences(model) {
    var _a;
    if (model.supported_input_references === true)
        return true;
    if (/^bytedance\/seedance-2\.0(?:-|$)/i.test(model.id))
        return true;
    if (/^alibaba\/wan-2\.7(?:-|$)/i.test(model.id))
        return true;
    const description = ((_a = model.description) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
    return /\b(reference[- ]to[- ]video|reference images?|input_references)\b/.test(description);
}
function supportsDialogueLipSync(model) {
    var _a;
    const id = model.id.toLowerCase();
    if (/^bytedance\/seedance-(?:2\.0|1\.5-pro)(?:-|$)/.test(id))
        return true;
    if (/^alibaba\/wan-2\.6(?:-|$)/.test(id))
        return true;
    const description = ((_a = model.description) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
    return /\b(lip[- ]?sync|multi-character dialogue|spoken dialogue|speech synchronization|native synchronized audio|synchronized audio)\b/.test(description);
}
function dialogueModelQualityScore(model) {
    const id = model.id.toLowerCase();
    if (/^bytedance\/seedance-2\.0(?:$|:)/.test(id))
        return 9000;
    if (/^alibaba\/wan-2\.6(?:-|$|:)/.test(id))
        return 7500;
    if (/^bytedance\/seedance-2\.0-fast(?:-|$|:)/.test(id))
        return 6000;
    if (/^bytedance\/seedance-1\.5-pro(?:-|$|:)/.test(id))
        return 5000;
    return supportsDialogueLipSync(model) ? 3000 : 0;
}
function resolvedResolutionFor(model, requested) {
    const supported = model.supported_resolutions;
    if (!(supported === null || supported === void 0 ? void 0 : supported.length) || supported.includes(requested))
        return requested;
    const fallbacks = requested === '1080p'
        ? ['720p', '480p']
        : requested === '720p'
            ? ['480p', '1080p']
            : ['720p', '1080p'];
    const fallback = fallbacks.find((value) => supported.includes(value));
    if (fallback)
        return fallback;
    return supported[0] || null;
}
function parsePrice(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function resolvePricedVideoSize(model, resolution, aspectRatio) {
    const shortEdge = resolution === '4K'
        ? 2160
        : Number.parseInt(resolution, 10);
    const [aspectWidth, aspectHeight] = aspectRatio
        .split(':')
        .map((value) => Number(value));
    if (!Number.isFinite(shortEdge)
        || !Number.isFinite(aspectWidth)
        || !Number.isFinite(aspectHeight)
        || shortEdge <= 0
        || aspectWidth <= 0
        || aspectHeight <= 0) {
        return null;
    }
    const targetRatio = aspectWidth / aspectHeight;
    const candidates = (model.supported_sizes || []).flatMap((size) => {
        const matched = /^(\d+)x(\d+)$/i.exec(size);
        if (!matched)
            return [];
        const width = Number(matched[1]);
        const height = Number(matched[2]);
        if (Math.min(width, height) !== shortEdge)
            return [];
        return [{ width, height, ratioDistance: Math.abs(width / height - targetRatio) }];
    });
    candidates.sort((left, right) => left.ratioDistance - right.ratioDistance);
    return candidates[0] || null;
}
function readPricing(model, resolution, duration, generateAudio, hasReferenceImage, referenceImageCount, aspectRatio) {
    var _a, _b, _c, _d;
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
    rateCandidates.push(skus[`per-video-second-${resolution.toLowerCase()}`], skus['per-video-second']);
    for (const candidate of rateCandidates) {
        const rateUsdPerSecond = parsePrice(candidate);
        if (rateUsdPerSecond !== null) {
            const imageInputCents = (_a = parsePrice(skus.cents_per_image_input)) !== null && _a !== void 0 ? _a : 0;
            const imageInputUsd = (imageInputCents / 100) * referenceImageCount;
            return {
                rateUsdPerSecond,
                estimatedCostUsd: Number((rateUsdPerSecond * duration + imageInputUsd).toFixed(6)),
            };
        }
    }
    const centsRate = parsePrice((_b = skus[`cents_per_video_output_second_${resolutionKey}`]) !== null && _b !== void 0 ? _b : skus.cents_per_video_output_second);
    if (centsRate !== null) {
        const rateUsdPerSecond = centsRate / 100;
        const imageInputCents = (_c = parsePrice(skus.cents_per_image_input)) !== null && _c !== void 0 ? _c : 0;
        return {
            rateUsdPerSecond,
            estimatedCostUsd: Number((rateUsdPerSecond * duration
                + (imageInputCents / 100) * referenceImageCount).toFixed(6)),
        };
    }
    const videoTokenRate = parsePrice(generateAudio
        ? skus.video_tokens
        : (_d = skus.video_tokens_without_audio) !== null && _d !== void 0 ? _d : skus.video_tokens);
    const pricedSize = resolvePricedVideoSize(model, resolution, aspectRatio);
    if (videoTokenRate !== null && pricedSize) {
        const videoTokens = (pricedSize.width * pricedSize.height * duration * 24) / 1024;
        const estimatedCostUsd = videoTokens * videoTokenRate;
        return {
            rateUsdPerSecond: Number((estimatedCostUsd / duration).toFixed(6)),
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
function proofSpeedScore(model) {
    const id = model.id.toLowerCase();
    if (id.includes('seedance-2.0-fast'))
        return 4;
    if (/(?:^|[-/])fast(?:$|-)/.test(id))
        return 3;
    if (id.includes('lite'))
        return 2;
    return 0;
}
function capabilityScore(model, hasReferenceImage, hasEndReferenceImage, hasVisualReferenceImages, generateAudio, requiresLipSync) {
    const resolutions = model.supported_resolutions || [];
    const aspects = model.supported_aspect_ratios || [];
    return ((hasReferenceImage && supportsFrame(model, 'first_frame') ? 10000 : 0)
        + (hasEndReferenceImage && supportsFrame(model, 'last_frame') ? 8000 : 0)
        + (hasVisualReferenceImages && supportsInputReferences(model) ? 6000 : 0)
        + (requiresLipSync ? dialogueModelQualityScore(model) : 0)
        + (generateAudio && model.generate_audio === true ? 2000 : 0)
        + (resolutions.includes('1080p') ? 1000 : 0)
        + (resolutions.includes('2K') || resolutions.includes('4K') ? 500 : 0)
        + resolutions.length * 20
        + aspects.length);
}
async function discoverVideoModels(apiKey) {
    if (cachedVideoModels && cachedVideoModels.expiresAt > Date.now())
        return cachedVideoModels.models;
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
    if (!response.ok)
        throw new Error(`OpenRouter video model discovery failed (${response.status}).`);
    const payload = await response.json();
    const models = Array.isArray(payload.data)
        ? payload.data.filter((item) => (Boolean(item)
            && typeof item === 'object'
            && typeof item.id === 'string'))
        : [];
    if (!models.length)
        throw new Error('OpenRouter returned no available video models.');
    cachedVideoModels = { models, expiresAt: Date.now() + VIDEO_MODEL_CACHE_TTL_MS };
    return models;
}
async function selectVideoModel(params) {
    const models = await discoverVideoModels(params.apiKey);
    const generateAudio = params.audioMode !== 'silent';
    const requiresLipSync = params.audioMode === 'dialogue';
    const compatible = models.flatMap((model) => {
        if (!supportsValue(model.supported_aspect_ratios, params.aspectRatio))
            return [];
        const resolvedResolution = resolvedResolutionFor(model, params.resolution);
        if (!resolvedResolution)
            return [];
        const resolvedDuration = resolvedDurationFor(model, params.duration);
        const pricing = readPricing(model, resolvedResolution, resolvedDuration, generateAudio, params.hasReferenceImage, Number(params.hasReferenceImage)
            + Number(params.hasEndReferenceImage)
            + (params.hasVisualReferenceImages ? 1 : 0), params.aspectRatio);
        return [Object.assign({ model,
                resolvedResolution,
                resolvedDuration }, pricing)];
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
    const exactDurationCandidates = capabilityCandidates.filter(({ model }) => supportsDuration(model, params.duration));
    const candidates = exactDurationCandidates.length
        ? exactDurationCandidates
        : capabilityCandidates;
    candidates.sort((left, right) => {
        var _a, _b;
        const knownPriceDelta = Number(right.estimatedCostUsd !== null)
            - Number(left.estimatedCostUsd !== null);
        if (knownPriceDelta)
            return knownPriceDelta;
        if (params.qualityMode === 'final') {
            const capabilityDelta = capabilityScore(right.model, params.hasReferenceImage, params.hasEndReferenceImage, params.hasVisualReferenceImages, generateAudio, requiresLipSync) - capabilityScore(left.model, params.hasReferenceImage, params.hasEndReferenceImage, params.hasVisualReferenceImages, generateAudio, requiresLipSync);
            if (capabilityDelta)
                return capabilityDelta;
        }
        else {
            const exactResolutionDelta = Number(right.resolvedResolution === params.resolution)
                - Number(left.resolvedResolution === params.resolution);
            if (exactResolutionDelta)
                return exactResolutionDelta;
            const speedDelta = proofSpeedScore(right.model) - proofSpeedScore(left.model);
            if (speedDelta)
                return speedDelta;
        }
        const leftCost = (_a = left.estimatedCostUsd) !== null && _a !== void 0 ? _a : Number.POSITIVE_INFINITY;
        const rightCost = (_b = right.estimatedCostUsd) !== null && _b !== void 0 ? _b : Number.POSITIVE_INFINITY;
        if (leftCost !== rightCost)
            return leftCost - rightCost;
        return left.model.id.localeCompare(right.model.id);
    });
    const selected = candidates[0];
    return Object.assign(Object.assign({}, selected), { catalogModelCount: models.length, compatibleModelCount: compatible.length, supportsFirstFrame: supportsFrame(selected.model, 'first_frame'), supportsEndFrame: supportsFrame(selected.model, 'last_frame'), supportsInputReferences: supportsInputReferences(selected.model), supportsAudio: selected.model.generate_audio === true, supportsDialogueLipSync: supportsDialogueLipSync(selected.model) });
}
async function preflightOpenRouterVideo(params) {
    const requestedInputs = {
        firstFrame: Boolean(params.hasReferenceImage),
        lastFrame: Boolean(params.hasEndReferenceImage),
        visualReferences: Boolean(params.hasVisualReferenceImages),
        audioMode: (params.audioMode || 'silent'),
    };
    const visualReferencesCanBeApplied = requestedInputs.visualReferences
        && !requestedInputs.firstFrame
        && !requestedInputs.lastFrame;
    const selected = await selectVideoModel(Object.assign(Object.assign({}, params), { qualityMode: params.qualityMode || 'proof', hasReferenceImage: requestedInputs.firstFrame, hasEndReferenceImage: requestedInputs.lastFrame, hasVisualReferenceImages: visualReferencesCanBeApplied, audioMode: requestedInputs.audioMode }));
    const warnings = [];
    if (requestedInputs.visualReferences && !visualReferencesCanBeApplied) {
        warnings.push('OpenRouter prioritizes first/last frames when frame images and general references are both provided. This scene keeps frame continuity and does not directly apply the general references.');
    }
    if (selected.resolvedResolution !== params.resolution) {
        warnings.push(`요청한 ${params.resolution} 대신 ${selected.resolvedResolution} 해상도로 생성됩니다.`);
    }
    if (selected.resolvedDuration !== params.duration) {
        warnings.push(`요청한 ${params.duration}초 대신 모델이 지원하는 ${selected.resolvedDuration}초로 생성됩니다.`);
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
async function estimateOpenRouterVideo(params) {
    return preflightOpenRouterVideo(params);
}
function resolveOpenRouterPollingUrl(checkpoint) {
    var _a;
    const fallback = `${OPENROUTER_VIDEO_BASE_URL}/${encodeURIComponent(checkpoint.jobId)}`;
    if (!((_a = checkpoint.pollingUrl) === null || _a === void 0 ? void 0 : _a.trim()))
        return fallback;
    try {
        const pollingUrl = new URL(checkpoint.pollingUrl, 'https://openrouter.ai');
        if (pollingUrl.protocol === 'https:'
            && pollingUrl.hostname === 'openrouter.ai'
            && pollingUrl.pathname.startsWith('/api/v1/videos/')) {
            return pollingUrl.toString();
        }
    }
    catch (_b) {
        return fallback;
    }
    return fallback;
}
const pollVideo = async (params) => {
    var _a;
    const deadline = Date.now() + Math.max(1000, params.timeoutMs);
    let checkpoint = params.checkpoint;
    while (true) {
        const result = await requestVideo(resolveOpenRouterPollingUrl(checkpoint), params.apiKey, { method: 'GET' });
        const status = (result === null || result === void 0 ? void 0 : result.status) || 'pending';
        checkpoint = Object.assign(Object.assign({}, checkpoint), { generationId: (result === null || result === void 0 ? void 0 : result.generation_id) || checkpoint.generationId, modelId: (result === null || result === void 0 ? void 0 : result.model) || checkpoint.modelId, status, lastPolledAt: new Date().toISOString() });
        await ((_a = params.onCheckpoint) === null || _a === void 0 ? void 0 : _a.call(params, checkpoint));
        if (status === 'completed') {
            return { response: result || {}, checkpoint };
        }
        if (status === 'failed' || status === 'cancelled' || status === 'expired') {
            throw new Error(extractError(result, `OpenRouter video job ${status}`));
        }
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0)
            break;
        await sleep(Math.min(OPENROUTER_VIDEO_POLL_INTERVAL_MS, remainingMs));
    }
    throw new OpenRouterVideoPendingError(checkpoint);
};
function deriveVideoInfraHint(rawMessage) {
    const lower = rawMessage.toLowerCase();
    if (lower.includes('api key') || lower.includes('missing_api_key'))
        return 'OPENROUTER_API_KEY가 설정되지 않았습니다.';
    if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('unauthorized'))
        return 'OpenRouter API 인증 또는 권한을 확인하세요.';
    if (lower.includes('rate limit') || lower.includes('429'))
        return 'OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.';
    if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('expired'))
        return 'OpenRouter 영상 생성 시간이 초과되었습니다.';
    return rawMessage;
}
async function generateOpenRouterVideo(payload, options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey)
        throw new Error('OPENROUTER_API_KEY is missing.');
    const audioMode = resolveVideoAudioMode(payload);
    const duration = (_a = payload.duration) !== null && _a !== void 0 ? _a : 6;
    if (audioMode === 'dialogue' && !((_b = payload.dialogue) === null || _b === void 0 ? void 0 : _b.trim())) {
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
    const requestedResolution = (_c = payload.resolution) !== null && _c !== void 0 ? _c : '720p';
    const aspectRatio = payload.aspectRatio || '16:9';
    const referenceImage = normalizeImage(payload.image);
    const requestedEndFrameImage = normalizeImage(payload.endImage);
    const visualReferenceImages = (payload.referenceImages || [])
        .map(normalizeImage)
        .filter((image) => Boolean(image))
        .slice(0, 2);
    const canApplyVisualReferences = visualReferenceImages.length > 0
        && !referenceImage
        && !requestedEndFrameImage;
    const checkpointKey = options.checkpointKey || 'direct';
    const qualityMode = payload.qualityMode || 'proof';
    const resumeCheckpoint = readOpenRouterVideoCheckpoint(options.resumeCheckpoint);
    const canResume = Boolean(resumeCheckpoint
        && resumeCheckpoint.checkpointKey === checkpointKey
        && isResumableOpenRouterVideoCheckpoint(resumeCheckpoint));
    let checkpoint;
    if (canResume && resumeCheckpoint) {
        checkpoint = resumeCheckpoint;
    }
    else {
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
        const appliedVisualReferences = canApplyVisualReferences && selected.supportsInputReferences
            ? visualReferenceImages
            : [];
        const audioApplied = audioMode !== 'silent' && selected.supportsAudio;
        const lipSyncRequested = audioMode === 'dialogue';
        const body = {
            model: selected.model.id,
            prompt: appendVideoAudioDirection(payload.prompt, audioMode, payload.dialogue, selected.resolvedDuration),
            duration: selected.resolvedDuration,
            resolution: selected.resolvedResolution,
            aspect_ratio: aspectRatio,
        };
        body.generate_audio = audioApplied;
        const frameImages = [];
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
        if (frameImages.length)
            body.frame_images = frameImages;
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
        if (!(submitted === null || submitted === void 0 ? void 0 : submitted.id)) {
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
        await ((_d = options.onCheckpoint) === null || _d === void 0 ? void 0 : _d.call(options, checkpoint));
    }
    let polled;
    try {
        polled = await pollVideo({
            apiKey,
            checkpoint,
            timeoutMs: (_e = options.pollTimeoutMs) !== null && _e !== void 0 ? _e : OPENROUTER_VIDEO_POLL_TIMEOUT_MS,
            onCheckpoint: options.onCheckpoint,
        });
    }
    catch (error) {
        if (error instanceof OpenRouterVideoPendingError && !options.onCheckpoint) {
            throw new Error('OpenRouter video generation is still processing. Use a queued studio job so it can resume safely.');
        }
        throw error;
    }
    const completed = polled.response;
    checkpoint = polled.checkpoint;
    await (0, openrouterUsage_1.recordOpenRouterUsage)({
        operation: 'video',
        model: completed.model || checkpoint.modelId,
        costUsd: (_f = completed.usage) === null || _f === void 0 ? void 0 : _f.cost,
        requestId: checkpoint.jobId,
    });
    return {
        videoUrl: ((_g = completed.unsigned_urls) === null || _g === void 0 ? void 0 : _g[0])
            || `${OPENROUTER_VIDEO_BASE_URL}/${checkpoint.jobId}/content?index=0`,
        metadata: {
            mode: payload.mode,
            modelUsed: completed.model || checkpoint.modelId,
            requestId: checkpoint.jobId,
            costUsd: (_h = completed.usage) === null || _h === void 0 ? void 0 : _h.cost,
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
async function downloadOpenRouterVideo(sourceUrl) {
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey)
        throw new Error('OPENROUTER_API_KEY is missing.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENROUTER_VIDEO_DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(sourceUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
        signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok)
        throw new Error(`OpenRouter video content download failed: HTTP ${response.status}`);
    return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') || 'video/mp4',
    };
}
//# sourceMappingURL=openrouter.js.map