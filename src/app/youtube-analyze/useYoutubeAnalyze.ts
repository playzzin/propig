import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { httpsCallable } from 'firebase/functions';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
    updateDoc,
    writeBatch,
} from 'firebase/firestore';
import { db, functions } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { buildJsonAuthHeaders } from '@/lib/client-auth';

// --- Types & Schemas ---

export const FirestoreMillisSchema = z.unknown().transform((value, ctx) => {
    if (value === null || value === undefined) return Date.now();
    if (typeof value === 'number') return value;
    if (
        typeof value === 'object' &&
        value !== null &&
        'toMillis' in value &&
        typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ) {
        return (value as { toMillis: () => number }).toMillis();
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid timestamp' });
    return z.NEVER;
});

export const YoutubeArchiveSchema = z.object({
    id: z.string().optional(),
    targetType: z.enum(['video', 'channel']).optional(),
    youtubeId: z.string(),
    channelId: z.string().optional(),
    channelHandle: z.string().optional(),
    title: z.string(),
    description: z.string(),
    youtube_url: z.string(),
    thumbnail: z.object({
        default: z.string(),
        high: z.string(),
    }),
    embed: z.object({
        iframeUrl: z.string(),
        watchOnYoutubeUrl: z.string(),
    }),
    // New fields for enhanced analysis
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    keyTakeaways: z.array(z.string()).optional(),
    detailedAnalysis: z.string().optional(),
    channelName: z.string().optional(),
    createdAt: FirestoreMillisSchema,
    updatedAt: FirestoreMillisSchema,
}).passthrough();

export type SavedYoutubeArchive = z.infer<typeof YoutubeArchiveSchema> & { id: string };

// Category schema for user-managed categories
export const CategorySchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(30),
    color: z.string().optional(),
    createdAt: FirestoreMillisSchema,
});

export type YoutubeCategory = z.infer<typeof CategorySchema> & { id: string };

// Default categories (used when user has no custom ones)
export const DEFAULT_CATEGORIES = ['업무', '학습', '개인', '참고', '엔터테인먼트', '기술'];
const LEGACY_CATEGORY_NAME_MAP: Record<string, string> = {
    '?낅Т': '업무',
    '?숈뒿': '학습',
    '媛쒖씤': '개인',
    '李멸퀬': '참고',
    '?뷀꽣?뚯씤癒쇳듃': '엔터테인먼트',
    '湲곗닠': '기술',
};
const DEFAULT_CATEGORY_ID_PREFIX = '__default__:';
export type YoutubeTargetType = 'video' | 'channel';

type AnalysisSource = 'callable' | 'api';
type AnalysisStatus = 'ok' | 'fallback';

export type YoutubeAnalyzeMeta = {
    status: AnalysisStatus;
    source: AnalysisSource;
    reasonCode?: string;
    message?: string;
};

export type YoutubeAnalyzeResult = {
    title: string;
    description: string;
    category: string;
    tags: string[];
    keyTakeaways: string[];
    detailedAnalysis: string;
    channelName: string;
    _meta: YoutubeAnalyzeMeta;
};

// --- Utilities ---

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const normalizeStringArray = (value: unknown): string[] => {
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
};

const pickFirstString = (...values: unknown[]): string => {
    for (const value of values) {
        if (isNonEmptyString(value)) return value.trim();
    }
    return '';
};

const normalizeCategoryName = (value: unknown): string => {
    const trimmed = pickFirstString(value);
    return LEGACY_CATEGORY_NAME_MAP[trimmed] ?? trimmed;
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

const normalizeMillis = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (
        typeof value === 'object' &&
        value !== null &&
        'toMillis' in value &&
        typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ) {
        return (value as { toMillis: () => number }).toMillis();
    }
    return Date.now();
};

const buildDefaultCategories = (): YoutubeCategory[] =>
    DEFAULT_CATEGORIES.map((name, index) => ({
        id: `${DEFAULT_CATEGORY_ID_PREFIX}${index}`,
        name,
        color: undefined,
        createdAt: Date.now() - index,
    }));

const CHANNEL_PLACEHOLDER_THUMBNAIL = `data:image/svg+xml;utf8,${encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#111827'/><stop offset='100%' stop-color='#1f2937'/></linearGradient></defs><rect width='640' height='360' fill='url(#g)'/><circle cx='320' cy='142' r='56' fill='#ef4444'/><path d='M302 116 L352 142 L302 168 Z' fill='#ffffff'/><rect x='226' y='228' width='188' height='18' rx='9' fill='#f8fafc' opacity='0.9'/><rect x='246' y='256' width='148' height='14' rx='7' fill='#94a3b8' opacity='0.85'/></svg>",
)}`;

