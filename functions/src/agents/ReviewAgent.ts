import { BaseAgent } from './Agent';
import { AgentRequest, AgentResponse } from './types';
import { reviewOutputSchema, type ReviewOutput } from './schemas';
import { LLMAdapterFactory } from './llm/LLMAdapter';

/**
 * Review Agent (LLM-Powered)
 *
 * Reviews generated code for quality, safety, and documentation using LLM.
 * Provides detailed critique and triggers the Healer loop if quality is below threshold.
 */
export class ReviewAgent extends BaseAgent {
  private llm = LLMAdapterFactory.fromEnv();

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const { code } = request.inputs as { code: string };
    const logs: string[] = [];

    logs.push(`[Review] Using LLM provider: ${this.llm.getProvider()}`);
    logs.push(`[Review] Reviewing generated code...`);

    try {
      const systemPrompt = `You are a code review expert. Review the provided code and return a JSON object with:
- isValid: boolean (true if code quality is acceptable, false otherwise)
- score: number between 0-100 (overall quality score)
- critique: string or null (specific actionable feedback if isValid is false, null otherwise)
- issues: array of strings (list of specific issues found, optional)

Review criteria:
- Security: No eval(), no SQL injection vulnerabilities, no XSS risks
- Type Safety: Proper TypeScript types, no implicit any
- Error Handling: Try-catch blocks where needed
- Documentation: JSDoc comments for public APIs
- Best Practices: Modern patterns, clean code
- Performance: No obvious performance issues

Threshold: Score >= 80 means isValid = true

Return ONLY valid JSON, no markdown or explanations.

Example:
{
  "isValid": false,
  "score": 65,
  "critique": "Missing error handling in async function. Add JSDoc comments for exported functions.",
  "issues": ["No try-catch in async code", "Missing JSDoc for public API"]
}`;

      const userPrompt = `Review this code:

\`\`\`typescript
${code}
\`\`\`

Provide your review:`;

      const llmResponse = await this.llm.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.3, // Low temperature for consistent reviews
          maxTokens: 800,
        }
      );

      logs.push(`[Review] LLM responded (${llmResponse.usage?.totalTokens || 0} tokens)`);

      // Parse LLM response as JSON
      let review: ReviewOutput;
      try {
        review = JSON.parse(llmResponse.content.trim());
      } catch {
        // Fallback: extract JSON from markdown code blocks
        const jsonMatch = llmResponse.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          review = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('LLM response is not valid JSON');
        }
      }

      // Validate with Zod
      const validatedReview = reviewOutputSchema.parse(review);

      logs.push(`[Review] Quality score: ${validatedReview.score}/100`);
      logs.push(`[Review] Valid: ${validatedReview.isValid ? '✅ Yes' : '❌ No'}`);

      if (validatedReview.critique) {
        logs.push(`[Review] Critique: ${validatedReview.critique}`);
      }

      if (validatedReview.issues && validatedReview.issues.length > 0) {
        logs.push(`[Review] Issues found: ${validatedReview.issues.length}`);
        validatedReview.issues.forEach((issue, i) => {
          logs.push(`[Review]   ${i + 1}. ${issue}`);
        });
      }

      return this.createResponse(true, validatedReview, logs);
    } catch (error) {
      logs.push(`[Review] Error: ${error}`);
      return this.createResponse(false, null, logs, {
        code: 'REVIEW_FAILED',
        message: String(error),
      });
    }
  }
}
