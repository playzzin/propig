import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/server/admin-auth';
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
        const hasInternalAccess = hasInternalProcessorAccess(req);
        const adminAuth = hasInternalAccess ? null : await requireAdminAuth(req);
        if (adminAuth && !adminAuth.ok) {
            return NextResponse.json(
                { success: false, error: adminAuth.message },
                { status: adminAuth.status },
            );
        }

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
        if (hasInternalAccess) {
            const job = await getVideoStudioJob(parsed.data.jobId);
            userId = job.userId;
        } else {
            // The non-internal branch is reached only after successful admin auth.
            userId = adminAuth!.uid;
            const job = await getVideoStudioJob(parsed.data.jobId);
            if (job.userId !== userId) {
                throw new VideoStudioServerError(403, 'You do not have access to this job.');
            }
            return NextResponse.json({
                success: true,
                jobId: job.id,
                status: job.status,
                clipId: job.clipId || null,
                videoUrl: job.resultVideoUrl || null,
                lastFrameUrl: job.resultFrameUrl || null,
                resultVideoUrl: job.resultVideoUrl || null,
                resultFrameUrl: job.resultFrameUrl || null,
                pending:
                    job.status === 'queued'
                    || job.status === 'running'
                    || job.status === 'uploading',
                dispatch: 'firebase-functions',
            });
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
