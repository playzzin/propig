import type {
  ImageStoryboard,
  StoryboardArtifact,
  StoryboardFinalAssemblyManifest,
  StoryboardTransitionLink,
  StoryboardWorkflowStage,
} from "@/schemas/imageStoryboard";

export type StoryboardProjectStatus =
  | "archived"
  | "cleanup-retry"
  | "attention"
  | "producing"
  | "final-current"
  | "final-stale"
  | "image-design"
  | "image-production"
  | "video-design"
  | "video-production"
  | "final-assembly";

function hashText(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }

  return [first, second]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function resolveVideoArtifactId(
  scene: ImageStoryboard["scenes"][number],
): string {
  return (
    scene.approvedVideoArtifactId ||
    scene.video.artifactId ||
    scene.video.clipId ||
    `scene:${scene.id}:video-revision:${scene.videoDesignRevision}`
  );
}

export function buildStoryboardTransitionLinks(
  storyboard: Pick<ImageStoryboard, "scenes">,
): StoryboardTransitionLink[] {
  return storyboard.scenes.slice(0, -1).map((scene, index) => {
    const nextScene = storyboard.scenes[index + 1];
    const durationSeconds =
      scene.video.transitionStyle === "cut"
        ? 0
        : Math.min(
            Math.max(scene.video.transitionSeconds || 0.35, 0.1),
            Math.max(0.1, scene.video.durationSeconds / 2),
          );

    return {
      id: `${scene.id}__${nextScene.id}`,
      fromSceneId: scene.id,
      toSceneId: nextScene.id,
      strategy: scene.video.transitionStyle,
      durationSeconds,
      outgoingFrameUrl: scene.video.lastFrameUrl,
      incomingFrameUrl: nextScene.generatedImage?.url || null,
      quality: null,
      needsReview:
        scene.video.transitionStyle !== "cut" &&
        (!scene.video.lastFrameUrl || !nextScene.generatedImage?.url),
    };
  });
}

export function deriveStoryboardArtifacts(
  storyboard: ImageStoryboard,
): StoryboardArtifact[] {
  const artifacts: StoryboardArtifact[] = storyboard.referenceAssets.map(
    (asset) => ({
      id: `reference:${asset.id}`,
      type: "reference-image",
      lifecycle: "active",
      sceneId: null,
      url: asset.image,
      storagePath: asset.storagePath || null,
      sourceArtifactIds: [],
      designRevision: null,
      createdAt: asset.createdAt,
      approvedAt: asset.createdAt,
      sizeBytes: null,
    }),
  );

  if (
    storyboard.videoProduction.backgroundMusicUrl &&
    storyboard.videoProduction.backgroundMusicName
  ) {
    artifacts.push({
      id: `audio:${hashText(storyboard.videoProduction.backgroundMusicStoragePath || storyboard.videoProduction.backgroundMusicUrl)}`,
      type: "audio",
      lifecycle: "active",
      sceneId: null,
      url: storyboard.videoProduction.backgroundMusicUrl,
      storagePath:
        storyboard.videoProduction.backgroundMusicStoragePath || null,
      sourceArtifactIds: [],
      designRevision: null,
      createdAt: storyboard.videoProduction.automationUpdatedAt || Date.now(),
      approvedAt: null,
      sizeBytes: null,
    });
  }

  storyboard.scenes.forEach((scene) => {
    if (scene.generatedImage) {
      artifacts.push({
        id:
          scene.approvedImageArtifactId ||
          `scene-image:${scene.generatedImage.id}`,
        type: "scene-image",
        lifecycle:
          scene.assetFreshness === "current" ? "active" : "review",
        sceneId: scene.id,
        url: scene.generatedImage.url,
        storagePath: null,
        sourceArtifactIds: scene.video.referenceAssetIds.map(
          (id) => `reference:${id}`,
        ),
        designRevision: scene.imageDesignRevision,
        createdAt: scene.generatedImage.generatedAt,
        approvedAt:
          scene.assetFreshness === "current"
            ? scene.generatedImage.generatedAt
            : null,
        sizeBytes: null,
      });
    }

    if (scene.video.videoUrl) {
      artifacts.push({
        id: resolveVideoArtifactId(scene),
        type: "scene-video",
        lifecycle:
          scene.video.status === "approved" ? "active" : "review",
        sceneId: scene.id,
        url: scene.video.videoUrl,
        storagePath: null,
        sourceArtifactIds: scene.generatedImage
          ? [
              scene.approvedImageArtifactId ||
                `scene-image:${scene.generatedImage.id}`,
            ]
          : [],
        designRevision: scene.videoDesignRevision,
        createdAt: scene.video.approvedAt || Date.now(),
        approvedAt: scene.video.approvedAt,
        sizeBytes: null,
      });
    }

    if (scene.video.lastFrameUrl) {
      artifacts.push({
        id: `frame:${resolveVideoArtifactId(scene)}`,
        type: "frame",
        lifecycle: "active",
        sceneId: scene.id,
        url: scene.video.lastFrameUrl,
        storagePath: null,
        sourceArtifactIds: [resolveVideoArtifactId(scene)],
        designRevision: scene.videoDesignRevision,
        createdAt: scene.video.approvedAt || Date.now(),
        approvedAt: scene.video.approvedAt,
        sizeBytes: null,
      });
    }
  });

  const finalVideoUrl =
    storyboard.videoProduction.finalVideoUrl ||
    storyboard.videoProduction.lastSuccessfulFinalVideoUrl;
  if (finalVideoUrl) {
    artifacts.push({
      id:
        storyboard.videoProduction.finalArtifactId ||
        storyboard.videoProduction.finalClipId ||
        `final:${hashText(finalVideoUrl)}`,
      type: "final-video",
      lifecycle: isStoryboardFinalCurrent(storyboard) ? "active" : "review",
      sceneId: null,
      url: finalVideoUrl,
      storagePath: null,
      sourceArtifactIds:
        storyboard.videoProduction.finalAssemblyManifest?.videoArtifactIds ||
        storyboard.scenes.map(resolveVideoArtifactId),
      designRevision: null,
      createdAt:
        storyboard.videoProduction.finalAssemblyManifest?.createdAt ||
        storyboard.videoProduction.automationUpdatedAt ||
        Date.now(),
      approvedAt: isStoryboardFinalCurrent(storyboard)
        ? storyboard.videoProduction.finalAssemblyManifest?.createdAt || null
        : null,
      sizeBytes: null,
    });
  }

  return artifacts;
}

