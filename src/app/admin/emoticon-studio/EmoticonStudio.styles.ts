'use client';

import styled, { css, keyframes } from 'styled-components';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const breathe = keyframes`
  0%, 100% { transform: scale(1); opacity: .68; }
  50% { transform: scale(1.04); opacity: 1; }
`;

export const Page = styled.main`
  --studio-accent: #7c5cff;
  --studio-accent-soft: rgba(124, 92, 255, 0.13);
  min-height: 100%;
  overflow: auto;
  color: var(--text-main, #eef0f7);
  background:
    radial-gradient(circle at 8% 0%, rgba(124, 92, 255, 0.12), transparent 28rem),
    radial-gradient(circle at 92% 10%, rgba(44, 196, 172, 0.07), transparent 24rem),
    var(--bg-base, #0d0f14);

  button, label {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
`;

export const Shell = styled.div`
  width: min(1480px, 100%);
  margin: 0 auto;
  padding: 30px clamp(18px, 3vw, 46px) calc(48px + env(safe-area-inset-bottom));
`;

export const Header = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
`;

export const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #a99aff;
  font-size: 0.77rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
`;

export const Title = styled.h1`
  margin: 0;
  color: var(--text-main, #fff);
  font-size: clamp(1.55rem, 2.5vw, 2.25rem);
  line-height: 1.12;
  letter-spacing: -0.035em;
  text-wrap: balance;
`;

export const Subtitle = styled.p`
  max-width: 610px;
  margin: 8px 0 0;
  color: var(--text-muted, #9da4b3);
  font-size: 0.92rem;
  line-height: 1.55;
`;

export const HeaderNote = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted, #9da4b3);
  font-size: 0.78rem;

  svg { color: #58d2b8; }
  @media (max-width: 760px) { display: none; }
`;

export const Workbench = styled.div`
  display: grid;
  grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
  min-height: 650px;
  overflow: hidden;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.09));
  border-radius: 20px;
  background: rgba(18, 21, 29, 0.86);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(18px);

  @media (max-width: 920px) { grid-template-columns: 1fr; }
`;

export const InputPanel = styled.section`
  min-width: 0;
  padding: 24px;
  border-right: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.09));
  background: rgba(255, 255, 255, 0.018);

  @media (max-width: 920px) {
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.09));
  }
  @media (max-width: 520px) { padding: 18px; }
`;

export const SectionNumber = styled.span`
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 7px;
  color: #d9d2ff;
  background: var(--studio-accent-soft);
  font-size: 0.7rem;
  font-weight: 800;
`;

export const FieldHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 11px;

  label, span:not(${SectionNumber}) {
    color: var(--text-main, #eef0f7);
    font-size: 0.84rem;
    font-weight: 750;
  }
`;

export const DropZone = styled.label<{ $dragging?: boolean; $hasImage?: boolean }>`
  position: relative;
  min-height: 174px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px dashed ${({ $dragging }) => ($dragging ? '#a99aff' : 'rgba(255, 255, 255, 0.17)')};
  border-radius: 14px;
  background: ${({ $dragging }) => ($dragging ? 'rgba(124, 92, 255, 0.13)' : 'rgba(255, 255, 255, 0.025)')};
  cursor: pointer;
  user-select: ${({ $dragging }) => ($dragging ? 'none' : 'auto')};
  transition: border-color 160ms ease, background-color 160ms ease;

  &:hover {
    border-color: rgba(169, 154, 255, 0.68);
    background: rgba(124, 92, 255, 0.07);
  }
  &:focus-within {
    outline: 2px solid var(--studio-accent);
    outline-offset: 3px;
  }
  ${({ $hasImage }) => $hasImage && css`
    border-style: solid;
    background:
      linear-gradient(45deg, rgba(255,255,255,.045) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.045) 75%),
      linear-gradient(45deg, rgba(255,255,255,.045) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.045) 75%);
    background-position: 0 0, 9px 9px;
    background-size: 18px 18px;
  `}
`;

