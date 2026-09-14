# 순차 자율 개발 릴리스

## 1단계: 기준선 정리
- 기존 스마트 메모·서버 알림 변경과 자율 registry 복구/캐시 보호를 실제 테스트 snapshot과 대조해 41파일 통합 커밋 eec12c3을 생성하고 기존 작업 branch에 push했다.
- Hosting 배포 및 운영 font/메모 보기 PC·모바일 검증 통과. 운영 함수 목록에서 알림 두 함수 ACTIVE와 총28개를 확인했으며 이번 작업에서는 함수/Rules를 재배포하지 않았다.
- 알림 core/Rules는 현재 Rules를 사용하는 별도 localhost8191 demo-propig-memo 에뮬레이터로 재검증했다. 기존8189의 오래된 Rules에서는 권한 검사가 실패했으며 이를 운영 오류로 취급하거나 Rules를 느슨하게 바꾸지 않았다.
- 스마트 메모 실제 정적 빌드 PC/모바일, 체크리스트/댓글/복제/복원/한글/새로고침 및 알림 UI 회귀 통과.

## 2단계: 앱 등록 다중 기기 충돌 방지
- setDoc 대신 Firestore runTransaction의 서버 목록 읽기→현재 편집 기준 목록과 순서까지 비교→merge 쓰기로 변경.
- 다른 기기 변경이 있으면 REGISTRY_CONFLICT로 중단하고 최신 목록 재조회 버튼을 제공한다. 기존 저장을 자동 재실행하지 않는다.
- 사용자/세션 변경 및 서버 미확인 상태는 transaction 재시도에서도 검사한다.
- 실제 hook20회귀·실제 UI PC/모바일 충돌/재조회 회귀·전체 release-static/build/release-browser 통과.
- 별도 실제 Firestore 에뮬레이터 + client Rules에서 동일 기준의 두 동시 transaction 중 하나만 성공하고 다른 하나는 충돌하며, 무관 필드가 보존되는 것을 검증했다. 대상 callback은 실제 hook AST에서 추출했다. 인증·목록 정규화는 격리 fixture이며 운영 사용자 쓰기는 없다.
- 재현: FIRESTORE_EMULATOR_HOST=127.0.0.1:8191 node scripts/verify-registry-concurrency-emulator.mjs.
- 구형 배포 클라이언트·외부 Console/Admin SDK의 직접 쓰기까지 차단하는 Rules 변경은 하지 않았다. 최신 프로토콜을 사용하는 클라이언트 간의 보호이며 구형 열린 탭은 새로고침이 필요하다.

## 이어갈 범위
- 로그인 로딩 감사: 실제 사용자 로그인 세션 없이 성능 개선률을 주장하지 않는다. 공통 초기 리소스와 데이터 대기를 분리해 조사한다.
- 백업/복원·저장 상태 통일·습관 도구·관리자 전역 보호·영상텍스트 예산·팀 공유는 별도 후속 범위이며 완료로 표시하지 않는다.
