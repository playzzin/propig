import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [startHub, composer, studioHook, resultCard, estimate, intent, subjectPrompt, jobService, styles] = await Promise.all([
  read('src/app/admin/emoticon-studio/studio/StudioStartHub.tsx'),
  read('src/app/admin/emoticon-studio/studio/CreationComposer.tsx'),
  read('src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts'),
  read('src/app/admin/emoticon-studio/studio/CreationResultCard.tsx'),
  read('src/lib/emoticonGenerationEstimate.ts'),
  read('src/lib/emoticonCreationIntent.ts'),
  read('src/lib/emoticonSubjectPrompt.ts'),
  read('src/services/emoticonStudioService.ts'),
  read('src/app/admin/emoticon-studio/studio/StudioShell.styles.ts'),
]);

const failures = [];
const requires = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message);
};

requires(startHub, /chooseMode\('ai'\)[\s\S]{0,220}?캐릭터 한 장으로 AI 제작/, 'AI 간편 시작 방식이 필요합니다.');
requires(startHub, /chooseMode\('frames'\)[\s\S]{0,220}?사진 여러 장으로 움짤 제작/, '사진 시작 방식이 필요합니다.');
requires(startHub, /chooseMode\('sheet'\)[\s\S]{0,220}?한 장 시트를 프레임으로 분할/, '시트 시작 방식이 필요합니다.');
requires(startHub, /onOpenProjects[\s\S]{0,260}?저장한 작업 이어서 편집/, '기존 프로젝트 시작 방식이 필요합니다.');
requires(startHub, /const limit = mode === 'ai' \? 4 : mode === 'sheet' \? 1 : 24/, 'AI·시트·사진 업로드 상한이 모드별로 적용되어야 합니다.');
requires(startHub, /combined\.slice\(limit\)\.forEach\(\(item\) => URL\.revokeObjectURL\(item\.url\)\)/, '상한을 넘긴 미리보기 URL을 해제해야 합니다.');
requires(startHub, /const availableSlots = mode === 'sheet' \? 1 : Math\.max\(0, maxFiles - previews\.length\)/, '시트 교체는 기존 미리보기 수와 무관하게 한 슬롯을 열어야 합니다.');
requires(startHub, /current\.forEach\(\(item\) => URL\.revokeObjectURL\(item\.url\)\)/, '시트 교체 시 기존 미리보기 URL을 해제해야 합니다.');
requires(startHub, /frameCount:\s*8/, '간편 애니메이션은 비용 안전한 8프레임으로 시작해야 합니다.');
requires(startHub, /a\.name\.localeCompare\(b\.name, undefined, \{ numeric: true, sensitivity: 'base' \}\)/, '사진 프레임은 자연 정렬되어야 합니다.');
requires(startHub, /aria-label="이모티콘 스튜디오 시작"/, '시작 허브에 접근성 이름이 필요합니다.');

