"use client";

import styled from "styled-components";
import type {
  StoryboardVideoAutomationStatus,
  StoryboardVideoSceneStatus,
} from "@/schemas/imageStoryboard";
import type { StoryboardDialogueTiming } from "@/lib/storyboard-video-audio";

type SceneQualityReadiness = {
  tone: "ready" | "progress" | "needs";
};

const ProductionSurface = styled.section`
  --text-primary: var(--text-main);
  --text-secondary: var(--text-muted);
  --primary-color: var(--primary);
  --border-color: var(--border-subtle);
  --background-paper: var(--bg-card);
  --background-default: var(--bg-elevated);
  --success-color: #10b981;
  --error-color: #ef4444;
  display: grid;
  gap: 20px;
  min-width: 0;
  overflow-x: hidden;

  button,
  a,
  select,
  input,
  textarea {
    touch-action: manipulation;
  }
  @media (prefers-reduced-motion: reduce) {
    .fa-spin {
      animation: none !important;
    }
  }
`;

const ProductionHeader = styled.header`
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;

  h3 {
    margin: 4px 0 8px;
    color: var(--text-primary);
    font-size: clamp(1.35rem, 2vw, 1.8rem);
  }
  p {
    max-width: 680px;
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.86rem;
    line-height: 1.65;
  }

  @media (max-width: 720px) {
    flex-direction: column;
    gap: 12px;
  }
`;

const HeaderLabel = styled.span`
  color: var(--primary-color);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.12em;
`;

const AutomaticBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 28%, var(--border-color));
  border-radius: 999px;
  color: var(--primary-color);
  background: color-mix(
    in srgb,
    var(--primary-color) 7%,
    var(--background-paper)
  );
  font-size: 0.72rem;
  font-weight: 800;
`;

const ProductionJourney = styled.section<{ $hasError: boolean }>`
  display: grid;
  gap: 16px;
  padding: 20px;
  border: 1px solid
    ${({ $hasError }) =>
      $hasError
        ? "color-mix(in srgb, var(--error-color) 54%, var(--border-color))"
        : "color-mix(in srgb, var(--primary-color) 42%, var(--border-color))"};
  border-radius: 18px;
  background: ${({ $hasError }) =>
    $hasError
      ? "color-mix(in srgb, var(--error-color) 5%, var(--background-paper))"
      : "color-mix(in srgb, var(--primary-color) 5%, var(--background-paper))"};
`;

const JourneyHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;

  > div {
    min-width: 0;
  }
  > div > span {
    color: var(--primary-color);
    font-size: 0.64rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }
  h4 {
    margin: 5px 0 4px;
    color: var(--text-primary);
    font-size: 1.08rem;
    text-wrap: balance;
  }
  p {
    max-width: 760px;
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.55;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  @media (max-width: 640px) {
    flex-direction: column;
    gap: 9px;
  }
`;

const JourneyModeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  color: var(--text-secondary);
  background: var(--background-paper);
  font-size: 0.64rem;
  font-weight: 850;

  i {
    color: var(--primary-color);
  }
