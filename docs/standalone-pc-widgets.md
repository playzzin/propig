# ProPig 독립형 PC 위젯

Windows 1.3.0.0부터 ProPig가 PC를 직접 측정한다. 바탕화면에서 **ProPig → 위젯**을 열면 된다. 웹에서는 **상점 → PC 위젯**을 연다.

| 위젯 | 데이터 출처와 사용 방법 |
| --- | --- |
| 시계·날씨, 달력 | 웹과 Windows에서 한국 시간을 계산한다. 날씨는 선택한 도시의 독일 기상청 DWD 예보를 Bright Sky로 직접 받는다. 서울이 기본이다. 로그인하면 선택한 도시를 ProPig 계정에 저장한다. 갱신에 실패하면 저장된 예보와 수신 시각을 표시한다. |
| 시스템 정보 | Windows에서 CPU·메모리·커밋 메모리·시스템 드라이브를 측정한다. GPU는 주 디스플레이의 WDDM 드라이버 및 성능 카운터를 사용한다. CPU 온도는 Windows가 CPU로 식별한 온도 영역을 우선 사용한다. 해당 값이 없는 PC는 실행 중인 Core Temp의 공개 센서에서 읽어 섭씨로 표시한다. 여러 값이 있으면 최고 온도를 표시한다. |
| AI 사용량 | Codex는 현재 Windows 사용자가 로그인한 Codex CLI에서 한도, 일별 토큰, 초기화권을 읽는다. Claude Code와 Antigravity CLI는 **연결 설정 → AI 사용량 연결**을 누른 후 각 CLI의 상태줄이 발행한 한도를 표시한다. 이미 사용자 상태줄이 있으면 수동 연결 방법이 표시된다. IDE에서 직접 확인한 Antigravity 잔여량과 Flow 잔액은 **사용량 직접 기록**에 저장할 수 있다. |
| MiraBox | 연결된 Stream Dock XL과 제조사 프로그램의 현재 프로필·페이지를 읽는다. 버튼으로 표시되는 키는 해당 PC에서 확인 후 실행한다. 실행 직전에 배치가 바뀌면 취소한다. 전용 플러그인, 복합 동작, 단축키는 물리 장치에서 사용한다. |
| 바로가기 독 | 웹 서비스는 브라우저에서 열고, Windows 앱과 도구는 설치된 프로그램이나 Windows 셸로 연다. **연결 설정 → 작업 폴더 선택**에서 내 작업 폴더를 지정한다. |
| 국내 증시 | 웹 상점에서 등록하면 내 대시보드에 추가된다. PC 위젯 목록과 Windows의 **위젯 → 국내 증시**에서도 열 수 있다. |

CPU 온도가 비어 있으면 측정할 Windows PC의 CPU 모델을 지원 목록에서 확인하고 Core Temp를 별도로 실행한다. Core Temp가 센서에 접근할 때 Windows가 관리자 승인을 요청할 수 있다. ProPig는 일반 사용자 권한으로 공개된 측정값을 읽는다. 시스템 정보의 **CPU 온도 센서**에서 출처를 확인할 수 있다. [지원 CPU](https://www.alcpu.com/CoreTemp/supportlist.html) · [Core Temp](https://www.alcpu.com/CoreTemp/) · [공개 센서 인터페이스](https://www.alcpu.com/CoreTemp/developers.html)

## 내 PC를 웹에서 보기

Windows 앱에서 기존 계정으로 로그인한 뒤 **위젯 → 시스템 정보 → 연결 설정 → 이 PC를 내 웹에 공유**를 켠다. 같은 계정의 웹에 약 1분마다 새 측정값이 도착한다. PC가 꺼진 뒤에는 마지막 수신 시각을 표시한다. 웹에서 키를 선택하면 해당 PC의 ProPig 앱이 현재 계정과 배치를 대조하고 확인을 받는다.

웹 공유에는 장치별 요약을 사용한다. 공급자의 로그인 정보, 장치 일련번호, 개인 파일 경로, 키에 등록한 URL은 기기 안에서 처리한다. **공유 중지 및 웹 측정값 삭제**는 해당 PC가 보낸 마지막 사본까지 삭제한다.

## 1.2.0.0에서 업데이트

새 수집기는 기존 스킨 설정과 내보내기 파일을 사용하지 않는다. 이전 버전에서 사용자가 Rainmeter에 별도로 설치한 내보내기를 정리하려면 [1.2.0.0 연결 해제 절차](./rainmeter-pc-widgets.md)를 따를 수 있다. 업그레이드 후 새 Windows 측정값이 도착하면 기존 장치의 웹 카드가 전환된다.

## 검증

`npm run verify:pc-widgets`는 한국 날짜 전환, 예보, 계정별 장치, CPU 센서 표시, 주식 등록, 웹·앱 메시지와 키 배치를 검사한다. Windows에서는 `dotnet run --project apps/habit-windows/checks/WidgetChecks.csproj -c Release`로 시스템 API, 온도 단위 변환과 센서 종료, 주식 위젯 실행 경로 및 장치 동작을 확인한다. 실제 CPU 온도와 출처를 서로 다른 측정 시각에 두 번 읽으려면 끝에 `-- --temperature-live`를 붙인다. 다른 공급자까지 확인하려면 `-- --live`를 사용한다.

데이터 계약은 [Codex App Server](https://developers.openai.com/codex/app-server/), [Claude Code 상태줄](https://code.claude.com/docs/en/statusline), [Antigravity CLI 상태줄](https://antigravity.google/docs/cli/statusline), [Windows 디스플레이 성능 데이터](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmthk/ns-d3dkmthk-_d3dkmt_adapter_perfdata), [Bright Sky](https://brightsky.dev/)에서 확인할 수 있다.
