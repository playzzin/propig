"use client";

import type {
  StoryboardProductionJourneyModel,
  StoryboardProductionJourneyTarget,
} from "@/lib/storyboard-production-journey";
import {
  JourneyActionRow,
  JourneyCompletionCheck,
  JourneyCompletionChecks,
  JourneyHeader,
  JourneyModeBadge,
  JourneyPrimaryAction,
  JourneySecondaryAction,
  JourneyStep,
  JourneyStepIcon,
  JourneySteps,
  ProductionJourney,
} from "./StoryboardVideoProductionPanel.styles";

type StoryboardProductionJourneyProps = {
  model: StoryboardProductionJourneyModel;
  onPause: () => void;
  onPrimaryAction: () => void;
  onSelectScene: (sceneId: string) => void;
  onSelectStep: (
    target: StoryboardProductionJourneyTarget,
    sceneId?: string | null,
  ) => void;
};

export default function StoryboardProductionJourney({
  model,
  onPause,
  onPrimaryAction,
  onSelectScene,
  onSelectStep,
}: StoryboardProductionJourneyProps) {
  return (
    <ProductionJourney
      $hasError={model.hasError}
      aria-labelledby="storyboard-production-journey-title"
      data-testid="storyboard-production-journey"
    >
      <JourneyHeader>
        <div>
          <span>완성본까지 한 번에</span>
          <h4 id="storyboard-production-journey-title">
            지금은 {model.steps[model.currentStep].label} 단계입니다
          </h4>
          <p aria-live="polite">{model.guidance}</p>
        </div>
        <JourneyModeBadge>
          <i className={model.modeIcon} aria-hidden="true" />
          {model.modeLabel}
        </JourneyModeBadge>
      </JourneyHeader>

      <JourneySteps aria-label="영상 제작 진행 단계">
        {model.steps.map((step, index) => (
          <li key={step.target}>
            <JourneyStep
              type="button"
              $state={step.state}
              onClick={() => onSelectStep(step.target)}
              aria-current={index === model.currentStep ? "step" : undefined}
              aria-label={`${index + 1}단계 ${step.label}: ${step.description}`}
            >
              <JourneyStepIcon $state={step.state} aria-hidden="true">
                <i className={`fas ${step.done ? "fa-check" : step.icon}`} />
              </JourneyStepIcon>
              <span>
                <small>{String(index + 1).padStart(2, "0")}</small>
                <strong>{step.label}</strong>
                <em>{step.description}</em>
              </span>
            </JourneyStep>
          </li>
        ))}
      </JourneySteps>

      <JourneyCompletionChecks role="group" aria-label="완성본 제작 조건">
        {model.completionChecks.map((check) => (
          <JourneyCompletionCheck
            key={check.key}
            type="button"
            $ready={check.ready}
            onClick={() => onSelectStep(check.target, check.sceneId)}
            aria-label={`${check.label} ${check.value}${check.ready ? ", 완료" : ", 확인 필요"}`}
          >
            <i
              className={
                check.ready
                  ? "fas fa-circle-check"
                  : "fas fa-circle-exclamation"
              }
              aria-hidden="true"
            />
            <span>{check.label}</span>
            <strong>{check.value}</strong>
          </JourneyCompletionCheck>
        ))}
      </JourneyCompletionChecks>

      <JourneyActionRow>
        <div>
          <strong>{model.progress}% 진행</strong>
          <span>{model.progressDescription}</span>
        </div>
        {model.nextQualityAction ? (
          <JourneySecondaryAction
            type="button"
            onClick={() => onSelectScene(model.nextQualityAction!.sceneId)}
          >
            {model.nextQualityAction.sceneOrder}번 장면 보완
          </JourneySecondaryAction>
        ) : null}
        {model.showPause ? (
          <JourneySecondaryAction
            type="button"
            onClick={onPause}
            disabled={model.pauseDisabled}
          >
            현재 장면 후 멈추기
          </JourneySecondaryAction>
        ) : null}
        <JourneyPrimaryAction
          id="storyboard-production-primary-action"
          type="button"
          onClick={onPrimaryAction}
          disabled={model.primaryDisabled}
          aria-busy={model.isBusy}
        >
          <i className={model.primaryIcon} aria-hidden="true" />
          {model.primaryLabel}
        </JourneyPrimaryAction>
      </JourneyActionRow>
    </ProductionJourney>
  );
}
