# 프로젝트 파일·에이전트 통합관리 워크플로우

## 목적

`/admin/workspace-files`는 프로젝트에 이미 존재하는 Markdown, 운영 지침, Skill, Agent,
Orchestrator 및 Workflow 파일을 발견하고 Firestore의 관리 사본으로 가져와 검토·편집·보관하는
관리자 도구다.

프로젝트 원본, 관리 사본, 실제 실행 런타임을 같은 것으로 취급하지 않는다.

- 프로젝트 원본: 사용자가 브라우저에서 읽기 권한을 허용한 로컬 프로젝트 폴더
- 관리 사본: `managedArtifacts`와 `managedArtifactContents`에 저장된 검토·편집본
- 실행 런타임: Git 검토와 배포를 거쳐 실행되는 `src/agents` 또는 `functions/src/agents`

관리 사본을 저장해도 프로젝트 원본이나 실행 런타임은 자동 변경되지 않는다.

## 기본 사용자 흐름

1. `프로젝트 동기화`에서 프로젝트 루트를 연결한다.
2. 루트 `package.json`과 `name: propig`를 검증한다.
3. 안전 범위만 읽고 SHA-256 카탈로그를 만든다.
4. Firestore 관리본과 비교해 상태를 표시한다.
5. 사용자가 파일별 원본·관리본을 검토하고 적용 항목을 선택한다.
6. 선택 파일을 20개 이하 배치로 순차 적용한다.
7. 적용 결과는 관리 파일 편집기에서 수정·복제·내보내기·휴지통 처리한다.

## 스캔 범위

기본 범위:

- 프로젝트 루트의 Markdown
- `docs/**/*.md`
- `src/agents/**`
- `functions/src/agents/**`
- `functions/src/agentRunner.ts`
- `functions/src/skills/**`

`로컬 .agents 지침 포함`을 켜면 `.agents/**`도 추가한다. 이 범위는 Git에서 제외된 로컬 도구나
외부 Skill을 포함할 수 있으므로 기본 적용 대상으로 간주하지 않고 사용자가 검토한다.

## 변경 상태

- `신규`: 같은 경로의 관리본이 없음
- `동기화됨`: 원본 SHA와 마지막 가져오기 SHA가 같고 관리본 버전도 동일
- `원본 변경`: 원본만 변경됨
- `관리본 변경`: 관리본만 변경됨
- `충돌`: 원본과 관리본이 모두 변경됨
- `기존 관리본`: 같은 경로의 관리본은 있으나 원본 연결 기준점이 없음
- `휴지통`: 같은 경로의 관리본이 휴지통에 있음

`동기화됨` 항목은 다시 쓰지 않는다. `관리본 변경`, `충돌`, `기존 관리본`을 선택하면 원본으로
덮어쓴다는 확인을 한 번 더 받는다.

## 보안과 한도

- 폴더 핸들은 Chromium의 IndexedDB에만 저장하며 파일 원문을 브라우저 저장소나 공개 번들에
  넣지 않는다.
- File System Access API가 없으면 `webkitdirectory` 폴더 선택 방식으로 폴백한다.
- 심볼릭 링크·junction을 따라가지 않는다.
- `.git`, `.agent`, `.codex`, `.claude`, `.firebase`, 빌드·캐시·배포 산출물을 제외한다.
- 서비스 계정, 자격증명, 비밀키, 인증서와 `.env*` 파일을 제외한다.
- 파일당 700 KiB, 스캔당 800개, 전체 25 MiB를 넘지 않는다.
- Firestore 적용은 트랜잭션당 20개 이하, 총 본문 6 MiB 이하로 나눈다.

## 데이터 기준점

프로젝트에서 가져온 관리본은 `origin`에 다음 기준점을 저장한다.

- provider: `local-workspace`
- projectName, path
- sha256, modifiedAt
- importedVersion, syncedAt

일반 편집은 기준점을 보존하고 관리본 버전만 증가시킨다. 프로젝트에서 다시 가져오면 SHA와
가져오기 버전을 새 기준점으로 갱신한다. 관리 경로를 바꾸거나 일반 파일 가져오기로 덮어쓰면
기존 프로젝트 연결을 해제한다.

## 운영 확장

정적 Firebase Hosting은 사용자의 로컬 프로젝트나 비공개 Git 저장소를 서버에서 직접 읽을 수
없다. 운영에서 원격 동기화와 원본 반영이 필요하면 다음 단계로 분리한다.

1. Firebase Function이 GitHub App 권한으로 저장소 tree/blob을 읽는다.
2. 현재 화면과 같은 SHA 기반 검토 세션을 만든다.
3. 반영은 기본 브랜치 직접 쓰기가 아니라 새 브랜치와 Pull Request로 게시한다.
4. CI 타입 검사·테스트·빌드가 통과한 뒤 배포한다.

GitHub 자격증명은 Function Secret Manager에만 보관하고 클라이언트로 전달하지 않는다.
