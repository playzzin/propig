import { NextRequest, NextResponse } from 'next/server';
import { requireUserAuth } from '@/lib/server/user-auth';
import { createVideoStudioJob, getOwnedProject } from '@/lib/server/video-studio-admin';
import {
    VideoStudioJobRequestSchema,
    defaultVideoStudioJobTitle,
} from '@/lib/video-studio-job-request';

export const runtime = 'nodejs';

// Development mode mock data
function generateMockJobId(): string {
    return `job_dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

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

        // Development mode: use mock data if Firebase Admin is not configured
        const isDevMode = process.env.NEXT_PUBLIC_VIDEO_STUDIO_DEV_MODE === 'true';
        const forceRealRun = req.headers.get('x-video-studio-force-real-run') === 'true';
        
        if (isDevMode && !forceRealRun) {
            console.log('[API] Video Studio in DEV MODE - returning mock job');
            return NextResponse.json({
                success: true,
                jobId: generateMockJobId(),
                status: 'queued',
                message: '(Development Mode) Job queued for processing',
            });
        }

        await getOwnedProject(auth.uid, payload.projectId);

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

        return NextResponse.json({
            success: true,
            jobId,
            status: 'queued',
        });
    } catch (error) {
        console.error('[API] video-studio/jobs submit failed:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to queue video studio job.',
            },
            { status: 500 },
        );
    }
}
