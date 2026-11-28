# ProPig 스토어 습관 위젯 1차 인계

Windows의 기존 Store 제품 ID는 `9P80XDSKT26X`, 패키지 이름은 `heddun.ProPig`다. 1.4.1.0부터 Windows 창과 MSIX의 제품 표시 이름은 이 제품에 추가 예약한 **그뚠뎃**이다. 한국어 Store 등록 정보에서 같은 이름을 선택한다. 비공개 설치와 업데이트에는 기존 **ProPig Windows 비공개 테스트** 그룹을 사용한다.

## 제품과 데이터

- Windows 11 x64 앱은 MSIX와 .NET 10 LTS를 사용한다. 앱 본창에서 WebView2로 웹과 같은 기록·통계·관리 화면을 연다. 바탕화면 위젯은 오늘 완료 개수, 카테고리 순서·색상, 항목별 진행률, ‘박스 체크’를 표시하며 선택한 체크형 습관을 최대 다섯 개 표시한다. 작은 창에서도 제목과 완료 현황, 하단 조작 버튼이 고정되고 가운데 습관 목록만 스크롤된다. 표시줄을 끌어 옮기고 테두리나 오른쪽 아래 모서리를 끌어 크기를 조절한다. 표시줄 버튼으로 최대화하거나 이전 크기로 복원한다. 위젯 위치·크기·표시 습관은 기기에 저장한다.
- Android 앱은 기존 Firebase Android 등록 `com.propig.app`을 쓰는 독립 Gradle 프로젝트다. 앱에서 Google 로그인, 체크, 위젯 항목 선택을 제공한다. 홈 화면 위젯은 체크를 Firebase SDK로 기록하며 앱이 열려 있을 때 기록 변경을 반영한다. 홈 화면의 새로고침과 런처 주기 갱신도 사용한다.
- 웹 트래커와 대시보드, 두 앱은 `pppp/users/{uid}/habitTracker/workspace`를 사용한다. 기록 쓰기는 날짜·습관·필드 단위다. 웹과 Windows의 기록 기본 보기와 통계 기본 기간은 같은 문서의 `viewPreferences`에 필드별로 저장된다. Firestore 규칙 변경은 필요하지 않다.
- Windows는 시스템 브라우저의 `/habit-tracker/connect`에서 연결할 계정을 표시하고 사용자 승인을 받는다. Windows 앱은 루프백 콜백으로 받은 일회용 코드와 PKCE 검증값을 교환하고 Firebase 갱신 토큰을 Windows 사용자 범위 DPAPI로 보관한다. 본창의 `/habit-tracker/desktop`에는 같은 계정의 별도 Firebase 세션을 열고 브라우저 메모리에서만 유지한다. 이전 앱 버전에서 연결한 계정은 본창을 처음 사용할 때 연결을 한 번 다시 승인한다. 로그아웃하면 앱과 위젯에서 기록을 지운다.

## Windows ProPig 통합 본창

- 기존 Windows 앱이 `/propig/desktop`에서 홈·상점·습관 트래커·메모장(목록·스티커)·할일 일정표를 연다. 상점의 등록과 메뉴 순서는 웹과 같은 계정 설정을 사용한다. 등록된 버킷리스트와 계산기는 현재 기본 브라우저에서 연다.
- 바탕화면 메모와 할일 위젯은 각각 `/propig/desktop/memo`, `/propig/desktop/todo`를 열고 동일한 ProPig 계정으로 연결한다. 각 창은 크기·위치·항상 위 설정을 기기에 저장한다. 메모 위젯은 고정·최근 메모, 빠른 작성과 텍스트 편집을 제공한다. 할일 위젯은 오늘 일정과 상시 할 일을 표시하고 새 할 일 추가와 회차별 체크를 제공한다.
- 메모는 한 메모 문서의 본문만 편집하고, 다른 곳에서 같은 메모를 고친 경우 초안을 유지하고 충돌을 표시한다. 할 일은 개별 문서의 완료 날짜에 원자적으로 반영한다. 저장과 동기화는 기존 API와 Firestore 규칙을 사용한다. 메모 낙서장은 웹 브라우저 장치 저장을 사용한다.
- 새 Windows 패키지를 사용하려면 통합 본창과 두 위젯 경로를 Hosting에 함께 게시한다. 이전 Windows 패키지는 기존 `/habit-tracker/desktop`을 계속 사용한다. 배포 전 동시 저장 검증은 `FIRESTORE_EMULATOR_HOST=127.0.0.1:8191 node scripts/verify-propig-windows-sync-emulator.mjs`로 실행한다. 테스트 프로젝트는 `demo-propig-desktop`이다.

## 패키지와 비공개 테스트 조건

Windows 앱을 설치한 뒤 처음 실행하면 현재 사용자의 바탕화면에 ‘ProPig 습관’ 바로가기가 생긴다. 바로가기는 설치된 앱의 ID로 실행하므로 MSIX 버전이 바뀌어도 사용할 수 있다. 지운 바로가기는 앱의 ‘바탕화면 바로가기 만들기’에서 다시 만들 수 있다.

