'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMenuContext } from '@/contexts/MenuContext';
import type { MenuItem } from '@/types/menu';

interface DashboardProps {
    title: string;
    description: string;
    topSlot?: React.ReactNode;
}

interface DashboardQuickLink {
    id: string;
    label: string;
    path: string;
    icon: string;
}

interface AvailablePageOption {
    id: string;
    label: string;
    path: string;
    icon: string;
}

interface QuickLinkActionButtonProps {
    icon: string;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    accent?: 'default' | 'danger' | 'drag';
    dragProps?: Record<string, unknown>;
    buttonRef?: ((element: HTMLButtonElement | null) => void) | null;
}

interface QuickLinkCardProps {
    item: DashboardQuickLink;
    isSettingsMode: boolean;
    onNavigate: (path: string) => void;
    onEdit: (item: DashboardQuickLink) => void;
    onDelete: (id: string) => void;
}

const QUICK_LINK_STORAGE_KEY = 'dashboard_quick_links_v1';

const defaultQuickLinks: DashboardQuickLink[] = [
    { id: 'home', label: '대시보드', path: '/', icon: 'house' },
    { id: 'notes', label: '스티커 메모', path: '/sticky-notes', icon: 'note-sticky' },
    { id: 'bookmarks', label: '스마트 북마크', path: '/bookmarks', icon: 'bookmark' },
    { id: 'youtube', label: 'YouTube 분석', path: '/youtube-analyze', icon: 'circle-play' },
    { id: 'mandalart', label: '만다라트', path: '/mandalart', icon: 'bullseye' },
    { id: 'habit-tracker', label: '습관 트래커', path: '/habit-tracker', icon: 'calendar-check' },
    { id: 'todo-list', label: '할일 일정표', path: '/todo-list', icon: 'list-check' },
    { id: 'user-admin', label: '유저 관리', path: '/admin/users', icon: 'user-shield' },
    { id: 'menu-admin', label: '통합 메뉴 관리', path: '/admin/menu', icon: 'bars' },
];

const panelStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.92) 0%, rgba(15, 23, 42, 0.94) 100%)',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    borderRadius: 22,
    overflow: 'hidden',
    boxShadow: '0 18px 40px rgba(2, 6, 23, 0.2)',
};

const settingsCardStyle: React.CSSProperties = {
    borderRadius: 16,
    border: '1px solid rgba(148, 163, 184, 0.12)',
    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.72) 0%, rgba(7, 11, 20, 0.88) 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
    padding: 14,
};

const fieldStyle: React.CSSProperties = {
    width: '100%',
    height: 40,
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.16)',
    background: 'rgba(15, 23, 42, 0.88)',
    color: 'var(--text-main)',
    outline: 'none',
};

const primaryButtonStyle: React.CSSProperties = {
    height: 36,
    padding: '0 14px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
};

const secondaryButtonStyle: React.CSSProperties = {
    height: 36,
    padding: '0 14px',
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.14)',
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--text-main)',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
};

