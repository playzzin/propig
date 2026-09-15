import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canReuseStoryboardVideoProviderJob,
  describeStoryboardVideoRecovery,
} from "../src/lib/storyboard-video-recovery.ts";
import {
  isFirebaseAuthTokenRejected,
  withFirebaseAuthRetry,
} from "../src/lib/firebase-auth-retry.ts";
import { classifyFirebaseAuthVerificationError } from "../src/lib/server/firebase-auth-verification-error.ts";

const schemaSource = await readFile("src/schemas/imageStoryboard.ts", "utf8");
const panelSource = await readFile(
  "src/components/image-generator/StoryboardVideoProductionPanel.tsx",
  "utf8",
);
const functionProcessorSource = await readFile(
  "functions/src/videoStudio/processor.ts",
  "utf8",
);
const nextExecutorSource = await readFile(
  "src/lib/server/video-studio-job-executor.ts",
  "utf8",
);
const functionOpenRouterSource = await readFile(
  "functions/src/videoStudio/openrouter.ts",
  "utf8",
);
const nextOpenRouterSource = await readFile(
  "src/lib/server/video-generation.ts",
  "utf8",
);
const recoverySource = await readFile(
  "src/lib/storyboard-video-recovery.ts",
  "utf8",
);
const sceneEditorSource = await readFile(
  "src/components/image-generator/StoryboardSceneProductionEditor.tsx",
  "utf8",
);
const videoStudioServiceSource = await readFile(
  "src/services/videoStudioService.ts",
  "utf8",
);
const nextJobRouteSource = await readFile(
  "src/app/api/video-studio/jobs/[jobId]/route.ts",
  "utf8",
);
const nextAdminSource = await readFile(
  "src/lib/server/video-studio-admin.ts",
  "utf8",
);
const functionsRouteSource = await readFile(
  "functions/src/api/hostingVideoStudioRoutes.ts",
  "utf8",
);
const fileManagerSource = await readFile(
  "src/components/image-generator/StoryboardProjectFileManager.tsx",
  "utf8",
);

assert.equal(
  isFirebaseAuthTokenRejected(new Error("The provided auth token is invalid.")),
  true,
  "The client must recognize a rejected Firebase token without retrying unrelated failures.",
);
assert.equal(
  isFirebaseAuthTokenRejected(new Error("관리자 권한이 없습니다.")),
  false,
  "A permission failure must not be treated as a refreshable token failure.",
);
assert.deepEqual(
  classifyFirebaseAuthVerificationError(
    new Error("Error while making request: . Error code: EACCES"),
  ),
  {
    status: 503,
    message:
      "Firebase 인증 서버에 연결할 수 없습니다. 네트워크 연결을 확인한 후 다시 시도해 주세요.",
  },
  "A Firebase verifier transport failure must not be reported as an invalid user token.",
);
assert.deepEqual(
  classifyFirebaseAuthVerificationError(new Error("JWT signature is invalid")),
  { status: 401, message: "The provided auth token is invalid." },
  "A real verification rejection must remain an authentication failure.",
);
{
  const tokenCalls = [];
  const requestCalls = [];
  const user = {
    async getIdToken(forceRefresh = false) {
      tokenCalls.push(forceRefresh);
      return forceRefresh ? "fresh-token" : "cached-token";
    },
  };
  const result = await withFirebaseAuthRetry(user, async (token) => {
    requestCalls.push(token);
    if (token === "cached-token") {
      throw new Error("The provided auth token is invalid.");
    }
    return "ready";
  });
  assert.equal(result, "ready");
  assert.deepEqual(tokenCalls, [false, true]);
  assert.deepEqual(requestCalls, ["cached-token", "fresh-token"]);
}
assert.ok(
  panelSource.includes("withFirebaseAuthRetry") &&
    panelSource.includes("getStudioRuntimeStatus") &&
    panelSource.includes("requireProviderResume: true"),
  "Runtime readiness and no-charge provider recovery must retry once with a freshly issued token.",
);
assert.ok(
  fileManagerSource.includes("withFirebaseAuthRetry") &&
    fileManagerSource.includes("getProjectStorageOverview"),
  "Storyboard file inspection must recover from a stale Firebase token without console error loops.",
);

