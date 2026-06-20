import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/firebase/config';
import { VIDEO_STUDIO_CLIPS_COLLECTION, type VideoStudioClip } from '@/lib/video-studio';

function stamp(value: unknown): number {
    if (!value) return 0;
    if (typeof value === 'object' && value && 'toMillis' in value) {
        try { return (value as { toMillis: () => number }).toMillis(); } catch { return 0; }
    }
    if (typeof value === 'string') return new Date(value).getTime();
    if (value instanceof Date) return value.getTime();
    return 0;
}

export function useVideoStudioClips(projectId: string | null) {
    const [clips, setClips] = useState<VideoStudioClip[]>([]);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [mergeSelection, setMergeSelection] = useState<string[]>([]);

    useEffect(() => {
        if (!projectId) {
            queueMicrotask(() => setClips([]));
            return undefined;
        }

        const q = query(
            collection(db, VIDEO_STUDIO_CLIPS_COLLECTION),
            where('projectId', '==', projectId)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setClips(
                    snapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...(doc.data() as Omit<VideoStudioClip, 'id'>),
                    }))
                );
            },
            (error) => {
                console.error(error);
                toast.error('타임라인 컷을 불러오지 못했습니다.');
            }
        );

        return () => unsubscribe();
    }, [projectId]);

    const sortedClips = useMemo(
        () => [...clips].sort((a, b) => a.sequence - b.sequence || stamp(a.createdAt) - stamp(b.createdAt)),
        [clips]
    );

    const selectedClip = useMemo(
        () => sortedClips.find((clip) => clip.id === selectedClipId) ?? null,
        [selectedClipId, sortedClips]
    );

    const readyClipCount = useMemo(
        () => sortedClips.filter((clip) => clip.status === 'ready').length,
        [sortedClips]
    );

    const mergeClips = useMemo(
        () => sortedClips.filter((clip) => mergeSelection.includes(clip.id)),
        [mergeSelection, sortedClips]
    );

    // Auto-select latest clip if none selected
    useEffect(() => {
        if (!selectedClipId && sortedClips.length > 0) {
            queueMicrotask(() => setSelectedClipId(sortedClips[sortedClips.length - 1].id));
        }
    }, [selectedClipId, sortedClips]);

    // Clean up merge selections if clips disappear
    useEffect(() => {
        queueMicrotask(() => {
            setMergeSelection((prev) => prev.filter((id) => sortedClips.some((clip) => clip.id === id)));
        });
    }, [sortedClips]);

    return {
        clips: sortedClips,
        selectedClipId,
        setSelectedClipId,
        selectedClip,
        mergeSelection,
        setMergeSelection,
        mergeClips,
        readyClipCount,
    };
}
