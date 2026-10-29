type ConfirmationInput = {
  scope: "project" | "scene";
  pendingSceneCount: number;
  busy: boolean;
  workerBlocked: boolean;
  subscriptionReady: boolean;
  pricingPending: boolean;
  budgetExceeded: boolean;
  creditBlocked: boolean;
  unknownPricingBlocked: boolean;
  sceneEstimate?: { estimatedCostUsd: number | null; canSubmit?: boolean } | null;
  maxBudgetUsd: number | null;
  allowUnknownPricing: boolean;
};

/** Re-check the current conditions at confirmation time, for the requested scope. */
export function getStoryboardVideoConfirmationIssue(input: ConfirmationInput): string | null {
  if (input.busy) return "현재 요청이 끝난 뒤 다시 시도해 주세요.";
  if (!input.subscriptionReady) return "기존 작업 상태를 다시 연결한 뒤 시도해 주세요.";
  const needsGeneration = input.scope === "scene" || input.pendingSceneCount > 0;
  if (!needsGeneration) return null;
  if (input.workerBlocked) return "영상 처리 서버 상태를 확인한 뒤 다시 시도해 주세요.";
  if (input.scope === "project") {
    if (input.pricingPending) return "전체 제작 예상 비용을 확인하고 있습니다.";
    if (input.budgetExceeded) return "전체 제작 예상 비용이 예산 상한을 넘습니다.";
    if (input.creditBlocked) return "전체 제작에 필요한 잔액을 확인해 주세요.";
    if (input.unknownPricingBlocked) return "가격 미확정 모델 사용 여부를 고급 설정에서 확인해 주세요.";
    return null;
  }
  if (input.sceneEstimate?.canSubmit === false) return "선택한 장면의 잔액 또는 제작 조건을 확인해 주세요.";
  const cost = input.sceneEstimate?.estimatedCostUsd;
  if (cost == null || !Number.isFinite(cost) || cost < 0) {
    return input.allowUnknownPricing ? null : "이 장면의 가격이 확정되지 않았습니다. 견적을 다시 확인하거나 고급 설정에서 가격 미확정 모델 사용을 허용해 주세요.";
  }
  return input.maxBudgetUsd !== null && cost > input.maxBudgetUsd
    ? "선택한 장면의 예상 비용이 예산 상한을 넘습니다." : null;
}
