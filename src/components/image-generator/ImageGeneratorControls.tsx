'use client';

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { toast } from 'sonner';
import { IMAGE_STYLE_PRESETS } from '@/constants/imageStylePresets';

type AspectRatio = '1:1' | '9:16' | '16:9' | '4:3' | '3:4' | 'custom';

interface ImageGeneratorControlsProps {
    prompt: string;
    setPrompt: (value: string) => void;
    negativePrompt: string;
    setNegativePrompt: (value: string) => void;
    aspectRatio: AspectRatio;
    setAspectRatio: (value: AspectRatio) => void;
    width: number;
    setWidth: (value: number) => void;
    height: number;
    setHeight: (value: number) => void;
    stylePreset: string;
    setStylePreset: (value: string) => void;
    referenceImage: string | null;
    setReferenceImage: (value: string | null) => void;
    isGenerating: boolean;
    onGenerate: () => void;
    provider: 'gemini' | 'grok';
    setProvider: (value: 'gemini' | 'grok') => void;
    generationMode: 'image' | 'video';
    setGenerationMode: (value: 'image' | 'video') => void;
}

const IMAGE_TYPES = [
    { id: 'favicon', label: '파비콘', width: 512, height: 512, icon: 'fa-star', desc: '512x512' },
    { id: 'logo', label: '로고', width: 1024, height: 1024, icon: 'fa-crown', desc: '1024x1024' },
    { id: 'icon', label: '아이콘', width: 256, height: 256, icon: 'fa-cube', desc: '256x256' },
    { id: 'project-board-cover', label: '프로젝트 보드', width: 1536, height: 864, icon: 'fa-clipboard-list', desc: '본문 16:9' },
    { id: 'project-board-task', label: '과제 이미지', width: 1184, height: 864, icon: 'fa-list-check', desc: '과제 4:3' },
    { id: 'youtube', label: '유튜브 썸네일', width: 1280, height: 720, icon: 'fa-youtube', desc: '1280x720' },
    { id: 'banner', label: '배너', width: 1200, height: 300, icon: 'fa-flag', desc: '1200x300' },
    { id: 'og', label: 'OG 이미지', width: 1200, height: 630, icon: 'fa-share-nodes', desc: '1200x630' },
    { id: 'kakao-sq', label: '카카오 정방형', width: 800, height: 800, icon: 'fa-comment', desc: '800x800' },
    { id: 'kakao-wide', label: '카카오 와이드', width: 800, height: 400, icon: 'fa-comment', desc: '800x400' },
    { id: 'custom', label: '커스텀', width: 1536, height: 1024, icon: 'fa-sliders', desc: '직접 입력' },
] as const;

const IMAGE_TYPE_ASPECT_RATIOS: Partial<Record<typeof IMAGE_TYPES[number]['id'], AspectRatio>> = {
    'project-board-cover': '16:9',
    'project-board-task': '4:3',
};

const RANDOM_PROMPTS = [
    '투명 배경에 잘 어울리는 프리미엄 SaaS 로고, 단순한 기하학 형태, 민트와 흰색 중심의 선명한 대비',
    '유튜브 썸네일용 미래적인 대시보드 장면, 강한 제목 공간, 고대비 조명, 선명한 UI 패널',
    '카카오 공유 이미지용 따뜻한 브랜드 일러스트, 중앙 오브젝트, 여백이 충분한 구성',
    '모바일 앱 아이콘 스타일의 3D 심볼, 둥근 형태, 어두운 배경에서도 읽히는 실루엣',
    '웹 배너용 추상 그래픽, 좌측 카피 영역을 비워둔 구성, 세련된 빛 반사와 깊이감',
    '프로젝트 보드 대표 이미지, 현대적인 업무 공간과 칸반 보드, 분석 대시보드 분위기, 텍스트 없는 16:9 사진형 구성',
];

