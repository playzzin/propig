# ProPig Autonomous Development Plan

이 문서는 현재 워크트리 기준으로 ProPig 고도화 작업을 빠짐없이 순차 진행하기 위한 실행 계획이다.

## 운영 원칙

- 먼저 릴리즈를 막는 자동화 게이트를 복구한다.
- 새 기능보다 검증 가능한 기반 작업을 우선한다.
- 큰 컴포넌트와 데이터 접근은 한 번에 갈아엎지 않고, 테스트 가능한 단위부터 분리한다.
- Firebase rules, indexes, API 인증, 외부 provider 호출은 변경할 때마다 검증 항목을 남긴다.
- 기존 사용자 변경은 되돌리지 않고 현재 상태 위에서 이어간다.

## Phase 1. Stabilize CI Gates

Status: complete.

목표: 기본 CI가 신뢰할 수 있는 실패/성공 신호를 내게 만든다.

완료 조건:

- `npm run lint -- --max-warnings=0` 통과
- `npm run type-check` 통과
- `npm test`가 placeholder가 아니라 실제 deterministic 검증을 실행
- GitHub CI와 Firebase deploy 검증에 `npm test` 포함

## Phase 2. Expand Test Coverage

Status: in progress.

목표: 변경 위험이 큰 순수 로직부터 테스트를 늘린다.

우선순위:

- activity log query contract
- habit metric stats
- menu normalization and migration
- URL safety helpers
- generated AI response normalization
- storage path sanitization

완료 조건:

- 신규 테스트가 CI에서 실행됨
- 외부 네트워크나 실제 Firebase 계정 없이 통과 가능
- 실패 시 원인을 좁힐 수 있는 assertion 메시지 포함

## Phase 3. Clarify Deployment Boundaries

Status: in progress.

목표: 정적 export, Next API route, Firebase Functions의 역할을 명확히 한다.

점검 항목:

- `scripts/build-static-export.mjs`가 비활성화하는 API route 목록
- `firebase.json` Hosting rewrites와 실제 Functions export 정합성
- Next runtime이 필요한 route와 Functions로 옮겨야 하는 route 구분
- API route별 인증, 입력 검증, secret 노출 여부

완료 조건:

- `docs/deployment-boundary.md` 문서화
- `npm run verify:deployment-boundary`로 rewrite/export 불일치 감지
- production에서 닿으면 안 되는 development-only route 차단 확인

## Phase 4. Reduce Client Component Risk

목표: 큰 클라이언트 컴포넌트를 테스트 가능하고 유지보수 가능한 단위로 나눈다.

우선순위:

- `src/components/habits/HabitTrackerApp.tsx`
- `src/components/corp/ProjectBoardPage.tsx`
- `src/components/dashboard/Dashboard2Experience.tsx`
- `src/components/propig/PropigDashboard.tsx`
- admin pages over 1,000 lines

완료 조건:

- 순수 계산/normalization 로직을 별도 모듈로 분리
- Firestore/API 호출을 service/hook 계층으로 이동
- UI 분해 후 기존 verify script 또는 targeted browser QA 통과

## Phase 5. Harden Firebase Data Boundaries

목표: Firestore/Storage 접근, rules, indexes, schema를 운영 기준으로 맞춘다.

점검 항목:

- component/page 내부 직접 Firestore 호출
- user-scoped path와 top-level collection 혼재
- missing composite indexes
- undefined field write risk
- batch/transaction이 필요한 다중 문서 변경
- Storage 공개 읽기 범위

완료 조건:

- 반복 collection access는 service/hook/schema로 통합
- 필요한 `firestore.indexes.json` 항목 반영
- rules와 코드 query가 같은 소유권 모델을 사용
- targeted verification 또는 emulator 기반 체크 추가

## Phase 6. Production Safety And Observability

목표: 운영 로그, provider 호출, 외부 fetch, 개발 fixture가 안전한 상태인지 보장한다.

점검 항목:

- AI/provider 응답 전문 로그 제거 또는 redaction
- URL fetch SSRF 보호 공통화
- fixture token이 production에서 비활성화되는지 검증
- Sentry/server logs에 secret이 남지 않는지 점검
- rate limit이 필요한 public API 확인

완료 조건:

- 공통 helper 재사용
- secret/token/API key 로그 차단
- production mode에서 development-only path가 닿지 않음
