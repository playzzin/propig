# 제품 소개 인터랙티브 모션 쇼릴 인계

- 요청: 4개 서비스 모션을 고도화하고, 생성형 콘텐츠에서 YouTube·TikTok 영상, 블로그 글, Instagram 웹툰을 클릭해 상품 안에서 직접 감상. 사용자가 브랜드 시연 콘텐츠 사용을 명시적으로 선택함.
- 통합 owner: Hermes `/root`. corp `content_studio_v4`, `service_explorer_v4`; 독립 QA `content_qa_v4`. 정확한 파일 소유권은 `.tmp-product-motion-v4/ownership-plan.json`, Hermes doctor/plan 통과.
- branch: `codex/add-founding-background-to-introduction`.
- 기존 직원소개·대시보드·습관관리·기업 브랜드 및 다른 검증 변경 보존. package/lockfile·서버 포트·API·권한 변경 없음.

## 구현

- 전체 4챕터를 12초씩 48초 반복. 메뉴를 직접 고르면 해당 챕터에 머물며 12초마다 모션을 다시 재생. ‘전체 이어보기’로 전체 쇼릴 복귀.
- 반복 시 콘텐츠 스튜디오와 서비스 선택 상태를 유지. 일시정지·화면 이탈·숨겨진 탭에서 모션과 실제 영상을 정지. OS 동작 줄이기에서는 자동 재생 없이 탐색하며 영상은 명시적 재생만 허용.
- 생성형 콘텐츠는 접근 가능한 채널 탭과 한 개의 넓은 미리보기. YouTube 16:9·TikTok 9:16 네이티브 MP4, 재생/정지·탐색·반복·로딩·오류 재시도, 블로그 본문 내부 스크롤, 기존 브랜드 웹툰 12컷 넘김과 자동/수동 전환.
- 영상 두 개는 로컬 Canvas 프레임과 FFmpeg로 제작한 12초/24fps 무음 브랜드 모션 스터디. 외부 stock·유료 생성 호출 없음. 상품 필름·키네틱 타이포·채널별 화면·장면 전환으로 구성. YouTube용1280×720 약1.24MB, TikTok용720×1280 약1.36MB. 실제 계정에 게시된 콘텐츠라는 주장을 하지 않음.
- 웹·앱: PC 업무 화면 / 휴대폰 연동 / 글로벌 다국어·국제 연결 선택. 신호 이동·연결 반응·접속 알림.
- 업무자동화: 자동 순환 또는 급여·거래 / 계약·발주 / 보고·증명 선택. 전체18종 또는 선택6종이 등장→작성→확인→퇴장 순환. 표·서명·스캔·도장·반응·연결 패킷.
- 파트너: 생성형 판매 / 광고형 판매 선택에 따라 상품·스토어·주문·정산·알림 변화. 가상 매출 수치 없음.
- 이전 요청의 기획 에이전트 제거, 제품 카탈로그24개·실행 체계·카테고리 hash·상담 링크 유지.

## 파일과 재현

- `src/components/corp/ProductMotionShowcase.tsx`: 전체/선택 반복 및 화면 수명주기, 사용자 탐색 유지.
- `src/components/corp/ProductContentStudio.tsx`: 채널 탭과 실제 콘텐츠 플레이어.
- `src/components/corp/ProductServiceExplorer.tsx`: 다른3개 서비스 선택 컨트롤.
- `ProductMotionArtwork.tsx`, `ProductMotionEffects.tsx`, `ProductWebDocumentScenes.tsx`, `ProductContentPartnerScenes.tsx`: SVG 모션 및 선택별 도형.
- `public/videos/corp/product-story-{youtube,tiktok}.{mp4,jpg}`: 시연 영상·포스터.
- `scripts/render-product-demo-media.mjs`: 영상 재생성. 설치 Chromium + ffmpeg-static 사용, `CHROME_PATH`로 브라우저 경로 변경 가능.
- `scripts/verify-product-content-studio.mjs`: 채널 실제 재생·탐색·서비스 선택·반복·접근성·모바일 회귀.
- `scripts/verify-product-motion-browser.mjs`: 새 인터랙티브 검증으로 연결하는 기존 진입점.
- `scripts/verify-product-motion-sequences.mjs`: 문서3배치·도장·퇴장·신호·파트너 컷·동작 설정·포커스·지연 프레임 검증.

