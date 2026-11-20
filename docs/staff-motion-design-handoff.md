# 직원소개 모션 디자인 작업 인계

- 요청: `/corp/company/staff-intro`를 한 화면에서 보고, CEO를 중심으로 다양한 모션을 통해 함께 움직이는 조직으로 재구성.
- 통합 owner: Hermes. `corp_motion`은 `StaffCeoHub.tsx` 구현과 `StaffCollaborationStage.tsx` 시나리오 export를 담당한 뒤 종료. 부모가 허브의 연결선 가시성을 조정하고 통합 검증. `qa_staff_motion`은 읽기 전용 데이터·동작 감사 후 종료.
- branch: `codex/add-founding-background-to-introduction`.
- 시작 시 기존 변경: 기업 페이지 검증 스크립트, Dashboard2, 습관 관리 화면과 관련 handoff/이미지/스크립트. 해당 변경은 보존.

## 허용 파일과 결과

- `src/components/corp/StaffOverviewBoard.tsx`: 중앙 CEO·좌우 5개씩의 전문 부서·100개 팀·5개 지원 조직을 통합. 업무 단계에 맞는 10개 SVG 연결선의 방향과 부서 강조, hover/focus 연결 탐색. 모바일은 CEO 조직도부터 시작하는 세로 배치와 44px 팀 버튼.
- `src/components/corp/StaffCeoHub.tsx`: 72px CEO 초상과 8명 운영진의 방사형 배치, CONTROL 총괄 연결. 회전 궤도·방사형 신호·CEO 확산 맥박·운영진 반응·대화 전환. 5개 시나리오·7단계 제어와 전체 조직의 활동 상태를 함께 관리.
- `src/components/corp/staffDirectory.ts`: 기존 인물·직책·책임·사진 데이터와 팀 프로필 생성 함수 분리. 기존 HEAD 데이터와 동일함을 별도 비교로 검증.
- `src/components/corp/StaffIntroOrgChartExperience.tsx`: 보드와 상세 프로필 서랍을 연결. 키보드 열기·Escape 닫기·포커스 복귀 유지. 필터나 펼치기 없이 125개 프로필 진입점 모두 제공.
- `src/components/corp/StaffCollaborationStage.tsx`: 이전 협업 표현은 유지하고 SCENES를 export해 새 CEO 허브와 시나리오 원본을 공유. 현재 페이지는 StaffCeoHub 사용.
- `src/components/corp/useStaffReducedMotion.ts`: 서버와 최초 브라우저 렌더가 일치하는 `useSyncExternalStore` 기반 모션 설정 구독.
- `src/components/corp/StaffDepartmentConversations.tsx`: 모션 설정 hook 교체만 수행.
- `scripts/verify-staff-motion-browser.mjs`: 실제 사용자 흐름 회귀 검사.
- 본 인계 문서.

공통 shell, 저장된 데이터/권한/API, package/lockfile은 수정하지 않았다. 개발 서버와 CY 포트는 그대로 유지했다. commit/push/유료 호출은 실행하지 않았다. 운영 배포는 아래 후속 명시 요청으로 수행했다. 중간 구현의 독립 히어로 파일은 통합 보드로 대체해 제거했다.

## 검증

- Hermes doctor와 exact-file 병렬 소유권 plan 검사 통과. 기록: `.tmp-staff-motion/ceo-orbit-plan.json`.
- `node scripts/verify-staff-motion-browser.mjs`: 1440×900, 1366×860, 390×844 통과.
- 데스크톱 두 화면에서 보드 하단은 y=844.875px로 모든 125개 프로필 진입점이 초기 화면에 노출. 100개 팀 이름의 잘림과 가로 넘침 없음. CEO의 가로 중앙·좌우 부서 각 5개·연결선 10개 확인.
- 실제 검사: 5개 시나리오 선택, 단계 이동, 일시정지 지속, 대표·운영진·부서장·팀장·지원조직 프로필 키보드 열기, Escape 닫기·포커스 복귀, 모션 축소 설정 후 새로고침 및 수동 탐색.
- 데스크톱 5종·모바일 4종 지속 모션 확인. 일시정지 후 재생 중인 loop 0개, reduced-motion에서 지속 animation 0개. 별도 실제 브라우저 검사에서 시간 진행·화면 밖 정지·재진입 재개 확인.
- 진입 애니메이션 종료·창 크기 변경 뒤 10개 연결점과 부서장 행 중앙의 세로 오차 모두 0px 확인.
- 모션 축소 새로고침을 포함한 `pageerror`: 세 화면 모두 0건. 페이지 범위 axe WCAG 2 A/AA 및 2.1 AA 위반 0건.
- 결과와 화면: `.tmp-staff-motion/ceo-network/results.json`, `overview-*.png`, `collaboration-*.png`. 자동 검사 스크린샷은 공개 비로그인 브라우저 컨텍스트로 생성.
- 페이지 컴포넌트 범위 ESLint, 검증 스크립트 구문 검사 및 `git diff --check` 통과.
- CEO 중심 보드 변경 후 `NEXT_DIST_DIR=.tmp-staff-ceo-build`, `DISABLE_SENTRY=true` 환경으로 `node node_modules/next/dist/bin/next build --webpack` 통과(exit 0). 컴파일·TypeScript·78개 정적 페이지 생성 완료. 독립 `tsc --noEmit -p tsconfig.typecheck.json`도 통과. 빌드가 추가한 `tsconfig.json` 임시 include만 제거해 원래 설정을 보존.

