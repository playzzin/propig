import type { Sharp, SharpOptions } from 'sharp';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as (
    input?: Buffer | string | SharpOptions,
    options?: SharpOptions,
) => Sharp;

export const MAX_EMOTICON_CONTAINER_FRAMES = 24;
export const MAX_EMOTICON_CONTAINER_PIXELS = 96 * 1024 * 1024;

export const EMOTICON_SPRITE_SHEET_STRATEGY = 'sprite-sheet-v1' as const;

export type EmoticonSpriteSheetLayout = {
    columns: number;
    rows: number;
    frameCount: number;
};

export type EmoticonSpriteSheetExtraction = {
    frames: Buffer[];
    layout: EmoticonSpriteSheetLayout;
    evidence: {
        background: 'transparent' | 'flat-color';
        averageCellBorderBackgroundRatio: number;
        minimumCellContentRatio: number;
        maximumCellContentRatio: number;
    };
};

const AUTO_SPRITE_LAYOUTS: Array<Pick<EmoticonSpriteSheetLayout, 'columns' | 'rows'>> = [
    { columns: 2, rows: 1 },
    { columns: 3, rows: 1 },
    { columns: 2, rows: 2 },
    { columns: 3, rows: 2 },
    { columns: 4, rows: 2 },
    { columns: 3, rows: 3 },
    { columns: 4, rows: 3 },
    { columns: 3, rows: 4 },
    { columns: 4, rows: 4 },
    { columns: 5, rows: 4 },
    { columns: 4, rows: 5 },
    { columns: 6, rows: 4 },
    { columns: 4, rows: 6 },
];

export function resolveEmoticonSpriteSheetLayout(frameCount: number): EmoticonSpriteSheetLayout {
    const normalized = Math.max(2, Math.min(MAX_EMOTICON_CONTAINER_FRAMES, Math.round(frameCount)));
    if (normalized <= 2) return { columns: 2, rows: 1, frameCount: normalized };
    if (normalized <= 3) return { columns: 3, rows: 1, frameCount: normalized };
    if (normalized <= 4) return { columns: 2, rows: 2, frameCount: normalized };
    if (normalized <= 6) return { columns: 3, rows: 2, frameCount: normalized };
    if (normalized <= 8) return { columns: 4, rows: 2, frameCount: normalized };
    if (normalized <= 9) return { columns: 3, rows: 3, frameCount: normalized };
    if (normalized <= 12) return { columns: 4, rows: 3, frameCount: normalized };
    if (normalized <= 16) return { columns: 4, rows: 4, frameCount: normalized };
    if (normalized <= 20) return { columns: 5, rows: 4, frameCount: normalized };
    return { columns: 6, rows: 4, frameCount: normalized };
}

type DecodedSpriteSheet = {
    data: Buffer;
    width: number;
    height: number;
    channels: number;
    transparentBackground: boolean;
    backgroundRgb: [number, number, number];
};

type SpriteLayoutEvidence = EmoticonSpriteSheetExtraction['evidence'] & {
    score: number;
};

function pixelOffset(decoded: DecodedSpriteSheet, x: number, y: number): number {
    return ((y * decoded.width) + x) * decoded.channels;
}

function colorDistanceSquared(
    decoded: DecodedSpriteSheet,
    offset: number,
    target: [number, number, number],
): number {
    return (
        (decoded.data[offset] - target[0]) ** 2
        + (decoded.data[offset + 1] - target[1]) ** 2
        + (decoded.data[offset + 2] - target[2]) ** 2
    );
}

function isSpriteBackgroundPixel(decoded: DecodedSpriteSheet, x: number, y: number): boolean {
    const offset = pixelOffset(decoded, x, y);
    const alpha = decoded.data[offset + decoded.channels - 1];
    if (decoded.transparentBackground) return alpha <= 64;
    return colorDistanceSquared(decoded, offset, decoded.backgroundRgb) <= 58 ** 2;
}

