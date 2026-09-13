import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readImageBudgetLimit } from './imageBudgetOperations';
import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import { recordOpenRouterUsage } from '../openrouterUsage';
import { generateOpenRouterVideo } from '../videoStudio/openrouter';
import { normalizeVideoSpokenDialogue } from '../videoStudio/dialogue';
import {
    ApiError,
    parseJson,
    requireAccess,
    requireAdmin,
    requireMethod,
    requireUser,
} from './hostingCommon';
import { enforceUserRateLimit, fetchExternalHttpUrl, normalizeExternalHttpUrl } from './security';
import { getHostingAiRuntime, runOpenRouterText } from './hostingAiRuntime';
import { db } from '../firestore';

const ImageReferenceRoleSchema = z.enum(['building', 'product', 'character', 'background', 'style']);
const STUDIO_IMAGE_MODELS = [
    'openai/gpt-image-2',
    'google/gemini-3.1-flash-lite-image',
    'google/gemini-3.1-flash-image',
    'x-ai/grok-imagine-image-2.0',
] as const;
const StoryboardDialogueOrCaptionSchema = z.preprocess(
    (value) => typeof value === 'string' ? normalizeVideoSpokenDialogue(value) : value,
    z.string().trim().max(240),
);
const GenerateImageSchema = z.object({
    operationId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(4000),
    negativePrompt: z.string().max(1500).optional(),
    aspectRatio: z.string().max(20).optional(),
    width: z.number().int().min(64).max(4096).optional(),
    height: z.number().int().min(64).max(4096).optional(),
    stylePreset: z.string().max(100).optional(),
    image: z.string().optional(),
    referenceImageBase64: z.string().optional(),
    referenceImageMimeType: z.string().optional(),
    referenceImages: z.array(z.object({
        role: ImageReferenceRoleSchema,
        image: z.string().min(1),
    })).max(5).optional(),
    numberOfImages: z.number().int().min(1).max(4).default(1),
    resourceMode: z.enum(['efficient', 'balanced', 'premium']).default('premium'),
    provider: z.literal('openrouter').optional().default('openrouter'),
    model: z.enum(STUDIO_IMAGE_MODELS).optional(),
    quality: z.enum(['low', 'high']).optional(),
});

type ParsedReference = {
    role: z.infer<typeof ImageReferenceRoleSchema>;
    base64: string;
    mimeType: string;
    byteLength: number;
};
type OpenRouterImageResponse = {
    data?: Array<{ b64_json?: string; media_type?: string; url?: string }>;
    usage?: { cost?: number };
    error?: { message?: string };
};
type OpenRouterImageRequestError = Error & { status: number };
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

const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_REFERENCE_BYTES = 16 * 1024 * 1024;
const ALLOWED_REFERENCE_TYPES = new Set([
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
]);
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

function imageOperationKey(uid: string, operationId: string): string {
    return createHash('sha256').update(`${uid}:image-generation:${operationId}`).digest('hex');
}

function imageBudgetDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function imageBudgetKey(uid: string, date: string): string {
    return createHash('sha256').update(`${uid}:image-generation-budget:${date}`).digest('hex');
}

function imageRequestFingerprint(payload: z.infer<typeof GenerateImageSchema>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function readTimestampMillis(value: unknown): number {
    if (value instanceof Date) return value.getTime();
    if (!value || typeof value !== 'object' || !('toMillis' in value)) return 0;
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    return typeof toMillis === 'function' ? Number(toMillis.call(value)) || 0 : 0;
}

async function enforceSharedImageRateLimit(input: {
    namespace: 'generate-image-minute' | 'generate-image-day';
    uid: string;
    maxRequests: number;
    windowMs: number;
}) {
    const key = Buffer.from(`${input.namespace}:${input.uid}`).toString('base64url');
    const reference = db.collection('serverRateLimits').doc(key);
    const now = Date.now();
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const data = snapshot.data() || {};
        const storedWindowStart = readTimestampMillis(data.windowStartedAt);
        const isCurrentWindow = storedWindowStart > 0 && now - storedWindowStart < input.windowMs;
        const windowStartedAt = isCurrentWindow ? storedWindowStart : now;
        const storedCount = Number.isSafeInteger(data.count) && data.count >= 0 ? data.count as number : 0;
        const nextCount = isCurrentWindow ? storedCount + 1 : 1;
        if (nextCount > input.maxRequests) {
            return {
                allowed: false as const,
                retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAt + input.windowMs - now) / 1000)),
            };
        }
        transaction.set(reference, {
            namespace: input.namespace,
            uid: input.uid,
            count: nextCount,
            windowStartedAt: new Date(windowStartedAt),
            updatedAt: new Date(now),
            expiresAt: new Date(windowStartedAt + input.windowMs),
        }, { merge: true });
        return { allowed: true as const };
    });
}

