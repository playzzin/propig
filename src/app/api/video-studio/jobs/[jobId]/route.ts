import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserAuth } from '@/lib/server/user-auth';
import {
    VideoStudioServerError,
    cancelOwnedVideoStudioJob,
    requeueOwnedVideoStudioJob,
} from '@/lib/server/video-studio-admin';

const UpdateVideoStudioJobSchema = z.object({
    action: z.enum(['requeue', 'cancel']),
});

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ jobId: string }> },
) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const { jobId } = await context.params;
        const body = await req.json();
        const parsed = UpdateVideoStudioJobSchema.safeParse(body);
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

        const updated =
            parsed.data.action === 'requeue'
                ? await requeueOwnedVideoStudioJob({ jobId, userId: auth.uid })
                : await cancelOwnedVideoStudioJob({ jobId, userId: auth.uid });

        return NextResponse.json({
            success: true,
            jobId: updated.id,
            status: updated.status,
        });
    } catch (error) {
        console.error('[API] video-studio/jobs/[jobId] failed:', error);

        if (error instanceof VideoStudioServerError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to update video studio job.',
            },
            { status: 500 },
        );
    }
}
