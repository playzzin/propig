import { NextRequest, NextResponse } from 'next/server';
import { runManagedTextChat } from '@/lib/server/managed-text-provider';
import { buildFallbackFaviconUrl } from '@/lib/bookmark-favicon';
import { fetchExternalHttpUrl, normalizeExternalHttpUrl } from '@/lib/server/http-safety';
import { requireUserAuth } from '@/lib/server/user-auth';
import { z } from 'zod';

// Zod schema for the enhanced Gemini response
const AnalysisResponseSchema = z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    favicon: z.string().optional(),
    keyTakeaways: z.array(z.string()).optional(),
    detailedAnalysis: z.string().optional(),
    channelName: z.string().optional(),
});

type BasicMetadata = {
    title: string;
    description: string;
    author: string;
    favicon: string;
};

const DEFAULT_CATEGORIES = ['업무', '학습', '개인', '참고', '엔터테인먼트', '기술'];

type AnalyzeStatus = 'ok' | 'fallback';
type AnalyzeSource = 'gemini' | 'grok' | 'fallback';

type AnalyzeMeta = {
    status: AnalyzeStatus;
    source: AnalyzeSource;
    language: 'ko';
    reasonCode?: string;
    message?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    costEstimate?: {
        model: string;
        currency: 'USD';
        inputCostUsd: number;
        outputCostUsd: number;
        totalCostUsd: number;
        estimatedKrw?: number;
        exchangeRate?: number;
        note?: string;
    };
};

type ModelPricing = {
    inputPer1MTokensUsd: number;
    outputPer1MTokensUsd: number;
};

const GEMINI_MODEL_PRICING_USD_PER_1M: Record<string, ModelPricing> = {
    'gemini-2.5-flash': { inputPer1MTokensUsd: 0.3, outputPer1MTokensUsd: 2.5 },
    'gemini-2.5-pro': { inputPer1MTokensUsd: 3.5, outputPer1MTokensUsd: 10.0 },
    'gemini-2.0-flash': { inputPer1MTokensUsd: 0.1, outputPer1MTokensUsd: 0.4 },
    'gemini-1.5-flash': { inputPer1MTokensUsd: 0.075, outputPer1MTokensUsd: 0.3 },
    'gemini-1.5-pro': { inputPer1MTokensUsd: 1.25, outputPer1MTokensUsd: 5.0 },
};

const KRW_PER_USD = 1350;

function resolveModelPricing(modelName: string): ModelPricing | null {
    const normalized = String(modelName || '').toLowerCase();
    if (!normalized) return null;

    const exact = GEMINI_MODEL_PRICING_USD_PER_1M[normalized];
    if (exact) return exact;

    for (const [key, pricing] of Object.entries(GEMINI_MODEL_PRICING_USD_PER_1M)) {
        if (normalized.includes(key)) return pricing;
    }

    return null;
}

function estimateUsageCost(
    usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined,
    modelName: string,
): AnalyzeMeta['costEstimate'] | undefined {
    if (!usage) return undefined;

    const pricing = resolveModelPricing(modelName);
    if (!pricing) {
        return {
            model: modelName,
            currency: 'USD',
            inputCostUsd: 0,
            outputCostUsd: 0,
            totalCostUsd: 0,
            note: '현재 모델 단가 정보가 없어 비용을 계산하지 못했습니다.',
        };
    }

    const inputCostUsd = (usage.promptTokens / 1_000_000) * pricing.inputPer1MTokensUsd;
    const outputCostUsd = (usage.completionTokens / 1_000_000) * pricing.outputPer1MTokensUsd;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    return {
        model: modelName,
        currency: 'USD',
        inputCostUsd,
        outputCostUsd,
        totalCostUsd,
        estimatedKrw: totalCostUsd * KRW_PER_USD,
        exchangeRate: KRW_PER_USD,
        note: '모델 공개 단가 기준 예상치이며 실제 청구 금액과 차이가 있을 수 있습니다.',
    };
}

