# 🔧 Agent System 개선 사항

## 📊 피드백 요약

### ✅ 강점
- 명확한 책임 분리 (SRP)
- 확장 가능한 아키텍처
- Self-Healing (Reflexion Loop)
- Context Propagation
- Zod 스키마 검증 기반

### ⚠️ 개선 필요 영역
1. **타입 안전성**: any 사용 → Zod 스키마 적용
2. **createResponse 시그니처**: 인자 순서 불일치
3. **Mock 로직**: 실제 LLM 연동 필요
4. **에러 핸들링**: 고급 에러 처리 부족
5. **문서화**: JSDoc 주석 부족

---

## ✅ 완료된 개선 사항

### 1. 타입 안전성 개선

#### schemas.ts에 Output 스키마 추가

```typescript
// ✅ 추가된 스키마들
export const analyzerOutputSchema = z.object({
    intent: z.string(),
    requirements: z.array(z.string()),
    complexity: z.enum(['low', 'medium', 'high']),
});

export const plannerOutputSchema = z.array(z.string());

export const codeOutputSchema = z.object({
    code: z.string(),
    language: z.string().optional().default('typescript'),
});

export const reviewOutputSchema = z.object({
    isValid: z.boolean(),
    score: z.number().min(0).max(100),
    critique: z.string().optional(),
});

export const fixOutputSchema = z.object({
    code: z.string(),
    fixesApplied: z.array(z.string()).optional(),
});

export const orchestratorGenerateOutputSchema = z.object({
    finalCode: z.string(),
    review: reviewOutputSchema,
    iterations: z.number(),
});
```

---

## 🔄 진행 중인 개선 사항

### 2. createResponse 호출 수정 가이드

**문제:**
```typescript
// ❌ 잘못된 호출 (인자 순서 틀림)
return this.createResponse(plan, logs);
return this.createResponse(analysis, logs);
```

**해결:**
```typescript
// ✅ 올바른 호출
protected createResponse(
    success: boolean,  // 1번: 성공 여부
    data: unknown,     // 2번: 데이터
    logs: string[],    // 3번: 로그
    error?             // 4번: 에러 (선택)
)

// 사용 예시
return this.createResponse(true, analysis, logs);
return this.createResponse(true, plan, logs);
return this.createResponse(false, null, logs, error);
```

### 수정이 필요한 파일들:

#### AnalyzerAgent.ts
```typescript
// 현재 (L20)
return this.createResponse(analysis, logs);

// 수정 후
return this.createResponse(true, analysis, logs);
```

#### PlannerAgent.ts
```typescript
// 현재 (L20)
return this.createResponse(plan, logs);

// 수정 후
return this.createResponse(true, plan, logs);
```

#### CodeAgent.ts
```typescript
// 현재 (L23)
return this.createResponse({ code: generatedCode }, logs);

// 수정 후
return this.createResponse(true, { code: generatedCode }, logs);
```

#### ReviewAgent.ts
```typescript
// 현재 (L25)
return this.createResponse({ isValid, score: qualityScore, critique }, logs);

// 수정 후
return this.createResponse(true, { isValid, score: qualityScore, critique }, logs);
```

#### FixAgent.ts
```typescript
// 현재 (L23)
return this.createResponse({ code: fixedCode }, logs);

// 수정 후
return this.createResponse(true, { code: fixedCode }, logs);
```

---

### 3. Orchestrator.ts 타입 안전성 개선

**문제:**
```typescript
// ❌ any 타입 사용
const analysis = (analysisRes.data as any).requirements;
const isValid = (reviewRes.data as any).isValid;
```

**해결:**
```typescript
// ✅ Zod 스키마로 검증
import {
    analyzerOutputSchema,
    plannerOutputSchema,
    codeOutputSchema,
    reviewOutputSchema,
    fixOutputSchema,
    type AnalyzerOutput,
    type ReviewOutput,
} from './schemas';

// Step 1: Analyze
const analysisRes = await this.analyzer.execute({...});
if (!analysisRes.success) return this.createResponse(false, null, logs, analysisRes.error);

// Zod로 검증 및 타입 추론
const analysis = analyzerOutputSchema.parse(analysisRes.data);
// 이제 analysis는 AnalyzerOutput 타입!

// Step 2: Plan
const planRes = await this.planner.execute({
    role: 'planner',
    inputs: { requirements: analysis.requirements } // 타입 안전!
});

// Step 4: Review
const reviewRes = await this.review.execute({...});
const reviewData = reviewOutputSchema.parse(reviewRes.data);

// 타입 안전하게 사용
while (!reviewData.isValid && attempts < MAX_ATTEMPTS) {
    // ...
}
```