`;

const JourneySteps = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (max-width: 840px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const JourneyStep = styled.li<{
  $state: "done" | "current" | "waiting" | "error";
}>`
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 76px;
  padding: 10px;
  border: 1px solid
    ${({ $state }) =>
      $state === "done"
        ? "color-mix(in srgb, var(--success-color) 44%, var(--border-color))"
        : $state === "error"
          ? "color-mix(in srgb, var(--error-color) 56%, var(--border-color))"
          : $state === "current"
            ? "var(--primary-color)"
            : "var(--border-color)"};
  border-radius: 12px;
  background: ${({ $state }) =>
    $state === "done"
      ? "color-mix(in srgb, var(--success-color) 7%, var(--background-paper))"
      : $state === "error"
        ? "color-mix(in srgb, var(--error-color) 7%, var(--background-paper))"
        : $state === "current"
          ? "color-mix(in srgb, var(--primary-color) 9%, var(--background-paper))"
          : "var(--background-paper)"};

  > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  small {
    color: ${({ $state }) =>
      $state === "error"
        ? "var(--error-color)"
        : $state === "done"
          ? "var(--success-color)"
          : "var(--text-muted)"};
    font-size: 0.56rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }
  strong {
    color: var(--text-primary);
    font-size: 0.7rem;
  }
  em {
    color: var(--text-muted);
    font-size: 0.59rem;
    font-style: normal;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
`;

const JourneyStepIcon = styled.span<{
  $state: "done" | "current" | "waiting" | "error";
}>`
  display: inline-grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  color: ${({ $state }) =>
    $state === "done"
      ? "var(--success-color)"
      : $state === "error"
        ? "var(--error-color)"
        : $state === "waiting"
          ? "var(--text-muted)"
          : "var(--primary-color)"};
  background: color-mix(
    in srgb,
    ${({ $state }) =>
        $state === "done"
          ? "var(--success-color)"
          : $state === "error"
            ? "var(--error-color)"
            : $state === "waiting"
              ? "var(--text-muted)"
              : "var(--primary-color)"}
      10%,
    var(--background-default)
  );
  font-size: 0.75rem;
`;

const JourneyActionRow = styled.div`
  display: grid;
  grid-template-columns: minmax(160px, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);

  > div {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  > div strong {
    color: var(--text-primary);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
  }
  > div span {
    color: var(--text-muted);
    font-size: 0.62rem;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr auto;
    > div {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 520px) {
    grid-template-columns: 1fr;
    > button {
      width: 100%;
    }
  }
`;

const JourneyActionBase = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 16px;
  border-radius: 11px;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 900;
  cursor: pointer;
  touch-action: manipulation;

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 34%, transparent);
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }
`;

const JourneyPrimaryAction = styled(JourneyActionBase)`
  min-width: 190px;
  border: 1px solid var(--primary-color);
  color: white;
  background: var(--primary-color);
  &:hover:not(:disabled) {
    background: var(--primary-dark);
  }
`;

const JourneySecondaryAction = styled(JourneyActionBase)`
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  background: var(--background-paper);
  &:hover:not(:disabled) {
    border-color: var(--primary-color);
    color: var(--text-primary);
  }
`;

const ControlStrip = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(420px, 1.2fr);
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: var(--background-paper);
  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const QualityReadiness = styled.section<{ $score: number }>`
  display: grid;
  grid-template-columns: auto minmax(140px, 0.7fr) minmax(280px, 1fr);
  align-items: center;
  gap: 18px;
  padding: 14px 16px;
  border: 1px solid
    ${({ $score }) =>
      $score < 75
        ? "color-mix(in srgb, var(--error-color) 32%, var(--border-color))"
        : "color-mix(in srgb, var(--primary-color) 26%, var(--border-color))"};
  border-radius: 14px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--primary-color) 7%, var(--background-paper)),
    var(--background-paper)
  );
  > div {
    display: grid;
    gap: 2px;
    min-width: 106px;
  }
  > div > span {
    color: var(--primary-color);
    font-size: 0.6rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }
  strong {
    color: var(--text-primary);
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }
  small {
    color: var(--text-secondary);
    font-size: 0.64rem;
    white-space: nowrap;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.7rem;
    line-height: 1.5;
  }
  em {
    display: block;
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 0.62rem;
    font-style: normal;
  }
  @media (max-width: 820px) {
    grid-template-columns: auto 1fr;
    p {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    small {
      white-space: normal;
    }
  }
`;

const QualityMeter = styled.div`
  position: relative;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border-color) 70%, transparent);
  span {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      var(--primary-color),
      color-mix(in srgb, var(--success-color) 72%, var(--primary-color))
    );
    transform-origin: left;
    transition: transform 240ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    span {
      transition: none;
    }
  }
`;

const ProductionDetails = styled.details`
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: var(--background-paper);

  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 13px;
    color: var(--text-secondary);
    cursor: pointer;
    list-style: none;
  }
  > summary::-webkit-details-marker {
    display: none;
  }
  > summary > span {
    flex: 1;
    color: var(--text-secondary);
    font-size: 0.68rem;
    font-weight: 850;
  }
  > summary > span i {
    margin-right: 6px;
    color: var(--primary-color);
  }
  > summary > small {
    color: var(--text-muted);
    font-size: 0.61rem;
    text-align: right;
  }
  > summary > i {
    color: var(--text-muted);
    transition: transform 150ms ease;
  }
  &[open] > summary {
    border-bottom: 1px solid var(--border-color);
  }
  &[open] > summary > i {
    transform: rotate(180deg);
  }
  > summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 26%, transparent);
    outline-offset: -3px;
  }
  > section,
  > div {
    margin: 12px;
  }

  @media (max-width: 560px) {
    > summary {
      align-items: flex-start;
      min-height: 52px;
      padding: 10px 12px;
    }
    > summary > small {
      max-width: 46%;
    }
  }
`;

const QualityGate = styled.section`
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 22%, var(--border-color));
  border-radius: 18px;
  background: var(--background-paper);
`;

const QualityGateHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  > div {
    min-width: 0;
  }
  > div > span {
    color: var(--primary-color);
    font-size: 0.61rem;
    font-weight: 900;
    letter-spacing: 0.11em;
  }
  h4 {
    margin: 4px 0;
    color: var(--text-primary);
    font-size: 0.98rem;
  }
  p {
    max-width: 650px;
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.68rem;
    line-height: 1.5;
  }
  > strong {
    flex: 0 0 auto;
    padding: 7px 9px;
    border-radius: 999px;
    color: var(--primary-color);
    background: color-mix(
      in srgb,
      var(--primary-color) 8%,
      var(--background-default)
    );
    font-size: 0.64rem;
  }
  @media (max-width: 620px) {
    flex-direction: column;
    gap: 8px;
  }
`;

const QualityCheckGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  @media (max-width: 880px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const QualityCheck = styled.div<{ $ready: boolean }>`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  min-width: 0;
  padding: 11px;
  border: 1px solid
    ${({ $ready }) =>
      $ready
        ? "color-mix(in srgb, var(--success-color) 32%, var(--border-color))"
        : "var(--border-color)"};
  border-radius: 12px;
  background: ${({ $ready }) =>
    $ready
      ? "color-mix(in srgb, var(--success-color) 6%, var(--background-default))"
      : "var(--background-default)"};

  > i {
    grid-row: span 2;
    margin-top: 2px;
    color: ${({ $ready }) =>
      $ready ? "var(--success-color)" : "var(--text-muted)"};
    font-size: 0.76rem;
  }
  > span {
    color: var(--text-secondary);
    font-size: 0.61rem;
    font-weight: 800;
  }
  > strong {
    color: var(--text-primary);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }
  > small {
    grid-column: 1 / -1;
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.58rem;
    line-height: 1.38;
  }
`;

const QualityActionList = styled.div`
  display: grid;
  gap: 6px;

  button {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto 14px;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    min-height: 54px;
    padding: 8px 10px;
    border: 1px solid var(--border-color);
    border-radius: 11px;
    color: var(--text-secondary);
    background: var(--background-default);
    text-align: left;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      color 160ms ease;
  }
  button:hover {
    border-color: color-mix(
      in srgb,
      var(--primary-color) 52%,
      var(--border-color)
    );
    color: var(--text-primary);
    background: color-mix(
      in srgb,
      var(--primary-color) 5%,
      var(--background-default)
    );
  }
  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 32%, transparent);
    outline-offset: 2px;
  }
  button[aria-current="step"] {
    border-color: var(--primary-color);
    background: color-mix(
      in srgb,
      var(--primary-color) 8%,
      var(--background-paper)
    );
  }
  .order {
    display: inline-grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 50%;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    font-size: 0.68rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }
  .copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .copy strong {
    overflow: hidden;
    color: var(--text-primary);
    font-size: 0.67rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .copy small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.59rem;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tone {
    padding: 4px 6px;
    border-radius: 999px;
    font-size: 0.56rem;
    font-weight: 850;
    white-space: nowrap;
  }
  .tone.ready {
    color: var(--success-color);
    background: color-mix(in srgb, var(--success-color) 10%, transparent);
  }
  .tone.progress {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .tone.needs {
    color: var(--error-color);
    background: color-mix(in srgb, var(--error-color) 10%, transparent);
  }
  button > i {
    color: var(--text-muted);
    font-size: 0.65rem;
  }
  > p {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    padding: 10px;
    border-radius: 10px;
    color: var(--success-color);
    background: color-mix(
      in srgb,
      var(--success-color) 7%,
      var(--background-default)
    );
    font-size: 0.65rem;
    line-height: 1.45;
  }
  @media (max-width: 560px) {
    button {
      grid-template-columns: 28px minmax(0, 1fr) auto;
    }
    button > i {
      display: none;
    }
    .copy small {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
    }
  }
`;

const AutomationConsole = styled.section<{
  $status: StoryboardVideoAutomationStatus;
}>`
  display: grid;
  gap: 16px;
  padding: 20px;
  border: 1px solid
    ${({ $status }) =>
      $status === "completed"
        ? "color-mix(in srgb, var(--success-color) 50%, var(--border-color))"
        : $status === "failed"
          ? "color-mix(in srgb, var(--error-color) 48%, var(--border-color))"
          : "color-mix(in srgb, var(--primary-color) 34%, var(--border-color))"};
  border-radius: 18px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 8%, transparent),
      transparent 48%
    ),
    var(--background-paper);
`;

const AutomationSummary = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  min-width: 0;

  > div:first-child {
    min-width: 0;
  }
  > div:first-child > span {
    color: var(--primary-color);
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }
  h4 {
    margin: 5px 0 5px;
    color: var(--text-primary);
    font-size: 1.05rem;
    text-wrap: balance;
  }
  p {
    max-width: 720px;
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.55;
    text-wrap: pretty;
  }

  @media (max-width: 680px) {
    flex-direction: column;
    gap: 10px;
  }
`;

const AutomationMode = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  flex: 0 0 auto;
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 28%, var(--border-color));
  border-radius: 12px;
  color: var(--primary-color);
  background: color-mix(
    in srgb,
    var(--primary-color) 7%,
    var(--background-default)
  );

  > i {
    width: 18px;
    text-align: center;
  }
  > span {
    display: grid;
    gap: 1px;
  }
  strong {
    color: var(--text-primary);
    font-size: 0.7rem;
  }
  span {
    font-size: 0.6rem;
  }
