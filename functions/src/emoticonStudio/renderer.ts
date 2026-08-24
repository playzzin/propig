import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import JSZip = require('jszip');
import type { OverlayOptions, Sharp, SharpOptions } from 'sharp';
import { EMOTICON_BUBBLE_APPEARANCE_DEFAULTS } from './schema';
import type {
    EmoticonAlphaBoundsEvidence,
    EmoticonBubble,
    EmoticonExportFormat,
    EmoticonFrameTransition,
    EmoticonImageEditRecipe,
    EmoticonOutputInspection,
    EmoticonOutputProfile,
    EmoticonPlan,
} from './schema';

// These packages expose CommonJS entry points in the Functions runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath = require('ffmpeg-static') as string | null;

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Cloud Functions images do not guarantee a Korean system font. Register the
 * bundled OFL fonts before Sharp/libvips initializes Fontconfig so speech
 * bubbles never degrade to missing-glyph boxes after deployment.
 */
function configureBundledKoreanFonts(): void {
    const functionsRoot = resolve(__dirname, '..', '..');
    const fontDirectories = [
        ['@expo-google-fonts', 'nanum-gothic', '400Regular'],
        ['@expo-google-fonts', 'nanum-gothic', '700Bold'],
        ['@expo-google-fonts', 'nanum-gothic', '800ExtraBold'],
        ['@expo-google-fonts', 'nanum-myeongjo', '400Regular'],
        ['@expo-google-fonts', 'nanum-myeongjo', '700Bold'],
        ['@expo-google-fonts', 'nanum-myeongjo', '800ExtraBold'],
        ['@expo-google-fonts', 'nanum-pen-script', '400Regular'],
    ].map((segments) => join(functionsRoot, 'node_modules', ...segments));
    const missingDirectory = fontDirectories.find((directory) => !existsSync(directory));
    if (missingDirectory) {
        throw new Error(`Bundled Korean font directory is missing: ${missingDirectory}`);
    }

    const configDirectory = join(tmpdir(), 'propig-emoticon-fontconfig');
    const cacheDirectory = join(configDirectory, 'cache');
    const configPath = join(configDirectory, 'fonts.conf');
    mkdirSync(cacheDirectory, { recursive: true });
    const directories = fontDirectories
        .map((directory) => `  <dir>${xmlEscape(directory.replace(/\\/g, '/'))}</dir>`)
        .join('\n');
    writeFileSync(configPath, [
        '<?xml version="1.0"?>',
        '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
        '<fontconfig>',
        '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>',
        directories,
        `  <cachedir>${xmlEscape(cacheDirectory.replace(/\\/g, '/'))}</cachedir>`,
        '</fontconfig>',
    ].join('\n'), 'utf8');
    process.env.FONTCONFIG_FILE = configPath;
    process.env.FONTCONFIG_PATH = configDirectory;
}

configureBundledKoreanFonts();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as (
    input?: Buffer | string | SharpOptions,
    options?: SharpOptions,
) => Sharp;

export type RenderedEmoticonFile = {
    format: EmoticonExportFormat;
    extension: string;
    contentType: string;
    buffer: Buffer;
    inspection: EmoticonOutputInspection;
};

export type EmoticonFrameTiming = {
    mode: 'fps';
    fps: number;
} | {
    mode: 'per_frame';
    frameDurationsMs: number[];
};

export type ResolvedEmoticonOutputProfile = EmoticonOutputProfile;

const CANVAS_SIZE = 360;
const CHARACTER_MAX_WIDTH = 292;
const CHARACTER_MAX_HEIGHT_WITHOUT_BUBBLE = 316;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_GENERATED_POSE_BYTES = 30 * 1024 * 1024;
const MAX_SOURCE_DIMENSION = 4096;
const MAX_SOURCE_PIXELS = MAX_SOURCE_DIMENSION * MAX_SOURCE_DIMENSION;
const OUTPUT_INSPECTOR_VERSION = '3.0';
// Ignore near-zero codec noise, while still treating anti-aliased artwork as visible.
const ALPHA_BOUNDS_THRESHOLD = 8;
// A 360px canvas needs at least four transparent pixels; larger custom canvases scale to 1%.
const MINIMUM_TRANSPARENT_MARGIN_PX = 4;
const MINIMUM_TRANSPARENT_MARGIN_RATIO = 0.01;

const SERVER_FORMAT_CAPABILITIES: NonNullable<EmoticonOutputProfile['formatCapabilities']> = {
    png: { alpha: 'supported' },
    apng: { alpha: 'supported' },
    webp: { alpha: 'supported' },
    gif: { alpha: 'supported' },
    mp4: { alpha: 'unsupported' },
    webm: { alpha: 'supported' },
    png_zip: { alpha: 'supported' },
};

const DEFAULT_OUTPUT_PROFILE: ResolvedEmoticonOutputProfile = {
    platform: 'custom',
    type: 'animated',
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    profileVersion: 'legacy-360-v1',
    verification: 'reference',
    transparentBackground: true,
    formatCapabilities: SERVER_FORMAT_CAPABILITIES,
    submissionCandidate: false,
};

const VERIFIED_OUTPUT_PROFILES: Record<string, {
    platform: EmoticonOutputProfile['platform'];
    type: EmoticonOutputProfile['type'];
    width: number;
    height: number;
    sourceUrl: string;
    checkedAt: string;
    transparentBackground: boolean;
    allowedFormats: EmoticonExportFormat[];
    minFrameCount?: number;
    maxFrameCount?: number;
    maxFileSizeBytes?: number;
    maxDurationMs?: number;
    loopCount?: number;
}> = {
    'kakao-standard-animated-webp-2026-08-01': {
        platform: 'kakao',
        type: 'animated',
        width: 360,
        height: 360,
        sourceUrl: 'https://emoticonstudio.kakao.com/webp-animator',
        checkedAt: '2026-08-01T00:00:00.000Z',
        transparentBackground: true,
        allowedFormats: ['webp', 'png_zip'],
        maxFrameCount: 24,
    },
    'line-animated-apng-2026-08-05': {
        platform: 'line',
        type: 'animated',
        width: 320,
        height: 270,
        sourceUrl: 'https://creator.line.me/en/guideline/animationsticker/',
        checkedAt: '2026-08-05T00:00:00.000Z',
        transparentBackground: true,
        allowedFormats: ['apng', 'gif', 'webp', 'png_zip'],
        minFrameCount: 5,
        maxFrameCount: 20,
        maxFileSizeBytes: 1024 * 1024,
        maxDurationMs: 4_000,
        loopCount: 1,
    },
    'line-static-png-2026-08-05': {
        platform: 'line',
        type: 'static',
        width: 370,
        height: 320,
        sourceUrl: 'https://creator.line.me/en/guideline/sticker/',
        checkedAt: '2026-08-05T00:00:00.000Z',
        transparentBackground: true,
        allowedFormats: ['png'],
        minFrameCount: 1,
        maxFrameCount: 1,
        maxFileSizeBytes: 1024 * 1024,
    },
};

function isAllowlistedVerifiedProfile(profile: EmoticonOutputProfile): boolean {
    const allowlisted = VERIFIED_OUTPUT_PROFILES[profile.profileVersion];
    return Boolean(
        allowlisted
        && profile.platform === allowlisted.platform
        && profile.type === allowlisted.type
        && profile.width === allowlisted.width
        && profile.height === allowlisted.height
        && profile.sourceUrl === allowlisted.sourceUrl,
    );
}

export function resolveEmoticonOutputProfile(
    profile?: EmoticonOutputProfile,
): ResolvedEmoticonOutputProfile {
    if (!profile) return DEFAULT_OUTPUT_PROFILE;
    // `verification` arrives from an untrusted job document. Only a
    // version/source/dimension tuple shipped with this server may retain
    // the verified marker.
    const verified = isAllowlistedVerifiedProfile(profile);
    const allowlisted = verified ? VERIFIED_OUTPUT_PROFILES[profile.profileVersion] : undefined;
    if (!allowlisted) {
        return {
            ...profile,
            verification: 'reference',
            formatCapabilities: SERVER_FORMAT_CAPABILITIES,
            submissionCandidate: false,
        };
    }
    // Only constraints stored in the server allowlist are enforceable. This
    // deliberately drops client-supplied file-size, duration, loop, and
    // format limits until an official source has been verified and shipped.
    const resolved: ResolvedEmoticonOutputProfile = {
        platform: allowlisted.platform,
        type: allowlisted.type,
        width: allowlisted.width,
        height: allowlisted.height,
        profileVersion: profile.profileVersion,
        verification: 'verified',
        transparentBackground: allowlisted.transparentBackground,
        sourceUrl: allowlisted.sourceUrl,
        checkedAt: allowlisted.checkedAt,
        allowedFormats: [...allowlisted.allowedFormats],
        ...(allowlisted.minFrameCount !== undefined
            ? { minFrameCount: allowlisted.minFrameCount }
            : {}),
        ...(allowlisted.maxFrameCount !== undefined
            ? { maxFrameCount: allowlisted.maxFrameCount }
            : {}),
        ...(allowlisted.maxFileSizeBytes !== undefined
            ? { maxFileSizeBytes: allowlisted.maxFileSizeBytes }
            : {}),
        ...(allowlisted.maxDurationMs !== undefined
            ? { maxDurationMs: allowlisted.maxDurationMs }
            : {}),
        ...(allowlisted.loopCount !== undefined
            ? { loopCount: allowlisted.loopCount }
            : {}),
        formatCapabilities: SERVER_FORMAT_CAPABILITIES,
        submissionCandidate: false,
    };
    return resolved;
}

function assertOutputProfileConstraints(params: {
    plan: EmoticonPlan;
    formats: EmoticonExportFormat[];
    outputProfile: ResolvedEmoticonOutputProfile;
}): void {
    if (params.outputProfile.verification !== 'verified') return;
    const effectiveFrameCount = params.outputProfile.type === 'static'
        ? 1
        : params.plan.action.frameCount;
    if (
        params.outputProfile.allowedFormats
        && params.formats.some((format) => !params.outputProfile.allowedFormats!.includes(format))
    ) {
        throw new Error('A requested output format is not allowed by the verified output profile.');
    }
    if (
        params.outputProfile.minFrameCount !== undefined
        && effectiveFrameCount < params.outputProfile.minFrameCount
    ) {
        throw new Error('The animation has fewer frames than the verified output profile allows.');
    }
    if (
        params.outputProfile.maxFrameCount !== undefined
        && effectiveFrameCount > params.outputProfile.maxFrameCount
    ) {
        throw new Error('The animation has more frames than the verified output profile allows.');
    }
    if (
        params.outputProfile.maxDurationMs !== undefined
        && params.plan.action.durationMs > params.outputProfile.maxDurationMs
    ) {
        throw new Error('The animation duration exceeds the verified output profile limit.');
    }
}

