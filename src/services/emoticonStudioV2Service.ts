import {
  collection,
  doc,
  getDocFromServer,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import {
  createDefaultEmoticonStudioV2ProjectMetadata,
  emoticonAnimationTimelineSchema,
  emoticonCharacterProfileVersionSchema,
  emoticonCreationTurnSchema,
  emoticonStudioV2ProjectMetadataSchema,
  type EmoticonAnimationTimeline,
  type EmoticonCharacterAnalysisOverride,
  type EmoticonCharacterIdentityLock,
  type EmoticonCharacterProfileVersion,
  type EmoticonCostSnapshot,
  type EmoticonCreationIntent,
  type EmoticonCreationTurn,
} from '@/schemas/emoticonStudioV2';
import {
  emoticonJobSchema,
  type EmoticonJob,
  type EmoticonResourceMode,
} from '@/schemas/emoticonStudio';
import {
  buildEmoticonAnimationTimelineFromJob,
  getEmoticonAnimationTimelineContentSignature,
  getEmoticonJobTimelineId,
} from '@/lib/emoticonAnimationTimeline';

const profileCollection = (userId: string) => (
  collection(db, 'users', userId, 'emoticonStudioV2Profiles')
);
const turnCollection = (userId: string) => (
  collection(db, 'users', userId, 'emoticonStudioV2Turns')
);
const timelineCollection = (userId: string) => (
  collection(db, 'users', userId, 'emoticonStudioV2Timelines')
);

export async function saveApprovedCharacterProfileVersion(params: {
  userId: string;
  projectId: string;
  job: EmoticonJob;
  version: number;
  analysisMode: EmoticonResourceMode;
  userOverrides: EmoticonCharacterAnalysisOverride;
  identityLock: EmoticonCharacterIdentityLock;
  rightsAttested: boolean;
}): Promise<EmoticonCharacterProfileVersion> {
  if (!params.rightsAttested) throw new Error('이미지 사용 권리를 확인해 주세요.');
  if (
    params.job.mode !== 'profile'
    || params.job.status !== 'completed'
    || !params.job.characterAnalysis
    || !params.job.identityFingerprint
  ) {
    throw new Error('완료된 캐릭터 분석 결과만 확정할 수 있습니다.');
  }
  const id = crypto.randomUUID();
  const candidate = emoticonCharacterProfileVersionSchema.parse({
    schemaVersion: 1,
    id,
    projectId: params.projectId,
    version: params.version,
    status: 'approved',
    referenceStoragePaths: [
      params.job.sourceStoragePath,
      ...params.job.referenceImages.map((reference) => reference.sourceStoragePath),
    ],
    identityFingerprint: params.job.identityFingerprint,
    sourceProfileJobId: params.job.id,
    analysisMode: params.analysisMode,
    aiAnalysis: params.job.characterAnalysis,
    userOverrides: params.userOverrides,
    identityLock: params.identityLock,
    rightsAttested: true,
  });
  await setDoc(doc(profileCollection(params.userId), id), {
    ...candidate,
    approvedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return candidate;
}

export function subscribeCharacterProfileVersions(params: {
  userId: string;
  projectId: string;
  onChange: (profiles: EmoticonCharacterProfileVersion[]) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  return onSnapshot(
    query(
      profileCollection(params.userId),
      where('projectId', '==', params.projectId),
      orderBy('version', 'desc'),
      limit(20),
    ),
    (snapshot) => params.onChange(snapshot.docs.flatMap((item) => {
      const parsed = emoticonCharacterProfileVersionSchema.safeParse({ id: item.id, ...item.data() });
      return parsed.success ? [parsed.data] : [];
    })),
    (error) => params.onError?.(error),
  );
}

export async function createEmoticonCreationTurn(params: {
  userId: string;
  projectId: string;
  prompt: string;
  intent: EmoticonCreationIntent;
  profileVersionId: string;
  cost: EmoticonCostSnapshot;
  parentTurnId?: string;
}): Promise<EmoticonCreationTurn> {
  const id = crypto.randomUUID();
  const candidate = emoticonCreationTurnSchema.parse({
    schemaVersion: 1,
    id,
    userId: params.userId,
    projectId: params.projectId,
    ...(params.parentTurnId ? { parentTurnId: params.parentTurnId } : {}),
    revisionReason: params.parentTurnId ? 'prompt_edit' : 'create',
    prompt: params.prompt,
    intent: params.intent,
    characterProfileVersionId: params.profileVersionId,
    status: 'queued',
    cost: params.cost,
    variants: [],
    errorCode: null,
    errorMessage: null,
  });
  await setDoc(doc(turnCollection(params.userId), id), {
    ...candidate,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return candidate;
}

export async function linkCreationTurnJobs(params: {
  userId: string;
  turn: EmoticonCreationTurn;
  jobIds: string[];
  formats: EmoticonJob['formats'];
}): Promise<void> {
  const variants = params.jobIds.slice(0, 40).map((jobId) => ({
    id: crypto.randomUUID(),
    jobId,
    outputFormats: params.formats,
    status: 'working' as const,
    qualityScore: null,
    accountedCostUsd: 0,
    accountedCalls: 0,
  }));
  await updateDoc(doc(turnCollection(params.userId), params.turn.id), {
    status: 'working',
    variants,
    updatedAt: serverTimestamp(),
  });
}

export async function failCreationTurn(params: {
  userId: string;
  turnId: string;
  errorMessage: string;
  errorCode?: string;
}): Promise<void> {
  await updateDoc(doc(turnCollection(params.userId), params.turnId), {
    status: 'failed',
    errorCode: params.errorCode || 'creation_start_failed',
    errorMessage: params.errorMessage,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function replaceCreationTurnVariantJob(params: {
  userId: string;
  turnId: string;
  previousJobId: string;
  nextJobId: string;
}): Promise<void> {
  const turnRef = doc(turnCollection(params.userId), params.turnId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(turnRef);
    if (!snapshot.exists()) throw new Error('재시도할 생성 기록을 찾을 수 없습니다.');
    const parsed = emoticonCreationTurnSchema.parse({ id: snapshot.id, ...snapshot.data() });
    const variants = parsed.variants.map((variant) => {
      if (variant.jobId !== params.previousJobId) return variant;
      const reusesSameJob = params.previousJobId === params.nextJobId;
      return {
        ...variant,
        jobId: params.nextJobId,
        status: 'working' as const,
        qualityScore: null,
        accountedCostUsd: reusesSameJob
          ? variant.accountedCostUsd ?? parsed.cost.actualUsd ?? 0
          : 0,
        accountedCalls: reusesSameJob
          ? variant.accountedCalls ?? parsed.cost.actualCalls ?? 0
          : 0,
      };
    });
    if (!variants.some((variant) => variant.jobId === params.nextJobId)) {
      throw new Error('재시도할 결과 항목을 찾을 수 없습니다.');
    }
    transaction.update(turnRef, {
      status: 'working',
      variants,
      errorCode: null,
      errorMessage: null,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function settleCreationTurnFromJob(params: {
  userId: string;
  turn: EmoticonCreationTurn;
  job: EmoticonJob;
}): Promise<void> {
  await settleCreationTurnFromJobs({
    userId: params.userId,
    turnId: params.turn.id,
    jobs: [params.job],
  });
}

export async function settleCreationTurnFromJobs(params: {
  userId: string;
  turnId: string;
  jobs: EmoticonJob[];
}): Promise<void> {
  const terminalJobs = params.jobs.filter((job) => ['completed', 'failed', 'cancelled'].includes(job.status));
  if (!terminalJobs.length) return;
  const turnRef = doc(turnCollection(params.userId), params.turnId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(turnRef);
    if (!snapshot.exists()) return;
    const latest = emoticonCreationTurnSchema.parse({ id: snapshot.id, ...snapshot.data() });
    const jobsById = new Map(terminalJobs.map((job) => [job.id, job]));
    let additionalCostUsd = 0;
    let additionalCalls = 0;
    const variants = latest.variants.map((variant) => {
      const job = jobsById.get(variant.jobId);
      if (!job) return variant;
      const jobCostUsd = job.openRouterActualCostUsd || 0;
      const jobCalls = job.openRouterUsageRequestCount || 0;
      additionalCostUsd += Math.max(0, jobCostUsd - (variant.accountedCostUsd || 0));
      additionalCalls += Math.max(0, jobCalls - (variant.accountedCalls || 0));
      return {
        ...variant,
        status: job.status,
        qualityScore: job.quality?.overall ?? job.premiumQualityScore ?? null,
        accountedCostUsd: Math.max(variant.accountedCostUsd || 0, jobCostUsd),
        accountedCalls: Math.max(variant.accountedCalls || 0, jobCalls),
      };
    });
    const terminal = variants.length > 0 && variants.every((variant) => (
      ['completed', 'failed', 'cancelled'].includes(variant.status)
    ));
    const status = !terminal
      ? 'working'
      : variants.some((variant) => variant.status === 'completed')
        ? 'completed'
        : variants.some((variant) => variant.status === 'failed') ? 'failed' : 'cancelled';
    const actualUsd = (latest.cost.actualUsd || 0) + additionalCostUsd;
    const actualCalls = (latest.cost.actualCalls || 0) + additionalCalls;
    const failedJob = terminalJobs.find((job) => job.status === 'failed');
    transaction.update(turnRef, {
      status,
      cost: {
        ...latest.cost,
        actualUsd,
        actualCalls,
      },
      variants,
      errorCode: failedJob ? failedJob.failureCode || 'generation_failed' : null,
      errorMessage: failedJob ? failedJob.error || '생성 작업에 실패했습니다.' : null,
      updatedAt: serverTimestamp(),
      ...(terminal ? { completedAt: serverTimestamp() } : {}),
    });
  });
}

export function subscribeCreationTurns(params: {
  userId: string;
  projectId: string;
  onChange: (turns: EmoticonCreationTurn[]) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  return onSnapshot(
    query(
      turnCollection(params.userId),
      where('projectId', '==', params.projectId),
      orderBy('createdAt', 'asc'),
      limitToLast(100),
    ),
    (snapshot) => params.onChange(snapshot.docs.flatMap((item) => {
      const parsed = emoticonCreationTurnSchema.safeParse({ id: item.id, ...item.data() });
      return parsed.success ? [parsed.data] : [];
    })),
    (error) => params.onError?.(error),
  );
}

export async function saveEmoticonAnimationTimeline(params: {
  userId: string;
  projectId: string;
  itemId: string;
  jobId: string;
  turnId?: string;
}): Promise<{ timeline: EmoticonAnimationTimeline; projectLinked: boolean }> {
  const timelineId = getEmoticonJobTimelineId(params.jobId);
  const projectRef = doc(db, 'users', params.userId, 'emoticonProjects', params.projectId);
  const jobRef = doc(db, 'users', params.userId, 'emoticonJobs', params.jobId);
  const timelineRef = doc(timelineCollection(params.userId), timelineId);
  const turnRef = params.turnId ? doc(turnCollection(params.userId), params.turnId) : null;

  return runTransaction(db, async (transaction) => {
    const [projectSnapshot, jobSnapshot, timelineSnapshot] = await Promise.all([
      transaction.get(projectRef),
      transaction.get(jobRef),
      transaction.get(timelineRef),
    ]);
    const turnSnapshot = turnRef ? await transaction.get(turnRef) : null;
    if (!projectSnapshot.exists()) throw new Error('프로젝트를 찾을 수 없습니다.');
    if (!jobSnapshot.exists()) throw new Error('타임라인으로 저장할 작업을 찾을 수 없습니다.');

    const projectData = projectSnapshot.data();
    if (
      projectData.userId !== params.userId
      || projectSnapshot.id !== params.projectId
      || projectData.deletionLocked === true
      || projectData.emoticonType !== 'animated'
    ) {
      throw new Error('현재 프로젝트에는 애니메이션 타임라인을 저장할 수 없습니다.');
    }
    const projectRevision = projectData.revision;
    if (!Number.isInteger(projectRevision) || projectRevision < 0) {
      throw new Error('프로젝트 revision 정보가 손상되었습니다.');
    }

    const job = emoticonJobSchema.safeParse({ id: jobSnapshot.id, ...jobSnapshot.data() });
    if (
      !job.success
      || job.data.userId !== params.userId
      || job.data.projectId !== params.projectId
      || job.data.projectItemId !== params.itemId
      || job.data.status !== 'completed'
      || job.data.specReport?.technicalPass !== true
      || job.data.specReport?.allOutputsPass !== true
    ) {
      throw new Error('현재 프로젝트 항목과 일치하는 검증 완료 애니메이션만 타임라인으로 저장할 수 있습니다.');
    }

    const parsedTurn = turnSnapshot?.exists()
      ? emoticonCreationTurnSchema.safeParse({ id: turnSnapshot.id, ...turnSnapshot.data() })
      : null;
    const turn = parsedTurn?.success
      && parsedTurn.data.userId === params.userId
      && parsedTurn.data.projectId === params.projectId
      && parsedTurn.data.variants.some((variant) => variant.jobId === params.jobId)
      ? parsedTurn.data
      : null;
    const builtTimeline = buildEmoticonAnimationTimelineFromJob({
      projectId: params.projectId,
      itemId: params.itemId,
      job: job.data,
      ...(turn ? { loopMode: turn.intent.loopMode } : {}),
    });
    if (!builtTimeline) throw new Error('완성된 애니메이션 재생 결과가 없습니다.');
    const candidate = emoticonAnimationTimelineSchema.parse(builtTimeline);
    const parsedExisting = timelineSnapshot.exists()
      ? emoticonAnimationTimelineSchema.safeParse({ id: timelineSnapshot.id, ...timelineSnapshot.data() })
      : null;
    const existing = parsedExisting?.success && parsedExisting.data.projectId === params.projectId
      ? parsedExisting.data
      : null;
    const sameContent = Boolean(
      existing
      && getEmoticonAnimationTimelineContentSignature(existing)
        === getEmoticonAnimationTimelineContentSignature(candidate),
    );
    const timeline = emoticonAnimationTimelineSchema.parse({
      ...candidate,
      revision: existing ? existing.revision + (sameContent ? 0 : 1) : 0,
    });

    if (!sameContent) {
      transaction.set(timelineRef, {
        ...timeline,
        ...(!timelineSnapshot.exists() ? { createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    const metadataCandidate = projectData.v2 === undefined
      ? createDefaultEmoticonStudioV2ProjectMetadata()
      : projectData.v2;
    const metadata = emoticonStudioV2ProjectMetadataSchema.safeParse(metadataCandidate);
    if (!metadata.success) throw new Error('프로젝트 V2 연결 정보가 손상되었습니다.');
    const completedVariantJobIds = turn?.variants
      .filter((variant) => variant.status === 'completed')
      .map((variant) => variant.jobId) || [];
    const isLatestCompletedVariant = completedVariantJobIds.at(-1) === params.jobId;
    const turnIsTerminal = Boolean(turn && ['completed', 'failed', 'cancelled'].includes(turn.status));
    const canLinkProject = Boolean(
      turn
      && turnIsTerminal
      && isLatestCompletedVariant
      && metadata.data.latestCreationTurnId === turn.id
      && projectData.status !== 'generating',
    );
    let projectLinked = metadata.data.latestTimelineId === timeline.id;
    if (!projectLinked && canLinkProject) {
      transaction.update(projectRef, {
        v2: {
          ...metadata.data,
          latestTimelineId: timeline.id,
          updatedAt: serverTimestamp(),
        },
        revision: projectRevision + 1,
        updatedAt: serverTimestamp(),
      });
      projectLinked = true;
    }

    return { timeline, projectLinked };
  });
}

export async function getEmoticonAnimationTimeline(params: {
  userId: string;
  projectId: string;
  timelineId: string;
}): Promise<EmoticonAnimationTimeline | null> {
  const snapshot = await getDocFromServer(doc(timelineCollection(params.userId), params.timelineId));
  if (!snapshot.exists()) return null;
  const timeline = emoticonAnimationTimelineSchema.safeParse({ id: snapshot.id, ...snapshot.data() });
  return timeline.success && timeline.data.projectId === params.projectId ? timeline.data : null;
}

export function subscribeEmoticonAnimationTimeline(params: {
  userId: string;
  projectId: string;
  timelineId: string;
  onChange: (timeline: EmoticonAnimationTimeline | null) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  return onSnapshot(
    doc(timelineCollection(params.userId), params.timelineId),
    (snapshot) => {
      if (!snapshot.exists()) {
        params.onChange(null);
        return;
      }
      const timeline = emoticonAnimationTimelineSchema.safeParse({ id: snapshot.id, ...snapshot.data() });
      params.onChange(
        timeline.success && timeline.data.projectId === params.projectId ? timeline.data : null,
      );
    },
    (error) => params.onError?.(error),
  );
}
