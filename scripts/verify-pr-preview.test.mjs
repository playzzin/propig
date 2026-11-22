import assert from 'node:assert/strict';
import test from 'node:test';
import { previewOrigin, verifyRevision } from './verify-pr-preview.mjs';

const pr = { branch: 'codex/cloud-ci-92d59c2', sha: '92d59c2f775df12bce6f066b5652ce838099c9fb' };
const host = 'propig-63524--branch-37bba18047288d01-abc123.web.app';
const origin = 'https://' + host;

test('accepts the Actions artifact for the selected branch only', () => {
  assert.equal(previewOrigin(origin + '/\n', pr.branch), origin);
  for (const value of ['https://propig-63524.web.app', 'http://' + host, origin + '.example.org',
    'https://user@' + host, origin + '/some/path', origin + '?next=x']) {
    assert.throws(() => previewOrigin(value, pr.branch));
  }
  assert.throws(() => previewOrigin(origin, 'codex/a-different-branch'));
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
