"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBatchMetadata = exports.extractBookmarkMetadata = void 0;
const v2_1 = require("firebase-functions/v2");
const generative_ai_1 = require("@google/generative-ai");
const zod_1 = require("zod");
const security_1 = require("./api/security");
const secrets_1 = require("./secrets");
const getGeminiEnv = () => {
    var _a;
    return {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: (_a = process.env.GEMINI_MODEL) !== null && _a !== void 0 ? _a : 'gemini-2.5-flash',
    };
};
const createGeminiModel = () => {
    const env = getGeminiEnv();
    if (!env.apiKey) {
        return null;
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(env.apiKey);
    return genAI.getGenerativeModel({ model: env.model });
};
const GeminiBookmarkMetadataSchema = zod_1.z.object({
    title: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    suggestedCategory: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    favicon: zod_1.z.string().optional(),
});
const normalizeTags = (tags) => {
    const normalized = tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 10);
    return Array.from(new Set(normalized));
};
const cleanModelText = (text) => {
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    return cleaned;
};
const extractJsonObjectText = (text) => {
    const cleaned = cleanModelText(text);
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
        throw new Error('Gemini 응답에서 JSON 객체를 찾지 못했습니다.');
    }
    return match[0];
};
const escapeRegExp = (value) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
const fetchHtmlWithTimeout = async (url, timeoutMs) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await (0, security_1.fetchExternalHttpUrl)(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status}`);
        }
        return await response.text();
    }
    finally {
        clearTimeout(timeoutId);
    }
};
const findMetaContent = (html, attrName, attrValue) => {
    const escaped = escapeRegExp(attrValue);
    const patterns = [
        new RegExp(`<meta[^>]*\\s${attrName}=["']${escaped}["'][^>]*\\scontent=["']([^"']*)["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]*\\scontent=["']([^"']*)["'][^>]*\\s${attrName}=["']${escaped}["'][^>]*>`, 'i'),
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match === null || match === void 0 ? void 0 : match[1])
            return match[1].trim();
    }
    return '';
};
const extractBasicMetadataFromHtml = (html) => {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const ogTitle = findMetaContent(html, 'property', 'og:title');
    const ogDescription = findMetaContent(html, 'property', 'og:description');
    const ogSiteName = findMetaContent(html, 'property', 'og:site_name');
    const ogImage = findMetaContent(html, 'property', 'og:image');
    const metaDescription = findMetaContent(html, 'name', 'description');
    return {
        title: (ogTitle || (titleMatch === null || titleMatch === void 0 ? void 0 : titleMatch[1]) || '').trim(),
        description: (ogDescription || metaDescription || '').trim(),
        siteName: ogSiteName.trim(),
        image: ogImage.trim(),
    };
};
const extractTextSnippetFromHtml = (html, maxLength) => {
    const withoutScripts = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
    const text = withoutScripts
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text)
        return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};