## 검증 기록

- `npm run type-check`: exit0.
- 수정 컴포넌트 scoped ESLint, 렌더링/시퀀스 스크립트 `node --check`: 통과.
- `node scripts/render-product-demo-media.mjs`: exit0, 영상/포스터4개 생성 후 포스터 시각 확인.
- `node scripts/verify-product-motion-sequences.mjs`: exit0, 1440px·390px 모두 통과. 결과 `.tmp-product-motion-v4/sequence-results.json` 및 PNG.
- 채널별 브라우저 회귀·최종 build 결과는 아래 최종 검증에 기록.

## 한계

- 시연 콘텐츠이며 실제 문서 발행·판매·정산·채널 게시를 실행하지 않음.
- Chromium 데스크톱/모바일 에뮬레이션을 검증 대상으로 사용. Safari/Firefox·실기기는 미검증.
- 기존 전체 corp-pages 검사는 제품 소개 통과 뒤 별도 직원소개 문구 계약에서 실패한 이력이 있어 이번 범위의 focused 회귀를 사용.
- commit/push/운영 배포·유료 호출 없음.

## 추가 요청 반영

- 업무자동화에 3범주 메뉴를 추가: 서류 자동화(기존18종), 프로그램 연동(세금계산서 발행·급여이체·카카오톡 발송·PG 결제 연결), 브라우저·에이전트(브라우저 자동화·에이전트 봇).
- `ProductAutomationFlowScenes.tsx`: 6종의 다른 시연 프로그램 화면과 0/4/8초 단계, 양방향 통신, 클릭·작성·검토·처리결과 반응. 실제 송금·발행·메시지·결제 요청은 실행하지 않는다.
- exact-file 추가 계획: `.tmp-product-motion-v4/automation-plan.json`. corp `service_explorer_v4`는 메뉴만, `automation_scenes_v5`는 신규SVG만, QA `content_qa_v4`는 신규검증 스크립트만 소유. 부모가 팔레트·레이아웃을 통합.
- 요청된 상단 ‘프로피그 제품·서비스 쇼릴 / 가능성을 설계하고…’ 및 설명·제품 둘러보기 링크 제거. 접근 가능한 작은 PRODUCT SHOWCASE 제목을 프레임 상단에 유지.
- 좌측 설명 영역24~26%, 우측 콘텐츠74~76%로 재배치. 콘텐츠 스튜디오 높이도 너비에 맞춰 확대. 모바일 가로영상의 불필요한 여백 축소.
- Integrated Execution System의 #07101f/#0a1830 네이비 배경과 블루/민트 포인트를 쇼릴·메뉴·SVG에 적용. 기존 콘텐츠 영상과 글·웹툰 내부의 고유 디자인 유지.
- 하단 메뉴를 번호 배지·테두리·선택 진행선·재생 표시·hover/press 반응을 갖춘 버튼으로 재디자인. 재생·이전/다음·전체 이어보기 버튼도44px 이상, 동작줄이기/일시정지 제어 유지.
- `scripts/verify-product-automation-flows.mjs`: 추가6종·기존서류보존·범주선택복원·3단계모션·반복·레이아웃·4채널smoke 검증. 결과 `.tmp-product-motion-v5/`.

## 최종 통합 검증

