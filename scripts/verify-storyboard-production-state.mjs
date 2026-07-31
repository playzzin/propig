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
  automationActive: false,
  automationCompletedCount: 0,
  automationCurrentSceneIndex: null,
  automationErrorMessage: null,
  automationProgress: 0,
  automationStatus: "idle",
  budgetExceeded: false,
  canPauseAutomation: false,
  canResumeAutomation: false,
  canStartAutomation: true,
  finalMergeInFlight: false,
  firstSceneReady: true,
  hasFinalDelivery: false,
  isDownloading: false,
  isRecoveringAutomation: false,
  jobSubscriptionError: null,
  jobSubscriptionReady: true,
  nextQualityAction: null,
  pendingSceneCount: 2,
  pricingCheckPending: false,
  qualityMode: "proof",
  readySceneCount: 1,
  sceneCount: 3,
  startFrameCount: 3,
  unknownPricingBlocked: false,
};
const activeJourney = buildStoryboardProductionJourney(journeyDefaults);
assert(
  activeJourney.currentStep === 1,
  "A prepared storyboard must point to scene video production.",
);
assert(
  activeJourney.primaryLabel === "전체 영상 만들기",
  "An idle storyboard must expose one production action.",
);

const completedJourney = buildStoryboardProductionJourney({
  ...journeyDefaults,
  automationProgress: 100,
  automationStatus: "completed",
  hasFinalDelivery: true,
  pendingSceneCount: 0,
  readySceneCount: 3,
});
assert(
  completedJourney.currentStep === 3,
  "A delivered storyboard must point to review and download.",
);
assert(
  completedJourney.primaryLabel === "완성본 다운로드",
  "A delivered storyboard must expose download as the primary action.",
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

console.log("Storyboard production state verification passed");
