"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE = exports.EMOTICON_PREMIUM_MOTION_FLOORS = exports.EMOTICON_PREMIUM_MOTION_TARGET = exports.EMOTICON_MOTION_ACCEPTANCE = exports.EMOTICON_POSE_ACCEPTANCE = void 0;
exports.getEmoticonActionTemplate = getEmoticonActionTemplate;
exports.requiresEmoticonLimbMotion = requiresEmoticonLimbMotion;
exports.requiresEmoticonExpressionMotion = requiresEmoticonExpressionMotion;
exports.getEmoticonMotionAcceptanceRequirements = getEmoticonMotionAcceptanceRequirements;
exports.meetsEmoticonPoseAcceptance = meetsEmoticonPoseAcceptance;
exports.meetsEmoticonDynamicKeyPoseAcceptance = meetsEmoticonDynamicKeyPoseAcceptance;
exports.meetsEmoticonMotionAcceptance = meetsEmoticonMotionAcceptance;
exports.scoreEmoticonMotionQuality = scoreEmoticonMotionQuality;
exports.getEmoticonPremiumMotionDeficits = getEmoticonPremiumMotionDeficits;
exports.meetsEmoticonPremiumMotionTarget = meetsEmoticonPremiumMotionTarget;
exports.EMOTICON_POSE_ACCEPTANCE = {
    identity: 76,
    referenceOverrideIdentity: 80,
    referenceOverrideStyleConsistency: 80,
    overall: 72,
    // A technically clean redraw is still a failed emoticon when it does not
    // visibly communicate the action and emotion the user actually requested.
    actionClarity: 72,
    styleConsistency: 80,
    backgroundClean: 88,
    occlusionFree: 85,
};
exports.EMOTICON_MOTION_ACCEPTANCE = {
    identity: 75,
    overall: 72,
    actionClarity: 68,
    styleConsistency: 72,
    frameConsistency: 72,
    loopContinuity: 65,
    backgroundClean: 88,
    occlusionFree: 85,
    limbOrExpressionChange: 68,
    referenceOverrideIdentity: 80,
    referenceOverrideStyleConsistency: 80,
};
exports.EMOTICON_PREMIUM_MOTION_TARGET = 95;
exports.EMOTICON_PREMIUM_MOTION_FLOORS = {
    overall: 90,
    identity: 90,
    actionClarity: 90,
    styleConsistency: 90,
    limbPoseChange: 82,
    facialExpressionChange: 82,
    frameConsistency: 90,
    loopContinuity: 88,
    backgroundClean: 96,
    occlusionFree: 94,
};
// A dynamic key pose is an internal animation anchor, not the delivered
// result. Permit a moderate reviewer score here when isolation and anatomy are
// sound; the completed frame sequence still has to pass the stricter motion
// identity/style thresholds below before any file can be exported.
exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE = {
    identity: 68,
    overall: 60,
    actionClarity: 65,
    styleConsistency: 68,
    backgroundClean: 88,
    occlusionFree: 85,
    referenceOverrideIdentity: 70,
    referenceOverrideStyleConsistency: 70,
};
const ACTION_TEMPLATES = [
    {
        id: 'running',
        frameGuidance: 'Use a true eight-step running cycle: anticipation, left-foot contact, left push-off, flight, right-foot contact, right push-off, flight, then a non-duplicate loop-return pose. Alternate opposite arm swings, leg extension, torso lean, and determined or excited facial changes.',
    },
    {
        id: 'walking',
        frameGuidance: 'Use a clear walking cycle: heel contact, weight transfer, passing pose, toe-off, opposite heel contact, and return. Alternate left/right leg contact and opposite arm swings while keeping the body center stable.',
    },
    {
        id: 'dancing',
        frameGuidance: 'Use distinct rhythmic beats: preparation, first weight shift, arm accent, opposite weight shift, torso follow-through, and loop return. Change hands, elbows, hips, knees, head tilt, and expression on each beat.',
    },
    {
        id: 'jumping',
        frameGuidance: 'Use a full jump arc: crouch, takeoff, rising, apex, descending, landing, recovery, and loop return. Change knee bend, foot contact, arm lift, torso compression, hair or clothing secondary motion, and expression.',
    },
    {
        id: 'waving',
        frameGuidance: 'Use an expressive greeting cycle: raise arm, bend elbow, open hand, rotate wrist through at least two angles, lower slightly, then return. Keep the other arm and torso as supporting motion and vary eyes, eyebrows, and mouth.',
    },
    {
        id: 'speaking',
        frameGuidance: 'Use readable speaking beats: closed mouth, small open vowel, wide vowel, rounded mouth, consonant closure, and return. Synchronize eyebrows, cheeks, head nod, hands, and torso emphasis without changing identity.',
    },
    {
        id: 'expression',
        frameGuidance: 'Use a readable facial-expression arc: neutral preparation, onset, peak expression, hold with subtle variation, release, and loop return. Change eyes, eyelids, eyebrows, cheeks, mouth, and supporting head/hand pose rather than only moving the canvas.',
    },
];
const ACTION_MATCHERS = [
    { id: 'running', pattern: /달리|뛰|전력질주|run(?:ning)?|sprint/iu },
    { id: 'walking', pattern: /걷|걸어|산책|walk(?:ing)?/iu },
    { id: 'dancing', pattern: /춤|댄스|dance|groov/iu },
    { id: 'jumping', pattern: /점프|튀어|도약|jump(?:ing)?|hop/iu },
    { id: 'waving', pattern: /손\s*흔|팔\s*흔|인사|wave|greet/iu },
    { id: 'speaking', pattern: /말하|수다|대화|외치|speak|talk|shout/iu },
    { id: 'expression', pattern: /웃|미소|울|눈물|화나|놀라|깜짝|윙크|찡그|하품|smile|laugh|cry|angry|surpris|wink|blink|yawn/iu },
];
const GENERAL_TEMPLATE = {
    id: 'general',
    frameGuidance: 'Use a clear motion arc with preparation, distinct action peak, opposite or follow-through pose, recovery, and a non-duplicate loop-return pose. Every useful frame must change the character pose or expression, not the camera.',
};
function getEmoticonActionTemplate(plan) {
    const actionText = [
        plan.directorSummary,
        plan.action.title,
        plan.action.action,
        plan.action.emotion,
        plan.action.videoPrompt,
    ].join(' ');
    const match = ACTION_MATCHERS.find(({ pattern }) => pattern.test(actionText));
    return ACTION_TEMPLATES.find((template) => template.id === (match === null || match === void 0 ? void 0 : match.id)) || GENERAL_TEMPLATE;
}
const LIMB_DRIVEN_ACTIONS = new Set([
    'running',
    'walking',
    'dancing',
    'jumping',
    'waving',
]);
const EXPRESSION_DRIVEN_ACTIONS = new Set([
    'speaking',
    'expression',
]);
function requiresEmoticonLimbMotion(plan) {
    return LIMB_DRIVEN_ACTIONS.has(getEmoticonActionTemplate(plan).id);
}
function requiresEmoticonExpressionMotion(plan) {
    return EXPRESSION_DRIVEN_ACTIONS.has(getEmoticonActionTemplate(plan).id);
}
function getEmoticonMotionAcceptanceRequirements(plan) {
    const requireLimbMotion = requiresEmoticonLimbMotion(plan);
    return {
        requireLimbMotion,
        // Body actions still need readable facial beats; otherwise a running
        // cycle can ship with one frozen expression across every frame.
        requireExpressionMotion: requireLimbMotion || requiresEmoticonExpressionMotion(plan),
    };
}
function meetsEmoticonPoseAcceptance(quality) {
    return quality.identity >= exports.EMOTICON_POSE_ACCEPTANCE.identity
        && quality.overall >= exports.EMOTICON_POSE_ACCEPTANCE.overall
        && quality.actionClarity >= exports.EMOTICON_POSE_ACCEPTANCE.actionClarity
        && quality.styleConsistency >= exports.EMOTICON_POSE_ACCEPTANCE.styleConsistency
        && quality.backgroundClean >= exports.EMOTICON_POSE_ACCEPTANCE.backgroundClean
        && quality.singleCharacter
        && quality.occlusionFree >= exports.EMOTICON_POSE_ACCEPTANCE.occlusionFree
        && (quality.allReferencesConsistent
            || (quality.identity >= exports.EMOTICON_POSE_ACCEPTANCE.referenceOverrideIdentity
                && quality.styleConsistency >= exports.EMOTICON_POSE_ACCEPTANCE.referenceOverrideStyleConsistency));
}
function meetsEmoticonDynamicKeyPoseAcceptance(quality) {
    return quality.identity >= exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE.identity
        && quality.overall >= exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE.overall
        && quality.actionClarity >= exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE.actionClarity
        && quality.styleConsistency >= exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE.styleConsistency
        && quality.backgroundClean >= exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE.backgroundClean
        && quality.singleCharacter
        && quality.occlusionFree >= exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE.occlusionFree
        && (quality.allReferencesConsistent
            || (quality.identity >= exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE.referenceOverrideIdentity
                && quality.styleConsistency
                    >= exports.EMOTICON_DYNAMIC_KEY_POSE_ACCEPTANCE.referenceOverrideStyleConsistency));
}
function meetsEmoticonMotionAcceptance(review, requirements = {}) {
    const limbMotionAccepted = review.limbPoseChange
        >= exports.EMOTICON_MOTION_ACCEPTANCE.limbOrExpressionChange;
    const expressionMotionAccepted = review.facialExpressionChange
        >= exports.EMOTICON_MOTION_ACCEPTANCE.limbOrExpressionChange;
    const requestedMotionAccepted = requirements.requireLimbMotion
        ? limbMotionAccepted && (!requirements.requireExpressionMotion || expressionMotionAccepted)
        : requirements.requireExpressionMotion
            ? expressionMotionAccepted
            : limbMotionAccepted || expressionMotionAccepted;
    return !review.cameraOnly
        && review.identity >= exports.EMOTICON_MOTION_ACCEPTANCE.identity
        && review.overall >= exports.EMOTICON_MOTION_ACCEPTANCE.overall
        && review.actionClarity >= exports.EMOTICON_MOTION_ACCEPTANCE.actionClarity
        && review.styleConsistency >= exports.EMOTICON_MOTION_ACCEPTANCE.styleConsistency
        && review.frameConsistency >= exports.EMOTICON_MOTION_ACCEPTANCE.frameConsistency
        && review.loopContinuity >= exports.EMOTICON_MOTION_ACCEPTANCE.loopContinuity
        && review.backgroundClean >= exports.EMOTICON_MOTION_ACCEPTANCE.backgroundClean
        && review.singleCharacter
        && review.occlusionFree >= exports.EMOTICON_MOTION_ACCEPTANCE.occlusionFree
        && requestedMotionAccepted
        && (review.allReferencesConsistent
            || (review.identity >= exports.EMOTICON_MOTION_ACCEPTANCE.referenceOverrideIdentity
                && review.styleConsistency >= exports.EMOTICON_MOTION_ACCEPTANCE.referenceOverrideStyleConsistency));
}
function boundedScore(value) {
    return Math.max(0, Math.min(100, value));
}
/**
 * A deterministic 100-point score for the delivered animation. The model's
 * overall opinion is intentionally only one input: identity, actual body and
 * facial changes, temporal stability, loop quality, and clean alpha all have
 * explicit weight. Hard structural failures cap the score so a visually
 * invalid result can never look premium because of generous numeric ratings.
 */
