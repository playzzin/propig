import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMOTICON_PROCESSING_STALL_THRESHOLD_MS,
  EMOTICON_QUEUE_STALL_THRESHOLD_MS,
  getEmoticonJobStallState,
  isEmoticonJobStalled,
} from '../src/lib/emoticonJobHealth.ts';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nowMs = 1_750_000_000_000;
const timestamp = (value) => ({ toMillis: () => value });

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

const serviceSource = fs.readFileSync(
  path.join(rootDirectory, 'src/services/emoticonStudioService.ts'),
  'utf8',
);
const pageSource = fs.readFileSync(
  path.join(rootDirectory, 'src/app/admin/emoticon-studio/page.tsx'),
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

assert.match(serviceSource, /getEmoticonJobStallState/);
assert.match(pageSource, /90초 안에 작업이 시작되지 않으면 복구 방법을 안내합니다/);
assert.match(pageSource, /queue_not_started/);
assert.match(functionsIndexSource, /onEmoticonJobCreated/);
assert.match(jobTriggerSource, /users\/\{userId\}\/emoticonJobs\/\{jobId\}/);

console.log('Emoticon queue recovery checks passed.');
