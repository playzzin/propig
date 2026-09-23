# 이모티콘 스튜디오 잔여 빌드 검증

검증일: 2026-09-24. [구현 인계](./emoticon-studio-implementation-handoff.md)의 전체 빌드 차단을 후속 처리했다.

## 원인과 수정

- `clientOnlyCalls`가 없는 manifest를 검사할 때 TypeError가 나던 부분은 병행 스토리보드 작업의 optional chaining 수정을 보존했다. 그 작업에서 배포 검사·manifest·전체 정적 빌드 소유권을 이 작업으로 인계받았다.
- `/api/history`는 사이트의 누락된 API가 아니라, 별도 Python 서버가 제공하는 Hermes Office API다. Office의 독립 브라우저 entry와 빌드 결과는 각각 `src/components/admin/hermes-office/main.tsx`, `output/hermes-office-web`이며 현재 Next에서 import하지 않는다.
- manifest에 정확한 독립 앱 디렉터리·entry·빌드 스크립트를 기록했다. 검사기는 실제 entry 등록과 전체 `src`의 외부 import 부재를 검증한 뒤 해당 앱만 사이트 API 검사에서 제외한다.
- 사이트의 `/api/history` 호출은 계속 실패한다. 독립 앱을 alias·상대경로·re-export·require·동적 import로 연결하거나 계산된 경로로 경계를 확인할 수 없으면 차단한다. Firebase API 경로를 추가하거나 공개 권한을 변경하지 않았다.

수정 owner는 이 작업의 lead이며 범위는 `scripts/verify-deployment-boundary.mjs`, 신규 `scripts/lib/standalone-client-boundary.mjs`, 신규 `scripts/verify-deployment-client-boundaries.mjs`, `docs/api-runtime-boundary.json`, `SemiAutoEmoticonStudio.tsx`, `scripts/verify-emoticon-studio-complete.mjs` 및 이모티콘 인계 문서다. 보안 담당은 읽기 전용으로 별도 감사했다. Office·스토리보드·공유 화면 코드와 3002 서버는 이 작업에서 수정하지 않았다.

## 배포용 화면에서 추가 발견한 문제

- 완료 알림이 프로젝트 메뉴 위에 겹치고, 버튼을 누르려는 포인터가 알림에 머물러 자동 닫힘까지 멈췄다. 이모티콘 전용 알림을 하단으로 옮겼으며 모바일에서는 하단 주 동작보다 96px 위에 둔다. 닫기 버튼과 별도 알림 접근 키(Alt+E)를 제공하고 다른 화면 알림에는 영향을 주지 않는다.
- 손상 ZIP 검사에서 마지막 레이어 수정의 250ms 자동 저장이 끝나기 전에 기준 값을 읽는 경합을 확인했다. 제품의 ‘저장됨’ 상태를 기다린 뒤 손상 파일 반입 전후를 비교하도록 바꿨다. 기존 프로젝트·원본 보존 assertion은 유지한다.

## 실제 검증

- 배포 경계: 5개 rewrite, 39개 API route, 25개 클라이언트 API 호출 검사 통과. 보안 담당도 별도 재실행했다.
- 실제 검사기를 합성 프로젝트에서 실행하는 회귀 20건 통과. 선택 manifest 필드 부재, 미등록 API, 독립 entry 변경, Next route 제외 금지, 여러 import 경로를 포함한다. 독립 앱이 통째로 없는 소스 체크아웃에서는 제외 디렉터리를 만들지 않으며, entry 또는 빌드만 남아 있으면 계속 차단한다.
- 변경 검사 스크립트 구문 및 ESLint `--no-ignore`: 오류·경고 0.
- `npm run type-check`: 통과.
- `npm run verify:security`: 이미지 요청 무결성 50건, 저장소·생성 인증·분석 비용·HTTP·접근 복구·영상 URL/유료 접근 경계 및 Functions 빌드 통과. 공급자 실제 생성은 실행하지 않았다.
- `npm run verify:static-export`: 타입 검사 경계, 빌드 실패·충돌·복구 16개 합성 그룹, 정적 파일 서버 경계 통과.
- `npm run build`: Windows의 기존 설치본과 격리된 build workspace로 전체 정적 빌드 통과. 54개 페이지 생성, 빌드 전후 배포 경계 검사 통과. 개발 캐시와 원본 설정을 수정하지 않았다.
- 실제 생성된 JavaScript 162개에서 독립 Office의 `/api/history`가 포함되지 않았음을 확인했다.
- 최신 정적 산출물을 별도 loopback 서버에서 열어 4단계 자유 이동·390px 모바일·빈 상태를 검사했다. 앱 오류 0, 유료 요청 0. 테스트 서버에는 운영 API 프록시가 없다.
- 같은 최신 산출물에서 완주 검사 최종 통과: 48프레임 GIF, 24장면·48프레임 ZIP 왕복, 새 프로젝트 생성 시 원본 보존, 보관함 재열기, 연결/잠금/undo/검수/손상 ZIP 보존을 확인했다. 하단 알림 상태에서 프로젝트 버튼을 실제 클릭했으며 앱 오류 0, 유료 요청 0이다. 정적 스트리밍의 숨겨진 초기 HTML 대신 준비 완료된 실제 작업 공간을 파일 반입 대상으로 검증한다.
- 로컬 검증 로그는 ignored `output/emoticon-release/static-browser-final.log`에 있다. 앞선 실패 재현과 최종 PASS를 구분해 보존했다. 외부 CDN·Firestore의 접근 제한 경고는 앱 오류와 별도로 기록했다.

