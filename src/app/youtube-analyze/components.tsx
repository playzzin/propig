'use client';

import styled, { css, keyframes } from 'styled-components';

// --- Global Layout & Theme ---

export const MagazineWrapper = styled.div<{ $lockScroll?: boolean }>`
  width: 100%;
  height: 100%;
  overflow-y: ${({ $lockScroll }) => ($lockScroll ? 'hidden' : 'auto')};
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  background-color: #0F0F12;
  color: #E2E8F0;
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --primary: #F43F5E;
  --accent: #38BDF8;
  --text-main: #E2E8F0;
  --text-muted: #94A3B8;
  --card-bg: #18181B;
  --border: rgba(255, 255, 255, 0.08);

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
`;

export const Container = styled.div`
  width: 100%;
  padding: 0 32px 60px;

  @media (max-width: 768px) {
    padding: 0 16px 32px;
  }
`;

// --- Header ---

export const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 28px;

  @media (max-width: 768px) {
    flex-wrap: wrap;
    align-items: flex-start;
    margin-bottom: 20px;
    padding: 16px 0;
  }
`;

export const Logo = styled.h1`
  font-size: 1.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #fff 0%, #94A3B8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0;
  margin: 0;
  text-wrap: balance;
`;

export const NavActions = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 768px) {
    width: 100%;
  }

  @media (max-width: 520px) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;

    > * {
      width: 100%;
    }
  }
`;

export const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }>`
  height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.85rem;
  transition:
    background-color 0.2s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.2s cubic-bezier(0.2, 0, 0, 1),
    color 0.2s cubic-bezier(0.2, 0, 0, 1),
    box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1),
    transform 0.2s cubic-bezier(0.2, 0, 0, 1),
    opacity 0.2s cubic-bezier(0.2, 0, 0, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  min-width: 0;
  text-align: center;
  white-space: nowrap;
  touch-action: manipulation;

  ${({ $variant }) =>
    $variant === 'primary' &&
    css`
      background: #fff;
      color: #000;
      border: 1px solid #fff;
      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
      }
    `}

  ${({ $variant }) =>
    ($variant === 'secondary' || !$variant) &&
    css`
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.1);
      &:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
      }
    `}

  ${({ $variant }) =>
    $variant === 'ghost' &&
    css`
      background: transparent;
      color: var(--text-muted);
      border: 1px solid transparent;
      &:hover:not(:disabled) {
        color: #fff;
        background: rgba(255, 255, 255, 0.05);
      }
    `}

  ${({ $variant }) =>
    $variant === 'danger' &&
    css`
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.2);
      &:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.2);
        border-color: rgba(239, 68, 68, 0.4);
      }
    `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid rgba(56, 189, 248, 0.95);
    outline-offset: 3px;
    box-shadow: 0 0 0 5px rgba(56, 189, 248, 0.18);
  }

  i {
    flex: 0 0 auto;
  }

  @media (max-width: 520px) {
    height: 42px;
    padding: 10px 14px;
    font-size: 0.8rem;
    white-space: nowrap;
    line-height: 1.25;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover:not(:disabled) {
      transform: none;
    }
  }
`;

// --- Category Filter Bar ---

export const CategoryBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0 20px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }

  @media (max-width: 768px) {
    padding: 8px 0 18px;
  }
`;

export const CategoryPill = styled.button<{ $active?: boolean }>`
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  touch-action: manipulation;
  border: 1px solid ${p => p.$active ? 'var(--primary)' : 'rgba(255,255,255,0.1)'};
  background: ${p => p.$active ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255,255,255,0.04)'};
  color: ${p => p.$active ? 'var(--primary)' : 'var(--text-muted)'};

  &:hover {
    border-color: ${p => p.$active ? 'var(--primary)' : 'rgba(255,255,255,0.2)'};
    background: ${p => p.$active ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255,255,255,0.08)'};
  }

  &:focus-visible {
    outline: 2px solid rgba(56, 189, 248, 0.95);
    outline-offset: 3px;
  }
`;

export const CategoryPillDelete = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  font-size: 0.6rem;
  color: var(--text-muted);
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
  touch-action: manipulation;

  &:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.35);
    color: #ef4444;
  }

  &:focus-visible {
    outline: 2px solid rgba(56, 189, 248, 0.95);
    outline-offset: 2px;
  }
`;

export const AddCategoryPill = styled.button`
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px dashed rgba(255,255,255,0.15);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background-color 0.2s ease;
  touch-action: manipulation;

  &:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid rgba(56, 189, 248, 0.95);
    outline-offset: 3px;
  }
`;

// --- Hero Section ---

export const HeroSection = styled.section`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  margin-bottom: 48px;
  align-items: center;
  min-width: 0;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  @media (max-width: 768px) {
    margin-bottom: 32px;
  }
`;

export const HeroContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;

  @media (max-width: 768px) {
    gap: 16px;
  }
