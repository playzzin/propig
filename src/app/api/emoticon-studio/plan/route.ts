import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import admin, { db as adminDb } from '@/lib/firebase-admin';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { runManagedTextChat } from '@/lib/server/managed-text-provider';
import { enforceUserRateLimit } from '@/lib/server/rate-limit';
import { requireAdminOrPermissionAuth } from '@/lib/server/admin-auth';
import { defaultImageBudgetLimit, imageDailyBudgetKey, readImageBudgetLimit } from '@/lib/server/image-budget-operations';
import {
  EmoticonAnimationPlanRequestSchema,
  EmoticonAnimationPresetSchema,
  parseEmoticonAnimationPresetJson,
  type EmoticonAnimationPlanRequest,
  type EmoticonAnimationPresetPlan,
} from '@/schemas/emoticonAnimationPreset';

export const runtime = 'nodejs';

const EMOTICON_STUDIO_IMAGE_MODEL = 'openai/gpt-image-2';
const STUDIO_IMAGE_MODEL_IDS = ['openai/gpt-image-2', 'google/gemini-3.1-flash-lite-image', 'google/gemini-3.1-flash-image', 'x-ai/grok-imagine-image-2.0'] as const;

async function getImageModelCapabilities(apiKey: string) {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch('https://openrouter.ai/api/v1/images/models', { headers: { Authorization: ['Bearer', apiKey].join(' ') }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('catalog unavailable');
    const payload = await response.json() as { data?: Array<{ id?: string; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; supported_parameters?: Record<string, unknown>; pricing?: { image?: string; prompt?: string; completion?: string } }> };
    const byId = new Map((payload.data || []).filter((item): item is NonNullable<typeof item> & { id: string } => typeof item.id === 'string').map((item) => [item.id, item]));
    return { catalogStatus: 'available' as const, checkedAt, models: STUDIO_IMAGE_MODEL_IDS.map((id) => { const model = byId.get(id); return { id, available: Boolean(model), imageOutput: Boolean(model?.architecture?.output_modalities?.includes('image')), referenceInput: Boolean(model?.architecture?.input_modalities?.includes('image') && model?.supported_parameters && 'input_references' in model.supported_parameters), pricing: model?.pricing ? { image: model.pricing.image || null, prompt: model.pricing.prompt || null, completion: model.pricing.completion || null } : null }; }) };
  } catch {
    return { catalogStatus: 'unavailable' as const, checkedAt, models: STUDIO_IMAGE_MODEL_IDS.map((id) => ({ id, available: false, imageOutput: false, referenceInput: false, pricing: null })) };
  }
}

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const auth = await requireAdminOrPermissionAuth(request, 'photoManagement');
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status, headers });
  try {
    if (request.nextUrl.searchParams.has('operationId')) {
      const parsed = z.string().uuid().safeParse(request.nextUrl.searchParams.get('operationId'));
      if (!parsed.success) return NextResponse.json({ success: false, error: '작업 ID를 확인해 주세요.' }, { status: 400, headers });
      return NextResponse.json(await readPlanOperation(auth.uid, parsed.data), { headers });
    }
    const [runtimeConfig, budget] = await Promise.all([getAIRuntimeConfig(), readStudioImageBudget(auth.uid)]);
    const imageCapabilities = runtimeConfig.openRouterApiKey ? await getImageModelCapabilities(runtimeConfig.openRouterApiKey) : { catalogStatus: 'not-configured' as const, checkedAt: new Date().toISOString(), models: [] };
    return NextResponse.json({ success: true, textModel: runtimeConfig.model, imageModel: EMOTICON_STUDIO_IMAGE_MODEL, configured: Boolean(runtimeConfig.openRouterApiKey), imageCapabilities, budget }, { headers });
  } catch {
    return NextResponse.json({ success: false, code: 'RECOVERY_UNAVAILABLE', error: '기획 작업 또는 연결 정보를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.' }, { status: 503, headers });
  }
}

async function readStudioImageBudget(uid: string) {
  try {
    return await adminDb.runTransaction(async (transaction) => {
      const limitUsd = await readImageBudgetLimit(transaction, adminDb, uid, defaultImageBudgetLimit());
      const date = new Date().toISOString().slice(0, 10);
      const snapshot = await transaction.get(adminDb.collection('aiDailyBudgets').doc(imageDailyBudgetKey(uid, date)));
      const data = snapshot.data();
      if (snapshot.exists && (!data || data.uid !== uid || data.date !== date || ![data.spentUsd, data.reservedUsd].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0))) return null;
      const spentUsd = snapshot.exists ? data!.spentUsd as number : 0;
      const reservedUsd = snapshot.exists ? data!.reservedUsd as number : 0;
      if (!Number.isFinite(spentUsd + reservedUsd)) return null;
      return { limitUsd, spentUsd, reservedUsd, remainingUsd: Math.max(0, limitUsd - spentUsd - reservedUsd) };
    });
  } catch { return null; }
}

