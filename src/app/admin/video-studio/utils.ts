import type {
    VideoStudioClipMode,
    VideoStudioJob,
    VideoStudioJobKind,
    VideoStudioJobStatus,
} from '@/lib/video-studio';

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function nonNegativeNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function formatUsd(value: number): string {
    return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

export function stamp(value: unknown): number {
    if (!value) return 0;
    if (typeof value === 'object' && value && 'toMillis' in value) {
        try { return (value as { toMillis: () => number }).toMillis(); } catch { return 0; }
    }
    if (typeof value === 'string') return new Date(value).getTime();
    if (value instanceof Date) return value.getTime();
    return 0;
}

export function modeLabel(mode: VideoStudioClipMode) {
    switch (mode) {
        case 'generate': return '생성';
        case 'extend': return '연장';
        case 'continue': return '이어 만들기';
        case 'edit': return '수정';
        case 'merge': return '합치기';
        default: return mode;
    }
}

export function jobKindLabel(kind: VideoStudioJobKind) {
    return kind === 'extract-frame' ? '마지막 프레임 저장' : modeLabel(kind);
}

export function jobStatusLabel(status: VideoStudioJobStatus) {
    switch (status) {
        case 'queued': return '대기 중';
        case 'running': return '처리 중';
        case 'uploading': return '업로드 중';
        case 'completed': return '완료';
        case 'failed': return '실패';
        case 'canceled': return '취소됨';
        default: return status;
    }
}

const INTERNAL_JOB_MESSAGES: Array<[string, string]> = [
    ['Preparing project assets', '프로젝트 자료를 안전하게 준비하고 있습니다.'],
    ['Job requeued and waiting for a processor', '복구 요청을 저장했습니다. 처리 서버 배정을 기다리고 있습니다.'],
    ['Cancellation requested', '안전한 중단 지점에서 작업을 취소하고 있습니다.'],
    ['Cancellation completed', '작업 취소를 완료했습니다. 추가 처리는 시작되지 않습니다.'],
    ['Job canceled before processing', '처리를 시작하기 전에 작업을 취소했습니다.'],
    ['Extracting the last frame', '다음 장면 연결을 위해 마지막 프레임을 저장하고 있습니다.'],
    ['The last frame was stored', '다음 장면 연결에 사용할 마지막 프레임을 저장했습니다.'],
    ['Downloading and normalizing selected clips', '선택한 영상을 합칠 수 있도록 준비하고 있습니다.'],
    ['Uploading merged clip', '합친 영상을 저장하고 연결 프레임을 만들고 있습니다.'],
    ['Merged clip saved', '합친 영상을 프로젝트 타임라인에 저장했습니다.'],
    ['Auto-merging generated segments', '완성된 장면을 하나의 영상으로 합치고 있습니다.'],
];

export function jobMessageLabel(job: VideoStudioJob): string {
    const message = job.message?.trim();
    if (message) {
        if (/[가-힣]/.test(message)) return message;
        const localized = INTERNAL_JOB_MESSAGES.find(([source]) => message.includes(source));
        if (localized) return localized[1];
    }

    switch (job.status) {
        case 'queued': return '요청을 저장했습니다. 처리 서버 배정을 기다리고 있습니다.';
        case 'running': return '영상 제작을 진행하고 있습니다. 이 페이지를 닫아도 작업은 계속됩니다.';
        case 'uploading': return '생성 결과를 프로젝트에 안전하게 저장하고 있습니다.';
        case 'completed': return '작업을 완료해 프로젝트에 결과를 연결했습니다.';
        case 'failed': return '작업을 완료하지 못했습니다. 기술 정보를 확인한 뒤 다시 시도할 수 있습니다.';
        case 'canceled': return '작업이 취소됐으며 추가 처리는 진행되지 않습니다.';
        default: return '현재 작업 상태를 확인하고 있습니다.';
    }
}

export function jobCostLabels(job: VideoStudioJob): string[] {
    const metadata = asRecord(job.metadata);
    if (!metadata) return [];

    const estimate = asRecord(metadata.costEstimate);
    const renderResult = asRecord(metadata.renderResult);
    const repeatCount = nonNegativeNumber(estimate?.repeatCount) ?? 1;
    const estimatedTotal = nonNegativeNumber(estimate?.estimatedTotalCostUsd);
    const actualCost = repeatCount <= 1 ? nonNegativeNumber(renderResult?.costUsd) : null;
    const labels: string[] = [];

    if (estimatedTotal !== null) labels.push(`승인 당시 예상 ${formatUsd(estimatedTotal)}`);
    if (actualCost !== null) labels.push(`확인된 실제 비용 ${formatUsd(actualCost)}`);
    return labels;
}

export function jobAllowsRetry(job: VideoStudioJob): boolean {
    const metadata = asRecord(job.metadata);
    return metadata?.retryStrategy !== 'manual-review'
        && metadata?.failureCode !== 'ambiguous_provider_submission';
}

export function dateLabel(value: unknown) {
    const time = stamp(value);
    return time ? new Date(time).toLocaleString() : '방금 전';
}
