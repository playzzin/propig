import { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import { useAuth } from '@/contexts/AuthContext';
import { useSystem } from '@/contexts/SystemContext';
import { useMenuSitesQuery } from '@/hooks/useMenuSitesQuery';
import { PHOTO_ALBUMS_QUERY_KEY, usePhotoAlbumsQuery } from '@/hooks/usePhotoAlbumsQuery';
import { photoService } from '@/services/photoService';
import { generateImage, generateVideo, saveGenerationHistory } from '@/services/imageGenerationService';

export type GeneratedImage = {
    id: string;
    url: string;
    prompt: string;
    createdAt: Date;
    type?: 'image' | 'video';
    provider?: 'gemini' | 'grok';
};

export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:3' | '3:4' | 'custom';

export function useImageGeneratorControls() {
    const [provider, setProvider] = useState<'gemini' | 'grok'>('gemini');
    const [generationMode, setGenerationMode] = useState<'image' | 'video'>('image');
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [width, setWidth] = useState<number>(1024);
    const [height, setHeight] = useState<number>(1024);
    const [stylePreset, setStylePreset] = useState<string>('none');
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const [activeImage, setActiveImage] = useState<GeneratedImage | null>(null);
    const didApplyInitialParamsRef = useRef(false);

    const { currentUser } = useAuth();

    useEffect(() => {
        if (didApplyInitialParamsRef.current || typeof window === 'undefined') return;
        didApplyInitialParamsRef.current = true;

        const params = new URLSearchParams(window.location.search);
        const source = params.get('source');
        const preset = params.get('preset') || params.get('target');
        const queryPrompt = params.get('prompt');
        const isProjectBoardPreset =
            source === 'corp-project-board' ||
            preset === 'project-board-cover' ||
            preset === 'project-board-task' ||
            preset === 'cover' ||
            preset === 'task';

        if (!isProjectBoardPreset && !queryPrompt) return;

        const isTaskPreset = preset === 'project-board-task' || preset === 'task';
        queueMicrotask(() => {
            setGenerationMode('image');
            setAspectRatio(isTaskPreset ? '4:3' : '16:9');
            setWidth(isTaskPreset ? 1184 : 1536);
            setHeight(isTaskPreset ? 864 : 864);

            if (queryPrompt?.trim()) {
                setPrompt(queryPrompt.trim());
            }
        });
    }, []);

    const generateMutation = useMutation({
        mutationFn: async (): Promise<GeneratedImage> => {
            const trimmedPrompt = prompt.trim();
            if (!trimmedPrompt) {
                throw new Error('프롬프트를 입력해 주세요.');
            }

            if (!currentUser) {
                throw new Error('로그인이 필요합니다.');
            }

            if (generationMode === 'video') {
                const authToken = await currentUser.getIdToken();
                const result = await generateVideo({
                    prompt: trimmedPrompt,
                    image: referenceImage || undefined,
                    provider,
                    authToken,
                });

                if (!result.success || !result.videoUrl || !result.videoId) {
                    throw new Error(result.error || '비디오 생성에 실패했습니다.');
                }

                try {
                    toast.loading('비디오 저장 중...', { id: 'image-generator-save' });
                    const { downloadUrl, historyId } = await saveGenerationHistory({
                        userId: currentUser.uid,
                        url: result.videoUrl,
                        type: 'video',
                        generatedId: result.videoId,
                        prompt: trimmedPrompt,
                        provider,
                    });
                    toast.success('비디오 생성과 저장이 완료되었습니다.', {
                        id: 'image-generator-save',
                    });

                    return {
                        id: historyId,
                        url: downloadUrl,
                        prompt: trimmedPrompt,
                        createdAt: new Date(),
                        type: 'video',
                        provider,
                    };
                } catch (error) {
                    console.error(error);
                    toast.error('비디오 저장에 실패했습니다.', {
                        id: 'image-generator-save',
                    });
                    throw new Error('비디오 저장에 실패했습니다.');
                }
            }

            const authToken = await currentUser.getIdToken();
            const result = await generateImage({
                prompt: trimmedPrompt,
                negativePrompt,
                aspectRatio,
                width,
                height,
                stylePreset,
                image: referenceImage || undefined,
                provider,
                authToken,
            });

            if (!result.success || !result.imageUrl || !result.imageId) {
                throw new Error(result.error || '이미지 생성에 실패했습니다.');
            }

            try {
                toast.loading('이미지 저장 중...', { id: 'image-generator-save' });
                const { downloadUrl, historyId } = await saveGenerationHistory({
                    userId: currentUser.uid,
                    url: result.imageUrl,
                    type: 'image',
                    generatedId: result.imageId,
                    prompt: trimmedPrompt,
                    negativePrompt,
                    provider,
                });
                toast.success('이미지 생성과 저장이 완료되었습니다.', {
                    id: 'image-generator-save',
                });

                return {
                    id: historyId,
                    url: downloadUrl,
                    prompt: trimmedPrompt,
                    createdAt: new Date(),
                    type: 'image',
                    provider,
                };
            } catch (error) {
                console.error(error);
                toast.error('이미지 저장에 실패했습니다.', {
                    id: 'image-generator-save',
                });
                throw new Error('이미지 저장에 실패했습니다.');
            }
        },
        onSuccess: (image) => {
            setActiveImage(image);
        },
        onError: (error) => {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '생성 중 오류가 발생했습니다.');
        },
    });

    const handleGenerate = () => {
        if (!prompt.trim()) {
            toast.error('프롬프트를 입력해 주세요.');
            return;
        }
        generateMutation.mutate();
    };

    return {
        provider, setProvider,
        generationMode, setGenerationMode,
        prompt, setPrompt,
        negativePrompt, setNegativePrompt,
        aspectRatio, setAspectRatio,
        width, setWidth,
        height, setHeight,
        stylePreset, setStylePreset,
        referenceImage, setReferenceImage,
        activeImage, setActiveImage,
        generateMutation,
        handleGenerate
    };
}

