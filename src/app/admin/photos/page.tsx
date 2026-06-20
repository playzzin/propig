'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import styled from 'styled-components';
import {
    DndContext,
    DragEndEvent,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PhotoAlbum, PhotoItem, photoService } from '@/services/photoService';
import { toast } from 'sonner';
import PhotoModal from '@/components/photos/PhotoModal';
import ImportFromAIModal from '@/components/photos/ImportFromAIModal';
import BulkPhotoUploadModal from '@/components/photos/BulkPhotoUploadModal';
import type { ImageConverterSeedPhoto } from '@/components/photos/ImageConverter';
import { useMenuSitesQuery } from '@/hooks/useMenuSitesQuery';
import { useSystem } from '@/contexts/SystemContext';
import { useMenuContext } from '@/contexts/MenuContext';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';

const ImageConverter = dynamic(() => import('@/components/photos/ImageConverter'), { ssr: false });

type DeleteRequest =
    | { type: 'category'; album: PhotoAlbum }
    | { type: 'photo'; item: PhotoItem };

/* ═══════════════════════════════════════════════════════════════
   Styled Components
═══════════════════════════════════════════════════════════════ */

const Page = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: #f8f9fc;

    @media (max-width: 720px) {
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
    }
`;

const TabBar = styled.div`
    display: flex;
    gap: 4px;
    padding: 0 28px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
    overflow-x: auto;

    &::-webkit-scrollbar {
        display: none;
    }

    @media (max-width: 720px) {
        padding: 0 20px;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
    }
`;

const Tab = styled.button<{ $active?: boolean }>`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 12px 16px;
    border: none;
    background: transparent;
    font-size: 0.88rem;
    font-weight: ${(p) => (p.$active ? '700' : '500')};
    color: ${(p) => (p.$active ? '#4f46e5' : '#6b7280')};
    border-bottom: 2.5px solid ${(p) => (p.$active ? '#4f46e5' : 'transparent')};
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
    white-space: nowrap;

    &:hover { color: #4f46e5; }

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.22);
        outline-offset: -3px;
    }

    .badge {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        font-size: 0.64rem;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 10px;
        letter-spacing: 0.04em;
    }
`;

const ConverterWrap = styled.div`
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    @media (max-width: 720px) {
        overflow: visible;
    }
`;

const PageHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 28px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;

    h1 {
        font-size: 1.5rem;
        font-weight: 700;
        color: #111827;
        margin: 0;
    }

    @media (max-width: 720px) {
        display: none;
    }
`;

const HeaderActions = styled.div`
    display: flex;
    gap: 10px;
    flex-shrink: 0;
`;

const PrimaryButton = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    background: #4f46e5;
    color: white;
    border: none;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;

    &:hover { background: #4338ca; }

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.25);
        outline-offset: 2px;
    }

    @media (max-width: 720px) {
        padding: 9px 14px;
    }
`;

const Body = styled.div`
    display: flex;
    flex: 1;
    overflow: hidden;

    @media (max-width: 720px) {
        flex-direction: column;
        overflow: visible;
    }
`;

const CategorySection = styled.div<{ $hasDetail: boolean }>`
    width: ${(p) => (p.$hasDetail ? '320px' : '100%')};
    flex-shrink: 0;
    overflow-y: auto;
    padding: 20px 24px;
    border-right: ${(p) => (p.$hasDetail ? '1px solid #e5e7eb' : 'none')};
    transition: width 0.25s ease;

    @media (max-width: 720px) {
        width: 100%;
        overflow: visible;
        padding: 20px;
        border-right: none;
        border-bottom: ${(p) => (p.$hasDetail ? '1px solid #e5e7eb' : 'none')};
        transition: none;
    }
`;

const SectionTitle = styled.div`
    font-size: 0.8rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
`;

const MobileCategoryButton = styled(PrimaryButton)`
    display: none;

    @media (max-width: 720px) {
        display: inline-flex;
        min-height: 34px;
        padding: 7px 11px;
        font-size: 0.78rem;
        text-transform: none;
        letter-spacing: 0;
    }
`;

const CategoryList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const FaviconPanel = styled.details`
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 10px;
    margin-bottom: 16px;
    overflow: hidden;

    &[open] {
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04);
    }
`;

const FaviconHeader = styled.summary`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
        display: none;
    }

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.2);
        outline-offset: -3px;
    }

    .title {
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #6b7280;
    }

    .desc {
        font-size: 0.75rem;
        color: #9ca3af;
        line-height: 1.35;
    }

    .chevron {
        color: #9ca3af;
        font-size: 0.78rem;
        transition: transform 0.16s ease;
    }

    ${FaviconPanel}[open] & .chevron {
        transform: rotate(180deg);
    }
`;

const FaviconContent = styled.div`
    padding: 0 12px 12px;
`;

const FaviconRow = styled.div<{ $active?: boolean }>`
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 32px 32px;
    grid-template-areas:
        "icon site logo favicon"
        "actions actions actions actions";
    align-items: center;
    gap: 8px 10px;
    padding: 10px 0;
    border-radius: 8px;
    background: ${(p) => (p.$active ? '#eef2ff' : 'transparent')};

    .site-icon {
        grid-area: icon;
    }

    .site-info {
        grid-area: site;
    }

    .logo-preview {
        grid-area: logo;
    }

    .favicon-preview {
        grid-area: favicon;
    }

    &:hover {
        background: ${(p) => (p.$active ? '#e0e7ff' : '#f9fafb')};
    }

    & + & {
        margin-top: 4px;
    }
`;

const SiteBadgeIcon = styled.i`
    font-size: 0.95rem;
    color: #6b7280;
`;

const FaviconPreview = styled.div`
    width: 30px;
    height: 30px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #f9fafb;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;

    img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
`;

const FaviconActions = styled.div`
    grid-area: actions;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;

    @media (max-width: 720px) {
        justify-content: flex-start;
    }
