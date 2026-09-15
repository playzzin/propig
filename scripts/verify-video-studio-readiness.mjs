import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve('.env.local'), quiet: true });
dotenv.config({ path: path.resolve('.env'), quiet: true });

const require = createRequire(import.meta.url);
const {
  applicationDefault,
  deleteApp,
  initializeApp,
} = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const {
  preflightOpenRouterVideo,
} = require('../functions/lib/videoStudio/openrouter.js');

const apiKey = process.env.OPENROUTER_API_KEY;
assert.ok(apiKey, 'OPENROUTER_API_KEY is required for the no-charge model catalog check.');

const scenarios = [
  {
    name: 'proof-text',
    duration: 6,
    resolution: '720p',
    aspectRatio: '16:9',
    qualityMode: 'proof',
    audioMode: 'silent',
  },
  {
    name: 'final-dialogue',
    duration: 6,
    resolution: '1080p',
    aspectRatio: '16:9',
    qualityMode: 'final',
    audioMode: 'dialogue',
  },
  {
    name: 'long-dialogue-token-priced',
    duration: 15,
    resolution: '480p',
    aspectRatio: '16:9',
    qualityMode: 'final',
    hasReferenceImage: true,
    hasEndReferenceImage: true,
    audioMode: 'dialogue',
  },
  {
    name: 'continuity-frames',
    duration: 6,
    resolution: '720p',
    aspectRatio: '16:9',
    qualityMode: 'final',
    hasReferenceImage: true,
    hasEndReferenceImage: true,
    audioMode: 'ambient',
  },
  {
    name: 'visual-references',
    duration: 6,
    resolution: '720p',
    aspectRatio: '16:9',
    qualityMode: 'final',
    hasVisualReferenceImages: true,
    audioMode: 'silent',
  },
  {
    name: 'frame-precedence',
    duration: 6,
    resolution: '720p',
    aspectRatio: '16:9',
    qualityMode: 'final',
    hasReferenceImage: true,
    hasVisualReferenceImages: true,
    audioMode: 'silent',
  },
];

const preflights = [];
for (const scenario of scenarios) {
  const result = await preflightOpenRouterVideo({
    apiKey,
    duration: scenario.duration,
    resolution: scenario.resolution,
    aspectRatio: scenario.aspectRatio,
    qualityMode: scenario.qualityMode,
    hasReferenceImage: scenario.hasReferenceImage,
    hasEndReferenceImage: scenario.hasEndReferenceImage,
    hasVisualReferenceImages: scenario.hasVisualReferenceImages,
    audioMode: scenario.audioMode,
  });
  assert.equal(result.selection, 'automatic');
  if (result.credit.isSufficient === false) {
    assert.equal(
      result.canSubmit,
      false,
      `${scenario.name} must fail closed when the live OpenRouter balance is below the estimate.`,
    );
    assert.ok(
      result.warnings.some((warning) => /balance|credit|잔액|충전/i.test(warning)),
      `${scenario.name} must explain the credit blocker without submitting paid work.`,
    );
  } else {
    assert.equal(result.canSubmit, true);
  }
  assert.ok(result.catalogModelCount > 0);
  assert.ok(result.compatibleModelCount > 0);
  assert.ok(result.modelId);
  assert.ok(
    ["live", "cache"].includes(result.catalog.source),
    scenario.name + " must identify whether the OpenRouter catalog was refreshed or reused.",
  );
  assert.ok(
    Number.isFinite(new Date(result.catalog.fetchedAt).getTime()),
    scenario.name + " must report a model-catalog verification time.",
  );
  assert.ok(
    result.selectionReasons.length >= 2,
    scenario.name + " must explain the automatic model decision.",
  );
  assert.equal(
    typeof result.estimatedCostUsd,
    'number',
    `${scenario.name} must expose an estimated cost before a paid submission.`,
  );
  if (scenario.hasReferenceImage) assert.equal(result.capabilities.firstFrame, true);
  if (scenario.hasEndReferenceImage) assert.equal(result.capabilities.lastFrame, true);
  if (scenario.audioMode !== 'silent') assert.equal(result.capabilities.audio, true);
  if (scenario.audioMode === 'dialogue') assert.equal(result.capabilities.dialogueLipSync, true);
  if (scenario.name === 'visual-references') {
    assert.equal(result.capabilities.visualReferences, true);
  }
  if (scenario.name === 'frame-precedence') {
    assert.ok(result.warnings.some((warning) => warning.includes('frame')));
  }
  preflights.push({
    name: scenario.name,
    modelId: result.modelId,
    resolvedResolution: result.resolvedResolution,
    resolvedDuration: result.resolvedDuration,
    estimatedCostUsd: result.estimatedCostUsd,
    warnings: result.warnings,
    credit: {
      state: result.credit.state,
      remainingUsd: result.credit.remainingUsd,
      requiredUsd: result.credit.requiredUsd,
      isSufficient: result.credit.isSufficient,
    },
    catalog: result.catalog,
    visualInputPolicy: result.policy.visualInputState,
  });
}

