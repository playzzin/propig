# 순차 개선 운영 릴리스 — 2026-09-13

## 게시

- 사용자 이번 작업 커밋·푸시·배포 승인 후 실행.
- 코드: `75643542f6d805eacc386009fb87cf287c166775`
- 브랜치: `codex/add-founding-background-to-introduction`; origin push 성공. main 병합 없음.
- Linux 검증 복제본에서 `functions:hostingApi,functions:openRouterUsage,firestore:rules,hosting`만 targeted deploy 성공.
- Firebase 프로젝트 `propig-63524`, Firestore database `pppp`, Hosting 정적 산출물 500파일.
- 전후 Functions 26개 유지. 메타데이터 변경은 hostingApi/openRouterUsage 두 개뿐. 다른 24개 보존, 삭제 없음.
- 이 문서는 배포 후 기록이다. 별도 문서 커밋은 제품 재배포를 요구하지 않는다.

## 실제 검증

- 전체 release-static, production build, npm test, type-check, Functions build, 로컬 release-browser 통과. 검증된 제품 소스와 원본의 일치 재확인.
- 실제 Firestore 에뮬레이터 Rules 74검사 통과: 초대 직접 읽기/쓰기 거부, 이미지 정책·audit·원장 클라이언트 쓰기 거부, admin 읽기와 양성 대조군.
- Firebase 배포 단계 Rules 서버 컴파일 및 게시 성공.
- 운영 9개 경로의 HTML SHA-256이 로컬 게시 산출물과 일치: corp/blog/propig/admin/users/invitations/production-inbox/openrouter-usage/invite 관련 경로.
- 운영 API 5개 미인증 GET 모두 401: users, invitations, image-budgets, production-inbox, openrouter-usage.
- 운영 1366/390px에서 초대 관리·제작 작업함·사용량·초대 수락의 비로그인 상태 총 8화면 확인, 가로 넘침 및 pageerror 없음. 토큰 없는 /invite는 명시적인 잘못된 링크 안내.
- 최초 운영 브라우저 검사의 networkidle 대기는 외부 연결로 timeout. DOMContentLoaded 후 실제 안내 요소의 visible 상태를 기다리도록 검증기를 수정하여 재실행 통과. 제품 코드는 변경하지 않았다.

## 로그와 제한

- `/tmp/propig-roadmap-{static,build,tests,browser-final,deploy,live-smoke}.log` (임시 로컬 실행 로그).
- 운영 Google 로그인·실제 초대 발급/수락·실회원 권한 변경·실제 예산 정산·유료 공급자 실행은 하지 않았다. 해당 흐름은 격리 실제 코드/브라우저 IO 대역 검사이며 운영 쓰기 E2E로 주장하지 않는다.
- 전역 마지막 관리자 보존 invariant 및 불확실 권한 변경 잠금의 운영 자동복구는 미구현.
- 독립 팀 자료 공유 및 영상·텍스트 통합 예산은 범위 밖. 이미지 수동 정산은 내부 장부 조정이지 공급자 청구 확정/환불이 아니다.
- 원격 CI 성공 여부는 이 릴리스에서 별도 확인하지 않았다.
