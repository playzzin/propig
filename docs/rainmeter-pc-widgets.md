# ProPig PC 위젯 이관 계획과 구현 결과

이 문서는 Store 1.2.0.0의 스킨 연동과 그 버전의 연결 해제 절차를 기록한다. 1.3.0.0의 설치와 측정 방식은 [독립형 PC 위젯](./standalone-pc-widgets.md)을 참고한다.

목표는 웹 상점에서 추가한 PC 위젯과 Windows 바탕화면 위젯이 같은 화면과 같은 측정값을 사용하는 것이다. 현재 버전에서는 Windows가 PC별 측정값을 제공하고, 사용자가 웹 공유를 켠 계정에서 그 값을 구독한다.

## 1. 실행 중인 스킨 조사

REA 6.10.1의 관리 어셈블리 정적 검사와 배포된 INI, C#, Lua를 대조했다. 조사 기준은 실행 중인 Rainmeter의 설정에 활성화된 Neon Glass 스킨 6개다.

| 활성 스킨 | 기존 입력과 기능 | ProPig에서 사용하는 방법 |
| --- | --- | --- |
| 시스템 정보 | Windows CPU·메모리·커밋·시스템 드라이브 사용률, ReadHardware의 CPU·GPU 온도와 GPU 사용률 | Windows에서 기본 지표와 모델을 측정한다. 온도·GPU 사용률은 스킨이 측정한 값을 받는다. |
| Clock & Weather | 한국 시간, 설정 지역 Open-Meteo의 현재 날씨·7일 최고/최저·강수 확률, 약 15분 갱신 | 시계는 웹·앱에서 동작한다. 연결된 PC의 예보와 수신 시각을 표시한다. Windows에서 새로 고침을 요청할 수 있다. |
| Calendar | 이전 달, 다음 달, 오늘, 주말과 오늘 강조 | 공용 화면이 한국 날짜를 기준으로 계산한다. PC 공유 없이 사용할 수 있다. |
| AI Usage | Codex·Claude·Antigravity(Gemini)의 잔여량과 리셋, Codex 일별 토큰·리셋 이력·권장 페이스, 수동 Flow 크레딧 | 기존 수집이 끝날 때 허용한 숫자·날짜·상태만 받는다. 연결 대기, 로그인 필요, 측정 누락, 0을 구별한다. 로그인과 수동 값 관리는 기존 도구를 사용한다. |
| MiraBox | 장치·프로필·페이지·8×4 키, 앱/웹/Codex/GitHub 동작, 모니터 선택, 장치 따라가기·고정, 하드웨어 동기화, 상태 타일과 애니메이션 | 공용 화면에 프로필·페이지·전체 키 수와 현재 장치 페이지의 키 종류를 표시한다. 선택한 키는 해당 Windows PC에서 확인한 뒤 실행한다. 프로필·페이지 전환, 모니터·동기화 설정과 원래 타일은 연결된 MiraBox 제어판에서 사용한다. |
| Dock | 브라우저·AI 앱·메신저·탐색기·Drive·작업/다운로드 폴더, AI·MiraBox 패널, 작업 관리자·Windows 설정·작업 표시줄 | 웹 서비스는 브라우저에서 열고, PC 바로가기는 Windows 앱이 고정된 대상에 전달한다. 개인 작업 폴더는 설치된 독 설정에서 읽는다. |

스킨의 크기 조절은 Windows 위젯의 모서리 드래그로 제공한다. 창마다 위치·크기·항상 위를 별도로 보관한다.

REA 증거 식별자 접두어

| 어셈블리 | 식별자 |
| --- | --- |
| ReadHardware | `ev_d5f223215` |
| ReadQuota | `ev_e04a2db89` |
| MiraBox | `ev_d5ae59988` |
| TaskbarControl | `ev_a00f52efe` |
| WidgetSize | `ev_c795eddc1` |

## 2. 공용 화면과 Windows 연결

웹 상점의 **PC 위젯**은 `/propig/pc-widgets`를 연다. Windows **위젯** 메뉴의 여섯 항목은 같은 React 패널을 독립된 창으로 연다. `propig-widgets:` 링크는 설치된 Windows 앱에 전달되며, 독 실행과 MiraBox 키 요청에는 로컬 확인이 필요하다.

1. Windows에서 **위젯 → 시스템 정보 → 연결 설정 → 스킨 연결**을 선택한다.
2. Rainmeter의 시스템, AI Usage, MiraBox, Clock & Weather 스킨을 새로 고침한다. 이후 각 스킨의 기존 수집 완료 시점부터 데이터가 들어온다.
3. 같은 설정에서 **이 PC를 내 웹에 공유**를 선택한다. 웹에서 기존 ProPig 계정으로 로그인해 **상점 → PC 위젯**을 연다. 여러 PC를 연결하면 표시할 PC를 선택할 수 있다.
4. **공유 중지 및 웹 측정값 삭제**는 해당 PC의 전송을 멈추고 마지막 웹 사본을 삭제한다. 오프라인이면 삭제 대기를 저장하고 같은 계정으로 다음 연결 때 재시도한다. **스킨 연결 해제**는 Rainmeter 내보내기 설정을 되돌린다.

