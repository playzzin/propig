"use client";

import {
  ProductionSurface,
  ProductionHeader,
  HeaderLabel,
  AutomaticBadge,
  ControlStrip,
  QualityReadiness,
  QualityMeter,
  ProductionDetails,
  QualityGate,
  QualityGateHeader,
  QualityCheckGrid,
  QualityCheck,
  QualityActionList,
  QualitySelector,
  MetricsGrid,
  Metric,
  TimelineOverview,
  TimelineScene,
  SceneProductionList,
} from "./StoryboardVideoProductionPanel.styles";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import StoryboardAutomationConsoleView from "@/components/image-generator/StoryboardAutomationConsole";
import StoryboardAssemblyEditorView from "@/components/image-generator/StoryboardAssemblyEditor";
import StoryboardFinalDelivery from "@/components/image-generator/StoryboardFinalDelivery";
import StoryboardProductionJourney from "@/components/image-generator/StoryboardProductionJourney";
import StoryboardSceneProductionEditor from "@/components/image-generator/StoryboardSceneProductionEditor";
import { useStoryboardVideoJobs } from "@/hooks/useStoryboardVideoJobs";
import { buildStoryboardProductionJourney } from "@/lib/storyboard-production-journey";
import {
  IMAGE_REFERENCE_ROLE_LABELS,
  type ImageReferenceAsset,
} from "@/types/imageReference";
import {
  type VideoStudioAspectRatio,
  type VideoStudioJob,
  type VideoStudioResolution,
} from "@/lib/video-studio";
import {
  canReuseStoryboardVideoProviderJob,
  describeStoryboardVideoRecovery,
} from "@/lib/storyboard-video-recovery";
import {
  analyzeStoryboardDialogueTiming,
  appendStoryboardVideoAudioDirection,
  resolveStoryboardVideoAudioMode,
  STORYBOARD_VIDEO_DURATION_OPTIONS,
} from "@/lib/storyboard-video-audio";
import {
  findNextStoryboardSceneIndex,
  getOrderedStoryboardClipIds,
  getReusableStoryboardSceneIds,
  invalidateStoryboardFinalAssembly,
  resetStoryboardVideoProduction,
} from "@/lib/storyboard-video-production";
import {
  buildStoryboardAssemblyFingerprint,
  createStoryboardFinalAssemblyManifest,
  isStoryboardFinalCurrent,
} from "@/lib/storyboard-workflow";
import {
  createDownloadFileName,
  downloadRemoteMedia,
  openRemoteMedia,
} from "@/lib/client/media-download";
import type {
  ImageStoryboard,
  ImageStoryboardScene,
  StoryboardAudioMixPreset,
  StoryboardVideoAutomationStatus,
  StoryboardVideoAudioMode,
  StoryboardVideoQualityMode,
  StoryboardVideoScene,
  StoryboardVideoSceneStatus,
  StoryboardStorageCleanupAsset,
} from "@/schemas/imageStoryboard";
import {
  videoStudioService,
  type VideoStudioEstimate,
} from "@/services/videoStudioService";
import { imageStoryboardService } from "@/services/imageStoryboardService";
import StoryboardProjectFileManager from "@/components/image-generator/StoryboardProjectFileManager";

type StoryboardUpdater = (current: ImageStoryboard) => ImageStoryboard;

type StoryboardVideoProductionPanelProps = {
  storyboardId: string | null;
  storyboard: ImageStoryboard;
  referenceAssets: ImageReferenceAsset[];
  activeSceneId: string | null;
  onActiveSceneChange: (sceneId: string) => void;
  onDuplicateScene: (scene: ImageStoryboardScene) => void;
  disabled?: boolean;
  onChange: (updater: StoryboardUpdater) => void;
};

const MAX_VIDEO_REFERENCE_IMAGES = 2;
const MAX_VIDEO_REFERENCE_DATA_URL_LENGTH = 280_000;
const MAX_VIDEO_REFERENCE_EDGE = 768;
const AUTOMATION_RETRY_LIMIT = 1;
const AUTOMATION_ACTIVE_STATUSES = new Set<StoryboardVideoAutomationStatus>([
  "preparing",
  "running",
  "pausing",
  "merging",
]);
const VIDEO_REFERENCE_ROLE_PRIORITY: Record<
  ImageReferenceAsset["role"],
  number
> = {
  character: 0,
  product: 1,
  building: 2,
  background: 3,
  style: 4,
};

const STATUS_LABELS: Record<StoryboardVideoSceneStatus, string> = {
  brief: "브리프 준비",
  queued: "대기 중",
  rendering: "렌더링",
  review: "검수 필요",
  approved: "승인 완료",
  failed: "다시 확인",
};

