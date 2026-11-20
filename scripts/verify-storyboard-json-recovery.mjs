import assert from "node:assert/strict";
import { parseStoryboardJsonObject } from "../src/lib/server/storyboard-json.ts";

assert.deepEqual(
  parseStoryboardJsonObject('```json\n{"title":"장면","meta":{"beat":1}}\n```'),
  { title: "장면", meta: { beat: 1 } },
  "Code-fenced JSON with nested objects must be recovered.",
);

assert.deepEqual(
  parseStoryboardJsonObject(
    '\uFEFF설명입니다. {"title":"장면","items":[{"note":"quoted \\\"value\\\" and {brace}"},],} 뒤 설명',
  ),
  {
    title: "장면",
    items: [{ note: 'quoted "value" and {brace}' }],
  },
  "BOM, prose, nested arrays, escaped quotes, and trailing commas must recover safely.",
);

assert.deepEqual(
  parseStoryboardJsonObject('{"first":true}\n{"second":true}'),
  { first: true },
  "When a provider includes multiple JSON objects, only the first complete object is used.",
);

assert.deepEqual(
  parseStoryboardJsonObject(
    '설계를 완료했습니다. {"title":"장면","prompt":"keep {product} stable"} 추가 설명은 무시합니다.',
  ),
  { title: "장면", prompt: "keep {product} stable" },
  "The first complete JSON object must be selected without confusing braces inside strings.",
);

assert.throws(
  () => parseStoryboardJsonObject('{"title":"incomplete"'),
  /complete JSON object/,
  "Incomplete model output must fail safely so the route can retry or show a clear error.",
);

assert.throws(
  () => parseStoryboardJsonObject("null"),
  /JSON object/,
  "A non-object response must fail with a clear contract error.",
);
assert.throws(
  () => parseStoryboardJsonObject("[]"),
  /JSON object/,
  "An array response must not be accepted as a storyboard object.",
);
assert.throws(
  () => parseStoryboardJsonObject('{"title": }'),
  /invalid JSON/,
  "Malformed JSON must fail safely rather than being partially interpreted.",
);

const tooDeep = `${'{"child":'.repeat(129)}0${'}'.repeat(129)}`;
assert.throws(
  () => parseStoryboardJsonObject(tooDeep),
  /nesting is too deep/,
  "Pathologically nested provider output must be bounded.",
);

console.log("Storyboard AI JSON recovery verified.");
