import { createHash } from 'node:crypto';
import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiError, db, parseJson, requireAccess, requireMethod } from './hostingCommon';
import { enforceUserRateLimit } from './security';
import { getHostingAiRuntime, runOpenRouterText } from './hostingAiRuntime';
import { defaultImageBudgetLimit, imageDailyBudgetKey, readImageBudgetLimit } from './imageBudgetOperations';

const EMOTICON_STUDIO_IMAGE_MODEL = 'openai/gpt-image-2';
const STUDIO_IMAGE_MODEL_IDS = ['openai/gpt-image-2', 'google/gemini-3.1-flash-lite-image', 'google/gemini-3.1-flash-image', 'x-ai/grok-imagine-image-2.0'] as const;

async function getImageModelCapabilities(apiKey: string) {
    const checkedAt = new Date().toISOString();
    try {
        const response = await fetch('https://openrouter.ai/api/v1/images/models', { headers: { Authorization: ['Bearer', apiKey].join(' ') }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error('catalog unavailable');
        const payload = await response.json() as { data?: Array<{ id?: string; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; supported_parameters?: Record<string, unknown>; pricing?: { image?: string; prompt?: string; completion?: string } }> };
        const byId = new Map((payload.data || []).filter((item): item is NonNullable<typeof item> & { id: string } => typeof item.id === 'string').map((item) => [item.id, item]));
        return { catalogStatus: 'available', checkedAt, models: STUDIO_IMAGE_MODEL_IDS.map((id) => { const model = byId.get(id); return { id, available: Boolean(model), imageOutput: Boolean(model?.architecture?.output_modalities?.includes('image')), referenceInput: Boolean(model?.architecture?.input_modalities?.includes('image') && model?.supported_parameters && 'input_references' in model.supported_parameters), pricing: model?.pricing ? { image: model.pricing.image || null, prompt: model.pricing.prompt || null, completion: model.pricing.completion || null } : null }; }) };
    } catch {
        return { catalogStatus: 'unavailable', checkedAt, models: STUDIO_IMAGE_MODEL_IDS.map((id) => ({ id, available: false, imageOutput: false, referenceInput: false, pricing: null })) };
    }
}

const FrameSchema = z.object({
    order: z.number().int().min(1).max(16),
    phase: z.string().trim().min(1).max(80),
    pose: z.string().trim().min(10).max(700),
    expression: z.string().trim().max(160).default(''),
    bodyDirection: z.string().trim().max(160).default(''),
    rotationDegrees: z.number().min(-1080).max(1080).default(0),
    limbPositions: z.string().trim().max(400).default(''),
    dialogue: z.string().trim().max(60).default(''),
    effects: z.string().trim().max(240).default(''),
    durationMs: z.number().int().min(60).max(3000),
    continuityNotes: z.string().trim().min(1).max(400),
    imagePrompt: z.string().trim().min(40).max(1800),
}).strict();

const PresetSchema = z.object({
    name: z.string().trim().min(1).max(80),
    category: z.string().trim().min(1).max(40).default('사용자 연출'),
    summary: z.string().trim().min(10).max(700),
    dialogue: z.string().trim().max(120).default(''),
    fps: z.number().int().min(1).max(24),
    loop: z.boolean(),
    loopGuide: z.string().trim().min(1).max(400),
    frames: z.array(FrameSchema).min(2).max(16),
}).strict().superRefine((preset, context) => {
    const sorted = [...preset.frames].sort((a, b) => a.order - b.order);
    if (sorted.some((frame, index) => frame.order !== index + 1)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['frames'], message: '프레임 순서는 1부터 빠짐없이 이어져야 합니다.' });
    }
    if (preset.frames.reduce((total, frame) => total + frame.durationMs, 0) > 20_000) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['frames'], message: '전체 재생 시간은 20초 이하여야 합니다.' });
    }
});

