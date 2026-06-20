import { BaseAgent } from './Agent';
import { AgentRequest, AgentResponse } from './types';
import { LLMAdapterFactory } from './llm/LLMAdapter';

/**
 * General Agent
 * 
 * 다른 전문 에이전트에 해당하지 않는 일반적인 작업을 처리합니다.
 * 대화형 응답, 질문 답변, 일반 정보 제공 등을 담당합니다.
 */
export class GeneralAgent extends BaseAgent {
    private llm = LLMAdapterFactory.fromEnv();

    async execute(request: AgentRequest): Promise<AgentResponse> {
        const { userInput, context, skillInstructions } = request.inputs as {
            userInput: string;
            context?: string;
            skillInstructions?: string;
        };
        const logs: string[] = [];

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

            const response = await this.llm.chat(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userInput },
                ],
                { temperature: 0.7, maxTokens: 1500 }
            );

            logs.push(`[GeneralAgent] Response generated (${response.usage?.totalTokens || 0} tokens)`);

            return this.createResponse(true, {
                type: 'general_response',
                content: response.content,
                tokenUsage: response.usage,
            }, logs);

        } catch (error) {
            logs.push(`[GeneralAgent] Error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'GENERAL_AGENT_ERROR',
                message: String(error),
            });
        }
    }
}
