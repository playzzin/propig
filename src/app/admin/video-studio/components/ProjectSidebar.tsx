import React from 'react';
import type { PhotoItem } from '@/services/photoService';
import type {
    VideoStudioAspectRatio,
    VideoStudioProject,
    VideoStudioProjectStarterSource,
    VideoStudioResolution,
} from '@/lib/video-studio';
import * as S from './VideoStudioStyles';

type StarterImageSelection = {
    url: string;
    source: VideoStudioProjectStarterSource;
    albumId?: string | null;
    photoId?: string | null;
    storagePath?: string | null;
    label?: string | null;
};

interface ProjectSidebarProps {
    projects: VideoStudioProject[];
    selectedProjectId: string | null;
    setSelectedProjectId: (id: string | null) => void;
    setSelectedClipId: (id: string | null) => void;
    setReferenceImage: (url: string | null) => void;
    photoAlbums: Array<{ id?: string; title: string; photoItems: PhotoItem[] }>;
    isPhotoAlbumsLoading: boolean;
    starterProjectCount: number;
    pendingProjectJobCount: number;
    readyClipCount: number;
    totalClipCount: number;
    projectTitle: string;
    setProjectTitle: (v: string) => void;
    projectSynopsis: string;
    setProjectSynopsis: (v: string) => void;
    projectAspectRatio: VideoStudioAspectRatio;
    setProjectAspectRatio: (v: VideoStudioAspectRatio) => void;
    projectResolution: VideoStudioResolution;
    setProjectResolution: (v: VideoStudioResolution) => void;
    projectStarterSource: VideoStudioProjectStarterSource;
    setProjectStarterSource: (v: VideoStudioProjectStarterSource) => void;
    projectStarterAlbumId: string;
    setProjectStarterAlbumId: (v: string) => void;
    starterAlbumItems: PhotoItem[];
    projectStarterImage: StarterImageSelection | null;
    setProjectStarterImage: (v: StarterImageSelection | null) => void;
    starterUploading: boolean;
    handleSelectStarterPhoto: (item: PhotoItem) => void;
    handleStarterImageUpload: (file: File | null) => void;
    handleApplyStarterImageToProject: () => void;
    handleClearStarterImageFromProject: () => void;
    handleCreateProject: () => void;
    working: boolean;
}