소스에서 연결 범위를 확인하려면 `scripts/rainmeter/Connect-ProPigMeasures.ps1 -WhatIf`를 사용한다. 여러 Neon Glass 설치가 있으면 `-SkinRoot`로 사용할 폴더를 선택한다. 설치/해제는 기존 FinishAction과 파일 인코딩, 사용자의 다른 편집을 보존한다.

## 3. 데이터와 조작 경계

- 웹 공유는 PC·계정마다 기본으로 꺼져 있다. Windows 앱이 실행 중인 동안 기기별 마지막 측정값을 약 1분마다 갱신한다. 기존 Firestore 데이터베이스 `pppp`의 `users/{uid}/pcWidgetDevices/{deviceId}`를 사용한다. 계정 소유자와 기존 관리자 규칙이 적용된다. PC 이름 대신 임의의 기기 ID를 사용한다.
- 열려 있는 Windows 위젯은 약 4초마다 로컬 표시를 갱신한다. 날씨는 관측 시각, AI와 센서는 수집 완료 시각을 유지한다. 웹을 새로 열거나 앱의 마지막 수신이 오래된 경우에도 원래 시각을 표시한다.
- Rainmeter와 Microsoft Store 앱은 Windows 사용자 프로필 아래 `.propig/rainmeter`에 있는 네 개의 JSON 파일을 함께 읽는다. 이 위치는 MSIX의 AppData 쓰기 가상화 범위 밖에 있다. 공급자 인증정보, 실행 인수, 파일 경로, 위치 좌표, 개인 키 이름·이미지·MiraBox 실행 지문은 웹에 전송하지 않는다. ProPig가 AI 사용량을 보여주기 위해 유료 모델을 호출하는 경로는 없다.
- MiraBox 키 요청에는 기기 ID, 배치 번호, 0부터 시작하는 키 번호를 사용한다. Windows에서 계정·기기와 키 종류를 확인하고 사용자가 누른 다음, 내보내기 스크립트가 최근 15초의 활성 페이지와 기존 키 지문을 다시 검사한다. 배치가 바뀌면 요청은 만료된다. 웹에서 다른 PC를 보고 있을 때 그 PC의 프로그램을 원격 실행할 수 없다.
- 기존 Stream Dock의 `active`는 키 테스트 모드이고 `transport`는 플러그인과 호스트 사이 연결이다. 물리 장치 연결을 독립적으로 확인할 신호가 없을 때는 ‘기기 연결 미확인’으로 표시한다.

## 4. 검증 및 후속 순서

| 순서 | 검증 대상 | 인수 기준과 현재 범위 |
| --- | --- | --- |
| 1 | 화면과 로컬 센서 | Windows Release 빌드, 웹 타입 검사, 실제 Windows의 CPU·RAM·커밋·디스크 측정, 한국 자정·윤일·수치 0·오래된 값 표시를 확인했다. |
| 2 | 기존 스킨 연결 | 별도 폴더에서 실제 4개 설정 파일의 연결·재연결·해제 후 원본을 대조했다. Lua 5.1에서는 네 가지 입력, 오래된 값, 키 배치 변경, 고정 키 요청과 비활성 키 차단을 테스트한다. |
| 3 | 계정별 웹 공유 | Firestore 에뮬레이터에서 두 기기의 동시 쓰기, 웹 실시간 수신, 타 계정 읽기·쓰기 거부, 한 기기만 공유 해제를 확인했다. |
| 4 | 배포 후 실기기 인수 | 웹과 MSIX를 같은 버전으로 배포한 뒤 기존 PC에서 계정 연결, 실사용 AI 잔여량·날씨 대조, 지정된 안전한 MiraBox 키 1개 및 장치 페이지 전환을 확인한다. 물리 키 실행은 현재 자동 검증에서 모의 대상으로 처리한다. |
| 5 | Rainmeter 없이 사용할 기능 확대 | 실제 장치에서 4단계가 통과하면 날씨 공급 경로, 제공자가 지원하는 AI 사용량 경로, MiraBox의 프로필·디스플레이·물리 입력 순서로 독립 어댑터를 교체한다. 각각 기존 수치·동작과 일치할 때 전환한다. |

화면 검증은 `npm run verify:pc-widgets`, 연결 복원 검증은 `scripts/rainmeter/Test-ProPigMeasures.ps1 -InstallerOnly`로 실행한다. Lua 5.1 실행기를 가진 환경에서는 `-LuaExe <경로>`로 수집과 키 유효성 검사까지 실행한다. 실제 스킨의 사본까지 검사하려면 `-SampleSkinRoot <Neon Glass 폴더>`를 추가한다.

구현에 사용한 공식 계약은 [Rainmeter 명령](https://docs.rainmeter.net/manual/bangs/)과 [Windows 패키지의 프로토콜 활성화](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/desktop-to-uwp-extensions#start-your-application-by-using-a-protocol)에서 확인할 수 있다.