function planSuccess(preset: EmoticonAnimationPresetPlan, metadata: Record<string, unknown>, cached: boolean) {
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
    const preset = EmoticonAnimationPresetSchema.safeParse(data.result);
    if (!preset.success) throw new Error('OPERATION_RESULT_INVALID');
    return { success: true, status: 'completed' as const, result: planSuccess(preset.data, data, true) };
  }
  const status = data.status === 'pending' || data.status === 'failed' ? data.status : 'uncertain';
  return { success: true, status };
}

function buildSystemPrompt(input: EmoticonAnimationPlanRequest, correction?: string): string {
  return [
    'You are a professional 2D character GIF animation director and image-generation prompt designer.',
    `Break the requested action into exactly ${input.frameCount} chronological keyframes. Never describe one static result image.`,
    'Use anticipation, action, impact or expression peak, follow-through, and recovery where appropriate.',
    'Every frame must connect naturally to the previous and next frame while preserving character identity, camera, scale, ground line, costume, colors, and line art.',
    `Target playback is ${input.fps} FPS. Loop is ${input.loop ? 'enabled' : 'disabled'}.`,
    `Camera: ${input.camera}. Background: ${input.background}.`,
    input.characterDescription ? `Character identity: ${input.characterDescription}.` : 'Preserve the supplied character identity exactly.',
    input.dialogue ? `Required dialogue or visible text progression: ${input.dialogue}.` : 'Use an empty dialogue when no visible text is needed.',
    'rotationDegrees is the cumulative body rotation from the first frame and may be 0 for non-rotating actions.',
    'imagePrompt must be a complete English image-generation prompt for that single frame and must state continuity with the same character reference.',
    'All other user-facing values must be Korean.',
    'Return exactly one JSON object. No markdown, code fence, HTML, commentary, or additional keys.',
    'Use this exact shape:',
    '{"name":"string","category":"string","summary":"string","dialogue":"string","fps":8,"loop":true,"loopGuide":"string","frames":[{"order":1,"phase":"string","pose":"string","expression":"string","bodyDirection":"string","rotationDegrees":0,"limbPositions":"string","dialogue":"string","effects":"string","durationMs":125,"continuityNotes":"string","imagePrompt":"string"}]}',
    correction ? `Previous output failed validation: ${correction}. Rebuild the complete object from scratch.` : '',
  ].filter(Boolean).join('\n');
}

function buildUserPrompt(input: EmoticonAnimationPlanRequest): string {
  return JSON.stringify({
    actionDescription: input.actionDescription,
    frameCount: input.frameCount,
    fps: input.fps,
    loop: input.loop,
    camera: input.camera,
    background: input.background,
    dialogue: input.dialogue,
  });
}

function operationRef(uid: string, operationId: string) {
  const id = createHash('sha256').update(`${uid}:emoticon-animation-plan:${operationId}`).digest('hex');
  return adminDb.collection('aiOperationReservations').doc(id);
}

async function reserveOperation(uid: string, operationId: string, requestFingerprint: string): Promise<ReturnType<typeof planSuccess> | null> {
  const ref = operationRef(uid, operationId);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() ?? {};
    if (snapshot.exists && (data.uid !== uid || data.operation !== 'emoticon-animation-plan' || data.operationId !== operationId)) throw new Error('OPERATION_PAYLOAD_CONFLICT');
    if (data.requestFingerprint && data.requestFingerprint !== requestFingerprint) throw new Error('OPERATION_PAYLOAD_CONFLICT');
    if (data.status === 'uncertain') throw new Error('OPERATION_UNCERTAIN');
    if (data.status === 'completed') {
      const parsed = EmoticonAnimationPresetSchema.safeParse(data.result);
      if (parsed.success) return planSuccess(parsed.data, data, true);
      throw new Error('OPERATION_UNCERTAIN');
    }
    // Elapsed time cannot prove that an earlier paid request did not run.
    if (data.status === 'pending') {
      throw new Error('OPERATION_IN_PROGRESS');
    }
    transaction.set(ref, {
      uid,
      operation: 'emoticon-animation-plan',
      operationId,
      requestFingerprint,
      status: 'pending',
      createdAt: data.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return null;
  });
}