`;

const BudgetGuard = styled.div<{ $blocked: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px auto;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid
    ${({ $blocked }) =>
      $blocked
        ? "color-mix(in srgb, var(--error-color) 45%, var(--border-color))"
        : "var(--border-color)"};
  border-radius: 11px;
  background: color-mix(
    in srgb,
    ${({ $blocked }) =>
        $blocked ? "var(--error-color)" : "var(--background-default)"}
      6%,
    transparent
  );

  label,
  span {
    display: block;
  }
  > div label {
    color: var(--text-primary);
    font-size: 0.68rem;
    font-weight: 800;
  }
  > div span {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 0.61rem;
    line-height: 1.4;
  }
  select {
    min-height: 34px;
    padding: 0 9px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    background: var(--background-paper);
    font-size: 0.68rem;
  }
  > strong {
    color: ${({ $blocked }) =>
      $blocked ? "#fecaca" : "var(--text-secondary)"};
    font-size: 0.66rem;
    white-space: nowrap;
  }
  .unknown-pricing {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: ${({ $blocked }) =>
      $blocked ? "#fecaca" : "var(--text-secondary)"};
    font-size: 0.64rem;
    font-weight: 700;
    cursor: pointer;
  }
  input {
    accent-color: var(--primary-color);
  }
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  @media (max-width: 700px) {
    grid-template-columns: 1fr 120px;
    > strong,
    .unknown-pricing {
      grid-column: 1 / -1;
    }
  }
`;

const AutomationProgress = styled.div`
  display: grid;
  gap: 8px;

  > div:first-child {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  > div:first-child span {
    color: var(--text-secondary);
    font-size: 0.68rem;
    font-weight: 800;
  }
  > div:first-child strong {
    color: var(--text-primary);
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }
  > small {
    color: var(--text-muted);
    font-size: 0.62rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;

const ProgressTrack = styled.div`
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border-color) 74%, transparent);

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      var(--primary-color),
      color-mix(in srgb, var(--success-color) 72%, var(--primary-color))
    );
    transition: width 260ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    span {
      transition: none;
    }
  }
`;

const AutomationFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;

  > p {
    max-width: 620px;
    margin: 0;
    color: var(--text-muted);
    font-size: 0.61rem;
    line-height: 1.45;
  }
  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const AutomationActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;

  @media (max-width: 540px) {
    > * {
      flex: 1 1 100%;
    }
  }
`;

const AutomationActionBase = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 42px;
  padding: 0 15px;
  border-radius: 10px;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 850;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }
`;

const PrimaryAutomationButton = styled(AutomationActionBase)`
  border: 1px solid var(--primary-color);
  color: white;
  background: var(--primary-color);
  &:hover:not(:disabled) {
    background: var(--primary-dark);
  }
`;

const SecondaryAutomationButton = styled(AutomationActionBase)`
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  background: var(--background-paper);
  &:hover:not(:disabled) {
    border-color: var(--primary-color);
    color: var(--text-primary);
  }
`;

const FinalDeliveryCard = styled.section`
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid
    color-mix(in srgb, var(--success-color) 42%, var(--border-color));
  border-radius: 18px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--success-color) 8%, transparent),
      transparent 44%
    ),
    var(--background-paper);
`;

const FinalDeliveryHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  > div {
    min-width: 0;
  }
  > div > span {
    color: var(--success-color);
    font-size: 0.61rem;
    font-weight: 900;
    letter-spacing: 0.11em;
  }
  h4 {
    margin: 4px 0;
    color: var(--text-primary);
    font-size: 0.98rem;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.68rem;
    line-height: 1.5;
  }
  @media (max-width: 620px) {
    flex-direction: column;
    gap: 8px;
  }
`;

const FinalFreshnessNotice = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid
    color-mix(in srgb, var(--warning-color) 38%, var(--border-color));
  border-radius: 10px;
  color: var(--text-secondary);
  background: color-mix(
    in srgb,
    var(--warning-color) 8%,
    var(--background-paper)
  );
  font-size: 0.68rem;
  line-height: 1.5;

  i {
    margin-top: 2px;
    color: var(--warning-color);
  }
  span {
    display: grid;
    gap: 2px;
  }
  strong {
    color: var(--text-primary);
  }
`;

const FinalDownloadButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 0 0 auto;
  min-height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px;
  color: white;
  background: var(--success-color);
  font-size: 0.67rem;
  font-weight: 850;
  cursor: pointer;
  touch-action: manipulation;
  &:hover:not(:disabled) {
    filter: brightness(0.94);
  }
  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--success-color) 34%, transparent);
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.58;
    cursor: wait;
  }
  @media (max-width: 620px) {
    width: 100%;
  }
`;

const FinalDeliveryActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;

  @media (max-width: 620px) {
    width: 100%;
    > * {
      flex: 1 1 100%;
    }
  }
`;

const SecondaryFinalAction = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  color: var(--text-secondary);
  background: var(--background-paper);
  font: inherit;
  font-size: 0.67rem;
  font-weight: 850;
  cursor: pointer;
  &:hover:not(:disabled) {
    border-color: var(--primary-color);
    color: var(--text-primary);
  }
  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }
`;

const FinalDeliveryGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.22fr) minmax(240px, 0.78fr);
  gap: 14px;

  video {
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: #050505;
    object-fit: contain;
  }
  @media (max-width: 800px) {
    grid-template-columns: 1fr;
  }
