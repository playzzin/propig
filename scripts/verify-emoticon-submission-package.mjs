import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import {
  EmoticonSubmissionPackageError,
  buildEmoticonSubmissionPackage,
  preflightEmoticonSubmissionPackage,
  resolveSubmissionZipCompression,
} from '../src/lib/emoticonSubmissionPackage.ts';
import { emoticonOutputInspectionSchema } from '../src/schemas/emoticonStudio.ts';

const require = createRequire(import.meta.url);
const sharp = require('../functions/node_modules/sharp');

const FIXED_DATE = '2026-08-01T00:00:00.000Z';
const PNG_BYTES = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));
const TRUNCATED_PNG_BYTES = PNG_BYTES.slice(0, 12);
const INVALID_IHDR_LENGTH_PNG_BYTES = PNG_BYTES.slice();
new DataView(
  INVALID_IHDR_LENGTH_PNG_BYTES.buffer,
  INVALID_IHDR_LENGTH_PNG_BYTES.byteOffset,
  INVALID_IHDR_LENGTH_PNG_BYTES.byteLength,
).setUint32(8, 1_024, false);
const TRUNCATED_WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x00, 0x00, 0x00, 0x00,
]);
const SANE_WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
  0x0a, 0x00, 0x00, 0x00,
  0x12, 0x00, 0x00, 0x67, 0x01, 0x00, 0x67, 0x01, 0x00, 0x00,
]);
const KAKAO_PNG_BYTES = Uint8Array.from(await sharp(Buffer.from(`
  <svg width="360" height="360" xmlns="http://www.w3.org/2000/svg">
    <rect x="24" y="24" width="312" height="312" rx="70" fill="#ffcc66"/>
  </svg>
`)).png().toBuffer());
const MP4_BYTES = Uint8Array.from([
  0x00, 0x00, 0x00, 0x0c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x00, 0x0c, 0x6d, 0x6f, 0x6f, 0x76, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x0c, 0x6d, 0x64, 0x61, 0x74, 0x00, 0x00, 0x00, 0x00,
]);

for (const path of ['frame.png', 'motion.webp', 'preview.gif', 'video.mp4', 'video.webm', 'frames.zip']) {
  assert.equal(resolveSubmissionZipCompression(path), 'STORE', `${path} must not be recompressed inside the final ZIP.`);
}
assert.equal(resolveSubmissionZipCompression('manifest.json'), 'DEFLATE');

async function digest(bytes) {
  const result = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return Buffer.from(result).toString('hex');
}

function makeAlphaBoundsEvidence(width, height, frameCount, margin = 12) {
  const touchesCanvasEdge = margin === 0;
  const hasUsableTransparentMargin = !touchesCanvasEdge && margin >= 4;
  const frames = Array.from({ length: frameCount }, (_, frameIndex) => ({
    frameIndex,
    visiblePixelCount: Math.max(1, (width - (margin * 2)) * (height - (margin * 2))),
    bounds: {
      left: margin,
      top: margin,
      right: width - 1 - margin,
      bottom: height - 1 - margin,
    },
    transparentMargins: { left: margin, top: margin, right: margin, bottom: margin },
    minimumTransparentMarginPx: margin,
    touchesCanvasEdge,
    hasUsableTransparentMargin,
  }));
  return {
    alphaThreshold: 8,
    requiredTransparentMarginPx: 4,
    checkedFrameCount: frameCount,
    allFramesHaveVisibleContent: true,
    allFramesHaveUsableTransparentMargin: hasUsableTransparentMargin,
    edgeTouchFrameIndices: touchesCanvasEdge
      ? Array.from({ length: frameCount }, (_, frameIndex) => frameIndex)
      : [],
    insufficientMarginFrameIndices: hasUsableTransparentMargin
      ? []
      : Array.from({ length: frameCount }, (_, frameIndex) => frameIndex),
    frames,
  };
}

