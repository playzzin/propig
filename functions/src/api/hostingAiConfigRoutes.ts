import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiError, db, parseJson, requireAdmin, requireMethod } from './hostingCommon';
import {
    getHostingAiRuntime,
    maskApiKey,
    mergeManagedPages,
    runOpenRouterText,
} from './hostingAiRuntime';

const ManagedPageSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    pagePath: z.string().min(1),
    apiPath: z.string().min(1),
    method: z.enum(['GET', 'POST']).default('POST'),
    enabled: z.boolean().default(true),
    type: z.enum(['text', 'image', 'custom']).default('custom'),
    description: z.string().optional(),
    testPayload: z.record(z.string(), z.unknown()).optional(),
    builtIn: z.boolean().optional(),
});

const UpdateAIConfigSchema = z.object({
    apiKey: z.string().optional(),
    replaceApiKey: z.boolean().optional(),
    clearApiKey: z.boolean().optional(),
    model: z.string().trim().min(1).max(200).optional(),
    imageModel: z.string().trim().min(1).max(200).optional(),
    fallbackModels: z.array(z.string().trim().min(1).max(200)).max(3).optional(),
    managedPages: z.array(ManagedPageSchema).max(100).optional(),
});

const runtimeStorage = {
    canPersist: true,
    credentialMode: 'firebase-functions-runtime',
    message: '모델 설정은 Firestore에 저장되고 API 키는 Firebase Secret에서 관리됩니다.',
    canEditRuntimeSecrets: false,
};

async function buildConfig() {
    const runtime = await getHostingAiRuntime();
    return {
        source: runtime.source,
        model: runtime.model,
        imageModel: runtime.imageModel,
        fallbackModels: runtime.fallbackModels,
        hasApiKey: Boolean(runtime.openRouterApiKey),
        maskedApiKey: maskApiKey(runtime.openRouterApiKey),
        managedPages: runtime.managedPages,
        updatedAt: runtime.updatedAt,
        updatedBy: runtime.updatedBy,
    };
}

export async function handleAiConfig(req: Request, res: Response): Promise<void> {
    requireMethod(req, ['GET', 'POST']);
    const auth = await requireAdmin(req);
    if (req.method === 'GET') {
        res.status(200).json({ config: await buildConfig(), storage: runtimeStorage });
        return;
    }

    const payload = parseJson(req, UpdateAIConfigSchema, '요청 데이터가 올바르지 않습니다.');
    const changesSecret = Boolean(payload.replaceApiKey || payload.clearApiKey || payload.apiKey?.trim());
    if (changesSecret) {
        throw new ApiError(
            400,
            '배포 환경의 API 키는 이 화면에서 변경할 수 없습니다. Firebase Secret OPENROUTER_API_KEY를 사용하세요.',
        );
    }
    const current = await getHostingAiRuntime();
    const model = payload.model || current.model;
    const imageModel = payload.imageModel || current.imageModel;
    const fallbackModels = Array.from(new Set(
        (payload.fallbackModels || current.fallbackModels)
            .map((item) => item.trim())
            .filter((item) => item && item !== model),
    )).slice(0, 3);
    const managedPages = mergeManagedPages(payload.managedPages ?? current.managedPages);
    await db.collection('system_settings').doc('ai').set({
        model,
        imageModel,
        fallbackModels,
        managedPages: managedPages.map((page) => ({
            ...page,
            description: page.description || '',
            testPayload: page.testPayload || {},
        })),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
    }, { merge: true });
    res.status(200).json({ ok: true, config: await buildConfig(), storage: runtimeStorage });
}

const AiConfigTestSchema = z.object({
    includeImageTest: z.boolean().optional(),
    targetIds: z.array(z.string().max(200)).max(100).optional(),
});

type HealthCheck = {
    id: string;
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    latencyMs: number;
    message: string;
    details?: string;
};

async function testModel(model: string): Promise<HealthCheck> {
    const startedAt = Date.now();
    try {
        const result = await runOpenRouterText({
            model,
            messages: [{ role: 'user', content: 'Reply with OK only.' }],
            temperature: 0,
            maxTokens: 16,
        });
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
            details: error instanceof Error ? error.message : String(error),
        };
    }
}

