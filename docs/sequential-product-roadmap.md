# ProPig 순차 제품 개선

## 실행 순서

1. 권한 변경 안전장치: 조회 버전 기반 충돌 거부, 두 API의 같은 대상 저장 직렬화, 불확실 저장 잠금, 기존 활동 로그 연결.
2. 팀 초대: 기존 workspace/회원 모델을 확인한 뒤 초대·수락·만료·취소 흐름을 연결.
3. 제작 작업함: 기존 이미지·영상·이모티콘 작업/산출물 저장소를 재사용하는 통합 탐색.
4. AI 예산: 예상·확정·미확정 비용과 provider 호출 전 제한을 분리.

## 1단계 설계 경계

- 클라이언트 편집 revision과 서버 권한 revision은 별개다. 서버 revision은 Auth/권한 문서의 현재 상태를 정규화한 불투명 SHA-256이며, 클라이언트는 조회한 값을 그대로 PATCH에 전달한다.
- 단순 read-compare-write는 동시성 보호가 아니다. Next/Hosting 모두 동일 서버 전용 잠금 문서의 transaction을 통과한 뒤에만 Auth를 변경한다.
- Firebase Auth와 Firestore는 분산 원자 트랜잭션이 없다. 변경 실패 시 rollback 성공이라고 표현하지 않는다. 불확실 잠금은 시간 경과나 화면 새로고침만으로 해제하지 않는다.
- 다른 관리자의 먼저 저장한 변경과 진행 중 저장은 409 및 명시 코드로 거부한다. 화면은 초안을 보존하되 대상별 재저장을 막고 새로고침 확인을 요구한다.
- 기존 활동 로그 화면에 사용자 UID와 action 필터로 연결한다. 전역 관리자가 아닌 위임 관리자에게 관리자 전용 로그 링크를 노출하지 않는다.
- 적용 범위는 협력하는 두 API다. Firebase Console·외부 Admin SDK·직접 Firestore 쓰기의 직렬화나 기존 ID token 즉시 회수까지 보장하지 않는다.
- 전역 마지막 관리자 보호는 Auth claim·관리자 문서·활성 토큰 권위를 함께 다뤄야 한다. 임의 Firestore 문서 개수로 안전하다고 판정하지 않는다.

## 검증 상태

- 1단계 구현·로컬 검증 완료, 게시 미완료. 마지막 관리자 전역 보호 및 불확실 잠금 운영 복구 자동화는 아래 제한으로 남긴다.
- 실제 Next/Hosting handler **46건 PASS**: 기존 입력·권한·alias·map·부분 실패와 신규 stale/missing revision, 두 진입점 동시 요청 단일 성공, 불확실 잠금의 새 요청 차단.
- 실제 helper 격리 회귀 PASS: 각 helper 12개 동시 예약 중 1개 성공, 대상별 독립성, owner 검사, 오래된 잠금 자동 만료 없음, marker 실패 보존, 성공 해제, canonical hash parity. 감사 sanitizer 모형에서 100-key map 보존 검사이며 실제 운영 로그 검증은 아님.
- 실제 페이지 브라우저 PASS: revision 전달, conflict/in-progress 초안 유지, 재열기에도 재저장 차단, 명시적 새로고침 뒤 새 revision 사용. 기존 계정 전환·late ACK·모바일·접근성 회귀 포함.
- 정적 export/Next webpack/Functions 빌드, focused lint, verify:release-static, npm test PASS. 실제 정적 산출물 서버 3002에서 전체 verify:release-browser PASS.
- 최초 통합 브라우저 검사는 임시 3102 사용 중 sidebar 검증기가 3002로 접속해 실패했다. 자기 QA 서버만 정리하고 3002에서 전체 재실행하여 통과했다. 제품 결함과 구분한다.
- 변경 소스/테스트/설정 12개 원본·Linux mirror 일치, 두 helper byte-identical, git diff --check PASS.
- 로그: `/tmp/propig-phase1-{api-safety,static-final,functions-final,final-lint,build,next-build,release-browser-final,tests,browser-history}.log`.
- 실제 회원 데이터·운영 권한·유료 provider 호출은 테스트에 사용하지 않았다. commit/push/배포는 이번 신규 작업의 명시 승인 전까지 하지 않는다.

## 운영 복구 제한

- 잠금: `serverRateLimits/admin-user-update-${sha256(uid)}`. 현재 Rules에서 client write가 금지된 namespace이며 민감 권한 payload는 저장하지 않는다. Rules 변경 없음.
- running/uncertain 잠금은 자동 만료하지 않는다. Auth 요청에 서버 fencing을 걸 수 없으므로 TTL만으로 풀면 오래된 요청이 나중에 덮어쓸 수 있다.
- 복구는 운영자가 모든 관련 writer 및 in-flight 요청의 종료를 확인한 뒤 Auth/userAccess/admins를 대조·정합화하고 정확한 대상 잠금만 제거해야 한다. 이 문서는 운영 삭제 실행 승인이 아니며 원클릭 무조건 해제 기능은 제공하지 않는다.

