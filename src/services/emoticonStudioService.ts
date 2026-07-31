import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db } from '@/firebase/config';
import { storage } from '@/firebase/storage';
import {
  getEmoticonJobStallState,
  isEmoticonJobStalled,
  type EmoticonJobStallState,
} from '@/lib/emoticonJobHealth';
import {
  emoticonJobSchema,
  type EmoticonBubble,
  type EmoticonExportFormat,
  type EmoticonJob,
  type EmoticonMotionPreference,
} from '@/schemas/emoticonStudio';

export type EmoticonSource = {
  sourceImageUrl: string;
  sourceStoragePath: string;
};

export type SubmitEmoticonJobInput = {
  userId: string;
  instruction: string;
  motionPreference: EmoticonMotionPreference;
  formats: EmoticonExportFormat[];
  sourceFile?: File;
  source?: EmoticonSource;
};

const ALLOWED_SOURCE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PREPARED_FILE_BYTES = 5 * 1024 * 1024;

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

export function canReuseEmoticonAnimationFrames(job: EmoticonJob): boolean {
  return job.status === 'completed'
    && job.plan?.action.renderMode === 'dynamic'
    && job.animationFrames?.length === job.plan.action.frameCount;
}

function parseJob(jobId: string, value: Record<string, unknown>): EmoticonJob | null {
  const parsed = emoticonJobSchema.safeParse({ id: jobId, ...value });
  if (!parsed.success) {
    console.warn('[Emoticon Studio] Ignored an invalid job snapshot.', parsed.error.issues);
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

export async function uploadEmoticonSource(userId: string, file: File): Promise<EmoticonSource> {
  const validationError = validateEmoticonSourceFile(file);
  if (validationError) throw new Error(validationError);
  const inferredContentType = inferSourceContentType(file) as string;
  const normalizedFile = file.type === inferredContentType
    ? file
    : new File([file], file.name, { type: inferredContentType, lastModified: file.lastModified });
  const prepared = await prepareSourceFile(normalizedFile);
  const extension = prepared.type === 'image/png'
    ? 'png'
    : prepared.type === 'image/webp'
      ? 'webp'
      : 'jpg';
  const sourceId = crypto.randomUUID();
  const sourceStoragePath = `users/${userId}/emoticon-studio/sources/${sourceId}.${extension}`;
  const sourceRef = ref(storage, sourceStoragePath);
  await uploadBytes(sourceRef, prepared, {
    contentType: prepared.type,
    customMetadata: {
      originalName: file.name.slice(0, 180),
    },
  });
  return {
    sourceImageUrl: await getDownloadURL(sourceRef),
    sourceStoragePath,
  };
}

export async function submitEmoticonJob(input: SubmitEmoticonJobInput): Promise<{
  jobId: string;
  source: EmoticonSource;
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

  const source = input.source || await uploadEmoticonSource(input.userId, input.sourceFile as File);
  const jobId = crypto.randomUUID();
  await setDoc(jobDocument(input.userId, jobId), {
    id: jobId,
    userId: input.userId,
    sourceImageUrl: source.sourceImageUrl,
    sourceStoragePath: source.sourceStoragePath,
    instruction,
    mode: 'generate',
    motionPreference: input.motionPreference,
    formats: Array.from(new Set(input.formats)),
    status: 'queued',
    progress: 0,
    statusMessage: '작업 요청을 대기열에 등록했어요.',
    error: null,
    motionFallbackReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { jobId, source };
}

export async function retryEmoticonJob(params: {
  userId: string;
  job: EmoticonJob;
}): Promise<{ jobId: string; source: EmoticonSource; reusedPose: boolean }> {
  if (
    params.job.plan
    && params.job.keyPoseStoragePath
    && (params.job.status === 'failed' || isEmoticonJobStalled(params.job))
    && (
      params.job.plan.action.renderMode !== 'dynamic'
      || canReuseEmoticonAnimationFrames(params.job)
    )
  ) {
    const result = await rerenderEmoticonJob({
      userId: params.userId,
      parentJob: params.job,
      bubble: params.job.plan.bubble,
      formats: params.job.formats,
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
    formats: params.job.formats,
    source: {
      sourceImageUrl: params.job.sourceImageUrl,
      sourceStoragePath: params.job.sourceStoragePath,
    },
  });
  return { ...result, reusedPose: false };
}

export async function rerenderEmoticonJob(params: {
  userId: string;
  parentJob: EmoticonJob;
  bubble: EmoticonBubble;
  formats?: EmoticonExportFormat[];
}): Promise<{ jobId: string }> {
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
  ) {
    throw new Error('기존 동작 프레임이 보관되지 않아, 이번에는 새 동작 생성이 필요해요.');
  }
  const jobId = crypto.randomUUID();
  await setDoc(jobDocument(params.userId, jobId), {
    id: jobId,
    userId: params.userId,
    sourceImageUrl: params.parentJob.sourceImageUrl,
    sourceStoragePath: params.parentJob.sourceStoragePath,
    instruction: params.parentJob.instruction,
    mode: 'rerender',
    parentJobId: params.parentJob.id,
    renderOverrides: {
      bubble: params.bubble,
    },
    motionPreference: 'stable',
    formats: params.formats?.length ? Array.from(new Set(params.formats)) : params.parentJob.formats,
    status: 'queued',
    progress: 0,
    statusMessage: '말풍선 수정 요청을 대기열에 등록했어요.',
    error: null,
    motionFallbackReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { jobId };
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
