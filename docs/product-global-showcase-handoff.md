# 그뚠이 블로그·상품 사용 장면과 제품 쇼릴

작업일: 2026-10-29 KST. 대상: `/corp/company/product-introduction`.

## 현재 반영 결과

- 영상 프레임 상단과 하단 정보 영역에 각 채널의 로고와 YouTube·유튜브 / TikTok·틱톡 이름을 명시했다. TikTok 프레임에는 15초 시연 표시를 추가했고, 쇼릴도 15초 후 블로그 장면으로 넘어간다. 원본 영상·플레이어 재생 기능은 유지한다.
- 생성형 콘텐츠 판매의 중앙을 **그뚠이의 콘텐츠 상점**으로 구성했다. 태블릿 제작 → 상품 소개 → 엄지척 전달 완료의 세 포즈와 한글 말풍선이 4초씩 이어진다. 영상·이미지·웹툰 카드가 모이고, 콘텐츠 팩과 전달 완료 알림이 나타난다. 주문 영역에도 그뚠이 미리보기를 넣었다. 기존 투명 PNG `work`·`point`·`success`를 재사용하며 새 이미지나 의존성은 추가하지 않았다.
- 새 캐릭터 모션은 기존 12초 판매 구간·전체 일시정지·화면 밖 정지와 연결된다. 동작 줄이기와 정적 장면에서는 태블릿 포즈와 말풍선 하나를 유지하고 이동 카드·완료 효과를 숨긴다. 현재 쇼릴 높이와 광고형 리셀러 네 장면은 보존했다.
- YouTube 시연은 [그뚠목욕](https://youtube.com/shorts/k56Wglp9hI4), TikTok 시연은 [슈퍼그뚠](https://youtube.com/shorts/eiivhfQJFOA)으로 교체했다. 두 영상 모두 YouTube에 호스팅된 Shorts이며, 공식 iframe API와 개인정보 보호 강화 임베드를 사용한다. 제목·채널은 YouTube oEmbed의 200 응답으로 확인했고 실제 재생 시간 진행도 브라우저에서 확인했다.
- 영상 쇼릴 구간은 YouTube 20초, TikTok 15초다. 21개 장면 전체는 311초다. 공통 재생·정지, 탐색 슬라이더, 음소거·소리 켜기, 화면 안 재생 버튼, 화면 밖 정지, 동작 줄이기에서 직접 재생, 채널 이탈 시 플레이어 제거를 연결했다. 오류 시 다시 불러오기와 원본 보기 링크를 제공한다. 기존 로컬 영상 파일은 다른 시연 참조를 위해 보존한다.
- 모바일 YouTube 콘텐츠 높이는 플레이어 최소 200×200을 확보하도록 다른 콘텐츠와 같은 360px로 맞췄고, TikTok은 프레임 안쪽 너비 200px를 확보했다. YouTube의 기본 재생 오버레이를 가리지 않도록 전화기 스피커 장식은 제거했다. API 참고: https://developers.google.com/youtube/iframe_api_reference
- 블로그를 **그뚠이의 업무일지**로 구성했다. 태블릿으로 업무를 확인하는 커버와 본문 중간의 책상 장면, 세 단락의 업무 이야기·인용문·마무리 글을 넣었다. 네이버·티스토리·워드프레스 로고와 내부 스크롤, 재생 시 본문 자동 진행을 유지한다.
- 광고형 리셀러의 네이버스토어·쿠팡파트너스·알리익스프레스·테무를 선택하면 그뚠이가 조명으로 독서하기·헤드폰으로 음악 듣기·카메라로 촬영하기·테이블 클록 설정하기 장면으로 각각 바뀐다. 중앙 광고 소재와 오른쪽 상품 연결 미리보기에서 같은 캐릭터 이미지를 사용하며 기존 콘텐츠 규격·재생·정지·동작 줄이기 동작을 따른다.
- 네 상품 사용 이미지는 기본 내장 `image_gen`, `transparent_background: true`로 만들었다. 모두 1254×1254 PNG, alpha 범위 0–255다. 원본은 보존하고 `public/images/corp/products/commerce/geudduni-{lamp,headphones,camera,clock}.png`에 복사했다. 실제 프롬프트·참고 이미지·최종 저장 경로는 [product-commerce-image-prompts.json](product-commerce-image-prompts.json)에 기록했다.
- 업무자동화의 그뚠이 책상에 서류 다섯 장이 차례로 날아와 눕고 쌓인다. 프로그램 연동에서는 업무별 한글 디지털 창 세 개가 모니터 주변으로 날아와 자리 잡는다. 브라우저·에이전트에서는 모니터 안의 봇 세 개가 순서대로 답장하고 마지막 결과 말풍선이 나타난다.
- 새 그래픽은 기존 투명 캐릭터 이미지와 같은 1448×1086 좌표의 SVG 레이어로 구성했다. 책상·모니터 위치와 콘텐츠 규격을 유지하고 이미지 파일·새 의존성을 추가하지 않았다. 각 장면과 순환이 바뀔 때 모션을 다시 시작하고, 공통 재생·정지에 반응한다. 동작 줄이기에서는 완성된 서류 더미·디지털 창·답장을 정지 상태로 표시한다.
- 웹·앱 제품명을 **그뚠웹·그뚠앱**으로 통일했다. 상세 메뉴·NOW/NEXT 장면 이름·기기 화면 브랜드·앱 메뉴·프로젝트·업무 안내 문구와 글로벌 도시 이름을 한글로 맞췄다. 기존 장면 ID와 21개 장면 순서는 유지한다.
- 업무자동화 콘텐츠 왼쪽에 책상에 발을 올리고 담배를 피우는 그뚠이를 배치했다. PC 조작→스마트폰 지시→음성 명령이 4초 간격으로 전환되며, 각 자동화 업무에 맞는 한글 명령과 실제 꼬리가 있는 말풍선이 함께 바뀐다. 기존 쇼릴 시계의 `sceneElapsedMs`를 사용해 별도 타이머 없이 멈춤·장면 변경·동작 줄이기와 동기화한다.
- 말풍선은 PC에서 캐릭터 위, 모바일에서 캐릭터 옆에 붙는다. 캐릭터와 처리 흐름이 콘텐츠 너비를 함께 사용하며 PC 전체 높이 817px를 유지한다. 모바일에서는 보조 제목을 생략하고 캐릭터·말풍선을 한 줄로 배치한다.
- 웹·앱 장면의 데스크톱과 스마트폰 **화면 안**에 그뚠이를 배치했다. 데스크톱 오른쪽에는 태블릿 작업 포즈의 업무 도우미 영역, 스마트폰에는 엄지척 포즈의 환영 영역을 구성했다. PC·모바일·글로벌 연결 장면 모두 기기와 캐릭터가 함께 확대·축소되고 기존 전환·정지·동작 줄이기 동작을 따른다.
- 기존 투명 PNG인 `ddunddun-work.png`, `ddunddun-success.png`를 재사용했다. 원본과 화면 SVG는 수정하지 않고 기기 내부 SVG 레이어로 디자인을 합성했다. 전체 높이는 PC 817px로 유지한다.
- 생성형 콘텐츠 탭과 콘텐츠 상단에 YouTube·TikTok·블로그·Instagram 표시를 배치했다. 활성 채널 로고가 부드럽게 등장하고 연결선·순서 강조가 장면 전환을 따라간다. 블로그 본문 상단에는 네이버·티스토리·워드프레스 로고와 이름을 함께 표시한다.
- 브랜드 벡터는 기존 `react-icons@5.5.0`의 Simple Icons를 사용한다. 블로그 카테고리 표시는 Lucide BookOpen이며 개별 블로그 플랫폼은 각 브랜드 로고다. 새 의존성이나 외부 이미지 요청은 추가하지 않았다. 참고: https://github.com/simple-icons/simple-icons
- `현재 장면 반복` 버튼과 생성형 콘텐츠의 `콘텐츠 제품 보기` 링크를 제거했다. 재생은 항상 21개 장면을 순서대로 이어가고 마지막 장면 이후 첫 장면으로 돌아온다. 나머지 제품 보기 링크·재생/정지·이전/다음 조작은 유지한다.
- PC 쇼릴 전체 높이는 1,017px에서 817px로 약 19.7% 줄였다. 왼쪽 메뉴와 오른쪽 콘텐츠 모두 680px로 맞췄으며 웹·자동화·콘텐츠·판매 장면에서 동일한 전체 높이를 확인했다.
- 중간 화면의 콘텐츠 최소 높이는 800px에서 620px로 줄였다. 모바일은 글자·44px 조작 버튼·탭 구조를 유지하고 그래픽 높이를 275→220px(웹), 360→288px(기타)로 20% 줄였다. 모바일 웹 전체 높이는 약 799→744px다.
- 콘텐츠 미리보기 기본 높이는 PC 500→400px, 모바일 450→360px다. 블로그 내부 스크롤을 유지하도록 flex 기준 크기를 명시한다.
- 장면 위를 덮는 별도 캐릭터 오버레이는 제거된 상태다. 웹·앱은 기기 화면 안, 업무자동화는 콘텐츠 왼쪽, 블로그는 본문 안, 생성형 콘텐츠 판매는 상점 프레임 안, 광고형 리셀러는 상품 광고 프레임 안에 캐릭터를 배치한다. 영상·웹툰 장면은 유지한다.
- 상단 NOW, 왼쪽 탐색, 낮은 하단 캡션, 서로 다른 PC·모바일 화면 이미지, 글로벌 연결 모션과 21개 장면 순환을 유지한다. 현재 전체 시간은 TikTok 15초 반영으로 311초다.

## 수정 파일

- `src/components/corp/ProductContentSaleScene.tsx` — 판매 캐릭터 세 포즈·말풍선·콘텐츠 카드·상품 팩·전달 알림 모션
- `src/components/corp/useShowcaseYouTubePlayer.ts` — 공식 YouTube API 로딩·플레이어 수명·재생/정지/탐색/음량·오류 복구
- `src/components/corp/ProductShowreelSequence.ts` — YouTube 20초·TikTok 15초, 전체 311초
- `src/components/corp/ProductContentStudio.tsx` — 그뚠이 블로그 본문·커버·본문 캐릭터와 반응형 배치
- `src/components/corp/ProductCreEditorScene.tsx` — 네 상품별 사용 이미지·중앙 광고 소재·상품 연결 미리보기
- `public/images/corp/products/commerce/geudduni-{lamp,headphones,camera,clock}.png` — 새 상품 사용 장면 네 장
- `src/components/corp/ProductAutomationDeskEffects.tsx` — 책상 서류 적재·디지털 창 도착·모니터 봇 답장 SVG 모션
- `src/components/corp/ProductAutomationDirector.tsx` — 세 입력 포즈·한글 명령 말풍선·반응형 캐릭터 장면
- `src/components/corp/ProductServiceExplorer.tsx`, `ProductMotionShowcase.tsx` — 자동화 장면 좌우 배치·공유 재생 시계 전달·제품명
- `src/components/corp/ProductShowreelSequence.ts` — 그뚠웹·그뚠앱 장면 이름
- `public/images/corp/products/global/{desktop,mobile}-workspace.svg` — 한글 브랜드·화면 문구
- `public/images/corp/products/automation/geudduni-{pc,phone,voice}.png` — 동일 구도의 세 명령 포즈
- `src/components/corp/ProductGlobalWebScene.tsx` — 기기 화면 내부의 데스크톱·모바일 캐릭터 디자인
- `scripts/verify-product-global-showcase.mjs` — 기기별 이미지 로딩·화면 안 배치·웹·앱 외 장면 캐릭터 부재 검증
- `src/components/corp/ProductContentBrands.tsx` — 채널 로고·전환 모션·블로그 플랫폼 로고
- `src/components/corp/ProductContentStudio.tsx` — 채널 탭과 미리보기 로고 통합
- `src/components/corp/ProductMotionShowcase.tsx` — 반복 버튼·콘텐츠 CTA·단일 장면 반복 상태 제거
- `scripts/verify-product-{showreel-sequence,content-studio,automation-flows,creeditor}.mjs` — 반복 모드 대신 순차 전환·마지막 장면 복귀와 로고 확인

이전 높이·캐릭터 정리에서 유지한 파일:

- `src/components/corp/ProductShowcaseWorkspace.tsx` — 높이와 flex 기준 크기
- `src/components/corp/ProductMotionArtwork.tsx` — 캐릭터 렌더링 제거
- `src/components/corp/ProductContentStudio.tsx` — 미리보기 높이·캐릭터 제거
- `src/components/corp/ProductServiceExplorer.tsx`, `ProductMotionShowcase.tsx` — 불필요한 캐릭터용 prop 전달 제거
- `scripts/verify-product-global-showcase.mjs` — 축소 높이·캐릭터 부재 검증으로 변경, 탐색·접근성·재생·본문 스크롤 검증 유지

## 검증

채널 표기는 실제 Chrome 1440/390/320px에서 두 채널 모두 로고·이름, 가로 넘침 없음, 최소 플레이어 200×200 이상을 확인했다. 320px에서도 TikTok 내부 플레이어는 200×231이다. 실제 재생 버튼을 기준으로 TikTok은 약 15.165초에 블로그로 전환됐다. 증거: `output/product-global-20261028/channel-label-*.png`. 자동 재생이 이미 시작된 뒤 측정한 최초 시도는 타이머 기준이 어긋나, 정지·장면 초기화 후 재생 버튼 클릭부터 다시 측정했다.

채널 표시·15초 변경의 `verify-product-showreel-sequence.mjs`는 PC·모바일 21개 장면 전체 순서와 실제 시간 첫 36초 검사를 통과했다. 전체 311초, TikTok 구간 15초를 반영했다. ESLint·전체 type-check·production build 모두 exit 0이며 검증한 28개 코드·이미지 해시가 현재 입력과 일치한다. 기존 생성형 콘텐츠 판매 캐릭터와 대표 통계 파일도 보존했다. 증거: `channel-label-dev/sequence/`, `channel-label-final/final-checks.json` 및 로그. 변경한 검증 스크립트 구문 검사와 `git diff --check`도 통과했다.

생성형 콘텐츠 판매 변경은 개발 Chrome 1440/390/320px에서 `verify-product-creeditor.mjs` exit 0이다. 세 캐릭터 이미지 디코딩, 포즈·말풍선의 단계별 노출, 글자 프레임 적합성, 전체 정지·동작 줄이기, 기존 네 리셀러 장면·키보드·마지막 장면 복귀·접근성을 검사했다. 실제 시간으로도 모바일에서 약 1.2/5.2/9.2초에 제작→소개→완료 포즈가 순서대로 바뀌는 것을 확인했다. 증거: `output/product-global-20261028/content-sale-dev/creeditor/` 및 `content-sale-390-real-motion.png`, `content-sale-active-5500.png`, `content-sale-active-9500.png`.

이 변경의 ESLint, 전체 `npm run type-check`, `npm run build`는 모두 exit 0이며 최종 28개 코드·이미지 입력 해시가 빌드와 일치한다. 기존 Shorts 교체 검증 이후 변경된 기존 구현은 판매 장면과 해당 설명 두 파일뿐이며, 대표 통계 네 파일의 해시도 유지한다. 새 컴포넌트는 현재 투명 이미지 세 장과 CSS transform/opacity만 사용한다. 증거: `content-sale-final/final-checks.json`과 각 로그. 브라우저 검증은 개발 Chrome 기준이며 실제 Safari는 미검증이다.

Shorts 교체는 실제 YouTube 영상으로 검증했다. oEmbed의 두 ID·제목·채널 200 응답, 실제 시간 진행, 정지 시 위치 유지, 320px의 263×261 / 200×231 플레이어 크기, 동작 줄이기에서 직접 재생, YouTube 자체 재생 버튼과 화면 밖 정지를 확인했다. 증거: `output/product-global-20261028/shorts-live-checks.json` 및 `shorts-*-live.png`, `shorts-*-320.png`.

개발 Chrome 1440/390px의 `verify-product-content-studio.mjs`는 실제 영상 재생·정지·키보드 탐색·음량·원본 링크·채널 전환·동작 줄이기·오류 후 재시도까지 exit 0이다. 외부 플레이어의 비동기 시작·탐색 응답을 기다려 실제 위치를 검증한다. SDK 요청 실패만 의도적으로 주입한 오류 복구 검사에서도 재시도 후 원본 영상의 실제 시간 진행을 확인했다. 미디어 fixture를 사용하지 않았다. 증거: `shorts-dev/content/content-studio-results.json`.

최종 Shorts 코드의 ESLint, `npm run type-check`, `npm run build`는 exit 0이며, 27개 구현·이미지 입력의 해시가 빌드와 일치한다. 증거: `shorts-verified/final-checks.json`과 각 로그. 앞선 `shorts-final/` 빌드는 성공했지만, 빌드 중 화면 안 재생 버튼 처리를 보완해 소스 일치 검사에서 중단됐다. 최종 코드를 새 복제본 입력으로 갱신해 전체 검증을 다시 통과했다.

최종 정적 빌드의 레이아웃 검사(1440/390/320px)와 장면 순환 검사(PC·모바일 21개 장면, 실제 시간 첫 36초)는 exit 0이다. 레이아웃 검사의 이전 총 재생 시간 기대값 300초를 변경된 316초에 맞췄다. 외부 영상 재생 검사는 첫 프레임 이후 버퍼링을 고려해 1.1초 고정 대기 대신 최대 7초 안에 실제 재생 위치가 0.3초 이상 진행하는지 확인한다. 동작 줄이기에서는 메타데이터가 최초 재생 전까지 지연 로드될 수 있으므로 플레이어 준비·정지 확인 후 사용자가 재생을 눌러 시간 진행을 검증한다. 최초 검사 로그는 그대로 보존했다. 구현 27개 파일과 기존 대표 통계 4개 파일의 최종 해시도 일치한다. 증거: `shorts-verified/static-global-recheck.json`, `static-browser/sequence/showreel-sequence-results.json`, `source-preservation-check.json`.

최종 정적 빌드의 실제 콘텐츠 검사도 1440/390px 모두 exit 0이다. 두 영상의 재생·정지·탐색·음량·정확한 원본 링크, 블로그·웹툰 전환, 화면 밖 정지, 동작 줄이기에서 직접 재생, SDK 실패 후 재시도와 실제 영상 재생을 통과했다. 최종 세 브라우저 검사 결과는 `shorts-verified/static-browser-final-results.json`, 콘텐츠 상세는 `static-browser/content/content-studio-results.json`에 기록했다. 런타임·hydration 오류와 검사 범위의 WCAG A/AA 위반은 0건이다.

블로그·상품 사용 장면 변경은 개발 Chrome의 1440/390px에서 `verify-product-content-studio.mjs`, `verify-product-creeditor.mjs` 모두 exit 0이다. 블로그 두 이미지 로딩·alt·내부 키보드 스크롤, 상품별 이미지 매핑·로딩·네 플랫폼 전환, 공통 재생·정지·동작 줄이기, 기존 영상·웹툰·마지막 장면 복귀, WCAG A/AA·런타임·hydration 검사를 통과했다. 320px 블로그 커버·본문 중간·조명 사용 장면도 실제 브라우저로 직접 검수했으며 가로 넘침이 없다. 증거: `output/product-global-20261028/editorial-dev/`.

블로그·광고형 리셀러 변경의 ESLint, 전체 `npm run type-check`, 프로덕션 `npm run build` 모두 exit 0이며, 26개 구현·이미지 파일의 해시가 최종 빌드 입력과 일치한다. 기존 자동화·웹앱 구현과 대표 통계 네 파일을 보존했다. 증거: `output/product-global-20261028/editorial-final/final-checks.json`, 각 검사 로그. 새 스크립트 검사와 변경 범위 `git diff --check`도 통과했다.

최종 정적 빌드의 `verify-product-global-showcase.mjs`(1440/390/320px), `verify-product-creeditor.mjs` 및 `verify-product-content-studio.mjs`(1440/390px)도 모두 exit 0이다. 상품 사용 이미지 네 장의 실제 디코딩·선택별 일치, 블로그 캐릭터 두 장·본문 스크롤, 공통 재생·정지·동작 줄이기, 기존 영상·웹툰, WCAG A/AA·런타임·hydration 검사를 다시 통과했다. 증거: `editorial-final/static-browser-results.json` 및 `editorial-final/static-browser/`.

새 책상 모션은 개발 Chrome 1440×1100 / 390×844에서 `verify-product-automation-flows.mjs`를 통과했다. 서류·창·봇이 단계적으로 도착하고 완료 후 남는 상태, 실제 재생 제어로 정지한 뒤 시간이 유지되는 동작, 동작 줄이기의 완료 화면, 자동화→생성형 콘텐츠 전환, 가로 넘침·런타임·hydration·WCAG A/AA를 검사했다. PC 세 종류의 완료 장면과 비행 중 서류, 모바일 배치를 직접 시각 검수했다. 증거: `output/product-global-20261028/desk-effects-dev/automation/`.

새 모션의 ESLint, 전체 `npm run type-check`, 프로덕션 `npm run build` 모두 exit 0이다. 21개 구현·이미지 입력 파일의 현재 해시와 검증용 Linux 복제본이 일치하며, 기존 대표 통계 네 파일도 이전 검증 해시를 유지한다. 검사 증거: `output/product-global-20261028/desk-effects-final/final-checks.json` 및 각 검사 로그. 브라우저 스크립트는 ESLint 제외 대상이므로 `node --check`와 실제 실행으로 확인했으며, 해당 변경의 `git diff --check`도 통과했다.

최종 정적 빌드에서도 `verify-product-global-showcase.mjs`(1440/390/320px × 9개 상태)와 `verify-product-automation-flows.mjs`(1440/390px) 모두 exit 0이다. PC 높이·좌우 비율, 모바일 잘림·넘침, 새 효과의 순차 도착과 정지, 동작 줄이기, 기존 채널 전환·영상·블로그·웹툰, 키보드·접근성 검사를 통과했다. 증거: `desk-effects-final/static-browser-results.json`, `desk-effects-final/static-browser/`의 결과 JSON·스크린샷.

이전 한글화·자동화·말풍선 변경은 개발 Chrome의 1440/390/320px × 9개 상태에서 레이아웃·글자/말풍선 잘림·가로 넘침·키보드·동작 줄이기·접근성 검사를 통과했다. PC 전체 높이는 817px, 320px 자동화 화면은 약 1089px다. 실제 시간으로 세 포즈와 각 한글 명령 전환, 정지 시 캐릭터 영역의 실행 애니메이션 0건도 확인했다. `verify-product-showreel-sequence.mjs`는 PC·모바일의 PC→스마트폰→음성 전환, 21개 장면 순환과 실제 시간 첫 36초를 통과했다.

ESLint, `npm run type-check`, `npm run build` 모두 exit 0이며 20개 구현·이미지 파일의 해시가 최종 빌드 입력과 일치한다. 기존 대표 통계 네 파일의 해시도 유지한다. 증거는 `output/product-global-20261028/director-bubble-dev/`, `director-final/`이다. 최종 정적 빌드의 `verify-product-global-showcase.mjs`, `verify-product-showreel-sequence.mjs`, `verify-product-automation-flows.mjs`도 모두 exit 0이며 런타임·hydration 오류와 접근성 위반이 없다. 수정한 브라우저 스크립트의 `node --check` 및 `git diff --check`도 통과했다.

말풍선 요청으로 중단했던 최초 빌드의 잠금은 실행 프로세스 종료·building 단계·기존 출력 보존을 확인한 후 `.static-export.interrupted-director-20261029.lock`으로 보관했다. 빌드는 재실행해 성공했다. 이전 실패 로그와 재시도 로그는 증거 폴더에 함께 보존한다.

이전 기기 화면 변경: 개발 화면과 프로덕션 정적 빌드 모두 1440/390/320px × 9개 상태에서 기기별 캐릭터 이미지 로딩·화면 안 배치·다른 장면 미노출, 높이·넘침·키보드·재생/정지·동작 줄이기·WCAG A/AA 검사를 통과했다. 데스크톱과 모바일 장면 스크린샷도 직접 검수했다. ESLint, `npm run type-check`, `npm run build`는 모두 exit 0이며 구현·이미지 파일 해시가 검증 빌드와 일치한다. 증거는 `output/product-global-20261028/workmate-dev/`, `workmate-final/`이다.

이전 채널 로고·버튼 정리 검증:

개발 Chrome의 1440/390/320px × 9개 상태에서 높이, 캐릭터·제거 버튼 부재, 글자·그래픽 잘림, 가로 넘침, 키보드, 44px 조작 영역, 재생·정지, 동작 줄이기, 블로그 내부 스크롤과 WCAG A/AA 검사 통과. 런타임·hydration 오류 0건. 320px 블로그 화면에서 세 플랫폼 로고, 가로 넘침 없음, 동작 줄이기 설정의 로고 애니메이션 0건도 실제 브라우저로 확인했다.

현재 로고 변경의 ESLint, `npm run type-check`, `npm run build`는 모두 exit 0이다. 빌드 입력과 현재 구현·이미지 파일 해시가 일치하며 기존 대표 통계 네 파일도 이전 검증 해시와 일치한다. `verify-product-content-studio.mjs`는 개발 화면에서 PC·모바일 영상 재생/탐색·로고 표시/정지·블로그 스크롤·웹툰·다음 채널 전환·영상 오류 복구까지 exit 0이다.

프로덕션 정적 빌드에서도 `verify-product-global-showcase.mjs`, `verify-product-showreel-sequence.mjs`, `verify-product-automation-flows.mjs`, `verify-product-creeditor.mjs` 모두 exit 0이다. 21개 장면 전체 순서·웹툰 12컷·자동화→콘텐츠 전환·마지막 판매 장면→첫 웹 장면 복귀를 PC와 모바일에서 확인했다. 실제 시간으로도 PC→모바일→글로벌→급여 장면이 약 12/24/36초에 이어졌다.

이번 변경 증거는 `output/product-global-20261028/brands-dev/`, `brands-final/`의 검사 로그·결과 JSON·스크린샷이다. 이전 높이·캐릭터 변경 검증은 `compact-dev/`, `compact-final/`에 그대로 보존한다. 브라우저 스크립트는 저장소 ESLint 제외 대상이며 다섯 파일 모두 `node --check`와 실제 실행으로 확인했다. `git diff --check`도 통과했다.

## 범위

위 구현 단계의 결과는 로컬 검증 기록이다. 2026-10-29 사용자 요청으로 대표통계와 함께 커밋·푸시·Hosting 릴리스 절차를 진행한다. 배포 대상은 `propig-63524`, 검증·버전·파일 해시 증거는 `output/corp-release-20261029/`에 기록한다. 실제 기기 Safari는 미검증이다. package/lockfile, 개발 서버 3002와 3000 포트를 보존했다.

릴리스 검사에서 생성형 콘텐츠 판매 설명을 줄여 320px 하단 캡션 높이를 64px로 맞췄다. 최종 소스·이미지·설정 591개가 검증 빌드와 일치하며, 린트·타입·빌드 및 제품 레이아웃 1440/390/320px, 대표통계·자동화·캐릭터 판매 검사를 통과했다. Hosting 공개 파일은 545개이며 서버 함수·데이터 규칙 변경은 없다.

## 자동화 장면 이미지 제작

기본 내장 `image_gen` 모드, `transparent_background: true`로 제작했다. 먼저 기존 캐릭터 참고 이미지로 PC 조작 장면을 만들고, 그 결과를 편집 대상으로 스마트폰·음성 명령 포즈를 각각 만들었다. 세 장 모두 1448×1086이며 alpha 채널의 최소 0·최대 255를 확인했다. 같은 얼굴·체형·복장·책상·의자·카메라 구도를 유지하고 원본은 보존했다.

최종 이미지 경로:

- `C:/Users/playz/propig/public/images/corp/products/automation/geudduni-pc.png`
- `C:/Users/playz/propig/public/images/corp/products/automation/geudduni-phone.png`
- `C:/Users/playz/propig/public/images/corp/products/automation/geudduni-voice.png`

전체 실제 프롬프트 세트와 입력·출력 경로는 [product-automation-image-prompts.json](product-automation-image-prompts.json)에 기록했다. 이미지 밖의 한글은 코드로 구현해 글자 선명도와 반응형 배치를 유지한다.

## 보관한 이전 이미지 제작 기록 (작업·엄지척 포즈만 기기 내부에 재사용)

모드: 기본 내장 `image_gen` 편집, `transparent_background: true`. 원본 `C:/Users/playz/Pictures/뚠뚠이.png`는 보존했다. 먼저 초록 배경을 제거한 `ddunddun-guide.png`를 만들고 이를 편집 대상으로 네 포즈를 생성했다. 최종 결과를 프로젝트에 복사했으며 기본 생성 폴더 원본도 보존했다.

공통 프롬프트:

> Edit target: the supplied transparent 3D cartoon character. Preserve his exact identity: same face, thick eyebrows, short messy black hair, large stocky build, white ribbed tank top, blue tracksuit pants with white side stripes, black shoes, original high-quality 3D rendering/materials. Change only pose and the small expression needed for the action. Full body, hands and shoes completely visible, front three-quarter view, modest transparent margins. ACTUALLY transparent alpha background. No text, no badges, no colored backdrop, no ground plane, no added cast shadow. A reusable pose for an animated corporate website; character consistency is essential.

포즈별 추가 프롬프트 명세:

- point: 자신감 있는 가이드, 한 팔은 위쪽 오른편을 검지로 가리키고 다른 손은 허리에, 작은 미소, 소품 없음.
- work: 얇고 어두운 태블릿을 들고 다른 손 검지로 화면을 누름, 태블릿을 보는 집중한 표정, 안정적인 자세.
- success: 어깨 높이의 엄지척, 다른 손은 허리에, 자랑스럽고 친근한 미소.
- celebrate: 양팔을 들어 주먹으로 환호, 한쪽 뒤꿈치를 들어 작은 점프를 표현, 기쁜 표정.

최종 저장 경로는 모두 `C:/Users/playz/propig/public/images/corp/products/global/` 아래다.

- `ddunddun-guide.png` — 배경 제거 참고 이미지
- `ddunddun-point.png` — 가리키기
- `ddunddun-work.png` — 태블릿 작업
- `ddunddun-success.png` — 엄지척
- `ddunddun-celebrate.png` — 환호
- `desktop-workspace.svg`, `mobile-workspace.svg` — 서로 다른 PC·모바일 콘셉트 화면

네 포즈 모두 1254×1254, alpha 채널과 0–255 투명도 범위를 실제 메타데이터로 확인했다. 파일 해시가 각각 다르며 시각 검수로 자세 차이·전신·얼굴과 복장 일관성을 확인했다. 이미지는 웹앱 소개용 시연이며 실제 사용자 데이터나 외부 지역 시스템 연결을 포함하지 않는다.
