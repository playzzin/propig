import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import {
  VIDEO_STUDIO_CLIPS_COLLECTION,
  VIDEO_STUDIO_DEFAULT_ASPECT_RATIO,
  VIDEO_STUDIO_DEFAULT_RESOLUTION,
  VIDEO_STUDIO_PROJECTS_COLLECTION,
  type VideoStudioAspectRatio,
  type VideoStudioClip,
  type VideoStudioClipMode,
  type VideoStudioClipStatus,
  type VideoStudioJobKind,
  type VideoStudioJobStatus,
  type VideoStudioProject,
  type VideoStudioProjectStarterSource,
  type VideoStudioResolution,
} from "@/lib/video-studio";
import type {
  StoryboardAudioMixPreset,
  StoryboardVideoAudioMode,
  StoryboardVideoQualityMode,
} from "@/schemas/imageStoryboard";
import {
  VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
  hasRequiredVideoStudioWorkerCapabilities,
  type VideoStudioWorkerState,
  type VideoStudioWorkerStatus,
} from "@/lib/video-studio-worker-contract";

type CreateProjectInput = {
  projectId?: string;
  userId: string;
  title: string;
  synopsis?: string;
  aspectRatio?: VideoStudioAspectRatio;
  resolution?: VideoStudioResolution;
  starterImageUrl?: string | null;
  starterImageSource?: VideoStudioProjectStarterSource | null;
  starterAlbumId?: string | null;
  starterPhotoId?: string | null;
  starterStoragePath?: string | null;
};

type CreateClipInput = {
  userId: string;
  projectId: string;
  title: string;
  prompt: string;
  mode: VideoStudioClipMode;
  status?: VideoStudioClipStatus;
  sequence: number;
  videoUrl: string;
  posterUrl?: string | null;
  lastFrameUrl?: string | null;
  continuityNotes?: string | null;
  cameraNotes?: string | null;
  subjectLock?: string | null;
  takeGroupId?: string | null;
  parentTakeClipId?: string | null;
  takeIndex?: number | null;
  sourceClipId?: string | null;
  sourceVideoUrl?: string | null;
  mergeSourceClipIds?: string[];
  duration?: number | null;
  aspectRatio: VideoStudioAspectRatio;
  resolution: VideoStudioResolution;
};

type CreateClipViaApiInput = Omit<CreateClipInput, "sequence"> & {
  authToken: string;
};

type CreateClipViaApiResult = {
  success: true;
  clipId: string;
  sequence: number;
};

export type RunStudioJobInput = {
  authToken: string;
  idempotencyKey?: string;
  operation: VideoStudioJobKind;
  projectId: string;
  clipTitle?: string;
  prompt?: string;
  duration?: number;
  authorizedCostUsd?: number;
  repeatCount?: number;
  autoMergeAfterLoop?: boolean;
  referenceImage?: string;
  endReferenceImage?: string;
  visualReferenceImages?: string[];
  visualInputMode?: "standard" | "text-only";
  continuityNotes?: string;
  cameraNotes?: string;
  subjectLock?: string;
  sourceClipId?: string;
  mergeClipIds?: string[];
  mergeClipEdits?: Array<{
    clipId: string;
    trimStartSeconds?: number;
    trimEndSeconds?: number;
    playbackRate?: number;
    audioVolume?: number;
    transitionStyle?: "cut" | "crossfade" | "match-cut" | "bridge";
    transitionSeconds?: number;
  }>;
  backgroundMusicUrl?: string;
  audioMixPreset?: StoryboardAudioMixPreset;
  backgroundMusicVolume?: number;
  sceneAudioVolume?: number;
  audioCrossfadeSeconds?: number;
  forceRealRun?: boolean;
  qualityMode?: StoryboardVideoQualityMode;
  generateAudio?: boolean;
  audioMode?: StoryboardVideoAudioMode;
  dialogue?: string;
};