`;

const FinalCheckList = styled.ul`
  display: grid;
  align-content: start;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    padding: 9px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: color-mix(in srgb, var(--background-default) 88%, transparent);
  }
  li > i {
    margin-top: 2px;
    color: var(--success-color);
    font-size: 0.72rem;
    text-align: center;
  }
  li:nth-child(2) > i,
  li:nth-child(3) > i,
  li:nth-child(4) > i {
    color: var(--primary-color);
  }
  li > span {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  strong {
    color: var(--text-primary);
    font-size: 0.64rem;
  }
  small {
    color: var(--text-muted);
    font-size: 0.59rem;
    line-height: 1.42;
  }
`;

const QualitySelector = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  button {
    min-width: 0;
    min-height: 68px;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    color: var(--text-secondary);
    background: var(--background-default);
    text-align: left;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      color 160ms ease;
  }
  button.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: color-mix(
      in srgb,
      var(--primary-color) 8%,
      var(--background-paper)
    );
  }
  button:hover:not(:disabled) {
    border-color: color-mix(
      in srgb,
      var(--primary-color) 55%,
      var(--border-color)
    );
    color: var(--text-primary);
  }
  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  strong,
  span {
    display: block;
  }
  strong {
    font-size: 0.8rem;
  }
  span {
    margin-top: 5px;
    color: var(--text-muted);
    font-size: 0.68rem;
  }
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--border-color);
  @media (max-width: 540px) {
    grid-template-columns: 1fr;
  }
`;

const Metric = styled.div`
  display: grid;
  align-content: center;
  min-height: 68px;
  padding: 10px 14px;
  background: var(--background-paper);
  span {
    color: var(--text-muted);
    font-size: 0.66rem;
    font-weight: 700;
  }
  strong {
    margin-top: 3px;
    color: var(--text-primary);
    font-size: 1rem;
  }
  strong {
    font-variant-numeric: tabular-nums;
  }
  small {
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 0.62rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 540px) {
    small {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
    }
  }
`;

const AssemblyEditor = styled.section`
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--background-paper);
`;

const AssemblyEditorHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  span {
    color: var(--primary-color);
    font-size: 0.61rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }
  h4 {
    margin: 3px 0 3px;
    color: var(--text-primary);
    font-size: 0.9rem;
  }
  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.66rem;
    line-height: 1.45;
  }
  > strong {
    max-width: 220px;
    color: var(--text-secondary);
    font-size: 0.66rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 560px) {
    flex-direction: column;
    gap: 6px;
  }
