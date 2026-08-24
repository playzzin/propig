import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspacePath = new URL(
  "../src/components/image-generator/StoryboardWorkspace.tsx",
  import.meta.url,
);
const workspaceStylesPath = new URL(
  "../src/components/image-generator/StoryboardWorkspace.styles.ts",
  import.meta.url,
);
const dashboardPath = new URL(
  "../src/components/image-generator/StoryboardProjectDashboard.tsx",
  import.meta.url,
);
const productionPath = new URL(
  "../src/components/image-generator/StoryboardVideoProductionPanel.tsx",
  import.meta.url,
);
const automationConsolePath = new URL(
  "../src/components/image-generator/StoryboardAutomationConsole.tsx",
  import.meta.url,
);
const fileManagerPath = new URL(
  "../src/components/image-generator/StoryboardProjectFileManager.tsx",
  import.meta.url,
);

const workspace = readFileSync(workspacePath, "utf8");
const workspaceStyles = readFileSync(workspaceStylesPath, "utf8");
const dashboard = readFileSync(dashboardPath, "utf8");
const workspaceSurface = `${workspace}\n${workspaceStyles}\n${dashboard}`;
const production = readFileSync(productionPath, "utf8");
const automationConsole = readFileSync(automationConsolePath, "utf8");
const fileManager = readFileSync(fileManagerPath, "utf8");

const workspaceContracts = [
  ["dashboard surface", 'type WorkspaceSurface = "dashboard" | "editor"'],
  ["project search", 'aria-label="프로젝트 검색"'],
  ["status filters", 'aria-label="프로젝트 상태 필터"'],
  ["production quality score", "상용화 준비도"],
  ["six quality gates", 'id: "final"'],
  ["active scene assistant", "<ActiveSceneAssistant>"],
  ["missing image finder", 'data-testid="storyboard-missing-image-finder"'],
  ["missing image status marker", "data-missing-image={"],
  [
    "missing image direct focus",
    'if (action === "scenes" && missingImageScenes[0])',
  ],
  ["sequential production shortcut", "순차 생성·재시도·자동 병합"],
  ["file management shortcut", "결과·파일 관리"],
  [
    "storyboard three-pane layout",
    ': "218px minmax(500px, 1fr) minmax(260px, 294px)"',
  ],
  [
    "compact video two-pane layout",
    '? "218px minmax(0, 1fr)"',
  ],
  ["deep-link dashboard sync", 'url.searchParams.delete("storyboard")'],
];

for (const [label, contract] of workspaceContracts) {
  assert.ok(
    workspaceSurface.includes(contract),
    `Missing storyboard commercial workflow contract: ${label}`,
  );
}

assert.ok(
  production.includes("<StoryboardAutomationConsoleView") &&
    automationConsole.includes('data-testid="storyboard-video-automation"'),
  "The full production shortcut must target the automation console.",
);
assert.ok(
  workspace.includes("<StoryboardProjectDashboard") &&
    dashboard.includes("handleProjectFilter") &&
    !workspace.includes("const [projectSearch") &&
    workspace.includes('$dashboardMode={workspaceSurface === "dashboard"}') &&
    workspace.includes('{workspaceSurface === "editor" ? (\n              <ProjectSidebar'),
  "Project search, filter, and pagination state must remain isolated from the storyboard editor, and the dashboard must not duplicate the project sidebar.",
);
assert.ok(
  fileManager.includes('id="storyboard-project-files"'),
  "The file-management shortcut must target the project file manager.",
);
assert.ok(
  dashboard.includes('type StoryboardOpenIntent = "edit" | "result" | "recovery"') &&
    dashboard.includes('isCompleted\n                            ? "result"') &&
    dashboard.includes('? "recovery"') &&
    workspace.includes("revealStoryboardOpenIntent(intent)") &&
    workspace.includes('"#storyboard-final-delivery"') &&
    workspace.includes('"#storyboard-production-subscription-retry:not([disabled])"') &&
    workspace.includes('"#storyboard-production-recovery-action:not([disabled])"') &&
    workspace.includes("new MutationObserver") &&
    workspace.includes("recoveryDetails.open = true") &&
    production.includes('id="storyboard-production-recovery-details"') &&
    automationConsole.includes('id="storyboard-production-recovery-notice"') &&
    automationConsole.includes('id="storyboard-production-recovery-action"') &&
    automationConsole.includes('id="storyboard-production-subscription-retry"'),
  "Dashboard recovery must open the recovery details and focus the first available real error or recovery action after asynchronous rendering.",
);
assert.ok(
  workspace.indexOf("01 · TOPIC & AI STORY PLAN") <
      workspace.indexOf('title="02. 선택 시각 기준"') &&
    workspace.indexOf('title="02. 선택 시각 기준"') <
      workspace.indexOf("03 · SCENE PRODUCTION") &&
    workspace.includes("사진이 없어도 장면 설계와 생성은 정상적으로 진행됩니다") &&
    !workspace.includes('id: "references",\n        label: "시각 일관성"'),
  "Visible step numbers must follow DOM order and optional references must not lower readiness.",
);

console.log("Storyboard commercial workflow contracts verified.");
