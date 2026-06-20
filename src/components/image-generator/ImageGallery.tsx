'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { FaCopy, FaDownload, FaLayerGroup, FaPen, FaTrash } from 'react-icons/fa';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { toast } from 'sonner';
import { db, storage } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

export type GeneratedImage = {
    id: string;
    url: string;
    prompt: string;
    createdAt: Date;
    type?: 'image' | 'video';
    provider?: 'gemini' | 'grok';
};

interface Props {
    initialImages: GeneratedImage[];
    onSelect?: (image: GeneratedImage | null) => void;
    selectedId?: string | null;
    onUpdated?: (image: GeneratedImage) => void;
    onDeleted?: (id: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

function toDate(value: unknown) {
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        return value.toDate();
    }

    if (value instanceof Date) {
        return value;
    }

    return new Date();
}

function formatCreatedAt(value: Date) {
    return dateFormatter.format(value);
}

export default function ImageGallery({ initialImages, onSelect, selectedId, onUpdated, onDeleted }: Props) {
    const [images, setImages] = useState<GeneratedImage[]>(initialImages || []);
    const [localSelected, setLocalSelected] = useState<GeneratedImage | null>(null);
    const [loading, setLoading] = useState(true);

    const { currentUser } = useAuth();
    const currentSelectedId = selectedId || localSelected?.id;

    const handleSelect = (image: GeneratedImage | null) => {
        if (onSelect) {
            onSelect(image);
            return;
        }

        setLocalSelected(image);
    };

    useEffect(() => {
        if (!currentUser) {
            queueMicrotask(() => {
                setImages([]);
                setLoading(false);
            });
            return;
        }

        const q = query(
            collection(db, 'ai_generations'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(50),
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((snapshotDoc) => {
                const data = snapshotDoc.data();

                return {
                    id: snapshotDoc.id,
                    url: data.url,
                    prompt: data.prompt,
                    createdAt: toDate(data.createdAt),
                    type: data.type,
                    provider: data.provider,
                };
            }) as GeneratedImage[];

            setImages(docs);
            setLoading(false);
        }, (error) => {
            console.error('Gallery snapshot error:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const handleDelete = async (event: React.MouseEvent, image: GeneratedImage) => {
        event.stopPropagation();

        if (!confirm('이 생성 기록을 삭제할까요?')) return;

        try {
            await deleteDoc(doc(db, 'ai_generations', image.id));

            if (image.url) {
                await deleteObject(ref(storage, image.url)).catch(() => undefined);
            }

            toast.success('생성 기록을 삭제했습니다.');
            if (currentSelectedId === image.id) handleSelect(null);
            onDeleted?.(image.id);
        } catch (error) {
            console.error('Delete failed:', error);
            toast.error('삭제에 실패했습니다.');
        }
    };

    const handleEditPrompt = async (event: React.MouseEvent, image: GeneratedImage) => {
        event.stopPropagation();

        const nextPrompt = window.prompt('프롬프트를 수정하세요.', image.prompt || '');
        if (nextPrompt === null) return;

        const trimmed = nextPrompt.trim();
        if (!trimmed) {
            toast.error('프롬프트는 비워둘 수 없습니다.');
            return;
        }

        try {
            await updateDoc(doc(db, 'ai_generations', image.id), { prompt: trimmed });
            const updated = { ...image, prompt: trimmed };

            if (currentSelectedId === image.id) {
                handleSelect(updated);
            }

            onUpdated?.(updated);
            toast.success('프롬프트를 수정했습니다.');
        } catch (error) {
            console.error('Prompt edit failed:', error);
            toast.error('수정에 실패했습니다.');
        }
    };

    const handleDownload = async (event: React.MouseEvent, url: string, id: string) => {
        event.stopPropagation();

        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `generated-${id}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            toast.error('다운로드에 실패해 새 창으로 열었습니다.');
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const copyPrompt = async (event: React.MouseEvent, prompt: string) => {
        event.stopPropagation();

        try {
            await navigator.clipboard.writeText(prompt);
            toast.success('프롬프트를 복사했습니다.');
        } catch (error) {
            console.error('Clipboard copy failed:', error);
            toast.error('프롬프트 복사에 실패했습니다.');
        }
    };

    const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, image: GeneratedImage) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;

        event.preventDefault();
        handleSelect(image);
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--bg-elevated)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 p-4 backdrop-blur-md">
                <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-bright)]">
                    <FaLayerGroup className="text-[var(--primary)]" aria-hidden="true" />
                    생성 기록
                    <span className="text-xs font-normal text-[var(--text-muted)]">({images.length})</span>
                </h2>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--border-medium)]">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]" role="status" aria-live="polite">
                        <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                        <p className="text-xs">기록을 불러오는 중…</p>
                    </div>
                ) : images.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-[var(--text-muted)]">
                        <FaLayerGroup className="mb-3 text-3xl opacity-20" aria-hidden="true" />
                        <p className="text-xs">아직 생성된 기록이 없습니다.</p>
                    </div>
                ) : (
                    images.map((image) => (
                        <div
                            key={image.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelect(image)}
                            onKeyDown={(event) => handleCardKeyDown(event, image)}
                            className={`group relative flex cursor-pointer gap-3 rounded-xl border p-2 pr-24 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${
                                currentSelectedId === image.id
                                    ? 'border-[var(--primary)] bg-[var(--bg-card)] shadow-[0_0_15px_rgba(0,0,0,0.2)]'
                                    : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-card)]'
                            }`}
                            aria-label={`생성 기록 선택: ${image.prompt || '프롬프트 없음'}`}
                        >
                            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-black/20">
                                {image.type === 'video' ? (
                                    <video src={image.url} className="h-full w-full object-cover" muted aria-label="생성된 동영상 썸네일" />
                                ) : (
                                    <Image
                                        src={image.url}
                                        alt={image.prompt || '생성된 이미지'}
                                        fill
                                        className="object-cover"
                                        sizes="64px"
                                    />
                                )}
                                <div className="absolute left-1 top-1 flex items-center gap-1 rounded border border-white/10 bg-black/60 px-1.5 py-0.5 backdrop-blur-md">
                                    <i className={`text-[8px] ${image.type === 'video' ? 'fas fa-video text-purple-400' : 'fas fa-image text-blue-400'}`} aria-hidden="true" />
                                    <span className="text-[8px] font-bold uppercase text-white/90">{image.provider?.[0] || 'A'}</span>
                                </div>
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col justify-center">
                                <p className="mb-1 line-clamp-2 text-xs font-medium leading-snug text-[var(--text-main)]">
                                    {image.prompt}
                                </p>
                                <p className="font-mono text-[10px] text-[var(--text-dim)]">
                                    {formatCreatedAt(image.createdAt)}
                                </p>
                            </div>

                            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1 rounded-lg bg-[var(--bg-card)]/90 p-1 opacity-100 shadow-sm backdrop-blur-sm transition-opacity">
                                <button
                                    type="button"
                                    onClick={(event) => copyPrompt(event, image.prompt)}
                                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--primary)] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                                    aria-label="프롬프트 복사"
                                    title="프롬프트 복사"
                                >
                                    <FaCopy size={10} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={(event) => handleEditPrompt(event, image)}
                                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-amber-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                                    aria-label="프롬프트 수정"
                                    title="프롬프트 수정"
                                >
                                    <FaPen size={10} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={(event) => handleDownload(event, image.url, image.id)}
                                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-blue-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                    aria-label="파일 다운로드"
                                    title="파일 다운로드"
                                >
                                    <FaDownload size={10} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={(event) => handleDelete(event, image)}
                                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
                                    aria-label="생성 기록 삭제"
                                    title="생성 기록 삭제"
                                >
                                    <FaTrash size={10} aria-hidden="true" />
                                </button>
                            </div>

                            {currentSelectedId === image.id ? (
                                <div className="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r-full bg-[var(--primary)]" />
                            ) : null}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