assert.ok(
  schemaSource.includes("STORYBOARD_AUTOMATION_RETRY_LIMIT = 1"),
  "The persisted workflow must define the retry cap once.",
);
assert.ok(
  schemaSource.includes("z.preprocess(") &&
    schemaSource.includes("Math.min(Math.max(Math.trunc(value), 0), STORYBOARD_AUTOMATION_RETRY_LIMIT)"),
  "Legacy retry counts must be clamped to the one-retry policy instead of confusing users or resubmitting jobs repeatedly.",
);
assert.ok(
  panelSource.includes("function isVideoCanvasValidationFailure") &&
    panelSource.includes("!isVideoCanvasValidationFailureForScene"),
  "A deterministic provider canvas mismatch must stop automation instead of issuing another paid request.",
);
assert.ok(
  panelSource.includes("storyboard.videoProduction.automationRetryCount,") &&
    panelSource.includes("AUTOMATION_RETRY_LIMIT,"),
  "The recovery console must not display a legacy retry count above the active policy.",
);
assert.ok(
  panelSource.includes("추가 생성비 없이 규격 보정") &&
    panelSource.includes("참조 사진이나 프롬프트를 바꿀 필요는 없습니다."),
  "The recovery guidance must explain that canvas mismatch reuses the completed provider output without changing the prompt.",
);

for (const [name, source] of [
  ["Firebase worker", functionProcessorSource],
  ["Next.js executor", nextExecutorSource],
]) {
  assert.ok(
    source.includes("function recoverCompletedCanvasCheckpoint") &&
      source.includes("renderResult.requestId !== discarded.providerJobId") &&
      source.includes("providerVideo: recoverableProviderOutput") &&
      source.includes("recoverable: Boolean(recoverableProviderOutput)") &&
      source.includes("checkpoint: activeProviderCheckpoint"),
    `${name} must reconstruct historical completed canvas jobs and preserve future provider checkpoints.`,
  );
  assert.ok(
    source.indexOf("recoverCompletedCanvasCheckpoint({") < source.indexOf("const resumeCheckpoint ="),
    `${name} must restore the completed checkpoint before deciding whether to submit a provider job.`,
  );
  assert.ok(
    source.includes("requireResumeCheckpoint: providerResumeRequired") &&
      source.includes("providerResumeRequired = false"),
    `${name} must require the first recovery segment to resume and release that invariant only after the clip is saved.`,
  );
}

for (const [name, source] of [
  ["Firebase OpenRouter client", functionOpenRouterSource],
  ["Next.js OpenRouter client", nextOpenRouterSource],
]) {
  const generateSource = source.slice(
    source.indexOf("export async function generateOpenRouterVideo"),
  );
  assert.ok(
    generateSource.indexOf("if (options.requireResumeCheckpoint && !canResume)") <
      generateSource.indexOf("const hasExecutionPlan = options.executionPlan !== undefined"),
    `${name} must reject an invalid promised recovery before catalog, credit, or provider POST work.`,
  );
  assert.ok(
    source.includes('code: "provider_resume_checkpoint_invalid"') &&
      source.includes("No new provider request was submitted"),
    `${name} must fail closed instead of silently turning recovery into a new paid render.`,
  );
}
{
  const nextGenerateSource = nextOpenRouterSource.slice(
    nextOpenRouterSource.indexOf("export async function generateOpenRouterVideo"),
  );
  assert.ok(
    nextGenerateSource.indexOf("if (options.requireResumeCheckpoint && !canResume)") <
      nextGenerateSource.indexOf("const validationError = validateVideoPayload(payload)") &&
      nextGenerateSource.includes("if (!canResume)"),
    "Next.js recovery must validate the resume-only contract first and bypass new-generation payload/dialogue validation.",
  );
}
{
  const functionGenerateSource = functionOpenRouterSource.slice(
    functionOpenRouterSource.indexOf("export async function generateOpenRouterVideo"),
  );
  assert.ok(
    functionGenerateSource.indexOf("if (options.requireResumeCheckpoint && !canResume)") <
      functionGenerateSource.indexOf('if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing.")') &&
      functionGenerateSource.includes(
        'if (!canResume && audioMode === "dialogue" && !payload.dialogue?.trim())',
      ) &&
      functionGenerateSource.includes('if (!canResume && audioMode === "dialogue")'),
    "Firebase recovery must validate the resume-only contract first and bypass new-generation dialogue checks.",
  );
}

