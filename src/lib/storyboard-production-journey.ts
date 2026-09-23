import type {
  StoryboardVideoAutomationStatus,
  StoryboardVideoQualityMode,
} from "@/schemas/imageStoryboard";

export type StoryboardProductionJourneyStepState =
  | "done"
  | "current"
  | "waiting"
  | "error";

export type StoryboardProductionJourneyTarget =
  | "image-design"
  | "image-generation"
  | "video-design"
  | "video-generation"
  | "final-delivery";

export type StoryboardProductionJourneyPrimaryIntent =
  | "open-image-workspace"
  | "focus-video-design"
  | "resume-automation"
  | "start-automation"
  | "remerge-final"
  | "download-final";

export type StoryboardProductionJourneyModel = {
  completionChecks: Array<{
    key: "images" | "videos" | "approvals" | "transitions" | "final";
    label: string;
    value: string;
    ready: boolean;
    sceneId: string | null;
    target: StoryboardProductionJourneyTarget;
  }>;
  currentStep: number;
  guidance: string;
  hasError: boolean;
  isBusy: boolean;
  modeIcon: string;
  modeLabel: string;
  nextQualityAction: {
    sceneId: string;
    sceneOrder: number;
  } | null;
  pauseDisabled: boolean;
  primaryDisabled: boolean;
  primaryIcon: string;
  primaryIntent: StoryboardProductionJourneyPrimaryIntent;
  primaryLabel: string;
  primarySceneId: string | null;
  progress: number;
  progressDescription: string;
  preparationDescription: string;
  showPause: boolean;
  steps: Array<{
    label: string;
    description: string;
    icon: string;
    done: boolean;
    state: StoryboardProductionJourneyStepState;
    target: StoryboardProductionJourneyTarget;
  }>;
};

export type StoryboardProductionJourneyParams = {
  approvedSceneCount: number;
  automationActive: boolean;
  automationCompletedCount: number;
  automationCurrentSceneIndex: number | null;
  automationErrorMessage: string | null;
  automationProgress: number;
  automationStatus: StoryboardVideoAutomationStatus;
  budgetExceeded: boolean;
  canPauseAutomation: boolean;
  canOpenImageWorkspace?: boolean;
  canResumeAutomation: boolean;
  canStartAutomation: boolean;
  creditIssue?: string | null;
  finalMergeInFlight: boolean;
  firstMissingApprovalSceneId: string | null;
  firstMissingImageSceneId: string | null;
  firstMissingVideoDesignSceneId: string | null;
  firstMissingVideoSceneId: string | null;
  firstTransitionIssueSceneId: string | null;
  generatedVideoCount: number;
  hasCurrentFinalDelivery: boolean;
  hasFinalDelivery: boolean;
  imageDesignReadyCount: number;
  isDownloading: boolean;
  isRecoveringAutomation: boolean;
  jobSubscriptionError: string | null;
  jobSubscriptionReady: boolean;
  nextQualityAction: StoryboardProductionJourneyModel["nextQualityAction"];
  pendingSceneCount: number;
  pricingCheckPending: boolean;
  qualityMode: StoryboardVideoQualityMode;
  sceneCount: number;
  startFrameCount: number;
  transitionCount: number;
  transitionReadyCount: number;
  unknownPricingBlocked: boolean;
  videoDesignReadyCount: number;
  workerIssue?: string | null;
  workerStatusPending?: boolean;
};