---

### 4. LLM 연동 준비 - Adapter 패턴

새 파일: `src/agents/llm/LLMAdapter.ts`

```typescript
/**
 * LLM Adapter Interface
 * 다양한 LLM 제공자를 추상화
 */
export interface LLMAdapter {
    generate(prompt: string, options?: LLMOptions): Promise<string>;
}

export interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
}

/**
 * OpenAI Adapter
 */
export class OpenAIAdapter implements LLMAdapter {
    constructor(private apiKey: string) {}

    async generate(prompt: string, options?: LLMOptions): Promise<string> {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens ?? 1000,
            }),
        });

        const data = await response.json();
        return data.choices[0].message.content;
    }
}

/**
 * Anthropic Claude Adapter
 */
export class ClaudeAdapter implements LLMAdapter {
    constructor(private apiKey: string) {}

    async generate(prompt: string, options?: LLMOptions): Promise<string> {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: options?.maxTokens ?? 1024,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        const data = await response.json();
        return data.content[0].text;
    }
}

/**
 * Mock Adapter (개발용)
 */
export class MockAdapter implements LLMAdapter {
    async generate(prompt: string): Promise<string> {
        return `Mock response for: ${prompt.substring(0, 50)}...`;
    }
}

// Factory
export function createLLMAdapter(provider: 'openai' | 'claude' | 'mock', apiKey?: string): LLMAdapter {
    switch (provider) {
        case 'openai':
            return new OpenAIAdapter(apiKey!);
        case 'claude':
            return new ClaudeAdapter(apiKey!);
        case 'mock':
            return new MockAdapter();
    }
}
```

**사용 예시 (AnalyzerAgent.ts 개선):**

```typescript
import { createLLMAdapter } from './llm/LLMAdapter';
import { analyzerOutputSchema, type AnalyzerOutput } from './schemas';

export class AnalyzerAgent extends BaseAgent {
    private llm = createLLMAdapter(
        process.env.LLM_PROVIDER as any || 'mock',
        process.env.LLM_API_KEY
    );

    async execute(request: AgentRequest): Promise<AgentResponse> {
        const { userInput } = request.inputs as { userInput: string };
        const logs: string[] = [];

        logs.push(`[Analyzer] Analyzing input: "${userInput}"`);

        const prompt = `
Analyze the following user request and extract:
1. Intent (what they want to achieve)
2. Requirements (specific needs)
3. Complexity (low/medium/high)

User request: ${userInput}

Response format (JSON):
{
  "intent": "...",
  "requirements": ["...", "..."],
  "complexity": "low|medium|high"
}
        `;

        try {
            const response = await this.llm.generate(prompt);
            const parsed = JSON.parse(response);

            // Zod 검증
            const analysis = analyzerOutputSchema.parse(parsed);

            logs.push(`[Analyzer] Analysis complete. Intent: ${analysis.intent}`);
            return this.createResponse(true, analysis, logs);

        } catch (error) {
            return this.createResponse(false, null, logs, {
                code: 'ANALYSIS_FAILED',
                message: String(error),
            });
        }
    }
}
```

---

### 5. API Route 구현

새 파일: `src/app/api/agent/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { runAgent } from '@/agents/runner';
import { agentRequestSchema } from '@/agents/schemas';
import { defaultRateLimiters } from '@/agents/security/RateLimiter';
import { metricsCollector } from '@/agents/monitoring/MetricsCollector';

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // 1. Rate Limiting
        const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
        const rateLimitInfo = await defaultRateLimiters.public.checkLimit(clientIP);

        if (rateLimitInfo.blocked) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Too many requests',
                    },
                },
                { status: 429 }
            );
        }

        // 2. Parse & Validate
        const body = await request.json();
        const validatedRequest = agentRequestSchema.parse(body);

        // 3. Execute Agent
        const result = await runAgent(validatedRequest);

        // 4. Metrics
        await metricsCollector.recordAgentExecution({
            agentRole: validatedRequest.role,
            executionTimeMs: Date.now() - startTime,
            success: result.success,
            timestamp: Date.now(),
        });

        // 5. Response
        return NextResponse.json(result, {
            status: result.httpStatus ?? (result.success ? 200 : 500),
        });
    } catch (error) {
        await metricsCollector.recordAgentExecution({
            agentRole: 'unknown',
            executionTimeMs: Date.now() - startTime,
            success: false,
            errorCode: 'SERVER_ERROR',
            timestamp: Date.now(),
        });

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SERVER_ERROR',
                    message: String(error),
                },
            },
            { status: 500 }
        );
    }
}

// Health Check
export async function GET() {
    return NextResponse.json({
        status: 'healthy',
        timestamp: Date.now(),
    });
}
```