export function ProjectSidebar({
    projects,
    selectedProjectId,
    setSelectedProjectId,
    setSelectedClipId,
    setReferenceImage,
    photoAlbums,
    isPhotoAlbumsLoading,
    starterProjectCount,
    pendingProjectJobCount,
    readyClipCount,
    totalClipCount,
    projectTitle,
    setProjectTitle,
    projectSynopsis,
    setProjectSynopsis,
    projectAspectRatio,
    setProjectAspectRatio,
    projectResolution,
    setProjectResolution,
    projectStarterSource,
    setProjectStarterSource,
    projectStarterAlbumId,
    setProjectStarterAlbumId,
    starterAlbumItems,
    projectStarterImage,
    setProjectStarterImage,
    starterUploading,
    handleSelectStarterPhoto,
    handleStarterImageUpload,
    handleApplyStarterImageToProject,
    handleClearStarterImageFromProject,
    handleCreateProject,
    working,
}: ProjectSidebarProps) {
    const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

    return (
        <S.Left>
            <S.Section>
                <S.Title>1. 시작</S.Title>
                <S.Copy>이름과 사진만 정하면 바로 시작할 수 있습니다.</S.Copy>
                <S.BadgeRow style={{ marginTop: 14 }}>
                    <S.Badge>{`${projects.length}개 프로젝트`}</S.Badge>
                    <S.Badge>{`${starterProjectCount}개 사진 연결`}</S.Badge>
                    <S.Badge>{`${pendingProjectJobCount}개 진행 중`}</S.Badge>
                </S.BadgeRow>

                {selectedProject ? (
                    <S.Panel style={{ marginTop: 16 }}>
                        <S.SectionLabel>선택됨</S.SectionLabel>
                        <div style={{ fontWeight: 800, fontSize: '0.98rem', marginBottom: 6 }}>
                            {selectedProject.title}
                        </div>
                        {selectedProject.synopsis ? <S.Copy style={{ margin: 0 }}>{selectedProject.synopsis}</S.Copy> : null}
                        <S.BadgeRow style={{ marginTop: 12 }}>
                            <S.Badge>{selectedProject.aspectRatio}</S.Badge>
                            <S.Badge>{selectedProject.resolution}</S.Badge>
                            <S.Badge>{`${totalClipCount}개 컷`}</S.Badge>
                            <S.Badge>{`${readyClipCount}개 준비`}</S.Badge>
                            {selectedProject.starterImageUrl ? <S.Badge>시작 사진 연결</S.Badge> : null}
                        </S.BadgeRow>
                    </S.Panel>
                ) : null}
            </S.Section>

            <S.Section>
                <S.SectionLabel>새 프로젝트</S.SectionLabel>
                <S.FieldGroup>
                    <S.FieldLabel htmlFor="video-studio-project-title">이름</S.FieldLabel>
                    <S.Input
                        id="video-studio-project-title"
                        name="projectTitle"
                        autoComplete="off"
                        value={projectTitle}
                        onChange={(event) => setProjectTitle(event.target.value)}
                        placeholder="이름 입력"
                    />
                </S.FieldGroup>

                <S.FieldGroup style={{ marginTop: 10 }}>
                    <S.FieldLabel htmlFor="video-studio-project-synopsis">설명</S.FieldLabel>
                    <S.Textarea
                        id="video-studio-project-synopsis"
                        name="projectSynopsis"
                        value={projectSynopsis}
                        onChange={(event) => setProjectSynopsis(event.target.value)}
                        placeholder="설명 입력"
                        style={{ minHeight: 84 }}
                    />
                </S.FieldGroup>

                <S.Row style={{ marginTop: 10 }}>
                    <S.FieldGroup>
                        <S.FieldLabel htmlFor="video-studio-project-aspect-ratio">비율</S.FieldLabel>
                        <S.Select
                            id="video-studio-project-aspect-ratio"
                            name="aspectRatio"
                            value={projectAspectRatio}
                            onChange={(event) => setProjectAspectRatio(event.target.value as VideoStudioAspectRatio)}
                        >
                            <option value="16:9">16:9</option>
                            <option value="9:16">9:16</option>
                            <option value="1:1">1:1</option>
                            <option value="4:3">4:3</option>
                            <option value="3:4">3:4</option>
                        </S.Select>
                    </S.FieldGroup>
                    <S.FieldGroup>
                        <S.FieldLabel htmlFor="video-studio-project-resolution">해상도</S.FieldLabel>
                        <S.Select
                            id="video-studio-project-resolution"
                            name="resolution"
                            value={projectResolution}
                            onChange={(event) => setProjectResolution(event.target.value as VideoStudioResolution)}
                        >
                            <option value="720p">720p</option>
                            <option value="480p">480p</option>
                        </S.Select>
                    </S.FieldGroup>
                </S.Row>

                <S.CalloutPanel style={{ marginTop: 12 }}>
                    <S.SectionLabel>사진</S.SectionLabel>
                    <S.Tabs>
                        <S.TabButton
                            type="button"
                            $active={projectStarterSource === 'album'}
                            onClick={() => setProjectStarterSource('album')}
                        >
                            사진첩
                        </S.TabButton>
                        <S.TabButton
                            type="button"
                            $active={projectStarterSource === 'upload'}
                            onClick={() => setProjectStarterSource('upload')}
                        >
                            업로드
                        </S.TabButton>
                    </S.Tabs>

                    {projectStarterSource === 'album' ? (
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <S.FieldGroup>
                                <S.FieldLabel htmlFor="video-studio-starter-album">앨범</S.FieldLabel>
                                <S.Select
                                    id="video-studio-starter-album"
                                    name="starterAlbum"
                                    value={projectStarterAlbumId}
                                    onChange={(event) => setProjectStarterAlbumId(event.target.value)}
                                    disabled={photoAlbums.length === 0}
                                >
                                    {photoAlbums.length === 0 ? (
                                        <option>앨범 없음</option>
                                    ) : (
                                        photoAlbums.map((album) => (
                                            <option key={album.id || album.title} value={album.id}>
                                                {album.title} ({album.photoItems.length})
                                            </option>
                                        ))
                                    )}
                                </S.Select>
                            </S.FieldGroup>

                            {isPhotoAlbumsLoading ? (
                                <S.Copy style={{ margin: 0 }}>불러오는 중</S.Copy>
                            ) : starterAlbumItems.length > 0 ? (
                                <S.PhotoGrid>
                                    {starterAlbumItems.map((item) => (
                                        <S.PhotoTile
                                            key={item.id}
                                            type="button"
                                            $active={projectStarterImage?.photoId === item.id}
                                            onClick={() => handleSelectStarterPhoto(item)}
                                        >
                                            <img
                                                src={item.url}
                                                alt={item.fileName || item.id}
                                                loading="lazy"
                                                width={88}
                                                height={88}
                                            />
                                            <span>{item.fileName || item.id}</span>
                                        </S.PhotoTile>
                                    ))}
                                </S.PhotoGrid>
                            ) : (
                                <S.Copy style={{ margin: 0 }}>사진 없음</S.Copy>
                            )}
                        </div>
                    ) : (
                        <div style={{ marginTop: 12 }}>
                            <S.Upload>
                                {starterUploading ? '업로드 중' : '사진 업로드'}
                                <input
                                    type="file"
                                    hidden
                                    name="starterImageUpload"
                                    aria-label="프로젝트 시작 사진 업로드"
                                    accept="image/*"
                                    disabled={starterUploading}
                                    onChange={(event) => void handleStarterImageUpload(event.target.files?.[0] || null)}
                                />
                            </S.Upload>
                        </div>
                    )}

                    {projectStarterImage ? (
                        <S.Panel style={{ marginTop: 12 }}>
                            <S.StarterPreview>
                                <img
                                    src={projectStarterImage.url}
                                    alt="프로젝트 시작 사진"
                                    loading="lazy"
                                    width={92}
                                    height={92}
                                />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>선택한 사진</div>
                                    {projectStarterImage.label ? (
                                        <S.Copy style={{ margin: 0 }}>{projectStarterImage.label}</S.Copy>
                                    ) : null}
                                </div>
                            </S.StarterPreview>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                                <S.Button type="button" $ghost onClick={() => setProjectStarterImage(null)}>
                                    지우기
                                </S.Button>
                                <S.Button
                                    type="button"
                                    $ghost
                                    onClick={handleApplyStarterImageToProject}
                                    disabled={!selectedProject || working}
                                >
                                    프로젝트에 저장
                                </S.Button>
                                <S.Button
                                    type="button"
                                    $ghost
                                    onClick={handleClearStarterImageFromProject}
                                    disabled={!selectedProject?.starterImageUrl || working}
                                >
                                    연결 해제
                                </S.Button>
                            </div>
                        </S.Panel>
                    ) : null}
                </S.CalloutPanel>

                <div style={{ marginTop: 12 }}>
                    <S.Button type="button" onClick={handleCreateProject} disabled={working}>
                        프로젝트 만들기
                    </S.Button>
                </div>
            </S.Section>

            <S.Section>
                <S.Title>내 프로젝트</S.Title>
            </S.Section>
            <S.ProjectListWrapper>
                {projects.map((project) => (
                    <S.ProjectButton
                        key={project.id}
                        type="button"
                        $active={project.id === selectedProjectId}
                        onClick={() => {
                            setSelectedProjectId(project.id);
                            setSelectedClipId(null);
                            setReferenceImage(null);
                        }}
                    >
                        <strong>{project.title}</strong>
                        {project.synopsis ? <small>{project.synopsis}</small> : <small>설명 없음</small>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            <S.Badge>{project.aspectRatio}</S.Badge>
                            <S.Badge>{project.resolution}</S.Badge>
                            <S.Badge>{`${project.clipCount || 0}개 컷`}</S.Badge>
                            {project.starterImageUrl ? <S.Badge>사진 시작</S.Badge> : null}
                        </div>
                    </S.ProjectButton>
                ))}
            </S.ProjectListWrapper>
        </S.Left>
    );
}
