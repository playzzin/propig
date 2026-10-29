import assert from 'node:assert/strict';
import { evaluateArithmeticExpression } from '../src/agents/tools/arithmetic.ts';

const validCases = [
  ['1 + 2 * 3', 7],
  ['(1 + 2) * 3', 9],
  ['-4 + 10 / 2', 1],
  ['.5 * 8', 4],
  ['--3', 3],
];

for (const [expression, expected] of validCases) {
  assert.equal(evaluateArithmeticExpression(expression), expected, expression);
}

for (const expression of ['1 / 0', '2 ** 8', 'process.exit()', '1 +', '(1 + 2', '', '1e999']) {
  assert.throws(() => evaluateArithmeticExpression(expression), undefined, expression);
}

assert.throws(() => evaluateArithmeticExpression('('.repeat(40) + '1' + ')'.repeat(40)));
assert.throws(() => evaluateArithmeticExpression('1+'.repeat(130) + '1'));
assert.throws(() => evaluateArithmeticExpression(' '.repeat(513)));

console.log('Safe calculator verification passed');
