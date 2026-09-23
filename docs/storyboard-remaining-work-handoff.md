# 스토리보드 후속 작업 계약

> 최신 상태(2026-09-24): 아래 Webpack 임시 복구 이후, 기본 Turbopack의 청크 404 원인을 수정하고 3002를 기본 실행 방식으로 복원했다. 최종 재시작·교차 사이트 검증, 실제 측정값 및 남은 승인/확대 검증은 `docs/storyboard-final-verification-handoff.md`를 따른다.

- 요청: 남은 개발 서버 404, 개인 기획 프리셋, 장면 비교 검수를 구현·검증한다.
- lead 소유: `src/lib/storyboard-planning-presets.ts`, `src/components/image-generator/StoryboardPlanningPresets.tsx`, `src/components/image-generator/StoryboardSceneComparison.tsx`, `src/components/image-generator/StoryboardWorkspace.tsx`, `src/components/image-generator/StoryboardVideoProductionPanel.tsx`, 이 문서, `docs/storyboard-ux-implementation-handoff.md`, `docs/storyboard-ux-improvement-plan.md`, `ops/hermes/storyboard-remaining-plan.json`.
- qa 소유: `scripts/verify-storyboard-repeat-tools.cjs` 한 파일. 제품 코드는 읽기 전용.
- QA 추가 소유: `scripts/verify-storyboard-workspace-lifecycle.cjs`, `scripts/verify-storyboard-video-confirmation.cjs`의 새 자식 컴포넌트 mock 등록만 변경. 실제 신규 UI는 repeat-tools에서 검사하며 기존 회귀 조건은 유지한다.
- forbidden: 기타 사용자 변경, package/lockfile, 인증·규칙, 유료 호출·배포·운영 데이터 삭제.
- 서버: lead가 3002 프로세스와 부모 명령을 확인한 뒤 같은 설정으로 필요 시 재시작한다. 3000은 변경하지 않는다. 캐시는 원본 저장소 하위의 검증된 생성 디렉터리만 대상으로 한다.
- 프리셋 계약: 계정별 브라우저 저장, 이름과 기획 설정 whitelist만 저장. 주제·장면·참조 파일·생성 결과·작업 ID·가격 동의 제외. 로딩/저장 실패·손상 데이터 방어. 적용 전 변경 내용과 기존 결과 재검토 안내. 실행 중 적용 차단.
- 비교 계약: 두 장면을 선택해 이미지·영상·대사·움직임·승인 상태를 나란히 확인. 모바일 세로 배치, 동영상 자동재생 없음, 선택 장면 편집 이동. 비교 자체는 생성/승인/원본 변경 없음.
- acceptance: 설정 validation·계정 분리·손상/용량 오류·안전 적용·장면 삭제·모바일/키보드; type/lint/build 및 관련 기존 회귀; 3002 기존 404가 사라지는 실제 브라우저 확인.

## 결과

2026-09-24: 요청한 후속 세 항목 구현·검증 완료.

### 1. 개인 기획 프리셋

- 장면 설계 화면에 기본 접힘 상태의 ‘내 기획 프리셋’ 추가. 계정별 현재 브라우저에 최대 12개 저장하며 같은 이름은 명시적인 덮어쓰기 버튼으로 처리한다.
- 스키마로 허용된 10개 기획 설정만 저장한다. 주제·제목·장면 본문·참조 파일·생성 결과·요청·가격 동의는 저장하지 않는다.
- 적용 전에 변경 항목의 이전/다음 값과 기존 결과 재검토 안내를 표시한다. 미리보기 이후 프로젝트가 변경되면 재확인을 요구한다.
- 같은 값 적용은 아무 것도 변경하지 않는다. 장면 수·목적만 변경할 때는 현재 장면/승인 결과를 유지한다. 화면/연출 변경은 기존 파일을 보존하며 승인과 연결을 재검토 상태로 갱신한다.
- 자동 제작·개별 제작·최종 병합 및 접수 중 적용 차단. 저장소 접근 거부/손상/용량 실패 시 기존 값 보존과 재시도. 다른 창의 변경을 다시 읽고 오래된 덮어쓰기·삭제를 차단한다.

### 2. 장면 비교 검수

