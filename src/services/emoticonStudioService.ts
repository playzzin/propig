import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { z } from 'zod';
import { db } from '@/firebase/config';
import { asiaNortheastFunctions } from '@/firebase/functions';
import { toEmoticonOutputProfile } from '@/lib/emoticonPlatformProfiles';
import {
  getEmoticonJobStallState,
  isEmoticonJobStalled,
  type EmoticonJobStallState,
} from '@/lib/emoticonJobHealth';
import {
  emoticonJobSchema,
  emoticonBatchSchema,
  emoticonBatchRetryResultSchema,
  emoticonImageEditRecipeSchema,
  emoticonManualFrameAssetSchema,
  getEmoticonMotionAcceptanceRequirements,
  hasEmoticonProjectItemLeaseConflict,
  meetsEmoticonMotionAcceptance,
  meetsEmoticonPoseAcceptance,
  type EmoticonBubble,
  type EmoticonBatch,
  type EmoticonBatchRetryResult,
  type EmoticonCharacterAnalysis,
  type EmoticonCharacterAnalysisEstimate,
  type EmoticonExportFormat,
  type EmoticonFrameTransition,
  type EmoticonJob,
  type EmoticonImageEditRecipe,
  type EmoticonMotionOverride,
  type EmoticonMotionPreference,
  type EmoticonResourceMode,
  type EmoticonManualFrameAsset,
  type EmoticonManualFrameTiming,
  type EmoticonOutputProfile,
  type EmoticonReferenceImage,
} from '@/schemas/emoticonStudio';
import { resolveEmoticonPlatformProfile } from '@/services/emoticonPlatformPolicyService';

export type EmoticonSource = {
  sourceImageUrl: string;
  sourceStoragePath: string;
};

async function resolveGenerationOutputPolicy(params: {
  outputProfile: EmoticonOutputProfile;
  formats: EmoticonExportFormat[];
}): Promise<{
  outputProfile: EmoticonOutputProfile;
  formats: EmoticonExportFormat[];
}> {
  const platformProfile = await resolveEmoticonPlatformProfile({
    platform: params.outputProfile.platform,
    type: params.outputProfile.type,
  });
  const outputProfile = toEmoticonOutputProfile(platformProfile);
  const requestedFormats = Array.from(new Set(params.formats));
  const allowedFormats = requestedFormats.filter((format) => (
    platformProfile.allowedFormats.includes(format)
  ));
  return {
    outputProfile,
    formats: allowedFormats.length ? allowedFormats : [platformProfile.preferredFormat],
  };
}

const emoticonSourceResponseSchema = z.object({
  sourceImageUrl: z.string().url(),
  sourceStoragePath: z.string().min(1),
});

export type SubmitEmoticonJobInput = {
  userId: string;
  instruction: string;
  motionPreference: EmoticonMotionPreference;
  resourceMode: EmoticonResourceMode;
  formats: EmoticonExportFormat[];
  sourceFile?: File;
  source?: EmoticonSource;
  referenceImages?: EmoticonReferenceImage[];
  bubbleOverride?: EmoticonBubble;
  motionOverride?: EmoticonMotionOverride;
  outputProfile?: EmoticonOutputProfile;
  projectId?: string;
  projectItemId?: string;
  expectedProjectRevision?: number;
  expectedProjectItemRevision?: number;
  batchId?: string;
  batchEnqueueRoundId?: string;
  batchRetryRound?: number;
  batchItemAttemptCount?: number;
};

export type CreateEmoticonTemplatePlanInput = {
  userId: string;
  sourceFile?: File;
  source?: EmoticonSource;
  referenceImages?: EmoticonReferenceImage[];
  projectId: string;
  templateRequest: string;
  templateItemCount: number;
  outputProfile?: EmoticonOutputProfile;
  resourceMode: EmoticonResourceMode;
};

export type CreateEmoticonCharacterProfileInput = {
  userId: string;
  source: EmoticonSource;
  referenceImages?: EmoticonReferenceImage[];
  projectId: string;
  resourceMode: EmoticonResourceMode;
  rightsAttested?: boolean;
};

export function estimateEmoticonCharacterAnalysis(
  resourceMode: EmoticonResourceMode,
  referenceCount: number,
): EmoticonCharacterAnalysisEstimate {
  const normalizedReferenceCount = Math.max(1, Math.min(4, Math.round(referenceCount)));
  return {
    mode: resourceMode,
    referenceCount: normalizedReferenceCount,
    expectedSecondsMin: resourceMode === 'efficient' ? 10 : resourceMode === 'balanced' ? 15 : 20,
    expectedSecondsMax: resourceMode === 'efficient'
      ? 25 + (normalizedReferenceCount * 5)
      : resourceMode === 'balanced'
        ? 40 + (normalizedReferenceCount * 5)
        : 55 + (normalizedReferenceCount * 5),
    expectedRequestCountMin: 1,
    expectedRequestCountMax: 2,
  };
}

export type CreateEmoticonCharacterSheetPlanInput = CreateEmoticonCharacterProfileInput & {
  profileJobId: string;
  sheetRequest: string;
  sheetItemCount: number;
};

export type RequestEmoticonJobCancellationInput = {
  userId: string;
  jobId: string;
};

export type RegenerateEmoticonFrameInput = {
  userId: string;
  job: EmoticonJob;
  frameIndex: number;
  formats?: EmoticonExportFormat[];
  projectId?: string;
  projectItemId?: string;
};

export type SubmitEmoticonFrameImportInput = {
  userId: string;
  projectId: string;
  projectItemId: string;
  expectedProjectRevision: number;
  expectedProjectItemRevision: number;
  frames: Array<{
    kind: 'file';
    uploadRequestId: string;
    file: File;
  } | {
    kind: 'container';
    uploadRequestId: string;
    file: File;
  } | {
    kind: 'completed-static';
    uploadRequestId: string;
    sourceJobId: string;
  }>;
  timing: EmoticonManualFrameTiming;
  formats: EmoticonExportFormat[];
  bubble?: EmoticonBubble;
  outputProfile: EmoticonOutputProfile;
  editRecipe?: EmoticonImageEditRecipe;
};

const ALLOWED_SOURCE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PREPARED_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_CONTAINER_BYTES = 20 * 1024 * 1024;
export const EMOTICON_GPT_LIGHT_PROFILE = 'gpt-light-v1' as const;
export const EMOTICON_LOCAL_SUBJECT_COMPOSITE_REASON = 'efficient-local-composite-v1' as const;

function lightGenerationProfile(resourceMode: EmoticonResourceMode) {
  return resourceMode === 'efficient'
    ? { aiGenerationProfile: EMOTICON_GPT_LIGHT_PROFILE }
    : {};
}

/**
 * Some historical efficient jobs were stamped with the GPT Light profile even
 * though no provider image-generation request ran. Those files are valid local
 * composites, but they must never be presented or reused as AI-rendered subject
 * generations.
 */
export function hasEmoticonSubjectGenerationMismatch(
  job: Pick<
    EmoticonJob,
    'aiGenerationProfile' | 'motionFallbackReason' | 'openRouterUsageRequestCount'
  > | null | undefined,
): boolean {
  return Boolean(
    job?.aiGenerationProfile === EMOTICON_GPT_LIGHT_PROFILE
    && (
      job.motionFallbackReason === EMOTICON_LOCAL_SUBJECT_COMPOSITE_REASON
      || job.openRouterUsageRequestCount === 0
    )
  );
}

export {
  getEmoticonJobStallState,
  isEmoticonJobStalled,
  type EmoticonJobStallState,
};

