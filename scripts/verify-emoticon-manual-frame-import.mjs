import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('../functions/node_modules/sharp');
const JSZip = require('../functions/node_modules/jszip');
const { renderImageSequenceEmoticon } = require('../functions/lib/emoticonStudio/renderer.js');
const {
  extractAnimationContainerFrames,
  extractEmoticonSpriteSheetFrames,
} = require('../functions/lib/emoticonStudio/animationContainer.js');
const {
  emoticonPlanSchema,
  emoticonManualFrameImportReportSchema,
  emoticonManualStoredPlanSchema,
} = require('../functions/lib/emoticonStudio/schema.js');
const {
  canonicalEmoticonRecoveryStartStage,
} = require('../functions/lib/emoticonStudio/recoveryPolicy.js');

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');

const frameDurationsMs = [90, 240, 510];
const totalDurationMs = frameDurationsMs.reduce((sum, duration) => sum + duration, 0);
const plan = {
  directorSummary: 'User-provided frames are assembled without an AI call.',
  characterProfile: {
    summary: 'Manual frame import; identity is not AI-verified.',
    immutableTraits: ['Preserve only the supplied pixels.'],
    palette: [],
    styleRules: ['Do not synthesize character details.'],
    negativeRules: ['Do not claim AI identity verification.'],
  },
  action: {
    title: '수동 프레임 애니메이션',
    emotion: '사용자 지정',
    action: '업로드한 순서대로 재생',
    intensity: 'normal',
    motionType: 'dynamic',
    renderMode: 'dynamic',
    durationMs: totalDurationMs,
    frameCount: frameDurationsMs.length,
    fps: Number(((frameDurationsMs.length * 1000) / totalDurationMs).toFixed(3)),
    loopDescription: 'Loop the ordered user-provided frames.',
    imagePrompt: 'No image-generation prompt is used for a manual frame import.',
    videoPrompt: 'No video-generation prompt is used for a manual frame import.',
    negativePrompt: 'No AI generation or semantic validation is performed.',
  },
  bubble: {
    text: '',
    style: 'none',
    position: 'top',
    entrance: 'none',
    font: 'clean',
    timeline: { mode: 'full', startFrame: 0, endFrame: null, cues: [] },
  },
  suggestedPresets: [],
};

assert.equal(emoticonPlanSchema.safeParse(plan).success, false, 'A 3-frame manual plan must not weaken the AI plan contract.');
assert.equal(emoticonManualStoredPlanSchema.safeParse(plan).success, true, 'The manual plan contract must preserve 1–24 frame metadata.');
assert.equal(emoticonManualFrameImportReportSchema.safeParse({
  schemaVersion: 1,
  technicalOnly: true,
  aiCalls: 0,
  identityVerified: false,
  motionVerified: false,
  sourceFrameCount: 24,
  timingMode: 'fps',
  frameDurationsMs: [],
}).success, true, 'Fixed 30 FPS imports must not be corrupted into rounded 33ms per-frame timing.');
assert.equal(canonicalEmoticonRecoveryStartStage('import_frames'), 'static-render');

const frameBuffers = await Promise.all([0, 1, 2].map(async (index) => sharp(Buffer.from(`
  <svg width="720" height="720" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="360" cy="390" rx="118" ry="154" fill="#59c7b5"/>
    <circle cx="322" cy="360" r="14" fill="#172033"/>
    <circle cx="398" cy="360" r="14" fill="#172033"/>
    <path d="M320 ${424 + index * 8} Q360 ${452 - index * 4} 404 ${420 + index * 7}" fill="none" stroke="#172033" stroke-width="14" stroke-linecap="round"/>
    <line x1="255" y1="420" x2="${170 - index * 22}" y2="${370 - index * 38}" stroke="#ff9c55" stroke-width="38" stroke-linecap="round"/>
  </svg>
`)).png().toBuffer()));

const outputs = await renderImageSequenceEmoticon({
  frameBuffers,
  plan,
  formats: ['webp', 'gif', 'mp4', 'webm', 'png_zip'],
  outputProfile: {
    platform: 'custom',
    type: 'animated',
    width: 160,
    height: 160,
    profileVersion: 'manual-frame-runtime-v1',
    verification: 'reference',
    transparentBackground: true,
    allowedFormats: ['webp', 'gif', 'mp4', 'webm', 'png_zip'],
  },
  frameDurationsMs,
});

