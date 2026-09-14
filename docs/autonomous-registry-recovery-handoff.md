# 자율 개선 차수: 앱 등록 복구와 독립 QA

## 범위와 기존 작업 보존
- 이번 요청: ProPig 자율 개발. 기존 스마트 메모·서버 알림의 미커밋 변경은 별도 작업으로 보존했다. 기존 소스·Rules·Functions·사용자 데이터는 수정하거나 배포하지 않았다.
- 담당: shop leaf는 src/hooks/usePropigAppRegistry.ts만 소유. lead는 PropigStore UI, 검증 스크립트, package scripts와 통합 검증을 소유한다. owner plan /tmp/propig-autonomous-recovery-plan.json 통과.
- 실행 전 별도 dirty 파일 해시 기준선을 저장했고, 검증 후 기존 변경의 내용 불변을 확인했다.

## 제품 변경
- 앱 등록 Firestore 조회의 terminal error 이후 새로고침 없이 명시적 재시도를 제공한다. 동기 구독 초기화 실패도 같은 복구 흐름에 포함한다.
- 현재 UID 세션 및 조회 시도 세대를 확인하고 이전 구독의 지연 응답·이전 계정의 재시도 핸들러·연속 재시도를 차단한다.
- 같은 계정의 마지막 확인 목록을 유지하되 새 조회 결과 전에는 쓰기를 허용하지 않는다. 저장 실패를 자동으로 재실행하지 않는다.
- 상점 오류를 카드 목록보다 위에 표시하고 키보드로 접근 가능한 '앱 목록 다시 불러오기' 버튼 및 loading status를 제공한다. 조회 실패/진행·다른 저장 중에 등록·해제·순서 변경을 비활성화한다.

## 검증 자동화
- 기존 registry 실제 React hook 회귀를 15개로 확장: 복구, fresh snapshot 전 쓰기 거절, 이전 callback, 중복/다른 계정 retry, 동기 구독 예외, 저장 실패 비재시도 포함.
- verify-propig-registry-recovery-browser.mjs: 실제 Store+hook, Auth/Firestore IO만 fixture. 390/1366px에서 키보드 retry, loading/성공, 오류 제거, 쓰기0, 가로 넘침/pageerror 없음 확인.
- registry recovery와 landing font 브라우저 검사를 verify:release-browser에 연결했다. font 검사는 stylesheet 존재뿐 아니라 실제 loaded font도 확인한다.
- landing font 검사는 STATIC_EXPORT_ROOT 임시 QA 서버를 지원한다.
- sidebar/careers/navigation/corp/partnership 검증기의 기존 전용 URL override는 유지하고 공통 BASE_URL fallback을 추가했다. 기존 dev3002를 교체하지 않고 임시 loopback 서버에서 전체 게이트를 실행할 수 있다.

## 실제 결과
- type-check, production build, verify:release-static, npm test 통과.
- verify:release-browser 전체 최종 exit0. 초기 두 차례는 sidebar/careers 검증기가 BASE_URL을 무시하여 이전 포트로 접근하는 문제로 실패했으며 위 fallback 수정 후 전체 재실행 통과.
- 실제 브라우저는 Linux snapshot의 정적 산출물을 임시 포트로 제공했다. 기존 개발서버 및 CY3000에는 개입하지 않았다.
- 부모가 hook/UI 회귀를 독립 실행했다. 운영 계정·운영 Firestore의 다중 기기 동기화 검증은 아니며, 앱 구조 변경의 성능 향상률을 주장하지 않는다.

## 후속 차수: 캐시·서버 확인 분리
- 기존 재시도는 새 listener snapshot만으로 쓰기를 허용했다. 이제 includeMetadataChanges를 켜고 snapshot.metadata.fromCache 또는 hasPendingWrites가 true이면 isAwaitingServer 상태로 표시하며 쓰기를 거절한다.
- 캐시 목록은 읽기 전용으로 제공한다. 캐시 문서가 없다는 이유만으로 서버 목록이 없다고 추정하거나 기존 표시 목록을 비우지 않는다. 서버 확인/쓰기 ACK 메타데이터 이벤트에서 변경 기능이 복원된다.
- Store는 서버 확인 중 안내와 등록/해제/순서 변경 비활성 상태를 제공한다. 다른 hook 소비자도 실제 mutation 함수에서 같은 확인을 거친다.
- 실제 React hook 회귀 18개, 실제 Store+hook 브라우저 390/1366px, type-check/build/release-static/release-browser 최종 통과. Firebase IO는 모의 응답이며 실회원/운영 DB를 변경하지 않았다. Firebase 12.13.0 로컬 타입 및 공식 listen 문서의 metadata listener 계약을 확인했다.
- 서버 확인은 snapshot 시점의 ACK일 뿐 이후 다른 기기의 변경과 원자적으로 묶는 보장은 아니다. 사용자 간/여러 기기 저장 충돌은 향후 revision/transaction 계약이 필요하다.
- 이번 추가 수정은 hook/Store/두 registry verifier만 포함하며 미커밋·미배포 상태를 유지한다.

## 운영 상태와 다음 우선순위
- 이 차수의 commit/push/deploy는 미실행. 현재 작업 요청에 이전 릴리스 승인을 재사용하지 않는다. 혼재된 기존 변경을 무차별 stage하거나 배포하지 않는다.
- P1: 기존 스마트 메모·서버 알림 작업의 담당자 release 이력과 소스 revision 정합화. 이번 차수 구현으로 계산하지 않는다.
- P2: 로그인 후 실제 데이터 구독량·랜딩 준비시간 측정. 비로그인 font 개선 결과를 로그인 데이터 로딩 개선으로 확대하지 않는다.
- P3: 개인 도구 백업/복원과 네트워크 오류 복구를 공통 UI 패턴으로 확장. 기존 자료 자동 이동/삭제 없이 별도 구현·검증한다.
