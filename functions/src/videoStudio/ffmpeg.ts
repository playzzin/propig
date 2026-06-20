import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export type StudioAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';
export type StudioResolution = '480p' | '720p';

type MergeVideoInput = {
    url: string;
};

function getFfmpegBinaryPath(): string {
    if (!ffmpegPath) {
        throw new Error('FFmpeg binary is unavailable. Install ffmpeg-static before using media processing.');
    }

    return ffmpegPath;
}

async function runFfmpeg(args: string[]): Promise<void> {
    const binary = getFfmpegBinaryPath();

    await new Promise<void>((resolve, reject) => {
        const child = spawn(binary, args, {
            windowsHide: true,
        });

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

async function withTempDir<T>(prefix: string, task: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), prefix));

    try {
        return await task(dir);
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function downloadRemoteFile(url: string, targetPath: string): Promise<void> {
    const response = await fetch(url, {
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`Failed to download media asset. HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await writeFile(targetPath, Buffer.from(arrayBuffer));
}

export function getVideoCanvasSize(
    aspectRatio: StudioAspectRatio = '16:9',
    resolution: StudioResolution = '720p',
): { width: number; height: number } {
    const isHd = resolution === '720p';

    switch (aspectRatio) {
        case '9:16':
            return isHd ? { width: 720, height: 1280 } : { width: 480, height: 854 };
        case '1:1':
            return isHd ? { width: 720, height: 720 } : { width: 480, height: 480 };
        case '4:3':
            return isHd ? { width: 960, height: 720 } : { width: 640, height: 480 };
        case '3:4':
            return isHd ? { width: 720, height: 960 } : { width: 480, height: 640 };
        case '3:2':
            return isHd ? { width: 1080, height: 720 } : { width: 720, height: 480 };
        case '2:3':
            return isHd ? { width: 720, height: 1080 } : { width: 480, height: 720 };
        case '16:9':
        default:
            return isHd ? { width: 1280, height: 720 } : { width: 854, height: 480 };
    }
}

export async function extractVideoFrame(params: {
    videoUrl: string;
    position?: 'first' | 'last';
    timeSec?: number;
}): Promise<Buffer> {
    return withTempDir('video-frame-', async (dir) => {
        const inputPath = join(dir, 'input.mp4');
        const outputPath = join(dir, 'frame.png');

        await downloadRemoteFile(params.videoUrl, inputPath);

        const args = ['-y'];

        if (typeof params.timeSec === 'number' && Number.isFinite(params.timeSec)) {
            args.push('-ss', String(Math.max(0, params.timeSec)));
        } else if (params.position === 'last') {
            args.push('-sseof', '-0.15');
        }

        args.push('-i', inputPath, '-frames:v', '1', outputPath);

        await runFfmpeg(args);
        return readFile(outputPath);
    });
}

export async function mergeVideos(params: {
    clips: MergeVideoInput[];
    aspectRatio?: StudioAspectRatio;
    resolution?: StudioResolution;
    fps?: number;
}): Promise<Buffer> {
    if (params.clips.length === 0) {
        throw new Error('At least one clip is required for merging.');
    }

    const fps = params.fps ?? 30;
    const { width, height } = getVideoCanvasSize(params.aspectRatio, params.resolution);

    return withTempDir('video-merge-', async (dir) => {
        const inputPaths: string[] = [];

        for (let index = 0; index < params.clips.length; index += 1) {
            const inputPath = join(dir, `input-${index}.mp4`);
            await downloadRemoteFile(params.clips[index].url, inputPath);
            inputPaths.push(inputPath);
        }

        const outputPath = join(dir, 'merged.mp4');
        const inputArgs = inputPaths.flatMap((inputPath) => ['-i', inputPath]);

        let args: string[];

        if (inputPaths.length === 1) {
            args = [
                '-y',
                ...inputArgs,
                '-vf',
                `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps},format=yuv420p,setsar=1`,
                '-an',
                '-c:v',
                'libx264',
                '-preset',
                'veryfast',
                '-crf',
                '20',
                '-movflags',
                '+faststart',
                '-pix_fmt',
                'yuv420p',
                outputPath,
            ];
        } else {
            const graphLines = inputPaths.map(
                (_, index) =>
                    `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps},format=yuv420p,setsar=1[v${index}]`,
            );
            const concatInputs = inputPaths.map((_, index) => `[v${index}]`).join('');
            const filterComplex = `${graphLines.join(';')};${concatInputs}concat=n=${inputPaths.length}:v=1:a=0[outv]`;

            args = [
                '-y',
                ...inputArgs,
                '-filter_complex',
                filterComplex,
                '-map',
                '[outv]',
                '-an',
                '-c:v',
                'libx264',
                '-preset',
                'veryfast',
                '-crf',
                '20',
                '-movflags',
                '+faststart',
                '-pix_fmt',
                'yuv420p',
                outputPath,
            ];
        }

        await runFfmpeg(args);
        return readFile(outputPath);
    });
}
