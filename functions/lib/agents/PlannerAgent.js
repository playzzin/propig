"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerAgent = void 0;
const Agent_1 = require("./Agent");
const schemas_1 = require("./schemas");
const LLMAdapter_1 = require("./llm/LLMAdapter");
/**
 * Planner Agent (LLM-Powered)
 *
 * Creates an execution plan based on analyzed requirements using LLM.
 * Breaks down the task into actionable steps.
 */
class PlannerAgent extends Agent_1.BaseAgent {
    constructor() {
        super(...arguments);
        this.llm = LLMAdapter_1.LLMAdapterFactory.fromEnv();
    }
    async execute(request) {
        var _a;
        const { requirements, intent, userInput } = request.inputs;
        const logs = [];
        logs.push(`[Planner] Using LLM provider: ${this.llm.getProvider()}`);
        logs.push(`[Planner] Creating plan for: ${intent}`);
        logs.push(`[Planner] Requirements: ${requirements.join(', ')}`);
        try {
            const systemPrompt = `You are a technical planning expert. Create a step-by-step execution plan for implementing code.

Requirements:
- Return a JSON array of strings (each step as a string)
- Each step should be clear, actionable, and specific
- Steps should be in logical execution order
- Include 3-7 steps total
- Focus on implementation details, not high-level concepts

Example:
["Define TypeScript interfaces for props and state", "Implement main component with useState hooks", "Add error handling with try-catch", "Export component with proper typing"]

Return ONLY the JSON array, no markdown or explanations.`;
            const userPrompt = `Task: ${userInput}
Intent: ${intent}
Requirements: ${requirements.join(', ')}

Create an implementation plan:`;
            const llmResponse = await this.llm.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ], {
                temperature: 0.5,
                maxTokens: 800,
            });
            logs.push(`[Planner] LLM responded (${((_a = llmResponse.usage) === null || _a === void 0 ? void 0 : _a.totalTokens) || 0} tokens)`);
            // Parse LLM response as JSON
            let plan;
            try {
                plan = JSON.parse(llmResponse.content.trim());
            }
            catch (_b) {
                // Fallback: extract JSON from markdown code blocks
                const jsonMatch = llmResponse.content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
                if (jsonMatch) {
                    plan = JSON.parse(jsonMatch[1]);
                }
                else {
                    throw new Error('LLM response is not valid JSON array');
                }
            }
            // Validate with Zod
            const validatedPlan = schemas_1.plannerOutputSchema.parse(plan);
            logs.push(`[Planner] Plan created with ${validatedPlan.length} steps`);
            validatedPlan.forEach((step, i) => {
                logs.push(`[Planner]   ${i + 1}. ${step}`);
            });
            return this.createResponse(true, validatedPlan, logs);
        }
        catch (error) {
            logs.push(`[Planner] Error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'PLANNING_FAILED',
                message: String(error),
            });
        }
    }
}
exports.PlannerAgent = PlannerAgent;
//# sourceMappingURL=PlannerAgent.js.map