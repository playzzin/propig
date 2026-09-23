"use client";

import {
  ProductionSurface,
  ProductionHeader,
  HeaderLabel,
  AutomaticBadge,
  HeaderActions,
  ModelCatalogRefreshButton,
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
  CreditReadiness,
  RuntimeStatusRetryButton,
  TimelineOverview,
  TimelineScene,
  SceneProductionList,
  RecoveryNotice,
  PrimaryAutomationButton,
  SecondaryAutomationButton,
  AutomationActions,
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
import {
  buildStoryboardProductionJourney,
  type StoryboardProductionJourneyTarget,
} from "@/lib/storyboard-production-journey";
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
import { withFirebaseAuthRetry } from "@/lib/firebase-auth-retry";
import {
  analyzeStoryboardDialogueTiming,
  appendStoryboardVideoAudioDirection,
  normalizeStoryboardSpokenDialogue,
  resolveStoryboardVideoAudioMode,
  STORYBOARD_VIDEO_DURATION_OPTIONS,
} from "@/lib/storyboard-video-audio";
import {
  buildStoryboardVoiceLock,
  createStoryboardVoiceProfile,
  hasAmbiguousStoryboardVoiceSelection,
  resolveStoryboardVoiceProfile,
} from "@/lib/storyboard-voice-consistency";
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
  buildStoryboardFinalVideoIdempotencyKey,
  buildStoryboardSceneVideoIdempotencyKey,
} from "@/lib/video-studio-client-idempotency";
import {
  createDownloadFileName,
  downloadRemoteMedia,
  openRemoteMedia,
} from "@/lib/client/media-download";
import {
  STORYBOARD_AUTOMATION_RETRY_LIMIT,
  type ImageStoryboard,
  type ImageStoryboardScene,
  type StoryboardAudioMixPreset,
  type StoryboardVideoAutomationStatus,
  type StoryboardVideoAudioMode,
  type StoryboardVideoQualityMode,
  type StoryboardVideoScene,
  type StoryboardVideoSceneStatus,
  type StoryboardVoiceProfile,
  type StoryboardStorageCleanupAsset,
} from "@/schemas/imageStoryboard";
import {
  videoStudioService,
  type RunStudioJobInput,
  type VideoStudioEstimate,
  type VideoStudioRuntimeStatus,
} from "@/services/videoStudioService";
import { imageStoryboardService } from "@/services/imageStoryboardService";
import StoryboardProjectFileManager from "@/components/image-generator/StoryboardProjectFileManager";
import { getStoryboardVideoConfirmationIssue } from "@/lib/storyboard-video-confirmation";
import StoryboardBatchSettings from "./StoryboardBatchSettings";
import StoryboardSceneComparison from "./StoryboardSceneComparison";

type StoryboardUpdater = (current: ImageStoryboard) => ImageStoryboard;

type StoryboardVideoProductionPanelProps = {
  storyboardId: string | null;
  storyboard: ImageStoryboard;
  referenceAssets: ImageReferenceAsset[];
  activeSceneId: string | null;
  onActiveSceneChange: (sceneId: string) => void;
  onDuplicateScene: (scene: ImageStoryboardScene) => void;
  onOpenImageWorkspace: () => void;
  disabled?: boolean;
  onChange: (updater: StoryboardUpdater) => void;
  onRequestPendingChange?: (pending: boolean) => void;
};

const MAX_VIDEO_REFERENCE_IMAGES = 2;
const MAX_VIDEO_REFERENCE_DATA_URL_LENGTH = 280_000;
const MAX_VIDEO_REFERENCE_EDGE = 768;
const VIDEO_ESTIMATE_REQUEST_CONCURRENCY = 3;
const AUTOMATION_RETRY_LIMIT = STORYBOARD_AUTOMATION_RETRY_LIMIT;
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
  const voiceLock = buildStoryboardVoiceLock(
    resolveStoryboardVoiceProfile(storyboard.videoProduction, scene.video),
  );
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
    voiceLock,
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
    message.includes("quality validation failed") &&
    message.includes("expected") &&
    message.includes("received")
  ) {
    return "영상 모델이 규격에 가깝게 프레임 크기를 조정해 반환한 경우입니다. 참조 사진이나 프롬프트를 바꿀 필요는 없습니다. 새 영상을 요청하지 말고 ‘추가 생성비 없이 규격 보정’으로 완료된 결과를 복구하세요.";
  }
  if (
    message.includes("input_image_privacy") ||
    message.includes("real person") ||
    (message.includes("실제 인물") && message.includes("감지"))
  ) {
    return "원본 사진은 그대로 유지됩니다. 이 장면만 사진 없이 시안을 만들거나 실제 인물이 없는 참조 사진으로 교체해 주세요.";
  }
  if (
    message.includes("기존 결과 파일 접근을 거부") ||
    message.includes("openrouter 인증을 확인") ||
    /video content download failed: http (401|403)/.test(message)
  ) {
    return "작업 ID는 보존되어 있습니다. OpenRouter 키와 계정 권한을 확인한 뒤 ‘추가 생성비 없이 다시 저장’으로 이어가세요.";
  }
  if (
    message.includes("다운로드 보관 기간") ||
    message.includes("provider_output_unavailable") ||
    message.includes("provider_output_not_found") ||
    message.includes("provider_output_expired")
  ) {
    return "기존 결과 파일이 만료되어 더는 복구할 수 없습니다. 현재 설계는 유지되며, 예상 비용과 잔액을 확인한 뒤 새 영상으로 제작해 주세요.";
  }
  if (
    message.includes("ambiguous_provider_submission") ||
    message.includes("prevent duplicate charges")
  ) {
    return "중복 과금을 막기 위해 자동 재시도를 멈췄습니다. OpenRouter 사용 내역을 먼저 확인한 뒤 새 영상 제작 여부를 결정해 주세요.";
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

function isVideoCanvasValidationFailure(errorMessage?: string | null): boolean {
  const message = errorMessage?.toLowerCase() || "";
  return (
    message.includes("quality validation failed") &&
    message.includes("expected") &&
    message.includes("received")
  );
}

function isProviderOutputUnavailableFailure(
  errorMessage?: string | null,
  job?: VideoStudioJob | null,
): boolean {
  const discarded =
    job?.metadata?.providerVideoDiscarded &&
    typeof job.metadata.providerVideoDiscarded === "object"
      ? (job.metadata.providerVideoDiscarded as Record<string, unknown>)
      : null;
  if (
    discarded?.reason === "provider_output_not_found" ||
    discarded?.reason === "provider_output_expired"
  ) {
    return true;
  }
  if (
    discarded?.reason === "provider_output_unavailable" &&
    discarded.httpStatus !== 401 &&
    discarded.httpStatus !== 403
  ) {
    return true;
  }

  const message = errorMessage?.toLowerCase() || "";
  return (
    message.includes("다운로드 보관 기간") ||
    /video content download failed: http (404|410)/.test(message)
  );
}

function isProviderOutputAccessFailure(
  errorMessage?: string | null,
  job?: VideoStudioJob | null,
): boolean {
  const accessIssue =
    job?.metadata?.providerVideoAccessIssue &&
    typeof job.metadata.providerVideoAccessIssue === "object"
      ? (job.metadata.providerVideoAccessIssue as Record<string, unknown>)
      : null;
  if (
    accessIssue?.recoverable !== false &&
    (accessIssue?.httpStatus === 401 || accessIssue?.httpStatus === 403)
  ) {
    return true;
  }

  const discarded =
    job?.metadata?.providerVideoDiscarded &&
    typeof job.metadata.providerVideoDiscarded === "object"
      ? (job.metadata.providerVideoDiscarded as Record<string, unknown>)
      : null;
  if (
    discarded?.reason === "provider_output_unavailable" &&
    (discarded.httpStatus === 401 || discarded.httpStatus === 403)
  ) {
    return true;
  }

  const message = errorMessage?.toLowerCase() || "";
  return /video content download failed: http (401|403)/.test(message);
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
  knownInputImagePrivacyBlock: boolean;
  sceneCount: number;
};

async function settleWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  run: (item: TItem, index: number) => Promise<TResult>,
): Promise<Array<PromiseSettledResult<TResult>>> {
  const results: Array<PromiseSettledResult<TResult>> = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = {
            status: "fulfilled",
            value: await run(items[index], index),
          };
        } catch (reason: unknown) {
          results[index] = { status: "rejected", reason };
        }
      }
    }),
  );

  return results;
}