`;

const AssemblyEditorGrid = styled.div`
  display: grid;
  grid-template-columns:
    minmax(260px, 1.4fr) repeat(2, minmax(130px, 0.7fr))
    auto;
  align-items: end;
  gap: 10px;

  label {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  label > span {
    color: var(--text-secondary);
    font-size: 0.64rem;
    font-weight: 800;
  }
  label > input:not([type="range"]) {
    min-height: 36px;
    min-width: 0;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    background: var(--background-default);
    font-size: 0.68rem;
  }
  input[type="range"] {
    width: 100%;
    accent-color: var(--primary-color);
  }
  small {
    color: var(--text-muted);
    font-size: 0.6rem;
    font-variant-numeric: tabular-nums;
  }
  input:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .audio-mix-presets {
    grid-column: 1 / -1;
    min-width: 0;
    margin: 0;
    padding: 10px;
    border: 1px solid
      color-mix(in srgb, var(--primary-color) 26%, var(--border-color));
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--primary-color) 4%,
      var(--background-paper)
    );
  }
  .audio-mix-presets legend {
    padding: 0 4px;
    color: var(--text-secondary);
    font-size: 0.65rem;
    font-weight: 900;
  }
  .audio-mix-presets > div {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .audio-mix-presets button {
    display: grid;
    min-width: 0;
    min-height: 50px;
    padding: 8px 9px;
    border-color: var(--border-color);
    color: var(--text-secondary);
    background: var(--background-paper);
    text-align: left;
    white-space: normal;
  }
  .audio-mix-presets button[aria-pressed="true"] {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: color-mix(
      in srgb,
      var(--primary-color) 9%,
      var(--background-paper)
    );
  }
  .audio-mix-presets button strong {
    font-size: 0.66rem;
  }
  .audio-mix-presets button span {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 0.58rem;
    line-height: 1.32;
  }
  .audio-mix-presets p {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 8px 0 0;
    color: var(--text-muted);
    font-size: 0.61rem;
    line-height: 1.42;
  }
  .audio-mix-presets p i {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--primary-color);
  }
  .music-actions {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px 7px;
  }
  .music-file-hint {
    color: var(--text-muted);
    font-size: 0.6rem;
    line-height: 1.4;
  }
  .music-preview {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: auto minmax(220px, 1fr);
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border-color);
    border-radius: 9px;
    background: color-mix(in srgb, var(--background-default) 82%, transparent);
  }
  .music-preview > span {
    color: var(--text-secondary);
    font-size: 0.64rem;
    font-weight: 800;
  }
  .music-preview audio {
    width: 100%;
    min-width: 0;
    height: 34px;
  }
  button {
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid
      color-mix(in srgb, var(--primary-color) 35%, var(--border-color));
    border-radius: 8px;
    color: #d1fae5;
    background: color-mix(
      in srgb,
      var(--primary-color) 11%,
      var(--background-paper)
    );
    font-size: 0.65rem;
    font-weight: 750;
    cursor: pointer;
    white-space: nowrap;
  }
  button i {
    margin-right: 5px;
  }
  button.secondary {
    color: var(--text-muted);
    border-color: var(--border-color);
    background: transparent;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr 1fr;
    .wide {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 560px) {
    grid-template-columns: 1fr;
    .wide {
      grid-column: auto;
    }
    .audio-mix-presets,
    .music-actions {
      grid-column: auto;
    }
    .audio-mix-presets > div {
      grid-template-columns: 1fr;
    }
    .music-preview {
      grid-column: auto;
      grid-template-columns: 1fr;
    }
  }
`;

const TimelineOverview = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(118px, 1fr);
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px 10px;
  scroll-snap-type: x proximity;
`;

const TimelineScene = styled.button<{
  $status: StoryboardVideoSceneStatus;
  $active: boolean;
}>`
  min-width: 0;
  padding: 8px;
  border: 1px solid
    ${({ $status, $active }) =>
      $active
        ? "var(--primary-color)"
        : $status === "approved"
          ? "var(--success-color)"
          : "var(--border-color)"};
  border-radius: 12px;
  background: ${({ $active }) =>
    $active
      ? "color-mix(in srgb, var(--primary-color) 8%, var(--background-paper))"
      : "var(--background-paper)"};
  scroll-snap-align: start;
  text-align: left;
  cursor: pointer;
  &:hover {
    border-color: var(--primary-color);
  }
  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    outline-offset: 2px;
  }
  .thumb {
    position: relative;
    display: grid;
    place-items: center;
    height: 58px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--background-default);
    color: var(--text-muted);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumb span {
    position: absolute;
    top: 5px;
    left: 5px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    color: white;
    background: rgb(0 0 0 / 0.68);
    font-size: 0.62rem;
    font-weight: 800;
  }
  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    margin-top: 7px;
    color: var(--text-primary);
    font-size: 0.68rem;
  }
  small {
    margin-top: 2px;
    color: ${({ $status }) =>
      $status === "approved" ? "var(--success-color)" : "var(--text-muted)"};
    font-size: 0.6rem;
  }
`;

const SceneProductionList = styled.div`
  display: grid;
  gap: 12px;
`;

const SceneProductionRow = styled.article<{
  $status: StoryboardVideoSceneStatus;
}>`
  display: grid;
  grid-template-columns: minmax(220px, 0.78fr) minmax(0, 1.22fr);
  overflow: hidden;
  border: 1px solid
    ${({ $status }) =>
      $status === "approved"
        ? "color-mix(in srgb, var(--success-color) 55%, var(--border-color))"
        : "var(--border-color)"};
  border-radius: 16px;
  background: var(--background-paper);
  content-visibility: auto;
  contain-intrinsic-size: 400px;
  @media (max-width: 840px) {
    grid-template-columns: 1fr;
  }
`;

const SceneMedia = styled.div`
  position: relative;
  min-height: 220px;
  background: #0c111b;
  img,
  video {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 220px;
    max-height: 360px;
    object-fit: cover;
  }
  @media (max-width: 840px) {
    min-height: 0;
    aspect-ratio: 16 / 9;
    img,
    video {
      min-height: 0;
      max-height: none;
    }
  }
`;

const EmptyFrame = styled.div`
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  height: 100%;
  min-height: 220px;
  color: #94a3b8;
  i {
    font-size: 1.5rem;
  }
  span {
    font-size: 0.74rem;
  }
`;

const SceneNumber = styled.span`
  position: absolute;
  top: 12px;
  left: 12px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 28px;
  border: 1px solid rgb(255 255 255 / 0.2);
  border-radius: 9px;
  color: white;
  background: rgb(0 0 0 / 0.64);
  font-size: 0.68rem;
  font-weight: 800;
`;

const SceneBrief = styled.div`
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 18px;
  textarea {
    width: 100%;
    min-height: 108px;
    resize: vertical;
    padding: 12px 13px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-primary);
    background: var(--background-default);
    font: inherit;
    font-size: 0.76rem;
    line-height: 1.55;
  }
  textarea:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
    border-color: var(--primary-color);
  }
  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SceneBriefHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  span {
    color: var(--text-muted);
    font-size: 0.64rem;
    font-weight: 700;
  }
  h4 {
    margin: 3px 0 0;
    color: var(--text-primary);
    font-size: 1rem;
  }
`;

const StatusBadge = styled.span<{ $status: StoryboardVideoSceneStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  color: ${({ $status }) =>
    $status === "approved"
      ? "var(--success-color)"
      : $status === "failed"
        ? "var(--error-color)"
        : "var(--text-secondary)"};
  background: ${({ $status }) =>
    $status === "approved"
      ? "color-mix(in srgb, var(--success-color) 10%, transparent)"
      : $status === "failed"
        ? "color-mix(in srgb, var(--error-color) 10%, transparent)"
        : "var(--background-default)"};
  font-size: 0.65rem !important;
  font-weight: 800 !important;
`;

const SceneQualityBadge = styled.span<{ $tone: SceneQualityReadiness["tone"] }>`
  display: inline-flex;
  width: fit-content;
  margin-top: 6px;
  padding: 3px 7px;
  border-radius: 999px;
  color: ${({ $tone }) =>
    $tone === "ready"
      ? "var(--success-color)"
      : $tone === "progress"
        ? "var(--primary-color)"
        : "var(--error-color)"};
  background: ${({ $tone }) =>
    $tone === "ready"
      ? "color-mix(in srgb, var(--success-color) 10%, transparent)"
      : $tone === "progress"
        ? "color-mix(in srgb, var(--primary-color) 9%, transparent)"
        : "color-mix(in srgb, var(--error-color) 9%, transparent)"};
  font-size: 0.59rem !important;
  font-weight: 800 !important;
`;

const SceneAdvancedDetails = styled.details`
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background-default) 72%, transparent);

  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 10px;
    color: var(--text-secondary);
    cursor: pointer;
    list-style: none;
  }
  > summary::-webkit-details-marker {
    display: none;
  }
  > summary > span {
    flex: 1;
    font-size: 0.64rem;
    font-weight: 850;
  }
  > summary > span i {
    margin-right: 6px;
    color: var(--primary-color);
  }
  > summary > small {
    color: var(--text-muted);
    font-size: 0.58rem;
  }
  > summary > i {
    color: var(--text-muted);
    font-size: 0.6rem;
    transition: transform 150ms ease;
  }
  &[open] > summary {
    border-bottom: 1px solid var(--border-color);
  }
  &[open] > summary > i {
    transform: rotate(180deg);
  }
  > summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 24%, transparent);
    outline-offset: -3px;
  }
  > section,
  > p,
  > details {
    margin: 10px;
  }
`;

const ClipEditor = styled.details`
  padding: 10px 11px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background-default) 72%, transparent);

  > summary {
    min-height: 28px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    cursor: pointer;
    list-style: none;
    font-size: 0.66rem;
    font-weight: 800;
  }
  > summary::-webkit-details-marker {
    display: none;
  }
  > summary > span {
    flex: 1;
  }
  > summary > span i {
    margin-right: 6px;
    color: var(--primary-color);
  }
  > summary > small {
    color: var(--text-muted);
    font-size: 0.59rem;
    font-weight: 500;
  }
  > summary > i {
    transition: transform 150ms ease;
  }
  &[open] > summary {
    margin-bottom: 10px;
  }
  &[open] > summary > i {
    transform: rotate(180deg);
  }
  > summary:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
    border-radius: 5px;
  }
`;

const ClipEditorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(100px, 1fr));
  gap: 8px;

  label {
    position: relative;
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  label > span {
    color: var(--text-muted);
    font-size: 0.59rem;
    font-weight: 750;
  }
  input[type="number"],
  select {
    width: 100%;
    min-height: 34px;
    padding: 0 8px;
    border: 1px solid var(--border-color);
    border-radius: 7px;
    color: var(--text-primary);
    background: var(--background-paper);
    font-size: 0.66rem;
  }
  input[type="range"] {
    width: 100%;
    accent-color: var(--primary-color);
  }
  label > small {
    color: var(--text-muted);
    font-size: 0.58rem;
  }
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 1px;
  }
  input:disabled,
  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const FieldLabel = styled.label`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 800;
  span {
    color: var(--text-muted);
    font-size: 0.62rem;
    font-weight: 500;
  }
