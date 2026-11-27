# ProPig CPU 사용률 위젯

## Rainmeter 추적

9950X에 설치된 Rainmeter 4.5.28.3936 x64의 Rainmeter.dll을 REA로 열었다. PE import 검사에서 KERNEL32.dll의 GetSystemTimes와 IAT RVA 0x2872d8을 확인했다. DLL SHA-256은 f27a74068ba557b903deaaa3f4941960d3af319a0238d508b863cf0697c42a9d이고 REA 증거 ID는 ev_3b79e3540bbecb6c79e905565acafbb5c57b894c40a8182f129c6319896ec1ff다. REA 네이티브 분석 공급자가 구성되어 있지 않아 교차 참조에는 PE 명령어 확인을 사용했다. 실행 가능 섹션의 RVA 0xae3d5에서 해당 IAT 항목을 간접 호출하며, 호출 직전 세 출력 인수의 주소를 준비하고 직후 반환값을 확인한다.

1. 활성 Neon Glass 스킨은 Update=1000마다 MeasureCpu를 갱신한다. Measure=CPU에서 Processor를 생략해 기본값 0을 사용한다. 기본 illustro System 스킨은 같은 대상을 Processor=0으로 명시한다. [illustro System.ini](https://github.com/rainmeter/rainmeter/blob/v4.5.28.3936/Build/Skins/illustro/System/System.ini)
2. MeasureCPU는 Processor=0이면 GetSystemTimes로 유휴·커널·사용자 누적 시간을 읽는다. 커널 시간에 유휴 시간이 포함되므로 전체 시간의 증분은 Δ커널+Δ사용자다. 사용률은 100 × (1 − Δ유휴 ÷ Δ전체)를 0~100으로 제한한다. Rainmeter에서 Processor가 1 이상이면 동적으로 찾은 NtQuerySystemInformation의 SystemProcessorPerformanceInformation으로 해당 논리 프로세서의 카운터를 읽는다. [Rainmeter MeasureCPU.cpp](https://github.com/rainmeter/rainmeter/blob/v4.5.28.3936/Library/MeasureCPU.cpp) · [Microsoft GetSystemTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getsystemtimes)
3. Skin::Update는 측정값을 갱신한 뒤 미터를 갱신한다. Neon Glass의 MeterCpuUsageValue는 MeasureName=MeasureCpu를 참조하며 StyleUsageValue의 %1%로 표시한다. MeterCpuUsageBar는 같은 측정값을 0~100 범위에 맞춰 채운다. [스킨 갱신](https://github.com/rainmeter/rainmeter/blob/v4.5.28.3936/Library/Skin.cpp) · [문자열 미터](https://github.com/rainmeter/rainmeter/blob/v4.5.28.3936/Library/MeterString.cpp) · [막대 미터](https://github.com/rainmeter/rainmeter/blob/v4.5.28.3936/Library/MeterBar.cpp)

## 적용 계획과 구현

1. Windows의 기존 ProPig 위젯 창과 배치 설정을 재사용한다. 로그인 화면이나 본창의 **위젯 → CPU 위젯 열기**에서 숫자와 막대를 볼 수 있다. **항상 위**와 창 위치를 유지한다.
2. GetSystemTimes의 두 샘플을 약 1초 간격으로 비교한다. 시작·오류 복구·장시간 지연 뒤에는 첫 샘플을 기준점으로 사용한다. 이 방식은 Rainmeter가 첫 샘플에서 초기 누적 사용률을 표시하는 동작과 다르다. Windows에 논리 프로세서가 64개를 넘는 시스템에서는 GetSystemTimes가 호출 스레드의 기본 프로세서 그룹을 집계한다.
3. Windows 위젯에서 **웹에서 보기**를 누르면 IPv4 루프백의 임시 포트에서 읽기 전용 공유가 시작된다. 기본 브라우저의 /propig/cpu는 공유 세션의 연결 정보를 주소에서 지우고 메모리에 유지한다. 브라우저가 요청하면 로컬 네트워크 또는 루프백 연결을 허용한다. 브라우저용 대시보드에도 CPU 사용률 화면으로 가는 링크가 있다. [Chrome 루프백 권한](https://developer.chrome.com/release-notes/145#local-network-access-split-permissions)
4. 공유는 지정된 ProPig 웹 출처와 256비트 연결 키를 확인한다. 응답은 CPU 백분율 또는 측정 대기 값만 포함한다. Windows 위젯을 닫거나 공유를 끄면 연결이 종료된다. CPU 데이터는 같은 PC의 Windows 앱과 브라우저 사이에서 처리한다.
5. 9950X에서 Windows 빌드, 웹 타입·린트, Windows 카운터와 로컬 공유의 연결을 빠르게 검증한다. develop 대상 PR을 열고 GitHub Actions에서 정적 웹 빌드와 Windows MSIX를 검증한다.

## 로컬 검증 범위

- Windows .NET 10 디버그 빌드와 실제 GetSystemTimes 호출을 검증했다. 기준 샘플, 정상 범위, 갱신 지연 시 만료, 허용 출처의 사전 요청, 잘못된 출처·호스트·키·경로·쓰기 요청 거부, 공유 종료를 확인했다.
- Chrome에서 ProPig 운영 출처에 웹 컴포넌트를 테스트로 연결하고, 이 PC의 실제 샘플 서버를 사용했다. 390px에서 표시, URL 조각 제거, 탭 숨김 시 폴링 중단, 공유 종료 후 상태와 재시도를 확인했다. 브라우저 테스트에 루프백 권한을 부여했다. 실제 사용자의 권한 팝업과 배포 주소의 연결은 배포 후 확인한다.
- 웹 타입 검사와 변경 범위 ESLint를 적용했다. 배포와 제품 패키지 검사는 PR의 GitHub Actions 결과를 따른다.
