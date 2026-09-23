import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { inspectFfmpegRuntime } from '@/lib/server/ffmpeg-runtime';
import { preflightOpenRouterVideo, type OpenRouterVideoPreflight } from '@/lib/server/video-generation';
import { probeFirebaseAdminRuntime } from '@/lib/firebase-admin';
import { STORYBOARD_VIDEO_AUDIO_MODES } from '@/lib/storyboard-video-audio';

export const runtime = 'nodejs';

const ReadinessQuerySchema = z.object({
    duration: z.coerce.number().int().min(1).max(15).default(6),
    resolution: z.enum(['480p', '720p', '1080p']).default('720p'),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']).default('16:9'),
    qualityMode: z.enum(['proof', 'final']).default('proof'),
    hasReferenceImage: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasEndReferenceImage: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    hasVisualReferenceImages: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    audioMode: z.enum(STORYBOARD_VIDEO_AUDIO_MODES).default('silent'),
});

const redactCreditBalance = (preflight: OpenRouterVideoPreflight): OpenRouterVideoPreflight => ({
    ...preflight,
    credit: {
        ...preflight.credit,
        remainingUsd: null,
        totalCreditsUsd: null,
        totalUsageUsd: null,
        message: 'OpenRouter 잔액은 관리자에게만 표시됩니다.',
    },
});

const publicProbe = (ok: boolean, successMessage: string, failureMessage: string) => ({
    ok,
    message: ok ? successMessage : failureMessage,
});

export async function GET(req: NextRequest) {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) {
        return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
    }

    const parsed = ReadinessQuerySchema.safeParse(
        Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
        return NextResponse.json(
            {
                success: false,
                error: '영상 제작 사전 점검 조건이 올바르지 않습니다.',
                issues: parsed.error.issues,
            },
            { status: 400 },
        );
    }

    const [firebase, ffmpeg, runtimeConfig] = await Promise.all([
        probeFirebaseAdminRuntime(),
        inspectFfmpegRuntime(),
        getAIRuntimeConfig(),
    ]);
    const openRouter = runtimeConfig.openRouterApiKey
        ? await preflightOpenRouterVideo({
            apiKey: runtimeConfig.openRouterApiKey,
            ...parsed.data,
        }).then(
            (preflight) => ({
                ok: true as const,
                preflight: auth.isAdmin ? preflight : redactCreditBalance(preflight),
                message: '호환되는 영상 모델을 확인했습니다.',
            }),
            () => ({
                ok: false as const,
                preflight: null,
                message: 'OpenRouter 영상 모델 점검에 실패했습니다.',
            }),
        )
        : {
            ok: false as const,
            preflight: null,
            message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.',
        };
    const ready = firebase.firestore.ok && firebase.storage.ok && ffmpeg.ok && openRouter.ok;

    return NextResponse.json({
        success: true,
        readiness: {
            ready,
            checkedAt: new Date().toISOString(),
            firebase: {
                status: {
                    initialized: firebase.status.initialized,
                    canPersistToFirestore: firebase.status.canPersistToFirestore,
                    canSignStorageUrls: firebase.status.canSignStorageUrls,
                    credentialMode: firebase.status.credentialMode === 'unavailable' ? 'unavailable' : 'configured',
                    message: firebase.status.canPersistToFirestore ? null : 'Firebase Admin runtime is unavailable.',
                },
                firestore: publicProbe(
                    firebase.firestore.ok,
                    'Firestore Admin read access is available.',
                    'Firestore Admin read access failed.',
                ),
                storage: publicProbe(
                    firebase.storage.ok,
                    'Firebase Storage Admin access is available.',
                    'Firebase Storage Admin access failed.',
                ),
                storageSigning: publicProbe(
                    firebase.storageSigning.ok,
                    'Firebase Storage URL signing is available.',
                    'Firebase Storage URL signing is unavailable.',
                ),
                storageDelivery: {
                    ok: firebase.storageDelivery.ok,
                    mode: firebase.storageDelivery.mode,
                    message: firebase.storageDelivery.ok
                        ? 'Storyboard media delivery is available.'
                        : 'Storyboard media delivery is unavailable.',
                },
            },
            ffmpeg: {
                ok: ffmpeg.ok,
                version: ffmpeg.version,
                message: ffmpeg.message,
            },
            openRouter,
        },
    });
}
