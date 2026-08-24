import { createHash, randomUUID } from 'node:crypto';
import type { Sharp, SharpOptions } from 'sharp';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

// sharp's CommonJS export is the callable itself. A default import compiles to
// require('sharp').default without esModuleInterop and fails only at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as (
    input?: Buffer | string | SharpOptions,
    options?: SharpOptions,
) => Sharp;
import {
    applyEmoticonMotionOverride,
    analyzeEmoticonCharacter,
    analyzeEmoticonDirection,
    characterAnalysisToLegacyProfile,
    evaluateEmoticonMotion,
    evaluateEmoticonPose,
    planEmoticonCharacterSheet,
    planEmoticonFrameSequence,
} from '../emoticonStudio/director';
import {
    generateEmoticonAnimationFrame,
    generateEmoticonPose,
    generateEmoticonSpriteSheet,
    isDefiniteImageRouteCompatibilityError,
} from '../emoticonStudio/imageGeneration';
import {
    EMOTICON_SPRITE_SHEET_STRATEGY,
    extractEmoticonSpriteSheetFrames,
    resolveEmoticonSpriteSheetLayout,
} from '../emoticonStudio/animationContainer';
import {
    evaluateEmoticonFrameVariation,
    inspectEmoticonAlphaIsolation,
    normalizeEmoticonSourceImage,
    normalizeGeneratedEmoticonPose,
    renderImageEmoticon,
    renderImageSequenceEmoticon,
    resolveEmoticonOutputProfile,
    type RenderedEmoticonFile,
    type EmoticonAlphaIsolationInspection,
} from '../emoticonStudio/renderer';
import {
    EMOTICON_BUBBLE_APPEARANCE_DEFAULTS,
    createIdentityEmoticonImageEditRecipe,
    emoticonAnimationFrameSchema,
    emoticonCharacterAnalysisSchema,
    emoticonCharacterProfileSchema,
    emoticonContinuationDocumentSchema,
    emoticonContinuationStateSchema,
    emoticonFrameSequenceSchema,
    emoticonFrameRepairSchema,
    emoticonJobRequestSchema,
    emoticonManualFrameImportReportSchema,
    emoticonManualStoredPlanSchema,
    emoticonMotionReviewSchema,
    emoticonOutputProfileSchema,
    emoticonPresetSchema,
    emoticonQualitySchema,
    emoticonReferenceImageSchema,
    emoticonRenderFailureRecoverySchema,
    emoticonStoredPlanSchema,
    type EmoticonCharacterAnalysis,
    type EmoticonCharacterProfile,
    type EmoticonAnimationFrame,
    type EmoticonFrameSequence,
    type EmoticonJobRequest,
    type EmoticonMotionReview,
    type EmoticonOutputInspection,
    type EmoticonOutputProfile,
    type EmoticonPlan,
    type EmoticonPreset,
    type EmoticonQuality,
    type EmoticonResourceMode,
} from '../emoticonStudio/schema';
import {
    EMOTICON_PREMIUM_MOTION_TARGET,
    getEmoticonMotionAcceptanceRequirements,
    getEmoticonPremiumMotionDeficits,
    meetsEmoticonDynamicKeyPoseAcceptance,
    meetsEmoticonMotionAcceptance,
    meetsEmoticonPremiumMotionTarget,
    meetsEmoticonPoseAcceptance,
    scoreEmoticonMotionQuality,
} from '../emoticonStudio/qualityStandards';
import {
    allocateEmoticonCostReservation,
    allocateEmoticonRateSlot,
    EMOTICON_COST_CONTROL_VERSION,
    estimateEmoticonJobAuthorizationUsd,
    getEmoticonStudioCostLimits,
    getEmoticonStudioDailyLimits,
    LEGACY_EMOTICON_COST_CONTROL_VERSION,
    settleEmoticonCostReservation,
    type EmoticonRateLimitedMode,
} from '../emoticonStudio/rateLimits';
import {
    EMOTICON_INITIAL_RUN_LEASE_MS,
    recoverStalledEmoticonJobInPlace,
    type EmoticonRecoverySkipReason,
} from '../emoticonStudio/jobRecovery';
import {
    buildEmoticonIdentityFingerprint,
    buildEmoticonReferenceSetFingerprint,
    EMOTICON_IDENTITY_FINGERPRINT_VERSION,
} from '../emoticonStudio/identityFingerprint';
import {
    resolveEmoticonRepairCheckpointAction,
    type EmoticonRepairContinuationStage,
} from '../emoticonStudio/repairContinuation';
import { claimEmoticonBatchExecutionSlot } from '../emoticonStudio/batches';
import { verifyReusableDynamicParent } from '../emoticonStudio/verifiedDynamicParent';
import { downloadVerifiedEmoticonImportFrames } from '../emoticonStudio/manualFrameImport';
import { normalizeEmoticonPlanForOutputProfile } from '../emoticonStudio/outputPlanPolicy';
import {
    EMOTICON_GPT_LIGHT_PROFILE,
    resolveEmoticonGenerationModelPolicy,
} from '../emoticonStudio/modelPolicy';
import {
    buildEfficientCompositePlan,
    EFFICIENT_LOCAL_COMPOSITE_VERSION,
} from '../emoticonStudio/quickComposite';
import { resolveEmoticonGenerationPolicy } from '../emoticonStudio/platformPolicy';
import { FIRESTORE_DATABASE_ID, db } from '../firestore';
import {
    OpenRouterDailyCostLimitError,
    runWithOpenRouterUsageContext,
    updateOpenRouterUsageContext,
} from '../openrouterUsage';
import {
    getHostingAiRuntime,
    type HostingAiRuntime,
} from '../api/hostingAiRuntime';
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
    retry: true,
};

const continuationTriggerConfig = {
    document: 'emoticonStudioContinuations/{continuationId}',
    database: FIRESTORE_DATABASE_ID,
    timeoutSeconds: 540,
    memory: '4GiB' as const,
    region: 'asia-northeast3',
    secrets: [openRouterApiKey],
    retry: true,
};

const cancellationTriggerConfig = {
    document: 'users/{userId}/emoticonJobs/{jobId}',
    database: FIRESTORE_DATABASE_ID,
    timeoutSeconds: 60,
    memory: '256MiB' as const,
    region: 'asia-northeast3',
    // Cancellation is already idempotent and every active worker checks the
    // request between stages. Avoid a seven-day Eventarc retry policy for this
    // best-effort accelerator so one transient failure cannot create repeated
    // billed deliveries.
    retry: false,
};

const CONTINUATION_WORK_BUDGET_MS = 510_000;
// One image request may consume 240s, followed by a 45s download plus image
// normalization/upload. Leave enough headroom for the whole frame checkpoint.
const MIN_IMAGE_CALL_BUDGET_MS = 330_000;
const MIN_REVIEW_CALL_BUDGET_MS = 150_000;
const MIN_RENDER_BUDGET_MS = 120_000;
const CONTINUATION_LEASE_MS = 570_000;
// The generation function can run for 540 seconds. Recovery must not take over
// while that invocation can still be alive, so its server lease includes a
// two-minute safety buffer.
const INITIAL_RUN_LEASE_MS = EMOTICON_INITIAL_RUN_LEASE_MS;
const CONTINUATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONTINUATION_RETRIES = 2;
const MAX_CONTINUATION_DELIVERY_ATTEMPTS = 2;
const EMOTICON_DAILY_LIMITS = getEmoticonStudioDailyLimits();
const EMOTICON_COST_LIMITS = getEmoticonStudioCostLimits();
const FRAME_REPAIR_VALIDATION = 'local-variation+pose-semantic+sequence-motion+output-inspection' as const;
const EMOTICON_AI_RUNTIME_SNAPSHOT_VERSION = 1;

type EmoticonAiRuntimeSnapshot = {
    version: typeof EMOTICON_AI_RUNTIME_SNAPSHOT_VERSION;
    textModel: string;
    imageModel: string;
    fallbackModels: string[];
    capturedAtMs: number;
    settingsUpdatedAt: string | null;
    reasoningEffort?: 'low';
    policyId?: typeof EMOTICON_GPT_LIGHT_PROFILE;
};

type EmoticonAiRuntime = HostingAiRuntime & {
    reasoningEffort?: 'low';
    policyId?: typeof EMOTICON_GPT_LIGHT_PROFILE;
};

function parseEmoticonAiRuntimeSnapshot(value: unknown): EmoticonAiRuntimeSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    const textModel = typeof candidate.textModel === 'string' ? candidate.textModel.trim() : '';
    const imageModel = typeof candidate.imageModel === 'string' ? candidate.imageModel.trim() : '';
    const fallbackModels = Array.isArray(candidate.fallbackModels)
        ? candidate.fallbackModels
            .filter((model): model is string => typeof model === 'string')
            .map((model) => model.trim())
            .filter((model) => model && model !== textModel)
            .slice(0, 3)
        : [];
    if (
        candidate.version !== EMOTICON_AI_RUNTIME_SNAPSHOT_VERSION
        || !textModel
        || !imageModel
        || typeof candidate.capturedAtMs !== 'number'
        || !Number.isFinite(candidate.capturedAtMs)
    ) return null;
    return {
        version: EMOTICON_AI_RUNTIME_SNAPSHOT_VERSION,
        textModel,
        imageModel,
        fallbackModels: [...new Set(fallbackModels)],
        capturedAtMs: candidate.capturedAtMs,
        settingsUpdatedAt: typeof candidate.settingsUpdatedAt === 'string'
            ? candidate.settingsUpdatedAt
            : null,
        ...(candidate.reasoningEffort === 'low' ? { reasoningEffort: 'low' as const } : {}),
        ...(candidate.policyId === EMOTICON_GPT_LIGHT_PROFILE
            ? { policyId: EMOTICON_GPT_LIGHT_PROFILE }
            : {}),
    };
}

async function resolveEmoticonAiRuntime(params: {
    job: Record<string, unknown>;
    resourceMode: EmoticonResourceMode;
    aiGenerationProfile?: string;
    update: (data: Record<string, unknown>) => Promise<void>;
}): Promise<EmoticonAiRuntime> {
    // The API key remains a live Functions secret, while every model choice is
    // frozen on the job. This prevents a settings edit from changing identity
    // or review behaviour halfway through a multi-invocation animation.
    const liveRuntime = await getHostingAiRuntime();
    const stored = parseEmoticonAiRuntimeSnapshot(params.job.openRouterRuntimeSnapshot);
    if (stored) {
        return {
            ...liveRuntime,
            model: stored.textModel,
            imageModel: stored.imageModel,
            fallbackModels: stored.fallbackModels,
            updatedAt: stored.settingsUpdatedAt,
            ...(stored.reasoningEffort ? { reasoningEffort: stored.reasoningEffort } : {}),
            ...(stored.policyId ? { policyId: stored.policyId } : {}),
        };
    }
    const useGptLight = params.resourceMode === 'efficient'
        && params.aiGenerationProfile === EMOTICON_GPT_LIGHT_PROFILE;
    const policy = useGptLight
        ? resolveEmoticonGenerationModelPolicy({
            resourceMode: params.resourceMode,
            configuredTextModel: liveRuntime.model,
            configuredImageModel: liveRuntime.imageModel,
            configuredFallbackModels: liveRuntime.fallbackModels,
        })
        : {
            textModel: liveRuntime.model,
            imageModel: liveRuntime.imageModel,
            fallbackModels: liveRuntime.fallbackModels,
        };
    const resolvedRuntime: EmoticonAiRuntime = {
        ...liveRuntime,
        model: policy.textModel,
        imageModel: policy.imageModel,
        fallbackModels: policy.fallbackModels,
        ...(policy.reasoningEffort ? { reasoningEffort: policy.reasoningEffort } : {}),
        ...(useGptLight ? { policyId: EMOTICON_GPT_LIGHT_PROFILE } : {}),
    };
    const snapshot: EmoticonAiRuntimeSnapshot = {
        version: EMOTICON_AI_RUNTIME_SNAPSHOT_VERSION,
        textModel: resolvedRuntime.model,
        imageModel: resolvedRuntime.imageModel,
        fallbackModels: resolvedRuntime.fallbackModels,
        capturedAtMs: Date.now(),
        settingsUpdatedAt: liveRuntime.updatedAt,
        ...(resolvedRuntime.reasoningEffort
            ? { reasoningEffort: resolvedRuntime.reasoningEffort }
            : {}),
        ...(resolvedRuntime.policyId ? { policyId: resolvedRuntime.policyId } : {}),
    };
    await params.update({ openRouterRuntimeSnapshot: snapshot });
    return resolvedRuntime;
}

type FrameContinuationState = {
    stage: 'planning' | 'generation' | 'review' | 'render';
    pass: 1 | 2;
    startIndex: number;
    nextFrameIndex: number;
    totalGenerationCalls: number;
    correction?: string;
    repairFrameIndices?: number[];
    nextRepairCursor?: number;
    retryCount?: number;
};

type PipelineContinuationState = {
    stage: 'analysis'
        | 'pose-generation'
        | 'pose-review'
        | 'pose-correction'
        | 'corrected-pose-review'
        | 'static-render'
        | 'repair-generation'
        | 'repair-pose-review'
        | 'repair-sequence-review'
        | 'repair-render';
    retryCount: number;
};

type EmoticonContinuationState = FrameContinuationState | PipelineContinuationState;

function isFrameContinuationState(
    value: EmoticonContinuationState,
): value is FrameContinuationState {
    return ['planning', 'generation', 'review', 'render'].includes(value.stage);
}

function isSafeFirebaseUid(value: string): boolean {
    return value.length >= 1
        && value.length <= 128
        && !/[\/\u0000-\u001f\u007f]/.test(value);
}

class EmoticonContinuationScheduledError extends Error {
    constructor() {
        super('The emoticon frame pipeline was checkpointed for continuation.');
        this.name = 'EmoticonContinuationScheduledError';
    }
}

class EmoticonJobCancelledError extends Error {
    constructor() {
        super('The emoticon job was cancelled by the user.');
        this.name = 'EmoticonJobCancelledError';
    }
}

class EmoticonStaleWorkerError extends Error {
    constructor() {
        super('The emoticon job worker lease is stale.');
        this.name = 'EmoticonStaleWorkerError';
    }
}

class EmoticonStaleProjectItemClaimError extends Error {
    constructor() {
        super('The linked project item is owned by another active job.');
        this.name = 'EmoticonStaleProjectItemClaimError';
    }
}

class EmoticonProjectDeletionLockedError extends Error {
    constructor() {
        super('The linked project is being deleted.');
        this.name = 'EmoticonProjectDeletionLockedError';
    }
}

async function assertLinkedProjectItemClaim(params: {
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
}): Promise<void> {
    const hasProject = Boolean(params.request.projectId);
    const hasItem = Boolean(params.request.projectItemId);
    if (!hasProject && !hasItem) return;
    if (params.request.projectId) {
        const projectSnapshot = await db.doc(
            `users/${params.userId}/emoticonProjects/${params.request.projectId}`,
        ).get();
        if (!projectSnapshot.exists || projectSnapshot.data()?.deletionLocked === true) {
            throw new EmoticonProjectDeletionLockedError();
        }
    }
    if (['plan', 'profile', 'sheet_plan'].includes(params.request.mode)) return;
    if (!params.request.projectId || !params.request.projectItemId) {
        throw new EmoticonStaleProjectItemClaimError();
    }
    const itemSnapshot = await db.doc(
        `users/${params.userId}/emoticonProjects/${params.request.projectId}/items/${params.request.projectItemId}`,
    ).get();
    if (!itemSnapshot.exists) throw new EmoticonStaleProjectItemClaimError();
    const item = itemSnapshot.data() || {};
    const active = item.generationStatus === 'queued' || item.generationStatus === 'generating';
    if (!active || item.jobId !== params.jobId) {
        throw new EmoticonStaleProjectItemClaimError();
    }
}

function cancellationUpdate(job: Record<string, unknown>): Record<string, unknown> {
    return {
        status: 'cancelled',
        progress: typeof job.progress === 'number' ? job.progress : 0,
        statusMessage: '사용자가 작업을 취소했어요.',
        error: null,
        resumeAvailable: false,
        ...(job.frameContinuation && typeof job.frameContinuation === 'object'
            ? { 'frameContinuation.state': 'cancelled' }
            : {}),
        ...(!job.cancelledAt ? { cancelledAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
    };
}

async function finalizeJobCancellation(userId: string, jobId: string): Promise<boolean> {
    const jobRef = db.doc(`users/${userId}/emoticonJobs/${jobId}`);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) return false;
        const job = snapshot.data() || {};
        if (job.userId !== userId) return false;
        if (job.status === 'completed' || job.status === 'failed') return false;
        if (job.status !== 'cancelled' || !job.cancelledAt) {
            transaction.update(jobRef, cancellationUpdate(job));
        }
        return true;
    });
}

async function isJobCancellationRequested(userId: string, jobId: string): Promise<boolean> {
    const snapshot = await db.doc(`users/${userId}/emoticonJobs/${jobId}`).get();
    if (!snapshot.exists) return false;
    const job = snapshot.data() || {};
    if (job.userId !== userId) return false;
    return job.status === 'cancelled' || Boolean(job.cancelRequestedAt);
}

async function assertJobActive(userId: string, jobId: string): Promise<void> {
    const snapshot = await db.doc(`users/${userId}/emoticonJobs/${jobId}`).get();
    if (!snapshot.exists) throw new Error('The emoticon job no longer exists.');
    const job = snapshot.data() || {};
    if (job.userId !== userId) throw new Error('The emoticon job owner does not match its document path.');
    if (job.status === 'cancelled' || job.cancelRequestedAt) {
        await finalizeJobCancellation(userId, jobId);
        throw new EmoticonJobCancelledError();
    }
}

async function updateActiveJob(
    userId: string,
    jobId: string,
    data: Record<string, unknown>,
    fence: { generationRunToken: string; continuationToken?: string },
): Promise<void> {
    const jobRef = db.doc(`users/${userId}/emoticonJobs/${jobId}`);
    let cancelled = false;
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) throw new Error('The emoticon job no longer exists.');
        const job = snapshot.data() || {};
        if (job.userId !== userId) throw new Error('The emoticon job owner does not match its document path.');
        const savedContinuation = job.frameContinuation && typeof job.frameContinuation === 'object'
            ? job.frameContinuation as Record<string, unknown>
            : null;
        if (
            job.generationRunToken !== fence.generationRunToken
            || (fence.continuationToken !== undefined && savedContinuation?.token !== fence.continuationToken)
        ) {
            throw new EmoticonStaleWorkerError();
        }
        if (job.status === 'completed' || job.status === 'failed') {
            throw new EmoticonStaleWorkerError();
        }
        if (job.status === 'cancelled' || job.cancelRequestedAt) {
            cancelled = true;
            if (job.status !== 'cancelled' || !job.cancelledAt) {
                transaction.update(jobRef, cancellationUpdate(job));
            }
            return;
        }
        const heartbeat: Record<string, unknown> = {
            generationRunLeaseExpiresAtMs: Date.now() + INITIAL_RUN_LEASE_MS,
        };
        if (
            fence.continuationToken !== undefined
            && !Object.prototype.hasOwnProperty.call(data, 'frameContinuation')
        ) {
            heartbeat['frameContinuation.leaseExpiresAtMs'] = Date.now() + CONTINUATION_LEASE_MS;
        }
        transaction.update(jobRef, {
            ...heartbeat,
            ...data,
            updatedAt: FieldValue.serverTimestamp(),
        });
        if (fence.continuationToken !== undefined) {
            transaction.update(db.collection('emoticonStudioContinuations').doc(fence.continuationToken), {
                leaseExpiresAtMs: Date.now() + CONTINUATION_LEASE_MS,
                updatedAt: FieldValue.serverTimestamp(),
            });
        }
    });
    if (cancelled) throw new EmoticonJobCancelledError();
}

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
    characterAnalysis?: EmoticonCharacterAnalysis;
    analysisMode?: EmoticonResourceMode;
};

function characterCacheId(userId: string, sourceStoragePath: string, identityFingerprint: string): string {
    return createHash('sha256')
        .update(`${userId}:${sourceStoragePath}:${identityFingerprint}`)
        .digest('hex');
}

async function loadCharacterAnalysisCache(
    userId: string,
    sourceStoragePath: string,
    identityFingerprint: string,
    expectedReferenceCount: number,
    requestedAnalysisMode?: EmoticonResourceMode,
): Promise<CharacterAnalysisCache | null> {
    const cacheRef = db.doc(
        `emoticonStudioCharacterProfiles/${characterCacheId(userId, sourceStoragePath, identityFingerprint)}`,
    );
    const snapshot = await cacheRef.get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() || {};
    if (
        data.userId !== userId
        || data.sourceStoragePath !== sourceStoragePath
        || data.identityFingerprint !== identityFingerprint
        || data.identityFingerprintVersion !== EMOTICON_IDENTITY_FINGERPRINT_VERSION
    ) return null;
    const profile = emoticonCharacterProfileSchema.safeParse(data.characterProfile);
    const presets = emoticonPresetSchema.array().max(64).safeParse(data.suggestedPresets);
    if (!profile.success || !presets.success) return null;
    const analysis = emoticonCharacterAnalysisSchema.safeParse(data.characterAnalysis);
    const analysisMode = data.analysisMode === 'efficient' || data.analysisMode === 'premium'
        ? data.analysisMode as EmoticonResourceMode
        : undefined;
    const analysisMeetsRequestedMode = !requestedAnalysisMode || (
        data.characterAnalysis?.analysisRevision === 2
        && (requestedAnalysisMode === 'efficient' || analysisMode === 'premium')
    );
    if (
        data.characterAnalysis !== undefined
        && (!analysis.success || analysis.data.referenceCount !== expectedReferenceCount)
    ) return null;
    return {
        characterProfile: profile.data,
        suggestedPresets: presets.data,
        ...(analysis.success && analysisMeetsRequestedMode ? { characterAnalysis: analysis.data } : {}),
        ...(analysisMode ? { analysisMode } : {}),
    };
}

