import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mergeVideos, type StudioAspectRatio, type StudioResolution } from '@/lib/server/ffmpeg';
import { requireUserAuth } from '@/lib/server/user-auth';

export const runtime = 'nodejs';

const MergeVideosSchema = z.object({
    clips: z
        .array(
            z.object({
                url: z.string().url(),
                id: z.string().optional(),
                title: z.string().optional(),
            }),
        )
        .min(1)
        .max(12),
    aspectRatio: z
        .enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'])
        .optional()
        .default('16:9'),
    resolution: z.enum(['480p', '720p']).optional().default('720p'),
    fps: z.number().int().min(12).max(60).optional().default(30),
});

export async function POST(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const body = await req.json();
        const parsed = MergeVideosSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid request payload',
                    issues: parsed.error.issues,
                },
                { status: 400 },
            );
        }

        const data = parsed.data;
        const buffer = await mergeVideos({
            clips: data.clips,
            aspectRatio: data.aspectRatio as StudioAspectRatio,
            resolution: data.resolution as StudioResolution,
            fps: data.fps,
        });

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': String(buffer.length),
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[API] merge-videos failed:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to merge videos',
            },
            { status: 500 },
        );
    }
}
