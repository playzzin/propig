import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    writeBatch,
    type DocumentData,
    type QueryDocumentSnapshot,
    type Unsubscribe,
} from 'firebase/firestore';
import {
    ImageStoryboardSchema,
    createStoryboardVideoProduction,
    type ImageStoryboard,
    type SavedImageStoryboard,
    type StoryboardStorageCleanupAsset,
} from '@/schemas/imageStoryboard';
import {
    buildStoryboardTransitionLinks,
    buildStoryboardProductionRecordSignature,
    createStoryboardFinalAssemblyManifest,
    deriveStoryboardWorkflowStage,
    deriveStoryboardArtifacts,
    isStoryboardFinalCurrent,
} from '@/lib/storyboard-workflow';
import {
    VIDEO_STUDIO_CLIPS_COLLECTION,
    VIDEO_STUDIO_PROJECTS_COLLECTION,
} from '@/lib/video-studio';
import { db } from '@/firebase/config';
import { storage } from '@/firebase/storage';
import {
    deleteObject,
    getDownloadURL,
    getMetadata,
    ref as storageRef,
    uploadBytes,
} from 'firebase/storage';
import type { ImageReferenceAsset, ImageReferenceDraft } from '@/types/imageReference';

const STORYBOARD_COLLECTION = 'imageStoryboards';
const STORYBOARD_VERSION_COLLECTION = 'versions';
const STORYBOARD_ARTIFACT_COLLECTION = 'artifacts';
const STORYBOARD_TRANSITION_COLLECTION = 'transitionLinks';
const STORYBOARD_FINAL_CUT_COLLECTION = 'finalCuts';
const MAX_STORYBOARD_VERSIONS = 24;
const SAFE_BATCH_DELETE_SIZE = 450;

export class StoryboardConflictError extends Error {
    constructor() {
        super('다른 창에서 이 스토리보드가 수정되었습니다. 최신 버전을 확인한 뒤 다시 저장해 주세요.');
        this.name = 'StoryboardConflictError';
    }
}

export type SavedStoryboardVersion = {
    id: string;
    label: string;
    storyboard: ImageStoryboard;
    createdAt: number;
};

export type StoryboardCleanupFileInfo = {
    id: string;
    storagePath: string;
    sizeBytes: number | null;
    updatedAt: string | null;
    missing: boolean;
};

export type StoryboardCleanupDeletionResult = {
    deletedStoragePaths: string[];
    failed: Array<{ storagePath: string; message: string }>;
};

function storyboardCollection(userId: string) {
    return collection(db, 'users', userId, STORYBOARD_COLLECTION);
}

function storyboardDocument(userId: string, storyboardId: string) {
    return doc(db, 'users', userId, STORYBOARD_COLLECTION, storyboardId);
}

function storyboardVersionCollection(userId: string, storyboardId: string) {
    return collection(storyboardDocument(userId, storyboardId), STORYBOARD_VERSION_COLLECTION);
}

function storyboardSubcollection(
    userId: string,
    storyboardId: string,
    collectionName: string,
) {
    return collection(storyboardDocument(userId, storyboardId), collectionName);
}

