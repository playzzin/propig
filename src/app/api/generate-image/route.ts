import { createHash, randomUUID } from 'crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { IMAGE_STYLE_PRESET_INSTRUCTIONS } from '@/constants/imageStylePresets';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { recordOpenRouterUsage } from '@/lib/server/openrouter-usage';
import { enforceUserRateLimit } from '@/lib/server/rate-limit';
import { requireAdminOrPermissionAuth } from '@/lib/server/admin-auth';
import { fetchExternalHttpUrl, normalizeExternalHttpUrl } from '@/lib/server/http-safety';
import firebaseAdmin, { db as adminDb } from '@/lib/firebase-admin';
import {
    IMAGE_REFERENCE_ROLES,
    MAX_IMAGE_REFERENCE_REQUESTS,
    type ImageReferenceRole,
} from '@/types/imageReference';

export const runtime = 'nodejs';

const STUDIO_IMAGE_MODELS = [
    'openai/gpt-image-2',
    'google/gemini-3.1-flash-lite-image',
    'google/gemini-3.1-flash-image',
    'x-ai/grok-imagine-image-2.0',
] as const;

const GenerateImageRequestSchema = z.object({
    operationId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(4000),
    negativePrompt: z.string().max(1500).optional(),
    aspectRatio: z.string().max(20).optional(),
    width: z.number().int().min(64).max(4096).optional(),
    height: z.number().int().min(64).max(4096).optional(),
    stylePreset: z.string().max(100).optional(),
    image: z.string().optional(),
    referenceImages: z.array(z.object({
        role: z.enum(IMAGE_REFERENCE_ROLES),
        image: z.string().min(1),
    })).max(MAX_IMAGE_REFERENCE_REQUESTS).optional(),
    numberOfImages: z.number().int().min(1).max(4).default(1),
    resourceMode: z.enum(['efficient', 'balanced', 'premium']).optional().default('premium'),
    provider: z.literal('openrouter').optional().default('openrouter'),
    model: z.enum(STUDIO_IMAGE_MODELS).optional(),
    quality: z.enum(['low', 'high']).optional(),
});

type ParsedReferenceImage = { base64: string; mimeType: string; byteLength: number };
type ParsedReferenceImageWithRole = ParsedReferenceImage & { role: ImageReferenceRole };
type GeneratedImageAsset = { base64?: string; mimeType?: string; url?: string };
type OpenRouterImageResponse = {
    data?: Array<{ b64_json?: string; media_type?: string; url?: string }>;
    usage?: { cost?: number };
    error?: {
        code?: string;
        message?: string;
        param?: string;
        type?: string;
    };
};
type OpenRouterImageRequestError = Error & {
    status: number;
    code?: string;
    param?: string;
    providerType?: string;
};
type OpenRouterImageModel = {
    id: string;
    architecture?: { input_modalities?: string[]; output_modalities?: string[] };
    supported_parameters?: Record<string, unknown>;
};
type SelectedOpenRouterImageModel = {
    id: string;
    supportedParameters: Set<string> | null;
    selectionSource: 'requested' | 'configured' | 'efficient' | 'discovered' | 'fallback';
};
type ImageInfraHint = {
    reasonCode: 'api_key_expired' | 'billing_disabled' | 'permission_denied' | 'missing_api_key' | 'rate_limited' | 'request_timeout' | 'input_image_privacy' | 'invalid_request' | 'unknown';
    message: string;
};

const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_REFERENCE_IMAGE_BYTES = 16 * 1024 * 1024;
const REFERENCE_IMAGE_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const AUTO_IMAGE_MODEL_FALLBACK = 'openai/gpt-image-1';
const EFFICIENT_STORYBOARD_IMAGE_MODEL = 'openai/gpt-image-1-mini';
const PREFERRED_AUTO_IMAGE_MODELS = [
    'openai/gpt-5-image',
    'openai/gpt-image-2',
    'openai/gpt-image-1',
    'google/gemini-3.1-flash-image',
    'google/gemini-2.5-flash-image',
    'bytedance-seed/seedream-4.5',
];
const IMAGE_MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
const OPENROUTER_DISCOVERY_TIMEOUT_MS = 15_000;
const OPENROUTER_GENERATION_TIMEOUT_MS = 120_000;
const IMAGE_RESULT_CACHE_TTL_MS = 2 * 60 * 1000;
const IMAGE_RESULT_CACHE_MAX_ENTRIES = 5;
const IMAGE_RESULT_CACHE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_DURABLE_RESULT_MAX_BYTES = 700 * 1024;
const IMAGE_DURABLE_CHUNK_BYTES = 600 * 1024;
const IMAGE_DURABLE_CHUNKED_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_DURABLE_STORAGE_MAX_BYTES = 64 * 1024 * 1024;
const IMAGE_DAILY_BUDGET_USD = Math.min(1000, Math.max(0.5, Number(process.env.OPENROUTER_IMAGE_DAILY_BUDGET_USD) || 10));
const IMAGE_RESERVED_USD_PER_OUTPUT = Math.min(10, Math.max(0.01, Number(process.env.OPENROUTER_IMAGE_RESERVED_USD_PER_OUTPUT) || 1));
let cachedImageModels: { expiresAt: number; models: OpenRouterImageModel[] } | null = null;
type ImageGenerationResponse = Record<string, unknown>;
const completedImageResults = new Map<string, { expiresAt: number; response: ImageGenerationResponse }>();

