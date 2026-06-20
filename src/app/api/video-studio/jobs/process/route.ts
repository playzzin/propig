import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserAuth } from '@/lib/server/user-auth';
import { VideoStudioServerError, getVideoStudioJob } from '@/lib/server/video-studio-admin';
import { executeQueuedVideoStudioJob } from '@/lib/server/video-studio-job-executor';

export const runtime = 'nodejs';

const ProcessVideoStudioJobSchema = z.object({
    jobId: z.string().min(1),
});

function hasInternalProcessorAccess(req: NextRequest): boolean {
    const configuredSecret = process.env.VIDEO_STUDIO_PROCESSOR_SECRET;
    const providedSecret = req.headers.get('x-video-studio-processor-secret');

    return Boolean(configuredSecret && providedSecret && configuredSecret === providedSecret);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const parsed = ProcessVideoStudioJobSchema.safeParse(body);
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

        let userId: string;
        if (hasInternalProcessorAccess(req)) {
            const job = await getVideoStudioJob(parsed.data.jobId);
            userId = job.userId;
        } else {
            const auth = await requireUserAuth(req);
            if (!auth.ok) {
                return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
            }
            userId = auth.uid;
        }

        const result = await executeQueuedVideoStudioJob({
            jobId: parsed.data.jobId,
            userId,
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('[API] video-studio/jobs/process failed:', error);

        if (error instanceof VideoStudioServerError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to process video studio job.',
            },
            { status: 500 },
        );
    }
}
