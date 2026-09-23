import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// GET-only probe: no sign-in token, project write, provider call or cache deletion.
const require = createRequire(import.meta.url);
const origin = new URL(process.env.STORYBOARD_BASE_URL || 'http://127.0.0.1:3002');
assert(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Use a local development server.');
assert(!origin.username && !origin.password && !origin.search && !origin.hash, 'Do not supply credentials or query data.');
for (const name of ['firebase-admin', 'firebase-admin/app', 'firebase-admin/firestore']) {
  await access(require.resolve(name));
  await access(fileURLToPath(import.meta.resolve(name)));
}

async function get(path) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin.origin, 'Only check same-origin assets.');
  return fetch(url, { redirect: 'error', signal: AbortSignal.timeout(90_000) });
}

const auth = await get('/api/admin/check');
assert.equal(auth.status, 401, 'Unauthenticated Admin API should compile and return 401, not a module error.');
assert.match(auth.headers.get('content-type') || '', /application\/json/);
assert.equal((await auth.json()).ok, false);
const page = await get('/admin/storyboard');
assert.equal(page.status, 200, 'Storyboard must render.');
const html = await page.text();
assert(!/Module not found|Can't resolve 'firebase-admin/.test(html), 'No dependency-resolution error page.');
const assetPaths = [...new Set([...html.matchAll(/(?:src|href)="([^"<>]+)"/g)]
  .map((match) => match[1].replaceAll('&amp;', '&'))
  .filter((path) => path.startsWith('/_next/static/') && /\.(?:js|css)(?:\?|$)/.test(path)))];
assert(assetPaths.some((path) => /\.js(?:\?|$)/.test(path)), 'Must find real page scripts.');
for (let offset = 0; offset < assetPaths.length; offset += 6) {
  await Promise.all(assetPaths.slice(offset, offset + 6).map(async (path) => {
    const response = await get(path);
    assert.equal(response.status, 200, `Missing generated asset: ${path}`);
    assert(!/text\/html/.test(response.headers.get('content-type') || ''), `Asset returned an error page: ${path}`);
    await response.arrayBuffer();
  }));
}
console.log(`PASS: Firebase Admin CJS/ESM entries, unauthenticated API 401, storyboard 200, ${assetPaths.length} generated JS/CSS assets 200 (${origin.origin}). No authenticated or paid requests.`);
