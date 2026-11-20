# 다른 컴퓨터에서 개발 이어가기

이번 인계는 현재 작업 전체의 커밋·푸시와 개발서버 확인을 위한 기록이다. 저장소는 `https://github.com/playzzin/propig.git`, 작업 브랜치는 `codex/add-founding-background-to-introduction`이다. `main`을 받으면 이번 작업 내용과 다를 수 있다.

## 기존 저장소에서 받기

먼저 다른 컴퓨터의 미커밋 변경을 보존한 다음 실행한다. 변경 충돌이 있으면 강제 덮어쓰기하지 않는다.

```bash
git fetch origin
git switch codex/add-founding-background-to-introduction
git pull --ff-only origin codex/add-founding-background-to-introduction
```

처음 받는 컴퓨터에서는 다음 명령으로 같은 브랜치를 복제한다.

```bash
git clone --branch codex/add-founding-background-to-introduction https://github.com/playzzin/propig.git
cd propig
```

## 설치와 실행

Node.js 22를 사용한다. 새 Linux/WSL 체크아웃에서는 lockfile 기준으로 설치한다. WSL 사용 시 Linux 홈 아래에 복제하고 Windows의 `node_modules`를 공유하거나 덮어쓰지 않는다.

```bash
npm ci
npm ci --prefix functions
npm run type-check
npm run dev:webpack
```

개발 주소는 `http://localhost:3002`다. `npm run dev`도 같은 포트를 사용한다. 이 프로젝트의 기존 개발 환경은 webpack 명령으로 검증한다. 3000 포트는 다른 프로젝트가 사용하므로 변경하지 않는다.

## 별도로 필요한 로컬 설정

`.env`, `.env.local`, 서비스 계정 파일 및 인증 세션은 Git에 포함되지 않는다. 새 컴퓨터에서는 해당 프로젝트의 승인된 로컬 설정을 별도로 준비해야 한다. 저장소만 pull한 상태에서 모든 인증·서버 API가 즉시 동작한다고 가정하지 않는다.

Firebase 클라이언트 설정은 `src/firebase/config.ts`가 정본이다. 필요한 변수 이름은 다음과 같다. 실제 값은 이 문서나 Git에 넣지 않는다.

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_DATABASE_ID`: 이 프로젝트의 값은 `pppp`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`: Analytics를 사용하는 경우

서버 API의 Admin SDK 인증은 `src/lib/firebase-admin.ts`가 정본이다. 해당 컴퓨터에서 승인된 서비스 계정 경로나 Application Default Credentials 등 기존 방식으로 설정한다. 유료 AI 기능의 자격증명도 Git 외부에서 관리한다.

## 이번 변경과 검증 기록

- 회사 소개의 연혁을 대표소개서의 `연혁도` 탭으로 이동했다.
- 연혁 데이터 파일, 9개 시기별 장면, 키보드 이동·동작 줄이기·모바일 회귀 검사를 함께 포함했다.
- 통합 담당자가 전체 커밋·서버 검증을 소유하며, QA 담당자는 5개 변경 파일을 읽기 전용으로 감사했다. package/lockfile과 앱 소스의 추가 수정은 하지 않았다.
- 원본의 커밋 대상 1,260개 파일을 격리 Linux 사본으로 복사했다. 현재 개발서버의 `src`, `public`, `scripts`는 이 사본과 SHA-256 기준으로 일치했다.
- `npm run type-check`, `npm run lint`, `npm test`, `npm run build` exit 0. 정적 페이지 52개를 생성했다. 린트 오류는 0개이며 기존 경고 3개는 유지된다.
- 새 정적 빌드의 `verify-corp-pages.mjs`가 기업 화면 5개 × PC·390px 모바일에서 통과했다. 새 연혁의 9개 장면, 시기 이동, 키보드 조작, 탭 전환, 동작 줄이기, 가로 넘침 및 삭제 경로의 HTTP 404를 포함한다.
- 실제 개발서버 `http://localhost:3002`에서 변경된 연혁·회사 소개의 PC·모바일 검사를 통과했고 해당 화면의 런타임 오류는 없었다. 모바일 캡처도 직접 확인했다.
- 개발서버 전체 기업 검사에는 별도 한계가 있다. 삭제된 `/corp/project`는 404 화면을 표시하지만 HTTP 200을 반환하고, 해당 경로에서 `Performance.measure`의 음수 타임스탬프 오류가 관찰됐다. 이 때문에 개발서버의 전체 묶음 검사는 통과로 기록하지 않는다. 새 정적 빌드의 같은 경로는 HTTP 404 검사에 통과했다.
- 검증은 앱·Functions lockfile이 같은 기존 Linux 의존성 런타임을 재사용했다. 이번 작업에서 새 컴퓨터의 `npm ci`나 실제 로그인·유료 API 호출을 검사하지는 않았다.
- 로컬 상세 증거는 Git에서 제외된 `output/development-sync-20261113/`에 보관한다.

공개 Firebase Hosting 배포와 운영 데이터 변경은 이 개발서버 인계 범위에 포함하지 않는다.
