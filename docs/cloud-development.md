# ProPig 클라우드 주 개발

## 역할과 코드 기준

| 환경 | 기본 역할 |
| --- | --- |
| Codex Cloud | 주 개발, 코드 검토, 작업 통합 |
| 5600X | 클라우드에 개발 요청, 미리보기 검수, 실제 업무 확인 |
| 9950X | 무거운 로컬 처리, Windows/기기 연동 검증, 보조 개발 |
| GitHub Actions | 전체 빌드, 테스트, 브라우저 검사, 미리보기 배포 |
| Firebase | 운영 서비스 |

접속한 PC와 실제 작업 실행 환경은 다를 수 있다. 5600X에서 요청해도
채팅의 실행 환경이 Codex Cloud이면 클라우드 개발 절차를 따른다.

- 저장소: `https://github.com/playzzin/propig.git`
- 개발 통합 기준: `develop`
- 운영 배포 기준: `main`
- 클라우드 checkout: `/workspace/propig`, 개발 서버: `127.0.0.1:3002`
- CY의 포트 `3000`과 로컬 기존 작업은 보존한다.

## 작업 시작과 완료

1. 현재 저장소의 remote, branch, 미커밋 변경을 확인한다. 최신 원격 `develop`을 fetch한다.
2. 기존 작업을 보존하며 최신 `develop`에서 작업 브랜치를 만든다. 클라우드는
   `codex/cloud-<task>`, 9950X는 `codex/9950x-<task>`를 사용한다. 5600X는 검수가
   기본이며 수정을 명시 요청받으면 `codex/5600x-<task>`로 분리한다.
3. 작업 범위에 맞는 빠른 검증을 수행한 뒤 이번 작업 변경만 commit/push한다.
   로컬 전용·게시 금지 지시가 있으면 이를 우선한다.
4. GitHub Actions의 결과와 실제 검증한 SHA를 확인하고 `develop` 대상 PR을 만든다.
   클라우드 통합 책임자가 검토·통합한다. 동시에 같은 파일을 여러 작업에서 수정하지 않는다.
5. 5600X에서 성공한 미리보기를 확인한다. `main` 병합과 운영 배포는 별도 요청으로 처리한다.

두 PC나 여러 클라우드 작업의 디스크가 자동 동기화되는 것은 아니다. 전달 기준은
GitHub의 커밋·브랜치·PR이다. 작업 내용은 클라우드 임시 폴더에만 남겨두지 않는다.
기존 `codex/add-founding-background-to-introduction` 브랜치는 이전 개발 기록으로
보존하고, 새 작업은 `develop`을 기준으로 시작한다.

## 클라우드 설치와 시작

```bash
cd /workspace/propig
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

다음 값은 환경 편집 화면에 적용할 설정이다. 이 문서가 환경 설정 자체를 바꾸지는 않는다.

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

5600X에서는 미리보기 검수만 할 때 저장소 설치가 필요 없다. 로컬 checkout을
사용한다면 기존 변경을 먼저 확인하고 최신 `develop`을 안전하게 가져온다.
9950X의 보조 개발도 최신 `develop`에서 별도 브랜치를 만들며, 로컬 Windows
node_modules를 클라우드/WSL 설치 스크립트로 재설치하지 않는다.
