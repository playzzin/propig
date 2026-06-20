'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { buildFallbackFaviconUrl, INLINE_BOOKMARK_FAVICON } from '@/lib/bookmark-favicon';
import type { Bookmark } from '@/types/bookmark-new';

type BookmarkRecord = Bookmark & {
    favicon?: string;
    updatedAt?: Timestamp;
};

const sectionStyle: React.CSSProperties = {
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.12)',
    background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.92) 0%, rgba(10, 14, 24, 0.96) 100%)',
    boxShadow: '0 18px 40px rgba(2, 6, 23, 0.2)',
    padding: '14px 18px',
};

function buildFallbackFavicon(url: string): string {
    return buildFallbackFaviconUrl(url);
}

function normalizeBookmarks(value: unknown[]): BookmarkRecord[] {
    const normalized: Array<BookmarkRecord | null> = value
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const raw = item as Record<string, unknown>;

            if (typeof raw.id !== 'string' || typeof raw.url !== 'string' || typeof raw.title !== 'string') {
                return null;
            }

            return {
                id: raw.id,
                userId: typeof raw.userId === 'string' ? raw.userId : '',
                url: raw.url,
                title: raw.title,
                favicon: typeof raw.favicon === 'string' ? raw.favicon : undefined,
                description: typeof raw.description === 'string' ? raw.description : undefined,
                categoryId: typeof raw.categoryId === 'string' ? raw.categoryId : '',
                tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
                isFavorite: Boolean(raw.isFavorite),
                order: typeof raw.order === 'number' ? raw.order : 0,
                createdAt: raw.createdAt as Timestamp,
                updatedAt: raw.updatedAt as Timestamp,
            } satisfies BookmarkRecord;
            });

            return normalized.filter((item): item is BookmarkRecord => item !== null);
}

export default function FavoriteBookmarkFaviconStrip() {
    const { currentUser } = useAuth();
    const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            queueMicrotask(() => {
                setBookmarks([]);
                setIsLoading(false);
            });
            return;
        }

        const bookmarksQuery = query(
            collection(db, 'bookmarks'),
            where('userId', '==', currentUser.uid),
        );

        const unsubscribe = onSnapshot(
            bookmarksQuery,
            (snapshot) => {
                const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
                const nextBookmarks = normalizeBookmarks(docs)
                    .filter((bookmark) => bookmark.isFavorite)
                    .sort((a, b) => {
                        const aTime = a.updatedAt?.toMillis?.() ?? 0;
                        const bTime = b.updatedAt?.toMillis?.() ?? 0;
                        return bTime - aTime;
                    })
                    .slice(0, 18);

                setBookmarks(nextBookmarks);
                setIsLoading(false);
            },
            (error) => {
                console.error('Failed to subscribe favorite bookmarks:', error);
                setBookmarks([]);
                setIsLoading(false);
            },
        );

        return () => unsubscribe();
    }, [currentUser]);

    const items = useMemo(
        () =>
            bookmarks.map((bookmark) => ({
                ...bookmark,
                faviconUrl: bookmark.favicon?.trim() || buildFallbackFavicon(bookmark.url),
            })),
        [bookmarks],
    );

    return (
        <section style={sectionStyle} aria-label="즐겨찾기 북마크 바로가기">
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: items.length > 0 || isLoading ? 12 : 0,
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                        style={{
                            width: 30,
                            height: 30,
                            borderRadius: 10,
                            background: 'rgba(250, 204, 21, 0.12)',
                            color: '#fcd34d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <i className="fa-solid fa-star" />
                    </span>
                    <div>
                        <div style={{ color: '#f8fafc', fontSize: '0.92rem', fontWeight: 800 }}>즐겨찾기 북마크</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.76rem' }}>스마트북마크에서 체크한 항목만 표시됩니다</div>
                    </div>
                </div>
                <a
                    href="/bookmarks"
                    style={{ color: '#93c5fd', fontSize: '0.76rem', fontWeight: 700, textDecoration: 'none' }}
                >
                    스마트북마크 열기
                </a>
            </div>

            {isLoading ? (
                <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>즐겨찾기 북마크를 불러오는 중...</div>
            ) : items.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>즐겨찾기한 북마크가 아직 없습니다.</div>
            ) : (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        overflowX: 'auto',
                        paddingBottom: 4,
                    }}
                >
                    {items.map((bookmark) => (
                        <a
                            key={bookmark.id}
                            href={bookmark.url}
                            target="_blank"
                            rel="noreferrer"
                            title={bookmark.title}
                            aria-label={bookmark.title}
                            style={{
                                width: 46,
                                height: 46,
                                minWidth: 46,
                                borderRadius: 14,
                                border: '1px solid rgba(148, 163, 184, 0.14)',
                                background: 'rgba(255, 255, 255, 0.04)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textDecoration: 'none',
                                boxShadow: '0 12px 24px rgba(2, 6, 23, 0.18)',
                                flexShrink: 0,
                            }}
                        >
                            <img
                                src={bookmark.faviconUrl}
                                alt={bookmark.title}
                                loading="lazy"
                                style={{ width: 24, height: 24, objectFit: 'contain', display: 'block' }}
                                onError={(event) => {
                                    const target = event.currentTarget;
                                    const fallbackUrl = buildFallbackFavicon(bookmark.url);

                                    if (target.dataset.fallbackApplied !== 'true' && target.getAttribute('src') !== fallbackUrl) {
                                        target.dataset.fallbackApplied = 'true';
                                        target.src = fallbackUrl;
                                        return;
                                    }

                                    target.src = INLINE_BOOKMARK_FAVICON;
                                }}
                            />
                        </a>
                    ))}
                </div>
            )}
        </section>
    );
}