type RunStudioJobResult = {
  success: true;
  jobId: string;
  clipId?: string;
  videoUrl?: string;
  lastFrameUrl?: string;
  pending?: boolean;
};

type SubmitStudioJobResult = {
  success: true;
  jobId: string;
  status: VideoStudioJobStatus;
  deduplicated?: boolean;
};

type UpdateStudioJobResult = {
  success: true;
  jobId: string;
  status: VideoStudioJobStatus;
  cancellationRequested?: boolean;
  message?: string | null;
};

type ResequenceTimelineResult = {
  success: true;
  projectId: string;
  clipCount: number;
};

type DeleteClipResult = {
  success: true;
  projectId: string;
  clipCount: number;
};

export type VideoStudioRuntimeStatus = {
  provider: "openrouter";
  devMode: boolean;
  openRouterApiKeyConfigured: boolean;
  configSource: "firestore" | "functions_env" | "server_env" | "none";
  processorSecretConfigured: boolean;
  automaticProcessorConfigured: boolean;
  worker: VideoStudioWorkerStatus;
};

export type VideoStudioEstimate = {
  selection: "automatic";
  canSubmit: boolean;
  modelId: string;
  modelName: string;
  requestedResolution: VideoStudioResolution;
  resolvedResolution: string;
  resolvedSize: string | null;
  requestedDuration: number;
  resolvedDuration: number;
  aspectRatio: VideoStudioAspectRatio;
  rateUsdPerSecond: number | null;
  estimatedCostUsd: number | null;
  catalogModelCount: number;
  compatibleModelCount: number;
  catalog: {
    source: "live" | "cache";
    fetchedAt: string;
    refreshAfter: string;
    selectedModelCreatedAt: string | null;
  };
  credit: {
    state: "available" | "unavailable";
    source: "live" | "cache" | null;
    remainingUsd: number | null;
    totalCreditsUsd: number | null;
    totalUsageUsd: number | null;
    requiredUsd: number | null;
    isSufficient: boolean | null;
    message: string | null;
    fetchedAt: string | null;
    refreshAfter: string | null;
  };
  policy: {
    visualInputState:
      | "not_requested"
      | "provider_review_required"
      | "previously_rejected";
    automaticRetryAllowed: boolean;
    message: string;
    recommendedActions: string[];
  };
  selectionReasons: string[];
  capabilities: {
    firstFrame: boolean;
    lastFrame: boolean;
    visualReferences: boolean;
    audio: boolean;
    dialogueLipSync: boolean;
  };
  requestedInputs: {
    firstFrame: boolean;
    lastFrame: boolean;
    visualReferences: boolean;
    audioMode: StoryboardVideoAudioMode;
  };
  warnings: string[];
};

export type VideoStudioStorageFile = {
  path: string;
  sizeBytes: number;
  updatedAt: string | null;
  kind: "video" | "frame" | "other";
};

export type VideoStudioStorageOverview = {
  projectId: string;
  cleanupLocked: boolean;
  activeJobCount: number;
  protectedFileCount: number;
  cleanupCandidateCount: number;
  cleanupCandidateBytes: number;
  cleanupCandidates: VideoStudioStorageFile[];
  truncated: boolean;
};

type GetVideoStudioRuntimeStatusResult = {
  success: true;
  status: VideoStudioRuntimeStatus;
};

const VIDEO_STUDIO_CONFIG_SOURCES = new Set<
  VideoStudioRuntimeStatus["configSource"]
>(["firestore", "functions_env", "server_env", "none"]);

