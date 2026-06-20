"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubAgentRouter = void 0;
const Agent_1 = require("./Agent");
const LLMAdapter_1 = require("./llm/LLMAdapter");
/**
 * SubAgentRouter
 *
 * 사용자 요청을 분석하여 적절한 서브에이전트로 라우팅합니다.
 *
 * Features:
 * - Intent classification using LLM
 * - Skill matching based on triggers
 * - Confidence-based routing decisions
 */
class SubAgentRouter extends Agent_1.BaseAgent {
    constructor() {
        super(...arguments);
        this.llm = LLMAdapter_1.LLMAdapterFactory.fromEnv();
    }
    /**
     * Execute routing decision
     */
    async execute(request) {
        const { inputs } = request;
        const userInput = inputs.userInput;
        const logs = [];
        logs.push(`[SubAgentRouter] Analyzing request: "${userInput.substring(0, 50)}..."`);
        try {
            // Step 1: Try quick keyword-based routing first
            const quickDecision = this.tryQuickRoute(userInput);
            if (quickDecision && quickDecision.confidence >= 0.8) {
                logs.push(`[SubAgentRouter] Quick route matched: ${quickDecision.subAgentType} (confidence: ${quickDecision.confidence})`);
                return this.createResponse(true, quickDecision, logs);
            }
            // Step 2: Use LLM for complex intent classification
            logs.push(`[SubAgentRouter] Using LLM for intent classification...`);
            const llmDecision = await this.classifyWithLLM(userInput);
            logs.push(`[SubAgentRouter] LLM decision: ${llmDecision.subAgentType} (confidence: ${llmDecision.confidence})`);
            return this.createResponse(true, llmDecision, logs);
        }
        catch (error) {
            logs.push(`[SubAgentRouter] Error: ${error}`);
            // Fallback to general agent
            const fallbackDecision = {
                subAgentType: 'general',
                confidence: 0.5,
                reasoning: 'Fallback to general agent due to routing error',
                suggestedSkills: [],
            };
            return this.createResponse(true, fallbackDecision, logs, {
                code: 'ROUTING_ERROR',
                message: String(error),
            });
        }
    }
    /**
     * Quick keyword-based routing (no LLM call)
     */
    tryQuickRoute(userInput) {
        const input = userInput.toLowerCase();
        // Strong shortcuts (avoid LLM dependency for common intents)
        if (input.includes('http://') ||
            input.includes('https://') ||
            input.includes('스크래핑') ||
            input.includes('크롤링') ||
            input.includes('크롤')) {
            return {
                subAgentType: 'browser',
                confidence: 0.95,
                reasoning: 'Strong keyword/url match for browser scraping',
                suggestedSkills: [],
            };
        }
        let bestMatch = null;
        for (const [, config] of Object.entries(SubAgentRouter.QUICK_ROUTES)) {
            const matchCount = config.keywords.filter(kw => input.includes(kw.toLowerCase())).length;
            const score = matchCount / config.keywords.length;
            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { type: config.type, score };
            }
        }
        if (bestMatch && bestMatch.score >= 0.2) {
            return {
                subAgentType: bestMatch.type,
                confidence: Math.min(bestMatch.score * 2, 1), // Scale up confidence
                reasoning: `Keyword match for ${bestMatch.type}`,
                suggestedSkills: [],
            };
        }
        return null;
    }
    /**
     * LLM-based intent classification
     */
    async classifyWithLLM(userInput) {
        const systemPrompt = `You are an intent classifier for a multi-agent system.
Analyze the user's request and determine which specialized sub-agent should handle it.

Available sub-agents:
- code: Code generation, refactoring, bug fixes, React/TypeScript development
- browser: Web scraping, page navigation, form filling, URL processing
- data: Excel/CSV processing, data analysis, chart generation, statistics
- file: File system operations, Firestore CRUD, database queries
- research: Web search, information gathering, document summarization
- general: General purpose tasks that don't fit other categories

Respond in JSON format:
{
  "subAgentType": "code" | "browser" | "data" | "file" | "research" | "general",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "suggestedSkills": ["skill1", "skill2"]
}`;
        const response = await this.llm.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInput },
        ], {
            temperature: 0.3,
            maxTokens: 200,
        });
        try {
            // Parse JSON response
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    subAgentType: parsed.subAgentType || 'general',
                    confidence: parsed.confidence || 0.7,
                    reasoning: parsed.reasoning || 'LLM classification',
                    suggestedSkills: parsed.suggestedSkills || [],
                };
            }
        }
        catch (_a) {
            // JSON parsing failed
        }
        // Default fallback
        return {
            subAgentType: 'general',
            confidence: 0.5,
            reasoning: 'Could not parse LLM response',
            suggestedSkills: [],
        };
    }
}
exports.SubAgentRouter = SubAgentRouter;
/**
 * Route patterns for quick matching (no LLM call needed)
 */
SubAgentRouter.QUICK_ROUTES = {
    code: {
        type: 'code',
        keywords: ['코드', '컴포넌트', '함수', '클래스', '리팩터', '버그', 'React', 'TypeScript', '구현'],
    },
    browser: {
        type: 'browser',
        keywords: ['웹사이트', '스크래핑', '크롤링', 'URL', '페이지', '브라우저', '검색'],
    },
    data: {
        type: 'data',
        keywords: ['엑셀', 'Excel', 'CSV', '데이터', '분석', '차트', '그래프', '통계'],
    },
    file: {
        type: 'file',
        keywords: ['파일', '폴더', '저장', '읽기', '쓰기', 'Firestore', '데이터베이스'],
    },
    research: {
        type: 'research',
        keywords: ['검색', '조사', '알아봐', '찾아봐', '정보', '요약'],
    },
};
//# sourceMappingURL=SubAgentRouter.js.map