"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmoticonSourceImage = normalizeEmoticonSourceImage;
exports.normalizeGeneratedEmoticonPose = normalizeGeneratedEmoticonPose;
exports.evaluateEmoticonFrameVariation = evaluateEmoticonFrameVariation;
exports.extractVideoReviewFrame = extractVideoReviewFrame;
exports.renderImageEmoticon = renderImageEmoticon;
exports.renderImageSequenceEmoticon = renderImageSequenceEmoticon;
exports.renderVideoEmoticon = renderVideoEmoticon;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSZip = require("jszip");
// These packages expose CommonJS entry points in the Functions runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath = require('ffmpeg-static');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
const CANVAS_SIZE = 360;
const CHARACTER_MAX_WIDTH = 292;
const CHARACTER_MAX_HEIGHT_WITHOUT_BUBBLE = 316;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_GENERATED_POSE_BYTES = 30 * 1024 * 1024;
const MAX_SOURCE_DIMENSION = 4096;
const MAX_SOURCE_PIXELS = MAX_SOURCE_DIMENSION * MAX_SOURCE_DIMENSION;
async function normalizeInputImage(params) {
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
async function removeConnectedFlatBackground(pngBuffer) {
    const { data, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const pixelCount = width * height;
    let transparentPixels = 0;
    for (let index = 3; index < data.length; index += channels) {
        if (data[index] < 245)
            transparentPixels += 1;
    }
    if (transparentPixels / pixelCount >= 0.005)
        return pngBuffer;
    const cornerOffsets = [
        0,
        (width - 1) * channels,
        (height - 1) * width * channels,
        ((height * width) - 1) * channels,
    ];
    const target = [0, 1, 2].map((channel) => (Math.round(cornerOffsets.reduce((sum, offset) => sum + data[offset + channel], 0) / 4)));
    const colorDistanceSquared = (offset) => ((data[offset] - target[0]) ** 2
        + (data[offset + 1] - target[1]) ** 2
        + (data[offset + 2] - target[2]) ** 2);
    if (cornerOffsets.some((offset) => colorDistanceSquared(offset) > 45 ** 2))
        return pngBuffer;
    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let queueStart = 0;
    let queueEnd = 0;
    const thresholdSquared = 42 ** 2;
    const enqueue = (pixelIndex) => {
        if (visited[pixelIndex])
            return;
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
        if (x > 0)
            enqueue(pixelIndex - 1);
        if (x + 1 < width)
            enqueue(pixelIndex + 1);
        if (y > 0)
            enqueue(pixelIndex - width);
        if (y + 1 < height)
            enqueue(pixelIndex + width);
    }
    const removedRatio = queueEnd / pixelCount;
    if (removedRatio < 0.005 || removedRatio > 0.97)
        return pngBuffer;
    for (let index = 0; index < queueEnd; index += 1) {
        data[queue[index] * channels + 3] = 0;
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
async function removeDistantResidualComponents(pngBuffer) {
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
    const components = [];
    for (let start = 0; start < pixelCount; start += 1) {
        if (labels[start] !== -1 || data[start * channels + alphaOffset] <= 32)
            continue;
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
        });
    }
    if (components.length < 2)
        return pngBuffer;
    const mainIndex = components.reduce((bestIndex, component, index) => (component.count > components[bestIndex].count ? index : bestIndex), 0);
    const main = components[mainIndex];
    const minArtifactPixels = Math.max(120, Math.round(pixelCount * 0.0035));
    const separation = Math.max(12, Math.round(Math.min(width, height) * 0.025));
    const removable = new Set();
    components.forEach((component, index) => {
        if (index === mainIndex || component.count >= minArtifactPixels)
            return;
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
        if (horizontalGap >= separation || verticalGap >= separation)
            removable.add(index);
    });
    if (!removable.size)
        return pngBuffer;
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        if (removable.has(labels[pixelIndex]))
            data[pixelIndex * channels + alphaOffset] = 0;
    }
    return sharp(data, {
        raw: { width, height, channels },
    }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}
async function normalizeEmoticonSourceImage(buffer) {
    return normalizeInputImage({
        buffer,
        maxBytes: MAX_SOURCE_BYTES,
        maxOutputDimension: 1800,
        label: 'Source image',
    });
}
async function normalizeGeneratedEmoticonPose(buffer) {
    const normalized = await normalizeInputImage({
        buffer,
        maxBytes: MAX_GENERATED_POSE_BYTES,
        maxOutputDimension: 2048,
        label: 'Generated pose',
    });
    return removeDistantResidualComponents(await removeConnectedFlatBackground(normalized));
}
const FRAME_VARIATION_ANALYSIS_SIZE = 64;
const FRAME_DUPLICATE_THRESHOLD = 0.004;
async function createFrameVariationFingerprint(buffer) {
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
function calculateFrameDifference(first, second) {
    if (first.length !== second.length || first.length % 4 !== 0)
        return 1;
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
/**
 * A deterministic safety net for exact or near-exact duplicate generated
 * frames. It does not judge artistic quality; the multimodal reviewer remains
 * responsible for anatomy, identity, and genuine limb/expression motion.
 */
async function evaluateEmoticonFrameVariation(frameBuffers) {
    if (frameBuffers.length < 2) {
        return { passes: false, duplicateFrameIndices: [0], transitionDifferences: [] };
    }
    const fingerprints = await Promise.all(frameBuffers.map(createFrameVariationFingerprint));
    const transitionDifferences = fingerprints.map((frame, index) => (calculateFrameDifference(frame, fingerprints[(index + 1) % fingerprints.length])));
    const duplicateFrameIndices = transitionDifferences
        .map((difference, index) => (difference < FRAME_DUPLICATE_THRESHOLD ? (index + 1) % fingerprints.length : -1))
        .filter((index) => index >= 0);
    return {
        passes: duplicateFrameIndices.length === 0,
        duplicateFrameIndices,
        transitionDifferences,
    };
}
function resolveFfmpegPath() {
    var _a;
    const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const candidates = [
        (_a = process.env.FFMPEG_BIN) === null || _a === void 0 ? void 0 : _a.trim(),
        ffmpegPath,
        (0, node_path_1.join)(process.cwd(), 'node_modules', 'ffmpeg-static', executableName),
    ].filter((candidate) => Boolean(candidate));
    const binary = candidates.find((candidate) => (0, node_fs_1.existsSync)(candidate));
    if (!binary)
        throw new Error('FFmpeg executable was not found.');
    return binary;
}
async function runFfmpeg(args) {
    const binary = resolveFfmpegPath();
    await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(binary, args, { windowsHide: true });
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
            reject(new Error(stderr.slice(-5000) || `FFmpeg exited with code ${code}`));
        });
    });
}
async function withTempDir(prefix, task) {
    const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), prefix));
    try {
        return await task(dir);
    }
    finally {
        await (0, promises_1.rm)(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}
function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function splitBubbleText(text, isSide) {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (!normalized)
        return [];
    const maxChars = isSide ? 12 : 18;
    const maxLines = isSide ? 3 : 2;
    const lines = [];
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
function bubbleOpacity(plan, frameIndex) {
    if (plan.bubble.entrance === 'none')
        return 1;
    const entranceFrames = Math.max(2, Math.round(plan.action.frameCount * 0.2));
    return Math.min(1, (frameIndex + 1) / entranceFrames);
}
function hasSpeechBubble(plan) {
    return plan.bubble.style !== 'none' && Boolean(plan.bubble.text.trim());
}
function getBubbleLayout(plan, position = plan.bubble.position) {
    if (plan.bubble.style === 'none' || !plan.bubble.text.trim())
        return null;
    const isSide = position === 'left' || position === 'right';
    const lines = splitBubbleText(plan.bubble.text, isSide);
    if (!lines.length)
        return null;
    const width = Math.min(isSide ? 190 : 314, Math.max(isSide ? 126 : 142, Math.max(...lines.map((line) => line.length)) * (isSide ? 18 : 24) + 42));
    const height = lines.length > 2 ? 112 : lines.length > 1 ? 90 : 70;
    const x = position === 'left'
        ? 10
        : position === 'right'
            ? CANVAS_SIZE - width - 10
            : Math.round((CANVAS_SIZE - width) / 2);
    const y = position === 'bottom'
        ? CANVAS_SIZE - height - 12
        : isSide
            ? 16
            : 10;
    return { position, isSide, lines, width, height, x, y };
}
function createBubbleSvg(plan, frameIndex, layout = getBubbleLayout(plan)) {
    if (!layout)
        return null;
    const { position, isSide, lines, width, height, x, y } = layout;
    const opacity = bubbleOpacity(plan, frameIndex);
    const popScale = plan.bubble.entrance === 'pop' ? 0.82 + opacity * 0.18 : 1;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const shakeX = plan.bubble.entrance === 'shake'
        ? Math.sin(frameIndex * Math.PI * 1.7) * 7 * (1 - opacity)
        : 0;
    const transform = `translate(${shakeX} 0) translate(${centerX} ${centerY}) scale(${popScale}) translate(${-centerX} ${-centerY})`;
    const borderDash = plan.bubble.style === 'whisper' ? 'stroke-dasharray="6 5"' : '';
    const fill = plan.bubble.style === 'thought' ? '#FFFDF5' : '#FFFFFF';
    const stroke = '#222733';
    const radius = plan.bubble.style === 'rounded' || plan.bubble.style === 'whisper' ? 24 : 16;
    const fontSize = isSide
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
    const textY = y + (lines.length > 2 ? 31 : lines.length > 1 ? 35 : 43);
    const text = lines.map((line, index) => (`<text x="${centerX}" y="${textY + index * 27}" text-anchor="middle" `
        + `font-family="Noto Sans KR, Noto Sans CJK KR, Arial, sans-serif" font-size="${fontSize}" `
        + `font-weight="800" fill="#20242D">${escapeXml(line)}</text>`)).join('');
    const shape = plan.bubble.style === 'shout'
        ? `<polygon points="${x + 10},${y + height * 0.48} ${x},${y + 8} ${x + width * 0.22},${y + 16} ${x + width * 0.35},${y} ${x + width * 0.52},${y + 14} ${x + width * 0.76},${y + 2} ${x + width - 8},${y + 20} ${x + width},${y + height * 0.58} ${x + width - 18},${y + height - 2} ${x + width * 0.56},${y + height - 12} ${x + width * 0.48},${y + height + 9} ${x + width * 0.38},${y + height - 12} ${x + 14},${y + height}" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>`
        : `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="4" ${borderDash}/>`;
    const thoughtTail = position === 'bottom'
        ? `<circle cx="${centerX + 8}" cy="${y - 10}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="3"/><circle cx="${centerX + 18}" cy="${y - 22}" r="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
        : position === 'left'
            ? `<circle cx="${x + width + 10}" cy="${centerY + 4}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="3"/><circle cx="${x + width + 22}" cy="${centerY + 12}" r="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
            : position === 'right'
                ? `<circle cx="${x - 10}" cy="${centerY + 4}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="3"/><circle cx="${x - 22}" cy="${centerY + 12}" r="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
                : `<circle cx="${centerX + 8}" cy="${y + height + 10}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="3"/><circle cx="${centerX + 18}" cy="${y + height + 22}" r="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    const regularTail = position === 'bottom'
        ? `<path d="M ${centerX - 12} ${y + 2} L ${centerX + 4} ${y - 17} L ${centerX + 18} ${y + 2} Z" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>`
        : position === 'left'
            ? `<path d="M ${x + width - 2} ${centerY - 12} L ${x + width + 17} ${centerY + 4} L ${x + width - 2} ${centerY + 18} Z" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>`
            : position === 'right'
                ? `<path d="M ${x + 2} ${centerY - 12} L ${x - 17} ${centerY + 4} L ${x + 2} ${centerY + 18} Z" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>`
                : `<path d="M ${centerX - 12} ${y + height - 2} L ${centerX + 4} ${y + height + 17} L ${centerX + 18} ${y + height - 2} Z" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>`;
    const tail = plan.bubble.style === 'thought'
        ? thoughtTail
        : plan.bubble.style === 'shout'
            ? ''
            : regularTail;
    return Buffer.from(`<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">`
        + `<g opacity="${opacity}" transform="${transform}">${shape}${tail}${text}</g></svg>`);
}
function getMotionTransform(plan, index) {
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
async function normalizeCharacter(buffer, plan) {
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
function getCharacterTargetSize(plan, bubblePosition = plan.bubble.position) {
    const hasBubble = hasSpeechBubble(plan);
    const sideBubble = hasBubble && (bubblePosition === 'left' || bubblePosition === 'right');
    const verticalBubble = hasBubble && !sideBubble;
    return {
        width: sideBubble ? 135 : verticalBubble ? 260 : CHARACTER_MAX_WIDTH,
        height: sideBubble
            ? 190
            : verticalBubble
                ? 200
                : CHARACTER_MAX_HEIGHT_WITHOUT_BUBBLE,
    };
}
async function normalizeCharacterSequence(buffers, plan) {
    const analysisSize = 1024;
    const normalizedCanvases = await Promise.all(buffers.map((buffer) => (sharp(buffer)
        .ensureAlpha()
        .resize({
        width: analysisSize,
        height: analysisSize,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
        .png()
        .toBuffer())));
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
                if (data[(y * info.width + x) * channels + 3] <= 16)
                    continue;
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
    return Promise.all(normalizedCanvases.map((buffer) => (sharp(buffer)
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
        .toBuffer())));
}
function getCharacterPlacement(params) {
    const hasBubble = hasSpeechBubble(params.plan);
    const bubbleAtBottom = params.bubblePosition === 'bottom' && hasBubble;
    const bubbleAtSide = ((params.bubblePosition === 'left' || params.bubblePosition === 'right')
        && hasBubble);
    const baseTop = bubbleAtBottom
        ? 6
        : hasBubble && !bubbleAtSide
            ? CANVAS_SIZE - params.height - 6
            : Math.round((CANVAS_SIZE - params.height) / 2);
    const minTop = hasBubble && !bubbleAtSide && !bubbleAtBottom ? 146 : 0;
    const maxTop = bubbleAtBottom ? 6 : CANVAS_SIZE - params.height;
    const top = Math.max(minTop, Math.min(maxTop, baseTop + params.transform.y));
    const baseLeft = bubbleAtSide
        ? params.bubblePosition === 'left'
            ? CANVAS_SIZE - params.width - 4
            : 4
        : Math.round((CANVAS_SIZE - params.width) / 2);
    const minLeft = bubbleAtSide && params.bubblePosition === 'left'
        ? baseLeft
        : 0;
    const maxLeft = bubbleAtSide && params.bubblePosition === 'right'
        ? baseLeft
        : CANVAS_SIZE - params.width;
    const left = Math.max(minLeft, Math.min(maxLeft, baseLeft + params.transform.x));
    return { left, top };
}
async function getVisibleBounds(buffer) {
    const { data, info } = await sharp(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
            if (data[(y * info.width + x) * info.channels + 3] <= 16)
                continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }
    return maxX >= minX && maxY >= minY
        ? { minX, minY, maxX, maxY }
        : { minX: 0, minY: 0, maxX: info.width - 1, maxY: info.height - 1 };
}
function translateBounds(bounds, left, top) {
    return {
        minX: bounds.minX + left,
        minY: bounds.minY + top,
        maxX: bounds.maxX + left,
        maxY: bounds.maxY + top,
    };
}
function getBubbleBounds(layout, plan) {
    const tailSize = plan.bubble.style === 'thought' ? 28 : plan.bubble.style === 'shout' ? 13 : 22;
    const bounds = {
        minX: layout.x - 4,
        minY: layout.y - 4,
        maxX: layout.x + layout.width + 4,
        maxY: layout.y + layout.height + 4,
    };
    if (layout.position === 'top')
        bounds.maxY += tailSize;
    if (layout.position === 'bottom')
        bounds.minY -= tailSize;
    if (layout.position === 'left')
        bounds.maxX += tailSize;
    if (layout.position === 'right')
        bounds.minX -= tailSize;
    return bounds;
}
function overlapArea(first, second) {
    const width = Math.max(0, Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX) + 1);
    const height = Math.max(0, Math.min(first.maxY, second.maxY) - Math.max(first.minY, second.minY) + 1);
    return width * height;
}
async function resolveBubblePlacement(params) {
    const requestedLayout = getBubbleLayout(params.plan);
    const requestedPlacement = getCharacterPlacement({
        plan: params.plan,
        width: params.width,
        height: params.height,
        transform: params.transform,
        bubblePosition: params.plan.bubble.position,
    });
    if (!requestedLayout) {
        return Object.assign({ layout: null }, requestedPlacement);
    }
    const characterBounds = await getVisibleBounds(params.transformed);
    const positions = [...new Set([
            params.plan.bubble.position,
            'top',
            'bottom',
            'left',
            'right',
        ])];
    let best = null;
    for (const position of positions) {
        const layout = getBubbleLayout(params.plan, position);
        if (!layout)
            continue;
        const placement = getCharacterPlacement({
            plan: params.plan,
            width: params.width,
            height: params.height,
            transform: params.transform,
            bubblePosition: position,
        });
        const score = overlapArea(translateBounds(characterBounds, placement.left, placement.top), getBubbleBounds(layout, params.plan));
        if (!best || score < best.score) {
            best = Object.assign(Object.assign({ layout }, placement), { score });
        }
    }
    return best
        ? { layout: best.layout, left: best.left, top: best.top }
        : Object.assign({ layout: requestedLayout }, requestedPlacement);
}
async function composeFrame(params) {
    const transform = params.applyMotion === false
        ? { x: 0, y: 0, rotation: 0, scale: 1 }
        : getMotionTransform(params.plan, params.frameIndex);
    const target = getCharacterTargetSize(params.plan);
    const metadata = await sharp(params.character).metadata();
    const baseWidth = metadata.width || target.width;
    const baseHeight = metadata.height || target.height;
    const transformed = await sharp(params.character)
        .resize({
        width: Math.max(1, Math.round(baseWidth * transform.scale)),
        height: Math.max(1, Math.round(baseHeight * transform.scale)),
        fit: 'fill',
    })
        .rotate(transform.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    const transformedMeta = await sharp(transformed).metadata();
    const width = transformedMeta.width || baseWidth;
    const height = transformedMeta.height || baseHeight;
    const placement = await resolveBubblePlacement({
        plan: params.plan,
        transformed,
        width,
        height,
        transform,
    });
    const bubble = createBubbleSvg(params.plan, params.frameIndex, placement.layout);
    const composites = [{ input: transformed, left: placement.left, top: placement.top }];
    if (bubble)
        composites.push({ input: bubble, left: 0, top: 0 });
    return sharp({
        create: {
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite(composites).png().toBuffer();
}
async function writeFrames(dir, frames) {
    await Promise.all(frames.map((frame, index) => ((0, promises_1.writeFile)((0, node_path_1.join)(dir, `frame-${String(index + 1).padStart(3, '0')}.png`), frame))));
}
async function extractVideoFrames(params) {
    const inputPath = (0, node_path_1.join)(params.dir, 'source-video.mp4');
    const rawDir = (0, node_path_1.join)(params.dir, 'raw');
    await (0, promises_1.writeFile)(inputPath, params.videoBuffer);
    const { mkdir } = await Promise.resolve().then(() => require('node:fs/promises'));
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
        (0, node_path_1.join)(rawDir, 'frame-%03d.png'),
    ]);
    const names = (await (0, promises_1.readdir)(rawDir))
        .filter((name) => /^frame-\d{3}\.png$/.test(name))
        .sort()
        .slice(0, params.frameCount);
    if (!names.length)
        throw new Error('No animation frames could be extracted from the generated video.');
    const rawFrames = await Promise.all(names.map((name) => (0, promises_1.readFile)((0, node_path_1.join)(rawDir, name))));
    while (rawFrames.length < params.frameCount) {
        rawFrames.push(rawFrames[rawFrames.length - 1]);
    }
    return Promise.all(rawFrames.map(async (frame, frameIndex) => {
        const transparentFrame = await removeConnectedFlatBackground(await sharp(frame).ensureAlpha().png().toBuffer());
        const bubble = createBubbleSvg(params.plan, frameIndex);
        return bubble
            ? sharp(transparentFrame).composite([{ input: bubble, left: 0, top: 0 }]).png().toBuffer()
            : transparentFrame;
    }));
}
async function extractVideoReviewFrame(params) {
    return withTempDir('emoticon-review-', async (dir) => {
        var _a;
        const inputPath = (0, node_path_1.join)(dir, 'source-video.mp4');
        const outputPath = (0, node_path_1.join)(dir, 'review-frame.png');
        await (0, promises_1.writeFile)(inputPath, params.videoBuffer);
        await runFfmpeg([
            '-y',
            '-ss',
            String(Math.max(0, (_a = params.timeSec) !== null && _a !== void 0 ? _a : 0.8)),
            '-i',
            inputPath,
            '-frames:v',
            '1',
            '-vf',
            `scale=${CANVAS_SIZE}:${CANVAS_SIZE}:force_original_aspect_ratio=decrease,pad=${CANVAS_SIZE}:${CANVAS_SIZE}:(ow-iw)/2:(oh-ih)/2`,
            outputPath,
        ]);
        return (0, promises_1.readFile)(outputPath);
    });
}
async function encodeWebp(dir, fps) {
    const outputPath = (0, node_path_1.join)(dir, 'emoticon.webp');
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        (0, node_path_1.join)(dir, 'frame-%03d.png'),
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
    return (0, promises_1.readFile)(outputPath);
}
async function encodeGif(dir, fps) {
    const palettePath = (0, node_path_1.join)(dir, 'palette.png');
    const outputPath = (0, node_path_1.join)(dir, 'emoticon.gif');
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        (0, node_path_1.join)(dir, 'frame-%03d.png'),
        '-vf',
        'palettegen=reserve_transparent=1:stats_mode=diff',
        palettePath,
    ]);
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        (0, node_path_1.join)(dir, 'frame-%03d.png'),
        '-i',
        palettePath,
        '-lavfi',
        'paletteuse=alpha_threshold=128:dither=sierra2_4a',
        '-loop',
        '0',
        outputPath,
    ]);
    return (0, promises_1.readFile)(outputPath);
}
async function encodeMp4(dir, fps) {
    const outputPath = (0, node_path_1.join)(dir, 'emoticon.mp4');
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        (0, node_path_1.join)(dir, 'frame-%03d.png'),
        '-filter_complex',
        `[0:v]format=rgba[fg];color=c=white:s=${CANVAS_SIZE}x${CANVAS_SIZE}:r=${fps}[bg];[bg][fg]overlay=shortest=1,format=yuv420p[out]`,
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
    return (0, promises_1.readFile)(outputPath);
}
async function encodeWebm(dir, fps) {
    const outputPath = (0, node_path_1.join)(dir, 'emoticon.webm');
    await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        (0, node_path_1.join)(dir, 'frame-%03d.png'),
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
    return (0, promises_1.readFile)(outputPath);
}
async function encodePngZip(frames, plan) {
    const zip = new JSZip();
    frames.forEach((frame, index) => {
        zip.file(`frames/frame-${String(index + 1).padStart(3, '0')}.png`, frame);
    });
    const columns = Math.ceil(Math.sqrt(frames.length));
    const rows = Math.ceil(frames.length / columns);
    const spriteSheet = await sharp({
        create: {
            width: columns * CANVAS_SIZE,
            height: rows * CANVAS_SIZE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite(frames.map((frame, index) => ({
        input: frame,
        left: (index % columns) * CANVAS_SIZE,
        top: Math.floor(index / columns) * CANVAS_SIZE,
    }))).png().toBuffer();
    const spriteManifest = {
        image: 'sprite-sheet.png',
        canvas: { width: columns * CANVAS_SIZE, height: rows * CANVAS_SIZE },
        cell: { width: CANVAS_SIZE, height: CANVAS_SIZE },
        columns,
        rows,
        frameCount: frames.length,
        fps: plan.action.fps,
        durationMs: plan.action.durationMs,
        loop: true,
        frames: frames.map((_, index) => ({
            index,
            x: (index % columns) * CANVAS_SIZE,
            y: Math.floor(index / columns) * CANVAS_SIZE,
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            durationMs: Math.round(1000 / plan.action.fps),
        })),
    };
    const compatibility = {
        target: 'Kakao-style private production reference',
        canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE, pass: true },
        frameCount: {
            actual: frames.length,
            maximum: 24,
            pass: frames.length >= 8 && frames.length <= 24,
        },
        timing: {
            fps: plan.action.fps,
            durationMs: plan.action.durationMs,
            pass: plan.action.durationMs >= 700 && plan.action.durationMs <= 3000,
        },
        loop: true,
        note: 'This report checks technical canvas and frame constraints only; it is not a submission approval.',
    };
    zip.file('sprite-sheet.png', spriteSheet);
    zip.file('sprite-sheet.json', JSON.stringify(spriteManifest, null, 2));
    zip.file('kakao-compatibility.json', JSON.stringify(compatibility, null, 2));
    zip.file('animation-plan.json', JSON.stringify(plan, null, 2));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
async function encodeRequestedFormats(dir, frames, fps, formats, plan) {
    await writeFrames(dir, frames);
    const results = [];
    for (const format of formats) {
        if (format === 'webp') {
            results.push({ format, extension: 'webp', contentType: 'image/webp', buffer: await encodeWebp(dir, fps) });
        }
        else if (format === 'gif') {
            results.push({ format, extension: 'gif', contentType: 'image/gif', buffer: await encodeGif(dir, fps) });
        }
        else if (format === 'mp4') {
            results.push({ format, extension: 'mp4', contentType: 'video/mp4', buffer: await encodeMp4(dir, fps) });
        }
        else if (format === 'webm') {
            results.push({ format, extension: 'webm', contentType: 'video/webm', buffer: await encodeWebm(dir, fps) });
        }
        else if (format === 'png_zip') {
            results.push({ format, extension: 'zip', contentType: 'application/zip', buffer: await encodePngZip(frames, plan) });
        }
    }
    return results;
}
async function renderImageEmoticon(params) {
    return withTempDir('emoticon-image-', async (dir) => {
        const character = await normalizeCharacter(params.imageBuffer, params.plan);
        const frames = [];
        for (let index = 0; index < params.plan.action.frameCount; index += 1) {
            frames.push(await composeFrame({ character, plan: params.plan, frameIndex: index }));
        }
        return encodeRequestedFormats(dir, frames, params.plan.action.fps, params.formats, params.plan);
    });
}
/**
 * Uses AI-generated pose images as the frames themselves. Unlike keyframe
 * rendering, no whole-character transform is applied after generation.
 */
async function renderImageSequenceEmoticon(params) {
    if (params.frameBuffers.length !== params.plan.action.frameCount) {
        throw new Error('AI frame sequence count does not match the animation plan.');
    }
    return withTempDir('emoticon-image-sequence-', async (dir) => {
        const characters = await normalizeCharacterSequence(params.frameBuffers, params.plan);
        const frames = await Promise.all(characters.map(async (character, frameIndex) => {
            return composeFrame({
                character,
                plan: params.plan,
                frameIndex,
                applyMotion: false,
            });
        }));
        return encodeRequestedFormats(dir, frames, params.plan.action.fps, params.formats, params.plan);
    });
}
async function renderVideoEmoticon(params) {
    return withTempDir('emoticon-video-', async (dir) => {
        const frames = await extractVideoFrames({
            dir,
            videoBuffer: params.videoBuffer,
            frameCount: params.plan.action.frameCount,
            sourceDurationSeconds: params.sourceDurationSeconds,
            plan: params.plan,
        });
        return encodeRequestedFormats(dir, frames, params.plan.action.fps, params.formats, params.plan);
    });
}
//# sourceMappingURL=renderer.js.map