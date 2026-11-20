# 회사소개 전국시스템인력 브랜드 추가 및 로고 교체

- 목표: `/corp/company/introduction`의 BRAND PORTFOLIO에 전국시스템인력과 시스템동바리·시스템비계 인력공급업체 소개를 추가한다.
- Owner: lead. corp 검토 담당은 읽기 전용이며 허용 쓰기 파일은 없다.
- 허용 제품 파일: `src/components/dashboard/Dashboard2Experience.tsx`, `public/images/corp/brands/jeonguk-system.png`.
- 인계 파일: `docs/corp-jeonguk-brand-handoff.md`. 임시 검증 자료는 ignored `.tmp-corp-brand/`, `.tmp-corp-jeonguk-qa/`에 저장한다.
- 기존 변경 보존: Dashboard2Experience의 CEO 소개 수정, verify-corp-pages 스크립트 수정 및 습관관리 관련 변경을 유지한다.
- 보존 계약: 기존 CYENG·PROPIG·그뚠스토리 브랜드, 사이트 모드·메뉴·권한·데이터·스크롤 동작 유지. CY 프로젝트와 3000 서버 변경 없음.
- 구현: 첨부 원본 JS 로고와 전국시스템인력 소개 추가. 카드 배치를 4열, 1100px 이하 2열, 560px 이하 1열로 조정하고 마지막 카드 전체 너비 규칙 제거. 1100px 이하에서는 브랜드 제목과 소개를 위아래로 배치해 제목의 불필요한 단어 쪼개짐 방지.
- 로고: 1254×1254 PNG. 원본과 SHA256 일치 확인.

## 검증

- Hermes doctor 및 읽기 전용 corp plan 검사 통과.
- 독립 소스 검토: 기존 브랜드·dirty 변경 보존, 이미지 규격·비율·대체 텍스트, 4/2/1열 규칙 확인.
- 최종 범위 ESLint와 `tsc --noEmit -p tsconfig.typecheck.json` exit 0.
- 실제 localhost:3002 브라우저에서 1366px/900px/390px의 4/2/1열, 네 이미지 로딩, 제목·설명 잘림 없음, 가로 넘침 없음 및 모바일 스크롤 확인.
- 최종 Linux 격리 `npm run build` exit 0. `.tmp-corp-brand/build-linux.log`, `.tmp-corp-brand/linux-build-path.txt`에 증거 보관. 현재 컴포넌트와 빌드 snapshot 일치 및 정적 회사소개 HTML·원본과 같은 로고 export 확인.
- 기존 `verify-corp-pages.mjs`는 desktop 5개 페이지 렌더링 검사 후 `/corp/project` 응답 검사에서 실패: 실제 200, 기대 404. 이번 변경 파일 밖의 경로 응답 조건이며 검증 스크립트는 수정하지 않았다. 전체 기업 페이지 회귀 PASS로 보고하지 않는다.
- parent가 실제 소스 diff, 원본·복사 이미지 SHA256, 브라우저 상태 및 빌드 출력물을 직접 재검증했다.
- commit/push/배포 및 외부 데이터 변경 없음.

## 후속 요청: 건설 크롬 엠블럼으로 교체

- 사용자가 새로 첨부한 `전국시스템인력 건설 크롬 엠블럼.png`를 기존 전국시스템인력 이미지 경로에 원본 그대로 적용했다.
- 원본과 적용 이미지 SHA256: `9834C80117C5D9E97A3C1B52100ECFE03321AF8BC25C66984FBA07B73F0EB873`. 1254×1254 PNG.
- 이미지 카드 배경을 흰색으로 맞추고 대체 텍스트를 파란색 J·빨간색 S·크레인이 있는 크롬 엠블럼 설명으로 갱신했다. 전체 비율을 보존하는 `object-fit: contain` 유지.
- 범위 ESLint, 프로젝트 타입 검사, `git diff --check`, 기존 Linux 격리 환경의 최종 `npm run build` 모두 exit 0.
- 실제 1366px PC 및 390px 모바일에서 새 로고 전체 표시, 이미지 로딩, 가로 넘침 없음 확인. 브라우저 오류 로그 없음. 읽기 전용 독립 소스 감사 통과.
- 이번 후속 변경은 기존 브랜드·문구·카드 배치와 기존 dirty 변경을 유지했다. 전체 corp 회귀 스크립트의 위 기재된 기존 실패는 재검증하거나 해결한 것으로 보고하지 않는다.

## 2026-10-14 후속 요청: 금속 JS 로고 및 PROPIG 전체 이미지

- 새 첨부 `금속 JS 건설 엔지니어링 로고.png`를 기존 전국시스템인력 이미지 경로에 원본 그대로 적용했다. 1254×1254, 원본·적용 PNG SHA256 `55062CBCD8875916FCBB60042AEA7C9B8B231D7E7F81FE57BFA01C576635D3D2` 일치.
- 전국시스템인력 대체텍스트를 빨간색 J·파란색 S·건설 현장·크레인으로 갱신하고 카드 배경을 짙은 남색으로 조정했다.
- 추가 요청에 따라 PROPIG 이미지 스타일을 `cover`에서 `contain`으로 바꿔 512×512 원본의 귀와 꼬리까지 모두 표시한다. 카드 높이와 반응형 배치는 유지한다.
- 작업 전 소스 `.tmp-corp-brand/before-engineering-logo.tsx` 대비 위 세 지점만 변경됨을 독립 감사와 직접 비교로 확인했다. 기존 dirty 변경 유지.
- 최종 범위 ESLint·프로젝트 타입 검사 exit 0. 실제 브라우저 1366px·390px에서 네 이미지 로딩, 모든 로고 `contain`, 가로 넘침 없음 확인.
- 최종 Linux 격리 `npm run build` exit 0. 빌드 소스와 최종 컴포넌트, export 로고와 적용 PNG 일치 확인. 증거: `.tmp-corp-brand/build-engineering-logo.log`. 별도 배포는 수행하지 않았다.
