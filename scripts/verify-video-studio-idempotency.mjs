import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseVideoStudioIdempotencyContract as parseNextContract } from "../src/lib/server/video-studio-idempotency.ts";
import { parseVideoStudioIdempotencyContract as parseFunctionsContract } from "../functions/src/videoStudio/idempotency.ts";

const request = {
  operation: "merge",
  projectId: "project-1",
  mergeClipIds: ["clip-2", "clip-1"],
  mergeClipEdits: [
    { clipId: "clip-2", transitionStyle: "crossfade" },
    { clipId: "clip-1", transitionStyle: "cut" },
  ],
};
const params = {
  rawKey: "storyboard-final-v1-example",
  userId: "user-1",
  request,
};
const nextContract = parseNextContract(params);
const functionsContract = parseFunctionsContract(params);
assert.deepEqual(
  nextContract,
  functionsContract,
  "Next.js and Functions must derive the same deterministic job id and request fingerprint.",
);
assert.ok(nextContract?.jobId.startsWith("idem_"));
assert.equal(nextContract?.jobId.length, 69);

const reorderedObjectContract = parseNextContract({
  ...params,
  request: {
    mergeClipEdits: request.mergeClipEdits,
    mergeClipIds: request.mergeClipIds,
    projectId: request.projectId,
    operation: request.operation,
  },
});
assert.equal(
  reorderedObjectContract?.requestFingerprint,
  nextContract?.requestFingerprint,
  "Object key order must not change the request fingerprint.",
);
const reorderedTimelineContract = parseNextContract({
  ...params,
  request: { ...request, mergeClipIds: ["clip-1", "clip-2"] },
});
assert.notEqual(
  reorderedTimelineContract?.requestFingerprint,
  nextContract?.requestFingerprint,
  "Array order must remain significant for final assembly.",
);
assert.throws(
  () =>
    parseNextContract({
      ...params,
      rawKey: `bad\n${"x".repeat(20)}`,
    }),
  /invalid or too long/,
);

const [
  nextRoute,
  nextRunRoute,
  nextAdmin,
  functionsRoutes,
  service,
  panel,
  projectService,
  rules,
] = await Promise.all([
  readFile("src/app/api/video-studio/jobs/route.ts", "utf8"),
  readFile("src/app/api/video-studio/jobs/run/route.ts", "utf8"),
  readFile("src/lib/server/video-studio-admin.ts", "utf8"),
  readFile("functions/src/api/hostingVideoStudioRoutes.ts", "utf8"),
  readFile("src/services/videoStudioService.ts", "utf8"),
  readFile(
    "src/components/image-generator/StoryboardVideoProductionPanel.tsx",
    "utf8",
  ),
  readFile("src/services/videoStudioService.ts", "utf8"),
  readFile("firestore.rules", "utf8"),
]);

for (const [name, source] of [
  ["Next queue route", nextRoute],
  ["Next legacy run route", nextRunRoute],
]) {
  assert.ok(
    source.indexOf("getIdempotentVideoStudioJob") <
      source.indexOf("preflightVideoStudioJob"),
    `${name} must return an existing job before repeating provider preflight.`,
  );
}
assert.ok(
  nextAdmin.includes("transaction.create(jobRef, data)") &&
    nextAdmin.includes("requestFingerprint"),
  "The Next.js server must atomically create or return one deterministic job.",
);
assert.ok(
  functionsRoutes.includes("transaction.create(ref, data)") &&
    functionsRoutes.indexOf("getIdempotentQueuedJob") <
      functionsRoutes.indexOf("preflightQueuedVideoStudioJob(payload"),
  "The Functions server must use the same create-or-return boundary before preflight.",
);
assert.ok(
  service.includes('headers["Idempotency-Key"] = input.idempotencyKey') &&
    panel.includes("buildStoryboardSceneVideoIdempotencyKey") &&
    panel.includes("buildStoryboardFinalVideoIdempotencyKey"),
  "Storyboard scene and final requests must send deterministic idempotency keys.",
);
assert.ok(
  projectService.includes("await runTransaction(db") &&
    panel.includes("projectId: `storyboard_${currentUser.uid}_${storyboardId}`") &&
    panel.includes("ensureProjectPromiseRef"),
  "The first storyboard render must also share one deterministic project across clicks and tabs.",
);
assert.match(
  rules,
  /match \/video_studio_jobs\/\{jobId\}[\s\S]*allow create, update, delete: if isAdmin\(\);/,
  "Browser users must not preclaim or mutate deterministic paid-job documents.",
);

console.log("Video studio idempotency contract verified.");
