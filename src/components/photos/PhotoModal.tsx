'use client';

import React, { useState } from 'react';
import styled from 'styled-components';
import { PhotoAlbum, photoService } from '@/services/photoService';

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
`;

const ModalContainer = styled.div`
    background: white;
    width: 100%;
    max-width: 480px;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    overflow: hidden;
`;

const ModalHeader = styled.div`
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;

    h2 { margin: 0; font-size: 1.1rem; font-weight: 700; color: #111827; }
`;

const CloseButton = styled.button`
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: #f3f4f6;
    color: #6b7280;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover { background: #e5e7eb; color: #111827; }
`;

const ModalContent = styled.div`
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
`;

const FormGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
        font-size: 0.85rem;
        font-weight: 600;
        color: #374151;
    }

    input[type="text"],
    textarea {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-family: inherit;
        font-size: 0.95rem;
        color: #111827;
        box-sizing: border-box;
        transition: border-color 0.15s;

        &:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
        &:disabled { background: #f9fafb; color: #9ca3af; }
    }

    textarea { resize: vertical; min-height: 90px; }
`;

const ModalFooter = styled.div`
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    background: #f9fafb;
`;

const Button = styled.button<{ $primary?: boolean }>`
    padding: 9px 20px;
    border-radius: 8px;
    border: ${(p) => (p.$primary ? 'none' : '1px solid #d1d5db')};
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    background: ${(p) => (p.$primary ? '#4f46e5' : 'white')};
    color: ${(p) => (p.$primary ? 'white' : '#374151')};
    transition: opacity 0.2s, background 0.15s;

    &:hover { opacity: 0.9; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

interface Props {
    album?: PhotoAlbum | null;
    onClose: () => void;
    onSave: () => void;
}

export default function PhotoModal({ album, onClose, onSave }: Props) {
    const [title, setTitle] = useState(album?.title ?? '');
    const [description, setDescription] = useState(album?.description ?? '');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async () => {
        if (!title.trim()) { alert('제목을 입력해주세요.'); return; }
        setIsLoading(true);
        try {
            if (album?.id) {
                await photoService.updateAlbum(album.id, { title: title.trim(), description: description.trim() });
            } else {
                await photoService.createAlbum({ title: title.trim(), description: description.trim() });
            }
            onSave();
        } catch (error) {
            console.error('Error saving category:', error);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Overlay>
            <ModalContainer>
                <ModalHeader>
                    <h2>
                        <i className="fa-solid fa-folder-plus" style={{ marginRight: 8, color: '#4f46e5' }} />
                        {album ? '카테고리 수정' : '새 카테고리 만들기'}
                    </h2>
                    <CloseButton onClick={onClose} disabled={isLoading}>
                        <i className="fa-solid fa-xmark" />
                    </CloseButton>
                </ModalHeader>

                <ModalContent>
                    <FormGroup>
                        <label>카테고리 이름 *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="예: 여행, 제품, AI 생성"
                            disabled={isLoading}
                            autoFocus
                        />
                    </FormGroup>
                    <FormGroup>
                        <label>설명 (선택)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="카테고리에 대한 간단한 설명"
                            disabled={isLoading}
                        />
                    </FormGroup>
                </ModalContent>

                <ModalFooter>
                    <Button onClick={onClose} disabled={isLoading}>취소</Button>
                    <Button $primary onClick={handleSubmit} disabled={isLoading}>
                        {isLoading ? '저장 중...' : '저장'}
                    </Button>
                </ModalFooter>
            </ModalContainer>
        </Overlay>
    );
}

