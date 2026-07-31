import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, sep } from 'path';

export type StudioAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';
export type StudioResolution = '480p' | '720p' | '1080p';
export type AudioMixPreset = 'dialogue-first' | 'balanced' | 'music-first' | 'custom';

export type MergeVideoInput = {
    url: string;
    trimStartSeconds?: number;
    trimEndSeconds?: number;
    playbackRate?: number;
    audioVolume?: number;
    transitionStyle?: 'cut' | 'crossfade' | 'match-cut' | 'bridge';
    transitionSeconds?: number;
};

export type VideoAudioInspection = {
    hasAudioStream: boolean;
    hasAudibleAudio: boolean;
    meanVolumeDb: number | null;
    maxVolumeDb: number | null;
};

export type VideoQualityIssueCode =
    | 'missing_video_stream'
    | 'invalid_duration'
    | 'duration_mismatch'
    | 'resolution_mismatch'
    | 'aspect_ratio_mismatch'
    | 'missing_audio_stream'
    | 'inaudible_audio'
    | 'excessive_black_frames';

export type VideoQualityInspection = {
    passed: boolean;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    fps: number | null;
    hasVideoStream: boolean;
    audio: VideoAudioInspection;
    blackFrameDurationSeconds: number;
    blackFrameRatio: number | null;
    issues: Array<{
        code: VideoQualityIssueCode;
        message: string;
    }>;
};

export type VideoQualityRequirements = {
    expectedDurationSeconds?: number;
    durationToleranceSeconds?: number;
    expectedWidth?: number;
    expectedHeight?: number;
    dimensionTolerancePixels?: number;
    expectedAspectRatio?: number;
    aspectRatioTolerance?: number;
    requireAudibleAudio?: boolean;
    maxBlackFrameRatio?: number;
};

const MIN_AUDIBLE_MEAN_VOLUME_DB = -65;
const MIN_AUDIBLE_MAX_VOLUME_DB = -50;

type BackgroundMusicMixProfile = {
    threshold: number;
    ratio: number;
    attackMs: number;
    releaseMs: number;
};

const BACKGROUND_MUSIC_MIX_PROFILES: Record<Exclude<AudioMixPreset, 'custom'>, BackgroundMusicMixProfile> = {
    'dialogue-first': { threshold: 0.018, ratio: 12, attackMs: 12, releaseMs: 420 },
    balanced: { threshold: 0.028, ratio: 7, attackMs: 18, releaseMs: 360 },
    'music-first': { threshold: 0.04, ratio: 3.5, attackMs: 24, releaseMs: 280 },
};

export function resolveBackgroundMusicMixProfile(
    preset: AudioMixPreset | undefined,
): BackgroundMusicMixProfile {
    return BACKGROUND_MUSIC_MIX_PROFILES[preset === 'custom' || !preset ? 'balanced' : preset];
}

export function resolveFfmpegBinaryPath(reportedPath: string | null = ffmpegPath): string {
    const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const configuredPath = process.env.FFMPEG_BIN?.trim();
    if (configuredPath) return configuredPath;

    const bundledPath = reportedPath?.trim();
    if (bundledPath) {
        const rootRelativeMatch = bundledPath.match(/^[\\/]+ROOT[\\/]+(.+)$/i);
        if (rootRelativeMatch) {
            const relativePath = rootRelativeMatch[1].replace(/[\\/]+/g, sep);
            return `${process.cwd()}${sep}${relativePath}`;
        }
        return bundledPath;
    }

    return join(process.cwd(), 'node_modules', 'ffmpeg-static', executableName);
}

