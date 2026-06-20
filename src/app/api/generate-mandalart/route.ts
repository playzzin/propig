import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
    runManagedTextChat,
    type ManagedTextProvider,
} from '@/lib/server/managed-text-provider';
import { requireUserAuth } from '@/lib/server/user-auth';

const SubGoalsOnlySchema = z.object({
    subGoals: z.array(z.string()).length(8),
});

const FullGenerationSchema = z.object({
    subGoals: z.array(z.object({
        title: z.string(),
        tasks: z.array(z.string()).length(8),
    })).length(8),
});

const FALLBACK_SUB_GOALS = [
    '목표 방향 정리',
    '실행 구조 설계',
    '핵심 역량 강화',
    '필요 자원 확보',
    '일정 관리',
    '성과 측정',
    '피드백 반영',
    '확장 계획 수립',
];

const FALLBACK_TASK_SUFFIXES = [
    '핵심 목표 정의하기',
    '주간 계획 세우기',
    '실행 체크리스트 만들기',
    '필요 자료 정리하기',
    '중간 결과 점검하기',
    '개선 포인트 찾기',
    '협업 또는 도움 요청하기',
    '다음 단계 정리하기',
];

type MandalartMeta = {
    status: 'ok' | 'fallback';
    source: ManagedTextProvider | 'fallback';
    model?: string;
    reasonCode?: string;
    message?: string;
};

function cleanModelText(text: string): string {
    return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
}

function extractJsonObjectText(text: string): string {
    const cleaned = cleanModelText(text);
    const objectStart = cleaned.indexOf('{');
    const objectEnd = cleaned.lastIndexOf('}');

    if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
        return cleaned.substring(objectStart, objectEnd + 1);
    }

    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');

    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        return cleaned.substring(arrayStart, arrayEnd + 1);
    }

    throw new Error('Model response does not contain a valid JSON structure.');
}

function normalizeText(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned || fallback;
}

function normalizeStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
}

function padToLength<T>(items: T[], length: number, filler: (index: number) => T): T[] {
    const next = items.slice(0, length);

    while (next.length < length) {
        next.push(filler(next.length));
    }

    return next;
}

function buildFallbackSubGoals(goal: string): string[] {
    const compactGoal = goal.replace(/\s+/g, ' ').trim().slice(0, 14);

    return FALLBACK_SUB_GOALS.map((item, index) => {
        const fallback = compactGoal ? `${compactGoal} ${item}` : item;
        return normalizeText(fallback, `세부 목표 ${index + 1}`);
    });
}

function buildFallbackTasks(goal: string, subGoalTitle: string): string[] {
    const titleBase = normalizeText(subGoalTitle, goal || '목표');
    return FALLBACK_TASK_SUFFIXES.map((suffix) => `${titleBase} - ${suffix}`);
}

function normalizeSubGoalsOnly(raw: unknown, goal: string): z.infer<typeof SubGoalsOnlySchema> {
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const source = Array.isArray(record.subGoals) ? record.subGoals : [];
    const fallbackTitles = buildFallbackSubGoals(goal);

    const parsedTitles = source
        .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && 'title' in item) {
                return String((item as { title?: unknown }).title ?? '');
            }
            return '';
        })
        .map((title, index) => normalizeText(title, fallbackTitles[index] || `세부 목표 ${index + 1}`))
        .filter(Boolean);

    return SubGoalsOnlySchema.parse({
        subGoals: padToLength(parsedTitles, 8, (index) => fallbackTitles[index] || `세부 목표 ${index + 1}`),
    });
}

function normalizeFullGeneration(raw: unknown, goal: string): z.infer<typeof FullGenerationSchema> {
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const source = Array.isArray(record.subGoals) ? record.subGoals : [];
    const fallbackTitles = buildFallbackSubGoals(goal);

    const subGoals = Array.from({ length: 8 }, (_, index) => {
        const rawItem = source[index];
        const defaultTitle = fallbackTitles[index] || `세부 목표 ${index + 1}`;

        let title = defaultTitle;
        let rawTasks: unknown = [];

        if (typeof rawItem === 'string') {
            title = normalizeText(rawItem, defaultTitle);
        } else if (rawItem && typeof rawItem === 'object') {
            const itemRecord = rawItem as Record<string, unknown>;
            title = normalizeText(itemRecord.title, defaultTitle);
            rawTasks = itemRecord.tasks;
        }

        const taskFallbacks = buildFallbackTasks(goal, title);
        const normalizedTasks = normalizeStringList(rawTasks).map((task, taskIndex) =>
            normalizeText(task, taskFallbacks[taskIndex] || `실행 계획 ${taskIndex + 1}`),
        );

        return {
            title,
            tasks: padToLength(normalizedTasks, 8, (taskIndex) =>
                taskFallbacks[taskIndex] || `실행 계획 ${taskIndex + 1}`,
            ),
        };
    });

    return FullGenerationSchema.parse({ subGoals });
}

