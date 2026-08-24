import { NextRequest, NextResponse } from 'next/server';
import {
    GenerateVideoRequestSchema,
    deriveVideoInfraHint,
    generateOpenRouterVideo,
    validateVideoPayload,
} from '@/lib/server/video-generation';
import { requireAdminAuth } from '@/lib/server/admin-auth';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAdminAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const body = await req.json();
        const parsed = GenerateVideoRequestSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid request payload', issues: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const validationError = validateVideoPayload(payload);
        if (validationError) {
            return NextResponse.json(
                {
                    success: false,
                    reasonCode: 'invalid_request',
                    error: validationError,
                },
                { status: 400 },
            );
        }

        const result = await generateOpenRouterVideo(payload);
        return NextResponse.json(result);
    } catch (error) {
        console.error('[API] generate-video failed:', error);

        const rawMessage = error instanceof Error ? error.message : 'Failed to generate video';
        const hint = deriveVideoInfraHint(rawMessage);

        return NextResponse.json(
            {
                success: false,
                reasonCode: hint.reasonCode,
                error: hint.message,
                details: rawMessage,
            },
            { status: 500 },
        );
    }
}