assert.ok(
  recoverySource.includes("'reprocess-canvas'") &&
    recoverySource.includes("추가 생성비 없이 규격 보정") &&
    recoverySource.includes("추가 영상 생성비는 들지 않습니다"),
  "The recovery UI must identify completed canvas output and promise only no-charge server normalization.",
);
const historicalCanvasMismatchJob = {
  status: "failed",
  metadata: {
    providerVideoDiscarded: {
      reason: "resolution_mismatch",
      providerJobId: "provider-job-existing",
      modelId: "bytedance/seedance-2.0-fast",
      discardedAt: "2026-07-31T00:00:00.000Z",
    },
    renderResult: {
      requestId: "provider-job-existing",
      modelUsed: "bytedance/seedance-2.0-fast",
    },
  },
};
assert.equal(
  canReuseStoryboardVideoProviderJob(historicalCanvasMismatchJob),
  true,
  "A failed historical 864x496-style canvas mismatch must reuse its completed provider job.",
);
assert.deepEqual(
  describeStoryboardVideoRecovery({
    errorMessage:
      "OpenRouter scene video quality validation failed. Expected 854x480 but received 864x496.",
    job: historicalCanvasMismatchJob,
  }),
  {
    kind: "reprocess-canvas",
    canReuseProviderJob: true,
    title: "영상 생성은 완료됐습니다",
    description:
      "완료된 OpenRouter 결과를 다시 생성하지 않고 서버에서 프로젝트 화면 규격으로 보정합니다. 추가 영상 생성비는 들지 않습니다.",
    actionLabel: "추가 생성비 없이 규격 보정",
  },
  "The exact failure must be presented as no-charge post-processing recovery.",
);
assert.equal(
  canReuseStoryboardVideoProviderJob({
    ...historicalCanvasMismatchJob,
    status: "completed",
  }),
  false,
  "A completed studio clip must not be requeued as provider recovery.",
);
assert.equal(
  describeStoryboardVideoRecovery({
    errorMessage: "stale error text",
    job: { ...historicalCanvasMismatchJob, status: "completed" },
  }).kind,
  "regenerate",
  "Stale error metadata on a completed clip must not advertise no-charge requeue recovery.",
);
const expiredProviderOutputJob = {
  status: "failed",
  metadata: {
    providerVideo: {
      jobId: "provider-job-expired",
      status: "completed",
    },
    providerVideoDiscarded: {
      reason: "provider_output_expired",
      recoverable: false,
      providerJobId: "provider-job-expired",
      modelId: "example/video-model",
      httpStatus: 410,
    },
  },
};
assert.equal(
  canReuseStoryboardVideoProviderJob(expiredProviderOutputJob),
  false,
  "An expired provider content URL must never keep advertising a no-charge recovery loop.",
);
assert.deepEqual(
  describeStoryboardVideoRecovery({ job: expiredProviderOutputJob }),
  {
    kind: "regenerate",
    canReuseProviderJob: false,
    title: "기존 영상 결과의 보관 기간이 지났습니다",
    description:
      "완료됐던 OpenRouter 결과 파일이 만료되어 더는 내려받을 수 없습니다. 장면 설계는 유지되며, 예상 비용을 확인한 뒤 새 영상으로 제작해야 합니다.",
    actionLabel: "새 영상으로 다시 제작",
  },
  "Expired provider content must explain that only a deliberate new render can continue.",
);
const accessBlockedProviderOutputJob = {
  status: "failed",
  metadata: {
    providerVideo: {
      jobId: "provider-job-access-blocked",
      status: "completed",
    },
    providerResumeRequired: true,
    providerVideoAccessIssue: {
      reason: "provider_output_access_denied",
      recoverable: true,
      httpStatus: 403,
    },
  },
};
assert.equal(
  canReuseStoryboardVideoProviderJob(accessBlockedProviderOutputJob),
  true,
  "A 403 must preserve the completed provider checkpoint for a manual no-charge download retry.",
);
assert.deepEqual(
  describeStoryboardVideoRecovery({ job: accessBlockedProviderOutputJob }),
  {
    kind: "resume-storage",
    canReuseProviderJob: true,
    title: "기존 영상 결과의 접근 권한을 확인해 주세요",
    description:
      "OpenRouter가 기존 결과 파일 접근을 거부했습니다. 작업 ID는 보존했으며, 계정 권한을 확인한 뒤 추가 생성비 없이 다시 저장할 수 있습니다.",
    actionLabel: "추가 생성비 없이 다시 저장",
  },
  "A 403 must not be described as expired or lead to a new paid render.",
);
const repeatedlyBlockedProviderOutputJob = {
  ...accessBlockedProviderOutputJob,
  metadata: {
    ...accessBlockedProviderOutputJob.metadata,
    providerVideoAccessIssue: {
      ...accessBlockedProviderOutputJob.metadata.providerVideoAccessIssue,
      recoverable: false,
      attemptCount: 2,
    },
  },
};
assert.equal(
  canReuseStoryboardVideoProviderJob(repeatedlyBlockedProviderOutputJob),
  false,
  "A repeated 403 must stop advertising an impossible no-charge recovery loop.",
);
assert.deepEqual(
  describeStoryboardVideoRecovery({ job: repeatedlyBlockedProviderOutputJob }),
  {
    kind: "regenerate",
    canReuseProviderJob: false,
    title: "기존 영상 결과에 더 이상 접근할 수 없습니다",
    description:
      "OpenRouter가 같은 결과 파일의 다운로드를 반복 거부했습니다. 새 유료 영상 요청은 보내지 않았습니다. 계속하려면 예상 비용을 확인한 뒤 새 영상으로 다시 제작해야 합니다.",
    actionLabel: "새 영상으로 다시 제작 · 새 비용",
  },
  "An exhausted provider download must clearly require a deliberate new paid render.",
);
const legacyRepeatedlyBlockedProviderOutputJob = {
  ...accessBlockedProviderOutputJob,
  metadata: {
    ...accessBlockedProviderOutputJob.metadata,
    queueDispatchToken: "durable-requeue-token",
  },
};
assert.equal(
  canReuseStoryboardVideoProviderJob(legacyRepeatedlyBlockedProviderOutputJob),
  false,
  "A legacy 403 job with a durable requeue token must stop the no-charge recovery loop.",
);
assert.deepEqual(
  describeStoryboardVideoRecovery({ job: legacyRepeatedlyBlockedProviderOutputJob }),
  {
    kind: "regenerate",
    canReuseProviderJob: false,
    title: "기존 영상 결과에 더 이상 접근할 수 없습니다",
    description:
      "OpenRouter가 같은 결과 파일의 다운로드를 반복 거부했습니다. 새 유료 영상 요청은 보내지 않았습니다. 계속하려면 예상 비용을 확인한 뒤 새 영상으로 다시 제작해야 합니다.",
    actionLabel: "새 영상으로 다시 제작 · 새 비용",
  },
  "Legacy workers must use the requeue token as proof that the same provider download already failed again.",
);
assert.ok(
  /existingJob\s*&&\s*canReuseStoryboardVideoProviderJob\(existingJob\)/.test(
    panelSource,
  ) &&
    panelSource.includes('action: "requeue"') &&
    sceneEditorSource.includes("sceneRecovery?.canReuseProviderJob") &&
    sceneEditorSource.includes("sceneRecovery.actionLabel"),
  "The selected-scene action must requeue a reusable provider result instead of submitting a new paid video job.",
);
assert.ok(
  panelSource.includes("scene.video.jobId &&") &&
    panelSource.includes("(!jobSubscriptionReady || jobSubscriptionError)"),
  "A scene with unresolved job history must fail closed before a new provider request can be submitted.",
);
assert.ok(
  sceneEditorSource.includes("!sceneRecovery?.canReuseProviderJob &&") &&
    sceneEditorSource.includes("modelPreflight?.canSubmit === false"),
  "No-charge provider recovery must not be disabled by new-generation credit preflight.",
);
assert.ok(
  panelSource.includes("automationRecovery?.canReuseProviderJob === true") &&
    panelSource.includes("automationRecovery?.description ||") &&
    sceneEditorSource.includes("{sceneRecovery\n                      ? sceneRecovery.actionLabel"),
  "A terminal provider result must remove the ambiguous whole-run resume action and label the remaining scene action as a new paid render.",
);
assert.ok(
  panelSource.includes("options?.forceNewProviderRequest") &&
    sceneEditorSource.includes("새 영상으로 다시 제작 · 새 비용") &&
    sceneEditorSource.includes("onRegenerate"),
  "Recovery and a newly billed render must be separate, explicitly labeled actions so prompt edits are never silently ignored.",
);
assert.ok(
  sceneEditorSource.indexOf("sceneRecovery?.canReuseProviderJob\n                      ? sceneRecovery.actionLabel") <
    sceneEditorSource.indexOf('hasPendingVideoChanges\n                        ? "수정 내용으로 다시 제작"'),
  "A pending edit must not relabel the resume-only primary action as a newly rendered video; the explicit billed action owns edited requests.",
);
assert.ok(
  panelSource.includes("requireProviderResume: true") &&
    videoStudioServiceSource.includes("requireProviderResume?: boolean") &&
    nextJobRouteSource.includes("requireProviderResume: z.boolean().optional()") &&
    nextAdminSource.includes("providerResumeRequired: true") &&
    functionsRouteSource.includes("requireProviderResume: z.boolean().optional().default(false)"),
  "A no-charge recovery action must carry a durable resume-only contract through both HTTP stacks.",
);
for (const [name, source] of [
  ["Firebase worker", functionProcessorSource],
  ["Next.js executor", nextExecutorSource],
]) {
  assert.ok(
    source.includes("baseJobMetadata.providerResumeRequired === true") &&
      source.includes("requireResumeCheckpoint: providerResumeRequired"),
    `${name} must honor the caller's durable resume-only contract before any provider POST.`,
  );
}
for (const [name, source] of [
  ["Next.js requeue route", nextAdminSource],
  ["Functions requeue route", functionsRouteSource],
]) {
  assert.ok(
    source.includes("!hasResumableProviderVideo") &&
      source.includes("새 유료 요청은 전송하지 않았습니다"),
    `${name} must reject a stale recovery promise without dispatching a paid provider request.`,
  );
  assert.ok(
    source.includes("isResumableOpenRouterVideoCheckpoint"),
    `${name} must validate the full stored provider checkpoint contract before accepting resume-only recovery.`,
  );
  assert.ok(
    source.includes("hasAlreadyRequeued") && source.includes("queueDispatchToken"),
    `${name} must reject a legacy access-blocked checkpoint after its durable no-charge retry already ran.`,
  );
}
for (const [name, source] of [
  ["Firebase OpenRouter client", functionOpenRouterSource],
  ["Next.js OpenRouter client", nextOpenRouterSource],
]) {
  assert.ok(
    source.includes("OpenRouterVideoContentDownloadError") &&
      source.includes('code: "ambiguous_provider_submission"') &&
      source.includes("Automatic retry was stopped to prevent duplicate charges"),
    `${name} must distinguish expired content and stop ambiguous POST retries before a duplicate charge.`,
  );
}
for (const [name, source] of [
  ["Firebase worker", functionProcessorSource],
  ["Next.js executor", nextExecutorSource],
]) {
  assert.ok(
    source.includes("provider_output_expired") &&
      source.includes("provider_output_not_found") &&
      source.includes("providerVideoAccessIssue") &&
      (source.includes("providerVideo: null") ||
        source.includes("baseJobMetadata.providerVideo = null") ||
        source.includes("'metadata.providerVideo': null")) &&
      source.includes("providerResumeRequired = false"),
    `${name} must retire only missing/expired output, preserve access-blocked checkpoints, and clear the durable resume-only invariant after a saved clip.`,
  );
  assert.ok(
    source.includes("providerAccessAttemptCount") &&
      source.includes("providerAccessRetryAllowed") &&
      source.includes("attemptCount: providerAccessAttemptCount") &&
      source.includes("recoverable: providerAccessRetryAllowed") &&
      source.includes("provider_output_access_denied"),
    `${name} must stop a repeated 403 recovery loop without submitting a new provider request.`,
  );
}
assert.ok(
  functionOpenRouterSource.includes("[404, 410]") &&
    functionOpenRouterSource.includes("[401, 403]") &&
    nextOpenRouterSource.includes("[404, 410]") &&
    nextOpenRouterSource.includes("[401, 403]"),
  "401/403 access failures must be classified separately from terminal 404/410 output loss.",
);
assert.ok(
  panelSource.includes("!isProviderOutputAccessBlockedForScene"),
  "Access-blocked provider output must wait for a manual no-charge recovery instead of automatic retry loops.",
);

console.log("Storyboard video failure recovery verified.");
