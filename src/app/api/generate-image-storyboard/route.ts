import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { LLMMessage } from '@/agents/llm/LLMAdapter';
import {
    ImageStoryboardPlanRequestSchema,
    ImageStoryboardPlanSchema,
} from '@/schemas/imageStoryboard';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { runManagedTextChat, runManagedVisionChat, type ManagedVisionMessage } from '@/lib/server/managed-text-provider';
import { enforceUserRateLimit } from '@/lib/server/rate-limit';
import { requireUserAuth } from '@/lib/server/user-auth';

const FORMAT_DIRECTION = {
    'brand-film': '브랜드 필름: 문제·공감·전환·여운이 느껴지는 감정선과 기억에 남는 마지막 장면을 설계하세요.',
    'product-launch': '제품 런칭: 제품의 고유한 형태와 핵심 효용을 초반부터 일관되게 보여 주고, 마지막에 명확한 히어로 샷으로 마무리하세요.',
    'social-short': '숏폼: 첫 장면에서 즉시 시선을 붙잡고, 장면마다 시각적 변화가 분명하며 세로 화면에서도 주제가 잘 읽히게 설계하세요.',
    editorial: '에디토리얼: 정보의 우선순위가 보이는 정제된 비주얼 스토리와 균형 잡힌 구도를 설계하세요.',
} as const;

function extractJsonObjectText(text: string): string {
    const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    const objectStart = cleaned.indexOf('{');
    const objectEnd = cleaned.lastIndexOf('}');

    if (objectStart < 0 || objectEnd <= objectStart) {
        throw new Error('AI response does not contain a complete JSON object.');
    }

    return cleaned.slice(objectStart, objectEnd + 1);
}

function buildSystemPrompt(input: z.infer<typeof ImageStoryboardPlanRequestSchema>): string {
    return [
        'You are an award-winning Korean commercial storyboard director and an expert image-generation prompt designer.',
        'Turn the supplied topic into a production-ready sequence of image-generation scenes, not a generic shot list.',
        `Return exactly ${input.sceneCount} scenes in a purposeful opening-to-closing arc.`,
        `Format direction: ${FORMAT_DIRECTION[input.format]}`,
        `Compose for the ${input.aspectRatio} frame and the ${input.stylePreset} style preset.`,
        'Before writing, silently establish one continuity bible: recurring person/product traits, hero prop, location logic, palette, lighting, and lens language.',
        input.referenceImages?.length
            ? 'The user attached visual references. Inspect every image and treat each labelled role as the source of truth: preserve the depicted identity, product geometry, architecture, materials, palette, and environment. Never invent unreferenced brand marks or merge distinct subjects.'
            : 'No visual references were attached. State practical continuity details that can be carried through all generated scenes.',
        'Every scene must show one clear, feasible visual moment. Do not create collages, conflicting actions, or repeated hero frames.',
        'Vary shot scale and composition intentionally while keeping the same subject identity, product geometry, wardrobe, environment, palette, and time-of-day coherent.',
        'Make narrativeBeat explain what changes emotionally or informationally. Make transition explain how this scene flows from the preceding scene; for scene one, describe its opening hook.',
        'continuityAnchor must state the exact recurring visual details this scene must preserve.',
        'visualPrompt is a concise Korean director-facing visual brief: subject, action, composition, environment, and visual priority.',
        'imagePrompt is a single, detailed English prompt ready for an image model. It must include the focal subject, exact action, foreground/midground/background, composition or lens, lighting, material/detail cues, and intended visual finish. Do not include labels, markdown, or contradictory instructions.',
        'negativePrompt is a compact English comma-separated exclusion list. Exclude artifacts, unwanted people/objects, and readable text unless the topic explicitly needs it.',
        'Keep the plan concise enough for the requested JSON contract: imagePrompt must be 120-900 English characters, visualPrompt under 700 Korean characters, and negativePrompt under 300 English characters.',
        'Write every user-facing value in Korean except imagePrompt and negativePrompt, which must be English.',
        'For dialogueOrCaption, provide only off-image context. Never ask the image model to render Korean text, UI, logos, or subtitles unless the topic explicitly requires it.',
        'Return exactly one valid JSON object with no markdown, code fence, or explanation.',
        'Use this exact shape:',
        '{"title":"string","logline":"string","audience":"string","artDirection":"string","characterContinuity":"string","settingContinuity":"string","colorAndLighting":"string","scenes":[{"title":"string","duration":"string","narrativeBeat":"string","shotSize":"string","cameraDirection":"string","dialogueOrCaption":"string","visualPrompt":"string","imagePrompt":"string","continuityAnchor":"string","transition":"string","negativePrompt":"string"}]}',
    ].join('\n');
}