- 영상 제작 화면의 ‘장면 나란히 비교’에서 이미지/영상, 승인 상태, 길이, 대사, 움직임 강도, 소리, 카메라/장면 연결, 상세 움직임 연출을 확인한다.
- 접기 상태에서는 미디어를 렌더링하지 않으며 영상은 자동재생 없이 `preload="none"`과 재생 컨트롤을 사용한다.
- 삭제된 선택은 유효한 서로 다른 장면으로 대체한다. 장면 0/1개 상태 안내, 편집 이동 후 비교 선택 유지, 700px 이하 한 열 배치를 제공한다.
- 비교·선택·편집 이동 자체는 생성/승인/데이터 변경을 실행하지 않는다.

### 3. 3002 개발 서버 복구

- 실행 중인 3002 프로세스와 부모의 저장소·명령을 확인했다. 생성된 `.next/dev`만 `.next/dev-storyboard-recovery-20260924-021102`로 보관하고 서버를 재시작했다.
- 재시작한 Turbopack에서 `firebase-admin` 해석 오류를 재현했다. 같은 설치의 Node 해석은 정상이며 프로젝트에 이미 제공된 Webpack 방식에서는 관련 API가 200으로 응답했다. 패키지 재설치·package/lockfile 변경 없이 `next dev --webpack --port 3002 --hostname 127.0.0.1`로 복구했다.
- 3002 개발 서버는 실행 상태로 유지했다. 재시작 시 기존 `npm run dev:webpack` 명령을 사용할 수 있다. 기본 Turbopack의 Windows 해석 원인까지 수정한 것은 아니다. 3000 포트는 변경하지 않았다.
- 실행 기록은 저장소의 `.codex-storyboard-webpack.out.log`/`.err.log`에 있다. 이 문서에 환경 변수나 실제 프로젝트 본문을 복사하지 않았다.

### 실제 검증

- `npm run type-check`: PASS.
- 수정 제품 파일 5개의 ESLint `--max-warnings=0`: PASS. 변경 대상 `git diff --check`: PASS.
- Linux 격리 환경 `npm run build:next`: 최종 PASS. 테스트용 공개 Firebase 설정, Sentry 비활성화. 최종 빌드의 수정 제품 파일과 현재 저장소 파일 일치 확인.
- 기존 13개 검사: race-safety, production-state, workflow-v2, accessibility-performance, file-cleanup, downloads, final-delivery, commercial-workflow, reference-upload-safety, version-history-safety, request-recovery, cost-efficiency, planning-preferences 전부 PASS.
- `verify-storyboard-ux.mjs`, Workspace/FileManager/VideoConfirmation 실제 React 회귀, 신규 `verify-storyboard-repeat-tools.cjs`: PASS. QA 결과를 lead가 독립 재실행. 신규 검사는 저장 손상·접근·용량 실패, UID 변경, 타 창 충돌, 적용 확인·실행 중 차단·기존 결과 보존, 삭제/0/1개 장면, 비교 선택 유지와 편집 이동을 포함한다.
- 실제 3002 `verify-storyboard-ui-playwright.mjs`: 비로그인 데스크톱·390px 모바일 및 엄격한 콘솔 검사 PASS. 이전 청크 404가 재현되지 않았다.
- 로그인된 실제 브라우저: 비교 두 장면 선택→해당 편집 장면 이동→비교 선택 유지 확인. 390px 한 열/1440px 두 열 및 가로 넘침 0 확인. 프리셋 빈 목록·이름 입력에 따른 저장 버튼·Enter 펼침/접기 확인. 입력은 지웠고 실제 사용자 프리셋/프로젝트를 저장하지 않았다.
- 정확한 파일 소유권 검사: PASS. QA의 기존 테스트 2개 수정은 새 자식 mock 등록 각각 1줄이다.

### 한계

- 프리셋은 같은 기기의 해당 브라우저 저장 기능이며 계정 간·기기 간 동기화 기능이 아니다.
- 저장/적용의 실패 분기는 격리된 가짜 저장소와 합성 프로젝트로 검사했다. 실제 공급자 과금·생성·Storage 삭제·인증/권한 변경·배포는 수행하지 않았다.
- 실제 브라우저 200% 배율과 모든 보조기기 조합은 별도 검증 대상이다. 기본 Turbopack 재시작 시 해석 오류가 돌아올 수 있어 검증된 Webpack 실행 방식을 인계한다.
