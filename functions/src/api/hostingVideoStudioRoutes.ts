import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import type { DocumentReference } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import { processQueuedVideoStudioJob } from '../videoStudio/processor';
import { videoStudioJobRequestSchema } from '../videoStudio/request';
import {
    createOpenRouterVideoExecutionPlan,
    isResumableOpenRouterVideoCheckpoint,
    preflightOpenRouterVideo,
} from '../videoStudio/openrouter';
import { inspectFfmpegRuntime } from '../videoStudio/ffmpeg';
import {
    parseVideoStudioIdempotencyContract,
    VideoStudioIdempotencyError,
    type VideoStudioIdempotencyContract,
} from '../videoStudio/idempotency';
import {
    VIDEO_STUDIO_WORKER_CAPABILITIES,
    VIDEO_STUDIO_WORKER_PROBE_KIND,
    VIDEO_STUDIO_WORKER_PROBE_VERSION,
    VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
    readVideoStudioWorkerProbeResponse,
    type VideoStudioWorkerProbeResponse,
} from '../videoStudio/workerContract';
import { storagePathFromVideoStudioUrl } from '../videoStudio/storagePath';
import { applyVideoStudioRepeatCost } from '../videoStudio/repeatCost';
import { ApiError, db, parseJson, requireAdmin, requireMethod, requireUser, requireUserAccess } from './hostingCommon';
import { getHostingAiRuntime, type HostingAiRuntime } from './hostingAiRuntime';
import { assertExternalHttpsUrl, normalizeExternalHttpsUrl } from './security';

const PROJECTS = 'video_studio_projects';
const CLIPS = 'video_studio_clips';
const JOBS = 'video_studio_jobs';
const VIDEO_STUDIO_STORAGE_PAGE_SIZE = 250;
const ACTIVE_STORAGE_JOB_STATUSES = new Set(['queued', 'running', 'uploading']);
const PROVIDER_JOB_OPERATIONS = new Set(['generate', 'extend', 'continue', 'edit']);
const WORKER_PROBE_CREATE_PHASE_TIMEOUT_MS = 16_000;
const WORKER_PROBE_TOTAL_TIMEOUT_MS = 24_000;
const WORKER_PROBE_POLL_INTERVAL_MS = 500;
const WORKER_PROBE_SUCCESS_CACHE_MS = 60_000;
const WORKER_PROBE_FAILURE_CACHE_MS = 10_000;

function redactCreditBalance<T extends Awaited<ReturnType<typeof preflightOpenRouterVideo>>>(estimate: T): T {
    return {
        ...estimate,
        credit: {
            ...estimate.credit,
            remainingUsd: null,
            totalCreditsUsd: null,
            totalUsageUsd: null,
            message:
                estimate.credit.message ||
                'OpenRouter 잔액은 관리자에게만 표시됩니다. 장면별 제작 가능 여부는 계속 확인합니다.',
        },
    };
}

function toStoredPreflight<T extends Awaited<ReturnType<typeof preflightOpenRouterVideo>>>(preflight: T): T {
    return {
        ...preflight,
        credit: {
            ...preflight.credit,
            remainingUsd: null,
            totalCreditsUsd: null,
            totalUsageUsd: null,
        },
    };
}

async function requireOwnedProject(uid: string, projectId: string) {
    const snapshot = await db.collection(PROJECTS).doc(projectId).get();
    if (!snapshot.exists) throw new ApiError(404, 'The selected project no longer exists.');
    const data = snapshot.data() || {};
    if (data.userId !== uid) throw new ApiError(403, 'You do not have access to this project.');
    return { id: snapshot.id, data };
}

async function requireOwnedJob(uid: string, jobId: string) {
    const snapshot = await db.collection(JOBS).doc(jobId).get();
    if (!snapshot.exists) throw new ApiError(404, 'The selected job no longer exists.');
    const data = snapshot.data() || {};
    if (data.userId !== uid) throw new ApiError(403, 'You do not have access to this job.');
    return { id: snapshot.id, data };
}

function nullableText(value?: string | null): string | null {
    const text = value?.trim();
    return text || null;
}

type WorkerProbeState = 'ready' | 'outdated' | 'unavailable';

type WorkerProbeInspection = {
    state: WorkerProbeState;
    compatible: boolean;
    protocolVersion: number | null;
    capabilities: string[];
    checkedAt: string;
    latencyMs: number;
    message: string;
};

let workerProbeCache: { inspection: WorkerProbeInspection; expiresAt: number } | null = null;
let workerProbeInFlight: Promise<WorkerProbeInspection> | null = null;

function waitForWorkerProbePoll(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, WORKER_PROBE_POLL_INTERVAL_MS));
}

function workerProbeFailure(params: {
    state: Exclude<WorkerProbeState, 'ready'>;
    checkedAt: string;
    startedAt: number;
    message: string;
}): WorkerProbeInspection {
    return {
        state: params.state,
        compatible: false,
        protocolVersion: null,
        capabilities: [],
        checkedAt: params.checkedAt,
        latencyMs: Date.now() - params.startedAt,
        message: params.message,
    };
}

type WorkerProbeWaitResult =
    | { outcome: 'response'; response: VideoStudioWorkerProbeResponse }
    | { outcome: 'missing' | 'terminal' | 'timeout'; response: null };

async function waitForWorkerProbeResponse(params: {
    probeRef: DocumentReference;
    deadline: number;
}): Promise<WorkerProbeWaitResult> {
    while (Date.now() < params.deadline) {
        await waitForWorkerProbePoll();
        const snapshot = await params.probeRef.get();
        if (!snapshot.exists) return { outcome: 'missing', response: null };

        const data = snapshot.data() || {};
        const response = readVideoStudioWorkerProbeResponse(data);
        if (response) return { outcome: 'response', response };

        const status = typeof data.status === 'string' ? data.status : '';
        if (status === 'failed' || status === 'canceled' || status === 'completed') {
            return { outcome: 'terminal', response: null };
        }
    }
    return { outcome: 'timeout', response: null };
}

function isCompatibleWorkerProbeResponse(params: {
    response: VideoStudioWorkerProbeResponse;
    challenge: string;
    phase: VideoStudioWorkerProbeResponse['phase'];
    handler: VideoStudioWorkerProbeResponse['handler'];
}): boolean {
    const availableCapabilities = new Set(params.response.capabilities);
    return (
        params.response.challenge === params.challenge
        && params.response.phase === params.phase
        && params.response.handler === params.handler
        && params.response.protocolVersion >= VIDEO_STUDIO_WORKER_PROTOCOL_VERSION
        && VIDEO_STUDIO_WORKER_CAPABILITIES.every((capability) => availableCapabilities.has(capability))
    );
}