- 최종 navy/확대 레이아웃 포함 `npm run type-check`: exit0. 제품모션 관련8개 TSX/TS 파일 scoped ESLint: exit0.
- 부모가 `node scripts/verify-product-content-studio.mjs` 재실행: exit0, 1440×1100·390×844. 실제영상metadata/시간진행/정지/탐색/실패복구, 웹툰12컷원본비율·커버, 블로그스크롤, 48초전체반복과12초선택반복, 키보드/동작줄이기/같은hash카탈로그 검증. axe0, runtime/hydration0.
- 부모가 `node scripts/verify-product-automation-flows.mjs` 재실행: exit0, 같은PC·모바일폭. 신규6자동화·3단계등장/퇴장·신호이동/정지·카테고리선택복원·기존18문서·콘텐츠확대·상단제거·4채널smoke. axe0, runtime0, 가로넘침0.
- 독립QA와 부모 모두 최종 PC·모바일 스크린샷을 직접 확인. 웹툰의 공통CSS max-width 충돌·불균등행 crop 및 보조텍스트 대비 오류를 수정해 재확인.
- 추가검증증거: `.tmp-product-motion-v4/content-studio-results.json`, `.tmp-product-motion-v5/automation-flow-results.json`과채널·서비스별PNG.
- 첫 프로덕션 빌드는 webpack 캐시 작성 중 디스크 공간 부족(ENOSPC)으로 실패. 경로와 reparse-point 여부를 확인한 뒤 이 작업의 생성물 `.tmp-product-motion-v2-build`, `v3-build`, 실패한 `v5-build`만 정리해 약3.69GB 공간 확보 후 재시도. 사용자 소스·서버·다른 프로젝트 산출물은 건드리지 않음.
- 재시도 `NEXT_DIST_DIR=.tmp-product-motion-v5-build DISABLE_SENTRY=true next build --webpack`: exit0. 최종컴파일·TypeScript·78개페이지생성 통과. Next가추가한임시 tsconfig include2줄만제거해기존설정복원(diff없음).
- 빌드후 `node .tmp-product-motion-v5/postbuild-smoke.mjs`: exit0. PC/모바일 HTTP200, 4챕터·새에이전트자동화·가로넘침없음·runtime/hydration0. 증거 `.tmp-product-motion-v5/postbuild-smoke-results.json`.
- 최종 `git diff --check`: exit0. commit/push/배포 없음. 모든 leaf 작업 종료 확인.

## 크리에디터·업무 실행 모션 개편

- 사용자가 요청한 표기 `크리에디터`를 쇼릴, 카탈로그, Integrated Execution System에 통일했다. 기존 `partner` / `reseller` ID와 문의 URL은 호환성을 위해 유지한다.
- `ProductCreEditorScene.tsx`는 생성형 콘텐츠 판매(영상·이미지·웹툰 패키지 → 상품 소개 → 주문·파일 전달)와 광고형 리셀러(플랫폼 → 상품 광고 소재 → 상품 링크·고객 반응)를 표시한다.
- 광고형은 네이버스토어·쿠팡파트너스·알리익스프레스·테무를 직접 선택한다. 로고와 조명·헤드폰·카메라·시계 시연 상품, 설명, 신호 경로가 함께 바뀐다. 0/4/8초 단계와 부모의 12초 반복, 선택 유지·정지·동작 줄이기를 사용한다.
- `ProductServiceExplorer.tsx`의 기존 `서류 자동화` 탭을 `업무자동화`로 변경했다. 서류18종·선택6종·기존6개 프로그램/에이전트 시연은 유지한다.
- `ProductWebDocumentScenes.tsx`에 자료 접수·조건 확인·검토 요청·작업 전달 콘솔과 발행·급여·알림·결제·탐색·봇 실행6개 액션을 추가했다. `ProductAutomationFlowScenes.tsx`에는 커서·클릭 파동·결과 수신 알림을 추가했다.
- 모든 화면은 브랜드 시연이며 실제 발행·송금·메시지·결제·제휴 판매를 실행하지 않는다. 신규 의존성, 인증, API, 포트 변경 없음.
- 파일 소유권: `.tmp-product-motion-v6/ownership-plan.json`, `qa-plan.json`을 Hermes 도구로 검사. 장면/업무/카탈로그 담당은 정확한 파일만 수정했고 부모가 통합했다.

### 로고 출처

공식 공개 페이지에서 확인한 원본을 `public/images/corp/commerce/`의 작은 PNG로 저장했다. 실행 중 외부 이미지 요청은 없다.