## 리뷰에서 보완한 사항

- 재생 복귀 시 진행 막대와 타이머의 시작점을 일치시킴.
- 진입 transform이 SVG 측정에 영향을 주므로 animationend에 연결점 재측정. 반복 모션 정지와 최초 카드 진입을 분리해 일시정지해도 정보가 사라지지 않도록 처리.
- CEO 허브 배경을 투명하게 구성해 CEO에서 부서까지 이어지는 연결선을 유지.
- 100개 팀을 항상 노출하고 팀 이름과 부서장 행의 세로 간격을 조정해 화면 높이를 확보.
- 인물 데이터와 시나리오를 유지하며 한 화면에 맞는 표시 컴포넌트만 분리.
- 모션 축소 사용자의 새로고침 시 재생 버튼의 서버/클라이언트 HTML 불일치 수정. 회귀 검사가 새로고침 이후 오류도 수집하도록 보강.

## 한계

- Chromium의 개발 화면·정적 후보·운영 화면을 검증했다. Safari/Firefox 실기기 검증은 수행하지 않음.
- 한 화면 배치는 검증한 데스크톱 크기 기준. 좁거나 낮은 창, 확대 화면, 모바일에서는 내용을 자르지 않고 자연스러운 세로 스크롤을 유지.
- 협업 장면은 업무 방식을 설명하는 시뮬레이션이며 실제 에이전트 작업 현황이 아님.
- 참고한 공식 동작 정의: [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore), [Motion useInView](https://motion.dev/docs/react-use-in-view).

## 운영 배포 (2026-10-23)

- 사용자 후속 요청 `배포해줘`로 직원소개 개선의 운영 배포 승인 확보.
- 기존 성공한 Linux 정적 빌드와 현재 소스/types 427개, package/lockfile, 설정, 빌드 환경, 직원 사진이 모두 동일함을 직접 대조해 검증된 산출물을 재사용했다.
- 배포 전 운영 릴리스 `e6b80cc2b8b0ed9e`의 공개 파일540개와 Firebase 생성 파일2개를 대조했다. 직원소개 HTML/RSC5개를 교체하고 필요한 JS2개만 추가했다. 다른 파일535개는 해시 그대로 보존, 삭제0, 동일 URL 자산 충돌0. 독립 읽기 전용 감사도 통과.
- 정적 후보에서 1440×900, 1366×860, 390×844의 직원소개 전체 검증 통과. 회사소개·제품소개에서 직원소개로 양방향 이동, 뒤로/앞으로, 새로고침, CEO 프로필 열기/닫기 통과. 네 가지 기존 페이지 HTML 바이트 보존 확인.
- 배포 직전 운영 버전과 후보 전체 해시를 재확인한 뒤 `firebase deploy --only hosting --project propig-63524 --config firebase.json --non-interactive` exit0, `release complete` 및 `Deploy complete` 확인.
- 새 운영 릴리스 `09dbfd4376bcc138`: 공개542개+Firebase 생성2개 파일 해시가 배포 후보와 전부 일치.
- 운영 주소: `https://propig-63524.web.app/corp/company/staff-intro`.
- 운영 새 비로그인 Chrome에서 세 화면 크기, 125개 프로필 진입점/100개 팀, 5개 시나리오, 전체 모션 정지, reduced-motion, 키보드/포커스, 접근성 검사 모두 PASS. JS 오류·WCAG A/AA 위반·누락 자산0. 회사소개/제품소개와 양방향 이동·뒤로/앞으로·새로고침 PASS. 회사소개·제품소개·습관트래커·대시보드 HTML은 이전 운영본과 동일.
- 증거: `.tmp-staff-motion/release-build-verification.json`, `release-manifest.json`, `preflight-live.json`, `deploy-result.json`, `production-release.json`, `candidate/`, `production/`. 임시 정적 QA 서버는 검사 종료 후 정리했다. Functions·Firestore/Storage 규칙·운영 사용자 데이터·commit/push 변경 없음.
