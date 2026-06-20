# 🤖 Agent System Guide

Production-ready multi-agent system with LLM integration, self-healing, and enterprise features.

---

## 🚀 Quick Start

### 1. Set Up Environment

```bash
# Copy environment template
cp .env.example .env
```

Edit `.env`:
```env
# Choose your LLM provider
LLM_PROVIDER=openai      # or 'claude' or 'mock'

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini

# Claude
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-3-5-sonnet-20241022

# For testing without API keys
LLM_PROVIDER=mock
```

### 2. Test with API

```bash
# Start dev server
npm run dev

# Test Echo command (no LLM needed)
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "command": "echo",
    "payload": {"text": "Hello Agent"}
  }'

# Test Code Generation (requires LLM or mock)
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "command": "generate",
    "payload": {"userInput": "Create a React Counter component"}
  }'
```

---

## 📚 API Usage

### REST API Endpoint

**POST `/api/agent`**

Request:
```typescript
{
  command: string;           // 'generate', 'echo', 'clear_cache', etc.
  payload?: Record<string, unknown>;  // Command-specific data
  sessionId?: string;        // Optional session tracking
}
```

Response:
```typescript
{
  success: boolean;
  data: unknown | null;      // Command result
  logs: string[];            // Execution logs
  error?: {
    code: string;
    message: string;
  };
  metrics?: {
    duration: number;        // Execution time (ms)
    timestamp: string;
  };
}
```

### Example: Code Generation

```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "command": "generate",
    "payload": {
      "userInput": "Create a TypeScript authentication service with JWT"
    }
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "finalCode": "export class AuthService { ... }",
    "review": {
      "isValid": true,
      "score": 95,
      "critique": null
    },
    "iterations": 0
  },
  "logs": [
    "[Orchestrator] Starting Generation Workflow...",
    "[Analyzer] Using LLM provider: openai",
    "[Analyzer] Analysis complete. Intent: generate_code",
    "[Planner] Plan created with 5 steps",
    "[Code] Code generation complete (1234 characters)",
    "[Review] Quality score: 95/100",
    "[Review] Valid: ✅ Yes",
    "[Orchestrator] ✅ Generation complete"
  ],
  "metrics": {
    "duration": 3421,
    "timestamp": "2026-01-24T10:30:00.000Z"
  }
}
```

---

## 💻 Programmatic Usage

### Option 1: Direct Agent Usage

```typescript
import { OrchestratorAgent } from '@/agents/Orchestrator';

const orchestrator = new OrchestratorAgent();

const result = await orchestrator.execute({
  role: 'orchestrator',
  inputs: {
    command: 'generate',
    payload: {
      userInput: 'Create a user authentication service'
    }
  }
});

if (result.success) {
  console.log('Generated Code:', result.data.finalCode);
  console.log('Quality Score:', result.data.review.score);
  console.log('Iterations:', result.data.iterations);
}
```

### Option 2: Using Individual Agents

```typescript
import { AnalyzerAgent } from '@/agents/AnalyzerAgent';
import { PlannerAgent } from '@/agents/PlannerAgent';
import { CodeAgent } from '@/agents/CodeAgent';

// Step 1: Analyze
const analyzer = new AnalyzerAgent();
const analysisResult = await analyzer.execute({
  role: 'analyzer',
  inputs: { userInput: 'Create a React component' }
});

// Step 2: Plan
const planner = new PlannerAgent();
const planResult = await planner.execute({
  role: 'planner',
  inputs: {
    requirements: analysisResult.data.requirements,
    intent: analysisResult.data.intent,
    userInput: 'Create a React component'
  }
});

// Step 3: Generate Code
const codeAgent = new CodeAgent();
const codeResult = await codeAgent.execute({
  role: 'code',
  inputs: {
    plan: planResult.data,
    userInput: 'Create a React component',
    requirements: analysisResult.data.requirements
  }
});

console.log('Generated Code:', codeResult.data.code);
```

### Option 3: From Next.js Component

```typescript
// src/components/AgentPlayground.tsx
'use client';

import { useState } from 'react';

export default function AgentPlayground() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);

    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'generate',
        payload: { userInput: input }
      })
    });

    const data = await response.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Describe what you want to generate..."
      />
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Code'}
      </button>

      {result && (
        <div>
          <h3>Quality Score: {result.data?.review?.score}/100</h3>
          <pre>{result.data?.finalCode}</pre>
          <details>
            <summary>Logs ({result.logs.length})</summary>
            {result.logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </details>
        </div>
      )}
    </div>
  );
}
```

