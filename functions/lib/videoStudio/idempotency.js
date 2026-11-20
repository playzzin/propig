"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoStudioIdempotencyError = void 0;
exports.parseVideoStudioIdempotencyContract = parseVideoStudioIdempotencyContract;
const node_crypto_1 = require("node:crypto");
const IDEMPOTENCY_KEY_MAX_LENGTH = 512;
const IDEMPOTENCY_NAMESPACE = 'video-studio:v1';
class VideoStudioIdempotencyError extends Error {
    constructor(message) {
        super(message);
        this.status = 400;
        this.name = 'VideoStudioIdempotencyError';
    }
}
exports.VideoStudioIdempotencyError = VideoStudioIdempotencyError;
function sha256(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value, 'utf8').digest('hex');
}
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (!value || typeof value !== 'object')
        return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]));
}
function parseVideoStudioIdempotencyContract(params) {
    var _a;
    const key = ((_a = params.rawKey) === null || _a === void 0 ? void 0 : _a.trim()) || '';
    if (!key)
        return null;
    if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(key)) {
        throw new VideoStudioIdempotencyError('The video idempotency key is invalid or too long.');
    }
    const keyHash = sha256(key);
    return {
        version: 1,
        jobId: `idem_${sha256(`${IDEMPOTENCY_NAMESPACE}\n${params.userId}\n${key}`)}`,
        keyHash,
        requestFingerprint: sha256(JSON.stringify(canonicalize(params.request))),
    };
}
//# sourceMappingURL=idempotency.js.map