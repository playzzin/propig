"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILT_IN_MANAGED_PAGES = exports.DEFAULT_OPENROUTER_IMAGE_MODEL = exports.DEFAULT_OPENROUTER_MODEL = void 0;
exports.mergeManagedPages = mergeManagedPages;
exports.maskApiKey = maskApiKey;
exports.getHostingAiRuntime = getHostingAiRuntime;
exports.runOpenRouterText = runOpenRouterText;
const admin = require("firebase-admin");
const hostingCommon_1 = require("./hostingCommon");
exports.DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4.1-mini';
exports.DEFAULT_OPENROUTER_IMAGE_MODEL = 'openai/gpt-image-1';
const RETIRED_MANAGED_PAGE_TARGETS = new Set([
    'mandalart-generate',
    '/mandalart',
    '/api/generate-mandalart',
    '/admin/image-generator',
]);
exports.BUILT_IN_MANAGED_PAGES = [
    {
        id: 'bookmarks-analyze',
        name: '스마트 북마크 분석',
        pagePath: '/bookmarks',
        apiPath: '/api/analyze-bookmark',
        method: 'POST',
        enabled: true,
        type: 'text',
        description: '북마크 URL 분석 및 카테고리·태그 추출',
        testPayload: {
            url: 'https://example.com',
            categories: ['업무', '학습', '개인', '참고'],
            detailed: false,
            requireAI: true,
        },
        builtIn: true,
    },
    {
        id: 'youtube-analyze',
        name: 'YouTube 분석',
        pagePath: '/youtube-analyze',
        apiPath: '/api/analyze-bookmark',
        method: 'POST',
        enabled: true,
        type: 'text',
        description: 'YouTube 영상·채널 요약 분석',
        testPayload: {
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            categories: ['업무', '학습', '개인', '참고'],
            detailed: false,
            requireAI: true,
            targetType: 'video',
        },
        builtIn: true,
    },
    {
        id: 'image-generate',
        name: '스토리보드 이미지 생성',
        pagePath: '/admin/storyboard',
        apiPath: '/api/generate-image',
        method: 'POST',
        enabled: true,
        type: 'image',
        description: 'OpenRouter 기반 이미지 생성',
        testPayload: {
            prompt: 'Premium Korean corporate project board cover, modern planning workspace, no readable text',
            width: 1536,
            height: 864,
            aspectRatio: '16:9',
            stylePreset: 'project-board',
            numberOfImages: 1,
            provider: 'openrouter',
        },
        builtIn: true,
    },
];
function asString(value) {
    return typeof value === 'string' ? value : '';
}
function isRetiredManagedPage(value) {
    if (!(0, hostingCommon_1.isRecord)(value))
        return false;
    return [value.id, value.pagePath, value.apiPath].some((target) => typeof target === 'string' && RETIRED_MANAGED_PAGE_TARGETS.has(target));
}
function normalizePage(raw, fallback) {
    const source = (0, hostingCommon_1.isRecord)(raw) ? raw : {};
    const overridePayload = (0, hostingCommon_1.isRecord)(source.testPayload) ? source.testPayload : null;
    return {
        id: asString(source.id) || fallback.id,
        name: asString(source.name) || fallback.name,
        pagePath: asString(source.pagePath) || fallback.pagePath,
        apiPath: asString(source.apiPath) || fallback.apiPath,
        method: source.method === 'GET' ? 'GET' : fallback.method,
        enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
        type: source.type === 'image' || source.type === 'custom' ? source.type : fallback.type,
        description: asString(source.description) || fallback.description,
        testPayload: overridePayload
            ? Object.assign(Object.assign({}, (fallback.testPayload || {})), overridePayload) : fallback.testPayload,
        builtIn: typeof source.builtIn === 'boolean' ? source.builtIn : fallback.builtIn,
    };
}
function mergeManagedPages(value) {
    const rawList = Array.isArray(value) ? value.filter((item) => !isRetiredManagedPage(item)) : [];
    const builtInIds = new Set(exports.BUILT_IN_MANAGED_PAGES.map((page) => page.id));
    const builtIns = exports.BUILT_IN_MANAGED_PAGES.map((page) => {
        const override = rawList.find((item) => (0, hostingCommon_1.isRecord)(item) && item.id === page.id);
        return normalizePage(override, page);
    });
    const custom = rawList
        .filter((item) => (0, hostingCommon_1.isRecord)(item) && typeof item.id === 'string' && item.id && !builtInIds.has(item.id))
        .map((item, index) => normalizePage(item, {
        id: asString(item.id) || `custom-${index}`,
        name: asString(item.name) || `사용자 정의 API ${index + 1}`,
        pagePath: asString(item.pagePath) || '/custom',
        apiPath: asString(item.apiPath) || '/api/custom',
        method: item.method === 'GET' ? 'GET' : 'POST',
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
        type: item.type === 'image' || item.type === 'text' ? item.type : 'custom',
        description: asString(item.description) || '사용자 정의 API 연동',
        testPayload: (0, hostingCommon_1.isRecord)(item.testPayload) ? item.testPayload : {},
        builtIn: false,
    }));
    return [...builtIns, ...custom];
}
function maskApiKey(value) {
    const key = value.trim();
    if (!key)
        return '';
    if (key.length <= 8)
        return '********';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
async function getHostingAiRuntime() {
    const snapshot = await hostingCommon_1.db.collection('system_settings').doc('ai').get();
    const stored = snapshot.exists ? snapshot.data() || {} : {};
    const envFallbacks = (process.env.OPENROUTER_FALLBACK_MODELS || '')
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean);
    const model = asString(stored.model).trim() || (process.env.OPENROUTER_MODEL || '').trim() || exports.DEFAULT_OPENROUTER_MODEL;
    const imageModel = asString(stored.imageModel).trim() || (process.env.OPENROUTER_IMAGE_MODEL || '').trim() || exports.DEFAULT_OPENROUTER_IMAGE_MODEL;
    const storedFallbacks = Array.isArray(stored.fallbackModels)
        ? stored.fallbackModels.filter((item) => typeof item === 'string')
        : envFallbacks;
    const fallbackModels = Array.from(new Set(storedFallbacks.map((item) => item.trim()).filter((item) => item && item !== model))).slice(0, 3);
    const updatedAt = stored.updatedAt instanceof admin.firestore.Timestamp
        ? stored.updatedAt.toDate().toISOString()
        : null;
    const configuredApiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    return {
        source: snapshot.exists ? 'firebase-functions-secret+firestore' : 'firebase-functions-secret',
        openRouterApiKey: configuredApiKey,
        model,
        imageModel,
        fallbackModels,
        managedPages: mergeManagedPages(stored.managedPages),
        updatedAt,
        updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : null,
    };
}
async function runOpenRouterText(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const runtime = await getHostingAiRuntime();
    if (!runtime.openRouterApiKey) {
        throw new Error('OPENROUTER_API_KEY is not configured.');
    }
    const model = input.model || runtime.model;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${runtime.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'X-OpenRouter-Title': 'ProPig Firebase Functions',
        },
        body: JSON.stringify(Object.assign(Object.assign(Object.assign(Object.assign({ model }, (runtime.fallbackModels.length
            ? { models: runtime.fallbackModels.filter((item) => item !== model) }
            : {})), { messages: input.messages, temperature: (_a = input.temperature) !== null && _a !== void 0 ? _a : 0.7, max_tokens: (_b = input.maxTokens) !== null && _b !== void 0 ? _b : 2000 }), (input.responseFormat
            ? { response_format: { type: input.responseFormat } }
            : {})), { stream: false })),
    });
    const raw = await response.text();
    let payload = {};
    try {
        payload = JSON.parse(raw);
    }
    catch (_l) {
        // The safe provider error below handles non-JSON responses.
    }
    if (!response.ok)
        throw new Error(((_c = payload.error) === null || _c === void 0 ? void 0 : _c.message) || raw.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
    const content = ((_f = (_e = (_d = payload.choices) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message) === null || _f === void 0 ? void 0 : _f.content) || '';
    if (!content.trim())
        throw new Error('OpenRouter returned an empty response.');
    const { recordOpenRouterUsage } = await Promise.resolve().then(() => require('../openrouterUsage'));
    await recordOpenRouterUsage({
        operation: 'text',
        model: payload.model || model,
        promptTokens: (_g = payload.usage) === null || _g === void 0 ? void 0 : _g.prompt_tokens,
        completionTokens: (_h = payload.usage) === null || _h === void 0 ? void 0 : _h.completion_tokens,
        totalTokens: (_j = payload.usage) === null || _j === void 0 ? void 0 : _j.total_tokens,
        costUsd: (_k = payload.usage) === null || _k === void 0 ? void 0 : _k.cost,
        providerSlug: payload.provider,
    });
    return {
        content,
        model: payload.model || model,
        usage: payload.usage,
    };
}
//# sourceMappingURL=hostingAiRuntime.js.map