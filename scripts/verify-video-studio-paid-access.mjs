import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [
  jobsRoute,
  runRoute,
  processRoute,
  jobRoute,
  legacyVideoRoute,
  readinessRoute,
  statusRoute,
  adminStore,
  hostingVideoRoutes,
  hostingGenerationRoutes,
  hostingCommon,
] = await Promise.all([
  read('../src/app/api/video-studio/jobs/route.ts'),
  read('../src/app/api/video-studio/jobs/run/route.ts'),
  read('../src/app/api/video-studio/jobs/process/route.ts'),
  read('../src/app/api/video-studio/jobs/[jobId]/route.ts'),
  read('../src/app/api/generate-video/route.ts'),
  read('../src/app/api/video-studio/readiness/route.ts'),
  read('../src/app/api/video-studio/status/route.ts'),
  read('../src/lib/server/video-studio-admin.ts'),
  read('../functions/src/api/hostingVideoStudioRoutes.ts'),
  read('../functions/src/api/hostingGenerationRoutes.ts'),
  read('../functions/src/api/hostingCommon.ts'),
]);

for (const [label, source] of [
  ['Next queue route', jobsRoute],
  ['Next direct-run route', runRoute],
  ['Next processor route', processRoute],
  ['Next requeue route', jobRoute],
  ['Next legacy video route', legacyVideoRoute],
]) {
  assert.match(source, /requireAdminAuth\(req\)/, `${label} must require administrator access before shared-credit work.`);
}

assert.match(
  processRoute,
  /const hasInternalAccess = hasInternalProcessorAccess\(req\)[\s\S]*if \(hasInternalAccess\)[\s\S]*dispatch: 'firebase-functions',[\s\S]*executeQueuedVideoStudioJob/,
  'Browser requests must only acknowledge Firebase Functions dispatch; only the secret internal processor may run the Next executor.',
);
assert.ok(
  processRoute.indexOf('await requireAdminAuth(req)') < processRoute.indexOf('await req.json()'),
  'The processor route must reject unauthenticated browser requests before parsing or validating job payloads.',
);

for (const handler of [
  'handleVideoStudioJobs',
  'handleVideoStudioJobProcess',
  'handleVideoStudioJobRun',
  'handleVideoStudioJobById',
]) {
  const start = hostingVideoRoutes.indexOf(`function ${handler}`);
  assert.ok(start >= 0, `Missing Hosting handler: ${handler}`);
  const body = hostingVideoRoutes.slice(start, start + 1_000);
  assert.match(body, /requireAdmin\(req\)/, `${handler} must require administrator access.`);
}

const generateVideoStart = hostingGenerationRoutes.indexOf('function handleGenerateVideo');
assert.ok(generateVideoStart >= 0, 'Missing Hosting generate-video handler.');
assert.match(
  hostingGenerationRoutes.slice(generateVideoStart, generateVideoStart + 700),
  /requireAdmin\(req\)/,
  'The legacy Hosting generate-video route must not expose the shared API balance to ordinary users.',
);

assert.match(readinessRoute, /requireAdminAuth\(req\)/);
assert.match(statusRoute, /requireAdminAuth\(req\)/);
assert.match(readinessRoute, /auth\.isAdmin \? preflight : redactCreditBalance\(preflight\)/);
assert.doesNotMatch(readinessRoute, /message: error instanceof Error \? error\.message/);

const hostingReadinessStart = hostingVideoRoutes.indexOf('function handleVideoStudioReadiness');
assert.ok(hostingReadinessStart >= 0, 'Missing Hosting readiness handler.');
const hostingReadiness = hostingVideoRoutes.slice(hostingReadinessStart, hostingReadinessStart + 6_500);
assert.match(hostingReadiness, /const auth = await requireAdmin\(req\)/);
const hostingStatusStart = hostingVideoRoutes.indexOf('function handleVideoStudioStatus');
assert.ok(hostingStatusStart >= 0, 'Missing Hosting status handler.');
assert.match(hostingVideoRoutes.slice(hostingStatusStart, hostingStatusStart + 900), /await requireAdmin\(req\)/);
assert.match(hostingReadiness, /auth\.isAdmin \? preflight : redactCreditBalance\(preflight\)/);
assert.doesNotMatch(hostingReadiness, /credentialMode: 'application_default'/);
assert.doesNotMatch(hostingReadiness, /message: error instanceof Error \? error\.message/);
assert.doesNotMatch(hostingCommon, /const message = error instanceof Error \? error\.message/);
assert.match(hostingCommon, /res\.status\(500\)\.json\(\{ success: false, error: 'Unexpected server error\.' \}\)/);

assert.match(adminStore, /attemptCount:\s*0,[\s\S]{0,120}nextAttemptAt:\s*null,/);
const createQueuedJobStart = hostingVideoRoutes.indexOf('async function createQueuedJob');
assert.ok(createQueuedJobStart >= 0, 'Missing Hosting queued-job creator.');
assert.match(
  hostingVideoRoutes.slice(createQueuedJobStart, createQueuedJobStart + 2_500),
  /attemptCount:\s*0,[\s\S]{0,120}nextAttemptAt:\s*null,/,
  'New Hosting jobs must be visible to the null-based stale-job recovery query.',
);

console.log('Video Studio paid-access and recovery-field verification passed.');