async function runVideoStudioQueueTriggerProbe(): Promise<WorkerProbeInspection> {
    const startedAt = Date.now();
    const checkedAt = new Date(startedAt).toISOString();
    const createChallenge = randomUUID();
    const probeRef = db.collection(JOBS).doc(`__worker_contract_probe_${randomUUID().replace(/-/g, '')}`);
    let probeCreated = false;

    try {
        await probeRef.create({
            userId: '__video_studio_worker_probe__',
            projectId: '__video_studio_worker_probe__',
            kind: VIDEO_STUDIO_WORKER_PROBE_KIND,
            title: 'Video Studio worker contract probe',
            prompt: '',
            status: 'queued',
            progress: 0,
            message: 'Waiting for the deployed queue trigger to answer a contract challenge.',
            metadata: {
                workerContractProbe: {
                    version: VIDEO_STUDIO_WORKER_PROBE_VERSION,
                    phase: 'create',
                    challenge: createChallenge,
                    requestedProtocolVersion: VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
                    requiredCapabilities: [...VIDEO_STUDIO_WORKER_CAPABILITIES],
                    requestedAt: checkedAt,
                },
            },
            clipId: null,
            resultVideoUrl: null,
            resultFrameUrl: null,
            errorMessage: null,
            attemptCount: 0,
            claimedAt: null,
            heartbeatAt: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            startedAt: null,
            finishedAt: null,
            probeExpiresAt: admin.firestore.Timestamp.fromMillis(startedAt + 5 * 60 * 1000),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        probeCreated = true;

        const createResult = await waitForWorkerProbeResponse({
            probeRef,
            deadline: startedAt + WORKER_PROBE_CREATE_PHASE_TIMEOUT_MS,
        });
        if (createResult.outcome !== 'response') {
            return workerProbeFailure({
                state: createResult.outcome === 'terminal' ? 'outdated' : 'unavailable',
                checkedAt,
                startedAt,
                message: createResult.outcome === 'terminal'
                    ? '배포된 신규 작업 트리거가 challenge 규격을 처리하지 못했습니다. 최신 Functions 배포가 필요합니다.'
                    : '신규 영상 작업 트리거가 제한 시간 안에 응답하지 않아 유료 작업 접수를 중단했습니다.',
            });
        }
        if (!isCompatibleWorkerProbeResponse({
            response: createResult.response,
            challenge: createChallenge,
            phase: 'create',
            handler: 'onVideoStudioJobQueued',
        })) {
            return {
                state: 'outdated',
                compatible: false,
                protocolVersion: createResult.response.protocolVersion,
                capabilities: [...createResult.response.capabilities],
                checkedAt,
                latencyMs: Date.now() - startedAt,
                message: '신규 영상 작업 트리거의 프로토콜 또는 기능이 현재 앱과 맞지 않습니다.',
            };
        }

        const requeueChallenge = randomUUID();
        await probeRef.update({
            status: 'queued',
            progress: 0,
            message: 'Waiting for the deployed requeue trigger to answer a contract challenge.',
            errorMessage: null,
            claimedAt: null,
            heartbeatAt: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            startedAt: null,
            finishedAt: null,
            'metadata.workerContractProbe': {
                version: VIDEO_STUDIO_WORKER_PROBE_VERSION,
                phase: 'requeue',
                challenge: requeueChallenge,
                requestedProtocolVersion: VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
                requiredCapabilities: [...VIDEO_STUDIO_WORKER_CAPABILITIES],
                requestedAt: new Date().toISOString(),
            },
            'metadata.queueDispatchToken': randomUUID(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const requeueResult = await waitForWorkerProbeResponse({
            probeRef,
            deadline: startedAt + WORKER_PROBE_TOTAL_TIMEOUT_MS,
        });
        if (requeueResult.outcome !== 'response') {
            return workerProbeFailure({
                state: requeueResult.outcome === 'terminal' ? 'outdated' : 'unavailable',
                checkedAt,
                startedAt,
                message: requeueResult.outcome === 'terminal'
                    ? '배포된 재등록 트리거가 challenge 규격을 처리하지 못했습니다. 최신 Functions 배포가 필요합니다.'
                    : '영상 재등록 트리거가 제한 시간 안에 응답하지 않아 유료 작업 접수를 중단했습니다.',
            });
        }
        if (!isCompatibleWorkerProbeResponse({
            response: requeueResult.response,
            challenge: requeueChallenge,
            phase: 'requeue',
            handler: 'onVideoStudioJobRequeued',
        })) {
            return {
                state: 'outdated',
                compatible: false,
                protocolVersion: requeueResult.response.protocolVersion,
                capabilities: [...requeueResult.response.capabilities],
                checkedAt,
                latencyMs: Date.now() - startedAt,
                message: '영상 재등록 트리거의 프로토콜 또는 기능이 현재 앱과 맞지 않습니다.',
            };
        }

        const requeueCapabilities = new Set(requeueResult.response.capabilities);
        return {
            state: 'ready',
            compatible: true,
            protocolVersion: Math.min(
                createResult.response.protocolVersion,
                requeueResult.response.protocolVersion,
            ),
            capabilities: createResult.response.capabilities.filter((capability) => (
                requeueCapabilities.has(capability)
            )),
            checkedAt,
            latencyMs: Date.now() - startedAt,
            message: '신규 작업과 재등록 영상 큐 트리거가 모두 최신 처리 규격으로 응답했습니다.',
        };
    } catch (error) {
        logger.warn('[VideoStudioWorkerProbe] Failed to verify the deployed queue trigger.', {
            error: error instanceof Error ? error.message : String(error),
        });
        return workerProbeFailure({
            state: 'unavailable',
            checkedAt,
            startedAt,
            message: '영상 큐 트리거의 실제 동작을 확인하지 못해 유료 작업 접수를 중단했습니다.',
        });
    } finally {
        if (probeCreated) {
            await probeRef.delete().catch((error: unknown) => {
                logger.warn('[VideoStudioWorkerProbe] Failed to remove a completed probe document.', {
                    probeId: probeRef.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                return probeRef.set({
                    status: 'canceled',
                    message: 'Worker contract probe cleanup is pending.',
                    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true }).catch((fallbackError: unknown) => {
                    logger.error('[VideoStudioWorkerProbe] Failed to quarantine a residual probe document.', {
                        probeId: probeRef.id,
                        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                    });
                });
            });
        }
    }
}

async function inspectVideoStudioQueueTrigger(): Promise<WorkerProbeInspection> {
    const now = Date.now();
    if (workerProbeCache && workerProbeCache.expiresAt > now) {
        return workerProbeCache.inspection;
    }
    if (workerProbeInFlight) {
        return workerProbeInFlight;
    }

    const probePromise = runVideoStudioQueueTriggerProbe();
    workerProbeInFlight = probePromise;
    try {
        const inspection = await probePromise;
        workerProbeCache = {
            inspection,
            expiresAt: Date.now() + (
                inspection.compatible
                    ? WORKER_PROBE_SUCCESS_CACHE_MS
                    : WORKER_PROBE_FAILURE_CACHE_MS
            ),
        };
        return inspection;
    } finally {
        if (workerProbeInFlight === probePromise) {
            workerProbeInFlight = null;
        }
    }
}

async function inspectVideoStudioWorkerAvailability(): Promise<{
    runtime: HostingAiRuntime;
    worker: Omit<WorkerProbeInspection, 'state'> & { state: WorkerProbeState | 'misconfigured' };
    automaticProcessorConfigured: boolean;
}> {
    const [runtime, probe] = await Promise.all([
        getHostingAiRuntime(),
        inspectVideoStudioQueueTrigger(),
    ]);
    const apiKeyConfigured = Boolean(runtime.openRouterApiKey);
    const automaticProcessorConfigured = apiKeyConfigured && probe.compatible;
    return {
        runtime,
        worker: {
            ...probe,
            state: probe.compatible && !apiKeyConfigured ? 'misconfigured' : probe.state,
            compatible: automaticProcessorConfigured,
            message: probe.compatible && !apiKeyConfigured
                ? '실제 영상 큐 트리거는 정상이나 OPENROUTER_API_KEY가 설정되지 않았습니다.'
                : probe.message,
        },
        automaticProcessorConfigured,
    };
}

async function requireFreshProviderWorker(): Promise<HostingAiRuntime> {
    const availability = await inspectVideoStudioWorkerAvailability();
    if (!availability.runtime.openRouterApiKey) {
        throw new ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않아 영상 작업을 접수하지 않았습니다.');
    }
    if (!availability.automaticProcessorConfigured) {
        throw new ApiError(503, availability.worker.message);
    }
    return availability.runtime;
}

function requiresProviderWorker(operation: unknown): boolean {
    return typeof operation === 'string' && PROVIDER_JOB_OPERATIONS.has(operation);
}

function queuedJobRequiresProviderWorker(job: Record<string, unknown>): boolean {
    if (requiresProviderWorker(job.kind)) return true;
    const metadata = job.metadata && typeof job.metadata === 'object'
        ? job.metadata as Record<string, unknown>
        : null;
    const request = metadata?.request && typeof metadata.request === 'object'
        ? metadata.request as Record<string, unknown>
        : null;
    return requiresProviderWorker(request?.operation);
}

function hasResumableProviderVideo(job: Record<string, unknown>): boolean {
    const metadata = job.metadata && typeof job.metadata === 'object'
        ? job.metadata as Record<string, unknown>
        : null;
    const accessIssue = metadata?.providerVideoAccessIssue;
    if (accessIssue && typeof accessIssue === 'object') {
        const candidate = accessIssue as Record<string, unknown>;
        const hasAlreadyRequeued =
            typeof metadata?.queueDispatchToken === 'string'
            && metadata.queueDispatchToken.length > 0;
        if (
            (candidate.recoverable === false || hasAlreadyRequeued)
            && (candidate.httpStatus === 401 || candidate.httpStatus === 403)
        ) return false;
    }
    const unavailableOutput = metadata?.providerVideoDiscarded;
    if (unavailableOutput && typeof unavailableOutput === 'object') {
        const discarded = unavailableOutput as Record<string, unknown>;
        const reason = discarded.reason;
        const terminalLegacyUnavailable = reason === 'provider_output_unavailable'
            && discarded.httpStatus !== 401
            && discarded.httpStatus !== 403;
        if (
            reason === 'provider_output_not_found'
            || reason === 'provider_output_expired'
            || terminalLegacyUnavailable
        ) return false;
    }
    if (isResumableOpenRouterVideoCheckpoint(metadata?.providerVideo)) return true;

    const discarded = metadata?.providerVideoDiscarded
        && typeof metadata.providerVideoDiscarded === 'object'
        ? metadata.providerVideoDiscarded as Record<string, unknown>
        : null;
    const renderResult = metadata?.renderResult && typeof metadata.renderResult === 'object'
        ? metadata.renderResult as Record<string, unknown>
        : null;
    return Boolean(
        discarded
        && renderResult
        && discarded.reason === 'resolution_mismatch'
        && discarded.recoverable !== false
        && typeof discarded.providerJobId === 'string'
        && discarded.providerJobId.length > 0
        && renderResult.requestId === discarded.providerJobId
        && renderResult.modelUsed === discarded.modelId,
    );
}

export async function handleVideoStudioStatus(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'GET');
    await requireUser(req);
    const availability = await inspectVideoStudioWorkerAvailability();
    res.status(200).json({
        success: true,
        status: {
            provider: 'openrouter',
            devMode: false,
            openRouterApiKeyConfigured: Boolean(availability.runtime.openRouterApiKey),
            configSource: availability.runtime.source,
            processorSecretConfigured: Boolean(availability.runtime.openRouterApiKey),
            automaticProcessorConfigured: availability.automaticProcessorConfigured,
            worker: {
                ...availability.worker,
                requiredProtocolVersion: VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
                verification: 'firestore-trigger-challenge',
            },
        },
    });
}

const VideoEstimateQuerySchema = z.object({
    duration: z.coerce.number().int().min(1).max(15),
    resolution: z.enum(['480p', '720p', '1080p']),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']),
    qualityMode: z.enum(['proof', 'final']).default('proof'),
    hasReferenceImage: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    hasEndReferenceImage: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    hasVisualReferenceImages: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    audioMode: z.enum(['silent', 'ambient', 'dialogue']).default('silent'),
    forceModelRefresh: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    knownInputImagePrivacyBlock: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
});

export async function handleVideoStudioEstimate(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'GET');
    const auth = await requireUserAccess(req);
    const parsed = VideoEstimateQuerySchema.safeParse({
        duration: req.query.duration,
        resolution: req.query.resolution,
        aspectRatio: req.query.aspectRatio,
        qualityMode: req.query.qualityMode,
        hasReferenceImage: req.query.hasReferenceImage,
        hasEndReferenceImage: req.query.hasEndReferenceImage,
        hasVisualReferenceImages: req.query.hasVisualReferenceImages,
        audioMode: req.query.audioMode,
        forceModelRefresh: req.query.forceModelRefresh,
        knownInputImagePrivacyBlock: req.query.knownInputImagePrivacyBlock,
    });
    if (!parsed.success) throw new ApiError(400, '영상 예상 비용 조건을 확인해 주세요.');
    const runtime = await getHostingAiRuntime();
    if (!runtime.openRouterApiKey) throw new ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    const estimate = await preflightOpenRouterVideo({
        apiKey: runtime.openRouterApiKey,
        ...parsed.data,
    });
    res.status(200).json({
        success: true,
        estimate: auth.isAdmin ? estimate : redactCreditBalance(estimate),
    });
}

const VideoReadinessQuerySchema = z.object({
    duration: z.coerce.number().int().min(1).max(15).default(6),
    resolution: z.enum(['480p', '720p', '1080p']).default('720p'),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']).default('16:9'),
    qualityMode: z.enum(['proof', 'final']).default('proof'),
    hasReferenceImage: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    hasEndReferenceImage: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    hasVisualReferenceImages: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    audioMode: z.enum(['silent', 'ambient', 'dialogue']).default('silent'),
});

export async function handleVideoStudioReadiness(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'GET');
    await requireUser(req);
    const parsed = VideoReadinessQuerySchema.safeParse({
        duration: req.query.duration,
        resolution: req.query.resolution,
        aspectRatio: req.query.aspectRatio,
        qualityMode: req.query.qualityMode,
        hasReferenceImage: req.query.hasReferenceImage,
        hasEndReferenceImage: req.query.hasEndReferenceImage,
        hasVisualReferenceImages: req.query.hasVisualReferenceImages,
        audioMode: req.query.audioMode,
    });
    if (!parsed.success) throw new ApiError(400, '영상 제작 사전 점검 조건이 올바르지 않습니다.');

    const runtime = await getHostingAiRuntime();
    const [firestore, storage, storageSigning, ffmpeg] = await Promise.all([
        db
            .collection(JOBS)
            .limit(1)
            .get()
            .then(
                () => ({
                    ok: true,
                    message: 'Firestore Admin read access is available.',
                }),
                (error: unknown) => ({
                    ok: false,
                    message: error instanceof Error ? error.message : 'Firestore Admin read access failed.',
                }),
            ),
        admin
            .storage()
            .bucket()
            .getMetadata()
            .then(
                () => ({
                    ok: true,
                    message: 'Firebase Storage Admin access is available.',
                }),
                (error: unknown) => ({
                    ok: false,
                    message: error instanceof Error ? error.message : 'Firebase Storage Admin access failed.',
                }),
            ),
        admin
            .storage()
            .bucket()
            .file('__readiness__/signing-probe.txt')
            .getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 1000,
            })
            .then(
                () => ({
                    ok: true,
                    message: 'Firebase Storage URL signing is available.',
                }),
                (error: unknown) => ({
                    ok: false,
                    message:
                        error instanceof Error && /client[_ ]?email|cannot sign data/i.test(error.message)
                            ? 'Signed URLs are unavailable with local application-default credentials. Storyboard media continues to use Firebase download-token URLs.'
                            : error instanceof Error
                              ? error.message
                              : 'Firebase Storage URL signing is unavailable.',
                }),
            ),
        inspectFfmpegRuntime(),
    ]);
    const openRouter = runtime.openRouterApiKey
        ? await preflightOpenRouterVideo({
              apiKey: runtime.openRouterApiKey,
              ...parsed.data,
          }).then(
              (preflight) => ({
                  ok: true as const,
                  preflight,
                  message: '호환되는 영상 모델을 확인했습니다.',
              }),
              (error: unknown) => ({
                  ok: false as const,
                  preflight: null,
                  message: error instanceof Error ? error.message : 'OpenRouter 영상 모델 점검에 실패했습니다.',
              }),
          )
        : {
              ok: false as const,
              preflight: null,
              message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.',
          };
    const ready = firestore.ok && storage.ok && ffmpeg.ok && openRouter.ok;

    res.status(200).json({
        success: true,
        readiness: {
            ready,
            checkedAt: new Date().toISOString(),
            firebase: {
                status: {
                    initialized: true,
                    canPersistToFirestore: firestore.ok,
                    canSignStorageUrls: storageSigning.ok,
                    credentialMode: 'application_default',
                    // Storyboard artifacts use Firebase download tokens. URL
                    // signing is diagnostic-only and must not downgrade a
                    // runtime that can read/write Firestore and Storage.
                    message: !firestore.ok ? firestore.message : !storage.ok ? storage.message : null,
                },
                firestore,
                storage,
                storageSigning,
                storageDelivery: {
                    ok: storage.ok,
                    mode: 'firebase_download_token',
                    message: storage.ok
                        ? 'Storyboard media is delivered with Firebase download-token URLs and does not require service-account URL signing.'
                        : storage.message,
                },
            },
            ffmpeg: {
                ok: ffmpeg.ok,
                version: ffmpeg.version,
                message: ffmpeg.message,
            },
            openRouter,
        },
    });
}

const ExternalVideoUrlSchema = z.string().trim().max(4096).url().refine((value) => {
    try {
        normalizeExternalHttpsUrl(value);
        return true;
    } catch {
        return false;
    }
}, '영상 주소는 HTTPS여야 하며 로컬 또는 사설 네트워크를 가리킬 수 없습니다.');

const CreateClipSchema = z.object({
    userId: z.string().min(1).optional(),
    projectId: z.string().min(1),
    title: z.string().trim().min(1).max(240),
    prompt: z.string().trim().min(1).max(6000),
    mode: z.enum(['generate', 'extend', 'continue', 'edit', 'merge']),
    status: z.enum(['ready', 'processing', 'failed']).default('ready'),
    videoUrl: ExternalVideoUrlSchema,
    posterUrl: z.string().url().nullable().optional(),
    lastFrameUrl: z.string().url().nullable().optional(),
    continuityNotes: z.string().max(3000).nullable().optional(),
    cameraNotes: z.string().max(3000).nullable().optional(),
    subjectLock: z.string().max(3000).nullable().optional(),
    takeGroupId: z.string().max(240).nullable().optional(),
    parentTakeClipId: z.string().max(240).nullable().optional(),
    takeIndex: z.number().int().min(1).nullable().optional(),
    sourceClipId: z.string().max(240).nullable().optional(),
    sourceVideoUrl: ExternalVideoUrlSchema.nullable().optional(),
    mergeSourceClipIds: z.array(z.string().min(1).max(240)).max(100).default([]),
    duration: z.number().int().min(1).max(15).nullable().optional(),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']),
    resolution: z.enum(['480p', '720p', '1080p']),
});

export async function handleVideoStudioClips(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireUser(req);
    const payload = parseJson(req, CreateClipSchema);
    await requireOwnedProject(auth.uid, payload.projectId);
    let videoUrl: string;
    let sourceVideoUrl: string | null;
    try {
        [videoUrl, sourceVideoUrl] = await Promise.all([
            assertExternalHttpsUrl(payload.videoUrl),
            payload.sourceVideoUrl
                ? assertExternalHttpsUrl(payload.sourceVideoUrl)
                : Promise.resolve(null),
        ]);
    } catch {
        throw new ApiError(400, '영상 주소가 공개 HTTPS 서버로 연결되는지 확인해 주세요.');
    }
    const projectRef = db.collection(PROJECTS).doc(payload.projectId);
    const clipRef = db.collection(CLIPS).doc();
    const result = await db.runTransaction(async (transaction) => {
        const query = db.collection(CLIPS).where('projectId', '==', payload.projectId);
        const [project, clips] = await Promise.all([transaction.get(projectRef), transaction.get(query)]);
        if (!project.exists) throw new ApiError(404, 'The selected project no longer exists.');
        if (project.data()?.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this project.');
        let highest = -1;
        for (const clip of clips.docs) highest = Math.max(highest, Number(clip.data().sequence ?? -1));
        const sequence = highest + 1;
        let takeIndex = payload.takeIndex ?? null;
        if (payload.takeGroupId && !takeIndex) {
            let highestTake = 1;
            for (const clip of clips.docs) {
                const data = clip.data();
                if (clip.id === payload.takeGroupId || data.takeGroupId === payload.takeGroupId) {
                    highestTake = Math.max(highestTake, Number(data.takeIndex ?? 1));
                }
            }
            takeIndex = highestTake + 1;
        }
        const coverUrl = payload.posterUrl || payload.lastFrameUrl || videoUrl;
        transaction.set(clipRef, {
            userId: auth.uid,
            projectId: payload.projectId,
            title: payload.title,
            prompt: payload.prompt,
            mode: payload.mode,
            status: payload.status,
            provider: 'openrouter',
            sequence,
            videoUrl,
            posterUrl: payload.posterUrl || payload.lastFrameUrl || null,
            lastFrameUrl: payload.lastFrameUrl || null,
            continuityNotes: nullableText(payload.continuityNotes),
            cameraNotes: nullableText(payload.cameraNotes),
            subjectLock: nullableText(payload.subjectLock),
            takeGroupId: payload.takeGroupId || null,
            parentTakeClipId: payload.parentTakeClipId || null,
            takeIndex,
            sourceClipId: payload.sourceClipId || null,
            sourceVideoUrl,
            mergeSourceClipIds: payload.mergeSourceClipIds,
            duration: payload.duration ?? null,
            aspectRatio: payload.aspectRatio,
            resolution: payload.resolution,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(projectRef, {
            clipCount: sequence + 1,
            coverClipId: clipRef.id,
            coverUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { clipId: clipRef.id, sequence };
    });
    res.status(200).json({ success: true, ...result });
}

export async function handleVideoStudioClipById(req: Request, res: Response, clipId: string): Promise<void> {
    requireMethod(req, 'DELETE');
    const auth = await requireUser(req);
    const clipRef = db.collection(CLIPS).doc(clipId);
    const result = await db.runTransaction(async (transaction) => {
        const clipSnapshot = await transaction.get(clipRef);
        if (!clipSnapshot.exists) throw new ApiError(404, 'The selected clip no longer exists.');
        const clip = clipSnapshot.data() || {};
        if (clip.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this clip.');
        const projectRef = db.collection(PROJECTS).doc(String(clip.projectId));
        const clipsQuery = db.collection(CLIPS).where('projectId', '==', clip.projectId);
        const [project, clips] = await Promise.all([transaction.get(projectRef), transaction.get(clipsQuery)]);
        if (!project.exists) throw new ApiError(404, 'The selected project no longer exists.');
        if (project.data()?.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this project.');
        const remaining = clips.docs
            .filter((item) => item.id !== clipId)
            .map(
                (item) =>
                    ({ id: item.id, ...item.data() }) as {
                        id: string;
                        sequence?: number;
                    } & Record<string, unknown>,
            )
            .sort(
                (left, right) =>
                    Number(left.sequence ?? -1) - Number(right.sequence ?? -1) || left.id.localeCompare(right.id),
            );
        remaining.forEach((item, index) => {
            transaction.update(db.collection(CLIPS).doc(item.id), {
                sequence: index,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        const cover = remaining[remaining.length - 1] as Record<string, unknown> | undefined;
        transaction.delete(clipRef);
        transaction.update(projectRef, {
            clipCount: remaining.length,
            coverClipId: cover?.id || null,
            coverUrl:
                cover?.posterUrl || cover?.lastFrameUrl || cover?.videoUrl || project.data()?.starterImageUrl || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { projectId: String(clip.projectId), clipCount: remaining.length };
    });
    res.status(200).json({ success: true, ...result });
}

function defaultJobTitle(operation: string): string {
    const titles: Record<string, string> = {
        generate: '새 영상 생성',
        extend: '영상 연장',
        continue: '장면 이어 만들기',
        edit: '영상 편집',
        merge: '클립 병합',
        'extract-frame': '마지막 프레임 추출',
    };
    return titles[operation] || 'Video Studio 작업';
}

function readVideoStudioIdempotency(
    req: Request,
    uid: string,
    payload: z.infer<typeof videoStudioJobRequestSchema>,
): VideoStudioIdempotencyContract | null {
    try {
        return parseVideoStudioIdempotencyContract({
            rawKey: req.get('idempotency-key') || null,
            userId: uid,
            request: payload,
        });
    } catch (error) {
        if (error instanceof VideoStudioIdempotencyError) {
            throw new ApiError(error.status, error.message);
        }
        throw error;
    }
}

function validateIdempotentQueuedJob(params: {
    snapshotId: string;
    data: Record<string, unknown>;
    uid: string;
    projectId: string;
    idempotency: VideoStudioIdempotencyContract;
}) {
    const metadata = params.data.metadata && typeof params.data.metadata === 'object'
        ? params.data.metadata as Record<string, unknown>
        : null;
    const stored = metadata?.idempotency && typeof metadata.idempotency === 'object'
        ? metadata.idempotency as Record<string, unknown>
        : null;
    if (
        params.data.userId !== params.uid
        || params.data.projectId !== params.projectId
        || stored?.version !== params.idempotency.version
        || stored?.keyHash !== params.idempotency.keyHash
        || stored?.requestFingerprint !== params.idempotency.requestFingerprint
    ) {
        throw new ApiError(409, 'The same video request key was already used with different content.');
    }
    return {
        id: params.snapshotId,
        data: params.data,
    };
}

async function getIdempotentQueuedJob(params: {
    uid: string;
    projectId: string;
    idempotency: VideoStudioIdempotencyContract;
}) {
    const snapshot = await db.collection(JOBS).doc(params.idempotency.jobId).get();
    if (!snapshot.exists) return null;
    return validateIdempotentQueuedJob({
        snapshotId: snapshot.id,
        data: snapshot.data() || {},
        ...params,
    });
}

export async function handleVideoStudioJobs(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireAdmin(req);
    const payload = parseJson(req, videoStudioJobRequestSchema);
    const idempotency = readVideoStudioIdempotency(req, auth.uid, payload);
    if (idempotency) {
        const existing = await getIdempotentQueuedJob({
            uid: auth.uid,
            projectId: payload.projectId,
            idempotency,
        });
        if (existing) {
            res.status(200).json({
                success: true,
                jobId: existing.id,
                status: existing.data.status || 'queued',
                deduplicated: true,
            });
            return;
        }
    }
    const project = await requireOwnedProject(auth.uid, payload.projectId);
    const runtime = requiresProviderWorker(payload.operation)
        ? await requireFreshProviderWorker()
        : null;
    const preflight = await preflightQueuedVideoStudioJob(payload, project.data, runtime);
    const created = await createQueuedJob(auth.uid, payload, preflight, idempotency);
    res.status(200).json({
        success: true,
        jobId: created.jobId,
        status: created.status,
        deduplicated: created.deduplicated,
    });
}

async function preflightQueuedVideoStudioJob(
    payload: z.infer<typeof videoStudioJobRequestSchema>,
    project: Record<string, unknown>,
    verifiedRuntime: HostingAiRuntime | null = null,
) {
    if (!['generate', 'extend', 'continue', 'edit'].includes(payload.operation)) {
        return null;
    }
    const runtime = verifiedRuntime ?? await getHostingAiRuntime();
    if (!runtime.openRouterApiKey) {
        throw new ApiError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    }
    const aspectRatio = z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']).parse(project.aspectRatio);
    const resolution = z.enum(['480p', '720p', '1080p']).parse(project.resolution);
    const usesVisualInputs = payload.visualInputMode !== 'text-only';
    const needsContinuationFrame = (payload.repeatCount || 1) > 1;
    const singleSegmentPreflight = await preflightOpenRouterVideo({
        apiKey: runtime.openRouterApiKey,
        duration: payload.duration ?? 6,
        resolution,
        aspectRatio,
        qualityMode: payload.qualityMode || 'proof',
        hasReferenceImage:
            usesVisualInputs &&
            Boolean(payload.referenceImage || payload.sourceClipId || needsContinuationFrame),
        hasEndReferenceImage: usesVisualInputs && Boolean(payload.endReferenceImage),
        hasVisualReferenceImages:
            usesVisualInputs && Boolean(payload.visualReferenceImages?.length),
        audioMode: payload.audioMode || (payload.generateAudio ? 'ambient' : 'silent'),
    });
    const preflight = applyVideoStudioRepeatCost(
        singleSegmentPreflight,
        payload.repeatCount ?? 1,
    );
    if (!preflight.canSubmit) {
        throw new ApiError(
            402,
            'OpenRouter credit balance is below the total estimated cost including repeated generations. Add credits at https://openrouter.ai/settings/credits and retry.',
        );
    }
    if (preflight.estimatedCostUsd === null) {
        throw new ApiError(
            409,
            'The selected OpenRouter model has no verifiable live price. Refresh the model catalog and retry.',
        );
    }
    return preflight;
}

async function createQueuedJob(
    uid: string,
    payload: z.infer<typeof videoStudioJobRequestSchema>,
    preflight: Awaited<ReturnType<typeof preflightQueuedVideoStudioJob>>,
    idempotency: VideoStudioIdempotencyContract | null = null,
): Promise<{ jobId: string; status: string; deduplicated: boolean }> {
    const data = {
        userId: uid,
        projectId: payload.projectId,
        kind: payload.operation === 'extract-frame' ? 'extract-frame' : payload.operation,
        title: payload.clipTitle?.trim() || defaultJobTitle(payload.operation),
        prompt: payload.prompt?.trim() || '',
        status: 'queued',
        progress: 0,
        message: 'Job accepted and waiting for a processor.',
        sourceClipId: payload.sourceClipId || null,
        mergeSourceClipIds: payload.mergeClipIds || [],
        metadata: {
            request: payload,
            ...(preflight ? { preflight: toStoredPreflight(preflight) } : {}),
            ...(preflight
                ? {
                      costEstimate: {
                          repeatCount: preflight.repeatCount,
                          estimatedCostUsdPerSegment: preflight.estimatedCostUsdPerSegment,
                          estimatedTotalCostUsd: preflight.estimatedTotalCostUsd,
                      },
                  }
                : {}),
            ...(preflight
                ? {
                      executionPlan: createOpenRouterVideoExecutionPlan(
                          preflight,
                          payload.qualityMode || 'proof',
                      ),
                  }
                : {}),
            ...(idempotency
                ? {
                      idempotency: {
                          version: idempotency.version,
                          keyHash: idempotency.keyHash,
                          requestFingerprint: idempotency.requestFingerprint,
                      },
                  }
                : {}),
        },
        clipId: null,
        resultVideoUrl: null,
        resultFrameUrl: null,
        errorMessage: null,
        attemptCount: 0,
        claimedAt: null,
        nextAttemptAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!idempotency) {
        const ref = await db.collection(JOBS).add(data);
        return { jobId: ref.id, status: 'queued', deduplicated: false };
    }

    const ref = db.collection(JOBS).doc(idempotency.jobId);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) {
            const existing = validateIdempotentQueuedJob({
                snapshotId: snapshot.id,
                data: snapshot.data() || {},
                uid,
                projectId: payload.projectId,
                idempotency,
            });
            return {
                jobId: existing.id,
                status: typeof existing.data.status === 'string' ? existing.data.status : 'queued',
                deduplicated: true,
            };
        }

        transaction.create(ref, data);
        return { jobId: ref.id, status: 'queued', deduplicated: false };
    });
}

const ProcessJobSchema = z.object({ jobId: z.string().min(1).max(240) });

export async function handleVideoStudioJobProcess(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireAdmin(req);
    const payload = parseJson(req, ProcessJobSchema);
    const existing = await requireOwnedJob(auth.uid, payload.jobId);
    if (queuedJobRequiresProviderWorker(existing.data)) {
        await requireFreshProviderWorker();
    }
    await processQueuedVideoStudioJob(payload.jobId);
    const completed = await requireOwnedJob(auth.uid, payload.jobId);
    res.status(200).json({
        success: true,
        jobId: completed.id,
        status: completed.data.status,
        clipId: completed.data.clipId || null,
        resultVideoUrl: completed.data.resultVideoUrl || null,
        resultFrameUrl: completed.data.resultFrameUrl || null,
    });
}

export async function handleVideoStudioJobRun(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    const auth = await requireAdmin(req);
    const payload = parseJson(req, videoStudioJobRequestSchema);
    const idempotency = readVideoStudioIdempotency(req, auth.uid, payload);
    if (idempotency) {
        const existing = await getIdempotentQueuedJob({
            uid: auth.uid,
            projectId: payload.projectId,
            idempotency,
        });
        if (existing) {
            res.status(200).json({
                success: true,
                jobId: existing.id,
                status: existing.data.status || 'queued',
                clipId: existing.data.clipId || null,
                resultVideoUrl: existing.data.resultVideoUrl || null,
                resultFrameUrl: existing.data.resultFrameUrl || null,
                deduplicated: true,
            });
            return;
        }
    }
    const project = await requireOwnedProject(auth.uid, payload.projectId);
    const runtime = requiresProviderWorker(payload.operation)
        ? await requireFreshProviderWorker()
        : null;
    const preflight = await preflightQueuedVideoStudioJob(payload, project.data, runtime);
    const created = await createQueuedJob(auth.uid, payload, preflight, idempotency);
    if (!created.deduplicated) {
        await processQueuedVideoStudioJob(created.jobId);
    }
    const completed = await requireOwnedJob(auth.uid, created.jobId);
    res.status(200).json({
        success: true,
        jobId: created.jobId,
        status: completed.data.status,
        clipId: completed.data.clipId || null,
        resultVideoUrl: completed.data.resultVideoUrl || null,
        resultFrameUrl: completed.data.resultFrameUrl || null,
        deduplicated: created.deduplicated,
    });
}

const UpdateJobSchema = z.object({
    action: z.enum(['requeue', 'cancel']),
    requireProviderResume: z.boolean().optional().default(false),
});

export async function handleVideoStudioJobById(req: Request, res: Response, jobId: string): Promise<void> {
    requireMethod(req, 'PATCH');
    const auth = await requireAdmin(req);
    const payload = parseJson(req, UpdateJobSchema);
    const ref = db.collection(JOBS).doc(jobId);
    const existing = await requireOwnedJob(auth.uid, jobId);
    if (payload.action === 'requeue' && queuedJobRequiresProviderWorker(existing.data)) {
        await requireFreshProviderWorker();
    }
    const updated = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new ApiError(404, 'The selected job no longer exists.');
        const job = snapshot.data() || {};
        if (job.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this job.');
        if (job.status === 'completed')
            throw new ApiError(
                409,
                `Completed jobs cannot be ${payload.action === 'cancel' ? 'canceled' : 'requeued'}.`,
            );
        if (
            payload.action === 'requeue'
            && (job.status === 'running' || job.status === 'uploading')
        ) {
            throw new ApiError(
                409,
                'Jobs that are already processing cannot be requeued.',
            );
        }
        if (payload.action === 'cancel' && job.status === 'canceled') {
            return { status: 'canceled', cancellationRequested: false, message: job.message || null };
        }
        if (payload.action === 'requeue' && payload.requireProviderResume && !hasResumableProviderVideo(job)) {
            throw new ApiError(
                409,
                '저장된 OpenRouter 작업을 안전하게 이어받을 수 없습니다. 새 유료 요청은 전송하지 않았습니다.',
            );
        }
        const activeCancellation = payload.action === 'cancel'
            && (job.status === 'running' || job.status === 'uploading');
        const values =
            payload.action === 'requeue'
                ? {
                      status: 'queued',
                      progress: 0,
                      message: 'Job requeued and waiting for a processor.',
                      errorMessage: null,
                      claimedAt: null,
                      heartbeatAt: null,
                      leaseExpiresAt: null,
                      nextAttemptAt: null,
                      startedAt: null,
                      finishedAt: null,
                      cancelRequestedAt: null,
                      canceledAt: null,
                  }
                : activeCancellation
                  ? {
                        status: job.status,
                        message: 'Cancellation requested. Processing will stop at the next safe checkpoint.',
                        cancelRequestedAt: job.cancelRequestedAt || admin.firestore.FieldValue.serverTimestamp(),
                    }
                : {
                      status: 'canceled',
                      message: 'Job canceled before processing.',
                      cancelRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
                      canceledAt: admin.firestore.FieldValue.serverTimestamp(),
                      leaseExpiresAt: null,
                      nextAttemptAt: null,
                      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                  };
        transaction.update(ref, {
            ...values,
            ...(payload.action === 'requeue'
                ? {
                      'metadata.queueDispatchToken': randomUUID(),
                      ...(payload.requireProviderResume
                          ? { 'metadata.providerResumeRequired': true }
                          : {}),
                  }
                : {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return {
            status: values.status,
            cancellationRequested: activeCancellation,
            message: values.message,
        };
    });
    res.status(updated.cancellationRequested ? 202 : 200).json({ success: true, jobId, ...updated });
}

const ResequenceSchema = z.object({
    clipIds: z.array(z.string().min(1).max(240)).min(1).max(500),
});

export async function handleVideoStudioTimeline(req: Request, res: Response, projectId: string): Promise<void> {
    requireMethod(req, 'PATCH');
    const auth = await requireUser(req);
    const payload = parseJson(req, ResequenceSchema);
    if (new Set(payload.clipIds).size !== payload.clipIds.length) {
        throw new ApiError(400, 'Timeline reorder payload contains duplicate clip ids.');
    }
    const projectRef = db.collection(PROJECTS).doc(projectId);
    const clipCount = await db.runTransaction(async (transaction) => {
        const query = db.collection(CLIPS).where('projectId', '==', projectId);
        const [project, clips] = await Promise.all([transaction.get(projectRef), transaction.get(query)]);
        if (!project.exists) throw new ApiError(404, 'The selected project no longer exists.');
        if (project.data()?.userId !== auth.uid) throw new ApiError(403, 'You do not have access to this project.');
        const ids = clips.docs.map((item) => item.id);
        if (ids.length !== payload.clipIds.length || payload.clipIds.some((id) => !ids.includes(id))) {
            throw new ApiError(400, 'Timeline reorder payload must include every clip in the project exactly once.');
        }
        const clipsById = new Map(clips.docs.map((item) => [item.id, item.data()]));
        payload.clipIds.forEach((id, index) =>
            transaction.update(db.collection(CLIPS).doc(id), {
                sequence: index,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }),
        );
        const coverId = payload.clipIds[payload.clipIds.length - 1];
        const cover = clipsById.get(coverId) || {};
        transaction.update(projectRef, {
            clipCount: payload.clipIds.length,
            coverClipId: coverId,
            coverUrl:
                cover.posterUrl || cover.lastFrameUrl || cover.videoUrl || project.data()?.starterImageUrl || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return payload.clipIds.length;
    });
    res.status(200).json({ success: true, projectId, clipCount });
}

const StorageCleanupSchema = z.object({
    storagePaths: z.array(z.string().trim().min(1).max(1024)).min(1).max(250),
});

function videoStudioStoragePrefix(userId: string, projectId: string): string {
    return `video_studio/${userId}/${projectId}/`;
}

function storedVideoFileKind(path: string): 'video' | 'frame' | 'audio' | 'other' {
    if (/\.(mp4|mov|webm)$/i.test(path)) return 'video';
    if (/\.(png|jpe?g|webp)$/i.test(path)) return 'frame';
    if (/\.(mp3|wav|m4a|aac)$/i.test(path)) return 'audio';
    return 'other';
}

async function getOwnedVideoStudioStorageSnapshot(userId: string, projectId: string) {
    const project = await requireOwnedProject(userId, projectId);
    const prefix = videoStudioStoragePrefix(userId, project.id);
    const [clipSnapshot, jobSnapshot] = await Promise.all([
        db.collection(CLIPS).where('projectId', '==', project.id).get(),
        db.collection(JOBS).where('projectId', '==', project.id).get(),
    ]);
    const protectedPaths = new Set<string>();
    const collectPath = (value: unknown) => {
        const storagePath = storagePathFromVideoStudioUrl(value, prefix);
        if (storagePath) protectedPaths.add(storagePath);
    };

    clipSnapshot.docs.forEach((snapshot) => {
        const clip = snapshot.data();
        collectPath(clip.videoUrl);
        collectPath(clip.posterUrl);
        collectPath(clip.lastFrameUrl);
        collectPath(clip.sourceVideoUrl);
    });

    const existingClipIds = new Set(clipSnapshot.docs.map((snapshot) => snapshot.id));

    let activeJobCount = 0;
    jobSnapshot.docs.forEach((snapshot) => {
        const job = snapshot.data();
        const active = ACTIVE_STORAGE_JOB_STATUSES.has(String(job.status || ''));
        if (active) activeJobCount += 1;
        if (active || !job.clipId || existingClipIds.has(String(job.clipId))) {
            collectPath(job.resultVideoUrl);
            collectPath(job.resultFrameUrl);
        }
    });

    const [files] = await admin.storage().bucket().getFiles({
        prefix,
        maxResults: VIDEO_STUDIO_STORAGE_PAGE_SIZE,
        autoPaginate: false,
    });
    const cleanupCandidates = files
        .filter((file) => !protectedPaths.has(file.name))
        .map((file) => {
            const rawSize = Number(file.metadata.size ?? 0);
            return {
                path: file.name,
                sizeBytes: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : 0,
                updatedAt: typeof file.metadata.updated === 'string' ? file.metadata.updated : null,
                kind: storedVideoFileKind(file.name),
            };
        })
        .sort((left, right) => right.sizeBytes - left.sizeBytes || left.path.localeCompare(right.path));
    const overview = {
        projectId: project.id,
        cleanupLocked: activeJobCount > 0,
        activeJobCount,
        protectedFileCount: protectedPaths.size,
        cleanupCandidateCount: cleanupCandidates.length,
        cleanupCandidateBytes: cleanupCandidates.reduce((total, file) => total + file.sizeBytes, 0),
        cleanupCandidates,
        truncated: files.length >= VIDEO_STUDIO_STORAGE_PAGE_SIZE,
    };
    return {
        overview,
        candidatePaths: new Set(cleanupCandidates.map((file) => file.path)),
    };
}

export async function handleVideoStudioProjectStorage(req: Request, res: Response, projectId: string): Promise<void> {
    requireMethod(req, ['GET', 'DELETE']);
    const auth = await requireUser(req);
    const parsedProjectId = z.string().trim().min(1).max(240).safeParse(projectId);
    if (!parsedProjectId.success) throw new ApiError(400, 'Invalid video project.');
    const snapshot = await getOwnedVideoStudioStorageSnapshot(auth.uid, parsedProjectId.data);

    if (req.method === 'GET') {
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, overview: snapshot.overview });
        return;
    }

    const payload = parseJson(req, StorageCleanupSchema, 'Choose one or more files to clean up.');
    if (snapshot.overview.cleanupLocked) {
        throw new ApiError(
            409,
            'Rendering is still in progress. Finish or cancel active jobs before cleaning up files.',
        );
    }
    const requestedPaths = [...new Set(payload.storagePaths)].filter((path) => snapshot.candidatePaths.has(path));
    if (!requestedPaths.length) throw new ApiError(400, 'No safe residual files were selected for cleanup.');

    const bucket = admin.storage().bucket();
    const results = await Promise.all(
        requestedPaths.map(async (storagePath) => {
            try {
                await bucket.file(storagePath).delete({ ignoreNotFound: true });
                return { storagePath, deleted: true, message: null };
            } catch (error) {
                return {
                    storagePath,
                    deleted: false,
                    message: error instanceof Error ? error.message : 'Failed to delete the file.',
                };
            }
        }),
    );
    res.status(200).json({
        success: true,
        deletedStoragePaths: results.filter((result) => result.deleted).map((result) => result.storagePath),
        failed: results.flatMap((result) =>
            result.deleted || !result.message ? [] : [{ storagePath: result.storagePath, message: result.message }],
        ),
    });
}
