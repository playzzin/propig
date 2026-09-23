'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { withFirebaseAuthRetry } from '@/lib/firebase-auth-retry';
import type {
    ImageStoryboard,
    StoryboardStorageCleanupAsset,
} from '@/schemas/imageStoryboard';
import {
    imageStoryboardService,
    type StoryboardCleanupFileInfo,
} from '@/services/imageStoryboardService';
import {
    videoStudioService,
    type VideoStudioStorageOverview,
} from '@/services/videoStudioService';

type StoryboardProjectFileManagerProps = {
    storyboardId: string | null;
    storyboard: ImageStoryboard;
    projectBusy: boolean;
    disabled?: boolean;
    onChange: (updater: (current: ImageStoryboard) => ImageStoryboard) => void;
};

const LOCAL_KIND_LABEL: Record<StoryboardStorageCleanupAsset['kind'], string> = {
    reference: '참조 사진',
    'background-music': '배경음악',
    'scene-image': '교체된 장면 이미지',
};

const VIDEO_KIND_LABEL = {
    video: '이전 렌더 영상',
    frame: '이전 프레임',
    other: '기타 렌더 파일',
} as const;

function formatBytes(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const amount = value / (1024 ** index);
    return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function fileNameFromPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] || path;
}

function storagePathFromFirebaseDownloadUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        const marker = '/o/';
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex < 0 || (url.hostname !== 'firebasestorage.googleapis.com' && url.hostname !== 'storage.googleapis.com')) {
            return null;
        }
        return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    } catch {
        return null;
    }
}

export default function StoryboardProjectFileManager(props: StoryboardProjectFileManagerProps) {
    const { currentUser } = useAuth();
    return <ProjectFileManager key={`${currentUser?.uid ?? 'signed-out'}:${props.storyboardId}:${props.storyboard.videoProduction.projectId}`} {...props} />;
}

