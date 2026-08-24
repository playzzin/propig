'use client';

import styled, { css, keyframes } from 'styled-components';

export const StudioRoot = styled.div`
  --studio-ink: #171a20;
  --studio-muted: #626b79;
  --studio-subtle: #8b94a3;
  --studio-line: #dde1e7;
  --studio-line-strong: #c9ced7;
  --studio-blue: #3155c6;
  --studio-blue-soft: #eef2ff;
  --studio-green: #13795b;
  --studio-surface: #ffffff;
  --studio-canvas: #f6f6f3;
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--studio-canvas);
  color: var(--studio-ink);
`;

export const TopBar = styled.header`
  position: sticky;
  z-index: 30;
  top: 0;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
  align-items: center;
  min-height: 62px;
  padding: 10px clamp(16px, 3vw, 40px);
  border-bottom: 1px solid var(--studio-line);
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(12px);

  @media (max-width: 760px) {
    grid-template-columns: 1fr auto;
    min-height: 58px;
    padding: 8px 14px;
  }

  @media (max-width: 560px) {
    row-gap: 8px;
  }
`;

export const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  > span {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 10px;
    background: var(--studio-ink);
    color: #fff;
  }

  strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
  small { display: block; margin-top: 2px; color: var(--studio-muted); font-size: 12px; }
`;

export const StageStatus = styled.small<{ $tone?: 'default' | 'working' | 'danger' | 'success' }>`
  color: ${({ $tone }) => (
    $tone === 'danger' ? '#b42318' : $tone === 'success' ? '#067647' : $tone === 'working' ? '#1849a9' : 'var(--studio-muted)'
  )} !important;
  font-weight: ${({ $tone }) => ($tone && $tone !== 'default' ? 750 : 500)};
`;

export const StepNav = styled.ol`
  display: flex;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 8px;
    border-radius: 8px;
    color: #98a2b3;
    font-size: 12px;
    font-weight: 700;
  }

  li[data-active='true'] { background: var(--studio-blue-soft); color: var(--studio-blue); }
  li[data-complete='true'] { color: var(--studio-green); }

  @media (max-width: 760px) {
    display: none;
  }