class ImageOperationConflictError extends Error {}
class ImageBudgetExceededError extends Error {}

function imageOperationKey(uid: string, operationId: string): string {
    return createHash('sha256').update(`${uid}:image-generation:${operationId}`).digest('hex');
}

function imageBudgetDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function imageBudgetKey(uid: string, date: string): string {
    return createHash('sha256').update(`${uid}:image-generation-budget:${date}`).digest('hex');
}

function imageRequestFingerprint(payload: z.infer<typeof GenerateImageRequestSchema>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function reserveImageOperation(uid: string, payload: z.infer<typeof GenerateImageRequestSchema>) {
    const key = imageOperationKey(uid, payload.operationId);
    const cached = completedImageResults.get(key);
    if (cached && cached.expiresAt <= Date.now()) completedImageResults.delete(key);

    const reference = adminDb.collection('aiOperationReservations').doc(key);
    const fingerprint = imageRequestFingerprint(payload);
    const budgetDate = imageBudgetDate();
    const budgetReference = adminDb.collection('aiDailyBudgets').doc(imageBudgetKey(uid, budgetDate));
    const reservedUsd = (payload.numberOfImages || 1) * IMAGE_RESERVED_USD_PER_OUTPUT;
    const durableCached = await adminDb.runTransaction(async (transaction): Promise<ImageGenerationResponse | { chunkCount: number } | { storagePath: string; sha256: string } | null> => {
        const snapshot = await transaction.get(reference);
        const data = snapshot.data() || {};
        if (data.requestFingerprint && data.requestFingerprint !== fingerprint) {
            throw new ImageOperationConflictError('같은 operationId를 다른 이미지 요청에 사용할 수 없습니다.');
        }
        if (data.status === 'completed') {
            // Memory results are usable only after durable identity and completion checks.
            if (cached && cached.expiresAt > Date.now()) return cached.response;
            if (data.result && typeof data.result === 'object') return data.result as ImageGenerationResponse;
            if (Number.isSafeInteger(data.resultChunkCount) && data.resultChunkCount > 0) return { chunkCount: data.resultChunkCount };
            if (typeof data.resultStoragePath === 'string' && typeof data.resultSha256 === 'string') return { storagePath: data.resultStoragePath, sha256: data.resultSha256 };
            throw new ImageOperationConflictError('같은 이미지 생성 요청이 이미 완료되었지만 보관된 결과가 없어 새 operationId가 필요합니다.');
        }
        // Elapsed time cannot prove that an earlier paid provider request did not run.
        // Keep its reservation blocked until explicit reconciliation, including after crashes.
        if (data.status === 'pending' || data.status === 'uncertain') {
            throw new ImageOperationConflictError('같은 이미지 생성 요청이 처리 중이거나 결과 확인이 필요합니다.');
        }
        const budgetSnapshot = await transaction.get(budgetReference);
        const budget = budgetSnapshot.data() || {};
        const previousReservation = !data.budgetSettled && data.budgetDate === budgetDate
            ? Math.max(0, Number(data.reservedUsd) || 0)
            : 0;
        const spentUsd = Math.max(0, Number(budget.spentUsd) || 0);
        const pendingUsd = Math.max(0, Number(budget.reservedUsd) || 0) - previousReservation;
        if (spentUsd + pendingUsd + reservedUsd > IMAGE_DAILY_BUDGET_USD) {
            throw new ImageBudgetExceededError('오늘의 OpenRouter 이미지 생성 예산을 모두 사용했습니다.');
        }
        const now = new Date();
        transaction.set(budgetReference, {
            uid,
            date: budgetDate,
            limitUsd: IMAGE_DAILY_BUDGET_USD,
            spentUsd,
            reservedUsd: pendingUsd + reservedUsd,
            updatedAt: now,
        }, { merge: true });
        transaction.set(reference, {
            uid,
            operation: 'image-generation',
            operationId: payload.operationId,
            requestFingerprint: fingerprint,
            status: 'pending',
            budgetDate,
            reservedUsd,
            budgetSettled: false,
            createdAt: data.createdAt || now,
            updatedAt: now,
        }, { merge: true });
        return null;
    });
    if (durableCached && typeof durableCached === 'object' && 'chunkCount' in durableCached) {
        const chunkCount = Number((durableCached as { chunkCount: unknown }).chunkCount);
        const chunks = await Promise.all(Array.from({ length: chunkCount }, (_, index) => reference.collection('resultChunks').doc(String(index).padStart(3, '0')).get()));
        const encoded = chunks.map((chunk) => String(chunk.data()?.data || '')).join('');
        if (!encoded) throw new ImageOperationConflictError('완료된 이미지 결과 조각을 복구하지 못했습니다.');
        return { key, cached: JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as ImageGenerationResponse };
    }
    if (durableCached && typeof durableCached === 'object' && 'storagePath' in durableCached) {
        const storagePath = String((durableCached as { storagePath: unknown }).storagePath);
        const expectedSha256 = String((durableCached as { sha256: unknown }).sha256);
        const [compressed] = await firebaseAdmin.storage().bucket().file(storagePath).download();
        const serialized = gunzipSync(compressed);
        if (serialized.byteLength > IMAGE_DURABLE_STORAGE_MAX_BYTES || createHash('sha256').update(serialized).digest('hex') !== expectedSha256) {
            throw new ImageOperationConflictError('완료된 이미지 결과의 무결성을 확인하지 못했습니다.');
        }
        return { key, cached: JSON.parse(serialized.toString('utf8')) as ImageGenerationResponse };
    }
    return { key, cached: durableCached };
}

async function finishImageOperation(key: string, status: 'completed' | 'failed' | 'uncertain', response?: ImageGenerationResponse) {
    const serializedResponse = response ? Buffer.from(JSON.stringify(response), 'utf8') : null;
    const responseBytes = serializedResponse?.byteLength || 0;
    const durableResult = status === 'completed' && response && responseBytes <= IMAGE_DURABLE_RESULT_MAX_BYTES ? response : undefined;
    let resultChunkCount = 0;
    let resultStoragePath = '';
    let resultSha256 = '';
    if (status === 'completed' && response && responseBytes > IMAGE_DURABLE_RESULT_MAX_BYTES && responseBytes <= IMAGE_DURABLE_CHUNKED_MAX_BYTES) {
        const encoded = Buffer.from(JSON.stringify(response), 'utf8').toString('base64');
        const chunks = Array.from({ length: Math.ceil(encoded.length / IMAGE_DURABLE_CHUNK_BYTES) }, (_, index) => encoded.slice(index * IMAGE_DURABLE_CHUNK_BYTES, (index + 1) * IMAGE_DURABLE_CHUNK_BYTES));
        const batch = adminDb.batch();
        const chunkCollection = adminDb.collection('aiOperationReservations').doc(key).collection('resultChunks');
        chunks.forEach((chunk, index) => batch.set(chunkCollection.doc(String(index).padStart(3, '0')), { data: chunk, index, updatedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }));
        await batch.commit();
        resultChunkCount = chunks.length;
    }
    if (status === 'completed' && serializedResponse && responseBytes > IMAGE_DURABLE_CHUNKED_MAX_BYTES && responseBytes <= IMAGE_DURABLE_STORAGE_MAX_BYTES) {
        resultSha256 = createHash('sha256').update(serializedResponse).digest('hex');
        resultStoragePath = `ai-operation-results/${createHash('sha256').update(key).digest('hex')}.json.gz`;
        await firebaseAdmin.storage().bucket().file(resultStoragePath).save(gzipSync(serializedResponse, { level: 6 }), {
            resumable: false,
            contentType: 'application/gzip',
            metadata: { cacheControl: 'private, max-age=0', metadata: { sha256: resultSha256, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() } },
        });
    }
    if (status === 'completed' && response && Buffer.byteLength(JSON.stringify(response), 'utf8') <= IMAGE_RESULT_CACHE_MAX_BYTES) {
        if (completedImageResults.size >= IMAGE_RESULT_CACHE_MAX_ENTRIES) {
            const oldestKey = completedImageResults.keys().next().value as string | undefined;
            if (oldestKey) completedImageResults.delete(oldestKey);
        }
        completedImageResults.set(key, { expiresAt: Date.now() + IMAGE_RESULT_CACHE_TTL_MS, response });
    }
    const operationReference = adminDb.collection('aiOperationReservations').doc(key);
    await adminDb.runTransaction(async (transaction) => {
        const operationSnapshot = await transaction.get(operationReference);
        const operation = operationSnapshot.data() || {};
        if (operation.budgetSettled) {
            transaction.set(operationReference, { status, ...(durableResult ? { result: durableResult } : {}), ...(resultChunkCount ? { resultChunkCount } : {}), ...(resultStoragePath ? { resultStoragePath, resultSha256 } : {}), ...(resultChunkCount || resultStoragePath ? { resultExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } : {}), updatedAt: new Date() }, { merge: true });
            return;
        }
        const reservedUsd = Math.max(0, Number(operation.reservedUsd) || 0);
        const budgetDate = typeof operation.budgetDate === 'string' ? operation.budgetDate : imageBudgetDate();
        const uid = typeof operation.uid === 'string' ? operation.uid : '';
        const budgetReference = adminDb.collection('aiDailyBudgets').doc(imageBudgetKey(uid, budgetDate));
        const budgetSnapshot = await transaction.get(budgetReference);
        const budget = budgetSnapshot.data() || {};
        const metadata = response?.metadata && typeof response.metadata === 'object'
            ? response.metadata as Record<string, unknown>
            : {};
        const reportedCost = Number(metadata.costUsd);
        const chargedUsd = status === 'failed'
            ? 0
            : Number.isFinite(reportedCost) && reportedCost >= 0 ? reportedCost : reservedUsd;
        transaction.set(budgetReference, {
            reservedUsd: Math.max(0, (Number(budget.reservedUsd) || 0) - reservedUsd),
            spentUsd: Math.max(0, Number(budget.spentUsd) || 0) + chargedUsd,
            updatedAt: new Date(),
        }, { merge: true });
        transaction.set(operationReference, {
            status,
            ...(durableResult ? { result: durableResult } : {}),
            ...(resultChunkCount ? { resultChunkCount } : {}),
            ...(resultStoragePath ? { resultStoragePath, resultSha256 } : {}),
            ...(resultChunkCount || resultStoragePath ? { resultExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } : {}),
            budgetSettled: true,
            chargedUsd,
            updatedAt: new Date(),
        }, { merge: true });
    });
}

function assertReferenceImageSize(base64: string): void {
    if (Buffer.byteLength(base64, 'base64') > MAX_REFERENCE_IMAGE_BYTES) {
        throw new Error('Reference image exceeds the 8 MB limit.');
    }
}

async function readReferenceImageResponse(response: Response): Promise<Buffer> {
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_REFERENCE_IMAGE_BYTES) {
        await response.body?.cancel();
        throw new Error('Reference image exceeds the 8 MB limit.');
    }

    if (!response.body) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > MAX_REFERENCE_IMAGE_BYTES) throw new Error('Reference image exceeds the 8 MB limit.');
        return bytes;
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > MAX_REFERENCE_IMAGE_BYTES) {
            await reader.cancel();
            throw new Error('Reference image exceeds the 8 MB limit.');
        }
        chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks);
}

