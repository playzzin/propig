# 오늘 습관 웹·Windows 인계

`/habit-tracker/today`는 기존 ProPig 계정의 체크형 습관과 오늘 진행률을 보여준다. 기존 트래커와 `/propig` 습관 카드에서 진입할 수 있다. Windows에서는 Edge의 사이트 앱 설치 메뉴로 전용 시작 주소와 독립 창을 등록한다.

## 저장

- 같은 `users/{uid}/habitTracker/workspace`를 구독한다. 날짜·습관·기록 필드 단위로 변경을 저장한다. 입력 지우기는 해당 필드만 삭제한다.
- 기존 대시보드와 전체 화면에도 같은 기록 쓰기를 적용한다. 관리 작업은 변경한 최상위 필드만 저장하고, 습관 또는 카테고리 삭제는 트랜잭션에서 최신 문서의 해당 기록을 제거한다.
- 전체 화면의 동기화 버튼은 보류 중인 쓰기를 기다린다. 탭을 오래 열어 둔 경우 새 버전 적용 후 화면을 다시 열어야 변경된 저장 방식이 실행된다.

## 검증

- 변경 파일 ESLint, TypeScript, 계정 생명주기, 라우트 셸, 습관 통계 통과.
- `node scripts/verify-habit-simplified-browser.mjs` 통과. 1365px와 390px의 첫 습관 추가, 체크·해제, 수치 입력, 과거 기록 보존을 합성 데이터로 확인했다.
- `node scripts/verify-habit-today-emulator.mjs` 통과. `FIRESTORE_EMULATOR_HOST=127.0.0.1:8191`과 격리 Firestore 에뮬레이터 프로젝트 `demo-propig-habit`을 사용한다. 같은 초기 상태의 독립 Edge 브라우저 문맥 두 개에서 네트워크가 끊긴 동안 각각 체크한 뒤 재연결해 양쪽 완료 상태, 메모·수치·과거 기록 보존, 체크 해제와 로그아웃을 확인했다.
- Windows Edge의 임시 프로필에서 실제 Next.js 라우트의 HTTP 200, 360px 화면, 전용 매니페스트 링크와 설치 가능 판정을 확인했다. 운영 계정 로그인과 사용자 프로필의 앱 설치는 검증 범위 밖이다.
