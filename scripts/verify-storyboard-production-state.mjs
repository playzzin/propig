import {
  findNextStoryboardSceneIndex,
  getOrderedStoryboardClipIds,
  getReusableStoryboardSceneIds,
  invalidateStoryboardFinalAssembly,
  resetStoryboardVideoProduction,
} from "../src/lib/storyboard-video-production.ts";
import { buildStoryboardProductionJourney } from "../src/lib/storyboard-production-journey.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const scenes = [
  {
    id: "approved-complete",
    video: {
      status: "approved",
      clipId: "clip-1",
      videoUrl: "https://example.com/clip-1.mp4",
    },
  },
  {
    id: "approved-incomplete",
    video: {
      status: "approved",
      clipId: "clip-2",
      videoUrl: null,
    },
  },
  {
    id: "review-complete",
    video: {
      status: "review",
      clipId: "clip-3",
      videoUrl: "https://example.com/clip-3.mp4",
    },
  },
];

assert(
  JSON.stringify(getReusableStoryboardSceneIds(scenes)) ===
    JSON.stringify(["approved-complete"]),
  "Only approved scenes with both a clip and playable video may be reused.",
);
assert(
  findNextStoryboardSceneIndex(scenes, ["approved-complete"], 0) === 1,
  "Automation must skip a valid reusable scene and continue from the next unfinished scene.",
);
assert(
  findNextStoryboardSceneIndex(scenes, ["approved-incomplete"], 1) === 1,
  "A stale completed id without a playable video must be rendered again.",
);
assert(
  JSON.stringify(getOrderedStoryboardClipIds([scenes[0]])) ===
    JSON.stringify(["clip-1"]),
  "Final assembly must preserve the storyboard scene order.",
);
assert(
  getOrderedStoryboardClipIds(scenes) === null,
  "Final assembly must reject incomplete or unapproved scene outputs.",
);

const completedProduction = {
  backgroundMusicVolume: 0.16,
  automationRunId: "run-old",
  automationStatus: "completed",
  automationCurrentSceneIndex: 3,
  automationCompletedSceneIds: scenes.map((scene) => scene.id),
  automationRetryCount: 2,
  automationStartedAt: Date.now() - 10_000,
  automationUpdatedAt: Date.now(),
  automationErrorMessage: "old error",
  finalJobId: "job-old",
  finalClipId: "final-old",
  finalVideoUrl: "https://example.com/final-old.mp4",
  finalStatus: "completed",
  finalErrorMessage: "old final error",
};

const invalidated = invalidateStoryboardFinalAssembly(
  completedProduction,
  scenes,
  { backgroundMusicVolume: 0.24 },
);

assert(
  invalidated.backgroundMusicVolume === 0.24,
  "The requested assembly edit must be retained.",
);
assert(
  invalidated.automationStatus === "idle",
  "Editing the final assembly must clear completed automation state.",
);
assert(
  invalidated.finalStatus === "idle",
  "Editing the final assembly must require a new merge.",
);
assert(
  invalidated.finalVideoUrl === completedProduction.finalVideoUrl,
  "The previous final URL must remain available until its replacement succeeds.",
);
assert(
  invalidated.finalFreshness === "stale",
  "An assembly edit must visibly mark the preserved final as stale.",
);
assert(
  invalidated.automationRunId === null,
  "The previous automation run must be detached.",
);
assert(
  JSON.stringify(invalidated.automationCompletedSceneIds) ===
    JSON.stringify(["approved-complete"]),
  "Valid approved clips must remain reusable after an assembly-only edit.",
);

const reset = resetStoryboardVideoProduction(completedProduction, {
  backgroundMusicVolume: 0.3,
});
assert(
  reset.backgroundMusicVolume === 0.3,
  "A reset must retain the requested production patch.",
);
assert(
  reset.automationStatus === "idle",
  "A reset must stop the previous automation run.",
);
assert(
  reset.automationCompletedSceneIds.length === 0,
  "A storyboard edit must clear stale completed scene ids.",
);
assert(
  reset.finalVideoUrl === completedProduction.finalVideoUrl,
  "A storyboard edit must preserve the previous final delivery for recovery.",
);

