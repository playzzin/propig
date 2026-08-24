import assert from 'node:assert/strict';

if (process.env.EMOTICON_RUN_LIVE_UPLOAD_TEST !== 'true') {
  console.log('Live upload smoke test skipped. Set EMOTICON_RUN_LIVE_UPLOAD_TEST=true to contact the deployed callable.');
  process.exit(0);
}

const endpoint = process.env.EMOTICON_UPLOAD_ENDPOINT
  || 'https://asia-northeast3-propig-63524.cloudfunctions.net/uploadEmoticonSource';
const origin = process.env.EMOTICON_UPLOAD_ORIGIN || 'http://localhost:3002';
const timeoutMs = Number(process.env.EMOTICON_UPLOAD_TIMEOUT_MS || 15_000);

function corsOrigin(response) {
  return response.headers.get('access-control-allow-origin') || '';
}

function assertCors(response, phase) {
  const allowedOrigin = corsOrigin(response);
  assert.ok(
    allowedOrigin === '*' || allowedOrigin === origin,
    `${phase}: expected Access-Control-Allow-Origin for ${origin}, received ${allowedOrigin || '(missing)'}`,
  );
}

const preflight = await fetch(endpoint, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  },
  signal: AbortSignal.timeout(timeoutMs),
});
assert.ok(preflight.ok, `Preflight failed with HTTP ${preflight.status}. The callable may be missing or deployed in another region.`);
assertCors(preflight, 'Preflight');
assert.match(
  preflight.headers.get('access-control-allow-methods') || '',
  /POST/i,
  'Preflight did not allow POST.',
);

const unauthenticated = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Origin: origin,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ data: {} }),
  signal: AbortSignal.timeout(timeoutMs),
});
assertCors(unauthenticated, 'Unauthenticated callable response');
assert.ok(
  [400, 401, 403].includes(unauthenticated.status),
  `Expected a structured authentication/request rejection, received HTTP ${unauthenticated.status}.`,
);
const payload = await unauthenticated.json().catch(() => null);
assert.ok(payload?.error, 'The deployed callable did not return a Firebase callable error payload.');

console.log(`Live upload callable CORS smoke test passed (${endpoint}, HTTP ${unauthenticated.status}).`);