---

### 6. 고급 에러 핸들링 추가

Orchestrator.ts 개선:

```typescript
import { retryWithBackoff, withTimeout } from './resilience/ErrorHandler';

// 타임아웃 & Retry 적용
const analysisRes = await withTimeout(
    retryWithBackoff(
        () => this.analyzer.execute({ role: 'analyzer', inputs: { userInput } }),
        { maxAttempts: 3, delayMs: 1000 }
    ),
    30000 // 30초 타임아웃
);
```

---

## 📝 문서화 개선 - JSDoc 추가

### BaseAgent.ts

```typescript
/**
 * Base Agent Abstract Class
 *
 * All agents must extend this class and implement the execute method.
 * Provides consistent response formatting via createResponse.
 *
 * @abstract
 */
export abstract class BaseAgent {
    /**
     * Execute the agent's main logic
     *
     * @param request - Agent request with role, inputs, and optional context
     * @returns Promise<AgentResponse> - Structured response with success, data, logs
     *
     * @example
     * ```typescript
     * const response = await agent.execute({
     *   role: 'analyzer',
     *   inputs: { userInput: 'Create a button component' }
     * });
     * ```
     */
    abstract execute(request: AgentRequest): Promise<AgentResponse>;

    /**
     * Create a standardized agent response
     *
     * @param success - Whether the operation succeeded
     * @param data - Response data (validated by schemas)
     * @param logs - Execution logs for debugging
     * @param error - Error payload if operation failed
     * @returns AgentResponse
     *
     * @protected
     */
    protected createResponse(
        success: boolean,
        data: unknown,
        logs: string[] = [],
        error?: AgentErrorPayload,
    ): AgentResponse {
        return {
            success,
            data,
            logs,
            ...(error ? { error } : {}),
        };
    }
}
```

---

## 🎯 다음 단계 Action Items

### 즉시 적용 가능
1. ✅ `schemas.ts`에 Output 스키마 추가 (완료)
2. ⏳ 모든 Agent 파일에서 `createResponse` 호출 수정
3. ⏳ `Orchestrator.ts`에서 Zod parse 적용
4. ⏳ JSDoc 주석 추가

### LLM 연동 준비
5. ⏳ `LLMAdapter.ts` 생성
6. ⏳ 환경 변수 설정 (`.env.local`)
7. ⏳ 각 Agent에 LLM 적용

### API & UI
8. ⏳ `/api/agent/route.ts` 생성
9. ⏳ Dashboard에 Agent 호출 UI 추가
10. ⏳ FloatTool과 연동

---

## 📊 개선 후 예상 점수

| 항목 | 개선 전 | 개선 후 |
|------|---------|---------|
| 타입 안전성 | 5/10 | **9/10** ✅ |
| 실전 완성도 | 3/10 | **7/10** ⬆️ |
| 에러 핸들링 | 4/10 | **8/10** ⬆️ |
| 문서화 | 6/10 | **9/10** ⬆️ |
| **종합 평가** | **6.0/10** | **8.5/10** 🚀 |

---

## 🛠️ 적용 방법

### 1단계: 즉시 수정 (타입 안전성)

```bash
# schemas.ts는 이미 수정됨 ✅
# 각 Agent 파일 수정:
# - AnalyzerAgent.ts
# - PlannerAgent.ts
# - CodeAgent.ts
# - ReviewAgent.ts
# - FixAgent.ts
# - Orchestrator.ts

# createResponse 호출을 모두 다음 형식으로 변경:
return this.createResponse(true, data, logs);
```

### 2단계: LLM 연동

```bash
# 1. LLMAdapter 생성
# 2. .env.local 설정
echo "LLM_PROVIDER=openai" >> .env.local
echo "LLM_API_KEY=sk-..." >> .env.local

# 3. 각 Agent에 LLM 적용
```

### 3단계: API & 테스트

```bash
# API Route 생성
# Dashboard UI 추가
# 테스트 실행
npm run dev
```

---

**모든 개선사항이 적용되면 상용화 수준의 Agent 시스템 완성! 🎉**
