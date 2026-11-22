import assert from 'node:assert/strict';
import test from 'node:test';
import { previewOrigin, verifyRevision } from './verify-pr-preview.mjs';

const pr = { branch: 'codex/cloud-ci-92d59c2', sha: '92d59c2f775df12bce6f066b5652ce838099c9fb' };
const host = 'propig-63524--branch-37bba18047288d01-abc123.web.app';
const origin = 'https://' + host;

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
