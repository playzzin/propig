'use client';

import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/* ─── Types ─── */
type AIImage = {
    id: string;
    url: string;
    prompt: string;
    createdAt: unknown;
    type?: 'image' | 'video';
};

/* ─── Styled ─── */

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
`;

const Modal = styled.div`
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 760px;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    overflow: hidden;
`;

const ModalHeader = styled.div`
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .title {
        font-size: 1.1rem;
        font-weight: 700;
        color: #111827;

        span {
            color: #6b7280;
            font-weight: 400;
            font-size: 0.9rem;
            margin-left: 8px;
        }
    }
`;

const CloseBtn = styled.button`
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: #f3f4f6;
    color: #6b7280;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;

    &:hover { background: #e5e7eb; color: #111827; }
`;

const FilterBar = styled.div`
    padding: 12px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    gap: 8px;
    align-items: center;
    background: #f9fafb;
    font-size: 0.85rem;
    color: #6b7280;
`;

const FilterChip = styled.button<{ $active?: boolean }>`
    padding: 4px 12px;
    border-radius: 20px;
    border: 1px solid ${(p) => (p.$active ? '#4f46e5' : '#d1d5db')};
    background: ${(p) => (p.$active ? '#eef2ff' : 'white')};
    color: ${(p) => (p.$active ? '#4f46e5' : '#374151')};
    font-size: 0.8rem;
    font-weight: ${(p) => (p.$active ? 600 : 400)};
    cursor: pointer;
    transition: all 0.15s;

    &:hover { border-color: #a5b4fc; background: #f5f3ff; color: #4f46e5; }
`;

const ImageGrid = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
    align-content: start;
`;

const ImageCard = styled.div<{ $selected?: boolean }>`
    position: relative;
    aspect-ratio: 1;
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    background: #f3f4f6;
    border: 2px solid ${(p) => (p.$selected ? '#4f46e5' : 'transparent')};
    transition: border-color 0.15s, transform 0.1s;

    &:hover { transform: scale(1.02); border-color: ${(p) => (p.$selected ? '#4f46e5' : '#a5b4fc')}; }

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
`;

const CheckMark = styled.div<{ $visible?: boolean }>`
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #4f46e5;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    opacity: ${(p) => (p.$visible ? 1 : 0)};
    transition: opacity 0.15s;
`;

const VideoTag = styled.span`
    position: absolute;
    top: 6px;
    left: 6px;
    background: rgba(0,0,0,0.7);
    color: white;
    font-size: 0.65rem;
    padding: 2px 6px;
    border-radius: 4px;
    pointer-events: none;
`;

const PromptTooltip = styled.div`
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);
    padding: 20px 8px 8px;
    opacity: 0;
    transition: opacity 0.2s;

    p {
        font-size: 0.65rem;
        color: rgba(255,255,255,0.9);
        margin: 0;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    ${ImageCard}:hover & { opacity: 1; }
`;

const ModalFooter = styled.div`
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f9fafb;
    gap: 12px;
`;

const SelectedInfo = styled.span`
    font-size: 0.9rem;
    color: #6b7280;

    strong { color: #4f46e5; }
`;

const FooterActions = styled.div`
    display: flex;
    gap: 10px;
`;

const CancelBtn = styled.button`
    padding: 8px 18px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: white;
    color: #374151;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;

    &:hover { background: #f9fafb; }
`;

const ImportBtn = styled.button`
    padding: 8px 20px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: opacity 0.2s;

    &:disabled { opacity: 0.5; cursor: not-allowed; }
    &:hover:not(:disabled) { opacity: 0.9; }
`;

const EmptyState = styled.div`
    grid-column: 1 / -1;
    text-align: center;
    padding: 60px 20px;
    color: #9ca3af;

    i { font-size: 2.5rem; display: block; margin-bottom: 14px; }
    p { font-size: 0.9rem; }
`;

/* ─── Component ─── */

interface Props {
    categoryName: string;
    onClose: () => void;
    onImport: (images: { url: string; prompt?: string }[]) => Promise<void>;
}

export default function ImportFromAIModal({ categoryName, onClose, onImport }: Props) {
    const { currentUser } = useAuth();
    const [images, setImages] = useState<AIImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'image' | 'video'>('image');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        if (!currentUser) { setLoading(false); return; }

        const q = query(
            collection(db, 'ai_generations'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(100)
        );

        getDocs(q)
            .then((snap) => {
                setImages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AIImage)));
            })
            .catch((e) => {
                console.error(e);
                toast.error('AI 생성 기록 불러오기 실패');
            })
            .finally(() => setLoading(false));
    }, [currentUser]);

    const filtered = images.filter((img) => {
        if (filter === 'all') return true;
        return (img.type ?? 'image') === filter;
    });

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleImport = async () => {
        if (selected.size === 0) return;
        setImporting(true);
        try {
            const toImport = images
                .filter((img) => selected.has(img.id))
                .map((img) => ({ url: img.url, prompt: img.prompt }));
            await onImport(toImport);
        } finally {
            setImporting(false);
        }
    };

    const handleSelectAll = () => {
        if (selected.size === filtered.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(filtered.map((img) => img.id)));
        }
    };

    return (
        <Overlay onClick={onClose}>
            <Modal onClick={(e) => e.stopPropagation()}>
                <ModalHeader>
                    <div className="title">
                        <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight: 8, color: '#7c3aed' }} />
                        AI 이미지 가져오기
                        <span>→ {categoryName}</span>
                    </div>
                    <CloseBtn onClick={onClose}><i className="fa-solid fa-xmark" /></CloseBtn>
                </ModalHeader>

                <FilterBar>
                    <span>필터:</span>
                    <FilterChip $active={filter === 'image'} onClick={() => setFilter('image')}>이미지만</FilterChip>
                    <FilterChip $active={filter === 'video'} onClick={() => setFilter('video')}>영상만</FilterChip>
                    <FilterChip $active={filter === 'all'} onClick={() => setFilter('all')}>전체</FilterChip>
                    {filtered.length > 0 && (
                        <button
                            onClick={handleSelectAll}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer' }}
                        >
                            {selected.size === filtered.length ? '선택 해제' : '전체 선택'}
                        </button>
                    )}
                </FilterBar>

                <ImageGrid>
                    {loading ? (
                        <EmptyState>
                            <i className="fa-solid fa-spinner fa-spin" />
                            <p>불러오는 중...</p>
                        </EmptyState>
                    ) : filtered.length === 0 ? (
                        <EmptyState>
                            <i className="fa-solid fa-image-slash" />
                            <p>AI 생성 기록이 없습니다.<br />이미지 생성 페이지에서 먼저 이미지를 만들어보세요.</p>
                        </EmptyState>
                    ) : (
                        filtered.map((img) => (
                            <ImageCard
                                key={img.id}
                                $selected={selected.has(img.id)}
                                onClick={() => toggle(img.id)}
                            >
                                <img src={img.url} alt={img.prompt} />
                                {img.type === 'video' && <VideoTag>VIDEO</VideoTag>}
                                <CheckMark $visible={selected.has(img.id)}>
                                    <i className="fa-solid fa-check" />
                                </CheckMark>
                                <PromptTooltip>
                                    <p>{img.prompt}</p>
                                </PromptTooltip>
                            </ImageCard>
                        ))
                    )}
                </ImageGrid>

                <ModalFooter>
                    <SelectedInfo>
                        {selected.size > 0 ? (
                            <><strong>{selected.size}장</strong> 선택됨</>
                        ) : (
                            '이미지를 클릭하여 선택하세요'
                        )}
                    </SelectedInfo>
                    <FooterActions>
                        <CancelBtn onClick={onClose}>취소</CancelBtn>
                        <ImportBtn onClick={handleImport} disabled={selected.size === 0 || importing}>
                            {importing ? (
                                <><i className="fa-solid fa-spinner fa-spin" /> 가져오는 중...</>
                            ) : (
                                <><i className="fa-solid fa-file-import" /> {selected.size}장 가져오기</>
                            )}
                        </ImportBtn>
                    </FooterActions>
                </ModalFooter>
            </Modal>
        </Overlay>
    );
}
