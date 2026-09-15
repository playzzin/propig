export const VIDEO_STUDIO_WORKER_PROTOCOL_VERSION = 2;

export const VIDEO_STUDIO_REQUIRED_WORKER_CAPABILITIES = [
  "provider-canvas-normalization-v1",
  "pinned-openrouter-execution-plan-v1",
  "recoverable-provider-postprocess-v1",
  "durable-provider-staging-v1",
] as const;

export type VideoStudioWorkerState =
  | "ready"
  | "outdated"
  | "unavailable"
  | "misconfigured";

export type VideoStudioWorkerStatus = {
  state: VideoStudioWorkerState;
  compatible: boolean;
  protocolVersion: number | null;
  requiredProtocolVersion: number;
  capabilities: string[];
  checkedAt: string;
  message: string;
  latencyMs?: number;
  verification?: "firestore-trigger-challenge";
};

export function hasRequiredVideoStudioWorkerCapabilities(
  capabilities: readonly string[],
): boolean {
  const available = new Set(capabilities);
  return VIDEO_STUDIO_REQUIRED_WORKER_CAPABILITIES.every((capability) =>
    available.has(capability),
  );
}