`;

export const HeroLabel = styled.span`
  color: var(--primary);
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0;
`;

export const HeroTitle = styled.h2`
  font-size: 2.8rem;
  line-height: 1.1;
  font-weight: 900;
  letter-spacing: 0;
  color: #fff;
  margin: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  text-wrap: balance;

  @media (max-width: 768px) {
    font-size: 2rem;
  }

  @media (max-width: 520px) {
    font-size: 1.75rem;
  }
`;

export const HeroDescription = styled.p`
  font-size: 1rem;
  color: var(--text-muted);
  line-height: 1.6;
  max-width: 90%;
  margin: 0;
  overflow-wrap: anywhere;
  word-break: keep-all;

  @media (max-width: 768px) {
    max-width: 100%;
  }
`;

export const HeroVisual = styled.div`
  position: relative;
  aspect-ratio: 16/9;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.8);
  border: 1px solid var(--border);
  min-width: 0;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    pointer-events: none;
  }
`;

export const EmptyArchiveVisual = styled.div`
  width: 100%;
  height: 100%;
  min-height: 250px;
  padding: 28px;
  display: grid;
  align-content: center;
  gap: 18px;
  background:
    linear-gradient(135deg, rgba(244, 63, 94, 0.12), transparent 38%),
    linear-gradient(315deg, rgba(56, 189, 248, 0.12), transparent 42%),
    #18181B;

  @media (max-width: 520px) {
    min-height: 210px;
    padding: 22px;
  }
`;

export const EmptyArchiveIcon = styled.div`
  width: 54px;
  height: 54px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
`;

export const EmptyArchiveTitle = styled.h3`
  margin: 0;
  color: #fff;
  font-size: 1.35rem;
  line-height: 1.25;
  letter-spacing: 0;
`;

export const EmptyArchiveText = styled.p`
  margin: 0;
  color: var(--text-muted);
  line-height: 1.6;
  word-break: keep-all;
`;

export const EmptyArchiveSteps = styled.div`
  display: grid;
  gap: 8px;
`;

export const EmptyArchiveStep = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: #CBD5E1;
  font-size: 0.9rem;

  span:first-child {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    color: #fff;
    background: rgba(244, 63, 94, 0.18);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    flex: 0 0 auto;
  }

  span:last-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;

export const HeroImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s cubic-bezier(0.2, 0, 0, 1);

  &:hover {
    transform: scale(1.03);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

// --- Grid Section ---

export const GridSection = styled.section`
  margin-bottom: 60px;

  @media (max-width: 768px) {
    margin-bottom: 32px;
  }
`;

export const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
`;

export const SectionTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0;
  letter-spacing: 0;
  color: #fff;
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 16px;
  }
