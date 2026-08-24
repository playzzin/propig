import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldPath, FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../firestore';

const SOURCE_ASSET_COLLECTION = 'emoticonStudioSourceAssets';
const CLEANUP_BATCH_SIZE = 100;
const READ_PAGE_SIZE = 200;
const CLEANUP_LEASE_MS = 10 * 60 * 1000;
const RETRY_DELAY_MS = 24 * 60 * 60 * 1000;
const ATTACHED_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const REGISTRY_TTL_MS = 35 * 24 * 60 * 60 * 1000;
const SAFE_UID = /^[^/\\\u0000-\u001f\u007f]{1,128}$/;
const SAFE_ASSET_ID = /^[a-f0-9]{64}$/;

type ClaimedAsset = {
    ref: FirebaseFirestore.DocumentReference;
    userId: string;
    assetId: string;
    storagePath: string;
    leaseToken: string;
    previousState: string;
};

function containsPath(value: unknown, candidates: Set<string>, depth = 0): boolean {
    if (!candidates.size || depth > 12 || value === null || value === undefined) return false;
    if (typeof value === 'string') return candidates.has(value);
    if (Array.isArray(value)) return value.some((entry) => containsPath(entry, candidates, depth + 1));
    if (typeof value !== 'object') return false;
    return Object.values(value as Record<string, unknown>)
        .some((entry) => containsPath(entry, candidates, depth + 1));
}

