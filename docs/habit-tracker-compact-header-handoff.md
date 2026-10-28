# 습관 트래커 상단 압축 인계

- 요청: `/habit-tracker`의 상단 높이 축소, DAILY HABITS 및 오늘의 습관 영역 한 줄 정리, 모바일 디자인 개선.
- owner: lead. 구현 허용 파일: `src/components/habits/HabitTrackerApp.tsx`. 문서: 이 파일.
- QA owner: `habit_compact_qa`, allowed files `[]`, 독립 읽기 전용 감사 완료.
- 기존 dirty: 습관 간소화 앱 수정, `docs/habit-tracker-simplification-handoff.md`, `scripts/verify-habit-simplified-browser.mjs`. 모두 보존.
- 금지 범위: 공통 shell, package/lockfile, 인증·데이터 모델·저장 함수, 실제 사용자 데이터 변경. commit/push 미실행. 운영 배포는 아래 후속 승인으로 실행.
- 시작 기준: `.tmp/habit-compact/HabitTrackerApp.before.tsx`. exact-file QA 계획 검사 통과. Hermes doctor는 Linux 로그인 환경에서 구조 오류 0.

## 변경

- DAILY HABITS·습관 트래커를 한 줄로 묶고 중복 안내 문구 제거. 밝은 테마의 모바일 제목 확대 원인도 제거.
- 제목 영역의 높이: PC 약 129→64px, 모바일 어두운 테마 약 143→92px. 비교 대상은 기존 컴포넌트 fixture 캡처.
- 오늘의 습관·완료 수·보기 전환을 같은 줄로 배치. 여유가 있는 영역에서는 날짜 조작까지 한 줄. 작은 화면에서는 날짜 조작을 다음 줄에 보존.
- 앱 실제 가용 폭에 대응하는 container query 사용. 모바일 날짜·동기화 버튼 44px 유지. 360px 이하에서는 메뉴 아이콘을 숨겨 텍스트 공간 확보.
- 상단 그림자·모서리·글꼴 굵기를 정리. 선택 메뉴 `aria-current`, 저장 상태 안내, 동기화 버튼의 접근 가능한 이름 제공.

## 검증

- 변경 파일 ESLint, 전체 `tsconfig.typecheck.json` 타입 검사, `verify-habit-metric-stats.mjs` 통과.
- 기존 `verify-habit-simplified-browser.mjs`: 어두운/밝은 테마 1365·390px 통과. 이름/Enter 추가, 자동 카테고리, 체크/해제, 날짜 이동, 숫자/시간 저장, 과거 기록 보존, 비로그인·읽기 실패 상태 검증.
- 추가 임시 브라우저 검증: 320/360/390/560/720/768/1024/1120/1280/1365/1920px에서 제목 행 정렬, 가로 넘침, 메뉴 텍스트, 저장 키보드 조작, 통계 이동 검사 통과. JavaScript 오류와 외부 요청 0.
- 최종 레이아웃 증거: `.tmp/habit-compact/qa/layout-report.json`, `.tmp/habit-compact/qa-light-shell/layout-report.json`, 각 폴더 PNG.
- 최종 Linux 격리 빌드 `npm run build` exit 0. 증거: `.tmp/habit-compact/build-linux.log`, `.tmp/habit-compact/linux-build-path.txt`. 현재 lockfile과 일치하는 기존 의존성을 사용했으며 앱 소스의 논리적 내용은 빌드 snapshot과 일치.
- `git diff --check` 통과. 기존 혼합 줄바꿈을 보존하고 추가된 줄의 CRLF만 정리했으며 소스 텍스트 동일성 확인.
- `qa-light-shell`은 공통 사이드바 252px·헤더 64px의 크기 제약을 재현한 fixture이며 실제 공통 컴포넌트 통합 실행은 아님.
- 독립 QA는 최종 diff와 캡처를 열람하여 차단 이슈 없음 보고. parent가 실제 브라우저 검사와 결과 파일을 직접 확인.

## 한계

- 브라우저의 계정·저장은 합성 fixture. 실제 운영 계정 저장이나 운영 데이터 변경 없음.
- 운영 배포는 아래 후속 승인 및 검증에 따라 완료.
- Windows 의존성 재설치 및 기존 3000/3002 서버 변경 없음.

## 운영 배포

- 사용자의 후속 요청 `배포해줘`로 이번 변경의 배포 승인 확보.
- 배포 직전 소스 413개, 설정, 빌드 환경과 검증된 Linux snapshot의 일치 확인. 공개 결과 내 비공개 파일 0개.
- 공개 파일 519개를 별도 임시 Hosting 디렉터리에 준비. `firebase deploy --only hosting --project propig-63524 --config firebase.json --non-interactive` exit 0, `release complete` 및 `Deploy complete` 확인.
- 운영 빌드 ID: `B3ytWxbpdA0gqmdIvtJOi`. Functions·Firestore/Storage 규칙·사용자 데이터 변경 없음.
- 운영 주소: https://propig-63524.web.app/habit-tracker
- 새 비로그인 브라우저로 기록/관리/통계/설명서 HTTP 200 및 승인된 HTML과 정확한 hash 일치 확인.
- 실제 운영 화면: 1365px 상단 64px, 390px 상단 92px. 제목 한 줄, 문서 가로 넘침 없음, JavaScript 예외 0. 비로그인 동기화 차단 확인.
- 증거: `.tmp/habit-compact/production/report.json`, 같은 폴더 `live-1365.png`, `live-390.png`.
- 로그인 후 실제 데이터 저장은 실행하지 않음. 로그인 상태의 기록 상호작용 검증은 앞선 격리 fixture 결과 사용.
