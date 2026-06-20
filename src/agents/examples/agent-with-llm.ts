/**
 * Example: Integrating LLM Adapter with Agents
 *
 * This file demonstrates how to upgrade agents from mock logic
 * to real LLM-powered implementations.
 *
 * @example
 * ```bash
 * # Set environment variables
 * export LLM_PROVIDER=openai
 * export OPENAI_API_KEY=sk-...
 *
 * # Run example
 * npx tsx src/agents/examples/agent-with-llm.ts
 * ```
 */

import { BaseAgent } from '../Agent';
import { AgentRequest, AgentResponse } from '../types';
import { LLMAdapterFactory, LLMMessage } from '../llm/LLMAdapter';
import { analyzerOutputSchema, type AnalyzerOutput } from '../schemas';

// ============================================
// Example 1: LLM-Powered Analyzer Agent
// ============================================

export class LLMAnalyzerAgent extends BaseAgent {
    private llm = LLMAdapterFactory.fromEnv();

    async execute(request: AgentRequest): Promise<AgentResponse> {
        const { userInput } = request.inputs as { userInput: string };
        const logs: string[] = [];

        logs.push(`[LLMAnalyzer] Using provider: ${this.llm.getProvider()}`);
        logs.push(`[LLMAnalyzer] Analyzing input: "${userInput}"`);

        try {
            // Build LLM prompt
            const messages: LLMMessage[] = [
                {
                    role: 'system',
                    content: `You are a code analysis expert. Analyze the user's request and return a JSON object with:
- intent: The main goal (e.g., "generate_code", "refactor", "debug")
- requirements: Array of technical requirements (e.g., ["stateless", "typescript", "modular"])
- complexity: One of "low", "medium", "high"

Return ONLY valid JSON, no markdown or explanations.`,
                },
                {
                    role: 'user',
                    content: userInput,
                },
            ];

            // Call LLM
            const llmResponse = await this.llm.chat(messages, {
                temperature: 0.3, // Low temperature for structured output
                maxTokens: 500,
            });

            logs.push(`[LLMAnalyzer] LLM responded (${llmResponse.usage?.totalTokens} tokens)`);

            // Parse LLM response as JSON
            const analysisData = JSON.parse(llmResponse.content) as AnalyzerOutput;

            // Validate with Zod
            const validatedAnalysis = analyzerOutputSchema.parse(analysisData);

            logs.push(`[LLMAnalyzer] Analysis complete: ${validatedAnalysis.intent}`);

            return this.createResponse(true, validatedAnalysis, logs);
        } catch (error) {
            logs.push(`[LLMAnalyzer] Error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'LLM_ANALYSIS_FAILED',
                message: String(error),
            });
        }
    }
}

// ============================================
// Example 2: LLM-Powered Code Generator
// ============================================

export class LLMCodeAgent extends BaseAgent {
    private llm = LLMAdapterFactory.fromEnv();

    async execute(request: AgentRequest): Promise<AgentResponse> {
        const { plan } = request.inputs as { plan: string[] };
        const logs: string[] = [];

        logs.push(`[LLMCode] Generating code from plan with ${plan.length} steps`);

        try {
            const messages: LLMMessage[] = [
                {
                    role: 'system',
                    content: `You are an expert TypeScript developer. Generate production-quality code based on the execution plan.
Include proper typing, error handling, and JSDoc comments.
Return ONLY the code, no explanations or markdown code blocks.`,
                },
                {
                    role: 'user',
                    content: `Generate TypeScript code for:\n${plan.map((step, i) => `${i + 1}. ${step}`).join('\n')}`,
                },
            ];

            const llmResponse = await this.llm.chat(messages, {
                temperature: 0.7,
                maxTokens: 2000,
            });

            logs.push(`[LLMCode] Code generated (${llmResponse.usage?.totalTokens} tokens)`);

            const codeOutput = {
                code: llmResponse.content.trim(),
                language: 'typescript',
            };

            return this.createResponse(true, codeOutput, logs);
        } catch (error) {
            logs.push(`[LLMCode] Error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'LLM_CODE_GENERATION_FAILED',
                message: String(error),
            });
        }
    }
}

// ============================================
// Example 3: Running LLM-Powered Workflow
// ============================================

async function runLLMWorkflow() {
    console.log('🚀 Starting LLM-Powered Agent Workflow\n');

    const analyzer = new LLMAnalyzerAgent();
    const userInput = 'Create a user authentication service with JWT tokens';

    console.log(`📝 Input: "${userInput}"\n`);

    // Step 1: Analyze
    const analysisResult = await analyzer.execute({
        role: 'analyzer',
        inputs: { userInput },
    });

    console.log('📊 Analysis Result:');
    console.log(JSON.stringify(analysisResult, null, 2));
    console.log('\n' + analysisResult.logs.join('\n'));
    console.log('\n');

    if (!analysisResult.success) {
        console.error('❌ Analysis failed');
        return;
    }

    // Step 2: Generate Code
    const codeAgent = new LLMCodeAgent();
    const codeResult = await codeAgent.execute({
        role: 'code',
        inputs: {
            plan: ['Define AuthService interface', 'Implement JWT signing', 'Add token verification'],
        },
    });

    console.log('💻 Code Generation Result:');
    console.log(codeResult.logs.join('\n'));
    console.log('\n--- Generated Code ---');
    console.log(codeResult.data);
    console.log('\n✅ Workflow Complete!');
}

// ============================================
// Run Example (if executed directly)
// ============================================

if (require.main === module) {
    runLLMWorkflow().catch(console.error);
}

// ============================================
// Usage in Production
// ============================================

/**
 * Integration Guide:
 *
 * 1. Replace mock agents in Orchestrator.ts:
 *    ```typescript
 *    // Old (mock)
 *    private analyzer = new AnalyzerAgent();
 *
 *    // New (LLM-powered)
 *    private analyzer = new LLMAnalyzerAgent();
 *    ```
 *
 * 2. Set environment variables:
 *    ```bash
 *    # For OpenAI
 *    export LLM_PROVIDER=openai
 *    export OPENAI_API_KEY=sk-...
 *    export OPENAI_MODEL=gpt-4o-mini
 *
 *    # For Claude
 *    export LLM_PROVIDER=claude
 *    export ANTHROPIC_API_KEY=sk-ant-...
 *    export CLAUDE_MODEL=claude-3-5-sonnet-20241022
 *    ```
 *
 * 3. Update each agent file to extend this pattern:
 *    - Import LLMAdapterFactory
 *    - Create LLM instance with fromEnv()
 *    - Build system + user prompts
 *    - Parse and validate LLM response
 *    - Return validated data
 *
 * 4. Handle errors gracefully:
 *    - Retry with exponential backoff (already in Orchestrator)
 *    - Timeout protection (already in Orchestrator)
 *    - Zod validation (already in all agents)
 */
