type VideoStudioJobLike = {
    status?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type StoryboardVideoRecoveryKind =
    | 'resume-render'
    | 'resume-storage'
    | 'reprocess-canvas'
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

type RecoverableCanvasOutput = {
    jobId: string;
    modelId: string;
};

type ProviderVideoAccessIssue = {
    httpStatus: 401 | 403;
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

function readRecoverableCanvasOutput(job?: VideoStudioJobLike | null): RecoverableCanvasOutput | null {
    const metadata = job?.metadata;
    if (!metadata || typeof metadata !== 'object') return null;
    const value = metadata.providerVideoDiscarded;
    const renderResult = metadata.renderResult;
    if (!value || typeof value !== 'object' || !renderResult || typeof renderResult !== 'object') return null;

    const discarded = value as Record<string, unknown>;
    const rendered = renderResult as Record<string, unknown>;
    if (
        discarded.reason !== 'resolution_mismatch'
        || discarded.recoverable === false
        || typeof discarded.providerJobId !== 'string'
        || !discarded.providerJobId
        || typeof discarded.modelId !== 'string'
        || !discarded.modelId
        || rendered.requestId !== discarded.providerJobId
        || rendered.modelUsed !== discarded.modelId
    ) {
        return null;
    }

    return {
        jobId: discarded.providerJobId,
        modelId: discarded.modelId,
    };
}

function hasUnavailableProviderOutput(job?: VideoStudioJobLike | null): boolean {
    const metadata = job?.metadata;
    if (!metadata || typeof metadata !== 'object') return false;
    const accessIssue = metadata.providerVideoAccessIssue;
    if (accessIssue && typeof accessIssue === 'object') {
        const candidate = accessIssue as Record<string, unknown>;
        const hasAlreadyRequeued =
            typeof metadata.queueDispatchToken === 'string'
            && metadata.queueDispatchToken.length > 0;
        if (
            (candidate.recoverable === false || hasAlreadyRequeued)
            && (candidate.httpStatus === 401 || candidate.httpStatus === 403)
        ) return true;
    }
    const value = metadata.providerVideoDiscarded;
    if (!value || typeof value !== 'object') return false;
    const discarded = value as Record<string, unknown>;
    if (
        discarded.reason === 'provider_output_not_found'
        || discarded.reason === 'provider_output_expired'
    ) return true;
    return discarded.reason === 'provider_output_unavailable'
        && discarded.httpStatus !== 401
        && discarded.httpStatus !== 403;
}

function readProviderVideoAccessIssue(
    job?: VideoStudioJobLike | null,
): ProviderVideoAccessIssue | null {
    const metadata = job?.metadata;
    if (!metadata || typeof metadata !== 'object') return null;
    const issue = metadata.providerVideoAccessIssue;
    if (issue && typeof issue === 'object') {
        const candidate = issue as Record<string, unknown>;
        if (
            candidate.recoverable !== false
            && (candidate.httpStatus === 401 || candidate.httpStatus === 403)
        ) {
            return { httpStatus: candidate.httpStatus };
        }
    }

    // Compatibility for jobs written briefly by the older classifier. A 401
    // or 403 never proves that the provider output itself has expired.
    const discarded = metadata.providerVideoDiscarded;
    if (discarded && typeof discarded === 'object') {
        const candidate = discarded as Record<string, unknown>;
        if (
            candidate.reason === 'provider_output_unavailable'
            && (candidate.httpStatus === 401 || candidate.httpStatus === 403)
        ) {
            return { httpStatus: candidate.httpStatus };
        }
    }
    return null;
}

export function canReuseStoryboardVideoProviderJob(job?: VideoStudioJobLike | null): boolean {
    // A completed studio job already has a usable clip. Requeueing it is both
    // unnecessary and rejected by the server. Only terminal failures are
    // eligible for checkpoint/post-process recovery.
    if (job?.status !== 'failed') return false;
    if (hasUnavailableProviderOutput(job)) return false;
    return Boolean(readProviderVideoCheckpoint(job) || readRecoverableCanvasOutput(job));
}

export function describeStoryboardVideoRecovery(params: {
    errorMessage?: string | null;
    job?: VideoStudioJobLike | null;
}): StoryboardVideoRecovery {
    const errorMessage = params.errorMessage?.trim() || '';
    const normalizedError = errorMessage.toLowerCase();
    const isFailedJob = params.job?.status === 'failed';
    const checkpoint = isFailedJob ? readProviderVideoCheckpoint(params.job) : null;
    const recoverableCanvasOutput = isFailedJob ? readRecoverableCanvasOutput(params.job) : null;
    const providerOutputUnavailable = isFailedJob && hasUnavailableProviderOutput(params.job);
    const providerAccessIssueMetadata = params.job?.metadata?.providerVideoAccessIssue;
    const terminalProviderAccessIssue = isFailedJob
        && providerAccessIssueMetadata
        && typeof providerAccessIssueMetadata === 'object'
        && (
            (providerAccessIssueMetadata as Record<string, unknown>).recoverable === false
            || (
                typeof params.job?.metadata?.queueDispatchToken === 'string'
                && params.job.metadata.queueDispatchToken.length > 0
            )
        );
    const providerAccessIssue = isFailedJob
        ? readProviderVideoAccessIssue(params.job)
            || (/video content download failed: http 401/i.test(errorMessage)
                ? { httpStatus: 401 as const }
                : /video content download failed: http 403/i.test(errorMessage)
                    ? { httpStatus: 403 as const }
                    : null)
        : null;
    const isStorageSigningFailure = STORAGE_SIGNING_ERROR_PATTERNS.some((pattern) => (
        normalizedError.includes(pattern)
    ));

    if (terminalProviderAccessIssue) {
        return {
            kind: 'regenerate',
            canReuseProviderJob: false,
            title: '기존 영상 결과에 더 이상 접근할 수 없습니다',
            description: 'OpenRouter가 같은 결과 파일의 다운로드를 반복 거부했습니다. 새 유료 영상 요청은 보내지 않았습니다. 계속하려면 예상 비용을 확인한 뒤 새 영상으로 다시 제작해야 합니다.',
            actionLabel: '새 영상으로 다시 제작 · 새 비용',
        };
    }

    if (providerOutputUnavailable) {
        return {
            kind: 'regenerate',
            canReuseProviderJob: false,
            title: '기존 영상 결과의 보관 기간이 지났습니다',
            description: '완료됐던 OpenRouter 결과 파일이 만료되어 더는 내려받을 수 없습니다. 장면 설계는 유지되며, 예상 비용을 확인한 뒤 새 영상으로 제작해야 합니다.',
            actionLabel: '새 영상으로 다시 제작',
        };
    }

    if (providerAccessIssue && checkpoint) {
        const authenticationFailed = providerAccessIssue.httpStatus === 401;
        return {
            kind: 'resume-storage',
            canReuseProviderJob: true,
            title: authenticationFailed
                ? 'OpenRouter 인증을 확인해 주세요'
                : '기존 영상 결과의 접근 권한을 확인해 주세요',
            description: authenticationFailed
                ? '작업 ID는 안전하게 보존했습니다. OpenRouter 인증을 확인한 뒤 새 영상 요청 없이 기존 결과 저장을 다시 시도할 수 있습니다.'
                : 'OpenRouter가 기존 결과 파일 접근을 거부했습니다. 작업 ID는 보존했으며, 계정 권한을 확인한 뒤 추가 생성비 없이 다시 저장할 수 있습니다.',
            actionLabel: '추가 생성비 없이 다시 저장',
        };
    }

    if (recoverableCanvasOutput) {
        return {
            kind: 'reprocess-canvas',
            canReuseProviderJob: true,
            title: '영상 생성은 완료됐습니다',
            description: '완료된 OpenRouter 결과를 다시 생성하지 않고 서버에서 프로젝트 화면 규격으로 보정합니다. 추가 영상 생성비는 들지 않습니다.',
            actionLabel: '추가 생성비 없이 규격 보정',
        };
    }

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
