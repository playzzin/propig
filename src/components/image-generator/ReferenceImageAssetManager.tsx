'use client';

import { useCallback, useId, useRef, useState } from 'react';
import styled from 'styled-components';
import { toast } from 'sonner';
import {
    IMAGE_REFERENCE_ROLE_LABELS,
    IMAGE_REFERENCE_ROLES,
    MAX_IMAGE_REFERENCE_ASSETS,
    MAX_IMAGE_REFERENCE_FILE_BYTES,
    SUPPORTED_REFERENCE_IMAGE_MIME_TYPES,
    type ImageReferenceAsset,
    type ImageReferenceDraft,
    type ImageReferenceRole,
} from '@/types/imageReference';

type ReferenceImageAssetManagerProps = {
    assets: ImageReferenceAsset[];
    onAddAssets: (assets: ImageReferenceDraft[]) => void;
    onRemoveAsset: (assetId: string) => void;
    onUpdateRole: (assetId: string, role: ImageReferenceRole) => void;
    disabled?: boolean;
    title?: string;
    description?: string;
};

const ROLE_CYCLE: ImageReferenceRole[] = ['building', 'product', 'character', 'background'];

const Shell = styled.section`
    padding: 16px;
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.085), rgba(255, 255, 255, 0.018) 62%);
`;

const Header = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 11px;

    h3 {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 0;
        color: var(--text-main);
        font-size: 0.86rem;
    }

    h3 i { color: #6ee7b7; }
    p { margin: 5px 0 0; color: var(--text-muted); font-size: 0.72rem; line-height: 1.48; }
`;

const CountBadge = styled.span`
    flex: 0 0 auto;
    padding: 4px 7px;
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 999px;
    color: #a7f3d0;
    background: rgba(16, 185, 129, 0.1);
    font-size: 0.66rem;
    font-weight: 800;
    white-space: nowrap;
`;

const ReferenceGuide = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0 0 11px;
    padding: 8px 9px;
    border-left: 2px solid rgba(110, 231, 183, 0.75);
    border-radius: 0 7px 7px 0;
    color: var(--text-muted);
    background: rgba(5, 46, 22, 0.18);
    font-size: 0.67rem;
    line-height: 1.45;

    i { margin-top: 2px; color: #6ee7b7; }
`;

const RoleSummary = styled.div`
    display: flex;
    gap: 6px;
    margin: 0 0 11px;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar { display: none; }
`;

const RoleChip = styled.span`
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 25px;
    padding: 0 7px;
    border: 1px solid rgba(16, 185, 129, 0.22);
    border-radius: 999px;
    color: #d1fae5;
    background: rgba(16, 185, 129, 0.07);
    font-size: 0.61rem;
    font-weight: 700;

    b { color: #6ee7b7; }
`;

const DropZone = styled.button<{ $dragging: boolean }>`
    width: 100%;
    min-height: 110px;
    padding: 14px;
    border: 1.5px dashed ${({ $dragging }) => ($dragging ? '#6ee7b7' : 'rgba(148, 163, 184, 0.42)')};
    border-radius: 10px;
    color: var(--text-main);
    background: ${({ $dragging }) => ($dragging ? 'rgba(16, 185, 129, 0.13)' : 'rgba(15, 23, 42, 0.2)')};
    cursor: pointer;
    text-align: center;
    transition: border-color 0.18s ease, background-color 0.18s ease, opacity 0.18s ease;

    &:hover:not(:disabled) { border-color: #6ee7b7; background: rgba(16, 185, 129, 0.09); }
    &:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    &:disabled { cursor: not-allowed; opacity: 0.6; }

    i { display: block; margin-bottom: 7px; color: #6ee7b7; font-size: 1.3rem; }
    strong { display: block; font-size: 0.78rem; }
    small { display: block; margin-top: 4px; color: var(--text-muted); font-size: 0.67rem; line-height: 1.4; }
`;

const AssetGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
    margin-top: 11px;

    @media (max-width: 460px) { grid-template-columns: 1fr; }
`;

const AssetCard = styled.article`
    position: relative;
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 9px;
    background: rgba(15, 23, 42, 0.48);
`;

const AssetImage = styled.img`
    display: block;
    width: 100%;
    aspect-ratio: 1.55 / 1;
    object-fit: cover;
    background: rgba(15, 23, 42, 0.7);
`;

const AssetBody = styled.div`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px;
`;

const AssetName = styled.span`
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.65rem;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RoleSelect = styled.select`
    min-width: 0;
    max-width: 126px;
    height: 28px;
    padding: 0 24px 0 7px;
    border: 1px solid rgba(16, 185, 129, 0.32);
    border-radius: 6px;
    color: #d1fae5;
    background: rgba(5, 46, 22, 0.58);
    font-size: 0.64rem;
    font-weight: 700;

    &:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
    &:disabled { cursor: not-allowed; opacity: 0.55; }
`;

const RemoveButton = styled.button`
    position: absolute;
    top: 6px;
    right: 6px;
    width: 27px;
    height: 27px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    color: white;
    background: rgba(15, 23, 42, 0.72);
    cursor: pointer;
    touch-action: manipulation;

    &:hover:not(:disabled) { background: #dc2626; }
    &:focus-visible { outline: 2px solid white; outline-offset: 2px; }
    &:disabled { cursor: not-allowed; opacity: 0.52; }
`;

const HiddenInput = styled.input`
    display: none;
`;

function formatBytes(bytes: number): string {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error('Unable to read the image file.'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
    });
}

