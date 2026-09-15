import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspace = await readFile(
  new URL(
    "../src/components/image-generator/StoryboardWorkspace.tsx",
    import.meta.url,
  ),
  "utf8",
);

const refreshBlock = workspace.slice(
  workspace.indexOf("const refreshVersions = useCallback"),
  workspace.indexOf("const saveNamedVersion = useCallback"),
);
const restoreBlock = workspace.slice(
  workspace.indexOf("const restoreVersion = useCallback"),
  workspace.indexOf("const recoverConflictAsCopy = useCallback"),
);
const activationBlock = workspace.slice(
  workspace.indexOf("const activateStoryboardId = useCallback"),
  workspace.indexOf("const cancelDraftScopedRequests = useCallback"),
);
const selectionBlock = workspace.slice(
  workspace.indexOf("const selectStoryboard = useCallback"),
  workspace.indexOf("const createNewStoryboard = useCallback"),
);

for (const [block, label] of [
  [refreshBlock, "version refresh"],
  [restoreBlock, "version restore"],
  [activationBlock, "project activation"],
  [selectionBlock, "project selection"],
]) {
  assert.ok(block.length > 0, `${label} block must remain discoverable.`);
}

for (const requirement of [
  "versionHistoryRequestRef.current = requestId",
  "const storyboardIdAtRequest = activeIdRef.current",
  "activeIdRef.current !== storyboardIdAtRequest",
  "versionsProjectIdRef.current = storyboardIdAtRequest",
  "setVersionsProjectId(storyboardIdAtRequest)",
]) {
  assert.ok(
    refreshBlock.includes(requirement),
    `Version refresh must retain the ${requirement} identity guard.`,
  );
}

assert.ok(
  refreshBlock.indexOf("activeIdRef.current !== storyboardIdAtRequest") <
    refreshBlock.indexOf("setVersions(nextVersions)"),
  "A stale version response must be rejected before it can update the list.",
);

for (const requirement of [
  "versionStoryboardId !== currentStoryboardId",
  "versionsProjectIdRef.current !== currentStoryboardId",
  "draftRef.current",
  "프로젝트가 변경되어 이 버전을 복원하지 않았습니다.",
]) {
  assert.ok(
    restoreBlock.includes(requirement),
    `Version restore must retain the ${requirement} ownership check.`,
  );
}

assert.ok(
  activationBlock.indexOf("invalidateVersionHistory()") <
    activationBlock.indexOf("setActiveId(nextStoryboardId)"),
  "Project activation must clear history before publishing the new project id.",
);
assert.ok(
  selectionBlock.includes("invalidateVersionHistory();"),
  "A requested project switch must invalidate in-flight history immediately.",
);
assert.equal(
  workspace.match(/\bsetActiveId\(/g)?.length ?? 0,
  1,
  "All project-id changes must pass through the history-invalidating activator.",
);
assert.ok(
  workspace.includes("restoreVersion(version, versionsProjectId)"),
  "Restore controls must carry the version list's source project identity.",
);
assert.ok(
  workspace.includes("versionsProjectId === activeId && versions.length"),
  "The UI must not render a version list owned by another active project.",
);

console.log("Storyboard version-history project isolation verified.");
