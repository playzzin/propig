import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('../functions/node_modules/sharp');
const JSZip = require('jszip');
const {
  evaluateEmoticonFrameVariation,
  inspectEmoticonRasterAlphaBounds,
  normalizeGeneratedEmoticonPose,
  renderImageEmoticon,
  renderImageSequenceEmoticon,
  resolveEmoticonOutputProfile,
} = require('../functions/lib/emoticonStudio/renderer.js');
const {
  emoticonOutputInspectionSchema,
} = require('../functions/lib/emoticonStudio/schema.js');
const {
  buildEfficientCompositePlan,
  EFFICIENT_LOCAL_COMPOSITE_VERSION,
} = require('../functions/lib/emoticonStudio/quickComposite.js');

const frameCount = 8;
const frameBuffers = await Promise.all(Array.from({ length: frameCount }, async (_, index) => {
  const leftFootX = 270 + (index % 4) * 35;
  const rightFootX = 1024 - leftFootX;
  const mouthHeight = 18 + (index % 3) * 12;
  const svg = Buffer.from(`
    <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <circle cx="512" cy="420" r="150" fill="#ffcc66"/>
      <ellipse cx="465" cy="390" rx="16" ry="24" fill="#222"/>
      <ellipse cx="559" cy="390" rx="16" ry="24" fill="#222"/>
      <ellipse cx="512" cy="470" rx="42" ry="${mouthHeight}" fill="#a33"/>
      <line x1="430" y1="560" x2="${leftFootX}" y2="760"
        stroke="#333" stroke-width="45" stroke-linecap="round"/>
      <line x1="594" y1="560" x2="${rightFootX}" y2="760"
        stroke="#333" stroke-width="45" stroke-linecap="round"/>
    </svg>
  `);
  return sharp(svg).png().toBuffer();
}));

const plan = {
  directorSummary: 'Runtime renderer verification',
  characterProfile: {
    summary: 'Synthetic test character',
    immutableTraits: ['round yellow face'],
    palette: ['yellow', 'dark gray'],
    styleRules: ['simple clean line art'],
    negativeRules: ['no background'],
  },
  action: {
    title: '달리기',
    emotion: '신남',
    action: '제자리에서 달리기',
    intensity: 'normal',
    motionType: 'dynamic',
    renderMode: 'dynamic',
    durationMs: 1000,
    frameCount,
    fps: 8,
    loopDescription: 'Alternating stride loop',
    imagePrompt: 'A synthetic character running in a clean animation frame.',
    videoPrompt: 'A synthetic character completes one alternating running loop.',
    negativePrompt: 'background, text, watermark',
  },
  bubble: {
    text: '',
    style: 'none',
    position: 'top',
    entrance: 'none',
  },
  suggestedPresets: Array.from({ length: 4 }, (_, index) => ({
    title: `preset-${index}`,
    instruction: '달리기',
    emotion: '신남',
    action: '달리기',
  })),
};

const formats = ['png', 'apng', 'webp', 'gif', 'mp4', 'webm', 'png_zip'];
const variedFrames = await evaluateEmoticonFrameVariation(frameBuffers);
assert.equal(variedFrames.passes, true, 'Distinct limbs and mouth shapes must pass the local variation guard.');
const duplicatedFrames = await evaluateEmoticonFrameVariation(Array.from({ length: frameCount }, () => frameBuffers[0]));
assert.equal(duplicatedFrames.passes, false, 'Repeated image frames must fail the local variation guard.');
assert.ok(duplicatedFrames.duplicateFrameIndices.length >= frameCount - 1);
const outputs = await renderImageSequenceEmoticon({
  frameBuffers,
  plan,
  formats,
});