async function decodeSpriteSheet(source: Buffer): Promise<DecodedSpriteSheet> {
    const { data, info } = await sharp(source, {
        failOn: 'error',
        limitInputPixels: MAX_EMOTICON_CONTAINER_PIXELS,
    }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    if (
        width < 192
        || height < 128
        || width > 4096
        || height > 4096
        || width * height > MAX_EMOTICON_CONTAINER_PIXELS
    ) {
        throw new Error('Sprite sheet dimensions are outside the supported range.');
    }
    const cornerOffsets = [
        pixelOffset({ data, width, height, channels, transparentBackground: false, backgroundRgb: [0, 0, 0] }, 0, 0),
        ((width - 1) * channels),
        ((height - 1) * width * channels),
        (((height * width) - 1) * channels),
    ];
    const alphaOffset = channels - 1;
    const transparentBackground = cornerOffsets.every((offset) => data[offset + alphaOffset] <= 64);
    const backgroundRgb = [0, 1, 2].map((channel) => Math.round(
        cornerOffsets.reduce((sum, offset) => sum + data[offset + channel], 0) / cornerOffsets.length,
    )) as [number, number, number];
    if (!transparentBackground) {
        const cornersAgree = cornerOffsets.every(
            (offset) => colorDistanceSquared(
                { data, width, height, channels, transparentBackground, backgroundRgb },
                offset,
                backgroundRgb,
            ) <= 72 ** 2,
        );
        if (!cornersAgree) {
            throw new Error('Sprite sheet corners do not share one removable background.');
        }
    }
    return { data, width, height, channels, transparentBackground, backgroundRgb };
}

function inspectSpriteLayout(
    decoded: DecodedSpriteSheet,
    layout: EmoticonSpriteSheetLayout,
    options: { enforceCanvasRatio?: boolean } = {},
): SpriteLayoutEvidence | null {
    const cellWidth = decoded.width / layout.columns;
    const cellHeight = decoded.height / layout.rows;
    if (cellWidth < 96 || cellHeight < 96 || layout.columns * layout.rows < layout.frameCount) return null;
    const ratioError = Math.abs(Math.log(
        (decoded.width / decoded.height) / (layout.columns / layout.rows),
    ));
    // Automatic inference needs near-square cells so a regular illustration is
    // not accidentally treated as a grid. Generated sheets have an explicit
    // requested layout and some providers only expose 3:2/4:3 canvases, so the
    // known layout may safely tolerate rectangular cells.
    if ((options.enforceCanvasRatio ?? true) && ratioError > 0.16) return null;

    const borderRatios: number[] = [];
    const contentRatios: number[] = [];
    for (let index = 0; index < layout.frameCount; index += 1) {
        const column = index % layout.columns;
        const row = Math.floor(index / layout.columns);
        const left = Math.round((column * decoded.width) / layout.columns);
        const right = Math.round(((column + 1) * decoded.width) / layout.columns) - 1;
        const top = Math.round((row * decoded.height) / layout.rows);
        const bottom = Math.round(((row + 1) * decoded.height) / layout.rows) - 1;
        const inset = Math.max(1, Math.round(Math.min(right - left, bottom - top) * 0.012));
        let borderBackground = 0;
        let borderSamples = 0;
        for (let step = 0; step < 24; step += 1) {
            const progress = step / 23;
            const x = Math.min(right - inset, Math.max(left + inset, Math.round(left + ((right - left) * progress))));
            const y = Math.min(bottom - inset, Math.max(top + inset, Math.round(top + ((bottom - top) * progress))));
            for (const [sampleX, sampleY] of [
                [x, top + inset],
                [x, bottom - inset],
                [left + inset, y],
                [right - inset, y],
            ]) {
                borderSamples += 1;
                if (isSpriteBackgroundPixel(decoded, sampleX, sampleY)) borderBackground += 1;
            }
        }
        const borderRatio = borderBackground / Math.max(1, borderSamples);
        if (borderRatio < 0.68) return null;
        borderRatios.push(borderRatio);

        let visibleSamples = 0;
        let interiorSamples = 0;
        for (let sampleY = 1; sampleY <= 14; sampleY += 1) {
            for (let sampleX = 1; sampleX <= 14; sampleX += 1) {
                const x = Math.round(left + ((right - left) * sampleX / 15));
                const y = Math.round(top + ((bottom - top) * sampleY / 15));
                interiorSamples += 1;
                if (!isSpriteBackgroundPixel(decoded, x, y)) visibleSamples += 1;
            }
        }
        const contentRatio = visibleSamples / Math.max(1, interiorSamples);
        if (contentRatio < 0.025 || contentRatio > 0.82) return null;
        contentRatios.push(contentRatio);
    }
    const averageCellBorderBackgroundRatio = borderRatios.reduce((sum, value) => sum + value, 0)
        / borderRatios.length;
    const minimumCellContentRatio = Math.min(...contentRatios);
    const maximumCellContentRatio = Math.max(...contentRatios);
    return {
        background: decoded.transparentBackground ? 'transparent' : 'flat-color',
        averageCellBorderBackgroundRatio,
        minimumCellContentRatio,
        maximumCellContentRatio,
        score: averageCellBorderBackgroundRatio - ratioError - Math.abs(0.34 - (
            contentRatios.reduce((sum, value) => sum + value, 0) / contentRatios.length
        )) * 0.2,
    };
}

function trailingSpriteCellsAreEmpty(
    decoded: DecodedSpriteSheet,
    layout: EmoticonSpriteSheetLayout,
): boolean {
    const capacity = layout.columns * layout.rows;
    if (layout.frameCount >= capacity) return true;
    for (let index = layout.frameCount; index < capacity; index += 1) {
        const column = index % layout.columns;
        const row = Math.floor(index / layout.columns);
        const left = Math.round((column * decoded.width) / layout.columns);
        const right = Math.round(((column + 1) * decoded.width) / layout.columns) - 1;
        const top = Math.round((row * decoded.height) / layout.rows);
        const bottom = Math.round(((row + 1) * decoded.height) / layout.rows) - 1;
        let nonBackgroundSamples = 0;
        let sampleCount = 0;
        for (let sampleY = 1; sampleY <= 16; sampleY += 1) {
            for (let sampleX = 1; sampleX <= 16; sampleX += 1) {
                const x = Math.round(left + ((right - left) * sampleX / 17));
                const y = Math.round(top + ((bottom - top) * sampleY / 17));
                sampleCount += 1;
                if (!isSpriteBackgroundPixel(decoded, x, y)) nonBackgroundSamples += 1;
            }
        }
        if (nonBackgroundSamples / sampleCount > 0.012) return false;
    }
    return true;
}

function inferSpriteSheetLayout(decoded: DecodedSpriteSheet): {
    layout: EmoticonSpriteSheetLayout;
    evidence: SpriteLayoutEvidence;
} {
    const candidates = AUTO_SPRITE_LAYOUTS.flatMap(({ columns, rows }) => {
        const capacity = columns * rows;
        return Array.from({ length: capacity - 1 }, (_, offset) => offset + 2).flatMap((frameCount) => {
            const layout = { columns, rows, frameCount };
            const evidence = inspectSpriteLayout(decoded, layout, { enforceCanvasRatio: true });
            if (!evidence || !trailingSpriteCellsAreEmpty(decoded, layout)) return [];
            // Prefer a compact full grid when two candidates otherwise carry
            // equal evidence. A partial final row remains valid for arbitrary
            // 2-24 frame counts.
            const unusedCellPenalty = (capacity - frameCount) * 0.002;
            return [{
                layout,
                evidence: { ...evidence, score: evidence.score - unusedCellPenalty },
            }];
        });
    }).sort((left, right) => right.evidence.score - left.evidence.score);
    const selected = candidates[0];
    if (!selected || selected.evidence.averageCellBorderBackgroundRatio < 0.74) {
        throw new Error('A safe 2-24 frame sprite-sheet grid could not be detected.');
    }
    return selected;
}

export async function extractEmoticonSpriteSheetFrames(
    source: Buffer,
    requestedLayout?: EmoticonSpriteSheetLayout,
): Promise<EmoticonSpriteSheetExtraction> {
    const decoded = await decodeSpriteSheet(source);
    const selected = requestedLayout
        ? {
            layout: resolveEmoticonSpriteSheetLayout(requestedLayout.frameCount),
            evidence: null as SpriteLayoutEvidence | null,
        }
        : inferSpriteSheetLayout(decoded);
    if (requestedLayout) {
        selected.layout = {
            columns: requestedLayout.columns,
            rows: requestedLayout.rows,
            frameCount: Math.max(
                2,
                Math.min(MAX_EMOTICON_CONTAINER_FRAMES, Math.round(requestedLayout.frameCount)),
            ),
        };
        selected.evidence = inspectSpriteLayout(decoded, selected.layout, {
            enforceCanvasRatio: false,
        });
        if (!selected.evidence) {
            throw new Error('The generated sprite sheet does not contain one isolated pose in every requested cell.');
        }
    }
    const frames: Buffer[] = [];
    for (let index = 0; index < selected.layout.frameCount; index += 1) {
        const column = index % selected.layout.columns;
        const row = Math.floor(index / selected.layout.columns);
        const left = Math.round((column * decoded.width) / selected.layout.columns);
        const right = Math.round(((column + 1) * decoded.width) / selected.layout.columns);
        const top = Math.round((row * decoded.height) / selected.layout.rows);
        const bottom = Math.round(((row + 1) * decoded.height) / selected.layout.rows);
        frames.push(await extractAndMatteSpriteCell(decoded, {
            left,
            top,
            width: Math.max(1, right - left),
            height: Math.max(1, bottom - top),
        }));
    }
    const evidence = selected.evidence as SpriteLayoutEvidence;
    return {
        frames,
        layout: selected.layout,
        evidence: {
            background: evidence.background,
            averageCellBorderBackgroundRatio: evidence.averageCellBorderBackgroundRatio,
            minimumCellContentRatio: evidence.minimumCellContentRatio,
            maximumCellContentRatio: evidence.maximumCellContentRatio,
        },
    };
}

type SpriteCellRegion = {
    left: number;
    top: number;
    width: number;
    height: number;
};

function createSpriteBackgroundCandidate(
    rgba: Buffer,
    offset: number,
    backgroundRgb: [number, number, number],
    greenScreen: boolean,
): { candidate: boolean; removal: number; exact: boolean } {
    const red = rgba[offset];
    const green = rgba[offset + 1];
    const blue = rgba[offset + 2];
    const distance = Math.sqrt(
        (red - backgroundRgb[0]) ** 2
        + (green - backgroundRgb[1]) ** 2
        + (blue - backgroundRgb[2]) ** 2,
    );
    if (!greenScreen) {
        const candidate = distance <= 92;
        return {
            candidate,
            exact: distance <= 24,
            removal: candidate ? Math.max(0, Math.min(1, (92 - distance) / 34)) : 0,
        };
    }
    const dominance = Math.min(green - red, green - blue);
    const candidate = green >= 92 && dominance >= 14 && distance <= 176;
    const dominanceRemoval = Math.max(0, Math.min(1, (dominance - 16) / 16));
    const brightnessRemoval = Math.max(0, Math.min(1, (green - 96) / 38));
    return {
        candidate,
        exact: distance <= 24,
        removal: candidate ? dominanceRemoval * brightnessRemoval : 0,
    };
}

/**
 * Removes only the flat background connected to a sprite cell's border. This
 * differs intentionally from the single-pose normalizer: a sprite may contain
 * wide kicks, speed accents, or a separate recovery hand that must not be
 * discarded as a distant component. Interior colours remain protected unless
 * they are connected to the canvas edge, so white shirts and green costumes
 * are not erased merely because they resemble the matte.
 */
async function extractAndMatteSpriteCell(
    decoded: DecodedSpriteSheet,
    region: SpriteCellRegion,
): Promise<Buffer> {
    const channels = 4;
    const rgba = Buffer.alloc(region.width * region.height * channels);
    for (let y = 0; y < region.height; y += 1) {
        for (let x = 0; x < region.width; x += 1) {
            const sourceOffset = pixelOffset(decoded, region.left + x, region.top + y);
            const targetOffset = ((y * region.width) + x) * channels;
            rgba[targetOffset] = decoded.data[sourceOffset];
            rgba[targetOffset + 1] = decoded.data[sourceOffset + 1];
            rgba[targetOffset + 2] = decoded.data[sourceOffset + 2];
            rgba[targetOffset + 3] = decoded.data[sourceOffset + decoded.channels - 1];
        }
    }
    if (decoded.transparentBackground) {
        for (let offset = 0; offset < rgba.length; offset += channels) {
            if (rgba[offset + 3] > 32) continue;
            rgba[offset] = 255;
            rgba[offset + 1] = 255;
            rgba[offset + 2] = 255;
            rgba[offset + 3] = 0;
        }
        return encodeSpriteCellWithSafeGutter(rgba, region.width, region.height);
    }

    const greenScreen = decoded.backgroundRgb[1] >= 120
        && decoded.backgroundRgb[1] - decoded.backgroundRgb[0] >= 36
        && decoded.backgroundRgb[1] - decoded.backgroundRgb[2] >= 36;
    const pixelCount = region.width * region.height;
    const candidates = new Uint8Array(pixelCount);
    const removals = new Float32Array(pixelCount);
    const exactBackground = new Uint8Array(pixelCount);
    for (let index = 0; index < pixelCount; index += 1) {
        const result = createSpriteBackgroundCandidate(
            rgba,
            index * channels,
            decoded.backgroundRgb,
            greenScreen,
        );
        candidates[index] = result.candidate ? 1 : 0;
        removals[index] = result.removal;
        exactBackground[index] = result.exact ? 1 : 0;
    }

    const connected = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let head = 0;
    let tail = 0;
    const enqueue = (index: number) => {
        if (!candidates[index] || connected[index]) return;
        connected[index] = 1;
        queue[tail] = index;
        tail += 1;
    };
    for (let x = 0; x < region.width; x += 1) {
        enqueue(x);
        enqueue(((region.height - 1) * region.width) + x);
    }
    for (let y = 1; y < region.height - 1; y += 1) {
        enqueue(y * region.width);
        enqueue((y * region.width) + region.width - 1);
    }
    while (head < tail) {
        const index = queue[head];
        head += 1;
        const x = index % region.width;
        const y = Math.floor(index / region.width);
        if (x > 0) enqueue(index - 1);
        if (x + 1 < region.width) enqueue(index + 1);
        if (y > 0) enqueue(index - region.width);
        if (y + 1 < region.height) enqueue(index + region.width);
    }

    for (let index = 0; index < pixelCount; index += 1) {
        const offset = index * channels;
        // Never key an isolated interior pixel by colour alone: a white shirt
        // on white or a green costume on chroma green must remain intact. Only
        // the candidate region connected to the authored cell boundary is a
        // safe background matte.
        const isMattePixel = Boolean(connected[index]);
        if (isMattePixel) {
            const removal = exactBackground[index] ? 1 : removals[index];
            rgba[offset + 3] = Math.round(rgba[offset + 3] * (1 - removal));
            if (greenScreen && rgba[offset + 3] > 0 && rgba[offset + 3] < 250) {
                rgba[offset + 1] = Math.min(
                    rgba[offset + 1],
                    Math.max(rgba[offset], rgba[offset + 2]) + 8,
                );
            }
        }
        if (rgba[offset + 3] <= 8) {
            rgba[offset] = 255;
            rgba[offset + 1] = 255;
            rgba[offset + 2] = 255;
            rgba[offset + 3] = 0;
        }
    }
    return encodeSpriteCellWithSafeGutter(rgba, region.width, region.height);
}

function encodeSpriteCellWithSafeGutter(
    rgba: Buffer,
    width: number,
    height: number,
): Promise<Buffer> {
    // A pose may intentionally touch its authored cell boundary (the supplied
    // spin-kick sheet does so in three cells). Add equal transparent room after
    // extraction instead of deleting the edge component or rescaling cells
    // independently. The sequence renderer will use one union crop later.
    const gutter = Math.max(8, Math.round(Math.min(width, height) * 0.05));
    return sharp(rgba, { raw: { width, height, channels: 4 } })
        .extend({
            top: gutter,
            bottom: gutter,
            left: gutter,
            right: gutter,
            background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
}

export async function extractAnimationContainerFrames(source: Buffer): Promise<Buffer[]> {
    const metadata = await sharp(source, {
        animated: true,
        limitInputPixels: MAX_EMOTICON_CONTAINER_PIXELS,
    }).metadata();
    const frameCount = metadata.pages || 1;
    const frameHeight = metadata.pageHeight || metadata.height || 0;
    const width = metadata.width || 0;
    const totalPixels = width * frameHeight * frameCount;
    if (
        frameCount < 2
        || frameCount > MAX_EMOTICON_CONTAINER_FRAMES
        || !width
        || !frameHeight
        || width > 4096
        || frameHeight > 4096
        || totalPixels > MAX_EMOTICON_CONTAINER_PIXELS
    ) {
        throw new Error('Animation container dimensions or frame count are outside the supported range.');
    }
    const frames: Buffer[] = [];
    for (let index = 0; index < frameCount; index += 1) {
        frames.push(await sharp(source, {
            page: index,
            pages: 1,
            limitInputPixels: MAX_EMOTICON_CONTAINER_PIXELS,
        }).png().toBuffer());
    }
    return frames;
}
