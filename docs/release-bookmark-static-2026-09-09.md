# 북마크·정적 빌드 후속 운영 릴리스

## 승인과 범위

사용자의 “작업하면 커밋푸시 배포까지 다해줘” 요청으로 이번 누적 변경의 커밋·푸시·배포를 수행했다. 이전 감사 문서의 미게시 상태는 각 감사 당시의 기록이며, 이 문서가 후속 게시 결과다.

- 배포 코드 커밋: `c31a805ae8318a04ba2803d5c06eb91d23aebdb2`
- 브랜치: `codex/add-founding-background-to-introduction` (main 병합 아님)
- 프로젝트: `propig-63524`
- 운영 URL: https://propig-63524.web.app
- 확인일: 2026-09-09
- 범위: Firebase Hosting 및 현재 소스의 기존 Functions 16개. Rules/indexes 변경, 구형 함수 삭제, 유료 AI 테스트, 인증 변경은 포함하지 않았다.

## 실행 근거

- 최신 원본 src/functions/src/public 501개 파일과 Linux 검증 환경의 내용 일치.
- 비밀정보 파일 제외 및 정적 public 산출물 경계 확인. 감사한 25개 파일만 코드 커밋.
- `verify:release-static` PASS. root 및 Functions npm audit 취약점 각각 0.
- Git push 성공 및 로컬/원격 코드 커밋 일치 확인.
- Firebase targeted deploy exit 0. Hosting release complete 및 Functions 16개 각각 Successful update operation 확인.
- 배포 후 API 조회에서 대상 함수 16개 모두 ACTIVE, 16개 모두 배포 hash 변경 확인.
- 현재 소스에 없는 기존 함수 10개는 삭제하지 않고 보존. 이 함수들의 의존성이나 실행 중 작업 안전성을 이번 검증으로 보증하지 않는다.
- 운영 `/corp`, `/blog`, `/propig`, `/admin`, `/bookmarks` HTML SHA-256이 검증한 로컬 정적 산출물과 각각 일치.
- 운영 4모드 × desktop/mobile: APK 클릭·다운로드·실제 bytes/hash·아이콘 decode·overflow 검사 PASS.
- 운영 guest store 설치/제거/reload, 모달 초기 포커스/Tab/Shift+Tab/Escape/닫기/포커스 복귀, dashboard/habit/bucket 화면 및 공개 shell 검사 PASS. 격리 브라우저 로컬 저장소만 사용.

## 남은 한계

- Functions sharp 패치는 이번 현재 함수 배포에 반영했다. 구형 보존 함수의 sharp 사용 여부나 의존성 상태는 별도 감사 대상이다.
- ACTIVE 및 deployment hash 확인은 배포 완료 증거이며 모든 유료/인증 기능의 운영 E2E 성공을 뜻하지 않는다.
- 실제 사용자 로그인, Firestore 동시성, 유료 AI 생성, Android 기기 설치/첫 실행은 미검증이다.
- 이번 운영 검증은 GitHub Actions 원격 실행 검증과 별개다.
- 격리 빌드의 강제 종료 시 두 rename 사이 수동 복구 한계는 `followup-modal-static-release.md`에 기록했다.

## 로컬 증거

`/tmp/propig-publish-deploy.log`, `/tmp/propig-publish-production-browser.log`, `/tmp/propig-publish-production-evidence.json`, `/tmp/propig-publish-static.log`, `/tmp/propig-publish-audit-{root,functions}.json`.

배포 전후 Functions 원본 응답에는 런타임 설정이 포함될 수 있어 제한 권한의 임시 파일로만 보존하며 저장소에 포함하지 않는다.