assert.deepEqual(outputs.map((output) => output.format).sort(), [...formats].sort());
for (const output of outputs) {
  assert.ok(output.buffer.byteLength > 100, `${output.format} output must not be empty.`);
  assert.equal(
    emoticonOutputInspectionSchema.safeParse(output.inspection).success,
    true,
    `${output.format} inspection must satisfy the Functions persistence schema.`,
  );
  assert.equal(output.inspection.inspectorVersion, '3.0');
}
const customDurations = [80, 120, 160, 200, 240, 180, 140, 100];
const cutTransitions = Array.from({ length: frameCount }, () => ({ kind: 'cut', strength: 0.55 }));
const polishedTransitions = [
  { kind: 'fade', strength: 0.55 },
  { kind: 'slide_left', strength: 0.5 },
  { kind: 'slide_right', strength: 0.5 },
  { kind: 'zoom', strength: 0.6 },
  { kind: 'fade', strength: 0.7 },
  { kind: 'slide_left', strength: 0.45 },
  { kind: 'zoom', strength: 0.5 },
  { kind: 'cut', strength: 0.55 },
];
let cutComposedFrames = [];
let polishedComposedFrames = [];
await renderImageSequenceEmoticon({
  frameBuffers,
  plan,
  formats: ['png_zip'],
  frameDurationsMs: customDurations,
  frameTransitions: cutTransitions,
  onComposedFrames: async (frames) => { cutComposedFrames = frames; },
});
const [polishedGif] = await renderImageSequenceEmoticon({
  frameBuffers,
  plan,
  formats: ['gif'],
  frameDurationsMs: customDurations,
  frameTransitions: polishedTransitions,
  onComposedFrames: async (frames) => { polishedComposedFrames = frames; },
});
assert.equal(cutComposedFrames.length, frameCount);
assert.equal(polishedComposedFrames.length, frameCount);
for (const index of [0, 1, 2, 3, 4]) {
  assert.notEqual(
    Buffer.compare(cutComposedFrames[index], polishedComposedFrames[index]),
    0,
    `Transition ${polishedTransitions[index].kind} must alter composed frame ${index + 1}.`,
  );
}
assert.ok(
  Math.abs((polishedGif.inspection.durationMs || 0) - customDurations.reduce((sum, value) => sum + value, 0)) <= 20,
  'Variable frame durations must be preserved in the rendered GIF.',
);

const bubbleLayer = (text, position, timeline, offsetX = 0) => ({
  text,
  style: 'rounded',
  position,
  entrance: 'none',
  font: 'clean',
  size: 0.85,
  fillColor: '#FFFFFF',
  textColor: '#111111',
  outlineColor: '#111111',
  outlineWidth: 2,
  shadowOpacity: 0.15,
  offsetX,
  offsetY: 0,
  timeline,
});
const firstLayer = bubbleLayer('첫 번째', 'top', { mode: 'full', startFrame: 0, endFrame: null, cues: [] }, -90);
const secondLayer = bubbleLayer('두 번째', 'bottom', { mode: 'range', startFrame: 4, endFrame: 7, cues: [] }, 90);
let singleBubbleFrames = [];
let multipleBubbleFrames = [];
await renderImageSequenceEmoticon({
  frameBuffers,
  plan: { ...plan, bubbleLayers: [firstLayer] },
  formats: ['png_zip'],
  onComposedFrames: async (frames) => { singleBubbleFrames = frames; },
});
await renderImageSequenceEmoticon({
  frameBuffers,
  plan: { ...plan, bubbleLayers: [firstLayer, secondLayer] },
  formats: ['png_zip'],
  onComposedFrames: async (frames) => { multipleBubbleFrames = frames; },
});
assert.equal(singleBubbleFrames.length, frameCount);
assert.equal(multipleBubbleFrames.length, frameCount);
assert.equal(Buffer.compare(singleBubbleFrames[0], multipleBubbleFrames[0]), 0, 'Inactive second bubble layer must not alter frame 1.');
assert.notEqual(Buffer.compare(singleBubbleFrames[6], multipleBubbleFrames[6]), 0, 'Active second bubble layer must alter frame 7.');

