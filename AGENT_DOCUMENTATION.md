# 🚀 Pro-Level AI Agent System Documentation

## 📋 목차
1. [시스템 개요](#시스템-개요)
2. [핵심 기능](#핵심-기능)
3. [아키텍처](#아키텍처)
4. [API 엔드포인트](#api-엔드포인트)
5. [사용 가이드](#사용-가이드)
6. [보안](#보안)
7. [성능 최적화](#성능-최적화)

---

## 🎯 시스템 개요

상용화 수준의 AI 에이전트 시스템으로, 다음 기능을 제공합니다:

### 주요 특징
- ✅ **멀티 에이전트 오케스트레이션**: 분석, 계획, 코드, 리뷰, 수정 에이전트 통합
- ✅ **메모리 관리**: 대화 컨텍스트 및 사용자 선호도 영구 저장
- ✅ **실시간 스트리밍**: Server-Sent Events (SSE) 지원
- ✅ **고급 에러 핸들링**: Retry, Circuit Breaker, Fallback 전략
- ✅ **멀티모달 지원**: 이미지, 문서, 오디오 파일 처리
- ✅ **툴 실행**: 웹 검색, API 호출, 계산 등
- ✅ **성능 모니터링**: 실시간 메트릭 수집 및 분석
- ✅ **보안**: 레이트 리미팅, API 키 관리, 입력 검증
- ✅ **워크플로우 엔진**: 복잡한 다단계 작업 자동화
- ✅ **RAG 시스템**: 벡터 검색 및 컨텍스트 증강 생성

---

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                     API Layer                            │
│  /api/v1/chat - Production Chat Endpoint                │
│  /api/agents/stream - Streaming Endpoint                │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│              Security & Rate Limiting                    │
│  - Input Validation                                      │
│  - API Key Management                                    │
│  - Rate Limiters (Public, Auth, Expensive)              │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│            Orchestrator Agent                            │
│  - Command Routing                                       │
│  - Agent Coordination                                    │
│  - Workflow Execution                                    │
└─────┬────────────────────────────────────────────┬──────┘
      │                                            │
┌─────▼──────┐  ┌──────────┐  ┌───────┐  ┌───────▼─────┐
│  Analyzer  │  │ Planner  │  │ Coder │  │   Reviewer  │
│   Agent    │  │  Agent   │  │ Agent │  │    Agent    │
└────────────┘  └──────────┘  └───────┘  └─────────────┘
      │                                            │
┌─────▼────────────────────────────────────────────▼─────┐
│                 Support Systems                         │
│  - Memory Manager (Firestore)                          │
│  - Vector Store (RAG)                                  │
│  - Tool Registry                                       │
│  - Metrics Collector                                   │
│  - Error Handler                                       │
└────────────────────────────────────────────────────────┘
```

---

## 📡 API 엔드포인트

### 1. Chat API (프로덕션)

**Endpoint:** `POST /api/v1/chat`

**Request:**
```json
{
  "message": "사용자 메시지",
  "sessionId": "optional_session_id",
  "userId": "optional_user_id",
  "useRAG": true,
  "useTool": false,
  "toolName": "web_search",
  "toolParams": {
    "query": "검색어",
    "maxResults": 5
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "finalCode": "생성된 코드",
    "review": { "isValid": true, "score": 95 },
    "iterations": 1
  },
  "sessionId": "session_xxx",
  "logs": ["로그 메시지들..."],
  "metadata": {
    "executionTimeMs": 1234,
    "rateLimitRemaining": 99,
    "usedRAG": true,
    "usedTool": false
  }
}
```

### 2. Streaming API

**Endpoint:** `POST /api/agents/stream`

**Response:** Server-Sent Events (SSE)
```
event: start
data: {"message":"Agent execution started"}

event: log
data: {"message":"[Analyzer] Analyzing input..."}

event: result
data: {"success":true,"data":{...}}

event: done
data: {"message":"Execution completed"}
```

### 3. Health Check

**Endpoint:** `GET /api/v1/chat`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1234567890,
  "stats": {
    "activeUsers": 5,
    "requestsPerMinute": 20,
    "averageResponseTime": 1200
  }
}
```

---

## 🛠️ 핵심 컴포넌트

### 1. Memory Manager (`src/agents/memory/MemoryManager.ts`)

대화 컨텍스트와 사용자 선호도를 관리합니다.

```typescript
import { memoryManager } from '@/agents/memory/MemoryManager';

// 세션 생성
const sessionId = await memoryManager.createSession(userId);

// 메시지 추가
await memoryManager.addMessage(sessionId, 'user', 'Hello!');

// 컨텍스트 조회
const context = await memoryManager.getConversationContext(sessionId);

// 사용자 선호도 저장
await memoryManager.saveUserPreferences({
  userId: 'user123',
  language: 'ko',
  codeStyle: 'functional',
});
```

### 2. Tool Registry (`src/agents/tools/ToolRegistry.ts`)

에이전트가 사용할 수 있는 툴을 관리합니다.

```typescript
import { toolRegistry } from '@/agents/tools/ToolRegistry';

// 툴 실행
const result = await toolRegistry.executeTool('web_search', {
  query: 'AI agents',
  maxResults: 5,
});

// 사용 가능한 툴 목록
const tools = toolRegistry.listTools('search');
```

**내장 툴:**
- `web_search` - 웹 검색
- `http_request` - HTTP API 호출
- `calculator` - 계산
- `summarize_text` - 텍스트 요약
- `get_current_time` - 현재 시간
- `parse_json` - JSON 파싱

### 3. RAG System (`src/agents/rag/VectorStore.ts`)

벡터 검색 및 컨텍스트 증강 생성을 지원합니다.

```typescript
import { ragSystem, vectorStore } from '@/agents/rag/VectorStore';

// 문서 추가
await vectorStore.addDocument(
  'Firebase는 Google의 백엔드 플랫폼입니다.',
  { category: 'tech', topic: 'firebase' }
);

// 컨텍스트 검색
const context = await ragSystem.retrieveContext('Firebase란?', 3);

// 소스와 함께 답변 생성
const result = await ragSystem.getAnswerWithSources('Firebase란?');
```

### 4. Metrics Collector (`src/agents/monitoring/MetricsCollector.ts`)

성능 메트릭 수집 및 분석을 제공합니다.

```typescript
import { metricsCollector } from '@/agents/monitoring/MetricsCollector';

// 메트릭 기록
await metricsCollector.recordAgentExecution({
  agentRole: 'analyzer',
  executionTimeMs: 1200,
  success: true,
  timestamp: Date.now(),
  userId: 'user123',
});

// 성능 리포트
const report = await metricsCollector.getPerformanceReport('day');

// 실시간 통계
const stats = await metricsCollector.getRealtimeStats();
```

### 5. Workflow Engine (`src/agents/workflow/WorkflowEngine.ts`)

복잡한 다단계 워크플로우를 정의하고 실행합니다.

```typescript
import { workflowEngine, createCodeReviewWorkflow } from '@/agents/workflow/WorkflowEngine';

// 워크플로우 등록
const workflow = createCodeReviewWorkflow();
workflowEngine.registerWorkflow(workflow);

// 워크플로우 실행
const result = await workflowEngine.executeWorkflow('code_review', {
  code: 'const x = 1;',
});
```

---

## 🔒 보안

### Rate Limiting

```typescript
import { defaultRateLimiters } from '@/agents/security/RateLimiter';

// Public: 15분에 100 요청
const publicLimit = await defaultRateLimiters.public.checkLimit(clientIP);

// Authenticated: 15분에 1000 요청
const authLimit = await defaultRateLimiters.authenticated.checkLimit(userId);

// Expensive: 1시간에 10 요청
const expensiveLimit = await defaultRateLimiters.expensive.checkLimit(userId);
```

### API Key Management

```typescript
import { apiKeyManager } from '@/agents/security/RateLimiter';

// API 키 생성
const apiKey = await apiKeyManager.generateAPIKey(userId, 'My App');

// API 키 검증
const validation = await apiKeyManager.validateAPIKey(apiKey);

// API 키 취소
await apiKeyManager.revokeAPIKey(apiKey);
```

### Input Validation

```typescript
import { InputValidator } from '@/agents/security/RateLimiter';

// 입력 검증
const sanitized = InputValidator.sanitize(userInput);
const isValid = InputValidator.validateLength(sanitized, 1, 5000);
const hasSQLInjection = InputValidator.hasSQLInjection(sanitized);
const hasXSS = InputValidator.hasXSS(sanitized);
```

---

## ⚡ 성능 최적화

### Error Resilience

```typescript
import { retryWithBackoff, CircuitBreaker, withTimeout } from '@/agents/resilience/ErrorHandler';

// Retry with exponential backoff
const result = await retryWithBackoff(
  async () => callExternalAPI(),
  { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
);

// Circuit breaker
const breaker = new CircuitBreaker(5, 60000);
const result = await breaker.execute(async () => callExternalAPI());

// Timeout
const result = await withTimeout(longRunningTask(), 5000);
```

### Multimodal Processing

```typescript
import { multimodalProcessor } from '@/agents/multimodal/MultimodalProcessor';

// 파일 업로드
const metadata = await multimodalProcessor.uploadFile(
  fileBuffer,
  'image.png',
  'image/png',
  userId,
  sessionId
);

// 이미지 분석
const analysis = await multimodalProcessor.analyzeImage(fileId);

// 문서 텍스트 추출
const text = await multimodalProcessor.extractDocumentText(fileId);
```

---

## 📊 모니터링 & 분석

### 실시간 대시보드 메트릭

```typescript
// 성능 리포트
const dayReport = await metricsCollector.getPerformanceReport('day');
console.log(`Success Rate: ${dayReport.successRate}%`);
console.log(`Avg Execution Time: ${dayReport.averageExecutionTime}ms`);

// 에러율 추세
const errorRate = await metricsCollector.getErrorRate(24);

// 인기 에이전트
const popular = await metricsCollector.getPopularAgents(10);
```

---

## 🚀 시작하기

### 1. 환경 설정

```bash
# 의존성 설치
npm install

# Firebase 설정
# serviceAccountKey.json 파일을 프로젝트 루트에 배치
```

### 2. 개발 서버 실행

```bash
npm run dev
```

### 3. 테스트 요청

```bash
curl -X POST http://localhost:6001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, AI!",
    "useRAG": true
  }'
```

---

## 🔧 설정

### Rate Limit 조정

`src/agents/security/RateLimiter.ts`:
```typescript
export const defaultRateLimiters = {
  public: new RateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 100, // 여기 수정
    identifier: 'ip',
  }),
  // ...
};
```

### 메모리 컨텍스트 길이 조정

`src/agents/memory/MemoryManager.ts`:
```typescript
private maxContextLength = 50; // 여기 수정
```

---

## 📝 라이센스

MIT License

---

## 🤝 기여

Issue 및 Pull Request를 환영합니다!

---

## 📞 지원

문제가 발생하면 GitHub Issues를 통해 문의해주세요.
