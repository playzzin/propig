# ProPig 스마트 메모 기능 이식

- 요청: CY 스마트메모의 기능을 ProPig 메모장에 적용.
- 통합 owner: lead. CY 기능 감사 owner: cy_memo_audit (읽기 전용, allowed files=[]).
- 시작 branch: codex/add-founding-background-to-introduction. 시작 dirty: 없음.
- lead 허용 파일: src/types/stickyNote.ts, src/hooks/useStickyNotes.ts, src/utils/smartMemo.ts, src/components/propig/memos/SmartMemoWorkspace.tsx, src/components/propig/memos/SmartMemoEditor.tsx, src/components/propig/memos/SmartMemo.styles.ts, src/app/propig/memos/page.tsx, scripts/verify-smart-memo.mjs, scripts/verify-smart-memo-browser.mjs, scripts/verify-sticky-note-lifecycle.mjs, docs/propig-smart-memo-handoff.md.
- 읽기 전용: CY src/features/smart-memo, 기존 스티커/대시보드, Firebase 규칙, package/lockfile.
- 금지: CY 수정/3000 포트 사용, 운영 데이터/인증 변경, commit/push/deploy.
- 보존 계약: users/{uid}/stickyNotes와 기존 localStorage v1을 유지. 기존 메모에 선택형 필드만 추가. 일반/스티커/대시보드의 content 호환 및 즉시 저장, 계정 경계 보존.
- 검증: 모델/변환/검색 회귀, 실제 hook 계정/저장 회귀, type-check, 변경 파일 ESLint, Next build, 격리 guest 브라우저 데스크톱/390px.

## 결과 인계

- lead 허용 파일 추가: src/components/StickyNoteCard.tsx, src/components/propig/PropigDashboard.tsx. 긴 기존 메모의 강제 절삭을 막는 편집 경계에만 수정.

### 구현

- `/propig/memos` 목록을 목록/편집 분할 화면으로 변경. 모바일은 목록→편집→목록 흐름으로 편집 공간을 확보한다.
- 일반/체크리스트 전환, 완료 상태/진행률, 항목 순서 변경, Enter 추가, 빈 항목 Backspace 삭제, 한글 IME 보호, 항목 댓글 추가/삭제.
- 빠른 입력, 태그 기반 분류 생성/이름 변경/해제, 유형/색상/고정/본문/댓글 검색, 제목순 정렬 및 정렬 기억.
- 다중 선택과 분류 이동/삭제, 복제, 동일 ID 삭제 되돌리기. 복제본의 알림은 해제한다.
- 개인 중요도와 메모장을 열어 둔 동안의 알림, 지난 알림 확인. 기존 스티커/낙서 보기를 유지한다.
- 선택형 스키마 확장, Firestore 직렬화, 기존 편집기에서 수정한 체크리스트 본문 보호. 긴 기존 본문이 대시보드 900자 제한에 잘리지 않도록 수정한다.
- 잘못된 로컬 데이터는 `sticky_notes:v1:{uid}:recovery`에 원문 보존 후 정상 메모만 복구한다. 원본 백업 실패 시 덮어쓰기를 차단한다.

### 실제 검증

- `npm run type-check`: exit 0.
- 변경된 TS/TSX 파일 ESLint: exit 0. 새 검증 스크립트는 저장소 ESLint 제외 대상이므로 `node --check`로 구문 검사.
- `node scripts/verify-smart-memo.mjs`: exit 0. 기존 스키마, 체크리스트/댓글 변환, 스티커 편집 호환, 대소문자를 무시하는 분류, 검색/정렬, 알림 검증.
- `node scripts/verify-sticky-note-lifecycle.mjs`: exit 0. 실제 React hook과 모의 Firebase로 8개 회귀 검증. 계정 교체, 입력 직후 unmount, 쓰기/삭제 순서, 삭제 실패 복원, 같은 ID 되돌리기, 손상된 데이터의 원본 보존.
- `node scripts/verify-firestore-boundary.mjs`: exit 0.
- Linux 격리 복제본 `npm run build`: 54개 페이지 빌드와 배포 경계 검사 통과. 원본과 lockfile이 일치하는 기존 Linux 의존성을 재사용.
- `scripts/verify-smart-memo-browser.mjs`: 실제 정적 빌드/Chromium/격리 guest 저장소로 1440px·390px 검증. 새로고침, 한글, 분류 일괄 이동, 삭제 복원, 스티커 왕복, 모바일 편집, 가로 넘침/페이지 오류, WCAG A/AA 자동 검사, 긴 대시보드 메모 편집.
- 증거 화면: `.codex-smart-memo-desktop.png`, `.codex-smart-memo-mobile.png`, `.codex-smart-memo-mobile-list.png` (ignored 로컬 산출물).

### 범위와 한계

- CY 원본 데이터·코드·3000 서버를 변경하지 않았다. CY 공용 메모 권한/작성자 전체 조회와 ERP 메시지 서버의 반복 알림은 이식하지 않았다.
- ProPig 알림은 브라우저가 닫힌 동안 발송되는 서버/푸시 알림이 아니다. 재방문 시 지난 알림을 보여준다.
- 메모의 분류는 기존 계정 메모에 저장한다. 비어 있는 분류 이름과 정렬 설정은 현재 기기·계정별 저장이다.
- 운영 Firestore 쓰기, 실제 계정의 다중 기기 동기화, 배포는 수행하지 않았다. 서버 저장 검증은 모의 Firebase 회귀다.
- 자동 승인 검토가 3002의 기존 미리보기 서버 교체를 거부했다. 기존 서버는 그대로 두고, 검증 스크립트가 자동 할당 임시 포트 서버를 시작·종료하도록 구성했다.
- 감사 leaf는 읽기 전용으로 종료. 대소문자 분류 불일치 지적을 통합 owner가 수정하고 회귀 검사를 추가했다.