for (const format of ['png', 'apng', 'webp', 'gif', 'png_zip']) {
  const output = outputs.find((candidate) => candidate.format === format);
  assert.ok(output, `${format} output must exist.`);
  assert.equal(
    output.inspection.passed,
    true,
    `${format} alpha-bound inspection must pass: ${output.inspection.issues.join(' | ')}`,
  );
  assert.ok(output.inspection.alphaBoundsEvidence, `${format} must include alpha-bound evidence.`);
  assert.equal(
    output.inspection.alphaBoundsEvidence.checkedFrameCount,
    format === 'png' ? 1 : frameCount,
  );
  assert.equal(output.inspection.alphaBoundsEvidence.allFramesHaveVisibleContent, true);
  assert.equal(output.inspection.alphaBoundsEvidence.allFramesHaveUsableTransparentMargin, true);
  assert.deepEqual(output.inspection.alphaBoundsEvidence.edgeTouchFrameIndices, []);
}
const lineProfile = resolveEmoticonOutputProfile({
  platform: 'line',
  type: 'animated',
  width: 320,
  height: 270,
  profileVersion: 'line-animated-apng-2026-08-05',
  verification: 'verified',
  transparentBackground: true,
  sourceUrl: 'https://creator.line.me/en/guideline/animationsticker/',
  checkedAt: '2026-08-05T00:00:00.000Z',
  allowedFormats: ['apng'],
  minFrameCount: 5,
  maxFrameCount: 20,
  maxFileSizeBytes: 1024 * 1024,
  maxDurationMs: 4_000,
  loopCount: 1,
  formatCapabilities: { apng: { alpha: 'supported' } },
  submissionCandidate: false,
});
assert.equal(lineProfile.verification, 'verified');
assert.deepEqual(lineProfile.allowedFormats, ['apng', 'gif', 'webp', 'png_zip']);
assert.equal(lineProfile.loopCount, 1);
const [lineApng] = await renderImageSequenceEmoticon({
  frameBuffers,
  plan,
  formats: ['apng'],
  outputProfile: lineProfile,
});
assert.equal(lineApng.format, 'apng');
assert.equal(lineApng.extension, 'apng.png');
assert.equal(lineApng.contentType, 'image/png');
assert.equal(lineApng.inspection.frameCount, frameCount);
assert.equal(lineApng.inspection.passed, true, lineApng.inspection.issues.join('\n'));

const efficientPlan = buildEfficientCompositePlan({
  request: {
    instruction: '오른쪽으로 달리면서 “거기서!!”라고 외치게 해줘',
    motionOverride: { fps: 8, frameCount: 8, durationMs: 1000 },
    bubbleOverride: {
      text: '거기서!!',
      style: 'shout',
      position: 'top',
      entrance: 'pop',
      font: 'bold',
      size: 1,
      fillColor: '#FFFFFF',
      textColor: '#20242D',
      outlineColor: '#222733',
      outlineWidth: 4,
      shadowOpacity: 0,
      offsetX: 0,
      offsetY: 0,
      timeline: { mode: 'full', startFrame: 0, endFrame: null, cues: [] },
    },
  },
  outputProfile: lineProfile,
});
assert.equal(efficientPlan.action.motionType, 'dynamic');
assert.equal(efficientPlan.action.frameCount, 8);
let efficientComposedFrames = [];
const efficientOutputs = await renderImageEmoticon({
  imageBuffer: frameBuffers[0],
  plan: efficientPlan,
  formats: ['apng', 'webp', 'gif', 'png_zip'],
  outputProfile: lineProfile,
  editRecipe: {
    schemaVersion: 1,
    revision: 0,
    crop: { left: 0, right: 0, top: 0, bottom: 0 },
    scale: 0.82,
    offsetX: 0,
    offsetY: 0,
    flipHorizontal: false,
    rotationDeg: 0,
    transparentPadding: 0.1,
  },
  onComposedFrames: async (frames) => {
    efficientComposedFrames = frames;
  },
});
assert.equal(EFFICIENT_LOCAL_COMPOSITE_VERSION, 'efficient-local-composite-v1');
assert.equal(efficientComposedFrames.length, 8, 'Fast composite must expose every composed frame to the editor checkpoint.');
for (const output of efficientOutputs) {
  assert.equal(output.inspection.passed, true, `${output.format}: ${output.inspection.issues.join(' | ')}`);
  assert.equal(output.inspection.frameCount, 8);
  assert.ok(
    Math.abs((output.inspection.durationMs || 0) - 1000) <= 20,
    `${output.format}: encoded duration ${output.inspection.durationMs}ms exceeds the container timing tolerance`,
  );
}
const mp4Output = outputs.find((output) => output.format === 'mp4');
assert.ok(mp4Output);
assert.equal(mp4Output.inspection.hasAlpha, false);
assert.equal(mp4Output.inspection.alphaBoundsEvidence, null);
assert.equal(
  mp4Output.inspection.issues.some((issue) => /transparency/i.test(issue)),
  false,
  'MP4 must not fail transparency checks because its server capability is alpha-unsupported.',
);

