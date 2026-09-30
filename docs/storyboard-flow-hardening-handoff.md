# 스토리보드 → 영상 흐름 보완

2026-09-30, 기존 작업 트리의 변경을 보존하여 구현. 운영 배포·실데이터 삭제·유료 생성 호출은 수행하지 않았다.

## 구현 결과

- 장면 수정, 이미지 교체, 참조 제거, 목소리 변경이 기존 승인과 최종본에 반영되도록 무효화 처리를 정리했다. 실제 사용한 앞뒤 연결 프레임이 변경된 영상만 다시 검토 대상으로 삼는다. 자동 선택된 단일 목소리 프로필도 영향 범위에 포함된다.
- 생성 입력을 바꾸면 기존 작업 연결을 해제하고 이전 영상은 비교용으로 유지한다. 자르기·속도·음량·전환 등 조립 설정만 변경하면 승인 클립을 재사용한다. 완료된 옛 작업이 수정 상태를 덮어쓰지 않는다.
- 자동 조립의 완료 처리를 반복 적용해도 최신 판정이 유지된다. 최종본은 모든 장면의 승인·재생 가능 여부와 실제 조립 내용을 함께 확인한다. 이전 완성본의 표시·다운로드 문구를 구분하고 URL 변경 시 플레이어를 갱신한다.
- 수동·자동 영상 접수와 배경음 업로드를 공통 대기 범위로 관리한다. 접수 중 이동을 보호하며, 영상 제작 중 설계 수정과 되돌리기로 실행 상태를 되살리는 일을 막는다.
- 작업이 늦어졌다는 이유만으로 실패로 바꾸지 않는다. 진행 상황과 취소 동작을 제공하고, 취소 시 다음 유료 장면을 접수하기 전에 자동 제작을 정지한다. 서버가 취소를 확인할 때까지 작업 연결을 유지한다.
- 생성 중 수정된 이미지 결과는 검토 대상으로 표시한다. 프로젝트·계정·요청 세대가 바뀐 늦은 결과는 적용하지 않으며, 일괄 생성의 후속 요청도 중지한다. 생성 기록에는 실제 요청 장면의 식별자를 전달한다.
- 프로젝트 활성화와 생성·복제·가져오기의 저장/전환 처리를 통합했다. 가져오기 전 입력을 반영하고 저장하며, 프로젝트 간 되돌리기 기록을 초기화한다. 저장 대기 중 추가 편집이 있으면 전환을 중단하여 보존한다.
- 프로젝트와 작업 기록을 동일 Firestore transaction/batch로 저장한다. 기록 저장만 실패하여 revision 충돌이 생기거나, 복사 문서는 남고 파일만 삭제되는 부분 성공을 방지한다.
- 기획 복제는 움직임·목소리·편집 설정을 보존한다. 결과 포함 복제는 참조 ID, 파일 경로, 생성 이력을 새 프로젝트로 연결하고 기존 job/replacedClip 연결을 제거한다. 충돌 복구본도 독립된 미디어 복제를 사용한다.
- 버전 복원은 과거 실행 작업을 다시 시작하지 않으며 복원 결과의 검토를 요구한다. 교체 즉시 이전 파일을 지우던 자동 처리를 없애 버전/되돌리기를 보호한다. 명시적 파일 정리에는 이전 버전에서 파일을 열 수 없게 되는 점을 안내한다. 프로젝트 전체 삭제는 기존 전체 정리 경로를 사용한다.

## 핵심 파일

- `src/lib/storyboard-edit-invalidation.ts`: 목소리·연결 프레임 의존성, 기존 결과 보존과 승인 무효화.
- `src/components/image-generator/StoryboardWorkspace.tsx`: 저장·전환·복원·이미지 요청 생명주기.
- `src/components/image-generator/StoryboardVideoProductionPanel.tsx`: 영상 접수·작업 동기화·자동 완료·취소.
- `src/services/imageStoryboardService.ts`: 원자 저장과 독립 복제.
- `src/hooks/useStoryboardImageGeneration.ts`: 요청 장면 기준 생성 기록.

## 검증

- 수정 경계 ESLint: 경고/오류 없음.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false`: PASS.
- 신규 실제 함수 기반 검사 `verify-storyboard-edit-invalidation.cjs`, `verify-storyboard-video-lifecycle.cjs`, `verify-storyboard-persistence.cjs`: PASS. 지연 응답·동시 요청·실패 후 재시도·취소·연쇄 무효화·원자 저장·업로드 롤백을 합성 데이터로 실행했다.
- `verify-storyboard-workspace-lifecycle.cjs`: 실제 React StrictMode에서 기존 삭제/계정 격리와 신규 가져오기·저장 경쟁·전환 검사를 PASS. IO와 하위 화면은 mock이다.
- `verify-storyboard-ux.mjs`: 단계 안내·18개 복구/편집 조합·목록 상태·비용 확인·일괄 설정·결과 보존 PASS.
- 기존 production-state, video-failure-recovery, workflow-v2, final-delivery, commercial-workflow, race-safety, file-cleanup, version-history-safety, reference-upload-safety, downloads, navigation, cost-efficiency, accessibility-performance, generation-cleanup-safety 및 project-deletion 검사 PASS.
- 실제 `http://localhost:3002/admin/storyboard`: 로그인된 목록, 삭제 버튼 11개 확인. 1365×900과 390×844에서 가로 넘침 없음, 검사 구간의 새 page/console 오류 없음. 기존 프로젝트 내용은 변경하지 않았다.
- 최종 소스의 native Linux 격리 Next.js production build: PASS, 78개 정적 페이지 생성 및 `/admin/storyboard` 포함. 현재 소스 복사본과 기존 동일 핵심 버전의 의존성 런타임을 사용하며 Windows node_modules를 변경하지 않았다. 최신 lockfile에 대한 신규 `npm ci` 검증과 운영 배포 검증은 별개다.

React 검사는 WSL의 격리 도구를 사용한다:

```sh
PROPIG_QA_TOOLS=/home/hermes/.local/share/propig-tools node scripts/verify-storyboard-workspace-lifecycle.cjs
STORYBOARD_TEST_RUNTIME=/home/hermes/.local/share/propig-tools node scripts/verify-storyboard-ux.mjs
```

실제 공급자의 생성 성공·실제 파일 삭제는 이번 검사의 대상이 아니며, 결제/재실행 방지용 최소 기록은 기존 삭제 정책을 따른다. 삭제 구현의 상세 범위는 `docs/storyboard-project-deletion-handoff.md`에 기록되어 있다.
