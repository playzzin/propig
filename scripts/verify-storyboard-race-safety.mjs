import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, planner, storyboardService] = await Promise.all([
  readFile(
    new URL("../src/components/image-generator/StoryboardWorkspace.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/services/imageStoryboardPlanningService.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/services/imageStoryboardService.ts", import.meta.url),
    "utf8",
  ),
]);

for (const requirement of [
  "cancelDraftScopedRequests",
  "planningAbortControllerRef",
  "sceneRedesignAbortControllerRef",
  "referenceUploadRequestRef",
  "referenceUploadInProgressRef",
  "Promise.allSettled",
  "deleteReclaimableStorageAssets",
  "activeIdRef.current === storyboardIdAtRequest",
  "revisionRef.current !== revisionAtRequest",
]) {
  assert.ok(workspace.includes(requirement), `Workspace must retain ${requirement} race protection.`);
}

const undoDraftSource = workspace.slice(
  workspace.indexOf("const undoDraft"),
  workspace.indexOf("const redoDraft"),
);
const redoDraftSource = workspace.slice(
  workspace.indexOf("const redoDraft"),
  workspace.indexOf("const retryStoryboardSubscription"),
);
assert.ok(
  !undoDraftSource.includes("setDraft((current)") &&
    !redoDraftSource.includes("setDraft((current)"),
  "Undo and redo must not mutate history refs inside React state updater functions.",
);

assert.ok(
  planner.includes("signal: options.signal"),
  "The shared storyboard planning request boundary must forward abort signals.",
);
for (const endpoint of [
  "'/api/generate-image-storyboard'",
  "'/api/generate-image-storyboard/scene'",
  "'/api/generate-image-storyboard/flow'",
]) {
  assert.ok(planner.includes(endpoint), `${endpoint} must use the abortable request boundary.`);
}
assert.ok(
  planner.includes("type PlanningRequestOptions"),
  "Planning requests need one explicit, typed cancellation boundary.",
);
assert.ok(
  storyboardService.includes("const seenSceneIds = new Set<string>()") &&
    storyboardService.includes("while (seenSceneIds.has(replacementId))") &&
    storyboardService.includes("id: replacementId"),
  "Persisted duplicate scene ids must be repaired before React renders keyed scene controls.",
);

console.log("Storyboard race and cancellation safeguards verified.");
