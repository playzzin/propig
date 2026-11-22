import assert from 'node:assert/strict';
import test from 'node:test';
import { requirePreviewQA } from './require-preview-qa.mjs';

const source = { repo: 'playzzin/propig', branch: 'codex/preview', sha: 'a'.repeat(40) };
const push = { databaseId: 42, headBranch: source.branch, headSha: source.sha, event: 'push',
  status: 'completed', conclusion: 'success', url: 'https://github.com/playzzin/propig/actions/runs/42' };
const qa = { name: 'Cloud preview QA', status: 'completed', conclusion: 'success', html_url: push.url + '/job/50' };
const ready = { readPush: () => push, readJobs: () => [qa], sleep: () => assert.fail('Unexpected wait') };

test('a PR opened before or after its exact branch push sees the same successful browser check', async () => {
  const runs = [undefined, { ...push, status: 'in_progress', conclusion: null }, push];
  const expected = { run: push.url, job: qa.html_url };
  assert.deepEqual(await requirePreviewQA(source, { ...ready, readPush: () => runs.shift(),
    readJobs: id => { assert.equal(id, push.databaseId); return [qa]; }, sleep: async () => {} }), expected);
  assert.deepEqual(await requirePreviewQA(source, ready), expected);
});

test('a missing, skipped, failed, or legacy build-only QA job cannot satisfy the gate', async () => {
  for (const jobs of [[], [{ ...qa, name: 'Web app' }], [{ ...qa, conclusion: 'skipped' }],
    [{ ...qa, conclusion: 'failure' }], [{ ...qa, status: 'in_progress' }]]) {
    await assert.rejects(requirePreviewQA(source, { ...ready, readJobs: () => jobs }), /No successful/);
  }
  for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
    await assert.rejects(requirePreviewQA(source, { ...ready, readPush: () => ({ ...push, conclusion }) }), /Branch CI finished/);
  }
});

test('a different SHA, branch, event, or unsupported source cannot supply the result', async () => {
  for (const change of [{ headSha: 'b'.repeat(40) }, { headBranch: 'another' }, { event: 'pull_request' }]) {
    await assert.rejects(requirePreviewQA(source, { ...ready, readPush: () => ({ ...push, ...change }) }), /does not match/);
  }
  for (const change of [{ repo: 'someone/propig' }, { branch: 'dependabot/npm/foo' }, { branch: 'main' }, { sha: '' }]) {
    await assert.rejects(requirePreviewQA({ ...source, ...change }, { readPush: () => assert.fail('Unexpected API call') }), /preview is required/);
  }
});

test('a missing or permanently queued run times out without marking the PR successful', async () => {
  for (const run of [undefined, { ...push, status: 'queued' }]) {
    let elapsed = 0;
    await assert.rejects(requirePreviewQA(source, { ...ready, readPush: () => run, timeoutMs: 10,
      now: () => elapsed, sleep: async ms => { elapsed += ms; } }), /Timed out/);
    assert.equal(elapsed, 10);
  }
});
