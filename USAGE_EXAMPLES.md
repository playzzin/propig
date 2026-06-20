# 🎯 AI Agent System 사용 예제

## 📋 목차
1. [기본 채팅](#기본-채팅)
2. [RAG 사용](#rag-사용)
3. [툴 실행](#툴-실행)
4. [스트리밍 응답](#스트리밍-응답)
5. [파일 업로드](#파일-업로드)
6. [워크플로우 실행](#워크플로우-실행)
7. [메트릭 조회](#메트릭-조회)

---

## 1. 기본 채팅

### JavaScript/TypeScript
```typescript
const response = await fetch('http://localhost:6001/api/v1/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: '안녕하세요! TypeScript 함수를 작성해주세요.',
    userId: 'user123',
  }),
});

const data = await response.json();
console.log(data.data.finalCode);
```

### cURL
```bash
curl -X POST http://localhost:6001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "React 컴포넌트를 만들어주세요",
    "userId": "user123"
  }'
```

### Python
```python
import requests

response = requests.post(
    'http://localhost:6001/api/v1/chat',
    json={
        'message': 'Python으로 웹 스크래퍼 만들어주세요',
        'userId': 'user123'
    }
)

data = response.json()
print(data['data']['finalCode'])
```

---

## 2. RAG 사용 (컨텍스트 검색)

### 지식 베이스 인덱싱
```typescript
import { vectorStore } from '@/agents/rag/VectorStore';

// 문서 추가
await vectorStore.addDocuments([
  {
    content: 'Next.js는 React 프레임워크입니다.',
    metadata: { category: 'tech', source: 'docs' }
  },
  {
    content: 'Firebase는 Google의 백엔드 플랫폼입니다.',
    metadata: { category: 'tech', source: 'docs' }
  }
]);
```

### RAG 활성화된 채팅
```typescript
const response = await fetch('http://localhost:6001/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Next.js에 대해 설명해주세요',
    useRAG: true,  // RAG 활성화
    userId: 'user123'
  }),
});
```

---

## 3. 툴 실행

### 웹 검색
```typescript
const response = await fetch('http://localhost:6001/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'AI 에이전트에 대한 최신 정보를 찾아주세요',
    useTool: true,
    toolName: 'web_search',
    toolParams: {
      query: 'AI agents 2024',
      maxResults: 5
    }
  }),
});
```

### HTTP API 호출
```typescript
const response = await fetch('http://localhost:6001/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'GitHub API로 사용자 정보 가져오기',
    useTool: true,
    toolName: 'http_request',
    toolParams: {
      url: 'https://api.github.com/users/github',
      method: 'GET'
    }
  }),
});
```

### 계산기
```typescript
const response = await fetch('http://localhost:6001/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '복잡한 수식 계산',
    useTool: true,
    toolName: 'calculator',
    toolParams: {
      expression: '(123 + 456) * 789 / 10'
    }
  }),
});
```

---

## 4. 스트리밍 응답

### EventSource (SSE)
```typescript
const eventSource = new EventSource('http://localhost:6001/api/agents/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    role: 'orchestrator',
    inputs: {
      command: 'generate',
      payload: { userInput: '스트리밍 테스트' }
    }
  })
});

eventSource.addEventListener('log', (event) => {
  const data = JSON.parse(event.data);
  console.log('Log:', data.message);
});

eventSource.addEventListener('result', (event) => {
  const data = JSON.parse(event.data);
  console.log('Result:', data);
});

eventSource.addEventListener('done', (event) => {
  console.log('Completed!');
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Error:', event);
  eventSource.close();
});
```

### React 컴포넌트 예제
```typescript
import { useState, useEffect } from 'react';

function StreamingChat() {
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState(null);

  const startStream = async () => {
    const response = await fetch('/api/agents/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'orchestrator',
        inputs: { command: 'generate', payload: { userInput: 'Hello' } }
      })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));

          if (data.message) {
            setLogs(prev => [...prev, data.message]);
          }

          if (data.data) {
            setResult(data);
          }
        }
      }
    }
  };

  return (
    <div>
      <button onClick={startStream}>Start Stream</button>
      <div>
        {logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
```

---

## 5. 파일 업로드

### 이미지 분석
```typescript
import { multimodalProcessor } from '@/agents/multimodal/MultimodalProcessor';

// 파일 업로드
const file = await fetch('/path/to/image.png').then(r => r.arrayBuffer());
const fileBuffer = Buffer.from(file);

const metadata = await multimodalProcessor.uploadFile(
  fileBuffer,
  'screenshot.png',
  'image/png',
  'user123',
  'session_abc'
);

// 이미지 분석
const analysis = await multimodalProcessor.analyzeImage(metadata.fileId);
console.log('Description:', analysis.description);
console.log('Objects:', analysis.objects);
```

### 문서 텍스트 추출
```typescript
// PDF 업로드
const pdfBuffer = await fetch('/path/to/document.pdf')
  .then(r => r.arrayBuffer())
  .then(b => Buffer.from(b));

const metadata = await multimodalProcessor.uploadFile(
  pdfBuffer,
  'document.pdf',
  'application/pdf',
  'user123'
);

// 텍스트 추출
const extracted = await multimodalProcessor.extractDocumentText(metadata.fileId);
console.log('Content:', extracted.content);
console.log('Pages:', extracted.pageCount);
```

---

## 6. 워크플로우 실행

### 커스텀 워크플로우 생성
```typescript
import { workflowEngine } from '@/agents/workflow/WorkflowEngine';
import type { Workflow, AgentWorkflowStep } from '@/agents/workflow/WorkflowEngine';

const workflow: Workflow = {
  id: 'custom_workflow',
  name: 'Custom Data Processing',
  description: 'Process data through multiple stages',
  steps: new Map([
    ['validate', {
      id: 'validate',
      type: 'agent',
      config: {
        role: 'analyzer',
        inputs: (ctx) => ({ data: ctx.variables.inputData })
      },
      next: 'process'
    } as AgentWorkflowStep],

    ['process', {
      id: 'process',
      type: 'agent',
      config: {
        role: 'code',
        inputs: (ctx) => ({ validated: ctx.stepResults.get('validate') })
      },
      next: 'review'
    } as AgentWorkflowStep],

    ['review', {
      id: 'review',
      type: 'agent',
      config: {
        role: 'review',
        inputs: (ctx) => ({ result: ctx.stepResults.get('process') })
      }
    } as AgentWorkflowStep]
  ]),
  startStep: 'validate'
};

// 워크플로우 등록 및 실행
workflowEngine.registerWorkflow(workflow);

const result = await workflowEngine.executeWorkflow('custom_workflow', {
  inputData: { foo: 'bar' }
});

console.log('Success:', result.success);
console.log('Final Result:', result.finalResult);
console.log('Logs:', result.context.logs);
```

---

## 7. 메트릭 조회

### 성능 리포트
```typescript
import { metricsCollector } from '@/agents/monitoring/MetricsCollector';

// 일간 리포트
const dayReport = await metricsCollector.getPerformanceReport('day');
console.log('Total Requests:', dayReport.totalRequests);
console.log('Success Rate:', dayReport.successRate + '%');
console.log('Avg Execution Time:', dayReport.averageExecutionTime + 'ms');
console.log('Error Breakdown:', dayReport.errorBreakdown);

// 실시간 통계
const stats = await metricsCollector.getRealtimeStats();
console.log('Active Users:', stats.activeUsers);
console.log('Requests/min:', stats.requestsPerMinute);

// 에러율 추세
const errorRate = await metricsCollector.getErrorRate(24);
console.log('Error Rate by Hour:', errorRate);

// 인기 에이전트
const popular = await metricsCollector.getPopularAgents(5);
console.log('Most Used Agents:', popular);
```

### 헬스 체크
```bash
curl http://localhost:6001/api/v1/chat

# Response:
# {
#   "status": "healthy",
#   "timestamp": 1234567890,
#   "stats": {
#     "activeUsers": 5,
#     "requestsPerMinute": 20,
#     "averageResponseTime": 1200
#   }
# }
```

---

## 8. 고급 사용 사례

### 세션 컨텍스트 유지
```typescript
// 첫 번째 메시지
const response1 = await fetch('/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '내 이름은 John이야',
    userId: 'user123'
  })
});

const { sessionId } = await response1.json();

// 두 번째 메시지 (같은 세션)
const response2 = await fetch('/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '내 이름이 뭐였지?',
    sessionId,  // 이전 세션 ID 사용
    userId: 'user123'
  })
});

// AI가 "John"이라고 대답할 것입니다
```

### 배치 문서 인덱싱
```typescript
import { vectorStore } from '@/agents/rag/VectorStore';

const documents = [
  { content: 'Document 1...', metadata: { source: 'wiki' } },
  { content: 'Document 2...', metadata: { source: 'docs' } },
  { content: 'Document 3...', metadata: { source: 'blog' } }
];

const docIds = await vectorStore.addDocuments(documents);
console.log('Indexed', docIds.length, 'documents');
```

### 에러 복구 테스트
```typescript
import { retryWithBackoff } from '@/agents/resilience/ErrorHandler';

const unstableAPI = async () => {
  if (Math.random() > 0.5) throw new Error('Random failure');
  return { data: 'success' };
};

const result = await retryWithBackoff(
  unstableAPI,
  { maxAttempts: 5, delayMs: 500, backoffMultiplier: 2 }
);

console.log('Result:', result);
```

---

## 🔍 디버깅 팁

### 로그 확인
```typescript
const response = await fetch('/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'test' })
});

const data = await response.json();

// 모든 로그 확인
console.log('Execution Logs:', data.logs);

// 메타데이터 확인
console.log('Metadata:', data.metadata);
```

### 에러 추적
```typescript
try {
  const response = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'test' })
  });

  const data = await response.json();

  if (!data.success) {
    console.error('Error Code:', data.error.code);
    console.error('Error Message:', data.error.message);
  }
} catch (error) {
  console.error('Request failed:', error);
}
```

---

## 📚 추가 리소스

- [전체 문서](./AGENT_DOCUMENTATION.md)
- [Firebase 설정](./README-FIREBASE.md)
- [API 레퍼런스](./AGENT_DOCUMENTATION.md#api-엔드포인트)
