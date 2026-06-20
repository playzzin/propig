import { NextRequest, NextResponse } from 'next/server';
import { requireUserAuth } from '@/lib/server/user-auth';
import {
    VideoStudioServerError,
    deleteOwnedProjectClip,
} from '@/lib/server/video-studio-admin';

export const runtime = 'nodejs';

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ clipId: string }> },
) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const { clipId } = await params;
        const result = await deleteOwnedProjectClip({
            userId: auth.uid,
            clipId,
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('[API] video-studio/clips/[clipId] delete failed:', error);

        if (error instanceof VideoStudioServerError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete the selected clip.',
            },
            { status: 500 },
        );
    }
}
