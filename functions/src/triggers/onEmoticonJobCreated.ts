import { createHash, randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import {
    analyzeEmoticonDirection,
    evaluateEmoticonMotion,
    evaluateEmoticonPose,
    normalizeEmoticonPlanTiming,
    planEmoticonFrameSequence,
} from '../emoticonStudio/director';
import {
    generateEmoticonAnimationFrame,
    generateEmoticonPose,
} from '../emoticonStudio/imageGeneration';
import {
    evaluateEmoticonFrameVariation,
    normalizeEmoticonSourceImage,
    normalizeGeneratedEmoticonPose,
    renderImageEmoticon,
    renderImageSequenceEmoticon,
    type RenderedEmoticonFile,
} from '../emoticonStudio/renderer';
import {
    emoticonAnimationFrameSchema,
    emoticonCharacterProfileSchema,
    emoticonJobRequestSchema,
    emoticonPlanSchema,
    emoticonPresetSchema,
    type EmoticonCharacterProfile,
    type EmoticonAnimationFrame,
    type EmoticonJobRequest,
    type EmoticonMotionReview,
    type EmoticonPlan,
    type EmoticonPreset,
    type EmoticonQuality,
} from '../emoticonStudio/schema';
import {
    meetsEmoticonMotionAcceptance,
    meetsEmoticonPoseAcceptance,
} from '../emoticonStudio/qualityStandards';
import { FIRESTORE_DATABASE_ID, db } from '../firestore';
import { getOpenRouterRuntimeConfig } from '../openrouter';
import { openRouterApiKey } from '../secrets';

if (!admin.apps.length) {
    admin.initializeApp();
}

const triggerConfig = {
    document: 'users/{userId}/emoticonJobs/{jobId}',
    database: FIRESTORE_DATABASE_ID,
    timeoutSeconds: 540,
    memory: '4GiB' as const,
    region: 'asia-northeast3',
    secrets: [openRouterApiKey],
};

type UploadedAsset = {
    url: string;
    storagePath: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
};

type CharacterAnalysisCache = {
    characterProfile: EmoticonCharacterProfile;
    suggestedPresets: EmoticonPreset[];
};

function characterCacheId(userId: string, sourceStoragePath: string, sourceFingerprint: string): string {
    return createHash('sha256')
        .update(`${userId}:${sourceStoragePath}:${sourceFingerprint}`)
        .digest('hex');
}

async function loadCharacterAnalysisCache(
    userId: string,
    sourceStoragePath: string,
    sourceFingerprint: string,
): Promise<CharacterAnalysisCache | null> {
    const cacheRef = db.doc(
        `emoticonStudioCharacterProfiles/${characterCacheId(userId, sourceStoragePath, sourceFingerprint)}`,
    );
    const snapshot = await cacheRef.get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() || {};
    if (
        data.userId !== userId
        || data.sourceStoragePath !== sourceStoragePath
        || data.sourceFingerprint !== sourceFingerprint
    ) return null;
    const profile = emoticonCharacterProfileSchema.safeParse(data.characterProfile);
    const presets = emoticonPresetSchema.array().min(4).max(12).safeParse(data.suggestedPresets);
    if (!profile.success || !presets.success) return null;
    return {
        characterProfile: profile.data,
        suggestedPresets: presets.data,
    };
}

async function saveCharacterAnalysisCache(params: {
    userId: string;
    sourceStoragePath: string;
    sourceFingerprint: string;
    plan: EmoticonPlan;
}): Promise<void> {
    const cacheRef = db.doc(
        `emoticonStudioCharacterProfiles/${characterCacheId(
            params.userId,
            params.sourceStoragePath,
            params.sourceFingerprint,
        )}`,
    );
    await cacheRef.set({
        userId: params.userId,
        sourceStoragePath: params.sourceStoragePath,
        sourceFingerprint: params.sourceFingerprint,
        characterProfile: params.plan.characterProfile,
        suggestedPresets: params.plan.suggestedPresets,
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}

async function enforceRateLimit(userId: string, mode: 'generate' | 'rerender'): Promise<void> {
    const ref = db.doc(`emoticonStudioRateLimits/${userId}`);
    const nowMs = Date.now();
    const windowMs = 60_000;
    const limit = mode === 'generate' ? 8 : 20;
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data() || {};
        const prefix = mode === 'generate' ? 'generation' : 'rerender';
        const previousStart = typeof data[`${prefix}WindowStartMs`] === 'number'
            ? data[`${prefix}WindowStartMs`] as number
            : 0;
        const previousCount = typeof data[`${prefix}Count`] === 'number'
            ? data[`${prefix}Count`] as number
            : 0;
        const inWindow = nowMs - previousStart < windowMs;
        const nextCount = inWindow ? previousCount + 1 : 1;
        if (nextCount > limit) {
            throw new Error(`Rate limit exceeded for ${mode}. Try again in about one minute.`);
        }
        transaction.set(ref, {
            userId,
            [`${prefix}WindowStartMs`]: inWindow ? previousStart : nowMs,
            [`${prefix}Count`]: nextCount,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}

function buildSpecReport(plan: EmoticonPlan) {
    return {
        width: 360 as const,
        height: 360 as const,
        frameCount: plan.action.frameCount,
        fps: plan.action.fps,
        durationMs: plan.action.durationMs,
        loop: true as const,
        kakaoCanvasPass: true,
        kakaoFramePass: plan.action.frameCount >= 8 && plan.action.frameCount <= 24,
    };
}

function isStaleWorkingJob(value: Record<string, unknown>): boolean {
    const workingStatuses = new Set(['queued', 'analyzing', 'generating', 'validating', 'animating', 'rendering']);
    if (typeof value.status !== 'string' || !workingStatuses.has(value.status)) return false;
    const updatedAt = value.updatedAt as { toMillis?: () => number } | undefined;
    const updatedAtMs = typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : 0;
    return updatedAtMs > 0 && Date.now() - updatedAtMs >= 10 * 60 * 1000;
}

function buildFirebaseDownloadUrl(params: {
    bucketName: string;
    storagePath: string;
    downloadToken: string;
}) {
    return `https://firebasestorage.googleapis.com/v0/b/${params.bucketName}/o/`
        + `${encodeURIComponent(params.storagePath)}?alt=media&token=${encodeURIComponent(params.downloadToken)}`;
}

async function uploadBuffer(params: {
    userId: string;
    jobId: string;
    fileName: string;
    buffer: Buffer;
    contentType: string;
}): Promise<UploadedAsset> {
    const bucket = admin.storage().bucket();
    const storagePath = `users/${params.userId}/emoticon-studio/jobs/${params.jobId}/${params.fileName}`;
    const downloadToken = randomUUID();
    await bucket.file(storagePath).save(params.buffer, {
        resumable: false,
        contentType: params.contentType,
        metadata: {
            cacheControl: 'private, max-age=3600',
            metadata: {
                firebaseStorageDownloadTokens: downloadToken,
            },
        },
    });
    return {
        url: buildFirebaseDownloadUrl({
            bucketName: bucket.name,
            storagePath,
            downloadToken,
        }),
        storagePath,
        fileName: params.fileName,
        contentType: params.contentType,
        sizeBytes: params.buffer.byteLength,
    };
}

async function prepareCanonicalSource(params: {
    userId: string;
    jobId: string;
    sourceStoragePath: string;
}): Promise<{ asset: UploadedAsset; fingerprint: string }> {
    const file = admin.storage().bucket().file(params.sourceStoragePath);
    const [metadata] = await file.getMetadata().catch(() => {
        throw new Error('Source image could not be found in this user workspace.');
    });
    const sizeBytes = Number(metadata.size || 0);
    const contentType = metadata.contentType?.split(';')[0] || '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
        throw new Error('Source image must be a PNG, JPEG, or WebP file.');
    }
    if (!sizeBytes || sizeBytes > 25 * 1024 * 1024) {
        throw new Error('Source image must be smaller than 25 MB.');
    }
    const [sourceBuffer] = await file.download();
    const normalized = await normalizeEmoticonSourceImage(sourceBuffer);
    const asset = await uploadBuffer({
        userId: params.userId,
        jobId: params.jobId,
        fileName: 'source.png',
        buffer: normalized,
        contentType: 'image/png',
    });
    return {
        asset,
        fingerprint: String(metadata.md5Hash || metadata.generation || `${sizeBytes}:${metadata.updated || ''}`),
    };
}

async function downloadStoredPose(storagePath: string): Promise<Buffer> {
    const file = admin.storage().bucket().file(storagePath);
    const [metadata] = await file.getMetadata().catch(() => {
        throw new Error('The stored key pose could not be found.');
    });
    const sizeBytes = Number(metadata.size || 0);
    if (!metadata.contentType?.startsWith('image/') || !sizeBytes || sizeBytes > 30 * 1024 * 1024) {
        throw new Error('The stored key pose is invalid or too large.');
    }
    const [buffer] = await file.download();
    return normalizeGeneratedEmoticonPose(buffer);
}

async function downloadStoredAnimationFrames(params: {
    userId: string;
    parentJobId: string;
    frames: EmoticonAnimationFrame[];
}): Promise<Buffer[]> {
    const expectedPrefix = `users/${params.userId}/emoticon-studio/jobs/${params.parentJobId}/`;
    if (params.frames.some((frame) => !frame.storagePath.startsWith(expectedPrefix))) {
        throw new Error('The stored animation frames do not belong to the original job.');
    }
    return Promise.all(params.frames.map((frame) => downloadStoredPose(frame.storagePath)));
}

async function uploadRenderedFiles(params: {
    userId: string;
    jobId: string;
    files: RenderedEmoticonFile[];
}): Promise<Record<string, UploadedAsset & { format: string }>> {
    const outputs: Record<string, UploadedAsset & { format: string }> = {};
    for (const file of params.files) {
        const uploaded = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: `emoticon-${params.jobId.slice(0, 8)}.${file.extension}`,
            buffer: file.buffer,
            contentType: file.contentType,
        });
        outputs[file.format] = {
            ...uploaded,
            format: file.format,
        };
    }
    return outputs;
}

function qualityScore(quality: EmoticonQuality): number {
    return quality.identity * 0.35
        + quality.styleConsistency * 0.2
        + quality.actionClarity * 0.1
        + quality.backgroundClean * 0.2
        + quality.occlusionFree * 0.1
        + quality.overall * 0.05
        + (quality.singleCharacter ? 5 : 0);
}

function needsPoseIsolationCorrection(quality: EmoticonQuality): boolean {
    return !meetsEmoticonPoseAcceptance(quality);
}

function safeErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/true body-motion|camera-only|still-pose animation|verified body animation|verified character animation|isolated character/i.test(message)) {
        return '캐릭터에 배경·잔재·겹침이 남았거나 동작 변화가 충분하지 않아 결과를 저장하지 않았어요. 다시 시도해 주세요.';
    }
    if (/OPENROUTER_API_KEY/i.test(message)) {
        return 'OpenRouter API 키가 설정되지 않았습니다. 관리자 설정을 확인해 주세요.';
    }
    if (/insufficient|credit|payment|balance/i.test(message)) {
        return 'OpenRouter 크레딧이 부족하거나 결제 설정을 확인해야 합니다.';
    }
    if (/timed? ?out|deadline|abort/i.test(message)) {
        return 'AI 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (/rate limit exceeded/i.test(message)) {
        return '한 번에 너무 많은 작업을 요청했어요. 약 1분 뒤 다시 시도해 주세요.';
    }
    if (/source image/i.test(message)) {
        return '원본 이미지를 읽을 수 없어요. 25MB 이하의 PNG, JPG, WebP 파일을 다시 넣어 주세요.';
    }
    if (/generated (?:image|pose)|non-image result/i.test(message)) {
        return 'AI가 사용할 수 없는 이미지를 반환했어요. 같은 설정으로 다시 시도해 주세요.';
    }
    if (/frame sequence|required ordered/i.test(message)) {
        return 'AI가 프레임별 동작 계획을 완성하지 못했어요. 같은 요청으로 다시 시도해 주세요.';
    }
    return '이모티콘을 만드는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
}

