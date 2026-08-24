import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../firestore';

const REGION = 'asia-northeast3';
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,160}$/;
const STORAGE_PAGE_SIZE = 100;
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled']);

type DeleteJobRequest = {
    jobId?: unknown;
};

type DeleteJobResult = {
    jobId: string;
    deleted: boolean;
    deletedAssets: number;
    unlinkedProjectItem: boolean;
    updatedBatch: boolean;
};

type LockedJob = DocumentData & {
    deletionLockToken: string;
};

type ProjectItemUnlinkResult = {
    changed: boolean;
    currentResultRemoved: boolean;
    item: Record<string, unknown>;
};

function isSafeFirebaseUid(value: string): boolean {
    return value.length >= 1
        && value.length <= 128
        && !/[\\/\u0000-\u001f\u007f]/.test(value);
}

export function isSafeEmoticonJobDeletionId(value: string): boolean {
    return SAFE_IDENTIFIER.test(value);
}

function parseJobId(value: unknown): string {
    if (typeof value !== 'string' || !isSafeEmoticonJobDeletionId(value.trim())) {
        throw new HttpsError('invalid-argument', '삭제할 작업 번호가 올바르지 않습니다.');
    }
    return value.trim();
}

async function requireStudioAdmin(uid: string, token: Record<string, unknown>): Promise<void> {
    const allowList = (process.env.ADMIN_UIDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (token.admin === true || token.role === 'admin' || allowList.includes(uid)) return;

    const [adminDoc, accessDoc] = await Promise.all([
        db.collection('admins').doc(uid).get(),
        db.collection('userAccess').doc(uid).get(),
    ]);
    if (adminDoc.exists || (accessDoc.exists && accessDoc.data()?.role === 'admin')) return;
    throw new HttpsError('permission-denied', '관리자만 이모티콘 작업을 삭제할 수 있습니다.');
}

export function emoticonJobDeletionStoragePrefix(userId: string, jobId: string): string {
    if (!isSafeFirebaseUid(userId) || !isSafeEmoticonJobDeletionId(jobId)) {
        throw new Error('Unsafe emoticon job storage owner.');
    }
    return `users/${userId}/emoticon-studio/jobs/${jobId}/`;
}

function isOwnedJobAssetPath(prefix: string, storagePath: string): boolean {
    if (!storagePath.startsWith(prefix)) return false;
    const relativePath = storagePath.slice(prefix.length);
    return relativePath.length > 0
        && !relativePath.includes('\\')
        && !relativePath.split('/').includes('..')
        && !/[\u0000-\u001f\u007f]/.test(relativePath);
}

function normalizedEditHistory(value: unknown, jobId: string): unknown[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Record<string, unknown>;
        return candidate.sourceJobId !== jobId && candidate.resultJobId !== jobId;
    });
}

export function unlinkDeletedJobFromProjectItem(
    value: unknown,
    jobId: string,
): ProjectItemUnlinkResult {
    const source = value && typeof value === 'object'
        ? value as Record<string, unknown>
        : {};
    const originalHistory = Array.isArray(source.editHistory) ? source.editHistory : [];
    const editHistory = normalizedEditHistory(originalHistory, jobId);
    const currentResultRemoved = source.jobId === jobId;
    const changed = currentResultRemoved || editHistory.length !== originalHistory.length;
    if (!changed) return { changed: false, currentResultRemoved: false, item: source };

    return {
        changed: true,
        currentResultRemoved,
        item: {
            ...source,
            editHistory,
            ...(currentResultRemoved ? {
                jobId: null,
                generationStatus: 'planned',
                validationErrors: [],
            } : {}),
            revision: Number.isInteger(source.revision)
                ? Number(source.revision) + 1
                : 1,
            updatedAt: admin.firestore.Timestamp.now(),
        },
    };
}

export function unlinkDeletedJobFromBatch(value: unknown, jobId: string): {
    changed: boolean;
    items: unknown[];
    executionJobIds: string[];
} {
    const source = value && typeof value === 'object'
        ? value as Record<string, unknown>
        : {};
    const originalItems = Array.isArray(source.items) ? source.items : [];
    let changed = false;
    const items = originalItems.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        const item = entry as Record<string, unknown>;
        const originalJobIds = Array.isArray(item.jobIds)
            ? item.jobIds.filter((candidate): candidate is string => typeof candidate === 'string')
            : [];
        const jobIds = originalJobIds.filter((candidate) => candidate !== jobId);
        const currentRemoved = item.currentJobId === jobId;
        if (!currentRemoved && jobIds.length === originalJobIds.length) return entry;
        changed = true;
        return {
            ...item,
            jobIds,
            currentJobId: currentRemoved ? (jobIds.at(-1) ?? null) : item.currentJobId,
        };
    });
    const originalExecutionIds = Array.isArray(source.executionJobIds)
        ? source.executionJobIds.filter((candidate): candidate is string => typeof candidate === 'string')
        : [];
    const executionJobIds = originalExecutionIds.filter((candidate) => candidate !== jobId);
    if (executionJobIds.length !== originalExecutionIds.length) changed = true;
    return { changed, items, executionJobIds };
}

