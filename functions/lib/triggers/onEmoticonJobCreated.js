"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onEmoticonJobCreated = void 0;
const node_crypto_1 = require("node:crypto");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const firestore_2 = require("firebase-functions/v2/firestore");
const director_1 = require("../emoticonStudio/director");
const imageGeneration_1 = require("../emoticonStudio/imageGeneration");
const renderer_1 = require("../emoticonStudio/renderer");
const schema_1 = require("../emoticonStudio/schema");
const qualityStandards_1 = require("../emoticonStudio/qualityStandards");
const firestore_3 = require("../firestore");
const openrouter_1 = require("../openrouter");
const secrets_1 = require("../secrets");
if (!admin.apps.length) {
    admin.initializeApp();
}
const triggerConfig = {
    document: 'users/{userId}/emoticonJobs/{jobId}',
    database: firestore_3.FIRESTORE_DATABASE_ID,
    timeoutSeconds: 540,
    memory: '4GiB',
    region: 'asia-northeast3',
    secrets: [secrets_1.openRouterApiKey],
};
function characterCacheId(userId, sourceStoragePath, sourceFingerprint) {
    return (0, node_crypto_1.createHash)('sha256')
        .update(`${userId}:${sourceStoragePath}:${sourceFingerprint}`)
        .digest('hex');
}
async function loadCharacterAnalysisCache(userId, sourceStoragePath, sourceFingerprint) {
    const cacheRef = firestore_3.db.doc(`emoticonStudioCharacterProfiles/${characterCacheId(userId, sourceStoragePath, sourceFingerprint)}`);
    const snapshot = await cacheRef.get();
    if (!snapshot.exists)
        return null;
    const data = snapshot.data() || {};
    if (data.userId !== userId
        || data.sourceStoragePath !== sourceStoragePath
        || data.sourceFingerprint !== sourceFingerprint)
        return null;
    const profile = schema_1.emoticonCharacterProfileSchema.safeParse(data.characterProfile);
    const presets = schema_1.emoticonPresetSchema.array().min(4).max(12).safeParse(data.suggestedPresets);
    if (!profile.success || !presets.success)
        return null;
    return {
        characterProfile: profile.data,
        suggestedPresets: presets.data,
    };
}
async function saveCharacterAnalysisCache(params) {
    const cacheRef = firestore_3.db.doc(`emoticonStudioCharacterProfiles/${characterCacheId(params.userId, params.sourceStoragePath, params.sourceFingerprint)}`);
    await cacheRef.set({
        userId: params.userId,
        sourceStoragePath: params.sourceStoragePath,
        sourceFingerprint: params.sourceFingerprint,
        characterProfile: params.plan.characterProfile,
        suggestedPresets: params.plan.suggestedPresets,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
}
async function enforceRateLimit(userId, mode) {
    const ref = firestore_3.db.doc(`emoticonStudioRateLimits/${userId}`);
    const nowMs = Date.now();
    const windowMs = 60000;
    const limit = mode === 'generate' ? 8 : 20;
    await firestore_3.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data() || {};
        const prefix = mode === 'generate' ? 'generation' : 'rerender';
        const previousStart = typeof data[`${prefix}WindowStartMs`] === 'number'
            ? data[`${prefix}WindowStartMs`]
            : 0;
        const previousCount = typeof data[`${prefix}Count`] === 'number'
            ? data[`${prefix}Count`]
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
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}
function buildSpecReport(plan) {
    return {
        width: 360,
        height: 360,
        frameCount: plan.action.frameCount,
        fps: plan.action.fps,
        durationMs: plan.action.durationMs,
        loop: true,
        kakaoCanvasPass: true,
        kakaoFramePass: plan.action.frameCount >= 8 && plan.action.frameCount <= 24,
    };
}
function isStaleWorkingJob(value) {
    const workingStatuses = new Set(['queued', 'analyzing', 'generating', 'validating', 'animating', 'rendering']);
    if (typeof value.status !== 'string' || !workingStatuses.has(value.status))
        return false;
    const updatedAt = value.updatedAt;
    const updatedAtMs = typeof (updatedAt === null || updatedAt === void 0 ? void 0 : updatedAt.toMillis) === 'function' ? updatedAt.toMillis() : 0;
    return updatedAtMs > 0 && Date.now() - updatedAtMs >= 10 * 60 * 1000;
}
function buildFirebaseDownloadUrl(params) {
    return `https://firebasestorage.googleapis.com/v0/b/${params.bucketName}/o/`
        + `${encodeURIComponent(params.storagePath)}?alt=media&token=${encodeURIComponent(params.downloadToken)}`;
}
async function uploadBuffer(params) {
    const bucket = admin.storage().bucket();
    const storagePath = `users/${params.userId}/emoticon-studio/jobs/${params.jobId}/${params.fileName}`;
    const downloadToken = (0, node_crypto_1.randomUUID)();
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
async function prepareCanonicalSource(params) {
    var _a;
    const file = admin.storage().bucket().file(params.sourceStoragePath);
    const [metadata] = await file.getMetadata().catch(() => {
        throw new Error('Source image could not be found in this user workspace.');
    });
    const sizeBytes = Number(metadata.size || 0);
    const contentType = ((_a = metadata.contentType) === null || _a === void 0 ? void 0 : _a.split(';')[0]) || '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
        throw new Error('Source image must be a PNG, JPEG, or WebP file.');
    }
    if (!sizeBytes || sizeBytes > 25 * 1024 * 1024) {
        throw new Error('Source image must be smaller than 25 MB.');
    }
    const [sourceBuffer] = await file.download();
    const normalized = await (0, renderer_1.normalizeEmoticonSourceImage)(sourceBuffer);
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
async function downloadStoredPose(storagePath) {
    var _a;
    const file = admin.storage().bucket().file(storagePath);
    const [metadata] = await file.getMetadata().catch(() => {
        throw new Error('The stored key pose could not be found.');
    });
    const sizeBytes = Number(metadata.size || 0);
    if (!((_a = metadata.contentType) === null || _a === void 0 ? void 0 : _a.startsWith('image/')) || !sizeBytes || sizeBytes > 30 * 1024 * 1024) {
        throw new Error('The stored key pose is invalid or too large.');
    }
    const [buffer] = await file.download();
    return (0, renderer_1.normalizeGeneratedEmoticonPose)(buffer);
}
async function downloadStoredAnimationFrames(params) {
    const expectedPrefix = `users/${params.userId}/emoticon-studio/jobs/${params.parentJobId}/`;
    if (params.frames.some((frame) => !frame.storagePath.startsWith(expectedPrefix))) {
        throw new Error('The stored animation frames do not belong to the original job.');
    }
    return Promise.all(params.frames.map((frame) => downloadStoredPose(frame.storagePath)));
}
async function uploadRenderedFiles(params) {
    const outputs = {};
    for (const file of params.files) {
        const uploaded = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: `emoticon-${params.jobId.slice(0, 8)}.${file.extension}`,
            buffer: file.buffer,
            contentType: file.contentType,
        });
        outputs[file.format] = Object.assign(Object.assign({}, uploaded), { format: file.format });
    }
    return outputs;
}
function qualityScore(quality) {
    return quality.identity * 0.35
        + quality.styleConsistency * 0.2
        + quality.actionClarity * 0.1
        + quality.backgroundClean * 0.2
        + quality.occlusionFree * 0.1
        + quality.overall * 0.05
        + (quality.singleCharacter ? 5 : 0);
}
function needsPoseIsolationCorrection(quality) {
    return !(0, qualityStandards_1.meetsEmoticonPoseAcceptance)(quality);
}
function safeErrorMessage(error) {
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
async function reviewPose(params) {
    try {
        return await (0, director_1.evaluateEmoticonPose)(params);
    }
    catch (error) {
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
function toMotionQuality(review) {
    return {
        overall: review.overall,
        identity: review.identity,
        actionClarity: Math.min(review.actionClarity, Math.max(review.limbPoseChange, review.facialExpressionChange)),
        styleConsistency: review.styleConsistency,
        backgroundClean: review.backgroundClean,
        singleCharacter: review.singleCharacter,
        occlusionFree: review.occlusionFree,
        issues: review.issues,
        correction: review.correction,
    };
}
function isVerifiedBodyMotion(review) {
    return (0, qualityStandards_1.meetsEmoticonMotionAcceptance)(review);
}
function isDynamicRender(plan) {
    return plan.action.renderMode === 'dynamic';
}
function buildFrameSequenceSeed(jobId) {
    return Number.parseInt((0, node_crypto_1.createHash)('sha256').update(`emoticon-frame-sequence:${jobId}`).digest('hex').slice(0, 8), 16) & 0x7fffffff;
}
async function reviewImageFrameSequence(params) {
    return (0, director_1.evaluateEmoticonMotion)({
        apiKey: params.apiKey,
        model: params.model,
        fallbackModels: params.fallbackModels,
        sourceImageUrl: params.sourceImageUrl,
        frameUrls: params.frameUrls,
        plan: params.plan,
    });
}
async function renderAiFrameSequenceOutputs(params) {
    const frameCount = params.plan.action.frameCount;
    const sequenceSeed = buildFrameSequenceSeed(params.jobId);
    const frameBuffers = [];
    const frameUrls = [];
    const animationFrames = [];
    let totalGenerationCalls = 0;
    await params.update({
        status: 'animating',
        progress: 61,
        statusMessage: `${frameCount}개 프레임의 동작·표정 흐름을 먼저 설계하고 있어요.`,
    });
    const frameSequence = await (0, director_1.planEmoticonFrameSequence)({
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
    const generateFrames = async (paramsForPass) => {
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
            const progress = passProgressStart + Math.round(((frameIndex - startIndex + 1) / Math.max(1, frameCount - startIndex))
                * passProgressSpan);
            await params.update({
                status: 'animating',
                progress,
                statusMessage: pass === 1
                    ? `배경 잔재 없이 표정과 팔다리가 달라지는 AI 프레임 ${frameIndex + 1}/${frameCount}을 만들고 있어요.`
                    : `배경·겹침이 남은 구간을 보정해 프레임 ${frameIndex + 1}/${frameCount}을 다시 만들고 있어요.`,
            });
            const generated = await (0, imageGeneration_1.generateEmoticonAnimationFrame)({
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
            const buffer = await (0, renderer_1.normalizeGeneratedEmoticonPose)(generated.buffer);
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
            animationFrames.push(Object.assign(Object.assign({}, asset), { contentType: 'image/png' }));
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
    const reviewFrames = async (reviewPass) => {
        await params.update({
            status: 'validating',
            progress: reviewPass === 1 ? 80 : 86,
            statusMessage: `AI가 ${frameCount}개 전체 프레임의 캐릭터·배경 분리·동작·표정·루프 연결을 확인하고 있어요.`,
        });
        const localVariation = await (0, renderer_1.evaluateEmoticonFrameVariation)(frameBuffers);
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
        throw new Error(`AI image frame sequence was not a verified character animation `
            + `(identity ${review.identity}, action ${review.actionClarity}, limbs ${review.limbPoseChange}, `
            + `face ${review.facialExpressionChange}, consistency ${review.frameConsistency}, `
            + `loop ${review.loopContinuity}, background ${review.backgroundClean}, `
            + `singleCharacter ${review.singleCharacter}, occlusion ${review.occlusionFree}, `
            + `cameraOnly ${review.cameraOnly}). `
            + `${review.correction || 'Distinct limb poses or facial expressions were not visible.'}`);
    }
    await params.update({
        motionReview: review,
        status: 'rendering',
        progress: 88,
        statusMessage: '검증을 통과한 AI 프레임을 선택한 파일 형식으로 연결하고 있어요.',
    });
    return {
        files: await (0, renderer_1.renderImageSequenceEmoticon)({
            frameBuffers,
            plan: params.plan,
            formats: params.formats,
        }),
        motionFallbackReason: null,
        motionQuality: toMotionQuality(review),
        animationFrames,
    };
}
async function renderVerifiedDynamicOutputs(params) {
    return renderAiFrameSequenceOutputs(params);
}
async function renderOutputs(params) {
    if (isDynamicRender(params.plan)) {
        return renderVerifiedDynamicOutputs(params);
    }
    return {
        files: await (0, renderer_1.renderImageEmoticon)({
            imageBuffer: params.poseBuffer,
            plan: params.plan,
            formats: params.formats,
        }),
        motionFallbackReason: null,
        motionQuality: null,
    };
}
async function rerenderExistingJob(params) {
    var _a, _b;
    if (!params.request.parentJobId) {
        throw new Error('A parent job is required for a no-cost rerender.');
    }
    const parentRef = firestore_3.db.doc(`users/${params.userId}/emoticonJobs/${params.request.parentJobId}`);
    const parentSnapshot = await parentRef.get();
    if (!parentSnapshot.exists)
        throw new Error('The original completed job could not be found.');
    const parent = parentSnapshot.data() || {};
    if (parent.status !== 'completed' && parent.status !== 'failed' && !isStaleWorkingJob(parent)) {
        throw new Error('Only completed or recoverable failed jobs can be rerendered.');
    }
    const parentPlan = schema_1.emoticonPlanSchema.safeParse(parent.plan);
    if (!parentPlan.success)
        throw new Error('The original animation plan is unavailable.');
    const isDynamicParent = parentPlan.data.action.renderMode === 'dynamic';
    if (isDynamicParent && parent.status !== 'completed') {
        throw new Error('Only a completed, verified animation can be reused for a no-cost speech-bubble rerender.');
    }
    const storedAnimationFrames = isDynamicParent
        ? schema_1.emoticonAnimationFrameSchema.array()
            .length(parentPlan.data.action.frameCount)
            .safeParse(parent.animationFrames)
        : null;
    if (isDynamicParent && !(storedAnimationFrames === null || storedAnimationFrames === void 0 ? void 0 : storedAnimationFrames.success)) {
        throw new Error('The verified animation frames are unavailable, so this motion-preserving rerender cannot run. '
            + 'Create a new animated emoticon to regenerate the missing frames.');
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
    if (isDynamicParent && (storedAnimationFrames === null || storedAnimationFrames === void 0 ? void 0 : storedAnimationFrames.success)) {
        const plan = (0, director_1.normalizeEmoticonPlanTiming)(Object.assign(Object.assign({}, parentPlan.data), { bubble: ((_a = params.request.renderOverrides) === null || _a === void 0 ? void 0 : _a.bubble) || parentPlan.data.bubble }));
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
            return Object.assign(Object.assign({}, asset), { contentType: 'image/png' });
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
        const files = await (0, renderer_1.renderImageSequenceEmoticon)({
            frameBuffers,
            plan,
            formats: params.request.formats,
        });
        const outputs = await uploadRenderedFiles({
            userId: params.userId,
            jobId: params.jobId,
            files,
        });
        await params.update(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ status: 'completed', progress: 100, statusMessage: '말풍선 수정본이 완성되었어요.', plan }, (parent.quality ? { quality: parent.quality } : {})), { sourceImageUrl: parent.sourceImageUrl, sourceStoragePath: parent.sourceStoragePath }), (parent.sourceCanonicalStoragePath
            ? { sourceCanonicalStoragePath: parent.sourceCanonicalStoragePath }
            : {})), (parent.sourceFingerprint ? { sourceFingerprint: parent.sourceFingerprint } : {})), { keyPoseUrl: parent.keyPoseUrl, keyPoseStoragePath: poseStoragePath, animationFrames,
            outputs, specReport: buildSpecReport(plan), analysisReused: true, motionFallbackReason: null, completedAt: firestore_1.FieldValue.serverTimestamp() }));
        return;
    }
    const poseBuffer = await downloadStoredPose(poseStoragePath);
    const plan = (0, director_1.normalizeEmoticonPlanTiming)(Object.assign(Object.assign({}, parentPlan.data), { action: Object.assign(Object.assign({}, parentPlan.data.action), { renderMode: 'keyframes', motionType: parentPlan.data.action.motionType === 'dynamic'
                ? 'bob'
                : parentPlan.data.action.motionType }), bubble: ((_b = params.request.renderOverrides) === null || _b === void 0 ? void 0 : _b.bubble) || parentPlan.data.bubble }));
    await params.update({
        status: 'rendering',
        progress: 55,
        statusMessage: '수정한 설정으로 프레임을 다시 조립하고 있어요.',
        plan,
        keyPoseUrl: parent.keyPoseUrl,
        keyPoseStoragePath: poseStoragePath,
    });
    const files = await (0, renderer_1.renderImageEmoticon)({
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
    await params.update(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ status: 'completed', progress: 100, statusMessage: '말풍선 수정본이 완성됐어요.', plan }, (parent.quality ? { quality: parent.quality } : {})), { sourceImageUrl: parent.sourceImageUrl, sourceStoragePath: parent.sourceStoragePath }), (parent.sourceCanonicalStoragePath
        ? { sourceCanonicalStoragePath: parent.sourceCanonicalStoragePath }
        : {})), (parent.sourceFingerprint ? { sourceFingerprint: parent.sourceFingerprint } : {})), { keyPoseUrl: parent.keyPoseUrl, keyPoseStoragePath: poseStoragePath, outputs, specReport: buildSpecReport(plan), analysisReused: true, motionFallbackReason: null, completedAt: firestore_1.FieldValue.serverTimestamp() }));
}
exports.onEmoticonJobCreated = (0, firestore_2.onDocumentCreated)(triggerConfig, async (event) => {
    var _a;
    const snapshot = event.data;
    if (!snapshot)
        return;
    const userId = event.params.userId;
    const jobId = event.params.jobId;
    const jobRef = firestore_3.db.doc(`users/${userId}/emoticonJobs/${jobId}`);
    const update = async (data) => {
        await jobRef.update(Object.assign(Object.assign({}, data), { updatedAt: firestore_1.FieldValue.serverTimestamp() }));
    };
    try {
        const parsed = schema_1.emoticonJobRequestSchema.safeParse(snapshot.data());
        if (!parsed.success) {
            throw new Error(`Invalid emoticon job: ${((_a = parsed.error.issues[0]) === null || _a === void 0 ? void 0 : _a.message) || 'unknown error'}`);
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
        const runtime = (0, openrouter_1.getOpenRouterRuntimeConfig)();
        if (!runtime.apiKey)
            throw new Error('OPENROUTER_API_KEY is not configured.');
        const preparedSource = await prepareCanonicalSource({
            userId,
            jobId,
            sourceStoragePath: parsed.data.sourceStoragePath,
        });
        const canonicalSource = preparedSource.asset;
        const cachedAnalysis = await loadCharacterAnalysisCache(userId, parsed.data.sourceStoragePath, preparedSource.fingerprint);
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
        const plan = await (0, director_1.analyzeEmoticonDirection)({
            apiKey: runtime.apiKey,
            model: runtime.model,
            fallbackModels: runtime.fallbackModels,
            sourceImageUrl: canonicalSource.url,
            instruction: parsed.data.instruction,
            motionPreference: parsed.data.motionPreference,
            knownCharacterProfile: cachedAnalysis === null || cachedAnalysis === void 0 ? void 0 : cachedAnalysis.characterProfile,
            knownSuggestedPresets: cachedAnalysis === null || cachedAnalysis === void 0 ? void 0 : cachedAnalysis.suggestedPresets,
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
        const generatedPose = await (0, imageGeneration_1.generateEmoticonPose)({
            apiKey: runtime.apiKey,
            sourceImageUrl: canonicalSource.url,
            plan,
        });
        let selectedPose = Object.assign(Object.assign({}, generatedPose), { buffer: await (0, renderer_1.normalizeGeneratedEmoticonPose)(generatedPose.buffer), contentType: 'image/png' });
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
            const generatedCorrection = await (0, imageGeneration_1.generateEmoticonPose)({
                apiKey: runtime.apiKey,
                sourceImageUrl: canonicalSource.url,
                plan,
                correction: quality.correction.trim()
                    || 'Recreate exactly one isolated full character with a transparent background, no duplicate parts, no residue, and no occlusion.',
            });
            const correctedPose = Object.assign(Object.assign({}, generatedCorrection), { buffer: await (0, renderer_1.normalizeGeneratedEmoticonPose)(generatedCorrection.buffer), contentType: 'image/png' });
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
            throw new Error('The generated key pose was not an isolated character after correction. '
                + 'Background residue, duplicate character parts, or occlusion remained.');
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
        await update(Object.assign(Object.assign({ status: 'completed', progress: 100, statusMessage: '이모티콘이 완성됐어요', plan, quality: finalQuality, keyPoseUrl: selectedAsset.url, keyPoseStoragePath: selectedAsset.storagePath }, (rendered.animationFrames ? { animationFrames: rendered.animationFrames } : {})), { outputs, specReport: buildSpecReport(plan), analysisReused: Boolean(cachedAnalysis), motionFallbackReason: rendered.motionFallbackReason, completedAt: firestore_1.FieldValue.serverTimestamp() }));
        logger.info('[EmoticonStudio] Job completed.', {
            userId,
            jobId,
            formats: parsed.data.formats,
            renderMode: plan.action.renderMode,
        });
    }
    catch (error) {
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
            failedAt: firestore_1.FieldValue.serverTimestamp(),
        }).catch((updateError) => {
            logger.error('[EmoticonStudio] Failed to persist job error.', {
                userId,
                jobId,
                updateError: updateError instanceof Error ? updateError.message : String(updateError),
            });
        });
    }
});
//# sourceMappingURL=onEmoticonJobCreated.js.map