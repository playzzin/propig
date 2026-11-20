"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEO_STUDIO_WORKER_PROBE_HANDLERS = exports.VIDEO_STUDIO_WORKER_PROBE_PHASES = exports.VIDEO_STUDIO_WORKER_PROBE_VERSION = exports.VIDEO_STUDIO_WORKER_PROBE_KIND = exports.VIDEO_STUDIO_WORKER_CAPABILITIES = exports.VIDEO_STUDIO_WORKER_PROTOCOL_VERSION = void 0;
exports.readVideoStudioWorkerProbeRequest = readVideoStudioWorkerProbeRequest;
exports.readVideoStudioWorkerProbeResponse = readVideoStudioWorkerProbeResponse;
const zod_1 = require("zod");
exports.VIDEO_STUDIO_WORKER_PROTOCOL_VERSION = 2;
exports.VIDEO_STUDIO_WORKER_CAPABILITIES = [
    'provider-canvas-normalization-v1',
    'pinned-openrouter-execution-plan-v1',
    'recoverable-provider-postprocess-v1',
    'durable-provider-staging-v1',
];
exports.VIDEO_STUDIO_WORKER_PROBE_KIND = 'worker-contract-probe';
exports.VIDEO_STUDIO_WORKER_PROBE_VERSION = 1;
exports.VIDEO_STUDIO_WORKER_PROBE_PHASES = ['create', 'requeue'];
exports.VIDEO_STUDIO_WORKER_PROBE_HANDLERS = [
    'onVideoStudioJobQueued',
    'onVideoStudioJobRequeued',
];
const workerProbeRequestSchema = zod_1.z.object({
    version: zod_1.z.literal(exports.VIDEO_STUDIO_WORKER_PROBE_VERSION),
    phase: zod_1.z.enum(exports.VIDEO_STUDIO_WORKER_PROBE_PHASES),
    challenge: zod_1.z.string().uuid(),
    requestedProtocolVersion: zod_1.z.number().int().nonnegative(),
    requiredCapabilities: zod_1.z.array(zod_1.z.string().trim().min(1)).max(32),
    requestedAt: zod_1.z.string().datetime(),
});
const workerProbeResponseSchema = zod_1.z.object({
    phase: zod_1.z.enum(exports.VIDEO_STUDIO_WORKER_PROBE_PHASES),
    challenge: zod_1.z.string().uuid(),
    protocolVersion: zod_1.z.number().int().nonnegative(),
    capabilities: zod_1.z.array(zod_1.z.string().trim().min(1)).max(32),
    handler: zod_1.z.enum(exports.VIDEO_STUDIO_WORKER_PROBE_HANDLERS),
    completedAt: zod_1.z.string().datetime(),
});
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function readVideoStudioWorkerProbeRequest(value) {
    const job = asRecord(value);
    const metadata = asRecord(job === null || job === void 0 ? void 0 : job.metadata);
    if (!job
        || job.kind !== exports.VIDEO_STUDIO_WORKER_PROBE_KIND
        || job.status !== 'queued'
        || !metadata
        // A probe intentionally has no executable request. This guarantees
        // an older trigger fails request validation before any provider call.
        || Object.prototype.hasOwnProperty.call(metadata, 'request')) {
        return null;
    }
    const parsed = workerProbeRequestSchema.safeParse(metadata.workerContractProbe);
    return parsed.success ? parsed.data : null;
}
function readVideoStudioWorkerProbeResponse(value) {
    const job = asRecord(value);
    const metadata = asRecord(job === null || job === void 0 ? void 0 : job.metadata);
    const probe = asRecord(metadata === null || metadata === void 0 ? void 0 : metadata.workerContractProbe);
    if (!job
        || job.kind !== exports.VIDEO_STUDIO_WORKER_PROBE_KIND
        || job.status !== 'completed'
        || !probe) {
        return null;
    }
    const parsed = workerProbeResponseSchema.safeParse(probe.response);
    return parsed.success ? parsed.data : null;
}
//# sourceMappingURL=workerContract.js.map