async function normalizeInputImage(params: {
    buffer: Buffer;
    maxBytes: number;
    maxOutputDimension: number;
    label: string;
}): Promise<Buffer> {
    if (!params.buffer.byteLength || params.buffer.byteLength > params.maxBytes) {
        throw new Error(`${params.label} must be smaller than ${Math.round(params.maxBytes / 1024 / 1024)} MB.`);
    }
    const input = sharp(params.buffer, {
        failOn: 'error',
        limitInputPixels: MAX_SOURCE_PIXELS,
    });
    const metadata = await input.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (width < 64 || height < 64) {
        throw new Error(`${params.label} must be at least 64×64 pixels.`);
    }
    if (width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION) {
        throw new Error(`${params.label} cannot exceed 4096 pixels on either side.`);
    }
    return input
        .rotate()
        .ensureAlpha()
        .resize({
            width: params.maxOutputDimension,
            height: params.maxOutputDimension,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
}

async function removeConnectedFlatBackground(pngBuffer: Buffer): Promise<Buffer> {
    const { data, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const pixelCount = width * height;
    let transparentPixels = 0;
    for (let index = 3; index < data.length; index += channels) {
        if (data[index] < 245) transparentPixels += 1;
    }
    if (transparentPixels / pixelCount >= 0.005) return pngBuffer;

    const cornerOffsets = [
        0,
        (width - 1) * channels,
        (height - 1) * width * channels,
        ((height * width) - 1) * channels,
    ];
    const target = [0, 1, 2].map((channel) => (
        Math.round(cornerOffsets.reduce((sum, offset) => sum + data[offset + channel], 0) / 4)
    ));
    const colorDistanceSquared = (offset: number) => (
        (data[offset] - target[0]) ** 2
        + (data[offset + 1] - target[1]) ** 2
        + (data[offset + 2] - target[2]) ** 2
    );
    if (cornerOffsets.some((offset) => colorDistanceSquared(offset) > 45 ** 2)) return pngBuffer;

    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let queueStart = 0;
    let queueEnd = 0;
    const thresholdSquared = 42 ** 2;
    const enqueue = (pixelIndex: number) => {
        if (visited[pixelIndex]) return;
        visited[pixelIndex] = 1;
        if (colorDistanceSquared(pixelIndex * channels) <= thresholdSquared) {
            queue[queueEnd] = pixelIndex;
            queueEnd += 1;
        }
    };
    for (let x = 0; x < width; x += 1) {
        enqueue(x);
        enqueue((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
        enqueue(y * width);
        enqueue(y * width + width - 1);
    }

    while (queueStart < queueEnd) {
        const pixelIndex = queue[queueStart];
        queueStart += 1;
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);
        if (x > 0) enqueue(pixelIndex - 1);
        if (x + 1 < width) enqueue(pixelIndex + 1);
        if (y > 0) enqueue(pixelIndex - width);
        if (y + 1 < height) enqueue(pixelIndex + width);
    }
    const removedRatio = queueEnd / pixelCount;
    if (removedRatio < 0.005 || removedRatio > 0.97) return pngBuffer;
    for (let index = 0; index < queueEnd; index += 1) {
        data[queue[index] * channels + 3] = 0;
    }
    return sharp(data, {
        raw: { width, height, channels },
    }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

/**
 * Removes the soft studio gradients that image providers sometimes return
 * despite a transparent-background request. Unlike the flat-color pass above,
 * this flood fill follows only small colour changes between neighbouring
 * pixels, so it can traverse a gradual vignette while stopping at the sharper
 * character outline.
 */
async function removeConnectedSmoothBackground(pngBuffer: Buffer): Promise<Buffer> {
    const { data, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const pixelCount = width * height;
    const alphaOffset = channels - 1;
    let transparentPixels = 0;
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        if (data[pixelIndex * channels + alphaOffset] < 245) transparentPixels += 1;
    }
    if (transparentPixels / pixelCount >= 0.005) return pngBuffer;

    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let queueStart = 0;
    let queueEnd = 0;
    const enqueueSeed = (pixelIndex: number) => {
        if (visited[pixelIndex]) return;
        visited[pixelIndex] = 1;
        queue[queueEnd] = pixelIndex;
        queueEnd += 1;
    };
    for (let x = 0; x < width; x += 1) {
        enqueueSeed(x);
        enqueueSeed((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
        enqueueSeed(y * width);
        enqueueSeed(y * width + width - 1);
    }

    const localThresholdSquared = 18 ** 2;
    const enqueueNeighbour = (currentPixelIndex: number, candidatePixelIndex: number) => {
        if (visited[candidatePixelIndex]) return;
        visited[candidatePixelIndex] = 1;
        const currentOffset = currentPixelIndex * channels;
        const candidateOffset = candidatePixelIndex * channels;
        const distanceSquared = (
            (data[currentOffset] - data[candidateOffset]) ** 2
            + (data[currentOffset + 1] - data[candidateOffset + 1]) ** 2
            + (data[currentOffset + 2] - data[candidateOffset + 2]) ** 2
        );
        if (distanceSquared <= localThresholdSquared) {
            queue[queueEnd] = candidatePixelIndex;
            queueEnd += 1;
        }
    };

    while (queueStart < queueEnd) {
        const pixelIndex = queue[queueStart];
        queueStart += 1;
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);
        if (x > 0) enqueueNeighbour(pixelIndex, pixelIndex - 1);
        if (x + 1 < width) enqueueNeighbour(pixelIndex, pixelIndex + 1);
        if (y > 0) enqueueNeighbour(pixelIndex, pixelIndex - width);
        if (y + 1 < height) enqueueNeighbour(pixelIndex, pixelIndex + width);
    }

    const removedRatio = queueEnd / pixelCount;
    if (removedRatio < 0.05 || removedRatio > 0.94) return pngBuffer;
    for (let index = 0; index < queueEnd; index += 1) {
        data[queue[index] * channels + alphaOffset] = 0;
    }
    return sharp(data, {
        raw: { width, height, channels },
    }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

/**
 * Removes the flattened contact-shadow ellipses that image models sometimes
 * attach to shoes despite a transparent-background request. These are not
 * separate alpha components, so ordinary connected-component cleanup cannot
 * remove them. Restricting the mask to wide, shallow, low-saturation bands in
 * the bottom 18% protects shoes, legs, clothing, and ordinary character detail.
 */
async function removeGroundShadowBands(pngBuffer: Buffer): Promise<Buffer> {
    const { data, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const pixelCount = width * height;
    const alphaOffset = channels - 1;
    const candidate = new Uint8Array(pixelCount);
    const scanStartY = Math.floor(height * 0.7);

    for (let y = scanStartY; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const pixelIndex = y * width + x;
            const offset = pixelIndex * channels;
            if (data[offset + alphaOffset] <= 32) continue;
            const red = data[offset];
            const green = data[offset + 1];
            const blue = data[offset + 2];
            const maximum = Math.max(red, green, blue);
            const minimum = Math.min(red, green, blue);
            const saturation = maximum ? (maximum - minimum) / maximum : 0;
            if (maximum >= 80 && saturation <= 0.45) candidate[pixelIndex] = 1;
        }
    }

    const labels = new Int32Array(pixelCount);
    labels.fill(-1);
    const queue = new Int32Array(pixelCount);
    const removable = new Set<number>();
    let componentIndex = 0;
    const minimumWidth = Math.max(48, Math.round(width * 0.12));
    const maximumHeight = Math.max(18, Math.round(height * 0.12));
    const minimumPixels = Math.max(180, Math.round(pixelCount * 0.001));
    const minimumY = Math.floor(height * 0.82);

    for (let start = scanStartY * width; start < pixelCount; start += 1) {
        if (!candidate[start] || labels[start] !== -1) continue;
        let queueStart = 0;
        let queueEnd = 0;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        labels[start] = componentIndex;
        queue[queueEnd] = start;
        queueEnd += 1;
        while (queueStart < queueEnd) {
            const pixelIndex = queue[queueStart];
            queueStart += 1;
            const x = pixelIndex % width;
            const y = Math.floor(pixelIndex / width);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            for (const neighbour of [
                pixelIndex - 1,
                pixelIndex + 1,
                pixelIndex - width,
                pixelIndex + width,
            ]) {
                if (neighbour < 0 || neighbour >= pixelCount) continue;
                const neighbourY = Math.floor(neighbour / width);
                const neighbourX = neighbour - neighbourY * width;
                if (Math.abs(neighbourX - x) + Math.abs(neighbourY - y) !== 1) continue;
                if (!candidate[neighbour] || labels[neighbour] !== -1) continue;
                labels[neighbour] = componentIndex;
                queue[queueEnd] = neighbour;
                queueEnd += 1;
            }
        }
        const componentWidth = maxX - minX + 1;
        const componentHeight = maxY - minY + 1;
        const aspectRatio = componentWidth / Math.max(1, componentHeight);
        if (
            minY >= minimumY
            && componentWidth >= minimumWidth
            && componentHeight <= maximumHeight
            && aspectRatio >= 3.5
            && queueEnd >= minimumPixels
        ) {
            removable.add(componentIndex);
        }
        componentIndex += 1;
    }
    if (!removable.size) return pngBuffer;
    for (let pixelIndex = scanStartY * width; pixelIndex < pixelCount; pixelIndex += 1) {
        if (!removable.has(labels[pixelIndex])) continue;
        const offset = pixelIndex * channels;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + alphaOffset] = 0;
    }
    return sharp(data, {
        raw: { width, height, channels },
    }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

/**
 * Keeps the main character intact while removing tiny, disconnected artifacts
 * that image models sometimes leave around an otherwise transparent sticker.
 * Large or connected scenery is deliberately left for the AI quality gate so
 * this local cleanup never erases a meaningful part of the character.
 */
async function removeDistantResidualComponents(
    pngBuffer: Buffer,
    options: { preserveIntentionalDetachedComponents?: boolean } = {},
): Promise<Buffer> {
    const { data, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const pixelCount = width * height;
    const alphaOffset = channels - 1;
    const labels = new Int32Array(pixelCount);
    labels.fill(-1);
    const queue = new Int32Array(pixelCount);
    const components: Array<{
        count: number;
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        touchesBorder: boolean;
    }> = [];

    for (let start = 0; start < pixelCount; start += 1) {
        if (labels[start] !== -1 || data[start * channels + alphaOffset] <= 32) continue;
        const componentIndex = components.length;
        let queueStart = 0;
        let queueEnd = 0;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        labels[start] = componentIndex;
        queue[queueEnd] = start;
        queueEnd += 1;
        while (queueStart < queueEnd) {
            const pixelIndex = queue[queueStart];
            queueStart += 1;
            const x = pixelIndex % width;
            const y = Math.floor(pixelIndex / width);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            if (x > 0) {
                const candidate = pixelIndex - 1;
                if (labels[candidate] === -1 && data[candidate * channels + alphaOffset] > 32) {
                    labels[candidate] = componentIndex;
                    queue[queueEnd] = candidate;
                    queueEnd += 1;
                }
            }
            if (x + 1 < width) {
                const candidate = pixelIndex + 1;
                if (labels[candidate] === -1 && data[candidate * channels + alphaOffset] > 32) {
                    labels[candidate] = componentIndex;
                    queue[queueEnd] = candidate;
                    queueEnd += 1;
                }
            }
            if (y > 0) {
                const candidate = pixelIndex - width;
                if (labels[candidate] === -1 && data[candidate * channels + alphaOffset] > 32) {
                    labels[candidate] = componentIndex;
                    queue[queueEnd] = candidate;
                    queueEnd += 1;
                }
            }
            if (y + 1 < height) {
                const candidate = pixelIndex + width;
                if (labels[candidate] === -1 && data[candidate * channels + alphaOffset] > 32) {
                    labels[candidate] = componentIndex;
                    queue[queueEnd] = candidate;
                    queueEnd += 1;
                }
            }
        }
        components.push({
            count: queueEnd,
            minX,
            minY,
            maxX,
            maxY,
            touchesBorder: minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1,
        });
    }
    if (components.length < 2) return pngBuffer;
    const interiorComponentIndices = components
        .map((component, index) => ({ component, index }))
        .filter(({ component }) => !component.touchesBorder)
        .map(({ index }) => index);
    const mainCandidates = interiorComponentIndices.length
        ? interiorComponentIndices
        : components.map((_, index) => index);
    const mainIndex = mainCandidates.reduce((bestIndex, index) => (
        components[index].count > components[bestIndex].count ? index : bestIndex
    ), mainCandidates[0]);
    const main = components[mainIndex];
    // Authorized props and compact motion accents can be disconnected from the
    // main silhouette, but that must not disable residue cleanup altogether.
    // In that mode retain plausible drawn components while still removing
    // isolated specks and provider debris.
    const minArtifactPixels = options.preserveIntentionalDetachedComponents
        ? Math.max(48, Math.round(pixelCount * 0.0005))
        : Math.max(120, Math.round(pixelCount * 0.0035));
    const separation = Math.max(12, Math.round(Math.min(width, height) * 0.025));
    const removable = new Set<number>();
    components.forEach((component, index) => {
        if (index === mainIndex) return;
        // Provider responses can contain a large, faint frame or gradient
        // connected to the canvas edge even when the character itself is
        // correctly transparent. It is never a valid sticker component.
        if (component.touchesBorder) {
            removable.add(index);
            return;
        }
        if (component.count >= minArtifactPixels) return;
        const horizontalGap = component.maxX < main.minX
            ? main.minX - component.maxX
            : main.maxX < component.minX
                ? component.minX - main.maxX
                : 0;
        const verticalGap = component.maxY < main.minY
            ? main.minY - component.maxY
            : main.maxY < component.minY
                ? component.minY - main.maxY
                : 0;
        if (horizontalGap >= separation || verticalGap >= separation) removable.add(index);
    });
    if (!removable.size) return pngBuffer;
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        if (removable.has(labels[pixelIndex])) data[pixelIndex * channels + alphaOffset] = 0;
    }
    return sharp(data, {
        raw: { width, height, channels },
    }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function sanitizeTransparentPixelRgb(pngBuffer: Buffer): Promise<Buffer> {
    const { data, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const alphaOffset = info.channels - 1;
    let changed = false;
    for (let offset = 0; offset < data.length; offset += info.channels) {
        if (data[offset + alphaOffset] > 32) continue;
        // Some image models leave complete duplicate silhouettes only in RGB
        // values under near-zero alpha. They are invisible in the delivered
        // sticker but can reappear in vision review or later compositing.
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + alphaOffset] = 0;
        changed = true;
    }
    if (!changed) return pngBuffer;
    return sharp(data, {
        raw: { width: info.width, height: info.height, channels: info.channels },
    }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

export async function normalizeEmoticonSourceImage(buffer: Buffer): Promise<Buffer> {
    return normalizeInputImage({
        buffer,
        maxBytes: MAX_SOURCE_BYTES,
        maxOutputDimension: 1800,
        label: 'Source image',
    });
}

export async function normalizeGeneratedEmoticonPose(
    buffer: Buffer,
    options: { preserveDetachedComponents?: boolean } = {},
): Promise<Buffer> {
    const normalized = await normalizeInputImage({
        buffer,
        maxBytes: MAX_GENERATED_POSE_BYTES,
        maxOutputDimension: 2048,
        label: 'Generated pose',
    });
    const flatBackgroundRemoved = await removeConnectedFlatBackground(normalized);
    const transparent = await removeConnectedSmoothBackground(flatBackgroundRemoved);
    const shadowRemoved = await removeGroundShadowBands(transparent);
    const residueRemoved = await removeDistantResidualComponents(shadowRemoved, {
        preserveIntentionalDetachedComponents: options.preserveDetachedComponents,
    });
    return sanitizeTransparentPixelRgb(residueRemoved);
}

export type EmoticonAlphaIsolationInspection = {
    passed: boolean;
    transparentPixelRatio: number;
    visiblePixelRatio: number;
    transparentBorderRatio: number;
};

/**
 * Uses the encoded alpha channel as the source of truth for background
 * isolation. Vision reviewers can see RGB values hidden under fully
 * transparent pixels and incorrectly describe them as a visible background.
 */
export async function inspectEmoticonAlphaIsolation(
    pngBuffer: Buffer,
): Promise<EmoticonAlphaIsolationInspection> {
    const { data, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const pixelCount = width * height;
    const alphaOffset = channels - 1;
    let transparentPixels = 0;
    let visiblePixels = 0;
    let transparentBorderPixels = 0;
    let borderPixels = 0;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = data[(y * width + x) * channels + alphaOffset];
            if (alpha <= 32) transparentPixels += 1;
            if (alpha > 32) visiblePixels += 1;
            if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
                borderPixels += 1;
                if (alpha <= 32) transparentBorderPixels += 1;
            }
        }
    }

    const transparentPixelRatio = transparentPixels / pixelCount;
    const visiblePixelRatio = visiblePixels / pixelCount;
    const transparentBorderRatio = transparentBorderPixels / borderPixels;
    return {
        passed: transparentPixelRatio >= 0.05
            && visiblePixelRatio >= 0.01
            && visiblePixelRatio <= 0.95
            && transparentBorderRatio >= 0.985,
        transparentPixelRatio: Number(transparentPixelRatio.toFixed(6)),
        visiblePixelRatio: Number(visiblePixelRatio.toFixed(6)),
        transparentBorderRatio: Number(transparentBorderRatio.toFixed(6)),
    };
}

export type EmoticonFrameVariation = {
    passes: boolean;
    duplicateFrameIndices: number[];
    transitionOutlierIndices: number[];
    transitionDifferences: number[];
    loopDifference: number;
    alignedTransitionDifferences: number[];
    alignedMedianDifference: number;
    rigidMotionOnly: boolean;
};

const FRAME_VARIATION_ANALYSIS_SIZE = 64;
const FRAME_DUPLICATE_THRESHOLD = 0.004;
const FRAME_NON_ADJACENT_DUPLICATE_THRESHOLD = 0.0005;
const FRAME_SILHOUETTE_DUPLICATE_THRESHOLD = 0.006;

async function createFrameVariationFingerprint(buffer: Buffer): Promise<Uint8Array> {
    const { data } = await sharp(buffer)
        .ensureAlpha()
        .resize({
            width: FRAME_VARIATION_ANALYSIS_SIZE,
            height: FRAME_VARIATION_ANALYSIS_SIZE,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .raw()
        .toBuffer({ resolveWithObject: true });
    return data;
}

async function createAlignedFrameVariationFingerprint(buffer: Buffer): Promise<Uint8Array> {
    const { data } = await sharp(buffer)
        .ensureAlpha()
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .resize({
            width: FRAME_VARIATION_ANALYSIS_SIZE,
            height: FRAME_VARIATION_ANALYSIS_SIZE,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .raw()
        .toBuffer({ resolveWithObject: true });
    return data;
}

function calculateFrameDifference(first: Uint8Array, second: Uint8Array): number {
    if (first.length !== second.length || first.length % 4 !== 0) return 1;
    let difference = 0;
    for (let offset = 0; offset < first.length; offset += 4) {
        const firstAlpha = first[offset + 3] / 255;
        const secondAlpha = second[offset + 3] / 255;
        difference += Math.abs(firstAlpha - secondAlpha);
        difference += Math.abs((first[offset] / 255) * firstAlpha - (second[offset] / 255) * secondAlpha);
        difference += Math.abs((first[offset + 1] / 255) * firstAlpha - (second[offset + 1] / 255) * secondAlpha);
        difference += Math.abs((first[offset + 2] / 255) * firstAlpha - (second[offset + 2] / 255) * secondAlpha);
    }
    return difference / first.length;
}

function calculateFrameSilhouetteDifference(first: Uint8Array, second: Uint8Array): number {
    if (first.length !== second.length || first.length % 4 !== 0) return 1;
    let difference = 0;
    for (let offset = 3; offset < first.length; offset += 4) {
        difference += Math.abs(first[offset] - second[offset]) / 255;
    }
    return difference / (first.length / 4);
}

/**
 * A deterministic safety net for exact or near-exact duplicate generated
 * frames. It does not judge artistic quality; the multimodal reviewer remains
 * responsible for anatomy, identity, and genuine limb/expression motion.
 */
export async function evaluateEmoticonFrameVariation(
    frameBuffers: Buffer[],
    options: { requireSilhouetteVariation?: boolean } = {},
): Promise<EmoticonFrameVariation> {
    if (frameBuffers.length < 2) {
        return {
            passes: false,
            duplicateFrameIndices: [0],
            transitionOutlierIndices: [0],
            transitionDifferences: [],
            loopDifference: 0,
            alignedTransitionDifferences: [],
            alignedMedianDifference: 0,
            rigidMotionOnly: true,
        };
    }
    const [fingerprints, alignedFingerprints] = await Promise.all([
        Promise.all(frameBuffers.map(createFrameVariationFingerprint)),
        Promise.all(frameBuffers.map(createAlignedFrameVariationFingerprint)),
    ]);
    const transitionDifferences = fingerprints.map((frame, index) => (
        calculateFrameDifference(frame, fingerprints[(index + 1) % fingerprints.length])
    ));
    const alignedTransitionDifferences = alignedFingerprints.map((frame, index) => (
        calculateFrameDifference(frame, alignedFingerprints[(index + 1) % alignedFingerprints.length])
    ));
    const adjacentDuplicateFrameIndices = transitionDifferences
        .map((difference, index) => (difference < FRAME_DUPLICATE_THRESHOLD ? (index + 1) % fingerprints.length : -1))
        .filter((index) => index >= 0);
    const allPairDuplicateFrameIndices = new Set<number>();
    for (let firstIndex = 0; firstIndex < fingerprints.length - 1; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < fingerprints.length; secondIndex += 1) {
            const rgbaDifference = calculateFrameDifference(
                fingerprints[firstIndex],
                fingerprints[secondIndex],
            );
            const silhouetteDifference = calculateFrameSilhouetteDifference(
                fingerprints[firstIndex],
                fingerprints[secondIndex],
            );
            if (
                rgbaDifference < FRAME_NON_ADJACENT_DUPLICATE_THRESHOLD
                || (
                    options.requireSilhouetteVariation
                    && silhouetteDifference < FRAME_SILHOUETTE_DUPLICATE_THRESHOLD
                )
            ) {
                allPairDuplicateFrameIndices.add(secondIndex);
            }
        }
    }
    const duplicateFrameIndices = [...new Set([
        ...adjacentDuplicateFrameIndices,
        ...allPairDuplicateFrameIndices,
    ])].sort((left, right) => left - right);
    const chronologicalDifferences = [...transitionDifferences.slice(0, -1)].sort((a, b) => a - b);
    const medianDifference = chronologicalDifferences.length
        ? chronologicalDifferences[Math.floor(chronologicalDifferences.length / 2)]
        : transitionDifferences[0];
    const outlierThreshold = Math.max(0.18, medianDifference * 3.5);
    const transitionOutlierIndices = transitionDifferences
        .map((difference, index) => (difference > outlierThreshold ? (index + 1) % fingerprints.length : -1))
        .filter((index) => index >= 0);
    const chronologicalAlignedDifferences = [...alignedTransitionDifferences.slice(0, -1)]
        .sort((left, right) => left - right);
    const alignedMedianDifference = chronologicalAlignedDifferences.length
        ? chronologicalAlignedDifferences[Math.floor(chronologicalAlignedDifferences.length / 2)]
        : alignedTransitionDifferences[0] || 0;
    const meaningfulAlignedTransitions = chronologicalAlignedDifferences
        .filter((difference) => difference >= 0.04)
        .length;
    const requiredMeaningfulTransitions = Math.max(
        2,
        Math.ceil(Math.max(1, frameBuffers.length - 1) * 0.4),
    );
    const rigidMotionOnly = Boolean(
        options.requireSilhouetteVariation
        && (
            alignedMedianDifference < 0.028
            || meaningfulAlignedTransitions < requiredMeaningfulTransitions
        )
    );
    return {
        passes: duplicateFrameIndices.length === 0
            && transitionOutlierIndices.length === 0
            && !rigidMotionOnly,
        duplicateFrameIndices,
        transitionOutlierIndices,
        transitionDifferences,
        loopDifference: transitionDifferences[transitionDifferences.length - 1] || 0,
        alignedTransitionDifferences,
        alignedMedianDifference,
        rigidMotionOnly,
    };
}

function resolveFfmpegPath(): string {
    const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const candidates = [
        process.env.FFMPEG_BIN?.trim(),
        ffmpegPath,
        join(process.cwd(), 'node_modules', 'ffmpeg-static', executableName),
    ].filter((candidate): candidate is string => Boolean(candidate));
    const binary = candidates.find((candidate) => existsSync(candidate));
    if (!binary) throw new Error('FFmpeg executable was not found.');
    return binary;
}

async function runFfmpegCapture(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const binary = resolveFfmpegPath();
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(binary, args, { windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }
            reject(new Error(stderr.slice(-5000) || `FFmpeg exited with code ${code}`));
        });
    });
}

async function runFfmpeg(args: string[]): Promise<void> {
    await runFfmpegCapture(args);
}

async function withTempDir<T>(prefix: string, task: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    try {
        return await task(dir);
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function splitBubbleText(text: string, isSide: boolean): string[] {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (!normalized) return [];
    const maxChars = isSide ? 12 : 18;
    const maxLines = isSide ? 3 : 2;
    const lines: string[] = [];
    let remaining = normalized;
    while (remaining && lines.length < maxLines) {
        if (remaining.length <= maxChars) {
            lines.push(remaining);
            remaining = '';
            break;
        }
        const candidate = remaining.slice(0, maxChars + 1);
        const spaceIndex = candidate.lastIndexOf(' ');
        const splitAt = spaceIndex >= Math.floor(maxChars * 0.55) ? spaceIndex : maxChars;
        lines.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
    }
    if (remaining && lines.length) {
        lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, maxChars - 1)}…`;
    }
    return lines;
}

export type ResolvedEmoticonBubbleFrame = {
    text: string;
    startFrame: number;
    endFrame: number;
};

const LEGACY_BUBBLE_TIMELINE: EmoticonBubble['timeline'] = {
    mode: 'full',
    startFrame: 0,
    endFrame: null,
    cues: [],
};

/**
 * Completed jobs created before timeline editing was introduced do not have a
 * timeline field. Keep those jobs rerenderable while all newly parsed jobs use
 * the schema default.
 */
function getBubbleTimeline(bubble: EmoticonBubble): EmoticonBubble['timeline'] {
    return (bubble as unknown as { timeline?: EmoticonBubble['timeline'] }).timeline
        || LEGACY_BUBBLE_TIMELINE;
}

function assertBubbleTimeline(bubble: EmoticonBubble, frameCount: number): void {
    const timeline = getBubbleTimeline(bubble);
    const usesStartFrame = timeline.mode === 'outro' || timeline.mode === 'range';
    const usesEndFrame = timeline.mode === 'intro'
        || timeline.mode === 'outro'
        || timeline.mode === 'range';
    if (usesStartFrame && timeline.startFrame >= frameCount) {
        throw new Error('Speech-bubble start frame is outside the animation timeline.');
    }
    if (usesEndFrame && timeline.endFrame !== null && timeline.endFrame >= frameCount) {
        throw new Error('Speech-bubble end frame is outside the animation timeline.');
    }
    for (const cue of timeline.cues) {
        if (cue.startFrame >= frameCount || cue.endFrame >= frameCount) {
            throw new Error(`Speech-bubble cue ${cue.id} is outside the animation timeline.`);
        }
    }
}

export function resolveEmoticonBubbleFrame(
    bubble: EmoticonBubble,
    frameIndex: number,
    frameCount: number,
): ResolvedEmoticonBubbleFrame | null {
    if (bubble.style === 'none' || frameIndex < 0 || frameIndex >= frameCount) return null;
    assertBubbleTimeline(bubble, frameCount);
    const timeline = getBubbleTimeline(bubble);

    // Later cues intentionally win when ranges overlap. This keeps persisted
    // user ordering deterministic without making old timelines unreadable.
    for (let index = timeline.cues.length - 1; index >= 0; index -= 1) {
        const cue = timeline.cues[index];
        if (frameIndex >= cue.startFrame && frameIndex <= cue.endFrame) {
            return { text: cue.text, startFrame: cue.startFrame, endFrame: cue.endFrame };
        }
    }
    if (timeline.mode === 'cues' || !bubble.text.trim()) return null;

    const lastFrame = frameCount - 1;
    let startFrame = 0;
    let endFrame = lastFrame;
    if (timeline.mode === 'intro') {
        endFrame = timeline.endFrame ?? Math.max(0, Math.ceil(frameCount * 0.35) - 1);
    } else if (timeline.mode === 'outro') {
        startFrame = timeline.startFrame > 0
            ? timeline.startFrame
            : Math.min(lastFrame, Math.floor(frameCount * 0.65));
        endFrame = timeline.endFrame ?? lastFrame;
    } else if (timeline.mode === 'range') {
        startFrame = timeline.startFrame;
        endFrame = timeline.endFrame ?? lastFrame;
    }
    if (frameIndex < startFrame || frameIndex > endFrame) return null;
    return { text: bubble.text.trim(), startFrame, endFrame };
}

function bubbleOpacity(
    plan: EmoticonPlan,
    frameIndex: number,
    resolved: ResolvedEmoticonBubbleFrame,
): number {
    if (plan.bubble.entrance === 'none') return 1;
    const rangeLength = resolved.endFrame - resolved.startFrame + 1;
    const entranceFrames = Math.max(
        1,
        Math.min(rangeLength, Math.max(2, Math.round(plan.action.frameCount * 0.2))),
    );
    const localFrameIndex = frameIndex - resolved.startFrame;
    return Math.min(1, (localFrameIndex + 1) / entranceFrames);
}

type BubblePosition = EmoticonPlan['bubble']['position'];

type ResolvedBubbleAppearance = {
    size: number;
    fillColor: string;
    textColor: string;
    outlineColor: string;
    outlineWidth: number;
    shadowOpacity: number;
    offsetX: number;
    offsetY: number;
};

const BUBBLE_HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.min(maximum, Math.max(minimum, value))
        : fallback;
}

/**
 * Jobs created before the appearance controls existed do not contain these
 * fields. Resolve and clamp them at render time as a final defensive boundary,
 * even though current requests are also validated by Zod and Firestore rules.
 */
function getBubbleAppearance(bubble: EmoticonBubble): ResolvedBubbleAppearance {
    const legacy = bubble as EmoticonBubble & Partial<ResolvedBubbleAppearance>;
    const safeColor = (value: unknown, fallback: string) => (
        typeof value === 'string' && BUBBLE_HEX_COLOR.test(value) ? value : fallback
    );
    return {
        size: clampNumber(legacy.size, 0.75, 1.2, EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.size),
        fillColor: safeColor(legacy.fillColor, EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.fillColor),
        textColor: safeColor(legacy.textColor, EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.textColor),
        outlineColor: safeColor(legacy.outlineColor, EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.outlineColor),
        outlineWidth: clampNumber(legacy.outlineWidth, 0, 10, EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.outlineWidth),
        shadowOpacity: clampNumber(legacy.shadowOpacity, 0, 0.75, EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.shadowOpacity),
        offsetX: Math.round(clampNumber(legacy.offsetX, -48, 48, EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.offsetX)),
        offsetY: Math.round(clampNumber(legacy.offsetY, -48, 48, EMOTICON_BUBBLE_APPEARANCE_DEFAULTS.offsetY)),
    };
}

type BubbleLayout = {
    position: BubblePosition;
    isSide: boolean;
    lines: string[];
    width: number;
    height: number;
    x: number;
    y: number;
};

function hasSpeechBubble(plan: EmoticonPlan): boolean {
    const timeline = getBubbleTimeline(plan.bubble);
    return plan.bubble.style !== 'none'
        && (
            (timeline.mode !== 'cues' && Boolean(plan.bubble.text.trim()))
            || timeline.cues.length > 0
        );
}

function getBubbleLayout(
    plan: EmoticonPlan,
    resolved: ResolvedEmoticonBubbleFrame | null,
    position = plan.bubble.position,
): BubbleLayout | null {
    if (!resolved) return null;
    const isSide = position === 'left' || position === 'right';
    const lines = splitBubbleText(resolved.text, isSide);
    if (!lines.length) return null;
    const appearance = getBubbleAppearance(plan.bubble);
    const baseWidth = Math.min(
        isSide ? 190 : 314,
        Math.max(isSide ? 126 : 142, Math.max(...lines.map((line) => line.length)) * (isSide ? 18 : 24) + 42),
    );
    const baseHeight = lines.length > 2 ? 112 : lines.length > 1 ? 90 : 70;
    const tailClearance = Math.ceil(26 * appearance.size + appearance.outlineWidth / 2);
    const minimumCharacterWidth = 82;
    const minimumCharacterHeight = 154;
    const characterEdgeMargin = 10;
    const shadowPadding = appearance.shadowOpacity > 0 ? 12 : 0;
    const minimumMargin = Math.ceil(4 + appearance.outlineWidth / 2 + shadowPadding);
    const availableWidth = isSide
        ? CANVAS_SIZE - minimumCharacterWidth - characterEdgeMargin - tailClearance - minimumMargin * 2
        : CANVAS_SIZE - minimumMargin * 2;
    const availableHeight = isSide
        ? CANVAS_SIZE - minimumMargin * 2
        : CANVAS_SIZE - minimumCharacterHeight - tailClearance - minimumMargin * 2;
    const width = Math.max(1, Math.min(availableWidth, Math.round(baseWidth * appearance.size)));
    const height = Math.max(1, Math.min(availableHeight, Math.round(baseHeight * appearance.size)));
    const baseX = position === 'left'
        ? 10
        : position === 'right'
            ? CANVAS_SIZE - width - 10
            : Math.round((CANVAS_SIZE - width) / 2);
    const baseY = position === 'bottom'
        ? CANVAS_SIZE - height - 12
        : isSide
            ? 16
            : 10;
    const minX = minimumMargin;
    const maxX = position === 'left'
        ? CANVAS_SIZE - minimumCharacterWidth - characterEdgeMargin - tailClearance - minimumMargin - width
        : position === 'right'
            ? CANVAS_SIZE - width - minimumMargin
            : CANVAS_SIZE - width - minimumMargin;
    const minPositionX = position === 'right'
        ? minimumCharacterWidth + characterEdgeMargin + tailClearance + minimumMargin
        : minX;
    const minY = position === 'bottom'
        ? minimumCharacterHeight + tailClearance + minimumMargin
        : minimumMargin;
    const maxY = position === 'top'
        ? CANVAS_SIZE - minimumCharacterHeight - tailClearance - minimumMargin - height
        : CANVAS_SIZE - height - minimumMargin;
    const x = Math.max(minPositionX, Math.min(maxX, baseX + appearance.offsetX));
    const y = Math.max(minY, Math.min(maxY, baseY + appearance.offsetY));
    return { position, isSide, lines, width, height, x, y };
}

function getBubbleFontStyle(plan: EmoticonPlan): {
    family: string;
    weight: number;
    letterSpacing: number;
    italic: boolean;
    strokeWidth: number;
    sizeMultiplier: number;
} {
    switch (plan.bubble.font || 'clean') {
        case 'round':
            return {
                family: 'Nanum Gothic, sans-serif',
                weight: 900,
                letterSpacing: 0.35,
                italic: false,
                strokeWidth: 0.45,
                sizeMultiplier: 1,
            };
        case 'handwriting':
            return {
                family: 'Nanum Pen Script, cursive',
                weight: 800,
                letterSpacing: 0.6,
                italic: true,
                strokeWidth: 0,
                sizeMultiplier: 1.06,
            };
        case 'bold':
            return {
                family: 'Nanum Gothic, sans-serif',
                weight: 900,
                letterSpacing: -0.2,
                italic: false,
                strokeWidth: 0.8,
                sizeMultiplier: 0.94,
            };
        case 'serif':
            return {
                family: 'Nanum Myeongjo, serif',
                weight: 800,
                letterSpacing: 0.15,
                italic: false,
                strokeWidth: 0,
                sizeMultiplier: 0.98,
            };
        case 'clean':
        default:
            return {
                family: 'Nanum Gothic, sans-serif',
                weight: 800,
                letterSpacing: 0,
                italic: false,
                strokeWidth: 0,
                sizeMultiplier: 1,
            };
    }
}

function createBubbleSvg(
    plan: EmoticonPlan,
    frameIndex: number,
    resolved: ResolvedEmoticonBubbleFrame | null,
    layout = getBubbleLayout(plan, resolved),
): Buffer | null {
    if (!layout) return null;
    const { position, isSide, lines, width, height, x, y } = layout;
    if (!resolved) return null;
    const opacity = bubbleOpacity(plan, frameIndex, resolved);
    const popScale = plan.bubble.entrance === 'pop' ? 0.82 + opacity * 0.18 : 1;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const localFrameIndex = frameIndex - resolved.startFrame;
    const shakeX = plan.bubble.entrance === 'shake'
        ? Math.sin(localFrameIndex * Math.PI * 1.7) * 7 * (1 - opacity)
        : 0;
    const transform = `translate(${shakeX} 0) translate(${centerX} ${centerY}) scale(${popScale}) translate(${-centerX} ${-centerY})`;
    const appearance = getBubbleAppearance(plan.bubble);
    const borderDash = plan.bubble.style === 'whisper'
        ? `stroke-dasharray="${Math.round(6 * appearance.size)} ${Math.round(5 * appearance.size)}"`
        : '';
    const fill = appearance.fillColor;
    const stroke = appearance.outlineColor;
    const strokeWidth = appearance.outlineWidth;
    const radius = Math.round(
        (plan.bubble.style === 'rounded' || plan.bubble.style === 'whisper' ? 24 : 16)
        * appearance.size,
    );
    const baseFontSize = isSide
        ? lines.some((line) => line.length > 10)
            ? 12
            : lines.length > 2 || lines.some((line) => line.length > 7)
                ? 15
                : 20
        : lines.some((line) => line.length > 15)
            ? 16
            : lines.some((line) => line.length > 11)
                ? 18
                : 24;
    const font = getBubbleFontStyle(plan);
    const fontSize = Math.max(10, Math.round(baseFontSize * font.sizeMultiplier * appearance.size));
    const lineGap = Math.max(fontSize + 4, Math.round(27 * appearance.size));
    const textY = centerY - ((lines.length - 1) * lineGap) / 2 + fontSize * 0.36;
    const text = lines.map((line, index) => (
        `<text x="${centerX}" y="${textY + index * lineGap}" text-anchor="middle" `
        + `font-family="${font.family}" font-size="${fontSize}" `
        + `font-weight="${font.weight}" letter-spacing="${font.letterSpacing}" `
        + `${font.italic ? 'font-style="italic" ' : ''}`
        + `${font.strokeWidth ? `stroke="${appearance.textColor}" stroke-width="${font.strokeWidth}" paint-order="stroke" ` : ''}`
        + `fill="${appearance.textColor}">${escapeXml(line)}</text>`
    )).join('');

    const shape = plan.bubble.style === 'shout'
        ? `<polygon points="${x + 10},${y + height * 0.48} ${x},${y + 8} ${x + width * 0.22},${y + 16} ${x + width * 0.35},${y} ${x + width * 0.52},${y + 14} ${x + width * 0.76},${y + 2} ${x + width - 8},${y + 20} ${x + width},${y + height * 0.58} ${x + width - 18},${y + height - 2} ${x + width * 0.56},${y + height - 12} ${x + width * 0.48},${y + height + 9} ${x + width * 0.38},${y + height - 12} ${x + 14},${y + height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
        : `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${borderDash}/>`;

    const tailScale = appearance.size;
    const thoughtTail = position === 'bottom'
        ? `<circle cx="${centerX + 8 * tailScale}" cy="${y - 10 * tailScale}" r="${7 * tailScale}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><circle cx="${centerX + 18 * tailScale}" cy="${y - 22 * tailScale}" r="${4 * tailScale}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
        : position === 'left'
            ? `<circle cx="${x + width + 10 * tailScale}" cy="${centerY + 4 * tailScale}" r="${7 * tailScale}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><circle cx="${x + width + 22 * tailScale}" cy="${centerY + 12 * tailScale}" r="${4 * tailScale}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
            : position === 'right'
                ? `<circle cx="${x - 10 * tailScale}" cy="${centerY + 4 * tailScale}" r="${7 * tailScale}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><circle cx="${x - 22 * tailScale}" cy="${centerY + 12 * tailScale}" r="${4 * tailScale}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
                : `<circle cx="${centerX + 8 * tailScale}" cy="${y + height + 10 * tailScale}" r="${7 * tailScale}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><circle cx="${centerX + 18 * tailScale}" cy="${y + height + 22 * tailScale}" r="${4 * tailScale}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    const regularTailWidth = 12 * tailScale;
    const regularTailTip = 17 * tailScale;
    const regularTailOffset = 4 * tailScale;
    const regularTail = position === 'bottom'
        ? `<path d="M ${centerX - regularTailWidth} ${y + 2} L ${centerX + regularTailOffset} ${y - regularTailTip} L ${centerX + 18 * tailScale} ${y + 2} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
        : position === 'left'
            ? `<path d="M ${x + width - 2} ${centerY - regularTailWidth} L ${x + width + regularTailTip} ${centerY + regularTailOffset} L ${x + width - 2} ${centerY + 18 * tailScale} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
            : position === 'right'
                ? `<path d="M ${x + 2} ${centerY - regularTailWidth} L ${x - regularTailTip} ${centerY + regularTailOffset} L ${x + 2} ${centerY + 18 * tailScale} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
                : `<path d="M ${centerX - regularTailWidth} ${y + height - 2} L ${centerX + regularTailOffset} ${y + height + regularTailTip} L ${centerX + 18 * tailScale} ${y + height - 2} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`;
    const tail = plan.bubble.style === 'thought'
        ? thoughtTail
        : plan.bubble.style === 'shout'
            ? ''
            : regularTail;

    const shadowFilter = appearance.shadowOpacity > 0
        ? `<defs><filter id="bubble-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="${appearance.shadowOpacity}"/></filter></defs>`
        : '';
    const shadowAttribute = appearance.shadowOpacity > 0 ? ' filter="url(#bubble-shadow)"' : '';
    return Buffer.from(
        `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">`
        + `${shadowFilter}<g opacity="${opacity}" transform="${transform}"><g${shadowAttribute}>${shape}${tail}</g>${text}</g></svg>`,
    );
}

type MotionTransform = {
    x: number;
    y: number;
    rotation: number;
    scale: number;
};

function getMotionTransform(plan: EmoticonPlan, index: number): MotionTransform {
    const phase = (index / plan.action.frameCount) * Math.PI * 2;
    const strength = plan.action.intensity === 'exaggerated' ? 1.5 : plan.action.intensity === 'subtle' ? 0.65 : 1;
    switch (plan.action.motionType) {
        case 'jump':
            return {
                x: 0,
                y: -Math.round(Math.max(0, Math.sin(phase)) * 34 * strength),
                rotation: Math.sin(phase) * 2 * strength,
                scale: 1 + Math.max(0, Math.sin(phase)) * 0.045 * strength,
            };
        case 'shake':
            return {
                x: Math.round(Math.sin(phase * 3) * 7 * strength),
                y: 0,
                rotation: Math.sin(phase * 3) * 2.5 * strength,
                scale: 1,
            };
        case 'wave':
            return {
                x: Math.round(Math.sin(phase) * 2),
                y: Math.round(Math.cos(phase) * 3),
                rotation: Math.sin(phase) * 4 * strength,
                scale: 1,
            };
        case 'talk':
            return {
                x: 0,
                y: Math.round(Math.sin(phase * 2) * 2),
                rotation: Math.sin(phase) * 1.2,
                scale: 1 + Math.max(0, Math.sin(phase * 2)) * 0.018,
            };
        case 'dynamic':
            return {
                x: Math.round(Math.sin(phase) * 4 * strength),
                y: -Math.round(Math.max(0, Math.sin(phase)) * 20 * strength),
                rotation: Math.sin(phase) * 4 * strength,
                scale: 1 + Math.max(0, Math.sin(phase)) * 0.035,
            };
        case 'bob':
        default:
            return {
                x: 0,
                y: Math.round(Math.sin(phase) * 5 * strength),
                rotation: Math.sin(phase) * 1.5,
                scale: 1 + Math.max(0, Math.sin(phase)) * 0.012,
            };
    }
}

async function normalizeCharacter(buffer: Buffer, plan: EmoticonPlan): Promise<Buffer> {
    const target = getCharacterTargetSize(plan);
    return sharp(buffer)
        .ensureAlpha()
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .resize({
            width: target.width,
            height: target.height,
            fit: 'inside',
            withoutEnlargement: false,
        })
        .png()
        .toBuffer();
}

async function applyImageEditCropAndFlip(
    buffer: Buffer,
    recipe?: EmoticonImageEditRecipe,
): Promise<Buffer> {
    if (!recipe) return buffer;
    const hasCrop = Object.values(recipe.crop).some((value) => value > 0);
    if (!hasCrop && !recipe.flipHorizontal) return buffer;
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 1;
    const height = metadata.height || 1;
    const left = Math.min(width - 1, Math.round(width * recipe.crop.left));
    const top = Math.min(height - 1, Math.round(height * recipe.crop.top));
    const right = Math.min(width - left - 1, Math.round(width * recipe.crop.right));
    const bottom = Math.min(height - top - 1, Math.round(height * recipe.crop.bottom));
    let pipeline = sharp(buffer).ensureAlpha().extract({
        left,
        top,
        width: Math.max(1, width - left - right),
        height: Math.max(1, height - top - bottom),
    });
    if (recipe.flipHorizontal) pipeline = pipeline.flop();
    return pipeline.png().toBuffer();
}

async function applyImageEditColorAdjustments(
    buffer: Buffer,
    recipe?: EmoticonImageEditRecipe,
): Promise<Buffer> {
    const brightness = recipe?.brightness ?? 0;
    const contrast = recipe?.contrast ?? 0;
    const saturation = recipe?.saturation ?? 0;
    if (brightness === 0 && contrast === 0 && saturation === 0) return buffer;

    // Materialize each Sharp operation so every frame uses the same explicit
    // brightness -> contrast -> saturation order, independent of lazy pipeline
    // optimization. The alpha multiplier/offset stay neutral during contrast.
    let adjusted = buffer;
    if (brightness !== 0) {
        adjusted = await sharp(adjusted)
            .ensureAlpha()
            .modulate({ brightness: 1 + brightness })
            .png()
            .toBuffer();
    }
    if (contrast !== 0) {
        const multiplier = 1 + contrast;
        const offset = 128 * (1 - multiplier);
        adjusted = await sharp(adjusted)
            .ensureAlpha()
            .linear(
                [multiplier, multiplier, multiplier, 1],
                [offset, offset, offset, 0],
            )
            .png()
            .toBuffer();
    }
    if (saturation !== 0) {
        adjusted = await sharp(adjusted)
            .ensureAlpha()
            .modulate({ saturation: 1 + saturation })
            .png()
            .toBuffer();
    }
    return adjusted;
}

async function applyImageEditToCharacter(
    buffer: Buffer,
    recipe?: EmoticonImageEditRecipe,
): Promise<Buffer> {
    const croppedAndFlipped = await applyImageEditCropAndFlip(buffer, recipe);
    return applyImageEditColorAdjustments(croppedAndFlipped, recipe);
}

function applyImageEditToMotionTransform(
    transform: MotionTransform,
    recipe?: EmoticonImageEditRecipe,
): MotionTransform {
    if (!recipe) return transform;
    return {
        x: transform.x + Math.round(recipe.offsetX * CANVAS_SIZE),
        y: transform.y + Math.round(recipe.offsetY * CANVAS_SIZE),
        rotation: transform.rotation + recipe.rotationDeg,
        scale: transform.scale * recipe.scale,
    };
}

function getEditedCharacterRegion(
    plan: EmoticonPlan,
    recipe?: EmoticonImageEditRecipe,
): { width: number; height: number } | null {
    if (!recipe) return null;
    const hasBubble = hasSpeechBubble(plan);
    const sideBubble = hasBubble && (plan.bubble.position === 'left' || plan.bubble.position === 'right');
    const verticalBubble = hasBubble && !sideBubble;
    const paddingFactor = Math.max(0.4, 1 - recipe.transparentPadding * 2);
    return {
        width: Math.max(1, Math.floor((sideBubble ? 142 : CANVAS_SIZE) * paddingFactor)),
        height: Math.max(1, Math.floor((verticalBubble ? 214 : CANVAS_SIZE) * paddingFactor)),
    };
}

function getCharacterTargetSize(
    plan: EmoticonPlan,
    bubblePosition = plan.bubble.position,
): { width: number; height: number } {
    const hasBubble = hasSpeechBubble(plan);
    const sideBubble = hasBubble && (bubblePosition === 'left' || bubblePosition === 'right');
    const verticalBubble = hasBubble && !sideBubble;
    const size = getBubbleAppearance(plan.bubble).size;
    const sideWidth = Math.max(82, Math.round(135 - Math.max(0, size - 1) * 265));
    const verticalHeight = Math.max(154, Math.round(200 - Math.max(0, size - 1) * 230));
    return {
        width: sideBubble ? sideWidth : verticalBubble ? 260 : CHARACTER_MAX_WIDTH,
        height: sideBubble
            ? 190
            : verticalBubble
                ? verticalHeight
                : CHARACTER_MAX_HEIGHT_WITHOUT_BUBBLE,
    };
}

async function normalizeCharacterSequence(
    buffers: Buffer[],
    plan: EmoticonPlan,
): Promise<Buffer[]> {
    const analysisSize = 1024;
    const normalizedCanvases = await Promise.all(buffers.map((buffer) => (
        sharp(buffer)
            .ensureAlpha()
            .resize({
                width: analysisSize,
                height: analysisSize,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer()
    )));
    const bounds = await Promise.all(normalizedCanvases.map(async (buffer) => {
        const { data, info } = await sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const channels = info.channels;
        let minX = info.width;
        let minY = info.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < info.height; y += 1) {
            for (let x = 0; x < info.width; x += 1) {
                if (data[(y * info.width + x) * channels + 3] <= 16) continue;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
        return maxX >= minX && maxY >= minY
            ? { minX, minY, maxX, maxY }
            : { minX: 0, minY: 0, maxX: info.width - 1, maxY: info.height - 1 };
    }));
    const union = bounds.reduce((result, bound) => ({
        minX: Math.min(result.minX, bound.minX),
        minY: Math.min(result.minY, bound.minY),
        maxX: Math.max(result.maxX, bound.maxX),
        maxY: Math.max(result.maxY, bound.maxY),
    }), {
        minX: analysisSize - 1,
        minY: analysisSize - 1,
        maxX: 0,
        maxY: 0,
    });
    const unionWidth = union.maxX - union.minX + 1;
    const unionHeight = union.maxY - union.minY + 1;
    const padding = Math.max(16, Math.round(Math.max(unionWidth, unionHeight) * 0.06));
    const left = Math.max(0, union.minX - padding);
    const top = Math.max(0, union.minY - padding);
    const right = Math.min(analysisSize - 1, union.maxX + padding);
    const bottom = Math.min(analysisSize - 1, union.maxY + padding);
    const target = getCharacterTargetSize(plan);
    return Promise.all(normalizedCanvases.map((buffer) => (
        sharp(buffer)
            .extract({
                left,
                top,
                width: right - left + 1,
                height: bottom - top + 1,
            })
            .resize({
                width: target.width,
                height: target.height,
                fit: 'inside',
                withoutEnlargement: false,
            })
            .png()
            .toBuffer()
    )));
}

function getCharacterPlacement(params: {
    plan: EmoticonPlan;
    width: number;
    height: number;
    transform: MotionTransform;
    bubblePosition: BubblePosition;
    bubbleLayout?: BubbleLayout | null;
}): { left: number; top: number } {
    const hasBubble = hasSpeechBubble(params.plan);
    const bubbleAtBottom = params.bubblePosition === 'bottom' && hasBubble;
    const bubbleAtSide = (
        (params.bubblePosition === 'left' || params.bubblePosition === 'right')
        && hasBubble
    );
    const appearance = getBubbleAppearance(params.plan.bubble);
    const tailClearance = Math.ceil(26 * appearance.size + appearance.outlineWidth / 2);
    const separation = Math.ceil(4 + appearance.outlineWidth / 2 + (appearance.shadowOpacity > 0 ? 12 : 0));
    const layout = params.bubbleLayout;
    const baseTop = bubbleAtBottom
        ? 10
        : hasBubble && !bubbleAtSide
            ? CANVAS_SIZE - params.height - 10
            : Math.round((CANVAS_SIZE - params.height) / 2);
    const minTop = hasBubble && !bubbleAtSide && !bubbleAtBottom
        ? Math.max(146, layout ? Math.ceil(layout.y + layout.height + tailClearance + separation) : 146)
        : 0;
    const maxTop = bubbleAtBottom
        ? Math.max(0, Math.min(10, layout
            ? Math.floor(layout.y - tailClearance - separation - params.height)
            : 10))
        : CANVAS_SIZE - params.height;
    const top = Math.max(minTop, Math.min(maxTop, baseTop + params.transform.y));
    const baseLeft = bubbleAtSide
        ? params.bubblePosition === 'left'
            ? CANVAS_SIZE - params.width - 10
            : 10
        : Math.round((CANVAS_SIZE - params.width) / 2);
    const minLeft = bubbleAtSide && params.bubblePosition === 'left'
        ? Math.max(baseLeft, layout
            ? Math.ceil(layout.x + layout.width + tailClearance + separation)
            : baseLeft)
        : 0;
    const maxLeft = bubbleAtSide && params.bubblePosition === 'right'
        ? Math.min(baseLeft, layout
            ? Math.floor(layout.x - tailClearance - separation - params.width)
            : baseLeft)
        : CANVAS_SIZE - params.width;
    const left = Math.max(minLeft, Math.min(maxLeft, baseLeft + params.transform.x));
    return { left, top };
}

function resolveBubblePlacement(params: {
    plan: EmoticonPlan;
    resolvedBubble: ResolvedEmoticonBubbleFrame | null;
    width: number;
    height: number;
    transform: MotionTransform;
}): { layout: BubbleLayout | null; left: number; top: number } {
    const requestedLayout = getBubbleLayout(params.plan, params.resolvedBubble);
    const requestedPlacement = getCharacterPlacement({
        plan: params.plan,
        width: params.width,
        height: params.height,
        transform: params.transform,
        bubblePosition: params.plan.bubble.position,
        bubbleLayout: requestedLayout,
    });
    if (!requestedLayout) {
        return { layout: null, ...requestedPlacement };
    }
    // Keep the user-selected side stable for the whole animation. Choosing a
    // new "best" side from each frame's alpha bounds made bubbles jump between
    // top/left/right as limbs moved. Character placement already reserves the
    // requested bubble region, so a fixed side is both predictable and safe.
    return { layout: requestedLayout, ...requestedPlacement };
}

function getCharacterRegionBesideBubble(
    plan: EmoticonPlan,
    layout: BubbleLayout | null,
): { width: number; height: number } {
    if (!layout) return { width: CANVAS_SIZE, height: CANVAS_SIZE };
    const appearance = getBubbleAppearance(plan.bubble);
    const tailClearance = Math.ceil(26 * appearance.size + appearance.outlineWidth / 2);
    const separation = Math.ceil(4 + appearance.outlineWidth / 2 + (appearance.shadowOpacity > 0 ? 12 : 0));
    if (layout.position === 'left') {
        return {
            width: Math.max(1, CANVAS_SIZE - layout.x - layout.width - tailClearance - separation),
            height: CANVAS_SIZE,
        };
    }
    if (layout.position === 'right') {
        return {
            width: Math.max(1, layout.x - tailClearance - separation),
            height: CANVAS_SIZE,
        };
    }
    if (layout.position === 'bottom') {
        return {
            width: CANVAS_SIZE,
            height: Math.max(1, layout.y - tailClearance - separation),
        };
    }
    return {
        width: CANVAS_SIZE,
        height: Math.max(1, CANVAS_SIZE - layout.y - layout.height - tailClearance - separation),
    };
}

async function composeFrame(params: {
    character: Buffer;
    plan: EmoticonPlan;
    frameIndex: number;
    outputProfile: ResolvedEmoticonOutputProfile;
    applyMotion?: boolean;
    editRecipe?: EmoticonImageEditRecipe;
}): Promise<Buffer> {
    const motionTransform = params.applyMotion === false
        ? { x: 0, y: 0, rotation: 0, scale: 1 }
        : getMotionTransform(params.plan, params.frameIndex);
    const transform = applyImageEditToMotionTransform(motionTransform, params.editRecipe);
    const target = getCharacterTargetSize(params.plan);
    const metadata = await sharp(params.character).metadata();
    const baseWidth = metadata.width || target.width;
    const baseHeight = metadata.height || target.height;
    let transformed = await sharp(params.character)
        .resize({
            width: Math.max(1, Math.round(baseWidth * transform.scale)),
            height: Math.max(1, Math.round(baseHeight * transform.scale)),
            fit: 'fill',
        })
        .rotate(transform.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    const editedRegion = getEditedCharacterRegion(params.plan, params.editRecipe);
    let transformedMeta = await sharp(transformed).metadata();
    if (
        editedRegion
        && (
            (transformedMeta.width || 1) > editedRegion.width
            || (transformedMeta.height || 1) > editedRegion.height
        )
    ) {
        transformed = await sharp(transformed).resize({
            width: editedRegion.width,
            height: editedRegion.height,
            fit: 'inside',
            withoutEnlargement: true,
        }).png().toBuffer();
        transformedMeta = await sharp(transformed).metadata();
    }
    const configuredBubbleLayers = params.plan.bubbleLayers?.length
        ? params.plan.bubbleLayers
        : [params.plan.bubble];
    const resolvedBubbleLayers = configuredBubbleLayers.map((bubble) => {
        const plan = { ...params.plan, bubble };
        return {
            plan,
            resolved: resolveEmoticonBubbleFrame(
                bubble,
                params.frameIndex,
                params.plan.action.frameCount,
            ),
        };
    });
    const primaryBubbleLayer = resolvedBubbleLayers.find((layer) => layer.resolved)
        || resolvedBubbleLayers[0]
        || { plan: params.plan, resolved: null };
    const requestedLayout = getBubbleLayout(primaryBubbleLayer.plan, primaryBubbleLayer.resolved);
    const availableRegion = getCharacterRegionBesideBubble(primaryBubbleLayer.plan, requestedLayout);
    if (
        (transformedMeta.width || 1) > availableRegion.width
        || (transformedMeta.height || 1) > availableRegion.height
    ) {
        transformed = await sharp(transformed).resize({
            width: availableRegion.width,
            height: availableRegion.height,
            fit: 'inside',
            withoutEnlargement: true,
        }).png().toBuffer();
        transformedMeta = await sharp(transformed).metadata();
    }
    const width = transformedMeta.width || baseWidth;
    const height = transformedMeta.height || baseHeight;
    const placement = resolveBubblePlacement({
        plan: primaryBubbleLayer.plan,
        resolvedBubble: primaryBubbleLayer.resolved,
        width,
        height,
        transform,
    });
    const composites: OverlayOptions[] = [{ input: transformed, left: placement.left, top: placement.top }];
    for (const layer of resolvedBubbleLayers) {
        if (!layer.resolved) continue;
        const layout = layer === primaryBubbleLayer
            ? placement.layout
            : getBubbleLayout(layer.plan, layer.resolved);
        const bubbleOverlay = createBubbleSvg(layer.plan, params.frameIndex, layer.resolved, layout);
        if (bubbleOverlay) composites.push({ input: bubbleOverlay, left: 0, top: 0 });
    }
    const composed = await sharp({
        create: {
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite(composites).png().toBuffer();
    if (params.outputProfile.width === CANVAS_SIZE && params.outputProfile.height === CANVAS_SIZE) {
        return composed;
    }
    return sharp(composed)
        .resize({
            width: params.outputProfile.width,
            height: params.outputProfile.height,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
}

async function writeFrames(dir: string, frames: Buffer[]): Promise<void> {
    await Promise.all(frames.map((frame, index) => (
        writeFile(join(dir, `frame-${String(index + 1).padStart(3, '0')}.png`), frame)
    )));
}

function validateFrameDurations(frameDurationsMs: number[] | undefined, frameCount: number): number[] | null {
    if (!frameDurationsMs) return null;
    if (frameDurationsMs.length !== frameCount) {
        throw new Error('Per-frame timing count does not match the imported frame count.');
    }
    const normalized = frameDurationsMs.map((duration) => Math.round(duration));
    if (normalized.some((duration) => !Number.isInteger(duration) || duration < 40 || duration > 2000)) {
        throw new Error('Each imported frame duration must be between 40ms and 2000ms.');
    }
    if (normalized.reduce((sum, duration) => sum + duration, 0) > 60_000) {
        throw new Error('The imported animation duration must not exceed 60 seconds.');
    }
    return normalized;
}

async function stackAnimationFrames(frames: Buffer[]): Promise<Sharp> {
    const metadata = await Promise.all(frames.map((frame) => sharp(frame).metadata()));
    const width = metadata[0]?.width || 0;
    const height = metadata[0]?.height || 0;
    if (!width || !height || metadata.some((entry) => entry.width !== width || entry.height !== height)) {
        throw new Error('Imported animation frames must share one non-empty canvas size.');
    }
    return sharp({
        create: {
            width,
            height: height * frames.length,
            pageHeight: height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite(frames.map((frame, index) => ({
        input: frame,
        left: 0,
        top: index * height,
    })));
}

async function writeVariableFrameManifest(
    dir: string,
    frameDurationsMs: number[],
    filePrefix = 'frame',
): Promise<string> {
    const manifestPath = join(dir, `${filePrefix}-timing.ffconcat`);
    const lines = ['ffconcat version 1.0'];
    frameDurationsMs.forEach((durationMs, index) => {
        lines.push(`file '${filePrefix}-${String(index + 1).padStart(3, '0')}.png'`);
        lines.push(`duration ${(durationMs / 1000).toFixed(6)}`);
    });
    await writeFile(manifestPath, `${lines.join('\n')}\n`, 'utf8');
    return manifestPath;
}

async function extractVideoFrames(params: {
    dir: string;
    videoBuffer: Buffer;
    frameCount: number;
    sourceDurationSeconds: number;
    plan: EmoticonPlan;
}): Promise<Buffer[]> {
    const inputPath = join(params.dir, 'source-video.mp4');
    const rawDir = join(params.dir, 'raw');
    await writeFile(inputPath, params.videoBuffer);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(rawDir, { recursive: true });
    const samplingFps = params.frameCount / Math.max(0.1, params.sourceDurationSeconds);
    await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-t',
        String(params.sourceDurationSeconds),
        '-vf',
        `fps=${samplingFps.toFixed(6)},scale=${CANVAS_SIZE}:${CANVAS_SIZE}:force_original_aspect_ratio=decrease,pad=${CANVAS_SIZE}:${CANVAS_SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba`,
        '-frames:v',
        String(params.frameCount),
        join(rawDir, 'frame-%03d.png'),
    ]);
    const names = (await readdir(rawDir))
        .filter((name) => /^frame-\d{3}\.png$/.test(name))
        .sort()
        .slice(0, params.frameCount);
    if (!names.length) throw new Error('No animation frames could be extracted from the generated video.');
    const rawFrames = await Promise.all(names.map((name) => readFile(join(rawDir, name))));
    while (rawFrames.length < params.frameCount) {
        rawFrames.push(rawFrames[rawFrames.length - 1]);
    }
    return Promise.all(rawFrames.map(async (frame, frameIndex) => {
        const transparentFrame = await removeConnectedFlatBackground(
            await sharp(frame).ensureAlpha().png().toBuffer(),
        );
        const resolvedBubble = resolveEmoticonBubbleFrame(
            params.plan.bubble,
            frameIndex,
            params.plan.action.frameCount,
        );
        const bubble = createBubbleSvg(params.plan, frameIndex, resolvedBubble);
        return bubble
            ? sharp(transparentFrame).composite([{ input: bubble, left: 0, top: 0 }]).png().toBuffer()
            : transparentFrame;
    }));
}

export async function extractVideoReviewFrame(params: {
    videoBuffer: Buffer;
    timeSec?: number;
}): Promise<Buffer> {
    return withTempDir('emoticon-review-', async (dir) => {
        const inputPath = join(dir, 'source-video.mp4');
        const outputPath = join(dir, 'review-frame.png');
        await writeFile(inputPath, params.videoBuffer);
        await runFfmpeg([
            '-y',
            '-ss',
            String(Math.max(0, params.timeSec ?? 0.8)),
            '-i',
            inputPath,
            '-frames:v',
            '1',
            '-vf',
            `scale=${CANVAS_SIZE}:${CANVAS_SIZE}:force_original_aspect_ratio=decrease,pad=${CANVAS_SIZE}:${CANVAS_SIZE}:(ow-iw)/2:(oh-ih)/2`,
            outputPath,
        ]);
        return readFile(outputPath);
    });
}

async function encodeWebp(dir: string, fps: number): Promise<Buffer> {
    const outputPath = join(dir, 'emoticon.webp');
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        join(dir, 'frame-%03d.png'),
        '-loop',
        '0',
        '-c:v',
        'libwebp_anim',
        '-lossless',
        '1',
        '-compression_level',
        '6',
        '-q:v',
        '82',
        outputPath,
    ]);
    return readFile(outputPath);
}

async function encodeApng(
    dir: string,
    fps: number,
    loopCount: number,
): Promise<Buffer> {
    const outputPath = join(dir, 'emoticon.apng.png');
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        join(dir, 'frame-%03d.png'),
        '-plays',
        String(loopCount),
        '-f',
        'apng',
        outputPath,
    ]);
    return readFile(outputPath);
}

async function encodeVariableApng(
    dir: string,
    frameDurationsMs: number[],
    loopCount: number,
): Promise<Buffer> {
    const manifest = await writeVariableFrameManifest(dir, frameDurationsMs);
    const outputPath = join(dir, 'emoticon.apng.png');
    await runFfmpeg([
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        manifest,
        '-fps_mode',
        'vfr',
        '-plays',
        String(loopCount),
        '-f',
        'apng',
        outputPath,
    ]);
    return readFile(outputPath);
}

async function encodeVariableWebp(frames: Buffer[], frameDurationsMs: number[]): Promise<Buffer> {
    return (await stackAnimationFrames(frames))
        .webp({
            loop: 0,
            delay: frameDurationsMs,
            lossless: true,
            effort: 6,
            quality: 82,
        })
        .toBuffer();
}

async function encodeGif(dir: string, fps: number): Promise<Buffer> {
    const palettePath = join(dir, 'palette.png');
    const outputPath = join(dir, 'emoticon.gif');
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        join(dir, 'frame-%03d.png'),
        '-vf',
        'palettegen=reserve_transparent=1:stats_mode=diff',
        palettePath,
    ]);
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        join(dir, 'frame-%03d.png'),
        '-i',
        palettePath,
        '-lavfi',
        'paletteuse=alpha_threshold=128:dither=sierra2_4a',
        '-loop',
        '0',
        outputPath,
    ]);
    return readFile(outputPath);
}

async function encodeVariableGif(frames: Buffer[], frameDurationsMs: number[]): Promise<Buffer> {
    return (await stackAnimationFrames(frames))
        .gif({
            loop: 0,
            delay: frameDurationsMs,
            effort: 7,
            dither: 0.8,
        })
        .toBuffer();
}

async function encodeMp4(
    dir: string,
    fps: number,
    outputProfile: ResolvedEmoticonOutputProfile,
): Promise<Buffer> {
    const outputPath = join(dir, 'emoticon.mp4');
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        join(dir, 'frame-%03d.png'),
        '-filter_complex',
        `[0:v]format=rgba[fg];color=c=white:s=${outputProfile.width}x${outputProfile.height}:r=${fps}[bg];[bg][fg]overlay=shortest=1,format=yuv420p[out]`,
        '-map',
        '[out]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-movflags',
        '+faststart',
        outputPath,
    ]);
    return readFile(outputPath);
}

async function encodeVariableMp4(
    dir: string,
    frames: Buffer[],
    frameDurationsMs: number[],
    outputProfile: ResolvedEmoticonOutputProfile,
): Promise<Buffer> {
    const opaqueDir = join(dir, 'opaque-video-frames');
    mkdirSync(opaqueDir, { recursive: true });
    const opaqueFrames = await Promise.all(frames.map((frame) => sharp({
        create: {
            width: outputProfile.width,
            height: outputProfile.height,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
        },
    }).composite([{ input: frame, left: 0, top: 0 }]).png().toBuffer()));
    await Promise.all(opaqueFrames.map((frame, index) => (
        writeFile(join(opaqueDir, `opaque-${String(index + 1).padStart(3, '0')}.png`), frame)
    )));
    const manifest = await writeVariableFrameManifest(opaqueDir, frameDurationsMs, 'opaque');
    const outputPath = join(dir, 'emoticon.mp4');
    await runFfmpeg([
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        manifest,
        '-fps_mode',
        'vfr',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-movflags',
        '+faststart',
        outputPath,
    ]);
    return readFile(outputPath);
}

async function encodeWebm(dir: string, fps: number): Promise<Buffer> {
    const outputPath = join(dir, 'emoticon.webm');
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        join(dir, 'frame-%03d.png'),
        '-c:v',
        'libvpx-vp9',
        '-pix_fmt',
        'yuva420p',
        '-lossless',
        '1',
        '-auto-alt-ref',
        '0',
        outputPath,
    ]);
    return readFile(outputPath);
}

async function encodeVariableWebm(
    dir: string,
    frameDurationsMs: number[],
): Promise<Buffer> {
    const manifest = await writeVariableFrameManifest(dir, frameDurationsMs);
    const outputPath = join(dir, 'emoticon.webm');
    await runFfmpeg([
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        manifest,
        '-fps_mode',
        'vfr',
        '-c:v',
        'libvpx-vp9',
        '-pix_fmt',
        'yuva420p',
        '-lossless',
        '1',
        '-auto-alt-ref',
        '0',
        outputPath,
    ]);
    return readFile(outputPath);
}

async function encodePngZip(
    frames: Buffer[],
    plan: EmoticonPlan,
    outputProfile: ResolvedEmoticonOutputProfile,
    frameDurationsMs?: number[],
): Promise<Buffer> {
    const zip = new JSZip();
    frames.forEach((frame, index) => {
        zip.file(`frames/frame-${String(index + 1).padStart(3, '0')}.png`, frame);
    });
    const columns = Math.ceil(Math.sqrt(frames.length));
    const rows = Math.ceil(frames.length / columns);
    const spriteSheet = await sharp({
        create: {
            width: columns * outputProfile.width,
            height: rows * outputProfile.height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite(frames.map((frame, index) => ({
        input: frame,
        left: (index % columns) * outputProfile.width,
        top: Math.floor(index / columns) * outputProfile.height,
    }))).png().toBuffer();
    const spriteManifest = {
        image: 'sprite-sheet.png',
        canvas: { width: columns * outputProfile.width, height: rows * outputProfile.height },
        cell: { width: outputProfile.width, height: outputProfile.height },
        columns,
        rows,
        frameCount: frames.length,
        fps: plan.action.fps,
        durationMs: frameDurationsMs
            ? frameDurationsMs.reduce((sum, duration) => sum + duration, 0)
            : plan.action.durationMs,
        loop: true,
        frames: frames.map((_, index) => ({
            index,
            x: (index % columns) * outputProfile.width,
            y: Math.floor(index / columns) * outputProfile.height,
            width: outputProfile.width,
            height: outputProfile.height,
            durationMs: frameDurationsMs?.[index] ?? Math.round(1000 / plan.action.fps),
        })),
    };
    const profileReference = {
        outputProfile,
        actualCanvas: { width: outputProfile.width, height: outputProfile.height },
        actualFrameCount: frames.length,
        actualFps: plan.action.fps,
        actualDurationMs: frameDurationsMs
            ? frameDurationsMs.reduce((sum, duration) => sum + duration, 0)
            : Math.round((frames.length / plan.action.fps) * 1000),
        loop: true,
        note: 'This is a measured production bundle, not an automatic platform submission approval.',
    };
    zip.file('sprite-sheet.png', spriteSheet);
    zip.file('sprite-sheet.json', JSON.stringify(spriteManifest, null, 2));
    zip.file('output-profile.json', JSON.stringify(profileReference, null, 2));
    zip.file('animation-plan.json', JSON.stringify(plan, null, 2));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

type RasterFacts = {
    width: number | null;
    height: number | null;
    frameCount: number;
    fps: number | null;
    durationMs: number | null;
    loop: boolean | null;
    hasAlpha: boolean;
    transparencyCoverage: number | null;
    alphaBoundsEvidence: EmoticonAlphaBoundsEvidence | null;
    codec: string | null;
};

function sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

function requiredTransparentMarginPx(width: number, height: number): number {
    return Math.max(
        MINIMUM_TRANSPARENT_MARGIN_PX,
        Math.ceil(Math.min(width, height) * MINIMUM_TRANSPARENT_MARGIN_RATIO),
    );
}

function measureDecodedAlphaBounds(params: {
    data: Buffer;
    width: number;
    frameHeight: number;
    frameCount: number;
    channels: number;
}): EmoticonAlphaBoundsEvidence {
    const requiredMarginPx = requiredTransparentMarginPx(params.width, params.frameHeight);
    const alphaChannel = params.channels - 1;
    const frames = Array.from({ length: params.frameCount }, (_, frameIndex) => {
        let left = params.width;
        let top = params.frameHeight;
        let right = -1;
        let bottom = -1;
        let visiblePixelCount = 0;
        const frameTop = frameIndex * params.frameHeight;
        for (let y = 0; y < params.frameHeight; y += 1) {
            for (let x = 0; x < params.width; x += 1) {
                const offset = (((frameTop + y) * params.width + x) * params.channels) + alphaChannel;
                if ((params.data[offset] ?? 0) < ALPHA_BOUNDS_THRESHOLD) continue;
                visiblePixelCount += 1;
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
                bottom = Math.max(bottom, y);
            }
        }
        if (!visiblePixelCount) {
            return {
                frameIndex,
                visiblePixelCount: 0,
                bounds: null,
                transparentMargins: null,
                minimumTransparentMarginPx: null,
                touchesCanvasEdge: false,
                hasUsableTransparentMargin: false,
            };
        }
        const transparentMargins = {
            left,
            top,
            right: params.width - 1 - right,
            bottom: params.frameHeight - 1 - bottom,
        };
        const minimumTransparentMarginPx = Math.min(
            transparentMargins.left,
            transparentMargins.top,
            transparentMargins.right,
            transparentMargins.bottom,
        );
        const touchesCanvasEdge = minimumTransparentMarginPx === 0;
        return {
            frameIndex,
            visiblePixelCount,
            bounds: { left, top, right, bottom },
            transparentMargins,
            minimumTransparentMarginPx,
            touchesCanvasEdge,
            hasUsableTransparentMargin: !touchesCanvasEdge
                && minimumTransparentMarginPx >= requiredMarginPx,
        };
    });
    return {
        alphaThreshold: ALPHA_BOUNDS_THRESHOLD,
        requiredTransparentMarginPx: requiredMarginPx,
        checkedFrameCount: frames.length,
        allFramesHaveVisibleContent: frames.every((frame) => frame.visiblePixelCount > 0),
        allFramesHaveUsableTransparentMargin: frames.every(
            (frame) => frame.hasUsableTransparentMargin,
        ),
        edgeTouchFrameIndices: frames
            .filter((frame) => frame.touchesCanvasEdge)
            .map((frame) => frame.frameIndex),
        insufficientMarginFrameIndices: frames
            .filter((frame) => !frame.hasUsableTransparentMargin)
            .map((frame) => frame.frameIndex),
        frames,
    };
}

async function inspectRasterBuffer(
    buffer: Buffer,
    animated: boolean,
    fallbackFps: number,
): Promise<RasterFacts> {
    const options: SharpOptions = animated ? { animated: true } : {};
    const metadata = await sharp(buffer, options).metadata();
    const frameCount = Math.max(1, metadata.pages || 1);
    const frameHeight = metadata.pageHeight
        || (metadata.height ? Math.max(1, Math.round(metadata.height / frameCount)) : null);
    const { data, info } = await sharp(buffer, options)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const decodedFrameHeight = frameHeight
        || Math.max(1, Math.floor(info.height / frameCount));
    if (info.height < decodedFrameHeight * frameCount) {
        throw new Error('Decoded raster pages are incomplete and cannot be inspected safely.');
    }
    const alphaOffset = info.channels - 1;
    let transparentPixels = 0;
    const pixelCount = Math.max(1, Math.floor(data.length / info.channels));
    for (let offset = alphaOffset; offset < data.length; offset += info.channels) {
        if (data[offset] < 255) transparentPixels += 1;
    }
    const delays = Array.isArray(metadata.delay) ? metadata.delay : [];
    const durationMs = delays.length
        ? delays.reduce((sum, delay) => sum + delay, 0)
        : animated
            ? Math.round((frameCount / fallbackFps) * 1000)
            : 0;
    const actualFps = animated && durationMs > 0
        ? Number(((frameCount * 1000) / durationMs).toFixed(3))
        : null;
    return {
        width: metadata.width || null,
        height: frameHeight,
        frameCount,
        fps: actualFps,
        durationMs,
        loop: animated && typeof metadata.loop === 'number' ? metadata.loop === 0 : animated ? null : false,
        hasAlpha: Boolean(metadata.hasAlpha) && transparentPixels > 0,
        transparencyCoverage: transparentPixels / pixelCount,
        alphaBoundsEvidence: measureDecodedAlphaBounds({
            data,
            width: info.width,
            frameHeight: decodedFrameHeight,
            frameCount,
            channels: info.channels,
        }),
        codec: metadata.format || null,
    };
}

function parseApngControl(buffer: Buffer): {
    frameCount: number;
    plays: number;
    durationMs: number;
} {
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (buffer.length < pngSignature.length || !buffer.subarray(0, 8).equals(pngSignature)) {
        throw new Error('APNG output does not have a valid PNG signature.');
    }
    let frameCount = 0;
    let plays = 0;
    let durationMs = 0;
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const typeStart = offset + 4;
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > buffer.length) throw new Error('APNG output contains a truncated PNG chunk.');
        const type = buffer.toString('ascii', typeStart, typeStart + 4);
        if (type === 'acTL' && length === 8) {
            frameCount = buffer.readUInt32BE(dataStart);
            plays = buffer.readUInt32BE(dataStart + 4);
        } else if (type === 'fcTL' && length === 26) {
            const delayNumerator = buffer.readUInt16BE(dataStart + 20);
            const delayDenominator = buffer.readUInt16BE(dataStart + 22) || 100;
            durationMs += Math.round((delayNumerator / delayDenominator) * 1000);
        }
        offset = dataEnd + 4;
        if (type === 'IEND') break;
    }
    if (!frameCount) throw new Error('Encoded PNG does not contain an APNG animation control chunk.');
    return { frameCount, plays, durationMs };
}

async function inspectApngBuffer(params: {
    dir: string;
    buffer: Buffer;
    fallbackFps: number;
}): Promise<RasterFacts> {
    const control = parseApngControl(params.buffer);
    const inputPath = join(params.dir, 'inspection.apng.png');
    const decodedDir = join(params.dir, 'inspection-apng-frames');
    mkdirSync(decodedDir, { recursive: true });
    await writeFile(inputPath, params.buffer);
    await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-fps_mode',
        'passthrough',
        join(decodedDir, 'decoded-%03d.png'),
    ]);
    const decodedNames = (await readdir(decodedDir))
        .filter((name) => /^decoded-\d{3}\.png$/.test(name))
        .sort();
    const decodedFrames = await Promise.all(decodedNames.map((name) => readFile(join(decodedDir, name))));
    if (decodedFrames.length !== control.frameCount) {
        throw new Error('Decoded APNG frame count does not match its animation control chunk.');
    }
    const frameFacts = await Promise.all(
        decodedFrames.map((frame) => inspectRasterBuffer(frame, false, params.fallbackFps)),
    );
    const first = frameFacts[0];
    if (!first || frameFacts.some((frame) => frame.width !== first.width || frame.height !== first.height)) {
        throw new Error('Decoded APNG frames do not share one canvas size.');
    }
    const alphaFrames = frameFacts.map((frame, frameIndex) => {
        const evidence = frame.alphaBoundsEvidence?.frames[0];
        if (!evidence) throw new Error(`Decoded APNG frame ${frameIndex + 1} has no alpha-bound evidence.`);
        return { ...evidence, frameIndex };
    });
    const alphaBoundsEvidence: EmoticonAlphaBoundsEvidence = {
        alphaThreshold: ALPHA_BOUNDS_THRESHOLD,
        requiredTransparentMarginPx: Math.max(
            ...frameFacts.map((frame) => frame.alphaBoundsEvidence?.requiredTransparentMarginPx || 1),
        ),
        checkedFrameCount: alphaFrames.length,
        allFramesHaveVisibleContent: alphaFrames.every((frame) => frame.visiblePixelCount > 0),
        allFramesHaveUsableTransparentMargin: alphaFrames.every((frame) => frame.hasUsableTransparentMargin),
        edgeTouchFrameIndices: alphaFrames
            .filter((frame) => frame.touchesCanvasEdge)
            .map((frame) => frame.frameIndex),
        insufficientMarginFrameIndices: alphaFrames
            .filter((frame) => !frame.hasUsableTransparentMargin)
            .map((frame) => frame.frameIndex),
        frames: alphaFrames,
    };
    const durationMs = control.durationMs > 0
        ? control.durationMs
        : Math.round((control.frameCount / params.fallbackFps) * 1000);
    return {
        width: first.width,
        height: first.height,
        frameCount: control.frameCount,
        fps: Number(((control.frameCount * 1000) / durationMs).toFixed(3)),
        durationMs,
        loop: control.plays === 0,
        hasAlpha: frameFacts.every((frame) => frame.hasAlpha),
        transparencyCoverage: frameFacts.reduce(
            (sum, frame) => sum + (frame.transparencyCoverage || 0),
            0,
        ) / frameFacts.length,
        alphaBoundsEvidence,
        codec: 'apng',
    };
}

export async function inspectEmoticonRasterAlphaBounds(
    buffer: Buffer,
    animated = false,
): Promise<EmoticonAlphaBoundsEvidence> {
    const facts = await inspectRasterBuffer(buffer, animated, 8);
    if (!facts.alphaBoundsEvidence) {
        throw new Error('Raster alpha-bound evidence could not be measured.');
    }
    return facts.alphaBoundsEvidence;
}

function parseFfmpegTimeMs(value: string): number | null {
    const match = value.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
}

function getLastFfmpegFrameCount(stderr: string): number | null {
    const expression = /frame=\s*(\d+)/g;
    let match: RegExpExecArray | null;
    let result: number | null = null;
    while ((match = expression.exec(stderr)) !== null) result = Number(match[1]);
    return result;
}

function getLastFfmpegTimeMs(stderr: string): number | null {
    const expression = /time=\s*(\d+:\d+:\d+(?:\.\d+)?)/g;
    let match: RegExpExecArray | null;
    let result: number | null = null;
    while ((match = expression.exec(stderr)) !== null) result = parseFfmpegTimeMs(match[1]);
    return result;
}

function getFfmpegDeclaredDurationMs(stderr: string): number | null {
    const match = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/i);
    return match ? parseFfmpegTimeMs(match[1]) : null;
}

async function inspectVideoBuffer(params: {
    dir: string;
    format: 'mp4' | 'webm';
    extension: string;
    buffer: Buffer;
    fallbackFrameCount: number;
}): Promise<RasterFacts & { inspectionIssues: string[] }> {
    const inputPath = join(params.dir, `inspection.${params.extension}`);
    await writeFile(inputPath, params.buffer);
    const { stderr } = await runFfmpegCapture([
        '-hide_banner',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-f',
        'null',
        '-',
    ]);
    const videoLine = stderr.split(/\r?\n/).find((line) => line.includes('Video:')) || '';
    const dimension = videoLine.match(/(?:,|\s)(\d{2,5})x(\d{2,5})(?:[\s,])/);
    const codec = videoLine.match(/Video:\s*([^,\s]+)/)?.[1] || null;
    const fpsMatch = videoLine.match(/(\d+(?:\.\d+)?)\s+fps\b/i)?.[1];
    const frameCount = getLastFfmpegFrameCount(stderr);
    // The decode progress timestamp is the PTS of the final frame and is one
    // frame interval shorter than the encoded stream. Prefer the container's
    // declared duration and retain progress time only as a fallback.
    const durationMs = getFfmpegDeclaredDurationMs(stderr) ?? getLastFfmpegTimeMs(stderr);
    const inspectionIssues: string[] = [];
    if (!dimension) inspectionIssues.push('Encoded video dimensions could not be decoded.');
    if (!frameCount) inspectionIssues.push('Encoded video frame count could not be decoded.');
    if (durationMs === null) inspectionIssues.push('Encoded video duration could not be decoded.');
    const alphaPixelFormat = /\b(?:yuva\w*|rgba|bgra|argb|abgr)\b/i.test(videoLine)
        || /alpha_mode\s*:\s*1/i.test(stderr);
    return {
        width: dimension ? Number(dimension[1]) : null,
        height: dimension ? Number(dimension[2]) : null,
        frameCount: frameCount || params.fallbackFrameCount,
        fps: fpsMatch ? Number(fpsMatch) : null,
        durationMs,
        loop: false,
        hasAlpha: params.format === 'webm' && alphaPixelFormat,
        transparencyCoverage: null,
        alphaBoundsEvidence: null,
        codec: codec || (params.format === 'mp4' ? 'h264' : 'vp9'),
        inspectionIssues: [
            ...inspectionIssues,
            ...(fpsMatch ? [] : ['Encoded video FPS could not be decoded.']),
        ],
    };
}

function buildOutputInspection(params: {
    format: EmoticonExportFormat;
    buffer: Buffer;
    facts: RasterFacts;
    plan: EmoticonPlan;
    outputProfile: ResolvedEmoticonOutputProfile;
    extraIssues?: string[];
    expectedFrameDurationsMs?: number[];
}): EmoticonOutputInspection {
    const issues = [...(params.extraIssues || [])];
    const expectedFrameCount = params.format === 'png' ? 1 : params.plan.action.frameCount;
    const expectedDurationMs = params.expectedFrameDurationsMs
        ? params.expectedFrameDurationsMs.reduce((sum, duration) => sum + duration, 0)
        : params.plan.action.durationMs;
    const expectedFps = params.expectedFrameDurationsMs && expectedDurationMs > 0
        ? (params.plan.action.frameCount * 1000) / expectedDurationMs
        : params.plan.action.fps;
    if (params.facts.width !== params.outputProfile.width || params.facts.height !== params.outputProfile.height) {
        issues.push(
            `Actual canvas ${params.facts.width || '?'}x${params.facts.height || '?'} does not match `
            + `profile ${params.outputProfile.width}x${params.outputProfile.height}.`,
        );
    }
    if (params.facts.frameCount !== expectedFrameCount) {
        issues.push(`Actual frame count ${params.facts.frameCount} does not match expected ${expectedFrameCount}.`);
    }
    if (params.format !== 'png' && params.facts.fps === null) {
        issues.push('Actual FPS could not be determined from the encoded output.');
    } else if (
        params.format !== 'png'
        && params.facts.fps !== null
        && !(params.expectedFrameDurationsMs && (params.format === 'mp4' || params.format === 'webm'))
        && Math.abs(params.facts.fps - expectedFps) > 0.25
    ) {
        issues.push(
            `Actual FPS ${params.facts.fps} does not match expected ${expectedFps}.`,
        );
    }
    if (
        params.format !== 'png'
        && params.facts.durationMs !== null
        && Math.abs(params.facts.durationMs - expectedDurationMs) > Math.max(
            120,
            params.expectedFrameDurationsMs
                ? Math.max(...params.expectedFrameDurationsMs)
                : Math.ceil(1000 / params.plan.action.fps),
        )
    ) {
        issues.push(
            `Actual duration ${params.facts.durationMs}ms does not match expected `
            + `${expectedDurationMs}ms.`,
        );
    }
    const alphaCapability = params.outputProfile.formatCapabilities?.[params.format]?.alpha;
    const alphaRequired = params.outputProfile.transparentBackground
        && alphaCapability !== 'unsupported';
    if (alphaRequired && !params.facts.hasAlpha) {
        issues.push('The inspected output does not contain usable transparency.');
    }
    if (params.facts.transparencyCoverage !== null) {
        const visibleCoverage = 1 - params.facts.transparencyCoverage;
        if (visibleCoverage < 0.005) {
            issues.push('The inspected output is empty or almost completely transparent.');
        }
        if (alphaRequired && params.facts.transparencyCoverage < 0.005) {
            issues.push('The character fills nearly the entire canvas without a usable transparent margin.');
        }
    }
    const requiresAlphaBoundsEvidence = alphaRequired
        && ['png', 'apng', 'webp', 'gif', 'png_zip'].includes(params.format);
    if (requiresAlphaBoundsEvidence) {
        const evidence = params.facts.alphaBoundsEvidence;
        if (!evidence || evidence.checkedFrameCount !== expectedFrameCount) {
            issues.push('Per-frame alpha-bound evidence is missing or incomplete.');
        } else {
            if (!evidence.allFramesHaveVisibleContent) {
                issues.push('At least one frame has no visible content inside its alpha bounds.');
            }
            if (evidence.edgeTouchFrameIndices.length > 0) {
                issues.push(
                    `Opaque content touches a canvas edge in frame(s): ${evidence.edgeTouchFrameIndices.join(', ')}.`,
                );
            }
            if (!evidence.allFramesHaveUsableTransparentMargin) {
                issues.push(
                    `Transparent margin is smaller than ${evidence.requiredTransparentMarginPx}px in frame(s): `
                    + `${evidence.insufficientMarginFrameIndices.join(', ')}.`,
                );
            }
        }
    }
    if (
        params.outputProfile.type === 'animated'
        && (
            params.format === 'webp'
            || params.format === 'gif'
            || (params.format === 'apng' && params.outputProfile.loopCount === 0)
        )
        && params.facts.loop !== true
    ) {
        issues.push('The inspected animated image does not declare an infinite loop.');
    }
    if (
        params.outputProfile.verification === 'verified'
        && params.outputProfile.maxFileSizeBytes !== undefined
        && params.buffer.byteLength > params.outputProfile.maxFileSizeBytes
    ) {
        issues.push('The encoded output exceeds the verified profile file-size limit.');
    }
    if (
        params.outputProfile.verification === 'verified'
        && params.outputProfile.maxDurationMs !== undefined
        && params.facts.durationMs !== null
        && params.facts.durationMs > params.outputProfile.maxDurationMs
    ) {
        issues.push('The encoded output exceeds the verified profile duration limit.');
    }
    if (
        params.outputProfile.verification === 'verified'
        && params.outputProfile.loopCount === 0
        && (
            params.format === 'webp'
            || params.format === 'gif'
            || params.format === 'apng'
        )
        && params.facts.loop !== true
    ) {
        issues.push('The encoded output does not match the verified infinite-loop requirement.');
    }
    return {
        format: params.format,
        fileSizeBytes: params.buffer.byteLength,
        width: params.facts.width,
        height: params.facts.height,
        frameCount: params.facts.frameCount,
        fps: params.facts.fps,
        durationMs: params.facts.durationMs,
        loop: params.facts.loop,
        hasAlpha: params.facts.hasAlpha,
        transparencyCoverage: params.facts.transparencyCoverage,
        alphaBoundsEvidence: params.facts.alphaBoundsEvidence,
        codec: params.facts.codec,
        sha256: sha256(params.buffer),
        inspectedAt: new Date().toISOString(),
        inspectorVersion: OUTPUT_INSPECTOR_VERSION,
        passed: issues.length === 0,
        issues: issues.slice(0, 12),
    };
}

async function inspectPngZip(params: {
    buffer: Buffer;
    plan: EmoticonPlan;
    outputProfile: ResolvedEmoticonOutputProfile;
    frameDurationsMs?: number[];
}): Promise<EmoticonOutputInspection> {
    const zip = await JSZip.loadAsync(params.buffer);
    const frameNames = Object.keys(zip.files)
        .filter((name) => /^frames\/frame-\d{3}\.png$/.test(name))
        .sort();
    const frameBuffers = await Promise.all(frameNames.map(async (name) => {
        const entry = zip.file(name);
        if (!entry) throw new Error(`PNG sequence entry ${name} is missing.`);
        return entry.async('nodebuffer');
    }));
    if (!frameBuffers.length) throw new Error('PNG sequence archive contains no frame images.');
    const facts = await Promise.all(frameBuffers.map((frame) => inspectRasterBuffer(frame, false, params.plan.action.fps)));
    const first = facts[0];
    const issues: string[] = [];
    if (facts.some((frame) => frame.width !== first.width || frame.height !== first.height)) {
        issues.push('PNG sequence frames do not share one canvas size.');
    }
    if (facts.some((frame) => !frame.hasAlpha)) {
        issues.push('At least one PNG sequence frame has no usable transparency.');
    }
    if (facts.some((frame) => (
        frame.transparencyCoverage !== null
        && 1 - frame.transparencyCoverage < 0.005
    ))) {
        issues.push('At least one PNG sequence frame is empty or almost completely transparent.');
    }
    if (params.outputProfile.transparentBackground && facts.some((frame) => (
        frame.transparencyCoverage !== null
        && frame.transparencyCoverage < 0.005
    ))) {
        issues.push('At least one PNG sequence frame has no usable transparent margin.');
    }
    const averageTransparency = facts.reduce(
        (sum, frame) => sum + (frame.transparencyCoverage || 0),
        0,
    ) / facts.length;
    const alphaBoundsFrames = facts.map((frame, frameIndex) => {
        const frameEvidence = frame.alphaBoundsEvidence?.frames[0];
        if (!frameEvidence) {
            throw new Error(`PNG sequence frame ${frameIndex + 1} has no alpha-bound evidence.`);
        }
        return { ...frameEvidence, frameIndex };
    });
    const alphaBoundsEvidence: EmoticonAlphaBoundsEvidence = {
        alphaThreshold: ALPHA_BOUNDS_THRESHOLD,
        requiredTransparentMarginPx: Math.max(
            ...facts.map((frame) => (
                frame.alphaBoundsEvidence?.requiredTransparentMarginPx
                || MINIMUM_TRANSPARENT_MARGIN_PX
            )),
        ),
        checkedFrameCount: alphaBoundsFrames.length,
        allFramesHaveVisibleContent: alphaBoundsFrames.every((frame) => frame.visiblePixelCount > 0),
        allFramesHaveUsableTransparentMargin: alphaBoundsFrames.every(
            (frame) => frame.hasUsableTransparentMargin,
        ),
        edgeTouchFrameIndices: alphaBoundsFrames
            .filter((frame) => frame.touchesCanvasEdge)
            .map((frame) => frame.frameIndex),
        insufficientMarginFrameIndices: alphaBoundsFrames
            .filter((frame) => !frame.hasUsableTransparentMargin)
            .map((frame) => frame.frameIndex),
        frames: alphaBoundsFrames,
    };
    const durationMs = params.frameDurationsMs
        ? params.frameDurationsMs.reduce((sum, duration) => sum + duration, 0)
        : Math.round((frameBuffers.length / params.plan.action.fps) * 1000);
    const fps = durationMs > 0
        ? Number(((frameBuffers.length * 1000) / durationMs).toFixed(3))
        : params.plan.action.fps;
    return buildOutputInspection({
        format: 'png_zip',
        buffer: params.buffer,
        plan: params.plan,
        outputProfile: params.outputProfile,
        expectedFrameDurationsMs: params.frameDurationsMs,
        extraIssues: issues,
        facts: {
            width: first.width,
            height: first.height,
            frameCount: frameBuffers.length,
            fps,
            durationMs,
            loop: true,
            hasAlpha: facts.every((frame) => frame.hasAlpha),
            transparencyCoverage: averageTransparency,
            alphaBoundsEvidence,
            codec: 'png-sequence+zip',
        },
    });
}

async function encodeRequestedFormats(
    dir: string,
    frames: Buffer[],
    fps: number,
    formats: EmoticonExportFormat[],
    plan: EmoticonPlan,
    outputProfile: ResolvedEmoticonOutputProfile,
    requestedFrameDurationsMs?: number[],
): Promise<RenderedEmoticonFile[]> {
    const frameDurationsMs = validateFrameDurations(requestedFrameDurationsMs, frames.length);
    await writeFrames(dir, frames);
    const results: RenderedEmoticonFile[] = [];
    for (const format of formats) {
        let extension: string;
        let contentType: string;
        let buffer: Buffer;
        let inspection: EmoticonOutputInspection;
        if (format === 'png') {
            extension = 'png';
            contentType = 'image/png';
            buffer = await sharp(frames[0]).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
            inspection = buildOutputInspection({
                format,
                buffer,
                plan,
                outputProfile,
                ...(frameDurationsMs ? { expectedFrameDurationsMs: frameDurationsMs } : {}),
                facts: await inspectRasterBuffer(buffer, false, fps),
            });
        } else if (format === 'apng') {
            extension = 'apng.png';
            contentType = 'image/png';
            const loopCount = outputProfile.loopCount ?? 0;
            buffer = frameDurationsMs
                ? await encodeVariableApng(dir, frameDurationsMs, loopCount)
                : await encodeApng(dir, fps, loopCount);
            inspection = buildOutputInspection({
                format,
                buffer,
                plan,
                outputProfile,
                ...(frameDurationsMs ? { expectedFrameDurationsMs: frameDurationsMs } : {}),
                facts: await inspectApngBuffer({ dir, buffer, fallbackFps: fps }),
            });
        } else if (format === 'webp') {
            extension = 'webp';
            contentType = 'image/webp';
            buffer = frameDurationsMs
                ? await encodeVariableWebp(frames, frameDurationsMs)
                : await encodeWebp(dir, fps);
            inspection = buildOutputInspection({
                format,
                buffer,
                plan,
                outputProfile,
                ...(frameDurationsMs ? { expectedFrameDurationsMs: frameDurationsMs } : {}),
                facts: await inspectRasterBuffer(buffer, true, fps),
            });
        } else if (format === 'gif') {
            extension = 'gif';
            contentType = 'image/gif';
            buffer = frameDurationsMs
                ? await encodeVariableGif(frames, frameDurationsMs)
                : await encodeGif(dir, fps);
            inspection = buildOutputInspection({
                format,
                buffer,
                plan,
                outputProfile,
                ...(frameDurationsMs ? { expectedFrameDurationsMs: frameDurationsMs } : {}),
                facts: await inspectRasterBuffer(buffer, true, fps),
            });
        } else if (format === 'mp4' || format === 'webm') {
            extension = format;
            contentType = format === 'mp4' ? 'video/mp4' : 'video/webm';
            buffer = format === 'mp4'
                ? frameDurationsMs
                    ? await encodeVariableMp4(dir, frames, frameDurationsMs, outputProfile)
                    : await encodeMp4(dir, fps, outputProfile)
                : frameDurationsMs
                    ? await encodeVariableWebm(dir, frameDurationsMs)
                    : await encodeWebm(dir, fps);
            const videoFacts = await inspectVideoBuffer({
                dir,
                format,
                extension,
                buffer,
                fallbackFrameCount: frames.length,
            });
            inspection = buildOutputInspection({
                format,
                buffer,
                plan,
                outputProfile,
                ...(frameDurationsMs ? { expectedFrameDurationsMs: frameDurationsMs } : {}),
                facts: videoFacts,
                extraIssues: videoFacts.inspectionIssues,
            });
        } else {
            extension = 'zip';
            contentType = 'application/zip';
            buffer = await encodePngZip(frames, plan, outputProfile, frameDurationsMs || undefined);
            inspection = await inspectPngZip({
                buffer,
                plan,
                outputProfile,
                ...(frameDurationsMs ? { frameDurationsMs } : {}),
            });
        }
        results.push({ format, extension, contentType, buffer, inspection });
    }
    return results;
}

export async function renderImageEmoticon(params: {
    imageBuffer: Buffer;
    plan: EmoticonPlan;
    formats: EmoticonExportFormat[];
    outputProfile?: EmoticonOutputProfile;
    editRecipe?: EmoticonImageEditRecipe;
    onComposedFrames?: (frames: Buffer[]) => Promise<void>;
}): Promise<RenderedEmoticonFile[]> {
    return withTempDir('emoticon-image-', async (dir) => {
        const outputProfile = resolveEmoticonOutputProfile(params.outputProfile);
        assertOutputProfileConstraints({ plan: params.plan, formats: params.formats, outputProfile });
        assertBubbleTimeline(params.plan.bubble, params.plan.action.frameCount);
        const character = await applyImageEditToCharacter(
            await normalizeCharacter(params.imageBuffer, params.plan),
            params.editRecipe,
        );
        const frames: Buffer[] = [];
        for (let index = 0; index < params.plan.action.frameCount; index += 1) {
            frames.push(await composeFrame({
                character,
                plan: params.plan,
                frameIndex: index,
                outputProfile,
                editRecipe: params.editRecipe,
            }));
        }
        const composedFrameCheckpoint = params.onComposedFrames
            ? params.onComposedFrames(frames)
            : Promise.resolve();
        const [files] = await Promise.all([
            encodeRequestedFormats(
                dir,
                frames,
                params.plan.action.fps,
                params.formats,
                params.plan,
                outputProfile,
            ),
            composedFrameCheckpoint,
        ]);
        return files;
    });
}

/**
 * Uses AI-generated pose images as the frames themselves. Unlike keyframe
 * rendering, no whole-character transform is applied after generation.
 */
async function applyFrameTransitions(
    frames: Buffer[],
    transitions: EmoticonFrameTransition[],
): Promise<Buffer[]> {
    if (frames.length < 2 || transitions.length !== frames.length) return frames;
    const decoded = await Promise.all(frames.map((frame) => (
        sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    )));
    const { width, height, channels } = decoded[0].info;
    if (channels !== 4 || decoded.some((entry) => (
        entry.info.width !== width || entry.info.height !== height || entry.info.channels !== 4
    ))) return frames;

    return Promise.all(decoded.map(async (current, index) => {
        const transition = transitions[index];
        if (!transition || transition.kind === 'cut') return frames[index];
        const previous = decoded[(index - 1 + decoded.length) % decoded.length];
        const progress = Math.min(0.85, Math.max(0.15, transition.strength));
        const output = Buffer.alloc(current.data.length);
        const copyPixel = (source: Buffer, sourceX: number, sourceY: number, targetOffset: number) => {
            const sourceOffset = (Math.min(height - 1, Math.max(0, sourceY)) * width
                + Math.min(width - 1, Math.max(0, sourceX))) * 4;
            for (let channel = 0; channel < 4; channel += 1) output[targetOffset + channel] = source[sourceOffset + channel];
        };

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const offset = (y * width + x) * 4;
                if (transition.kind === 'fade') {
                    for (let channel = 0; channel < 4; channel += 1) {
                        output[offset + channel] = Math.round(previous.data[offset + channel] * (1 - progress)
                            + current.data[offset + channel] * progress);
                    }
                } else if (transition.kind === 'slide_left') {
                    const shift = Math.round(width * progress);
                    if (x < width - shift) copyPixel(previous.data, x + shift, y, offset);
                    else copyPixel(current.data, x - (width - shift), y, offset);
                } else if (transition.kind === 'slide_right') {
                    const shift = Math.round(width * progress);
                    if (x >= shift) copyPixel(previous.data, x - shift, y, offset);
                    else copyPixel(current.data, width - shift + x, y, offset);
                } else {
                    const scale = 0.72 + progress * 0.28;
                    const scaledWidth = Math.max(1, Math.round(width * scale));
                    const scaledHeight = Math.max(1, Math.round(height * scale));
                    const left = Math.floor((width - scaledWidth) / 2);
                    const top = Math.floor((height - scaledHeight) / 2);
                    if (x >= left && x < left + scaledWidth && y >= top && y < top + scaledHeight) {
                        copyPixel(current.data, Math.floor(((x - left) / scaledWidth) * width), Math.floor(((y - top) / scaledHeight) * height), offset);
                    } else copyPixel(previous.data, x, y, offset);
                }
            }
        }
        return sharp(output, { raw: { width, height, channels: 4 } }).png().toBuffer();
    }));
}

export async function renderImageSequenceEmoticon(params: {
    frameBuffers: Buffer[];
    plan: EmoticonPlan;
    formats: EmoticonExportFormat[];
    outputProfile?: EmoticonOutputProfile;
    editRecipe?: EmoticonImageEditRecipe;
    frameDurationsMs?: number[];
    frameTransitions?: EmoticonFrameTransition[];
    onComposedFrames?: (frames: Buffer[]) => Promise<void>;
}): Promise<RenderedEmoticonFile[]> {
    if (params.frameBuffers.length !== params.plan.action.frameCount) {
        throw new Error('Frame sequence count does not match the animation plan.');
    }
    return withTempDir('emoticon-image-sequence-', async (dir) => {
        const outputProfile = resolveEmoticonOutputProfile(params.outputProfile);
        assertOutputProfileConstraints({ plan: params.plan, formats: params.formats, outputProfile });
        assertBubbleTimeline(params.plan.bubble, params.plan.action.frameCount);
        const normalizedCharacters = await normalizeCharacterSequence(params.frameBuffers, params.plan);
        const characters = await Promise.all(normalizedCharacters.map((character) => (
            applyImageEditToCharacter(character, params.editRecipe)
        )));
        const composedFrames = await Promise.all(characters.map(async (character, frameIndex) => {
            return composeFrame({
                character,
                plan: params.plan,
                frameIndex,
                outputProfile,
                applyMotion: false,
                editRecipe: params.editRecipe,
            });
        }));
        const frames = params.frameTransitions?.length === composedFrames.length
            ? await applyFrameTransitions(composedFrames, params.frameTransitions)
            : composedFrames;
        // Composed-frame persistence is recoverability I/O; encoding is local
        // CPU/process work. Run them together and still require both to finish
        // before marking the job complete.
        const composedFrameCheckpoint = params.onComposedFrames
            ? params.onComposedFrames(frames)
            : Promise.resolve();
        const [files] = await Promise.all([
            encodeRequestedFormats(
                dir,
                frames,
                params.plan.action.fps,
                params.formats,
                params.plan,
                outputProfile,
                params.frameDurationsMs,
            ),
            composedFrameCheckpoint,
        ]);
        return files;
    });
}

export async function renderVideoEmoticon(params: {
    videoBuffer: Buffer;
    plan: EmoticonPlan;
    formats: EmoticonExportFormat[];
    sourceDurationSeconds: number;
    outputProfile?: EmoticonOutputProfile;
}): Promise<RenderedEmoticonFile[]> {
    return withTempDir('emoticon-video-', async (dir) => {
        const outputProfile = resolveEmoticonOutputProfile(params.outputProfile);
        assertOutputProfileConstraints({ plan: params.plan, formats: params.formats, outputProfile });
        assertBubbleTimeline(params.plan.bubble, params.plan.action.frameCount);
        const frames = await extractVideoFrames({
            dir,
            videoBuffer: params.videoBuffer,
            frameCount: params.plan.action.frameCount,
            sourceDurationSeconds: params.sourceDurationSeconds,
            plan: params.plan,
        });
        const profiledFrames = await Promise.all(frames.map((frame) => sharp(frame).resize({
            width: outputProfile.width,
            height: outputProfile.height,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        }).png().toBuffer()));
        return encodeRequestedFormats(
            dir,
            profiledFrames,
            params.plan.action.fps,
            params.formats,
            params.plan,
            outputProfile,
        );
    });
}
