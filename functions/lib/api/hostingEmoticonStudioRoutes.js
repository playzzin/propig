"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEmoticonAnimationPlan = handleEmoticonAnimationPlan;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const zod_1 = require("zod");
const hostingCommon_1 = require("./hostingCommon");
const security_1 = require("./security");
const hostingAiRuntime_1 = require("./hostingAiRuntime");
const EMOTICON_STUDIO_IMAGE_MODEL = 'openai/gpt-image-2';
const STUDIO_IMAGE_MODEL_IDS = ['openai/gpt-image-2', 'google/gemini-3.1-flash-lite-image', 'google/gemini-3.1-flash-image', 'x-ai/grok-imagine-image-2.0'];
async function getImageModelCapabilities(apiKey) {
    const checkedAt = new Date().toISOString();
    try {
        const response = await fetch('https://openrouter.ai/api/v1/images/models', { headers: { Authorization: ['Bearer', apiKey].join(' ') }, signal: AbortSignal.timeout(15000) });
        if (!response.ok)
            throw new Error('catalog unavailable');
        const payload = await response.json();
        const byId = new Map((payload.data || []).filter((item) => typeof item.id === 'string').map((item) => [item.id, item]));
        return { catalogStatus: 'available', checkedAt, models: STUDIO_IMAGE_MODEL_IDS.map((id) => { var _a, _b, _c, _d; const model = byId.get(id); return { id, available: Boolean(model), imageOutput: Boolean((_b = (_a = model === null || model === void 0 ? void 0 : model.architecture) === null || _a === void 0 ? void 0 : _a.output_modalities) === null || _b === void 0 ? void 0 : _b.includes('image')), referenceInput: Boolean(((_d = (_c = model === null || model === void 0 ? void 0 : model.architecture) === null || _c === void 0 ? void 0 : _c.input_modalities) === null || _d === void 0 ? void 0 : _d.includes('image')) && (model === null || model === void 0 ? void 0 : model.supported_parameters) && 'input_references' in model.supported_parameters), pricing: (model === null || model === void 0 ? void 0 : model.pricing) ? { image: model.pricing.image || null, prompt: model.pricing.prompt || null, completion: model.pricing.completion || null } : null }; }) };
    }
    catch (_a) {
        return { catalogStatus: 'unavailable', checkedAt, models: STUDIO_IMAGE_MODEL_IDS.map((id) => ({ id, available: false, imageOutput: false, referenceInput: false, pricing: null })) };
    }
}
const FrameSchema = zod_1.z.object({
    order: zod_1.z.number().int().min(1).max(16),
    phase: zod_1.z.string().trim().min(1).max(80),
    pose: zod_1.z.string().trim().min(10).max(700),
    expression: zod_1.z.string().trim().max(160).default(''),
    bodyDirection: zod_1.z.string().trim().max(160).default(''),
    rotationDegrees: zod_1.z.number().min(-1080).max(1080).default(0),
    limbPositions: zod_1.z.string().trim().max(400).default(''),
    dialogue: zod_1.z.string().trim().max(60).default(''),
    effects: zod_1.z.string().trim().max(240).default(''),
    durationMs: zod_1.z.number().int().min(60).max(3000),
    continuityNotes: zod_1.z.string().trim().min(1).max(400),
    imagePrompt: zod_1.z.string().trim().min(40).max(1800),
}).strict();
const PresetSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(80),
    category: zod_1.z.string().trim().min(1).max(40).default('사용자 연출'),
    summary: zod_1.z.string().trim().min(10).max(700),
    dialogue: zod_1.z.string().trim().max(120).default(''),
    fps: zod_1.z.number().int().min(1).max(24),
    loop: zod_1.z.boolean(),
    loopGuide: zod_1.z.string().trim().min(1).max(400),
    frames: zod_1.z.array(FrameSchema).min(2).max(16),
}).strict().superRefine((preset, context) => {
    const sorted = [...preset.frames].sort((a, b) => a.order - b.order);
    if (sorted.some((frame, index) => frame.order !== index + 1)) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['frames'], message: '프레임 순서는 1부터 빠짐없이 이어져야 합니다.' });
    }
    if (preset.frames.reduce((total, frame) => total + frame.durationMs, 0) > 20000) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['frames'], message: '전체 재생 시간은 20초 이하여야 합니다.' });
    }
});
const RequestSchema = zod_1.z.object({
    operationId: zod_1.z.string().uuid(),
    consentFingerprint: zod_1.z.string().trim().min(8).max(128),
    actionDescription: zod_1.z.string().trim().min(2).max(600),
    characterDescription: zod_1.z.string().trim().max(800).default(''),
    frameCount: zod_1.z.number().int().min(2).max(16),
    fps: zod_1.z.number().int().min(1).max(24).default(8),
    loop: zod_1.z.boolean().default(true),
    camera: zod_1.z.string().trim().max(200).default('고정 카메라, 전신이 잘리지 않는 정면 중심 구도'),
    background: zod_1.z.string().trim().max(200).default('투명 또는 단순한 단색 배경'),
    dialogue: zod_1.z.string().trim().max(120).default(''),
}).strict();
const OPERATION_TTL_MS = 10 * 60 * 1000;
function systemPrompt(input, correction = '') {
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
function parsePreset(value) {
    var _a, _b;
    try {
        const trimmed = value.trim();
        const fenced = (_b = (_a = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : trimmed;
        const raw = JSON.parse(fenced);
        const forbidden = (entry) => Boolean(entry && typeof entry === 'object' && (Array.isArray(entry)
            ? entry.some(forbidden)
            : Object.keys(entry).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key) || forbidden(entry[key]))));
        if (forbidden(raw))
            return null;
        const parsed = PresetSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
    }
    catch (_c) {
        return null;
    }
}
function operationRef(uid, operationId) {
    const id = (0, node_crypto_1.createHash)('sha256').update(`${uid}:emoticon-animation-plan:${operationId}`).digest('hex');
    return hostingCommon_1.db.collection('aiOperationReservations').doc(id);
}
async function reserve(uid, operationId, requestFingerprint) {
    const ref = operationRef(uid, operationId);
    return hostingCommon_1.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data() || {};
        if (data.requestFingerprint && data.requestFingerprint !== requestFingerprint)
            throw new hostingCommon_1.ApiError(409, '같은 작업 ID에 다른 요청을 사용할 수 없습니다.');
        if (data.status === 'uncertain')
            throw new hostingCommon_1.ApiError(409, '이전 기획 요청의 비용 상태를 확인 중입니다. 자동 재실행하지 않습니다.');
        if (data.status === 'completed') {
            const parsed = PresetSchema.safeParse(data.result);
            if (parsed.success)
                return parsed.data;
        }
        const updatedAt = data.updatedAt instanceof admin.firestore.Timestamp ? data.updatedAt.toMillis() : 0;
        if (data.status === 'pending' && Date.now() - updatedAt < OPERATION_TTL_MS)
            throw new hostingCommon_1.ApiError(409, '같은 기획 요청이 처리 중입니다.');
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
async function finish(uid, operationId, status, result) {
    await operationRef(uid, operationId).set(Object.assign(Object.assign({ status }, (result ? { result } : {})), { updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
}
async function handleEmoticonAnimationPlan(req, res) {
    if (req.method === 'GET') {
        await (0, hostingCommon_1.requireAccess)(req, 'photoManagement');
        const runtime = await (0, hostingAiRuntime_1.getHostingAiRuntime)();
        const imageCapabilities = runtime.openRouterApiKey ? await getImageModelCapabilities(runtime.openRouterApiKey) : { catalogStatus: 'not-configured', checkedAt: new Date().toISOString(), models: [] };
        res.status(200).json({ success: true, textModel: runtime.model, imageModel: EMOTICON_STUDIO_IMAGE_MODEL, configured: Boolean(runtime.openRouterApiKey), imageCapabilities });
        return;
    }
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireAccess)(req, 'photoManagement');
    const input = (0, hostingCommon_1.parseJson)(req, RequestSchema, '동작 설명, 프레임 수, FPS를 확인해 주세요.');
    const requestFingerprint = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(input)).digest('hex');
    let cached;
    try {
        cached = await reserve(auth.uid, input.operationId, requestFingerprint);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'OPERATION_IN_PROGRESS')
            throw new hostingCommon_1.ApiError(409, '같은 기획 요청이 처리 중입니다.');
        throw error;
    }
    if (cached) {
        res.status(200).json({ success: true, preset: cached, cached: true });
        return;
    }
    let providerSubmitted = false;
    try {
        for (const limit of [
            { namespace: 'emoticon-animation-plan-minute', maxRequests: 6, windowMs: 60000 },
            { namespace: 'emoticon-animation-plan-day', maxRequests: 20, windowMs: 24 * 60 * 60 * 1000 },
        ]) {
            const state = await (0, security_1.enforceUserRateLimit)(Object.assign(Object.assign({}, limit), { uid: auth.uid }));
            if ('retryAfterSeconds' in state) {
                res.set('Retry-After', String(state.retryAfterSeconds));
                throw new hostingCommon_1.ApiError(429, `${state.retryAfterSeconds}초 후 다시 시도해 주세요.`);
            }
        }
        const requestPlan = (correction = '') => (0, hostingAiRuntime_1.runOpenRouterText)({
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
        let preset = parsePreset(result.content);
        if (!preset || preset.frames.length !== input.frameCount) {
            result = await requestPlan(`요청한 ${input.frameCount}프레임과 JSON schema를 정확히 맞추세요`);
            preset = parsePreset(result.content);
        }
        if (!preset || preset.frames.length !== input.frameCount)
            throw new hostingCommon_1.ApiError(422, 'AI 기획 결과가 움짤 프리셋 형식과 맞지 않았습니다.');
        await finish(auth.uid, input.operationId, 'completed', preset);
        res.status(200).json({ success: true, preset, provider: 'openrouter', model: result.model, cached: false });
    }
    catch (error) {
        await finish(auth.uid, input.operationId, providerSubmitted ? 'uncertain' : 'failed').catch(() => undefined);
        throw error;
    }
}
//# sourceMappingURL=hostingEmoticonStudioRoutes.js.map