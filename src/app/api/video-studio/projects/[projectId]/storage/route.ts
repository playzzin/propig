import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserAuth } from '@/lib/server/user-auth';
import {
    deleteOwnedVideoStudioStorageResiduals,
    getOwnedVideoStudioStorageOverview,
    VideoStudioServerError,
} from '@/lib/server/video-studio-admin';

export const runtime = 'nodejs';

const CleanupRequestSchema = z.object({
    storagePaths: z.array(z.string().trim().min(1).max(1024)).min(1).max(250),
});

async function resolveProjectId(context: { params: Promise<{ projectId: string }> }): Promise<string> {
    const { projectId } = await context.params;
    const parsed = z.string().trim().min(1).max(240).safeParse(projectId);
    if (!parsed.success) {
        throw new VideoStudioServerError(400, 'Invalid video project.');
    }
    return parsed.data;
}

function errorResponse(error: unknown, fallback: string) {
    if (error instanceof VideoStudioServerError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('[API] video-studio project storage failed:', error);
    return NextResponse.json(
        {
            success: false,
            error: error instanceof Error ? error.message : fallback,
        },
        { status: 500 },
    );
}

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ projectId: string }> },
) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const projectId = await resolveProjectId(context);
        const overview = await getOwnedVideoStudioStorageOverview({
            userId: auth.uid,
            projectId,
        });
        return NextResponse.json({ success: true, overview }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        return errorResponse(error, 'Failed to inspect generated video files.');
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ projectId: string }> },
) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const body = await req.json().catch(() => null);
        const parsed = CleanupRequestSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Choose one or more files to clean up.' },
                { status: 400 },
            );
        }

        const projectId = await resolveProjectId(context);
        const result = await deleteOwnedVideoStudioStorageResiduals({
            userId: auth.uid,
            projectId,
            storagePaths: parsed.data.storagePaths,
        });
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        return errorResponse(error, 'Failed to clean up generated video files.');
    }
}
