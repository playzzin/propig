"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBackgroundMusicMixProfile = resolveBackgroundMusicMixProfile;
exports.resolveFfmpegBinaryPath = resolveFfmpegBinaryPath;
exports.inspectFfmpegRuntime = inspectFfmpegRuntime;
exports.videoBufferHasAudio = videoBufferHasAudio;
exports.inspectVideoBufferAudio = inspectVideoBufferAudio;
exports.inspectVideoBufferQuality = inspectVideoBufferQuality;
exports.getVideoCanvasSize = getVideoCanvasSize;
exports.extractVideoFrame = extractVideoFrame;
exports.mergeVideos = mergeVideos;
const child_process_1 = require("child_process");
const ffmpeg_static_1 = require("ffmpeg-static");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const MIN_AUDIBLE_MEAN_VOLUME_DB = -65;
const MIN_AUDIBLE_MAX_VOLUME_DB = -50;
const BACKGROUND_MUSIC_MIX_PROFILES = {
    'dialogue-first': { threshold: 0.018, ratio: 12, attackMs: 12, releaseMs: 420 },
    balanced: { threshold: 0.028, ratio: 7, attackMs: 18, releaseMs: 360 },
    'music-first': { threshold: 0.04, ratio: 3.5, attackMs: 24, releaseMs: 280 },
};
function resolveBackgroundMusicMixProfile(preset) {
    return BACKGROUND_MUSIC_MIX_PROFILES[preset === 'custom' || !preset ? 'balanced' : preset];
}
function resolveFfmpegBinaryPath(reportedPath = ffmpeg_static_1.default) {
    var _a;
    const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const configuredPath = (_a = process.env.FFMPEG_BIN) === null || _a === void 0 ? void 0 : _a.trim();
    if (configuredPath)
        return configuredPath;
    const bundledPath = reportedPath === null || reportedPath === void 0 ? void 0 : reportedPath.trim();
    if (bundledPath) {
        const rootRelativeMatch = bundledPath.match(/^[\\/]+ROOT[\\/]+(.+)$/i);
        if (rootRelativeMatch) {
            const relativePath = rootRelativeMatch[1].replace(/[\\/]+/g, path_1.sep);
            return `${process.cwd()}${path_1.sep}${relativePath}`;
        }
        return bundledPath;
    }
    return (0, path_1.join)(process.cwd(), 'node_modules', 'ffmpeg-static', executableName);
}
async function runFfmpeg(args) {
    const binary = resolveFfmpegBinaryPath();
    await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(binary, args, {
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
async function hasAudioStream(inputPath) {
    const binary = resolveFfmpegBinaryPath();
    const stderr = await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(binary, ['-hide_banner', '-i', inputPath], {
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
async function getMediaDuration(inputPath) {
    const binary = resolveFfmpegBinaryPath();
    const stderr = await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(binary, ['-hide_banner', '-i', inputPath], { windowsHide: true });
        let output = '';
        child.stderr.on('data', (chunk) => { output += chunk.toString(); });
        child.on('error', reject);
        child.on('close', () => resolve(output));
    });
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match)
        throw new Error('Could not determine video duration for final editing.');
    return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
}
async function inspectAudioLoudness(inputPath) {
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
    const stderr = await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(binary, [
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
    const parseVolume = (label) => {
        const match = stderr.match(new RegExp(`${label}:\\s*(-?\\d+(?:\\.\\d+)?|-inf)\\s*dB`, 'i'));
        if (!match || match[1].toLowerCase() === '-inf')
            return null;
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
async function captureFfmpegStderr(args) {
    const binary = resolveFfmpegBinaryPath();
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(binary, args, { windowsHide: true });
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
function parseVideoMetadata(stderr) {
    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
    const videoLine = stderr
        .split(/\r?\n/)
        .find((line) => /Stream #\d+:\d+.*Video:/i.test(line));
    const dimensionMatch = videoLine === null || videoLine === void 0 ? void 0 : videoLine.match(/\b(\d{2,5})x(\d{2,5})\b/);
    const fpsMatch = videoLine === null || videoLine === void 0 ? void 0 : videoLine.match(/\b(\d+(?:\.\d+)?)\s+fps\b/i);
    const durationSeconds = durationMatch
        ? (Number(durationMatch[1]) * 3600)
            + (Number(durationMatch[2]) * 60)
            + Number(durationMatch[3])
        : null;
    return {
        durationSeconds: durationSeconds !== null && Number.isFinite(durationSeconds)
            ? durationSeconds
            : null,
        width: dimensionMatch ? Number(dimensionMatch[1]) : null,
        height: dimensionMatch ? Number(dimensionMatch[2]) : null,
        fps: fpsMatch ? Number(fpsMatch[1]) : null,
        hasVideoStream: Boolean(videoLine),
    };
}
async function inspectBlackFrames(inputPath, durationSeconds) {
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
        ratio: durationSeconds && durationSeconds > 0
            ? Number(Math.min(1, duration / durationSeconds).toFixed(4))
            : null,
    };
}
async function inspectVideoFileQuality(inputPath, requirements) {
    var _a, _b, _c, _d;
    const metadataOutput = await captureFfmpegStderr(['-hide_banner', '-i', inputPath]);
    const metadata = parseVideoMetadata(metadataOutput);
    const [audio, blackFrames] = await Promise.all([
        inspectAudioLoudness(inputPath),
        metadata.hasVideoStream
            ? inspectBlackFrames(inputPath, metadata.durationSeconds)
            : Promise.resolve({ duration: 0, ratio: null }),
    ]);
    const issues = [];
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
    if (metadata.durationSeconds
        && requirements.expectedDurationSeconds
        && Math.abs(metadata.durationSeconds - requirements.expectedDurationSeconds)
            > ((_a = requirements.durationToleranceSeconds) !== null && _a !== void 0 ? _a : Math.max(1.5, requirements.expectedDurationSeconds * 0.3))) {
        issues.push({
            code: 'duration_mismatch',
            message: `Expected about ${requirements.expectedDurationSeconds}s but received ${metadata.durationSeconds.toFixed(2)}s.`,
        });
    }
    if (metadata.width
        && metadata.height
        && requirements.expectedWidth
        && requirements.expectedHeight) {
        const tolerance = (_b = requirements.dimensionTolerancePixels) !== null && _b !== void 0 ? _b : 4;
        if (Math.abs(metadata.width - requirements.expectedWidth) > tolerance
            || Math.abs(metadata.height - requirements.expectedHeight) > tolerance) {
            issues.push({
                code: 'resolution_mismatch',
                message: `Expected ${requirements.expectedWidth}x${requirements.expectedHeight} but received ${metadata.width}x${metadata.height}.`,
            });
        }
    }
    if (metadata.width
        && metadata.height
        && requirements.expectedAspectRatio) {
        const actualAspectRatio = metadata.width / metadata.height;
        const aspectRatioDelta = Math.abs(actualAspectRatio - requirements.expectedAspectRatio)
            / requirements.expectedAspectRatio;
        if (aspectRatioDelta > ((_c = requirements.aspectRatioTolerance) !== null && _c !== void 0 ? _c : 0.04)) {
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
    }
    else if (requirements.requireAudibleAudio && !audio.hasAudibleAudio) {
        issues.push({
            code: 'inaudible_audio',
            message: 'The generated video contains an audio stream but no audible signal.',
        });
    }
    if (blackFrames.ratio !== null
        && blackFrames.ratio > ((_d = requirements.maxBlackFrameRatio) !== null && _d !== void 0 ? _d : 0.18)) {
        issues.push({
            code: 'excessive_black_frames',
            message: `${Math.round(blackFrames.ratio * 100)}% of the generated video was detected as black frames.`,
        });
    }
    return Object.assign(Object.assign({ passed: issues.length === 0 }, metadata), { audio, blackFrameDurationSeconds: blackFrames.duration, blackFrameRatio: blackFrames.ratio, issues });
}
async function inspectFfmpegRuntime() {
    var _a;
    try {
        const binaryPath = resolveFfmpegBinaryPath();
        const output = await captureFfmpegStderr(['-version']);
        const version = ((_a = output.split(/\r?\n/).find(Boolean)) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        return {
            ok: true,
            binaryPath,
            version,
            message: 'FFmpeg is available for frame extraction, audio inspection, and final assembly.',
        };
    }
    catch (error) {
        return {
            ok: false,
            binaryPath: null,
            version: null,
            message: error instanceof Error ? error.message : 'FFmpeg runtime check failed.',
        };
    }
}
async function normalizeVideoClip(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const includesAudio = await hasAudioStream(params.inputPath);
    const sourceDuration = await getMediaDuration(params.inputPath);
    const trimStart = Math.min(Math.max(0, (_b = (_a = params.edit) === null || _a === void 0 ? void 0 : _a.trimStartSeconds) !== null && _b !== void 0 ? _b : 0), Math.max(0, sourceDuration - 0.1));
    const trimEnd = Math.min(Math.max(0, (_d = (_c = params.edit) === null || _c === void 0 ? void 0 : _c.trimEndSeconds) !== null && _d !== void 0 ? _d : 0), Math.max(0, sourceDuration - trimStart - 0.1));
    const playbackRate = Math.min(2, Math.max(0.5, (_f = (_e = params.edit) === null || _e === void 0 ? void 0 : _e.playbackRate) !== null && _f !== void 0 ? _f : 1));
    const outputDuration = Math.max(0.1, (sourceDuration - trimStart - trimEnd) / playbackRate);
    const clipVolume = Math.min(2, Math.max(0, (_h = (_g = params.edit) === null || _g === void 0 ? void 0 : _g.audioVolume) !== null && _h !== void 0 ? _h : 1));
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
function escapeConcatFilePath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
}
async function withTempDir(prefix, task) {
    const dir = await (0, promises_1.mkdtemp)((0, path_1.join)((0, os_1.tmpdir)(), prefix));
    try {
        return await task(dir);
    }
    finally {
        await (0, promises_1.rm)(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}
async function videoBufferHasAudio(buffer) {
    return withTempDir('video-audio-check-', async (dir) => {
        const inputPath = (0, path_1.join)(dir, 'input.mp4');
        await (0, promises_1.writeFile)(inputPath, buffer);
        return hasAudioStream(inputPath);
    });
}
async function inspectVideoBufferAudio(buffer) {
    return withTempDir('video-audio-inspection-', async (dir) => {
        const inputPath = (0, path_1.join)(dir, 'input.mp4');
        await (0, promises_1.writeFile)(inputPath, buffer);
        return inspectAudioLoudness(inputPath);
    });
}
async function inspectVideoBufferQuality(buffer, requirements = {}) {
    return withTempDir('video-quality-inspection-', async (dir) => {
        const inputPath = (0, path_1.join)(dir, 'input.mp4');
        await (0, promises_1.writeFile)(inputPath, buffer);
        return inspectVideoFileQuality(inputPath, requirements);
    });
}
async function downloadRemoteFile(url, targetPath) {
    const response = await fetch(url, {
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(`Failed to download media asset. HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await (0, promises_1.writeFile)(targetPath, Buffer.from(arrayBuffer));
}
function getVideoCanvasSize(aspectRatio = '16:9', resolution = '720p') {
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
async function extractVideoFrame(params) {
    return withTempDir('video-frame-', async (dir) => {
        const inputPath = (0, path_1.join)(dir, 'input.mp4');
        const outputPath = (0, path_1.join)(dir, 'frame.png');
        await downloadRemoteFile(params.videoUrl, inputPath);
        const args = ['-y'];
        if (typeof params.timeSec === 'number' && Number.isFinite(params.timeSec)) {
            args.push('-ss', String(Math.max(0, params.timeSec)));
        }
        else if (params.position === 'last') {
            args.push('-sseof', '-0.15');
        }
        args.push('-i', inputPath, '-frames:v', '1', outputPath);
        await runFfmpeg(args);
        return (0, promises_1.readFile)(outputPath);
    });
}
function resolveClipTransitionDuration(edit, outgoingDuration, incomingDuration) {
    var _a;
    if (!edit.transitionStyle || edit.transitionStyle === 'cut')
        return 0;
    const requested = (_a = edit.transitionSeconds) !== null && _a !== void 0 ? _a : 0.35;
    const strategyDuration = edit.transitionStyle === 'match-cut'
        ? Math.min(requested, 0.25)
        : edit.transitionStyle === 'bridge'
            ? Math.max(requested, 0.5)
            : requested;
    return Math.max(0.08, Math.min(strategyDuration, outgoingDuration / 2, incomingDuration / 2, 1.5));
}
async function mergeNormalizedClipsWithTransitions(params) {
    const inputArgs = params.normalizedPaths.flatMap((path) => ['-i', path]);
    const filters = [];
    let currentVideo = '0:v:0';
    let currentAudio = '0:a:0';
    let assembledDuration = params.durations[0];
    for (let index = 1; index < params.normalizedPaths.length; index += 1) {
        const outputVideo = `v${index}`;
        const outputAudio = `a${index}`;
        const transitionDuration = resolveClipTransitionDuration(params.clips[index - 1], assembledDuration, params.durations[index]);
        if (transitionDuration > 0) {
            const offset = Math.max(0, assembledDuration - transitionDuration);
            filters.push(`[${currentVideo}][${index}:v:0]xfade=transition=fade:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${outputVideo}]`, `[${currentAudio}][${index}:a:0]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri[${outputAudio}]`);
            assembledDuration += params.durations[index] - transitionDuration;
        }
        else {
            filters.push(`[${currentVideo}][${currentAudio}][${index}:v:0][${index}:a:0]concat=n=2:v=1:a=1[${outputVideo}][${outputAudio}]`);
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
async function mergeVideos(params) {
    var _a;
    if (params.clips.length === 0) {
        throw new Error('At least one clip is required for merging.');
    }
    const fps = (_a = params.fps) !== null && _a !== void 0 ? _a : 30;
    const { width, height } = getVideoCanvasSize(params.aspectRatio, params.resolution);
    return withTempDir('video-merge-', async (dir) => {
        var _a, _b, _c;
        const inputPaths = [];
        for (let index = 0; index < params.clips.length; index += 1) {
            const inputPath = (0, path_1.join)(dir, `input-${index}.mp4`);
            await downloadRemoteFile(params.clips[index].url, inputPath);
            inputPaths.push(inputPath);
        }
        const normalizedPaths = [];
        const normalizedDurations = [];
        for (let index = 0; index < inputPaths.length; index += 1) {
            const normalizedPath = (0, path_1.join)(dir, `normalized-${index}.mp4`);
            await normalizeVideoClip({
                inputPath: inputPaths[index],
                outputPath: normalizedPath,
                width,
                height,
                fps,
                edit: params.clips[index],
                sceneAudioVolume: Math.min(2, Math.max(0, (_a = params.sceneAudioVolume) !== null && _a !== void 0 ? _a : 1)),
            });
            normalizedPaths.push(normalizedPath);
            normalizedDurations.push(await getMediaDuration(normalizedPath));
        }
        let assembledPath = normalizedPaths[0];
        if (normalizedPaths.length > 1) {
            assembledPath = (0, path_1.join)(dir, 'merged.mp4');
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
            }
            else {
                const concatListPath = (0, path_1.join)(dir, 'concat.txt');
                await (0, promises_1.writeFile)(concatListPath, normalizedPaths.map((filePath) => `file '${escapeConcatFilePath(filePath)}'`).join('\n'), 'utf8');
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
        if (!params.backgroundMusicUrl)
            return (0, promises_1.readFile)(assembledPath);
        const musicPath = (0, path_1.join)(dir, 'background-music');
        const mixedPath = (0, path_1.join)(dir, 'mixed.mp4');
        await downloadRemoteFile(params.backgroundMusicUrl, musicPath);
        const musicVolume = Math.min(1, Math.max(0, (_b = params.backgroundMusicVolume) !== null && _b !== void 0 ? _b : 0.16));
        const dropout = Math.min(2, Math.max(0, (_c = params.audioCrossfadeSeconds) !== null && _c !== void 0 ? _c : 0.35));
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
        return (0, promises_1.readFile)(mixedPath);
    });
}
//# sourceMappingURL=ffmpeg.js.map