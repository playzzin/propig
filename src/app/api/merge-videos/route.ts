import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mergeVideos, type StudioAspectRatio, type StudioResolution } from '@/lib/server/ffmpeg';
import { requireUserAuth } from '@/lib/server/user-auth';

export const runtime = 'nodejs';

const MergeVideosSchema = z.object({
    clips: z
        .array(
            z.preprocess((value) => {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
                const clip = value as Record<string, unknown>;
                return clip.transitionStyle === 'fade'
                    ? { ...clip, transitionStyle: 'crossfade' }
                    : value;
            }, z.object({
                url: z.string().url(),
                id: z.string().optional(),
                title: z.string().optional(),
                trimStartSeconds: z.number().min(0).max(60).optional(),
                trimEndSeconds: z.number().min(0).max(60).optional(),
                playbackRate: z.number().min(0.5).max(2).optional(),
                audioVolume: z.number().min(0).max(2).optional(),
                transitionStyle: z.enum(['cut', 'crossfade', 'match-cut', 'bridge']).optional(),
                transitionSeconds: z.number().min(0).max(2).optional(),
            })),
        )
        .min(1)
        .max(12),
    aspectRatio: z
        .enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'])
        .optional()
        .default('16:9'),
    resolution: z.enum(['480p', '720p', '1080p']).optional().default('720p'),
    fps: z.number().int().min(12).max(60).optional().default(30),
    backgroundMusicUrl: z.string().url().refine((value) => {
        try {
            const hostname = new URL(value).hostname.toLowerCase();
            return value.startsWith('https://')
                && (hostname === 'firebasestorage.googleapis.com' || hostname === 'storage.googleapis.com');
        } catch {
            return false;
        }
    }, 'Background music must come from project storage.').optional(),
    audioMixPreset: z.enum(['dialogue-first', 'balanced', 'music-first', 'custom']).optional(),
    backgroundMusicVolume: z.number().min(0).max(1).optional(),
    sceneAudioVolume: z.number().min(0).max(2).optional(),
    audioCrossfadeSeconds: z.number().min(0).max(2).optional(),
});

export async function POST(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const body = await req.json();
        const parsed = MergeVideosSchema.safeParse(body);

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

        const data = parsed.data;
        const buffer = await mergeVideos({
            clips: data.clips,
            aspectRatio: data.aspectRatio as StudioAspectRatio,
            resolution: data.resolution as StudioResolution,
            fps: data.fps,
            backgroundMusicUrl: data.backgroundMusicUrl,
            audioMixPreset: data.audioMixPreset,
            backgroundMusicVolume: data.backgroundMusicVolume,
            sceneAudioVolume: data.sceneAudioVolume,
            audioCrossfadeSeconds: data.audioCrossfadeSeconds,
        });

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': String(buffer.length),
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[API] merge-videos failed:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to merge videos',
            },
            { status: 500 },
        );
    }
}