function buildMeta(meta: MandalartMeta): MandalartMeta {
    return {
        status: meta.status,
        source: meta.source,
        model: meta.model,
        reasonCode: meta.reasonCode,
        message: meta.message,
    };
}

function successResponse(
    data: z.infer<typeof SubGoalsOnlySchema> | z.infer<typeof FullGenerationSchema>,
    source: ManagedTextProvider,
    model: string,
) {
    return NextResponse.json({
        ...data,
        _meta: buildMeta({
            status: 'ok',
            source,
            model,
        }),
    });
}

function fallbackResponse(
    data: z.infer<typeof SubGoalsOnlySchema> | z.infer<typeof FullGenerationSchema>,
    reasonCode: string,
    message: string,
    requireAI: boolean,
) {
    if (requireAI) {
        return NextResponse.json(
            {
                error: message,
                _meta: buildMeta({
                    status: 'fallback',
                    source: 'fallback',
                    reasonCode,
                    message,
                }),
            },
            { status: 503 },
        );
    }

    return NextResponse.json({
        ...data,
        _meta: buildMeta({
            status: 'fallback',
            source: 'fallback',
            reasonCode,
            message,
        }),
    });
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireUserAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.message }, { status: auth.status });
        }

        const { goal, mode = 'full', requireAI } = await req.json();

        if (!goal || typeof goal !== 'string') {
            return NextResponse.json({ error: 'Valid goal string is required.' }, { status: 400 });
        }

        const safeGoal = goal.trim();
        if (!safeGoal) {
            return NextResponse.json({ error: 'Goal must not be empty.' }, { status: 400 });
        }

        const isFull = mode === 'full';
        const fallbackData = isFull
            ? normalizeFullGeneration({}, safeGoal)
            : normalizeSubGoalsOnly({}, safeGoal);

        const systemPrompt = isFull
            ? [
                'You are an expert mandalart planner.',
                `Generate a mandalart plan for the goal "${safeGoal}".`,
                'Return exactly 8 sub-goals.',
                'Each sub-goal must include exactly 8 concrete tasks.',
                'All output text must be written in Korean.',
                'Keep sub-goal titles short and specific.',
                'Keep each task action-oriented and concise.',
                'Return JSON only in this shape:',
                '{"subGoals":[{"title":"string","tasks":["string","string","string","string","string","string","string","string"]}]}',
            ].join('\n')
            : [
                'You are an expert mandalart planner.',
                `Generate 8 practical sub-goals for the goal "${safeGoal}".`,
                'All output text must be written in Korean.',
                'Each sub-goal should be concise, specific, and distinct.',
                'Return JSON only in this shape:',
                '{"subGoals":["string","string","string","string","string","string","string","string"]}',
            ].join('\n');

        console.log(`[API] Generating mandalart (mode=${mode}) for: "${safeGoal}"`);

        try {
            const textResult = await runManagedTextChat(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Main goal: ${safeGoal}` },
                ],
                {
                    temperature: 0.7,
                    maxTokens: isFull ? 3000 : 700,
                },
            );

            const raw = JSON.parse(extractJsonObjectText(textResult.response.content.trim())) as unknown;
            const normalized = isFull
                ? normalizeFullGeneration(raw, safeGoal)
                : normalizeSubGoalsOnly(raw, safeGoal);

            return successResponse(normalized, textResult.provider, textResult.model);
        } catch (error) {
            console.error('[API] Managed mandalart generation failed:', error);
            const message = error instanceof Error ? error.message : String(error);
            return fallbackResponse(fallbackData, 'llm_failed', message, requireAI === true);
        }
    } catch (error) {
        console.error('[API] Unhandled mandalart error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
