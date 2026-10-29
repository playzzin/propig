import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  workspace,
  styles,
  references,
  journey,
  videoStyles,
  videoPanel,
  videoService,
  videoJobsHook,
  sceneEditor,
  dashboard,
] =
  await Promise.all([
    readFile(
      new URL(
        "../src/components/image-generator/StoryboardWorkspace.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/image-generator/StoryboardWorkspace.styles.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/image-generator/ReferenceImageAssetManager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/image-generator/StoryboardProductionJourney.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/image-generator/StoryboardVideoProductionPanel.styles.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/image-generator/StoryboardVideoProductionPanel.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/services/videoStudioService.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/hooks/useStoryboardVideoJobs.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/image-generator/StoryboardSceneProductionEditor.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/image-generator/StoryboardProjectDashboard.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../src/components/AppLayout.tsx", import.meta.url), "utf8"),
  ]);

for (const requirement of [
  "previouslyFocusedElementRef",
  "previous?.isConnected",
  "element.getClientRects().length > 0",
  'aria-live="polite"',
  "isTextEditingElement(event.target)",
  'loading: authLoading',
  'role="status" aria-live="polite"',
  'aria-label="프로젝트 대시보드 열기"',
  'aria-current={',
]) {
  assert.ok(
    workspace.includes(requirement),
    `Workspace accessibility contract missing: ${requirement}`,
  );
}
assert.ok(
  workspace.includes('field="title"') &&
    workspace.includes("onValueCommit={commitSceneText}") &&
    workspace.includes('field="redesignInstruction"') &&
    workspace.includes("commitSceneRedesignInstruction"),
  "Scene title and AI redesign instructions must buffer keystrokes locally instead of rerendering every scene card per character.",
);

assert.ok(
  styles.includes("content-visibility: auto"),
  "Long scene lists must defer off-screen rendering.",
);
assert.ok(
  styles.includes("contain-intrinsic-size: auto 460px"),
  "Deferred scene cards must reserve stable scroll space.",
);
assert.equal(
  styles.includes("transition: all"),
  false,
  "Storyboard styles must not use broad transition: all rules.",
);
assert.equal(
  videoStyles.includes("transition: all"),
  false,
  "Video-production styles must not use broad transition: all rules.",
);
assert.ok(
  styles.includes("container-name: storyboard-dashboard") &&
    styles.includes("@container storyboard-dashboard (max-width: 1080px)") &&
    styles.includes("@container storyboard-dashboard (max-width: 420px)"),
  "The project dashboard must respond to its real content width and keep row actions reachable on narrow screens.",
);
assert.ok(
  styles.includes('"180px minmax(0, 1fr) minmax(230px, 260px)"') &&
    styles.includes("@media (max-width: 1100px)"),
  "Laptop layouts must keep the quality assistant beside the editor until a lower panel is genuinely needed.",
);
assert.ok(
  dashboard.includes('role="group" aria-label="프로젝트 핵심 지표"') &&
    dashboard.includes('placeholder="프로젝트 제목 또는 주제 검색…"') &&
    dashboard.includes('role="group" aria-label="프로젝트 상태 필터"') &&
    dashboard.includes("projectFilterFromSearch") &&
    dashboard.includes("다시 불러오기"),
  "Dashboard metrics, URL-backed filters, search, and error recovery must remain accessible.",
);
assert.ok(
  workspace.includes("loginWithGoogle") &&
    workspace.includes("Google로 로그인하고 작업 시작") &&
    workspace.includes('aria-labelledby="storyboard-sign-in-title"') &&
    workspace.includes('aria-label="스토리보드 제작 과정"') &&
    workspace.includes("로그인만으로 AI 생성을 시작하지 않으며") &&
    workspace.includes('className="signin-warning" role="alert"') &&
    workspace.includes('code.includes("unauthorized-domain")') &&
    workspace.includes("Firebase 승인 도메인 등록을 요청해 주세요"),
  "The signed-out workspace must explain the production journey, privacy boundary, and provide a labelled recovery action.",
);
assert.ok(
  workspace.includes('id="storyboard-planning-disclosure"') &&
    workspace.includes('aria-describedby="storyboard-planning-disclosure"') &&
    workspace.includes("OpenRouter 텍스트·비전 요청을 1회 사용하고") &&
    workspace.includes('id="storyboard-scene-generation-disclosure"') &&
    workspace.includes('aria-describedby="storyboard-scene-generation-disclosure"') &&
    workspace.includes("같은 장면을 재생성하면 새 요청으로 처리됩니다") &&
    workspace.includes("PendingStoryboardPaidAction") &&
    workspace.includes('id="storyboard-planning-approval"') &&
    workspace.includes('id="storyboard-generation-approval"') &&
    workspace.includes("지금은 공급자 요청이 시작되지 않았습니다") &&
    workspace.includes("지금은 이미지 공급자 요청이 시작되지 않았습니다") &&
    workspace.includes("disabled={!paidActionAccepted}") &&
    !workspace.includes("번 장면을 다시 생성할까요? 새 이미지 생성 비용"),
  "Planning and image-generation actions must require accessible inline approval and expose provider, transmission, and repeat-request semantics before execution.",
);
assert.ok(
  dashboard.includes("resetProjectFilters") &&
    dashboard.includes("검색·필터 초기화"),
  "An empty filtered dashboard must offer one-action search and filter recovery.",
);
// Menu visibility is exercised in verify-storyboard-ui-playwright.mjs against
// rendered open/closed states; source spelling does not prove focus behavior.

