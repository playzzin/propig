import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries({
      nextProvider: "src/lib/server/video-generation.ts",
      workerProvider: "functions/src/videoStudio/openrouter.ts",
      nextPreflight: "src/lib/server/video-studio-preflight.ts",
      workerRoutes: "functions/src/api/hostingVideoStudioRoutes.ts",
      nextExecutor: "src/lib/server/video-studio-job-executor.ts",
      workerExecutor: "functions/src/videoStudio/processor.ts",
    }).map(async ([name, path]) => [name, await readFile(path, "utf8")]),
  ),
);

for (const [name, source] of [
  ["Next provider", sources.nextProvider],
  ["Firebase provider", sources.workerProvider],
]) {
  assert.ok(
    source.includes("VideoExecutionPlanSchema") ||
      source.includes("videoExecutionPlanSchema"),
    `${name} must validate a persisted execution plan.`,
  );
  assert.ok(
    source.includes("resolvedSize") &&
      source.includes("authorizedMaxCostUsd") &&
      source.includes("execution_plan_price_changed"),
    `${name} must pin the exact provider size and authorized cost.`,
  );
  assert.ok(
    source.includes("discoverVideoModels(params.apiKey, true)") &&
      source.includes("candidate.id === plan.modelId") &&
      source.includes("execution_plan_model_unavailable") &&
      source.includes("execution_plan_stale"),
    `${name} must refresh the live catalog and validate only the pinned model.`,
  );
  assert.ok(
    source.includes("? { size: selected.resolvedSize }") &&
      source.includes("resolution: selected.resolvedResolution") &&
      source.includes("aspect_ratio: aspectRatio"),
    `${name} must use OpenRouter's exact WIDTHxHEIGHT size when the catalog provides it.`,
  );
  assert.ok(
    source.includes("dialogue_exceeds_resolved_duration"),
    `${name} must validate dialogue against the selected model's resolved duration.`,
  );

  const generateSource = source.slice(
    source.indexOf("export async function generateOpenRouterVideo"),
  );
  assert.ok(
    generateSource.indexOf("if (canResume && resumeCheckpoint)") >= 0 &&
      generateSource.indexOf("if (canResume && resumeCheckpoint)") <
        generateSource.indexOf("resolveExecutionPlanSelection({"),
    `${name} must resume a provider checkpoint before catalog validation or a new POST.`,
  );
  assert.ok(
    generateSource.includes("missing_execution_plan") &&
      generateSource.indexOf("missing_execution_plan") <
        generateSource.indexOf("method: \"POST\""),
    `${name} must reject a queued provider request without a saved plan before POST.`,
  );
}

for (const [name, source] of [
  ["Next preflight", sources.nextPreflight],
  ["Firebase queue route", sources.workerRoutes],
]) {
  assert.ok(
    source.includes("createOpenRouterVideoExecutionPlan(") &&
      source.includes("executionPlan"),
    `${name} must persist the server-owned execution plan with the queued job.`,
  );
  assert.ok(
    source.includes("estimatedCostUsd === null"),
    `${name} must reject unverifiable pricing before a paid job is queued.`,
  );
}

for (const [name, source] of [
  ["Next executor", sources.nextExecutor],
  ["Firebase executor", sources.workerExecutor],
]) {
  assert.ok(
    source.includes(
      "executionPlan: baseJobMetadata.executionPlan ?? baseJobMetadata.preflight",
    ),
    `${name} must pass the persisted plan into provider execution.`,
  );
}

console.log("OpenRouter video execution plan verified.");