function buildUserPrompt(input: z.infer<typeof ImageStoryboardPlanRequestSchema>): string {
    return JSON.stringify({
        topic: input.topic,
        sceneCount: input.sceneCount,
        aspectRatio: input.aspectRatio,
        stylePreset: input.stylePreset,
        format: input.format,
        referenceRoles: input.referenceImages?.map((reference, index) => ({
            index: index + 1,
            role: reference.role,
        })) ?? [],
    });
}

function buildPlannerMessages(
    input: z.infer<typeof ImageStoryboardPlanRequestSchema>,
    qualityIssue?: string,
): ManagedVisionMessage[] {
    const userText = qualityIssue
        ? `${buildUserPrompt(input)}\n\nQuality correction required: ${qualityIssue} Rebuild the complete plan from scratch and satisfy every JSON field exactly.`
        : buildUserPrompt(input);
    const references = input.referenceImages ?? [];

    return [
        { role: 'system', content: buildSystemPrompt(input) },
        {
            role: 'user',
            content: references.length
                ? [
                    { type: 'text' as const, text: userText },
                    ...references.map((reference) => ({
                        type: 'image_url' as const,
                        image_url: { url: reference.image, detail: 'low' as const },
                    })),
                ]
                : userText,
        },
    ];
}

function parseStoryboardPlan(content: string) {
    try {
        const raw = JSON.parse(extractJsonObjectText(content)) as unknown;
        const parsed = ImageStoryboardPlanSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function getStoryboardQualityIssue(
    plan: z.infer<typeof ImageStoryboardPlanSchema> | null,
    sceneCount: number,
): string | null {
    if (!plan || plan.scenes.length !== sceneCount) return '요청한 장면 수와 응답 형식이 일치하지 않습니다.';

    const normalizedTitles = plan.scenes.map((scene) => scene.title.replace(/\s+/g, '').toLocaleLowerCase('ko-KR'));
    if (new Set(normalizedTitles).size !== normalizedTitles.length) return '장면 제목이 중복되었습니다.';

    const normalizedPrompts = plan.scenes.map((scene) => scene.imagePrompt.replace(/\s+/g, '').toLocaleLowerCase());
    if (new Set(normalizedPrompts).size !== normalizedPrompts.length) return '생성용 프롬프트가 중복되었습니다.';

    const sparseScene = plan.scenes.find((scene) => scene.imagePrompt.trim().split(/\s+/).length < 18);
    if (sparseScene) return `${sparseScene.title}의 생성용 프롬프트가 충분히 구체적이지 않습니다.`;

    return null;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireUserAuth(request);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
        }

        const parsedInput = ImageStoryboardPlanRequestSchema.safeParse(await request.json());
        if (!parsedInput.success) {
            return NextResponse.json({ success: false, error: '주제와 장면 수를 확인해 주세요.' }, { status: 400 });
        }

        const runtimeConfig = await getAIRuntimeConfig();
        if (!runtimeConfig.openRouterApiKey) {
            return NextResponse.json(
                { success: false, error: 'AI API 키가 설정되어 있지 않습니다. 관리자 설정에서 OpenRouter 연결을 확인해 주세요.' },
                { status: 503 },
            );
        }

        const rateLimit = await enforceUserRateLimit({
            namespace: 'image-storyboard-plan',
            uid: auth.uid,
            maxRequests: 10,
            windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.` },
                { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
            );
        }

        const input = parsedInput.data;
        const planOptions = {
            temperature: 0.38,
            maxTokens: Math.min(6800, 1350 + input.sceneCount * 560),
            responseFormat: 'json_object' as const,
        };
        const requestPlan = (qualityIssue?: string) => {
            const messages = buildPlannerMessages(input, qualityIssue);
            return input.referenceImages?.length
                ? runManagedVisionChat(messages, planOptions)
                : runManagedTextChat(messages as LLMMessage[], planOptions);
        };

        let result = await requestPlan();

        let plannedStoryboard = parseStoryboardPlan(result.response.content);
        let qualityIssue = getStoryboardQualityIssue(plannedStoryboard, input.sceneCount);

        if (qualityIssue) {
            result = await requestPlan(qualityIssue);
            plannedStoryboard = parseStoryboardPlan(result.response.content);
            qualityIssue = getStoryboardQualityIssue(plannedStoryboard, input.sceneCount);
        }

        if (!plannedStoryboard || qualityIssue) {
            return NextResponse.json(
                { success: false, error: 'AI 응답 형식이 장면 설계 기준과 맞지 않았습니다. 잠시 후 다시 시도하거나 장면 수를 줄여 주세요.' },
                { status: 422 },
            );
        }

        return NextResponse.json({
            success: true,
            plan: plannedStoryboard,
            provider: result.provider,
            model: result.model,
            referenceAnalysis: input.referenceImages?.length ? 'visual' : 'brief-only',
        });
    } catch (error) {
        console.error('[ImageStoryboardPlan] generation failed:', error);
        return NextResponse.json(
            { success: false, error: 'AI 장면 설계를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
            { status: 500 },
        );
    }
}
