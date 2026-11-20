import { z } from 'zod';

export const VIDEO_STUDIO_WORKER_PROTOCOL_VERSION = 2;

export const VIDEO_STUDIO_WORKER_CAPABILITIES = [
    'provider-canvas-normalization-v1',
    'pinned-openrouter-execution-plan-v1',
    'recoverable-provider-postprocess-v1',
    'durable-provider-staging-v1',
] as const;

export const VIDEO_STUDIO_WORKER_PROBE_KIND = 'worker-contract-probe';
export const VIDEO_STUDIO_WORKER_PROBE_VERSION = 1;
export const VIDEO_STUDIO_WORKER_PROBE_PHASES = ['create', 'requeue'] as const;
export const VIDEO_STUDIO_WORKER_PROBE_HANDLERS = [
    'onVideoStudioJobQueued',
    'onVideoStudioJobRequeued',
] as const;

const workerProbeRequestSchema = z.object({
    version: z.literal(VIDEO_STUDIO_WORKER_PROBE_VERSION),
    phase: z.enum(VIDEO_STUDIO_WORKER_PROBE_PHASES),
    challenge: z.string().uuid(),
    requestedProtocolVersion: z.number().int().nonnegative(),
    requiredCapabilities: z.array(z.string().trim().min(1)).max(32),
    requestedAt: z.string().datetime(),
});

const workerProbeResponseSchema = z.object({
    phase: z.enum(VIDEO_STUDIO_WORKER_PROBE_PHASES),
    challenge: z.string().uuid(),
    protocolVersion: z.number().int().nonnegative(),
    capabilities: z.array(z.string().trim().min(1)).max(32),
    handler: z.enum(VIDEO_STUDIO_WORKER_PROBE_HANDLERS),
    completedAt: z.string().datetime(),
});

export type VideoStudioWorkerProbeRequest = z.infer<typeof workerProbeRequestSchema>;
export type VideoStudioWorkerProbeResponse = z.infer<typeof workerProbeResponseSchema>;

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export function readVideoStudioWorkerProbeRequest(value: unknown): VideoStudioWorkerProbeRequest | null {
    const job = asRecord(value);
    const metadata = asRecord(job?.metadata);
    if (
        !job
        || job.kind !== VIDEO_STUDIO_WORKER_PROBE_KIND
        || job.status !== 'queued'
        || !metadata
        // A probe intentionally has no executable request. This guarantees
        // an older trigger fails request validation before any provider call.
        || Object.prototype.hasOwnProperty.call(metadata, 'request')
    ) {
        return null;
    }

    const parsed = workerProbeRequestSchema.safeParse(metadata.workerContractProbe);
    return parsed.success ? parsed.data : null;
}

export function readVideoStudioWorkerProbeResponse(value: unknown): VideoStudioWorkerProbeResponse | null {
    const job = asRecord(value);
    const metadata = asRecord(job?.metadata);
    const probe = asRecord(metadata?.workerContractProbe);
    if (
        !job
        || job.kind !== VIDEO_STUDIO_WORKER_PROBE_KIND
        || job.status !== 'completed'
        || !probe
    ) {
        return null;
    }

    const parsed = workerProbeResponseSchema.safeParse(probe.response);
    return parsed.success ? parsed.data : null;
}
