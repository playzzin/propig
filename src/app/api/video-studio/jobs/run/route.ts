import { NextRequest, NextResponse } from 'next/server';
import { requireUserAuth } from '@/lib/server/user-auth';
import { createVideoStudioJob } from '@/lib/server/video-studio-admin';
import { executeQueuedVideoStudioJob } from '@/lib/server/video-studio-job-executor';
import {
    VideoStudioJobRequestSchema,
    defaultVideoStudioJobTitle,
} from '@/lib/video-studio-job-request';

export const runtime = 'nodejs';

// Legacy synchronous wrapper. New clients should queue through /api/video-studio/jobs
// and trigger /api/video-studio/jobs/process separately.
export async function POST(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const body = await req.json();
        const parsed = VideoStudioJobRequestSchema.safeParse(body);
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

        const payload = parsed.data;
        const title = payload.clipTitle?.trim() || defaultVideoStudioJobTitle(payload.operation);
        const jobId = await createVideoStudioJob({
            userId: auth.uid,
            projectId: payload.projectId,
            kind: payload.operation === 'extract-frame' ? 'extract-frame' : payload.operation,
            title,
            prompt: payload.prompt,
            status: 'queued',
            progress: 0,
            message: 'Job accepted and waiting for a processor.',
            sourceClipId: payload.sourceClipId || null,
            mergeSourceClipIds: payload.mergeClipIds || [],
            metadata: {
                request: payload,
            },
        });

        const result = await executeQueuedVideoStudioJob({
            jobId,
            userId: auth.uid,
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('[API] video-studio/jobs/run failed:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to execute video studio job.',
            },
            { status: 500 },
        );
    }
}