async function makeInspection(format, bytes, overrides = {}) {
  return {
    format,
    fileSizeBytes: bytes.byteLength,
    width: 1,
    height: 1,
    frameCount: format === 'png' ? 1 : 2,
    fps: format === 'png' ? null : 8,
    durationMs: format === 'png' ? 0 : 250,
    loop: format === 'png' ? false : !['mp4', 'webm'].includes(format),
    hasAlpha: format !== 'mp4',
    transparencyCoverage: format === 'webm' ? null : format === 'mp4' ? null : 1,
    codec: format === 'png_zip' ? 'zip+png' : format,
    sha256: await digest(bytes),
    inspectedAt: FIXED_DATE,
    inspectorVersion: 'submission-test-v1',
    passed: true,
    issues: [],
    ...overrides,
  };
}

async function makeOutput(format, url, bytes, inspectionOverrides = {}, outputOverrides = {}) {
  const contracts = {
    png: { fileName: 'emoticon.png', contentType: 'image/png' },
    webp: { fileName: 'emoticon.webp', contentType: 'image/webp' },
    gif: { fileName: 'emoticon.gif', contentType: 'image/gif' },
    mp4: { fileName: 'emoticon.mp4', contentType: 'video/mp4' },
    webm: { fileName: 'emoticon.webm', contentType: 'video/webm' },
    png_zip: { fileName: 'frames.zip', contentType: 'application/zip' },
  };
  return {
    format,
    url,
    sizeBytes: bytes.byteLength,
    inspection: await makeInspection(format, bytes, inspectionOverrides),
    ...contracts[format],
    ...outputOverrides,
  };
}

function staticItem(id, order, title, jobId = `job-${id}`) {
  return {
    id,
    order,
    title,
    jobId,
    generationStatus: 'completed',
    motion: { fps: 1, frameCount: 1, durationMs: 0 },
  };
}

function animatedItem(id, order, title, jobId = `job-${id}`) {
  return {
    id,
    order,
    title,
    jobId,
    generationStatus: 'completed',
    motion: { fps: 8, frameCount: 2, durationMs: 250 },
  };
}

function staticProject(items, overrides = {}) {
  return {
    title: '정적 이모티콘 세트',
    platform: 'custom',
    emoticonType: 'static',
    spec: { canvasWidth: 1, canvasHeight: 1, transparentBackground: false },
    items,
    ...overrides,
  };
}

function animatedProject(items, overrides = {}) {
  return {
    title: '움직이는 이모티콘 세트',
    platform: 'custom',
    emoticonType: 'animated',
    spec: { canvasWidth: 1, canvasHeight: 1, transparentBackground: false },
    items,
    ...overrides,
  };
}

function kakaoAnimatedProject(items, overrides = {}) {
  return {
    title: '카카오 애니메이션 기술 검수',
    platform: 'kakao',
    emoticonType: 'animated',
    spec: { canvasWidth: 360, canvasHeight: 360, transparentBackground: true },
    items,
    ...overrides,
  };
}

function createFetch(binaryByUrl, onFetch = () => undefined) {
  return async (input) => {
    const url = String(input);
    onFetch(url);
    const match = binaryByUrl.get(url);
    if (!match) return new Response('missing', { status: 404 });
    if (match.status && match.status !== 200) {
      return new Response(match.body || 'failed', { status: match.status });
    }
    return new Response(match.bytes, {
      status: 200,
      headers: { 'content-type': match.contentType },
    });
  };
}

async function expectPackageError(task, code, messagePattern) {
  await assert.rejects(task, (error) => {
    assert.ok(error instanceof EmoticonSubmissionPackageError);
    assert.equal(error.code, code);
    assert.match(error.message, messagePattern);
    return true;
  });
}