export const HiddenInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
`;

export const DropPrompt = styled.div`
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 22px;
  text-align: center;
  color: var(--text-muted, #9da4b3);

  svg { color: #a99aff; }
  strong { color: var(--text-main, #eef0f7); font-size: 0.9rem; }
  span { font-size: 0.73rem; }
`;

export const SourcePreview = styled.img`
  width: 100%;
  height: 174px;
  display: block;
  object-fit: contain;
`;

export const ReplaceHint = styled.span`
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 6px 9px;
  border-radius: 8px;
  color: #fff;
  background: rgba(9, 11, 16, 0.8);
  font-size: 0.7rem;
  font-weight: 700;
  backdrop-filter: blur(8px);
`;

export const FieldGroup = styled.div`
  margin-top: 22px;
`;

export const PromptBox = styled.textarea`
  width: 100%;
  min-height: 108px;
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 13px;
  padding: 14px 15px;
  color: var(--text-main, #eef0f7);
  background: rgba(7, 9, 14, 0.42);
  font: inherit;
  font-size: 0.9rem;
  line-height: 1.55;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;

  &::placeholder { color: var(--text-dim, #697081); }
  &:focus-visible {
    border-color: var(--studio-accent);
    box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.12);
  }
`;

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
`;

export const Chip = styled.button`
  min-height: 36px;
  padding: 5px 10px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 999px;
  color: var(--text-muted, #aab0bc);
  background: rgba(255, 255, 255, 0.035);
  font-size: 0.72rem;
  cursor: pointer;

  &:hover {
    color: #ddd7ff;
    border-color: rgba(124, 92, 255, 0.42);
    background: rgba(124, 92, 255, 0.1);
  }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
`;

export const Advanced = styled.details`
  margin-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  padding-top: 15px;

  &[open] summary svg:last-child { transform: rotate(180deg); }
`;

export const AdvancedSummary = styled.summary`
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted, #9da4b3);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  list-style: none;

  &::-webkit-details-marker { display: none; }
  svg:last-child { margin-left: auto; transition: transform 160ms ease; }
  &:focus-visible {
    outline: 2px solid var(--studio-accent);
    outline-offset: 4px;
    border-radius: 4px;
  }
`;

export const AdvancedBody = styled.div`
  display: grid;
  gap: 16px;
  padding-top: 16px;
`;

export const OptionLabel = styled.div`
  margin-bottom: 8px;
  color: var(--text-dim, #7c8494);
  font-size: 0.7rem;
  font-weight: 700;
`;

export const Segmented = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  padding: 4px;
  border-radius: 11px;
  background: rgba(7, 9, 14, 0.48);
`;

export const MotionHint = styled.p`
  margin: 8px 2px 0;
  color: var(--text-dim, #7c8494);
  font-size: 0.7rem;
  line-height: 1.45;
`;

export const Segment = styled.button<{ $active?: boolean }>`
  min-height: 34px;
  border: 0;
  border-radius: 8px;
  color: ${({ $active }) => ($active ? '#fff' : 'var(--text-muted, #9da4b3)')};
  background: ${({ $active }) => ($active ? 'rgba(124, 92, 255, .78)' : 'transparent')};
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;

  &:focus-visible { outline: 2px solid #c4b9ff; outline-offset: 1px; }
`;

export const FormatGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
`;

export const FormatOption = styled.label<{ $active?: boolean }>`
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(124, 92, 255, .65)' : 'rgba(255,255,255,.09)')};
  border-radius: 9px;
  color: ${({ $active }) => ($active ? '#ddd7ff' : 'var(--text-muted, #9da4b3)')};
  background: ${({ $active }) => ($active ? 'rgba(124, 92, 255, .1)' : 'transparent')};
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;

  input { accent-color: var(--studio-accent); }
  &:focus-within { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
`;

export const CreateButton = styled.button`
  width: 100%;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 20px;
  border: 0;
  border-radius: 13px;
  color: white;
  background: linear-gradient(135deg, #8769ff, #6545ef);
  box-shadow: 0 10px 28px rgba(94, 64, 226, 0.28);
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  transition: transform 150ms ease, filter 150ms ease, opacity 150ms ease;

  &:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.06); }
  &:focus-visible { outline: 3px solid rgba(169, 154, 255, .55); outline-offset: 3px; }
  &:disabled { cursor: not-allowed; opacity: .48; box-shadow: none; }
`;

export const CostNote = styled.p`
  margin: 9px 4px 0;
  color: var(--text-muted, #9299a8);
  text-align: center;
  font-size: 0.7rem;
  line-height: 1.45;
`;

export const InlineError = styled.p`
  margin: 10px 2px 0;
  color: #fda4af;
  font-size: .72rem;
  line-height: 1.45;
`;

export const ResultPanel = styled.section`
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

export const ResultToolbar = styled.div`
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 0 22px;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.09));
`;

export const ResultStatus = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;

  > div { min-width: 0; }
  strong {
    display: block;
    overflow: hidden;
    color: var(--text-main, #eef0f7);
    font-size: 0.82rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  span {
    display: block;
    overflow: hidden;
    color: var(--text-dim, #747c8c);
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const StatusDot = styled.span<{ $state?: 'idle' | 'working' | 'done' | 'failed' }>`
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: ${({ $state }) => (
    $state === 'done' ? '#47cfaa'
      : $state === 'failed' ? '#fb7185'
        : $state === 'working' ? '#a994ff'
          : '#596171'
  )};
  box-shadow: 0 0 0 4px ${({ $state }) => (
    $state === 'done' ? 'rgba(71,207,170,.1)'
      : $state === 'failed' ? 'rgba(251,113,133,.1)'
        : $state === 'working' ? 'rgba(169,148,255,.1)'
          : 'transparent'
  )};
`;

export const QualityBadge = styled.span<{ $tone?: 'good' | 'warning' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 9px;
  border-radius: 8px;
  color: ${({ $tone }) => (
    $tone === 'danger' ? '#fecdd3' : $tone === 'warning' ? '#fde68a' : '#a7f3d0'
  )};
  background: ${({ $tone }) => (
    $tone === 'danger'
      ? 'rgba(244, 63, 94, 0.1)'
      : $tone === 'warning'
        ? 'rgba(245, 158, 11, 0.09)'
        : 'rgba(16, 185, 129, 0.09)'
  )};
  font-size: 0.7rem;
  font-weight: 750;
`;

export const ResultBody = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(235px, 300px);

  @media (max-width: 1180px) { grid-template-columns: 1fr; }
`;

export const PreviewColumn = styled.div`
  min-width: 0;
  min-height: 520px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(24px, 4vw, 48px);

  @media (max-width: 520px) { min-height: 410px; padding: 24px 18px; }
`;

export const Checkerboard = styled.div`
  width: min(390px, 100%);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 20px;
  background-color: #20232b;
  background-image:
    linear-gradient(45deg, #272b35 25%, transparent 25%),
    linear-gradient(-45deg, #272b35 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #272b35 75%),
    linear-gradient(-45deg, transparent 75%, #272b35 75%);
  background-size: 24px 24px;
  background-position: 0 0, 0 12px, 12px -12px, -12px 0;
  box-shadow: 0 22px 55px rgba(0, 0, 0, .25);

  img, video { width: 100%; height: 100%; object-fit: contain; }
`;

export const EmptyPreview = styled.div`
  width: min(390px, 100%);
  display: grid;
  justify-items: center;
  gap: 13px;
  color: var(--text-dim, #747c8c);
  text-align: center;

  svg {
    width: 52px;
    height: 52px;
    padding: 13px;
    border-radius: 16px;
    color: #8f7bea;
    background: rgba(124, 92, 255, .09);
  }
  strong { color: var(--text-muted, #a5abb7); font-size: .94rem; }
  p { max-width: 330px; margin: 0; font-size: .78rem; line-height: 1.6; }
`;

export const ProgressWrap = styled.div`
  width: min(410px, 100%);
  display: grid;
  justify-items: center;
  gap: 18px;
  text-align: center;
`;

export const WorkingOrb = styled.div`
  width: 80px;
  height: 80px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(124, 92, 255, .2);
  border-radius: 25px;
  color: #b8aaff;
  background: radial-gradient(circle, rgba(124, 92, 255, .19), rgba(124, 92, 255, .04));
  animation: ${breathe} 2.2s ease-in-out infinite;

  svg { width: 32px; height: 32px; }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

export const ProgressText = styled.div`
  strong { display: block; margin-bottom: 6px; color: var(--text-main, #eef0f7); font-size: 1rem; }
  span { color: var(--text-muted, #9da4b3); font-size: .78rem; }
`;

export const ProgressTrack = styled.div`
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(255,255,255,.07);
`;

export const ProgressFill = styled.div<{ $progress: number }>`
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6d4ff2, #a58fff);
  transform: scaleX(${({ $progress }) => Math.max(0.02, Math.min(1, $progress / 100))});
  transform-origin: left center;
  transition: transform 400ms ease;

  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

export const ErrorPreview = styled.div`
  width: min(420px, 100%);
  padding: 22px;
  border: 1px solid rgba(251, 113, 133, .2);
  border-radius: 15px;
  color: #fecdd3;
  background: rgba(190, 24, 93, .07);
  text-align: center;

  strong { display: block; margin-bottom: 8px; }
  p { margin: 0; color: #e4a7b1; font-size: .78rem; line-height: 1.55; }
`;

export const ErrorAction = styled.button`
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 14px;
  padding: 7px 12px;
  border: 1px solid rgba(251, 113, 133, .34);
  border-radius: 9px;
  color: #ffe4e6;
  background: rgba(251, 113, 133, .1);
  font-size: .72rem;
  font-weight: 750;
  cursor: pointer;

  &:hover:not(:disabled) { background: rgba(251, 113, 133, .17); }
  &:focus-visible { outline: 2px solid #fb7185; outline-offset: 2px; }
  &:disabled { opacity: .5; cursor: not-allowed; }
`;

export const OutputActions = styled.div`
  width: min(390px, 100%);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 18px;
`;

export const OutputButton = styled.button`
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 11px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 9px;
  color: var(--text-main, #eef0f7);
  background: rgba(255,255,255,.045);
  font-size: .72rem;
  font-weight: 700;
  cursor: pointer;

  &:hover { border-color: rgba(124,92,255,.5); background: rgba(124,92,255,.09); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
`;

export const SpecLine = styled.p`
  margin: 10px 0 0;
  color: var(--text-dim, #747c8c);
  font-size: .68rem;
  text-align: center;
`;

export const Inspector = styled.aside`
  min-width: 0;
  padding: 20px;
  border-left: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.09));
  background: rgba(8, 10, 15, .22);
  overflow: auto;

  @media (max-width: 1180px) {
    border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.09));
    border-left: 0;
  }
`;

export const InspectorTitle = styled.h2`
  margin: 0 0 5px;
  color: var(--text-main, #eef0f7);
  font-size: .84rem;
`;

export const InspectorDesc = styled.p`
  margin: 0 0 15px;
  color: var(--text-dim, #747c8c);
  font-size: .7rem;
  line-height: 1.5;
`;

export const QualityPanel = styled.section`
  display: grid;
  gap: 9px;
  margin-bottom: 14px;
  padding: 11px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px;
  background: rgba(255,255,255,.022);

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  header strong { color: var(--text-main, #eef0f7); font-size: .72rem; }
  header span {
    color: #c9beff;
    font-size: .72rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  ul {
    display: grid;
    gap: 4px;
    margin: 0;
    padding-left: 16px;
    color: #d7b7bf;
    font-size: .63rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  p { margin: 0; color: #9edcc9; font-size: .63rem; line-height: 1.45; }
`;

export const QualityMetrics = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;

  span {
    display: grid;
    gap: 2px;
    padding: 6px;
    border-radius: 7px;
    color: var(--text-dim, #747c8c);
    background: rgba(7,9,14,.38);
    font-size: .57rem;
  }
  strong {
    color: var(--text-muted, #a5abb7);
    font-size: .68rem;
    font-variant-numeric: tabular-nums;
  }
`;

export const PresetList = styled.div`
  display: grid;
  gap: 7px;
`;

export const PresetButton = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 10px;
  align-items: center;
  padding: 10px 11px;
  border: 1px solid rgba(255,255,255,.075);
  border-radius: 10px;
  color: var(--text-main, #eef0f7);
  background: rgba(255,255,255,.025);
  text-align: left;
  cursor: pointer;

  strong { font-size: .76rem; }
  span {
    grid-column: 1;
    overflow: hidden;
    color: var(--text-dim, #747c8c);
    font-size: .66rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  svg { grid-column: 2; grid-row: 1 / span 2; color: #917df4; }
  &:hover { border-color: rgba(124,92,255,.4); background: rgba(124,92,255,.07); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  &:disabled { opacity: .45; cursor: not-allowed; }
`;

export const BatchButton = styled.button`
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 11px;
  border: 1px solid rgba(124,92,255,.32);
  border-radius: 10px;
  color: #c9beff;
  background: rgba(124,92,255,.08);
  font-size: .72rem;
  font-weight: 750;
  cursor: pointer;

  &:hover:not(:disabled) { background: rgba(124,92,255,.14); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  &:disabled { opacity: .45; cursor: not-allowed; }
`;

export const BubbleEditor = styled.details`
  margin-top: 13px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px;
  background: rgba(255,255,255,.018);

  > summary {
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    color: var(--text-muted, #a5abb7);
    font-size: .72rem;
    font-weight: 750;
    cursor: pointer;
    list-style: none;
  }
  > summary::-webkit-details-marker { display: none; }
  > summary svg { margin-left: auto; transition: transform 160ms ease; }
  &[open] > summary svg { transform: rotate(180deg); }
  > summary:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
`;

export const BubbleEditorBody = styled.div`
  display: grid;
  gap: 10px;
  padding: 2px 10px 11px;

  label {
    display: grid;
    gap: 5px;
    color: var(--text-dim, #7c8494);
    font-size: .64rem;
    font-weight: 700;
  }
  input, select {
    width: 100%;
    min-width: 0;
    height: 34px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px;
    padding: 0 9px;
    color: var(--text-main, #eef0f7);
    background: #11141b;
    font: inherit;
    font-size: .7rem;
    outline: none;
  }
  input:focus-visible, select:focus-visible {
    border-color: var(--studio-accent);
    box-shadow: 0 0 0 2px rgba(124,92,255,.11);
  }
`;

export const BubbleFieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  label:last-child { grid-column: 1 / -1; }
`;

export const RerenderButton = styled.button`
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(71, 207, 170, .25);
  border-radius: 9px;
  color: #a7f3d0;
  background: rgba(16, 185, 129, .07);
  font-size: .7rem;
  font-weight: 750;
  cursor: pointer;

  &:hover:not(:disabled) { background: rgba(16, 185, 129, .12); }
  &:focus-visible { outline: 2px solid #47cfaa; outline-offset: 2px; }
  &:disabled { opacity: .5; cursor: not-allowed; }
`;

export const ReuseNotice = styled.p`
  margin: 12px 0 0;
  padding: 9px 10px;
  border-radius: 9px;
  color: #a7f3d0;
  background: rgba(16,185,129,.06);
  font-size: .64rem;
  line-height: 1.5;
`;

export const FallbackNotice = styled.p`
  margin: 14px 0 0;
  padding: 9px 10px;
  border-radius: 9px;
  color: #f7d99b;
  background: rgba(245,158,11,.07);
  font-size: .66rem;
  line-height: 1.5;
`;

export const History = styled.section`
  margin-top: 22px;
`;

export const HistoryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;

  h2 { margin: 0; font-size: .9rem; }
  span { color: var(--text-dim, #747c8c); font-size: .7rem; }
`;

export const HistoryRail = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(180px, 220px);
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 12px;
  scrollbar-width: thin;
`;

export const HistoryItem = styled.button<{ $active?: boolean }>`
  min-width: 0;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 8px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(124,92,255,.55)' : 'rgba(255,255,255,.075)')};
  border-radius: 11px;
  color: var(--text-main, #eef0f7);
  background: ${({ $active }) => ($active ? 'rgba(124,92,255,.08)' : 'rgba(255,255,255,.025)')};
  text-align: left;
  cursor: pointer;

  &:hover { border-color: rgba(124,92,255,.35); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
`;

export const HistoryThumb = styled.div`
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 9px;
  background: rgba(255,255,255,.04);

  img { width: 100%; height: 100%; object-fit: contain; }
  svg { color: #7f6bd9; }
`;

export const HistoryMeta = styled.div`
  min-width: 0;

  strong, span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { font-size: .73rem; }
  span { margin-top: 5px; color: var(--text-dim, #747c8c); font-size: .64rem; }
`;

export const CenterMessage = styled.div`
  min-height: 420px;
  display: grid;
  place-items: center;
  padding: 30px;
  color: var(--text-muted, #9da4b3);
  text-align: center;

  a { color: #aa9aff; }
`;

export const InlineSpinner = styled.span`
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,.28);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ${spin} .8s linear infinite;

  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
