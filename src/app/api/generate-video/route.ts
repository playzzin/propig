import { NextRequest, NextResponse } from 'next/server';
import {
    GenerateVideoRequestSchema,
    deriveVideoInfraHint,
    generateGrokVideo,
    validateVideoPayload,
} from '@/lib/server/video-generation';
import { requireUserAuth } from '@/lib/server/user-auth';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
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

        if (payload.provider !== 'grok') {
            return NextResponse.json(
                {
                    success: false,
                    reasonCode: 'unsupported_provider',
                    error: 'Gemini video generation is not implemented on this server. Switch the provider to Grok for video generation.',
                },
                { status: 501 },
            );
        }

        const result = await generateGrokVideo(payload);
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