async function reviewPose(params: {
    apiKey: string;
    model: string;
    fallbackModels: string[];
    sourceImageUrl: string;
    generatedImageUrl: string;
    plan: EmoticonPlan;
    allowBackground?: boolean;
}): Promise<EmoticonQuality> {
    try {
        return await evaluateEmoticonPose(params);
    } catch (error) {
        logger.warn('[EmoticonStudio] Automated pose review failed; rejecting the unverified pose.', {
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            overall: 0,
            identity: 0,
            actionClarity: 0,
            styleConsistency: 0,
            backgroundClean: 0,
            singleCharacter: false,
            occlusionFree: 0,
            issues: ['자동 일관성 검사를 완료하지 못했습니다. 결과를 직접 확인해 주세요.'],
            correction: 'Recreate one isolated full character on a genuinely transparent background with no duplicate parts, residue, or occlusion; preserve the source identity exactly.',
        };
    }
}

function toMotionQuality(review: EmoticonMotionReview): EmoticonQuality {
    return {
        overall: review.overall,
        identity: review.identity,
        actionClarity: Math.min(
            review.actionClarity,
            Math.max(review.limbPoseChange, review.facialExpressionChange),
        ),
        styleConsistency: review.styleConsistency,
        backgroundClean: review.backgroundClean,
        singleCharacter: review.singleCharacter,
        occlusionFree: review.occlusionFree,
        issues: review.issues,
        correction: review.correction,
    };
}

function isVerifiedBodyMotion(review: EmoticonMotionReview): boolean {
    return meetsEmoticonMotionAcceptance(review);
}

function isDynamicRender(plan: EmoticonPlan): boolean {
    return plan.action.renderMode === 'dynamic';
}

function buildFrameSequenceSeed(jobId: string): number {
    return Number.parseInt(
        createHash('sha256').update(`emoticon-frame-sequence:${jobId}`).digest('hex').slice(0, 8),
        16,
    ) & 0x7fffffff;
}

async function reviewImageFrameSequence(params: {
    apiKey: string;
    model: string;
    fallbackModels: string[];
    sourceImageUrl: string;
    frameUrls: string[];
    plan: EmoticonPlan;
}): Promise<EmoticonMotionReview> {
    return evaluateEmoticonMotion({
        apiKey: params.apiKey,
        model: params.model,
        fallbackModels: params.fallbackModels,
        sourceImageUrl: params.sourceImageUrl,
        frameUrls: params.frameUrls,
        plan: params.plan,
    });
}

async function renderAiFrameSequenceOutputs(params: {
    apiKey: string;
    model: string;
    fallbackModels: string[];
    sourceImageUrl: string;
    userId: string;
    jobId: string;
    plan: EmoticonPlan;
    poseBuffer: Buffer;
    poseUrl: string;
    formats: Parameters<typeof renderImageEmoticon>[0]['formats'];
    update: (data: Record<string, unknown>) => Promise<void>;
}): Promise<{
    files: RenderedEmoticonFile[];
    motionFallbackReason: string | null;
    motionQuality: EmoticonQuality | null;
    animationFrames: EmoticonAnimationFrame[];
}> {
    const frameCount = params.plan.action.frameCount;
    const sequenceSeed = buildFrameSequenceSeed(params.jobId);
    const frameBuffers: Buffer[] = [];
    const frameUrls: string[] = [];
    const animationFrames: EmoticonAnimationFrame[] = [];
    let totalGenerationCalls = 0;

    await params.update({
        status: 'animating',
        progress: 61,
        statusMessage: `${frameCount}개 프레임의 동작·표정 흐름을 먼저 설계하고 있어요.`,
    });
    const frameSequence = await planEmoticonFrameSequence({
        apiKey: params.apiKey,
        model: params.model,
        fallbackModels: params.fallbackModels,
        sourceImageUrl: params.sourceImageUrl,
        plan: params.plan,
    });
    await params.update({
        frameSequencePlan: frameSequence,
        frameGeneration: {
            strategy: 'openrouter-image-sequence',
            requestedFrameCount: frameCount,
            generatedFrameCount: 0,
            totalGenerationCalls: 0,
            repairPasses: 0,
        },
    });

    const generateFrames = async (paramsForPass: {
        startIndex: number;
        pass: 1 | 2;
        correction?: string;
    }): Promise<void> => {
        const { startIndex, pass, correction } = paramsForPass;
        frameBuffers.splice(startIndex);
        frameUrls.splice(startIndex);
        animationFrames.splice(startIndex);
        let previousFrameUrl = startIndex === 0
            ? params.poseUrl
            : frameUrls[startIndex - 1];
        for (let frameIndex = startIndex; frameIndex < frameCount; frameIndex += 1) {
            const passProgressStart = pass === 1 ? 63 : 81;
            const passProgressSpan = pass === 1 ? 15 : 4;
            const progress = passProgressStart + Math.round(
                ((frameIndex - startIndex + 1) / Math.max(1, frameCount - startIndex))
                * passProgressSpan,
            );
            await params.update({
                status: 'animating',
                progress,
                statusMessage: pass === 1
                    ? `배경 잔재 없이 표정과 팔다리가 달라지는 AI 프레임 ${frameIndex + 1}/${frameCount}을 만들고 있어요.`
                    : `배경·겹침이 남은 구간을 보정해 프레임 ${frameIndex + 1}/${frameCount}을 다시 만들고 있어요.`,
            });
            const generated = await generateEmoticonAnimationFrame({
                apiKey: params.apiKey,
                sourceImageUrl: params.sourceImageUrl,
                previousFrameUrl,
                plan: params.plan,
                direction: frameSequence.frames[frameIndex],
                frameCount,
                correction,
                seed: sequenceSeed,
            });
            totalGenerationCalls += 1;
            const buffer = await normalizeGeneratedEmoticonPose(generated.buffer);
            const filePrefix = pass === 1 ? 'ai-frame' : 'ai-frame-repair';
            const asset = await uploadBuffer({
                userId: params.userId,
                jobId: params.jobId,
                fileName: `${filePrefix}-${String(frameIndex + 1).padStart(3, '0')}.png`,
                buffer,
                contentType: 'image/png',
            });
            frameBuffers.push(buffer);
            frameUrls.push(asset.url);
            animationFrames.push({
                ...asset,
                contentType: 'image/png',
            });
            previousFrameUrl = asset.url;
        }
    };

    await generateFrames({ startIndex: 0, pass: 1 });
    await params.update({
        frameGeneration: {
            strategy: 'openrouter-image-sequence',
            requestedFrameCount: frameCount,
            generatedFrameCount: frameUrls.length,
            totalGenerationCalls,
            repairPasses: 0,
        },
        animationFrames,
    });

    const reviewFrames = async (reviewPass: 1 | 2): Promise<EmoticonMotionReview> => {
        await params.update({
            status: 'validating',
            progress: reviewPass === 1 ? 80 : 86,
            statusMessage: `AI가 ${frameCount}개 전체 프레임의 캐릭터·배경 분리·동작·표정·루프 연결을 확인하고 있어요.`,
        });
        const localVariation = await evaluateEmoticonFrameVariation(frameBuffers);
        if (!localVariation.passes) {
            return {
                overall: 0,
                identity: 0,
                actionClarity: 0,
                styleConsistency: 0,
                limbPoseChange: 0,
                facialExpressionChange: 0,
                frameConsistency: 0,
                loopContinuity: 0,
                backgroundClean: 0,
                singleCharacter: false,
                occlusionFree: 0,
                cameraOnly: true,
                problemFrameIndices: [...new Set(localVariation.duplicateFrameIndices)].slice(0, 8),
                issues: ['Generated animation contains identical or near-identical adjacent frames.'],
                correction: 'Regenerate every flagged frame with a visibly different character pose or facial expression; do not repeat or hold the preceding image.',
            };
        }
        return reviewImageFrameSequence({
            apiKey: params.apiKey,
            model: params.model,
            fallbackModels: params.fallbackModels,
            sourceImageUrl: params.sourceImageUrl,
            frameUrls,
            plan: params.plan,
        });
    };

    let review = await reviewFrames(1);
    if (!isVerifiedBodyMotion(review)) {
        const validProblemIndices = review.problemFrameIndices
            .filter((index) => index >= 0 && index < frameCount);
        const repairStartIndex = validProblemIndices.length
            ? Math.min(...validProblemIndices)
            : 0;
        const correction = review.correction.trim()
            || 'Strengthen the changing body poses and facial expressions while preserving exact character identity and a smooth loop.';
        await params.update({
            status: 'animating',
            progress: 81,
            statusMessage: `${repairStartIndex + 1}번 프레임부터 배경 잔재·겹침이 남은 구간을 한 번 정밀 보정할게요.`,
            motionReview: review,
        });
        await generateFrames({
            startIndex: repairStartIndex,
            pass: 2,
            correction,
        });
        await params.update({
            frameGeneration: {
                strategy: 'openrouter-image-sequence',
                requestedFrameCount: frameCount,
                generatedFrameCount: frameUrls.length,
                totalGenerationCalls,
                repairPasses: 1,
                repairStartIndex,
            },
            animationFrames,
        });
        review = await reviewFrames(2);
    }
    if (!isVerifiedBodyMotion(review)) {
        await params.update({
            motionReview: review,
            frameGeneration: {
                strategy: 'openrouter-image-sequence',
                requestedFrameCount: frameCount,
                generatedFrameCount: frameUrls.length,
                totalGenerationCalls,
                repairPasses: 1,
            },
        });
        throw new Error(
            `AI image frame sequence was not a verified character animation `
            + `(identity ${review.identity}, action ${review.actionClarity}, limbs ${review.limbPoseChange}, `
            + `face ${review.facialExpressionChange}, consistency ${review.frameConsistency}, `
            + `loop ${review.loopContinuity}, background ${review.backgroundClean}, `
            + `singleCharacter ${review.singleCharacter}, occlusion ${review.occlusionFree}, `
            + `cameraOnly ${review.cameraOnly}). `
            + `${review.correction || 'Distinct limb poses or facial expressions were not visible.'}`,
        );
    }
    await params.update({
        motionReview: review,
        status: 'rendering',
        progress: 88,
        statusMessage: '검증을 통과한 AI 프레임을 선택한 파일 형식으로 연결하고 있어요.',
    });
    return {
        files: await renderImageSequenceEmoticon({
            frameBuffers,
            plan: params.plan,
            formats: params.formats,
        }),
        motionFallbackReason: null,
        motionQuality: toMotionQuality(review),
        animationFrames,
    };
}

async function renderVerifiedDynamicOutputs(params: {
    apiKey: string;
    model: string;
    fallbackModels: string[];
    sourceImageUrl: string;
    userId: string;
    jobId: string;
    plan: EmoticonPlan;
    poseBuffer: Buffer;
    poseUrl: string;
    formats: Parameters<typeof renderImageEmoticon>[0]['formats'];
    update: (data: Record<string, unknown>) => Promise<void>;
}): Promise<{
    files: RenderedEmoticonFile[];
    motionFallbackReason: string | null;
    motionQuality: EmoticonQuality | null;
    animationFrames: EmoticonAnimationFrame[];
}> {
    return renderAiFrameSequenceOutputs(params);
}

async function renderOutputs(params: {
    apiKey: string;
    model: string;
    fallbackModels: string[];
    sourceImageUrl: string;
    userId: string;
    jobId: string;
    plan: EmoticonPlan;
    poseBuffer: Buffer;
    poseUrl: string;
    formats: Parameters<typeof renderImageEmoticon>[0]['formats'];
    update: (data: Record<string, unknown>) => Promise<void>;
}): Promise<{
    files: RenderedEmoticonFile[];
    motionFallbackReason: string | null;
    motionQuality: EmoticonQuality | null;
    animationFrames?: EmoticonAnimationFrame[];
}> {
    if (isDynamicRender(params.plan)) {
        return renderVerifiedDynamicOutputs(params);
    }

    return {
        files: await renderImageEmoticon({
            imageBuffer: params.poseBuffer,
            plan: params.plan,
            formats: params.formats,
        }),
        motionFallbackReason: null,
        motionQuality: null,
    };
}

async function rerenderExistingJob(params: {
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
    update: (data: Record<string, unknown>) => Promise<void>;
}): Promise<void> {
    if (!params.request.parentJobId) {
        throw new Error('A parent job is required for a no-cost rerender.');
    }
    const parentRef = db.doc(`users/${params.userId}/emoticonJobs/${params.request.parentJobId}`);
    const parentSnapshot = await parentRef.get();
    if (!parentSnapshot.exists) throw new Error('The original completed job could not be found.');
    const parent = parentSnapshot.data() || {};
    if (parent.status !== 'completed' && parent.status !== 'failed' && !isStaleWorkingJob(parent)) {
        throw new Error('Only completed or recoverable failed jobs can be rerendered.');
    }
    const parentPlan = emoticonPlanSchema.safeParse(parent.plan);
    if (!parentPlan.success) throw new Error('The original animation plan is unavailable.');
    const isDynamicParent = parentPlan.data.action.renderMode === 'dynamic';
    if (isDynamicParent && parent.status !== 'completed') {
        throw new Error('Only a completed, verified animation can be reused for a no-cost speech-bubble rerender.');
    }
    const storedAnimationFrames = isDynamicParent
        ? emoticonAnimationFrameSchema.array()
            .length(parentPlan.data.action.frameCount)
            .safeParse(parent.animationFrames)
        : null;
    if (isDynamicParent && !storedAnimationFrames?.success) {
        throw new Error(
            'The verified animation frames are unavailable, so this motion-preserving rerender cannot run. '
            + 'Create a new animated emoticon to regenerate the missing frames.',
        );
    }
    const poseStoragePath = typeof parent.keyPoseStoragePath === 'string'
        ? parent.keyPoseStoragePath
        : '';
    const expectedPrefix = `users/${params.userId}/emoticon-studio/jobs/`;
    if (!poseStoragePath.startsWith(expectedPrefix)) {
        throw new Error('The original key pose is unavailable.');
    }

    await params.update({
        status: 'rendering',
        progress: 35,
        statusMessage: '기존 캐릭터는 그대로 두고 말풍선과 프레임만 다시 조립하고 있어요.',
        error: null,
        analysisReused: true,
    });
    if (isDynamicParent && storedAnimationFrames?.success) {
        const plan = normalizeEmoticonPlanTiming({
            ...parentPlan.data,
            bubble: params.request.renderOverrides?.bubble || parentPlan.data.bubble,
        });
        const frameBuffers = await downloadStoredAnimationFrames({
            userId: params.userId,
            parentJobId: params.request.parentJobId,
            frames: storedAnimationFrames.data,
        });
        const animationFrames = await Promise.all(frameBuffers.map(async (buffer, index) => {
            const asset = await uploadBuffer({
                userId: params.userId,
                jobId: params.jobId,
                fileName: `reused-ai-frame-${String(index + 1).padStart(3, '0')}.png`,
                buffer,
                contentType: 'image/png',
            });
            return { ...asset, contentType: 'image/png' as const };
        }));
        await params.update({
            status: 'rendering',
            progress: 55,
            statusMessage: '검증된 동작 프레임을 그대로 유지하고 말풍선만 다시 배치하고 있어요.',
            plan,
            keyPoseUrl: parent.keyPoseUrl,
            keyPoseStoragePath: poseStoragePath,
            animationFrames,
        });
        const files = await renderImageSequenceEmoticon({
            frameBuffers,
            plan,
            formats: params.request.formats,
        });
        const outputs = await uploadRenderedFiles({
            userId: params.userId,
            jobId: params.jobId,
            files,
        });
        await params.update({
            status: 'completed',
            progress: 100,
            statusMessage: '말풍선 수정본이 완성되었어요.',
            plan,
            ...(parent.quality ? { quality: parent.quality } : {}),
            sourceImageUrl: parent.sourceImageUrl,
            sourceStoragePath: parent.sourceStoragePath,
            ...(parent.sourceCanonicalStoragePath
                ? { sourceCanonicalStoragePath: parent.sourceCanonicalStoragePath }
                : {}),
            ...(parent.sourceFingerprint ? { sourceFingerprint: parent.sourceFingerprint } : {}),
            keyPoseUrl: parent.keyPoseUrl,
            keyPoseStoragePath: poseStoragePath,
            animationFrames,
            outputs,
            specReport: buildSpecReport(plan),
            analysisReused: true,
            motionFallbackReason: null,
            completedAt: FieldValue.serverTimestamp(),
        });
        return;
    }
    const poseBuffer = await downloadStoredPose(poseStoragePath);
    const plan = normalizeEmoticonPlanTiming({
        ...parentPlan.data,
        action: {
            ...parentPlan.data.action,
            renderMode: 'keyframes',
            motionType: parentPlan.data.action.motionType === 'dynamic'
                ? 'bob'
                : parentPlan.data.action.motionType,
        },
        bubble: params.request.renderOverrides?.bubble || parentPlan.data.bubble,
    });
    await params.update({
        status: 'rendering',
        progress: 55,
        statusMessage: '수정한 설정으로 프레임을 다시 조립하고 있어요.',
        plan,
        keyPoseUrl: parent.keyPoseUrl,
        keyPoseStoragePath: poseStoragePath,
    });
    const files = await renderImageEmoticon({
        imageBuffer: poseBuffer,
        plan,
        formats: params.request.formats,
    });
    await params.update({
        status: 'rendering',
        progress: 82,
        statusMessage: '선택한 파일 형식으로 저장하고 있어요.',
        plan,
    });
    const outputs = await uploadRenderedFiles({
        userId: params.userId,
        jobId: params.jobId,
        files,
    });
    await params.update({
        status: 'completed',
        progress: 100,
        statusMessage: '말풍선 수정본이 완성됐어요.',
        plan,
        ...(parent.quality ? { quality: parent.quality } : {}),
        sourceImageUrl: parent.sourceImageUrl,
        sourceStoragePath: parent.sourceStoragePath,
        ...(parent.sourceCanonicalStoragePath
            ? { sourceCanonicalStoragePath: parent.sourceCanonicalStoragePath }
            : {}),
        ...(parent.sourceFingerprint ? { sourceFingerprint: parent.sourceFingerprint } : {}),
        keyPoseUrl: parent.keyPoseUrl,
        keyPoseStoragePath: poseStoragePath,
        outputs,
        specReport: buildSpecReport(plan),
        analysisReused: true,
        motionFallbackReason: null,
        completedAt: FieldValue.serverTimestamp(),
    });
}

export const onEmoticonJobCreated = onDocumentCreated(triggerConfig, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const userId = event.params.userId;
    const jobId = event.params.jobId;
    const jobRef = db.doc(`users/${userId}/emoticonJobs/${jobId}`);
    const update = async (data: Record<string, unknown>) => {
        await jobRef.update({
            ...data,
            updatedAt: FieldValue.serverTimestamp(),
        });
    };

    try {
        const parsed = emoticonJobRequestSchema.safeParse(snapshot.data());
        if (!parsed.success) {
            throw new Error(`Invalid emoticon job: ${parsed.error.issues[0]?.message || 'unknown error'}`);
        }
        if (parsed.data.userId && parsed.data.userId !== userId) {
            throw new Error('The job user does not match its document owner.');
        }
        const expectedSourcePrefix = `users/${userId}/emoticon-studio/sources/`;
        if (!parsed.data.sourceStoragePath.startsWith(expectedSourcePrefix)) {
            throw new Error('The source image does not belong to this user.');
        }
        await enforceRateLimit(userId, parsed.data.mode);
        if (parsed.data.mode === 'rerender') {
            await rerenderExistingJob({
                userId,
                jobId,
                request: parsed.data,
                update,
            });
            logger.info('[EmoticonStudio] No-cost rerender completed.', {
                userId,
                jobId,
                parentJobId: parsed.data.parentJobId,
                formats: parsed.data.formats,
            });
            return;
        }

        const runtime = getOpenRouterRuntimeConfig();
        if (!runtime.apiKey) throw new Error('OPENROUTER_API_KEY is not configured.');

        const preparedSource = await prepareCanonicalSource({
            userId,
            jobId,
            sourceStoragePath: parsed.data.sourceStoragePath,
        });
        const canonicalSource = preparedSource.asset;
        const cachedAnalysis = await loadCharacterAnalysisCache(
            userId,
            parsed.data.sourceStoragePath,
            preparedSource.fingerprint,
        );
        await update({
            status: 'analyzing',
            progress: 8,
            statusMessage: '캐릭터 특징과 요청한 행동을 살펴보고 있어요',
            error: null,
            analysisReused: Boolean(cachedAnalysis),
            sourceImageUrl: canonicalSource.url,
            sourceCanonicalStoragePath: canonicalSource.storagePath,
            sourceFingerprint: preparedSource.fingerprint,
        });
        const plan = await analyzeEmoticonDirection({
            apiKey: runtime.apiKey,
            model: runtime.model,
            fallbackModels: runtime.fallbackModels,
            sourceImageUrl: canonicalSource.url,
            instruction: parsed.data.instruction,
            motionPreference: parsed.data.motionPreference,
            knownCharacterProfile: cachedAnalysis?.characterProfile,
            knownSuggestedPresets: cachedAnalysis?.suggestedPresets,
        });
        if (!cachedAnalysis) {
            await saveCharacterAnalysisCache({
                userId,
                sourceStoragePath: parsed.data.sourceStoragePath,
                sourceFingerprint: preparedSource.fingerprint,
                plan,
            }).catch((error) => {
                logger.warn('[EmoticonStudio] Character analysis cache could not be saved.', {
                    userId,
                    jobId,
                    error: error instanceof Error ? error.message : String(error),
                });
            });
        }

        await update({
            status: 'generating',
            progress: 26,
            statusMessage: '원본과 같은 캐릭터의 핵심 포즈를 만들고 있어요',
            plan,
        });
        const generatedPose = await generateEmoticonPose({
            apiKey: runtime.apiKey,
            sourceImageUrl: canonicalSource.url,
            plan,
        });
        let selectedPose = {
            ...generatedPose,
            buffer: await normalizeGeneratedEmoticonPose(generatedPose.buffer),
            contentType: 'image/png',
        };
        let selectedAsset = await uploadBuffer({
            userId,
            jobId,
            fileName: 'key-pose-1.png',
            buffer: selectedPose.buffer,
            contentType: selectedPose.contentType,
        });

        await update({
            status: 'validating',
            progress: 43,
            statusMessage: '얼굴·색상·의상 일관성을 확인하고 있어요',
            keyPoseUrl: selectedAsset.url,
            keyPoseStoragePath: selectedAsset.storagePath,
        });
        let quality = await reviewPose({
            apiKey: runtime.apiKey,
            model: runtime.model,
            fallbackModels: runtime.fallbackModels,
            sourceImageUrl: canonicalSource.url,
            generatedImageUrl: selectedAsset.url,
            plan,
        });

        if (needsPoseIsolationCorrection(quality)) {
            await update({
                status: 'generating',
                progress: 51,
                statusMessage: '배경 잔재 없이 원본 캐릭터만 남도록 한 번 더 다듬고 있어요',
                quality,
            });
            const generatedCorrection = await generateEmoticonPose({
                apiKey: runtime.apiKey,
                sourceImageUrl: canonicalSource.url,
                plan,
                correction: quality.correction.trim()
                    || 'Recreate exactly one isolated full character with a transparent background, no duplicate parts, no residue, and no occlusion.',
            });
            const correctedPose = {
                ...generatedCorrection,
                buffer: await normalizeGeneratedEmoticonPose(generatedCorrection.buffer),
                contentType: 'image/png',
            };
            const correctedAsset = await uploadBuffer({
                userId,
                jobId,
                fileName: 'key-pose-2.png',
                buffer: correctedPose.buffer,
                contentType: correctedPose.contentType,
            });
            const correctedQuality = await reviewPose({
                apiKey: runtime.apiKey,
                model: runtime.model,
                fallbackModels: runtime.fallbackModels,
                sourceImageUrl: canonicalSource.url,
                generatedImageUrl: correctedAsset.url,
                plan,
            });
            if (qualityScore(correctedQuality) >= qualityScore(quality)) {
                selectedPose = correctedPose;
                selectedAsset = correctedAsset;
                quality = correctedQuality;
            }
        }
        if (needsPoseIsolationCorrection(quality)) {
            throw new Error(
                'The generated key pose was not an isolated character after correction. '
                + 'Background residue, duplicate character parts, or occlusion remained.',
            );
        }

        await update({
            status: 'rendering',
            progress: 60,
            statusMessage: '표정·말풍선·반복 움직임을 조립하고 있어요',
            keyPoseUrl: selectedAsset.url,
            keyPoseStoragePath: selectedAsset.storagePath,
            quality,
        });
        const rendered = await renderOutputs({
            apiKey: runtime.apiKey,
            model: runtime.model,
            fallbackModels: runtime.fallbackModels,
            sourceImageUrl: canonicalSource.url,
            userId,
            jobId,
            plan,
            poseBuffer: selectedPose.buffer,
            poseUrl: selectedAsset.url,
            formats: parsed.data.formats,
            update,
        });
        const finalQuality = rendered.motionQuality || quality;

        await update({
            status: 'rendering',
            progress: 88,
            statusMessage: '선택한 파일 형식으로 마무리하고 있어요',
        });
        const outputs = await uploadRenderedFiles({
            userId,
            jobId,
            files: rendered.files,
        });

        await update({
            status: 'completed',
            progress: 100,
            statusMessage: '이모티콘이 완성됐어요',
            plan,
            quality: finalQuality,
            keyPoseUrl: selectedAsset.url,
            keyPoseStoragePath: selectedAsset.storagePath,
            ...(rendered.animationFrames ? { animationFrames: rendered.animationFrames } : {}),
            outputs,
            specReport: buildSpecReport(plan),
            analysisReused: Boolean(cachedAnalysis),
            motionFallbackReason: rendered.motionFallbackReason,
            completedAt: FieldValue.serverTimestamp(),
        });
        logger.info('[EmoticonStudio] Job completed.', {
            userId,
            jobId,
            formats: parsed.data.formats,
            renderMode: plan.action.renderMode,
        });
    } catch (error) {
        logger.error('[EmoticonStudio] Job failed.', {
            userId,
            jobId,
            error: error instanceof Error ? error.message : String(error),
        });
        await update({
            status: 'failed',
            progress: 100,
            statusMessage: '작업을 완료하지 못했어요',
            error: safeErrorMessage(error),
            failedAt: FieldValue.serverTimestamp(),
        }).catch((updateError) => {
            logger.error('[EmoticonStudio] Failed to persist job error.', {
                userId,
                jobId,
                updateError: updateError instanceof Error ? updateError.message : String(updateError),
            });
        });
    }
});
