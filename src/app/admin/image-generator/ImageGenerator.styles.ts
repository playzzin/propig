import styled from 'styled-components';

export const PageContainer = styled.div`
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-base);

    @media (max-width: 1024px) {
        display: block;
        height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
    }
`;

export const ControlsPanel = styled.div`
    width: 380px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-subtle);
    background: var(--bg-overlay, rgba(255, 255, 255, 0.02));
    overflow-y: auto;

    @media (max-width: 1180px) {
        width: 360px;
    }

    @media (max-width: 1024px) {
        width: 100%;
        overflow: visible;
        border-right: 0;
        border-bottom: 1px solid var(--border-subtle);
    }
`;

export const CanvasArea = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;

    @media (max-width: 1024px) {
        min-height: 430px;
        overflow: visible;
        border-bottom: 1px solid var(--border-subtle);
    }

    @media (max-width: 520px) {
        min-height: 380px;
    }
`;

export const CanvasToolbar = styled.div`
    min-height: 48px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-overlay, rgba(255, 255, 255, 0.02));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 20px;

    @media (max-width: 520px) {
        padding: 0 16px;
    }
`;

export const ToolbarInfo = styled.div`
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
    color: var(--text-muted);

    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

export const StatusDot = styled.div<{ $generating?: boolean; $hasImage?: boolean }>`
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    background: ${({ $generating, $hasImage }) =>
        $generating ? 'var(--warning, #f59e0b)' : $hasImage ? 'var(--primary)' : 'var(--text-dim)'};
    animation: ${({ $generating }) => ($generating ? 'pulse 1.5s infinite' : 'none')};

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

export const ToolbarActions = styled.div`
    display: flex;
    flex-shrink: 0;
    gap: 8px;
`;

export const IconButton = styled.button`
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;

    &:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-main);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }

    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
`;

export const CanvasContent = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    position: relative;

    @media (max-width: 1024px) {
        min-height: 360px;
        padding: 24px;
    }

    @media (max-width: 520px) {
        min-height: 320px;
        padding: 18px;
    }
`;

export const EmptyState = styled.div`
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    color: var(--text-muted);
`;

export const EmptyIcon = styled.i`
    width: 84px;
    height: 84px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    background:
        linear-gradient(135deg, rgba(16, 185, 129, 0.12), transparent 56%),
        rgba(255, 255, 255, 0.03);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.8rem;
    margin-bottom: 20px;
    color: rgba(255, 255, 255, 0.2);
`;

export const EmptyTitle = styled.h3`
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0 0 8px;
`;

export const EmptyDesc = styled.p`
    margin: 0;
    font-size: 0.9rem;
    max-width: 340px;
    line-height: 1.6;
`;

export const PreviewWrap = styled.div`
    position: relative;
    max-width: 100%;
    max-height: 100%;
`;

export const PreviewImage = styled.img`
    max-width: 100%;
    max-height: calc(100vh - 200px);
    object-fit: contain;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);

    @media (max-width: 1024px) {
        max-height: 520px;
    }
`;

export const PreviewVideo = styled.video`
    max-width: 100%;
    max-height: calc(100vh - 200px);
    object-fit: contain;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);

    @media (max-width: 1024px) {
        max-height: 520px;
    }
`;

export const PreviewOverlay = styled.div`
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.84) 0%, transparent 46%);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 20px;
    opacity: 0;
    transition: opacity 0.2s ease;

    ${PreviewWrap}:hover &,
    ${PreviewWrap}:focus-within & {
        opacity: 1;
    }

    @media (hover: none) {
        opacity: 1;
    }
`;

export const OverlayPrompt = styled.p`
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.85rem;
    line-height: 1.4;
    margin: 0 0 16px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

export const OverlayActions = styled.div`
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
`;

export const ActionButton = styled.button<{ $primary?: boolean }>`
    padding: 10px 14px;
    border: none;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    background: ${({ $primary }) => ($primary ? 'var(--primary)' : 'rgba(255, 255, 255, 0.12)')};
    color: white;
    transition: filter 0.2s ease, opacity 0.2s ease, background-color 0.2s ease;

    &:hover:not(:disabled) {
        filter: brightness(1.08);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }

    &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        filter: none;
    }
`;

export const ActionSelect = styled.select`
    min-width: 180px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    background: var(--bg-elevated, rgba(15, 23, 42, 0.72));
    color: white;
    font-size: 0.82rem;
    font-weight: 600;
    backdrop-filter: blur(8px);

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
        border-color: var(--primary);
    }

    &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }
`;

export const GalleryPanel = styled.div`
    width: 260px;
    flex-shrink: 0;
    border-left: 1px solid var(--border-subtle);
    background: var(--bg-overlay, rgba(255, 255, 255, 0.02));
    display: flex;
    flex-direction: column;
    min-width: 0;

    @media (max-width: 1180px) {
        width: 240px;
    }

    @media (max-width: 1024px) {
        width: 100%;
        min-height: 300px;
        border-left: 0;
        border-top: 1px solid var(--border-subtle);
    }
`;

export const GalleryHeader = styled.div`
    height: 48px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 8px;

    i { color: var(--primary); }
    span {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-main);
    }
`;

export const LoadingOverlay = styled.div`
    position: absolute;
    inset: 0;
    background: rgba(10, 12, 16, 0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    z-index: 50;
`;

export const Spinner = styled.div`
    width: 60px;
    height: 60px;
    border: 3px solid var(--border-subtle);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

export const LoadingText = styled.div`
    text-align: center;

    h4 {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-main);
        margin: 0 0 8px;
    }

    p {
        font-size: 0.85rem;
        color: var(--text-muted);
        margin: 0;
    }
`;

export const FullscreenModal = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 40px;
    overscroll-behavior: contain;

    @media (max-width: 520px) {
        padding: 18px;
    }
`;

export const FullscreenClose = styled.button`
    position: absolute;
    top: 20px;
    right: 20px;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }
`;

export const FullscreenImage = styled.img`
    max-width: 95vw;
    max-height: 95vh;
    object-fit: contain;
    border-radius: 8px;
`;

export const SaveToAlbumOverlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
    overscroll-behavior: contain;
`;

export const SaveToAlbumModal = styled.div`
    background: var(--bg-elevated, #1a1d23);
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    width: 100%;
    max-width: 400px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
`;

export const AlbumModalHeader = styled.div`
    padding: 18px 20px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    justify-content: space-between;
    align-items: center;

    h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-main);
    }
`;

export const AlbumList = styled.div`
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 320px;
    overflow-y: auto;
`;

export const AlbumItem = styled.button`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--text-main);
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;

    &:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.08);
        border-color: var(--primary);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .thumb {
        width: 36px;
        height: 36px;
        position: relative;
        border-radius: 6px;
        background: var(--bg-base);
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
    }

    .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .info {
        flex: 1;
        min-width: 0;
    }

    .name {
        font-size: 0.9rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .count {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 2px;
    }
`;

export const AlbumModalClose = styled.button`
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease, color 0.2s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.12);
        color: var(--text-main);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }
`;
