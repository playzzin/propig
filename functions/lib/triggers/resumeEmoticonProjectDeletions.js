"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeEmoticonProjectDeletions = void 0;
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const deleteProject_1 = require("../emoticonStudio/deleteProject");
const firestore_1 = require("../firestore");
const OPERATION_COLLECTION = 'emoticonStudioProjectDeletions';
const RESUME_BATCH_SIZE = 20;
const RESUME_CONCURRENCY = 3;
const LEGACY_SCAN_PAGES = 10;
const SAFE_UID = /^[^/\\\u0000-\u001f\u007f]{1,128}$/;
function parseCandidate(document) {
    const data = document.data() || {};
    const userId = typeof data.userId === 'string' ? data.userId : '';
    const projectId = typeof data.projectId === 'string' ? data.projectId : '';
    const mode = data.mode;
    if (!SAFE_UID.test(userId)
        || !(0, deleteProject_1.isSafeEmoticonDeletionId)(projectId)
        || !deleteProject_1.EMOTICON_PROJECT_DELETION_MODES.includes(mode)
        || !['processing', 'retryable_failed'].includes(String(data.status)))
        return null;
    return { userId, projectId, mode: mode };
}
async function findLegacyOperations(status) {
    const results = [];
    let cursor;
    for (let page = 0; page < LEGACY_SCAN_PAGES && results.length < RESUME_BATCH_SIZE; page += 1) {
        let query = firestore_1.db.collection(OPERATION_COLLECTION)
            .where('status', '==', status)
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(RESUME_BATCH_SIZE);
        if (cursor)
            query = query.startAfter(cursor);
        const snapshot = await query.get();
        results.push(...snapshot.docs.filter((document) => !document.data().nextAttemptAt));
        if (snapshot.size < RESUME_BATCH_SIZE)
            break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
    }
    return results.slice(0, RESUME_BATCH_SIZE);
}
exports.resumeEmoticonProjectDeletions = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    region: 'asia-northeast3',
    timeoutSeconds: 540,
    memory: '1GiB',
    retryCount: 2,
}, async () => {
    const now = admin.firestore.Timestamp.now();
    const [snapshot, legacyProcessing, legacyFailed] = await Promise.all([
        firestore_1.db.collection(OPERATION_COLLECTION)
            .where('nextAttemptAt', '<=', admin.firestore.Timestamp.now())
            .orderBy('nextAttemptAt', 'asc')
            .limit(RESUME_BATCH_SIZE)
            .get(),
        findLegacyOperations('processing'),
        findLegacyOperations('retryable_failed'),
    ]);
    // Operations created before nextAttemptAt was introduced are adopted by
    // the same worker. Once touched, acquire/checkpoint writes nextAttemptAt.
    const documents = new Map();
    [...snapshot.docs, ...legacyProcessing, ...legacyFailed].forEach((document) => {
        var _a, _b;
        const nextAttemptAtMs = (_b = (_a = document.data().nextAttemptAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a);
        if (typeof nextAttemptAtMs === 'number' && nextAttemptAtMs > now.toMillis())
            return;
        documents.set(document.id, document);
    });
    const candidates = [...documents.values()]
        .map(parseCandidate)
        .filter((candidate) => Boolean(candidate))
        .slice(0, RESUME_BATCH_SIZE);
    let completed = 0;
    let processing = 0;
    let failed = 0;
    for (let offset = 0; offset < candidates.length; offset += RESUME_CONCURRENCY) {
        const group = candidates.slice(offset, offset + RESUME_CONCURRENCY);
        const results = await Promise.all(group.map(async (candidate) => {
            try {
                return await (0, deleteProject_1.continueEmoticonProjectDeletion)(candidate);
            }
            catch (error) {
                failed += 1;
                logger.warn('[EmoticonStudio] Scheduled project deletion resume deferred.', Object.assign(Object.assign({}, candidate), { error: error instanceof Error ? error.message : String(error) }));
                return null;
            }
        }));
        results.forEach((result) => {
            if ((result === null || result === void 0 ? void 0 : result.status) === 'completed')
                completed += 1;
            else if (result)
                processing += 1;
        });
    }
    logger.info('[EmoticonStudio] Scheduled project deletion resume completed.', {
        inspected: documents.size,
        candidates: candidates.length,
        completed,
        processing,
        failed,
    });
});
//# sourceMappingURL=resumeEmoticonProjectDeletions.js.map