`;

const FaviconActionButton = styled.button`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: white;
    color: #374151;
    font-size: 0.75rem;
    font-weight: 600;
    min-height: 30px;
    padding: 5px 9px;
    cursor: pointer;
    white-space: nowrap;

    &:hover {
        background: #f9fafb;
    }

    &:disabled {
        opacity: 0.42;
        cursor: not-allowed;
    }

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.2);
        outline-offset: 2px;
    }

    @media (max-width: 720px) {
        flex: 1 1 92px;
    }
`;

const ApplyHint = styled.div`
    margin-top: 8px;
    font-size: 0.74rem;
    color: #6b7280;
    line-height: 1.45;
`;

const CategoryCardWrapper = styled.div<{ $selected?: boolean; $dragging?: boolean }>`
    background: ${(p) => (p.$selected ? '#eef2ff' : 'white')};
    border: 2px solid ${(p) => (p.$selected ? '#4f46e5' : '#e5e7eb')};
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
    opacity: ${(p) => (p.$dragging ? 0.4 : 1)};

    &:hover {
        border-color: ${(p) => (p.$selected ? '#4f46e5' : '#a5b4fc')};
        background: ${(p) => (p.$selected ? '#eef2ff' : '#f9fafb')};
    }
`;

const CategorySelectButton = styled.button`
    min-width: 0;
    flex: 1;
    border: none;
    background: transparent;
    padding: 2px 0;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    cursor: pointer;
    border-radius: 8px;

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.24);
        outline-offset: 2px;
    }
`;

const DragHandle = styled.button`
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: #9ca3af;
    cursor: grab;
    border-radius: 4px;
    flex-shrink: 0;

    &:hover { color: #6b7280; background: #f3f4f6; }
    &:active { cursor: grabbing; }

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.2);
        outline-offset: 2px;
    }
`;

const CategoryThumb = styled.div`
    width: 44px;
    height: 44px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
`;

const CategoryInfo = styled.div`
    flex: 1;
    min-width: 0;

    .name {
        font-size: 0.95rem;
        font-weight: 600;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .count {
        font-size: 0.8rem;
        color: #6b7280;
        margin-top: 2px;
    }
`;

const CategoryCardActions = styled.div`
    display: flex;
    gap: 4px;
    flex-shrink: 0;
`;

const IconBtn = styled.button<{ $danger?: boolean }>`
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: ${(p) => (p.$danger ? '#ef4444' : '#6b7280')};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    transition: background 0.15s, color 0.15s;

    &:hover {
        background: ${(p) => (p.$danger ? '#fee2e2' : '#f3f4f6')};
        color: ${(p) => (p.$danger ? '#dc2626' : '#374151')};
    }

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.2);
        outline-offset: 2px;
    }
`;

/* ─── Photo Detail Panel ─── */

const DetailPanel = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    @media (max-width: 720px) {
        flex: none;
        overflow: visible;
        min-height: 0;
    }
`;

const DetailHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
    gap: 12px;
    flex-wrap: wrap;

    .title {
        font-size: 1.1rem;
        font-weight: 700;
        color: #111827;
        flex: 1;
        min-width: 120px;
    }

    @media (max-width: 720px) {
        align-items: flex-start;
        padding: 16px 20px;

        .title {
            flex-basis: 100%;
        }
    }
`;

const DetailActions = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;

    @media (max-width: 720px) {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));

        button {
            width: 100%;
            justify-content: center;
        }

        button:last-child {
            grid-column: 2;
            width: 40px;
            justify-self: end;
        }
    }
`;

const SecondaryButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    background: white;
    color: #374151;
    border: 1px solid #d1d5db;
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;

    &:hover { background: #f9fafb; border-color: #9ca3af; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.2);
        outline-offset: 2px;
    }