async function runFfmpeg(args: string[]): Promise<void> {
    const binary = resolveFfmpegBinaryPath();

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

async function hasAudioStream(inputPath: string): Promise<boolean> {
    const binary = resolveFfmpegBinaryPath();
    const stderr = await new Promise<string>((resolve, reject) => {
        const child = spawn(binary, ['-hide_banner', '-i', inputPath], {
            windowsHide: true,
        });
        let output = '';
        child.stderr.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', () => resolve(output));
    });
    return /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Audio:/i.test(stderr);
}

async function getMediaDuration(inputPath: string): Promise<number> {
    const binary = resolveFfmpegBinaryPath();
    const stderr = await new Promise<string>((resolve, reject) => {
        const child = spawn(binary, ['-hide_banner', '-i', inputPath], { windowsHide: true });
        let output = '';
        child.stderr.on('data', (chunk) => { output += chunk.toString(); });
        child.on('error', reject);
        child.on('close', () => resolve(output));
    });
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) throw new Error('Could not determine video duration for final editing.');
    return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
}

async function inspectAudioLoudness(inputPath: string): Promise<VideoAudioInspection> {
    const hasStream = await hasAudioStream(inputPath);
    if (!hasStream) {
        return {
            hasAudioStream: false,
            hasAudibleAudio: false,
            meanVolumeDb: null,
            maxVolumeDb: null,
        };
    }

    const binary = resolveFfmpegBinaryPath();
    const stderr = await new Promise<string>((resolve, reject) => {
        const child = spawn(binary, [
            '-hide_banner',
            '-i',
            inputPath,
            '-map',
            '0:a:0',
            '-af',
            'volumedetect',
            '-f',
            'null',
            '-',
        ], {
            windowsHide: true,
        });
        let output = '';
        child.stderr.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', () => resolve(output));
    });
    const parseVolume = (label: 'mean_volume' | 'max_volume') => {
        const match = stderr.match(new RegExp(`${label}:\\s*(-?\\d+(?:\\.\\d+)?|-inf)\\s*dB`, 'i'));
        if (!match || match[1].toLowerCase() === '-inf') return null;
        const value = Number(match[1]);
        return Number.isFinite(value) ? value : null;
    };
    const meanVolumeDb = parseVolume('mean_volume');
    const maxVolumeDb = parseVolume('max_volume');

    return {
        hasAudioStream: true,
        hasAudibleAudio: meanVolumeDb !== null
            && maxVolumeDb !== null
            && meanVolumeDb > MIN_AUDIBLE_MEAN_VOLUME_DB
            && maxVolumeDb > MIN_AUDIBLE_MAX_VOLUME_DB,
        meanVolumeDb,
        maxVolumeDb,
    };
}

async function captureFfmpegStderr(args: string[]): Promise<string> {
    const binary = resolveFfmpegBinaryPath();
    return new Promise<string>((resolve, reject) => {
        const child = spawn(binary, args, { windowsHide: true });
        let output = '';
        child.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', () => resolve(output));
    });
}