const privacyAwarePreflight = await preflightOpenRouterVideo({
  apiKey,
  duration: 6,
  resolution: '720p',
  aspectRatio: '16:9',
  qualityMode: 'final',
  hasReferenceImage: true,
  knownInputImagePrivacyBlock: true,
  audioMode: 'silent',
});
assert.equal(
  privacyAwarePreflight.policy.visualInputState,
  'previously_rejected',
  'A known real-person input block must be surfaced before another paid retry.',
);
assert.equal(
  privacyAwarePreflight.policy.automaticRetryAllowed,
  false,
  'A known real-person input block must not permit automatic model retries.',
);

const projectId =
  process.env.FIREBASE_PROJECT_ID
  || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  || process.env.GCLOUD_PROJECT;
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET
  || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || '(default)';
assert.ok(projectId, 'Firebase project id is required for the Admin runtime check.');
assert.ok(storageBucket, 'Firebase Storage bucket is required for the Admin runtime check.');

const probeApp = initializeApp(
  {
    credential: applicationDefault(),
    projectId,
    storageBucket,
  },
  `video-studio-readiness-${Date.now()}`,
);

let firebaseResult;
try {
  const firestore = getFirestore(probeApp, databaseId);
  const bucket = getStorage(probeApp).bucket(storageBucket);
  await Promise.all([
    firestore.collection('video_studio_jobs').limit(1).get(),
    bucket.getMetadata(),
  ]);

  let signing = { ok: true, message: 'Storage URL signing is available.' };
  try {
    await bucket.file('__readiness__/signing-probe.txt').getSignedUrl({
      action: 'read',
      expires: Date.now() + 60_000,
    });
  } catch (error) {
    signing = {
      ok: false,
      message:
        error instanceof Error && /client[_ ]?email|cannot sign data/i.test(error.message)
          ? 'Signed URLs are unavailable with local application-default credentials. Storyboard media continues to use Firebase download-token URLs.'
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }
  firebaseResult = {
    projectId,
    databaseId,
    storageBucket,
    firestoreRead: true,
    storageRead: true,
    signing,
    artifactDelivery: {
      ok: true,
      mode: 'firebase_download_token',
      requiresClientEmail: false,
    },
  };
} finally {
  await deleteApp(probeApp);
}

const sourceContracts = {
  recovery: await readFile('functions/src/triggers/recoverVideoStudioJobs.ts', 'utf8'),
  worker: await readFile('functions/src/videoStudio/processor.ts', 'utf8'),
  trigger: await readFile('functions/src/triggers/onVideoStudioJobQueued.ts', 'utf8'),
  nextStorage: await readFile('src/app/api/admin/storage/route.ts', 'utf8'),
  functionsStorage: await readFile('functions/src/api/adminStorage.ts', 'utf8'),
};
assert.match(sourceContracts.recovery, /onSchedule\(/);
assert.match(sourceContracts.recovery, /stale_worker_lease/);
assert.match(sourceContracts.worker, /nextAttemptAt/);
assert.match(sourceContracts.worker, /workerRetryCount/);
assert.match(sourceContracts.worker, /leaseExpiresAt/);
assert.match(sourceContracts.trigger, /queueDispatchToken/);
assert.match(sourceContracts.nextStorage, /buildFirebaseTokenUrl/);
assert.match(sourceContracts.functionsStorage, /buildFirebaseTokenUrl/);
assert.equal(firebaseResult.artifactDelivery.ok, true);
assert.equal(firebaseResult.artifactDelivery.requiresClientEmail, false);

console.log(JSON.stringify({
  openRouter: {
    paidGenerationSubmitted: false,
    scenarios: preflights,
  },
  firebase: firebaseResult,
  durableQueueContracts: true,
}, null, 2));
console.log('Video Studio no-charge readiness verification passed');
