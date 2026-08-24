import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/lib/emoticonCreationIntent.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: 'emoticonCreationIntent.ts',
}).outputText;

const module = { exports: {} };
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  crypto: globalThis.crypto,
  require: (id) => {
    if (id === '@/schemas/emoticonStudioV2') {
      return { emoticonCreationIntentSchema: { parse: (value) => value } };
    }
    throw new Error(`Unexpected runtime import: ${id}`);
  },
}, { filename: 'emoticonCreationIntent.js' });

const {
  normalizeEmoticonAnimationMotion,
  parseEmoticonCreationIntent,
} = module.exports;

const animatedOptions = {
  outputType: 'animated',
  frameCount: 8,
  durationMs: 1000,
  quantity: 1,
  targetPlatform: 'kakao',
  qualityMode: 'efficient',
};
const unquoted = parseEmoticonCreationIntent(
  '오른쪽으로 달리면서 거기서!! 다음에 서란 말이야라고 외치게 해줘',
  animatedOptions,
);
assert.deepEqual(
  Array.from(unquoted.textCues, (cue) => cue.text),
  ['거기서!!', '서란 말이야'],
);
assert.deepEqual(
  Array.from(unquoted.textCues, (cue) => [cue.startFrame, cue.endFrame]),
  [[0, 3], [4, 7]],
);

const explicitMotion = parseEmoticonCreationIntent(
  '12프레임, 1.5초 동안 왕복하듯 달려줘',
  animatedOptions,
);
assert.equal(explicitMotion.frameCount, 12);
assert.equal(explicitMotion.durationMs, 1500);

const staticIntent = parseEmoticonCreationIntent('기쁜 표정으로 10장 만들어줘', {
  ...animatedOptions,
  outputType: 'static',
  frameCount: 1,
  durationMs: 0,
});
assert.equal(staticIntent.quantity, 10);
assert.equal(staticIntent.frameCount, 1);
assert.equal(staticIntent.durationMs, 0);

for (const input of [
  [8, 1000],
  [24, 700],
  [24, 4000],
  [2, 100],
]) {
  const motion = normalizeEmoticonAnimationMotion(input[0], input[1]);
  assert.ok(motion.fps >= 2 && motion.fps <= 18);
  assert.ok(motion.frameCount >= 4 && motion.frameCount <= 24);
  assert.ok(motion.durationMs >= 700 && motion.durationMs <= 3000);
  assert.ok(Math.abs(motion.durationMs - Math.round((motion.frameCount / motion.fps) * 1000)) <= 120);
}

console.log('Emoticon creation intent runtime cases verified.');