const ensureVideoWatchUrl = (youtubeId: string, fallback?: string): string => {
    if (isNonEmptyString(fallback)) return fallback.trim();
    if (!youtubeId) return '';
    return `https://www.youtube.com/watch?v=${youtubeId}`;
};

const parseYoutubeStartTime = (raw?: string): number | null => {
    if (!isNonEmptyString(raw)) return null;

    const input = raw.trim();
    if (!input) return null;

    if (/^\d+$/.test(input)) {
        const seconds = Number(input);
        return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    }

    const matches = [...input.matchAll(/(\d+)(h|m|s)/gi)];
    if (!matches.length) return null;

    let total = 0;
    for (const match of matches) {
        const amount = Number(match[1]);
        if (!Number.isFinite(amount)) continue;

        switch (match[2].toLowerCase()) {
            case 'h':
                total += amount * 3600;
                break;
            case 'm':
                total += amount * 60;
                break;
            case 's':
                total += amount;
                break;
            default:
                break;
        }
    }

    return total > 0 ? total : null;
};

const extractVideoIdFromEmbedUrl = (raw?: string): string => {
    if (!isNonEmptyString(raw)) return '';

    const normalizedInput = /^https?:\/\//i.test(raw) ? raw.trim() : `https://${raw.trim()}`;

    try {
        const parsed = new URL(normalizedInput);
        const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

        if (host === 'youtu.be') {
            return parsed.pathname.split('/').filter(Boolean)[0] ?? '';
        }

        if (
            host === 'youtube.com' ||
            host.endsWith('.youtube.com') ||
            host === 'youtube-nocookie.com' ||
            host.endsWith('.youtube-nocookie.com')
        ) {
            const segments = parsed.pathname.split('/').filter(Boolean);

            if (segments[0] === 'watch') {
                return parsed.searchParams.get('v')?.trim() ?? '';
            }

            if ((segments[0] === 'embed' || segments[0] === 'shorts') && segments[1]) {
                return segments[1].trim();
            }
        }
    } catch {
        return '';
    }

    return '';
};

