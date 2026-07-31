export type ManagedApiMethod = 'GET' | 'POST';

export type ManagedApiPageType = 'text' | 'image' | 'custom';

export interface ManagedApiPage {
    id: string;
    name: string;
    pagePath: string;
    apiPath: string;
    method: ManagedApiMethod;
    enabled: boolean;
    type: ManagedApiPageType;
    description?: string;
    testPayload?: Record<string, unknown>;
    builtIn?: boolean;
}

export interface AISettingsDocument {
    model?: string;
    imageModel?: string;
    fallbackModels?: string[];
    managedPages?: ManagedApiPage[];
    updatedAt?: unknown;
    updatedBy?: string;
}

// Keep provider selection at the OpenRouter boundary and avoid direct vendor SDK dependencies.
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
        description: '북마크 URL 분석 및 카테고리/태그 추출',
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
        description: 'YouTube 영상/채널 요약 분석',
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asMethod = (value: unknown): ManagedApiMethod => (value === 'GET' ? 'GET' : 'POST');

const asType = (value: unknown): ManagedApiPageType =>
    value === 'image' || value === 'custom' ? value : 'text';

const isRetiredManagedPage = (value: unknown): boolean => {
    if (!isRecord(value)) return false;
    return [value.id, value.pagePath, value.apiPath].some(
        (target) => typeof target === 'string' && RETIRED_MANAGED_PAGE_TARGETS.has(target),
    );
};

const normalizeSinglePage = (raw: unknown, fallback: ManagedApiPage): ManagedApiPage => {
    const record = isRecord(raw) ? raw : {};
    const testPayloadRaw = record.testPayload;
    const fallbackPayload = isRecord(fallback.testPayload) ? fallback.testPayload : {};
    const overridePayload = isRecord(testPayloadRaw) ? testPayloadRaw : null;

    return {
        id: asString(record.id) || fallback.id,
        name: asString(record.name) || fallback.name,
        pagePath: asString(record.pagePath) || fallback.pagePath,
        apiPath: asString(record.apiPath) || fallback.apiPath,
        method: asMethod(record.method ?? fallback.method),
        enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
        type: asType(record.type ?? fallback.type),
        description: asString(record.description) || fallback.description,
        testPayload: overridePayload ? { ...fallbackPayload, ...overridePayload } : fallback.testPayload,
        builtIn: typeof record.builtIn === 'boolean' ? record.builtIn : fallback.builtIn,
    };
};

export const mergeManagedPages = (input?: unknown): ManagedApiPage[] => {
    const rawList = Array.isArray(input) ? input.filter((item) => !isRetiredManagedPage(item)) : [];
    const builtInMap = new Map(BUILT_IN_MANAGED_PAGES.map((page) => [page.id, page]));

    const builtIns = BUILT_IN_MANAGED_PAGES.map((page) => {
        const override = rawList.find((item) => isRecord(item) && asString(item.id) === page.id);
        return normalizeSinglePage(override, page);
    });

    const customPages = rawList
        .filter((item) => isRecord(item) && Boolean(asString(item.id)) && !builtInMap.has(asString(item.id)))
        .map((item, index) => {
            const record = item as Record<string, unknown>;
            return normalizeSinglePage(item, {
                id: asString(record.id) || `custom-${Date.now()}-${index}`,
                name: asString(record.name) || `사용자 정의 API ${index + 1}`,
                pagePath: asString(record.pagePath) || '/custom',
                apiPath: asString(record.apiPath) || '/api/custom',
                method: asMethod(record.method),
                enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
                type: asType(record.type),
                description: asString(record.description) || '사용자 정의 API 연동',
                testPayload: isRecord(record.testPayload) ? record.testPayload : {},
                builtIn: false,
            });
        });

    return [...builtIns, ...customPages];
};

export const maskApiKey = (apiKey: string): string => {
    const trimmed = apiKey.trim();
    if (!trimmed) return '';
    if (trimmed.length <= 8) return '********';
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
};