const untrustedVerifiedProfile = resolveEmoticonOutputProfile({
  platform: 'kakao',
  type: 'animated',
  width: 360,
  height: 360,
  profileVersion: 'kakao-standard-animated-webp-2026-08-01',
  verification: 'verified',
  transparentBackground: false,
  sourceUrl: 'https://emoticonstudio.kakao.com/webp-animator',
  checkedAt: '2099-01-01T00:00:00.000Z',
  allowedFormats: ['gif'],
  maxFileSizeBytes: 1,
  formatCapabilities: { webp: { alpha: 'unsupported' } },
  submissionCandidate: false,
});
assert.deepEqual(untrustedVerifiedProfile.allowedFormats, ['webp', 'png_zip']);
assert.equal(untrustedVerifiedProfile.transparentBackground, true);
assert.equal(untrustedVerifiedProfile.checkedAt, '2026-08-01T00:00:00.000Z');
assert.equal(untrustedVerifiedProfile.maxFileSizeBytes, undefined);
assert.deepEqual(untrustedVerifiedProfile.formatCapabilities.webp, { alpha: 'supported' });
await assert.rejects(
  renderImageSequenceEmoticon({
    frameBuffers,
    plan,
    formats: ['gif'],
    outputProfile: untrustedVerifiedProfile,
  }),
  /not allowed by the verified output profile/,
);

const residualSource = await sharp(Buffer.from(`
  <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <circle cx="256" cy="256" r="110" fill="#ffcc66"/>
    <rect x="455" y="28" width="20" height="20" fill="#b33"/>
  </svg>
`)).png().toBuffer();
const residualCleaned = await normalizeGeneratedEmoticonPose(residualSource);
const { data: residualPixels, info: residualInfo } = await sharp(residualCleaned)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const residualAlpha = residualPixels[(38 * residualInfo.width + 465) * residualInfo.channels + 3];
assert.equal(residualAlpha, 0, 'A distant disconnected image residue must be transparent.');

async function firstComposedFrame(bubble) {
  const [output] = await renderImageSequenceEmoticon({
    frameBuffers,
    plan: { ...plan, bubble },
    formats: ['png_zip'],
  });
  assert.equal(output.inspection.passed, true, 'Speech-bubble output must retain a usable transparent margin.');
  assert.ok(output.inspection.alphaBoundsEvidence);
  assert.equal(output.inspection.alphaBoundsEvidence.allFramesHaveUsableTransparentMargin, true);
  assert.deepEqual(output.inspection.alphaBoundsEvidence.edgeTouchFrameIndices, []);
  const zip = await JSZip.loadAsync(output.buffer);
  const entry = zip.file('frames/frame-001.png');
  assert.ok(entry, 'The PNG frame archive must contain the first frame.');
  return entry.async('nodebuffer');
}