- 네이버 스마트스토어센터: `https://sell.smartstore.naver.com/images/icon/favicon-192-20180619.png`
- 쿠팡파트너스: 공식 사이트 번들의 `https://partners.coupang.com/static/media/coupang-logo-light.08be469e14e78c3468d3d5f94f9b0e90.svg` — 밝은 배경용 원본이므로 흰 배지에 표시.
- AliExpress: 공식 홈페이지 og:image `https://ae-pic-a1.aliexpress-media.com/kf/Sa0202ec8a96a4085962acfc27e9ffd04F/1080x1080.jpg`
- TEMU: `https://www.temu.com/sg/about_temu_home.html`의 Brand assets / TEMU.png → `https://aimg.kwcdn.com/upload_aimg/personal/41c8132e-1ccf-4465-9e6a-dacb95ec8205.png.slim.png`

### 검증 진입점

- `scripts/verify-product-creeditor.mjs`: 두 판매 방식, 4개 로고/상품/설명, 단계별 모션, 신호, 정지, 선택 유지, 12초 반복, 키보드, 동작 줄이기, PC/모바일, axe와 런타임 검사.
- 기존 콘텐츠/자동화 검증은 새 표기에 맞췄고, 자동화 검증에는 업무 액션10개와 단계별 확인을 추가했다.
- SSR 버튼이 React 준비 이전에 클릭되던 검증 경합은 `data-running`이 활성화된 뒤 검사하도록 명시적인 준비 상태 대기로 수정했다. 사용자 동작 검증 자체는 유지한다.

### 개편 최종 검증

- 부모 `npm run type-check` 및 변경8개 컴포넌트 scoped ESLint exit0. 검사 스크립트4개 `node --check` 통과.
- 부모 `verify-product-content-studio.mjs`, `verify-product-automation-flows.mjs`, `verify-product-motion-sequences.mjs`, `verify-product-creeditor.mjs` 모두 최종 exit0. 데스크톱1440×1100/모바일390×844, axe0, 런타임·hydration0, 가로넘침0.
- 시퀀스 지연 프레임 검사는 재생 재개 후 RAF 기준 프레임2개를 기다린 뒤1.1초 지연을 주도록 검사 경합을 보완했다. 최종 clock증가 약1116ms로 지연을 실제 반영함을 확인했다.
- 독립 QA와 부모가 크리에디터 4플랫폼의 로고·상품별 PNG 및 업무 결과 수신 장면을 직접 확인했다. 결과: `.tmp-product-motion-v6/creeditor-results.json`, 기존 v4 콘텐츠/시퀀스 결과, v5 자동화 결과.
- 기존 격리 출력 재사용: `NEXT_DIST_DIR=.tmp-product-motion-v5-build DISABLE_SENTRY=true next build --webpack` exit0. 컴파일·TypeScript·정적페이지78개 생성 통과. 자동추가된 tsconfig include2줄만 제거하여 diff없음.
- `.tmp-product-motion-v6/postbuild-smoke.mjs` exit0. PC/모바일 HTTP200, 서류18종·업무 실행, 크리에디터4플랫폼, 카탈로그 상담 링크 및 통합실행5단계 탭 확인. 결과 `postbuild-smoke-results.json`.
- 최종 `git diff --check` 통과. 서버3002 유지, 다른 dirty변경 보존, commit/push/배포·유료API·실제 거래 없음. Safari/Firefox·실기기는 미검증.

## 상세 메뉴 전체 순차 재생 (2026-10-23)