function ProjectFileManager({
    storyboardId,
    storyboard,
    projectBusy,
    disabled = false,
    onChange,
}: StoryboardProjectFileManagerProps) {
    const { currentUser } = useAuth();
    const liveRef = useRef(true);
    const localInspectionRef = useRef(0);
    const videoInspectionRef = useRef(0);
    useEffect(() => {
        liveRef.current = true;
        return () => { liveRef.current = false; };
    }, []);
    const [localFiles, setLocalFiles] = useState<StoryboardCleanupFileInfo[]>([]);
    const [localStorageError, setLocalStorageError] = useState<string | null>(null);
    const [isInspectingLocal, setIsInspectingLocal] = useState(false);
    const [isDeletingLocal, setIsDeletingLocal] = useState(false);
    const [videoOverview, setVideoOverview] = useState<VideoStudioStorageOverview | null>(null);
    const [videoStorageError, setVideoStorageError] = useState<string | null>(null);
    const [isInspectingVideo, setIsInspectingVideo] = useState(false);
    const [isDeletingVideo, setIsDeletingVideo] = useState(false);

    const protectedLocalPaths = useMemo(() => new Set([
        ...storyboard.referenceAssets.flatMap((asset) => asset.storagePath ? [asset.storagePath] : []),
        ...(storyboard.videoProduction.backgroundMusicStoragePath
            ? [storyboard.videoProduction.backgroundMusicStoragePath]
            : []),
        ...storyboard.scenes.flatMap((scene) => {
            const path = scene.generatedImage?.storagePath
                || storagePathFromFirebaseDownloadUrl(scene.generatedImage?.url);
            return path ? [path] : [];
        }),
    ]), [storyboard.referenceAssets, storyboard.scenes, storyboard.videoProduction.backgroundMusicStoragePath]);
    const filteredAssets = useMemo(
        () => storyboard.reclaimableStorageAssets.filter((asset) => !protectedLocalPaths.has(asset.storagePath)),
        [protectedLocalPaths, storyboard.reclaimableStorageAssets],
    );
    // Keep inspection inputs stable when unrelated edits or live job updates replace the draft.
    const reclaimableAssetKey = JSON.stringify(filteredAssets);
    const reclaimableAssets = useMemo<StoryboardStorageCleanupAsset[]>(
        () => JSON.parse(reclaimableAssetKey), [reclaimableAssetKey]);
    const localFileById = useMemo(
        () => new Map(localFiles.map((file) => [file.id, file])),
        [localFiles],
    );
    const localReclaimableBytes = useMemo(
        () => localFiles.reduce((sum, file) => sum + (file.missing ? 0 : file.sizeBytes || 0), 0),
        [localFiles],
    );
    const protectedSourceCount = storyboard.referenceAssets.filter((asset) => asset.storagePath).length
        + (storyboard.videoProduction.backgroundMusicStoragePath ? 1 : 0);
    const isDisabled = disabled || projectBusy;
    const localInspectionComplete = !localStorageError && reclaimableAssets.every((asset) => localFileById.has(asset.id));

    const refreshLocalFiles = useCallback(async () => {
        const request = ++localInspectionRef.current;
        setLocalStorageError(null);
        setLocalFiles([]);
        if (!currentUser?.uid || !storyboardId || !reclaimableAssets.length) {
            setLocalFiles([]);
            setIsInspectingLocal(false);
            return;
        }

        setIsInspectingLocal(true);
        try {
            const files = await imageStoryboardService.inspectReclaimableStorageAssets(
                currentUser.uid,
                storyboardId,
                reclaimableAssets,
            );
            if (!liveRef.current || request !== localInspectionRef.current) return;
            setLocalFiles(files);
        } catch (error) {
            if (!liveRef.current || request !== localInspectionRef.current) return;
            const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
            setLocalStorageError(code === 'storage/unauthorized'
                ? '파일 접근 권한을 확인할 수 없습니다. 현재 계정으로 접근 가능한지 확인한 뒤 다시 시도해 주세요.'
                : '파일 용량을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
        } finally {
            if (liveRef.current && request === localInspectionRef.current) setIsInspectingLocal(false);
        }
    }, [currentUser?.uid, reclaimableAssets, storyboardId]);

    const refreshVideoFiles = useCallback(async () => {
        const request = ++videoInspectionRef.current;
        const projectId = storyboard.videoProduction.projectId;
        if (!currentUser || !projectId) {
            setVideoOverview(null);
            setVideoStorageError(null);
            return;
        }

        setIsInspectingVideo(true);
        try {
            const overview = await withFirebaseAuthRetry(currentUser, (authToken) =>
                videoStudioService.getProjectStorageOverview({
                    authToken,
                    projectId,
                }),
            );
            if (!liveRef.current || request !== videoInspectionRef.current) return;
            setVideoOverview(overview);
            setVideoStorageError(null);
        } catch {
            if (!liveRef.current || request !== videoInspectionRef.current) return;
            setVideoOverview(null);
            setVideoStorageError('영상 렌더 파일을 확인하지 못했습니다. 서버 연결과 프로젝트 접근 권한을 확인한 뒤 다시 시도해 주세요.');
        } finally {
            if (liveRef.current && request === videoInspectionRef.current) setIsInspectingVideo(false);
        }
    }, [currentUser, storyboard.videoProduction.projectId]);

    useEffect(() => {
        const inspection = localInspectionRef;
        void refreshLocalFiles();
        return () => { inspection.current++; };
    }, [refreshLocalFiles]);

    useEffect(() => {
        const inspection = videoInspectionRef;
        void refreshVideoFiles();
        return () => { inspection.current++; };
    }, [refreshVideoFiles]);

    const dismissCleanupAssets = useCallback((storagePaths: Set<string>) => {
        onChange((current) => ({
            ...current,
            reclaimableStorageAssets: current.reclaimableStorageAssets.filter(
                (asset) => !storagePaths.has(asset.storagePath),
            ),
        }));
    }, [onChange]);

    const handleDeleteLocalFiles = useCallback(async () => {
        if (!currentUser?.uid || !storyboardId || !reclaimableAssets.length || isDisabled || !localInspectionComplete || isInspectingLocal || isDeletingLocal) return;
        const confirmed = window.confirm(
            `정리 대기 파일 ${reclaimableAssets.length}개(${formatBytes(localReclaimableBytes)})를 완전히 삭제할까요?\n현재 참조 사진·배경음악·완성 영상은 삭제하지 않습니다.`,
        );
        if (!confirmed) return;

        setIsDeletingLocal(true);
        try {
            const result = await imageStoryboardService.deleteReclaimableStorageAssets(
                currentUser.uid,
                storyboardId,
                reclaimableAssets,
            );
            if (!liveRef.current) return;
            if (result.deletedStoragePaths.length) {
                dismissCleanupAssets(new Set(result.deletedStoragePaths));
            }
            if (result.failed.length) {
                toast.error(`${result.failed.length}개 파일을 삭제하지 못했습니다. 다시 시도해 주세요.`);
            } else {
                toast.success(`${result.deletedStoragePaths.length}개 파일을 정리했습니다.`);
            }
        } catch (error) {
            if (!liveRef.current) return;
            console.error('[StoryboardFileManager] local cleanup failed', error);
            toast.error(error instanceof Error ? error.message : '파일을 정리하지 못했습니다.');
        } finally {
            if (liveRef.current) {
                setIsDeletingLocal(false);
                void refreshLocalFiles();
            }
        }
    }, [currentUser?.uid, dismissCleanupAssets, isDisabled, isDeletingLocal, isInspectingLocal, localInspectionComplete, localReclaimableBytes, reclaimableAssets, refreshLocalFiles, storyboardId]);

    const handleDeleteVideoFiles = useCallback(async () => {
        const projectId = storyboard.videoProduction.projectId;
        if (!currentUser || !projectId || !videoOverview || !videoOverview.cleanupCandidates.length || isDisabled || isInspectingVideo || isDeletingVideo) return;
        if (videoOverview.cleanupLocked) {
            toast.info('현재 영상 제작이 끝난 뒤에 정리할 수 있습니다.');
            return;
        }
        const confirmed = window.confirm(
            `이전 렌더 파일 ${videoOverview.cleanupCandidateCount}개(${formatBytes(videoOverview.cleanupCandidateBytes)})를 삭제할까요?\n현재 장면, 최종 완성본, 진행 중 작업이 사용하는 파일은 보호됩니다.`,
        );
        if (!confirmed) return;

        setIsDeletingVideo(true);
        try {
            const result = await withFirebaseAuthRetry(currentUser, (authToken) =>
                videoStudioService.deleteProjectStorageResiduals({
                    authToken,
                    projectId,
                    storagePaths: videoOverview.cleanupCandidates.map((file) => file.path),
                }),
            );
            if (!liveRef.current) return;
            if (result.failed.length) {
                toast.error(`${result.failed.length}개 렌더 파일을 삭제하지 못했습니다.`);
            } else {
                toast.success(`${result.deletedStoragePaths.length}개 렌더 파일을 정리했습니다.`);
            }
            await refreshVideoFiles();
        } catch (error) {
            if (!liveRef.current) return;
            console.error('[StoryboardFileManager] video cleanup failed', error);
            toast.error(error instanceof Error ? error.message : '이전 렌더 파일을 정리하지 못했습니다.');
        } finally {
            if (liveRef.current) setIsDeletingVideo(false);
        }
    }, [currentUser, isDisabled, isDeletingVideo, isInspectingVideo, refreshVideoFiles, storyboard.videoProduction.projectId, videoOverview]);

    return (
        <ManagerSection id="storyboard-project-files" aria-labelledby="storyboard-file-manager-title">
            <ManagerHeader>
                <div>
                    <span>PROJECT STORAGE</span>
                    <h4 id="storyboard-file-manager-title">프로젝트 파일 관리</h4>
                    <p>현재 사용 중인 자료와 완성본은 보호하고, 교체·삭제 후 남은 파일만 확인해서 정리합니다.</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        void refreshLocalFiles();
                        void refreshVideoFiles();
                    }}
                    disabled={isInspectingLocal || isInspectingVideo || isDeletingLocal || isDeletingVideo}
                >
                    <i className={(isInspectingLocal || isInspectingVideo) ? 'fas fa-spinner fa-spin' : 'fas fa-rotate'} aria-hidden="true" />
                    새로 확인
                </button>
            </ManagerHeader>

            <StorageSummary aria-label="프로젝트 저장공간 요약" aria-live="polite">
                <SummaryMetric>
                    <i className="fas fa-shield-heart" aria-hidden="true" />
                    <span>보호 중</span>
                    <strong>{protectedSourceCount + (videoOverview?.protectedFileCount || 0)}개</strong>
                    <small>현재 사용 자료·완성본</small>
                </SummaryMetric>
                <SummaryMetric $tone="warning">
                    <i className="fas fa-box-archive" aria-hidden="true" />
                    <span>정리 대기</span>
                    <strong>{reclaimableAssets.length + (videoOverview?.cleanupCandidateCount || 0)}개</strong>
                    <small>삭제 전 최종 확인</small>
                </SummaryMetric>
                <SummaryMetric $tone="success">
                    <i className="fas fa-database" aria-hidden="true" />
                    <span>확보 가능</span>
                    <strong>{formatBytes(localReclaimableBytes + (videoOverview?.cleanupCandidateBytes || 0))}</strong>
                    <small>현재 확인된 파일 기준</small>
                </SummaryMetric>
            </StorageSummary>

            <StorageGroup>
                <StorageGroupHeader>
                    <div>
                        <i className="fas fa-images" aria-hidden="true" />
                        <div><strong>참조 사진 · 배경음악</strong><small>교체하거나 제거한 원본 파일</small></div>
                    </div>
                    <span>{reclaimableAssets.length ? `${reclaimableAssets.length}개 대기` : '정리할 파일 없음'}</span>
                </StorageGroupHeader>
                {reclaimableAssets.length ? (
                    <>
                        {localStorageError ? <StorageError role="status"><i className="fas fa-circle-info" aria-hidden="true" /><span>{localStorageError} 확인 전에는 파일을 삭제하지 않습니다.</span><button type="button" onClick={() => void refreshLocalFiles()}>다시 확인</button></StorageError> : null}
                        <StorageFileList>
                            {reclaimableAssets.map((asset) => {
                                const file = localFileById.get(asset.id);
                                return (
                                    <StorageFileRow key={asset.id}>
                                        <i className={asset.kind === 'background-music' ? 'fas fa-music' : 'fas fa-image'} aria-hidden="true" />
                                        <div>
                                            <strong>{asset.label}</strong>
                                            <span>{LOCAL_KIND_LABEL[asset.kind]} · {fileNameFromPath(asset.storagePath)}</span>
                                        </div>
                                        <small>{localStorageError ? '확인 실패' : file?.missing ? '이미 없음' : file?.sizeBytes !== undefined && file?.sizeBytes !== null ? formatBytes(file.sizeBytes) : isInspectingLocal ? '용량 확인 중' : '확인 필요'}</small>
                                    </StorageFileRow>
                                );
                            })}
                        </StorageFileList>
                        <CleanupActionButton
                            type="button"
                            onClick={() => void handleDeleteLocalFiles()}
                            disabled={isDisabled || isDeletingLocal || isInspectingLocal || !localInspectionComplete}
                        >
                            <i className={isDeletingLocal ? 'fas fa-spinner fa-spin' : 'fas fa-trash-can'} aria-hidden="true" />
                            {isDeletingLocal ? '정리 중…' : `${reclaimableAssets.length}개 파일 영구 삭제`}
                        </CleanupActionButton>
                    </>
                ) : (
                    <EmptyStorageState><i className="fas fa-circle-check" aria-hidden="true" /> 교체되거나 제거된 원본 파일이 없습니다.</EmptyStorageState>
                )}
            </StorageGroup>

            <StorageGroup>
                <StorageGroupHeader>
                    <div>
                        <i className="fas fa-film" aria-hidden="true" />
                        <div><strong>생성 영상 · 프레임</strong><small>클립을 다시 만들거나 삭제한 뒤 남은 렌더 파일</small></div>
                    </div>
                    <span>{videoOverview ? `${videoOverview.cleanupCandidateCount}개 대기` : storyboard.videoProduction.projectId ? '점검 필요' : '영상 제작 후 점검'}</span>
                </StorageGroupHeader>
                {!storyboard.videoProduction.projectId ? (
                    <EmptyStorageState><i className="fas fa-clapperboard" aria-hidden="true" /> 영상 프로젝트가 만들어지면 렌더 잔재를 자동으로 점검합니다.</EmptyStorageState>
                ) : isInspectingVideo ? (
                    <EmptyStorageState><i className="fas fa-spinner fa-spin" aria-hidden="true" /> 현재 영상 파일을 안전하게 대조하고 있습니다.</EmptyStorageState>
                ) : videoStorageError ? (
                    <StorageError role="status">
                        <i className="fas fa-circle-info" aria-hidden="true" />
                        <span>{videoStorageError}</span>
                        <button type="button" onClick={() => void refreshVideoFiles()}>다시 확인</button>
                    </StorageError>
                ) : videoOverview?.cleanupLocked ? (
                    <LockedStorageState><i className="fas fa-lock" aria-hidden="true" /> 현재 제작 중인 작업 {videoOverview.activeJobCount}개가 끝나면 안전하게 정리할 수 있습니다.</LockedStorageState>
                ) : videoOverview?.cleanupCandidates.length ? (
                    <>
                        <StorageFileList>
                            {videoOverview.cleanupCandidates.slice(0, 6).map((file) => (
                                <StorageFileRow key={file.path}>
                                    <i className={file.kind === 'video' ? 'fas fa-film' : 'fas fa-image'} aria-hidden="true" />
                                    <div>
                                        <strong>{VIDEO_KIND_LABEL[file.kind]}</strong>
                                        <span>{fileNameFromPath(file.path)}</span>
                                    </div>
                                    <small>{formatBytes(file.sizeBytes)}</small>
                                </StorageFileRow>
                            ))}
                        </StorageFileList>
                        {videoOverview.cleanupCandidateCount > 6 ? <MoreFilesNote>외 {videoOverview.cleanupCandidateCount - 6}개 파일도 함께 정리됩니다.</MoreFilesNote> : null}
                        {videoOverview.truncated ? <MoreFilesNote>대용량 프로젝트는 이번에 확인된 최대 250개씩 나누어 정리합니다.</MoreFilesNote> : null}
                        <CleanupActionButton
                            type="button"
                            onClick={() => void handleDeleteVideoFiles()}
                            disabled={isDisabled || isDeletingVideo}
                        >
                            <i className={isDeletingVideo ? 'fas fa-spinner fa-spin' : 'fas fa-broom-ball'} aria-hidden="true" />
                            {isDeletingVideo ? '렌더 파일 정리 중…' : `${videoOverview.cleanupCandidateCount}개 렌더 파일 삭제`}
                        </CleanupActionButton>
                    </>
                ) : (
                    <EmptyStorageState><i className="fas fa-circle-check" aria-hidden="true" /> 현재 보호 대상 외에 정리할 렌더 파일이 없습니다.</EmptyStorageState>
                )}
            </StorageGroup>

            <SafetyNote><i className="fas fa-shield-halved" aria-hidden="true" /> 삭제는 확인 버튼을 누른 파일에만 적용됩니다. 제작 중인 작업·현재 장면·최종 완성본은 정리 대상에서 제외됩니다.</SafetyNote>
        </ManagerSection>
    );
}

