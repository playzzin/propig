# 추가 오류 감사 — 계정 전환과 생활 도구 저장

## 범위
이전 메모 삭제/입력, 반복 할일 토글, 이미지 예약 수정과 별도로 앱 등록·습관·버킷·할일의 계정 전환과 비동기 초기화를 점검했다. 기존 dirty 변경 보존. 원격 사용자 데이터, 인증 설정, 유료 호출, commit/push/deploy 미수행.

## 확인 및 수정

### P1 — 이전 계정 습관을 새 계정에 저장할 수 있는 경로
- Dashboard의 useHabitWidget은 UID만 바뀌고 workspace는 이전 계정 것을 유지했다. 새 snapshot 전 체크 시 이전 습관·분류 전체를 새 UID 문서로 저장하는 것을 실제 추출 hook fixture로 재현했다.
- Dashboard·습관 전체 화면·버킷 전체 화면·할일 전체 화면을 UID-keyed session 경계로 분리해 계정 교체 시 초안/편집 상태가 재사용되지 않게 했다.
- Dashboard hook은 snapshot 소유 UID가 현재 UID와 다르면 데이터를 즉시 감추고 저장을 거부한다. 습관 저장은 persistence await 이후에도 실제 인증 UID를 검사한다.
- 습관 전체 화면은 구독 오류를 loaded 성공으로 취급하지 않고 readiness/mounted/UID 검사로 빈 workspace 저장을 차단한다. 버킷 전체 화면도 두 구독이 준비된 뒤에만 mutation을 허용한다.

### P2 — unmount 뒤 생성되는 실시간 구독
- 기본 분류 초기화를 await하는 사이 화면을 떠나면 cleanup 뒤 두 listener가 새로 생기는 현상을 실제 Dashboard fixture로 재현했다.
- Dashboard의 습관/버킷/할일 및 버킷/할일 전체 화면에서 await 직후 취소 여부를 확인해 구독 생성을 막는다. 이미 생성된 listener의 기존 cleanup도 유지한다.

### P2 — 계정 간 앱 등록 목록 혼합과 저장 실패 성공 표시
- 전역 guest localStorage 키를 로그인 계정 저장에도 쓰고, 이벤트에 UID가 없어 다른 계정 상태를 덮을 수 있었다.
- UID별 키·이벤트로 분리하고 기존 guest 키는 호환 유지했다. 계정 세대별 상태 및 callback fence로 첫 render/늦은 snapshot·error·ACK 오염을 차단한다.
- 초기 snapshot 전 변경 거부, cloud 동시 저장의 동기 잠금, 실패 rollback+reject, ACK 뒤에만 로컬/이벤트 게시.
- PropigStore의 등록/해제/순서 변경 caller도 reject를 처리한다. 실패에서 성공 toast나 미리보기 닫기가 발생하지 않도록 실제 callback fixture를 추가했다.
- registry 소비자는 Sidebar/PropigStore/PropigDashboard/ErpHomePage이며 실제 mutation caller는 PropigStore를 확인했다.

## 검증
- 신규 gate: `npm run verify:account-lifecycle`, `npm run verify:account-tools-browser`.
- Dashboard 실제 hook·wrapper·effect fixture 12개 PASS; 앱 등록 hook 10개 시나리오 PASS; 상점 callback 6개 PASS. 습관/버킷 실제 source slice + StrictMode fixture PASS.
- 기존 반복 할일 원자 갱신 회귀 22개 PASS, 수정 파일 focused ESLint PASS.
- Firebase transport는 mock이며 실제 인증 사용자 전환·운영 Firestore 검증과 구분한다.
- 최종 `verify:release-static`, `npm test`, focused ESLint, plan self-test, `git diff --check`: PASS.
- 최신 Next production webpack build exit 0. 앱/Functions 소스·의존성 417개가 원본과 build mirror에서 byte 일치. 로컬 3002만 새 빌드로 교체했으며 CY 3000은 변경하지 않았다.
- guest 실제 상점 등록/해제/reload 및 Dashboard/Habit/Bucket desktop/mobile HTTP·가로 폭·page error 검사 PASS. 모바일 상점 스크린샷 직접 확인.
- 전체 `verify:release-browser` 최종 exit 0. 첫 실행은 마지막 Studio verifier의 필수 BASE_URL 누락으로 중단되어 환경변수를 명시한 뒤 전체 재실행했다. 이를 제품 장애로 분류하지 않는다.
- 신규 계정 전환은 mock transport/StrictMode/실제 소스 hook·callback 검사이고, 실제 로그인 계정의 운영 쓰기는 수행하지 않았다.
- 한계와 임시 증거: `/tmp/propig-round2-{account,static,build,tools-browser,release-browser-final,npm-test}.log`. 현재 결과는 로컬 수정이며 미커밋·미푸시·미배포.

## 남은 한계
1. 같은 UID의 여러 탭에서 습관 전체 workspace를 동시에 저장하는 충돌 해결은 이번 계정 간 격리와 별도다. 문서 revision/transaction 또는 항목별 저장으로 전환하는 후속 설계가 필요하다.
2. 영구 outbox 및 강제 종료 시 서버 ACK 보장은 미구현이다. 이미 전송된 요청을 UI fence가 취소한다고 주장하지 않는다.
3. 앱 등록의 동시 cloud 변경은 합치지 않고 명시적으로 거부한다. 다른 탭의 반대 순서 변경까지 병합해 주는 계약은 아니다.
4. 북마크 읽기 전용 감사는 담당 모델 도구 제한으로 결과를 확보하지 못해 완료 판정에서 제외했다. 위험 우회를 시도하지 않았다.
5. 기존 전체 접근성 인증·운영 배포·유료 provider 정산 전수 검증을 의미하지 않는다.