- 기존 4개 대분류 순환을 21개 상세 장면의 연속 재생으로 변경했다. 정본 순서는 `ProductShowreelSequence.ts`에 정의한다.
- PC 웹 → 모바일 웹 → 글로벌 연결 → 급여·거래 → 계약·발주 → 보고·증명 → 세금계산서 발행 → 급여이체 → 카카오톡 발송 → PG 결제 연결 → 브라우저 자동화 → 에이전트 봇 → YouTube → TikTok → 블로그 → Instagram 웹툰 → 생성형 콘텐츠 판매 → 네이버스토어 → 쿠팡파트너스 → 알리익스프레스 → 테무 → 처음으로 이어진다.
- 일반 장면은 12초, 블로그는 본문 자동 스크롤과 마지막 문단 확인을 위해 24초, 웹툰은 12컷을 4초씩 보여주도록 48초다. 전체 재생 시간은 300초이며 화면 밖·백그라운드·일시정지 시간은 포함하지 않는다. 긴 foreground 프레임에서도 중간 장면을 건너뛰지 않는다.
- 현재 장면·다음 장면·장면별 시간·전체 진행률·21단계 번호를 표시한다. 이전/다음 버튼은 상세 장면 단위로 이동하며, 대분류/하위 메뉴를 선택해도 전체 이어보기 모드를 유지한다. `현재 장면 반복`을 직접 누를 때만 반복한다.
- `ProductServiceExplorer`와 `ProductContentStudio`가 부모의 장면 선택을 받아 탭·서류·프로그램·판매 플랫폼을 함께 갱신한다. 기존 18종 서류 자동 순환은 직접 선택 메뉴로 유지한다. 블로그·영상·웹툰의 직접 조작 시에는 읽기/탐색을 위해 멈춘다.
- 정확한 파일 소유권은 `.tmp-product-motion-v7/ownership-plan.json`으로 검사했다. 부모는 시퀀스/쇼케이스/통합, 자식은 두 하위 컴포넌트, QA는 검증 스크립트 5개를 담당했다. 완료 후 부모가 모든 검사를 직접 재실행했다.

### 순차 재생 검증

- `npm run type-check` exit0, 변경4개 컴포넌트 scoped ESLint exit0, 검증 스크립트5개 `node --check` 통과.
- 부모가 `verify-product-showreel-sequence.mjs` 최종 실행: PC1440×1100·모바일390×844에서 21단계 전체와 첫 장면 복귀, 웹툰12컷, 60초 지연 프레임 시 단계 생략 방지, 선택 후 이어보기, 명시적 반복, 키보드, 정지/재개, 화면 이탈, 동작 줄이기 모두 PASS. axe·런타임·hydration 오류0, 가로넘침0.
- 실제 RAF 자동 전환도 별도 확인: 첫 3회 전환은 12.127초 / 24.142초 / 36.246초. 가속 시간 검사는 라우팅·상태를 검사하며 CSS/네이티브 영상 검증은 실제 시간 회귀로 분리했다. 증거 `.tmp-product-motion-v7/showreel-sequence-results.json` 및 PC·모바일 PNG.
- 부모가 기존 `verify-product-content-studio.mjs`, `verify-product-automation-flows.mjs`, `verify-product-creeditor.mjs`, `verify-product-motion-sequences.mjs`를 모두 재실행하여 exit0. 실제 MP4·seek·실패 복구·블로그·웹툰·서류18종·업무 액션·4플랫폼·등장/퇴장/통신·정지/반복 회귀 통과.
- QA에서 발견한 전체 진행률의 ARIA 역할 누락을 `progressbar`와 min/max/now/valuetext로 수정했다. 최초 SSR 버튼 클릭의 준비 상태 경합과 실제 시간 측정 기준점도 보완한 뒤 최종 재검증했다.
- 빌드 공간 확보를 위해 경로와 reparse-point를 검증하고 이 작업의 이전 생성물 `.tmp-product-motion-build`, `.tmp-product-motion-build-final`, `.tmp-product-motion-v5-build/cache`만 정리했다. 사용자 소스·다른 작업 산출물·개발 서버 출력은 보존했다.
- 최종 `NEXT_DIST_DIR=.tmp-product-motion-v5-build DISABLE_SENTRY=true next build --webpack` exit0: 컴파일·TypeScript·정적페이지78개 생성 완료. Next가 자동 추가한 임시 tsconfig include2줄만 제거했으며 tsconfig diff없음.
- `.tmp-product-motion-v7/postbuild-smoke.mjs` exit0: PC·모바일 HTTP200, 현재/다음 장면·300초 진행률, 고유6종 서류 및 전체18종 선택, 크리에디터4플랫폼, 카탈로그 상담 링크·통합실행 탭 정상. 고유6종의 세 차례 모션 반복 DOM은 종류의 중복을 제거하여 검사한다.
- 최종 `git diff --check` 통과. Chrome의 PC·모바일 뷰포트에서 검증했으며 Safari/Firefox·실기기는 미검증이다. 개발 서버3002를 유지했고 commit/push/배포·실제 발행/이체/메시지/결제 호출은 없다.

