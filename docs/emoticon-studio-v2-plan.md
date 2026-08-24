# Emoticon Studio V2 통합 설계

- 작성일: 2026-08-05
- 대상: `/admin/emoticon-studio`
- 현재 단계: 0~9단계 구현·검증 완료
- 원칙: 기존 변경과 운영 경로를 보존하고, V2를 검증한 뒤 점진적으로 전환한다.

## 1. 제품 목표

캐릭터 이미지를 첨부하면 AI가 얼굴, 머리, 의상, 비율, 그림체와 고정 특징을 분석해 편집 가능한 캐릭터 DNA 카드를 만든다. 사용자는 자연어 한 문장으로 정지 이모티콘 여러 장 또는 움직이는 이모티콘을 만들고, 결과 카드에서 바로 확인한 뒤 필요한 경우에만 프레임 타임라인, 말풍선, 속도, 위치, 기존 자산 추가 등의 전문 편집기로 들어간다.

가장 짧은 성공 경로는 다음 다섯 단계다.

1. 캐릭터 첨부
2. 캐릭터 분석 확인
3. 자연어 요청
4. 결과 확인과 필요한 부분만 수정
5. 플랫폼 검사 후 다운로드

첫 번째 수직 완성 시나리오는 다음과 같다.

> 캐릭터 한 장을 첨부하고 DNA 카드를 승인한 뒤 “오른쪽으로 달리면서 처음 네 프레임에는 ‘거기서!!’, 다음 네 프레임에는 ‘서란 말이야’라고 외치게 해줘”라고 입력한다. 일관된 8프레임 결과가 생성되고, 특정 프레임과 말풍선 구간을 수정한 뒤 GIF, WebP, APNG, PNG ZIP으로 다운로드한다.

## 2. 현재 저장소 사실

### 기술 기반

- Next.js 16.2.11 App Router (`package.json` 선언 `^16.2.6`, lockfile 설치 버전 우선)
- React 19.2.3
- Firebase Client 12.13.0 / Admin 13.10.0
- Firebase Functions 7.2.5 / Node 22
- Zod 4.x
- styled-components 6.4.1
- dnd-kit, Sharp, FFmpeg, JSZip, OpenRouter 연동

### 현재 구조의 특징

- `src/app/admin/emoticon-studio/page.tsx`는 4,885줄이며 72개의 `useState`, 31개의 `useEffect`, 25개의 `useCallback`, 18개의 `useMemo`를 가진다.
- 현재 UI는 `simple`과 `studio` 모드로 분리되어 있다.
- 간편 생성은 단일 원본을 곧바로 생성 작업에 넣으며, 캐릭터 분석 승인 흐름을 거치지 않는다.
- 캐릭터 분석과 참조 이미지 관리는 프로젝트 스튜디오의 설정 사이드바에 들어 있다.
- 생성, 비용 통제, 작업 복구, 선택 프레임 보정, 수동 프레임, 말풍선, 결과 이력, 제출 전 검사 기능은 이미 상당 부분 구현되어 있다.
- 클라이언트와 Functions 모두 출력 형식에 APNG가 없고, LINE 움직이는 형식 프로필도 공식 제출 형식과 맞지 않는다.
- 대화 턴, 캐릭터 프로필 버전, 통합 자산 출처를 나타내는 명시적 V2 도메인 계약이 없다.

## 3. 기존 기능 감사

