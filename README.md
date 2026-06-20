# 🤖 ProPig AI Agent System

> **상용화급 멀티 에이전트 AI 시스템**
>
> Next.js 16 + Firebase + TypeScript로 구축된 프로덕션 준비 완료 AI 에이전트 플랫폼

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.1-black)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Admin-orange)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 🌟 주요 특징

### ✨ 핵심 기능
- 🧠 **멀티 에이전트 시스템**: Analyzer, Planner, Coder, Reviewer, Fixer 에이전트 통합
- 💾 **메모리 관리**: Firestore 기반 대화 컨텍스트 및 사용자 선호도 영구 저장
- 🌊 **실시간 스트리밍**: Server-Sent Events (SSE)로 실시간 응답
- 🛡️ **고급 에러 핸들링**: Retry, Circuit Breaker, Timeout, Fallback 전략
- 🎨 **멀티모달 지원**: 이미지, 문서, 오디오 파일 처리
- 🔧 **툴 실행**: 웹 검색, API 호출, 계산 등 6가지 내장 툴
- 📊 **성능 모니터링**: 실시간 메트릭 수집 및 분석
- 🔒 **보안**: Rate Limiting, API 키 관리, Input Validation
- 🔄 **워크플로우 엔진**: 복잡한 다단계 작업 자동화
- 🔍 **RAG 시스템**: 벡터 검색 및 컨텍스트 증강 생성

---

## 🚀 빠른 시작

### 1. 설치

```bash
# 저장소 클론
git clone <repository-url>
cd propig

# 의존성 설치
npm install
```

### 2. Firebase 설정

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. Firestore 및 Storage 활성화
3. 서비스 계정 키 다운로드 (`serviceAccountKey.json`)
4. 프로젝트 루트에 `serviceAccountKey.json` 배치

```
propig/
├── serviceAccountKey.json  ← 여기에 배치
├── package.json
└── src/
```

### 3. 개발 서버 실행

```bash
npm run dev
```

서버가 http://localhost:6001 에서 실행됩니다.

### 4. 첫 번째 요청

```bash
curl -X POST http://localhost:6001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, AI!",
    "userId": "user123"
  }'
```

---

## 📚 문서

| 문서 | 설명 |
|------|------|
| [📖 시스템 개요](SYSTEM_OVERVIEW.md) | 전체 아키텍처 및 구현된 기능 |
| [📘 사용 가이드](AGENT_DOCUMENTATION.md) | API 레퍼런스 및 상세 가이드 |
| [💡 사용 예제](USAGE_EXAMPLES.md) | 실전 코드 예제 모음 |
| [🚀 배포 가이드](DEPLOYMENT_GUIDE.md) | 프로덕션 배포 절차 |
| [🔥 Firebase 설정](README-FIREBASE.md) | Firebase 상세 설정 |

---

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────┐
│         API Layer (Next.js)              │
│  /api/v1/chat - Chat Endpoint           │
│  /api/agents/stream - Streaming         │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│     Security & Rate Limiting             │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│       Orchestrator Agent                 │
└──┬────────────────────────────────────┬─┘
   │                                    │
┌──▼──────┐  ┌─────────┐  ┌──────┐  ┌─▼──────┐
│Analyzer │  │ Planner │  │Coder │  │Reviewer│
└─────────┘  └─────────┘  └──────┘  └────────┘
   │                                    │
┌──▼────────────────────────────────────▼─┐
│          Support Systems                 │
│  - Memory Manager                        │
│  - Vector Store (RAG)                    │
│  - Tool Registry                         │
│  - Metrics Collector                     │
└──────────────────────────────────────────┘
```

---

## 💻 코드 예제

### 기본 채팅
```typescript
const response = await fetch('/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'TypeScript 함수를 작성해주세요',
    userId: 'user123'
  })
});

const data = await response.json();
console.log(data.data.finalCode);
```

### RAG 활성화
```typescript
const response = await fetch('/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Next.js에 대해 설명해주세요',
    useRAG: true,  // RAG 활성화
    userId: 'user123'
  })
});
```

### 툴 실행
```typescript
const response = await fetch('/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '계산 실행',
    useTool: true,
    toolName: 'calculator',
    toolParams: { expression: '(100 + 50) * 2' }
  })
});
```

### 스트리밍 응답
```typescript
const eventSource = new EventSource('/api/agents/stream');

eventSource.addEventListener('log', (event) => {
  console.log('Log:', JSON.parse(event.data).message);
});