## 운영 배포 (2026-10-23)

- 사용자의 후속 요청 `배포해줘`로 이 제품 소개 변경의 운영 배포 승인을 받았다.
- 현재 소스에는 다른 작업의 미배포 변경도 있어 기존 운영 Hosting 산출물을 기준으로 제품 소개 경로만 교체했다. Firebase API의 현재 릴리스 `5e888d58282b703e` 파일 해시와 기존 공개 파일519개가 모두 일치함을 배포 직전에 확인했다. Firebase가 생성하는 init.js/init.json 두 파일은 별도다.
- 현재 lockfile과 일치하는 기존 Linux 의존성을 사용한 격리 snapshot에서 `npm run build` exit0. static export 경계 검사·컴파일·TypeScript·정적 생성 통과. 호스트 디스크를 위해 snapshot의 webpack 영속 캐시만 비활성화했고 제품 설정은 수정하지 않았다.
- 제품 소개 HTML·RSC 파일5개와 참조하는 JS/CSS·4개 로고·MP4/포스터를 반영했다. 새 build ID `0-4GIyWJwfxzdVj-q4Idu`를 유지하고, 기존 동일 URL의 다른 바이트 자산은 차단했다. 제품 소개 외 기존 파일514개는 해시를 그대로 보존했다. 준비된 공개 파일은540개다.
- 독립 읽기 전용 감사에서 Next16의 build ID 불일치 시 문서 전체 이동 경계를 확인했다. 새/기존 빌드의 양방향 페이지 이동·뒤로/앞으로·새로고침을 실제 Chrome에서 검증했으며 JS/ChunkLoad/hydration 오류·누락 자산0이다.
- 후보에서 `verify-product-showreel-sequence.mjs` PC·모바일21단계·300초·12웹툰컷·반복·화면 이탈·동작 줄이기 모두 PASS. 실제 첫3회 전환은12.175초/24.193초/36.299초. 정적 후보의 제품 링크·18종 서류·4플랫폼·통합실행 탭 및 실제 MP4 재생도 PASS.
- `firebase deploy --only hosting --project propig-63524 --config firebase.json --non-interactive` exit0, `release complete`와 `Deploy complete` 확인. 새 운영 릴리스 `e6b80cc2b8b0ed9e`의 공개540개+Firebase 생성2개 파일 해시가 배포 후보와 전부 일치한다.
- 운영 URL: `https://propig-63524.web.app/corp/company/product-introduction`.
- 운영 새 비로그인 Chrome에서 양방향 이동·뒤로/앞으로·새로고침·실제 영상 재생, PC/모바일 제품 메뉴·서류18종·4플랫폼·카탈로그/통합실행 연결 정상. 회사소개·직원소개·습관트래커·대시보드 HTML은 기존 운영 바이트와 동일하다.
- 증거: `.tmp-product-motion-v7/release-build.log`, `live-baseline.json`, `release-manifest.json`, `production-release.json`, `production-navigation.json`, `postbuild-smoke-results.json`, 운영 PNG. Functions·Firestore/Storage 규칙·운영 사용자 데이터·commit/push 변경 없음.
- 운영 실제 시간 자동 전환 최종 PASS:12.088초/24.104초/36.179초에 PC→모바일→글로벌→급여·거래로 전환. 초기 streaming의 숨겨진 서버 트리가 약300ms 내 제거되고 쇼릴1개로 안정화되는 것을 확인해 검증 준비 상태에 단일 DOM 조건을 추가했다. 제품 런타임 오류는 없다. 임시 QA 서버는 검증 후 종료했다.
