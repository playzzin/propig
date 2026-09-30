# 조밀한 사이드바와 모드 홈 링크

## UI 계약

- 접기/펼치기 컨트롤은 브랜드 영역 첫 번째 DOM 요소로 상단 좌측에 배치한다. 접힌 데스크톱 폭은 56px(기존 80px)이며 버튼 아래 홈 로고를 세로 배치해 겹침을 피한다. 펼친 폭 252px와 모바일 drawer 폭은 보존한다.
- 브라우저 회귀에서 실제 56px 폭, 상단 좌측 좌표, 로고와 버튼 비중첩을 추가 검증한다.

- 데스크톱 메뉴 행 36px, 글자 13px, 아이콘 15px, 목록 간격 2px. 기존 48px대 행·14.72px 글자·18.4px 아이콘·6px 간격보다 조밀하게 표시한다.
- 모바일 행은 유형에 따라 44~50px로 터치 영역을 유지한다. 글자·아이콘·목록 간격은 데스크톱과 동일하다.
- Sidebar 로고와 모바일 Header 로고는 `getSiteHomePath(currentSite, siteData)`로 해당 모드 홈에 이동한다. 접기/펼치기/모바일 닫기는 별도 버튼이다.
- 일반 클릭은 취소 가능한 `propig:before-navigation` 계약을 유지하며, Ctrl/Cmd 새 탭 동작은 현재 화면을 변경하지 않는다.
- 권한 필터·모드 격리·메뉴 데이터·스크롤 정책은 변경하지 않는다.

## 검증

`CHROME_PATH=<chromium> npm run verify:sidebar-refinement`

1440px·390px 브라우저에서 computed 크기, 간격, 접기/펼치기, 취소된 이동, 로고 홈 이동, 모바일 터치 영역, 중첩 interactive 요소 부재, overflow·pageerror를 검사한다. 기업·propig·블로그 홈 이동을 확인한다. 기존 release-browser 명령에도 연결했다.

최종 Next production build 및 build 내 TypeScript 통과. Sidebar/Header ESLint와 기존 메뉴 회귀 통과. 신규 production 서버에서 검사와 데스크톱·모바일 screenshot 시각 확인 완료. 실제 관리자 계정·커스텀 사이트별 로고 자산을 전량 검사한 것은 아니다. 운영 배포/원격 메뉴 저장은 하지 않는다.

## 개발 환경 주의

WSL watcher가 TSX만 갱신하고 기존 CSS를 제공할 수 있다. source의 13px와 CSSOM의 0.92rem이 다르면 specificity override를 추가하지 말고 fresh dist로 재검증한다. 다른 dist를 사용해도 Next dev/build가 같은 tsconfig.json을 자동 수정하므로 최초 시작은 직렬화한다.
