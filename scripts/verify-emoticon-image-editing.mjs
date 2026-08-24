import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('../functions/node_modules/sharp');
const JSZip = require('jszip');
const {
  renderImageEmoticon,
  renderImageSequenceEmoticon,
} = require('../functions/lib/emoticonStudio/renderer.js');
const {
  emoticonImageEditRecipeSchema,
} = require('../functions/lib/emoticonStudio/schema.js');

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');

const identityRecipe = (revision = 0) => ({
  schemaVersion: 1,
  revision,
  crop: { left: 0, right: 0, top: 0, bottom: 0 },
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  flipHorizontal: false,
  rotationDeg: 0,
  transparentPadding: 0,
});

const noBubble = {
  text: '',
  style: 'none',
  position: 'top',
  entrance: 'none',
  font: 'clean',
  timeline: { mode: 'full', startFrame: 0, endFrame: null, cues: [] },
};

function plan(frameCount, bubble = noBubble, renderMode = 'dynamic') {
  const fps = frameCount === 24 ? 12 : 8;
  return {
    directorSummary: 'Non-destructive image-edit contract test',
    characterProfile: {
      summary: 'Asymmetric mint test character',
      immutableTraits: ['mint body', 'orange left arm'],
      palette: ['mint', 'orange', 'navy'],
      styleRules: ['clean transparent illustration'],
      negativeRules: ['no background'],
    },
    action: {
      title: renderMode === 'dynamic' ? '24프레임 동작' : '정지 표정',
      emotion: '기쁨',
      action: '손을 흔든다',
      intensity: 'normal',
      motionType: renderMode === 'dynamic' ? 'dynamic' : 'bob',
      renderMode,
      durationMs: Math.round((frameCount / fps) * 1000),
      frameCount,
      fps,
      loopDescription: '첫 프레임으로 자연스럽게 돌아온다',
      imagePrompt: 'A clean asymmetric mint character waving one orange arm.',
      videoPrompt: 'The character completes one clear waving loop.',
      negativePrompt: 'background, text, watermark',
    },
    bubble,
    suggestedPresets: [],
  };
}

