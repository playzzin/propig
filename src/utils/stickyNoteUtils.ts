
import { StickyNote } from '../types/stickyNote';

export const createId = (): string => {
    const cryptoObj: Crypto | undefined = typeof window !== 'undefined' ? window.crypto : undefined;
    if (cryptoObj && 'randomUUID' in cryptoObj && typeof cryptoObj.randomUUID === 'function') {
        return cryptoObj.randomUUID();
    }
    return `note_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const normalizeTag = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const normalizeTagKey = (value: string): string => normalizeTag(value).toLowerCase();

export const uniqueTags = (tags: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const raw of tags) {
        const normalized = normalizeTag(raw);
        if (!normalized) continue;

        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }

    return result;
};

export const getMaxZIndex = (notes: StickyNote[]): number => {
    if (notes.length === 0) return 1;
    return Math.max(...notes.map((n) => n.zIndex));
};

export const getStorageKey = (uid: string | null): string => {
    const safeUid = uid ?? 'anonymous';
    return `sticky_notes:v1:${safeUid}`;
};

export const getTagColorsStorageKey = (uid: string | null): string => {
    const safeUid = uid ?? 'anonymous';
    return `sticky_notes:tag_colors:v1:${safeUid}`;
};

export type SortMode = 'updated_desc' | 'created_desc';

export const applyPinnedAndSort = (notes: StickyNote[], sortMode: SortMode): StickyNote[] => {
    const sortFn = (a: StickyNote, b: StickyNote): number => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        if (sortMode === 'created_desc') return b.createdAt - a.createdAt;
        return b.updatedAt - a.updatedAt;
    };

    return [...notes].sort(sortFn);
};
