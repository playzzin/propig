# 후속 개선: 북마크 모달과 원본 비변경 정적 릴리스

## 승인·보존 범위
이전 dirty 수정 위에 후속 로컬 개선을 수행한다. Git 게시·운영 배포·실사용자 데이터 쓰기·유료 AI 호출·인증 변경은 포함하지 않는다. 기존 Windows 개발 서버/CY 3000과 사용자의 원본은 보존한다.

## 작업 범위
- AddBookmarkModal/CategoryManagerModal의 자체 분석/저장과 부모 callback await 이후 전역 알림·닫기·초안 갱신을 모달/계정 세션으로 격리한다.
- 카테고리 snapshot 교체가 입력 초안을 초기화하는 경로와 분석 중 새 입력 덮어쓰기를 회귀로 검사한다.
- 원본 API route 임시 rename 빌드를 실행별 staging 빌드로 전환하고 성공한 산출물만 기존 배포 경로에 게시한다.
- CI browser gate를 dev 서버에서 실제 정적 배포 산출물로 변경한다.

## 부모 추가 검증 도구
- `scripts/serve-static-export.mjs`: loopback 전용 정적 QA 서버. exported bytes, Firebase cleanUrls, RSC txt, HEAD, APK MIME 제공. API는 명시적 미지원(읽기 503, 쓰기 405), 운영 proxy 없음.
- `scripts/verify-static-export-server.mjs`: traversal/잘못된 인코딩/dotfile/외부 symlink 차단과 정적 라우팅을 실제 HTTP로 확인. Linux·Windows node.exe 통과.
- `scripts/verify-bookmark-modal-browser.mjs`: 실제 두 모달 React/DOM/styled-components/schema를 esbuild로 묶어 브라우저 실행. 인증·Firestore·분석 transport·부모 저장 callback·toast transport는 명시적 모의 구현. 임의 시간 sleep 대신 요청 대기/DOM 상태로 검증한다. 하위 widget mock만 통과한 것으로 끝내지 않는다.

## 완료 근거
- 모달 실제 React 회귀 78/78 PASS. 헤더/fetch/JSON·부모 CRUD callback의 성공/거부 × SDK 지연/A→B→A/재열기/unmount, 중복 클릭, 편집 revision, 초기화/새 편집기 보존을 검사했다.
- 실제 두 모달 DOM 브라우저 회귀 PASS. 초안 보존, 지연 응답, 정상 분석/저장, 게스트 작업 거부·닫기, 모바일 스크롤 후 제출까지 확인했다. 모의 widget가 아니라 실제 컴포넌트를 렌더링했고 외부 트래픽/페이지 오류는 0이다. 단 인증/IO/toast transport는 mock이다.
- Linux/Windows 모두 정적 서버 HTTP 경계 fixture PASS, staging/게시/강제종료/충돌 fixture 16개 그룹 PASS. fake Next fixture와 실제 빌드의 증거를 구분한다.
- 부모의 실제 staging production build PASS. 실행 전후 원본 src/API/config/package 352개 파일 SHA-256 일치. 기존 정상 export로부터 재실행도 성공했다.
- Firebase 실제 public 경로는 `.next-static-export`다. 처음의 nested export 가정을 실제 산출물과 대조해 교정했다. root/nested/out 형태를 정규화하되 public subtree만 게시하고 compiler/server 부모 폴더를 섞지 않는다. 이전 API rename을 강제하던 deployment-boundary assertion도 새 원본 비변경 계약으로 교체했다.
- `verify:release-static`, focused ESLint, `npm test` 모두 exit 0. 실제 정적 artifact 서버에서 전체 `verify:release-browser` exit 0. APK 4모드·상점·공개 shell·메모·favicon·모드 이동·관리자 격리 저장·기업·Studio 회귀 포함. Studio recoverableBackendWarnings=1은 남으며 유료 요청 0.
- Next 서버 webpack production build도 PASS. QA 정적 서버는 종료하고 `.next-followup-final`의 Next 서버를 WSL 3002에 복원했다. /bookmarks HTTP200 및 계정도구 브라우저 회귀 PASS. 별도 Windows dev 서버/CY는 변경하지 않았다.
- CI YAML의 브라우저 대상 변경과 대응 명령은 로컬에서 검증했다. GitHub Actions 원격 실행·commit/push/deploy는 하지 않았다.
- 로그: `/tmp/propig-followup-{release-static,modal-lifecycle,modal-browser-final,export-recovery-linux,export-recovery-windows,staging-build-final,static-browser-final,server-build-final,next-browser,test}.log`.

## 강제 종료 시 복구 한계·절차
Portable Node의 nonempty directory 교체는 두 번의 rename이므로 게시 순간 전원 차단/SIGKILL의 아주 짧은 구간에서는 canonical output 경로가 비어 있을 수 있다. 마지막 정상 output은 sibling stage의 previous-output과 journal에 보존되지만 무중단/crash-atomic 가용성을 보장하지 않는다.
1. WSL과 Windows 양쪽에서 살아 있는 빌드가 없는지 먼저 확인한다. PID만으로 다른 OS의 생존 여부를 추측하지 않는다.
2. `.static-export.lock`의 JSONL phase/stage/output/backup을 읽고, 실제 같은 프로젝트의 sibling stage인지 확인한다. env 파일 내용은 출력하지 않는다.
3. canonical output이 없을 때만 검증한 previous-output을 원래 경로로 복원한다. 새 사용자 output이 있으면 덮어쓰지 말고 둘 다 보존한다.
4. 복구 검증 후 lock을 백업으로 이동하고 필요한 잔여 stage를 정리한다. stage에는 제한 권한의 env 복사본이 있을 수 있으므로 외부 공유하지 않는다. 먼저 stage를 삭제하면 마지막 정상 산출물을 잃을 수 있다.

## 범위 밖
- 운영 Functions sharp 패치 배포는 별도 승인이 필요하다.
- 같은 UID 다중 탭 습관 workspace 병합, 이미지 pending/uncertain 예약 정산, 운영 Firestore/emulator·실제 provider 검증은 이번 모달/빌드 패치의 해결 범위가 아니다.
- 기존 react-test-renderer 테스트 전체를 교체하지 않는다. 이번에는 실제 DOM 브라우저 모달 회귀를 추가해 모의 widget 검사 공백을 줄인다.