const kakaoTwentyFourFrameItem = {
  ...animatedItem('kakao-webp', 1, '카카오 WebP'),
  motion: { fps: 8, frameCount: 24, durationMs: 3000 },
};
const kakaoWebpUrl = 'https://files.example.test/kakao-verified.webp';
const kakaoWebpOutput = await makeOutput('webp', kakaoWebpUrl, SANE_WEBP_BYTES, {
  width: 360,
  height: 360,
  frameCount: 24,
  fps: 8,
  durationMs: 3000,
  loop: true,
  hasAlpha: true,
  transparencyCoverage: 0.35,
  alphaBoundsEvidence: makeAlphaBoundsEvidence(360, 360, 24),
});
assert.equal(emoticonOutputInspectionSchema.safeParse(kakaoWebpOutput.inspection).success, true);
const kakaoWebpPackage = await buildEmoticonSubmissionPackage({
  project: kakaoAnimatedProject([kakaoTwentyFourFrameItem]),
  preferredFormat: 'webp',
  resolveJob: async () => ({ status: 'completed', outputs: { webp: kakaoWebpOutput } }),
  fetchImpl: createFetch(new Map([[
    kakaoWebpUrl,
    { bytes: SANE_WEBP_BYTES, contentType: 'image/webp' },
  ]])),
  createdAt: FIXED_DATE,
});
assert.equal(kakaoWebpPackage.manifest.submissionCandidate, false);
assert.equal(kakaoWebpPackage.manifest.manualReviewRequired, true);
assert.equal(kakaoWebpPackage.auditReport.submissionCandidate, false);
assert.equal(kakaoWebpPackage.auditReport.manualReviewRequired, true);
assert.deepEqual(kakaoWebpPackage.manifest.platformFormatPolicy, {
  role: 'platform-reference',
  verification: 'verified',
  submissionCandidate: false,
});
assert.ok(kakaoWebpPackage.auditReport.notes.some((note) => /생성형 AI.*제한/.test(note)));

const kakaoFrameZip = new JSZip();
kakaoFrameZip.file('frames/frame-001.png', KAKAO_PNG_BYTES);
kakaoFrameZip.file('frames/frame-002.png', KAKAO_PNG_BYTES);
const kakaoFrameZipBytes = await kakaoFrameZip.generateAsync({ type: 'uint8array' });
const kakaoFrameZipUrl = 'https://files.example.test/kakao-working-frames.zip';
const kakaoFrameZipOutput = await makeOutput('png_zip', kakaoFrameZipUrl, kakaoFrameZipBytes, {
  width: 360,
  height: 360,
  frameCount: 2,
  fps: 8,
  durationMs: 250,
  loop: true,
  hasAlpha: true,
  transparencyCoverage: 0.35,
  alphaBoundsEvidence: makeAlphaBoundsEvidence(360, 360, 2, 24),
});
const kakaoWorkingPackage = await buildEmoticonSubmissionPackage({
  project: kakaoAnimatedProject([animatedItem('kakao-png-zip', 1, '카카오 작업 프레임')]),
  preferredFormat: 'png_zip',
  resolveJob: async () => ({
    status: 'completed',
    outputs: { png_zip: kakaoFrameZipOutput },
  }),
  fetchImpl: createFetch(new Map([[
    kakaoFrameZipUrl,
    { bytes: kakaoFrameZipBytes, contentType: 'application/zip' },
  ]])),
  createdAt: FIXED_DATE,
});
assert.equal(kakaoWorkingPackage.manifest.formatContract.deliveryRole, 'working-package');
assert.deepEqual(kakaoWorkingPackage.manifest.platformFormatPolicy, {
  role: 'working-output',
  verification: 'reference',
  submissionCandidate: false,
});
assert.equal(kakaoWorkingPackage.manifest.submissionCandidate, false);
assert.equal(kakaoWorkingPackage.manifest.manualReviewRequired, true);
assert.equal(kakaoWorkingPackage.auditReport.manualReviewRequired, true);
assert.ok(kakaoWorkingPackage.auditReport.notes.some((note) => note.includes('working-output')));

let kakaoRejectedWorkCount = 0;
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: kakaoAnimatedProject([animatedItem('kakao-gif', 1, '프로필 밖 형식')]),
    preferredFormat: 'gif',
    resolveJob: async () => {
      kakaoRejectedWorkCount += 1;
      return null;
    },
    fetchImpl: createFetch(new Map(), () => { kakaoRejectedWorkCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'FORMAT_MISMATCH',
  /확인된 출력 형식/,
);
assert.equal(kakaoRejectedWorkCount, 0);

await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: kakaoAnimatedProject([animatedItem('kakao-size', 1, '잘못된 캔버스')], {
      spec: { canvasWidth: 512, canvasHeight: 512, transparentBackground: true },
    }),
    preferredFormat: 'webp',
    resolveJob: async () => null,
    createdAt: FIXED_DATE,
  }),
  'DIMENSION_MISMATCH',
  /360×360/,
);