async function reserveImageOperation(uid: string, payload: z.infer<typeof GenerateImageSchema>) {
    const key = imageOperationKey(uid, payload.operationId);
    const cached = completedImageResults.get(key);
    if (cached && cached.expiresAt <= Date.now()) completedImageResults.delete(key);

    const reference = db.collection('aiOperationReservations').doc(key);
    const fingerprint = imageRequestFingerprint(payload);
    const budgetDate = imageBudgetDate();
    const budgetReference = db.collection('aiDailyBudgets').doc(imageBudgetKey(uid, budgetDate));
    const reservedUsd = (payload.numberOfImages || 1) * IMAGE_RESERVED_USD_PER_OUTPUT;
    const durableCached = await db.runTransaction(async (transaction): Promise<ImageGenerationResponse | { chunkCount: number } | { storagePath: string; sha256: string } | null> => {
        const snapshot = await transaction.get(reference);
        const data = snapshot.data() || {};
        if (data.requestFingerprint && data.requestFingerprint !== fingerprint) {
            throw new ApiError(409, '같은 operationId를 다른 이미지 요청에 사용할 수 없습니다.');
        }
        if (data.status === 'completed') {
            // Memory results are usable only after durable identity and completion checks.
            if (cached && cached.expiresAt > Date.now()) return cached.response;
            if (data.result && typeof data.result === 'object') return data.result as ImageGenerationResponse;
            const chunkCount = Number(data.resultChunkCount);
            if (Number.isSafeInteger(chunkCount) && chunkCount > 0) return { chunkCount };
            if (typeof data.resultStoragePath === 'string' && typeof data.resultSha256 === 'string') return { storagePath: data.resultStoragePath, sha256: data.resultSha256 };
            throw new ApiError(409, '같은 이미지 생성 요청이 이미 완료되었지만 보관된 결과가 없어 새 operationId가 필요합니다.');
        }
        // Elapsed time cannot prove that an earlier paid provider request did not run.
        // Manual reconciliation is terminal too; never replay this logical paid operation.
        if (data.status === 'pending' || data.status === 'uncertain' || data.status === 'reconciled' || data.costReconciliation) {
            throw new ApiError(409, '같은 이미지 생성 요청이 처리 중이거나 결과 확인이 필요합니다.');
        }
        const limitUsd = await readImageBudgetLimit(transaction, db, uid, IMAGE_DAILY_BUDGET_USD);
        const budgetSnapshot = await transaction.get(budgetReference);
        const budget = budgetSnapshot.data() || {};
        const validAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
        if (budgetSnapshot.exists && (budget.uid !== uid || budget.date !== budgetDate || !validAmount(budget.spentUsd) || !validAmount(budget.reservedUsd))) {
            throw new ApiError(409, '이미지 예산 기록을 확인해 주세요.');
        }
        const hasPreviousReservation = !data.budgetSettled && data.budgetDate === budgetDate;
        if (hasPreviousReservation && !validAmount(data.reservedUsd)) throw new ApiError(409, '이미지 예산 기록을 확인해 주세요.');
        const previousReservation = hasPreviousReservation ? data.reservedUsd as number : 0;
        const spentUsd = budgetSnapshot.exists ? budget.spentUsd as number : 0;
        const pendingUsd = (budgetSnapshot.exists ? budget.reservedUsd as number : 0) - previousReservation;
        if (pendingUsd < 0 || !Number.isFinite(spentUsd + pendingUsd + reservedUsd)) throw new ApiError(409, '이미지 예산 기록을 확인해 주세요.');
        if (spentUsd + pendingUsd + reservedUsd > limitUsd) {
            throw new ApiError(402, '오늘의 OpenRouter 이미지 생성 예산을 모두 사용했습니다.');
        }
        const now = new Date();
        transaction.set(budgetReference, {
            uid,
            date: budgetDate,
            limitUsd,
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
        if (!encoded) throw new ApiError(409, '완료된 이미지 결과 조각을 복구하지 못했습니다.');
        return { key, cached: JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as ImageGenerationResponse };
    }
    if (durableCached && typeof durableCached === 'object' && 'storagePath' in durableCached) {
        const storagePath = String((durableCached as { storagePath: unknown }).storagePath);
        const expectedSha256 = String((durableCached as { sha256: unknown }).sha256);
        const [compressed] = await admin.storage().bucket().file(storagePath).download();
        const serialized = gunzipSync(compressed);
        if (serialized.byteLength > IMAGE_DURABLE_STORAGE_MAX_BYTES || createHash('sha256').update(serialized).digest('hex') !== expectedSha256) {
            throw new ApiError(409, '완료된 이미지 결과의 무결성을 확인하지 못했습니다.');
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
        const batch = db.batch();
        const chunkCollection = db.collection('aiOperationReservations').doc(key).collection('resultChunks');
        chunks.forEach((chunk, index) => batch.set(chunkCollection.doc(String(index).padStart(3, '0')), { data: chunk, index, updatedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }));
        await batch.commit();
        resultChunkCount = chunks.length;
    }
    if (status === 'completed' && serializedResponse && responseBytes > IMAGE_DURABLE_CHUNKED_MAX_BYTES && responseBytes <= IMAGE_DURABLE_STORAGE_MAX_BYTES) {
        resultSha256 = createHash('sha256').update(serializedResponse).digest('hex');
        resultStoragePath = `ai-operation-results/${createHash('sha256').update(key).digest('hex')}.json.gz`;
        await admin.storage().bucket().file(resultStoragePath).save(gzipSync(serializedResponse, { level: 6 }), {
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
    const operationReference = db.collection('aiOperationReservations').doc(key);
    await db.runTransaction(async (transaction) => {
        const operationSnapshot = await transaction.get(operationReference);
        const operation = operationSnapshot.data() || {};
        // An old finisher may arrive after manual review; never overwrite that terminal fence.
        if (operation.status === 'reconciled' || operation.costReconciliation) return;
        if (operation.budgetSettled) {
            transaction.set(operationReference, { status, ...(durableResult ? { result: durableResult } : {}), ...(resultChunkCount ? { resultChunkCount } : {}), ...(resultStoragePath ? { resultStoragePath, resultSha256 } : {}), ...(resultChunkCount || resultStoragePath ? { resultExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } : {}), updatedAt: new Date() }, { merge: true });
            return;
        }
        const reservedUsd = Math.max(0, Number(operation.reservedUsd) || 0);
        const budgetDate = typeof operation.budgetDate === 'string' ? operation.budgetDate : imageBudgetDate();
        const uid = typeof operation.uid === 'string' ? operation.uid : '';
        const budgetReference = db.collection('aiDailyBudgets').doc(imageBudgetKey(uid, budgetDate));
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

async function readReferenceResponse(response: globalThis.Response): Promise<Buffer> {
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_REFERENCE_BYTES) {
        await response.body?.cancel();
        throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
    }
    const reader = response.body?.getReader();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_REFERENCE_BYTES) throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
        return buffer;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_REFERENCE_BYTES) {
            await reader.cancel();
            throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}

async function parseReference(
    role: ParsedReference['role'],
    rawValue: string,
    fallbackMimeType = 'image/png',
): Promise<ParsedReference> {
    const value = rawValue.trim();
    const dataUrl = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrl) {
        const mimeType = dataUrl[1].toLowerCase();
        const base64 = dataUrl[2].replace(/\s+/g, '');
        if (!ALLOWED_REFERENCE_TYPES.has(mimeType)) throw new ApiError(415, 'Unsupported reference image type.');
        const byteLength = Buffer.byteLength(base64, 'base64');
        if (byteLength > MAX_REFERENCE_BYTES) throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
        return { role, base64, mimeType, byteLength };
    }
    if (/^https?:\/\//i.test(value)) {
        const response = await fetchExternalHttpUrl(normalizeExternalHttpUrl(value), {
            headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8' },
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new ApiError(502, `Reference image could not be fetched (${response.status}).`);
        }
        const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
        if (!ALLOWED_REFERENCE_TYPES.has(mimeType)) {
            await response.body?.cancel();
            throw new ApiError(415, 'Unsupported reference image type.');
        }
        const buffer = await readReferenceResponse(response);
        return { role, base64: buffer.toString('base64'), mimeType, byteLength: buffer.length };
    }
    const mimeType = ALLOWED_REFERENCE_TYPES.has(fallbackMimeType) ? fallbackMimeType : 'image/png';
    const base64 = value.replace(/\s+/g, '');
    const byteLength = Buffer.byteLength(base64, 'base64');
    if (byteLength > MAX_REFERENCE_BYTES) throw new ApiError(413, 'Reference image exceeds the 8 MB limit.');
    return { role, base64, mimeType, byteLength };
}

async function parseReferences(payload: z.infer<typeof GenerateImageSchema>): Promise<ParsedReference[]> {
    const inputs = payload.referenceImages?.length
        ? payload.referenceImages
        : payload.image
            ? [{ role: 'style' as const, image: payload.image }]
            : payload.referenceImageBase64
                ? [{ role: 'style' as const, image: payload.referenceImageBase64 }]
                : [];
    const references = await Promise.all(inputs.map((item) => parseReference(
        item.role,
        item.image,
        payload.referenceImageMimeType || 'image/png',
    )));
    const total = references.reduce((sum, reference) => sum + reference.byteLength, 0);
    if (total > MAX_TOTAL_REFERENCE_BYTES) {
        throw new ApiError(413, 'Combined reference images exceed the 16 MB limit.');
    }
    return references;
}

async function parseStoryboardReferences(
    inputs: Array<{ role: ParsedReference['role']; image: string }>,
): Promise<ParsedReference[]> {
    const references = await Promise.all(
        inputs.map((item) => parseReference(item.role, item.image)),
    );
    const total = references.reduce((sum, reference) => sum + reference.byteLength, 0);
    if (total > MAX_TOTAL_REFERENCE_BYTES) {
        throw new ApiError(413, 'Combined reference images exceed the 16 MB limit.');
    }
    return references;
}

const STYLE_INSTRUCTIONS: Record<string, string> = {
    clean: 'Style: clean modern digital design, precise spacing, crisp edges, refined commercial quality.',
    realistic: 'Style: photorealistic editorial image, natural lighting, believable lens perspective and detailed materials.',
    illustration: 'Style: polished brand illustration, clean silhouettes, balanced color blocking and smooth gradients.',
    minimal: 'Style: minimal composition, generous negative space, one clear focal subject and restrained color palette.',
    'project-board': 'Style: polished Korean corporate project board image, exact 16:9 hero composition, premium operations mood, no readable text.',
    'product-shot': 'Style: premium product advertising shot, controlled studio lighting and sharp material detail.',
    cinematic: 'Style: cinematic frame, dramatic key lighting, atmospheric depth and film-grade color.',
    luxury: 'Style: luxury magazine visual, refined materials, controlled highlights and elegant contrast.',
    isometric: 'Style: isometric 3D illustration, precise geometry, soft shadows and organized spatial depth.',
    watercolor: 'Style: watercolor illustration, soft pigment blooms, paper texture and handcrafted finish.',
    'retro-poster': 'Style: retro poster artwork, vintage print texture, bold simplified shapes and warm muted inks.',
    'pixel-art': 'Style: crisp pixel art, limited expressive palette, disciplined visible pixels and no blur.',
    anime: 'Style: modern anime-inspired visual, clean linework, expressive cel shading and vivid environmental lighting.',
    'line-art': 'Style: refined line art, confident ink strokes, mostly monochrome with one accent color.',
};

function buildImagePrompt(payload: z.infer<typeof GenerateImageSchema>, references: ParsedReference[]): string {
    const parts = [payload.prompt];
    if (payload.stylePreset && payload.stylePreset !== 'none') {
        parts.push(STYLE_INSTRUCTIONS[payload.stylePreset] || `Style: ${payload.stylePreset}`);
    }
    if (payload.aspectRatio) parts.push(`Aspect ratio: ${payload.aspectRatio}`);
    if (payload.width && payload.height) parts.push(`Target size: ${payload.width}x${payload.height}`);
    if (payload.negativePrompt?.trim()) parts.push(`Avoid: ${payload.negativePrompt.trim()}`);
    if (references.length) {
        parts.push(
            `Reference images are the visual source of truth (${references.map((item, index) => `#${index + 1} ${item.role}`).join(', ')}). ` +
            'Preserve each referenced building, product, character, background, and style faithfully. Keep distinct subjects separate and do not invent logos or readable text.',
        );
    }
    parts.push('Return image output only.');
    return parts.join('\n');
}

function imageInfraHint(message: string) {
    const lower = message.toLowerCase();
    if (lower.includes('missing') || lower.includes('not configured')) return { reasonCode: 'missing_api_key', error: 'OPENROUTER_API_KEY가 설정되지 않았습니다.' };
    if (lower.includes('permission') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) return { reasonCode: 'permission_denied', error: 'OpenRouter API 인증 또는 권한을 확인하세요.' };
    if (lower.includes('rate') || lower.includes('429')) return { reasonCode: 'rate_limited', error: 'OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.' };
    if (lower.includes('timeout')) return { reasonCode: 'request_timeout', error: 'OpenRouter 이미지 생성 시간이 초과되었습니다.' };
    if (lower.includes('invalid') || lower.includes('400')) return { reasonCode: 'invalid_request', error: 'OpenRouter가 이미지 생성 요청을 거부했습니다.' };
    return { reasonCode: 'unknown', error: 'OpenRouter 이미지 생성에 실패했습니다.' };
}

function hasImageParameter(model: OpenRouterImageModel, parameter: string): boolean {
    return Boolean(model.supported_parameters && parameter in model.supported_parameters);
}

function supportsRequestedImageInput(
    model: OpenRouterImageModel,
    payload: z.infer<typeof GenerateImageSchema>,
    references: ParsedReference[],
): boolean {
    const outputModalities = model.architecture?.output_modalities || [];
    if (!outputModalities.includes('image')) return false;
    if (references.length) {
        const inputModalities = model.architecture?.input_modalities || [];
        if (!inputModalities.includes('image') || !hasImageParameter(model, 'input_references')) return false;
    }
    if (payload.numberOfImages > 1 && !hasImageParameter(model, 'n')) return false;
    return true;
}

function scoreImageModel(model: OpenRouterImageModel, payload: z.infer<typeof GenerateImageSchema>): number {
    const preferredIndex = PREFERRED_AUTO_IMAGE_MODELS.indexOf(model.id);
    const preferenceScore = preferredIndex >= 0 ? PREFERRED_AUTO_IMAGE_MODELS.length - preferredIndex : 0;
    const canHonorRequestedFrame = Boolean(
        (payload.aspectRatio && /^\d{1,2}:\d{1,2}$/.test(payload.aspectRatio) && hasImageParameter(model, 'aspect_ratio')) ||
        (payload.width && payload.height && hasImageParameter(model, 'size')),
    );
    return (canHonorRequestedFrame ? 1_000 : 0) + (hasImageParameter(model, 'output_format') ? 100 : 0) + preferenceScore;
}

async function discoverOpenRouterImageModels(apiKey: string): Promise<OpenRouterImageModel[]> {
    if (cachedImageModels && cachedImageModels.expiresAt > Date.now()) return cachedImageModels.models;

    const response = await fetch('https://openrouter.ai/api/v1/images/models', {
        headers: { Authorization: ['Bearer', apiKey].join(' ') },
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
    payload: z.infer<typeof GenerateImageSchema>;
    references: ParsedReference[];
    configuredModel: string;
}): Promise<SelectedOpenRouterImageModel> {
    try {
        const models = await discoverOpenRouterImageModels(params.apiKey);
        const compatibleModels = models.filter(
            (model) => supportsRequestedImageInput(model, params.payload, params.references),
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
        console.warn('[hostingApi] OpenRouter image model discovery failed; using the compatibility fallback.', error);
    }

    return {
        id: params.payload.resourceMode === 'efficient'
            ? EFFICIENT_STORYBOARD_IMAGE_MODEL
            : params.payload.model || params.configuredModel || AUTO_IMAGE_MODEL_FALLBACK,
        supportedParameters: null,
        selectionSource: 'fallback',
    };
}

function buildOpenRouterImageBody(params: {
    model: string;
    supportedParameters: Set<string> | null;
    payload: z.infer<typeof GenerateImageSchema>;
    prompt: string;
    references: ParsedReference[];
}, includePresentationOptions: boolean): Record<string, unknown> {
    const supports = (parameter: string) => !params.supportedParameters || params.supportedParameters.has(parameter);
    const body: Record<string, unknown> = {
        model: params.model,
        prompt: params.prompt,
    };
    if (params.payload.quality && supports('quality') && /^(openai|x-ai)\//.test(params.model)) {
        body.quality = params.payload.quality;
    }
    if (params.payload.numberOfImages > 1 || supports('n')) body.n = params.payload.numberOfImages;

    // Presentation controls differ by OpenRouter image model. The first
    // request preserves the requested frame; a compatible retry drops only
    // controls the provider has explicitly rejected.
    if (includePresentationOptions) {
        if (supports('output_format')) body.output_format = 'png';
        const requestedAspectRatio =
            params.payload.aspectRatio && /^\d{1,2}:\d{1,2}$/.test(params.payload.aspectRatio)
                ? params.payload.aspectRatio
                : undefined;
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
        }
    }

    if (params.references.length) {
        body.input_references = params.references.map((reference) => ({
            type: 'image_url',
            image_url: { url: `data:${reference.mimeType};base64,${reference.base64}` },
        }));
    }
    return body;
}

async function requestOpenRouterImages(apiKey: string, body: Record<string, unknown>): Promise<OpenRouterImageResponse> {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-OpenRouter-Title': 'ProPig Firebase Functions',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OPENROUTER_GENERATION_TIMEOUT_MS),
    });
    const raw = await response.text();
    let data: OpenRouterImageResponse = {};
    try {
        data = JSON.parse(raw) as OpenRouterImageResponse;
    } catch {
        // The provider error below handles non-JSON responses.
    }
    if (!response.ok) {
        const error = new Error(data.error?.message || raw.slice(0, 1000) || `OpenRouter HTTP ${response.status}`) as OpenRouterImageRequestError;
        error.status = response.status;
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

export async function handleGenerateImage(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireAccess(req, 'photoManagement');
    const rateLimit = await enforceSharedImageRateLimit({
        namespace: 'generate-image-minute',
        uid: auth.uid,
        maxRequests: 12,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
        res.set('Retry-After', String(rateLimit.retryAfterSeconds));
        throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    }
    const dailyLimit = await enforceSharedImageRateLimit({
        namespace: 'generate-image-day',
        uid: auth.uid,
        maxRequests: 48,
        windowMs: 24 * 60 * 60 * 1000,
    });
    if (!dailyLimit.allowed) {
        res.set('Retry-After', String(dailyLimit.retryAfterSeconds));
        throw new ApiError(429, `${dailyLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    }
    const payload = parseJson(req, GenerateImageSchema);
    const runtime = await getHostingAiRuntime();
    if (!runtime.openRouterApiKey) throw new ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    const reservation = await reserveImageOperation(auth.uid, payload);
    if (reservation.cached) {
        res.status(200).json(reservation.cached);
        return;
    }
    let providerAttempted = false;
    try {
        const references = await parseReferences(payload);
        const prompt = buildImagePrompt(payload, references);
        const selectedImageModel = await selectOpenRouterImageModel({
            apiKey: runtime.openRouterApiKey,
            payload,
            references,
            configuredModel: runtime.imageModel,
        });
        const requestParams = {
            model: selectedImageModel.id,
            supportedParameters: selectedImageModel.supportedParameters,
            payload,
            prompt,
            references,
        };
        let compatibilityFallback = false;
        let data: OpenRouterImageResponse;
        providerAttempted = true;
        try {
            data = await requestOpenRouterImages(runtime.openRouterApiKey, buildOpenRouterImageBody(requestParams, true));
        } catch (error) {
            if (!canRetryWithoutPresentationOptions(error)) throw error;
            data = await requestOpenRouterImages(runtime.openRouterApiKey, buildOpenRouterImageBody(requestParams, false));
            compatibilityFallback = true;
        }
        const images = (data.data || []).flatMap((item) => {
            const mimeType = item.media_type || 'image/png';
            const url = item.url || (item.b64_json ? `data:${mimeType};base64,${item.b64_json}` : '');
            return url ? [{
                id: randomUUID(),
                url,
                mimeType,
                ...(item.b64_json ? { base64: item.b64_json } : {}),
            }] : [];
        });
        if (!images.length) throw new Error('OpenRouter returned no image data.');
        await recordOpenRouterUsage({
            operation: 'image',
            model: selectedImageModel.id,
            costUsd: data.usage?.cost,
        });
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
                costUsd: data.usage?.cost,
                referenceImageCount: references.length,
                referenceRoles: references.map((item) => item.role),
                compatibilityFallback,
            },
        };
        await finishImageOperation(reservation.key, 'completed', responseBody);
        res.status(200).json(responseBody);
    } catch (error) {
        await finishImageOperation(reservation.key, providerAttempted ? 'uncertain' : 'failed').catch(() => undefined);
        if (error instanceof ApiError) throw error;
        const rawMessage = error instanceof Error ? error.message : String(error);
        const hint = imageInfraHint(rawMessage);
        res.status(500).json({ success: false, ...hint });
    }
}

const VideoReferenceImageSchema = z.string().trim().min(1).max(280_000).refine(
    (value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || /^https:\/\//i.test(value),
    'Visual references must be HTTPS URLs or image data URLs.',
);

const GenerateVideoSchema = z.object({
    prompt: z.string().trim().min(1).max(4000),
    image: z.string().optional(),
    endImage: z.string().optional(),
    referenceImages: z.array(VideoReferenceImageSchema).max(2).optional(),
    provider: z.literal('openrouter').optional().default('openrouter'),
    mode: z.enum(['generate', 'extend', 'edit']).default('generate'),
    videoUrl: z.string().url().optional(),
    duration: z.number().int().min(1).max(15).optional(),
    aspectRatio: z.string().max(20).optional(),
    resolution: z.enum(['480p', '720p', '1080p']).optional(),
    qualityMode: z.enum(['proof', 'final']).optional(),
    generateAudio: z.boolean().optional(),
    audioMode: z.enum(['silent', 'ambient', 'dialogue']).optional(),
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

export async function handleGenerateVideo(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireAdmin(req);
    const rateLimit = await enforceUserRateLimit({
        namespace: 'hosting-generate-video',
        uid: auth.uid,
        maxRequests: 4,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const payload = parseJson(req, GenerateVideoSchema);
    if (payload.mode !== 'generate') {
        throw new ApiError(400, 'OpenRouter 영상 API에서는 새 클립 생성 또는 참조 이미지 기반 생성을 사용해 주세요.');
    }
    const result = await generateOpenRouterVideo(payload);
    res.status(200).json({
        success: true,
        provider: 'openrouter',
        videoId: result.metadata.requestId,
        videoUrl: result.videoUrl,
        metadata: result.metadata,
    });
}

const StoryboardRequestSchema = z.object({
    topic: z.string().trim().min(2).max(240),
    sceneCount: z.number().int().min(1).max(12),
    aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:3', '3:4']),
    stylePreset: z.string().trim().min(1).max(80),
    format: z.enum(['brand-film', 'product-launch', 'social-short', 'editorial']).default('brand-film'),
    referenceImages: z.array(z.object({
        role: ImageReferenceRoleSchema,
        image: z.string().trim().min(1).max(1_600_000),
    })).max(4).optional(),
});

const StoryboardSceneSchema = z.object({
    title: z.string().trim().min(1).max(80),
    duration: z.string().trim().min(1).max(40),
    narrativeBeat: z.string().trim().min(1).max(280),
    shotSize: z.string().trim().min(1).max(80),
    cameraDirection: z.string().trim().max(180),
    dialogueOrCaption: StoryboardDialogueOrCaptionSchema,
    visualPrompt: z.string().trim().min(1).max(900),
    imagePrompt: z.string().trim().min(80).max(1200),
    continuityAnchor: z.string().trim().min(1).max(280),
    transition: z.string().trim().min(1).max(180),
    negativePrompt: z.string().trim().max(360),
});

const StoryboardPlanSchema = z.object({
    title: z.string().trim().min(1).max(100),
    logline: z.string().trim().max(280),
    audience: z.string().trim().max(120),
    artDirection: z.string().trim().max(320),
    characterContinuity: z.string().trim().max(320),
    settingContinuity: z.string().trim().max(320),
    colorAndLighting: z.string().trim().max(220),
    scenes: z.array(StoryboardSceneSchema).min(1).max(12),
});

const SceneRedesignInputSchema = z.object({
    title: z.string().trim().min(1).max(80),
    duration: z.string().trim().max(40).default(''),
    narrativeBeat: z.string().trim().max(280).default(''),
    shotSize: z.string().trim().max(80).default(''),
    cameraDirection: z.string().trim().max(180).default(''),
    dialogueOrCaption: StoryboardDialogueOrCaptionSchema.default(''),
    visualPrompt: z.string().trim().max(900).default(''),
    imagePrompt: z.string().trim().max(1200).default(''),
    continuityAnchor: z.string().trim().max(280).default(''),
    transition: z.string().trim().max(180).default(''),
    negativePrompt: z.string().trim().max(360).default(''),
});

const StoryboardSceneRedesignRequestSchema = z.object({
    topic: z.string().trim().min(2).max(240),
    aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:3', '3:4']),
    stylePreset: z.string().trim().min(1).max(80),
    format: z.enum(['brand-film', 'product-launch', 'social-short', 'editorial']).default('brand-film'),
    artDirection: z.string().trim().max(320).default(''),
    characterContinuity: z.string().trim().max(320).default(''),
    settingContinuity: z.string().trim().max(320).default(''),
    colorAndLighting: z.string().trim().max(220).default(''),
    scene: SceneRedesignInputSchema,
    previousScene: SceneRedesignInputSchema.optional(),
    nextScene: SceneRedesignInputSchema.optional(),
    instruction: z.string().trim().max(600).default(''),
    referenceImages: z.array(z.object({
        role: ImageReferenceRoleSchema,
        image: z.string().trim().min(1).max(1_600_000),
    })).max(4).optional(),
});

const StoryboardFlowRedesignRequestSchema = z.object({
    topic: z.string().trim().min(2).max(240),
    aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:3', '3:4']),
    stylePreset: z.string().trim().min(1).max(80),
    format: z.enum(['brand-film', 'product-launch', 'social-short', 'editorial']).default('brand-film'),
    artDirection: z.string().trim().max(320).default(''),
    characterContinuity: z.string().trim().max(320).default(''),
    settingContinuity: z.string().trim().max(320).default(''),
    colorAndLighting: z.string().trim().max(220).default(''),
    previousScene: SceneRedesignInputSchema.optional(),
    scenes: z.array(SceneRedesignInputSchema).min(1).max(12),
    nextScene: SceneRedesignInputSchema.optional(),
    instruction: z.string().trim().max(600).default(''),
    referenceImages: z.array(z.object({
        role: ImageReferenceRoleSchema,
        image: z.string().trim().min(1).max(1_600_000),
    })).max(4).optional(),
});

function extractJsonObject(value: string): unknown {
    const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI response does not contain a complete JSON object.');
    return JSON.parse(cleaned.slice(start, end + 1));
}

function parseStoryboardPlanResponse(value: string): z.infer<typeof StoryboardPlanSchema> | null {
    try {
        const parsed = StoryboardPlanSchema.safeParse(extractJsonObject(value));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function parseStoryboardSceneResponse(value: string): z.infer<typeof StoryboardSceneSchema> | null {
    try {
        const parsed = StoryboardSceneSchema.safeParse(extractJsonObject(value));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function parseStoryboardFlowResponse(value: string): { scenes: z.infer<typeof StoryboardSceneSchema>[] } | null {
    try {
        const parsed = z.object({ scenes: z.array(StoryboardSceneSchema).min(1).max(12) }).safeParse(extractJsonObject(value));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function storyboardSystemPrompt(input: z.infer<typeof StoryboardRequestSchema>): string {
    return [
        'You are an award-winning Korean commercial storyboard director and image-generation prompt designer.',
        'Turn the supplied topic into a production-ready sequence of image-generation scenes, not a generic shot list.',
        `Return exactly ${input.sceneCount} scenes in a purposeful opening-to-closing arc.`,
        `Format: ${input.format}. Compose for ${input.aspectRatio}; visual style: ${input.stylePreset}.`,
        'Before writing, silently establish one continuity bible for recurring people, products, buildings, backgrounds, palette, lighting, and lens language.',
        input.referenceImages?.length
            ? 'Inspect every attached visual reference. Its labelled role is the source of truth: preserve depicted identity, product geometry, architecture, materials, palette, and environment. Do not invent unreferenced brand marks or merge distinct subjects.'
            : 'No visual reference was attached. State practical continuity details that can be carried through all generated scenes.',
        'Every scene must show one clear, feasible visual moment. Do not create collages, conflicting actions, or repeated hero frames.',
        'Vary shot scale and composition intentionally while keeping the same subject identity, product geometry, wardrobe, environment, palette, and time-of-day coherent.',
        'narrativeBeat must explain what changes emotionally or informationally. transition must explain how this scene flows from the preceding scene; for scene one, describe its opening hook.',
        'continuityAnchor must state the exact recurring visual details this scene must preserve.',
        'visualPrompt is a concise Korean director-facing visual brief: subject, action, composition, environment, and visual priority.',
        'Write all user-facing fields in Korean. imagePrompt and negativePrompt must be English.',
        'imagePrompt must be a single, detailed English prompt including focal subject, exact action, foreground/midground/background, lens or composition, lighting, materials, and finish. Do not include labels, markdown, or conflicting instructions.',
        'negativePrompt is a compact English comma-separated exclusion list. Exclude artifacts, unwanted people/objects, and readable text unless the topic explicitly needs it.',
        'Keep imagePrompt between 120 and 900 English characters, visualPrompt under 700 Korean characters, and negativePrompt under 300 English characters.',
        'dialogueOrCaption must contain only the exact words a visible character will speak. Do not include speaker labels, action descriptions, quotation marks, narration, subtitles, or camera directions. Use an empty string when nobody speaks.',
        'Return exactly one JSON object with no markdown or explanation.',
        'Shape: {"title":"string","logline":"string","audience":"string","artDirection":"string","characterContinuity":"string","settingContinuity":"string","colorAndLighting":"string","scenes":[{"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}]}',
    ].join('\n');
}

function storyboardUserPrompt(input: z.infer<typeof StoryboardRequestSchema>): string {
    return JSON.stringify({
        topic: input.topic,
        sceneCount: input.sceneCount,
        aspectRatio: input.aspectRatio,
        stylePreset: input.stylePreset,
        format: input.format,
        referenceRoles: input.referenceImages?.map((reference, index) => ({ index: index + 1, role: reference.role })) ?? [],
    });
}

function storyboardMessages(
    input: z.infer<typeof StoryboardRequestSchema>,
    references: ParsedReference[],
    qualityIssue?: string,
) {
    const userText = qualityIssue
        ? `${storyboardUserPrompt(input)}\nQuality correction required: ${qualityIssue} Rebuild the complete plan from scratch and satisfy every JSON field exactly.`
        : storyboardUserPrompt(input);
    return [
        { role: 'system' as const, content: storyboardSystemPrompt(input) },
        {
            role: 'user' as const,
            content: references.length
                ? [
                    { type: 'text' as const, text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url' as const,
                        image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'low' as const },
                    })),
                ]
                : userText,
        },
    ];
}

function storyboardQualityIssue(
    plan: z.infer<typeof StoryboardPlanSchema> | null,
    count: number,
): string | null {
    if (!plan || plan.scenes.length !== count) return 'Scene count or response shape is invalid.';
    if (new Set(plan.scenes.map((scene) => scene.title.replace(/\s+/g, '').toLowerCase())).size !== count) {
        return 'Scene titles are duplicated.';
    }
    if (new Set(plan.scenes.map((scene) => scene.imagePrompt.replace(/\s+/g, '').toLowerCase())).size !== count) {
        return 'Image prompts are duplicated.';
    }
    if (plan.scenes.some((scene) => scene.imagePrompt.split(/\s+/).length < 18)) {
        return 'One or more image prompts are not detailed enough.';
    }
    return null;
}

function sceneRedesignContext(scene: z.infer<typeof SceneRedesignInputSchema> | undefined) {
    if (!scene) return null;
    return {
        title: scene.title,
        duration: scene.duration,
        narrativeBeat: scene.narrativeBeat,
        shotSize: scene.shotSize,
        cameraDirection: scene.cameraDirection,
        visualPrompt: scene.visualPrompt,
        imagePrompt: scene.imagePrompt,
        continuityAnchor: scene.continuityAnchor,
        transition: scene.transition,
    };
}

function storyboardSceneRedesignMessages(
    input: z.infer<typeof StoryboardSceneRedesignRequestSchema>,
    references: ParsedReference[],
    qualityIssue?: string,
) {
    const userText = JSON.stringify({
        topic: input.topic,
        frame: input.aspectRatio,
        stylePreset: input.stylePreset,
        format: input.format,
        continuityBible: {
            artDirection: input.artDirection,
            characterContinuity: input.characterContinuity,
            settingContinuity: input.settingContinuity,
            colorAndLighting: input.colorAndLighting,
        },
        previousScene: sceneRedesignContext(input.previousScene),
        currentScene: sceneRedesignContext(input.scene),
        nextScene: sceneRedesignContext(input.nextScene),
        redesignInstruction: input.instruction || 'Improve this scene with a clearer visual hierarchy and a more distinctive, feasible moment.',
        referenceRoles: input.referenceImages?.map((reference, index) => ({ index: index + 1, role: reference.role })) ?? [],
        qualityIssue,
    });
    const systemPrompt = [
        'You are a Korean commercial storyboard director revising exactly one production scene.',
        'Preserve the continuity bible and the before/after relationship with neighbouring scenes, but rebuild the current scene to satisfy the redesign instruction.',
        `Compose for ${input.aspectRatio}; visual style: ${input.stylePreset}.`,
        references.length
            ? 'Treat attached reference images as visual source-of-truth. Preserve labelled subjects, product geometry, architecture, materials, and palette. Do not merge distinct subjects or invent logos/readable text.'
            : 'Use the supplied continuity bible as the source of truth for recurring identity, setting, and lighting.',
        'Deliver one feasible, focused frame rather than a collage. State what must remain visually fixed and how it transitions to adjacent scenes.',
        'Write user-facing fields in Korean. imagePrompt and negativePrompt must be English.',
        'imagePrompt must be a detailed single image-generation prompt with subject, action, foreground/midground/background, composition or lens, lighting, material cues, and finish.',
        'negativePrompt must be compact English comma-separated exclusions.',
        'dialogueOrCaption must contain only the exact spoken words, without speaker labels, action descriptions, quotation marks, narration, subtitles, or camera directions. Use an empty string when nobody speaks.',
        'Return exactly one JSON object with no markdown or commentary.',
        'Shape: {"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}',
    ].join('\n');
    return [
        { role: 'system' as const, content: systemPrompt },
        {
            role: 'user' as const,
            content: references.length
                ? [
                    { type: 'text' as const, text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url' as const,
                        image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'low' as const },
                    })),
                ]
                : userText,
        },
    ];
}

function storyboardSceneRedesignQualityIssue(scene: z.infer<typeof StoryboardSceneSchema> | null): string | null {
    if (!scene) return 'The response must include every required scene field using the requested JSON shape.';
    if (scene.imagePrompt.trim().split(/\s+/).length < 18) return 'The imagePrompt is too sparse; add concrete composition, light, material, and environment details.';
    if (!scene.continuityAnchor.trim() || !scene.transition.trim()) return 'State a concrete continuity anchor and transition to neighbouring scenes.';
    return null;
}

export async function handleGenerateImageStoryboard(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const input = parseJson(req, StoryboardRequestSchema, '주제와 장면 수를 확인해 주세요.');
    const rateLimit = await enforceUserRateLimit({
        namespace: 'image-storyboard-plan',
        uid: auth.uid,
        maxRequests: 10,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const references = await parseStoryboardReferences(input.referenceImages ?? []);
    const options = {
        temperature: 0.38,
        maxTokens: Math.min(6800, 1350 + input.sceneCount * 560),
        responseFormat: 'json_object' as const,
    };
    const requestPlan = (qualityIssue?: string) => runOpenRouterText({
        messages: storyboardMessages(input, references, qualityIssue),
        ...options,
    });
    let result = await requestPlan();
    let plan = parseStoryboardPlanResponse(result.content);
    let issue = storyboardQualityIssue(plan, input.sceneCount);
    if (issue) {
        result = await requestPlan(issue);
        plan = parseStoryboardPlanResponse(result.content);
        issue = storyboardQualityIssue(plan, input.sceneCount);
    }
    if (!plan || issue) throw new ApiError(422, 'AI 응답 형식이 장면 설계 기준과 맞지 않았습니다. 잠시 후 다시 시도하거나 장면 수를 줄여 주세요.');
    res.status(200).json({
        success: true,
        plan,
        provider: 'openrouter',
        model: result.model,
        referenceAnalysis: references.length ? 'visual' : 'brief-only',
    });
}

export async function handleRedesignImageStoryboardScene(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const input = parseJson(req, StoryboardSceneRedesignRequestSchema, '장면 재설계 입력값을 확인해 주세요.');
    const rateLimit = await enforceUserRateLimit({
        namespace: 'image-storyboard-scene-redesign',
        uid: auth.uid,
        maxRequests: 16,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);

    const references = await parseStoryboardReferences(input.referenceImages ?? []);
    const options = { temperature: 0.4, maxTokens: 1800, responseFormat: 'json_object' as const };
    const requestScene = (qualityIssue?: string) => runOpenRouterText({
        messages: storyboardSceneRedesignMessages(input, references, qualityIssue),
        ...options,
    });
    let result = await requestScene();
    let scene = parseStoryboardSceneResponse(result.content);
    let issue = storyboardSceneRedesignQualityIssue(scene);
    if (issue) {
        result = await requestScene(issue);
        scene = parseStoryboardSceneResponse(result.content);
        issue = storyboardSceneRedesignQualityIssue(scene);
    }
    if (!scene || issue) throw new ApiError(422, 'AI 응답 형식이 장면 재설계 기준과 맞지 않았습니다. 잠시 후 다시 시도해 주세요.');
    res.status(200).json({
        success: true,
        scene,
        provider: 'openrouter',
        model: result.model,
        referenceAnalysis: references.length ? 'visual' : 'brief-only',
    });
}

function storyboardFlowContext(scene: z.infer<typeof SceneRedesignInputSchema> | undefined) {
    if (!scene) return null;
    return {
        title: scene.title,
        duration: scene.duration,
        narrativeBeat: scene.narrativeBeat,
        shotSize: scene.shotSize,
        cameraDirection: scene.cameraDirection,
        dialogueOrCaption: scene.dialogueOrCaption,
        visualPrompt: scene.visualPrompt,
        imagePrompt: scene.imagePrompt,
        continuityAnchor: scene.continuityAnchor,
        transition: scene.transition,
    };
}

function storyboardFlowMessages(
    input: z.infer<typeof StoryboardFlowRedesignRequestSchema>,
    references: ParsedReference[],
    qualityIssue?: string,
) {
    const userText = JSON.stringify({
        topic: input.topic,
        frame: input.aspectRatio,
        stylePreset: input.stylePreset,
        format: input.format,
        continuityBible: {
            artDirection: input.artDirection,
            characterContinuity: input.characterContinuity,
            settingContinuity: input.settingContinuity,
            colorAndLighting: input.colorAndLighting,
        },
        fixedPreviousScene: storyboardFlowContext(input.previousScene),
        scenesToReplan: input.scenes.map(storyboardFlowContext),
        fixedNextScene: storyboardFlowContext(input.nextScene),
        redesignInstruction: input.instruction || 'Rebuild the progression with clearer emotional escalation, purposeful dialogue placement, and natural scene-to-scene visual continuity.',
        referenceRoles: input.referenceImages?.map((reference, index) => ({ index: index + 1, role: reference.role })) ?? [],
        qualityIssue,
    });
    const systemPrompt = [
        'You are a Korean commercial storyboard director revising a consecutive sequence for AI video production.',
        `Replan exactly ${input.scenes.length} supplied scenes in the same order. Do not add, remove, merge, or change the overall premise.`,
        'The preceding and following scenes, when supplied, are fixed anchors. Preserve the continuity bible and make the sequence flow naturally between them.',
        'Each scene must be one feasible, focused shot with a distinct progression beat. Dialogue must serve the visual moment rather than repeat narration.',
        `Compose for ${input.aspectRatio} and the ${input.stylePreset} style preset.`,
        references.length
            ? 'Treat attached references as visual source of truth. Preserve labelled subjects, product geometry, architecture, materials, and palette. Do not invent logos or readable text.'
            : 'Use the supplied continuity bible as the source of truth for recurring identity, setting, and lighting.',
        'Write user-facing fields in Korean. imagePrompt and negativePrompt must be English.',
        'imagePrompt must contain subject, action, foreground/midground/background, composition or lens, lighting, material cues, and visual finish. Keep it between 120 and 900 English characters.',
        'dialogueOrCaption must contain only the exact spoken words, without speaker labels, action descriptions, quotation marks, narration, subtitles, or camera directions. Use an empty string when nobody speaks and keep spoken lines brief enough for the stated duration.',
        'Return exactly one valid JSON object without markdown or commentary using this shape:',
        '{"scenes":[{"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}]}',
    ].join('\n');
    return [
        { role: 'system' as const, content: systemPrompt },
        {
            role: 'user' as const,
            content: references.length
                ? [
                    { type: 'text' as const, text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url' as const,
                        image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'low' as const },
                    })),
                ]
                : userText,
        },
    ];
}

function storyboardFlowQualityIssue(
    flow: { scenes: z.infer<typeof StoryboardSceneSchema>[] } | null,
    count: number,
): string | null {
    if (!flow || flow.scenes.length !== count) return 'The response must return exactly the requested number of scenes using the required JSON shape.';
    if (new Set(flow.scenes.map((scene) => scene.title.replace(/\s+/g, '').toLowerCase())).size !== count) return 'Scene titles are duplicated.';
    if (new Set(flow.scenes.map((scene) => scene.imagePrompt.replace(/\s+/g, '').toLowerCase())).size !== count) return 'Each scene requires a distinct image prompt and visual moment.';
    const incomplete = flow.scenes.find((scene) => scene.imagePrompt.trim().split(/\s+/).length < 18 || !scene.continuityAnchor.trim() || !scene.transition.trim());
    return incomplete ? `${incomplete.title} needs a concrete image prompt, continuity anchor, and transition.` : null;
}

export async function handleRedesignImageStoryboardFlow(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const input = parseJson(req, StoryboardFlowRedesignRequestSchema, '흐름 재기획 입력값을 확인해 주세요. 한 번에 최대 12개 장면까지 재기획할 수 있습니다.');
    const rateLimit = await enforceUserRateLimit({
        namespace: 'image-storyboard-flow-redesign',
        uid: auth.uid,
        maxRequests: 8,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);

    const references = await parseStoryboardReferences(input.referenceImages ?? []);
    const options = {
        temperature: 0.36,
        maxTokens: Math.min(6800, 1350 + input.scenes.length * 560),
        responseFormat: 'json_object' as const,
    };
    const requestFlow = (qualityIssue?: string) => runOpenRouterText({
        messages: storyboardFlowMessages(input, references, qualityIssue),
        ...options,
    });
    let result = await requestFlow();
    let flow = parseStoryboardFlowResponse(result.content);
    let issue = storyboardFlowQualityIssue(flow, input.scenes.length);
    if (issue) {
        result = await requestFlow(issue);
        flow = parseStoryboardFlowResponse(result.content);
        issue = storyboardFlowQualityIssue(flow, input.scenes.length);
    }
    if (!flow || issue) throw new ApiError(422, 'AI 응답 형식이 장면 흐름 재설계 기준과 맞지 않았습니다. 잠시 후 다시 시도해 주세요.');
    res.status(200).json({
        success: true,
        flow,
        provider: 'openrouter',
        model: result.model,
        referenceAnalysis: references.length ? 'visual' : 'brief-only',
    });
}

const ProjectBoardRequestSchema = z.object({
    mode: z.enum(['project', 'portfolio']),
    section: z.enum(['current', 'plan', 'goal']),
    title: z.string().optional(),
    categoryName: z.string().optional(),
    owner: z.string().optional(),
    dueDate: z.string().optional(),
    stageLabel: z.string().optional(),
    statusLabel: z.string().optional(),
    summary: z.string().optional(),
    currentBody: z.string().optional(),
    planBody: z.string().optional(),
    goalBody: z.string().optional(),
    tasks: z.array(z.object({ title: z.string().optional(), done: z.boolean().optional() })).optional(),
});

const ALLOWED_HTML_TAGS = new Set([
    'article', 'section', 'header', 'div', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'strong', 'em', 'b', 'i',
    'span', 'small', 'br',
]);

function sanitizeHtml(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value
        .replace(/```(?:html)?/gi, '')
        .replace(/```/g, '')
        .replace(/<!doctype[^>]*>/gi, '')
        .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)\b[\s\S]*?<\/(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)>/gi, '')
        .replace(/<(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)\b[^>]*\/?>/gi, '')
        .replace(/<\/?([a-z][a-z0-9-]*)([^>]*)>/gi, (match, rawTag, rawAttrs) => {
            const tag = String(rawTag).toLowerCase();
            if (!ALLOWED_HTML_TAGS.has(tag)) return '';
            if (match.startsWith('</')) return `</${tag}>`;
            if (tag === 'br') return '<br>';
            const attributes = Array.from(String(rawAttrs).matchAll(/\s(rowspan|colspan)=["']?(\d{1,2})["']?/gi))
                .map(([, name, rawValue]) => {
                    if (tag !== 'td' && tag !== 'th') return '';
                    return ` ${String(name).toLowerCase()}="${Math.max(1, Math.min(8, Number(rawValue) || 1))}"`;
                })
                .join('');
            return `<${tag}${attributes}>`;
        })
        .trim();
    return cleaned || undefined;
}

function projectSourceBody(payload: z.infer<typeof ProjectBoardRequestSchema>): string {
    if (payload.section === 'current') return payload.currentBody?.trim() || '';
    if (payload.section === 'plan') return payload.planBody?.trim() || '';
    return payload.goalBody?.trim() || '';
}

export async function handleGenerateProjectBoardContent(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireAccess(req, 'projectBoardManagement');
    const payload = parseJson(req, ProjectBoardRequestSchema);
    const title = payload.title?.trim();
    const sourceBody = projectSourceBody(payload);
    if (!title) throw new ApiError(400, '프로젝트 제목을 먼저 입력하세요.');
    if (!sourceBody) throw new ApiError(400, 'HTML로 구성할 본문을 먼저 입력하세요.');
    const rateLimit = await enforceUserRateLimit({
        namespace: 'project-board-content',
        uid: auth.uid,
        maxRequests: 10,
        windowMs: 60_000,
    });
    if (!rateLimit.allowed) throw new ApiError(429, `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.`);
    const responseKey = payload.section === 'current' ? 'currentHtml' : payload.section === 'plan' ? 'planHtml' : 'goalHtml';
    const result = await runOpenRouterText({
        messages: [
            {
                role: 'system',
                content: [
                    'You are a Korean corporate HTML layout designer.',
                    'Return exactly one JSON object and only the requested section.',
                    `Response shape: {"${responseKey}":"<section>...</section>"}.`,
                    'Transform supplied source text into display-only semantic HTML without inventing facts.',
                    `Allowed tags: ${Array.from(ALLOWED_HTML_TAGS).join(', ')}.`,
                    'Do not use class, id, style, data/event attributes, links, images, forms, scripts, SVG, or external resources.',
                    'Keep Korean copy concise and professional.',
                ].join('\n'),
            },
            {
                role: 'user',
                content: JSON.stringify({ ...payload, sourceBody }, null, 2),
            },
        ],
        temperature: 0.28,
        maxTokens: 3600,
    });
    const raw = extractJsonObject(result.content);
    const record = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const html = sanitizeHtml(record[responseKey]);
    if (!html) throw new ApiError(502, 'AI가 사용할 수 있는 HTML 디자인을 반환하지 않았습니다.');
    res.status(200).json({
        success: true,
        provider: 'openrouter',
        model: result.model,
        content: { [responseKey]: html },
    });
}