const Container = styled.div`
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding: 20px;
    gap: 18px;

    @media (max-width: 1024px) {
        min-height: auto;
        padding-bottom: 24px;
    }

    @media (max-width: 520px) {
        gap: 14px;
        padding: 16px 20px 24px;
    }
`;

const Section = styled.section`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const SegmentedControl = styled.div`
    display: flex;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 4px;
`;

const SegmentButton = styled.button<{ $active?: boolean }>`
    flex: 1;
    min-width: 0;
    padding: 9px 8px;
    font-size: 0.8rem;
    font-weight: 700;
    color: ${({ $active }) => ($active ? 'white' : 'var(--text-muted)')};
    background: ${({ $active }) => ($active ? 'var(--primary)' : 'transparent')};
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;

    &:hover:not(:disabled) {
        color: white;
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        color: var(--text-dim);
    }
`;

const FieldLabel = styled.label`
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;

    i {
        font-size: 0.7rem;
    }
`;

const SectionTitle = styled.h3`
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;

    i {
        font-size: 0.7rem;
    }
`;

const HelperText = styled.p`
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.5;
    color: var(--text-muted);
`;

const TypeGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    @media (max-width: 520px) {
        display: flex;
        margin: 0 -20px;
        padding: 0 20px 4px;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;

        &::-webkit-scrollbar {
            display: none;
        }
    }
`;

const TypeCard = styled.button<{ $active?: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 86px;
    padding: 12px 8px;
    border-radius: 10px;
    border: 1px solid ${({ $active }) => ($active ? 'var(--primary)' : 'var(--border-subtle)')};
    background: ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.02)')};
    color: var(--text-main);
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;

    &:hover {
        border-color: var(--primary);
        background: rgba(16, 185, 129, 0.06);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }

    i {
        font-size: 1.25rem;
        margin-bottom: 6px;
        color: ${({ $active }) => ($active ? 'var(--primary)' : 'var(--text-muted)')};
    }

    @media (prefers-reduced-motion: reduce) {
        transition: background-color 0.2s ease, border-color 0.2s ease;
    }

    @media (max-width: 520px) {
        flex: 0 0 148px;
        min-height: 78px;
        scroll-snap-align: start;
    }
`;

const TypeLabel = styled.span`
    max-width: 100%;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-main);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const TypeSize = styled.span`
    font-size: 0.65rem;
    color: var(--text-muted);
    margin-top: 2px;
`;

const StylePresetGrid = styled.div`
    display: flex;
    gap: 8px;
    padding: 0 0 4px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }

    @media (max-width: 520px) {
        margin: 0 -20px;
        padding: 0 20px 4px;
    }
`;

const StylePresetCard = styled.button<{ $active?: boolean; $accent: string }>`
    flex: 0 0 156px;
    min-width: 0;
    min-height: 112px;
    padding: 0;
    border: 1px solid ${({ $active, $accent }) => ($active ? $accent : 'var(--border-subtle)')};
    border-radius: 10px;
    background: ${({ $active }) => ($active ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.02)')};
    color: var(--text-main);
    overflow: hidden;
    cursor: pointer;
    text-align: left;
    scroll-snap-align: start;
    transition: border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;

    &:hover {
        border-color: ${({ $accent }) => $accent};
        background: rgba(255, 255, 255, 0.06);
        transform: translateY(-1px);
    }

    &:focus-visible {
        outline: 2px solid ${({ $accent }) => $accent};
        outline-offset: 2px;
    }

    ${({ $active, $accent }) =>
        $active
            ? `
                box-shadow: inset 0 0 0 1px ${$accent}, 0 10px 24px rgba(0, 0, 0, 0.18);
            `
            : ''}

    @media (prefers-reduced-motion: reduce) {
        transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;

        &:hover {
            transform: none;
        }
    }

    @media (max-width: 520px) {
        flex: 0 0 168px;
    }
`;