async function testVideoCatalog(apiKey: string): Promise<HealthCheck> {
    const startedAt = Date.now();
    try {
        const response = await fetch('https://openrouter.ai/api/v1/videos/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        const payload = await response.json().catch(() => null) as {
            data?: Array<{ id?: string }>;
            error?: { message?: string };
        } | null;
        if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter HTTP ${response.status}`);
        const models = payload?.data || [];
        if (!models.length) throw new Error('OpenRouter returned no video-capable models.');
        return {
            id: 'openrouter-video-catalog',
            name: 'OpenRouter 영상 모델 목록',
            status: 'passed',
            latencyMs: Date.now() - startedAt,
            message: '영상 모델 목록을 확인했습니다. 실제 영상 생성은 실행하지 않았습니다.',
            details: models.slice(0, 5).map((item) => item.id).filter(Boolean).join(', '),
        };
    } catch (error) {
        return {
            id: 'openrouter-video-catalog',
            name: 'OpenRouter 영상 모델 목록',
            status: 'failed',
            latencyMs: Date.now() - startedAt,
            message: '영상 모델 목록을 불러오지 못했습니다.',
            details: error instanceof Error ? error.message : String(error),
        };
    }
}

function canonicalHostingOrigin(): string {
    const explicit = (process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').trim();
    if (explicit) {
        const parsed = new URL(explicit);
        if (parsed.protocol === 'https:' || parsed.hostname === 'localhost') return parsed.origin;
    }
    const projectId = (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
    if (!projectId) throw new Error('Firebase project id is not available for managed route checks.');
    return `https://${projectId}.web.app`;
}

async function testManagedRoute(
    page: ReturnType<typeof mergeManagedPages>[number],
    authorization?: string,
): Promise<HealthCheck> {
    const startedAt = Date.now();
    try {
        if (!/^\/api\/[A-Za-z0-9/_?=&.-]*$/.test(page.apiPath) || page.apiPath.includes('..')) {
            throw new Error('Managed API paths must be safe same-origin /api paths.');
        }
        const response = await fetch(new URL(page.apiPath, canonicalHostingOrigin()), {
            method: page.method,
            headers: {
                ...(page.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
                ...(authorization ? { Authorization: authorization } : {}),
            },
            body: page.method === 'POST' ? JSON.stringify(page.testPayload || {}) : undefined,
        });
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`);
        return {
            id: page.id,
            name: page.name,
            status: 'passed',
            latencyMs: Date.now() - startedAt,
            message: '관리 API가 배포 런타임에서 정상 응답했습니다.',
            details: typeof payload?.provider === 'string' ? `provider=${payload.provider}` : undefined,
        };
    } catch (error) {
        return {
            id: page.id,
            name: page.name,
            status: 'failed',
            latencyMs: Date.now() - startedAt,
            message: '관리 API 호출에 실패했습니다.',
            details: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function handleAiConfigTest(req: Request, res: Response): Promise<void> {
    requireMethod(req, 'POST');
    await requireAdmin(req);
    const payload = parseJson(req, AiConfigTestSchema);
    const runtime = await getHostingAiRuntime();
    const checks: HealthCheck[] = [];
    if (!runtime.openRouterApiKey) {
        checks.push({
            id: 'openrouter-model-ping',
            name: `OpenRouter 텍스트 모델 (${runtime.model})`,
            status: 'failed',
            latencyMs: 0,
            message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.',
        });
        checks.push({
            id: 'openrouter-video-catalog',
            name: 'OpenRouter 영상 모델 목록',
            status: 'skipped',
            latencyMs: 0,
            message: 'OpenRouter 키가 없어 검사를 건너뛰었습니다.',
        });
    } else {
        checks.push(await testModel(runtime.model));
        checks.push(await testVideoCatalog(runtime.openRouterApiKey));
    }
    const targetIds = payload.targetIds?.length ? new Set(payload.targetIds) : null;
    const targets = runtime.managedPages.filter((page) =>
        page.enabled &&
        (!targetIds || targetIds.has(page.id)) &&
        (page.type !== 'image' || payload.includeImageTest === true),
    );
    const authorization = req.header('authorization') || undefined;
    checks.push(...await Promise.all(targets.map((page) => testManagedRoute(page, authorization))));
    if (!payload.includeImageTest) {
        checks.push({
            id: 'openrouter-image-generate',
            name: 'OpenRouter 이미지 생성',
            status: 'skipped',
            latencyMs: 0,
            message: '이미지 생성 비용이 발생할 수 있어 검사를 건너뛰었습니다.',
        });
    }
    const summary = checks.reduce(
        (result, check) => {
            result.total += 1;
            result[check.status] += 1;
            return result;
        },
        { total: 0, passed: 0, failed: 0, skipped: 0 },
    );
    res.status(200).json({
        ok: summary.failed === 0,
        runtime: {
            source: runtime.source,
            model: runtime.model,
            imageModel: runtime.imageModel,
            hasApiKey: Boolean(runtime.openRouterApiKey),
        },
        checks,
        summary,
        message: summary.failed === 0
            ? 'OpenRouter 구성과 선택한 관리 경로를 확인했습니다.'
            : 'OpenRouter 구성 또는 관리 API 경로에서 확인이 필요한 항목이 있습니다.',
    });
}