async function containsCharacterYellow(buffer, bounds) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const startX = Math.max(0, bounds.left);
  const endX = Math.min(info.width, bounds.right);
  const startY = Math.max(0, bounds.top);
  const endY = Math.min(info.height, bounds.bottom);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] >= 235 && data[offset + 1] >= 170 && data[offset + 2] <= 140 && data[offset + 3] > 32) {
        return true;
      }
    }
  }
  return false;
}

const bubbleBase = { text: '테스트', style: 'rounded', entrance: 'none' };
const topBubbleFrame = await firstComposedFrame({ ...bubbleBase, position: 'top' });
const bottomBubbleFrame = await firstComposedFrame({ ...bubbleBase, position: 'bottom' });
const leftBubbleFrame = await firstComposedFrame({ ...bubbleBase, position: 'left' });
const rightBubbleFrame = await firstComposedFrame({ ...bubbleBase, position: 'right' });
assert.equal(await containsCharacterYellow(topBubbleFrame, { left: 0, top: 0, right: 360, bottom: 146 }), false);
assert.equal(await containsCharacterYellow(bottomBubbleFrame, { left: 0, top: 214, right: 360, bottom: 360 }), false);
assert.equal(await containsCharacterYellow(leftBubbleFrame, { left: 0, top: 0, right: 218, bottom: 360 }), false);
assert.equal(await containsCharacterYellow(rightBubbleFrame, { left: 142, top: 0, right: 360, bottom: 360 }), false);

const edgeTouchRaster = await sharp({
  create: {
    width: 360,
    height: 360,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).composite([{
  input: Buffer.from('<svg width="120" height="120"><rect width="120" height="120" fill="#222"/></svg>'),
  left: 0,
  top: 120,
}]).png().toBuffer();
const edgeTouchEvidence = await inspectEmoticonRasterAlphaBounds(edgeTouchRaster);
assert.deepEqual(edgeTouchEvidence.edgeTouchFrameIndices, [0]);
assert.equal(edgeTouchEvidence.frames[0].touchesCanvasEdge, true);
assert.equal(edgeTouchEvidence.allFramesHaveUsableTransparentMargin, false);

const narrowMarginRaster = await sharp({
  create: {
    width: 360,
    height: 360,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).composite([{
  input: Buffer.from('<svg width="120" height="120"><rect width="120" height="120" fill="#222"/></svg>'),
  left: 2,
  top: 120,
}]).png().toBuffer();
const narrowMarginEvidence = await inspectEmoticonRasterAlphaBounds(narrowMarginRaster);
assert.deepEqual(narrowMarginEvidence.edgeTouchFrameIndices, []);
assert.deepEqual(narrowMarginEvidence.insufficientMarginFrameIndices, [0]);
assert.equal(narrowMarginEvidence.frames[0].minimumTransparentMarginPx, 2);
assert.equal(narrowMarginEvidence.allFramesHaveUsableTransparentMargin, false);

const twentyFourFramePlan = {
  ...plan,
  action: {
    ...plan.action,
    frameCount: 24,
    durationMs: 3000,
  },
};
const twentyFourFrameOutputs = await renderImageSequenceEmoticon({
  frameBuffers: Array.from({ length: 24 }, (_, index) => frameBuffers[index % frameBuffers.length]),
  plan: twentyFourFramePlan,
  formats: ['webp', 'png_zip'],
});
for (const twentyFourFrameOutput of twentyFourFrameOutputs) {
  assert.equal(twentyFourFrameOutput.inspection.passed, true);
  assert.equal(twentyFourFrameOutput.inspection.frameCount, 24);
  assert.equal(twentyFourFrameOutput.inspection.alphaBoundsEvidence.checkedFrameCount, 24);
  assert.equal(twentyFourFrameOutput.inspection.alphaBoundsEvidence.frames.length, 24);
  assert.deepEqual(
    twentyFourFrameOutput.inspection.alphaBoundsEvidence.frames.map((frame) => frame.frameIndex),
    Array.from({ length: 24 }, (_, index) => index),
  );
}

console.log('Emoticon renderer runtime checks passed.');
