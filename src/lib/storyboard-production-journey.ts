import type {
  StoryboardVideoAutomationStatus,
  StoryboardVideoQualityMode,
} from "@/schemas/imageStoryboard";

export type StoryboardProductionJourneyStepState =
  | "done"
  | "current"
  | "waiting"
  | "error";

export type StoryboardProductionJourneyModel = {
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
  primaryLabel: string;
  progress: number;
  progressDescription: string;
  showPause: boolean;
  steps: Array<{
    label: string;
    description: string;
    icon: string;
    done: boolean;
    state: StoryboardProductionJourneyStepState;
  }>;
};

type StoryboardProductionJourneyParams = {
  automationActive: boolean;
  automationCompletedCount: number;
  automationCurrentSceneIndex: number | null;
  automationErrorMessage: string | null;
  automationProgress: number;
  automationStatus: StoryboardVideoAutomationStatus;
  budgetExceeded: boolean;
  canPauseAutomation: boolean;
  canResumeAutomation: boolean;
  canStartAutomation: boolean;
  finalMergeInFlight: boolean;
  firstSceneReady: boolean;
  hasFinalDelivery: boolean;
  isDownloading: boolean;
  isRecoveringAutomation: boolean;
  jobSubscriptionError: string | null;
  jobSubscriptionReady: boolean;
  nextQualityAction: StoryboardProductionJourneyModel["nextQualityAction"];
  pendingSceneCount: number;
  pricingCheckPending: boolean;
  qualityMode: StoryboardVideoQualityMode;
  readySceneCount: number;
  sceneCount: number;
  startFrameCount: number;
  unknownPricingBlocked: boolean;
};

export function buildStoryboardProductionJourney(
  params: StoryboardProductionJourneyParams,
): StoryboardProductionJourneyModel {
  const sceneProductionDone =
    params.sceneCount > 0 && params.readySceneCount === params.sceneCount;
  const currentStep =
    params.finalMergeInFlight || params.automationStatus === "merging"
      ? 2
      : params.hasFinalDelivery
        ? 3
        : sceneProductionDone
          ? 2
          : params.firstSceneReady
            ? 1
            : 0;
  const hasError =
    params.automationStatus === "failed" ||
    Boolean(params.jobSubscriptionError);
  const isBusy =
    params.automationActive ||
    params.finalMergeInFlight ||
    params.isRecoveringAutomation;
  const steps = [
    {
      label: "제작 준비",
      description: params.firstSceneReady
        ? `${params.startFrameCount}/${params.sceneCount}개 시작 이미지 확인`
        : "1번 장면 시작 이미지 필요",
      icon: "fa-image",
      done: params.firstSceneReady,
    },
    {
      label: "장면 영상",
      description: `${params.readySceneCount}/${params.sceneCount}개 완성`,
      icon: "fa-film",
      done: sceneProductionDone,
    },
    {
      label: "최종 조립",
      description:
        params.finalMergeInFlight || params.automationStatus === "merging"
          ? "장면 순서대로 조립 중"
          : sceneProductionDone
            ? "조립 준비 완료"
            : "장면 영상 완료 후 진행",
      icon: "fa-clapperboard",
      done: params.hasFinalDelivery,
    },
    {
      label: "검수·다운로드",
      description: params.hasFinalDelivery
        ? "완성본 다운로드 가능"
        : "조립 완료 후 확인",
      icon: "fa-download",
      done: params.hasFinalDelivery,
    },
  ].map((step, index) => ({
    ...step,
    state: step.done
      ? ("done" as const)
      : index === currentStep
        ? hasError
          ? ("error" as const)
          : ("current" as const)
        : ("waiting" as const),
  }));

  const primaryLabel =
    params.finalMergeInFlight || params.automationStatus === "merging"
      ? "최종 완성본 조립 중…"
      : params.automationStatus === "preparing"
        ? "제작 준비 중…"
        : params.automationStatus === "running"
          ? `${Math.min(params.sceneCount, (params.automationCurrentSceneIndex ?? 0) + 1)}번 장면 제작 중…`
          : params.automationStatus === "pausing"
            ? "현재 장면 마무리 중…"
            : params.automationStatus === "failed"
              ? "문제 해결하고 이어 만들기"
              : params.automationStatus === "paused"
                ? "멈춘 장면부터 이어 만들기"
                : params.hasFinalDelivery
                  ? "완성본 다운로드"
                  : params.pendingSceneCount === 0
                    ? "승인 영상으로 완성본 만들기"
                    : "전체 영상 만들기";

  const primaryDisabled =
    params.finalMergeInFlight ||
    params.automationActive ||
    params.isRecoveringAutomation ||
    params.isDownloading ||
    (!params.hasFinalDelivery &&
      !params.canResumeAutomation &&
      !params.canStartAutomation) ||
    (params.canResumeAutomation &&
      (!params.jobSubscriptionReady || Boolean(params.jobSubscriptionError)));

  const guidance =
    params.jobSubscriptionError ||
    (params.pricingCheckPending
      ? "장면별 예상 비용을 확인하고 있습니다. 잠시만 기다려 주세요."
      : null) ||
    (params.budgetExceeded
      ? "설정한 최대 예산을 초과했습니다. 아래 상세 설정에서 예산을 조정해 주세요."
      : null) ||
    (params.unknownPricingBlocked
      ? "가격 미공개 모델 사용 여부를 아래 상세 설정에서 선택해 주세요."
      : null) ||
    (!params.firstSceneReady
      ? "1번 장면의 대표 이미지를 먼저 만들면 전체 영상 제작을 시작할 수 있습니다."
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
    (params.hasFinalDelivery
      ? "완성본이 준비되었습니다. 바로 내려받거나 아래에서 재생해 검수하세요."
      : "버튼 한 번으로 장면을 순서대로 만들고 최종 완성본까지 자동으로 조립합니다.");

  return {
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
      : params.hasFinalDelivery
        ? "fas fa-download"
        : params.canResumeAutomation
          ? "fas fa-play"
          : "fas fa-wand-magic-sparkles",
    primaryLabel,
    progress: params.automationProgress,
    progressDescription: params.hasFinalDelivery
      ? "완성본 준비 완료"
      : `장면 영상 ${params.readySceneCount}/${params.sceneCount}개 완료`,
    showPause: params.canPauseAutomation,
    steps,
  };
}