`;

const MotionEditorActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: -4px;

  > span {
    min-width: 0;
    color: var(--text-muted);
    font-size: 0.61rem;
    line-height: 1.42;
  }
  > div {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    flex: 0 0 auto;
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 29px;
    padding: 0 8px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-secondary);
    background: var(--background-paper);
    font: inherit;
    font-size: 0.6rem;
    font-weight: 800;
    cursor: pointer;
  }
  button:first-child {
    border-color: color-mix(
      in srgb,
      var(--primary-color) 42%,
      var(--border-color)
    );
    color: var(--primary-color);
  }
  button:hover:not(:disabled) {
    border-color: var(--primary-color);
    color: var(--text-primary);
  }
  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
    outline-offset: 1px;
  }
  button:disabled {
    opacity: 0.52;
    cursor: not-allowed;
  }
  @media (max-width: 680px) {
    align-items: stretch;
    flex-direction: column;
    > div {
      justify-content: stretch;
    }
    button {
      flex: 1 1 auto;
    }
  }
`;

const MotionChangeNotice = styled.p`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: -2px 0 0;
  padding: 9px 10px;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 32%, var(--border-color));
  border-radius: 9px;
  color: var(--text-secondary);
  background: color-mix(
    in srgb,
    var(--primary-color) 6%,
    var(--background-paper)
  );
  font-size: 0.62rem;
  line-height: 1.46;

  > i {
    flex: 0 0 auto;
    margin-top: 2px;
    color: var(--primary-color);
  }
  > span {
    min-width: 0;
  }
  strong {
    color: var(--text-primary);
  }
`;

const SceneControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
`;

const DurationControl = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  label {
    color: var(--text-muted);
    font-size: 0.65rem;
    font-weight: 700;
  }
  select {
    min-height: 34px;
    padding: 0 28px 0 9px;
    border: 1px solid var(--border-color);
    border-radius: 9px;
    color: var(--text-primary);
    background: var(--background-default);
    font-size: 0.7rem;
  }
  select:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
    border-color: var(--primary-color);
  }
`;

const MotionControl = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
  button {
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-radius: 9px;
    color: var(--text-secondary);
    background: var(--background-default);
    font-size: 0.66rem;
    cursor: pointer;
  }
  button.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  }
  button:hover:not(:disabled) {
    border-color: color-mix(
      in srgb,
      var(--primary-color) 55%,
      var(--border-color)
    );
    color: var(--text-primary);
  }
  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
    outline-offset: 1px;
  }
  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const AudioModeSection = styled.section`
  display: grid;
  gap: 9px;
  padding: 11px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: color-mix(in srgb, var(--background-default) 80%, transparent);
`;

const AudioModeHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  > div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  strong {
    color: var(--text-secondary);
    font-size: 0.68rem;
    font-weight: 850;
  }
  small {
    color: var(--text-muted);
    font-size: 0.61rem;
    line-height: 1.45;
  }
  > span {
    flex: 0 0 auto;
    min-height: 24px;
    padding: 4px 8px;
    border-radius: 999px;
    color: var(--primary-color);
    background: color-mix(
      in srgb,
      var(--primary-color) 8%,
      var(--background-paper)
    );
    font-size: 0.59rem;
    font-weight: 800;
  }

  @media (max-width: 540px) {
    flex-direction: column;
    gap: 7px;
  }
`;

const AudioModeSelector = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;

  button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 50px;
    padding: 8px 9px;
    border: 1px solid var(--border-color);
    border-radius: 9px;
    color: var(--text-secondary);
    background: var(--background-paper);
    text-align: left;
    font: inherit;
    cursor: pointer;
  }
  button > i {
    flex: 0 0 auto;
    width: 16px;
    color: var(--text-muted);
    text-align: center;
  }
  button > span {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  button strong,
  button small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button strong {
    color: currentColor;
    font-size: 0.65rem;
  }
  button small {
    color: var(--text-muted);
    font-size: 0.57rem;
  }
  button.active {
    border-color: color-mix(
      in srgb,
      var(--primary-color) 60%,
      var(--border-color)
    );
    color: var(--primary-color);
    background: color-mix(
      in srgb,
      var(--primary-color) 7%,
      var(--background-paper)
    );
  }
  button.active > i {
    color: var(--primary-color);
  }
  button:hover:not(:disabled) {
    border-color: var(--primary-color);
    color: var(--text-primary);
  }
  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
    outline-offset: 1px;
  }
  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @media (max-width: 540px) {
    grid-template-columns: 1fr;
    button strong,
    button small {
      white-space: normal;
    }
  }
`;

const DialogueComposer = styled.div<{
  $tone: StoryboardDialogueTiming["tone"];
}>`
  display: grid;
  gap: 6px;
  padding-top: 9px;
  border-top: 1px solid var(--border-color);

  > label {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: ${({ $tone }) =>
      $tone === "empty" ? "var(--error-color)" : "var(--text-secondary)"};
    font-size: 0.66rem;
    font-weight: 850;
  }
  > label span {
    color: var(--text-muted);
    font-size: 0.58rem;
    font-variant-numeric: tabular-nums;
  }
  > textarea {
    min-height: 70px;
    padding: 10px 11px;
    border-color: ${({ $tone }) =>
      $tone === "empty" || $tone === "over"
        ? "color-mix(in srgb, var(--error-color) 55%, var(--border-color))"
        : "var(--border-color)"};
    background: var(--background-paper);
    font-size: 0.72rem;
  }
  > small {
    color: var(--text-muted);
    font-size: 0.6rem;
    line-height: 1.45;
  }
`;

const DialogueTimingRow = styled.div<{
  $tone: StoryboardDialogueTiming["tone"];
}>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid
    ${({ $tone }) =>
      $tone === "ready"
        ? "color-mix(in srgb, var(--success-color) 34%, var(--border-color))"
        : $tone === "tight"
          ? "color-mix(in srgb, var(--primary-color) 38%, var(--border-color))"
          : "color-mix(in srgb, var(--error-color) 34%, var(--border-color))"};
  border-radius: 9px;
  background: ${({ $tone }) =>
    $tone === "ready"
      ? "color-mix(in srgb, var(--success-color) 6%, var(--background-paper))"
      : $tone === "tight"
        ? "color-mix(in srgb, var(--primary-color) 6%, var(--background-paper))"
        : "color-mix(in srgb, var(--error-color) 6%, var(--background-paper))"};

  > div {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  > div > i {
    flex: 0 0 auto;
    color: ${({ $tone }) =>
      $tone === "ready"
        ? "var(--success-color)"
        : $tone === "tight"
          ? "var(--primary-color)"
          : "var(--error-color)"};
    font-size: 0.72rem;
  }
  > div > span {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  strong {
    color: var(--text-secondary);
    font-size: 0.63rem;
  }
  small {
    color: var(--text-muted);
    font-size: 0.58rem;
    line-height: 1.4;
  }
  > button {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 0 9px;
    border: 1px solid
      color-mix(in srgb, var(--error-color) 38%, var(--border-color));
    border-radius: 8px;
    color: var(--error-color);
    background: var(--background-paper);
    font: inherit;
    font-size: 0.6rem;
    font-weight: 850;
    cursor: pointer;
  }
  > button:hover:not(:disabled) {
    border-color: var(--error-color);
  }
  > button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--error-color) 22%, transparent);
    outline-offset: 1px;
  }
  > button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 540px) {
    align-items: stretch;
    flex-direction: column;
    > button {
      width: 100%;
    }
  }