assert.deepEqual(outputs.map((output) => output.format), ['webp', 'gif', 'mp4', 'webm', 'png_zip']);
for (const output of outputs) {
  assert.equal(output.inspection.passed, true, `${output.format} variable-timing output must pass inspection: ${output.inspection.issues.join('; ')}`);
  assert.equal(output.inspection.frameCount, frameDurationsMs.length, `${output.format} must keep every uploaded frame.`);
  assert.ok(
    output.inspection.durationMs === null
      || Math.abs(output.inspection.durationMs - totalDurationMs) <= Math.max(...frameDurationsMs),
    `${output.format} must keep the requested total duration.`,
  );
}

for (const format of ['webp', 'gif']) {
  const output = outputs.find((candidate) => candidate.format === format);
  const metadata = await sharp(output.buffer, { animated: true }).metadata();
  assert.deepEqual(metadata.delay, frameDurationsMs, `${format} must encode the requested per-frame delays.`);
  assert.equal(metadata.loop, 0, `${format} must loop indefinitely.`);
}

const extractedGifFrames = await extractAnimationContainerFrames(outputs.find((output) => output.format === 'gif').buffer);
assert.equal(extractedGifFrames.length, frameDurationsMs.length, 'Animated GIF import must recover every source frame.');
for (const frame of extractedGifFrames) {
  const metadata = await sharp(frame).metadata();
  assert.equal(metadata.format, 'png', 'Animation containers must normalize each extracted frame to PNG.');
}

const spriteCellSize = 256;
const spriteColumns = 4;
const spriteRows = 3;
const spriteSheetSvg = Buffer.from(`
  <svg width="${spriteCellSize * spriteColumns}" height="${spriteCellSize * spriteRows}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#00ff00"/>
    ${Array.from({ length: spriteColumns * spriteRows }, (_, index) => {
      const column = index % spriteColumns;
      const row = Math.floor(index / spriteColumns);
      const centerX = column * spriteCellSize + 128;
      const centerY = row * spriteCellSize + 128;
      const hue = index < 6 ? index * 10 : 190 + ((index - 6) * 20);
      const handX = centerX + 38 - ((index % 3) * 20);
      return `
        <ellipse cx="${centerX}" cy="${centerY + 18}" rx="58" ry="72" fill="hsl(${hue} 72% 46%)"/>
        <circle cx="${centerX}" cy="${centerY - 55}" r="36" fill="#ffd1a8"/>
        <line x1="${centerX}" y1="${centerY}" x2="${handX}" y2="${centerY - 8 - index}" stroke="#ffd1a8" stroke-width="22" stroke-linecap="round"/>
      `;
    }).join('')}
  </svg>
`);
const spriteSheetPng = await sharp(spriteSheetSvg).png().toBuffer();
const spriteExtraction = await extractEmoticonSpriteSheetFrames(spriteSheetPng);
assert.deepEqual(
  spriteExtraction.layout,
  { columns: spriteColumns, rows: spriteRows, frameCount: spriteColumns * spriteRows },
  'A regular 4x3 sheet must be detected as 12 row-major frames.',
);
assert.equal(spriteExtraction.frames.length, 12, 'A 4x3 sprite sheet must yield every cell.');
const spriteCenterColors = [];
for (const frame of spriteExtraction.frames) {
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, info.height);
  assert.ok(info.width >= spriteCellSize && info.width <= Math.ceil(spriteCellSize * 1.15));
  const cornerAlpha = data[3];
  assert.equal(cornerAlpha, 0, 'The connected green screen must become transparent in every sprite cell.');
  const centerX = Math.floor(info.width / 2);
  const centerY = Math.floor(info.height / 2) + 35;
  const centerOffset = ((centerY * info.width) + centerX) * info.channels;
  assert.ok(data[centerOffset + 3] > 220, 'Each extracted sprite cell must retain its central pose.');
  spriteCenterColors.push(`${data[centerOffset]}:${data[centerOffset + 1]}:${data[centerOffset + 2]}`);
}
assert.equal(new Set(spriteCenterColors).size, 12, 'Sprite cells must keep row-major pose/color order without duplication.');

