import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { VIDEO_STUDIO_JOBS_COLLECTION, type VideoStudioJob } from '@/lib/video-studio';

function stamp(value: unknown): number {
    if (!value) return 0;
    if (typeof value === 'object' && value && 'toMillis' in value) {
        try { return (value as { toMillis: () => number }).toMillis(); } catch { return 0; }
    }
    if (typeof value === 'string') return new Date(value).getTime();
    if (value instanceof Date) return value.getTime();
    return 0;
}

export function useVideoStudioJobs(selectedProjectId: string | null) {
    const { currentUser } = useAuth();
    const [jobs, setJobs] = useState<VideoStudioJob[]>([]);
    
    // 이 배열은 클라이언트가 API를 통해 요청/처리한 작업의 ID들을 보관합니다.
    const [submittedJobIds, setSubmittedJobIds] = useState<string[]>([]);

    useEffect(() => {
        if (!currentUser) {
            queueMicrotask(() => setJobs([]));
            return undefined;
        }

        const q = query(
            collection(db, VIDEO_STUDIO_JOBS_COLLECTION),
            where('userId', '==', currentUser.uid)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setJobs(
                    snapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...(doc.data() as Omit<VideoStudioJob, 'id'>),
                    }))
                );
            },
            (error) => {
                console.error(error);
                toast.error('작업 현황을 불러오지 못했습니다.');
            }
        );

        return () => unsubscribe();
    }, [currentUser]);

    const projectJobs = useMemo(
        () =>
            jobs
                .filter((job) => !selectedProjectId || job.projectId === selectedProjectId)
                .sort((a, b) => stamp(b.updatedAt ?? b.createdAt) - stamp(a.updatedAt ?? a.createdAt)),
        [jobs, selectedProjectId]
    );

    const latestProjectJob = projectJobs[0] ?? null;

    const pendingProjectJobCount = useMemo(
        () => projectJobs.filter((job) => job.status === 'queued' || job.status === 'running' || job.status === 'uploading').length,
        [projectJobs]
    );

    return {
        jobs,
        projectJobs,
        latestProjectJob,
        pendingProjectJobCount,
        submittedJobIds,
        setSubmittedJobIds,
    };
}
