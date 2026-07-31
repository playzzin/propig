import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserAuth } from '@/lib/server/user-auth';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { preflightOpenRouterVideo } from '@/lib/server/video-generation';
import { STORYBOARD_VIDEO_AUDIO_MODES } from '@/lib/storyboard-video-audio';

export const runtime = 'nodejs';

const EstimateQuerySchema = z.object({
    duration: z.coerce.number().int().min(1).max(15),
    resolution: z.enum(['480p', '720p', '1080p']),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']),
    qualityMode: z.enum(['proof', 'final']).default('proof'),
    hasReferenceImage: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasEndReferenceImage: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasVisualReferenceImages: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    audioMode: z.enum(STORYBOARD_VIDEO_AUDIO_MODES).default('silent'),
});

export async function GET(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const parsed = EstimateQuerySchema.safeParse(
            Object.fromEntries(req.nextUrl.searchParams.entries()),
        );
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: '영상 예상 비용 조건을 확인해 주세요.' },
                { status: 400 },
            );
        }

        const runtimeConfig = await getAIRuntimeConfig();
        if (!runtimeConfig.openRouterApiKey) {
            return NextResponse.json(
                { success: false, error: 'OPENROUTER_API_KEY가 설정되지 않았습니다.' },
                { status: 503 },
            );
        }

        const estimate = await preflightOpenRouterVideo({
            apiKey: runtimeConfig.openRouterApiKey,
            ...parsed.data,
        });
        return NextResponse.json({ success: true, estimate });
    } catch (error) {
        console.error('[API] video-studio/estimate failed:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : '영상 예상 비용을 계산하지 못했습니다.',
            },
            { status: 500 },
        );
    }
}
