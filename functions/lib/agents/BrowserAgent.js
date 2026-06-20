"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserAgent = void 0;
const Agent_1 = require("./Agent");
const LLMAdapter_1 = require("./llm/LLMAdapter");
/**
 * Browser Agent
 *
 * 웹 페이지 스크래핑, URL 분석, 웹 콘텐츠 추출을 담당합니다.
 * 실제 브라우저 자동화는 Cloud Functions에서 제한적이므로,
 * fetch + LLM 기반 콘텐츠 분석 방식을 사용합니다.
 */
class BrowserAgent extends Agent_1.BaseAgent {
    constructor() {
        super(...arguments);
        this.llm = LLMAdapter_1.LLMAdapterFactory.fromEnv();
    }
    static clampText(value, max) {
        const trimmed = value.trim();
        if (trimmed.length <= max)
            return trimmed;
        return `${trimmed.slice(0, max)}…`;
    }
    extractTitleFromHtml(html) {
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (!(match === null || match === void 0 ? void 0 : match[1]))
            return '';
        return match[1].replace(/\s+/g, ' ').trim();
    }
    extractMetaFromHtml(html) {
        const meta = {};
        const getContent = (key) => {
            var _a, _b;
            const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
            const match = html.match(pattern);
            return (_b = (_a = match === null || match === void 0 ? void 0 : match[1]) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '';
        };
        for (const k of BrowserAgent.META_KEYS) {
            const v = getContent(k);
            if (v)
                meta[k] = v;
        }
        const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
        if (canonicalMatch === null || canonicalMatch === void 0 ? void 0 : canonicalMatch[1])
            meta.canonical = canonicalMatch[1].trim();
        return meta;
    }
    extractTextFromHtml(html) {
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/\s+/g, ' ')
            .trim();
    }
    async fetchPage(url, logs) {
        try {
            const response = await fetch(url, {
                redirect: 'follow',
                headers: BrowserAgent.DEFAULT_HEADERS,
            });
            if (!response.ok) {
                logs.push(`[BrowserAgent] Fetch failed: ${response.status}`);
                return null;
            }
            const rawHtml = await response.text();
            const html = BrowserAgent.clampText(rawHtml, BrowserAgent.MAX_HTML_CHARS);
            logs.push(`[BrowserAgent] Fetched ${rawHtml.length} chars (clamped: ${html.length})`);
            const title = this.extractTitleFromHtml(html);
            const meta = this.extractMetaFromHtml(html);
            const rawText = this.extractTextFromHtml(html);
            const text = BrowserAgent.clampText(rawText, BrowserAgent.MAX_TEXT_CHARS);
            return {
                url: response.url || url,
                html,
                text,
                title,
                meta,
            };
        }
        catch (error) {
            logs.push(`[BrowserAgent] Fetch error: ${error}`);
            return null;
        }
    }
    async execute(request) {
        const { userInput, url, skillInstructions } = request.inputs;
        const logs = [];
        logs.push(`[BrowserAgent] Processing: ${userInput.substring(0, 50)}...`);
        try {
            // Step 1: URL 추출 또는 추론
            const targetUrl = url || this.extractUrl(userInput) || this.inferUrl(userInput);
            if (targetUrl) {
                logs.push(`[BrowserAgent] Target URL: ${targetUrl}`);
                // Step 2: 페이지 콘텐츠 가져오기
                const page = await this.fetchPage(targetUrl, logs);
                if (page) {
                    // Step 3: 특화된 파싱 또는 LLM 분석
                    let analysisResult;
                    if (targetUrl.includes('naver.com/main/ranking')) {
                        // 네이버 뉴스 랭킹 특화 파싱
                        analysisResult = await this.parseNaverNewsRanking(page.html, logs);
                    }
                    else {
                        // 일반 LLM 분석
                        analysisResult = await this.analyzeContent(userInput, page.text, skillInstructions || '', logs);
                    }
                    return this.createResponse(true, {
                        url: page.url,
                        page: {
                            title: page.title,
                            meta: page.meta,
                            textLength: page.text.length,
                            htmlLength: page.html.length,
                        },
                        analysis: analysisResult,
                        scrapedAt: new Date().toISOString(),
                    }, logs);
                }
            }
            // URL이 없는 경우: 일반적인 웹 관련 질문 처리
            logs.push(`[BrowserAgent] No URL found, processing as general web query`);
            const generalResponse = await this.handleGeneralWebQuery(userInput, logs);
            return this.createResponse(true, generalResponse, logs);
        }
        catch (error) {
            logs.push(`[BrowserAgent] Error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'BROWSER_AGENT_ERROR',
                message: String(error),
            });
        }
    }
    /**
     * 일반적인 스크래핑 대상의 URL 추론
     */
    inferUrl(text) {
        const lowerText = text.toLowerCase();
        // 네이버 뉴스 관련
        if (lowerText.includes('네이버 뉴스') || lowerText.includes('네이버뉴스')) {
            return 'https://news.naver.com/main/ranking/popularDay.naver';
        }
        if (lowerText.includes('네이버 검색') && lowerText.includes('뉴스')) {
            return 'https://news.naver.com/main/ranking/popularDay.naver';
        }
        // 다음 뉴스
        if (lowerText.includes('다음 뉴스') || lowerText.includes('다음뉴스')) {
            return 'https://news.daum.net/ranking/popular';
        }
        // 구글 뉴스
        if (lowerText.includes('구글 뉴스') || lowerText.includes('google news')) {
            return 'https://news.google.com/home?hl=ko&gl=KR&ceid=KR:ko';
        }
        return null;
    }
    /**
     * 네이버 뉴스 랭킹 특화 파싱
     */
    async parseNaverNewsRanking(html, logs) {
        var _a;
        logs.push('[BrowserAgent] Parsing Naver News ranking...');
        const articles = [];
        // JSON-LD 스크립트에서 뉴스 데이터 추출 시도
        const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (jsonLdMatch) {
            try {
                const jsonData = JSON.parse(jsonLdMatch[1]);
                if (jsonData.itemListElement) {
                    for (const item of jsonData.itemListElement.slice(0, 10)) {
                        articles.push({
                            rank: item.position || articles.length + 1,
                            title: item.name || ((_a = item.item) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown',
                        });
                    }
                }
            }
            catch (_b) {
                // JSON 파싱 실패 시 HTML 파싱으로 폴백
            }
        }
        // HTML에서 뉴스 제목 추출 (rankingnews_box 클래스 등)
        if (articles.length === 0) {
            // 클래스 기반 파싱
            const titleMatches = html.matchAll(/<a[^>]*class="[^"]*(?:list_content|list_title|rankingnews_list)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi);
            let rank = 1;
            for (const match of titleMatches) {
                if (rank <= 10) {
                    const title = match[1]
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    articles.push({
                        rank,
                        title: title || 'Unknown',
                    });
                    rank++;
                }
            }
        }
        // 여전히 없으면 LLM으로 분석
        if (articles.length === 0) {
            logs.push('[BrowserAgent] Fallback to LLM parsing for Naver News');
            return await this.analyzeContent('뉴스 헤드라인을 추출해줘', html, 'Extract top 10 news headlines from the page', logs);
        }
        logs.push(`[BrowserAgent] Extracted ${articles.length} news articles`);
        return {
            type: 'naver_news_ranking',
            source: 'news.naver.com',
            count: articles.length,
            articles,
            scrapedAt: new Date().toISOString(),
        };
    }
    /**
     * URL 추출 (간단한 regex)
     */
    extractUrl(text) {
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        return urlMatch ? urlMatch[0] : null;
    }
    /**
     * 페이지 콘텐츠 가져오기
     */
    /**
     * LLM으로 콘텐츠 분석
     */
    async analyzeContent(userInput, pageContent, skillInstructions, logs) {
        const systemPrompt = `You are a web content analyzer. Extract and analyze information from web pages.

${skillInstructions ? `Special Instructions:\n${skillInstructions}` : ''}

Always respond in JSON format with the following structure:
{
  "title": "페이지 제목",
  "summary": "콘텐츠 요약",
  "extractedData": { ... },
  "insights": ["key insight 1", "key insight 2"]
}`;
        const userPrompt = `User Request: ${userInput}

Page Content (truncated):
${pageContent.substring(0, 5000)}

Analyze this content and extract relevant information.`;
        logs.push(`[BrowserAgent] Analyzing content with LLM...`);
        const response = await this.llm.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { temperature: 0.3, maxTokens: 1500 });
        try {
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        }
        catch (_a) {
            // JSON 파싱 실패
        }
        return { rawResponse: response.content };
    }
    /**
     * 일반 웹 쿼리 처리
     */
    async handleGeneralWebQuery(userInput, logs) {
        logs.push(`[BrowserAgent] Handling general web query`);
        const response = await this.llm.chat([
            { role: 'system', content: 'You are a helpful web assistant. Respond in Korean.' },
            { role: 'user', content: userInput },
        ], { temperature: 0.7, maxTokens: 1000 });
        return {
            type: 'general_response',
            content: response.content,
        };
    }
}
exports.BrowserAgent = BrowserAgent;
BrowserAgent.MAX_HTML_CHARS = 250000;
BrowserAgent.MAX_TEXT_CHARS = 12000;
BrowserAgent.DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
};
BrowserAgent.META_KEYS = [
    'description',
    'og:title',
    'og:description',
    'og:image',
    'og:url',
    'twitter:title',
    'twitter:description',
    'twitter:image',
];
//# sourceMappingURL=BrowserAgent.js.map