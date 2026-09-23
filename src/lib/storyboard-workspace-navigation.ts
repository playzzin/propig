import type { ImageStoryboard } from "@/schemas/imageStoryboard";
import { getStoryboardProjectStatus, isStoryboardFinalCurrent } from "./storyboard-workflow";

export type StoryboardOpenIntent = "edit" | "result" | "recovery";
export type StoryboardPosition = {
  mode: "storyboard" | "video";
  sceneId: string | null;
};

/** Resolve from current assets, never from a stale saved stage or array index. */
export function getStoryboardNextAction(storyboard: ImageStoryboard) {
  const scenes = storyboard.scenes;
  const status = getStoryboardProjectStatus(storyboard);
  const action = (label: string, mode: StoryboardPosition["mode"], sceneId: string | null, intent: StoryboardOpenIntent = "edit") =>
    ({ label, mode, sceneId, intent });
  if (status === "cleanup-retry") return action("파일 정리 확인", "video", scenes[0]?.id ?? null, "recovery");
  if (status === "producing") return action("제작 상태 확인", "video", scenes[storyboard.videoProduction.automationCurrentSceneIndex ?? 0]?.id ?? scenes[0]?.id ?? null);
  const staleImage = scenes.find((scene) => scene.assetFreshness === "review");
  if (staleImage) return action("이미지 변경 확인", "storyboard", staleImage.id, "recovery");
  const failedVideo = scenes.find((scene) => scene.video.status === "failed");
  if (failedVideo) return action(`${failedVideo.order}번 장면 문제 해결`, "video", failedVideo.id, "recovery");
  if (status === "attention") return action("제작 문제 확인", "video", scenes[0]?.id ?? null, "recovery");
  if (isStoryboardFinalCurrent(storyboard)) return action("완성본 보기", "video", scenes[0]?.id ?? null, "result");
  if (scenes.length && scenes.every((scene) => scene.video.status === "approved" && scene.video.clipId && scene.video.videoUrl)) {
    return action(status === "final-stale" ? "완성본 갱신하기" : "완성본 조립하기", "video", scenes[0].id, "result");
  }
  const missingImage = scenes.find((scene) => !scene.generatedImage?.url && !scene.video.lastFrameUrl);
  if (!scenes.length || missingImage) return action("이미지 설계 계속하기", "storyboard", missingImage?.id ?? null);
  const missingMotion = scenes.find((scene) => !scene.video.motionPrompt.trim() && !scene.narrativeBeat.trim() && !scene.cameraDirection.trim());
  if (missingMotion) return action("움직임 설정 계속하기", "video", missingMotion.id);
  const unapproved = scenes.find((scene) => scene.video.status !== "approved" || !scene.video.clipId || !scene.video.videoUrl);
  if (unapproved) return action(unapproved.video.videoUrl ? "영상 검수하기" : "영상 제작 계속하기", "video", unapproved.id);
  return action(status === "final-stale" ? "완성본 갱신하기" : "완성본 조립하기", "video", scenes[0]?.id ?? null, "result");
}

export function resolveStoryboardPosition(storyboard: ImageStoryboard, intent: StoryboardOpenIntent, previous?: StoryboardPosition): StoryboardPosition {
  const next = getStoryboardNextAction(storyboard);
  // Recovery and completed work must not be redirected to an unrelated old tab.
  if (intent === "edit" && next.intent === "edit" && previous?.mode === next.mode && storyboard.scenes.some((scene) => scene.id === previous.sceneId)) {
    return previous;
  }
  return { mode: next.mode, sceneId: next.sceneId };
}
