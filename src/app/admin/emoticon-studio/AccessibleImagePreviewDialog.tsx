'use client';

import { X, ZoomIn } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type AccessibleImagePreviewDialogProps = {
  src: string;
  title: string;
  alt: string;
  detail?: string;
  onClose: () => void;
};

function visibleFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
    element.getAttribute('aria-hidden') !== 'true'
    && element.getClientRects().length > 0
  ));
}

/** Read-only preview shared by remote result images and local object URLs. */
export function AccessibleImagePreviewDialog({
  src,
  title,
  alt,
  detail,
  onClose,
}: AccessibleImagePreviewDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const detailId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // The preview can be opened over the mobile inspector. Stop its Escape
        // handler so only the top-most dialog closes.
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      event.stopPropagation();
      const focusable = visibleFocusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Window capture runs before the inspector's document capture listener.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
      returnFocusRef.current = null;
    };
  }, []);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <Backdrop onClick={handleBackdropClick}>
      <Dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={detail ? detailId : undefined}
        tabIndex={-1}
      >
        <Header>
          <div>
            <span><ZoomIn size={14} aria-hidden="true" /> 이미지 크게 보기</span>
            <h2 id={titleId}>{title}</h2>
            {detail ? <p id={detailId}>{detail}</p> : null}
          </div>
          <CloseButton ref={closeButtonRef} type="button" onClick={onClose} aria-label="이미지 크게 보기 닫기">
            <X size={20} aria-hidden="true" />
          </CloseButton>
        </Header>
        <Canvas>
          <img src={src} alt={alt} width={900} height={900} />
        </Canvas>
      </Dialog>
    </Backdrop>,
    document.body,
  );
}

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const zoomIn = keyframes`
  from { opacity: 0; transform: scale(.975); }
  to { opacity: 1; transform: scale(1); }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
  background: rgba(3, 5, 9, .84);
  overscroll-behavior: contain;
  animation: ${fadeIn} 140ms ease-out;

  @media (max-width: 520px) { padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Dialog = styled.section`
  width: min(920px, 100%);
  max-height: calc(100dvh - 36px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 16px;
  color: var(--text-main, #eef0f7);
  background: #11141b;
  box-shadow: 0 30px 90px rgba(0, 0, 0, .55);
  animation: ${zoomIn} 160ms cubic-bezier(.2, .8, .2, 1);

  &:focus-visible { outline: 2px solid #a99aff; outline-offset: 3px; }

  @media (max-width: 520px) {
    max-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    border-radius: 12px;
  }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Header = styled.header`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, .1);
  background: rgba(255, 255, 255, .025);

  > div { min-width: 0; }
  span { display: flex; align-items: center; gap: 5px; color: #a99aff; font-size: .66rem; font-weight: 800; }
  h2 { overflow: hidden; margin: 3px 0 0; color: #fff; font-size: .96rem; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  p { overflow: hidden; margin: 2px 0 0; color: #9ca4b4; font-size: .67rem; text-overflow: ellipsis; white-space: nowrap; }
`;

const CloseButton = styled.button`
  width: 44px;
  min-width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 10px;
  color: #e8eaf1;
  background: rgba(255, 255, 255, .055);
  cursor: pointer;
  touch-action: manipulation;

  &:hover { border-color: rgba(169, 154, 255, .55); background: rgba(124, 92, 255, .15); }
  &:focus-visible { outline: 2px solid #a99aff; outline-offset: 2px; }
`;

const Canvas = styled.div`
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 18px;
  background: repeating-conic-gradient(rgba(255,255,255,.07) 0 25%, rgba(255,255,255,.015) 0 50%) 50% / 20px 20px;
  overscroll-behavior: contain;

  img {
    width: auto;
    max-width: 100%;
    height: auto;
    max-height: min(74dvh, 900px);
    object-fit: contain;
  }

  @media (max-width: 520px) { padding: 10px; }
`;
