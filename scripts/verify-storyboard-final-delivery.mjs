import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panelPath = new URL(
  "../src/components/image-generator/StoryboardVideoProductionPanel.tsx",
  import.meta.url,
);
const nextAdminPath = new URL(
  "../src/lib/server/video-studio-admin.ts",
  import.meta.url,
);
const functionsProcessorPath = new URL(
  "../functions/src/videoStudio/processor.ts",
  import.meta.url,
);
const functionsTriggerPath = new URL(
  "../functions/src/triggers/onVideoStudioJobQueued.ts",
  import.meta.url,
);
const videoJobsHookPath = new URL(
  "../src/hooks/useStoryboardVideoJobs.ts",
  import.meta.url,
);
const journeyComponentPath = new URL(
  "../src/components/image-generator/StoryboardProductionJourney.tsx",
  import.meta.url,
);
const journeyModelPath = new URL(
  "../src/lib/storyboard-production-journey.ts",
  import.meta.url,
);
const finalDeliveryPath = new URL(
  "../src/components/image-generator/StoryboardFinalDelivery.tsx",
  import.meta.url,
);
const automationConsolePath = new URL(
  "../src/components/image-generator/StoryboardAutomationConsole.tsx",
  import.meta.url,
);
const assemblyEditorPath = new URL(
  "../src/components/image-generator/StoryboardAssemblyEditor.tsx",
  import.meta.url,
);
const sceneEditorPath = new URL(
  "../src/components/image-generator/StoryboardSceneProductionEditor.tsx",
  import.meta.url,
);

const panel = readFileSync(panelPath, "utf8");
const nextAdmin = readFileSync(nextAdminPath, "utf8");
const functionsProcessor = readFileSync(functionsProcessorPath, "utf8");
const functionsTrigger = readFileSync(functionsTriggerPath, "utf8");
const videoJobsHook = readFileSync(videoJobsHookPath, "utf8");
const journeyComponent = readFileSync(journeyComponentPath, "utf8");
const journeyModel = readFileSync(journeyModelPath, "utf8");
const finalDelivery = readFileSync(finalDeliveryPath, "utf8");
const automationConsole = readFileSync(automationConsolePath, "utf8");
const assemblyEditor = readFileSync(assemblyEditorPath, "utf8");
const sceneEditor = readFileSync(sceneEditorPath, "utf8");
const productionSurface = [
  panel,
  journeyComponent,
  finalDelivery,
  automationConsole,
  assemblyEditor,
  sceneEditor,
].join("\n");

assert.ok(
  !panel.includes("processStudioJob"),
  "Storyboard automation must publish durable jobs instead of holding a browser request open for video rendering.",
);
assert.ok(
  /automationStatus:\s*["']running["']/.test(panel),
  "Resuming a provider checkpoint must continue the full storyboard run.",
);
assert.ok(
  productionSurface.includes("BufferedTextarea") &&
    productionSurface.includes("BufferedTextInput"),
  "Long motion, dialogue, and voice-direction input must use buffered fields.",
);
assert.ok(
  finalDelivery.includes("순서대로 다시 병합") &&
    panel.includes("preservePreviousFinal") &&
    panel.includes("finalVideoUrl: params.preservePreviousFinal"),
  "A completed storyboard must expose re-merge and retain the prior final file until the replacement completes.",
);
assert.ok(
  panel.includes("최종 조립 중") &&
    panel.includes("전체 장면과 최종 병합이 완료되었습니다."),
  "The UI must expose both final-assembly progress and delivery completion.",
);

const nextGetOwnedClips = nextAdmin.slice(
  nextAdmin.indexOf("export async function getOwnedClips"),
  nextAdmin.indexOf("export async function createVideoStudioJob"),
);
assert.ok(
  nextGetOwnedClips.includes("params.clipIds.map") &&
    !nextGetOwnedClips.includes(".sort("),
  "Next.js fallback merge must preserve the explicit storyboard clip order.",
);

const functionsGetClips = functionsProcessor.slice(
  functionsProcessor.indexOf("async function getClips"),
  functionsProcessor.indexOf("async function extractAndStoreLastFrame"),
);
assert.ok(
  functionsGetClips.includes("clipIds.map"),
  "Firebase worker merge must preserve the requested clip order.",
);
assert.ok(
  functionsProcessor.includes("mergeClipEdits") &&
    functionsProcessor.includes("backgroundMusicUrl"),
  "The final worker merge must retain scene edits and background-audio settings.",
);
assert.ok(
  nextAdmin.includes("queueDispatchToken = randomUUID()") &&
    functionsTrigger.includes("redispatchedQueuedJob") &&
    functionsTrigger.includes(
      "reason: redispatchedQueuedJob ? 'manual-redispatch' : 'status-transition'",
    ),
  "A stalled queued job must emit a new dispatch signal so its Firebase worker can start again.",
);
assert.ok(
  panel.includes("VIDEO_PROVIDER_RESUME_QUEUE_STALL_MS") &&
    panel.includes("hasProviderVideoResumeCheckpoint"),
  "OpenRouter provider polling must not be mistaken for an unavailable processor after two minutes.",
);
assert.ok(
  panel.includes("findNextStoryboardSceneIndex") &&
    panel.includes("getOrderedStoryboardClipIds") &&
    panel.includes("getReusableStoryboardSceneIds"),
  "Automation must skip reusable scenes and publish final merge clips in exact storyboard order.",
);
assert.ok(
  panel.includes("const readySceneCount = reusableSceneIds.size") &&
    !panel.includes("approvedSceneCount"),
  "Progress and merge controls must count only approved scenes with a playable clip and URL.",
);
assert.ok(
  panel.includes("completedOutputMissing") &&
    panel.includes("최종 병합 작업에 재생 가능한 영상 결과가 없습니다."),
  "A completed merge job without a playable output must not be presented as a finished delivery.",
);
assert.ok(
  panel.includes("jobSubscriptionReady") &&
    panel.includes("VIDEO_JOB_VISIBILITY_STALL_MS") &&
    panel.includes("automationRetryCountsByJobRef"),
  "Automation must surface unavailable job tracking and cap provider recovery retries instead of spinning forever.",
);
assert.ok(
  panel.includes("useStoryboardVideoJobs(relevantJobIds") &&
    videoJobsHook.includes("doc(db, VIDEO_STUDIO_JOBS_COLLECTION, jobId)") &&
    !videoJobsHook.includes("where('userId'"),
  "The production panel must observe only jobs referenced by the active storyboard, not the entire user job history.",
);
assert.ok(
  journeyComponent.includes('data-testid="storyboard-production-journey"') &&
    journeyModel.includes("buildStoryboardProductionJourney") &&
    journeyModel.includes("검수·다운로드") &&
    panel.includes("handleJourneyPrimaryAction"),
  "The first viewport must expose one guided path from preparation through final download.",
);
assert.ok(
  /품질·비용·세부\s*준비/.test(panel) && !panel.includes("<AutomationFlow"),
  "Advanced setup must use progressive disclosure without duplicating the production-step UI.",
);
assert.ok(
  panel.includes("<StoryboardProductionJourney") &&
    panel.includes("<StoryboardFinalDelivery") &&
    panel.includes("<StoryboardAutomationConsoleView") &&
    panel.includes("<StoryboardAssemblyEditorView") &&
    panel.includes("<StoryboardSceneProductionEditor") &&
    !/from\s+["']styled-components["']/.test(panel),
  "The production orchestrator must keep journey, automation, delivery, audio, scene, and styling concerns in dedicated modules.",
);

console.log("Storyboard final-delivery workflow contracts verified.");