export function useAlbumAndLogoSync(activeImage: GeneratedImage | null) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSaveToAlbumOpen, setIsSaveToAlbumOpen] = useState(false);
    const [logoTargetSiteId, setLogoTargetSiteId] = useState('');
    const [isApplyingLogo, setIsApplyingLogo] = useState(false);

    const { updateEnvLogo } = useSystem();
    const queryClient = useQueryClient();
    const photoAlbumsQuery = usePhotoAlbumsQuery();
    const menuSitesQuery = useMenuSitesQuery();

    const albums = photoAlbumsQuery.data ?? [];
    const isAlbumsLoading = photoAlbumsQuery.isLoading;
    
    const logoTargetOptions = useMemo(
        () =>
            getSwitchableSiteEntries(menuSitesQuery.data ?? {}).map(([siteId, siteData]) => ({
                siteId,
                name: siteData.name,
            })),
        [menuSitesQuery.data],
    );

    const saveToAlbumMutation = useMutation({
        mutationFn: async (albumId: string) => {
            if (!activeImage) {
                throw new Error('저장할 이미지가 없습니다.');
            }

            await photoService.importFromAI(albumId, {
                url: activeImage.url,
                prompt: activeImage.prompt,
                type: activeImage.type, // 명시적으로 type 전달 (방어적 코딩)
            });

            return albumId;
        },
        onSuccess: async (albumId) => {
            const album = albums.find((item) => item.id === albumId);
            toast.success(`'${album?.title ?? '사진첩'}'에 저장되었습니다.`);
            setIsSaveToAlbumOpen(false);
            await queryClient.invalidateQueries({ queryKey: PHOTO_ALBUMS_QUERY_KEY });
        },
        onError: (error) => {
            console.error(error);
            toast.error('사진첩 저장에 실패했습니다.');
        },
    });

    const handleSetAsLogo = async () => {
        if (!activeImage) return;
        if (!logoTargetSiteId) {
            toast.error('로고를 적용할 사이트 모드를 선택하세요.');
            return;
        }

        const targetSite = logoTargetOptions.find((site) => site.siteId === logoTargetSiteId);

        setIsApplyingLogo(true);
        try {
            await updateEnvLogo(logoTargetSiteId, activeImage.url);
            toast.success(`${targetSite?.name ?? logoTargetSiteId} 로고로 적용했습니다.`);
        } catch (error) {
            console.error(error);
            toast.error('로고 적용에 실패했습니다.');
        } finally {
            setIsApplyingLogo(false);
        }
    };

    return {
        isFullscreen, setIsFullscreen,
        isSaveToAlbumOpen, setIsSaveToAlbumOpen,
        logoTargetSiteId, setLogoTargetSiteId,
        isApplyingLogo, handleSetAsLogo,
        saveToAlbumMutation,
        albums, isAlbumsLoading, logoTargetOptions,
        menuSitesQuery
    };
}