`;

export const MobileProgress = styled.div`
  display: none;

  @media (max-width: 760px) {
    display: block;
    grid-column: 1 / -1;
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: #eaecf0;

    > span {
      display: block;
      width: var(--step-progress);
      height: 100%;
      border-radius: inherit;
      background: var(--studio-blue);
      transition: width 180ms ease;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    > span { transition: none; }
  }
`;

export const TopActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 6px;

  @media (max-width: 560px) {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 1fr) 44px 44px;
    width: 100%;

    &[data-preview-actions] {
      display: flex;
      grid-column: 1 / -1;
      width: 100%;
      justify-content: flex-start;
      overflow-x: auto;
      scrollbar-width: thin;

      > button { min-width: 72px; flex: 0 0 auto; }
    }
  }
`;

export const ProjectSelect = styled.select`
  width: min(190px, 100%);
  min-width: 0;
  min-height: 44px;
  padding: 5px 9px;
  border: 1px solid var(--studio-line-strong);
  border-radius: 9px;
  background: #fff;
  color: #344054;
  font: inherit;
  font-size: 12px;
  cursor: pointer;

  &:focus-visible {
    border-color: var(--studio-blue);
    outline: 3px solid rgba(41, 82, 204, 0.18);
    outline-offset: 1px;
  }

  @media (max-width: 560px) {
    width: 100%;
  }
`;

export const Workspace = styled.div`
  width: min(1040px, calc(100% - 32px));
  margin: 0 auto;
  padding: 30px 0 64px;

  @media (max-width: 600px) {
    width: 100%;
    padding: 18px 12px calc(28px + env(safe-area-inset-bottom));
  }
`;

export const Intro = styled.div`
  max-width: 720px;
  margin: 0 auto 24px;
  text-align: center;

  span { color: var(--studio-blue); font-size: 12px; font-weight: 800; }
  h1 { margin: 8px 0 10px; font-size: clamp(25px, 4vw, 38px); line-height: 1.16; letter-spacing: -0.035em; }
  p { margin: 0; color: var(--studio-muted); font-size: 15px; line-height: 1.65; }
`;

export const Card = styled.section<{ $compact?: boolean }>`
  display: grid;
  gap: 18px;
  padding: ${({ $compact }) => ($compact ? '18px' : 'clamp(20px, 4vw, 34px)')};
  border: 1px solid var(--studio-line);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(16, 24, 40, 0.055);
`;

export const SectionTitle = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  h2 { margin: 0; font-size: 18px; letter-spacing: -0.02em; }
  p { margin: 5px 0 0; color: var(--studio-muted); font-size: 13px; line-height: 1.55; }
`;

export const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' | 'quiet' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: var(--studio-blue);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  touch-action: manipulation;

  ${({ $variant }) => $variant === 'secondary' && css`
    border-color: var(--studio-line);
    background: #fff;
    color: #344054;
  `}
  ${({ $variant }) => $variant === 'danger' && css`
    border-color: #fecdca;
    background: #fff;
    color: #b42318;
  `}
  ${({ $variant }) => $variant === 'quiet' && css`
    min-height: 44px;
    padding: 5px 9px;
    background: transparent;
    color: #475467;
  `}

  &:hover:not(:disabled) { filter: brightness(0.96); }
  &:focus-visible { outline: 3px solid rgba(41, 82, 204, 0.24); outline-offset: 2px; }
  &:disabled { cursor: not-allowed; opacity: 0.45; }

  @media (pointer: coarse) { min-height: 44px; }
`;

export const Field = styled.label`
  display: grid;
  gap: 6px;
  color: #344054;
  font-size: 12px;
  font-weight: 750;

  input, textarea, select {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid #cfd5de;
    border-radius: 11px;
    background: #fff;
    color: var(--studio-ink);
    font: inherit;
    font-weight: 500;
  }

  textarea { min-height: 112px; resize: vertical; line-height: 1.58; }
  input:focus-visible, textarea:focus-visible, select:focus-visible {
    border-color: var(--studio-blue);
    outline: 3px solid rgba(41, 82, 204, 0.14);
  }
  small { color: var(--studio-muted); font-weight: 500; line-height: 1.5; }
`;

export const Split = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.7fr);
  gap: 18px;

  @media (max-width: 820px) { grid-template-columns: 1fr; }
`;

export const Inline = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
`;

export const Segments = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  padding: 4px;
  border-radius: 12px;
  background: #f2f4f7;

  button {
    min-height: 44px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: #667085;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }
  button[aria-pressed='true'] { background: #fff; color: var(--studio-blue); box-shadow: 0 2px 8px rgba(16, 24, 40, 0.08); }
  button:focus-visible { outline: 3px solid rgba(41, 82, 204, 0.2); }
  button:disabled { cursor: not-allowed; opacity: 0.45; }
`;

export const Notice = styled.div<{ $tone?: 'info' | 'success' | 'warning' | 'danger' }>`
  display: flex;
  gap: 9px;
  padding: 12px 13px;
  border: 1px solid ${({ $tone }) => (
    $tone === 'danger' ? '#fecdca' : $tone === 'warning' ? '#fedf89' : $tone === 'success' ? '#abefc6' : '#b2ccff'
  )};
  border-radius: 12px;
  background: ${({ $tone }) => (
    $tone === 'danger' ? '#fff6f5' : $tone === 'warning' ? '#fffaeb' : $tone === 'success' ? '#ecfdf3' : '#f5f8ff'
  )};
  color: ${({ $tone }) => (
    $tone === 'danger' ? '#912018' : $tone === 'warning' ? '#93370d' : $tone === 'success' ? '#067647' : '#1849a9'
  )};
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;

  svg { flex: 0 0 auto; margin-top: 1px; }
  > span { min-width: 0; }
`;

const spin = keyframes`to { transform: rotate(360deg); }`;
export const Spinner = styled.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;
