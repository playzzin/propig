'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { ImageStoryboardGenerationPayload } from '@/schemas/imageStoryboard';
import {
    generateImage,
    saveGenerationHistory,
    type SaveHistoryParams,
} from '@/services/imageGenerationService';
import { MAX_IMAGE_REFERENCE_REQUESTS } from '@/types/imageReference';

export type StoryboardGeneratedImage = {
    id: string;
    url: string;
    storagePath?: string;
};

function readStoryboardGenerationProvenance(): SaveHistoryParams['artifactProvenance'] {
    if (typeof window === 'undefined' || window.location.pathname !== '/admin/storyboard') return null;

    const params = new URLSearchParams(window.location.search);
    const storyboardId = params.get('storyboard')?.trim();
    if (
        !storyboardId
        || storyboardId.length > 240
        || storyboardId.includes('/')
        || storyboardId === '.'
        || storyboardId === '..'
    ) return null;

    const sceneId = params.get('scene')?.trim() || null;
    return {
        kind: 'storyboard-scene',
        storyboardId,
        sceneId: sceneId
            && sceneId.length <= 240
            && !sceneId.includes('/')
            && sceneId !== '.'
            && sceneId !== '..'
            ? sceneId
            : null,
    };
}

export function useStoryboardImageGeneration() {
    const { currentUser } = useAuth();

    const generateMutation = useMutation({
        mutationFn: async (payload: ImageStoryboardGenerationPayload): Promise<StoryboardGeneratedImage> => {
            const prompt = payload.prompt.trim();
            if (!prompt) {
                throw new Error('프롬프트를 입력해 주세요.');
            }
            if (!currentUser) {
                throw new Error('로그인이 필요합니다.');
            }

            const payloadReferences = payload.referenceImages ?? [];
            const referenceImages = payload.referenceImage
                && !payloadReferences.some((reference) => reference.image === payload.referenceImage)
                ? [
                    ...payloadReferences,
                    { image: payload.referenceImage, role: 'style' as const },
                ].slice(0, MAX_IMAGE_REFERENCE_REQUESTS)
                : payloadReferences;
            const referenceImage = payload.referenceImage ?? referenceImages[0]?.image;
            const authToken = await currentUser.getIdToken();
            const result = await generateImage({
                prompt,
                negativePrompt: payload.negativePrompt,
                aspectRatio: payload.aspectRatio,
                width: payload.width,
                height: payload.height,
                stylePreset: payload.stylePreset,
                resourceMode: payload.resourceMode,
                image: referenceImages.length ? undefined : referenceImage,
                referenceImages: referenceImages.length ? referenceImages : undefined,
                provider: 'openrouter',
                authToken,
            });

            if (!result.success || !result.imageUrl || !result.imageId) {
                throw new Error(result.error || '이미지 생성에 실패했습니다.');
            }

            toast.loading('이미지 저장 중...', { id: 'storyboard-image-save' });
            const { downloadUrl, historyId, storagePath } = await saveGenerationHistory({
                userId: currentUser.uid,
                url: result.imageUrl,
                type: 'image',
                generatedId: result.imageId,
                prompt,
                negativePrompt: payload.negativePrompt,
                provider: 'openrouter',
                artifactProvenance: readStoryboardGenerationProvenance(),
            });
            toast.success('이미지 생성과 저장이 완료되었습니다.', {
                id: 'storyboard-image-save',
            });

            return {
                id: historyId,
                url: downloadUrl,
                storagePath,
            };
        },
        onError: (error) => {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '생성 중 오류가 발생했습니다.', {
                id: 'storyboard-image-save',
            });
        },
    });

    return {
        generateMutation,
        generateStoryboardScene: generateMutation.mutateAsync,
    };
}