function videoEstimateProfileKey(
  params: Omit<VideoEstimateProfile, "key" | "sceneCount">,
): string {
  return [
    params.duration,
    params.audioMode,
    params.hasReferenceImage ? "frame" : "text",
    params.hasEndReferenceImage ? "end-frame" : "no-end-frame",
    params.hasVisualReferenceImages ? "references" : "no-references",
    params.knownInputImagePrivacyBlock ? "privacy-blocked" : "policy-clear",
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
  const voiceReady =
    audioMode !== "dialogue" ||
    !hasAmbiguousStoryboardVoiceSelection(
      storyboard.videoProduction,
      scene.video,
    );
  const audioReady = (likelySpokenDialogue
    ? audioMode === "dialogue" && dialogueTiming.tone !== "over"
    : audioMode !== "dialogue" ||
      (hasDialogue && dialogueTiming.tone !== "over")) && voiceReady;
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
    audioMode === "dialogue" && !voiceReady ? "말하는 캐릭터" : "",
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
  if (job.status === "completed") {
    if (!job.clipId || !job.resultVideoUrl) return "failed";
    return current === "approved" ? "approved" : "review";
  }
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
  return canReuseStoryboardVideoProviderJob(job);
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
  onOpenImageWorkspace,
  disabled = false,
  onChange: onStoryboardChange,
  onRequestPendingChange,
}: StoryboardVideoProductionPanelProps) {
  const { currentUser } = useAuth();
  const livePanelRef = useRef(true);
  useEffect(() => { livePanelRef.current = true; return () => { livePanelRef.current = false; }; }, []);
  const onChange = useCallback((updater: StoryboardUpdater) => {
    if (livePanelRef.current) onStoryboardChange(updater);
  }, [onStoryboardChange]);
  const [pendingVideoAction, setPendingVideoAction] = useState<{
    draft: ImageStoryboard;
    label: string;
    description: string;
    estimate: string;
    action: { kind: "start" | "resume" | "scene" | "regenerate" | "text"; sceneId?: string; estimateProfileKey?: string };
    quotes: Map<string, VideoStudioEstimate>;
  } | null>(null);
  const [videoActionAccepted, setVideoActionAccepted] = useState(false);
  const [confirmationQuote, setConfirmationQuote] = useState<{ loading: boolean; estimate: VideoStudioEstimate | null; error: string | null }>({ loading: false, estimate: null, error: null });
  const [confirmationQuoteRetry, setConfirmationQuoteRetry] = useState(0);
  const videoActionRunningRef = useRef(false);
  const requestVideoAction = useCallback((label: string, description: string, estimate: string, action: NonNullable<typeof pendingVideoAction>["action"], quotes: Map<string, VideoStudioEstimate>) => {
    if (videoActionRunningRef.current) return;
    setVideoActionAccepted(false);
    setConfirmationQuote({ loading: Boolean(action.sceneId), estimate: null, error: null });
    setPendingVideoAction({ draft: storyboard, label, description, estimate, action, quotes });
    window.requestAnimationFrame(() => {
      const target = document.getElementById("storyboard-video-approval");
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
  }, [storyboard]);
  useEffect(() => {
    if (!pendingVideoAction?.action.sceneId || !currentUser) return;
    const draft = pendingVideoAction.draft;
    const index = draft.scenes.findIndex((scene) => scene.id === pendingVideoAction.action.sceneId);
    const scene = draft.scenes[index];
    if (!scene) return;
    const controller = new AbortController();
    const textOnly = pendingVideoAction.action.kind === "text";
    setVideoActionAccepted(false);
    setConfirmationQuote({ loading: true, estimate: null, error: null });
    void withFirebaseAuthRetry(currentUser, (authToken) => videoStudioService.getVideoEstimate({
      authToken, duration: effectiveSceneDuration(scene), resolution: videoResolution(draft.videoProduction.qualityMode),
      aspectRatio: draft.aspectRatio as VideoStudioAspectRatio, qualityMode: draft.videoProduction.qualityMode,
      audioMode: resolveStoryboardVideoAudioMode(scene.video),
      hasReferenceImage: !textOnly && Boolean(scene.generatedImage?.url || scene.video.lastFrameUrl || draft.scenes[index - 1]?.video.lastFrameUrl),
      hasEndReferenceImage: !textOnly && Boolean(scene.video.useNextSceneAsEndFrame && draft.scenes[index + 1]?.generatedImage?.url),
      hasVisualReferenceImages: !textOnly && selectVideoReferenceAssets(referenceAssets, scene.video.referenceAssetIds).length > 0,
      knownInputImagePrivacyBlock: !textOnly && isInputImagePrivacyFailure(scene.video.errorMessage),
      signal: controller.signal,
    })).then((estimate) => {
      if (!controller.signal.aborted) setConfirmationQuote({ loading: false, estimate, error: null });
    }).catch(() => {
      if (!controller.signal.aborted) setConfirmationQuote({ loading: false, estimate: null, error: "이 장면의 예상 비용을 확인하지 못했습니다. 다시 확인해 주세요." });
    });
    return () => controller.abort();
  }, [pendingVideoAction, currentUser, referenceAssets, confirmationQuoteRetry]);
  const confirmVideoAction = async () => {
    if (!pendingVideoAction || !videoActionAccepted || videoActionRunningRef.current) return;
    if (pendingVideoAction.draft !== storyboard || (!pendingVideoAction.action.sceneId && pendingVideoAction.quotes !== estimatesByProfile)) {
      setPendingVideoAction(null);
      setVideoActionAccepted(false);
      toast.info("장면·설정 또는 견적이 바뀌었습니다. 최신 내용으로 제작을 다시 확인해 주세요.");
      return;
    }
    const action = pendingVideoAction.action;
    if (action.sceneId && (confirmationQuote.loading || confirmationQuote.error || !confirmationQuote.estimate)) return;
    const issue = getStoryboardVideoConfirmationIssue({
      scope: action.kind === "start" || action.kind === "resume" ? "project" : "scene",
      pendingSceneCount, busy: projectBusy, workerBlocked: workerGenerationBlocked,
      subscriptionReady: jobSubscriptionReady && !jobSubscriptionError,
      pricingPending: pricingCheckPending, budgetExceeded, creditBlocked, unknownPricingBlocked,
      sceneEstimate: confirmationQuote.estimate,
      maxBudgetUsd, allowUnknownPricing: storyboard.videoProduction.allowUnknownPricing,
    });
    if (issue) {
      toast.info(issue);
      return;
    }
    videoActionRunningRef.current = true;
    setPendingVideoAction(null);
    setVideoActionAccepted(false);
    try {
      const { kind, sceneId } = pendingVideoAction.action;
      const scene = storyboard.scenes.find((item) => item.id === sceneId);
      if (kind === "start") await handleStartAutomation();
      else if (kind === "resume") await handleResumeAutomation();
      else if (scene && kind === "text") await handleGenerateWithoutVisualInputs(scene);
      else if (scene) await handleGenerateScene(scene, { forceNewProviderRequest: kind === "regenerate" });
    }
    finally { videoActionRunningRef.current = false; }
  };
  const [queueingSceneId, setQueueingSceneId] = useState<string | null>(null);
  const [isPreparingProject, setIsPreparingProject] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isRecoveringAutomation, setIsRecoveringAutomation] = useState(false);
  const [estimatesByProfile, setEstimatesByProfile] = useState(
    () => new Map<string, VideoStudioEstimate>(),
  );
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] =
    useState<VideoStudioRuntimeStatus | null>(null);
  const [runtimeStatusError, setRuntimeStatusError] = useState<string | null>(
    null,
  );
  const [modelCatalogRefreshRequest, setModelCatalogRefreshRequest] =
    useState(0);
  const [runtimeStatusRefreshRequest, setRuntimeStatusRefreshRequest] =
    useState(0);
  const [jobStatusClock, setJobStatusClock] = useState(() => Date.now());
  const [isUploadingBgm, setIsUploadingBgm] = useState(false);
  const [downloadingAssetUrl, setDownloadingAssetUrl] = useState<string | null>(
    null,
  );
  const automationActionKeysRef = useRef(new Set<string>());
  const automationRetryCountsByJobRef = useRef(new Map<string, number>());
  const clipCleanupInFlightRef = useRef(new Set<string>());
  const ensureProjectPromiseRef = useRef<Promise<string> | null>(null);
  const forceModelCatalogRefreshRef = useRef(false);
  const runtimeStatusAutoRetryCountRef = useRef(0);
  const estimateProfilesCacheRef = useRef<{
    fingerprint: string;
    profiles: VideoEstimateProfile[];
  } | null>(null);

  const handleRefreshRuntimeStatus = useCallback(() => {
    runtimeStatusAutoRetryCountRef.current = 0;
    setRuntimeStatusRefreshRequest((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    if (!currentUser) {
      runtimeStatusAutoRetryCountRef.current = 0;
      setRuntimeStatus(null);
      setRuntimeStatusError(null);
      return () => {
        active = false;
      };
    }

    setRuntimeStatus(null);
    setRuntimeStatusError(null);
    void (async () => {
      try {
        const nextStatus = await withFirebaseAuthRetry(
          currentUser,
          (authToken) =>
            videoStudioService.getStudioRuntimeStatus({ authToken }),
        );
        if (!active) return;
        if (nextStatus.worker.compatible) {
          runtimeStatusAutoRetryCountRef.current = 0;
        }
        setRuntimeStatus(nextStatus);
      } catch (error) {
        if (!active) return;
        setRuntimeStatusError(
          error instanceof Error
            ? error.message
            : "영상 처리 서버 상태를 확인하지 못했습니다.",
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUser, runtimeStatusRefreshRequest]);

  const workerStatusPending =
    Boolean(currentUser) && !runtimeStatus && !runtimeStatusError;
  const workerBlockingMessage = runtimeStatus
    ? runtimeStatus.worker.compatible
      ? null
      : runtimeStatus.worker.message
    : runtimeStatusError
      ? `영상 처리 서버 상태를 확인할 수 없습니다. ${runtimeStatusError}`
      : null;
  const workerGenerationBlocked =
    workerStatusPending || Boolean(workerBlockingMessage);

  useEffect(() => {
    if (
      !currentUser ||
      workerStatusPending ||
      !workerBlockingMessage ||
      runtimeStatusAutoRetryCountRef.current >= 2
    ) {
      return undefined;
    }

    const nextAttempt = runtimeStatusAutoRetryCountRef.current + 1;
    const timer = window.setTimeout(
      () => {
        runtimeStatusAutoRetryCountRef.current = nextAttempt;
        setRuntimeStatusRefreshRequest((current) => current + 1);
      },
      nextAttempt === 1 ? 5_000 : 15_000,
    );
    return () => window.clearTimeout(timer);
  }, [currentUser, workerBlockingMessage, workerStatusPending]);

  useEffect(() => {
    if (!currentUser || !workerBlockingMessage) return undefined;

    const retryWhenOnline = () => handleRefreshRuntimeStatus();
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") {
        handleRefreshRuntimeStatus();
      }
    };
    window.addEventListener("online", retryWhenOnline);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retryWhenOnline);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [currentUser, handleRefreshRuntimeStatus, workerBlockingMessage]);
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
    retry: retryJobSubscription,
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
        knownInputImagePrivacyBlock: isInputImagePrivacyFailure(
          scene.video.errorMessage,
        ),
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
  const estimateProfileFingerprint = estimateProfiles
    .map((profile) => `${profile.key}:${profile.sceneCount}`)
    .sort()
    .join("|");
  const stableEstimateProfiles = useMemo(() => {
    if (
      estimateProfilesCacheRef.current?.fingerprint ===
      estimateProfileFingerprint
    ) {
      return estimateProfilesCacheRef.current.profiles;
    }
    estimateProfilesCacheRef.current = {
      fingerprint: estimateProfileFingerprint,
      profiles: estimateProfiles,
    };
    return estimateProfiles;
  }, [estimateProfileFingerprint, estimateProfiles]);
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
  const generatedVideoCount = storyboard.scenes.filter((scene) =>
    Boolean(scene.video.videoUrl),
  ).length;
  const imageDesignReadyCount = storyboard.scenes.filter((scene) =>
    Boolean(scene.imagePrompt.trim() || scene.visualPrompt.trim()),
  ).length;
  const videoDesignReadyCount = storyboard.scenes.filter((scene) =>
    Boolean(
      scene.video.motionPrompt.trim() ||
      scene.narrativeBeat.trim() ||
      scene.cameraDirection.trim(),
    ),
  ).length;
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
    if (!stableEstimateProfiles.length) return null;
    let total = 0;
    for (const profile of stableEstimateProfiles) {
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
  }, [stableEstimateProfiles, estimatesByProfile, pendingSceneCount]);
  const pricingCheckPending =
    pendingSceneCount > 0 &&
    !estimateError &&
    estimatesByProfile.size < stableEstimateProfiles.length;
  const hasUnknownProfilePricing =
    pendingSceneCount > 0 && !pricingCheckPending && projectedCost === null;
  const maxBudgetUsd = storyboard.videoProduction.maxBudgetUsd;
  const budgetExceeded =
    projectedCost !== null &&
    maxBudgetUsd !== null &&
    projectedCost > maxBudgetUsd;
  const unknownPricingBlocked =
    hasUnknownProfilePricing && !storyboard.videoProduction.allowUnknownPricing;
  const representativeEstimate = useMemo(() => {
    const preferredProfile = stableEstimateProfiles.find(
      (profile) => profile.audioMode === estimateAudioMode,
    );
    return (
      (preferredProfile
        ? estimatesByProfile.get(preferredProfile.key)
        : undefined) ||
      stableEstimateProfiles
        .map((profile) => estimatesByProfile.get(profile.key))
        .find((profileEstimate): profileEstimate is VideoStudioEstimate =>
          Boolean(profileEstimate),
        ) ||
      null
    );
  }, [estimateAudioMode, estimatesByProfile, stableEstimateProfiles]);
  const creditEstimate = useMemo(
    () =>
      Array.from(estimatesByProfile.values()).find(
        (profileEstimate) => profileEstimate.credit.state === "available",
      ) ||
      representativeEstimate ||
      Array.from(estimatesByProfile.values())[0] ||
      null,
    [estimatesByProfile, representativeEstimate],
  );
  const remainingCreditUsd = creditEstimate?.credit.remainingUsd ?? null;
  const creditBalanceRestricted =
    creditEstimate?.credit.message?.includes("관리자에게만 표시") === true;
  const sceneCreditBlocker = useMemo(() => {
    const blockers = Array.from(estimatesByProfile.values()).filter(
      (profileEstimate) => profileEstimate.canSubmit === false,
    );
    return blockers.reduce<VideoStudioEstimate | null>(
      (highest, profileEstimate) =>
        (profileEstimate.credit.requiredUsd ?? 0) >
        (highest?.credit.requiredUsd ?? 0)
          ? profileEstimate
          : highest,
      null,
    );
  }, [estimatesByProfile]);
  const sceneCreditBlocked = sceneCreditBlocker !== null;
  const sceneRequiredCreditUsd = sceneCreditBlocker?.credit.requiredUsd ?? null;
  const creditPlanBlocked =
    remainingCreditUsd !== null &&
    projectedCost !== null &&
    projectedCost > 0 &&
    remainingCreditUsd < projectedCost;
  const creditBlocked = creditPlanBlocked || sceneCreditBlocked;
  const creditBlockScope = creditPlanBlocked
    ? "plan"
    : sceneCreditBlocked
      ? "scene"
      : null;
  const creditRequiredUsd =
    creditBlockScope === "plan" ? projectedCost : sceneRequiredCreditUsd;
  const creditShortfallUsd =
    remainingCreditUsd !== null && creditRequiredUsd !== null
      ? Math.max(0, creditRequiredUsd - remainingCreditUsd)
      : null;
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
  useEffect(() => {
    onRequestPendingChange?.(isPreparingProject || Boolean(queueingSceneId) || isFinalizing || isRecoveringAutomation);
    return () => onRequestPendingChange?.(false);
  }, [onRequestPendingChange, isPreparingProject, queueingSceneId, isFinalizing, isRecoveringAutomation]);

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
        dialogueTiming.tone !== "over" &&
        !hasAmbiguousStoryboardVoiceSelection(
          storyboard.videoProduction,
          scene.video,
        )
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
    if (!currentUser || !sceneCount || !stableEstimateProfiles.length) {
      setEstimatesByProfile(new Map());
      setEstimateError(null);
      return undefined;
    }

    setEstimatesByProfile(new Map());
    setEstimateError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const forceModelRefresh = forceModelCatalogRefreshRef.current;
          forceModelCatalogRefreshRef.current = false;
          const loadEstimate = async (
            profile: VideoEstimateProfile,
            forceRefresh = false,
          ) => ({
            profile,
            estimate: await withFirebaseAuthRetry(currentUser, (authToken) =>
              videoStudioService.getVideoEstimate({
                authToken,
                duration: Math.min(15, Math.max(1, profile.duration)),
                resolution,
                aspectRatio: storyboard.aspectRatio as VideoStudioAspectRatio,
                qualityMode: storyboard.videoProduction.qualityMode,
                hasReferenceImage: profile.hasReferenceImage,
                hasEndReferenceImage: profile.hasEndReferenceImage,
                hasVisualReferenceImages: profile.hasVisualReferenceImages,
                audioMode: profile.audioMode,
                forceModelRefresh: forceRefresh,
                knownInputImagePrivacyBlock: profile.knownInputImagePrivacyBlock,
                signal: controller.signal,
              }),
            ),
          });
          const settledEstimates = forceModelRefresh
            ? [
                ...(await settleWithConcurrency(
                  stableEstimateProfiles.slice(0, 1),
                  1,
                  (profile) => loadEstimate(profile, true),
                )),
                ...(await settleWithConcurrency(
                  stableEstimateProfiles.slice(1),
                  VIDEO_ESTIMATE_REQUEST_CONCURRENCY,
                  (profile) => loadEstimate(profile),
                )),
              ]
            : await settleWithConcurrency(
                stableEstimateProfiles,
                VIDEO_ESTIMATE_REQUEST_CONCURRENCY,
                (profile) => loadEstimate(profile),
              );
          if (controller.signal.aborted) return;
          const nextEstimates = settledEstimates.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
          );
          const failedProfileCount =
            settledEstimates.length - nextEstimates.length;
          setEstimatesByProfile(
            new Map(
              nextEstimates.map(({ profile, estimate: nextEstimate }) => [
                profile.key,
                nextEstimate,
              ]),
            ),
          );
          setEstimateError(
            failedProfileCount > 0
              ? `${failedProfileCount}개 장면 조건의 예상 비용을 확인하지 못했습니다. 해당 장면은 생성 전 다시 확인합니다.`
              : null,
          );
        } catch (error) {
          if (controller.signal.aborted) return;
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
    modelCatalogRefreshRequest,
    resolution,
    sceneCount,
    storyboard.aspectRatio,
    storyboard.videoProduction.qualityMode,
    stableEstimateProfiles,
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
        const completedOutput =
          job.status === "completed" && job.clipId && job.resultVideoUrl
            ? { clipId: job.clipId, videoUrl: job.resultVideoUrl }
            : null;
        const completedOutputMissing = job.status === "completed" && !completedOutput;
        const nextVideo: StoryboardVideoScene = {
          ...scene.video,
          status: sceneStatusFromJob(job, scene.video.status, jobStatusClock),
          clipId: completedOutput?.clipId ?? scene.video.clipId,
          videoUrl: completedOutput?.videoUrl ?? scene.video.videoUrl,
          lastFrameUrl: completedOutput
            ? job.resultFrameUrl || null
            : scene.video.lastFrameUrl,
          artifactId: completedOutput?.clipId ?? scene.video.artifactId,
          replacedClipId:
            completedOutput &&
            scene.video.clipId &&
            completedOutput.clipId !== scene.video.clipId
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
            (completedOutputMissing
              ? "장면 영상 작업에 재생 가능한 결과가 없습니다. 작업 상태를 확인한 뒤 다시 시도해 주세요."
              : null) ||
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
        const completedOutput =
          finalStatus === "completed" && finalJob.clipId && finalJob.resultVideoUrl
            ? { clipId: finalJob.clipId, videoUrl: finalJob.resultVideoUrl }
            : null;
        const nextProduction = {
          ...videoProduction,
          finalStatus,
          finalClipId: completedOutput?.clipId ?? videoProduction.finalClipId,
          finalVideoUrl:
            completedOutput?.videoUrl ?? videoProduction.finalVideoUrl,
          finalArtifactId: completedOutput?.clipId ?? videoProduction.finalArtifactId,
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
          await withFirebaseAuthRetry(currentUser, (authToken) =>
            videoStudioService.deleteClip({
              authToken,
              clipId: replacedClipId,
            }),
          );
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
          console.error(
            "[StoryboardVideo] replaced clip cleanup failed:",
            error,
          );
          const clipRecordAlreadyRemoved =
            error instanceof Error &&
            error.message.toLowerCase().includes("no longer exists");
          onChange((current) => ({
            ...current,
            cleanupStatus: "retry",
            cleanupErrorMessage:
              "교체된 장면 영상 파일 정리가 필요합니다. 파일 관리에서 다시 시도해 주세요.",
            scenes: clipRecordAlreadyRemoved
              ? current.scenes.map((item) =>
                  item.video.replacedClipId === replacedClipId
                    ? {
                        ...item,
                        video: { ...item.video, replacedClipId: null },
                      }
                    : item,
                )
              : current.scenes,
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
          await withFirebaseAuthRetry(currentUser, (authToken) =>
            videoStudioService.deleteClip({
              authToken,
              clipId: replacedFinalClipId,
            }),
          );
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
          console.error(
            "[StoryboardVideo] previous final cleanup failed:",
            error,
          );
          const clipRecordAlreadyRemoved =
            error instanceof Error &&
            error.message.toLowerCase().includes("no longer exists");
          onChange((current) => ({
            ...current,
            cleanupStatus: "retry",
            cleanupErrorMessage:
              "교체된 이전 완성본 파일 정리가 필요합니다. 파일 관리에서 다시 시도해 주세요.",
            videoProduction: clipRecordAlreadyRemoved
              ? {
                  ...current.videoProduction,
                  replacedFinalClipId: null,
                }
              : current.videoProduction,
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

  const handleAddVoiceProfile = useCallback(() => {
    if (projectBusy) return;
    onChange((current) => {
      if (current.videoProduction.voiceProfiles.length >= 12) return current;
      const voiceProfile = createStoryboardVoiceProfile(
        current.videoProduction.voiceProfiles.length,
        current.videoProduction.voiceDirection,
      );
      return {
        ...current,
        videoProduction: {
          ...current.videoProduction,
          voiceProfiles: [
            ...current.videoProduction.voiceProfiles,
            voiceProfile,
          ],
        },
      };
    });
  }, [onChange, projectBusy]);

  const handleVoiceProfilePatch = useCallback(
    (profileId: string, patch: Partial<StoryboardVoiceProfile>) => {
      if (projectBusy) return;
      onChange((current) => {
        const voiceProfiles = current.videoProduction.voiceProfiles.map(
          (profile) => {
            if (profile.id !== profileId) return profile;
            return {
              ...profile,
              ...patch,
              id: profile.id,
              characterName:
                patch.characterName?.trim() || profile.characterName,
              voiceDescription:
                patch.voiceDescription?.trim() || profile.voiceDescription,
              speakingStyle:
                patch.speakingStyle === undefined
                  ? profile.speakingStyle
                  : patch.speakingStyle.trim(),
            };
          },
        );
        return {
          ...current,
          videoProduction: {
            ...current.videoProduction,
            voiceProfiles,
          },
          scenes: current.scenes.map((scene) =>
            scene.video.voiceProfileId === profileId
              ? {
                  ...scene,
                  video: {
                    ...scene.video,
                    status: scene.video.videoUrl ? "brief" : scene.video.status,
                    approvedAt: null,
                  },
                }
              : scene,
          ),
        };
      });
    },
    [onChange, projectBusy],
  );

  const handleRemoveVoiceProfile = useCallback(
    (profileId: string) => {
      if (projectBusy) return;
      onChange((current) => ({
        ...current,
        videoProduction: {
          ...current.videoProduction,
          voiceProfiles: current.videoProduction.voiceProfiles.filter(
            (profile) => profile.id !== profileId,
          ),
        },
        scenes: current.scenes.map((scene) =>
          scene.video.voiceProfileId === profileId
            ? {
                ...scene,
                video: {
                  ...scene.video,
                  voiceProfileId: null,
                  status: scene.video.videoUrl ? "brief" : scene.video.status,
                  approvedAt: null,
                },
              }
            : scene,
        ),
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

  const ensureProject = useCallback((): Promise<string> => {
    const existingPromise = ensureProjectPromiseRef.current;
    if (existingPromise) return existingPromise;

    const operation = (async (): Promise<string> => {
      if (!currentUser) throw new Error("로그인이 필요합니다.");
      if (!storyboardId) {
        throw new Error("스토리보드를 먼저 저장한 뒤 영상을 제작해 주세요.");
      }
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
          projectId: `storyboard_${currentUser.uid}_${storyboardId}`,
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
    })();
    ensureProjectPromiseRef.current = operation;
    const clearOperation = () => {
      if (ensureProjectPromiseRef.current === operation) {
        ensureProjectPromiseRef.current = null;
      }
    };
    void operation.then(clearOperation, clearOperation);
    return operation;
  }, [
    currentUser,
    onChange,
    storyboardId,
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
      if (!storyboardId) {
        throw new Error("스토리보드를 먼저 저장한 뒤 영상을 제작해 주세요.");
      }
      const currentStoryboardId = storyboardId;
      if (workerStatusPending) {
        throw new Error(
          "영상 처리 서버의 안전 버전을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      if (workerBlockingMessage) {
        throw new Error(workerBlockingMessage);
      }
      const {
        scene,
        automationRunId,
        previousLastFrameUrl,
        visualInputMode = "standard",
      } = params;
      if (
        scene.video.jobId &&
        (!jobSubscriptionReady || jobSubscriptionError)
      ) {
        throw new Error(
          jobSubscriptionError
            ? "기존 영상 작업 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."
            : "기존 영상 작업 기록을 확인하고 있습니다. 확인이 끝난 뒤 다시 시도해 주세요.",
        );
      }
      const omitVisualInputs = visualInputMode === "text-only";
      const audioMode = resolveStoryboardVideoAudioMode(scene.video);
      if (audioMode === "dialogue" && !scene.dialogueOrCaption.trim()) {
        throw new Error(`${scene.order}번 장면의 말할 대사를 입력해 주세요.`);
      }
      if (
        audioMode === "dialogue" &&
        hasAmbiguousStoryboardVoiceSelection(
          storyboard.videoProduction,
          scene.video,
        )
      ) {
        throw new Error(
          `${scene.order}번 장면에서 말하는 캐릭터를 선택해 주세요.`,
        );
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
      const voiceLock = buildStoryboardVoiceLock(
        resolveStoryboardVoiceProfile(
          storyboard.videoProduction,
          scene.video,
        ),
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
        voiceLock,
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
      const videoRequest = {
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
        endReferenceImage:
          !omitVisualInputs && useNextSceneAsEndFrame
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
          audioMode === "dialogue"
            ? normalizeStoryboardSpokenDialogue(scene.dialogueOrCaption)
            : undefined,
        forceRealRun: true,
      } satisfies Omit<RunStudioJobInput, "authToken" | "idempotencyKey">;
      const idempotencyKey =
        await buildStoryboardSceneVideoIdempotencyKey({
          storyboardId: currentStoryboardId,
          sceneId: scene.id,
          videoDesignRevision: scene.videoDesignRevision,
          previousIdentity:
            scene.video.jobId ||
            scene.video.artifactId ||
            scene.video.clipId ||
            scene.video.replacedClipId ||
            "initial",
          visualInputMode,
          request: videoRequest,
        });
      const queued = await withFirebaseAuthRetry(currentUser, (authToken) =>
        videoStudioService.submitStudioJob({
          authToken,
          idempotencyKey,
          ...videoRequest,
        }),
      );

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
    [
      currentUser,
      ensureProject,
      jobSubscriptionError,
      jobSubscriptionReady,
      onChange,
      referenceAssets,
      storyboard,
      storyboardId,
      workerBlockingMessage,
      workerStatusPending,
    ],
  );

  const handleGenerateScene = useCallback(
    async (
      scene: ImageStoryboardScene,
      options?: { forceNewProviderRequest?: boolean },
    ) => {
      if (!currentUser || projectBusy) return;
      if (workerGenerationBlocked) {
        toast.error(
          workerBlockingMessage ||
            "영상 처리 서버의 안전 버전을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      if (
        scene.video.jobId &&
        (!jobSubscriptionReady || jobSubscriptionError)
      ) {
        toast.error(
          jobSubscriptionError
            ? "기존 영상 작업 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."
            : "기존 영상 작업 기록을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      const existingJob = scene.video.jobId
        ? jobsById.get(scene.video.jobId)
        : undefined;
      if (
        !options?.forceNewProviderRequest &&
        existingJob &&
        canReuseStoryboardVideoProviderJob(existingJob)
      ) {
        setQueueingSceneId(scene.id);
        try {
          await withFirebaseAuthRetry(currentUser, (authToken) =>
            videoStudioService.updateStudioJob({
              authToken,
              jobId: existingJob.id,
              action: "requeue",
              requireProviderResume: true,
            }),
          );
          patchSceneVideo(scene.id, {
            status: "queued",
            errorMessage: null,
          });
          const recovery = describeStoryboardVideoRecovery({
            errorMessage: scene.video.errorMessage,
            job: existingJob,
          });
          toast.success(recovery.title, {
            description: recovery.description,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "완료된 영상 결과의 복구를 시작하지 못했습니다.";
          patchSceneVideo(scene.id, {
            status: "failed",
            errorMessage: message,
          });
          toast.error("영상 복구를 시작하지 못했습니다.", {
            description: message,
          });
        } finally {
          setQueueingSceneId(null);
        }
        return;
      }
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
    [
      currentUser,
      jobSubscriptionError,
      jobSubscriptionReady,
      jobsById,
      patchSceneVideo,
      projectBusy,
      storyboard,
      submitSceneJob,
      workerBlockingMessage,
      workerGenerationBlocked,
    ],
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
      if (!storyboardId) {
        throw new Error("스토리보드를 먼저 저장한 뒤 최종본을 만들어 주세요.");
      }
      const currentStoryboardId = storyboardId;
      const projectId = await ensureProject();
      const pendingAssemblyManifest = createStoryboardFinalAssemblyManifest(
        storyboard,
        params.clipIds,
        resolution,
      );
      const scenesByClipId = new Map(
        storyboard.scenes.flatMap((scene) =>
          scene.video.clipId ? [[scene.video.clipId, scene] as const] : [],
        ),
      );
      const mergeRequest = {
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
      } satisfies Omit<RunStudioJobInput, "authToken" | "idempotencyKey">;
      const idempotencyKey =
        await buildStoryboardFinalVideoIdempotencyKey({
          storyboardId: currentStoryboardId,
          assemblyFingerprint: pendingAssemblyManifest.fingerprint,
          resolution,
          previousIdentity:
            storyboard.videoProduction.finalJobId ||
            storyboard.videoProduction.finalArtifactId ||
            storyboard.videoProduction.finalClipId ||
            "initial",
          request: mergeRequest,
        });
      const queued = await withFirebaseAuthRetry(currentUser, (authToken) =>
        videoStudioService.submitStudioJob({
          authToken,
          idempotencyKey,
          ...mergeRequest,
        }),
      );
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
      storyboardId,
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
    if (pendingSceneCount > 0 && workerGenerationBlocked) {
      toast.error(
        workerBlockingMessage ||
          "영상 처리 서버의 안전 버전을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
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
    if (creditBlocked) {
      toast.error(
        creditBlockScope === "plan"
          ? "OpenRouter 잔액이 전체 제작 예상 비용보다 부족합니다."
          : "OpenRouter 잔액이 일부 장면의 예상 비용보다 부족합니다.",
        {
          description: `${creditBlockScope === "plan" ? "전체 제작 예상" : "가장 높은 장면 예상"} ${formatUsd(creditRequiredUsd)} · 사용 가능 ${formatUsd(remainingCreditUsd)} · 부족 ${formatUsd(creditShortfallUsd)}`,
        },
      );
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
    creditBlocked,
    creditBlockScope,
    creditRequiredUsd,
    creditShortfallUsd,
    currentUser,
    ensureProject,
    unknownPricingBlocked,
    onChange,
    pendingSceneCount,
    pricingCheckPending,
    qualityReadiness.score,
    remainingCreditUsd,
    reusableSceneIds,
    storyboard.scenes,
    storyboard.videoProduction.qualityMode,
    workerBlockingMessage,
    workerGenerationBlocked,
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
    if (!resumeMerge && workerGenerationBlocked) {
      toast.error(
        workerBlockingMessage ||
          "영상 처리 서버의 안전 버전을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
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
        await withFirebaseAuthRetry(currentUser, (authToken) =>
          videoStudioService.updateStudioJob({
            authToken,
            jobId: currentSceneJob.id,
            action: "requeue",
            requireProviderResume: true,
          }),
        );
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
    workerBlockingMessage,
    workerGenerationBlocked,
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
      // A Firestore listener failure does not mean the durable worker job
      // failed. Keep the run resumable while the hook reconnects, otherwise a
      // brief network interruption permanently turns a healthy render red.
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
          await withFirebaseAuthRetry(currentUser, (authToken) =>
            videoStudioService.updateStudioJob({
              authToken,
              jobId: finalJobId,
              action: "requeue",
            }),
          );
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
    const isVideoCanvasValidationFailureForScene =
      isVideoCanvasValidationFailure(sceneJob.errorMessage || sceneJob.message);
    const isProviderOutputUnavailableForScene =
      isProviderOutputUnavailableFailure(
        sceneJob.errorMessage || sceneJob.message,
        sceneJob,
      );
    const isProviderOutputAccessBlockedForScene =
      isProviderOutputAccessFailure(
        sceneJob.errorMessage || sceneJob.message,
        sceneJob,
      );
    if (sceneJob.status === "failed" && workerGenerationBlocked) {
      return;
    }
    if (
      sceneJob.status === "failed" &&
      !isPermanentVisualPrivacyFailure &&
      !isVideoCanvasValidationFailureForScene &&
      !isProviderOutputUnavailableForScene &&
      !isProviderOutputAccessBlockedForScene &&
      attemptCount <= AUTOMATION_RETRY_LIMIT &&
      automaticRetryCount < AUTOMATION_RETRY_LIMIT
    ) {
      const retryVersion = timestampMillis(sceneJob.updatedAt) ?? attemptCount;
      runAction(`scene-retry:${sceneJob.id}:${retryVersion}`, async () => {
        automationRetryCountsByJobRef.current.set(
          sceneJob.id,
          automaticRetryCount + 1,
        );
        await withFirebaseAuthRetry(currentUser, (authToken) =>
          videoStudioService.updateStudioJob({
            authToken,
            jobId: sceneJob.id,
            action: "requeue",
            requireProviderResume:
              canReuseStoryboardVideoProviderJob(sceneJob),
          }),
        );
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
    workerGenerationBlocked,
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
    automationStatus === "paused" ||
    (automationStatus === "failed" &&
      automationRecovery?.canReuseProviderJob === true);
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
  const firstMissingImageSceneId =
    storyboard.scenes.find(
      (scene) => !scene.generatedImage?.url && !scene.video.lastFrameUrl,
    )?.id ?? null;
  const firstMissingVideoDesignSceneId =
    storyboard.scenes.find(
      (scene) =>
        !scene.video.motionPrompt.trim() &&
        !scene.narrativeBeat.trim() &&
        !scene.cameraDirection.trim(),
    )?.id ?? null;
  const firstMissingVideoSceneId =
    storyboard.scenes.find((scene) => !scene.video.videoUrl)?.id ?? null;
  const firstMissingApprovalSceneId =
    storyboard.scenes.find((scene) => !reusableSceneIds.has(scene.id))?.id ??
    null;
  const firstTransitionIssueSceneId =
    storyboard.scenes.slice(0, -1).find((scene, index) => {
      const nextScene = storyboard.scenes[index + 1];
      return !(
        scene.video.useNextSceneAsEndFrame && nextScene?.generatedImage?.url
      );
    })?.id ?? null;
  const focusVideoScene = useCallback(
    (sceneId: string) => {
      onActiveSceneChange(sceneId);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const target = document.getElementById(
            `storyboard-video-scene-${sceneId}`,
          );
          if (!target) return;
          const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          target.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "center",
          });
          target.focus({ preventScroll: true });
        });
      });
    },
    [onActiveSceneChange],
  );
  const canStartAutomation =
    !disabled &&
    Boolean(currentUser) &&
    sceneCount > 0 &&
    jobSubscriptionReady &&
    !jobSubscriptionError &&
    !pricingCheckPending &&
    !budgetExceeded &&
    !creditBlocked &&
    !unknownPricingBlocked &&
    (pendingSceneCount === 0 || !workerGenerationBlocked);
  const creditIssue =
    creditBlocked && pendingSceneCount > 0
      ? `영상 제작 예상 비용 중 ${formatUsd(creditShortfallUsd)}가 부족합니다. OpenRouter를 충전한 뒤 서버·잔액을 다시 확인해 주세요.`
      : null;
  const productionJourney = buildStoryboardProductionJourney({
    approvedSceneCount: readySceneCount,
    automationActive,
    automationCompletedCount,
    automationCurrentSceneIndex:
      storyboard.videoProduction.automationCurrentSceneIndex,
    automationErrorMessage:
      automationRecovery?.description ||
      storyboard.videoProduction.automationErrorMessage,
    automationProgress,
    automationStatus,
    budgetExceeded,
    canPauseAutomation,
    canOpenImageWorkspace: true,
    canResumeAutomation,
    canStartAutomation,
    creditIssue,
    finalMergeInFlight,
    firstMissingApprovalSceneId,
    firstMissingImageSceneId,
    firstMissingVideoDesignSceneId,
    firstMissingVideoSceneId,
    firstTransitionIssueSceneId,
    generatedVideoCount,
    hasCurrentFinalDelivery: isFinalDeliveryCurrent,
    hasFinalDelivery,
    imageDesignReadyCount,
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
    sceneCount,
    startFrameCount: qualityReadiness.startFrameCount,
    transitionCount: qualityReadiness.transitionCount,
    transitionReadyCount: qualityReadiness.transitionReadyCount,
    unknownPricingBlocked,
    videoDesignReadyCount,
    workerIssue:
      pendingSceneCount > 0 && qualityReadiness.startFrameCount === sceneCount
        ? workerBlockingMessage
        : null,
    workerStatusPending:
      pendingSceneCount > 0 &&
      qualityReadiness.startFrameCount === sceneCount &&
      workerStatusPending,
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
    switch (productionJourney.primaryIntent) {
      case "open-image-workspace":
        onOpenImageWorkspace();
        return;
      case "focus-video-design":
        if (productionJourney.primarySceneId) {
          focusVideoScene(productionJourney.primarySceneId);
        }
        return;
      case "resume-automation":
        if (pendingSceneCount === 0) { void handleResumeAutomation(); return; }
        requestVideoAction("확인하고 이어 만들기", `승인 영상 ${reusableSceneIds.size}개 재사용 · 남은 ${pendingSceneCount}개 장면 제작. 기존 공급자 작업이 있으면 먼저 재조회합니다. 이후 미완료 장면에는 새 생성 비용이 생길 수 있습니다.`, formatUsd(projectedCost), { kind: "resume" }, estimatesByProfile);
        return;
      case "remerge-final":
        void handleFinalMerge();
        return;
      case "download-final":
        handleFinalDownload();
        return;
      case "start-automation":
        if (pendingSceneCount === 0) { void handleStartAutomation(); return; }
        requestVideoAction(`${pendingSceneCount}개 장면 제작 시작`, `승인 영상 ${reusableSceneIds.size}개 재사용 · 새 생성 ${pendingSceneCount}개. 실패 장면 자동 재시도는 새 요청 비용이 생길 수 있습니다.`, formatUsd(projectedCost), { kind: "start" }, estimatesByProfile);
        return;
    }
  }, [
    automationActive,
    finalMergeInFlight,
    focusVideoScene,
    handleFinalDownload,
    handleFinalMerge,
    handleResumeAutomation,
    handleStartAutomation,
    isRecoveringAutomation,
    onOpenImageWorkspace,
    productionJourney.primaryIntent,
    productionJourney.primarySceneId,
    pendingSceneCount,
    projectedCost,
    requestVideoAction,
    estimatesByProfile,
    reusableSceneIds.size,
  ]);

  const handleJourneyStepSelect = useCallback(
    (target: StoryboardProductionJourneyTarget, sceneId?: string | null) => {
      if (target === "image-design" || target === "image-generation") {
        onOpenImageWorkspace();
        return;
      }
      if (target === "final-delivery") {
        const finalDelivery = document.getElementById(
          "storyboard-final-delivery",
        );
        const targetElement =
          finalDelivery ||
          document.getElementById("storyboard-production-primary-action");
        if (!targetElement) return;
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        targetElement.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "center",
        });
        targetElement.focus({ preventScroll: true });
        return;
      }
      const targetSceneId =
        sceneId ||
        (target === "video-design"
          ? firstMissingVideoDesignSceneId ||
            nextQualityAction?.scene.id ||
            storyboard.scenes[selectedSceneIndex]?.id
          : firstMissingVideoSceneId ||
            firstMissingApprovalSceneId ||
            storyboard.scenes[selectedSceneIndex]?.id);
      if (targetSceneId) focusVideoScene(targetSceneId);
    },
    [
      firstMissingApprovalSceneId,
      firstMissingVideoDesignSceneId,
      firstMissingVideoSceneId,
      focusVideoScene,
      nextQualityAction?.scene.id,
      onOpenImageWorkspace,
      selectedSceneIndex,
      storyboard.scenes,
    ],
  );

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
        <HeaderActions>
          <AutomaticBadge>
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
            자동 품질 관리 켜짐
          </AutomaticBadge>
        </HeaderActions>
      </ProductionHeader>

      {workerStatusPending ? (
        <CreditReadiness $blocked={false} role="status" aria-live="polite">
          <div>
            <span>영상 서버 확인 중</span>
            <strong>추가 비용 전에 안전 버전을 확인하고 있습니다.</strong>
            <small>확인이 끝나면 영상 제작 버튼이 자동으로 활성화됩니다.</small>
          </div>
        </CreditReadiness>
      ) : workerBlockingMessage ? (
        <CreditReadiness $blocked role="alert">
          <div>
            <span>영상 제작 일시 중지</span>
            <strong>영상 처리 서버 연결을 다시 확인해 주세요.</strong>
            <small>
              장면 설계와 편집은 계속할 수 있으며, 안전한 처리 서버가 확인되기
              전에는 새 유료 영상 요청과 복구 요청을 보내지 않습니다.
            </small>
            <small>{workerBlockingMessage}</small>
          </div>
          <RuntimeStatusRetryButton
            type="button"
            onClick={handleRefreshRuntimeStatus}
            aria-label="영상 처리 서버 상태 다시 확인"
          >
            <i className="fas fa-rotate" aria-hidden="true" /> 서버 다시 확인
          </RuntimeStatusRetryButton>
        </CreditReadiness>
      ) : null}

      {creditIssue ? (
        <CreditReadiness $blocked role="alert">
          <div>
            <span>영상 제작 잔액 부족</span>
            <strong>{creditIssue}</strong>
            <small>
              충전 전에는 새 유료 영상 요청만 막고, 장면 설계·편집과 기존 결과
              확인은 그대로 사용할 수 있습니다.
            </small>
          </div>
          <a
            href="https://openrouter.ai/settings/credits"
            target="_blank"
            rel="noreferrer"
          >
            <i
              className="fas fa-arrow-up-right-from-square"
              aria-hidden="true"
            />
            OpenRouter 충전
          </a>
        </CreditReadiness>
      ) : null}

      <StoryboardProductionJourney
        model={productionJourney}
        onPause={handlePauseAutomation}
        onPrimaryAction={handleJourneyPrimaryAction}
        onSelectScene={focusVideoScene}
        onSelectStep={handleJourneyStepSelect}
      />

      <div className="production-cost-summary" role="status">
        승인 영상 {reusableSceneIds.size}개 재사용 · 남은 제작 {pendingSceneCount}개 · 예상 추가 비용 {formatUsd(projectedCost)}
        <small>예산 상한 {maxBudgetUsd === null ? "설정 안 됨" : formatUsd(maxBudgetUsd)} · 예상액이며 실제 비용은 요청 결과로 확정됩니다.</small>
      </div>

      {pendingVideoAction ? (
        <RecoveryNotice id="storyboard-video-approval" $safe $stacked tabIndex={-1} aria-labelledby="storyboard-video-approval-title">
          <div>
            <strong id="storyboard-video-approval-title">영상 제작 내용 확인</strong>
            <p>{pendingVideoAction.description}</p>
            <p>예상 추가 비용 {pendingVideoAction.action.sceneId ? confirmationQuote.loading ? "확인 중…" : formatUsd(confirmationQuote.estimate?.estimatedCostUsd ?? null) : pendingVideoAction.estimate} · 예산 상한 {maxBudgetUsd === null ? "설정 안 됨" : formatUsd(maxBudgetUsd)}</p>
            {confirmationQuote.error ? <p role="alert">{confirmationQuote.error} <SecondaryAutomationButton type="button" onClick={() => setConfirmationQuoteRetry((value) => value + 1)}>견적 다시 확인</SecondaryAutomationButton></p> : null}
            <p>장면 설명·대사와 필요한 참조 이미지를 OpenRouter 영상 공급자에게 전송합니다. 가격 미확정 항목과 재시도는 실제 비용이 달라질 수 있습니다. 지금은 새 생성 요청이 시작되지 않았습니다.</p>
            <label><input type="checkbox" checked={videoActionAccepted} disabled={Boolean(pendingVideoAction.action.sceneId && (confirmationQuote.loading || confirmationQuote.error || !confirmationQuote.estimate))} onChange={(event) => setVideoActionAccepted(event.target.checked)} /> 생성 범위·외부 전송·추가 비용을 확인했습니다.</label>
            <AutomationActions>
              <SecondaryAutomationButton type="button" onClick={() => { setPendingVideoAction(null); setVideoActionAccepted(false); }}>취소</SecondaryAutomationButton>
              <PrimaryAutomationButton type="button" disabled={!videoActionAccepted || projectBusy || Boolean(pendingVideoAction.action.sceneId && (confirmationQuote.loading || confirmationQuote.error || !confirmationQuote.estimate))} onClick={() => void confirmVideoAction()}>{pendingVideoAction.label}</PrimaryAutomationButton>
            </AutomationActions>
          </div>
        </RecoveryNotice>
      ) : null}

      {storyboard.scenes.some((scene) => scene.video.status === "failed") || jobSubscriptionError || storyboard.videoProduction.finalErrorMessage ? (
        <RecoveryNotice id="storyboard-recovery-summary" tabIndex={-1} role="alert" $safe={false} $stacked>
          <div>
            <strong>{jobSubscriptionError ? "작업 상태 연결 확인 필요" : storyboard.scenes.some((scene) => scene.video.status === "failed") ? "제작이 멈춘 장면이 있습니다" : "완성본 조립 확인 필요"}</strong>
            <p>{jobSubscriptionError || (storyboard.scenes.some((scene) => scene.video.status === "failed") ? "장면에서 원인을 확인하세요. 기존 요청의 결과 재조회와 새 비용이 드는 재제작을 구분해 안내합니다." : "기존 승인 영상은 유지됩니다. 작업 상태에서 조립 오류를 확인하세요.")}</p>
            {storyboard.scenes.filter((scene) => scene.video.status === "failed").map((scene) => {
              const recovery = describeStoryboardVideoRecovery({ errorMessage: scene.video.errorMessage, job: scene.video.jobId ? jobsById.get(scene.video.jobId) : undefined });
              return <div key={scene.id} className="recovery-scene"><strong>{scene.order}번 · {scene.title}</strong><p>{recovery.description}</p><SecondaryAutomationButton type="button" onClick={() => focusVideoScene(scene.id)}>{scene.order}번 장면 원인·해결 보기</SecondaryAutomationButton></div>;
            })}
            {jobSubscriptionError ? <SecondaryAutomationButton type="button" onClick={retryJobSubscription}>작업 상태 다시 연결</SecondaryAutomationButton> : null}
          </div>
        </RecoveryNotice>
      ) : null}

      <ProductionDetails>
        <summary>
          <span>
            <i className="fas fa-sliders" aria-hidden="true" /> 고급
            설정·비용·기술 정보
          </span>
          <small>
            {qualityReadiness.score}점 · 예상 {formatUsd(projectedCost)}
          </small>
          <i className="fas fa-chevron-down" aria-hidden="true" />
        </summary>
        <HeaderActions>
          <ModelCatalogRefreshButton
            type="button"
            onClick={() => {
              forceModelCatalogRefreshRef.current = true;
              runtimeStatusAutoRetryCountRef.current = 0;
              setRuntimeStatusRefreshRequest((current) => current + 1);
              setModelCatalogRefreshRequest((current) => current + 1);
            }}
            disabled={!currentUser || projectBusy}
            aria-busy={pricingCheckPending || workerStatusPending}
            title="영상 모델·가격·잔액과 처리 서버 상태를 다시 확인합니다"
          >
            <i className="fas fa-rotate" aria-hidden="true" />
            모델·서버·잔액 새로고침
          </ModelCatalogRefreshButton>
        </HeaderActions>
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
            aria-busy={!representativeEstimate && !estimateError}
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
                  : representativeEstimate
                    ? `장면 조건별 합산 · 대표 ${representativeEstimate.resolvedResolution} · ${representativeEstimate.resolvedDuration}초`
                    : estimateError || "가격표 확인 중"}
              </small>
            </Metric>
            <Metric>
              <span>현재 채택 영상 비용</span>
              <strong>{formatUsd(actualCost)}</strong>
              <small>
                {readySceneCount}/{storyboard.scenes.length} 장면 완료
              </small>
            </Metric>
            <Metric>
              <span>제작 가능 잔액</span>
              <strong>
                {creditBalanceRestricted
                  ? "관리자 전용"
                  : formatUsd(remainingCreditUsd)}
              </strong>
              <small>
                {creditBalanceRestricted
                  ? creditEstimate?.credit.message
                  : creditEstimate?.credit.state === "available"
                    ? creditRequiredUsd !== null
                      ? `${creditBlockScope === "scene" ? "가장 높은 장면 예상" : "이번 제작 예상"} ${formatUsd(creditRequiredUsd)}`
                      : "예상 비용을 계산하면 전체 제작 가능 여부를 확인합니다."
                    : creditEstimate?.credit.message ||
                      "OpenRouter 잔액을 확인하는 중입니다."}
              </small>
            </Metric>
            <Metric>
              <span>모델·정책 기준</span>
              <strong>
                {representativeEstimate
                  ? representativeEstimate.catalog.source === "live"
                    ? "실시간 확인"
                    : "최근 확인"
                  : "확인 중"}
              </strong>
              <small>
                {representativeEstimate
                  ? [
                      representativeEstimate.catalogModelCount,
                      "개 중 ",
                      representativeEstimate.compatibleModelCount,
                      "개 호환",
                    ].join("")
                  : estimateError || "OpenRouter 카탈로그를 확인합니다."}
              </small>
            </Metric>
          </MetricsGrid>
          {!creditBlocked &&
          creditEstimate?.credit.state === "unavailable" ? (
            <CreditReadiness
              $blocked={false}
              role="status"
              aria-live="polite"
            >
              <div>
                <span>CREDIT CHECK</span>
                <strong>잔액을 확인하지 못했습니다.</strong>
                <small>
                  {creditEstimate.credit.message ||
                    "생성 시 OpenRouter에서 잔액을 최종 확인합니다."}
                </small>
              </div>
              <a
                href="https://openrouter.ai/settings/credits"
                target="_blank"
                rel="noreferrer"
              >
                <i
                  className="fas fa-arrow-up-right-from-square"
                  aria-hidden="true"
                />
                OpenRouter 충전
              </a>
            </CreditReadiness>
          ) : null}
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
                  onClick={() => focusVideoScene(scene.id)}
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

      <ProductionDetails
        id="storyboard-production-recovery-details"
        open={
          automationStatus === "failed" ||
          Boolean(storyboard.videoProduction.automationErrorMessage) ||
          Boolean(storyboard.videoProduction.finalErrorMessage) ||
          Boolean(jobSubscriptionError) ||
          Boolean(workerBlockingMessage)
        }
      >
        <summary>
          <span>
            <i className="fas fa-shield-heart" aria-hidden="true" /> 작업
            상태·오류 복구
          </span>
          <small>
            {automationStatus === "failed"
              ? "확인이 필요합니다"
              : automationActive
                ? "제작 진행 중"
                : "멈췄을 때만 열기"}
          </small>
          <i className="fas fa-chevron-down" aria-hidden="true" />
        </summary>
        <StoryboardAutomationConsoleView
          primaryActionInJourney
          model={{
            allowUnknownPricing: storyboard.videoProduction.allowUnknownPricing,
            automationErrorMessage:
              storyboard.videoProduction.automationErrorMessage,
            automationProgress,
            automationRetryCount: Math.min(
              storyboard.videoProduction.automationRetryCount,
              AUTOMATION_RETRY_LIMIT,
            ),
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
            workerIssue: pendingSceneCount > 0 ? workerBlockingMessage : null,
            workerStatusPending: pendingSceneCount > 0 && workerStatusPending,
          }}
          onAllowUnknownPricingChange={handleAllowUnknownPricingChange}
          onBudgetChange={handleBudgetChange}
          onPause={handlePauseAutomation}
          onResume={() => void handleResumeAutomation()}
          onRetryJobSubscription={retryJobSubscription}
        />
      </ProductionDetails>

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
            voiceProfiles: storyboard.videoProduction.voiceProfiles,
          }}
          onAssemblyPatch={patchAssemblySettings}
          onAudioMixPreset={handleAudioMixPreset}
          onBackgroundMusicFile={(file) => void handleBackgroundMusicFile(file)}
          onRemoveBackgroundMusic={handleRemoveBackgroundMusic}
          onVoiceProfileAdd={handleAddVoiceProfile}
          onVoiceProfileChange={handleVoiceProfilePatch}
          onVoiceProfileRemove={handleRemoveVoiceProfile}
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

      <StoryboardBatchSettings storyboard={storyboard} disabled={projectBusy} onChange={onChange} />
      <StoryboardSceneComparison scenes={storyboard.scenes} activeSceneId={activeSceneId} onSelectScene={focusVideoScene} />

      <TimelineOverview as="nav" aria-label="영상 장면 타임라인">
        {storyboard.scenes.map((scene) => (
          <TimelineScene
            key={scene.id}
            type="button"
            $status={scene.video.status}
            $active={scene.id === storyboard.scenes[selectedSceneIndex]?.id}
            onClick={() => focusVideoScene(scene.id)}
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
          const sceneJob = scene.video.jobId
            ? jobsById.get(scene.video.jobId)
            : undefined;
          const isInputImagePrivacyBlocked = isInputImagePrivacyFailure(
            scene.video.errorMessage,
            sceneJob,
          );
          const sceneEstimateProfileKey = videoEstimateProfileKey({
            duration: effectiveSceneDuration(scene),
            audioMode: sceneAudioMode,
            hasReferenceImage: hasStartFrame,
            hasEndReferenceImage: hasNextEndFrame,
            hasVisualReferenceImages: selectedReferenceAssets.length > 0,
            knownInputImagePrivacyBlock: isInputImagePrivacyBlocked,
          });
          const scenePreflight =
            estimatesByProfile.get(sceneEstimateProfileKey) ?? null;
          const sceneEstimate = scenePreflight?.estimatedCostUsd ?? null;
          const sceneAudioVerified = hasVerifiedAudibleAudio(sceneJob);
          const sceneRecovery = scene.video.errorMessage
            ? describeStoryboardVideoRecovery({
                errorMessage: scene.video.errorMessage,
                job: sceneJob,
              })
            : null;
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
                generationBlockedReason: !currentUser
                  ? "로그인 상태를 확인한 뒤 영상을 제작할 수 있습니다."
                  : workerStatusPending
                    ? "영상 처리 서버의 안전 버전을 확인하고 있습니다. 확인 후 제작 버튼이 자동으로 활성화됩니다."
                    : workerBlockingMessage ||
                      (scene.video.jobId && jobSubscriptionError
                        ? "기존 영상 작업 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."
                        : scene.video.jobId && !jobSubscriptionReady
                          ? "기존 영상 작업 기록을 확인하고 있습니다. 확인 후 제작 버튼이 자동으로 활성화됩니다."
                          : null),
                hasManualReferenceSelection,
                hasNextEndFrame,
                hasPendingVideoChanges,
                hasRepresentativeEstimate: Boolean(representativeEstimate),
                hasStartFrame,
                modelPreflight: scenePreflight,
                isQueueing: queueingSceneId === scene.id,
                isSceneBusy,
                isInputImagePrivacyBlocked,
                motionPresets: MOTION_PRESETS,
                nextScene,
                projectBusy,
                referenceAssets,
                retryAdvice:
                  scene.video.errorMessage &&
                  sceneRecovery?.canReuseProviderJob
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
                voiceProfiles: storyboard.videoProduction.voiceProfiles,
              }}
              actions={{
                onApproval: () => handleApproval(scene),
                onDialogueChange: (dialogue) =>
                  patchSceneDialogue(scene.id, dialogue),
                onDownload: handleDownloadAsset,
                onDuplicate: () => onDuplicateScene(scene),
                onDurationChange: (duration) =>
                  patchSceneDuration(scene.id, duration),
                onGenerate: () => {
                  if (sceneJob && canReuseStoryboardVideoProviderJob(sceneJob)) return handleGenerateScene(scene);
                  requestVideoAction(`${scene.order}번 장면 제작`, "선택한 장면 1개를 새로 제작합니다. 승인된 다른 장면은 유지합니다.", formatUsd(sceneEstimate), { kind: "scene", sceneId: scene.id, estimateProfileKey: sceneEstimateProfileKey }, estimatesByProfile);
                },
                onRegenerate: () =>
                  requestVideoAction(`${scene.order}번 장면 다시 제작`, "선택한 장면 1개를 새 요청으로 제작하며 추가 비용이 발생합니다.", formatUsd(sceneEstimate), { kind: "regenerate", sceneId: scene.id, estimateProfileKey: sceneEstimateProfileKey }, estimatesByProfile),
                onGenerateWithoutVisualInputs: () =>
                  requestVideoAction(`${scene.order}번 장면 텍스트로 제작`, "참조 이미지를 제외한 새 생성 요청입니다. 이미지 포함 견적과 실제 비용이 달라질 수 있습니다.", "제작 전 확인 필요", { kind: "text", sceneId: scene.id }, estimatesByProfile),
                onPatchVideo: (patch) => patchSceneVideo(scene.id, patch),
                onVoiceProfileChange: (voiceProfileId) =>
                  patchSceneVideo(scene.id, {
                    voiceProfileId,
                    status: scene.video.videoUrl
                      ? "brief"
                      : scene.video.status,
                    approvedAt: null,
                  }),
              }}
            />
          );
        })}
      </SceneProductionList>
    </ProductionSurface>
  );
}
