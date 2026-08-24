import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
    continueEmoticonProjectDeletion,
    EMOTICON_PROJECT_DELETION_MODES,
    isSafeEmoticonDeletionId,
    type EmoticonProjectDeletionMode,
} from '../emoticonStudio/deleteProject';
import { db } from '../firestore';

const OPERATION_COLLECTION = 'emoticonStudioProjectDeletions';
const RESUME_BATCH_SIZE = 20;
const RESUME_CONCURRENCY = 3;
const LEGACY_SCAN_PAGES = 10;
const SAFE_UID = /^[^/\\\u0000-\u001f\u007f]{1,128}$/;

type ResumeCandidate = {
    userId: string;
    projectId: string;
    mode: EmoticonProjectDeletionMode;
};

function parseCandidate(document: FirebaseFirestore.QueryDocumentSnapshot): ResumeCandidate | null {
    const data = document.data() || {};
    const userId = typeof data.userId === 'string' ? data.userId : '';
    const projectId = typeof data.projectId === 'string' ? data.projectId : '';
    const mode = data.mode;
    if (
        !SAFE_UID.test(userId)
        || !isSafeEmoticonDeletionId(projectId)
        || !(EMOTICON_PROJECT_DELETION_MODES as readonly unknown[]).includes(mode)
        || !['processing', 'retryable_failed'].includes(String(data.status))
    ) return null;
    return { userId, projectId, mode: mode as EmoticonProjectDeletionMode };
}

async function findLegacyOperations(
    status: 'processing' | 'retryable_failed',
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
    const results: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (let page = 0; page < LEGACY_SCAN_PAGES && results.length < RESUME_BATCH_SIZE; page += 1) {
        let query: FirebaseFirestore.Query = db.collection(OPERATION_COLLECTION)
            .where('status', '==', status)
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(RESUME_BATCH_SIZE);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        results.push(...snapshot.docs.filter((document) => !document.data().nextAttemptAt));
        if (snapshot.size < RESUME_BATCH_SIZE) break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
    }
    return results.slice(0, RESUME_BATCH_SIZE);
}

export const resumeEmoticonProjectDeletions = onSchedule(
    {
        schedule: 'every 5 minutes',
        timeZone: 'UTC',
        region: 'asia-northeast3',
        timeoutSeconds: 540,
        memory: '1GiB',
        retryCount: 2,
    },
    async () => {
        const now = admin.firestore.Timestamp.now();
        const [snapshot, legacyProcessing, legacyFailed] = await Promise.all([
            db.collection(OPERATION_COLLECTION)
            .where('nextAttemptAt', '<=', admin.firestore.Timestamp.now())
            .orderBy('nextAttemptAt', 'asc')
            .limit(RESUME_BATCH_SIZE)
            .get(),
            findLegacyOperations('processing'),
            findLegacyOperations('retryable_failed'),
        ]);
        // Operations created before nextAttemptAt was introduced are adopted by
        // the same worker. Once touched, acquire/checkpoint writes nextAttemptAt.
        const documents = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        [...snapshot.docs, ...legacyProcessing, ...legacyFailed].forEach((document) => {
            const nextAttemptAtMs = document.data().nextAttemptAt?.toMillis?.();
            if (typeof nextAttemptAtMs === 'number' && nextAttemptAtMs > now.toMillis()) return;
            documents.set(document.id, document);
        });
        const candidates = [...documents.values()]
            .map(parseCandidate)
            .filter((candidate): candidate is ResumeCandidate => Boolean(candidate))
            .slice(0, RESUME_BATCH_SIZE);
        let completed = 0;
        let processing = 0;
        let failed = 0;
        for (let offset = 0; offset < candidates.length; offset += RESUME_CONCURRENCY) {
            const group = candidates.slice(offset, offset + RESUME_CONCURRENCY);
            const results = await Promise.all(group.map(async (candidate) => {
                try {
                    return await continueEmoticonProjectDeletion(candidate);
                } catch (error) {
                    failed += 1;
                    logger.warn('[EmoticonStudio] Scheduled project deletion resume deferred.', {
                        ...candidate,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    return null;
                }
            }));
            results.forEach((result) => {
                if (result?.status === 'completed') completed += 1;
                else if (result) processing += 1;
            });
        }
        logger.info('[EmoticonStudio] Scheduled project deletion resume completed.', {
            inspected: documents.size,
            candidates: candidates.length,
            completed,
            processing,
            failed,
        });
    },
);
