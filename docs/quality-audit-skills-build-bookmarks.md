# 추가 품질 감사: 스킬·정적 빌드 복구·상점 모달·북마크

## 범위
현재 소스에서 문제를 재현하고 로컬 수정/검증한다. 이번 작업은 운영 배포·commit/push·사용자 데이터 쓰기·유료 API 호출을 포함하지 않는다.

## 설치한 스킬
- Vercel `web-design-guidelines`: skills.sh의 vercel-labs/agent-skills 원본, Hermes SAFE 판정 후 기본 profile frontend에 설치.
- Anthropic `webapp-testing`: anthropics/skills 원본, Hermes SAFE 판정 후 engineering에 설치. Firebase 지속 연결에서는 networkidle 대신 명시적 준비 상태를 기다리고 기존 Node Playwright 회귀를 재사용하도록 보완.
- 기존 React/Next 렌더링·비동기 상태·보안·운영 스킬은 보존. React best-practices의 기존 차단은 우회하지 않았다. 추가 systematic-debugging은 환경변수 출력 예제로 CAUTION/BLOCKED여서 설치하지 않았다.
- 설치 자체를 앱 성능 향상으로 보고하지 않는다. 스킬은 repo dependency가 아니며 다른 profile 변경 없음.

## 수정과 근거
### P1 — 이전 Next 타입이 정적 export를 반복 실패시킴
- `next.config.ts`, `tsconfig.static-export.json`: 전용 tsconfig로 현재 source와 `.next-static-export` validators만 포함.
- Next 16.3.3 / TypeScript 5.9.3 실제 설정과 공식 tsconfigPath 문서 확인.
- `verify-static-export-types.mjs`: 이전 output의 오류는 제외하되 실제 source 오류와 활성 export validator 오류는 실패하는 negative 검사 PASS.
- 이전 output이 남은 Linux mirror에서 실제 static export 및 재실행 PASS. 원본 소스/타입 검사 삭제·우회 없음.

### P1/P2 — 정적 빌드 복구 시 새 파일 덮기·연쇄 복구 중단·동시 실행
- `scripts/build-static-export.mjs`: 파일별 충돌 검사/복구 오류 처리, stale 복구 이전 exclusive lock.
- 빌드 중 새 원본이 생기면 양쪽을 보존하고 실패. 다른 route의 복구는 계속한다.
- 기존 정상 `.next-static-export`/`out`을 이번 실행 backup으로 보존하고 일반 빌드 실패 때 복원한다.
- `verify-static-export-recovery.mjs`: 실제 wrapper + 명시적 가짜 Next/경계 검사로 child failure, last-good output, 새 파일 충돌, 나머지 복구, 겹친 실행, stale lock 실패를 확인. production build와 구분.
- 강제 종료·시스템 장애는 finally를 보장하지 않는다. `.static-export.lock`이 남으면 WSL/Windows 실행 여부부터 확인하고 lock을 백업으로 이동한 후 재실행한다. `.previous-*` output도 확인·복원하며 무차별 삭제하지 않는다. 실행 중 외부 deploy가 partial 폴더를 읽지 않도록 배포를 빌드 성공 이후 직렬 실행한다.

### P2 — 상점 미리보기 키보드 포커스 이탈
- `src/components/propig/PropigStore.tsx`: 기존 role=dialog는 열린 뒤에도 배경에 focus가 남고 Tab도 배경으로 이동했다. 로컬 production browser에서 before false/false 재현.
- native modal `showModal`로 초기 focus와 배경 inert를 제공하고, Tab/Shift+Tab 경계 순환·Escape·닫기 후 원래 trigger 복귀를 구현.
- 실제 정적 export를 3002에서 서빙해 desktop/mobile 회귀 PASS. 공개 shell 접근성·overflow·JS 오류 회귀 PASS. 모바일 screenshot `/tmp/propig-round3-store-390.png` 시각 확인.

