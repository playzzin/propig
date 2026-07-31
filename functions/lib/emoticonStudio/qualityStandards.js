"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOTICON_MOTION_ACCEPTANCE = exports.EMOTICON_POSE_ACCEPTANCE = void 0;
exports.getEmoticonActionTemplate = getEmoticonActionTemplate;
exports.meetsEmoticonPoseAcceptance = meetsEmoticonPoseAcceptance;
exports.meetsEmoticonMotionAcceptance = meetsEmoticonMotionAcceptance;
exports.EMOTICON_POSE_ACCEPTANCE = {
    identity: 76,
    overall: 72,
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
function meetsEmoticonPoseAcceptance(quality) {
    return quality.identity >= exports.EMOTICON_POSE_ACCEPTANCE.identity
        && quality.overall >= exports.EMOTICON_POSE_ACCEPTANCE.overall
        && quality.backgroundClean >= exports.EMOTICON_POSE_ACCEPTANCE.backgroundClean
        && quality.singleCharacter
        && quality.occlusionFree >= exports.EMOTICON_POSE_ACCEPTANCE.occlusionFree;
}
function meetsEmoticonMotionAcceptance(review) {
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
        && (review.limbPoseChange >= exports.EMOTICON_MOTION_ACCEPTANCE.limbOrExpressionChange
            || review.facialExpressionChange >= exports.EMOTICON_MOTION_ACCEPTANCE.limbOrExpressionChange);
}
//# sourceMappingURL=qualityStandards.js.map