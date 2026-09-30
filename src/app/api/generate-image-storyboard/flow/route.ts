import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { LLMMessage } from '@/agents/llm/LLMAdapter';
import {
    ImageStoryboardFlowRedesignRequestSchema,
    ImageStoryboardFlowRedesignSchema,
} from '@/schemas/imageStoryboard';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { parseStoryboardJsonObject } from '@/lib/server/storyboard-json';
import { runManagedTextChat, runManagedVisionChat, type ManagedVisionMessage } from '@/lib/server/managed-text-provider';
import { enforceUserRateLimit } from '@/lib/server/rate-limit';
import { requireUserAuth } from '@/lib/server/user-auth';

type FlowInput = z.infer<typeof ImageStoryboardFlowRedesignRequestSchema>;

function sceneContext(scene: FlowInput['scenes'][number] | undefined) {
    if (!scene) return null;
    return {
        title: scene.title,
        duration: scene.duration,
        narrativeBeat: scene.narrativeBeat,
        shotSize: scene.shotSize,
        cameraDirection: scene.cameraDirection,
        dialogueOrCaption: scene.dialogueOrCaption,
        visualPrompt: scene.visualPrompt,
        continuityAnchor: scene.continuityAnchor,
        transition: scene.transition,
    };
}

function buildMessages(input: FlowInput, qualityIssue?: string): ManagedVisionMessage[] {
    const instruction = input.instruction || 'Rebuild the progression with clearer emotional escalation, purposeful dialogue placement, and natural scene-to-scene visual continuity.';
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
        fixedPreviousScene: sceneContext(input.previousScene),
        scenesToReplan: input.scenes.map(sceneContext),
        fixedNextScene: sceneContext(input.nextScene),
        redesignInstruction: instruction,
        referenceRoles: input.referenceImages?.map((reference, index) => ({ index: index + 1, role: reference.role })) ?? [],
        qualityIssue,
    });
    const systemPrompt = [
        'You are a Korean commercial storyboard director revising a consecutive sequence of scenes for an AI video production.',
        `Replan exactly ${input.scenes.length} supplied scenes in the same order. Do not add, remove, merge, or rename the overall story premise.`,
        'The preceding and following scenes, when provided, are fixed anchors. Make the revised sequence flow naturally between them.',
        'Preserve the continuity bible. Progress the story deliberately: every scene must introduce a clear new beat, and dialogue must serve the visual moment rather than repeat narration.',
        `Compose for ${input.aspectRatio} and the ${input.stylePreset} style preset.`,
        input.referenceImages?.length
            ? 'Treat attached reference images as visual source-of-truth. Preserve labelled subjects, product geometry, architecture, materials, and palette. Do not invent logos or readable text.'
            : 'Use the supplied continuity bible as the source of truth for recurring identity, setting, and lighting.',
        'Each scene must be one feasible focused frame or shot, not a collage. Vary composition and camera direction purposefully while keeping transitions practical.',
        'dialogueOrCaption must contain only the exact words a visible character will speak. Do not include speaker labels, action descriptions, quotation marks, narration, subtitles, or camera directions. Use an empty string when nobody speaks and keep spoken lines brief enough for the stated duration.',
        'Write user-facing fields in Korean. imagePrompt and negativePrompt must be English.',
        'imagePrompt must be a detailed single image-generation prompt with subject, action, foreground/midground/background, composition or lens, lighting, material cues, and finish.',
        'negativePrompt must be compact English comma-separated exclusions.',
        'Return exactly one valid JSON object without markdown or commentary using this shape:',
        '{"scenes":[{"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}]}',
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

function parseFlow(content: string) {
    try {
        const raw = parseStoryboardJsonObject(content);
        const parsed = ImageStoryboardFlowRedesignSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function getFlowQualityIssue(
    flow: z.infer<typeof ImageStoryboardFlowRedesignSchema> | null,
    expectedSceneCount: number,
): string | null {
    if (!flow || flow.scenes.length !== expectedSceneCount) {
        return 'The response must return exactly the requested number of scenes using the requested JSON shape.';
    }

    const titles = flow.scenes.map((scene) => scene.title.replace(/\s+/g, '').toLocaleLowerCase('ko-KR'));
    if (new Set(titles).size !== titles.length) return 'Scene titles must be distinct so the progression is easy to review.';

    const prompts = flow.scenes.map((scene) => scene.imagePrompt.replace(/\s+/g, '').toLocaleLowerCase());
    if (new Set(prompts).size !== prompts.length) return 'Each scene requires a distinct image prompt and visual moment.';

    const sparseScene = flow.scenes.find((scene) => scene.imagePrompt.trim().split(/\s+/).length < 18);
    if (sparseScene) return `${sparseScene.title} needs a more concrete imagePrompt with composition, light, material, and environment details.`;

    const incompleteScene = flow.scenes.find((scene) => !scene.continuityAnchor.trim() || !scene.transition.trim());
    if (incompleteScene) return `${incompleteScene.title} must specify a concrete continuity anchor and transition.`;

    return null;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireUserAuth(request);
        if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });

        const parsedInput = ImageStoryboardFlowRedesignRequestSchema.safeParse(await request.json());
        if (!parsedInput.success) {
            return NextResponse.json({ success: false, error: '흐름 재기획 입력값을 확인해 주세요. 한 번에 최대 12개 장면까지 재기획할 수 있습니다.' }, { status: 400 });
        }

        const runtimeConfig = await getAIRuntimeConfig();
        if (!runtimeConfig.openRouterApiKey) {
            return NextResponse.json({ success: false, error: 'OpenRouter 연결 설정을 확인해 주세요.' }, { status: 503 });
        }

        const rateLimit = await enforceUserRateLimit({
            namespace: 'image-storyboard-flow-redesign',
            uid: auth.uid,
            maxRequests: 8,
            windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.` },
                { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
            );
        }

        const input = parsedInput.data;
        const options = {
            temperature: 0.36,
            maxTokens: Math.min(6800, 1350 + input.scenes.length * 560),
            responseFormat: 'json_object' as const,
        };
        const requestFlow = (qualityIssue?: string) => {
            const messages = buildMessages(input, qualityIssue);
            return input.referenceImages?.length
                ? runManagedVisionChat(messages, options)
                : runManagedTextChat(messages as LLMMessage[], options);
        };

        let result = await requestFlow();
        let redesignedFlow = parseFlow(result.response.content);
        let qualityIssue = getFlowQualityIssue(redesignedFlow, input.scenes.length);

        if (qualityIssue) {
            result = await requestFlow(qualityIssue);
            redesignedFlow = parseFlow(result.response.content);
            qualityIssue = getFlowQualityIssue(redesignedFlow, input.scenes.length);
        }

        if (!redesignedFlow || qualityIssue) {
            return NextResponse.json(
                { success: false, error: 'AI 응답 형식이 장면 흐름 재설계 기준과 맞지 않았습니다. 잠시 후 다시 시도해 주세요.' },
                { status: 422 },
            );
        }

        return NextResponse.json({
            success: true,
            flow: redesignedFlow,
            provider: result.provider,
            model: result.model,
            referenceAnalysis: input.referenceImages?.length ? 'visual' : 'brief-only',
        });
    } catch (error) {
        console.error('[ImageStoryboardFlowRedesign] generation failed:', error);
        return NextResponse.json(
            { success: false, error: 'AI 흐름 재기획을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
            { status: 500 },
        );
    }
}