function parseVideoMetadata(stderr: string): {
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    fps: number | null;
    hasVideoStream: boolean;
} {
    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
    const videoLine = stderr
        .split(/\r?\n/)
        .find((line) => /Stream #\d+:\d+.*Video:/i.test(line));
    const dimensionMatch = videoLine?.match(/\b(\d{2,5})x(\d{2,5})\b/);
    const fpsMatch = videoLine?.match(/\b(\d+(?:\.\d+)?)\s+fps\b/i);
    const durationSeconds = durationMatch
        ? (Number(durationMatch[1]) * 3600)
            + (Number(durationMatch[2]) * 60)
            + Number(durationMatch[3])
        : null;

    return {
        durationSeconds:
            durationSeconds !== null && Number.isFinite(durationSeconds)
                ? durationSeconds
                : null,
        width: dimensionMatch ? Number(dimensionMatch[1]) : null,
        height: dimensionMatch ? Number(dimensionMatch[2]) : null,
        fps: fpsMatch ? Number(fpsMatch[1]) : null,
        hasVideoStream: Boolean(videoLine),
    };
}

async function inspectBlackFrames(
    inputPath: string,
    durationSeconds: number | null,
): Promise<{ duration: number; ratio: number | null }> {
    const stderr = await captureFfmpegStderr([
        '-hide_banner',
        '-i',
        inputPath,
        '-an',
        '-vf',
        'blackdetect=d=0.25:pix_th=0.10',
        '-f',
        'null',
        '-',
    ]);
    const blackDurations = [...stderr.matchAll(/black_duration:(\d+(?:\.\d+)?)/gi)]
        .map((match) => Number(match[1]))
        .filter((value) => Number.isFinite(value) && value > 0);
    const duration = blackDurations.reduce((total, value) => total + value, 0);
    return {
        duration: Number(duration.toFixed(3)),
        ratio:
            durationSeconds && durationSeconds > 0
                ? Number(Math.min(1, duration / durationSeconds).toFixed(4))
                : null,
    };
}

async function inspectVideoFileQuality(
    inputPath: string,
    requirements: VideoQualityRequirements,
): Promise<VideoQualityInspection> {
    const metadataOutput = await captureFfmpegStderr(['-hide_banner', '-i', inputPath]);
    const metadata = parseVideoMetadata(metadataOutput);
    const [audio, blackFrames] = await Promise.all([
        inspectAudioLoudness(inputPath),
        metadata.hasVideoStream
            ? inspectBlackFrames(inputPath, metadata.durationSeconds)
            : Promise.resolve({ duration: 0, ratio: null }),
    ]);
    const issues: VideoQualityInspection['issues'] = [];

    if (!metadata.hasVideoStream) {
        issues.push({
            code: 'missing_video_stream',
            message: 'The generated file does not contain a readable video stream.',
        });
    }
    if (!metadata.durationSeconds || metadata.durationSeconds <= 0) {
        issues.push({
            code: 'invalid_duration',
            message: 'The generated video duration could not be determined.',
        });
    }
    if (
        metadata.durationSeconds
        && requirements.expectedDurationSeconds
        && Math.abs(metadata.durationSeconds - requirements.expectedDurationSeconds)
            > (requirements.durationToleranceSeconds ?? Math.max(1.5, requirements.expectedDurationSeconds * 0.3))
    ) {
        issues.push({
            code: 'duration_mismatch',
            message: `Expected about ${requirements.expectedDurationSeconds}s but received ${metadata.durationSeconds.toFixed(2)}s.`,
        });
    }
    if (
        metadata.width
        && metadata.height
        && requirements.expectedWidth
        && requirements.expectedHeight
    ) {
        const tolerance = requirements.dimensionTolerancePixels ?? 4;
        if (
            Math.abs(metadata.width - requirements.expectedWidth) > tolerance
            || Math.abs(metadata.height - requirements.expectedHeight) > tolerance
        ) {
            issues.push({
                code: 'resolution_mismatch',
                message: `Expected ${requirements.expectedWidth}x${requirements.expectedHeight} but received ${metadata.width}x${metadata.height}.`,
            });
        }
    }
    if (
        metadata.width
        && metadata.height
        && requirements.expectedAspectRatio
    ) {
        const actualAspectRatio = metadata.width / metadata.height;
        const aspectRatioDelta =
            Math.abs(actualAspectRatio - requirements.expectedAspectRatio)
            / requirements.expectedAspectRatio;
        if (aspectRatioDelta > (requirements.aspectRatioTolerance ?? 0.04)) {
            issues.push({
                code: 'aspect_ratio_mismatch',
                message: 'The generated aspect ratio differs from the requested storyboard ratio.',
            });
        }
    }
    if (requirements.requireAudibleAudio && !audio.hasAudioStream) {
        issues.push({
            code: 'missing_audio_stream',
            message: 'The generated video is missing the requested audio stream.',
        });
    } else if (requirements.requireAudibleAudio && !audio.hasAudibleAudio) {
        issues.push({
            code: 'inaudible_audio',
            message: 'The generated video contains an audio stream but no audible signal.',
        });
    }
    if (
        blackFrames.ratio !== null
        && blackFrames.ratio > (requirements.maxBlackFrameRatio ?? 0.18)
    ) {
        issues.push({
            code: 'excessive_black_frames',
            message: `${Math.round(blackFrames.ratio * 100)}% of the generated video was detected as black frames.`,
        });
    }

    return {
        passed: issues.length === 0,
        ...metadata,
        audio,
        blackFrameDurationSeconds: blackFrames.duration,
        blackFrameRatio: blackFrames.ratio,
        issues,
    };
}

export async function inspectFfmpegRuntime(): Promise<{
    ok: boolean;
    binaryPath: string | null;
    version: string | null;
    message: string;
}> {
    try {
        const binaryPath = resolveFfmpegBinaryPath();
        const output = await captureFfmpegStderr(['-version']);
        const version = output.split(/\r?\n/).find(Boolean)?.trim() || null;
        return {
            ok: true,
            binaryPath,
            version,
            message: 'FFmpeg is available for frame extraction, audio inspection, and final assembly.',
        };
    } catch (error) {
        return {
            ok: false,
            binaryPath: null,
            version: null,
            message: error instanceof Error ? error.message : 'FFmpeg runtime check failed.',
        };
    }
}

async function normalizeVideoClip(params: {
    inputPath: string;
    outputPath: string;
    width: number;
    height: number;
    fps: number;
    edit?: Omit<MergeVideoInput, 'url'>;
    sceneAudioVolume: number;
}): Promise<void> {
    const includesAudio = await hasAudioStream(params.inputPath);
    const sourceDuration = await getMediaDuration(params.inputPath);
    const trimStart = Math.min(Math.max(0, params.edit?.trimStartSeconds ?? 0), Math.max(0, sourceDuration - 0.1));
    const trimEnd = Math.min(Math.max(0, params.edit?.trimEndSeconds ?? 0), Math.max(0, sourceDuration - trimStart - 0.1));
    const playbackRate = Math.min(2, Math.max(0.5, params.edit?.playbackRate ?? 1));
    const outputDuration = Math.max(0.1, (sourceDuration - trimStart - trimEnd) / playbackRate);
    const clipVolume = Math.min(2, Math.max(0, params.edit?.audioVolume ?? 1));
    const finalVolume = Math.min(4, Math.max(0, clipVolume * params.sceneAudioVolume));
    const inputArgs = includesAudio
        ? ['-ss', String(trimStart), '-i', params.inputPath]
        : [
            '-ss',
            String(trimStart),
            '-i',
            params.inputPath,
            '-f',
            'lavfi',
            '-i',
            'anullsrc=channel_layout=stereo:sample_rate=48000',
        ];
    const audioMap = includesAudio ? '0:a:0' : '1:a:0';
    const videoFilters = [
        `scale=${params.width}:${params.height}:force_original_aspect_ratio=decrease`,
        `pad=${params.width}:${params.height}:(ow-iw)/2:(oh-ih)/2:black`,
        `fps=${params.fps}`,
        'format=yuv420p',
        'setsar=1',
        `setpts=${(1 / playbackRate).toFixed(6)}*PTS`,
    ];
    const audioFilters = [
        'aresample=async=1:first_pts=0',
        ...(includesAudio ? ['loudnorm=I=-16:TP=-1.5:LRA=11'] : []),
        `atempo=${playbackRate}`,
        `volume=${finalVolume}`,
        'apad',
    ];

    await runFfmpeg([
        '-y',
        ...inputArgs,
        '-map',
        '0:v:0',
        '-map',
        audioMap,
        '-vf',
        videoFilters.join(','),
        '-af',
        audioFilters.join(','),
        '-t',
        String(outputDuration),
        '-shortest',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        params.outputPath,
    ]);
}

function escapeConcatFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

async function withTempDir<T>(prefix: string, task: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), prefix));

    try {
        return await task(dir);
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}

