"use client";

import {
  Overlay,
  Workspace,
  WorkspaceHeader,
  TitleGroup,
  HeaderIcon,
  Eyebrow,
  HeaderActions,
  HeaderToolGroup,
  HeaderToolButton,
  SaveState,
  CloseButton,
  WorkspaceBody,
  ProjectSidebar,
  SidebarTop,
  SidebarDashboardButton,
  SidebarLabel,
  SidebarMeta,
  AddProjectButton,
  ProjectList,
  ProjectRow,
  ProjectItem,
  ProjectStatusBadge,
  ProjectRowMenu,
  SidebarMessage,
  BoardContent,
  WorkspaceAnchor,
  ProductionAssistantRail,
  AssistantRailHeader,
  QualityScore,
  QualityProgress,
  AssistantSummary,
  QualityChecklist,
  QualityCheckItem,
  AssistantDivider,
  ActiveSceneAssistant,
  AssistantSectionTitle,
  ActiveScenePreview,
  ActiveScenePlaceholder,
  ActiveSceneCopy,
  AssistantActionGrid,
  ReviewAcceptButton,
  ProductionShortcuts,
  ProductionShortcutButton,
  BoardHeader,
  ProjectActionRow,
  VersionPanel,
  VersionPanelHeader,
  VersionList,
  VersionEmpty,
  WorkspaceModeSwitch,
  BoardKicker,
  TitleInput,
  ProgressSummary,
  ProgressTrack,
  ProgressFill,
  ProductionFlow,
  WorkflowStep,
  WorkflowNumber,
  QuickPlanner,
  PlanReadiness,
  PlanReadinessHeading,
  BulkStatus,
  ReadinessGrid,
  ReadinessItem,
  QuickPlannerHeading,
  PlannerState,
  QuickPlannerFields,
  QuickStartRow,
  QuickStartButton,
  QuickTopicField,
  TopicHint,
  QuickSelectField,
  PlanButton,
  PlanDisclosure,
  PaidActionApproval,
  AdvancedDetails,
  AdvancedDetailsBody,
  BriefGrid,
  BriefField,
  ContinuitySection,
  SceneSummary,
  ResultReviewNotice,
  MissingSceneImageNotice,
  SceneProductionNotes,
  SceneRedesignPanel,
  SceneRedesignHeader,
  SceneRedesignScope,
  SceneRedesignQuickActions,
  SceneRedesignField,
  SceneRedesignContext,
  SceneRedesignActions,
  SceneRedesignSubmit,
  SceneDetails,
  SectionHeading,
  ContinuityGrid,
  ReferenceToggle,
  SceneSection,
  SceneHeaderActions,
  MissingImageFinder,
  MissingImageActions,
  SceneCount,
  AddSceneButton,
  BulkGenerateButton,
  SceneNavigator,
  SceneNavigatorButton,
  SceneList,
  SceneCard,
  SceneRail,
  SceneNumber,
  SceneStatus,
  SceneBody,
  SceneTopLine,
  SceneCommands,
  CommandButton,
  SceneGrid,
  SceneFooter,
  PromptHint,
  SceneActionGroup,
  RedesignSceneButton,
  GenerateSceneButton,
  GeneratedResult,
  SignInState,
  EmptyBoardState,
  ErrorNotice,
  QualityRepairButton,
} from "./StoryboardWorkspace.styles";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { IMAGE_STYLE_PRESETS } from "@/constants/imageStylePresets";
import StoryboardProjectDashboard, { type StoryboardDashboardSession } from "@/components/image-generator/StoryboardProjectDashboard";
import { resolveStoryboardPosition, type StoryboardOpenIntent, type StoryboardPosition } from "@/lib/storyboard-workspace-navigation";
import {
  BufferedTextInput as BaseBufferedTextInput,
  BufferedTextarea as BaseBufferedTextarea,
} from "@/components/image-generator/BufferedTextField";
import {
  createDownloadFileName,
  downloadRemoteMedia,
  openRemoteMedia,
} from "@/lib/client/media-download";
import { KOREAN_DATE_TIME_FORMAT } from "@/lib/date-formatters";
import { resetStoryboardVideoProduction } from "@/lib/storyboard-video-production";
import { applyStoryboardPlanningPreset, isStoryboardPresetApplyBusy } from "@/lib/storyboard-planning-presets";
import StoryboardPlanningPresets from "./StoryboardPlanningPresets";
import { inspectStoryboardQuality } from "@/lib/storyboard-quality";
import {
  getStoryboardProjectStatus,
  STORYBOARD_PROJECT_STATUS_LABELS,
} from "@/lib/storyboard-workflow";
import {
  createStoryboardVideoProduction,
  createStoryboardVideoScene,
  ImageStoryboardGenerationPayloadSchema,
  ImageStoryboardSchema,
  type ImageStoryboard,
  type ImageStoryboardGenerationPayload,
  type ImageStoryboardPlan,
  type ImageStoryboardScene,
  type SavedImageStoryboard,
  type StoryboardStorageCleanupAsset,
} from "@/schemas/imageStoryboard";
import {
  imageStoryboardService,
  StoryboardConflictError,
  type SavedStoryboardVersion,
} from "@/services/imageStoryboardService";
import {
  generateImageStoryboardPlan,
  redesignImageStoryboardFlow,
  redesignImageStoryboardScene,
} from "@/services/imageStoryboardPlanningService";
import {
  IMAGE_REFERENCE_ROLE_LABELS,
  MAX_IMAGE_REFERENCE_ASSETS,
  MAX_IMAGE_REFERENCE_REQUESTS,
  type ImageReferenceAsset,
  type ImageReferenceDraft,
  type ImageReferenceInput,
  type ImageReferenceRole,
} from "@/types/imageReference";

const ReferenceImageAssetManager = dynamic(
  () => import("@/components/image-generator/ReferenceImageAssetManager"),
  { ssr: false },
);

const StoryboardVideoProductionPanel = dynamic(
  () => import("@/components/image-generator/StoryboardVideoProductionPanel"),
  { ssr: false },
);

type GeneratedStoryboardImage = {
  id: string;
  url: string;
  storagePath?: string | null;
};

type StoryboardWorkspaceProps = {
  onClose: () => void;
  onGenerateScene: (
    payload: ImageStoryboardGenerationPayload,
  ) => Promise<GeneratedStoryboardImage>;
  isGenerating: boolean;
  presentation?: "dialog" | "page";
};

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "와이드 16:9", width: 1536, height: 864 },
  { value: "9:16", label: "세로 9:16", width: 864, height: 1536 },
  { value: "1:1", label: "정사각 1:1", width: 1024, height: 1024 },
  { value: "4:3", label: "표준 4:3", width: 1184, height: 864 },
  { value: "3:4", label: "세로 3:4", width: 864, height: 1184 },
] as const;

const SHOT_SIZE_OPTIONS = [
  "와이드 샷",
  "풀 샷",
  "미디엄 샷",
  "클로즈업",
  "익스트림 클로즈업",
  "탑 샷",
  "POV 샷",
];
const SCENE_COUNT_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const MAX_GENERATION_PROMPT_LENGTH = 1000;
const MAX_PLANNING_REFERENCE_DATA_URL_LENGTH = 1_600_000;
const MAX_PLANNING_REFERENCE_EDGE = 1280;
const MAX_FLOW_REDESIGN_SCENES = 12;
const DEFAULT_NEGATIVE_PROMPT =
  "low resolution, blurry, distorted anatomy, duplicate subjects, cluttered composition, unreadable text, watermark, logo";
const STORYBOARD_FORMAT_OPTIONS = [
  { value: "brand-film", label: "브랜드 필름" },
  { value: "product-launch", label: "제품 런칭" },
  { value: "social-short", label: "숏폼 콘텐츠" },
  { value: "editorial", label: "에디토리얼" },
] as const;
type StoryboardFormat = (typeof STORYBOARD_FORMAT_OPTIONS)[number]["value"];
type SceneRedesignScope = "scene" | "flow";
type WorkspaceSurface = "dashboard" | "editor";
type PendingStoryboardPaidAction =
  | { kind: "planning"; requestCount: number }
  | { kind: "scene"; sceneId: string; order: number; replacing: boolean }
  | { kind: "bulk"; sceneCount: number };
type PendingStoryboardSave = {
  storyboardId: string;
  draft: ImageStoryboard;
  changeRevision: number;
};

type BufferedTextFieldProps = {
  value: string;
  field: string;
  entityId?: string;
  onValueCommit: (
    entityId: string | undefined,
    field: string,
    value: string,
  ) => void;
  debounceMs?: number;
};

type BufferedTextareaProps = BufferedTextFieldProps &
  Omit<ComponentPropsWithoutRef<"textarea">, "value" | "onChange" | "onBlur">;

type BufferedInputProps = BufferedTextFieldProps &
  Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "onBlur">;

const BufferedTextarea = memo(function BufferedTextarea({
  value,
  field,
  entityId,
  onValueCommit,
  debounceMs = 450,
  ...props
}: BufferedTextareaProps) {
  const handleCommit = useCallback(
    (nextValue: string) => onValueCommit(entityId, field, nextValue),
    [entityId, field, onValueCommit],
  );

  return (
    <BaseBufferedTextarea
      {...props}
      value={value}
      onCommit={handleCommit}
      delayMs={debounceMs}
    />
  );
});

const BufferedInput = memo(function BufferedInput({
  value,
  field,
  entityId,
  onValueCommit,
  debounceMs = 450,
  ...props
}: BufferedInputProps) {
  const handleCommit = useCallback(
    (nextValue: string) => onValueCommit(entityId, field, nextValue),
    [entityId, field, onValueCommit],
  );

  return (
    <BaseBufferedTextInput
      {...props}
      value={value}
      onCommit={handleCommit}
      delayMs={debounceMs}
    />
  );
});

type ReadinessCheck = {
  id: string;
  label: string;
  description: string;
  ready: boolean;
  actionLabel: string;
  action:
    | "brief"
    | "references"
    | "continuity"
    | "quality"
    | "scenes"
    | "production"
    | "files";
};

const QUICK_START_TEMPLATES: Array<{
  id: string;
  label: string;
  topic: string;
  format: StoryboardFormat;
  sceneCount: number;
  icon: string;
}> = [
  {
    id: "product",
    label: "제품 소개",
    topic: "제품의 핵심 특징과 사용 장면을 빠르게 이해시키는 짧은 브랜드 필름",
    format: "product-launch",
    sceneCount: 5,
    icon: "fa-cube",
  },
  {
    id: "space",
    label: "공간 브랜딩",
    topic: "공간의 분위기와 방문 경험을 보여주는 감각적인 브랜드 스토리",
    format: "brand-film",
    sceneCount: 6,
    icon: "fa-building",
  },
  {
    id: "character",
    label: "캐릭터 숏폼",
    topic: "캐릭터가 문제를 해결하며 브랜드 메시지를 전달하는 짧은 세로 영상",
    format: "social-short",
    sceneCount: 5,
    icon: "fa-user-astronaut",
  },
];

function createScene(order: number): ImageStoryboardScene {
  const video = createStoryboardVideoScene();
  return {
    id: crypto.randomUUID(),
    order,
    title: `장면 ${order}`,
    status: "draft",
    duration: "3초",
    narrativeBeat: "",
    shotSize: "미디엄 샷",
    cameraDirection: "",
    dialogueOrCaption: "",
    visualPrompt: "",
    imagePrompt: "",
    continuityAnchor: "",
    transition: "",
    negativePrompt: "",
    assetFreshness: "current",
    staleReason: null,
    imageDesignRevision: 1,
    videoDesignRevision: 1,
    approvedImageArtifactId: null,
    approvedVideoArtifactId: null,
    generatedImage: null,
    video: {
      ...video,
      durationSeconds: 3,
    },
  };
}

function createStoryboard(): ImageStoryboard {
  return {
    schemaVersion: 2,
    revision: 1,
    archivedAt: null,
    workflowStage: "image-design",
    cleanupStatus: "idle",
    cleanupErrorMessage: null,
    productionRecordSignature: "",
    topic: "",
    title: "새 스토리보드",
    logline: "",
    audience: "",
    format: "brand-film",
    plannedSceneCount: 5,
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
    videoProduction: createStoryboardVideoProduction(),
    scenes: [createScene(1)],
  };
}

function queueReclaimableStorageAsset(
  current: ImageStoryboard,
  asset: Omit<StoryboardStorageCleanupAsset, "id" | "queuedAt">,
): StoryboardStorageCleanupAsset[] {
  if (
    current.reclaimableStorageAssets.some(
      (item) => item.storagePath === asset.storagePath,
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
      ...asset,
      id,
      queuedAt: Date.now(),
    },
  ].slice(-80);
}

function storagePathFromFirebaseDownloadUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const marker = "/o/";
    const markerIndex = url.pathname.indexOf(marker);
    if (
      markerIndex < 0 ||
      (url.hostname !== "firebasestorage.googleapis.com" &&
        url.hostname !== "storage.googleapis.com")
    ) {
      return null;
    }
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

function reindexScenes(scenes: ImageStoryboardScene[]): ImageStoryboardScene[] {
  return scenes.map((scene, index) => ({ ...scene, order: index + 1 }));
}

function deriveSceneStatus(
  scene: ImageStoryboardScene,
): ImageStoryboardScene["status"] {
  return scene.visualPrompt.trim() || scene.narrativeBeat.trim()
    ? "ready"
    : "draft";
}

function resetSceneVideo(
  scene: ImageStoryboardScene,
): ImageStoryboardScene["video"] {
  return {
    ...createStoryboardVideoScene(),
    durationSeconds: scene.video.durationSeconds,
    motionIntensity: scene.video.motionIntensity,
    audioMode: scene.video.audioMode,
    generateAudio: scene.video.generateAudio,
    trimStartSeconds: scene.video.trimStartSeconds,
    trimEndSeconds: scene.video.trimEndSeconds,
    playbackRate: scene.video.playbackRate,
    audioVolume: scene.video.audioVolume,
    transitionStyle: scene.video.transitionStyle,
    transitionSeconds: scene.video.transitionSeconds,
  };
}

function copySceneVideoSettings(
  scene: ImageStoryboardScene,
): ImageStoryboardScene["video"] {
  return {
    ...createStoryboardVideoScene(),
    motionPrompt: scene.video.motionPrompt,
    durationSeconds: scene.video.durationSeconds,
    motionIntensity: scene.video.motionIntensity,
    useNextSceneAsEndFrame: scene.video.useNextSceneAsEndFrame,
    audioMode: scene.video.audioMode,
    generateAudio: scene.video.generateAudio,
    trimStartSeconds: scene.video.trimStartSeconds,
    trimEndSeconds: scene.video.trimEndSeconds,
    playbackRate: scene.video.playbackRate,
    audioVolume: scene.video.audioVolume,
    transitionStyle: scene.video.transitionStyle,
    transitionSeconds: scene.video.transitionSeconds,
    referenceAssetIds: [...scene.video.referenceAssetIds],
  };
}

function parseSceneDurationSeconds(value: string, fallback = 6): number {
  const match = value.match(/\d+/);
  const parsed = match ? Number(match[0]) : fallback;
  return Math.max(3, Math.min(15, Number.isFinite(parsed) ? parsed : fallback));
}

function sceneHasVideoResult(scene: ImageStoryboardScene): boolean {
  return Boolean(scene.video.videoUrl || scene.video.clipId);
}

function markSceneForReview(
  scene: ImageStoryboardScene,
  reason: string,
): ImageStoryboardScene {
  return {
    ...scene,
    assetFreshness:
      scene.generatedImage || sceneHasVideoResult(scene) ? "review" : "current",
    staleReason:
      scene.generatedImage || sceneHasVideoResult(scene) ? reason : null,
    video: sceneHasVideoResult(scene)
      ? {
          ...scene.video,
          status: "review",
          approvedAt: null,
        }
      : scene.video,
  };
}

function createIndependentStoryboardCopy(
  storyboard: ImageStoryboard,
): ImageStoryboard {
  return {
    ...storyboard,
    schemaVersion: 2,
    revision: 1,
    archivedAt: null,
    workflowStage: "image-design",
    cleanupStatus: "idle",
    cleanupErrorMessage: null,
    productionRecordSignature: "",
    title: `${storyboard.title} 복사본`.slice(0, 100),
    referenceAssets: [],
    reclaimableStorageAssets: [],
    transitionLinks: [],
    videoProduction: createStoryboardVideoProduction(),
    scenes: storyboard.scenes.map((scene) => ({
      ...scene,
      id: crypto.randomUUID(),
      status: deriveSceneStatus(scene),
      assetFreshness: "current",
      staleReason: null,
      imageDesignRevision: 1,
      videoDesignRevision: 1,
      approvedImageArtifactId: null,
      approvedVideoArtifactId: null,
      generatedImage: null,
      video: {
        ...createStoryboardVideoScene(),
        durationSeconds: scene.video.durationSeconds,
        motionIntensity: scene.video.motionIntensity,
        audioMode: scene.video.audioMode,
        generateAudio: scene.video.generateAudio,
      },
    })),
  };
}

function dedupeStoryboardsById(
  storyboards: SavedImageStoryboard[],
): SavedImageStoryboard[] {
  const byId = new Map<string, SavedImageStoryboard>();

  for (const storyboard of storyboards) {
    const existing = byId.get(storyboard.id);
    if (!existing || storyboard.updatedAt >= existing.updatedAt) {
      byId.set(storyboard.id, storyboard);
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
}

function upsertStoryboard(
  storyboards: SavedImageStoryboard[],
  nextStoryboard: SavedImageStoryboard,
): SavedImageStoryboard[] {
  return dedupeStoryboardsById([nextStoryboard, ...storyboards]);
}

function compactPrompt(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_GENERATION_PROMPT_LENGTH);
}

function buildNegativePrompt(scene: ImageStoryboardScene): string {
  return [DEFAULT_NEGATIVE_PROMPT, scene.negativePrompt.trim()]
    .filter(Boolean)
    .join(", ")
    .slice(0, 360);
}

function buildGenerationPayload(
  storyboard: ImageStoryboard,
  scene: ImageStoryboardScene,
  referenceImages: ImageReferenceInput[],
): ImageStoryboardGenerationPayload {
  const dimensions =
    ASPECT_RATIO_OPTIONS.find(
      (option) => option.value === storyboard.aspectRatio,
    ) ?? ASPECT_RATIO_OPTIONS[0];
  const prompt = compactPrompt([
    scene.imagePrompt ||
      scene.visualPrompt ||
      `${scene.title}, ${scene.shotSize}`,
    `Storyboard frame ${scene.order}: ${scene.title}.`,
    scene.continuityAnchor
      ? `Continuity lock: ${scene.continuityAnchor}`
      : undefined,
    storyboard.characterContinuity
      ? `Character/product continuity: ${storyboard.characterContinuity}`
      : undefined,
    storyboard.settingContinuity
      ? `Setting continuity: ${storyboard.settingContinuity}`
      : undefined,
    storyboard.colorAndLighting
      ? `Color and lighting: ${storyboard.colorAndLighting}`
      : undefined,
    storyboard.artDirection
      ? `Art direction: ${storyboard.artDirection}`
      : undefined,
    scene.cameraDirection
      ? `Camera direction: ${scene.cameraDirection}`
      : `Framing: ${scene.shotSize}`,
    referenceImages.length
      ? `Reference images are the visual source of truth. Preserve the supplied ${referenceImages.map((reference, index) => `#${index + 1} ${IMAGE_REFERENCE_ROLE_LABELS[reference.role]}`).join(", ")}. Keep subject identity, product geometry, architecture, materials, palette, and environment continuity. Do not merge distinct subjects or invent logos, readable text, or unreferenced features.`
      : undefined,
    "One polished, coherent frame. Preserve continuity. Do not add readable text, UI, watermark, or extra subjects.",
  ]);

  return ImageStoryboardGenerationPayloadSchema.parse({
    prompt: prompt || `${scene.title}, ${scene.shotSize}`,
    negativePrompt: buildNegativePrompt(scene),
    aspectRatio: storyboard.aspectRatio,
    width: dimensions.width,
    height: dimensions.height,
    stylePreset: storyboard.stylePreset,
    resourceMode: "efficient",
    ...(referenceImages.length ? { referenceImages } : {}),
  });
}

function formatSavedTime(timestamp: number | null): string {
  if (!timestamp) return "저장 대기";
  return `저장됨 ${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(timestamp)}`;
}

function isTextEditingElement(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["button", "checkbox", "color", "file", "radio", "range", "reset", "submit"].includes(
      target.type,
    );
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : typeof error === "object" &&
          error !== null &&
          "name" in error &&
          (error as { name?: unknown }).name === "AbortError"
  );
}

function loadReferenceImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("첨부 이미지를 기획용으로 읽을 수 없습니다."));
    image.src = source;
  });
}

async function compactReferenceForPlanning(
  asset: ImageReferenceAsset,
): Promise<ImageReferenceInput> {
  if (
    !asset.image.startsWith("data:image/") ||
    asset.image.length <= MAX_PLANNING_REFERENCE_DATA_URL_LENGTH
  ) {
    return { image: asset.image, role: asset.role };
  }

  const sourceImage = await loadReferenceImage(asset.image);
  const longestEdge = Math.max(
    sourceImage.naturalWidth,
    sourceImage.naturalHeight,
  );
  const scale = Math.min(
    1,
    MAX_PLANNING_REFERENCE_EDGE / Math.max(1, longestEdge),
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
    if (compacted.length <= MAX_PLANNING_REFERENCE_DATA_URL_LENGTH) {
      return { image: compacted, role: asset.role };
    }
    width = Math.max(1, Math.round(width * 0.72));
    height = Math.max(1, Math.round(height * 0.72));
  }

  throw new Error(
    `${asset.name} 사진이 기획 분석용 크기 제한을 초과합니다. 더 작은 파일로 다시 등록해 주세요.`,
  );
}

async function preparePlanningReferences(
  assets: ImageReferenceAsset[],
): Promise<ImageReferenceInput[]> {
  return Promise.all(
    assets
      .slice(0, MAX_IMAGE_REFERENCE_ASSETS)
      .map(compactReferenceForPlanning),
  );
}

export default function StoryboardWorkspace(props: StoryboardWorkspaceProps) {
  const { currentUser } = useAuth();
  // A new account gets a new editor, including drafts, requests and navigation memory.
  return <StoryboardAccountWorkspace key={currentUser?.uid ?? "signed-out"} {...props} />;
}

