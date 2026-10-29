export type VideoStudioRepeatCostInput = {
    canSubmit: boolean;
    estimatedCostUsd: number | null;
    credit: {
        remainingUsd: number | null;
        requiredUsd: number | null;
        isSufficient: boolean | null;
    };
};

export type VideoStudioRepeatCostMetadata = {
    repeatCount: number;
    estimatedCostUsdPerSegment: number | null;
    estimatedTotalCostUsd: number | null;
};

function roundUsd(value: number): number {
    return Number(value.toFixed(6));
}
export function applyVideoStudioRepeatCost<T extends VideoStudioRepeatCostInput>(
    preflight: T,
    repeatCount: number,
): T & VideoStudioRepeatCostMetadata {
    const estimatedTotalCostUsd = preflight.estimatedCostUsd === null
        ? null
        : roundUsd(preflight.estimatedCostUsd * repeatCount);
    const totalIsSufficient = estimatedTotalCostUsd === null || preflight.credit.remainingUsd === null
        ? null
        : preflight.credit.remainingUsd >= estimatedTotalCostUsd;

    return {
        ...preflight,
        canSubmit: preflight.canSubmit && totalIsSufficient !== false,
        repeatCount,
        estimatedCostUsdPerSegment: preflight.estimatedCostUsd,
        estimatedTotalCostUsd,
        credit: {
            ...preflight.credit,
            requiredUsd: estimatedTotalCostUsd,
            isSufficient: totalIsSufficient,
        },
    };
}
