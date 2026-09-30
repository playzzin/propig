# 대표이력서 구성 작업

- 목표: 사용자가 제공한 신체·성격·학력·경력·기술 정보를 유쾌한 대표이력서로 구성.
- owner: lead — 구현·검증·통합. qa — 읽기 전용 독립 검토.
- branch: `codex/add-founding-background-to-introduction`; 기존 다수 dirty 변경 보존.
- allowed files: `src/components/dashboard/Dashboard2Experience.tsx`, `scripts/verify-corp-pages.mjs`, `ops/hermes/ceo-resume-plan.json`, `docs/ceo-resume-handoff.md`.
- forbidden files: 위 목록 외 제품 파일, package/lockfile, 공통 shell, 서버·배포·인증 설정.
- 보존: 대표소개서 상위 탭, 사진 전환, 공개 스크롤, 회사소개 variant, 기존 사용자 변경.
- acceptance tests: 범위 ESLint, type-check, 기존 CEO 브라우저 검증, 1366px/390px 항목 선택·키보드·가로 넘침·시각 검증, 가능한 격리 build.
- 현재 작업의 콘텐츠 원문·개인 정보는 인계 문서에 복사하지 않음.

## 결과

- `Dashboard2Experience.tsx`: 기존 5개 accordion을 요청한 분류로 구성하고 제원표·어록·학력 여정·경력 목록·면허 목록을 적용. 공개 스크롤과 기존 대표소개서 상위 탭을 유지.
- 브라우저에서 기존 외부 대표사진 로드 실패를 발견해, 실패한 프로필만 기존 로컬 캐릭터로 대체. 프로필별 상태로 사진·영상 순환 및 회사소개 variant를 보존.
- `scripts/verify-corp-pages.mjs`: 두 번째 대표사진의 원본/대체 이미지와 실제 이미지 로드 완료를 확인하도록 보완.
- parent 검증: 범위 ESLint exit 0, 기존 type-check exit 0, 검증 스크립트 구문 확인 exit 0, 최종 Linux 격리 `next build --webpack` exit 0 (production 서버 빌드, TypeScript 포함).
- 기존 CEO 브라우저 검증 desktop/mobile exit 0. 추가 1366/390/320px 검사에서 5개 항목의 필수 내용·단일 펼침·Enter/Space·접힘·포커스·본문 잘림·가로 넘침·페이지 오류 검사 PASS. 각 항목의 axe WCAG 2 A/AA, 2.1 AA 검사 위반 0.
- 원격 이미지 실패를 재현한 별도 검사에서 로컬 대체 2개·영상 전환·처음으로 복귀 PASS. 실제 화면에서도 대체 이미지 로드 확인. 회사소개 variant smoke PASS.
- qa 독립 읽기 전용 리뷰 후 사진의 naturalWidth 검사 제안을 반영하고 parent가 기존 CEO 검증을 재실행해 PASS 확인.
- 증거: `.tmp-ceo-resume/results.json`, `.tmp-ceo-resume/build-final.log`, `.tmp-ceo-resume/desktop-viewport.png`, `.tmp-ceo-resume/mobile-final-1.png`, `.tmp-ceo-resume/mobile-final-4.png`. 임시 증거는 ignored 경로.
- 한계: 호스팅용 static export 및 배포는 실행하지 않음. 초기 임시 빌드 입력에 빠졌던 Functions 소스는 복사본에 보완하고 production 빌드를 재검증함. 원본 저장소·실행 서버·의존성을 재설치하거나 변경하지 않음.
