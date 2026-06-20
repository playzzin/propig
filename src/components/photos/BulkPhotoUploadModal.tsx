'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

type UploadItem = {
    key: string;
    file: File;
    previewUrl: string;
};

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
    width: 100%;
    max-width: 920px;
    max-height: 90vh;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
`;

const Header = styled.div`
    padding: 18px 22px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;

    h3 {
        margin: 0;
        font-size: 1.05rem;
        color: #111827;
        font-weight: 700;
    }
`;

const CloseBtn = styled.button`
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: #f3f4f6;
    color: #6b7280;
    cursor: pointer;

    &:hover { background: #e5e7eb; color: #111827; }
`;

const Body = styled.div`
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
`;

const DropZone = styled.label<{ $dragActive?: boolean }>`
    border: 2px dashed ${(p) => (p.$dragActive ? '#4f46e5' : '#cbd5e1')};
    background: ${(p) => (p.$dragActive ? '#eef2ff' : '#f8fafc')};
    border-radius: 12px;
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    cursor: pointer;
    transition: all 0.15s;

    .inner {
        color: #475569;
        font-size: 0.92rem;
        line-height: 1.5;
        padding: 12px;
    }

    .inner strong { color: #1e293b; }
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
`;

const Card = styled.div`
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
    background: white;
`;

const Thumb = styled.div`
    position: relative;
    aspect-ratio: 1;
    background: #f3f4f6;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
`;

const RemoveBtn = styled.button`
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    cursor: pointer;
`;

const Meta = styled.div`
    padding: 8px;

    .name {
        font-size: 0.74rem;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 4px;
    }

    .info {
        font-size: 0.68rem;
        color: #64748b;
    }
`;

const Footer = styled.div`
    border-top: 1px solid #e5e7eb;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: #f8fafc;
`;

const Summary = styled.div`
    font-size: 0.88rem;
    color: #475569;

    strong { color: #0f172a; }
`;

const FooterActions = styled.div`
    display: flex;
    gap: 8px;
`;

const Button = styled.button<{ $primary?: boolean }>`
    border: ${(p) => (p.$primary ? 'none' : '1px solid #cbd5e1')};
    background: ${(p) => (p.$primary ? '#4f46e5' : 'white')};
    color: ${(p) => (p.$primary ? 'white' : '#334155')};
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;

    &:disabled { opacity: 0.55; cursor: not-allowed; }
`;

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

interface Props {
    categoryName: string;
    initialFiles?: File[];
    loading: boolean;
    onClose: () => void;
    onSubmit: (files: File[]) => Promise<void>;
}

function buildUploadItem(file: File): UploadItem {
    return {
        key: `${file.name}_${file.size}_${file.lastModified}`,
        file,
        previewUrl: URL.createObjectURL(file),
    };
}

function buildInitialUploadItems(files: File[]): UploadItem[] {
    const existing = new Set<string>();
    const items: UploadItem[] = [];

    for (const file of files.filter((f) => f.type.startsWith('image/'))) {
        const key = `${file.name}_${file.size}_${file.lastModified}`;
        if (existing.has(key)) continue;
        existing.add(key);
        items.push(buildUploadItem(file));
    }

    return items;
}

export default function BulkPhotoUploadModal({ categoryName, initialFiles = [], loading, onClose, onSubmit }: Props) {
    const [items, setItems] = useState<UploadItem[]>(() => buildInitialUploadItems(initialFiles));
    const [dragActive, setDragActive] = useState(false);
    const itemsRef = useRef<UploadItem[]>(items);

    const totalBytes = useMemo(
        () => items.reduce((sum, item) => sum + item.file.size, 0),
        [items]
    );

    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    useEffect(() => {
        return () => {
            itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        };
    }, []);

    const upsertFiles = (incoming: FileList | File[]) => {
        const files = Array.from(incoming).filter((f) => f.type.startsWith('image/'));
        if (files.length === 0) return;
        setItems((prev) => {
            const next = [...prev];
            for (const file of files) {
                const key = `${file.name}_${file.size}_${file.lastModified}`;
                if (next.some((it) => it.key === key)) continue;
                next.push(buildUploadItem(file));
            }
            return next;
        });
    };

    const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files) upsertFiles(e.dataTransfer.files);
    };

    const removeItem = (key: string) => {
        setItems((prev) => {
            const target = prev.find((it) => it.key === key);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return prev.filter((it) => it.key !== key);
        });
    };

    const handleSubmit = async () => {
        if (items.length === 0) return;
        await onSubmit(items.map((it) => it.file));
    };

    return (
        <Overlay onClick={onClose}>
            <Modal onClick={(e) => e.stopPropagation()}>
                <Header>
                    <h3>
                        <i className="fa-solid fa-folder-plus" style={{ marginRight: 8, color: '#4f46e5' }} />
                        대량등록 - {categoryName}
                    </h3>
                    <CloseBtn onClick={onClose}><i className="fa-solid fa-xmark" /></CloseBtn>
                </Header>

                <Body>
                    <DropZone
                        $dragActive={dragActive}
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={onDrop}
                    >
                        <div className="inner">
                            <strong>이미지 파일을 여기로 드래그</strong>하거나 클릭해서 여러 장 선택하세요.<br />
                            JPG, PNG, WEBP 등 이미지 파일만 업로드됩니다.
                        </div>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => e.target.files && upsertFiles(e.target.files)}
                        />
                    </DropZone>

                    {items.length > 0 && (
                        <Grid>
                            {items.map((item) => (
                                <Card key={item.key}>
                                    <Thumb>
                                        <img src={item.previewUrl} alt={item.file.name} />
                                        <RemoveBtn type="button" onClick={() => removeItem(item.key)}>
                                            <i className="fa-solid fa-xmark" />
                                        </RemoveBtn>
                                    </Thumb>
                                    <Meta>
                                        <div className="name">{item.file.name}</div>
                                        <div className="info">{item.file.type || 'unknown'} · {formatBytes(item.file.size)}</div>
                                    </Meta>
                                </Card>
                            ))}
                        </Grid>
                    )}
                </Body>

                <Footer>
                    <Summary>
                        총 <strong>{items.length}장</strong> / <strong>{formatBytes(totalBytes)}</strong>
                    </Summary>
                    <FooterActions>
                        <Button type="button" onClick={onClose} disabled={loading}>취소</Button>
                        <Button type="button" $primary onClick={handleSubmit} disabled={loading || items.length === 0}>
                            {loading ? '등록 중...' : `${items.length}장 등록`}
                        </Button>
                    </FooterActions>
                </Footer>
            </Modal>
        </Overlay>
    );
}
