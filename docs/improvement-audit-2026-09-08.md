# 오류 감사 및 개선 — 2026-09-08

## 범위와 기존 변경 보존

기업·블로그·propig·관리자 guest 화면과 이미지 생성 예약, 메모 저장, 반복 할일 완료 기록을 표본 감사했다. 기존 파비콘·전담 운영 변경 위에 범위를 분리해 수정했다. 운영 사용자 데이터·인증 설정·유료 provider 호출·commit/push/deploy는 수행하지 않았다.

## 우선순위와 개선

### P1: 이미지 생성 중복 비용 위험
- Next와 Hosting Functions에서 오래된 pending 요청을 5분 후 새 예약으로 승인해, 앞선 provider의 실제 실행 여부가 불확실해도 동일 operation을 다시 실행할 수 있었다.
- pending/uncertain은 시간 경과만으로 재예약하지 않으며 기존 비용 예약을 보존한다. 확인된 failed만 기존 계약에 따라 재시도한다.
- UID/operationId 메모리 캐시가 요청 fingerprint 검사를 우회하던 조기 반환을 제거했다. durable fingerprint 및 completed 확인 뒤 캐시를 사용한다.
- `verify:image-operation-integrity`: 실제 소스 함수를 AST 추출하고 DB/storage만 fixture로 대체한다. 실제 유료 호출·운영 정산 검증이 아니다.

### P1: 메모 삭제 부활과 마지막 입력 손실
- 메모 편집의 지연 저장이 삭제 뒤 setDoc으로 문서를 다시 만들 수 있었다. 메모별 직렬화·삭제 표시·대기 patch 취소로 삭제를 마지막에 실행한다.
- 250ms local 저장 debounce가 unmount에서 취소되어 최근 입력을 잃던 경로를 입력 시점의 UID별 동기 local 저장으로 바꿨다. 보기 전환 시 같은 UID의 클라우드 대기 쓰기를 flush한다.
- 쓰기 직전 실제 인증 UID를 확인하며 다른 계정으로 이전 patch를 보내지 않는다.
- 삭제 실패는 로컬 내용을 복원하고 명시적 재시도를 허용한다.
- 목록/스티커 편집기 앞단의 350/500ms 지연도 제거했다. 로컬 draft는 즉시 저장 계층에 전달하고 원격 debounce는 유지한다. IME는 compositionend에 확정한다. 수정 전 브라우저 즉시 저장 assertion 실패를 재현하고 수정 후 입력→조합종료→reload를 검증했다.
- `verify-sticky-note-lifecycle.mjs`: 실제 React StrictMode hook, Firebase/타이머/storage fixture. 보기 전환·in-flight 삭제·계정교체·삭제 실패를 검증한다.

### P2: 반복 할일 동시 업데이트 유실
- 후속 인계에서 propig 홈 Dashboard의 기존 전체 배열 호출 누락을 확인해 수정했다. 기존 완료 보고 당시 이 경로에는 위험이 남아 있었다. 지금은 독립 할일 화면과 Dashboard 모두 날짜별 원자 갱신을 사용한다.
- Dashboard 실제 콜백의 동시 추가/삭제·양방향 순서·guest 차단을 포함해 22 checks PASS. 미사용 배열 정렬 helper 제거, focused lint 및 별도 최신 production build PASS. 3002를 새 빌드로 교체하고 공개 4경로 desktop/mobile 브라우저 검사를 재실행해 PASS. 운영 미배포.
- 스냅샷의 전체 completedDates 배열을 교체하던 완료 토글을 날짜별 arrayUnion/arrayRemove로 변경했다.
- UID 경로와 updatedAt, Firestore의 로컬 optimistic snapshot을 보존했다. 전체 배열 setter는 호환용 deprecated API로 남기고 토글에서는 사용하지 않는다.
- `verify-todo-occurrence-concurrency.mjs`: 기존 손실 음성 대조군과 순서가 바뀐 원자 업데이트를 검사한다.