const extractEmbedStartTime = (raw?: string): number | null => {
    if (!isNonEmptyString(raw)) return null;

    const normalizedInput = /^https?:\/\//i.test(raw) ? raw.trim() : `https://${raw.trim()}`;

    try {
        const parsed = new URL(normalizedInput);
        return (
            parseYoutubeStartTime(parsed.searchParams.get('start') ?? undefined) ??
            parseYoutubeStartTime(parsed.searchParams.get('t') ?? undefined) ??
            parseYoutubeStartTime(parsed.searchParams.get('time_continue') ?? undefined) ??
            parseYoutubeStartTime(parsed.hash.replace(/^#t=/i, ''))
        );
    } catch {
        return null;
    }
};

const buildVideoEmbedUrl = (youtubeId: string, startSeconds?: number | null): string => {
    if (!youtubeId) return '';

    const params = new URLSearchParams({
        playsinline: '1',
        rel: '0',
        modestbranding: '1',
    });

    if (startSeconds && startSeconds > 0) {
        params.set('start', String(startSeconds));
    }

    return `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
};

const ensureVideoEmbedUrl = (youtubeId: string, fallback?: string): string => {
    const resolvedYoutubeId = youtubeId || extractVideoIdFromEmbedUrl(fallback);
    if (!resolvedYoutubeId) return '';
    return buildVideoEmbedUrl(resolvedYoutubeId, extractEmbedStartTime(fallback));
};

const ensureChannelUrl = (args: {
    fallback?: string;
    channelId?: string;
    channelHandle?: string;
}): string => {
    if (isNonEmptyString(args.fallback)) return args.fallback.trim();
    if (isNonEmptyString(args.channelHandle)) {
        const normalized = args.channelHandle.trim().startsWith('@')
            ? args.channelHandle.trim()
            : `@${args.channelHandle.trim()}`;
        return `https://www.youtube.com/${normalized}`;
    }
    if (isNonEmptyString(args.channelId)) {
        return `https://www.youtube.com/channel/${args.channelId.trim()}`;
    }
    return 'https://www.youtube.com';
};

const ensureThumbnail = (
    youtubeId: string,
    rawThumbnail: unknown,
    targetType: YoutubeTargetType,
): { default: string; high: string } => {
    const record = rawThumbnail && typeof rawThumbnail === 'object'
        ? rawThumbnail as Record<string, unknown>
        : {};

    const defaultThumb = pickFirstString(
        record.default,
        targetType === 'channel' ? CHANNEL_PLACEHOLDER_THUMBNAIL : '',
        youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/default.jpg` : '',
    );
    const highThumb = pickFirstString(
        record.high,
        record.default,
        targetType === 'channel' ? CHANNEL_PLACEHOLDER_THUMBNAIL : '',
        youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : '',
    );

    return {
        default: defaultThumb,
        high: highThumb,
    };
};

const normalizeAnalysisPayload = (
    rawData: unknown,
    source: AnalysisSource,
): YoutubeAnalyzeResult => {
    const raw = rawData && typeof rawData === 'object'
        ? rawData as Record<string, unknown>
        : {};
    const summary = raw.summary && typeof raw.summary === 'object'
        ? raw.summary as Record<string, unknown>
        : {};

    const tags = normalizeStringArray(raw.tags);
    const keyTakeaways = normalizeStringArray(raw.keyTakeaways ?? summary.keyPoints);

    const metaRecord = raw._meta && typeof raw._meta === 'object'
        ? raw._meta as Record<string, unknown>
        : {};
    const status: AnalysisStatus =
        metaRecord.status === 'fallback' || metaRecord.status === 'ok'
            ? metaRecord.status
            : 'ok';

    return {
        title: pickFirstString(raw.title, 'Untitled'),
        description: pickFirstString(raw.description, summary.short, summary.oneLine),
        category: pickFirstString(
            normalizeCategoryName(raw.category),
            normalizeCategoryName(normalizeStringArray(raw.categories)[0]),
            DEFAULT_CATEGORIES[0],
        ),
        tags,
        keyTakeaways,
        detailedAnalysis: pickFirstString(raw.detailedAnalysis, summary.detailed),
        channelName: pickFirstString(raw.channelName, raw.channel),
        _meta: {
            status,
            source,
            reasonCode: pickFirstString(metaRecord.reasonCode),
            message: pickFirstString(metaRecord.message),
        },
    };
};

const normalizeArchiveFromRaw = (docId: string, raw: Record<string, unknown>): SavedYoutubeArchive => {
    const legacySummary = raw.summary && typeof raw.summary === 'object'
        ? raw.summary as Record<string, unknown>
        : {};
    const legacyEmbed = raw.embed && typeof raw.embed === 'object'
        ? raw.embed as Record<string, unknown>
        : {};

    const rawUrl = pickFirstString(
        raw.youtube_url,
        raw.url,
        raw.watchUrl,
        legacyEmbed.watchOnYoutubeUrl,
    );
    const parsedFromUrl = rawUrl ? parseYoutubeTarget(rawUrl) : { ok: false as const, reason: '' };
    const explicitType = pickFirstString(raw.targetType, raw.itemType).toLowerCase();

    const targetType: YoutubeTargetType = explicitType === 'channel'
        ? 'channel'
        : explicitType === 'video'
            ? 'video'
            : parsedFromUrl.ok
                ? parsedFromUrl.targetType
                : 'video';

    const parsedVideo = parsedFromUrl.ok && parsedFromUrl.targetType === 'video'
        ? parsedFromUrl
        : null;
    const parsedChannel = parsedFromUrl.ok && parsedFromUrl.targetType === 'channel'
        ? parsedFromUrl
        : null;

    const youtubeId = targetType === 'video'
        ? pickFirstString(raw.youtubeId, parsedVideo?.youtubeId ?? '')
        : '';
    const channelId = targetType === 'channel'
        ? pickFirstString(raw.channelId, parsedChannel?.channelId ?? '')
        : '';
    const channelHandle = targetType === 'channel'
        ? pickFirstString(raw.channelHandle, parsedChannel?.channelHandle ?? '')
        : '';

    const youtubeUrl = targetType === 'video'
        ? ensureVideoWatchUrl(
            youtubeId,
            pickFirstString(raw.youtube_url, legacyEmbed.watchOnYoutubeUrl, parsedVideo?.canonicalUrl ?? ''),
        )
        : ensureChannelUrl({
            fallback: pickFirstString(raw.youtube_url, legacyEmbed.watchOnYoutubeUrl, parsedChannel?.canonicalUrl ?? ''),
            channelId,
            channelHandle,
        });

    const iframeUrl = targetType === 'video'
        ? ensureVideoEmbedUrl(
            youtubeId,
            pickFirstString(legacyEmbed.iframeUrl, parsedVideo?.iframeBaseUrl ?? ''),
        )
        : '';

    const keyTakeaways = normalizeStringArray(
        raw.keyTakeaways ?? legacySummary.keyPoints,
    );
    const detailedAnalysis = pickFirstString(raw.detailedAnalysis, legacySummary.detailed);
    const tags = normalizeStringArray(raw.tags);
    const legacyCategories = normalizeStringArray(raw.categories);

    const normalized: SavedYoutubeArchive = {
        id: docId,
        targetType,
        youtubeId,
        channelId: channelId || undefined,
        channelHandle: channelHandle || undefined,
        title: pickFirstString(
            raw.title,
            raw.video_title,
            targetType === 'channel'
                ? pickFirstString(channelHandle, channelId, 'YouTube Channel')
                : 'Untitled',
        ),
        description: pickFirstString(raw.description, legacySummary.short, legacySummary.oneLine, legacySummary.detailed),
        youtube_url: youtubeUrl,
        thumbnail: ensureThumbnail(youtubeId, raw.thumbnail, targetType),
        embed: {
            iframeUrl,
            watchOnYoutubeUrl: youtubeUrl,
        },
        category: pickFirstString(raw.category, legacyCategories[0]),
        tags,
        keyTakeaways,
        detailedAnalysis,
        channelName: pickFirstString(
            raw.channelName,
            raw.channel,
            targetType === 'channel' ? channelHandle : '',
        ),
        createdAt: normalizeMillis(raw.createdAt),
        updatedAt: normalizeMillis(raw.updatedAt),
    };

    const validated = YoutubeArchiveSchema.safeParse(normalized);
    if (validated.success) {
        return { id: docId, ...validated.data };
    }

    return normalized;
};

type ParsedYoutubeVideoTarget = {
    targetType: 'video';
    youtubeId: string;
    canonicalUrl: string;
    iframeBaseUrl: string;
    thumbnail: {
        default: string;
        high: string;
    };
};

type ParsedYoutubeChannelTarget = {
    targetType: 'channel';
    canonicalUrl: string;
    channelId?: string;
    channelHandle?: string;
};

type ParsedYoutubeTarget = ParsedYoutubeVideoTarget | ParsedYoutubeChannelTarget;

const buildParsedVideoTarget = (youtubeId: string): ParsedYoutubeVideoTarget => ({
    targetType: 'video',
    youtubeId,
    canonicalUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    iframeBaseUrl: buildVideoEmbedUrl(youtubeId),
    thumbnail: {
        default: `https://i.ytimg.com/vi/${youtubeId}/default.jpg`,
        high: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    },
});

