import { NextRequest, NextResponse } from 'next/server';
import { requireUserAuth } from '@/lib/server/user-auth';
import { getGeminiRuntimeConfig } from '@/lib/server/gemini';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const runtimeConfig = await getGeminiRuntimeConfig();

        return NextResponse.json({
            success: true,
            status: {
                provider: 'grok',
                devMode: process.env.NEXT_PUBLIC_VIDEO_STUDIO_DEV_MODE === 'true',
                grokApiKeyConfigured: Boolean(runtimeConfig.grokApiKey),
                configSource: runtimeConfig.source,
                processorSecretConfigured: Boolean(process.env.VIDEO_STUDIO_PROCESSOR_SECRET),
            },
        });
    } catch (error) {
        console.error('[API] video-studio/status failed:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to load video studio status.',
            },
            { status: 500 },
        );
    }
}
