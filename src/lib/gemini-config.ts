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

export interface GeminiSettingsDocument {
    apiKey?: string;
    grokApiKey?: string;
    model?: string;
    imageModel?: string;
    managedPages?: ManagedApiPage[];
    updatedAt?: unknown;
    updatedBy?: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

export const BUILT_IN_MANAGED_PAGES: ManagedApiPage[] = [
    {
        id: 'bookmarks-analyze',
        name: '스마트 북마크 분석',
        pagePath: '/bookmarks',
        apiPath: '/api/analyze-bookmark',
        method: 'POST',
        enabled: true,
        type: 'text',
        description: '북마크 URL 분석 및 카테고리/태그 추론',
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
        id: 'mandalart-generate',
        name: '만다라트 생성',
        pagePath: '/mandalart',
        apiPath: '/api/generate-mandalart',
        method: 'POST',
        enabled: true,
        type: 'text',
        description: '목표 기반 만다라트 생성',
        testPayload: {
            goal: '헬스체크 목표 생성',
            mode: 'subgoals',
            requireAI: true,
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
        description: 'Gemini 기반 이미지 생성',
        testPayload: {
            prompt: 'Premium Korean corporate project board cover, modern planning workspace, no readable text',
            width: 1536,
            height: 864,
            aspectRatio: '16:9',
            stylePreset: 'project-board',
            numberOfImages: 1,
            provider: 'gemini',
        },
        builtIn: true,
    },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asMethod = (value: unknown): ManagedApiMethod =>
    value === 'GET' ? 'GET' : 'POST';

const asType = (value: unknown): ManagedApiPageType => {
    if (value === 'image' || value === 'custom') return value;
    return 'text';
};

const normalizeSinglePage = (
    raw: unknown,
    fallback: ManagedApiPage,
): ManagedApiPage => {
    const record = isRecord(raw) ? raw : {};
    const testPayloadRaw = record.testPayload;
    const fallbackPayload = isRecord(fallback.testPayload) ? fallback.testPayload : {};
    const overridePayload = isRecord(testPayloadRaw) ? testPayloadRaw : null;
    const testPayload = overridePayload
        ? { ...fallbackPayload, ...overridePayload }
        : fallback.testPayload;

    return {
        id: asString(record.id) || fallback.id,
        name: asString(record.name) || fallback.name,
        pagePath: asString(record.pagePath) || fallback.pagePath,
        apiPath: asString(record.apiPath) || fallback.apiPath,
        method: asMethod(record.method ?? fallback.method),
        enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
        type: asType(record.type ?? fallback.type),
        description: asString(record.description) || fallback.description,
        testPayload,
        builtIn: typeof record.builtIn === 'boolean' ? record.builtIn : fallback.builtIn,
    };
};

export const mergeManagedPages = (input?: unknown): ManagedApiPage[] => {
    const rawList = Array.isArray(input) ? input : [];

    const builtInMap = new Map<string, ManagedApiPage>(
        BUILT_IN_MANAGED_PAGES.map((page) => [page.id, page]),
    );

    const mergedBuiltIns = BUILT_IN_MANAGED_PAGES.map((builtInPage) => {
        const override = rawList.find((item) => isRecord(item) && asString(item.id) === builtInPage.id);
        return normalizeSinglePage(override, builtInPage);
    });

    const customPages = rawList
        .filter((item) => {
            if (!isRecord(item)) return false;
            const id = asString(item.id);
            return Boolean(id) && !builtInMap.has(id);
        })
        .map((item, index) => {
            const record = item as Record<string, unknown>;
            const fallback: ManagedApiPage = {
                id: asString(record.id) || `custom-${Date.now()}-${index}`,
                name: asString(record.name) || `커스텀 API ${index + 1}`,
                pagePath: asString(record.pagePath) || '/custom',
                apiPath: asString(record.apiPath) || '/api/custom',
                method: asMethod(record.method),
                enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
                type: asType(record.type),
                description: asString(record.description) || '사용자 정의 API 연동',
                testPayload: isRecord(record.testPayload) ? record.testPayload : {},
                builtIn: false,
            };
            return normalizeSinglePage(item, fallback);
        });

    return [...mergedBuiltIns, ...customPages];
};

export const maskApiKey = (apiKey: string): string => {
    const trimmed = apiKey.trim();
    if (!trimmed) return '';
    if (trimmed.length <= 8) return '********';
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
};
