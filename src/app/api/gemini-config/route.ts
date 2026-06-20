import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db as adminDb, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import { getGeminiRuntimeConfig } from '@/lib/server/gemini';
import {
    DEFAULT_GEMINI_IMAGE_MODEL,
    DEFAULT_GEMINI_MODEL,
    ManagedApiMethod,
    ManagedApiPageType,
    maskApiKey,
    mergeManagedPages,
} from '@/lib/gemini-config';

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

const UpdateGeminiConfigSchema = z.object({
    apiKey: z.string().optional(),
    replaceApiKey: z.boolean().optional(),
    clearApiKey: z.boolean().optional(),
    grokApiKey: z.string().optional(),
    replaceGrokApiKey: z.boolean().optional(),
    clearGrokApiKey: z.boolean().optional(),
    model: z.string().min(1).optional(),
    imageModel: z.string().min(1).optional(),
    managedPages: z.array(ManagedPageSchema).optional(),
});

type StoredGeminiDoc = {
    apiKey?: string;
    grokApiKey?: string;
    model?: string;
    imageModel?: string;
    managedPages?: unknown;
    updatedAt?: unknown;
    updatedBy?: string;
};

type ConfigStorageStatus = {
    canPersist: boolean;
    credentialMode: string;
    message: string | null;
};

const normalizeManagedPagesForStorage = (
    pages: Array<{
        id: string;
        name: string;
        pagePath: string;
        apiPath: string;
        method: ManagedApiMethod;
        enabled: boolean;
        type: ManagedApiPageType;
        description?: string;
        testPayload?: Record<string, unknown>;
        builtIn?: boolean;
    }>,
) => {
    return pages.map((page) => ({
        id: page.id,
        name: page.name,
        pagePath: page.pagePath,
        apiPath: page.apiPath,
        method: page.method,
        enabled: page.enabled,
        type: page.type,
        description: page.description || '',
        testPayload: page.testPayload || {},
        builtIn: Boolean(page.builtIn),
    }));
};

const getGeminiDocRef = () => adminDb.collection('system_settings').doc('gemini');

const isLikelyGeminiApiKey = (value: string): boolean => /^AIza[0-9A-Za-z_-]{20,}$/.test(value);

const isLikelyGrokApiKey = (value: string): boolean => /^xai-[0-9A-Za-z_-]{20,}$/.test(value);

const canUseLocalEnvFallback = (request: NextRequest): boolean => {
    if (process.env.NODE_ENV === 'production') return false;

    const hostname = request.nextUrl.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

const getStorageStatus = (request: NextRequest): ConfigStorageStatus => {
    const adminStatus = getFirebaseAdminStatus();
    if (!adminStatus.canPersistToFirestore && canUseLocalEnvFallback(request)) {
        return {
            canPersist: true,
            credentialMode: 'local_env_file',
            message:
                'Firebase Admin credentials are not configured. Local development changes will be saved to .env.local.',
        };
    }

    return {
        canPersist: adminStatus.canPersistToFirestore,
        credentialMode: adminStatus.credentialMode,
        message: adminStatus.message,
    };
};

const readLocalEnvFile = (filePath: string): string[] => {
    if (!existsSync(filePath)) return [];
    return readFileSync(filePath, 'utf8').split(/\r?\n/);
};

const serializeEnvValue = (value: string): string => value.replace(/\r?\n/g, '\\n').trim();

const upsertEnvLine = (lines: string[], key: string, value: string): string[] => {
    let found = false;
    const nextLines = lines.map((line) => {
        const trimmed = line.trim();
        const separatorIndex = trimmed.indexOf('=');

        if (!trimmed || trimmed.startsWith('#') || separatorIndex <= 0) {
            return line;
        }

        const currentKey = trimmed.slice(0, separatorIndex).trim();
        if (currentKey !== key) return line;

        found = true;
        return `${key}=${serializeEnvValue(value)}`;
    });

    if (!found) {
        nextLines.push(`${key}=${serializeEnvValue(value)}`);
    }

    return nextLines;
};

const writeLocalEnvConfig = (updates: {
    apiKey: string;
    grokApiKey: string;
    model: string;
    imageModel: string;
}) => {
    const filePath = join(process.cwd(), '.env.local');
    let lines = readLocalEnvFile(filePath);

    lines = upsertEnvLine(lines, 'GEMINI_API_KEY', updates.apiKey);
    lines = upsertEnvLine(lines, 'GROK_API_KEY', updates.grokApiKey);
    lines = upsertEnvLine(lines, 'GEMINI_MODEL', updates.model);
    lines = upsertEnvLine(lines, 'GEMINI_IMAGE_MODEL', updates.imageModel);

    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines = lines.slice(0, -1);
    }

    writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');

    process.env.GEMINI_API_KEY = updates.apiKey;
    process.env.GROK_API_KEY = updates.grokApiKey;
    process.env.GEMINI_MODEL = updates.model;
    process.env.GEMINI_IMAGE_MODEL = updates.imageModel;
};

