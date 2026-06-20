import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourcePath = path.resolve('src/components/habits/habitMetricStats.ts');
const source = await readFile(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});

const tempPath = path.join(tmpdir(), `habitMetricStats-${Date.now()}.mjs`);

await writeFile(tempPath, outputText, 'utf8');

try {
  const { getGoalScore, normalizeMetricGoalConfig } = await import(pathToFileURL(tempPath).href);

  assert.equal(getGoalScore({ direction: 'increase', target: 10 }, 15), 1.5);
  assert.equal(getGoalScore({ direction: 'increase', baseline: 5, target: 10 }, 15), 2);
  assert.equal(getGoalScore({ direction: 'decrease', baseline: 100, target: 80 }, 70), 1.5);
  assert.equal(getGoalScore({ direction: 'decrease', target: 80 }, 40), 2);
  assert.equal(getGoalScore({ direction: 'maintain', target: 10, minTarget: 8, maxTarget: 12 }, 10), 1);
  assert.equal(getGoalScore({ direction: 'maintain', target: 10, minTarget: 8, maxTarget: 12 }, 16), 0.75);
  assert.deepEqual(normalizeMetricGoalConfig({ direction: 'decrease', aggregation: 'max', baseline: 100, target: 80 }), {
    direction: 'decrease',
    aggregation: 'max',
    baseline: 100,
    target: 80,
  });
  assert.deepEqual(normalizeMetricGoalConfig({ direction: 'invalid', baseline: 0, target: 0 }), {
    baseline: 0,
    target: 0,
  });

  console.log('habitMetricStats verification passed');
} finally {
  await rm(tempPath, { force: true });
}