const partialSpriteSheet = await sharp(Buffer.from(`
  <svg width="1024" height="768" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#00ff00"/>
    ${Array.from({ length: 10 }, (_, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      return `<circle cx="${column * 256 + 128}" cy="${row * 256 + 128}" r="52" fill="hsl(${index * 31} 75% 42%)" stroke="#172033" stroke-width="12"/>`;
    }).join('')}
  </svg>
`)).png().toBuffer();
const partialExtraction = await extractEmoticonSpriteSheetFrames(partialSpriteSheet);
assert.deepEqual(
  partialExtraction.layout,
  { columns: 4, rows: 3, frameCount: 10 },
  'A partial final row must preserve an arbitrary 2-24 requested frame count.',
);
assert.equal(partialExtraction.frames.length, 10, 'Empty trailing cells must not become fake frames.');

for (const fixture of [
  { background: '#00ff00', costume: '#00ff00', label: 'green costume on green chroma' },
  { background: '#ffffff', costume: '#ffffff', label: 'white costume on white matte' },
]) {
  const protectedInteriorSheet = await sharp(Buffer.from(`
    <svg width="512" height="256" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${fixture.background}"/>
      ${[0, 1].map((index) => `
        <rect x="${index * 256 + 68}" y="66" width="120" height="142" rx="45" fill="${fixture.costume}" stroke="#111827" stroke-width="14"/>
        <circle cx="${index * 256 + 128}" cy="76" r="32" fill="#ffd1a8" stroke="#111827" stroke-width="10"/>
      `).join('')}
    </svg>
  `)).png().toBuffer();
  const protectedExtraction = await extractEmoticonSpriteSheetFrames(protectedInteriorSheet, {
    columns: 2,
    rows: 1,
    frameCount: 2,
  });
  const { data, info } = await sharp(protectedExtraction.frames[0]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const centerOffset = ((Math.floor(info.height * 0.64) * info.width) + Math.floor(info.width / 2)) * info.channels;
  assert.ok(data[centerOffset + 3] > 240, `${fixture.label} must remain opaque inside its outline.`);
}

const pngZip = outputs.find((output) => output.format === 'png_zip');
const zip = await JSZip.loadAsync(pngZip.buffer);
const spriteManifest = JSON.parse(await zip.file('sprite-sheet.json').async('string'));
assert.deepEqual(spriteManifest.frames.map((frame) => frame.durationMs), frameDurationsMs);
assert.equal(spriteManifest.durationMs, totalDurationMs);

const clientSchema = readSource('src/schemas/emoticonStudio.ts');
const functionSchema = readSource('functions/src/emoticonStudio/schema.ts');
const service = readSource('src/services/emoticonStudioService.ts');
const trigger = readSource('functions/src/triggers/onEmoticonJobCreated.ts');
const recovery = readSource('functions/src/emoticonStudio/recoveryPolicy.ts');
const uploader = readSource('functions/src/emoticonStudio/manualFrameImport.ts');
const functionsIndex = readSource('functions/src/index.ts');
const studioPage = readSource('src/app/admin/emoticon-studio/studio/EmoticonStudioPage.tsx');
const studioHook = readSource('src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts');
const professionalEditor = readSource('src/app/admin/emoticon-studio/studio/ProfessionalEditor.tsx');
const resultCard = readSource('src/app/admin/emoticon-studio/studio/CreationResultCard.tsx');
const panel = readSource('src/app/admin/emoticon-studio/ManualFrameImportPanel.tsx');
const rules = readSource('firestore.rules');

for (const schema of [clientSchema, functionSchema]) {
  assert.match(schema, /import_frames/);
  assert.match(schema, /emoticonManualFrameImportSchema/);
  assert.match(schema, /emoticonManualStoredPlanSchema/);
}
assert.match(service, /submitEmoticonFrameImportJob/);
assert.match(service, /frame\.kind === 'completed-static'/);
assert.match(service, /copyCompletedStaticEmoticonFrame/);
assert.match(service, /extractEmoticonImportContainer/);
assert.match(service, /containerCount && \(containerCount !== 1 \|\| draftFrameCount !== 1\)/);
assert.match(service, /const jobId = crypto\.randomUUID\(\)/);
assert.match(service, /canReuseManualEmoticonFrames/);
assert.ok(
  trigger.indexOf("parsed.data.mode === 'import_frames'") < trigger.indexOf('reserveRateLimitSlot({'),
  'Manual imports must bypass OpenRouter cost/rate reservations.',
);
assert.ok(
  trigger.indexOf("parsed.data.mode === 'import_frames'") < trigger.indexOf('resolveEmoticonAiRuntime({'),
  'Manual imports must complete before OpenRouter runtime configuration is required.',
);
assert.match(trigger, /manualImportReport:[\s\S]*?technicalOnly: true[\s\S]*?aiCalls: 0[\s\S]*?identityVerified: false[\s\S]*?motionVerified: false/);
assert.match(trigger, /manualImportReport: frameDurationsMs \? \{[\s\S]*?\.\.\.parentReport,[\s\S]*?timingMode: 'per_frame',[\s\S]*?frameDurationsMs,[\s\S]*?\} : parentReport/);
assert.match(recovery, /mode === 'rerender' \|\| mode === 'import_frames'/);
assert.match(uploader, /ifGenerationMatch: 0/);
assert.match(uploader, /custom\.uploadedBy !== params\.uid/);
assert.match(uploader, /custom\.projectId !== params\.projectId/);
assert.match(uploader, /custom\.sha256 !== frame\.sha256/);
assert.match(functionsIndex, /uploadEmoticonImportFrame/);
assert.match(functionsIndex, /copyCompletedStaticEmoticonFrame/);
assert.match(functionsIndex, /extractEmoticonImportContainer/);
assert.match(uploader, /MAX_CONTAINER_BYTES = 20 \* 1024 \* 1024/);
assert.match(uploader, /detectContainerContentType/);
assert.match(uploader, /extractAnimationContainerFrames/);
assert.match(uploader, /extractEmoticonSpriteSheetFrames/);
assert.match(uploader, /extractedFromSpriteSheet/);
assert.match(uploader, /input\.contentType !== 'image\/png'/);
assert.match(uploader, /extractedFromSpriteSheet[\s\S]*?\? extractedFrames\[index\][\s\S]*?: await normalizeGeneratedEmoticonPose/);
assert.match(uploader, /export const copyCompletedStaticEmoticonFrame = onCall/);
assert.match(uploader, /sourceJob\.status !== 'completed'/);
assert.match(uploader, /outputProfile\.type !== 'static'/);
assert.match(uploader, /specReport\.frameCount !== 1/);
assert.match(uploader, /specReport\.technicalPass !== true/);
assert.match(uploader, /specReport\.allOutputsPass !== true/);
assert.match(uploader, /expectedPrefix = `users\/\$\{uid\}\/emoticon-studio\/jobs\/\$\{input\.sourceJobId\}\//);
assert.match(uploader, /copiedFromStaticJobId: params\.sourceJobId/);
assert.match(professionalEditor, /<ManualFrameImportPanel/);
assert.match(professionalEditor, /reusableFrames=\{reusableFrames\}/);
assert.match(professionalEditor, /job\.status === 'completed' && job\.outputProfile\?\.type === 'static' && job\.outputs\?\.png/);
assert.match(professionalEditor, /submitEmoticonFrameImportJob/);
assert.match(professionalEditor, /hasBubble=\{Boolean\(bubble\.text \|\| bubble\.timeline\.cues\.length\)\}/);
assert.match(studioHook, /maxResults: 60/);
assert.match(studioHook, /const startManualImport = useCallback/);
assert.match(studioPage, /onStartManual=\{async \(seed\) => \{[\s\S]{0,120}?seed\.spriteSheet \|\| seed\.files\[0\]/);
assert.match(resultCard, /기술 규격/);
for (const label of ['최근 완성 정지 컷에서 고르기', '내 이미지 추가', 'GIF·WebP·APNG·PNG ZIP 가져오기', '한 장 시트 자동 분할', '8컷 · 4×2', '스프라이트 시트 PNG', '왼쪽→오른쪽, 위→아래', '프레임 복제', '같은 속도', '장면별 시간', '출력 파일', '움직이는 파일 만들기']) {
  assert.ok(panel.includes(label), `Manual frame panel must expose “${label}”.`);
}
assert.match(rules, /validEmoticonManualFrameImport/);
assert.match(rules, /'generate', 'rerender', 'plan', 'profile', 'sheet_plan', 'import_frames', 'repair_frame'/);
assert.match(rules, /manualImportReport\.technicalOnly == true[\s\S]*?motion\.fps == get\(jobPath\)\.data\.plan\.action\.fps/);

console.log('Emoticon manual-frame import runtime, recovery, ownership, and UI contracts passed.');