### P1/P2 — 북마크 계정 경계
- 독립 actual-source React StrictMode fixture와 parent 재실행에서 A→B 전환 후 A 목록/검색 잔류, 늦은 A 분석 후 A 쓰기 시도/B 오류 알림 오염 재현.
- HTTP/Firestore는 모의 transport만 사용. 운영 오염을 일으켰다는 뜻이 아니다.
- UID-keyed 내부 화면, StrictMode/재조회별 세션 토큰, Firebase SDK 실제 UID 검사, 두 구독 readiness/error/retry, 모든 분석 await 경계와 기본 카테고리 bootstrap fencing을 적용했다.
- 카테고리별 반복 filter 집계를 단일 순회+useMemo로 변경했다. 무관한 입력 때 참조 재사용과 snapshot 변경 시 갱신을 실제 React에서 확인했다. 속도 향상률은 측정하지 않았다.
- 삭제/즐겨찾기 실패 Promise를 catch하고 현재 계정에만 오류를 알린다.

### P1 — Functions sharp 의존성 취약점
- 최종 audit에서 sharp 0.35.3의 HIGH GHSA-rgj7-g3m4-5g8c(<0.35.4)를 확인하여 선언/lock을 0.35.4로 올렸다.
- Linux mirror lock 기반 npm ci, Functions build 및 실제 PNG decode→resize→WebP encode/decode PASS. root/Functions 최종 npm audit 각각 0. Windows 원본 node_modules는 재설치하지 않았다. 운영 Functions는 미배포다.

## 검증 인계
작업 중 Windows 원본에서 별도 Next dev 3002 실행과 AGENTS.md의 Next 자동 생성 블록을 관찰했다. 이 Windows 프로세스/변경은 종료하거나 되돌리지 않았다. 이 보고의 브라우저 근거는 별도 WSL 127.0.0.1:3002의 명시적 Linux mirror 산출물이다. Windows 브라우저의 localhost와 같은 서버라고 가정하지 않는다.

최종 통합 검증은 다음과 같다.
- focused ESLint, type-check 포함 verify:release-static, npm test: exit 0. sharp 변경 후 static gate와 test 재실행도 exit 0.
- 실제 static build / server webpack build: 모두 exit 0. 산출물 `.next-static-export` (Firebase public 정본; 후속 실제 경로 검증에서 문서 표기 교정), `.next-round3-final`.
- 전체 verify:release-browser: exit 0. APK 4모드×2 viewport bytes/hash, 계정도구/모달, public shell, 메모 IME, favicon 18개, admin isolated save, 기업 desktop/mobile 7페이지, Studio UI/runtime 포함. Studio recoverableBackendWarnings=1은 남으며 유료 요청 0.
- 북마크 actual React StrictMode: 직접/로그아웃/A→B→A, SDK 지연, unsubscribe callback, 구독 실패/retry, 분석 16개 deferred 경계, CRUD, 기본 카테고리, 중복 요청, timer, memo 참조 재사용, 삭제/즐겨찾기 실패 PASS. 네트워크와 하위 widget는 mock이며 운영 인증 증거가 아니다.
- build recovery fault fixture: Linux와 Windows node.exe 모두 PASS.
- 로그: `/tmp/propig-round3-{release-static-final,final-static-build,final-next-build,final-browser,bookmark-final,test-final,functions-build}.log`.
- 최신 WSL 서버는 Linux mirror의 `.next-round3-final`을 3002에서 실행한다.

## 당시 남은 구조적 부채

후속 모달·staging·CI 개선과 최신 한계는 `docs/followup-modal-static-release.md`를 따른다. 아래는 이 감사 당시 인계 목록이다.
- static wrapper는 여전히 API 원본을 임시 rename한다. 완전 격리 staging workspace로 옮기는 구조 개선과 강제 종료 journal 자동 복구는 미완료다.
- CI browser 대상은 기존 dev 서버이며 static artifact gate로 바꾸지는 않았다. 이번 로컬 검증은 실제 static artifact에서도 수행했다.
- 북마크 하위 AddBookmarkModal/CategoryManagerModal의 자체 분석/submit catch는 부모와 별개 전역 toast를 게시할 수 있다. 부모 계정 fence가 모든 하위 모달 알림까지 해결했다고 보고하지 않는다. 실제 하위 컴포넌트의 지연 응답/닫힘 lifecycle 감사가 후속 P2다.
- react-test-renderer deprecated 경고가 있으며 장기적으로 DOM 기반 격리 테스트로 옮겨야 한다.
- 같은 UID 다중 탭 습관 전체 overwrite, 이미지 pending/uncertain 정산 UI, 실제 로그인/Firestore emulator·유료 provider 검증은 별도 과제다.