검증 산출물: `C:/Users/playz/propig/.next-static-export/admin/emoticon-studio.html`, 43,059 bytes.
SHA-256: `794e1b5c74e4dac8b196108563bcb12022155dcde79ae99696f2609b1d18d1b8`.

## 적용 범위

배포용 산출물은 현재 작업 폴더의 변경을 포함한 로컬 스냅샷이다. 운영에 업로드하지 않았다. Functions의 실제 인증·유료 공급자 결과는 이번 정적 빌드/합성 검사로 보증하지 않는다. commit, push, 운영 데이터 쓰기, 실제 유료 생성은 실행하지 않았다.

운영 적용 대상은 `.firebaserc`의 `propig-63524`, `firebase.json`의 Hosting 및 `/api/**`를 담당하는 `hostingApi`다. 이모티콘의 화면·결과 복구 API를 함께 적용하려면 두 대상이 모두 필요하다.

## 운영 릴리스 범위

사용자가 2026-09-24 현재 작업의 커밋·GitHub 푸시·배포를 명시 승인했다. 별도 Linux 체크아웃에는 기존 커밋과 이모티콘 관련 수정, 위 배포 경계 수정만 포함한다. 화면 청크 404를 해결한 `RouteProviders.tsx`와 `RouteAppLayout.tsx` 두 공통 수정은 소유자로부터 함께 인계받았다. 스토리보드·기업 화면·독립 Office의 미커밋 변경은 포함하지 않는다. 실제 유료 생성은 실행하지 않는다. 다음 운영 검증 기록이 이전 로컬 스냅샷 결과와 배포 여부를 구분한다.

### 커밋 대상 소스의 운영 빌드 검증

- Git index의 27개 변경 파일과 기존 HEAD로만 별도 소스를 구성했다. Linux Node 22.23.2에서 앱·Functions 각각 lockfile clean install, 전체 타입 검사, Functions 빌드, 정적 사이트 빌드가 통과했다. 운영용 기존 환경 설정을 비공개로 사용했고 저장소에는 포함하지 않았다.
- 해당 소스의 상태 7건·작업 복구 47건·배포 경계 20건, 보안 검사(이미지 요청 50건 포함), 정적 빌드 복구 16개 그룹과 route-shell 검사가 통과했다. 변경 UI·공통 wrapper·새 경계 검사 ESLint도 통과했다.
- Linux 빌드 산출물에서 이모티콘 자유 이동 및 전체 완주 검사 통과(앱 오류 0, 유료 요청 0). 24장면·48프레임 백업 왕복, 원본 보존, GIF, 손상 ZIP 복구를 실제 브라우저에서 확인했다.
- 네 사이트 corp/blog/propig/admin을 1440px·390px에서 검사했다. 가로 넘침·페이지 오류·검사 범위의 심각한 접근성 위반 0, 관리자 guest 경계 통과. Windows 검사 도구 미설치 오류 후 Linux clean install 환경에서 동일 산출물 검사에 성공했다.
- 배포 후보 HTML SHA-256: `cc6b7edf65b2421b623603754e659e808388513dfa64555dd0498cb771c7f145`. 로컬 검증 기록은 ignored `output/emoticon-release`에 보존한다.