function parseVideoStudioRuntimeStatus(value: unknown): VideoStudioRuntimeStatus {
  const status = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const rawWorker = status.worker && typeof status.worker === "object"
    ? (status.worker as Record<string, unknown>)
    : {};
  const protocolVersion =
    typeof rawWorker.protocolVersion === "number" &&
    Number.isInteger(rawWorker.protocolVersion)
      ? rawWorker.protocolVersion
      : null;
  const capabilities = Array.isArray(rawWorker.capabilities)
    ? rawWorker.capabilities.filter(
        (capability): capability is string => typeof capability === "string",
      )
    : [];
  const openRouterApiKeyConfigured =
    status.openRouterApiKeyConfigured === true;
  const automaticProcessorConfigured =
    status.automaticProcessorConfigured === true;
  const contractCompatible =
    rawWorker.compatible === true &&
    protocolVersion !== null &&
    protocolVersion >= VIDEO_STUDIO_WORKER_PROTOCOL_VERSION &&
    hasRequiredVideoStudioWorkerCapabilities(capabilities);
  const compatible =
    contractCompatible &&
    openRouterApiKeyConfigured &&
    automaticProcessorConfigured;
  const reportedState = rawWorker.state;
  const state: VideoStudioWorkerState = compatible
    ? "ready"
    : reportedState === "outdated" ||
        reportedState === "unavailable" ||
        reportedState === "misconfigured"
      ? reportedState
      : !contractCompatible
        ? "outdated"
        : "misconfigured";
  const configSource = VIDEO_STUDIO_CONFIG_SOURCES.has(
    status.configSource as VideoStudioRuntimeStatus["configSource"],
  )
    ? (status.configSource as VideoStudioRuntimeStatus["configSource"])
    : "none";

  return {
    provider: "openrouter",
    devMode: status.devMode === true,
    openRouterApiKeyConfigured,
    configSource,
    processorSecretConfigured: status.processorSecretConfigured === true,
    automaticProcessorConfigured,
    worker: {
      state,
      compatible,
      protocolVersion,
      requiredProtocolVersion: VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
      capabilities,
      checkedAt:
        typeof rawWorker.checkedAt === "string"
          ? rawWorker.checkedAt
          : new Date().toISOString(),
      message:
        typeof rawWorker.message === "string" && rawWorker.message.trim()
          ? rawWorker.message
          : "배포된 영상 처리 서버가 안전 규격을 증명하지 못했습니다. 최신 워커를 확인하기 전에는 영상 제작을 시작하지 않습니다.",
      ...(typeof rawWorker.latencyMs === "number" &&
      Number.isFinite(rawWorker.latencyMs) &&
      rawWorker.latencyMs >= 0
        ? { latencyMs: rawWorker.latencyMs }
        : {}),
      ...(rawWorker.verification === "firestore-trigger-challenge"
        ? { verification: rawWorker.verification }
        : {}),
    },
  };
}

type GetVideoStudioEstimateResult = {
  success: true;
  estimate: VideoStudioEstimate;
};

type GetVideoStudioStorageOverviewResult = {
  success: true;
  overview: VideoStudioStorageOverview;
};

type DeleteVideoStudioStorageResidualsResult = {
  success: true;
  deletedStoragePaths: string[];
  failed: Array<{ storagePath: string; message: string }>;
};