## 2~4단계 구현 및 통합 검증

- 전역 온보딩 초대 발급·수락·취소·재발급 구현. 수락은 권한 자동 부여가 아니며 관리자 UID 지정 검토로 연결한다. 독립 팀 공간/자료 공유는 범위 밖이다.
- 현재 UID의 실행 이력·저장 결과·영상·스토리보드 읽기 전용 작업함 구현. 불명확한 상태/누락 메타데이터를 완료로 추정하지 않는다.
- 사용자별 이미지 일일 정책과 실제 원장 기반 수동 정산 구현. UTC, 이미지 전용이며 OpenRouter 청구서·환불과 다르다. 정책 0은 신규 유료 입장을 막고 null은 환경 기본값으로 복원한다.
- 수동 정산은 실제 기록된 chargedUsd 차액만 반영하며 같은 생성 요청의 재실행·늦은 worker의 상태 덮어쓰기를 차단한다. 기록 없는 legacy 차감액은 추정하지 않는다.
- 최신 통합 verify:release-static, build, npm test, verify:release-browser 및 타입/Functions 빌드 통과. 브라우저는 BASE_URL=http://127.0.0.1:3002를 명시했다.
- 예산 양 코어 22그룹, 실제 양 생성 진입점 격리 실행 및 브라우저 회귀 통과. Firestore/Auth IO 모형과 운영 검증을 구분한다.
- 실제 Firestore 에뮬레이터에서 재귀 audit/초대 문서까지 guest/member/admin 읽기 및 create/update/delete, 관리자 양성 대조군 포함 74검사 통과. 실행: `python3 scripts/verify-financial-rules-emulator.py` (로컬 demo emulator 8189 및 현재 Rules 선행 로드 필요).
- Rules 변경은 초대 클라이언트 직접 접근 차단과 이미지 정책/원장 관리자 클라이언트 쓰기 차단이다. 서버 Admin SDK 접근은 유지한다.
- 사용자의 이번 작업 커밋·푸시·배포 승인을 확인했다. 운영 반영 결과는 별도 릴리스 기록에 기재한다. 기존 구형 함수 삭제, 실회원 변경, 유료 호출은 하지 않는다.

## 후속 관리자 보호 보강 — 2026-09-13

- 코드 `7c8371f` 커밋·origin push 후 Hosting 500파일과 hostingApi만 배포 완료. Rules/실회원 권한/운영 잠금은 변경하지 않았다.
- actor + target 공유 잠금과 fresh actor 권한 검증으로 두 API의 교차 관리자 해제 경합을 보호한다. 기존 ADMIN_UIDS 서버 권위는 유지하고 삭제/비활성 actor는 차단한다.
- 읽기 전용 복구 진단 도구와 운영 runbook 추가. 잠금 해제 자동화는 의도적으로 제공하지 않는다.
- 실제 양 handler 64사례, helper/복구/브라우저 회귀, 실제 Firestore 에뮬레이터 동시 예약 검사와 전체 통합 게이트 통과.
- 운영 9경로 HTML 해시 일치, 5 API 비로그인401, 1366/390px 관련8화면 확인. Functions26개 유지, 메타데이터 변경은 hostingApi만 확인.
- 상세: `docs/admin-user-continuity-recovery.md`. 전역 마지막 관리자 invariant는 여전히 외부 writer·기존 token·직접 Rules 권위를 포함한 별도 설계가 필요하다. 이번 보강과 구분한다.
- 다음 제품 확장은 독립 팀 데이터 공유·영상/텍스트 예산이다. 자동으로 기존 개인 데이터를 공유하거나 유료 원장을 합치지 않는다.

## 2단계 착수 전 확인한 제품 결정

- 현재 전역 userAccess/admins만 있고 실제 팀 membership·초대 모델은 없다. localWorkspaceService의 workspaceId는 로컬 폴더 식별자라 협업 tenant로 재사용할 수 없다.
- 초대가 전역 ProPig 온보딩인지, 독립 팀 공간/자료 공유인지에 따라 데이터·권한 모델이 달라진다. 사용자 결정 없이 기존 개인 자료에 teamId를 부여하거나 공유하지 않는다.
- 이후 제작함은 기존 ai_generations/aiOperationReservations/video_studio_jobs 및 개인 storyboard를 읽는 adapter 방식으로 계획한다. 이모티콘 로컬 초안을 임의 사용자에게 귀속시키지 않는다.
- 기존 openrouter-usage 화면은 있으나 uncertain 목록이 빈 상수이고 Next POST 정산 경로가 없는 부분이 발견됐다. 4단계에서는 UI 복제보다 실제 원장·정산 계약을 우선한다.