| 기능 | 현재 상태 | V2 결정 |
| --- | --- | --- |
| `QuickEmoticonGenerator` | 정지 다중 생성, 움직임 감지, 빠른/고품질, 비용 호출 수 안내가 연결됨 | 자연어 Composer의 입력부로 재사용하되 프로젝트·캐릭터 프로필과 연결 |
| `CharacterReferenceManager` | 프로젝트 설정 사이드바를 통해 연결됨 | 캐릭터 온보딩의 참조 관리자와 자산 보관함에서 재사용 |
| `CharacterProfilePlanner` | OpenRouter 분석, fingerprint 캐시, 시트 계획이 연결됨 | DNA 카드 승인·수정 UI로 재구성 |
| `ProjectSettingsSidebar` | 참조, 캐릭터 분석, 플랫폼, 출력, 고급 일관성 설정을 모두 포함 | 기본 흐름에서 숨기고 전문 설정 패널로 축소 |
| `ProjectItemBoard` | 보드, 타임라인, 결과 이력, 미리보기, 배치 작업이 연결됨 | 생성 결과 카드와 전문 편집기의 프로젝트 보관함으로 분리 재사용 |
| `FrameTimelinePanel` | `ProjectItemBoard`에서 지연 로딩됨 | 전문 편집기 하단 타임라인으로 재사용·확장 |
| `ResultHistoryComparePanel` | `ProjectItemBoard`에서 지연 로딩됨 | 대화 턴의 버전 비교와 선택 적용 기능으로 재사용 |
| `ManualFrameImportPanel` | PNG/JPEG/WebP 다중 업로드, 정지 완성본 재사용, 순서·시간 조정이 연결됨 | 자산 보관함과 타임라인의 “프레임 추가” 흐름으로 이동 |
| `BubbleTimelineEditor` | cue 구간, 모양, 글꼴, 등장 효과와 서버 렌더가 연결됨 | 별도 텍스트 트랙으로 유지하고 캔버스 직접 조작 보강 |
| `ImageEditPanel` | 비파괴 편집 레시피가 연결됨 | 프레임 속성 검사기로 이동 |
| `SubmissionPreflightPanel` | 프로젝트·선택 항목 검사와 ZIP 출력이 연결됨 | 마지막 내보내기 단계에서 재사용, APNG와 정책 snapshot 추가 |
| `EmoticonJobHistoryPanel` | 작업 상태와 정리 기능이 연결됨 | 고급 작업 기록으로 유지 |
| Functions director | 캐릭터 분석, 시트 계획, 동작 계획, 포즈·모션 평가가 구현됨 | 유지하고 V2 요청 계약만 확장 |
| 이미지 생성 | 모델 선택, 비용 추정, 참조 선택, 정적·프레임 생성이 구현됨 | 유지하고 모드별 실행 계획을 명시화 |
| 렌더러 | PNG, WebP, GIF, 영상, PNG ZIP, 말풍선 합성이 구현됨 | APNG 추가, 프레임 원본 계약 명확화 |
| 작업 복구 | checkpoint, continuation, 일별 비용 제한, 선택 프레임 repair가 구현됨 | 유지 |
| 배치 | 동시 실행 제한, 실패 재시도, 취소가 구현됨 | 정지 다중 생성에 유지 |
| 원본 생명주기 | 서버 업로드, 소유권, fingerprint, 삭제 잠금이 구현됨 | 통합 Asset provenance 계약으로 감싸서 유지 |
| 품질 검사 | 포즈·모션·알파 경계·플랫폼 검사 기준이 존재 | 캐릭터 일관성 문제를 프레임 행동과 연결하도록 확장 |

## 4. 재사용·보완·신규·정리 분류

### 그대로 재사용할 기반

- `functions/src/emoticonStudio/director.ts`
- `functions/src/emoticonStudio/imageGeneration.ts`
- `functions/src/emoticonStudio/jobRecovery.ts`
- `functions/src/emoticonStudio/rateLimits.ts`
- `functions/src/emoticonStudio/batches.ts`
- `functions/src/emoticonStudio/uploadSource.ts`
- `functions/src/emoticonStudio/identityFingerprint.ts`
- `src/services/emoticonProjectService.ts`
- `src/services/emoticonResultHistoryService.ts`
- `src/services/emoticonJobHistoryService.ts`
- 기존 Firestore/Storage 소유권 및 서버 전용 쓰기 경계

### 수정 후 재사용할 부분

- `src/schemas/emoticonStudio.ts`
- `functions/src/emoticonStudio/schema.ts`
- `src/schemas/emoticonProject.ts`
- `src/lib/emoticonPlatformProfiles.ts`
- `functions/src/emoticonStudio/renderer.ts`
- `src/services/emoticonStudioService.ts`
- `QuickEmoticonGenerator`
- `CharacterProfilePlanner`
- `ProjectItemBoard`
- `FrameTimelinePanel`
- `ManualFrameImportPanel`
- `BubbleTimelineEditor`
- `SubmissionPreflightPanel`

