import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserAuth } from '@/lib/server/user-auth';
import {
    VideoStudioServerError,
    resequenceOwnedProjectClips,
} from '@/lib/server/video-studio-admin';

export const runtime = 'nodejs';

const ResequenceTimelineSchema = z.object({
    clipIds: z.array(z.string().min(1)).min(1),
});

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ projectId: string }> },
) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const { projectId } = await context.params;
        const body = await req.json();
        const parsed = ResequenceTimelineSchema.safeParse(body);
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

        const result = await resequenceOwnedProjectClips({
            userId: auth.uid,
            projectId,
            orderedClipIds: parsed.data.clipIds,
        });

        return NextResponse.json({
            success: true,
            projectId,
            clipCount: result.clipCount,
        });
    } catch (error) {
        console.error('[API] video-studio/projects/[projectId]/timeline failed:', error);

        if (error instanceof VideoStudioServerError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to reorder the video studio timeline.',
            },
            { status: 500 },
        );
    }
}
