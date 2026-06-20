import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { VIDEO_STUDIO_PROJECTS_COLLECTION, type VideoStudioProject } from '@/lib/video-studio';

function stamp(value: unknown): number {
    if (!value) return 0;
    if (typeof value === 'object' && value && 'toMillis' in value) {
        try { return (value as { toMillis: () => number }).toMillis(); } catch { return 0; }
    }
    if (typeof value === 'string') return new Date(value).getTime();
    if (value instanceof Date) return value.getTime();
    return 0;
}

export function useVideoStudioProjects() {
    const { currentUser } = useAuth();
    const [projects, setProjects] = useState<VideoStudioProject[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser) return undefined;

        const q = query(
            collection(db, VIDEO_STUDIO_PROJECTS_COLLECTION),
            where('userId', '==', currentUser.uid)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setProjects(
                    snapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...(doc.data() as Omit<VideoStudioProject, 'id'>),
                    }))
                );
            },
            (error) => {
                console.error(error);
                toast.error('프로젝트 목록을 불러오지 못했습니다.');
            }
        );

        return () => unsubscribe();
    }, [currentUser]);

    const sortedProjects = useMemo(
        () => [...projects].sort((a, b) => stamp(b.updatedAt ?? b.createdAt) - stamp(a.updatedAt ?? a.createdAt)),
        [projects]
    );

    const selectedProject = useMemo(
        () => sortedProjects.find((p) => p.id === selectedProjectId) ?? null,
        [selectedProjectId, sortedProjects]
    );

    // Auto-select the first project if none is selected
    useEffect(() => {
        if (!selectedProjectId && sortedProjects.length > 0) {
            queueMicrotask(() => setSelectedProjectId(sortedProjects[0].id));
        }
    }, [selectedProjectId, sortedProjects]);

    return {
        projects: sortedProjects,
        selectedProjectId,
        setSelectedProjectId,
        selectedProject,
    };
}