const tooManyFrames = {
  ...animatedItem('kakao-25', 1, '25프레임'),
  motion: { fps: 8, frameCount: 25, durationMs: 3125 },
};
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: kakaoAnimatedProject([tooManyFrames]),
    preferredFormat: 'webp',
    resolveJob: async () => null,
    createdAt: FIXED_DATE,
  }),
  'FRAME_MISMATCH',
  /24개/,
);

let missingBoundsFetchCount = 0;
const kakaoLegacyInspectionOutput = await makeOutput('webp', kakaoWebpUrl, SANE_WEBP_BYTES, {
  width: 360,
  height: 360,
  frameCount: 2,
  fps: 8,
  durationMs: 250,
  loop: true,
  hasAlpha: true,
  transparencyCoverage: 0.35,
});
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: kakaoAnimatedProject([animatedItem('kakao-legacy', 1, '경계 증거 없음')]),
    preferredFormat: 'webp',
    resolveJob: async () => ({ status: 'completed', outputs: { webp: kakaoLegacyInspectionOutput } }),
    fetchImpl: createFetch(new Map(), () => { missingBoundsFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'MISSING_INSPECTION',
  /알파 경계.*검사 증거/,
);
assert.equal(missingBoundsFetchCount, 0);

let edgeTouchFetchCount = 0;
const kakaoEdgeTouchOutput = await makeOutput('webp', kakaoWebpUrl, SANE_WEBP_BYTES, {
  width: 360,
  height: 360,
  frameCount: 2,
  fps: 8,
  durationMs: 250,
  loop: true,
  hasAlpha: true,
  transparencyCoverage: 0.01,
  alphaBoundsEvidence: makeAlphaBoundsEvidence(360, 360, 2, 0),
});
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: kakaoAnimatedProject([animatedItem('kakao-edge', 1, '가장자리 접촉')]),
    preferredFormat: 'webp',
    resolveJob: async () => ({ status: 'completed', outputs: { webp: kakaoEdgeTouchOutput } }),
    fetchImpl: createFetch(new Map(), () => { edgeTouchFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'INSPECTION_FAILED',
  /가장자리에 닿았거나 투명 여백이 부족/,
);
assert.equal(edgeTouchFetchCount, 0);

const secretUrlA = 'https://firebasestorage.googleapis.com/private-a?token=secret-a';
const secretUrlB = 'https://firebasestorage.googleapis.com/private-b?token=secret-b';
const secretUrlC = 'https://firebasestorage.googleapis.com/private-c?token=secret-c';
const pngOutputA = await makeOutput('png', secretUrlA, PNG_BYTES);
const pngOutputB = await makeOutput('png', secretUrlB, PNG_BYTES);
const pngOutputC = await makeOutput('png', secretUrlC, PNG_BYTES);
const pngJobs = new Map([
  ['job-a', { status: 'completed', outputs: { png: pngOutputA } }],
  ['job-b', { status: 'completed', outputs: { png: pngOutputB } }],
  ['job-c', { status: 'completed', outputs: { png: pngOutputC } }],
]);
const privacyProject = staticProject([
  staticItem('c', 2, '축하/인사', 'job-c'),
  staticItem('b', 1, '같은 제목', 'job-b'),
  staticItem('a', 1, '같은 제목', 'job-a'),
], {
  title: '공유 세트 https://private.example/project?token=hidden',
  userId: 'must-not-leak',
  sourceStoragePath: 'users/private/source.png',
  sourceImageUrl: 'https://private.example/source?token=hidden',
});
const pngFetch = createFetch(new Map([
  [secretUrlA, { bytes: PNG_BYTES, contentType: 'image/png' }],
  [secretUrlB, { bytes: PNG_BYTES, contentType: 'image/png' }],
  [secretUrlC, { bytes: PNG_BYTES, contentType: 'image/png' }],
]));
const pngPreflight = await preflightEmoticonSubmissionPackage({
  project: privacyProject,
  preferredFormat: 'png',
  resolveJob: async (item) => pngJobs.get(item.jobId),
  fetchImpl: pngFetch,
  createdAt: FIXED_DATE,
});
assert.equal(pngPreflight.contentType, 'application/zip');
assert.equal(pngPreflight.verifiedAssetBytes, PNG_BYTES.byteLength * 3);
assert.equal('arrayBuffer' in pngPreflight, false, 'Preflight must not retain or return a ZIP buffer.');
const pngPackage = await buildEmoticonSubmissionPackage({
  project: privacyProject,
  preferredFormat: 'png',
  resolveJob: async (item) => pngJobs.get(item.jobId),
  fetchImpl: pngFetch,
  createdAt: FIXED_DATE,
});
assert.equal(pngPackage.contentType, 'application/zip');
assert.match(pngPackage.fileName, /_png_submission\.zip$/);
assert.deepEqual(pngPackage.manifest.items.map((item) => item.order), [1, 1, 2]);
assert.equal(pngPackage.manifest.itemCount, 3);
assert.equal(pngPackage.manifest.assetCount, 3);
assert.equal(pngPackage.auditReport.summary.missingItems, 0);
assert.equal(pngPackage.auditReport.summary.nestedArchives, 0);
assert.ok(pngPackage.auditReport.items.every((item) => (
  item.checks.some((check) => check.code === 'server-inspection' && check.pass)
  && item.inspection.passed
)));

const unpackedPngPackage = await JSZip.loadAsync(pngPackage.arrayBuffer);
const pngFileNames = Object.values(unpackedPngPackage.files)
  .filter((entry) => !entry.dir)
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(pngFileNames, [
  '001_같은_제목.png',
  '001_같은_제목_2.png',
  '002_축하_인사.png',
  'audit-report.json',
  'manifest.json',
]);
const manifestText = await unpackedPngPackage.file('manifest.json').async('string');
const auditText = await unpackedPngPackage.file('audit-report.json').async('string');
const publicMetadata = `${manifestText}\n${auditText}`;
assert.doesNotMatch(publicMetadata, /https?:\/\//i);
assert.doesNotMatch(publicMetadata, /firebasestorage|storagePath|downloadURL|\buserId\b|secret-/i);
const parsedManifest = JSON.parse(manifestText);
assert.equal(parsedManifest.preferredFormat, 'png');
assert.equal(parsedManifest.submissionCandidate, false);
assert.equal(parsedManifest.formatContract.alphaCapability, 'supported');
assert.equal(parsedManifest.formatContract.submissionCandidate, false);
assert.ok(parsedManifest.items.every((item) => item.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))));

const mp4Url = 'https://files.example.test/distribution.mp4';
const mp4Output = await makeOutput('mp4', mp4Url, MP4_BYTES);
const mp4Package = await buildEmoticonSubmissionPackage({
  project: animatedProject([animatedItem('mp4-item', 1, 'MP4 배포본', 'mp4-job')]),
  preferredFormat: 'mp4',
  resolveJob: async () => ({ status: 'completed', outputs: { mp4: mp4Output } }),
  fetchImpl: createFetch(new Map([[
    mp4Url,
    { bytes: MP4_BYTES, contentType: 'video/mp4' },
  ]])),
  createdAt: FIXED_DATE,
});
assert.equal(mp4Package.manifest.submissionCandidate, false);
assert.equal(mp4Package.auditReport.submissionCandidate, false);
assert.equal(mp4Package.manifest.formatContract.alphaCapability, 'unsupported');
assert.equal(mp4Package.manifest.formatContract.transparentSourceHandling, 'flatten-to-opaque');
assert.equal(mp4Package.manifest.formatContract.deliveryRole, 'distribution-copy');
assert.ok(mp4Package.auditReport.notes.some((note) => note.includes('알파 채널을 지원하지 않아')));
assert.ok(mp4Package.auditReport.items[0].checks.some((check) => check.code === 'format-capability'));

let impossibleMp4AlphaFetchCount = 0;
const impossibleMp4AlphaOutput = await makeOutput('mp4', mp4Url, MP4_BYTES, {
  hasAlpha: true,
  transparencyCoverage: 0.5,
});
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: animatedProject([animatedItem('mp4-alpha', 1, '잘못된 MP4 알파', 'mp4-alpha-job')]),
    preferredFormat: 'mp4',
    resolveJob: async () => ({
      status: 'completed',
      outputs: { mp4: impossibleMp4AlphaOutput },
    }),
    fetchImpl: createFetch(new Map(), () => { impossibleMp4AlphaFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'METADATA_MISMATCH',
  /알파 검사값.*mp4 출력 계약/,
);
assert.equal(impossibleMp4AlphaFetchCount, 0);

const sourceFrameZip = new JSZip();
sourceFrameZip.file('frames/frame-001.png', PNG_BYTES);
sourceFrameZip.file('frames/frame-002.png', PNG_BYTES);
sourceFrameZip.file('sprite-sheet.png', PNG_BYTES);
sourceFrameZip.file('animation-plan.json', JSON.stringify({ internal: true }));
const sourceFrameBytes = await sourceFrameZip.generateAsync({ type: 'uint8array' });
const frameUrl = 'https://files.example.test/frames.zip';
const frameOutput = await makeOutput('png_zip', frameUrl, sourceFrameBytes);
const framePackage = await buildEmoticonSubmissionPackage({
  project: animatedProject([animatedItem('frame-item', 1, '달리기', 'frame-job')]),
  preferredFormat: 'png_zip',
  resolveJob: async () => ({ status: 'completed', outputs: { png_zip: frameOutput } }),
  fetchImpl: createFetch(new Map([
    [frameUrl, { bytes: sourceFrameBytes, contentType: 'application/zip' }],
  ])),
  createdAt: FIXED_DATE,
});
const unpackedFrames = await JSZip.loadAsync(framePackage.arrayBuffer);
const frameFileNames = Object.values(unpackedFrames.files)
  .filter((entry) => !entry.dir)
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(frameFileNames, [
  'audit-report.json',
  'frames/001_달리기/frame-001.png',
  'frames/001_달리기/frame-002.png',
  'manifest.json',
]);
assert.ok(frameFileNames.every((name) => !name.toLowerCase().endsWith('.zip')));
assert.equal(framePackage.manifest.items[0].files.length, 2);
assert.equal(framePackage.auditReport.items[0].checks.at(-1).code, 'archive-flattened');

let missingOutputFetchCount = 0;
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([staticItem('missing', 1, '누락', 'job-missing')]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: {} }),
    fetchImpl: createFetch(new Map(), () => { missingOutputFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'MISSING_OUTPUT',
  /png 결과가 없습니다/,
);
assert.equal(missingOutputFetchCount, 0);

let missingInspectionFetchCount = 0;
const noInspectionOutput = { ...pngOutputA, inspection: undefined };
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([staticItem('no-inspection', 1, '검수 누락')]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: { png: noInspectionOutput } }),
    fetchImpl: createFetch(new Map(), () => { missingInspectionFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'MISSING_INSPECTION',
  /서버 출력 검수 정보가 없습니다/,
);
assert.equal(missingInspectionFetchCount, 0);

let failedInspectionFetchCount = 0;
const failedInspectionOutput = await makeOutput('png', secretUrlA, PNG_BYTES, {
  passed: false,
  issues: ['Server decoder rejected the output.'],
});
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([staticItem('failed-inspection', 1, '검수 실패')]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: { png: failedInspectionOutput } }),
    fetchImpl: createFetch(new Map(), () => { failedInspectionFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'INSPECTION_FAILED',
  /서버 출력 검수를 통과하지 못했습니다/,
);
assert.equal(failedInspectionFetchCount, 0);

let dimensionFetchCount = 0;
const wrongDimensionOutput = await makeOutput('png', secretUrlA, PNG_BYTES, { width: 2 });
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([staticItem('dimension', 1, '크기 불일치')]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: { png: wrongDimensionOutput } }),
    fetchImpl: createFetch(new Map(), () => { dimensionFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'DIMENSION_MISMATCH',
  /실제 캔버스/,
);
assert.equal(dimensionFetchCount, 0);

let frameMismatchFetchCount = 0;
const wrongFrameOutput = await makeOutput('png_zip', frameUrl, sourceFrameBytes, { frameCount: 3 });
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: animatedProject([animatedItem('frame-mismatch', 1, '프레임 불일치')]),
    preferredFormat: 'png_zip',
    resolveJob: async () => ({ status: 'completed', outputs: { png_zip: wrongFrameOutput } }),
    fetchImpl: createFetch(new Map(), () => { frameMismatchFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'FRAME_MISMATCH',
  /실제 프레임 수/,
);
assert.equal(frameMismatchFetchCount, 0);

const oneFrameZip = new JSZip();
oneFrameZip.file('frames/frame-001.png', PNG_BYTES);
const oneFrameZipBytes = await oneFrameZip.generateAsync({ type: 'uint8array' });
const oneFrameZipUrl = 'https://files.example.test/one-frame.zip';
const oneFrameOutput = await makeOutput('png_zip', oneFrameZipUrl, oneFrameZipBytes);
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: animatedProject([animatedItem('actual-frame-mismatch', 1, '실제 프레임 불일치')]),
    preferredFormat: 'png_zip',
    resolveJob: async () => ({ status: 'completed', outputs: { png_zip: oneFrameOutput } }),
    fetchImpl: createFetch(new Map([[
      oneFrameZipUrl,
      { bytes: oneFrameZipBytes, contentType: 'application/zip' },
    ]])),
    createdAt: FIXED_DATE,
  }),
  'FRAME_MISMATCH',
  /실제 프레임 1개.*설정 2개/,
);

