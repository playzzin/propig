import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../firestore';

const MAX_OPERATIONS_PER_RUN = 100;
const MAX_CHUNKS_PER_OPERATION = 128;

export const cleanupAiOperationResults = onSchedule(
    {
        schedule: 'every 24 hours',
        timeZone: 'Asia/Seoul',
        region: 'asia-northeast3',
        timeoutSeconds: 240,
        memory: '256MiB',
    },
    async () => {
        const now = new Date();
        const expiredOperations = await db
            .collection('aiOperationReservations')
            .where('resultExpiresAt', '<=', now)
            .limit(MAX_OPERATIONS_PER_RUN)
            .get();
        let deletedChunks = 0;
        let deletedObjects = 0;

        for (const operation of expiredOperations.docs) {
            const data = operation.data();
            const chunks = await operation.ref.collection('resultChunks').limit(MAX_CHUNKS_PER_OPERATION).get();
            if (!chunks.empty) {
                const batch = db.batch();
                chunks.docs.forEach((document) => batch.delete(document.ref));
                batch.update(operation.ref, {
                    resultChunkCount: admin.firestore.FieldValue.delete(),
                    resultExpiresAt: admin.firestore.FieldValue.delete(),
                    updatedAt: now,
                });
                await batch.commit();
                deletedChunks += chunks.size;
            }

            const storagePath = typeof data.resultStoragePath === 'string' ? data.resultStoragePath : '';
            if (storagePath.startsWith('ai-operation-results/')) {
                await admin.storage().bucket().file(storagePath).delete({ ignoreNotFound: true });
                await operation.ref.update({
                    resultStoragePath: admin.firestore.FieldValue.delete(),
                    resultSha256: admin.firestore.FieldValue.delete(),
                    resultExpiresAt: admin.firestore.FieldValue.delete(),
                    updatedAt: now,
                });
                deletedObjects += 1;
            }
        }

        logger.info('[AiOperationResults] Expired durable results cleaned.', {
            operations: expiredOperations.size,
            deletedChunks,
            deletedObjects,
        });
    },
);