function inferSourceContentType(file: File): string | null {
  if (ALLOWED_SOURCE_TYPES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return null;
}

export function validateEmoticonSourceFile(file: File): string | null {
  if (!inferSourceContentType(file)) return 'PNG, JPG, WebP 이미지만 사용할 수 있어요.';
  if (!file.size || file.size > MAX_SOURCE_FILE_BYTES) return '원본 이미지는 25MB 이하여야 해요.';
  return null;
}

const jobsCollection = (userId: string) => collection(db, 'users', userId, 'emoticonJobs');
const jobDocument = (userId: string, jobId: string) => doc(db, 'users', userId, 'emoticonJobs', jobId);
const batchesCollection = (userId: string) => collection(db, 'users', userId, 'emoticonBatches');
const batchDocument = (userId: string, batchId: string) => (
  doc(db, 'users', userId, 'emoticonBatches', batchId)
);
const projectDocument = (userId: string, projectId: string) => (
  doc(db, 'users', userId, 'emoticonProjects', projectId)
);
const projectItemDocument = (userId: string, projectId: string, itemId: string) => (
  doc(db, 'users', userId, 'emoticonProjects', projectId, 'items', itemId)
);

async function createJobWithProjectItemLease(params: {
  userId: string;
  jobId: string;
  projectId?: string;
  projectItemId?: string;
  expectedProjectRevision?: number;
  expectedProjectItemRevision?: number;
  batchId?: string;
  batchEnqueueRoundId?: string;
  batchRetryRound?: number;
  batchItemAttemptCount?: number;
  jobData: Record<string, unknown>;
}): Promise<boolean> {
  const hasProject = Boolean(params.projectId);
  const hasItem = Boolean(params.projectItemId);
  if (hasProject !== hasItem) {
    throw new Error('프로젝트 작업에는 프로젝트와 항목 정보가 모두 필요합니다.');
  }
  if (params.batchId && (!params.projectId || !params.projectItemId)) {
    throw new Error('배치 작업에는 프로젝트와 항목 정보가 모두 필요합니다.');
  }
  if (
    params.batchId
    && (params.expectedProjectRevision === undefined
      || params.expectedProjectItemRevision === undefined
      || !params.batchEnqueueRoundId
      || params.batchRetryRound === undefined
      || params.batchItemAttemptCount === undefined)
  ) {
    throw new Error('배치 작업에는 서버가 발급한 등록 회차와 항목 시도 정보가 모두 필요합니다.');
  }
  const jobRef = jobDocument(params.userId, params.jobId);
  if (!params.projectId || !params.projectItemId) {
    await setDoc(jobRef, params.jobData);
    return false;
  }

  const projectRef = projectDocument(params.userId, params.projectId);
  const itemRef = projectItemDocument(params.userId, params.projectId, params.projectItemId);
  const batchRef = params.batchId ? batchDocument(params.userId, params.batchId) : null;
  const activeJobCreatedAtMs = Date.now();
  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, projectSnapshot, itemSnapshot, batchSnapshot] = await Promise.all([
      transaction.get(jobRef),
      transaction.get(projectRef),
      transaction.get(itemRef),
      batchRef ? transaction.get(batchRef) : Promise.resolve(null),
    ]);
    if (jobSnapshot.exists()) {
      const existing = jobSnapshot.data();
      if (
        existing.userId === params.userId
        && existing.projectId === params.projectId
        && existing.projectItemId === params.projectItemId
        && (params.batchId ? existing.batchId === params.batchId : !existing.batchId)
        && (params.batchId
          ? existing.batchEnqueueRoundId === params.batchEnqueueRoundId
            && existing.batchRetryRound === params.batchRetryRound
            && existing.batchItemAttemptCount === params.batchItemAttemptCount
          : true)
        && itemSnapshot.exists()
        && itemSnapshot.data().jobId === params.jobId
      ) return;
      throw new Error('동일한 작업 번호가 이미 사용 중입니다.');
    }
    if (!projectSnapshot.exists() || projectSnapshot.data().userId !== params.userId) {
      throw new Error('연결할 프로젝트를 찾을 수 없습니다.');
    }
    const projectData = projectSnapshot.data();
    if (projectData.deletionLocked === true) {
      throw new Error('삭제가 진행 중인 프로젝트에는 새 작업을 등록할 수 없습니다.');
    }
    const projectRevision = typeof projectData.revision === 'number'
      && Number.isInteger(projectData.revision)
      ? projectData.revision as number
      : 0;
    if (
      params.expectedProjectRevision !== undefined
      && params.expectedProjectRevision !== projectRevision
    ) {
      throw new Error('프로젝트 설정이 작업 준비 중 변경됐어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.');
    }
    if (params.batchId) {
      const parsedBatch = batchSnapshot?.exists()
        ? emoticonBatchSchema.safeParse({ id: batchSnapshot.id, ...batchSnapshot.data() })
        : null;
      const batch = parsedBatch?.success ? parsedBatch.data : null;
      const batchItem = batch?.items.find((candidate) => candidate.itemId === params.projectItemId);
      if (
        !batch
        || batch.userId !== params.userId
        || batch.projectId !== params.projectId
        || batch.projectRevision !== projectRevision
        || !Array.isArray(batch.itemIds)
        || !batch.itemIds.includes(params.projectItemId as string)
        || !batchItem
        || batchItem.status !== 'pending'
        || batchItem.currentJobId !== null
        || batch.enqueueRoundId !== params.batchEnqueueRoundId
        || batch.retryRound !== params.batchRetryRound
        || batchItem.enqueueRoundId !== params.batchEnqueueRoundId
        || batchItem.retryRound !== params.batchRetryRound
        || batchItem.attemptCount !== params.batchItemAttemptCount
        || batch.enqueueItemAttempts?.[params.projectItemId as string]
          !== params.batchItemAttemptCount
        || batchItem.enqueueProjectItemRevision !== params.expectedProjectItemRevision
        || batch.enqueueItemRevisions?.[params.projectItemId as string]
          !== params.expectedProjectItemRevision
        || typeof batch.enqueueRoundLeaseExpiresAtMs !== 'number'
        || batch.enqueueRoundLeaseExpiresAtMs <= activeJobCreatedAtMs
        || !['preparing', 'running', 'deferred'].includes(String(batch.status))
        || batch.cancelRequestedAt
      ) {
        throw new Error('배치가 종료되었거나 이 항목을 포함하지 않아 작업을 등록할 수 없습니다.');
      }
    }
    if (!itemSnapshot.exists()) throw new Error('생성할 프로젝트 항목을 찾을 수 없습니다.');
    const item = itemSnapshot.data();
    const currentJobId = typeof item.jobId === 'string' ? item.jobId : '';
    const currentStatus = typeof item.generationStatus === 'string' ? item.generationStatus : '';
    if (hasEmoticonProjectItemLeaseConflict({
      currentStatus,
      currentJobId,
      nextJobId: params.jobId,
    })) {
      throw new Error('이 항목은 다른 탭이나 작업에서 이미 생성 중입니다. 완료 또는 취소 후 다시 시도해 주세요.');
    }
    const projectItemRevision = typeof item.revision === 'number' && Number.isInteger(item.revision)
      ? item.revision as number
      : 0;
    if (
      params.expectedProjectItemRevision !== undefined
      && params.expectedProjectItemRevision !== projectItemRevision
    ) {
      throw new Error('항목 설정이 작업 준비 중 변경됐어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.');
    }
    if (params.batchId && batchSnapshot?.exists()) {
      const parsedBatch = emoticonBatchSchema.safeParse({
        id: batchSnapshot.id,
        ...batchSnapshot.data(),
      });
      const retryTarget = parsedBatch.success
        ? parsedBatch.data.lastRetryTargets?.find((target) => target.itemId === params.projectItemId)
        : undefined;
      if (
        parsedBatch.success
        && parsedBatch.data.retryRound > 0
        && (
          parsedBatch.data.lastRetryProjectRevision !== projectRevision
          || !retryTarget
          || retryTarget.itemRevision !== projectItemRevision
        )
      ) {
        throw new Error('재시도 승인 뒤 프로젝트 또는 항목이 변경되어 비용 발생 작업을 중단했습니다.');
      }
    }
    const revision = projectItemRevision
      ? projectItemRevision + 1
      : 1;
    transaction.set(jobRef, {
      ...params.jobData,
      projectRevision,
      projectItemRevision,
      ...(params.batchId
        ? {
          batchEnqueueRoundId: params.batchEnqueueRoundId,
          batchRetryRound: params.batchRetryRound,
          batchItemAttemptCount: params.batchItemAttemptCount,
        }
        : {}),
    });
    transaction.update(itemRef, {
      jobId: params.jobId,
      generationStatus: 'queued',
      validationErrors: [],
      activeJobCreatedAtMs,
      revision,
      updatedAt: serverTimestamp(),
    });
  });
  return true;
}

export function canReuseEmoticonAnimationFrames(job: EmoticonJob): boolean {
  if (
    hasEmoticonSubjectGenerationMismatch(job)
    || job.status !== 'completed'
    || job.plan?.action.renderMode !== 'dynamic'
    || !job.animationFrames
    || job.animationFrames.length !== job.plan.action.frameCount
    || !job.frameSequencePlan
    || job.frameSequencePlan.frames.length !== job.plan.action.frameCount
    || job.frameSequencePlan.frames.some((frame, index) => frame.frameIndex !== index)
    || !job.motionReview
    || !meetsEmoticonMotionAcceptance(
      job.motionReview,
      getEmoticonMotionAcceptanceRequirements(job.plan),
    )
    || job.specReport?.technicalPass !== true
    || job.specReport.allOutputsPass !== true
    || job.formats.length === 0
  ) return false;
  const expectedFramePrefix = `users/${job.userId}/emoticon-studio/jobs/${job.id}/`;
  if (job.animationFrames.some((frame) => !frame.storagePath.startsWith(expectedFramePrefix))) {
    return false;
  }
  return job.formats.every((format) => {
    const inspection = job.outputs?.[format]?.inspection;
    return inspection?.format === format && inspection.passed === true;
  });
}

