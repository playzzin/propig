
import React, { useState } from 'react';
import { StickyNote, StickyNoteColor, TAG_COLOR_ORDER } from '@/types/stickyNote';
import { useDraggable } from '@dnd-kit/core';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { CSS } from '@dnd-kit/utilities';
import {
    NoteContainer,
    NoteHeader,
    NoteBody,
    NoteResizer,
    ActionButton,
    ColorDot,
    ActionsGroup,
    ColorsGroup,
} from '@/styles/StickyNotes.styles';

type StickyNoteCardProps = {
    note: StickyNote;
    isCollapsed: boolean;
    isMobileLayout?: boolean;
    onToggleCollapse: (noteId: string) => void;
    onSelect: () => void;
    onResizeStart: (e: React.PointerEvent) => void;
    onChangeContent: (value: string) => void;
    onChangeColor: (value: StickyNoteColor) => void;
    onTogglePin: () => void;
    onDelete: () => void;
};

const COLLAPSED_HEIGHT = 44;
const MAX_NOTE_LENGTH = 4000;

const getNoteTitle = (content: string) => {
    const normalized = content.replace(/\r\n/g, '\n');
    const [title = ''] = normalized.split('\n');
    return title.trim() || '새 메모';
};

export const StickyNoteCard = ({
    note,
    isCollapsed,
    isMobileLayout = false,
    onToggleCollapse,
    onSelect,
    onResizeStart,
    onChangeContent,
    onChangeColor,
    onTogglePin,
    onDelete,
}: StickyNoteCardProps) => {
    const [localContent, setLocalContent] = useState(note.content);
    const [isEditing, setIsEditing] = useState(false);
    const isComposingRef = React.useRef(false);

    const commitContent = React.useCallback((nextContent: string) => {
        if (nextContent === note.content) return;
        onChangeContent(nextContent);
    }, [note.content, onChangeContent]);

    React.useEffect(() => {
        if (!isEditing && !isComposingRef.current && note.content !== localContent) {
            setLocalContent(note.content);
        }
    }, [note.content, isEditing, localContent]);

    React.useEffect(() => {
        if (localContent === note.content || isComposingRef.current) return;

        const timer = window.setTimeout(() => {
            commitContent(localContent);
        }, 500);

        return () => window.clearTimeout(timer);
    }, [commitContent, localContent, note.content]);

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: note.id,
    });

    const firstLine = getNoteTitle(localContent);

    const beginEditing = () => {
        onSelect();
        setIsEditing(true);
    };

    const finishEditing = () => {
        setIsEditing(false);
        if (!isComposingRef.current) {
            commitContent(localContent);
        }
    };

    const beginComposition = () => {
        isComposingRef.current = true;
    };

    const finishComposition = (content: string) => {
        const nextContent = content.slice(0, MAX_NOTE_LENGTH);
        isComposingRef.current = false;
        setLocalContent(nextContent);
        commitContent(nextContent);
    };

    const style: React.CSSProperties = {
        position: isMobileLayout ? 'relative' : 'absolute',
        left: isMobileLayout ? 'auto' : note.x,
        top: isMobileLayout ? 'auto' : note.y,
        width: isMobileLayout ? '100%' : note.w,
        height: isCollapsed ? COLLAPSED_HEIGHT : (isMobileLayout ? Math.max(320, Math.min(note.h, 520)) : note.h),
        zIndex: note.zIndex,
        transform: isMobileLayout ? undefined : CSS.Translate.toString(transform),
        touchAction: isMobileLayout ? 'auto' : 'none',
        opacity: isDragging ? 0.8 : 1,
        transition: isCollapsed ? 'height 0.2s ease' : undefined,
        overflow: 'hidden',
    };

    const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();

        try {
            if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
                throw new Error('Clipboard API unavailable');
            }

            await navigator.clipboard.writeText(localContent);
            toast.success(
                localContent.trim() ? '메모를 클립보드에 복사했습니다.' : '빈 메모를 클립보드에 복사했습니다.',
                { duration: 2000 }
            );
        } catch {
            toast.error('클립보드 복사에 실패했습니다.', { duration: 2500 });
        }
    };

    return (
        <NoteContainer
            ref={setNodeRef}
            $color={note.color}
            style={style}
            data-sticky-note-id={note.id}
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                onSelect();
            }}
            {...(!isMobileLayout ? attributes : {})}
        >
            <NoteHeader
                {...(!isMobileLayout ? listeners : {})}
                style={{ cursor: isMobileLayout ? 'default' : 'grab', touchAction: isMobileLayout ? 'auto' : 'none', minHeight: 44, flexShrink: 0 }}
            >
                <ActionsGroup>
                    <ActionButton
                        type="button"
                        title={isCollapsed ? '펼치기' : '접기'}
                        $active={isCollapsed}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleCollapse(note.id);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
                    </ActionButton>

                    <ActionButton
                        type="button"
                        title="클립보드 복사"
                        onClick={handleCopy}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <i className="fa-solid fa-copy" />
                    </ActionButton>

                    <ActionButton
                        type="button"
                        title={note.isPinned ? '상단 고정 해제' : '상단 고정'}
                        $active={note.isPinned}
                        onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin();
                            toast.success(note.isPinned ? '메모 고정을 해제했습니다.' : '메모를 상단에 고정했습니다.', { duration: 1600 });
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <i className="fa-solid fa-thumbtack" />
                    </ActionButton>

                    <ActionButton
                        type="button"
                        title="메모 삭제"
                        onClick={async (e) => {
                            e.stopPropagation();
                            const result = await Swal.fire({
                                title: '정말 삭제하시겠습니까?',
                                text: "삭제된 메모는 복구할 수 없습니다.",
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonColor: '#ef4444',
                                cancelButtonColor: '#3085d6',
                                confirmButtonText: '삭제',
                                cancelButtonText: '취소',
                                background: '#1f2937',
                                color: '#ffffff'
                            });

                            if (result.isConfirmed) {
                                onDelete();
                                toast.success('메모가 삭제되었습니다', {
                                    description: '휴지통으로 이동되었습니다.',
                                    duration: 3000,
                                });
                            }
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{ color: '#ef4444' }}
                    >
                        <i className="fa-solid fa-trash-can" />
                    </ActionButton>
                </ActionsGroup>

                {isCollapsed ? (
                    <span style={{
                        flex: 1,
                        marginLeft: 8,
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        color: 'rgba(0,0,0,0.7)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {note.isPinned ? '고정 · ' : ''}{firstLine}
                    </span>
                ) : (
                    <ColorsGroup onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                        {TAG_COLOR_ORDER.map((c) => (
                            <ColorDot
                                key={c}
                                type="button"
                                $color={c}
                                $active={note.color === c}
                                title={c}
                                onClick={() => onChangeColor(c)}
                            />
                        ))}
                    </ColorsGroup>
                )}
            </NoteHeader>

            {!isCollapsed && (
                <>
                    <NoteBody
                        value={localContent}
                        placeholder={`제목\n메모 내용을 입력하세요...`}
                        onFocus={beginEditing}
                        onBlur={finishEditing}
                        maxLength={MAX_NOTE_LENGTH}
                        aria-label="메모 내용"
                        onChange={(e) => setLocalContent(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                        onCompositionStart={beginComposition}
                        onCompositionEnd={(e) => finishComposition(e.currentTarget.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                    />

                    {!isMobileLayout && (
                    <NoteResizer
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            onResizeStart(e);
                        }}
                        title="크기 조절"
                    />
                    )}
                </>
            )}
        </NoteContainer>
    );
};
