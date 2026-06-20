# 🚀 배포 가이드

## 📋 목차
1. [사전 준비](#사전-준비)
2. [환경 설정](#환경-설정)
3. [로컬 개발](#로컬-개발)
4. [프로덕션 배포](#프로덕션-배포)
5. [모니터링 설정](#모니터링-설정)
6. [보안 체크리스트](#보안-체크리스트)

---

## 🛠️ 사전 준비

### 필수 요구사항
- Node.js 20+
- npm 또는 yarn
- Firebase 프로젝트
- Git

### Firebase 설정

1. **Firebase Console에서 프로젝트 생성**
   - https://console.firebase.google.com/

2. **Firestore 활성화**
   - 데이터베이스 > Firestore Database > 데이터베이스 만들기
   - 프로덕션 모드로 시작

3. **Firebase Storage 활성화**
   - Storage > 시작하기
   - 기본 규칙으로 시작

4. **서비스 계정 키 다운로드**
   - 프로젝트 설정 > 서비스 계정
   - "새 비공개 키 생성" 클릭
   - `serviceAccountKey.json` 다운로드

---

## ⚙️ 환경 설정

### 1. 저장소 클론
```bash
git clone <repository-url>
cd propig
```

### 2. 의존성 설치
```bash
npm install
```

### 3. Firebase 설정
프로젝트 루트에 `serviceAccountKey.json` 파일 배치:
```
propig/
├── serviceAccountKey.json  ← 여기
├── package.json
└── src/
```

### 4. 환경 변수 설정 (옵션)
`.env.local` 파일 생성:
```env
# Firebase (환경 변수로 관리하는 경우)
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# API Keys (필요한 경우)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# 기타 설정
NODE_ENV=development
PORT=6001
```

---

## 💻 로컬 개발

### 개발 서버 실행
```bash
npm run dev
```

서버가 http://localhost:6001 에서 실행됩니다.

### 테스트 요청
```bash
# 기본 채팅
curl -X POST http://localhost:6001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello AI!"}'

# 헬스 체크
curl http://localhost:6001/api/v1/chat
```

### 통합 예제 실행
```bash
# TypeScript 실행
npx ts-node src/agents/examples/integration-example.ts
```

---

## 🌐 프로덕션 배포

### Vercel 배포 (권장)

1. **Vercel 계정 생성**
   - https://vercel.com

2. **프로젝트 연결**
   ```bash
   npm i -g vercel
   vercel login
   vercel
   ```

3. **환경 변수 설정**
   Vercel Dashboard에서:
   - Settings > Environment Variables
   - `FIREBASE_SERVICE_ACCOUNT_KEY` 추가 (전체 JSON을 문자열로)

4. **배포**
   ```bash
   vercel --prod
   ```

### Docker 배포

1. **Dockerfile 생성**
   ```dockerfile
   FROM node:20-alpine

   WORKDIR /app

   COPY package*.json ./
   RUN npm ci --only=production

   COPY . .
   RUN npm run build

   EXPOSE 6001

   CMD ["npm", "start"]
   ```

2. **이미지 빌드**
   ```bash
   docker build -t propig-agent .
   ```

3. **컨테이너 실행**
   ```bash
   docker run -p 6001:6001 \
     -e FIREBASE_SERVICE_ACCOUNT_KEY="$(cat serviceAccountKey.json)" \
     propig-agent
   ```

### AWS/GCP/Azure

프로덕션 환경에서는 다음을 고려하세요:

1. **로드 밸런서** 설정
2. **Auto Scaling** 구성
3. **CDN** 설정 (CloudFront, Cloud CDN, etc.)
4. **SSL/TLS** 인증서
5. **백업 및 복구** 전략

---

## 📊 모니터링 설정

### 1. 로그 수집

**Firestore 로그 조회**
```typescript
const logs = await admin.firestore()
  .collection('agentMetrics')
  .where('timestamp', '>', Date.now() - 3600000)
  .get();
```

**로그 스트리밍 (CloudWatch/Stackdriver)**
```bash
# AWS
aws logs tail /aws/lambda/propig-agent --follow

# GCP
gcloud logging read "resource.type=gae_app" --limit 50 --format json
```

### 2. 메트릭 대시보드

**Grafana 대시보드 설정**
```yaml
# grafana-dashboard.json
{
  "dashboard": {
    "title": "AI Agent Metrics",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(agent_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(agent_errors_total[5m])"
          }
        ]
      },
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, agent_response_time_bucket)"
          }
        ]
      }
    ]
  }
}
```

### 3. 알람 설정

**에러율 알람**
```typescript
// src/monitoring/alerts.ts
export async function checkErrorRate() {
  const metrics = await metricsCollector.getPerformanceReport('hour');

  if (metrics.successRate < 95) {
    // Send alert (Email, Slack, PagerDuty, etc.)
    await sendAlert({
      level: 'warning',
      message: `Success rate dropped to ${metrics.successRate}%`,
      metrics
    });
  }
}
```

---

## 🔒 보안 체크리스트

### 배포 전 확인사항

- [ ] **서비스 계정 키 보안**
  - Git에 커밋되지 않았는지 확인 (.gitignore 확인)
  - 환경 변수로 관리
  - 정기적으로 키 로테이션

- [ ] **Rate Limiting 활성화**
  - 공개 API: 15분에 100 요청
  - 인증 API: 15분에 1000 요청
  - 조정 필요시 `src/agents/security/RateLimiter.ts` 수정

- [ ] **Input Validation**
  - 모든 입력 검증 활성화
  - XSS/SQL Injection 방어 확인

- [ ] **CORS 설정**
  - 허용된 도메인만 접근 가능하도록 설정
  - `src/agents/security/RateLimiter.ts`의 `corsConfig` 확인

- [ ] **HTTPS 강제**
  - 프로덕션 환경에서 HTTPS만 허용
  - HSTS 헤더 활성화

- [ ] **API 키 관리**
  - 외부 API 키 환경 변수로 관리
  - 키 노출 방지

- [ ] **Firestore 규칙**
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      // 기본적으로 모든 접근 거부
      match /{document=**} {
        allow read, write: if false;
      }

      // 서버 측 인증만 허용
      match /sessions/{sessionId} {
        allow read, write: if request.auth != null;
      }

      match /agentMetrics/{metricId} {
        allow write: if request.auth != null;
        allow read: if request.auth.token.admin == true;
      }
    }
  }
  ```

- [ ] **Firebase Storage 규칙**
  ```javascript
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /uploads/{userId}/{allPaths=**} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if request.auth != null && request.auth.uid == userId
                     && request.resource.size < 5 * 1024 * 1024; // 5MB limit
      }
    }
  }
  ```

---

## 🧪 프로덕션 테스트

### 로드 테스트
```bash
# Artillery를 사용한 로드 테스트
npm install -g artillery

# artillery.yml
artillery run artillery.yml
```

```yaml
# artillery.yml
config:
  target: "https://your-domain.com"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Ramp up"
    - duration: 60
      arrivalRate: 100
      name: "Sustained load"

scenarios:
  - name: "Chat API"
    flow:
      - post:
          url: "/api/v1/chat"
          json:
            message: "Hello AI!"
            userId: "{{ $randomString() }}"
```

### 통합 테스트
```bash
npm test
```

---

## 📈 성능 최적화

### 1. 캐싱 전략

**Redis 캐싱 (선택사항)**
```typescript
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL
});

