"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveReusableDynamicParentEligibility = resolveReusableDynamicParentEligibility;
function resolveReusableDynamicParentEligibility(evidence) {
    if (!evidence.completed)
        return { success: false, reason: 'not-completed' };
    if (!evidence.dynamic)
        return { success: false, reason: 'not-dynamic' };
    if (!evidence.framesValid)
        return { success: false, reason: 'frames-missing' };
    if (!evidence.framePlanValid)
        return { success: false, reason: 'frame-plan-missing' };
    if (!evidence.motionReviewPresent)
        return { success: false, reason: 'motion-review-missing' };
    if (!evidence.motionReviewAccepted)
        return { success: false, reason: 'motion-review-rejected' };
    if (!evidence.specReportPassed)
        return { success: false, reason: 'spec-report-rejected' };
    if (!evidence.outputInspectionsPresent) {
        return { success: false, reason: 'output-inspection-missing' };
    }
    if (!evidence.outputInspectionsPassed) {
        return { success: false, reason: 'output-inspection-rejected' };
    }
    return { success: true };
}
//# sourceMappingURL=dynamicParentPolicy.js.map