export async function videoBufferHasAudio(buffer: Buffer): Promise<boolean> {
    return withTempDir('video-audio-check-', async (dir) => {
        const inputPath = join(dir, 'input.mp4');
        await writeFile(inputPath, buffer);
        return hasAudioStream(inputPath);
    });
}

export async function inspectVideoBufferAudio(buffer: Buffer): Promise<VideoAudioInspection> {
    return withTempDir('video-audio-inspection-', async (dir) => {
        const inputPath = join(dir, 'input.mp4');
        await writeFile(inputPath, buffer);
        return inspectAudioLoudness(inputPath);
    });
}

export async function inspectVideoBufferQuality(
    buffer: Buffer,
    requirements: VideoQualityRequirements = {},
): Promise<VideoQualityInspection> {
    return withTempDir('video-quality-inspection-', async (dir) => {
        const inputPath = join(dir, 'input.mp4');
        await writeFile(inputPath, buffer);
        return inspectVideoFileQuality(inputPath, requirements);
    });
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
    const isFullHd = resolution === '1080p';
    const isHd = resolution === '720p';

    switch (aspectRatio) {
        case '9:16':
            return isFullHd ? { width: 1080, height: 1920 } : isHd ? { width: 720, height: 1280 } : { width: 480, height: 854 };
        case '1:1':
            return isFullHd ? { width: 1080, height: 1080 } : isHd ? { width: 720, height: 720 } : { width: 480, height: 480 };
        case '4:3':
            return isFullHd ? { width: 1440, height: 1080 } : isHd ? { width: 960, height: 720 } : { width: 640, height: 480 };
        case '3:4':
            return isFullHd ? { width: 1080, height: 1440 } : isHd ? { width: 720, height: 960 } : { width: 480, height: 640 };
        case '3:2':
            return isFullHd ? { width: 1620, height: 1080 } : isHd ? { width: 1080, height: 720 } : { width: 720, height: 480 };
        case '2:3':
            return isFullHd ? { width: 1080, height: 1620 } : isHd ? { width: 720, height: 1080 } : { width: 480, height: 720 };
        case '16:9':
        default:
            return isFullHd ? { width: 1920, height: 1080 } : isHd ? { width: 1280, height: 720 } : { width: 854, height: 480 };
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

function resolveClipTransitionDuration(
    edit: MergeVideoInput,
    outgoingDuration: number,
    incomingDuration: number,
): number {
    if (!edit.transitionStyle || edit.transitionStyle === 'cut') return 0;
    const requested = edit.transitionSeconds ?? 0.35;
    const strategyDuration = edit.transitionStyle === 'match-cut'
        ? Math.min(requested, 0.25)
        : edit.transitionStyle === 'bridge'
            ? Math.max(requested, 0.5)
            : requested;
    return Math.max(
        0.08,
        Math.min(strategyDuration, outgoingDuration / 2, incomingDuration / 2, 1.5),
    );
}

async function mergeNormalizedClipsWithTransitions(params: {
    normalizedPaths: string[];
    clips: MergeVideoInput[];
    durations: number[];
    outputPath: string;
}): Promise<void> {
    const inputArgs = params.normalizedPaths.flatMap((path) => ['-i', path]);
    const filters: string[] = [];
    let currentVideo = '0:v:0';
    let currentAudio = '0:a:0';
    let assembledDuration = params.durations[0];

    for (let index = 1; index < params.normalizedPaths.length; index += 1) {
        const outputVideo = `v${index}`;
        const outputAudio = `a${index}`;
        const transitionDuration = resolveClipTransitionDuration(
            params.clips[index - 1],
            assembledDuration,
            params.durations[index],
        );

        if (transitionDuration > 0) {
            const offset = Math.max(0, assembledDuration - transitionDuration);
            filters.push(
                `[${currentVideo}][${index}:v:0]xfade=transition=fade:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${outputVideo}]`,
                `[${currentAudio}][${index}:a:0]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri[${outputAudio}]`,
            );
            assembledDuration += params.durations[index] - transitionDuration;
        } else {
            filters.push(
                `[${currentVideo}][${currentAudio}][${index}:v:0][${index}:a:0]concat=n=2:v=1:a=1[${outputVideo}][${outputAudio}]`,
            );
            assembledDuration += params.durations[index];
        }
        currentVideo = outputVideo;
        currentAudio = outputAudio;
    }

    await runFfmpeg([
        '-y',
        ...inputArgs,
        '-filter_complex',
        filters.join(';'),
        '-map',
        `[${currentVideo}]`,
        '-map',
        `[${currentAudio}]`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        params.outputPath,
    ]);
}

export async function mergeVideos(params: {
    clips: MergeVideoInput[];
    aspectRatio?: StudioAspectRatio;
    resolution?: StudioResolution;
    fps?: number;
    backgroundMusicUrl?: string;
    audioMixPreset?: AudioMixPreset;
    backgroundMusicVolume?: number;
    sceneAudioVolume?: number;
    audioCrossfadeSeconds?: number;
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

        const normalizedPaths: string[] = [];
        const normalizedDurations: number[] = [];
        for (let index = 0; index < inputPaths.length; index += 1) {
            const normalizedPath = join(dir, `normalized-${index}.mp4`);
            await normalizeVideoClip({
                inputPath: inputPaths[index],
                outputPath: normalizedPath,
                width,
                height,
                fps,
                edit: params.clips[index],
                sceneAudioVolume: Math.min(2, Math.max(0, params.sceneAudioVolume ?? 1)),
            });
            normalizedPaths.push(normalizedPath);
            normalizedDurations.push(await getMediaDuration(normalizedPath));
        }

        let assembledPath = normalizedPaths[0];
        if (normalizedPaths.length > 1) {
            assembledPath = join(dir, 'merged.mp4');
            const hasOverlapTransition = params.clips
                .slice(0, -1)
                .some((clip) => clip.transitionStyle && clip.transitionStyle !== 'cut');
            if (hasOverlapTransition) {
                await mergeNormalizedClipsWithTransitions({
                    normalizedPaths,
                    clips: params.clips,
                    durations: normalizedDurations,
                    outputPath: assembledPath,
                });
            } else {
                const concatListPath = join(dir, 'concat.txt');
                await writeFile(
                    concatListPath,
                    normalizedPaths.map((filePath) => `file '${escapeConcatFilePath(filePath)}'`).join('\n'),
                    'utf8',
                );
                await runFfmpeg([
                    '-y',
                    '-f',
                    'concat',
                    '-safe',
                    '0',
                    '-i',
                    concatListPath,
                    '-c',
                    'copy',
                    '-movflags',
                    '+faststart',
                    assembledPath,
                ]);
            }
        }

        if (!params.backgroundMusicUrl) return readFile(assembledPath);

        const musicPath = join(dir, 'background-music');
        const mixedPath = join(dir, 'mixed.mp4');
        await downloadRemoteFile(params.backgroundMusicUrl, musicPath);
        const musicVolume = Math.min(1, Math.max(0, params.backgroundMusicVolume ?? 0.16));
        const dropout = Math.min(2, Math.max(0, params.audioCrossfadeSeconds ?? 0.35));
        const mixProfile = resolveBackgroundMusicMixProfile(params.audioMixPreset);
        const assembledDuration = await getMediaDuration(assembledPath);
        const musicFadeSeconds = Math.min(0.75, Math.max(0.1, assembledDuration / 6));
        const musicFadeOutStart = Math.max(0, assembledDuration - musicFadeSeconds);
        await runFfmpeg([
            '-y',
            '-i',
            assembledPath,
            '-stream_loop',
            '-1',
            '-i',
            musicPath,
            '-filter_complex',
            `[0:a]volume=1,asplit=2[scene][scene-sidechain];[1:a]atrim=duration=${assembledDuration},volume=${musicVolume},afade=t=in:st=0:d=${musicFadeSeconds},afade=t=out:st=${musicFadeOutStart}:d=${musicFadeSeconds}[music];[music][scene-sidechain]sidechaincompress=threshold=${mixProfile.threshold}:ratio=${mixProfile.ratio}:attack=${mixProfile.attackMs}:release=${mixProfile.releaseMs}[ducked];[scene][ducked]amix=inputs=2:duration=first:dropout_transition=${dropout}:normalize=0,alimiter=limit=0.95[audio]`,
            '-map',
            '0:v:0',
            '-map',
            '[audio]',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-shortest',
            '-movflags',
            '+faststart',
            mixedPath,
        ]);
        return readFile(mixedPath);
    });
}