function normalizePath(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '/';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function toStorageSafeLinks(value: unknown): DashboardQuickLink[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((item) => {
            if (!item || typeof item !== 'object') return null;

            const raw = item as Record<string, unknown>;
            const id = typeof raw.id === 'string' ? raw.id : '';
            const label = typeof raw.label === 'string' ? raw.label : '';
            const path = typeof raw.path === 'string' ? raw.path : '';
            const icon = typeof raw.icon === 'string' ? raw.icon : 'link';

            if (!id || !label || !path) return null;

            return {
                id,
                label,
                path: normalizePath(path),
                icon: icon.trim() || 'link',
            } satisfies DashboardQuickLink;
        })
        .filter((item): item is DashboardQuickLink => Boolean(item));
}

function flattenMenuLinks(items: MenuItem[], parentLabel?: string): AvailablePageOption[] {
    return items.flatMap((item) => {
        if (item.type === 'divider' || item.hidden) {
            return [];
        }

        const currentLabel = parentLabel ? `${parentLabel} / ${item.text}` : item.text;
        const currentItems: AvailablePageOption[] =
            item.type === 'link' && item.path
                ? [
                      {
                          id: item.id,
                          label: currentLabel,
                          path: normalizePath(item.path),
                          icon: item.icon || 'link',
                      },
                  ]
                : [];

        const childItems = Array.isArray(item.sub)
            ? flattenMenuLinks(
                  item.sub.filter((subItem): subItem is MenuItem => typeof subItem !== 'string'),
                  currentLabel,
              )
            : [];

        return [...currentItems, ...childItems];
    });
}

function QuickLinkActionButton({
    icon,
    title,
    onClick,
    disabled,
    accent = 'default',
    dragProps,
    buttonRef,
}: QuickLinkActionButtonProps) {
    const isDanger = accent === 'danger';
    const isDrag = accent === 'drag';

    return (
        <button
            type="button"
            ref={buttonRef}
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-label={title}
            style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                border: '1px solid rgba(148, 163, 184, 0.14)',
                background: isDanger
                    ? 'rgba(239, 68, 68, 0.08)'
                    : isDrag
                      ? 'rgba(99, 102, 241, 0.12)'
                      : 'rgba(255, 255, 255, 0.04)',
                color: isDanger ? '#fca5a5' : isDrag ? '#c7d2fe' : '#cbd5e1',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: disabled ? 'not-allowed' : isDrag ? 'grab' : 'pointer',
                opacity: disabled ? 0.35 : 1,
                padding: 0,
                fontSize: '0.68rem',
                flexShrink: 0,
                touchAction: isDrag ? 'none' : undefined,
            }}
            {...dragProps}
        >
            <i className={`fa-solid fa-${icon}`} />
        </button>
    );
}

function SectionIconToggleButton({
    icon,
    title,
    active,
    onClick,
}: {
    icon: string;
    title: string;
    active?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            aria-pressed={active}
            style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: active ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(148, 163, 184, 0.14)',
                background: active
                    ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.95) 0%, rgba(99, 102, 241, 0.95) 100%)'
                    : 'rgba(255, 255, 255, 0.04)',
                color: active ? '#ffffff' : '#cbd5e1',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                fontSize: '0.8rem',
                boxShadow: active ? '0 10px 20px rgba(79, 70, 229, 0.24)' : 'none',
                flexShrink: 0,
                transition: 'all 0.2s ease',
            }}
        >
            <i className={`fa-solid fa-${icon}`} />
        </button>
    );
}

function QuickLinkCard({
    item,
    isSettingsMode,
    onNavigate,
    onEdit,
    onDelete,
}: QuickLinkCardProps) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
        useSortable({
            id: item.id,
            disabled: !isSettingsMode,
        });

    const style: React.CSSProperties = {
        width: 96,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <button
                type="button"
                onClick={() => {
                    if (!isSettingsMode) {
                        onNavigate(item.path);
                    }
                }}
                style={{
                    width: 96,
                    height: 96,
                    borderRadius: 16,
                    border: '1px solid rgba(148, 163, 184, 0.16)',
                    background:
                        'linear-gradient(180deg, rgba(18, 24, 38, 0.96) 0%, rgba(10, 14, 24, 0.98) 100%)',
                    color: 'var(--text-bright)',
                    cursor: isSettingsMode ? 'default' : 'pointer',
                    padding: '10px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: isDragging
                        ? '0 18px 28px rgba(2, 6, 23, 0.28)'
                        : '0 12px 24px rgba(2, 6, 23, 0.18)',
                }}
            >
                <span
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(99, 102, 241, 0.16)',
                        color: '#c7d2fe',
                        fontSize: '0.9rem',
                    }}
                >
                    <i className={`fa-solid fa-${item.icon || 'link'}`} />
                </span>
                <span
                    style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.2,
                        textAlign: 'center',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {item.label}
                </span>
            </button>

            {isSettingsMode ? (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 4,
                    }}
                >
                    <QuickLinkActionButton icon="pen" title="수정" onClick={() => onEdit(item)} />
                    <QuickLinkActionButton
                        icon="trash"
                        title="삭제"
                        onClick={() => onDelete(item.id)}
                        accent="danger"
                    />
                    <QuickLinkActionButton
                        icon="grip-lines"
                        title="드래그해서 이동"
                        onClick={() => undefined}
                        accent="drag"
                        buttonRef={setActivatorNodeRef}
                        dragProps={{
                            ...attributes,
                            ...listeners,
                        }}
                    />
                </div>
            ) : null}
        </div>
    );
}