async function makeFrame(index, size = 720) {
  const handY = 230 + (index % 4) * 24;
  return sharp(Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="360" cy="385" rx="150" ry="205" fill="#64d8bf"/>
      <circle cx="315" cy="330" r="18" fill="#182536"/>
      <circle cx="405" cy="330" r="18" fill="#182536"/>
      <path d="M315 430 Q360 465 410 425" fill="none" stroke="#182536" stroke-width="18" stroke-linecap="round"/>
      <line x1="220" y1="390" x2="95" y2="${handY}" stroke="#ff9a55" stroke-width="52" stroke-linecap="round"/>
      <line x1="500" y1="390" x2="610" y2="465" stroke="#64d8bf" stroke-width="52" stroke-linecap="round"/>
    </svg>
  `)).png().toBuffer();
}

async function zipFrames(output) {
  const zip = await JSZip.loadAsync(output.buffer);
  const names = Object.keys(zip.files)
    .filter((name) => /^frames\/frame-\d{3}\.png$/.test(name))
    .sort();
  return Promise.all(names.map((name) => zip.file(name).async('nodebuffer')));
}

async function edgeAlpha(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  let maximum = 0;
  for (let x = 0; x < info.width; x += 1) {
    maximum = Math.max(maximum, alphaAt(x, 0), alphaAt(x, info.height - 1));
  }
  for (let y = 0; y < info.height; y += 1) {
    maximum = Math.max(maximum, alphaAt(0, y), alphaAt(info.width - 1, y));
  }
  return maximum;
}

const staticSource = await makeFrame(0);
const staticPlan = plan(8, noBubble, 'keyframes');
const staticProfile = {
  platform: 'custom',
  type: 'static',
  width: 360,
  height: 360,
  profileVersion: 'edit-static-test-v1',
  verification: 'reference',
  transparentBackground: true,
  submissionCandidate: false,
};
const [staticOriginal] = await renderImageEmoticon({
  imageBuffer: staticSource,
  plan: staticPlan,
  formats: ['png'],
  outputProfile: staticProfile,
});
const [staticIdentityReset] = await renderImageEmoticon({
  imageBuffer: staticSource,
  plan: staticPlan,
  formats: ['png'],
  outputProfile: staticProfile,
  editRecipe: identityRecipe(7),
});
assert.equal(staticOriginal.inspection.passed, true, 'Static edited output must pass encoded inspection.');
assert.equal(staticOriginal.inspection.frameCount, 1, 'Static output must remain exactly one frame.');
assert.equal(staticOriginal.inspection.hasAlpha, true, 'Static PNG must preserve alpha.');
assert.deepEqual(
  staticIdentityReset.buffer,
  staticOriginal.buffer,
  'Reset/identity recipe must reproduce the original render byte-for-byte.',
);

const parsedLegacyRecipe = emoticonImageEditRecipeSchema.parse(identityRecipe(8));
assert.equal(parsedLegacyRecipe.brightness, 0, 'Legacy recipes must default brightness to neutral.');
assert.equal(parsedLegacyRecipe.contrast, 0, 'Legacy recipes must default contrast to neutral.');
assert.equal(parsedLegacyRecipe.saturation, 0, 'Legacy recipes must default saturation to neutral.');
for (const field of ['brightness', 'contrast', 'saturation']) {
  assert.equal(
    emoticonImageEditRecipeSchema.safeParse({ ...identityRecipe(), [field]: 0.51 }).success,
    false,
    `${field} must reject values above the safe upper bound.`,
  );
  assert.equal(
    emoticonImageEditRecipeSchema.safeParse({ ...identityRecipe(), [field]: -0.51 }).success,
    false,
    `${field} must reject values below the safe lower bound.`,
  );
}

const colorRecipe = {
  ...identityRecipe(9),
  brightness: 0.2,
  contrast: 0.15,
  saturation: -0.25,
};
const [colorAdjusted] = await renderImageEmoticon({
  imageBuffer: staticSource,
  plan: staticPlan,
  formats: ['png'],
  outputProfile: staticProfile,
  editRecipe: colorRecipe,
});
assert.equal(colorAdjusted.inspection.passed, true, 'Color-adjusted output must pass encoded inspection.');
assert.notDeepEqual(colorAdjusted.buffer, staticOriginal.buffer, 'A non-neutral color recipe must alter RGB output.');
const originalPixels = await sharp(staticOriginal.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const adjustedPixels = await sharp(colorAdjusted.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.deepEqual(adjustedPixels.info, originalPixels.info, 'Color adjustments must preserve the output geometry and channels.');
for (let index = 3; index < originalPixels.data.length; index += originalPixels.info.channels) {
  assert.equal(
    adjustedPixels.data[index],
    originalPixels.data[index],
    `Color adjustments must preserve alpha at pixel ${Math.floor(index / originalPixels.info.channels)}.`,
  );
}

const frameCount = 24;
const frameBuffers = await Promise.all(Array.from({ length: frameCount }, (_, index) => makeFrame(index)));
const bubble = {
  text: '좋아요!',
  style: 'rounded',
  position: 'top',
  entrance: 'none',
  font: 'round',
  timeline: { mode: 'full', startFrame: 0, endFrame: null, cues: [] },
};
const editedRecipe = {
  schemaVersion: 1,
  revision: 3,
  crop: { left: 0.08, right: 0.03, top: 0.02, bottom: 0.06 },
  scale: 1.6,
  offsetX: 0.45,
  offsetY: -0.45,
  flipHorizontal: true,
  rotationDeg: 45,
  transparentPadding: 0.2,
  brightness: 0.2,
  contrast: 0.15,
  saturation: -0.25,
};
const [editedAnimation] = await renderImageSequenceEmoticon({
  frameBuffers,
  plan: plan(frameCount, bubble),
  formats: ['png_zip'],
  editRecipe: editedRecipe,
});
assert.equal(editedAnimation.inspection.passed, true, '24-frame edited sequence must pass output inspection.');
assert.equal(editedAnimation.inspection.frameCount, frameCount, 'Editing must preserve all 24 source frames.');
assert.equal(editedAnimation.inspection.hasAlpha, true, 'Edited PNG sequence must preserve alpha.');
const editedFrames = await zipFrames(editedAnimation);
assert.equal(editedFrames.length, frameCount, 'PNG ZIP must contain every edited frame.');
for (const [index, frame] of editedFrames.entries()) {
  const metadata = await sharp(frame).metadata();
  assert.equal(metadata.width, 360, `Frame ${index + 1} width must remain inside the output canvas.`);
  assert.equal(metadata.height, 360, `Frame ${index + 1} height must remain inside the output canvas.`);
  assert.equal(await edgeAlpha(frame), 0, `Frame ${index + 1} must not overflow the transparent canvas edge.`);
}

const [withoutBubble] = await renderImageSequenceEmoticon({
  frameBuffers,
  plan: plan(frameCount, noBubble),
  formats: ['png_zip'],
  editRecipe: editedRecipe,
});
const [withBubbleFrame] = editedFrames;
const [withoutBubbleFrame] = await zipFrames(withoutBubble);
assert.notDeepEqual(
  withBubbleFrame,
  withoutBubbleFrame,
  'Speech-bubble composition must remain part of the edited render pipeline.',
);

const clientSchema = readSource('src/schemas/emoticonStudio.ts');
const functionSchema = readSource('functions/src/emoticonStudio/schema.ts');
const projectSchema = readSource('src/schemas/emoticonProject.ts');
const service = readSource('src/services/emoticonStudioService.ts');
const trigger = readSource('functions/src/triggers/onEmoticonJobCreated.ts');
const rules = readSource('firestore.rules');
const editor = readSource('src/app/admin/emoticon-studio/ImageEditPanel.tsx');
const renderer = readSource('functions/src/emoticonStudio/renderer.ts');

assert.match(clientSchema, /emoticonImageEditRecipeSchema/);
assert.match(functionSchema, /renderOverrides:[\s\S]*?editRecipe: emoticonImageEditRecipeSchema\.optional/);
assert.match(projectSchema, /editRecipe:[\s\S]*?editHistory:/);
assert.match(service, /createEditedEmoticonJob[\s\S]*?crypto\.randomUUID\(\)/);
assert.match(service, /parentJobId: params\.parentJob\.id[\s\S]*?editRecipe/);
assert.match(service, /retryEditRecipe = params\.job\.editRecipe \|\| params\.job\.renderOverrides\?\.editRecipe/);
assert.match(service, /parentJob: params\.job[\s\S]*?editRecipe: retryEditRecipe/);
assert.match(trigger, /renderImageSequenceEmoticon\([\s\S]*?editRecipe/);
assert.match(trigger, /renderImageEmoticon\([\s\S]*?editRecipe/);
assert.match(trigger, /assertRenderedFilesPassedInspection\(files\)/);
assert.match(trigger, /resultJobId: params\.jobId[\s\S]*?editHistory: synchronizedEditHistory/);
assert.match(rules, /validEmoticonImageEditRecipe/);
for (const field of ['brightness', 'contrast', 'saturation']) {
  assert.match(clientSchema, new RegExp(`${field}:[\\s\\S]*?min\\(-0\\.5\\)[\\s\\S]*?max\\(0\\.5\\)[\\s\\S]*?default\\(0\\)`));
  assert.match(functionSchema, new RegExp(`${field}:[\\s\\S]*?min\\(-0\\.5\\)[\\s\\S]*?max\\(0\\.5\\)[\\s\\S]*?default\\(0\\)`));
  assert.ok(editor.includes(field === 'brightness' ? '밝기' : field === 'contrast' ? '대비' : '채도'));
  assert.match(rules, new RegExp(`${field} >= -0\\.5 && recipe\\.${field} <= 0\\.5`));
}
const brightnessOrder = renderer.indexOf('if (brightness !== 0)');
const contrastOrder = renderer.indexOf('if (contrast !== 0)');
const saturationOrder = renderer.indexOf('if (saturation !== 0)');
assert.ok(
  brightnessOrder >= 0 && brightnessOrder < contrastOrder && contrastOrder < saturationOrder,
  'Renderer must materialize brightness, contrast, and saturation in a deterministic order.',
);
for (const label of ['중앙 정렬', '좌우 반전', '원본 복원', '원본 비교', '확대·축소', '가로 위치', '세로 위치', '회전', '투명 여백', '가장자리 자르기', '편집본 만들기']) {
  assert.ok(editor.includes(label), `Image editor must expose “${label}”.`);
}

console.log('Emoticon image-edit runtime and source contracts passed.');