export default function ReferenceImageAssetManager({
    assets,
    onAddAssets,
    onRemoveAsset,
    onUpdateRole,
    disabled = false,
    title = '일관성 참조 이미지',
    description = '건물·제품·캐릭터·배경 사진을 놓으면 모든 장면에 우선 반영합니다.',
}: ReferenceImageAssetManagerProps) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const remaining = Math.max(0, MAX_IMAGE_REFERENCE_ASSETS - assets.length);
    const isAtCapacity = remaining === 0;

    const addFiles = useCallback(async (files: FileList | File[]) => {
        if (disabled) return;
        if (isAtCapacity) {
            toast.info(`참조 이미지는 최대 ${MAX_IMAGE_REFERENCE_ASSETS}장까지 등록할 수 있습니다.`);
            return;
        }

        const candidates = Array.from(files);
        const validMimeFiles = candidates.filter((file) =>
            SUPPORTED_REFERENCE_IMAGE_MIME_TYPES.includes(file.type as (typeof SUPPORTED_REFERENCE_IMAGE_MIME_TYPES)[number]),
        );
        const validFiles = validMimeFiles.filter((file) => file.size <= MAX_IMAGE_REFERENCE_FILE_BYTES).slice(0, remaining);

        if (validMimeFiles.length !== candidates.length) {
            toast.error('PNG, JPG, WebP, GIF, AVIF 파일만 참조 이미지로 사용할 수 있습니다.');
        }
        if (validFiles.length !== validMimeFiles.length && validMimeFiles.some((file) => file.size > MAX_IMAGE_REFERENCE_FILE_BYTES)) {
            toast.error(`참조 이미지는 장당 ${formatBytes(MAX_IMAGE_REFERENCE_FILE_BYTES)} 이하여야 합니다.`);
        }
        if (validMimeFiles.filter((file) => file.size <= MAX_IMAGE_REFERENCE_FILE_BYTES).length > remaining) {
            toast.info(`남은 ${remaining}개 자리만 등록했습니다.`);
        }
        if (!validFiles.length) return;

        try {
            const nextAssets = await Promise.all(validFiles.map(async (file, index): Promise<ImageReferenceDraft> => ({
                image: await readFileAsDataUrl(file),
                name: file.name,
                role: ROLE_CYCLE[(assets.length + index) % ROLE_CYCLE.length],
            })));
            onAddAssets(nextAssets);
            toast.success(`${nextAssets.length}개의 참조 이미지를 등록했습니다.`);
        } catch (error) {
            console.error('Failed to read reference images:', error);
            toast.error('참조 이미지를 읽지 못했습니다. 다시 시도해 주세요.');
        }
    }, [assets.length, disabled, isAtCapacity, onAddAssets, remaining]);

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files?.length) void addFiles(files);
        event.target.value = '';
    }, [addFiles]);

    const handleRemoveAsset = useCallback((asset: ImageReferenceAsset) => {
        onRemoveAsset(asset.id);
        toast.success('참조 이미지를 제거했습니다.', {
            action: {
                label: '되돌리기',
                onClick: () => {
                    onAddAssets([{ image: asset.image, name: asset.name, role: asset.role }]);
                    toast.success('참조 이미지를 복원했습니다.');
                },
            },
        });
    }, [onAddAssets, onRemoveAsset]);

    return (
        <Shell aria-label={title}>
            <Header>
                <div>
                    <h3><i className="fas fa-images" aria-hidden="true" /> {title}</h3>
                    <p>{description}</p>
                </div>
                <CountBadge>{assets.length} / {MAX_IMAGE_REFERENCE_ASSETS}</CountBadge>
            </Header>

            {assets.length ? (
                <RoleSummary aria-label="등록된 참조 역할">
                    {assets.map((asset, index) => (
                        <RoleChip key={asset.id}><b>{index + 1}</b>{IMAGE_REFERENCE_ROLE_LABELS[asset.role]}</RoleChip>
                    ))}
                </RoleSummary>
            ) : (
                <ReferenceGuide>
                    <i className="fas fa-lightbulb" aria-hidden="true" />
                    <span>가장 좋은 결과를 위해 대상의 전체 모습, 특징 디테일, 사용할 공간 또는 배경을 함께 넣어주세요.</span>
                </ReferenceGuide>
            )}

            <DropZone
                type="button"
                $dragging={isDragging}
                disabled={disabled || isAtCapacity}
                aria-label="참조 이미지 여러 장 업로드"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!disabled && !isAtCapacity) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    void addFiles(event.dataTransfer.files);
                }}
            >
                <i className="fas fa-cloud-arrow-up" aria-hidden="true" />
                <strong>{isAtCapacity ? '참조 이미지가 모두 등록되었습니다' : '사진을 끌어다 놓거나 눌러서 여러 장 선택'}</strong>
                <small>{isAtCapacity ? '카드의 × 버튼으로 삭제 후 다시 추가할 수 있습니다.' : `최대 ${MAX_IMAGE_REFERENCE_ASSETS}장 · PNG, JPG, WebP, GIF, AVIF · 장당 8 MB`}</small>
            </DropZone>
            <HiddenInput
                id={inputId}
                ref={inputRef}
                type="file"
                accept={SUPPORTED_REFERENCE_IMAGE_MIME_TYPES.join(',')}
                multiple
                onChange={handleFileChange}
            />

            {assets.length ? (
                <AssetGrid aria-live="polite">
                    {assets.map((asset) => (
                        <AssetCard key={asset.id}>
                            <AssetImage
                                src={asset.image}
                                alt={`${IMAGE_REFERENCE_ROLE_LABELS[asset.role]} 참조: ${asset.name}`}
                                width={320}
                                height={206}
                                loading="lazy"
                            />
                            <RemoveButton
                                type="button"
                                aria-label={`${asset.name} 참조 이미지 삭제`}
                                onClick={() => handleRemoveAsset(asset)}
                                disabled={disabled}
                            >
                                <i className="fas fa-times" aria-hidden="true" />
                            </RemoveButton>
                            <AssetBody>
                                <AssetName title={asset.name}>{asset.name}</AssetName>
                                <RoleSelect
                                    value={asset.role}
                                    aria-label={`${asset.name} 참조 역할`}
                                    onChange={(event) => onUpdateRole(asset.id, event.target.value as ImageReferenceRole)}
                                    disabled={disabled}
                                >
                                    {IMAGE_REFERENCE_ROLES.map((role) => (
                                        <option key={role} value={role}>{IMAGE_REFERENCE_ROLE_LABELS[role]}</option>
                                    ))}
                                </RoleSelect>
                            </AssetBody>
                        </AssetCard>
                    ))}
                </AssetGrid>
            ) : null}
        </Shell>
    );
}
