import * as admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiError, db, requireMethod, requireUser } from './hostingCommon';

const StoryboardIdSchema = z.string().trim().min(1).max(240).refine(
    (value) => !value.includes('/') && value !== '.' && value !== '..',
);
const ACTIVE_JOB_STATUSES = new Set(['queued', 'running', 'uploading']);
const FIRESTORE_BATCH_SIZE = 400;
const PROJECTS = 'video_studio_projects';
const CLIPS = 'video_studio_clips';
const JOBS = 'video_studio_jobs';
const AI_GENERATIONS = 'ai_generations';
const CLEANUP_CANDIDATES = 'storyboardArtifactCleanupCandidates';

type StoryboardGenerationLink = {
    generationId: string;
    sceneId: string;
};

function isSafeFirestoreDocumentId(value: string): boolean {
    return value.length > 0
        && value.length <= 240
        && !value.includes('/')
        && value !== '.'
        && value !== '..';
}

function cleanupCandidateId(storyboardId: string, generationId: string): string {
    return createHash('sha256')
        .update(`${storyboardId}\0${generationId}`)
        .digest('hex');
}

function collectStoryboardGenerationLinks(
    storyboard: Record<string, unknown>,
): StoryboardGenerationLink[] {
    if (!Array.isArray(storyboard.scenes)) return [];
    return storyboard.scenes.flatMap((rawScene) => {
        if (!rawScene || typeof rawScene !== 'object') return [];
        const scene = rawScene as Record<string, unknown>;
        const generatedImage = scene.generatedImage && typeof scene.generatedImage === 'object'
            ? scene.generatedImage as Record<string, unknown>
            : null;
        const generationId = typeof generatedImage?.id === 'string'
            ? generatedImage.id.trim()
            : '';
        const sceneId = typeof scene.id === 'string' ? scene.id.trim() : '';
        return isSafeFirestoreDocumentId(generationId) && isSafeFirestoreDocumentId(sceneId)
            ? [{ generationId, sceneId }]
            : [];
    });
}

async function recordGenerationCleanupCandidates(params: {
    userId: string;
    storyboardId: string;
    storyboard: Record<string, unknown>;
}): Promise<{ deferred: number; untracked: number }> {
    const links = collectStoryboardGenerationLinks(params.storyboard);
    const uniqueLinks = new Map<string, Set<string>>();
    links.forEach(({ generationId, sceneId }) => {
        const sceneIds = uniqueLinks.get(generationId) ?? new Set<string>();
        sceneIds.add(sceneId);
        uniqueLinks.set(generationId, sceneIds);
    });
    if (!uniqueLinks.size) return { deferred: 0, untracked: 0 };

    const entries = [...uniqueLinks.entries()];
    const historySnapshots = await db.getAll(
        ...entries.map(([generationId]) => db.collection(AI_GENERATIONS).doc(generationId)),
    );
    const batch = db.batch();
    let deferred = 0;

    historySnapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) return;
        const history = snapshot.data() || {};
        const provenance = history.artifactProvenance && typeof history.artifactProvenance === 'object'
            ? history.artifactProvenance as Record<string, unknown>
            : {};
        const storagePath = typeof history.storagePath === 'string'
            ? history.storagePath.trim()
            : '';
        if (
            history.userId !== params.userId
            || provenance.kind !== 'storyboard-scene'
            || provenance.storyboardId !== params.storyboardId
            || !storagePath.startsWith(`ai_generations/${params.userId}/`)
            || storagePath.includes('..')
        ) return;

        const [generationId, sceneIds] = entries[index];
        const candidateRef = db
            .collection('users')
            .doc(params.userId)
            .collection(CLEANUP_CANDIDATES)
            .doc(cleanupCandidateId(params.storyboardId, generationId));
        batch.set(candidateRef, {
            userId: params.userId,
            storyboardId: params.storyboardId,
            generationHistoryId: generationId,
            sceneIds: [...sceneIds],
            storagePath,
            status: 'reference_audit_required',
            automaticDeletionAllowed: false,
            reason: 'AI generation URLs may be reused by albums or site branding, so deletion is deferred until a complete reference audit is available.',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        deferred += 1;
    });

    if (deferred) await batch.commit();
    return { deferred, untracked: uniqueLinks.size - deferred };
}