export const parseYoutubeTarget = (raw: string): ({ ok: true } & ParsedYoutubeTarget) | { ok: false; reason: string } => {
    const input = raw.trim();
    if (!input) return { ok: false as const, reason: 'YouTube URL을 입력해 주세요.' };

    const normalizedInput = /^https?:\/\//i.test(input) ? input : `https://${input}`;

    let parsed: URL;
    try {
        parsed = new URL(normalizedInput);
    } catch {
        return { ok: false as const, reason: '올바른 URL 형식이 아닙니다.' };
    }

    if (parsed.hostname === 'youtu.be') {
        const id = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
        if (!id) return { ok: false as const, reason: 'YouTube URL에서 video id를 추출하지 못했습니다.' };
        return { ok: true as const, ...buildParsedVideoTarget(id) };
    }

    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const isYoutubeHost =
        host === 'youtube.com' ||
        host.endsWith('.youtube.com') ||
        host === 'youtube-nocookie.com' ||
        host.endsWith('.youtube-nocookie.com');

    if (!isYoutubeHost) {
        return { ok: false as const, reason: 'YouTube URL만 분석할 수 있습니다.' };
    }

    const videoId = parsed.searchParams.get('v');
    if (videoId?.trim()) {
        return { ok: true as const, ...buildParsedVideoTarget(videoId.trim()) };
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    const [first, second] = parts;

    if ((first === 'shorts' || first === 'embed' || first === 'live') && second) {
        return { ok: true as const, ...buildParsedVideoTarget(second) };
    }

    if (first && first.startsWith('@')) {
        const handle = first;
        return {
            ok: true as const,
            targetType: 'channel',
            canonicalUrl: `https://www.youtube.com/${handle}`,
            channelHandle: handle,
        };
    }

    if ((first === 'channel' || first === 'c' || first === 'user') && second) {
        return {
            ok: true as const,
            targetType: 'channel',
            canonicalUrl: `https://www.youtube.com/${first}/${second}`,
            channelId: first === 'channel' ? second : undefined,
        };
    }

    return {
        ok: false as const,
        reason: 'YouTube 영상 또는 채널 URL을 입력해 주세요.',
    };
};

export const extractYoutubeIdFromUrl = (youtubeUrl: string): string | null => {
    const parsed = parseYoutubeTarget(youtubeUrl);
    return parsed.ok && parsed.targetType === 'video' ? parsed.youtubeId : null;
};

export const parseYoutubeId = (raw: string) => {
    const parsed = parseYoutubeTarget(raw);
    if (!parsed.ok) return parsed;

    if (parsed.targetType !== 'video') {
        return { ok: false as const, reason: '영상 URL을 입력해 주세요. (채널 URL은 영상 ID 추출 대상이 아닙니다.)' };
    }

    return {
        ok: true as const,
        youtubeId: parsed.youtubeId,
        watchUrl: parsed.canonicalUrl,
        iframeBaseUrl: parsed.iframeBaseUrl,
        thumbnail: parsed.thumbnail,
    };
};

// --- Hook ---

export function useYoutubeAnalyze() {
    const { currentUser } = useAuth();
    const [savedItems, setSavedItems] = useState<SavedYoutubeArchive[]>([]);
    const [categories, setCategories] = useState<YoutubeCategory[]>([]);
    const categoryInitializationRef = useRef<Promise<YoutubeCategory[]> | null>(null);

    // Firestore Sync: Archives
    useEffect(() => {
        if (!currentUser?.uid) {
            setSavedItems([]);
            return;
        }

        const q = query(
            collection(db, 'users', currentUser.uid, 'youtubeAnalyses'),
            orderBy('createdAt', 'desc'),
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const nextItems: SavedYoutubeArchive[] = [];
            for (const docSnap of snapshot.docs) {
                const raw = docSnap.data() as Record<string, unknown>;
                nextItems.push(normalizeArchiveFromRaw(docSnap.id, raw));
            }
            setSavedItems(nextItems);
        });

        return unsubscribe;
    }, [currentUser?.uid]);

    // Firestore Sync: Categories
    useEffect(() => {
        if (!currentUser?.uid) {
            setCategories([]);
            return;
        }

        const q = query(
            collection(db, 'users', currentUser.uid, 'youtubeCategories'),
            orderBy('createdAt', 'desc'),
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const nextCats: YoutubeCategory[] = [];
            for (const docSnap of snapshot.docs) {
                const raw = docSnap.data();
                nextCats.push({
                    id: docSnap.id,
                    name: raw.name || '',
                    color: raw.color || undefined,
                    createdAt: raw.createdAt || Date.now(),
                });
            }
            setCategories(nextCats);
        });

        return unsubscribe;
    }, [currentUser?.uid]);

    const baseCategories = categories.length > 0
        ? categories
        : buildDefaultCategories();
    const manageableCategories = (() => {
        const knownNames = new Set(baseCategories.map((category) => category.name));
        const nextCategories = [...baseCategories];

        for (const item of savedItems) {
            const categoryName = item.category?.trim();
            if (!categoryName || knownNames.has(categoryName)) continue;

            knownNames.add(categoryName);
            nextCategories.push({
                id: `__archive__:${encodeURIComponent(categoryName)}`,
                name: categoryName,
                color: undefined,
                createdAt: Date.now() - nextCategories.length,
            });
        }

        return nextCategories;
    })();

    // Get all category names (user categories + defaults if none exist)
    const categoryNames = manageableCategories.map((category) => category.name);

    const ensureStoredCategories = useCallback(async () => {
        if (!currentUser?.uid) return [];
        if (categories.length > 0) return categories;
        if (categoryInitializationRef.current) {
            return categoryInitializationRef.current;
        }

        const categoryCollection = collection(db, 'users', currentUser.uid, 'youtubeCategories');
        const baseMillis = Date.now();
        const initializationPromise = Promise.all(
            DEFAULT_CATEGORIES.map(async (name, index) => {
                const createdAt = Timestamp.fromMillis(baseMillis + (DEFAULT_CATEGORIES.length - index));
                const ref = await addDoc(categoryCollection, {
                    name,
                    color: '',
                    createdAt,
                });

                return {
                    id: ref.id,
                    name,
                    color: undefined,
                    createdAt: createdAt.toMillis(),
                };
            }),
        ).finally(() => {
            categoryInitializationRef.current = null;
        });

        categoryInitializationRef.current = initializationPromise;
        return initializationPromise;
    }, [categories, currentUser?.uid]);

    const resolveStoredCategory = useCallback(async (catId: string, fallbackName: string) => {
        const storedCategories = await ensureStoredCategories();
        const matchedCategory = storedCategories.find((category) => category.id === catId)
            ?? storedCategories.find((category) => category.name === fallbackName);
        if (matchedCategory) {
            return matchedCategory;
        }
        if (!currentUser?.uid || !fallbackName.trim()) {
            return null;
        }

        const createdAt = Timestamp.now();
        const ref = await addDoc(collection(db, 'users', currentUser.uid, 'youtubeCategories'), {
            name: fallbackName.trim(),
            color: '',
            createdAt,
        });

        return {
            id: ref.id,
            name: fallbackName.trim(),
            color: undefined,
            createdAt: createdAt.toMillis(),
        };
    }, [currentUser?.uid, ensureStoredCategories]);

    const syncArchiveCategoryName = useCallback(async (previousName: string, nextName: string) => {
        if (!currentUser?.uid || previousName === nextName) return 0;

        const matchingItems = savedItems.filter((item) => item.category === previousName);
        if (!matchingItems.length) return 0;

        const updatedAt = Timestamp.now();
        for (let index = 0; index < matchingItems.length; index += 450) {
            const batch = writeBatch(db);
            for (const item of matchingItems.slice(index, index + 450)) {
                batch.update(doc(db, 'users', currentUser.uid, 'youtubeAnalyses', item.id), {
                    category: nextName,
                    updatedAt,
                });
            }
            await batch.commit();
        }

        return matchingItems.length;
    }, [currentUser?.uid, savedItems]);

    const analyzeWithCallable = useCallback(async (youtubeUrl: string): Promise<YoutubeAnalyzeResult> => {
        const callable = httpsCallable(functions, 'analyzeYoutubeVideo');
        const { data } = await callable({
            youtube_url: youtubeUrl,
        });

        const normalized = normalizeAnalysisPayload(data, 'callable');
        if (!normalized.keyTakeaways.length && !normalized.detailedAnalysis) {
            throw new Error('Callable 응답에 핵심 분석 필드가 없습니다.');
        }

        return normalized;
    }, []);

    const analyzeWithApi = useCallback(async (
        youtubeUrl: string,
        targetType: YoutubeTargetType,
    ): Promise<YoutubeAnalyzeResult> => {
        const res = await fetch('/api/analyze-bookmark', {
            method: 'POST',
            headers: await buildJsonAuthHeaders(currentUser),
            body: JSON.stringify({
                url: youtubeUrl,
                categories: categoryNames,
                detailed: true,
                requireAI: true,
                targetType,
            }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
            const message = payload && typeof payload.error === 'string'
                ? payload.error
                : `AI 분석 실패 (HTTP ${res.status})`;
            throw new Error(message);
        }

        const normalized = normalizeAnalysisPayload(payload, 'api');
        if (normalized._meta.status === 'fallback') {
            throw new Error(
                normalized._meta.message ||
                '분석 엔진이 fallback 모드로 응답했습니다. Gemini 설정을 확인하세요.',
            );
        }

        return normalized;
    }, [categoryNames, currentUser]);

    const analyzeVideo = useCallback(async (youtubeUrl: string): Promise<YoutubeAnalyzeResult> => {
        const parsed = parseYoutubeTarget(youtubeUrl);
        if (!parsed.ok) {
            throw new Error(parsed.reason);
        }

        const canonicalUrl = parsed.canonicalUrl;

        if (parsed.targetType === 'channel') {
            return analyzeWithApi(canonicalUrl, 'channel');
        }

        const errors: string[] = [];

        try {
            return await analyzeWithCallable(canonicalUrl);
        } catch (error) {
            errors.push(`callable 실패: ${getErrorMessage(error)}`);
        }

        try {
            return await analyzeWithApi(canonicalUrl, 'video');
        } catch (error) {
            errors.push(`api 실패: ${getErrorMessage(error)}`);
        }

        throw new Error(errors.join(' | '));
    }, [analyzeWithApi, analyzeWithCallable]);

    // Create archive
    const createArchive = useCallback(async (params: {
        youtube_url: string;
        title?: string;
        description?: string;
        category?: string;
        tags?: string[];
        keyTakeaways?: string[];
        detailedAnalysis?: string;
        channelName?: string;
    }) => {
        if (!currentUser?.uid) {
            toast.error('로그인이 필요합니다.');
            return;
        }

        const parsed = parseYoutubeTarget(params.youtube_url);
        if (!parsed.ok) {
            toast.error(parsed.reason);
            throw new Error(parsed.reason);
        }

        const isVideoTarget = parsed.targetType === 'video';
        const channelId = parsed.targetType === 'channel' ? parsed.channelId || '' : '';
        const channelHandle = parsed.targetType === 'channel' ? parsed.channelHandle || '' : '';
        const defaultTitle = isVideoTarget
            ? 'Untitled Video'
            : pickFirstString(params.channelName, channelHandle, channelId, 'YouTube Channel');

        const newArchive = {
            targetType: parsed.targetType,
            youtubeId: isVideoTarget ? parsed.youtubeId : '',
            channelId,
            channelHandle,
            title: params.title?.trim() || defaultTitle,
            description: params.description?.trim() || '',
            youtube_url: parsed.canonicalUrl,
            thumbnail: isVideoTarget
                ? parsed.thumbnail
                : {
                    default: CHANNEL_PLACEHOLDER_THUMBNAIL,
                    high: CHANNEL_PLACEHOLDER_THUMBNAIL,
                },
            embed: {
                iframeUrl: isVideoTarget ? parsed.iframeBaseUrl : '',
                watchOnYoutubeUrl: parsed.canonicalUrl,
            },
            category: params.category || '',
            tags: params.tags || [],
            keyTakeaways: params.keyTakeaways || [],
            detailedAnalysis: params.detailedAnalysis || '',
            channelName: params.channelName?.trim() || (parsed.targetType === 'channel' ? pickFirstString(channelHandle, channelId) : ''),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        try {
            await addDoc(collection(db, 'users', currentUser.uid, 'youtubeAnalyses'), newArchive);
            toast.success(parsed.targetType === 'video' ? '영상이 저장되었습니다.' : '채널이 저장되었습니다.');
            return newArchive;
        } catch (error) {
            toast.error('저장 실패: ' + String(error));
            throw error;
        }
    }, [currentUser?.uid]);

    // Update existing archive (for re-analysis)
    const updateArchive = useCallback(async (itemId: string, updates: Partial<SavedYoutubeArchive>) => {
        if (!currentUser?.uid) return;
        try {
            const docRef = doc(db, 'users', currentUser.uid, 'youtubeAnalyses', itemId);
            await updateDoc(docRef, {
                ...updates,
                updatedAt: Timestamp.now(),
            });
            toast.success('업데이트 완료');
        } catch (error) {
            toast.error('업데이트 실패: ' + String(error));
            throw error;
        }
    }, [currentUser?.uid]);

    // Delete archive
    const deleteArchive = useCallback(async (itemId: string) => {
        if (!currentUser?.uid) return;
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'youtubeAnalyses', itemId));
            toast.success('삭제 완료');
        } catch (error) {
            toast.error('삭제 실패: ' + String(error));
        }
    }, [currentUser?.uid]);

    // Re-analyze an existing item using Gemini API
    const reAnalyze = useCallback(async (item: SavedYoutubeArchive) => {
        try {
            const targetUrl = pickFirstString(
                item.youtube_url,
                item.embed?.watchOnYoutubeUrl,
                item.targetType === 'channel'
                    ? ensureChannelUrl({ channelId: item.channelId, channelHandle: item.channelHandle })
                    : '',
                item.youtubeId ? `https://www.youtube.com/watch?v=${item.youtubeId}` : '',
            );
            if (!targetUrl) {
                throw new Error('재분석할 YouTube URL이 없습니다.');
            }

            const analyzed = await analyzeVideo(targetUrl);
            const parsedTarget = parseYoutubeTarget(targetUrl);
            const keyTakeaways = analyzed.keyTakeaways;
            const detailedAnalysis = analyzed.detailedAnalysis;
            const canonicalUrl = parsedTarget.ok ? parsedTarget.canonicalUrl : targetUrl;

            await updateArchive(item.id, {
                targetType: parsedTarget.ok ? parsedTarget.targetType : item.targetType,
                youtubeId: parsedTarget.ok && parsedTarget.targetType === 'video' ? parsedTarget.youtubeId : '',
                channelId: parsedTarget.ok && parsedTarget.targetType === 'channel' ? parsedTarget.channelId || '' : '',
                channelHandle: parsedTarget.ok && parsedTarget.targetType === 'channel' ? parsedTarget.channelHandle || '' : '',
                title: analyzed.title || item.title,
                description: analyzed.description || item.description,
                category: analyzed.category || item.category,
                tags: analyzed.tags.length > 0 ? analyzed.tags : item.tags,
                keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : item.keyTakeaways,
                detailedAnalysis: detailedAnalysis || item.detailedAnalysis,
                channelName: analyzed.channelName || item.channelName,
                youtube_url: canonicalUrl,
                thumbnail: parsedTarget.ok
                    ? parsedTarget.targetType === 'video'
                        ? parsedTarget.thumbnail
                        : ensureThumbnail('', item.thumbnail, 'channel')
                    : item.thumbnail,
                embed: parsedTarget.ok
                    ? parsedTarget.targetType === 'video'
                        ? {
                            iframeUrl: parsedTarget.iframeBaseUrl,
                            watchOnYoutubeUrl: parsedTarget.canonicalUrl,
                        }
                        : {
                            iframeUrl: '',
                            watchOnYoutubeUrl: parsedTarget.canonicalUrl,
                        }
                    : item.embed,
            });

            return {
                ...analyzed,
                keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : item.keyTakeaways,
                detailedAnalysis: detailedAnalysis || item.detailedAnalysis,
                youtube_url: canonicalUrl,
            };
        } catch (error) {
            toast.error('AI 재분석 실패: ' + getErrorMessage(error));
            throw error;
        }
    }, [analyzeVideo, updateArchive]);

    // Category CRUD
    const addCategory = useCallback(async (name: string, color?: string) => {
        if (!currentUser?.uid) return;
        const trimmed = name.trim();
        if (categoryNames.some((categoryName) => categoryName === trimmed)) {
            toast.error('이미 존재하는 카테고리입니다.');
            return;
        }
        if (!trimmed) { toast.error('카테고리 이름을 입력해주세요.'); return; }
        if (categories.some(c => c.name === trimmed)) { toast.error('이미 존재하는 카테고리입니다.'); return; }

        if (categories.length === 0) {
            await ensureStoredCategories();
        }

        await addDoc(collection(db, 'users', currentUser.uid, 'youtubeCategories'), {
            name: trimmed,
            color: color || '',
            createdAt: Timestamp.now(),
        });
        toast.success(`'${trimmed}' 카테고리 추가됨`);
    }, [categories, categoryNames, currentUser?.uid, ensureStoredCategories]);

    const updateCategory = useCallback(async (catId: string, name: string, color?: string) => {
        if (!currentUser?.uid) return null;

        try {
            const currentCategory = manageableCategories.find((category) => category.id === catId);
            if (!currentCategory) {
                toast.error('카테고리를 찾을 수 없습니다.');
                return null;
            }

            const trimmed = name.trim();
            if (!trimmed) {
                toast.error('카테고리 이름을 입력해주세요.');
                return null;
            }

            if (manageableCategories.some((category) => category.id !== catId && category.name === trimmed)) {
                toast.error('이미 존재하는 카테고리입니다.');
                return null;
            }

            const storedCategory = await resolveStoredCategory(catId, currentCategory.name);
            if (!storedCategory) {
                toast.error('카테고리를 찾을 수 없습니다.');
                return null;
            }

            if (currentCategory.name !== trimmed) {
                await syncArchiveCategoryName(currentCategory.name, trimmed);
            }

            await updateDoc(doc(db, 'users', currentUser.uid, 'youtubeCategories', storedCategory.id), {
                name: trimmed,
                ...(color !== undefined ? { color } : {}),
            });

            toast.success(`'${currentCategory.name}' 카테고리 수정됨`);
            return { previousName: currentCategory.name, nextName: trimmed };
        } catch (error) {
            toast.error('카테고리 수정 실패: ' + getErrorMessage(error));
            return null;
        }
    }, [currentUser?.uid, manageableCategories, resolveStoredCategory, syncArchiveCategoryName]);

    const deleteCategory = useCallback(async (catId: string) => {
        if (!currentUser?.uid) return null;

        try {
            const currentCategory = manageableCategories.find((category) => category.id === catId);
            if (!currentCategory) {
                toast.error('카테고리를 찾을 수 없습니다.');
                return null;
            }

            const storedCategory = await resolveStoredCategory(catId, currentCategory.name);
            if (!storedCategory) {
                toast.error('카테고리를 찾을 수 없습니다.');
                return null;
            }

            await syncArchiveCategoryName(currentCategory.name, '');
            await deleteDoc(doc(db, 'users', currentUser.uid, 'youtubeCategories', storedCategory.id));
            toast.success(`'${currentCategory.name}' 카테고리 삭제됨`);
            return currentCategory.name;
        } catch (error) {
            toast.error('카테고리 삭제 실패: ' + getErrorMessage(error));
            return null;
        }
    }, [currentUser?.uid, manageableCategories, resolveStoredCategory, syncArchiveCategoryName]);

    return {
        savedItems,
        categories: manageableCategories,
        categoryNames,
        createArchive,
        updateArchive,
        deleteArchive,
        analyzeVideo,
        reAnalyze,
        addCategory,
        updateCategory,
        deleteCategory,
        currentUser,
    };
}
