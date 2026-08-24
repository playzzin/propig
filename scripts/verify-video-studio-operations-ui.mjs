import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  jobCostLabels,
  jobAllowsRetry,
  jobMessageLabel,
  jobStatusLabel,
} from '../src/app/admin/video-studio/utils.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = await readFile(path.join(root, 'src/app/admin/video-studio/page.tsx'), 'utf8');
const dashboard = await readFile(
  path.join(root, 'src/app/admin/video-studio/components/TaskTimelineDashboard.tsx'),
  'utf8',
);

assert.match(page, /TaskTimelineDashboard/);
assert.match(page, /updateQueuedJob=\{handleUpdateQueuedJob\}/);
assert.match(page, /kickoffQueuedJob=\{handleProcessJob\}/);
assert.match(page, /moveClip=\{handleMoveClip\}/);
assert.match(page, /getVideoEstimate\(/);
assert.match(page, /VideoCostApprovalDialog/);
assert.match(page, /authorizedCostUsd: estimate\.estimatedCostUsd/);
assert.doesNotMatch(page, /상태: \{job\.status\}/);
assert.match(dashboard, /const orderedJobs = React\.useMemo/);
assert.match(dashboard, /stamp\(right\.updatedAt \?\? right\.createdAt\)/);
assert.match(dashboard, /jobMessageLabel\(job\)/);
assert.match(dashboard, /jobCostLabels\(job\)/);
assert.match(dashboard, /안전하게 취소/);
assert.match(dashboard, /job\.status === 'failed' && retryAllowed/);
assert.match(dashboard, /<summary>기술 정보<\/summary>/);

const preflight = await readFile(path.join(root, 'src/lib/server/video-studio-preflight.ts'), 'utf8');
assert.match(preflight, /preflight\.estimatedTotalCostUsd > authorizedCostUsd/);
assert.match(preflight, /현재 예상 비용이 사용자가 승인한 한도를 넘었습니다/);

assert.equal(jobStatusLabel('queued'), '대기 중');
assert.equal(jobStatusLabel('uploading'), '업로드 중');
assert.equal(jobAllowsRetry({ metadata: { failureCode: 'ambiguous_provider_submission' } }), false);
assert.equal(jobAllowsRetry({ metadata: { retryStrategy: 'manual-review' } }), false);
assert.equal(jobAllowsRetry({ metadata: {} }), true);
assert.equal(
  jobMessageLabel({
    id: 'job-queued',
    userId: 'user-1',
    projectId: 'project-1',
    kind: 'generate',
    status: 'queued',
    title: '첫 장면',
    message: 'Job requeued and waiting for a processor.',
  }),
  '복구 요청을 저장했습니다. 처리 서버 배정을 기다리고 있습니다.',
);
assert.equal(
  jobMessageLabel({
    id: 'job-running',
    userId: 'user-1',
    projectId: 'project-1',
    kind: 'generate',
    status: 'running',
    title: '첫 장면',
    message: 'OpenRouter에서 장면 1/3을 제작 중입니다.',
  }),
  'OpenRouter에서 장면 1/3을 제작 중입니다.',
);
assert.deepEqual(
  jobCostLabels({
    id: 'job-cost',
    userId: 'user-1',
    projectId: 'project-1',
    kind: 'generate',
    status: 'completed',
    title: '첫 장면',
    metadata: {
      costEstimate: {
        repeatCount: 1,
        estimatedTotalCostUsd: 0.08,
      },
      renderResult: {
        costUsd: 0.0712,
      },
    },
  }),
  ['승인 당시 예상 $0.08', '확인된 실제 비용 $0.07'],
);
assert.deepEqual(
  jobCostLabels({
    id: 'job-repeat-cost',
    userId: 'user-1',
    projectId: 'project-1',
    kind: 'generate',
    status: 'completed',
    title: '릴레이',
    metadata: {
      costEstimate: {
        repeatCount: 3,
        estimatedTotalCostUsd: 0.24,
      },
      renderResult: {
        costUsd: 0.0712,
      },
    },
  }),
  ['승인 당시 예상 $0.24'],
  'single-segment render cost must not be presented as the actual total for a relay job',
);
assert.deepEqual(
  jobCostLabels({
    id: 'job-no-cost',
    userId: 'user-1',
    projectId: 'project-1',
    kind: 'merge',
    status: 'completed',
    title: '합치기',
  }),
  [],
  'missing cost data must not be guessed',
);

console.log('Video Studio operations UI contracts passed.');
