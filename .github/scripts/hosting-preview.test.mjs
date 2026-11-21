import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupDeletedBranch, previewChannelId, previewForPush } from './hosting-preview.mjs';

const branch = 'codex/cloud-ci-92d59c2';
const revision = '92d59c2f775df12bce6f066b5652ce838099c9fb';
const channel = 'branch-37bba18047288d01';
const site = 'propig-63524';
const endpoint = `https://firebasehosting.googleapis.com/v1beta1/sites/${site}/channels/${channel}`;
const event = { ref: branch, ref_type: 'branch', repository: { full_name: 'playzzin/propig' } };

test('channel IDs match existing preview deployments and preserve branch case', () => {
  assert.equal(previewChannelId(branch), channel);
  assert.notEqual(previewChannelId(branch.toUpperCase()), channel);
});

test('preview deploy uses only the current branch head', () => {
  assert.equal(previewForPush(branch, revision, (name) => {
    assert.equal(name, branch);
    return revision;
  }), channel);
  assert.equal(previewForPush(branch, revision, () => null), null);
  assert.equal(previewForPush(branch, revision, () => 'superseding-commit'), null);
});

test('cleanup ignores protected branches, other repos, ordinary branches, and tags', async () => {
  for (const payload of [
    { ...event, ref: 'main' },
    { ...event, ref: 'develop' },
    { ...event, ref: 'feature/example' },
    { ...event, ref: 'codex/' },
    { ...event, ref_type: 'tag' },
    { ...event, repository: { full_name: 'other/propig' } },
  ]) {
    const result = await cleanupDeletedBranch(payload, {
      site,
      readHead: () => assert.fail('An out-of-scope event must not read the branch'),
    });
    assert.match(result, /^Skipped:/);
  }
});

test('cleanup fails closed for a different Firebase site', async () => {
  await assert.rejects(cleanupDeletedBranch(event, {
    site: 'another-site',
    readHead: () => assert.fail('No remote or Hosting access with an unexpected site'),
  }), /does not match ProPig Hosting/);
});

test('cleanup leaves previews alone when a branch still exists or reappears during auth', async () => {
  const result = await cleanupDeletedBranch(event, {
    site,
    readHead: () => revision,
    getToken: () => assert.fail('Do not authenticate for an existing branch'),
  });
  assert.match(result, /still exists/);

  const states = [null, revision];
  const reappeared = await cleanupDeletedBranch(event, {
    site,
    readHead: () => states.shift(),
    getToken: () => 'mock-token',
    request: () => assert.fail('Do not delete the preview for a recreated branch'),
  });
  assert.match(reappeared, /recreated/);
  assert.equal(states.length, 0);
});

test('cleanup sends one exact Hosting DELETE and treats an absent channel as success', async () => {
  for (const status of [200, 404]) {
    const calls = [];
    const result = await cleanupDeletedBranch(event, {
      site,
      readHead: () => null,
      getToken: () => 'mock-token',
      request: async (url, options) => {
        calls.push([url, options.method, options.headers.Authorization, options.redirect]);
        return { status, ok: status === 200 };
      },
    });
    assert.deepEqual(calls, [[endpoint, 'DELETE', 'Bearer mock-token', 'error']]);
    assert.equal(result, status === 200
      ? `Deleted preview channel ${channel}.`
      : `Preview channel ${channel} was already absent.`);
  }
});

test('GitHub read failures cause no Hosting request and Firebase permission failures surface', async () => {
  await assert.rejects(cleanupDeletedBranch(event, {
    site,
    readHead: () => { throw new Error('GitHub unavailable'); },
    getToken: () => assert.fail('Do not authenticate without an authoritative branch read'),
  }), /GitHub unavailable/);
  await assert.rejects(cleanupDeletedBranch(event, {
    site,
    readHead: () => null,
    getToken: () => 'mock-token',
    request: async () => ({ status: 403, ok: false }),
  }), /HTTP 403/);
});