type YoutubeTargetType = 'video' | 'channel';

type ParsedYoutubeTarget = {
    targetType: YoutubeTargetType;
    canonicalUrl: string;
    videoId?: string;
    channelId?: string;
    channelHandle?: string;
};

type YoutubeOembed = {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
};

function parseYoutubeTarget(url: string): ParsedYoutubeTarget | null {
    const input = String(url || '').trim();
    if (!input) return null;

    const normalizedInput = /^https?:\/\//i.test(input) ? input : `https://${input}`;

    try {
        const parsed = new URL(normalizedInput);

        if (parsed.hostname === 'youtu.be') {
            const id = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
            if (!id) return null;
            return {
                targetType: 'video',
                videoId: id,
                canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
            };
        }

        const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        const isYoutubeHost = host === 'youtube.com' || host.endsWith('.youtube.com');
        if (!isYoutubeHost) {
            return null;
        }

        const videoId = parsed.searchParams.get('v');
        if (videoId?.trim()) {
            return {
                targetType: 'video',
                videoId: videoId.trim(),
                canonicalUrl: `https://www.youtube.com/watch?v=${videoId.trim()}`,
            };
        }

        const parts = parsed.pathname.split('/').filter(Boolean);
        if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && parts[1]) {
            return {
                targetType: 'video',
                videoId: parts[1],
                canonicalUrl: `https://www.youtube.com/watch?v=${parts[1]}`,
            };
        }

        if (parts[0]?.startsWith('@')) {
            return {
                targetType: 'channel',
                channelHandle: parts[0],
                canonicalUrl: `https://www.youtube.com/${parts[0]}`,
            };
        }

        if ((parts[0] === 'channel' || parts[0] === 'c' || parts[0] === 'user') && parts[1]) {
            return {
                targetType: 'channel',
                channelId: parts[0] === 'channel' ? parts[1] : undefined,
                canonicalUrl: `https://www.youtube.com/${parts[0]}/${parts[1]}`,
            };
        }

        return null;
    } catch {
        return null;
    }
}

async function fetchYoutubeOembed(url: string): Promise<YoutubeOembed | null> {
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const res = await fetch(oembedUrl);
        if (!res.ok) return null;
        return await res.json() as YoutubeOembed;
    } catch (e) {
        console.warn('YouTube oEmbed fetch failed:', e);
        return null;
    }
}

function cleanModelText(text: string): string {
    return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
}

function extractJsonObjectText(text: string): string {
    const cleaned = cleanModelText(text);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Gemini response does not contain JSON object');
    }
    return jsonMatch[0];
}

function normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

function containsHangul(text: string): boolean {
    return /[가-힣]/.test(text);
}

function normalizeWhitespace(text: string): string {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function extractHostnameLabel(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./i, '');
    } catch {
        return url;
    }
}

function compactTitle(text: string): string {
    const normalized = normalizeWhitespace(text)
        .replace(/\s+[|｜]\s+.+$/, '')
        .replace(/\s+-\s+.+$/, '')
        .replace(/\s+•\s+.+$/, '');

    if (!normalized) return '';
    if (containsHangul(normalized)) return normalized;

    const words = normalized.split(' ').filter(Boolean);
    if (words.length > 5) {
        return words.slice(0, 4).join(' ');
    }

    return normalized;
}

