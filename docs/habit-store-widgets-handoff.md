# ProPig 스토어 습관 위젯 1차 인계

## 제품과 데이터

- Windows 11 x64 앱은 MSIX와 .NET 10 LTS를 사용한다. 앱과 위젯은 웹의 하루 보기와 같은 ‘오늘의 습관’ 제목, 완료 개수, 카테고리 순서·색상, 항목별 진행률, ‘박스 체크’ 버튼을 표시한다. 위젯에는 선택한 체크형 습관이 다섯 개까지 표시된다. 위젯에서 제목과 완료 현황, 하단 조작 버튼은 고정되고 작은 창에서는 가운데 습관 목록만 스크롤된다. 앱과 위젯에 같은 어두운 스크롤 막대를 사용한다. 표시줄을 끌어 옮기고 테두리나 오른쪽 아래 모서리를 끌어 가로·세로 크기를 조절할 수 있다. 표시줄 버튼으로 최대화하거나 이전 크기로 복원할 수 있다. 위젯을 닫을 때 평상시 위치와 창 크기를 기기에 저장한다.
- Android 앱은 기존 Firebase Android 등록 `com.propig.app`을 쓰는 독립 Gradle 프로젝트다. 앱에서 Google 로그인, 체크, 위젯 항목 선택을 제공한다. 홈 화면 위젯은 체크를 Firebase SDK로 기록하며 앱이 열려 있을 때 기록 변경을 반영한다. 홈 화면의 새로고침과 런처 주기 갱신도 사용한다.
- 웹 트래커와 대시보드, 두 앱은 `pppp/users/{uid}/habitTracker/workspace`를 사용한다. 기록 쓰기는 날짜·습관·필드 단위다. 새 스키마나 Firestore 규칙 배포는 필요하지 않다.
- Windows는 시스템 브라우저의 `/habit-tracker/connect`에서 연결할 계정을 표시하고 사용자 승인을 받는다. Windows 앱은 루프백 콜백을 받으면 승인 전달 화면을 반환하고, 일회용 코드와 PKCE 검증값을 교환한다. 로그인과 목록 불러오기는 앱의 ‘동기화됨’ 표시로 확인한다. 데스크톱 앱은 Firebase 갱신 토큰을 Windows 사용자 범위 DPAPI로 보관한다. 로그아웃하면 앱과 위젯에서 기록을 지운다.

## 패키지와 비공개 테스트 조건

1. GitHub Actions의 **Habit store packages**가 Windows MSIX와 Android AAB 및 디버그 APK를 만든다. CI의 기본 Windows 패키지 ID는 개발용이고, Android AAB는 서명하기 전 상태다.
2. Microsoft Partner Center에서 실제 앱 ID와 Publisher를 확인하고 `HABIT_WINDOWS_PACKAGE_NAME`, `HABIT_WINDOWS_PUBLISHER`에 지정한다. 해당 ID로 만든 MSIX를 비공개 대상 제출에 사용한다.
3. Google Play의 기존 앱 ID와 업로드 키 보유 여부를 확인한다. `HABIT_ANDROID_KEYSTORE`, `HABIT_ANDROID_STORE_PASSWORD`, `HABIT_ANDROID_KEY_ALIAS`, `HABIT_ANDROID_KEY_PASSWORD`를 승인된 서명 환경에서만 주입한다. 기존 Play 버전이 있으면 더 큰 `HABIT_ANDROID_VERSION_CODE`로 AAB를 빌드하고 내부 테스트에 제출한다. 설치 APK의 Play 앱 서명 인증서가 Firebase OAuth에 등록돼 있어야 한다.
4. `main`의 **Firebase Deploy**는 `asia-northeast3`의 Windows 로그인 함수 두 개를 배포하고, 비인증 코드 발급과 잘못된 코드 교환이 거부되는지 확인한 뒤 Hosting을 게시한다. 이 검사는 실제 계정 로그인과 별개다. `redeemHabitDesktopLogin` 실행 계정에는 커스텀 토큰 서명에 필요한 `iam.serviceAccounts.signBlob` 권한이 필요하다. 배포 후 기존 계정으로 앱의 브라우저 연결을 승인하고 웹과 위젯의 동시 편집을 확인한다.
5. 각 스토어에서 설치한 뒤 같은 사용자 기록을 확인한다. 서로 다른 항목을 웹과 두 위젯에서 각각 체크해 웹에 합쳐지는지, 체크 해제와 로그아웃이 반영되는지 확인한다.

## 검증

- 로컬 Firestore 에뮬레이터에서 `FIRESTORE_EMULATOR_HOST=127.0.0.1:8191 node scripts/verify-habit-store-sync-emulator.mjs`를 실행한다. 프로젝트는 `demo-propig-habit`, 데이터베이스는 `pppp`다. 웹의 실제 저장 함수, Android SDK 필드 경로와 Windows REST 업데이트 마스크의 동시 쓰기, 과거 기록, 다른 계정의 쓰기 거부를 검증한다.
- 실제 스토어 설치와 운영 계정의 기기 간 왕복 체크는 스토어 게시자 접근, 서명 및 운영 연동 후 확인한다.
