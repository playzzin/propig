import { recordOpenRouterUsage } from "../openrouterUsage";
import { z } from "zod";
import { normalizeVideoSpokenDialogue } from "./dialogue";
import {
  fetchExternalHttpsUrl,
  normalizeExternalHttpsUrl,
  readCappedBinaryResponse,
} from "../api/security";

const OPENROUTER_VIDEO_BASE_URL = "https://openrouter.ai/api/v1/videos";
const OPENROUTER_VIDEO_MODELS_URL = `${OPENROUTER_VIDEO_BASE_URL}/models`;
const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";
// The provider catalog changes independently from app releases. Keep automatic
// selection fresh and coalesce simultaneous estimate requests into one fetch.
const VIDEO_MODEL_CACHE_TTL_MS = 3 * 60 * 1000;
const OPENROUTER_CREDIT_CACHE_TTL_MS = 20 * 1000;
const OPENROUTER_REQUEST_TIMEOUT_MS = 45 * 1000;
const OPENROUTER_VIDEO_POLL_TIMEOUT_MS = 6 * 60 * 1000;
const OPENROUTER_VIDEO_POLL_INTERVAL_MS = 30 * 1000;
const OPENROUTER_VIDEO_DOWNLOAD_TIMEOUT_MS = 90 * 1000;
const OPENROUTER_VIDEO_MAX_BYTES = 256 * 1024 * 1024;
const OPENROUTER_VIDEO_API_ORIGIN = new URL(OPENROUTER_VIDEO_BASE_URL).origin;

export function buildOpenRouterVideoDownloadHeaders(
  sourceUrl: string,
  apiKey: string,
): Record<string, string> {
  const parsedSourceUrl = new URL(normalizeExternalHttpsUrl(sourceUrl));
  return parsedSourceUrl.origin === OPENROUTER_VIDEO_API_ORIGIN &&
    parsedSourceUrl.pathname.startsWith("/api/v1/videos/")
    ? { Authorization: `Bearer ${apiKey}` }
    : {};
}
const VIDEO_AUDIO_MODES = ["silent", "ambient", "dialogue"] as const;
type VideoAudioMode = (typeof VIDEO_AUDIO_MODES)[number];
const AUDIO_DIRECTION_HEADER = "Audio direction:";
const VIDEO_DURATION_OPTIONS = [3, 4, 5, 6, 8, 10, 12, 15] as const;
const DIALOGUE_LEAD_SECONDS = 0.8;
const DIALOGUE_UNITS_PER_SECOND = 4.1;

type GenerateVideoRequest = {
  prompt: string;
  image?: string;
  endImage?: string;
  referenceImages?: string[];
  mode: "generate" | "extend" | "edit";
  videoUrl?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: "480p" | "720p" | "1080p";
  qualityMode?: "proof" | "final";
  generateAudio?: boolean;
  audioMode?: VideoAudioMode;
  dialogue?: string;
};

type OpenRouterVideoModel = {
  id: string;
  canonical_slug?: string;
  name?: string;
  description?: string;
  created?: number;
  supported_resolutions?: string[];
  supported_aspect_ratios?: string[];
  supported_sizes?: string[] | null;
  supported_durations?: number[];
  supported_frame_images?: string[] | boolean;
  supported_input_references?: boolean;
  supported_lip_sync?: boolean;
  generate_audio?: boolean;
  pricing_skus?: Record<string, string | number>;
};

const OpenRouterVideoModelSchema = z
  .object({
    id: z.string().trim().min(1),
    canonical_slug: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    created: z.number().finite().nonnegative().optional(),
    supported_resolutions: z.array(z.string()).optional(),
    supported_aspect_ratios: z.array(z.string()).optional(),
    supported_sizes: z.array(z.string()).nullable().optional(),
    supported_durations: z.array(z.number()).optional(),
    supported_frame_images: z
      .union([z.array(z.string()), z.boolean()])
      .optional(),
    supported_input_references: z.boolean().optional(),
    supported_lip_sync: z.boolean().optional(),
    generate_audio: z.boolean().optional(),
    pricing_skus: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .optional(),
  })
  .passthrough();

const OpenRouterVideoCatalogSchema = z.object({
  data: z.array(z.unknown()),
});

const OpenRouterCreditsSchema = z.object({
  data: z.object({
    total_credits: z.number().finite(),
    total_usage: z.number().finite(),
  }),
});

export type OpenRouterVideoEstimate = {
  selection: "automatic";
  modelId: string;
  modelName: string;
  requestedResolution: "480p" | "720p" | "1080p";
  resolvedResolution: string;
  resolvedSize: string | null;
  requestedDuration: number;
  resolvedDuration: number;
  aspectRatio: string;
  rateUsdPerSecond: number | null;
  estimatedCostUsd: number | null;
};