function decodeHtmlAttribute(value: string): string {
    return value
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

function getHtmlAttribute(tag: string, name: string): string {
    const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return decodeHtmlAttribute((match?.[1] || match?.[2] || match?.[3] || '').trim());
}

function resolveCandidateUrl(value: string, baseUrl: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('#')) return '';
    if (/^data:image\//i.test(trimmed)) return trimmed;

    try {
        const resolved = new URL(trimmed, baseUrl);
        if (!/^https?:$/i.test(resolved.protocol)) return '';
        return resolved.toString();
    } catch {
        return '';
    }
}

function getIconSizeScore(sizes: string): number {
    const normalized = sizes.trim().toLowerCase();
    if (!normalized) return 0;
    if (normalized === 'any') return 64;

    return normalized
        .split(/\s+/)
        .map((size) => {
            const match = size.match(/^(\d+)x(\d+)$/i);
            if (!match) return 0;
            return Math.min(Number(match[1]), Number(match[2]));
        })
        .reduce((max, size) => Math.max(max, size), 0);
}

function scoreFaviconCandidate(tag: string): number {
    const rel = getHtmlAttribute(tag, 'rel').toLowerCase();
    const type = getHtmlAttribute(tag, 'type').toLowerCase();
    const sizes = getHtmlAttribute(tag, 'sizes');

    let score = 0;
    if (/\bicon\b/.test(rel)) score += 100;
    if (rel.includes('apple-touch-icon')) score += 80;
    if (rel.includes('mask-icon')) score += 25;
    if (rel.includes('shortcut')) score += 10;
    if (type.includes('svg')) score += 12;
    if (type.includes('png')) score += 10;
    if (type.includes('image/x-icon') || type.includes('vnd.microsoft.icon')) score += 8;

    return score + Math.min(getIconSizeScore(sizes), 512) / 8;
}

function extractFaviconFromHtml(html: string, baseUrl: string): string {
    const linkCandidates = (html.match(/<link\b[^>]*>/gi) || [])
        .map((tag) => {
            const rel = getHtmlAttribute(tag, 'rel').toLowerCase();
            const href = getHtmlAttribute(tag, 'href');
            if (!href || (!rel.includes('icon') && !rel.includes('mask-icon'))) return null;

            const resolvedUrl = resolveCandidateUrl(href, baseUrl);
            if (!resolvedUrl) return null;

            return {
                url: resolvedUrl,
                score: scoreFaviconCandidate(tag),
            };
        })
        .filter((candidate): candidate is { url: string; score: number } => candidate !== null)
        .sort((a, b) => b.score - a.score);

    if (linkCandidates[0]?.url) return linkCandidates[0].url;

    const tileImage = (html.match(/<meta\b[^>]*>/gi) || [])
        .map((tag) => {
            const key = getHtmlAttribute(tag, 'name') || getHtmlAttribute(tag, 'property');
            if (key.toLowerCase() !== 'msapplication-tileimage') return '';
            return resolveCandidateUrl(getHtmlAttribute(tag, 'content'), baseUrl);
        })
        .find(Boolean);

    return tileImage || '';
}

type FallbackHeuristic = {
    categoryCandidates: string[];
    description: string;
    tags: string[];
    titleSuffix: string;
};

function inferFallbackHeuristic(url: string, basicMetadata: BasicMetadata): FallbackHeuristic {
    const text = `${url} ${basicMetadata.title} ${basicMetadata.description} ${basicMetadata.author}`.toLowerCase();

    if (/(openai|chatgpt|gemini|claude|copilot|llm|ai|artificial intelligence|artificial general intelligence|prompt)/i.test(text)) {
        return {
            categoryCandidates: ['업무', '학습', '참고'],
            description: '인공지능 서비스와 연구, 제품 정보를 확인할 수 있는 사이트입니다.',
            tags: ['인공지능', '생성형 AI', 'AI 도구'],
            titleSuffix: '공식 사이트',
        };
    }

    if (/(github|api|sdk|docs|documentation|developer|typescript|javascript|python|react|next\.js|firebase|vercel|npm)/i.test(text)) {
        return {
            categoryCandidates: ['학습', '업무', '참고'],
            description: '개발 문서, API, 기술 자료를 확인할 수 있는 사이트입니다.',
            tags: ['개발', '문서', '기술 자료'],
            titleSuffix: '문서',
        };
    }

    if (/(youtube|video|stream|watch|channel|movie|netflix|play|vimeo)/i.test(text)) {
        return {
            categoryCandidates: ['개인', '참고', '학습'],
            description: '영상 콘텐츠나 채널 정보를 확인할 수 있는 사이트입니다.',
            tags: ['영상', '콘텐츠', '채널'],
            titleSuffix: '콘텐츠',
        };
    }

    if (/(shop|store|shopping|cart|commerce|coupang|amazon|product|buy|mall)/i.test(text)) {
        return {
            categoryCandidates: ['개인', '참고', '업무'],
            description: '상품 정보와 구매 관련 내용을 확인할 수 있는 사이트입니다.',
            tags: ['쇼핑', '상품', '이커머스'],
            titleSuffix: '정보',
        };
    }

    if (/(news|blog|article|media|press|magazine|journal)/i.test(text)) {
        return {
            categoryCandidates: ['참고', '학습', '업무'],
            description: '읽을거리와 최신 정보를 확인할 수 있는 사이트입니다.',
            tags: ['기사', '정보', '읽을거리'],
            titleSuffix: '정보',
        };
    }

    return {
        categoryCandidates: ['참고', '학습', '업무', '개인'],
        description: '페이지 제목과 메타데이터를 기준으로 핵심 정보를 정리한 사이트입니다.',
        tags: ['웹사이트', '링크', '자료'],
        titleSuffix: '정보',
    };
}

function pickFallbackCategory(categories: string[], candidates: string[]): string {
    for (const candidate of candidates) {
        const matched = categories.find((category) => category.trim() === candidate);
        if (matched) return matched;
    }

    const referenceCategory = categories.find((category) => category.trim() === '참고');
    return referenceCategory || categories[0] || '참고';
}

function buildFallbackAnalysis(
    url: string,
    basicMetadata: BasicMetadata,
    categories: string[],
    detailed: boolean,
) {
    const heuristic = inferFallbackHeuristic(url, basicMetadata);
    const fallbackCategoryName = pickFallbackCategory(categories, heuristic.categoryCandidates);
    const titleSeed = compactTitle(basicMetadata.title) || compactTitle(extractHostnameLabel(url)) || '북마크';
    const fallbackTitle = containsHangul(titleSeed) ? titleSeed : `${titleSeed} ${heuristic.titleSuffix}`.trim();
    const rawDescription = normalizeWhitespace(basicMetadata.description);
    const descriptionBase = fallbackTitle.replace(/\s+(공식 사이트|문서|정보|콘텐츠)$/u, '');
    const fallbackDescription = containsHangul(rawDescription)
        ? rawDescription
        : `${descriptionBase} 관련 정보를 확인할 수 있는 사이트입니다. ${heuristic.description}`;

    return {
        title: fallbackTitle,
        description: fallbackDescription,
        category: fallbackCategoryName,
        tags: heuristic.tags,
        keyTakeaways: [
            'AI 분석을 사용할 수 없어 페이지 제목과 메타데이터를 기준으로 한국어 요약을 생성했습니다.',
            heuristic.description,
        ],
        channelName: basicMetadata.author || '',
        favicon: basicMetadata.favicon || buildFallbackFaviconUrl(url),
        detailedAnalysis: detailed
            ? 'AI 상세 분석을 사용할 수 없어 제목, 설명, URL을 바탕으로 한국어 요약을 생성했습니다. 더 정확한 자동채우기가 필요하면 Gemini API 키를 갱신한 뒤 다시 시도해 주세요.'
            : undefined,
    };

    const fallbackCategory = categories.includes('참고') ? '참고' : (categories[0] || '참고');
    const fallback = {
        title: basicMetadata.title || url,
        description: basicMetadata.description || '내용을 분석할 수 없습니다.',
        category: fallbackCategory,
        tags: [] as string[],
        keyTakeaways: ['자동 분석 실패: URL/제목 중심으로 저장되었습니다.'],
        channelName: basicMetadata.author || '',
        favicon: basicMetadata.favicon || buildFallbackFaviconUrl(url),
        detailedAnalysis: detailed ? '상세 분석을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' : undefined,
    };
    return fallback;
}

function buildMeta(status: AnalyzeStatus, source: AnalyzeSource, overrides?: Partial<AnalyzeMeta>): AnalyzeMeta {
    return {
        status,
        source,
        language: 'ko',
        reasonCode: overrides?.reasonCode,
        message: overrides?.message,
        usage: overrides?.usage,
        costEstimate: overrides?.costEstimate,
    };
}

function successResponse(
    data: z.infer<typeof AnalysisResponseSchema>,
    source: Exclude<AnalyzeSource, 'fallback'>,
    metaOverrides?: Partial<AnalyzeMeta>,
) {
    return NextResponse.json({
        ...data,
        _meta: buildMeta('ok', source, metaOverrides),
    });
}

function fallbackResponse(
    data: z.infer<typeof AnalysisResponseSchema>,
    reasonCode: string,
    message: string,
    requireAI: boolean,
    metaOverrides?: Partial<AnalyzeMeta>,
) {
    if (requireAI) {
        return NextResponse.json({
            error: message,
            _meta: buildMeta('fallback', 'fallback', { ...metaOverrides, reasonCode, message }),
            data,
        }, { status: 503 });
    }

    return NextResponse.json({
        ...data,
        _meta: buildMeta('fallback', 'fallback', { ...metaOverrides, reasonCode, message }),
    });
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.message }, { status: auth.status });
        }

        const body = await req.json();
        const { url, categories, detailed, requireAI, targetType } = body;

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // User-provided category list, or defaults
        const categoryList = (categories && Array.isArray(categories) && categories.length > 0)
            ? categories.map((c: unknown) => String(c).trim()).filter(Boolean)
            : DEFAULT_CATEGORIES;

        const isDetailed = detailed === true;

        // 1. Fetch Metadata
        let htmlContext = '';
        let basicMetadata: BasicMetadata = { title: '', description: '', author: '', favicon: '' };
        const requestedType: YoutubeTargetType | undefined =
            targetType === 'video' || targetType === 'channel' ? targetType : undefined;

        const youtubeTarget = parseYoutubeTarget(String(url));
        const resolvedTargetType = requestedType || youtubeTarget?.targetType;
        let fetchUrl: string;
        try {
            fetchUrl = youtubeTarget?.canonicalUrl || normalizeExternalHttpUrl(String(url));
        } catch (error) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Invalid URL' },
                { status: 400 },
            );
        }

        if (youtubeTarget) {
            const targetLabel = youtubeTarget.targetType === 'channel' ? 'Channel' : 'Video';
            console.log(`[API] Detected YouTube ${targetLabel}. Trying oEmbed...`);
            const oembedData = await fetchYoutubeOembed(youtubeTarget.canonicalUrl);
            if (oembedData) {
                const author = oembedData.author_name || '';
                basicMetadata = {
                    title: oembedData.title || '',
                    description: youtubeTarget.targetType === 'channel'
                        ? `${author || '알 수 없는 채널'}이(가) 운영하는 유튜브 채널`
                        : `${author || '알 수 없는 채널'}이(가) 게시한 유튜브 영상`,
                    author,
                    favicon: buildFallbackFaviconUrl(youtubeTarget.canonicalUrl),
                };
                htmlContext = [
                    `Target is a YouTube ${targetLabel}.`,
                    `Title: ${basicMetadata.title}`,
                    `Channel: ${basicMetadata.author}`,
                    `Type: ${targetLabel}`,
                ].join('\n');
            } else {
                console.warn('[API] oEmbed failed, falling back to HTML fetch.');
            }
        }

        if (!htmlContext) {
            try {
                const response = await fetchExternalHttpUrl(fetchUrl, {
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    },
                });
                if (response.ok) {
                    const html = await response.text();
                    const metadataBaseUrl = response.url || fetchUrl;
                    htmlContext = html.substring(0, 50000);

                    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
                    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
                    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
                    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
                    basicMetadata.title = basicMetadata.title || ogTitleMatch?.[1] || titleMatch?.[1] || '';
                    basicMetadata.description = basicMetadata.description || ogDescMatch?.[1] || metaDescMatch?.[1] || '';
                    basicMetadata.favicon =
                        basicMetadata.favicon ||
                        extractFaviconFromHtml(html, metadataBaseUrl) ||
                        buildFallbackFaviconUrl(metadataBaseUrl);
                }
            } catch (fetchError) {
                console.warn('Failed to fetch URL content directly:', fetchError);
                htmlContext = "Could not fetch HTML content. Analyze based on URL and known info.";
            }
        }

        if (!basicMetadata.favicon) {
            basicMetadata.favicon = buildFallbackFaviconUrl(fetchUrl);
        }

        // 2. Build prompt based on detail level
        const categoryListStr = categoryList.map((c: string) => `'${c}'`).join(', ');

        const systemPrompt = isDetailed
            ? `너는 고급 콘텐츠 분석 전문가야.
제공된 웹사이트 콘텐츠(HTML) 또는 메타데이터를 깊이 있게 분석해줘.

**모든 응답은 반드시 '한국어(Korean)'로 작성해야 해.**

다음 정보를 추출해줘:

1. **title**: 영상/채널/콘텐츠의 정확한 제목
2. **description**: 2~3문장으로 요약된 핵심 설명
3. **category**: [${categoryListStr}] 중 가장 적합한 카테고리 하나 선택. 목록에 없으면 가장 유사한 것 선택.
4. **tags**: 관련 키워드 5~8개 (구체적으로)
5. **keyTakeaways**: 핵심 내용 5~8가지를 구체적으로 요약 (각 항목 1~2문장)
6. **detailedAnalysis**: 콘텐츠를 심층 분석한 내용 (마크다운 형식, 300~500자):
   - 주요 주제와 논점
   - 대상 청중 / 난이도
   - 핵심 인사이트 및 시사점
   - 관련 분야 / 추천 후속 학습
7. **channelName**: 채널/저자 이름
8. **중요**: URL이 YouTube 채널인 경우 채널의 주제/대상청중/콘텐츠 성격 중심으로 분석

반드시 아래 JSON 형식으로만 답변해:
{
  "title": "string",
  "description": "string",
  "category": "string",
  "tags": ["string"],
  "keyTakeaways": ["string"],
  "detailedAnalysis": "string (마크다운)",
  "channelName": "string"
}`
            : `너는 지능형 콘텐츠 분석 비서야.
제공된 웹사이트 콘텐츠(HTML) 또는 메타데이터를 분석해줘.

**모든 응답은 반드시 '한국어(Korean)'로 작성해야 해.**

1. **title**: 명확한 제목 (YouTube 영상이면 영상 제목, 채널이면 채널명)
2. **description**: 한 문장 요약
3. **category**: [${categoryListStr}] 중 하나 선택
4. **tags**: 관련 키워드 3~5개
5. **keyTakeaways**: 핵심 내용 3~5가지 요약
6. **channelName**: 채널/저자 이름

JSON 형식으로 답변:
{
  "title": "string",
  "description": "string",
  "category": "string",
  "tags": ["string"],
  "keyTakeaways": ["string"],
  "channelName": "string"
}`;

        const localizationSystemPrompt = `모든 응답은 자연스러운 한국어로 작성한다.
- title도 반드시 한국어로 작성한다.
- 영어, 일본어, 중국어 등 외국어 제목은 그대로 복사하지 말고 북마크용 한국어 제목으로 번역하거나 자연스럽게 의역한다.
- category는 반드시 다음 목록 중 하나만 선택한다: [${categoryListStr}]
- description, tags, keyTakeaways, detailedAnalysis도 모두 한국어로 작성한다.`;

        const userMessage = `URL: ${String(url)}
Resolved URL: ${fetchUrl}
Target Type: ${resolvedTargetType || 'unknown'}
Output Language: Korean only
Detected Favicon: ${basicMetadata.favicon}
Basic Metadata: ${JSON.stringify(basicMetadata)}
Content Context:
${htmlContext}`;

        const fallbackData = buildFallbackAnalysis(fetchUrl, basicMetadata, categoryList, isDetailed);

        // 3. Call Gemini
        console.log(`[API] Analyzing (detailed=${isDetailed}): ${url}`);
        try {
            const textResult = await runManagedTextChat([
                { role: 'system', content: systemPrompt },
                { role: 'system', content: localizationSystemPrompt },
                { role: 'user', content: userMessage },
            ], {
                temperature: 0.3,
                maxTokens: isDetailed ? 3000 : 1500,
            });

            const usage = textResult.response.usage
                ? {
                    promptTokens: textResult.response.usage.promptTokens || 0,
                    completionTokens: textResult.response.usage.completionTokens || 0,
                    totalTokens: textResult.response.usage.totalTokens || 0,
                }
                : undefined;
            const costEstimate =
                textResult.provider === 'gemini'
                    ? estimateUsageCost(usage, textResult.model)
                    : undefined;

            const content = textResult.response.content.trim();
            console.log(`[API] ${textResult.provider} Response:`, content);

            let parsedData: z.infer<typeof AnalysisResponseSchema>;
            try {
                const raw = JSON.parse(extractJsonObjectText(content)) as Record<string, unknown>;

                const nextCategory = typeof raw.category === 'string' ? raw.category.trim() : fallbackData.category;
                const normalizedData = {
                    title: typeof raw.title === 'string' ? raw.title : fallbackData.title,
                    description: typeof raw.description === 'string' ? raw.description : fallbackData.description,
                    category: categoryList.includes(nextCategory) ? nextCategory : fallbackData.category,
                    tags: normalizeStringArray(raw.tags),
                    favicon: fallbackData.favicon,
                    keyTakeaways: normalizeStringArray(raw.keyTakeaways),
                    detailedAnalysis: typeof raw.detailedAnalysis === 'string' ? raw.detailedAnalysis : undefined,
                    channelName: typeof raw.channelName === 'string' ? raw.channelName : fallbackData.channelName,
                };

                parsedData = AnalysisResponseSchema.parse(normalizedData);
            } catch (parseError) {
                console.error('[API] Parse Error:', parseError);
                const parsedFallback = AnalysisResponseSchema.parse(fallbackData);
                return fallbackResponse(
                    parsedFallback,
                    'parse_failed',
                    'Gemini 응답 파싱에 실패했습니다.',
                    requireAI === true,
                    { usage, costEstimate },
                );
            }

            const result = {
                ...parsedData,
                tags: parsedData.tags.length > 0 ? parsedData.tags : fallbackData.tags,
                keyTakeaways: parsedData.keyTakeaways && parsedData.keyTakeaways.length > 0
                    ? parsedData.keyTakeaways
                    : fallbackData.keyTakeaways,
                favicon: parsedData.favicon || fallbackData.favicon,
                detailedAnalysis: parsedData.detailedAnalysis || fallbackData.detailedAnalysis,
            };

            return successResponse(result, textResult.provider, { usage, costEstimate });

        } catch (llmError) {
            console.error('[API] Critical LLM Error:', llmError);
            const message = llmError instanceof Error ? llmError.message : String(llmError);
            return fallbackResponse(fallbackData, 'llm_failed', message, requireAI === true);
        }
    } catch (error) {
        console.error('[API] Unhandled Error:', error);
        return NextResponse.json({ error: 'Failed to analyze bookmark at top level' }, { status: 500 });
    }
}
