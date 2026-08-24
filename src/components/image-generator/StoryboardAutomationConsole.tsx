"use client";

import type {
  StoryboardVideoAutomationStatus,
  StoryboardVideoQualityMode,
} from "@/schemas/imageStoryboard";
import {
  AutomationActions,
  AutomationConsole,
  AutomationFooter,
  AutomationMode,
  AutomationProgress,
  AutomationSummary,
  BudgetGuard,
  PrimaryAutomationButton,
  ProductionDetails,
  ProgressTrack,
  RecoveryNotice,
  SceneError,
  SecondaryAutomationButton,
} from "./StoryboardVideoProductionPanel.styles";

const AUTOMATION_STATUS_LABELS: Record<
  StoryboardVideoAutomationStatus,
  string
> = {
  idle: "시작 전",
  preparing: "시작 준비 중",
  running: "장면 순차 제작 중",
  pausing: "현재 장면 후 일시정지",
  paused: "일시정지됨",
  merging: "최종 영상 조립 중",
  completed: "완성본 제작 완료",
  failed: "확인 후 재개 필요",
};

export type StoryboardAutomationConsoleModel = {
  allowUnknownPricing: boolean;
  automationErrorMessage: string | null;
  automationProgress: number;
  automationRetryCount: number;
  automationStatus: StoryboardVideoAutomationStatus;
  budgetBlocked: boolean;
  budgetExceeded: boolean;
  budgetSummary: string;
  canPauseAutomation: boolean;
  canResumeAutomation: boolean;
  finalErrorMessage: string | null;
  hasFinalDelivery: boolean;
  hasUnknownProfilePricing: boolean;
  isRecoveringAutomation: boolean;
  jobSubscriptionError: string | null;
  jobSubscriptionReady: boolean;
  maxBudgetUsd: number | null;
  pendingSceneCount: number;
  progressDescription: string;
  projectedCostLabel: string;
  projectBusy: boolean;
  qualityMode: StoryboardVideoQualityMode;
  recovery: {
    actionLabel: string;
    canReuseProviderJob: boolean;
    description: string;
    title: string;
  } | null;
  reusableSceneCount: number;
  workerIssue: string | null;
  workerStatusPending: boolean;
};

type StoryboardAutomationConsoleProps = {
  model: StoryboardAutomationConsoleModel;
  onAllowUnknownPricingChange: (allowed: boolean) => void;
  onBudgetChange: (budget: number | null) => void;
  onPause: () => void;
  onResume: () => void;
  onRetryJobSubscription: () => void;
};