const ManagerSection = styled.section`
    display: grid;
    gap: 14px;
    padding: 18px;
    border: 1px solid color-mix(in srgb, var(--border-subtle) 84%, #22c55e 16%);
    border-radius: 14px;
    background: color-mix(in srgb, var(--bg-elevated, #161b22) 94%, #052e1b 6%);
`;

const ManagerHeader = styled.header`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    span { display: block; color: #5eead4; font-size: 0.69rem; font-weight: 800; letter-spacing: 0.1em; }
    h4 { margin: 4px 0; font-size: 1rem; color: var(--text-primary); }
    p { margin: 0; color: var(--text-secondary); font-size: 0.8rem; line-height: 1.5; }
    button {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 34px;
        padding: 0 11px;
        border: 1px solid var(--border-subtle);
        border-radius: 9px;
        color: var(--text-primary);
        background: var(--bg-base);
        font-size: 0.78rem;
        font-weight: 700;
        touch-action: manipulation;
    }
    button:hover:not(:disabled) { border-color: color-mix(in srgb, #5eead4 46%, var(--border-subtle)); }
    button:focus-visible { outline: 2px solid #5eead4; outline-offset: 2px; }
    button:disabled { opacity: 0.55; cursor: wait; }

    @media (max-width: 620px) { flex-direction: column; button { width: 100%; justify-content: center; } }
`;

