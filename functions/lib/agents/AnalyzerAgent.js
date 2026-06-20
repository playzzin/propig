"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyzerAgent = void 0;
const Agent_1 = require("./Agent");
const schemas_1 = require("./schemas");
const LLMAdapter_1 = require("./llm/LLMAdapter");
/**
 * Analyzer Agent (LLM-Powered)
 *
 * Analyzes user input to extract intent, requirements, and complexity using LLM.
 * This is the first step in the agent workflow.
 *
 * @example
 * ```typescript
 * const analyzer = new AnalyzerAgent();
 * const result = await analyzer.execute({
 *   role: 'analyzer',
 *   inputs: { userInput: 'Create a React component' }
 * });
 * ```
 */
class AnalyzerAgent extends Agent_1.BaseAgent {
    constructor() {
        super(...arguments);
        this.llm = LLMAdapter_1.LLMAdapterFactory.fromEnv();
    }
    /**
     * Execute analysis on user input
     *
     * @param request - Agent request containing userInput
     * @returns Promise<AgentResponse> with AnalyzerOutput data
     */
    async execute(request) {
        var _a;
        const { userInput } = request.inputs;
        const logs = [];
        logs.push(`[Analyzer] Using LLM provider: ${this.llm.getProvider()}`);
        logs.push(`[Analyzer] Analyzing input: "${userInput}"`);
        try {
            // Build LLM prompt for analysis
            const systemPrompt = `You are a code requirements analyzer. Analyze the user's request and return a JSON object with:
- intent: The main goal (one of: "generate_code", "refactor", "debug", "explain", "test")
- requirements: Array of technical requirements (e.g., ["stateless", "typescript", "error-handling"])
- complexity: One of "low", "medium", "high"

Return ONLY valid JSON, no markdown code blocks or explanations.

Example:
{
  "intent": "generate_code",
  "requirements": ["typescript", "react", "hooks"],
  "complexity": "medium"
}`;
            const llmResponse = await this.llm.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userInput },
            ], {
                temperature: 0.3, // Low temperature for structured output
                maxTokens: 500,
            });
            logs.push(`[Analyzer] LLM responded (${((_a = llmResponse.usage) === null || _a === void 0 ? void 0 : _a.totalTokens) || 0} tokens)`);
            // Parse LLM response as JSON
            let analysis;
            try {
                analysis = JSON.parse(llmResponse.content.trim());
            }
            catch (_b) {
                // Fallback: extract JSON from markdown code blocks if present
                const jsonMatch = llmResponse.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (jsonMatch) {
                    analysis = JSON.parse(jsonMatch[1]);
                }
                else {
                    throw new Error('LLM response is not valid JSON');
                }
            }
            // Validate output with Zod schema
            const validatedAnalysis = schemas_1.analyzerOutputSchema.parse(analysis);
            logs.push(`[Analyzer] Analysis complete. Intent: ${validatedAnalysis.intent}`);
            logs.push(`[Analyzer] Complexity: ${validatedAnalysis.complexity}`);
            logs.push(`[Analyzer] Requirements: ${validatedAnalysis.requirements.join(', ')}`);
            return this.createResponse(true, validatedAnalysis, logs);
        }
        catch (error) {
            logs.push(`[Analyzer] Error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'ANALYSIS_FAILED',
                message: String(error),
            });
        }
    }
}
exports.AnalyzerAgent = AnalyzerAgent;
//# sourceMappingURL=AnalyzerAgent.js.map