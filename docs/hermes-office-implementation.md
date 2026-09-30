# Hermes AI Office 구현 계약

목표: 실제 봇 1개=직원 1명, 100명까지 성장하는 로컬 회사 운영 앱. 기존 ProPig 및 봇 설정을 보존하고, 필요한 인증 변경과 유료 호출은 사용자 승인 범위에서만 수행한다. VPS는 추후 단계다.

이 문서는 최초 기본 계약이다. 후속 구현은 [PC 회사 기능 확장 계약](hermes-office-phase2-contract.md), 현재 검증·적용 상태는 [구현 인계](hermes-office-handoff.md), 비개발자용 설명은 [사용 안내](hermes-office-user-guide.md)를 따른다. VPS는 사용자가 추후 단계로 지정했다. 실제 인증 연결과 모델 호출은 별도로 요청한 승인 전까지 활성화하지 않는다.

통합 owner: root. UI owner: admin leaf, 저장 도메인 owner: security leaf. lead는 서버·연결부·계약·빌드·통합 검증 소유. source types.ts가 화면 계약의 정본이다.

## 저장/API 계약

Python stdlib SQLite 저장소 Store(path). snapshot() -> types.ts Snapshot. action(dict) -> snapshot, ingest(dict) -> snapshot. ValidationError(message), ConflictError(message). 직원은 ingest inventory로만 추가(봇 확인된 botId 필수), 사용자 action으로 가짜 직원 생성 금지. source/inventory root 변경은 허용된 커넥터만 수행.

POST /api/action (same-origin), GET /api/state, GET /api/stream(SSE revision), GET /api/export(Markdown). POST /api/ingest(Bearer token; UI token과 분리). 변경은 SQLite transaction, revision, 사건별 idempotency, 데이터 경계 검증, 민감정보 제거. 화면은 실제 실행을 가장하지 않는다. UI 작업은 queued 상태, 실행 커넥터 도입 전 실행 예약임을 표시.

action types:
- employee.update: id, name?, departmentId?, title?, managerId?, character?, color?, seat?, status? (active/inactive)
- department.save: id?(omit creates), name, description
- project.create: name, goal, ownerId
- task.create: title, request, employeeId, projectId?, criteria, dependencies?, participants?, dueAt?
- task.update: id, revision, status?, summary?, nextAction?, result?, criteria?; running reserved for ingest; completed requires result and criteria, review/approval mandatory; cycle/cancel/dependency checks.
- record.create: kind(award/feedback/education/knowledge/meeting), title, employeeId?, taskId?, content, evidence?, status? (draft)
- record.update: id, revision, status?, evidence?, content?; verified/completed education needs evidence; awards need completed task; records immutable history via events.
- settings.update: companyName?, maxConcurrent? (1..100)

ingest types:
- inventory: eventId, hostId, hostName, employees:[{botId,name,username,profile,model,avatar,capabilities,instructions}], at; upsert globally by botId and preserve user appearance/organization/seat. host heartbeat updates.
- heartbeat: eventId,hostId,at
- agent:start/agent:step/agent:end/agent:error/agent:cancelled: eventId,hostId,botId,runId,at,title?,summary?,result?,success?; task dedupe by hostId+runId; agent:end success never automatically business completed, instead review when result exists, failed if success false; out-of-order events cannot regress terminal state.

## 단계 및 검증

0 탐색 → 1 한 봇 흐름 → 2 직원/조직/기록 → 3 이벤트 복구 → 4 협업/검토 → 5 성과/교육 → 6 사무실 확장 → 7 fixture 100명 검증.
실제 봇 접근이 막히면 미확인으로 보고하며 fixture를 실제 봇으로 등록하지 않는다. 독립 앱은 localhost:3010, 기존 Next 3002와 CY 3000 보존. 앱 데이터와 인증 토큰은 ignored output/hermes-office에 저장. 브라우저는 같은 origin. 공유 인터넷 서비스 배포가 아님.
