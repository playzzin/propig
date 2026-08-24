'use client';

import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { z } from 'zod';
import { db } from '@/firebase/config';
import { asiaNortheastFunctions } from '@/firebase/functions';
import { emoticonJobSchema, type EmoticonJob } from '@/schemas/emoticonStudio';

export const EMOTICON_JOB_HISTORY_PAGE_SIZE = 36;
const EMOTICON_JOB_HISTORY_MAX_PAGE_SIZE = 60;

const historyQuerySchema = z.object({
  userId: z.string().trim().min(1).max(128),
  pageSize: z.number().int().min(1).max(EMOTICON_JOB_HISTORY_MAX_PAGE_SIZE),
});

const deletionResultSchema = z.object({
  jobId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  deleted: z.boolean(),
  deletedAssets: z.number().int().nonnegative(),
  unlinkedProjectItem: z.boolean(),
  updatedBatch: z.boolean(),
});

export type EmoticonJobHistoryCursor = QueryDocumentSnapshot<DocumentData>;

export type EmoticonJobHistoryPage = {
  jobs: EmoticonJob[];
  nextCursor: EmoticonJobHistoryCursor | null;
  hasMore: boolean;
};

export type EmoticonJobDeletionResult = z.infer<typeof deletionResultSchema>;

function parseHistoryJob(snapshot: QueryDocumentSnapshot<DocumentData>): EmoticonJob | null {
  const parsed = emoticonJobSchema.safeParse({ id: snapshot.id, ...snapshot.data() });
  if (!parsed.success) {
    console.warn('[Emoticon Studio] Ignored an invalid job-history snapshot.', parsed.error.issues);
    return null;
  }
  return parsed.data;
}

export async function listEmoticonJobHistoryPage(params: {
  userId: string;
  pageSize?: number;
  cursor?: EmoticonJobHistoryCursor | null;
}): Promise<EmoticonJobHistoryPage> {
  const input = historyQuerySchema.parse({
    userId: params.userId,
    pageSize: params.pageSize ?? EMOTICON_JOB_HISTORY_PAGE_SIZE,
  });
  const constraints: QueryConstraint[] = [
    orderBy('createdAt', 'desc'),
    orderBy(documentId(), 'desc'),
  ];
  if (params.cursor) constraints.push(startAfter(params.cursor));
  constraints.push(limit(input.pageSize + 1));

  const snapshot = await getDocs(query(
    collection(db, 'users', input.userId, 'emoticonJobs'),
    ...constraints,
  ));
  const pageDocuments = snapshot.docs.slice(0, input.pageSize);

  return {
    jobs: pageDocuments
      .map(parseHistoryJob)
      .filter((job): job is EmoticonJob => Boolean(job)),
    nextCursor: pageDocuments.at(-1) ?? null,
    hasMore: snapshot.docs.length > input.pageSize,
  };
}

export async function deleteEmoticonJobSafely(jobId: string): Promise<EmoticonJobDeletionResult> {
  const normalizedJobId = jobId.trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(normalizedJobId)) {
    throw new Error('삭제할 작업 번호가 올바르지 않습니다.');
  }
  const callable = httpsCallable<
    { jobId: string },
    EmoticonJobDeletionResult
  >(asiaNortheastFunctions, 'deleteEmoticonJobSafely');
  const response = await callable({ jobId: normalizedJobId });
  return deletionResultSchema.parse(response.data);
}
