'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { photoService } from '@/services/photoService';

interface SlidePhoto {
    id: string;
    url: string;
    title: string;
    album: string;
}

const sectionStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.12)',
    background:
        'radial-gradient(circle at top left, rgba(16, 185, 129, 0.22) 0%, rgba(10, 14, 24, 0) 32%), linear-gradient(135deg, rgba(8, 13, 22, 0.96) 0%, rgba(6, 10, 18, 0.98) 100%)',
    boxShadow: '0 24px 60px rgba(2, 6, 23, 0.32)',
};

const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background:
        'linear-gradient(90deg, rgba(7, 11, 20, 0.94) 0%, rgba(7, 11, 20, 0.12) 22%, rgba(7, 11, 20, 0.12) 78%, rgba(7, 11, 20, 0.94) 100%)',
    pointerEvents: 'none',
};

const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 999,
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    color: '#dbeafe',
    fontSize: '0.76rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
};

function dedupeAndFill(items: SlidePhoto[]): SlidePhoto[] {
    const deduped = items.filter((item, index, array) => array.findIndex((candidate) => candidate.url === item.url) === index);
    if (deduped.length === 0) {
        return [
            {
                id: 'placeholder-1',
                url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="%230ea5e9"/><stop offset="1" stop-color="%2310b981"/></linearGradient></defs><rect width="800" height="600" fill="url(%23g)"/><circle cx="620" cy="150" r="120" fill="rgba(255,255,255,0.18)"/><circle cx="180" cy="480" r="170" fill="rgba(15,23,42,0.22)"/></svg>',
                title: '사진을 등록하면 여기에서 자동으로 흐릅니다',
                album: '갤러리',
            },
            {
                id: 'placeholder-2',
                url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="%23f97316"/><stop offset="1" stop-color="%23ef4444"/></linearGradient></defs><rect width="800" height="600" fill="url(%23g)"/><path d="M0 410c137-74 241-92 313-54s183 36 250 2 146-42 237 14v228H0Z" fill="rgba(255,255,255,0.2)"/></svg>',
                title: '관리자 사진첩을 채우면 대시보드 분위기가 바뀝니다',
                album: '브랜드',
            },
            {
                id: 'placeholder-3',
                url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="%23111827"/><stop offset="1" stop-color="%236366f1"/></linearGradient></defs><rect width="800" height="600" fill="url(%23g)"/><rect x="120" y="120" width="560" height="360" rx="36" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.22)"/></svg>',
                title: '상단 슬라이드 섹션',
                album: 'dashboard2',
            },
        ];
    }

    if (deduped.length >= 6) {
        return deduped;
    }

    const result = [...deduped];
    while (result.length < 6) {
        result.push({
            ...deduped[result.length % deduped.length],
            id: `${deduped[result.length % deduped.length].id}-dup-${result.length}`,
        });
    }

    return result;
}

