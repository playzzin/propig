import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('../functions/node_modules/sharp');
const {
  EMOTICON_BUBBLE_APPEARANCE_DEFAULTS,
  emoticonBubbleSchema,
  emoticonBubbleTimelineSchema,
} = require('../functions/lib/emoticonStudio/schema.js');
const {
  renderImageSequenceEmoticon,
} = require('../functions/lib/emoticonStudio/renderer.js');

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');

const legacyBubble = emoticonBubbleSchema.parse({
  text: '안녕!',
  style: 'rounded',
  position: 'top',
  entrance: 'none',
  font: 'clean',
});
for (const [key, value] of Object.entries(EMOTICON_BUBBLE_APPEARANCE_DEFAULTS)) {
  assert.equal(legacyBubble[key], value, `Legacy bubbles must receive the ${key} default.`);
}
assert.equal(emoticonBubbleSchema.safeParse({
  ...legacyBubble,
  fillColor: 'red',
}).success, false, 'Non-hex colors must be rejected.');
assert.equal(emoticonBubbleSchema.safeParse({
  ...legacyBubble,
  offsetX: 49,
}).success, false, 'Unsafe bubble offsets must be rejected.');
assert.equal(emoticonBubbleSchema.safeParse({
  ...legacyBubble,
  shadowOpacity: 0.8,
}).success, false, 'Unsafe shadow opacity must be rejected.');
assert.equal(emoticonBubbleTimelineSchema.safeParse({
  mode: 'cues',
  startFrame: 0,
  endFrame: 7,
  cues: [
    { id: 'first', text: '거기서!!', startFrame: 0, endFrame: 4 },
    { id: 'second', text: '서란 말이야', startFrame: 4, endFrame: 7 },
  ],
}).success, false, 'Overlapping text cue ranges must be rejected.');
assert.equal(emoticonBubbleTimelineSchema.safeParse({
  mode: 'cues',
  startFrame: 0,
  endFrame: 7,
  cues: [
    { id: 'first', text: '거기서!!', startFrame: 0, endFrame: 3 },
    { id: 'second', text: '서란 말이야', startFrame: 4, endFrame: 7 },
  ],
}).success, true, 'Adjacent text cue ranges must remain valid.');

const frameCount = 8;
const frameBuffers = await Promise.all(Array.from({ length: frameCount }, (_, index) => sharp(Buffer.from(`
  <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="256" cy="292" rx="92" ry="132" fill="#55C7A9"/>
    <circle cx="224" cy="260" r="12" fill="#172033"/>
    <circle cx="288" cy="260" r="12" fill="#172033"/>
    <path d="M218 ${318 + (index % 2) * 4} Q256 ${338 - (index % 2) * 5} 296 ${318 + (index % 2) * 4}" fill="none" stroke="#172033" stroke-width="11" stroke-linecap="round"/>
  </svg>
`)).png().toBuffer()));

const basePlan = {
  directorSummary: 'Advanced bubble renderer verification',
  characterProfile: {
    summary: 'Synthetic green character',
    immutableTraits: ['green oval character'],
    palette: ['green', 'navy'],
    styleRules: ['clean flat art'],
    negativeRules: ['no background'],
  },
  action: {
    title: '인사',
    emotion: '기쁨',
    action: '가볍게 인사하기',
    intensity: 'normal',
    motionType: 'dynamic',
    renderMode: 'dynamic',
    durationMs: 1000,
    frameCount,
    fps: 8,
    loopDescription: 'A short seamless greeting loop.',
    imagePrompt: 'One isolated green character greeting on transparent canvas.',
    videoPrompt: 'The character completes a short greeting loop.',
    negativePrompt: 'background, text, watermark',
  },
  bubble: {
    text: '좋은 하루!',
    style: 'rounded',
    position: 'top',
    entrance: 'none',
    font: 'bold',
    size: 0.92,
    fillColor: '#FF3B7A',
    textColor: '#FFFFFF',
    outlineColor: '#146C94',
    outlineWidth: 6,
    shadowOpacity: 0.45,
    offsetX: 18,
    offsetY: 8,
    timeline: { mode: 'full', startFrame: 0, endFrame: null, cues: [] },
  },
  suggestedPresets: [],
};

const outputProfile = {
  platform: 'custom',
  type: 'animated',
  width: 160,
  height: 160,
  profileVersion: 'bubble-controls-runtime-v1',
  verification: 'reference',
  transparentBackground: true,
  allowedFormats: ['png', 'webp', 'gif', 'mp4', 'webm', 'png_zip'],
};
const formats = ['png', 'webp', 'gif', 'mp4', 'webm', 'png_zip'];
const outputs = await renderImageSequenceEmoticon({
  frameBuffers,
  plan: basePlan,
  formats,
  outputProfile,
});
assert.deepEqual(outputs.map((output) => output.format), formats);
for (const output of outputs) {
  assert.ok(output.buffer.byteLength > 100, `${output.format} advanced-bubble output must not be empty.`);
  assert.equal(output.inspection.passed, true, `${output.format} advanced-bubble output must pass technical inspection: ${output.inspection.issues.join('; ')}`);
}

