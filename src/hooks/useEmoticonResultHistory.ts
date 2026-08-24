'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMOTICON_RESULT_HISTORY_PAGE_SIZE,
  listEmoticonResultHistoryPage,
  type EmoticonResultHistoryCursor,
} from '@/services/emoticonResultHistoryService';
import type { EmoticonJob } from '@/schemas/emoticonStudio';

type EmoticonResultHistoryState = {
  jobs: EmoticonJob[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string;
  hasMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

function mergeUniqueJobs(current: EmoticonJob[], incoming: EmoticonJob[]): EmoticonJob[] {
  const jobsById = new Map(current.map((job) => [job.id, job]));
  incoming.forEach((job) => jobsById.set(job.id, job));
  return Array.from(jobsById.values());
}

export function useEmoticonResultHistory(params: {
  userId: string;
  projectId: string;
  projectItemId: string;
}): EmoticonResultHistoryState {
  const [jobs, setJobs] = useState<EmoticonJob[]>([]);
  const [cursor, setCursor] = useState<EmoticonResultHistoryCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const requestVersionRef = useRef(0);

  const fetchPage = useCallback(async (
    pageCursor: EmoticonResultHistoryCursor | null,
    append: boolean,
    requestVersion: number,
  ) => {
    const page = await listEmoticonResultHistoryPage({
      userId: params.userId,
      projectId: params.projectId,
      projectItemId: params.projectItemId,
      pageSize: EMOTICON_RESULT_HISTORY_PAGE_SIZE,
      cursor: pageCursor,
    });
    if (requestVersionRef.current !== requestVersion) return;
    setJobs((current) => append ? mergeUniqueJobs(current, page.jobs) : page.jobs);
    setCursor(page.nextCursor);
    setHasMore(page.hasMore);
    setError('');
  }, [params.projectId, params.projectItemId, params.userId]);

  const reload = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setIsLoading(true);
    setIsLoadingMore(false);
    setError('');
    try {
      await fetchPage(null, false, requestVersion);
    } catch {
      if (requestVersionRef.current !== requestVersion) return;
      setError('완성 기록을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      if (requestVersionRef.current === requestVersion) setIsLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || isLoading || isLoadingMore) return;
    const requestVersion = requestVersionRef.current;
    setIsLoadingMore(true);
    setError('');
    try {
      await fetchPage(cursor, true, requestVersion);
    } catch {
      if (requestVersionRef.current !== requestVersion) return;
      setError('이전 완성 기록을 더 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (requestVersionRef.current === requestVersion) setIsLoadingMore(false);
    }
  }, [cursor, fetchPage, hasMore, isLoading, isLoadingMore]);

  useEffect(() => {
    if (!params.userId || !params.projectId || !params.projectItemId) {
      requestVersionRef.current += 1;
      setJobs([]);
      setCursor(null);
      setHasMore(false);
      setIsLoading(false);
      setIsLoadingMore(false);
      setError('');
      return;
    }
    setJobs([]);
    setCursor(null);
    setHasMore(false);
    setIsLoadingMore(false);
    setError('');
    void reload();
    return () => {
      requestVersionRef.current += 1;
    };
  }, [params.projectId, params.projectItemId, params.userId, reload]);

  return { jobs, isLoading, isLoadingMore, error, hasMore, reload, loadMore };
}
