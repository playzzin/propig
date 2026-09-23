import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createStoryboardFinalAssemblyManifest,
  deriveStoryboardArtifacts,
  getStoryboardProjectStatus,
  isStoryboardFinalCurrent,
} from "../src/lib/storyboard-workflow.ts";

function scene(id, order, clipId) {
  return {
    id,
    order,
    title: `장면 ${order}`,
    status: "generated",
    duration: "3초",
    narrativeBeat: "제품을 자연스럽게 보여준다.",
    shotSize: "미디엄 샷",
    cameraDirection: "느린 전진",
    dialogueOrCaption: "",
    visualPrompt: "일관된 제품과 배경",
    imagePrompt: "일관된 제품과 배경을 사실적인 영화 조명으로 표현한다.",
    continuityAnchor: "제품 형태와 조명을 유지한다.",
    transition: "앞 장면 움직임을 이어받는다.",
    negativePrompt: "",
    assetFreshness: "current",
    staleReason: null,
    imageDesignRevision: 1,
    videoDesignRevision: 1,
    approvedImageArtifactId: `image-${id}`,
    approvedVideoArtifactId: clipId,
    generatedImage: {
      id: `image-${id}`,
      url: `https://example.com/${id}.png`,
      generatedAt: Date.now(),
    },
    video: {
      status: "approved",
      motionPrompt: "느린 전진",
      durationSeconds: 3,
      motionIntensity: "balanced",
      useNextSceneAsEndFrame: true,
      audioMode: "silent",
      generateAudio: false,
      trimStartSeconds: 0,
      trimEndSeconds: 0,
      playbackRate: 1,
      audioVolume: 1,
      clipId,
      artifactId: clipId,
      jobId: null,
      videoUrl: `https://example.com/${clipId}.mp4`,
      lastFrameUrl: `https://example.com/${clipId}-last.png`,
      modelUsed: "automatic",
      costUsd: 0.1,
      errorMessage: null,
      approvedAt: Date.now(),
      transitionStyle: order === 1 ? "crossfade" : "cut",
      transitionSeconds: order === 1 ? 0.35 : 0,
      referenceAssetIds: [],
      visualReferencesApplied: 0,
      firstFrameApplied: true,
      endFrameApplied: order === 1,
      audioApplied: false,
    },
  };
}

const base = {
  schemaVersion: 2,
  revision: 1,
  archivedAt: null,
  workflowStage: "video-production",
  cleanupStatus: "idle",
  cleanupErrorMessage: null,
  topic: "워크플로 테스트",
  title: "워크플로 테스트",
  logline: "",
  audience: "",
  aspectRatio: "16:9",
  stylePreset: "cinematic",
  artDirection: "",
  characterContinuity: "",
  settingContinuity: "",
  colorAndLighting: "",
  usePreviousSceneAsReference: true,
  referenceAssets: [],
  reclaimableStorageAssets: [],
  transitionLinks: [],
  videoProduction: {
    projectId: "project",
    qualityMode: "final",
    maxBudgetUsd: 5,
    allowUnknownPricing: false,
    voiceDirection: "",
    backgroundMusicUrl: null,
    backgroundMusicName: null,
    backgroundMusicStoragePath: null,
    audioMixPreset: "dialogue-first",
    backgroundMusicVolume: 0.16,
    sceneAudioVolume: 1,
    audioCrossfadeSeconds: 0.35,
    automationRunId: null,
    automationStatus: "idle",
    automationCurrentSceneIndex: null,
    automationCompletedSceneIds: [],
    automationRetryCount: 0,
    automationStartedAt: null,
    automationUpdatedAt: null,
    automationErrorMessage: null,
    finalJobId: null,
    finalClipId: null,
    finalVideoUrl: null,
    finalStatus: "idle",
    finalErrorMessage: null,
    finalArtifactId: null,
    finalFreshness: "current",
    finalAssemblyManifest: null,
    pendingAssemblyManifest: null,
    lastSuccessfulFinalVideoUrl: null,
  },
  scenes: [scene("one", 1, "clip-one"), scene("two", 2, "clip-two")],
};

const manifest = createStoryboardFinalAssemblyManifest(
  base,
  ["clip-one", "clip-two"],
  "720p",
);
const completed = {
  ...base,
  videoProduction: {
    ...base.videoProduction,
    finalClipId: "final-clip",
    finalArtifactId: "final-clip",
    finalVideoUrl: "https://example.com/final.mp4",
    lastSuccessfulFinalVideoUrl: "https://example.com/final.mp4",
    finalStatus: "completed",
    finalFreshness: "current",
    finalAssemblyManifest: manifest,
  },
};

assert.equal(isStoryboardFinalCurrent(completed), true);
assert.equal(getStoryboardProjectStatus(completed), "final-current");
assert.deepEqual(manifest.orderedSceneIds, ["one", "two"]);
assert.deepEqual(manifest.orderedClipIds, ["clip-one", "clip-two"]);
assert.equal(manifest.transitionLinks[0].strategy, "crossfade");

const edited = {
  ...completed,
  scenes: completed.scenes.map((item, index) =>
    index === 0
      ? {
          ...item,
          video: { ...item.video, transitionSeconds: 0.75 },
        }
      : item,
  ),
};
assert.equal(isStoryboardFinalCurrent(edited), false);
assert.equal(getStoryboardProjectStatus(edited), "final-stale");

const artifacts = deriveStoryboardArtifacts(completed);
assert.equal(
  artifacts.filter((artifact) => artifact.type === "scene-video").length,
  2,
);
assert.equal(
  artifacts.some(
    (artifact) =>
      artifact.type === "final-video" && artifact.lifecycle === "active",
  ),
  true,
);

const [schema, service, workspace, deleteRoute] = await Promise.all([
  readFile(
    new URL("../src/schemas/imageStoryboard.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/services/imageStoryboardService.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../src/components/image-generator/StoryboardWorkspace.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../src/app/api/storyboards/[storyboardId]/route.ts",
      import.meta.url,
    ),
    "utf8",
  ),
]);

assert.ok(schema.includes("scene.transitionStyle === 'fade'"));
assert.ok(schema.includes("{ transitionStyle: 'crossfade' }"));
assert.ok(service.includes("duplicateWithMedia"));
assert.ok(service.includes("syncStoryboardProductionRecords"));
assert.ok(service.includes("STORYBOARD_ARTIFACT_COLLECTION"));
assert.ok(workspace.includes("projectSwitchRequestRef"));
assert.ok(workspace.includes("imageStoryboardService.get("));
assert.ok(workspace.includes("<ProjectRowMenu>"));
assert.ok(deleteRoute.includes("db.recursiveDelete(storyboardRef)"));
assert.ok(deleteRoute.includes("bucket.deleteFiles"));

console.log("Storyboard workflow v2 contracts verified.");
