# ProPig 클라우드 주 개발

## 역할과 코드 기준

| 환경 | 기본 역할 |
| --- | --- |
| Codex Cloud | 주 개발, 코드 검토, 작업 통합 |
| 5600X | 브라우저에서 미리보기 확인, 해당 PR의 모바일·PC 화면 자동 검사 |
| 9950X | 직접 수정할 기능의 개발 서버·빌드, Windows/기기 연동 검증 |
| GitHub Actions | 전체 빌드, 테스트, 브라우저 검사, 미리보기 배포 |
| Firebase | 운영 서비스 |

접속한 PC와 실제 작업 실행 환경은 다를 수 있다. 5600X에서 요청해도
채팅의 실행 환경이 Codex Cloud이면 클라우드 개발 절차를 따른다.

- 저장소: `https://github.com/playzzin/propig.git`
- 개발 통합 기준: `develop`
- 운영 배포 기준: `main`
- 작업공간의 `/workspace/AGENTS.md`에서 안내하는 클라우드 개발 사본은 `/workspace/propig-develop`이다. 개발 서버는 `127.0.0.1:3002`에서 연다.
- CY의 포트 `3000`과 로컬 기존 작업은 보존한다.

## 작업 시작과 완료

1. 열린 PR의 후속 수정은 기존 사본의 origin·브랜치·HEAD·미커밋 변경을 해당 PR과 비교해 이어간다. 새 작업은 최신 원격 `develop`을 기준으로 한다.
2. 독립된 작업마다 브랜치를 만든다. 클라우드는
   `codex/cloud-<task>`, 9950X는 `codex/9950x-<task>`를 사용한다. 5600X는 검수가
   기본이며 수정을 명시 요청받으면 `codex/5600x-<task>`로 분리한다.
3. 작업 범위에 맞는 빠른 검증을 수행한 뒤 이번 작업 변경만 commit/push한다.
   로컬 전용·게시 금지 지시가 있으면 이를 우선한다.
4. GitHub Actions의 결과와 실제 검증한 SHA를 확인하고 `develop` 대상 PR을 만든다.
   클라우드 통합 책임자가 검토·통합한다. 동시에 같은 파일을 여러 작업에서 수정하지 않는다.
5. 5600X에서 성공한 미리보기를 확인한다. `main` 병합과 운영 배포는 별도 요청으로 처리한다.

예를 들어 9950X에서 제품소개를 수정해 푸시하면, 5600X는 그 PR을 검사하고 클라우드는 다른 브랜치에서 별도 기능을 개발한다. 인계할 때는 **PR 주소, 검사한 커밋 SHA, 확인한 화면**을 함께 전달한다. 후속 수정으로 SHA가 바뀌면 같은 PR 번호로 새 미리보기를 다시 검사한다.

기존 `codex/add-founding-background-to-introduction` 브랜치는 이전 개발 기록으로 보관한다.

## 5600X 포맷 전 백업

1. 5600X의 기존 ProPig 폴더에서 아래 명령을 실행한다. 첫 두 줄은 브랜치와 수정·추가 파일을, 나머지는 보관한 작업과 다른 작업 폴더를 확인한다.

   ```powershell
   git status --short --branch --untracked-files=all
   git branch -vv
   git stash list
   git worktree list
   git rev-parse --path-format=absolute --git-common-dir
   ```

2. 외장 SSD에 ProPig 폴더를 숨김 `.git`까지 복사한다. `.git`에는 아직 푸시하지 않은 커밋·브랜치와 stash가 있다. Git에서 무시하는 원본 이미지·영상, `.env.local` 등 로컬 설정도 확인해 접근을 제한한 백업에 보관한다. 연결된 worktree가 있다면 위에 표시된 **공통 Git 디렉터리와 각 작업 폴더**도 포함한다.
3. 9950X에서 GitHub에 올린 작업의 브랜치와 최종 커밋을 확인하고, SSD에서 원본 파일을 직접 연다. 백업을 별도 폴더에 복원해 미푸시 브랜치·stash·수정 파일이 1단계 기록과 일치하는지 확인한 뒤 포맷한다. 연결된 worktree도 옮겼다면 복원한 기본 저장소에서 `git worktree repair`에 각 연결 폴더의 새 경로를 인자로 준다.

## 포맷 후 5600X에서 검수하기

