import {
    emoticonAnimationFrameSchema,
    emoticonExportFormatSchema,
    emoticonFrameSequenceSchema,
    emoticonMotionReviewSchema,
    emoticonOutputInspectionSchema,
    emoticonPlanSchema,
    type EmoticonAnimationFrame,
    type EmoticonFrameSequence,
    type EmoticonMotionReview,
    type EmoticonPlan,
} from './schema';
import {
    getEmoticonMotionAcceptanceRequirements,
    meetsEmoticonMotionAcceptance,
} from './qualityStandards';
import {
    resolveReusableDynamicParentEligibility,
    type VerifiedDynamicParentFailure,
} from './dynamicParentPolicy';

export type VerifiedDynamicParentResult = {
    success: true;
    plan: EmoticonPlan;
    animationFrames: EmoticonAnimationFrame[];
    frameSequence: EmoticonFrameSequence;
    motionReview: EmoticonMotionReview;
} | {
    success: false;
    reason: VerifiedDynamicParentFailure;
};

/**
 * The same fail-closed gate is used before both dynamic frame repair and
 * no-cost dynamic rerender. It prevents a completed legacy or rejected job
 * from being laundered into a newly inspected output without first proving
 * that the reused AI frames themselves passed identity, motion, and output
 * inspection.
 */
export function verifyReusableDynamicParent(params: {
    parent: Record<string, unknown>;
    expectedFrameStoragePrefix: string;
}): VerifiedDynamicParentResult {
    const { parent } = params;
    const plan = emoticonPlanSchema.safeParse(parent.plan);
    const animationFrames = emoticonAnimationFrameSchema.array()
        .length(plan.success ? plan.data.action.frameCount : 0)
        .safeParse(parent.animationFrames);
    const frameSequence = emoticonFrameSequenceSchema.safeParse(parent.frameSequencePlan);
    const motionReview = emoticonMotionReviewSchema.safeParse(parent.motionReview);
    const spec = parent.specReport && typeof parent.specReport === 'object'
        ? parent.specReport as Record<string, unknown>
        : {};
    const formats = emoticonExportFormatSchema.array().min(1).max(6).safeParse(parent.formats);
    const outputs = parent.outputs && typeof parent.outputs === 'object'
        ? parent.outputs as Record<string, unknown>
        : {};
    let outputInspectionsPresent = formats.success;
    let outputInspectionsPassed = formats.success;
    if (formats.success) {
        for (const format of formats.data) {
            const output = outputs[format];
            const inspection = output && typeof output === 'object'
                ? emoticonOutputInspectionSchema.safeParse(
                    (output as Record<string, unknown>).inspection,
                )
                : null;
            if (!inspection?.success || inspection.data.format !== format) {
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

    const framesValid = Boolean(
        animationFrames.success
        && animationFrames.data.every((frame) => (
            frame.storagePath.startsWith(params.expectedFrameStoragePrefix)
        )),
    );
    const framePlanValid = Boolean(
        plan.success
        && frameSequence.success
        && frameSequence.data.frames.length === plan.data.action.frameCount
        && frameSequence.data.frames.every((frame, index) => frame.frameIndex === index),
    );
    const eligibility = resolveReusableDynamicParentEligibility({
        completed: parent.status === 'completed',
        dynamic: Boolean(plan.success && plan.data.action.renderMode === 'dynamic'),
        framesValid,
        framePlanValid,
        motionReviewPresent: motionReview.success,
        motionReviewAccepted: Boolean(
            motionReview.success
            && plan.success
            && meetsEmoticonMotionAcceptance(
                motionReview.data,
                getEmoticonMotionAcceptanceRequirements(plan.data),
            ),
        ),
        specReportPassed: spec.technicalPass === true && spec.allOutputsPass === true,
        outputInspectionsPresent,
        outputInspectionsPassed,
    });
    if (!eligibility.success) return eligibility;
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
