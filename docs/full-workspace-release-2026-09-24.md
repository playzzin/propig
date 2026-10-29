# 전체 작업 폴더 릴리스

사용자가 2026-09-24 이 작업에서 전체 커밋·푸시·배포를 명시 요청했다. 통합 owner는 Hermes lead다. 유료 생성 제외 지시는 유지한다.

## 범위

- 스토리보드 UX·저장/계정 격리·생성 확인·부분 결과 원본 보호·설정 일괄 적용·기획 프리셋·장면 비교.
- 기업 소개·창업 이야기·캐릭터·직원 협업 화면 및 이미지, 페이지 로딩 지연 복구.
- 독립 Hermes Office 소스·검사·문서. Office는 기존 loopback 앱으로 보존하며 Firebase 공개 웹사이트에 연결하지 않는다.
- 기존 TypeScript 원본에서 생성된 Functions 산출물을 함께 커밋한다. 공개 사이트와 변경된 API인 hostingApi/openRouterUsage가 운영 적용 대상이다. Firebase 규칙·인덱스·사용자 데이터·기존 함수 삭제는 변경하지 않는다.
- 비밀 설정·실제 회사 DB·실행 장부·임시 산출물·작업 식별자는 커밋에서 제외한다.

## 이번 통합에서 발견하고 수정한 문제

- 구형 Pages Router 메뉴를 App Router 방식으로 미리 읽어 `__next._tree.txt`가 404가 됐다. 구형 두 경로는 사전 로딩을 하지 않고 문서 이동을 사용한다. 저장 중 이동 취소 이벤트와 새 탭 제스처를 보존한다.
- Office의 mutable 이동 상태를 효과 안에서 직접 React 상태로 복제하던 부분을 외부 저장소 구독으로 연결했다. 시간 경과 기준을 효과에서 설정하며, 동작·좌석 캐시와 중단/재개 동작을 보존한다.
- 정상 Office 백업의 HTTP 검증이 파생 응답 필드를 영구 DB와 비교해 실패했다. generatedAt·observations·deliveryEvidence만 HTTP 비교에서 제외하고 영구 데이터 해시 전후 비교는 그대로 유지한다.
- 기업 소개 검사에서 이전 문구·섹션 순서·스크린샷 대상을 현재 구현에 맞췄다. 생성된 output 및 격리 빌드 폴더는 소스 lint에서 제외한다.

## 검증

- Linux 격리 소스와 lockfile로 앱·Functions clean install. 기존 운영 설정은 비공개로 사용하고 저장소/로그에 복사하지 않았다.
- 타입 검사, Functions 빌드, 전체 정적 빌드 54페이지, 빌드 전후 배포 경계 PASS.
- `verify:release-static` PASS. 보안·비용·계정·데이터·메뉴·영상 작업 회귀 포함. 실제 유료 공급자는 호출하지 않았다.
- 스토리보드/로딩/독립 앱 경계 focused 검사 28개 PASS. 실제 React 영상 확인 32개 fixture와 로컬 FFmpeg 합성 검사 포함.
- Office Python 합성 검사 84개 및 저장소 검사 38개, 총 122개를 통합 담당이 독립 재실행해 PASS. 정상 비투영 DB 복원과 HTTP/복사본 영구 필드 변조 거부를 포함한다.
- 전체 lint 오류 0. 기존 화면 경고 2개와 Office의 의도적인 층별 manager 재생성 dependency 경고 1개가 남아 있다.
- 실제 정적 산출물에서 스토리보드 1440/390px·키보드 메뉴·엄격한 콘솔 검사 PASS. 네 사이트 corp/blog/propig/admin 1440/390px 가로 넘침·페이지 오류·선정 접근성 규칙 검사 PASS.
- 기업 7페이지 각각 PC·모바일 화면 및 상호작용 PASS. 기업 메뉴 전환 101~419ms 관측(격리 로컬 측정이며 일반 사용자 성능 보장은 아님).
- 공유 메뉴 실제 React/service/handler 회귀와 Office 상태 판정 합성 검사 PASS.
- 대시보드 1440/390px × 기본/동작 줄이기 검사 PASS. 키보드 정렬은 모바일 긴 위젯의 스크롤 단계를 고려하되 목적지 도달·저장·초기화 assertion을 유지했다. 이모티콘 단계 이동·빈 상태·390px 검사도 PASS(유료 요청 0).
- Office 실제 브라우저 8개 시나리오를 통합 담당이 독립 재실행해 PASS. 기본 배치의 안전 경로 없음/좌표 보존, 합성 통로에서 도착 후 자세·정지·재개·검토 대기·390px·접근성·화면 오류를 확인했다. 변경 검증 스크립트의 scoped lint도 PASS.

로그와 임시 파일은 ignored `output/full-release`에 보존한다. 테스트용 공개 설정으로 만든 과거 storyboard-no-cost-static은 배포에 사용하지 않는다. 아래 운영 적용 기록이 최종 배포 여부의 기준이다.

## 한계

실제 유료 생성·공급자 결과 품질·로그인된 운영 계정의 쓰기는 실행하지 않았다. 실제 200% 브라우저 확대 여부는 확증하지 못했으며 반응형 폭 검사와 구분한다. Office의 인터넷 공개/VPS 배포는 포함하지 않는다. Office 기본 방 배치의 일부 경로는 안전 통로가 없어 이동을 보류하고 이유를 표시한다. 이동·정지·재개 검사는 통로가 있는 합성 방 배치에서 구분해 수행한다.

## 운영 적용

- 코드 커밋 `7bbe9acec2618ae22c8d065628494717ead6cc26`, 변경 173개 파일을 기존 `codex/add-founding-background-to-introduction` 브랜치에 푸시했다. 커밋된 제품/설정 파일 780개와 Linux 검증 소스의 차이는 0개다.
- 첫 시도는 API 구성 발견의 기본 10초 제한에서 운영 반영 전에 중단됐다. 설치된 Firebase CLI의 공식 `FUNCTIONS_DISCOVERY_TIMEOUT=60` 설정으로 같은 산출물을 재시도했다. 제품 설정·인증정보를 변경하지 않았다.
- 2026-09-24 06:25:46 KST, `propig-63524`의 Hosting 및 `hostingApi(us-central1)`, `openRouterUsage(us-central1)` 업데이트 성공. Hosting live 버전 `f92230a4ce287512`, 정적 파일 531개다.
- 실제 운영 화면 6개(storyboard·기업소개·대표소개·직원소개·propig·blog)의 HTML SHA-256이 검증 산출물과 일치한다. 연결 JS/CSS 47개 HTTP 200, 새 이미지 2개의 해시도 일치했다.
- 스토리보드 HTML SHA-256: `be80a250ce6c95bd658a378b17a256490a463ca8d2b7e83524b8fa32bba1fd2a`.
- 운영 `/api/admin/check`, `/api/openrouter-usage`, `/api/generate-image` 결과 복구 GET은 미인증 요청에 401 JSON으로 응답했다. 생성 POST와 유료 공급자 요청은 0회다.
- 운영 스토리보드 PC·390px·키보드 메뉴·엄격한 콘솔 검사 PASS. 운영 네 사이트 PC·390px의 가로 넘침·페이지 오류·선정 접근성 규칙 검사 PASS.
- [운영 스토리보드](https://propig-63524.web.app/admin/storyboard). 3002 개발 서버·CY 3000·Office 실제 데이터와 기존 서버는 종료하거나 교체하지 않았다.
