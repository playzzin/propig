import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractVideoFrame } from '@/lib/server/ffmpeg';
import { requireUserAuth } from '@/lib/server/user-auth';

export const runtime = 'nodejs';

const ExtractVideoFrameSchema = z.object({
    videoUrl: z.string().url(),
    position: z.enum(['first', 'last']).optional().default('last'),
    timeSec: z.number().min(0).optional(),
});

export async function POST(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const body = await req.json();
        const parsed = ExtractVideoFrameSchema.safeParse(body);

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

        const buffer = await extractVideoFrame(parsed.data);

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Content-Length': String(buffer.length),
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[API] extract-video-frame failed:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to extract video frame',
            },
            { status: 500 },
        );
    }
}
