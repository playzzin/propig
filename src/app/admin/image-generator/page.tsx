'use client';

import Image from 'next/image';
import { toast } from 'sonner';
import ImageGeneratorControls from '@/components/image-generator/ImageGeneratorControls';
import ImageGallery from '@/components/image-generator/ImageGallery';
import { useAlbumAndLogoSync, useImageGeneratorControls } from './hooks';
import * as S from './ImageGenerator.styles';

export default function ImageGeneratorPage() {
    const {
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
        handleGenerate,
    } = useImageGeneratorControls();

    const {
        isFullscreen, setIsFullscreen,
        isSaveToAlbumOpen, setIsSaveToAlbumOpen,
        logoTargetSiteId, setLogoTargetSiteId,
        isApplyingLogo, handleSetAsLogo,
        saveToAlbumMutation,
        albums, isAlbumsLoading, logoTargetOptions,
        menuSitesQuery,
    } = useAlbumAndLogoSync(activeImage);

    const isGenerating = generateMutation.isPending;
    const modeLabel = generationMode === 'video' ? '동영상' : '이미지';
    const emptyIconClass = generationMode === 'video' ? 'fas fa-film' : 'fas fa-wand-magic-sparkles';

    const handleDownload = async () => {
        if (!activeImage) return;

        try {
            const response = await fetch(activeImage.url);
            if (!response.ok) throw new Error('Network response was not ok');

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `ai-generated-${activeImage.id}.${activeImage.type === 'video' ? 'mp4' : 'png'}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            toast.success('파일을 다운로드했습니다.');
        } catch (error) {
            console.error('Download via fetch failed, falling back to window.open:', error);

            const link = document.createElement('a');
            link.href = activeImage.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.info('직접 다운로드가 막혀 새 창으로 열었습니다.');
        }
    };

    const handleExtractFrame = () => {
        const videoElement = document.getElementById('preview-video') as HTMLVideoElement | null;
        if (!videoElement) return;

        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        setReferenceImage(canvas.toDataURL('image/png'));
        toast.success('현재 프레임을 참조 이미지로 설정했습니다.');
    };

    const handleUseAsReference = async () => {
        if (!activeImage) return;

        try {
            const response = await fetch(activeImage.url);
            if (!response.ok) throw new Error('Network response was not ok');

            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
                setReferenceImage(reader.result as string);
                toast.success('현재 이미지를 참조 이미지로 설정했습니다.');
            };
            reader.readAsDataURL(blob);
        } catch (error) {
            console.error('Fetch failed for reference image, setting URL directly:', error);
            setReferenceImage(activeImage.url);
            toast.success('현재 이미지를 참조 이미지로 설정했습니다.');
        }
    };

    return (
        <S.PageContainer>
            <S.ControlsPanel aria-label="생성 설정">
                <ImageGeneratorControls
                    prompt={prompt}
                    setPrompt={setPrompt}
                    negativePrompt={negativePrompt}
                    setNegativePrompt={setNegativePrompt}
                    aspectRatio={aspectRatio}
                    setAspectRatio={(value) => setAspectRatio(value)}
                    width={width}
                    setWidth={setWidth}
                    height={height}
                    setHeight={setHeight}
                    stylePreset={stylePreset}
                    setStylePreset={setStylePreset}
                    referenceImage={referenceImage}
                    setReferenceImage={setReferenceImage}
                    isGenerating={isGenerating}
                    onGenerate={handleGenerate}
                    provider={provider}
                    setProvider={setProvider}
                    generationMode={generationMode}
                    setGenerationMode={setGenerationMode}
                />
            </S.ControlsPanel>

            <S.CanvasArea aria-label="생성 결과 미리보기">
                <S.CanvasToolbar>
                    <S.ToolbarInfo>
                        <S.StatusDot $generating={isGenerating} $hasImage={Boolean(activeImage)} />
                        <span>{isGenerating ? 'AI 생성 중…' : activeImage ? '미리보기' : '대기 중'}</span>
                    </S.ToolbarInfo>
                    <S.ToolbarActions>
                        <S.IconButton
                            type="button"
                            onClick={handleUseAsReference}
                            disabled={!activeImage}
                            aria-label="현재 결과를 참조 이미지로 사용"
                            title="참조 이미지로 사용"
                        >
                            <i className="fas fa-reply" aria-hidden="true" />
                        </S.IconButton>
                        <S.IconButton
                            type="button"
                            onClick={() => setIsFullscreen(true)}
                            disabled={!activeImage}
                            aria-label="전체 화면으로 보기"
                            title="전체 화면"
                        >
                            <i className="fas fa-expand" aria-hidden="true" />
                        </S.IconButton>
                        <S.IconButton
                            type="button"
                            onClick={handleDownload}
                            disabled={!activeImage}
                            aria-label="현재 결과 다운로드"
                            title="다운로드"
                        >
                            <i className="fas fa-download" aria-hidden="true" />
                        </S.IconButton>
                    </S.ToolbarActions>
                </S.CanvasToolbar>

                <S.CanvasContent>
                    {activeImage ? (
                        <S.PreviewWrap>
                            {activeImage.type === 'video' ? (
                                <S.PreviewVideo id="preview-video" src={activeImage.url} controls autoPlay loop />
                            ) : (
                                <S.PreviewImage src={activeImage.url} alt={activeImage.prompt} />
                            )}
                            <S.PreviewOverlay>
                                <S.OverlayPrompt>{activeImage.prompt}</S.OverlayPrompt>
                                <S.OverlayActions>
                                    {activeImage.type === 'video' ? (
                                        <S.ActionButton type="button" onClick={handleExtractFrame}>
                                            <i className="fas fa-camera" aria-hidden="true" />
                                            프레임 추출
                                        </S.ActionButton>
                                    ) : (
                                        <>
                                            <S.ActionButton type="button" onClick={handleUseAsReference}>
                                                <i className="fas fa-reply" aria-hidden="true" />
                                                참조로 사용
                                            </S.ActionButton>
                                            <S.ActionSelect
                                                value={logoTargetSiteId}
                                                onChange={(event) => setLogoTargetSiteId(event.target.value)}
                                                disabled={menuSitesQuery.isLoading || isApplyingLogo}
                                                aria-label="로고를 적용할 사이트 모드 선택"
                                            >
                                                <option value="">로고 적용 대상 선택</option>
                                                {logoTargetOptions.map((site) => (
                                                    <option key={site.siteId} value={site.siteId}>
                                                        {site.name}
                                                    </option>
                                                ))}
                                            </S.ActionSelect>
                                            <S.ActionButton
                                                type="button"
                                                $primary
                                                onClick={handleSetAsLogo}
                                                disabled={!logoTargetSiteId || isApplyingLogo}
                                            >
                                                <i className="fas fa-check" aria-hidden="true" />
                                                로고 설정
                                            </S.ActionButton>
                                        </>
                                    )}
                                    <S.ActionButton type="button" onClick={handleDownload}>
                                        <i className="fas fa-download" aria-hidden="true" />
                                        다운로드
                                    </S.ActionButton>
                                    <S.ActionButton type="button" onClick={() => setIsSaveToAlbumOpen(true)}>
                                        <i className="fas fa-folder-plus" aria-hidden="true" />
                                        사진첩에 추가
                                    </S.ActionButton>
                                </S.OverlayActions>
                            </S.PreviewOverlay>
                        </S.PreviewWrap>
                    ) : (
                        <S.EmptyState>
                            <S.EmptyIcon className={emptyIconClass} aria-hidden="true" />
                            <S.EmptyTitle>AI {modeLabel} 생성</S.EmptyTitle>
                            <S.EmptyDesc>
                                왼쪽 설정에서 프롬프트를 입력하면 이 영역에 결과가 표시됩니다.
                                크기와 스타일을 먼저 고르면 결과 확인이 더 쉽습니다.
                            </S.EmptyDesc>
                        </S.EmptyState>
                    )}

                    {isGenerating ? (
                        <S.LoadingOverlay role="status" aria-live="polite">
                            <S.Spinner aria-hidden="true" />
                            <S.LoadingText>
                                <h4>AI가 {modeLabel}를 생성하고 있습니다</h4>
                                <p>완료될 때까지 잠시만 기다려 주세요…</p>
                            </S.LoadingText>
                        </S.LoadingOverlay>
                    ) : null}
                </S.CanvasContent>
            </S.CanvasArea>

            <S.GalleryPanel aria-label="생성 기록">
                <ImageGallery
                    initialImages={[]}
                    onSelect={(image) => setActiveImage(image)}
                    selectedId={activeImage?.id}
                    onUpdated={(image) => {
                        if (activeImage?.id === image.id) setActiveImage(image);
                    }}
                    onDeleted={(deletedId) => {
                        if (activeImage?.id === deletedId) setActiveImage(null);
                    }}
                />
            </S.GalleryPanel>

            {isFullscreen && activeImage ? (
                <S.FullscreenModal role="dialog" aria-modal="true" aria-label="전체 화면 미리보기" onClick={() => setIsFullscreen(false)}>
                    <S.FullscreenClose type="button" aria-label="전체 화면 닫기" onClick={() => setIsFullscreen(false)}>
                        <i className="fas fa-times" aria-hidden="true" />
                    </S.FullscreenClose>
                    <S.FullscreenImage src={activeImage.url} alt={activeImage.prompt} onClick={(event) => event.stopPropagation()} />
                </S.FullscreenModal>
            ) : null}

            {isSaveToAlbumOpen && activeImage ? (
                <S.SaveToAlbumOverlay onClick={() => setIsSaveToAlbumOpen(false)}>
                    <S.SaveToAlbumModal role="dialog" aria-modal="true" aria-labelledby="save-to-album-title" onClick={(event) => event.stopPropagation()}>
                        <S.AlbumModalHeader>
                            <h3 id="save-to-album-title">
                                <i className="fas fa-folder-plus" aria-hidden="true" style={{ marginRight: 8, color: 'var(--primary)' }} />
                                사진첩에 추가
                            </h3>
                            <S.AlbumModalClose type="button" aria-label="사진첩 추가 닫기" onClick={() => setIsSaveToAlbumOpen(false)}>
                                <i className="fas fa-times" aria-hidden="true" />
                            </S.AlbumModalClose>
                        </S.AlbumModalHeader>
                        <S.AlbumList>
                            {isAlbumsLoading ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                                    사진첩 목록을 불러오는 중…
                                </p>
                            ) : albums.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                                    사진첩이 없습니다.<br />
                                    사진첩 페이지에서 먼저 카테고리를 만들어 주세요.
                                </p>
                            ) : (
                                albums.map((album) => (
                                    <S.AlbumItem
                                        key={album.id}
                                        type="button"
                                        onClick={() => saveToAlbumMutation.mutate(album.id!)}
                                        disabled={saveToAlbumMutation.isPending}
                                    >
                                        <div className="thumb">
                                            {album.coverUrl ? (
                                                <Image src={album.coverUrl} alt={album.title} fill sizes="36px" style={{ objectFit: 'cover' }} />
                                            ) : (
                                                <i className="fas fa-images" aria-hidden="true" />
                                            )}
                                        </div>
                                        <div className="info">
                                            <div className="name">{album.title}</div>
                                            <div className="count">{album.photoItems.length}개</div>
                                        </div>
                                        <i className="fas fa-chevron-right" aria-hidden="true" style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }} />
                                    </S.AlbumItem>
                                ))
                            )}
                        </S.AlbumList>
                    </S.SaveToAlbumModal>
                </S.SaveToAlbumOverlay>
            ) : null}
        </S.PageContainer>
    );
}
