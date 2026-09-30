export type FirebaseAuthVerificationFailure = {
  status: 401 | 500 | 503;
  message: string;
};

const VERIFIER_UNAVAILABLE_PATTERN =
  /(?:EACCES|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|ETIMEDOUT|error while making request|fetch failed|network request failed)/i;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const errorInfo = record.errorInfo;
    if (errorInfo && typeof errorInfo === "object") {
      const message = (errorInfo as Record<string, unknown>).message;
      if (typeof message === "string") return message;
    }
  }
  return String(error);
}

export function classifyFirebaseAuthVerificationError(
  error: unknown,
): FirebaseAuthVerificationFailure {
  const message = errorMessage(error);

  if (message.includes("Could not load the default credentials")) {
    return {
      status: 500,
      message: "Firebase Admin service account is required.",
    };
  }

  if (VERIFIER_UNAVAILABLE_PATTERN.test(message)) {
    return {
      status: 503,
      message:
        "Firebase 인증 서버에 연결할 수 없습니다. 네트워크 연결을 확인한 후 다시 시도해 주세요.",
    };
  }

  return { status: 401, message: "The provided auth token is invalid." };
}
