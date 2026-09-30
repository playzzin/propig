# 페이지 전환 로딩 복구 작업 인계

- 요청: ‘페이지를 준비하고 있습니다’에서 멈추는 화면 조사 및 개선.
- owner: Hermes lead. 수정 범위: `src/app/loading.tsx`, `scripts/verify-navigation-performance.mjs`, `scripts/verify-route-loading-recovery.mjs`, 이 문서.
- 기존 미추적 Hermes office 파일은 수정하지 않았다. 데이터·권한·의존성·배포 설정은 변경하지 않았다.

## 확인한 현상과 원인 범위

로컬 3002의 기존 Chrome 탭에서 `/propig/memos`가 공통 route fallback에 머물렀다. `/propig`로 이동할 때 RSC 요청은 HTTP 200으로 응답했고 주소와 헤더도 변경됐지만 본문은 계속 fallback이었다. 같은 메모장을 새 탭에서 직접 열면 본문이 표시됐다. 이후 별도 브라우저 세션에서는 대시보드→메모장→상점 전환이 정상 완료됐다.

따라서 페이지의 데이터 부족만으로 설명되는 현상이 아니라 특정 브라우저 세션의 페이지 전환 대기가 풀리지 않는 현상이다. 어떤 요청 또는 개발 중 코드 갱신이 최초 원인인지는 확정하지 못했다. 기존 탭이 닫혀 해당 세션의 새로고침 복구는 직접 검증하지 못했다. 이 변경을 Next.js 내부 원인의 완전한 해결로 해석하지 않는다.

공통 fallback에는 시간 경과 안내나 복구 수단이 없었고, 기존 navigation 검사는 `main` 표시 대기 실패를 무시해 로딩 상태를 성공으로 판정할 수 있었다.

## 개선

- 15초 이후 지연 안내와 명시적 새로고침 버튼 제공. 자동 reload/주기적 재요청 없음.
- 새 경로에서 타이머 초기화, fallback 해제 시 타이머 정리.
- 지연 시 회전 중지 및 reduced-motion 지원.
- navigation 검사에서 fallback 종료와 실제 `main` 표시를 필수로 확인.

## 검증

- `node scripts/verify-route-loading-recovery.mjs`: 실제 React 렌더러에 라우터·타이머만 대체. 지연 전/후, 명시적 reload, 자동 reload 없음, 경로 전환 초기화, unmount 정리 통과. Windows에 renderer가 없어 기존 Linux 도구 경로를 `PROPIG_TEST_RUNTIME`으로 지정했다.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.typecheck.json`: 통과.
- 수정 TSX 및 검증 스크립트의 `eslint --no-ignore`: 통과.
- route-shell 계약 및 `git diff --check`: 통과.
- Linux 임시 소스 스냅샷에서 Next.js 16.3.3 `next build --webpack`: exit 0, 80/80 페이지 생성. 최초 시도는 스냅샷에 `public`을 빠뜨려 실패했으며 공개 리소스를 포함한 재실행에서 통과했다. 기존 Linux 의존성을 재사용했고 Windows 설치는 변경하지 않았다.
- 실제 브라우저: 메모장/상점 본문 표시와 로딩 종료 확인. 1366px 메모장 및 390px 상점 가로 넘침 없음.
- 수정한 navigation-performance 전체 시나리오는 이번에 실행하지 않았다. 지연 복구 상태의 실제 브라우저 강제 재현은 미검증이며 타이머/버튼 동작은 React 테스트로 확인했다.

운영 배포는 수행하지 않았다. 최초 멈춤을 만든 내부 조건과 모든 페이지/계정 조합은 미검증이다.
