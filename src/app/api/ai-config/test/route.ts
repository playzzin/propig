import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OpenRouterAdapter } from '@/agents/llm/LLMAdapter';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';

const AIConfigTestRequestSchema = z.object({
    includeImageTest: z.boolean().optional(),
    targetIds: z.array(z.string()).optional(),
});

type CheckStatus = 'passed' | 'failed' | 'skipped';
type HealthCheckResult = {
    id: string;
    name: string;
    status: CheckStatus;
    latencyMs: number;
    message: string;
    details?: string;
};

const toErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const immediateCheck = (args: Omit<HealthCheckResult, 'latencyMs'>): HealthCheckResult => ({
    ...args,
    latencyMs: 0,
});

const runModelPing = async (apiKey: string, model: string): Promise<HealthCheckResult> => {
    const startedAt = Date.now();
    try {
        const adapter = new OpenRouterAdapter({
            apiKey,
            model,
            siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
            siteName: 'ProPig',
        });
        const result = await adapter.chat([{ role: 'user', content: 'Reply with OK only.' }], {
            temperature: 0,
            maxTokens: 16,
        });
        if (!result.content.trim()) throw new Error('The selected model returned an empty response.');
        return {
            id: 'openrouter-model-ping',
            name: `OpenRouter 텍스트 모델 (${model})`,
            status: 'passed',
            latencyMs: Date.now() - startedAt,
            message: '텍스트 모델 응답을 확인했습니다.',
            details: result.content.trim().slice(0, 120),
        };
    } catch (error) {
        return {
            id: 'openrouter-model-ping',
            name: `OpenRouter 텍스트 모델 (${model})`,
            status: 'failed',
            latencyMs: Date.now() - startedAt,
            message: '텍스트 모델 호출에 실패했습니다.',
            details: toErrorMessage(error),
        };
    }
};

const runVideoCatalogCheck = async (apiKey: string): Promise<HealthCheckResult> => {
    const startedAt = Date.now();
    try {
        const response = await fetch('https://openrouter.ai/api/v1/videos/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as { data?: Array<{ id?: string }>; error?: { message?: string } } | null;
        if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter HTTP ${response.status}`);
        const models = payload?.data || [];
        if (models.length === 0) throw new Error('OpenRouter returned no video-capable models.');
        return {
            id: 'openrouter-video-catalog',
            name: 'OpenRouter 영상 모델 목록',
            status: 'passed',
            latencyMs: Date.now() - startedAt,
            message: '영상 모델 목록을 확인했습니다. 실제 영상 생성은 실행하지 않았습니다.',
            details: models.slice(0, 5).map((model) => model.id).filter(Boolean).join(', '),
        };
    } catch (error) {
        return {
            id: 'openrouter-video-catalog',
            name: 'OpenRouter 영상 모델 목록',
            status: 'failed',
            latencyMs: Date.now() - startedAt,
            message: '영상 모델 목록을 불러오지 못했습니다.',
            details: toErrorMessage(error),
        };
    }
};

const runRouteCheck = async (args: {
    origin: string;
    id: string;
    name: string;
    apiPath: string;
    method: 'GET' | 'POST';
    payload?: Record<string, unknown>;
    authorization?: string;
}): Promise<HealthCheckResult> => {
    const startedAt = Date.now();
    try {
        const response = await fetch(new URL(args.apiPath, args.origin), {
            method: args.method,
            headers: {
                ...(args.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
                ...(args.authorization ? { Authorization: args.authorization } : {}),
            },
            body: args.method === 'POST' ? JSON.stringify(args.payload || {}) : undefined,
        });
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!response.ok) {
            throw new Error(typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`);
        }
        return {
            id: args.id,
            name: args.name,
            status: 'passed',
            latencyMs: Date.now() - startedAt,
            message: '관리 API가 OpenRouter 경로로 정상 응답했습니다.',
            details: typeof payload?.provider === 'string' ? `provider=${payload.provider}` : undefined,
        };
    } catch (error) {
        return {
            id: args.id,
            name: args.name,
            status: 'failed',
            latencyMs: Date.now() - startedAt,
            message: '관리 API 호출에 실패했습니다.',
            details: toErrorMessage(error),
        };
    }
};

export async function POST(request: NextRequest) {
    const authResult = await requireAdminAuth(request);
    if (!authResult.ok) return NextResponse.json({ error: authResult.message }, { status: authResult.status });

    try {
        const payload = AIConfigTestRequestSchema.parse(await request.json().catch(() => ({})));
        const runtime = await getAIRuntimeConfig();
        const checks: HealthCheckResult[] = [];

        if (!runtime.openRouterApiKey) {
            checks.push(immediateCheck({
                id: 'openrouter-model-ping',
                name: `OpenRouter 텍스트 모델 (${runtime.model})`,
                status: 'failed',
                message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.',
            }));
            checks.push(immediateCheck({
                id: 'openrouter-video-catalog',
                name: 'OpenRouter 영상 모델 목록',
                status: 'skipped',
                message: 'OpenRouter 키가 없어 영상 모델 목록 확인을 건너뛰었습니다.',
            }));
        } else {
            checks.push(await runModelPing(runtime.openRouterApiKey, runtime.model));
            checks.push(await runVideoCatalogCheck(runtime.openRouterApiKey));
        }

        const targetIds = payload.targetIds?.length ? new Set(payload.targetIds) : null;
        const targets = runtime.managedPages.filter((page) =>
            page.enabled &&
            (!targetIds || targetIds.has(page.id)) &&
            (page.type !== 'image' || payload.includeImageTest === true),
        );
        const authorization = request.headers.get('authorization') || undefined;
        checks.push(...await Promise.all(targets.map((page) => runRouteCheck({
            origin: request.nextUrl.origin,
            id: page.id,
            name: page.name,
            apiPath: page.apiPath,
            method: page.method,
            payload: page.testPayload,
            authorization,
        }))));

        if (!payload.includeImageTest) {
            checks.push(immediateCheck({
                id: 'openrouter-image-generate',
                name: 'OpenRouter 이미지 생성',
                status: 'skipped',
                message: '이미지 생성 비용이 발생할 수 있어 테스트를 건너뛰었습니다.',
            }));
        }

        const summary = checks.reduce(
            (result, check) => ({ ...result, total: result.total + 1, [check.status]: result[check.status] + 1 }),
            { total: 0, passed: 0, failed: 0, skipped: 0 },
        );
        const message = summary.failed === 0
            ? 'OpenRouter 구성과 선택된 관리 경로를 확인했습니다.'
            : 'OpenRouter 구성 또는 관리 API 경로에서 확인이 필요한 항목이 있습니다.';

        return NextResponse.json({
            ok: summary.failed === 0,
            runtime: {
                source: runtime.source,
                model: runtime.model,
                imageModel: runtime.imageModel,
                hasApiKey: Boolean(runtime.openRouterApiKey),
            },
            checks,
            summary,
            message,
        });
    } catch (error) {
        return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
    }
}