## 후속 요청: 서버 알림과 개발·운영 배포 (2026-09-14)

사용자의 “알림기능도 넣어주고 개발서버와 운영사이트에 배포해줘”를 이번 변경의 개발서버 교체·운영 배포 승인으로 적용했다. 위의 미배포/로컬 알림 한계는 이전 작업 시점의 기록이다.

### 변경 범위와 소유권

- lead가 모든 구현 파일·서버·빌드·배포를 소유. security leaf는 `files: []`로 읽기 전용 감사 완료. Hermes plan 검사 통과.
- 서버: `functions/src/memoReminders.ts`, `functions/src/triggers/memoReminders.ts`, `functions/src/index.ts` 및 대응 `functions/lib` 산출물, `firestore.rules`.
- 화면/저장: `src/services/memoReminderService.ts`, `src/components/propig/memos/MemoReminderSettings.tsx`, `MemoNotificationBell.tsx`, `SmartMemoEditor.tsx`, `SmartMemoWorkspace.tsx`, `src/components/Header.tsx`, `src/app/propig/memos/page.tsx`, `src/hooks/useStickyNotes.ts`.
- 검증: `scripts/verify-memo-reminders.mjs`, `scripts/verify-memo-reminder-ui.mjs`, `scripts/verify-smart-memo-browser.mjs`, `scripts/verify-sticky-note-lifecycle.mjs`, 이 handoff.
- 전체 Functions 컴파일로 다시 생성된 무관한 기존 산출물은 ignored 백업에 보존하고 원래 상태로 돌렸다. commit/push는 수행하지 않았다.

### 동작

- 로그인 메모의 알림 설정에서 한국 시간 기준 한 번·매일·평일·매주·매월 예약/변경/해제. 평일은 주말을 건너뛰고 매월은 원래 날짜를 유지하되 해당 날짜가 없는 달에는 말일 처리.
- 1분 간격 서버 스케줄러가 named database `pppp`의 예약을 처리하여 본인의 상단 알림함에 저장한다. 읽음/모두 읽음, 최근 50개, 해당 메모 바로 열기 지원.
- 브라우저를 닫아도 서버가 알림함에 저장한다. OS 푸시·문자·이메일 발송은 포함하지 않는다. 부하나 서버 지연 시 정시보다 늦게 도착할 수 있다.
- 예약은 인증된 callable만 수정. 메모 소유 UID는 토큰에서 가져오며 비활성·삭제된 계정은 거부. 현재 메모 동기화 성공을 기다린 뒤 예약한다. 동기화 실패/15초 초과를 화면에 표시한다.
- revision 충돌 검증, mutation 중복 방지, 발송과 다음 예약의 원자적 처리. 삭제/보관 메모·비활성 계정은 발송하지 않는다. 여러 회차를 놓쳤으면 한 번 알리고 다음 미래 회차로 이동한다.
- 기존 로컬 `reminderAt` 알림은 계속 표시한다. 서버 예약을 명시 저장하면 기존 로컬 예약을 해제한다. 게스트는 기존 기기 알림 유지.

### 실제 검증과 배포

- Functions TypeScript 빌드, 앱 TypeScript, 변경 TSX/service/hook ESLint, Firestore/배포 경계, route shell·site mode 검사 통과.
- 실제 Firestore 에뮬레이터: 월말/주말/장기 지연, 취소, 삭제 메모/비활성 계정, 중복 요청/동시 발송, revision 충돌 통과. 본인 읽기/서버 시각 읽음 갱신 허용 및 guest/다른 사용자/admin의 알림 위조·수정·삭제 거부 확인.
- 9개 실제 React hook 회귀 통과. 새 검사는 알림 직전 메모 저장 실패 전파와 최신 내용 재시도를 확인한다.
- 실제 알림 UI + 격리 모의 서비스: 로그인 예약/반복/해제, 실패 시 예약 차단, 읽음/메모 링크, 계정 전환 시 이전 알림 제거, Escape, 390px, WCAG A/AA 통과.
- Linux native 정적 전체 빌드 통과. 생성된 정적 앱·실제 개발서버·실제 운영사이트에서 guest 브라우저 회귀 통과: 1440px/390px, 기존 메모/체크리스트/댓글/분류/복제/삭제 복원/알림/새로고침/스티커 왕복, 페이지 오류 없음, 가로 넘침 없음, WCAG A/AA.
- 개발서버: `http://localhost:3002/propig/memos`, webpack Next dev, 이번 소스의 native Linux snapshot. 원본 수정의 자동 동기화는 설정하지 않았다. snapshot 경로는 ignored `.codex-smart-memo-runtime.txt`에 기록. CY 3000은 변경하지 않았다.
- 운영: `https://propig-63524.web.app/propig/memos`. Hosting release 완료, `setMemoReminder`와 `dispatchMemoReminders` ACTIVE, Firestore rules 배포 완료. 기존 함수 26개를 유지하고 2개 추가.
- 운영 scheduler 로그에서 실제 1분 간격 sweep 성공 확인. 실제 사용자의 예약/알림 데이터는 테스트 목적으로 생성·수정하지 않았다. 로그인 실제 계정의 끝까지 이어지는 운영 발송은 미검증이며, 서버/Rules 에뮬레이터와 격리 UI로 검증했다.
- 최종 확인: Windows `localhost:3002` HTTP 200. 운영 HTML SHA-256 `834411b0feaae5e9d19561a494383b07dd5fe9dde6719732463baf304e8a404f`가 검증된 정적 빌드와 일치. 운영 callable의 무인증 요청은 401/UNAUTHENTICATED로 거부됨.