function createAutomationRunId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `storyboard-run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function queueReclaimableBackgroundMusic(
  current: ImageStoryboard,
  storagePath: string,
  label: string,
): StoryboardStorageCleanupAsset[] {
  if (
    current.reclaimableStorageAssets.some(
      (asset) => asset.storagePath === storagePath,
    )
  ) {
    return current.reclaimableStorageAssets;
  }

  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return [
    ...current.reclaimableStorageAssets,
    {
      id,
      storagePath,
      label,
      kind: "background-music" as const,
      queuedAt: Date.now(),
    },
  ].slice(-80);
}

const MOTION_PRESETS = [
  {
    label: "정적인 고급감",
    value: "subtle" as const,
    instruction:
      "Use restrained natural motion and a slow, stable camera move.",
  },
  {
    label: "균형 잡힌 움직임",
    value: "balanced" as const,
    instruction: "Use clear subject motion and a smooth cinematic camera move.",
  },
  {
    label: "역동적인 전개",
    value: "dynamic" as const,
    instruction:
      "Use energetic subject motion and a confident dynamic camera move without distortion.",
  },
];

const AUDIO_MODE_OPTIONS: Array<{
  value: StoryboardVideoAudioMode;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: "silent",
    label: "무음",
    description: "영상만 생성",
    icon: "fas fa-volume-xmark",
  },
  {
    value: "ambient",
    label: "현장음",
    description: "장면 효과음 포함",
    icon: "fas fa-wave-square",
  },
  {
    value: "dialogue",
    label: "대사·립싱크",
    description: "입 모양까지 동기화",
    icon: "fas fa-microphone-lines",
  },
];

const AUDIO_MIX_OPTIONS: Array<{
  value: Exclude<StoryboardAudioMixPreset, "custom">;
  label: string;
  description: string;
  backgroundMusicVolume: number;
  sceneAudioVolume: number;
}> = [
  {
    value: "dialogue-first",
    label: "대사 우선",
    description: "말할 때 음악을 가장 낮게 유지",
    backgroundMusicVolume: 0.12,
    sceneAudioVolume: 1.1,
  },
  {
    value: "balanced",
    label: "균형",
    description: "대사와 음악을 자연스럽게 조화",
    backgroundMusicVolume: 0.18,
    sceneAudioVolume: 1,
  },
  {
    value: "music-first",
    label: "음악 강조",
    description: "음악의 존재감을 살리고 대사는 보호",
    backgroundMusicVolume: 0.26,
    sceneAudioVolume: 0.95,
  },
];

const USD_STANDARD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const USD_MICRO_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

function buildMotionPrompt(
  storyboard: ImageStoryboard,
  scene: ImageStoryboardScene,
  nextScene?: ImageStoryboardScene,
  useNextSceneAsEndFrame = false,
  visualReferenceLabels: string[] = [],
): string {
  const intensity =
    MOTION_PRESETS.find((item) => item.value === scene.video.motionIntensity)
      ?.instruction ?? MOTION_PRESETS[1].instruction;
  const audioMode = resolveStoryboardVideoAudioMode(scene.video);
  const motionPrompt = [
    `Create a continuous cinematic video shot from the locked storyboard first frame for scene ${scene.order}: ${scene.title}.`,
    scene.narrativeBeat ? `Story action: ${scene.narrativeBeat}` : "",
    scene.cameraDirection
      ? `Camera movement: ${scene.cameraDirection}`
      : `Maintain the ${scene.shotSize} composition with subtle cinematic depth.`,
    intensity,
    scene.continuityAnchor ? `Continuity lock: ${scene.continuityAnchor}` : "",
    storyboard.characterContinuity
      ? `Character and product identity lock: ${storyboard.characterContinuity}`
      : "",
    storyboard.settingContinuity
      ? `Environment lock: ${storyboard.settingContinuity}`
      : "",
    storyboard.colorAndLighting
      ? `Lighting and color lock: ${storyboard.colorAndLighting}`
      : "",
    visualReferenceLabels.length
      ? `Visual source of truth: preserve the supplied ${visualReferenceLabels.join(", ")} references. Do not substitute a different person, product, building, or environment.`
      : "",
    audioMode === "dialogue" && storyboard.videoProduction.voiceDirection.trim()
      ? `Voice continuity lock for every scene: ${storyboard.videoProduction.voiceDirection.trim()}`
      : "",
    useNextSceneAsEndFrame && nextScene
      ? `The supplied last frame is a hard destination: resolve the motion smoothly into scene ${nextScene.order}, ${nextScene.title}, without a cut or a visual identity change.`
      : scene.transition
        ? `End the shot ready for this transition: ${scene.transition}`
        : "End on a clean, stable composition.",
    "Use one uninterrupted take with temporal stability. Preserve identity, product geometry, architecture, wardrobe, materials, lighting direction, and background layout. Avoid cuts, morphing, duplicated subjects, sudden camera jumps, readable text, logos, and watermarks.",
  ]
    .filter(Boolean)
    .join("\n");
  return appendStoryboardVideoAudioDirection(
    motionPrompt,
    audioMode,
    scene.dialogueOrCaption,
    scene.video.durationSeconds,
  );
}

function loadReferenceImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("참조 사진을 영상용으로 준비하지 못했습니다."));
    image.src = source;
  });
}

async function compactVideoReference(
  asset: ImageReferenceAsset,
): Promise<string> {
  if (
    !asset.image.startsWith("data:image/") ||
    asset.image.length <= MAX_VIDEO_REFERENCE_DATA_URL_LENGTH
  ) {
    return asset.image;
  }

  const sourceImage = await loadReferenceImage(asset.image);
  const longestEdge = Math.max(
    sourceImage.naturalWidth,
    sourceImage.naturalHeight,
  );
  const scale = Math.min(
    1,
    MAX_VIDEO_REFERENCE_EDGE / Math.max(1, longestEdge),
  );
  let width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
  let height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));

  for (const quality of [0.82, 0.68, 0.54]) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) break;
    context.drawImage(sourceImage, 0, 0, width, height);
    const compacted = canvas.toDataURL("image/jpeg", quality);
    if (compacted.length <= MAX_VIDEO_REFERENCE_DATA_URL_LENGTH)
      return compacted;
    width = Math.max(1, Math.round(width * 0.72));
    height = Math.max(1, Math.round(height * 0.72));
  }

  throw new Error(`${asset.name} 사진이 영상 참조에 사용하기엔 너무 큽니다.`);
}

function selectVideoReferenceAssets(
  assets: ImageReferenceAsset[],
  referenceAssetIds: string[],
): ImageReferenceAsset[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const manualSelection = [...new Set(referenceAssetIds)]
    .flatMap((assetId) => {
      const asset = byId.get(assetId);
      return asset ? [asset] : [];
    })
    .slice(0, MAX_VIDEO_REFERENCE_IMAGES);
  if (manualSelection.length) return manualSelection;

  return [...assets]
    .sort(
      (left, right) =>
        VIDEO_REFERENCE_ROLE_PRIORITY[left.role] -
        VIDEO_REFERENCE_ROLE_PRIORITY[right.role],
    )
    .slice(0, MAX_VIDEO_REFERENCE_IMAGES);
}

async function prepareVideoReferences(
  assets: ImageReferenceAsset[],
): Promise<string[]> {
  const results = await Promise.allSettled(assets.map(compactVideoReference));
  return results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

function getSceneRetryAdvice(errorMessage: string): string {
  const message = errorMessage.toLowerCase();
  if (
    message.includes("input_image_privacy") ||
    message.includes("real person") ||
    (message.includes("실제 인물") && message.includes("감지"))
  ) {
    return "원본 사진은 그대로 유지됩니다. 이 장면만 사진 없이 시안을 만들거나 실제 인물이 없는 참조 사진으로 교체해 주세요.";
  }
  if (message.includes("reference") || message.includes("image")) {
    return "참조 사진을 1장만 선택하거나, 시작 프레임을 새로 생성한 뒤 다시 시도해 보세요.";
  }
  if (message.includes("duration") || message.includes("length")) {
    return "길이를 5초 또는 8초로 바꾼 뒤 다시 시도해 보세요. 모델마다 지원 길이가 다를 수 있습니다.";
  }
  if (
    message.includes("audio") ||
    message.includes("오디오") ||
    message.includes("립싱크")
  ) {
    return "대사 길이와 얼굴 구도를 확인한 뒤 다시 시도해 보세요. 현장음만 필요하면 오디오 방식을 “현장음”으로 바꿀 수 있습니다.";
  }
  if (
    message.includes("rate") ||
    message.includes("429") ||
    message.includes("limit")
  ) {
    return "잠시 후 다시 시도해 보세요. 반복되면 시안 모드와 짧은 길이부터 확인하는 것이 좋습니다.";
  }
  return "시안 모드에서 5~8초로 먼저 확인한 뒤, 참조 사진·도착 프레임·오디오를 하나씩 추가해 보세요.";
}

function isInputImagePrivacyFailure(
  errorMessage?: string | null,
  job?: VideoStudioJob | null,
): boolean {
  const metadata = job?.metadata;
  if (
    metadata &&
    typeof metadata === "object" &&
    metadata.failureReasonCode === "input_image_privacy"
  ) {
    return true;
  }
  const message = errorMessage?.toLowerCase() || "";
  return (
    message.includes("inputimagesensitivecontentdetected.privacyinformation") ||
    message.includes("may contain real person") ||
    (message.includes("실제 인물") && message.includes("감지"))
  );
}

function videoResolution(
  mode: StoryboardVideoQualityMode,
): VideoStudioResolution {
  return mode === "proof" ? "480p" : "1080p";
}

function effectiveSceneDuration(scene: ImageStoryboardScene): number {
  if (resolveStoryboardVideoAudioMode(scene.video) !== "dialogue") {
    return scene.video.durationSeconds;
  }
  const timing = analyzeStoryboardDialogueTiming(
    scene.dialogueOrCaption,
    scene.video.durationSeconds,
  );
  return timing.tone === "over" && timing.fitsSupportedDuration
    ? timing.recommendedDurationSeconds
    : scene.video.durationSeconds;
}

type VideoEstimateProfile = {
  key: string;
  duration: number;
  audioMode: StoryboardVideoAudioMode;
  hasReferenceImage: boolean;
  hasEndReferenceImage: boolean;
  hasVisualReferenceImages: boolean;
  sceneCount: number;
};

function videoEstimateProfileKey(
  params: Omit<VideoEstimateProfile, "key" | "sceneCount">,
): string {
  return [
    params.duration,
    params.audioMode,
    params.hasReferenceImage ? "frame" : "text",
    params.hasEndReferenceImage ? "end-frame" : "no-end-frame",
    params.hasVisualReferenceImages ? "references" : "no-references",
  ].join("|");
}

type SceneQualityReadiness = {
  score: number;
  tone: "ready" | "progress" | "needs";
  label: string;
  note: string;
};

function getSceneQualityReadiness(
  storyboard: ImageStoryboard,
  scene: ImageStoryboardScene,
  nextScene?: ImageStoryboardScene,
  visualReferenceCount = 0,
): SceneQualityReadiness {
  const hasStartFrame = Boolean(
    scene.generatedImage?.url || scene.video.lastFrameUrl,
  );
  const hasMotionPlan = Boolean(
    scene.video.motionPrompt.trim() ||
    scene.narrativeBeat.trim() ||
    scene.cameraDirection.trim(),
  );
  const hasContinuity = Boolean(
    scene.continuityAnchor.trim() ||
    storyboard.characterContinuity.trim() ||
    storyboard.settingContinuity.trim() ||
    storyboard.colorAndLighting.trim(),
  );
  const usesEndFrame = Boolean(
    nextScene &&
    scene.video.useNextSceneAsEndFrame &&
    nextScene.generatedImage?.url,
  );
  const hasPracticalDuration =
    scene.video.durationSeconds >= 3 && scene.video.durationSeconds <= 10;
  const endConditionReady = nextScene
    ? usesEndFrame
    : Boolean(scene.transition.trim() || scene.cameraDirection.trim());
  const audioMode = resolveStoryboardVideoAudioMode(scene.video);
  const dialogueTiming = analyzeStoryboardDialogueTiming(
    scene.dialogueOrCaption,
    scene.video.durationSeconds,
  );
  const dialogueText = scene.dialogueOrCaption.trim();
  const hasDialogue = Boolean(dialogueText);
  const likelySpokenDialogue =
    hasDialogue &&
    (/["“”'‘’]/.test(dialogueText) ||
      /(대사|말한다|내레이션|나레이션|voice|narration|lip.?sync|립싱크)/i.test(
        dialogueText,
      ));
  const audioReady = likelySpokenDialogue
    ? audioMode === "dialogue" && dialogueTiming.tone !== "over"
    : audioMode !== "dialogue" ||
      (hasDialogue && dialogueTiming.tone !== "over");
  const score = Math.max(
    0,
    Math.min(
      100,
      (hasStartFrame ? 25 : 0) +
        (hasMotionPlan ? 15 : 0) +
        (hasContinuity ? 15 : 0) +
        (visualReferenceCount > 0 ? 15 : 0) +
        (endConditionReady ? 15 : 0) +
        (hasPracticalDuration ? 10 : 0) +
        (audioReady ? 5 : 0),
    ),
  );
  const missing = [
    !hasStartFrame ? "시작 키프레임" : "",
    !hasMotionPlan ? "움직임 지시" : "",
    !hasContinuity ? "일관성 기준" : "",
    visualReferenceCount === 0 ? "공통 참조 사진" : "",
    nextScene && !usesEndFrame ? "다음 장면 연결" : "",
    likelySpokenDialogue && audioMode !== "dialogue" ? "대사 오디오 설정" : "",
    audioMode === "dialogue" && !hasDialogue ? "립싱크 대사" : "",
    audioMode === "dialogue" && hasDialogue && dialogueTiming.tone === "over"
      ? dialogueTiming.fitsSupportedDuration
        ? `${dialogueTiming.recommendedDurationSeconds}초 대사 길이`
        : "대사 분할"
      : "",
  ].filter(Boolean);

  if (score >= 85 && audioReady) {
    return {
      score,
      tone: "ready",
      label: "제작 준비",
      note: nextScene
        ? "시작·도착 키프레임과 연출 기준이 연결됩니다."
        : "시작 키프레임과 엔딩 구도가 준비되었습니다.",
    };
  }
  if (score >= 60) {
    return {
      score,
      tone: "progress",
      label: "보완 권장",
      note: missing.length
        ? `${missing.join(" · ")}을 보완하면 결과가 더 안정적입니다.`
        : "세부 움직임을 다듬으면 결과가 더 안정적입니다.",
    };
  }
  return {
    score,
    tone: "needs",
    label: "기획 보완 필요",
    note: missing.length
      ? `${missing.join(" · ")}을 먼저 준비해 주세요.`
      : "장면 기준을 보강해 주세요.",
  };
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "가격 확인 중";
  return value < 0.01
    ? USD_MICRO_FORMATTER.format(value)
    : USD_STANDARD_FORMATTER.format(value);
}

function renderResult(job: VideoStudioJob): {
  modelUsed: string | null;
  costUsd: number | null;
  visualReferencesApplied: number;
  firstFrameApplied: boolean;
  endFrameApplied: boolean;
  audioApplied: boolean;
} {
  const metadata = job.metadata;
  const value =
    metadata && typeof metadata === "object" && "renderResult" in metadata
      ? metadata.renderResult
      : null;
  const providerVideo =
    metadata && typeof metadata === "object" && "providerVideo" in metadata
      ? metadata.providerVideo
      : null;
  if (!value || typeof value !== "object") {
    const checkpoint =
      providerVideo && typeof providerVideo === "object"
        ? (providerVideo as Record<string, unknown>)
        : null;
    return {
      modelUsed:
        typeof checkpoint?.modelId === "string" ? checkpoint.modelId : null,
      costUsd: null,
      visualReferencesApplied:
        typeof checkpoint?.visualReferencesApplied === "number"
          ? Math.max(0, Math.floor(checkpoint.visualReferencesApplied))
          : 0,
      firstFrameApplied: checkpoint?.firstFrameApplied === true,
      endFrameApplied: checkpoint?.endFrameApplied === true,
      audioApplied: checkpoint?.audioApplied === true,
    };
  }
  const result = value as Record<string, unknown>;
  return {
    modelUsed: typeof result.modelUsed === "string" ? result.modelUsed : null,
    costUsd:
      typeof result.costUsd === "number" && Number.isFinite(result.costUsd)
        ? result.costUsd
        : null,
    visualReferencesApplied:
      typeof result.visualReferencesApplied === "number"
        ? Math.max(
            0,
            Math.min(
              MAX_VIDEO_REFERENCE_IMAGES,
              Math.floor(result.visualReferencesApplied),
            ),
          )
        : 0,
    firstFrameApplied: result.firstFrameApplied === true,
    endFrameApplied: result.endFrameApplied === true,
    audioApplied: result.audioApplied === true,
  };
}

function hasVerifiedAudibleAudio(job?: VideoStudioJob): boolean {
  const metadata = job?.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  const inspection = metadata.audioInspection;
  return Boolean(
    inspection &&
    typeof inspection === "object" &&
    (inspection as Record<string, unknown>).hasAudibleAudio === true,
  );
}

function sceneStatusFromJob(
  job: VideoStudioJob,
  current: StoryboardVideoSceneStatus,
  now: number,
): StoryboardVideoSceneStatus {
  if (stalledJobMessage(job, now)) return "failed";
  if (job.status === "queued") return "queued";
  if (job.status === "running" || job.status === "uploading")
    return "rendering";
  if (job.status === "completed")
    return current === "approved" ? "approved" : "review";
  if (job.status === "failed" || job.status === "canceled") return "failed";
  return current;
}

const VIDEO_JOB_QUEUE_STALL_MS = 2 * 60 * 1000;
const VIDEO_PROVIDER_RESUME_QUEUE_STALL_MS = 10 * 60 * 1000;
const VIDEO_JOB_PROCESSING_STALL_MS = 12 * 60 * 1000;
const VIDEO_JOB_VISIBILITY_STALL_MS = 45 * 1000;

function timestampMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    toMillis?: () => number;
    seconds?: number;
  };
  if (typeof candidate.toMillis === "function") {
    const millis = candidate.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  return typeof candidate.seconds === "number" &&
    Number.isFinite(candidate.seconds)
    ? candidate.seconds * 1000
    : null;
}

function hasProviderVideoResumeCheckpoint(job: VideoStudioJob): boolean {
  if (!job.metadata || typeof job.metadata !== "object") return false;
  const providerVideo = job.metadata.providerVideo;
  if (!providerVideo || typeof providerVideo !== "object") return false;
  const checkpoint = providerVideo as { jobId?: unknown; status?: unknown };
  return (
    typeof checkpoint.jobId === "string" &&
    checkpoint.jobId.length > 0 &&
    (checkpoint.status === "pending" || checkpoint.status === "in_progress")
  );
}

function stalledJobMessage(job: VideoStudioJob, now: number): string | null {
  if (
    job.status !== "queued" &&
    job.status !== "running" &&
    job.status !== "uploading"
  )
    return null;
  const lastActivity =
    timestampMillis(job.updatedAt) ?? timestampMillis(job.createdAt);
  if (lastActivity === null) return null;
  const waitingForProviderResume =
    job.status === "queued" && hasProviderVideoResumeCheckpoint(job);
  const stallThreshold =
    job.status === "queued"
      ? waitingForProviderResume
        ? VIDEO_PROVIDER_RESUME_QUEUE_STALL_MS
        : VIDEO_JOB_QUEUE_STALL_MS
      : VIDEO_JOB_PROCESSING_STALL_MS;
  if (now - lastActivity <= stallThreshold) return null;
  return job.status === "queued"
    ? waitingForProviderResume
      ? "OpenRouter 영상 결과를 다시 확인할 작업이 시작되지 않았습니다. 복구를 눌러 같은 생성 작업을 이어서 시도해 주세요."
      : "영상 처리 서버가 작업을 시작하지 못했습니다. 복구를 눌러 작업 대기열을 다시 전송해 주세요."
    : "영상 처리 시간이 제한을 초과했습니다. 실패한 작업으로 정리했으니 다시 시도해 주세요.";
}

function sameVideoScene(
  left: StoryboardVideoScene,
  right: StoryboardVideoScene,
): boolean {
  return (
    left.status === right.status &&
    left.jobId === right.jobId &&
    left.clipId === right.clipId &&
    left.videoUrl === right.videoUrl &&
    left.lastFrameUrl === right.lastFrameUrl &&
    left.artifactId === right.artifactId &&
    left.replacedClipId === right.replacedClipId &&
    left.modelUsed === right.modelUsed &&
    left.costUsd === right.costUsd &&
    left.visualReferencesApplied === right.visualReferencesApplied &&
    left.firstFrameApplied === right.firstFrameApplied &&
    left.endFrameApplied === right.endFrameApplied &&
    left.audioApplied === right.audioApplied &&
    left.errorMessage === right.errorMessage
  );
}

export default function StoryboardVideoProductionPanel({
  storyboardId,
  storyboard,
  referenceAssets,
  activeSceneId,
  onActiveSceneChange,
  onDuplicateScene,
  disabled = false,
  onChange,
}: StoryboardVideoProductionPanelProps) {
  const { currentUser } = useAuth();
  const [queueingSceneId, setQueueingSceneId] = useState<string | null>(null);
  const [isPreparingProject, setIsPreparingProject] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isRecoveringAutomation, setIsRecoveringAutomation] = useState(false);
  const [estimate, setEstimate] = useState<VideoStudioEstimate | null>(null);
  const [estimatesByProfile, setEstimatesByProfile] = useState(
    () => new Map<string, VideoStudioEstimate>(),
  );
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [jobStatusClock, setJobStatusClock] = useState(() => Date.now());
  const [isUploadingBgm, setIsUploadingBgm] = useState(false);
  const [downloadingAssetUrl, setDownloadingAssetUrl] = useState<string | null>(
    null,
  );
  const automationActionKeysRef = useRef(new Set<string>());
  const automationRetryCountsByJobRef = useRef(new Map<string, number>());
  const clipCleanupInFlightRef = useRef(new Set<string>());
  const relevantJobIds = useMemo(
    () => [
      ...new Set([
        ...storyboard.scenes.flatMap((scene) =>
          scene.video.jobId ? [scene.video.jobId] : [],
        ),
        ...(storyboard.videoProduction.finalJobId
          ? [storyboard.videoProduction.finalJobId]
          : []),
      ]),
    ],
    [storyboard.scenes, storyboard.videoProduction.finalJobId],
  );
  const {
    jobs,
    isReady: jobSubscriptionReady,
    error: jobSubscriptionError,
  } = useStoryboardVideoJobs(relevantJobIds, Boolean(currentUser));

  const handleDownloadAsset = useCallback(
    async (url: string, fileName: string, label: string) => {
      if (downloadingAssetUrl) return;

      setDownloadingAssetUrl(url);
      try {
        await downloadRemoteMedia(url, fileName);
        toast.success(`${label}을(를) 다운로드했습니다.`);
      } catch (error) {
        console.warn("[StoryboardVideo] media download fallback", error);
        openRemoteMedia(url);
        toast.info(
          `자동 다운로드가 제한되어 ${label} 원본을 새 창에서 열었습니다.`,
        );
      } finally {
        setDownloadingAssetUrl(null);
      }
    },
    [downloadingAssetUrl],
  );

  const configuredDuration = useMemo(
    () =>
      storyboard.scenes.reduce(
        (sum, scene) => sum + scene.video.durationSeconds,
        0,
      ),
    [storyboard.scenes],
  );
  const totalDuration = useMemo(
    () =>
      storyboard.scenes.reduce(
        (sum, scene) => sum + effectiveSceneDuration(scene),
        0,
      ),
    [storyboard.scenes],
  );
  const editedTotalDuration = useMemo(
    () =>
      Number(
        storyboard.scenes
          .reduce((sum, scene) => {
            const sourceDuration = effectiveSceneDuration(scene);
            const trimmed = Math.max(
              0.1,
              sourceDuration -
                scene.video.trimStartSeconds -
                scene.video.trimEndSeconds,
            );
            return sum + trimmed / scene.video.playbackRate;
          }, 0)
          .toFixed(1),
      ),
    [storyboard.scenes],
  );
  const dialogueAdjustedSceneCount = useMemo(
    () =>
      storyboard.scenes.filter(
        (scene) => effectiveSceneDuration(scene) > scene.video.durationSeconds,
      ).length,
    [storyboard.scenes],
  );
  const dialogueSceneCount = useMemo(
    () =>
      storyboard.scenes.filter(
        (scene) => resolveStoryboardVideoAudioMode(scene.video) === "dialogue",
      ).length,
    [storyboard.scenes],
  );
  const audioMixLabel =
    storyboard.videoProduction.audioMixPreset === "custom"
      ? "직접 조절"
      : (AUDIO_MIX_OPTIONS.find(
          (item) => item.value === storyboard.videoProduction.audioMixPreset,
        )?.label ?? "균형");
  const sceneCount = storyboard.scenes.length;
  const canDuplicateScene = sceneCount < 48;
  const reusableSceneIds = useMemo(
    () => new Set(getReusableStoryboardSceneIds(storyboard.scenes)),
    [storyboard.scenes],
  );
  const pendingSceneCount = Math.max(0, sceneCount - reusableSceneIds.size);
  const estimateAudioMode = useMemo<StoryboardVideoAudioMode>(() => {
    if (
      storyboard.scenes.some(
        (scene) => resolveStoryboardVideoAudioMode(scene.video) === "dialogue",
      )
    ) {
      return "dialogue";
    }
    if (
      storyboard.scenes.some(
        (scene) => resolveStoryboardVideoAudioMode(scene.video) === "ambient",
      )
    ) {
      return "ambient";
    }
    return "silent";
  }, [storyboard.scenes]);
  const estimateProfiles = useMemo<VideoEstimateProfile[]>(() => {
    const profiles = new Map<string, VideoEstimateProfile>();
    storyboard.scenes.forEach((scene, index) => {
      if (reusableSceneIds.has(scene.id)) return;
      const previousScene = storyboard.scenes[index - 1];
      const nextScene = storyboard.scenes[index + 1];
      const profile = {
        duration: effectiveSceneDuration(scene),
        audioMode: resolveStoryboardVideoAudioMode(scene.video),
        hasReferenceImage: Boolean(
          scene.generatedImage?.url ||
          scene.video.lastFrameUrl ||
          previousScene?.video.lastFrameUrl,
        ),
        hasEndReferenceImage: Boolean(
          nextScene &&
          scene.video.useNextSceneAsEndFrame &&
          nextScene.generatedImage?.url,
        ),
        hasVisualReferenceImages:
          selectVideoReferenceAssets(
            referenceAssets,
            scene.video.referenceAssetIds,
          ).length > 0,
      };
      const key = videoEstimateProfileKey(profile);
      const current = profiles.get(key);
      profiles.set(key, {
        ...profile,
        key,
        sceneCount: (current?.sceneCount || 0) + 1,
      });
    });
    return [...profiles.values()];
  }, [referenceAssets, reusableSceneIds, storyboard.scenes]);
  const manualReferenceSceneCount = useMemo(
    () =>
      storyboard.scenes.filter((scene) =>
        scene.video.referenceAssetIds.some((assetId) =>
          referenceAssets.some((asset) => asset.id === assetId),
        ),
      ).length,
    [referenceAssets, storyboard.scenes],
  );
  const readySceneCount = reusableSceneIds.size;
  const actualCost = useMemo(
    () =>
      storyboard.scenes.reduce(
        (sum, scene) => sum + (scene.video.costUsd || 0),
        0,
      ),
    [storyboard.scenes],
  );
  const projectedCost = useMemo(() => {
    if (pendingSceneCount === 0) return 0;
    if (!estimateProfiles.length) return null;
    let total = 0;
    for (const profile of estimateProfiles) {
      const profileEstimate = estimatesByProfile.get(profile.key);
      if (
        profileEstimate?.estimatedCostUsd === null ||
        profileEstimate?.estimatedCostUsd === undefined
      ) {
        return null;
      }
      total += profileEstimate.estimatedCostUsd * profile.sceneCount;
    }
    return Number(total.toFixed(6));
  }, [estimateProfiles, estimatesByProfile, pendingSceneCount]);
  const pricingCheckPending =
    pendingSceneCount > 0 &&
    !estimateError &&
    estimatesByProfile.size < estimateProfiles.length;
  const hasUnknownProfilePricing =
    pendingSceneCount > 0 && !pricingCheckPending && projectedCost === null;
  const maxBudgetUsd = storyboard.videoProduction.maxBudgetUsd;
  const budgetExceeded =
    projectedCost !== null &&
    maxBudgetUsd !== null &&
    projectedCost > maxBudgetUsd;
  const unknownPricingBlocked =
    hasUnknownProfilePricing && !storyboard.videoProduction.allowUnknownPricing;
  const resolution = videoResolution(storyboard.videoProduction.qualityMode);
  const automationStatus = storyboard.videoProduction.automationStatus;
  const automationActive = AUTOMATION_ACTIVE_STATUSES.has(automationStatus);
  const finalMergeInFlight =
    isFinalizing ||
    storyboard.videoProduction.finalStatus === "queued" ||
    storyboard.videoProduction.finalStatus === "rendering";
  const projectBusy =
    disabled ||
    isPreparingProject ||
    Boolean(queueingSceneId) ||
    isFinalizing ||
    isRecoveringAutomation ||
    automationActive;
  const qualityReadiness = useMemo(() => {
    const scenes = storyboard.scenes.map((scene, index) => ({
      scene,
      readiness: getSceneQualityReadiness(
        storyboard,
        scene,
        storyboard.scenes[index + 1],
        selectVideoReferenceAssets(
          referenceAssets,
          scene.video.referenceAssetIds,
        ).length,
      ),
    }));
    const score = scenes.length
      ? Math.round(
          scenes.reduce((sum, item) => sum + item.readiness.score, 0) /
            scenes.length,
        )
      : 0;
    const startFrameCount = scenes.filter(({ scene }) =>
      Boolean(scene.generatedImage?.url || scene.video.lastFrameUrl),
    ).length;
    const continuityCount = scenes.filter(({ scene }) =>
      Boolean(
        scene.continuityAnchor.trim() ||
        storyboard.characterContinuity.trim() ||
        storyboard.settingContinuity.trim() ||
        storyboard.colorAndLighting.trim(),
      ),
    ).length;
    const transitionReadyCount = storyboard.scenes
      .slice(0, -1)
      .filter((scene, index) =>
        Boolean(
          scene.video.useNextSceneAsEndFrame &&
          storyboard.scenes[index + 1]?.generatedImage?.url,
        ),
      ).length;
    const audioReadyCount = scenes.filter(({ scene }) => {
      if (resolveStoryboardVideoAudioMode(scene.video) !== "dialogue")
        return true;
      const dialogueTiming = analyzeStoryboardDialogueTiming(
        scene.dialogueOrCaption,
        scene.video.durationSeconds,
      );
      return (
        Boolean(scene.dialogueOrCaption.trim()) &&
        dialogueTiming.tone !== "over"
      );
    }).length;
    return {
      score,
      readyCount: scenes.filter(({ readiness }) => readiness.tone === "ready")
        .length,
      needsAttention: scenes.filter(
        ({ readiness }) => readiness.tone === "needs",
      ).length,
      startFrameCount,
      continuityCount,
      transitionReadyCount,
      transitionCount: Math.max(0, storyboard.scenes.length - 1),
      audioReadyCount,
      actionItems: scenes
        .filter(({ readiness }) => readiness.tone !== "ready")
        .sort((left, right) => left.readiness.score - right.readiness.score)
        .slice(0, 3),
    };
  }, [referenceAssets, storyboard]);
  const nextQualityAction = qualityReadiness.actionItems[0];
  const hasFinalDelivery = Boolean(storyboard.videoProduction.finalVideoUrl);
  const isFinalDeliveryCurrent = isStoryboardFinalCurrent(storyboard);

  useEffect(() => {
    if (!currentUser || !sceneCount) return undefined;
    setEstimate(null);
    setEstimatesByProfile(new Map());
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const authToken = await currentUser.getIdToken();
          const nextEstimates = await Promise.all(
            estimateProfiles.map(async (profile) => ({
              profile,
              estimate: await videoStudioService.getVideoEstimate({
                authToken,
                duration: Math.min(15, Math.max(1, profile.duration)),
                resolution,
                aspectRatio: storyboard.aspectRatio as VideoStudioAspectRatio,
                qualityMode: storyboard.videoProduction.qualityMode,
                hasReferenceImage: profile.hasReferenceImage,
                hasEndReferenceImage: profile.hasEndReferenceImage,
                hasVisualReferenceImages: profile.hasVisualReferenceImages,
                audioMode: profile.audioMode,
                signal: controller.signal,
              }),
            })),
          );
          if (controller.signal.aborted) return;
          setEstimatesByProfile(
            new Map(
              nextEstimates.map(({ profile, estimate: nextEstimate }) => [
                profile.key,
                nextEstimate,
              ]),
            ),
          );
          setEstimate(
            nextEstimates.find(
              ({ profile }) => profile.audioMode === estimateAudioMode,
            )?.estimate ||
              nextEstimates[0]?.estimate ||
              null,
          );
          setEstimateError(null);
        } catch (error) {
          if (controller.signal.aborted) return;
          setEstimate(null);
          setEstimatesByProfile(new Map());
          setEstimateError(
            error instanceof Error
              ? error.message
              : "예상 비용을 확인하지 못했습니다.",
          );
        }
      })();
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    currentUser,
    estimateAudioMode,
    estimateProfiles,
    resolution,
    sceneCount,
    storyboard.aspectRatio,
    storyboard.videoProduction.qualityMode,
  ]);

  const jobsById = useMemo(
    () => new Map(jobs.map((job) => [job.id, job])),
    [jobs],
  );

  const hasActiveVideoJob = useMemo(
    () =>
      jobs.some(
        (job) =>
          job.status === "queued" ||
          job.status === "running" ||
          job.status === "uploading",
      ),
    [jobs],
  );

  useEffect(() => {
    if (!hasActiveVideoJob && !automationActive && !finalMergeInFlight)
      return undefined;
    setJobStatusClock(Date.now());
    const timer = window.setInterval(
      () => setJobStatusClock(Date.now()),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, [automationActive, finalMergeInFlight, hasActiveVideoJob]);

  useEffect(() => {
    if (!relevantJobIds.some((jobId) => jobsById.has(jobId))) return;

    onChange((current) => {
      let changed = false;
      const scenes = current.scenes.map((scene) => {
        if (!scene.video.jobId) return scene;
        const job = jobsById.get(scene.video.jobId);
        if (!job) return scene;
        const result = renderResult(job);
        const stalledError = stalledJobMessage(job, jobStatusClock);
        const nextVideo: StoryboardVideoScene = {
          ...scene.video,
          status: sceneStatusFromJob(job, scene.video.status, jobStatusClock),
          clipId: job.clipId || scene.video.clipId,
          videoUrl: job.resultVideoUrl || scene.video.videoUrl,
          lastFrameUrl: job.resultFrameUrl || scene.video.lastFrameUrl,
          artifactId: job.clipId || scene.video.artifactId,
          replacedClipId:
            job.status === "completed" &&
            job.clipId &&
            scene.video.clipId &&
            job.clipId !== scene.video.clipId
              ? scene.video.clipId
              : scene.video.replacedClipId,
          modelUsed: result.modelUsed || scene.video.modelUsed,
          costUsd: result.costUsd ?? scene.video.costUsd,
          visualReferencesApplied: result.visualReferencesApplied,
          firstFrameApplied: result.firstFrameApplied,
          endFrameApplied: result.endFrameApplied,
          audioApplied: result.audioApplied,
          errorMessage:
            stalledError ||
            (job.status === "failed" || job.status === "canceled"
              ? job.errorMessage ||
                job.message ||
                "영상 생성 작업을 완료하지 못했습니다."
              : null),
        };
        if (sameVideoScene(scene.video, nextVideo)) return scene;
        changed = true;
        return { ...scene, video: nextVideo };
      });

      let videoProduction = current.videoProduction;
      const finalJobId = current.videoProduction.finalJobId;
      const finalJob = finalJobId ? jobsById.get(finalJobId) : undefined;
      if (finalJob) {
        const stalledError = stalledJobMessage(finalJob, jobStatusClock);
        const completedOutputMissing =
          finalJob.status === "completed" &&
          (!finalJob.clipId || !finalJob.resultVideoUrl);
        const finalStatus = stalledError
          ? ("failed" as const)
          : completedOutputMissing
            ? ("failed" as const)
            : finalJob.status === "completed"
              ? ("completed" as const)
              : finalJob.status === "failed" || finalJob.status === "canceled"
                ? ("failed" as const)
                : finalJob.status === "queued"
                  ? ("queued" as const)
                  : ("rendering" as const);
        const nextProduction = {
          ...videoProduction,
          finalStatus,
          finalClipId: finalJob.clipId || videoProduction.finalClipId,
          finalVideoUrl:
            finalJob.resultVideoUrl || videoProduction.finalVideoUrl,
          finalArtifactId:
            finalJob.clipId || videoProduction.finalArtifactId,
          finalAssemblyManifest:
            finalStatus === "completed" &&
            videoProduction.pendingAssemblyManifest
              ? videoProduction.pendingAssemblyManifest
              : videoProduction.finalAssemblyManifest,
          pendingAssemblyManifest:
            finalStatus === "completed"
              ? null
              : videoProduction.pendingAssemblyManifest,
          finalFreshness:
            finalStatus === "completed" &&
            videoProduction.pendingAssemblyManifest
              ? videoProduction.pendingAssemblyManifest.fingerprint ===
                buildStoryboardAssemblyFingerprint(current)
                ? ("current" as const)
                : ("stale" as const)
              : videoProduction.finalFreshness,
          lastSuccessfulFinalVideoUrl:
            finalStatus === "completed"
              ? finalJob.resultVideoUrl ||
                videoProduction.finalVideoUrl ||
                videoProduction.lastSuccessfulFinalVideoUrl
              : videoProduction.lastSuccessfulFinalVideoUrl,
          replacedFinalClipId:
            finalStatus === "completed" &&
            finalJob.clipId &&
            videoProduction.finalClipId &&
            finalJob.clipId !== videoProduction.finalClipId
              ? videoProduction.finalClipId
              : videoProduction.replacedFinalClipId,
          finalErrorMessage:
            finalStatus === "failed"
              ? stalledError ||
                (completedOutputMissing
                  ? "최종 병합 작업에 재생 가능한 영상 결과가 없습니다."
                  : null) ||
                finalJob.errorMessage ||
                finalJob.message ||
                "최종 영상을 완성하지 못했습니다."
              : null,
        };
        if (
          nextProduction.finalStatus !== videoProduction.finalStatus ||
          nextProduction.finalClipId !== videoProduction.finalClipId ||
          nextProduction.finalVideoUrl !== videoProduction.finalVideoUrl ||
          nextProduction.finalFreshness !== videoProduction.finalFreshness ||
          nextProduction.pendingAssemblyManifest !==
            videoProduction.pendingAssemblyManifest ||
          nextProduction.finalErrorMessage !== videoProduction.finalErrorMessage
        ) {
          changed = true;
          videoProduction = nextProduction;
        }
      }
      return changed ? { ...current, scenes, videoProduction } : current;
    });
  }, [jobsById, jobStatusClock, onChange, relevantJobIds]);

  useEffect(() => {
    if (!currentUser) return;
    const cleanupTargets = storyboard.scenes.filter(
      (scene) =>
        scene.video.status === "approved" &&
        scene.video.replacedClipId &&
        !clipCleanupInFlightRef.current.has(scene.video.replacedClipId),
    );
    cleanupTargets.forEach((scene) => {
      const replacedClipId = scene.video.replacedClipId;
      if (!replacedClipId) return;
      clipCleanupInFlightRef.current.add(replacedClipId);
      void (async () => {
        try {
          const authToken = await currentUser.getIdToken();
          await videoStudioService.deleteClip({
            authToken,
            clipId: replacedClipId,
          });
          onChange((current) => ({
            ...current,
            scenes: current.scenes.map((item) =>
              item.id === scene.id &&
              item.video.replacedClipId === replacedClipId
                ? {
                    ...item,
                    video: { ...item.video, replacedClipId: null },
                  }
                : item,
            ),
          }));
        } catch (error) {
          console.error("[StoryboardVideo] replaced clip cleanup failed:", error);
          onChange((current) => ({
            ...current,
            cleanupStatus: "retry",
            cleanupErrorMessage:
              "교체된 장면 영상 파일 정리가 필요합니다. 파일 관리에서 다시 시도해 주세요.",
          }));
        } finally {
          clipCleanupInFlightRef.current.delete(replacedClipId);
        }
      })();
    });
    const replacedFinalClipId =
      storyboard.videoProduction.finalStatus === "completed"
        ? storyboard.videoProduction.replacedFinalClipId
        : null;
    if (
      replacedFinalClipId &&
      !clipCleanupInFlightRef.current.has(replacedFinalClipId)
    ) {
      clipCleanupInFlightRef.current.add(replacedFinalClipId);
      void (async () => {
        try {
          const authToken = await currentUser.getIdToken();
          await videoStudioService.deleteClip({
            authToken,
            clipId: replacedFinalClipId,
          });
          onChange((current) => ({
            ...current,
            videoProduction: {
              ...current.videoProduction,
              replacedFinalClipId:
                current.videoProduction.replacedFinalClipId ===
                replacedFinalClipId
                  ? null
                  : current.videoProduction.replacedFinalClipId,
            },
          }));
        } catch (error) {
          console.error("[StoryboardVideo] previous final cleanup failed:", error);
          onChange((current) => ({
            ...current,
            cleanupStatus: "retry",
            cleanupErrorMessage:
              "교체된 이전 완성본 파일 정리가 필요합니다. 파일 관리에서 다시 시도해 주세요.",
          }));
        } finally {
          clipCleanupInFlightRef.current.delete(replacedFinalClipId);
        }
      })();
    }
  }, [currentUser, onChange, storyboard.scenes, storyboard.videoProduction]);

  const updateSceneForVideo = useCallback(
    (
      sceneId: string,
      updateScene: (scene: ImageStoryboardScene) => ImageStoryboardScene,
    ) => {
      onChange((current) => {
        const sceneIndex = current.scenes.findIndex(
          (scene) => scene.id === sceneId,
        );
        const canPreservePausedRun = Boolean(
          current.videoProduction.automationRunId &&
          (current.videoProduction.automationStatus === "paused" ||
            current.videoProduction.automationStatus === "failed"),
        );
        return {
          ...current,
          videoProduction: canPreservePausedRun
            ? {
                ...current.videoProduction,
                automationStatus: "paused",
                automationCurrentSceneIndex:
                  sceneIndex >= 0
                    ? sceneIndex
                    : current.videoProduction.automationCurrentSceneIndex,
                automationCompletedSceneIds:
                  current.videoProduction.automationCompletedSceneIds.filter(
                    (id) => id !== sceneId,
                  ),
                automationUpdatedAt: Date.now(),
                automationErrorMessage: null,
                finalJobId: null,
                finalClipId: current.videoProduction.finalClipId,
                finalVideoUrl:
                  current.videoProduction.finalVideoUrl ||
                  current.videoProduction.lastSuccessfulFinalVideoUrl,
                finalStatus: "idle",
                finalErrorMessage: null,
                finalFreshness:
                  current.videoProduction.finalVideoUrl ||
                  current.videoProduction.lastSuccessfulFinalVideoUrl
                    ? "stale"
                    : "current",
                pendingAssemblyManifest: null,
              }
            : resetStoryboardVideoProduction(current.videoProduction),
          scenes: current.scenes.map((scene) =>
            scene.id === sceneId ? updateScene(scene) : scene,
          ),
        };
      });
    },
    [onChange],
  );

  const patchSceneVideo = useCallback(
    (sceneId: string, patch: Partial<StoryboardVideoScene>) => {
      const changesVideoDesign = [
        "motionPrompt",
        "durationSeconds",
        "motionIntensity",
        "useNextSceneAsEndFrame",
        "audioMode",
        "generateAudio",
        "trimStartSeconds",
        "trimEndSeconds",
        "playbackRate",
        "audioVolume",
        "transitionStyle",
        "transitionSeconds",
        "referenceAssetIds",
      ].some((field) => field in patch);
      updateSceneForVideo(sceneId, (scene) => ({
        ...scene,
        videoDesignRevision: changesVideoDesign
          ? scene.videoDesignRevision + 1
          : scene.videoDesignRevision,
        approvedVideoArtifactId:
          patch.status === "approved"
            ? patch.artifactId ||
              scene.video.artifactId ||
              scene.video.clipId ||
              null
            : changesVideoDesign
              ? null
              : scene.approvedVideoArtifactId,
        video: {
          ...scene.video,
          ...patch,
        },
      }));
    },
    [updateSceneForVideo],
  );

  const patchSceneDuration = useCallback(
    (sceneId: string, durationSeconds: number) => {
      updateSceneForVideo(sceneId, (scene) => ({
        ...scene,
        duration: `${durationSeconds}초`,
        video: {
          ...scene.video,
          durationSeconds,
          status: scene.video.videoUrl ? "brief" : scene.video.status,
          approvedAt: null,
        },
      }));
    },
    [updateSceneForVideo],
  );

  const patchSceneDialogue = useCallback(
    (sceneId: string, dialogueOrCaption: string) => {
      updateSceneForVideo(sceneId, (scene) => ({
        ...scene,
        dialogueOrCaption,
        video: {
          ...scene.video,
          status: scene.video.videoUrl ? "brief" : scene.video.status,
          approvedAt: null,
        },
      }));
    },
    [updateSceneForVideo],
  );

  const patchAssemblySettings = useCallback(
    (patch: Partial<ImageStoryboard["videoProduction"]>) => {
      if (projectBusy) return;
      onChange((current) => ({
        ...current,
        videoProduction: invalidateStoryboardFinalAssembly(
          current.videoProduction,
          current.scenes,
          patch,
        ),
      }));
    },
    [onChange, projectBusy],
  );

  const handleBudgetChange = useCallback(
    (maxBudgetUsd: number | null) => {
      if (projectBusy) return;
      onChange((current) => ({
        ...current,
        videoProduction: {
          ...current.videoProduction,
          maxBudgetUsd,
        },
      }));
    },
    [onChange, projectBusy],
  );

  const handleAllowUnknownPricingChange = useCallback(
    (allowUnknownPricing: boolean) => {
      if (projectBusy) return;
      onChange((current) => ({
        ...current,
        videoProduction: {
          ...current.videoProduction,
          allowUnknownPricing,
        },
      }));
    },
    [onChange, projectBusy],
  );

  const handleAudioMixPreset = useCallback(
    (preset: Exclude<StoryboardAudioMixPreset, "custom">) => {
      const option = AUDIO_MIX_OPTIONS.find((item) => item.value === preset);
      if (!option) return;
      patchAssemblySettings({
        audioMixPreset: option.value,
        backgroundMusicVolume: option.backgroundMusicVolume,
        sceneAudioVolume: option.sceneAudioVolume,
      });
    },
    [patchAssemblySettings],
  );

  const patchVoiceDirection = useCallback(
    (voiceDirection: string) => {
      if (projectBusy) return;
      onChange((current) => ({
        ...current,
        videoProduction: {
          ...current.videoProduction,
          voiceDirection,
        },
      }));
    },
    [onChange, projectBusy],
  );

  const handleBackgroundMusicFile = useCallback(
    async (file: File) => {
      if (!currentUser?.uid || !storyboardId || projectBusy) return;
      setIsUploadingBgm(true);
      try {
        const uploaded = await imageStoryboardService.uploadBackgroundMusic(
          currentUser.uid,
          storyboardId,
          file,
        );
        onChange((current) => {
          const previousStoragePath =
            current.videoProduction.backgroundMusicStoragePath;
          const previousName =
            current.videoProduction.backgroundMusicName || "교체한 배경음악";
          return {
            ...current,
            reclaimableStorageAssets:
              previousStoragePath &&
              previousStoragePath !== uploaded.storagePath
                ? queueReclaimableBackgroundMusic(
                    current,
                    previousStoragePath,
                    previousName,
                  )
                : current.reclaimableStorageAssets,
            videoProduction: invalidateStoryboardFinalAssembly(
              current.videoProduction,
              current.scenes,
              {
                backgroundMusicUrl: uploaded.url,
                backgroundMusicName: uploaded.name,
                backgroundMusicStoragePath: uploaded.storagePath,
              },
            ),
          };
        });
        toast.success("배경음악을 프로젝트에 저장했습니다.");
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "배경음악을 저장하지 못했습니다.",
        );
      } finally {
        setIsUploadingBgm(false);
      }
    },
    [currentUser?.uid, onChange, projectBusy, storyboardId],
  );

  const handleRemoveBackgroundMusic = useCallback(() => {
    if (projectBusy || !storyboard.videoProduction.backgroundMusicUrl) return;
    const confirmed = window.confirm(
      "현재 배경음악을 완성본에서 뺄까요?\n업로드한 원본 파일은 안전을 위해 보관됩니다.",
    );
    if (!confirmed) return;
    onChange((current) => {
      const previousStoragePath =
        current.videoProduction.backgroundMusicStoragePath;
      const previousName =
        current.videoProduction.backgroundMusicName || "제거한 배경음악";
      return {
        ...current,
        reclaimableStorageAssets: previousStoragePath
          ? queueReclaimableBackgroundMusic(
              current,
              previousStoragePath,
              previousName,
            )
          : current.reclaimableStorageAssets,
        videoProduction: invalidateStoryboardFinalAssembly(
          current.videoProduction,
          current.scenes,
          {
            backgroundMusicUrl: null,
            backgroundMusicName: null,
            backgroundMusicStoragePath: null,
          },
        ),
      };
    });
    toast.success("배경음악을 완성본에서 제외했습니다.");
  }, [onChange, projectBusy, storyboard.videoProduction.backgroundMusicUrl]);

  const ensureProject = useCallback(async (): Promise<string> => {
    if (!currentUser) throw new Error("로그인이 필요합니다.");
    const nextResolution = videoResolution(
      storyboard.videoProduction.qualityMode,
    );
    const currentProjectId = storyboard.videoProduction.projectId;
    if (currentProjectId) {
      await videoStudioService.updateProject(currentProjectId, {
        title: storyboard.title,
        synopsis: storyboard.logline,
        aspectRatio: storyboard.aspectRatio as VideoStudioAspectRatio,
        resolution: nextResolution,
      });
      return currentProjectId;
    }

    setIsPreparingProject(true);
    try {
      const firstFrame = storyboard.scenes.find(
        (scene) => scene.generatedImage?.url,
      )?.generatedImage?.url;
      const projectId = await videoStudioService.createProject({
        userId: currentUser.uid,
        title: storyboard.title,
        synopsis: storyboard.logline,
        aspectRatio: storyboard.aspectRatio as VideoStudioAspectRatio,
        resolution: nextResolution,
        starterImageUrl: firstFrame || null,
        starterImageSource: firstFrame ? "album" : null,
      });
      onChange((current) => ({
        ...current,
        videoProduction: {
          ...current.videoProduction,
          projectId,
        },
      }));
      return projectId;
    } finally {
      setIsPreparingProject(false);
    }
  }, [
    currentUser,
    onChange,
    storyboard.aspectRatio,
    storyboard.logline,
    storyboard.scenes,
    storyboard.title,
    storyboard.videoProduction.projectId,
    storyboard.videoProduction.qualityMode,
  ]);

  const handleQualityMode = useCallback(
    (qualityMode: StoryboardVideoQualityMode) => {
      if (projectBusy || qualityMode === storyboard.videoProduction.qualityMode)
        return;
      onChange((current) => ({
        ...current,
        videoProduction: resetStoryboardVideoProduction(
          current.videoProduction,
          { qualityMode },
        ),
      }));
    },
    [onChange, projectBusy, storyboard.videoProduction.qualityMode],
  );

  const submitSceneJob = useCallback(
    async (params: {
      scene: ImageStoryboardScene;
      automationRunId?: string;
      previousLastFrameUrl?: string | null;
      visualInputMode?: "standard" | "text-only";
    }): Promise<string> => {
      if (!currentUser) throw new Error("로그인이 필요합니다.");
      const {
        scene,
        automationRunId,
        previousLastFrameUrl,
        visualInputMode = "standard",
      } = params;
      const omitVisualInputs = visualInputMode === "text-only";
      const audioMode = resolveStoryboardVideoAudioMode(scene.video);
      if (audioMode === "dialogue" && !scene.dialogueOrCaption.trim()) {
        throw new Error(`${scene.order}번 장면의 말할 대사를 입력해 주세요.`);
      }
      const dialogueTiming = analyzeStoryboardDialogueTiming(
        scene.dialogueOrCaption,
        scene.video.durationSeconds,
      );
      if (audioMode === "dialogue" && !dialogueTiming.fitsSupportedDuration) {
        throw new Error(
          `${scene.order}번 장면의 대사가 15초 최대 길이를 넘습니다. 문장을 짧게 나눠 주세요.`,
        );
      }
      const renderDuration =
        audioMode === "dialogue" && dialogueTiming.tone === "over"
          ? dialogueTiming.recommendedDurationSeconds
          : scene.video.durationSeconds;
      const projectId = await ensureProject();
      const authToken = await currentUser.getIdToken();
      const sceneIndex = storyboard.scenes.findIndex(
        (item) => item.id === scene.id,
      );
      const nextScene =
        sceneIndex >= 0 ? storyboard.scenes[sceneIndex + 1] : undefined;
      const useNextSceneAsEndFrame = Boolean(
        scene.video.useNextSceneAsEndFrame && nextScene?.generatedImage?.url,
      );
      const selectedReferenceAssets = omitVisualInputs
        ? []
        : selectVideoReferenceAssets(
            referenceAssets,
            scene.video.referenceAssetIds,
          );
      const prompt = appendStoryboardVideoAudioDirection(
        scene.video.motionPrompt.trim() ||
          buildMotionPrompt(
            storyboard,
            scene,
            nextScene,
            useNextSceneAsEndFrame,
            selectedReferenceAssets.map(
              (asset) => IMAGE_REFERENCE_ROLE_LABELS[asset.role],
            ),
          ),
        audioMode,
        scene.dialogueOrCaption,
        renderDuration,
      );
      const preparedReferences = omitVisualInputs
        ? []
        : await prepareVideoReferences(selectedReferenceAssets);
      const continuityKeyframe = previousLastFrameUrl
        ? scene.generatedImage?.url
        : undefined;
      const visualReferenceImages = [
        ...new Set(
          [continuityKeyframe, ...preparedReferences].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      ].slice(0, MAX_VIDEO_REFERENCE_IMAGES);
      const queued = await videoStudioService.submitStudioJob({
        authToken,
        operation: "generate",
        projectId,
        clipTitle: `${String(scene.order).padStart(2, "0")} · ${scene.title}`,
        prompt,
        duration: renderDuration,
        referenceImage: omitVisualInputs
          ? undefined
          : previousLastFrameUrl ||
            scene.generatedImage?.url ||
            scene.video.lastFrameUrl ||
            undefined,
        endReferenceImage: !omitVisualInputs && useNextSceneAsEndFrame
          ? nextScene?.generatedImage?.url
          : undefined,
        visualReferenceImages: omitVisualInputs
          ? undefined
          : visualReferenceImages,
        visualInputMode,
        continuityNotes: [
          !omitVisualInputs && previousLastFrameUrl
            ? "이전 장면의 마지막 프레임을 이번 장면의 시작 프레임으로 고정"
            : "",
          scene.continuityAnchor,
          scene.transition ? `다음 장면 연결: ${scene.transition}` : "",
          !omitVisualInputs && useNextSceneAsEndFrame
            ? `도착 프레임: 다음 장면 ${nextScene?.order}의 키프레임`
            : "",
          omitVisualInputs
            ? "개인정보 제한 복구 모드: 참조 사진 없이 텍스트 장면 설계만 사용"
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        cameraNotes: scene.cameraDirection,
        subjectLock: [
          storyboard.characterContinuity,
          storyboard.settingContinuity,
          storyboard.colorAndLighting,
        ]
          .filter(Boolean)
          .join("\n"),
        qualityMode: storyboard.videoProduction.qualityMode,
        generateAudio: audioMode !== "silent",
        audioMode,
        dialogue:
          audioMode === "dialogue" ? scene.dialogueOrCaption.trim() : undefined,
        forceRealRun: true,
      });

      onChange((current) => {
        if (
          automationRunId &&
          current.videoProduction.automationRunId !== automationRunId
        ) {
          return current;
        }
        return {
          ...current,
          videoProduction: automationRunId
            ? {
                ...current.videoProduction,
                automationStatus:
                  current.videoProduction.automationStatus === "failed"
                    ? "paused"
                    : current.videoProduction.automationStatus,
                automationCurrentSceneIndex:
                  sceneIndex >= 0
                    ? sceneIndex
                    : current.videoProduction.automationCurrentSceneIndex,
                automationCompletedSceneIds:
                  current.videoProduction.automationCompletedSceneIds.filter(
                    (id) => id !== scene.id,
                  ),
                automationUpdatedAt: Date.now(),
                automationErrorMessage: null,
                finalJobId: null,
                finalClipId: current.videoProduction.finalClipId,
                finalVideoUrl:
                  current.videoProduction.finalVideoUrl ||
                  current.videoProduction.lastSuccessfulFinalVideoUrl,
                finalStatus: "idle",
                finalErrorMessage: null,
                finalFreshness:
                  current.videoProduction.finalVideoUrl ||
                  current.videoProduction.lastSuccessfulFinalVideoUrl
                    ? "stale"
                    : "current",
                pendingAssemblyManifest: null,
              }
            : resetStoryboardVideoProduction(current.videoProduction),
          scenes: current.scenes.map((item) =>
            item.id === scene.id
              ? {
                  ...item,
                  video: {
                    ...item.video,
                    durationSeconds: renderDuration,
                    status: "queued",
                    jobId: queued.jobId,
                    modelUsed: null,
                    costUsd: null,
                    errorMessage: null,
                    approvedAt: null,
                    visualReferencesApplied: 0,
                    firstFrameApplied: false,
                    endFrameApplied: false,
                    audioApplied: false,
                  },
                }
              : item,
          ),
        };
      });
      return queued.jobId;
    },
    [currentUser, ensureProject, onChange, referenceAssets, storyboard],
  );

  const handleGenerateScene = useCallback(
    async (scene: ImageStoryboardScene) => {
      if (!currentUser || projectBusy) return;
      const sceneIndex = storyboard.scenes.findIndex(
        (item) => item.id === scene.id,
      );
      const previousLastFrameUrl =
        sceneIndex > 0
          ? storyboard.scenes[sceneIndex - 1]?.video.lastFrameUrl
          : null;
      if (
        !scene.generatedImage?.url &&
        !scene.video.lastFrameUrl &&
        !previousLastFrameUrl
      ) {
        toast.error("장면의 대표 이미지를 먼저 생성해 주세요.", {
          description:
            "대표 이미지를 시작 프레임으로 사용해야 인물·제품·배경을 안정적으로 유지할 수 있습니다.",
        });
        return;
      }

      setQueueingSceneId(scene.id);
      try {
        const resumableRunId =
          storyboard.videoProduction.automationRunId &&
          (storyboard.videoProduction.automationStatus === "paused" ||
            storyboard.videoProduction.automationStatus === "failed")
            ? storyboard.videoProduction.automationRunId
            : undefined;
        await submitSceneJob({
          scene,
          automationRunId: resumableRunId,
          previousLastFrameUrl,
        });
        toast.success(`${scene.order}번 장면의 영상 시안을 시작했습니다.`, {
          description: resumableRunId
            ? "완료되면 “이어 만들기”로 다음 장면부터 계속할 수 있습니다."
            : "완료되면 검수 상태로 자동 전환됩니다.",
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "영상 작업을 시작하지 못했습니다.";
        patchSceneVideo(scene.id, { status: "failed", errorMessage: message });
        toast.error(message);
      } finally {
        setQueueingSceneId(null);
      }
    },
    [currentUser, patchSceneVideo, projectBusy, storyboard, submitSceneJob],
  );

  const handleGenerateWithoutVisualInputs = useCallback(
    async (scene: ImageStoryboardScene) => {
      if (!currentUser || projectBusy) return;
      setQueueingSceneId(scene.id);
      try {
        await submitSceneJob({
          scene,
          visualInputMode: "text-only",
        });
        toast.success(`${scene.order}번 장면을 사진 없이 다시 시작했습니다.`, {
          description:
            "장면 설계와 대사는 유지되며, 참조 사진·시작 프레임·도착 프레임만 모델에 전달하지 않습니다.",
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "사진 없는 영상 작업을 시작하지 못했습니다.";
        patchSceneVideo(scene.id, { status: "failed", errorMessage: message });
        toast.error(message);
      } finally {
        setQueueingSceneId(null);
      }
    },
    [currentUser, patchSceneVideo, projectBusy, submitSceneJob],
  );

  const handleApproval = useCallback(
    (scene: ImageStoryboardScene) => {
      if (!scene.video.videoUrl) return;
      const approved = scene.video.status !== "approved";
      patchSceneVideo(scene.id, {
        status: approved ? "approved" : "review",
        approvedAt: approved ? Date.now() : null,
        artifactId: scene.video.clipId || scene.video.artifactId,
      });
      toast.success(
        approved
          ? `${scene.order}번 장면을 승인했습니다.`
          : `${scene.order}번 장면 승인을 해제했습니다.`,
      );
    },
    [patchSceneVideo],
  );

  const submitFinalMerge = useCallback(
    async (params: {
      clipIds: string[];
      automationRunId?: string;
      preservePreviousFinal?: boolean;
    }): Promise<string> => {
      if (!currentUser) throw new Error("로그인이 필요합니다.");
      const projectId = await ensureProject();
      const authToken = await currentUser.getIdToken();
      const pendingAssemblyManifest =
        createStoryboardFinalAssemblyManifest(
          storyboard,
          params.clipIds,
          resolution,
        );
      const scenesByClipId = new Map(
        storyboard.scenes.flatMap((scene) =>
          scene.video.clipId ? [[scene.video.clipId, scene] as const] : [],
        ),
      );
      const queued = await videoStudioService.submitStudioJob({
        authToken,
        operation: "merge",
        projectId,
        clipTitle: `${storyboard.title} · 최종본`,
        prompt: `${storyboard.scenes.length}개 승인 장면을 스토리보드 순서대로 연결한 최종 영상`,
        mergeClipIds: params.clipIds,
        mergeClipEdits: params.clipIds.flatMap((clipId) => {
          const scene = scenesByClipId.get(clipId);
          return scene
            ? [
                {
                  clipId,
                  trimStartSeconds: scene.video.trimStartSeconds,
                  trimEndSeconds: scene.video.trimEndSeconds,
                  playbackRate: scene.video.playbackRate,
                  audioVolume: scene.video.audioVolume,
                  transitionStyle: scene.video.transitionStyle,
                  transitionSeconds: scene.video.transitionSeconds,
                },
              ]
            : [];
        }),
        ...(storyboard.videoProduction.backgroundMusicUrl
          ? {
              backgroundMusicUrl: storyboard.videoProduction.backgroundMusicUrl,
            }
          : {}),
        audioMixPreset: storyboard.videoProduction.audioMixPreset,
        backgroundMusicVolume: storyboard.videoProduction.backgroundMusicVolume,
        sceneAudioVolume: storyboard.videoProduction.sceneAudioVolume,
        audioCrossfadeSeconds: storyboard.videoProduction.audioCrossfadeSeconds,
        forceRealRun: true,
      });
      onChange((current) => {
        if (
          params.automationRunId &&
          current.videoProduction.automationRunId !== params.automationRunId
        ) {
          return current;
        }
        return {
          ...current,
          videoProduction: {
            ...current.videoProduction,
            automationUpdatedAt: params.automationRunId
              ? Date.now()
              : current.videoProduction.automationUpdatedAt,
            finalJobId: queued.jobId,
            // 재병합이 실패해도 직전 완성본은 내려받고 검수할 수 있어야 한다.
            finalClipId: params.preservePreviousFinal
              ? current.videoProduction.finalClipId
              : null,
            finalVideoUrl: params.preservePreviousFinal
              ? current.videoProduction.finalVideoUrl ||
                current.videoProduction.lastSuccessfulFinalVideoUrl
              : current.videoProduction.finalVideoUrl,
            finalStatus: "queued",
            finalErrorMessage: null,
            finalFreshness: current.videoProduction.finalVideoUrl
              ? "stale"
              : current.videoProduction.finalFreshness,
            pendingAssemblyManifest,
          },
        };
      });
      return queued.jobId;
    },
    [
      currentUser,
      ensureProject,
      onChange,
      resolution,
      storyboard,
    ],
  );

  const handleFinalMerge = useCallback(async () => {
    if (!currentUser || projectBusy || finalMergeInFlight) return;
    const approvedClipIds = getOrderedStoryboardClipIds(storyboard.scenes);
    if (!approvedClipIds) {
      toast.error("모든 장면의 승인 영상이 재생 가능한지 확인해 주세요.", {
        description:
          "장면 순서대로 영상 파일과 클립 정보가 모두 준비되어야 최종 병합할 수 있습니다.",
      });
      return;
    }

    setIsFinalizing(true);
    try {
      const isReMerge = Boolean(storyboard.videoProduction.finalVideoUrl);
      await submitFinalMerge({
        clipIds: approvedClipIds,
        preservePreviousFinal: isReMerge,
      });
      toast.success(
        isReMerge
          ? "스토리보드 순서대로 새 최종본을 다시 병합합니다."
          : "승인된 장면으로 최종 영상을 조립합니다.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "최종 영상 작업을 시작하지 못했습니다.";
      onChange((current) => ({
        ...current,
        videoProduction: {
          ...current.videoProduction,
          finalStatus: "failed",
          finalErrorMessage: message,
        },
      }));
      toast.error(message);
    } finally {
      setIsFinalizing(false);
    }
  }, [
    currentUser,
    finalMergeInFlight,
    onChange,
    projectBusy,
    storyboard.scenes,
    storyboard.videoProduction.finalVideoUrl,
    submitFinalMerge,
  ]);

  const handleStartAutomation = useCallback(async () => {
    if (!currentUser || automationActive || !storyboard.scenes.length) return;
    if (pricingCheckPending) {
      toast.info("예상 비용을 확인한 뒤 제작을 시작할 수 있습니다.");
      return;
    }
    if (budgetExceeded) {
      toast.error("예상 비용이 설정한 최대 예산을 초과합니다.", {
        description: "빠른 시안으로 바꾸거나 최대 예산을 조정해 주세요.",
      });
      return;
    }
    if (unknownPricingBlocked) {
      toast.error("가격을 확인할 수 없는 장면이 있습니다.", {
        description:
          "가격 미공개 모델 사용을 허용해야 제작을 시작할 수 있습니다.",
      });
      return;
    }
    const missingKeyframes = storyboard.scenes.filter(
      (scene) => !reusableSceneIds.has(scene.id) && !scene.generatedImage?.url,
    );
    if (
      !storyboard.scenes[0]?.generatedImage?.url &&
      !reusableSceneIds.has(storyboard.scenes[0]?.id || "")
    ) {
      toast.error("1번 장면의 대표 이미지를 먼저 생성해 주세요.", {
        description: "첫 장면의 키프레임이 전체 영상 일관성의 시작점이 됩니다.",
      });
      return;
    }
    if (
      storyboard.videoProduction.qualityMode === "final" &&
      (missingKeyframes.length > 0 || qualityReadiness.score < 75)
    ) {
      toast.error("최종 완성본 제작 전 키프레임과 품질 기준을 보완해 주세요.", {
        description: missingKeyframes.length
          ? `${missingKeyframes.length}개 장면의 대표 이미지가 필요합니다.`
          : "품질 준비도 75점 이상에서 최종 제작을 시작할 수 있습니다.",
      });
      return;
    }

    const runId = createAutomationRunId();
    const startedAt = Date.now();
    automationActionKeysRef.current.clear();
    automationRetryCountsByJobRef.current.clear();
    onChange((current) => ({
      ...current,
      videoProduction: {
        ...current.videoProduction,
        automationRunId: runId,
        automationStatus: "preparing",
        automationCurrentSceneIndex: 0,
        automationCompletedSceneIds: [...reusableSceneIds],
        automationRetryCount: 0,
        automationStartedAt: startedAt,
        automationUpdatedAt: startedAt,
        automationErrorMessage: null,
        finalJobId: null,
        finalClipId: current.videoProduction.finalClipId,
        finalVideoUrl:
          current.videoProduction.finalVideoUrl ||
          current.videoProduction.lastSuccessfulFinalVideoUrl,
        finalStatus: "idle",
        finalErrorMessage: null,
        finalFreshness:
          current.videoProduction.finalVideoUrl ||
          current.videoProduction.lastSuccessfulFinalVideoUrl
            ? "stale"
            : "current",
        pendingAssemblyManifest: null,
      },
    }));

    try {
      await ensureProject();
      onChange((current) => {
        if (current.videoProduction.automationRunId !== runId) return current;
        const firstPendingIndex = findNextStoryboardSceneIndex(
          current.scenes,
          reusableSceneIds,
        );
        return {
          ...current,
          scenes: current.scenes.map((scene) =>
            reusableSceneIds.has(scene.id)
              ? {
                  ...scene,
                  video: {
                    ...scene.video,
                    status: "approved",
                    approvedAt: scene.video.approvedAt || startedAt,
                  },
                }
              : {
                  ...scene,
                  video: {
                    ...scene.video,
                    status: "brief",
                    jobId: null,
                    modelUsed: null,
                    costUsd: null,
                    errorMessage: null,
                    approvedAt: null,
                    visualReferencesApplied: 0,
                    firstFrameApplied: false,
                    endFrameApplied: false,
                    audioApplied: false,
                  },
                },
          ),
          videoProduction: {
            ...current.videoProduction,
            automationStatus:
              firstPendingIndex >= current.scenes.length
                ? "merging"
                : "running",
            automationCurrentSceneIndex: firstPendingIndex,
            automationUpdatedAt: Date.now(),
          },
        };
      });
      toast.success("전체 영상 자동 제작을 시작했습니다.", {
        description:
          "장면을 순서대로 만들고, 실패 시 해당 장면만 1회 재시도한 뒤 자동 병합합니다.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "전체 영상 제작을 시작하지 못했습니다.";
      onChange((current) =>
        current.videoProduction.automationRunId === runId
          ? {
              ...current,
              videoProduction: {
                ...current.videoProduction,
                automationStatus: "failed",
                automationUpdatedAt: Date.now(),
                automationErrorMessage: message,
              },
            }
          : current,
      );
      toast.error(message);
    }
  }, [
    automationActive,
    budgetExceeded,
    currentUser,
    ensureProject,
    unknownPricingBlocked,
    onChange,
    pricingCheckPending,
    qualityReadiness.score,
    reusableSceneIds,
    storyboard.scenes,
    storyboard.videoProduction.qualityMode,
  ]);

  const handlePauseAutomation = useCallback(() => {
    if (!automationActive || automationStatus === "merging") return;
    onChange((current) => ({
      ...current,
      videoProduction: {
        ...current.videoProduction,
        automationStatus: "pausing",
        automationUpdatedAt: Date.now(),
      },
    }));
    toast.info("현재 장면이 끝나면 제작을 일시정지합니다.");
  }, [automationActive, automationStatus, onChange]);

  const handleResumeAutomation = useCallback(async () => {
    if (automationStatus !== "paused" && automationStatus !== "failed") return;
    if (
      !currentUser ||
      isRecoveringAutomation ||
      !jobSubscriptionReady ||
      jobSubscriptionError
    )
      return;

    automationActionKeysRef.current.clear();
    automationRetryCountsByJobRef.current.clear();
    const sceneIndex =
      storyboard.videoProduction.automationCurrentSceneIndex ?? 0;
    const currentScene = storyboard.scenes[sceneIndex];
    const resumeMerge = sceneIndex >= storyboard.scenes.length;
    const currentSceneJob = currentScene?.video.jobId
      ? jobsById.get(currentScene.video.jobId)
      : undefined;

    if (
      !resumeMerge &&
      currentScene &&
      currentSceneJob &&
      canReuseStoryboardVideoProviderJob(currentSceneJob)
    ) {
      setIsRecoveringAutomation(true);
      try {
        const authToken = await currentUser.getIdToken();
        await videoStudioService.updateStudioJob({
          authToken,
          jobId: currentSceneJob.id,
          action: "requeue",
        });
        onChange((current) => {
          if (
            current.videoProduction.automationRunId !==
            storyboard.videoProduction.automationRunId
          ) {
            return current;
          }
          return {
            ...current,
            scenes: current.scenes.map((scene, index) =>
              index === sceneIndex
                ? {
                    ...scene,
                    video: {
                      ...scene.video,
                      status: "queued",
                      errorMessage: null,
                    },
                  }
                : scene,
            ),
            videoProduction: {
              ...current.videoProduction,
              // The provider checkpoint is being resumed as part of the
              // whole run. Mark it running so completion advances to the
              // next storyboard scene instead of pausing after one job.
              automationStatus: "running",
              automationUpdatedAt: Date.now(),
              automationErrorMessage: null,
            },
          };
        });
        const recovery = describeStoryboardVideoRecovery({
          errorMessage: storyboard.videoProduction.automationErrorMessage,
          job: currentSceneJob,
        });
        toast.success(recovery.title, {
          description: recovery.description,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "기존 영상 작업을 복구하지 못했습니다.";
        const runId = storyboard.videoProduction.automationRunId;
        if (runId) {
          onChange((current) =>
            current.videoProduction.automationRunId === runId
              ? {
                  ...current,
                  videoProduction: {
                    ...current.videoProduction,
                    automationStatus: "failed",
                    automationUpdatedAt: Date.now(),
                    automationErrorMessage: message,
                  },
                }
              : current,
          );
        }
        toast.error("영상 복구를 시작하지 못했습니다.", {
          description: message,
        });
      } finally {
        setIsRecoveringAutomation(false);
      }
      return;
    }

    onChange((current) => {
      return {
        ...current,
        scenes:
          currentScene && currentScene.video.status === "failed"
            ? current.scenes.map((scene, index) =>
                index === sceneIndex
                  ? {
                      ...scene,
                      video: {
                        ...scene.video,
                        status: "brief",
                        jobId: null,
                        errorMessage: null,
                      },
                    }
                  : scene,
              )
            : current.scenes,
        videoProduction: {
          ...current.videoProduction,
          automationStatus: resumeMerge ? "merging" : "running",
          automationUpdatedAt: Date.now(),
          automationErrorMessage: null,
          finalJobId:
            resumeMerge && current.videoProduction.finalStatus === "failed"
              ? null
              : current.videoProduction.finalJobId,
          finalStatus:
            resumeMerge && current.videoProduction.finalStatus === "failed"
              ? "idle"
              : current.videoProduction.finalStatus,
          finalErrorMessage: null,
        },
      };
    });
    toast.success(
      resumeMerge
        ? "최종 영상 조립을 이어갑니다."
        : currentScene?.video.status === "failed"
          ? "실패 장면을 새로 제작합니다."
          : "멈춘 장면부터 제작을 이어갑니다.",
    );
  }, [
    automationStatus,
    currentUser,
    isRecoveringAutomation,
    jobSubscriptionError,
    jobSubscriptionReady,
    jobsById,
    onChange,
    storyboard.scenes,
    storyboard.videoProduction.automationCurrentSceneIndex,
    storyboard.videoProduction.automationErrorMessage,
    storyboard.videoProduction.automationRunId,
  ]);

  const failAutomation = useCallback(
    (runId: string, message: string) => {
      onChange((current) =>
        current.videoProduction.automationRunId === runId
          ? {
              ...current,
              videoProduction: {
                ...current.videoProduction,
                automationStatus: "failed",
                automationUpdatedAt: Date.now(),
                automationErrorMessage: message,
              },
            }
          : current,
      );
    },
    [onChange],
  );

  useEffect(() => {
    const production = storyboard.videoProduction;
    const runId = production.automationRunId;
    const status = production.automationStatus;
    if (!currentUser || !runId) return;
    if (status !== "running" && status !== "pausing" && status !== "merging")
      return;
    if (jobSubscriptionError) {
      failAutomation(runId, jobSubscriptionError);
      return;
    }
    if (!jobSubscriptionReady) return;

    const runAction = (key: string, action: () => Promise<void>) => {
      if (automationActionKeysRef.current.has(key)) return;
      automationActionKeysRef.current.add(key);
      void action().catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : "자동 제작 작업을 이어가지 못했습니다.";
        failAutomation(runId, message);
      });
    };

    if (status === "merging") {
      const clipIds = getOrderedStoryboardClipIds(storyboard.scenes);
      if (!clipIds) {
        failAutomation(
          runId,
          "장면 순서에 맞는 재생 가능한 승인 영상을 확인하지 못했습니다. 누락 장면부터 다시 제작해 주세요.",
        );
        return;
      }

      const finalJobId = production.finalJobId;
      if (!finalJobId) {
        runAction(`merge-submit:${runId}`, async () => {
          await submitFinalMerge({ clipIds, automationRunId: runId });
        });
        return;
      }

      const finalJob = jobsById.get(finalJobId);
      if (!finalJob) {
        const jobPublishedAt =
          production.automationUpdatedAt || production.automationStartedAt;
        if (
          jobPublishedAt &&
          jobStatusClock - jobPublishedAt > VIDEO_JOB_VISIBILITY_STALL_MS
        ) {
          failAutomation(
            runId,
            "최종 병합 작업이 대기열에서 확인되지 않습니다. 최종 조립을 다시 시작해 주세요.",
          );
        }
        return;
      }
      if (
        finalJob.status === "queued" ||
        finalJob.status === "running" ||
        finalJob.status === "uploading"
      )
        return;
      if (finalJob.status === "completed") {
        if (!finalJob.clipId || !finalJob.resultVideoUrl) {
          failAutomation(
            runId,
            "최종 병합은 끝났지만 재생 가능한 영상 파일이 없습니다. 최종 조립을 다시 시도해 주세요.",
          );
          return;
        }
        runAction(`merge-complete:${finalJobId}`, async () => {
          onChange((current) =>
            current.videoProduction.automationRunId === runId
              ? {
                  ...current,
                  videoProduction: {
                    ...current.videoProduction,
                    automationStatus: "completed",
                    automationCurrentSceneIndex: current.scenes.length,
                    automationUpdatedAt: Date.now(),
                    automationErrorMessage: null,
                    finalStatus: "completed",
                    finalClipId:
                      finalJob.clipId || current.videoProduction.finalClipId,
                    finalVideoUrl:
                      finalJob.resultVideoUrl ||
                      current.videoProduction.finalVideoUrl,
                    finalArtifactId:
                      finalJob.clipId ||
                      current.videoProduction.finalArtifactId,
                    finalAssemblyManifest:
                      current.videoProduction.pendingAssemblyManifest ||
                      current.videoProduction.finalAssemblyManifest,
                    pendingAssemblyManifest: null,
                    finalFreshness:
                      current.videoProduction.pendingAssemblyManifest
                        ?.fingerprint ===
                      buildStoryboardAssemblyFingerprint(current)
                        ? "current"
                        : "stale",
                    lastSuccessfulFinalVideoUrl:
                      finalJob.resultVideoUrl ||
                      current.videoProduction.finalVideoUrl ||
                      current.videoProduction.lastSuccessfulFinalVideoUrl,
                    replacedFinalClipId:
                      finalJob.clipId &&
                      current.videoProduction.finalClipId &&
                      finalJob.clipId !== current.videoProduction.finalClipId
                        ? current.videoProduction.finalClipId
                        : current.videoProduction.replacedFinalClipId,
                    finalErrorMessage: null,
                  },
                }
              : current,
          );
          toast.success("전체 장면과 최종 병합이 완료되었습니다.");
        });
        return;
      }

      const attemptCount = finalJob.attemptCount ?? 0;
      const automaticRetryCount =
        automationRetryCountsByJobRef.current.get(finalJobId) || 0;
      if (
        finalJob.status === "failed" &&
        attemptCount <= AUTOMATION_RETRY_LIMIT &&
        automaticRetryCount < AUTOMATION_RETRY_LIMIT
      ) {
        const retryVersion =
          timestampMillis(finalJob.updatedAt) ?? attemptCount;
        runAction(`merge-retry:${finalJobId}:${retryVersion}`, async () => {
          automationRetryCountsByJobRef.current.set(
            finalJobId,
            automaticRetryCount + 1,
          );
          const authToken = await currentUser.getIdToken();
          await videoStudioService.updateStudioJob({
            authToken,
            jobId: finalJobId,
            action: "requeue",
          });
          onChange((current) =>
            current.videoProduction.automationRunId === runId
              ? {
                  ...current,
                  videoProduction: {
                    ...current.videoProduction,
                    automationRetryCount:
                      current.videoProduction.automationRetryCount + 1,
                    automationUpdatedAt: Date.now(),
                    finalStatus: "queued",
                    finalErrorMessage: null,
                  },
                }
              : current,
          );
        });
        return;
      }

      failAutomation(
        runId,
        finalJob.errorMessage ||
          finalJob.message ||
          "장면은 완성됐지만 최종 영상 병합에 실패했습니다.",
      );
      return;
    }

    const requestedSceneIndex = production.automationCurrentSceneIndex ?? 0;
    const sceneIndex = findNextStoryboardSceneIndex(
      storyboard.scenes,
      production.automationCompletedSceneIds,
      requestedSceneIndex,
    );
    if (sceneIndex !== requestedSceneIndex) {
      onChange((current) =>
        current.videoProduction.automationRunId === runId
          ? {
              ...current,
              videoProduction: {
                ...current.videoProduction,
                automationStatus:
                  status === "pausing"
                    ? "paused"
                    : sceneIndex >= current.scenes.length
                      ? "merging"
                      : "running",
                automationCurrentSceneIndex: sceneIndex,
                automationUpdatedAt: Date.now(),
              },
            }
          : current,
      );
      return;
    }
    if (sceneIndex >= storyboard.scenes.length) {
      onChange((current) =>
        current.videoProduction.automationRunId === runId
          ? {
              ...current,
              videoProduction: {
                ...current.videoProduction,
                automationStatus: status === "pausing" ? "paused" : "merging",
                automationUpdatedAt: Date.now(),
              },
            }
          : current,
      );
      return;
    }

    const scene = storyboard.scenes[sceneIndex];
    const sceneJob = scene.video.jobId
      ? jobsById.get(scene.video.jobId)
      : undefined;
    if (!scene.video.jobId) {
      if (status === "pausing") {
        onChange((current) =>
          current.videoProduction.automationRunId === runId
            ? {
                ...current,
                videoProduction: {
                  ...current.videoProduction,
                  automationStatus: "paused",
                  automationUpdatedAt: Date.now(),
                },
              }
            : current,
        );
        return;
      }

      const previousScene =
        sceneIndex > 0 ? storyboard.scenes[sceneIndex - 1] : undefined;
      const previousLastFrameUrl = previousScene?.video.lastFrameUrl || null;
      if (
        !previousLastFrameUrl &&
        !scene.generatedImage?.url &&
        !scene.video.lastFrameUrl
      ) {
        failAutomation(
          runId,
          `${scene.order}번 장면의 시작 프레임을 준비하지 못했습니다.`,
        );
        return;
      }
      runAction(`scene-submit:${runId}:${scene.id}`, async () => {
        await submitSceneJob({
          scene,
          automationRunId: runId,
          previousLastFrameUrl,
        });
      });
      return;
    }

    if (!sceneJob) {
      if (status === "pausing") {
        onChange((current) =>
          current.videoProduction.automationRunId === runId
            ? {
                ...current,
                videoProduction: {
                  ...current.videoProduction,
                  automationStatus: "paused",
                  automationUpdatedAt: Date.now(),
                },
              }
            : current,
        );
        return;
      }
      const jobPublishedAt =
        production.automationUpdatedAt || production.automationStartedAt;
      if (
        jobPublishedAt &&
        jobStatusClock - jobPublishedAt > VIDEO_JOB_VISIBILITY_STALL_MS
      ) {
        failAutomation(
          runId,
          `${scene.order}번 장면 작업이 대기열에서 확인되지 않습니다. 이 장면부터 다시 제작해 주세요.`,
        );
      }
      return;
    }
    if (
      sceneJob.status === "queued" ||
      sceneJob.status === "running" ||
      sceneJob.status === "uploading"
    )
      return;

    if (sceneJob.status === "completed") {
      const missingRequiredOutput =
        !sceneJob.clipId ||
        !sceneJob.resultVideoUrl ||
        (sceneIndex < storyboard.scenes.length - 1 && !sceneJob.resultFrameUrl);
      if (missingRequiredOutput) {
        onChange((current) =>
          current.videoProduction.automationRunId === runId
            ? {
                ...current,
                scenes: current.scenes.map((item) =>
                  item.id === scene.id
                    ? {
                        ...item,
                        video: {
                          ...item.video,
                          status: "failed",
                          errorMessage:
                            "장면 결과 또는 다음 장면 연결 프레임이 누락되었습니다.",
                        },
                      }
                    : item,
                ),
                videoProduction: {
                  ...current.videoProduction,
                  automationStatus: "failed",
                  automationUpdatedAt: Date.now(),
                  automationErrorMessage: `${scene.order}번 장면의 연결 품질 검사를 통과하지 못했습니다.`,
                },
              }
            : current,
        );
        return;
      }
      runAction(`scene-complete:${sceneJob.id}`, async () => {
        const result = renderResult(sceneJob);
        onChange((current) => {
          if (current.videoProduction.automationRunId !== runId) return current;
          const completedIds = new Set(
            current.videoProduction.automationCompletedSceneIds,
          );
          completedIds.add(scene.id);
          const nextScenes = current.scenes.map((item) =>
            item.id === scene.id
              ? {
                  ...item,
                  approvedVideoArtifactId:
                    sceneJob.clipId || item.video.artifactId,
                  video: {
                    ...item.video,
                    status: "approved" as const,
                    clipId: sceneJob.clipId || item.video.clipId,
                    videoUrl: sceneJob.resultVideoUrl || item.video.videoUrl,
                    lastFrameUrl:
                      sceneJob.resultFrameUrl || item.video.lastFrameUrl,
                    modelUsed: result.modelUsed || item.video.modelUsed,
                    costUsd: result.costUsd ?? item.video.costUsd,
                    visualReferencesApplied: result.visualReferencesApplied,
                    firstFrameApplied: result.firstFrameApplied,
                    endFrameApplied: result.endFrameApplied,
                    audioApplied: result.audioApplied,
                     errorMessage: null,
                    approvedAt: Date.now(),
                    artifactId: sceneJob.clipId || item.video.artifactId,
                    replacedClipId:
                      sceneJob.clipId &&
                      item.video.clipId &&
                      sceneJob.clipId !== item.video.clipId
                        ? item.video.clipId
                        : item.video.replacedClipId,
                   },
                }
              : item,
          );
          const nextIndex = findNextStoryboardSceneIndex(
            nextScenes,
            completedIds,
            sceneIndex + 1,
          );
          return {
            ...current,
            scenes: nextScenes,
            videoProduction: {
              ...current.videoProduction,
              automationStatus:
                status === "pausing"
                  ? "paused"
                  : nextIndex >= current.scenes.length
                    ? "merging"
                    : "running",
              automationCurrentSceneIndex: nextIndex,
              automationCompletedSceneIds: [...completedIds],
              automationUpdatedAt: Date.now(),
              automationErrorMessage: null,
            },
          };
        });
      });
      return;
    }

    if (status === "pausing") {
      onChange((current) =>
        current.videoProduction.automationRunId === runId
          ? {
              ...current,
              videoProduction: {
                ...current.videoProduction,
                automationStatus: "paused",
                automationUpdatedAt: Date.now(),
                automationErrorMessage:
                  sceneJob.errorMessage || sceneJob.message || null,
              },
            }
          : current,
      );
      return;
    }

    const attemptCount = sceneJob.attemptCount ?? 0;
    const automaticRetryCount =
      automationRetryCountsByJobRef.current.get(sceneJob.id) || 0;
    const isPermanentVisualPrivacyFailure = isInputImagePrivacyFailure(
      sceneJob.errorMessage || sceneJob.message,
      sceneJob,
    );
    if (
      sceneJob.status === "failed" &&
      !isPermanentVisualPrivacyFailure &&
      attemptCount <= AUTOMATION_RETRY_LIMIT &&
      automaticRetryCount < AUTOMATION_RETRY_LIMIT
    ) {
      const retryVersion = timestampMillis(sceneJob.updatedAt) ?? attemptCount;
      runAction(`scene-retry:${sceneJob.id}:${retryVersion}`, async () => {
        automationRetryCountsByJobRef.current.set(
          sceneJob.id,
          automaticRetryCount + 1,
        );
        const authToken = await currentUser.getIdToken();
        await videoStudioService.updateStudioJob({
          authToken,
          jobId: sceneJob.id,
          action: "requeue",
        });
        onChange((current) =>
          current.videoProduction.automationRunId === runId
            ? {
                ...current,
                scenes: current.scenes.map((item) =>
                  item.id === scene.id
                    ? {
                        ...item,
                        video: {
                          ...item.video,
                          status: "queued",
                          errorMessage: null,
                        },
                      }
                    : item,
                ),
                videoProduction: {
                  ...current.videoProduction,
                  automationRetryCount:
                    current.videoProduction.automationRetryCount + 1,
                  automationUpdatedAt: Date.now(),
                  automationErrorMessage: null,
                },
              }
            : current,
        );
      });
      return;
    }

    failAutomation(
      runId,
      sceneJob.errorMessage ||
        sceneJob.message ||
        `${scene.order}번 장면 제작에 실패했습니다.`,
    );
  }, [
    currentUser,
    failAutomation,
    jobStatusClock,
    jobSubscriptionError,
    jobSubscriptionReady,
    jobsById,
    onChange,
    storyboard,
    submitFinalMerge,
    submitSceneJob,
  ]);

  const automationCompletedCount = Math.max(
    storyboard.videoProduction.automationCompletedSceneIds.length,
    automationStatus === "idle" ? reusableSceneIds.size : 0,
  );
  const finalAutomationJob = storyboard.videoProduction.finalJobId
    ? jobsById.get(storyboard.videoProduction.finalJobId)
    : undefined;
  const automationProgress =
    automationStatus === "completed"
      ? 100
      : automationStatus === "merging"
        ? Math.min(
            99,
            90 + Math.round((finalAutomationJob?.progress || 0) * 0.09),
          )
        : Math.min(
            90,
            Math.round(
              (automationCompletedCount / Math.max(1, sceneCount)) * 90,
            ),
          );
  const automationCurrentScene =
    storyboard.videoProduction.automationCurrentSceneIndex !== null
      ? storyboard.scenes[
          storyboard.videoProduction.automationCurrentSceneIndex
        ]
      : undefined;
  const automationCurrentJob = automationCurrentScene?.video.jobId
    ? jobsById.get(automationCurrentScene.video.jobId)
    : undefined;
  const automationRecovery =
    automationStatus === "failed"
      ? describeStoryboardVideoRecovery({
          errorMessage: storyboard.videoProduction.automationErrorMessage,
          job: automationCurrentJob,
        })
      : null;
  const canPauseAutomation =
    automationStatus === "preparing" ||
    automationStatus === "running" ||
    automationStatus === "pausing";
  const canResumeAutomation =
    automationStatus === "paused" || automationStatus === "failed";
  const selectedSceneIndex = Math.max(
    0,
    storyboard.scenes.findIndex((scene) => scene.id === activeSceneId),
  );
  const visibleSceneEntries = storyboard.scenes.length
    ? [
        {
          scene: storyboard.scenes[selectedSceneIndex],
          index: selectedSceneIndex,
        },
      ]
    : [];
  const canStartAutomation =
    !disabled &&
    Boolean(currentUser) &&
    sceneCount > 0 &&
    jobSubscriptionReady &&
    !jobSubscriptionError &&
    !pricingCheckPending &&
    !budgetExceeded &&
    !unknownPricingBlocked;
  const firstSceneReady = Boolean(
    storyboard.scenes[0]?.generatedImage?.url ||
    reusableSceneIds.has(storyboard.scenes[0]?.id || ""),
  );
  const productionJourney = buildStoryboardProductionJourney({
    automationActive,
    automationCompletedCount,
    automationCurrentSceneIndex:
      storyboard.videoProduction.automationCurrentSceneIndex,
    automationErrorMessage: storyboard.videoProduction.automationErrorMessage,
    automationProgress,
    automationStatus,
    budgetExceeded,
    canPauseAutomation,
    canResumeAutomation,
    canStartAutomation,
    finalMergeInFlight,
    firstSceneReady,
    hasFinalDelivery,
    isDownloading: Boolean(downloadingAssetUrl),
    isRecoveringAutomation,
    jobSubscriptionError,
    jobSubscriptionReady,
    nextQualityAction:
      nextQualityAction && !automationActive && !hasFinalDelivery
        ? {
            sceneId: nextQualityAction.scene.id,
            sceneOrder: nextQualityAction.scene.order,
          }
        : null,
    pendingSceneCount,
    pricingCheckPending,
    qualityMode: storyboard.videoProduction.qualityMode,
    readySceneCount,
    sceneCount,
    startFrameCount: qualityReadiness.startFrameCount,
    unknownPricingBlocked,
  });
  const automationProgressDescription = automationCurrentScene
    ? `현재 ${automationCurrentScene.order}/${sceneCount} · ${automationCurrentScene.title}`
    : automationStatus === "merging"
      ? `${sceneCount}개 장면 완료 · 최종 조립 중`
      : automationStatus === "completed"
        ? `${sceneCount}개 장면과 완성본 제작 완료`
        : reusableSceneIds.size
          ? `승인 영상 ${reusableSceneIds.size}개 재사용 · 새 생성 ${pendingSceneCount}개`
          : `완료 장면 ${automationCompletedCount}/${sceneCount}`;

  const handleFinalDownload = useCallback(() => {
    const finalVideoUrl = storyboard.videoProduction.finalVideoUrl;
    if (!finalVideoUrl) return;

    void handleDownloadAsset(
      finalVideoUrl,
      createDownloadFileName(
        `${storyboard.title}-final`,
        "mp4",
        "storyboard-final",
      ),
      "완성 영상",
    );
  }, [
    handleDownloadAsset,
    storyboard.title,
    storyboard.videoProduction.finalVideoUrl,
  ]);

  const handleJourneyPrimaryAction = useCallback(() => {
    if (finalMergeInFlight || automationActive || isRecoveringAutomation)
      return;
    if (canResumeAutomation) {
      void handleResumeAutomation();
      return;
    }
    if (hasFinalDelivery) {
      handleFinalDownload();
      return;
    }
    void handleStartAutomation();
  }, [
    automationActive,
    canResumeAutomation,
    finalMergeInFlight,
    handleFinalDownload,
    handleResumeAutomation,
    handleStartAutomation,
    hasFinalDelivery,
    isRecoveringAutomation,
  ]);

  return (
    <ProductionSurface
      aria-labelledby="storyboard-video-production-title"
      data-testid="storyboard-video-production"
    >
      <ProductionHeader>
        <div>
          <HeaderLabel>STORYBOARD TO VIDEO</HeaderLabel>
          <h3 id="storyboard-video-production-title">영상 제작</h3>
          <p>
            대표 이미지를 시작 프레임으로 고정하고, 장면별 움직임을 검수한 뒤 한
            편의 영상으로 연결합니다.
          </p>
        </div>
        <AutomaticBadge>
          <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
          OpenRouter 자동 선택
        </AutomaticBadge>
      </ProductionHeader>

      <StoryboardProductionJourney
        model={productionJourney}
        onPause={handlePauseAutomation}
        onPrimaryAction={handleJourneyPrimaryAction}
        onSelectScene={onActiveSceneChange}
      />

      <ProductionDetails>
        <summary>
          <span>
            <i className="fas fa-sliders" aria-hidden="true" /> 품질·비용·세부
            준비
          </span>
          <small>
            {qualityReadiness.score}점 · 예상 {formatUsd(projectedCost)}
          </small>
          <i className="fas fa-chevron-down" aria-hidden="true" />
        </summary>
        <ControlStrip>
          <QualitySelector aria-label="영상 제작 품질">
            <button
              type="button"
              className={
                storyboard.videoProduction.qualityMode === "proof"
                  ? "active"
                  : ""
              }
              onClick={() => handleQualityMode("proof")}
              disabled={projectBusy}
              aria-pressed={storyboard.videoProduction.qualityMode === "proof"}
            >
              <strong>빠른 시안</strong>
              <span>비용과 속도 우선</span>
            </button>
            <button
              type="button"
              className={
                storyboard.videoProduction.qualityMode === "final"
                  ? "active"
                  : ""
              }
              onClick={() => handleQualityMode("final")}
              disabled={projectBusy}
              aria-pressed={storyboard.videoProduction.qualityMode === "final"}
            >
              <strong>최종 품질</strong>
              <span>표현력과 완성도 우선</span>
            </button>
          </QualitySelector>
          <MetricsGrid
            aria-live="polite"
            aria-busy={!estimate && !estimateError}
          >
            <Metric>
              <span>완성본 길이</span>
              <strong>{editedTotalDuration}초</strong>
              <small>
                {storyboard.scenes.length}개 장면
                {editedTotalDuration !== totalDuration
                  ? ` · 원본 ${totalDuration}초 편집`
                  : ""}
                {dialogueAdjustedSceneCount > 0
                  ? ` · 대사 맞춤 +${totalDuration - configuredDuration}초`
                  : ""}
              </small>
            </Metric>
            <Metric>
              <span>예상 비용</span>
              <strong>
                {hasUnknownProfilePricing
                  ? "일부 가격 미공개"
                  : formatUsd(projectedCost)}
              </strong>
              <small>
                {hasUnknownProfilePricing
                  ? "OpenRouter 가격표가 없는 장면은 합계를 표시하지 않습니다."
                  : estimate
                    ? `장면 조건별 합산 · 대표 ${estimate.resolvedResolution} · ${estimate.resolvedDuration}초`
                    : estimateError || "가격표 확인 중"}
              </small>
            </Metric>
            <Metric>
              <span>실제 사용</span>
              <strong>{formatUsd(actualCost)}</strong>
              <small>
                {readySceneCount}/{storyboard.scenes.length} 장면 완료
              </small>
            </Metric>
          </MetricsGrid>
        </ControlStrip>

        <QualityReadiness $score={qualityReadiness.score}>
          <div>
            <span>QUALITY PREFLIGHT</span>
            <strong>{qualityReadiness.score}점</strong>
            <small>
              {qualityReadiness.readyCount}/{sceneCount} 장면 제작 준비 ·{" "}
              {resolution} 우선 · 장면 직접 선택 {manualReferenceSceneCount}개
            </small>
          </div>
          <QualityMeter
            role="progressbar"
            aria-label={`영상 품질 준비도 ${qualityReadiness.score}점`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={qualityReadiness.score}
          >
            <span
              style={{ transform: `scaleX(${qualityReadiness.score / 100})` }}
            />
          </QualityMeter>
          <p>
            {qualityReadiness.needsAttention > 0
              ? `${qualityReadiness.needsAttention}개 장면은 키프레임 또는 일관성 기준을 보완하면 좋습니다.`
              : "장면별 시작·도착 프레임, 연출, 일관성 기준을 확인했습니다."}
            <em>
              지원 모델이 없으면 OpenRouter가 다음 최적 해상도로 자동
              조정합니다.
            </em>
          </p>
        </QualityReadiness>

        <QualityGate aria-labelledby="storyboard-quality-gate-title">
          <QualityGateHeader>
            <div>
              <span>PRODUCTION CHECKLIST</span>
              <h4 id="storyboard-quality-gate-title">제작 전 완성도 점검</h4>
              <p>
                품질에 가장 큰 영향을 주는 기준을 장면별로 확인하고, 필요한
                장면으로 바로 이동합니다.
              </p>
            </div>
            <strong>
              {qualityReadiness.readyCount}/{sceneCount} 장면 준비 완료
            </strong>
          </QualityGateHeader>
          <QualityCheckGrid>
            <QualityCheck
              $ready={qualityReadiness.startFrameCount === sceneCount}
            >
              <i
                className={
                  qualityReadiness.startFrameCount === sceneCount
                    ? "fas fa-circle-check"
                    : "fas fa-image"
                }
                aria-hidden="true"
              />
              <span>시작 키프레임</span>
              <strong>
                {qualityReadiness.startFrameCount}/{sceneCount}
              </strong>
              <small>장면의 구도와 주제를 고정합니다.</small>
            </QualityCheck>
            <QualityCheck
              $ready={qualityReadiness.continuityCount === sceneCount}
            >
              <i
                className={
                  qualityReadiness.continuityCount === sceneCount
                    ? "fas fa-circle-check"
                    : "fas fa-fingerprint"
                }
                aria-hidden="true"
              />
              <span>일관성 기준</span>
              <strong>
                {qualityReadiness.continuityCount}/{sceneCount}
              </strong>
              <small>인물·제품·조명 기준을 유지합니다.</small>
            </QualityCheck>
            <QualityCheck
              $ready={
                qualityReadiness.transitionCount === 0 ||
                qualityReadiness.transitionReadyCount ===
                  qualityReadiness.transitionCount
              }
            >
              <i
                className={
                  qualityReadiness.transitionReadyCount ===
                  qualityReadiness.transitionCount
                    ? "fas fa-circle-check"
                    : "fas fa-link"
                }
                aria-hidden="true"
              />
              <span>장면 연결</span>
              <strong>
                {qualityReadiness.transitionReadyCount}/
                {qualityReadiness.transitionCount}
              </strong>
              <small>앞 장면의 끝을 다음 장면으로 잇습니다.</small>
            </QualityCheck>
            <QualityCheck
              $ready={qualityReadiness.audioReadyCount === sceneCount}
            >
              <i
                className={
                  qualityReadiness.audioReadyCount === sceneCount
                    ? "fas fa-circle-check"
                    : "fas fa-microphone-lines"
                }
                aria-hidden="true"
              />
              <span>대사·립싱크</span>
              <strong>
                {qualityReadiness.audioReadyCount}/{sceneCount}
              </strong>
              <small>대사 길이와 선택한 오디오 방식을 확인합니다.</small>
            </QualityCheck>
          </QualityCheckGrid>
          <QualityActionList aria-label="우선 보완할 장면">
            {qualityReadiness.actionItems.length ? (
              qualityReadiness.actionItems.map(({ scene, readiness }) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => onActiveSceneChange(scene.id)}
                  aria-current={scene.id === activeSceneId ? "step" : undefined}
                >
                  <span className="order">{scene.order}</span>
                  <span className="copy">
                    <strong>{scene.title}</strong>
                    <small>{readiness.note}</small>
                  </span>
                  <span className={`tone ${readiness.tone}`}>
                    {readiness.label}
                  </span>
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </button>
              ))
            ) : (
              <p>
                <i className="fas fa-circle-check" aria-hidden="true" /> 모든
                장면의 주요 제작 기준이 준비되었습니다. 최종 완성본을 만들어도
                좋습니다.
              </p>
            )}
          </QualityActionList>
        </QualityGate>
      </ProductionDetails>

      <StoryboardAutomationConsoleView
        model={{
          allowUnknownPricing: storyboard.videoProduction.allowUnknownPricing,
          automationErrorMessage:
            storyboard.videoProduction.automationErrorMessage,
          automationProgress,
          automationRetryCount: storyboard.videoProduction.automationRetryCount,
          automationStatus,
          budgetBlocked: budgetExceeded || unknownPricingBlocked,
          budgetExceeded,
          budgetSummary: budgetExceeded
            ? "예산 초과"
            : `예상 ${formatUsd(projectedCost)} / 한도 ${formatUsd(maxBudgetUsd)}`,
          canPauseAutomation,
          canResumeAutomation,
          finalErrorMessage: storyboard.videoProduction.finalErrorMessage,
          hasFinalDelivery,
          hasUnknownProfilePricing,
          isRecoveringAutomation,
          jobSubscriptionError,
          jobSubscriptionReady,
          maxBudgetUsd,
          pendingSceneCount,
          progressDescription: automationProgressDescription,
          projectedCostLabel: formatUsd(projectedCost),
          projectBusy,
          qualityMode: storyboard.videoProduction.qualityMode,
          recovery: automationRecovery,
          reusableSceneCount: reusableSceneIds.size,
        }}
        onAllowUnknownPricingChange={handleAllowUnknownPricingChange}
        onBudgetChange={handleBudgetChange}
        onPause={handlePauseAutomation}
        onResume={() => void handleResumeAutomation()}
      />

      {storyboard.videoProduction.finalVideoUrl ? (
        <StoryboardFinalDelivery
          delivery={{
            audioMixLabel,
            backgroundMusicName: storyboard.videoProduction.backgroundMusicName,
            backgroundMusicUrl: storyboard.videoProduction.backgroundMusicUrl,
            dialogueAdjustedSceneCount,
            dialogueSceneCount,
            editedTotalDuration,
            finalVideoUrl: storyboard.videoProduction.finalVideoUrl,
            isDownloading:
              downloadingAssetUrl === storyboard.videoProduction.finalVideoUrl,
            isCurrent: isFinalDeliveryCurrent,
            posterUrl: storyboard.scenes[0]?.generatedImage?.url || undefined,
            readySceneCount,
            remergeDisabled:
              projectBusy ||
              finalMergeInFlight ||
              readySceneCount !== storyboard.scenes.length,
            sceneAudioVolume: storyboard.videoProduction.sceneAudioVolume,
            sceneCount,
          }}
          onDownload={handleFinalDownload}
          onRemerge={() => void handleFinalMerge()}
        />
      ) : null}

      <ProductionDetails>
        <summary>
          <span>
            <i className="fas fa-sliders" aria-hidden="true" /> 사운드·완성본
            편집
          </span>
          <small>
            {storyboard.videoProduction.backgroundMusicName || "배경음악 없음"}{" "}
            · {audioMixLabel}
          </small>
          <i className="fas fa-chevron-down" aria-hidden="true" />
        </summary>
        <StoryboardAssemblyEditorView
          editor={{
            audioMixLabel,
            audioMixPreset: storyboard.videoProduction.audioMixPreset,
            backgroundMusicName: storyboard.videoProduction.backgroundMusicName,
            backgroundMusicUrl: storyboard.videoProduction.backgroundMusicUrl,
            backgroundMusicVolume:
              storyboard.videoProduction.backgroundMusicVolume,
            dialogueSceneCount,
            isUploadingBackgroundMusic: isUploadingBgm,
            mixOptions: AUDIO_MIX_OPTIONS,
            projectBusy,
            sceneAudioVolume: storyboard.videoProduction.sceneAudioVolume,
            storyboardIdAvailable: Boolean(storyboardId),
            voiceDirection: storyboard.videoProduction.voiceDirection,
          }}
          onAssemblyPatch={patchAssemblySettings}
          onAudioMixPreset={handleAudioMixPreset}
          onBackgroundMusicFile={(file) => void handleBackgroundMusicFile(file)}
          onRemoveBackgroundMusic={handleRemoveBackgroundMusic}
          onVoiceDirectionCommit={patchVoiceDirection}
        />

        <StoryboardProjectFileManager
          storyboardId={storyboardId}
          storyboard={storyboard}
          projectBusy={projectBusy}
          disabled={disabled}
          onChange={onChange}
        />
      </ProductionDetails>

      <TimelineOverview aria-label="영상 장면 타임라인">
        {storyboard.scenes.map((scene) => (
          <TimelineScene
            key={scene.id}
            type="button"
            $status={scene.video.status}
            $active={scene.id === storyboard.scenes[selectedSceneIndex]?.id}
            onClick={() => onActiveSceneChange(scene.id)}
            aria-current={
              scene.id === storyboard.scenes[selectedSceneIndex]?.id
                ? "step"
                : undefined
            }
          >
            <div className="thumb">
              {scene.generatedImage?.url ? (
                <img
                  src={scene.generatedImage.url}
                  alt=""
                  width={96}
                  height={54}
                  loading="lazy"
                />
              ) : (
                <i className="fas fa-image" aria-hidden="true" />
              )}
              <span>{scene.order}</span>
            </div>
            <strong>{scene.title}</strong>
            <small>{STATUS_LABELS[scene.video.status]}</small>
          </TimelineScene>
        ))}
      </TimelineOverview>

      <SceneProductionList>
        {visibleSceneEntries.map(({ scene, index }) => {
          const previousScene = storyboard.scenes[index - 1];
          const nextScene = storyboard.scenes[index + 1];
          const hasNextEndFrame = Boolean(
            nextScene &&
            scene.video.useNextSceneAsEndFrame &&
            nextScene.generatedImage?.url,
          );
          const selectedReferenceAssets = selectVideoReferenceAssets(
            referenceAssets,
            scene.video.referenceAssetIds,
          );
          const sceneAudioMode = resolveStoryboardVideoAudioMode(scene.video);
          const dialogueTiming = analyzeStoryboardDialogueTiming(
            scene.dialogueOrCaption,
            scene.video.durationSeconds,
          );
          const hasManualReferenceSelection =
            scene.video.referenceAssetIds.some((assetId) =>
              referenceAssets.some((asset) => asset.id === assetId),
            );
          const sceneQuality = getSceneQualityReadiness(
            storyboard,
            scene,
            nextScene,
            selectedReferenceAssets.length,
          );
          const suggestedPrompt = buildMotionPrompt(
            storyboard,
            scene,
            nextScene,
            hasNextEndFrame,
            selectedReferenceAssets.map(
              (asset) => IMAGE_REFERENCE_ROLE_LABELS[asset.role],
            ),
          );
          const isSceneBusy =
            queueingSceneId === scene.id ||
            scene.video.status === "queued" ||
            scene.video.status === "rendering";
          const hasStartFrame = Boolean(
            scene.generatedImage?.url ||
            scene.video.lastFrameUrl ||
            previousScene?.video.lastFrameUrl,
          );
          const hasPendingVideoChanges = Boolean(
            scene.video.videoUrl && scene.video.status === "brief",
          );
          const sceneEstimateProfileKey = videoEstimateProfileKey({
            duration: effectiveSceneDuration(scene),
            audioMode: sceneAudioMode,
            hasReferenceImage: hasStartFrame,
            hasEndReferenceImage: hasNextEndFrame,
            hasVisualReferenceImages: selectedReferenceAssets.length > 0,
          });
          const sceneEstimate =
            estimatesByProfile.get(sceneEstimateProfileKey)?.estimatedCostUsd ??
            null;
          const sceneJob = scene.video.jobId
            ? jobsById.get(scene.video.jobId)
            : undefined;
          const sceneAudioVerified = hasVerifiedAudibleAudio(sceneJob);
          const sceneRecovery = scene.video.errorMessage
            ? describeStoryboardVideoRecovery({
                errorMessage: scene.video.errorMessage,
                job: sceneJob,
              })
            : null;
          const isInputImagePrivacyBlocked = isInputImagePrivacyFailure(
            scene.video.errorMessage,
            sceneJob,
          );

          return (
            <StoryboardSceneProductionEditor
              key={scene.id}
              model={{
                actualCostLabel:
                  scene.video.costUsd !== null
                    ? formatUsd(scene.video.costUsd)
                    : null,
                audioModeOptions: AUDIO_MODE_OPTIONS,
                canDuplicateScene,
                dialogueTiming,
                downloadingAssetUrl,
                durationOptions: STORYBOARD_VIDEO_DURATION_OPTIONS,
                hasManualReferenceSelection,
                hasNextEndFrame,
                hasPendingVideoChanges,
                hasRepresentativeEstimate: Boolean(estimate),
                hasStartFrame,
                isQueueing: queueingSceneId === scene.id,
                isSceneBusy,
                isInputImagePrivacyBlocked,
                motionPresets: MOTION_PRESETS,
                nextScene,
                projectBusy,
                referenceAssets,
                retryAdvice: scene.video.errorMessage
                  ? getSceneRetryAdvice(scene.video.errorMessage)
                  : "",
                scene,
                sceneAudioMode,
                sceneAudioVerified,
                sceneEstimateLabel: formatUsd(sceneEstimate),
                sceneQuality,
                sceneRecovery,
                selectedReferenceAssets,
                statusLabel: STATUS_LABELS[scene.video.status],
                storyboardTitle: storyboard.title,
                suggestedPrompt,
              }}
              actions={{
                onApproval: () => handleApproval(scene),
                onDialogueChange: (dialogue) =>
                  patchSceneDialogue(scene.id, dialogue),
                onDownload: handleDownloadAsset,
                onDuplicate: () => onDuplicateScene(scene),
                onDurationChange: (duration) =>
                  patchSceneDuration(scene.id, duration),
                onGenerate: () => handleGenerateScene(scene),
                onGenerateWithoutVisualInputs: () =>
                  handleGenerateWithoutVisualInputs(scene),
                onPatchVideo: (patch) => patchSceneVideo(scene.id, patch),
              }}
            />
          );
        })}
      </SceneProductionList>
    </ProductionSurface>
  );
}