const RequestSchema = z.object({
    operationId: z.string().uuid(),
    consentFingerprint: z.string().trim().min(8).max(128),
    actionDescription: z.string().trim().min(2).max(600),
    characterDescription: z.string().trim().max(800).default(''),
    frameCount: z.number().int().min(2).max(16),
    fps: z.number().int().min(1).max(24).default(8),
    loop: z.boolean().default(true),
    camera: z.string().trim().max(200).default('고정 카메라, 전신이 잘리지 않는 정면 중심 구도'),
    background: z.string().trim().max(200).default('투명 또는 단순한 단색 배경'),
    dialogue: z.string().trim().max(120).default(''),
}).strict();

type PlanInput = z.infer<typeof RequestSchema>;
type Preset = z.infer<typeof PresetSchema>;

async function readStudioImageBudget(uid: string) {
  try {
    return await db.runTransaction(async (transaction) => {
      const limitUsd = await readImageBudgetLimit(transaction, db, uid, defaultImageBudgetLimit());
      const date = new Date().toISOString().slice(0, 10);
      const snapshot = await transaction.get(db.collection('aiDailyBudgets').doc(imageDailyBudgetKey(uid, date)));
      const data = snapshot.data();
      if (snapshot.exists && (!data || data.uid !== uid || data.date !== date || ![data.spentUsd, data.reservedUsd].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0))) return null;
      const spentUsd = snapshot.exists ? data!.spentUsd as number : 0;
      const reservedUsd = snapshot.exists ? data!.reservedUsd as number : 0;
      if (!Number.isFinite(spentUsd + reservedUsd)) return null;
      return { limitUsd, spentUsd, reservedUsd, remainingUsd: Math.max(0, limitUsd - spentUsd - reservedUsd) };
    });
  } catch { return null; }
}

function planSuccess(preset: Preset, metadata: Record<string, unknown>, cached: boolean) {
  const costUsd = typeof metadata.costUsd === 'number' && Number.isFinite(metadata.costUsd) && metadata.costUsd >= 0 ? metadata.costUsd : null;
  const modelUsed = typeof metadata.modelUsed === 'string' ? metadata.modelUsed : null;
  return { success: true as const, preset, provider: 'openrouter', model: modelUsed, modelUsed, costUsd, cached };
}

async function readPlanOperation(uid: string, operationId: string) {
  const snapshot = await operationRef(uid, operationId).get();
  if (!snapshot.exists) return { success: true, status: 'not-found' as const };
  const data = snapshot.data() || {};
  if (data.uid !== uid || data.operation !== 'emoticon-animation-plan' || data.operationId !== operationId) throw new Error('OPERATION_IDENTITY_CONFLICT');
  if (data.status === 'completed') {
    const preset = PresetSchema.safeParse(data.result);
    if (!preset.success) throw new Error('OPERATION_RESULT_INVALID');
    return { success: true, status: 'completed' as const, result: planSuccess(preset.data, data, true) };
  }
  const status = data.status === 'pending' || data.status === 'failed' ? data.status : 'uncertain';
  return { success: true, status };
}

function systemPrompt(input: PlanInput, correction = ''): string {
    return [
        'You are a professional 2D character GIF animation director and image-generation prompt designer.',
        `Break the requested action into exactly ${input.frameCount} chronological keyframes. Never describe one static result image.`,
        'Use anticipation, action, impact or expression peak, follow-through, and recovery where appropriate.',
        'Every frame must connect naturally while preserving character identity, camera, scale, ground line, costume, colors, and line art.',
        `Target ${input.fps} FPS. Loop ${input.loop ? 'enabled' : 'disabled'}. Camera: ${input.camera}. Background: ${input.background}.`,
        input.characterDescription ? `Character identity: ${input.characterDescription}.` : 'Preserve the supplied character identity exactly.',
        input.dialogue ? `Required dialogue progression: ${input.dialogue}.` : 'Use empty dialogue when no text is needed.',
        'rotationDegrees is cumulative body rotation from frame one. imagePrompt is a complete English prompt for one frame and states same character reference continuity.',
        'All other user-facing values are Korean. Return one JSON object only, no markdown or additional keys.',
        '{"name":"string","category":"string","summary":"string","dialogue":"string","fps":8,"loop":true,"loopGuide":"string","frames":[{"order":1,"phase":"string","pose":"string","expression":"string","bodyDirection":"string","rotationDegrees":0,"limbPositions":"string","dialogue":"string","effects":"string","durationMs":125,"continuityNotes":"string","imagePrompt":"string"}]}',
        correction ? `Previous output failed: ${correction}. Rebuild the complete object.` : '',
    ].filter(Boolean).join('\n');
}

