import {
  VIDEO_STUDIO_REQUIRED_WORKER_CAPABILITIES,
  VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
  hasRequiredVideoStudioWorkerCapabilities,
  type VideoStudioWorkerStatus,
} from "@/lib/video-studio-worker-contract";

type RemoteStatusPayload = {
  success?: boolean;
  status?: {
    openRouterApiKeyConfigured?: boolean;
    automaticProcessorConfigured?: boolean;
    worker?: {
      state?: unknown;
      compatible?: unknown;
      protocolVersion?: unknown;
      capabilities?: unknown;
      checkedAt?: unknown;
      message?: unknown;
      latencyMs?: unknown;
      verification?: unknown;
    };
  };
};

const WORKER_STATUS_TIMEOUT_MS = 30_000;

function firebaseProjectId(): string | null {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    null
  );
}

function allowedWorkerHosts(projectId: string | null): Set<string> {
  const hosts = new Set(
    (process.env.VIDEO_STUDIO_WORKER_ALLOWED_HOSTS || "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
  if (projectId) {
    hosts.add(`${projectId}.web.app`);
    hosts.add(`${projectId}.firebaseapp.com`);
  }
  if (process.env.NODE_ENV !== "production") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
  }
  return hosts;
}

function resolveWorkerStatusOrigin(): string | null {
  const projectId = firebaseProjectId();
  const configured = process.env.VIDEO_STUDIO_WORKER_STATUS_ORIGIN?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      const isLocalDevelopment =
        process.env.NODE_ENV !== "production" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1");
      if (
        (!isLocalDevelopment && url.protocol !== "https:") ||
        !allowedWorkerHosts(projectId).has(url.hostname.toLowerCase())
      ) {
        return null;
      }
      return url.origin;
    } catch {
      return null;
    }
  }

  return projectId ? `https://${projectId}.web.app` : null;
}

function unavailableWorkerStatus(message: string): VideoStudioWorkerStatus {
  return {
    state: "unavailable",
    compatible: false,
    protocolVersion: null,
    requiredProtocolVersion: VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
    capabilities: [],
    checkedAt: new Date().toISOString(),
    message,
  };
}

