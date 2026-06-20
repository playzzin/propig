import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
    type VideoStudioClipMode,
    type VideoStudioClipStatus,
} from '@/lib/video-studio';
import { requireUserAuth } from '@/lib/server/user-auth';
import {
    VideoStudioServerError,
    createVideoStudioClipRecord,
    getOwnedProject,
} from '@/lib/server/video-studio-admin';

export const runtime = 'nodejs';

const CreateClipSchema = z.object({
    userId: z.string().min(1).optional(),
    projectId: z.string().min(1),
    title: z.string().min(1),
    prompt: z.string().min(1),
    mode: z.enum(['generate', 'extend', 'continue', 'edit', 'merge']),
    status: z.enum(['ready', 'processing', 'failed']).optional().default('ready'),
    videoUrl: z.string().url(),
    posterUrl: z.string().url().nullable().optional(),
    lastFrameUrl: z.string().url().nullable().optional(),
    continuityNotes: z.string().nullable().optional(),
    cameraNotes: z.string().nullable().optional(),
    subjectLock: z.string().nullable().optional(),
    takeGroupId: z.string().nullable().optional(),
    parentTakeClipId: z.string().nullable().optional(),
    takeIndex: z.number().int().min(1).nullable().optional(),
    sourceClipId: z.string().nullable().optional(),
    sourceVideoUrl: z.string().url().nullable().optional(),
    mergeSourceClipIds: z.array(z.string()).optional().default([]),
    duration: z.number().int().min(1).max(15).nullable().optional(),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']),
    resolution: z.enum(['480p', '720p']),
});

function sanitizeClipStatus(status: VideoStudioClipStatus): VideoStudioClipStatus {
    return status === 'processing' || status === 'failed' ? status : 'ready';
}

function sanitizeClipMode(mode: VideoStudioClipMode): VideoStudioClipMode {
    return mode;
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const body = await req.json();
        const parsed = CreateClipSchema.safeParse(body);

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
        await getOwnedProject(auth.uid, payload.projectId);

        const result = await createVideoStudioClipRecord({
            userId: auth.uid,
            projectId: payload.projectId,
            title: payload.title,
            prompt: payload.prompt,
            mode: sanitizeClipMode(payload.mode),
            status: sanitizeClipStatus(payload.status),
            videoUrl: payload.videoUrl,
            posterUrl: payload.posterUrl || payload.lastFrameUrl || null,
            lastFrameUrl: payload.lastFrameUrl || null,
            continuityNotes: payload.continuityNotes || null,
            cameraNotes: payload.cameraNotes || null,
            subjectLock: payload.subjectLock || null,
            takeGroupId: payload.takeGroupId || null,
            parentTakeClipId: payload.parentTakeClipId || null,
            takeIndex: payload.takeIndex ?? null,
            sourceClipId: payload.sourceClipId || null,
            sourceVideoUrl: payload.sourceVideoUrl || null,
            mergeSourceClipIds: payload.mergeSourceClipIds,
            duration: payload.duration ?? null,
            aspectRatio: payload.aspectRatio,
            resolution: payload.resolution,
        });

        return NextResponse.json({
            success: true,
            clipId: result.clipId,
            sequence: result.sequence,
        });
    } catch (error) {
        console.error('[API] video-studio/clips failed:', error);

        if (error instanceof VideoStudioServerError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create clip.',
            },
            { status: 500 },
        );
    }
}
