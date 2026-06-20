import { BaseAgent } from './Agent';
import { AgentRequest, AgentResponse } from './types';
import { codeOutputSchema, type CodeOutput } from './schemas';
import { LLMAdapterFactory } from './llm/LLMAdapter';

/**
 * Code Agent (LLM-Powered)
 *
 * Generates production-quality code based on the execution plan using LLM.
 * Produces TypeScript code by default with proper typing and error handling.
 */
export class CodeAgent extends BaseAgent {
  private llm = LLMAdapterFactory.fromEnv();

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const { plan, userInput, requirements } = request.inputs as {
      plan: string[];
      userInput: string;
      requirements: string[];
    };
    const logs: string[] = [];

    logs.push(`[Code] Using LLM provider: ${this.llm.getProvider()}`);
    logs.push(`[Code] Generating code for: ${userInput}`);

    try {
      const systemPrompt = `You are an expert TypeScript developer. Generate production-quality code based on the execution plan.

CRITICAL REQUIREMENTS:
- Write clean, maintainable TypeScript code
- Include proper type annotations
- Add comprehensive error handling
- Include JSDoc comments for public APIs
- Follow modern best practices
- Return ONLY the code, no markdown code blocks, no explanations

FORMATTING:
- Do NOT wrap code in \`\`\`typescript or \`\`\` blocks
- Return raw code only
- Include necessary imports at the top`;

      const userPrompt = `Task: ${userInput}

Requirements: ${requirements.join(', ')}

Execution Plan:
${plan.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Generate the complete TypeScript code:`;

      const llmResponse = await this.llm.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.7, // Higher temperature for creative code generation
          maxTokens: 2000,
        }
      );

      logs.push(`[Code] LLM responded (${llmResponse.usage?.totalTokens || 0} tokens)`);

      // Extract code (remove markdown blocks if present)
      let generatedCode = llmResponse.content.trim();

      // Remove markdown code blocks if LLM included them despite instructions
      const codeBlockMatch = generatedCode.match(/```(?:typescript|ts|javascript|js)?\s*\n?([\s\S]*?)```/);
      if (codeBlockMatch) {
        generatedCode = codeBlockMatch[1].trim();
        logs.push(`[Code] Extracted code from markdown block`);
      }

      const output: CodeOutput = {
        code: generatedCode,
        language: 'typescript',
      };

      // Validate with Zod
      const validatedOutput = codeOutputSchema.parse(output);

      logs.push(`[Code] Code generation complete (${generatedCode.length} characters)`);

      return this.createResponse(true, validatedOutput, logs);
    } catch (error) {
      logs.push(`[Code] Error: ${error}`);
      return this.createResponse(false, null, logs, {
        code: 'CODE_GENERATION_FAILED',
        message: String(error),
      });
    }
  }
}