### P2: 관리자 guest 안내·공개 접근성
- /admin에서 공개 모드 shell과 관리자 대시보드가 동시에 보이던 상태를 로그인/권한 안내로 명확히 분리했다. 기존 hasAdminSiteAccess를 재사용해 기능별 관리 권한과 명시적 사이트 접근을 보존한다. 서버 권한 검사를 대체하는 조치는 아니다.
- 기본 모드 수를 home resolver에서 산출하고 블로그를 누락하던 설명을 교정했다.
- propig 진행률에 progressbar 및 최소·최대·현재값을 부여했다.
- ul 내부 separator가 listitem 의미를 덮던 문제를 장식용 li로 교정했다.
- 기업 지표와 모드 선택 라벨에 기존 테마의 text-muted를 사용해 대비를 높였다.
- 관리자 guard React fixture와 `verify:public-shell-integrity`를 릴리스 gate에 연결했다. axe 대상 규칙은 aria-prohibited-attr/list/color-contrast이며 전체 WCAG 인증은 아니다.

### 의존성
- 루트 audit: moderate 4건의 원인 패키지를 호환 범위 안에서 갱신했다. Functions는 qs를 6.16.0으로 override하여 express/body-parser가 따라 보고되던 취약 경로를 해소했다.
- Functions의 무조건 audit fix는 오히려 express/body-parser/qs를 낮추는 것을 격리 시험에서 발견해 채택하지 않았다. 기존 express/body-parser 버전은 보존했다.
- 접근성 회귀를 CI에서도 실행하도록 @axe-core/playwright를 버전 고정 devDependency로 명시했다.

## 검증 및 증거

주요 새 gate:
- `npm run verify:data-integrity`
- `npm run verify:image-operation-integrity`
- `npm run verify:public-shell-integrity` (3002의 최신 production 서버 필요)

최종 parent 실행 결과:
- 실제 격리 설치 후 npm audit: 앱/Functions 각각 0건.
- image operation actual-source fixture 36개; 메모 lifecycle 6개(삭제 실패 복원 포함), 반복 할일 동시수정 22개와 관리자/부분 관리자 접근 fixture 통과.
- 최종 verify:release-static, npm test, focused ESLint 통과. Next production webpack build exit 0, static pages 73개. Firebase export/운영 배포 미수행.
- 로컬 3002 서버를 최신 빌드로 교체했다. CY 3000 미변경.
- 공개 4개 경로 × desktop/mobile: 지정 axe 규칙 위반 0, page JS 오류 0, 가로 넘침 0. 스크린샷 직접 확인.
- 실제 guest 목록/스티커 편집기: blur 없이 즉시 로컬 저장, compositionend, reload 복원 통과. 실제 인증/원격 Firestore 동시수정 검증과 구분한다.
- verify:release-browser 전체 exit 0: favicon 18, sidebar, 관리자 메뉴 fixture, 채용, 탐색, 기업 7경로 desktop/mobile, 제휴, Studio navigation/complete. Studio paidRequests 0/errors 0; navigation의 recoverableBackendWarnings 1은 남아 있다.
- 앱/Functions 소스·의존성 417개와 빌드 입력 일치 확인. 마지막 두 파일의 추가 행 CRLF만 교정했고 코드 의미는 같다.
- 운영 plan self-test, 최종 git diff --check와 EOL 교정 후 data-integrity 회귀 모두 PASS.
- 메모 editor 앞단 debounce와 실패 tombstone 복원 교훈을 기존 async-client-workflow-audits 스킬에 반영했다.

## 남은 부채

1. **P1 운영 복구:** 오래된 pending/uncertain의 provider 조회·수동 정산·예약 해제를 위한 운영자 reconciliation 흐름은 별도 과제다. 결과 불확실 상태를 자동으로 failed로 바꾸지 않는다.
2. **P2 메모의 영구 outbox:** localStorage 저장은 전원 종료·강제 탭 종료 시 클라우드 ACK를 보장하지 않는다. 영구 dirty outbox·재접속 충돌 해결과 다중 탭 메모 병합은 후속 과제다. 동기 localStorage는 매우 큰 메모/드래그에서 성능 측정이 필요하다.
3. **P2 비활성 의존성 경고:** audit 0과 upstream deprecated 경고는 다르다. 테스트 renderer 등 교체는 별도 검증을 동반한다.
4. 실제 관리자 인증·Firestore emulator·외부 provider 성공/실패 정산 전수 검증은 이번 fixture/guest 감사로 보장하지 않는다.
5. 읽기 전용 공개 표본은 모든 페이지·모든 테마의 접근성 또는 전체 프로젝트 무결성 보증이 아니다.