`;

const DialogueTimingTrack = styled.div<{
  $tone: StoryboardDialogueTiming["tone"];
}>`
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--background-default);

  > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: ${({ $tone }) =>
      $tone === "ready"
        ? "var(--success-color)"
        : $tone === "tight"
          ? "var(--primary-color)"
          : "var(--error-color)"};
  }
`;

const LipSyncHint = styled.p`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 1px 0 0;
  color: var(--text-muted);
  font-size: 0.59rem;
  line-height: 1.5;

  i {
    flex: 0 0 auto;
    margin-top: 2px;
    color: var(--primary-color);
  }
`;

const ReferenceSignal = styled.span<{ $ready: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid
    ${({ $ready }) =>
      $ready
        ? "color-mix(in srgb, var(--primary-color) 34%, var(--border-color))"
        : "var(--border-color)"};
  border-radius: 9px;
  color: ${({ $ready }) =>
    $ready ? "var(--primary-color)" : "var(--text-muted)"};
  background: ${({ $ready }) =>
    $ready
      ? "color-mix(in srgb, var(--primary-color) 6%, var(--background-paper))"
      : "var(--background-default)"};
  font-size: 0.64rem;
  font-weight: 800;
`;

const SceneReferencePicker = styled.section`
  display: grid;
  gap: 8px;
  padding: 10px 11px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background-default) 82%, transparent);
`;

const ReferencePickerHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  > div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  strong {
    color: var(--text-secondary);
    font-size: 0.67rem;
    font-weight: 800;
  }
  small {
    color: var(--text-muted);
    font-size: 0.61rem;
    line-height: 1.45;
  }
`;

const ReferenceResetButton = styled.button`
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  background: var(--background-paper);
  font-size: 0.62rem;
  font-weight: 800;
  cursor: pointer;
  &:hover:not(:disabled) {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }
  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
    outline-offset: 1px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ReferenceChoiceList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: min(100%, 245px);
    min-height: 32px;
    padding: 0 8px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-secondary);
    background: var(--background-paper);
    font: inherit;
    cursor: pointer;
  }
  button.active {
    border-color: color-mix(
      in srgb,
      var(--primary-color) 60%,
      var(--border-color)
    );
    color: var(--primary-color);
    background: color-mix(
      in srgb,
      var(--primary-color) 7%,
      var(--background-paper)
    );
  }
  button:hover:not(:disabled) {
    border-color: var(--primary-color);
    color: var(--text-primary);
  }
  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
    outline-offset: 1px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  i {
    flex: 0 0 auto;
    font-size: 0.62rem;
  }
  span {
    flex: 0 0 auto;
    font-size: 0.61rem;
    font-weight: 800;
  }
  small {
    min-width: 0;
    overflow: hidden;
    color: currentColor;
    font-size: 0.61rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 480px) {
    button {
      max-width: 100%;
    }
  }
`;

const EndFrameToggle = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
  padding: 10px 11px;
  border: 1px solid
    ${({ $active }) =>
      $active
        ? "color-mix(in srgb, var(--primary-color) 45%, var(--border-color))"
        : "var(--border-color)"};
  border-radius: 10px;
  background: ${({ $active }) =>
    $active
      ? "color-mix(in srgb, var(--primary-color) 5%, var(--background-paper))"
      : "var(--background-default)"};
  input {
    flex: 0 0 auto;
    margin-top: 2px;
    accent-color: var(--primary-color);
  }
  label {
    display: grid;
    gap: 3px;
    min-width: 0;
    color: var(--text-secondary);
    font-size: 0.68rem;
    font-weight: 800;
    cursor: pointer;
  }
  input:disabled + label {
    opacity: 0.62;
    cursor: not-allowed;
  }
  &:focus-within {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 22%, transparent);
    outline-offset: 2px;
  }
  small {
    color: var(--text-muted);
    font-size: 0.61rem;
    font-weight: 500;
    line-height: 1.45;
  }
`;

const EndFrameNote = styled.p`
  margin: 0;
  color: var(--text-muted);
  font-size: 0.64rem;
  line-height: 1.45;
`;

const SceneQualityNote = styled.p<{ $tone: SceneQualityReadiness["tone"] }>`
  margin: -3px 0 0;
  color: ${({ $tone }) =>
    $tone === "ready"
      ? "var(--success-color)"
      : $tone === "progress"
        ? "var(--text-secondary)"
        : "var(--error-color)"};
  font-size: 0.64rem;
  line-height: 1.45;
`;

const RenderSignals = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 25px;
    padding: 0 8px;
    border: 1px solid
      color-mix(in srgb, var(--success-color) 32%, var(--border-color));
    border-radius: 999px;
    color: var(--success-color);
    background: color-mix(in srgb, var(--success-color) 7%, transparent);
    font-size: 0.6rem;
    font-weight: 800;
  }
  span:last-child:only-child {
    color: var(--text-secondary);
    border-color: var(--border-color);
    background: var(--background-default);
  }
`;

const SceneError = styled.p`
  margin: 0;
  padding: 9px 11px;
  border-radius: 8px;
  color: var(--error-color);
  background: color-mix(in srgb, var(--error-color) 8%, transparent);
  font-size: 0.68rem;
  line-height: 1.5;
`;

const RecoveryNotice = styled.div<{ $safe: boolean }>`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 12px;
  border: 1px solid
    ${({ $safe }) =>
      $safe
        ? "color-mix(in srgb, var(--success-color) 42%, var(--border-color))"
        : "color-mix(in srgb, var(--error-color) 42%, var(--border-color))"};
  border-radius: 10px;
  color: var(--text-secondary);
  background: ${({ $safe }) =>
    $safe
      ? "color-mix(in srgb, var(--success-color) 8%, var(--background-paper))"
      : "color-mix(in srgb, var(--error-color) 8%, var(--background-paper))"};

  > i {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 8px;
    color: ${({ $safe }) =>
      $safe ? "var(--success-color)" : "var(--error-color)"};
    background: ${({ $safe }) =>
      $safe
        ? "color-mix(in srgb, var(--success-color) 12%, transparent)"
        : "color-mix(in srgb, var(--error-color) 12%, transparent)"};
  }
  > div {
    min-width: 0;
  }
  strong {
    display: block;
    color: var(--text-primary);
    font-size: 0.72rem;
  }
  p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 0.65rem;
    line-height: 1.55;
    text-wrap: pretty;
  }
  details {
    margin-top: 7px;
  }
  summary {
    width: fit-content;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.6rem;
    font-weight: 750;
  }
  summary:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
    border-radius: 3px;
  }
  code {
    display: block;
    margin-top: 6px;
    padding: 7px 8px;
    overflow-wrap: anywhere;
    border-radius: 6px;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--background-default) 82%, transparent);
    font-size: 0.58rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }
`;

const RetryGuide = styled.p`
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: -2px 0 0;
  padding: 9px 11px;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 22%, var(--border-color));
  border-radius: 8px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--primary-color) 5%, transparent);
  font-size: 0.64rem;
  line-height: 1.5;
  i {
    flex: 0 0 auto;
    margin-top: 2px;
    color: var(--primary-color);
  }
  span {
    display: grid;
    gap: 2px;
  }
  strong {
    color: var(--text-primary);
    font-size: inherit;
  }
`;

const SceneActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 14px;
  margin-top: auto;
  > div:last-child {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 7px;
  }
  @media (max-width: 560px) {
    align-items: stretch;
    flex-direction: column;
    > div:last-child {
      justify-content: stretch;
    }
  }
`;

const SceneCost = styled.div`
  display: grid;
  gap: 2px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  span {
    font-size: 0.72rem;
    font-weight: 800;
  }
  small {
    max-width: 320px;
    color: var(--text-muted);
    font-size: 0.6rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
`;

const GenerateButton = styled.button`
  min-height: 38px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  color: white;
  background: var(--primary-color);
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: var(--primary-dark);
  }
  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ReviewButton = styled.button<{ $approved: boolean }>`
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid
    ${({ $approved }) =>
      $approved ? "var(--success-color)" : "var(--border-color)"};
  border-radius: 10px;
  color: ${({ $approved }) =>
    $approved ? "var(--success-color)" : "var(--text-secondary)"};
  background: ${({ $approved }) =>
    $approved
      ? "color-mix(in srgb, var(--success-color) 9%, transparent)"
      : "var(--background-paper)"};
  font-size: 0.7rem;
  font-weight: 800;
  cursor: pointer;
  &:hover:not(:disabled) {
    border-color: ${({ $approved }) =>
      $approved ? "var(--success-color)" : "var(--primary-color)"};
    color: ${({ $approved }) =>
      $approved ? "var(--success-color)" : "var(--text-primary)"};
  }
  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SceneMoreActions = styled.details`
  position: relative;

  > summary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 11px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-secondary);
    background: var(--background-paper);
    list-style: none;
    font-size: 0.68rem;
    font-weight: 800;
    cursor: pointer;
  }
  > summary::-webkit-details-marker {
    display: none;
  }
  > summary:hover {
    border-color: var(--primary-color);
    color: var(--text-primary);
  }
  > summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
    outline-offset: 2px;
  }
  > div {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 7px;
    margin-top: 7px;
  }

  @media (max-width: 560px) {
    width: 100%;
    > summary {
      width: 100%;
    }
    > div > button {
      flex: 1 1 140px;
    }
  }
`;

const DuplicateSceneButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-secondary);
  background: var(--background-paper);
  font-size: 0.7rem;
  font-weight: 800;
  cursor: pointer;
  &:hover:not(:disabled) {
    border-color: var(--primary-color);
    color: var(--text-primary);
  }
  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SceneDownloadButton = styled.button`
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 42%, var(--border-color));
  border-radius: 10px;
  color: var(--text-primary);
  background: color-mix(
    in srgb,
    var(--primary-color) 9%,
    var(--background-paper)
  );
  font-size: 0.7rem;
  font-weight: 800;
  cursor: pointer;
  touch-action: manipulation;
  &:hover:not(:disabled) {
    border-color: var(--primary-color);
    background: color-mix(
      in srgb,
      var(--primary-color) 16%,
      var(--background-paper)
    );
  }
  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }
`;

export {
  ProductionSurface,
  ProductionHeader,
  HeaderLabel,
  AutomaticBadge,
  ProductionJourney,
  JourneyHeader,
  JourneyModeBadge,
  JourneySteps,
  JourneyStep,
  JourneyStepIcon,
  JourneyActionRow,
  JourneyActionBase,
  JourneyPrimaryAction,
  JourneySecondaryAction,
  ControlStrip,
  QualityReadiness,
  QualityMeter,
  ProductionDetails,
  QualityGate,
  QualityGateHeader,
  QualityCheckGrid,
  QualityCheck,
  QualityActionList,
  AutomationConsole,
  AutomationSummary,
  AutomationMode,
  BudgetGuard,
  AutomationProgress,
  ProgressTrack,
  AutomationFooter,
  AutomationActions,
  AutomationActionBase,
  PrimaryAutomationButton,
  SecondaryAutomationButton,
  FinalDeliveryCard,
  FinalDeliveryHeader,
  FinalFreshnessNotice,
  FinalDownloadButton,
  FinalDeliveryActions,
  SecondaryFinalAction,
  FinalDeliveryGrid,
  FinalCheckList,
  QualitySelector,
  MetricsGrid,
  Metric,
  AssemblyEditor,
  AssemblyEditorHeader,
  AssemblyEditorGrid,
  TimelineOverview,
  TimelineScene,
  SceneProductionList,
  SceneProductionRow,
  SceneMedia,
  EmptyFrame,
  SceneNumber,
  SceneBrief,
  SceneBriefHeader,
  StatusBadge,
  SceneQualityBadge,
  SceneAdvancedDetails,
  ClipEditor,
  ClipEditorGrid,
  FieldLabel,
  MotionEditorActions,
  MotionChangeNotice,
  SceneControls,
  DurationControl,
  MotionControl,
  AudioModeSection,
  AudioModeHeader,
  AudioModeSelector,
  DialogueComposer,
  DialogueTimingRow,
  DialogueTimingTrack,
  LipSyncHint,
  ReferenceSignal,
  SceneReferencePicker,
  ReferencePickerHeader,
  ReferenceResetButton,
  ReferenceChoiceList,
  EndFrameToggle,
  EndFrameNote,
  SceneQualityNote,
  RenderSignals,
  SceneError,
  RecoveryNotice,
  RetryGuide,
  SceneActionBar,
  SceneCost,
  GenerateButton,
  ReviewButton,
  SceneMoreActions,
  DuplicateSceneButton,
  SceneDownloadButton,
};