async function fillCentroid(offsetX) {
  const [output] = await renderImageSequenceEmoticon({
    frameBuffers,
    plan: {
      ...basePlan,
      bubble: { ...basePlan.bubble, shadowOpacity: 0, offsetX },
    },
    formats: ['png'],
    outputProfile,
  });
  const { data, info } = await sharp(output.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  let xTotal = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixel = (y * info.width + x) * info.channels;
      if (data[pixel] > 235 && data[pixel + 1] >= 35 && data[pixel + 1] <= 90 && data[pixel + 2] >= 90 && data[pixel + 2] <= 150 && data[pixel + 3] > 220) {
        count += 1;
        xTotal += x;
      }
    }
  }
  assert.ok(count > 80, 'The renderer must composite the configured fill color into the output frame.');
  return xTotal / count;
}

const leftCentroid = await fillCentroid(-24);
const rightCentroid = await fillCentroid(24);
assert.ok(rightCentroid - leftCentroid > 10, 'Fine X offsets must move the rendered bubble while staying inside the safe canvas region.');

for (const [position, offsetX, offsetY] of [
  ['top', 48, 48],
  ['bottom', -48, -48],
  ['left', 48, 48],
  ['right', -48, -48],
]) {
  const [output] = await renderImageSequenceEmoticon({
    frameBuffers,
    plan: {
      ...basePlan,
      bubble: {
        ...basePlan.bubble,
        position,
        size: 1.2,
        outlineWidth: 10,
        shadowOpacity: 0.75,
        offsetX,
        offsetY,
      },
    },
    formats: ['png'],
    outputProfile,
  });
  assert.equal(
    output.inspection.passed,
    true,
    `${position} extreme appearance must remain inside the safe canvas: ${output.inspection.issues.join('; ')} ${JSON.stringify(output.inspection.alphaBoundsEvidence?.frames?.[0])}`,
  );
  assert.deepEqual(output.inspection.alphaBoundsEvidence?.edgeTouchFrameIndices, []);
}

const clientSchema = readSource('src/schemas/emoticonStudio.ts');
const functionSchema = readSource('functions/src/emoticonStudio/schema.ts');
const projectSchema = readSource('src/schemas/emoticonProject.ts');
const projectService = readSource('src/services/emoticonProjectService.ts');
const timelineEditor = readSource('src/app/admin/emoticon-studio/BubbleTimelineEditor.tsx');
const professionalEditor = readSource('src/app/admin/emoticon-studio/studio/ProfessionalEditor.tsx');
const director = readSource('functions/src/emoticonStudio/director.ts');
const renderer = readSource('functions/src/emoticonStudio/renderer.ts');
const rules = readSource('firestore.rules');

for (const schema of [clientSchema, functionSchema]) {
  for (const field of ['size', 'fillColor', 'textColor', 'outlineColor', 'outlineWidth', 'shadowOpacity', 'offsetX', 'offsetY']) {
    assert.ok(schema.includes(field), `Both schemas must persist ${field}.`);
  }
  assert.match(schema, /emoticonBubbleHexColorSchema/);
  assert.match(schema, /min\(0\.75\)\.max\(1\.2\)/);
}
assert.match(projectSchema, /emoticonBubbleAppearanceSchema\.shape/);
assert.match(projectService, /EMOTICON_BUBBLE_APPEARANCE_DEFAULTS/);
assert.match(timelineEditor, /type="color"/);
assert.match(timelineEditor, /#RRGGBB/);
assert.match(timelineEditor, /가로 미세 이동/);
assert.match(timelineEditor, /그림자/);
assert.match(professionalEditor, /<BubbleTimelineEditor/);
assert.match(professionalEditor, /bubbleLayers\.length >= 4/);
assert.match(professionalEditor, /bubbleLayers: bubbleLayers\.map\(storedBubble\)/);
assert.match(professionalEditor, /bubbleLayers,\s*frameDurationsMs/);
assert.match(director, /Never place written text inside the character image/);
assert.match(director, /fillColor #FFFFFF/);
assert.match(director, /issues must contain only concise Korean user-facing sentences/);
assert.match(director, /correction must be a concise English retry instruction/);
assert.match(renderer, /getBubbleAppearance/);
assert.match(renderer, /feDropShadow/);
assert.match(renderer, /getCharacterRegionBesideBubble/);
assert.match(rules, /validEmoticonBubbleAppearance/);
assert.match(rules, /validEmoticonRenderBubble/);
assert.match(rules, /validEmoticonProjectBubble/);

console.log('Advanced optional speech-bubble schema, UI, renderer, reviewer-language, and rules contracts passed.');