let mismatchedFormatFetchCount = 0;
const mismatchedOutput = await makeOutput('gif', 'https://files.example.test/wrong.gif', PNG_BYTES);
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([staticItem('mismatch', 1, '형식 불일치')]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: { png: mismatchedOutput } }),
    fetchImpl: createFetch(new Map(), () => { mismatchedFormatFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'FORMAT_MISMATCH',
  /요청한 png과 다릅니다/,
);
assert.equal(mismatchedFormatFetchCount, 0);

const failingUrl = 'https://files.example.test/fails.png';
const failingOutput = await makeOutput('png', failingUrl, PNG_BYTES);
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([staticItem('failure', 1, '실패 항목')]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: { png: failingOutput } }),
    fetchImpl: createFetch(new Map([[failingUrl, { status: 503, body: 'unavailable' }]])),
    createdAt: FIXED_DATE,
  }),
  'DOWNLOAD_FAILED',
  /HTTP 503/,
);

const hashUrl = 'https://files.example.test/hash.png';
const hashMismatchOutput = await makeOutput('png', hashUrl, PNG_BYTES, { sha256: '0'.repeat(64) });
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([staticItem('hash', 1, '해시 불일치')]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: { png: hashMismatchOutput } }),
    fetchImpl: createFetch(new Map([[hashUrl, { bytes: PNG_BYTES, contentType: 'image/png' }]])),
    createdAt: FIXED_DATE,
  }),
  'HASH_MISMATCH',
  /SHA-256/,
);

