# 온보딩 초대 품질·안전 계약

## 제품 범위

- `/admin/users` → `팀원 온보딩 초대` → `/admin/users/invitations`.
- 전체 관리자만 발급·목록·취소·재발급한다. 링크는 자동 메일 발송 없이 복사해 전달한다.
- `/invite#id=…&token=…`에서 초대 이메일의 검증된 Google 계정으로 로그인한 뒤 직접 수락한다. 비밀 fragment는 메모리에 포착한 뒤 주소에서 제거하며 로컬·세션 저장소에 보존하지 않는다.
- 같은 탭의 hash-only 새 링크도 wrapper 재마운트로 받으며, 이전 수락 요청의 UI 게시 권한을 무효화한다.
- 수락은 온보딩 접수다. 전역 역할·custom claims·userAccess는 자동 변경하지 않는다. 팀 공간·기존 자료 공유를 만들지 않는다.
- 수락한 사용자의 `/admin/users?uid=…` 연결은 첫 100명 목록을 검색하는 대신 서버에서 정확한 UID를 조회한다. 기존 revision/동시 잠금 저장 흐름으로 별도 권한 검토·저장한다. 전체 목록 돌아가기는 명시적 링크로 제공한다.

## 서버·저장

- Next 두 route와 Hosting gateway 두 handler는 동일한 invitation core를 사용한다.
- `onboardingInvitations`는 원본 토큰을 저장하지 않고 SHA256 해시만 저장한다. 32-byte 무작위 토큰은 발급·재발급 응답에서만 반환한다. 기본 7일, 서버 입력 1–30일.
- 재발급은 기존 토큰을 무효화한다. 동시 재발급은 이전 hash를 확인하며 이미 수락/취소된 초대를 되살리지 않는다.
- 수락 transaction은 Firebase 토큰의 검증된 이메일과 최신 Auth 계정의 이메일·disabled 상태를 대조한다. 같은 사용자·같은 토큰 수락 재요청은 멱등 성공한다.
- create/reissue/accept 빈도 제한은 서버 전용 rate-limit namespace에서 두 API가 공유한다.
- Firestore Rules 신규 명시 deny뿐 아니라 catch-all의 read/write에서도 `onboardingInvitations`를 제외했다. **소스 변경이며 아직 운영 게시한 규칙이 아니다.**

## 실행 근거

- `npm run verify:invitations`: 실제 양 core·Next/Hosting handler 28개 검사 그룹 통과. crypto·Zod는 실제, 인증·Firestore transaction은 격리 IO mock.
- `npm run verify:invitations-browser`: 실제 TSX·React·TanStack·스타일 실행. PC/mobile guest 차단, 발급·재발급·취소, 중복 호출 차단, A→B→A 늦은 비밀 응답 차단, fragment 제거·저장소 비보존, 명시 수락, 계정 전환·재열기 통과.
- `verify:admin-users-api`: 정확한 UID 조회, 없음 404, UID와 pageToken 혼용/문서경로 입력 거부를 기존 저장 안전 회귀에 추가했다.
- phase2 type-check·Functions 빌드·release-static gate·정적 production build·신규 파일 focused lint 통과.
- 첫 production build는 신규 API의 `docs/api-runtime-boundary.json` 미등록으로 차단됐다. Hosting gateway 및 runtime manifest를 함께 등록한 뒤 재실행 통과했다.

## 운영 적용 전 제한

- 실제 회원 쓰기·Google 계정 초대 수락·Firestore emulator·Rules 배포·운영 게시·메일 전달은 이 검사에 포함하지 않는다.
- 링크를 잃거나 페이지를 새로고침하면 원본 링크 또는 재발급이 필요하다. 저장 성공 후 네트워크 단절은 목록 확인 전 변경 재시도를 차단한다.
- 취소된 초대는 재발급하지 않고 새 초대를 발급한다. 역할 검토 완료 여부를 별도 팀 membership으로 저장하는 기능은 없다.
- 게시할 때 invitation Rules의 catch-all 제외가 실제 반영된 뒤 새 API를 활성화해야 한다. 기존 규칙을 둔 채 API만 먼저 게시하지 않는다.