class VideoStudioService {
  async getVideoEstimate(params: {
    authToken: string;
    duration: number;
    resolution: VideoStudioResolution;
    aspectRatio: VideoStudioAspectRatio;
    qualityMode: StoryboardVideoQualityMode;
    hasReferenceImage: boolean;
    hasEndReferenceImage: boolean;
    hasVisualReferenceImages: boolean;
    audioMode: StoryboardVideoAudioMode;
    forceModelRefresh?: boolean;
    knownInputImagePrivacyBlock?: boolean;
    signal?: AbortSignal;
  }): Promise<VideoStudioEstimate> {
    const search = new URLSearchParams({
      duration: String(params.duration),
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      qualityMode: params.qualityMode,
      hasReferenceImage: String(params.hasReferenceImage),
      hasEndReferenceImage: String(params.hasEndReferenceImage),
      hasVisualReferenceImages: String(params.hasVisualReferenceImages),
      audioMode: params.audioMode,
      forceModelRefresh: String(Boolean(params.forceModelRefresh)),
      knownInputImagePrivacyBlock: String(
        Boolean(params.knownInputImagePrivacyBlock),
      ),
    });
    const response = await fetch(
      `/api/video-studio/estimate?${search.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${params.authToken}`,
        },
        signal: params.signal,
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<GetVideoStudioEstimateResult>)
      | null;
    if (!response.ok || !payload?.success || !payload.estimate) {
      throw new Error(
        payload?.error || "영상 예상 비용을 계산하지 못했습니다.",
      );
    }
    return payload.estimate;
  }

  async getStudioRuntimeStatus(params: {
    authToken: string;
  }): Promise<VideoStudioRuntimeStatus> {
    const response = await fetch("/api/video-studio/status", {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${params.authToken}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<GetVideoStudioRuntimeStatusResult>)
      | null;

    if (!response.ok || !payload?.success || !payload.status) {
      throw new Error(
        payload?.error || "영상 처리 서버 상태를 확인하지 못했습니다.",
      );
    }

    return parseVideoStudioRuntimeStatus(payload.status);
  }

  async createProject(input: CreateProjectInput): Promise<string> {
    const data = {
      userId: input.userId,
      title: input.title.trim(),
      synopsis: input.synopsis?.trim() || "",
      aspectRatio: input.aspectRatio || VIDEO_STUDIO_DEFAULT_ASPECT_RATIO,
      resolution: input.resolution || VIDEO_STUDIO_DEFAULT_RESOLUTION,
      starterImageUrl: input.starterImageUrl || null,
      starterImageSource: input.starterImageSource || null,
      starterAlbumId: input.starterAlbumId || null,
      starterPhotoId: input.starterPhotoId || null,
      starterStoragePath: input.starterStoragePath || null,
      clipCount: 0,
      coverClipId: null,
      coverUrl: input.starterImageUrl || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (input.projectId) {
      const projectRef = doc(
        db,
        VIDEO_STUDIO_PROJECTS_COLLECTION,
        input.projectId,
      );
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(projectRef);
        if (snapshot.exists()) {
          const existing = snapshot.data() as Partial<VideoStudioProject>;
          if (existing.userId !== input.userId) {
            throw new Error("이 영상 프로젝트에 접근할 수 없습니다.");
          }
          transaction.update(projectRef, {
            title: data.title,
            synopsis: data.synopsis,
            aspectRatio: data.aspectRatio,
            resolution: data.resolution,
            updatedAt: serverTimestamp(),
          });
          return;
        }
        transaction.set(projectRef, data);
      });
      return input.projectId;
    }

    const docRef = await addDoc(
      collection(db, VIDEO_STUDIO_PROJECTS_COLLECTION),
      data,
    );

    return docRef.id;
  }

  async updateProject(
    projectId: string,
    data: Partial<VideoStudioProject>,
  ): Promise<void> {
    await updateDoc(doc(db, VIDEO_STUDIO_PROJECTS_COLLECTION, projectId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await deleteDoc(doc(db, VIDEO_STUDIO_PROJECTS_COLLECTION, projectId));
  }

  async createClip(input: CreateClipInput): Promise<string> {
    const docRef = await addDoc(collection(db, VIDEO_STUDIO_CLIPS_COLLECTION), {
      userId: input.userId,
      projectId: input.projectId,
      title: input.title.trim(),
      prompt: input.prompt.trim(),
      mode: input.mode,
      status: input.status || "ready",
      provider: "openrouter",
      sequence: input.sequence,
      videoUrl: input.videoUrl,
      posterUrl: input.posterUrl || null,
      lastFrameUrl: input.lastFrameUrl || null,
      continuityNotes: input.continuityNotes || null,
      cameraNotes: input.cameraNotes || null,
      subjectLock: input.subjectLock || null,
      sourceClipId: input.sourceClipId || null,
      sourceVideoUrl: input.sourceVideoUrl || null,
      mergeSourceClipIds: input.mergeSourceClipIds || [],
      duration: input.duration ?? null,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(
      doc(db, VIDEO_STUDIO_PROJECTS_COLLECTION, input.projectId),
      {
        clipCount: input.sequence + 1,
        coverClipId: docRef.id,
        coverUrl: input.posterUrl || input.lastFrameUrl || input.videoUrl,
        updatedAt: serverTimestamp(),
      },
    );

    return docRef.id;
  }

  async createClipViaApi(
    input: CreateClipViaApiInput,
  ): Promise<CreateClipViaApiResult> {
    const response = await fetch("/api/video-studio/clips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.authToken}`,
      },
      body: JSON.stringify({
        userId: input.userId,
        projectId: input.projectId,
        title: input.title,
        prompt: input.prompt,
        mode: input.mode,
        status: input.status,
        videoUrl: input.videoUrl,
        posterUrl: input.posterUrl,
        lastFrameUrl: input.lastFrameUrl,
        continuityNotes: input.continuityNotes,
        cameraNotes: input.cameraNotes,
        subjectLock: input.subjectLock,
        takeGroupId: input.takeGroupId,
        parentTakeClipId: input.parentTakeClipId,
        takeIndex: input.takeIndex,
        sourceClipId: input.sourceClipId,
        sourceVideoUrl: input.sourceVideoUrl,
        mergeSourceClipIds: input.mergeSourceClipIds,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<CreateClipViaApiResult>)
      | null;

    if (!response.ok || !payload?.success || !payload.clipId) {
      throw new Error(payload?.error || "Failed to save clip.");
    }

    return payload as CreateClipViaApiResult;
  }

  async submitStudioJob(
    input: RunStudioJobInput,
  ): Promise<SubmitStudioJobResult> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.authToken}`,
    };

    if (input.forceRealRun) {
      headers["x-video-studio-force-real-run"] = "true";
    }
    if (input.idempotencyKey) {
      headers["Idempotency-Key"] = input.idempotencyKey;
    }

    const response = await fetch("/api/video-studio/jobs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        operation: input.operation,
        projectId: input.projectId,
        clipTitle: input.clipTitle,
        prompt: input.prompt,
        duration: input.duration,
        repeatCount: input.repeatCount,
        autoMergeAfterLoop: input.autoMergeAfterLoop,
        referenceImage: input.referenceImage,
        endReferenceImage: input.endReferenceImage,
        visualReferenceImages: input.visualReferenceImages,
        visualInputMode: input.visualInputMode,
        continuityNotes: input.continuityNotes,
        cameraNotes: input.cameraNotes,
        subjectLock: input.subjectLock,
        sourceClipId: input.sourceClipId,
        mergeClipIds: input.mergeClipIds,
        mergeClipEdits: input.mergeClipEdits,
        backgroundMusicUrl: input.backgroundMusicUrl,
        audioMixPreset: input.audioMixPreset,
        backgroundMusicVolume: input.backgroundMusicVolume,
        sceneAudioVolume: input.sceneAudioVolume,
        audioCrossfadeSeconds: input.audioCrossfadeSeconds,
        qualityMode: input.qualityMode,
        generateAudio: input.generateAudio,
        audioMode: input.audioMode,
        dialogue: input.dialogue,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<SubmitStudioJobResult>)
      | null;

    if (!response.ok || !payload?.success || !payload.jobId) {
      throw new Error(
        payload?.error || "Failed to queue the video studio job.",
      );
    }

    return payload as SubmitStudioJobResult;
  }

  async processStudioJob(params: {
    authToken: string;
    jobId: string;
  }): Promise<RunStudioJobResult> {
    const response = await fetch("/api/video-studio/jobs/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.authToken}`,
      },
      body: JSON.stringify({
        jobId: params.jobId,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<RunStudioJobResult>)
      | null;

    if (
      response.status === 409 &&
      payload?.error &&
      /already (?:being processed|completed)/i.test(payload.error)
    ) {
      return {
        success: true,
        jobId: params.jobId,
      };
    }

    if (!response.ok || !payload?.success || !payload.jobId) {
      throw new Error(
        payload?.error || "Failed to process the queued video studio job.",
      );
    }

    return payload as RunStudioJobResult;
  }

  async updateStudioJob(params: {
    authToken: string;
    jobId: string;
    action: "requeue" | "cancel";
    requireProviderResume?: boolean;
  }): Promise<UpdateStudioJobResult> {
    const response = await fetch(`/api/video-studio/jobs/${params.jobId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.authToken}`,
      },
      body: JSON.stringify({
        action: params.action,
        ...(params.action === "requeue" && params.requireProviderResume
          ? { requireProviderResume: true }
          : {}),
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<UpdateStudioJobResult>)
      | null;

    if (
      !response.ok ||
      !payload?.success ||
      !payload.jobId ||
      !payload.status
    ) {
      throw new Error(
        payload?.error || "Failed to update the video studio job.",
      );
    }

    return payload as UpdateStudioJobResult;
  }

  async runStudioJob(input: RunStudioJobInput): Promise<RunStudioJobResult> {
    const queued = await this.submitStudioJob(input);
    return this.processStudioJob({
      authToken: input.authToken,
      jobId: queued.jobId,
    });
  }

  async updateClip(
    clipId: string,
    data: Partial<VideoStudioClip>,
  ): Promise<void> {
    await updateDoc(doc(db, VIDEO_STUDIO_CLIPS_COLLECTION, clipId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteClip(params: {
    authToken: string;
    clipId: string;
  }): Promise<DeleteClipResult> {
    const response = await fetch(`/api/video-studio/clips/${params.clipId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${params.authToken}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<DeleteClipResult>)
      | null;

    if (!response.ok || !payload?.success || !payload.projectId) {
      throw new Error(payload?.error || "Failed to delete the selected clip.");
    }

    return payload as DeleteClipResult;
  }

  async resequenceClips(params: {
    authToken: string;
    projectId: string;
    clipIds: string[];
  }): Promise<ResequenceTimelineResult> {
    const response = await fetch(
      `/api/video-studio/projects/${params.projectId}/timeline`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.authToken}`,
        },
        body: JSON.stringify({
          clipIds: params.clipIds,
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<ResequenceTimelineResult>)
      | null;

    if (!response.ok || !payload?.success || !payload.projectId) {
      throw new Error(
        payload?.error || "Failed to reorder the video studio timeline.",
      );
    }

    return payload as ResequenceTimelineResult;
  }

  async getProjectStorageOverview(params: {
    authToken: string;
    projectId: string;
    signal?: AbortSignal;
  }): Promise<VideoStudioStorageOverview> {
    const response = await fetch(
      `/api/video-studio/projects/${params.projectId}/storage`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${params.authToken}`,
        },
        cache: "no-store",
        signal: params.signal,
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<GetVideoStudioStorageOverviewResult>)
      | null;

    if (!response.ok || !payload?.success || !payload.overview) {
      throw new Error(
        payload?.error || "Failed to inspect generated video files.",
      );
    }
    return payload.overview;
  }

  async deleteProjectStorageResiduals(params: {
    authToken: string;
    projectId: string;
    storagePaths: string[];
  }): Promise<DeleteVideoStudioStorageResidualsResult> {
    const response = await fetch(
      `/api/video-studio/projects/${params.projectId}/storage`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.authToken}`,
        },
        body: JSON.stringify({ storagePaths: params.storagePaths }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string } & Partial<DeleteVideoStudioStorageResidualsResult>)
      | null;

    if (!response.ok || !payload?.success) {
      throw new Error(
        payload?.error || "Failed to clean up generated video files.",
      );
    }
    return payload as DeleteVideoStudioStorageResidualsResult;
  }
}

export const videoStudioService = new VideoStudioService();