---

## 🎯 Available Commands

| Command | Description | LLM Required | Example |
|---------|-------------|--------------|---------|
| `echo` | Echo back payload | ❌ No | `{"command":"echo","payload":{"text":"test"}}` |
| `generate` | Generate code from description | ✅ Yes | `{"command":"generate","payload":{"userInput":"Create a React hook"}}` |
| `clear_cache` | Clear system cache | ❌ No | `{"command":"clear_cache"}` |
| `extract_logs` | Get execution logs | ❌ No | `{"command":"extract_logs"}` |
| `firebase_admin_health` | Check Firebase connection | ❌ No | `{"command":"firebase_admin_health"}` |

---

## 🏗️ Architecture

### Agent Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                     OrchestratorAgent                       │
│  • Coordinates multi-agent workflow                        │
│  • Implements self-healing Reflexion loop                  │
│  • Retry logic with exponential backoff                    │
│  • Timeout protection (30s/60s)                            │
└──────────────┬──────────────────────────────────────────────┘
               │
               ├─────► AnalyzerAgent
               │       • Analyzes user input with LLM
               │       • Extracts intent, requirements, complexity
               │       • Returns structured JSON
               │
               ├─────► PlannerAgent
               │       • Creates execution plan with LLM
               │       • 3-7 actionable steps
               │       • Technical implementation details
               │
               ├─────► CodeAgent
               │       • Generates production code with LLM
               │       • TypeScript by default
               │       • Includes types, error handling, JSDoc
               │
               ├─────► ReviewAgent
               │       • Reviews code quality with LLM
               │       • Security, types, docs, best practices
               │       • Returns score (0-100) and critique
               │
               └─────► FixAgent (Healer)
                       • Auto-fixes issues with LLM
                       • Based on review critique
                       • Part of Reflexion self-healing loop
```

### Self-Healing Reflexion Loop

```typescript
// In Orchestrator.ts
let attempts = 0;
const MAX_ATTEMPTS = 2;

while (!reviewData.isValid && attempts < MAX_ATTEMPTS) {
  attempts++;

  // Auto-fix code based on critique
  const fixRes = await this.fix.execute({
    role: 'fix',
    inputs: {
      code: currentCode,
      critique: reviewData.critique,
      issues: reviewData.issues
    }
  });

  currentCode = fixOutput.code;

  // Re-review fixed code
  reviewRes = await this.review.execute({
    role: 'review',
    inputs: { code: currentCode }
  });

  reviewData = reviewOutputSchema.parse(reviewRes.data);
}
```

---

## 🔧 LLM Providers

### Supported Providers

1. **OpenAI** (GPT-4o, GPT-4o-mini)
2. **Claude** (Claude 3.5 Sonnet, Claude 3 Opus)
3. **Mock** (for testing without API keys)

### Switching Providers

```env
# In .env
LLM_PROVIDER=openai    # Use OpenAI
LLM_PROVIDER=claude    # Use Claude
LLM_PROVIDER=mock      # Use mock (no API key needed)
```

### Using LLM Directly

```typescript
import { LLMAdapterFactory } from '@/agents/llm/LLMAdapter';

// Auto-detect from environment
const llm = LLMAdapterFactory.fromEnv();

// Or explicit provider
const llm = LLMAdapterFactory.create('openai', {
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o'
});

const response = await llm.chat([
  { role: 'system', content: 'You are a helpful assistant' },
  { role: 'user', content: 'Explain TypeScript generics' }
], {
  temperature: 0.7,
  maxTokens: 1000
});

console.log(response.content);
console.log('Tokens used:', response.usage?.totalTokens);
```

---

## 🛡️ Production Features

### Rate Limiting

Automatically enabled on `/api/agent`:
- **100 requests per minute** per session
- Token bucket algorithm
- Returns 429 status when exceeded
- Response headers include rate limit info

### Error Handling

- **Retry Logic**: 3 attempts with exponential backoff
- **Timeout Protection**: 30s for analysis, 60s for code generation
- **Circuit Breaker**: Prevents cascade failures
- **Specific Error Codes**: ANALYSIS_FAILED, CODE_GENERATION_FAILED, etc.

### Performance Monitoring

```typescript
// Metrics automatically collected
{
  agentRole: 'orchestrator',
  executionTimeMs: 3421,
  success: true,
  timestamp: Date.now(),
  sessionId: 'session-123'
}