export type OpenRouterVideoPreflight = OpenRouterVideoEstimate & {
  canSubmit: boolean;
  catalogModelCount: number;
  compatibleModelCount: number;
  catalog: {
    source: "live" | "cache";
    fetchedAt: string;
    refreshAfter: string;
    selectedModelCreatedAt: string | null;
  };
  credit: {
    state: "available" | "unavailable";
    source: "live" | "cache" | null;
    remainingUsd: number | null;
    totalCreditsUsd: number | null;
    totalUsageUsd: number | null;
    requiredUsd: number | null;
    isSufficient: boolean | null;
    message: string | null;
    fetchedAt: string | null;
    refreshAfter: string | null;
  };
  policy: {
    visualInputState:
      | "not_requested"
      | "provider_review_required"
      | "previously_rejected";
    automaticRetryAllowed: boolean;
    message: string;
    recommendedActions: string[];
  };
  selectionReasons: string[];
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

const openRouterVideoExecutionCapabilitiesSchema = z.object({
  firstFrame: z.boolean(),
  lastFrame: z.boolean(),
  visualReferences: z.boolean(),
  audio: z.boolean(),
  dialogueLipSync: z.boolean(),
});

const openRouterVideoExecutionInputsSchema = z.object({
  firstFrame: z.boolean(),
  lastFrame: z.boolean(),
  visualReferences: z.boolean(),
  audioMode: z.enum(VIDEO_AUDIO_MODES),
});

export const openRouterVideoExecutionPlanSchema = z.object({
  version: z.literal(1),
  provider: z.literal("openrouter"),
  selection: z.literal("automatic"),
  modelId: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  qualityMode: z.enum(["proof", "final"]),
  requestedResolution: z.enum(["480p", "720p", "1080p"]),
  resolvedResolution: z.string().trim().min(1),
  resolvedSize: z
    .string()
    .regex(/^\d+x\d+$/)
    .nullable(),
  requestedDuration: z.number().int().positive(),
  resolvedDuration: z.number().int().positive(),
  aspectRatio: z.string().trim().min(1),
  rateUsdPerSecond: z.number().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  authorizedMaxCostUsd: z.number().nonnegative().nullable(),
  catalogFetchedAt: z.string().datetime(),
  selectedModelCreatedAt: z.string().datetime().nullable(),
  capabilities: openRouterVideoExecutionCapabilitiesSchema,
  requestedInputs: openRouterVideoExecutionInputsSchema,
});

export type OpenRouterVideoExecutionPlan = z.infer<
  typeof openRouterVideoExecutionPlanSchema
>;

const legacyOpenRouterVideoPreflightPlanSchema = z.object({
  selection: z.literal("automatic"),
  modelId: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  requestedResolution: z.enum(["480p", "720p", "1080p"]),
  resolvedResolution: z.string().trim().min(1),
  requestedDuration: z.number().int().positive(),
  resolvedDuration: z.number().int().positive(),
  aspectRatio: z.string().trim().min(1),
  rateUsdPerSecond: z.number().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  catalog: z.object({
    fetchedAt: z.string().datetime(),
    selectedModelCreatedAt: z.string().datetime().nullable(),
  }),
  capabilities: openRouterVideoExecutionCapabilitiesSchema,
  requestedInputs: openRouterVideoExecutionInputsSchema,
});

export function createOpenRouterVideoExecutionPlan(
  preflight: OpenRouterVideoPreflight,
  qualityMode: "proof" | "final",
): OpenRouterVideoExecutionPlan {
  return openRouterVideoExecutionPlanSchema.parse({
    version: 1,
    provider: "openrouter",
    selection: preflight.selection,
    modelId: preflight.modelId,
    modelName: preflight.modelName,
    qualityMode,
    requestedResolution: preflight.requestedResolution,
    resolvedResolution: preflight.resolvedResolution,
    resolvedSize: preflight.resolvedSize,
    requestedDuration: preflight.requestedDuration,
    resolvedDuration: preflight.resolvedDuration,
    aspectRatio: preflight.aspectRatio,
    rateUsdPerSecond: preflight.rateUsdPerSecond,
    estimatedCostUsd: preflight.estimatedCostUsd,
    authorizedMaxCostUsd: preflight.estimatedCostUsd,
    catalogFetchedAt: preflight.catalog.fetchedAt,
    selectedModelCreatedAt: preflight.catalog.selectedModelCreatedAt,
    capabilities: preflight.capabilities,
    requestedInputs: preflight.requestedInputs,
  });
}

export function readOpenRouterVideoExecutionPlan(
  value: unknown,
  legacyQualityMode: "proof" | "final" = "proof",
): OpenRouterVideoExecutionPlan | null {
  const parsed = openRouterVideoExecutionPlanSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const legacy = legacyOpenRouterVideoPreflightPlanSchema.safeParse(value);
  if (!legacy.success) return null;
  return openRouterVideoExecutionPlanSchema.parse({
    version: 1,
    provider: "openrouter",
    ...legacy.data,
    qualityMode: legacyQualityMode,
    resolvedSize: null,
    authorizedMaxCostUsd: legacy.data.estimatedCostUsd,
    catalogFetchedAt: legacy.data.catalog.fetchedAt,
    selectedModelCreatedAt: legacy.data.catalog.selectedModelCreatedAt,
  });
}

type OpenRouterVideoResponse = {
  id?: string;
  generation_id?: string;
  polling_url?: string;
  model?: string | null;
  status?:
    | "pending"
    | "in_progress"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  unsigned_urls?: string[];
  error?:
    | string
    | {
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
  status: z.enum([
    "pending",
    "in_progress",
    "completed",
    "failed",
    "cancelled",
    "expired",
  ]),
  submittedAt: z.string().min(1),
  lastPolledAt: z.string().min(1),
  qualityMode: z.enum(["proof", "final"]),
  requestedResolution: z.enum(["480p", "720p", "1080p"]),
  resolvedResolution: z.string().min(1),
  durationApplied: z.number().int().positive(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  firstFrameApplied: z.boolean(),
  endFrameApplied: z.boolean(),
  visualReferencesApplied: z.number().int().nonnegative(),
  audioApplied: z.boolean(),
  audioModeApplied: z.enum(VIDEO_AUDIO_MODES).default("silent"),
  lipSyncRequested: z.boolean().default(false),
});

export type OpenRouterVideoCheckpoint = z.infer<
  typeof openRouterVideoCheckpointSchema
>;

export type OpenRouterVideoGenerationOptions = {
  checkpointKey?: string;
  resumeCheckpoint?: unknown;
  requireResumeCheckpoint?: boolean;
  executionPlan?: unknown;
  pollTimeoutMs?: number;
  onCheckpoint?: (checkpoint: OpenRouterVideoCheckpoint) => Promise<void>;
};

export class OpenRouterVideoPendingError extends Error {
  readonly checkpoint: OpenRouterVideoCheckpoint;

  constructor(checkpoint: OpenRouterVideoCheckpoint) {
    super(
      "OpenRouter video generation is still processing and will resume automatically.",
    );
    this.name = "OpenRouterVideoPendingError";
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
    this.name = "OpenRouterVideoRequestError";
    this.status = params.status ?? null;
    this.code = params.code ?? null;
    this.param = params.param ?? null;
    this.providerType = params.providerType ?? null;
  }
}

export class OpenRouterVideoContentDownloadError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`OpenRouter video content download failed: HTTP ${status}`);
    this.name = "OpenRouterVideoContentDownloadError";
    this.status = status;
  }
}

export function isOpenRouterVideoContentUnavailableError(
  error: unknown,
): error is OpenRouterVideoContentDownloadError {
  return (
    error instanceof OpenRouterVideoContentDownloadError &&
    [404, 410].includes(error.status)
  );
}

export function isOpenRouterVideoContentAccessError(
  error: unknown,
): error is OpenRouterVideoContentDownloadError {
  return (
    error instanceof OpenRouterVideoContentDownloadError &&
    [401, 403].includes(error.status)
  );
}

export function isOpenRouterInputImagePrivacyError(error: unknown): boolean {
  const requestError =
    error instanceof OpenRouterVideoRequestError ? error : null;
  const normalized =
    `${requestError?.code || ""} ${error instanceof Error ? error.message : String(error)}`.toLowerCase();
  return (
    normalized.includes(
      "inputimagesensitivecontentdetected.privacyinformation",
    ) ||
    normalized.includes("may contain real person") ||
    (normalized.includes("input image") && normalized.includes("privacy"))
  );
}

