function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

async function sha256(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "이 브라우저에서는 안전한 중복 요청 방지 기능을 사용할 수 없습니다.",
    );
  }
  const encoded = new TextEncoder().encode(
    JSON.stringify(canonicalize(value)),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function buildStoryboardSceneVideoIdempotencyKey(params: {
  storyboardId: string;
  sceneId: string;
  videoDesignRevision: number;
  previousIdentity: string;
  visualInputMode: "standard" | "text-only";
  request: unknown;
}): Promise<string> {
  const fingerprint = await sha256({
    scope: "storyboard-scene-v1",
    ...params,
  });
  return `storyboard-scene-v1-${fingerprint}`;
}

export async function buildStoryboardFinalVideoIdempotencyKey(params: {
  storyboardId: string;
  assemblyFingerprint: string;
  resolution: string;
  previousIdentity: string;
  request: unknown;
}): Promise<string> {
  const fingerprint = await sha256({
    scope: "storyboard-final-v1",
    ...params,
  });
  return `storyboard-final-v1-${fingerprint}`;
}
