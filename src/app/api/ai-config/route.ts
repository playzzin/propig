import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
    DEFAULT_OPENROUTER_IMAGE_MODEL,
    DEFAULT_OPENROUTER_MODEL,
    maskApiKey,
    mergeManagedPages,
} from '@/lib/ai-config';
import { db as adminDb, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';

export const dynamic = 'force-dynamic';

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
    model: z.string().min(1).optional(),
    imageModel: z.string().min(1).optional(),
    fallbackModels: z.array(z.string().min(1)).max(3).optional(),
    managedPages: z.array(ManagedPageSchema).optional(),
});

type StoredAISettings = {
    model?: string;
    imageModel?: string;
    fallbackModels?: string[];
    managedPages?: unknown;
    updatedBy?: string;
};

type ConfigStorageStatus = {
    canPersist: boolean;
    credentialMode: string;
    message: string | null;
    canEditRuntimeSecrets: boolean;
};

const LEGACY_PROVIDER_ENV_KEYS = new Set([
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GEMINI_MODEL',
    'GEMINI_IMAGE_MODEL',
    'GROK_API_KEY',
]);

const getAISettingsDocRef = () => adminDb.collection('system_settings').doc('ai');
const normalizeModelId = (model: string) => model.trim();
const isLikelyOpenRouterApiKey = (value: string) => /^sk-or-[A-Za-z0-9_-]{16,}$/.test(value);

const canUseLocalEnvFallback = (request: NextRequest) =>
    process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(request.nextUrl.hostname);

const getStorageStatus = (request: NextRequest): ConfigStorageStatus => {
    const adminStatus = getFirebaseAdminStatus();
    const canEditRuntimeSecrets = canUseLocalEnvFallback(request);

    if (!adminStatus.canPersistToFirestore && canEditRuntimeSecrets) {
        return {
            canPersist: true,
            credentialMode: 'local_env_file',
            message: 'Firebase Admin 자격 증명이 없어 로컬 .env.local 파일만 수정할 수 있습니다.',
            canEditRuntimeSecrets,
        };
    }

    return {
        canPersist: adminStatus.canPersistToFirestore,
        credentialMode: adminStatus.credentialMode,
        message: adminStatus.message,
        canEditRuntimeSecrets,
    };
};

const upsertEnvLine = (lines: string[], key: string, value: string) => {
    let found = false;
    const sanitized = value.replace(/\r?\n/g, '\\n').trim();
    const next = lines
        .filter((line) => {
            const separator = line.indexOf('=');
            const keyName = separator > 0 ? line.slice(0, separator).trim() : '';
            return !LEGACY_PROVIDER_ENV_KEYS.has(keyName);
        })
        .map((line) => {
            const separator = line.indexOf('=');
            if (separator <= 0 || line.trim().startsWith('#')) return line;
            if (line.slice(0, separator).trim() !== key) return line;
            found = true;
            return `${key}=${sanitized}`;
        });
    if (!found) next.push(`${key}=${sanitized}`);
    return next;
};

const writeLocalEnvConfig = (updates: {
    openRouterApiKey: string;
    model: string;
    imageModel: string;
    fallbackModels: string[];
}) => {
    const filePath = join(process.cwd(), '.env.local');
    let lines = existsSync(filePath) ? readFileSync(filePath, 'utf8').split(/\r?\n/) : [];
    lines = upsertEnvLine(lines, 'OPENROUTER_API_KEY', updates.openRouterApiKey);
    lines = upsertEnvLine(lines, 'OPENROUTER_MODEL', updates.model);
    lines = upsertEnvLine(lines, 'OPENROUTER_IMAGE_MODEL', updates.imageModel);
    lines = upsertEnvLine(lines, 'OPENROUTER_FALLBACK_MODELS', updates.fallbackModels.join(','));
    writeFileSync(filePath, `${lines.filter((line, index, list) => line || index < list.length - 1).join('\n')}\n`, 'utf8');

    process.env.OPENROUTER_API_KEY = updates.openRouterApiKey;
    process.env.OPENROUTER_MODEL = updates.model;
    process.env.OPENROUTER_IMAGE_MODEL = updates.imageModel;
    process.env.OPENROUTER_FALLBACK_MODELS = updates.fallbackModels.join(',');
};

const normalizeManagedPagesForStorage = (pages: z.infer<typeof ManagedPageSchema>[]) =>
    pages.map((page) => ({ ...page, description: page.description || '', testPayload: page.testPayload || {} }));

