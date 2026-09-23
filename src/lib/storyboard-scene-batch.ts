import type { ImageStoryboard, ImageStoryboardScene, StoryboardVideoScene } from "@/schemas/imageStoryboard";
import { resetStoryboardVideoProduction } from "@/lib/storyboard-video-production";
import { STORYBOARD_VIDEO_DURATION_OPTIONS } from "@/lib/storyboard-video-audio";

export function canBatchEditStoryboardScene(scene: ImageStoryboardScene): boolean {
  return scene.video.status === "brief" && !scene.video.videoUrl && !scene.video.jobId && !scene.video.clipId;
}

export function applyStoryboardSceneBatch(
  storyboard: ImageStoryboard,
  sceneIds: string[],
  settings: { durationSeconds?: number; motionIntensity?: StoryboardVideoScene["motionIntensity"] },
): ImageStoryboard {
  if (["preparing", "running", "pausing", "merging"].includes(storyboard.videoProduction.automationStatus)
    || storyboard.scenes.some((scene) => ["queued", "rendering"].includes(scene.video.status))) return storyboard;
  if (settings.durationSeconds !== undefined && !STORYBOARD_VIDEO_DURATION_OPTIONS.some((value) => value === settings.durationSeconds)) return storyboard;
  if (settings.motionIntensity !== undefined && !["subtle", "balanced", "dynamic"].includes(settings.motionIntensity)) return storyboard;
  const selected = new Set(sceneIds);
  let changed = false;
  const scenes = storyboard.scenes.map((scene) => {
    if (!selected.has(scene.id) || !canBatchEditStoryboardScene(scene)) return scene;
    const durationSeconds = settings.durationSeconds ?? scene.video.durationSeconds;
    const motionIntensity = settings.motionIntensity ?? scene.video.motionIntensity;
    if (durationSeconds === scene.video.durationSeconds && motionIntensity === scene.video.motionIntensity) return scene;
    changed = true;
    return {
      ...scene, duration: `${durationSeconds}초`, videoDesignRevision: scene.videoDesignRevision + 1,
      approvedVideoArtifactId: null,
      video: { ...scene.video, durationSeconds, motionIntensity, approvedAt: null },
    };
  });
  return changed ? { ...storyboard, scenes, videoProduction: resetStoryboardVideoProduction(storyboard.videoProduction) } : storyboard;
}