const PresetVisual = styled.div<{ $background: string; $foreground: string; $accent: string }>`
    position: relative;
    height: 54px;
    overflow: hidden;
    background: ${({ $background }) => $background};

    .shape {
        position: absolute;
        display: block;
        background: ${({ $foreground }) => $foreground};
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
    }

    .shape-a {
        left: 14px;
        top: 12px;
        width: 36px;
        height: 26px;
        border-radius: 8px;
    }

    .shape-b {
        right: 14px;
        top: 10px;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: ${({ $accent }) => $accent};
    }

    .shape-c {
        left: 58px;
        bottom: 10px;
        width: 40px;
        height: 7px;
        border-radius: 999px;
        background: ${({ $accent }) => $accent};
    }

    &.preset-clean .shape-a,
    &.preset-board .shape-a {
        width: 42px;
        height: 28px;
        border-radius: 5px;
    }

    &.preset-clean .shape-c,
    &.preset-board .shape-c {
        left: 64px;
        width: 48px;
        height: 6px;
    }

    &.preset-photo .shape-a,
    &.preset-cinematic .shape-a,
    &.preset-luxury .shape-a {
        inset: 11px auto auto 18px;
        width: 48px;
        height: 32px;
        border-radius: 999px 999px 8px 8px;
        opacity: 0.9;
    }

    &.preset-minimal .shape-a {
        left: 50%;
        top: 15px;
        width: 24px;
        height: 24px;
        border-radius: 999px;
        transform: translateX(-50%);
    }

    &.preset-minimal .shape-b,
    &.preset-minimal .shape-c {
        display: none;
    }

    &.preset-illustration .shape-a,
    &.preset-anime .shape-a,
    &.preset-watercolor .shape-a {
        width: 44px;
        height: 30px;
        border-radius: 58% 42% 48% 52%;
    }

    &.preset-isometric .shape-a,
    &.preset-product .shape-a {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        transform: rotate(45deg);
    }

    &.preset-retro .shape-a {
        width: 46px;
        height: 30px;
        border-radius: 999px;
    }

    &.preset-pixel .shape-a,
    &.preset-pixel .shape-b,
    &.preset-pixel .shape-c {
        border-radius: 0;
        image-rendering: pixelated;
    }

    &.preset-line {
        background-image:
            linear-gradient(135deg, rgba(17, 24, 39, 0.12) 25%, transparent 25%),
            linear-gradient(45deg, rgba(17, 24, 39, 0.12) 25%, transparent 25%);
        background-size: 18px 18px;
    }

    &.preset-line .shape-a,
    &.preset-line .shape-b {
        background: transparent;
        border: 2px solid ${({ $foreground }) => $foreground};
        box-shadow: none;
    }
`;

const PresetCopy = styled.span`
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 9px 10px 10px;
`;

const PresetName = styled.span`
    min-width: 0;
    color: var(--text-main);
    font-size: 0.76rem;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const PresetDesc = styled.span`
    color: var(--text-muted);
    font-size: 0.66rem;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

const PromptTextarea = styled.textarea<{ $invalid?: boolean }>`
    width: 100%;
    min-height: 120px;
    padding: 14px;
    border: 1px solid ${({ $invalid }) => ($invalid ? '#ef4444' : 'var(--border-subtle)')};
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--text-main);
    font-size: 0.9rem;
    line-height: 1.5;
    resize: vertical;
    transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;

    &::placeholder {
        color: var(--text-dim);
    }

    &:focus-visible {
        outline: 2px solid ${({ $invalid }) => ($invalid ? '#ef4444' : 'var(--primary)')};
        outline-offset: 2px;
        border-color: ${({ $invalid }) => ($invalid ? '#ef4444' : 'var(--primary)')};
        background: rgba(16, 185, 129, 0.03);
    }

    @media (max-width: 520px) {
        min-height: 104px;
    }
`;

const FieldMeta = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: -8px;
`;

const ErrorText = styled.p`
    margin: 0;
    color: #f87171;
    font-size: 0.74rem;
    line-height: 1.4;
`;

const CharCount = styled.div`
    margin-left: auto;
    font-size: 0.7rem;
    color: var(--text-dim);
    white-space: nowrap;
