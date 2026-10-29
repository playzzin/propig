# 메뉴 저장·전환 후속 검증

## 저장의 정본

`/admin/menu`의 편집 초안과 공개 메뉴 cache는 별개다. 저장은 인증된 `PUT /api/admin/menu-sites`에서 `{ok:true}`를 확인한 뒤에만 cache/localStorage에 반영한다. Next runtime과 Firebase Hosting은 같은 서버 권한을 적용한다.

- 로그아웃·403·네트워크 오류·잘못된 성공 응답은 실패다.
- 인증 토큰 대기와 요청 전체에 15초 deadline이 있다. 시간이 지난 후 토큰이 도착해도 늦은 요청을 보내지 않는다.
- timeout은 서버 미저장을 증명하지 않는다. 화면에서는 성공을 단정하지 않고 편집 초안을 보존해 명시적 재시도를 제공한다.
- 서버 저장은 `sites` map 전체를 교체한다. `mergeFields`로 다른 top-level 필드는 보존하고 삭제된 사이트 key가 재귀 병합으로 살아남지 않게 한다.
- 현재 기능은 다중 관리자 사이의 optimistic-concurrency/서버 revision 충돌 해결까지 제공하지 않는다. 같은 문서를 여러 관리자가 동시에 편집하면 마지막 서버 저장이 정본이다.

## 편집 lifecycle

- 각 편집은 revision을 증가시킨다. 저장 완료는 해당 revision만 clean으로 만들 수 있다.
- 저장 중 추가 편집·사이트 편집 탭 전환·query ACK/refetch가 새 초안을 덮어쓰지 않는다.
- 동일 tick의 두 번 클릭도 in-flight lock으로 한 요청만 처리한다.
- 자동 저장 실패 또는 권한 변경 시 자동 재시도를 멈춘다. `다시 저장`으로 명시적으로 재개한다.
- 저장하지 못한 내용은 열린 탭 메모리에 유지되며 reload 경고를 제공한다. 영구 offline draft 저장이라고 표현하지 않는다.

## 반복 검증

- `npm run verify:admin-menu`: 기존 메뉴 계약·cache/lifecycle + 실제 서비스/Next handler/auth를 격리 IO로 실행 + 실제 관리자 React page/hook 회귀.
- `CHROME_PATH=<chromium> npm run verify:admin-menu-browser`: 실제 관리자 페이지·컴포넌트·서비스를 browser bundle로 실행한다. identity/Firebase/network만 별도 loopback fixture로 교체하고 모든 외부 요청을 차단한다. 운영 관리자 계정이나 실제 Firestore 저장 성공을 뜻하지 않는다.
- `CHROME_PATH=<chromium> npm run verify:corp-mode-performance`: 이미 실행 중인 production 서버에서 브라우저 cold/warm의 클릭→URL+본문 제목 준비를 측정한다. 기본 URL은 3002이며 `CORP_MODE_PERF_URL`로 바꿀 수 있다. 고정 안정화 대기는 포함하지 않는다.
- 저장 browser verifier는 기존 release-browser/CI 명령에 연결한다. production 성능 검사는 dev compile 시간과 혼합하지 않도록 별도 명령으로 유지한다.

## 로컬 최종 실행 결과

- 실제 production 서버에서 기업 모드 전환 18회 모두 2000ms budget 통과. 브라우저 신규 context 기준 첫 전환 최대: desktop 52ms, mobile 52ms. 재방문 최대: desktop 22ms, mobile 34ms. 이는 클릭→URL+본문 제목 준비이며 전체 이미지 완료나 운영 인터넷 성능을 뜻하지 않는다. 변경 전 반복 측정도 빠르게 통과했으므로 개선율을 주장하지 않는다.
- 새 Next production build 성공, 웹/Functions 전체 TypeScript 통과, Functions 임시 outDir emit와 JS syntax 통과.
- 실제 관리자 페이지·서비스 browser fixture에서 성공/실패/재시도/추가 편집/권한 회수 통과, 외부 요청 0, pageerror 0.
- 실제 로컬 production API에서 비인증 PUT은 401. 인증·권한·유효성·저장 서버 경로는 실제 auth/handler + 격리 IO로 별도 검증했다.
- 이전 popover 제거·모바일 inert/Escape/focus·구형 편집기 canonical 이동 회귀 통과.
- 운영 Firestore 수정, 배포, commit, push는 수행하지 않았다.

## WSL 검증 환경

Windows 원본 node_modules는 덮어쓰지 않는다. 부족한 Linux CSS 엔진과 esbuild native binary, Chromium shared library는 임시 prefix에 설치하고 해당 검증 명령에만 `NODE_PATH`, `ESBUILD_BINARY_PATH`, `LD_LIBRARY_PATH`를 전달할 수 있다. 정상 Linux clean install에서는 이러한 임시 경로를 요구하지 않는다.