async function syncStoryboardProductionRecords(
    userId: string,
    storyboardId: string,
    storyboard: ImageStoryboard,
): Promise<void> {
    const artifacts = deriveStoryboardArtifacts(storyboard);
    const transitions = buildStoryboardTransitionLinks(storyboard);
    const [existingArtifacts, existingTransitions] = await Promise.all([
        getDocs(storyboardSubcollection(
            userId,
            storyboardId,
            STORYBOARD_ARTIFACT_COLLECTION,
        )),
        getDocs(storyboardSubcollection(
            userId,
            storyboardId,
            STORYBOARD_TRANSITION_COLLECTION,
        )),
    ]);
    const activeArtifactIds = new Set(artifacts.map((artifact) => artifact.id));
    const activeTransitionIds = new Set(transitions.map((transition) => transition.id));
    const batch = writeBatch(db);

    artifacts.forEach((artifact) => {
        batch.set(
            doc(
                storyboardSubcollection(
                    userId,
                    storyboardId,
                    STORYBOARD_ARTIFACT_COLLECTION,
                ),
                artifact.id,
            ),
            {
                ...artifact,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );
    });
    existingArtifacts.docs.forEach((artifact) => {
        if (activeArtifactIds.has(artifact.id)) return;
        batch.set(artifact.ref, {
            lifecycle: 'retired',
            retiredAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }, { merge: true });
    });

    transitions.forEach((transition) => {
        batch.set(
            doc(
                storyboardSubcollection(
                    userId,
                    storyboardId,
                    STORYBOARD_TRANSITION_COLLECTION,
                ),
                transition.id,
            ),
            {
                ...transition,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );
    });
    existingTransitions.docs.forEach((transition) => {
        if (!activeTransitionIds.has(transition.id)) batch.delete(transition.ref);
    });

    const manifest = storyboard.videoProduction.finalAssemblyManifest;
    if (manifest) {
        batch.set(
            doc(
                storyboardSubcollection(
                    userId,
                    storyboardId,
                    STORYBOARD_FINAL_CUT_COLLECTION,
                ),
                manifest.fingerprint,
            ),
            {
                manifest,
                finalClipId: storyboard.videoProduction.finalClipId,
                finalVideoUrl: storyboard.videoProduction.finalVideoUrl,
                freshness: storyboard.videoProduction.finalFreshness,
                createdAt: manifest.createdAt,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );
    }

    await batch.commit();
}

function extensionForContentType(contentType: string): string {
    const normalized = contentType.toLowerCase();
    if (normalized.includes('jpeg')) return 'jpg';
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    if (normalized.includes('wav')) return 'wav';
    if (normalized.includes('mp4')) return 'mp4';
    if (normalized.includes('mpeg')) return 'mp3';
    if (normalized.includes('ogg')) return 'ogg';
    return 'bin';
}

async function copyRemoteAssetToStoryboard(params: {
    sourceUrl: string;
    targetPathWithoutExtension: string;
}): Promise<{ url: string; storagePath: string }> {
    const response = await fetch(params.sourceUrl, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`파일 복사에 실패했습니다. HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const storagePath = `${params.targetPathWithoutExtension}.${extensionForContentType(blob.type)}`;
    const reference = storageRef(storage, storagePath);
    await uploadBytes(reference, blob, {
        contentType: blob.type || 'application/octet-stream',
    });
    return {
        url: await getDownloadURL(reference),
        storagePath,
    };
}

function isOwnedStoryboardStoragePath(userId: string, storyboardId: string, storagePath: string): boolean {
    return storagePath.startsWith(`users/${userId}/storyboards/${storyboardId}/`);
}

function isStorageObjectMissing(error: unknown): boolean {
    const code = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
    return code === 'storage/object-not-found';
}

function readTimestamp(value: unknown): number {
    if (typeof value === 'number') return value;
    if (
        value &&
        typeof value === 'object' &&
        'toMillis' in value &&
        typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ) {
        return (value as { toMillis: () => number }).toMillis();
    }
    return Date.now();
}

function parseStoryboardData(
    id: string,
    raw: DocumentData,
): SavedImageStoryboard | null {
    const parsed = ImageStoryboardSchema.safeParse(raw);

    if (!parsed.success) {
        console.warn('[ImageStoryboard] Ignoring invalid storyboard document.', id, parsed.error.issues);
        return null;
    }
    const seenSceneIds = new Set<string>();
    const scenes = parsed.data.scenes.map((scene, index) => {
        const order = index + 1;
        if (!seenSceneIds.has(scene.id)) {
            seenSceneIds.add(scene.id);
            return scene.order === order ? scene : {
                ...scene,
                order,
                assetFreshness: 'review' as const,
                staleReason: '장면 순서를 자동으로 복구했습니다. 최종 영상 조립 전에 순서를 확인해 주세요.',
            };
        }
        let duplicateIndex = index + 1;
        let replacementId = `${scene.id}-duplicate-${duplicateIndex}`;
        while (seenSceneIds.has(replacementId)) {
            duplicateIndex += 1;
            replacementId = `${scene.id}-duplicate-${duplicateIndex}`;
        }
        seenSceneIds.add(replacementId);
        return {
            ...scene,
            id: replacementId,
            order,
            assetFreshness: 'review' as const,
            staleReason: '중복 장면 식별자를 자동으로 복구했습니다. 결과를 확인해 주세요.',
        };
    });

    return {
        id,
        ...parsed.data,
        scenes,
        createdAt: readTimestamp(raw.createdAt),
        updatedAt: readTimestamp(raw.updatedAt),
    };
}

function parseStoryboardSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): SavedImageStoryboard | null {
    return parseStoryboardData(snapshot.id, snapshot.data());
}

class ImageStoryboardService {
    subscribe(
        userId: string,
        onData: (storyboards: SavedImageStoryboard[]) => void,
        onError: (error: Error) => void,
    ): Unsubscribe {
        return onSnapshot(
            query(storyboardCollection(userId), orderBy('updatedAt', 'desc')),
            (snapshot) => {
                onData(snapshot.docs.flatMap((item) => {
                    const parsed = parseStoryboardSnapshot(item);
                    return parsed ? [parsed] : [];
                }));
            },
            (error) => onError(error instanceof Error ? error : new Error(String(error))),
        );
    }

    async create(userId: string, data: ImageStoryboard): Promise<string> {
        const validated = ImageStoryboardSchema.parse({ ...data, revision: 1 });
        const normalized = {
            ...validated,
            schemaVersion: 2 as const,
            workflowStage: deriveStoryboardWorkflowStage(validated),
            transitionLinks: buildStoryboardTransitionLinks(validated),
        };
        const parsed = {
            ...normalized,
            productionRecordSignature:
                buildStoryboardProductionRecordSignature(normalized),
        };
        const reference = doc(storyboardCollection(userId));
        await setDoc(reference, {
            ...parsed,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        await syncStoryboardProductionRecords(userId, reference.id, parsed);
        return reference.id;
    }

    async get(userId: string, storyboardId: string): Promise<SavedImageStoryboard> {
        const snapshot = await getDoc(storyboardDocument(userId, storyboardId));
        if (!snapshot.exists()) {
            throw new Error('불러올 스토리보드가 존재하지 않습니다.');
        }
        const parsed = parseStoryboardData(snapshot.id, snapshot.data());
        if (!parsed) {
            throw new Error('스토리보드 데이터 형식을 확인하지 못했습니다.');
        }
        return parsed;
    }

    async save(userId: string, storyboardId: string, data: ImageStoryboard): Promise<number> {
        const validated = ImageStoryboardSchema.parse(data);
        const normalized = {
            ...validated,
            schemaVersion: 2 as const,
            workflowStage: deriveStoryboardWorkflowStage(validated),
            transitionLinks: buildStoryboardTransitionLinks(validated),
        };
        const parsed = {
            ...normalized,
            productionRecordSignature:
                buildStoryboardProductionRecordSignature(normalized),
        };
        const reference = storyboardDocument(userId, storyboardId);

        const saveResult = await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists()) {
                throw new Error('저장할 스토리보드가 존재하지 않습니다.');
            }

            const currentRevision = Number(snapshot.data().revision ?? 1);
            if (currentRevision !== parsed.revision) {
                throw new StoryboardConflictError();
            }

            const nextRevision = currentRevision + 1;
            transaction.update(reference, {
                ...parsed,
                revision: nextRevision,
                updatedAt: serverTimestamp(),
            });
            return {
                nextRevision,
                productionRecordsChanged:
                    snapshot.data().productionRecordSignature !==
                    parsed.productionRecordSignature,
            };
        });
        if (saveResult.productionRecordsChanged) {
            await syncStoryboardProductionRecords(userId, storyboardId, {
                ...parsed,
                revision: saveResult.nextRevision,
            });
        }
        return saveResult.nextRevision;
    }

    async duplicate(userId: string, data: ImageStoryboard): Promise<string> {
        return this.create(userId, {
            ...ImageStoryboardSchema.parse(data),
            revision: 1,
            archivedAt: null,
            title: `${data.title} 복사본`.slice(0, 100),
        });
    }

    async duplicateWithMedia(
        userId: string,
        data: ImageStoryboard,
        onProgress?: (completed: number, total: number) => void,
    ): Promise<string> {
        const source = ImageStoryboardSchema.parse(data);
        const storyboardReference = doc(storyboardCollection(userId));
        const storyboardId = storyboardReference.id;
        const sourceWasCurrent = isStoryboardFinalCurrent(source);
        const sceneIdMap = new Map(
            source.scenes.map((scene) => [scene.id, crypto.randomUUID()] as const),
        );
        const sceneClipIdMap = new Map(
            source.scenes.flatMap((scene) =>
                scene.video.videoUrl
                    ? [[scene.id, doc(collection(db, VIDEO_STUDIO_CLIPS_COLLECTION)).id] as const]
                    : [],
            ),
        );
        const projectReference = doc(collection(db, VIDEO_STUDIO_PROJECTS_COLLECTION));
        const uploadedPaths: string[] = [];
        const mediaCount =
            source.referenceAssets.length +
            source.scenes.reduce(
                (count, scene) =>
                    count +
                    (scene.generatedImage ? 1 : 0) +
                    (scene.video.videoUrl ? 1 : 0) +
                    (scene.video.lastFrameUrl ? 1 : 0),
                0,
            ) +
            (source.videoProduction.backgroundMusicUrl ? 1 : 0) +
            (source.videoProduction.finalVideoUrl ? 1 : 0);
        let completed = 0;
        const copyAsset = async (sourceUrl: string, path: string) => {
            const copied = await copyRemoteAssetToStoryboard({
                sourceUrl,
                targetPathWithoutExtension: path,
            });
            uploadedPaths.push(copied.storagePath);
            completed += 1;
            onProgress?.(completed, mediaCount);
            return copied;
        };

        try {
            const referenceAssets = [];
            for (const asset of source.referenceAssets) {
                const copied = await copyAsset(
                    asset.image,
                    `users/${userId}/storyboards/${storyboardId}/references/${asset.id}`,
                );
                referenceAssets.push({
                    ...asset,
                    id: crypto.randomUUID(),
                    image: copied.url,
                    storagePath: copied.storagePath,
                    createdAt: Date.now(),
                });
            }

            const scenes: ImageStoryboard['scenes'] = [];
            const clipDocuments: Array<{
                id: string;
                scene: ImageStoryboard['scenes'][number];
            }> = [];
            for (const sourceScene of source.scenes) {
                const sceneId = sceneIdMap.get(sourceScene.id) || crypto.randomUUID();
                const copiedImage = sourceScene.generatedImage
                    ? await copyAsset(
                        sourceScene.generatedImage.url,
                        `users/${userId}/storyboards/${storyboardId}/images/${sceneId}`,
                    )
                    : null;
                const clipId = sceneClipIdMap.get(sourceScene.id) || null;
                const copiedVideo = sourceScene.video.videoUrl && clipId
                    ? await copyAsset(
                        sourceScene.video.videoUrl,
                        `users/${userId}/storyboards/${storyboardId}/videos/${clipId}`,
                    )
                    : null;
                const copiedLastFrame = sourceScene.video.lastFrameUrl && clipId
                    ? await copyAsset(
                        sourceScene.video.lastFrameUrl,
                        `users/${userId}/storyboards/${storyboardId}/frames/${clipId}`,
                    )
                    : null;
                const imageArtifactId = copiedImage
                    ? `scene-image:${crypto.randomUUID()}`
                    : null;
                const nextScene: ImageStoryboard['scenes'][number] = {
                    ...sourceScene,
                    id: sceneId,
                    imageDesignRevision: 1,
                    videoDesignRevision: 1,
                    approvedImageArtifactId: imageArtifactId,
                    approvedVideoArtifactId:
                        sourceScene.video.status === 'approved' ? clipId : null,
                    generatedImage: copiedImage && sourceScene.generatedImage
                        ? {
                            id: imageArtifactId || crypto.randomUUID(),
                            url: copiedImage.url,
                            generatedAt: Date.now(),
                        }
                        : null,
                    video: {
                        ...sourceScene.video,
                        jobId: null,
                        clipId,
                        videoUrl: copiedVideo?.url || null,
                        lastFrameUrl: copiedLastFrame?.url || null,
                        artifactId: clipId,
                        approvedAt:
                            sourceScene.video.status === 'approved' && copiedVideo
                                ? Date.now()
                                : null,
                    },
                };
                scenes.push(nextScene);
                if (clipId && copiedVideo) {
                    clipDocuments.push({ id: clipId, scene: nextScene });
                }
            }

            const copiedMusic = source.videoProduction.backgroundMusicUrl
                ? await copyAsset(
                    source.videoProduction.backgroundMusicUrl,
                    `users/${userId}/storyboards/${storyboardId}/audio/background-music`,
                )
                : null;
            const copiedFinal = source.videoProduction.finalVideoUrl
                ? await copyAsset(
                    source.videoProduction.finalVideoUrl,
                    `users/${userId}/storyboards/${storyboardId}/final/final-video`,
                )
                : null;
            const finalClipId = copiedFinal
                ? doc(collection(db, VIDEO_STUDIO_CLIPS_COLLECTION)).id
                : null;
            const orderedClipIds = scenes.flatMap((scene) =>
                scene.video.clipId ? [scene.video.clipId] : [],
            );
            const baseProduction = createStoryboardVideoProduction();
            let copiedStoryboard: ImageStoryboard = {
                ...source,
                schemaVersion: 2,
                revision: 1,
                archivedAt: null,
                title: `${source.title} 전체 복사본`.slice(0, 100),
                referenceAssets,
                reclaimableStorageAssets: [],
                transitionLinks: [],
                cleanupStatus: 'idle',
                cleanupErrorMessage: null,
                scenes,
                videoProduction: {
                    ...baseProduction,
                    qualityMode: source.videoProduction.qualityMode,
                    maxBudgetUsd: source.videoProduction.maxBudgetUsd,
                    allowUnknownPricing: source.videoProduction.allowUnknownPricing,
                    voiceDirection: source.videoProduction.voiceDirection,
                    backgroundMusicUrl: copiedMusic?.url || null,
                    backgroundMusicName: copiedMusic
                        ? source.videoProduction.backgroundMusicName
                        : null,
                    backgroundMusicStoragePath: copiedMusic?.storagePath || null,
                    audioMixPreset: source.videoProduction.audioMixPreset,
                    backgroundMusicVolume:
                        source.videoProduction.backgroundMusicVolume,
                    sceneAudioVolume: source.videoProduction.sceneAudioVolume,
                    audioCrossfadeSeconds:
                        source.videoProduction.audioCrossfadeSeconds,
                    projectId: projectReference.id,
                    finalClipId,
                    finalVideoUrl: copiedFinal?.url || null,
                    finalStatus:
                        copiedFinal && orderedClipIds.length === scenes.length
                            ? 'completed'
                            : 'idle',
                    finalArtifactId: finalClipId,
                    finalFreshness:
                        copiedFinal && sourceWasCurrent ? 'current' : 'stale',
                    lastSuccessfulFinalVideoUrl: copiedFinal?.url || null,
                },
            };
            if (copiedFinal && orderedClipIds.length === scenes.length) {
                const resolution =
                    source.videoProduction.finalAssemblyManifest?.resolution ||
                    (source.videoProduction.qualityMode === 'final' ? '720p' : '480p');
                const manifest = createStoryboardFinalAssemblyManifest(
                    copiedStoryboard,
                    orderedClipIds,
                    resolution,
                );
                copiedStoryboard = {
                    ...copiedStoryboard,
                    videoProduction: {
                        ...copiedStoryboard.videoProduction,
                        finalAssemblyManifest: manifest,
                        finalFreshness: sourceWasCurrent ? 'current' : 'stale',
                    },
                };
            }
            copiedStoryboard = ImageStoryboardSchema.parse({
                ...copiedStoryboard,
                productionRecordSignature:
                    buildStoryboardProductionRecordSignature(copiedStoryboard),
            });

            const batch = writeBatch(db);
            batch.set(storyboardReference, {
                ...copiedStoryboard,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            batch.set(projectReference, {
                userId,
                title: copiedStoryboard.title,
                synopsis: copiedStoryboard.logline,
                aspectRatio: copiedStoryboard.aspectRatio,
                resolution:
                    copiedStoryboard.videoProduction.qualityMode === 'final'
                        ? '720p'
                        : '480p',
                starterImageUrl: copiedStoryboard.scenes[0]?.generatedImage?.url || null,
                starterImageSource: 'upload',
                starterAlbumId: null,
                starterPhotoId: null,
                starterStoragePath: null,
                clipCount: clipDocuments.length + (copiedFinal ? 1 : 0),
                coverClipId: finalClipId || clipDocuments.at(-1)?.id || null,
                coverUrl:
                    copiedFinal?.url ||
                    copiedStoryboard.scenes.at(-1)?.video.lastFrameUrl ||
                    copiedStoryboard.scenes[0]?.generatedImage?.url ||
                    null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            clipDocuments.forEach(({ id, scene }, index) => {
                batch.set(doc(db, VIDEO_STUDIO_CLIPS_COLLECTION, id), {
                    userId,
                    projectId: projectReference.id,
                    title: scene.title,
                    prompt: scene.video.motionPrompt,
                    mode: 'generate',
                    status: 'ready',
                    provider: 'openrouter',
                    sequence: index,
                    videoUrl: scene.video.videoUrl,
                    posterUrl: scene.generatedImage?.url || scene.video.lastFrameUrl,
                    lastFrameUrl: scene.video.lastFrameUrl,
                    continuityNotes: scene.continuityAnchor,
                    cameraNotes: scene.cameraDirection,
                    subjectLock: copiedStoryboard.characterContinuity,
                    takeGroupId: null,
                    parentTakeClipId: null,
                    takeIndex: null,
                    sourceClipId: null,
                    sourceVideoUrl: null,
                    mergeSourceClipIds: [],
                    duration: scene.video.durationSeconds,
                    aspectRatio: copiedStoryboard.aspectRatio,
                    resolution:
                        copiedStoryboard.videoProduction.qualityMode === 'final'
                            ? '720p'
                            : '480p',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            });
            if (copiedFinal && finalClipId) {
                batch.set(doc(db, VIDEO_STUDIO_CLIPS_COLLECTION, finalClipId), {
                    userId,
                    projectId: projectReference.id,
                    title: `${copiedStoryboard.title} · 최종본`,
                    prompt: '복사된 최종 완성본',
                    mode: 'merge',
                    status: 'ready',
                    provider: 'openrouter',
                    sequence: clipDocuments.length,
                    videoUrl: copiedFinal.url,
                    posterUrl: copiedStoryboard.scenes[0]?.generatedImage?.url || null,
                    lastFrameUrl: null,
                    continuityNotes: null,
                    cameraNotes: null,
                    subjectLock: null,
                    takeGroupId: null,
                    parentTakeClipId: null,
                    takeIndex: null,
                    sourceClipId: null,
                    sourceVideoUrl: null,
                    mergeSourceClipIds: orderedClipIds,
                    duration: null,
                    aspectRatio: copiedStoryboard.aspectRatio,
                    resolution:
                        copiedStoryboard.videoProduction.qualityMode === 'final'
                            ? '720p'
                            : '480p',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }
            await batch.commit();
            await syncStoryboardProductionRecords(
                userId,
                storyboardId,
                copiedStoryboard,
            );
            return storyboardId;
        } catch (error) {
            await Promise.allSettled(
                uploadedPaths.map((path) =>
                    deleteObject(storageRef(storage, path)),
                ),
            );
            throw error;
        }
    }

    async remove(userId: string, storyboardId: string): Promise<void> {
        const nestedCollections = await Promise.all([
            getDocs(storyboardVersionCollection(userId, storyboardId)),
            getDocs(storyboardSubcollection(
                userId,
                storyboardId,
                STORYBOARD_ARTIFACT_COLLECTION,
            )),
            getDocs(storyboardSubcollection(
                userId,
                storyboardId,
                STORYBOARD_TRANSITION_COLLECTION,
            )),
            getDocs(storyboardSubcollection(
                userId,
                storyboardId,
                STORYBOARD_FINAL_CUT_COLLECTION,
            )),
        ]);
        const nestedDocuments = nestedCollections.flatMap((snapshot) => snapshot.docs);
        for (let offset = 0; offset < nestedDocuments.length; offset += SAFE_BATCH_DELETE_SIZE) {
            const batch = writeBatch(db);
            nestedDocuments
                .slice(offset, offset + SAFE_BATCH_DELETE_SIZE)
                .forEach((nestedDocument) => batch.delete(nestedDocument.ref));
            await batch.commit();
        }
        const projectBatch = writeBatch(db);
        projectBatch.delete(storyboardDocument(userId, storyboardId));
        await projectBatch.commit();
    }

    async removeWithMedia(
        authToken: string,
        storyboardId: string,
    ): Promise<void> {
        const response = await fetch(
            `/api/storyboards/${encodeURIComponent(storyboardId)}`,
            {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            },
        );
        const payload = (await response.json().catch(() => null)) as
            | { success?: boolean; error?: string }
            | null;
        if (!response.ok || !payload?.success) {
            throw new Error(
                payload?.error ||
                '프로젝트와 생성 파일을 정리하지 못했습니다.',
            );
        }
    }

    async saveVersion(
        userId: string,
        storyboardId: string,
        storyboard: ImageStoryboard,
        label: string,
    ): Promise<void> {
        const parsed = ImageStoryboardSchema.parse(storyboard);
        const reference = doc(storyboardVersionCollection(userId, storyboardId));
        await setDoc(reference, {
            label: label.trim().slice(0, 120) || '수동 저장',
            storyboard: parsed,
            createdAt: serverTimestamp(),
        });

        const versions = await getDocs(query(
            storyboardVersionCollection(userId, storyboardId),
            orderBy('createdAt', 'desc'),
        ));
        const expiredVersions = versions.docs.slice(MAX_STORYBOARD_VERSIONS);
        for (let offset = 0; offset < expiredVersions.length; offset += SAFE_BATCH_DELETE_SIZE) {
            const batch = writeBatch(db);
            expiredVersions
                .slice(offset, offset + SAFE_BATCH_DELETE_SIZE)
                .forEach((version) => batch.delete(version.ref));
            await batch.commit();
        }
    }

    async listVersions(userId: string, storyboardId: string): Promise<SavedStoryboardVersion[]> {
        const snapshot = await getDocs(query(
            storyboardVersionCollection(userId, storyboardId),
            orderBy('createdAt', 'desc'),
            limit(MAX_STORYBOARD_VERSIONS),
        ));
        return snapshot.docs.flatMap((item) => {
            const raw = item.data();
            const parsed = ImageStoryboardSchema.safeParse(raw.storyboard);
            if (!parsed.success) return [];
            return [{
                id: item.id,
                label: typeof raw.label === 'string' ? raw.label : '저장된 버전',
                storyboard: parsed.data,
                createdAt: readTimestamp(raw.createdAt),
            }];
        });
    }

    async uploadReferenceAsset(
        userId: string,
        storyboardId: string,
        draft: ImageReferenceDraft,
    ): Promise<ImageReferenceAsset> {
        const id = crypto.randomUUID();
        if (/^https:\/\//i.test(draft.image)) {
            return {
                id,
                image: draft.image,
                name: draft.name.slice(0, 180),
                role: draft.role,
                storagePath: null,
                createdAt: Date.now(),
            };
        }

        const response = await fetch(draft.image);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
            throw new Error('참조 사진 형식을 확인하지 못했습니다.');
        }
        const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const path = `users/${userId}/storyboards/${storyboardId}/references/${id}.${extension}`;
        const reference = storageRef(storage, path);
        await uploadBytes(reference, blob, { contentType: blob.type });
        const image = await getDownloadURL(reference);
        return {
            id,
            image,
            name: draft.name.slice(0, 180),
            role: draft.role,
            storagePath: path,
            createdAt: Date.now(),
        };
    }

    async uploadBackgroundMusic(
        userId: string,
        storyboardId: string,
        file: File,
    ): Promise<{ url: string; storagePath: string; name: string }> {
        if (!file.type.startsWith('audio/')) {
            throw new Error('MP3, WAV, M4A 등 오디오 파일을 선택해 주세요.');
        }
        if (file.size > 30 * 1024 * 1024) {
            throw new Error('배경음악은 30 MB 이하 파일만 사용할 수 있습니다.');
        }
        const id = crypto.randomUUID();
        const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'mp3';
        const path = `users/${userId}/storyboards/${storyboardId}/audio/${id}.${extension}`;
        const reference = storageRef(storage, path);
        await uploadBytes(reference, file, { contentType: file.type || 'audio/mpeg' });
        return {
            url: await getDownloadURL(reference),
            storagePath: path,
            name: file.name.slice(0, 180),
        };
    }

    async deleteGeneratedImage(
        userId: string,
        storyboardId: string,
        image: { id: string; storagePath: string },
    ): Promise<void> {
        if (!isOwnedStoryboardStoragePath(userId, storyboardId, image.storagePath)) {
            throw new Error('현재 스토리보드 전용 파일만 즉시 정리할 수 있습니다.');
        }
        const historyReference = doc(db, 'ai_generations', image.id);
        const historySnapshot = await getDoc(historyReference);
        if (
            historySnapshot.exists() &&
            historySnapshot.data().userId !== userId
        ) {
            throw new Error('다른 사용자의 이미지 파일은 정리할 수 없습니다.');
        }
        await deleteObject(storageRef(storage, image.storagePath)).catch((error) => {
            if (!isStorageObjectMissing(error)) throw error;
        });
        if (historySnapshot.exists()) await deleteDoc(historyReference);
    }

    async inspectReclaimableStorageAssets(
        userId: string,
        storyboardId: string,
        assets: StoryboardStorageCleanupAsset[],
    ): Promise<StoryboardCleanupFileInfo[]> {
        return Promise.all(assets.map(async (asset) => {
            if (!isOwnedStoryboardStoragePath(userId, storyboardId, asset.storagePath)) {
                return {
                    id: asset.id,
                    storagePath: asset.storagePath,
                    sizeBytes: null,
                    updatedAt: null,
                    missing: true,
                };
            }

            try {
                const metadata = await getMetadata(storageRef(storage, asset.storagePath));
                return {
                    id: asset.id,
                    storagePath: asset.storagePath,
                    sizeBytes: Number.isFinite(Number(metadata.size)) ? Number(metadata.size) : null,
                    updatedAt: metadata.updated || null,
                    missing: false,
                };
            } catch (error) {
                if (isStorageObjectMissing(error)) {
                    return {
                        id: asset.id,
                        storagePath: asset.storagePath,
                        sizeBytes: null,
                        updatedAt: null,
                        missing: true,
                    };
                }
                throw error;
            }
        }));
    }

    async deleteReclaimableStorageAssets(
        userId: string,
        storyboardId: string,
        assets: StoryboardStorageCleanupAsset[],
    ): Promise<StoryboardCleanupDeletionResult> {
        const results = await Promise.all(assets.map(async (asset) => {
            if (!isOwnedStoryboardStoragePath(userId, storyboardId, asset.storagePath)) {
                return {
                    storagePath: asset.storagePath,
                    deleted: false,
                    message: 'This file is outside the current storyboard storage area.',
                };
            }

            try {
                await deleteObject(storageRef(storage, asset.storagePath));
                return { storagePath: asset.storagePath, deleted: true, message: null };
            } catch (error) {
                if (isStorageObjectMissing(error)) {
                    return { storagePath: asset.storagePath, deleted: true, message: null };
                }
                return {
                    storagePath: asset.storagePath,
                    deleted: false,
                    message: error instanceof Error ? error.message : 'Failed to delete the file.',
                };
            }
        }));

        return {
            deletedStoragePaths: results.filter((result) => result.deleted).map((result) => result.storagePath),
            failed: results.flatMap((result) => result.deleted || !result.message
                ? []
                : [{ storagePath: result.storagePath, message: result.message }]),
        };
    }
}

export const imageStoryboardService = new ImageStoryboardService();