`;

export const Card = styled.article<{ $active?: boolean }>`
  background: var(--card-bg);
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(244, 63, 94, 0.6)' : 'var(--border)')};
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease,
    transform 0.25s ease;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  height: 100%;
  outline: none;
  box-shadow: ${({ $active }) => ($active ? '0 0 0 3px rgba(244, 63, 94, 0.12)' : 'none')};

  &:hover,
  &:focus-visible {
    transform: translateY(-3px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
    border-color: rgba(255, 255, 255, 0.15);
  }

  &:focus-visible {
    outline: 2px solid rgba(56, 189, 248, 0.95);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover,
    &:focus-visible {
      transform: none;
    }
  }
`;

export const CardImageWrapper = styled.div`
  aspect-ratio: 16/9;
  overflow: hidden;
  position: relative;
`;

export const CardImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;

  ${Card}:hover & {
    transform: scale(1.04);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const CardContent = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 8px;
`;

export const CardMeta = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
`;

export const Tag = styled.span<{ $color?: string }>`
  font-size: 0.7rem;
  font-weight: 700;
  color: ${p => p.$color || 'var(--primary)'};
  background: ${p => p.$color ? `${p.$color}18` : 'rgba(244, 63, 94, 0.1)'};
  padding: 2px 8px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0;
`;

export const SmallTag = styled.span`
  font-size: 0.65rem;
  font-weight: 500;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 7px;
  border-radius: 999px;
`;

export const CardTitle = styled.h4`
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.4;
  margin: 0;
  color: #fff;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

export const CardSummary = styled.p`
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

export const CardFooter = styled.div`
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #64748B;
`;

// --- Reader View ---

export const InlineReaderSection = styled.section`
  width: 100%;
  margin: 0 0 44px;
  scroll-margin-top: 16px;

  @media (max-width: 768px) {
    margin-bottom: 28px;
  }
`;

export const ReaderTopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.025);
`;

export const ReaderTopTitle = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 800;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const ReaderContainer = styled.div`
  background: #111;
  width: 100%;
  max-width: 1120px;
  border-radius: 20px;
  border: 1px solid var(--border);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  min-height: min-content;
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    max-width: none;
    border-radius: 16px;
    margin: 0;
  }
`;

export const ReaderHeader = styled.div`
  padding: 32px 40px;
  border-bottom: 1px solid var(--border);

  @media (max-width: 768px) {
    padding: 20px 16px;
  }
`;

export const ReaderTitle = styled.h2`
  font-size: 1.8rem;
  line-height: 1.18;
  font-weight: 900;
  letter-spacing: 0;
  color: #fff;
  margin: 0 0 8px;
  overflow-wrap: anywhere;

  @media (max-width: 768px) {
    font-size: 1.35rem;
  }
`;

export const ReaderContent = styled.div`
  padding: 32px 40px;
  font-size: 1rem;
  line-height: 1.7;
  color: #D4D4D8;
  overflow-wrap: anywhere;

  h3 {
    font-size: 1.3rem;
    font-weight: 700;
    margin: 32px 0 16px;
    color: #fff;
  }

  ul {
    padding-left: 20px;
    margin-bottom: 20px;

    li {
      margin-bottom: 8px;
      line-height: 1.6;
    }
  }

  p {
    margin-bottom: 20px;
  }

  @media (max-width: 768px) {
    padding: 20px 16px 24px;
    font-size: 0.95rem;
  }
`;

export const ReaderActions = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 24px 40px;
  border-top: 1px solid var(--border);

  > button {
    flex: 0 1 auto;
  }

  @media (max-width: 768px) {
    padding: 16px;

    > button {
      flex: 1 1 calc(50% - 6px);
    }
  }

  @media (max-width: 520px) {
    > button {
      flex-basis: 100%;
    }
  }
`;

export const ReaderMedia = styled.div`
  aspect-ratio: 16 / 9;
  overflow: hidden;
  position: relative;
  background: #000;

  @media (max-width: 768px) {
    min-height: 196px;
  }
`;

export const ReaderIframe = styled.iframe`
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  background: #000;
  touch-action: auto;
`;

export const CloseButton = styled.button`
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  touch-action: manipulation;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  &:focus-visible {
    outline: 2px solid rgba(56, 189, 248, 0.95);
    outline-offset: 3px;
  }
`;

// --- Input Drawer/Modal ---

export const InputModal = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: ${({ $isOpen }) => ($isOpen ? 'auto' : 'none')};
  visibility: ${({ $isOpen }) => ($isOpen ? 'visible' : 'hidden')};
`;

export const ModalBackdrop = styled.div<{ $isOpen: boolean }>`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
  transition: opacity 0.3s ease;
`;

export const ModalContent = styled.div<{ $isOpen: boolean }>`
  background: #18181B;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 32px;
  border-radius: 24px;
  border: 1px solid var(--border);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  position: relative;
  transform: ${({ $isOpen }) => ($isOpen ? 'scale(1)' : 'scale(0.95)')};
  opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
  transition:
    opacity 0.3s cubic-bezier(0.2, 0, 0, 1),
    transform 0.3s cubic-bezier(0.2, 0, 0, 1);

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid rgba(56, 189, 248, 0.95);
    outline-offset: 4px;
  }

  @media (max-width: 768px) {
    width: calc(100% - 24px);
    max-height: calc(100dvh - 24px);
    padding: 20px;
    border-radius: 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
`;

export const InputTitle = styled.h2`
  font-size: 1.6rem;
  margin: 0 0 24px 0;
  color: #fff;
`;

export const StyledInput = styled.input`
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: #fff;
  font-size: 1rem;
  margin-bottom: 12px;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;

  &:focus,
  &:focus-visible {
    border-color: var(--primary);
    box-shadow: 0 0 0 4px rgba(244, 63, 94, 0.14);
  }
`;

export const InlineFieldRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 20px;

  @media (max-width: 520px) {
    flex-direction: column;
  }
`;

export const InlineGrowInput = styled(StyledInput)`
  margin-bottom: 0;
  flex: 1 1 0;
`;

export const InlineActionButton = styled(ActionButton)`
  height: auto;
  border-radius: 12px;
`;

export const StyledTextarea = styled.textarea`
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: #fff;
  font-size: 1rem;
  margin-bottom: 12px;
  outline: 2px solid transparent;
  outline-offset: 2px;
  min-height: 100px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.6;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;

  &:focus,
  &:focus-visible {
    border-color: var(--primary);
    box-shadow: 0 0 0 4px rgba(244, 63, 94, 0.14);
  }
`;

export const StyledSelect = styled.select`
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: #fff;
  font-size: 1rem;
  margin-bottom: 12px;
  outline: 2px solid transparent;
  outline-offset: 2px;
  cursor: pointer;
  appearance: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;

  &:focus,
  &:focus-visible {
    border-color: var(--primary);
    box-shadow: 0 0 0 4px rgba(244, 63, 94, 0.14);
  }

  option {
    background: #18181B;
    color: #fff;
  }
`;

export const FormLabel = styled.label`
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0;
`;

export const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
`;

// --- Spinner ---

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

export const Spinner = styled.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

// --- Analysis Section in Reader ---

export const AnalysisBlock = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 24px;
  margin: 20px 0;

  @media (max-width: 768px) {
    padding: 20px;
  }
`;

export const TakeawayList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    padding: 10px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 0.95rem;
    line-height: 1.6;

    &:last-child {
      border-bottom: none;
    }

    &::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--primary);
      margin-top: 8px;
      flex-shrink: 0;
    }
  }
`;
