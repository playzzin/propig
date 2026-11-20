# 스토리보드 개발 의도에 맞춘 제작 흐름 보완

2026-09-30. 기존 미커밋 변경을 보존했다. 제품 소스는 root가 수정하고 QA 두 작업자는 지정된 검사 파일만 수정했다. 소유권 계획: `ops/hermes/storyboard-intent-completion-plan.json`.

## 완료한 동작

- 재생 가능한 검수 대기 영상은 새 생성보다 검수·승인을 우선한다. 첫 완성본도 승인 영상이 모두 있으면 바로 조립한다. 단계 제목·진행률·예상 비용 안내를 같은 상태에 맞췄다.
- 이미지 유지/검토 완료는 이미지 상태만 확정한다. 수정 전 영상을 대신 승인하지 않는다. 영상 승인에는 최신 이미지 상태, 영상 파일과 클립 ID, 검수 가능한 상태가 필요하다.
- 영상 움직임·오디오·참조·목소리 편집은 실제 입력만 전달한다. 승인 무효화는 공통 수정 처리에서 수행하며 같은 값을 다시 누르면 승인과 완성본을 보존한다.
- 프리셋의 대상 시청자·다음 설계 장면 수 변경은 기존 결과를 무효화하지 않는다. 실제 시각 설정 변경은 영상에 미반영 상태를 표시하고 완료된 옛 작업의 연결을 해제한다. 이전 미디어는 보존한다.
- 이미지 화면의 빠른 생성도 기존 제작 내용·비용 확인 절차를 통한다. 이미지 변경 확인, 영상 승인, 최종 완성본 준비 여부를 실제 최신 상태로 표시한다.
- 준비 응답이 늦게 도착해도 일시정지와 교체된 실행을 덮어쓰지 않는다. 작업을 준비하는 중 중지하면 후속 생성·조립이 접수되지 않는다.
- 대기/제작 중으로 저장됐지만 작업 문서가 없으면 서버 재확인·복구 버튼을 제공한다. `getDocFromServer`에서 부재를 확인한 경우에만 해당 연결을 해제하고 실패 상태로 전환해 잠금을 푼다. 자동 제작은 정지하며 기존 결과물은 유지한다. 권한·네트워크 오류, 캐시의 빈 조회, 늦은 응답은 잠금 해제 근거로 사용하지 않는다.
- 목록에서 제작 상태를 열면 실제 진행 중인 장면을 선택한다. 이전에 보던 장면 위치가 이 안내를 덮어쓰지 않는다.

## 실제 검증

- 수정 경계 ESLint: 오류·경고 없음. 전체 TypeScript 검사 통과.
- 마지막 이동 수정까지 포함한 최종 소스의 격리 Next.js production build 통과: TypeScript 완료, 정적 페이지 78개 생성, `/admin/storyboard` 포함.
- `verify-storyboard-intent-journey.cjs`: 실제 도메인 함수, 편집기 버튼, 영상 승인·수정·주 행동 콜백을 실행하는 24개 행동 검사.
- `verify-storyboard-video-lifecycle.cjs`: 16개 검사 그룹. 준비 중 일시정지·실행 교체, 서버 부재 재확인, 조회 중 완료/작업 교체/언마운트, 오프라인·권한·소유권 경계, 캐시 미사용을 포함한다.
- `verify-storyboard-edit-invalidation.cjs`: 이미지 확인이 영상 승인을 바꾸지 않음, 빠른 생성의 비용 확인, 동일 설정 보존과 기존 연쇄 무효화·요청 경쟁 검사.
- 실제 React StrictMode Workspace 검사와 `verify-storyboard-ux.mjs` 통과. IO와 하위 제작 화면은 mock이며 사용자 데이터는 변경하지 않는다.
- production-state, video-failure-recovery, final-delivery, commercial-workflow, navigation, cost-efficiency, accessibility-performance, persistence, project-deletion, workflow-v2, race-safety, file-cleanup, version-history-safety 검사 통과.
- 실제 `http://localhost:3002/admin/storyboard`: 1365×900·390×900에서 가로 넘침 없음, 삭제 버튼 11개, 검사 구간 page/console 오류 0. 운영 프로젝트 편집·생성·삭제 없이 목록을 확인했다. 실시간 연결 때문에 `networkidle` 대기는 타임아웃되어 실제 목록이 표시되는 조건으로 다시 검증했다.