async function deleteOwnedJobAssets(userId: string, jobId: string): Promise<number> {
    const prefix = emoticonJobDeletionStoragePrefix(userId, jobId);
    const bucket = admin.storage().bucket();
    let deletedAssets = 0;
    let pageToken: string | undefined;
    do {
        const [files, nextQuery] = await bucket.getFiles({
            prefix,
            maxResults: STORAGE_PAGE_SIZE,
            autoPaginate: false,
            ...(pageToken ? { pageToken } : {}),
        });
        files.forEach((file) => {
            if (!isOwnedJobAssetPath(prefix, file.name)) {
                throw new Error(`Refused unsafe job asset path: ${file.name}`);
            }
        });
        await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
        deletedAssets += files.length;
        pageToken = typeof nextQuery?.pageToken === 'string' && nextQuery.pageToken
            ? nextQuery.pageToken
            : undefined;
    } while (pageToken);
    return deletedAssets;
}

async function deleteJob(params: { userId: string; jobId: string }): Promise<DeleteJobResult> {
    const jobRef = db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`);
    const jobsRef = db.collection('users').doc(params.userId).collection('emoticonJobs');
    const proposedLockToken = randomUUID();
    const lockedJob = await db.runTransaction<LockedJob | null>(async (transaction) => {
        const [jobSnapshot, childSnapshot, profileDependentSnapshot] = await Promise.all([
            transaction.get(jobRef),
            transaction.get(jobsRef.where('parentJobId', '==', params.jobId).limit(1)),
            transaction.get(jobsRef.where('profileJobId', '==', params.jobId).limit(1)),
        ]);
        if (!jobSnapshot.exists) return null;
        const job = jobSnapshot.data() || {};
        if (job.userId !== params.userId || (job.id && job.id !== params.jobId)) {
            throw new HttpsError('permission-denied', '이 작업의 소유권을 확인할 수 없습니다.');
        }
        if (typeof job.status !== 'string' || !TERMINAL_JOB_STATUSES.has(job.status)) {
            throw new HttpsError(
                'failed-precondition',
                '진행 중인 작업은 삭제할 수 없습니다. 완료하거나 취소한 뒤 다시 시도해 주세요.',
            );
        }
        if (!childSnapshot.empty || !profileDependentSnapshot.empty) {
            throw new HttpsError(
                'failed-precondition',
                '이 결과를 바탕으로 만든 작업이 남아 있습니다. 파생 작업을 먼저 삭제해 주세요.',
            );
        }
        const deletionLockToken = typeof job.deletionLockToken === 'string'
            ? job.deletionLockToken
            : proposedLockToken;
        transaction.update(jobRef, {
            deletionLocked: true,
            deletionLockToken,
            deletionLockedAt: job.deletionLockedAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        return { ...job, deletionLockToken } as LockedJob;
    });
    if (!lockedJob) {
        return {
            jobId: params.jobId,
            deleted: false,
            deletedAssets: 0,
            unlinkedProjectItem: false,
            updatedBatch: false,
        };
    }

    const deletedAssets = await deleteOwnedJobAssets(params.userId, params.jobId);
    const projectId = typeof lockedJob.projectId === 'string' && SAFE_IDENTIFIER.test(lockedJob.projectId)
        ? lockedJob.projectId
        : null;
    const projectItemId = typeof lockedJob.projectItemId === 'string' && SAFE_IDENTIFIER.test(lockedJob.projectItemId)
        ? lockedJob.projectItemId
        : null;
    const batchId = typeof lockedJob.batchId === 'string' && SAFE_IDENTIFIER.test(lockedJob.batchId)
        ? lockedJob.batchId
        : null;
    const projectRef = projectId
        ? db.doc(`users/${params.userId}/emoticonProjects/${projectId}`)
        : null;
    const itemRef = projectRef && projectItemId
        ? projectRef.collection('items').doc(projectItemId)
        : null;
    const batchRef = batchId
        ? db.doc(`users/${params.userId}/emoticonBatches/${batchId}`)
        : null;

    return db.runTransaction(async (transaction) => {
        const refs = [jobRef, ...(projectRef ? [projectRef] : []), ...(itemRef ? [itemRef] : []), ...(batchRef ? [batchRef] : [])];
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        const currentJobSnapshot = snapshots[0];
        if (!currentJobSnapshot.exists) {
            return {
                jobId: params.jobId,
                deleted: false,
                deletedAssets,
                unlinkedProjectItem: false,
                updatedBatch: false,
            };
        }
        const currentJob = currentJobSnapshot.data() || {};
        if (
            currentJob.userId !== params.userId
            || currentJob.deletionLocked !== true
            || currentJob.deletionLockToken !== lockedJob.deletionLockToken
            || !TERMINAL_JOB_STATUSES.has(String(currentJob.status))
        ) {
            throw new HttpsError('aborted', '작업 상태가 바뀌어 삭제를 중단했습니다. 다시 확인해 주세요.');
        }

        let snapshotIndex = 1;
        const projectSnapshot = projectRef ? snapshots[snapshotIndex++] : null;
        const itemSnapshot = itemRef ? snapshots[snapshotIndex++] : null;
        const batchSnapshot = batchRef ? snapshots[snapshotIndex] : null;
        let unlinkedProjectItem = false;
        let updatedBatch = false;

        if (itemRef && itemSnapshot?.exists) {
            const unlinked = unlinkDeletedJobFromProjectItem(itemSnapshot.data(), params.jobId);
            if (unlinked.changed) {
                unlinkedProjectItem = unlinked.currentResultRemoved;
                transaction.update(itemRef, {
                    editHistory: unlinked.item.editHistory,
                    ...(unlinked.currentResultRemoved ? {
                        jobId: null,
                        generationStatus: 'planned',
                        validationErrors: [],
                        activeJobCreatedAtMs: FieldValue.delete(),
                    } : {}),
                    revision: unlinked.item.revision,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }
        }

        if (projectRef && projectSnapshot?.exists) {
            const project = projectSnapshot.data() || {};
            const embeddedItems = Array.isArray(project.items) ? project.items : [];
            let embeddedChanged = false;
            let embeddedCurrentRemoved = false;
            const nextItems = embeddedItems.map((item) => {
                const unlinked = unlinkDeletedJobFromProjectItem(item, params.jobId);
                embeddedChanged ||= unlinked.changed;
                embeddedCurrentRemoved ||= unlinked.currentResultRemoved;
                return unlinked.item;
            });
            const profileJobRemoved = Boolean(
                project.character
                && typeof project.character === 'object'
                && (project.character as Record<string, unknown>).profileJobId === params.jobId,
            );
            if (embeddedChanged || unlinkedProjectItem || profileJobRemoved) {
                const nextStatus = (unlinkedProjectItem || embeddedCurrentRemoved)
                    ? project.status === 'draft' || project.status === 'generating'
                        ? project.status
                        : 'ready'
                    : project.status;
                transaction.update(projectRef, {
                    ...(embeddedChanged ? { items: nextItems } : {}),
                    ...(profileJobRemoved ? { 'character.profileJobId': FieldValue.delete() } : {}),
                    status: nextStatus,
                    revision: FieldValue.increment(1),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }
        }

        if (batchRef && batchSnapshot?.exists) {
            const unlinkedBatch = unlinkDeletedJobFromBatch(batchSnapshot.data(), params.jobId);
            if (unlinkedBatch.changed) {
                updatedBatch = true;
                transaction.update(batchRef, {
                    items: unlinkedBatch.items,
                    executionJobIds: unlinkedBatch.executionJobIds,
                    executionSlotUpdatedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }
        }

        transaction.delete(jobRef);
        return {
            jobId: params.jobId,
            deleted: true,
            deletedAssets,
            unlinkedProjectItem,
            updatedBatch,
        };
    });
}

export const deleteEmoticonJobSafely = onCall(
    {
        region: REGION,
        timeoutSeconds: 180,
        memory: '512MiB',
        maxInstances: 10,
    },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid || !isSafeFirebaseUid(uid)) {
            throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
        }
        await requireStudioAdmin(uid, (request.auth?.token || {}) as Record<string, unknown>);
        const input = (request.data || {}) as DeleteJobRequest;
        const jobId = parseJobId(input.jobId);
        try {
            return await deleteJob({ userId: uid, jobId });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            logger.error('[EmoticonStudio] Job deletion failed.', { userId: uid, jobId, error });
            throw new HttpsError(
                'unavailable',
                '작업 삭제를 안전하게 마치지 못했습니다. 잠시 후 다시 시도해 주세요.',
            );
        }
    },
);