export async function GET(request: NextRequest) {
    const authResult = await requireAdminAuth(request);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    try {
        const storage = getStorageStatus(request);
        const runtimeConfig = await getGeminiRuntimeConfig();
        let docSnap = null;

        if (getFirebaseAdminStatus().canPersistToFirestore) {
            try {
                docSnap = await getGeminiDocRef().get();
            } catch (error) {
                console.warn('[Gemini Config] Failed to load Firestore document:', error);
            }
        }

        const docData = docSnap?.exists ? (docSnap.data() as StoredGeminiDoc) : {};

        return NextResponse.json({
            config: {
                source: runtimeConfig.source,
                model: runtimeConfig.model || DEFAULT_GEMINI_MODEL,
                imageModel: runtimeConfig.imageModel || DEFAULT_GEMINI_IMAGE_MODEL,
                hasApiKey: Boolean(runtimeConfig.apiKey),
                maskedApiKey: maskApiKey(runtimeConfig.apiKey),
                hasGrokApiKey: Boolean(runtimeConfig.grokApiKey),
                maskedGrokApiKey: maskApiKey(runtimeConfig.grokApiKey),
                managedPages: runtimeConfig.managedPages,
                updatedAt: runtimeConfig.updatedAt || null,
                updatedBy: docData.updatedBy || null,
            },
            storage,
        });
    } catch (error) {
        console.error('[Gemini Config GET Error]:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '설정을 불러오지 못했습니다.' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const authResult = await requireAdminAuth(request);
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    try {
        const json = await request.json();
        const parsed = UpdateGeminiConfigSchema.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                { error: '요청 데이터가 올바르지 않습니다.', issues: parsed.error.issues },
                { status: 400 },
            );
        }

        const storage = getStorageStatus(request);
        const canPersistToFirestore = getFirebaseAdminStatus().canPersistToFirestore;
        const canPersistToLocalEnv = storage.credentialMode === 'local_env_file';

        if (!canPersistToFirestore && !canPersistToLocalEnv) {
            return NextResponse.json(
                { error: storage.message || 'Firestore 저장이 불가능합니다.', storage },
                { status: 503 },
            );
        }

        const payload = parsed.data;
        let currentSnap = null;

        if (canPersistToFirestore) {
            try {
                currentSnap = await getGeminiDocRef().get();
            } catch (error) {
                console.warn('[Gemini Config POST] Failed to load current Firestore document:', error);
            }
        }

        const runtimeBeforeSave = await getGeminiRuntimeConfig();
        const currentData = currentSnap?.exists
            ? (currentSnap.data() as StoredGeminiDoc)
            : {
                apiKey: runtimeBeforeSave.apiKey,
                grokApiKey: runtimeBeforeSave.grokApiKey,
                model: runtimeBeforeSave.model,
                imageModel: runtimeBeforeSave.imageModel,
                managedPages: runtimeBeforeSave.managedPages,
            };

        const currentApiKey = typeof currentData.apiKey === 'string' ? currentData.apiKey : '';
        let nextApiKey = currentApiKey;

        if (payload.clearApiKey === true) {
            nextApiKey = '';
        } else if (payload.replaceApiKey === true) {
            nextApiKey = (payload.apiKey || '').trim();
        } else if (typeof payload.apiKey === 'string' && payload.apiKey.trim()) {
            nextApiKey = payload.apiKey.trim();
        }

        if (nextApiKey && !isLikelyGeminiApiKey(nextApiKey)) {
            return NextResponse.json(
                {
                    error:
                        'Gemini API 키 형식이 올바르지 않습니다. Google AI Studio에서 발급한 AIza... 형식의 키만 저장할 수 있습니다.',
                    storage,
                },
                { status: 400 },
            );
        }

        const currentGrokApiKey = typeof currentData.grokApiKey === 'string' ? currentData.grokApiKey : '';
        let nextGrokApiKey = currentGrokApiKey;

        if (payload.clearGrokApiKey === true) {
            nextGrokApiKey = '';
        } else if (payload.replaceGrokApiKey === true) {
            nextGrokApiKey = (payload.grokApiKey || '').trim();
        } else if (typeof payload.grokApiKey === 'string' && payload.grokApiKey.trim()) {
            nextGrokApiKey = payload.grokApiKey.trim();
        }

        if (nextGrokApiKey && !isLikelyGrokApiKey(nextGrokApiKey)) {
            return NextResponse.json(
                {
                    error: 'Grok API 키 형식이 올바르지 않습니다. xai-... 형식의 키만 저장할 수 있습니다.',
                    storage,
                },
                { status: 400 },
            );
        }

        const nextModel =
            payload.model?.trim() ||
            (typeof currentData.model === 'string' ? currentData.model : '') ||
            DEFAULT_GEMINI_MODEL;
        const nextImageModel =
            payload.imageModel?.trim() ||
            (typeof currentData.imageModel === 'string' ? currentData.imageModel : '') ||
            DEFAULT_GEMINI_IMAGE_MODEL;

        const mergedManagedPages = mergeManagedPages(
            payload.managedPages ?? currentData.managedPages,
        );

        if (canPersistToLocalEnv) {
            try {
                writeLocalEnvConfig({
                    apiKey: nextApiKey,
                    grokApiKey: nextGrokApiKey,
                    model: nextModel,
                    imageModel: nextImageModel,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return NextResponse.json(
                    { error: `.env.local 저장 실패: ${message}`, storage },
                    { status: 500 },
                );
            }

            const runtimeConfig = await getGeminiRuntimeConfig();

            return NextResponse.json({
                ok: true,
                config: {
                    source: runtimeConfig.source,
                    model: runtimeConfig.model,
                    imageModel: runtimeConfig.imageModel,
                    hasApiKey: Boolean(runtimeConfig.apiKey),
                    maskedApiKey: maskApiKey(runtimeConfig.apiKey),
                    hasGrokApiKey: Boolean(runtimeConfig.grokApiKey),
                    maskedGrokApiKey: maskApiKey(runtimeConfig.grokApiKey),
                    managedPages: mergeManagedPages(mergedManagedPages),
                    updatedAt: new Date().toISOString(),
                    updatedBy: authResult.uid,
                },
                storage,
            });
        }

        try {
            await getGeminiDocRef().set(
                {
                    apiKey: nextApiKey,
                    grokApiKey: nextGrokApiKey,
                    model: nextModel,
                    imageModel: nextImageModel,
                    managedPages: normalizeManagedPagesForStorage(mergedManagedPages),
                    updatedAt: FieldValue.serverTimestamp(),
                    updatedBy: authResult.uid,
                },
                { merge: true },
            );
        } catch (error) {
            console.error('[Gemini Config save error]', error);
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('Could not load the default credentials')) {
                return NextResponse.json(
                    { error: storage.message || message, storage },
                    { status: 503 },
                );
            }

            return NextResponse.json(
                { error: `Firestore 저장 실패: ${message}`, storage },
                { status: 500 },
            );
        }

        const runtimeConfig = await getGeminiRuntimeConfig();

        return NextResponse.json({
            ok: true,
            config: {
                source: runtimeConfig.source,
                model: runtimeConfig.model,
                imageModel: runtimeConfig.imageModel,
                hasApiKey: Boolean(runtimeConfig.apiKey),
                maskedApiKey: maskApiKey(runtimeConfig.apiKey),
                hasGrokApiKey: Boolean(runtimeConfig.grokApiKey),
                maskedGrokApiKey: maskApiKey(runtimeConfig.grokApiKey),
                managedPages: runtimeConfig.managedPages,
                updatedAt: runtimeConfig.updatedAt || null,
                updatedBy: authResult.uid,
            },
            storage,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '설정을 저장하지 못했습니다.' },
            { status: 500 },
        );
    }
}
