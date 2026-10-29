import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { LLMMessage } from '@/agents/llm/LLMAdapter';
import {
    ImageStoryboardPlanSceneSchema,
    ImageStoryboardSceneRedesignRequestSchema,
} from '@/schemas/imageStoryboard';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { parseStoryboardJsonObject } from '@/lib/server/storyboard-json';
import { runManagedTextChat, runManagedVisionChat, type ManagedVisionMessage } from '@/lib/server/managed-text-provider';
import { enforceUserRateLimit } from '@/lib/server/rate-limit';
import { requireUserAuth } from '@/lib/server/user-auth';

function sceneContext(scene: z.infer<typeof ImageStoryboardSceneRedesignRequestSchema>['scene'] | undefined) {
    if (!scene) return null;
    return {
        title: scene.title,
        duration: scene.duration,
        narrativeBeat: scene.narrativeBeat,
        shotSize: scene.shotSize,
        cameraDirection: scene.cameraDirection,
        visualPrompt: scene.visualPrompt,
        imagePrompt: scene.imagePrompt,
        continuityAnchor: scene.continuityAnchor,
        transition: scene.transition,
    };
}

function buildMessages(
    input: z.infer<typeof ImageStoryboardSceneRedesignRequestSchema>,
    qualityIssue?: string,
): ManagedVisionMessage[] {
    const instruction = input.instruction || 'Improve this scene with a clearer visual hierarchy and a more distinctive, feasible moment.';
    const userPayload = JSON.stringify({
        topic: input.topic,
        frame: input.aspectRatio,
        stylePreset: input.stylePreset,
        format: input.format,
        continuityBible: {
            artDirection: input.artDirection,
            characterContinuity: input.characterContinuity,
            settingContinuity: input.settingContinuity,
            colorAndLighting: input.colorAndLighting,
        },
        previousScene: sceneContext(input.previousScene),
        currentScene: sceneContext(input.scene),
        nextScene: sceneContext(input.nextScene),
        redesignInstruction: instruction,
        referenceRoles: input.referenceImages?.map((reference, index) => ({ index: index + 1, role: reference.role })) ?? [],
        qualityIssue,
    });
    const systemPrompt = [
        'You are a Korean commercial storyboard director revising exactly one production scene.',
        'Preserve the storyboard continuity bible and the before/after relationship with neighbouring scenes, but rebuild the current scene to satisfy the redesign instruction.',
        `Compose for ${input.aspectRatio} and the ${input.stylePreset} style preset.`,
        input.referenceImages?.length
            ? 'Treat attached reference images as visual source-of-truth. Preserve labelled subjects, product geometry, architecture, materials, and palette. Do not merge distinct subjects or invent logos/readable text.'
            : 'Use the supplied continuity bible as the source of truth for recurring identity, setting, and lighting.',
        'Deliver one feasible, focused frame instead of a collage. Keep transitions practical and specify what must remain visually fixed.',
        'Write user-facing fields in Korean. imagePrompt and negativePrompt must be English.',
        'imagePrompt must be a detailed single image-generation prompt with subject, action, foreground/midground/background, composition or lens, lighting, material cues, and finish.',
        'negativePrompt must be compact English comma-separated exclusions.',
        'dialogueOrCaption must contain only the exact spoken words, without speaker labels, action descriptions, quotation marks, narration, subtitles, or camera directions. Use an empty string when nobody speaks.',
        'Return exactly one valid JSON object without markdown or commentary using this shape:',
        '{"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}',
    ].join('\n');
    const references = input.referenceImages ?? [];

    return [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: references.length
                ? [
                    { type: 'text' as const, text: userPayload },
                    ...references.map((reference) => ({
                        type: 'image_url' as const,
                        image_url: { url: reference.image, detail: 'low' as const },
                    })),
                ]
                : userPayload,
        },
    ];
}

function parseScene(content: string) {
    try {
        const raw = parseStoryboardJsonObject(content);
        const parsed = ImageStoryboardPlanSceneSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function sceneQualityIssue(scene: z.infer<typeof ImageStoryboardPlanSceneSchema> | null): string | null {
    if (!scene) return 'The response must include every required scene field using the requested JSON shape.';
    if (scene.imagePrompt.trim().split(/\s+/).length < 18) return 'The imagePrompt is too sparse; add concrete composition, light, material, and environment details.';
    if (!scene.continuityAnchor.trim() || !scene.transition.trim()) return 'State a concrete continuity anchor and transition to neighbouring scenes.';
    return null;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireUserAuth(request);
        if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });

        const parsedInput = ImageStoryboardSceneRedesignRequestSchema.safeParse(await request.json());
        if (!parsedInput.success) {
            return NextResponse.json({ success: false, error: '장면 재설계 입력값을 확인해 주세요.' }, { status: 400 });
        }

        const runtimeConfig = await getAIRuntimeConfig();
        if (!runtimeConfig.openRouterApiKey) {
            return NextResponse.json({ success: false, error: 'OpenRouter 연결 설정을 확인해 주세요.' }, { status: 503 });
        }

        const rateLimit = await enforceUserRateLimit({
            namespace: 'image-storyboard-scene-redesign',
            uid: auth.uid,
            maxRequests: 16,
            windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.` },
                { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
            );
        }

        const input = parsedInput.data;
        const options = { temperature: 0.4, maxTokens: 1800, responseFormat: 'json_object' as const };
        const requestScene = (qualityIssue?: string) => {
            const messages = buildMessages(input, qualityIssue);
            return input.referenceImages?.length
                ? runManagedVisionChat(messages, options)
                : runManagedTextChat(messages as LLMMessage[], options);
        };

        let result = await requestScene();
        let redesignedScene = parseScene(result.response.content);
        let qualityIssue = sceneQualityIssue(redesignedScene);

        if (qualityIssue) {
            result = await requestScene(qualityIssue);
            redesignedScene = parseScene(result.response.content);
            qualityIssue = sceneQualityIssue(redesignedScene);
        }

        if (!redesignedScene || qualityIssue) {
            return NextResponse.json(
                { success: false, error: 'AI가 이 장면의 재설계 기준을 충족하지 못했습니다. 다시 시도해 주세요.' },
                { status: 502 },
            );
        }

        return NextResponse.json({
            success: true,
            scene: redesignedScene,
            provider: result.provider,
            model: result.model,
            referenceAnalysis: input.referenceImages?.length ? 'visual' : 'brief-only',
        });
    } catch (error) {
        console.error('[ImageStoryboardSceneRedesign] generation failed:', error);
        return NextResponse.json(
            { success: false, error: 'AI 장면 재설계를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
            { status: 500 },
        );
    }
}
