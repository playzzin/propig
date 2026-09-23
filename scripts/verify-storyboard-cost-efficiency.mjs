import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, schema, hooks, service, nextRoute, hostingRoute] =
  await Promise.all([
    readFile(
      new URL(
        "../src/components/image-generator/StoryboardWorkspace.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/schemas/imageStoryboard.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/hooks/useStoryboardImageGeneration.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/services/imageGenerationService.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/app/api/generate-image/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../functions/src/api/hostingGenerationRoutes.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

assert.ok(
  schema.includes("resourceMode: z.literal('efficient').default('efficient')"),
  "Storyboard image requests must default to the efficient high-quality route.",
);
assert.ok(
  service.includes("resourceMode?: 'efficient' | 'premium'") &&
    hooks.includes("resourceMode: payload.resourceMode") &&
    workspace.includes('resourceMode: "efficient"'),
  "The storyboard resource mode must reach the image provider.",
);

for (const [name, source] of [
  ["Next image route", nextRoute],
  ["Hosting image route", hostingRoute],
]) {
  assert.ok(
    source.includes("EFFICIENT_STORYBOARD_IMAGE_MODEL = 'openai/gpt-image-1-mini'") &&
      source.includes("params.payload.resourceMode === 'efficient'") &&
      source.includes("model.id === EFFICIENT_STORYBOARD_IMAGE_MODEL") &&
      source.includes("model.id === params.configuredModel") &&
      source.includes("? EFFICIENT_STORYBOARD_IMAGE_MODEL") &&
      source.includes("configuredModel: runtime.imageModel"),
    `${name} must keep storyboard requests on the efficient model even when discovery fails while retaining the configured premium fallback.`,
  );
  assert.ok(
    source.includes("await Promise.all(") &&
      source.includes("reduce((") &&
      source.includes("MAX_TOTAL_REFERENCE"),
    `${name} must fetch independent references concurrently and retain the combined-size guard.`,
  );
  assert.ok(
    source.includes("!new Set(['1:1', '3:2', '2:3', 'auto']).has(requestedAspectRatio)") &&
      source.includes("requestedRatioValue[0] >= requestedRatioValue[1]") &&
      source.includes("? '3:2'") &&
      source.includes(": '2:3'") &&
      source.includes("unsupported|not supported|unknown|invalid"),
    `${name} must translate unsupported efficient-model storyboard ratios to the nearest supported orientation and retry provider wording that says not supported.`,
  );
}

assert.ok(
  /namespace: 'generate-image(?:-minute)?'/.test(nextRoute) &&
    nextRoute.includes("maxRequests: 12") &&
    nextRoute.includes("'Retry-After': String(rateLimit.retryAfterSeconds)"),
  "The local paid image route must reject request bursts before provider execution.",
);

assert.ok(
  workspace.match(/!scene\.generatedImage\?\.url/g)?.length >= 2 &&
    workspace.includes("Math.min(2, pendingScenes.length)") &&
    workspace.includes("await Promise.all(workers)") &&
    workspace.includes('kind: "scene"') &&
    workspace.includes("replacing: Boolean(") &&
    workspace.includes("현재 결과를 교체하며 새 이미지 생성 비용이 발생할 수 있음") &&
    workspace.includes("disabled={!paidActionAccepted}"),
  "Bulk generation must skip completed scenes, parallelize independent scenes, and require explicit inline approval for paid replacements.",
);

console.log("Storyboard cost and latency efficiency contracts verified.");
