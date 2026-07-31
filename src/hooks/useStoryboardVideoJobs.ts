'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import {
    VIDEO_STUDIO_JOBS_COLLECTION,
    type VideoStudioJob,
} from '@/lib/video-studio';

const JOB_SUBSCRIPTION_ERROR = '영상 작업 상태를 불러오지 못했습니다. 네트워크와 Firestore 접근 권한을 확인해 주세요.';

type VideoJobSnapshotState = {
    key: string;
    jobs: VideoStudioJob[];
    initializedCount: number;
    error: string | null;
};

const EMPTY_SNAPSHOT_STATE: VideoJobSnapshotState = {
    key: '',
    jobs: [],
    initializedCount: 0,
    error: null,
};

export function useStoryboardVideoJobs(jobIds: string[], enabled: boolean) {
    const [snapshotState, setSnapshotState] = useState<VideoJobSnapshotState>(
        EMPTY_SNAPSHOT_STATE,
    );
    const subscriptionKey = jobIds.join('\u001f');

    useEffect(() => {
        if (!enabled || !jobIds.length) return undefined;

        const jobsById = new Map<string, VideoStudioJob>();
        const initializedJobIds = new Set<string>();
        let active = true;
        let subscriptionFailed = false;

        const unsubscribes = jobIds.map((jobId) => onSnapshot(
            doc(db, VIDEO_STUDIO_JOBS_COLLECTION, jobId),
            (snapshot) => {
                if (!active) return;
                initializedJobIds.add(jobId);
                if (snapshot.exists()) {
                    jobsById.set(jobId, {
                        id: snapshot.id,
                        ...(snapshot.data() as Omit<VideoStudioJob, 'id'>),
                    });
                } else {
                    jobsById.delete(jobId);
                }

                setSnapshotState({
                    key: subscriptionKey,
                    jobs: jobIds.flatMap((id) => {
                        const job = jobsById.get(id);
                        return job ? [job] : [];
                    }),
                    initializedCount: initializedJobIds.size,
                    error: subscriptionFailed ? JOB_SUBSCRIPTION_ERROR : null,
                });
            },
            (error) => {
                if (!active) return;
                subscriptionFailed = true;
                console.error('[StoryboardVideo] job subscription failed', error);
                setSnapshotState((current) => ({
                    key: subscriptionKey,
                    jobs: current.key === subscriptionKey ? current.jobs : [],
                    initializedCount: current.key === subscriptionKey
                        ? current.initializedCount
                        : 0,
                    error: JOB_SUBSCRIPTION_ERROR,
                }));
            },
        ));

        return () => {
            active = false;
            unsubscribes.forEach((unsubscribe) => unsubscribe());
        };
    }, [enabled, jobIds, subscriptionKey]);

    const isCurrentSubscription = snapshotState.key === subscriptionKey;
    const hasNoJobs = jobIds.length === 0;

    return {
        jobs: enabled && isCurrentSubscription ? snapshotState.jobs : [],
        isReady: enabled && (
            hasNoJobs
            || (
                isCurrentSubscription
                && !snapshotState.error
                && snapshotState.initializedCount === jobIds.length
            )
        ),
        error: enabled && isCurrentSubscription ? snapshotState.error : null,
    };
}