requires(composer, /const \[quantity, setQuantity\] = useState\(\(\) => project\.emoticonType === 'static' \? 8 : 1\)/, '정지 세트는 8개, 움짤은 1개 job으로 시작해야 합니다.');
requires(composer, /const \[frameCount, setFrameCount\] = useState\(\(\) => project\.items\[0\]\?\.motion\.frameCount \|\| 8\)/, '움짤은 프로젝트 설정 또는 8프레임으로 시작해야 합니다.');
requires(composer, /고급 생성 설정/, '세부 옵션은 progressive disclosure로 제공되어야 합니다.');
requires(composer, /aria-label="고급 생성 품질"/, '품질 선택에 접근성 그룹 이름이 필요합니다.');
requires(composer, /estimateEmoticonAiCalls/, '실행 전 AI 호출량을 계산해야 합니다.');
requires(composer, /estimateEmoticonImageCallsMax/, '실행 전 최대 이미지 호출량을 계산해야 합니다.');
requires(composer, /estimatedMinUsd:[\s\S]{0,160}?estimatedMaxUsd:/, '실행 전 예상 비용 범위를 계산해야 합니다.');
requires(composer, /캐릭터 참고 이미지와 생성 요청이 OpenRouter 및 선택된 모델 공급자에게 전송되고/, '참조 이미지와 생성 요청의 외부 전송을 승인 전에 고지해야 합니다.');
requires(composer, /아직 이미지 provider를 호출하지 않았습니다/, '승인 전에는 provider 호출이 없음을 알려야 합니다.');
requires(composer, /parseEmoticonCreationIntent/, '자연어 요청을 로컬 생성 의도로 해석해야 합니다.');
requires(composer, /creationIntentNeedsConfirmation\(intent\)/, '출력 형식과 자연어 의도 불일치를 로컬에서 감지해야 합니다.');
requires(composer, /confirmations\.map\(\(message\) => <S\.Notice[\s\S]{0,160}?\{message\}/, '의도 확인 사항을 제작 전에 표시해야 합니다.');
requires(composer, /id="emoticon-v2-creation-prompt"/, '생성 요청 필드에 명시적 id가 필요합니다.');
requires(composer, /aria-describedby=\{formError && \(!prompt\.trim\(\) \|\| !intent\) \? 'emoticon-v2-creation-error' : undefined\}/, '생성 요청 자체 오류만 prompt 필드와 연결해야 합니다.');
requires(composer, /aria-invalid=\{Boolean\(formError && !frame\.direction\.trim\(\)\)\}/, '빈 프레임 설명 오류를 해당 입력과 연결해야 합니다.');
requires(composer, /firstEmpty\?\.focus\(\{ preventScroll: true \}\)/, '첫 빈 프레임 입력으로 포커스를 옮겨야 합니다.');
requires(composer, /prefers-reduced-motion: reduce/, '오류 이동은 reduced-motion 설정을 존중해야 합니다.');

requires(estimate, /const frames = Math\.max\(2, Math\.min\(24, Math\.round\(frameCount\)\)\)/, '비용 추정 프레임 수를 2~24로 제한해야 합니다.');
requires(estimate, /if \(outputType === 'static'\) return \{ min: 3, max: 5 \}/, '정지 생성의 텍스트·이미지 호출 범위를 보수적으로 계산해야 합니다.');
requires(estimate, /if \(resourceMode === 'efficient'\) return \{ min: 7, max: frames \+ 10 \}/, '효율 모드의 최대 호출량을 보수적으로 계산해야 합니다.');

requires(studioHook, /const selectedItems = generationItems\.slice\(0, itemCount\)/, '요청 수만큼 프로젝트 항목을 선택해야 합니다.');
requires(studioHook, /for \(const \[index, item\] of selectedItems\.entries\(\)\)/, '각 항목별 job을 명시적으로 생성해야 합니다.');
requires(studioHook, /await linkCreationTurnJobs\(\{ userId: currentUser\.uid, turn, jobIds: createdJobIds, formats \}\)/, '모든 job을 하나의 Turn에 연결해야 합니다.');
requires(studioHook, /normalizedIntent\.outputType === 'static'[\s\S]{0,100}?\['png'\]/, '정지 출력은 PNG로 제한되어야 합니다.');
requires(studioHook, /platformProfile\.allowedFormats\.includes\(format\)/, '움짤 출력은 플랫폼 허용 형식으로 제한되어야 합니다.');
requires(studioHook, /motionOverride:[\s\S]{0,180}?fps,[\s\S]{0,100}?frameCount:[\s\S]{0,100}?durationMs:/, '움짤 요청은 정규화된 모션 설정을 보내야 합니다.');
requires(studioHook, /createdJobIds\.length \? `\$\{message\} 시작된 \$\{createdJobIds\.length\}개 작업은 계속 진행됩니다/, '부분 enqueue 실패 시 시작된 작업의 진행을 명확히 알려야 합니다.');

requires(resultCard, /hasEmoticonSubjectGenerationMismatch/, '요청 주제 미생성 결과를 감지해야 합니다.');
requires(resultCard, /원본 합성 · 주제 미생성/, '원본 합성을 AI 생성 결과로 오인하지 않도록 표시해야 합니다.');
requires(resultCard, /새 주제로 다시 생성/, '주제 미생성 결과에 재생성 동작이 필요합니다.');
requires(resultCard, /props\.jobs\.length > 1/, '다중 생성 결과를 variant로 선택할 수 있어야 합니다.');
requires(resultCard, /aria-label="다른 생성 결과"/, '다중 결과 rail에 접근성 이름이 필요합니다.');

requires(intent, /export function parseEmoticonCreationIntent/, '자연어 생성 의도 해석이 독립 런타임 계약이어야 합니다.');
requires(subjectPrompt, /\[필수 주제 · 변경 금지\]/, 'variation 생성은 사용자 주제를 변경 금지로 표시해야 합니다.');
requires(subjectPrompt, /원문에 명시된 캐릭터·행동·표정·소품·상황·방향·문구를 모두 유지한다/, 'variation은 모든 명시적 주제 조건을 보존해야 합니다.');
requires(jobService, /hasEmoticonSubjectGenerationMismatch\(job\)[\s\S]*?job\.status !== 'completed'/, '주제 미생성 결과는 프레임 재사용에서 제외되어야 합니다.');

requires(styles, /@media \(max-width:\s*560px\)/, '간편 생성 UI는 좁은 모바일 레이아웃을 지원해야 합니다.');
requires(styles, /min-height:\s*44px/, '간편 생성 컨트롤은 44px 터치 높이를 가져야 합니다.');
assert.doesNotMatch(styles, /transition:\s*all\b/, '간편 생성에서 transition: all을 사용하면 안 됩니다.');
assert.deepEqual(failures, [], `간편 생성 계약 실패:\n- ${failures.join('\n- ')}`);

console.log('Emoticon Studio unified quick-creation contract passed.');
