"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyVideoStudioRepeatCost = applyVideoStudioRepeatCost;
function roundUsd(value) {
    return Number(value.toFixed(6));
}
function applyVideoStudioRepeatCost(preflight, repeatCount) {
    const estimatedTotalCostUsd = preflight.estimatedCostUsd === null
        ? null
        : roundUsd(preflight.estimatedCostUsd * repeatCount);
    const totalIsSufficient = estimatedTotalCostUsd === null || preflight.credit.remainingUsd === null
        ? null
        : preflight.credit.remainingUsd >= estimatedTotalCostUsd;
    return Object.assign(Object.assign({}, preflight), { canSubmit: preflight.canSubmit && totalIsSufficient !== false, repeatCount, estimatedCostUsdPerSegment: preflight.estimatedCostUsd, estimatedTotalCostUsd, credit: Object.assign(Object.assign({}, preflight.credit), { requiredUsd: estimatedTotalCostUsd, isSufficient: totalIsSufficient }) });
}
//# sourceMappingURL=repeatCost.js.map