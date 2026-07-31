import assert from 'node:assert/strict';

const { assertHostResolvesToPublicAddresses, isBlockedRemoteAddress, normalizeExternalHttpUrl } = await import(
  '../src/lib/server/http-safety.ts'
);

const blockedAddresses = [
  '0.0.0.0',
  '10.10.10.10',
  '100.64.0.1',
  '127.0.0.1',
  '169.254.169.254',
  '172.16.0.1',
  '192.168.1.1',
  '198.18.0.1',
  '203.0.113.1',
  '::1',
  'fc00::1',
  'fe80::1',
  '::ffff:127.0.0.1',
];

for (const address of blockedAddresses) {
  assert.equal(isBlockedRemoteAddress(address), true, `${address} must be blocked`);
}

assert.equal(isBlockedRemoteAddress('8.8.8.8'), false, 'A public IPv4 address must be allowed');
assert.equal(isBlockedRemoteAddress('2606:4700:4700::1111'), false, 'A public IPv6 address must be allowed');
assert.equal(normalizeExternalHttpUrl('https://example.com'), 'https://example.com/');
assert.throws(() => normalizeExternalHttpUrl('http://user:pass@example.com'), /credentials/i);
assert.throws(() => normalizeExternalHttpUrl('http://127.0.0.1'), /private network/i);
assert.throws(() => normalizeExternalHttpUrl('file:///etc/passwd'), /http and https/i);

await assert.rejects(
  assertHostResolvesToPublicAddresses('image.example', async () => [
    { address: '169.254.169.254', family: 4 },
  ]),
  /private network/i,
);

await assert.doesNotReject(
  assertHostResolvesToPublicAddresses('image.example', async () => [
    { address: '93.184.216.34', family: 4 },
  ]),
);

console.log('HTTP safety verification passed.');