## 검증 범위와 인계

운영 파일 삭제·유료 영상/이미지 호출·배포는 실행하지 않았다. 영상 상태 경합은 실제 소스 콜백과 합성 데이터로 검증했다. 누락 작업의 부재 확인에는 관리자의 Firestore 읽기 권한이 필요하며, 권한 실패 시 기존 상태를 보존한다.

빌드는 Windows 의존성을 건드리지 않는 native Linux 복사본에서 Next.js 16.3.3·React 19.2.3의 기존 격리 런타임으로 수행한다. 현재 lockfile 전체에 대한 새 `npm ci`와 운영 공급자 실호출 검증은 별개다. 이전 삭제·저장·복제 개선 범위는 `docs/storyboard-project-deletion-handoff.md`, `docs/storyboard-flow-hardening-handoff.md`에 기록되어 있다.

## 후속 단계: 제작 화면 통합 검증과 재개 경계 보완

사용자의 후속 요청에 따라 실제 제작 컴포넌트들을 연결해 검증했다. 작업 소유권은 `ops/hermes/storyboard-integration-plan.json`에 기록했다.

추가로 수정한 문제:

- 일시정지 중 자르기·속도·음량을 바꾸면 승인된 영상을 재생성하거나, 뒤 장면을 수정할 때 앞의 미완성 장면을 건너뛰던 문제를 해결했다. 재개 지점과 완료 목록을 저장된 순번/목록 대신 현재 승인된 미디어에서 계산한다.
- 새 영상의 연결 프레임 때문에 재사용할 예정이던 승인 장면도 다시 제작해야 하면 자동 제작을 일시정지한다. 이미 요청한 결과는 보존하고 늘어난 제작 범위와 비용을 다시 확인한다. 처음부터 미완성으로 포함된 장면은 기존 승인 범위대로 진행한다.
- 실제 Chromium 검사에서 상태 동기화와 완료 처리가 같은 렌더에서 실행될 때 새 일시정지를 과거 `running` 상태가 덮어쓰는 문제를 발견했다. 완료 처리가 현재의 정지 상태와 안내 사유를 보존하도록 수정했다. 수정 전 추가 `generate` 요청 발생을 합성 서비스에서 재현했고, 수정 후 추가 요청 0회를 확인했다.

후속 검증:

- `verify-storyboard-panel-integration.cjs`: 실제 React StrictMode에서 Panel·Journey·SceneEditor의 버튼을 연결해 검수→승인→첫 조립, 같은 설정 유지, 응답 대기 중 중복 방어, 준비 중 일시정지 3개 그룹 PASS.
- `verify-storyboard-browser-flow.cjs`: 실제 React 컴포넌트와 styled-components를 Chromium에 표시해 클릭한다. 검수→승인→조립→최신 다운로드, 승인 범위 확대 후 정지→비용 재확인, 1365px/390px의 가로 넘침·주요 버튼 범위 검사 PASS. 외부 IO는 번들 경계에서 mock하고 모든 네트워크 요청을 가로채며 포트를 열지 않는다. 합성 미디어 URL은 실제 영상 재생 품질 검사가 아니다.
- `verify-storyboard-video-lifecycle.cjs`: 실제 콜백/효과 18개 그룹 PASS. 수정 전 실패한 일시정지 중 편집, 추가 제작 범위, 같은 렌더에서의 완료 처리 경합을 포함한다.
- 기존 edit-invalidation, intent-journey(24개), production-state, final-delivery, video-failure-recovery, cost-efficiency, commercial-workflow, accessibility-performance, project-deletion PASS. Workspace StrictMode·UX 회귀도 PASS.
- 전체 타입 검사, 수정 경계 ESLint, 신규 검사 스크립트 구문 검사 PASS. 마지막 동시 완료 처리 수정까지 포함한 격리 production build도 PASS(정적 페이지 78개). 운영 데이터 변경·유료 공급자 호출·배포는 실행하지 않았다.

격리 브라우저 검사는 다음 명령으로 재현한다:

```sh
LD_LIBRARY_PATH=/home/hermes/.local/share/propig-tools/lib node scripts/verify-storyboard-browser-flow.cjs
PROPIG_QA_TOOLS=/home/hermes/.local/share/propig-tools node scripts/verify-storyboard-panel-integration.cjs
```

