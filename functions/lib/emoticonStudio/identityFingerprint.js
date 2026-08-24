"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOTICON_IDENTITY_FINGERPRINT_VERSION = void 0;
exports.buildEmoticonReferenceSetFingerprint = buildEmoticonReferenceSetFingerprint;
exports.buildEmoticonIdentityFingerprint = buildEmoticonIdentityFingerprint;
const node_crypto_1 = require("node:crypto");
exports.EMOTICON_IDENTITY_FINGERPRINT_VERSION = 'normalized-reference-set-v2';
function sha256(parts) {
    const hash = (0, node_crypto_1.createHash)('sha256');
    for (const part of parts) {
        hash.update(String(part.length));
        hash.update(':');
        hash.update(part);
        hash.update('|');
    }
    return hash.digest('hex');
}
/**
 * Supplemental character references do not have positional meaning. Sorting
 * their normalized-content hashes makes the identity stable when the same
 * outfit/side references are selected in a different UI order, while any
 * added, removed, or changed reference creates a different cache identity.
 * Keep duplicate hashes: two separately supplied references still represent
 * two model inputs and must not reuse a profile analyzed with only one input.
 */
function buildEmoticonReferenceSetFingerprint(normalizedReferenceFingerprints) {
    return sha256([
        exports.EMOTICON_IDENTITY_FINGERPRINT_VERSION,
        ...[...normalizedReferenceFingerprints].sort(),
    ]);
}
function buildEmoticonIdentityFingerprint(params) {
    return sha256([
        exports.EMOTICON_IDENTITY_FINGERPRINT_VERSION,
        params.normalizedSourceFingerprint,
        params.referenceSetFingerprint,
    ]);
}
//# sourceMappingURL=identityFingerprint.js.map