export function canReuseEmoticonKeyPose(job: EmoticonJob): boolean {
  if (
    hasEmoticonSubjectGenerationMismatch(job)
    || !job.plan
    || job.plan.action.renderMode === 'dynamic'
    || !job.keyPoseStoragePath
  ) return false;
  const acceptedQuality = Boolean(job.quality && meetsEmoticonPoseAcceptance(job.quality));
  const verifiedRenderFailure = Boolean(
    job.renderFailureRecovery?.stage === 'render'
    && job.renderFailureRecovery.category === 'infrastructure'
    && job.renderFailureRecovery.poseAccepted,
  );
  return acceptedQuality || verifiedRenderFailure;
}

/**
 * Manual imports intentionally never satisfy the AI identity/motion reuse
 * contract. They may still be re-rendered after their owned source frames and
 * every encoded output passed the server's technical inspection.
 */
export function canReuseManualEmoticonFrames(job: EmoticonJob): boolean {
  const report = job.manualImportReport;
  const plan = job.plan;
  const frames = job.animationFrames;
  const profile = job.outputProfile;
  if (
    job.status !== 'completed'
    || !report
    || report.technicalOnly !== true
    || report.aiCalls !== 0
    || report.identityVerified !== false
    || report.motionVerified !== false
    || !plan
    || !frames
    || !profile
    || frames.length !== plan.action.frameCount
    || report.sourceFrameCount !== plan.action.frameCount
    || job.specReport?.technicalPass !== true
    || job.specReport.allOutputsPass !== true
    || job.specReport.frameCount !== plan.action.frameCount
    || job.specReport.width !== profile.width
    || job.specReport.height !== profile.height
    || !job.formats.length
  ) return false;
  const isStatic = profile.type === 'static';
  if (
    (isStatic && (plan.action.frameCount !== 1 || plan.action.renderMode === 'dynamic'))
    || (!isStatic && (plan.action.frameCount < 2 || plan.action.renderMode !== 'dynamic'))
    || (report.timingMode === 'per_frame'
      ? isStatic || report.frameDurationsMs.length !== plan.action.frameCount
      : report.frameDurationsMs.length !== 0)
  ) return false;
  const expectedFramePrefix = `users/${job.userId}/emoticon-studio/jobs/${job.id}/`;
  if (frames.some((frame) => !frame.storagePath.startsWith(expectedFramePrefix))) return false;
  return job.formats.every((format) => {
    const inspection = job.outputs?.[format]?.inspection;
    return inspection?.format === format && inspection.passed === true;
  });
}

export function canReuseVerifiedEmoticonFrames(job: EmoticonJob): boolean {
  if (
    hasEmoticonSubjectGenerationMismatch(job)
    || job.status !== 'completed'
    || !job.plan
    || job.specReport?.technicalPass !== true
    || job.specReport.allOutputsPass !== true
  ) return false;
  if (
    !job.formats.length
    || job.formats.some((format) => {
      const inspection = job.outputs?.[format]?.inspection;
      return inspection?.format !== format || inspection.passed !== true;
    })
  ) return false;
  return job.plan.action.renderMode === 'dynamic'
    ? canReuseEmoticonAnimationFrames(job)
    : canReuseEmoticonKeyPose(job);
}

function parseJob(jobId: string, value: Record<string, unknown>): EmoticonJob | null {
  const parsed = emoticonJobSchema.safeParse({ id: jobId, ...value });
  if (!parsed.success) {
    const recoverableRoots = new Set(['frameContinuation', 'frameRepair', 'renderFailureRecovery']);
    const invalidRecoveryRoots = new Set<string>(
      parsed.error.issues
        .map((issue) => issue.path[0])
        .filter((root): root is string => typeof root === 'string' && recoverableRoots.has(root)),
    );
    if (invalidRecoveryRoots.size > 0 && parsed.error.issues.every((issue) => (
      typeof issue.path[0] === 'string' && invalidRecoveryRoots.has(issue.path[0])
    ))) {
      const sanitized = { ...value };
      invalidRecoveryRoots.forEach((root) => delete sanitized[root]);
      const recovered = emoticonJobSchema.safeParse({ id: jobId, ...sanitized });
      if (recovered.success) {
        console.warn('[Emoticon Studio] Loaded a legacy job without invalid recovery metadata.', {
          jobId,
          omittedFields: Array.from(invalidRecoveryRoots),
        });
        return recovered.data;
      }
    }
    console.warn('[Emoticon Studio] Ignored an invalid job snapshot.', parsed.error.issues);
    return null;
  }
  return parsed.data;
}

function parseBatch(batchId: string, value: Record<string, unknown>): EmoticonBatch | null {
  const parsed = emoticonBatchSchema.safeParse({ id: batchId, ...value });
  if (!parsed.success) {
    console.warn('[Emoticon Studio] Ignored an invalid batch snapshot.', parsed.error.issues);
    return null;
  }
  return parsed.data;
}

async function prepareSourceFile(file: File): Promise<File> {
  if (file.size <= 3 * 1024 * 1024) return file;
  const imageCompression = (await import('browser-image-compression')).default;
  const prepared = await imageCompression(file, {
    maxSizeMB: 3,
    maxWidthOrHeight: 1800,
    useWebWorker: true,
    preserveExif: false,
    fileType: file.type === 'image/png' ? 'image/png' : 'image/webp',
    initialQuality: 0.9,
  });
  if (prepared.size > MAX_PREPARED_FILE_BYTES) {
    throw new Error('이미지를 5MB 이하로 줄이지 못했어요. 더 작은 원본을 사용해 주세요.');
  }
  return prepared;
}

export function getEmoticonSourceUploadErrorMessage(error: unknown): string {
  const candidate = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown }
    : null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const message = typeof candidate?.message === 'string' ? candidate.message.trim() : '';

  if (code === 'functions/unauthenticated') {
    return '로그인이 만료됐어요. 다시 로그인한 뒤 원본 업로드를 시도해 주세요.';
  }
  if (code === 'functions/permission-denied') {
    return '원본을 업로드할 관리자 권한이 없어요. 현재 계정 권한을 확인해 주세요.';
  }
  if (code === 'functions/resource-exhausted') {
    return message || '업로드 요청이 너무 많아요. 잠시 기다린 뒤 다시 시도해 주세요.';
  }
  if (code === 'functions/invalid-argument') {
    return message || '원본 이미지 형식이나 크기를 확인해 주세요.';
  }

  const connectionFailure = new Set([
    'functions/deadline-exceeded',
    'functions/internal',
    'functions/not-found',
    'functions/unavailable',
  ]).has(code) || /failed to fetch|network request failed|load failed/i.test(message);
  if (connectionFailure) {
    return '원본 업로드 서버에 연결하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요. 계속되면 uploadEmoticonSource 함수의 배포 상태를 확인해 주세요.';
  }

  return message || '원본 이미지를 업로드하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
}

export async function uploadEmoticonSource(userId: string, file: File): Promise<EmoticonSource> {
  const validationError = validateEmoticonSourceFile(file);
  if (validationError) throw new Error(validationError);
  const inferredContentType = inferSourceContentType(file) as string;
  const normalizedFile = file.type === inferredContentType
    ? file
    : new File([file], file.name, { type: inferredContentType, lastModified: file.lastModified });
  const prepared = await prepareSourceFile(normalizedFile);
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      if (separator < 0) reject(new Error('이미지 파일을 읽지 못했습니다.'));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(prepared);
  });
  const callable = httpsCallable<
    { fileName: string; contentType: string; base64: string },
    EmoticonSource
  >(asiaNortheastFunctions, 'uploadEmoticonSource');
  let response: Awaited<ReturnType<typeof callable>>;
  try {
    response = await callable({
      fileName: file.name.slice(0, 180),
      contentType: prepared.type,
      base64,
    });
  } catch (error) {
    throw new Error(getEmoticonSourceUploadErrorMessage(error));
  }
  const parsed = emoticonSourceResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error('업로드 서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!parsed.data.sourceStoragePath.startsWith(`users/${userId}/emoticon-studio/sources/`)) {
    throw new Error('업로드된 원본 이미지의 소유권을 확인하지 못했습니다.');
  }
  return parsed.data;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      if (separator < 0) reject(new Error('이미지 파일을 읽지 못했습니다.'));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadEmoticonImportFrame(params: {
  userId: string;
  projectId: string;
  projectItemId: string;
  uploadRequestId: string;
  file: File;
}): Promise<EmoticonManualFrameAsset> {
  const validationError = validateEmoticonSourceFile(params.file);
  if (validationError) throw new Error(validationError);
  if (params.file.size > MAX_PREPARED_FILE_BYTES) {
    throw new Error('수동 프레임은 장당 5MB 이하여야 합니다.');
  }
  const contentType = inferSourceContentType(params.file);
  if (!contentType) throw new Error('PNG, JPG, WebP 이미지만 사용할 수 있습니다.');
  const base64 = await fileToBase64(params.file);
  const callable = httpsCallable<
    {
      uploadRequestId: string;
      projectId: string;
      projectItemId: string;
      fileName: string;
      contentType: string;
      base64: string;
    },
    EmoticonManualFrameAsset
  >(asiaNortheastFunctions, 'uploadEmoticonImportFrame');
  const response = await callable({
    uploadRequestId: params.uploadRequestId,
    projectId: params.projectId,
    projectItemId: params.projectItemId,
    fileName: params.file.name.slice(0, 180),
    contentType,
    base64,
  });
  const parsed = emoticonManualFrameAssetSchema.safeParse(response.data);
  if (!parsed.success) throw new Error('업로드한 프레임 응답을 확인하지 못했습니다.');
  if (!parsed.data.sourceStoragePath.startsWith(`users/${params.userId}/emoticon-studio/sources/manual-`)) {
    throw new Error('업로드한 프레임의 소유권을 확인하지 못했습니다.');
  }
  return parsed.data;
}

