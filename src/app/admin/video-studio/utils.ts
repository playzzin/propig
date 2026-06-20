import { VideoStudioClipMode, VideoStudioJobKind, VideoStudioJobStatus } from '@/lib/video-studio';

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

export function dateLabel(value: unknown) {
    const time = stamp(value);
    return time ? new Date(time).toLocaleString() : '방금 전';
}
