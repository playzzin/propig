import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');
const {
  extractVideoFrame,
  inspectVideoBufferAudio,
  inspectVideoBufferQuality,
  inspectFfmpegRuntime,
  mergeVideos,
  resolveFfmpegBinaryPath,
  videoBufferHasAudio,
} = require('../functions/lib/videoStudio/ffmpeg.js');

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `FFmpeg exited with code ${code}`));
    });
  });
}

function inspect(binary, filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-hide_banner', '-i', filePath], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', () => resolve(stderr));
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

const tempDir = await mkdtemp(join(tmpdir(), 'propig-ffmpeg-verify-'));
let server;

try {
  const firstVideo = join(tempDir, 'first.mp4');
  const secondVideo = join(tempDir, 'second.mp4');
  const silentTrackVideo = join(tempDir, 'silent-track.mp4');
  const blackVideo = join(tempDir, 'black.mp4');

  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x0f766e:s=320x180:d=0.6',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000:duration=0.6',
    '-shortest',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-pix_fmt',
    'yuv420p',
    firstVideo,
  ]);
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x1d4ed8:s=320x180:d=0.6',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    secondVideo,
  ]);
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x334155:s=320x180:d=0.6',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-shortest',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-pix_fmt',
    'yuv420p',
    silentTrackVideo,
  ]);
  await run(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=320x180:d=0.6',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    blackVideo,
  ]);

  const files = new Map([
    ['/first.mp4', firstVideo],
    ['/second.mp4', secondVideo],
    ['/silent-track.mp4', silentTrackVideo],
  ]);
  server = createServer(async (request, response) => {
    const filePath = files.get(request.url || '');
    if (!filePath) {
      response.writeHead(404).end();
      return;
    }

    const metadata = await stat(filePath);
    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': metadata.size,
    });
    createReadStream(filePath).pipe(response);
  });
  await listen(server);

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Verification server did not expose a TCP port.');
  }

  const invalidBundledPath = process.platform === 'win32'
    ? '\\ROOT\\node_modules\\ffmpeg-static\\ffmpeg.exe'
    : '/ROOT/node_modules/ffmpeg-static/ffmpeg';
  const recoveredPath = resolveFfmpegBinaryPath(invalidBundledPath);
  if (!existsSync(recoveredPath)) {
    throw new Error(`Recovered FFmpeg path does not exist: ${recoveredPath}`);
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const firstSource = await readFile(firstVideo);
  const secondSource = await readFile(secondVideo);
  const silentTrackSource = await readFile(silentTrackVideo);
  const blackSource = await readFile(blackVideo);
  const runtimeInspection = await inspectFfmpegRuntime();
  if (!runtimeInspection.ok || !runtimeInspection.version) {
    throw new Error(`FFmpeg runtime inspection failed: ${runtimeInspection.message}`);
  }
  if (!(await videoBufferHasAudio(firstSource))) {
    throw new Error('Audio stream validation rejected a clip with audio.');
  }
  if (await videoBufferHasAudio(secondSource)) {
    throw new Error('Audio stream validation accepted a silent clip.');
  }
  const audibleInspection = await inspectVideoBufferAudio(firstSource);
  const missingInspection = await inspectVideoBufferAudio(secondSource);
  const silentTrackInspection = await inspectVideoBufferAudio(silentTrackSource);
  if (!audibleInspection.hasAudibleAudio) {
    throw new Error('Audio loudness validation rejected an audible clip.');
  }
  if (missingInspection.hasAudioStream || missingInspection.hasAudibleAudio) {
    throw new Error('Audio loudness validation accepted a clip without an audio stream.');
  }
  if (!silentTrackInspection.hasAudioStream || silentTrackInspection.hasAudibleAudio) {
    throw new Error('Audio loudness validation failed to distinguish an inaudible audio track.');
  }
  const sourceQuality = await inspectVideoBufferQuality(firstSource, {
    expectedDurationSeconds: 0.6,
    durationToleranceSeconds: 0.2,
    expectedWidth: 320,
    expectedHeight: 180,
    expectedAspectRatio: 16 / 9,
    requireAudibleAudio: true,
    maxBlackFrameRatio: 0.1,
  });
  if (!sourceQuality.passed) {
    throw new Error(`Video quality validation rejected a valid clip: ${JSON.stringify(sourceQuality.issues)}`);
  }
  const silentQuality = await inspectVideoBufferQuality(silentTrackSource, {
    requireAudibleAudio: true,
  });
  if (silentQuality.passed || !silentQuality.issues.some((issue) => issue.code === 'inaudible_audio')) {
    throw new Error('Video quality validation accepted an inaudible audio track.');
  }
  const blackQuality = await inspectVideoBufferQuality(blackSource, {
    maxBlackFrameRatio: 0.1,
  });
  if (blackQuality.passed || !blackQuality.issues.some((issue) => issue.code === 'excessive_black_frames')) {
    throw new Error('Video quality validation accepted an all-black clip.');
  }

  const frame = await extractVideoFrame({
    videoUrl: `${baseUrl}/first.mp4`,
    position: 'last',
  });
  if (!frame.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error('Frame extraction did not return a PNG.');
  }

  const merged = await mergeVideos({
    clips: [
      {
        url: `${baseUrl}/first.mp4`,
        trimStartSeconds: 0.1,
        playbackRate: 1.1,
        audioVolume: 0.85,
        transitionStyle: 'fade',
        transitionSeconds: 0.1,
      },
      {
        url: `${baseUrl}/second.mp4`,
        trimEndSeconds: 0.1,
        playbackRate: 0.9,
        transitionStyle: 'cut',
      },
    ],
    aspectRatio: '16:9',
    resolution: '480p',
    fps: 24,
    backgroundMusicUrl: `${baseUrl}/first.mp4`,
    backgroundMusicVolume: 0.08,
    sceneAudioVolume: 0.9,
    audioCrossfadeSeconds: 0.2,
  });
  if (merged.subarray(4, 8).toString('ascii') !== 'ftyp') {
    throw new Error('Video merge did not return an MP4.');
  }
  const mergedPath = join(tempDir, 'merged.mp4');
  await writeFile(mergedPath, merged);
  const mergedMetadata = await inspect(ffmpegPath, mergedPath);
  if (!/Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Audio:/i.test(mergedMetadata)) {
    throw new Error('Merged video did not preserve or normalize an audio stream.');
  }
  const mergedQuality = await inspectVideoBufferQuality(merged, {
    expectedWidth: 854,
    expectedHeight: 480,
    expectedAspectRatio: 16 / 9,
    requireAudibleAudio: true,
    maxBlackFrameRatio: 0.1,
  });
  if (!mergedQuality.passed) {
    throw new Error(`Merged video quality validation failed: ${JSON.stringify(mergedQuality.issues)}`);
  }

  console.log(JSON.stringify({
    recoveredPath,
    ffmpegVersion: runtimeInspection.version,
    sourceBytes: firstSource.length,
    frameBytes: frame.length,
    mergedBytes: merged.length,
    mergedHasAudio: true,
    audibleInspection,
    silentTrackInspection,
    sourceQuality,
    blackQuality,
    mergedQuality,
  }));
} finally {
  if (server) await close(server);
  await rm(tempDir, { recursive: true, force: true });
}

console.log('FFmpeg runtime verification passed');
