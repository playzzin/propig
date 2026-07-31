import * as admin from 'firebase-admin';
import { db, isRecord } from './hostingCommon';

export type ManagedApiPage = {
    id: string;
    name: string;
    pagePath: string;
    apiPath: string;
    method: 'GET' | 'POST';
    enabled: boolean;
    type: 'text' | 'image' | 'custom';
    description?: string;
    testPayload?: Record<string, unknown>;
    builtIn?: boolean;
};

export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4.1-mini';
export const DEFAULT_OPENROUTER_IMAGE_MODEL = 'openai/gpt-image-1';
const RETIRED_MANAGED_PAGE_TARGETS = new Set([
    'mandalart-generate',
    '/mandalart',
    '/api/generate-mandalart',
]);

export const BUILT_IN_MANAGED_PAGES: ManagedApiPage[] = [
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
        name: 'AI 이미지 생성기',
        pagePath: '/admin/image-generator',
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

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function isRetiredManagedPage(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return [value.id, value.pagePath, value.apiPath].some(
        (target) => typeof target === 'string' && RETIRED_MANAGED_PAGE_TARGETS.has(target),
    );
}

function normalizePage(raw: unknown, fallback: ManagedApiPage): ManagedApiPage {
    const source = isRecord(raw) ? raw : {};
    const overridePayload = isRecord(source.testPayload) ? source.testPayload : null;
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
            ? { ...(fallback.testPayload || {}), ...overridePayload }
            : fallback.testPayload,
        builtIn: typeof source.builtIn === 'boolean' ? source.builtIn : fallback.builtIn,
    };
}

export function mergeManagedPages(value: unknown): ManagedApiPage[] {
    const rawList = Array.isArray(value) ? value.filter((item) => !isRetiredManagedPage(item)) : [];
    const builtInIds = new Set(BUILT_IN_MANAGED_PAGES.map((page) => page.id));
    const builtIns = BUILT_IN_MANAGED_PAGES.map((page) => {
        const override = rawList.find((item) => isRecord(item) && item.id === page.id);
        return normalizePage(override, page);
    });
    const custom = rawList
        .filter((item) => isRecord(item) && typeof item.id === 'string' && item.id && !builtInIds.has(item.id))
        .map((item, index) => normalizePage(item, {
            id: asString(item.id) || `custom-${index}`,
            name: asString(item.name) || `사용자 정의 API ${index + 1}`,
            pagePath: asString(item.pagePath) || '/custom',
            apiPath: asString(item.apiPath) || '/api/custom',
            method: item.method === 'GET' ? 'GET' : 'POST',
            enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
            type: item.type === 'image' || item.type === 'text' ? item.type : 'custom',
            description: asString(item.description) || '사용자 정의 API 연동',
            testPayload: isRecord(item.testPayload) ? item.testPayload : {},
            builtIn: false,
        }));
    return [...builtIns, ...custom];
}

export function maskApiKey(value: string): string {
    const key = value.trim();
    if (!key) return '';
    if (key.length <= 8) return '********';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export type HostingAiRuntime = {
    source: 'firebase-functions-secret' | 'firebase-functions-secret+firestore';
    openRouterApiKey: string;
    model: string;
    imageModel: string;
    fallbackModels: string[];
    managedPages: ManagedApiPage[];
    updatedAt: string | null;
    updatedBy: string | null;
};

export async function getHostingAiRuntime(): Promise<HostingAiRuntime> {
    const snapshot = await db.collection('system_settings').doc('ai').get();
    const stored = snapshot.exists ? snapshot.data() || {} : {};
    const envFallbacks = (process.env.OPENROUTER_FALLBACK_MODELS || '')
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean);
    const model = asString(stored.model).trim() || (process.env.OPENROUTER_MODEL || '').trim() || DEFAULT_OPENROUTER_MODEL;
    const imageModel = asString(stored.imageModel).trim() || (process.env.OPENROUTER_IMAGE_MODEL || '').trim() || DEFAULT_OPENROUTER_IMAGE_MODEL;
    const storedFallbacks = Array.isArray(stored.fallbackModels)
        ? stored.fallbackModels.filter((item): item is string => typeof item === 'string')
        : envFallbacks;
    const fallbackModels = Array.from(new Set(storedFallbacks.map((item) => item.trim()).filter((item) => item && item !== model))).slice(0, 3);
    const updatedAt = stored.updatedAt instanceof admin.firestore.Timestamp
        ? stored.updatedAt.toDate().toISOString()
        : null;
    return {
        source: snapshot.exists ? 'firebase-functions-secret+firestore' : 'firebase-functions-secret',
        openRouterApiKey: (process.env.OPENROUTER_API_KEY || '').trim(),
        model,
        imageModel,
        fallbackModels,
        managedPages: mergeManagedPages(stored.managedPages),
        updatedAt,
        updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : null,
    };
}

export type OpenRouterVisionContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export type OpenRouterTextMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string | OpenRouterVisionContentPart[];
};

export async function runOpenRouterText(input: {
    messages: OpenRouterTextMessage[];
    temperature?: number;
    maxTokens?: number;
    model?: string;
    responseFormat?: 'json_object';
}) {
    const runtime = await getHostingAiRuntime();
    if (!runtime.openRouterApiKey) throw new Error('OPENROUTER_API_KEY is not configured.');
    const model = input.model || runtime.model;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${runtime.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'X-OpenRouter-Title': 'ProPig Firebase Functions',
        },
        body: JSON.stringify({
            model,
            ...(runtime.fallbackModels.length
                ? { models: runtime.fallbackModels.filter((item) => item !== model) }
                : {}),
            messages: input.messages,
            temperature: input.temperature ?? 0.7,
            max_tokens: input.maxTokens ?? 2000,
            ...(input.responseFormat
                ? { response_format: { type: input.responseFormat } }
                : {}),
            stream: false,
        }),
    });
    const raw = await response.text();
    let payload: {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            cost?: number;
        };
        error?: { message?: string };
    } = {};
    try {
        payload = JSON.parse(raw);
    } catch {
        // The safe provider error below handles non-JSON responses.
    }
    if (!response.ok) throw new Error(payload.error?.message || raw.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
    const content = payload.choices?.[0]?.message?.content || '';
    if (!content.trim()) throw new Error('OpenRouter returned an empty response.');
    const { recordOpenRouterUsage } = await import('../openrouterUsage');
    await recordOpenRouterUsage({
        operation: 'text',
        model: payload.model || model,
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
        totalTokens: payload.usage?.total_tokens,
        costUsd: payload.usage?.cost,
    });
    return {
        content,
        model: payload.model || model,
        usage: payload.usage,
    };
}
