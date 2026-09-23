import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Timestamp } from 'firebase-admin/firestore';
import { db as adminDb, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import {
    AISettingsDocument,
    DEFAULT_OPENROUTER_IMAGE_MODEL,
    DEFAULT_OPENROUTER_MODEL,
    ManagedApiPage,
    mergeManagedPages,
} from '@/lib/ai-config';

export interface AIRuntimeConfig {
    openRouterApiKey: string;
    model: string;
    imageModel: string;
    fallbackModels: string[];
    source: 'functions_env' | 'server_env' | 'none';
    managedPages: ManagedApiPage[];
    updatedAt?: string;
}

type ParsedRuntimeEnv = {
    openRouterApiKey?: string;
    model?: string;
    imageModel?: string;
    fallbackModels?: string[];
};

let cachedFunctionsEnv: ParsedRuntimeEnv | null = null;

const parseFallbackModels = (value: string | undefined): string[] =>
    value
        ? Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)))
        : [];

const parseEnvFiles = (candidates: string[]): ParsedRuntimeEnv => {
    const parsed: ParsedRuntimeEnv = {};

    for (const filePath of candidates) {
        if (!existsSync(filePath)) continue;
        try {
            for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const separatorIndex = trimmed.indexOf('=');
                if (separatorIndex <= 0) continue;

                const key = trimmed.slice(0, separatorIndex).trim();
                const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
                if (key === 'OPENROUTER_API_KEY' && parsed.openRouterApiKey === undefined) parsed.openRouterApiKey = value;
                if (key === 'OPENROUTER_MODEL' && parsed.model === undefined) parsed.model = value;
                if (key === 'OPENROUTER_IMAGE_MODEL' && parsed.imageModel === undefined) parsed.imageModel = value;
                if (key === 'OPENROUTER_FALLBACK_MODELS' && parsed.fallbackModels === undefined) {
                    parsed.fallbackModels = parseFallbackModels(value);
                }
            }
        } catch {
            // A missing or unreadable development env file must not break production runtime config.
        }
    }

    return parsed;
};

const getFunctionsEnv = (): ParsedRuntimeEnv => {
    if (!cachedFunctionsEnv) {
        cachedFunctionsEnv = parseEnvFiles([
            join(process.cwd(), 'functions', '.env.local'),
            join(process.cwd(), 'functions', '.env'),
        ]);
    }
    return cachedFunctionsEnv;
};

const getProjectEnv = (): ParsedRuntimeEnv =>
    parseEnvFiles([join(process.cwd(), '.env.local'), join(process.cwd(), '.env')]);

const normalizeModelId = (model: string): string => {
    const trimmed = model.trim();
    if (!trimmed) return '';
    return trimmed;
};

const normalizeUpdatedAt = (value: unknown): string | undefined => {
    if (!value) return undefined;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (typeof value === 'object' && value && 'toDate' in value) {
        try {
            return (value as { toDate: () => Date }).toDate().toISOString();
        } catch {
            return undefined;
        }
    }
    return undefined;
};

const loadAISettings = async (): Promise<AISettingsDocument | null> => {
    if (!getFirebaseAdminStatus().canPersistToFirestore) return null;
    try {
        const aiSettings = await adminDb.collection('system_settings').doc('ai').get();
        if (aiSettings.exists) return aiSettings.data() as AISettingsDocument;
        return null;
    } catch {
        return null;
    }
};

export const getAIRuntimeConfig = async (): Promise<AIRuntimeConfig> => {
    const functionsEnv = getFunctionsEnv();
    const projectEnv = getProjectEnv();
    const stored = await loadAISettings();

    const rawServerKey = projectEnv.openRouterApiKey ?? process.env.OPENROUTER_API_KEY ?? '';
    const openRouterApiKey = functionsEnv.openRouterApiKey || rawServerKey.trim();

    const storedModel = typeof stored?.model === 'string' ? normalizeModelId(stored.model) : '';
    const storedImageModel = typeof stored?.imageModel === 'string' ? normalizeModelId(stored.imageModel) : '';
    const storedFallbackModels = Array.isArray(stored?.fallbackModels)
        ? stored.fallbackModels.filter((model): model is string => typeof model === 'string').map(normalizeModelId).filter(Boolean)
        : [];

    const model =
        storedModel ||
        normalizeModelId(functionsEnv.model || '') ||
        normalizeModelId(projectEnv.model || process.env.OPENROUTER_MODEL || '') ||
        DEFAULT_OPENROUTER_MODEL;
    const imageModel =
        storedImageModel ||
        normalizeModelId(functionsEnv.imageModel || '') ||
        normalizeModelId(projectEnv.imageModel || process.env.OPENROUTER_IMAGE_MODEL || '') ||
        DEFAULT_OPENROUTER_IMAGE_MODEL;
    const fallbackModels = Array.from(
        new Set([
            ...storedFallbackModels,
            ...(functionsEnv.fallbackModels || []),
            ...(projectEnv.fallbackModels || parseFallbackModels(process.env.OPENROUTER_FALLBACK_MODELS)),
        ].map(normalizeModelId).filter((candidate) => candidate && candidate !== model)),
    );

    return {
        openRouterApiKey,
        model,
        imageModel,
        fallbackModels,
        source: functionsEnv.openRouterApiKey ? 'functions_env' : openRouterApiKey ? 'server_env' : 'none',
        managedPages: mergeManagedPages(stored?.managedPages),
        updatedAt: normalizeUpdatedAt(stored?.updatedAt),
    };
};
