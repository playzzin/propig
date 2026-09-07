import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, studio, menuService, appLayout, siteHomeContent, packageJson, planRoute, hostingPlanRoute, hostingApi, schema, imageRoute, hostingGenerationRoute, gifWorker, zipWorker, convertRoute, hostingConversionRoute] = await Promise.all([
  readFile(new URL('../src/app/admin/emoticon-studio/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/admin/emoticon-studio/SemiAutoEmoticonStudio.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/menuService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppLayout.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/constants/siteHomeContent.ts', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/emoticon-studio/plan/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/api/hostingEmoticonStudioRoutes.ts', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/api/hostingApi.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/schemas/emoticonAnimationPreset.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/generate-image/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/api/hostingGenerationRoutes.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/admin/emoticon-studio/gif-encoder.worker.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/admin/emoticon-studio/zip-builder.worker.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/convert-image/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/api/hostingImageConversion.ts', import.meta.url), 'utf8'),
]);

assert.match(page, /SemiAutoEmoticonStudio/);
assert.match(page, /<SemiAutoEmoticonStudio\s*\/>/);
assert.match(menuService, /id:\s*['"]admin-22['"][\s\S]*?path:\s*['"]\/admin\/emoticon-studio['"]/);
assert.match(menuService, /applyAdminEmoticonStudioMenu/);
const retiredMenuBlock = menuService.match(/RETIRED_MENU_PATHS[\s\S]*?DEPRECATED_CORP_COMPANY_MENU_PATHS/)?.[0] ?? '';
assert.doesNotMatch(retiredMenuBlock, /\/admin\/emoticon-studio|admin-22/);
assert.match(appLayout, /case ['"]\/admin\/emoticon-studio['"]:[\s\S]*?반자동 이모티콘 스튜디오/);
assert.match(siteHomeContent, /반자동 이모티콘 스튜디오[\s\S]*?\/admin\/emoticon-studio/);
assert.doesNotMatch(page + studio, /\/admin\/image-generator/);
assert.match(studio, /AdminHomeLink href="\/admin" aria-label="관리자 홈으로 돌아가기"/);
assert.match(studio, /<ArrowLeft[^>]*aria-hidden="true"[^>]*\/>\s*<span>관리자 홈<\/span>/);

for (const contract of [
  '반자동 이모티콘 스튜디오',
  '관리자 홈으로 돌아가기',
  'ChatGPT 수동 · OpenRouter API 선택',
  '움짤의 움직임을 프레임으로 연출해요',
  '560도 회전 발차기',
  '손 흔들며 “안녕”',
  '연출 추가',
  '기본값 복원',
  '프리셋 저장',
  '프레임 추가',
  '전체 프롬프트 복사',
  'ChatGPT에서 프레임 만들기',
  '결과 가져오기',
  'AI로 기획',
  'OpenRouter로 기획',
  'OPENROUTER API · 자동 생성',
  '프레임 제작 현황',
  'FRAME PRODUCTION BOARD',
  '이번 자동 생성 수량',
  '이 프레임만 다시 생성',
  '부분 ZIP 내보내기',
  '네이버 OGQ',
  '사진 추가',
  '말풍선 추가',
  '레이어 X 위치',
  '레이어 크기',
  '실제 GIF 미리보기 만들기',
  'submission/${draft.platform}',
  "schemaVersion: 3",
  "kind: 'source' | 'frame' | 'layer'",
  "await import('gifenc')",
  '카카오 공식 WebPAnimator',
  'OGQ 애니메이션 스티커 세트',
  'safeArchiveSegment',
  'animations/${uniqueName}.gif',
  'README-WEBP-CONVERSION.txt',
  'submission/validation.json',
  'main-240x240.png',
  'tab-96x74.png',
  'DRAFT_RECOVERY_PREFIX',
  'stableFingerprint',
  'openai/gpt-image-2',
  'google/gemini-3.1-flash-lite-image',
  'google/gemini-3.1-flash-image',
  'x-ai/grok-imagine-image-2.0',
  '가성비·빠른',
  '퀄리티·고급',
  'ChatGPT 기획 JSON 가져오기',
  '생성 취소',
  '프레임 편집 워크스페이스',
  'GENERATED IMAGES',
  '캔버스 확대 비율',
  '움짤 미리보기',
  '원본 해상도 유지',
  '미완성 프레임 이어 생성',
  'FRAME TIMELINE',
  '프로젝트 ZIP 내보내기',
  '작업 ZIP 생성 완료 · 규격 참고값 충족',
  '작업 ZIP 생성 완료 · 제출 참고값 미충족',
  '로그인 후 자동 기획',
  'data-studio-ready',
  '필요한 화면부터 자유롭게 확인하세요',
  '아직 편집할 프레임이 없어요',
  'animated WebP 자동 변환',
  '선택 레이어 회전 핸들',
  '선택 레이어 크기 조절 핸들',
  '편집 실행 취소',
  'Worker 인코딩 취소',
  'data-model-preflight',
]) assert.ok(studio.includes(contract), `Missing semi-auto Studio contract: ${contract}`);

assert.match(studio, /https:\/\/chatgpt\.com\//);
assert.match(studio, /navigator\.clipboard/);
assert.match(studio, /indexedDB\.open/);
assert.match(studio, /import\(['"]jszip['"]\)/);
assert.match(studio, /MAX_FRAME_COUNT\s*=\s*48/);
assert.match(studio, /version:\s*3/);
assert.match(studio, /schemaVersion:\s*3/);
assert.match(studio, /transparent:\s*hasTransparency/);
assert.match(studio, /selectedSceneIds:\s*draft\.selectedSceneIds/);
assert.match(studio, /excludedFrameCount/);
assert.match(studio, /MobileProgress aria-label="모바일 제작 단계 자유 탐색"/);
assert.match(studio, /draftRef\.current\.frameMeta/);
assert.doesNotMatch(studio, /Math\.max\(0, palette\.findIndex/);
assert.match(studio, /keyframeIndex/);
assert.match(studio, /startNewPreset/);
assert.match(studio, /savePreset/);
assert.match(studio, /duplicatePreset/);
assert.match(studio, /deletePreset/);
assert.match(studio, /resetPresets/);
assert.match(studio, /image\/png/);
assert.match(studio, /image\/jpeg/);
assert.match(studio, /image\/webp/);
assert.match(studio, /project\.json/);
assert.match(studio, /prompts\.txt/);
assert.match(studio, /durationMs/);
const parserStart = studio.indexOf('function parseAndNormalizeDraft(rawJson: string): Draft');
const readDraftStart = studio.indexOf('function readDraft(): Draft');
assert.ok(parserStart >= 0 && readDraftStart > parserStart, 'raw draft parser/normalizer must exist before storage-backed readDraft');
const parserBlock = studio.slice(parserStart, readDraftStart);
assert.doesNotMatch(parserBlock, /window|localStorage|sessionStorage|indexedDB/, 'draft candidate parser must stay pure');
assert.match(studio.slice(readDraftStart, studio.indexOf('function openAssetDatabase')), /return parseAndNormalizeDraft\(raw\)/);
const importStart = studio.indexOf('const importProjectPackage = async');
const resetStart = studio.indexOf('const resetProject = async', importStart);
assert.ok(importStart >= 0 && resetStart > importStart, 'ZIP import block must exist');
const importBlock = studio.slice(importStart, resetStart);
const candidateParseIndex = importBlock.indexOf('parseAndNormalizeDraft(JSON.stringify(candidateRaw))');
const firstAssetWriteIndex = importBlock.indexOf('await putAsset');
const finalManifestCommitIndex = importBlock.indexOf('window.localStorage.setItem(DRAFT_KEY, JSON.stringify(importedDraft))');
assert.ok(candidateParseIndex >= 0 && candidateParseIndex < firstAssetWriteIndex, 'ZIP manifest candidate must be normalized before asset writes');
assert.ok(finalManifestCommitIndex > importBlock.lastIndexOf('await putAsset'), 'final manifest commit must happen after every imported Blob write');
assert.doesNotMatch(importBlock.slice(0, finalManifestCommitIndex), /localStorage\.setItem\(DRAFT_KEY/, 'candidate validation must not overwrite the canonical draft key');
assert.equal((importBlock.match(/localStorage\.setItem\(DRAFT_KEY/g) || []).length, 1, 'ZIP import must have one explicit canonical manifest commit');
assert.match(importBlock, /readProjectAssets\(importedProjectId\)[\s\S]*?deleteAsset\(importedProjectId, asset\.assetId\)/);
assert.match(importBlock, /if \(previousObjectUrls\.has\(url\)\) continue;[\s\S]*?URL\.revokeObjectURL\(url\)/);
assert.match(studio, /\/api\/emoticon-studio\/plan/);
for (const planContract of [schema, hostingPlanRoute]) {
  assert.match(planContract, /consentFingerprint:\s*z\.string\(\)\.trim\(\)\.min\(8\)\.max\(128\)/);
}
for (const planHandler of [planRoute, hostingPlanRoute]) {
  assert.match(planHandler, /requestFingerprint/);
  assert.match(planHandler, /providerSubmitted\s*\?\s*'uncertain'\s*:\s*'failed'/);
}
assert.match(planRoute, /finishOperation\(auth\.uid, input\.operationId, 'uncertain'\)/);
const hostingSecurity = await readFile(new URL('../functions/src/api/security.ts', import.meta.url), 'utf8');
assert.match(hostingSecurity, /collection\('serverRateLimits'\)/);
assert.match(studio, /\/api\/generate-image/);
assert.match(studio, /AbortController/);
assert.match(studio, /new Worker\(new URL\('\.\/gif-encoder\.worker\.ts'/);
assert.match(studio, /worker\.postMessage\(\{ type: 'start', repeat: options\.repeat \?\? 0, total: options\.total \}\)/);
assert.match(studio, /worker\.postMessage\(\{ type: 'frame',[\s\S]*?\}, \[rgba\]\)/);
assert.match(studio, /frameResolve = resolve/);
assert.match(studio, /options\.signal\?\.aborted/);
assert.match(gifWorker, /event\.data\.type === 'start'/);
assert.match(gifWorker, /event\.data\.type === 'frame'/);
assert.match(gifWorker, /event\.data\.type === 'finish'/);
assert.match(gifWorker, /\n\s*repeat,\n/);
assert.match(gifWorker, /GIFEncoder/);
assert.match(gifWorker, /const ack: GifWorkerResponse = \{ type: 'frame-ack'/);
assert.match(gifWorker, /const complete: GifWorkerResponse = \{ type: 'complete'/);
assert.match(gifWorker, /self\.postMessage\(complete, \{ transfer: \[bytes\] \}\)/);
assert.match(studio, /new Worker\(new URL\('\.\/zip-builder\.worker\.ts'/);
assert.match(studio, /worker\.terminate\(\)/);
assert.match(zipWorker, /zip\.generateAsync/);
assert.match(zipWorker, /self\.postMessage\(response, \{ transfer: \[buffer\] \}\)/);
assert.doesNotMatch(studio, /composedCanvases/);
assert.match(studio, /await activeGifStream\.addCanvas/);
assert.match(studio, /canvas\.width = 1/);
assert.match(studio, /drag\.element\.style\.left/);
assert.match(studio, /applyTransformToTarget\(drag\.target/);
assert.match(studio, /snapCanvasValue/);
assert.match(studio, /undoHistoryRef/);
assert.match(studio, /redoHistoryRef/);
assert.match(studio, /TransformOverlay/);
assert.match(studio, /TransformHandle/);
assert.match(studio, /\/api\/convert-image/);
assert.match(studio, /animations\/\$\{uniqueName\}\.webp/);
assert.match(studio, /X-Image-Pages/);
for (const conversionRoute of [convertRoute, hostingConversionRoute]) {
  assert.match(conversionRoute, /preserveAnimation/);
  assert.match(conversionRoute, /image\/webp/);
  assert.match(conversionRoute, /X-Image-Pages/);
  assert.match(conversionRoute, /X-Image-Animated/);
  assert.match(conversionRoute, /X-Image-Loop/);
  assert.match(conversionRoute, /X-Image-Alpha/);
}
assert.match(studio, /const operationId = crypto\.randomUUID\(\)/);
assert.doesNotMatch(studio, /function stableOperationId/);
assert.match(studio, /key: `\$\{draftRef\.current\.projectId\}:\$\{meta\.id\}`/);
assert.doesNotMatch(studio, /key: `\$\{projectId\}:frame:/);
assert.match(studio, /generationRunRef\.current === runId && draftRef\.current\.projectId === runProjectId/);
assert.match(studio, /undoHistoryRef\.current = \[\]/);
assert.match(studio, /expectedLoop:/);
assert.match(studio, /packageChecks/);
assert.match(studio, /official-required-item-count/);
assert.match(studio, /animationGroups\.size === 24/);
assert.match(studio, /sceneWebpGeneratedCount === 3/);
assert.match(studio, /naver-main-tab-set/);
assert.match(studio, /const failedReferenceCount = validationFiles\.filter\(\(item\) => !item\.pass\)\.length[\s\S]*?item\.id !== 'file-size-reference-checks'/);
assert.match(studio, /if \(allPassed\) toast\.success\('작업 ZIP 생성 완료 · 규격 참고값 충족'\)/);
assert.match(studio, /else toast\.warning\(`작업 ZIP 생성 완료 · 제출 참고값 미충족 \$\{failedReferenceCount\}개`\)/);
assert.match(studio, /disabled=\{!currentUser \|\| planning \|\| !actionDescription\.trim\(\) \|\| !hasApiConsent\}/);
assert.match(studio, /!currentUser \? '로그인 후 자동 기획' : planning \? '기획 중…' : 'OpenRouter로 기획'/);
assert.match(studio, /if \(!currentUser\) return toast\.error\('OpenRouter 자동 기획은 로그인이 필요합니다\.'\)/);
assert.match(studio, /setCanvasZoom/);
assert.match(studio, /setPreviewing/);
assert.match(studio, /frames\[\(currentIndex \+ 1\) % frames\.length\]/);
assert.match(studio, /grid-template-columns:220px 250px minmax\(400px,1fr\) 300px/);
assert.match(studio, /grid-template-rows:48px minmax\(380px,1fr\) 184px/);
assert.match(studio, /grid-template-columns:108px minmax\(0,1fr\)/);
assert.match(studio, /@media\(max-width:1280px\)[\s\S]{0,180}display:none/);
assert.match(studio, /@media\(max-width:980px\)[\s\S]{0,180}flex-direction:column/);
assert.match(appLayout, /isImmersiveStudio\s*=\s*pathname === '\/admin\/emoticon-studio'/);
assert.match(studio, /overflow-y:auto/);
assert.match(studio, /background:\s*var\(--studio-bg\)/);
assert.match(studio, /missingSlots\.slice\(0, generationBatchSize\)/);
assert.match(studio, /frameSlotKey/);
assert.match(studio, /generateFramesWithOpenRouter\(\[selectedSlot\], selectedFrame\.id\)/);
assert.match(studio, /if \(!next\.length\) setStep\('import'\)/);
assert.match(studio, /ref=\{frameInputRef\}[\s\S]{0,180}multiple type="file"/);
assert.match(studio, /!missingSlots\.length && expectedSlots\.length > 0/);
assert.match(studio, /model:\s*selectedGenerationModel/);
assert.match(studio, /quality:\s*generationMode === 'fast' \? 'low' : 'high'/);
assert.match(studio, /const StepFooter[\s\S]{0,300}position:static/);
assert.match(studio, /type StepId = 'project' \| 'character' \| 'plan' \| 'import' \| 'edit' \| 'export'/);
const freeNavigationBlock = studio.match(/const goToStep = \(next: StepId\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
assert.match(freeNavigationBlock, /setStep\(next\)/);
assert.doesNotMatch(freeNavigationBlock, /canPlan|canImport|canEdit|toast\.error/);
assert.match(packageJson, /verify:emoticon-studio-navigation/);
assert.match(imageRoute, /z\.enum\(STUDIO_IMAGE_MODELS\)/);
assert.match(imageRoute, /selectionSource:\s*'requested'/);
assert.match(imageRoute, /body\.quality = params\.payload\.quality/);
assert.match(hostingGenerationRoute, /z\.enum\(STUDIO_IMAGE_MODELS\)/);
assert.match(hostingGenerationRoute, /selectionSource:\s*'requested'/);
assert.match(hostingGenerationRoute, /body\.quality = params\.payload\.quality/);
assert.match(planRoute, /EMOTICON_STUDIO_IMAGE_MODEL = 'openai\/gpt-image-2'/);
assert.match(hostingPlanRoute, /EMOTICON_STUDIO_IMAGE_MODEL = 'openai\/gpt-image-2'/);
for (const serverRoute of [planRoute, hostingPlanRoute]) {
  assert.match(serverRoute, /\/api\/v1\/images\/models/);
  assert.match(serverRoute, /imageOutput/);
  assert.match(serverRoute, /referenceInput/);
  assert.match(serverRoute, /pricing/);
  assert.match(serverRoute, /AbortSignal\.timeout\(15_000\)/);
}
assert.doesNotMatch(studio, /OPENAI_API_KEY|OPENROUTER_API_KEY|openRouterApiKey|fetch\(['"]https:\/\/api\.openrouter\.ai/);
for (const serverRoute of [planRoute, hostingPlanRoute]) {
  assert.match(serverRoute, /photoManagement/);
  assert.match(serverRoute, /emoticon-animation-plan-minute/);
  assert.match(serverRoute, /emoticon-animation-plan-day/);
  assert.match(serverRoute, /aiOperationReservations/);
  assert.match(serverRoute, /runManagedTextChat|runOpenRouterText/);
  assert.doesNotMatch(serverRoute, /process\.env\.NEXT_PUBLIC_OPENROUTER|details:\s*raw/);
}
assert.match(hostingApi, /\/api\/emoticon-studio\/plan/);
assert.match(hostingApi, /handleEmoticonAnimationPlan/);
assert.match(schema, /EMOTICON_ANIMATION_MAX_FRAMES\s*=\s*16/);
assert.match(schema, /durationMs/);
assert.match(schema, /imagePrompt/);
assert.match(packageJson, /"verify:emoticon-studio-ui"\s*:\s*"node scripts\/verify-semi-auto-emoticon-studio\.mjs"/);

console.log('Semi-auto Emoticon Studio UI contracts passed.');