## 2026-09-30 릴리스 검증

사용자가 이 작업에서 GitHub 커밋·푸시·운영 배포를 명시 승인했다. 통합 owner는 Hermes lead이며, 위 스토리보드 변경과 관련 검증 파일만 포함한다. 기업·메뉴·다른 제작 도구의 미커밋 변경은 포함하지 않는다. 운영 사용자 데이터 삭제·유료 공급자 호출·인증 변경은 실행하지 않는다.

- 기존 커밋에 스토리보드 변경만 적용한 native Linux 격리 소스에서 현재 앱·Functions lockfile로 `npm ci` 완료. 이전 보조 의존성 차이 제한을 해소했다.
- Functions 빌드, 전체 타입 검사, 실제 Hosting 정적 빌드 54페이지, 빌드 전후 배포 경계, `verify:release-static`, `npm test` PASS.
- 스토리보드·로딩·배포 경계 focused 검사 35개 PASS. 실제 React StrictMode 및 Chromium 합성 제작 흐름을 포함한다.
- 확장 검사에서 프리셋 변경 후 과거 job/승인을 유지하고, 새 완성본이 나오면 과거 영상을 즉시 삭제한다고 기대하던 두 테스트를 발견했다. 현재의 승인 무효화·버전 복원용 미디어 보존 계약에 맞춰 `verify-storyboard-repeat-tools.cjs`, `verify-storyboard-video-confirmation.cjs`를 보완했다. 제품 동작을 검사를 위해 변경하지 않았다.
- 전체 lint 오류 0, 기존 무관 경고 3개. 로컬 FFmpeg 합성·프레임·오디오·품질 검사 PASS.
- 실제 정적 산출물의 스토리보드 PC/390px·키보드 메뉴·콘솔 검사와 corp/blog/propig/admin PC/390px 가로 넘침·페이지 오류·선정 접근성 검사 PASS.
- 배포 대상은 `propig-63524` Hosting과 `hostingApi(us-central1)`, `onVideoStudioJobQueued(asia-northeast3)`, `onVideoStudioJobRequeued(asia-northeast3)`이다. 실제 운영 적용 여부는 후속 배포 확인 기록으로 구분한다.

### 운영 적용 확인

- 2026-09-30 08:44 KST 확인 완료. 기능 커밋 `a758cc14e1427a6f830479b3c06e7f2bdca2aa52`를 기존 `codex/add-founding-background-to-introduction` 브랜치에 푸시했다. 커밋된 전체 소스와 검증한 격리 소스의 차이는 0개다.
- 첫 Functions 배포는 PowerShell에서 함수 목록이 분리되어 대상 선택 단계에서 중단됐다. 목록을 하나의 인자로 전달해 재시도했고, 함수 3개 모두 업데이트 성공 및 `ACTIVE` 확인. 나머지 25개 함수의 metadata는 변경되지 않았고, 변경한 함수의 기존 환경·비밀 참조·서비스 계정·런타임·트리거 설정도 유지됐다.
- Hosting 정적 파일 531개 게시 성공. [운영 스토리보드](https://propig-63524.web.app/admin/storyboard).
- 운영 HTML 4개 및 연결 JS/CSS 43개의 SHA-256이 배포 산출물과 일치한다. 스토리보드 HTML 해시: `ee9b813f704afec98d63fb3480e3ff1965354f628d38b3c53a024b1331701136`.
- 인증 없이 admin/check·video-studio/status·이미지 결과 조회는 401, 가짜 프로젝트 경로의 GET은 405, DELETE는 401로 차단됐다. 실제 사용자 프로젝트 ID·인증·데이터 작업은 사용하지 않았다.
- 운영 스토리보드 PC/390px·키보드 메뉴·엄격한 콘솔 검사 PASS. 운영 corp/blog/propig/admin PC/390px 가로 넘침·페이지 오류·선정 접근성 검사 PASS.
- 운영 사용자 데이터 삭제·유료 생성·실제 공급자 영상 품질 검사는 실행하지 않았다. 개발 3002·CY 3000과 무관한 작업 변경을 보존했다. 위 이전 단계의 '미배포' 기록은 해당 시점의 이력이며, 운영 적용 여부는 이 기록이 최신이다.
