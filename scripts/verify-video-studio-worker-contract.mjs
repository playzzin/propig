import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  clientContract: "src/lib/video-studio-worker-contract.ts",
  workerContract: "functions/src/videoStudio/workerContract.ts",
  workerStatus: "src/lib/server/video-studio-worker-status.ts",
  clientService: "src/services/videoStudioService.ts",
  storyboardVideoPanel: "src/components/image-generator/StoryboardVideoProductionPanel.tsx",
  nextStatusRoute: "src/app/api/video-studio/status/route.ts",
  nextQueueRoute: "src/app/api/video-studio/jobs/route.ts",
  nextJobRoute: "src/app/api/video-studio/jobs/[jobId]/route.ts",
  nextRunRoute: "src/app/api/video-studio/jobs/run/route.ts",
  functionsRoutes: "functions/src/api/hostingVideoStudioRoutes.ts",
  functionsRouter: "functions/src/api/hostingApi.ts",
  functionsTrigger: "functions/src/triggers/onVideoStudioJobQueued.ts",
  functionsRequest: "functions/src/videoStudio/request.ts",
  functionsProcessor: "functions/src/videoStudio/processor.ts",
  recoveryScheduler: "functions/src/triggers/recoverVideoStudioJobs.ts",
  firestoreIndexes: "firestore.indexes.json",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([name, filePath]) => [
      name,
      await readFile(filePath, "utf8"),
    ]),
  ),
);

function readNumericConstant(source, constantName, sourceLabel) {
  const match = source.match(
    new RegExp(`export\\s+const\\s+${constantName}\\s*=\\s*(\\d+)\\s*;`),
  );
  assert.ok(match, `${sourceLabel} must export ${constantName}.`);
  return Number(match[1]);
}

function readStringArrayConstant(source, constantName, sourceLabel) {
  const match = source.match(
    new RegExp(
      `export\\s+const\\s+${constantName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`,
    ),
  );
  assert.ok(match, `${sourceLabel} must export ${constantName}.`);
  const values = [...match[1].matchAll(/["']([^"']+)["']/g)].map(
    (item) => item[1],
  );
  assert.ok(values.length > 0, `${constantName} must not be empty.`);
  assert.equal(
    new Set(values).size,
    values.length,
    `${constantName} must not contain duplicate capabilities.`,
  );
  return values;
}

function assertOrdered(source, checkpoints, sourceLabel) {
  let previousIndex = -1;
  for (const [label, text] of checkpoints) {
    const index = source.indexOf(text);
    assert.ok(index >= 0, `${sourceLabel} must contain ${label}.`);
    assert.ok(
      index > previousIndex,
      `${sourceLabel} must run ${label} before creating or redispatching a paid job.`,
    );
    previousIndex = index;
  }
}

