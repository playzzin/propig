import assert from "node:assert/strict";
import { getStoryboardRequestRecovery } from "../src/lib/storyboard-request-recovery.ts";

const cases = [
  [null, true, /네트워크/],
  [400, false, /입력/],
  [401, false, /로그인/],
  [403, false, /권한/],
  [404, false, /찾을 수/],
  [409, false, /충돌/],
  [413, false, /너무 큽니다/],
  [429, true, /다시 시도/],
  [500, true, /서버/],
  [502, true, /일시적/],
  [503, true, /일시적/],
  [504, true, /시간/],
];

for (const [status, retryable, message] of cases) {
  const recovery = getStoryboardRequestRecovery(status, status === 429 ? 12 : null);
  assert.equal(recovery.retryable, retryable, `Status ${status} retryability must be explicit.`);
  assert.match(recovery.message, message, `Status ${status} needs an understandable Korean recovery message.`);
}

console.log("Storyboard request recovery messages verified.");