function scoreEmoticonMotionQuality(review) {
    const weighted = boundedScore(review.overall) * 0.07
        + boundedScore(review.identity) * 0.17
        + boundedScore(review.actionClarity) * 0.15
        + boundedScore(review.styleConsistency) * 0.11
        + boundedScore(review.limbPoseChange) * 0.11
        + boundedScore(review.facialExpressionChange) * 0.08
        + boundedScore(review.frameConsistency) * 0.1
        + boundedScore(review.loopContinuity) * 0.07
        + boundedScore(review.backgroundClean) * 0.06
        + boundedScore(review.occlusionFree) * 0.04
        + (review.singleCharacter ? 2 : 0)
        + (review.allReferencesConsistent ? 1 : 0)
        + (!review.cameraOnly ? 1 : 0);
    const structuralCap = !review.singleCharacter
        ? 49
        : review.cameraOnly
            ? 59
            : review.backgroundClean < exports.EMOTICON_MOTION_ACCEPTANCE.backgroundClean
                || review.occlusionFree < exports.EMOTICON_MOTION_ACCEPTANCE.occlusionFree
                ? 79
                : 100;
    return Math.round(Math.min(weighted, structuralCap) * 10) / 10;
}
function getEmoticonPremiumMotionDeficits(review) {
    const floors = exports.EMOTICON_PREMIUM_MOTION_FLOORS;
    const deficits = [];
    if (review.overall < floors.overall)
        deficits.push('overall polish');
    if (review.identity < floors.identity)
        deficits.push('exact character identity');
    if (review.actionClarity < floors.actionClarity)
        deficits.push('requested action clarity');
    if (review.styleConsistency < floors.styleConsistency)
        deficits.push('line and render style consistency');
    if (review.limbPoseChange < floors.limbPoseChange)
        deficits.push('distinct alternating limb poses');
    if (review.facialExpressionChange < floors.facialExpressionChange)
        deficits.push('frame-to-frame eye, eyebrow, and mouth changes');
    if (review.frameConsistency < floors.frameConsistency)
        deficits.push('anatomy, scale, and outfit stability');
    if (review.loopContinuity < floors.loopContinuity)
        deficits.push('final-to-first loop continuity');
    if (review.backgroundClean < floors.backgroundClean)
        deficits.push('perfectly clean transparent background');
    if (review.occlusionFree < floors.occlusionFree)
        deficits.push('clear unoccluded silhouette');
    if (!review.singleCharacter)
        deficits.push('exactly one complete character');
    if (review.cameraOnly)
        deficits.push('real character motion instead of camera movement');
    if (!review.allReferencesConsistent
        && (review.identity < 95 || review.styleConsistency < 95))
        deficits.push('consistency with every identity reference');
    if (scoreEmoticonMotionQuality(review) < exports.EMOTICON_PREMIUM_MOTION_TARGET) {
        deficits.push('balanced 95-point composite quality');
    }
    return [...new Set(deficits)];
}
function meetsEmoticonPremiumMotionTarget(review) {
    return meetsEmoticonMotionAcceptance(review)
        && getEmoticonPremiumMotionDeficits(review).length === 0;
}
//# sourceMappingURL=qualityStandards.js.map