function inferImportContainerContentType(file: File): 'image/gif' | 'image/webp' | 'image/png' | null {
  if (file.type === 'image/gif' || file.type === 'image/webp' || file.type === 'image/png') return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'png' || extension === 'apng') return 'image/png';
  return null;
}

async function extractEmoticonImportContainer(params: {
  userId: string;
  projectId: string;
  projectItemId: string;
  uploadRequestId: string;
  file: File;
}): Promise<EmoticonManualFrameAsset[]> {
  if (!params.file.size || params.file.size > MAX_IMPORT_CONTAINER_BYTES) {
    throw new Error('움짤 파일은 20MB 이하여야 합니다.');
  }
  const contentType = inferImportContainerContentType(params.file);
  if (!contentType) throw new Error('GIF, 움직이는 WebP 또는 APNG만 가져올 수 있습니다.');
  const callable = httpsCallable<
    {
      uploadRequestId: string;
      projectId: string;
      projectItemId: string;
      fileName: string;
      contentType: 'image/gif' | 'image/webp' | 'image/png';
      base64: string;
    },
    EmoticonManualFrameAsset[]
  >(asiaNortheastFunctions, 'extractEmoticonImportContainer');
  const response = await callable({
    uploadRequestId: params.uploadRequestId,
    projectId: params.projectId,
    projectItemId: params.projectItemId,
    fileName: params.file.name.slice(0, 180),
    contentType,
    base64: await fileToBase64(params.file),
  });
  const parsed = emoticonManualFrameAssetSchema.array().min(2).max(24).safeParse(response.data);
  if (!parsed.success) throw new Error('움짤 프레임 추출 결과를 확인하지 못했습니다.');
  if (parsed.data.some((asset) => !asset.sourceStoragePath.startsWith(`users/${params.userId}/emoticon-studio/sources/manual-`))) {
    throw new Error('추출한 움짤 프레임의 소유권을 확인하지 못했습니다.');
  }
  return parsed.data;
}

async function copyCompletedStaticEmoticonFrame(params: {
  userId: string;
  projectId: string;
  projectItemId: string;
  uploadRequestId: string;
  sourceJobId: string;
}): Promise<EmoticonManualFrameAsset> {
  const callable = httpsCallable<
    {
      uploadRequestId: string;
      projectId: string;
      projectItemId: string;
      sourceJobId: string;
    },
    EmoticonManualFrameAsset
  >(asiaNortheastFunctions, 'copyCompletedStaticEmoticonFrame');
  const response = await callable({
    uploadRequestId: params.uploadRequestId,
    projectId: params.projectId,
    projectItemId: params.projectItemId,
    sourceJobId: params.sourceJobId,
  });
  const parsed = emoticonManualFrameAssetSchema.safeParse(response.data);
  if (!parsed.success) throw new Error('정지 컷 복사 결과를 확인하지 못했습니다.');
  if (!parsed.data.sourceStoragePath.startsWith(`users/${params.userId}/emoticon-studio/sources/manual-`)) {
    throw new Error('복사한 정지 컷의 소유권을 확인하지 못했습니다.');
  }
  return parsed.data;
}

function clampImportedBubble(bubble: EmoticonBubble | undefined, frameCount: number): EmoticonBubble | undefined {
  if (!bubble) return undefined;
  const lastFrame = Math.max(0, frameCount - 1);
  const startFrame = Math.min(lastFrame, Math.max(0, bubble.timeline.startFrame));
  const endFrame = bubble.timeline.endFrame === null
    ? null
    : Math.max(startFrame, Math.min(lastFrame, bubble.timeline.endFrame));
  return {
    ...bubble,
    timeline: {
      ...bubble.timeline,
      startFrame,
      endFrame,
      cues: bubble.timeline.cues.map((cue) => {
        const cueStart = Math.min(lastFrame, Math.max(0, cue.startFrame));
        return {
          ...cue,
          startFrame: cueStart,
          endFrame: Math.max(cueStart, Math.min(lastFrame, cue.endFrame)),
        };
      }),
    },
  };
}

async function deterministicImportRequestId(input: {
  frameUploadIds: string[];
  timing: EmoticonManualFrameTiming;
  formats: EmoticonExportFormat[];
  projectId: string;
  projectItemId: string;
  bubble?: EmoticonBubble;
  outputProfile: EmoticonOutputProfile;
  editRecipe?: EmoticonImageEditRecipe;
}): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('').slice(0, 64);
}

export async function submitEmoticonFrameImportJob(
  input: SubmitEmoticonFrameImportInput,
): Promise<{ jobId: string; itemLeaseClaimed: boolean }> {
  const resolvedPolicy = await resolveGenerationOutputPolicy({
    outputProfile: input.outputProfile,
    formats: input.formats,
  });
  const outputProfile = resolvedPolicy.outputProfile;
  const formats = resolvedPolicy.formats;
  const draftFrameCount = input.frames.length;
  const containerCount = input.frames.filter((frame) => frame.kind === 'container').length;
  if (outputProfile.type === 'static'
    ? draftFrameCount !== 1 || containerCount > 0
    : containerCount ? draftFrameCount !== 1 : draftFrameCount < 2 || draftFrameCount > 24) {
    throw new Error(outputProfile.type === 'static'
      ? '정지형은 이미지 1장이 필요합니다.'
      : '움직이는 이모티콘은 이미지 2~24장이 필요합니다.');
  }
  if (containerCount && (containerCount !== 1 || draftFrameCount !== 1)) {
    throw new Error('움짤 파일은 다른 이미지와 섞지 말고 한 번에 하나씩 가져와 주세요.');
  }
  if (!input.formats.length) throw new Error('출력 형식을 하나 이상 선택해 주세요.');
  if (new Set(input.frames.map((frame) => frame.uploadRequestId)).size !== draftFrameCount) {
    throw new Error('같은 수동 프레임 요청을 두 번 사용할 수 없습니다.');
  }
  if (containerCount && input.timing.mode === 'per_frame') {
    throw new Error('움짤을 가져올 때는 먼저 같은 속도로 조립한 뒤 장면별 시간을 조정해 주세요.');
  }
  if (input.timing.mode === 'per_frame' && input.timing.frameDurationsMs.length !== draftFrameCount) {
    throw new Error('프레임별 시간 수가 이미지 장수와 다릅니다.');
  }

  const assetGroups: EmoticonManualFrameAsset[][] = new Array(draftFrameCount);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(3, draftFrameCount) }, async () => {
    while (cursor < draftFrameCount) {
      const index = cursor;
      cursor += 1;
      const frame = input.frames[index];
      assetGroups[index] = frame.kind === 'completed-static'
        ? [await copyCompletedStaticEmoticonFrame({
          userId: input.userId,
          projectId: input.projectId,
          projectItemId: input.projectItemId,
          uploadRequestId: frame.uploadRequestId,
          sourceJobId: frame.sourceJobId,
        })]
        : frame.kind === 'container'
          ? await extractEmoticonImportContainer({
            userId: input.userId,
            projectId: input.projectId,
            projectItemId: input.projectItemId,
            uploadRequestId: frame.uploadRequestId,
            file: frame.file,
          })
          : [await uploadEmoticonImportFrame({
          userId: input.userId,
          projectId: input.projectId,
          projectItemId: input.projectItemId,
          uploadRequestId: frame.uploadRequestId,
          file: frame.file,
        })];
    }
  });
  await Promise.all(workers);
  const assets = assetGroups.flat();
  const frameCount = assets.length;
  if (outputProfile.type === 'static' ? frameCount !== 1 : frameCount < 2 || frameCount > 24) {
    throw new Error(outputProfile.type === 'static'
      ? '정지형은 이미지 1장이 필요합니다.'
      : '추출 결과는 2~24프레임이어야 합니다.');
  }
  const bubble = clampImportedBubble(input.bubble, frameCount);
  const editRecipe = input.editRecipe
    ? emoticonImageEditRecipeSchema.parse(input.editRecipe)
    : undefined;
  const requestId = await deterministicImportRequestId({
    frameUploadIds: assets.map((asset) => asset.uploadRequestId),
    timing: input.timing,
    formats: [...formats].sort(),
    projectId: input.projectId,
    projectItemId: input.projectItemId,
    ...(bubble ? { bubble } : {}),
    outputProfile,
    ...(editRecipe ? { editRecipe } : {}),
  });
  // Upload identifiers stay idempotent, while every explicit retry receives a
  // new job. The project-item lease rejects accidental double clicks.
  const jobId = crypto.randomUUID();
  const jobData = {
    id: jobId,
    userId: input.userId,
    sourceImageUrl: assets[0].sourceImageUrl,
    sourceStoragePath: assets[0].sourceStoragePath,
    referenceImages: [],
    instruction: `정지 컷 ${frameCount}장 직접 합성`,
    mode: 'import_frames',
    resourceMode: 'efficient',
    manualImport: {
      schemaVersion: 1,
      requestId,
      frames: assets,
      timing: input.timing,
    },
    projectId: input.projectId,
    projectItemId: input.projectItemId,
    ...(bubble ? { bubbleOverride: bubble } : {}),
    renderOverrides: {
      ...(bubble ? { bubble } : {}),
      ...(editRecipe ? { editRecipe } : {}),
    },
    outputProfile,
    motionPreference: 'stable',
    formats,
    status: 'queued',
    progress: 0,
    statusMessage: '선택한 정지 컷의 소유권과 파일을 확인할 준비를 하고 있어요.',
    error: null,
    motionFallbackReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const itemLeaseClaimed = await createJobWithProjectItemLease({
    userId: input.userId,
    jobId,
    projectId: input.projectId,
    projectItemId: input.projectItemId,
    expectedProjectRevision: input.expectedProjectRevision,
    expectedProjectItemRevision: input.expectedProjectItemRevision,
    jobData,
  });
  return { jobId, itemLeaseClaimed };
}