function parsePreset(value: string): Preset | null {
    try {
        const trimmed = value.trim();
        const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
        const raw: unknown = JSON.parse(fenced);
        const forbidden = (entry: unknown): boolean => Boolean(entry && typeof entry === 'object' && (Array.isArray(entry)
            ? entry.some(forbidden)
            : Object.keys(entry).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key) || forbidden((entry as Record<string, unknown>)[key]))));
        if (forbidden(raw)) return null;
        const parsed = PresetSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function operationRef(uid: string, operationId: string) {
    const id = createHash('sha256').update(`${uid}:emoticon-animation-plan:${operationId}`).digest('hex');
    return db.collection('aiOperationReservations').doc(id);
}

async function reserve(uid: string, operationId: string, requestFingerprint: string): Promise<ReturnType<typeof planSuccess> | null> {
    const ref = operationRef(uid, operationId);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data() || {};
        if (snapshot.exists && (data.uid !== uid || data.operation !== 'emoticon-animation-plan' || data.operationId !== operationId)) throw new ApiError(409, '기획 작업의 소유 정보를 확인할 수 없습니다.');
        if (data.requestFingerprint && data.requestFingerprint !== requestFingerprint) throw new ApiError(409, '같은 작업 ID에 다른 요청을 사용할 수 없습니다.');
        if (data.status === 'uncertain') throw new ApiError(409, '이전 기획 요청의 비용 상태를 확인 중입니다. 자동 재실행하지 않습니다.');
        if (data.status === 'completed') {
            const parsed = PresetSchema.safeParse(data.result);
            if (parsed.success) return planSuccess(parsed.data, data, true);
            throw new ApiError(409, '완료된 기획 결과를 확인해야 합니다. 자동 재실행하지 않습니다.');
        }
        // Elapsed time cannot prove that an earlier paid request did not run.
        if (data.status === 'pending') throw new ApiError(409, '같은 기획 요청이 처리 중입니다.');
        transaction.set(ref, {
            uid,
            operation: 'emoticon-animation-plan',
            operationId,
            requestFingerprint,
            status: 'pending',
            createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return null;
    });
}

