import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMOTICON_PROCESSING_STALL_THRESHOLD_MS,
  EMOTICON_QUEUE_STALL_THRESHOLD_MS,
  getEmoticonJobHistoryStatusLabel,
  getEmoticonJobStallState,
  isEmoticonJobStalled,
} from '../src/lib/emoticonJobHealth.ts';
import { localizeEmoticonQualityIssue } from '../src/lib/emoticonQualityIssue.ts';
import {
  emoticonContinuationStateSchema,
  emoticonFrameRepairSchema,
  emoticonJobModeSchema,
  emoticonJobStatusSchema,
  emoticonOutputProfileSchema,
  emoticonRenderFailureRecoverySchema,
  hasEmoticonProjectItemLeaseConflict,
  meetsEmoticonMotionAcceptance,
  meetsEmoticonPoseAcceptance,
} from '../src/schemas/emoticonStudio.ts';
import {
  assessEmoticonRecoveryExecutionGate,
  allocateEmoticonRateSlot,
  DEFAULT_EMOTICON_DAILY_LIMITS,
  getEmoticonStudioDailyLimits,
} from '../functions/src/emoticonStudio/rateLimits.ts';
import { resolveEmoticonRepairCheckpointAction } from '../functions/src/emoticonStudio/repairContinuation.ts';
import { resolveReusableDynamicParentEligibility } from '../functions/src/emoticonStudio/dynamicParentPolicy.ts';
import {
  canonicalEmoticonRecoveryStartStage,
  parseEmoticonRecoveryPlan,
} from '../functions/lib/emoticonStudio/recoveryPolicy.js';
import {
  buildEmoticonIdentityFingerprint,
  buildEmoticonReferenceSetFingerprint,
  EMOTICON_IDENTITY_FINGERPRINT_VERSION,
} from '../functions/src/emoticonStudio/identityFingerprint.ts';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nowMs = 1_750_000_000_000;
const timestamp = (value) => ({ toMillis: () => value });

assert.equal(canonicalEmoticonRecoveryStartStage('generate'), 'analysis');
assert.equal(canonicalEmoticonRecoveryStartStage('plan'), 'analysis');
assert.equal(canonicalEmoticonRecoveryStartStage('rerender'), 'static-render');
assert.equal(canonicalEmoticonRecoveryStartStage('repair_frame'), 'repair-generation');

const recoveredStaticGeneratePlan = parseEmoticonRecoveryPlan({
  directorSummary: '정지형 생성 복구 계획',
  characterProfile: {
    summary: '같은 캐릭터',
    immutableTraits: ['same face'],
    palette: [],
    styleRules: ['same line art'],
    negativeRules: ['no background'],
  },
  action: {
    title: '인사',
    emotion: '기쁨',
    action: '손을 들고 인사',
    intensity: 'normal',
    motionType: 'bob',
    renderMode: 'stable',
    durationMs: 0,
    frameCount: 1,
    fps: 1,
    loopDescription: 'Single static output image.',
    imagePrompt: 'One isolated character greeting on a transparent canvas.',
    videoPrompt: 'No animation; preserve one isolated greeting pose only.',
    negativePrompt: 'background, duplicate character, cropped limbs',
  },
  bubble: {
    text: '안녕',
    style: 'rounded',
    position: 'top',
    entrance: 'none',
    font: 'clean',
    timeline: { mode: 'full', startFrame: 0, endFrame: null, cues: [] },
  },
  suggestedPresets: [],
});
assert.equal(recoveredStaticGeneratePlan.success, true);
assert.equal(recoveredStaticGeneratePlan.success && recoveredStaticGeneratePlan.data.action.frameCount, 1);

