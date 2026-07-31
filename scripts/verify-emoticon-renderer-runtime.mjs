import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('../functions/node_modules/sharp');
const JSZip = require('jszip');
const {
  evaluateEmoticonFrameVariation,
  normalizeGeneratedEmoticonPose,
  renderImageSequenceEmoticon,
} = require('../functions/lib/emoticonStudio/renderer.js');

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

const formats = ['webp', 'gif', 'mp4', 'webm', 'png_zip'];
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
}

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

console.log('Emoticon renderer runtime checks passed.');
