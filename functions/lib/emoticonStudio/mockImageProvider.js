"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockImageProvider = void 0;
const node_crypto_1 = require("node:crypto");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
const MOCK_MODEL = 'mock/emoticon-studio-v1';
const MOCK_PROVIDER = 'mock';
const MOCK_POSE_SIZE = 512;
const MOCK_SPRITE_CELL_SIZE = 256;
const CHARACTER_COLORS = ['#FF7A59', '#7C5CFC', '#3B82F6', '#F59E0B', '#EC4899'];
function stableRequestIdentity(request) {
    var _a;
    return JSON.stringify(Object.assign({ version: 1, kind: request.kind, preferredModel: request.preferredModel || null, referenceImageUrls: request.referenceImageUrls, prompt: request.prompt, seed: (_a = request.seed) !== null && _a !== void 0 ? _a : null, aspectRatio: request.aspectRatio || null, resourceMode: request.resourceMode || null }, (request.kind === 'sprite-sheet'
        ? { layout: request.layout, directions: request.directions }
        : {})));
}
function digestRequest(request) {
    return (0, node_crypto_1.createHash)('sha256').update(stableRequestIdentity(request)).digest();
}
function round(value) {
    return value.toFixed(2);
}
function pointAt(x, y, length, angleDegrees) {
    const radians = (angleDegrees * Math.PI) / 180;
    return {
        x: x + Math.cos(radians) * length,
        y: y + Math.sin(radians) * length,
    };
}
function characterMarkup(params) {
    const { left, top, size, phase, color } = params;
    const centerX = left + size * 0.5;
    const bodyCenterY = top + size * (0.59 + Math.sin(phase * 2) * 0.012);
    const headCenterY = top + size * 0.31;
    const outline = '#172033';
    const skin = '#FFD1A8';
    const limbOuterWidth = size * 0.075;
    const limbInnerWidth = size * 0.045;
    const stride = Math.sin(phase);
    const counterStride = Math.cos(phase);
    const lean = Math.sin(phase) * 7;
    const leftShoulder = { x: centerX - size * 0.14, y: top + size * 0.50 };
    const rightShoulder = { x: centerX + size * 0.14, y: top + size * 0.50 };
    const leftHip = { x: centerX - size * 0.075, y: top + size * 0.71 };
    const rightHip = { x: centerX + size * 0.075, y: top + size * 0.71 };
    const leftHand = pointAt(leftShoulder.x, leftShoulder.y, size * 0.28, 150 + stride * 72);
    const rightHand = pointAt(rightShoulder.x, rightShoulder.y, size * 0.28, 30 - stride * 72);
    const leftFoot = pointAt(leftHip.x, leftHip.y, size * 0.25, 104 + counterStride * 30);
    const rightFoot = pointAt(rightHip.x, rightHip.y, size * 0.25, 76 - counterStride * 30);
    const eyeScale = 0.72 + ((Math.sin(phase * 2) + 1) * 0.24);
    const mouthBend = Math.sin(phase + Math.PI / 4) * size * 0.022;
    const line = (start, end, inner) => [
        `<line x1="${round(start.x)}" y1="${round(start.y)}" x2="${round(end.x)}" y2="${round(end.y)}" stroke="${outline}" stroke-width="${round(limbOuterWidth)}" stroke-linecap="round"/>`,
        `<line x1="${round(start.x)}" y1="${round(start.y)}" x2="${round(end.x)}" y2="${round(end.y)}" stroke="${inner}" stroke-width="${round(limbInnerWidth)}" stroke-linecap="round"/>`,
    ].join('');
    return [
        `<g transform="rotate(${round(lean)} ${round(centerX)} ${round(bodyCenterY)})">`,
        line(leftHip, leftFoot, color),
        line(rightHip, rightFoot, color),
        line(leftShoulder, leftHand, skin),
        line(rightShoulder, rightHand, skin),
        `<ellipse cx="${round(leftFoot.x)}" cy="${round(leftFoot.y)}" rx="${round(size * 0.052)}" ry="${round(size * 0.032)}" fill="${outline}"/>`,
        `<ellipse cx="${round(rightFoot.x)}" cy="${round(rightFoot.y)}" rx="${round(size * 0.052)}" ry="${round(size * 0.032)}" fill="${outline}"/>`,
        `<circle cx="${round(leftHand.x)}" cy="${round(leftHand.y)}" r="${round(size * 0.038)}" fill="${skin}" stroke="${outline}" stroke-width="${round(size * 0.018)}"/>`,
        `<circle cx="${round(rightHand.x)}" cy="${round(rightHand.y)}" r="${round(size * 0.038)}" fill="${skin}" stroke="${outline}" stroke-width="${round(size * 0.018)}"/>`,
        `<ellipse cx="${round(centerX)}" cy="${round(bodyCenterY)}" rx="${round(size * 0.19)}" ry="${round(size * 0.225)}" fill="${color}" stroke="${outline}" stroke-width="${round(size * 0.028)}"/>`,
        `<circle cx="${round(centerX)}" cy="${round(headCenterY)}" r="${round(size * 0.17)}" fill="${skin}" stroke="${outline}" stroke-width="${round(size * 0.028)}"/>`,
        `<path d="M ${round(centerX - size * 0.155)} ${round(headCenterY - size * 0.035)} Q ${round(centerX)} ${round(headCenterY - size * 0.22)} ${round(centerX + size * 0.155)} ${round(headCenterY - size * 0.035)} Q ${round(centerX + size * 0.08)} ${round(headCenterY - size * 0.105)} ${round(centerX)} ${round(headCenterY - size * 0.075)} Q ${round(centerX - size * 0.08)} ${round(headCenterY - size * 0.105)} ${round(centerX - size * 0.155)} ${round(headCenterY - size * 0.035)} Z" fill="${outline}"/>`,
        `<ellipse cx="${round(centerX - size * 0.057)}" cy="${round(headCenterY + size * 0.005)}" rx="${round(size * 0.017)}" ry="${round(size * 0.027 * eyeScale)}" fill="${outline}"/>`,
        `<ellipse cx="${round(centerX + size * 0.057)}" cy="${round(headCenterY + size * 0.005)}" rx="${round(size * 0.017)}" ry="${round(size * 0.027 * (1.45 - eyeScale / 2))}" fill="${outline}"/>`,
        `<path d="M ${round(centerX - size * 0.052)} ${round(headCenterY + size * 0.08)} Q ${round(centerX)} ${round(headCenterY + size * 0.08 + mouthBend)} ${round(centerX + size * 0.052)} ${round(headCenterY + size * 0.08)}" fill="none" stroke="${outline}" stroke-width="${round(size * 0.018)}" stroke-linecap="round"/>`,
        '</g>',
    ].join('');
}
async function renderPose(request, digest) {
    const phase = ((digest[0] * 256 + digest[1]) / 65536) * Math.PI * 2;
    const color = CHARACTER_COLORS[digest[2] % CHARACTER_COLORS.length];
    const padding = MOCK_POSE_SIZE * 0.07;
    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${MOCK_POSE_SIZE}" height="${MOCK_POSE_SIZE}" viewBox="0 0 ${MOCK_POSE_SIZE} ${MOCK_POSE_SIZE}">`,
        characterMarkup({
            left: padding,
            top: padding,
            size: MOCK_POSE_SIZE - padding * 2,
            phase,
            color,
        }),
        '</svg>',
    ].join('');
    return sharp(Buffer.from(svg))
        .png({ compressionLevel: 9, adaptiveFiltering: false })
        .toBuffer();
}
async function renderSpriteSheet(request, digest) {
    const width = request.layout.columns * MOCK_SPRITE_CELL_SIZE;
    const height = request.layout.rows * MOCK_SPRITE_CELL_SIZE;
    const phaseOffset = (digest[0] / 256) * Math.PI * 2;
    const color = CHARACTER_COLORS[digest[2] % CHARACTER_COLORS.length];
    const padding = MOCK_SPRITE_CELL_SIZE * 0.06;
    const frames = request.directions.map((_, index) => {
        const column = index % request.layout.columns;
        const row = Math.floor(index / request.layout.columns);
        return characterMarkup({
            left: column * MOCK_SPRITE_CELL_SIZE + padding,
            top: row * MOCK_SPRITE_CELL_SIZE + padding,
            size: MOCK_SPRITE_CELL_SIZE - padding * 2,
            phase: phaseOffset + ((Math.PI * 2 * index) / request.layout.frameCount),
            color,
        });
    });
    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect width="${width}" height="${height}" fill="#00FF00"/>`,
        ...frames,
        '</svg>',
    ].join('');
    return sharp(Buffer.from(svg))
        .png({ compressionLevel: 9, adaptiveFiltering: false })
        .toBuffer();
}
/**
 * Deterministic development/test provider. It never reads reference URLs,
 * never calls fetch, and always reports zero cost.
 */
class MockImageProvider {
    constructor() {
        this.id = 'mock';
    }
    async generate(request) {
        const digest = digestRequest(request);
        const buffer = request.kind === 'sprite-sheet'
            ? await renderSpriteSheet(request, digest)
            : await renderPose(request, digest);
        return {
            buffer,
            contentType: 'image/png',
            model: MOCK_MODEL,
            provider: MOCK_PROVIDER,
            requestId: `mock_${digest.toString('hex').slice(0, 32)}`,
            costUsd: 0,
        };
    }
}
exports.MockImageProvider = MockImageProvider;
//# sourceMappingURL=mockImageProvider.js.map