async function saveCharacterAnalysisCache(params: {
    userId: string;
    sourceStoragePath: string;
    sourceFingerprint: string;
    referenceSetFingerprint: string;
    identityFingerprint: string;
    plan: EmoticonPlan;
    characterAnalysis?: EmoticonCharacterAnalysis;
}): Promise<void> {
    const cacheRef = db.doc(
        `emoticonStudioCharacterProfiles/${characterCacheId(
            params.userId,
            params.sourceStoragePath,
            params.identityFingerprint,
        )}`,
    );
    await cacheRef.set({
        userId: params.userId,
        sourceStoragePath: params.sourceStoragePath,
        sourceFingerprint: params.sourceFingerprint,
        referenceSetFingerprint: params.referenceSetFingerprint,
        identityFingerprint: params.identityFingerprint,
        identityFingerprintVersion: EMOTICON_IDENTITY_FINGERPRINT_VERSION,
        characterProfile: params.plan.characterProfile,
        suggestedPresets: params.plan.suggestedPresets,
        ...(params.characterAnalysis ? { characterAnalysis: params.characterAnalysis } : {}),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}

async function saveDedicatedCharacterAnalysisCache(params: {
    userId: string;
    sourceStoragePath: string;
    sourceFingerprint: string;
    referenceSetFingerprint: string;
    identityFingerprint: string;
    characterAnalysis: EmoticonCharacterAnalysis;
    analysisMode: EmoticonResourceMode;
}): Promise<void> {
    const cacheRef = db.doc(
        `emoticonStudioCharacterProfiles/${characterCacheId(
            params.userId,
            params.sourceStoragePath,
            params.identityFingerprint,
        )}`,
    );
    await cacheRef.set({
        userId: params.userId,
        sourceStoragePath: params.sourceStoragePath,
        sourceFingerprint: params.sourceFingerprint,
        referenceSetFingerprint: params.referenceSetFingerprint,
        identityFingerprint: params.identityFingerprint,
        identityFingerprintVersion: EMOTICON_IDENTITY_FINGERPRINT_VERSION,
        characterAnalysis: params.characterAnalysis,
        analysisMode: params.analysisMode,
        characterProfile: characterAnalysisToLegacyProfile(params.characterAnalysis),
        suggestedPresets: [],
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}

async function runCharacterProfilePlanningPipeline(params: {
    apiKey: string;
    model: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
    sourceImageUrl: string;
    sourceStoragePath: string;
    sourceFingerprint: string;
    referenceSetFingerprint: string;
    identityFingerprint: string;
    additionalReferenceUrls: string[];
    identityReferenceUrl?: string;
    update: (data: Record<string, unknown>) => Promise<void>;
}): Promise<void> {
    if (params.request.mode !== 'profile' && params.request.mode !== 'sheet_plan') {
        throw new Error('The character profile planning mode is invalid.');
    }
    await params.update({
        status: 'analyzing',
        progress: 12,
        statusMessage: params.request.mode === 'profile'
            ? '참조 이미지에서 캐릭터 외형과 스타일을 분석하고 있어요.'
            : '적용된 캐릭터 분석을 기준으로 시트 항목을 기획하고 있어요.',
        error: null,
        sourceImageUrl: params.sourceImageUrl,
        sourceCanonicalStoragePath: params.sourceStoragePath,
        sourceFingerprint: params.sourceFingerprint,
        referenceSetFingerprint: params.referenceSetFingerprint,
        canonicalReferenceUrls: params.additionalReferenceUrls,
        ...(params.identityReferenceUrl
            ? { canonicalIdentityReferenceUrl: params.identityReferenceUrl }
            : {}),
        identityFingerprint: params.identityFingerprint,
        identityFingerprintVersion: EMOTICON_IDENTITY_FINGERPRINT_VERSION,
        frameContinuation: { stage: 'analysis', retryCount: 0, state: 'checkpointed' },
        resumeAvailable: true,
    });
    await assertJobActive(params.userId, params.jobId);

    if (params.request.mode === 'profile') {
        const cached = await loadCharacterAnalysisCache(
            params.userId,
            params.request.sourceStoragePath,
            params.identityFingerprint,
            1 + params.additionalReferenceUrls.length,
            params.request.resourceMode,
        );
        const analysis = cached?.characterAnalysis || await analyzeEmoticonCharacter({
            apiKey: params.apiKey,
            model: params.model,
            fallbackModels: params.fallbackModels,
            sourceImageUrl: params.sourceImageUrl,
            additionalReferenceUrls: params.additionalReferenceUrls,
            resourceMode: params.request.resourceMode,
            reasoningEffort: params.reasoningEffort,
        });
        await assertJobActive(params.userId, params.jobId);
        if (!cached?.characterAnalysis) {
            await saveDedicatedCharacterAnalysisCache({
                userId: params.userId,
                sourceStoragePath: params.request.sourceStoragePath,
                sourceFingerprint: params.sourceFingerprint,
                referenceSetFingerprint: params.referenceSetFingerprint,
                identityFingerprint: params.identityFingerprint,
                characterAnalysis: analysis,
                analysisMode: params.request.resourceMode,
            });
        }
        await params.update({
            status: 'completed',
            progress: 100,
            statusMessage: cached?.characterAnalysis
                ? '이전에 검증한 동일 참조 세트의 캐릭터 분석을 불러왔어요.'
                : '캐릭터 외형 분석이 완료됐어요. 검토한 뒤 프로젝트에 적용하세요.',
            characterAnalysis: analysis,
            analysisMode: params.request.resourceMode,
            analysisReused: Boolean(cached?.characterAnalysis),
            resumeAvailable: false,
            'frameContinuation.state': 'completed',
            completedAt: FieldValue.serverTimestamp(),
        });
        return;
    }

    const profileJobId = params.request.profileJobId as string;
    if (profileJobId === params.jobId) throw new Error('A sheet plan cannot reference itself.');
    const profileSnapshot = await db.doc(
        `users/${params.userId}/emoticonJobs/${profileJobId}`,
    ).get();
    const profileJob = profileSnapshot.data() || {};
    const analysis = emoticonCharacterAnalysisSchema.safeParse(profileJob.characterAnalysis);
    if (
        !profileSnapshot.exists
        || profileJob.userId !== params.userId
        || profileJob.mode !== 'profile'
        || profileJob.status !== 'completed'
        || profileJob.deletionLocked === true
        || profileJob.projectId !== params.request.projectId
        || profileJob.identityFingerprintVersion !== EMOTICON_IDENTITY_FINGERPRINT_VERSION
        || profileJob.identityFingerprint !== params.identityFingerprint
        || !analysis.success
    ) {
        throw new Error('The completed character profile does not match this project reference set.');
    }
    const requestedCount = params.request.sheetItemCount as number;
    const sheetPlan = await planEmoticonCharacterSheet({
        apiKey: params.apiKey,
        model: params.model,
        fallbackModels: params.fallbackModels,
        characterAnalysis: analysis.data,
        request: params.request.sheetRequest as string,
        itemCount: requestedCount,
        reasoningEffort: params.reasoningEffort,
    });
    await assertJobActive(params.userId, params.jobId);
    await params.update({
        status: 'completed',
        progress: 100,
        statusMessage: '원하는 구성의 캐릭터 시트 항목을 기획했어요. 영향을 확인한 뒤 프로젝트에 적용하세요.',
        characterAnalysis: analysis.data,
        sheetPlan,
        analysisReused: true,
        resumeAvailable: false,
        'frameContinuation.state': 'completed',
        completedAt: FieldValue.serverTimestamp(),
    });
}

async function reserveRateLimitSlot(params: {
    userId: string;
    jobId: string;
    mode: EmoticonRateLimitedMode;
    requestedFrameCount?: number;
    outputType?: 'static' | 'animated';
    resourceMode?: EmoticonResourceMode;
    aiGenerationProfile?: string;
}): Promise<{ executeAtMs: number; deferred: boolean }> {
    const ref = db.doc(`emoticonStudioRateLimits/${params.userId}`);
    const jobRef = db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`);
    const nowMs = Date.now();
    const minuteLimit = params.mode === 'generate'
        ? 8
        : params.mode === 'plan' || params.mode === 'sheet_plan'
            ? 12
            : params.mode === 'profile'
                ? 8
                : params.mode === 'repair_frame'
                    ? 6
                    : 20;
    return db.runTransaction(async (transaction) => {
        const [snapshot, jobSnapshot] = await Promise.all([
            transaction.get(ref),
            transaction.get(jobRef),
        ]);
        if (!jobSnapshot.exists) throw new Error('The emoticon job no longer exists.');
        const job = jobSnapshot.data() || {};
        if (job.userId !== params.userId) throw new Error('The emoticon job owner does not match its path.');
        if (job.status === 'cancelled' || job.cancelRequestedAt) {
            throw new EmoticonJobCancelledError();
        }
        if (job.status === 'completed' || job.status === 'failed') {
            throw new Error('The emoticon job has already finished.');
        }
        const existingExecuteAtMs = typeof job.rateLimitExecuteAtMs === 'number'
            ? job.rateLimitExecuteAtMs
            : null;
        const hasLegacyCostReservation = (
            typeof job.openRouterAuthorizedCostUsd === 'number'
            && Number.isFinite(job.openRouterAuthorizedCostUsd)
            && job.openRouterAuthorizedCostUsd >= 0
            && Number.isInteger(job.openRouterCostReservationDayBucket)
        );
        const hasPerRequestCostGate = (
            typeof job.openRouterAuthorizedCostUsd === 'number'
            && Number.isFinite(job.openRouterAuthorizedCostUsd)
            && job.openRouterAuthorizedCostUsd >= 0
            && typeof job.openRouterDailyCostLimitUsd === 'number'
            && Number.isFinite(job.openRouterDailyCostLimitUsd)
            && job.openRouterDailyCostLimitUsd > 0
        );
        if (
            existingExecuteAtMs !== null
            && (
                (
                    job.costControlVersion === EMOTICON_COST_CONTROL_VERSION
                    && hasPerRequestCostGate
                )
                || (
                    job.costControlVersion === LEGACY_EMOTICON_COST_CONTROL_VERSION
                    && hasLegacyCostReservation
                )
            )
        ) {
            return {
                executeAtMs: existingExecuteAtMs,
                deferred: existingExecuteAtMs > nowMs + 2_000,
            };
        }
        if (job.costControlVersion === LEGACY_EMOTICON_COST_CONTROL_VERSION) {
            throw new Error('The legacy Emoticon Studio cost reservation is incomplete.');
        }
        const data = snapshot.data() || {};
        const prefix = params.mode === 'generate'
            ? 'generation'
            : params.mode === 'plan'
                ? 'planning'
                : params.mode === 'profile'
                    ? 'profile'
                    : params.mode === 'sheet_plan'
                        ? 'sheetPlanning'
                        : params.mode === 'repair_frame'
                            ? 'frameRepair'
                            : 'rerender';
        // A queued job created by an older deployment may already own its
        // throughput slot. Install the per-request monetary guard without
        // counting the same job twice.
        const allocation = existingExecuteAtMs === null
            ? allocateEmoticonRateSlot({
                nowMs,
                minuteLimit,
                dailyLimit: EMOTICON_DAILY_LIMITS[params.mode],
                state: {
                    minuteBucket: data[`${prefix}ReservationMinuteBucket`] as number | undefined,
                    minuteCount: data[`${prefix}ReservationMinuteCount`] as number | undefined,
                    dayBucket: data[`${prefix}ReservationDayBucket`] as number | undefined,
                    dayCount: data[`${prefix}ReservationDayCount`] as number | undefined,
                },
            })
            : null;
        const authorizedCostUsd = estimateEmoticonJobAuthorizationUsd({
            mode: params.mode,
            requestedFrameCount: params.requestedFrameCount,
            outputType: params.outputType,
            resourceMode: params.resourceMode,
            aiGenerationProfile: params.aiGenerationProfile,
            limits: EMOTICON_COST_LIMITS,
        });
        const executeAtMs = existingExecuteAtMs ?? allocation!.executeAtMs;
        transaction.set(ref, {
            userId: params.userId,
            ...(allocation ? {
                [`${prefix}ReservationMinuteBucket`]: allocation.state.minuteBucket,
                [`${prefix}ReservationMinuteCount`]: allocation.state.minuteCount,
                [`${prefix}ReservationDayBucket`]: allocation.state.dayBucket,
                [`${prefix}ReservationDayCount`]: allocation.state.dayCount,
            } : {}),
            dailyCostLimitUsd: EMOTICON_COST_LIMITS.dailyUsd,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.update(jobRef, {
            rateLimitExecuteAtMs: executeAtMs,
            rateLimitReservedAt: FieldValue.serverTimestamp(),
            openRouterAuthorizedCostUsd: authorizedCostUsd,
            openRouterMaxImageCostUsd: EMOTICON_COST_LIMITS.perImageUsd,
            openRouterDailyCostLimitUsd: EMOTICON_COST_LIMITS.dailyUsd,
            costControlVersion: EMOTICON_COST_CONTROL_VERSION,
            updatedAt: FieldValue.serverTimestamp(),
        });
        return { executeAtMs, deferred: executeAtMs > nowMs + 2_000 };
    });
}

const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled']);

async function settleTerminalJobCostReservation(userId: string, jobId: string): Promise<void> {
    const rateLimitRef = db.doc(`emoticonStudioRateLimits/${userId}`);
    const jobRef = db.doc(`users/${userId}/emoticonJobs/${jobId}`);
    await db.runTransaction(async (transaction) => {
        const [rateLimitSnapshot, jobSnapshot] = await Promise.all([
            transaction.get(rateLimitRef),
            transaction.get(jobRef),
        ]);
        if (!jobSnapshot.exists) return;
        const job = jobSnapshot.data() || {};
        if (
            job.userId !== userId
            || !TERMINAL_JOB_STATUSES.has(String(job.status || ''))
            || job.costReservationSettledAt
        ) return;
        const authorizedUsd = typeof job.openRouterAuthorizedCostUsd === 'number'
            && Number.isFinite(job.openRouterAuthorizedCostUsd)
            ? Math.max(0, job.openRouterAuthorizedCostUsd)
            : 0;
        const actualUsd = typeof job.openRouterActualCostUsd === 'number'
            && Number.isFinite(job.openRouterActualCostUsd)
            ? Math.max(0, job.openRouterActualCostUsd)
            : 0;
        const inflightUsd = typeof job.openRouterInflightCostUsd === 'number'
            && Number.isFinite(job.openRouterInflightCostUsd)
            ? Math.max(0, job.openRouterInflightCostUsd)
            : 0;
        const dayBucket = Number.isInteger(job.openRouterCostReservationDayBucket)
            ? job.openRouterCostReservationDayBucket as number
            : null;
        if (
            job.costControlVersion !== LEGACY_EMOTICON_COST_CONTROL_VERSION
            || !rateLimitSnapshot.exists
            || dayBucket === null
            || authorizedUsd <= 0
        ) {
            transaction.update(jobRef, {
                costReservationSettledAt: FieldValue.serverTimestamp(),
                costReservationAccountedUsd: Math.round((actualUsd + inflightUsd) * 10_000) / 10_000,
                updatedAt: FieldValue.serverTimestamp(),
            });
            return;
        }
        const rateLimit = rateLimitSnapshot.data() || {};
        const existingMap = rateLimit.costReservationsByDay
            && typeof rateLimit.costReservationsByDay === 'object'
            ? rateLimit.costReservationsByDay as Record<string, number>
            : {
                [String(rateLimit.costReservationDayBucket)]: typeof rateLimit.costReservedUsd === 'number'
                    ? rateLimit.costReservedUsd
                    : 0,
            };
        const reservationsByDay = settleEmoticonCostReservation({
            reservationsByDay: existingMap,
            dayBucket,
            authorizedUsd,
            accountedUsd: actualUsd + inflightUsd,
        });
        transaction.update(rateLimitRef, {
            costReservationsByDay: reservationsByDay,
            costReservationVersion: LEGACY_EMOTICON_COST_CONTROL_VERSION,
            ...(rateLimit.costReservationDayBucket === dayBucket
                ? { costReservedUsd: reservationsByDay[String(dayBucket)] || 0 }
                : {}),
            updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(jobRef, {
            costReservationSettledAt: FieldValue.serverTimestamp(),
            costReservationAccountedUsd: Math.round((actualUsd + inflightUsd) * 10_000) / 10_000,
            costControlVersion: LEGACY_EMOTICON_COST_CONTROL_VERSION,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

async function deferJobUntilReservedSlot(params: {
    userId: string;
    jobId: string;
    executeAtMs: number;
    mode: EmoticonJobRequest['mode'];
    reason?: 'rate_limit' | 'batch_concurrency';
    batchId?: string;
    projectId?: string;
    projectItemId?: string;
}): Promise<void> {
    const jobRef = db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`);
    const queueId = createHash('sha256')
        .update(`${params.userId}:${params.jobId}`)
        .digest('hex');
    const queueRef = db.collection('emoticonStudioDeferredJobs').doc(queueId);
    await db.runTransaction(async (transaction) => {
        const [jobSnapshot, queueSnapshot] = await Promise.all([
            transaction.get(jobRef),
            transaction.get(queueRef),
        ]);
        if (!jobSnapshot.exists) return;
        const job = jobSnapshot.data() || {};
        if (job.userId !== params.userId) return;
        if (job.status === 'cancelled' || job.cancelRequestedAt) {
            throw new EmoticonJobCancelledError();
        }
        if (job.status === 'completed' || job.status === 'failed') return;
        const reason = params.reason || 'rate_limit';
        if (!queueSnapshot.exists) {
            transaction.create(queueRef, {
                userId: params.userId,
                jobId: params.jobId,
                mode: params.mode,
                reason,
                ...(params.batchId ? { batchId: params.batchId } : {}),
                ...(params.projectId ? { projectId: params.projectId } : {}),
                ...(params.projectItemId ? { projectItemId: params.projectItemId } : {}),
                status: 'queued',
                executeAtMs: params.executeAtMs,
                expiresAt: admin.firestore.Timestamp.fromMillis(
                    params.executeAtMs + CONTINUATION_TTL_MS,
                ),
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
        } else if (queueSnapshot.data()?.status === 'queued') {
            transaction.update(queueRef, {
                reason,
                ...(params.batchId ? { batchId: params.batchId } : {}),
                ...(params.projectId ? { projectId: params.projectId } : {}),
                ...(params.projectItemId ? { projectItemId: params.projectItemId } : {}),
                executeAtMs: params.executeAtMs,
                expiresAt: admin.firestore.Timestamp.fromMillis(
                    params.executeAtMs + CONTINUATION_TTL_MS,
                ),
                updatedAt: FieldValue.serverTimestamp(),
            });
        }
        transaction.update(jobRef, {
            status: 'queued',
            progress: Math.max(1, typeof job.progress === 'number' ? job.progress : 0),
            statusMessage: reason === 'batch_concurrency'
                ? '선택한 동시 실행 수에 맞춰 대기 중이에요. 앞 작업이 끝나면 자동으로 시작합니다.'
                : '서버 비용 보호 대기열에 예약됐어요. 순서가 되면 자동으로 시작합니다.',
            deferredUntilMs: params.executeAtMs,
            generationRunLeaseExpiresAtMs: params.executeAtMs + INITIAL_RUN_LEASE_MS,
            resumeAvailable: false,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

function buildSpecReport(params: {
    plan: EmoticonPlan;
    outputProfile: EmoticonOutputProfile;
    files: RenderedEmoticonFile[];
}) {
    const inspections = params.files.reduce<Partial<Record<RenderedEmoticonFile['format'], EmoticonOutputInspection>>>(
        (result, file) => {
            result[file.format] = file.inspection;
            return result;
        },
        {},
    );
    const canonical = inspections.png_zip
        || inspections.apng
        || inspections.webp
        || inspections.gif
        || inspections.webm
        || inspections.mp4
        || inspections.png;
    const technicalPass = params.files.length > 0
        && params.files.every((file) => file.inspection.passed);
    const profileVerified = params.outputProfile.verification === 'verified';
    const width = canonical?.width || params.outputProfile.width;
    const height = canonical?.height || params.outputProfile.height;
    const frameCount = canonical?.frameCount || params.plan.action.frameCount;
    const fps = Math.max(1, Math.round(canonical?.fps || params.plan.action.fps));
    const durationMs = canonical?.durationMs ?? params.plan.action.durationMs;
    const loop = canonical?.loop ?? params.outputProfile.type === 'animated';
    const isVerifiedKakaoProfile = profileVerified && params.outputProfile.platform === 'kakao';
    const kakaoCanvasPass = isVerifiedKakaoProfile
        && width === params.outputProfile.width
        && height === params.outputProfile.height;
    const kakaoFramePass = isVerifiedKakaoProfile
        && (
            params.outputProfile.type === 'static'
                ? frameCount === 1
                : frameCount >= 2 && frameCount <= 24
        );
    return {
        // Flat fields keep completed jobs readable by older clients. Every
        // value is taken from the encoded artifact selected as canonical.
        width,
        height,
        frameCount,
        fps,
        durationMs,
        loop,
        platform: params.outputProfile.platform,
        type: params.outputProfile.type,
        profileVersion: params.outputProfile.profileVersion,
        profileVerification: params.outputProfile.verification,
        outputInspections: params.files.map((file) => file.inspection),
        allOutputsPass: technicalPass,
        kakaoCanvasPass,
        kakaoFramePass,
        outputProfile: params.outputProfile,
        inspectedAt: new Date().toISOString(),
        actual: canonical
            ? {
                width: canonical.width,
                height: canonical.height,
                frameCount: canonical.frameCount,
                fps: canonical.fps,
                durationMs: canonical.durationMs,
                loop: canonical.loop,
                hasAlpha: canonical.hasAlpha,
            }
            : null,
        outputs: inspections,
        technicalPass,
        profileVerified,
        // Technical validation is not platform approval, and generated-AI
        // policy may independently prevent submission. Never claim otherwise.
        submissionCandidate: false,
        pngSequenceIncluded: Boolean(inspections.png_zip),
        submissionPackagePass: false,
        manualReviewRequired: true as const,
        notes: [
            technicalPass
                ? '생성된 파일의 실제 캔버스·프레임·길이·투명도 검사를 통과했습니다.'
                : '하나 이상의 출력 파일이 실제 기술 검사를 통과하지 못했습니다.',
            profileVerified
                ? '검증된 출력 프로필을 사용했습니다.'
                : '참고용 출력 프로필입니다. 플랫폼 최신 공식 가이드를 제출 직전에 확인하세요.',
            '기술 검사는 심사 승인이나 저작권·콘텐츠 검수를 대신하지 않습니다.',
        ],
    };
}

function isStaleWorkingJob(value: Record<string, unknown>): boolean {
    const workingStatuses = new Set(['queued', 'analyzing', 'generating', 'validating', 'animating', 'rendering']);
    if (typeof value.status !== 'string' || !workingStatuses.has(value.status)) return false;
    const updatedAt = value.updatedAt as { toMillis?: () => number } | undefined;
    const updatedAtMs = typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : 0;
    return updatedAtMs > 0 && Date.now() - updatedAtMs >= 10 * 60 * 1000;
}

function timestampToMillis(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const timestamp = value as { toMillis?: () => number } | undefined;
    return typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : Date.now();
}

function continuationExpiresAt(): admin.firestore.Timestamp {
    return admin.firestore.Timestamp.fromMillis(Date.now() + CONTINUATION_TTL_MS);
}

async function claimInitialJobRun(userId: string, jobId: string): Promise<string | null> {
    const jobRef = db.doc(`users/${userId}/emoticonJobs/${jobId}`);
    const runToken = randomUUID();
    const nowMs = Date.now();
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) return null;
        const job = snapshot.data() || {};
        const existingRunToken = typeof job.generationRunToken === 'string';
        const legacyClaimedAt = job.generationRunClaimedAt as { toMillis?: () => number } | undefined;
        const legacyClaimedAtMs = typeof legacyClaimedAt?.toMillis === 'function'
            ? legacyClaimedAt.toMillis()
            : 0;
        const existingLeaseExpiresAtMs = typeof job.generationRunLeaseExpiresAtMs === 'number'
            ? job.generationRunLeaseExpiresAtMs
            : legacyClaimedAtMs > 0
                ? legacyClaimedAtMs + INITIAL_RUN_LEASE_MS
                : existingRunToken
                    ? Number.MAX_SAFE_INTEGER
                    : 0;
        if (
            job.status !== 'queued'
            || job.cancelRequestedAt
            || (
                existingRunToken
                && existingLeaseExpiresAtMs > nowMs
            )
        ) return null;
        transaction.update(jobRef, {
            userId,
            generationRunToken: runToken,
            generationRunClaimedAt: FieldValue.serverTimestamp(),
            generationRunLeaseExpiresAtMs: nowMs + INITIAL_RUN_LEASE_MS,
            generationRunAttemptCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
        });
        return runToken;
    });
}

function parseContinuationState(
    value: unknown,
    frameCount?: number,
): EmoticonContinuationState {
    const parsed = emoticonContinuationStateSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`The saved continuation state is invalid: ${parsed.error.issues[0]?.message || 'unknown error'}`);
    }
    const state = parsed.data;
    if (!('pass' in state)) {
        return {
            stage: state.stage,
            retryCount: state.retryCount,
        };
    }
    if (frameCount === undefined) {
        throw new Error('The animation frame count required for continuation is unavailable.');
    }
    if (state.nextFrameIndex > frameCount || state.startIndex > frameCount) {
        throw new Error('The saved frame continuation cursor is invalid.');
    }
    return {
        stage: state.stage,
        pass: state.pass,
        startIndex: state.startIndex,
        nextFrameIndex: state.nextFrameIndex,
        totalGenerationCalls: state.totalGenerationCalls,
        retryCount: state.retryCount,
        ...(state.correction ? { correction: state.correction } : {}),
        ...(state.repairFrameIndices
            ? { repairFrameIndices: [...state.repairFrameIndices] }
            : {}),
        ...(state.nextRepairCursor !== undefined
            ? { nextRepairCursor: state.nextRepairCursor }
            : {}),
    };
}

function continuationJobStatus(stage: EmoticonContinuationState['stage']): string {
    if (stage === 'analysis') return 'analyzing';
    if (stage === 'pose-generation' || stage === 'pose-correction' || stage === 'repair-generation') {
        return 'generating';
    }
    if (
        stage === 'pose-review'
        || stage === 'corrected-pose-review'
        || stage === 'review'
        || stage === 'repair-pose-review'
        || stage === 'repair-sequence-review'
    ) {
        return 'validating';
    }
    if (stage === 'static-render' || stage === 'render' || stage === 'repair-render') return 'rendering';
    return 'animating';
}

async function enqueueContinuation(params: {
    userId: string;
    jobId: string;
    continuation: EmoticonContinuationState;
    progress: number;
    statusMessage: string;
    checkpointData?: Record<string, unknown>;
}): Promise<void> {
    const token = randomUUID();
    const continuationRef = db.collection('emoticonStudioContinuations').doc(token);
    const jobRef = db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`);
    const persistedState = {
        ...params.continuation,
        state: 'queued',
        token,
        requestedAt: FieldValue.serverTimestamp(),
    };
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) throw new Error('The emoticon job no longer exists.');
        const job = snapshot.data() || {};
        const runToken = typeof job.generationRunToken === 'string' ? job.generationRunToken : '';
        if (!runToken || job.userId !== params.userId) {
            throw new Error('The emoticon job run identity is unavailable.');
        }
        if (job.status === 'cancelled' || job.cancelRequestedAt) {
            throw new EmoticonJobCancelledError();
        }
        transaction.update(jobRef, {
            ...(params.checkpointData || {}),
            status: continuationJobStatus(params.continuation.stage),
            progress: params.progress,
            statusMessage: params.statusMessage,
            frameContinuation: persistedState,
            resumeAvailable: true,
            updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(continuationRef, {
            userId: params.userId,
            jobId: params.jobId,
            token,
            runToken,
            status: 'queued',
            stage: params.continuation.stage,
            expiresAt: continuationExpiresAt(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

async function scheduleFrameContinuation(params: {
    userId: string;
    jobId: string;
    continuation: EmoticonContinuationState;
    progress: number;
    statusMessage: string;
    checkpointData?: Record<string, unknown>;
}): Promise<never> {
    await enqueueContinuation(params);
    throw new EmoticonContinuationScheduledError();
}

async function ensureContinuationBudget(params: {
    deadlineAtMs?: number;
    minimumRemainingMs: number;
    userId: string;
    jobId: string;
    continuation: EmoticonContinuationState;
    progress: number;
    statusMessage: string;
}): Promise<void> {
    if (!params.deadlineAtMs) return;
    if (params.deadlineAtMs - Date.now() >= params.minimumRemainingMs) return;
    await scheduleFrameContinuation(params);
}

function isAmbiguousImageGenerationTimeout(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /image generation timed out[\s\S]*cost state is uncertain[\s\S]*automatic replay was blocked/i.test(message);
}

function isTransientContinuationError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    if (isAmbiguousImageGenerationTimeout(error)) return false;
    const status = typeof (error as { status?: unknown } | null)?.status === 'number'
        ? (error as { status: number }).status
        : null;
    if (/OPENROUTER_API_KEY|insufficient|credit|payment|balance|invalid|schema|quality|verified character animation|isolated character/i.test(message)) {
        return false;
    }
    if (status !== null && (status === 408 || status === 425 || status === 429 || status >= 500)) {
        return true;
    }
    return /timed? ?out|timeout|deadline|DEADLINE_EXCEEDED|\bUNAVAILABLE\b|abort|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|network|socket hang up|(?:HTTP |failed \()(?:408|425|429|5\d\d)\)?|internal server error|bad gateway|service unavailable|gateway timeout|temporarily unavailable/i.test(message);
}

function isOpenRouterCreditError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /insufficient credits|add more using .*openrouter.*credits|payment required|credit balance/i.test(message);
}

async function retryContinuationAfterTransient(params: {
    error: unknown;
    userId: string;
    jobId: string;
}): Promise<boolean> {
    if (!isTransientContinuationError(params.error)) return false;
    const jobRef = db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`);
    const snapshot = await jobRef.get();
    if (!snapshot.exists) return false;
    const job = snapshot.data() || {};
    if (
        job.status === 'completed'
        || job.status === 'failed'
        || job.status === 'cancelled'
        || job.cancelRequestedAt
    ) return false;
    const plan = emoticonStoredPlanSchema.safeParse(job.plan);
    let continuation: EmoticonContinuationState;
    try {
        continuation = parseContinuationState(
            job.frameContinuation,
            plan.success ? plan.data.action.frameCount : undefined,
        );
    } catch {
        return false;
    }
    const retryCount = continuation.retryCount || 0;
    if (retryCount >= MAX_CONTINUATION_RETRIES) return false;
    const next: EmoticonContinuationState = {
        ...continuation,
        retryCount: retryCount + 1,
    };
    await enqueueContinuation({
        userId: params.userId,
        jobId: params.jobId,
        continuation: next,
        progress: typeof job.progress === 'number' ? job.progress : 50,
        statusMessage: `일시적인 연결 문제로 저장한 단계부터 다시 시도해요 (${next.retryCount}/${MAX_CONTINUATION_RETRIES}).`,
    });
    return true;
}

function isRenderInfrastructureFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    if (/inspection|quality|identity|isolated|background|occlusion|character animation|motion review|invalid|schema/i.test(message)) {
        return false;
    }
    return isTransientContinuationError(error)
        || /storage|bucket|upload|download|ffmpeg|ffprobe|sharp|spawn|ENOENT|EACCES|filesystem|disk|socket/i.test(message);
}

async function buildRenderFailureRecoveryMarker(params: {
    userId: string;
    jobId: string;
    error: unknown;
}): Promise<Record<string, unknown> | null> {
    if (!isRenderInfrastructureFailure(params.error)) return null;
    const snapshot = await db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`).get();
    if (!snapshot.exists) return null;
    const job = snapshot.data() || {};
    const continuation = job.frameContinuation && typeof job.frameContinuation === 'object'
        ? job.frameContinuation as Record<string, unknown>
        : {};
    if (continuation.stage !== 'static-render' && continuation.stage !== 'render') return null;
    const quality = emoticonQualitySchema.safeParse(job.quality);
    const plan = emoticonStoredPlanSchema.safeParse(job.plan);
    const poseAccepted = quality.success && (
        plan.success && isDynamicRender(plan.data)
            ? meetsEmoticonDynamicKeyPoseAcceptance(quality.data)
            : meetsEmoticonPoseAcceptance(quality.data)
    );
    if (!poseAccepted) return null;
    return {
        stage: 'render',
        category: 'infrastructure',
        poseAccepted: true,
        markedAt: FieldValue.serverTimestamp(),
    };
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
    preserveExistingDownloadToken?: boolean;
}): Promise<UploadedAsset> {
    const bucket = admin.storage().bucket();
    const storagePath = `users/${params.userId}/emoticon-studio/jobs/${params.jobId}/${params.fileName}`;
    const storageFile = bucket.file(storagePath);
    // Keep the private URL stable when a continuation recreates the same
    // canonical asset. The URL participates in the OpenRouter logical
    // operation id; rotating it here could bypass duplicate-charge protection
    // after a paid response succeeded but its Firestore checkpoint was lost.
    const existingMetadata = params.preserveExistingDownloadToken
        ? await storageFile.getMetadata()
            .then(([metadata]) => metadata)
            .catch(() => null)
        : null;
    const existingDownloadToken = typeof existingMetadata?.metadata?.firebaseStorageDownloadTokens === 'string'
        ? existingMetadata.metadata.firebaseStorageDownloadTokens.split(',')[0]?.trim()
        : '';
    const downloadToken = existingDownloadToken || randomUUID();
    await storageFile.save(params.buffer, {
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
    const expectedSourcePrefix = `users/${params.userId}/emoticon-studio/sources/`;
    if (!params.sourceStoragePath.startsWith(expectedSourcePrefix)) {
        throw new Error('Source image does not belong to this user.');
    }
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
        preserveExistingDownloadToken: true,
    });
    return {
        asset,
        fingerprint: createHash('sha256').update(normalized).digest('hex'),
    };
}

type CanonicalReferenceSet = {
    urls: string[];
    identitySheetUrl?: string;
    referenceSetFingerprint: string;
};

function isStoredCanonicalAssetUrl(params: {
    value: unknown;
    userId: string;
    jobId: string;
    fileName: string;
}): boolean {
    if (typeof params.value !== 'string') return false;
    try {
        const parsed = new URL(params.value);
        const objectMarker = '/o/';
        const markerIndex = parsed.pathname.indexOf(objectMarker);
        if (
            parsed.protocol !== 'https:'
            || parsed.hostname !== 'firebasestorage.googleapis.com'
            || markerIndex < 0
            || parsed.searchParams.get('alt') !== 'media'
            || !parsed.searchParams.get('token')
        ) return false;
        const objectPath = decodeURIComponent(parsed.pathname.slice(markerIndex + objectMarker.length));
        return objectPath === `users/${params.userId}/emoticon-studio/jobs/${params.jobId}/${params.fileName}`;
    } catch {
        return false;
    }
}

function readCanonicalReferenceCheckpoint(params: {
    userId: string;
    jobId: string;
    sourceStoragePath: string;
    references: EmoticonJobRequest['referenceImages'];
    job: Record<string, unknown>;
}): CanonicalReferenceSet | null {
    const referenceCount = [...new Set(
        params.references
            .map((reference) => reference.sourceStoragePath)
            .filter((storagePath) => storagePath !== params.sourceStoragePath),
    )].slice(0, 3).length;
    const storedUrls = params.job.canonicalReferenceUrls;
    const fingerprint = params.job.referenceSetFingerprint;
    if (
        !Array.isArray(storedUrls)
        || storedUrls.length !== referenceCount
        || typeof fingerprint !== 'string'
        || !/^[a-f0-9]{64}$/.test(fingerprint)
        || storedUrls.some((url, index) => !isStoredCanonicalAssetUrl({
            value: url,
            userId: params.userId,
            jobId: params.jobId,
            fileName: `reference-${index + 1}.png`,
        }))
    ) return null;
    const identitySheetUrl = params.job.canonicalIdentityReferenceUrl;
    if (
        referenceCount >= 2
        && !isStoredCanonicalAssetUrl({
            value: identitySheetUrl,
            userId: params.userId,
            jobId: params.jobId,
            fileName: 'identity-reference-sheet.png',
        })
    ) return null;
    return {
        urls: storedUrls as string[],
        ...(referenceCount >= 2 ? { identitySheetUrl: identitySheetUrl as string } : {}),
        referenceSetFingerprint: fingerprint,
    };
}

async function prepareCanonicalReferenceSet(params: {
    userId: string;
    jobId: string;
    sourceStoragePath: string;
    references: EmoticonJobRequest['referenceImages'];
}): Promise<CanonicalReferenceSet> {
    const expectedSourcePrefix = `users/${params.userId}/emoticon-studio/sources/`;
    const uniqueStoragePaths = [...new Set(
        params.references
            .map((reference) => reference.sourceStoragePath)
            .filter((storagePath) => storagePath !== params.sourceStoragePath),
    )].sort((left, right) => left.localeCompare(right)).slice(0, 3);
    const canonicalUrls: string[] = [];
    const normalizedBuffers: Buffer[] = [];
    const normalizedFingerprints: string[] = [];
    for (const [index, storagePath] of uniqueStoragePaths.entries()) {
        if (!storagePath.startsWith(expectedSourcePrefix)) {
            throw new Error('A character reference image does not belong to this user.');
        }
        const file = admin.storage().bucket().file(storagePath);
        const [metadata] = await file.getMetadata().catch(() => {
            throw new Error('A character reference image could not be found in this user workspace.');
        });
        const sizeBytes = Number(metadata.size || 0);
        const contentType = metadata.contentType?.split(';')[0] || '';
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
            throw new Error('Character reference images must be PNG, JPEG, or WebP files.');
        }
        if (!sizeBytes || sizeBytes > 25 * 1024 * 1024) {
            throw new Error('Each character reference image must be smaller than 25 MB.');
        }
        const [sourceBuffer] = await file.download();
        const normalized = await normalizeEmoticonSourceImage(sourceBuffer);
        normalizedBuffers.push(normalized);
        normalizedFingerprints.push(createHash('sha256').update(normalized).digest('hex'));
        const canonical = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: `reference-${index + 1}.png`,
            buffer: normalized,
            contentType: 'image/png',
            preserveExistingDownloadToken: true,
        });
        canonicalUrls.push(canonical.url);
    }
    let identitySheetUrl: string | undefined;
    if (normalizedBuffers.length >= 2) {
        const tileSize = 512;
        const tiles = await Promise.all(normalizedBuffers.map((buffer) => sharp(buffer)
            .ensureAlpha()
            .resize(tileSize - 32, tileSize - 32, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer()));
        const identitySheet = await sharp({
            create: {
                width: tileSize * 2,
                height: tileSize * 2,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        }).composite(tiles.map((input, index) => ({
            input,
            left: (index % 2) * tileSize + 16,
            top: Math.floor(index / 2) * tileSize + 16,
        }))).png().toBuffer();
        const identitySheetAsset = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: 'identity-reference-sheet.png',
            buffer: identitySheet,
            contentType: 'image/png',
            preserveExistingDownloadToken: true,
        });
        identitySheetUrl = identitySheetAsset.url;
    }
    return {
        urls: canonicalUrls,
        ...(identitySheetUrl ? { identitySheetUrl } : {}),
        referenceSetFingerprint: buildEmoticonReferenceSetFingerprint(normalizedFingerprints),
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

const EMOTICON_UPLOAD_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(
    items: readonly T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (!items.length) return [];
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    let failed = false;
    let firstError: unknown;
    const workers = Array.from(
        { length: Math.min(Math.max(1, concurrency), items.length) },
        async () => {
            while (!failed && nextIndex < items.length) {
                const index = nextIndex;
                nextIndex += 1;
                try {
                    results[index] = await mapper(items[index], index);
                } catch (error) {
                    failed = true;
                    firstError = error;
                }
            }
        },
    );
    await Promise.all(workers);
    if (failed) throw firstError;
    return results;
}

async function uploadRenderedFiles(params: {
    userId: string;
    jobId: string;
    files: RenderedEmoticonFile[];
}): Promise<Record<string, UploadedAsset & { format: string; inspection: EmoticonOutputInspection }>> {
    const outputs: Record<string, UploadedAsset & { format: string; inspection: EmoticonOutputInspection }> = {};
    const uploadedFiles = await mapWithConcurrency(
        params.files,
        EMOTICON_UPLOAD_CONCURRENCY,
        async (file) => ({
            file,
            uploaded: await uploadBuffer({
                userId: params.userId,
                jobId: params.jobId,
                fileName: `emoticon-${params.jobId.slice(0, 8)}.${file.extension}`,
                buffer: file.buffer,
                contentType: file.contentType,
            }),
        }),
    );
    for (const { file, uploaded } of uploadedFiles) {
        outputs[file.format] = {
            ...uploaded,
            format: file.format,
            inspection: file.inspection,
        };
    }
    return outputs;
}

async function uploadCompositedFrameSequence(params: {
    userId: string;
    jobId: string;
    frames: Buffer[];
    onProgress?: (frames: EmoticonAnimationFrame[]) => Promise<void>;
}): Promise<EmoticonAnimationFrame[]> {
    const uploaded = await mapWithConcurrency(
        params.frames,
        EMOTICON_UPLOAD_CONCURRENCY,
        async (buffer, index): Promise<EmoticonAnimationFrame> => {
            const asset = await uploadBuffer({
                userId: params.userId,
                jobId: params.jobId,
                fileName: `final-frame-${String(index + 1).padStart(3, '0')}.png`,
                buffer,
                contentType: 'image/png',
            });
            return { ...asset, contentType: 'image/png' };
        },
    );
    if (params.onProgress) await params.onProgress(uploaded);
    return uploaded;
}

function assertRenderedFilesPassedInspection(files: RenderedEmoticonFile[]): void {
    if (files.length && files.every((file) => file.inspection.passed)) return;
    const issues = files.flatMap((file) => file.inspection.issues).slice(0, 4);
    throw new Error(
        `One or more encoded output inspections failed${issues.length ? `: ${issues.join('; ')}` : '.'}`,
    );
}

function qualityScore(quality: EmoticonQuality): number {
    const weighted = quality.identity * 0.3
        + quality.styleConsistency * 0.18
        + quality.actionClarity * 0.15
        + quality.backgroundClean * 0.15
        + quality.occlusionFree * 0.1
        + quality.overall * 0.07
        + (quality.singleCharacter ? 3 : 0)
        + (quality.allReferencesConsistent ? 2 : 0);
    return Math.min(weighted, quality.singleCharacter ? 100 : 49);
}

function motionReviewScore(review: EmoticonMotionReview): number {
    return scoreEmoticonMotionQuality(review);
}

function buildPremiumMotionCorrection(review: EmoticonMotionReview): string {
    const deficits = getEmoticonPremiumMotionDeficits(review);
    return [
        `Target an expert-quality ${EMOTICON_PREMIUM_MOTION_TARGET}/100 animation, not merely the minimum acceptance threshold.`,
        deficits.length ? `Fix these verified deficits: ${deficits.join('; ')}.` : '',
        review.correction.trim(),
        'Preserve every already-correct immutable identity trait and transparent edge while making the requested limb positions and facial beats unmistakably different at thumbnail size.',
    ].filter(Boolean).join(' ').slice(0, 1200);
}

function needsPoseIsolationCorrection(quality: EmoticonQuality, dynamicKeyPose = false): boolean {
    return dynamicKeyPose
        ? !meetsEmoticonDynamicKeyPoseAcceptance(quality)
        : !meetsEmoticonPoseAcceptance(quality);
}

const BACKGROUND_ISSUE_PATTERN = /background|transparent|alpha|배경|투명/iu;

const HIDDEN_ALPHA_ISSUE_PATTERN = /hidden\s+rgb|alpha\s*(?:zero|0)|fully\s+transparent|transparent\s+pixels?|투명\s*픽셀|알파\s*0/iu;

function applyAlphaIsolationEvidence(
    quality: EmoticonQuality,
    inspection: EmoticonAlphaIsolationInspection,
): EmoticonQuality {
    if (!inspection.passed) return quality;
    const backgroundIssues = quality.issues.filter((issue) => BACKGROUND_ISSUE_PATTERN.test(issue));
    if (!backgroundIssues.length || backgroundIssues.some((issue) => !HIDDEN_ALPHA_ISSUE_PATTERN.test(issue))) {
        return quality;
    }
    return {
        ...quality,
        backgroundClean: 100,
        issues: quality.issues.filter((issue) => !HIDDEN_ALPHA_ISSUE_PATTERN.test(issue)),
    };
}

function applyMotionAlphaIsolationEvidence(
    review: EmoticonMotionReview,
    inspections: EmoticonAlphaIsolationInspection[],
): EmoticonMotionReview {
    if (!inspections.length || inspections.some((inspection) => !inspection.passed)) return review;
    const backgroundIssues = review.issues.filter((issue) => BACKGROUND_ISSUE_PATTERN.test(issue));
    if (!backgroundIssues.length || backgroundIssues.some((issue) => !HIDDEN_ALPHA_ISSUE_PATTERN.test(issue))) {
        return review;
    }
    return {
        ...review,
        backgroundClean: 100,
        issues: review.issues.filter((issue) => !HIDDEN_ALPHA_ISSUE_PATTERN.test(issue)),
    };
}

function safeErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (isDefiniteImageRouteCompatibilityError(error)) {
        return '이미지 제공자의 지원 옵션이 바뀌어 생성 단계에서 멈췄어요. 저장된 단계부터 안전하게 다시 이어 만들 수 있어요.';
    }
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
    if (/daily budget/i.test(message)) {
        return '오늘 사용할 수 있는 작업 횟수에 도달했어요. UTC 날짜가 바뀐 뒤 다시 시도해 주세요.';
    }
    if (/rate limit exceeded/i.test(message)) {
        return '한 번에 너무 많은 작업을 요청했어요. 약 1분 뒤 다시 시도해 주세요.';
    }
    if (/character reference image/i.test(message)) {
        return '캐릭터 참고 이미지를 확인할 수 없어요. 25MB 이하 PNG, JPG, WebP 파일을 다시 넣어 주세요.';
    }
    if (/source image/i.test(message)) {
        return '원본 이미지를 읽을 수 없어요. 25MB 이하의 PNG, JPG, WebP 파일을 다시 넣어 주세요.';
    }
    if (/generated (?:image|pose)|non-image result/i.test(message)) {
        return 'AI가 사용할 수 없는 이미지를 반환했어요. 같은 설정으로 다시 시도해 주세요.';
    }
    if (/frame sequence count does not match/i.test(message)) {
        return '저장된 프레임 수가 애니메이션 설정과 맞지 않아 파일을 조립하지 않았어요. 프레임 수를 확인한 뒤 새로 만들어 주세요.';
    }
    if (/frame sequence|required ordered/i.test(message)) {
        return 'AI가 프레임별 동작 계획을 완성하지 못했어요. 같은 요청으로 다시 시도해 주세요.';
    }
    if (/frame repair|replacement frame|parent animation|parent frames|ordered frame plan|repair source/i.test(message)) {
        return '선택한 프레임을 안전하게 교체하지 못했어요. 검사를 통과한 원본 완성 작업에서 해당 프레임을 다시 선택해 주세요.';
    }
    if (/encoded output inspections/i.test(message)) {
        return '프레임은 교체됐지만 전체 출력 파일 검사에서 문제가 발견돼 결과를 완료 처리하지 않았어요.';
    }
    if (/requested output format is not allowed|animation has (fewer|more) frames|animation duration exceeds|must be smaller than|must be at least|cannot exceed/i.test(message)) {
        return '선택한 파일 형식·프레임 수·크기가 플랫폼 규격과 맞지 않아 파일을 조립하지 않았어요. 생성 설정을 확인해 주세요.';
    }
    if (/speech-bubble.*animation timeline/i.test(message)) {
        return '말풍선이 애니메이션 프레임 범위를 벗어나 파일을 조립하지 않았어요. 말풍선 구간을 확인해 주세요.';
    }
    if (/ffmpeg|ffprobe|sharp|spawn|ENOENT|EACCES|filesystem|disk|socket/i.test(message)) {
        return '파일 조립 서버가 일시적으로 응답하지 않았어요. 저장된 프레임부터 다시 이어 만들 수 있어요.';
    }
    if (/linked project item|project item does not exist/i.test(message)) {
        return '연결된 프로젝트 항목을 찾을 수 없어요. 항목을 다시 선택한 뒤 생성해 주세요.';
    }
    return '이모티콘을 만드는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
}

async function syncLinkedProjectItem(params: {
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
    generationStatus: 'planned' | 'queued' | 'generating' | 'completed' | 'failed';
    validationErrors?: string[];
    jobCreatedAtMs?: number;
    authoritativeMotion?: {
        fps: number;
        frameCount: number;
        durationMs: number;
    };
}): Promise<void> {
    if (!params.request.projectId || !params.request.projectItemId) return;
    const projectRef = db.doc(`users/${params.userId}/emoticonProjects/${params.request.projectId}`);
    const itemRef = projectRef.collection('items').doc(params.request.projectItemId);
    await db.runTransaction(async (transaction) => {
        const projectSnapshot = await transaction.get(projectRef);
        const itemSnapshot = await transaction.get(itemRef);
        const itemCollectionSnapshot = await transaction.get(projectRef.collection('items'));
        if (!projectSnapshot.exists) return;
        const project = projectSnapshot.data() || {};
        const currentProjectRevision = typeof project.revision === 'number'
            ? project.revision
            : 0;
        const projectConfigurationChanged = (
            params.generationStatus === 'completed'
            && params.request.projectRevision !== undefined
            && currentProjectRevision !== params.request.projectRevision
        );
        const effectiveGenerationStatus = projectConfigurationChanged
            ? 'failed' as const
            : params.generationStatus;
        const effectiveValidationErrors = projectConfigurationChanged
            ? ['생성 중 프로젝트 설정이 변경되어 결과를 대표 항목에 연결하지 않았습니다. 완성 기록에서 결과를 확인하거나 새 설정으로 다시 만들어 주세요.']
            : params.validationErrors || [];
        const items = Array.isArray(project.items) ? project.items : [];
        const embeddedItem = items.find((value) => (
            Boolean(value && typeof value === 'object')
            && (value as Record<string, unknown>).id === params.request.projectItemId
        )) as Record<string, unknown> | undefined;
        if (!itemSnapshot.exists && !embeddedItem) {
            logger.warn('[EmoticonStudio] Linked project item does not exist; refusing to create a partial item.', {
                projectId: params.request.projectId,
                projectItemId: params.request.projectItemId,
                jobId: params.jobId,
            });
            throw new Error('The linked project item does not exist.');
        }
        const current = itemSnapshot.exists ? itemSnapshot.data() || {} : embeddedItem || {};
        const currentMotion = current.motion && typeof current.motion === 'object'
            ? current.motion as Record<string, unknown>
            : {};
        const synchronizedMotion = params.authoritativeMotion
            ? {
                ...currentMotion,
                ...params.authoritativeMotion,
            }
            : undefined;
        const synchronizedEditRecipe = effectiveGenerationStatus === 'completed'
            ? params.request.renderOverrides?.editRecipe
                || (params.request.mode === 'generate'
                    ? createIdentityEmoticonImageEditRecipe()
                    : undefined)
            : undefined;
        const currentEditHistory = Array.isArray(current.editHistory)
            ? current.editHistory.filter((entry) => (
                Boolean(entry && typeof entry === 'object')
                && (entry as Record<string, unknown>).resultJobId !== params.jobId
            ))
            : [];
        const synchronizedEditHistory = synchronizedEditRecipe && synchronizedEditRecipe.revision > 0
            ? [...currentEditHistory, {
                recipe: synchronizedEditRecipe,
                sourceJobId: params.request.parentJobId || params.jobId,
                resultJobId: params.jobId,
                createdAt: admin.firestore.Timestamp.now(),
            }].slice(-20)
            : currentEditHistory;
        const currentJobId = typeof current.jobId === 'string' ? current.jobId : '';
        const currentJobCreatedAtMs = typeof current.activeJobCreatedAtMs === 'number'
            ? current.activeJobCreatedAtMs
            : 0;
        const incomingJobCreatedAtMs = params.jobCreatedAtMs || Date.now();
        const currentClientRevision = typeof current.clientRevision === 'number'
            ? current.clientRevision
            : -1;
        const incomingClientRevision = params.request.projectItemRevision;
        const isClaim = effectiveGenerationStatus === 'queued' || effectiveGenerationStatus === 'generating';
        if (isClaim && currentJobId && currentJobId !== params.jobId) {
            throw new EmoticonStaleProjectItemClaimError();
        }
        const staleClientRevision = (
            currentJobId
            && currentJobId !== params.jobId
            && incomingClientRevision !== undefined
            && currentClientRevision > incomingClientRevision
        );
        const staleCreatedAt = (
            currentJobId
            && currentJobId !== params.jobId
            && (
                currentJobCreatedAtMs > incomingJobCreatedAtMs
                || (
                    currentJobCreatedAtMs === incomingJobCreatedAtMs
                    && currentJobId.localeCompare(params.jobId) > 0
                )
            )
        );
        if (staleClientRevision || (isClaim ? staleCreatedAt : Boolean(currentJobId && currentJobId !== params.jobId))) {
            logger.info('[EmoticonStudio] Ignored stale project item status update.', {
                projectId: params.request.projectId,
                projectItemId: params.request.projectItemId,
                incomingJobId: params.jobId,
                activeJobId: currentJobId,
            });
            return;
        }

        const serverRevision = typeof current.serverRevision === 'number'
            ? current.serverRevision + 1
            : 1;
        const baseItem: Record<string, unknown> = {};
        if (!itemSnapshot.exists && embeddedItem) {
            Object.keys(embeddedItem).forEach((key) => {
                if (embeddedItem[key] !== undefined) baseItem[key] = embeddedItem[key];
            });
        }
        transaction.set(itemRef, {
            ...baseItem,
            id: params.request.projectItemId,
            jobId: projectConfigurationChanged ? null : params.jobId,
            activeJobCreatedAtMs: incomingJobCreatedAtMs,
            generationStatus: effectiveGenerationStatus,
            validationErrors: effectiveValidationErrors,
            ...(!projectConfigurationChanged && synchronizedMotion ? { motion: synchronizedMotion } : {}),
            ...(!projectConfigurationChanged && synchronizedEditRecipe ? {
                editRecipe: synchronizedEditRecipe,
                editHistory: synchronizedEditHistory,
            } : {}),
            serverRevision,
            ...(incomingClientRevision !== undefined ? { clientRevision: incomingClientRevision } : {}),
            ...(params.request.projectRevision !== undefined
                ? { sourceProjectRevision: params.request.projectRevision }
                : {}),
            ...(!itemSnapshot.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        let itemFound = false;
        const nextItems = items.map((value) => {
            if (!value || typeof value !== 'object') return value;
            const item = value as Record<string, unknown>;
            if (item.id !== params.request.projectItemId) return value;
            itemFound = true;
            return {
                ...item,
                jobId: projectConfigurationChanged ? null : params.jobId,
                activeJobCreatedAtMs: incomingJobCreatedAtMs,
                generationStatus: effectiveGenerationStatus,
                validationErrors: effectiveValidationErrors,
                ...(!projectConfigurationChanged && synchronizedMotion ? { motion: synchronizedMotion } : {}),
                ...(!projectConfigurationChanged && synchronizedEditRecipe ? {
                    editRecipe: synchronizedEditRecipe,
                    editHistory: synchronizedEditHistory,
                } : {}),
                serverRevision,
                ...(incomingClientRevision !== undefined ? { clientRevision: incomingClientRevision } : {}),
            };
        });
        // Aggregate the v2 subcollection as the source of truth, while also
        // including embedded-only legacy items until they are migrated.
        const statusByItemId = new Map<string, unknown>();
        nextItems.forEach((value) => {
            if (!value || typeof value !== 'object') return;
            const legacyItem = value as Record<string, unknown>;
            if (typeof legacyItem.id === 'string') {
                statusByItemId.set(legacyItem.id, legacyItem.generationStatus);
            }
        });
        itemCollectionSnapshot.docs.forEach((document) => {
            statusByItemId.set(document.id, document.data().generationStatus);
        });
        statusByItemId.set(params.request.projectItemId!, effectiveGenerationStatus);
        const statuses = [...statusByItemId.values()];
        const projectStatus = statuses.length && statuses.every((status) => status === 'completed')
            ? 'completed'
            : statuses.some((status) => status === 'generating' || status === 'queued')
                ? 'generating'
                : statuses.some((status) => status === 'failed')
                    ? 'failed'
                    : statuses.some((status) => status === 'cancelled')
                        ? 'ready'
                    : 'ready';
        transaction.update(projectRef, {
            ...(itemFound ? { items: nextItems } : {}),
            status: projectStatus,
            lastItemJobId: params.jobId,
            lastItemStatus: effectiveGenerationStatus,
            updatedAt: FieldValue.serverTimestamp(),
        });
        if (projectConfigurationChanged) {
            logger.warn('[EmoticonStudio] Completed output was detached because the project revision changed.', {
                userId: params.userId,
                projectId: params.request.projectId,
                projectItemId: params.request.projectItemId,
                jobId: params.jobId,
                requestedRevision: params.request.projectRevision,
                currentRevision: currentProjectRevision,
            });
        }
    });
}

async function syncCompletedProjectItemNonFatal(params: {
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
    jobCreatedAtMs?: number;
}): Promise<void> {
    try {
        const jobSnapshot = await db.doc(`users/${params.userId}/emoticonJobs/${params.jobId}`).get();
        const completedJob = jobSnapshot.data() || {};
        const completedPlan = emoticonStoredPlanSchema.safeParse(completedJob.plan);
        const completedManualReport = emoticonManualFrameImportReportSchema.safeParse(
            completedJob.manualImportReport,
        );
        const completedOutputProfile = emoticonOutputProfileSchema.safeParse(completedJob.outputProfile);
        const completedSpec = completedJob.specReport && typeof completedJob.specReport === 'object'
            ? completedJob.specReport as Record<string, unknown>
            : {};
        const inspectedMotion = (
            Number.isInteger(completedSpec.fps)
            && Number.isInteger(completedSpec.frameCount)
            && Number.isInteger(completedSpec.durationMs)
        )
            ? {
                fps: completedSpec.fps as number,
                frameCount: completedSpec.frameCount as number,
                durationMs: completedSpec.durationMs as number,
            }
            : undefined;
        const authoritativeMotion = completedOutputProfile.success
            && completedOutputProfile.data.type === 'static'
            ? { fps: 1, frameCount: 1, durationMs: 0 }
            : completedManualReport.success && completedPlan.success
                ? {
                    fps: completedPlan.data.action.fps,
                    frameCount: completedPlan.data.action.frameCount,
                    durationMs: completedPlan.data.action.durationMs,
                }
                : inspectedMotion || (completedPlan.success
                ? {
                    fps: completedPlan.data.action.fps,
                    frameCount: completedPlan.data.action.frameCount,
                    durationMs: completedPlan.data.action.durationMs,
                }
                : undefined);
        await syncLinkedProjectItem({
            ...params,
            generationStatus: 'completed',
            authoritativeMotion,
        });
    } catch (error) {
        logger.warn('[EmoticonStudio] Output completed, but linked project bookkeeping was skipped.', {
            userId: params.userId,
            jobId: params.jobId,
            projectId: params.request.projectId,
            projectItemId: params.request.projectItemId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function reviewPose(params: {
    apiKey: string;
    model: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    sourceImageUrl: string;
    originalUserInstruction: string;
    additionalReferenceUrls?: string[];
    generatedImageUrl: string;
    plan: EmoticonPlan;
    allowBackground?: boolean;
}): Promise<EmoticonQuality> {
    try {
        return await evaluateEmoticonPose(params);
    } catch (error) {
        if (isTransientContinuationError(error)) throw error;
        logger.warn('[EmoticonStudio] Automated pose review failed; rejecting the unverified pose.', {
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            overall: 0,
            identity: 0,
            allReferencesConsistent: false,
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
        overall: motionReviewScore(review),
        identity: review.identity,
        allReferencesConsistent: review.allReferencesConsistent,
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

function isVerifiedBodyMotion(review: EmoticonMotionReview, plan: EmoticonPlan): boolean {
    return meetsEmoticonMotionAcceptance(
        review,
        getEmoticonMotionAcceptanceRequirements(plan),
    );
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

function buildAnimationFrameSeed(sequenceSeed: number, frameIndex: number): number {
    return (sequenceSeed ^ Math.imul(frameIndex + 1, 0x45d9f3b)) & 0x7fffffff;
}

async function reviewImageFrameSequence(params: {
    apiKey: string;
    model: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    sourceImageUrl: string;
    originalUserInstruction: string;
    additionalReferenceUrls?: string[];
    frameUrls: string[];
    plan: EmoticonPlan;
}): Promise<EmoticonMotionReview> {
    return evaluateEmoticonMotion({
        apiKey: params.apiKey,
        model: params.model,
        fallbackModels: params.fallbackModels,
        reasoningEffort: params.reasoningEffort,
        sourceImageUrl: params.sourceImageUrl,
        originalUserInstruction: params.originalUserInstruction,
        additionalReferenceUrls: params.additionalReferenceUrls,
        frameUrls: params.frameUrls,
        plan: params.plan,
    });
}

async function reviewImageFrameSequenceFailClosed(params: {
    apiKey: string;
    model: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    sourceImageUrl: string;
    originalUserInstruction: string;
    additionalReferenceUrls?: string[];
    frameUrls: string[];
    plan: EmoticonPlan;
}): Promise<EmoticonMotionReview> {
    try {
        return await reviewImageFrameSequence(params);
    } catch (error) {
        if (isTransientContinuationError(error)) throw error;
        logger.warn('[EmoticonStudio] Repair sequence review failed; rejecting the unverified sequence.', {
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            overall: 0,
            identity: 0,
            allReferencesConsistent: false,
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
            problemFrameIndices: [],
            issues: ['자동 전체 프레임 검사를 완료하지 못했습니다.'],
            correction: 'Review and regenerate the faulty frame while preserving identity, isolation, motion continuity, and loop continuity.',
        };
    }
}

async function renderAiFrameSequenceOutputs(params: {
    apiKey: string;
    model: string;
    imageModel?: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    sourceImageUrl: string;
    originalUserInstruction: string;
    identityReferenceUrl?: string;
    additionalReferenceUrls?: string[];
    userId: string;
    jobId: string;
    plan: EmoticonPlan;
    resourceMode: EmoticonResourceMode;
    outputProfile: EmoticonOutputProfile;
    poseBuffer?: Buffer;
    poseStoragePath?: string;
    poseUrl: string;
    mirroredPoseUrl?: string;
    formats: Parameters<typeof renderImageEmoticon>[0]['formats'];
    update: (data: Record<string, unknown>) => Promise<void>;
    frameSequence?: EmoticonFrameSequence;
    initialAnimationFrames?: EmoticonAnimationFrame[];
    continuation?: FrameContinuationState;
    motionReview?: EmoticonMotionReview;
    deadlineAtMs?: number;
}): Promise<{
    files: RenderedEmoticonFile[];
    motionFallbackReason: string | null;
    motionQuality: EmoticonQuality | null;
    animationFrames: EmoticonAnimationFrame[];
    compositedFrames: EmoticonAnimationFrame[];
}> {
    const frameCount = params.plan.action.frameCount;
    const sequenceSeed = buildFrameSequenceSeed(params.jobId);
    let mirroredPoseUrl = params.mirroredPoseUrl;
    if (!mirroredPoseUrl) {
        const expectedPosePrefix = `users/${params.userId}/emoticon-studio/jobs/${params.jobId}/`;
        if (!params.poseBuffer && !params.poseStoragePath?.startsWith(expectedPosePrefix)) {
            throw new Error('The canonical key pose required for opposite-side motion guidance is unavailable.');
        }
        const canonicalPoseBuffer = params.poseBuffer
            || await downloadStoredPose(params.poseStoragePath as string);
        const mirroredPoseBuffer = await sharp(canonicalPoseBuffer)
            .flop()
            .png({ compressionLevel: 9, adaptiveFiltering: true })
            .toBuffer();
        const mirroredPoseAsset = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: 'key-pose-mirrored.png',
            buffer: mirroredPoseBuffer,
            contentType: 'image/png',
        });
        mirroredPoseUrl = mirroredPoseAsset.url;
        await params.update({
            mirroredKeyPoseUrl: mirroredPoseAsset.url,
            mirroredKeyPoseStoragePath: mirroredPoseAsset.storagePath,
        });
    }
    const animationFrames = [...(params.initialAnimationFrames || [])];
    if (animationFrames.length > frameCount) {
        throw new Error('Saved animation frames exceed the requested frame count.');
    }
    // Generation and checkpoint recovery need stored frame URLs, not decoded
    // pixel buffers. Hydrate only once immediately before review/render so a
    // segmented 24-frame job does not repeatedly download 1+...+23 images.
    const frameBuffers: Array<Buffer | undefined> = new Array(animationFrames.length).fill(undefined);
    const frameUrls = animationFrames.map((frame) => frame.url);
    const ensureFrameBuffersHydrated = async (): Promise<Buffer[]> => {
        const missingIndices = frameBuffers.reduce<number[]>((indices, buffer, index) => {
            if (!buffer) indices.push(index);
            return indices;
        }, []);
        if (missingIndices.length) {
            const downloaded = await downloadStoredAnimationFrames({
                userId: params.userId,
                parentJobId: params.jobId,
                frames: missingIndices.map((index) => animationFrames[index]),
            });
            missingIndices.forEach((frameIndex, downloadedIndex) => {
                frameBuffers[frameIndex] = downloaded[downloadedIndex];
            });
        }
        const hydrated = frameBuffers.filter((buffer): buffer is Buffer => buffer !== undefined);
        if (hydrated.length !== animationFrames.length) {
            throw new Error('Stored animation frame hydration did not preserve the frame timeline.');
        }
        return hydrated;
    };
    let frameSequence = params.frameSequence;
    let continuation: FrameContinuationState = params.continuation || {
        stage: frameSequence ? 'generation' : 'planning',
        startIndex: 0, pass: 1,
        nextFrameIndex: animationFrames.length,
        totalGenerationCalls: 0,
        retryCount: 0,
    };
    if (continuation.nextFrameIndex !== animationFrames.length) {
        throw new Error('Saved animation frames do not match the continuation cursor.');
    }

    await params.update({
        status: 'animating',
        progress: 61,
        statusMessage: `${frameCount}개 프레임의 동작·표정 흐름을 먼저 설계하고 있어요.`,
    });
    if (!frameSequence) {
        if (continuation.stage !== 'planning') {
            throw new Error('The frame sequence plan required for continuation is unavailable.');
        }
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_REVIEW_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 61,
            statusMessage: '긴 작업을 안전하게 나눠 동작 프레임 설계를 이어갈게요.',
        });
        await assertJobActive(params.userId, params.jobId);
        frameSequence = await planEmoticonFrameSequence({
            apiKey: params.apiKey,
            model: params.model,
            fallbackModels: params.fallbackModels,
            sourceImageUrl: params.sourceImageUrl,
            originalUserInstruction: params.originalUserInstruction,
            plan: params.plan,
            // The verified character profile already carries the identity
            // contract. Efficient mode avoids re-sending the same high-detail
            // source to this planning-only request.
            includeSourceImage: params.resourceMode !== 'efficient',
            reasoningEffort: params.reasoningEffort,
        });
        continuation = {
            stage: 'generation',
            pass: 1,
            startIndex: 0,
            nextFrameIndex: 0,
            totalGenerationCalls: continuation.totalGenerationCalls,
            retryCount: continuation.retryCount || 0,
        };
        await params.update({
            frameSequencePlan: frameSequence,
            frameGeneration: {
                strategy: 'openrouter-image-sequence',
                requestedFrameCount: frameCount,
                generatedFrameCount: animationFrames.length,
                totalGenerationCalls: continuation.totalGenerationCalls,
                repairPasses: 0,
            },
            frameContinuation: { ...continuation, state: 'checkpointed' },
            resumeAvailable: true,
        });
    }
    const plannedFrameSequence = frameSequence;

    const generateFrames = async (paramsForPass: {
        startIndex: number;
        nextFrameIndex: number;
        pass: 1 | 2;
        correction?: string;
    }): Promise<void> => {
        const { startIndex, nextFrameIndex, pass, correction } = paramsForPass;
        frameBuffers.splice(nextFrameIndex);
        frameUrls.splice(nextFrameIndex);
        animationFrames.splice(nextFrameIndex);
        continuation = {
            stage: 'generation',
            pass,
            startIndex,
            nextFrameIndex,
            totalGenerationCalls: continuation.totalGenerationCalls,
            retryCount: continuation.retryCount || 0,
            ...(correction ? { correction } : {}),
        };
        await params.update({
            animationFrames,
            frameContinuation: { ...continuation, state: 'checkpointed' },
            resumeAvailable: true,
        });
        for (let frameIndex = nextFrameIndex; frameIndex < frameCount; frameIndex += 1) {
            await ensureContinuationBudget({
                deadlineAtMs: params.deadlineAtMs,
                minimumRemainingMs: MIN_IMAGE_CALL_BUDGET_MS,
                userId: params.userId,
                jobId: params.jobId,
                continuation,
                progress: pass === 1 ? 70 : 83,
                statusMessage: `긴 작업을 안전하게 나눠 ${frameIndex + 1}/${frameCount} 프레임부터 이어갈게요.`,
            });
            const passProgressStart = pass === 1 ? 63 : 81;
            const passProgressSpan = pass === 1 ? 15 : 4;
            const progress = passProgressStart + Math.round(
                ((frameIndex - startIndex + 1) / Math.max(1, frameCount - startIndex))
                * passProgressSpan,
            );
            await assertJobActive(params.userId, params.jobId);
            const frameSeed = buildAnimationFrameSeed(sequenceSeed, frameIndex);
            const generated = await generateEmoticonAnimationFrame({
                apiKey: params.apiKey,
                preferredModel: params.imageModel,
                sourceImageUrl: params.sourceImageUrl,
                originalUserInstruction: params.originalUserInstruction,
                canonicalPoseUrl: params.poseUrl,
                alternateCanonicalPoseUrl: mirroredPoseUrl,
                identityReferenceUrl: params.identityReferenceUrl,
                additionalReferenceUrls: params.additionalReferenceUrls,
                plan: params.plan,
                direction: plannedFrameSequence.frames[frameIndex],
                frameCount,
                correction,
                seed: frameSeed,
                resourceMode: params.resourceMode,
                maxInputReferences: params.resourceMode === 'efficient' ? 3 : 4,
            });
            continuation.totalGenerationCalls += 1;
            const buffer = await normalizeGeneratedEmoticonPose(generated.buffer, {
                preserveDetachedComponents: params.plan.action.authorizedProps.length > 0
                    || params.plan.action.motionAccents.length > 0,
            });
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
                generationModel: generated.model,
                ...(generated.provider ? { generationProvider: generated.provider } : {}),
                generationRequestId: generated.requestId,
                generationSeed: frameSeed,
                ...(generated.costUsd !== undefined ? { generationCostUsd: generated.costUsd } : {}),
            });
            // Persist every expensive OpenRouter frame immediately. If the
            // function instance is interrupted, the next run can resume from
            // this exact frame instead of spending credits on earlier frames.
            await params.update({
                status: 'animating',
                progress,
                statusMessage: pass === 1
                    ? `AI 프레임 ${frameIndex + 1}/${frameCount}을 저장했어요. 다음 프레임을 이어 만들고 있어요.`
                    : `보정 프레임 ${frameIndex + 1}/${frameCount}을 저장했어요.`,
                animationFrames,
                frameGeneration: {
                    strategy: 'openrouter-image-sequence',
                    requestedFrameCount: frameCount,
                    generatedFrameCount: animationFrames.length,
                    totalGenerationCalls: continuation.totalGenerationCalls,
                    repairPasses: pass - 1,
                    ...(pass === 2 ? { repairStartIndex: startIndex } : {}),
                },
                frameContinuation: {
                    ...continuation,
                    stage: 'generation',
                    nextFrameIndex: frameIndex + 1,
                    state: 'checkpointed',
                },
                resumeAvailable: frameIndex + 1 < frameCount,
            });
            continuation.nextFrameIndex = frameIndex + 1;
        }
        continuation = {
            ...continuation,
            stage: 'review',
            nextFrameIndex: frameCount,
        };
        await params.update({
            frameContinuation: { ...continuation, state: 'checkpointed' },
            resumeAvailable: true,
        });
    };

    const generateSpriteSheetFrames = async (): Promise<boolean> => {
        const layout = resolveEmoticonSpriteSheetLayout(frameCount);
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_IMAGE_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 66,
            statusMessage: `${frameCount}개의 실제 동작 포즈를 한 장에 설계하고 있어요.`,
        });
        await assertJobActive(params.userId, params.jobId);
        const generated = await generateEmoticonSpriteSheet({
            apiKey: params.apiKey,
            preferredModel: params.imageModel,
            sourceImageUrl: params.sourceImageUrl,
            originalUserInstruction: params.originalUserInstruction,
            identityReferenceUrl: params.identityReferenceUrl,
            additionalReferenceUrls: params.additionalReferenceUrls,
            plan: params.plan,
            directions: plannedFrameSequence.frames,
            layout,
            seed: sequenceSeed,
            resourceMode: params.resourceMode,
        });
        continuation.totalGenerationCalls += 1;

        let spriteSheetBuffer: Buffer;
        try {
            spriteSheetBuffer = await sharp(generated.buffer, {
                failOn: 'error',
                limitInputPixels: 64 * 1024 * 1024,
            }).rotate().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
        } catch (error) {
            logger.warn('[Emoticon Studio] Sprite sheet could not be decoded.', {
                userId: params.userId,
                jobId: params.jobId,
                error: error instanceof Error ? error.message : String(error),
            });
            await params.update({
                spriteSheetGeneration: {
                    strategy: EMOTICON_SPRITE_SHEET_STRATEGY,
                    state: 'rejected',
                    reason: 'decode-failed',
                    requestId: generated.requestId,
                },
            });
            return false;
        }
        const sheetAsset = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: 'generated-sprite-sheet.png',
            buffer: spriteSheetBuffer,
            contentType: 'image/png',
        });
        // Checkpoint the single paid response before extraction. A renderer
        // retry can keep this source artifact even if a later local step fails.
        await params.update({
            spriteSheetGeneration: {
                strategy: EMOTICON_SPRITE_SHEET_STRATEGY,
                state: 'extracting',
                columns: layout.columns,
                rows: layout.rows,
                frameCount: layout.frameCount,
                storagePath: sheetAsset.storagePath,
                url: sheetAsset.url,
                model: generated.model,
                ...(generated.provider ? { provider: generated.provider } : {}),
                requestId: generated.requestId,
                ...(generated.costUsd !== undefined ? { costUsd: generated.costUsd } : {}),
            },
            frameGeneration: {
                strategy: EMOTICON_SPRITE_SHEET_STRATEGY,
                requestedFrameCount: frameCount,
                generatedFrameCount: 0,
                totalGenerationCalls: continuation.totalGenerationCalls,
                repairPasses: 0,
            },
        });

        try {
            const extracted = await extractEmoticonSpriteSheetFrames(spriteSheetBuffer, layout);
            const [variation, alphaInspections] = await Promise.all([
                evaluateEmoticonFrameVariation(extracted.frames, {
                    requireSilhouetteVariation: getEmoticonMotionAcceptanceRequirements(params.plan)
                        .requireLimbMotion,
                }),
                Promise.all(extracted.frames.map((frame) => inspectEmoticonAlphaIsolation(frame))),
            ]);
            if (!variation.passes || alphaInspections.some((inspection) => !inspection.passed)) {
                throw new Error(
                    !variation.passes
                        ? 'The sheet repeats one pose or changes only the camera.'
                        : 'One or more sheet cells do not have a clean isolated background.',
                );
            }
            const uploadedFrames = await Promise.all(extracted.frames.map((buffer, frameIndex) => (
                uploadBuffer({
                    userId: params.userId,
                    jobId: params.jobId,
                    fileName: `sprite-sheet-frame-${String(frameIndex + 1).padStart(3, '0')}.png`,
                    buffer,
                    contentType: 'image/png',
                })
            )));
            extracted.frames.forEach((buffer, frameIndex) => {
                const asset = uploadedFrames[frameIndex];
                frameBuffers.push(buffer);
                frameUrls.push(asset.url);
                animationFrames.push({
                    ...asset,
                    contentType: 'image/png',
                    generationModel: generated.model,
                    ...(generated.provider ? { generationProvider: generated.provider } : {}),
                    generationRequestId: generated.requestId,
                    generationSeed: sequenceSeed,
                    ...(frameIndex === 0 && generated.costUsd !== undefined
                        ? { generationCostUsd: generated.costUsd }
                        : {}),
                });
            });
            continuation = {
                ...continuation,
                stage: 'review',
                pass: 1,
                startIndex: 0,
                nextFrameIndex: frameCount,
            };
            await params.update({
                status: 'validating',
                progress: 78,
                statusMessage: `${layout.columns}×${layout.rows} 시트에서 ${frameCount}개의 실제 포즈를 분리했어요. 움직임을 확인하고 있어요.`,
                animationFrames,
                spriteSheetGeneration: {
                    strategy: EMOTICON_SPRITE_SHEET_STRATEGY,
                    state: 'extracted',
                    columns: layout.columns,
                    rows: layout.rows,
                    frameCount: layout.frameCount,
                    storagePath: sheetAsset.storagePath,
                    url: sheetAsset.url,
                    model: generated.model,
                    ...(generated.provider ? { provider: generated.provider } : {}),
                    requestId: generated.requestId,
                    ...(generated.costUsd !== undefined ? { costUsd: generated.costUsd } : {}),
                    evidence: extracted.evidence,
                    deterministicMotion: variation,
                },
                frameGeneration: {
                    strategy: EMOTICON_SPRITE_SHEET_STRATEGY,
                    requestedFrameCount: frameCount,
                    generatedFrameCount: animationFrames.length,
                    totalGenerationCalls: continuation.totalGenerationCalls,
                    repairPasses: 0,
                },
                frameContinuation: { ...continuation, state: 'checkpointed' },
                resumeAvailable: true,
            });
            return true;
        } catch (error) {
            logger.warn('[Emoticon Studio] Sprite sheet failed local quality gates.', {
                userId: params.userId,
                jobId: params.jobId,
                error: error instanceof Error ? error.message : String(error),
            });
            await params.update({
                status: 'animating',
                progress: 68,
                statusMessage: '격자 품질이 충분하지 않아 실제 포즈를 프레임별로 다시 만들고 있어요.',
                spriteSheetGeneration: {
                    strategy: EMOTICON_SPRITE_SHEET_STRATEGY,
                    state: 'rejected',
                    columns: layout.columns,
                    rows: layout.rows,
                    frameCount: layout.frameCount,
                    storagePath: sheetAsset.storagePath,
                    url: sheetAsset.url,
                    model: generated.model,
                    ...(generated.provider ? { provider: generated.provider } : {}),
                    requestId: generated.requestId,
                    reason: error instanceof Error ? error.message.slice(0, 400) : 'local-quality-gate-failed',
                },
            });
            return false;
        }
    };

    const repairSelectedFrames = async (): Promise<void> => {
        const repairFrameIndices = continuation.repairFrameIndices || [];
        let repairCursor = continuation.nextRepairCursor || 0;
        if (continuation.pass !== 2 || !repairFrameIndices.length) {
            throw new Error('The selective frame-repair checkpoint is incomplete.');
        }
        for (; repairCursor < repairFrameIndices.length; repairCursor += 1) {
            const frameIndex = repairFrameIndices[repairCursor];
            await ensureContinuationBudget({
                deadlineAtMs: params.deadlineAtMs,
                minimumRemainingMs: MIN_IMAGE_CALL_BUDGET_MS,
                userId: params.userId,
                jobId: params.jobId,
                continuation,
                progress: 82 + repairCursor,
                statusMessage: `문제가 확인된 ${frameIndex + 1}번 프레임만 이어서 보정할게요.`,
            });
            await assertJobActive(params.userId, params.jobId);
            const previousFrameIndex = (frameIndex - 1 + frameCount) % frameCount;
            const nextFrameIndex = (frameIndex + 1) % frameCount;
            const frameSeed = buildAnimationFrameSeed(sequenceSeed ^ 0x5f3759df, frameIndex);
            const generated = await generateEmoticonAnimationFrame({
                apiKey: params.apiKey,
                preferredModel: params.imageModel,
                sourceImageUrl: params.sourceImageUrl,
                originalUserInstruction: params.originalUserInstruction,
                identityReferenceUrl: params.identityReferenceUrl,
                additionalReferenceUrls: params.additionalReferenceUrls,
                previousFrameUrl: frameUrls[previousFrameIndex],
                nextFrameUrl: frameUrls[nextFrameIndex],
                plan: params.plan,
                direction: plannedFrameSequence.frames[frameIndex],
                frameCount,
                correction: continuation.correction,
                seed: frameSeed,
                maxRequestAttempts: 1,
                resourceMode: 'efficient',
                maxInputReferences: 4,
            });
            continuation.totalGenerationCalls += 1;
            const buffer = await normalizeGeneratedEmoticonPose(generated.buffer, {
                preserveDetachedComponents: params.plan.action.authorizedProps.length > 0
                    || params.plan.action.motionAccents.length > 0,
            });
            const asset = await uploadBuffer({
                userId: params.userId,
                jobId: params.jobId,
                fileName: `ai-frame-selective-repair-${String(frameIndex + 1).padStart(3, '0')}.png`,
                buffer,
                contentType: 'image/png',
            });
            frameBuffers[frameIndex] = buffer;
            frameUrls[frameIndex] = asset.url;
            animationFrames[frameIndex] = {
                ...asset,
                contentType: 'image/png',
                generationModel: generated.model,
                ...(generated.provider ? { generationProvider: generated.provider } : {}),
                generationRequestId: generated.requestId,
                generationSeed: frameSeed,
                ...(generated.costUsd !== undefined ? { generationCostUsd: generated.costUsd } : {}),
            };
            continuation = {
                ...continuation,
                nextRepairCursor: repairCursor + 1,
            };
            await params.update({
                status: 'animating',
                progress: 82 + repairCursor,
                statusMessage: `전체 재생성 없이 문제 프레임 ${repairCursor + 1}/${repairFrameIndices.length}개만 보정했어요.`,
                animationFrames,
                frameGeneration: {
                    strategy: 'openrouter-selective-frame-repair',
                    requestedFrameCount: frameCount,
                    generatedFrameCount: animationFrames.length,
                    totalGenerationCalls: continuation.totalGenerationCalls,
                    repairPasses: 1,
                    repairedFrameIndices: repairFrameIndices.slice(0, repairCursor + 1),
                },
                frameContinuation: { ...continuation, state: 'checkpointed' },
                resumeAvailable: true,
            });
        }
        continuation = {
            ...continuation,
            stage: 'review',
            nextFrameIndex: frameCount,
        };
        await params.update({
            frameContinuation: { ...continuation, state: 'checkpointed' },
            resumeAvailable: true,
        });
    };

    if (continuation.stage === 'generation') {
        if (continuation.pass === 2 && continuation.repairFrameIndices?.length) {
            await repairSelectedFrames();
        } else {
            const spriteSheetReady = continuation.pass === 1
                && continuation.nextFrameIndex === 0
                && animationFrames.length === 0
                ? await generateSpriteSheetFrames()
                : false;
            if (!spriteSheetReady) {
                await generateFrames({
                    startIndex: continuation.startIndex,
                    nextFrameIndex: continuation.nextFrameIndex,
                    pass: continuation.pass,
                    correction: continuation.correction,
                });
            }
        }
    }

    const reviewFrames = async (reviewPass: 1 | 2): Promise<EmoticonMotionReview> => {
        await params.update({
            status: 'validating',
            progress: reviewPass === 1 ? 80 : 86,
            statusMessage: `AI가 ${frameCount}개 전체 프레임의 캐릭터·배경 분리·동작·표정·루프 연결을 확인하고 있어요.`,
        });
        const hydratedFrameBuffers = await ensureFrameBuffersHydrated();
        const [localVariation, alphaInspections] = await Promise.all([
            evaluateEmoticonFrameVariation(hydratedFrameBuffers, {
                requireSilhouetteVariation: getEmoticonMotionAcceptanceRequirements(params.plan)
                    .requireLimbMotion,
            }),
            Promise.all(
                hydratedFrameBuffers.map((frameBuffer) => inspectEmoticonAlphaIsolation(frameBuffer)),
            ),
        ]);
        const localVariationProblemFrameIndices = [...new Set([
            ...localVariation.duplicateFrameIndices,
            ...localVariation.transitionOutlierIndices,
            ...(localVariation.rigidMotionOnly
                ? Array.from({ length: frameCount }, (_, index) => index)
                : []),
        ])].slice(0, 8);
        if (!localVariation.passes) {
            return {
                overall: 0,
                identity: 0,
                allReferencesConsistent: false,
                actionClarity: 0,
                styleConsistency: 0,
                limbPoseChange: 0,
                facialExpressionChange: 0,
                frameConsistency: 0,
                loopContinuity: 0,
                backgroundClean: 0,
                singleCharacter: false,
                occlusionFree: 0,
                cameraOnly: localVariation.rigidMotionOnly,
                problemFrameIndices: localVariationProblemFrameIndices,
                issues: [localVariation.rigidMotionOnly
                    ? 'The sequence changes only the position, scale, or rotation of one unchanged pose.'
                    : 'Generated animation contains repeated frames or an abrupt temporal jump.'],
                correction: localVariation.rigidMotionOnly
                    ? 'Create genuinely different limb, torso, weight, and facial poses for the chronological action; do not move or rotate one drawing.'
                    : 'Regenerate every flagged frame with a distinct but smoothly connected pose and expression; preserve identity and make the final-to-first loop transition continuous.',
            };
        }
        const alphaProblemFrameIndices = alphaInspections.flatMap((inspection, index) => (
            inspection.passed ? [] : [index]
        ));
        if (alphaProblemFrameIndices.length) {
            return {
                overall: 0,
                identity: 0,
                allReferencesConsistent: false,
                actionClarity: 0,
                styleConsistency: 0,
                limbPoseChange: 0,
                facialExpressionChange: 0,
                frameConsistency: 0,
                loopContinuity: 0,
                backgroundClean: 0,
                singleCharacter: false,
                occlusionFree: 0,
                cameraOnly: false,
                problemFrameIndices: alphaProblemFrameIndices.slice(0, 8),
                issues: ['One or more frames failed the local transparent-background boundary inspection.'],
                correction: 'Regenerate only the flagged frames with a fully transparent background, clean alpha edges, no border contact, and no visible background residue.',
            };
        }
        await assertJobActive(params.userId, params.jobId);
        const review = await reviewImageFrameSequence({
            apiKey: params.apiKey,
            model: params.model,
            fallbackModels: params.fallbackModels,
            reasoningEffort: params.reasoningEffort,
            sourceImageUrl: params.sourceImageUrl,
            originalUserInstruction: params.originalUserInstruction,
            additionalReferenceUrls: params.resourceMode === 'efficient'
                ? efficientIdentityReviewReferences(
                    params.identityReferenceUrl,
                    params.additionalReferenceUrls,
                )
                : params.additionalReferenceUrls,
            frameUrls,
            plan: params.plan,
        });
        return applyMotionAlphaIsolationEvidence(review, alphaInspections);
    };

    let review = params.motionReview;
    if (continuation.stage === 'review') {
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_REVIEW_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: continuation.pass === 1 ? 80 : 86,
            statusMessage: '긴 작업을 안전하게 나눠 전체 프레임 검사를 이어갈게요.',
        });
        review = await reviewFrames(continuation.pass);
    }
    if (!review) {
        throw new Error('The verified motion review required for rendering is unavailable.');
    }
    const validProblemIndices = [...new Set(review.problemFrameIndices)]
        .filter((index) => index >= 0 && index < frameCount);
    // A bounded repair is useful only for one or two isolated defects. Trying
    // two frames when the reviewer flags a sequence-wide/camera-only failure
    // spends three more AI calls and still cannot make the result acceptable.
    const selectiveRepairIndices = (
        validProblemIndices.length > 0
        && validProblemIndices.length <= 2
        && !review.cameraOnly
    ) ? validProblemIndices : [];
    const firstPassUsesSpriteSheet = animationFrames.length === frameCount
        && animationFrames.every((frame) => frame.storagePath.includes('sprite-sheet-frame-'));
    const shouldAutoRepair = continuation.pass === 1 && (
        params.resourceMode === 'premium'
            ? !meetsEmoticonPremiumMotionTarget(review)
            : !isVerifiedBodyMotion(review, params.plan)
                && (firstPassUsesSpriteSheet || selectiveRepairIndices.length > 0)
    );
    if (shouldAutoRepair) {
        const firstPassSnapshot = {
            review,
            frameBuffers: [...await ensureFrameBuffersHydrated()],
            frameUrls: [...frameUrls],
            animationFrames: [...animationFrames],
        };
        const repairStartIndex = validProblemIndices.length
            ? Math.min(...validProblemIndices)
            : 0;
        const correction = buildPremiumMotionCorrection(review);
        if (params.resourceMode !== 'premium' && !firstPassUsesSpriteSheet) {
            continuation = {
                stage: 'generation',
                pass: 2,
                startIndex: selectiveRepairIndices[0],
                nextFrameIndex: frameCount,
                totalGenerationCalls: continuation.totalGenerationCalls,
                retryCount: continuation.retryCount || 0,
                correction,
                repairFrameIndices: selectiveRepairIndices,
                nextRepairCursor: 0,
            };
            await params.update({
                status: 'animating',
                progress: 81,
                statusMessage: `전체를 다시 만들지 않고 문제 프레임 ${selectiveRepairIndices.length}개만 보정할게요.`,
                motionReview: review,
                animationFrames,
                frameContinuation: { ...continuation, state: 'checkpointed' },
                resumeAvailable: true,
            });
            await repairSelectedFrames();
        } else {
            // A sequence-wide defect in a one-call sheet cannot be repaired by
            // replacing one cell without losing continuity. Fall back to real
            // per-frame generation, never a rigid transform of one pose.
            const fullRepairStartIndex = firstPassUsesSpriteSheet ? 0 : repairStartIndex;
            frameBuffers.splice(fullRepairStartIndex);
            frameUrls.splice(fullRepairStartIndex);
            animationFrames.splice(fullRepairStartIndex);
            continuation = {
                stage: 'generation',
                pass: 2,
                startIndex: fullRepairStartIndex,
                nextFrameIndex: fullRepairStartIndex,
                totalGenerationCalls: continuation.totalGenerationCalls,
                retryCount: continuation.retryCount || 0,
                correction,
            };
            await params.update({
                status: 'animating',
                progress: 81,
                statusMessage: `${EMOTICON_PREMIUM_MOTION_TARGET}점 목표로 ${repairStartIndex + 1}번 프레임부터 정밀 보정할게요.`,
                motionReview: review,
                animationFrames,
                frameContinuation: { ...continuation, state: 'checkpointed' },
                resumeAvailable: true,
            });
            await generateFrames({
                startIndex: fullRepairStartIndex,
                nextFrameIndex: fullRepairStartIndex,
                pass: 2,
                correction,
            });
            await params.update({
                frameGeneration: {
                    strategy: 'openrouter-image-sequence',
                    requestedFrameCount: frameCount,
                    generatedFrameCount: frameUrls.length,
                    totalGenerationCalls: continuation.totalGenerationCalls,
                    repairPasses: 1,
                    repairStartIndex: fullRepairStartIndex,
                    ...(firstPassUsesSpriteSheet
                        ? { fallbackFrom: EMOTICON_SPRITE_SHEET_STRATEGY }
                        : {}),
                },
                animationFrames,
            });
        }
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_REVIEW_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 86,
            statusMessage: '긴 작업을 안전하게 나눠 보정 프레임 검사를 이어갈게요.',
        });
        const repairedReview = await reviewFrames(2);
        const firstPassVerified = isVerifiedBodyMotion(firstPassSnapshot.review, params.plan);
        const repairedPassVerified = isVerifiedBodyMotion(repairedReview, params.plan);
        const shouldKeepFirstPass = (
            firstPassVerified && !repairedPassVerified
        ) || (
            firstPassVerified === repairedPassVerified
            && motionReviewScore(repairedReview) < motionReviewScore(firstPassSnapshot.review)
        );
        if (shouldKeepFirstPass) {
            frameBuffers.splice(0, frameBuffers.length, ...firstPassSnapshot.frameBuffers);
            frameUrls.splice(0, frameUrls.length, ...firstPassSnapshot.frameUrls);
            animationFrames.splice(0, animationFrames.length, ...firstPassSnapshot.animationFrames);
            review = firstPassSnapshot.review;
            await params.update({
                animationFrames,
                motionReview: review,
                frameGeneration: {
                    strategy: firstPassUsesSpriteSheet
                        ? EMOTICON_SPRITE_SHEET_STRATEGY
                        : params.resourceMode !== 'premium'
                            ? 'openrouter-selective-frame-repair'
                            : 'openrouter-image-sequence',
                    requestedFrameCount: frameCount,
                    generatedFrameCount: frameUrls.length,
                    totalGenerationCalls: continuation.totalGenerationCalls,
                    repairPasses: 1,
                    ...(params.resourceMode !== 'premium' && !firstPassUsesSpriteSheet
                        ? { repairedFrameIndices: selectiveRepairIndices }
                        : { repairStartIndex }),
                    selectedPass: 1,
                    repairDiscardedBecauseWorse: true,
                },
            });
        } else {
            review = repairedReview;
        }
    }
    if (!isVerifiedBodyMotion(review, params.plan)) {
        const currentUsesSpriteSheet = animationFrames.length === frameCount
            && animationFrames.every((frame) => frame.storagePath.includes('sprite-sheet-frame-'));
        await params.update({
            motionReview: review,
            frameGeneration: {
                strategy: currentUsesSpriteSheet
                    ? EMOTICON_SPRITE_SHEET_STRATEGY
                    : continuation.pass === 2 && params.resourceMode !== 'premium'
                        ? 'openrouter-selective-frame-repair'
                        : 'openrouter-image-sequence',
                requestedFrameCount: frameCount,
                generatedFrameCount: frameUrls.length,
                totalGenerationCalls: continuation.totalGenerationCalls,
                repairPasses: continuation.pass - 1,
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
    continuation = {
        ...continuation,
        stage: 'render',
        nextFrameIndex: frameCount,
    };
    await params.update({
        motionReview: review,
        premiumQualityTarget: EMOTICON_PREMIUM_MOTION_TARGET,
        premiumQualityScore: motionReviewScore(review),
        premiumQualityAchieved: meetsEmoticonPremiumMotionTarget(review),
        frameContinuation: { ...continuation, state: 'checkpointed' },
        resumeAvailable: true,
        status: 'rendering',
        progress: 88,
        statusMessage: '검증을 통과한 AI 프레임을 선택한 파일 형식으로 연결하고 있어요.',
    });
    await ensureContinuationBudget({
        deadlineAtMs: params.deadlineAtMs,
        minimumRemainingMs: MIN_RENDER_BUDGET_MS,
        userId: params.userId,
        jobId: params.jobId,
        continuation,
        progress: 88,
        statusMessage: '긴 작업을 안전하게 나눠 최종 파일 조립을 이어갈게요.',
    });
    let compositedFrames: EmoticonAnimationFrame[] = [];
    const files = await renderImageSequenceEmoticon({
            frameBuffers: await ensureFrameBuffersHydrated(),
            plan: params.plan,
            formats: params.formats,
            outputProfile: params.outputProfile,
            onComposedFrames: async (frames) => {
                compositedFrames = await uploadCompositedFrameSequence({
                    userId: params.userId,
                    jobId: params.jobId,
                    frames,
                    onProgress: async (uploadedFrames) => params.update({
                        compositedFrames: uploadedFrames,
                        compositedFrameCheckpointCount: uploadedFrames.length,
                        updatedAt: FieldValue.serverTimestamp(),
                    }),
                });
            },
        });
    return {
        files,
        motionFallbackReason: null,
        motionQuality: toMotionQuality(review),
        animationFrames,
        compositedFrames,
    };
}

async function renderVerifiedDynamicOutputs(params: {
    apiKey: string;
    model: string;
    imageModel?: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    sourceImageUrl: string;
    originalUserInstruction: string;
    identityReferenceUrl?: string;
    additionalReferenceUrls?: string[];
    userId: string;
    jobId: string;
    plan: EmoticonPlan;
    resourceMode: EmoticonResourceMode;
    outputProfile: EmoticonOutputProfile;
    poseBuffer: Buffer;
    poseStoragePath: string;
    poseUrl: string;
    mirroredPoseUrl?: string;
    formats: Parameters<typeof renderImageEmoticon>[0]['formats'];
    update: (data: Record<string, unknown>) => Promise<void>;
    deadlineAtMs?: number;
}): Promise<{
    files: RenderedEmoticonFile[];
    motionFallbackReason: string | null;
    motionQuality: EmoticonQuality | null;
    animationFrames: EmoticonAnimationFrame[];
    compositedFrames: EmoticonAnimationFrame[];
}> {
    return renderAiFrameSequenceOutputs(params);
}

async function renderOutputs(params: {
    apiKey: string;
    model: string;
    imageModel?: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    sourceImageUrl: string;
    originalUserInstruction: string;
    identityReferenceUrl?: string;
    additionalReferenceUrls?: string[];
    userId: string;
    jobId: string;
    plan: EmoticonPlan;
    resourceMode: EmoticonResourceMode;
    outputProfile: EmoticonOutputProfile;
    poseBuffer: Buffer;
    poseStoragePath: string;
    poseUrl: string;
    mirroredPoseUrl?: string;
    formats: Parameters<typeof renderImageEmoticon>[0]['formats'];
    update: (data: Record<string, unknown>) => Promise<void>;
    deadlineAtMs?: number;
}): Promise<{
    files: RenderedEmoticonFile[];
    motionFallbackReason: string | null;
    motionQuality: EmoticonQuality | null;
    animationFrames?: EmoticonAnimationFrame[];
    compositedFrames?: EmoticonAnimationFrame[];
}> {
    if (isDynamicRender(params.plan)) {
        return renderVerifiedDynamicOutputs(params);
    }

    return {
        files: await renderImageEmoticon({
            imageBuffer: params.poseBuffer,
            plan: params.plan,
            formats: params.formats,
            outputProfile: params.outputProfile,
        }),
        motionFallbackReason: null,
        motionQuality: null,
    };
}

async function renderEfficientCompositeJob(params: {
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
    preparedSource: { asset: UploadedAsset; fingerprint: string };
    update: (data: Record<string, unknown>) => Promise<void>;
}): Promise<void> {
    if (params.request.mode !== 'generate') {
        throw new Error('The local composite path only supports generation jobs.');
    }
    const outputProfile = resolveEmoticonOutputProfile(params.request.outputProfile);
    const plan = buildEfficientCompositePlan({
        request: params.request,
        outputProfile,
    });
    await params.update({
        status: 'rendering',
        progress: 22,
        statusMessage: '원본 캐릭터를 보존하면서 모션과 말풍선을 빠르게 합성하고 있어요.',
        error: null,
        sourceImageUrl: params.preparedSource.asset.url,
        sourceCanonicalStoragePath: params.preparedSource.asset.storagePath,
        sourceFingerprint: params.preparedSource.fingerprint,
        plan,
        outputProfile,
        motionFallbackReason: EFFICIENT_LOCAL_COMPOSITE_VERSION,
        frameContinuation: { stage: 'static-render', retryCount: 0, state: 'checkpointed' },
        resumeAvailable: false,
    });
    await assertJobActive(params.userId, params.jobId);

    const sourceBuffer = await downloadStoredPose(params.preparedSource.asset.storagePath);
    const keyPose = await uploadBuffer({
        userId: params.userId,
        jobId: params.jobId,
        fileName: 'efficient-key-pose.png',
        buffer: sourceBuffer,
        contentType: 'image/png',
        preserveExistingDownloadToken: true,
    });
    await params.update({
        progress: 45,
        statusMessage: `${plan.action.frameCount}개 프레임을 조립하고 출력 파일을 검사하고 있어요.`,
        keyPoseUrl: keyPose.url,
        keyPoseStoragePath: keyPose.storagePath,
    });
    await assertJobActive(params.userId, params.jobId);

    let compositedFrames: EmoticonAnimationFrame[] = [];
    const safeEditRecipe = params.request.renderOverrides?.editRecipe || {
        ...createIdentityEmoticonImageEditRecipe(),
        scale: 0.82,
        transparentPadding: 0.1,
    };
    const files = await renderImageEmoticon({
        imageBuffer: sourceBuffer,
        plan,
        formats: params.request.formats,
        outputProfile,
        editRecipe: safeEditRecipe,
        onComposedFrames: async (frames) => {
            compositedFrames = await uploadCompositedFrameSequence({
                userId: params.userId,
                jobId: params.jobId,
                frames,
                onProgress: async (uploadedFrames) => params.update({
                    compositedFrames: uploadedFrames,
                    compositedFrameCheckpointCount: uploadedFrames.length,
                    progress: 78,
                    updatedAt: FieldValue.serverTimestamp(),
                }),
            });
        },
    });
    assertRenderedFilesPassedInspection(files);
    await assertJobActive(params.userId, params.jobId);
    const outputs = await uploadRenderedFiles({
        userId: params.userId,
        jobId: params.jobId,
        files,
    });
    await params.update({
        status: 'completed',
        progress: 100,
        statusMessage: '빠른 합성이 완료됐어요. 프레임을 확인하거나 바로 내려받을 수 있어요.',
        keyPoseUrl: keyPose.url,
        keyPoseStoragePath: keyPose.storagePath,
        compositedFrames,
        plan,
        outputs,
        outputProfile,
        specReport: buildSpecReport({ plan, outputProfile, files }),
        analysisReused: true,
        motionFallbackReason: EFFICIENT_LOCAL_COMPOSITE_VERSION,
        openRouterActualCostUsd: 0,
        openRouterUsageRequestCount: 0,
        resumeAvailable: false,
        'frameContinuation.state': 'completed',
        completedAt: FieldValue.serverTimestamp(),
    });
}

function buildManualImportPlan(request: EmoticonJobRequest): {
    plan: EmoticonPlan;
    frameDurationsMs?: number[];
} {
    if (!request.manualImport || !request.outputProfile) {
        throw new Error('The manual frame import request is incomplete.');
    }
    const frameCount = request.manualImport.frames.length;
    const isStatic = request.outputProfile.type === 'static';
    const timing = request.manualImport.timing;
    const frameDurationsMs = timing.mode === 'per_frame'
        ? timing.frameDurationsMs
        : undefined;
    const durationMs = isStatic
        ? 0
        : frameDurationsMs
            ? frameDurationsMs.reduce((sum, duration) => sum + duration, 0)
            : Math.round((frameCount / (timing.mode === 'fps' ? timing.fps : 1)) * 1000);
    const fps = isStatic
        ? 1
        : frameDurationsMs
            ? Number(((frameCount * 1000) / durationMs).toFixed(3))
            : timing.mode === 'fps' ? timing.fps : 1;
    const bubble = request.renderOverrides?.bubble || request.bubbleOverride || {
        text: '',
        style: 'none' as const,
        position: 'top' as const,
        entrance: 'none' as const,
        font: 'clean' as const,
        ...EMOTICON_BUBBLE_APPEARANCE_DEFAULTS,
        timeline: { mode: 'full' as const, startFrame: 0, endFrame: null, cues: [] },
    };
    return {
        plan: {
            directorSummary: 'User-provided frames are assembled without an AI generation or review call.',
            characterProfile: {
                summary: 'Manual frame import; identity is not AI-verified.',
                immutableTraits: ['Preserve only the pixels supplied by the user.'],
                palette: [],
                styleRules: ['Do not synthesize or replace character details.'],
                negativeRules: ['Do not claim AI identity or motion verification.'],
            },
            action: {
                title: isStatic ? '수동 정지 이미지' : '수동 프레임 애니메이션',
                emotion: '사용자 지정',
                action: '사용자가 준비한 정지 컷 순서대로 재생',
                intensity: 'normal',
                motionType: isStatic ? 'bob' : 'dynamic',
                renderMode: isStatic ? 'stable' : 'dynamic',
                durationMs,
                frameCount,
                fps,
                loopDescription: isStatic ? 'Single static frame.' : 'Loop the ordered user-provided frames.',
                imagePrompt: 'No image-generation prompt is used for a manual frame import.',
                videoPrompt: 'No video-generation prompt is used for a manual frame import.',
                negativePrompt: 'No AI generation or semantic validation is performed.',
                authorizedProps: [],
                motionAccents: [],
            },
            bubble,
            bubbleLayers: request.renderOverrides?.bubbleLayers || request.bubbleLayersOverride || [],
            suggestedPresets: [],
        },
        ...(frameDurationsMs ? { frameDurationsMs } : {}),
    };
}

async function renderImportedFramesJob(params: {
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
    update: (data: Record<string, unknown>) => Promise<void>;
}): Promise<void> {
    if (
        params.request.mode !== 'import_frames'
        || !params.request.manualImport
        || !params.request.projectId
        || !params.request.projectItemId
        || !params.request.outputProfile
    ) {
        throw new Error('The manual frame import request is incomplete.');
    }
    await params.update({
        status: 'validating',
        progress: 18,
        statusMessage: '선택한 정지 컷의 소유권과 파일 내용을 확인하고 있어요.',
        error: null,
    });
    await assertJobActive(params.userId, params.jobId);
    const sourceFrames = await downloadVerifiedEmoticonImportFrames({
        uid: params.userId,
        projectId: params.request.projectId,
        projectItemId: params.request.projectItemId,
        frames: params.request.manualImport.frames,
    });
    await assertJobActive(params.userId, params.jobId);
    const animationFrames = await Promise.all(sourceFrames.map(async (buffer, index) => {
        const asset = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: `imported-frame-${String(index + 1).padStart(3, '0')}.png`,
            buffer,
            contentType: 'image/png',
        });
        return { ...asset, contentType: 'image/png' as const };
    }));
    const { plan, frameDurationsMs } = buildManualImportPlan(params.request);
    const outputProfile = resolveEmoticonOutputProfile(params.request.outputProfile);
    await params.update({
        status: 'rendering',
        progress: 55,
        statusMessage: '프레임 순서와 시간을 적용해 선택한 파일 형식으로 합치고 있어요.',
        keyPoseUrl: animationFrames[0].url,
        keyPoseStoragePath: animationFrames[0].storagePath,
        animationFrames,
        outputProfile,
    });
    await assertJobActive(params.userId, params.jobId);
    let compositedFrames: EmoticonAnimationFrame[] = [];
    const files = await renderImageSequenceEmoticon({
        frameBuffers: sourceFrames,
        plan,
        formats: params.request.formats,
        outputProfile,
        editRecipe: params.request.renderOverrides?.editRecipe,
        ...(frameDurationsMs ? { frameDurationsMs } : {}),
        onComposedFrames: async (frames) => {
            compositedFrames = await uploadCompositedFrameSequence({
                userId: params.userId,
                jobId: params.jobId,
                frames,
                onProgress: async (uploadedFrames) => params.update({
                    compositedFrames: uploadedFrames,
                    compositedFrameCheckpointCount: uploadedFrames.length,
                    updatedAt: FieldValue.serverTimestamp(),
                }),
            });
        },
    });
    assertRenderedFilesPassedInspection(files);
    await assertJobActive(params.userId, params.jobId);
    const outputs = await uploadRenderedFiles({
        userId: params.userId,
        jobId: params.jobId,
        files,
    });
    // Fixed-FPS timing is represented exactly by plan.action.fps. Expanding it
    // into rounded millisecond delays would corrupt 26–30 FPS metadata and can
    // produce values below the per-frame timing contract's 40ms minimum.
    const reportFrameDurations = frameDurationsMs || [];
    await params.update({
        status: 'completed',
        progress: 100,
        statusMessage: '사용자 프레임 합성이 완료됐어요. 기술 규격 검사 결과를 확인해 주세요.',
        keyPoseUrl: animationFrames[0].url,
        keyPoseStoragePath: animationFrames[0].storagePath,
        animationFrames,
        compositedFrames,
        plan,
        outputs,
        outputProfile,
        specReport: buildSpecReport({ plan, outputProfile, files }),
        manualImportReport: {
            schemaVersion: 1,
            technicalOnly: true,
            aiCalls: 0,
            identityVerified: false,
            motionVerified: false,
            sourceFrameCount: sourceFrames.length,
            timingMode: params.request.manualImport.timing.mode,
            frameDurationsMs: reportFrameDurations,
        },
        analysisReused: false,
        motionFallbackReason: null,
        completedAt: FieldValue.serverTimestamp(),
    });
}

function storedOutputsPassedTechnicalInspection(parent: Record<string, unknown>): boolean {
    const specReport = parent.specReport && typeof parent.specReport === 'object'
        ? parent.specReport as Record<string, unknown>
        : {};
    const storedOutputs = parent.outputs && typeof parent.outputs === 'object'
        ? parent.outputs as Record<string, unknown>
        : {};
    const storedFormats = Array.isArray(parent.formats)
        ? parent.formats.filter((format): format is string => typeof format === 'string')
        : [];
    return specReport.technicalPass === true
        && specReport.allOutputsPass === true
        && storedFormats.length > 0
        && storedFormats.every((format) => {
            const output = storedOutputs[format];
            if (!output || typeof output !== 'object') return false;
            const inspection = (output as Record<string, unknown>).inspection;
            return Boolean(
                inspection
                && typeof inspection === 'object'
                && (inspection as Record<string, unknown>).format === format
                && (inspection as Record<string, unknown>).passed === true,
            );
        });
}

function verifyReusableManualParent(params: {
    parent: Record<string, unknown>;
    userId: string;
    parentJobId: string;
}): {
    plan: EmoticonPlan;
    animationFrames: EmoticonAnimationFrame[];
    frameDurationsMs?: number[];
} | null {
    const report = emoticonManualFrameImportReportSchema.safeParse(params.parent.manualImportReport);
    if (!report.success) return null;
    const plan = emoticonManualStoredPlanSchema.safeParse(params.parent.plan);
    const frames = emoticonAnimationFrameSchema.array().min(1).max(24).safeParse(params.parent.animationFrames);
    const outputProfile = emoticonOutputProfileSchema.safeParse(params.parent.outputProfile);
    const specReport = params.parent.specReport && typeof params.parent.specReport === 'object'
        ? params.parent.specReport as Record<string, unknown>
        : {};
    if (
        params.parent.userId !== params.userId
        || params.parent.status !== 'completed'
        || params.parent.deletionLocked === true
        || !plan.success
        || !frames.success
        || !outputProfile.success
        || !storedOutputsPassedTechnicalInspection(params.parent)
    ) {
        throw new Error('The manual parent frames are not eligible for safe technical reuse.');
    }
    const frameCount = plan.data.action.frameCount;
    const isStatic = outputProfile.data.type === 'static';
    const expectedPrefix = `users/${params.userId}/emoticon-studio/jobs/${params.parentJobId}/`;
    const timingCountValid = report.data.timingMode === 'per_frame'
        ? !isStatic && report.data.frameDurationsMs.length === frameCount
        : report.data.frameDurationsMs.length === 0;
    const perFrameDuration = report.data.timingMode === 'per_frame'
        ? report.data.frameDurationsMs.reduce((sum, duration) => sum + duration, 0)
        : plan.data.action.durationMs;
    if (
        frames.data.length !== frameCount
        || report.data.sourceFrameCount !== frameCount
        || !timingCountValid
        || (isStatic && (frameCount !== 1 || plan.data.action.renderMode === 'dynamic'))
        || (!isStatic && (frameCount < 2 || plan.data.action.renderMode !== 'dynamic'))
        || perFrameDuration !== plan.data.action.durationMs
        || specReport.frameCount !== frameCount
        || specReport.width !== outputProfile.data.width
        || specReport.height !== outputProfile.data.height
        || frames.data.some((frame) => !frame.storagePath.startsWith(expectedPrefix))
    ) {
        throw new Error('The manual parent frame count, timing, or ownership evidence is inconsistent.');
    }
    return {
        plan: plan.data,
        animationFrames: frames.data,
        ...(report.data.timingMode === 'per_frame'
            ? { frameDurationsMs: report.data.frameDurationsMs }
            : {}),
    };
}

function applyRerenderTiming(plan: EmoticonPlan, frameDurationsMs?: number[]): EmoticonPlan {
    if (!frameDurationsMs || frameDurationsMs.length !== plan.action.frameCount) return plan;
    const durationMs = frameDurationsMs.reduce((sum, duration) => sum + duration, 0);
    return {
        ...plan,
        action: {
            ...plan.action,
            durationMs,
            fps: Math.max(1, Math.min(30, Math.round((plan.action.frameCount * 1000) / durationMs))),
        },
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
    if (parent.deletionLocked === true) {
        throw new Error('The parent job is being deleted and cannot be reused.');
    }
    const parentReferences = emoticonReferenceImageSchema.array().max(3).safeParse(parent.referenceImages || []);
    const parentReferencePaths = parentReferences.success
        ? parentReferences.data.map((reference) => reference.sourceStoragePath).sort()
        : [];
    const requestReferencePaths = params.request.referenceImages
        .map((reference) => reference.sourceStoragePath)
        .sort();
    if (
        parent.userId !== params.userId
        || parent.sourceStoragePath !== params.request.sourceStoragePath
        || !parentReferences.success
        || JSON.stringify(parentReferencePaths) !== JSON.stringify(requestReferencePaths)
    ) {
        throw new Error('The rerender source and character references do not match the verified parent identity.');
    }
    const isEfficientLocalParent = parent.status === 'completed'
        && parent.userId === params.userId
        && parent.resourceMode === 'efficient'
        && parent.motionFallbackReason === EFFICIENT_LOCAL_COMPOSITE_VERSION
        && storedOutputsPassedTechnicalInspection(parent);
    const editRecipe = params.request.renderOverrides?.editRecipe || (isEfficientLocalParent
        ? {
            ...createIdentityEmoticonImageEditRecipe(),
            scale: 0.82,
            transparentPadding: 0.1,
        }
        : undefined);
    if (parent.status !== 'completed' && parent.status !== 'failed' && !isStaleWorkingJob(parent)) {
        throw new Error('Only completed or recoverable failed jobs can be rerendered.');
    }
    if (editRecipe) {
        if (
            parent.userId !== params.userId
            || parent.status !== 'completed'
            || !storedOutputsPassedTechnicalInspection(parent)
        ) {
            throw new Error('Only completed frames that passed encoded output inspections can be image-edited.');
        }
    }
    const reusableManualParent = verifyReusableManualParent({
        parent,
        userId: params.userId,
        parentJobId: params.request.parentJobId,
    });
    const parentOutputProfile = emoticonOutputProfileSchema.safeParse(parent.outputProfile);
    const outputProfile = resolveEmoticonOutputProfile(
        params.request.renderOverrides?.outputProfile
        || params.request.outputProfile
        || (parentOutputProfile.success ? parentOutputProfile.data : undefined),
    );
    if (reusableManualParent) {
        const frameDurationsMs = params.request.renderOverrides?.frameDurationsMs
            || reusableManualParent.frameDurationsMs;
        const plan = applyRerenderTiming({
            ...reusableManualParent.plan,
            bubble: params.request.renderOverrides?.bubble || reusableManualParent.plan.bubble,
            bubbleLayers: params.request.renderOverrides?.bubbleLayers || reusableManualParent.plan.bubbleLayers,
        }, frameDurationsMs);
        await params.update({
            status: 'rendering',
            progress: 35,
            statusMessage: editRecipe
                ? '사용자가 올린 원본 프레임에 이미지 편집값을 적용하고 있어요.'
                : '사용자가 올린 원본 프레임에 말풍선과 출력 설정을 다시 적용하고 있어요.',
            error: null,
            analysisReused: true,
        });
        const frameBuffers = await downloadStoredAnimationFrames({
            userId: params.userId,
            parentJobId: params.request.parentJobId,
            frames: reusableManualParent.animationFrames,
        });
        const animationFrames = await Promise.all(frameBuffers.map(async (buffer, index) => {
            const asset = await uploadBuffer({
                userId: params.userId,
                jobId: params.jobId,
                fileName: `reused-manual-frame-${String(index + 1).padStart(3, '0')}.png`,
                buffer,
                contentType: 'image/png',
            });
            const original = reusableManualParent.animationFrames[index];
            return {
                ...asset,
                contentType: 'image/png' as const,
                ...(original.generationModel ? { generationModel: original.generationModel } : {}),
                ...(original.generationProvider ? { generationProvider: original.generationProvider } : {}),
                ...(original.generationRequestId ? { generationRequestId: original.generationRequestId } : {}),
                ...(original.generationSeed !== undefined ? { generationSeed: original.generationSeed } : {}),
                ...(original.generationCostUsd !== undefined ? { generationCostUsd: original.generationCostUsd } : {}),
            };
        }));
        await params.update({
            status: 'rendering',
            progress: 55,
            statusMessage: '프레임 순서와 원래 재생 시간을 유지해 파일을 다시 만들고 있어요.',
            plan,
            keyPoseUrl: animationFrames[0].url,
            keyPoseStoragePath: animationFrames[0].storagePath,
            animationFrames,
        });
        let compositedFrames: EmoticonAnimationFrame[] = [];
        const files = await renderImageSequenceEmoticon({
            frameBuffers,
            plan,
            formats: params.request.formats,
            outputProfile,
            editRecipe,
            ...(frameDurationsMs ? { frameDurationsMs } : {}),
            ...(params.request.renderOverrides?.frameTransitions
                ? { frameTransitions: params.request.renderOverrides.frameTransitions }
                : {}),
            onComposedFrames: async (frames) => {
                compositedFrames = await uploadCompositedFrameSequence({
                    userId: params.userId,
                    jobId: params.jobId,
                    frames,
                    onProgress: async (uploadedFrames) => params.update({
                        compositedFrames: uploadedFrames,
                        compositedFrameCheckpointCount: uploadedFrames.length,
                        updatedAt: FieldValue.serverTimestamp(),
                    }),
                });
            },
        });
        assertRenderedFilesPassedInspection(files);
        const outputs = await uploadRenderedFiles({
            userId: params.userId,
            jobId: params.jobId,
            files,
        });
        const parentReport = emoticonManualFrameImportReportSchema.parse(parent.manualImportReport);
        await params.update({
            status: 'completed',
            progress: 100,
            statusMessage: editRecipe ? '수동 프레임 편집본이 완성됐어요.' : '수동 프레임 말풍선 수정본이 완성됐어요.',
            plan,
            sourceImageUrl: parent.sourceImageUrl,
            sourceStoragePath: parent.sourceStoragePath,
            keyPoseUrl: animationFrames[0].url,
            keyPoseStoragePath: animationFrames[0].storagePath,
            animationFrames,
            compositedFrames,
            ...(editRecipe ? { editRecipe } : {}),
            outputs,
            outputProfile,
            specReport: buildSpecReport({ plan, outputProfile, files }),
            manualImportReport: frameDurationsMs ? {
                ...parentReport,
                timingMode: 'per_frame',
                frameDurationsMs,
            } : parentReport,
            analysisReused: true,
            motionFallbackReason: null,
            completedAt: FieldValue.serverTimestamp(),
        });
        return;
    }
    const parentPlan = emoticonStoredPlanSchema.safeParse(parent.plan);
    if (!parentPlan.success) throw new Error('The original animation plan is unavailable.');
    const motionOverride = params.request.renderOverrides?.motion || params.request.motionOverride;
    const overriddenParentPlan = normalizeEmoticonPlanForOutputProfile(
        applyEmoticonMotionOverride(parentPlan.data, motionOverride),
        outputProfile,
    );
    const isDynamicParent = outputProfile.type === 'animated'
        && parentPlan.data.action.renderMode === 'dynamic';
    if (isDynamicParent && overriddenParentPlan.action.frameCount !== parentPlan.data.action.frameCount) {
        throw new Error('A verified dynamic rerender cannot change its generated frame count.');
    }
    const verifiedDynamicParent = isDynamicParent
        ? verifyReusableDynamicParent({
            parent,
            expectedFrameStoragePrefix: `users/${params.userId}/emoticon-studio/jobs/${params.request.parentJobId}/`,
        })
        : null;
    if (verifiedDynamicParent && !verifiedDynamicParent.success) {
        throw new Error(
            `The parent animation is not eligible for safe frame reuse (${verifiedDynamicParent.reason}). `
            + 'Create a new AI generation instead of rerendering this legacy or unverified animation.',
        );
    }
    if (!isDynamicParent && !isEfficientLocalParent) {
        const parentPoseQuality = emoticonQualitySchema.safeParse(parent.quality);
        const renderFailureRecovery = emoticonRenderFailureRecoverySchema.safeParse(parent.renderFailureRecovery);
        const reusablePose = parentPoseQuality.success && meetsEmoticonPoseAcceptance(parentPoseQuality.data);
        if (!reusablePose && !renderFailureRecovery.success) {
            throw new Error(
                'The parent key pose did not pass identity and isolation review. '
                + 'Create a new AI generation instead of rerendering the rejected pose.',
            );
        }
    }
    const storedAnimationFrames = verifiedDynamicParent?.success
        ? verifiedDynamicParent.animationFrames
        : null;
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
        statusMessage: editRecipe
            ? '검증된 원본 프레임에 이미지 편집값을 적용하고 있어요.'
            : '기존 캐릭터는 그대로 두고 말풍선과 프레임만 다시 조립하고 있어요.',
        error: null,
        analysisReused: true,
    });
    if (isDynamicParent && storedAnimationFrames && verifiedDynamicParent?.success) {
        const frameDurationsMs = params.request.renderOverrides?.frameDurationsMs;
        const plan = applyRerenderTiming({
            ...overriddenParentPlan,
            bubble: params.request.renderOverrides?.bubble || parentPlan.data.bubble,
            bubbleLayers: params.request.renderOverrides?.bubbleLayers || parentPlan.data.bubbleLayers,
        }, frameDurationsMs);
        const frameBuffers = await downloadStoredAnimationFrames({
            userId: params.userId,
            parentJobId: params.request.parentJobId,
            frames: storedAnimationFrames,
        });
        const animationFrames = await Promise.all(frameBuffers.map(async (buffer, index) => {
            const asset = await uploadBuffer({
                userId: params.userId,
                jobId: params.jobId,
                fileName: `reused-ai-frame-${String(index + 1).padStart(3, '0')}.png`,
                buffer,
                contentType: 'image/png',
            });
            const original = storedAnimationFrames[index];
            return {
                ...asset,
                contentType: 'image/png' as const,
                ...(original.generationModel ? { generationModel: original.generationModel } : {}),
                ...(original.generationProvider ? { generationProvider: original.generationProvider } : {}),
                ...(original.generationRequestId ? { generationRequestId: original.generationRequestId } : {}),
                ...(original.generationSeed !== undefined ? { generationSeed: original.generationSeed } : {}),
                ...(original.generationCostUsd !== undefined ? { generationCostUsd: original.generationCostUsd } : {}),
            };
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
        let compositedFrames: EmoticonAnimationFrame[] = [];
        const files = await renderImageSequenceEmoticon({
            frameBuffers,
            plan,
            formats: params.request.formats,
            outputProfile,
            editRecipe,
            ...(frameDurationsMs ? { frameDurationsMs } : {}),
            ...(params.request.renderOverrides?.frameTransitions
                ? { frameTransitions: params.request.renderOverrides.frameTransitions }
                : {}),
            onComposedFrames: async (frames) => {
                compositedFrames = await uploadCompositedFrameSequence({
                    userId: params.userId,
                    jobId: params.jobId,
                    frames,
                    onProgress: async (uploadedFrames) => params.update({
                        compositedFrames: uploadedFrames,
                        compositedFrameCheckpointCount: uploadedFrames.length,
                        updatedAt: FieldValue.serverTimestamp(),
                    }),
                });
            },
        });
        assertRenderedFilesPassedInspection(files);
        const outputs = await uploadRenderedFiles({
            userId: params.userId,
            jobId: params.jobId,
            files,
        });
        await params.update({
            status: 'completed',
            progress: 100,
            statusMessage: editRecipe
                ? '이미지 편집본이 완성되었어요.'
                : frameDurationsMs || params.request.renderOverrides?.frameTransitions
                    ? '시간과 전환 효과를 적용한 움짤이 완성되었어요.'
                    : '말풍선 수정본이 완성되었어요.',
            plan,
            ...(parent.quality ? { quality: parent.quality } : {}),
            sourceImageUrl: parent.sourceImageUrl,
            sourceStoragePath: parent.sourceStoragePath,
            ...(parent.sourceCanonicalStoragePath
                ? { sourceCanonicalStoragePath: parent.sourceCanonicalStoragePath }
                : {}),
            ...(parent.sourceFingerprint ? { sourceFingerprint: parent.sourceFingerprint } : {}),
            ...(parent.referenceSetFingerprint
                ? { referenceSetFingerprint: parent.referenceSetFingerprint }
                : {}),
            ...(parent.identityFingerprint ? { identityFingerprint: parent.identityFingerprint } : {}),
            ...(parent.identityFingerprintVersion
                ? { identityFingerprintVersion: parent.identityFingerprintVersion }
                : {}),
            keyPoseUrl: parent.keyPoseUrl,
            keyPoseStoragePath: poseStoragePath,
            frameSequencePlan: verifiedDynamicParent.frameSequence,
            motionReview: verifiedDynamicParent.motionReview,
            animationFrames,
            compositedFrames,
            ...(editRecipe ? { editRecipe } : {}),
            outputs,
            outputProfile,
            specReport: buildSpecReport({ plan, outputProfile, files }),
            analysisReused: true,
            motionFallbackReason: null,
            completedAt: FieldValue.serverTimestamp(),
        });
        return;
    }
    const poseBuffer = await downloadStoredPose(poseStoragePath);
    const plan = normalizeEmoticonPlanForOutputProfile(
        applyEmoticonMotionOverride({
            ...overriddenParentPlan,
            action: {
                ...overriddenParentPlan.action,
                renderMode: 'keyframes',
                motionType: !isEfficientLocalParent && overriddenParentPlan.action.motionType === 'dynamic'
                    ? 'bob'
                    : overriddenParentPlan.action.motionType,
            },
            bubble: params.request.renderOverrides?.bubble || parentPlan.data.bubble,
            bubbleLayers: params.request.renderOverrides?.bubbleLayers || parentPlan.data.bubbleLayers,
        }, motionOverride),
        outputProfile,
    );
    await params.update({
        status: 'rendering',
        progress: 55,
        statusMessage: '수정한 설정으로 프레임을 다시 조립하고 있어요.',
        plan,
        keyPoseUrl: parent.keyPoseUrl,
        keyPoseStoragePath: poseStoragePath,
    });
    let compositedFrames: EmoticonAnimationFrame[] = [];
    const files = await renderImageEmoticon({
        imageBuffer: poseBuffer,
        plan,
        formats: params.request.formats,
        outputProfile,
        editRecipe,
        onComposedFrames: async (frames) => {
            compositedFrames = await uploadCompositedFrameSequence({
                userId: params.userId,
                jobId: params.jobId,
                frames,
                onProgress: async (uploadedFrames) => params.update({
                    compositedFrames: uploadedFrames,
                    compositedFrameCheckpointCount: uploadedFrames.length,
                    updatedAt: FieldValue.serverTimestamp(),
                }),
            });
        },
    });
    await params.update({
        status: 'rendering',
        progress: 82,
        statusMessage: '선택한 파일 형식으로 저장하고 있어요.',
        plan,
    });
    assertRenderedFilesPassedInspection(files);
    const outputs = await uploadRenderedFiles({
        userId: params.userId,
        jobId: params.jobId,
        files,
    });
    await params.update({
        status: 'completed',
        progress: 100,
        statusMessage: editRecipe ? '이미지 편집본이 완성됐어요.' : '말풍선 수정본이 완성됐어요.',
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
        compositedFrames,
        ...(editRecipe ? { editRecipe } : {}),
        outputs,
        outputProfile,
        specReport: buildSpecReport({ plan, outputProfile, files }),
        analysisReused: true,
        motionFallbackReason: isEfficientLocalParent ? EFFICIENT_LOCAL_COMPOSITE_VERSION : null,
        completedAt: FieldValue.serverTimestamp(),
    });
}

async function repairExistingDynamicFrame(params: {
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
    apiKey: string;
    model: string;
    imageModel?: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    update: (data: Record<string, unknown>) => Promise<void>;
    jobCreatedAtMs: number;
    continuation?: PipelineContinuationState;
    checkpoint?: Record<string, unknown>;
    deadlineAtMs?: number;
}): Promise<void> {
    if (!params.request.parentJobId || params.request.repairFrameIndex === undefined) {
        throw new Error('A completed parent job and one frame index are required for frame repair.');
    }
    const parentRef = db.doc(`users/${params.userId}/emoticonJobs/${params.request.parentJobId}`);
    const parentSnapshot = await parentRef.get();
    if (!parentSnapshot.exists) throw new Error('The completed parent animation could not be found.');
    const parent = parentSnapshot.data() || {};
    if (
        parent.userId !== params.userId
        || parent.status !== 'completed'
        || parent.deletionLocked === true
    ) {
        throw new Error('Only the owner can repair a completed animation.');
    }
    const sourcePrefix = `users/${params.userId}/emoticon-studio/sources/`;
    const parentJobPrefix = `users/${params.userId}/emoticon-studio/jobs/${params.request.parentJobId}/`;
    const anyOwnedJobPrefix = `users/${params.userId}/emoticon-studio/jobs/`;
    if (
        typeof parent.sourceStoragePath !== 'string'
        || !parent.sourceStoragePath.startsWith(sourcePrefix)
        || parent.sourceStoragePath !== params.request.sourceStoragePath
    ) {
        throw new Error('The repair source does not match the owned parent source.');
    }
    const canonicalSourceStoragePath = typeof parent.sourceCanonicalStoragePath === 'string'
        ? parent.sourceCanonicalStoragePath
        : '';
    if (!canonicalSourceStoragePath.startsWith(anyOwnedJobPrefix)) {
        throw new Error('The canonical parent source does not belong to this user.');
    }

    const verifiedParent = verifyReusableDynamicParent({
        parent,
        expectedFrameStoragePrefix: parentJobPrefix,
    });
    if (!verifiedParent.success) {
        throw new Error(
            `The parent animation is not eligible for safe frame reuse (${verifiedParent.reason}). `
            + 'Create a new AI generation instead of repairing this legacy or unverified animation.',
        );
    }
    const plan = verifiedParent.plan;
    const frameIndex = params.request.repairFrameIndex;
    if (frameIndex < 0 || frameIndex >= plan.action.frameCount) {
        throw new Error('The requested repair frame is outside the parent animation.');
    }
    const outputProfileResult = emoticonOutputProfileSchema.safeParse(parent.outputProfile);
    if (!outputProfileResult.success) {
        throw new Error('The verified parent output profile is unavailable.');
    }
    const outputProfile = resolveEmoticonOutputProfile(outputProfileResult.data);
    const poseStoragePath = typeof parent.keyPoseStoragePath === 'string'
        ? parent.keyPoseStoragePath
        : '';
    const poseUrl = typeof parent.keyPoseUrl === 'string' ? parent.keyPoseUrl : '';
    if (!poseStoragePath.startsWith(anyOwnedJobPrefix) || !poseUrl.startsWith('https://')) {
        throw new Error('The owned parent key pose is unavailable.');
    }

    const continuation = params.continuation || {
        stage: 'repair-generation' as const,
        retryCount: 0,
    };
    if (![
        'repair-generation',
        'repair-pose-review',
        'repair-sequence-review',
        'repair-render',
    ].includes(continuation.stage)) {
        throw new Error('The saved frame repair continuation stage is invalid.');
    }
    const checkpoint = params.checkpoint || {};
    const savedRepair = emoticonFrameRepairSchema.safeParse(checkpoint.frameRepair);
    resolveEmoticonRepairCheckpointAction({
        stage: continuation.stage as EmoticonRepairContinuationStage,
        generationCalls: savedRepair.success ? savedRepair.data.generationCalls : 0,
        hasReplacement: Boolean(savedRepair.success && savedRepair.data.replacementFrame),
        poseReviewCalls: savedRepair.success ? savedRepair.data.poseReviewCalls || 0 : 0,
        hasAcceptedPoseReview: Boolean(
            savedRepair.success
            && savedRepair.data.poseReview
            && meetsEmoticonDynamicKeyPoseAcceptance(savedRepair.data.poseReview),
        ),
        sequenceReviewCalls: savedRepair.success ? savedRepair.data.sequenceReviewCalls || 0 : 0,
        hasAcceptedSequenceReview: Boolean(
            savedRepair.success
            && savedRepair.data.motionReview
            && isVerifiedBodyMotion(savedRepair.data.motionReview, plan),
        ),
    });

    if (continuation.stage === 'repair-generation') {
        if (savedRepair.success && savedRepair.data.generationCalls === 1) {
            throw new Error('The bounded replacement image call was already consumed without a reusable checkpoint.');
        }
        await params.update({
            status: 'generating',
            progress: 18,
            statusMessage: `${frameIndex + 1}번 프레임만 원본 동작 흐름에 맞춰 다시 만들고 있어요.`,
            error: null,
            analysisReused: true,
            plan,
            frameSequencePlan: verifiedParent.frameSequence,
            outputProfile,
            frameContinuation: { ...continuation, state: 'checkpointed' },
            resumeAvailable: true,
            frameRepair: {
                parentJobId: params.request.parentJobId,
                frameIndex,
                maxGenerationCalls: 1,
                generationCalls: 0,
                maxPoseReviewCalls: 1,
                poseReviewCalls: 0,
                maxSequenceReviewCalls: 1,
                sequenceReviewCalls: 0,
                validation: FRAME_REPAIR_VALIDATION,
            },
        });
    }
    const [frameBuffers, keyPoseBuffer, canonicalSourceBuffer] = await Promise.all([
        downloadStoredAnimationFrames({
            userId: params.userId,
            parentJobId: params.request.parentJobId,
            frames: verifiedParent.animationFrames,
        }),
        downloadStoredPose(poseStoragePath),
        downloadStoredPose(canonicalSourceStoragePath),
    ]);
    await assertJobActive(params.userId, params.jobId);
    const canonicalSourceAsset = await uploadBuffer({
        userId: params.userId,
        jobId: params.jobId,
        fileName: 'source.png',
        buffer: canonicalSourceBuffer,
        contentType: 'image/png',
    });
    const parentReferences = emoticonReferenceImageSchema.array().max(3).safeParse(parent.referenceImages || []);
    if (!parentReferences.success) {
        throw new Error('The parent character reference set is invalid; start a new generation.');
    }
    const requestReferencePaths = params.request.referenceImages
        .map((reference) => reference.sourceStoragePath)
        .sort();
    const parentReferencePaths = parentReferences.data
        .map((reference) => reference.sourceStoragePath)
        .sort();
    if (JSON.stringify(requestReferencePaths) !== JSON.stringify(parentReferencePaths)) {
        throw new Error('The repair character reference set does not match the verified parent identity.');
    }
    const canonicalReferenceSet = await prepareCanonicalReferenceSet({
        userId: params.userId,
        jobId: params.jobId,
        sourceStoragePath: parent.sourceStoragePath,
        references: parentReferences.data,
    });
    const parentSourceFingerprint = typeof parent.sourceFingerprint === 'string'
        ? parent.sourceFingerprint
        : '';
    const repairIdentityFingerprint = buildEmoticonIdentityFingerprint({
        normalizedSourceFingerprint: parentSourceFingerprint,
        referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
    });
    if (
        !parentSourceFingerprint
        || parent.identityFingerprintVersion !== EMOTICON_IDENTITY_FINGERPRINT_VERSION
        || parent.referenceSetFingerprint !== canonicalReferenceSet.referenceSetFingerprint
        || parent.identityFingerprint !== repairIdentityFingerprint
    ) {
        throw new Error('The parent character reference identity was not verified; start a new generation.');
    }
    let replacementBuffer: Buffer;
    let replacementAsset: EmoticonAnimationFrame;
    if (continuation.stage === 'repair-generation') {
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_IMAGE_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 18,
            statusMessage: '긴 작업을 안전하게 나눠 교체 프레임 생성부터 이어갈게요.',
        });
        await assertJobActive(params.userId, params.jobId);
        const previousFrameIndex = (frameIndex - 1 + frameBuffers.length) % frameBuffers.length;
        const nextFrameIndex = (frameIndex + 1) % frameBuffers.length;
        await params.update({
            frameRepair: {
                parentJobId: params.request.parentJobId,
                frameIndex,
                maxGenerationCalls: 1,
                generationCalls: 1,
                maxPoseReviewCalls: 1,
                poseReviewCalls: 0,
                maxSequenceReviewCalls: 1,
                sequenceReviewCalls: 0,
                validation: FRAME_REPAIR_VALIDATION,
            },
            frameContinuation: { ...continuation, state: 'running' },
        });
        const replacementSeed = buildAnimationFrameSeed(buildFrameSequenceSeed(params.jobId), frameIndex);
        const generated = await generateEmoticonAnimationFrame({
            apiKey: params.apiKey,
            preferredModel: params.imageModel,
            sourceImageUrl: canonicalSourceAsset.url,
            originalUserInstruction: params.request.instruction,
            identityReferenceUrl: canonicalReferenceSet.identitySheetUrl,
            additionalReferenceUrls: canonicalReferenceSet.urls,
            previousFrameUrl: verifiedParent.animationFrames[previousFrameIndex].url,
            nextFrameUrl: verifiedParent.animationFrames[nextFrameIndex].url,
            plan,
            direction: verifiedParent.frameSequence.frames[frameIndex],
            frameCount: plan.action.frameCount,
            correction: 'Replace only this faulty frame. Preserve exact identity and canvas registration, make the pose and face fit both adjacent frames, and keep one isolated character on transparent alpha with no residue or duplicate limbs.',
            seed: replacementSeed,
            maxRequestAttempts: 1,
        });
        await assertJobActive(params.userId, params.jobId);
        replacementBuffer = await normalizeGeneratedEmoticonPose(generated.buffer, {
            preserveDetachedComponents: plan.action.authorizedProps.length > 0
                || plan.action.motionAccents.length > 0,
        });
        frameBuffers[frameIndex] = replacementBuffer;
        const variation = await evaluateEmoticonFrameVariation(frameBuffers, {
            requireSilhouetteVariation: getEmoticonMotionAcceptanceRequirements(plan)
                .requireLimbMotion,
        });
        if (!variation.passes) {
            throw new Error('The replacement frame is too similar to an adjacent frame and was rejected without another paid attempt.');
        }
        const uploadedReplacement = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: 'replacement-candidate.png',
            buffer: replacementBuffer,
            contentType: 'image/png',
        });
        replacementAsset = {
            ...uploadedReplacement,
            contentType: 'image/png',
            generationModel: generated.model,
            ...(generated.provider ? { generationProvider: generated.provider } : {}),
            generationRequestId: generated.requestId,
            generationSeed: replacementSeed,
            ...(generated.costUsd !== undefined ? { generationCostUsd: generated.costUsd } : {}),
        };
        const nextContinuation: PipelineContinuationState = {
            stage: 'repair-pose-review',
            retryCount: continuation.retryCount,
        };
        // This atomic job-checkpoint + continuation enqueue is the first
        // Firestore write after the paid image result upload. Every later run
        // reloads this replacement instead of making a second image request.
        await scheduleFrameContinuation({
            userId: params.userId,
            jobId: params.jobId,
            continuation: nextContinuation,
            progress: 34,
            statusMessage: '교체 프레임을 저장했고 의미 검사를 준비하고 있어요.',
            checkpointData: {
                sourceCanonicalStoragePath: canonicalSourceAsset.storagePath,
                frameRepair: {
                    parentJobId: params.request.parentJobId,
                    frameIndex,
                    maxGenerationCalls: 1,
                    generationCalls: 1,
                    maxPoseReviewCalls: 1,
                    poseReviewCalls: 0,
                    maxSequenceReviewCalls: 1,
                    sequenceReviewCalls: 0,
                    validation: FRAME_REPAIR_VALIDATION,
                    replacementFrame: replacementAsset,
                },
            },
        });
    } else {
        if (
            !savedRepair.success
            || savedRepair.data.generationCalls !== 1
            || !savedRepair.data.replacementFrame
        ) {
            throw new Error('The saved replacement frame checkpoint is invalid.');
        }
        replacementAsset = savedRepair.data.replacementFrame;
        const expectedRepairPrefix = `users/${params.userId}/emoticon-studio/jobs/${params.jobId}/`;
        if (!replacementAsset.storagePath.startsWith(expectedRepairPrefix)) {
            throw new Error('The saved replacement frame does not belong to this repair job.');
        }
        replacementBuffer = await downloadStoredPose(replacementAsset.storagePath);
        frameBuffers[frameIndex] = replacementBuffer;
    }

    let replacementPoseReview: EmoticonQuality;
    if (continuation.stage === 'repair-pose-review') {
        if (savedRepair.success && savedRepair.data.poseReviewCalls === 1) {
            throw new Error('The bounded replacement pose review call was already consumed without a reusable result.');
        }
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_REVIEW_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 38,
            statusMessage: '긴 작업을 안전하게 나눠 교체 프레임 의미 검사부터 이어갈게요.',
        });
        await params.update({
            status: 'validating',
            progress: 38,
            statusMessage: '교체 프레임이 요청한 동작·표정과 얼굴·색상·배경 기준을 지켰는지 확인하고 있어요.',
            frameRepair: {
                parentJobId: params.request.parentJobId,
                frameIndex,
                maxGenerationCalls: 1,
                generationCalls: 1,
                maxPoseReviewCalls: 1,
                poseReviewCalls: 1,
                maxSequenceReviewCalls: 1,
                sequenceReviewCalls: 0,
                validation: FRAME_REPAIR_VALIDATION,
                replacementFrame: replacementAsset,
            },
            frameContinuation: { ...continuation, state: 'running' },
        });
        await assertJobActive(params.userId, params.jobId);
        replacementPoseReview = await reviewPose({
            apiKey: params.apiKey,
            model: params.model,
            fallbackModels: params.fallbackModels,
            reasoningEffort: params.reasoningEffort,
            sourceImageUrl: canonicalSourceAsset.url,
            originalUserInstruction: params.request.instruction,
            additionalReferenceUrls: canonicalReferenceSet.urls,
            generatedImageUrl: replacementAsset.url,
            plan,
        });
        if (!meetsEmoticonDynamicKeyPoseAcceptance(replacementPoseReview)) {
            await params.update({
                quality: replacementPoseReview,
                frameRepair: {
                    parentJobId: params.request.parentJobId,
                    frameIndex,
                    maxGenerationCalls: 1,
                    generationCalls: 1,
                    maxPoseReviewCalls: 1,
                    poseReviewCalls: 1,
                    maxSequenceReviewCalls: 1,
                    sequenceReviewCalls: 0,
                    validation: FRAME_REPAIR_VALIDATION,
                    replacementFrame: replacementAsset,
                    poseReview: replacementPoseReview,
                },
            });
            throw new Error(
                'The replacement frame failed requested-action, identity, background, single-character, or occlusion acceptance.',
            );
        }
        const nextContinuation: PipelineContinuationState = {
            stage: 'repair-sequence-review',
            retryCount: continuation.retryCount,
        };
        await scheduleFrameContinuation({
            userId: params.userId,
            jobId: params.jobId,
            continuation: nextContinuation,
            progress: 50,
            statusMessage: '교체 프레임 의미 검사를 통과해 전체 움직임 검사를 준비하고 있어요.',
            checkpointData: {
                quality: replacementPoseReview,
                frameRepair: {
                    parentJobId: params.request.parentJobId,
                    frameIndex,
                    maxGenerationCalls: 1,
                    generationCalls: 1,
                    maxPoseReviewCalls: 1,
                    poseReviewCalls: 1,
                    maxSequenceReviewCalls: 1,
                    sequenceReviewCalls: 0,
                    validation: FRAME_REPAIR_VALIDATION,
                    replacementFrame: replacementAsset,
                    poseReview: replacementPoseReview,
                },
            },
        });
    } else {
        if (
            !savedRepair.success
            || !savedRepair.data.poseReview
            || savedRepair.data.poseReviewCalls !== 1
            || !meetsEmoticonDynamicKeyPoseAcceptance(savedRepair.data.poseReview)
        ) {
            throw new Error('The saved replacement pose review checkpoint is invalid.');
        }
        replacementPoseReview = savedRepair.data.poseReview;
    }

    let repairedMotionReview: EmoticonMotionReview;
    if (continuation.stage === 'repair-sequence-review') {
        if (savedRepair.success && savedRepair.data.sequenceReviewCalls === 1) {
            throw new Error('The bounded repair sequence review call was already consumed without a reusable result.');
        }
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_REVIEW_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 50,
            statusMessage: '긴 작업을 안전하게 나눠 전체 움직임 검사부터 이어갈게요.',
        });
        await params.update({
            status: 'validating',
            progress: 50,
            statusMessage: '교체한 프레임을 포함한 전체 움직임과 반복 연결을 확인하고 있어요.',
            frameRepair: {
                parentJobId: params.request.parentJobId,
                frameIndex,
                maxGenerationCalls: 1,
                generationCalls: 1,
                maxPoseReviewCalls: 1,
                poseReviewCalls: 1,
                maxSequenceReviewCalls: 1,
                sequenceReviewCalls: 1,
                validation: FRAME_REPAIR_VALIDATION,
                replacementFrame: replacementAsset,
                poseReview: replacementPoseReview,
            },
            frameContinuation: { ...continuation, state: 'running' },
        });
        await assertJobActive(params.userId, params.jobId);
        repairedMotionReview = await reviewImageFrameSequenceFailClosed({
            apiKey: params.apiKey,
            model: params.model,
            fallbackModels: params.fallbackModels,
            reasoningEffort: params.reasoningEffort,
            sourceImageUrl: canonicalSourceAsset.url,
            originalUserInstruction: params.request.instruction,
            additionalReferenceUrls: canonicalReferenceSet.urls,
            frameUrls: verifiedParent.animationFrames.map((frame, index) => (
                index === frameIndex ? replacementAsset.url : frame.url
            )),
            plan,
        });
        if (!isVerifiedBodyMotion(repairedMotionReview, plan)) {
            await params.update({
                motionReview: repairedMotionReview,
                frameRepair: {
                    parentJobId: params.request.parentJobId,
                    frameIndex,
                    maxGenerationCalls: 1,
                    generationCalls: 1,
                    maxPoseReviewCalls: 1,
                    poseReviewCalls: 1,
                    maxSequenceReviewCalls: 1,
                    sequenceReviewCalls: 1,
                    validation: FRAME_REPAIR_VALIDATION,
                    replacementFrame: replacementAsset,
                    poseReview: replacementPoseReview,
                    motionReview: repairedMotionReview,
                },
            });
            throw new Error('The repaired full sequence failed verified character motion acceptance.');
        }
        const nextContinuation: PipelineContinuationState = {
            stage: 'repair-render',
            retryCount: continuation.retryCount,
        };
        await scheduleFrameContinuation({
            userId: params.userId,
            jobId: params.jobId,
            continuation: nextContinuation,
            progress: 68,
            statusMessage: '전체 움직임 검사를 통과해 최종 파일 조립을 준비하고 있어요.',
            checkpointData: {
                motionReview: repairedMotionReview,
                frameRepair: {
                    parentJobId: params.request.parentJobId,
                    frameIndex,
                    maxGenerationCalls: 1,
                    generationCalls: 1,
                    maxPoseReviewCalls: 1,
                    poseReviewCalls: 1,
                    maxSequenceReviewCalls: 1,
                    sequenceReviewCalls: 1,
                    validation: FRAME_REPAIR_VALIDATION,
                    replacementFrame: replacementAsset,
                    poseReview: replacementPoseReview,
                    motionReview: repairedMotionReview,
                },
            },
        });
    } else {
        if (
            !savedRepair.success
            || !savedRepair.data.motionReview
            || savedRepair.data.sequenceReviewCalls !== 1
            || !isVerifiedBodyMotion(savedRepair.data.motionReview, plan)
        ) {
            throw new Error('The saved repaired sequence review checkpoint is invalid.');
        }
        repairedMotionReview = savedRepair.data.motionReview;
    }

    if (continuation.stage !== 'repair-render') {
        throw new Error('The repaired animation did not reach its render checkpoint.');
    }
    await ensureContinuationBudget({
        deadlineAtMs: params.deadlineAtMs,
        minimumRemainingMs: MIN_RENDER_BUDGET_MS,
        userId: params.userId,
        jobId: params.jobId,
        continuation,
        progress: 68,
        statusMessage: '긴 작업을 안전하게 나눠 최종 파일 조립부터 이어갈게요.',
    });
    await assertJobActive(params.userId, params.jobId);
    await params.update({
        status: 'rendering',
        progress: 68,
        statusMessage: '의미·동작 검사를 통과해 전체 파일을 다시 조립하고 있어요.',
        frameRepair: {
            parentJobId: params.request.parentJobId,
            frameIndex,
            maxGenerationCalls: 1,
            generationCalls: 1,
            maxPoseReviewCalls: 1,
            poseReviewCalls: 1,
            maxSequenceReviewCalls: 1,
            sequenceReviewCalls: 1,
            validation: FRAME_REPAIR_VALIDATION,
            replacementFrame: replacementAsset,
            poseReview: replacementPoseReview,
            motionReview: repairedMotionReview,
        },
        frameContinuation: { ...continuation, state: 'running' },
    });
    const animationFrames = await Promise.all(frameBuffers.map(async (buffer, index) => {
        const asset = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: `${index === frameIndex ? 'replacement' : 'reused'}-ai-frame-${String(index + 1).padStart(3, '0')}.png`,
            buffer,
            contentType: 'image/png',
        });
        const generation = index === frameIndex
            ? replacementAsset
            : verifiedParent.animationFrames[index];
        return {
            ...asset,
            contentType: 'image/png' as const,
            ...(generation.generationModel ? { generationModel: generation.generationModel } : {}),
            ...(generation.generationProvider ? { generationProvider: generation.generationProvider } : {}),
            ...(generation.generationRequestId ? { generationRequestId: generation.generationRequestId } : {}),
            ...(generation.generationSeed !== undefined ? { generationSeed: generation.generationSeed } : {}),
            ...(generation.generationCostUsd !== undefined ? { generationCostUsd: generation.generationCostUsd } : {}),
        };
    }));
    const keyPoseAsset = await uploadBuffer({
        userId: params.userId,
        jobId: params.jobId,
        fileName: 'reused-key-pose.png',
        buffer: keyPoseBuffer,
        contentType: 'image/png',
    });
    await assertJobActive(params.userId, params.jobId);
    let compositedFrames: EmoticonAnimationFrame[] = [];
    const files = await renderImageSequenceEmoticon({
        frameBuffers,
        plan,
        formats: params.request.formats,
        outputProfile,
        onComposedFrames: async (frames) => {
            compositedFrames = await uploadCompositedFrameSequence({
                userId: params.userId,
                jobId: params.jobId,
                frames,
                onProgress: async (uploadedFrames) => params.update({
                    compositedFrames: uploadedFrames,
                    compositedFrameCheckpointCount: uploadedFrames.length,
                    updatedAt: FieldValue.serverTimestamp(),
                }),
            });
        },
    });
    assertRenderedFilesPassedInspection(files);
    const renderedOutputs = await uploadRenderedFiles({
        userId: params.userId,
        jobId: params.jobId,
        files,
    });
    await params.update({
        status: 'completed',
        progress: 100,
        statusMessage: `${frameIndex + 1}번 프레임을 교체하고 전체 파일 검사를 마쳤어요.`,
        plan,
        frameSequencePlan: verifiedParent.frameSequence,
        animationFrames,
        compositedFrames,
        repairedFrameIndex: frameIndex,
        frameRepair: {
            parentJobId: params.request.parentJobId,
            frameIndex,
            maxGenerationCalls: 1,
            generationCalls: 1,
            maxPoseReviewCalls: 1,
            poseReviewCalls: 1,
            maxSequenceReviewCalls: 1,
            sequenceReviewCalls: 1,
            validation: FRAME_REPAIR_VALIDATION,
            replacementFrame: replacementAsset,
            poseReview: replacementPoseReview,
            motionReview: repairedMotionReview,
        },
        quality: replacementPoseReview,
        motionReview: repairedMotionReview,
        sourceImageUrl: canonicalSourceAsset.url,
        sourceStoragePath: parent.sourceStoragePath,
        sourceCanonicalStoragePath: canonicalSourceAsset.storagePath,
        ...(parent.sourceFingerprint ? { sourceFingerprint: parent.sourceFingerprint } : {}),
        referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
        identityFingerprint: repairIdentityFingerprint,
        identityFingerprintVersion: EMOTICON_IDENTITY_FINGERPRINT_VERSION,
        keyPoseUrl: keyPoseAsset.url,
        keyPoseStoragePath: keyPoseAsset.storagePath,
        outputs: renderedOutputs,
        outputProfile,
        specReport: buildSpecReport({ plan, outputProfile, files }),
        analysisReused: true,
        motionFallbackReason: null,
        resumeAvailable: false,
        'frameContinuation.state': 'completed',
        completedAt: FieldValue.serverTimestamp(),
    });
    await syncCompletedProjectItemNonFatal({
        userId: params.userId,
        jobId: params.jobId,
        request: params.request,
        jobCreatedAtMs: params.jobCreatedAtMs,
    });
}

async function loadCheckpointPose(params: {
    userId: string;
    jobId: string;
    url: unknown;
    storagePath: unknown;
}): Promise<{ buffer: Buffer; asset: UploadedAsset }> {
    const url = typeof params.url === 'string' ? params.url : '';
    const storagePath = typeof params.storagePath === 'string' ? params.storagePath : '';
    const expectedPrefix = `users/${params.userId}/emoticon-studio/jobs/${params.jobId}/`;
    if (!url.startsWith('https://') || !storagePath.startsWith(expectedPrefix)) {
        throw new Error('The saved key pose checkpoint is invalid.');
    }
    const buffer = await downloadStoredPose(storagePath);
    return {
        buffer,
        asset: {
            url,
            storagePath,
            fileName: storagePath.split('/').pop() || 'key-pose.png',
            contentType: 'image/png',
            sizeBytes: buffer.byteLength,
        },
    };
}

function efficientIdentityReviewReferences(
    identityReferenceUrl: string | undefined,
    additionalReferenceUrls: string[] = [],
): string[] {
    const identityEvidence = identityReferenceUrl?.trim()
        || additionalReferenceUrls.find((url) => Boolean(url?.trim()))?.trim();
    return identityEvidence ? [identityEvidence] : [];
}

async function runPostAnalysisPipeline(params: {
    apiKey: string;
    model: string;
    imageModel?: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
    sourceImageUrl: string;
    identityReferenceUrl?: string;
    additionalReferenceUrls: string[];
    plan: EmoticonPlan;
    outputProfile: EmoticonOutputProfile;
    analysisReused: boolean;
    update: (data: Record<string, unknown>) => Promise<void>;
    deadlineAtMs: number;
    jobCreatedAtMs: number;
    continuation?: PipelineContinuationState;
    checkpoint?: Record<string, unknown>;
}): Promise<void> {
    let continuation: PipelineContinuationState = params.continuation || {
        stage: 'pose-generation',
        retryCount: 0,
    };
    const checkpoint = params.checkpoint || {};
    let selectedPoseBuffer: Buffer | null = null;
    let selectedAsset: UploadedAsset | null = null;
    let correctedPoseBuffer: Buffer | null = null;
    let correctedAsset: UploadedAsset | null = null;
    let quality: EmoticonQuality | null = null;

    if (continuation.stage !== 'pose-generation') {
        const saved = await loadCheckpointPose({
            userId: params.userId,
            jobId: params.jobId,
            url: checkpoint.keyPoseUrl,
            storagePath: checkpoint.keyPoseStoragePath,
        });
        selectedPoseBuffer = saved.buffer;
        selectedAsset = saved.asset;
        const savedQuality = emoticonQualitySchema.safeParse(checkpoint.quality);
        if (savedQuality.success) quality = savedQuality.data;
    }

    if (continuation.stage === 'pose-generation') {
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_IMAGE_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 26,
            statusMessage: '긴 작업을 안전하게 나눠 핵심 포즈 생성부터 이어갈게요.',
        });
        await params.update({
            status: 'generating',
            progress: 26,
            statusMessage: '원본과 같은 캐릭터의 핵심 포즈를 만들고 있어요',
            plan: params.plan,
            outputProfile: params.outputProfile,
        });
        await assertJobActive(params.userId, params.jobId);
        const generatedPose = await generateEmoticonPose({
            apiKey: params.apiKey,
            preferredModel: params.imageModel,
            sourceImageUrl: params.sourceImageUrl,
            originalUserInstruction: params.request.instruction,
            identityReferenceUrl: params.identityReferenceUrl,
            additionalReferenceUrls: params.additionalReferenceUrls,
            plan: params.plan,
            seed: buildFrameSequenceSeed(params.jobId),
            resourceMode: params.request.resourceMode,
            maxInputReferences: params.request.resourceMode === 'efficient' ? 3 : 4,
        });
        selectedPoseBuffer = await normalizeGeneratedEmoticonPose(generatedPose.buffer, {
            preserveDetachedComponents: params.plan.action.authorizedProps.length > 0
                || params.plan.action.motionAccents.length > 0,
        });
        selectedAsset = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: 'key-pose-1.png',
            buffer: selectedPoseBuffer,
            contentType: 'image/png',
        });
        continuation = { stage: 'pose-review', retryCount: continuation.retryCount };
        await params.update({
            status: 'validating',
            progress: 43,
            statusMessage: '얼굴·색상·의상 일관성을 확인하고 있어요',
            keyPoseUrl: selectedAsset.url,
            keyPoseStoragePath: selectedAsset.storagePath,
            keyPoseGeneration: {
                model: generatedPose.model,
                ...(generatedPose.provider ? { provider: generatedPose.provider } : {}),
                requestId: generatedPose.requestId,
                seed: buildFrameSequenceSeed(params.jobId),
                ...(generatedPose.costUsd !== undefined ? { costUsd: generatedPose.costUsd } : {}),
            },
            frameContinuation: { ...continuation, state: 'checkpointed' },
            resumeAvailable: true,
        });
    }

    if (!selectedPoseBuffer || !selectedAsset) {
        throw new Error('The key pose checkpoint required for continuation is unavailable.');
    }

    if (continuation.stage === 'pose-review') {
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_REVIEW_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 43,
            statusMessage: '긴 작업을 안전하게 나눠 핵심 포즈 검사를 이어갈게요.',
        });
        await assertJobActive(params.userId, params.jobId);
        quality = applyAlphaIsolationEvidence(await reviewPose({
            apiKey: params.apiKey,
            model: params.model,
            fallbackModels: params.fallbackModels,
            reasoningEffort: params.reasoningEffort,
            sourceImageUrl: params.sourceImageUrl,
            originalUserInstruction: params.request.instruction,
            additionalReferenceUrls: params.request.resourceMode === 'efficient'
                ? efficientIdentityReviewReferences(
                    params.identityReferenceUrl,
                    params.additionalReferenceUrls,
                )
                : params.additionalReferenceUrls,
            generatedImageUrl: selectedAsset.url,
            plan: params.plan,
        }), await inspectEmoticonAlphaIsolation(selectedPoseBuffer));
        continuation = needsPoseIsolationCorrection(quality, isDynamicRender(params.plan))
            ? { stage: 'pose-correction', retryCount: continuation.retryCount }
            : { stage: 'static-render', retryCount: continuation.retryCount };
        await params.update({
            quality,
            frameContinuation: { ...continuation, state: 'checkpointed' },
            resumeAvailable: true,
        });
    }

    if (continuation.stage === 'pose-correction') {
        if (!quality) throw new Error('The pose quality checkpoint required for correction is unavailable.');
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_IMAGE_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 51,
            statusMessage: '긴 작업을 안전하게 나눠 포즈 보정부터 이어갈게요.',
        });
        await params.update({
            status: 'generating',
            progress: 51,
            statusMessage: '요청한 행동과 감정이 분명히 보이도록 결과를 한 번 더 다듬고 있어요',
        });
        await assertJobActive(params.userId, params.jobId);
        const generatedCorrection = await generateEmoticonPose({
            apiKey: params.apiKey,
            preferredModel: params.imageModel,
            sourceImageUrl: params.sourceImageUrl,
            originalUserInstruction: params.request.instruction,
            identityReferenceUrl: params.identityReferenceUrl,
            additionalReferenceUrls: params.additionalReferenceUrls,
            plan: params.plan,
            seed: buildFrameSequenceSeed(params.jobId) ^ 0x2c9277b5,
            correction: quality.correction.trim()
                || 'Recreate exactly one isolated full character with a transparent background, no duplicate parts, no residue, and no occlusion.',
            resourceMode: params.request.resourceMode,
            maxInputReferences: params.request.resourceMode === 'efficient' ? 3 : 4,
        });
        correctedPoseBuffer = await normalizeGeneratedEmoticonPose(generatedCorrection.buffer, {
            preserveDetachedComponents: params.plan.action.authorizedProps.length > 0
                || params.plan.action.motionAccents.length > 0,
        });
        correctedAsset = await uploadBuffer({
            userId: params.userId,
            jobId: params.jobId,
            fileName: 'key-pose-2.png',
            buffer: correctedPoseBuffer,
            contentType: 'image/png',
        });
        continuation = {
            stage: 'corrected-pose-review',
            retryCount: continuation.retryCount,
        };
        await params.update({
            correctionPoseUrl: correctedAsset.url,
            correctionPoseStoragePath: correctedAsset.storagePath,
            correctionPoseGeneration: {
                model: generatedCorrection.model,
                ...(generatedCorrection.provider ? { provider: generatedCorrection.provider } : {}),
                requestId: generatedCorrection.requestId,
                seed: buildFrameSequenceSeed(params.jobId) ^ 0x2c9277b5,
                ...(generatedCorrection.costUsd !== undefined
                    ? { costUsd: generatedCorrection.costUsd }
                    : {}),
            },
            frameContinuation: { ...continuation, state: 'checkpointed' },
            resumeAvailable: true,
        });
    }

    if (continuation.stage === 'corrected-pose-review') {
        if (!quality) throw new Error('The original pose quality checkpoint is unavailable.');
        if (!correctedPoseBuffer || !correctedAsset) {
            const corrected = await loadCheckpointPose({
                userId: params.userId,
                jobId: params.jobId,
                url: checkpoint.correctionPoseUrl,
                storagePath: checkpoint.correctionPoseStoragePath,
            });
            correctedPoseBuffer = corrected.buffer;
            correctedAsset = corrected.asset;
        }
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_REVIEW_CALL_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation,
            progress: 55,
            statusMessage: '긴 작업을 안전하게 나눠 보정 포즈 검사를 이어갈게요.',
        });
        await assertJobActive(params.userId, params.jobId);
        const correctedQuality = applyAlphaIsolationEvidence(await reviewPose({
            apiKey: params.apiKey,
            model: params.model,
            fallbackModels: params.fallbackModels,
            reasoningEffort: params.reasoningEffort,
            sourceImageUrl: params.sourceImageUrl,
            originalUserInstruction: params.request.instruction,
            additionalReferenceUrls: params.request.resourceMode === 'efficient'
                ? efficientIdentityReviewReferences(
                    params.identityReferenceUrl,
                    params.additionalReferenceUrls,
                )
                : params.additionalReferenceUrls,
            generatedImageUrl: correctedAsset.url,
            plan: params.plan,
        }), await inspectEmoticonAlphaIsolation(correctedPoseBuffer));
        const originalAccepted = !needsPoseIsolationCorrection(quality, isDynamicRender(params.plan));
        const correctedAccepted = !needsPoseIsolationCorrection(correctedQuality, isDynamicRender(params.plan));
        if (
            (correctedAccepted && !originalAccepted)
            || (correctedAccepted === originalAccepted && qualityScore(correctedQuality) >= qualityScore(quality))
        ) {
            selectedPoseBuffer = correctedPoseBuffer;
            selectedAsset = correctedAsset;
            quality = correctedQuality;
        }
        continuation = { stage: 'static-render', retryCount: continuation.retryCount };
        await params.update({
            keyPoseUrl: selectedAsset.url,
            keyPoseStoragePath: selectedAsset.storagePath,
            quality,
            frameContinuation: { ...continuation, state: 'checkpointed' },
            resumeAvailable: true,
        });
    }

    if (!quality) throw new Error('The key pose quality checkpoint is unavailable.');
    if (needsPoseIsolationCorrection(quality, isDynamicRender(params.plan))) {
        throw new Error(
            'The generated key pose failed subject-fidelity or isolated-character acceptance after correction. '
            + 'The requested action or emotion was unclear, or identity, background, duplicate-part, or occlusion defects remained.',
        );
    }

    if (!isDynamicRender(params.plan)) {
        await ensureContinuationBudget({
            deadlineAtMs: params.deadlineAtMs,
            minimumRemainingMs: MIN_RENDER_BUDGET_MS,
            userId: params.userId,
            jobId: params.jobId,
            continuation: { stage: 'static-render', retryCount: continuation.retryCount },
            progress: 60,
            statusMessage: '긴 작업을 안전하게 나눠 최종 파일 조립을 이어갈게요.',
        });
    }
    await params.update({
        status: 'rendering',
        progress: 60,
        statusMessage: '표정·말풍선·반복 움직임을 조립하고 있어요',
        keyPoseUrl: selectedAsset.url,
        keyPoseStoragePath: selectedAsset.storagePath,
        quality,
    });
    const rendered = await renderOutputs({
        apiKey: params.apiKey,
        model: params.model,
        imageModel: params.imageModel,
        fallbackModels: params.fallbackModels,
        reasoningEffort: params.reasoningEffort,
        sourceImageUrl: params.sourceImageUrl,
        originalUserInstruction: params.request.instruction,
        identityReferenceUrl: params.identityReferenceUrl,
        additionalReferenceUrls: params.additionalReferenceUrls,
        userId: params.userId,
        jobId: params.jobId,
        plan: params.plan,
        resourceMode: params.request.resourceMode,
        outputProfile: params.outputProfile,
        poseBuffer: selectedPoseBuffer,
        poseStoragePath: selectedAsset.storagePath,
        poseUrl: selectedAsset.url,
        formats: params.request.formats,
        update: params.update,
        deadlineAtMs: params.deadlineAtMs,
    });
    const finalQuality = rendered.motionQuality || quality;
    await params.update({
        status: 'rendering',
        progress: 88,
        statusMessage: '선택한 파일 형식으로 마무리하고 있어요',
    });
    assertRenderedFilesPassedInspection(rendered.files);
    const outputs = await uploadRenderedFiles({
        userId: params.userId,
        jobId: params.jobId,
        files: rendered.files,
    });
    await params.update({
        status: 'completed',
        progress: 100,
        statusMessage: '이모티콘이 완성됐어요',
        plan: params.plan,
        quality: finalQuality,
        keyPoseUrl: selectedAsset.url,
        keyPoseStoragePath: selectedAsset.storagePath,
        ...(rendered.animationFrames ? { animationFrames: rendered.animationFrames } : {}),
        ...(rendered.compositedFrames ? { compositedFrames: rendered.compositedFrames } : {}),
        outputs,
        outputProfile: params.outputProfile,
        specReport: buildSpecReport({
            plan: params.plan,
            outputProfile: params.outputProfile,
            files: rendered.files,
        }),
        analysisReused: params.analysisReused,
        motionFallbackReason: rendered.motionFallbackReason,
        resumeAvailable: false,
        'frameContinuation.state': 'completed',
        completedAt: FieldValue.serverTimestamp(),
    });
    await syncCompletedProjectItemNonFatal({
        userId: params.userId,
        jobId: params.jobId,
        request: params.request,
        jobCreatedAtMs: params.jobCreatedAtMs,
    });
    logger.info('[EmoticonStudio] Job completed.', {
        userId: params.userId,
        jobId: params.jobId,
        formats: params.request.formats,
        renderMode: params.plan.action.renderMode,
    });
}

async function runAnalysisPipeline(params: {
    apiKey: string;
    model: string;
    imageModel?: string;
    fallbackModels: string[];
    reasoningEffort?: 'low';
    userId: string;
    jobId: string;
    request: EmoticonJobRequest;
    sourceImageUrl: string;
    identityReferenceUrl?: string;
    sourceStoragePath: string;
    sourceFingerprint: string;
    referenceSetFingerprint: string;
    identityFingerprint: string;
    additionalReferenceUrls: string[];
    update: (data: Record<string, unknown>) => Promise<void>;
    deadlineAtMs: number;
    jobCreatedAtMs: number;
    continuation?: PipelineContinuationState;
}): Promise<void> {
    const continuation = params.continuation || { stage: 'analysis', retryCount: 0 };
    await params.update({
        status: 'analyzing',
        progress: 8,
        statusMessage: '캐릭터 특징과 요청한 행동을 살펴보고 있어요',
        error: null,
        analysisReused: false,
        sourceImageUrl: params.sourceImageUrl,
        sourceCanonicalStoragePath: params.sourceStoragePath,
        sourceFingerprint: params.sourceFingerprint,
        referenceSetFingerprint: params.referenceSetFingerprint,
        canonicalReferenceUrls: params.additionalReferenceUrls,
        ...(params.identityReferenceUrl
            ? { canonicalIdentityReferenceUrl: params.identityReferenceUrl }
            : {}),
        identityFingerprint: params.identityFingerprint,
        identityFingerprintVersion: EMOTICON_IDENTITY_FINGERPRINT_VERSION,
        frameContinuation: { ...continuation, state: 'checkpointed' },
        resumeAvailable: true,
    });
    const cachedAnalysis = params.request.mode === 'plan'
        ? null
        : await loadCharacterAnalysisCache(
            params.userId,
            params.request.sourceStoragePath,
            params.identityFingerprint,
            1 + params.additionalReferenceUrls.length,
        );
    if (cachedAnalysis) await params.update({ analysisReused: true });
    await ensureContinuationBudget({
        deadlineAtMs: params.deadlineAtMs,
        minimumRemainingMs: MIN_REVIEW_CALL_BUDGET_MS,
        userId: params.userId,
        jobId: params.jobId,
        continuation,
        progress: 8,
        statusMessage: '긴 작업을 안전하게 나눠 캐릭터 분석부터 이어갈게요.',
    });
    await assertJobActive(params.userId, params.jobId);
    const analyzedPlan = await analyzeEmoticonDirection({
        apiKey: params.apiKey,
        model: params.model,
        fallbackModels: params.fallbackModels,
        sourceImageUrl: params.sourceImageUrl,
        additionalReferenceUrls: params.additionalReferenceUrls,
        instruction: params.request.instruction,
        motionPreference: params.request.motionPreference,
        templateRequest: params.request.templateRequest,
        templateItemCount: params.request.templateItemCount,
        knownCharacterProfile: cachedAnalysis?.characterProfile,
        knownSuggestedPresets: cachedAnalysis?.suggestedPresets,
        resourceMode: params.request.resourceMode,
        reasoningEffort: params.reasoningEffort,
    });
    if (!cachedAnalysis && params.request.mode !== 'plan') {
        await saveCharacterAnalysisCache({
            userId: params.userId,
            sourceStoragePath: params.request.sourceStoragePath,
            sourceFingerprint: params.sourceFingerprint,
            referenceSetFingerprint: params.referenceSetFingerprint,
            identityFingerprint: params.identityFingerprint,
            plan: analyzedPlan,
        }).catch((error) => {
            logger.warn('[EmoticonStudio] Character analysis cache could not be saved.', {
                userId: params.userId,
                jobId: params.jobId,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }
    const efficientDefaultMotion = (
        params.request.resourceMode === 'efficient'
        && params.request.mode === 'generate'
        && params.request.outputProfile?.type !== 'static'
        && !params.request.motionOverride
    ) ? { fps: 8, frameCount: 8, durationMs: 1000 } : undefined;
    const motionPlan = applyEmoticonMotionOverride(
        analyzedPlan,
        params.request.motionOverride || efficientDefaultMotion,
    );
    const configuredPlan = {
        ...(params.request.bubbleOverride
            ? { ...motionPlan, bubble: params.request.bubbleOverride }
            : motionPlan),
        ...(params.request.bubbleLayersOverride
            ? { bubbleLayers: params.request.bubbleLayersOverride }
            : {}),
    };
    const outputProfile = resolveEmoticonOutputProfile(params.request.outputProfile);
    const plan = normalizeEmoticonPlanForOutputProfile(configuredPlan, outputProfile);
    if (params.request.mode === 'plan') {
        const plannedCount = params.request.templateItemCount;
        if (!params.request.templateRequest || !plannedCount) {
            throw new Error('A project composition request and item count are required.');
        }
        if (plan.suggestedPresets.length !== plannedCount) {
            throw new Error('OpenRouter did not return the requested number of project items.');
        }
        await params.update({
            status: 'completed',
            progress: 100,
            statusMessage: '요청한 프로젝트 구성안을 만들었어요. 검토 후 적용해 주세요.',
            plan,
            outputProfile,
            analysisReused: false,
            resumeAvailable: false,
            'frameContinuation.state': 'completed',
            completedAt: FieldValue.serverTimestamp(),
        });
        await syncCompletedProjectItemNonFatal({
            userId: params.userId,
            jobId: params.jobId,
            request: params.request,
            jobCreatedAtMs: params.jobCreatedAtMs,
        });
        return;
    }
    const next: PipelineContinuationState = {
        stage: 'pose-generation',
        retryCount: continuation.retryCount,
    };
    await params.update({
        plan,
        outputProfile,
        frameContinuation: { ...next, state: 'checkpointed' },
        resumeAvailable: true,
    });
    await runPostAnalysisPipeline({
        ...params,
        plan,
        outputProfile,
        analysisReused: Boolean(cachedAnalysis),
        continuation: next,
    });
}

async function requireEmoticonRecoveryAdmin(
    uid: string,
    token: Record<string, unknown>,
): Promise<void> {
    const allowList = (process.env.ADMIN_UIDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (token.admin === true || token.role === 'admin' || allowList.includes(uid)) return;
    const [adminDocument, accessDocument] = await Promise.all([
        db.collection('admins').doc(uid).get(),
        db.collection('userAccess').doc(uid).get(),
    ]);
    if (adminDocument.exists || accessDocument.data()?.role === 'admin') return;
    throw new HttpsError('permission-denied', '관리자만 이모티콘 작업을 복구할 수 있습니다.');
}

function recoverySkipError(reason: EmoticonRecoverySkipReason): HttpsError {
    if (reason === 'not-found') {
        return new HttpsError('not-found', '복구할 이모티콘 작업을 찾을 수 없습니다.');
    }
    if (reason === 'owner-mismatch') {
        return new HttpsError('permission-denied', '이 작업을 복구할 권한이 없습니다.');
    }
    if (reason === 'cancelled') {
        return new HttpsError('failed-precondition', '취소된 작업은 복구할 수 없습니다.');
    }
    if (reason === 'terminal') {
        return new HttpsError('failed-precondition', '이미 종료된 작업은 중단 복구 대상이 아닙니다.');
    }
    if (reason === 'deferred') {
        return new HttpsError('failed-precondition', '비용 보호 대기열에 예약된 작업은 순서가 되면 자동 시작합니다.');
    }
    if (reason === 'batch-concurrency') {
        return new HttpsError('failed-precondition', '배치 동시 실행 슬롯이 비면 작업이 자동으로 복구됩니다.');
    }
    if (reason === 'missing-execution-authorization') {
        return new HttpsError(
            'failed-precondition',
            '서버 비용 승인 또는 요청 제한 예약이 없어 자동 복구를 중단했습니다. 새 작업을 만들어 주세요.',
        );
    }
    if (reason === 'invalid-batch-execution') {
        return new HttpsError('failed-precondition', '배치 또는 프로젝트 실행 경계가 변경되어 작업을 복구할 수 없습니다.');
    }
    if (reason === 'missing-checkpoint') {
        return new HttpsError('failed-precondition', '안전하게 이어갈 체크포인트가 없어 자동 복구를 중단했습니다.');
    }
    if (reason === 'invalid-request') {
        return new HttpsError('failed-precondition', '저장된 작업 요청을 안전하게 복구할 수 없습니다.');
    }
    if (reason === 'existing-continuation') {
        return new HttpsError('failed-precondition', '기존 이어서 만들기 요청을 확인 중입니다. 잠시 기다려 주세요.');
    }
    if (reason === 'stale-project-item-lease') {
        return new HttpsError('failed-precondition', '프로젝트 항목을 다른 작업이 사용 중이어서 이 작업은 재개하지 않습니다.');
    }
    return new HttpsError(
        'failed-precondition',
        '기존 서버 작업이 아직 실행 중일 수 있어 지금은 복구할 수 없습니다.',
    );
}

async function restoreRecoverableCostReservation(userId: string, jobId: string): Promise<void> {
    const jobRef = db.doc(`users/${userId}/emoticonJobs/${jobId}`);
    const rateLimitRef = db.doc(`emoticonStudioRateLimits/${userId}`);
    const nowMs = Date.now();
    await db.runTransaction(async (transaction) => {
        const [jobSnapshot, rateLimitSnapshot] = await Promise.all([
            transaction.get(jobRef),
            transaction.get(rateLimitRef),
        ]);
        if (!jobSnapshot.exists) throw new HttpsError('not-found', '이어 만들 작업을 찾을 수 없습니다.');
        const job = jobSnapshot.data() || {};
        if (job.userId !== userId) throw new HttpsError('permission-denied', '이 작업을 이어 만들 권한이 없습니다.');
        if (
            job.status !== 'failed'
            || job.resumeAvailable !== true
            || !['openrouter-credits', 'checkpoint-error'].includes(String(job.recoverableFailure))
        ) return;
        // Terminal bookkeeping must finish before the version-specific guard
        // is restored. For v3 this prevents a second full authorization; v4
        // simply reopens the per-request gate.
        if (!job.costReservationSettledAt) return;
        if (job.costControlVersion === EMOTICON_COST_CONTROL_VERSION) {
            const validAuthorization = typeof job.openRouterAuthorizedCostUsd === 'number'
                && Number.isFinite(job.openRouterAuthorizedCostUsd)
                && job.openRouterAuthorizedCostUsd >= 0;
            const validDailyLimit = typeof job.openRouterDailyCostLimitUsd === 'number'
                && Number.isFinite(job.openRouterDailyCostLimitUsd)
                && job.openRouterDailyCostLimitUsd > 0;
            if (!validAuthorization || !validDailyLimit) {
                throw new HttpsError(
                    'failed-precondition',
                    'The per-request OpenRouter cost gate is incomplete.',
                );
            }
            // Version 4 never re-reserves a future-day worst-case ceiling.
            // The next provider call atomically checks the remaining job cap
            // and the live Korea-day actual + inflight aggregate.
            transaction.update(jobRef, {
                costReservationSettledAt: FieldValue.delete(),
                costReservationAccountedUsd: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return;
        }
        if (job.costControlVersion !== LEGACY_EMOTICON_COST_CONTROL_VERSION) {
            throw new HttpsError(
                'failed-precondition',
                'The OpenRouter cost control version is not recoverable.',
            );
        }
        const authorizedUsd = typeof job.openRouterAuthorizedCostUsd === 'number'
            ? Math.max(0, job.openRouterAuthorizedCostUsd)
            : 0;
        const accountedUsd = typeof job.costReservationAccountedUsd === 'number'
            ? Math.max(0, job.costReservationAccountedUsd)
            : typeof job.openRouterActualCostUsd === 'number'
                ? Math.max(0, job.openRouterActualCostUsd)
                : 0;
        const requestedUsd = Math.max(0, authorizedUsd - accountedUsd);
        if (requestedUsd <= 0) return;
        const rateLimit = rateLimitSnapshot.data() || {};
        const allocation = allocateEmoticonCostReservation({
            nowMs,
            dailyLimitUsd: EMOTICON_COST_LIMITS.dailyUsd,
            requestedUsd,
            state: {
                dayBucket: rateLimit.costReservationDayBucket as number | undefined,
                reservedUsd: rateLimit.costReservedUsd as number | undefined,
                reservationsByDay: rateLimit.costReservationsByDay as Record<string, number> | undefined,
            },
        });
        if (allocation.executeAtMs > nowMs + 2_000) {
            throw new HttpsError(
                'resource-exhausted',
                '오늘 비용 보호 한도 때문에 지금은 이어 만들 수 없습니다. 다음 예약 시간 이후 다시 시도해 주세요.',
            );
        }
        transaction.set(rateLimitRef, {
            userId,
            costReservationDayBucket: allocation.state.dayBucket,
            costReservedUsd: allocation.state.reservedUsd,
            costReservationsByDay: allocation.state.reservationsByDay,
            costReservationVersion: LEGACY_EMOTICON_COST_CONTROL_VERSION,
            dailyCostLimitUsd: EMOTICON_COST_LIMITS.dailyUsd,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.update(jobRef, {
            openRouterCostReservationDayBucket: allocation.state.dayBucket,
            costReservationSettledAt: FieldValue.delete(),
            costReservationAccountedUsd: FieldValue.delete(),
            costControlVersion: LEGACY_EMOTICON_COST_CONTROL_VERSION,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

/**
 * Resumes one stale job in place. This callable deliberately does not create a
 * second generation job: the existing project-item lease remains authoritative
 * and the latest durable checkpoint is resumed through the normal continuation
 * trigger. A deterministic transaction makes repeated clicks idempotent.
 */
export const recoverStalledEmoticonJob = onCall(
    {
        region: 'asia-northeast3',
        timeoutSeconds: 30,
        memory: '256MiB',
        maxInstances: 20,
    },
    async (request) => {
        const userId = request.auth?.uid;
        if (!userId) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
        await requireEmoticonRecoveryAdmin(
            userId,
            (request.auth?.token || {}) as Record<string, unknown>,
        );
        const jobId = typeof request.data?.jobId === 'string'
            ? request.data.jobId.trim()
            : '';
        if (!/^[A-Za-z0-9_-]{1,160}$/.test(jobId)) {
            throw new HttpsError('invalid-argument', '복구할 작업 번호가 올바르지 않습니다.');
        }

        await restoreRecoverableCostReservation(userId, jobId);
        const recovery = await recoverStalledEmoticonJobInPlace({ userId, jobId });
        if (recovery.outcome === 'skipped') throw recoverySkipError(recovery.reason);
        logger.info('[EmoticonStudio] Stalled job recovery requested.', {
            userId,
            jobId,
            outcome: recovery.outcome,
        });
        return recovery;
    },
);

export const onEmoticonJobCreated = onDocumentCreated(triggerConfig, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const userId = event.params.userId;
    const jobId = event.params.jobId;
    return runWithOpenRouterUsageContext({ userId, jobId, stage: 'job' }, async () => {
    const deadlineAtMs = Date.now() + CONTINUATION_WORK_BUDGET_MS;
    const jobCreatedAtMs = timestampToMillis(snapshot.data().createdAt);
    let activeRunToken: string | null = null;
    const update = async (data: Record<string, unknown>) => {
        if (!activeRunToken) throw new Error('The emoticon job worker has not claimed its lease.');
        await updateActiveJob(userId, jobId, data, { generationRunToken: activeRunToken });
    };
    let linkedProjectRequest: EmoticonJobRequest | null = null;

    try {
        const parsed = emoticonJobRequestSchema.safeParse(snapshot.data());
        if (!parsed.success) {
            throw new Error(`Invalid emoticon job: ${parsed.error.issues[0]?.message || 'unknown error'}`);
        }
        if (parsed.data.userId && parsed.data.userId !== userId) {
            throw new Error('The job user does not match its document owner.');
        }
        linkedProjectRequest = parsed.data;
        updateOpenRouterUsageContext({
            projectId: parsed.data.projectId,
            batchId: parsed.data.batchId,
            stage: parsed.data.mode,
        });
        const expectedSourcePrefix = `users/${userId}/emoticon-studio/sources/`;
        if (!parsed.data.sourceStoragePath.startsWith(expectedSourcePrefix)) {
            throw new Error('The source image does not belong to this user.');
        }
        if (parsed.data.referenceImages.some((reference) => (
            !reference.sourceStoragePath.startsWith(expectedSourcePrefix)
        ))) {
            throw new Error('A character reference image does not belong to this user.');
        }
        const resolvedPlatformPolicy = await resolveEmoticonGenerationPolicy({
            outputProfile: parsed.data.outputProfile,
            formats: parsed.data.formats,
        });
        parsed.data.outputProfile = resolvedPlatformPolicy.outputProfile;
        parsed.data.formats = resolvedPlatformPolicy.formats;
        activeRunToken = await claimInitialJobRun(userId, jobId);
        if (!activeRunToken) {
            if (await isJobCancellationRequested(userId, jobId)) {
                await finalizeJobCancellation(userId, jobId);
                await syncLinkedProjectItem({
                    userId,
                    jobId,
                    request: parsed.data,
                    generationStatus: 'planned',
                    jobCreatedAtMs,
                }).catch(() => undefined);
                logger.info('[EmoticonStudio] Cancelled a queued job before execution.', {
                    userId,
                    jobId,
                });
                return;
            }
            logger.info('[EmoticonStudio] Ignored a duplicate or already-started job delivery.', {
                userId,
                jobId,
            });
            return;
        }
        await assertJobActive(userId, jobId);
        await assertLinkedProjectItemClaim({ userId, jobId, request: parsed.data });
        if (resolvedPlatformPolicy.source === 'firestore') {
            await update({
                outputProfile: resolvedPlatformPolicy.outputProfile,
                formats: resolvedPlatformPolicy.formats,
                platformPolicyResolution: {
                    schemaVersion: 1,
                    policyId: resolvedPlatformPolicy.policyId,
                    revision: resolvedPlatformPolicy.revision,
                    source: 'firestore',
                    resolvedAt: FieldValue.serverTimestamp(),
                },
            });
        }
        if (parsed.data.mode === 'import_frames') {
            await syncLinkedProjectItem({
                userId,
                jobId,
                request: parsed.data,
                generationStatus: 'generating',
                jobCreatedAtMs,
            });
            await renderImportedFramesJob({
                userId,
                jobId,
                request: parsed.data,
                update,
            });
            await syncCompletedProjectItemNonFatal({
                userId,
                jobId,
                request: parsed.data,
                jobCreatedAtMs,
            });
            logger.info('[EmoticonStudio] Manual frame import completed without AI or provider quota use.', {
                userId,
                jobId,
                frameCount: parsed.data.manualImport?.frames.length,
                formats: parsed.data.formats,
            });
            return;
        }
        const reservation = await reserveRateLimitSlot({
            userId,
            jobId,
            mode: parsed.data.mode,
            requestedFrameCount: parsed.data.motionOverride?.frameCount
                ?? (
                    parsed.data.resourceMode === 'efficient'
                    && parsed.data.outputProfile?.type !== 'static'
                    && parsed.data.mode === 'generate'
                        ? 8
                        : undefined
                ),
            outputType: parsed.data.outputProfile?.type,
            resourceMode: parsed.data.resourceMode,
            aiGenerationProfile: parsed.data.aiGenerationProfile,
        });
        if (reservation.deferred) {
            await deferJobUntilReservedSlot({
                userId,
                jobId,
                executeAtMs: reservation.executeAtMs,
                mode: parsed.data.mode,
                reason: 'rate_limit',
                batchId: parsed.data.batchId,
                projectId: parsed.data.projectId,
                projectItemId: parsed.data.projectItemId,
            });
            logger.info('[EmoticonStudio] Job reserved for a later cost-protected slot.', {
                userId,
                jobId,
                mode: parsed.data.mode,
                executeAtMs: reservation.executeAtMs,
            });
            return;
        }
        const batchSlot = await claimEmoticonBatchExecutionSlot({
            userId,
            jobId,
            batchId: parsed.data.batchId,
            projectId: parsed.data.projectId,
            projectItemId: parsed.data.projectItemId,
        });
        if (batchSlot === 'deferred') {
            const executeAtMs = Date.now() + 30_000;
            await deferJobUntilReservedSlot({
                userId,
                jobId,
                executeAtMs,
                mode: parsed.data.mode,
                reason: 'batch_concurrency',
                batchId: parsed.data.batchId,
                projectId: parsed.data.projectId,
                projectItemId: parsed.data.projectItemId,
            });
            logger.info('[EmoticonStudio] Job deferred by the persisted batch concurrency limit.', {
                userId,
                jobId,
                batchId: parsed.data.batchId,
                executeAtMs,
            });
            return;
        }
        await syncLinkedProjectItem({
            userId,
            jobId,
            request: parsed.data,
            generationStatus: 'generating',
            jobCreatedAtMs,
        });
        if (parsed.data.mode === 'rerender') {
            await rerenderExistingJob({
                userId,
                jobId,
                request: parsed.data,
                update,
            });
            await syncCompletedProjectItemNonFatal({
                userId,
                jobId,
                request: parsed.data,
                jobCreatedAtMs,
            });
            logger.info('[EmoticonStudio] No-cost rerender completed.', {
                userId,
                jobId,
                parentJobId: parsed.data.parentJobId,
                formats: parsed.data.formats,
            });
            return;
        }

        if (
            parsed.data.mode === 'generate'
            && parsed.data.resourceMode === 'efficient'
            && parsed.data.aiGenerationProfile !== EMOTICON_GPT_LIGHT_PROFILE
        ) {
            const preparedSource = await prepareCanonicalSource({
                userId,
                jobId,
                sourceStoragePath: parsed.data.sourceStoragePath,
            });
            await renderEfficientCompositeJob({
                userId,
                jobId,
                request: parsed.data,
                preparedSource,
                update,
            });
            await syncCompletedProjectItemNonFatal({
                userId,
                jobId,
                request: parsed.data,
                jobCreatedAtMs,
            });
            logger.info('[EmoticonStudio] Zero-provider local composite completed.', {
                userId,
                jobId,
                frameCount: parsed.data.outputProfile?.type === 'static'
                    ? 1
                    : parsed.data.motionOverride?.frameCount || 8,
                formats: parsed.data.formats,
            });
            return;
        }

        const runtime = await resolveEmoticonAiRuntime({
            job: snapshot.data(),
            resourceMode: parsed.data.resourceMode,
            aiGenerationProfile: parsed.data.aiGenerationProfile,
            update,
        });
        if (!runtime.openRouterApiKey) throw new Error('OPENROUTER_API_KEY is not configured.');

        if (parsed.data.mode === 'repair_frame') {
            await repairExistingDynamicFrame({
                userId,
                jobId,
                request: parsed.data,
                apiKey: runtime.openRouterApiKey,
                model: runtime.model,
                imageModel: runtime.imageModel,
                fallbackModels: runtime.fallbackModels,
                reasoningEffort: runtime.reasoningEffort,
                update,
                jobCreatedAtMs,
                deadlineAtMs,
            });
            logger.info('[EmoticonStudio] Bounded single-frame repair completed.', {
                userId,
                jobId,
                parentJobId: parsed.data.parentJobId,
                frameIndex: parsed.data.repairFrameIndex,
            });
            return;
        }

        const preparedSource = await prepareCanonicalSource({
            userId,
            jobId,
            sourceStoragePath: parsed.data.sourceStoragePath,
        });
        const canonicalSource = preparedSource.asset;
        const canonicalReferenceSet = await prepareCanonicalReferenceSet({
            userId,
            jobId,
            sourceStoragePath: parsed.data.sourceStoragePath,
            references: parsed.data.referenceImages,
        });
        const identityFingerprint = buildEmoticonIdentityFingerprint({
            normalizedSourceFingerprint: preparedSource.fingerprint,
            referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
        });
        if (parsed.data.mode === 'profile' || parsed.data.mode === 'sheet_plan') {
            await runCharacterProfilePlanningPipeline({
                apiKey: runtime.openRouterApiKey,
                model: runtime.model,
                fallbackModels: runtime.fallbackModels,
                reasoningEffort: runtime.reasoningEffort,
                userId,
                jobId,
                request: parsed.data,
                sourceImageUrl: canonicalSource.url,
                sourceStoragePath: canonicalSource.storagePath,
                sourceFingerprint: preparedSource.fingerprint,
                referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
                identityFingerprint,
                additionalReferenceUrls: canonicalReferenceSet.urls,
                identityReferenceUrl: canonicalReferenceSet.identitySheetUrl,
                update,
            });
            logger.info('[EmoticonStudio] Character profile planning job completed.', {
                userId,
                jobId,
                mode: parsed.data.mode,
                analysisReused: parsed.data.mode === 'sheet_plan',
            });
            return;
        }
        await runAnalysisPipeline({
            apiKey: runtime.openRouterApiKey,
            model: runtime.model,
            imageModel: runtime.imageModel,
            fallbackModels: runtime.fallbackModels,
            reasoningEffort: runtime.reasoningEffort,
            userId,
            jobId,
            request: parsed.data,
            sourceImageUrl: canonicalSource.url,
            identityReferenceUrl: canonicalReferenceSet.identitySheetUrl,
            sourceStoragePath: canonicalSource.storagePath,
            sourceFingerprint: preparedSource.fingerprint,
            referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
            identityFingerprint,
            additionalReferenceUrls: canonicalReferenceSet.urls,
            update,
            deadlineAtMs,
            jobCreatedAtMs,
        });
    } catch (error) {
        if (error instanceof EmoticonStaleWorkerError) {
            logger.info('[EmoticonStudio] Stale worker stopped without settling job or project state.', {
                userId,
                jobId,
            });
            return;
        }
        if (
            error instanceof EmoticonJobCancelledError
            || await isJobCancellationRequested(userId, jobId).catch(() => false)
        ) {
            await finalizeJobCancellation(userId, jobId).catch(() => false);
            if (linkedProjectRequest) {
                await syncLinkedProjectItem({
                    userId,
                    jobId,
                    request: linkedProjectRequest,
                    generationStatus: 'planned',
                    jobCreatedAtMs,
                }).catch(() => undefined);
            }
            logger.info('[EmoticonStudio] Job cancelled by the user.', { userId, jobId });
            return;
        }
        if (error instanceof EmoticonStaleProjectItemClaimError) {
            await update({
                status: 'failed',
                progress: 100,
                statusMessage: '다른 작업이 이 프로젝트 항목을 먼저 사용하고 있어요.',
                error: '이 작업은 항목 선점에 실패해 AI를 호출하지 않고 종료됐어요.',
                resumeAvailable: false,
                failedAt: FieldValue.serverTimestamp(),
            }).catch(() => undefined);
            logger.warn('[EmoticonStudio] Stale project item claim rejected before provider use.', {
                userId,
                jobId,
            });
            return;
        }
        if (error instanceof EmoticonProjectDeletionLockedError) {
            await update({
                status: 'failed',
                progress: 100,
                statusMessage: '프로젝트 삭제가 진행 중이라 작업을 시작하지 않았어요.',
                error: '삭제 잠금이 확인되어 AI 호출 전에 안전하게 종료했습니다.',
                resumeAvailable: false,
                failedAt: FieldValue.serverTimestamp(),
            }).catch(() => undefined);
            logger.info('[EmoticonStudio] Refused a job for a deletion-locked project.', {
                userId,
                jobId,
                projectId: linkedProjectRequest?.projectId,
            });
            return;
        }
        if (error instanceof EmoticonContinuationScheduledError) {
            logger.info('[EmoticonStudio] Job checkpointed for automatic continuation.', {
                userId,
                jobId,
            });
            return;
        }
        const retryScheduled = await retryContinuationAfterTransient({
            error,
            userId,
            jobId,
        }).catch((retryError) => {
            logger.error('[EmoticonStudio] Could not schedule a transient retry.', {
                userId,
                jobId,
                error: retryError instanceof Error ? retryError.message : String(retryError),
            });
            return false;
        });
        if (retryScheduled) {
            logger.warn('[EmoticonStudio] Transient failure checkpointed for an automatic retry.', {
                userId,
                jobId,
            });
            return;
        }
        if (error instanceof OpenRouterDailyCostLimitError || isOpenRouterCreditError(error)) {
            const dailyLimitReached = error instanceof OpenRouterDailyCostLimitError;
            await update({
                status: 'failed',
                progress: 100,
                statusMessage: dailyLimitReached
                    ? '오늘 비용 보호 한도에 도달했어요. 자정 이후 저장된 단계부터 이어 만들 수 있어요.'
                    : 'OpenRouter 크레딧을 충전하면 저장된 단계부터 이어 만들 수 있어요.',
                error: safeErrorMessage(error),
                resumeAvailable: true,
                recoverableFailure: dailyLimitReached ? 'checkpoint-error' : 'openrouter-credits',
                ...(dailyLimitReached
                    ? { dailyCostPausedAt: FieldValue.serverTimestamp() }
                    : { creditPausedAt: FieldValue.serverTimestamp() }),
                'frameContinuation.state': 'checkpointed',
                failedAt: FieldValue.serverTimestamp(),
            }).catch(() => undefined);
            logger.warn('[EmoticonStudio] Job paused at its durable checkpoint for OpenRouter cost protection.', {
                userId,
                jobId,
                dailyLimitReached,
            });
            return;
        }
        if (
            linkedProjectRequest?.mode === 'generate'
            && isDefiniteImageRouteCompatibilityError(error)
        ) {
            const message = safeErrorMessage(error);
            await update({
                status: 'failed',
                progress: 100,
                statusMessage: '이미지 제공자 옵션을 안전 모드로 바꾼 뒤 이어 만들 수 있어요',
                error: message,
                resumeAvailable: true,
                recoverableFailure: 'checkpoint-error',
                failureCode: 'image-provider-compatibility',
                failureStage: 'image-generation',
                retryStrategy: 'resume-in-place',
                'frameContinuation.state': 'checkpointed',
                failedAt: FieldValue.serverTimestamp(),
            }).catch(() => undefined);
            logger.warn('[EmoticonStudio] Image provider compatibility failure checkpointed.', {
                userId,
                jobId,
                error: error instanceof Error ? error.message : String(error),
            });
            return;
        }
        logger.error('[EmoticonStudio] Job failed.', {
            userId,
            jobId,
            error: error instanceof Error ? error.message : String(error),
        });
        const providerTimeout = isAmbiguousImageGenerationTimeout(error);
        const renderFailureRecovery = providerTimeout
            ? null
            : await buildRenderFailureRecoveryMarker({
                userId,
                jobId,
                error,
            }).catch(() => null);
        const failureMessage = providerTimeout
            ? '이미지 공급자가 4분 안에 응답하지 않았어요. 느린 공급 경로는 자동으로 제외했으며, 비용 확인을 위해 같은 요청을 자동 반복하지 않았습니다.'
            : renderFailureRecovery
                ? '파일 조립 중 일시적인 문제가 생겼습니다. 저장된 프레임부터 다시 이어 만들 수 있어요.'
                : safeErrorMessage(error);
        await update({
            status: 'failed',
            progress: 100,
            statusMessage: providerTimeout
                ? '느린 이미지 공급 경로를 제외했어요. 다른 경로로 다시 생성할 수 있습니다.'
                : renderFailureRecovery
                    ? '파일 조립이 일시 중단됐어요. 저장된 프레임부터 다시 이어 만들 수 있어요.'
                    : '작업을 완료하지 못했어요',
            error: failureMessage,
            resumeAvailable: Boolean(renderFailureRecovery),
            ...(providerTimeout
                ? {
                    failureCode: 'image-provider-timeout',
                    failureStage: 'image-generation',
                    retryStrategy: 'new-job',
                    timedOutProviderQuarantined: true,
                }
                : {}),
            ...(renderFailureRecovery
                ? {
                    recoverableFailure: 'checkpoint-error',
                    failureCode: 'render-infrastructure',
                    failureStage: 'render',
                    retryStrategy: 'resume-in-place',
                }
                : {}),
            ...(renderFailureRecovery ? { renderFailureRecovery } : {}),
            'frameContinuation.state': renderFailureRecovery ? 'checkpointed' : 'failed',
            failedAt: FieldValue.serverTimestamp(),
        }).catch((updateError) => {
            logger.error('[EmoticonStudio] Failed to persist job error.', {
                userId,
                jobId,
                updateError: updateError instanceof Error ? updateError.message : String(updateError),
            });
        });
        if (linkedProjectRequest) {
            await syncLinkedProjectItem({
                userId,
                jobId,
                request: linkedProjectRequest,
                generationStatus: 'failed',
                validationErrors: [failureMessage],
                jobCreatedAtMs,
            }).catch((syncError) => {
                logger.error('[EmoticonStudio] Project item status sync failed.', {
                    userId,
                    jobId,
                    error: syncError instanceof Error ? syncError.message : String(syncError),
                });
            });
        }
    }
    });
});

export const onEmoticonJobCancellationRequested = onDocumentUpdated(
    cancellationTriggerConfig,
    async (event) => {
        const before = event.data?.before.data() || {};
        const after = event.data?.after.data() || {};
        if (before.cancelRequestedAt || !after.cancelRequestedAt) return;
        const userId = event.params.userId;
        const jobId = event.params.jobId;
        if (!isSafeFirebaseUid(userId) || !/^[A-Za-z0-9_-]{1,160}$/.test(jobId)) return;
        const cancelled = await finalizeJobCancellation(userId, jobId);
        if (!cancelled) return;
        const request = emoticonJobRequestSchema.safeParse({ ...after, status: 'queued' });
        if (request.success) {
            await syncLinkedProjectItem({
                userId,
                jobId,
                request: request.data,
                generationStatus: 'planned',
                jobCreatedAtMs: timestampToMillis(after.createdAt),
            }).catch((error) => {
                logger.warn('[EmoticonStudio] Cancelled project item could not be reset.', {
                    userId,
                    jobId,
                    error: error instanceof Error ? error.message : String(error),
                });
            });
        }
        logger.info('[EmoticonStudio] Cancellation request finalized.', { userId, jobId });
    },
);

export const onEmoticonJobTerminalSettled = onDocumentUpdated(
    {
        ...cancellationTriggerConfig,
        retry: true,
    },
    async (event) => {
        const beforeStatus = String(event.data?.before.data()?.status || '');
        const afterStatus = String(event.data?.after.data()?.status || '');
        if (!TERMINAL_JOB_STATUSES.has(afterStatus) || TERMINAL_JOB_STATUSES.has(beforeStatus)) return;
        await settleTerminalJobCostReservation(event.params.userId, event.params.jobId);
    },
);

export const onEmoticonJobContinuationCreated = onDocumentCreated(
    continuationTriggerConfig,
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;
        const continuationRef = snapshot.ref;
        const rawContinuation = snapshot.data() || {};
        const parsedContinuationDocument = emoticonContinuationDocumentSchema.safeParse(rawContinuation);
        if (!parsedContinuationDocument.success) {
            await continuationRef.set({
                status: 'invalid',
                error: parsedContinuationDocument.error.issues[0]?.message || 'Invalid continuation identity.',
                expiresAt: continuationExpiresAt(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            return;
        }
        const {
            userId,
            jobId,
            token,
            runToken,
        } = parsedContinuationDocument.data;
        if (!isSafeFirebaseUid(userId)) {
            await continuationRef.set({
                status: 'invalid',
                error: 'Invalid continuation user identity.',
                expiresAt: continuationExpiresAt(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            return;
        }

        return runWithOpenRouterUsageContext({ userId, jobId, stage: 'continuation' }, async () => {

        const jobRef = db.doc(`users/${userId}/emoticonJobs/${jobId}`);
        const nowMs = Date.now();
        const claim = await db.runTransaction(async (transaction) => {
            const continuationSnapshot = await transaction.get(continuationRef);
            const jobSnapshot = await transaction.get(jobRef);
            if (!continuationSnapshot.exists) return 'stale' as const;
            const continuationData = continuationSnapshot.data() || {};
            if (['completed', 'continued', 'retried', 'failed', 'stale', 'invalid', 'cancelled'].includes(String(continuationData.status))) {
                return 'stale' as const;
            }
            if (!jobSnapshot.exists) {
                transaction.update(continuationRef, {
                    status: 'stale',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                return 'stale' as const;
            }
            const job = jobSnapshot.data() || {};
            const savedContinuation = job.frameContinuation && typeof job.frameContinuation === 'object'
                ? job.frameContinuation as Record<string, unknown>
                : {};
            if (job.status === 'cancelled' || job.cancelRequestedAt) {
                transaction.update(continuationRef, {
                    status: 'cancelled',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                if (job.status !== 'cancelled' || !job.cancelledAt) {
                    transaction.update(jobRef, cancellationUpdate(job));
                }
                return 'cancelled' as const;
            }
            if (
                savedContinuation.token !== token
                || job.generationRunToken !== runToken
                || job.userId !== userId
                || job.status === 'completed'
                || job.status === 'failed'
            ) {
                transaction.update(continuationRef, {
                    status: 'stale',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                return 'stale' as const;
            }
            const leaseExpiresAtMs = typeof continuationData.leaseExpiresAtMs === 'number'
                ? continuationData.leaseExpiresAtMs
                : 0;
            if (continuationData.status === 'running' && leaseExpiresAtMs > nowMs) {
                return 'busy' as const;
            }
            const savedStage = savedContinuation.stage as EmoticonContinuationState['stage'];
            const savedPoseQuality = emoticonQualitySchema.safeParse(job.quality);
            const savedPlan = emoticonStoredPlanSchema.safeParse(job.plan);
            const savedPoseAccepted = savedPoseQuality.success && (
                savedPlan.success && isDynamicRender(savedPlan.data)
                    ? meetsEmoticonDynamicKeyPoseAcceptance(savedPoseQuality.data)
                    : meetsEmoticonPoseAcceptance(savedPoseQuality.data)
            );
            const renderFailureRecoveryEligible = (
                savedStage === 'static-render'
                || savedStage === 'render'
            ) && savedPoseAccepted;
            const deliveryAttempts = typeof continuationData.attemptCount === 'number'
                ? continuationData.attemptCount
                : 0;
            if (deliveryAttempts >= MAX_CONTINUATION_DELIVERY_ATTEMPTS) {
                transaction.update(continuationRef, {
                    status: 'failed',
                    error: 'Continuation delivery retry limit exceeded.',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                transaction.update(jobRef, {
                    status: 'failed',
                    progress: 100,
                    statusMessage: '반복된 연결 문제로 작업을 중단했어요.',
                    error: '일시적인 연결 문제가 반복됐어요. 잠시 후 새 작업으로 다시 시도해 주세요.',
                    resumeAvailable: false,
                    ...(renderFailureRecoveryEligible
                        ? {
                            renderFailureRecovery: {
                                stage: 'render',
                                category: 'infrastructure',
                                poseAccepted: true,
                                markedAt: FieldValue.serverTimestamp(),
                            },
                        }
                        : {}),
                    'frameContinuation.state': 'failed',
                    failedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                return 'exhausted' as const;
            }
            transaction.update(continuationRef, {
                status: 'running',
                leaseExpiresAtMs: nowMs + CONTINUATION_LEASE_MS,
                attemptCount: FieldValue.increment(1),
                startedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.update(jobRef, {
                'frameContinuation.state': 'running',
                'frameContinuation.leaseExpiresAtMs': nowMs + CONTINUATION_LEASE_MS,
                status: continuationJobStatus(savedStage),
                statusMessage: '저장한 단계부터 자동으로 이어서 만들고 있어요.',
                updatedAt: FieldValue.serverTimestamp(),
            });
            return 'claimed' as const;
        });
        if (claim === 'stale') return;
        if (claim === 'cancelled') return;
        if (claim === 'exhausted') {
            const exhaustedJob = await jobRef.get();
            const exhaustedRequest = emoticonJobRequestSchema.safeParse({
                ...(exhaustedJob.data() || {}),
                status: 'queued',
            });
            if (exhaustedRequest.success) {
                await syncLinkedProjectItem({
                    userId,
                    jobId,
                    request: exhaustedRequest.data,
                    generationStatus: 'failed',
                    validationErrors: ['반복된 연결 문제로 작업이 중단됐어요.'],
                }).catch(() => undefined);
            }
            return;
        }
        if (claim === 'busy') {
            // Retry-enabled delivery will try again after the active lease if
            // the previous instance was interrupted before completing.
            throw new Error('The emoticon continuation lease is still active.');
        }

        const update = async (data: Record<string, unknown>) => {
            await updateActiveJob(userId, jobId, data, {
                generationRunToken: runToken,
                continuationToken: token,
            });
        };
        let requestForProjectSync: EmoticonJobRequest | null = null;
        try {
            await assertJobActive(userId, jobId);
            const jobSnapshot = await jobRef.get();
            if (!jobSnapshot.exists) throw new Error('The emoticon job for continuation is unavailable.');
            const job = jobSnapshot.data() || {};
            const request = emoticonJobRequestSchema.safeParse({ ...job, status: 'queued' });
            if (!request.success) {
                throw new Error(`Invalid continued emoticon job: ${request.error.issues[0]?.message || 'unknown error'}`);
            }
            requestForProjectSync = request.data;
            updateOpenRouterUsageContext({
                projectId: request.data.projectId,
                batchId: request.data.batchId,
                stage: `${request.data.mode}:continuation`,
            });
            await assertLinkedProjectItemClaim({ userId, jobId, request: request.data });
            const plan = emoticonStoredPlanSchema.safeParse(job.plan);
            const continuation = parseContinuationState(
                job.frameContinuation,
                plan.success ? plan.data.action.frameCount : undefined,
            );
            let sourceImageUrl = typeof job.sourceImageUrl === 'string' ? job.sourceImageUrl : '';
            if (!sourceImageUrl.startsWith('https://')) {
                throw new Error('The stored source URL for continuation is invalid.');
            }
            if (request.data.mode === 'import_frames') {
                if (isFrameContinuationState(continuation) || continuation.stage !== 'static-render') {
                    throw new Error('The saved manual-import recovery stage is invalid.');
                }
                await renderImportedFramesJob({
                    userId,
                    jobId,
                    request: request.data,
                    update,
                });
                await syncCompletedProjectItemNonFatal({
                    userId,
                    jobId,
                    request: request.data,
                    jobCreatedAtMs: timestampToMillis(job.createdAt),
                });
                await continuationRef.update({
                    status: 'completed',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                logger.info('[EmoticonStudio] Continued manual frame import completed.', { userId, jobId, token });
                return;
            }
            if (request.data.mode === 'rerender') {
                if (isFrameContinuationState(continuation) || continuation.stage !== 'static-render') {
                    throw new Error('The saved rerender recovery stage is invalid.');
                }
                await rerenderExistingJob({
                    userId,
                    jobId,
                    request: request.data,
                    update,
                });
                await syncCompletedProjectItemNonFatal({
                    userId,
                    jobId,
                    request: request.data,
                    jobCreatedAtMs: timestampToMillis(job.createdAt),
                });
                await continuationRef.update({
                    status: 'completed',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                logger.info('[EmoticonStudio] Continued rerender completed.', { userId, jobId, token });
                return;
            }
            if (
                request.data.mode === 'generate'
                && request.data.resourceMode === 'efficient'
                && request.data.aiGenerationProfile !== EMOTICON_GPT_LIGHT_PROFILE
            ) {
                const preparedSource = await prepareCanonicalSource({
                    userId,
                    jobId,
                    sourceStoragePath: request.data.sourceStoragePath,
                });
                await renderEfficientCompositeJob({
                    userId,
                    jobId,
                    request: request.data,
                    preparedSource,
                    update,
                });
                await syncCompletedProjectItemNonFatal({
                    userId,
                    jobId,
                    request: request.data,
                    jobCreatedAtMs: timestampToMillis(job.createdAt),
                });
                await continuationRef.update({
                    status: 'completed',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                logger.info('[EmoticonStudio] Continued zero-provider local composite completed.', {
                    userId,
                    jobId,
                    token,
                });
                return;
            }
            const runtime = await resolveEmoticonAiRuntime({
                job,
                resourceMode: request.data.resourceMode,
                aiGenerationProfile: request.data.aiGenerationProfile,
                update,
            });
            if (!runtime.openRouterApiKey) throw new Error('OPENROUTER_API_KEY is not configured.');
            if (request.data.mode === 'repair_frame') {
                if (isFrameContinuationState(continuation)) {
                    throw new Error('The saved frame repair continuation kind is invalid.');
                }
                await repairExistingDynamicFrame({
                    userId,
                    jobId,
                    request: request.data,
                    apiKey: runtime.openRouterApiKey,
                    model: runtime.model,
                    imageModel: runtime.imageModel,
                    fallbackModels: runtime.fallbackModels,
                    reasoningEffort: runtime.reasoningEffort,
                    update,
                    jobCreatedAtMs: timestampToMillis(job.createdAt),
                    continuation,
                    checkpoint: job,
                    deadlineAtMs: Date.now() + CONTINUATION_WORK_BUDGET_MS,
                });
                await continuationRef.update({
                    status: 'completed',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }).catch((error) => {
                    logger.warn('[EmoticonStudio] Repair completed, but continuation bookkeeping was skipped.', {
                        userId,
                        jobId,
                        token,
                        error: error instanceof Error ? error.message : String(error),
                    });
                });
                logger.info('[EmoticonStudio] Continued frame repair completed.', { userId, jobId, token });
                return;
            }
            const canonicalReferenceCheckpoint = readCanonicalReferenceCheckpoint({
                userId,
                jobId,
                sourceStoragePath: request.data.sourceStoragePath,
                references: request.data.referenceImages,
                job,
            });
            const canonicalReferenceSet = canonicalReferenceCheckpoint
                || await prepareCanonicalReferenceSet({
                    userId,
                    jobId,
                    sourceStoragePath: request.data.sourceStoragePath,
                    references: request.data.referenceImages,
                });
            if (!canonicalReferenceCheckpoint) {
                await update({
                    canonicalReferenceUrls: canonicalReferenceSet.urls,
                    ...(canonicalReferenceSet.identitySheetUrl
                        ? { canonicalIdentityReferenceUrl: canonicalReferenceSet.identitySheetUrl }
                        : {}),
                    referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
                });
            }
            const additionalReferenceUrls = canonicalReferenceSet.urls;
            if (!isFrameContinuationState(continuation)) {
                if (continuation.stage === 'analysis') {
                    let sourceStoragePath = typeof job.sourceCanonicalStoragePath === 'string'
                        ? job.sourceCanonicalStoragePath
                        : '';
                    let sourceFingerprint = typeof job.sourceFingerprint === 'string'
                        ? job.sourceFingerprint
                        : '';
                    if (
                        !sourceStoragePath
                        || !sourceFingerprint
                        || job.identityFingerprintVersion !== EMOTICON_IDENTITY_FINGERPRINT_VERSION
                    ) {
                        const preparedSource = await prepareCanonicalSource({
                            userId,
                            jobId,
                            sourceStoragePath: request.data.sourceStoragePath,
                        });
                        sourceImageUrl = preparedSource.asset.url;
                        sourceStoragePath = preparedSource.asset.storagePath;
                        sourceFingerprint = preparedSource.fingerprint;
                    }
                    const identityFingerprint = buildEmoticonIdentityFingerprint({
                        normalizedSourceFingerprint: sourceFingerprint,
                        referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
                    });
                    if (request.data.mode === 'profile' || request.data.mode === 'sheet_plan') {
                        await runCharacterProfilePlanningPipeline({
                            apiKey: runtime.openRouterApiKey,
                            model: runtime.model,
                            fallbackModels: runtime.fallbackModels,
                            reasoningEffort: runtime.reasoningEffort,
                            userId,
                            jobId,
                            request: request.data,
                            sourceImageUrl,
                            sourceStoragePath,
                            sourceFingerprint,
                            referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
                            identityFingerprint,
                            additionalReferenceUrls,
                            identityReferenceUrl: canonicalReferenceSet.identitySheetUrl,
                            update,
                        });
                    } else {
                        await runAnalysisPipeline({
                            apiKey: runtime.openRouterApiKey,
                            model: runtime.model,
                            imageModel: runtime.imageModel,
                            fallbackModels: runtime.fallbackModels,
                            reasoningEffort: runtime.reasoningEffort,
                            userId,
                            jobId,
                            request: request.data,
                            sourceImageUrl,
                            identityReferenceUrl: canonicalReferenceSet.identitySheetUrl,
                            sourceStoragePath,
                            sourceFingerprint,
                            referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
                            identityFingerprint,
                            additionalReferenceUrls,
                            update,
                            deadlineAtMs: Date.now() + CONTINUATION_WORK_BUDGET_MS,
                            jobCreatedAtMs: timestampToMillis(job.createdAt),
                            continuation,
                        });
                    }
                } else {
                    const storedSourceFingerprint = typeof job.sourceFingerprint === 'string'
                        ? job.sourceFingerprint
                        : '';
                    const currentIdentityFingerprint = buildEmoticonIdentityFingerprint({
                        normalizedSourceFingerprint: storedSourceFingerprint,
                        referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
                    });
                    if (
                        !storedSourceFingerprint
                        || job.identityFingerprintVersion !== EMOTICON_IDENTITY_FINGERPRINT_VERSION
                        || job.referenceSetFingerprint !== canonicalReferenceSet.referenceSetFingerprint
                        || job.identityFingerprint !== currentIdentityFingerprint
                    ) {
                        throw new Error('The verified character reference identity checkpoint changed; start a new generation.');
                    }
                    if (!plan.success) {
                        throw new Error('The analyzed emoticon plan for continuation is unavailable.');
                    }
                    const outputProfileResult = emoticonOutputProfileSchema.safeParse(job.outputProfile);
                    const outputProfile = resolveEmoticonOutputProfile(
                        outputProfileResult.success ? outputProfileResult.data : request.data.outputProfile,
                    );
                    await runPostAnalysisPipeline({
                        apiKey: runtime.openRouterApiKey,
                        model: runtime.model,
                        imageModel: runtime.imageModel,
                        fallbackModels: runtime.fallbackModels,
                        reasoningEffort: runtime.reasoningEffort,
                        userId,
                        jobId,
                        request: request.data,
                        sourceImageUrl,
                        identityReferenceUrl: canonicalReferenceSet.identitySheetUrl,
                        additionalReferenceUrls,
                        plan: normalizeEmoticonPlanForOutputProfile(plan.data, outputProfile),
                        outputProfile,
                        analysisReused: Boolean(job.analysisReused),
                        update,
                        deadlineAtMs: Date.now() + CONTINUATION_WORK_BUDGET_MS,
                        jobCreatedAtMs: timestampToMillis(job.createdAt),
                        continuation,
                        checkpoint: job,
                    });
                }
                await continuationRef.update({
                    status: 'completed',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                return;
            }
            if (!plan.success || !isDynamicRender(plan.data) || request.data.mode !== 'generate') {
                throw new Error('The dynamic animation plan for continuation is unavailable.');
            }
            const storedSourceFingerprint = typeof job.sourceFingerprint === 'string'
                ? job.sourceFingerprint
                : '';
            const currentIdentityFingerprint = buildEmoticonIdentityFingerprint({
                normalizedSourceFingerprint: storedSourceFingerprint,
                referenceSetFingerprint: canonicalReferenceSet.referenceSetFingerprint,
            });
            if (
                !storedSourceFingerprint
                || job.identityFingerprintVersion !== EMOTICON_IDENTITY_FINGERPRINT_VERSION
                || job.referenceSetFingerprint !== canonicalReferenceSet.referenceSetFingerprint
                || job.identityFingerprint !== currentIdentityFingerprint
            ) {
                throw new Error('The verified character reference identity checkpoint changed; start a new generation.');
            }
            const outputProfileResult = emoticonOutputProfileSchema.safeParse(job.outputProfile);
            const outputProfile = resolveEmoticonOutputProfile(
                outputProfileResult.success ? outputProfileResult.data : request.data.outputProfile,
            );
            const animationFramesResult = emoticonAnimationFrameSchema.array()
                .max(plan.data.action.frameCount)
                .safeParse(job.animationFrames || []);
            if (!animationFramesResult.success) {
                throw new Error('The saved animation frame checkpoint is invalid.');
            }
            const frameSequenceResult = emoticonFrameSequenceSchema.safeParse(job.frameSequencePlan);
            if (!frameSequenceResult.success && continuation.stage !== 'planning') {
                throw new Error('The saved frame sequence plan is invalid.');
            }
            const motionReviewResult = emoticonMotionReviewSchema.safeParse(job.motionReview);
            const poseUrl = typeof job.keyPoseUrl === 'string' ? job.keyPoseUrl : '';
            if (!poseUrl.startsWith('https://')) {
                throw new Error('The stored source or key pose URL for continuation is invalid.');
            }
            const rendered = await renderAiFrameSequenceOutputs({
                apiKey: runtime.openRouterApiKey,
                model: runtime.model,
                imageModel: runtime.imageModel,
                fallbackModels: runtime.fallbackModels,
                reasoningEffort: runtime.reasoningEffort,
                sourceImageUrl,
                originalUserInstruction: request.data.instruction,
                identityReferenceUrl: canonicalReferenceSet.identitySheetUrl,
                additionalReferenceUrls,
                userId,
                jobId,
                plan: plan.data,
                resourceMode: request.data.resourceMode,
                outputProfile,
                poseStoragePath: typeof job.keyPoseStoragePath === 'string'
                    ? job.keyPoseStoragePath
                    : undefined,
                poseUrl,
                mirroredPoseUrl: typeof job.mirroredKeyPoseUrl === 'string'
                    ? job.mirroredKeyPoseUrl
                    : undefined,
                formats: request.data.formats,
                update,
                frameSequence: frameSequenceResult.success ? frameSequenceResult.data : undefined,
                initialAnimationFrames: animationFramesResult.data,
                continuation,
                motionReview: motionReviewResult.success ? motionReviewResult.data : undefined,
                deadlineAtMs: Date.now() + CONTINUATION_WORK_BUDGET_MS,
            });
            assertRenderedFilesPassedInspection(rendered.files);
            const outputs = await uploadRenderedFiles({
                userId,
                jobId,
                files: rendered.files,
            });
            const storedPoseQuality = emoticonQualitySchema.safeParse(job.quality);
            await update({
                status: 'completed',
                progress: 100,
                statusMessage: '이모티콘이 완성됐어요.',
                plan: plan.data,
                quality: rendered.motionQuality || (storedPoseQuality.success ? storedPoseQuality.data : null),
                animationFrames: rendered.animationFrames,
                compositedFrames: rendered.compositedFrames,
                outputs,
                outputProfile,
                specReport: buildSpecReport({ plan: plan.data, outputProfile, files: rendered.files }),
                analysisReused: Boolean(job.analysisReused),
                motionFallbackReason: rendered.motionFallbackReason,
                resumeAvailable: false,
                'frameContinuation.state': 'completed',
                completedAt: FieldValue.serverTimestamp(),
            });
            await syncCompletedProjectItemNonFatal({
                userId,
                jobId,
                request: request.data,
                jobCreatedAtMs: timestampToMillis(job.createdAt),
            });
            await continuationRef.update({
                status: 'completed',
                expiresAt: continuationExpiresAt(),
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }).catch((error) => {
                logger.warn('[EmoticonStudio] Job completed, but continuation bookkeeping was skipped.', {
                    userId,
                    jobId,
                    token,
                    error: error instanceof Error ? error.message : String(error),
                });
            });
            logger.info('[EmoticonStudio] Continued frame pipeline completed.', { userId, jobId, token });
        } catch (error) {
            if (error instanceof EmoticonStaleWorkerError) {
                logger.info('[EmoticonStudio] Stale continuation worker stopped without settling job or project state.', {
                    userId,
                    jobId,
                    token,
                });
                return;
            }
            if (
                error instanceof EmoticonJobCancelledError
                || await isJobCancellationRequested(userId, jobId).catch(() => false)
            ) {
                await finalizeJobCancellation(userId, jobId).catch(() => false);
                if (requestForProjectSync) {
                    await syncLinkedProjectItem({
                        userId,
                        jobId,
                        request: requestForProjectSync,
                        generationStatus: 'planned',
                    }).catch(() => undefined);
                }
                await continuationRef.update({
                    status: 'cancelled',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }).catch(() => undefined);
                logger.info('[EmoticonStudio] Continued job cancelled by the user.', {
                    userId,
                    jobId,
                    token,
                });
                return;
            }
            if (error instanceof EmoticonStaleProjectItemClaimError) {
                await update({
                    status: 'failed',
                    progress: 100,
                    statusMessage: '프로젝트 항목 연결이 다른 작업으로 변경됐어요.',
                    error: '이 작업은 더 이상 선택된 항목의 작업이 아니어서 AI를 호출하지 않고 종료됐어요.',
                    resumeAvailable: false,
                    failedAt: FieldValue.serverTimestamp(),
                }).catch(() => undefined);
                await continuationRef.update({
                    status: 'stale',
                    error: 'Project item lease no longer belongs to this job.',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }).catch(() => undefined);
                logger.warn('[EmoticonStudio] Continued stale project item claim rejected.', {
                    userId,
                    jobId,
                    token,
                });
                return;
            }
            if (error instanceof EmoticonContinuationScheduledError) {
                await continuationRef.update({
                    status: 'continued',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                logger.info('[EmoticonStudio] Continued frame pipeline scheduled another segment.', {
                    userId,
                    jobId,
                    token,
                });
                return;
            }
            const retryScheduled = await retryContinuationAfterTransient({
                error,
                userId,
                jobId,
            }).catch((retryError) => {
                logger.error('[EmoticonStudio] Could not schedule a continued transient retry.', {
                    userId,
                    jobId,
                    token,
                    error: retryError instanceof Error ? retryError.message : String(retryError),
                });
                return false;
            });
            if (retryScheduled) {
                await continuationRef.update({
                    status: 'retried',
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                logger.warn('[EmoticonStudio] Continued transient failure scheduled for bounded retry.', {
                    userId,
                    jobId,
                    token,
                });
                return;
            }
            if (error instanceof OpenRouterDailyCostLimitError || isOpenRouterCreditError(error)) {
                const dailyLimitReached = error instanceof OpenRouterDailyCostLimitError;
                const message = safeErrorMessage(error);
                await update({
                    status: 'failed',
                    progress: 100,
                    statusMessage: dailyLimitReached
                        ? '오늘 비용 보호 한도에 도달했어요. 자정 이후 저장된 프레임부터 이어 만들 수 있어요.'
                        : 'OpenRouter 크레딧을 충전하면 저장된 프레임부터 이어 만들 수 있어요.',
                    error: message,
                    resumeAvailable: true,
                    recoverableFailure: dailyLimitReached ? 'checkpoint-error' : 'openrouter-credits',
                    ...(dailyLimitReached
                        ? { dailyCostPausedAt: FieldValue.serverTimestamp() }
                        : { creditPausedAt: FieldValue.serverTimestamp() }),
                    'frameContinuation.state': 'checkpointed',
                    failedAt: FieldValue.serverTimestamp(),
                }).catch(() => undefined);
                await continuationRef.update({
                    status: 'failed',
                    error: message,
                    recoverable: true,
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }).catch(() => undefined);
                logger.warn('[EmoticonStudio] Continued job paused for OpenRouter cost protection.', {
                    userId,
                    jobId,
                    token,
                    dailyLimitReached,
                });
                return;
            }
            if (
                requestForProjectSync?.mode === 'generate'
                && isDefiniteImageRouteCompatibilityError(error)
            ) {
                const message = safeErrorMessage(error);
                await update({
                    status: 'failed',
                    progress: 100,
                    statusMessage: '이미지 제공자 옵션을 안전 모드로 바꾼 뒤 이어 만들 수 있어요',
                    error: message,
                    resumeAvailable: true,
                    recoverableFailure: 'checkpoint-error',
                    failureCode: 'image-provider-compatibility',
                    failureStage: 'frame-generation',
                    retryStrategy: 'resume-in-place',
                    'frameContinuation.state': 'checkpointed',
                    failedAt: FieldValue.serverTimestamp(),
                }).catch(() => undefined);
                await continuationRef.update({
                    status: 'failed',
                    error: message,
                    recoverable: true,
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }).catch(() => undefined);
                logger.warn('[EmoticonStudio] Continued image provider compatibility failure checkpointed.', {
                    userId,
                    jobId,
                    token,
                });
                return;
            }
            logger.error('[EmoticonStudio] Continued frame pipeline failed.', {
                userId,
                jobId,
                token,
                error: error instanceof Error ? error.message : String(error),
            });
            const message = safeErrorMessage(error);
            const renderFailureRecovery = await buildRenderFailureRecoveryMarker({
                userId,
                jobId,
                error,
            }).catch(() => null);
            if (renderFailureRecovery) {
                const recoveryMessage = '파일 조립 중 일시적인 문제가 생겼습니다. 저장된 프레임부터 다시 이어 만들 수 있어요.';
                await update({
                    status: 'failed',
                    progress: 100,
                    statusMessage: '렌더링 서버가 중단됐어요. 저장된 단계부터 다시 이어 만들 수 있어요.',
                    error: recoveryMessage,
                    resumeAvailable: true,
                    recoverableFailure: 'checkpoint-error',
                    renderFailureRecovery,
                    'frameContinuation.state': 'checkpointed',
                    failedAt: FieldValue.serverTimestamp(),
                }).catch(() => undefined);
                // A recoverable render checkpoint retains the linked item
                // lease so the same job can resume without regenerating AI frames.
                await continuationRef.update({
                    status: 'failed',
                    error: recoveryMessage,
                    recoverable: true,
                    expiresAt: continuationExpiresAt(),
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }).catch(() => undefined);
                return;
            }
            // Deterministic quality, schema, identity, or motion rejection is
            // terminal. Re-reviewing the same frames would spend money and can
            // eventually launder a bad sequence through a more lenient score.
            await update({
                status: 'failed',
                progress: 100,
                statusMessage: '생성 또는 품질 검증을 통과하지 못해 작업을 종료했어요.',
                error: message,
                resumeAvailable: false,
                recoverableFailure: FieldValue.delete(),
                'frameContinuation.state': 'failed',
                failedAt: FieldValue.serverTimestamp(),
            }).catch(() => undefined);
            if (requestForProjectSync) {
                await syncLinkedProjectItem({
                    userId,
                    jobId,
                    request: requestForProjectSync,
                    generationStatus: 'failed',
                    validationErrors: [message],
                }).catch(() => undefined);
            }
            await continuationRef.update({
                status: 'failed',
                error: message,
                recoverable: false,
                expiresAt: continuationExpiresAt(),
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }).catch(() => undefined);
        }
        });
    },
);
