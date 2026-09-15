# 유저 관리 품질 개선

## 범위

정식 화면 `/admin/users`, Next `/api/admin/users`, Firebase Hosting의 같은 API를 함께 개선한다. 실제 회원 데이터·계정 권한을 테스트로 변경하지 않는다. 생성·삭제·초대·강제 세션 회수 기능을 임의로 추가하지 않는다.

## 재현한 원인

- 실제 이전 페이지를 격리 브라우저에 렌더하여 메뉴 목록 snapshot 갱신으로 수정 중 직책 초안이 사라지고, 계정 B 전환 직후 계정 A의 query cache 목록이 노출되는 두 결함을 재현했다.
- 두 실제 이전 API handler에서 각각 삭제한 접근 map key가 merge로 남는 문제, 해제한 직접 permission claim이 true로 남는 문제, claims 크기 실패 전에 계정 disabled만 반영되는 문제를 재현했다(총 6건).
- 재현용 identity/Auth/Firestore/transport는 mock이며, 실제 사용자나 운영 API를 호출하지 않았다.

## 개선 계약

- 화면: 계정·SDK 인증 세대별 목록과 편집기 격리, 선택 UID에 초안 결속, 늦은 token/fetch/JSON/저장 응답 무효화, ACK 전 성공 표시 금지, 동기 중복 제출 잠금.
- 편집: 메뉴 snapshot/저장 중 추가 편집 보존, 초안 폐기·선택 전환 확인, 위험한 관리자 승격/비활성화 확인, 본인 관리자 강등/비활성화와 위임 관리자의 본인/관리자 수정 차단.
- 사용자 탐색: 이름/email/UID 검색, 역할/상태 필터, 정렬, 조회한 사용자만 통계에 포함, 빈 결과 초기화, 100명 단위 cursor API 및 더 불러오기, 50명 단위 DOM 표시.
- 장애: 잘못된 입력은 교정 후 재시도, Auth/Firestore 부분 변경·timeout·잘못된 성공 응답은 상태 불확실로 표시하고 새로고침 확인 전 재저장 차단.
- 서버: 두 진입점의 요청 검증·오류 코드·pagination 동등성, private no-store, Firestore 권한 정보 조회 실패 시 fail closed, claims 크기 사전 검증, permission alias 갱신, nested map 전체 교체와 기타 문서 필드 보존.
- 구조: 개발용 URL 인증 fixture를 제품 화면에서 제거. 실제 page/controller/model 및 실제 Next/Hosting handler를 별도 격리 harness에서 실행. `verify:admin-users` 명령은 새 격리 브라우저 검사 호환 진입점이다.

## 검증과 증거

- 두 실제 API handler 회귀 **40건 PASS**. real Zod를 사용하고 identity/Admin SDK/Firestore/audit IO만 격리했다.
- 실제 React page/controller/model/TanStack 브라우저 회귀 PASS: 초안 보존·폐기 확인·동기 중복 잠금·ACK와 추가 편집·입력 실패 재시도·불확실/잘못된 ACK 복구·token/fetch/JSON 지연 성공/거부·SDK-only A→B→A·권한 회수·20초 전체 deadline의 축약 시간 fixture·늦은 token 전송 차단·같은 UID 재열기·unmount·cursor·검색/상태필터·자기보호·위험 변경 확인·모바일 스크롤 후 저장.
- 실제 이전 스타일의 보조 글자 대비 9개 노드를 검출하여 색상·opacity를 교정했다. 최종 desktop axe WCAG 2A/2AA/2.1AA 위반 0, pageerror·외부 요청 0 (격리 fixture).
- production 정적 export와 Next webpack 서버 빌드 모두 exit 0. Functions TypeScript build, focused ESLint, 전체 `verify:release-static`, `npm test` PASS.
- 실제 정적 산출물 서버에서 전체 `verify:release-browser` PASS. 이후 Next 서버 최신 `.next-users-final`을 WSL 3002에 실행했고 유저관리 브라우저 회귀 재통과. 별도 Windows 개발 서버/CY는 변경하지 않았다.
- 빌드된 실제 `/admin/users?__adminUsersFixture=1`에서 PC·모바일 guest gate 확인: 입력·유저 행·private API 요청 0. 개발용 URL 우회가 더 이상 제품 인증을 대체하지 못한다.
- 실제 Next `/api/admin/users`의 미인증 GET/PATCH 모두 HTTP401 및 no-store 확인. 로그인된 실제 계정으로 GET/PATCH를 수행한 것은 아니다.
- 원본과 검증 mirror의 변경 소스·테스트·설정 10개 파일 내용 일치, git diff --check PASS.
- 로그: `/tmp/propig-users-{baseline-browser,baseline-api,static-second,functions-build,browser-final,browser-expanded,build-static,build-next,release-browser,test,next-browser,lint-final}.log`; screenshot: `/tmp/propig-users-{desktop,mobile}.png`; axe: `/tmp/propig-users-axe.json`.