const deriveTagsFromTitle = (title, maxCount) => {
    const stopwords = new Set([
        'http',
        'https',
        'www',
        'com',
        'net',
        'org',
        'io',
        'co',
        'kr',
        'jp',
        'cn',
    ]);
    const tokens = title
        .split(/[\s/|·•:;,.()[\]{}<>"'`~!?@#$%^&*+=\\-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && t.length <= 20)
        .filter((t) => !stopwords.has(t.toLowerCase()));
    return Array.from(new Set(tokens)).slice(0, maxCount);
};
const ensureNonEmptyTags = (tags, url) => {
    const normalized = normalizeTags(tags);
    if (normalized.length > 0)
        return normalized;
    const domain = extractDomain(url).replace(/^www\./i, '').trim();
    if (domain)
        return [domain];
    return ['bookmark'];
};
const resolveMaybeRelativeUrl = (baseUrl, maybeRelative) => {
    try {
        return new URL(maybeRelative, baseUrl).toString();
    }
    catch (_a) {
        return maybeRelative;
    }
};
// URL에서 도메인 추출
function extractDomain(url) {
    try {
        const match = url.match(/^https?:\/\/([^\/]+)/);
        return match ? match[1] : '';
    }
    catch (_a) {
        return '';
    }
}
// 파비콘 URL 생성
function getFaviconUrl(url) {
    const domain = extractDomain(url);
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}
// 북마크 메타데이터 추출
exports.extractBookmarkMetadata = v2_1.https.onCall({ secrets: [secrets_1.geminiApiKey] }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!request.auth) {
        throw new v2_1.https.HttpsError('unauthenticated', 'Login is required');
    }
    const { url } = request.data;
    if (!url || typeof url !== 'string') {
        throw new v2_1.https.HttpsError('invalid-argument', 'URL is required');
    }
    if (!/^https?:\/\//i.test(url)) {
        throw new v2_1.https.HttpsError('invalid-argument', 'Invalid URL');
    }
    let safeUrl;
    try {
        safeUrl = (0, security_1.normalizeExternalHttpUrl)(url);
    }
    catch (_j) {
        throw new v2_1.https.HttpsError('invalid-argument', 'Invalid URL');
    }
    try {
        v2_1.logger.info('extractBookmarkMetadata:start', { url: safeUrl, uid: request.auth.uid });
        let html = '';
        let basicMetadata = { title: '', description: '', siteName: '', image: '' };
        let textSnippet = '';
        try {
            html = await fetchHtmlWithTimeout(safeUrl, 8000);
            basicMetadata = extractBasicMetadataFromHtml(html);
            textSnippet = extractTextSnippetFromHtml(html.substring(0, 120000), 1200);
        }
        catch (error) {
            v2_1.logger.warn('Failed to fetch HTML for bookmark analysis. Falling back to URL-only prompt.', {
                url: safeUrl,
                message: error instanceof Error ? error.message : String(error),
            });
        }
        const baselineTitle = basicMetadata.title || extractDomain(safeUrl);
        const baselineDescription = basicMetadata.description || (textSnippet ? textSnippet.slice(0, 300) : '') || `${baselineTitle} 관련 페이지입니다.`;
        const baselineTags = ensureNonEmptyTags(deriveTagsFromTitle(baselineTitle, 5), safeUrl);
        const baseline = {
            title: baselineTitle,
            description: baselineDescription,
            suggestedCategory: '참고',
            tags: baselineTags,
            favicon: getFaviconUrl(safeUrl),
        };
        v2_1.logger.info('extractBookmarkMetadata:context', {
            url: safeUrl,
            hasHtml: Boolean(html),
            htmlLength: html.length,
            basicTitleLength: basicMetadata.title.length,
            basicDescriptionLength: basicMetadata.description.length,
            textSnippetLength: textSnippet.length,
        });
        const model = createGeminiModel();
        if (!model) {
            v2_1.logger.warn('GEMINI_API_KEY is not set. Returning baseline metadata.', { url: safeUrl });
            return baseline;
        }
        const truncatedHtml = html ? html.substring(0, 50000) : '';
        // 클라이언트에서 전달받은 카테고리 목록 (없으면 기본값)
        const availableCategories = (Array.isArray(request.data.availableCategories) && request.data.availableCategories.length > 0)
            ? request.data.availableCategories
            : ['업무', '학습', '개인', '참고'];
        const categoriesString = availableCategories.join("', '");
        const prompt = `다음 웹사이트 URL을 정밀 분석하여 북마크 정보를 추출해주세요.
URL: ${safeUrl}

가능하다면 아래 정보를 최대한 참고하여 정확도를 높이세요:
- Extracted Metadata: ${JSON.stringify(basicMetadata)}
- Extracted Text Snippet: ${textSnippet}
- HTML Context: ${truncatedHtml ? 'Provided' : 'Not Provided'}

다음 5가지 정보를 추출하여 JSON 형식으로 응답해주세요. (다른 설명 없이 JSON만 반환):

1. **title**: 
   - 웹페이지의 공식 제목입니다. **(반드시 한국어로 번역하거나, 한국어 사이트인 경우 원래 제목 유지)**
   - 불필요한 영문 수식어가 있다면 제거하고, 핵심 주제를 한국어로 표현하세요. (예: "GitHub: Where the world builds software" -> "GitHub: 전 세계 개발자들의 소프트웨어 저장소")

2. **description**:
   - 이 페이지가 어떤 목적을 가진 사이트인지 상세하게 설명해주세요. **(반드시 한국어로 작성)**
   - 단순한 요약이 아니라, **"이 사이트는 [주요 기능/목적]을 제공하며, [특정 사용자]에게 [어떤 가치]를 줍니다."** 형태로 3~5문장 정도로 풍부하게 작성하세요.
   - 영문 사이트라도 내용은 한국어로 요약해야 합니다.

3. **suggestedCategory**:
   - 다음 제공된 카테고리 목록 중에서, 이 페이지의 성격에 가장 잘 부합하는 것을 하나만 선택하세요.
   - 목록: ['${categoriesString}']

4. **tags**:
   - 사용자가 나중에 이 북마크를 검색할 때 입력할법한 **구체적인 키워드** 5~7개를 추출하세요. **(모두 한국어로 작성)**
   - 영어 태그(예: "React", "Docs")보다는 한국어 태그(예: "리액트", "공식문서")를 우선 사용하세요. 단, "JavaScript" 같이 한국어로 썼을 때 어색한 고유명사는 영어를 병기하거나 그대로 써도 됩니다.
   - 예: ["개발", "리액트", "프론트엔드", "자바스크립트", "튜토리얼"]

5. **favicon**:
   - 파비콘 URL (감지된 것이 있다면 그대로 사용)

응답 예시 포맷:
{
  "title": "한국어 사이트 제목",
  "description": "이 사이트는... (상세한 한국어 설명)",
  "suggestedCategory": "${availableCategories[0]}",
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "favicon": "https://..."
}`;
        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const jsonText = extractJsonObjectText(text);
            const parsedJson = JSON.parse(jsonText);
            const normalizedJson = (() => {
                if (!parsedJson || typeof parsedJson !== 'object') {
                    return {};
                }
                const record = parsedJson;
                const tags = record.tags;
                const nextTags = typeof tags === 'string'
                    ? normalizeTags(tags.split(',').map((t) => t.trim()))
                    : Array.isArray(tags)
                        ? normalizeTags(tags.map((t) => String(t)))
                        : undefined;
                const favicon = typeof record.favicon === 'string' ? resolveMaybeRelativeUrl(safeUrl, record.favicon) : undefined;
                return {
                    title: typeof record.title === 'string' ? record.title : undefined,
                    description: typeof record.description === 'string' ? record.description : undefined,
                    suggestedCategory: typeof record.suggestedCategory === 'string' ? record.suggestedCategory : undefined,
                    tags: nextTags,
                    favicon,
                };
            })();
            const parsedMetadata = GeminiBookmarkMetadataSchema.safeParse(normalizedJson);
            const metadata = parsedMetadata.success ? parsedMetadata.data : {};
            const derivedTitle = ((_a = metadata.title) === null || _a === void 0 ? void 0 : _a.trim()) || baseline.title;
            const derivedDescription = ((_b = metadata.description) === null || _b === void 0 ? void 0 : _b.trim()) || baseline.description || '';
            const derivedTags = metadata.tags ? normalizeTags(metadata.tags) : [];
            const fallbackTags = ensureNonEmptyTags(derivedTags.length > 0 ? derivedTags : baseline.tags || [], safeUrl);
            // 카테고리 유효성 검사 (제공된 목록에 있는지)
            let finalCategory = metadata.suggestedCategory || '참고';
            if (availableCategories.length > 0 && !availableCategories.includes(finalCategory)) {
                // AI가 엉뚱한 카테고리를 줬다면 기본값(첫번째 or 참고)으로 fallback
                if (availableCategories.includes('참고'))
                    finalCategory = '참고';
                else if (availableCategories.includes('기타'))
                    finalCategory = '기타';
                else
                    finalCategory = availableCategories[0];
            }
            const finalized = {
                title: derivedTitle,
                description: derivedDescription,
                suggestedCategory: finalCategory,
                tags: fallbackTags,
                favicon: metadata.favicon || baseline.favicon,
            };
            v2_1.logger.info('extractBookmarkMetadata:finalized', {
                url: safeUrl,
                titleLength: (_d = (_c = finalized.title) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0,
                descriptionLength: (_f = (_e = finalized.description) === null || _e === void 0 ? void 0 : _e.length) !== null && _f !== void 0 ? _f : 0,
                tagsCount: (_h = (_g = finalized.tags) === null || _g === void 0 ? void 0 : _g.length) !== null && _h !== void 0 ? _h : 0,
                suggestedCategory: finalized.suggestedCategory,
            });
            return finalized;
        }
        catch (error) {
            v2_1.logger.error('extractBookmarkMetadata:gemini_failed', {
                url: safeUrl,
                message: error instanceof Error ? error.message : String(error),
            });
            return baseline;
        }
    }
    catch (error) {
        v2_1.logger.error('Error extracting metadata:', error);
        return {
            title: extractDomain(safeUrl),
            description: '',
            suggestedCategory: '참고',
            tags: [],
            favicon: getFaviconUrl(safeUrl),
        };
    }
});
// 배치로 메타데이터 추출
exports.extractBatchMetadata = v2_1.https.onCall({ secrets: [secrets_1.geminiApiKey] }, async (request) => {
    if (!request.auth) {
        throw new v2_1.https.HttpsError('unauthenticated', 'Login is required');
    }
    const { urls } = request.data;
    if (!Array.isArray(urls) || urls.length === 0) {
        throw new v2_1.https.HttpsError('invalid-argument', 'URLs array is required');
    }
    if (urls.length > 10) {
        throw new v2_1.https.HttpsError('invalid-argument', 'Maximum 10 URLs per batch');
    }
    try {
        const model = createGeminiModel();
        if (!model) {
            v2_1.logger.warn('GEMINI_API_KEY is not set. Returning empty batch result.');
            return [];
        }
        const results = [];
        for (const url of urls) {
            try {
                if (typeof url !== 'string') {
                    throw new Error('Invalid URL');
                }
                const safeUrl = (0, security_1.normalizeExternalHttpUrl)(url);
                const prompt = `다음 웹사이트 URL을 분석하여 북마크 정보를 추출해주세요:
URL: ${safeUrl}

다음 정보를 추출하여 JSON 형식으로 응답해주세요:
1. title: 페이지의 정확한 제목
2. description: 페이지 내용을 1-2문장으로 요약
3. suggestedCategory: 다음 중 하나로 분류: ['업무', '학습', '개인', '참고']
4. tags: 페이지를 대표하는 태그 3-5개 (콤마로 구분)
5. favicon: 파비콘 URL (있는 경우, 없으면 빈 문자열)

응답 형식:
{
  "title": "페이지 제목",
  "description": "페이지 설명",
  "suggestedCategory": "업무",
  "tags": ["태그1", "태그2", "태그3"],
  "favicon": "https://example.com/favicon.ico"
}`;
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                // JSON 파싱
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    throw new Error('Invalid response format');
                }
                const metadata = JSON.parse(jsonMatch[0]);
                // 파비콘이 없으면 자동 생성
                if (!metadata.favicon) {
                    metadata.favicon = getFaviconUrl(safeUrl);
                }
                // 태그가 문자열로 온 경우 배열로 변환
                if (typeof metadata.tags === 'string') {
                    metadata.tags = metadata.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
                }
                results.push({ url: safeUrl, metadata });
            }
            catch (error) {
                v2_1.logger.error(`Failed to extract metadata for ${url}:`, error);
            }
        }
        return results;
    }
    catch (error) {
        v2_1.logger.error('Error in batch extraction:', error);
        throw new v2_1.https.HttpsError('internal', 'Failed to extract batch metadata');
    }
});
//# sourceMappingURL=extractBookmarkMetadata.js.map