export function buildStoryboardProductionRecordSignature(
  storyboard: ImageStoryboard,
): string {
  const artifacts = deriveStoryboardArtifacts(storyboard).map((artifact) => ({
    id: artifact.id,
    lifecycle: artifact.lifecycle,
    sceneId: artifact.sceneId,
    url: artifact.url,
    designRevision: artifact.designRevision,
    approvedAt: artifact.approvedAt,
  }));
  const transitions = buildStoryboardTransitionLinks(storyboard).map(
    (transition) => ({
      id: transition.id,
      strategy: transition.strategy,
      durationSeconds: transition.durationSeconds,
      outgoingFrameUrl: transition.outgoingFrameUrl,
      incomingFrameUrl: transition.incomingFrameUrl,
      needsReview: transition.needsReview,
    }),
  );
  return `records-${hashText(
    JSON.stringify({
      artifacts,
      transitions,
      final: storyboard.videoProduction.finalAssemblyManifest?.fingerprint || null,
    }),
  )}`;
}

type AssemblyFingerprintInput = Pick<
  ImageStoryboard,
  "aspectRatio" | "scenes" | "videoProduction"
>;

export function buildStoryboardAssemblyFingerprint(
  storyboard: AssemblyFingerprintInput,
  orderedClipIds?: string[],
): string {
  const clipIds =
    orderedClipIds ||
    storyboard.scenes.map((scene) => scene.video.clipId || `missing:${scene.id}`);
  const payload = {
    aspectRatio: storyboard.aspectRatio,
    audio: {
      preset: storyboard.videoProduction.audioMixPreset,
      music: storyboard.videoProduction.backgroundMusicUrl,
      musicVolume: storyboard.videoProduction.backgroundMusicVolume,
      sceneVolume: storyboard.videoProduction.sceneAudioVolume,
      crossfade: storyboard.videoProduction.audioCrossfadeSeconds,
    },
    clips: storyboard.scenes.map((scene, index) => ({
      sceneId: scene.id,
      order: scene.order,
      clipId: clipIds[index] || `missing:${scene.id}`,
      artifactId: resolveVideoArtifactId(scene),
      videoDesignRevision: scene.videoDesignRevision,
      trimStart: scene.video.trimStartSeconds,
      trimEnd: scene.video.trimEndSeconds,
      playbackRate: scene.video.playbackRate,
      audioVolume: scene.video.audioVolume,
      transition: scene.video.transitionStyle,
      transitionSeconds: scene.video.transitionSeconds,
    })),
  };

  return `assembly-${hashText(JSON.stringify(payload))}`;
}

