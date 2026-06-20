import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import { getGeminiRuntimeConfig } from '@/lib/server/gemini';
import { listXaiModelIds, XAI_VIDEO_MODEL } from '@/lib/server/xai';

const GeminiConfigTestRequestSchema = z.object({
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

const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

const safeJsonParse = (raw: string): unknown => {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const getStringField = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

const makeImmediateCheck = (args: {
    id: string;
    name: string;
    status: CheckStatus;
    message: string;
    details?: string;
}): HealthCheckResult => ({
    id: args.id,
    name: args.name,
    status: args.status,
    latencyMs: 0,
    message: args.message,
    details: args.details,
});

const runModelPing = async (apiKey: string, modelName: string): Promise<HealthCheckResult> => {
    const start = Date.now();

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const completion = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'Reply with OK only.' }] }],
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 16,
            },
        });

        const text = completion.response.text().trim();
        if (!text) {
            throw new Error('Gemini model returned an empty response.');
        }

        return {
            id: 'gemini-model-ping',
            name: `Gemini 모델 핑 (${modelName})`,
            status: 'passed',
            latencyMs: Date.now() - start,
            message: '모델 응답 확인 완료',
            details: text.slice(0, 120),
        };
    } catch (error) {
        return {
            id: 'gemini-model-ping',
            name: `Gemini 모델 핑 (${modelName})`,
            status: 'failed',
            latencyMs: Date.now() - start,
            message: '모델 호출 실패',
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
    const start = Date.now();
    const endpoint = new URL(args.apiPath, args.origin).toString();

    try {
        const res = await fetch(endpoint, {
            method: args.method,
            headers: {
                ...(args.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
                ...(args.authorization ? { Authorization: args.authorization } : {}),
            },
            body: args.method === 'POST' ? JSON.stringify(args.payload || {}) : undefined,
        });

        const rawBody = await res.text();
        const parsed = safeJsonParse(rawBody) as Record<string, unknown> | null;
        const meta =
            parsed && typeof parsed._meta === 'object'
                ? (parsed._meta as Record<string, unknown>)
                : undefined;

        if (!res.ok) {
            const errorMessage =
                (parsed && typeof parsed.error === 'string' && parsed.error) ||
                `HTTP ${res.status}`;
            const details =
                getStringField(meta?.message) ||
                (parsed && typeof parsed.details === 'string' ? parsed.details : undefined) ||
                (parsed && typeof parsed.reasonCode === 'string'
                    ? `reasonCode=${parsed.reasonCode}`
                    : undefined);

            return {
                id: args.id,
                name: args.name,
                status: 'failed',
                latencyMs: Date.now() - start,
                message: errorMessage,
                details,
            };
        }

        if (args.apiPath === '/api/analyze-bookmark') {
            if (!meta || meta.status !== 'ok') {
                return {
                    id: args.id,
                    name: args.name,
                    status: 'failed',
                    latencyMs: Date.now() - start,
                    message: 'AI 분석 응답이 ok 상태를 반환하지 않았습니다.',
                };
            }
        }

        if (args.apiPath === '/api/generate-mandalart') {
            const subGoals = parsed && Array.isArray(parsed.subGoals) ? parsed.subGoals : null;

            if (!subGoals || subGoals.length !== 8) {
                return {
                    id: args.id,
                    name: args.name,
                    status: 'failed',
                    latencyMs: Date.now() - start,
                    message: '만다라트 응답이 8개 목표 형식을 만족하지 않습니다.',
                };
            }
        }

        if (args.apiPath === '/api/generate-image') {
            const success = parsed && typeof parsed.success === 'boolean' ? parsed.success : false;

            if (!success) {
                const errorMessage =
                    parsed && typeof parsed.error === 'string'
                        ? parsed.error
                        : '이미지 생성 응답이 success=false 를 반환했습니다.';
                const details =
                    parsed && typeof parsed.details === 'string'
                        ? parsed.details
                        : parsed && typeof parsed.reasonCode === 'string'
                            ? `reasonCode=${parsed.reasonCode}`
                            : undefined;

                return {
                    id: args.id,
                    name: args.name,
                    status: 'failed',
                    latencyMs: Date.now() - start,
                    message: errorMessage,
                    details,
                };
            }
        }

        const provider = getStringField(meta?.source) || getStringField(parsed?.provider);
        const model = getStringField(meta?.model);
        const extraMessage = getStringField(meta?.message);
        const detailParts = [
            provider ? `provider=${provider}` : '',
            model ? `model=${model}` : '',
            extraMessage ? extraMessage : '',
        ].filter(Boolean);

        return {
            id: args.id,
            name: args.name,
            status: 'passed',
            latencyMs: Date.now() - start,
            message: provider ? `API 응답 정상 via ${provider}` : 'API 응답 정상',
            details: detailParts.length > 0 ? detailParts.join(', ') : undefined,
        };
    } catch (error) {
        return {
            id: args.id,
            name: args.name,
            status: 'failed',
            latencyMs: Date.now() - start,
            message: 'API 호출 실패',
            details: toErrorMessage(error),
        };
    }
};

const runGrokVideoReadinessCheck = async (apiKey: string): Promise<HealthCheckResult> => {
    const start = Date.now();

    try {
        const modelIds = await listXaiModelIds(apiKey);
        const hasVideoModel = modelIds.includes(XAI_VIDEO_MODEL);

        if (!hasVideoModel) {
            return {
                id: 'grok-video-ready',
                name: 'Grok 동영상 준비 상태',
                status: 'failed',
                latencyMs: Date.now() - start,
                message: `${XAI_VIDEO_MODEL} 모델 접근을 확인하지 못했습니다.`,
                details:
                    modelIds.length > 0
                        ? `확인된 모델: ${modelIds.slice(0, 8).join(', ')}`
                        : 'xAI 모델 목록이 비어 있거나 응답 형식이 예상과 다릅니다.',
            };
        }

        return {
            id: 'grok-video-ready',
            name: 'Grok 동영상 준비 상태',
            status: 'passed',
            latencyMs: Date.now() - start,
            message: 'xAI 동영상 모델 접근을 확인했습니다.',
            details: `실제 렌더는 실행하지 않았습니다. 확인 모델: ${XAI_VIDEO_MODEL}`,
        };
    } catch (error) {
        return {
            id: 'grok-video-ready',
            name: 'Grok 동영상 준비 상태',
            status: 'failed',
            latencyMs: Date.now() - start,
            message: 'xAI 동영상 준비 상태 확인에 실패했습니다.',
            details: toErrorMessage(error),
        };
    }
};

export async function POST(request: NextRequest) {
    const authResult = await requireAdminAuth(request);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    try {
        const payload = GeminiConfigTestRequestSchema.parse(await request.json().catch(() => ({})));
        const runtimeConfig = await getGeminiRuntimeConfig();
        const checkResults: HealthCheckResult[] = [];

        if (runtimeConfig.apiKey) {
            checkResults.push(await runModelPing(runtimeConfig.apiKey, runtimeConfig.model));
        } else {
            checkResults.push(
                makeImmediateCheck({
                    id: 'gemini-model-ping',
                    name: `Gemini 모델 핑 (${runtimeConfig.model})`,
                    status: 'failed',
                    message: 'Gemini API 키가 설정되어 있지 않습니다.',
                }),
            );
        }

        const targetIdSet = payload.targetIds?.length ? new Set(payload.targetIds) : null;
        const runTargets = runtimeConfig.managedPages.filter((page) => {
            if (!page.enabled) return false;
            if (targetIdSet && !targetIdSet.has(page.id)) return false;
            if (page.type === 'image' && payload.includeImageTest !== true) return false;
            return true;
        });

        const origin = request.nextUrl.origin;
        const authorization = request.headers.get('authorization') || request.headers.get('Authorization') || undefined;
        const routeChecks = await Promise.all(
            runTargets.map((page) =>
                runRouteCheck({
                    origin,
                    id: page.id,
                    name: page.name,
                    apiPath: page.apiPath,
                    method: page.method,
                    payload: page.testPayload,
                    authorization,
                }),
            ),
        );
        checkResults.push(...routeChecks);

        if (payload.includeImageTest === true) {
            if (runtimeConfig.grokApiKey) {
                checkResults.push(
                    await runRouteCheck({
                        origin,
                        id: 'grok-image-generate',
                        name: 'Grok 이미지 생성',
                        apiPath: '/api/generate-image',
                        method: 'POST',
                        authorization,
                        payload: {
                            prompt: 'Simple green square icon',
                            width: 256,
                            height: 256,
                            numberOfImages: 1,
                            provider: 'grok',
                        },
                    }),
                );
            } else {
                checkResults.push(
                    makeImmediateCheck({
                        id: 'grok-image-generate',
                        name: 'Grok 이미지 생성',
                        status: 'failed',
                        message: 'Grok API 키가 설정되어 있지 않습니다.',
                    }),
                );
            }
        } else {
            checkResults.push(
                makeImmediateCheck({
                    id: 'grok-image-generate',
                    name: 'Grok 이미지 생성',
                    status: 'skipped',
                    message: '이미지 테스트 옵션이 꺼져 있어 Grok 이미지 생성 점검을 건너뛰었습니다.',
                }),
            );
        }

        if (runtimeConfig.grokApiKey) {
            checkResults.push(await runGrokVideoReadinessCheck(runtimeConfig.grokApiKey));
        } else {
            checkResults.push(
                makeImmediateCheck({
                    id: 'grok-video-ready',
                    name: 'Grok 동영상 준비 상태',
                    status: 'failed',
                    message: 'Grok API 키가 설정되어 있지 않습니다.',
                }),
            );
        }

        const summary = checkResults.reduce(
            (acc, item) => {
                acc.total += 1;
                acc[item.status] += 1;
                return acc;
            },
            { total: 0, passed: 0, failed: 0, skipped: 0 },
        );

        const geminiPingFailed = checkResults.some(
            (item) => item.id === 'gemini-model-ping' && item.status === 'failed',
        );
        const nonGeminiFailures = checkResults.filter(
            (item) => item.status === 'failed' && item.id !== 'gemini-model-ping',
        );
        const summaryMessage =
            summary.failed === 0
                ? 'Gemini와 Grok 상태를 모두 확인했습니다.'
                : geminiPingFailed && nonGeminiFailures.length === 0
                    ? 'Gemini 키 또는 Gemini 모델 호출에는 문제가 있지만, Grok 기반 기능은 정상 동작합니다.'
                    : '일부 공급자 설정 또는 API 경로에서 문제가 발견되었습니다.';

        return NextResponse.json({
            ok: summary.failed === 0,
            runtime: {
                source: runtimeConfig.source,
                model: runtimeConfig.model,
                imageModel: runtimeConfig.imageModel,
                hasApiKey: Boolean(runtimeConfig.apiKey),
                hasGrokApiKey: Boolean(runtimeConfig.grokApiKey),
            },
            checks: checkResults,
            summary,
            message: summaryMessage,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '헬스 체크 실행에 실패했습니다.' },
            { status: 500 },
        );
    }
}