export default function Dashboard({ title, description, topSlot }: DashboardProps) {
    const router = useRouter();
    const { filteredMenu } = useMenuContext();
    const [quickLinks, setQuickLinks] = useState<DashboardQuickLink[]>(() => {
        if (typeof window === 'undefined') {
            return defaultQuickLinks;
        }

        try {
            const stored = window.localStorage.getItem(QUICK_LINK_STORAGE_KEY);
            if (!stored) {
                return defaultQuickLinks;
            }

            const parsed = JSON.parse(stored);
            const safeLinks = toStorageSafeLinks(parsed);
            return safeLinks.length > 0 ? safeLinks : defaultQuickLinks;
        } catch (error) {
            console.error('Failed to load dashboard quick links:', error);
            return defaultQuickLinks;
        }
    });
    const [draft, setDraft] = useState({ label: '', path: '', icon: 'link' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedPageId, setSelectedPageId] = useState('');
    const [message, setMessage] = useState('');
    const [isSettingsMode, setIsSettingsMode] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    useEffect(() => {
        try {
            window.localStorage.setItem(QUICK_LINK_STORAGE_KEY, JSON.stringify(quickLinks));
        } catch (error) {
            console.error('Failed to save dashboard quick links:', error);
        }
    }, [quickLinks]);

    const availablePages = useMemo(() => {
        const flat = flattenMenuLinks(filteredMenu);
        const seenPaths = new Set<string>();

        return flat.filter((item) => {
            if (seenPaths.has(item.path)) {
                return false;
            }

            seenPaths.add(item.path);
            return true;
        });
    }, [filteredMenu]);

    const addablePages = useMemo(
        () => availablePages.filter((page) => !quickLinks.some((link) => link.path === page.path)),
        [availablePages, quickLinks],
    );

    const selectedPage = useMemo(
        () => addablePages.find((page) => page.id === selectedPageId) ?? null,
        [addablePages, selectedPageId],
    );

    const resetDraft = () => {
        setDraft({ label: '', path: '', icon: 'link' });
        setEditingId(null);
    };

    const resetAddSelection = () => {
        setSelectedPageId('');
    };

    const showMessage = (value: string) => {
        setMessage(value);
        window.setTimeout(() => setMessage(''), 1800);
    };

    const handleAddQuickLink = () => {
        if (!selectedPage) {
            showMessage('?곕떽?????륁뵠筌왖???醫뤾문??뤾쉭??');
            return;
        }

        if (quickLinks.some((item) => item.path === selectedPage.path)) {
            showMessage('??? ?곕떽?????륁뵠筌왖??낅빍??');
            return;
        }

        const next: DashboardQuickLink = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: selectedPage.label,
            path: selectedPage.path,
            icon: selectedPage.icon || 'link',
        };

        setQuickLinks((prev) => [...prev, next]);
        resetAddSelection();
        showMessage('??쥓????猷?甕곌쑵????곕떽???됰뮸??덈뼄.');
    };

    const handleSaveEditedQuickLink = () => {
        const label = draft.label.trim();
        const path = normalizePath(draft.path);
        const icon = draft.icon.trim() || 'link';

        if (!editingId || !label || !path) {
            showMessage('??已ユ?野껋럥以덄몴???낆젾??뤾쉭??');
            return;
        }

        setQuickLinks((prev) =>
            prev.map((item) => (item.id === editingId ? { ...item, label, path, icon } : item)),
        );
        resetDraft();
        showMessage('??쥓????猷?甕곌쑵?????륁젟??됰뮸??덈뼄.');
    };

    const handleEditQuickLink = (item: DashboardQuickLink) => {
        setEditingId(item.id);
        setDraft({ label: item.label, path: item.path, icon: item.icon || 'link' });
        setSelectedPageId('');
        setIsSettingsMode(true);
    };

    const handleDeleteQuickLink = (id: string) => {
        setQuickLinks((prev) => prev.filter((item) => item.id !== id));
        if (editingId === id) {
            resetDraft();
        }
        showMessage('??쥓????猷?甕곌쑵????????됰뮸??덈뼄.');
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setQuickLinks((prev) => {
            const oldIndex = prev.findIndex((item) => item.id === active.id);
            const newIndex = prev.findIndex((item) => item.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    };

    const toggleSettingsMode = () => {
        setIsSettingsMode((prev) => {
            const next = !prev;
            if (!next) {
                resetDraft();
                resetAddSelection();
            }
            return next;
        });
    };

    const settingsGridColumns =
        isSettingsMode && editingId
            ? 'minmax(280px, 1.1fr) minmax(280px, 0.95fr)'
            : 'minmax(320px, 1fr)';

    return (
        <main id="content-area" style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
            {topSlot ? <div style={{ marginBottom: '24px' }}>{topSlot}</div> : null}

            <div className="page-info" style={{ marginBottom: '28px' }}>
                <h1
                    id="view-title"
                    className="page-title"
                    style={{
                        fontSize: '1.8rem',
                        fontWeight: 800,
                        color: 'var(--text-bright)',
                        letterSpacing: '-0.03em',
                    }}
                >
                    {title}
                </h1>
                <p
                    id="view-desc"
                    className="page-desc"
                    style={{ color: 'var(--text-muted)', marginTop: '6px' }}
                >
                    {description}
                </p>
            </div>

            <section className="data-panel" style={panelStyle}>
                <div style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }} />

                <div
                    style={{
                        padding: '14px 20px 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        minWidth: 0,
                    }}
                >
                    {message ? (
                        <span
                            style={{
                                color: '#c7d2fe',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                marginRight: 'auto',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {message}
                        </span>
                    ) : (
                        <div style={{ marginRight: 'auto' }} />
                    )}

                    <SectionIconToggleButton
                        icon={isSettingsMode ? 'xmark' : 'gear'}
                        title={isSettingsMode ? '??쇱젟 筌뤴뫀諭???る┛' : '??쇱젟 筌뤴뫀諭???용┛'}
                        active={isSettingsMode}
                        onClick={toggleSettingsMode}
                    />
                </div>

                {isSettingsMode ? (
                    <div
                        style={{
                            padding: '12px 20px 16px',
                            borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
                            background:
                                'linear-gradient(180deg, rgba(4, 10, 18, 0.22) 0%, rgba(4, 10, 18, 0.08) 100%)',
                        }}
                    >
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: settingsGridColumns,
                                gap: 12,
                            }}
                        >
                            <section style={settingsCardStyle}>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                        marginBottom: 10,
                                    }}
                                >
                                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f8fafc' }}>
                                        筌롫뗀??癒?퐣 ?곕떽?
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                                        {addablePages.length}揶???μ벉
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gap: 10 }}>
                                    <select
                                        value={selectedPageId}
                                        onChange={(event) => setSelectedPageId(event.target.value)}
                                        style={fieldStyle}
                                    >
                                        <option value="">?곕떽?????륁뵠筌왖 ?醫뤾문</option>
                                        {addablePages.map((page) => (
                                            <option key={page.id} value={page.id}>
                                                {page.label}
                                            </option>
                                        ))}
                                    </select>

                                    <div
                                        style={{
                                            minHeight: 56,
                                            padding: '10px 12px',
                                            borderRadius: 12,
                                            border: '1px solid rgba(148, 163, 184, 0.12)',
                                            background: 'rgba(2, 6, 23, 0.34)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                        }}
                                    >
                                        {selectedPage ? (
                                            <>
                                                <span
                                                    style={{
                                                        width: 30,
                                                        height: 30,
                                                        borderRadius: 10,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: 'rgba(99, 102, 241, 0.16)',
                                                        color: '#c7d2fe',
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    <i className={`fa-solid fa-${selectedPage.icon || 'link'}`} />
                                                </span>
                                                <div style={{ minWidth: 0 }}>
                                                    <div
                                                        style={{
                                                            fontSize: '0.8rem',
                                                            fontWeight: 700,
                                                            color: '#f8fafc',
                                                            lineHeight: 1.25,
                                                        }}
                                                    >
                                                        {selectedPage.label}
                                                    </div>
                                                    <div
                                                        style={{
                                                            marginTop: 3,
                                                            fontSize: '0.72rem',
                                                            color: 'var(--text-dim)',
                                                            wordBreak: 'break-all',
                                                        }}
                                                    >
                                                        {selectedPage.path}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                                ??륁뵠筌왖???醫뤾문??롢늺 野껋럥以덂첎? ??뽯뻻??몃빍??
                                            </span>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button
                                            className="nav-btn"
                                            onClick={handleAddQuickLink}
                                            disabled={!selectedPage}
                                            style={{ ...primaryButtonStyle, minWidth: 72 }}
                                        >
                                            ?곕떽?
                                        </button>
                                        <button
                                            className="toggle-btn"
                                            onClick={resetAddSelection}
                                            style={{ ...secondaryButtonStyle, minWidth: 86 }}
                                        >
                                            ?醫뤾문 ??곸젫
                                        </button>
                                    </div>
                                </div>
                            </section>

                            {editingId ? (
                                <section style={settingsCardStyle}>
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        <input
                                            value={draft.label}
                                            onChange={(event) =>
                                                setDraft((prev) => ({ ...prev, label: event.target.value }))
                                            }
                                            placeholder="버튼 이름"
                                            style={fieldStyle}
                                        />
                                        <input
                                            value={draft.path}
                                            onChange={(event) =>
                                                setDraft((prev) => ({ ...prev, path: event.target.value }))
                                            }
                                            placeholder="이동 경로 예: /admin/photos"
                                            style={fieldStyle}
                                        />
                                        <input
                                            value={draft.icon}
                                            onChange={(event) =>
                                                setDraft((prev) => ({ ...prev, icon: event.target.value }))
                                            }
                                            placeholder="아이콘 예: images"
                                            style={fieldStyle}
                                        />

                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <button
                                                className="nav-btn"
                                                onClick={handleSaveEditedQuickLink}
                                                style={{ ...primaryButtonStyle, minWidth: 88 }}
                                            >
                                                ????                                            </button>
                                            <button
                                                className="toggle-btn"
                                                onClick={resetDraft}
                                                style={{ ...secondaryButtonStyle, minWidth: 88 }}
                                            >
                                                ?紐꾩춿 ?띯뫁??                                            </button>
                                        </div>
                                    </div>
                                </section>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                <div style={{ padding: isSettingsMode ? '18px 20px' : '14px 20px 18px' }}>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={quickLinks.map((item) => item.id)} strategy={rectSortingStrategy}>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 96px))',
                                    gap: 10,
                                    justifyContent: 'start',
                                }}
                            >
                                {quickLinks.map((item) => (
                                    <QuickLinkCard
                                        key={item.id}
                                        item={item}
                                        isSettingsMode={isSettingsMode}
                                        onNavigate={(path) => router.push(path)}
                                        onEdit={handleEditQuickLink}
                                        onDelete={handleDeleteQuickLink}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            </section>
        </main>
    );
}
