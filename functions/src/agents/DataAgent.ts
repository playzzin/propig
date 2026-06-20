import { BaseAgent } from './Agent';
import { AgentRequest, AgentResponse } from './types';
import { LLMAdapterFactory } from './llm/LLMAdapter';

/**
 * Data Agent
 * 
 * 데이터 분석, Excel/CSV 처리, 통계 계산을 담당합니다.
 * LLM을 활용하여 데이터 분석 쿼리를 처리합니다.
 */
export class DataAgent extends BaseAgent {
    private llm = LLMAdapterFactory.fromEnv();

    async execute(request: AgentRequest): Promise<AgentResponse> {
        const { userInput, data, skillInstructions } = request.inputs as {
            userInput: string;
            data?: unknown;
            skillInstructions?: string;
        };
        const logs: string[] = [];

        logs.push(`[DataAgent] Processing: ${userInput.substring(0, 50)}...`);

        try {
            // 데이터가 제공된 경우: 실제 분석 수행
            if (data) {
                logs.push(`[DataAgent] Data provided, performing analysis`);
                const analysisResult = await this.analyzeData(userInput, data, skillInstructions || '', logs);
                return this.createResponse(true, analysisResult, logs);
            }

            // 데이터가 없는 경우: 분석 방법 안내 또는 샘플 분석
            logs.push(`[DataAgent] No data provided, generating analysis guidance`);
            const guidance = await this.generateAnalysisGuidance(userInput, logs);
            return this.createResponse(true, guidance, logs);

        } catch (error) {
            logs.push(`[DataAgent] Error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'DATA_AGENT_ERROR',
                message: String(error),
            });
        }
    }

    /**
     * 데이터 분석 수행
     */
    private async analyzeData(
        userInput: string,
        data: unknown,
        skillInstructions: string,
        logs: string[]
    ): Promise<unknown> {
        const dataPreview = this.formatDataPreview(data);
        logs.push(`[DataAgent] Data preview: ${dataPreview.length} chars`);

        const systemPrompt = `You are a data analyst expert. Analyze the provided data and respond to user queries.

${skillInstructions ? `Special Instructions:\n${skillInstructions}` : ''}

Always respond in JSON format:
{
  "analysis": "분석 결과 설명",
  "statistics": { ... },
  "insights": ["insight 1", "insight 2"],
  "recommendations": ["recommendation 1"]
}

Respond in Korean.`;

        const userPrompt = `User Query: ${userInput}

Data:
${dataPreview}

Perform the requested analysis.`;

        logs.push(`[DataAgent] Analyzing with LLM...`);

        const response = await this.llm.chat(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            { temperature: 0.3, maxTokens: 2000 }
        );

        try {
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch {
            // JSON 파싱 실패
        }

        return { rawResponse: response.content };
    }

    /**
     * 분석 가이던스 생성
     */
    private async generateAnalysisGuidance(userInput: string, logs: string[]): Promise<unknown> {
        logs.push(`[DataAgent] Generating analysis guidance`);

        const systemPrompt = `You are a data analyst assistant. The user wants to perform data analysis but hasn't provided data yet.
Help them understand what data they need and how to proceed.

Respond in JSON format:
{
  "requiredDataFormat": "필요한 데이터 형식 설명",
  "suggestedApproach": ["단계 1", "단계 2"],
  "exampleQuery": "예시 분석 쿼리",
  "tips": ["팁 1", "팁 2"]
}

Respond in Korean.`;

        const response = await this.llm.chat(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userInput },
            ],
            { temperature: 0.5, maxTokens: 1000 }
        );

        try {
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return { type: 'guidance', ...JSON.parse(jsonMatch[0]) };
            }
        } catch {
            // JSON 파싱 실패
        }

        return { type: 'guidance', rawResponse: response.content };
    }

    /**
     * 데이터 미리보기 포맷팅
     */
    private formatDataPreview(data: unknown): string {
        if (typeof data === 'string') {
            return data.substring(0, 5000);
        }

        if (Array.isArray(data)) {
            const preview = data.slice(0, 10);
            return JSON.stringify(preview, null, 2);
        }

        if (typeof data === 'object' && data !== null) {
            return JSON.stringify(data, null, 2).substring(0, 5000);
        }

        return String(data);
    }
}
