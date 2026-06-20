"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeYoutubeVideo = void 0;
const v2_1 = require("firebase-functions/v2");
const generative_ai_1 = require("@google/generative-ai");
const zod_1 = require("zod");
const admin = require("firebase-admin");
const secrets_1 = require("./secrets");
if (!admin.apps.length) {
    admin.initializeApp();
}
const getGeminiEnv = async () => {
    var _a;
    try {
        const docSnap = await admin.firestore().doc('system_settings/gemini_keys').get();
        if (docSnap.exists) {
            const data = docSnap.data();
            if (data === null || data === void 0 ? void 0 : data.geminiApiKey) {
                return {
                    apiKey: data.geminiApiKey,
                    model: data.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
                };
            }
        }
    }
    catch (e) {
        v2_1.logger.error('Failed to read gemini_keys from Firestore', e);
    }
    return {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: (_a = process.env.GEMINI_MODEL) !== null && _a !== void 0 ? _a : 'gemini-2.5-flash',
    };
};
const createGeminiModel = async () => {
    const env = await getGeminiEnv();
    if (!env.apiKey)
        return null;
    const genAI = new generative_ai_1.GoogleGenerativeAI(env.apiKey);
    return genAI.getGenerativeModel({ model: env.model });
};
const AnalyzeYoutubeVideoRequestSchema = zod_1.z.object({
    youtube_url: zod_1.z.string().min(1),
    video_title: zod_1.z.string().optional(),
    video_description: zod_1.z.string().optional(),
    transcript: zod_1.z.string().optional(),
    user_memo: zod_1.z.string().optional(),
});
const DifficultySchema = zod_1.z.enum(['입문', '중급', '고급']);
const DepthSchema = zod_1.z.enum(['얕음', '보통', '깊음']);
const PracticalitySchema = zod_1.z.enum(['이론', '실습', '혼합']);
const SummarySourceSchema = zod_1.z.enum(['transcript', 'description', 'mixed']);
const AnalyzeYoutubeVideoResultSchema = zod_1.z.object({
    youtubeId: zod_1.z.string(),
    title: zod_1.z.string(),
    channel: zod_1.z.string(),
    thumbnail: zod_1.z.object({
        default: zod_1.z.string(),
        high: zod_1.z.string(),
    }),
    duration: zod_1.z.string(),
    publishedAt: zod_1.z.string(),
    summary: zod_1.z.object({
        oneLine: zod_1.z.string(),
        short: zod_1.z.string(),
        detailed: zod_1.z.string(),
        keyPoints: zod_1.z.array(zod_1.z.string()),
    }),
    categories: zod_1.z.array(zod_1.z.string()),
    tags: zod_1.z.array(zod_1.z.string()),
    recommendedFor: zod_1.z.string(),
    difficulty: DifficultySchema,
    watchIntent: zod_1.z.string(),
    userMemoSuggestion: zod_1.z.string(),
    contentQuality: zod_1.z.object({
        depth: DepthSchema,
        practicality: PracticalitySchema,
    }),
    embed: zod_1.z.object({
        iframeUrl: zod_1.z.string(),
        watchOnYoutubeUrl: zod_1.z.string(),
    }),
    summarySource: SummarySourceSchema,
});
const cleanModelText = (text) => {
    return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
};
const extractJsonObjectText = (text) => {
    const cleaned = cleanModelText(text);
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
        throw new Error('Gemini 응답에서 JSON 객체를 찾지 못했습니다.');
    }
    return match[0];
};
const normalizeStringArray = (value) => {
    if (Array.isArray(value)) {
        return value.map((v) => String(v).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
    }
    return [];
};
const uniq = (values) => {
    return Array.from(new Set(values));
};
const tokenizeKoreanKeywords = (text) => {
    return text
        .split(/[\s/|·•:;,.()[\]{}<>"'`~!?@#$%^&*+=\\-]+/)
        .map((v) => v.trim())
        .filter((v) => v.length >= 2 && v.length <= 20);
};
const buildFallbackTags = (args) => {
    const baseText = `${args.title} ${args.userMemo} ${args.description}`.trim();
    const tokens = tokenizeKoreanKeywords(baseText);
    const unique = uniq(tokens);
    if (unique.length >= 5)
        return unique.slice(0, 10);
    if (unique.length > 0)
        return unique;
    return ['유튜브', '요약', '지식', '북마크', '정리'];
};
const ensureMinArraySize = (values, min, fallback) => {
    if (values.length >= min)
        return values;
    const merged = uniq([...values, ...fallback]);
    return merged;
};
const buildFallbackKeyPoints = (args) => {
    const baseText = `${args.userMemo} ${args.transcript} ${args.description} ${args.title}`.trim();
    const tokens = uniq(tokenizeKoreanKeywords(baseText));
    const points = tokens.slice(0, 7);
    if (points.length >= 4)
        return points.slice(0, 7);
    return ['핵심 개념 정리', '실무 적용 포인트', '주의할 점', '추천 활용 방식'];
};
const pickDifficulty = (value) => {
    const parsed = DifficultySchema.safeParse(value);
    return parsed.success ? parsed.data : '입문';
};
const pickDepth = (value) => {
    const parsed = DepthSchema.safeParse(value);
    return parsed.success ? parsed.data : '보통';
};
const pickPracticality = (value) => {
    const parsed = PracticalitySchema.safeParse(value);
    return parsed.success ? parsed.data : '혼합';
};
const clampLength = (value, maxLen) => {
    const trimmed = value.trim();
    if (trimmed.length <= maxLen)
        return trimmed;
    return trimmed.slice(0, maxLen);
};
const withTimeout = async (promise, timeoutMs) => {
    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    return (await Promise.race([promise, timeout]));
};
const fetchText = async (url, timeoutMs) => {
    const response = await withTimeout(fetch(url, {
        redirect: 'follow',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    }), timeoutMs);
    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
    }
    return await response.text();
};
const fetchJson = async (url, timeoutMs) => {
    const response = await withTimeout(fetch(url, { redirect: 'follow' }), timeoutMs);
    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
    }
    return (await response.json());
};
const extractYoutubeIdFromUrl = (youtubeUrl) => {
    var _a;
    try {
        const parsed = new URL(youtubeUrl);
        if (parsed.hostname === 'youtu.be') {
            const id = (_a = parsed.pathname.split('/').filter(Boolean)[0]) !== null && _a !== void 0 ? _a : '';
            return id || null;
        }
        const host = parsed.hostname.replace(/^www\./i, '');
        const isYoutubeHost = host === 'youtube.com' || host.endsWith('.youtube.com');
        if (isYoutubeHost) {
            const v = parsed.searchParams.get('v');
            if (v)
                return v;
            const parts = parsed.pathname.split('/').filter(Boolean);
            if (parts[0] === 'shorts' && parts[1])
                return parts[1];
            if (parts[0] === 'embed' && parts[1])
                return parts[1];
            if (parts[0] === 'live' && parts[1])
                return parts[1];
        }
        return null;
    }
    catch (_b) {
        return null;
    }
};
const buildYoutubeUrls = (youtubeId) => {
    const watchOnYoutubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    const iframeUrl = `https://www.youtube.com/embed/${youtubeId}`;
    const defaultThumbnail = `https://i.ytimg.com/vi/${youtubeId}/default.jpg`;
    const highThumbnail = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
    return {
        watchOnYoutubeUrl,
        iframeUrl,
        thumbnail: {
            default: defaultThumbnail,
            high: highThumbnail,
        },
    };
};
const fetchYoutubeOEmbed = async (youtubeUrl) => {
    try {
        const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
        return await fetchJson(endpoint, 6000);
    }
    catch (_a) {
        return null;
    }
};
const parseYoutubeLdVideoObject = (html) => {
    const matches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (!matches)
        return null;
    for (const block of matches) {
        const jsonMatch = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (!(jsonMatch === null || jsonMatch === void 0 ? void 0 : jsonMatch[1]))
            continue;
        const text = jsonMatch[1].trim();
        try {
            const parsed = JSON.parse(text);
            const candidates = Array.isArray(parsed) ? parsed : [parsed];
            for (const candidate of candidates) {
                if (!candidate || typeof candidate !== 'object')
                    continue;
                const record = candidate;
                if (record['@type'] !== 'VideoObject')
                    continue;
                return {
                    duration: typeof record.duration === 'string' ? record.duration : undefined,
                    uploadDate: typeof record.uploadDate === 'string' ? record.uploadDate : undefined,
                    thumbnailUrl: typeof record.thumbnailUrl === 'string' || Array.isArray(record.thumbnailUrl)
                        ? record.thumbnailUrl
                        : undefined,
                    author: record.author && typeof record.author === 'object'
                        ? record.author
                        : undefined,
                };
            }
        }
        catch (_a) {
            continue;
        }
    }
    return null;
};
const resolveSummarySource = (input) => {
    var _a, _b, _c;
    const hasTranscript = Boolean((_a = input.transcript) === null || _a === void 0 ? void 0 : _a.trim());
    const hasDescription = Boolean((_b = input.video_description) === null || _b === void 0 ? void 0 : _b.trim());
    const hasMemo = Boolean((_c = input.user_memo) === null || _c === void 0 ? void 0 : _c.trim());
    if (hasTranscript && (hasDescription || hasMemo))
        return 'mixed';
    if (hasTranscript)
        return 'transcript';
    if (hasDescription)
        return 'description';
    return 'mixed';
};
const buildFallback = (args) => {
    const transcriptOrDescription = args.transcript.trim() || args.description.trim();
    const core = transcriptOrDescription || args.title;
    const oneLine = clampLength(`${args.title}` || '유튜브 요약', 20);
    const short = args.description.trim()
        ? `${args.description.trim().slice(0, 240)}${args.description.trim().length > 240 ? '…' : ''}`
        : '이 영상은 핵심 내용을 정리해 다시 찾아볼 수 있도록 만든 요약 데이터입니다.';
    const detailed = core
        ? core.slice(0, 1400) + (core.length > 1400 ? '…' : '')
        : '자막/설명이 제공되지 않아 상세 요약을 생성할 수 없습니다.';
    const fallbackTagsBase = buildFallbackTags({ title: args.title, description: args.description, userMemo: args.userMemo });
    const fallbackTags = ensureMinArraySize(fallbackTagsBase, 5, ['유튜브', '요약', '지식', '북마크', '정리']).slice(0, 10);
    const fallbackKeyPoints = buildFallbackKeyPoints({
        title: args.title,
        description: args.description,
        transcript: args.transcript,
        userMemo: args.userMemo,
    });
    return {
        youtubeId: args.youtubeId,
        title: args.title,
        channel: args.channel,
        thumbnail: args.thumbnail,
        duration: args.duration,
        publishedAt: args.publishedAt,
        summary: {
            oneLine,
            short,
            detailed,
            keyPoints: fallbackKeyPoints.slice(0, 7),
        },
        categories: ['기타'],
        tags: fallbackTags,
        recommendedFor: '영상 내용을 빠르게 복습하거나 나중에 다시 참고하려는 사람',
        difficulty: '입문',
        watchIntent: args.userMemo.trim() ? clampLength(args.userMemo, 120) : '요약 복습용',
        userMemoSuggestion: 'user_memo에 "왜 저장하는지(목적)", "원하는 결과(체크리스트/핵심개념/실습 포인트)", "현재 수준"을 적으면 요약 품질이 올라갑니다.',
        contentQuality: {
            depth: '보통',
            practicality: '혼합',
        },
        embed: {
            iframeUrl: args.iframeUrl,
            watchOnYoutubeUrl: args.watchOnYoutubeUrl,
        },
        summarySource: args.summarySource,
    };
};
// 2026 Recommended Config: Timeouts extended for long context processing
exports.analyzeYoutubeVideo = v2_1.https.onCall({ timeoutSeconds: 300, memory: '1GiB', secrets: [secrets_1.geminiApiKey] }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!request.auth) {
        throw new v2_1.https.HttpsError('unauthenticated', 'Login is required');
    }
    const parsedRequest = AnalyzeYoutubeVideoRequestSchema.safeParse(request.data);
    if (!parsedRequest.success) {
        throw new v2_1.https.HttpsError('invalid-argument', 'Invalid request');
    }
    const input = parsedRequest.data;
    const youtubeId = extractYoutubeIdFromUrl(input.youtube_url);
    if (!youtubeId) {
        throw new v2_1.https.HttpsError('invalid-argument', 'Invalid youtube_url');
    }
    const urls = buildYoutubeUrls(youtubeId);
    const summarySource = resolveSummarySource(input);
    const model = await createGeminiModel();
    if (!model) {
        v2_1.logger.error('analyzeYoutubeVideo:missing_gemini_key', {
            youtubeId,
            model: (_a = process.env.GEMINI_MODEL) !== null && _a !== void 0 ? _a : 'gemini-2.5-flash',
            message: 'GEMINI_API_KEY is not set',
        });
        throw new v2_1.https.HttpsError('failed-precondition', 'Gemini API Key가 설정되지 않았습니다. Firebase Functions Secret(GEMINI_API_KEY) 설정 후 재배포하세요.');
    }
    v2_1.logger.info('analyzeYoutubeVideo:start', {
        youtubeId,
        hasTranscript: Boolean((_b = input.transcript) === null || _b === void 0 ? void 0 : _b.trim()),
        hasMemo: Boolean((_c = input.user_memo) === null || _c === void 0 ? void 0 : _c.trim()),
    });
    const oembed = await fetchYoutubeOEmbed(input.youtube_url);
    let watchHtml = '';
    let ldVideo = null;
    try {
        watchHtml = await fetchText(urls.watchOnYoutubeUrl, 8000);
        ldVideo = parseYoutubeLdVideoObject(watchHtml);
    }
    catch (error) {
        v2_1.logger.warn('analyzeYoutubeVideo:watch_fetch_failed', {
            youtubeId,
            message: error instanceof Error ? error.message : String(error),
        });
    }
    const baseTitle = (((_d = input.video_title) === null || _d === void 0 ? void 0 : _d.trim()) || (oembed === null || oembed === void 0 ? void 0 : oembed.title) || '').trim();
    const baseDescription = ((_e = input.video_description) !== null && _e !== void 0 ? _e : '').trim();
    const transcript = ((_f = input.transcript) !== null && _f !== void 0 ? _f : '').trim();
    const userMemo = ((_g = input.user_memo) !== null && _g !== void 0 ? _g : '').trim();
    const baseChannel = ((oembed === null || oembed === void 0 ? void 0 : oembed.author_name) || '').trim();
    const ldDuration = ((ldVideo === null || ldVideo === void 0 ? void 0 : ldVideo.duration) || '').trim();
    const ldPublishedAt = ((ldVideo === null || ldVideo === void 0 ? void 0 : ldVideo.uploadDate) || '').trim();
    const transcriptForPrompt = transcript.length > 90000 ? `${transcript.slice(0, 90000)}…` : transcript;
    const descriptionForPrompt = baseDescription.length > 12000 ? `${baseDescription.slice(0, 12000)}…` : baseDescription;
    const systemPrompt = `너는 Gemini 2.5 Based "유튜브 영상 심층 분석 및 지식화 AI"다.
단순한 요약이 아니라, **대학 강의 노트나 실무 기술 블로그 수준의 깊이 있는 지식 정리**를 수행해야 한다.

목표: 다 바쁜 전문가가 이 글만 보고도 "영상 전체 내용을 완벽히 파악했다"고 느낄 수 있을 정도로 상세하고 구조적인 분석 결과 도출.

분석 원칙 (Strict Rules):
1. **분량 필수 준수**: 상세 요약(detailed)은 **최소 1500자 이상** 작성하라. 짧으면 실패로 간주한다.
2. **구체성 강화**: "설명함", "다룸" 같은 모호한 표현 금지. **"A를 위해 B기술을 사용하여 C효과를 냄"**처럼 구체적 인과관계와 방법론을 서술하라.
3. **숫자와 예시 포함**: 영상에 등장하는 수치, 코드, 구체적 사례, 툴 이름 등을 절대 누락하지 마라.
4. **구조적 정리**: 서론-본론-결론이 아니라, **핵심 주제별 소제목(##)과 글머리 기호**를 사용하여 논리적으로 완벽하게 구조화하라.
5. **비판적 사고**: 단순 내용 전달을 넘어, 이 정보가 왜 중요한지, 실무에서 어떻게 쓰이는지 **Insight**를 덧붙여라.

중요: 반드시 JSON ONLY로만 응답하라. Markdown 코드블록(\`\`\`)을 포함하지 말고, 순수 JSON 텍스트만 출력하라.`;
    const userPrompt = `Input Data:
- youtube_url: ${input.youtube_url}
- youtubeId: ${youtubeId}
- video_title: ${baseTitle}
- video_description: ${descriptionForPrompt}
- transcript: ${transcriptForPrompt}
- user_memo: ${userMemo}

Core Context 우선순위:
1) transcript (분석의 80% 비중)
2) user_memo (사용자의 의도 반영)
3) video_description (보조 정보)

상세 요구사항 (Requirements):
1. **summary.oneLine**: 30자 이내, 강렬한 한 줄 요약 (예: "Next.js 14의 Server Actions 도입 배경과 3가지 핵심 이점 완벽 정리")
2. **summary.short**: 5~7문장. 전체 흐름을 요약하되, 결론을 포함할 것.
3. **summary.detailed**: **가장 중요함**.
    - 영상의 모든 챕터/주제를 빠짐없이 다룰 것.
    - 각 섹션마다 구체적인 설명, 원리, 예시를 포함할 것.
    - 텍스트만 읽어도 공부가 되도록 작성할 것.
4. **summary.keyPoints**: 5~10개. 단순 나열이 아니라, "Actionable Insight" 형태로 작성 (예: "X 대신 Y를 사용하여 성능 20% 개선")

Output JSON Schema(반드시 이 구조 그대로):
{
  "youtubeId": "",
  "title": "${baseTitle.slice(0, 50)}...",
  "channel": "${baseChannel}",
  "thumbnail": { "default": "", "high": "" },
  "duration": "",
  "publishedAt": "",

  "summary": {
    "oneLine": "",
    "short": "",
    "detailed": "",
    "keyPoints": []
  },

  "categories": [],
  "tags": [],

  "recommendedFor": "",
  "difficulty": "입문",

  "watchIntent": "",
  "userMemoSuggestion": "",

  "contentQuality": {
    "depth": "보통",
    "practicality": "혼합"
  },

  "embed": {
    "iframeUrl": "",
    "watchOnYoutubeUrl": ""
  },

  "summarySource": "${summarySource}"
}

주의:
- JSON 문법 엄수 (Trailing comma 금지)
- 값은 한국어로 작성
- 빈 값은 빈 문자열("")로 처리`;
    const fallback = buildFallback({
        youtubeId,
        title: baseTitle || 'YouTube Video',
        channel: baseChannel,
        thumbnail: urls.thumbnail,
        duration: ldDuration,
        publishedAt: ldPublishedAt,
        watchOnYoutubeUrl: urls.watchOnYoutubeUrl,
        iframeUrl: urls.iframeUrl,
        summarySource,
        description: baseDescription,
        transcript,
        userMemo,
    });
    try {
        v2_1.logger.info('analyzeYoutubeVideo:prompt_prepared', {
            youtubeId,
            modelName: process.env.GEMINI_MODEL,
            systemPromptLength: systemPrompt.length,
            userPromptLength: userPrompt.length,
        });
        // Retry Logic for API Stability (common in 2026/GenAI apps)
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (attempt > 1)
                    v2_1.logger.info(`analyzeYoutubeVideo:retry_attempt_${attempt}`);
                const completion = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 8192,
                    },
                });
                const text = completion.response.text();
                const jsonText = extractJsonObjectText(text);
                // ... existing parsing logic ...
                const parsedJson = JSON.parse(jsonText);
                const normalized = (() => {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
                    if (!parsedJson || typeof parsedJson !== 'object')
                        return {};
                    const record = parsedJson;
                    const thumbnail = record.thumbnail && typeof record.thumbnail === 'object' ? record.thumbnail : {};
                    const embed = record.embed && typeof record.embed === 'object' ? record.embed : {};
                    const summary = record.summary && typeof record.summary === 'object' ? record.summary : {};
                    const rawDifficulty = record.difficulty;
                    const rawContentQuality = record.contentQuality && typeof record.contentQuality === 'object' ? record.contentQuality : {};
                    return {
                        youtubeId: String((_a = record.youtubeId) !== null && _a !== void 0 ? _a : ''),
                        title: String((_b = record.title) !== null && _b !== void 0 ? _b : ''),
                        channel: String((_c = record.channel) !== null && _c !== void 0 ? _c : ''),
                        thumbnail: {
                            default: String((_d = thumbnail.default) !== null && _d !== void 0 ? _d : ''),
                            high: String((_e = thumbnail.high) !== null && _e !== void 0 ? _e : ''),
                        },
                        duration: String((_f = record.duration) !== null && _f !== void 0 ? _f : ''),
                        publishedAt: String((_g = record.publishedAt) !== null && _g !== void 0 ? _g : ''),
                        summary: {
                            oneLine: String((_h = summary.oneLine) !== null && _h !== void 0 ? _h : ''),
                            short: String((_j = summary.short) !== null && _j !== void 0 ? _j : ''),
                            detailed: String((_k = summary.detailed) !== null && _k !== void 0 ? _k : ''),
                            keyPoints: normalizeStringArray(summary.keyPoints),
                        },
                        categories: normalizeStringArray(record.categories),
                        tags: normalizeStringArray(record.tags),
                        recommendedFor: String((_l = record.recommendedFor) !== null && _l !== void 0 ? _l : ''),
                        difficulty: pickDifficulty(rawDifficulty),
                        watchIntent: String((_m = record.watchIntent) !== null && _m !== void 0 ? _m : ''),
                        userMemoSuggestion: String((_o = record.userMemoSuggestion) !== null && _o !== void 0 ? _o : ''),
                        contentQuality: {
                            depth: pickDepth(rawContentQuality.depth),
                            practicality: pickPracticality(rawContentQuality.practicality),
                        },
                        embed: {
                            iframeUrl: String((_p = embed.iframeUrl) !== null && _p !== void 0 ? _p : ''),
                            watchOnYoutubeUrl: String((_q = embed.watchOnYoutubeUrl) !== null && _q !== void 0 ? _q : ''),
                        },
                        summarySource,
                    };
                })();
                const validated = AnalyzeYoutubeVideoResultSchema.safeParse(normalized);
                if (!validated.success) {
                    throw new Error(`Schema Validation Failed: ${validated.error.message}`);
                }
                const candidate = validated.data;
                const fallbackTags = buildFallbackTags({
                    title: candidate.title || fallback.title,
                    description: baseDescription,
                    userMemo,
                });
                const ensuredFallbackTags = ensureMinArraySize(fallbackTags, 5, ['유튜브', '요약', '지식', '북마크', '정리']).slice(0, 10);
                const fallbackKeyPoints = buildFallbackKeyPoints({
                    title: candidate.title || fallback.title,
                    description: baseDescription,
                    transcript,
                    userMemo,
                });
                const merged = {
                    youtubeId,
                    title: (candidate.title || fallback.title).trim(),
                    channel: (candidate.channel || fallback.channel || baseChannel).trim(),
                    thumbnail: {
                        default: (candidate.thumbnail.default || urls.thumbnail.default).trim(),
                        high: (candidate.thumbnail.high || urls.thumbnail.high).trim(),
                    },
                    duration: (candidate.duration || ldDuration || '').trim(),
                    publishedAt: (candidate.publishedAt || ldPublishedAt || '').trim(),
                    summary: {
                        oneLine: clampLength(candidate.summary.oneLine || fallback.summary.oneLine, 20),
                        short: (candidate.summary.short || fallback.summary.short).trim(),
                        detailed: (candidate.summary.detailed || fallback.summary.detailed).trim(),
                        keyPoints: ensureMinArraySize(uniq(candidate.summary.keyPoints).slice(0, 7), 4, fallbackKeyPoints).slice(0, 7),
                    },
                    categories: ensureMinArraySize(uniq(candidate.categories).slice(0, 3), 1, fallback.categories).slice(0, 3),
                    tags: ensureMinArraySize(uniq(candidate.tags).slice(0, 10), 5, ensuredFallbackTags).slice(0, 10),
                    recommendedFor: (candidate.recommendedFor || fallback.recommendedFor).trim(),
                    difficulty: candidate.difficulty,
                    watchIntent: (candidate.watchIntent || fallback.watchIntent).trim(),
                    userMemoSuggestion: (candidate.userMemoSuggestion || fallback.userMemoSuggestion).trim(),
                    contentQuality: {
                        depth: candidate.contentQuality.depth,
                        practicality: candidate.contentQuality.practicality,
                    },
                    embed: {
                        iframeUrl: urls.iframeUrl,
                        watchOnYoutubeUrl: urls.watchOnYoutubeUrl,
                    },
                    summarySource,
                };
                v2_1.logger.info('analyzeYoutubeVideo:success', { youtubeId, attempt });
                return merged;
            }
            catch (e) {
                lastError = e;
                const message = e instanceof Error ? e.message : String(e);
                const stack = e instanceof Error ? e.stack : undefined;
                v2_1.logger.warn(`analyzeYoutubeVideo:attempt_${attempt}_failed`, {
                    message,
                    stack
                });
                // 1초 대기 후 재시도
                await new Promise(res => setTimeout(res, 1000));
            }
        }
        // 모든 시도 실패 시
        v2_1.logger.error('analyzeYoutubeVideo:all_attempts_failed', {
            youtubeId,
            finalError: lastError instanceof Error ? lastError.message : String(lastError)
        });
        const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError || 'unknown');
        throw new v2_1.https.HttpsError('internal', `Gemini Analysis Failed after 3 attempts. Last error: ${lastErrorMessage}`);
    }
    catch (error) {
        if (error instanceof v2_1.https.HttpsError)
            throw error;
        v2_1.logger.error('analyzeYoutubeVideo:fatal_error', {
            youtubeId,
            message: error instanceof Error ? error.message : String(error),
        });
        throw new v2_1.https.HttpsError('internal', 'System Error during analysis processing.');
    }
});
//# sourceMappingURL=analyzeYoutubeVideo.js.map