const truncatedPngUrl = 'https://files.example.test/truncated.png';
const truncatedPngOutput = await makeOutput('png', truncatedPngUrl, TRUNCATED_PNG_BYTES);
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([staticItem('truncated-png', 1, '잘린 PNG')]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: { png: truncatedPngOutput } }),
    fetchImpl: createFetch(new Map([[truncatedPngUrl, { bytes: TRUNCATED_PNG_BYTES, contentType: 'image/png' }]])),
    createdAt: FIXED_DATE,
  }),
  'INVALID_FILE_STRUCTURE',
  /IHDR·IDAT·IEND/,
);

const invalidIhdrUrl = 'https://files.example.test/invalid-ihdr-length.png';
const invalidIhdrOutput = await makeOutput('png', invalidIhdrUrl, INVALID_IHDR_LENGTH_PNG_BYTES);
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([staticItem('invalid-ihdr', 1, '잘못된 IHDR 길이')]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: { png: invalidIhdrOutput } }),
    fetchImpl: createFetch(new Map([[
      invalidIhdrUrl,
      { bytes: INVALID_IHDR_LENGTH_PNG_BYTES, contentType: 'image/png' },
    ]])),
    createdAt: FIXED_DATE,
  }),
  'INVALID_FILE_STRUCTURE',
  /IHDR·IDAT·IEND/,
);

