import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import {
    createOpenRouterVideoExecutionPlan,
    preflightOpenRouterVideo,
} from '@/lib/server/video-generation';
import { getOwnedProject, VideoStudioServerError } from '@/lib/server/video-studio-admin';
import type { VideoStudioJobRequest } from '@/lib/video-studio-job-request';
import { applyVideoStudioRepeatCost } from '@/lib/video-studio-repeat-cost';

const PROVIDER_RENDER_OPERATIONS = new Set<VideoStudioJobRequest['operation']>([
    'generate',
    'extend',
    'continue',
    'edit',
]);

const toStoredPreflight = (preflight: Awaited<ReturnType<typeof preflightOpenRouterVideo>>) => ({
    ...preflight,
    credit: {
        ...preflight.credit,
        remainingUsd: null,
        totalCreditsUsd: null,
        totalUsageUsd: null,
    },
});

export async function preflightVideoStudioJob(params: { userId: string; request: VideoStudioJobRequest }) {
    const project = await getOwnedProject(params.userId, params.request.projectId);
    if (!PROVIDER_RENDER_OPERATIONS.has(params.request.operation)) {
        return {
            project,
            metadata: {
                request: params.request,
            },
        };
    }

    const runtime = await getAIRuntimeConfig();
    if (!runtime.openRouterApiKey) {
        throw new VideoStudioServerError(503, 'OPENROUTER_API_KEY가 설정되지 않았습니다.');
    }

    const audioMode = params.request.audioMode || (params.request.generateAudio ? 'ambient' : 'silent');
    const usesVisualInputs = params.request.visualInputMode !== 'text-only';
    const needsContinuationFrame = (params.request.repeatCount || 1) > 1;
    const singleSegmentPreflight = await preflightOpenRouterVideo({
        apiKey: runtime.openRouterApiKey,
        duration: params.request.duration ?? 6,
        resolution: project.resolution,
        aspectRatio: project.aspectRatio,
        qualityMode: params.request.qualityMode || 'proof',
        hasReferenceImage:
            usesVisualInputs &&
            Boolean(
                params.request.referenceImage ||
                    params.request.sourceClipId ||
                    needsContinuationFrame,
            ),
        hasEndReferenceImage: usesVisualInputs && Boolean(params.request.endReferenceImage),
        hasVisualReferenceImages:
            usesVisualInputs && Boolean(params.request.visualReferenceImages?.length),
        audioMode,
    });
    const preflight = applyVideoStudioRepeatCost(
        singleSegmentPreflight,
        params.request.repeatCount ?? 1,
    );
    if (!preflight.canSubmit) {
        throw new VideoStudioServerError(
            402,
            'OpenRouter 잔액이 반복 생성을 포함한 전체 예상 비용보다 부족합니다. https://openrouter.ai/settings/credits 에서 충전한 뒤 다시 시도해 주세요.',
        );
    }
    if (preflight.estimatedCostUsd === null) {
        throw new VideoStudioServerError(
            409,
            '선택된 OpenRouter 모델의 현재 비용을 확인할 수 없습니다. 모델 정보를 새로 확인한 뒤 다시 시도해 주세요.',
        );
    }
    const authorizedCostUsd = params.request.authorizedCostUsd;
    if (
        authorizedCostUsd !== undefined &&
        preflight.estimatedTotalCostUsd !== null &&
        preflight.estimatedTotalCostUsd > authorizedCostUsd + 0.000001
    ) {
        throw new VideoStudioServerError(
            409,
            '현재 예상 비용이 사용자가 승인한 한도를 넘었습니다. 최신 비용을 다시 확인하고 승인해 주세요.',
        );
    }

    return {
        project,
        metadata: {
            request: params.request,
            preflight: toStoredPreflight(preflight),
            costEstimate: {
                repeatCount: preflight.repeatCount,
                estimatedCostUsdPerSegment: preflight.estimatedCostUsdPerSegment,
                estimatedTotalCostUsd: preflight.estimatedTotalCostUsd,
            },
            costAuthorization: authorizedCostUsd === undefined
                ? null
                : {
                    authorizedCostUsd,
                    confirmedAt: new Date().toISOString(),
                },
            executionPlan: createOpenRouterVideoExecutionPlan(
                preflight,
                params.request.qualityMode || 'proof',
            ),
        },
    };
}