async function queryPage(
    collection: FirebaseFirestore.CollectionReference,
    cursor?: QueryDocumentSnapshot,
): Promise<FirebaseFirestore.QuerySnapshot> {
    let query: FirebaseFirestore.Query = collection
        .orderBy(FieldPath.documentId())
        .limit(READ_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    return query.get();
}

async function referencedPathsForOwner(userId: string, candidates: Set<string>): Promise<Set<string>> {
    const referenced = new Set<string>();
    const unresolved = () => new Set([...candidates].filter((path) => !referenced.has(path)));
    const userRef = db.collection('users').doc(userId);
    let projectCursor: QueryDocumentSnapshot | undefined;
    while (referenced.size < candidates.size) {
        const snapshot = await queryPage(userRef.collection('emoticonProjects'), projectCursor);
        if (snapshot.empty) break;
        for (const project of snapshot.docs) {
            const remaining = unresolved();
            if (containsPath(project.data(), remaining)) {
                remaining.forEach((path) => {
                    if (containsPath(project.data(), new Set([path]))) referenced.add(path);
                });
            }
            let itemCursor: QueryDocumentSnapshot | undefined;
            while (referenced.size < candidates.size) {
                const items = await queryPage(project.ref.collection('items'), itemCursor);
                if (items.empty) break;
                for (const item of items.docs) {
                    const itemRemaining = unresolved();
                    itemRemaining.forEach((path) => {
                        if (containsPath(item.data(), new Set([path]))) referenced.add(path);
                    });
                }
                if (items.size < READ_PAGE_SIZE) break;
                itemCursor = items.docs[items.docs.length - 1];
            }
        }
        if (snapshot.size < READ_PAGE_SIZE) break;
        projectCursor = snapshot.docs[snapshot.docs.length - 1];
    }

    let jobCursor: QueryDocumentSnapshot | undefined;
    while (referenced.size < candidates.size) {
        const snapshot = await queryPage(userRef.collection('emoticonJobs'), jobCursor);
        if (snapshot.empty) break;
        for (const job of snapshot.docs) {
            const remaining = unresolved();
            remaining.forEach((path) => {
                if (containsPath(job.data(), new Set([path]))) referenced.add(path);
            });
        }
        if (snapshot.size < READ_PAGE_SIZE) break;
        jobCursor = snapshot.docs[snapshot.docs.length - 1];
    }
    return referenced;
}

async function claimAsset(document: QueryDocumentSnapshot, nowMs: number): Promise<ClaimedAsset | null> {
    const userDocument = document.ref.parent.parent;
    if (!userDocument || userDocument.parent.id !== 'users') return null;
    const userId = userDocument.id;
    const assetId = document.id;
    if (!SAFE_UID.test(userId) || !SAFE_ASSET_ID.test(assetId)) return null;
    const expectedPath = `users/${userId}/emoticon-studio/sources/source-${assetId}.png`;
    const leaseToken = randomUUID();
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(document.ref);
        const asset = snapshot.data() || {};
        const expiresAtMs = asset.expiresAt?.toMillis?.() || 0;
        const leaseExpiresAtMs = typeof asset.cleanupLeaseExpiresAtMs === 'number'
            ? asset.cleanupLeaseExpiresAtMs
            : 0;
        if (
            !snapshot.exists
            || asset.userId !== userId
            || asset.assetId !== assetId
            || asset.storagePath !== expectedPath
            || asset.state === 'deleted'
            || expiresAtMs > nowMs
            || (asset.state === 'checking' && leaseExpiresAtMs > nowMs)
        ) return null;
        const previousState = typeof asset.state === 'string' ? asset.state : 'pending';
        transaction.update(document.ref, {
            state: 'checking',
            cleanupLeaseToken: leaseToken,
            cleanupLeaseExpiresAtMs: nowMs + CLEANUP_LEASE_MS,
            cleanupCheckedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        return {
            ref: document.ref,
            userId,
            assetId,
            storagePath: expectedPath,
            leaseToken,
            previousState,
        };
    });
}

async function markAttached(asset: ClaimedAsset): Promise<void> {
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(asset.ref);
        if (!snapshot.exists || snapshot.data()?.cleanupLeaseToken !== asset.leaseToken) return;
        transaction.update(asset.ref, {
            state: 'attached',
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + ATTACHED_RECHECK_MS),
            cleanupLeaseToken: FieldValue.delete(),
            cleanupLeaseExpiresAtMs: 0,
            attachedAt: snapshot.data()?.attachedAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

async function deleteUnreferenced(asset: ClaimedAsset): Promise<void> {
    await admin.storage().bucket().file(asset.storagePath).delete({ ignoreNotFound: true });
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(asset.ref);
        if (!snapshot.exists || snapshot.data()?.cleanupLeaseToken !== asset.leaseToken) return;
        transaction.update(asset.ref, {
            state: 'deleted',
            cleanupLeaseToken: FieldValue.delete(),
            cleanupLeaseExpiresAtMs: 0,
            expiresAt: FieldValue.delete(),
            purgeAt: admin.firestore.Timestamp.fromMillis(Date.now() + REGISTRY_TTL_MS),
            deletedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

async function markDeletePending(asset: ClaimedAsset): Promise<void> {
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(asset.ref);
        if (!snapshot.exists || snapshot.data()?.cleanupLeaseToken !== asset.leaseToken) return;
        transaction.update(asset.ref, {
            state: 'delete_pending',
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + RETRY_DELAY_MS),
            cleanupLeaseToken: FieldValue.delete(),
            cleanupLeaseExpiresAtMs: 0,
            deletePendingAt: snapshot.data()?.deletePendingAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

async function releaseAfterFailure(asset: ClaimedAsset, error: unknown): Promise<void> {
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(asset.ref);
        if (!snapshot.exists || snapshot.data()?.cleanupLeaseToken !== asset.leaseToken) return;
        transaction.update(asset.ref, {
            state: 'pending',
            cleanupLeaseToken: FieldValue.delete(),
            cleanupLeaseExpiresAtMs: 0,
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + RETRY_DELAY_MS),
            lastCleanupError: error instanceof Error
                ? error.message.slice(0, 300)
                : String(error).slice(0, 300),
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

export const cleanupEmoticonSourceAssets = onSchedule(
    {
        schedule: 'every 30 minutes',
        timeZone: 'UTC',
        region: 'asia-northeast3',
        timeoutSeconds: 300,
        memory: '512MiB',
        retryCount: 2,
    },
    async () => {
        const nowMs = Date.now();
        const due = await db.collectionGroup(SOURCE_ASSET_COLLECTION)
            .where('expiresAt', '<=', admin.firestore.Timestamp.fromMillis(nowMs))
            .orderBy('expiresAt', 'asc')
            .limit(CLEANUP_BATCH_SIZE)
            .get();
        const claimed = (await Promise.all(due.docs.map((document) => claimAsset(document, nowMs))))
            .filter((asset): asset is ClaimedAsset => Boolean(asset));
        const byUser = new Map<string, ClaimedAsset[]>();
        claimed.forEach((asset) => byUser.set(asset.userId, [...(byUser.get(asset.userId) || []), asset]));

        let attached = 0;
        let pendingDeletion = 0;
        let deleted = 0;
        let failed = 0;
        for (const [userId, assets] of byUser) {
            try {
                const candidates = new Set(assets.map((asset) => asset.storagePath));
                const firstPass = await referencedPathsForOwner(userId, candidates);
                const unresolved = assets.filter((asset) => !firstPass.has(asset.storagePath));
                const secondPass = unresolved.length
                    ? await referencedPathsForOwner(userId, new Set(unresolved.map((asset) => asset.storagePath)))
                    : new Set<string>();
                for (const asset of assets) {
                    if (firstPass.has(asset.storagePath) || secondPass.has(asset.storagePath)) {
                        await markAttached(asset);
                        attached += 1;
                    } else if (asset.previousState !== 'delete_pending') {
                        // A full grace period separates the first unreferenced
                        // observation from deletion. Projects saved just after
                        // an upload response therefore get another complete
                        // reference scan before the source can be removed.
                        await markDeletePending(asset);
                        pendingDeletion += 1;
                    } else {
                        // Re-read immediately before the irreversible Storage
                        // operation. The earlier owner-wide passes avoid most
                        // races; this per-asset pass narrows the remaining
                        // attach-after-scan window to the delete call itself.
                        const finalPass = await referencedPathsForOwner(
                            userId,
                            new Set([asset.storagePath]),
                        );
                        if (finalPass.has(asset.storagePath)) {
                            await markAttached(asset);
                            attached += 1;
                        } else {
                            await deleteUnreferenced(asset);
                            deleted += 1;
                        }
                    }
                }
            } catch (error) {
                failed += assets.length;
                await Promise.all(assets.map((asset) => releaseAfterFailure(asset, error).catch(() => undefined)));
                logger.error('[EmoticonStudio] Source asset cleanup group failed.', { userId, error });
            }
        }
        logger.info('[EmoticonStudio] Source asset cleanup completed.', {
            inspected: due.size,
            claimed: claimed.length,
            attached,
            pendingDeletion,
            deleted,
            failed,
        });
    },
);
