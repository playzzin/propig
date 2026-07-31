import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import {
  inspectVideoBufferQuality,
  mergeVideos,
} from "../functions/src/videoStudio/ffmpeg.ts";

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `FFmpeg exited with ${code}`));
    });
  });
}

const directory = await mkdtemp(join(tmpdir(), "storyboard-transition-check-"));
const redPath = join(directory, "red.mp4");
const bluePath = join(directory, "blue.mp4");

try {
  await Promise.all([
    runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=640x360:d=1.5:r=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1.5:sample_rate=48000",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      redPath,
    ]),
    runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=640x360:d=1.5:r=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:duration=1.5:sample_rate=48000",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      bluePath,
    ]),
  ]);

  const server = createServer(async (request, response) => {
    const filePath = request.url === "/blue.mp4" ? bluePath : redPath;
    response.writeHead(200, { "Content-Type": "video/mp4" });
    response.end(await readFile(filePath));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const merged = await mergeVideos({
      clips: [
        {
          url: `${baseUrl}/red.mp4`,
          transitionStyle: "crossfade",
          transitionSeconds: 0.35,
        },
        { url: `${baseUrl}/blue.mp4`, transitionStyle: "cut" },
      ],
      aspectRatio: "16:9",
      resolution: "480p",
      fps: 30,
    });
    const inspection = await inspectVideoBufferQuality(merged, {
      expectedDurationSeconds: 2.65,
      durationToleranceSeconds: 0.3,
      expectedWidth: 854,
      expectedHeight: 480,
      requireAudibleAudio: true,
      maxBlackFrameRatio: 0.02,
    });

    assert.equal(
      inspection.passed,
      true,
      inspection.issues.map((issue) => issue.message).join("\n"),
    );
    assert.ok(
      inspection.durationSeconds &&
        inspection.durationSeconds > 2.4 &&
        inspection.durationSeconds < 2.9,
      `Expected overlap duration around 2.65s, received ${inspection.durationSeconds}`,
    );
    assert.equal(inspection.audio.hasAudibleAudio, true);
    assert.ok(
      inspection.blackFrameRatio === null ||
        inspection.blackFrameRatio <= 0.02,
      `Unexpected black transition ratio: ${inspection.blackFrameRatio}`,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Storyboard overlap transition assembly verified.");
