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
  width: 100%;
  max-width: 100%;
  flex: 1 1 auto;
  height: 0;
  min-height: 0;
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

  @media (max-width: 820px) {
    overflow-x: hidden;

    && button {
      min-width: 44px;
      min-height: 44px;
    }

    && input:not([type='checkbox']):not([type='radio']):not([type='file']),
    && select {
      min-height: 44px;
      font-size: 16px;
    }

    && input[type='checkbox'],
    && input[type='radio'] {
      min-width: 22px;
      min-height: 22px;
    }

    && textarea {
      min-height: 96px;
      font-size: 16px;
    }

    && input[type='file'] + label,
    && label:has(input[type='checkbox']),
    && label:has(input[type='radio']) {
      min-height: 44px;
    }

    && :where(button, a, input, select, textarea):focus-visible {
      outline: 2px solid var(--studio-accent);
      outline-offset: 2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    && *, && *::before, && *::after {
      scroll-behavior: auto !important;
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
    }
  }
`;

export const Shell = styled.div`
  width: min(1480px, 100%);
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 30px clamp(18px, 3vw, 46px) calc(48px + env(safe-area-inset-bottom));

  @media (max-width: 520px) {
    padding: 20px 12px calc(36px + env(safe-area-inset-bottom));
  }
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

export const Title = styled.h2`
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

export const Workbench = styled.div<{ $single?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $single }) => ($single ? 'minmax(0, 1fr)' : 'minmax(320px, 390px) minmax(0, 1fr)')};
  min-height: 650px;
  overflow: hidden;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.09));
  border-radius: 20px;
  background: rgba(18, 21, 29, 0.86);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(18px);

  @media (max-width: 920px) { grid-template-columns: 1fr; }
`;

export const SecondaryWorkflowHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 20px 0 9px;

  span { display: block; color: #a99aff; font-size: .61rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
  h2 { margin: 3px 0 0; color: var(--text-main, #eef0f7); font-size: .9rem; }
  small { max-width: 520px; color: var(--text-dim, #747c8c); font-size: .64rem; line-height: 1.45; text-align: right; }

  @media (max-width: 620px) { align-items: flex-start; flex-direction: column; small { text-align: left; } }
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

export const QuickModeLabel = styled.div`
  margin: 0 0 16px;
  padding: 9px 10px;
  border: 1px solid rgba(255, 255, 255, .075);
  border-radius: 9px;
  background: rgba(255, 255, 255, .02);

  span, strong, small { display: block; }
  span { color: #a99aff; font-size: .58rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
  strong { margin-top: 2px; color: var(--text-main, #eef0f7); font-size: .78rem; }
  small { margin-top: 3px; color: var(--text-dim, #747c8c); font-size: .61rem; line-height: 1.4; }
`;

export const CreationModeSwitch = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  width: min(100%, 560px);
  margin: 0 0 20px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, .09);
  border-radius: 14px;
  background: rgba(7, 9, 14, .42);
`;

export const CreationModeButton = styled.button<{ $active?: boolean }>`
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 10px 13px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(169, 154, 255, .62)' : 'transparent')};
  border-radius: 10px;
  color: ${({ $active }) => ($active ? '#f2efff' : 'var(--text-muted, #9da4b3)')};
  background: ${({ $active }) => ($active ? 'rgba(124, 92, 255, .2)' : 'transparent')};
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;

  svg { flex: 0 0 auto; color: ${({ $active }) => ($active ? '#c8beff' : '#7c8494')}; }
  span { min-width: 0; }
  strong, small { display: block; }
  strong { color: inherit; font-size: .78rem; line-height: 1.25; }
  small { margin-top: 2px; color: ${({ $active }) => ($active ? '#cfc8f7' : 'var(--text-dim, #747c8c)')}; font-size: .64rem; line-height: 1.35; }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }

  @media (max-width: 520px) {
    min-height: 52px;
    padding: 8px 10px;
    small { display: none; }
  }
`;

export const StudioWorkflow = styled.section`
  display: grid;
  grid-template-columns: minmax(220px, .8fr) minmax(0, 1.35fr);
  align-items: center;
  gap: 18px;
  margin: 0 0 14px;
  padding: 14px;
  border: 1px solid rgba(124, 92, 255, .2);
  border-radius: 13px;
  background: linear-gradient(120deg, rgba(124, 92, 255, .075), rgba(44, 196, 172, .035));

  @media (max-width: 860px) { grid-template-columns: 1fr; }
`;

export const StudioWorkflowIntro = styled.div`
  min-width: 0;
  span, strong { display: block; }
  span { color: #a99aff; font-size: .58rem; font-weight: 850; letter-spacing: .07em; text-transform: uppercase; }
  strong { margin-top: 3px; color: var(--text-main, #eef0f7); font-size: .77rem; }
  p { margin: 4px 0 0; color: var(--text-dim, #747c8c); font-size: .61rem; line-height: 1.5; }
`;

export const StudioWorkflowSteps = styled.ol`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;

export const StudioWorkflowStep = styled.li`
  display: flex;
  min-width: 0;
  min-height: 54px;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 9px;
  background: rgba(255, 255, 255, .025);

  > b { width: 25px; height: 25px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 8px; color: #fff; background: rgba(124, 92, 255, .72); font-size: .65rem; }
  > span { min-width: 0; }
  strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { color: #e7e9f2; font-size: .64rem; }
  small { margin-top: 2px; color: var(--text-dim, #747c8c); font-size: .55rem; }
`;

export const QuickOutputGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 420px) { grid-template-columns: 1fr; }
`;

export const QuickOutputChoice = styled.button<{ $active?: boolean }>`
  min-width: 0;
  min-height: 66px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(169, 154, 255, .62)' : 'rgba(255,255,255,.1)')};
  border-radius: 12px;
  color: ${({ $active }) => ($active ? '#ebe7ff' : 'var(--text-muted, #9da4b3)')};
  background: ${({ $active }) => ($active ? 'rgba(124, 92, 255, .14)' : 'rgba(255,255,255,.018)')};
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease;

  > svg:first-child { flex: 0 0 auto; color: ${({ $active }) => ($active ? '#c8beff' : '#788091')}; }
  > svg:last-child { margin-left: auto; flex: 0 0 auto; color: #b8adff; }
  > span { min-width: 0; }
  strong, small { display: block; }
  strong { color: ${({ $active }) => ($active ? '#f3f0ff' : 'var(--text-main, #eef0f7)')}; font-size: .75rem; line-height: 1.3; }
  small { margin-top: 3px; color: var(--text-dim, #747c8c); font-size: .65rem; line-height: 1.3; }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  &:disabled { cursor: not-allowed; opacity: .52; }
`;

export const QuickMotionControls = styled.div`
  display: grid;
  gap: 13px;
  margin-top: 15px;
`;

export const MotionIntentNotice = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid rgba(96, 165, 250, .28);
  border-radius: 11px;
  color: #dbeafe;
  background: rgba(37, 99, 235, .09);

  > svg { color: #93c5fd; }
  > span { min-width: 0; }
  strong, small { display: block; }
  strong { font-size: .72rem; line-height: 1.35; }
  small { margin-top: 3px; color: #aebbd1; font-size: .64rem; line-height: 1.45; }
  button {
    min-height: 34px;
    padding: 7px 10px;
    border: 1px solid rgba(147, 197, 253, .42);
    border-radius: 8px;
    color: #eff6ff;
    background: rgba(59, 130, 246, .16);
    font-size: .68rem;
    font-weight: 750;
    white-space: nowrap;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: rgba(59, 130, 246, .24); }
  button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
  button:disabled { cursor: not-allowed; opacity: .52; }

  @media (max-width: 520px) {
    grid-template-columns: auto minmax(0, 1fr);
    button { grid-column: 1 / -1; width: 100%; }
  }
`;

export const StaticOutputHint = styled.p`
  margin: 13px 1px 0;
  color: var(--text-dim, #7c8494);
  font-size: .7rem;
  line-height: 1.5;
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

export const BatchPromptMeta = styled.div<{ $overLimit?: boolean }>`
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: -3px 1px 8px;
  color: var(--text-dim, #7c8494);
  font-size: .68rem;

  span { min-width: 0; display: inline-flex; align-items: center; gap: 6px; line-height: 1.4; }
  svg { flex: 0 0 auto; color: #a99aff; }
  strong {
    flex: 0 0 auto;
    padding: 3px 7px;
    border: 1px solid ${({ $overLimit }) => ($overLimit ? 'rgba(251, 113, 133, .42)' : 'rgba(169, 154, 255, .22)')};
    border-radius: 999px;
    color: ${({ $overLimit }) => ($overLimit ? '#fda4af' : '#c8beff')};
    background: ${({ $overLimit }) => ($overLimit ? 'rgba(190, 24, 93, .1)' : 'rgba(124, 92, 255, .08)')};
    font-size: .65rem;
  }

  @media (max-width: 420px) {
    align-items: flex-start;
    span { max-width: 260px; }
  }
`;

export const QuickQuantityField = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 12px;
  margin-top: 11px;

  > label {
    color: var(--text-main, #eef0f7);
    font-size: .74rem;
    font-weight: 760;
  }
  > small {
    grid-column: 1 / -1;
    color: var(--text-dim, #7c8494);
    font-size: .66rem;
    line-height: 1.45;
  }
`;

export const QuickQuantitySelectWrap = styled.div`
  position: relative;

  select {
    min-width: 92px;
    min-height: 36px;
    border: 1px solid rgba(169, 154, 255, .34);
    border-radius: 9px;
    padding: 0 30px 0 11px;
    color: #eeeaff;
    background: rgba(32, 25, 63, .92);
    font: inherit;
    font-size: .75rem;
    font-weight: 760;
    color-scheme: dark;
    cursor: pointer;
  }
  select:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  select:disabled { cursor: not-allowed; opacity: .52; }
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
  &:disabled { cursor: not-allowed; opacity: .58; }
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
  font-size: 0.8rem;
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
  &:disabled { cursor: not-allowed; opacity: .52; }
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
  font-size: 0.8rem;
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

export const MotionPreviewPlaceholder = styled.p`
  max-width: 280px;
  margin: 0;
  padding: 18px;
  color: var(--text-muted, #a5abb7);
  font-size: .78rem;
  line-height: 1.55;
  text-align: center;
`;

export const ResultMotionControls = styled.div`
  width: min(390px, 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px 11px;
  margin-top: 12px;

  button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 11px;
    border: 1px solid rgba(124, 92, 255, .42);
    border-radius: 9px;
    color: #e5e0ff;
    background: rgba(124, 92, 255, .13);
    font-size: .75rem;
    font-weight: 750;
    cursor: pointer;
  }
  button:hover { background: rgba(124, 92, 255, .23); }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  span { max-width: 260px; color: var(--text-dim, #747c8c); font-size: .75rem; line-height: 1.45; }
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

export const FailureDiagnostics = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 14px;
  text-align: left;

  span {
    min-width: 0;
    padding: 8px;
    border: 1px solid rgba(251, 113, 133, .14);
    border-radius: 8px;
    color: #bd8f99;
    background: rgba(255, 255, 255, .025);
    font-size: .63rem;
    line-height: 1.35;
  }
  b { display: block; margin-top: 3px; color: #ffe4e6; font-size: .7rem; overflow-wrap: anywhere; }

  @media (max-width: 420px) { grid-template-columns: 1fr; }
`;

export const FailureGuidance = styled.p`
  margin-top: 10px !important;
  padding: 9px 10px;
  border: 1px solid rgba(96, 165, 250, .22);
  border-radius: 8px;
  color: #bfdbfe !important;
  background: rgba(37, 99, 235, .08);
  text-align: left;
`;

export const ErrorActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
  > button { margin-top: 0; }
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

export const ResultCostSummary = styled.div`
  width: min(390px, 100%);
  display: grid;
  gap: 3px;
  margin-top: 10px;
  padding: 8px 10px;
  box-sizing: border-box;
  border: 1px solid rgba(234, 191, 110, .2);
  border-radius: 9px;
  color: var(--text-muted, #b8bfce);
  background: rgba(245, 158, 11, .045);
  text-align: left;

  strong { color: #e6c985; font-size: .75rem; }
  span, small { overflow-wrap: anywhere; font-size: .75rem; line-height: 1.45; }
  small { color: var(--text-dim, #747c8c); }
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
  font-size: .75rem;
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
  header strong {
    display: grid;
    gap: 2px;
    color: var(--text-main, #eef0f7);
    font-size: .72rem;
  }
  header small {
    color: var(--text-dim, #747c8c);
    font-size: .56rem;
    font-weight: 650;
  }
  header span {
    color: #d8cfff;
    font-size: .72rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  header span[data-tier='premium'] { color: #82e6bf; }
  header span[data-tier='high'] { color: #b7ddff; }
  header span[data-tier='review'] { color: #f2cf83; }
  header span[data-tier='repair'] { color: #f0a3ad; }
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

export const QualityProgress = styled.div`
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255,255,255,.07);

  > span {
    display: block;
    width: 0;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #6d74d8 0%, #8dcbb8 72%, #82e6bf 100%);
    transition: width .35s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    > span { transition: none; }
  }
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
    outline: 2px solid transparent;
  }
  input:focus-visible, select:focus-visible {
    border-color: var(--studio-accent);
    box-shadow: 0 0 0 2px rgba(124,92,255,.11);
  }
  input:disabled, select:disabled { opacity: .46; cursor: not-allowed; }
`;

export const BubbleToggle = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  width: fit-content;
  padding: 0 8px;
  border: 1px solid rgba(124, 92, 255, .25);
  border-radius: 8px;
  background: rgba(124, 92, 255, .07);

  input { width: 14px; height: 14px; margin: 0; accent-color: var(--studio-accent); }
  label { color: var(--text-main, #eef0f7); font-size: .67rem; font-weight: 750; cursor: pointer; }
  &:focus-within { border-color: var(--studio-accent); box-shadow: 0 0 0 2px rgba(124, 92, 255, .12); }
`;

export const BubbleOptionPanel = styled.section`
  display: grid;
  gap: 9px;
  padding: 9px;
  border: 1px solid rgba(124, 92, 255, .2);
  border-radius: 9px;
  background: rgba(124, 92, 255, .045);
`;

export const BubbleDisabledHint = styled.p`
  margin: 0;
  color: var(--text-dim, #747c8c);
  font-size: .63rem;
  line-height: 1.45;
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

  > div { min-width: 0; }
  h2 { display: inline; margin: 0; font-size: .9rem; }
  span { margin-left: 9px; color: var(--text-dim, #747c8c); font-size: .68rem; }
`;

export const HistoryOpenButton = styled.button`
  min-height: 36px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid rgba(124,92,255,.28);
  border-radius: 9px;
  color: #d8d2ff;
  background: rgba(124,92,255,.08);
  font: inherit;
  font-size: .68rem;
  font-weight: 750;
  cursor: pointer;

  &:hover { border-color: rgba(124,92,255,.5); background: rgba(124,92,255,.13); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }

  @media (max-width: 520px) { min-height: 44px; }
`;

export const HistoryRail = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(180px, 220px);
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 12px;
  scrollbar-width: thin;

  @media (max-width: 520px) {
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar { display: none; }
  }
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

export const ProjectToolbar = styled.section`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin: 0 0 12px;
  padding: 13px 16px;
  border: 1px solid var(--border-subtle, rgba(255,255,255,.09));
  border-radius: 14px;
  background: rgba(255,255,255,.025);

  > div:first-child { min-width: 0; }
  span, strong, small { display: block; }
  span { color: #a99aff; font-size: .65rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  strong { overflow: hidden; color: var(--text-main, #fff); font-size: .9rem; text-overflow: ellipsis; white-space: nowrap; }
  small { margin-top: 2px; color: var(--text-dim, #747c8c); font-size: .7rem; }

  @media (max-width: 680px) { align-items: flex-start; flex-direction: column; }
`;

export const ProjectToolbarActions = styled.div`
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px;
    color: var(--text-muted, #b8bfce);
    background: rgba(255,255,255,.035);
    font-size: .72rem;
    font-weight: 700;
    cursor: pointer;
  }
  button:first-child { color: #e5e0ff; border-color: rgba(124,92,255,.45); background: rgba(124,92,255,.13); }
  button:hover:not(:disabled) { border-color: rgba(124,92,255,.55); color: #fff; }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  button:disabled { cursor: wait; opacity: .6; }
`;

export const ProjectQuickSelect = styled.div`
  display: grid;
  grid-template-columns: auto minmax(150px, 240px);
  align-items: center;
  gap: 7px;
  margin-top: 7px;

  label { color: var(--text-dim, #747c8c); font-size: .75rem; font-weight: 700; }
  select {
    width: 100%;
    min-height: 30px;
    padding: 0 7px;
    border: 1px solid rgba(255, 255, 255, .1);
    border-radius: 7px;
    color: var(--text-main, #eef0f7);
    background: rgba(255, 255, 255, .035);
    font: inherit;
    font-size: .75rem;
  }
  option { color: #20232b; background: #fff; }
  select:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

export const ProjectLoadNotice = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: -4px 0 12px;
  padding: 9px 11px;
  border: 1px solid rgba(255, 120, 136, .25);
  border-radius: 10px;
  color: #ffadb5;
  background: rgba(255, 95, 115, .065);
  font-size: .75rem;
  line-height: 1.45;

  button { min-height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: 0 0 auto; padding: 0 9px; border: 1px solid rgba(255, 120, 136, .3); border-radius: 7px; color: #ffd6da; background: rgba(255, 95, 115, .08); font-size: .75rem; cursor: pointer; }
  button:focus-visible { outline: 2px solid #ff8e9e; outline-offset: 2px; }
  @media (max-width: 520px) { align-items: flex-start; flex-direction: column; }
`;

export const ProjectWorkspace = styled.section`
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: grid;
  grid-template-columns: 242px minmax(0, 1fr) 280px;
  min-height: 490px;
  margin: 0 0 18px;
  overflow: hidden;
  border: 1px solid var(--border-subtle, rgba(255,255,255,.09));
  border-radius: 16px;
  background: rgba(18,21,29,.66);

  @media (max-width: 1180px) { grid-template-columns: 222px minmax(0, 1fr); }
  @media (max-width: 760px) { display: block; }
`;

export const MotionAssemblySection = styled.section`
  min-width: 0;
  margin: 0 0 18px;
  overflow: hidden;
  border: 1px solid rgba(89, 211, 184, .2);
  border-radius: 16px;
  background: rgba(18, 21, 29, .76);
`;

export const MotionAssemblyHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, .08);
  background: linear-gradient(105deg, rgba(89, 211, 184, .075), rgba(124, 92, 255, .045));

  > div { min-width: 0; }
  span { display: inline-flex; align-items: center; gap: 6px; color: #70dfc5; font-size: .59rem; font-weight: 850; letter-spacing: .06em; text-transform: uppercase; }
  h2 { margin: 4px 0 0; color: var(--text-main, #eef0f7); font-size: .88rem; line-height: 1.35; }
  p { margin: 4px 0 0; color: var(--text-dim, #747c8c); font-size: .64rem; line-height: 1.45; }

  @media (max-width: 620px) { flex-direction: column; padding: 14px 12px; }
`;

export const MotionAssemblyBadge = styled.strong`
  display: inline-flex;
  min-height: 32px;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid rgba(89, 211, 184, .28);
  border-radius: 999px;
  color: #9ce7d6;
  background: rgba(89, 211, 184, .075);
  font-size: .61rem;
  white-space: nowrap;
`;

export const ProjectSidebar = styled.aside`
  min-width: 0;
  padding: 14px;
  border-right: 1px solid var(--border-subtle, rgba(255,255,255,.09));
  background: rgba(0,0,0,.1);

  @media (max-width: 1180px) { border-right: 1px solid var(--border-subtle, rgba(255,255,255,.09)); }
  @media (max-width: 760px) { border-right: 0; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.09)); }
`;

export const ProjectSection = styled.section`
  padding: 0 0 15px;
  margin: 0 0 15px;
  border-bottom: 1px solid rgba(255,255,255,.065);

  &:last-child { margin-bottom: 0; border-bottom: 0; }
`;

export const ProjectSetupHint = styled.div<{ $ready: boolean }>`
  display: grid;
  gap: 5px;
  margin-bottom: 9px;
  padding: 8px 9px;
  border: 1px solid ${({ $ready }) => $ready ? 'rgba(71, 207, 170, .2)' : 'rgba(234, 191, 110, .25)'};
  border-radius: 8px;
  color: ${({ $ready }) => $ready ? '#a7ddcf' : '#e5cb91'};
  background: ${({ $ready }) => $ready ? 'rgba(16, 185, 129, .04)' : 'rgba(245, 158, 11, .045)'};
  font-size: .75rem;
  line-height: 1.5;

  span { color: var(--text-muted, #aeb6c6); font-size: .75rem; }
`;

export const ProjectDirtyState = styled.p`
  margin: 7px 0 0;
  padding: 7px 8px;
  border: 1px solid rgba(234, 191, 110, .2);
  border-radius: 7px;
  color: #e8cc8f;
  background: rgba(245, 158, 11, .045);
  font-size: .75rem;
  line-height: 1.45;
`;

export const ProjectSectionHeading = styled.h2`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 9px;
  color: var(--text-main, #eef0f7);
  font-size: .78rem;
  font-weight: 800;

  span { color: var(--text-dim, #747c8c); font-size: .75rem; font-variant-numeric: tabular-nums; }
`;

export const ProjectList = styled.div`
  display: grid;
  gap: 5px;
  max-height: 112px;
  overflow-y: auto;
`;

export const ProjectListItem = styled.button<{ $active?: boolean }>`
  min-width: 0;
  padding: 8px;
  border: 1px solid ${({ $active }) => $active ? 'rgba(124,92,255,.52)' : 'transparent'};
  border-radius: 8px;
  color: var(--text-main, #eef0f7);
  background: ${({ $active }) => $active ? 'rgba(124,92,255,.12)' : 'transparent'};
  text-align: left;
  cursor: pointer;

  strong, span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { font-size: .78rem; }
  span { margin-top: 3px; color: var(--text-dim, #747c8c); font-size: .75rem; }
  &:hover { background: rgba(255,255,255,.04); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; }
`;

export const ProjectField = styled.div`
  min-width: 0;
  display: grid;
  gap: 5px;
  margin: 0 0 11px;

  &:last-child { margin-bottom: 0; }
  label, > span { color: var(--text-muted, #aeb6c6); font-size: .75rem; font-weight: 750; }
  small { color: var(--text-dim, #747c8c); font-size: .8rem; line-height: 1.45; }
  input, textarea, select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 7px;
    color: var(--text-main, #eef0f7);
    background: rgba(255,255,255,.035);
    font: inherit;
    font-size: .75rem;
  }
  input, select { min-height: 31px; padding: 0 8px; }
  textarea { min-height: 54px; padding: 7px 8px; resize: vertical; line-height: 1.45; }
  select option { color: #20232b; background: #fff; }
  input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; border-color: transparent; }
`;

export const CompactSegmented = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 7px;

  button {
    min-height: 30px;
    border: 0;
    border-right: 1px solid rgba(255,255,255,.08);
    color: var(--text-dim, #747c8c);
    background: transparent;
    font-size: .75rem;
    cursor: pointer;
  }
  button:last-child { border-right: 0; }
  button:hover { color: #fff; }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: -2px; }
  button[aria-pressed="true"] { color: #eeeaff; background: rgba(124,92,255,.2); }
  button:disabled { cursor: not-allowed; opacity: .52; }
`;

export const ProjectFormatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;

  label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 27px;
    padding: 0 7px;
    border: 1px solid rgba(255, 255, 255, .08);
    border-radius: 7px;
    color: var(--text-muted, #a5abb7);
    background: rgba(255, 255, 255, .02);
    font-size: .75rem;
  }
  input { accent-color: var(--studio-accent); }
  input:disabled { cursor: not-allowed; }
`;

export const ReferenceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 4px;

  input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
  label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid rgba(124,92,255,.36);
    border-radius: 7px;
    color: #dcd5ff;
    background: rgba(124,92,255,.1);
    font-size: .75rem;
    font-weight: 750;
    cursor: pointer;
  }
  label:hover { border-color: rgba(124,92,255,.7); }
  label[aria-disabled='true'] { pointer-events: none; cursor: not-allowed; opacity: .55; }
  input:focus-visible + label { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  span { color: var(--text-dim, #747c8c); font-size: .75rem; font-variant-numeric: tabular-nums; }
`;

export const CurrentSourceNotice = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  margin-top: 8px;
  padding: 9px;
  border: 1px solid rgba(71, 207, 170, .24);
  border-radius: 8px;
  background: rgba(16, 185, 129, .055);

  > div { min-width: 0; }
  strong, span { display: block; overflow-wrap: anywhere; }
  strong { color: #b9eadf; font-size: .75rem; line-height: 1.35; }
  span { margin-top: 3px; color: var(--text-muted, #aeb6c6); font-size: .7rem; line-height: 1.45; }
  button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 9px;
    border: 1px solid rgba(71, 207, 170, .38);
    border-radius: 7px;
    color: #c7f4e9;
    background: rgba(16, 185, 129, .11);
    font-size: .72rem;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
  }
  button:hover { border-color: rgba(71, 207, 170, .72); background: rgba(16, 185, 129, .17); }
  button:disabled { cursor: not-allowed; opacity: .5; }
  button:focus-visible { outline: 2px solid #47cfaa; outline-offset: 2px; }

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
    button { width: 100%; }
  }
`;

export const ReferenceThumbs = styled.div`
  display: flex;
  gap: 5px;
  margin-top: 8px;
  overflow-x: auto;

  img { width: 38px; height: 38px; flex: 0 0 auto; object-fit: cover; border: 1px solid rgba(255,255,255,.12); border-radius: 7px; background: repeating-conic-gradient(#343a48 0 25%, #252a35 0 50%) 50% / 9px 9px; }
`;

export const ProjectEmptyHint = styled.p`
  margin: 8px 0 0;
  color: var(--text-dim, #747c8c);
  font-size: .75rem;
  line-height: 1.5;
`;

export const ProjectItemsArea = styled.section`
  min-width: 0;
  padding: 18px;

  @media (max-width: 520px) { padding: 14px; }
`;

export const ProjectItemsHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 15px;

  span { display: block; color: #a99aff; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  h2 { margin: 4px 0 0; color: var(--text-main, #eef0f7); font-size: .86rem; line-height: 1.35; }
  > div:last-child { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: 285px; }
  small { align-self: center; color: var(--text-dim, #747c8c); font-size: .75rem; line-height: 1.45; text-align: right; }
  button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 30px;
    padding: 0 8px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 7px;
    color: #d9d4ff;
    background: rgba(124,92,255,.1);
    font-size: .75rem;
    font-weight: 750;
    cursor: pointer;
  }
  button:hover:not(:disabled) { border-color: rgba(124,92,255,.55); }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  @media (max-width: 520px) { flex-direction: column; > div:last-child { justify-content: flex-start; max-width: none; } small { text-align: left; } }
`;

export const TemplateComposer = styled.div`
  display: grid;
  gap: 6px;
  width: min(360px, 100%);
  padding: 10px;
  border: 1px solid rgba(124, 92, 255, .24);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(124, 92, 255, .09), rgba(255, 255, 255, .02));

  label { color: #d9d4ff; font-size: .75rem; font-weight: 800; }
  textarea {
    width: 100%;
    min-height: 70px;
    resize: vertical;
    border: 1px solid rgba(255, 255, 255, .12);
    border-radius: 8px;
    padding: 8px;
    color: var(--text-main, #eef0f7);
    background: rgba(7, 9, 14, .52);
    font: inherit;
    font-size: .75rem;
    line-height: 1.45;
    outline: none;
  }
  textarea:focus-visible { border-color: var(--studio-accent); box-shadow: 0 0 0 2px rgba(124, 92, 255, .14); }
  small { color: var(--text-dim, #747c8c); font-size: .75rem; line-height: 1.45; text-align: left; }
`;

export const TemplateActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  button:nth-child(2) {
    color: #a7f3d0;
    border-color: rgba(71, 207, 170, .3);
    background: rgba(16, 185, 129, .08);
  }
`;

export const ProjectViewToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;

  > div { margin-bottom: 0; }
  @media (max-width: 560px) { align-items: stretch; flex-direction: column; }
`;

export const ProjectPreviewMotionButton = styled.button`
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid rgba(124, 92, 255, .35);
  border-radius: 8px;
  color: #ddd7ff;
  background: rgba(124, 92, 255, .09);
  font-size: .75rem;
  font-weight: 750;
  cursor: pointer;

  &[aria-pressed='true'] { color: #d8fff4; border-color: rgba(71, 207, 170, .38); background: rgba(16, 185, 129, .09); }
  &:hover { border-color: rgba(124, 92, 255, .58); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  &:disabled { cursor: not-allowed; opacity: .5; }
`;

export const ProjectPreviewLoadState = styled.p`
  display: flex;
  align-items: center;
  gap: 7px;
  margin: -4px 0 11px;
  color: var(--text-muted, #aeb6c6);
  font-size: .75rem;
  line-height: 1.45;

  &[data-error='true'] { color: #ffadb5; }

  button {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    padding: 0 10px;
    border: 1px solid rgba(255, 173, 181, .32);
    border-radius: 8px;
    color: #ffd5da;
    background: rgba(255, 90, 110, .08);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  button:hover { background: rgba(255, 90, 110, .15); }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }

  @media (max-width: 520px) {
    align-items: flex-start;
    flex-wrap: wrap;
    button { min-height: 44px; margin-left: 0; }
  }
`;

export const ProjectViewTabs = styled.div`
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  margin: 0 0 12px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, .09);
  border-radius: 9px;
  background: rgba(4, 6, 10, .34);

  button {
    min-height: 31px;
    padding: 0 11px;
    border: 0;
    border-radius: 6px;
    color: var(--text-dim, #747c8c);
    background: transparent;
    font-size: .75rem;
    font-weight: 760;
    cursor: pointer;
  }
  button:hover { color: var(--text-main, #eef0f7); }
  button[aria-pressed="true"] { color: #eeeaff; background: rgba(124, 92, 255, .2); }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; }
`;

export const ProjectItemsState = styled.div`
  min-height: 210px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  border: 1px dashed rgba(255, 255, 255, .1);
  border-radius: 10px;
  color: var(--text-muted, #a5abb7);
  font-size: .72rem;
  text-align: center;
`;

export const ProjectItemsGrid = styled.div`
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
  gap: 10px;
  max-height: 540px;
  overflow-y: auto;
  padding: 1px 2px 6px;

  @media (max-width: 760px) { max-height: none; overflow: visible; }
  @media (max-width: 520px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
`;

export const ProjectReorderHint = styled.p`
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  color: var(--text-dim, #747c8c);
  font-size: .75rem;
  line-height: 1.45;
`;

export const ProjectReorderStatus = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
`;

export const ProjectItemCard = styled.article<{
  $active?: boolean;
  $dragging?: boolean;
  $dropTarget?: boolean;
}>`
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${({ $active, $dropTarget }) => (
    $dropTarget ? 'rgba(169,154,255,.95)' : $active ? 'rgba(124,92,255,.65)' : 'rgba(255,255,255,.09)'
  )};
  border-radius: 10px;
  background: ${({ $active }) => $active ? 'rgba(124,92,255,.09)' : 'rgba(255,255,255,.018)'};
  box-shadow: ${({ $active, $dropTarget }) => (
    $dropTarget ? '0 0 0 2px rgba(124,92,255,.2)' : $active ? '0 0 0 1px rgba(124,92,255,.08)' : 'none'
  )};
  opacity: ${({ $dragging }) => $dragging ? .52 : 1};
  transition: border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
  user-select: ${({ $dragging }) => $dragging ? 'none' : 'auto'};
  content-visibility: auto;
  contain-intrinsic-size: 250px;

  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

export const ProjectItemSelect = styled.button`
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px 7px;
  align-items: center;
  padding: 8px;
  border: 0;
  color: var(--text-main, #eef0f7);
  background: transparent;
  text-align: left;
  cursor: pointer;

  > span { grid-row: span 2; color: #a99aff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; font-weight: 800; }
  strong, small { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  strong { font-size: .78rem; line-height: 1.35; }
  small { color: var(--text-dim, #747c8c); font-size: .75rem; line-height: 1.35; }
  &:hover { background: rgba(255,255,255,.03); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: -2px; }
`;

export const ProjectItemPreview = styled.div`
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-top: 1px solid rgba(255,255,255,.06);
  border-bottom: 1px solid rgba(255,255,255,.06);
  color: #6558a2;
  background: repeating-conic-gradient(rgba(255,255,255,.055) 0 25%, transparent 0 50%) 50% / 13px 13px;

`;

export const ProjectItemPreviewButton = styled.button`
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 0;
  border: 0;
  color: #fff;
  background: transparent;
  cursor: zoom-in;

  img, video { width: 100%; height: 100%; object-fit: contain; }
  > svg { position: absolute; right: 6px; bottom: 6px; padding: 3px; border-radius: 5px; background: rgba(8, 10, 15, .72); box-sizing: content-box; }
  &:hover { background: rgba(124,92,255,.08); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: -3px; }
`;

export const ProjectItemPreviewBadge = styled.span`
  position: absolute;
  left: 6px;
  top: 6px;
  max-width: calc(100% - 38px);
  overflow: hidden;
  padding: 3px 5px;
  border-radius: 5px;
  color: #f4f1ff;
  background: rgba(8, 10, 15, .76);
  font-size: .75rem;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
`;

export const ProjectItemFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 7px;

  > span { overflow: hidden; color: var(--text-dim, #747c8c); font-size: .75rem; text-overflow: ellipsis; white-space: nowrap; }
  > span[data-status="completed"] { color: #5ed5b7; }
  > span[data-status="failed"] { color: #ff8f9c; }
  > span[data-status="generating"], > span[data-status="queued"] { color: #eabf6e; }
  button { width: 26px; height: 26px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid rgba(124,92,255,.35); border-radius: 6px; color: #dcd6ff; background: rgba(124,92,255,.11); cursor: pointer; }
  button:hover:not(:disabled) { background: rgba(124,92,255,.25); }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; }
  button:disabled { cursor: wait; opacity: .5; }
`;

export const ProjectInspector = styled.aside`
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 0;
  padding: 16px;
  border-left: 1px solid var(--border-subtle, rgba(255,255,255,.09));
  background: rgba(0,0,0,.12);

  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: -3px; }

  @media (max-width: 1180px) { grid-column: 1 / -1; border-top: 1px solid var(--border-subtle, rgba(255,255,255,.09)); border-left: 0; }
  @media (max-width: 760px) { display: none; }
`;

export const ProjectInspectorHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 12px;

  span { display: block; color: #a99aff; font-size: .62rem; font-weight: 800; letter-spacing: .06em; }
  h2 { margin: 3px 0 0; color: var(--text-main, #eef0f7); font-size: .9rem; }
  button { width: 29px; height: 29px; display: grid; place-items: center; border: 1px solid rgba(255,135,150,.25); border-radius: 7px; color: #ff9aa5; background: rgba(255,95,115,.07); cursor: pointer; }
  button:hover { background: rgba(255,95,115,.15); }
  button:focus-visible { outline: 2px solid #ff8e9e; outline-offset: 2px; }
`;

export const ItemSaveState = styled.span<{ $state: 'idle' | 'saving' | 'saved' | 'error' }>`
  margin-top: 4px;
  color: ${({ $state }) => $state === 'saved'
    ? '#70d8bd'
    : $state === 'error'
      ? '#ff9aa5'
      : $state === 'saving'
        ? '#e7c77f'
        : 'var(--text-dim, #747c8c)'} !important;
  font-size: .59rem !important;
  font-weight: 650 !important;
  letter-spacing: 0 !important;
`;

export const MotionEditor = styled.section`
  display: grid;
  gap: 9px;
  margin: 2px 0 11px;
  padding: 10px;
  border: 1px solid rgba(71, 207, 170, .19);
  border-radius: 9px;
  background: rgba(16, 185, 129, .035);
`;

export const OptionPanelHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;

  > div:first-child { min-width: 0; }
  strong, span { display: block; }
  strong { color: var(--text-main, #eef0f7); font-size: .7rem; }
  span { margin-top: 3px; color: var(--text-dim, #747c8c); font-size: .59rem; line-height: 1.4; }
`;

export const MotionControlSwitch = styled.div`
  display: inline-flex;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 7px;

  button {
    min-height: 28px;
    padding: 0 7px;
    border: 0;
    color: var(--text-dim, #747c8c);
    background: transparent;
    font-size: .59rem;
    cursor: pointer;
  }
  button[aria-pressed="true"] { color: #bff7e9; background: rgba(16, 185, 129, .16); }
  button:focus-visible { outline: 2px solid #47cfaa; outline-offset: -2px; }
`;

export const OptionHint = styled.p`
  margin: 0;
  color: var(--text-dim, #747c8c);
  font-size: .62rem;
  line-height: 1.5;
`;

export const MotionControlGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;

  label, > div {
    min-width: 0;
    display: grid;
    gap: 4px;
    color: var(--text-muted, #aeb6c6);
    font-size: .61rem;
    font-weight: 720;
  }
  input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    min-height: 31px;
    padding: 0 7px;
    border: 1px solid rgba(255, 255, 255, .1);
    border-radius: 7px;
    color: var(--text-main, #eef0f7);
    background: rgba(4, 6, 10, .36);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }
  input:focus-visible { outline: 2px solid #47cfaa; outline-offset: 1px; }
  small { color: var(--text-dim, #747c8c); font-size: .55rem; font-weight: 500; line-height: 1.35; }
`;

export const MotionDuration = styled.div`
  grid-column: 1 / -1;
  grid-template-columns: 1fr auto !important;
  align-items: center;
  padding: 7px 8px;
  border-radius: 7px;
  background: rgba(4, 6, 10, .3);

  strong { color: #a7f3d0; font-size: .75rem; font-variant-numeric: tabular-nums; }
  small { grid-column: 1 / -1; }
`;

export const OptionSaveButton = styled.button`
  min-height: 31px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid rgba(124, 92, 255, .3);
  border-radius: 7px;
  color: #ddd7ff;
  background: rgba(124, 92, 255, .09);
  font-size: .62rem;
  font-weight: 760;
  cursor: pointer;

  &:hover:not(:disabled) { background: rgba(124, 92, 255, .16); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  &:disabled { cursor: wait; opacity: .55; }
`;

export const BubbleTimelinePanel = styled.section`
  display: grid;
  gap: 7px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, .07);

  ${ProjectField} { margin-bottom: 0; }
`;

export const BubbleAppearancePanel = styled.div`
  display: grid;
  gap: 9px;
  padding: 9px;
  border: 1px solid rgba(124, 92, 255, .18);
  border-radius: 8px;
  background: rgba(5, 7, 12, .24);
`;

export const BubbleAppearanceHeader = styled.div`
  display: grid;
  gap: 2px;

  strong { color: var(--text-main, #eef0f7); font-size: .66rem; }
  span { color: var(--text-dim, #747c8c); font-size: .58rem; line-height: 1.4; }
`;

export const BubblePresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  button {
    display: grid;
    min-height: 52px;
    padding: 6px 4px;
    place-items: center;
    border: 1px solid var(--border-soft, #d0d5dd);
    border-radius: 9px;
    background: var(--surface-card, #fff);
    color: var(--text-main, #101828);
    font: inherit;
    font-size: .58rem;
    cursor: pointer;
  }
  button:hover, button:focus-visible { border-color: #4f7cff; outline: 2px solid rgba(79, 124, 255, .18); }
  button:disabled { cursor: not-allowed; opacity: .55; }
  i { display: block; width: 38px; height: 20px; border: 2px solid currentColor; background: var(--preset-fill, #fff); }

  @media (max-width: 540px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

export const BubbleOptionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  label { display: grid; gap: 4px; color: var(--text-muted, #667085); font-size: .58rem; }
  select { width: 100%; min-height: 40px; border: 1px solid var(--border-soft, #d0d5dd); border-radius: 8px; background: var(--surface-card, #fff); color: var(--text-main, #101828); padding: 6px; font: inherit; font-size: .62rem; }
`;

export const BubbleAppearanceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 420px) { grid-template-columns: 1fr; }
`;

export const BubbleColorField = styled.div`
  min-width: 0;
  display: grid;
  gap: 4px;

  > label { color: var(--text-dim, #747c8c); font-size: .57rem; font-weight: 700; }
  > div { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 5px; }
  input[type='color'] {
    width: 34px;
    min-width: 34px;
    height: 31px;
    padding: 2px;
    border: 1px solid rgba(255, 255, 255, .12);
    border-radius: 6px;
    background: #11141b;
    cursor: pointer;
  }
  input[type='text'] {
    width: 100%;
    min-width: 0;
    height: 31px;
    box-sizing: border-box;
    padding: 0 7px;
    border: 1px solid rgba(255, 255, 255, .1);
    border-radius: 6px;
    color: var(--text-main, #eef0f7);
    background: #11141b;
    font: 650 .61rem/1 ui-monospace, SFMono-Regular, Consolas, monospace;
    text-transform: uppercase;
  }
  input:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; }
  input[aria-invalid='true'] { border-color: #ff7888; }
  input:disabled { cursor: not-allowed; opacity: .48; }
  > small { color: #ff9aa5; font-size: .55rem; line-height: 1.35; }

  @media (max-width: 820px) {
    > div { grid-template-columns: 44px minmax(0, 1fr); }
    input[type='color'] { width: 44px; min-width: 44px; height: 44px; }
    input[type='text'] { min-height: 44px; }
  }
`;

export const BubbleRangeField = styled.div`
  min-width: 0;
  display: grid;
  gap: 5px;

  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--text-dim, #747c8c);
    font-size: .57rem;
    font-weight: 700;
  }
  output {
    color: #d7d0ff;
    font-size: .57rem;
    font-variant-numeric: tabular-nums;
  }
  input[type='range'] { width: 100%; min-width: 0; accent-color: var(--studio-accent); }
  input:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  input:disabled { cursor: not-allowed; opacity: .48; }

  @media (max-width: 820px) { input[type='range'] { min-height: 44px; } }
`;

export const BubbleOffsetGrid = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 420px) { grid-template-columns: 1fr; }
  @media (max-width: 820px) { input { min-height: 44px; } }
`;

export const TimelineRangeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
`;

export const BubbleCueList = styled.div`
  display: grid;
  gap: 7px;

  > button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px dashed rgba(124, 92, 255, .35);
    border-radius: 7px;
    color: #d7d0ff;
    background: rgba(124, 92, 255, .05);
    font-size: .61rem;
    cursor: pointer;
  }
  > button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  > button:disabled { cursor: not-allowed; opacity: .45; }
`;

export const BubbleCueRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px 48px 28px;
  gap: 5px;
  align-items: end;
  padding: 7px;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 7px;
  background: rgba(4, 6, 10, .24);

  label { min-width: 0; display: grid; gap: 4px; color: var(--text-dim, #747c8c); font-size: .56rem; }
  input { width: 100%; min-width: 0; height: 29px; box-sizing: border-box; padding: 0 6px; border: 1px solid rgba(255, 255, 255, .1); border-radius: 6px; color: var(--text-main, #eef0f7); background: #11141b; font-size: .62rem; }
  input:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; }
  > button { width: 28px; height: 29px; display: grid; place-items: center; border: 1px solid rgba(255, 120, 136, .2); border-radius: 6px; color: #ff9aa5; background: rgba(255, 95, 115, .06); cursor: pointer; }
  > button:focus-visible { outline: 2px solid #ff8e9e; outline-offset: 1px; }
  > button:disabled { cursor: not-allowed; opacity: .35; }

  @media (max-width: 420px) { grid-template-columns: minmax(0, 1fr) 46px 46px; > button { grid-column: 3; justify-self: end; } }
`;

export const FrameTimeline = styled.section`
  min-width: 0;
  display: grid;
  gap: 12px;
  padding: 13px;
  border: 1px solid rgba(255, 255, 255, .085);
  border-radius: 11px;
  background: rgba(4, 6, 10, .22);
`;

export const TimelineEmpty = styled.div`
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  border: 1px dashed rgba(255, 255, 255, .1);
  border-radius: 11px;
  color: var(--text-dim, #747c8c);
  font-size: .7rem;
  text-align: center;

  strong { color: var(--text-muted, #a5abb7); font-size: .75rem; }
`;

export const TimelineHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  > div:first-child { min-width: 0; }
  span { color: #a99aff; font-size: .6rem; font-weight: 800; letter-spacing: .06em; }
  h3 { margin: 3px 0 0; color: var(--text-main, #eef0f7); font-size: .85rem; }
  p { max-width: 580px; margin: 5px 0 0; color: var(--text-dim, #747c8c); font-size: .63rem; line-height: 1.45; overflow-wrap: anywhere; }

  @media (max-width: 620px) { flex-direction: column; }
`;

export const TimelineStats = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(54px, 1fr));
  flex: 0 0 auto;
  gap: 5px;

  span { display: grid; gap: 1px; padding: 6px 8px; border-radius: 7px; color: var(--text-dim, #747c8c); background: rgba(255, 255, 255, .035); font-size: .55rem; letter-spacing: 0; }
  strong { color: var(--text-main, #eef0f7); font-size: .7rem; font-variant-numeric: tabular-nums; }
`;

export const FrameTrack = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 128px;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding: 2px 2px 10px;
  scrollbar-width: thin;
`;

export const FrameCell = styled.article<{ $state: 'ready' | 'failed' | 'missing' | 'planned' | 'waiting' | 'idle' }>`
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${({ $state }) => $state === 'ready'
    ? 'rgba(71, 207, 170, .35)'
    : $state === 'failed' || $state === 'missing'
      ? 'rgba(255, 120, 136, .32)'
      : $state === 'planned'
        ? 'rgba(124, 92, 255, .34)'
        : 'rgba(255, 255, 255, .08)'};
  border-radius: 9px;
  background: rgba(255, 255, 255, .018);
`;

export const FrameCellHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  padding: 6px 7px;

  strong { color: #b9adff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .63rem; }
  span { overflow: hidden; color: var(--text-dim, #747c8c); font-size: .54rem; text-overflow: ellipsis; white-space: nowrap; }
`;

export const FrameThumb = styled.div`
  position: relative;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-top: 1px solid rgba(255, 255, 255, .06);
  border-bottom: 1px solid rgba(255, 255, 255, .06);
  color: #6558a2;
  background: repeating-conic-gradient(rgba(255,255,255,.055) 0 25%, transparent 0 50%) 50% / 12px 12px;

  img { width: 100%; height: 100%; object-fit: contain; }
`;

export const FrameBubbleMarker = styled.span`
  position: absolute;
  top: 5px;
  right: 5px;
  width: 23px;
  height: 23px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, .28);
  border-radius: 50%;
  color: #191b22;
  background: rgba(255, 255, 255, .9);
  box-shadow: 0 3px 10px rgba(0, 0, 0, .25);
`;

export const FrameCellFooter = styled.div`
  display: grid;
  gap: 4px;
  padding: 7px;

  > span { color: var(--text-dim, #747c8c); font-size: .57rem; font-weight: 760; }
  > span[data-state="ready"] { color: #70d8bd; }
  > span[data-state="failed"], > span[data-state="missing"] { color: #ff9aa5; }
  > span[data-state="planned"] { color: #b9adff; }
  small { min-height: 2.7em; overflow: hidden; color: var(--text-dim, #747c8c); font-size: .52rem; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
`;

export const TimelineLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px 12px;
  color: var(--text-dim, #747c8c);
  font-size: .56rem;

  span { display: inline-flex; align-items: center; gap: 5px; }
  i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255, 255, 255, .18); }
  i[data-state="ready"] { background: #47cfaa; }
  i[data-state="planned"] { background: #8e7af2; }
`;

export const PlatformPolicyNotice = styled.aside`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 12px;
  padding: 11px 13px;
  border: 1px solid rgba(234, 191, 110, .24);
  border-radius: 11px;
  color: #e5c984;
  background: rgba(245, 158, 11, .055);

  > svg { flex: 0 0 auto; margin-top: 1px; }
  div { min-width: 0; }
  strong { display: block; color: #f2d99e; font-size: .7rem; }
  p { margin: 3px 0 0; color: #cdbd9b; font-size: .63rem; line-height: 1.5; overflow-wrap: anywhere; }
  span { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 5px; color: #a99d84; font-size: .59rem; line-height: 1.5; }
  a { color: #e4c77f; text-decoration: underline; text-underline-offset: 2px; }
  a:hover { color: #fff0c7; }
  a:focus-visible { outline: 2px solid #e4c77f; outline-offset: 2px; }
`;

export const InspectorTwoFields = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

export const ItemActionGrid = styled.div`
  display: grid;
  grid-template-columns: 31px 31px minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 6px;
  margin: 3px 0 11px;

  button { min-width: 0; min-height: 31px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 0 7px; border: 1px solid rgba(255,255,255,.1); border-radius: 7px; color: var(--text-muted, #b8bfce); background: rgba(255,255,255,.035); font-size: .62rem; font-weight: 750; cursor: pointer; }
  button:last-child { color: #eeeaff; border-color: rgba(124,92,255,.5); background: rgba(124,92,255,.2); }
  button:hover:not(:disabled) { border-color: rgba(124,92,255,.55); color: #fff; }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; }
  button:disabled { cursor: not-allowed; opacity: .45; }
`;

export const ItemValidation = styled.p`
  margin: 0 0 10px;
  padding: 8px;
  border: 1px solid rgba(255,120,136,.22);
  border-radius: 7px;
  color: #ffadb5;
  background: rgba(255,95,115,.07);
  font-size: .64rem;
  line-height: 1.45;
`;

export const ProjectSpecCheck = styled.p`
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 9px;
  border: 1px solid rgba(89,211,184,.16);
  border-radius: 8px;
  color: #9acdc1;
  background: rgba(58,186,156,.06);
  font-size: .63rem;
  line-height: 1.45;

  svg { flex: 0 0 auto; margin-top: 1px; }
`;

export const ProjectDangerAction = styled.button`
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 0;
  border: 0;
  color: #c67e88;
  background: transparent;
  font-size: .65rem;
  cursor: pointer;

  &:hover { color: #ff9aa5; }
  &:focus-visible { outline: 2px solid #ff8e9e; outline-offset: 3px; }
`;

export const ProjectOnboarding = styled.section`
  display: flex;
  align-items: center;
  gap: 13px;
  margin: 0 0 18px;
  padding: 18px;
  border: 1px dashed rgba(124,92,255,.36);
  border-radius: 15px;
  color: #a99aff;
  background: rgba(124,92,255,.045);

  div { min-width: 0; flex: 1; }
  strong, span { display: block; }
  strong { color: var(--text-main, #eef0f7); font-size: .85rem; }
  span { margin-top: 4px; color: var(--text-dim, #747c8c); font-size: .7rem; line-height: 1.45; }
  button { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 11px; flex: 0 0 auto; border: 1px solid rgba(124,92,255,.45); border-radius: 8px; color: #eeeaff; background: rgba(124,92,255,.18); font-size: .7rem; font-weight: 800; cursor: pointer; }
  button:hover:not(:disabled) { background: rgba(124,92,255,.3); }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  @media (max-width: 520px) { align-items: flex-start; flex-wrap: wrap; button { margin-left: 35px; } }
`;

export const ProjectJsonImport = styled.span`
  position: relative;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px;
    color: var(--text-muted, #b8bfce);
    background: rgba(255,255,255,.035);
    font-size: .72rem;
    font-weight: 700;
    cursor: pointer;
  }
  label:hover { border-color: rgba(124,92,255,.55); color: #fff; }
  input:focus-visible + label { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  input:disabled + label { cursor: not-allowed; opacity: .55; }
`;

export const ItemCountControl = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;

  button {
    min-height: 31px;
    padding: 0 9px;
    border: 1px solid rgba(124,92,255,.35);
    border-radius: 7px;
    color: #ddd7ff;
    background: rgba(124,92,255,.1);
    font-size: .65rem;
    font-weight: 750;
    cursor: pointer;
  }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; }
  button:disabled { cursor: wait; opacity: .55; }
`;

export const CharacterAdvanced = styled.details`
  margin: 2px 0 11px;
  border: 1px solid rgba(124,92,255,.18);
  border-radius: 8px;
  background: rgba(124,92,255,.035);

  summary {
    padding: 9px;
    color: #c9c1f7;
    font-size: .66rem;
    font-weight: 780;
    cursor: pointer;
  }
  summary:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; }
  > div { padding: 2px 9px 9px; }
`;

export const BulkGenerationBar = styled.section`
  display: grid;
  grid-template-columns: auto minmax(150px, 1fr) auto auto auto auto;
  align-items: center;
  gap: 8px 12px;
  margin: 0 0 12px;
  padding: 10px;
  border: 1px solid rgba(234,191,110,.22);
  border-radius: 10px;
  background: rgba(245,158,11,.045);

  label { display: inline-flex; align-items: center; gap: 6px; color: #d8c99f; font-size: .75rem; font-weight: 720; }
  input { accent-color: var(--studio-accent); }
  > span { color: var(--text-dim, #747c8c); font-size: .75rem; }
  select {
    min-height: 29px;
    margin-left: 2px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 7px;
    color: var(--text-main, #eef0f7);
    background: #232630;
    font: inherit;
    font-size: .75rem;
  }
  > button {
    min-height: 31px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid rgba(124,92,255,.48);
    border-radius: 8px;
    color: #eeeaff;
    background: rgba(124,92,255,.2);
    font-size: .75rem;
    font-weight: 800;
    cursor: pointer;
  }
  > button:disabled { cursor: not-allowed; opacity: .5; }
  > button[data-secondary='true'] {
    border-color: rgba(52,211,153,.34);
    color: #b8f5df;
    background: rgba(16,185,129,.12);
  }
  input:focus-visible, select:focus-visible, > button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  small { grid-column: 1 / -1; display: flex; align-items: flex-start; gap: 5px; color: #ad9d77; font-size: .75rem; line-height: 1.45; }
  small svg { flex: 0 0 auto; }

  @media (max-width: 720px) { grid-template-columns: 1fr 1fr; > span, small { grid-column: 1 / -1; } }
  @media (max-width: 460px) { grid-template-columns: 1fr; > span, small { grid-column: auto; } label { justify-content: space-between; } }
`;

export const BatchSummary = styled.p`
  margin: -4px 0 12px;
  padding: 8px 10px;
  border-left: 3px solid #8e7af2;
  border-radius: 6px;
  color: #c5bddf;
  background: rgba(124,92,255,.07);
  font-size: .63rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
`;

export const BatchProgressPanel = styled.section`
  display: grid;
  gap: 9px;
  margin: -4px 0 12px;
  padding: 11px 12px;
  border: 1px solid rgba(142,122,242,.25);
  border-radius: 9px;
  background: linear-gradient(135deg, rgba(124,92,255,.09), rgba(24,27,35,.55));

  > header, > footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  > header div { min-width: 0; }
  > header strong, > header span { display: block; }
  > header strong { color: var(--text-main, #eef0f7); font-size: .78rem; }
  > header span { margin-top: 2px; color: var(--text-dim, #858d9d); font-size: .75rem; }
  > header b { flex: 0 0 auto; padding: 4px 7px; border-radius: 999px; color: #d8d0ff; background: rgba(124,92,255,.16); font-size: .75rem; }
  > header b[data-status='completed'] { color: #a9e8ca; background: rgba(54,179,126,.14); }
  > header b[data-status='partial'], > header b[data-status='failed'] { color: #ffc2b8; background: rgba(231,91,76,.14); }
  > header b[data-status='deferred'] { color: #f2d18c; background: rgba(207,153,52,.14); }
  > header b[data-status='cancelled'] { color: #c1c7d2; background: rgba(148,163,184,.13); }

  progress { width: 100%; height: 7px; overflow: hidden; border: 0; border-radius: 999px; color: var(--studio-accent); background: rgba(255,255,255,.07); }
  progress::-webkit-progress-bar { border-radius: inherit; background: rgba(255,255,255,.07); }
  progress::-webkit-progress-value { border-radius: inherit; background: linear-gradient(90deg, #7662e8, #9a87ff); }
  progress::-moz-progress-bar { border-radius: inherit; background: linear-gradient(90deg, #7662e8, #9a87ff); }
  > p { margin: 0; color: #b9b0d3; font-size: .75rem; line-height: 1.45; }
  > footer { justify-content: flex-end; }
  > footer button { min-height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 0 9px; border: 1px solid rgba(142,122,242,.32); border-radius: 7px; color: #ded8ff; background: rgba(124,92,255,.1); font-size: .75rem; font-weight: 760; cursor: pointer; }
  > footer button[data-danger='true'] { border-color: rgba(231,91,76,.28); color: #ffb8ae; background: rgba(231,91,76,.08); }
  > footer button:disabled { cursor: wait; opacity: .5; }
  > footer button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }

  @media (max-width: 460px) {
    > header { align-items: flex-start; }
    > footer { display: grid; grid-template-columns: 1fr; }
    > footer button { width: 100%; }
  }
`;

export const BatchMetrics = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
  span { min-width: 0; padding: 6px 4px; border-radius: 6px; color: var(--text-dim, #858d9d); background: rgba(255,255,255,.035); text-align: center; font-size: .75rem; }
  b { display: block; margin-bottom: 1px; color: var(--text-main, #eef0f7); font-size: .78rem; }
  span[data-tone='success'] b { color: #8fe0b8; }
  span[data-tone='working'] b { color: #b9abff; }
  span[data-tone='deferred'] b { color: #e6c474; }
  span[data-tone='danger'] b { color: #ff9f92; }
  span[data-tone='muted'] b { color: #aeb6c4; }
`;

export const ProjectItemSelection = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px 0;

  input { width: 14px; height: 14px; margin: 0; accent-color: var(--studio-accent); }
  label { color: var(--text-dim, #747c8c); font-size: .75rem; cursor: pointer; }
  input:disabled + label { cursor: not-allowed; opacity: .65; }
  input:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }

  @media (max-width: 760px) {
    min-height: 44px;
    padding: 8px;
    input { width: 22px; height: 22px; }
    label { align-self: stretch; display: inline-flex; align-items: center; }
  }
`;

export const ProjectItemDragHandle = styled.span`
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  margin-left: -4px;
  border-radius: 6px;
  color: #8d82c3;
  cursor: grab;

  &:hover { color: #d8d1ff; background: rgba(124,92,255,.13); }
  &:active { cursor: grabbing; }
  &[draggable='false'] { opacity: .38; cursor: not-allowed; }

  @media (max-width: 760px) {
    width: 32px;
    height: 32px;
  }
`;

export const FrameRepairButton = styled.button`
  min-height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 5px;
  border: 1px solid rgba(124,92,255,.3);
  border-radius: 6px;
  color: #cfc7ff;
  background: rgba(124,92,255,.08);
  font-size: .52rem;
  font-weight: 740;
  cursor: pointer;

  &:hover:not(:disabled) { background: rgba(124,92,255,.18); }
  &:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 1px; }
  &:disabled { cursor: wait; opacity: .55; }
`;

export const CancelJobButton = styled.button`
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  padding: 0 9px;
  border: 1px solid rgba(255,120,136,.3);
  border-radius: 7px;
  color: #ffabb4;
  background: rgba(255,95,115,.07);
  font-size: .62rem;
  font-weight: 750;
  cursor: pointer;

  &:hover:not(:disabled) { background: rgba(255,95,115,.15); }
  &:focus-visible { outline: 2px solid #ff8e9e; outline-offset: 2px; }
  &:disabled { cursor: wait; opacity: .55; }
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

export const ImageEditPanel = styled.details`
  border: 1px solid rgba(71, 207, 170, .2);
  border-radius: 11px;
  background: rgba(16, 185, 129, .035);

  > summary {
    min-height: 39px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 9px;
    padding: 0 10px;
    color: #b9eadf;
    cursor: pointer;
  }
  > summary span { display: inline-flex; align-items: center; gap: 6px; font-size: .7rem; font-weight: 800; }
  > summary small { color: #78ae9f; font-size: .56rem; }
  > summary:focus-visible { outline: 2px solid #47cfaa; outline-offset: 2px; }
`;

export const ImageEditBody = styled.div`
  display: grid;
  gap: 10px;
  padding: 0 10px 10px;
`;

export const ImageEditPreview = styled.div`
  position: relative;
  width: min(100%, 248px);
  aspect-ratio: 1;
  justify-self: center;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px;
  background: repeating-conic-gradient(rgba(255,255,255,.065) 0 25%, rgba(0,0,0,.025) 0 50%) 50% / 16px 16px;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transform-origin: center;
    transition: transform 120ms ease, clip-path 120ms ease;
  }
  > span {
    position: absolute;
    right: 7px;
    bottom: 7px;
    padding: 4px 6px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 999px;
    color: #cce7df;
    background: rgba(15,20,24,.82);
    font-size: .53rem;
    font-weight: 740;
  }

  @media (prefers-reduced-motion: reduce) { img { transition: none; } }
`;

export const ImageEditQuickActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;

  button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0 6px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 7px;
    color: var(--text-muted, #b8bfce);
    background: rgba(255,255,255,.03);
    font-size: .58rem;
    font-weight: 730;
    cursor: pointer;
  }
  button[aria-pressed="true"] { color: #d5fff5; border-color: rgba(71,207,170,.42); background: rgba(16,185,129,.12); }
  button:hover { border-color: rgba(71,207,170,.38); color: #fff; }
  button:focus-visible { outline: 2px solid #47cfaa; outline-offset: 1px; }
`;

export const ImageEditControlGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 10px;

  label { min-width: 0; display: grid; gap: 4px; color: var(--text-dim, #747c8c); font-size: .57rem; }
  label > span { display: flex; justify-content: space-between; gap: 6px; }
  output { color: #a9ddcf; font-variant-numeric: tabular-nums; }
  input { width: 100%; margin: 0; accent-color: #47cfaa; }
  input:focus-visible { outline: 2px solid #47cfaa; outline-offset: 2px; }

  @media (max-width: 420px) { grid-template-columns: 1fr; }
`;

export const ImageCropGroup = styled.section`
  display: grid;
  gap: 7px;
  padding: 8px;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 8px;
  background: rgba(255,255,255,.018);

  header { display: flex; justify-content: space-between; gap: 8px; }
  header strong { color: var(--text-muted, #b8bfce); font-size: .61rem; }
  header span { color: var(--text-dim, #747c8c); font-size: .53rem; }
  > div { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 10px; }
  label { min-width: 0; display: grid; gap: 3px; color: var(--text-dim, #747c8c); font-size: .54rem; }
  label > span { display: flex; justify-content: space-between; }
  output { color: #a9ddcf; font-variant-numeric: tabular-nums; }
  input { width: 100%; margin: 0; accent-color: #47cfaa; }
  input:focus-visible { outline: 2px solid #47cfaa; outline-offset: 2px; }
`;

export const ImageEditHistory = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  > span { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; color: #91bdb1; font-size: .57rem; }
  > div { display: flex; gap: 4px; overflow-x: auto; padding: 2px; }
  button { min-width: 29px; min-height: 25px; border: 1px solid rgba(71,207,170,.2); border-radius: 6px; color: #a9ddcf; background: rgba(16,185,129,.05); font-size: .54rem; cursor: pointer; }
  button:hover { background: rgba(16,185,129,.13); }
  button:focus-visible { outline: 2px solid #47cfaa; outline-offset: 1px; }
`;

export const ImageEditNotice = styled.p`
  margin: 0;
  color: #83a79e;
  font-size: .57rem;
  line-height: 1.5;
`;
