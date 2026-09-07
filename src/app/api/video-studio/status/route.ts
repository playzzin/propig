import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { inspectVideoStudioWorkerStatus } from '@/lib/server/video-studio-worker-status';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdminAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const [runtimeConfig, deployedWorker] = await Promise.all([
            getAIRuntimeConfig(),
            inspectVideoStudioWorkerStatus({
                authorization: req.headers.get('authorization'),
                requestOrigin: req.nextUrl.origin,
            }),
        ]);

        return NextResponse.json({
            success: true,
            status: {
                provider: 'openrouter',
                devMode: process.env.NEXT_PUBLIC_VIDEO_STUDIO_DEV_MODE === 'true',
                openRouterApiKeyConfigured:
                    deployedWorker.openRouterApiKeyConfigured
                    ?? Boolean(runtimeConfig.openRouterApiKey),
                configSource: runtimeConfig.source,
                processorSecretConfigured: Boolean(process.env.VIDEO_STUDIO_PROCESSOR_SECRET),
                automaticProcessorConfigured: deployedWorker.automaticProcessorConfigured,
                worker: deployedWorker.worker,
            },
        });
    } catch (error) {
        console.error('[API] video-studio/status failed:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to load video studio status.',
            },
            { status: 500 },
        );
    }
}
