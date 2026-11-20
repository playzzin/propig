import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const nextSafety = await import('../src/lib/server/http-safety.ts');
const functionsSafety = require('../functions/lib/api/security.js');
const functionsOpenRouter = require('../functions/lib/videoStudio/openrouter.js');

async function verifySafetyRuntime(label, safety) {
  assert.equal(
    safety.normalizeExternalHttpsUrl('https://example.com/video.mp4'),
    'https://example.com/video.mp4',
    `${label}: public HTTPS URLs should be normalized`,
  );
  assert.throws(
    () => safety.normalizeExternalHttpsUrl('http://example.com/video.mp4'),
    /HTTPS/i,
    `${label}: insecure HTTP must be blocked`,
  );
  assert.throws(
    () => safety.normalizeExternalHttpsUrl('https://127.0.0.1/video.mp4'),
    /private network/i,
    `${label}: loopback IPs must be blocked`,
  );
  assert.throws(
    () => safety.normalizeExternalHttpsUrl('https://metadata.local/video.mp4'),
    /private network/i,
    `${label}: local hostnames must be blocked`,
  );
  assert.throws(
    () => safety.normalizeExternalHttpsUrl('https://user:password@example.com/video.mp4'),
    /credentials/i,
    `${label}: URL credentials must be blocked`,
  );

  await assert.rejects(
    safety.assertExternalHttpsUrl('https://media.example/video.mp4', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]),
    /private network/i,
    `${label}: mixed public/private DNS answers must fail closed`,
  );
  await assert.doesNotReject(
    safety.assertExternalHttpsUrl('https://media.example/video.mp4', async () => [
      { address: '93.184.216.34', family: 4 },
    ]),
    `${label}: public DNS answers should pass`,
  );

  const originalInit = {
    headers: {
      Authorization: 'Bearer provider-secret',
      Cookie: 'session=private',
      'X-Request-Id': 'safe-to-forward',
    },
  };
  const crossOriginInit = safety.stripSensitiveHeadersForCrossOriginRedirect(
    originalInit,
    new URL('https://openrouter.ai/api/v1/videos/job/content'),
    new URL('https://cdn.example/video.mp4'),
  );
  const crossOriginHeaders = new Headers(crossOriginInit.headers);
  assert.equal(crossOriginHeaders.has('authorization'), false, `${label}: auth must not cross origins`);
  assert.equal(crossOriginHeaders.has('cookie'), false, `${label}: cookies must not cross origins`);
  assert.equal(crossOriginHeaders.get('x-request-id'), 'safe-to-forward');

  const sameOriginInit = safety.stripSensitiveHeadersForCrossOriginRedirect(
    originalInit,
    new URL('https://openrouter.ai/api/v1/videos/job'),
    new URL('https://openrouter.ai/api/v1/videos/job/content'),
  );
  assert.equal(new Headers(sameOriginInit.headers).get('authorization'), 'Bearer provider-secret');

  const accepted = await safety.readCappedBinaryResponse(
    new Response(Uint8Array.from([1, 2, 3])),
    3,
  );
  assert.deepEqual([...accepted], [1, 2, 3], `${label}: in-limit binary responses should pass`);

  await assert.rejects(
    safety.readCappedBinaryResponse(
      new Response(Uint8Array.from([1, 2, 3]), { headers: { 'content-length': '3' } }),
      2,
    ),
    /exceeds the allowed size/i,
    `${label}: declared oversized responses must be rejected before buffering`,
  );

  const oversizedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from([1, 2]));
      controller.enqueue(Uint8Array.from([3, 4]));
      controller.close();
    },
  });
  await assert.rejects(
    safety.readCappedBinaryResponse(new Response(oversizedStream), 3),
    /exceeds the allowed size/i,
    `${label}: chunked oversized responses must be rejected while streaming`,
  );
}

await verifySafetyRuntime('Next server', nextSafety);
await verifySafetyRuntime('Firebase Functions', functionsSafety);

const trustedHeaders = functionsOpenRouter.buildOpenRouterVideoDownloadHeaders(
  'https://openrouter.ai/api/v1/videos/job-123/content?index=0',
  'provider-secret',
);
assert.equal(trustedHeaders.Authorization, 'Bearer provider-secret');
for (const untrustedUrl of [
  'https://cdn.example/video.mp4',
  'https://openrouter.ai.evil.example/api/v1/videos/job/content',
  'https://openrouter.ai/not-the-video-api/content',
]) {
  assert.deepEqual(
    functionsOpenRouter.buildOpenRouterVideoDownloadHeaders(untrustedUrl, 'provider-secret'),
    {},
    `OpenRouter credentials must not be attached to ${untrustedUrl}`,
  );
}
assert.throws(
  () => functionsOpenRouter.buildOpenRouterVideoDownloadHeaders('http://openrouter.ai/api/v1/videos/job/content', 'provider-secret'),
  /HTTPS/i,
);

const [nextOpenRouterSource, functionsOpenRouterSource, nextFfmpegSource, functionsFfmpegSource, nextClipRoute, functionsClipRoute, nextVideoStudioAdmin] = await Promise.all([
  readFile(new URL('../src/lib/server/video-generation.ts', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/videoStudio/openrouter.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/server/ffmpeg.ts', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/videoStudio/ffmpeg.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/video-studio/clips/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/api/hostingVideoStudioRoutes.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/server/video-studio-admin.ts', import.meta.url), 'utf8'),
]);

for (const [label, source] of [
  ['Next OpenRouter download', nextOpenRouterSource],
  ['Functions OpenRouter download', functionsOpenRouterSource],
]) {
  assert.match(source, /fetchExternalHttpsUrl\(/, `${label} must use the pinned HTTPS fetcher`);
  assert.match(source, /readCappedBinaryResponse\(/, `${label} must cap response bytes`);
  assert.doesNotMatch(source, /await fetch\(sourceUrl/, `${label} must not fetch provider output URLs directly`);
}

for (const [label, source] of [
  ['Next FFmpeg media download', nextFfmpegSource],
  ['Functions FFmpeg media download', functionsFfmpegSource],
]) {
  assert.match(source, /fetchExternalHttpsUrl\(/, `${label} must use the pinned HTTPS fetcher`);
  assert.match(source, /VIDEO_STUDIO_MEDIA_MAX_BYTES/, `${label} must enforce a media size ceiling`);
  assert.doesNotMatch(source, /await fetch\(url/, `${label} must not fetch stored clip URLs directly`);
}

for (const [label, source] of [
  ['Next clip route', nextClipRoute],
  ['Functions clip route', functionsClipRoute],
]) {
  assert.match(source, /videoUrl: ExternalVideoUrlSchema/, `${label} must reject unsafe clip URLs`);
  assert.match(source, /assertExternalHttpsUrl\(payload\.videoUrl\)/, `${label} must verify public DNS before persistence`);
}

assert.doesNotMatch(
  nextVideoStudioAdmin,
  /fetchRemoteBuffer|uploadRemoteFileToVideoStudioStorage/,
  'Unused raw remote-download helpers must not bypass the shared pinned HTTPS fetcher.',
);

console.log('Video Studio URL safety verification passed.');