const StorageSummary = styled.div`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
    @media (max-width: 620px) { grid-template-columns: 1fr; }
`;

const SummaryMetric = styled.div<{ $tone?: 'warning' | 'success' }>`
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 11px;
    border: 1px solid color-mix(in srgb, var(--border-subtle) 86%, ${({ $tone }) => $tone === 'warning' ? '#f59e0b' : $tone === 'success' ? '#22c55e' : '#38bdf8'} 14%);
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg-base) 87%, ${({ $tone }) => $tone === 'warning' ? '#78350f' : $tone === 'success' ? '#14532d' : '#0c4a6e'} 13%);
    i { grid-row: span 3; color: ${({ $tone }) => $tone === 'warning' ? '#fbbf24' : $tone === 'success' ? '#86efac' : '#7dd3fc'}; }
    span { color: var(--text-secondary); font-size: 0.7rem; font-weight: 700; }
    strong { color: var(--text-primary); font-size: 0.98rem; }
    small { color: var(--text-tertiary); font-size: 0.67rem; }
`;

const StorageGroup = styled.div`
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    border-radius: 11px;
    background: var(--bg-base);
`;

const StorageGroupHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 13px;
    border-bottom: 1px solid var(--border-subtle);
    > div { display: flex; align-items: center; gap: 9px; min-width: 0; }
    > div > i { color: #5eead4; }
    strong, small { display: block; }
    strong { color: var(--text-primary); font-size: 0.82rem; }
    small { margin-top: 2px; color: var(--text-tertiary); font-size: 0.7rem; }
    > span { flex: 0 0 auto; color: #a7f3d0; font-size: 0.72rem; font-weight: 700; }
`;

const StorageFileList = styled.ul`
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
`;

const StorageFileRow = styled.li`
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    min-height: 48px;
    padding: 8px 13px;
    border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent);
    > i { color: #fbbf24; font-size: 0.78rem; }
    div { min-width: 0; }
    strong, span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    strong { color: var(--text-primary); font-size: 0.77rem; }
    span, small { color: var(--text-tertiary); font-size: 0.68rem; }
    small { text-align: right; }
`;

const CleanupActionButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: calc(100% - 26px);
    min-height: 36px;
    margin: 12px 13px;
    border: 1px solid color-mix(in srgb, #fb7185 58%, var(--border-subtle));
    border-radius: 9px;
    color: #fecdd3;
    background: color-mix(in srgb, #881337 36%, var(--bg-base));
    font-size: 0.77rem;
    font-weight: 800;
    touch-action: manipulation;
    &:hover:not(:disabled) { border-color: #fb7185; background: color-mix(in srgb, #9f1239 52%, var(--bg-base)); }
    &:focus-visible { outline: 2px solid #fda4af; outline-offset: 2px; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EmptyStorageState = styled.p`
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 15px 13px;
    color: var(--text-secondary);
    font-size: 0.76rem;
    line-height: 1.45;
    i { color: #86efac; }
`;

const LockedStorageState = styled(EmptyStorageState)` i { color: #fbbf24; } `;

const StorageError = styled.div`
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 13px;
    color: #fde68a;
    background: color-mix(in srgb, #78350f 32%, var(--bg-base));
    font-size: 0.75rem;
    line-height: 1.45;
    i { flex: 0 0 auto; }
    span { flex: 1; }
    button {
        border: 0;
        color: #fde68a;
        background: transparent;
        font-size: 0.72rem;
        font-weight: 800;
        text-decoration: underline;
        touch-action: manipulation;
        &:focus-visible { outline: 2px solid #fde68a; outline-offset: 2px; }
    }
`;

const MoreFilesNote = styled.p`
    margin: 0;
    padding: 8px 13px 0;
    color: var(--text-tertiary);
    font-size: 0.7rem;
`;

const SafetyNote = styled.p`
    display: flex;
    gap: 8px;
    margin: 0;
    color: var(--text-tertiary);
    font-size: 0.71rem;
    line-height: 1.45;
    i { margin-top: 2px; color: #5eead4; }
`;
