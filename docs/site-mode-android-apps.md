# 사이트 모드별 Android 접속 앱

## 제품 계약
- 기본 4모드 corp→/corp, blog→/blog, shop→/propig, admin→/admin 각각 별도 패키지로 동시 설치 가능.
- 실제 Android APK이며 설치된 아이콘은 기본 브라우저의 운영 HTTPS 홈을 연다. WebView·PWA·오프라인 앱이 아니다.
- 관리자 앱은 웹의 기존 로그인/권한 검사를 그대로 거친다. APK 공개 다운로드가 관리 권한을 주지 않는다.
- 앱은 Android 권한을 요청하지 않고 credential·사용자 데이터·서버 API를 포함하지 않는다. 앱에 외부에서 전달한 URI는 사용하지 않으며 목적지는 컴파일된 고정 문자열이다.
- 기존 메뉴의 모드 전환은 계속 가능하다. 실행 시의 진입 모드만 다르며 모드를 잠그는 앱은 아니다.
- 아이콘은 공개 system_settings/general의 모드별 envFavicons를 읽기 전용으로 받아 512px PNG로 변환한 제작 시점 스냅샷이다. corp/shop은 현재 설정 이미지가 같으므로 임의 변경하지 않았다. 앱 이름/패키지는 다르다.
- 탭 파비콘 변경이 이미 설치된 Android 아이콘을 바꾸지는 않는다. 아이콘 변경은 APK 새 버전 재빌드/업데이트가 필요하다.

## 파일
- `android/site-launcher/LauncherActivity.java`: 기본 브라우저 실행, 브라우저 미설치 시 안내.
- `scripts/build-site-apks.py`: WSL에서 기존 Windows Java/Android SDK를 활용하는 빌드·서명·검증 스크립트. APK 안에 native ABI library나 앱 node dependency 없음.
- `public/downloads/android/`: APK 4개, 아이콘 4개, SHA-256/버전/크기를 가진 manifest.json.
- `src/components/site-home/SiteAppDownload.tsx`: manifest 기반 공통 다운로드 카드. corp/blog/admin 홈과 PropigDashboard에서 명시적으로 모드를 전달하며, admin 비로그인 안내에도 설치 카드만 제공한다.
- `scripts/verify-site-apk-browser.mjs`: 4모드 × desktop/mobile, 실제 다운로드 클릭→저장 bytes/SHA-256 검사, 아이콘 decode, 안내 펼침, overflow/pageerror 회귀. release-browser gate에 연결.

## 재빌드
기존 환경: Windows Android Studio JBR 21, SDK build-tools 36.1.0, android-36 platform. 최소 Android 6.0(API23), target API36.

```bash
python3 scripts/build-site-apks.py --icons /absolute/path/to/512px-png-icons
BASE_URL=http://127.0.0.1:3002 CHROME_PATH=/path/to/chrome npm run verify:site-apk-browser
```

아이콘 디렉터리에 corp.png/blog.png/shop.png/admin.png 필요. 업데이트 전 builder의 versionCode/versionName/출력 파일 버전을 함께 올린다. 재빌드는 출력 APK와 manifest를 교체하므로 검증 후 배포하며, 과거 APK가 필요하면 별도 버전 보존한다.

서명 키와 비밀번호 파일은 저장소 밖 `~/.local/share/propig-android-signing/`에 생성된다. 디렉터리 0700, 파일 0600. 로그/커밋/메시지/공개 폴더에 넣지 않는다. **같은 앱을 업데이트하려면 이 서명 키를 보존해야 한다.** 기존 키나 비밀번호가 한쪽만 있으면 빌드는 중단한다. 키를 임의 재생성하지 말고 개인 백업에서 복원한다.

## 검사 근거와 제한
- 4 APK aapt 패키지/최소 SDK/권한 없음 검사, zipalign, apksigner 서명 검증 PASS.
- 최종 APK의 컴파일된 resources에서 목적지 HTTPS URL 및 배포 manifest SHA-256 일치 PASS.
- 에뮬레이터 설치·실행은 `device unauthorized`로 차단. 인증/기존 AVD를 변경하지 않았으며 읽기 전용으로 실행한 이번 headless 프로세스는 종료했다. **실기기 설치·첫 실행 통과를 주장하지 않는다.**
- 웹 TypeScript/focused ESLint/Next production webpack build/verify:release-static PASS.
- 4모드 × 1366px/390px 실제 다운로드 클릭→APK bytes·SHA-256·이미지 decode·안내·overflow·pageerror 총 8개 PASS.
- public-shell-integrity(지정 axe 범위), account-tools-browser, navigation-performance PASS. 관리자 loading/guest/denied/admin/위임권한 fixture PASS.
- 모바일 corp/admin 스크린샷 직접 확인. APK 포함 최신 빌드를 로컬 3002에서 실행. 기존 CY 3000 미변경.
- 임시 근거: `/tmp/propig-apk-{build-final,web-build,browser,static,public-shell,account-browser,navigation,admin}.log`. 소스 정본과 빌드 사본의 변경 파일을 비교 후 보고한다.
- 운영 배포/Play Store 등록/commit/push는 별도 승인 대상. 이번 APK는 기존 운영 URL을 열지만 새 다운로드 UI는 웹 배포 전 로컬에만 존재한다.
