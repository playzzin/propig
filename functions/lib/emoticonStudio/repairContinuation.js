"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEmoticonRepairCheckpointAction = resolveEmoticonRepairCheckpointAction;
function resolveEmoticonRepairCheckpointAction(params) {
    if (params.stage === 'repair-generation') {
        if (params.generationCalls !== 0 || params.hasReplacement) {
            throw new Error('The bounded replacement image call cannot be repeated.');
        }
        return 'generate-replacement';
    }
    if (params.generationCalls !== 1 || !params.hasReplacement) {
        throw new Error('A server-owned replacement checkpoint is required before repair review.');
    }
    if (params.stage === 'repair-pose-review') {
        if (params.poseReviewCalls !== 0 || params.hasAcceptedPoseReview) {
            throw new Error('The bounded replacement pose review cannot be repeated.');
        }
        return 'review-replacement-pose';
    }
    if (params.poseReviewCalls !== 1 || !params.hasAcceptedPoseReview) {
        throw new Error('An accepted replacement pose checkpoint is required before sequence review.');
    }
    if (params.stage === 'repair-sequence-review') {
        if (params.sequenceReviewCalls !== 0 || params.hasAcceptedSequenceReview) {
            throw new Error('The bounded repair sequence review cannot be repeated.');
        }
        return 'review-full-sequence';
    }
    if (params.sequenceReviewCalls !== 1 || !params.hasAcceptedSequenceReview) {
        throw new Error('An accepted full-sequence checkpoint is required before repair rendering.');
    }
    return 'render-repaired-sequence';
}
//# sourceMappingURL=repairContinuation.js.map