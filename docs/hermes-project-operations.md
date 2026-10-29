# ProPig Hermes 전담 운영

## 책임과 실행 방식

Hermes가 제품 의도·구조·파일 소유권·검증·사용자 보고의 통합 책임자다. `ops/hermes/team.json`은 전담 역할의 정본이며 실제 코드는 역할 문서보다 우선한다.

전담자는 **역할을 유지하며 작업 때 실행되는 서브에이전트**다. 상시 살아 있는 독립 프로세스나 별도 기억을 가진 7개 봇이 아니다. 각 실행에 최신 코드·목표·허용 파일·검증·인계 기록을 전달한다. 동시에 최대 3명, 깊이 1. 작업 없는 동안 LLM을 계속 호출하지 않는다.

### 팀

| 역할 | 담당 | 대표 검증 |
|---|---|---|
| corp | 기업 공개 콘텐츠·제휴·채용·프로젝트 화면 | corp-pages, careers-experience, partnership-inquiry |
| blog | 블로그 화면·콘텐츠·렌더링 | route-shell, admin-menu |
| shop | propig 생활·업무 모드 | calculator, habit-stats, admin-menu |
| admin | 관리자·메뉴 편집·사진·제작 스튜디오 UI | admin-menu, admin-menu-browser, emoticon-studio-complete |
| shell | 모드 상태·공통 메뉴·브랜드·레이아웃·성능 | sidebar-refinement, site-favicon, navigation-performance |
| security | 서버 인증·데이터·개인정보·AI 비용 | security, firestore-boundary, deployment-boundary |
| qa | 독립 테스트·브라우저·배포 전 감사 | release-static, release-browser |

홈 정본은 `src/constants/siteHome.ts`다. 기본 ID: corp→/corp, blog→/blog, shop→/propig, admin→/admin. `/shop` 또는 `propig`라는 표시를 별도 데이터 모드로 복제하지 않는다. 사용자 계정 메뉴 `account-menu`는 사이트 모드가 아니다. 추가 커스텀 사이트는 실제 menu data와 home resolver를 조사한 뒤 팀 범위에 등록한다.

라우트 접두사만으로 모든 파일의 소유권을 단정하지 않는다. 블로그가 공유 북마크를 사용하거나 기업 프로젝트가 공통 제작기를 사용하면 해당 파일은 명시적 인계가 필요하다. 레거시 `src/pages`·API·공유 컴포넌트를 요청 없이 삭제하지 않는다.

## 시작 절차

1. 현재 `git status`, branch, live config와 관련 코드를 읽는다. 이전 세션 완료·미배포 기록을 현재 증거로 대체하지 않는다.
2. `python3 scripts/hermes-project.py doctor`로 역할/스크립트 참조를 검사한다.
3. 목표·보존 계약·수정 허용 **정확한 파일 목록**·검증을 task-template에 작성한다.
4. plan 배열을 만들어 `python3 scripts/hermes-project.py plan /tmp/propig-plan.json` 실행. 이 도구는 폭 제한·중복 파일·범위 이탈을 검사하고 `delegate_task`용 JSON만 출력한다. 자동 실행이나 샌드박스 보안 경계가 아니다.
5. Hermes가 승인된 JSON을 delegate_task에 전달한다. 한 파일은 한 owner만 수정한다. 역할 범위 내라도 brief에 없는 파일은 금지한다.
6. package/lockfile, 서버 포트, 전체 빌드, 공유 계약, commit/push/deploy는 통합 책임자가 소유한다.

읽기 전용 감사는 files: []로 실행한다. 쓰기 소유권을 확장해야 하면 작업자가 직접 확장하지 않고 lead에게 인계한다. 계획 검사를 통과했더라도 실제 diff를 다시 대조한다.

## 의존성·실행 환경