### 새로 필요한 부분

- 대화형 제작 턴 계약과 저장 서비스
- 캐릭터 프로필 버전·승인·사용자 수정 계약
- 자산 출처와 파생 관계 계약
- 동일 프로젝트 안에서 간편 생성과 전문 편집을 연결하는 V2 workspace state
- 자연어 요청을 동작·표정·프레임·텍스트 cue로 정규화하는 요청 계약
- APNG 렌더·검사·다운로드
- 애니메이션 컨테이너 또는 PNG 묶음을 타임라인 프레임으로 가져오는 안전한 가져오기 경로
- 생성 결과를 순차적으로 쌓는 대화형 결과 카드
- 밝은 배경, 어두운 배경, 투명 체크무늬 미리보기 전환

### V2 검증 전 유지할 레거시

- 현재 `/admin/emoticon-studio` route
- `simple`/`studio` 모드 전환
- 현재 프로젝트 툴바와 JSON 가져오기/내보내기
- MP4/WebM 등 기존 사용자에게 제공하던 추가 출력

### V2 전환 후 정리 후보

- `page.tsx`의 대규모 로컬 상태와 이벤트 핸들러
- 간편 생성과 프로젝트 생성에 중복된 원본·요청 상태
- 첫 화면에 노출되는 프로젝트 관리·정책·고급 설정 영역
- 대화 결과와 별도로 떨어져 있는 결과 보조 도구 배치

정리 후보는 V2 전환과 회귀 검증이 끝난 뒤 별도 단계에서만 삭제한다.

## 5. 목표 아키텍처

### 라우팅 전환

1. 개발 중에는 `/admin/emoticon-studio/v2`에서 V2를 조립한다.
2. 기존 `/admin/emoticon-studio`는 수정 범위를 최소화해 운영 경로로 유지한다.
3. V2 수직 시나리오, 데스크톱·모바일, 기존 프로젝트 호환이 통과한 뒤 루트 route를 V2로 전환한다.
4. 전환 시 기존 구현은 임시 `/admin/emoticon-studio?legacy=1` 복구 경로로 보존한다.
5. 실제 데이터와 운영 검증이 끝난 뒤에만 legacy 제거를 별도 승인한다.

### 제안 파일 경계

```text
src/app/admin/emoticon-studio/v2/page.tsx
src/features/emoticon-studio-v2/
  EmoticonStudioWorkspace.tsx
  EmoticonStudioWorkspace.styles.ts
  components/
    CharacterOnboarding.tsx
    CharacterDnaCard.tsx
    CreationConversation.tsx
    CreationComposer.tsx
    GenerationTurnCard.tsx
    ProfessionalEditor.tsx
    AssetTray.tsx
    PreviewCanvas.tsx
    ExportWorkspace.tsx
  hooks/
    useEmoticonWorkspace.ts
    useCharacterProfile.ts
    useCreationTurns.ts
    useGenerationJobs.ts
    useTimelineEditor.ts
  lib/
    intentNormalization.ts
    timelineProjection.ts
    workspaceSelectors.ts
src/schemas/emoticonStudioV2.ts
src/services/emoticonCreationTurnService.ts
src/services/emoticonAssetService.ts
```

새 파일 이름은 구현 직전 기존 naming과 import 경계를 다시 확인해 조정한다. 서비스와 스키마를 UI 파일 안에 복제하지 않는다.

### UI 흐름

```text
CharacterOnboarding
  -> 캐릭터 업로드
  -> 분석 진행
  -> DNA 카드 수정·승인
  -> CreationConversation
       -> 사용자 요청
       -> 실행 계획·비용 확인
       -> GenerationTurnCard
            -> 움직이는 결과
            -> 프레임 스트립
            -> 선택 보정
            -> 세부 조정
                 -> ProfessionalEditor
                      -> AssetTray
                      -> PreviewCanvas
                      -> FrameTimelinePanel
                      -> BubbleTimelineEditor
       -> ExportWorkspace
```

### 데이터 흐름