`;

const PromptActions = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
`;

const SmallButton = styled.button`
    padding: 8px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-main);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }
`;

const AdvancedToggle = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-main);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }
`;

const AdvancedContent = styled.div<{ $open?: boolean }>`
    max-height: ${({ $open }) => ($open ? '520px' : '0')};
    overflow: hidden;
    transition: max-height 0.3s ease;

    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
`;

const AdvancedInner = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 12px;
`;

const ControlGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
`;

const SmallField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const SmallLabel = styled.label`
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-muted);
`;

const SmallInput = styled.input`
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--text-main);
    font-size: 0.85rem;

    &::placeholder {
        color: var(--text-dim);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
        border-color: var(--primary);
    }
`;

const UploadZone = styled.button<{ $dragging?: boolean }>`
    width: 100%;
    padding: 20px;
    border: 2px dashed ${({ $dragging }) => ($dragging ? 'var(--primary)' : 'var(--border-subtle)')};
    border-radius: 10px;
    background: ${({ $dragging }) => ($dragging ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255, 255, 255, 0.02)')};
    text-align: center;
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease;

    &:hover {
        border-color: var(--primary);
        background: rgba(16, 185, 129, 0.03);
    }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }
`;

const UploadIcon = styled.i`
    font-size: 2rem;
    color: var(--text-dim);
    margin-bottom: 8px;
`;

const UploadText = styled.p`
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0;
`;

const HiddenInput = styled.input`
    display: none;
`;

const PreviewContainer = styled.div`
    position: relative;
    display: inline-block;
    max-width: 100%;
`;

const PreviewImg = styled.img`
    max-width: 100%;
    max-height: 120px;
    border-radius: 8px;
    object-fit: cover;
`;

const RemoveButton = styled.button`
    position: absolute;
    top: -8px;
    right: -8px;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: #ef4444;
    color: white;
    font-size: 0.75rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease;

    &:hover {
        background: #dc2626;
    }

    &:focus-visible {
        outline: 2px solid white;
        outline-offset: 2px;
    }
`;

const GenerateButton = styled.button<{ $generating?: boolean }>`
    position: sticky;
    bottom: 16px;
    z-index: 5;
    width: 100%;
    min-height: 56px;
    padding: 16px;
    border: none;
    border-radius: 12px;
    background: ${({ $generating }) => ($generating ? 'var(--bg-elevated)' : 'var(--primary)')};
    color: ${({ $generating }) => ($generating ? 'var(--text-muted)' : 'white')};
    font-size: 1rem;
    font-weight: 800;
    cursor: ${({ $generating }) => ($generating ? 'not-allowed' : 'pointer')};
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: auto;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
    transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;

    &:hover:not(:disabled) {
        background: var(--primary-light);
        transform: translateY(-1px);
        box-shadow: 0 12px 28px var(--primary-glow);
    }

    &:focus-visible {
        outline: 2px solid white;
        outline-offset: 2px;
    }

    i {
        font-size: 1.1rem;
    }

    @media (prefers-reduced-motion: reduce) {
        transition: background-color 0.2s ease, box-shadow 0.2s ease;

        &:hover:not(:disabled) {
            transform: none;
        }
    }
`;

const LoadingSpinner = styled.span`
    width: 18px;
    height: 18px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

function getAspectRatio(width: number, height: number): AspectRatio {
    if (width === height) return '1:1';
    if (width * 9 === height * 16) return '16:9';
    if (width * 16 === height * 9) return '9:16';
    if (width * 3 === height * 4) return '4:3';
    if (width * 4 === height * 3) return '3:4';
    return 'custom';
}

