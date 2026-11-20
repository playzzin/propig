# 관리자 변경 연속성 및 읽기 전용 복구 진단

## 문제와 보장 범위

기존의 자기 관리자 해제 금지만으로는 A와 B가 서로를 동시에 해제하거나, 이미 해제된 관리자의 오래된 토큰으로 마지막 관리자를 변경하는 경우를 막지 못한다. 단순 admins 문서 수는 Auth claims와 userAccess 역할을 포함하지 않으므로 마지막 관리자 수의 정본으로 쓸 수 없다.

이번 설계는 전체 계정을 세는 대신 관리 요청자 자신을 활성 관리자 증인으로 확인하고, 그 요청자와 대상의 기존 변경 잠금을 한 transaction에 예약한다. 동일 요청자·상대방 관리자 변경이 충돌하도록 한다. 완전한 전역 invariant가 아니라 이 프로토콜에 참여하는 Next/Hosting 변경의 보호다.

- 모든 잠금 읽기와 현재 권한 확인 후에만 잠금을 생성한다. Auth mutation은 transaction 밖에서만 실행한다.
- 요청자의 현재 Auth disabled, 현재 claims, userAccess, admins 문서를 확인한다. 기존 서버 설정 `ADMIN_UIDS` 권위도 유지하되 실제 Auth가 삭제·비활성인 계정은 허용하지 않는다. 오래된 토큰만으로 관리자 권한을 인정하지 않는다.
- 불확실한 변경에서는 전체 관련 잠금을 보존한다. TTL이나 오래된 startedAt으로 자동 해제하지 않는다.
- 외부 Firebase Console/Admin SDK, 기존 Rules의 직접 권한 쓰기, 이전 서버 버전의 in-flight 요청은 이 프로토콜을 따르지 않을 수 있다. 배포만으로 외부 writer까지 직렬화했다고 주장하지 않는다.

## 읽기 전용 진단

`scripts/admin-user-recovery.mjs`는 **권한 수정·잠금 삭제 기능이 없다**. 최대 10개 UID를 명시하여 Auth/userAccess/admins/잠금 상태를 읽고 민감 필드 없이 관측 결과를 만든다. 서로 다른 시점의 서비스 조회이므로 원자 스냅샷이 아니다.

```bash
node scripts/admin-user-recovery.mjs \
  --project YOUR_PROJECT_ID --database YOUR_DATABASE_ID \
  --uid TARGET_UID --uid ACTOR_UID --ack-read-only
```

- Firebase Admin SDK 의존성이 있는 검증 환경과 승인된 ADC 읽기 권한이 필요하다. 이 예제는 현재 운영 접근이나 계정 변경 승인이 아니다.
- 이메일·원문 claims·owner·잠금 payload·SDK 오류는 출력하지 않는다. UID는 운영자가 지정한 대상 식별자로 출력되므로 보고서는 비공개로 취급한다.
- 상태/관측 fingerprint와 operation fingerprint는 변화·같은 작업 관련성의 보조 자료이며 해제 토큰이 아니다.
- `unlockPermitted`는 항상 false다. 조회 성공·일치·오래된 잠금 모두 해제 근거가 아니다.
- 출력한 authority는 Auth claims/userAccess/admins의 세 저장 출처만 요약한다. 환경 ADMIN_UIDS 허용 목록·기존 ID token 권위·외부 writer 상태까지 판정하는 전체 권한 정본이 아니다.
- 프로젝트·데이터베이스·UID가 누락되면 credential 초기화 전에 거부한다. 전체 계정 스캔은 하지 않는다.

## 수동 복구 전제

1. 모든 관련 writer와 in-flight 요청의 종료를 운영 증거로 확인한다. 진단 스크립트는 이것을 증명할 수 없다.
2. 대상뿐 아니라 요청자 등 관련 UID들의 잠금을 함께 조사한다. 알려지지 않은 관련 잠금을 발견하지 못했다고 무관하다고 판단하지 않는다.
3. Auth/userAccess/admins의 의도한 상태를 승인된 절차로 정합화한다. 자동 rollback이나 무조건 승격은 하지 않는다.
4. fresh 재조회 및 잠금 owner/연관 묶음 대조 후 별도 승인된 복구 절차를 사용한다. 본 도구는 삭제 명령을 만들거나 실행하지 않는다.
5. 보호된 API와 UI에서 재조회하고 정상적인 새 revision을 사용한다.

## 검증 및 향후 과제

- 읽기 전용 모듈 회귀: `node scripts/verify-admin-user-recovery.mjs`.
- 양 실제 API handler 64사례, 양 helper 회귀, 현재 권한 거절 후 UI 재저장 차단 브라우저 검사 통과.
- 실제 Firestore 에뮬레이터에서 양 helper의 교차 관리자 예약·paired uncertain·self dedup 검사 통과. Auth는 대역이며 운영 계정은 사용하지 않았다.
- 로컬 실제 에뮬레이터 8189 기동 후: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8189 node scripts/verify-admin-continuity-emulator.mjs`. 다른 host에는 실행을 거부한다.
- 전체 release-static/build/npm test/release-browser, 타입/Functions 빌드 통과.
- 에뮬레이터 검증기는 VM의 다른 realm 객체가 Firestore SDK 직렬화와 충돌하지 않도록 실제 TypeScript를 ES module로 변환해 같은 realm에서 실행한다.
- 실제 운영 진단·잠금 해제·사용자 권한 변경은 개발 검증에 포함하지 않는다.
- 모든 권한 writer의 단일 권위 전환과 외부 writer 통제는 별도 마이그레이션 과제다. 이것 없이 전역 마지막 관리자 보장이나 안전한 원클릭 복구를 약속하지 않는다.
