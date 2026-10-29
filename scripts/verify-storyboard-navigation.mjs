import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");
const assertContains = (source, value, label) => {
  assert.ok(source.includes(value), `${label}: expected to find ${value}`);
};

const [
  storyboardPage,
  workspace,
  menuService,
  menuPages,
  appLayout,
  menuContext,
] = await Promise.all([
  read("src/app/admin/storyboard/page.tsx"),
  read("src/components/image-generator/StoryboardWorkspace.tsx"),
  read("src/services/menuService.ts"),
  read("src/constants/menuPages.ts"),
  read("src/components/AppLayout.tsx"),
  read("src/contexts/MenuContext.tsx"),
]);

await assert.rejects(
  access(resolve(root, "src/app/admin/image-generator/page.tsx")),
  { code: "ENOENT" },
  "Retired image-generator route must stay removed",
);
assertContains(
  storyboardPage,
  'presentation="page"',
  "Standalone storyboard page presentation",
);
assertContains(
  storyboardPage,
  "generateStoryboardScene",
  "Standalone storyboard image generation",
);
assertContains(
  workspace,
  'presentation?: "dialog" | "page"',
  "Storyboard workspace presentation mode",
);
assertContains(
  menuService,
  "path: '/admin/storyboard'",
  "Sidebar menu migration",
);
assertContains(
  menuPages,
  "path: '/admin/storyboard'",
  "Menu editor page option",
);
assertContains(
  appLayout,
  "case '/admin/storyboard'",
  "Application header metadata",
);
assert.ok(
  !menuContext.includes("routeSite !== 'blog'"),
  "Admin routes must activate the admin sidebar",
);

console.log("Storyboard navigation separation verification passed");
