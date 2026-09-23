import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [schema, workspace] = await Promise.all([
  readFile(new URL("../src/schemas/imageStoryboard.ts", import.meta.url), "utf8"),
  readFile(
  new URL(
    "../src/components/image-generator/StoryboardWorkspace.tsx",
    import.meta.url,
  ),
  "utf8",
  ),
]);

assert.ok(
  schema.includes("format: z.enum(STORYBOARD_FORMATS).default('brand-film')"),
  "Existing projects must receive a safe default format.",
);
assert.ok(
  schema.includes("plannedSceneCount: z.number().int().min(1).max(12).default(5)"),
  "Existing projects must receive a safe default scene-count preference.",
);
assert.ok(
  workspace.includes("format: draftAtRequest.format"),
  "The AI planner must use the project-persisted format.",
);
assert.ok(
  workspace.includes("sceneCount: draftAtRequest.plannedSceneCount"),
  "The AI planner must use the project-persisted scene count.",
);
assert.ok(
  workspace.includes("revisionRef.current !== revisionAtRequest"),
  "Stale AI plans must not overwrite newer edits.",
);
assert.ok(
  workspace.includes("flushFocusedWorkspaceField"),
  "Project actions must commit the focused field before saving or switching.",
);
assert.ok(
  workspace.includes("isTextEditingElement(event.target) && key !== \"s\""),
  "Text fields must keep their native undo and redo shortcuts.",
);

console.log("Storyboard planning preference and stale-result safeguards verified.");