async function finish(uid: string, operationId: string, status: 'completed' | 'failed' | 'uncertain', result?: Preset, metadata?: { costUsd: number | null; modelUsed: string }) {
    await operationRef(uid, operationId).set({ status, ...(result ? { result } : {}), ...(metadata || {}), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

export async function handleEmoticonAnimationPlan(req: Request, res: Response): Promise<void> {
    if (req.method === 'GET') {
        res.set('Cache-Control', 'private, no-store');
        const auth = await requireAccess(req, 'photoManagement');
        if (Object.prototype.hasOwnProperty.call(req.query, 'operationId')) {
            const parsed = z.string().uuid().safeParse(req.query.operationId);
            if (!parsed.success) throw new ApiError(400, '작업 ID를 확인해 주세요.');
            try { res.status(200).json(await readPlanOperation(auth.uid, parsed.data)); }
            catch { res.status(503).json({ success: false, code: 'RECOVERY_UNAVAILABLE', error: '기획 작업 결과를 확인하지 못했습니다. 새로 생성하지 말고 잠시 후 다시 확인해 주세요.' }); }
            return;
        }
        const [runtime, budget] = await Promise.all([getHostingAiRuntime(), readStudioImageBudget(auth.uid)]);
        const imageCapabilities = runtime.openRouterApiKey ? await getImageModelCapabilities(runtime.openRouterApiKey) : { catalogStatus: 'not-configured', checkedAt: new Date().toISOString(), models: [] };
        res.status(200).json({ success: true, textModel: runtime.model, imageModel: EMOTICON_STUDIO_IMAGE_MODEL, configured: Boolean(runtime.openRouterApiKey), imageCapabilities, budget });
        return;
    }
    requireMethod(req, 'POST');
    let auth: Awaited<ReturnType<typeof requireAccess>>;
    let input: PlanInput;
    try {
        auth = await requireAccess(req, 'photoManagement');
        input = parseJson(req, RequestSchema, '동작 설명, 프레임 수, FPS를 확인해 주세요.');
    } catch (error) {
        res.status(error instanceof ApiError ? error.status : 503).json({ success: false, code: 'REQUEST_NOT_SUBMITTED', requestSubmitted: false, error: error instanceof ApiError ? error.message : '기획 요청을 전송하지 못했습니다. 입력과 연결 상태를 확인해 주세요.' });
        return;
    }
    const requestFingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    let cached: ReturnType<typeof planSuccess> | null;
    try {
        cached = await reserve(auth.uid, input.operationId, requestFingerprint);
    } catch (error) {
        if (error instanceof Error && error.message === 'OPERATION_IN_PROGRESS') throw new ApiError(409, '같은 기획 요청이 처리 중입니다.');
        throw error;
    }
    if (cached) {
        res.status(200).json(cached);
        return;
    }
    let providerSubmitted = false;
    try {
        for (const limit of [
            { namespace: 'emoticon-animation-plan-minute', maxRequests: 6, windowMs: 60_000 },
            { namespace: 'emoticon-animation-plan-day', maxRequests: 20, windowMs: 24 * 60 * 60 * 1000 },
        ]) {
            const state = await enforceUserRateLimit({ ...limit, uid: auth.uid });
            if ('retryAfterSeconds' in state) {
                res.set('Retry-After', String(state.retryAfterSeconds));
                throw new ApiError(429, `${state.retryAfterSeconds}초 후 다시 시도해 주세요.`);
            }
        }
        const requestPlan = (correction = '') => runOpenRouterText({
            messages: [
                { role: 'system', content: systemPrompt(input, correction) },
                { role: 'user', content: JSON.stringify({ actionDescription: input.actionDescription, frameCount: input.frameCount, fps: input.fps, loop: input.loop, dialogue: input.dialogue }) },
            ],
            temperature: correction ? 0.2 : 0.32,
            maxTokens: Math.min(7200, 1400 + input.frameCount * 420),
            responseFormat: 'json_object',
        });
        providerSubmitted = true;
        let result = await requestPlan();
        const readCost = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
        let costUsd = readCost(result.usage?.cost);
        let preset = parsePreset(result.content);
        if (!preset || preset.frames.length !== input.frameCount) {
            result = await requestPlan(`요청한 ${input.frameCount}프레임과 JSON schema를 정확히 맞추세요`);
            const correctionCost = readCost(result.usage?.cost);
            costUsd = costUsd !== null && correctionCost !== null ? readCost(costUsd + correctionCost) : null;
            preset = parsePreset(result.content);
        }
        if (!preset || preset.frames.length !== input.frameCount) throw new ApiError(422, 'AI 기획 결과가 움짤 프리셋 형식과 맞지 않았습니다.');
        const metadata = { costUsd, modelUsed: result.model };
        await finish(auth.uid, input.operationId, 'completed', preset, metadata);
        res.status(200).json(planSuccess(preset, metadata, false));
    } catch (error) {
        await finish(auth.uid, input.operationId, providerSubmitted ? 'uncertain' : 'failed').catch(() => undefined);
        throw error;
    }
}