assert.equal(
  getEmoticonJobStallState(
    { status: 'queued', updatedAt: timestamp(nowMs - EMOTICON_QUEUE_STALL_THRESHOLD_MS + 1) },
    nowMs,
  ),
  null,
);
assert.equal(
  getEmoticonJobStallState(
    { status: 'queued', updatedAt: timestamp(nowMs - EMOTICON_QUEUE_STALL_THRESHOLD_MS) },
    nowMs,
  ),
  'queue_not_started',
);
assert.equal(
  getEmoticonJobStallState(
    {
      status: 'generating',
      updatedAt: timestamp(nowMs - EMOTICON_PROCESSING_STALL_THRESHOLD_MS + 1),
    },
    nowMs,
  ),
  null,
);
assert.equal(
  getEmoticonJobStallState(
    {
      status: 'generating',
      updatedAt: timestamp(nowMs - EMOTICON_PROCESSING_STALL_THRESHOLD_MS),
    },
    nowMs,
  ),
  'processing_stalled',
);
assert.equal(
  isEmoticonJobStalled({ status: 'completed', updatedAt: timestamp(0) }, nowMs),
  false,
);
assert.equal(
  getEmoticonJobStallState({
    status: 'queued',
    updatedAt: timestamp(nowMs - EMOTICON_QUEUE_STALL_THRESHOLD_MS),
    deferredUntilMs: nowMs + 60_000,
  }, nowMs),
  null,
);
assert.equal(
  getEmoticonJobHistoryStatusLabel({
    status: 'queued',
    statusMessage: '작업 순서를 준비하고 있어요',
    updatedAt: timestamp(nowMs - EMOTICON_QUEUE_STALL_THRESHOLD_MS),
  }, nowMs),
  '처리 시작 지연 · 작업을 열어 다시 시작 가능',
);
assert.equal(
  getEmoticonJobHistoryStatusLabel({ status: 'failed', statusMessage: '이전 상태' }, nowMs),
  '실패',
);
assert.equal(
  getEmoticonJobHistoryStatusLabel({ status: 'cancelled', statusMessage: '이전 상태' }, nowMs),
  '취소됨',
);
assert.match(
  localizeEmoticonQualityIssue('Background residue and floor shadow are visible.'),
  /투명 배경/,
);
assert.equal(
  localizeEmoticonQualityIssue('표정 변화가 부족해요.'),
  '표정 변화가 부족해요.',
);
assert.equal(emoticonJobModeSchema.parse('repair_frame'), 'repair_frame');
assert.equal(emoticonJobStatusSchema.parse('cancelled'), 'cancelled');
assert.equal(emoticonContinuationStateSchema.parse({
  stage: 'generation',
  pass: 1,
  startIndex: 3,
  nextFrameIndex: 4,
  totalGenerationCalls: 4,
  retryCount: 0,
  state: 'checkpointed',
}).nextFrameIndex, 4);
assert.equal(emoticonContinuationStateSchema.safeParse({
  stage: 'generation',
  pass: 1,
  startIndex: 5,
  nextFrameIndex: 4,
  totalGenerationCalls: 4,
}).success, false);
for (const stage of [
  'repair-generation',
  'repair-pose-review',
  'repair-sequence-review',
  'repair-render',
]) {
  assert.equal(emoticonContinuationStateSchema.safeParse({
    stage,
    retryCount: 0,
    state: 'checkpointed',
  }).success, true);
}
const extendedOutputProfile = emoticonOutputProfileSchema.parse({
  platform: 'custom',
  type: 'animated',
  width: 360,
  height: 360,
  profileVersion: 'test-v1',
  verification: 'reference',
  allowedFormats: ['webp', 'mp4'],
  minFrameCount: 8,
  maxFrameCount: 24,
  formatCapabilities: {
    webp: { alpha: 'supported' },
    mp4: { alpha: 'unsupported' },
  },
  submissionCandidate: false,
});
assert.deepEqual(extendedOutputProfile.allowedFormats, ['webp', 'mp4']);
assert.deepEqual(extendedOutputProfile.formatCapabilities?.mp4, { alpha: 'unsupported' });
const acceptedPoseQuality = {
  allReferencesConsistent: true,
  overall: 72,
  identity: 76,
  actionClarity: 72,
  styleConsistency: 80,
  backgroundClean: 88,
  singleCharacter: true,
  occlusionFree: 85,
  issues: [],
  correction: '',
};
assert.equal(meetsEmoticonPoseAcceptance(acceptedPoseQuality), true);
assert.equal(meetsEmoticonPoseAcceptance({
  ...acceptedPoseQuality,
  allReferencesConsistent: false,
}), false);
assert.equal(meetsEmoticonPoseAcceptance({ ...acceptedPoseQuality, identity: 75 }), false);
assert.equal(
  meetsEmoticonPoseAcceptance({ ...acceptedPoseQuality, actionClarity: 71 }),
  false,
  'Client-side pose reuse must reject a technically clean result that misses the requested subject.',
);
assert.equal(meetsEmoticonPoseAcceptance({ ...acceptedPoseQuality, singleCharacter: false }), false);
const acceptedMotionReview = {
  allReferencesConsistent: true,
  overall: 80,
  identity: 82,
  actionClarity: 78,
  styleConsistency: 80,
  limbPoseChange: 75,
  facialExpressionChange: 72,
  frameConsistency: 80,
  loopContinuity: 72,
  backgroundClean: 92,
  singleCharacter: true,
  occlusionFree: 90,
  cameraOnly: false,
  problemFrameIndices: [],
  issues: [],
  correction: '',
};
assert.equal(meetsEmoticonMotionAcceptance(acceptedMotionReview), true);
assert.equal(meetsEmoticonMotionAcceptance({
  ...acceptedMotionReview,
  allReferencesConsistent: false,
}), true);
assert.equal(meetsEmoticonMotionAcceptance({
  ...acceptedMotionReview,
  allReferencesConsistent: false,
  identity: 79,
}), false);
const reusableDynamicEvidence = {
  completed: true,
  dynamic: true,
  framesValid: true,
  framePlanValid: true,
  motionReviewPresent: true,
  motionReviewAccepted: true,
  specReportPassed: true,
  outputInspectionsPresent: true,
  outputInspectionsPassed: true,
};
assert.deepEqual(resolveReusableDynamicParentEligibility(reusableDynamicEvidence), { success: true });
assert.deepEqual(resolveReusableDynamicParentEligibility({
  ...reusableDynamicEvidence, motionReviewPresent: false,
}), { success: false, reason: 'motion-review-missing' });
assert.deepEqual(resolveReusableDynamicParentEligibility({
  ...reusableDynamicEvidence, motionReviewAccepted: false,
}), { success: false, reason: 'motion-review-rejected' });
assert.deepEqual(resolveReusableDynamicParentEligibility({
  ...reusableDynamicEvidence, outputInspectionsPresent: false,
}), { success: false, reason: 'output-inspection-missing' });
assert.deepEqual(resolveReusableDynamicParentEligibility({
  ...reusableDynamicEvidence, outputInspectionsPassed: false,
}), { success: false, reason: 'output-inspection-rejected' });
const primaryFingerprint = 'a'.repeat(64);
const frontAndSideReferences = buildEmoticonReferenceSetFingerprint([
  'b'.repeat(64),
  'c'.repeat(64),
]);
assert.equal(
  frontAndSideReferences,
  buildEmoticonReferenceSetFingerprint(['c'.repeat(64), 'b'.repeat(64)]),
  'the same supplemental reference set must be order-stable',
);
const originalIdentity = buildEmoticonIdentityFingerprint({
  normalizedSourceFingerprint: primaryFingerprint,
  referenceSetFingerprint: frontAndSideReferences,
});
const changedOutfitIdentity = buildEmoticonIdentityFingerprint({
  normalizedSourceFingerprint: primaryFingerprint,
  referenceSetFingerprint: buildEmoticonReferenceSetFingerprint([
    'b'.repeat(64),
    'd'.repeat(64),
  ]),
});
assert.notEqual(
  originalIdentity,
  changedOutfitIdentity,
  'same primary with a changed outfit/side reference must miss the character-analysis cache',
);
assert.equal(EMOTICON_IDENTITY_FINGERPRINT_VERSION, 'normalized-reference-set-v2');
assert.equal(emoticonFrameRepairSchema.safeParse({
  parentJobId: 'parent-job',
  frameIndex: 2,
  maxGenerationCalls: 1,
  generationCalls: 1,
  maxPoseReviewCalls: 1,
  poseReviewCalls: 1,
  maxSequenceReviewCalls: 1,
  sequenceReviewCalls: 1,
  validation: 'local-variation+pose-semantic+sequence-motion+output-inspection',
  replacementFrame: {
    url: 'https://example.com/replacement.png',
    storagePath: 'users/user/emoticon-studio/jobs/repair/replacement-candidate.png',
    fileName: 'replacement-candidate.png',
    contentType: 'image/png',
    sizeBytes: 1024,
  },
  poseReview: acceptedPoseQuality,
  motionReview: acceptedMotionReview,
}).success, true);
assert.equal(emoticonRenderFailureRecoverySchema.safeParse({
  stage: 'render',
  category: 'infrastructure',
  poseAccepted: true,
}).success, true);
assert.equal(emoticonRenderFailureRecoverySchema.safeParse({
  stage: 'render',
  category: 'quality',
  poseAccepted: true,
}).success, false);
assert.equal(resolveEmoticonRepairCheckpointAction({
  stage: 'repair-pose-review',
  generationCalls: 1,
  hasReplacement: true,
  poseReviewCalls: 0,
  hasAcceptedPoseReview: false,
  sequenceReviewCalls: 0,
  hasAcceptedSequenceReview: false,
}), 'review-replacement-pose');
assert.equal(resolveEmoticonRepairCheckpointAction({
  stage: 'repair-sequence-review',
  generationCalls: 1,
  hasReplacement: true,
  poseReviewCalls: 1,
  hasAcceptedPoseReview: true,
  sequenceReviewCalls: 0,
  hasAcceptedSequenceReview: false,
}), 'review-full-sequence');
assert.equal(resolveEmoticonRepairCheckpointAction({
  stage: 'repair-render',
  generationCalls: 1,
  hasReplacement: true,
  poseReviewCalls: 1,
  hasAcceptedPoseReview: true,
  sequenceReviewCalls: 1,
  hasAcceptedSequenceReview: true,
}), 'render-repaired-sequence');
assert.throws(() => resolveEmoticonRepairCheckpointAction({
  stage: 'repair-generation',
  generationCalls: 1,
  hasReplacement: false,
  poseReviewCalls: 0,
  hasAcceptedPoseReview: false,
  sequenceReviewCalls: 0,
  hasAcceptedSequenceReview: false,
}), /cannot be repeated/);
assert.deepEqual(getEmoticonStudioDailyLimits({}), DEFAULT_EMOTICON_DAILY_LIMITS);
assert.equal(DEFAULT_EMOTICON_DAILY_LIMITS.generate, 32);
const validRecoveryReservation = {
  rateLimitExecuteAtMs: nowMs - 1,
  openRouterAuthorizedCostUsd: 2,
  openRouterCostReservationDayBucket: 20_254,
  costControlVersion: 3,
};
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'import_frames',
  job: {},
  nowMs,
}), { outcome: 'not-required' });
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  job: {},
  nowMs,
}), { outcome: 'blocked', reason: 'missing-rate-reservation' });
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  job: { rateLimitExecuteAtMs: nowMs - 1 },
  nowMs,
}), { outcome: 'blocked', reason: 'missing-cost-authorization' });
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  job: { ...validRecoveryReservation, openRouterAuthorizedCostUsd: 0 },
  nowMs,
}), { outcome: 'blocked', reason: 'missing-cost-authorization' });
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  job: { ...validRecoveryReservation, resourceMode: 'efficient', openRouterAuthorizedCostUsd: 0 },
  nowMs,
}), { outcome: 'ready' }, 'Legacy zero-provider efficient recovery must not invent a paid authorization.');
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  job: {
    ...validRecoveryReservation,
    resourceMode: 'efficient',
    aiGenerationProfile: 'gpt-light-v1',
    openRouterAuthorizedCostUsd: 0,
  },
  nowMs,
}), { outcome: 'blocked', reason: 'missing-cost-authorization' },
'GPT Light recovery must retain its paid OpenRouter authorization requirement.');
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  job: validRecoveryReservation,
  nowMs,
}), { outcome: 'ready' });
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  job: { ...validRecoveryReservation, rateLimitExecuteAtMs: nowMs + 60_000 },
  nowMs,
}), { outcome: 'deferred', executeAtMs: nowMs + 60_000 });
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  job: { ...validRecoveryReservation, costReservationSettledAt: timestamp(nowMs - 1) },
  nowMs,
}), { outcome: 'blocked', reason: 'settled-cost-reservation' });
assert.deepEqual(assessEmoticonRecoveryExecutionGate({
  mode: 'rerender',
  job: { ...validRecoveryReservation, openRouterAuthorizedCostUsd: 0 },
  nowMs,
}), { outcome: 'ready' });
let reservationState;
const reservationTimes = [];
for (let index = 0; index < 32; index += 1) {
  const reservation = allocateEmoticonRateSlot({
    nowMs,
    minuteLimit: 8,
    dailyLimit: DEFAULT_EMOTICON_DAILY_LIMITS.generate,
    state: reservationState,
  });
  reservationState = reservation.state;
  reservationTimes.push(reservation.executeAtMs);
}
assert.equal(reservationTimes.filter((value) => value === nowMs).length, 8);
assert.equal(new Set(reservationTimes).size, 4);
assert.equal(reservationState.dayCount, 32);
const nextDayReservation = allocateEmoticonRateSlot({
  nowMs,
  minuteLimit: 8,
  dailyLimit: DEFAULT_EMOTICON_DAILY_LIMITS.generate,
  state: reservationState,
});
assert.ok(nextDayReservation.executeAtMs >= (Math.floor(nowMs / 86_400_000) + 1) * 86_400_000);
assert.deepEqual(getEmoticonStudioDailyLimits({
  EMOTICON_STUDIO_GENERATE_DAILY_LIMIT: '31',
  EMOTICON_STUDIO_PLAN_DAILY_LIMIT: '12',
  EMOTICON_STUDIO_PROFILE_DAILY_LIMIT: '9',
  EMOTICON_STUDIO_SHEET_PLAN_DAILY_LIMIT: '14',
  EMOTICON_STUDIO_REPAIR_DAILY_LIMIT: '7',
  EMOTICON_STUDIO_RERENDER_DAILY_LIMIT: '512',
}), {
  generate: 31,
  plan: 12,
  profile: 9,
  sheet_plan: 14,
  repair_frame: 7,
  rerender: 512,
});
assert.deepEqual(getEmoticonStudioDailyLimits({
  EMOTICON_STUDIO_GENERATE_DAILY_LIMIT: '0',
  EMOTICON_STUDIO_PLAN_DAILY_LIMIT: '-2',
  EMOTICON_STUDIO_PROFILE_DAILY_LIMIT: '0',
  EMOTICON_STUDIO_SHEET_PLAN_DAILY_LIMIT: '1.5',
  EMOTICON_STUDIO_REPAIR_DAILY_LIMIT: '1.5',
  EMOTICON_STUDIO_RERENDER_DAILY_LIMIT: 'not-a-number',
}), DEFAULT_EMOTICON_DAILY_LIMITS);

