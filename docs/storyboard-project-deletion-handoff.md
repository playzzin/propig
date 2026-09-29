# 스토리보드 프로젝트 영구 삭제

## 범위와 소유권

- 사용자 요청: `/admin/storyboard`에서 프로젝트와 제작 과정·결과물을 함께 삭제.
- 통합 owner: Hermes lead. 기존 기업 사이트·메뉴·다른 제작 도구 변경 보존.
- 서버 삭제 owner의 구현을 lead가 공통 `functions/src/api/storyboardDeletion.ts`로 통합. Next와 Hosting wrapper가 각각 인증 후 동일 구현 호출.
- 위임 exact-file 계획: `ops/hermes/storyboard-deletion-plan.json`. 계획 검사와 doctor 통과.
- lead 수정: StoryboardProjectDashboard/Workspace/styles, imageStoryboardService, imageGenerationService, useStoryboardImageGeneration, Next storyboard DELETE wrapper, 공통 삭제 모듈, workflow-v2/workspace-lifecycle 검증, 이 문서.
- 금지: 운영 데이터 삭제·유료 생성·인증 변경·commit/push/배포. 모두 실행하지 않음.

## 동작

- 프로젝트 목록에 영구 삭제 버튼, 삭제 범위 확인, 진행 상태와 중복 요청 차단 추가. 삭제 완료 후 목록 복귀 및 편집/되돌리기 상태 제거.
- 프로젝트 저장과 하위 아티팩트 저장 완료를 기다린 후 삭제. 생성·업로드·복사 중에는 삭제 거절.
- 서버는 삭제 lease를 확보하고 현재/이전 버전의 영상 프로젝트, 모든 프로젝트 하위 기록, 교체된 생성 이미지, cleanup candidate, 영상 클립·작업과 프로젝트 파일을 정리.
- 생성 결과의 inline/chunk/gzip 캐시도 제거. 비용 집계·재과금 방지 최소 기록은 유지하며 삭제된 결과 재복구/replay는 차단.
- 동일 사용자 외의 소유 기록, 다른 프로젝트/앨범/사이트 설정에서 공유 중인 파일, 실행 중/정지 미확인 작업은 삭제 전에 거절. 최근 취소 영상은 이전 워커 업로드가 끝나도록 최대 12분 대기 안내.
- Storage 정리 실패 시 참조와 재시도 manifest를 유지. 재시도에서 남은 항목을 정리하며, 파일 prefix가 비었는지 확인한 뒤 프로젝트 root를 삭제.
- 신규/재시도 영상 작업과 worker claim은 프로젝트 삭제 lock을 transaction에서 확인. 이미지 생성 provenance는 요청 시작 시 캡처하고 삭제 중 저장 시 업로드 파일 회수.
- 일반 잔여 파일 정리의 `cleanupStatus: retry`는 편집을 막지 않는다. 전체 프로젝트 삭제 실패는 서버의 `cleanupManifest` 유무로 구분해 저장을 차단한다.

## 실제 검증

- `npm run type-check`: PASS.
- `npm --prefix functions run build`: PASS.
- 별도 Linux snapshot에서 `next build --webpack`: PASS. 78개 페이지 생성 및 storyboard DELETE route 포함. 최초 공개 Firebase 설정 누락 실패 후 기존 공개 설정만 적용하여 재검증 통과.
- 변경된 UI·service·서버 파일 ESLint: PASS.
- `node scripts/verify-storyboard-project-deletion.cjs`: PASS. 실제 공통 서버 코드+모의 Firestore/Storage. 전체 삭제, 이전 이미지, 공유/타인 소유 보호, 동시 삭제, lease, 실행 중 작업, 실패 재시도, 캐시 제거, 인증, 각 610개 작업·클립·이미지.
- `node scripts/verify-storyboard-generation-cleanup-safety.mjs`: PASS. 실제 hook/service 코드의 provenance 캡처, 삭제-업로드 경합 및 회수.
- 격리 React 런타임에서 `scripts/verify-storyboard-workspace-lifecycle.cjs`: PASS. 삭제 취소, 중복 클릭, 저장과 삭제 순서, 실패 재시도, 오래된 구독, 계정 전환.
- workflow-v2, race-safety, navigation, version-history-safety, video cancellation/idempotency/worker-contract, image-generation-security: PASS.
- 실제 로그인된 localhost:3002 화면: 1365px/390px 삭제 버튼, 가로 넘침 없음, 버튼 높이 44px, 키보드 focus outline 확인. 삭제 확인창 취소 확인. 새로고침 후 page/console error 0. 실제 삭제 승인/실행은 하지 않음.
- 실제 로컬 DELETE route에 인증 없는 가짜 프로젝트 ID 요청: 401 거절 확인. 최종 상태 구분 수정 후 Linux 전체 빌드 및 Functions 빌드 재통과.

## 한계

- 실제 계정의 데이터 삭제는 모의 검증과 분리해 미실행. 배포 미실행.
- 공유 원본 연결을 자동 제거하지 않는다. 연결 해제/독립 복사 후 삭제를 다시 실행해야 한다.
- 과거 소유 기록이 없거나 확인 범위가 query당 2,000개를 초과하면 성공으로 표시하지 않고 복구/관리자 정리를 안내한다.
- 외부 제공자에 보관된 원본, 사용자가 이미 내려받은 파일은 앱 저장소 삭제 범위에 포함되지 않는다.
- 전체 Next 빌드는 별도 Linux snapshot에서 검증. 기존 Linux runtime의 Next/React/Firebase 버전은 동일하나 일부 보조 의존성은 현재 lockfile과 다름. 운영 릴리스에서는 현재 lockfile 기반의 표준 검증을 다시 실행해야 한다.