```text
Client V2 Workspace
  -> 기존 project/service 계층
  -> 사용자 범위 Firestore project/turn/asset 문서
  -> 기존 emoticonJobs enqueue
  -> Functions trigger
  -> director / imageGeneration / quality / renderer
  -> Storage 결과와 job checkpoint
  -> Firestore subscription
  -> 대화 결과 카드와 전문 편집기에 동일 상태 반영
```

프레젠테이션 컴포넌트가 Firestore 또는 OpenRouter를 직접 호출하지 않는다.

## 6. V2 데이터 계약

### CharacterProfileVersion

- `id`, `schemaVersion`, `profileVersion`
- 참조 자산 ID 목록과 identity fingerprint
- AI 원본 분석
- 사용자 수정 override
- `draft | approved | superseded`
- 유지 강도 `natural | balanced | strict`
- 항목별 잠금
- 생성 모델·분석 확인 정보와 생성 시각

기존 `project.character.profile`, `profileJobId`, `identityFingerprint`는 읽기 호환을 유지한다. 첫 수정 또는 승인 시 새 버전을 만들고, 기존 필드는 최신 승인 프로필을 가리키는 호환 projection으로 유지한다.

### EmoticonAsset

- 원본 Storage 경로와 공개/서명 URL 정책
- MIME, 크기, 픽셀 크기, alpha 여부, checksum
- 출처 `uploaded | ai_generated | ai_edited | manual_import | local_composite`
- 부모 asset/job/turn 관계
- 소유자와 프로젝트 범위
- 삭제 잠금과 보존 상태

기존 job output과 source path를 즉시 옮기지 않는다. Asset 문서가 없는 기존 자산은 읽을 때 adapter가 임시 asset view로 투영하고, 사용자가 V2에서 편집하거나 재사용할 때만 영속 asset으로 승격한다.

### CreationTurn

- 사용자 자연어 원문
- 정규화된 생성 의도
- 사용한 캐릭터 프로필 버전
- 대상 플랫폼·형식·품질 모드
- 예상 비용과 실제 비용
- 연결된 job과 variant
- 상태와 오류·복구 행동
- 부모 turn ID와 수정 사유

턴은 덮어쓰지 않는다. “문구 변경”, “다른 버전”, “6번 프레임 보정”은 부모 턴을 가리키는 새 revision turn 또는 variant로 기록한다.

### AnimationTimeline

- frame asset ID 순서
- 프레임별 duration
- loop mode와 loop count
- 캔버스 변환·정렬 레시피
- text cue track
- timeline revision

기준 원본은 개별 투명 PNG 프레임이다. GIF, WebP, APNG와 스프라이트 시트는 파생 출력이다.

## 7. 호환·마이그레이션 전략

### 원칙

- 기존 문서를 일괄 갱신하지 않는다.
- 기존 schemaVersion 2 프로젝트는 현재 스키마로 계속 읽는다.
- V2 필드는 optional/default로 시작하고 Zod adapter에서 정규화한다.
- 기존 project item과 job ID를 V2 turn/asset에서 참조한다.
- 새 subcollection이 필요하면 Firestore rules와 indexes를 구현 단계에서 함께 검증한다.
- undefined를 저장하지 않고, nullable 필드는 스키마가 허용할 때만 null을 사용한다.

### 단계적 승격

1. 기존 프로젝트를 V2에서 읽기 전용 adapter로 연다.
2. 첫 캐릭터 승인 시 CharacterProfileVersion을 만든다.
3. 첫 대화 요청 시 CreationTurn을 만든다.
4. 기존 job 결과를 선택하거나 편집할 때 Asset view를 영속 asset으로 승격한다.
5. 기존 프로젝트 필드는 최신 승인 상태를 반영하는 호환 projection으로 유지한다.

이 전략은 대규모 데이터 마이그레이션 없이 기존 결과를 보존한다.

## 8. 플랫폼·출력 결손

### 현재 확인된 결손

- 클라이언트와 Functions의 `EMOTICON_EXPORT_FORMATS`에 `apng`가 없다.
- 렌더러에 APNG 출력 분기가 없다.
- LINE animated 프로필이 370×320, WebP/GIF/PNG ZIP 참조값으로 되어 있다.
- 수동 가져오기는 정지 PNG/JPEG/WebP 다중 선택을 지원하지만 GIF/WebP/APNG 애니메이션 컨테이너의 프레임 추출과 ZIP 입력은 지원하지 않는다.

