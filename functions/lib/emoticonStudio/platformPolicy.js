"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEmoticonGenerationPolicy = resolveEmoticonGenerationPolicy;
const firestore_1 = require("../firestore");
const schema_1 = require("./schema");
const POLICY_COLLECTION = 'emoticonStudioPlatformPolicies';
const MANAGED_PLATFORMS = new Set([
    'kakao',
    'line',
    'custom',
]);
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function positiveInteger(value) {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}
function storedPolicyOutputProfile(value, requested) {
    if (!isRecord(value) || value.enabled !== true || value.schemaVersion !== 1)
        return null;
    if (value.platform !== requested.platform || value.type !== requested.type)
        return null;
    if (value.id !== `${requested.platform}-${requested.type}`)
        return null;
    if (!Number.isInteger(value.revision) || Number(value.revision) < 0)
        return null;
    if (!isRecord(value.profile))
        return null;
    const profile = value.profile;
    if (profile.platform !== requested.platform || profile.type !== requested.type)
        return null;
    if (profile.transparentBackground !== true || profile.submissionCandidate !== false)
        return null;
    if (!Array.isArray(profile.allowedFormats))
        return null;
    if (typeof profile.preferredFormat !== 'string' || !profile.allowedFormats.includes(profile.preferredFormat)) {
        return null;
    }
    const limits = isRecord(profile.platformLimits) ? profile.platformLimits : {};
    const maxFileSize = isRecord(limits.maxFileSizeBytes)
        ? positiveInteger(limits.maxFileSizeBytes.value)
        : undefined;
    const maxDuration = isRecord(limits.maxDurationMs)
        ? positiveInteger(limits.maxDurationMs.value)
        : undefined;
    const candidate = schema_1.emoticonOutputProfileSchema.safeParse(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ platform: profile.platform, type: profile.type, width: profile.width, height: profile.height, profileVersion: profile.profileVersion, verification: profile.verification, transparentBackground: profile.transparentBackground, allowedFormats: profile.allowedFormats, minFrameCount: profile.minFrameCount, maxFrameCount: profile.maxFrameCount }, (maxFileSize !== undefined ? { maxFileSizeBytes: maxFileSize } : {})), (maxDuration !== undefined ? { maxDurationMs: maxDuration } : {})), (Number.isInteger(profile.defaultLoopCount)
        ? { loopCount: profile.defaultLoopCount }
        : {})), (typeof profile.sourceUrl === 'string' ? { sourceUrl: profile.sourceUrl } : {})), (typeof profile.checkedAt === 'string' ? { checkedAt: profile.checkedAt } : {})), { submissionCandidate: false }));
    if (!candidate.success)
        return null;
    return {
        outputProfile: candidate.data,
        preferredFormat: profile.preferredFormat,
        revision: Number(value.revision),
    };
}
/**
 * Resolves an enabled administrator policy immediately before a Functions job
 * starts. The profile already stored on the job is the shipped-code fallback,
 * so every read or validation failure can safely return it unchanged.
 */
async function resolveEmoticonGenerationPolicy(params) {
    const fallback = {
        outputProfile: params.outputProfile,
        formats: Array.from(new Set(params.formats)),
        source: 'fallback',
    };
    const requested = params.outputProfile;
    if (!requested || !MANAGED_PLATFORMS.has(requested.platform))
        return fallback;
    const policyId = `${requested.platform}-${requested.type}`;
    try {
        const snapshot = await firestore_1.db.collection(POLICY_COLLECTION).doc(policyId).get();
        if (!snapshot.exists)
            return fallback;
        const resolved = storedPolicyOutputProfile(snapshot.data(), requested);
        if (!resolved)
            return fallback;
        const allowed = new Set(resolved.outputProfile.allowedFormats || []);
        const formats = fallback.formats.filter((format) => allowed.has(format));
        return {
            outputProfile: resolved.outputProfile,
            formats: formats.length ? formats : [resolved.preferredFormat],
            source: 'firestore',
            policyId,
            revision: resolved.revision,
        };
    }
    catch (_a) {
        return fallback;
    }
}
//# sourceMappingURL=platformPolicy.js.map