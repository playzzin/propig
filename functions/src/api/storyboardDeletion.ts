import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';

import type * as FirebaseAdmin from 'firebase-admin';

export class StoryboardDeletionError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'StoryboardDeletionError';
    }
}

// Both authenticated HTTP surfaces use the same cleanup implementation.
export function createStoryboardDeletionHandler(db: FirebaseFirestore.Firestore, admin: typeof FirebaseAdmin) {
    const StoryboardIdSchema = z.string().trim().min(1).max(240).refine(isSafeDocumentId);
    const PROJECTS = 'video_studio_projects';
    const CLIPS = 'video_studio_clips';
    const JOBS = 'video_studio_jobs';
    const GENERATIONS = 'ai_generations';
    const OPERATIONS = 'aiOperationReservations';
    const CANDIDATES = 'storyboardArtifactCleanupCandidates';
    const MAX_DOCUMENTS = 2000;
    const LEASE_MS = 10 * 60 * 1000;
    const TERMINAL_JOBS = new Set(['completed', 'failed', 'canceled']);
    const RETRY_MESSAGE = '프로젝트 정리를 완료하지 못했습니다. 잠시 후 삭제를 다시 시도해 주세요.';

    type Data = Record<string, unknown>;
    type Snapshot = FirebaseFirestore.DocumentSnapshot;
    type Manifest = {
        projectIds: string[];
        generationIds: string[];
        generationStoragePaths: string[];
        operationIds: string[];
    };

    function isSafeDocumentId(value: string): boolean {
        return Boolean(value) && value.length <= 240 && !/[\\/\x00-\x1f]/.test(value)
            && value !== '.' && value !== '..';
    }

    function record(value: unknown): Data {
        return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
    }

    function strings(value: unknown): string[] {
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    }

    function millis(value: unknown): number {
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'number') return value;
        if (value && typeof value === 'object' && 'toMillis' in value
            && typeof value.toMillis === 'function') return value.toMillis();
        return 0;
    }

    function visit(value: unknown, callback: (value: string, key: string) => void, key = ''): void {
        if (typeof value === 'string') callback(value, key);
        else if (Array.isArray(value)) value.forEach((item) => visit(item, callback, key));
        else if (value && typeof value === 'object') {
            Object.entries(value).forEach(([name, item]) => visit(item, callback, name));
        }
    }

    function safeOwnedPath(path: string, prefix: string): boolean {
        return path.startsWith(prefix) && path.length > prefix.length
            && !path.split('/').some((part) => part === '..' || part === '.')
            && !/[\\\x00-\x1f]/.test(path);
    }

    // A similarly shaped external URL must never authorize local Storage deletion.
    function storagePath(value: string, bucketName: string): string | null {
        if (!value.includes('://')) return value;
        try {
            const url = new URL(value);
            if (url.protocol === 'gs:' && url.hostname === bucketName) return decodeURIComponent(url.pathname.slice(1));
            if (url.hostname === 'firebasestorage.googleapis.com') {
                const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
                return match && decodeURIComponent(match[1]) === bucketName ? decodeURIComponent(match[2]) : null;
            }
            if (url.hostname === 'storage.googleapis.com') {
                const prefix = `/${bucketName}/`;
                return url.pathname.startsWith(prefix) ? decodeURIComponent(url.pathname.slice(prefix.length)) : null;
            }
        } catch { /* Invalid references are not owned objects. */ }
        return null;
    }

    async function boundedQuery(query: FirebaseFirestore.Query): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
        const result = await query.limit(MAX_DOCUMENTS + 1).get();
        if (result.size > MAX_DOCUMENTS) throw new StoryboardDeletionError(409, '삭제 전 확인할 기록이 너무 많습니다. 관리자에게 프로젝트 정리를 요청해 주세요.');
        return result.docs;
    }

    async function readTree(root: FirebaseFirestore.DocumentReference): Promise<Snapshot[]> {
        const snapshots: Snapshot[] = [];
        const pending = [root];
        while (pending.length) {
            const ref = pending.pop()!;
            snapshots.push(await ref.get());
            if (snapshots.length > MAX_DOCUMENTS) throw new StoryboardDeletionError(409, '프로젝트의 하위 기록이 너무 많습니다. 관리자에게 정리를 요청해 주세요.');
            for (const collection of await ref.listCollections()) pending.push(...await collection.listDocuments());
        }
        return snapshots;
    }

    // Root documents are removed last, preserving the retry manifest on failure.
    async function deleteChildren(ref: FirebaseFirestore.DocumentReference): Promise<void> {
        for (const collection of await ref.listCollections()) await db.recursiveDelete(collection);
    }

    async function deleteRoots(refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
        for (let offset = 0; offset < refs.length; offset += 400) {
            const group = refs.slice(offset, offset + 400);
            for (let childOffset = 0; childOffset < group.length; childOffset += 20) {
                await Promise.all(group.slice(childOffset, childOffset + 20).map(deleteChildren));
            }
            const batch = db.batch();
            group.forEach((ref) => batch.delete(ref));
            await batch.commit();
        }
    }

    function assertJobStopped(data: Data): void {
        if (!TERMINAL_JOBS.has(String(data.status || '')) || millis(data.leaseExpiresAt) > Date.now()) {
            throw new StoryboardDeletionError(409, '영상 작업이 진행 중입니다. 작업이 완료되거나 취소가 완료된 뒤 다시 삭제해 주세요.');
        }
        // Older deletion code marked a worker canceled before its upload returned.
        if (data.status === 'canceled' && millis(data.updatedAt) > Date.now() - 12 * 60 * 1000) {
            throw new StoryboardDeletionError(409, '취소한 영상 작업의 마무리를 확인 중입니다. 취소 후 12분이 지나면 다시 삭제해 주세요.');
        }
    }

    function operationStoragePath(id: string): string {
        return `ai-operation-results/${createHash('sha256').update(id).digest('hex')}.json.gz`;
    }

    async function imageOperationResult(snapshot: Snapshot): Promise<Data> {
        const data = snapshot.data() || {};
        if (data.result && typeof data.result === 'object') return record(data.result);
        let serialized: Buffer | null = null;
        if (data.resultChunkCount) {
            const count = Number(data.resultChunkCount);
            if (!Number.isInteger(count) || count < 1 || count > 20) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
            const chunks = await snapshot.ref.collection('resultChunks').orderBy('index').get();
            if (chunks.size !== count) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
            const encoded = chunks.docs.map((chunk, index) => {
                const part = chunk.data();
                if (part.index !== index || typeof part.data !== 'string' || part.data.length > 600 * 1024) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
                return part.data;
            }).join('');
            serialized = Buffer.from(encoded, 'base64');
            if (serialized.toString('base64') !== encoded || serialized.length > 8 * 1024 * 1024) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
        } else if (data.resultStoragePath) {
            const expectedPath = operationStoragePath(snapshot.id);
            if (data.resultStoragePath !== expectedPath) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
            const file = admin.storage().bucket().file(expectedPath);
            const [metadata] = await file.getMetadata();
            if (Number(metadata.size) > 64 * 1024 * 1024) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
            const [compressed] = await file.download();
            serialized = gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 });
        }
        if (!serialized) return {};
        if (typeof data.resultSha256 !== 'string' || createHash('sha256').update(serialized).digest('hex') !== data.resultSha256) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
        return record(JSON.parse(serialized.toString('utf8')));
    }

    return async function deleteStoryboard(uid: string, storyboardId: string) {
        const parsed = StoryboardIdSchema.safeParse(storyboardId);
        if (!parsed.success) throw new StoryboardDeletionError(400, '삭제할 프로젝트를 확인하지 못했습니다.');
        const id = parsed.data;
        const root = db.collection('users').doc(uid).collection('imageStoryboards').doc(id);
        const leaseId = randomUUID();
        const previous = await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(root);
            if (!snapshot.exists) return null;
            const data = snapshot.data() || {};
            if (data.cleanupStatus === 'pending' && millis(data.cleanupLeaseExpiresAt) > Date.now()) throw new StoryboardDeletionError(409, '프로젝트 삭제가 이미 진행 중입니다. 잠시 후 목록을 다시 확인해 주세요.');
            transaction.update(root, {
                cleanupStatus: 'pending', cleanupLeaseId: leaseId,
                cleanupLeaseExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_MS), cleanupErrorMessage: null,
            });
            return data;
        });
        if (!previous) {
            return { success: true, alreadyDeleted: true };
        }

        const lockedProjects: FirebaseFirestore.DocumentReference[] = [];
        let destructiveStarted = false;
        try {
            const bucket = admin.storage().bucket();
            const storyboardPrefix = `users/${uid}/storyboards/${id}/`;
            const generationPrefix = `ai_generations/${uid}/`;
            const videoPrefix = `video_studio/${uid}/`;
            const oldManifest = record(previous.cleanupManifest);
            const projectIds = new Set(strings(oldManifest.projectIds).filter(isSafeDocumentId));
            const deterministicId = `storyboard_${uid}_${id}`;
            if (isSafeDocumentId(deterministicId)) projectIds.add(deterministicId);
            const generationIds = new Set(strings(oldManifest.generationIds).filter(isSafeDocumentId));
            const generationPaths = new Set(strings(oldManifest.generationStoragePaths).filter((path) => safeOwnedPath(path, generationPrefix)));
            const linkedImageIds = new Set<string>();
            const linkedImagePaths = new Set<string>();
            for (const snapshot of await readTree(root)) {
                const data = snapshot.ref.path === root.path ? previous : snapshot.data();
                visit(data, (value, key) => {
                    if (key === 'projectId' && isSafeDocumentId(value)) projectIds.add(value);
                    if (value.startsWith('scene-image:') && isSafeDocumentId(value.slice(12))) linkedImageIds.add(value.slice(12));
                    // References are inputs, not owned project outputs. Their URLs
                    // must not expand the deletion scope to another project.
                });
                const collectImages = (value: unknown): void => {
                    if (Array.isArray(value)) value.forEach(collectImages);
                    else if (value && typeof value === 'object') {
                        const object = value as Data;
                        const image = record(object.generatedImage);
                        const imageId = image.id;
                        if (typeof imageId === 'string' && isSafeDocumentId(imageId)) linkedImageIds.add(imageId);
                        if (object.kind === 'scene-image' || object.type === 'scene-image') {
                            for (const value of [object.url, object.storagePath]) {
                                const path = typeof value === 'string' ? storagePath(value, bucket.name) : null;
                                if (path && safeOwnedPath(path, generationPrefix)) linkedImagePaths.add(path);
                            }
                        }
                        for (const value of [image.url, image.storagePath]) {
                            const path = typeof value === 'string' ? storagePath(value, bucket.name) : null;
                            if (path && safeOwnedPath(path, generationPrefix)) linkedImagePaths.add(path);
                        }
                        Object.values(object).forEach(collectImages);
                    }
                };
                collectImages(data);
            }

            const [history, operations, candidates] = await Promise.all([
                boundedQuery(db.collection(GENERATIONS).where('userId', '==', uid)),
                boundedQuery(db.collection(OPERATIONS).where('uid', '==', uid)),
                boundedQuery(db.collection('users').doc(uid).collection(CANDIDATES).where('storyboardId', '==', id)),
            ]);
            const generatedSourceIds = new Set<string>();
            for (const snapshot of history) {
                const data = snapshot.data();
                const provenance = record(data.artifactProvenance);
                const path = typeof data.storagePath === 'string' ? data.storagePath : storagePath(String(data.url || ''), bucket.name);
                const ownedProvenance = provenance.kind === 'storyboard-scene' && provenance.storyboardId === id;
                const legacyLinked = !provenance.storyboardId && (linkedImageIds.has(snapshot.id) || Boolean(path && linkedImagePaths.has(path)));
                if (!ownedProvenance && !legacyLinked && !generationIds.has(snapshot.id)) continue;
                if (!path || !safeOwnedPath(path, generationPrefix)) throw new StoryboardDeletionError(409, '생성 이미지의 소유 경로를 확인하지 못했습니다. 관리자에게 기록 복구를 요청해 주세요.');
                generationIds.add(snapshot.id);
                generationPaths.add(path);
                if (typeof data.id === 'string') generatedSourceIds.add(data.id);
            }
            for (const candidate of candidates) {
                const data = candidate.data();
                if (data.userId !== uid) throw new StoryboardDeletionError(403, '생성 이미지 정리 기록의 소유권을 확인하지 못했습니다.');
                if (typeof data.generationHistoryId === 'string' && isSafeDocumentId(data.generationHistoryId)) generationIds.add(data.generationHistoryId);
                if (typeof data.storagePath === 'string' && safeOwnedPath(data.storagePath, generationPrefix)) generationPaths.add(data.storagePath);
            }

            // A retry manifest and cleanup candidates live in user-editable
            // documents. Never let either grant authority over a foreign history.
            for (const generationId of generationIds) {
                const snapshot = await db.collection(GENERATIONS).doc(generationId).get();
                if (snapshot.exists && snapshot.data()?.userId !== uid) throw new StoryboardDeletionError(403, '생성 이미지 기록의 소유권을 확인하지 못했습니다.');
            }
            for (const path of linkedImagePaths) {
                const linked = history.find((snapshot) => {
                    const data = snapshot.data();
                    return data.storagePath === path || storagePath(String(data.url || ''), bucket.name) === path;
                });
                // Missing legacy history cannot prove an AI URL was generated by
                // this project; fail closed instead of reporting residual-free success.
                if (!linked && !generationPaths.has(path)) throw new StoryboardDeletionError(409, '이전 생성 이미지의 소유 기록이 없습니다. 관리자에게 기록 복구를 요청한 뒤 삭제해 주세요.');
            }

            const operationIds = new Set(strings(oldManifest.operationIds).filter(isSafeDocumentId));
            for (const operation of operations) {
                const data = operation.data();
                if (data.operation !== 'image-generation') continue;
                // Legacy requests lack a storyboard ID. Wait for this user's image
                // requests so an in-flight completion cannot recreate history.
                if (data.status === 'pending' || data.status === 'uncertain') throw new StoryboardDeletionError(409, '이미지 생성 작업이 진행 중이거나 결과 확인이 필요합니다. 작업을 마무리한 뒤 다시 삭제해 주세요.');
                const result = operationIds.has(operation.id) ? {} : await imageOperationResult(operation);
                const matches = generatedSourceIds.has(String(result.imageId || ''))
                    || (Array.isArray(result.images) && result.images.some((image) => generatedSourceIds.has(String(record(image).id || ''))));
                if (!matches && !operationIds.has(operation.id)) continue;
                if (!data.budgetSettled) throw new StoryboardDeletionError(409, '이미지 생성 비용 정산이 완료된 뒤 다시 삭제해 주세요.');
                if (data.resultStoragePath && data.resultStoragePath !== operationStoragePath(operation.id)) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
                operationIds.add(operation.id);
            }
            for (const operationId of operationIds) {
                const snapshot = await db.collection(OPERATIONS).doc(operationId).get();
                const data = snapshot.data() || {};
                if (!snapshot.exists || data.uid !== uid || data.operation !== 'image-generation' || !data.budgetSettled) {
                    throw new StoryboardDeletionError(403, '이미지 작업 결과의 소유권을 확인하지 못했습니다.');
                }
            }

            const clips: FirebaseFirestore.QueryDocumentSnapshot[] = [];
            const jobs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
            for (const projectId of projectIds) {
                const projectRef = db.collection(PROJECTS).doc(projectId);
                const found = await db.runTransaction(async (transaction) => {
                    const [project, clipResult, jobResult] = await Promise.all([
                        transaction.get(projectRef),
                        transaction.get(db.collection(CLIPS).where('projectId', '==', projectId).limit(MAX_DOCUMENTS + 1)),
                        transaction.get(db.collection(JOBS).where('projectId', '==', projectId).limit(MAX_DOCUMENTS + 1)),
                    ]);
                    if (clipResult.size > MAX_DOCUMENTS || jobResult.size > MAX_DOCUMENTS) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
                    if ((project.exists && project.data()?.userId !== uid) || [...clipResult.docs, ...jobResult.docs].some((doc) => doc.data().userId !== uid)) throw new StoryboardDeletionError(403, '연결된 영상 작업의 소유권을 확인하지 못했습니다.');
                    jobResult.docs.forEach((job) => assertJobStopped(job.data()));
                    if (project.exists) {
                        const data = project.data() || {};
                        if (data.cleanupStatus === 'pending' && data.cleanupStoryboardId && data.cleanupStoryboardId !== id) throw new StoryboardDeletionError(409, '연결된 영상 프로젝트를 다른 작업에서 정리 중입니다.');
                        transaction.update(projectRef, { cleanupStatus: 'pending', cleanupStoryboardId: id, cleanupLeaseId: leaseId });
                    }
                    return { clips: clipResult.docs, jobs: jobResult.docs };
                });
                lockedProjects.push(projectRef);
                clips.push(...found.clips);
                jobs.push(...found.jobs);
            }

            const prefixes = [storyboardPrefix, ...[...projectIds].map((projectId) => `${videoPrefix}${projectId}/`)];
            const referencedIds = new Set([...generationIds, ...projectIds, ...clips.map((clip) => clip.id), ...jobs.map((job) => job.id)]);
            const referencesOutput = (data: unknown): boolean => {
                let found = false;
                visit(data, (value) => {
                    if (referencedIds.has(value) || (value.startsWith('scene-image:') && generationIds.has(value.slice(12)))) found = true;
                    const path = storagePath(value, bucket.name);
                    if (path && (generationPaths.has(path) || prefixes.some((prefix) => safeOwnedPath(path, prefix)))) found = true;
                });
                return found;
            };
            const sharingMessage = '다른 프로젝트·앨범·사이트 설정에서 이 프로젝트의 원본을 사용 중입니다. 해당 연결을 해제하거나 파일을 복사한 뒤 다시 삭제해 주세요.';
            for (const storyboard of await boundedQuery(root.parent)) {
                if (storyboard.id === id) continue;
                for (const snapshot of await readTree(storyboard.ref)) {
                    if (referencesOutput(snapshot.data())) throw new StoryboardDeletionError(409, sharingMessage);
                }
            }
            const auditQueries: FirebaseFirestore.Query[] = [
                db.collection('albums'), db.collection('system_settings'),
                db.collection(PROJECTS).where('userId', '==', uid),
                db.collection(CLIPS).where('userId', '==', uid), db.collection(JOBS).where('userId', '==', uid),
            ];
            for (const query of auditQueries) {
                for (const snapshot of await boundedQuery(query)) {
                    const data = snapshot.data();
                    if (snapshot.ref.parent.id === PROJECTS && projectIds.has(snapshot.id)) continue;
                    if ((snapshot.ref.parent.id === CLIPS || snapshot.ref.parent.id === JOBS) && projectIds.has(String(data.projectId))) continue;
                    if (referencesOutput(data)) throw new StoryboardDeletionError(409, sharingMessage);
                }
            }
            if (history.some((snapshot) => !generationIds.has(snapshot.id) && referencesOutput(snapshot.data()))) throw new StoryboardDeletionError(409, sharingMessage);

            const manifest: Manifest = {
                projectIds: [...projectIds], generationIds: [...generationIds], generationStoragePaths: [...generationPaths], operationIds: [...operationIds],
            };
            if (Buffer.byteLength(JSON.stringify(manifest)) > 500 * 1024) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
            await db.runTransaction(async (transaction) => {
                const current = await transaction.get(root);
                if (current.data()?.cleanupLeaseId !== leaseId) throw new StoryboardDeletionError(409, '다른 삭제 요청이 진행 중입니다.');
                transaction.update(root, { cleanupManifest: manifest, cleanupLeaseExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_MS) });
            });
            destructiveStarted = true;
            // Storage errors leave all pointers and the complete retry manifest.
            for (const prefix of prefixes) await bucket.deleteFiles({ prefix, force: false });
            for (const path of [...generationPaths, ...[...operationIds].map(operationStoragePath)]) await bucket.file(path).delete({ ignoreNotFound: true });
            for (const operationId of operationIds) {
                const ref = db.collection(OPERATIONS).doc(operationId);
                await deleteChildren(ref);
                // Preserve the settled payment/replay fence: deleting it permits a
                // previous operationId to charge the account again. No media remain.
                await db.runTransaction(async (transaction) => {
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists) return;
                    const data = snapshot.data() || {};
                    if (data.uid !== uid || data.operation !== 'image-generation' || !data.budgetSettled) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
                    const fence: Data = { uid: uid, operation: 'image-generation', status: 'completed', budgetSettled: true, resultDeleted: true };
                    for (const key of ['operationId', 'requestFingerprint', 'budgetDate', 'reservedUsd', 'chargedUsd', 'costReconciliation', 'createdAt']) {
                        if (data[key] !== undefined) fence[key] = data[key];
                    }
                    transaction.set(ref, fence);
                });
            }
            await deleteRoots([...generationIds].map((generationId) => db.collection(GENERATIONS).doc(generationId)));
            await deleteRoots(candidates.map((candidate) => candidate.ref));
            await deleteRoots([...clips, ...jobs].map((snapshot) => snapshot.ref));
            await deleteRoots(lockedProjects);
            await deleteChildren(root);
            for (const prefix of prefixes) {
                const [remaining] = await bucket.getFiles({ prefix, maxResults: 1, autoPaginate: false });
                if (remaining.length) throw new StoryboardDeletionError(409, RETRY_MESSAGE);
            }
            await db.runTransaction(async (transaction) => {
                const current = await transaction.get(root);
                if (current.data()?.cleanupLeaseId !== leaseId) throw new StoryboardDeletionError(409, '다른 삭제 요청이 진행 중입니다.');
                transaction.delete(root);
            });
            return { success: true, deleted: {
                projects: projectIds.size, clips: clips.length, jobs: jobs.length, generationAssets: generationIds.size, operationResults: operationIds.size,
            } };
        } catch (error) {
            const safeError = error instanceof StoryboardDeletionError ? error : new StoryboardDeletionError(503, RETRY_MESSAGE);
            for (const project of lockedProjects) {
                await db.runTransaction(async (transaction) => {
                    const snapshot = await transaction.get(project);
                    if (!snapshot.exists || snapshot.data()?.cleanupLeaseId !== leaseId) return;
                    transaction.update(project, {
                        cleanupStatus: destructiveStarted || Boolean(previous.cleanupManifest) ? 'retry' : admin.firestore.FieldValue.delete(),
                        cleanupLeaseId: admin.firestore.FieldValue.delete(),
                        ...(destructiveStarted ? {} : { cleanupStoryboardId: admin.firestore.FieldValue.delete() }),
                    });
                }).catch(() => undefined);
            }
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(root);
                if (!snapshot.exists || snapshot.data()?.cleanupLeaseId !== leaseId) return;
                transaction.update(root, {
                    cleanupStatus: destructiveStarted || previous.cleanupStatus === 'retry' ? 'retry' : 'idle', cleanupErrorMessage: safeError.message,
                    cleanupLeaseId: admin.firestore.FieldValue.delete(), cleanupLeaseExpiresAt: admin.firestore.FieldValue.delete(),
                });
            }).catch(() => undefined);
            throw safeError;
        }
    }
}
