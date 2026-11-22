import assert from 'node:assert/strict';
import test from 'node:test';
import { deployedPreview, previewOrigin, verifyRevision } from './verify-pr-preview.mjs';

const pr = { branch: 'codex/cloud-ci-92d59c2', sha: '92d59c2f775df12bce6f066b5652ce838099c9fb' };
const host = 'propig-63524--branch-37bba18047288d01-abc123.web.app';
const origin = 'https://' + host;
const deployment = { GITHUB_REF_NAME: pr.branch, GITHUB_SHA: pr.sha, PREVIEW_URL: origin };

test('checks the deployment from the push without a PR number or a completed CI run', () => {
  assert.deepEqual(deployedPreview(deployment, pr.sha), { ...pr, origin, ci: null });
  const run = deployedPreview({ ...deployment, PREVIEW_URL: origin + '/', GITHUB_RUN_ID: '123' }, pr.sha);
  assert.equal(run.origin, origin);
  assert.equal(run.ci, 'https://github.com/playzzin/propig/actions/runs/123');
});

test('requires the full deployed revision in the checkout and an eligible branch', () => {
  for (const context of [{ GITHUB_REPOSITORY: 'fork/propig' }, { GITHUB_REF_TYPE: 'tag' }]) {
    assert.throws(() => deployedPreview({ ...deployment, ...context }, pr.sha), /ProPig 저장소의 브랜치/);
  }
  for (const sha of [undefined, '', pr.sha.slice(0, 12), 'g'.repeat(40)]) {
    assert.throws(() => deployedPreview({ ...deployment, GITHUB_SHA: sha }, sha), /커밋 SHA/);
  }
  assert.throws(() => deployedPreview(deployment, '0'.repeat(40)), /커밋 SHA/);
  for (const branch of [undefined, '', 'main', 'dependabot/npm_and_yarn/test']) {
    assert.throws(() => deployedPreview({ ...deployment, GITHUB_REF_NAME: branch }, pr.sha), /브랜치/);
  }
});

test('accepts only the canonical HTTPS origin for the exact deployed branch channel', () => {
  assert.throws(() => deployedPreview({ ...deployment, GITHUB_REF_NAME: 'codex/another-branch' }, pr.sha), /PREVIEW_URL/);
  for (const url of [
    undefined, '', 'https://propig-63524.web.app', origin.replace('propig-63524', 'other-site'),
    'http://' + host, 'https://user:password@' + host, origin + ':443', origin + ':3002',
    origin + '/path', origin + '/?', origin + '?x=y', origin + '#hash', origin + '.example.org',
    origin.replace('-abc123.', '-abc.other.'), origin + '\n', origin + '//',
  ]) {
    assert.throws(() => deployedPreview({ ...deployment, PREVIEW_URL: url }, pr.sha), /PREVIEW_URL/);
  }
});

test('selects the latest unexpired channel for this branch in the verified Actions run', () => {
  const prefix = 'preview-channel-branch-37bba18047288d01-';
  const artifacts = [
    { id: 4, name: prefix + 'expired', expired: true },
    { id: 1, name: prefix + 'old' },
    { id: 2, name: prefix + 'abc123' },
    { id: 3, name: 'preview-link-' + pr.sha },
  ];
  assert.equal(previewOrigin(artifacts, pr.branch), origin);
  assert.throws(() => previewOrigin(artifacts, 'codex/a-different-branch'));
  for (const suffix of ['', 'abc.web.app', 'abc@other', 'abc/path', 'abc?next=x']) {
    assert.throws(() => previewOrigin([{ id: 5, name: prefix + suffix }], pr.branch));
  }
  assert.throws(() => previewOrigin([artifacts[0]], pr.branch));
});

test('checks the deployed commit without using cached or redirected responses', async () => {
  const urls = [];
  const request = (url, options) => {
    assert.equal(url.origin, origin);
    assert.equal(url.pathname, '/propig-preview-commit.txt');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    urls.push(url.href);
    return new Response(pr.sha + '\n');
  };
  await verifyRevision(pr, pr, origin, request);
  await verifyRevision(pr, pr, origin, request);
  assert.notEqual(urls[0], urls[1]);
});

test('a moved PR, superseded channel, missing stamp or expired preview cannot pass', async () => {
  for (const newer of [{ ...pr, sha: '0'.repeat(40) }, { ...pr, branch: 'another' }]) {
    await assert.rejects(verifyRevision(pr, newer, origin, () => assert.fail('Changed PR')), /PR이 변경/);
  }
  for (const response of [new Response('0'.repeat(40)), new Response('<html></html>'), new Response('', { status: 404 })]) {
    await assert.rejects(verifyRevision(pr, pr, origin, () => response), /게시된 커밋/);
  }
});
