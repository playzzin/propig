export type VerifiedDynamicParentFailure =
    | 'not-completed'
    | 'not-dynamic'
    | 'frames-missing'
    | 'frame-plan-missing'
    | 'motion-review-missing'
    | 'motion-review-rejected'
    | 'spec-report-rejected'
    | 'output-inspection-missing'
    | 'output-inspection-rejected';

export type DynamicParentEvidence = {
    completed: boolean;
    dynamic: boolean;
    framesValid: boolean;
    framePlanValid: boolean;
    motionReviewPresent: boolean;
    motionReviewAccepted: boolean;
    specReportPassed: boolean;
    outputInspectionsPresent: boolean;
    outputInspectionsPassed: boolean;
};

export function resolveReusableDynamicParentEligibility(
    evidence: DynamicParentEvidence,
): { success: true } | { success: false; reason: VerifiedDynamicParentFailure } {
    if (!evidence.completed) return { success: false, reason: 'not-completed' };
    if (!evidence.dynamic) return { success: false, reason: 'not-dynamic' };
    if (!evidence.framesValid) return { success: false, reason: 'frames-missing' };
    if (!evidence.framePlanValid) return { success: false, reason: 'frame-plan-missing' };
    if (!evidence.motionReviewPresent) return { success: false, reason: 'motion-review-missing' };
    if (!evidence.motionReviewAccepted) return { success: false, reason: 'motion-review-rejected' };
    if (!evidence.specReportPassed) return { success: false, reason: 'spec-report-rejected' };
    if (!evidence.outputInspectionsPresent) {
        return { success: false, reason: 'output-inspection-missing' };
    }
    if (!evidence.outputInspectionsPassed) {
        return { success: false, reason: 'output-inspection-rejected' };
    }
    return { success: true };
}
