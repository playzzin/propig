import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [admin, nextExecutor, nextRoute, functionRoutes, functionProcessor, functionRecovery] = await Promise.all([
  read('src/lib/server/video-studio-admin.ts'),
  read('src/lib/server/video-studio-job-executor.ts'),
  read('src/app/api/video-studio/jobs/[jobId]/route.ts'),
  read('functions/src/api/hostingVideoStudioRoutes.ts'),
  read('functions/src/videoStudio/processor.ts'),
  read('functions/src/triggers/recoverVideoStudioJobs.ts'),
]);

for (const source of [admin, functionRoutes]) {
  assert.match(source, /cancelRequestedAt/);
  assert.match(source, /Cancellation requested\. Processing will stop at the next safe checkpoint\./);
}

for (const source of [admin, functionProcessor]) {
  assert.match(source, /current\.status === 'canceled' \|\| current\.cancelRequestedAt/);
  assert.match(source, /status: 'canceled' as const/);
  assert.match(source, /No further processing will be started/);
}

const nextGuard = nextExecutor.indexOf('await assertVideoStudioJobCanContinue(job.id);');
const nextPost = nextExecutor.indexOf('const generated = await generateOpenRouterVideo(', nextGuard);
assert.ok(nextGuard >= 0 && nextPost > nextGuard, 'Next worker must check cancellation before provider generation.');

const functionGuard = functionProcessor.indexOf('await assertJobCanContinue(jobId);');
const functionPost = functionProcessor.indexOf('const generated = await generateOpenRouterVideo(', functionGuard);
assert.ok(functionGuard >= 0 && functionPost > functionGuard, 'Functions worker must check cancellation before provider generation.');

assert.match(nextExecutor, /error instanceof VideoStudioJobCanceledError[\s\S]*finalizeVideoStudioJobCancellationIfRequested/);
assert.match(functionProcessor, /error instanceof VideoStudioJobCanceledError[\s\S]*finalizeJobCancellationIfRequested/);
assert.match(nextRoute, /cancellationRequested[\s\S]*status: cancellationRequested \? 202 : 200/);
assert.match(functionRoutes, /res\.status\(updated\.cancellationRequested \? 202 : 200\)/);
assert.match(functionRecovery, /if \(current\.cancelRequestedAt\)[\s\S]*status: 'canceled'/);

console.log('Video studio cooperative cancellation checks passed.');
