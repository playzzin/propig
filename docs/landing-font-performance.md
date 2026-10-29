# 랜딩 글꼴 전송량 개선

## 변경
- Pretendard 1.3.9 전체 굵기별 정적 글꼴에서 동일 버전 variable dynamic subset으로 변경한다. unicode-range 기반으로 실제 사용 문자를 전송하고 가변 굵기를 공유한다.
- 전역·메모·기업·대시보드의 명시 font-family에 Pretendard Variable을 우선 적용하고 fallback을 보존한다.
- 메모 목록·스티커·낙서장은 각각 선택될 때 dynamic import한다. 데이터 저장/권한/기존 메모에는 변경이 없다.

## 실제 검증
- 동일 로컬 production 서버, 새 브라우저 context, 390px, 비로그인 7초 관찰: Pretendard CSS/글꼴 transferSize 합계 홈 4,717,913→223,262 bytes, 메모 4,717,913→249,082 bytes.
- 빠른 회선의 단일 관찰 LCP는 홈 432→460ms, 메모160→208ms. 이 관찰은 LCP 개선 증거가 아니며 전체 페이지가 95% 빨라졌다고 주장하지 않는다.
- 별도 글꼴만 비교 실험: 개선된 동일 앱에서 기존 전체 글꼴 CSS를 같은 family alias로 대체한 대조군과 subset군을 비교. cache disabled, 390px, latency150ms, down200000B/s, up100000B/s, CPU4배 제한, 각3회. document.fonts.ready 중앙값 34,970.1→9,446.2ms. CSS 대조군은 브라우저 route fulfillment이므로 실제 이전 운영 배포의 전체 로딩 비교가 아니다.
- build/type-check/release-static/release-browser 통과. 메모 보기 PC3종·모바일2종 클릭 회귀 통과. 실사용 로그인 세션이나 사용자 기기 성능은 미측정.
- 재현: 격리 runtime에서 `BASE_URL=http://127.0.0.1:3002 CHROME_PATH=<chromium> LD_LIBRARY_PATH=<libraries> node scripts/verify-landing-fonts-browser.mjs`.
- 외부 font CDN/Font Awesome, Firebase 초기화와 로그인 데이터 구독은 후속 측정 대상이다. 이번 작업이 모든 로딩 원인을 제거하는 것은 아니다.