`;

const AIButton = styled(SecondaryButton)`
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-color: transparent;

    &:hover {
        background: linear-gradient(135deg, #5a67d8 0%, #6b3e94 100%);
        border-color: transparent;
    }
`;

const PhotoGrid = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    align-content: start;

    @media (max-width: 720px) {
        overflow: visible;
        padding: 16px 20px 32px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
    }
`;

const PhotoCardWrapper = styled.div<{ $dragging?: boolean; $selected?: boolean }>`
    position: relative;
    aspect-ratio: 1;
    border-radius: 10px;
    overflow: hidden;
    background: #f3f4f6;
    opacity: ${(p) => (p.$dragging ? 0.4 : 1)};
    border: 2px solid ${(p) => (p.$selected ? '#4f46e5' : 'transparent')};
    box-shadow: ${(p) => (p.$selected ? '0 0 0 2px rgba(79,70,229,0.15)' : 'none')};

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .prompt-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%);
        opacity: 0;
        transition: opacity 0.2s;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 10px;
    }

    &:hover .prompt-overlay,
    &:focus-within .prompt-overlay {
        opacity: 1;
    }
`;

const PhotoPreviewFallback = styled.div<{ $error?: boolean }>`
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 14px;
    background: ${(p) => (p.$error ? '#fff1f2' : '#eef2ff')};
    color: ${(p) => (p.$error ? '#be123c' : '#4338ca')};
    text-align: center;
    font-size: 0.72rem;
    font-weight: 700;

    i {
        font-size: 1.15rem;
        opacity: 0.9;
    }

    span {
        display: block;
        max-width: 100%;
        overflow-wrap: anywhere;
        line-height: 1.35;
    }
`;

const PhotoSelectButton = styled.button`
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    padding: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    overflow: hidden;

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.42);
        outline-offset: -3px;
    }
`;

const PhotoBadge = styled.span<{ $ai?: boolean }>`
    position: absolute;
    top: 6px;
    left: 6px;
    background: ${(p) => (p.$ai ? 'rgba(99,102,241,0.9)' : 'rgba(16,185,129,0.9)')};
    color: white;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.05em;
    pointer-events: none;
`;

const PhotoDeleteBtn = styled.button`
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    background: rgba(239,68,68,0.85);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    opacity: 1;
    transition: opacity 0.2s, background 0.15s;
    z-index: 2;

    &:focus-visible {
        outline: 3px solid rgba(255, 255, 255, 0.68);
        outline-offset: 2px;
    }

    &:hover { background: #dc2626; }
`;

const PhotoEditBtn = styled(PhotoDeleteBtn)`
    right: 40px;
    background: rgba(79,70,229,0.9);

    &:hover {
        background: #4338ca;
    }
`;

const PhotoCopyBtn = styled(PhotoDeleteBtn)<{ $withEdit?: boolean }>`
    right: ${(p) => (p.$withEdit ? '74px' : '40px')};
    background: rgba(17, 24, 39, 0.86);

    &:hover {
        background: #111827;
    }
`;

const DragHandlePhoto = styled.button`
    position: absolute;
    bottom: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border: none;
    background: rgba(0,0,0,0.5);
    color: white;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    opacity: 0.85;
    transition: opacity 0.2s, background 0.15s;
    cursor: grab;
    z-index: 2;

    ${PhotoCardWrapper}:hover &,
    ${PhotoCardWrapper}:focus-within &,
    &:hover,
    &:focus-visible {
        opacity: 1;
    }

    &:active { cursor: grabbing; }

    &:focus-visible {
        outline: 3px solid rgba(255, 255, 255, 0.68);
        outline-offset: 2px;
    }
`;

const PhotoMeta = styled.div`
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, transparent 100%);
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.66rem;
    line-height: 1.35;
    padding: 18px 8px 6px;
    opacity: 1;
`;

const EmptyArea = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: #9ca3af;
    gap: 14px;
    padding: 40px;
    text-align: center;

    i { font-size: 2.5rem; }
    p { font-size: 0.9rem; line-height: 1.5; }

    @media (max-width: 720px) {
        padding: 32px 20px;
    }
`;

const EmptyAction = styled.button`
    border: 1px solid #c7d2fe;
    background: #eef2ff;
    color: #4338ca;
    border-radius: 10px;
    padding: 9px 14px;
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;

    &:hover {
        background: #e0e7ff;
    }

    &:focus-visible {
        outline: 3px solid rgba(79, 70, 229, 0.24);
        outline-offset: 2px;
    }
`;

const ConfirmOverlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 10000;
    padding: 20px;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const ConfirmDialog = styled.div`
    width: min(420px, 100%);
    border-radius: 16px;
    background: white;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
    border: 1px solid #e5e7eb;
    padding: 20px;

    h2 {
        margin: 0;
        color: #111827;
        font-size: 1.05rem;
        font-weight: 800;
    }

    p {
        margin: 10px 0 0;
        color: #475569;
        font-size: 0.9rem;
        line-height: 1.55;
    }

    .target {
        margin-top: 14px;
        padding: 12px;
        border-radius: 12px;
        background: #f8fafc;
        color: #0f172a;
        font-size: 0.86rem;
        font-weight: 700;
        word-break: break-word;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 18px;
    }
`;

/* ═══════════════════════════════════════════════════════════════
   Sortable Category Card
═══════════════════════════════════════════════════════════════ */

function getAlbumCoverPreview(album: PhotoAlbum) {
    return album.photoItems.find((item) => item.thumbnailUrl)?.thumbnailUrl || album.coverUrl || '';
}

function SafeThumbImage({ src, alt, width, height }: { src?: string; alt: string; width: number; height: number }) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const failed = Boolean(src && failedSrc === src);

    if (!src || failed) {
        return <i className="fa-solid fa-images" aria-hidden="true" />;
    }

    return (
        <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            onError={() => setFailedSrc(src)}
        />
    );
}

interface SortableCategoryCardProps {
    album: PhotoAlbum;
    selected: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

function SortableCategoryCard({ album, selected, onSelect, onEdit, onDelete }: SortableCategoryCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: album.id!,
    });

    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <div ref={setNodeRef} style={style}>
            <CategoryCardWrapper $selected={selected} $dragging={isDragging}>
                <DragHandle
                    type="button"
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                    title="드래그하여 순서 변경"
                    aria-label={`${album.title} 순서 변경`}
                >
                    <i className="fa-solid fa-grip-vertical" />
                </DragHandle>
                <CategorySelectButton
                    type="button"
                    onClick={onSelect}
                    aria-pressed={selected}
                    aria-label={`${album.title} 카테고리 선택, 사진 ${album.photoItems.length}장`}
                >
                    <CategoryThumb>
                        <SafeThumbImage src={getAlbumCoverPreview(album)} alt="" width={44} height={44} />
                    </CategoryThumb>
                    <CategoryInfo>
                        <div className="name">{album.title}</div>
                        <div className="count">{album.photoItems.length}장</div>
                    </CategoryInfo>
                </CategorySelectButton>
                <CategoryCardActions>
                    <IconBtn type="button" title="편집" aria-label={`${album.title} 카테고리 편집`} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                        <i className="fa-solid fa-pen" />
                    </IconBtn>
                    <IconBtn type="button" $danger title="삭제" aria-label={`${album.title} 카테고리 삭제`} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                        <i className="fa-solid fa-trash" />
                    </IconBtn>
                </CategoryCardActions>
            </CategoryCardWrapper>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   Sortable Photo Card
═══════════════════════════════════════════════════════════════ */

function isVideoPhotoItem(item: PhotoItem) {
    return item.type === 'video' || item.extension?.toLowerCase() === 'mp4' || item.mimeType?.startsWith('video/') || item.url.includes('.mp4');
}

async function copyTextToClipboard(value: string) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch {
            // Fall through to the legacy command for browsers that expose the
            // Clipboard API but reject the current permission context.
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!copied) {
        throw new Error('Clipboard copy command failed.');
    }
}

interface SortablePhotoCardProps {
    item: PhotoItem;
    selected?: boolean;
    previewPreparing?: boolean;
    previewFailed?: boolean;
    onSelect: (id: string) => void;
    onCopyUrl: (item: PhotoItem) => void;
    onEdit: (item: PhotoItem) => void;
    onDelete: (id: string) => void;
}

function SortablePhotoCard({ item, selected, previewPreparing, previewFailed, onSelect, onCopyUrl, onEdit, onDelete }: SortablePhotoCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
    const [failedPreviewSrc, setFailedPreviewSrc] = useState<string | null>(null);

    const style = { transform: CSS.Transform.toString(transform), transition };

    const isVideo = isVideoPhotoItem(item);
    const canEdit = !isVideo;
    const photoLabel = item.fileName || item.prompt || item.id;
    const previewSrc = item.thumbnailUrl || (item.source === 'ai' || !photoService.needsPreviewAsset(item) ? item.url : '');
    const previewLoadFailed = Boolean(previewSrc && failedPreviewSrc === previewSrc);
    const showPreviewError = previewLoadFailed || (!previewSrc && previewFailed);
    const selectedMarkerRight = canEdit ? 108 : 74;

    return (
        <div ref={setNodeRef} style={style}>
            <PhotoCardWrapper
                $dragging={isDragging}
                $selected={selected}
            >
                <PhotoSelectButton
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-label={`사진 선택: ${photoLabel}`}
                    aria-pressed={selected}
                >
                    {isVideo ? (
                        <video
                            src={item.url}
                            poster={item.thumbnailUrl}
                            preload="metadata"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            muted
                            loop
                            onMouseOver={(e) => e.currentTarget.play()}
                            onMouseOut={(e) => {
                                e.currentTarget.pause();
                                e.currentTarget.currentTime = 0;
                            }}
                        />
                    ) : (
                        previewSrc && !showPreviewError ? (
                            <img
                                src={previewSrc}
                                alt={item.prompt || item.fileName || '사진'}
                                loading="lazy"
                                decoding="async"
                                width={item.width ?? undefined}
                                height={item.height ?? undefined}
                                onError={() => setFailedPreviewSrc(previewSrc)}
                            />
                        ) : (
                            <PhotoPreviewFallback $error={showPreviewError} aria-label={`${photoLabel} 미리보기 상태`}>
                                <i className={`fa-solid ${showPreviewError ? 'fa-triangle-exclamation' : 'fa-image'}`} aria-hidden="true" />
                                <span>
                                    {showPreviewError
                                        ? item.source === 'ai'
                                            ? '원본 파일 없음'
                                            : '미리보기 실패'
                                        : previewPreparing
                                            ? '미리보기 생성 중'
                                            : '미리보기 준비 중'}
                                </span>
                            </PhotoPreviewFallback>
                        )
                    )}

                    <PhotoBadge $ai={item.source === 'ai'}>{item.source === 'ai' ? 'AI' : 'UP'}</PhotoBadge>
                    {selected ? (
                        <span
                            style={{
                                position: 'absolute',
                                top: 6,
                                right: selectedMarkerRight,
                                background: 'rgba(79,70,229,0.95)',
                                color: 'white',
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                letterSpacing: '0.02em',
                            }}
                        >
                            선택
                        </span>
                    ) : null}
                    <div className="prompt-overlay">
                        {item.prompt && (
                            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.7rem', margin: 0, lineHeight: 1.4 }}>
                                {item.prompt.length > 60 ? item.prompt.slice(0, 60) + '…' : item.prompt}
                            </p>
                        )}
                    </div>
                    <PhotoMeta>
                        <div>{item.fileName || 'unknown'}</div>
                        <div>
                            {item.extension?.toUpperCase() || item.mimeType || 'N/A'}
                            {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                        </div>
                        <div>
                            {item.width && item.height ? `${item.width}x${item.height}` : '해상도 정보 없음'}
                        </div>
                    </PhotoMeta>
                </PhotoSelectButton>
                <PhotoCopyBtn
                    type="button"
                    $withEdit={canEdit}
                    onClick={(e) => { e.stopPropagation(); onCopyUrl(item); }}
                    title="사진 주소 복사"
                    aria-label={`${item.fileName || '사진'} 주소 복사`}
                >
                    <i className="fa-solid fa-link" aria-hidden="true" />
                </PhotoCopyBtn>
                {canEdit && (
                    <PhotoEditBtn
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                        title="이미지 변환기로 편집"
                        aria-label={`${item.fileName || '사진'} 이미지 변환기로 편집`}
                    >
                        <i className="fa-solid fa-wand-magic-sparkles" />
                    </PhotoEditBtn>
                )}
                <PhotoDeleteBtn
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                    title="사진 삭제"
                    aria-label={`${item.fileName || '사진'} 삭제`}
                >
                    <i className="fa-solid fa-xmark" />
                </PhotoDeleteBtn>
                <DragHandlePhoto
                    type="button"
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                    title="드래그하여 순서 변경"
                    aria-label={`${photoLabel} 순서 변경`}
                >
                    <i className="fa-solid fa-up-down-left-right" />
                </DragHandlePhoto>
            </PhotoCardWrapper>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════════ */

type ActiveTab = 'album' | 'converter';

export default function PhotosPage() {
    const { currentSite } = useMenuContext();
    const { settings, updateSettings } = useSystem();
    const { data: sites = {} } = useMenuSitesQuery();
    const siteEntries = useMemo(() => getSwitchableSiteEntries(sites), [sites]);
    const [activeTab, setActiveTab] = useState<ActiveTab>('album');
    const [categories, setCategories] = useState<PhotoAlbum[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<PhotoAlbum | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<PhotoAlbum | null>(null);
    const [isImportAIOpen, setIsImportAIOpen] = useState(false);
    const [isBulkOpen, setIsBulkOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
    const [converterSeed, setConverterSeed] = useState<{ key: string; photos: ImageConverterSeedPhoto[] } | null>(null);
    const [isBrandPanelOpen, setIsBrandPanelOpen] = useState(false);
    const [pendingBulkFiles, setPendingBulkFiles] = useState<File[]>([]);
    const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
    const [previewPreparingIds, setPreviewPreparingIds] = useState<Record<string, boolean>>({});
    const [previewFailedIds, setPreviewFailedIds] = useState<Record<string, boolean>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const didAutoSelectRef = useRef(false);
    const previewAssetRunRef = useRef<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const loadCategories = async () => {
        try {
            const data = await photoService.getAlbums();
            setCategories(data);
            if (selectedCategory?.id) {
                const updated = data.find((c) => c.id === selectedCategory.id);
                setSelectedCategory(updated ?? null);
                if (selectedPhotoId && updated && !updated.photoItems.some((item) => item.id === selectedPhotoId)) {
                    setSelectedPhotoId(null);
                }
            }
        } catch (e) {
            console.error(e);
            toast.error('카테고리 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadCategories(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (categories.length === 0) {
            didAutoSelectRef.current = false;
            return;
        }

        if (!didAutoSelectRef.current && !selectedCategory) {
            setSelectedCategory(categories[0]);
            didAutoSelectRef.current = true;
        }
    }, [categories, selectedCategory]);

    useEffect(() => {
        if (!selectedCategory?.id) return;

        const albumId = selectedCategory.id;
        const queue = selectedCategory.photoItems.filter((item) => photoService.needsPreviewAsset(item));
        if (queue.length === 0) return;

        const signature = `${albumId}:${queue.map((item) => `${item.id}:${item.url}:${item.thumbnailUrl ?? ''}:${item.storagePath ?? ''}`).join('|')}`;
        if (previewAssetRunRef.current === signature) return;
        previewAssetRunRef.current = signature;

        let cancelled = false;
        const queueIds = queue.map((item) => item.id);

        setPreviewPreparingIds((current) => {
            const next = { ...current };
            queueIds.forEach((id) => {
                next[id] = true;
            });
            return next;
        });
        setPreviewFailedIds((current) => {
            const next = { ...current };
            queueIds.forEach((id) => {
                delete next[id];
            });
            return next;
        });

        const mergeUpdatedItem = (updatedItem: PhotoItem) => {
            setSelectedCategory((current) => {
                if (current?.id !== albumId) return current;
                return {
                    ...current,
                    coverUrl: current.photoItems[0]?.id === updatedItem.id ? updatedItem.url : current.coverUrl,
                    photoItems: current.photoItems.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item)),
                };
            });
            setCategories((current) =>
                current.map((album) => {
                    if (album.id !== albumId) return album;
                    return {
                        ...album,
                        coverUrl: album.photoItems[0]?.id === updatedItem.id ? updatedItem.url : album.coverUrl,
                        photoItems: album.photoItems.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item)),
                    };
                }),
            );
        };

        void photoService.ensureAlbumPreviewAssets(
            albumId,
            queue,
            (updatedItem) => {
                if (cancelled) return;
                mergeUpdatedItem(updatedItem);
                setPreviewPreparingIds((current) => {
                    const next = { ...current };
                    delete next[updatedItem.id];
                    return next;
                });
            },
            (item) => {
                if (cancelled) return;
                setPreviewFailedIds((current) => ({ ...current, [item.id]: true }));
                setPreviewPreparingIds((current) => {
                    const next = { ...current };
                    delete next[item.id];
                    return next;
                });
            },
        ).finally(() => {
            if (cancelled) return;
            setPreviewPreparingIds((current) => {
                const next = { ...current };
                queueIds.forEach((id) => {
                    delete next[id];
                });
                return next;
            });
        });

        return () => {
            cancelled = true;
        };
    // Run this only when the selected album changes or receives new items; item-level
    // thumbnail updates are handled by the callbacks above to avoid restarting work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCategory?.id, selectedCategory?.photoItems.length]);

    const selectedPhoto = selectedCategory?.photoItems.find((item) => item.id === selectedPhotoId) || null;
    const selectedPhotoIsVideo = selectedPhoto ? isVideoPhotoItem(selectedPhoto) : false;

    useEffect(() => {
        if (selectedPhoto) {
            setIsBrandPanelOpen(true);
        }
    }, [selectedPhoto]);

    const openPhotosInConverter = (items: PhotoItem[]) => {
        if (!selectedCategory?.id) return;

        const editableItems = items.filter((item) => !isVideoPhotoItem(item));
        if (editableItems.length === 0) {
            toast.error('이미지 사진만 변환기에서 편집할 수 있습니다.');
            return;
        }

        const photos = editableItems.map((item) => ({
            ...item,
            sourceAlbumId: selectedCategory.id,
            albumTitle: selectedCategory.title,
        }));

        setConverterSeed({
            key: `${selectedCategory.id}-${editableItems.map((item) => item.id).join('-')}-${Date.now()}`,
            photos,
        });
        setActiveTab('converter');
        toast.success(`${editableItems.length}장 사진을 이미지 변환기로 보냅니다.`);
    };

    const handleEditSelectedPhoto = () => {
        if (!selectedPhoto) {
            toast.info('편집할 사진을 먼저 선택해주세요.');
            return;
        }
        openPhotosInConverter([selectedPhoto]);
    };

    const handleCopyPhotoUrl = async (item: PhotoItem) => {
        if (!item.url) {
            toast.error('복사할 사진 주소가 없습니다.');
            return;
        }

        try {
            await copyTextToClipboard(item.url);
            toast.success('사진 주소를 복사했습니다.');
        } catch (error) {
            console.error('Photo URL copy failed:', error);
            toast.error('사진 주소 복사에 실패했습니다.');
        }
    };

    const applyPhotoToSiteSetting = async (siteId: string, target: 'logo' | 'favicon') => {
        if (target === 'favicon' && selectedPhotoIsVideo) {
            toast.error('비디오는 파비콘으로 적용할 수 없습니다. 이미지 또는 ICO 파일을 선택해주세요.');
            return;
        }

        if (!selectedPhoto?.url) {
            toast.error('먼저 사진을 하나 선택해주세요.');
            return;
        }

        try {
            if (target === 'logo') {
                await updateSettings({
                    envLogos: {
                        ...(settings.envLogos ?? {}),
                        [siteId]: selectedPhoto.url,
                    },
                });
                toast.success(`${siteId} 사이트 로고로 등록했습니다.`);
                return;
            }

            await updateSettings({
                envFavicons: {
                    ...(settings.envFavicons ?? {}),
                    [siteId]: selectedPhoto.url,
                },
            });
            toast.success(`${siteId} 사이트 파비콘으로 등록했습니다.`);
        } catch (error) {
            console.error(error);
            toast.error(`${target === 'logo' ? '로고' : '파비콘'} 등록에 실패했습니다.`);
        }
    };

    const handleSiteBrandDelete = async (siteId: string, siteName: string) => {
        const hasLogo = !!settings.envLogos?.[siteId];
        const hasFavicon = !!settings.envFavicons?.[siteId];
        if (!hasLogo && !hasFavicon) return;
        if (!confirm(`${siteName} 사이트의 로고/파비콘을 삭제하시겠습니까?`)) return;

        try {
            const nextEnvLogos = { ...(settings.envLogos ?? {}) };
            const nextEnvFavicons = { ...(settings.envFavicons ?? {}) };
            delete nextEnvLogos[siteId];
            delete nextEnvFavicons[siteId];
            await updateSettings({ envLogos: nextEnvLogos, envFavicons: nextEnvFavicons });
            toast.success(`${siteName} 사이트 브랜드 이미지가 삭제되었습니다.`);
        } catch (error) {
            console.error(error);
            toast.error('사이트 브랜드 이미지 삭제에 실패했습니다.');
        }
    };

    /* ─── Category DnD ─── */
    const handleCategoryDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIdx = categories.findIndex((c) => c.id === active.id);
        const newIdx = categories.findIndex((c) => c.id === over.id);
        const reordered = arrayMove(categories, oldIdx, newIdx);
        setCategories(reordered);
        try {
            await photoService.reorderAlbums(reordered.map((c) => c.id!));
        } catch {
            toast.error('순서 저장 실패');
            loadCategories();
        }
    };

    /* ─── Photo DnD ─── */
    const handlePhotoDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id || !selectedCategory) return;
        const items = selectedCategory.photoItems;
        const oldIdx = items.findIndex((i) => i.id === active.id);
        const newIdx = items.findIndex((i) => i.id === over.id);
        const reordered = arrayMove(items, oldIdx, newIdx);
        const updated = { ...selectedCategory, photoItems: reordered };
        setSelectedCategory(updated);
        setCategories((prev) => prev.map((c) => (c.id === selectedCategory.id ? updated : c)));
        try {
            await photoService.updatePhotoOrder(selectedCategory.id!, reordered);
        } catch {
            toast.error('사진 순서 저장 실패');
        }
    };

    /* ─── Category CRUD ─── */
    const handleDeleteCategory = async (album: PhotoAlbum) => {
        setDeleteRequest({ type: 'category', album });
    };

    const confirmDeleteCategory = async (album: PhotoAlbum) => {
        try {
            await photoService.deleteAlbum(album.id!);
            toast.success('카테고리가 삭제되었습니다.');
            if (selectedCategory?.id === album.id) {
                setSelectedCategory(null);
                setSelectedPhotoId(null);
            }
            await loadCategories();
        } catch {
            toast.error('삭제 실패');
        }
    };

    const handleFormSave = async () => {
        setIsFormOpen(false);
        setEditingCategory(null);
        await loadCategories();
    };

    /* ─── Photo Upload ─── */
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !selectedCategory?.id) return;
        const files = Array.from(e.target.files);
        e.target.value = '';
        if (files.length > 12) {
            setPendingBulkFiles(files);
            setIsBulkOpen(true);
            toast.info(`${files.length}장이 선택되어 대량등록에서 이어서 확인합니다.`);
            return;
        }
        setUploading(true);
        try {
            const uploaded = await photoService.uploadPhotos(selectedCategory.id, files);
            await photoService.addPhotoItems(selectedCategory.id, uploaded);
            toast.success(`${files.length}장 업로드 완료`);
            await loadCategories();
        } catch (err) {
            toast.error('업로드 실패');
            console.error(err);
        } finally {
            setUploading(false);
        }
    };

    const handleBulkRegister = async (files: File[]) => {
        if (!selectedCategory?.id) return;
        setUploading(true);
        try {
            const uploaded = await photoService.uploadPhotos(selectedCategory.id, files);
            await photoService.addPhotoItems(selectedCategory.id, uploaded);
            toast.success(`대량등록 완료: ${files.length}장`);
            setIsBulkOpen(false);
            setPendingBulkFiles([]);
            await loadCategories();
        } catch (err) {
            toast.error('대량등록 실패');
            console.error(err);
        } finally {
            setUploading(false);
        }
    };

    /* ─── Photo Delete ─── */
    const handleDeletePhoto = async (itemId: string) => {
        if (!selectedCategory?.id) return;
        const item = selectedCategory.photoItems.find((photo) => photo.id === itemId);
        if (!item) return;
        setDeleteRequest({ type: 'photo', item });
    };

    const confirmDeletePhoto = async (item: PhotoItem) => {
        if (!selectedCategory?.id) return;
        try {
            await photoService.removePhotoItem(selectedCategory.id, item.id);
            toast.success('사진이 삭제되었습니다.');
            if (selectedPhotoId === item.id) setSelectedPhotoId(null);
            await loadCategories();
        } catch {
            toast.error('사진 삭제 실패');
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteRequest) return;

        const request = deleteRequest;
        setDeleteRequest(null);

        if (request.type === 'category') {
            await confirmDeleteCategory(request.album);
            return;
        }

        await confirmDeletePhoto(request.item);
    };

    /* ─── Import from AI ─── */
    const handleImportAI = async (images: { url: string; prompt?: string }[]) => {
        if (!selectedCategory?.id) return;
        try {
            for (const img of images) {
                await photoService.importFromAI(selectedCategory.id, img);
            }
            toast.success(`${images.length}장 가져오기 완료`);
            setIsImportAIOpen(false);
            await loadCategories();
        } catch (error) {
            console.error('Import from AI failed:', error);
            toast.error('가져오기 실패');
        }
    };

    const hasDetail = !!selectedCategory;

    return (
        <Page>
            <PageHeader>
                <h1>
                    <i className="fa-solid fa-images" style={{ marginRight: 10, color: '#4f46e5' }} />
                    사진 관리
                </h1>
                <HeaderActions>
                    <PrimaryButton type="button" onClick={() => { setEditingCategory(null); setIsFormOpen(true); }}>
                        <i className="fa-solid fa-plus" aria-hidden="true" />
                        카테고리 추가
                    </PrimaryButton>
                </HeaderActions>
            </PageHeader>

            {/* ─── Tab Bar ─── */}
            <TabBar>
                <Tab type="button" $active={activeTab === 'album'} onClick={() => setActiveTab('album')}>
                    <i className="fa-solid fa-images" aria-hidden="true" />
                    사진첩
                </Tab>
                <Tab type="button" $active={activeTab === 'converter'} onClick={() => setActiveTab('converter')}>
                    <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
                    이미지 변환기
                    <span className="badge">NEW</span>
                </Tab>
            </TabBar>

            {/* ─── Converter Tab ─── */}
            {activeTab === 'converter' && (
                <ConverterWrap>
                    <ImageConverter
                        albums={categories}
                        defaultAlbumId={selectedCategory?.id ?? null}
                        onAlbumsChanged={loadCategories}
                        seedPhotos={converterSeed?.photos ?? []}
                        seedKey={converterSeed?.key ?? null}
                    />
                </ConverterWrap>
            )}

            {/* ─── Album Tab ─── */}
            {activeTab === 'album' && (
            <Body>
                {/* ─── Left: Category List ─── */}
                <CategorySection $hasDetail={hasDetail}>
                    <FaviconPanel
                        open={isBrandPanelOpen}
                        onToggle={(event) => setIsBrandPanelOpen(event.currentTarget.open)}
                    >
                        <FaviconHeader>
                            <div>
                                <div className="title">사이트 브랜드 이미지</div>
                                <div className="desc">선택한 사진을 로고 또는 파비콘으로 적용</div>
                            </div>
                            <span className="chevron" aria-hidden="true">
                                <i className="fa-solid fa-chevron-down" />
                            </span>
                        </FaviconHeader>

                        <FaviconContent>
                            {siteEntries.map(([siteId, site]) => {
                                const faviconUrl = settings.envFavicons?.[siteId];
                                const logoUrl = settings.envLogos?.[siteId];

                                return (
                                    <FaviconRow key={siteId} $active={siteId === currentSite}>
                                        <SiteBadgeIcon className={`site-icon fa-solid fa-${site.icon || 'globe'}`} aria-hidden="true" />
                                        <div className="site-info" style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {site.name}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{siteId}</div>
                                        </div>

                                        <FaviconPreview className="logo-preview">
                                            {logoUrl ? (
                                                <img src={logoUrl} alt={`${site.name} logo`} width={30} height={30} />
                                            ) : (
                                                <i className="fa-solid fa-image" style={{ fontSize: '0.7rem' }} />
                                            )}
                                        </FaviconPreview>

                                        <FaviconPreview className="favicon-preview">
                                            {faviconUrl ? (
                                                <img src={faviconUrl} alt={`${site.name} favicon`} width={30} height={30} />
                                            ) : (
                                                <i className="fa-solid fa-image" style={{ fontSize: '0.7rem' }} />
                                            )}
                                        </FaviconPreview>

                                        <FaviconActions>
                                            <FaviconActionButton
                                                type="button"
                                                onClick={() => void applyPhotoToSiteSetting(siteId, 'logo')}
                                                disabled={!selectedPhoto?.url}
                                                aria-label={`${site.name} 로고 적용`}
                                            >
                                                <i className="fa-solid fa-image" aria-hidden="true" />
                                                로고 적용
                                            </FaviconActionButton>

                                            <FaviconActionButton
                                                type="button"
                                                onClick={() => void applyPhotoToSiteSetting(siteId, 'favicon')}
                                                disabled={!selectedPhoto?.url || selectedPhotoIsVideo}
                                                aria-label={`${site.name} 파비콘 적용`}
                                            >
                                                <i className="fa-solid fa-icons" aria-hidden="true" />
                                                파비콘 적용
                                            </FaviconActionButton>

                                            <FaviconActionButton
                                                type="button"
                                                onClick={() => void handleSiteBrandDelete(siteId, site.name)}
                                                disabled={!faviconUrl && !logoUrl}
                                                aria-label={`${site.name} 로고/파비콘 삭제`}
                                                style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fff' }}
                                            >
                                                <i className="fa-solid fa-trash" aria-hidden="true" />
                                                삭제
                                            </FaviconActionButton>
                                        </FaviconActions>
                                    </FaviconRow>
                                );
                            })}

                            <ApplyHint>
                                {selectedPhoto
                                    ? `선택된 사진: ${selectedPhoto.fileName || selectedPhoto.id}`
                                    : '사진을 1장 선택하면 사이트별 로고/파비콘 적용 버튼이 활성화됩니다.'}
                            </ApplyHint>

                            <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#9ca3af' }}>
                                현재 사이트: <strong style={{ color: '#6b7280' }}>{currentSite}</strong>
                            </div>
                        </FaviconContent>
                    </FaviconPanel>

                    <SectionTitle>
                        <span>카테고리 ({categories.length})</span>
                        <MobileCategoryButton type="button" onClick={() => { setEditingCategory(null); setIsFormOpen(true); }}>
                            <i className="fa-solid fa-plus" aria-hidden="true" />
                            추가
                        </MobileCategoryButton>
                    </SectionTitle>

                    {loading ? (
                        <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>불러오는 중…</p>
                    ) : categories.length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: '0.9rem', textAlign: 'center', paddingTop: 30 }}>
                            카테고리가 없습니다.<br />추가 버튼을 눌러 시작하세요.
                        </p>
                    ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
                            <SortableContext items={categories.map((c) => c.id!)} strategy={verticalListSortingStrategy}>
                                <CategoryList>
                                    {categories.map((album) => (
                                        <SortableCategoryCard
                                            key={album.id}
                                            album={album}
                                            selected={selectedCategory?.id === album.id}
                                            onSelect={() => {
                                                setSelectedCategory(album);
                                                setSelectedPhotoId(null);
                                            }}
                                            onEdit={() => { setEditingCategory(album); setIsFormOpen(true); }}
                                            onDelete={() => handleDeleteCategory(album)}
                                        />
                                    ))}
                                </CategoryList>
                            </SortableContext>
                        </DndContext>
                    )}
                </CategorySection>

                {/* ─── Right: Photo Detail ─── */}
                {hasDetail ? (
                    <DetailPanel>
                        <DetailHeader>
                            <span className="title">
                                {selectedCategory.title}
                                <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8, fontSize: '0.9rem' }}>
                                    ({selectedCategory.photoItems.length}장)
                                </span>
                            </span>
                            <DetailActions>
                                <AIButton type="button" onClick={() => setIsImportAIOpen(true)}>
                                    <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
                                    AI에서 가져오기
                                </AIButton>
                                <SecondaryButton type="button" onClick={handleEditSelectedPhoto} disabled={!selectedPhoto || isVideoPhotoItem(selectedPhoto)}>
                                    <i className="fa-solid fa-sliders" aria-hidden="true" />
                                    선택사진 편집
                                </SecondaryButton>
                                <SecondaryButton type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                                    <i className="fa-solid fa-upload" aria-hidden="true" />
                                    {uploading ? '업로드 중…' : '사진 추가'}
                                </SecondaryButton>
                                <SecondaryButton type="button" onClick={() => setIsBulkOpen(true)} disabled={uploading}>
                                    <i className="fa-solid fa-boxes-stacked" aria-hidden="true" />
                                    대량등록
                                </SecondaryButton>
                                <IconBtn type="button" onClick={() => setSelectedCategory(null)} title="닫기" aria-label="사진 상세 닫기">
                                    <i className="fa-solid fa-xmark" style={{ fontSize: '1rem' }} aria-hidden="true" />
                                </IconBtn>
                            </DetailActions>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleFileChange}
                            />
                        </DetailHeader>

                        {selectedCategory.photoItems.length === 0 ? (
                            <EmptyArea>
                                <i className="fa-solid fa-image" />
                                <p>사진이 없습니다.<br />업로드하거나 AI에서 가져오세요.</p>
                            </EmptyArea>
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhotoDragEnd}>
                                <SortableContext
                                    items={selectedCategory.photoItems.map((i) => i.id)}
                                    strategy={rectSortingStrategy}
                                >
                                    <PhotoGrid>
                                        {selectedCategory.photoItems.map((item) => (
                                            <SortablePhotoCard
                                                key={item.id}
                                                item={item}
                                                selected={selectedPhotoId === item.id}
                                                previewPreparing={previewPreparingIds[item.id]}
                                                previewFailed={previewFailedIds[item.id]}
                                                onSelect={setSelectedPhotoId}
                                                onCopyUrl={handleCopyPhotoUrl}
                                                onEdit={(photo) => openPhotosInConverter([photo])}
                                                onDelete={handleDeletePhoto}
                                            />
                                        ))}
                                    </PhotoGrid>
                                </SortableContext>
                            </DndContext>
                        )}
                    </DetailPanel>
                ) : (
                    !loading && categories.length > 0 && (
                        <EmptyArea style={{ flex: 1 }}>
                            <i className="fa-regular fa-hand-pointer" />
                            <p>왼쪽 카테고리를 선택하면<br />사진을 관리할 수 있습니다</p>
                            <EmptyAction
                                type="button"
                                onClick={() => {
                                    setSelectedCategory(categories[0]);
                                    setSelectedPhotoId(null);
                                }}
                            >
                                첫 카테고리 열기
                            </EmptyAction>
                        </EmptyArea>
                    )
                )}
            </Body>
            )} {/* album 탭 끝 */}

            {/* ─── Category Create/Edit Modal ─── */}
            {isFormOpen && (
                <PhotoModal
                    album={editingCategory}
                    onClose={() => { setIsFormOpen(false); setEditingCategory(null); }}
                    onSave={handleFormSave}
                />
            )}

            {/* ─── Import from AI Modal ─── */}
            {isImportAIOpen && selectedCategory && (
                <ImportFromAIModal
                    categoryName={selectedCategory.title}
                    onClose={() => setIsImportAIOpen(false)}
                    onImport={handleImportAI}
                />
            )}

            {isBulkOpen && selectedCategory && (
                <BulkPhotoUploadModal
                    categoryName={selectedCategory.title}
                    initialFiles={pendingBulkFiles}
                    loading={uploading}
                    onClose={() => {
                        setIsBulkOpen(false);
                        setPendingBulkFiles([]);
                    }}
                    onSubmit={handleBulkRegister}
                />
            )}

            {deleteRequest && (
                <ConfirmOverlay role="presentation" onMouseDown={() => setDeleteRequest(null)}>
                    <ConfirmDialog
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="photo-delete-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <h2 id="photo-delete-title">
                            {deleteRequest.type === 'category' ? '카테고리를 삭제할까요?' : '사진을 삭제할까요?'}
                        </h2>
                        <p>
                            {deleteRequest.type === 'category'
                                ? '카테고리와 포함된 사진이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.'
                                : '선택한 사진 파일과 메타데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.'}
                        </p>
                        <div className="target">
                            {deleteRequest.type === 'category'
                                ? `${deleteRequest.album.title} · ${deleteRequest.album.photoItems.length}장`
                                : deleteRequest.item.fileName || deleteRequest.item.prompt || deleteRequest.item.id}
                        </div>
                        <div className="actions">
                            <SecondaryButton type="button" onClick={() => setDeleteRequest(null)}>
                                취소
                            </SecondaryButton>
                            <IconBtn
                                type="button"
                                $danger
                                onClick={() => void handleConfirmDelete()}
                                aria-label="삭제 확인"
                                title="삭제"
                                style={{ width: 'auto', padding: '0 14px' }}
                            >
                                삭제
                            </IconBtn>
                        </div>
                    </ConfirmDialog>
                </ConfirmOverlay>
            )}
        </Page>
    );
}
