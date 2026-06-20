"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneralAgent = void 0;
const Agent_1 = require("./Agent");
const LLMAdapter_1 = require("./llm/LLMAdapter");
/**
 * General Agent
 *
 * 다른 전문 에이전트에 해당하지 않는 일반적인 작업을 처리합니다.
 * 대화형 응답, 질문 답변, 일반 정보 제공 등을 담당합니다.
 */
class GeneralAgent extends Agent_1.BaseAgent {
    constructor() {
        super(...arguments);
        this.llm = LLMAdapter_1.LLMAdapterFactory.fromEnv();
    }
    async execute(request) {
        var _a;
        const { userInput, context, skillInstructions } = request.inputs;
        const logs = [];
        logs.push(`[GeneralAgent] Processing: ${userInput.substring(0, 50)}...`);
        try {
            const systemPrompt = `You are a helpful AI assistant for the Propig project management system.

${skillInstructions ? `Special Instructions:\n${skillInstructions}` : ''}

Guidelines:
- Respond in Korean unless specifically asked otherwise
- Be concise but thorough
- Provide actionable advice when possible
- If you need more information, ask clarifying questions

${context ? `Context:\n${context}` : ''}`;
            const response = await this.llm.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userInput },
            ], { temperature: 0.7, maxTokens: 1500 });
            logs.push(`[GeneralAgent] Response generated (${((_a = response.usage) === null || _a === void 0 ? void 0 : _a.totalTokens) || 0} tokens)`);
            return this.createResponse(true, {
                type: 'general_response',
                content: response.content,
                tokenUsage: response.usage,
            }, logs);
        }
        catch (error) {
            logs.push(`[GeneralAgent] Error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'GENERAL_AGENT_ERROR',
                message: String(error),
            });
        }
    }
}
exports.GeneralAgent = GeneralAgent;
//# sourceMappingURL=GeneralAgent.js.map