// Two tabs that submit the same project item must share one authoritative
// lease. The owner can idempotently retry its exact job id, while a second job
// is rejected until the first lease leaves queued/generating.
assert.equal(hasEmoticonProjectItemLeaseConflict({
  currentStatus: null,
  currentJobId: null,
  nextJobId: 'tab-a-job',
}), false);
assert.equal(hasEmoticonProjectItemLeaseConflict({
  currentStatus: 'queued',
  currentJobId: 'tab-a-job',
  nextJobId: 'tab-b-job',
}), true);
assert.equal(hasEmoticonProjectItemLeaseConflict({
  currentStatus: 'generating',
  currentJobId: 'tab-a-job',
  nextJobId: 'tab-a-job',
}), false);
assert.equal(hasEmoticonProjectItemLeaseConflict({
  currentStatus: 'completed',
  currentJobId: 'tab-a-job',
  nextJobId: 'tab-b-job',
}), false);

const serviceSource = fs.readFileSync(
  path.join(rootDirectory, 'src/services/emoticonStudioService.ts'),
  'utf8',
);
const historyPanelSource = fs.readFileSync(
  path.join(rootDirectory, 'src/app/admin/emoticon-studio/EmoticonJobHistoryPanel.tsx'),
  'utf8',
);
const resultCardSource = fs.readFileSync(
  path.join(rootDirectory, 'src/app/admin/emoticon-studio/studio/CreationResultCard.tsx'),
  'utf8',
);
const v2StudioHookSource = fs.readFileSync(
  path.join(rootDirectory, 'src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts'),
  'utf8',
);
const functionsIndexSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/index.ts'),
  'utf8',
);
const jobTriggerSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/triggers/onEmoticonJobCreated.ts'),
  'utf8',
);
const deferredReleaseSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/triggers/releaseDeferredEmoticonJobs.ts'),
  'utf8',
);
const recoveryHelperSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/emoticonStudio/jobRecovery.ts'),
  'utf8',
);
const stalledSweepSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/triggers/recoverStalledEmoticonJobs.ts'),
  'utf8',
);
const clientSchemaSource = fs.readFileSync(
  path.join(rootDirectory, 'src/schemas/emoticonStudio.ts'),
  'utf8',
);
const functionSchemaSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/emoticonStudio/schema.ts'),
  'utf8',
);
const directorSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/emoticonStudio/director.ts'),
  'utf8',
);
const imageGenerationSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/emoticonStudio/imageGeneration.ts'),
  'utf8',
);
const rendererSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/emoticonStudio/renderer.ts'),
  'utf8',
);
const verifiedDynamicParentSource = fs.readFileSync(
  path.join(rootDirectory, 'functions/src/emoticonStudio/verifiedDynamicParent.ts'),
  'utf8',
);
const firestoreIndexes = JSON.parse(fs.readFileSync(
  path.join(rootDirectory, 'firestore.indexes.json'),
  'utf8',
));
const firestoreRules = fs.readFileSync(path.join(rootDirectory, 'firestore.rules'), 'utf8');