export default function StoryboardAutomationConsoleView({
  model,
  onAllowUnknownPricingChange,
  onBudgetChange,
  onPause,
  onResume,
  onRetryJobSubscription,
}: StoryboardAutomationConsoleProps) {
  const finalError =
    model.finalErrorMessage &&
    model.finalErrorMessage !== model.automationErrorMessage
      ? model.finalErrorMessage
      : null;

  return (
    <AutomationConsole
      id="storyboard-production-recovery-console"
      tabIndex={-1}
      $status={model.automationStatus}
      aria-labelledby="storyboard-auto-production-title"
      data-testid="storyboard-video-automation"
    >
      <AutomationSummary>
        <div>
          <span>ONE-CLICK PRODUCTION</span>
          <h4 id="storyboard-auto-production-title">전체 영상 자동 제작</h4>
          <p>
            앞 장면의 마지막 프레임을 다음 장면에 넘기며 순서대로 제작하고, 실패
            장면만 1회 재시도한 뒤 완성본까지 자동으로 합칩니다. 각 작업은 먼저
            안전한 제작 대기열에 저장되므로 화면을 새로고침하거나 닫아도 진행
            상태를 이어서 확인할 수 있습니다.
          </p>
        </div>
        <AutomationMode>
          <i
            className={
              model.qualityMode === "final" ? "fas fa-gem" : "fas fa-bolt"
            }
            aria-hidden="true"
          />
          <span>
            <strong>
              {model.qualityMode === "final" ? "최종 완성본" : "빠른 시안"}
            </strong>
            {model.qualityMode === "final"
              ? "1080p 품질 우선"
              : "480p 속도·비용 우선"}
          </span>
        </AutomationMode>
      </AutomationSummary>

      <ProductionDetails>
        <summary>
          <span>
            <i className="fas fa-wallet" aria-hidden="true" /> 예산·비용 설정
          </span>
          <small>
            {model.budgetExceeded
              ? "예산 확인 필요"
              : `예상 ${model.projectedCostLabel}`}
          </small>
          <i className="fas fa-chevron-down" aria-hidden="true" />
        </summary>
        <BudgetGuard $blocked={model.budgetBlocked}>
          <div>
            <label htmlFor="storyboard-video-budget">최대 제작 예산</label>
            <span>
              승인된 {model.reusableSceneCount}개 장면은 재사용하고, 새로 만들{" "}
              {model.pendingSceneCount}개 장면만 계산합니다.
            </span>
          </div>
          <select
            id="storyboard-video-budget"
            value={model.maxBudgetUsd ?? ""}
            disabled={model.projectBusy}
            onChange={(event) =>
              onBudgetChange(
                event.target.value ? Number(event.target.value) : null,
              )
            }
          >
            <option value="">제한 없음</option>
            <option value="2">$2</option>
            <option value="5">$5</option>
            <option value="10">$10</option>
            <option value="20">$20</option>
          </select>
          {model.hasUnknownProfilePricing ? (
            <label className="unknown-pricing">
              <input
                type="checkbox"
                checked={model.allowUnknownPricing}
                disabled={model.projectBusy}
                onChange={(event) =>
                  onAllowUnknownPricingChange(event.target.checked)
                }
              />
              가격 미공개 모델 사용 허용
            </label>
          ) : (
            <strong>{model.budgetSummary}</strong>
          )}
        </BudgetGuard>
      </ProductionDetails>

      <AutomationProgress aria-live="polite">
        <div>
          <span>{AUTOMATION_STATUS_LABELS[model.automationStatus]}</span>
          <strong>{model.automationProgress}%</strong>
        </div>
        <ProgressTrack
          role="progressbar"
          aria-label="전체 영상 자동 제작 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={model.automationProgress}
        >
          <span style={{ width: `${model.automationProgress}%` }} />
        </ProgressTrack>
        <small>
          {model.progressDescription}
          {model.automationRetryCount > 0
            ? ` · 자동 재시도 ${model.automationRetryCount}회`
            : ""}
        </small>
        {model.workerStatusPending || model.workerIssue ? (
          <RecoveryNotice
            id="storyboard-production-worker-readiness"
            tabIndex={-1}
            role={model.workerIssue ? "alert" : "status"}
            $safe={!model.workerIssue}
            data-testid="storyboard-video-worker-readiness"
          >
            <i
              className={
                model.workerIssue
                  ? "fas fa-server"
                  : "fas fa-spinner fa-spin"
              }
              aria-hidden="true"
            />
            <div>
              <strong>
                {model.workerIssue
                  ? "영상 처리 서버 업데이트가 필요합니다"
                  : "영상 처리 서버를 확인하고 있습니다"}
              </strong>
              <p>
                {model.workerIssue ||
                  "추가 비용이 생기기 전에 캔버스 보정과 작업 복구 기능을 확인합니다."}
              </p>
            </div>
          </RecoveryNotice>
        ) : null}
        {model.jobSubscriptionError ? (
          <>
            <SceneError
              id="storyboard-production-subscription-error"
              tabIndex={-1}
              role="alert"
            >
              {model.jobSubscriptionError}
            </SceneError>
            <SecondaryAutomationButton
              id="storyboard-production-subscription-retry"
              type="button"
              onClick={onRetryJobSubscription}
            >
              <i className="fas fa-rotate" aria-hidden="true" /> 작업 상태 다시 연결
            </SecondaryAutomationButton>
          </>
        ) : null}
        {model.automationErrorMessage && model.recovery ? (
          <RecoveryNotice
            id="storyboard-production-recovery-notice"
            tabIndex={-1}
            role="alert"
            $safe={model.recovery.canReuseProviderJob}
            data-testid="storyboard-video-recovery"
          >
            <i
              className={
                model.recovery.canReuseProviderJob
                  ? "fas fa-shield-heart"
                  : "fas fa-triangle-exclamation"
              }
              aria-hidden="true"
            />
            <div>
              <strong>{model.recovery.title}</strong>
              <p>{model.recovery.description}</p>
              <details>
                <summary>기술 정보</summary>
                <code>{model.automationErrorMessage}</code>
              </details>
            </div>
          </RecoveryNotice>
        ) : null}
        {finalError ? (
          <SceneError
            id="storyboard-production-final-error"
            tabIndex={-1}
            role="alert"
          >
            {finalError}
          </SceneError>
        ) : null}
      </AutomationProgress>

      <AutomationFooter>
        <p>
          {model.hasFinalDelivery ? (
            "완성본이 준비되었습니다. 아래 미리보기에서 확인하거나 다시 병합할 수 있습니다."
          ) : (
            <>
              승인된 장면은 다시 결제하지 않고 재사용합니다. 예상 제작비{" "}
              {model.projectedCostLabel} · 실제 비용은 선택된 OpenRouter 모델에
              따라 확정됩니다.
            </>
          )}
        </p>
        <AutomationActions>
          {model.canPauseAutomation ? (
            <SecondaryAutomationButton
              type="button"
              onClick={onPause}
              disabled={model.automationStatus === "pausing"}
            >
              <i className="fas fa-pause" aria-hidden="true" />
              {model.automationStatus === "pausing"
                ? "일시정지 대기 중"
                : "현재 장면 후 멈추기"}
            </SecondaryAutomationButton>
          ) : null}
          {model.canResumeAutomation ? (
            <PrimaryAutomationButton
              id="storyboard-production-recovery-action"
              type="button"
              onClick={onResume}
              disabled={
                model.isRecoveringAutomation ||
                !model.jobSubscriptionReady ||
                Boolean(model.jobSubscriptionError) ||
                model.workerStatusPending ||
                Boolean(model.workerIssue)
              }
              aria-busy={model.isRecoveringAutomation}
              data-testid="storyboard-video-recovery-action"
            >
              <i
                className={
                  model.isRecoveringAutomation
                    ? "fas fa-spinner fa-spin"
                    : "fas fa-play"
                }
                aria-hidden="true"
              />
              {model.isRecoveringAutomation
                ? "복구 준비 중…"
                : model.recovery?.actionLabel || "멈춘 장면부터 이어 만들기"}
            </PrimaryAutomationButton>
          ) : null}
        </AutomationActions>
      </AutomationFooter>
    </AutomationConsole>
  );
}