const parseReferenceImage = async (image?: string): Promise<ParsedReferenceImage | undefined> => {
    const trimmed = image?.trim();
    if (!trimmed) return undefined;
    const matched = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (matched) {
        const mimeType = matched[1].toLowerCase();
        const base64 = matched[2].replace(/\s+/g, '');
        if (!REFERENCE_IMAGE_TYPES.has(mimeType)) throw new Error('Unsupported reference image type.');
        assertReferenceImageSize(base64);
        return { mimeType, base64, byteLength: Buffer.byteLength(base64, 'base64') };
    }

    if (/^https?:\/\//i.test(trimmed)) {
        const url = normalizeExternalHttpUrl(trimmed);
        const response = await fetchExternalHttpUrl(url, {
            headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8,*/*;q=0.5' },
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Reference image could not be fetched (${response.status}).`);
        }

        const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
        if (!REFERENCE_IMAGE_TYPES.has(mimeType)) {
            await response.body?.cancel();
            throw new Error('Unsupported reference image type.');
        }

        const bytes = await readReferenceImageResponse(response);
        return { mimeType, base64: bytes.toString('base64'), byteLength: bytes.length };
    }

    assertReferenceImageSize(trimmed);
    return { mimeType: 'image/png', base64: trimmed, byteLength: Buffer.byteLength(trimmed, 'base64') };
};

function getReferenceImageInputs(payload: z.infer<typeof GenerateImageRequestSchema>) {
    if (payload.referenceImages?.length) return payload.referenceImages;
    return payload.image ? [{ image: payload.image, role: 'style' as const }] : [];
}

async function parseReferenceImages(payload: z.infer<typeof GenerateImageRequestSchema>): Promise<ParsedReferenceImageWithRole[]> {
    const parsedImages = (await Promise.all(
        getReferenceImageInputs(payload).map(async (reference) => {
            const image = await parseReferenceImage(reference.image);
            return image ? { ...image, role: reference.role } : null;
        }),
    )).filter((image): image is ParsedReferenceImageWithRole => image !== null);
    const totalBytes = parsedImages.reduce((total, image) => total + image.byteLength, 0);
    if (totalBytes > MAX_TOTAL_REFERENCE_IMAGE_BYTES) {
        throw new Error('Combined reference images exceed the 16 MB limit.');
    }
    return parsedImages;
}

const buildPrompt = (
    payload: z.infer<typeof GenerateImageRequestSchema>,
    referenceImages: ParsedReferenceImageWithRole[],
) => {
    const parts = [payload.prompt.trim()];
    if (payload.stylePreset && payload.stylePreset !== 'none') {
        parts.push(IMAGE_STYLE_PRESET_INSTRUCTIONS[payload.stylePreset] || `Style: ${payload.stylePreset}`);
    }
    if (payload.aspectRatio) parts.push(`Aspect ratio: ${payload.aspectRatio}`);
    if (payload.width && payload.height) parts.push(`Target size: ${payload.width}x${payload.height}`);
    if (payload.negativePrompt?.trim()) parts.push(`Avoid: ${payload.negativePrompt.trim()}`);
    if (referenceImages.length) {
        const roles = referenceImages
            .map((reference, index) => `#${index + 1} ${reference.role}`)
            .join(', ');
        parts.push(`Reference images are the visual source of truth (${roles}). Preserve each referenced building, product, character, background, and style faithfully: identity, silhouette, proportions, materials, colors, textures, and placement. Keep separate subjects distinct. Do not invent logos, readable text, or unreferenced features.`);
    }
    parts.push('Return image output only.');
    return parts.join('\n');
};

const inferResolution = (width?: number, height?: number): '1K' | '2K' | '4K' | undefined => {
    const maxSide = Math.max(width || 0, height || 0);
    if (!maxSide) return undefined;
    if (maxSide > 2048) return '4K';
    if (maxSide > 1024) return '2K';
    return '1K';
};

const normalizeAspectRatio = (payload: z.infer<typeof GenerateImageRequestSchema>) => {
    const requested = payload.aspectRatio?.trim();
    return requested && requested !== 'custom' && /^\d{1,2}:\d{1,2}$/.test(requested) ? requested : undefined;
};

function hasParameter(model: OpenRouterImageModel, parameter: string): boolean {
    return Boolean(model.supported_parameters && parameter in model.supported_parameters);
}

function supportsRequestedImageInput(
    model: OpenRouterImageModel,
    payload: z.infer<typeof GenerateImageRequestSchema>,
    referenceImages: ParsedReferenceImageWithRole[],
): boolean {
    const outputModalities = model.architecture?.output_modalities || [];
    if (!outputModalities.includes('image')) return false;
    if (referenceImages.length) {
        const inputModalities = model.architecture?.input_modalities || [];
        if (!inputModalities.includes('image') || !hasParameter(model, 'input_references')) return false;
    }
    if ((payload.numberOfImages ?? 1) > 1 && !hasParameter(model, 'n')) return false;
    return true;
}

function scoreImageModel(
    model: OpenRouterImageModel,
    payload: z.infer<typeof GenerateImageRequestSchema>,
): number {
    const preferredIndex = PREFERRED_AUTO_IMAGE_MODELS.indexOf(model.id);
    const preferenceScore = preferredIndex >= 0 ? PREFERRED_AUTO_IMAGE_MODELS.length - preferredIndex : 0;
    const requestedAspectRatio = normalizeAspectRatio(payload);
    const canHonorRequestedFrame = Boolean(
        (requestedAspectRatio && hasParameter(model, 'aspect_ratio')) ||
        (payload.width && payload.height && hasParameter(model, 'size')),
    );
    return (canHonorRequestedFrame ? 1_000 : 0) + (hasParameter(model, 'output_format') ? 100 : 0) + preferenceScore;
}

async function discoverOpenRouterImageModels(apiKey: string): Promise<OpenRouterImageModel[]> {
    if (cachedImageModels && cachedImageModels.expiresAt > Date.now()) return cachedImageModels.models;

    const response = await fetch('https://openrouter.ai/api/v1/images/models', {
        headers: { Authorization: ['Bearer', apiKey].join(' ') },
        cache: 'no-store',
        signal: AbortSignal.timeout(OPENROUTER_DISCOVERY_TIMEOUT_MS),
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
    payload: z.infer<typeof GenerateImageRequestSchema>;
    referenceImages: ParsedReferenceImageWithRole[];
    configuredModel: string;
}): Promise<SelectedOpenRouterImageModel> {
    try {
        const models = await discoverOpenRouterImageModels(params.apiKey);
        const compatibleModels = models.filter(
            (model) => supportsRequestedImageInput(model, params.payload, params.referenceImages),
        );
        const efficientModel = params.payload.resourceMode === 'efficient'
            ? compatibleModels.find((model) => model.id === EFFICIENT_STORYBOARD_IMAGE_MODEL)
            : null;
        if (efficientModel) {
            return {
                id: efficientModel.id,
                supportedParameters: new Set(Object.keys(efficientModel.supported_parameters || {})),
                selectionSource: 'efficient',
            };
        }
        const requestedModel = params.payload.model
            ? compatibleModels.find((model) => model.id === params.payload.model)
            : null;
        if (requestedModel) {
            return {
                id: requestedModel.id,
                supportedParameters: new Set(Object.keys(requestedModel.supported_parameters || {})),
                selectionSource: 'requested',
            };
        }
        const configuredModel = compatibleModels.find((model) => model.id === params.configuredModel);
        if (configuredModel) {
            return {
                id: configuredModel.id,
                supportedParameters: new Set(Object.keys(configuredModel.supported_parameters || {})),
                selectionSource: 'configured',
            };
        }
        const selected = compatibleModels
            .sort((left, right) => scoreImageModel(right, params.payload) - scoreImageModel(left, params.payload))[0];
        if (selected) {
            return {
                id: selected.id,
                supportedParameters: new Set(Object.keys(selected.supported_parameters || {})),
                selectionSource: 'discovered',
            };
        }
    } catch (error) {
        console.warn('[API] OpenRouter image model discovery failed; using the compatibility fallback.', error);
    }

    return {
        id: params.payload.resourceMode === 'efficient'
            ? EFFICIENT_STORYBOARD_IMAGE_MODEL
            : params.payload.model || params.configuredModel || AUTO_IMAGE_MODEL_FALLBACK,
        supportedParameters: null,
        selectionSource: 'fallback',
    };
}

const deriveInfraHint = (rawMessage: string): ImageInfraHint => {
    const lower = rawMessage.toLowerCase();
    if (
        lower.includes('inputimagesensitivecontentdetected.privacyinformation')
        || lower.includes('may contain real person')
        || (lower.includes('input image') && lower.includes('privacy'))
    ) {
        return {
            reasonCode: 'input_image_privacy',
            message: '첨부한 참조 사진에 실제 인물이 포함되었거나 그렇게 감지되어 모델이 요청을 받지 않았습니다. 인물 사진을 빼거나 인물이 없는 제품·건물·배경 사진 또는 일러스트로 바꾼 뒤 다시 생성해 주세요.',
        };
    }
    if (lower.includes('billing') && (lower.includes('disabled') || lower.includes('closed'))) {
        return { reasonCode: 'billing_disabled', message: 'OpenRouter 결제가 비활성화되어 있습니다.' };
    }
    if (lower.includes('expired')) return { reasonCode: 'api_key_expired', message: 'OpenRouter API 키가 만료되었습니다.' };
    if (lower.includes('missing_api_key') || lower.includes('api key is missing')) {
        return { reasonCode: 'missing_api_key', message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.' };
    }
    if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) {
        return { reasonCode: 'permission_denied', message: 'OpenRouter API 인증 또는 권한을 확인하세요.' };
    }
    if (lower.includes('rate limit') || lower.includes('429')) return { reasonCode: 'rate_limited', message: 'OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.' };
    if (lower.includes('timed out') || lower.includes('timeout')) return { reasonCode: 'request_timeout', message: 'OpenRouter 이미지 생성 시간이 초과되었습니다.' };
    if (lower.includes('invalid') || lower.includes('bad request') || lower.includes('400')) return { reasonCode: 'invalid_request', message: 'OpenRouter가 이미지 생성 요청을 거부했습니다.' };
    return { reasonCode: 'unknown', message: 'OpenRouter 이미지 생성에 실패했습니다. 모델과 요청을 확인하세요.' };
};

function buildOpenRouterImageBody(params: {
    model: string;
    supportedParameters: Set<string> | null;
    payload: z.infer<typeof GenerateImageRequestSchema>;
    prompt: string;
    referenceImages: ParsedReferenceImageWithRole[];
}, includePresentationOptions: boolean): Record<string, unknown> {
    const supports = (parameter: string) => !params.supportedParameters || params.supportedParameters.has(parameter);
    const body: Record<string, unknown> = {
        model: params.model,
        prompt: params.prompt,
    };
    if (params.payload.quality && supports('quality') && /^(openai|x-ai)\//.test(params.model)) {
        body.quality = params.payload.quality;
    }
    if ((params.payload.numberOfImages ?? 1) > 1 || supports('n')) body.n = params.payload.numberOfImages ?? 1;

    // Image models expose different parameters through OpenRouter. Keep the
    // user's requested framing on the first attempt, then use this same body
    // without presentation parameters only when the provider rejects them.
    if (includePresentationOptions) {
        if (supports('output_format')) body.output_format = 'png';
        const resolution = inferResolution(params.payload.width, params.payload.height);
        const requestedAspectRatio = normalizeAspectRatio(params.payload);
        const requestedRatioValue = requestedAspectRatio
            ? requestedAspectRatio.split(':').map(Number)
            : [];
        const aspectRatio =
            params.model === EFFICIENT_STORYBOARD_IMAGE_MODEL &&
            requestedAspectRatio &&
            !new Set(['1:1', '3:2', '2:3', 'auto']).has(requestedAspectRatio)
                ? requestedRatioValue[0] >= requestedRatioValue[1]
                    ? '3:2'
                    : '2:3'
                : requestedAspectRatio;
        if (aspectRatio && supports('aspect_ratio')) {
            body.aspect_ratio = aspectRatio;
        } else if (params.payload.width && params.payload.height && supports('size')) {
            body.size = `${params.payload.width}x${params.payload.height}`;
        } else if (resolution && supports('resolution')) {
            body.resolution = resolution;
        }
    }

    if (params.referenceImages.length) {
        body.input_references = params.referenceImages.map((referenceImage) => ({
            type: 'image_url',
            image_url: { url: `data:${referenceImage.mimeType};base64,${referenceImage.base64}` },
        }));
    }
    return body;
}

async function requestOpenRouterImages(apiKey: string, body: Record<string, unknown>): Promise<OpenRouterImageResponse> {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(process.env.NEXT_PUBLIC_SITE_URL ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL } : {}),
            'X-OpenRouter-Title': 'ProPig',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OPENROUTER_GENERATION_TIMEOUT_MS),
    });
    const raw = await response.text();
    let data: OpenRouterImageResponse = {};
    try { data = JSON.parse(raw) as OpenRouterImageResponse; } catch { /* safe HTTP error below */ }

    if (!response.ok) {
        const error = new Error(data.error?.message || raw.slice(0, 1000) || `OpenRouter HTTP ${response.status}`) as OpenRouterImageRequestError;
        error.status = response.status;
        error.code = data.error?.code;
        error.param = data.error?.param;
        error.providerType = data.error?.type;
        throw error;
    }
    return data;
}

function canRetryWithoutPresentationOptions(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const status = (error as Partial<OpenRouterImageRequestError>).status;
    if (status !== 400 && status !== 422) return false;
    return /(?:unsupported|not supported|unknown|invalid).{0,80}(?:parameter|size|aspect|format|resolution)|(?:size|aspect_ratio|output_format|resolution).{0,80}(?:unsupported|not supported|invalid|not allowed)/i.test(error.message);
}

async function generateImagesWithOpenRouter(params: {
    apiKey: string;
    model: string;
    supportedParameters: Set<string> | null;
    payload: z.infer<typeof GenerateImageRequestSchema>;
    prompt: string;
    referenceImages: ParsedReferenceImageWithRole[];
}): Promise<{ images: GeneratedImageAsset[]; cost?: number; compatibilityFallback: boolean }> {
    let compatibilityFallback = false;
    let data: OpenRouterImageResponse;
    try {
        data = await requestOpenRouterImages(params.apiKey, buildOpenRouterImageBody(params, true));
    } catch (error) {
        if (!canRetryWithoutPresentationOptions(error)) throw error;
        data = await requestOpenRouterImages(params.apiKey, buildOpenRouterImageBody(params, false));
        compatibilityFallback = true;
    }

    const images: GeneratedImageAsset[] = [];
    for (const item of data.data || []) {
        if (item.b64_json) {
            images.push({ base64: item.b64_json, mimeType: item.media_type || 'image/png' });
        } else if (item.url) {
            images.push({ url: item.url, mimeType: item.media_type });
        }
    }
    if (!images.length) throw new Error('OpenRouter returned no image data.');
    return { images, cost: data.usage?.cost, compatibilityFallback };
}

export async function POST(req: NextRequest) {
    let operationKey: string | null = null;
    let providerAttempted = false;
    try {
        const auth = await requireAdminOrPermissionAuth(req, 'photoManagement');
        if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });

        const parsed = GenerateImageRequestSchema.safeParse(await req.json());
        if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid request payload', issues: parsed.error.issues }, { status: 400 });

        const rateLimit = await enforceUserRateLimit({
            namespace: 'generate-image-minute',
            uid: auth.uid,
            maxRequests: 12,
            windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, reasonCode: 'rate_limited', error: `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.` },
                { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
            );
        }
        const dailyLimit = await enforceUserRateLimit({
            namespace: 'generate-image-day',
            uid: auth.uid,
            maxRequests: 48,
            windowMs: 24 * 60 * 60 * 1000,
        });
        if (!dailyLimit.allowed) {
            return NextResponse.json(
                { success: false, reasonCode: 'rate_limited', error: `${dailyLimit.retryAfterSeconds}초 후 다시 시도해 주세요.` },
                { status: 429, headers: { 'Retry-After': String(dailyLimit.retryAfterSeconds) } },
            );
        }

        const runtime = await getAIRuntimeConfig();
        if (!runtime.openRouterApiKey) {
            return NextResponse.json({
                success: false,
                reasonCode: 'missing_api_key',
                error: 'OpenRouter 연결이 준비되지 않았습니다. 관리자 AI 설정을 확인해 주세요.',
            }, { status: 500 });
        }

        const payload = parsed.data;
        const reservation = await reserveImageOperation(auth.uid, payload);
        operationKey = reservation.key;
        if (reservation.cached) return NextResponse.json(reservation.cached);
        const referenceImages = await parseReferenceImages(payload);
        const prompt = buildPrompt(payload, referenceImages);
        const selectedImageModel = await selectOpenRouterImageModel({
            apiKey: runtime.openRouterApiKey,
            payload,
            referenceImages,
            configuredModel: runtime.imageModel,
        });
        providerAttempted = true;
        const generated = await generateImagesWithOpenRouter({
            apiKey: runtime.openRouterApiKey,
            model: selectedImageModel.id,
            supportedParameters: selectedImageModel.supportedParameters,
            payload,
            prompt,
            referenceImages,
        });
        await recordOpenRouterUsage({
            operation: 'image',
            source: 'next_server',
            model: selectedImageModel.id,
            costUsd: generated.cost,
        });
        const images = generated.images.map((image) => ({
            id: randomUUID(),
            url: image.url || `data:${image.mimeType || 'image/png'};base64,${image.base64}`,
            mimeType: image.mimeType,
            base64: image.base64,
        }));
        const responseBody: ImageGenerationResponse = {
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
                costUsd: generated.cost,
                referenceImageCount: referenceImages.length,
                referenceRoles: referenceImages.map((reference) => reference.role),
                compatibilityFallback: generated.compatibilityFallback,
            },
        };
        await finishImageOperation(operationKey, 'completed', responseBody);
        return NextResponse.json(responseBody);
    } catch (error) {
        console.error('[API] generate-image failed:', error);
        if (operationKey) {
            await finishImageOperation(operationKey, providerAttempted ? 'uncertain' : 'failed').catch(() => undefined);
        }
        if (error instanceof ImageBudgetExceededError) {
            return NextResponse.json({ success: false, reasonCode: 'budget_exceeded', error: error.message }, { status: 402 });
        }
        if (error instanceof ImageOperationConflictError) {
            return NextResponse.json({ success: false, reasonCode: 'duplicate_operation', error: error.message }, { status: 409 });
        }
        const rawMessage = error instanceof Error ? error.message : 'Failed to generate image';
        const requestError = error as Partial<OpenRouterImageRequestError>;
        const hint = deriveInfraHint(`${requestError.code || ''} ${rawMessage}`);
        return NextResponse.json(
            {
                success: false,
                reasonCode: hint.reasonCode,
                error: hint.message,

            },
            { status: hint.reasonCode === 'input_image_privacy' ? 422 : 500 },
        );
    }
}