assert.match(serviceSource, /getEmoticonJobStallState/);
assert.match(serviceSource, /export function canReuseEmoticonKeyPose/);
assert.match(serviceSource, /meetsEmoticonPoseAcceptance\(job\.quality\)/);
assert.match(serviceSource, /job\.renderFailureRecovery\.category === 'infrastructure'/);
assert.match(serviceSource, /async function createJobWithProjectItemLease/);
assert.match(serviceSource, /runTransaction\(db, async \(transaction\)/);
const itemLeaseFunction = serviceSource.slice(
  serviceSource.indexOf('async function createJobWithProjectItemLease'),
  serviceSource.indexOf('export function canReuseEmoticonAnimationFrames'),
);
assert.match(
  itemLeaseFunction,
  /transaction\.set\(jobRef, \{[\s\S]*\.\.\.params\.jobData,[\s\S]*projectRevision,[\s\S]*projectItemRevision/,
);
assert.doesNotMatch(itemLeaseFunction, /lastItemJobId|lastItemStatus/);
assert.match(serviceSource, /hasEmoticonProjectItemLeaseConflict/);
assert.match(serviceSource, /generationStatus: 'queued'/);
assert.match(serviceSource, /itemLeaseClaimed/);
assert.ok((serviceSource.match(/createJobWithProjectItemLease\(\{/g) || []).length >= 3);
const retryFunction = serviceSource.slice(
  serviceSource.indexOf('export async function retryEmoticonJob'),
  serviceSource.indexOf('export async function rerenderEmoticonJob'),
);
assert.match(retryFunction, /submitEmoticonJob\(\{/);
assert.match(retryFunction, /recoverStalledEmoticonJob/);
assert.match(retryFunction, /isEmoticonJobStalled\(params\.job\) \|\| canResumeCheckpointedJob/);
assert.match(retryFunction, /\['openrouter-credits', 'checkpoint-error'\]\.includes/);
assert.ok(
  retryFunction.indexOf('recoverStalledEmoticonJob')
    < retryFunction.indexOf('rerenderEmoticonJob({'),
  'A stalled job must resume in place before any replacement/rerender is created.',
);
assert.match(historyPanelSource, /getEmoticonJobHistoryStatusLabel\(job, Date\.now\(\)\)/);
assert.match(v2StudioHookSource, /getEmoticonJobFromServer\(\{ userId: currentUser\.uid, jobId \}\)/);
assert.match(v2StudioHookSource, /isEmoticonJobStalled\(job\)[\s\S]{0,260}?recoveryAttemptsRef\.current\.add\(job\.id\)[\s\S]{0,180}?recoverStalledEmoticonJob\(\{ jobId: job\.id \}\)/);
assert.match(resultCardSource, /job\.status === 'completed'/);
assert.match(resultCardSource, /failureStageLabel/);
assert.match(functionsIndexSource, /onEmoticonJobCreated/);
assert.match(functionsIndexSource, /onEmoticonJobCancellationRequested/);
assert.match(functionsIndexSource, /recoverStalledEmoticonJob/);
assert.match(jobTriggerSource, /users\/\{userId\}\/emoticonJobs\/\{jobId\}/);
assert.match(jobTriggerSource, /onDocumentUpdated/);
assert.doesNotMatch(jobTriggerSource, /import sharp from 'sharp'/);
assert.match(jobTriggerSource, /const sharp = require\('sharp'\)/);
assert.match(jobTriggerSource, /recoverableFailure: 'checkpoint-error'/);
assert.match(jobTriggerSource, /'frameContinuation\.state': 'checkpointed'/);
const activeJobUpdateFunction = jobTriggerSource.slice(
  jobTriggerSource.indexOf('async function updateActiveJob'),
  jobTriggerSource.indexOf('type UploadedAsset'),
);
assert.match(activeJobUpdateFunction, /job\.generationRunToken !== fence\.generationRunToken/);
assert.match(activeJobUpdateFunction, /savedContinuation\?\.token !== fence\.continuationToken/);
assert.match(activeJobUpdateFunction, /job\.status === 'completed' \|\| job\.status === 'failed'/);
assert.match(activeJobUpdateFunction, /throw new EmoticonStaleWorkerError\(\)/);
assert.ok(
  (jobTriggerSource.match(/error instanceof EmoticonStaleWorkerError/g) || []).length >= 2,
  'Both initial and continuation workers must stop stale invocations without settling project state.',
);
assert.match(activeJobUpdateFunction, /generationRunLeaseExpiresAtMs: Date\.now\(\) \+ INITIAL_RUN_LEASE_MS/);
assert.match(activeJobUpdateFunction, /'frameContinuation\.leaseExpiresAtMs'/);
assert.match(activeJobUpdateFunction, /emoticonStudioContinuations/);
assert.match(activeJobUpdateFunction, /leaseExpiresAtMs: Date\.now\(\) \+ CONTINUATION_LEASE_MS/);
const initialRenderFailureHandling = jobTriggerSource.slice(
  jobTriggerSource.indexOf("logger.error('[EmoticonStudio] Job failed.'"),
  jobTriggerSource.indexOf('if (linkedProjectRequest)', jobTriggerSource.indexOf("logger.error('[EmoticonStudio] Job failed.'")),
);
assert.match(initialRenderFailureHandling, /statusMessage: providerTimeout[\s\S]*: renderFailureRecovery/);
assert.match(initialRenderFailureHandling, /failureCode: 'image-provider-timeout'/);
assert.match(initialRenderFailureHandling, /retryStrategy: 'new-job'/);
assert.match(initialRenderFailureHandling, /resumeAvailable: Boolean\(renderFailureRecovery\)/);
assert.match(initialRenderFailureHandling, /recoverableFailure: 'checkpoint-error'/);
assert.match(initialRenderFailureHandling, /failureCode: 'render-infrastructure'/);
assert.match(initialRenderFailureHandling, /failureStage: 'render'/);
assert.match(initialRenderFailureHandling, /retryStrategy: 'resume-in-place'/);
assert.match(initialRenderFailureHandling, /'frameContinuation\.state': renderFailureRecovery \? 'checkpointed' : 'failed'/);
assert.match(initialRenderFailureHandling, /파일 조립 중 일시적인 문제가 생겼습니다/);
assert.match(resultCardSource, /const hasSavedRecovery = Boolean\(/);
assert.match(resultCardSource, /const retryLabel = hasSavedRecovery/);
assert.match(resultCardSource, /다른 공급 경로로 다시 생성/);
assert.match(resultCardSource, /같은 설정으로 다시 생성/);
assert.match(jobTriggerSource, /isDefiniteImageRouteCompatibilityError/);
assert.match(jobTriggerSource, /failureCode: 'image-provider-compatibility'/);
assert.match(jobTriggerSource, /failureStage: 'image-generation'/);
assert.match(jobTriggerSource, /retryStrategy: 'resume-in-place'/);
assert.match(clientSchemaSource, /failureCode: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(80\)\.optional\(\)/);
assert.match(clientSchemaSource, /failureStage: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(80\)\.optional\(\)/);
assert.match(clientSchemaSource, /retryStrategy: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(80\)\.optional\(\)/);
assert.match(jobTriggerSource, /Deterministic quality, schema, identity, or motion rejection is[\s\S]*resumeAvailable: false/);
assert.match(jobTriggerSource, /recoverable: false/);
const initialTriggerConfig = jobTriggerSource.slice(
  jobTriggerSource.indexOf('const triggerConfig ='),
  jobTriggerSource.indexOf('const continuationTriggerConfig ='),
);
assert.match(initialTriggerConfig, /retry: true/);
const cancellationConfig = jobTriggerSource.slice(
  jobTriggerSource.indexOf('const cancellationTriggerConfig ='),
  jobTriggerSource.indexOf('const CONTINUATION_WORK_BUDGET_MS'),
);
assert.match(cancellationConfig, /retry: false/,
  'Cancellation updates must not opt into a seven-day billed retry policy.');
const initialClaimFunction = jobTriggerSource.slice(
  jobTriggerSource.indexOf('async function claimInitialJobRun'),
  jobTriggerSource.indexOf('function parseContinuationState'),
);
assert.match(initialClaimFunction, /generationRunLeaseExpiresAtMs/);
assert.match(initialClaimFunction, /existingLeaseExpiresAtMs > nowMs/);
assert.match(initialClaimFunction, /generationRunAttemptCount: FieldValue\.increment\(1\)/);
assert.match(initialClaimFunction, /Promise<string \| null>/);
assert.match(initialClaimFunction, /return runToken/);
assert.match(jobTriggerSource, /activeRunToken = await claimInitialJobRun\(userId, jobId\)/);
assert.match(jobTriggerSource, /continuationToken: token/);
assert.match(v2StudioHookSource, /getEmoticonJobFromServer/);
assert.match(v2StudioHookSource, /isEmoticonJobStalled\(job\)/);
assert.match(v2StudioHookSource, /recoverStalledEmoticonJob\(\{ jobId: job\.id \}\)/);
assert.match(v2StudioHookSource, /setInterval\(\(\) => void reconcileTrackedJobs\(\), 30_000\)/);
const continuationParser = jobTriggerSource.slice(
  jobTriggerSource.indexOf('function parseContinuationState'),
  jobTriggerSource.indexOf('function continuationJobStatus'),
);
assert.match(continuationParser, /repairFrameIndices: \[\.\.\.state\.repairFrameIndices\]/);
assert.match(continuationParser, /nextRepairCursor: state\.nextRepairCursor/);
const continuedRecoverableFailure = jobTriggerSource.slice(
  jobTriggerSource.indexOf("logger.error('[EmoticonStudio] Continued frame pipeline failed.'"),
  jobTriggerSource.indexOf('await continuationRef.update({',
    jobTriggerSource.indexOf("logger.error('[EmoticonStudio] Continued frame pipeline failed.'")),
);
assert.doesNotMatch(
  continuedRecoverableFailure,
  /generationStatus: 'failed'/,
  'A recoverable continuation must retain the linked project-item lease for in-place resume.',
);
const stalledRecoveryFunction = jobTriggerSource.slice(
  jobTriggerSource.indexOf('export const recoverStalledEmoticonJob'),
  jobTriggerSource.indexOf('export const onEmoticonJobCreated'),
);
assert.match(stalledRecoveryFunction, /requireEmoticonRecoveryAdmin/);
assert.match(stalledRecoveryFunction, /restoreRecoverableCostReservation\(userId, jobId\)/);
assert.match(stalledRecoveryFunction, /recoverStalledEmoticonJobInPlace\(\{ userId, jobId \}\)/);
assert.match(stalledRecoveryFunction, /recovery\.outcome === 'skipped'/);
assert.doesNotMatch(stalledRecoveryFunction, /emoticonJobs\)\.doc\(|transaction\.create\(jobRef/);
assert.match(recoveryHelperSource, /export async function recoverStalledEmoticonJobInPlace/);
assert.match(recoveryHelperSource, /job\.status === 'cancelled' \|\| job\.cancelRequestedAt/);
assert.match(recoveryHelperSource, /const recoverableCheckpointFailure = job\.status === 'failed'/);
assert.match(recoveryHelperSource, /\['openrouter-credits', 'checkpoint-error'\]\.includes/);
assert.match(recoveryHelperSource, /const preservedRenderFailure = job\.status === 'failed'/);
assert.match(recoveryHelperSource, /job\.renderFailureRecovery\.category === 'infrastructure'/);
assert.match(serviceSource, /const preservedRenderFailure = params\.job\.status === 'failed'/);
assert.match(serviceSource, /params\.job\.renderFailureRecovery\.category === 'infrastructure'/);
assert.match(recoveryHelperSource, /typeof job\.deferredUntilMs === 'number'/);
assert.match(recoveryHelperSource, /item\.jobId !== params\.jobId/);
assert.match(recoveryHelperSource, /\['queued', 'generating'\]\.includes\(String\(item\.generationStatus\)\)/);
assert.match(recoveryHelperSource, /deadLetter\(\s*'stale-project-item-lease'/);
assert.match(recoveryHelperSource, /projectSnapshot\.data\(\)\?\.deletionLocked === true/);
assert.match(recoveryHelperSource, /reason: 'project-deletion-locked'/);
assert.match(recoveryHelperSource, /EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS/);
assert.match(recoveryHelperSource, /EMOTICON_STALLED_RUN_RECOVERY_MS/);
assert.match(recoveryHelperSource, /runLeaseExpiresAtMs > nowMs/);
assert.match(recoveryHelperSource, /activeContinuationTokens\(job\)/);
assert.match(recoveryHelperSource, /'already-recovering'/);
assert.match(recoveryHelperSource, /recoveryLastSkipReason: 'existing-continuation'/);
assert.match(recoveryHelperSource, /scheduleRecoveryCheck\(\s*'fresh'/);
assert.match(recoveryHelperSource, /nextRecoveryAtMs/);
assert.match(recoveryHelperSource, /recoveryDeadLetterAt/);
assert.match(recoveryHelperSource, /const deadLetter = \(/);
assert.match(recoveryHelperSource, /EMOTICON_MAX_RECOVERY_ATTEMPTS = 3/);
assert.match(recoveryHelperSource, /recovery-attempt-limit/);
assert.match(recoveryHelperSource, /recoveryAttemptCount >= EMOTICON_MAX_RECOVERY_ATTEMPTS/);
assert.match(recoveryHelperSource, /\['queued', 'running'\]\.includes\(String\(continuation\.status\)\)/);
assert.match(recoveryHelperSource, /status: 'superseded'/);
assert.match(recoveryHelperSource, /transaction\.create\(continuationRef/);
assert.match(recoveryHelperSource, /frameContinuation: persistedState/);
assert.match(recoveryHelperSource, /parseEmoticonRecoveryPlan\(job\.plan\)/);
assert.doesNotMatch(recoveryHelperSource, /emoticonPlanSchema/);
assert.match(recoveryHelperSource, /canonicalEmoticonRecoveryStartStage\(parsedRequest\.data\.mode\)/);
assert.match(recoveryHelperSource, /assessEmoticonRecoveryExecutionGate\(\{/);
assert.match(recoveryHelperSource, /missing-execution-authorization/);
assert.match(recoveryHelperSource, /resolveEmoticonBatchExecutionSlot\(\{/);
assert.match(recoveryHelperSource, /batch-concurrency/);
assert.ok(
  recoveryHelperSource.indexOf('assessEmoticonRecoveryExecutionGate({')
    < recoveryHelperSource.indexOf('transaction.create(continuationRef'),
  'Recovery must verify its persisted cost/rate authorization before creating a continuation.',
);
assert.ok(
  recoveryHelperSource.indexOf('resolveEmoticonBatchExecutionSlot({')
    < recoveryHelperSource.indexOf('transaction.create(continuationRef'),
  'Batched recovery must hold an execution slot before creating a continuation.',
);
assert.doesNotMatch(recoveryHelperSource, /collection\('emoticonJobs'\)\.doc|transaction\.create\(jobRef/);
assert.match(stalledSweepSource, /onSchedule/);
assert.match(stalledSweepSource, /collectionGroup\('emoticonJobs'\)/);
assert.match(stalledSweepSource, /where\('status', '==', status\)/);
assert.match(stalledSweepSource, /orderBy\('updatedAt', 'asc'\)/);
assert.match(stalledSweepSource, /recoverStalledEmoticonJobInPlace\(\{ \.\.\.candidate, nowMs \}\)/);
assert.match(stalledSweepSource, /status === 'queued'[\s\S]*EMOTICON_UNCLAIMED_QUEUE_RECOVERY_MS/);
assert.match(stalledSweepSource, /EMOTICON_STALLED_RUN_RECOVERY_MS/);
assert.match(stalledSweepSource, /RECOVERY_SCAN_PAGES_PER_STATUS/);
assert.match(stalledSweepSource, /startAfter\(cursor\)/);
assert.match(stalledSweepSource, /nextRecoveryAtMs/);
assert.match(stalledSweepSource, /const statuses = \[/);
assert.match(functionsIndexSource, /recoverStalledEmoticonJobs/);
assert.match(jobTriggerSource, /job\.status === 'cancelled' \|\| job\.cancelRequestedAt/);
assert.match(jobTriggerSource, /mode === 'repair_frame'/);
assert.match(jobTriggerSource, /emoticonRenderFailureRecoverySchema\.safeParse/);
assert.match(jobTriggerSource, /buildRenderFailureRecoveryMarker/);
assert.match(jobTriggerSource, /isRenderInfrastructureFailure/);
assert.match(jobTriggerSource, /async function reserveRateLimitSlot/);
assert.match(jobTriggerSource, /ReservationMinuteBucket/);
assert.match(jobTriggerSource, /ReservationDayCount/);
assert.match(jobTriggerSource, /EMOTICON_DAILY_LIMITS\[params\.mode\]/);
assert.match(jobTriggerSource, /async function deferJobUntilReservedSlot/);
assert.match(jobTriggerSource, /emoticonStudioDeferredJobs/);
assert.match(jobTriggerSource, /generationRunLeaseExpiresAtMs: params\.executeAtMs \+ INITIAL_RUN_LEASE_MS/);
assert.match(deferredReleaseSource, /onSchedule/);
assert.match(deferredReleaseSource, /where\('executeAtMs', '<=', nowMs\)/);
assert.match(deferredReleaseSource, /transaction\.create\(continuationRef/);
assert.match(deferredReleaseSource, /job\.cancelRequestedAt/);
assert.match(deferredReleaseSource, /existingContinuation/);
assert.match(deferredReleaseSource, /executeAtMs: RETIRED_EXECUTE_AT_MS/);
assert.match(deferredReleaseSource, /stage === 'repair-generation'/);
assert.match(functionsIndexSource, /releaseDeferredEmoticonJobs/);
assert.match(
  firestoreRules,
  /match \/emoticonStudioContinuations\/\{continuationId\}[\s\S]*allow write: if false;/,
);
assert.match(jobTriggerSource, /async function assertLinkedProjectItemClaim/);
const initialClaimIndex = jobTriggerSource.indexOf(
  'await assertLinkedProjectItemClaim({ userId, jobId, request: parsed.data })',
);
const manualImportBranchIndex = jobTriggerSource.indexOf(
  "if (parsed.data.mode === 'import_frames')",
  initialClaimIndex,
);
const initialRateLimitIndex = jobTriggerSource.indexOf(
  'const reservation = await reserveRateLimitSlot({',
  initialClaimIndex,
);
const initialGeneratingSyncIndex = jobTriggerSource.indexOf(
  "generationStatus: 'generating'",
  initialRateLimitIndex,
);
assert.ok(initialClaimIndex >= 0);
assert.ok(initialClaimIndex < manualImportBranchIndex);
assert.ok(manualImportBranchIndex < initialRateLimitIndex);
assert.ok(initialClaimIndex < initialRateLimitIndex);
assert.ok(initialRateLimitIndex < initialGeneratingSyncIndex);
const manualImportBranchSource = jobTriggerSource.slice(
  manualImportBranchIndex,
  initialRateLimitIndex,
);
assert.match(manualImportBranchSource, /renderImportedFramesJob\(/);
assert.match(manualImportBranchSource, /return;/);
assert.ok((jobTriggerSource.match(/await assertLinkedProjectItemClaim\(/g) || []).length >= 2);
assert.match(jobTriggerSource, /if \(isClaim && currentJobId && currentJobId !== params\.jobId\)/);
assert.match(jobTriggerSource, /async function syncCompletedProjectItemNonFatal/);
assert.match(jobTriggerSource, /Output completed, but linked project bookkeeping was skipped/);
assert.match(jobTriggerSource, /const authoritativeMotion = completedOutputProfile\.success/);
assert.match(jobTriggerSource, /type === 'static'[\s\S]*fps: 1, frameCount: 1, durationMs: 0/);
assert.match(jobTriggerSource, /const inspectedMotion =/);
assert.match(jobTriggerSource, /fps: completedPlan\.data\.action\.fps/);
assert.match(jobTriggerSource, /frameCount: completedPlan\.data\.action\.frameCount/);
assert.match(jobTriggerSource, /durationMs: completedPlan\.data\.action\.durationMs/);
assert.ok((jobTriggerSource.match(/synchronizedMotion \? \{ motion: synchronizedMotion \}/g) || []).length >= 2);
assert.equal((jobTriggerSource.match(/generationStatus: 'completed'/g) || []).length, 1);
assert.ok((jobTriggerSource.match(/syncCompletedProjectItemNonFatal\(\{/g) || []).length >= 5);
assert.match(jobTriggerSource, /function assertRenderedFilesPassedInspection/);
assert.ok((jobTriggerSource.match(/assertRenderedFilesPassedInspection\(/g) || []).length >= 6);
assert.match(jobTriggerSource, /async function prepareCanonicalReferenceSet/);
assert.match(jobTriggerSource, /fileName: `reference-\$\{index \+ 1\}\.png`/);
assert.match(jobTriggerSource, /EMOTICON_IDENTITY_FINGERPRINT_VERSION/);
assert.match(jobTriggerSource, /buildEmoticonReferenceSetFingerprint\(normalizedFingerprints\)/);
assert.ok((jobTriggerSource.match(/verifyReusableDynamicParent\(\{/g) || []).length >= 2);
assert.ok((jobTriggerSource.match(/additionalReferenceUrls: canonicalReferenceSet\.urls/g) || []).length >= 3);
assert.match(directorSource, /Set allReferencesConsistent to true when the generated pose preserves every visible, non-conflicting immutable identity feature/);
assert.match(directorSource, /Set it to false only for a changed immutable trait/);
assert.ok((directorSource.match(/\.\.\.referenceUrls\.map\(\(url\) => \(\{/g) || []).length >= 2);
assert.match(clientSchemaSource, /allReferencesConsistent: z\.boolean\(\)\.default\(false\)/);
const reusableAnimationFunction = serviceSource.slice(
  serviceSource.indexOf('export function canReuseEmoticonAnimationFrames'),
  serviceSource.indexOf('export function canReuseEmoticonKeyPose'),
);
assert.match(reusableAnimationFunction, /getEmoticonMotionAcceptanceRequirements\(job\.plan\)/);
assert.match(reusableAnimationFunction, /meetsEmoticonMotionAcceptance\(/);
assert.match(reusableAnimationFunction, /job\.specReport\?\.technicalPass !== true/);
assert.match(reusableAnimationFunction, /inspection\?\.format === format && inspection\.passed === true/);
assert.doesNotMatch(
  jobTriggerSource,
  /referenceImages[\s\S]{0,220}\.map\(\(reference\) => reference\.sourceImageUrl\)/,
);
assert.match(jobTriggerSource, /maxRequestAttempts: 1/);
const frameRepairFunction = jobTriggerSource.slice(
  jobTriggerSource.indexOf('async function repairExistingDynamicFrame'),
  jobTriggerSource.indexOf('async function loadCheckpointPose'),
);
assert.equal((frameRepairFunction.match(/generateEmoticonAnimationFrame\(\{/g) || []).length, 1);
assert.equal((frameRepairFunction.match(/reviewPose\(\{/g) || []).length, 1);
assert.equal((frameRepairFunction.match(/reviewImageFrameSequenceFailClosed\(\{/g) || []).length, 1);
assert.doesNotMatch(frameRepairFunction, /generateEmoticonPose\(\{/);
assert.match(frameRepairFunction, /meetsEmoticonDynamicKeyPoseAcceptance\(replacementPoseReview\)/);
assert.match(frameRepairFunction, /isVerifiedBodyMotion\(repairedMotionReview, plan\)/);
assert.match(frameRepairFunction, /poseReviewCalls: 1/);
assert.match(frameRepairFunction, /sequenceReviewCalls: 1/);
assert.match(frameRepairFunction, /validation: FRAME_REPAIR_VALIDATION/);
assert.match(frameRepairFunction, /poseReview: replacementPoseReview/);
assert.match(frameRepairFunction, /motionReview: repairedMotionReview/);
const replacementUploadIndex = frameRepairFunction.indexOf("fileName: 'replacement-candidate.png'");
const replacementCheckpointIndex = frameRepairFunction.indexOf('replacementFrame: replacementAsset');
const poseReviewIndex = frameRepairFunction.indexOf('replacementPoseReview = await reviewPose({');
assert.ok(replacementUploadIndex >= 0);
assert.ok(replacementUploadIndex < replacementCheckpointIndex);
assert.ok(replacementCheckpointIndex < poseReviewIndex);
assert.match(frameRepairFunction, /downloadStoredPose\(replacementAsset\.storagePath\)/);
assert.match(frameRepairFunction, /stage: 'repair-pose-review'/);
assert.match(frameRepairFunction, /stage: 'repair-sequence-review'/);
assert.match(frameRepairFunction, /stage: 'repair-render'/);
assert.ok((frameRepairFunction.match(/ensureContinuationBudget\(\{/g) || []).length >= 4);
assert.ok((frameRepairFunction.match(/assertJobActive\(params\.userId, params\.jobId\)/g) || []).length >= 4);
assert.match(frameRepairFunction, /bounded replacement image call was already consumed/);
assert.match(frameRepairFunction, /bounded replacement pose review call was already consumed/);
assert.match(frameRepairFunction, /bounded repair sequence review call was already consumed/);
assert.match(jobTriggerSource, /checkpoint: job/);
assert.match(jobTriggerSource, /Continued frame repair completed/);
assert.match(verifiedDynamicParentSource, /motionReviewPresent: motionReview\.success/);
assert.match(verifiedDynamicParentSource, /getEmoticonMotionAcceptanceRequirements\(plan\.data\)/);
assert.match(verifiedDynamicParentSource, /meetsEmoticonMotionAcceptance\(/);
assert.match(verifiedDynamicParentSource, /spec\.technicalPass === true && spec\.allOutputsPass === true/);
assert.match(verifiedDynamicParentSource, /inspection\.data\.format !== format/);
assert.match(verifiedDynamicParentSource, /frame\.storagePath\.startsWith\(params\.expectedFrameStoragePrefix\)/);
assert.doesNotMatch(jobTriggerSource, /generationStatus: 'cancelled'/);
assert.match(jobTriggerSource, /statuses\.some\(\(status\) => status === 'cancelled'\)/);
const cancellationFunction = serviceSource.slice(
  serviceSource.indexOf('export async function requestEmoticonJobCancellation'),
  serviceSource.indexOf('export async function regenerateEmoticonFrame'),
);
assert.match(cancellationFunction, /cancelRequestedAt: serverTimestamp\(\)/);
assert.doesNotMatch(cancellationFunction, /transaction\.update\(ref,\s*\{[^}]*status\s*:/s);
assert.match(serviceSource, /export async function regenerateEmoticonFrame/);
assert.match(clientSchemaSource, /'repair_frame'/);
assert.match(clientSchemaSource, /local-variation\+pose-semantic\+sequence-motion\+output-inspection/);
assert.match(clientSchemaSource, /'cancelled'/);
assert.match(clientSchemaSource, /templateItemCount: z\.number\(\)\.int\(\)\.min\(1\)\.max\(64\)/);
assert.match(functionSchemaSource, /emoticonContinuationDocumentSchema/);
assert.match(functionSchemaSource, /templateItemCount: z\.number\(\)\.int\(\)\.min\(1\)\.max\(64\)/);
assert.match(directorSource, /maxItems: 64/);
assert.match(directorSource, /Math\.min\(16_000/);
const analyzeFunction = directorSource.slice(
  directorSource.indexOf('export async function analyzeEmoticonDirection'),
  directorSource.indexOf('export async function analyzeEmoticonCharacter'),
);
assert.equal((analyzeFunction.match(/requestStructuredChat\(/g) || []).length, 1);
assert.match(imageGenerationSource, /params\.maxRequestAttempts === 1/);
assert.match(rendererSource, /mp4: \{ alpha: 'unsupported' \}/);
assert.match(rendererSource, /alphaCapability !== 'unsupported'/);
assert.match(rendererSource, /allowedFormats: \['webp', 'png_zip'\]/);
assert.match(rendererSource, /transparentBackground: allowlisted\.transparentBackground/);
assert.match(rendererSource, /checkedAt: allowlisted\.checkedAt/);
assert.deepEqual(
  firestoreIndexes.fieldOverrides.find((override) => (
    override.collectionGroup === 'emoticonStudioContinuations'
    && override.fieldPath === 'expiresAt'
  )),
  {
    collectionGroup: 'emoticonStudioContinuations',
    fieldPath: 'expiresAt',
    ttl: true,
    indexes: [],
  },
);
assert.deepEqual(
  firestoreIndexes.fieldOverrides.find((override) => (
    override.collectionGroup === 'emoticonStudioDeferredJobs'
    && override.fieldPath === 'expiresAt'
  )),
  {
    collectionGroup: 'emoticonStudioDeferredJobs',
    fieldPath: 'expiresAt',
    ttl: true,
    indexes: [],
  },
);
assert.deepEqual(
  firestoreIndexes.indexes.find((index) => (
    index.collectionGroup === 'emoticonJobs'
    && index.queryScope === 'COLLECTION_GROUP'
  )),
  {
    collectionGroup: 'emoticonJobs',
    queryScope: 'COLLECTION_GROUP',
    fields: [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'updatedAt', order: 'ASCENDING' },
    ],
  },
);

console.log('Emoticon queue recovery checks passed.');