async function deleteDocuments(
    documents: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<void> {
    for (let offset = 0; offset < documents.length; offset += FIRESTORE_BATCH_SIZE) {
        const batch = db.batch();
        documents
            .slice(offset, offset + FIRESTORE_BATCH_SIZE)
            .forEach((document) => batch.delete(document.ref));
        await batch.commit();
    }
}

export async function handleStoryboardById(
    req: Request,
    res: Response,
    storyboardId: string,
): Promise<void> {
    requireMethod(req, 'DELETE');
    const auth = await requireUser(req);
    const parsedId = StoryboardIdSchema.safeParse(storyboardId);
    if (!parsedId.success) throw new ApiError(400, '삭제할 프로젝트를 확인하지 못했습니다.');

    const storyboardRef = db
        .collection('users')
        .doc(auth.uid)
        .collection('imageStoryboards')
        .doc(parsedId.data);
    const storyboardSnapshot = await storyboardRef.get();
    if (!storyboardSnapshot.exists) {
        res.status(200).json({ success: true, alreadyDeleted: true });
        return;
    }

    const storyboard = storyboardSnapshot.data() || {};
    const videoProduction =
        storyboard.videoProduction && typeof storyboard.videoProduction === 'object'
            ? storyboard.videoProduction as Record<string, unknown>
            : {};
    const projectId =
        typeof videoProduction.projectId === 'string' && videoProduction.projectId.trim()
            ? videoProduction.projectId.trim()
            : null;

    await storyboardRef.set({
        cleanupStatus: 'pending',
        cleanupErrorMessage: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    try {
        let clipDocuments: FirebaseFirestore.QueryDocumentSnapshot[] = [];
        let jobDocuments: FirebaseFirestore.QueryDocumentSnapshot[] = [];
        let projectRef: FirebaseFirestore.DocumentReference | null = null;

        if (projectId) {
            projectRef = db.collection(PROJECTS).doc(projectId);
            const [projectSnapshot, clipsSnapshot, jobsSnapshot] = await Promise.all([
                projectRef.get(),
                db.collection(CLIPS).where('projectId', '==', projectId).get(),
                db.collection(JOBS).where('projectId', '==', projectId).get(),
            ]);
            if (projectSnapshot.exists && projectSnapshot.data()?.userId !== auth.uid) {
                throw new ApiError(403, '영상 프로젝트 소유권을 확인하지 못했습니다.');
            }
            clipDocuments = clipsSnapshot.docs.filter(
                (document) => document.data().userId === auth.uid,
            );
            jobDocuments = jobsSnapshot.docs.filter(
                (document) => document.data().userId === auth.uid,
            );

            const cancellationBatch = db.batch();
            let hasCancellation = false;
            for (const document of jobDocuments) {
                if (!ACTIVE_JOB_STATUSES.has(String(document.data().status || ''))) continue;
                hasCancellation = true;
                cancellationBatch.set(document.ref, {
                    status: 'canceled',
                    message: '프로젝트 삭제로 작업이 취소되었습니다.',
                    errorMessage: '프로젝트 삭제로 작업이 취소되었습니다.',
                    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            if (hasCancellation) await cancellationBatch.commit();
        }

        const generationCleanup = await recordGenerationCleanupCandidates({
            userId: auth.uid,
            storyboardId: parsedId.data,
            storyboard,
        });

        const storagePrefixes = [
            `users/${auth.uid}/storyboards/${parsedId.data}/`,
            ...(projectId ? [`video_studio/${auth.uid}/${projectId}/`] : []),
        ];
        await Promise.all(storagePrefixes.map((prefix) =>
            admin.storage().bucket().deleteFiles({ prefix, force: true }),
        ));
        await Promise.all([
            deleteDocuments(clipDocuments),
            deleteDocuments(jobDocuments),
        ]);
        if (projectRef) await projectRef.delete();
        await db.recursiveDelete(storyboardRef);

        res.status(200).json({
            success: true,
            deleted: {
                clips: clipDocuments.length,
                jobs: jobDocuments.length,
                storagePrefixes,
                deferredGenerationAssets: generationCleanup.deferred,
                untrackedGenerationAssets: generationCleanup.untracked,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : '프로젝트 정리에 실패했습니다.';
        await storyboardRef.set({
            cleanupStatus: 'retry',
            cleanupErrorMessage: message.slice(0, 1200),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => undefined);
        throw error;
    }
}
