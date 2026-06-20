import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Timestamp } from 'firebase-admin/firestore';
import { db as adminDb, getFirebaseAdminStatus } from '@/lib/firebase-admin';
import {
    DEFAULT_GEMINI_IMAGE_MODEL,
    DEFAULT_GEMINI_MODEL,
    GeminiSettingsDocument,
    ManagedApiPage,
    mergeManagedPages,
} from '@/lib/gemini-config';

export interface GeminiRuntimeConfig {
    apiKey: string;
    grokApiKey: string;
    model: string;
    imageModel: string;
    source: 'firestore' | 'functions_env' | 'server_env' | 'public_env' | 'none';
    managedPages: ManagedApiPage[];
    updatedAt?: string;
}

type ParsedGeminiEnv = {
    apiKey?: string;
    grokApiKey?: string;
    model?: string;
    imageModel?: string;
};

let cachedFunctionsEnv: ParsedGeminiEnv | null = null;

const parseEnvFiles = (candidates: string[]): ParsedGeminiEnv => {
    const parsed: ParsedGeminiEnv = {};

    for (const filePath of candidates) {
        if (!existsSync(filePath)) continue;
        try {
            const content = readFileSync(filePath, 'utf8');
            const lines = content.split(/\r?\n/);

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;

                const separatorIndex = trimmed.indexOf('=');
                if (separatorIndex <= 0) continue;

                const key = trimmed.slice(0, separatorIndex).trim();
                const rawValue = trimmed.slice(separatorIndex + 1).trim();
                const value = rawValue.replace(/^['"]|['"]$/g, '');

                if ((key === 'GEMINI_API_KEY' || key === 'GOOGLE_API_KEY') && parsed.apiKey === undefined) {
                    parsed.apiKey = value;
                }
                if (key === 'GROK_API_KEY' && parsed.grokApiKey === undefined) {
                    parsed.grokApiKey = value;
                }
                if (key === 'GEMINI_MODEL' && parsed.model === undefined) {
                    parsed.model = value;
                }
                if (key === 'GEMINI_IMAGE_MODEL' && parsed.imageModel === undefined) {
                    parsed.imageModel = value;
                }
            }
        } catch {
            // Ignore parse failure and try next candidate.
        }
    }

    return parsed;
};

const parseFunctionsEnv = (): ParsedGeminiEnv => {
    if (cachedFunctionsEnv) {
        return cachedFunctionsEnv;
    }

    cachedFunctionsEnv = parseEnvFiles([
        join(process.cwd(), 'functions', '.env.local'),
        join(process.cwd(), 'functions', '.env'),
    ]);

    return cachedFunctionsEnv;
};

const parseProjectEnv = (): ParsedGeminiEnv => {
    const parsed = parseEnvFiles([
        join(process.cwd(), '.env.local'),
        join(process.cwd(), '.env'),
    ]);

    return parsed;
};

const isLikelyGeminiApiKey = (value: string): boolean => /^AIza[0-9A-Za-z_-]{20,}$/.test(value);

const isLikelyGrokApiKey = (value: string): boolean => /^xai-[0-9A-Za-z_-]{20,}$/.test(value);

const normalizeUpdatedAt = (value: unknown): string | undefined => {
    if (!value) return undefined;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (typeof value === 'object' && value && 'toDate' in value) {
        try {
            const date = (value as { toDate: () => Date }).toDate();
            return date.toISOString();
        } catch {
            return undefined;
        }
    }
    return undefined;
};

const loadFirestoreGeminiConfig = async (): Promise<GeminiSettingsDocument | null> => {
    if (!getFirebaseAdminStatus().canPersistToFirestore) {
        return null;
    }

    try {
        const snap = await adminDb.collection('system_settings').doc('gemini').get();
        if (!snap.exists) return null;
        return snap.data() as GeminiSettingsDocument;
    } catch {
        return null;
    }
};

export const getGeminiRuntimeConfig = async (): Promise<GeminiRuntimeConfig> => {
    const functionsEnv = parseFunctionsEnv();
    const projectEnv = parseProjectEnv();
    const firestoreConfig = await loadFirestoreGeminiConfig();

    const firestoreApiKey =
        typeof firestoreConfig?.apiKey === 'string' ? firestoreConfig.apiKey.trim() : '';
    const firestoreGrokApiKey =
        typeof firestoreConfig?.grokApiKey === 'string' ? firestoreConfig.grokApiKey.trim() : '';
    const firestoreModel =
        typeof firestoreConfig?.model === 'string' ? firestoreConfig.model.trim() : '';
    const firestoreImageModel =
        typeof firestoreConfig?.imageModel === 'string'
            ? firestoreConfig.imageModel.trim()
            : '';

    const rawServerApiKey =
        projectEnv.apiKey !== undefined
            ? projectEnv.apiKey
            : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const publicApiKey =
        process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
        '';

    const rawServerGrokApiKey =
        projectEnv.grokApiKey !== undefined ? projectEnv.grokApiKey : process.env.GROK_API_KEY || '';
    const publicGrokApiKey = process.env.NEXT_PUBLIC_GROK_API_KEY || '';
    const serverApiKey = isLikelyGeminiApiKey(rawServerApiKey.trim()) ? rawServerApiKey.trim() : '';
    const serverGrokApiKey = isLikelyGrokApiKey(rawServerGrokApiKey.trim())
        ? rawServerGrokApiKey.trim()
        : '';

    // Runtime priority: Firestore > functions env > server env > public env
    const apiKey = firestoreApiKey || functionsEnv.apiKey || serverApiKey || publicApiKey || '';
    const grokApiKey = firestoreGrokApiKey || functionsEnv.grokApiKey || serverGrokApiKey || publicGrokApiKey || '';
    const source: GeminiRuntimeConfig['source'] = firestoreApiKey
        ? 'firestore'
        : functionsEnv.apiKey
            ? 'functions_env'
            : serverApiKey
                ? 'server_env'
                : publicApiKey
                    ? 'public_env'
                    : 'none';

    const model =
        firestoreModel ||
        functionsEnv.model ||
        projectEnv.model ||
        process.env.GEMINI_MODEL ||
        process.env.NEXT_PUBLIC_GEMINI_MODEL ||
        DEFAULT_GEMINI_MODEL;

    const imageModel =
        firestoreImageModel ||
        functionsEnv.imageModel ||
        projectEnv.imageModel ||
        process.env.GEMINI_IMAGE_MODEL ||
        process.env.NEXT_PUBLIC_GEMINI_IMAGE_MODEL ||
        DEFAULT_GEMINI_IMAGE_MODEL;

    return {
        apiKey,
        grokApiKey,
        model,
        imageModel,
        source,
        managedPages: mergeManagedPages(firestoreConfig?.managedPages),
        updatedAt: normalizeUpdatedAt(firestoreConfig?.updatedAt),
    };
};
