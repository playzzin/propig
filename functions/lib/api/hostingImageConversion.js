"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleConvertImage = handleConvertImage;
const sharp_1 = require("sharp");
const hostingCommon_1 = require("./hostingCommon");
const security_1 = require("./security");
const SUPPORTED_FORMATS = ['avif', 'gif', 'jpeg', 'png', 'webp'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const MAX_INPUT_PIXELS = 24 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 16 * 1024 * 1024;
const MAX_ANIMATED_PAGES = 120;
const MAX_OUTPUT_BYTES = 24 * 1024 * 1024;
function parseInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value !== null && value !== void 0 ? value : ''), 10);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function parseFloatValue(value, fallback, min, max) {
    const parsed = Number.parseFloat(String(value !== null && value !== void 0 ? value : ''));
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function parseBoolean(value, fallback) {
    return value == null ? fallback : String(value) === 'true';
}
function clampOutputDimensions(width, height) {
    let nextWidth = Math.max(1, Math.min(Math.round(width), MAX_DIMENSION));
    let nextHeight = Math.max(1, Math.min(Math.round(height), MAX_DIMENSION));
    if (nextWidth * nextHeight > MAX_OUTPUT_PIXELS) {
        const scale = Math.sqrt(MAX_OUTPUT_PIXELS / (nextWidth * nextHeight));
        nextWidth = Math.max(1, Math.floor(nextWidth * scale));
        nextHeight = Math.max(1, Math.floor(nextHeight * scale));
    }
    return { width: nextWidth, height: nextHeight };
}
function cropPosition(focalX, focalY) {
    const horizontal = focalX < 34 ? 'left' : focalX > 66 ? 'right' : 'centre';
    const vertical = focalY < 34 ? 'top' : focalY > 66 ? 'bottom' : 'centre';
    if (horizontal === 'centre' && vertical === 'centre')
        return 'centre';
    if (horizontal === 'centre')
        return vertical;
    if (vertical === 'centre')
        return horizontal;
    return `${horizontal} ${vertical}`;
}
function mimeType(format) {
    return format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
}
async function readFormData(req) {
    const contentType = req.header('content-type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
        throw new hostingCommon_1.ApiError(415, 'multipart/form-data 요청이 필요합니다.');
    }
    if (req.rawBody.length > MAX_FILE_BYTES + 256 * 1024) {
        throw new hostingCommon_1.ApiError(413, '파일 크기는 20MB를 초과할 수 없습니다.');
    }
    const headers = new Headers();
    headers.set('content-type', contentType);
    const webRequest = new globalThis.Request('http://firebase.local/api/convert-image', {
        method: 'POST',
        headers,
        body: req.rawBody,
    });
    return webRequest.formData();
}
async function handleConvertImage(req, res) {
    var _a;
    (0, hostingCommon_1.requireMethod)(req, 'POST');
    const auth = await (0, hostingCommon_1.requireAccess)(req, 'photoManagement');
    const rateLimit = await (0, security_1.enforceUserRateLimit)({
        namespace: 'image-conversion',
        uid: auth.uid,
        maxRequests: 12,
        windowMs: 60000,
    });
    if ('retryAfterSeconds' in rateLimit) {
        res.set('Retry-After', String(rateLimit.retryAfterSeconds));
        throw new hostingCommon_1.ApiError(429, 'Too many image conversion requests. Please try again shortly.');
    }
    const formData = await readFormData(req);
    const file = formData.get('file');
    const format = String(formData.get('format') || '');
    if (!(file instanceof File))
        throw new hostingCommon_1.ApiError(400, '변환할 파일이 없습니다.');
    if (!SUPPORTED_FORMATS.includes(format)) {
        throw new hostingCommon_1.ApiError(400, `지원하지 않는 출력 형식입니다. 지원 형식: ${SUPPORTED_FORMATS.join(', ')}`);
    }
    if (file.size <= 0)
        throw new hostingCommon_1.ApiError(400, '빈 파일은 변환할 수 없습니다.');
    if (file.size > MAX_FILE_BYTES)
        throw new hostingCommon_1.ApiError(413, '파일 크기는 20MB를 초과할 수 없습니다.');
    const outputFormat = format;
    const quality = parseInteger(formData.get('quality'), 82, 1, 100);
    const maxWidth = parseInteger(formData.get('maxWidth'), 0, 0, MAX_DIMENSION);
    const maxHeight = parseInteger(formData.get('maxHeight'), 0, 0, MAX_DIMENSION);
    const stripMeta = parseBoolean(formData.get('stripMeta'), true);
    const flatten = parseBoolean(formData.get('flatten'), outputFormat === 'jpeg');
    const preserveAnimation = parseBoolean(formData.get('preserveAnimation'), true);
    const backgroundCandidate = String(formData.get('background') || '').trim();
    const background = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(backgroundCandidate)
        ? backgroundCandidate
        : '#ffffff';
    const gifColors = parseInteger(formData.get('gifColors'), 256, 2, 256);
    const gifDither = parseFloatValue(formData.get('gifDither'), 1, 0, 1);
    const squareCrop = parseBoolean(formData.get('squareCrop'), false);
    const focalX = parseInteger(formData.get('focalX'), 50, 0, 100);
    const focalY = parseInteger(formData.get('focalY'), 50, 0, 100);
    const animationCapable = file.type === 'image/gif' ||
        file.type === 'image/webp' ||
        file.name.toLowerCase().endsWith('.gif') ||
        file.name.toLowerCase().endsWith('.webp');
    const animated = preserveAnimation && (outputFormat === 'gif' || outputFormat === 'webp') && animationCapable;
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const options = animated
        ? { animated: true, pages: -1, limitInputPixels: MAX_INPUT_PIXELS }
        : { limitInputPixels: MAX_INPUT_PIXELS };
    const metadata = await (0, sharp_1.default)(inputBuffer, options).metadata();
    const inputWidth = metadata.width || 0;
    const inputHeight = metadata.height || 0;
    if (inputWidth * inputHeight > MAX_INPUT_PIXELS)
        throw new hostingCommon_1.ApiError(413, 'The image resolution exceeds the allowed limit.');
    if ((metadata.pages || 1) > MAX_ANIMATED_PAGES)
        throw new hostingCommon_1.ApiError(413, 'The animation frame count exceeds the allowed limit.');
    let pipeline = (0, sharp_1.default)(inputBuffer, options).rotate();
    if (!stripMeta)
        pipeline = pipeline.keepMetadata();
    if (squareCrop) {
        const fallback = inputWidth && inputHeight ? Math.min(inputWidth, inputHeight) : 1024;
        const requested = maxWidth && maxHeight ? Math.min(maxWidth, maxHeight) : maxWidth || maxHeight || fallback;
        const target = clampOutputDimensions(requested, requested).width;
        pipeline = pipeline.resize({
            width: target,
            height: target,
            fit: 'cover',
            position: cropPosition(focalX, focalY),
            withoutEnlargement: true,
        });
    }
    else {
        const dimensions = clampOutputDimensions(maxWidth || Math.min(inputWidth || 1024, MAX_DIMENSION), maxHeight || Math.min(inputHeight || 1024, MAX_DIMENSION));
        pipeline = pipeline.resize(Object.assign(Object.assign({}, dimensions), { fit: 'inside', withoutEnlargement: true }));
    }
    if (flatten || outputFormat === 'jpeg')
        pipeline = pipeline.flatten({ background });
    if (outputFormat === 'avif') {
        pipeline = pipeline.avif({ quality, effort: 6, chromaSubsampling: quality >= 88 ? '4:4:4' : '4:2:0' });
    }
    else if (outputFormat === 'gif') {
        pipeline = pipeline.gif({ colors: gifColors, effort: 8, dither: gifDither, reuse: true });
    }
    else if (outputFormat === 'jpeg') {
        pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true, chromaSubsampling: quality >= 88 ? '4:4:4' : '4:2:0' });
    }
    else if (outputFormat === 'png') {
        pipeline = pipeline.png(quality < 96
            ? { palette: true, quality, effort: 10, compressionLevel: 9, adaptiveFiltering: true }
            : { compressionLevel: 9, adaptiveFiltering: true });
    }
    else {
        pipeline = pipeline.webp({ quality, alphaQuality: Math.max(quality, 80), effort: 6, smartSubsample: true, preset: 'photo' });
    }
    const data = await pipeline.toBuffer();
    if (data.length > MAX_OUTPUT_BYTES)
        throw new hostingCommon_1.ApiError(413, 'The converted image exceeds the allowed output size.');
    const decoded = await (0, sharp_1.default)(data, { animated: animated, pages: animated ? -1 : 1, limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    const decodedPages = decoded.pages || 1;
    const inputPages = metadata.pages || 1;
    if (decoded.format !== outputFormat || (animated && decodedPages !== inputPages) || !decoded.width || !decoded.height) {
        throw new hostingCommon_1.ApiError(422, '완성된 이미지의 디코딩 검증에 실패했습니다.');
    }
    const pageHeight = decoded.pageHeight || Math.floor(decoded.height / decodedPages);
    res.set({
        'Content-Type': mimeType(outputFormat),
        'Content-Length': String(data.length),
        'Cache-Control': 'no-store',
        'X-Image-Width': String(decoded.width),
        'X-Image-Height': String(pageHeight),
        'X-Image-Pages': String(decodedPages),
        'X-Image-Animated': String(decodedPages > 1),
        'X-Image-Loop': String((_a = decoded.loop) !== null && _a !== void 0 ? _a : 0),
        'X-Image-Alpha': String(Boolean(decoded.hasAlpha)),
        'X-Image-Delays': (decoded.delay || []).join(','),
    });
    res.status(200).send(data);
}
//# sourceMappingURL=hostingImageConversion.js.map