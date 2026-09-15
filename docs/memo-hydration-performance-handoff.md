# 메모 초기 복원 재저장 제거

## 범위
- 정상 로컬 저장본의 schema 검증 이후 setNotes(직렬화/동기 저장 포함) 대신 UID와 recovery 차단 상태를 검사하고 ref/owner/state만 복원한다.
- 빈 저장소 초기화, 사용자 편집의 동기 저장, 원격 snapshot 반영, 손상 원본 복구는 변경하지 않았다.
- 기존 이미지 preview 관련 미완료 변경은 수정하지 않았으며 차단된 생성/build를 우회하지 않았다.

## 검증
- `PROPIG_TEST_RUNTIME=/home/hermes/propig-improve-x34f2l9j node scripts/verify-sticky-note-lifecycle.mjs`: 12 PASS. 실제 React hook, Firebase 및 localStorage mock.
- 신규: 정상 mount 시 notes 키 쓰기0·기존 바이트 보존·체크리스트/알림 유지·복원 직후 편집/unmount 저장, quota 중 정상 저장본 읽기, 손상 원본 복구 사본 저장 실패 시 원본 보호.
- 기존: UID 교체/await 중 교체, inflight delete, 삭제 복원, undo, 손상 일부 복구, 알림 flush 재시도 포함.
- Linux 격리 runtime에서 type-check 및 verify-access-data-resilience 통과. diff --check 통과.
- react-test-renderer deprecation warning은 남아 있다. 실제 SDK/운영 사용자 데이터 검증 또는 로그인 속도 측정으로 확대하지 않는다.

## 상태
- 이번 수정은 로컬 검증 완료, 커밋/푸시/배포 미실시. 전체 production build·새 브라우저 화면 검증은 아직 없다.
- 기존 빌드 실행 차단은 별도 해결이 필요하다. 운영에 반영되었다고 간주하지 않는다.