export function createStoryboardFinalAssemblyManifest(
  storyboard: AssemblyFingerprintInput,
  orderedClipIds: string[],
  resolution: "480p" | "720p" | "1080p",
): StoryboardFinalAssemblyManifest {
  if (orderedClipIds.length !== storyboard.scenes.length) {
    throw new Error(
      "최종 조립 명세에는 모든 장면의 클립이 순서대로 포함되어야 합니다.",
    );
  }

  return {
    version: 1,
    fingerprint: buildStoryboardAssemblyFingerprint(
      storyboard,
      orderedClipIds,
    ),
    createdAt: Date.now(),
    orderedSceneIds: storyboard.scenes.map((scene) => scene.id),
    orderedClipIds: [...orderedClipIds],
    videoArtifactIds: storyboard.scenes.map(resolveVideoArtifactId),
    transitionLinks: buildStoryboardTransitionLinks(storyboard),
    aspectRatio: storyboard.aspectRatio,
    resolution,
    audioMixPreset: storyboard.videoProduction.audioMixPreset,
    backgroundMusicUrl: storyboard.videoProduction.backgroundMusicUrl,
    backgroundMusicVolume:
      storyboard.videoProduction.backgroundMusicVolume,
    sceneAudioVolume: storyboard.videoProduction.sceneAudioVolume,
    audioCrossfadeSeconds:
      storyboard.videoProduction.audioCrossfadeSeconds,
  };
}

export function isStoryboardFinalCurrent(
  storyboard: AssemblyFingerprintInput,
): boolean {
  const production = storyboard.videoProduction;
  const manifest = production.finalAssemblyManifest;
  if (
    production.finalStatus !== "completed" ||
    production.finalFreshness !== "current" ||
    !production.finalVideoUrl ||
    !manifest
  ) {
    return false;
  }

  return manifest.fingerprint === buildStoryboardAssemblyFingerprint(storyboard);
}

export function deriveStoryboardWorkflowStage(
  storyboard: AssemblyFingerprintInput,
): StoryboardWorkflowStage {
  if (isStoryboardFinalCurrent(storyboard)) return "completed";

  const generatedImages = storyboard.scenes.filter(
    (scene) => scene.generatedImage,
  ).length;
  const designedVideos = storyboard.scenes.filter(
    (scene) => scene.video.motionPrompt.trim(),
  ).length;
  const approvedVideos = storyboard.scenes.filter(
    (scene) =>
      scene.video.status === "approved" &&
      scene.video.clipId &&
      scene.video.videoUrl,
  ).length;

  if (
    storyboard.videoProduction.finalStatus === "queued" ||
    storyboard.videoProduction.finalStatus === "rendering"
  ) {
    return "final-assembly";
  }
  if (approvedVideos > 0) return "video-production";
  if (designedVideos > 0 || generatedImages === storyboard.scenes.length) {
    return "video-design";
  }
  if (generatedImages > 0) return "image-production";
  return "image-design";
}

export function getStoryboardProjectStatus(
  storyboard: ImageStoryboard,
): StoryboardProjectStatus {
  if (storyboard.archivedAt) return "archived";
  if (storyboard.cleanupStatus === "retry") return "cleanup-retry";
  if (
    storyboard.videoProduction.finalStatus === "failed" ||
    storyboard.videoProduction.automationStatus === "failed" ||
    storyboard.scenes.some(
      (scene) =>
        scene.assetFreshness === "review" || scene.video.status === "failed",
    )
  ) {
    return "attention";
  }
  if (
    ["preparing", "running", "pausing", "merging"].includes(
      storyboard.videoProduction.automationStatus,
    ) ||
    storyboard.videoProduction.finalStatus === "queued" ||
    storyboard.videoProduction.finalStatus === "rendering"
  ) {
    return "producing";
  }
  if (isStoryboardFinalCurrent(storyboard)) return "final-current";
  if (
    storyboard.videoProduction.finalVideoUrl ||
    storyboard.videoProduction.lastSuccessfulFinalVideoUrl
  ) {
    return "final-stale";
  }

  const stage = deriveStoryboardWorkflowStage(storyboard);
  return stage === "completed" ? "final-current" : stage;
}

export const STORYBOARD_PROJECT_STATUS_LABELS: Record<
  StoryboardProjectStatus,
  string
> = {
  archived: "보관됨",
  "cleanup-retry": "정리 재시도",
  attention: "확인 필요",
  producing: "제작 중",
  "final-current": "완성본 준비",
  "final-stale": "완성본 업데이트 필요",
  "image-design": "이미지 장면 설계",
  "image-production": "이미지 제작",
  "video-design": "영상 장면 설계",
  "video-production": "영상 제작",
  "final-assembly": "최종 조립",
};
