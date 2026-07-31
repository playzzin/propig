type VideoStudioJobLike = {
    status?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type StoryboardVideoRecoveryKind =
    | 'resume-render'
    | 'resume-storage'
    | 'regenerate';

export type StoryboardVideoRecovery = {
    kind: StoryboardVideoRecoveryKind;
    canReuseProviderJob: boolean;
    title: string;
    description: string;
    actionLabel: string;
};

type ProviderVideoCheckpoint = {
    jobId: string;
    status: 'pending' | 'in_progress' | 'completed';
};

const STORAGE_SIGNING_ERROR_PATTERNS = [
    'cannot sign data',
    'client_email',
    'client email',
    'get signed url',
    'getsignedurl',
    'signing credentials',
];

function readProviderVideoCheckpoint(job?: VideoStudioJobLike | null): ProviderVideoCheckpoint | null {
    const metadata = job?.metadata;
    if (!metadata || typeof metadata !== 'object') return null;
    const value = metadata.providerVideo;
    if (!value || typeof value !== 'object') return null;

    const checkpoint = value as Record<string, unknown>;
    const status = String(checkpoint.status || '');
    if (
        typeof checkpoint.jobId !== 'string'
        || !checkpoint.jobId
        || (status !== 'pending' && status !== 'in_progress' && status !== 'completed')
    ) {
        return null;
    }

    return {
        jobId: checkpoint.jobId,
        status,
    };
}

export function canReuseStoryboardVideoProviderJob(job?: VideoStudioJobLike | null): boolean {
    return Boolean(readProviderVideoCheckpoint(job));
}

export function describeStoryboardVideoRecovery(params: {
    errorMessage?: string | null;
    job?: VideoStudioJobLike | null;
}): StoryboardVideoRecovery {
    const errorMessage = params.errorMessage?.trim() || '';
    const normalizedError = errorMessage.toLowerCase();
    const checkpoint = readProviderVideoCheckpoint(params.job);
    const isStorageSigningFailure = STORAGE_SIGNING_ERROR_PATTERNS.some((pattern) => (
        normalizedError.includes(pattern)
    ));

    if (checkpoint?.status === 'completed') {
        return {
            kind: 'resume-storage',
            canReuseProviderJob: true,
            title: '영상 생성은 완료됐습니다',
            description: isStorageSigningFailure
                ? '결과 저장 단계만 복구하면 됩니다. OpenRouter에 새 영상을 요청하지 않아 추가 생성 비용이 들지 않습니다.'
                : '완료된 OpenRouter 결과를 그대로 사용해 저장과 연결 프레임 처리부터 이어갑니다.',
            actionLabel: '추가 과금 없이 저장 복구',
        };
    }

    if (checkpoint) {
        return {
            kind: 'resume-render',
            canReuseProviderJob: true,
            title: '기존 영상 작업을 이어갈 수 있습니다',
            description: '이미 접수된 OpenRouter 작업 ID로 계속 확인합니다. 새 영상 요청은 만들지 않습니다.',
            actionLabel: '기존 작업 이어받기',
        };
    }

    return {
        kind: 'regenerate',
        canReuseProviderJob: false,
        title: '이 장면은 새로 제작해야 합니다',
        description: '재사용할 수 있는 OpenRouter 작업이 없어 새 영상 요청이 필요합니다. 예상 비용을 확인한 뒤 다시 제작합니다.',
        actionLabel: '실패 장면 다시 제작',
    };
}