function PhotoCard({ item, priority = false }: { item: SlidePhoto; priority?: boolean }) {
    return (
        <article
            style={{
                position: 'relative',
                width: 260,
                minWidth: 260,
                height: 168,
                overflow: 'hidden',
                borderRadius: 22,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(15, 23, 42, 0.52)',
                boxShadow: '0 16px 30px rgba(2, 6, 23, 0.26)',
            }}
        >
            <img
                src={item.url}
                alt={item.title}
                loading={priority ? 'eager' : 'lazy'}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                        'linear-gradient(180deg, rgba(15, 23, 42, 0.02) 0%, rgba(15, 23, 42, 0.12) 42%, rgba(2, 6, 23, 0.82) 100%)',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    left: 16,
                    right: 16,
                    bottom: 14,
                    zIndex: 1,
                    display: 'grid',
                    gap: 4,
                }}
            >
                <span style={{ fontSize: '0.72rem', color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase' }}>
                    {item.album}
                </span>
                <strong
                    style={{
                        color: '#f8fafc',
                        fontSize: '0.92rem',
                        lineHeight: 1.25,
                        letterSpacing: '-0.02em',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {item.title}
                </strong>
            </div>
        </article>
    );
}

function PhotoRail({ items, direction }: { items: SlidePhoto[]; direction: 'left' | 'right' }) {
    const loopItems = [...items, ...items];

    return (
        <div style={{ overflow: 'hidden' }}>
            <div
                style={{
                    display: 'flex',
                    gap: 16,
                    width: 'max-content',
                    animation: `${direction === 'left' ? 'dashboard-marquee-left' : 'dashboard-marquee-right'} 34s linear infinite`,
                }}
            >
                {loopItems.map((item, index) => (
                    <PhotoCard key={`${item.id}-${direction}-${index}`} item={item} priority={index < 3} />
                ))}
            </div>
        </div>
    );
}

export default function DashboardPhotoMarquee() {
    const [items, setItems] = useState<SlidePhoto[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let active = true;

        const load = async () => {
            try {
                const albums = await photoService.getAlbums();
                if (!active) return;

                const nextItems = albums
                    .flatMap((album) =>
                        album.photoItems.map((photo, index) => ({
                            id: `${album.id ?? album.title}-${photo.id}`,
                            url: photo.url,
                            title: photo.prompt || photo.fileName || `${album.title} ${index + 1}`,
                            album: album.title,
                            order: photo.order ?? index,
                            albumOrder: album.order ?? 0,
                        })),
                    )
                    .sort((a, b) => (a.albumOrder - b.albumOrder) || (a.order - b.order))
                    .map(({ order: _order, albumOrder: _albumOrder, ...rest }) => rest)
                    .slice(0, 10);

                setItems(dedupeAndFill(nextItems));
            } catch (error) {
                console.error('Failed to load dashboard marquee photos:', error);
                if (active) {
                    setItems(dedupeAndFill([]));
                }
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };

        void load();

        return () => {
            active = false;
        };
    }, []);

    const leftRow = useMemo(() => items.slice(0, Math.max(3, Math.ceil(items.length / 2))), [items]);
    const rightRow = useMemo(() => items.slice(Math.max(1, Math.floor(items.length / 3))), [items]);

    return (
        <section style={sectionStyle}>
            <div
                style={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'grid',
                    gap: 22,
                    padding: '28px 24px 24px',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 16,
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
                        <span style={badgeStyle}>
                            <i className="fa-solid fa-images" />
                            비주얼 스트림
                        </span>
                        <div>
                            <h2
                                style={{
                                    margin: 0,
                                    color: '#f8fafc',
                                    fontSize: 'clamp(1.5rem, 2vw, 2.4rem)',
                                    lineHeight: 1.05,
                                    letterSpacing: '-0.05em',
                                }}
                            >
                                사진첩 이미지를 상단에서 양방향으로 흐르게 배치했습니다.
                            </h2>
                            <p
                                style={{
                                    margin: '10px 0 0',
                                    color: '#94a3b8',
                                    fontSize: '0.95rem',
                                    lineHeight: 1.6,
                                    maxWidth: 620,
                                }}
                            >
                                관리자 사진첩에 있는 이미지를 자동으로 가져와 두 줄로 흘려 보여줍니다. 사진이 없으면 기본 비주얼 카드가 대신 표시됩니다.
                            </p>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'grid',
                            gap: 8,
                            minWidth: 180,
                            alignSelf: 'stretch',
                            justifyItems: 'end',
                        }}
                    >
                        <span style={{ color: '#cbd5e1', fontSize: '0.82rem', fontWeight: 700 }}>
                            {isLoading ? '불러오는 중...' : `${items.length}개 이미지 반영`}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                            /admin/photos 데이터 기반
                        </span>
                    </div>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                    <PhotoRail items={leftRow} direction="left" />
                    <PhotoRail items={rightRow.length > 0 ? rightRow : leftRow} direction="right" />
                </div>
            </div>

            <div style={overlayStyle} />

            <style jsx>{`
                @keyframes dashboard-marquee-left {
                    0% {
                        transform: translate3d(0, 0, 0);
                    }
                    100% {
                        transform: translate3d(calc(-50% - 8px), 0, 0);
                    }
                }

                @keyframes dashboard-marquee-right {
                    0% {
                        transform: translate3d(calc(-50% - 8px), 0, 0);
                    }
                    100% {
                        transform: translate3d(0, 0, 0);
                    }
                }

                @media (max-width: 900px) {
                    section :global(article) {
                        width: 220px;
                        min-width: 220px;
                        height: 148px;
                    }
                }

                @media (max-width: 640px) {
                    section :global(article) {
                        width: 188px;
                        min-width: 188px;
                        height: 132px;
                    }
                }
            `}</style>
        </section>
    );
}