for (const requirement of [
  'type="button"',
  'aria-label="완성본 제작 조건"',
  'role="group"',
  "onSelectStep(step.target)",
  'aria-live="polite"',
]) {
  assert.ok(
    journey.includes(requirement),
    `Production journey accessibility contract missing: ${requirement}`,
  );
}
assert.ok(
  sceneEditor.includes("tabIndex={-1}") &&
    sceneEditor.includes(
      "aria-labelledby={`storyboard-video-scene-title-${scene.id}`}",
    ),
  "Direct scene navigation must move focus to a labelled scene editor.",
);
assert.ok(
  sceneEditor.includes('<SceneError role="alert">') &&
    sceneEditor.includes('<MotionControl role="group"'),
  "Scene controls and asynchronous blocking errors must expose accessible semantics.",
);
assert.ok(
  videoPanel.includes('<TimelineOverview as="nav"') &&
    videoPanel.includes('현재 채택 영상 비용'),
  "The scene timeline must be navigable and adopted-scene costs must not be presented as a complete usage ledger.",
);
assert.ok(
  videoStyles.includes("@media (max-width: 520px)") &&
    videoStyles.includes("touch-action: manipulation") &&
    videoStyles.includes("overflow-x: auto") &&
    videoStyles.includes("scroll-snap-type: x proximity") &&
    videoStyles.includes("&:focus-visible"),
  "The guided production controls must retain mobile layout and touch behavior.",
);
assert.ok(
  videoPanel.includes("RuntimeStatusRetryButton") &&
    videoPanel.includes('aria-label="영상 처리 서버 상태 다시 확인"') &&
    videoPanel.includes("runtimeStatusAutoRetryCountRef.current >= 2") &&
    videoPanel.includes('window.addEventListener("online"') &&
    videoPanel.includes('document.addEventListener("visibilitychange"'),
  "A stale worker warning must provide an accessible manual retry and bounded automatic recovery.",
);
assert.ok(
  videoService.includes('fetch("/api/video-studio/status"') &&
    videoService.includes('cache: "no-store"'),
  "Worker compatibility checks must bypass the browser HTTP cache after a deployment.",
);
assert.ok(
  videoJobsHook.includes("const stableJobIds = useMemo(") &&
    videoJobsHook.includes(".sort().join") &&
    !videoJobsHook.includes("[enabled, jobIds, subscriptionKey]") &&
    videoJobsHook.includes("retryEpoch") &&
    videoJobsHook.includes("JOB_QUERY_BATCH_SIZE = 30") &&
    videoJobsHook.includes("where(documentId(), 'in', batchJobIds)") &&
    videoJobsHook.includes("window.addEventListener('online'") &&
    videoJobsHook.includes("document.addEventListener('visibilitychange'"),
  "Equivalent job id lists must keep their listeners, while failed subscriptions expose bounded automatic and manual reconnection.",
);
assert.ok(
  sceneEditor.includes('<summary>기술 정보</summary>') &&
    sceneEditor.includes("<code>{scene.video.errorMessage}</code>") &&
    !sceneEditor.includes(
      '<SceneError role="alert">{scene.video.errorMessage}</SceneError>',
    ),
  "Provider error payloads must stay behind an optional technical-details disclosure.",
);

for (const requirement of [
  'type="button"',
  "aria-label=",
  "alt={`${IMAGE_REFERENCE_ROLE_LABELS[asset.role]}",
  "URL.revokeObjectURL(objectUrl)",
]) {
  assert.ok(
    references.includes(requirement),
    `Reference manager accessibility or cleanup contract missing: ${requirement}`,
  );
}

console.log(
  "Storyboard accessibility and rendering-performance contracts verified.",
);