const truncatedWebpUrl = 'https://files.example.test/truncated.webp';
const truncatedWebpOutput = await makeOutput('webp', truncatedWebpUrl, TRUNCATED_WEBP_BYTES);
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: animatedProject([animatedItem('truncated-webp', 1, '잘린 WebP')]),
    preferredFormat: 'webp',
    resolveJob: async () => ({ status: 'completed', outputs: { webp: truncatedWebpOutput } }),
    fetchImpl: createFetch(new Map([[truncatedWebpUrl, { bytes: TRUNCATED_WEBP_BYTES, contentType: 'image/webp' }]])),
    createdAt: FIXED_DATE,
  }),
  'INVALID_FILE_STRUCTURE',
  /RIFF 선언 길이|이미지 청크/,
);

const nestedSourceZip = new JSZip();
nestedSourceZip.file('frames/frame-001.png', PNG_BYTES);
nestedSourceZip.file('frames/frame-002.png', PNG_BYTES);
nestedSourceZip.file('nested.zip', Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));
const nestedBytes = await nestedSourceZip.generateAsync({ type: 'uint8array' });
const nestedUrl = 'https://files.example.test/nested.zip';
const nestedOutput = await makeOutput('png_zip', nestedUrl, nestedBytes);
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: animatedProject([animatedItem('nested', 1, '중첩')]),
    preferredFormat: 'png_zip',
    resolveJob: async () => ({ status: 'completed', outputs: { png_zip: nestedOutput } }),
    fetchImpl: createFetch(new Map([[nestedUrl, { bytes: nestedBytes, contentType: 'application/zip' }]])),
    createdAt: FIXED_DATE,
  }),
  'INVALID_ARCHIVE',
  /또 다른 ZIP/,
);