const journeyDefaults = {
  approvedSceneCount: 1,
  automationActive: false,
  automationCompletedCount: 0,
  automationCurrentSceneIndex: null,
  automationErrorMessage: null,
  automationProgress: 0,
  automationStatus: "idle",
  budgetExceeded: false,
  canPauseAutomation: false,
  canOpenImageWorkspace: true,
  canResumeAutomation: false,
  canStartAutomation: true,
  finalMergeInFlight: false,
  firstMissingApprovalSceneId: "scene-2",
  firstMissingImageSceneId: null,
  firstMissingVideoDesignSceneId: null,
  firstMissingVideoSceneId: "scene-2",
  firstTransitionIssueSceneId: null,
  generatedVideoCount: 1,
  hasCurrentFinalDelivery: false,
  hasFinalDelivery: false,
  imageDesignReadyCount: 3,
  isDownloading: false,
  isRecoveringAutomation: false,
  jobSubscriptionError: null,
  jobSubscriptionReady: true,
  nextQualityAction: null,
  pendingSceneCount: 2,
  pricingCheckPending: false,
  qualityMode: "proof",
  sceneCount: 3,
  startFrameCount: 3,
  transitionCount: 2,
  transitionReadyCount: 2,
  unknownPricingBlocked: false,
  videoDesignReadyCount: 3,
};
const activeJourney = buildStoryboardProductionJourney(journeyDefaults);
assert(
  activeJourney.currentStep === 3,
  "A prepared storyboard must point to scene video production.",
);
assert(
  activeJourney.primaryLabel === "2개 장면 제작 내용 확인",
  "An idle storyboard must expose one production action.",
);
assert(
  activeJourney.progress > 0 && activeJourney.progress < 100,
  "Overall progress must include completed design and image stages before video automation starts.",
);

const imageJourney = buildStoryboardProductionJourney({
  ...journeyDefaults,
  firstMissingImageSceneId: "scene-2",
  startFrameCount: 1,
});
assert(
  imageJourney.currentStep === 1 &&
    imageJourney.primaryLabel === "비어 있는 이미지 만들기" &&
    !imageJourney.primaryDisabled,
  "Missing scene images must guide the user back to image production before video automation.",
);

const completedJourney = buildStoryboardProductionJourney({
  ...journeyDefaults,
  automationProgress: 100,
  automationStatus: "completed",
  approvedSceneCount: 3,
  firstMissingApprovalSceneId: null,
  firstMissingVideoSceneId: null,
  generatedVideoCount: 3,
  hasCurrentFinalDelivery: true,
  hasFinalDelivery: true,
  pendingSceneCount: 0,
});
assert(
  completedJourney.currentStep === 4,
  "A delivered storyboard must point to final delivery and download.",
);
assert(
  completedJourney.progress === 100,
  "A current final delivery must complete the five-stage progress meter.",
);
assert(
  completedJourney.primaryLabel === "완성본 다운로드",
  "A delivered storyboard must expose download as the primary action.",
);

const staleJourney = buildStoryboardProductionJourney({
  ...journeyDefaults,
  approvedSceneCount: 3,
  firstMissingApprovalSceneId: null,
  firstMissingVideoSceneId: null,
  generatedVideoCount: 3,
  hasFinalDelivery: true,
  pendingSceneCount: 0,
});
assert(
  staleJourney.primaryIntent === "remerge-final" &&
    staleJourney.primaryLabel === "최신 완성본 다시 조립",
  "A stale final delivery must guide the user to re-merge rather than download an old file.",
);
assert(
  staleJourney.completionChecks.length === 5 &&
    staleJourney.completionChecks.at(-1)?.value === "갱신 필요",
  "The completion gate must expose image, video, approval, transition, and final freshness state.",
);

const disconnectedRecovery = buildStoryboardProductionJourney({
  ...journeyDefaults,
  automationStatus: "failed",
  canResumeAutomation: true,
  canStartAutomation: false,
  jobSubscriptionReady: false,
});
assert(
  disconnectedRecovery.primaryDisabled,
  "Recovery must stay disabled until job tracking is ready.",
);

const creditBlockedJourney = buildStoryboardProductionJourney({
  ...journeyDefaults,
  canStartAutomation: false,
  creditIssue: "영상 제작 예상 비용 중 $1.25가 부족합니다.",
});
assert(
  creditBlockedJourney.primaryDisabled &&
    creditBlockedJourney.primaryLabel === "OpenRouter 충전 후 제작" &&
    creditBlockedJourney.guidance.includes("$1.25") &&
    creditBlockedJourney.hasError,
  "Insufficient credit must explain the blocker at the primary journey action instead of hiding it in advanced settings.",
);

console.log("Storyboard production state verification passed");