export async function submitEmoticonJob(input: SubmitEmoticonJobInput): Promise<{
  jobId: string;
  source: EmoticonSource;
  itemLeaseClaimed: boolean;
}> {
  const instruction = input.instruction.trim();
  if (instruction.length < 2) {
    throw new Error('만들고 싶은 표정이나 행동을 한 문장으로 적어 주세요.');
  }
  if (!input.source && !input.sourceFile) {
    throw new Error('캐릭터 원본 이미지를 먼저 넣어 주세요.');
  }
  if (!input.formats.length) {
    throw new Error('저장할 파일 형식을 하나 이상 골라 주세요.');
  }

  const resolvedPolicy = input.outputProfile
    ? await resolveGenerationOutputPolicy({
      outputProfile: input.outputProfile,
      formats: input.formats,
    })
    : null;
  const outputProfile = resolvedPolicy?.outputProfile;
  const formats = resolvedPolicy?.formats || Array.from(new Set(input.formats));
  const source = input.source || await uploadEmoticonSource(input.userId, input.sourceFile as File);
  const jobId = crypto.randomUUID();
  const jobData = {
    id: jobId,
    userId: input.userId,
    sourceImageUrl: source.sourceImageUrl,
    sourceStoragePath: source.sourceStoragePath,
    referenceImages: (input.referenceImages || []).slice(0, 3),
    ...(input.bubbleOverride ? { bubbleOverride: input.bubbleOverride } : {}),
    ...(input.motionOverride ? { motionOverride: input.motionOverride } : {}),
    ...(outputProfile ? { outputProfile } : {}),
    instruction,
    mode: 'generate',
    resourceMode: input.resourceMode,
    ...lightGenerationProfile(input.resourceMode),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.projectItemId ? { projectItemId: input.projectItemId } : {}),
    ...(input.batchId ? { batchId: input.batchId } : {}),
    motionPreference: input.motionPreference,
    formats,
    status: 'queued',
    progress: 0,
    statusMessage: '작업 요청을 대기열에 등록했어요.',
    error: null,
    motionFallbackReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const itemLeaseClaimed = await createJobWithProjectItemLease({
    userId: input.userId,
    jobId,
    projectId: input.projectId,
    projectItemId: input.projectItemId,
    expectedProjectRevision: input.expectedProjectRevision,
    expectedProjectItemRevision: input.expectedProjectItemRevision,
    batchId: input.batchId,
    batchEnqueueRoundId: input.batchEnqueueRoundId,
    batchRetryRound: input.batchRetryRound,
    batchItemAttemptCount: input.batchItemAttemptCount,
    jobData,
  });
  return { jobId, source, itemLeaseClaimed };
}

/**
 * Creates a text-and-vision planning task only. It does not make image frames
 * or exports, so the user can review the requested composition before any
 * per-item image generation cost is incurred.
 */