export function readOpenRouterVideoCheckpoint(
  value: unknown,
): OpenRouterVideoCheckpoint | null {
  const parsed = openRouterVideoCheckpointSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isResumableOpenRouterVideoCheckpoint(value: unknown): boolean {
  const checkpoint = readOpenRouterVideoCheckpoint(value);
  return Boolean(
    checkpoint &&
    (checkpoint.status === "pending" ||
      checkpoint.status === "in_progress" ||
      checkpoint.status === "completed"),
  );
}

type VideoModelCatalog = {
  apiKey: string;
  expiresAt: number;
  fetchedAt: number;
  models: OpenRouterVideoModel[];
};

type OpenRouterCreditsSnapshot = {
  apiKey: string;
  expiresAt: number;
  fetchedAt: number;
  totalCreditsUsd: number;
  totalUsageUsd: number;
  remainingUsd: number;
};

let cachedVideoModels: VideoModelCatalog | null = null;
let pendingVideoModelDiscovery: {
  apiKey: string;
  promise: Promise<VideoModelCatalog>;
} | null = null;
let cachedOpenRouterCredits: OpenRouterCreditsSnapshot | null = null;
let pendingOpenRouterCredits: {
  apiKey: string;
  promise: Promise<OpenRouterCreditsSnapshot>;
} | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeImage = (image?: string) => {
  const value = image?.trim();
  if (!value) return undefined;
  if (value.startsWith("data:image/") || /^https?:\/\//i.test(value))
    return value;
  return `data:image/png;base64,${value}`;
};
const extractErrorDetails = (
  payload: OpenRouterVideoResponse | null,
  fallback: string,
) =>
  typeof payload?.error === "string"
    ? { message: payload.error }
    : {
        message: payload?.error?.message || fallback,
        code: payload?.error?.code,
        param: payload?.error?.param,
        providerType: payload?.error?.type,
      };
const toOpenRouterVideoRequestError = (
  payload: OpenRouterVideoResponse | null,
  fallback: string,
  status?: number | null,
) =>
  new OpenRouterVideoRequestError({
    ...extractErrorDetails(payload, fallback),
    status,
  });

function resolveVideoAudioMode(
  payload: Pick<GenerateVideoRequest, "audioMode" | "generateAudio">,
): VideoAudioMode {
  if (payload.audioMode) return payload.audioMode;
  return payload.generateAudio ? "ambient" : "silent";
}

function analyzeDialogueTiming(
  dialogue: string | null | undefined,
  durationSeconds: number,
) {
  const normalized = normalizeVideoSpokenDialogue(dialogue);
  const hangulAndNumbers =
    normalized.match(/[\p{Script=Hangul}\p{N}]/gu)?.length || 0;
  const latinUnits = (normalized.match(/[A-Za-z]+/g) || []).reduce(
    (sum, word) => sum + Math.max(1, Math.ceil(word.length / 4)),
    0,
  );
  const speechUnits = hangulAndNumbers + latinUnits;
  const safeDuration = Math.max(1, Math.min(15, Math.round(durationSeconds)));
  const capacityUnits = Math.max(
    1,
    Math.floor(
      Math.max(0.5, safeDuration - DIALOGUE_LEAD_SECONDS) *
        DIALOGUE_UNITS_PER_SECOND,
    ),
  );
  const estimatedSeconds = speechUnits
    ? Number(
        (
          speechUnits / DIALOGUE_UNITS_PER_SECOND +
          DIALOGUE_LEAD_SECONDS
        ).toFixed(1),
      )
    : 0;
  const requiredDuration = Math.max(3, Math.ceil(estimatedSeconds));
  const recommendedDurationSeconds =
    VIDEO_DURATION_OPTIONS.find((candidate) => candidate >= requiredDuration) ||
    VIDEO_DURATION_OPTIONS[VIDEO_DURATION_OPTIONS.length - 1];
  const maxSupportedDuration =
    VIDEO_DURATION_OPTIONS[VIDEO_DURATION_OPTIONS.length - 1];
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
  const preparedMarker = `\n\n${AUDIO_DIRECTION_HEADER}\n`;
  const preparedMarkerIndex = prompt.indexOf(preparedMarker);
  const normalizedPrompt = (preparedMarkerIndex >= 0
    ? prompt.slice(0, preparedMarkerIndex)
    : prompt
  ).trim();
  if (audioMode === "silent") return normalizedPrompt;
  if (audioMode === "ambient") {
    return [
      normalizedPrompt,
      AUDIO_DIRECTION_HEADER,
      "Generate synchronized production audio that matches the visible location, movement, materials, and camera distance. Keep it natural and restrained. Do not invent narration, spoken dialogue, or background music.",
    ].join("\n\n");
  }
  const exactDialogue = normalizeVideoSpokenDialogue(dialogue);
  const timing = analyzeDialogueTiming(exactDialogue, durationSeconds);
  return [
    normalizedPrompt,
    AUDIO_DIRECTION_HEADER,
    `Generate native synchronized dialogue audio. The visible on-screen speaker must say exactly this Korean dialogue without translating, paraphrasing, or adding words: ${JSON.stringify(exactDialogue)}.`,
    `Deliver the complete line naturally within ${durationSeconds} seconds, including a short visual lead-in and a clean reaction beat after speaking. The estimated spoken length is about ${timing.estimatedSeconds.toFixed(1)} seconds.`,
    "Keep the speaking face clearly visible in a stable front or three-quarter medium close-up whenever the storyboard allows it. The lips, jaw, and cheeks must remain unobstructed; avoid extreme profile angles, fast head turns, hand-over-mouth gestures, cuts, and camera shake while speaking.",
    "Match every visible mouth movement to the spoken phonemes with natural timing, breathing, expression, and room acoustics. Use one stable Korean speaker voice identity for this character and keep it consistent across every storyboard scene. Keep dialogue clean and centered over subtle room tone. Do not add narration, extra speakers, background music, subtitles, captions, or readable text.",
  ].join("\n\n");
}

const parseResponse = async (
  response: Response,
): Promise<OpenRouterVideoResponse | null> => {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OpenRouterVideoResponse;
  } catch {
    if (!response.ok) throw new Error(raw.slice(0, 1000));
    return null;
  }
};

const requestVideo = async (
  url: string,
  apiKey: string,
  init?: RequestInit,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OPENROUTER_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        "X-OpenRouter-Title": "ProPig Video Studio",
        ...init?.headers,
      },
      cache: "no-store",
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
      throw new Error(
        "OpenRouter video API request timed out after 45 seconds.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

function supportsValue(
  supported: string[] | undefined,
  value: string,
): boolean {
  return !supported?.length || supported.includes(value);
}

function supportsFrame(
  model: OpenRouterVideoModel,
  frameType: "first_frame" | "last_frame",
): boolean {
  if (model.supported_frame_images === true) return true;
  const aliases =
    frameType === "first_frame"
      ? ["first_frame", "first"]
      : ["last_frame", "last"];
  return (
    Array.isArray(model.supported_frame_images) &&
    model.supported_frame_images.some((value) => aliases.includes(value))
  );
}

function supportsDuration(
  model: OpenRouterVideoModel,
  duration: number,
): boolean {
  return (
    !model.supported_durations?.length ||
    model.supported_durations.includes(duration)
  );
}

function resolvedDurationFor(
  model: OpenRouterVideoModel,
  requested: number,
): number {
  const supported = model.supported_durations?.filter(
    (duration) => Number.isInteger(duration) && duration > 0,
  );
  if (!supported?.length || supported.includes(requested)) return requested;
  return (
    [...supported].sort(
      (left, right) =>
        Math.abs(left - requested) - Math.abs(right - requested) ||
        left - right,
    )[0] || requested
  );
}

function supportsInputReferences(model: OpenRouterVideoModel): boolean {
  if (model.supported_input_references === true) return true;
  const description = model.description?.toLowerCase() || "";
  return /\b(reference[- ]to[- ]video|reference images?|input_references)\b/.test(
    description,
  );
}

function supportsDialogueLipSync(model: OpenRouterVideoModel): boolean {
  if (model.supported_lip_sync === true) return true;
  const description = model.description?.toLowerCase() || "";
  return /\b(lip[- ]?sync|multi-character dialogue|spoken dialogue|speech synchronization|native synchronized audio|synchronized audio)\b/.test(
    description,
  );
}

function dialogueModelGenerationScore(model: OpenRouterVideoModel): number {
  const seedanceVersion = /seedance[-_ ]?(\d+)(?:\.(\d+))?/i.exec(
    model.id,
  );
  if (!seedanceVersion) return 0;

  const major = Number(seedanceVersion[1]) || 0;
  const minor = Number(seedanceVersion[2]) || 0;
  return major * 160 + minor * 18;
}

function dialogueModelQualityScore(model: OpenRouterVideoModel): number {
  if (!supportsDialogueLipSync(model)) return 0;
  const resolutions = model.supported_resolutions || [];
  return (
    3_000 +
    (resolutions.includes("1080p") ? 1_000 : 0) +
    (resolutions.includes("2K") || resolutions.includes("4K") ? 500 : 0) +
    (model.supported_durations?.length || 0) * 20 +
    dialogueModelGenerationScore(model)
  );
}

function resolvedResolutionFor(
  model: OpenRouterVideoModel,
  requested: "480p" | "720p" | "1080p",
): string | null {
  const supported = model.supported_resolutions;
  if (!supported?.length || supported.includes(requested)) return requested;
  const fallbacks =
    requested === "1080p"
      ? ["720p", "480p"]
      : requested === "720p"
        ? ["480p", "1080p"]
        : ["720p", "1080p"];
  const fallback = fallbacks.find((value) => supported.includes(value));
  if (fallback) return fallback;
  return supported[0] || null;
}

function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resolvePricedVideoSize(
  model: OpenRouterVideoModel,
  resolution: string,
  aspectRatio: string,
): { width: number; height: number } | null {
  const shortEdge =
    resolution === "4K" ? 2160 : Number.parseInt(resolution, 10);
  const [aspectWidth, aspectHeight] = aspectRatio
    .split(":")
    .map((value) => Number(value));
  if (
    !Number.isFinite(shortEdge) ||
    !Number.isFinite(aspectWidth) ||
    !Number.isFinite(aspectHeight) ||
    shortEdge <= 0 ||
    aspectWidth <= 0 ||
    aspectHeight <= 0
  ) {
    return null;
  }

  const targetRatio = aspectWidth / aspectHeight;
  const targetIsLandscape = targetRatio >= 1;
  const candidates = (model.supported_sizes || []).flatMap((size) => {
    const matched = /^(\d+)x(\d+)$/i.exec(size);
    if (!matched) return [];
    const width = Number(matched[1]);
    const height = Number(matched[2]);
    return [
      {
        width,
        height,
        orientationPenalty: Number((width >= height) !== targetIsLandscape),
        ratioDistance: Math.abs(width / height - targetRatio) / targetRatio,
        edgeDistance: Math.abs(Math.min(width, height) - shortEdge) / shortEdge,
      },
    ];
  });
  candidates.sort(
    (left, right) =>
      left.orientationPenalty - right.orientationPenalty ||
      left.edgeDistance + left.ratioDistance * 3 -
        (right.edgeDistance + right.ratioDistance * 3),
  );
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
  const generationPrefix = hasReferenceImage
    ? "image_to_video"
    : "text_to_video";
  const rateCandidates = generateAudio
    ? [
        skus[`duration_seconds_with_audio_${resolutionKey}`],
        skus["duration_seconds_with_audio"],
        skus[`${generationPrefix}_duration_seconds_${resolutionKey}`],
        skus[`duration_seconds_${resolutionKey}`],
        skus["duration_seconds"],
      ]
    : [
        skus[`duration_seconds_without_audio_${resolutionKey}`],
        skus["duration_seconds_without_audio"],
        skus[`${generationPrefix}_duration_seconds_${resolutionKey}`],
        skus[`duration_seconds_${resolutionKey}`],
        skus["duration_seconds"],
      ];
  rateCandidates.push(
    skus[`per-video-second-${resolution.toLowerCase()}`],
    skus["per-video-second"],
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
    skus[`cents_per_video_output_second_${resolutionKey}`] ??
      skus.cents_per_video_output_second,
  );
  if (centsRate !== null) {
    const rateUsdPerSecond = centsRate / 100;
    const imageInputCents = parsePrice(skus.cents_per_image_input) ?? 0;
    return {
      rateUsdPerSecond,
      estimatedCostUsd: Number(
        (
          rateUsdPerSecond * duration +
          (imageInputCents / 100) * referenceImageCount
        ).toFixed(6),
      ),
    };
  }

  const videoTokenRate = parsePrice(
    generateAudio
      ? skus.video_tokens
      : (skus.video_tokens_without_audio ?? skus.video_tokens),
  );
  const pricedSize = resolvePricedVideoSize(model, resolution, aspectRatio);
  if (videoTokenRate !== null && pricedSize) {
    const videoTokens =
      (pricedSize.width * pricedSize.height * duration * 24) / 1024;
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

function proofSpeedScore(model: OpenRouterVideoModel): number {
  const id = model.id.toLowerCase();
  if (id.includes("seedance-2.0-fast")) return 4;
  if (/(?:^|[-/])fast(?:$|-)/.test(id)) return 3;
  if (id.includes("lite")) return 2;
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
    (hasReferenceImage && supportsFrame(model, "first_frame") ? 10_000 : 0) +
    (hasEndReferenceImage && supportsFrame(model, "last_frame") ? 8_000 : 0) +
    (hasVisualReferenceImages && supportsInputReferences(model) ? 6_000 : 0) +
    (requiresLipSync ? dialogueModelQualityScore(model) : 0) +
    (generateAudio && model.generate_audio === true ? 2_000 : 0) +
    (resolutions.includes("1080p") ? 1_000 : 0) +
    (resolutions.includes("2K") || resolutions.includes("4K") ? 500 : 0) +
    resolutions.length * 20 +
    aspects.length
  );
}

function toCatalogTimestamp(value: number | undefined): string | null {
  if (!Number.isFinite(value) || !value || value <= 0) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function discoverVideoModels(
  apiKey: string,
  forceRefresh = false,
): Promise<{ catalog: VideoModelCatalog; source: "live" | "cache" }> {
  if (
    !forceRefresh &&
    cachedVideoModels &&
    cachedVideoModels.apiKey === apiKey &&
    cachedVideoModels.expiresAt > Date.now()
  ) {
    return { catalog: cachedVideoModels, source: "cache" };
  }

  if (
    !pendingVideoModelDiscovery ||
    pendingVideoModelDiscovery.apiKey !== apiKey
  ) {
    const pending = {
      apiKey,
      promise: (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          OPENROUTER_REQUEST_TIMEOUT_MS,
        );
        try {
          const response = await fetch(OPENROUTER_VIDEO_MODELS_URL, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "X-OpenRouter-Title": "ProPig Video Studio",
            },
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok)
            throw new Error(
              `OpenRouter video model discovery failed (${response.status}).`,
            );
          const catalogPayload = OpenRouterVideoCatalogSchema.safeParse(
            await response.json(),
          );
          if (!catalogPayload.success) {
            throw new Error(
              "OpenRouter video model catalog had an invalid response shape.",
            );
          }
          const models = catalogPayload.data.data.flatMap((item) => {
            const parsed = OpenRouterVideoModelSchema.safeParse(item);
            return parsed.success ? [parsed.data] : [];
          });
          if (!models.length)
            throw new Error("OpenRouter returned no available video models.");
          const fetchedAt = Date.now();
          const catalog = {
            apiKey,
            models,
            fetchedAt,
            expiresAt: fetchedAt + VIDEO_MODEL_CACHE_TTL_MS,
          };
          cachedVideoModels = catalog;
          return catalog;
        } finally {
          clearTimeout(timeout);
        }
      })(),
    };
    pending.promise
      .finally(() => {
        if (pendingVideoModelDiscovery?.promise === pending.promise) {
          pendingVideoModelDiscovery = null;
        }
      })
      .catch(() => undefined);
    pendingVideoModelDiscovery = pending;
  }

  return { catalog: await pendingVideoModelDiscovery.promise, source: "live" };
}

async function getOpenRouterCredits(
  apiKey: string,
  forceRefresh = false,
): Promise<{ snapshot: OpenRouterCreditsSnapshot; source: "live" | "cache" }> {
  if (
    !forceRefresh &&
    cachedOpenRouterCredits &&
    cachedOpenRouterCredits.apiKey === apiKey &&
    cachedOpenRouterCredits.expiresAt > Date.now()
  ) {
    return { snapshot: cachedOpenRouterCredits, source: "cache" };
  }

  if (!pendingOpenRouterCredits || pendingOpenRouterCredits.apiKey !== apiKey) {
    const pending = {
      apiKey,
      promise: (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12 * 1000);
        try {
          const response = await fetch(OPENROUTER_CREDITS_URL, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "X-OpenRouter-Title": "ProPig Video Studio",
            },
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(
              `OpenRouter credit lookup failed (${response.status}).`,
            );
          }
          const parsed = OpenRouterCreditsSchema.safeParse(
            await response.json(),
          );
          if (!parsed.success) {
            throw new Error("OpenRouter credit response had an invalid shape.");
          }
          const fetchedAt = Date.now();
          const totalCreditsUsd = parsed.data.data.total_credits;
          const totalUsageUsd = parsed.data.data.total_usage;
          const snapshot = {
            apiKey,
            fetchedAt,
            expiresAt: fetchedAt + OPENROUTER_CREDIT_CACHE_TTL_MS,
            totalCreditsUsd,
            totalUsageUsd,
            remainingUsd: Math.max(0, totalCreditsUsd - totalUsageUsd),
          };
          cachedOpenRouterCredits = snapshot;
          return snapshot;
        } finally {
          clearTimeout(timeout);
        }
      })(),
    };
    pending.promise
      .finally(() => {
        if (pendingOpenRouterCredits?.promise === pending.promise) {
          pendingOpenRouterCredits = null;
        }
      })
      .catch(() => undefined);
    pendingOpenRouterCredits = pending;
  }

  return { snapshot: await pendingOpenRouterCredits.promise, source: "live" };
}