## 운영 게시 — 2026-09-10

- 사용자가 이번 작업의 커밋·푸시·운영 배포를 명시 승인했다.
- 코드 커밋: `820f4c89c431b56b6ffff5f730123a443a8e2f96`, 기존 `codex/add-founding-background-to-introduction` 브랜치에 push. main 병합 없음.
- 검증 원본/mirror 소스·설정 507개 일치. 승인 범위 11개 파일만 커밋했다.
- Firebase `propig-63524`에 `hosting,functions:hostingApi`만 배포, CLI exit 0. Hosting 480개 파일 게시 및 hostingApi 업데이트 성공.
- 배포 전후 원격 함수 이름 집합 동일. hostingApi ACTIVE 및 metadata 변경 확인, 다른 25개 함수 metadata 동일(legacy 포함). Rules와 실제 회원 데이터·권한은 변경하지 않았다.
- 운영 `/admin/users`, `/corp`, `/blog`, `/propig`, `/admin` HTTP200 및 검증한 정적 HTML 산출물과 bytes/SHA-256 일치.
- 운영 유저 관리 PC·모바일 guest gate 브라우저 PASS. 구 fixture query로 인증 우회 불가, private 사용자 API 요청 0, 유저 행·입력 노출 0, pageerror 및 가로 넘침 없음.
- 운영 `/api/admin/users` 미인증 GET/PATCH 각각 HTTP401 및 no-store 확인. 격리 브라우저 회귀도 함께 재통과했다. 로그인된 실제 관리자 쓰기 E2E를 검증했다는 뜻은 아니다.
- 근거: `/tmp/propig-users-{deploy,production-browser,prepublish-api,prepublish-boundary}.log`, 원격 함수 전후 metadata는 접근 제한된 임시 JSON으로 보관.
- 이 운영 결과 기록은 코드 배포 후 문서 전용 후속 커밋으로 게시한다.

## 남은 한계

- Auth와 Firestore 사이 분산 원자적 트랜잭션, 여러 관리자의 동시 편집 충돌 해결, 마지막 관리자 전역 보호는 제공하지 않는다. 부분 실패를 안전하게 표시하는 것과 서버 롤백 보장은 다르다.
- 기존 로그인 세션의 즉시 강제 회수 및 모든 서버 경로의 revoked-token 검사는 이번 변경에 포함되지 않는다. claims 변경만으로 이미 발급된 ID token이 즉시 교체되지는 않는다.
- 조회한 계정만 검색·정렬한다. 전체 계정 검색 인덱스/전체 수 집계와 동일하지 않다.
- Firebase custom claims 전체 크기 제한은 유지하며, 많은 접근 map을 JWT 밖으로 이전하는 데이터 마이그레이션은 별도다.
- 운영 사용자 쓰기·실제 Firebase 동시성·Rules emulator 검증은 수행하지 않는다.
