# 생활 대시보드 Calm 디자인

## 범위와 기능 보존
- /propig 대시보드 JSX 배치와 scoped styled-components만 변경. 상태/hooks/services/권한/저장/위젯 DnD handler는 유지한다.
- 격자 배경을 청회색 중립 배경으로, 요약부를 둥근 카드로, 통계·입력·위젯 테두리·간격·글자 위계를 정리했다.
- APK 진입점을 삭제하지 않고 위젯 아래로 이동했다. 위젯이 하나면 빈 반쪽 대신 전체 열을 사용한다.
- 360/420ms 일회성 진입 모션, 160ms 컨트롤 전환, 버튼 눌림 피드백. 지속 장식 모션/추가 애니메이션 라이브러리/네트워크 자산 없음.
- reduced-motion에서는 scoped animation/transition을 제거하며 DnD 위치 transform 자체는 제거하지 않는다. active sortable frame과 카드 애니메이션은 별도 요소다. focus ring, 기존 색상 대비·모바일 흐름 보존.

## 검증
- type-check·focused ESLint·production build·release-static·전체 release-browser PASS.
- 새 verify-dashboard-design-browser를 release gate에 연결. 1440/390px×기본/reduced-motion, 4위젯, hide/restore, keyboard reorder/reset, focus-visible, APK까지 scroll, overflow/pageerror 없음 검사.
- DnD keyboard 테스트는 초기 animation 완료, aria-pressed, live region의 목적지 도착을 기다린 뒤 drop한다. 특히 모바일 자동 scroll 도중 즉시 Space를 누르면 원래 위치에 drop할 수 있어 단순 frame 대기는 충분하지 않았다.
- 별도 smart-memo browser(편집/저장/보기·모바일)와 4모드 APK bytes/hash 다운로드 검사 통과.
- desktop/mobile screenshot 픽셀 확인. 실제 활성 dark theme 기준이다. 폐기된 codeit attribute를 수동 주입한 화면을 실제 light-mode 지원/검증으로 주장하지 않는다.

## 배포 경계
- 사용자 이번 디자인의 commit/push/운영 배포 명시 승인.
- Hosting만 게시, 함수/Rules/인증/실회원 원본 데이터 미변경.
- 운영 로그인 사용자의 실제 데이터 편집 테스트는 하지 않는다. local fixture와 운영 smoke 범위는 구분한다.

## 게시 완료
- 코드 8fc53f1 commit/push, Hosting507파일 배포 완료.
- 운영 guest store/modal/dashboard/habit/bucket PC·모바일 회귀 통과, 새 data-dashboard-design=calm 및 실제 화면 확인.
- 운영 APK 검사 첫 실행은 shop 이미지 locator timeout. 독립 shop 진입에서 다운로드 링크/이미지 존재를 확인하고 전체4모드×2폭 재실행 PASS. 일시적 실패 원인은 확정하지 않았다.
- 함수/Rules/인증 변경 없음. 전체 로드맵 완료가 아닌 대시보드 디자인 차수 완료.
