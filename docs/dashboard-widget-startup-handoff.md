# Dashboard widget startup handoff

## 변경
- PropigDashboard의 bucket/todo hook에서 persistence 이후 목록과 분류 listener를 먼저 연결하고, ensureDefaultCategories는 그 뒤 await한다. 목록이 오면 표시하되 목록·분류 snapshot과 defaults 준비가 모두 충족돼야 ready다.
- 초기화/어느 listener든 오류가 나면 같은 연결의 다른 정상 snapshot이 오류를 지우지 않는다. 별도 자동 retry를 추가하지 않았으며 재진입이 필요하다.
- 준비되지 않은 create/update/delete 요청은 silent resolve 대신 reject한다. 빈 분류에서도 생성은 reject하므로 상위 form이 초안을 비우거나 거짓 성공 toast를 띄우지 않는다. 추가 버튼은 ready 전 비활성화한다.
- 계정별 owner mask와 cleanup의 didCancel/SDK UID 검사를 보존했다. 서버 권한 또는 다중 기기 원자성 변경은 아니다.

## 검증
- verify-dashboard-widget-startup.mjs 신규12 PASS: 실제 소스 함수 AST 추출 + React renderer, 서비스/인증/날짜 helper 대역. 목록 먼저 도착, 분류 먼저 도착, defaults 지연·실패, 다른 listener 정상 응답 뒤 오류 유지, blocked create, 빈 분류, 계정 전환, unmount 검사.
- verify-dashboard-account-lifecycle.mjs 기존12 PASS. 이전 fixture는 B snapshot을 즉시 전달하면서 defaults 대기를 전제로 빈 목록을 기대했다. B snapshot을 실제 지연시키도록 수정하고, 이제 미리 생성한 B listener는 unmount에서 모두 해제되는 것을 검사한다.
- 신규 verifier를 package.json verify:account-lifecycle에 연결했다. 기존 preview build 변경은 유지했다.
- 격리 Linux runtime type-check 및 PropigDashboard focused ESLint PASS, git diff --check PASS.

## 제한
- 전체 build/실제 browser/운영 SDK는 미검증. 기존 build 실행 보호 차단을 우회하지 않았다. 커밋/푸시/배포 미실시.
- 서버 listener 자체의 데이터 도착 시간, 사용자 로그인 성능 개선율은 측정하지 않았다.
- 메모 hydration, 이미지 preview 관련 기존 미완료 변경은 별도 범위로 남아 있다.