const buildResponseConfig = async (updatedBy?: string | null) => {
    const runtime = await getAIRuntimeConfig();
    return {
        source: runtime.source,
        model: runtime.model || DEFAULT_OPENROUTER_MODEL,
        imageModel: runtime.imageModel || DEFAULT_OPENROUTER_IMAGE_MODEL,
        fallbackModels: runtime.fallbackModels,
        hasApiKey: Boolean(runtime.openRouterApiKey),
        maskedApiKey: maskApiKey(runtime.openRouterApiKey),
        managedPages: runtime.managedPages,
        updatedAt: runtime.updatedAt || null,
        updatedBy: updatedBy || null,
    };
};

export async function GET(request: NextRequest) {
    const authResult = await requireAdminAuth(request);
    if (!authResult.ok) return NextResponse.json({ error: authResult.message }, { status: authResult.status });

    try {
        const storage = getStorageStatus(request);
        const snapshot = getFirebaseAdminStatus().canPersistToFirestore ? await getAISettingsDocRef().get() : null;
        const stored = snapshot?.exists ? (snapshot.data() as StoredAISettings) : null;
        return NextResponse.json({ config: await buildResponseConfig(stored?.updatedBy), storage });
    } catch (error) {
        console.error('[AI Config] Failed to load settings:', error);
        return NextResponse.json({ error: 'AI 설정을 불러오지 못했습니다.' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authResult = await requireAdminAuth(request);
    if (!authResult.ok) return NextResponse.json({ error: authResult.message }, { status: authResult.status });

    try {
        const parsed = UpdateAIConfigSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: '요청 데이터가 올바르지 않습니다.', issues: parsed.error.issues }, { status: 400 });
        }

        const payload = parsed.data;
        const storage = getStorageStatus(request);
        const changesSecret = Boolean(payload.replaceApiKey || payload.clearApiKey || payload.apiKey?.trim());
        if (changesSecret && !storage.canEditRuntimeSecrets) {
            return NextResponse.json(
                { error: '배포 환경의 API 키는 이 화면에서 바꾸지 않습니다. Firebase Secret OPENROUTER_API_KEY를 사용하세요.', storage },
                { status: 400 },
            );
        }
        if (!storage.canPersist) {
            return NextResponse.json({ error: storage.message || '설정 저장소를 사용할 수 없습니다.', storage }, { status: 503 });
        }

        const runtime = await getAIRuntimeConfig();
        const snapshot = getFirebaseAdminStatus().canPersistToFirestore ? await getAISettingsDocRef().get() : null;
        const current = snapshot?.exists ? (snapshot.data() as StoredAISettings) : {};
        let openRouterApiKey = runtime.openRouterApiKey;
        if (payload.clearApiKey) openRouterApiKey = '';
        else if (payload.replaceApiKey || payload.apiKey?.trim()) openRouterApiKey = payload.apiKey?.trim() || '';

        if (openRouterApiKey && !isLikelyOpenRouterApiKey(openRouterApiKey)) {
            return NextResponse.json({ error: 'OpenRouter API 키 형식이 올바르지 않습니다. sk-or-로 시작하는 키를 입력하세요.', storage }, { status: 400 });
        }

        const model = normalizeModelId(payload.model || current.model || runtime.model || DEFAULT_OPENROUTER_MODEL);
        const imageModel = normalizeModelId(payload.imageModel || current.imageModel || runtime.imageModel || DEFAULT_OPENROUTER_IMAGE_MODEL);
        const fallbackModels = Array.from(new Set((payload.fallbackModels || current.fallbackModels || runtime.fallbackModels)
            .map(normalizeModelId)
            .filter((candidate) => candidate && candidate !== model))).slice(0, 3);
        const managedPages = mergeManagedPages(payload.managedPages ?? current.managedPages ?? runtime.managedPages);

        if (storage.canEditRuntimeSecrets) {
            writeLocalEnvConfig({ openRouterApiKey, model, imageModel, fallbackModels });
        }

        if (getFirebaseAdminStatus().canPersistToFirestore) {
            await getAISettingsDocRef().set({
                model,
                imageModel,
                fallbackModels,
                managedPages: normalizeManagedPagesForStorage(managedPages),
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: authResult.uid,
            }, { merge: true });
        }

        return NextResponse.json({ ok: true, config: await buildResponseConfig(authResult.uid), storage });
    } catch (error) {
        console.error('[AI Config] Failed to save settings:', error);
        return NextResponse.json({ error: 'AI 설정을 저장하지 못했습니다.' }, { status: 500 });
    }
}
