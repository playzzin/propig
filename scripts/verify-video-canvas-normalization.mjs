import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static");
const {
  PROVIDER_CANVAS_DIMENSION_TOLERANCE_PIXELS,
  inspectVideoBufferQuality,
  normalizeVideoBufferToCanvas,
} = require("../functions/lib/videoStudio/ffmpeg.js");

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-600)}`));
    });
  });
}

const target = { width: 854, height: 480 };
const workspace = await mkdtemp(join(tmpdir(), "propig-video-canvas-"));

try {
  const providerOutputPath = join(workspace, "provider-macroblock.mp4");
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=864x496:rate=30",
    "-t",
    "1",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    providerOutputPath,
  ]);

  const providerBuffer = await readFile(providerOutputPath);
  const providerInspection = await inspectVideoBufferQuality(providerBuffer, {
    expectedWidth: target.width,
    expectedHeight: target.height,
    expectedAspectRatio: target.width / target.height,
    dimensionTolerancePixels: PROVIDER_CANVAS_DIMENSION_TOLERANCE_PIXELS,
  });
  assert.ok(
    providerInspection.passed,
    `A codec-aligned provider frame should stay eligible for normalization: ${JSON.stringify(providerInspection.issues)}`,
  );

  const normalizedBuffer = await normalizeVideoBufferToCanvas({
    buffer: providerBuffer,
    ...target,
  });
  const normalizedInspection = await inspectVideoBufferQuality(
    normalizedBuffer,
    {
      expectedWidth: target.width,
      expectedHeight: target.height,
      expectedAspectRatio: target.width / target.height,
      dimensionTolerancePixels: 0,
    },
  );
  assert.ok(
    normalizedInspection.passed,
    `Normalized provider frame must match the storyboard canvas exactly: ${JSON.stringify(normalizedInspection.issues)}`,
  );

  console.log(
    `Video canvas normalization verified: ${providerInspection.width}x${providerInspection.height} → ${normalizedInspection.width}x${normalizedInspection.height}`,
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}