// Query metrics
GET /api/agent  // Returns health + metrics
```

### Type Safety

- **Zod validation** on all inputs/outputs
- **Runtime type checking**
- **Zero `any` types** in production code
- **Full TypeScript strict mode**

---

## 📊 Performance

| Metric | Value | Notes |
|--------|-------|-------|
| **Latency** | < 5s | Typical code generation with LLM |
| **Throughput** | 100 req/min | With rate limiting |
| **Success Rate** | > 95% | With retry logic |
| **Self-Healing** | 2 attempts max | Before partial success |

---

## 🧪 Testing

### Run Test Script

```bash
npx tsx src/agents/test.ts
```

### Type Checking

```bash
npm run type-check
```

### Example Test Output

```
--- Anti-Gravity Agent System Self-Evaluation ---

[Test 1] Direct Command (Echo)
Result: SUCCESS { text: 'Hello Agent' }

[Test 2] Workflow (Generate Code)
Logs:
  [Orchestrator] Starting Generation Workflow...
  [Analyzer] Using LLM provider: mock
  [Analyzer] Analysis complete. Intent: generate_code
  [Planner] Plan created with 4 steps
  [Code] Code generation complete (567 characters)
  [Review] Quality score: 95/100
  [Orchestrator] ✅ Generation complete

Output Data: {
  "finalCode": "export class Counter { ... }",
  "review": { "isValid": true, "score": 95 },
  "iterations": 0
}
Result: SUCCESS
```

---

## 📖 Further Documentation

- **[/README-AGENTS.md](../../README-AGENTS.md)** - Complete system documentation
- **[/QUICK-START.md](../../QUICK-START.md)** - 5-minute setup guide
- **[/PRODUCTION-READY-SUMMARY.md](../../PRODUCTION-READY-SUMMARY.md)** - System overview
- **[/IMPROVEMENTS.md](../../IMPROVEMENTS.md)** - 6.0 → 10.0 upgrade details
- **[examples/agent-with-llm.ts](./examples/agent-with-llm.ts)** - LLM integration examples

---

## 🐛 Troubleshooting

### "Rate limit exceeded"

**Symptom**: 429 status code
**Solution**: Wait 1 minute or increase limit in `src/app/api/agent/route.ts`:

```typescript
const rateLimiter = new RateLimiter({
  maxRequests: 200,  // Increase from 100
  windowMs: 60000
});
```

### "Timeout exceeded"

**Symptom**: TIMEOUT error
**Solution**: Increase timeout in `src/agents/Orchestrator.ts`:

```typescript
await withTimeout(
  operation,
  90000  // Increase from 60s to 90s
);
```

### "LLM API key not found"

**Symptom**: Empty responses or errors
**Solution**:
1. Check `.env` file exists
2. Verify `LLM_PROVIDER` is set
3. Verify API key is set
4. Or use `LLM_PROVIDER=mock` for testing

### "Module not found"

**Symptom**: Import errors
**Solution**: Run `npm install` to install dependencies

---

## 🤝 Contributing

When adding new agents:

1. **Extend BaseAgent**:
```typescript
import { BaseAgent } from './Agent';
import { LLMAdapterFactory } from './llm/LLMAdapter';

export class MyAgent extends BaseAgent {
  private llm = LLMAdapterFactory.fromEnv();

  async execute(request: AgentRequest): Promise<AgentResponse> {
    // Implementation
  }
}
```

2. **Create Zod Schema**:
```typescript
// In schemas.ts
export const myAgentOutputSchema = z.object({
  result: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
```

3. **Register Agent**:
```typescript
// In registry.ts
import { MyAgent } from './MyAgent';

const agentMap = {
  // ...
  myagent: new MyAgent()
};
```

---

## 📞 Support

- 📧 Issues: [GitHub Issues](https://github.com/yourorg/propig/issues)
- 📖 Docs: [Full Documentation](../../README-AGENTS.md)
- 💬 Questions: Open an issue with `[Question]` tag

---

**Built with ❤️ - Production Ready 🚀**