async function selectVideoModel(params: {
  apiKey: string;
  duration: number;
  resolution: "480p" | "720p" | "1080p";
  aspectRatio: string;
  qualityMode: "proof" | "final";
  hasReferenceImage: boolean;
  hasEndReferenceImage: boolean;
  hasVisualReferenceImages: boolean;
  audioMode: VideoAudioMode;
  forceModelRefresh?: boolean;
}) {
  const { catalog, source } = await discoverVideoModels(
    params.apiKey,
    params.forceModelRefresh,
  );
  const models = catalog.models;
  const generateAudio = params.audioMode !== "silent";
  const requiresLipSync = params.audioMode === "dialogue";
  const compatible = models.flatMap((model) => {
    if (!supportsValue(model.supported_aspect_ratios, params.aspectRatio))
      return [];
    const resolvedResolution = resolvedResolutionFor(model, params.resolution);
    if (!resolvedResolution) return [];
    const resolvedDuration = resolvedDurationFor(model, params.duration);
    const resolvedSize = resolvePricedVideoSize(
      model,
      resolvedResolution,
      params.aspectRatio,
    );
    const pricing = readPricing(
      model,
      resolvedResolution,
      resolvedDuration,
      generateAudio,
      params.hasReferenceImage,
      Number(params.hasReferenceImage) +
        Number(params.hasEndReferenceImage) +
        (params.hasVisualReferenceImages ? 1 : 0),
      params.aspectRatio,
    );
    return [
      {
        model,
        resolvedResolution,
        resolvedSize: resolvedSize
          ? `${resolvedSize.width}x${resolvedSize.height}`
          : null,
        resolvedDuration,
        ...pricing,
      },
    ];
  });
  if (!compatible.length) {
    throw new Error(
      `OpenRouter has no video model compatible with ${params.aspectRatio} ${params.resolution}.`,
    );
  }

  const referenceCapable = params.hasReferenceImage
    ? compatible.filter(({ model }) => supportsFrame(model, "first_frame"))
    : [];
  if (params.hasReferenceImage && !referenceCapable.length) {
    throw new Error(
      "현재 조건에서 시작 프레임을 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.",
    );
  }
  const referenceCandidates = params.hasReferenceImage
    ? referenceCapable
    : compatible;
  const endFrameCapable = params.hasEndReferenceImage
    ? referenceCandidates.filter(({ model }) =>
        supportsFrame(model, "last_frame"),
      )
    : [];
  if (params.hasEndReferenceImage && !endFrameCapable.length) {
    throw new Error(
      "현재 조건에서 마지막 프레임을 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.",
    );
  }
  const endFrameCandidates = params.hasEndReferenceImage
    ? endFrameCapable
    : referenceCandidates;
  const visualReferenceCapable = params.hasVisualReferenceImages
    ? endFrameCandidates.filter(({ model }) => supportsInputReferences(model))
    : [];
  if (params.hasVisualReferenceImages && !visualReferenceCapable.length) {
    throw new Error(
      "현재 조건에서 일관성 참조 이미지를 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.",
    );
  }
  const visualReferenceCandidates = params.hasVisualReferenceImages
    ? visualReferenceCapable
    : endFrameCandidates;
  const audioCapable = generateAudio
    ? visualReferenceCandidates.filter(
        ({ model }) => model.generate_audio === true,
      )
    : [];
  if (generateAudio && !audioCapable.length) {
    throw new Error(
      "현재 조건에서 오디오 생성을 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.",
    );
  }
  const lipSyncCapable = requiresLipSync
    ? audioCapable.filter(({ model }) => supportsDialogueLipSync(model))
    : [];
  if (requiresLipSync && !lipSyncCapable.length) {
    throw new Error(
      "현재 조건에서 한국어 대사·립싱크를 지원하는 OpenRouter 영상 모델을 찾지 못했습니다.",
    );
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
      Number(right.estimatedCostUsd !== null) -
      Number(left.estimatedCostUsd !== null);
    if (knownPriceDelta) return knownPriceDelta;

    if (params.qualityMode === "final") {
      const capabilityDelta =
        capabilityScore(
          right.model,
          params.hasReferenceImage,
          params.hasEndReferenceImage,
          params.hasVisualReferenceImages,
          generateAudio,
          requiresLipSync,
        ) -
        capabilityScore(
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
        Number(right.resolvedResolution === params.resolution) -
        Number(left.resolvedResolution === params.resolution);
      if (exactResolutionDelta) return exactResolutionDelta;

      const speedDelta =
        proofSpeedScore(right.model) - proofSpeedScore(left.model);
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
    supportsFirstFrame: supportsFrame(selected.model, "first_frame"),
    supportsEndFrame: supportsFrame(selected.model, "last_frame"),
    supportsInputReferences: supportsInputReferences(selected.model),
    supportsAudio: selected.model.generate_audio === true,
    supportsDialogueLipSync: supportsDialogueLipSync(selected.model),
    catalog,
    catalogSource: source,
  };
}

export async function preflightOpenRouterVideo(params: {
  apiKey: string;
  duration: number;
  resolution: "480p" | "720p" | "1080p";
  aspectRatio: string;
  qualityMode?: "proof" | "final";
  hasReferenceImage?: boolean;
  hasEndReferenceImage?: boolean;
  hasVisualReferenceImages?: boolean;
  audioMode?: VideoAudioMode;
  forceModelRefresh?: boolean;
  knownInputImagePrivacyBlock?: boolean;
}): Promise<OpenRouterVideoPreflight> {
  const requestedInputs = {
    firstFrame: Boolean(params.hasReferenceImage),
    lastFrame: Boolean(params.hasEndReferenceImage),
    visualReferences: Boolean(params.hasVisualReferenceImages),
    audioMode: (params.audioMode || "silent") as VideoAudioMode,
  };
  const visualReferencesCanBeApplied =
    requestedInputs.visualReferences &&
    !requestedInputs.firstFrame &&
    !requestedInputs.lastFrame;
  const [selected, creditResult] = await Promise.all([
    selectVideoModel({
      ...params,
      qualityMode: params.qualityMode || "proof",
      hasReferenceImage: requestedInputs.firstFrame,
      hasEndReferenceImage: requestedInputs.lastFrame,
      hasVisualReferenceImages: visualReferencesCanBeApplied,
      audioMode: requestedInputs.audioMode,
      forceModelRefresh: params.forceModelRefresh,
    }),
    getOpenRouterCredits(params.apiKey, params.forceModelRefresh).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    ),
  ]);
  const warnings: string[] = [];
  const selectionReasons = [
    `OpenRouter ${selected.catalogSource === "live" ? "live" : "recent"} catalog checked ${selected.catalogModelCount} models for this request.`,
    `${selected.compatibleModelCount} technically compatible models were considered; ${params.qualityMode === "final" ? "quality and supported features" : "requested resolution and proof speed"} were prioritized.`,
  ];
  if (requestedInputs.firstFrame)
    selectionReasons.push(
      "Only models supporting a first frame were considered.",
    );
  if (requestedInputs.lastFrame)
    selectionReasons.push(
      "Only models supporting a last frame were considered.",
    );
  if (visualReferencesCanBeApplied)
    selectionReasons.push(
      "Only models supporting visual references were considered.",
    );
  if (requestedInputs.audioMode === "dialogue")
    selectionReasons.push(
      "Only models with verified dialogue and lip-sync signals were considered.",
    );
  if (requestedInputs.visualReferences && !visualReferencesCanBeApplied) {
    warnings.push(
      "OpenRouter prioritizes first/last frames when frame images and general references are both provided. This scene keeps frame continuity and does not directly apply the general references.",
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
    warnings.push("선택된 모델의 예상 가격을 확인하지 못했습니다.");
  }

  const credit = creditResult.ok
    ? {
        state: "available" as const,
        source: creditResult.value.source,
        remainingUsd: creditResult.value.snapshot.remainingUsd,
        totalCreditsUsd: creditResult.value.snapshot.totalCreditsUsd,
        totalUsageUsd: creditResult.value.snapshot.totalUsageUsd,
        requiredUsd: selected.estimatedCostUsd,
        isSufficient:
          selected.estimatedCostUsd === null
            ? null
            : creditResult.value.snapshot.remainingUsd >=
              selected.estimatedCostUsd,
        message: null,
        fetchedAt: new Date(
          creditResult.value.snapshot.fetchedAt,
        ).toISOString(),
        refreshAfter: new Date(
          creditResult.value.snapshot.expiresAt,
        ).toISOString(),
      }
    : {
        state: "unavailable" as const,
        source: null,
        remainingUsd: null,
        totalCreditsUsd: null,
        totalUsageUsd: null,
        requiredUsd: selected.estimatedCostUsd,
        isSufficient: null,
        message:
          "OpenRouter credit balance could not be checked. The provider will verify it at submission time.",
        fetchedAt: null,
        refreshAfter: null,
      };
  if (credit.isSufficient === false) {
    warnings.push(
      "OpenRouter balance is below this scene's estimated cost. Add credits before retrying.",
    );
  }

  const hasVisualInput =
    requestedInputs.firstFrame ||
    requestedInputs.lastFrame ||
    requestedInputs.visualReferences;
  const policy = !hasVisualInput
    ? {
        visualInputState: "not_requested" as const,
        automaticRetryAllowed: true,
        message:
          "Text-only generation does not submit reference photos for provider review.",
        recommendedActions: [],
      }
    : params.knownInputImagePrivacyBlock
      ? {
          visualInputState: "previously_rejected" as const,
          automaticRetryAllowed: false,
          message:
            "A reference photo in this scene was previously limited by provider policy. Technical input support does not guarantee that a person photo is accepted.",
          recommendedActions: [
            "Create a text-only take",
            "Replace the reference with an approved alternative",
          ],
        }
      : {
          visualInputState: "provider_review_required" as const,
          automaticRetryAllowed: true,
          message:
            "The selected model technically supports frames or references. The provider makes the final policy decision for real-person photos at submission time.",
          recommendedActions: [
            "Confirm rights and portrait consent for real-person photos",
            "If blocked, use a text-only take or replace the reference instead of auto-switching models",
          ],
        };

  return {
    selection: "automatic",
    canSubmit: credit.isSufficient !== false,
    modelId: selected.model.id,
    modelName: selected.model.name || selected.model.id,
    requestedResolution: params.resolution,
    resolvedResolution: selected.resolvedResolution,
    resolvedSize: selected.resolvedSize,
    requestedDuration: params.duration,
    resolvedDuration: selected.resolvedDuration,
    aspectRatio: params.aspectRatio,
    rateUsdPerSecond: selected.rateUsdPerSecond,
    estimatedCostUsd: selected.estimatedCostUsd,
    catalogModelCount: selected.catalogModelCount,
    compatibleModelCount: selected.compatibleModelCount,
    catalog: {
      source: selected.catalogSource,
      fetchedAt: new Date(selected.catalog.fetchedAt).toISOString(),
      refreshAfter: new Date(selected.catalog.expiresAt).toISOString(),
      selectedModelCreatedAt: toCatalogTimestamp(selected.model.created),
    },
    credit,
    policy,
    selectionReasons,
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
  resolution: "480p" | "720p" | "1080p";
  aspectRatio: string;
  qualityMode?: "proof" | "final";
  hasReferenceImage?: boolean;
  hasEndReferenceImage?: boolean;
  hasVisualReferenceImages?: boolean;
  audioMode?: VideoAudioMode;
  forceModelRefresh?: boolean;
  knownInputImagePrivacyBlock?: boolean;
}): Promise<OpenRouterVideoEstimate> {
  return preflightOpenRouterVideo(params);
}

function resolveOpenRouterPollingUrl(
  checkpoint: OpenRouterVideoCheckpoint,
): string {
  const fallback = `${OPENROUTER_VIDEO_BASE_URL}/${encodeURIComponent(checkpoint.jobId)}`;
  if (!checkpoint.pollingUrl?.trim()) return fallback;

  try {
    const pollingUrl = new URL(checkpoint.pollingUrl, "https://openrouter.ai");
    if (
      pollingUrl.protocol === "https:" &&
      pollingUrl.hostname === "openrouter.ai" &&
      pollingUrl.pathname.startsWith("/api/v1/videos/")
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
}): Promise<{
  response: OpenRouterVideoResponse;
  checkpoint: OpenRouterVideoCheckpoint;
}> => {
  const deadline = Date.now() + Math.max(1_000, params.timeoutMs);
  let checkpoint = params.checkpoint;

  while (true) {
    const result = await requestVideo(
      resolveOpenRouterPollingUrl(checkpoint),
      params.apiKey,
      { method: "GET" },
    );
    const status = result?.status || "pending";
    checkpoint = {
      ...checkpoint,
      generationId: result?.generation_id || checkpoint.generationId,
      modelId: result?.model || checkpoint.modelId,
      status,
      lastPolledAt: new Date().toISOString(),
    };
    await params.onCheckpoint?.(checkpoint);

    if (status === "completed") {
      return { response: result || {}, checkpoint };
    }
    if (status === "failed" || status === "cancelled" || status === "expired") {
      throw toOpenRouterVideoRequestError(
        result,
        `OpenRouter video job ${status}`,
      );
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
    lower.includes("inputimagesensitivecontentdetected.privacyinformation") ||
    lower.includes("may contain real person") ||
    (lower.includes("input image") && lower.includes("privacy"))
  ) {
    return "참조 사진에 실제 인물이 포함되었거나 그렇게 감지되어 모델이 요청을 받지 않았습니다. 이 장면에서 사진 없이 다시 만들거나 인물 사진을 교체해 주세요.";
  }
  if (lower.includes("api key") || lower.includes("missing_api_key"))
    return "OPENROUTER_API_KEY가 설정되지 않았습니다.";
  if (
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("unauthorized")
  )
    return "OpenRouter API 인증 또는 권한을 확인하세요.";
  if (lower.includes("rate limit") || lower.includes("429"))
    return "OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.";
  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("expired")
  )
    return "OpenRouter 영상 생성 시간이 초과되었습니다.";
  return rawMessage;
}

async function resolveExecutionPlanSelection(params: {
  apiKey: string;
  value: unknown;
  qualityMode: "proof" | "final";
  requestedResolution: "480p" | "720p" | "1080p";
  requestedDuration: number;
  aspectRatio: string;
  hasReferenceImage: boolean;
  hasEndReferenceImage: boolean;
  hasVisualReferenceImages: boolean;
  canApplyVisualReferences: boolean;
  audioMode: VideoAudioMode;
}) {
  const plan = readOpenRouterVideoExecutionPlan(
    params.value,
    params.qualityMode,
  );
  if (!plan) {
    throw new OpenRouterVideoRequestError({
      status: 409,
      code: "invalid_execution_plan",
      message:
        "The queued OpenRouter execution plan is missing or invalid. Run preflight again before creating a new provider job.",
    });
  }

  const requestMatches =
    plan.qualityMode === params.qualityMode &&
    plan.requestedResolution === params.requestedResolution &&
    plan.requestedDuration === params.requestedDuration &&
    plan.aspectRatio === params.aspectRatio &&
    plan.requestedInputs.audioMode === params.audioMode;
  if (!requestMatches) {
    throw new OpenRouterVideoRequestError({
      status: 409,
      code: "execution_plan_request_mismatch",
      message:
        "The queued OpenRouter execution plan no longer matches this scene request. Run preflight again instead of switching models during execution.",
    });
  }

  const visualReferencesWerePlannedForApplication =
    plan.requestedInputs.visualReferences &&
    !plan.requestedInputs.firstFrame &&
    !plan.requestedInputs.lastFrame;
  const supportsRequestedInputs =
    (!params.hasReferenceImage || plan.capabilities.firstFrame) &&
    (!params.hasEndReferenceImage || plan.capabilities.lastFrame) &&
    (!params.canApplyVisualReferences ||
      !visualReferencesWerePlannedForApplication ||
      plan.capabilities.visualReferences) &&
    (params.audioMode === "silent" || plan.capabilities.audio) &&
    (params.audioMode !== "dialogue" ||
      plan.capabilities.dialogueLipSync);
  if (!supportsRequestedInputs) {
    throw new OpenRouterVideoRequestError({
      status: 409,
      code: "execution_plan_capability_mismatch",
      message:
        "The queued OpenRouter model cannot provide every requested scene input. Run preflight again before creating a provider job.",
    });
  }

  if (
    plan.authorizedMaxCostUsd === null ||
    plan.estimatedCostUsd === null ||
    plan.estimatedCostUsd > plan.authorizedMaxCostUsd + 0.000001
  ) {
    throw new OpenRouterVideoRequestError({
      status: 409,
      code: "execution_plan_cost_mismatch",
      message:
        "The queued OpenRouter cost is not covered by a valid preflight authorization. Run preflight again before creating a provider job.",
    });
  }

  const { catalog } = await discoverVideoModels(params.apiKey, true);
  const model = catalog.models.find((candidate) => candidate.id === plan.modelId);
  if (!model) {
    throw new OpenRouterVideoRequestError({
      status: 409,
      code: "execution_plan_model_unavailable",
      message:
        "The OpenRouter model saved by preflight is no longer in the live video catalog. Run preflight again; execution will not switch models automatically.",
    });
  }

  const liveCapabilities = {
    firstFrame: supportsFrame(model, "first_frame"),
    lastFrame: supportsFrame(model, "last_frame"),
    visualReferences: supportsInputReferences(model),
    audio: model.generate_audio === true,
    dialogueLipSync: supportsDialogueLipSync(model),
  };
  const exactSizeIsStillSupported = plan.resolvedSize
    ? Boolean(model.supported_sizes?.includes(plan.resolvedSize))
    : true;
  const liveCapabilitiesMatch =
    supportsValue(model.supported_aspect_ratios, plan.aspectRatio) &&
    supportsValue(model.supported_resolutions, plan.resolvedResolution) &&
    supportsDuration(model, plan.resolvedDuration) &&
    exactSizeIsStillSupported &&
    (!plan.requestedInputs.firstFrame || liveCapabilities.firstFrame) &&
    (!plan.requestedInputs.lastFrame || liveCapabilities.lastFrame) &&
    (!visualReferencesWerePlannedForApplication ||
      liveCapabilities.visualReferences) &&
    (plan.requestedInputs.audioMode === "silent" ||
      liveCapabilities.audio) &&
    (plan.requestedInputs.audioMode !== "dialogue" ||
      liveCapabilities.dialogueLipSync) &&
    (!params.hasReferenceImage || liveCapabilities.firstFrame) &&
    (!params.hasEndReferenceImage || liveCapabilities.lastFrame);
  if (!liveCapabilitiesMatch) {
    throw new OpenRouterVideoRequestError({
      status: 409,
      code: "execution_plan_stale",
      message:
        "The saved OpenRouter model no longer supports the preflight resolution, duration, size, or scene inputs. Run preflight again; execution will not switch models automatically.",
    });
  }

  const currentPricing = readPricing(
    model,
    plan.resolvedResolution,
    plan.resolvedDuration,
    plan.requestedInputs.audioMode !== "silent",
    plan.requestedInputs.firstFrame,
    Number(plan.requestedInputs.firstFrame) +
      Number(plan.requestedInputs.lastFrame) +
      Number(visualReferencesWerePlannedForApplication),
    plan.aspectRatio,
  );
  if (
    currentPricing.estimatedCostUsd === null ||
    currentPricing.estimatedCostUsd > plan.authorizedMaxCostUsd + 0.000001
  ) {
    throw new OpenRouterVideoRequestError({
      status: 409,
      code: "execution_plan_price_changed",
      message:
        "The live price for the saved OpenRouter model is unavailable or exceeds the amount authorized at preflight. Run preflight again before creating a provider job.",
    });
  }

  return {
    plan,
    model,
    resolvedResolution: plan.resolvedResolution,
    resolvedSize: plan.resolvedSize,
    resolvedDuration: plan.resolvedDuration,
    rateUsdPerSecond: currentPricing.rateUsdPerSecond,
    estimatedCostUsd: currentPricing.estimatedCostUsd,
    supportsFirstFrame:
      plan.capabilities.firstFrame && liveCapabilities.firstFrame,
    supportsEndFrame: plan.capabilities.lastFrame && liveCapabilities.lastFrame,
    supportsInputReferences:
      plan.capabilities.visualReferences && liveCapabilities.visualReferences,
    supportsAudio: plan.capabilities.audio && liveCapabilities.audio,
    supportsDialogueLipSync:
      plan.capabilities.dialogueLipSync && liveCapabilities.dialogueLipSync,
  };
}

export async function generateOpenRouterVideo(
  payload: GenerateVideoRequest,
  options: OpenRouterVideoGenerationOptions = {},
): Promise<{
  videoUrl: string;
  metadata: {
    mode: GenerateVideoRequest["mode"];
    modelUsed: string;
    requestId: string;
    costUsd?: number;
    keySource: "env";
    selectionSource: "catalog";
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
  const checkpointKey = options.checkpointKey || "direct";
  const resumeCheckpoint = readOpenRouterVideoCheckpoint(
    options.resumeCheckpoint,
  );
  const canResume = Boolean(
    resumeCheckpoint &&
    resumeCheckpoint.checkpointKey === checkpointKey &&
    isResumableOpenRouterVideoCheckpoint(resumeCheckpoint),
  );
  if (options.requireResumeCheckpoint && !canResume) {
    throw new OpenRouterVideoRequestError({
      status: 409,
      code: "provider_resume_checkpoint_invalid",
      message:
        "The existing OpenRouter result could not be resumed safely. No new provider request was submitted.",
    });
  }

  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing.");
  const audioMode = resolveVideoAudioMode(payload);
  const duration = payload.duration ?? 6;
  if (!canResume && audioMode === "dialogue" && !payload.dialogue?.trim()) {
    throw new Error("대사·립싱크 모드에는 말할 대사가 필요합니다.");
  }
  if (!canResume && audioMode === "dialogue") {
    const timing = analyzeDialogueTiming(payload.dialogue, duration);
    if (!timing.fitsSupportedDuration) {
      throw new Error(
        "대사가 15초 최대 길이를 넘습니다. 자연스러운 립싱크를 위해 문장을 여러 장면으로 나눠 주세요.",
      );
    }
    if (timing.isOver) {
      throw new Error(
        `대사가 현재 장면보다 깁니다. 자연스러운 립싱크를 위해 길이를 ${timing.recommendedDurationSeconds}초 이상으로 맞춰 주세요.`,
      );
    }
  }

  const requestedResolution = payload.resolution ?? "720p";
  const aspectRatio = payload.aspectRatio || "16:9";
  const referenceImage = normalizeImage(payload.image);
  const requestedEndFrameImage = normalizeImage(payload.endImage);
  const visualReferenceImages = (payload.referenceImages || [])
    .map(normalizeImage)
    .filter((image): image is string => Boolean(image))
    .slice(0, 2);
  const canApplyVisualReferences =
    visualReferenceImages.length > 0 &&
    !referenceImage &&
    !requestedEndFrameImage;
  const qualityMode = payload.qualityMode || "proof";

  let checkpoint: OpenRouterVideoCheckpoint;
  if (canResume && resumeCheckpoint) {
    checkpoint = resumeCheckpoint;
  } else {
    const hasExecutionPlan = options.executionPlan !== undefined;
    if (!hasExecutionPlan && options.checkpointKey) {
      throw new OpenRouterVideoRequestError({
        status: 409,
        code: "missing_execution_plan",
        message:
          "A queued OpenRouter job cannot create a new provider request without its saved preflight execution plan.",
      });
    }
    const [selected, executionCredit] = await Promise.all([
      hasExecutionPlan
        ? Promise.resolve(
            resolveExecutionPlanSelection({
              apiKey,
              value: options.executionPlan,
              qualityMode,
              requestedResolution,
              requestedDuration: duration,
              aspectRatio,
              hasReferenceImage: Boolean(referenceImage),
              hasEndReferenceImage: Boolean(requestedEndFrameImage),
              hasVisualReferenceImages: visualReferenceImages.length > 0,
              canApplyVisualReferences,
              audioMode,
            }),
          )
        : selectVideoModel({
            apiKey,
            duration,
            resolution: requestedResolution,
            aspectRatio,
            qualityMode,
            hasReferenceImage: Boolean(referenceImage),
            hasEndReferenceImage: Boolean(requestedEndFrameImage),
            hasVisualReferenceImages: canApplyVisualReferences,
            audioMode,
            forceModelRefresh: true,
          }),
      getOpenRouterCredits(apiKey, true).catch(() => null),
    ]);
    if (
      executionCredit &&
      selected.estimatedCostUsd !== null &&
      executionCredit.snapshot.remainingUsd < selected.estimatedCostUsd
    ) {
      throw new OpenRouterVideoRequestError({
        status: 402,
        code: "insufficient_credits",
        message:
          "OpenRouter credit balance is below the current execution cost. Add credits at https://openrouter.ai/settings/credits and retry.",
      });
    }
    if (audioMode === "dialogue") {
      const resolvedTiming = analyzeDialogueTiming(
        payload.dialogue,
        selected.resolvedDuration,
      );
      if (!resolvedTiming.fitsSupportedDuration || resolvedTiming.isOver) {
        throw new OpenRouterVideoRequestError({
          status: 422,
          code: "dialogue_exceeds_resolved_duration",
          message: `The dialogue does not fit the selected model's resolved ${selected.resolvedDuration}-second duration. Shorten it or split it into another scene before retrying.`,
        });
      }
    }
    const firstFrameImage = selected.supportsFirstFrame
      ? referenceImage
      : undefined;
    const endFrameImage = selected.supportsEndFrame
      ? requestedEndFrameImage
      : undefined;
    const appliedVisualReferences =
      canApplyVisualReferences && selected.supportsInputReferences
        ? visualReferenceImages
        : [];
    const audioApplied = audioMode !== "silent" && selected.supportsAudio;
    const lipSyncRequested = audioMode === "dialogue";
    const body: Record<string, unknown> = {
      model: selected.model.id,
      prompt: appendVideoAudioDirection(
        payload.prompt,
        audioMode,
        payload.dialogue,
        selected.resolvedDuration,
      ),
      duration: selected.resolvedDuration,
      ...(selected.resolvedSize
        ? { size: selected.resolvedSize }
        : {
            resolution: selected.resolvedResolution,
            aspect_ratio: aspectRatio,
          }),
    };
    body.generate_audio = audioApplied;
    const frameImages: Array<Record<string, unknown>> = [];
    if (firstFrameImage) {
      frameImages.push({
        type: "image_url",
        image_url: { url: firstFrameImage },
        frame_type: "first_frame",
      });
    }
    if (endFrameImage) {
      frameImages.push({
        type: "image_url",
        image_url: { url: endFrameImage },
        frame_type: "last_frame",
      });
    }
    if (frameImages.length) body.frame_images = frameImages;
    if (appliedVisualReferences.length) {
      body.input_references = appliedVisualReferences.map((image) => ({
        type: "image_url",
        image_url: { url: image },
      }));
    }

    let submitted: OpenRouterVideoResponse | null;
    try {
      submitted = await requestVideo(OPENROUTER_VIDEO_BASE_URL, apiKey, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (
        error instanceof OpenRouterVideoRequestError &&
        error.status !== null &&
        error.status < 500
      ) {
        throw error;
      }
      throw new OpenRouterVideoRequestError({
        status: 409,
        code: "ambiguous_provider_submission",
        message:
          "OpenRouter may have received the video request, but no provider job id was returned. Automatic retry was stopped to prevent duplicate charges.",
      });
    }
    if (!submitted?.id) {
      throw toOpenRouterVideoRequestError(
        submitted,
        "OpenRouter did not return a video job id.",
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
      status: submitted.status || "pending",
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
      throw new Error(
        "OpenRouter video generation is still processing. Use a queued studio job so it can resume safely.",
      );
    }
    throw error;
  }

  const completed = polled.response;
  checkpoint = polled.checkpoint;
  await recordOpenRouterUsage({
    operation: "video",
    model: completed.model || checkpoint.modelId,
    costUsd: completed.usage?.cost,
    requestId: checkpoint.jobId,
  });

  return {
    videoUrl:
      completed.unsigned_urls?.[0] ||
      `${OPENROUTER_VIDEO_BASE_URL}/${checkpoint.jobId}/content?index=0`,
    metadata: {
      mode: payload.mode,
      modelUsed: completed.model || checkpoint.modelId,
      requestId: checkpoint.jobId,
      costUsd: completed.usage?.cost,
      keySource: "env",
      selectionSource: "catalog",
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

export async function downloadOpenRouterVideo(
  sourceUrl: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing.");
  const safeSourceUrl = normalizeExternalHttpsUrl(sourceUrl);
  const headers = buildOpenRouterVideoDownloadHeaders(safeSourceUrl, apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OPENROUTER_VIDEO_DOWNLOAD_TIMEOUT_MS,
  );
  try {
    const response = await fetchExternalHttpsUrl(
      safeSourceUrl,
      {
        headers,
        cache: "no-store",
        signal: controller.signal,
      },
      OPENROUTER_VIDEO_DOWNLOAD_TIMEOUT_MS,
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new OpenRouterVideoContentDownloadError(response.status);
    }
    return {
      buffer: await readCappedBinaryResponse(
        response,
        OPENROUTER_VIDEO_MAX_BYTES,
      ),
      contentType: response.headers.get("content-type") || "video/mp4",
    };
  } finally {
    clearTimeout(timeout);
  }
}