### 구현 방향

- 공식 정책은 구현 당일 재확인하고 PolicySnapshot에 URL·확인일·검증 상태를 기록한다.
- LINE 움직이는 제출 형식은 APNG로 분리한다.
- GIF와 WebP는 공유/미리보기 또는 플랫폼별 출력 역할을 명확히 표시한다.
- 카카오 생성형 AI 정책 경고는 기술 규격 통과와 별도로 표시한다.
- 컨테이너 가져오기는 서버에서 MIME signature, 프레임 수, 해상도, 압축 폭탄, 총 용량, 소유권을 검증한 뒤 PNG 프레임으로 정규화한다.

공식 기준 URL:

- https://emoticonstudio.kakao.com/guideline
- https://emoticonstudio.kakao.com/webp-animator
- https://creator.line.me/en/guideline/sticker/
- https://creator.line.me/en/guideline/animationsticker/

## 9. 단계별 구현 순서

### 1단계: 계약과 플랫폼 기반

- APNG를 포함한 출력 계약
- CharacterProfileVersion, Asset, CreationTurn, Timeline 계약
- 기존 프로젝트 호환 adapter
- 클라이언트/Functions schema parity 검사

### 2단계: 캐릭터 분석 수직 흐름

- 기존 upload·fingerprint·profile job 재사용
- DNA 카드 편집·승인·버전 저장
- 간편 생성 전에 승인 프로필을 연결

### 3단계: 대화형 제작 workspace

- 자연어 Composer
- 구조화된 intent와 text cue
- CreationTurn 저장과 복원
- 결과 카드 stack

### 4단계: 생성 모드와 점진 결과

- efficient/premium 실행 계획
- 비용 예상과 승인
- checkpoint 기반 진행 표시
- 선택 프레임 보정과 variant

### 5단계: 전문 편집기 통합

- AssetTray
- FrameTimelinePanel
- ManualFrameImportPanel
- ImageEditPanel
- ResultHistoryComparePanel

### 6단계: 말풍선 트랙

- 기존 cue schema·renderer 유지
- 캔버스 직접 위치 조정
- 편집 preview와 최종 렌더 일치 검사

### 7단계: 품질·내보내기

- 캐릭터 일관성 문제와 선택 수정 연결
- APNG renderer와 검사
- 플랫폼 PolicySnapshot
- 제출 전 검사와 패키지

### 8단계: 브라우저 QA와 전환

- 1365px/390px 실제 브라우저 시나리오
- 로딩·오류·권한·느린 네트워크·취소·복구
- 키보드·focus-visible·reduced motion
- 기존 프로젝트 열기와 결과 다운로드 회귀
- V2 루트 전환과 임시 legacy 보존

## 10. 검증 전략

### 현재 기준선

다음 읽기 기반 검증은 2026-08-05 감사 시 통과했다.

- `verify-emoticon-project-v2.mjs`: 86개 계약 검사 통과
- `verify-emoticon-character-profile.mjs`: 통과
- `verify-emoticon-simple-mode.mjs`: 통과
- `verify-emoticon-platform-contract.mjs`: 현재 구현 계약 기준 통과
- `verify-emoticon-result-history.mjs`: 통과
- `verify-emoticon-bubble-controls.mjs`: 통과
- `verify-emoticon-manual-frame-import.mjs`: 통과

`verify-emoticon-live-upload.mjs`는 sandbox 안에서는 외부 네트워크 연결 차단으로 Firebase 호출 전에 실패했으나, 승인된 네트워크 범위에서 다시 실행해 배포 callable의 CORS와 미인증 HTTP 401 응답을 확인했다.

### 단계별 필수 검사