**화면만 볼 때**는 브라우저로 해당 브랜치의 성공한 `CI` 실행을 연다. `preview-link-<커밋 SHA>` 아티팩트를 내려받아 `preview-url.txt`의 주소로 접속한다. 미리보기 주소는 마지막 배포 후 7일간 유효하다. [GitHub Actions](https://github.com/playzzin/propig/actions/workflows/ci.yml)

**자동 검사도 할 때**는 Windows에 Git, GitHub CLI와 Node.js 22를 설치한다. 이 도구가 `develop`에 병합된 뒤에는 새 PowerShell에서 아래 명령을 한 줄씩 실행한다. `propig-qa`는 검수 전용으로 새로 만들 폴더다.

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh repo clone playzzin/propig propig-qa -- --branch develop --single-branch
Set-Location propig-qa
npm.cmd run qa:setup
```

`qa:setup`은 검수용 도구와 Chromium을 준비한다. QA용 사본에는 GitHub 저장소·Actions 결과를 읽을 수 있는 계정만 있으면 된다. **매번 검사할 때**는 이 폴더의 PowerShell에서 열린 ProPig PR 번호를 입력한다.

```powershell
$pr = Read-Host '검사할 PR 번호 (숫자만)'
npm.cmd run qa:preview -- $pr
```

검사기는 해당 PR 브랜치의 성공한 push 실행에서 미리보기 주소를 찾고, 검사 전후에 미리보기의 커밋을 PR의 최신 SHA와 대조한다. 비로그인 상태로 기업·블로그·생활·관리자 진입 화면과 제품 상담 경로를 **390px·1440px**에서 확인한다. 검사 결과는 검수 PC의 `output/preview-qa/` 아래에 실행별로 저장한다. 미리보기는 운영 Firebase 백엔드를 공유하므로 자동 검수는 공개 화면과 상담 링크 확인까지 진행한다.

검사 중 추가 커밋이 올라오면 새 push의 `Firebase Hosting preview`가 성공한 뒤 같은 명령을 실행한다. 커밋 표시를 게시하는 워크플로 도입 이전에 만든 미리보기는 브라우저로 확인한다. 검사기 자체를 갱신할 때는 검수 전용 폴더의 `git status --short --branch`가 깨끗한 `develop`인지 확인하고 `git pull --ff-only`를 실행한다. `git rev-parse HEAD`와 `git rev-parse origin/develop`이 같은지 확인하고, 도구 버전이 변경됐으면 `npm.cmd run qa:setup`을 다시 실행한다.

## 클라우드 설치와 시작

빈 Cloud 작업공간에서 독립 작업을 시작할 때는 첫 터미널 명령으로 `cd /workspace && bash /workspace/.propig-tools/sync-develop.sh`를 한 번 실행한다. 도구가 검증한 개발 사본에서 다음 명령을 실행한다. 기존 폴더로 준비가 중단되면 그 사본을 보존하고 작업공간 지침에 따른다.

```bash
cd /workspace/propig-develop
bash ops/cloud/setup.sh
bash ops/cloud/dev.sh
```

설치 스크립트는 프로젝트 밖의 시스템 Node를 바꾸지 않고 checkout의 ignored
`.codex/cloud-tools`에 Node 22.23.5/npm 10.9.8을 준비한다. 앱과 Functions는 각각의
lockfile로 설치한다. 실행 중인 3002 서버가 있으면 의존성 재설치를 중단한다.
설치는 물리 경로가 `/workspace` 아래인 Linux checkout에서만 허용하며 Windows
mount는 거부한다. Node와 npm의 고정 버전을 모두 확인한다.
스크립트는 branch 변경, reset, clean, 기존 서버 강제 종료를 수행하지 않는다.

기존 환경 변수와 `.env.local` 등은 Next.js 규칙으로 읽고 비밀값은 출력하지 않는다.
Firebase 공개 설정이 없는 checkout은 placeholder로 UI 개발 서버를 시작한다.
이 경우 로그인·실제 데이터 검증은 GitHub Actions가 배포한 미리보기에서 수행한다.
미리보기는 기존 Firebase 프로젝트의 인증·데이터·서버 기능을 공유한다.
운영 자격 증명을 이 저장소나 클라우드 설치 스크립트에 복사하지 않는다.

전체 릴리스 검증은 `.github/workflows/ci.yml`을 사용한다. 필요할 때만 클라우드에서
`npm run type-check`, 관련 `npm run verify:...` 등을 실행한다. 이때 설치된 Node 22를
쓰려면 다음 PATH를 해당 셸에 적용한다.

```bash
export PATH="$PWD/.codex/cloud-tools/node22/node_modules/.bin:$PATH"
```

## 저장된 Codex 환경에 적용할 값

아래 표는 GitHub `develop`을 `propig`에 직접 마운트하는 저장 환경의 설정이다. `/workspace/propig`가 게시 스냅샷인 Cloud 작업공간에서는 위의 개발 사본 준비 절차를 사용한다.

| 항목 | 값 |
| --- | --- |
| 저장소 | `playzzin/propig` |
| repository ref | `develop` |
| mount path | `propig` |
| install/setup command | `cd /workspace/propig && bash ops/cloud/setup.sh` |
| startup command | `cd /workspace/propig && bash ops/cloud/dev.sh` |

기존 계정·인증·네트워크 범위는 보존한다. 저장된 환경의 ref가 예전 `main` 또는
고정 SHA이면 새 채팅은 해당 버전으로 시작하므로 위 설정으로 바꾸고 게시한다.
게시 변경은 이미 실행 중인 다른 채팅의 checkout을 자동 변경하지 않는다.

9950X의 보조 개발도 최신 `develop`에서 별도 브랜치를 만들며, 로컬 Windows
node_modules를 클라우드/WSL 설치 스크립트로 재설치하지 않는다.