- 원본: `C:\Users\playz\propig` / WSL `/mnt/c/Users/playz/propig`. 개발 포트 3002. CY의 3000은 사용하지 않는다.
- 제품 package.json/lockfile이 앱 의존성의 정본. 최신이라는 이유만으로 대량 업데이트하지 않는다. 필요·호환성·audit를 확인한다.
- Windows node_modules를 WSL에서 삭제/재설치하지 않는다. release는 native Linux 복제본에 lockfile로 npm ci한다.
- QA 전용 도구: `/home/hermes/.local/share/propig-tools`에 버전 고정한 Playwright Core, axe, esbuild, React/renderer를 격리 설치한다. 앱 dependencies가 아니며 자동 갱신하지 않는다.
- Chromium 및 Linux shared library 경로는 실행 전 확인한다. `/tmp` 경로는 영구 설치로 간주하지 않는다. 기존 브라우저 공유 라이브러리는 `~/.local/share/propig-tools/lib`로 복사했고 앱 파일과 분리했다.
- Node 도구 재설치: `bash ops/hermes/setup-tools.sh` (고정 package/lockfile로 npm ci, lifecycle scripts 비활성화). OS 라이브러리·Chromium 자체는 별도 전제 조건이며 새 머신에서는 해당 배포판/Playwright 공식 설치 절차를 확인한다.
- 실동작: `LD_LIBRARY_PATH="$HOME/.local/share/propig-tools/lib" node ops/hermes/browser-check.mjs`. axe는 명시적 browser.newContext()를 사용한다. package export가 package.json을 막으면 실제 설치 manifest 경로를 읽는다.
- Codex CLI는 독립 구현/감사의 선택 수단이다. 명령 존재와 실제 인증/실행 성공은 다르다. 인증 실패를 다른 provider·계정 변경으로 자동 우회하지 않고 Hermes 자식으로 대체한다.

## 검증 단계

1. 수정 경계 lint·구문·도메인 focused gate.
2. type-check 및 관련 상태/저장/권한 회귀.
3. native production build(메모리 부족 시 NODE_OPTIONS의 합리적인 상한 설정), 실제 HTTP health.
4. 공개 모드·관리자 guest 경계·390px 모바일·키보드·페이지 스크롤·콘솔 검사.
5. 읽기 전용 검사와 실제 사용자/Firestore 쓰기, fixture와 운영 확인을 분리한다.
6. 자식 보고는 자기 보고다. parent가 파일·로그·URL·해시를 재검증하고 모든 작업자 종료를 확인한다.

관리 도구 구조 검사와 실제 앱 build는 별개의 PASS다. 모드별 목록의 모든 gate를 매번 무작정 실행하지 않고 영향 범위를 고른다. 공통 shell·보안 변경은 교차 모드 gate를 추가한다.

## 안전한 자율 범위

자율 가능: 코드 조사, 관련 로컬 구현, 임시 격리 복제본·필요 개발 도구 설치, 테스트·빌드·로그·문서 개선.

별도 명시 승인: commit/push/운영 배포, 운영 원본 변경·삭제, 유료 provider 실제 호출, 계정/credential 변경, 구형 함수 퇴역. 오래된 승인은 새 작업의 배포 승인으로 자동 승계하지 않는다. 승인 timeout이나 stop은 우회하지 않는다.

금지: reset --hard, clean, 전체 formatter, 다른 profile 수정, 비밀정보/사용자 원본 로그·커밋, 권한검사 제거, 검증되지 않은 완료 보고. worktree는 HEAD 기준이므로 dirty 변경을 자동 포함한다고 가정하지 않는다. dirty 때 소유권 분리 또는 현재 파일 snapshot 복제본을 사용한다.

## 지식·작업 인계

- AGENTS.md: 짧은 항구적 규칙과 본 문서 링크. .hermes.md 중복 생성으로 기존 AGENTS 로드를 가리지 않는다.
- task-template: 현재 작업과 handoff. 임시 로그는 repo 밖 또는 ignored 경로.
- Obsidian: 검증된 ADR/runbook만. 코드가 정본이며 비밀·원문 로그를 넣지 않는다.
- Hermes skill `propig-project-operations`: 세션 시작 라우팅. `/propig-team` bundle로 핵심 운영 스킬을 함께 불러올 수 있다.
- memory: 사용자의 전담 선호와 안정적인 경로만. commit/진행률/임시 TODO를 넣지 않는다.

## 사용

```bash
hermes project show propig
hermes --in /mnt/c/Users/playz/propig --skills propig-project-operations
python3 scripts/hermes-project.py doctor
python3 scripts/hermes-project.py self-test
python3 scripts/hermes-project.py plan ops/hermes/example-plan.json
```

기본 Hermes profile에만 named project를 등록한다. 기존 Telegram 봇 profile은 변경하지 않는다. 활성 프로젝트·cwd 설정은 다음 새 세션에서 프로젝트 문맥을 찾는 데 사용하며, 현재 대화도 매 작업 명시적으로 원본 경로를 읽는다. 자동 cron·Kanban dispatcher·무제한 작업 큐는 활성화하지 않는다.

공식 문서: https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation · https://hermes-agent.nousresearch.com/docs/user-guide/features/skills · https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files
