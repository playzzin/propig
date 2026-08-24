import { createHash } from 'node:crypto';

export const EMOTICON_IDENTITY_FINGERPRINT_VERSION = 'normalized-reference-set-v2' as const;

function sha256(parts: string[]): string {
    const hash = createHash('sha256');
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
export function buildEmoticonReferenceSetFingerprint(
    normalizedReferenceFingerprints: string[],
): string {
    return sha256([
        EMOTICON_IDENTITY_FINGERPRINT_VERSION,
        ...[...normalizedReferenceFingerprints].sort(),
    ]);
}

export function buildEmoticonIdentityFingerprint(params: {
    normalizedSourceFingerprint: string;
    referenceSetFingerprint: string;
}): string {
    return sha256([
        EMOTICON_IDENTITY_FINGERPRINT_VERSION,
        params.normalizedSourceFingerprint,
        params.referenceSetFingerprint,
    ]);
}