export async function inspectVideoStudioWorkerStatus(params: {
  authorization: string | null;
  requestOrigin?: string | null;
}): Promise<{
  worker: VideoStudioWorkerStatus;
  openRouterApiKeyConfigured: boolean | null;
  automaticProcessorConfigured: boolean;
}> {
  const origin = resolveWorkerStatusOrigin();
  if (!origin) {
    return {
      worker: unavailableWorkerStatus(
        "영상 처리 서버 주소를 확인하지 못했습니다. Firebase 프로젝트 설정을 확인해 주세요.",
      ),
      openRouterApiKeyConfigured: null,
      automaticProcessorConfigured: false,
    };
  }
  if (!params.authorization) {
    return {
      worker: unavailableWorkerStatus(
        "영상 처리 서버 상태를 확인하려면 다시 로그인해 주세요.",
      ),
      openRouterApiKeyConfigured: null,
      automaticProcessorConfigured: false,
    };
  }
  try {
    if (
      params.requestOrigin &&
      new URL(params.requestOrigin).origin === origin
    ) {
      return {
        worker: unavailableWorkerStatus(
          "영상 처리 서버 상태 주소가 현재 앱과 같아 재귀 요청을 차단했습니다. 전용 Firebase Hosting 주소를 확인해 주세요.",
        ),
        openRouterApiKeyConfigured: null,
        automaticProcessorConfigured: false,
      };
    }
  } catch {
    return {
      worker: unavailableWorkerStatus(
        "현재 앱 주소를 확인하지 못해 영상 처리 서버 점검을 중단했습니다.",
      ),
      openRouterApiKeyConfigured: null,
      automaticProcessorConfigured: false,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(`${origin}/api/video-studio/status`, {
      method: "GET",
      headers: { Authorization: params.authorization },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | RemoteStatusPayload
      | null;
    if (!response.ok || !payload?.success || !payload.status) {
      return {
        worker: unavailableWorkerStatus(
          "배포된 영상 처리 서버의 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.",
        ),
        openRouterApiKeyConfigured: null,
        automaticProcessorConfigured: false,
      };
    }

    const rawProtocolVersion = payload.status.worker?.protocolVersion;
    const protocolVersion =
      typeof rawProtocolVersion === "number" &&
      Number.isInteger(rawProtocolVersion) &&
      rawProtocolVersion >= 0
        ? rawProtocolVersion
        : null;
    const capabilities = Array.isArray(payload.status.worker?.capabilities)
      ? payload.status.worker.capabilities.filter(
          (capability): capability is string =>
            typeof capability === "string" && capability.length > 0,
        )
      : [];
    const contractCompatible =
      protocolVersion !== null &&
      protocolVersion >= VIDEO_STUDIO_WORKER_PROTOCOL_VERSION &&
      hasRequiredVideoStudioWorkerCapabilities(capabilities);
    const reportedState = payload.status.worker?.state;
    const state =
      reportedState === "ready" ||
      reportedState === "outdated" ||
      reportedState === "unavailable" ||
      reportedState === "misconfigured"
        ? reportedState
        : null;
    const openRouterApiKeyConfigured =
      typeof payload.status.openRouterApiKeyConfigured === "boolean"
        ? payload.status.openRouterApiKeyConfigured
        : null;
    const automaticProcessorConfigured =
      payload.status.automaticProcessorConfigured === true;
    const compatible =
      payload.status.worker?.compatible === true &&
      contractCompatible &&
      openRouterApiKeyConfigured === true &&
      automaticProcessorConfigured;
    const resolvedState = compatible
      ? "ready"
      : state === "outdated" || state === "unavailable" || state === "misconfigured"
        ? state
        : !contractCompatible
          ? "outdated"
          : "misconfigured";
    const checkedAt = payload.status.worker?.checkedAt;
    const remoteMessage = payload.status.worker?.message;
    const latencyMs = payload.status.worker?.latencyMs;
    const verification = payload.status.worker?.verification;
    const fallbackMessage =
      resolvedState === "outdated"
        ? "배포된 영상 처리 서버가 이전 버전입니다. 최신 Functions를 배포하기 전에는 추가 비용이 드는 재시도를 막습니다."
        : resolvedState === "unavailable"
          ? "배포된 영상 처리 서버에 연결하지 못했습니다. 서버 연결을 확인한 뒤 다시 점검해 주세요."
          : resolvedState === "misconfigured"
            ? "영상 처리 서버 설정이 완전하지 않습니다. OpenRouter 키와 자동 처리 구성을 확인해 주세요."
            : "영상 처리 서버가 캔버스 보정과 비용 안전 규격을 지원합니다.";

    return {
      worker: {
        state: resolvedState,
        compatible,
        protocolVersion,
        requiredProtocolVersion: VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
        capabilities,
        checkedAt:
          typeof checkedAt === "string" && checkedAt.trim()
            ? checkedAt
            : new Date().toISOString(),
        message:
          state === resolvedState &&
          typeof remoteMessage === "string" &&
          remoteMessage.trim()
            ? remoteMessage
            : fallbackMessage,
        ...(typeof latencyMs === "number" && Number.isFinite(latencyMs) && latencyMs >= 0
          ? { latencyMs }
          : {}),
        ...(verification === "firestore-trigger-challenge"
          ? { verification }
          : {}),
      },
      openRouterApiKeyConfigured,
      automaticProcessorConfigured,
    };
  } catch {
    return {
      worker: unavailableWorkerStatus(
        "배포된 영상 처리 서버에 연결하지 못했습니다. 서버 연결을 확인한 뒤 다시 점검해 주세요.",
      ),
      openRouterApiKeyConfigured: null,
      automaticProcessorConfigured: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function workerCompatibilityErrorMessage(
  worker: VideoStudioWorkerStatus,
): string {
  return `${worker.message} 서버 상태를 새로고침해 최신 버전이 확인되면 다시 제작해 주세요.`;
}

export const VIDEO_STUDIO_WORKER_CONTRACT = {
  protocolVersion: VIDEO_STUDIO_WORKER_PROTOCOL_VERSION,
  capabilities: [...VIDEO_STUDIO_REQUIRED_WORKER_CAPABILITIES],
} as const;
