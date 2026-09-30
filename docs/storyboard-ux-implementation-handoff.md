# 스토리보드 개선 구현 계약·인계

- 목표: `storyboard-ux-improvement-plan.md` 순서대로 UX-01~07, QA-01을 구현하고 반복 제작 개선의 도입 조건을 점검한다.
- owner: lead가 구현·통합·전체 검증. qa는 읽기 전용 독립 감사.
- 기존 dirty: 시작 시 존재한 corp/dashboard/loading/tsconfig/navigation 및 미추적 작업은 보존한다.
- 허용 파일: `src/components/image-generator/StoryboardWorkspace.tsx`, `StoryboardProjectDashboard.tsx`, `StoryboardWorkspace.styles.ts`, `StoryboardProductionJourney.tsx`, `StoryboardVideoProductionPanel.tsx`, `StoryboardVideoProductionPanel.styles.ts`, `StoryboardAutomationConsole.tsx`(앞의 컴포넌트 디렉터리 기준); `src/lib/storyboard-production-journey.ts`, `src/lib/storyboard-workspace-navigation.ts`, `scripts/verify-storyboard-accessibility-performance.mjs`, `scripts/verify-storyboard-ui-playwright.mjs`, `scripts/verify-storyboard-ux.mjs`, 본 인계 및 기획 문서, `ops/hermes/storyboard-ux-plan.json`.
- forbidden: 그 외 제품 파일·package/lockfile·인증·서버·기존 사용자 데이터. 범위 확장은 lead가 기록 후 진행한다.
- 보존: 자동 저장/충돌·권한·계정 분리·유료 확인·실행 중 프로젝트 전환 보호·승인 결과 재사용·공개 스크롤.
- acceptance: 상태별 이동과 문구, 검색 복귀, 모바일 수치·포커스·메뉴, 오류 안내, 관련 회귀 검사 및 type/lint/build. 유료 호출·운영 쓰기 없이 실제 화면 검토.
- qa acceptance: 코드 읽기로 구체적인 위험과 재현 조건 제시, 수정하지 않고 lead에게 전달.

## 결과

후속 갱신: 사용자의 ‘남은작업들을 진행해줘’ 요청에 따라 개인 기획 프리셋·장면 비교를 구현하고 3002 서버를 검증된 Webpack 방식으로 복구했다. 아래의 404·프리셋/비교 보류 기록은 최초 완료 시점의 이력이며 현재 상태는 [후속 작업 결과](storyboard-remaining-work-handoff.md)가 정본이다.

2026-09-24 구현 완료. 아래 결과는 제품 코드와 실제 검사에 근거한다. 유료 공급자 실행·운영 배포는 범위에 포함하지 않았다.

| 항목 | 적용 결과 | 검증 |
|---|---|---|
| UX-01 | 검색·필터·페이지·스크롤·행 포커스 보존. 편집기에서 주소가 정규화돼도 목록 필터를 복원. 계정 전환 시 초기화 | 실제 로그인 브라우저 검색 및 확인 필요 필터 왕복, Dashboard/Workspace React 검사 |
| UX-02 | 상태별 버튼과 모드·장면 결정 통합. 미완료 이미지/움직임/검수/완성본/실패 장면/파일 정리로 이동 | 삭제된 장면·빈 프로젝트·승인 결과·완성본 변경 상태 검사, 실제 실패 장면 포커스 |
| UX-03 | 준비 3/3단계와 영상 승인 수 분리, 이미지 진행 표시 명확화 | 상태 조합 18개 및 실제 영상 화면 |
| UX-04 | 모바일 행에 이미지·영상 승인·수정 시각 유지 | 390px 실제 화면과 가로 넘침 확인 |
| UX-05 | 실패 장면의 원인과 이동 버튼을 상단에서 제공. 파일 점검 실패는 인라인 원인·재확인·삭제 차단. 기존 공급자 작업 재조회와 새 생성 구분 | 실제 오류 프로젝트, FileManager IO 격리 검사 |
| UX-06 | 대표 제작 동작 통합, 완료 조건·관리 기능 접기, 기본 화면에 추가 비용/예산 표시 | 실제 확인창·취소, 자동화/완성본 기존 계약 검사 |
| UX-07 | 작은 보조 글자 확대, 긴 제목 2줄, 주요 동작 44px, 모바일 저장 상태 노출. 확인창·오류 요약 단일 열 수정 | 390/720/1440px 실제 화면, 키보드 포커스와 메뉴 |
| QA-01 | 조건문 문자열 검사를 실제 메뉴 DOM·키보드 닫기 검사로 교체 | 빌드된 화면에서 검증 성공 |
| 3차 반복 제작 | 선택한 미제작 장면의 길이·움직임 강도 일괄 적용, 변경 개수 미리보기. 기존 영상/요청 기록/진행 중 작업 보호 | 실제 UI 미리보기 및 적용 함수의 무효값·승인 결과 보존·동일값 무변경 검사 |

