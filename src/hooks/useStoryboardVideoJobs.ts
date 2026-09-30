'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import {
    VIDEO_STUDIO_JOBS_COLLECTION,
    type VideoStudioJob,
} from '@/lib/video-studio';

const JOB_SUBSCRIPTION_ERROR = '영상 작업 상태를 불러오지 못했습니다. 네트워크와 Firestore 접근 권한을 확인해 주세요.';
const JOB_QUERY_BATCH_SIZE = 30;

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
    const [retryEpoch, setRetryEpoch] = useState(0);
    const automaticRetryRef = useRef({ key: '', count: 0 });
    const subscriptionKey = [...new Set(jobIds.filter(Boolean))].sort().join('\u001f');
    const stableJobIds = useMemo(
        () => subscriptionKey ? subscriptionKey.split('\u001f') : [],
        [subscriptionKey],
    );

    useEffect(() => {
        if (!enabled || !stableJobIds.length) return undefined;

        const jobsById = new Map<string, VideoStudioJob>();
        const initializedJobIds = new Set<string>();
        let active = true;
        let subscriptionFailed = false;

        const jobIdBatches = Array.from(
            { length: Math.ceil(stableJobIds.length / JOB_QUERY_BATCH_SIZE) },
            (_, index) => stableJobIds.slice(index * JOB_QUERY_BATCH_SIZE, (index + 1) * JOB_QUERY_BATCH_SIZE),
        );
        const unsubscribes = jobIdBatches.map((batchJobIds) => onSnapshot(
            query(
                collection(db, VIDEO_STUDIO_JOBS_COLLECTION),
                where(documentId(), 'in', batchJobIds),
            ),
            (snapshot) => {
                if (!active) return;
                batchJobIds.forEach((jobId) => {
                    initializedJobIds.add(jobId);
                    jobsById.delete(jobId);
                });
                snapshot.docs.forEach((document) => {
                    jobsById.set(document.id, {
                        id: document.id,
                        ...(document.data() as Omit<VideoStudioJob, 'id'>),
                    });
                });

                setSnapshotState({
                    key: subscriptionKey,
                    jobs: stableJobIds.flatMap((id) => {
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
    }, [enabled, retryEpoch, stableJobIds, subscriptionKey]);

    const isCurrentSubscription = snapshotState.key === subscriptionKey;
    const hasNoJobs = stableJobIds.length === 0;
    const isReady = enabled && (
        hasNoJobs
        || (
            isCurrentSubscription
            && !snapshotState.error
            && snapshotState.initializedCount === stableJobIds.length
        )
    );
    const reconnect = useCallback(() => {
        setSnapshotState((current) => ({
            key: subscriptionKey,
            jobs: current.key === subscriptionKey ? current.jobs : [],
            initializedCount: 0,
            error: null,
        }));
        setRetryEpoch((current) => current + 1);
    }, [subscriptionKey]);
    const retry = useCallback(() => {
        automaticRetryRef.current = { key: subscriptionKey, count: 0 };
        reconnect();
    }, [reconnect, subscriptionKey]);

    useEffect(() => {
        if (automaticRetryRef.current.key !== subscriptionKey) {
            automaticRetryRef.current = { key: subscriptionKey, count: 0 };
        }
        if (isReady) {
            automaticRetryRef.current.count = 0;
            return undefined;
        }
        if (!enabled || !isCurrentSubscription || !snapshotState.error) return undefined;

        let reconnectRequested = false;
        const attemptReconnect = () => {
            if (reconnectRequested || automaticRetryRef.current.count >= 3) return;
            reconnectRequested = true;
            automaticRetryRef.current.count += 1;
            reconnect();
        };
        const delayMs = Math.min(12_000, 1_500 * 2 ** automaticRetryRef.current.count);
        const timer = window.setTimeout(attemptReconnect, delayMs);
        const handleOnline = () => attemptReconnect();
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') attemptReconnect();
        };
        window.addEventListener('online', handleOnline);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('online', handleOnline);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [enabled, isCurrentSubscription, isReady, reconnect, snapshotState.error, subscriptionKey]);

    return {
        jobs: enabled && isCurrentSubscription ? snapshotState.jobs : [],
        isReady,
        error: enabled && isCurrentSubscription ? snapshotState.error : null,
        retry,
    };
}
