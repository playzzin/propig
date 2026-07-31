import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { preflightOpenRouterVideo } from '@/lib/server/video-generation';
import { getOwnedProject, VideoStudioServerError } from '@/lib/server/video-studio-admin';
import type { VideoStudioJobRequest } from '@/lib/video-studio-job-request';

const PROVIDER_RENDER_OPERATIONS = new Set<VideoStudioJobRequest['operation']>([
    'generate',
    'extend',
    'continue',
    'edit',
]);

export async function preflightVideoStudioJob(params: {
    userId: string;
    request: VideoStudioJobRequest;
}) {
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
        throw new VideoStudioServerError(
            503,
            'OPENROUTER_API_KEY가 설정되지 않았습니다.',
        );
    }

    const audioMode =
        params.request.audioMode
        || (params.request.generateAudio ? 'ambient' : 'silent');
    const preflight = await preflightOpenRouterVideo({
        apiKey: runtime.openRouterApiKey,
        duration: params.request.duration ?? 6,
        resolution: project.resolution,
        aspectRatio: project.aspectRatio,
        qualityMode: params.request.qualityMode || 'proof',
        hasReferenceImage: Boolean(
            params.request.referenceImage
            || params.request.sourceClipId,
        ),
        hasEndReferenceImage: Boolean(params.request.endReferenceImage),
        hasVisualReferenceImages: Boolean(
            params.request.visualReferenceImages?.length,
        ),
        audioMode,
    });

    return {
        project,
        metadata: {
            request: params.request,
            preflight,
        },
    };
}