### 추가 안전 보완

- 저장 실패 시 ‘저장되지 않음’과 다시 저장, 저장 실패 중 이동 시 초안 보존.
- 계정 UID별 작업공간 격리. 이전 계정의 지연 조회·저장 응답과 이전 프로젝트 콜백 차단.
- 수동 영상 접수 중 프로젝트 전환 방지.
- 생성 전 범위·외부 전송·예상액 확인. 단일 장면은 전체 계획 예산과 구분해 검사.
- 승인 영상 재제작과 텍스트 전용 제작은 해당 입력 조건의 견적을 별도로 조회. 견적 실패/조회 중 동의 불가, 재조회 시 기존 동의 해제.
- 확인 시 최신 초안·견적·작업 연결·서버 상태 재검증. 연속 클릭은 한 요청으로 제한.
- 파일 검사는 보호 자료를 제외하고 실제 후보 목록이 바뀔 때만 재조회. 계정/프로젝트 변경 후 늦은 응답 무시.

### 실행한 검증

- `npm run type-check`: PASS, 최종 저장소 기준.
- 수정한 제품 파일 13개의 ESLint `--max-warnings 0`: PASS. 마지막 Dashboard 수정도 재검사 PASS.
- `git diff --check` 대상 수정 파일: PASS (Windows LF/CRLF 안내만 존재).
- 기존 검사 PASS: race-safety, production-state, workflow-v2, accessibility-performance, file-cleanup, downloads, final-delivery, commercial-workflow, reference-upload-safety, version-history-safety, request-recovery, cost-efficiency, planning-preferences.
- `verify-storyboard-ux.mjs`: PASS. 상태별 이동·18개 편집/장애 조합·목록 복원·비용 범위·일괄 설정.
- `verify-storyboard-workspace-lifecycle.cjs`: PASS. 실제 React StrictMode 컴포넌트 + mock IO. 계정 분리·지연 응답·저장·마지막 입력 반영·요청 중 이동 차단.
- `verify-storyboard-file-manager-lifecycle.cjs`: PASS. 실제 FileManager + mock IO. 보호 파일·권한 실패·재시도·반복 조회·늦은 응답.
- `verify-storyboard-video-confirmation.cjs`: PASS. 실제 Panel + mock IO. 동의 전 0요청·연속 승인 1요청·단일 견적·상태 변경·취소·실패 재시도·견적 재조회 후 재동의. QA 결과를 lead가 다시 실행했다.
- `npm run build:next`: PASS. 별도 Linux 폴더에서 lockfile 기준 의존성 설치, 테스트용 공개 Firebase 설정, Sentry 전송 비활성화. 운영 비밀정보 사용 없이 컴파일·타입·80개 정적 페이지 생성 완료.
- `verify-storyboard-ui-playwright.mjs`: 빌드된 임시 3032 화면에서 PASS. 비로그인 데스크톱·390px, 메뉴 배경의 DOM 제거와 Enter 닫기, 가로 넘침·JS/콘솔 오류 검사.
- 실제 로그인된 3002 화면: 검색 복귀와 행 포커스, 확인 필요 필터 왕복, 영상 모드 연결, 오류 요약/장면 포커스, 일괄 설정 미리보기, 유료 확인창/취소, 390/720/1440px 폭 확인. 실제 일괄 적용·유료 최종 실행은 하지 않았다.
- Hermes doctor/정확한 파일 범위 검사: PASS. 구조 검사이며 제품 동작 인증과는 별개다.

### 한계와 후속 조건

최신 상태는 `docs/storyboard-remaining-work-handoff.md`와 `docs/storyboard-final-verification-handoff.md`를 따른다. 아래 항목은 첫 구현 당시의 기록이다. 이후 개인 프리셋·장면 비교를 구현했고, 3002 기본 Turbopack의 청크 404를 해결했다.