export default function ImageGeneratorControls({
    prompt,
    setPrompt,
    negativePrompt,
    setNegativePrompt,
    aspectRatio,
    setAspectRatio,
    width,
    setWidth,
    height,
    setHeight,
    stylePreset,
    setStylePreset,
    referenceImage,
    setReferenceImage,
    isGenerating,
    onGenerate,
    provider,
    setProvider,
    generationMode,
    setGenerationMode,
}: ImageGeneratorControlsProps) {
    const promptId = useId();
    const promptErrorId = useId();
    const negativePromptId = useId();
    const widthId = useId();
    const heightId = useId();
    const fileInputId = useId();

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [promptTouched, setPromptTouched] = useState(false);
    const promptRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isGeminiVideoDisabled = generationMode === 'video';
    const isPromptInvalid = promptTouched && prompt.trim().length === 0;
    const selectedType = useMemo(
        () => IMAGE_TYPES.find((type) => type.width === width && type.height === height)?.id ?? 'custom',
        [height, width],
    );
    const modeLabel = generationMode === 'image' ? '이미지' : '동영상';
    const promptPlaceholder = useMemo(
        () =>
            generationMode === 'image'
                ? '생성하고 싶은 이미지의 대상, 분위기, 색감, 용도를 자세히 적어주세요…'
                : '생성하고 싶은 동영상의 장면, 움직임, 분위기, 길이를 자세히 적어주세요…',
        [generationMode],
    );

    const handleTypeSelect = (type: typeof IMAGE_TYPES[number]) => {
        setWidth(type.width);
        setHeight(type.height);
        setAspectRatio(type.id === 'custom' ? 'custom' : IMAGE_TYPE_ASPECT_RATIOS[type.id] ?? getAspectRatio(type.width, type.height));
    };

    const handleRandomPrompt = () => {
        const randomIndex = Math.floor(Math.random() * RANDOM_PROMPTS.length);
        setPrompt(RANDOM_PROMPTS[randomIndex]);
        setPromptTouched(false);
        toast.success('랜덤 프롬프트를 적용했습니다.');
    };

    const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('이미지 파일만 업로드할 수 있습니다.');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setReferenceImage(reader.result as string);
            toast.success('참조 이미지를 추가했습니다.');
        };
        reader.readAsDataURL(file);
    }, [setReferenceImage]);

    const handleDrop = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        setIsDragging(false);

        const file = event.dataTransfer.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('이미지 파일만 업로드할 수 있습니다.');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setReferenceImage(reader.result as string);
            toast.success('참조 이미지를 추가했습니다.');
        };
        reader.readAsDataURL(file);
    }, [setReferenceImage]);

    const handleGenerateClick = () => {
        setPromptTouched(true);

        if (!prompt.trim()) {
            promptRef.current?.focus();
            return;
        }

        onGenerate();
    };

    const handleDimensionChange = (nextWidth: number, nextHeight: number) => {
        setWidth(nextWidth);
        setHeight(nextHeight);
        setAspectRatio(getAspectRatio(nextWidth, nextHeight));
    };

    return (
        <Container>
            <Section aria-label="생성 엔진과 모드">
                <SegmentedControl role="group" aria-label="생성 엔진 선택">
                    <SegmentButton
                        type="button"
                        $active={provider === 'gemini'}
                        aria-pressed={provider === 'gemini'}
                        onClick={() => setProvider('gemini')}
                        disabled={isGeminiVideoDisabled}
                    >
                        <i className="fas fa-sparkles" aria-hidden="true" style={{ marginRight: 6 }} />
                        Gemini
                    </SegmentButton>
                    <SegmentButton
                        type="button"
                        $active={provider === 'grok'}
                        aria-pressed={provider === 'grok'}
                        onClick={() => setProvider('grok')}
                    >
                        <i className="fas fa-bolt" aria-hidden="true" style={{ marginRight: 6 }} />
                        Grok
                    </SegmentButton>
                </SegmentedControl>

                <SegmentedControl role="group" aria-label="생성 모드 선택">
                    <SegmentButton
                        type="button"
                        $active={generationMode === 'image'}
                        aria-pressed={generationMode === 'image'}
                        onClick={() => setGenerationMode('image')}
                    >
                        <i className="fas fa-image" aria-hidden="true" style={{ marginRight: 6 }} />
                        이미지 생성
                    </SegmentButton>
                    <SegmentButton
                        type="button"
                        $active={generationMode === 'video'}
                        aria-pressed={generationMode === 'video'}
                        onClick={() => {
                            setGenerationMode('video');
                            setProvider('grok');
                        }}
                    >
                        <i className="fas fa-video" aria-hidden="true" style={{ marginRight: 6 }} />
                        동영상 생성
                    </SegmentButton>
                </SegmentedControl>

                {generationMode === 'video' ? (
                    <HelperText>동영상 생성은 현재 Grok 엔진만 지원합니다.</HelperText>
                ) : null}
            </Section>

            {generationMode === 'image' ? (
                <Section aria-labelledby="style-preset-title">
                    <SectionTitle id="style-preset-title">
                        <i className="fas fa-palette" aria-hidden="true" />
                        스타일 프리셋
                    </SectionTitle>
                    <StylePresetGrid>
                        {IMAGE_STYLE_PRESETS.map((preset) => (
                            <StylePresetCard
                                key={preset.value}
                                type="button"
                                $active={stylePreset === preset.value}
                                $accent={preset.preview.accent}
                                aria-pressed={stylePreset === preset.value}
                                aria-label={`${preset.label}: ${preset.description}`}
                                onClick={() => setStylePreset(preset.value)}
                            >
                                <PresetVisual
                                    className={`preset-${preset.preview.pattern}`}
                                    $background={preset.preview.background}
                                    $foreground={preset.preview.foreground}
                                    $accent={preset.preview.accent}
                                    aria-hidden="true"
                                >
                                    <span className="shape shape-a" />
                                    <span className="shape shape-b" />
                                    <span className="shape shape-c" />
                                </PresetVisual>
                                <PresetCopy>
                                    <PresetName>{preset.label}</PresetName>
                                    <PresetDesc>{preset.description}</PresetDesc>
                                </PresetCopy>
                            </StylePresetCard>
                        ))}
                    </StylePresetGrid>
                </Section>
            ) : null}

            {generationMode === 'image' ? (
                <Section aria-labelledby="image-type-title">
                    <SectionTitle id="image-type-title">
                        <i className="fas fa-shapes" aria-hidden="true" />
                        이미지 유형
                    </SectionTitle>
                    <TypeGrid>
                        {IMAGE_TYPES.map((type) => (
                            <TypeCard
                                key={type.id}
                                type="button"
                                $active={selectedType === type.id}
                                aria-pressed={selectedType === type.id}
                                onClick={() => handleTypeSelect(type)}
                            >
                                <i className={`fas ${type.icon}`} aria-hidden="true" />
                                <TypeLabel>{type.label}</TypeLabel>
                                <TypeSize>{type.desc}</TypeSize>
                            </TypeCard>
                        ))}
                    </TypeGrid>
                </Section>
            ) : null}

            <Section>
                <FieldLabel htmlFor={promptId}>
                    <i className="fas fa-pencil" aria-hidden="true" />
                    프롬프트
                </FieldLabel>
                <PromptTextarea
                    ref={promptRef}
                    id={promptId}
                    name="prompt"
                    value={prompt}
                    onChange={(event) => {
                        setPrompt(event.target.value);
                        if (promptTouched) setPromptTouched(false);
                    }}
                    placeholder={promptPlaceholder}
                    maxLength={1000}
                    autoComplete="off"
                    aria-invalid={isPromptInvalid}
                    aria-describedby={isPromptInvalid ? promptErrorId : undefined}
                    $invalid={isPromptInvalid}
                />
                <FieldMeta>
                    {isPromptInvalid ? (
                        <ErrorText id={promptErrorId}>프롬프트를 입력해야 생성할 수 있습니다.</ErrorText>
                    ) : (
                        <span />
                    )}
                    <CharCount>{prompt.length} / 1000</CharCount>
                </FieldMeta>
                <PromptActions>
                    <SmallButton type="button" onClick={handleRandomPrompt}>
                        <i className="fas fa-shuffle" aria-hidden="true" />
                        랜덤 프롬프트
                    </SmallButton>
                </PromptActions>
            </Section>

            <Section>
                <AdvancedToggle
                    type="button"
                    aria-expanded={showAdvanced}
                    aria-controls="image-generator-advanced-options"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                >
                    <span>
                        <i className="fas fa-sliders" aria-hidden="true" style={{ marginRight: 8 }} />
                        고급 설정
                    </span>
                    <i className={`fas fa-chevron-${showAdvanced ? 'up' : 'down'}`} aria-hidden="true" />
                </AdvancedToggle>
                <AdvancedContent id="image-generator-advanced-options" $open={showAdvanced}>
                    <AdvancedInner>
                        <SmallField>
                            <SmallLabel htmlFor={negativePromptId}>네거티브 프롬프트</SmallLabel>
                            <SmallInput
                                id={negativePromptId}
                                name="negativePrompt"
                                type="text"
                                placeholder="제외할 요소를 적어주세요…"
                                value={negativePrompt}
                                onChange={(event) => setNegativePrompt(event.target.value)}
                                autoComplete="off"
                            />
                        </SmallField>

                        <ControlGrid>
                            <SmallField>
                                <SmallLabel htmlFor={widthId}>너비</SmallLabel>
                                <SmallInput
                                    id={widthId}
                                    name="width"
                                    type="number"
                                    min={64}
                                    max={4096}
                                    inputMode="numeric"
                                    value={width}
                                    onChange={(event) => handleDimensionChange(Number(event.target.value) || width, height)}
                                />
                            </SmallField>
                            <SmallField>
                                <SmallLabel htmlFor={heightId}>높이</SmallLabel>
                                <SmallInput
                                    id={heightId}
                                    name="height"
                                    type="number"
                                    min={64}
                                    max={4096}
                                    inputMode="numeric"
                                    value={height}
                                    onChange={(event) => handleDimensionChange(width, Number(event.target.value) || height)}
                                />
                            </SmallField>
                        </ControlGrid>

                        {referenceImage ? (
                            <PreviewContainer>
                                <PreviewImg src={referenceImage} alt="참조 이미지 미리보기" />
                                <RemoveButton
                                    type="button"
                                    aria-label="참조 이미지 삭제"
                                    onClick={() => setReferenceImage(null)}
                                >
                                    <i className="fas fa-times" aria-hidden="true" />
                                </RemoveButton>
                            </PreviewContainer>
                        ) : (
                            <>
                                <UploadZone
                                    type="button"
                                    $dragging={isDragging}
                                    aria-label="참조 이미지 업로드"
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        setIsDragging(true);
                                    }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                >
                                    <UploadIcon className="fas fa-cloud-upload-alt" aria-hidden="true" />
                                    <UploadText>참조 이미지 업로드</UploadText>
                                </UploadZone>
                                <HiddenInput
                                    id={fileInputId}
                                    name="referenceImage"
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/*"
                                    aria-label="참조 이미지 파일 선택"
                                    onChange={handleImageUpload}
                                />
                            </>
                        )}
                    </AdvancedInner>
                </AdvancedContent>
            </Section>

            <GenerateButton
                type="button"
                $generating={isGenerating}
                onClick={handleGenerateClick}
                disabled={isGenerating}
            >
                {isGenerating ? (
                    <>
                        <LoadingSpinner aria-hidden="true" />
                        생성 중…
                    </>
                ) : (
                    <>
                        <i className={generationMode === 'image' ? 'fas fa-wand-magic-sparkles' : 'fas fa-film'} aria-hidden="true" />
                        {modeLabel} 생성
                    </>
                )}
            </GenerateButton>

            <HelperText aria-live="polite">
                현재 크기: {width}x{height} · 비율: {aspectRatio}
            </HelperText>
        </Container>
    );
}
