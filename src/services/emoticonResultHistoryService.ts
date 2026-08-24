import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '@/firebase/config';
import { emoticonJobSchema, type EmoticonJob } from '@/schemas/emoticonStudio';

export const EMOTICON_RESULT_HISTORY_PAGE_SIZE = 8;
const EMOTICON_RESULT_HISTORY_MAX_PAGE_SIZE = 20;

const resultHistoryQuerySchema = z.object({
  userId: z.string().trim().min(1).max(160),
  projectId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  projectItemId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  pageSize: z.number().int().min(1).max(EMOTICON_RESULT_HISTORY_MAX_PAGE_SIZE),
});

export type EmoticonResultHistoryCursor = QueryDocumentSnapshot<DocumentData>;

export type EmoticonResultHistoryPage = {
  jobs: EmoticonJob[];
  nextCursor: EmoticonResultHistoryCursor | null;
  hasMore: boolean;
};

function parseCompletedJob(snapshot: QueryDocumentSnapshot<DocumentData>): EmoticonJob | null {
  const parsed = emoticonJobSchema.safeParse({ id: snapshot.id, ...snapshot.data() });
  if (!parsed.success) {
    console.warn('[Emoticon Studio] Ignored an invalid result-history snapshot.', parsed.error.issues);
    return null;
  }
  return parsed.data.status === 'completed' ? parsed.data : null;
}

export async function listEmoticonResultHistoryPage(params: {
  userId: string;
  projectId: string;
  projectItemId: string;
  pageSize?: number;
  cursor?: EmoticonResultHistoryCursor | null;
}): Promise<EmoticonResultHistoryPage> {
  const input = resultHistoryQuerySchema.parse({
    userId: params.userId,
    projectId: params.projectId,
    projectItemId: params.projectItemId,
    pageSize: params.pageSize ?? EMOTICON_RESULT_HISTORY_PAGE_SIZE,
  });
  const constraints: QueryConstraint[] = [
    where('projectId', '==', input.projectId),
    where('projectItemId', '==', input.projectItemId),
    where('status', '==', 'completed'),
    orderBy('completedAt', 'desc'),
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
      .map(parseCompletedJob)
      .filter((job): job is EmoticonJob => Boolean(job)),
    nextCursor: pageDocuments.at(-1) ?? null,
    hasMore: snapshot.docs.length > input.pageSize,
  };
}