- 기존 3002 개발 서버의 엄격한 콘솔 검사는 이전 `/_next/static/chunks` 두 파일의 404로 실패했다. 새 프로덕션 빌드의 동일 검사에서는 오류가 없었다. 다른 작업이 함께 쓰는 개발 서버를 재시작하지 않았다.
- 빌드 준비 중 다른 작업의 이모티콘 파일 타입 오류가 잠시 관찰됐으나, 해당 작업에서 수정된 최신 소스로 최종 type/build가 모두 통과했다. 이모티콘 제품 파일·이미지 생성 API는 이번 작업에서 수정하지 않았다.
- 실제 공급자 과금·영상 생성·Storage 삭제·운영 권한 변경·배포는 수행하지 않았다. 단위/컴포넌트의 mock 검사가 실제 공급자 장애 복구 전체를 보장하지는 않는다.
- 확대 시 화면 재배치는 720px 유효 폭으로 확인했다. 브라우저 메뉴의 실제 200% 배율과 모든 보조기기 조합은 별도 검증 대상이다.
- 개인 기획 프리셋·장면 비교 검수는 원래 기획의 ‘사용 빈도 확인 후 도입’ 후보다. 선택 응답/사용 데이터가 없어 자동 도입하지 않았다. 우선 일괄 설정을 제공한다.
- 측정 기준: 재진입 후 다음 작업까지 1회 클릭, 목록 복귀 검색 재입력 0회, 오류 요약에서 해당 장면까지 1회 클릭. 실패 후 복구 성공률·생성 직전 취소율은 실제 이용 표본이 필요하며 수집하지 않았다. 외부 분석 전송은 추가하지 않았다.

범위 확장(lead): 실제 화면에서 재현한 파일 점검 실패의 반복 알림을 해결하기 위해 `src/components/image-generator/StoryboardProjectFileManager.tsx`를 포함한다. 보호 대상 제외, 검사 상태·재시도, 계정/프로젝트 늦은 응답 격리를 검증하며 저장소 규칙·권한은 변경하지 않는다.

범위 확장(lead): `scripts/verify-storyboard-production-state.mjs`의 기존 버튼 문구 기대값을 생성 전 확인 UX에 맞춰 갱신한다. 실제 의미 검사는 유지한다. 컴포넌트 격리·상태 행렬은 `scripts/verify-storyboard-ux.mjs`에서 검사한다.

검사 갱신(lead): `scripts/verify-storyboard-commercial-workflow.mjs`의 정확한 공백/옛 인자 문자열 의존을 제거하고 새 상태 판정 함수 연결·접근 가능한 복구 대상 계약을 유지한다. 이동·목록 복원 동작은 실제 React 회귀 검사로 함께 검증한다.

검사 호환(lead): `scripts/verify-storyboard-cost-efficiency.mjs`는 별도 작업에서 분당/일별로 분리된 이미지 요청 제한의 namespace 이름도 수용한다. 분당 12회 및 Retry-After 계약은 유지하고 이미지 생성 API는 수정하지 않는다.

QA 소유권 확장: `scripts/verify-storyboard-workspace-lifecycle.cjs`만 QA가 작성한다. 실제 Workspace + 격리 서비스/DOM mock으로 계정 전환과 늦은 응답을 검증. 그 외 파일은 읽기 전용. lead는 이 파일을 수정하지 않고 실행·검토한다.

추가 QA 소유권: `scripts/verify-storyboard-file-manager-lifecycle.cjs`. 실제 FileManager와 격리 IO로 권한 실패·재시도·불필요한 재요청 방지·늦은 응답·보호 파일 제외를 검증한다. 제품 파일은 읽기 전용이다.

추가 QA 소유권: `scripts/verify-storyboard-video-confirmation.cjs`. 실제 VideoPanel의 제작 전 확인 및 개별 장면 견적을 IO mock으로 검증하며 모든 제품 파일은 읽기 전용으로 유지한다.

반복 제작 및 비용 확인 범위(lead): `src/components/image-generator/StoryboardBatchSettings.tsx`, `src/lib/storyboard-scene-batch.ts`, `src/lib/storyboard-video-confirmation.ts`. 선택한 미제작 장면에 길이·움직임 강도를 적용하며 생성·승인된 결과와 진행 중 작업은 보호한다. 개인 프리셋·비교 검수는 기획의 사용 빈도 확인 조건에 따라 후속 후보로 유지한다. 비용 검사는 전체 제작과 단일 장면 범위를 구분해 실제 로직 테스트로 검증한다.
