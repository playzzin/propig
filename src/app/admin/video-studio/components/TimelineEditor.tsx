'use client';

import { useState } from 'react';
import { type VideoStudioClip } from '@/lib/video-studio';

interface TimelineEditorProps {
    clips: VideoStudioClip[];
    onReorder: (clipIds: string[]) => void;
    onDelete: (clipId: string) => void;
    onSelect: (clipId: string) => void;
    selectedClipId?: string | null;
}

function moveClip(clips: VideoStudioClip[], fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= clips.length) {
        return clips;
    }

    const nextClips = [...clips];
    const [movedClip] = nextClips.splice(fromIndex, 1);
    nextClips.splice(toIndex, 0, movedClip);
    return nextClips;
}

export function TimelineEditor({ clips, onReorder, onDelete, onSelect, selectedClipId }: TimelineEditorProps) {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === dropIndex) return;

        const newClips = [...clips];
        const [draggedClip] = newClips.splice(draggedIndex, 1);
        newClips.splice(dropIndex, 0, draggedClip);

        onReorder(newClips.map(clip => clip.id));
        setDraggedIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number, clip: VideoStudioClip) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(clip.id);
            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            onDelete(clip.id);
            return;
        }

        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return;
        }

        event.preventDefault();

        const nextIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1;
        const reorderedClips = moveClip(clips, index, nextIndex);

        if (reorderedClips !== clips) {
            onReorder(reorderedClips.map((item) => item.id));
        }
    };

    return (
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h3>타임라인</h3>
            <p style={{ margin: '0 0 10px', color: '#666', fontSize: '12px' }}>
                엔터 또는 스페이스로 선택하고, 좌우 화살표로 순서를 바꾸고, Delete 또는 Backspace로 삭제할 수 있습니다.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', minHeight: '100px', padding: '10px', border: '2px dashed #ccc', borderRadius: '4px' }}>
                {clips.map((clip, index) => (
                    <div
                        key={clip.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selectedClipId === clip.id}
                        aria-label={`${clip.title} 클립 선택. 현재 ${index + 1}번째 순서.`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onSelect(clip.id)}
                        onKeyDown={(event) => handleKeyDown(event, index, clip)}
                        style={{
                            width: '120px',
                            height: '80px',
                            border: selectedClipId === clip.id ? '3px solid #007bff' : '1px solid #ccc',
                            borderRadius: '4px',
                            backgroundColor: '#f8f9fa',
                            cursor: 'grab',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            opacity: draggedIndex === index ? 0.5 : 1,
                        }}
                    >
                        {clip.posterUrl && (
                            <img
                                src={clip.posterUrl}
                                alt={clip.title}
                                width={120}
                                height={48}
                                style={{ width: '100%', height: '60%', objectFit: 'cover', borderRadius: '2px' }}
                            />
                        )}
                        <div style={{ fontSize: '10px', textAlign: 'center', padding: '2px' }}>
                            {clip.title}
                        </div>
                        <button
                            type="button"
                            aria-label={`${clip.title} 클립 삭제`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(clip.id);
                            }}
                            style={{
                                position: 'absolute',
                                top: '-5px',
                                right: '-5px',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '10px',
                            }}
                        >
                            ×
                        </button>
                    </div>
                ))}
                {clips.length === 0 && (
                    <div style={{ color: '#666', fontStyle: 'italic' }}>
                        클립을 생성하여 타임라인에 추가하세요
                    </div>
                )}
            </div>
        </div>
    );
}
