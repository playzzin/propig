# AI 움직이는 이모티콘 스튜디오 실행 안내

## 화면 열기

```powershell
npm run dev
```

관리자 계정으로 `/admin/emoticon-studio`를 엽니다. 기존 `?legacy=1` 주소도 같은 통합 작업 공간으로 연결됩니다. 프로젝트 JSON 백업·복원과 전체 작업 이력은 화면의 **고급 도구**에서 사용할 수 있습니다.

## 비용 없는 Mock 모드

브라우저 번들의 `.env.local`:

```dotenv
NEXT_PUBLIC_EMOTICON_STUDIO_PROVIDER=mock
NEXT_PUBLIC_USE_FUNCTIONS_EMULATOR=true
NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST=localhost
NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT=5001
```

Firebase Functions 로컬 런타임:

```dotenv
EMOTICON_STUDIO_PROVIDER=mock
```

브라우저와 Functions 값을 함께 설정하면 OpenRouter 키 없이 결정적인 캐릭터 분석·동작 계획·PNG 프레임·스프라이트 시트를 만들며 외부 AI 요청이나 AI 비용이 발생하지 않습니다. Functions 에뮬레이터를 먼저 실행하고 다시 시작한 뒤 사용합니다. 현재 앱은 Firestore·Storage·Auth 에뮬레이터에 자동 연결하지 않으므로, 격리된 테스트 데이터는 `/admin/emoticon-studio/v2/preview`와 `npm run verify:emoticon-ui`에서 검증합니다.

## 실제 OpenRouter 모드

Mock 변수를 제거하거나 서버의 `EMOTICON_STUDIO_PROVIDER`를 `openrouter`로 설정합니다. 키와 모델 ID는 서버에만 둡니다.

```dotenv
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...
OPENROUTER_IMAGE_MODEL=...
```

운영 Functions에서는 `OPENROUTER_API_KEY`를 Firebase Secret으로 관리합니다. `NEXT_PUBLIC_` 이름으로 API 키를 만들면 안 됩니다. 실제 생성 버튼은 예상 호출 수·비용·시간과 참조 이미지 전송 안내를 보여 준 뒤 명시적인 확인을 받습니다.

## 안전한 로컬 검증

```powershell
npm run type-check
npm run verify:emoticon-studio
npm run build
```

전체 스튜디오 검증은 외부 원본 업로드를 기본적으로 건너뜁니다. 배포된 Functions를 확인하는 테스트는 별도 승인 후 `EMOTICON_RUN_LIVE_UPLOAD_TEST=true`를 명시한 경우에만 실행합니다.

## 저장 위치

- 프로젝트·항목·대화 턴·캐릭터 프로필·타임라인: 사용자 범위 Firestore
- 원본·생성 프레임·내보내기 파일: 사용자 범위 Firebase Storage
- 작성 중 요청과 수동 프레임 Blob: 브라우저 localStorage/IndexedDB 자동 저장
- 이미지 보관함 즐겨찾기·휴지통 표시: 브라우저와 프로젝트별 localStorage

브라우저 초안에는 `File` 또는 `Blob` 자체를 넣지 않습니다. 새로고침 뒤 업로드 파일을 다시 선택해야 하며, 수동 프레임 편집기의 Blob 복원은 별도 IndexedDB 저장소가 담당합니다.