- 스키마 변경: `npm run type-check`
- Functions 변경: Functions TypeScript build
- 프로젝트 계약: `verify:emoticon-project-v2`
- 캐릭터: `verify:emoticon-character-profile`, `verify:emoticon-openrouter-safety`
- 간편 흐름: `verify:emoticon-simple-mode`, `verify:emoticon-live-upload`
- 프레임: `verify:emoticon-motion`, `verify:emoticon-manual-frames`, `verify:emoticon-editing`
- 말풍선: `verify:emoticon-bubbles`, `verify:emoticon-renderer`
- 플랫폼: `verify:emoticon-platform-contract`, `verify:emoticon-export-preflight`, `verify:emoticon-submission`
- 전체: `verify:emoticon-studio`
- UI: 데스크톱 1365px, 모바일 390px 실제 클릭과 screenshot/DOM 검사

검증 스크립트가 단순 문자열 존재만 확인하는 경우에는 런타임 fixture 또는 브라우저 시나리오를 추가한다.

## 11. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 매우 큰 `page.tsx` 수정으로 회귀 | V2를 별도 feature/route에서 조립하고 마지막에 얇은 route로 전환 |
| 이미 많은 사용자 변경과 충돌 | 관련 파일의 diff를 매 단계 확인하고 reset/checkout/대규모 재작성 금지 |
| 클라이언트/Functions schema 불일치 | 공유 fixture와 parity 검사 추가 |
| 기존 프로젝트가 새 필드 없이 실패 | optional/default adapter와 점진 승격 |
| OpenRouter 비용 중복 | 기존 fingerprint, job reuse, reservation, checkpoint 유지 |
| AI 문구 오탈자와 프레임 흔들림 | 말풍선을 이미지와 분리하고 text cue로 로컬 합성 |
| 애니메이션 가져오기 보안 | 서버 signature·크기·프레임·ownership 검증과 정규화 |
| 정책 변경 | PolicySnapshot과 공식 URL·checkedAt·verification 상태 |
| UI가 다시 설정 중심으로 복잡해짐 | 기본 5단계 경로와 progressive disclosure를 품질 gate로 고정 |

## 12. 0단계 완료 판정

- 기존 기능의 연결 상태를 확인했다.
- 재사용, 수정 후 재사용, 신규, 정리 후보를 구분했다.
- 기존 데이터의 일괄 마이그레이션 없이 V2를 도입하는 전략을 정의했다.
- V2를 별도 경로에서 검증한 뒤 루트로 전환하는 안전 경계를 정의했다.
- 다음 구현 단계의 실제 파일 범위와 검증 기준을 정했다.

## 13. 0~9단계 완료 기록

| 단계 | 완료 내용 | 대표 검증 |
| --- | --- | --- |
| 0 | 기존 기능 감사, 재사용 경계, 무중단 호환 전략 | 본 문서와 실제 파일 감사 |
| 1 | V2 계약, provenance, CreationTurn, Timeline, APNG, LINE 프로필 | 프로젝트 V2 99개 계약, 플랫폼·APNG 런타임 |
| 2 | 1~4장 캐릭터 분석, DNA v2, 품질·움직임 앵커, 모드별 캐시·비용 | 캐릭터 프로필, OpenRouter 안전성, Functions build |
| 3 | 캐릭터 등록·권리 확인·수정 가능한 DNA 카드·잠금 강도 | 브라우저 1365px/390px, UTF-8, 접근성 lint |
| 4 | GPT형 자연어 Composer, cue 해석, 대화 턴 저장·복원 | simple mode, intent fixture, V2 계약 |
| 5 | 빠르게/고품질, 점진 결과, 취소·복구·재시도·실제 비용 정산 | motion, job recovery, result history |
| 6 | 지연 로딩 전문 편집기, 프레임 다중 선택·재생·교체·복제·재정렬·시간, 어니언 스킨, undo/redo, 자동 저장, 기존 정지 컷·업로드·GIF/WebP/APNG/PNG ZIP 가져오기 | manual frame runtime, image editing, desktop/mobile QA |
| 7 | 분리된 벡터 말풍선 cue, 겹침 검증, 문구만 무비용 재합성 | bubble controls, renderer frame verification |
| 8 | 품질·플랫폼 검사, PNG/ZIP/GIF/WebP/APNG, 정책 snapshot | quality, platform, preflight, submission, renderer |
| 9 | 5단계 기본 UX, 모든 상태, 실제 브라우저 QA, V2 기본 전환, legacy 복구 | targeted lint, type-check, Next production build |

