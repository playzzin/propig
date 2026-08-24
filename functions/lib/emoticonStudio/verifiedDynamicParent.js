"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyReusableDynamicParent = verifyReusableDynamicParent;
const schema_1 = require("./schema");
const qualityStandards_1 = require("./qualityStandards");
const dynamicParentPolicy_1 = require("./dynamicParentPolicy");
/**
 * The same fail-closed gate is used before both dynamic frame repair and
 * no-cost dynamic rerender. It prevents a completed legacy or rejected job
 * from being laundered into a newly inspected output without first proving
 * that the reused AI frames themselves passed identity, motion, and output
 * inspection.
 */
function verifyReusableDynamicParent(params) {
    const { parent } = params;
    const plan = schema_1.emoticonPlanSchema.safeParse(parent.plan);
    const animationFrames = schema_1.emoticonAnimationFrameSchema.array()
        .length(plan.success ? plan.data.action.frameCount : 0)
        .safeParse(parent.animationFrames);
    const frameSequence = schema_1.emoticonFrameSequenceSchema.safeParse(parent.frameSequencePlan);
    const motionReview = schema_1.emoticonMotionReviewSchema.safeParse(parent.motionReview);
    const spec = parent.specReport && typeof parent.specReport === 'object'
        ? parent.specReport
        : {};
    const formats = schema_1.emoticonExportFormatSchema.array().min(1).max(6).safeParse(parent.formats);
    const outputs = parent.outputs && typeof parent.outputs === 'object'
        ? parent.outputs
        : {};
    let outputInspectionsPresent = formats.success;
    let outputInspectionsPassed = formats.success;
    if (formats.success) {
        for (const format of formats.data) {
            const output = outputs[format];
            const inspection = output && typeof output === 'object'
                ? schema_1.emoticonOutputInspectionSchema.safeParse(output.inspection)
                : null;
            if (!(inspection === null || inspection === void 0 ? void 0 : inspection.success) || inspection.data.format !== format) {
                outputInspectionsPresent = false;
                outputInspectionsPassed = false;
                break;
            }
            if (!inspection.data.passed) {
                outputInspectionsPassed = false;
                break;
            }
        }
    }
    const framesValid = Boolean(animationFrames.success
        && animationFrames.data.every((frame) => (frame.storagePath.startsWith(params.expectedFrameStoragePrefix))));
    const framePlanValid = Boolean(plan.success
        && frameSequence.success
        && frameSequence.data.frames.length === plan.data.action.frameCount
        && frameSequence.data.frames.every((frame, index) => frame.frameIndex === index));
    const eligibility = (0, dynamicParentPolicy_1.resolveReusableDynamicParentEligibility)({
        completed: parent.status === 'completed',
        dynamic: Boolean(plan.success && plan.data.action.renderMode === 'dynamic'),
        framesValid,
        framePlanValid,
        motionReviewPresent: motionReview.success,
        motionReviewAccepted: Boolean(motionReview.success
            && plan.success
            && (0, qualityStandards_1.meetsEmoticonMotionAcceptance)(motionReview.data, (0, qualityStandards_1.getEmoticonMotionAcceptanceRequirements)(plan.data))),
        specReportPassed: spec.technicalPass === true && spec.allOutputsPass === true,
        outputInspectionsPresent,
        outputInspectionsPassed,
    });
    if (!eligibility.success)
        return eligibility;
    if (!plan.success || !animationFrames.success || !frameSequence.success || !motionReview.success) {
        throw new Error('Verified dynamic parent evidence invariant failed.');
    }
    return {
        success: true,
        plan: plan.data,
        animationFrames: animationFrames.data,
        frameSequence: frameSequence.data,
        motionReview: motionReview.data,
    };
}
//# sourceMappingURL=verifiedDynamicParent.js.map