export function buildStoryboardProductionJourney(
  params: StoryboardProductionJourneyParams,
): StoryboardProductionJourneyModel {
  const imageDesignDone =
    params.sceneCount > 0 && params.imageDesignReadyCount === params.sceneCount;
  const imageProductionDone =
    params.sceneCount > 0 && params.startFrameCount === params.sceneCount;
  const videoDesignDone =
    params.sceneCount > 0 && params.videoDesignReadyCount === params.sceneCount;
  const sceneProductionDone =
    params.sceneCount > 0 &&
    params.generatedVideoCount === params.sceneCount &&
    params.approvedSceneCount === params.sceneCount;
  const finalDeliveryDone = params.hasCurrentFinalDelivery;
  const hasError =
    params.automationStatus === "failed" ||
    Boolean(params.jobSubscriptionError) ||
    Boolean(params.creditIssue) ||
    Boolean(params.workerIssue);
  const isBusy =
    params.automationActive ||
    params.finalMergeInFlight ||
    params.isRecoveringAutomation;
  const ratio = (completed: number, total: number) =>
    total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const generatedAndApprovedProgress = ratio(
    params.generatedVideoCount + params.approvedSceneCount,
    params.sceneCount * 2,
  );
  const activeAutomationProgress =
    params.automationActive || params.automationStatus === "paused"
      ? Math.min(1, Math.max(0, params.automationProgress / 90))
      : 0;
  const videoProductionProgress = Math.max(
    generatedAndApprovedProgress,
    activeAutomationProgress,
  );
  const finalAssemblyProgress = params.hasCurrentFinalDelivery
    ? 1
    : params.finalMergeInFlight || params.automationStatus === "merging"
      ? Math.min(0.95, Math.max(0.25, (params.automationProgress - 90) / 10))
      : 0;
  const journeyProgress = Math.round(
    ((ratio(params.imageDesignReadyCount, params.sceneCount) +
      ratio(params.startFrameCount, params.sceneCount) +
      ratio(params.videoDesignReadyCount, params.sceneCount) +
      videoProductionProgress +
      finalAssemblyProgress) /
      5) *
      100,
  );

  const baseSteps: Array<
    Omit<StoryboardProductionJourneyModel["steps"][number], "state">
  > = [
    {
      label: "이미지 장면 설계",
      description: `${params.imageDesignReadyCount}/${params.sceneCount}개 설계 준비`,
      icon: "fa-pen-ruler",
      done: imageDesignDone,
      target: "image-design",
    },
    {
      label: "이미지 생성",
      description: `${params.startFrameCount}/${params.sceneCount}개 대표 이미지`,
      icon: "fa-image",
      done: imageProductionDone,
      target: "image-generation",
    },
    {
      label: "동영상 장면 설계",
      description: `${params.videoDesignReadyCount}/${params.sceneCount}개 움직임 설계`,
      icon: "fa-route",
      done: videoDesignDone,
      target: "video-design",
    },
    {
      label: "동영상 생성",
      description: `${params.approvedSceneCount}/${params.sceneCount}개 승인 완료`,
      icon: "fa-film",
      done: sceneProductionDone,
      target: "video-generation",
    },
    {
      label: "최종 완성본",
      description: finalDeliveryDone
        ? "최신 완성본 다운로드 가능"
        : params.finalMergeInFlight || params.automationStatus === "merging"
          ? "장면 순서대로 조립 중"
          : params.hasFinalDelivery
            ? "변경 내용 다시 조립 필요"
            : sceneProductionDone
              ? "조립 준비 완료"
              : "승인 완료 후 자동 조립",
      icon: "fa-clapperboard",
      done: finalDeliveryDone,
      target: "final-delivery",
    },
  ];
  const firstIncompleteStep = baseSteps.findIndex((step) => !step.done);
  const currentStep = firstIncompleteStep === -1 ? 4 : firstIncompleteStep;
  const steps = baseSteps.map((step, index) => ({
    ...step,
    state: step.done
      ? ("done" as const)
      : index === currentStep
        ? hasError
          ? ("error" as const)
          : ("current" as const)
        : ("waiting" as const),
  }));

  const needsImageWorkspace = !sceneProductionDone && (!imageDesignDone || !imageProductionDone);
  const needsVideoDesign =
    !sceneProductionDone && imageProductionDone && !videoDesignDone && !params.canResumeAutomation;
  const needsRemerge =
    params.hasFinalDelivery && !params.hasCurrentFinalDelivery;
  const primaryIntent: StoryboardProductionJourneyPrimaryIntent =
    needsImageWorkspace
      ? "open-image-workspace"
      : needsVideoDesign
        ? "focus-video-design"
        : params.canResumeAutomation
          ? "resume-automation"
          : needsRemerge && sceneProductionDone
            ? "remerge-final"
            : params.hasCurrentFinalDelivery
              ? "download-final"
              : "start-automation";
  const primarySceneId =
    primaryIntent === "focus-video-design"
      ? params.firstMissingVideoDesignSceneId
      : null;

  const isGenerationAction = (primaryIntent === "start-automation" || primaryIntent === "resume-automation") && params.pendingSceneCount > 0;
  const primaryLabel =
    params.finalMergeInFlight || params.automationStatus === "merging"
      ? "최종 완성본 조립 중…"
      : params.automationStatus === "preparing"
        ? "제작 준비 중…"
        : params.automationStatus === "running"
          ? `${Math.min(params.sceneCount, (params.automationCurrentSceneIndex ?? 0) + 1)}번 장면 제작 중…`
          : params.automationStatus === "pausing"
            ? "현재 장면 마무리 중…"
            : isGenerationAction && params.workerStatusPending
                  ? "영상 서버 확인 중…"
                  : isGenerationAction && params.workerIssue
                    ? "영상 서버 업데이트 필요"
                    : params.creditIssue &&
                        (primaryIntent === "start-automation" ||
                          primaryIntent === "resume-automation")
                      ? "OpenRouter 충전 후 제작"
                    : primaryIntent === "open-image-workspace"
                      ? imageDesignDone
                        ? "비어 있는 이미지 만들기"
                        : "이미지 장면 설계 계속하기"
                      : primaryIntent === "focus-video-design"
                        ? "움직임 설계 보완하기"
                        : primaryIntent === "remerge-final"
                          ? "최신 완성본 다시 조립"
                          : primaryIntent === "download-final"
                            ? "완성본 다운로드"
                            : primaryIntent === "resume-automation"
                              ? "이어 만들기 내용 확인"
                            : params.pendingSceneCount === 0
                              ? "승인 영상으로 완성본 만들기"
                              : `${params.pendingSceneCount}개 장면 제작 내용 확인`;

  const primaryDisabled =
    params.finalMergeInFlight ||
    params.automationActive ||
    params.isRecoveringAutomation ||
    params.isDownloading ||
    (isGenerationAction &&
      (params.workerStatusPending || Boolean(params.workerIssue))) ||
    (primaryIntent === "open-image-workspace"
      ? !params.canOpenImageWorkspace
      : primaryIntent === "focus-video-design"
        ? !primarySceneId
        : primaryIntent === "download-final"
          ? false
          : primaryIntent === "remerge-final"
            ? !sceneProductionDone
            : !params.canResumeAutomation && !params.canStartAutomation) ||
    (isGenerationAction && params.canResumeAutomation &&
      (!params.jobSubscriptionReady || Boolean(params.jobSubscriptionError)));

  const guidance =
    (isGenerationAction ? params.jobSubscriptionError || params.workerIssue || params.creditIssue : null) ||
    (isGenerationAction && params.workerStatusPending
      ? "추가 비용이 생기기 전에 영상 처리 서버의 안전 버전을 확인하고 있습니다."
      : null) ||
    (isGenerationAction && params.pricingCheckPending
      ? "장면별 예상 비용을 확인하고 있습니다. 잠시만 기다려 주세요."
      : null) ||
    (isGenerationAction && params.budgetExceeded
      ? "설정한 최대 예산을 초과했습니다. 고급 설정에서 예산을 조정해 주세요."
      : null) ||
    (isGenerationAction && params.unknownPricingBlocked
      ? "가격 미공개 모델 사용 여부를 고급 설정에서 선택해 주세요."
      : null) ||
    (!imageDesignDone
      ? `${params.sceneCount}개 장면 중 ${params.imageDesignReadyCount}개의 이미지 설계가 준비됐습니다. 비어 있는 장면부터 이어서 설계하세요.`
      : null) ||
    (!imageProductionDone
      ? `${params.sceneCount}개 장면 중 ${params.startFrameCount}개의 대표 이미지가 준비됐습니다. 비어 있는 장면으로 바로 이동할 수 있습니다.`
      : null) ||
    (!videoDesignDone
      ? `${params.sceneCount}개 장면 중 ${params.videoDesignReadyCount}개의 움직임 설계가 준비됐습니다. 첫 문제 장면부터 보완하세요.`
      : null) ||
    (params.automationStatus === "failed"
      ? params.automationErrorMessage ||
        "멈춘 작업을 확인한 뒤 이어서 제작할 수 있습니다."
      : null) ||
    (params.automationStatus === "paused"
      ? "완료된 장면은 그대로 두고 멈춘 장면부터 이어갑니다."
      : null) ||
    (params.automationStatus === "running"
      ? `장면을 순서대로 제작하고 있습니다. 완료 ${params.automationCompletedCount}/${params.sceneCount}`
      : null) ||
    (params.automationStatus === "merging" || params.finalMergeInFlight
      ? "모든 장면을 스토리보드 순서대로 조립하고 있습니다."
      : null) ||
    (params.hasCurrentFinalDelivery
      ? "최신 완성본이 준비되었습니다. 바로 내려받거나 아래에서 재생해 검수하세요."
      : needsRemerge
        ? "장면이나 사운드가 바뀌었습니다. 승인된 장면 순서로 최신 완성본을 다시 조립하세요."
        : "제작 범위와 예상 비용을 확인하면 장면을 순서대로 만들고 최종 완성본까지 자동으로 조립합니다.");

  const completionChecks: StoryboardProductionJourneyModel["completionChecks"] =
    [
      {
        key: "images",
        label: "장면 이미지",
        value: `${params.startFrameCount}/${params.sceneCount}`,
        ready: imageProductionDone,
        sceneId: params.firstMissingImageSceneId,
        target: "image-generation",
      },
      {
        key: "videos",
        label: "장면 영상",
        value: `${params.generatedVideoCount}/${params.sceneCount}`,
        ready:
          params.sceneCount > 0 &&
          params.generatedVideoCount === params.sceneCount,
        sceneId: params.firstMissingVideoSceneId,
        target: "video-generation",
      },
      {
        key: "approvals",
        label: "승인 완료",
        value: `${params.approvedSceneCount}/${params.sceneCount}`,
        ready:
          params.sceneCount > 0 &&
          params.approvedSceneCount === params.sceneCount,
        sceneId: params.firstMissingApprovalSceneId,
        target: "video-generation",
      },
      {
        key: "transitions",
        label: "장면 연결",
        value:
          params.transitionCount === 0
            ? "해당 없음"
            : `${params.transitionReadyCount}/${params.transitionCount}`,
        ready:
          params.transitionCount === 0 ||
          params.transitionReadyCount === params.transitionCount,
        sceneId: params.firstTransitionIssueSceneId,
        target: "video-design",
      },
      {
        key: "final",
        label: "최종 조립",
        value: finalDeliveryDone
          ? "최신"
          : params.hasFinalDelivery
            ? "갱신 필요"
            : "대기",
        ready: finalDeliveryDone,
        sceneId: null,
        target: "final-delivery",
      },
    ];

  return {
    completionChecks,
    currentStep,
    guidance,
    hasError,
    isBusy,
    modeIcon: params.qualityMode === "final" ? "fas fa-gem" : "fas fa-bolt",
    modeLabel: params.qualityMode === "final" ? "최종 품질" : "빠른 시안",
    nextQualityAction: params.nextQualityAction,
    pauseDisabled: params.automationStatus === "pausing",
    primaryDisabled,
    primaryIcon: isBusy
      ? "fas fa-spinner fa-spin"
      : primaryIntent === "open-image-workspace"
        ? "fas fa-images"
        : primaryIntent === "focus-video-design"
          ? "fas fa-pen-ruler"
          : primaryIntent === "download-final"
            ? "fas fa-download"
            : primaryIntent === "resume-automation"
              ? "fas fa-play"
              : primaryIntent === "remerge-final"
                ? "fas fa-arrows-rotate"
                : "fas fa-wand-magic-sparkles",
    primaryIntent,
    primaryLabel,
    primarySceneId,
    progress: journeyProgress,
    preparationDescription: `준비 ${[imageDesignDone, imageProductionDone, videoDesignDone].filter(Boolean).length}/3단계`,
    progressDescription: params.hasCurrentFinalDelivery
      ? "최신 완성본 준비 완료"
      : !imageProductionDone
        ? `장면 이미지 ${params.startFrameCount}/${params.sceneCount}개 준비`
        : `승인 영상 ${params.approvedSceneCount}/${params.sceneCount}개 완료`,
    showPause: params.canPauseAutomation,
    steps,
  };
}