1. GitHub Actions의 **Habit store packages**가 Windows MSIX와 Android AAB 및 디버그 APK를 만든다. CI의 기본 Windows 패키지 ID는 개발용이고, Android AAB는 서명하기 전 상태다.
2. Microsoft Partner Center에서 실제 앱 ID와 Publisher를 확인하고 `HABIT_WINDOWS_PACKAGE_NAME`, `HABIT_WINDOWS_PUBLISHER`에 지정한다. 해당 ID로 만든 MSIX를 비공개 대상 제출에 사용한다.
3. Google Play의 기존 앱 ID와 업로드 키 보유 여부를 확인한다. `HABIT_ANDROID_KEYSTORE`, `HABIT_ANDROID_STORE_PASSWORD`, `HABIT_ANDROID_KEY_ALIAS`, `HABIT_ANDROID_KEY_PASSWORD`를 승인된 서명 환경에서만 주입한다. 기존 Play 버전이 있으면 더 큰 `HABIT_ANDROID_VERSION_CODE`로 AAB를 빌드하고 내부 테스트에 제출한다. 설치 APK의 Play 앱 서명 인증서가 Firebase OAuth에 등록돼 있어야 한다.
4. `main`의 **Firebase Deploy**는 `asia-northeast3`의 Windows 승인·코드 교환·본창 세션 함수를 배포한다. 비인증 승인과 본창 세션 발급 및 잘못된 코드 교환이 거부되는지 확인한 뒤 Hosting을 게시한다. `redeemHabitDesktopLogin`과 `createHabitDesktopWorkspaceSession` 실행 계정에는 커스텀 토큰 서명에 필요한 `iam.serviceAccounts.signBlob` 권한이 필요하다. 배포 후 기존 ProPig 계정으로 브라우저 연결을 승인하고 웹과 Windows 앱 본창의 기록·통계·관리 화면 및 위젯 체크 동기화를 확인한다.
5. 각 스토어에서 설치한 뒤 같은 사용자 기록을 확인한다. 서로 다른 항목을 웹과 두 위젯에서 각각 체크해 웹에 합쳐지는지, 체크 해제와 로그아웃이 반영되는지 확인한다.

## 검증

- 로컬 Firestore 에뮬레이터에서 `FIRESTORE_EMULATOR_HOST=127.0.0.1:8191 node scripts/verify-habit-store-sync-emulator.mjs`를 실행한다. 프로젝트는 `demo-propig-habit`, 데이터베이스는 `pppp`다. 웹과 Windows 본창의 저장 함수, Android SDK 필드 경로, Windows 위젯의 REST 업데이트 마스크가 동시에 기록과 계정 설정을 쓸 때 과거 기록과 각 변경이 보존되는지 확인한다. 다른 계정의 쓰기 거부도 확인한다.
- 실제 스토어 설치와 운영 계정의 기기 간 왕복 체크는 스토어 게시자 접근, 서명 및 운영 연동 후 확인한다.

## Windows 본창 대시보드

새 Windows 본창은 기존 계정 세션을 복원한 뒤 /propig의 웹 대시보드를 연다. 웹 화면과 Windows 패키지를 함께 검증하고 웹을 먼저 게시한다. 기존 Store 패키지는 계속 /propig/desktop을 사용한다. 위젯 열기, 설정, 바탕화면 바로가기 명령은 본창의 위젯 메뉴에서 제공한다.

## Windows 바탕화면 위젯 관리

본창에서 **위젯 → 위젯 관리**를 선택하거나 Windows 알림 영역의 그뚠뎃 아이콘을 클릭해 관리 창을 연다. 목록을 더블클릭하거나 선택 뒤 **위젯 불러오기 / 위젯 닫기**를 누른다. 트레이 아이콘을 우클릭하면 본창과 같은 체크 표시로 위젯을 열고 닫을 수 있다. 위젯 자체를 우클릭하면 관리 창을 열거나 해당 위젯을 닫을 수 있다. 본창의 닫기 버튼은 트레이로 숨기고, **그뚠뎃 종료**는 열린 목록을 저장한 채 앱을 끝낸다.

기본 위젯은 바탕화면 위에 자리를 잡는다. Windows의 바탕화면 표시 후에도 입력할 수 있고 **항상 위**를 켜면 다른 앱 위에 표시된다. 열림 상태는 이 PC의 ProPig 계정별로 저장하며 비로그인 목록은 별도로 보관한다. 위치와 크기도 이 PC에 저장한다. **위젯 → Windows 로그인 시 위젯 자동 시작**은 설치 시 꺼져 있다. 켜면 로그인 시 본창을 띄우지 않고 열어 둔 위젯을 복원한다. 모두 닫아 둔 경우 트레이에서 시작한다.

REA로 Windows에 설치된 Rainmeter 4.5.28.3936의 한국어 리소스에서 불러오기(2086), 닫기(2087), 스킨 닫기(2059), 바탕 화면 고정(2031)을 식별했다. 같은 릴리스의 관리 창, 위젯 메뉴, 활성 상태 저장 경로를 대조해 동작을 구현했다. [관리 창](https://github.com/rainmeter/rainmeter/blob/v4.5.28.3936/Library/DialogManage.cpp#L1334) · [위젯 메뉴](https://github.com/rainmeter/rainmeter/blob/v4.5.28.3936/Library/ContextMenu.cpp#L335) · [열림 상태 저장](https://github.com/rainmeter/rainmeter/blob/v4.5.28.3936/Library/Rainmeter.cpp#L1185)

Windows CI는 임시 프로필에서 관리 창 열기·닫기, 다른 프로세스에서 위치와 크기 복원, 빈 목록으로 자동 시작을 검증한다. 대화형 Windows 세션에서는 `dotnet run --project apps/habit-windows/checks/WidgetChecks.csproj -c Release -- --desktop-layer-live`로 Explorer 바탕화면 표시, 빈 바탕화면 클릭, 항상 위와 명시적 최소화를 확인할 수 있다. 검증이 끝나면 바탕화면 표시 상태와 포커스를 복구한다.
