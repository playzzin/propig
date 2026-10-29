import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import {
    VideoStudioServerError,
    cancelOwnedVideoStudioJob,
    getOwnedVideoStudioJob,
    requeueOwnedVideoStudioJob,
} from '@/lib/server/video-studio-admin';
import {
    inspectVideoStudioWorkerStatus,
    workerCompatibilityErrorMessage,
} from '@/lib/server/video-studio-worker-status';

const UpdateVideoStudioJobSchema = z.object({
    action: z.enum(['requeue', 'cancel']),
    requireProviderResume: z.boolean().optional(),
});

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ jobId: string }> },
) {
    try {
        const auth = await requireAdminAuth(req);
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

        if (parsed.data.action === 'requeue') {
            const existing = await getOwnedVideoStudioJob({ jobId, userId: auth.uid });
            if (
                existing.kind === 'generate'
                || existing.kind === 'extend'
                || existing.kind === 'continue'
                || existing.kind === 'edit'
            ) {
                const deployedWorker = await inspectVideoStudioWorkerStatus({
                    authorization: req.headers.get('authorization'),
                    requestOrigin: req.nextUrl.origin,
                });
                if (!deployedWorker.worker.compatible) {
                    throw new VideoStudioServerError(
                        503,
                        workerCompatibilityErrorMessage(deployedWorker.worker),
                    );
                }
            }
        }

        const updated = parsed.data.action === 'requeue'
            ? await requeueOwnedVideoStudioJob({
                jobId,
                userId: auth.uid,
                requireProviderResume: parsed.data.requireProviderResume === true,
            })
            : await cancelOwnedVideoStudioJob({ jobId, userId: auth.uid });

        const cancellationRequested = parsed.data.action === 'cancel'
            && updated.status !== 'canceled'
            && Boolean(updated.cancelRequestedAt);
        return NextResponse.json({
            success: true,
            jobId: updated.id,
            status: updated.status,
            cancellationRequested,
            message: updated.message || null,
        }, { status: cancellationRequested ? 202 : 200 });
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