export async function createEmoticonTemplatePlan(input: CreateEmoticonTemplatePlanInput): Promise<{
  jobId: string;
  source: EmoticonSource;
}> {
  const templateRequest = input.templateRequest.trim();
  if (templateRequest.length < 8) {
    throw new Error('원하는 구성, 말투, 제외할 표현을 한 문장 이상으로 적어 주세요.');
  }
  if (!input.source && !input.sourceFile) {
    throw new Error('구성안을 만들 캐릭터 참고 이미지를 먼저 넣어 주세요.');
  }
  const templateItemCount = Math.max(1, Math.min(64, Math.round(input.templateItemCount)));
  const source = input.source || await uploadEmoticonSource(input.userId, input.sourceFile as File);
  const jobId = crypto.randomUUID();
  const referenceImages = (input.referenceImages || []).slice(0, 3);
  await setDoc(jobDocument(input.userId, jobId), {
    id: jobId,
    userId: input.userId,
    sourceImageUrl: source.sourceImageUrl,
    sourceStoragePath: source.sourceStoragePath,
    referenceImages,
    instruction: templateRequest,
    templateRequest,
    templateItemCount,
    mode: 'plan',
    resourceMode: input.resourceMode,
    ...lightGenerationProfile(input.resourceMode),
    projectId: input.projectId,
    ...(input.outputProfile ? { outputProfile: input.outputProfile } : {}),
    motionPreference: 'stable',
    formats: ['png_zip'],
    status: 'queued',
    progress: 0,
    statusMessage: 'OpenRouter 구성 요청을 대기열에 등록했어요.',
    error: null,
    motionFallbackReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { jobId, source };
}

async function assertCharacterPlanningProjectAvailable(
  userId: string,
  projectId: string,
): Promise<void> {
  const snapshot = await getDoc(projectDocument(userId, projectId));
  if (!snapshot.exists() || snapshot.data().userId !== userId) {
    throw new Error('프로젝트를 찾을 수 없어요.');
  }
  if (snapshot.data().deletionLocked === true) {
    throw new Error('삭제가 진행 중인 프로젝트에서는 캐릭터 분석과 시트 기획을 시작할 수 없어요.');
  }
}

/**
 * Creates one persisted, text/vision-only OpenRouter profile job. No image or
 * animation frame is requested by this job.
 */
export async function createEmoticonCharacterProfileJob(
  input: CreateEmoticonCharacterProfileInput,
): Promise<{ jobId: string }> {
  await assertCharacterPlanningProjectAvailable(input.userId, input.projectId);
  const jobId = crypto.randomUUID();
  const referenceImages = (input.referenceImages || []).slice(0, 3);
  const analysisEstimate = estimateEmoticonCharacterAnalysis(
    input.resourceMode,
    1 + referenceImages.length,
  );
  await setDoc(jobDocument(input.userId, jobId), {
    id: jobId,
    userId: input.userId,
    sourceImageUrl: input.source.sourceImageUrl,
    sourceStoragePath: input.source.sourceStoragePath,
    referenceImages,
    instruction: '캐릭터 외형과 스타일 고정 정보만 구조화해 분석',
    mode: 'profile',
    resourceMode: input.resourceMode,
    ...lightGenerationProfile(input.resourceMode),
    analysisEstimate,
    rightsAttested: input.rightsAttested === true,
    assetProvenance: {
      kind: 'uploaded',
      sourceStoragePaths: [
        input.source.sourceStoragePath,
        ...referenceImages.map((reference) => reference.sourceStoragePath),
      ],
    },
    projectId: input.projectId,
    motionPreference: 'stable',
    formats: ['png'],
    status: 'queued',
    progress: 0,
    statusMessage: 'OpenRouter 캐릭터 분석 작업이 대기열에 등록됐어요.',
    error: null,
    motionFallbackReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { jobId };
}

/** Text-only free-form sheet planning from a completed profile job. */
export async function createEmoticonCharacterSheetPlanJob(
  input: CreateEmoticonCharacterSheetPlanInput,
): Promise<{ jobId: string }> {
  const sheetRequest = input.sheetRequest.trim();
  if (sheetRequest.length < 8) {
    throw new Error('원하는 각도·표정·자세 구성을 한 문장 이상으로 적어 주세요.');
  }
  const sheetItemCount = Math.max(1, Math.min(64, Math.round(input.sheetItemCount)));
  await assertCharacterPlanningProjectAvailable(input.userId, input.projectId);
  const profileSnapshot = await getDoc(jobDocument(input.userId, input.profileJobId));
  const profileJob = profileSnapshot.exists()
    ? parseJob(profileSnapshot.id, profileSnapshot.data())
    : null;
  const characterAnalysis: EmoticonCharacterAnalysis | undefined = profileJob?.characterAnalysis;
  if (
    !profileJob
    || profileJob.userId !== input.userId
    || profileJob.projectId !== input.projectId
    || profileJob.mode !== 'profile'
    || profileJob.status !== 'completed'
    || !characterAnalysis
  ) {
    throw new Error('현재 프로젝트와 일치하는 완료된 캐릭터 분석을 먼저 선택하세요.');
  }
  const jobId = crypto.randomUUID();
  await setDoc(jobDocument(input.userId, jobId), {
    id: jobId,
    userId: input.userId,
    sourceImageUrl: input.source.sourceImageUrl,
    sourceStoragePath: input.source.sourceStoragePath,
    referenceImages: (input.referenceImages || []).slice(0, 3),
    instruction: sheetRequest,
    profileJobId: input.profileJobId,
    sheetRequest,
    sheetItemCount,
    mode: 'sheet_plan',
    resourceMode: input.resourceMode,
    ...lightGenerationProfile(input.resourceMode),
    projectId: input.projectId,
    motionPreference: 'stable',
    formats: ['png'],
    status: 'queued',
    progress: 0,
    statusMessage: 'OpenRouter 캐릭터 시트 기획이 대기열에 등록됐어요.',
    error: null,
    motionFallbackReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { jobId };
}

export async function retryEmoticonJob(params: {
  userId: string;
  job: EmoticonJob;
}): Promise<{
  jobId: string;
  source: EmoticonSource;
  reusedPose: boolean;
  itemLeaseClaimed: boolean;
}> {
  if (params.job.status === 'cancelled' || params.job.cancelRequestedAt) {
    throw new Error('취소된 작업은 이어서 복구할 수 없습니다. 새 작업으로 다시 만들어 주세요.');
  }
  if (params.job.mode === 'profile' || params.job.mode === 'sheet_plan') {
    if (!params.job.projectId) {
      throw new Error('캐릭터 분석·시트 기획을 다시 시작할 프로젝트 정보가 없어요.');
    }
    const profileSource = {
      sourceImageUrl: params.job.sourceImageUrl,
      sourceStoragePath: params.job.sourceStoragePath,
    };
    const result = params.job.mode === 'profile'
      ? await createEmoticonCharacterProfileJob({
        userId: params.userId,
        source: profileSource,
        referenceImages: params.job.referenceImages,
        projectId: params.job.projectId,
        resourceMode: params.job.resourceMode,
      })
      : await createEmoticonCharacterSheetPlanJob({
        userId: params.userId,
        source: profileSource,
        referenceImages: params.job.referenceImages,
        projectId: params.job.projectId,
        profileJobId: params.job.profileJobId as string,
        sheetRequest: params.job.sheetRequest as string,
        sheetItemCount: params.job.sheetItemCount as number,
        resourceMode: params.job.resourceMode,
      });
    return {
      jobId: result.jobId,
      source: profileSource,
      reusedPose: false,
      itemLeaseClaimed: false,
    };
  }
  if (params.job.mode === 'repair_frame') {
    throw new Error('프레임 교체 작업은 자동 재시도하지 않습니다. 완료된 원본에서 해당 프레임을 다시 선택해 주세요.');
  }
  const retryEditRecipe = params.job.editRecipe || params.job.renderOverrides?.editRecipe;
  const preservedRenderFailure = params.job.status === 'failed'
    && params.job.renderFailureRecovery?.stage === 'render'
    && params.job.renderFailureRecovery.category === 'infrastructure'
    && params.job.renderFailureRecovery.poseAccepted === true;
  const canResumeCheckpointedJob = params.job.status === 'failed'
    && (
      (
        params.job.resumeAvailable === true
        && ['openrouter-credits', 'checkpoint-error'].includes(String(params.job.recoverableFailure))
      )
      || preservedRenderFailure
    );
  if (isEmoticonJobStalled(params.job) || canResumeCheckpointedJob) {
    const recover = httpsCallable<
      { jobId: string },
      {
        jobId: string;
        outcome: 'resumed' | 'already-recovering';
        continuationToken: string;
      }
    >(asiaNortheastFunctions, 'recoverStalledEmoticonJob');
    const response = await recover({ jobId: params.job.id });
    if (response.data.jobId !== params.job.id) {
      throw new Error('복구된 작업 번호가 기존 작업과 일치하지 않습니다.');
    }
    return {
      jobId: response.data.jobId,
      source: {
        sourceImageUrl: params.job.sourceImageUrl,
        sourceStoragePath: params.job.sourceStoragePath,
      },
      reusedPose: Boolean(params.job.keyPoseStoragePath),
      itemLeaseClaimed: Boolean(params.job.projectId && params.job.projectItemId),
    };
  }
  if (
    params.job.plan
    && params.job.keyPoseStoragePath
    && params.job.status === 'failed'
    && (
      canReuseEmoticonKeyPose(params.job)
      || canReuseEmoticonAnimationFrames(params.job)
    )
  ) {
    const result = await rerenderEmoticonJob({
      userId: params.userId,
      parentJob: params.job,
      bubble: params.job.plan.bubble,
      formats: params.job.formats,
      projectId: params.job.projectId,
      projectItemId: params.job.projectItemId,
      editRecipe: retryEditRecipe,
    });
    return {
      ...result,
      source: {
        sourceImageUrl: params.job.sourceImageUrl,
        sourceStoragePath: params.job.sourceStoragePath,
      },
      reusedPose: true,
    };
  }
  const result = await submitEmoticonJob({
    userId: params.userId,
    instruction: params.job.instruction,
    motionPreference: params.job.motionPreference,
    resourceMode: params.job.resourceMode,
    formats: params.job.formats,
    source: {
      sourceImageUrl: params.job.sourceImageUrl,
      sourceStoragePath: params.job.sourceStoragePath,
    },
    referenceImages: params.job.referenceImages,
    bubbleOverride: params.job.plan?.bubble,
    motionOverride: params.job.motionOverride,
    outputProfile: params.job.outputProfile,
    projectId: params.job.projectId,
    projectItemId: params.job.projectItemId,
  });
  return { ...result, reusedPose: false };
}

export async function rerenderEmoticonJob(params: {
  userId: string;
  parentJob: EmoticonJob;
  bubble: EmoticonBubble;
  bubbleLayers?: EmoticonBubble[];
  formats?: EmoticonExportFormat[];
  projectId?: string;
  projectItemId?: string;
  editRecipe?: EmoticonImageEditRecipe;
  frameDurationsMs?: number[];
  frameTransitions?: EmoticonFrameTransition[];
}): Promise<{ jobId: string; itemLeaseClaimed: boolean }> {
  const recoverableInterruption = (
    (params.parentJob.status === 'failed' || isEmoticonJobStalled(params.parentJob))
    && Boolean(params.parentJob.keyPoseStoragePath)
  );
  if ((params.parentJob.status !== 'completed' && !recoverableInterruption) || !params.parentJob.plan) {
    throw new Error('완성된 작업이나 키 포즈가 남은 실패 작업만 다시 편집할 수 있어요.');
  }
  if (
    params.parentJob.plan.action.renderMode === 'dynamic'
    && !canReuseEmoticonAnimationFrames(params.parentJob)
    && !canReuseManualEmoticonFrames(params.parentJob)
  ) {
    throw new Error('기존 동작 프레임이 보관되지 않아, 이번에는 새 동작 생성이 필요해요.');
  }
  if (
    params.parentJob.plan.action.renderMode !== 'dynamic'
    && !canReuseEmoticonKeyPose(params.parentJob)
    && !canReuseManualEmoticonFrames(params.parentJob)
  ) {
    throw new Error('검증을 통과한 캐릭터 포즈가 없어 새 AI 생성이 필요해요.');
  }
  const editRecipe = params.editRecipe
    ? emoticonImageEditRecipeSchema.parse(params.editRecipe)
    : undefined;
  const sourceFrameCount = params.parentJob.animationFrames?.length
    || params.parentJob.compositedFrames?.length
    || 0;
  if (params.frameDurationsMs && params.frameDurationsMs.length !== sourceFrameCount) {
    throw new Error('프레임별 시간 수가 원본 프레임 수와 다릅니다.');
  }
  if (params.frameTransitions && params.frameTransitions.length !== sourceFrameCount) {
    throw new Error('전환 효과 수가 원본 프레임 수와 다릅니다.');
  }
  if (
    editRecipe
    && !canReuseVerifiedEmoticonFrames(params.parentJob)
    && !canReuseManualEmoticonFrames(params.parentJob)
  ) {
    throw new Error('실제 출력 검사를 통과하고 원본 프레임이 보관된 완성 작업만 편집할 수 있어요.');
  }
  const jobId = crypto.randomUUID();
  const projectId = params.projectId || params.parentJob.projectId;
  const projectItemId = params.projectItemId || params.parentJob.projectItemId;
  const jobData = {
    id: jobId,
    userId: params.userId,
    sourceImageUrl: params.parentJob.sourceImageUrl,
    sourceStoragePath: params.parentJob.sourceStoragePath,
    referenceImages: params.parentJob.referenceImages,
    instruction: params.parentJob.instruction,
    mode: 'rerender',
    resourceMode: params.parentJob.resourceMode,
    ...(params.parentJob.aiGenerationProfile
      ? { aiGenerationProfile: params.parentJob.aiGenerationProfile }
      : {}),
    parentJobId: params.parentJob.id,
    ...(projectId ? { projectId } : {}),
    ...(projectItemId ? { projectItemId } : {}),
    renderOverrides: {
      bubble: params.bubble,
      ...(params.bubbleLayers ? { bubbleLayers: params.bubbleLayers.slice(0, 4) } : {}),
      ...(editRecipe ? { editRecipe } : {}),
      ...(params.frameDurationsMs ? { frameDurationsMs: params.frameDurationsMs } : {}),
      ...(params.frameTransitions ? { frameTransitions: params.frameTransitions } : {}),
    },
    ...(params.parentJob.motionOverride ? { motionOverride: params.parentJob.motionOverride } : {}),
    ...(params.parentJob.outputProfile ? { outputProfile: params.parentJob.outputProfile } : {}),
    motionPreference: 'stable',
    formats: params.formats?.length ? Array.from(new Set(params.formats)) : params.parentJob.formats,
    status: 'queued',
    progress: 0,
    statusMessage: editRecipe
      ? '검증된 프레임으로 편집본을 만드는 작업을 등록했어요.'
      : '말풍선 수정 요청을 대기열에 등록했어요.',
    error: null,
    motionFallbackReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const itemLeaseClaimed = await createJobWithProjectItemLease({
    userId: params.userId,
    jobId,
    projectId,
    projectItemId,
    jobData,
  });
  return { jobId, itemLeaseClaimed };
}

export async function createEditedEmoticonJob(params: {
  userId: string;
  parentJob: EmoticonJob;
  editRecipe: EmoticonImageEditRecipe;
  bubble?: EmoticonBubble;
  formats?: EmoticonExportFormat[];
  projectId?: string;
  projectItemId?: string;
}): Promise<{ jobId: string; itemLeaseClaimed: boolean }> {
  if (
    !canReuseVerifiedEmoticonFrames(params.parentJob)
    && !canReuseManualEmoticonFrames(params.parentJob)
  ) {
    throw new Error('검사를 통과한 원본 프레임이 없어 편집본을 만들 수 없어요.');
  }
  if (!params.parentJob.plan) throw new Error('원본 작업의 구성 정보를 찾을 수 없어요.');
  return rerenderEmoticonJob({
    userId: params.userId,
    parentJob: params.parentJob,
    bubble: params.bubble || params.parentJob.plan.bubble,
    formats: params.formats,
    projectId: params.projectId,
    projectItemId: params.projectItemId,
    editRecipe: params.editRecipe,
  });
}

/**
 * Records only the user's cancellation intent. The trusted Functions worker
 * owns the terminal status transition so a client cannot overwrite frames,
 * outputs, progress, or another server-owned result field.
 */
export async function requestEmoticonJobCancellation(
  input: RequestEmoticonJobCancellationInput,
): Promise<{ status: 'requested' | 'cancelled' }> {
  return runTransaction(db, async (transaction) => {
    const ref = jobDocument(input.userId, input.jobId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('취소할 작업을 찾을 수 없습니다.');
    const job = snapshot.data();
    if (job.userId !== input.userId) throw new Error('이 작업을 취소할 권한이 없습니다.');
    if (job.status === 'cancelled') return { status: 'cancelled' as const };
    if (job.status === 'completed' || job.status === 'failed') {
      throw new Error('이미 종료된 작업은 취소할 수 없습니다.');
    }
    if (job.cancelRequestedAt) return { status: 'requested' as const };
    transaction.update(ref, {
      cancelRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { status: 'requested' as const };
  });
}

/**
 * Queues a bounded repair job. The client sends only the parent identity and
 * requested index; the worker reloads and verifies the authoritative plan,
 * frame sequence, source, frames, and output profile from the completed job.
 */
export async function regenerateEmoticonFrame(
  input: RegenerateEmoticonFrameInput,
): Promise<{ jobId: string; itemLeaseClaimed: boolean }> {
  const { job } = input;
  if (job.userId !== input.userId) throw new Error('이 작업의 프레임을 수정할 권한이 없습니다.');
  if (!canReuseEmoticonAnimationFrames(job) || !job.frameSequencePlan) {
    throw new Error('검증이 완료된 동적 프레임 작업만 한 장씩 다시 만들 수 있습니다.');
  }
  if (job.specReport?.technicalPass !== true || job.specReport.allOutputsPass !== true) {
    throw new Error('실제 출력 파일 검사를 통과한 완료 작업만 프레임을 교체할 수 있습니다.');
  }
  if (!Number.isInteger(input.frameIndex) || input.frameIndex < 0 || input.frameIndex >= job.animationFrames!.length) {
    throw new Error('교체할 프레임 번호가 전체 프레임 범위를 벗어났습니다.');
  }
  const expectedStoragePrefix = `users/${input.userId}/emoticon-studio/jobs/${job.id}/`;
  if (
    !job.sourceStoragePath.startsWith(`users/${input.userId}/emoticon-studio/sources/`)
    || job.animationFrames!.some((frame) => !frame.storagePath.startsWith(expectedStoragePrefix))
  ) {
    throw new Error('원본 작업의 이미지 소유권을 확인할 수 없습니다.');
  }
  const formats = Array.from(new Set(input.formats?.length ? input.formats : job.formats));
  if (!formats.length) throw new Error('다시 만들 출력 파일 형식을 하나 이상 선택해 주세요.');

  const jobId = crypto.randomUUID();
  const projectId = input.projectId || job.projectId;
  const projectItemId = input.projectItemId || job.projectItemId;
  const jobData = {
    id: jobId,
    userId: input.userId,
    sourceImageUrl: job.sourceImageUrl,
    sourceStoragePath: job.sourceStoragePath,
    referenceImages: job.referenceImages,
    instruction: job.instruction,
    mode: 'repair_frame',
    resourceMode: job.resourceMode,
    ...lightGenerationProfile(job.resourceMode),
    parentJobId: job.id,
    repairFrameIndex: input.frameIndex,
    ...(projectId ? { projectId } : {}),
    ...(projectItemId ? { projectItemId } : {}),
    motionPreference: job.motionPreference,
    formats,
    status: 'queued',
    progress: 0,
    statusMessage: `${input.frameIndex + 1}번 프레임 교체 요청이 대기열에 등록됐어요.`,
    error: null,
    motionFallbackReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const itemLeaseClaimed = await createJobWithProjectItemLease({
    userId: input.userId,
    jobId,
    projectId,
    projectItemId,
    jobData,
  });
  return { jobId, itemLeaseClaimed };
}

export type EmoticonBatchEnqueueRound = {
  batchId: string;
  enqueueRoundId: string;
  retryRound: number;
  items: Array<{ itemId: string; attemptCount: number }>;
};

const emoticonBatchEnqueueRoundSchema = z.object({
  batchId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  enqueueRoundId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  retryRound: z.number().int().min(0).max(99),
  items: z.array(z.object({
    itemId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    attemptCount: z.number().int().min(1).max(8),
  })).min(1).max(64),
});

export async function createEmoticonBatch(params: {
  userId: string;
  projectId: string;
  itemIds: string[];
  requestedConcurrency: number;
  batchId?: string;
}): Promise<EmoticonBatchEnqueueRound> {
  const batchId = params.batchId || crypto.randomUUID();
  const callable = httpsCallable<
    { batchId: string; projectId: string; itemIds: string[]; requestedConcurrency: number },
    unknown
  >(asiaNortheastFunctions, 'createEmoticonBatch');
  const response = await callable({
    batchId,
    projectId: params.projectId,
    itemIds: Array.from(new Set(params.itemIds)).slice(0, 64),
    requestedConcurrency: Math.max(1, Math.min(3, Math.round(params.requestedConcurrency))),
  });
  const parsed = emoticonBatchEnqueueRoundSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.batchId !== batchId) {
    throw new Error('생성된 배치 번호가 요청과 일치하지 않습니다.');
  }
  return parsed.data;
}

export async function recordEmoticonBatchEnqueueResult(params: {
  userId: string;
  batchId: string;
  itemId: string;
  enqueueRoundId: string;
  retryRound: number;
  itemAttemptCount: number;
  jobId?: string;
  enqueueError?: string;
}): Promise<void> {
  const callable = httpsCallable<
    {
      batchId: string;
      itemId: string;
      enqueueRoundId: string;
      retryRound: number;
      itemAttemptCount: number;
      jobId?: string;
      enqueueError?: string;
    },
    { batchId: string; itemId: string; applied: boolean }
  >(asiaNortheastFunctions, 'recordEmoticonBatchEnqueueResult');
  await callable({
    batchId: params.batchId,
    itemId: params.itemId,
    enqueueRoundId: params.enqueueRoundId,
    retryRound: params.retryRound,
    itemAttemptCount: params.itemAttemptCount,
    ...(params.jobId ? { jobId: params.jobId } : {}),
    ...(params.enqueueError ? { enqueueError: params.enqueueError.slice(0, 240) } : {}),
  });
}

export async function finalizeEmoticonBatchEnqueue(params: {
  userId: string;
  batchId: string;
  enqueueRoundId: string;
  retryRound: number;
  enqueueError?: string;
}): Promise<void> {
  const callable = httpsCallable<
    { batchId: string; enqueueRoundId: string; retryRound: number; enqueueError?: string },
    { batchId: string; applied: boolean }
  >(asiaNortheastFunctions, 'finalizeEmoticonBatchEnqueue');
  await callable({
    batchId: params.batchId,
    enqueueRoundId: params.enqueueRoundId,
    retryRound: params.retryRound,
    ...(params.enqueueError ? { enqueueError: params.enqueueError.slice(0, 240) } : {}),
  });
}

export async function refreshEmoticonBatch(params: {
  userId: string;
  batchId: string;
}): Promise<void> {
  const callable = httpsCallable<
    { batchId: string },
    { batchId: string }
  >(asiaNortheastFunctions, 'refreshEmoticonBatch');
  await callable({ batchId: params.batchId });
}

export async function retryFailedEmoticonBatchItems(params: {
  userId: string;
  batchId: string;
  retryRequestId?: string;
}): Promise<EmoticonBatchRetryResult> {
  const callable = httpsCallable<
    { batchId: string; retryRequestId: string },
    unknown
  >(asiaNortheastFunctions, 'retryFailedEmoticonBatchItems');
  const response = await callable({
    batchId: params.batchId,
    retryRequestId: params.retryRequestId || crypto.randomUUID(),
  });
  const parsed = emoticonBatchRetryResultSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.batchId !== params.batchId) {
    throw new Error('배치 재시도 응답을 안전하게 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  }
  return parsed.data;
}

export async function cancelEmoticonBatch(params: {
  userId: string;
  batchId: string;
}): Promise<{ cancellationRequests: number }> {
  const callable = httpsCallable<
    { batchId: string },
    { batchId: string; cancellationRequests: number }
  >(asiaNortheastFunctions, 'cancelEmoticonBatch');
  const response = await callable({ batchId: params.batchId });
  return { cancellationRequests: response.data.cancellationRequests };
}

export function subscribeRecentEmoticonBatches(params: {
  userId: string;
  projectId: string;
  maxResults?: number;
  onChange: (batches: EmoticonBatch[]) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  const recentQuery = query(
    batchesCollection(params.userId),
    where('projectId', '==', params.projectId),
    orderBy('createdAt', 'desc'),
    limit(Math.max(1, Math.min(12, params.maxResults || 6))),
  );
  return onSnapshot(
    recentQuery,
    (snapshot) => {
      params.onChange(snapshot.docs
        .map((item) => parseBatch(item.id, item.data()))
        .filter((item): item is EmoticonBatch => Boolean(item)));
    },
    (error) => params.onError?.(error),
  );
}

export function subscribeEmoticonJob(params: {
  userId: string;
  jobId: string;
  onChange: (job: EmoticonJob | null) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  return onSnapshot(
    jobDocument(params.userId, params.jobId),
    (snapshot) => {
      if (!snapshot.exists()) {
        params.onChange(null);
        return;
      }
      params.onChange(parseJob(snapshot.id, snapshot.data()));
    },
    (error) => params.onError?.(error),
  );
}

/**
 * Live project previews in bounded document-id chunks. Firestore sends the
 * initial documents once and then only changed jobs, avoiding repeated polling
 * of every completed item while a different batch item is still running.
 */
export function subscribeEmoticonJobs(params: {
  userId: string;
  jobIds: string[];
  onChange: (jobs: EmoticonJob[]) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  const jobIds = [...new Set(params.jobIds.filter(Boolean))];
  if (!jobIds.length) return () => undefined;
  const chunks = Array.from(
    { length: Math.ceil(jobIds.length / 10) },
    (_, index) => jobIds.slice(index * 10, index * 10 + 10),
  );
  const chunkResults: Array<EmoticonJob[] | null> = chunks.map(() => null);
  const failedChunks = new Set<number>();
  const publishCompleteSnapshot = () => {
    if (failedChunks.size || chunkResults.some((jobs) => jobs === null)) return;
    params.onChange(chunkResults.flatMap((jobs) => jobs || []));
  };
  const unsubscribers = chunks.map((chunk, chunkIndex) => onSnapshot(
    query(jobsCollection(params.userId), where(documentId(), 'in', chunk)),
    (snapshot) => {
      failedChunks.delete(chunkIndex);
      chunkResults[chunkIndex] = snapshot.docs
        .map((item) => parseJob(item.id, item.data()))
        .filter((item): item is EmoticonJob => Boolean(item));
      publishCompleteSnapshot();
    },
    (error) => {
      failedChunks.add(chunkIndex);
      params.onError?.(error);
    },
  ));
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export async function recoverStalledEmoticonJob(params: {
  jobId: string;
}): Promise<{
  jobId: string;
  outcome: 'resumed' | 'already-recovering';
  continuationToken: string;
}> {
  const recover = httpsCallable<
    { jobId: string },
    {
      jobId: string;
      outcome: 'resumed' | 'already-recovering';
      continuationToken: string;
    }
  >(asiaNortheastFunctions, 'recoverStalledEmoticonJob');
  const response = await recover({ jobId: params.jobId });
  if (response.data.jobId !== params.jobId) {
    throw new Error('복구된 작업 번호가 기존 작업과 일치하지 않습니다.');
  }
  return response.data;
}

export async function getEmoticonJob(params: {
  userId: string;
  jobId: string;
}): Promise<EmoticonJob | null> {
  const snapshot = await getDoc(jobDocument(params.userId, params.jobId));
  return snapshot.exists() ? parseJob(snapshot.id, snapshot.data()) : null;
}

/** Server-only read for export/preflight. Never falls back to an offline cache. */
export async function getEmoticonJobFromServer(params: {
  userId: string;
  jobId: string;
}): Promise<EmoticonJob | null> {
  const snapshot = await getDocFromServer(jobDocument(params.userId, params.jobId));
  return snapshot.exists() ? parseJob(snapshot.id, snapshot.data()) : null;
}

export function subscribeRecentEmoticonJobs(params: {
  userId: string;
  maxResults?: number;
  onChange: (jobs: EmoticonJob[]) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  const recentQuery = query(
    jobsCollection(params.userId),
    orderBy('createdAt', 'desc'),
    limit(params.maxResults || 12),
  );
  return onSnapshot(
    recentQuery,
    (snapshot) => {
      params.onChange(
        snapshot.docs
          .map((item) => parseJob(item.id, item.data()))
          .filter((item): item is EmoticonJob => Boolean(item)),
      );
    },
    (error) => params.onError?.(error),
  );
}

export async function downloadEmoticonFile(url: string, fileName: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
