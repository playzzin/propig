import { BaseAgent } from './Agent';
import { AgentRequest, AgentResponse } from './types';
import { fixOutputSchema, type FixOutput } from './schemas';
import { LLMAdapterFactory } from './llm/LLMAdapter';

/**
 * Fix Agent (Healer) - LLM-Powered
 *
 * Automatically fixes code quality issues based on review critique using LLM.
 * Part of the self-healing Reflexion loop.
 */
export class FixAgent extends BaseAgent {
  private llm = LLMAdapterFactory.fromEnv();

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const { code, issues, critique } = request.inputs as {
      code: string;
      issues?: string[];
      critique?: string;
    };
    const logs: string[] = [];

    logs.push(`[Fix] Using LLM provider: ${this.llm.getProvider()}`);
    logs.push(`[Fix] Fixing code based on critique...`);

    if (critique) {
      logs.push(`[Fix] Critique: ${critique}`);
    }

    try {
      const systemPrompt = `You are a code fixing expert. Fix the provided code based on the review critique.

CRITICAL REQUIREMENTS:
- Fix ALL issues mentioned in the critique
- Maintain the original code's functionality
- Improve code quality without changing logic
- Add missing documentation (JSDoc)
- Add error handling if missing
- Fix type safety issues
- Return ONLY the fixed code, no markdown blocks, no explanations

FORMATTING:
- Do NOT wrap code in \`\`\`typescript or \`\`\` blocks
- Return raw code only
- Preserve imports and structure`;

      const issuesText = issues && issues.length > 0 ? `\n\nSpecific Issues:\n${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}` : '';

      const userPrompt = `Original Code:
\`\`\`typescript
${code}
\`\`\`

Review Critique:
${critique || 'General quality improvements needed'}${issuesText}

Fix the code addressing all issues:`;

      const llmResponse = await this.llm.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.4, // Medium temperature for reliable fixes
          maxTokens: 2500,
        }
      );

      logs.push(`[Fix] LLM responded (${llmResponse.usage?.totalTokens || 0} tokens)`);

      // Extract fixed code (remove markdown blocks if present)
      let fixedCode = llmResponse.content.trim();

      // Remove markdown code blocks if LLM included them
      const codeBlockMatch = fixedCode.match(/```(?:typescript|ts|javascript|js)?\s*\n?([\s\S]*?)```/);
      if (codeBlockMatch) {
        fixedCode = codeBlockMatch[1].trim();
        logs.push(`[Fix] Extracted code from markdown block`);
      }

      // Determine what was fixed (simple heuristics)
      const fixesApplied: string[] = [];

      if (fixedCode.includes('/**') && !code.includes('/**')) {
        fixesApplied.push('Added JSDoc documentation');
      }

      if (fixedCode.includes('try') && !code.includes('try')) {
        fixesApplied.push('Added error handling');
      }

      if (fixedCode.length > code.length * 1.1) {
        fixesApplied.push('Enhanced code quality');
      }

      if (issues && issues.length > 0) {
        fixesApplied.push(`Addressed ${issues.length} review issues`);
      }

      if (fixesApplied.length === 0) {
        fixesApplied.push('Applied critique-based improvements');
      }

      const output: FixOutput = {
        code: fixedCode,
        fixesApplied,
      };

      // Validate with Zod
      const validatedOutput = fixOutputSchema.parse(output);

      logs.push(`[Fix] Applied ${validatedOutput.fixesApplied?.length || 0} fixes`);
      validatedOutput.fixesApplied?.forEach((fix, i) => {
        logs.push(`[Fix]   ${i + 1}. ${fix}`);
      });

      return this.createResponse(true, validatedOutput, logs);
    } catch (error) {
      logs.push(`[Fix] Error: ${error}`);
      return this.createResponse(false, null, logs, {
        code: 'FIX_FAILED',
        message: String(error),
      });
    }
  }
}
