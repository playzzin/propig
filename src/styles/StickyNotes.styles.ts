
import styled, { css } from 'styled-components';
import { StickyNoteColor } from '@/types/stickyNote';

const stickyNotesFontFamily = "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Helper for gradients
const getGradient = (color: StickyNoteColor) => {
  switch (color) {
    case 'sun': return 'linear-gradient(180deg, #fff6bf, #ffe08a)';
    case 'lime': return 'linear-gradient(180deg, #d7ffb3, #b8ff7a)';
    case 'sky': return 'linear-gradient(180deg, #c8f1ff, #8fd8ff)';
    case 'rose': return 'linear-gradient(180deg, #ffd1dc, #ff9fb2)';
    case 'violet': return 'linear-gradient(180deg, #e5d4ff, #c6a7ff)';
    case 'slate': return 'linear-gradient(180deg, #e9edf2, #cfd6df)';
    default: return '#fff';
  }
};

const getColorDot = (color: string) => {
  switch (color) {
    case 'sun': return '#ffd76a';
    case 'lime': return '#b8ff7a';
    case 'sky': return '#8fd8ff';
    case 'rose': return '#ff9fb2';
    case 'violet': return '#c6a7ff';
    case 'slate': return '#cfd6df';
    default: return '#ddd';
  }
}

export const BoardWrapper = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  overflow: hidden;
  font-family: ${stickyNotesFontFamily};

  body[data-propig-design='codeit'] & {
    background: rgba(255, 255, 255, 0.94);
    border-color: var(--codeit-border);
    border-radius: 8px;
    box-shadow: 0 22px 54px rgba(30, 41, 59, 0.08);
    animation: stickyBoardIn 0.58s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes stickyBoardIn {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  @media (max-width: 720px) {
    border-radius: 14px;
  }
`;

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(0, 0, 0, 0.12);
  overflow-x: auto;
  flex-shrink: 0;

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface-soft);
    border-bottom-color: var(--codeit-border);
  }

  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
  }

  @media (max-width: 720px) {
    min-height: 56px;
    align-items: center;
    gap: 8px;
    padding: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    flex-wrap: nowrap;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

export const Viewport = styled.div`
  flex: 1;
  overflow: auto;
  position: relative;
  background:
    radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.04) 1px, transparent 0) 0 0 / 28px 28px,
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 40%);

  body[data-propig-design='codeit'] & {
    background:
      radial-gradient(circle at 1px 1px, rgba(52, 81, 209, 0.055) 1px, transparent 0) 0 0 / 28px 28px,
      linear-gradient(180deg, rgba(52, 81, 209, 0.035), transparent 42%),
      #ffffff;
  }

  &[data-mobile-board='true'] {
    overflow-x: hidden;
    background:
      radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.035) 1px, transparent 0) 0 0 / 26px 26px,
      linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 38%);
  }
`;

export const Canvas = styled.div<{ width: number; height: number }>`
  position: relative;
  z-index: 1;
  width: ${({ width }) => width}px;
  height: ${({ height }) => height}px;
`;

export const EmptyState = styled.div`
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  pointer-events: none;

  button {
    pointer-events: auto;
  }

  @media (max-width: 720px) {
    justify-content: flex-start;
    padding-top: 104px;
  }
`;

export const NoteContainer = styled.div<{ $color: StickyNoteColor }>`
  position: absolute;
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: ${({ $color }) => getGradient($color)};

  @media (max-width: 720px) {
    border-radius: 14px;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.28);
  }
`;

export const NoteHeader = styled.div`
  height: 44px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(0, 0, 0, 0.15);
  cursor: grab;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
`;

export const NoteBody = styled.textarea`
  flex: 1;
  padding: 12px 12px 10px;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: rgba(0, 0, 0, 0.78);
  font-family: ${stickyNotesFontFamily};
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.35;

  &::placeholder {
    color: rgba(0, 0, 0, 0.42);
  }

  @media (max-width: 720px) {
    padding: 14px;
    font-size: 1rem;
    line-height: 1.45;
  }
`;

export const NoteTitleInput = styled.input`
  flex: 0 0 auto;
  height: 42px;
  margin: 10px 10px 0;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 12px;
  outline: none;
  background: rgba(255, 255, 255, 0.22);
  color: rgba(0, 0, 0, 0.82);
  font-family: ${stickyNotesFontFamily};
  font-size: 1rem;
  font-weight: 900;
  letter-spacing: 0;

  &::placeholder {
    color: rgba(0, 0, 0, 0.38);
  }

  &:focus {
    border-color: rgba(0, 0, 0, 0.28);
    background: rgba(255, 255, 255, 0.32);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08);
  }

  @media (max-width: 720px) {
    height: 44px;
    margin: 10px 10px 0;
    font-size: 1rem;
  }
`;

export const NoteResizer = styled.div`
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.25) 45%, transparent 45%, transparent 100%);
  cursor: nwse-resize;
  touch-action: none;
`;

export const ActionButton = styled.button<{ $active?: boolean; $danger?: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: ${({ $active }) => ($active ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.18)')};
  color: ${({ $danger }) => ($danger ? 'rgba(239, 68, 68, 0.9)' : 'rgba(0, 0, 0, 0.65)')};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.28);
  }
`;

export const ColorDot = styled.button<{ $color: string; $active?: boolean }>`
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: all 0.2s;
  background: ${({ $color }) => getColorDot($color)};
  padding: 0;

  ${({ $active }) =>
    $active &&
    css`
      transform: scale(1.15);
      box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.14);
    `}
`;

export const ActionsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

export const ColorsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;
