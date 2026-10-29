import { createHash } from 'node:crypto';

const IDEMPOTENCY_KEY_MAX_LENGTH = 512;
const IDEMPOTENCY_NAMESPACE = 'video-studio:v1';

export type VideoStudioIdempotencyContract = {
    version: 1;
    jobId: string;
    keyHash: string;
    requestFingerprint: string;
};

export class VideoStudioIdempotencyError extends Error {
    readonly status = 400;

    constructor(message: string) {
        super(message);
        this.name = 'VideoStudioIdempotencyError';
    }
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonicalize(item)]),
    );
}

export function parseVideoStudioIdempotencyContract(params: {
    rawKey: string | null;
    userId: string;
    request: unknown;
}): VideoStudioIdempotencyContract | null {
    const key = params.rawKey?.trim() || '';
    if (!key) return null;
    if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(key)) {
        throw new VideoStudioIdempotencyError('The video idempotency key is invalid or too long.');
    }

    const keyHash = sha256(key);
    return {
        version: 1,
        jobId: `idem_${sha256(`${IDEMPOTENCY_NAMESPACE}\n${params.userId}\n${key}`)}`,
        keyHash,
        requestFingerprint: sha256(JSON.stringify(canonicalize(params.request))),
    };
}