let oversizedFetchCount = 0;
const oversizedBytes = 40 * 1024 * 1024;
const oversizedInspection = {
  ...(await makeInspection('png', PNG_BYTES)),
  fileSizeBytes: oversizedBytes,
};
const oversizedOutput = {
  format: 'png',
  url: 'https://files.example.test/oversized.png',
  fileName: 'oversized.png',
  contentType: 'image/png',
  sizeBytes: oversizedBytes,
  inspection: oversizedInspection,
};
await expectPackageError(
  () => buildEmoticonSubmissionPackage({
    project: staticProject([
      staticItem('large-a', 1, '큰 파일 1'),
      staticItem('large-b', 2, '큰 파일 2'),
    ]),
    preferredFormat: 'png',
    resolveJob: async () => ({ status: 'completed', outputs: { png: oversizedOutput } }),
    fetchImpl: createFetch(new Map(), () => { oversizedFetchCount += 1; }),
    createdAt: FIXED_DATE,
  }),
  'SIZE_LIMIT_EXCEEDED',
  /총 용량|안전 한도/,
);
assert.equal(oversizedFetchCount, 0, 'Declared package size must fail before downloads start.');

let activeFetches = 0;
let maximumActiveFetches = 0;
const concurrentItems = Array.from({ length: 7 }, (_, index) => (
  staticItem(`concurrent-${index + 1}`, index + 1, `동시성 ${index + 1}`)
));
const concurrentOutput = await makeOutput('png', 'https://files.example.test/concurrent.png', PNG_BYTES);
const concurrencyFetch = async () => {
  activeFetches += 1;
  maximumActiveFetches = Math.max(maximumActiveFetches, activeFetches);
  await new Promise((resolve) => setTimeout(resolve, 8));
  activeFetches -= 1;
  return new Response(PNG_BYTES, { status: 200, headers: { 'content-type': 'image/png' } });
};
await buildEmoticonSubmissionPackage({
  project: staticProject(concurrentItems),
  preferredFormat: 'png',
  resolveJob: async () => ({ status: 'completed', outputs: { png: concurrentOutput } }),
  fetchImpl: concurrencyFetch,
  createdAt: FIXED_DATE,
});
assert.ok(maximumActiveFetches > 1, 'Binary downloads should still run in parallel.');
assert.ok(maximumActiveFetches <= 4, 'Binary download concurrency must stay at or below four.');

console.log('Emoticon submission package checks passed.');