function sourceSection(source, startMarker, endMarker, sourceLabel) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${sourceLabel} must contain ${startMarker}.`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  assert.ok(end > start, `${sourceLabel} must contain ${endMarker} after ${startMarker}.`);
  return source.slice(start, end);
}

const clientProtocolVersion = readNumericConstant(
  sources.clientContract,
  "VIDEO_STUDIO_WORKER_PROTOCOL_VERSION",
  paths.clientContract,
);
const workerProtocolVersion = readNumericConstant(
  sources.workerContract,
  "VIDEO_STUDIO_WORKER_PROTOCOL_VERSION",
  paths.workerContract,
);
const requiredCapabilities = readStringArrayConstant(
  sources.clientContract,
  "VIDEO_STUDIO_REQUIRED_WORKER_CAPABILITIES",
  paths.clientContract,
);
const workerCapabilities = readStringArrayConstant(
  sources.workerContract,
  "VIDEO_STUDIO_WORKER_CAPABILITIES",
  paths.workerContract,
);

assert.equal(
  clientProtocolVersion,
  workerProtocolVersion,
  "The Next.js client contract and Firebase worker protocol versions must match.",
);
assert.deepEqual(
  requiredCapabilities,
  workerCapabilities,
  "The Next.js required capabilities and Firebase worker capabilities must match in exact order.",
);

assert.match(
  sources.workerStatus,
  /fetch\(`\$\{origin\}\/api\/video-studio\/status`/,
  "The Next.js server must inspect the deployed worker status endpoint.",
);
assert.match(
  sources.workerStatus,
  /protocolVersion\s*>=\s*VIDEO_STUDIO_WORKER_PROTOCOL_VERSION/,
  "A deployed worker with an older protocol must be rejected.",
);
assert.match(
  sources.workerStatus,
  /hasRequiredVideoStudioWorkerCapabilities\(capabilities\)/,
  "Worker compatibility must require every advertised capability.",
);
assert.match(
  sources.workerStatus,
  /state:\s*resolvedState/,
  "The Next.js proxy must preserve the deployed worker state instead of labeling every failure outdated.",
);
assert.match(
  sources.workerStatus,
  /typeof remoteMessage === ["']string["']\s*&&\s*remoteMessage\.trim\(\)/,
  "The Next.js proxy must preserve the deployed worker diagnostic message.",
);
assert.match(
  sources.workerStatus,
  /state === resolvedState[\s\S]*?typeof remoteMessage === ["']string["']/,
  "A stale remote success message must not override a stricter local contract failure.",
);
assert.match(
  sources.workerStatus,
  /verification === ["']firestore-trigger-challenge["']/,
  "The Next.js proxy must preserve live-trigger verification evidence.",
);
assert.match(
  sources.clientService,
  /reportedState === ["']outdated["'][\s\S]*?reportedState === ["']unavailable["'][\s\S]*?reportedState === ["']misconfigured["']/,
  "The browser client must preserve the server's actionable blocked state.",
);
assert.match(
  sources.nextStatusRoute,
  /worker:\s*deployedWorker\.worker/,
  "The Next.js status route must expose the inspected worker contract.",
);

for (const operation of ["generate", "extend", "continue", "edit"]) {
  assert.ok(
    sources.nextQueueRoute.includes(`payload.operation === "${operation}"`),
    `The queue route must protect the paid ${operation} operation.`,
  );
}
assertOrdered(
  sources.nextQueueRoute,
  [
    ["idempotent job lookup", "await getIdempotentVideoStudioJob("],
    ["deployed worker inspection", "await inspectVideoStudioWorkerStatus("],
    ["incompatible worker rejection", "if (!deployedWorker.worker.compatible)"],
    ["provider preflight", "const prepared = await preflightVideoStudioJob("],
    ["paid job creation", "const created = await createOrReuseVideoStudioJob("],
  ],
  paths.nextQueueRoute,
);
assert.match(
  sources.nextQueueRoute,
  /VideoStudioServerError\(\s*503,/,
  "An outdated queue worker must fail closed with HTTP 503.",
);

assert.match(
  sources.nextJobRoute,
  /if\s*\(parsed\.data\.action\s*===\s*['"]requeue['"]\)/,
  "Only requeue operations need the paid-worker compatibility guard.",
);
for (const kind of ["generate", "extend", "continue", "edit"]) {
  assert.ok(
    sources.nextJobRoute.includes(`existing.kind === '${kind}'`),
    `The requeue route must protect failed ${kind} jobs.`,
  );
}
assertOrdered(
  sources.nextJobRoute,
  [
    ["owned job lookup", "await getOwnedVideoStudioJob("],
    ["deployed worker inspection", "await inspectVideoStudioWorkerStatus("],
    ["incompatible worker rejection", "if (!deployedWorker.worker.compatible)"],
    ["paid job redispatch", "await requeueOwnedVideoStudioJob("],
  ],
  paths.nextJobRoute,
);
assert.match(
  sources.nextJobRoute,
  /VideoStudioServerError\(\s*503,/,
  "An outdated requeue worker must fail closed with HTTP 503.",
);

const nextRunHandler = sourceSection(
  sources.nextRunRoute,
  "export async function POST",
  null,
  paths.nextRunRoute,
);
for (const operation of ["generate", "extend", "continue", "edit"]) {
  assert.ok(
    nextRunHandler.includes(`payload.operation === "${operation}"`),
    `The legacy synchronous route must protect the paid ${operation} operation.`,
  );
}
assertOrdered(
  nextRunHandler,
  [
    ["idempotent job lookup", "await getIdempotentVideoStudioJob("],
    ["deployed worker inspection", "await inspectVideoStudioWorkerStatus("],
    ["incompatible worker rejection", "if (!deployedWorker.worker.compatible)"],
    ["provider preflight", "const prepared = await preflightVideoStudioJob("],
    ["paid job creation", "const created = await createOrReuseVideoStudioJob("],
    ["direct provider execution", "await executeQueuedVideoStudioJob("],
  ],
  paths.nextRunRoute,
);
assert.match(
  nextRunHandler,
  /VideoStudioServerError\(\s*503,/,
  "An outdated legacy synchronous worker must fail closed with HTTP 503.",
);

const automaticRetrySection = sourceSection(
  sources.storyboardVideoPanel,
  "const attemptCount = sceneJob.attemptCount",
  "const automationCompletedCount",
  paths.storyboardVideoPanel,
);
assertOrdered(
  automaticRetrySection,
  [
    [
      "worker compatibility guard",
      'if (sceneJob.status === "failed" && workerGenerationBlocked)',
    ],
    ["automatic recovery request", 'action: "requeue"'],
  ],
  `${paths.storyboardVideoPanel} automatic recovery`,
);
assert.match(
  automaticRetrySection,
  /submitSceneJob,\s*workerGenerationBlocked,/,
  "Automatic recovery must react when the worker compatibility gate changes.",
);

assert.match(
  sources.workerContract,
  /VIDEO_STUDIO_WORKER_PROBE_KIND\s*=\s*['"]worker-contract-probe['"]/,
  "The Functions worker contract must define a non-provider probe job kind.",
);
assert.match(
  sources.workerContract,
  /VIDEO_STUDIO_WORKER_PROBE_PHASES\s*=\s*\[['"]create['"],\s*['"]requeue['"]\]/,
  "One probe must verify both the create and requeue Firestore triggers.",
);
assert.match(
  sources.workerContract,
  /Object\.prototype\.hasOwnProperty\.call\(metadata,\s*['"]request['"]\)/,
  "A worker probe must be rejected if it contains an executable provider request.",
);

const createTriggerSection = sourceSection(
  sources.functionsTrigger,
  "export const onVideoStudioJobQueued",
  "export const onVideoStudioJobRequeued",
  paths.functionsTrigger,
);
const requeueTriggerSection = sourceSection(
  sources.functionsTrigger,
  "export const onVideoStudioJobRequeued",
  null,
  paths.functionsTrigger,
);
assertOrdered(
  createTriggerSection,
  [
    ["probe recognition", "readVideoStudioWorkerProbeRequest(job)"],
    ["create challenge completion", "await completeWorkerContractProbe("],
    ["provider-job dispatch", "await processQueuedJobById(jobId)"],
  ],
  `${paths.functionsTrigger} create handler`,
);
assertOrdered(
  requeueTriggerSection,
  [
    ["probe recognition", "readVideoStudioWorkerProbeRequest(after)"],
    ["requeue challenge completion", "await completeWorkerContractProbe("],
    ["provider-job dispatch", "await processQueuedJobById(jobId)"],
  ],
  `${paths.functionsTrigger} requeue handler`,
);
for (const requiredResponseField of [
  "phase: probe.phase",
  "challenge: probe.challenge",
  "protocolVersion: VIDEO_STUDIO_WORKER_PROTOCOL_VERSION",
  "capabilities: [...VIDEO_STUDIO_WORKER_CAPABILITIES]",
]) {
  assert.ok(
    sources.functionsTrigger.includes(requiredResponseField),
    `The trigger response must include ${requiredResponseField}.`,
  );
}

const probeCreateWrite = sourceSection(
  sources.functionsRoutes,
  "await probeRef.create({",
  "probeCreated = true",
  paths.functionsRoutes,
);
assert.match(
  probeCreateWrite,
  /status:\s*['"]queued['"]/,
  "The probe must enter the same Firestore create-trigger path as a queued job.",
);
assert.match(
  probeCreateWrite,
  /workerContractProbe:\s*\{/,
  "The probe must carry an isolated challenge payload.",
);
assert.doesNotMatch(
  probeCreateWrite,
  /\brequest\s*:/,
  "The probe document must never contain an executable provider request.",
);
assert.match(
  sources.functionsRoutes,
  /['"]metadata\.workerContractProbe['"]:\s*\{[\s\S]*?phase:\s*['"]requeue['"]/,
  "The same probe must advance to a requeue challenge through a Firestore update.",
);
assert.match(
  sources.functionsRoutes,
  /handler:\s*['"]onVideoStudioJobQueued['"]/,
  "The create phase must require the actual create trigger handler identity.",
);
assert.match(
  sources.functionsRoutes,
  /handler:\s*['"]onVideoStudioJobRequeued['"]/,
  "The requeue phase must require the actual update trigger handler identity.",
);
assert.match(
  sources.functionsRoutes,
  /finally\s*\{[\s\S]*?await probeRef\.delete\(\)/,
  "Probe documents must be removed in a finally block.",
);
assert.match(
  sources.functionsRoutes,
  /WORKER_PROBE_SUCCESS_CACHE_MS\s*=\s*60_000/,
  "Successful probes must use a short 60-second memory cache.",
);
assert.match(
  sources.functionsRoutes,
  /WORKER_PROBE_FAILURE_CACHE_MS\s*=\s*10_000/,
  "Failed probes must expire quickly.",
);
assert.match(
  sources.functionsRoutes,
  /if\s*\(workerProbeInFlight\)\s*\{\s*return workerProbeInFlight;/,
  "Concurrent status and queue requests must share one in-flight probe.",
);
assert.match(
  sources.functionsRoutes,
  /const automaticProcessorConfigured\s*=\s*apiKeyConfigured\s*&&\s*probe\.compatible/,
  "Automatic processing must require both a verified trigger and an API key.",
);
assert.match(
  sources.functionsRoutes,
  /requiredProtocolVersion:\s*VIDEO_STUDIO_WORKER_PROTOCOL_VERSION/,
  "The Firebase status endpoint must advertise the required protocol version.",
);
assert.match(
  sources.functionsRoutes,
  /verification:\s*['"]firestore-trigger-challenge['"]/,
  "The status endpoint must identify its live Firestore trigger verification.",
);
const functionsStatusHandler = sourceSection(
  sources.functionsRoutes,
  "export async function handleVideoStudioStatus",
  "const VideoEstimateQuerySchema",
  paths.functionsRoutes,
);
assert.doesNotMatch(
  functionsStatusHandler,
  /automaticProcessorConfigured:\s*true|compatible:\s*true/,
  "The production status handler must never hard-code worker readiness.",
);
assert.match(
  sources.functionsRoutes,
  /throw new ApiError\(503,\s*availability\.worker\.message\)/,
  "A failed or timed-out live probe must fail closed with HTTP 503.",
);

const jobsHandler = sourceSection(
  sources.functionsRoutes,
  "export async function handleVideoStudioJobs",
  "async function preflightQueuedVideoStudioJob",
  paths.functionsRoutes,
);
assertOrdered(
  jobsHandler,
  [
    ["fresh trigger challenge", "await requireFreshProviderWorker()"],
    ["provider preflight", "preflightQueuedVideoStudioJob("],
    ["paid job creation", "createQueuedJob("],
  ],
  `${paths.functionsRoutes} /jobs`,
);

const processHandler = sourceSection(
  sources.functionsRoutes,
  "export async function handleVideoStudioJobProcess",
  "export async function handleVideoStudioJobRun",
  paths.functionsRoutes,
);
assertOrdered(
  processHandler,
  [
    ["owned job lookup", "await requireOwnedJob("],
    ["fresh trigger challenge", "await requireFreshProviderWorker()"],
    ["direct provider processing", "await processQueuedVideoStudioJob("],
  ],
  `${paths.functionsRoutes} /jobs/process`,
);

const runHandler = sourceSection(
  sources.functionsRoutes,
  "export async function handleVideoStudioJobRun",
  "const UpdateJobSchema",
  paths.functionsRoutes,
);
assertOrdered(
  runHandler,
  [
    ["fresh trigger challenge", "await requireFreshProviderWorker()"],
    ["provider preflight", "preflightQueuedVideoStudioJob("],
    ["paid job creation", "createQueuedJob("],
    ["direct provider processing", "await processQueuedVideoStudioJob("],
  ],
  `${paths.functionsRoutes} /jobs/run`,
);

const updateHandler = sourceSection(
  sources.functionsRoutes,
  "export async function handleVideoStudioJobById",
  "const ResequenceSchema",
  paths.functionsRoutes,
);
assertOrdered(
  updateHandler,
  [
    ["owned job lookup", "await requireOwnedJob("],
    ["fresh trigger challenge", "await requireFreshProviderWorker()"],
    ["requeue transaction", "await db.runTransaction("],
    ["paid job redispatch", "transaction.update(ref,"],
  ],
  `${paths.functionsRoutes} requeue`,
);
assert.match(
  sources.functionsRoutes,
  /PROVIDER_JOB_OPERATIONS\s*=\s*new Set\(\[['"]generate['"],\s*['"]extend['"],\s*['"]continue['"],\s*['"]edit['"]\]\)/,
  "Only provider-backed operations should require the paid-worker guard.",
);

assert.match(
  sources.functionsRequest,
  /const videoStudioIdSchema\s*=\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(240\)/,
  "The legacy worker request schema must use the bounded id contract.",
);
assert.match(
  sources.functionsRequest,
  /operation:\s*z\.enum\(\[['"]generate['"],[\s\S]*?projectId:\s*videoStudioIdSchema/,
  "The legacy worker request schema must require operation and projectId.",
);
const processorSection = sourceSection(
  sources.functionsProcessor,
  "export async function processQueuedVideoStudioJob",
  null,
  paths.functionsProcessor,
);
assertOrdered(
  processorSection,
  [
    ["queued request validation", "request = readRequest(claimed.data)"],
    ["provider generation", "await generateOpenRouterVideo("],
  ],
  paths.functionsProcessor,
);
assert.match(
  sources.functionsRouter,
  /['"]\/api\/video-studio\/status['"],\s*handleVideoStudioStatus/,
  "The Firebase hosting router must expose the worker status endpoint.",
);
for (const [route, handler] of [
  ["/api/video-studio/jobs", "handleVideoStudioJobs"],
  ["/api/video-studio/jobs/process", "handleVideoStudioJobProcess"],
  ["/api/video-studio/jobs/run", "handleVideoStudioJobRun"],
]) {
  assert.ok(
    sources.functionsRouter.includes(`['${route}', ${handler}]`),
    `The Firebase hosting router must route ${route} through its guarded handler.`,
  );
}
assert.match(
  sources.functionsRouter,
  /handleVideoStudioJobById\(req,\s*res,\s*decodeURIComponent\(jobMatch\[1\]\)\)/,
  "The dynamic requeue route must use the guarded job handler.",
);

assert.match(
  sources.functionsProcessor,
  /nextAttemptAt:\s*admin\.firestore\.Timestamp\.fromMillis\(Date\.now\(\) \+ nextPollDelayMs\)/,
  "A pending provider job must schedule a later poll instead of immediately retriggering a long-running worker.",
);
assert.match(
  sources.recoveryScheduler,
  /schedule:\s*['"]every 1 minutes['"]/,
  "The recovery scheduler must check due provider polls frequently enough for visible progress.",
);
for (const queryContract of [
  ".where('updatedAt', '<=', staleCutoff)",
  ".where('nextAttemptAt', '<=', nowTimestamp)",
  ".where('nextAttemptAt', '==', null)",
  ".orderBy('updatedAt', 'asc')",
  ".orderBy('nextAttemptAt', 'asc')",
]) {
  assert.ok(
    sources.recoveryScheduler.includes(queryContract),
    `The recovery scheduler must include ${queryContract}.`,
  );
}
const firestoreIndexes = JSON.parse(sources.firestoreIndexes);
const videoStudioIndexFields = firestoreIndexes.indexes
  .filter((index) => index.collectionGroup === "video_studio_jobs")
  .map((index) => index.fields.map((field) => field.fieldPath).join("+"));
for (const requiredFields of [
  "status+updatedAt",
  "status+nextAttemptAt",
  "status+nextAttemptAt+updatedAt",
]) {
  assert.ok(
    videoStudioIndexFields.includes(requiredFields),
    `Firestore index manifest must declare ${requiredFields} for video-studio recovery.`,
  );
}

console.log(
  JSON.stringify(
    {
      protocolVersion: clientProtocolVersion,
      capabilities: requiredCapabilities,
      statusContractExposed: true,
      queueGuardBeforePaidJob: true,
      requeueGuardBeforePaidJob: true,
      createTriggerChallengeVerified: true,
      requeueTriggerChallengeVerified: true,
      providerEntryPointsGuarded: 4,
      probeDocumentsContainProviderRequest: false,
      probeCacheSeconds: { success: 60, failure: 10 },
      pendingProviderPollsAreDeferred: true,
      recoverySchedulerMinutes: 1,
      recoveryIndexesDeclared: true,
      functionsBuildExecuted: false,
    },
    null,
    2,
  ),
);
console.log("Video Studio worker contract verification passed.");
