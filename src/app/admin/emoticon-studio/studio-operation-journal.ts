import { z } from 'zod';

const SlotSchema = z.object({
  sceneId: z.string().max(120),
  keyframeId: z.string().max(120),
  keyframeIndex: z.number().int().min(0).max(15),
  caption: z.string().max(80),
  durationMs: z.number().min(60).max(3000),
});

const OperationSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(1).max(120),
  ownerId: z.string().min(1).max(128),
  kind: z.enum(['image', 'plan']),
  state: z.enum(['submitted', 'pending', 'uncertain', 'completed', 'failed']),
  applied: z.boolean(),
  slot: SlotSchema.optional(),
  sourceRevision: z.string().max(240).optional(),
  replaceFrameId: z.string().max(120).optional(),
  frameId: z.string().uuid().optional(),
  modelUsed: z.string().max(240).optional(),
  costUsd: z.number().finite().nonnegative().nullable(),
  createdAt: z.number().finite().nonnegative(),
  message: z.string().max(500).optional(),
});

export type StudioOperation = z.infer<typeof OperationSchema>;

export function remapStudioOperations(raw: unknown, projectId: string, frameIds: Map<string, string>): StudioOperation[] {
  return z.array(OperationSchema).max(2000).parse(raw).map((operation) => ({
    ...operation,
    projectId,
    ...(operation.frameId ? { frameId: frameIds.get(operation.frameId) || operation.frameId } : {}),
    ...(operation.replaceFrameId ? { replaceFrameId: frameIds.get(operation.replaceFrameId) || operation.replaceFrameId } : {}),
  }));
}
export type StudioImageResult = {
  success?: boolean;
  images?: Array<{ url?: string }>;
  metadata?: { costUsd?: number | null; modelUsed?: string };
  error?: string;
  code?: string;
  requestSubmitted?: boolean;
};
export type StudioOperationResult<T> = {
  success: boolean;
  status: 'not-found' | 'pending' | 'uncertain' | 'failed' | 'completed';
  result?: T;
  error?: string;
};

const journalKey = (ownerId: string, projectId: string) => `propig:emoticon-operations:v1:${ownerId}:${projectId}`;

export function readStudioOperations(ownerId: string, projectId: string): StudioOperation[] {
  const raw = localStorage.getItem(journalKey(ownerId, projectId));
  if (!raw) return [];
  const operations = z.array(OperationSchema).parse(JSON.parse(raw));
  if (operations.some((item) => item.ownerId !== ownerId || item.projectId !== projectId)) throw new Error('이 프로젝트의 AI 작업 기록을 확인하지 못했습니다.');
  return operations;
}

export function writeStudioOperations(ownerId: string, projectId: string, operations: StudioOperation[]) {
  const valid = z.array(OperationSchema).parse(operations);
  if (valid.some((item) => item.ownerId !== ownerId || item.projectId !== projectId)) throw new Error('AI 작업 기록의 소유자가 일치하지 않습니다.');
  localStorage.setItem(journalKey(ownerId, projectId), JSON.stringify(valid));
}

export function operationNeedsRecovery(operation: StudioOperation) {
  return operation.state !== 'failed' && !operation.applied;
}

export function operationMatchesSlot(operation: StudioOperation, sceneId: string, keyframeId: string) {
  return operation.kind === 'image' && operation.slot?.sceneId === sceneId && operation.slot.keyframeId === keyframeId && operationNeedsRecovery(operation);
}

export async function withStudioOperationLock<T>(ownerId: string, projectId: string, action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('이 브라우저에서는 안전한 AI 작업 잠금을 사용할 수 없습니다. 최신 브라우저 또는 파일 가져오기를 사용해 주세요.');
  return navigator.locks.request(`propig:emoticon-operation:${ownerId}:${projectId}`, { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error('다른 탭에서 이 프로젝트의 AI 작업을 처리 중입니다. 그 작업이 끝난 뒤 다시 확인해 주세요.');
    return action();
  });
}