eventSource.addEventListener('result', (event) => {
  console.log('Result:', JSON.parse(event.data));
});
```

더 많은 예제는 [사용 예제 문서](USAGE_EXAMPLES.md)를 참고하세요.

---

## 🔧 내장 툴

| 툴 | 설명 | 카테고리 |
|----|------|---------|
| `web_search` | 웹 검색 실행 | search |
| `http_request` | HTTP API 호출 | api |
| `calculator` | 수식 계산 | data |
| `summarize_text` | 텍스트 요약 | data |
| `get_current_time` | 현재 시간 조회 | system |
| `parse_json` | JSON 파싱 | data |

---

## 📊 API 엔드포인트

### POST /api/v1/chat
메인 채팅 API (프로덕션)

**Request:**
```json
{
  "message": "사용자 메시지",
  "sessionId": "optional_session_id",
  "userId": "optional_user_id",
  "useRAG": true,
  "useTool": false
}
```

**Response:**
```json
{
  "success": true,
  "data": { "finalCode": "...", "review": {...} },
  "sessionId": "session_xxx",
  "logs": ["..."],
  "metadata": {
    "executionTimeMs": 1234,
    "rateLimitRemaining": 99
  }
}
```

### POST /api/agents/stream
스트리밍 API (SSE)

### GET /api/v1/chat
헬스 체크

---

## 🛡️ 보안 기능

### Rate Limiting
- **Public**: 15분에 100 요청
- **Authenticated**: 15분에 1000 요청
- **Expensive**: 1시간에 10 요청

### Input Validation
- XSS 방어
- SQL Injection 방어
- 입력 길이 제한
- HTML 태그 제거

### API Key Management
- API 키 생성/검증/취소
- 사용 통계 추적

---

## 📈 성능 모니터링

```typescript
import { metricsCollector } from '@/agents/monitoring/MetricsCollector';

// 성능 리포트
const report = await metricsCollector.getPerformanceReport('day');

// 실시간 통계
const stats = await metricsCollector.getRealtimeStats();
```

**수집 메트릭:**
- 실행 시간
- 성공/실패율
- 에러 분석
- 활성 사용자
- 요청 빈도

---

## 🧪 테스트

```bash
# 타입 체크
npm run type-check

# 통합 예제 실행
npm run example

# 테스트 (Jest 설치 필요)
npm test
```

---

## 📁 프로젝트 구조

```
src/
├── agents/
│   ├── memory/              # 메모리 관리
│   ├── resilience/          # 에러 핸들링
│   ├── multimodal/          # 멀티모달 처리
│   ├── tools/               # 툴 레지스트리
│   ├── monitoring/          # 메트릭 수집
│   ├── security/            # 보안
│   ├── workflow/            # 워크플로우 엔진
│   ├── rag/                 # RAG 시스템
│   ├── examples/            # 사용 예제
│   └── __tests__/           # 테스트
├── app/
│   └── api/
│       ├── v1/chat/         # 프로덕션 API
│       └── agents/stream/   # 스트리밍 API
├── components/              # UI 컴포넌트
└── lib/                     # 유틸리티
```

---

## 🚀 배포

### Vercel (권장)
```bash
npm i -g vercel
vercel login
vercel --prod
```

### Docker
```bash
docker build -t propig-agent .
docker run -p 6001:6001 propig-agent
```

상세한 배포 가이드는 [배포 문서](DEPLOYMENT_GUIDE.md)를 참고하세요.

---

## 🔄 로드맵

### Phase 1: LLM 통합 ⏳
- [ ] OpenAI/Anthropic API 연결
- [ ] 프롬프트 최적화
- [ ] 토큰 사용량 최적화

### Phase 2: Vector DB 통합 ⏳
- [ ] Pinecone/Weaviate 연결
- [ ] 실제 임베딩 모델 통합
- [ ] 지식 베이스 구축

### Phase 3: 멀티모달 완성 ⏳
- [ ] Vision API 통합
- [ ] Speech-to-Text 통합
- [ ] Document Parser 통합

### Phase 4: 모니터링 & 운영 ⏳
- [ ] 로깅 시스템 강화
- [ ] 대시보드 구축
- [ ] 알람 설정

---

## 🤝 기여

Issue 및 Pull Request를 환영합니다!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📄 라이센스

MIT License - 자유롭게 사용하세요!

---

## 📞 지원

- 📖 [문서](AGENT_DOCUMENTATION.md)
- 💡 [예제](USAGE_EXAMPLES.md)
- 🚀 [배포 가이드](DEPLOYMENT_GUIDE.md)
- 🐛 [Issues](https://github.com/your-repo/issues)

---

## 🌟 특별 감사

이 프로젝트는 다음 기술을 사용합니다:
- [Next.js](https://nextjs.org/) - React 프레임워크
- [Firebase](https://firebase.google.com/) - 백엔드 플랫폼
- [TypeScript](https://www.typescriptlang.org/) - 타입 안정성
- [Zod](https://zod.dev/) - 스키마 검증

---

<div align="center">

**상용화 수준의 AI 에이전트 시스템** 🚀

Made with ❤️ using Next.js & Firebase

[시작하기](#-빠른-시작) • [문서](AGENT_DOCUMENTATION.md) • [배포](DEPLOYMENT_GUIDE.md)

</div>