// 캐시 설정
await redis.set(
  `session:${sessionId}`,
  JSON.stringify(sessionData),
  { EX: 3600 } // 1시간
);

// 캐시 조회
const cached = await redis.get(`session:${sessionId}`);
```

### 2. 데이터베이스 인덱스

**Firestore 인덱스**
```javascript
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "agentMetrics",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "sessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "lastAccessedAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### 3. CDN 설정

**Cloudflare 설정**
- API 엔드포인트를 CDN에 연결
- 정적 에셋 캐싱
- DDoS 방어

---

## 🔄 CI/CD 파이프라인

### GitHub Actions 예제

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

---

## 📞 지원 및 문제 해결

### 일반적인 문제

**1. Firebase 연결 실패**
```
Error: Could not load the default credentials
```
해결: `serviceAccountKey.json` 파일이 올바른 위치에 있는지 확인

**2. Rate Limit 초과**
```
Error: RATE_LIMIT_EXCEEDED
```
해결: Rate Limit 설정 조정 또는 API 키 인증 사용

**3. 메모리 부족**
```
Error: JavaScript heap out of memory
```
해결: Node.js 메모리 증가 `NODE_OPTIONS=--max-old-space-size=4096`

---

## ✅ 배포 완료 체크리스트

- [ ] 로컬 개발 환경 테스트 완료
- [ ] Firebase 설정 완료
- [ ] 환경 변수 설정 완료
- [ ] 보안 체크리스트 확인
- [ ] 프로덕션 빌드 성공
- [ ] 로드 테스트 완료
- [ ] 모니터링 설정 완료
- [ ] 알람 설정 완료
- [ ] 백업 전략 수립
- [ ] 문서화 완료
- [ ] 팀 교육 완료

---

**배포 준비 완료! 🚀**