최종 기본 경로는 `/admin/emoticon-studio`이며 V2가 열린다. 기존 4,000줄 이상 구현은 삭제하지 않았고 `/admin/emoticon-studio?legacy=1`에서 복구할 수 있다. GIF·움직이는 WebP·APNG 가져오기는 최대 20MB, 2~24프레임, 프레임당 최대 4096×4096, 총 픽셀 상한, MIME signature, 관리자·프로젝트 소유권, 일별 업로드 한도를 서버에서 확인한 뒤 개별 PNG로 정규화한다.

2026-08-05 최종 검증에서는 데스크톱 1365×900과 모바일 390×844에서 DNA, 대화 결과, 전문 편집기, 내부 스크롤, 가로 넘침, 터치 크기, 한글 표시, 편집기 닫기를 직접 확인했다. 실제 유료 OpenRouter 생성은 추가 비용과 사용자 데이터 변경을 피하기 위해 QA fixture와 기존 완료 작업으로 검증했으며, 새 모델·공급자 조합의 실비 품질은 운영 전 소액 승인 한도에서 별도 확인한다. 배포, Git push, 기존 데이터 일괄 변경은 수행하지 않았다.

## 14. 완료 기록 재점검과 GPT형 UX 보완

2026-08-05 재점검에서 기존 완료 기록이 6단계의 세부 기능과 첫 진입 단순성을 넓게 표현하고 있음을 확인했다. 다음 누락을 실제 구현으로 보완했다.

- 프로젝트가 없을 때 설정 화면 대신 `이미지 1~4장 + 자연어 한 문장 + 분석 품질 + 권리 확인`만 보이는 빠른 시작 화면을 연다.
- 빠른 시작의 문장은 캐릭터 승인 뒤 Composer에 그대로 이어지고, 요청별 참고 이미지 2장을 별도로 첨부할 수 있다.
- DNA 카드는 핵심 얼굴·머리·의상·비율·움직임만 먼저 보여 주고, 편집·잠금·재분석은 펼쳐보기 안에 둔다.
- Composer는 움짤/정지, 빠르게/고품질을 바로 고르고 Enter로 전송하며, 세부 규격은 기본적으로 숨긴다.
- 전문 편집기는 프레임 다중 선택, 일괄 복제·삭제, 개별 교체, undo/redo, PNG ZIP 해제, IndexedDB 자동 저장·복원과 저장 상태를 제공한다.
- 성공적으로 가져온 프레임은 미리보기 URL을 해제하고 IndexedDB 임시 저장본을 직렬화된 쓰기 순서로 즉시 삭제해 오래된 초안이 되살아나는 경쟁 조건을 막는다.
- 모바일에서는 대화 입력창이 결과 카드를 가리지 않도록 일반 흐름으로 배치하고, DNA 확인 카드를 압축했다.
- 전문 편집기는 Esc 닫기, 배경 스크롤 차단, reduced-motion, 명시적 이미지 크기와 도구 선택 상태를 지원한다.

재검증 결과:

- `npm run type-check`: 통과
- 변경 파일 targeted ESLint: 오류·경고 없음
- `npm run verify:emoticon-studio`: 29단계 전체 통과, Functions 빌드 포함
- 배포된 원본 업로드 callable: CORS 사전 요청과 미인증 HTTP 401 거부 확인
- 실제 브라우저: 1365×900 및 390×844에서 시작, DNA, 대화, 전문 편집기, Esc 닫기, 한글, 가로 넘침, 모바일 결과/입력 비중첩 확인
- 카카오 공식 2026 운영 원칙에서 생성형 AI 제작 제안 제한을 재확인했고, 카카오 WebP 360×360·최대 24프레임과 LINE APNG 320×270·5~20프레임·최대 4초·1MB 조건을 재대조했다.

남은 운영 검증은 실제 유료 OpenRouter 호출을 이용한 신규 모델·공급자 조합의 결과 품질뿐이다. 이번 재점검에서는 비용 발생, 프로젝트 데이터 생성, 배포, Git push를 하지 않았다.