async function finishOperation(uid: string, operationId: string, status: 'completed' | 'failed' | 'uncertain', result?: EmoticonAnimationPresetPlan, metadata?: { costUsd: number | null; modelUsed: string }) {
  await operationRef(uid, operationId).set({
    status,
    ...(result ? { result } : {}),
    ...(metadata || {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function POST(request: NextRequest) {
  let reservation: { uid: string; operationId: string } | null = null;
  let providerSubmitted = false;
  let reservationStarted = false;
  try {
    const auth = await requireAdminOrPermissionAuth(request, 'photoManagement');
    if (!auth.ok) return NextResponse.json({ success: false, code: 'REQUEST_NOT_SUBMITTED', requestSubmitted: false, error: auth.message }, { status: auth.status });

    const parsed = EmoticonAnimationPlanRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, code: 'REQUEST_NOT_SUBMITTED', requestSubmitted: false, error: '동작 설명, 프레임 수, FPS를 확인해 주세요.' }, { status: 400 });
    }
    const input = parsed.data;
    const requestFingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    reservationStarted = true;
    const cached = await reserveOperation(auth.uid, input.operationId, requestFingerprint);
    if (cached) return NextResponse.json(cached);
    reservation = { uid: auth.uid, operationId: input.operationId };

    for (const limit of [
      { namespace: 'emoticon-animation-plan-minute', maxRequests: 6, windowMs: 60_000 },
      { namespace: 'emoticon-animation-plan-day', maxRequests: 20, windowMs: 24 * 60 * 60 * 1000 },
    ]) {
      const state = await enforceUserRateLimit({ ...limit, uid: auth.uid });
      if (!state.allowed) {
        await finishOperation(auth.uid, input.operationId, 'failed');
        return NextResponse.json(
          { success: false, error: `${state.retryAfterSeconds}초 후 다시 시도해 주세요.` },
          { status: 429, headers: { 'Retry-After': String(state.retryAfterSeconds) } },
        );
      }
    }

    const runtime = await getAIRuntimeConfig();
    if (!runtime.openRouterApiKey) {
      await finishOperation(auth.uid, input.operationId, 'failed');
      return NextResponse.json({ success: false, error: 'OpenRouter 연결이 준비되지 않았습니다. 관리자 AI 설정을 확인해 주세요.' }, { status: 503 });
    }

    providerSubmitted = true;
    let result = await runManagedTextChat([
      { role: 'system', content: buildSystemPrompt(input) },
      { role: 'user', content: buildUserPrompt(input) },
    ], { temperature: 0.32, maxTokens: Math.min(7200, 1400 + input.frameCount * 420), responseFormat: 'json_object' });
    const readCost = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    let costUsd = readCost(result.response.usage?.costUsd);
    let preset: EmoticonAnimationPresetPlan | null = null;
    let correction = '';
    try {
      preset = parseEmoticonAnimationPresetJson(result.response.content);
      if (preset.frames.length !== input.frameCount) correction = `요청한 ${input.frameCount}프레임과 응답 프레임 수가 다릅니다`;
    } catch (error) {
      correction = error instanceof Error ? error.message.slice(0, 300) : 'JSON schema가 올바르지 않습니다';
    }

    if (!preset || correction) {
      result = await runManagedTextChat([
        { role: 'system', content: buildSystemPrompt(input, correction) },
        { role: 'user', content: buildUserPrompt(input) },
      ], { temperature: 0.2, maxTokens: Math.min(7200, 1400 + input.frameCount * 420), responseFormat: 'json_object' });
      const correctionCost = readCost(result.response.usage?.costUsd);
      costUsd = costUsd !== null && correctionCost !== null ? readCost(costUsd + correctionCost) : null;
      try { preset = parseEmoticonAnimationPresetJson(result.response.content); } catch { preset = null; }
    }

    if (!preset || preset.frames.length !== input.frameCount) {
      await finishOperation(auth.uid, input.operationId, 'uncertain');
      return NextResponse.json({ success: false, error: 'AI 기획 결과가 움짤 프리셋 형식과 맞지 않았습니다. 이 작업은 자동 재실행하지 않습니다.' }, { status: 422 });
    }

    const metadata = { costUsd, modelUsed: result.model };
    await finishOperation(auth.uid, input.operationId, 'completed', preset, metadata);
    return NextResponse.json(planSuccess(preset, metadata, false));
  } catch (error) {
    if (!reservationStarted) {
      return NextResponse.json({ success: false, code: 'REQUEST_NOT_SUBMITTED', requestSubmitted: false, error: '기획 요청을 전송하지 못했습니다. 입력과 연결 상태를 확인해 주세요.' }, { status: error instanceof SyntaxError ? 400 : 503 });
    }
    if (reservation) await finishOperation(reservation.uid, reservation.operationId, providerSubmitted ? 'uncertain' : 'failed').catch(() => undefined);
    if (error instanceof Error && error.message === 'OPERATION_IN_PROGRESS') {
      return NextResponse.json({ success: false, error: '같은 기획 요청이 처리 중입니다. 잠시 후 다시 확인해 주세요.' }, { status: 409 });
    }
    if (error instanceof Error && (error.message === 'OPERATION_PAYLOAD_CONFLICT' || error.message === 'OPERATION_UNCERTAIN')) {
      return NextResponse.json({ success: false, error: error.message === 'OPERATION_UNCERTAIN' ? '이전 기획 요청의 비용 상태를 확인 중입니다. 자동 재실행하지 않습니다.' : '같은 작업 ID에 다른 요청을 사용할 수 없습니다.' }, { status: 409 });
    }
    console.error('[EmoticonAnimationPlan] failed:', error);
    return NextResponse.json({ success: false, error: 'OpenRouter 장면 기획을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
  }
}