function StoryboardAccountWorkspace({
  onClose,
  onGenerateScene,
  isGenerating,
  presentation = "page",
}: StoryboardWorkspaceProps) {
  const {
    currentUser,
    loading: authLoading,
    isConfigured: isAuthConfigured,
    loginWithGoogle,
  } = useAuth();
  const [storyboards, setStoryboards] = useState<SavedImageStoryboard[]>([]);
  const dashboardSessionRef = useRef<StoryboardDashboardSession>({ search: "", page: 1, scrollTop: 0, focusedProjectId: null });
  const [dashboardSnapshot, setDashboardSnapshot] = useState<StoryboardDashboardSession>({ search: "", page: 1, scrollTop: 0, focusedProjectId: null });
  const projectPositionsRef = useRef(new Map<string, StoryboardPosition>());
  const videoRequestPendingRef = useRef(false);
  const handleVideoRequestPending = useCallback((pending: boolean) => { videoRequestPendingRef.current = pending; }, []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImageStoryboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [subscriptionRetryEpoch, setSubscriptionRetryEpoch] = useState(0);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(
    null,
  );
  const [signInError, setSignInError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(
    null,
  );
  const [downloadingSceneImageId, setDownloadingSceneImageId] = useState<
    string | null
  >(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [pendingPaidAction, setPendingPaidAction] =
    useState<PendingStoryboardPaidAction | null>(null);
  const [paidActionAccepted, setPaidActionAccepted] = useState(false);
  const [redesigningSceneId, setRedesigningSceneId] = useState<string | null>(
    null,
  );
  const [redesignPanelSceneId, setRedesignPanelSceneId] = useState<
    string | null
  >(null);
  const [sceneRedesignInstructions, setSceneRedesignInstructions] = useState<
    Record<string, string>
  >({});
  const [sceneRedesignScopes, setSceneRedesignScopes] = useState<
    Record<string, SceneRedesignScope>
  >({});
  const [lastPlanReferenceAnalysis, setLastPlanReferenceAnalysis] = useState<
    "visual" | "brief-only" | null
  >(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [workspaceSurface, setWorkspaceSurface] =
    useState<WorkspaceSurface>("dashboard");
  const [workspaceMode, setWorkspaceMode] = useState<"storyboard" | "video">(
    "storyboard",
  );
  const [hasRestoredUrlState, setHasRestoredUrlState] = useState(false);
  const [versions, setVersions] = useState<SavedStoryboardVersion[]>([]);
  const [versionsProjectId, setVersionsProjectId] = useState<string | null>(
    null,
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isVersionsLoading, setIsVersionsLoading] = useState(false);
  const [isUploadingReferences, setIsUploadingReferences] = useState(false);
  const [mediaCopyProgress, setMediaCopyProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const [projectSwitchState, setProjectSwitchState] = useState<
    "idle" | "saving" | "loading" | "ready" | "conflict" | "failed"
  >("idle");
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<PendingStoryboardSave | null>(null);
  const inFlightSaveRef = useRef<PendingStoryboardSave | null>(null);
  const saveOperationRef = useRef<Promise<boolean> | null>(null);
  const savedRevisionRef = useRef(new Map<string, number>());
  const saveConflictRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const draftRef = useRef<ImageStoryboard | null>(null);
  const isDirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const planningRequestRef = useRef(0);
  const sceneRedesignRequestRef = useRef(0);
  const projectSwitchRequestRef = useRef(0);
  const intentRevealCleanupRef = useRef<(() => void) | null>(null);
  const versionHistoryRequestRef = useRef(0);
  const versionsProjectIdRef = useRef<string | null>(null);
  const planningAbortControllerRef = useRef<AbortController | null>(null);
  const sceneRedesignAbortControllerRef =
    useRef<AbortController | null>(null);
  const referenceUploadRequestRef = useRef(0);
  const referenceUploadInProgressRef = useRef(false);
  const isMountedRef = useRef(true);
  const historyPastRef = useRef<ImageStoryboard[]>([]);
  const historyFutureRef = useRef<ImageStoryboard[]>([]);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const projectReferenceAssets = useMemo(
    () => draft?.referenceAssets ?? [],
    [draft?.referenceAssets],
  );

  const replaceDraft = useCallback((nextDraft: ImageStoryboard | null) => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  const invalidateVersionHistory = useCallback(() => {
    versionHistoryRequestRef.current += 1;
    versionsProjectIdRef.current = null;
    setVersionsProjectId(null);
    setVersions([]);
    setIsVersionsLoading(false);
    setIsHistoryOpen(false);
  }, []);

  const activateStoryboardId = useCallback(
    (nextStoryboardId: string | null) => {
      if (activeIdRef.current !== nextStoryboardId) {
        invalidateVersionHistory();
        setLastPlanReferenceAnalysis(null);
        activeIdRef.current = nextStoryboardId;
      }
      setActiveId(nextStoryboardId);
    },
    [invalidateVersionHistory],
  );

  const cancelDraftScopedRequests = useCallback(() => {
    planningRequestRef.current += 1;
    sceneRedesignRequestRef.current += 1;
    referenceUploadRequestRef.current += 1;
    planningAbortControllerRef.current?.abort();
    sceneRedesignAbortControllerRef.current?.abort();
    planningAbortControllerRef.current = null;
    sceneRedesignAbortControllerRef.current = null;
    referenceUploadInProgressRef.current = false;
    if (isMountedRef.current) {
      setIsPlanning(false);
      setRedesigningSceneId(null);
      setIsUploadingReferences(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      planningAbortControllerRef.current?.abort();
      sceneRedesignAbortControllerRef.current?.abort();
      referenceUploadRequestRef.current += 1;
      versionHistoryRequestRef.current += 1;
      projectSwitchRequestRef.current += 1;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      pendingSaveRef.current = null;
    };
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setWorkspaceSurface(
      searchParams.has("storyboard") ? "editor" : "dashboard",
    );
    setWorkspaceMode(
      searchParams.get("storyboardMode") === "video" ? "video" : "storyboard",
    );
    setHasRestoredUrlState(true);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser?.uid) {
      cancelDraftScopedRequests();
      setStoryboards([]);
      activateStoryboardId(null);
      replaceDraft(null);
      pendingSaveRef.current = null;
      inFlightSaveRef.current = null;
      savedRevisionRef.current.clear();
      saveConflictRef.current = false;
      isDirtyRef.current = false;
      setSaveConflict(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setSubscriptionError(null);
    const unsubscribe = imageStoryboardService.subscribe(
      currentUser.uid,
      (nextStoryboards) => {
        setStoryboards(dedupeStoryboardsById(nextStoryboards));
        setSubscriptionError(null);
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setSubscriptionError(
          "스토리보드를 불러오지 못했습니다. 네트워크 상태와 권한을 확인해 주세요.",
        );
        setIsLoading(false);
      },
    );
    return unsubscribe;
  }, [
    activateStoryboardId,
    authLoading,
    cancelDraftScopedRequests,
    currentUser?.uid,
    replaceDraft,
    subscriptionRetryEpoch,
  ]);

  useEffect(() => {
    if (activeId || draft || storyboards.length === 0) return;
    const requestedId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("storyboard")
        : null;
    const initial =
      storyboards.find((storyboard) => storyboard.id === requestedId) ??
      storyboards.find((storyboard) => !storyboard.archivedAt) ??
      storyboards[0];
    activateStoryboardId(initial.id);
    replaceDraft({
      ...initial,
      scenes: initial.scenes.map((scene) => ({ ...scene })),
    });
    savedRevisionRef.current.set(initial.id, initial.revision);
    setLastSavedAt(initial.updatedAt);
  }, [activeId, activateStoryboardId, draft, replaceDraft, storyboards]);

  useEffect(() => {
    if (!draft?.scenes.length) {
      setActiveSceneId(null);
      return;
    }

    setActiveSceneId((current) =>
      current && draft.scenes.some((scene) => scene.id === current)
        ? current
        : (draft.scenes.find(
            (scene) =>
              scene.id ===
              new URLSearchParams(window.location.search).get("scene"),
          )?.id ?? draft.scenes[0].id),
    );
  }, [draft?.scenes]);

  const persistDraft = useCallback(
    async (
      storyboardId: string,
      nextDraft: ImageStoryboard,
      revision: number,
    ): Promise<boolean> => {
      if (!currentUser?.uid || saveConflictRef.current) return false;

      const inFlightSave = inFlightSaveRef.current;
      if (
        saveOperationRef.current &&
        !pendingSaveRef.current &&
        inFlightSave?.storyboardId === storyboardId &&
        inFlightSave.changeRevision === revision
      ) {
        return saveOperationRef.current;
      }

      // Auto-save, Ctrl/Cmd+S, and view changes can arrive together. Keep only
      // the newest draft and serialize writes so an older revision never races it.
      pendingSaveRef.current = {
        storyboardId,
        draft: nextDraft,
        changeRevision: revision,
      };

      if (saveOperationRef.current) return saveOperationRef.current;

      const operation = (async (): Promise<boolean> => {
        setIsSaving(true);
        try {
          while (pendingSaveRef.current) {
            const requestedSave = pendingSaveRef.current;
            pendingSaveRef.current = null;
            inFlightSaveRef.current = requestedSave;
            const serverRevision =
              savedRevisionRef.current.get(requestedSave.storyboardId) ??
              requestedSave.draft.revision;
            const nextServerRevision = await imageStoryboardService.save(
              currentUser.uid,
              requestedSave.storyboardId,
              { ...requestedSave.draft, revision: serverRevision },
            );

            if (!isMountedRef.current) return false;

            savedRevisionRef.current.set(
              requestedSave.storyboardId,
              nextServerRevision,
            );
            inFlightSaveRef.current = null;
            setDraft((current) => {
              const nextDraft =
                activeIdRef.current === requestedSave.storyboardId && current
                  ? { ...current, revision: nextServerRevision }
                  : current;
              draftRef.current = nextDraft;
              return nextDraft;
            });
            saveConflictRef.current = false;
            setSaveConflict(false);
            setLoadError(null);

            if (
              revisionRef.current === requestedSave.changeRevision &&
              !pendingSaveRef.current
            ) {
              isDirtyRef.current = false;
              setIsDirty(false);
              setLastSavedAt(Date.now());
            }
          }
          return true;
        } catch (error) {
          if (!isMountedRef.current) return false;
          pendingSaveRef.current = null;
          inFlightSaveRef.current = null;
          console.error(error);
          const conflicted = error instanceof StoryboardConflictError;
          saveConflictRef.current = conflicted;
          setSaveConflict(conflicted);
          setLoadError(
            conflicted
              ? error.message
              : "변경 내용을 저장하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 저장해 주세요.",
          );
          return false;
        } finally {
          saveOperationRef.current = null;
          inFlightSaveRef.current = null;
          setIsSaving(false);
        }
      })();

      saveOperationRef.current = operation;
      return operation;
    },
    [currentUser?.uid],
  );

  const flushFocusedWorkspaceField = useCallback(async () => {
    const focused = document.activeElement;
    const isBufferedField =
      focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement;

    if (!isBufferedField || !workspaceRef.current?.contains(focused)) return;

    focused.blur();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }, []);

  const handleClose = useCallback(async () => {
    if (videoRequestPendingRef.current) { toast.info("영상 작업 접수가 끝난 뒤 이동할 수 있습니다."); return; }
    cancelDraftScopedRequests();
    await flushFocusedWorkspaceField();
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const currentStoryboardId = activeIdRef.current;
    const currentDraft = draftRef.current;
    if (currentStoryboardId && currentDraft && isDirtyRef.current) {
      const saved = await persistDraft(
        currentStoryboardId,
        currentDraft,
        revisionRef.current,
      );
      if (!saved) {
        toast.error("변경 내용을 저장하지 못해 작업공간을 닫지 않았습니다.");
        return;
      }
    }
    onClose();
  }, [
    cancelDraftScopedRequests,
    flushFocusedWorkspaceField,
    onClose,
    persistDraft,
  ]);

  useEffect(() => {
    if (presentation !== "dialog") return undefined;
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus(),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      const previous = previouslyFocusedElementRef.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [presentation]);

  useEffect(() => {
    if (presentation !== "dialog") return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void handleClose();
        return;
      }
      if (event.key !== "Tab") return;
      const container = workspaceRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          !element.hasAttribute("hidden") &&
          element.getClientRects().length > 0,
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, presentation]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!hasRestoredUrlState) return;
    const url = new URL(window.location.href);
    if (workspaceSurface === "dashboard") {
      url.searchParams.delete("storyboard");
      url.searchParams.delete("storyboardMode");
      url.searchParams.delete("scene");
    } else if (activeId) {
      url.searchParams.set("storyboard", activeId);
      url.searchParams.set("storyboardMode", workspaceMode);
      if (activeSceneId) url.searchParams.set("scene", activeSceneId);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [
    activeId,
    activeSceneId,
    hasRestoredUrlState,
    workspaceMode,
    workspaceSurface,
  ]);

  useEffect(() => {
    if (!activeId || !draft || !isDirty || !currentUser?.uid || saveConflict)
      return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const revision = revisionRef.current;
    const snapshot = draft;
    saveTimerRef.current = window.setTimeout(() => {
      void persistDraft(activeId, snapshot, revision);
    }, 700);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [activeId, currentUser?.uid, draft, isDirty, persistDraft, saveConflict]);

  const updateDraft = useCallback(
    (updater: (current: ImageStoryboard) => ImageStoryboard) => {
      const current = draftRef.current;
      if (!current) return;
      const next = updater(current);
      if (next === current) return;
      historyPastRef.current = [...historyPastRef.current.slice(-29), current];
      historyFutureRef.current = [];
      draftRef.current = next;
      isDirtyRef.current = true;
      setHistoryState({ canUndo: true, canRedo: false });
      revisionRef.current += 1;
      setIsDirty(true);
      setDraft(next);
    },
    [],
  );

  const updateActiveStoryboard = useCallback((updater: (current: ImageStoryboard) => ImageStoryboard) => {
    if (isMountedRef.current && activeIdRef.current === activeId) updateDraft(updater);
  }, [activeId, updateDraft]);

  const undoDraft = useCallback(() => {
    const current = draftRef.current;
    const previous = historyPastRef.current.pop();
    if (!current || !previous) return;

    historyFutureRef.current = [current, ...historyFutureRef.current].slice(
      0,
      30,
    );
    revisionRef.current += 1;
    isDirtyRef.current = true;
    setIsDirty(true);
    setHistoryState({
      canUndo: historyPastRef.current.length > 0,
      canRedo: true,
    });
    const nextDraft = { ...previous, revision: current.revision };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  const redoDraft = useCallback(() => {
    const current = draftRef.current;
    const next = historyFutureRef.current.shift();
    if (!current || !next) return;

    historyPastRef.current = [...historyPastRef.current.slice(-29), current];
    revisionRef.current += 1;
    isDirtyRef.current = true;
    setIsDirty(true);
    setHistoryState({
      canUndo: true,
      canRedo: historyFutureRef.current.length > 0,
    });
    const nextDraft = { ...next, revision: current.revision };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  const retryStoryboardSubscription = useCallback(() => {
    setSubscriptionError(null);
    setIsLoading(true);
    setSubscriptionRetryEpoch((current) => current + 1);
  }, []);

  useEffect(() => {
    const handleEditorShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (isTextEditingElement(event.target) && key !== "s") return;
      if (key === "z" && !event.shiftKey && historyPastRef.current.length) {
        event.preventDefault();
        undoDraft();
      } else if (
        (key === "y" || (key === "z" && event.shiftKey)) &&
        historyFutureRef.current.length
      ) {
        event.preventDefault();
        redoDraft();
      } else if (key === "s") {
        event.preventDefault();
        void (async () => {
          await flushFocusedWorkspaceField();
          const currentStoryboardId = activeIdRef.current;
          const currentDraft = draftRef.current;
          if (!currentStoryboardId || !currentDraft) return;
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          await persistDraft(
            currentStoryboardId,
            currentDraft,
            revisionRef.current,
          );
        })();
      }
    };
    window.addEventListener("keydown", handleEditorShortcut);
    return () => window.removeEventListener("keydown", handleEditorShortcut);
  }, [flushFocusedWorkspaceField, persistDraft, redoDraft, undoDraft]);

  const updateStoryboardMetadata = useCallback(
    (updater: (current: ImageStoryboard) => ImageStoryboard) => {
      updateDraft(updater);
    },
    [updateDraft],
  );

  const updateStoryboardBrief = useCallback(
    (updater: (current: ImageStoryboard) => ImageStoryboard) => {
      updateDraft((current) => {
        const next = updater(current);
        return {
          ...next,
          videoProduction: resetStoryboardVideoProduction(next.videoProduction),
          scenes: next.scenes.map((scene) =>
            markSceneForReview(
              scene,
              "전체 연출 기준이 변경되어 기존 결과를 다시 확인해 주세요.",
            ),
          ),
        };
      });
    },
    [updateDraft],
  );

  const commitStoryboardText = useCallback(
    (_: string | undefined, field: string, value: string) => {
      if (field === "topic") {
        updateDraft((current) => ({ ...current, topic: value }));
        return;
      }

      if (field === "logline" || field === "audience") {
        updateStoryboardMetadata((current) => ({ ...current, [field]: value }));
        return;
      }

      updateStoryboardBrief((current) => ({ ...current, [field]: value }));
    },
    [updateDraft, updateStoryboardBrief, updateStoryboardMetadata],
  );

  const revealStoryboardOpenIntent = useCallback(
    (intent: StoryboardOpenIntent, storyboard: ImageStoryboard, storyboardId: string) => {
      intentRevealCleanupRef.current?.();
      intentRevealCleanupRef.current = null;
      const position = resolveStoryboardPosition(storyboard, intent, projectPositionsRef.current.get(storyboardId));
      setWorkspaceMode(position.mode);
      setActiveSceneId(position.sceneId);

      let observer: MutationObserver | null = null;
      let timeoutId: number | null = null;
      let frameId: number | null = null;
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        observer?.disconnect();
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        if (intentRevealCleanupRef.current === cleanup) {
          intentRevealCleanupRef.current = null;
        }
      };

      const revealTarget = () => {
        if (settled) return true;
        if (intent === "recovery") {
          const recoveryDetails = document.getElementById(
            "storyboard-production-recovery-details",
          );
          if (recoveryDetails instanceof HTMLDetailsElement) {
            recoveryDetails.open = true;
          }
        }

        const selectors = storyboard.cleanupStatus === "retry" ? ["#storyboard-project-files"] : position.mode === "storyboard"
          ? [`#scene-title-${position.sceneId}`, "#storyboard-project-brief"]
          : intent === "edit"
            ? [`#storyboard-video-scene-${position.sceneId}`, "#storyboard-production-primary-action"]
          : intent === "result"
            ? [
                "#storyboard-final-delivery",
                "#storyboard-production-primary-action:not([disabled])",
                "#storyboard-production-recovery-console",
              ]
            : [
                "#storyboard-recovery-summary",
                "#storyboard-production-subscription-retry:not([disabled])",
                "#storyboard-production-recovery-action:not([disabled])",
                "#storyboard-production-recovery-notice",
                "#storyboard-production-subscription-error",
                "#storyboard-production-final-error",
                "#storyboard-production-worker-readiness",
                "#storyboard-production-recovery-console",
              ];
        const target = selectors
          .map((selector) => document.querySelector<HTMLElement>(selector))
          .find((candidate): candidate is HTMLElement => Boolean(candidate));
        if (!target) return false;

        let disclosure = target.parentElement?.closest("details");
        while (disclosure) {
          disclosure.open = true;
          disclosure = disclosure.parentElement?.closest("details") ?? null;
        }

        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        target.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "center",
        });
        if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
        target.focus({ preventScroll: true });
        cleanup();
        return true;
      };

      intentRevealCleanupRef.current = cleanup;
      observer = new MutationObserver(() => {
        revealTarget();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["open", "disabled"],
      });
      frameId = window.requestAnimationFrame(() => {
        frameId = window.requestAnimationFrame(() => {
          revealTarget();
        });
      });
      timeoutId = window.setTimeout(() => {
        if (!revealTarget()) cleanup();
      }, 4_000);
    },
    [],
  );

  useEffect(
    () => () => {
      intentRevealCleanupRef.current?.();
      intentRevealCleanupRef.current = null;
    },
    [],
  );

  const selectStoryboard = useCallback(
    async (
      storyboard: SavedImageStoryboard,
      intent: StoryboardOpenIntent = "edit",
    ) => {
      if (videoRequestPendingRef.current) { toast.info("영상 작업 접수가 끝난 뒤 이동할 수 있습니다."); return; }
      const requestId = projectSwitchRequestRef.current + 1;
      projectSwitchRequestRef.current = requestId;
      await flushFocusedWorkspaceField();
      setPendingPaidAction(null);
      setPaidActionAccepted(false);
      const currentStoryboardId = activeIdRef.current;
      const currentDraft = draftRef.current;
      if (currentStoryboardId) projectPositionsRef.current.set(currentStoryboardId, { mode: workspaceMode, sceneId: activeSceneId });
      setWorkspaceSurface("editor");
      if (currentStoryboardId === storyboard.id) {
        setProjectSwitchState("ready");
        revealStoryboardOpenIntent(intent, currentDraft ?? storyboard, storyboard.id);
        return;
      }
      invalidateVersionHistory();
      cancelDraftScopedRequests();
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (currentStoryboardId && currentDraft && isDirtyRef.current) {
        setProjectSwitchState("saving");
        const saved = await persistDraft(
          currentStoryboardId,
          currentDraft,
          revisionRef.current,
        );
        if (!saved) {
          if (projectSwitchRequestRef.current === requestId) {
            setProjectSwitchState(
              saveConflictRef.current ? "conflict" : "failed",
            );
          }
          return;
        }
      }
      if (projectSwitchRequestRef.current !== requestId || !currentUser?.uid) {
        return;
      }
      setProjectSwitchState("loading");
      try {
        const latest = await imageStoryboardService.get(
          currentUser.uid,
          storyboard.id,
        );
        if (projectSwitchRequestRef.current !== requestId) return;
        revisionRef.current = 0;
        historyPastRef.current = [];
        historyFutureRef.current = [];
        setHistoryState({ canUndo: false, canRedo: false });
        savedRevisionRef.current.set(latest.id, latest.revision);
        activateStoryboardId(latest.id);
        replaceDraft({
          ...latest,
          scenes: latest.scenes.map((scene) => ({ ...scene })),
        });
        isDirtyRef.current = false;
        setIsDirty(false);
        setLastSavedAt(latest.updatedAt);
        setLoadError(null);
        setProjectSwitchState("ready");
        revealStoryboardOpenIntent(intent, latest, latest.id);
      } catch (error) {
        if (projectSwitchRequestRef.current !== requestId) return;
        console.error(error);
        setProjectSwitchState("failed");
        setLoadError(
          "선택한 프로젝트의 최신 내용을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    },
    [
      activateStoryboardId,
      cancelDraftScopedRequests,
      currentUser?.uid,
      flushFocusedWorkspaceField,
      invalidateVersionHistory,
      persistDraft,
      replaceDraft,
      revealStoryboardOpenIntent,
      workspaceMode,
      activeSceneId,
    ],
  );

  const createNewStoryboard = useCallback(async () => {
    if (videoRequestPendingRef.current) { toast.info("영상 작업 접수가 끝난 뒤 이동할 수 있습니다."); return; }
    await flushFocusedWorkspaceField();
    if (!currentUser?.uid) {
      toast.error("로그인 후 스토리보드를 만들 수 있습니다.");
      return;
    }

    cancelDraftScopedRequests();

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const currentStoryboardId = activeIdRef.current;
    const currentDraft = draftRef.current;
    if (currentStoryboardId && currentDraft && isDirtyRef.current) {
      const saved = await persistDraft(
        currentStoryboardId,
        currentDraft,
        revisionRef.current,
      );
      if (!saved) return;
    }

    const nextStoryboard = createStoryboard();
    try {
      const id = await imageStoryboardService.create(
        currentUser.uid,
        nextStoryboard,
      );
      const now = Date.now();
      setStoryboards((current) =>
        upsertStoryboard(current, {
          id,
          ...nextStoryboard,
          createdAt: now,
          updatedAt: now,
        }),
      );
      revisionRef.current = 0;
      historyPastRef.current = [];
      historyFutureRef.current = [];
      setHistoryState({ canUndo: false, canRedo: false });
      savedRevisionRef.current.set(id, nextStoryboard.revision);
      saveConflictRef.current = false;
      setSaveConflict(false);
      activateStoryboardId(id);
      replaceDraft(nextStoryboard);
      isDirtyRef.current = false;
      setWorkspaceSurface("editor");
      setIsDirty(false);
      setLastSavedAt(now);
      toast.success("새 스토리보드를 만들었습니다.");
    } catch (error) {
      console.error(error);
      setLoadError("새 스토리보드를 만들지 못했습니다. 다시 시도해 주세요.");
    }
  }, [
    activateStoryboardId,
    cancelDraftScopedRequests,
    currentUser?.uid,
    flushFocusedWorkspaceField,
    persistDraft,
    replaceDraft,
  ]);

  const duplicateCurrentStoryboard = useCallback(async () => {
    await flushFocusedWorkspaceField();
    const currentDraft = draftRef.current;
    const currentStoryboardId = activeIdRef.current;
    if (!currentUser?.uid || !currentDraft) return;
    if (currentStoryboardId && isDirtyRef.current) {
      const saved = await persistDraft(
        currentStoryboardId,
        currentDraft,
        revisionRef.current,
      );
      if (!saved) return;
    }
    cancelDraftScopedRequests();
    try {
      const copy = createIndependentStoryboardCopy(currentDraft);
      const id = await imageStoryboardService.create(currentUser.uid, copy);
      const now = Date.now();
      const savedCopy: SavedImageStoryboard = {
        id,
        ...copy,
        createdAt: now,
        updatedAt: now,
      };
      setStoryboards((current) => upsertStoryboard(current, savedCopy));
      savedRevisionRef.current.set(id, copy.revision);
      saveConflictRef.current = false;
      setSaveConflict(false);
      activateStoryboardId(id);
      replaceDraft(copy);
      isDirtyRef.current = false;
      setWorkspaceSurface("editor");
      setIsDirty(false);
      setLastSavedAt(now);
      historyPastRef.current = [];
      historyFutureRef.current = [];
      setHistoryState({ canUndo: false, canRedo: false });
      toast.success("독립된 복사본을 만들었습니다.", {
        description:
          "장면 기획만 복사하고 이미지·영상·첨부 파일은 새 프로젝트에서 시작합니다.",
      });
    } catch (error) {
      console.error(error);
      toast.error("프로젝트를 복제하지 못했습니다.");
    }
  }, [
    activateStoryboardId,
    cancelDraftScopedRequests,
    currentUser?.uid,
    flushFocusedWorkspaceField,
    persistDraft,
    replaceDraft,
  ]);

  const duplicateCurrentStoryboardWithMedia = useCallback(async () => {
    await flushFocusedWorkspaceField();
    const currentDraft = draftRef.current;
    const currentStoryboardId = activeIdRef.current;
    if (!currentUser?.uid || !currentDraft || mediaCopyProgress) return;
    if (currentStoryboardId && isDirtyRef.current) {
      const saved = await persistDraft(
        currentStoryboardId,
        currentDraft,
        revisionRef.current,
      );
      if (!saved) return;
    }
    cancelDraftScopedRequests();
    setMediaCopyProgress({ completed: 0, total: 1 });
    try {
      const id = await imageStoryboardService.duplicateWithMedia(
        currentUser.uid,
        currentDraft,
        (completed, total) => setMediaCopyProgress({ completed, total }),
      );
      const savedCopy = await imageStoryboardService.get(currentUser.uid, id);
      setStoryboards((current) => upsertStoryboard(current, savedCopy));
      savedRevisionRef.current.set(id, savedCopy.revision);
      saveConflictRef.current = false;
      setSaveConflict(false);
      activateStoryboardId(id);
      replaceDraft({
        ...savedCopy,
        scenes: savedCopy.scenes.map((scene) => ({ ...scene })),
      });
      isDirtyRef.current = false;
      setWorkspaceSurface("editor");
      setIsDirty(false);
      setLastSavedAt(savedCopy.updatedAt);
      historyPastRef.current = [];
      historyFutureRef.current = [];
      setHistoryState({ canUndo: false, canRedo: false });
      toast.success("파일까지 독립된 전체 복사본을 만들었습니다.", {
        description:
          "이미지·영상·배경음과 영상 클립 기록을 새 프로젝트 저장 공간에 복사했습니다.",
      });
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "파일을 포함한 프로젝트 복제에 실패했습니다.",
      );
    } finally {
      setMediaCopyProgress(null);
    }
  }, [
    activateStoryboardId,
    cancelDraftScopedRequests,
    currentUser?.uid,
    flushFocusedWorkspaceField,
    mediaCopyProgress,
    persistDraft,
    replaceDraft,
  ]);

  const toggleArchiveCurrentStoryboard = useCallback(() => {
    if (!draft) return;
    const willArchive = !draft.archivedAt;
    updateDraft((current) => ({
      ...current,
      archivedAt: willArchive ? Date.now() : null,
    }));
    toast.success(
      willArchive
        ? "프로젝트를 보관함으로 옮겼습니다."
        : "프로젝트를 다시 활성화했습니다.",
    );
  }, [draft, updateDraft]);

  const deleteCurrentStoryboard = useCallback(async () => {
    if (!currentUser?.uid || !activeId || !draft) return;
    const confirmed = window.confirm(
      `"${draft.title}" 프로젝트를 영구 삭제할까요?\n장면 이미지·영상·완성본·배경음·버전 기록까지 함께 정리되며 복구할 수 없습니다.`,
    );
    if (!confirmed) return;
    cancelDraftScopedRequests();
    try {
      const authToken = await currentUser.getIdToken();
      await imageStoryboardService.removeWithMedia(authToken, activeId);
      setStoryboards((current) =>
        current.filter((storyboard) => storyboard.id !== activeId),
      );
      savedRevisionRef.current.delete(activeId);
      saveConflictRef.current = false;
      setSaveConflict(false);
      setLoadError(null);
      activateStoryboardId(null);
      replaceDraft(null);
      isDirtyRef.current = false;
      setIsDirty(false);
      toast.success("프로젝트와 연결된 생성 파일을 모두 정리했습니다.");
    } catch (error) {
      console.error(error);
      toast.error("프로젝트를 삭제하지 못했습니다.");
    }
  }, [
    activeId,
    activateStoryboardId,
    cancelDraftScopedRequests,
    currentUser,
    draft,
    replaceDraft,
  ]);

  const renameStoryboardProject = useCallback(
    async (storyboard: SavedImageStoryboard) => {
      if (!currentUser?.uid) return;
      const nextTitle = window
        .prompt("프로젝트 이름을 입력해 주세요.", storyboard.title)
        ?.trim()
        .slice(0, 100);
      if (!nextTitle || nextTitle === storyboard.title) return;
      if (storyboard.id === activeId && draft) {
        updateDraft((current) => ({ ...current, title: nextTitle }));
        return;
      }
      try {
        const nextRevision = await imageStoryboardService.save(
          currentUser.uid,
          storyboard.id,
          { ...storyboard, title: nextTitle },
        );
        const updatedAt = Date.now();
        setStoryboards((current) =>
          upsertStoryboard(current, {
            ...storyboard,
            title: nextTitle,
            revision: nextRevision,
            updatedAt,
          }),
        );
        savedRevisionRef.current.set(storyboard.id, nextRevision);
        toast.success("프로젝트 이름을 변경했습니다.");
      } catch (error) {
        console.error(error);
        toast.error("프로젝트 이름을 변경하지 못했습니다.");
      }
    },
    [activeId, currentUser?.uid, draft, updateDraft],
  );

  const duplicateStoryboardDesign = useCallback(
    async (storyboard: SavedImageStoryboard) => {
      if (!currentUser?.uid) return;
      if (storyboard.id === activeId && draft) {
        await duplicateCurrentStoryboard();
        return;
      }
      try {
        const copy = createIndependentStoryboardCopy(storyboard);
        const id = await imageStoryboardService.create(currentUser.uid, copy);
        const now = Date.now();
        setStoryboards((current) =>
          upsertStoryboard(current, {
            id,
            ...copy,
            createdAt: now,
            updatedAt: now,
          }),
        );
        savedRevisionRef.current.set(id, copy.revision);
        toast.success("기획 복사본을 만들었습니다.");
      } catch (error) {
        console.error(error);
        toast.error("기획 복사본을 만들지 못했습니다.");
      }
    },
    [activeId, currentUser?.uid, draft, duplicateCurrentStoryboard],
  );

  const duplicateStoryboardMedia = useCallback(
    async (storyboard: SavedImageStoryboard) => {
      if (!currentUser?.uid || mediaCopyProgress) return;
      if (storyboard.id === activeId && draft) {
        await duplicateCurrentStoryboardWithMedia();
        return;
      }
      setMediaCopyProgress({ completed: 0, total: 1 });
      try {
        const id = await imageStoryboardService.duplicateWithMedia(
          currentUser.uid,
          storyboard,
          (completed, total) => setMediaCopyProgress({ completed, total }),
        );
        const savedCopy = await imageStoryboardService.get(currentUser.uid, id);
        setStoryboards((current) => upsertStoryboard(current, savedCopy));
        savedRevisionRef.current.set(id, savedCopy.revision);
        toast.success("결과 파일까지 독립된 복사본을 만들었습니다.");
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "결과 포함 복사본을 만들지 못했습니다.",
        );
      } finally {
        setMediaCopyProgress(null);
      }
    },
    [
      activeId,
      currentUser?.uid,
      draft,
      duplicateCurrentStoryboardWithMedia,
      mediaCopyProgress,
    ],
  );

  const toggleArchiveStoryboard = useCallback(
    async (storyboard: SavedImageStoryboard) => {
      if (!currentUser?.uid) return;
      if (storyboard.id === activeId && draft) {
        toggleArchiveCurrentStoryboard();
        return;
      }
      const archivedAt = storyboard.archivedAt ? null : Date.now();
      try {
        const nextRevision = await imageStoryboardService.save(
          currentUser.uid,
          storyboard.id,
          { ...storyboard, archivedAt },
        );
        setStoryboards((current) =>
          upsertStoryboard(current, {
            ...storyboard,
            archivedAt,
            revision: nextRevision,
            updatedAt: Date.now(),
          }),
        );
        savedRevisionRef.current.set(storyboard.id, nextRevision);
        toast.success(
          archivedAt ? "프로젝트를 보관했습니다." : "프로젝트를 복원했습니다.",
        );
      } catch (error) {
        console.error(error);
        toast.error("프로젝트 보관 상태를 변경하지 못했습니다.");
      }
    },
    [activeId, currentUser?.uid, draft, toggleArchiveCurrentStoryboard],
  );

  const deleteStoryboardProject = useCallback(
    async (storyboard: SavedImageStoryboard) => {
      if (!currentUser) return;
      if (storyboard.id === activeId && draft) {
        await deleteCurrentStoryboard();
        return;
      }
      const confirmed = window.confirm(
        `"${storyboard.title}" 프로젝트를 영구 삭제할까요?\n이미지·영상·완성본·배경음·버전 기록까지 함께 정리됩니다.`,
      );
      if (!confirmed) return;
      try {
        const authToken = await currentUser.getIdToken();
        await imageStoryboardService.removeWithMedia(authToken, storyboard.id);
        setStoryboards((current) =>
          current.filter((item) => item.id !== storyboard.id),
        );
        savedRevisionRef.current.delete(storyboard.id);
        toast.success("프로젝트와 생성 파일을 정리했습니다.");
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "프로젝트를 삭제하지 못했습니다.",
        );
      }
    },
    [activeId, currentUser, deleteCurrentStoryboard, draft],
  );

  const exportCurrentStoryboard = useCallback(() => {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 70) || "storyboard"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("프로젝트 파일을 내보냈습니다.");
  }, [draft]);

  const importStoryboardFile = useCallback(
    async (file: File) => {
      if (!currentUser?.uid) return;
      cancelDraftScopedRequests();
      try {
        const parsed = ImageStoryboardSchema.parse(
          JSON.parse(await file.text()),
        );
        const imported: ImageStoryboard = {
          ...createIndependentStoryboardCopy(parsed),
          title: `${parsed.title} 가져옴`.slice(0, 100),
        };
        const id = await imageStoryboardService.create(
          currentUser.uid,
          imported,
        );
        const now = Date.now();
        setStoryboards((current) =>
          upsertStoryboard(current, {
            id,
            ...imported,
            createdAt: now,
            updatedAt: now,
          }),
        );
        savedRevisionRef.current.set(id, imported.revision);
        saveConflictRef.current = false;
        setSaveConflict(false);
        activateStoryboardId(id);
        replaceDraft(imported);
        isDirtyRef.current = false;
        setWorkspaceSurface("editor");
        setIsDirty(false);
        setLastSavedAt(now);
        toast.success("스토리보드 프로젝트를 가져왔습니다.");
      } catch (error) {
        console.error(error);
        toast.error("가져올 수 없는 프로젝트 파일입니다.");
      }
    },
    [
      activateStoryboardId,
      cancelDraftScopedRequests,
      currentUser?.uid,
      replaceDraft,
    ],
  );

  const refreshVersions = useCallback(async () => {
    const userId = currentUser?.uid;
    const storyboardIdAtRequest = activeIdRef.current;
    if (!userId || !storyboardIdAtRequest) {
      invalidateVersionHistory();
      return;
    }

    const requestId = versionHistoryRequestRef.current + 1;
    versionHistoryRequestRef.current = requestId;
    versionsProjectIdRef.current = null;
    setVersionsProjectId(null);
    setVersions([]);
    setIsVersionsLoading(true);
    try {
      const nextVersions = await imageStoryboardService.listVersions(
        userId,
        storyboardIdAtRequest,
      );
      if (
        !isMountedRef.current ||
        versionHistoryRequestRef.current !== requestId ||
        activeIdRef.current !== storyboardIdAtRequest
      ) {
        return;
      }
      versionsProjectIdRef.current = storyboardIdAtRequest;
      setVersionsProjectId(storyboardIdAtRequest);
      setVersions(nextVersions);
    } catch (error) {
      if (
        !isMountedRef.current ||
        versionHistoryRequestRef.current !== requestId ||
        activeIdRef.current !== storyboardIdAtRequest
      ) {
        return;
      }
      console.error(error);
      toast.error("버전 기록을 불러오지 못했습니다.");
    } finally {
      if (
        isMountedRef.current &&
        versionHistoryRequestRef.current === requestId &&
        activeIdRef.current === storyboardIdAtRequest
      ) {
        setIsVersionsLoading(false);
      }
    }
  }, [currentUser?.uid, invalidateVersionHistory]);

  const saveNamedVersion = useCallback(async () => {
    await flushFocusedWorkspaceField();
    const currentStoryboardId = activeIdRef.current;
    const currentDraft = draftRef.current;
    if (!currentUser?.uid || !currentStoryboardId || !currentDraft) return;
    if (isDirtyRef.current) {
      const saved = await persistDraft(
        currentStoryboardId,
        currentDraft,
        revisionRef.current,
      );
      if (!saved) return;
    }
    try {
      await imageStoryboardService.saveVersion(
        currentUser.uid,
        currentStoryboardId,
        currentDraft,
        `수동 저장 · ${KOREAN_DATE_TIME_FORMAT.format(new Date())}`,
      );
      if (activeIdRef.current !== currentStoryboardId) return;
      await refreshVersions();
      toast.success("현재 상태를 버전으로 저장했습니다.");
    } catch (error) {
      console.error(error);
      toast.error("버전을 저장하지 못했습니다.");
    }
  }, [
    currentUser?.uid,
    flushFocusedWorkspaceField,
    persistDraft,
    refreshVersions,
  ]);

  const restoreVersion = useCallback(
    (
      version: SavedStoryboardVersion,
      versionStoryboardId: string | null,
    ) => {
      const currentStoryboardId = activeIdRef.current;
      const currentDraft = draftRef.current;
      if (
        !currentDraft ||
        !currentStoryboardId ||
        versionStoryboardId !== currentStoryboardId ||
        versionsProjectIdRef.current !== currentStoryboardId
      ) {
        setIsHistoryOpen(false);
        toast.error("프로젝트가 변경되어 이 버전을 복원하지 않았습니다.", {
          description: "현재 프로젝트에서 버전 기록을 다시 열어 주세요.",
        });
        return;
      }
      updateDraft(() => ({
        ...version.storyboard,
        revision: currentDraft.revision,
      }));
      setIsHistoryOpen(false);
      toast.success(`"${version.label}" 상태를 복원했습니다.`, {
        description: "자동 저장 전에는 되돌리기로 취소할 수 있습니다.",
      });
    },
    [updateDraft],
  );

  const recoverConflictAsCopy = useCallback(async () => {
    if (!currentUser?.uid || !draft) return;
    try {
      const copy: ImageStoryboard = {
        ...draft,
        revision: 1,
        archivedAt: null,
        title: `${draft.title} 충돌 복구본`.slice(0, 100),
      };
      const id = await imageStoryboardService.create(currentUser.uid, copy);
      const now = Date.now();
      setStoryboards((current) =>
        upsertStoryboard(current, {
          id,
          ...copy,
          createdAt: now,
          updatedAt: now,
        }),
      );
      savedRevisionRef.current.set(id, copy.revision);
      saveConflictRef.current = false;
      activateStoryboardId(id);
      replaceDraft(copy);
      isDirtyRef.current = false;
      setIsDirty(false);
      setSaveConflict(false);
      setLoadError(null);
      setLastSavedAt(now);
      toast.success("충돌한 변경을 새 복사본으로 안전하게 보관했습니다.");
    } catch (error) {
      console.error(error);
      toast.error("복구 복사본을 만들지 못했습니다.");
    }
  }, [activateStoryboardId, currentUser?.uid, draft, replaceDraft]);

  const reloadLatestAfterConflict = useCallback(async () => {
    if (!currentUser?.uid || !activeId) return;
    const confirmed = window.confirm(
      "서버의 최신본을 불러올까요?\n현재 창에서 아직 저장하지 못한 변경은 사라집니다.",
    );
    if (!confirmed) return;
    try {
      const latest = await imageStoryboardService.get(
        currentUser.uid,
        activeId,
      );
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      historyPastRef.current = [];
      historyFutureRef.current = [];
      revisionRef.current = 0;
      savedRevisionRef.current.set(latest.id, latest.revision);
      saveConflictRef.current = false;
      setHistoryState({ canUndo: false, canRedo: false });
      replaceDraft({
        ...latest,
        scenes: latest.scenes.map((scene) => ({ ...scene })),
      });
      isDirtyRef.current = false;
      setIsDirty(false);
      setSaveConflict(false);
      setLoadError(null);
      setLastSavedAt(latest.updatedAt);
      toast.success("서버의 최신 버전을 불러왔습니다.");
    } catch (error) {
      console.error(error);
      toast.error("최신 버전을 불러오지 못했습니다.");
    }
  }, [activeId, currentUser?.uid, replaceDraft]);

  const handleAddProjectReferences = useCallback(
    async (assets: ImageReferenceDraft[]) => {
      if (
        !currentUser?.uid ||
        !activeId ||
        !assets.length ||
        referenceUploadInProgressRef.current
      )
        return;
      const storyboardIdAtRequest = activeId;
      const requestId = referenceUploadRequestRef.current + 1;
      referenceUploadRequestRef.current = requestId;
      referenceUploadInProgressRef.current = true;
      const available = Math.max(
        0,
        MAX_IMAGE_REFERENCE_ASSETS - projectReferenceAssets.length,
      );
      if (!available) {
        toast.info(
          `참조 사진은 최대 ${MAX_IMAGE_REFERENCE_ASSETS}장까지 저장할 수 있습니다.`,
        );
        return;
      }

      setIsUploadingReferences(true);
      try {
        const uploadResults = await Promise.allSettled(
          assets
            .slice(0, available)
            .map((asset) =>
              imageStoryboardService.uploadReferenceAsset(
                currentUser.uid,
                storyboardIdAtRequest,
                asset,
              ),
            ),
        );
        const uploaded = uploadResults.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const failedUpload = uploadResults.find(
          (result) => result.status === "rejected",
        );
        const requestIsCurrent =
          referenceUploadRequestRef.current === requestId &&
          activeIdRef.current === storyboardIdAtRequest &&
          isMountedRef.current;

        if (failedUpload || !requestIsCurrent) {
          const cleanup = uploaded.length
            ? await imageStoryboardService.deleteReclaimableStorageAssets(
                currentUser.uid,
                storyboardIdAtRequest,
                uploaded.flatMap((asset) =>
                  asset.storagePath
                    ? [
                        {
                          id: asset.id,
                          storagePath: asset.storagePath,
                          label: asset.name,
                          kind: "reference" as const,
                          queuedAt: Date.now(),
                        },
                      ]
                    : [],
                ),
              )
            : { failed: [] };

          if (requestIsCurrent && cleanup.failed.length) {
            updateDraft((current) => ({
              ...current,
              cleanupStatus: "retry",
              cleanupErrorMessage:
                "일부 참조 사진 업로드를 취소했지만 임시 파일 정리가 필요합니다. 파일 관리에서 다시 정리해 주세요.",
              reclaimableStorageAssets: cleanup.failed.reduce(
                (queued, failed) =>
                  queueReclaimableStorageAsset(
                    { ...current, reclaimableStorageAssets: queued },
                    {
                      storagePath: failed.storagePath,
                      label: "취소된 참조 사진",
                      kind: "reference",
                    },
                  ),
                current.reclaimableStorageAssets,
              ),
            }));
          }

          if (requestIsCurrent && failedUpload) {
            const message =
              failedUpload.reason instanceof Error
                ? failedUpload.reason.message
                : "참조 사진 업로드를 완료하지 못했습니다.";
            toast.error(message, {
              description:
                "이미 올라간 임시 파일은 자동으로 정리했습니다. 같은 사진을 다시 선택해 주세요.",
            });
          }
          return;
        }

        const persistedAssets = uploaded.map((asset) => ({
          ...asset,
          storagePath: asset.storagePath ?? null,
          createdAt: asset.createdAt ?? Date.now(),
        }));
        updateDraft((current) => ({
          ...current,
          referenceAssets: [
            ...current.referenceAssets,
            ...persistedAssets,
          ].slice(0, MAX_IMAGE_REFERENCE_ASSETS),
          videoProduction: resetStoryboardVideoProduction(
            current.videoProduction,
          ),
          scenes: current.scenes.map((scene) =>
            markSceneForReview(
              scene,
              "시각 기준 사진이 변경되어 기존 결과를 다시 확인해 주세요.",
            ),
          ),
        }));
        toast.success(
          `${persistedAssets.length}개 참조 사진을 프로젝트에 저장했습니다.`,
        );
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "참조 사진을 저장하지 못했습니다.",
        );
      } finally {
        if (referenceUploadRequestRef.current === requestId) {
          referenceUploadInProgressRef.current = false;
          if (isMountedRef.current) setIsUploadingReferences(false);
        }
      }
    },
    [activeId, currentUser?.uid, projectReferenceAssets.length, updateDraft],
  );

  const handleRemoveProjectReference = useCallback(
    (assetId: string) => {
      const removed = projectReferenceAssets.find(
        (asset) => asset.id === assetId,
      );
      updateDraft((current) => ({
        ...current,
        referenceAssets: current.referenceAssets.filter(
          (asset) => asset.id !== assetId,
        ),
        reclaimableStorageAssets: removed?.storagePath
          ? queueReclaimableStorageAsset(current, {
              storagePath: removed.storagePath,
              label: removed.name,
              kind: "reference",
            })
          : current.reclaimableStorageAssets,
        videoProduction: resetStoryboardVideoProduction(
          current.videoProduction,
        ),
        scenes: current.scenes.map((scene) => ({
          ...markSceneForReview(
            scene,
            "시각 기준 사진이 변경되어 기존 결과를 다시 확인해 주세요.",
          ),
          video: {
            ...scene.video,
            referenceAssetIds: scene.video.referenceAssetIds.filter(
              (id) => id !== assetId,
            ),
          },
        })),
      }));
    },
    [projectReferenceAssets, updateDraft],
  );

  const handleUpdateProjectReferenceRole = useCallback(
    (assetId: string, role: ImageReferenceRole) => {
      updateDraft((current) => ({
        ...current,
        referenceAssets: current.referenceAssets.map((asset) =>
          asset.id === assetId ? { ...asset, role } : asset,
        ),
        videoProduction: resetStoryboardVideoProduction(
          current.videoProduction,
        ),
        scenes: current.scenes.map((scene) =>
          markSceneForReview(
            scene,
            "참조 사진 역할이 변경되어 기존 결과를 다시 확인해 주세요.",
          ),
        ),
      }));
    },
    [updateDraft],
  );

  const acceptExistingSceneResult = useCallback(
    (sceneId: string) => {
      updateDraft((current) => ({
        ...current,
        scenes: current.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            assetFreshness: "current",
            staleReason: null,
            approvedImageArtifactId: scene.generatedImage
              ? `scene-image:${scene.generatedImage.id}`
              : scene.approvedImageArtifactId,
            approvedVideoArtifactId: scene.video.clipId
              ? scene.video.artifactId || scene.video.clipId
              : scene.approvedVideoArtifactId,
            video: sceneHasVideoResult(scene)
              ? {
                  ...scene.video,
                  status: "approved",
                  approvedAt: Date.now(),
                  artifactId:
                    scene.video.artifactId || scene.video.clipId || null,
                  errorMessage: null,
                }
              : scene.video,
          };
        }),
      }));
      toast.success("기존 결과를 현재 장면의 기준으로 확정했습니다.");
    },
    [updateDraft],
  );

  const applyStoryboardPlan = useCallback(
    (topic: string, plan: ImageStoryboardPlan) => {
      updateDraft((current) => ({
        ...current,
        topic,
        title: plan.title,
        logline: plan.logline,
        audience: plan.audience,
        artDirection: plan.artDirection,
        characterContinuity: plan.characterContinuity,
        settingContinuity: plan.settingContinuity,
        colorAndLighting: plan.colorAndLighting,
        videoProduction: resetStoryboardVideoProduction(
          current.videoProduction,
        ),
        scenes: plan.scenes.map((scene, index) => {
          const previous = current.scenes[index];
          const durationSeconds = parseSceneDurationSeconds(scene.duration);
          const planned: ImageStoryboardScene = {
            ...scene,
            id: previous?.id ?? crypto.randomUUID(),
            order: index + 1,
            status: "ready",
            duration: `${durationSeconds}초`,
            assetFreshness: "current",
            staleReason: null,
            imageDesignRevision: (previous?.imageDesignRevision ?? 0) + 1,
            videoDesignRevision: (previous?.videoDesignRevision ?? 0) + 1,
            approvedImageArtifactId: previous?.approvedImageArtifactId ?? null,
            approvedVideoArtifactId: previous?.approvedVideoArtifactId ?? null,
            generatedImage: previous?.generatedImage ?? null,
            video: previous
              ? { ...previous.video, durationSeconds }
              : { ...createStoryboardVideoScene(), durationSeconds },
          };
          return previous?.generatedImage ||
            (previous && sceneHasVideoResult(previous))
            ? markSceneForReview(
                planned,
                "AI 장면 설계가 바뀌었습니다. 기존 결과를 보존했으니 새 설계와 맞는지 확인해 주세요.",
              )
            : planned;
        }),
      }));
    },
    [updateDraft],
  );

  const previousGeneratedReferenceBySceneId = useMemo(() => {
    const references = new Map<string, string>();
    if (!draft?.usePreviousSceneAsReference) return references;

    let previousImageUrl: string | undefined;
    for (const scene of draft.scenes) {
      if (previousImageUrl) references.set(scene.id, previousImageUrl);
      if (scene.generatedImage?.url)
        previousImageUrl = scene.generatedImage.url;
    }
    return references;
  }, [draft]);

  const buildSceneReferences = useCallback(
    (sceneId: string): ImageReferenceInput[] => {
      const externalReferences: ImageReferenceInput[] =
        projectReferenceAssets.map(({ image, role }) => ({ image, role }));
      const previousSceneImage =
        previousGeneratedReferenceBySceneId.get(sceneId);
      if (
        !previousSceneImage ||
        externalReferences.some(
          (reference) => reference.image === previousSceneImage,
        )
      ) {
        return externalReferences;
      }

      const sceneReferences: ImageReferenceInput[] = [
        ...externalReferences,
        { image: previousSceneImage, role: "style" },
      ];
      return sceneReferences.slice(0, MAX_IMAGE_REFERENCE_REQUESTS);
    },
    [previousGeneratedReferenceBySceneId, projectReferenceAssets],
  );

  const handlePlanWithAI = useCallback(async () => {
    await flushFocusedWorkspaceField();
    const draftAtRequest = draftRef.current;
    if (
      !currentUser ||
      !draftAtRequest ||
      isPlanning ||
      isGenerating ||
      isBulkGenerating ||
      redesigningSceneId ||
      planningAbortControllerRef.current
    )
      return;
    const topic = draftAtRequest.topic.trim();
    if (topic.length < 2) {
      toast.error("스토리 주제를 두 글자 이상 입력해 주세요.");
      return;
    }

    const requestId = planningRequestRef.current + 1;
    planningRequestRef.current = requestId;
    const storyboardIdAtRequest = activeId;
    const revisionAtRequest = revisionRef.current;
    const abortController = new AbortController();
    planningAbortControllerRef.current = abortController;
    setIsPlanning(true);
    setLoadError(null);

    try {
      const referenceImages = await preparePlanningReferences(
        projectReferenceAssets,
      );
      const result = await generateImageStoryboardPlan(currentUser, {
        topic,
        sceneCount: draftAtRequest.plannedSceneCount,
        aspectRatio: draftAtRequest.aspectRatio,
        stylePreset: draftAtRequest.stylePreset,
        format: draftAtRequest.format,
        ...(referenceImages.length ? { referenceImages } : {}),
      }, { signal: abortController.signal });
      if (
        planningRequestRef.current !== requestId ||
        activeIdRef.current !== storyboardIdAtRequest ||
        revisionRef.current !== revisionAtRequest
      ) {
        toast.info(
          "설계 중 프로젝트 내용이 변경되어 결과를 적용하지 않았습니다. 최신 내용으로 다시 요청해 주세요.",
        );
        return;
      }
      if (activeId) {
        await imageStoryboardService
          .saveVersion(
            currentUser.uid,
            activeId,
            draftAtRequest,
            `AI 재설계 전 · ${KOREAN_DATE_TIME_FORMAT.format(new Date())}`,
          )
          .catch((error) =>
            console.warn("[Storyboard] pre-plan version save failed", error),
          );
      }
      if (
        planningRequestRef.current !== requestId ||
        activeIdRef.current !== storyboardIdAtRequest ||
        revisionRef.current !== revisionAtRequest
      )
        return;
      applyStoryboardPlan(topic, result.plan);
      setLastPlanReferenceAnalysis(result.referenceAnalysis);
      toast.success(
        `${result.plan.scenes.length}개 장면 설계를 적용했습니다.`,
        {
          description:
            result.referenceAnalysis === "visual"
              ? "첨부 사진의 인물·제품·공간 특징을 연속성 가이드에 반영했습니다."
              : "주제와 형식 기준으로 연속성 가이드를 만들었습니다.",
        },
      );
    } catch (error) {
      if (isAbortError(error)) return;
      const message =
        error instanceof Error
          ? error.message
          : "AI 장면 설계를 완료하지 못했습니다.";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (planningAbortControllerRef.current === abortController) {
        planningAbortControllerRef.current = null;
      }
      if (planningRequestRef.current === requestId && isMountedRef.current) {
        setIsPlanning(false);
      }
    }
  }, [
    activeId,
    applyStoryboardPlan,
    currentUser,
    flushFocusedWorkspaceField,
    isBulkGenerating,
    isGenerating,
    isPlanning,
    projectReferenceAssets,
    redesigningSceneId,
  ]);

  const handleRedesignScene = useCallback(
    async (scene: ImageStoryboardScene) => {
      if (
        !currentUser ||
        !draft ||
        isPlanning ||
        isGenerating ||
        isBulkGenerating ||
        redesigningSceneId ||
        sceneRedesignAbortControllerRef.current
      )
        return;
      const sceneIndex = draft.scenes.findIndex((item) => item.id === scene.id);
      if (sceneIndex < 0) return;

      const requestId = sceneRedesignRequestRef.current + 1;
      sceneRedesignRequestRef.current = requestId;
      const storyboardIdAtRequest = activeId;
      const revisionAtRequest = revisionRef.current;
      const abortController = new AbortController();
      sceneRedesignAbortControllerRef.current = abortController;
      const previousScene =
        sceneIndex > 0 ? draft.scenes[sceneIndex - 1] : undefined;
      const nextScene =
        sceneIndex < draft.scenes.length - 1
          ? draft.scenes[sceneIndex + 1]
          : undefined;
      setRedesigningSceneId(scene.id);
      setLoadError(null);

      try {
        const referenceImages = await preparePlanningReferences(
          projectReferenceAssets,
        );
        const result = await redesignImageStoryboardScene(currentUser, {
          topic: draft.topic,
          aspectRatio: draft.aspectRatio,
          stylePreset: draft.stylePreset,
          format: draft.format,
          artDirection: draft.artDirection,
          characterContinuity: draft.characterContinuity,
          settingContinuity: draft.settingContinuity,
          colorAndLighting: draft.colorAndLighting,
          scene,
          ...(previousScene ? { previousScene } : {}),
          ...(nextScene ? { nextScene } : {}),
          instruction: sceneRedesignInstructions[scene.id] ?? "",
          ...(referenceImages.length ? { referenceImages } : {}),
        }, { signal: abortController.signal });
        if (
          sceneRedesignRequestRef.current !== requestId ||
          activeIdRef.current !== storyboardIdAtRequest ||
          revisionRef.current !== revisionAtRequest
        ) {
          toast.info(
            "재설계 중 장면이 변경되어 결과를 적용하지 않았습니다. 최신 내용으로 다시 요청해 주세요.",
          );
          return;
        }

        updateDraft((current) => ({
          ...current,
          videoProduction: resetStoryboardVideoProduction(
            current.videoProduction,
          ),
          scenes: current.scenes.map((item) => {
            if (item.id !== scene.id) return item;
            const durationSeconds = parseSceneDurationSeconds(
              result.scene.duration,
              item.video.durationSeconds,
            );
            const next = markSceneForReview(
              {
                ...item,
                ...result.scene,
                status: "ready" as const,
                duration: `${durationSeconds}초`,
                video: {
                  ...item.video,
                  durationSeconds,
                },
              },
              "장면 설계가 변경되었습니다. 기존 결과를 유지했으니 다시 확인하거나 재생성해 주세요.",
            );
            return { ...next, status: deriveSceneStatus(next) };
          }),
        }));
        setLastPlanReferenceAnalysis(result.referenceAnalysis);
        setRedesignPanelSceneId(null);
        setSceneRedesignInstructions((current) => ({
          ...current,
          [scene.id]: "",
        }));
        setSceneRedesignScopes((current) => ({
          ...current,
          [scene.id]: "scene",
        }));
        toast.success(`${scene.order}번 장면을 새 설계로 교체했습니다.`, {
          description: scene.generatedImage
            ? "기존 생성 결과는 새 설계와 일치하지 않아 해제했습니다. 바로 새 이미지로 생성할 수 있습니다."
            : "다른 장면은 유지했습니다. 생성용 프롬프트를 확인한 뒤 바로 이미지를 만들 수 있습니다.",
        });
      } catch (error) {
        if (isAbortError(error)) return;
        const message =
          error instanceof Error
            ? error.message
            : "AI 장면 재설계를 완료하지 못했습니다.";
        setLoadError(message);
        toast.error(message);
      } finally {
        if (sceneRedesignAbortControllerRef.current === abortController) {
          sceneRedesignAbortControllerRef.current = null;
        }
        if (
          sceneRedesignRequestRef.current === requestId &&
          isMountedRef.current
        )
          setRedesigningSceneId(null);
      }
    },
    [
      activeId,
      currentUser,
      draft,
      isBulkGenerating,
      isGenerating,
      isPlanning,
      projectReferenceAssets,
      redesigningSceneId,
      sceneRedesignInstructions,
      updateDraft,
    ],
  );

  const handleRedesignFlow = useCallback(
    async (scene: ImageStoryboardScene) => {
      if (
        !currentUser ||
        !draft ||
        isPlanning ||
        isGenerating ||
        isBulkGenerating ||
        redesigningSceneId ||
        sceneRedesignAbortControllerRef.current
      )
        return;
      const sceneIndex = draft.scenes.findIndex((item) => item.id === scene.id);
      if (sceneIndex < 0) return;

      const affectedScenes = draft.scenes.slice(
        sceneIndex,
        sceneIndex + MAX_FLOW_REDESIGN_SCENES,
      );
      if (!affectedScenes.length) return;

      const requestId = sceneRedesignRequestRef.current + 1;
      sceneRedesignRequestRef.current = requestId;
      const storyboardIdAtRequest = activeId;
      const revisionAtRequest = revisionRef.current;
      const abortController = new AbortController();
      sceneRedesignAbortControllerRef.current = abortController;
      const previousScene =
        sceneIndex > 0 ? draft.scenes[sceneIndex - 1] : undefined;
      const nextScene = draft.scenes[sceneIndex + affectedScenes.length];
      setRedesigningSceneId(scene.id);
      setLoadError(null);

      try {
        const referenceImages = await preparePlanningReferences(
          projectReferenceAssets,
        );
        const result = await redesignImageStoryboardFlow(currentUser, {
          topic: draft.topic,
          aspectRatio: draft.aspectRatio,
          stylePreset: draft.stylePreset,
          format: draft.format,
          artDirection: draft.artDirection,
          characterContinuity: draft.characterContinuity,
          settingContinuity: draft.settingContinuity,
          colorAndLighting: draft.colorAndLighting,
          ...(previousScene ? { previousScene } : {}),
          scenes: affectedScenes,
          ...(nextScene ? { nextScene } : {}),
          instruction: sceneRedesignInstructions[scene.id] ?? "",
          ...(referenceImages.length ? { referenceImages } : {}),
        }, { signal: abortController.signal });
        if (
          sceneRedesignRequestRef.current !== requestId ||
          activeIdRef.current !== storyboardIdAtRequest ||
          revisionRef.current !== revisionAtRequest
        ) {
          toast.info(
            "재기획 중 장면이 변경되어 결과를 적용하지 않았습니다. 최신 내용으로 다시 요청해 주세요.",
          );
          return;
        }
        if (result.flow.scenes.length !== affectedScenes.length) {
          throw new Error(
            "AI가 요청한 장면 수만큼 흐름을 재기획하지 못했습니다. 다시 시도해 주세요.",
          );
        }

        if (activeId) {
          await imageStoryboardService
            .saveVersion(
              currentUser.uid,
              activeId,
              draft,
              `AI 흐름 재기획 전 · ${scene.order}번부터 ${affectedScenes.length}개 장면 · ${KOREAN_DATE_TIME_FORMAT.format(new Date())}`,
            )
            .catch((error) =>
              console.warn(
                "[Storyboard] pre-flow-redesign version save failed",
                error,
              ),
            );
        }
        if (
          sceneRedesignRequestRef.current !== requestId ||
          activeIdRef.current !== storyboardIdAtRequest ||
          revisionRef.current !== revisionAtRequest
        )
          return;

        updateDraft((current) => ({
          ...current,
          videoProduction: resetStoryboardVideoProduction(
            current.videoProduction,
          ),
          scenes: current.scenes.map((item, index) => {
            if (
              index < sceneIndex ||
              index >= sceneIndex + affectedScenes.length
            )
              return item;
            const redesigned = result.flow.scenes[index - sceneIndex];
            const durationSeconds = parseSceneDurationSeconds(
              redesigned.duration,
              item.video.durationSeconds,
            );
            const next = markSceneForReview(
              {
                ...item,
                ...redesigned,
                status: "ready" as const,
                duration: `${durationSeconds}초`,
                video: {
                  ...item.video,
                  durationSeconds,
                },
              },
              "AI 흐름 재기획으로 장면 기준이 변경되었습니다. 기존 결과를 보존했으니 다시 확인하거나 재생성해 주세요.",
            );
            return { ...next, status: deriveSceneStatus(next) };
          }),
        }));
        setLastPlanReferenceAnalysis(result.referenceAnalysis);
        setRedesignPanelSceneId(null);
        setSceneRedesignInstructions((current) => ({
          ...current,
          [scene.id]: "",
        }));
        setSceneRedesignScopes((current) => ({
          ...current,
          [scene.id]: "scene",
        }));
        toast.success(
          `${scene.order}번 장면부터 ${affectedScenes.length}개 장면의 흐름을 새로 설계했습니다.`,
          {
            description:
              "기존 이미지와 영상은 삭제하지 않고 확인 필요 상태로 보존했습니다. 필요한 장면만 다시 생성해 주세요.",
          },
        );
      } catch (error) {
        if (isAbortError(error)) return;
        const message =
          error instanceof Error
            ? error.message
            : "AI 흐름 재기획을 완료하지 못했습니다.";
        setLoadError(message);
        toast.error(message);
      } finally {
        if (sceneRedesignAbortControllerRef.current === abortController) {
          sceneRedesignAbortControllerRef.current = null;
        }
        if (
          sceneRedesignRequestRef.current === requestId &&
          isMountedRef.current
        )
          setRedesigningSceneId(null);
      }
    },
    [
      activeId,
      currentUser,
      draft,
      isBulkGenerating,
      isGenerating,
      isPlanning,
      projectReferenceAssets,
      redesigningSceneId,
      sceneRedesignInstructions,
      updateDraft,
    ],
  );

  const applyQuickStartTemplate = useCallback(
    (template: (typeof QUICK_START_TEMPLATES)[number]) => {
      const previousTopic = draft?.topic ?? "";
      const previousFormat = draft?.format ?? "brand-film";
      const previousSceneCount = draft?.plannedSceneCount ?? 5;
      updateDraft((current) => ({
        ...current,
        topic: template.topic,
        format: template.format,
        plannedSceneCount: template.sceneCount,
      }));
      toast.success(`${template.label} 시작값을 적용했습니다.`, {
        description: previousTopic.trim()
          ? "기존 주제와 설계 옵션을 바꿨습니다."
          : undefined,
        action: {
          label: "되돌리기",
          onClick: () => {
            updateDraft((current) => ({
              ...current,
              topic: previousTopic,
              format: previousFormat,
              plannedSceneCount: previousSceneCount,
            }));
            toast.success("이전 시작값으로 되돌렸습니다.");
          },
        },
      });
    },
    [draft?.format, draft?.plannedSceneCount, draft?.topic, updateDraft],
  );

  const addScene = useCallback(() => {
    updateDraft((current) => ({
      ...current,
      videoProduction: resetStoryboardVideoProduction(current.videoProduction),
      scenes: [...current.scenes, createScene(current.scenes.length + 1)],
    }));
  }, [updateDraft]);

  const updateScene = useCallback(
    (sceneId: string, patch: Partial<ImageStoryboardScene>) => {
      updateDraft((current) => ({
        ...current,
        videoProduction: resetStoryboardVideoProduction(
          current.videoProduction,
        ),
        scenes: current.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          const durationSeconds = patch.duration
            ? parseSceneDurationSeconds(
                patch.duration,
                scene.video.durationSeconds,
              )
            : scene.video.durationSeconds;
          const nextScene = markSceneForReview(
            {
              ...scene,
              ...patch,
              imageDesignRevision: scene.imageDesignRevision + 1,
              videoDesignRevision: scene.videoDesignRevision + 1,
              approvedVideoArtifactId: null,
              ...(patch.duration ? { duration: `${durationSeconds}초` } : {}),
              video: {
                ...scene.video,
                durationSeconds,
              },
            },
            "장면 내용이 변경되었습니다. 기존 결과를 유지했으니 다시 확인하거나 재생성해 주세요.",
          );
          return { ...nextScene, status: deriveSceneStatus(nextScene) };
        }),
      }));
    },
    [updateDraft],
  );

  const commitSceneText = useCallback(
    (sceneId: string | undefined, field: string, value: string) => {
      if (!sceneId) return;
      if (field === "title" && !value.trim()) {
        updateDraft((current) => ({
          ...current,
          scenes: current.scenes.map((scene) =>
            scene.id === sceneId
              ? { ...scene, title: `장면 ${scene.order}` }
              : scene,
          ),
        }));
        return;
      }
      updateScene(sceneId, { [field]: value } as Partial<ImageStoryboardScene>);
    },
    [updateDraft, updateScene],
  );

  const commitSceneRedesignInstruction = useCallback(
    (sceneId: string | undefined, _field: string, value: string) => {
      if (!sceneId) return;
      setSceneRedesignInstructions((current) => ({
        ...current,
        [sceneId]: value,
      }));
    },
    [],
  );

  const duplicateScene = useCallback(
    (scene: ImageStoryboardScene) => {
      if ((draft?.scenes.length ?? 0) >= 48) {
        toast.error("장면은 최대 48개까지 추가할 수 있습니다.");
        return;
      }
      const copiedSceneId = crypto.randomUUID();
      updateDraft((current) => {
        if (current.scenes.length >= 48) return current;
        const sourceIndex = current.scenes.findIndex(
          (item) => item.id === scene.id,
        );
        if (sourceIndex < 0) return current;
        const sourceScene = current.scenes[sourceIndex];
        const copy: ImageStoryboardScene = {
          ...sourceScene,
          id: copiedSceneId,
          title: `${sourceScene.title} 복사본`.slice(0, 80),
          status: sourceScene.generatedImage
            ? "generated"
            : deriveSceneStatus(sourceScene),
          assetFreshness: sourceScene.generatedImage ? "review" : "current",
          staleReason: sourceScene.generatedImage
            ? "원본 장면의 이미지를 복사했습니다. 새 장면 내용과 맞는지 확인해 주세요."
            : null,
          imageDesignRevision: sourceScene.imageDesignRevision + 1,
          videoDesignRevision: sourceScene.videoDesignRevision + 1,
          approvedImageArtifactId: null,
          approvedVideoArtifactId: null,
          video: copySceneVideoSettings(sourceScene),
        };
        const nextScenes = [...current.scenes];
        nextScenes.splice(sourceIndex + 1, 0, copy);
        return {
          ...current,
          videoProduction: resetStoryboardVideoProduction(
            current.videoProduction,
          ),
          scenes: reindexScenes(nextScenes),
        };
      });
      setActiveSceneId(copiedSceneId);
      toast.success(`${scene.order}번 장면을 복제했습니다.`, {
        description:
          "움직임·오디오·참조·편집 설정을 이어받았습니다. 새 영상은 필요한 경우에만 제작하세요.",
      });
    },
    [draft?.scenes.length, updateDraft],
  );

  const moveScene = useCallback(
    (sceneId: string, direction: -1 | 1) => {
      updateDraft((current) => {
        const index = current.scenes.findIndex((scene) => scene.id === sceneId);
        const targetIndex = index + direction;
        if (
          index < 0 ||
          targetIndex < 0 ||
          targetIndex >= current.scenes.length
        )
          return current;
        const nextScenes = [...current.scenes];
        [nextScenes[index], nextScenes[targetIndex]] = [
          nextScenes[targetIndex],
          nextScenes[index],
        ];
        return {
          ...current,
          videoProduction: resetStoryboardVideoProduction(
            current.videoProduction,
          ),
          scenes: reindexScenes(nextScenes),
        };
      });
    },
    [updateDraft],
  );

  const removeScene = useCallback(
    (sceneId: string) => {
      if (!draft || draft.scenes.length === 1) {
        toast.error("스토리보드에는 최소 한 개의 장면이 필요합니다.");
        return;
      }
      if (!window.confirm("이 장면을 스토리보드에서 제거할까요?")) return;
      updateDraft((current) => ({
        ...current,
        videoProduction: resetStoryboardVideoProduction(
          current.videoProduction,
        ),
        scenes: reindexScenes(
          current.scenes.filter((scene) => scene.id !== sceneId),
        ),
      }));
    },
    [draft, updateDraft],
  );

  const handleDownloadSceneImage = useCallback(
    async (scene: ImageStoryboardScene) => {
      const imageUrl = scene.generatedImage?.url;
      if (!imageUrl || downloadingSceneImageId) return;

      setDownloadingSceneImageId(scene.id);
      try {
        await downloadRemoteMedia(
          imageUrl,
          createDownloadFileName(
            `${draft?.title || "storyboard"}-scene-${String(scene.order).padStart(2, "0")}`,
            "png",
          ),
        );
        toast.success(`${scene.order}번 장면 이미지를 다운로드했습니다.`);
      } catch (error) {
        console.warn("[Storyboard] image download fallback", error);
        openRemoteMedia(imageUrl);
        toast.info(
          "자동 다운로드가 제한되어 원본 이미지를 새 창에서 열었습니다.",
        );
      } finally {
        setDownloadingSceneImageId(null);
      }
    },
    [downloadingSceneImageId, draft?.title],
  );

  const cleanupReplacedSceneImage = useCallback(
    async (
      replacedImage: ImageStoryboardScene["generatedImage"],
      replacedSceneId: string,
    ) => {
      if (!replacedImage || !currentUser?.uid || !activeId) return;
      const storagePath =
        replacedImage.storagePath ||
        storagePathFromFirebaseDownloadUrl(replacedImage.url);
      const ownedStoryboardPrefix = `users/${currentUser.uid}/storyboards/${activeId}/`;
      // Shared generation-history files are retired by the artifact audit.
      // Only a project-private copy is safe to delete immediately.
      if (!storagePath?.startsWith(ownedStoryboardPrefix)) return;
      const stillUsed = draft?.scenes.some(
        (scene) =>
          scene.id !== replacedSceneId &&
          scene.generatedImage?.id === replacedImage.id,
      );
      if (stillUsed) return;
      try {
        await imageStoryboardService.deleteGeneratedImage(
          currentUser.uid,
          activeId,
          { id: replacedImage.id, storagePath },
        );
      } catch (error) {
        console.error("[Storyboard] replaced image cleanup failed:", error);
        updateDraft((current) => {
          const isStillCurrent = current.scenes.some(
            (item) =>
              item.generatedImage?.id === replacedImage.id ||
              (storagePath && item.generatedImage?.storagePath === storagePath),
          );
          return {
            ...current,
            cleanupStatus: "retry",
            cleanupErrorMessage:
              "교체된 장면 이미지 파일을 정리하지 못했습니다. 파일 관리에서 다시 정리해 주세요.",
            reclaimableStorageAssets:
              storagePath && !isStillCurrent
                ? queueReclaimableStorageAsset(current, {
                    storagePath,
                    label: "교체된 장면 이미지",
                    kind: "scene-image",
                  })
                : current.reclaimableStorageAssets,
          };
        });
        toast.warning("새 이미지는 적용했지만 이전 파일 정리가 필요합니다.");
      }
    },
    [activeId, currentUser?.uid, draft?.scenes, updateDraft],
  );

  const handleGenerateScene = useCallback(
    async (scene: ImageStoryboardScene) => {
      if (
        !draft ||
        isGenerating ||
        isBulkGenerating ||
        isPlanning ||
        redesigningSceneId
      )
        return;
      const payload = buildGenerationPayload(
        draft,
        scene,
        buildSceneReferences(scene.id),
      );
      setGeneratingSceneId(scene.id);
      try {
        const image = await onGenerateScene(payload);
        updateDraft((current) => ({
          ...current,
          videoProduction: resetStoryboardVideoProduction(
            current.videoProduction,
          ),
          scenes: current.scenes.map((item) =>
            item.id === scene.id
              ? {
                  ...item,
                  status: "generated",
                  assetFreshness: "current",
                  staleReason: null,
                  generatedImage: {
                    id: image.id,
                    url: image.url,
                    generatedAt: Date.now(),
                    storagePath: image.storagePath ?? null,
                    provenance: activeId
                      ? {
                          kind: "storyboard-scene",
                          storyboardId: activeId,
                          sceneId: scene.id,
                        }
                      : null,
                  },
                  approvedImageArtifactId: `scene-image:${image.id}`,
                  approvedVideoArtifactId: null,
                  video: sceneHasVideoResult(item)
                    ? { ...item.video, status: "review", approvedAt: null }
                    : resetSceneVideo(item),
                }
              : item,
          ),
        }));
        await cleanupReplacedSceneImage(scene.generatedImage, scene.id);
        toast.success(`${scene.order}번 장면 생성이 완료되었습니다.`);
      } catch {
        // Generation errors are already surfaced by the image-generation mutation.
      } finally {
        setGeneratingSceneId(null);
      }
    },
    [
      activeId,
      buildSceneReferences,
      cleanupReplacedSceneImage,
      draft,
      isBulkGenerating,
      isGenerating,
      isPlanning,
      onGenerateScene,
      redesigningSceneId,
      updateDraft,
    ],
  );

  const handleGenerateAllScenes = useCallback(async () => {
    if (
      !draft ||
      isGenerating ||
      isBulkGenerating ||
      isPlanning ||
      redesigningSceneId
    )
      return;

    const pendingScenes = draft.scenes.filter(
      (scene) =>
        !scene.generatedImage?.url && deriveSceneStatus(scene) === "ready",
    );
    if (!pendingScenes.length) {
      toast.info(
        "생성할 준비가 된 장면이 없습니다. 먼저 AI 설계를 적용하거나 장면 내용을 입력해 주세요.",
      );
      return;
    }

    setIsBulkGenerating(true);
    let previousImageUrl: string | undefined;
    let generatedCount = 0;
    const externalReferences: ImageReferenceInput[] =
      projectReferenceAssets.map(({ image, role }) => ({ image, role }));

    const generateScene = async (
      scene: ImageStoryboardScene,
      references: ImageReferenceInput[],
    ) => {
      const payload = buildGenerationPayload(draft, scene, references);
      const image = await onGenerateScene(payload);
      generatedCount += 1;
      updateDraft((current) => ({
        ...current,
        videoProduction: resetStoryboardVideoProduction(
          current.videoProduction,
        ),
        scenes: current.scenes.map((item) =>
          item.id === scene.id
            ? {
                ...item,
                status: "generated",
                assetFreshness: "current",
                staleReason: null,
                generatedImage: {
                  id: image.id,
                  url: image.url,
                  generatedAt: Date.now(),
                  storagePath: image.storagePath ?? null,
                  provenance: activeId
                    ? {
                        kind: "storyboard-scene",
                        storyboardId: activeId,
                        sceneId: scene.id,
                      }
                    : null,
                },
                approvedImageArtifactId: `scene-image:${image.id}`,
                approvedVideoArtifactId: null,
                video: sceneHasVideoResult(item)
                  ? { ...item.video, status: "review", approvedAt: null }
                  : resetSceneVideo(item),
              }
            : item,
        ),
      }));
      return image;
    };

    try {
      if (draft.usePreviousSceneAsReference) {
        for (const scene of draft.scenes) {
          if (scene.generatedImage?.url) {
            previousImageUrl = scene.generatedImage.url;
            continue;
          }
          if (deriveSceneStatus(scene) !== "ready") continue;

          const references =
            previousImageUrl &&
            !externalReferences.some(
              (reference) => reference.image === previousImageUrl,
            )
              ? [
                  ...externalReferences,
                  { image: previousImageUrl, role: "style" as const },
                ].slice(0, MAX_IMAGE_REFERENCE_REQUESTS)
              : externalReferences;
          setGeneratingSceneId(scene.id);
          const image = await generateScene(scene, references);
          previousImageUrl = image.url;
        }
      } else {
        let nextSceneIndex = 0;
        const failures: Array<{ order: number; message: string }> = [];
        const workers = Array.from(
          { length: Math.min(2, pendingScenes.length) },
          async () => {
            while (nextSceneIndex < pendingScenes.length) {
              const scene = pendingScenes[nextSceneIndex];
              nextSceneIndex += 1;
              try {
                await generateScene(scene, externalReferences);
              } catch (error) {
                failures.push({
                  order: scene.order,
                  message:
                    error instanceof Error
                      ? error.message
                      : "이미지 생성에 실패했습니다.",
                });
              }
            }
          },
        );
        await Promise.all(workers);
        if (failures.length) {
          const message = `${failures.map((failure) => failure.order).join(", ")}번 장면은 생성하지 못했습니다. 해당 장면만 다시 시도해 주세요.`;
          setLoadError(message);
          toast.warning(message);
        }
      }
      if (generatedCount > 0) {
        toast.success(`${generatedCount}개 장면을 생성했습니다.`, {
          description: draft.usePreviousSceneAsReference
            ? "이전 장면을 다음 장면의 참조로 이어서 일관성을 유지했습니다."
            : "공통 참조와 연속성 가이드를 유지하며 최대 2장씩 병렬 처리했습니다.",
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "장면 일괄 생성 중 오류가 발생했습니다.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setGeneratingSceneId(null);
      setIsBulkGenerating(false);
    }
  }, [
    activeId,
    draft,
    isBulkGenerating,
    isGenerating,
    isPlanning,
    onGenerateScene,
    projectReferenceAssets,
    redesigningSceneId,
    updateDraft,
  ]);

  const progress = useMemo(() => {
    if (!draft) return { generated: 0, total: 0 };
    return {
      generated: draft.scenes.filter((scene) => Boolean(scene.generatedImage))
        .length,
      total: draft.scenes.length,
    };
  }, [draft]);

  const productionProgress = progress.total
    ? Math.round((progress.generated / progress.total) * 100)
    : 0;
  const hasTopic = Boolean(
    draft?.topic.trim() && draft.topic.trim().length >= 2,
  );
  const hasScenePlan = Boolean(
    draft?.scenes.some((scene) => scene.status !== "draft"),
  );
  const isWorkspaceBusy =
    isGenerating ||
    isBulkGenerating ||
    isPlanning ||
    Boolean(redesigningSceneId);
  const continuityReadyCount = draft
    ? [
        draft.artDirection,
        draft.characterContinuity,
        draft.settingContinuity,
        draft.colorAndLighting,
      ].filter((value) => value.trim()).length
    : 0;
  const linkedSceneCount =
    draft?.scenes.filter(
      (scene) => scene.continuityAnchor.trim() && scene.transition.trim(),
    ).length ?? 0;
  const readySceneCount =
    draft?.scenes.filter(
      (scene) =>
        !scene.generatedImage?.url && deriveSceneStatus(scene) === "ready",
    ).length ?? 0;

  const openPaidActionApproval = useCallback(
    (action: PendingStoryboardPaidAction) => {
      setPendingPaidAction(action);
      setPaidActionAccepted(false);
      const targetId =
        action.kind === "planning"
          ? "storyboard-planning-approval"
          : "storyboard-generation-approval";
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const target = document.getElementById(targetId);
          if (!target) return;
          target.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
            block: "center",
          });
          target.querySelector<HTMLElement>("input")?.focus({
            preventScroll: true,
          });
        });
      });
    },
    [],
  );

  const cancelPaidActionApproval = useCallback(() => {
    setPendingPaidAction(null);
    setPaidActionAccepted(false);
  }, []);

  const approvePendingPaidAction = useCallback(async () => {
    if (!paidActionAccepted || !pendingPaidAction) return;
    const action = pendingPaidAction;
    setPendingPaidAction(null);
    setPaidActionAccepted(false);

    if (action.kind === "planning") {
      await handlePlanWithAI();
      return;
    }
    if (action.kind === "bulk") {
      const currentReadyCount =
        draftRef.current?.scenes.filter(
          (scene) =>
            !scene.generatedImage?.url && deriveSceneStatus(scene) === "ready",
        ).length ?? 0;
      if (!currentReadyCount || currentReadyCount !== action.sceneCount) {
        toast.info(
          "승인 후 준비된 장면 수가 바뀌었습니다. 현재 장면을 확인하고 다시 승인해 주세요.",
        );
        return;
      }
      await handleGenerateAllScenes();
      return;
    }

    const currentScene = draftRef.current?.scenes.find(
      (scene) => scene.id === action.sceneId,
    );
    if (!currentScene) {
      toast.info("승인한 장면을 찾을 수 없습니다. 현재 장면을 다시 확인해 주세요.");
      return;
    }
    await handleGenerateScene(currentScene);
  }, [
    handleGenerateAllScenes,
    handleGenerateScene,
    handlePlanWithAI,
    paidActionAccepted,
    pendingPaidAction,
  ]);
  const activeScene =
    draft?.scenes.find((scene) => scene.id === activeSceneId) ??
    draft?.scenes[0] ??
    null;
  const approvedVideoCount =
    draft?.scenes.filter((scene) => scene.video.status === "approved").length ??
    0;
  const missingImageScenes = useMemo(
    () => draft?.scenes.filter((scene) => !scene.generatedImage) ?? [],
    [draft],
  );
  const generatedSceneCount = draft?.scenes.length
    ? draft.scenes.length - missingImageScenes.length
    : 0;
  const qualityReport = useMemo(
    () => (draft ? inspectStoryboardQuality(draft) : null),
    [draft],
  );
  const repairableQualityIssueCount = qualityReport
    ? qualityReport.issues.filter((item) =>
        [
          "scene-order",
          "missing-negative-prompt",
          "missing-transition",
        ].includes(item.code),
      ).length
    : 0;

  const applyBasicQualityRepairs = useCallback(() => {
    if (!draft) return;
    const repairedCount = draft.scenes.filter(
      (scene, index) =>
        scene.order !== index + 1 ||
        !scene.negativePrompt.trim() ||
        (index > 0 && !scene.transition.trim()),
    ).length;
    if (!repairedCount) {
      toast.info("자동으로 보완할 기본 항목이 없습니다.");
      return;
    }
    updateDraft((current) => {
      const orderChanged = current.scenes.some(
        (scene, index) => scene.order !== index + 1,
      );
      const scenes = current.scenes.map((scene, index) => {
        const nextTransition =
          index > 0 && !scene.transition.trim()
            ? "앞 장면의 시선과 조명 흐름을 이어 자연스럽게 전환"
            : scene.transition;
        const nextNegativePrompt = scene.negativePrompt.trim()
          ? scene.negativePrompt
          : DEFAULT_NEGATIVE_PROMPT;
        return {
          ...scene,
          order: index + 1,
          transition: nextTransition,
          negativePrompt: nextNegativePrompt,
        };
      });
      return {
        ...current,
        videoProduction: orderChanged
          ? resetStoryboardVideoProduction(current.videoProduction)
          : current.videoProduction,
        scenes: orderChanged
          ? scenes.map((scene) =>
              markSceneForReview(
                scene,
                "장면 순서를 복구했습니다. 최종 영상 조립 전에 영상 연결을 다시 확인해 주세요.",
              ),
            )
          : scenes,
      };
    });
    toast.success(`${repairedCount}개 장면의 기본 품질 항목을 보완했습니다.`);
  }, [draft, updateDraft]);

  const readinessChecks = useMemo<ReadinessCheck[]>(() => {
    if (!draft) return [];
    return [
      {
        id: "brief",
        label: "기획 기준",
        description: hasTopic
          ? "주제와 기본 기획이 준비됐습니다."
          : "영상 주제를 두 글자 이상 입력하세요.",
        ready: hasTopic,
        actionLabel: "기획 입력",
        action: "brief",
      },
      {
        id: "continuity",
        label: "연속성 가이드",
        description:
          continuityReadyCount === 4
            ? "아트·대상·공간·조명 기준이 모두 준비됐습니다."
            : `연속성 기준 ${continuityReadyCount}/4개가 작성됐습니다.`,
        ready: continuityReadyCount === 4,
        actionLabel: "가이드 확인",
        action: "continuity",
      },
      {
        id: "quality",
        label: "장면 품질 점검",
        description: qualityReport
          ? qualityReport.errorCount
            ? `수정이 필요한 오류 ${qualityReport.errorCount}개가 있습니다.`
            : qualityReport.warningCount
              ? `검토 권장 항목 ${qualityReport.warningCount}개가 있습니다.`
              : "장면 순서·프롬프트·전환·대사 설정을 확인했습니다."
          : "장면 품질을 확인하는 중입니다.",
        ready: Boolean(
          qualityReport &&
            qualityReport.errorCount === 0 &&
            qualityReport.warningCount === 0,
        ),
        actionLabel: "품질 점검",
        action: "quality",
      },
      {
        id: "scenes",
        label: "장면 이미지",
        description: missingImageScenes.length
          ? `${generatedSceneCount}/${draft.scenes.length}개 장면 이미지가 완성됐습니다. 누락: ${missingImageScenes.map((scene) => `${scene.order}번`).join(", ")}`
          : `${generatedSceneCount}/${draft.scenes.length}개 장면 이미지가 완성됐습니다.`,
        ready: generatedSceneCount === draft.scenes.length,
        actionLabel:
          missingImageScenes.length === 1
            ? `${missingImageScenes[0].order}번 찾기`
            : missingImageScenes.length
              ? `누락 ${missingImageScenes.length}개 찾기`
              : "장면 확인",
        action: "scenes",
      },
      {
        id: "production",
        label: "영상 승인",
        description: `${approvedVideoCount}/${draft.scenes.length}개 장면 영상이 승인됐습니다.`,
        ready: approvedVideoCount === draft.scenes.length,
        actionLabel: "제작 콘솔",
        action: "production",
      },
      {
        id: "final",
        label: "최종 완성본",
        description:
          draft.videoProduction.finalStatus === "completed"
            ? "병합된 최종 영상이 준비됐습니다."
            : "모든 장면 승인 후 자동 병합할 수 있습니다.",
        ready: draft.videoProduction.finalStatus === "completed",
        actionLabel: "결과 관리",
        action: "files",
      },
    ];
  }, [
    approvedVideoCount,
    continuityReadyCount,
    draft,
    generatedSceneCount,
    hasTopic,
    missingImageScenes,
    qualityReport,
  ]);
  const readinessScore = readinessChecks.length
    ? Math.round(
        (readinessChecks.filter((check) => check.ready).length /
          readinessChecks.length) *
          100,
      )
    : 0;

  const focusScene = useCallback((sceneId: string) => {
    setActiveSceneId(sceneId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(`storyboard-scene-${sceneId}`)?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "center",
        });
        document
          .getElementById(`scene-title-${sceneId}`)
          ?.focus({ preventScroll: true });
      });
    });
  }, []);

  const scrollToWorkspaceTarget = useCallback((targetId: string) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        });
      });
    });
  }, []);

  const openDashboard = useCallback(async () => {
    if (videoRequestPendingRef.current) { toast.info("영상 작업 접수가 끝난 뒤 이동할 수 있습니다."); return; }
    await flushFocusedWorkspaceField();
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (activeId && draftRef.current && isDirtyRef.current) {
      const saved = await persistDraft(activeId, draftRef.current, revisionRef.current);
      if (!saved) return;
    }
    if (activeId) projectPositionsRef.current.set(activeId, { mode: workspaceMode, sceneId: activeSceneId });
    intentRevealCleanupRef.current?.();
    setWorkspaceSurface("dashboard");
    setDashboardSnapshot({ ...dashboardSessionRef.current });
  }, [activeId, activeSceneId, workspaceMode, flushFocusedWorkspaceField, persistDraft]);

  const handleGoogleLogin = useCallback(async () => {
    if (!isAuthConfigured) {
      const message =
        "Firebase Google 인증 설정이 없습니다. 관리자에게 인증 환경 설정을 요청해 주세요.";
      setSignInError(message);
      toast.error("로그인 설정을 확인해 주세요.", { description: message });
      return;
    }

    setSignInError(null);
    setIsSigningIn(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error(error);
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
      const message = code.includes("unauthorized-domain")
        ? "현재 접속 주소가 Google 로그인 허용 도메인에 등록되지 않았습니다. 관리자에게 Firebase 승인 도메인 등록을 요청해 주세요."
        : code.includes("network-request-failed")
          ? "네트워크 연결을 확인한 뒤 다시 시도해 주세요."
          : code.includes("popup-closed") || code.includes("cancelled-popup")
            ? "로그인 창이 완료 전에 닫혔습니다. 팝업 차단을 해제하고 다시 시도해 주세요."
            : "로그인을 완료하지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 인증 설정을 확인해 달라고 요청해 주세요.";
      setSignInError(message);
      toast.error("Google 로그인을 완료하지 못했습니다.", {
        description: message,
      });
    } finally {
      setIsSigningIn(false);
    }
  }, [isAuthConfigured, loginWithGoogle]);

  const openProductionConsole = useCallback(() => {
    setWorkspaceSurface("editor");
    setWorkspaceMode("video");
    scrollToWorkspaceTarget("storyboard-video-automation");
  }, [scrollToWorkspaceTarget]);

  const openFileManager = useCallback(() => {
    setWorkspaceSurface("editor");
    setWorkspaceMode("video");
    scrollToWorkspaceTarget("storyboard-project-files");
  }, [scrollToWorkspaceTarget]);

  const handleReadinessAction = useCallback(
    (action: ReadinessCheck["action"]) => {
      if (action === "production") {
        openProductionConsole();
        return;
      }
      if (action === "files") {
        openFileManager();
        return;
      }
      setWorkspaceSurface("editor");
      setWorkspaceMode("storyboard");
      if (action === "scenes" && missingImageScenes[0]) {
        focusScene(missingImageScenes[0].id);
        return;
      }
      const targetByAction: Record<
        Exclude<ReadinessCheck["action"], "production" | "files">,
        string
      > = {
        brief: "storyboard-project-brief",
        references: "storyboard-reference-assets",
        continuity: "storyboard-continuity-settings",
        quality: "storyboard-quality-report",
        scenes: activeScene
          ? `storyboard-scene-${activeScene.id}`
          : "storyboard-scenes",
      };
      scrollToWorkspaceTarget(targetByAction[action]);
    },
    [
      activeScene,
      focusScene,
      missingImageScenes,
      openFileManager,
      openProductionConsole,
      scrollToWorkspaceTarget,
    ],
  );

  return (
    <Overlay
      $pageView={presentation === "page"}
      role={presentation === "dialog" ? "dialog" : undefined}
      aria-modal={presentation === "dialog" ? "true" : undefined}
      aria-labelledby="storyboard-workspace-title"
    >
      <Workspace ref={workspaceRef} $pageView={presentation === "page"}>
        <WorkspaceHeader
          data-page-view={presentation === "page"}
          data-signed-out={!currentUser}
        >
          <TitleGroup data-page-view={presentation === "page"}>
            <HeaderIcon className="fas fa-clapperboard" aria-hidden="true" />
            <div>
              <Eyebrow>CREATIVE WORKSPACE</Eyebrow>
              <h2 id="storyboard-workspace-title">스토리보드</h2>
            </div>
          </TitleGroup>
          <HeaderActions>
            {draft ? (
                <HeaderToolGroup role="group" aria-label="편집 기록">
                <HeaderToolButton
                  type="button"
                  onClick={undoDraft}
                  disabled={!historyState.canUndo}
                  aria-label="되돌리기"
                  title="되돌리기"
                >
                  <i className="fas fa-rotate-left" aria-hidden="true" />
                </HeaderToolButton>
                <HeaderToolButton
                  type="button"
                  onClick={redoDraft}
                  disabled={!historyState.canRedo}
                  aria-label="다시 실행"
                  title="다시 실행"
                >
                  <i className="fas fa-rotate-right" aria-hidden="true" />
                </HeaderToolButton>
                <HeaderToolButton
                  type="button"
                  onClick={() => {
                    const nextOpen = !isHistoryOpen;
                    setIsHistoryOpen(nextOpen);
                    if (nextOpen) void refreshVersions();
                  }}
                  aria-label="버전 기록"
                  aria-expanded={isHistoryOpen}
                  title="버전 기록"
                >
                  <i className="fas fa-clock-rotate-left" aria-hidden="true" />
                </HeaderToolButton>
              </HeaderToolGroup>
            ) : null}
            <SaveState aria-live="polite">
              {!currentUser
                ? "로그인 전"
                : projectSwitchState === "saving"
                  ? "변경 저장 후 이동 중…"
                : projectSwitchState === "loading"
                  ? "프로젝트 여는 중…"
                  : isSaving
                    ? "저장 중…"
                    : loadError && isDirty
                      ? "저장되지 않음"
                    : isDirty
                      ? "변경 저장 대기"
                      : formatSavedTime(lastSavedAt)}
            </SaveState>
            <CloseButton
              ref={closeButtonRef}
              type="button"
              onClick={() => void handleClose()}
              aria-label={
                presentation === "page"
                  ? "통합 관리로 돌아가기"
                  : "스토리보드 닫기"
              }
              title={
                presentation === "page"
                  ? "통합 관리로 돌아가기"
                  : "스토리보드 닫기"
              }
            >
              <i
                className={`fas ${presentation === "page" ? "fa-arrow-left" : "fa-times"}`}
                aria-hidden="true"
              />
            </CloseButton>
          </HeaderActions>
        </WorkspaceHeader>

        {authLoading ? (
          <SignInState role="status" aria-live="polite">
            <div className="signin-card signin-loading">
              <span className="signin-icon"><i className="fas fa-spinner fa-spin" aria-hidden="true" /></span>
              <h3>스토리보드 작업공간을 준비하고 있습니다</h3>
              <p>로그인 상태와 저장된 프로젝트를 안전하게 확인하는 중입니다.</p>
            </div>
          </SignInState>
        ) : !currentUser ? (
          <SignInState
            role="region"
            aria-labelledby="storyboard-sign-in-title"
          >
            <div className="signin-card">
              <div className="signin-intro">
                <span className="signin-icon"><i className="fas fa-clapperboard" aria-hidden="true" /></span>
                <span className="signin-eyebrow">STORYBOARD PRODUCTION</span>
                <h3 id="storyboard-sign-in-title">아이디어부터 완성 영상까지 한 작업공간에서</h3>
                <p>로그인하면 프로젝트와 장면, 생성 결과, 편집 버전을 자동 저장하고 다른 기기에서도 안전하게 이어서 제작할 수 있습니다.</p>
              </div>
              <ol className="signin-journey" aria-label="스토리보드 제작 과정">
                <li><span>1</span><div><strong>기획·장면 구성</strong><small>주제와 스타일로 장면 흐름 설계</small></div></li>
                <li><span>2</span><div><strong>이미지·영상 제작</strong><small>장면별 생성, 검토, 재설계</small></div></li>
                <li><span>3</span><div><strong>편집·최종 전달</strong><small>연결, 오디오, 렌더링, 다운로드</small></div></li>
              </ol>
              <ul className="signin-trust" aria-label="로그인과 데이터 사용 안내">
                <li><i className="fas fa-cloud-arrow-up" aria-hidden="true" /><span>프로젝트 변경 사항과 생성 결과를 사용자별 작업공간에 자동 저장합니다.</span></li>
                <li><i className="fas fa-shield-halved" aria-hidden="true" /><span>로그인만으로 AI 생성을 시작하지 않으며, 생성 단계에서 비용과 외부 전송을 별도로 확인합니다.</span></li>
              </ul>
              {!isAuthConfigured ? <p className="signin-warning" role="alert">현재 Google 로그인 설정을 확인할 수 없습니다. 관리자에게 Firebase 인증 설정을 요청해 주세요.</p> : null}
              {signInError ? <p className="signin-warning" role="alert">{signInError}</p> : null}
              <button
                type="button"
                onClick={() => void handleGoogleLogin()}
                disabled={isSigningIn || !isAuthConfigured}
                aria-busy={isSigningIn}
              >
                <i className="fab fa-google" aria-hidden="true" />
                {isSigningIn ? "로그인 중…" : "Google로 로그인하고 작업 시작"}
              </button>
              <small className="signin-footnote">로그인 전에는 프로젝트 저장이나 AI 생성이 시작되지 않습니다.</small>
            </div>
          </SignInState>
        ) : (
          <WorkspaceBody
            $dashboardMode={workspaceSurface === "dashboard"}
            $compactVideoMode={
              workspaceSurface === "editor" && workspaceMode === "video"
            }
          >
            {workspaceSurface === "editor" ? (
              <ProjectSidebar aria-label="스토리보드 프로젝트 목록">
              <SidebarTop>
                <div>
                  <SidebarLabel>프로젝트</SidebarLabel>
                  <SidebarMeta>{storyboards.length}개</SidebarMeta>
                </div>
                <AddProjectButton
                  type="button"
                  onClick={() => void createNewStoryboard()}
                  aria-label="새 스토리보드 만들기"
                >
                  <i className="fas fa-plus" aria-hidden="true" />
                </AddProjectButton>
              </SidebarTop>
              <SidebarDashboardButton
                type="button"
                aria-label="프로젝트 대시보드 열기"
                $active={false}
                onClick={() => void openDashboard()}
              >
                <i className="fas fa-chart-pie" aria-hidden="true" />
                <span>
                  <strong>프로젝트 대시보드</strong>
                  <small>진행률·검토·완성본 관리</small>
                </span>
              </SidebarDashboardButton>
              {isLoading ? (
                <SidebarMessage>불러오는 중…</SidebarMessage>
              ) : storyboards.length === 0 ? (
                <SidebarMessage>
                  저장된 스토리보드가 없습니다.
                  <br />새 프로젝트를 만들어 시작하세요.
                </SidebarMessage>
              ) : (
                <ProjectList>
                  {storyboards.map((storyboard) => (
                    <ProjectRow key={storyboard.id}>
                      <ProjectItem
                        type="button"
                        $active={activeId === storyboard.id}
                        aria-current={
                          activeId === storyboard.id ? "page" : undefined
                        }
                        onClick={() => void selectStoryboard(storyboard)}
                      >
                        <span className="project-title">
                          {storyboard.title}
                        </span>
                        <span className="project-meta">
                          {storyboard.scenes.length}장면 ·{" "}
                          {storyboard.aspectRatio}
                        </span>
                        <ProjectStatusBadge>
                          {
                            STORYBOARD_PROJECT_STATUS_LABELS[
                              getStoryboardProjectStatus(storyboard)
                            ]
                          }
                        </ProjectStatusBadge>
                      </ProjectItem>
                      <ProjectRowMenu>
                        <summary
                          aria-label={`${storyboard.title} 프로젝트 관리`}
                          title="프로젝트 관리"
                        >
                          <i
                            className="fas fa-ellipsis-vertical"
                            aria-hidden="true"
                          />
                        </summary>
                        <div role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void selectStoryboard(storyboard)}
                          >
                            <i
                              className="fas fa-folder-open"
                              aria-hidden="true"
                            />
                            열기
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              void renameStoryboardProject(storyboard)
                            }
                          >
                            <i className="fas fa-pen" aria-hidden="true" />
                            이름 변경
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              void duplicateStoryboardDesign(storyboard)
                            }
                          >
                            <i className="fas fa-copy" aria-hidden="true" />
                            기획만 복제
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={Boolean(mediaCopyProgress)}
                            onClick={() =>
                              void duplicateStoryboardMedia(storyboard)
                            }
                          >
                            <i
                              className="fas fa-photo-film"
                              aria-hidden="true"
                            />
                            결과 포함 복제
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              void toggleArchiveStoryboard(storyboard)
                            }
                          >
                            <i
                              className={`fas ${
                                storyboard.archivedAt
                                  ? "fa-box-open"
                                  : "fa-box-archive"
                              }`}
                              aria-hidden="true"
                            />
                            {storyboard.archivedAt ? "복원" : "보관"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            onClick={() =>
                              void deleteStoryboardProject(storyboard)
                            }
                          >
                            <i className="fas fa-trash" aria-hidden="true" />
                            삭제
                          </button>
                        </div>
                      </ProjectRowMenu>
                    </ProjectRow>
                  ))}
                </ProjectList>
              )}
              </ProjectSidebar>
            ) : null}

            {workspaceSurface === "dashboard" ? (
              <StoryboardProjectDashboard
                sessionRef={dashboardSessionRef}
                initialSession={dashboardSnapshot}
                storyboards={storyboards}
                isLoading={isLoading}
                loadError={subscriptionError}
                onCreate={() => void createNewStoryboard()}
                onOpen={(storyboard, intent) =>
                  void selectStoryboard(storyboard, intent)
                }
                onRetry={retryStoryboardSubscription}
              />
            ) : draft ? (
              <>
                <BoardContent>
                  {loadError ? (
                    <ErrorNotice role="alert">
                      <span>{loadError}</span>
                      {saveConflict ? (
                        <div className="conflict-actions">
                          <button
                            type="button"
                            onClick={() => void recoverConflictAsCopy()}
                          >
                            복사본으로 보관
                          </button>
                          <button
                            type="button"
                            onClick={() => void reloadLatestAfterConflict()}
                          >
                            최신본 불러오기
                          </button>
                        </div>
                      ) : null}
                      {isDirty && !saveConflict ? <button type="button" disabled={isSaving} onClick={() => { if (activeId && draftRef.current) void persistDraft(activeId, draftRef.current, revisionRef.current); }}>다시 저장</button> : null}
                    </ErrorNotice>
                  ) : null}
                  {isHistoryOpen ? (
                    <VersionPanel aria-label="프로젝트 버전 기록">
                      <VersionPanelHeader>
                        <div>
                          <strong>버전 기록</strong>
                          <span>
                            중요한 시점을 최대 24개까지 보관하고 언제든 되돌릴
                            수 있습니다.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void saveNamedVersion()}
                        >
                          <i className="fas fa-bookmark" aria-hidden="true" />{" "}
                          현재 버전 저장
                        </button>
                      </VersionPanelHeader>
                      {isVersionsLoading ? (
                        <VersionEmpty aria-live="polite">
                          버전 기록을 불러오는 중…
                        </VersionEmpty>
                      ) : versionsProjectId === activeId && versions.length ? (
                        <VersionList>
                          {versions.map((version) => (
                            <button
                              key={version.id}
                              type="button"
                              onClick={() =>
                                restoreVersion(version, versionsProjectId)
                              }
                            >
                              <strong>{version.label}</strong>
                              <span>
                                {version.createdAt
                                  ? KOREAN_DATE_TIME_FORMAT.format(
                                      version.createdAt,
                                    )
                                  : "저장 시간 확인 중"}
                              </span>
                            </button>
                          ))}
                        </VersionList>
                      ) : (
                        <VersionEmpty>
                          아직 직접 저장한 버전이 없습니다.
                        </VersionEmpty>
                      )}
                    </VersionPanel>
                  ) : null}
                  <BoardHeader id="storyboard-project-brief">
                    <div>
                      <BoardKicker>PROJECT BRIEF</BoardKicker>
                      <TitleInput
                        id="storyboard-title"
                        name="storyboardTitle"
                        value={draft.title}
                        onCommit={(title) =>
                          updateStoryboardMetadata((current) => ({
                            ...current,
                            title: title || "새 스토리보드",
                          }))
                        }
                        delayMs={450}
                        aria-label="스토리보드 제목"
                        maxLength={100}
                        autoComplete="off"
                      />
                      <details className="project-management">
                        <summary>프로젝트 관리</summary>
                      <ProjectActionRow aria-label="프로젝트 관리">
                        <button
                          type="button"
                          onClick={() => void duplicateCurrentStoryboard()}
                        >
                          <i className="fas fa-copy" aria-hidden="true" /> 기획
                          복제
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void duplicateCurrentStoryboardWithMedia()
                          }
                          disabled={Boolean(mediaCopyProgress)}
                        >
                          <i
                            className={
                              mediaCopyProgress
                                ? "fas fa-spinner fa-spin"
                                : "fas fa-photo-film"
                            }
                            aria-hidden="true"
                          />{" "}
                          {mediaCopyProgress
                            ? `파일 복사 ${mediaCopyProgress.completed}/${mediaCopyProgress.total}`
                            : "결과 포함 복제"}
                        </button>
                        <button type="button" onClick={exportCurrentStoryboard}>
                          <i className="fas fa-download" aria-hidden="true" />{" "}
                          내보내기
                        </button>
                        <label>
                          <i className="fas fa-upload" aria-hidden="true" />{" "}
                          가져오기
                          <input
                            type="file"
                            accept="application/json,.json"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void importStoryboardFile(file);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={toggleArchiveCurrentStoryboard}
                        >
                          <i
                            className={`fas ${draft.archivedAt ? "fa-box-open" : "fa-box-archive"}`}
                            aria-hidden="true"
                          />
                          {draft.archivedAt ? "복원" : "보관"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void deleteCurrentStoryboard()}
                        >
                          <i className="fas fa-trash" aria-hidden="true" /> 삭제
                        </button>
                      </ProjectActionRow>
                      </details>
                    </div>
                    <ProgressSummary>
                      <span>장면 이미지</span>
                      <strong>
                        {progress.generated}/{progress.total}
                      </strong>
                      <small>
                        이미지 준비 · 영상 승인 {approvedVideoCount}/{progress.total}
                      </small>
                      <ProgressTrack aria-hidden="true">
                        <ProgressFill $progress={productionProgress} />
                      </ProgressTrack>
                    </ProgressSummary>
                  </BoardHeader>

                  <WorkspaceModeSwitch aria-label="스토리보드 작업 모드">
                    <button
                      type="button"
                      className={workspaceMode === "storyboard" ? "active" : ""}
                      onClick={() => setWorkspaceMode("storyboard")}
                      aria-pressed={workspaceMode === "storyboard"}
                    >
                      <i
                        className="fas fa-table-cells-large"
                        aria-hidden="true"
                      />
                      장면 설계
                    </button>
                    <button
                      type="button"
                      className={workspaceMode === "video" ? "active" : ""}
                      onClick={() => setWorkspaceMode("video")}
                      aria-pressed={workspaceMode === "video"}
                    >
                      <i className="fas fa-film" aria-hidden="true" />
                      영상 제작
                      {draft.scenes.some(
                        (scene) => scene.video.status === "approved",
                      ) ? (
                        <span>
                          {
                            draft.scenes.filter(
                              (scene) => scene.video.status === "approved",
                            ).length
                          }
                        </span>
                      ) : null}
                    </button>
                  </WorkspaceModeSwitch>

                  {workspaceMode === "storyboard" ? (
                    <>
                      <ProductionFlow aria-label="빠른 제작 흐름">
                        <WorkflowStep $complete={hasTopic} $active={!hasTopic}>
                          <WorkflowNumber>01</WorkflowNumber>
                          <div>
                            <strong>주제·AI 설계</strong>
                            <span>
                              {hasTopic
                                ? "주제 준비됨 · AI 설계 가능"
                                : "주제를 한 줄로 적어주세요"}
                            </span>
                          </div>
                          <i
                            className={
                              hasTopic
                                ? "fas fa-check"
                                : "fas fa-wand-magic-sparkles"
                            }
                            aria-hidden="true"
                          />
                        </WorkflowStep>
                        <WorkflowStep
                          $complete={true}
                          $active={false}
                        >
                          <WorkflowNumber>02</WorkflowNumber>
                          <div>
                            <strong>선택 시각 기준</strong>
                            <span>
                              {projectReferenceAssets.length
                                ? `참조 ${projectReferenceAssets.length}장 준비됨`
                                : "필요할 때 추가하면 일관성이 높아집니다"}
                            </span>
                          </div>
                          <i
                            className={
                              projectReferenceAssets.length
                                ? "fas fa-check"
                                : "fas fa-images"
                            }
                            aria-hidden="true"
                          />
                        </WorkflowStep>
                        <WorkflowStep
                          $complete={progress.generated > 0}
                          $active={hasScenePlan && progress.generated === 0}
                        >
                          <WorkflowNumber>03</WorkflowNumber>
                          <div>
                            <strong>장면 생성</strong>
                            <span>
                              {progress.generated
                                ? `${progress.generated}개 장면 결과 확인`
                                : hasScenePlan
                                  ? "장면별로 생성해 보세요"
                                  : "설계 뒤 바로 생성할 수 있습니다"}
                            </span>
                          </div>
                          <i
                            className={
                              progress.generated
                                ? "fas fa-check"
                                : "fas fa-film"
                            }
                            aria-hidden="true"
                          />
                        </WorkflowStep>
                      </ProductionFlow>

                      <StoryboardPlanningPresets
                        key={activeId}
                        userId={currentUser.uid}
                        storyboard={draft}
                        disabled={isWorkspaceBusy || isUploadingReferences}
                        onApply={(settings) => {
                          if (videoRequestPendingRef.current || isWorkspaceBusy || isUploadingReferences
                            || !draftRef.current || isStoryboardPresetApplyBusy(draftRef.current)) return false;
                          updateDraft((current) => applyStoryboardPlanningPreset(current, settings));
                          return true;
                        }}
                      />
                      <QuickPlanner aria-labelledby="quick-storyboard-title">
                        <QuickPlannerHeading>
                          <div>
                            <span>01 · TOPIC & AI STORY PLAN</span>
                            <h3 id="quick-storyboard-title">
                              주제 한 줄로 완성도 있는 장면을 설계합니다
                            </h3>
                          </div>
                          <PlannerState $ready={hasTopic} aria-live="polite">
                            <i
                              className={
                                hasTopic ? "fas fa-check-circle" : "fas fa-pen"
                              }
                              aria-hidden="true"
                            />
                            {hasTopic ? "설계 준비 완료" : "주제를 입력하세요"}
                          </PlannerState>
                        </QuickPlannerHeading>
                        <QuickPlannerFields>
                          <QuickTopicField>
                            <label htmlFor="storyboard-topic">
                              스토리 주제
                            </label>
                            <BufferedTextarea
                              id="storyboard-topic"
                              name="storyboardTopic"
                              value={draft.topic}
                              field="topic"
                              onValueCommit={commitStoryboardText}
                              placeholder="예: 신제품이 바쁜 현장 관리자에게 여유를 되찾아 주는 30초 브랜드 영상"
                              aria-describedby="storyboard-topic-help"
                              maxLength={240}
                              autoComplete="off"
                            />
                            <TopicHint
                              id="storyboard-topic-help"
                              aria-live="polite"
                            >
                              {hasTopic
                                ? `${draft.plannedSceneCount}개 장면으로 AI 설계를 시작할 수 있습니다.`
                                : "두 글자 이상 입력하면 AI 장면 설계를 시작할 수 있습니다."}
                            </TopicHint>
                          </QuickTopicField>
                          <QuickSelectField>
                            <label htmlFor="storyboard-format">
                              콘텐츠 형식
                            </label>
                            <select
                              id="storyboard-format"
                              name="storyboardFormat"
                              value={draft.format}
                              onChange={(event) =>
                                updateStoryboardMetadata((current) => ({
                                  ...current,
                                  format: event.target
                                    .value as StoryboardFormat,
                                }))
                              }
                              disabled={isPlanning || isBulkGenerating}
                            >
                              {STORYBOARD_FORMAT_OPTIONS.map((format) => (
                                <option key={format.value} value={format.value}>
                                  {format.label}
                                </option>
                              ))}
                            </select>
                          </QuickSelectField>
                          <QuickSelectField>
                            <label htmlFor="storyboard-scene-count">
                              장면 수
                            </label>
                            <select
                              id="storyboard-scene-count"
                              name="storyboardSceneCount"
                              value={draft.plannedSceneCount}
                              onChange={(event) =>
                                updateStoryboardMetadata((current) => ({
                                  ...current,
                                  plannedSceneCount: Number(
                                    event.target.value,
                                  ),
                                }))
                              }
                              disabled={isPlanning || isBulkGenerating}
                            >
                              {SCENE_COUNT_OPTIONS.map((count) => (
                                <option key={count} value={count}>
                                  {count}장면
                                </option>
                              ))}
                            </select>
                          </QuickSelectField>
                          <PlanButton
                            type="button"
                            onClick={() =>
                              openPaidActionApproval({
                                kind: "planning",
                                requestCount: 2,
                              })
                            }
                            disabled={
                              isPlanning || isWorkspaceBusy || !hasTopic
                            }
                            aria-busy={isPlanning}
                            aria-describedby="storyboard-planning-disclosure"
                          >
                            {isPlanning ? (
                              <>
                                <i
                                  className="fas fa-spinner fa-spin"
                                  aria-hidden="true"
                                />{" "}
                                {draft.plannedSceneCount}개 장면 설계 중…
                              </>
                            ) : (
                              <>
                                <i
                                  className="fas fa-wand-magic-sparkles"
                                  aria-hidden="true"
                                />{" "}
                                AI 장면 설계 시작
                              </>
                            )}
                          </PlanButton>
                        </QuickPlannerFields>
                        <PlanDisclosure id="storyboard-planning-disclosure">
                          <i className="fas fa-circle-info" aria-hidden="true" />
                          <span><strong>AI 장면 설계는 이미지 생성과 별도입니다.</strong> OpenRouter 텍스트·비전 요청을 1회 사용하고 품질 보정이 필요하면 최대 1회 더 요청합니다. 첨부한 참조 사진은 선택된 모델 공급자에게 함께 전송되며, 실제 장면 이미지 생성은 설계 확인 후 장면별로 따로 실행합니다.</span>
                        </PlanDisclosure>
                        {pendingPaidAction?.kind === "planning" ? (
                          <PaidActionApproval
                            id="storyboard-planning-approval"
                            aria-labelledby="storyboard-planning-approval-title"
                          >
                            <div className="approval-heading">
                              <i className="fas fa-shield-halved" aria-hidden="true" />
                              <div>
                                <h4 id="storyboard-planning-approval-title">
                                  AI 장면 설계 요청 전 확인
                                </h4>
                                <p>
                                  지금은 공급자 요청이 시작되지 않았습니다. 아래 내용을 확인하고 승인하면 실행합니다.
                                </p>
                              </div>
                            </div>
                            <ul>
                              <li>OpenRouter 텍스트·비전 요청 1회, 품질 보정 시 최대 {pendingPaidAction.requestCount}회</li>
                              <li>현재 주제·형식·장면 수와 참조 사진이 선택 모델 공급자에게 전송됨</li>
                              <li>실제 사용량에 따라 OpenRouter 비용이 발생할 수 있음</li>
                            </ul>
                            <label htmlFor="storyboard-planning-approval-acceptance">
                              <input
                                id="storyboard-planning-approval-acceptance"
                                type="checkbox"
                                checked={paidActionAccepted}
                                onChange={(event) =>
                                  setPaidActionAccepted(event.target.checked)
                                }
                              />
                              외부 전송과 비용 발생 가능성을 확인했습니다.
                            </label>
                            <div className="approval-actions">
                              <button type="button" onClick={cancelPaidActionApproval}>
                                취소
                              </button>
                              <button
                                type="button"
                                onClick={() => void approvePendingPaidAction()}
                                disabled={!paidActionAccepted}
                              >
                                승인하고 AI 설계 시작
                              </button>
                            </div>
                          </PaidActionApproval>
                        ) : null}
                        <QuickStartRow aria-label="빠른 시작 템플릿">
                          <span>빠른 시작</span>
                          {QUICK_START_TEMPLATES.map((template) => (
                            <QuickStartButton
                              key={template.id}
                              type="button"
                              onClick={() => applyQuickStartTemplate(template)}
                              disabled={isPlanning || isWorkspaceBusy}
                            >
                              <i
                                className={`fas ${template.icon}`}
                                aria-hidden="true"
                              />
                              {template.label}
                            </QuickStartButton>
                          ))}
                        </QuickStartRow>
                      </QuickPlanner>

                      <WorkspaceAnchor id="storyboard-reference-assets">
                        <ReferenceImageAssetManager
                          assets={projectReferenceAssets}
                          onAddAssets={(assets) =>
                            void handleAddProjectReferences(assets)
                          }
                          onRemoveAsset={handleRemoveProjectReference}
                          onUpdateRole={handleUpdateProjectReferenceRole}
                          disabled={isWorkspaceBusy || isUploadingReferences}
                          title="02. 선택 시각 기준"
                          description="동일한 건물·제품·캐릭터를 유지해야 할 때만 참조 사진을 추가하세요. 사진이 없어도 장면 설계와 생성은 정상적으로 진행됩니다."
                        />
                      </WorkspaceAnchor>
                      <PlanReadiness
                        id="storyboard-quality-report"
                        aria-label="스토리보드 제작 준비 상태"
                        aria-live="polite"
                      >
                        <PlanReadinessHeading>
                          <div>
                            <span>AI PRODUCTION CHECK</span>
                            <h3>생성 전, 필요한 기준을 한눈에 확인하세요</h3>
                          </div>
                          {repairableQualityIssueCount ? (
                            <QualityRepairButton
                              type="button"
                              onClick={applyBasicQualityRepairs}
                              disabled={isWorkspaceBusy}
                            >
                              기본 항목 자동 보완
                            </QualityRepairButton>
                          ) : isBulkGenerating ? (
                            <BulkStatus>
                              <i
                                className="fas fa-spinner fa-spin"
                                aria-hidden="true"
                              />{" "}
                              장면을 순서대로 생성 중
                            </BulkStatus>
                          ) : null}
                        </PlanReadinessHeading>
                        <ReadinessGrid>
                          <ReadinessItem $ready={true}>
                            <i
                              className={
                                projectReferenceAssets.length > 0
                                  ? "fas fa-images"
                                  : "fas fa-image"
                              }
                              aria-hidden="true"
                            />
                            <div>
                              <strong>
                                {projectReferenceAssets.length
                                  ? `${projectReferenceAssets.length}개 사진 기준`
                                  : "선택 품질 향상"}
                              </strong>
                              <span>
                                {lastPlanReferenceAnalysis === "visual"
                                  ? "AI가 첨부 사진을 분석해 기획에 반영함"
                                  : "건물·제품·인물의 형태를 더 정확히 유지"}
                              </span>
                            </div>
                          </ReadinessItem>
                          <ReadinessItem $ready={continuityReadyCount === 4}>
                            <i
                              className={
                                continuityReadyCount === 4
                                  ? "fas fa-link"
                                  : "fas fa-link-slash"
                              }
                              aria-hidden="true"
                            />
                            <div>
                              <strong>
                                연속성 가이드 {continuityReadyCount}/4
                              </strong>
                              <span>
                                아트·대상·공간·조명 기준을 모든 장면에 적용
                              </span>
                            </div>
                          </ReadinessItem>
                          <ReadinessItem
                            $ready={Boolean(
                              draft?.scenes.length &&
                              linkedSceneCount === draft.scenes.length,
                            )}
                          >
                            <i
                              className={
                                linkedSceneCount
                                  ? "fas fa-shuffle"
                                  : "fas fa-arrow-right"
                              }
                              aria-hidden="true"
                            />
                            <div>
                              <strong>
                                장면 연결 {linkedSceneCount}/
                                {draft?.scenes.length ?? 0}
                              </strong>
                              <span>
                                전환과 고정 요소가 있어야 다음 장면도
                                자연스럽습니다
                              </span>
                            </div>
                          </ReadinessItem>
                          <ReadinessItem
                            $ready={Boolean(
                              qualityReport &&
                                qualityReport.errorCount === 0 &&
                                qualityReport.warningCount === 0,
                            )}
                          >
                            <i
                              className={
                                qualityReport?.errorCount
                                  ? "fas fa-triangle-exclamation"
                                  : qualityReport?.warningCount
                                    ? "fas fa-circle-exclamation"
                                    : "fas fa-shield-heart"
                              }
                              aria-hidden="true"
                            />
                            <div>
                              <strong>
                                장면 품질 {qualityReport?.score ?? 0}점
                              </strong>
                              <span>
                                {qualityReport?.errorCount
                                  ? `수정 필요 ${qualityReport.errorCount}개 · 검토 ${qualityReport.warningCount}개`
                                  : qualityReport?.warningCount
                                    ? `검토 권장 ${qualityReport.warningCount}개`
                                    : "장면 순서·프롬프트·전환·대사 설정이 준비되었습니다."}
                              </span>
                            </div>
                          </ReadinessItem>
                        </ReadinessGrid>
                      </PlanReadiness>

                      <AdvancedDetails id="storyboard-continuity-settings">
                        <summary>
                          <span>
                            <i className="fas fa-sliders" aria-hidden="true" />{" "}
                            상세 연출 설정
                          </span>
                          <small>프레임, 스타일, 연속성 가이드</small>
                          <i
                            className="fas fa-chevron-down"
                            aria-hidden="true"
                          />
                        </summary>
                        <AdvancedDetailsBody>
                          <BriefGrid>
                            <BriefField $wide>
                              <label htmlFor="storyboard-logline">
                                한 줄 기획
                              </label>
                              <BufferedTextarea
                                id="storyboard-logline"
                                name="storyboardLogline"
                                value={draft.logline}
                                field="logline"
                                onValueCommit={commitStoryboardText}
                                placeholder="이 스토리가 전달해야 할 변화, 감정, 메시지를 한 문장으로 적어주세요."
                                maxLength={280}
                                autoComplete="off"
                              />
                            </BriefField>
                            <BriefField>
                              <label htmlFor="storyboard-audience">대상</label>
                              <BufferedInput
                                id="storyboard-audience"
                                name="storyboardAudience"
                                value={draft.audience}
                                field="audience"
                                onValueCommit={commitStoryboardText}
                                placeholder="예: 제품 도입을 검토하는 실무자"
                                maxLength={120}
                                autoComplete="off"
                              />
                            </BriefField>
                            <BriefField>
                              <label htmlFor="storyboard-aspect-ratio">
                                프레임
                              </label>
                              <select
                                id="storyboard-aspect-ratio"
                                name="storyboardAspectRatio"
                                value={draft.aspectRatio}
                                onChange={(event) =>
                                  updateStoryboardBrief((current) => ({
                                    ...current,
                                    aspectRatio: event.target
                                      .value as ImageStoryboard["aspectRatio"],
                                  }))
                                }
                              >
                                {ASPECT_RATIO_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </BriefField>
                            <BriefField>
                              <label htmlFor="storyboard-style">스타일</label>
                              <select
                                id="storyboard-style"
                                name="storyboardStylePreset"
                                value={draft.stylePreset}
                                onChange={(event) =>
                                  updateStoryboardBrief((current) => ({
                                    ...current,
                                    stylePreset: event.target.value,
                                  }))
                                }
                              >
                                {IMAGE_STYLE_PRESETS.map((preset) => (
                                  <option
                                    key={preset.value}
                                    value={preset.value}
                                  >
                                    {preset.label}
                                  </option>
                                ))}
                              </select>
                            </BriefField>
                          </BriefGrid>

                          <ContinuitySection>
                            <SectionHeading>
                              <div>
                                <span>CONTINUITY BIBLE</span>
                                <h3>장면 간 일관성</h3>
                              </div>
                              <p>모든 장면 프롬프트에 자동으로 반영됩니다.</p>
                            </SectionHeading>
                            <ContinuityGrid>
                              <BriefField>
                                <label htmlFor="storyboard-art">
                                  아트 디렉션
                                </label>
                                <BufferedTextarea
                                  id="storyboard-art"
                                  name="storyboardArtDirection"
                                  value={draft.artDirection}
                                  field="artDirection"
                                  onValueCommit={commitStoryboardText}
                                  placeholder="예: 절제된 다큐멘터리 질감, 현실적인 소재"
                                  maxLength={320}
                                  autoComplete="off"
                                />
                              </BriefField>
                              <BriefField>
                                <label htmlFor="storyboard-character">
                                  캐릭터/제품 고정값
                                </label>
                                <BufferedTextarea
                                  id="storyboard-character"
                                  name="storyboardCharacterContinuity"
                                  value={draft.characterContinuity}
                                  field="characterContinuity"
                                  onValueCommit={commitStoryboardText}
                                  placeholder="인물 외형, 의상, 제품 형태, 로고 위치"
                                  maxLength={320}
                                  autoComplete="off"
                                />
                              </BriefField>
                              <BriefField>
                                <label htmlFor="storyboard-setting">
                                  배경/공간 고정값
                                </label>
                                <BufferedTextarea
                                  id="storyboard-setting"
                                  name="storyboardSettingContinuity"
                                  value={draft.settingContinuity}
                                  field="settingContinuity"
                                  onValueCommit={commitStoryboardText}
                                  placeholder="장소, 시간대, 소품, 날씨, 공간의 질감"
                                  maxLength={320}
                                  autoComplete="off"
                                />
                              </BriefField>
                              <BriefField>
                                <label htmlFor="storyboard-light">
                                  색감·조명
                                </label>
                                <BufferedTextarea
                                  id="storyboard-light"
                                  name="storyboardColorAndLighting"
                                  value={draft.colorAndLighting}
                                  field="colorAndLighting"
                                  onValueCommit={commitStoryboardText}
                                  placeholder="예: 따뜻한 앰버 키라이트, 저채도 네이비 그림자"
                                  maxLength={220}
                                  autoComplete="off"
                                />
                              </BriefField>
                            </ContinuityGrid>
                            <ReferenceToggle>
                              <input
                                id="storyboard-use-previous-reference"
                                name="storyboardUsePreviousReference"
                                type="checkbox"
                                checked={draft.usePreviousSceneAsReference}
                                onChange={(event) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    usePreviousSceneAsReference:
                                      event.target.checked,
                                  }))
                                }
                              />
                              <label htmlFor="storyboard-use-previous-reference">
                                <strong>
                                  이전 생성 장면을 참조 이미지로 사용
                                </strong>
                                <span>
                                  켜면 인물·제품·공간의 일관성을 높이기 위해
                                  순서대로 생성합니다. 끄면 공통 기준을 유지하며
                                  최대 2장씩 빠르게 생성합니다.
                                </span>
                              </label>
                            </ReferenceToggle>
                          </ContinuitySection>
                        </AdvancedDetailsBody>
                      </AdvancedDetails>

                      <SceneSection id="storyboard-scenes">
                        <SectionHeading>
                          <div>
                            <span>03 · SCENE PRODUCTION</span>
                            <h3>장면 구성과 결과 확인</h3>
                          </div>
                          <SceneHeaderActions>
                            <SceneCount>
                              {draft.scenes.length}개 장면 ·{" "}
                              {progress.generated}개 생성됨
                            </SceneCount>
                            <BulkGenerateButton
                              type="button"
                              onClick={() =>
                                openPaidActionApproval({
                                  kind: "bulk",
                                  sceneCount: readySceneCount,
                                })
                              }
                              disabled={
                                isWorkspaceBusy || readySceneCount === 0
                              }
                              aria-busy={isBulkGenerating}
                              aria-describedby="storyboard-scene-generation-disclosure"
                              title={
                                readySceneCount === 0
                                  ? "제목과 장면 설명이 준비된 미생성 장면이 없습니다."
                                  : draft.usePreviousSceneAsReference
                                    ? "고효율 이미지 모델로 순서대로 생성합니다."
                                    : "고효율 이미지 모델로 최대 2장씩 병렬 생성합니다."
                              }
                            >
                              {isBulkGenerating ? (
                                <>
                                  <i
                                    className="fas fa-spinner fa-spin"
                                    aria-hidden="true"
                                  />{" "}
                                  {draft.usePreviousSceneAsReference
                                    ? "순서 생성 중"
                                    : "빠른 생성 중"}
                                </>
                              ) : (
                                <>
                                  <i
                                    className="fas fa-layer-group"
                                    aria-hidden="true"
                                  />{" "}
                                  {readySceneCount}개{" "}
                                  {draft.usePreviousSceneAsReference
                                    ? "순차 생성"
                                    : "빠른 생성"}
                                </>
                              )}
                            </BulkGenerateButton>
                            <AddSceneButton
                              type="button"
                              onClick={addScene}
                              disabled={isWorkspaceBusy}
                            >
                              <i className="fas fa-plus" aria-hidden="true" />{" "}
                              장면 추가
                            </AddSceneButton>
                          </SceneHeaderActions>
                        </SectionHeading>
                        <PlanDisclosure id="storyboard-scene-generation-disclosure">
                          <i className="fas fa-coins" aria-hidden="true" />
                          <span><strong>장면 이미지 생성은 외부 이미지 모델 요청을 시작합니다.</strong> {readySceneCount === 0 ? "현재 제목과 장면 설명이 준비된 미생성 장면이 없습니다. 각 장면의 입력 내용을 먼저 확인해 주세요." : `일괄 생성은 현재 준비된 ${readySceneCount}개 장면을 대상으로 합니다.`} 프로젝트 참조 이미지와 연속성용 이전 장면이 선택된 모델 공급자에게 전송될 수 있으며, 같은 장면을 재생성하면 새 요청으로 처리됩니다.</span>
                        </PlanDisclosure>
                        {pendingPaidAction &&
                        pendingPaidAction.kind !== "planning" ? (
                          <PaidActionApproval
                            id="storyboard-generation-approval"
                            aria-labelledby="storyboard-generation-approval-title"
                          >
                            <div className="approval-heading">
                              <i className="fas fa-coins" aria-hidden="true" />
                              <div>
                                <h4 id="storyboard-generation-approval-title">
                                  장면 이미지 생성 요청 전 확인
                                </h4>
                                <p>
                                  지금은 이미지 공급자 요청이 시작되지 않았습니다. 승인 후에만 실제 생성을 실행합니다.
                                </p>
                              </div>
                            </div>
                            <ul>
                              <li>
                                {pendingPaidAction.kind === "bulk"
                                  ? `준비된 ${pendingPaidAction.sceneCount}개 장면에 각각 이미지 생성 요청`
                                  : `${pendingPaidAction.order}번 장면 이미지 생성 요청 1회`}
                              </li>
                              <li>장면 프롬프트와 프로젝트 참조·연속성 이미지가 선택 모델 공급자에게 전송될 수 있음</li>
                              <li>
                                {pendingPaidAction.kind === "scene" &&
                                pendingPaidAction.replacing
                                  ? "현재 결과를 교체하며 새 이미지 생성 비용이 발생할 수 있음"
                                  : "실제 사용량에 따라 이미지 생성 비용이 발생할 수 있음"}
                              </li>
                            </ul>
                            <label htmlFor="storyboard-generation-approval-acceptance">
                              <input
                                id="storyboard-generation-approval-acceptance"
                                type="checkbox"
                                checked={paidActionAccepted}
                                onChange={(event) =>
                                  setPaidActionAccepted(event.target.checked)
                                }
                              />
                              요청 수, 외부 전송, 결과 교체와 비용 가능성을 확인했습니다.
                            </label>
                            <div className="approval-actions">
                              <button type="button" onClick={cancelPaidActionApproval}>
                                취소
                              </button>
                              <button
                                type="button"
                                onClick={() => void approvePendingPaidAction()}
                                disabled={!paidActionAccepted}
                              >
                                승인하고 이미지 생성
                              </button>
                            </div>
                          </PaidActionApproval>
                        ) : null}

                        {missingImageScenes.length ? (
                          <MissingImageFinder
                            role="status"
                            aria-live="polite"
                            data-testid="storyboard-missing-image-finder"
                          >
                            <i className="fas fa-image" aria-hidden="true" />
                            <div>
                              <strong>
                                대표 이미지가 없는 장면{" "}
                                {missingImageScenes.length}개
                              </strong>
                              <span>
                                아래 번호를 누르면 해당 장면으로 이동하고
                                노란색으로 표시합니다.
                              </span>
                            </div>
                            <MissingImageActions aria-label="이미지 누락 장면 바로가기">
                              {missingImageScenes.slice(0, 4).map((scene) => (
                                <button
                                  key={scene.id}
                                  type="button"
                                  onClick={() => focusScene(scene.id)}
                                  aria-label={`${scene.order}번 장면 이미지 생성 위치로 이동`}
                                >
                                  {String(scene.order).padStart(2, "0")}번
                                </button>
                              ))}
                              {missingImageScenes.length > 4 ? (
                                <small>+{missingImageScenes.length - 4}</small>
                              ) : null}
                            </MissingImageActions>
                          </MissingImageFinder>
                        ) : null}

                        <SceneNavigator aria-label="장면 빠른 이동">
                          {draft.scenes.map((scene) => (
                            <SceneNavigatorButton
                              key={scene.id}
                              type="button"
                              $status={scene.status}
                              $active={activeSceneId === scene.id}
                              $missingImage={!scene.generatedImage}
                              onClick={() => focusScene(scene.id)}
                              aria-label={`${scene.order}번 장면으로 이동: ${scene.title}${scene.generatedImage ? "" : " · 대표 이미지 미완성"}`}
                              aria-current={
                                activeSceneId === scene.id ? "step" : undefined
                              }
                            >
                              <span>
                                {String(scene.order).padStart(2, "0")}
                              </span>
                              <strong>{scene.title}</strong>
                            </SceneNavigatorButton>
                          ))}
                        </SceneNavigator>

                        <SceneList>
                          {draft.scenes.map((scene, index) => (
                            <SceneCard
                              key={scene.id}
                              id={`storyboard-scene-${scene.id}`}
                              $active={activeSceneId === scene.id}
                              $missingImage={!scene.generatedImage}
                              data-missing-image={
                                scene.generatedImage ? undefined : "true"
                              }
                              onFocusCapture={() => setActiveSceneId(scene.id)}
                            >
                              <SceneRail>
                                <SceneNumber>
                                  {String(scene.order).padStart(2, "0")}
                                </SceneNumber>
                                <SceneStatus
                                  $status={scene.status}
                                  $missingImage={!scene.generatedImage}
                                >
                                  {!scene.generatedImage
                                    ? "이미지 필요"
                                    : scene.status === "generated"
                                      ? "생성됨"
                                      : scene.status === "ready"
                                        ? "준비됨"
                                        : "초안"}
                                </SceneStatus>
                              </SceneRail>
                              <SceneBody>
                                <SceneTopLine>
                                  <BufferedInput
                                    id={`scene-title-${scene.id}`}
                                    name={`sceneTitle-${scene.id}`}
                                    value={scene.title}
                                    entityId={scene.id}
                                    field="title"
                                    onValueCommit={commitSceneText}
                                    aria-label={`${scene.order}번 장면 제목`}
                                    maxLength={80}
                                    autoComplete="off"
                                  />
                                  <SceneCommands
                                    aria-label={`${scene.order}번 장면 편집 명령`}
                                  >
                                    <CommandButton
                                      type="button"
                                      onClick={() => moveScene(scene.id, -1)}
                                      disabled={index === 0}
                                      aria-label="장면을 위로 이동"
                                    >
                                      <i
                                        className="fas fa-arrow-up"
                                        aria-hidden="true"
                                      />
                                    </CommandButton>
                                    <CommandButton
                                      type="button"
                                      onClick={() => moveScene(scene.id, 1)}
                                      disabled={
                                        index === draft.scenes.length - 1
                                      }
                                      aria-label="장면을 아래로 이동"
                                    >
                                      <i
                                        className="fas fa-arrow-down"
                                        aria-hidden="true"
                                      />
                                    </CommandButton>
                                    <CommandButton
                                      type="button"
                                      onClick={() => duplicateScene(scene)}
                                      disabled={draft.scenes.length >= 48}
                                      aria-label="장면 복제"
                                    >
                                      <i
                                        className="fas fa-copy"
                                        aria-hidden="true"
                                      />
                                    </CommandButton>
                                    <CommandButton
                                      type="button"
                                      $danger
                                      onClick={() => removeScene(scene.id)}
                                      aria-label="장면 제거"
                                    >
                                      <i
                                        className="fas fa-trash"
                                        aria-hidden="true"
                                      />
                                    </CommandButton>
                                  </SceneCommands>
                                </SceneTopLine>
                                {scene.assetFreshness === "review" ? (
                                  <ResultReviewNotice role="status">
                                    <i
                                      className="fas fa-circle-exclamation"
                                      aria-hidden="true"
                                    />
                                    <span>
                                      <strong>기존 결과 확인 필요</strong>
                                      {scene.staleReason ??
                                        "설정이 변경되어 결과를 다시 확인해 주세요."}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        acceptExistingSceneResult(scene.id)
                                      }
                                      aria-label={`${scene.order}번 장면의 기존 결과 유지`}
                                    >
                                      이 결과 유지
                                    </button>
                                  </ResultReviewNotice>
                                ) : null}
                                {!scene.generatedImage ? (
                                  <MissingSceneImageNotice role="status">
                                    <i
                                      className="fas fa-circle-exclamation"
                                      aria-hidden="true"
                                    />
                                    <span>
                                      <strong>대표 이미지 미완성</strong>이
                                      장면은 아직 시작 프레임이 없습니다.
                                      아래에서 이미지를 생성해 주세요.
                                    </span>
                                  </MissingSceneImageNotice>
                                ) : null}
                                <SceneSummary>
                                  <p>
                                    {scene.narrativeBeat ||
                                      "이 장면의 핵심 동작과 감정을 정리해 주세요."}
                                  </p>
                                  <span>
                                    {scene.duration} · {scene.shotSize}
                                    {scene.cameraDirection
                                      ? ` · ${scene.cameraDirection}`
                                      : ""}
                                  </span>
                                </SceneSummary>
                                {scene.continuityAnchor || scene.transition ? (
                                  <SceneProductionNotes>
                                    {scene.continuityAnchor ? (
                                      <span>
                                        <b>고정</b>
                                        {scene.continuityAnchor}
                                      </span>
                                    ) : null}
                                    {scene.transition ? (
                                      <span>
                                        <b>연결</b>
                                        {scene.transition}
                                      </span>
                                    ) : null}
                                  </SceneProductionNotes>
                                ) : null}
                                {redesignPanelSceneId === scene.id ? (
                                  <SceneRedesignPanel
                                    id={`scene-redesign-${scene.id}`}
                                    aria-label={`${scene.order}번 장면 재설계`}
                                  >
                                    <SceneRedesignHeader>
                                      <div>
                                        <span>SCENE RE-DESIGN</span>
                                        <strong>
                                          {sceneRedesignScopes[scene.id] ===
                                          "flow"
                                            ? "이 장면부터 흐름 다시 설계"
                                            : "이 장면만 새로 설계"}
                                        </strong>
                                        <p>
                                          {sceneRedesignScopes[scene.id] ===
                                          "flow"
                                            ? "대사·연출·전환을 함께 다시 짜고, 앞 장면과 다음 고정 장면 사이를 자연스럽게 연결합니다."
                                            : "앞뒤 장면·공통 연속성·참조 사진은 유지하고, 이 장면의 연출과 생성 프롬프트만 다시 만듭니다."}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRedesignPanelSceneId(null)
                                        }
                                        disabled={Boolean(redesigningSceneId)}
                                        aria-label={`${scene.order}번 장면 재설계 닫기`}
                                      >
                                        <i
                                          className="fas fa-times"
                                          aria-hidden="true"
                                        />
                                      </button>
                                    </SceneRedesignHeader>
                                    <SceneRedesignScope
                                      role="group"
                                      aria-label={`${scene.order}번 장면 재기획 범위`}
                                    >
                                      <button
                                        type="button"
                                        aria-pressed={
                                          sceneRedesignScopes[scene.id] !==
                                          "flow"
                                        }
                                        disabled={Boolean(redesigningSceneId)}
                                        onClick={() =>
                                          setSceneRedesignScopes((current) => ({
                                            ...current,
                                            [scene.id]: "scene",
                                          }))
                                        }
                                      >
                                        <i
                                          className="fas fa-crop-simple"
                                          aria-hidden="true"
                                        />
                                        이 장면만
                                      </button>
                                      <button
                                        type="button"
                                        aria-pressed={
                                          sceneRedesignScopes[scene.id] ===
                                          "flow"
                                        }
                                        disabled={Boolean(redesigningSceneId)}
                                        onClick={() =>
                                          setSceneRedesignScopes((current) => ({
                                            ...current,
                                            [scene.id]: "flow",
                                          }))
                                        }
                                      >
                                        <i
                                          className="fas fa-route"
                                          aria-hidden="true"
                                        />
                                        이 장면부터{" "}
                                        {Math.min(
                                          MAX_FLOW_REDESIGN_SCENES,
                                          draft.scenes.length - index,
                                        )}
                                        개 흐름
                                      </button>
                                    </SceneRedesignScope>
                                    <SceneRedesignQuickActions aria-label="빠른 재설계 방향">
                                      {(sceneRedesignScopes[scene.id] === "flow"
                                        ? [
                                            "대사 흐름과 감정선 다시 배치",
                                            "문제에서 해결로 전환을 강화",
                                            "장면마다 다른 시각적 변화 추가",
                                            "앞뒤 장면 연결을 더 자연스럽게",
                                          ]
                                        : [
                                            "제품·주인공 강조",
                                            "감정과 몰입감 강화",
                                            "구도·카메라 전환",
                                            "앞 장면과 더 자연스럽게 연결",
                                          ]
                                      ).map((instruction) => (
                                        <button
                                          key={instruction}
                                          type="button"
                                          disabled={Boolean(redesigningSceneId)}
                                          onClick={() =>
                                            setSceneRedesignInstructions(
                                              (current) => ({
                                                ...current,
                                                [scene.id]: current[scene.id]
                                                  ? `${current[scene.id]}\n${instruction}`
                                                  : instruction,
                                              }),
                                            )
                                          }
                                        >
                                          {instruction}
                                        </button>
                                      ))}
                                    </SceneRedesignQuickActions>
                                    <SceneRedesignField>
                                      <label
                                        htmlFor={`scene-redesign-instruction-${scene.id}`}
                                      >
                                        바꾸고 싶은 점 <span>선택</span>
                                      </label>
                                      <BufferedTextarea
                                        id={`scene-redesign-instruction-${scene.id}`}
                                        name={`sceneRedesignInstruction-${scene.id}`}
                                        value={
                                          sceneRedesignInstructions[scene.id] ??
                                          ""
                                        }
                                        entityId={scene.id}
                                        field="redesignInstruction"
                                        onValueCommit={
                                          commitSceneRedesignInstruction
                                        }
                                        placeholder="예: 제품을 더 가까이 보여주고, 새벽의 차분한 빛으로 바꿔 주세요. 인물의 표정은 자신감 있게 유지합니다."
                                        maxLength={600}
                                        autoComplete="off"
                                        disabled={Boolean(redesigningSceneId)}
                                      />
                                    </SceneRedesignField>
                                    <SceneRedesignContext>
                                      <span>
                                        <i
                                          className="fas fa-images"
                                          aria-hidden="true"
                                        />{" "}
                                        공통 참조{" "}
                                        {projectReferenceAssets.length}장 반영
                                      </span>
                                      <span>
                                        <i
                                          className="fas fa-link"
                                          aria-hidden="true"
                                        />{" "}
                                        {index > 0
                                          ? `앞 장면: ${draft.scenes[index - 1].title}`
                                          : "오프닝 장면"}
                                      </span>
                                      <span>
                                        <i
                                          className="fas fa-arrow-right"
                                          aria-hidden="true"
                                        />{" "}
                                        {index < draft.scenes.length - 1
                                          ? `다음 장면: ${draft.scenes[index + 1].title}`
                                          : "엔딩 장면"}
                                      </span>
                                    </SceneRedesignContext>
                                    <SceneRedesignActions>
                                      <span>
                                        {sceneRedesignScopes[scene.id] ===
                                        "flow"
                                          ? "대상 장면의 기존 이미지와 영상은 지우지 않고 ‘확인 필요’로 표시합니다."
                                          : "기존 이미지와 영상은 지우지 않고 ‘확인 필요’로 표시합니다."}
                                      </span>
                                      <SceneRedesignSubmit
                                        type="button"
                                        onClick={() =>
                                          void (sceneRedesignScopes[
                                            scene.id
                                          ] === "flow"
                                            ? handleRedesignFlow(scene)
                                            : handleRedesignScene(scene))
                                        }
                                        disabled={isWorkspaceBusy}
                                        aria-busy={
                                          redesigningSceneId === scene.id
                                        }
                                      >
                                        {redesigningSceneId === scene.id ? (
                                          <>
                                            <i
                                              className="fas fa-spinner fa-spin"
                                              aria-hidden="true"
                                            />{" "}
                                            재설계 중…
                                          </>
                                        ) : sceneRedesignScopes[scene.id] ===
                                          "flow" ? (
                                          <>
                                            <i
                                              className="fas fa-wand-magic-sparkles"
                                              aria-hidden="true"
                                            />{" "}
                                            흐름 재기획
                                          </>
                                        ) : (
                                          <>
                                            <i
                                              className="fas fa-wand-magic-sparkles"
                                              aria-hidden="true"
                                            />{" "}
                                            이 장면 재설계
                                          </>
                                        )}
                                      </SceneRedesignSubmit>
                                    </SceneRedesignActions>
                                  </SceneRedesignPanel>
                                ) : null}
                                <SceneDetails>
                                  <summary>
                                    <span>세부 편집</span>
                                    <i
                                      className="fas fa-chevron-down"
                                      aria-hidden="true"
                                    />
                                  </summary>
                                  <SceneGrid>
                                    <BriefField $wide>
                                      <label htmlFor={`scene-beat-${scene.id}`}>
                                        서사 비트
                                      </label>
                                      <BufferedTextarea
                                        id={`scene-beat-${scene.id}`}
                                        name={`sceneBeat-${scene.id}`}
                                        value={scene.narrativeBeat}
                                        entityId={scene.id}
                                        field="narrativeBeat"
                                        onValueCommit={commitSceneText}
                                        placeholder="이 장면에서 무슨 일이 일어나고, 시청자가 무엇을 느껴야 하나요?"
                                        maxLength={280}
                                        autoComplete="off"
                                      />
                                    </BriefField>
                                    <BriefField>
                                      <label
                                        htmlFor={`scene-duration-${scene.id}`}
                                      >
                                        장면 길이
                                      </label>
                                      <select
                                        id={`scene-duration-${scene.id}`}
                                        name={`sceneDuration-${scene.id}`}
                                        value={parseSceneDurationSeconds(
                                          scene.duration,
                                          scene.video.durationSeconds,
                                        )}
                                        onChange={(event) =>
                                          updateScene(scene.id, {
                                            duration: `${event.target.value}초`,
                                          })
                                        }
                                      >
                                        {Array.from(
                                          { length: 13 },
                                          (_, durationIndex) =>
                                            durationIndex + 3,
                                        ).map((seconds) => (
                                          <option key={seconds} value={seconds}>
                                            {seconds}초
                                          </option>
                                        ))}
                                      </select>
                                    </BriefField>
                                    <BriefField>
                                      <label htmlFor={`scene-shot-${scene.id}`}>
                                        구도
                                      </label>
                                      <select
                                        id={`scene-shot-${scene.id}`}
                                        name={`sceneShot-${scene.id}`}
                                        value={scene.shotSize}
                                        onChange={(event) =>
                                          updateScene(scene.id, {
                                            shotSize: event.target.value,
                                          })
                                        }
                                      >
                                        {SHOT_SIZE_OPTIONS.map((option) => (
                                          <option key={option} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                      </select>
                                    </BriefField>
                                    <BriefField $wide>
                                      <label
                                        htmlFor={`scene-camera-${scene.id}`}
                                      >
                                        카메라 동선
                                      </label>
                                      <BufferedInput
                                        id={`scene-camera-${scene.id}`}
                                        name={`sceneCamera-${scene.id}`}
                                        value={scene.cameraDirection}
                                        entityId={scene.id}
                                        field="cameraDirection"
                                        onValueCommit={commitSceneText}
                                        placeholder="예: 인물 뒤에서 천천히 트래킹, 마지막에 제품으로 포커스 이동"
                                        maxLength={180}
                                        autoComplete="off"
                                      />
                                    </BriefField>
                                    <BriefField $wide>
                                      <label
                                        htmlFor={`scene-dialogue-${scene.id}`}
                                      >
                                        대사·자막 맥락
                                      </label>
                                      <BufferedInput
                                        id={`scene-dialogue-${scene.id}`}
                                        name={`sceneDialogue-${scene.id}`}
                                        value={scene.dialogueOrCaption}
                                        entityId={scene.id}
                                        field="dialogueOrCaption"
                                        onValueCommit={commitSceneText}
                                        placeholder="화면에 표시하지 않아도 감정과 장면 맥락을 위해 기록할 수 있습니다."
                                        maxLength={240}
                                        autoComplete="off"
                                      />
                                    </BriefField>
                                    <BriefField>
                                      <label
                                        htmlFor={`scene-anchor-${scene.id}`}
                                      >
                                        연속성 앵커
                                      </label>
                                      <BufferedTextarea
                                        id={`scene-anchor-${scene.id}`}
                                        name={`sceneAnchor-${scene.id}`}
                                        value={scene.continuityAnchor}
                                        entityId={scene.id}
                                        field="continuityAnchor"
                                        onValueCommit={commitSceneText}
                                        placeholder="계속 유지할 인물·제품·소품·조명"
                                        maxLength={280}
                                        autoComplete="off"
                                      />
                                    </BriefField>
                                    <BriefField>
                                      <label
                                        htmlFor={`scene-transition-${scene.id}`}
                                      >
                                        다음 장면 연결
                                      </label>
                                      <BufferedTextarea
                                        id={`scene-transition-${scene.id}`}
                                        name={`sceneTransition-${scene.id}`}
                                        value={scene.transition}
                                        entityId={scene.id}
                                        field="transition"
                                        onValueCommit={commitSceneText}
                                        placeholder="시선, 움직임, 색감으로 다음 장면을 잇는 방법"
                                        maxLength={180}
                                        autoComplete="off"
                                      />
                                    </BriefField>
                                    <BriefField $wide>
                                      <label
                                        htmlFor={`scene-prompt-${scene.id}`}
                                      >
                                        장면 비주얼 지시
                                      </label>
                                      <BufferedTextarea
                                        id={`scene-prompt-${scene.id}`}
                                        name={`scenePrompt-${scene.id}`}
                                        value={scene.visualPrompt}
                                        entityId={scene.id}
                                        field="visualPrompt"
                                        onValueCommit={commitSceneText}
                                        placeholder="피사체, 행동, 장면의 핵심 디테일, 우선순위를 구체적으로 적어주세요."
                                        maxLength={900}
                                        autoComplete="off"
                                      />
                                    </BriefField>
                                    <BriefField $wide>
                                      <label
                                        htmlFor={`scene-image-prompt-${scene.id}`}
                                      >
                                        생성용 이미지 프롬프트
                                      </label>
                                      <BufferedTextarea
                                        id={`scene-image-prompt-${scene.id}`}
                                        name={`sceneImagePrompt-${scene.id}`}
                                        value={scene.imagePrompt}
                                        entityId={scene.id}
                                        field="imagePrompt"
                                        onValueCommit={commitSceneText}
                                        placeholder="AI가 자동 작성하는 영문 생성 프롬프트입니다. 구도·광원·재질·전경/배경을 포함하세요."
                                        maxLength={1200}
                                        autoComplete="off"
                                      />
                                    </BriefField>
                                    <BriefField $wide>
                                      <label
                                        htmlFor={`scene-negative-${scene.id}`}
                                      >
                                        제외 요소
                                      </label>
                                      <BufferedInput
                                        id={`scene-negative-${scene.id}`}
                                        name={`sceneNegative-${scene.id}`}
                                        value={scene.negativePrompt}
                                        entityId={scene.id}
                                        field="negativePrompt"
                                        onValueCommit={commitSceneText}
                                        placeholder="예: 왜곡된 손, 과도한 노이즈, 읽을 수 없는 텍스트"
                                        maxLength={360}
                                        autoComplete="off"
                                      />
                                    </BriefField>
                                  </SceneGrid>
                                </SceneDetails>
                                <SceneFooter>
                                  <PromptHint>
                                    {scene.imagePrompt.length ||
                                      scene.visualPrompt.length}{" "}
                                    / {scene.imagePrompt ? "1200" : "900"} ·
                                    연속성 가이드 자동 결합
                                    {previousGeneratedReferenceBySceneId.has(
                                      scene.id,
                                    )
                                      ? " · 이전 장면 참조 적용"
                                      : ""}
                                  </PromptHint>
                                  <SceneActionGroup>
                                    <RedesignSceneButton
                                      type="button"
                                      onClick={() => {
                                        setActiveSceneId(scene.id);
                                        setRedesignPanelSceneId((current) =>
                                          current === scene.id
                                            ? null
                                            : scene.id,
                                        );
                                      }}
                                      disabled={isWorkspaceBusy}
                                      aria-expanded={
                                        redesignPanelSceneId === scene.id
                                      }
                                      aria-controls={`scene-redesign-${scene.id}`}
                                    >
                                      <i
                                        className="fas fa-wand-magic-sparkles"
                                        aria-hidden="true"
                                      />{" "}
                                      재설계
                                    </RedesignSceneButton>
                                    <GenerateSceneButton
                                      type="button"
                                      onClick={() =>
                                        openPaidActionApproval({
                                          kind: "scene",
                                          sceneId: scene.id,
                                          order: scene.order,
                                          replacing: Boolean(
                                            scene.generatedImage?.url,
                                          ),
                                        })
                                      }
                                      disabled={isWorkspaceBusy}
                                      aria-describedby="storyboard-scene-generation-disclosure"
                                    >
                                      {generatingSceneId === scene.id ? (
                                        <>
                                          <i
                                            className="fas fa-spinner fa-spin"
                                            aria-hidden="true"
                                          />{" "}
                                          생성 중…
                                        </>
                                      ) : (
                                        <>
                                          <i
                                            className="fas fa-wand-magic-sparkles"
                                            aria-hidden="true"
                                          />{" "}
                                          {scene.generatedImage?.url
                                            ? "다시 생성 · 비용 발생"
                                            : "이 장면 생성"}
                                        </>
                                      )}
                                    </GenerateSceneButton>
                                  </SceneActionGroup>
                                </SceneFooter>
                                {scene.generatedImage ? (
                                  <GeneratedResult>
                                    <img
                                      src={scene.generatedImage.url}
                                      alt={`${scene.title} 생성 결과`}
                                      width={210}
                                      height={118}
                                      loading="lazy"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleDownloadSceneImage(scene)
                                      }
                                      disabled={
                                        downloadingSceneImageId === scene.id
                                      }
                                      aria-label={`${scene.order}번 장면 이미지 다운로드`}
                                      title="이미지 다운로드"
                                    >
                                      <i
                                        className={
                                          downloadingSceneImageId === scene.id
                                            ? "fas fa-spinner fa-spin"
                                            : "fas fa-download"
                                        }
                                        aria-hidden="true"
                                      />
                                    </button>
                                    <span>현재 생성 결과</span>
                                  </GeneratedResult>
                                ) : null}
                              </SceneBody>
                            </SceneCard>
                          ))}
                        </SceneList>
                      </SceneSection>
                    </>
                  ) : (
                    <StoryboardVideoProductionPanel
                      key={activeId}
                      storyboardId={activeId}
                      storyboard={draft}
                      referenceAssets={projectReferenceAssets}
                      activeSceneId={activeSceneId}
                      onActiveSceneChange={setActiveSceneId}
                      onDuplicateScene={duplicateScene}
                      onOpenImageWorkspace={() => {
                        const missingScene =
                          draft.scenes.find(
                            (scene) => !scene.generatedImage?.url,
                          ) ?? draft.scenes[0];
                        setWorkspaceMode("storyboard");
                        if (missingScene) focusScene(missingScene.id);
                      }}
                      disabled={isWorkspaceBusy}
                      onRequestPendingChange={handleVideoRequestPending}
                      onChange={updateActiveStoryboard}
                    />
                  )}
                </BoardContent>
                {workspaceMode === "storyboard" ? (
                  <ProductionAssistantRail aria-label="제작 품질 도우미">
                  <AssistantRailHeader>
                    <div>
                      <span>QUALITY GATE</span>
                      <h3>상용화 준비도</h3>
                    </div>
                    <QualityScore
                      $score={readinessScore}
                      aria-label={`상용화 준비도 ${readinessScore}점`}
                    >
                      {readinessScore}
                      <small>/100</small>
                    </QualityScore>
                  </AssistantRailHeader>
                  <QualityProgress
                    role="progressbar"
                    aria-label="상용화 준비도"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={readinessScore}
                  >
                    <span style={{ width: `${readinessScore}%` }} />
                  </QualityProgress>
                  <AssistantSummary>
                    {readinessScore === 100
                      ? "모든 제작 기준을 통과했습니다. 최종 완성본을 검수하고 배포할 수 있습니다."
                      : `${readinessChecks.filter((check) => !check.ready).length}개 항목을 마치면 완성본 품질과 복구 가능성이 높아집니다.`}
                  </AssistantSummary>
                  <QualityChecklist>
                    {readinessChecks.map((check) => (
                      <QualityCheckItem key={check.id} $ready={check.ready}>
                        <i
                          className={`fas ${check.ready ? "fa-circle-check" : "fa-circle-exclamation"}`}
                          aria-hidden="true"
                        />
                        <div>
                          <strong>{check.label}</strong>
                          <span>{check.description}</span>
                        </div>
                        {!check.ready ? (
                          <button
                            type="button"
                            onClick={() => handleReadinessAction(check.action)}
                          >
                            {check.actionLabel}
                          </button>
                        ) : null}
                      </QualityCheckItem>
                    ))}
                  </QualityChecklist>

                  <AssistantDivider />
                  <ActiveSceneAssistant>
                    <AssistantSectionTitle>
                      <span>현재 장면</span>
                      <small>
                        {activeScene
                          ? `${activeScene.order}/${draft.scenes.length}`
                          : "선택 없음"}
                      </small>
                    </AssistantSectionTitle>
                    {activeScene ? (
                      <>
                        {activeScene.generatedImage ? (
                          <ActiveScenePreview>
                            <img
                              src={activeScene.generatedImage.url}
                              alt={`${activeScene.title} 미리보기`}
                              width={280}
                              height={158}
                              loading="lazy"
                            />
                            {activeScene.assetFreshness === "review" ? (
                              <span>재검토 필요</span>
                            ) : null}
                          </ActiveScenePreview>
                        ) : (
                          <ActiveScenePlaceholder>
                            <i className="fas fa-image" aria-hidden="true" />
                            아직 생성된 이미지가 없습니다
                          </ActiveScenePlaceholder>
                        )}
                        <ActiveSceneCopy>
                          <strong>{activeScene.title}</strong>
                          <span>
                            {activeScene.narrativeBeat ||
                              "서사 비트를 입력하면 장면의 목적이 더 선명해집니다."}
                          </span>
                        </ActiveSceneCopy>
                        <AssistantActionGrid>
                          <button
                            type="button"
                            onClick={() => {
                              setWorkspaceMode("storyboard");
                              scrollToWorkspaceTarget(
                                `storyboard-scene-${activeScene.id}`,
                              );
                            }}
                          >
                            <i className="fas fa-pen" aria-hidden="true" /> 장면
                            편집
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateScene(activeScene)}
                            disabled={isWorkspaceBusy}
                          >
                            <i className="fas fa-copy" aria-hidden="true" />{" "}
                            복제
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWorkspaceMode("storyboard");
                              setRedesignPanelSceneId(activeScene.id);
                              scrollToWorkspaceTarget(
                                `storyboard-scene-${activeScene.id}`,
                              );
                            }}
                            disabled={isWorkspaceBusy}
                          >
                            <i
                              className="fas fa-wand-magic-sparkles"
                              aria-hidden="true"
                            />{" "}
                            AI 재설계
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleGenerateScene(activeScene)
                            }
                            disabled={isWorkspaceBusy}
                          >
                            <i className="fas fa-bolt" aria-hidden="true" />{" "}
                            {activeScene.generatedImage
                              ? "다시 생성"
                              : "이미지 생성"}
                          </button>
                        </AssistantActionGrid>
                        {activeScene.assetFreshness === "review" ? (
                          <ReviewAcceptButton
                            type="button"
                            onClick={() =>
                              updateScene(activeScene.id, {
                                assetFreshness: "current",
                                staleReason: null,
                              })
                            }
                          >
                            <i className="fas fa-check" aria-hidden="true" />{" "}
                            현재 결과 검토 완료
                          </ReviewAcceptButton>
                        ) : null}
                      </>
                    ) : null}
                  </ActiveSceneAssistant>

                  <AssistantDivider />
                  <ProductionShortcuts>
                    <AssistantSectionTitle>
                      <span>빠른 실행</span>
                      <small>기존 작업을 그대로 이어갑니다</small>
                    </AssistantSectionTitle>
                    <ProductionShortcutButton
                      type="button"
                      onClick={openProductionConsole}
                    >
                      <i className="fas fa-film" aria-hidden="true" />
                      <span>
                        <strong>전체 영상 제작</strong>
                        <small>순차 생성·재시도·자동 병합</small>
                      </span>
                      <i className="fas fa-arrow-right" aria-hidden="true" />
                    </ProductionShortcutButton>
                    <ProductionShortcutButton
                      type="button"
                      onClick={openFileManager}
                    >
                      <i className="fas fa-folder-tree" aria-hidden="true" />
                      <span>
                        <strong>결과·파일 관리</strong>
                        <small>다운로드·잔여 파일 정리</small>
                      </span>
                      <i className="fas fa-arrow-right" aria-hidden="true" />
                    </ProductionShortcutButton>
                  </ProductionShortcuts>
                  </ProductionAssistantRail>
                ) : null}
              </>
            ) : (
              <EmptyBoardState>
                <i className="fas fa-clapperboard" aria-hidden="true" />
                <h3>새 스토리보드로 시작하세요</h3>
                <p>
                  장면을 분해하고, 시각적 연속성을 고정한 뒤 바로 이미지를
                  생성할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={() => void createNewStoryboard()}
                >
                  새 스토리보드 만들기
                </button>
              </EmptyBoardState>
            )}
          </WorkspaceBody>
        )}
      </Workspace>
    </Overlay>
  );
}
