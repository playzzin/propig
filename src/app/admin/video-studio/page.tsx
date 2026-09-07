'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/firebase/config';
import { useCurrentUserAccess } from '@/hooks/useCurrentUserAccess';
import { videoStudioService } from '@/services/videoStudioService';
import type { VideoStudioEstimate, VideoStudioRuntimeStatus } from '@/services/videoStudioService';
import {
    VIDEO_STUDIO_CLIPS_COLLECTION,
    VIDEO_STUDIO_JOBS_COLLECTION,
    VIDEO_STUDIO_PROJECTS_COLLECTION,
    type VideoStudioClip,
    type VideoStudioJob,
    type VideoStudioProject,
} from '@/lib/video-studio';

const TestPanel = dynamic(
    () => import('./components/TestPanel').then((module) => module.TestPanel),
    { ssr: false },
);

const TimelineEditor = dynamic(
    () => import('./components/TimelineEditor').then((module) => module.TimelineEditor),
    { ssr: false },
);
const ClipGenerator = dynamic(
    () => import('./components/ClipGenerator').then((module) => module.ClipGenerator),
    { ssr: false },
);
const VideoPlayer = dynamic(
    () => import('./components/VideoPlayer').then((module) => module.VideoPlayer),
    { ssr: false },
);
const MergeTool = dynamic(
    () => import('./components/MergeTool').then((module) => module.MergeTool),
    { ssr: false },
);
const TaskTimelineDashboard = dynamic(
    () => import('./components/TaskTimelineDashboard').then((module) => module.TaskTimelineDashboard),
    { ssr: false },
);

type CostApprovalRequest = {
    clipTitle: string;
    estimate: VideoStudioEstimate;
};

function formatUsd(value: number) {
    return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function VideoCostApprovalDialog({ request, onDecision }: { request: CostApprovalRequest; onDecision: (approved: boolean) => void }) {
    const cancelRef = useRef<HTMLButtonElement | null>(null);
    const cost = request.estimate.estimatedCostUsd;

    useEffect(() => {
        cancelRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onDecision(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onDecision]);

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="video-cost-approval-title" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(5, 15, 22, 0.72)' }}>
            <div style={{ width: 'min(100%, 520px)', padding: 28, borderRadius: 24, color: '#eaf7f3', background: '#102a2f', boxShadow: '0 28px 90px rgba(0,0,0,.38)' }}>
                <p style={{ margin: '0 0 8px', color: '#78d9be', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em' }}>COST APPROVAL</p>
                <h2 id="video-cost-approval-title" style={{ margin: 0, fontSize: 24 }}>유료 영상 생성을 시작할까요?</h2>
                <p style={{ margin: '12px 0 20px', color: '#b9cec8', lineHeight: 1.65 }}>작업을 제출하기 전에 모델과 최대 예상 비용을 확인해 주세요. 서버가 다시 계산한 비용이 이 한도를 넘으면 작업은 시작되지 않습니다.</p>
                <dl style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 14px', margin: 0, padding: 18, borderRadius: 16, background: 'rgba(255,255,255,.06)' }}>
                    <dt style={{ color: '#86a59d' }}>클립</dt><dd style={{ margin: 0, fontWeight: 750 }}>{request.clipTitle}</dd>
                    <dt style={{ color: '#86a59d' }}>모델</dt><dd style={{ margin: 0 }}>{request.estimate.modelName}</dd>
                    <dt style={{ color: '#86a59d' }}>조건</dt><dd style={{ margin: 0 }}>{request.estimate.resolvedDuration}초 · {request.estimate.requestedResolution} · {request.estimate.aspectRatio}</dd>
                    <dt style={{ color: '#86a59d' }}>최대 예상 비용</dt><dd style={{ margin: 0, color: '#ffd179', fontSize: 20, fontWeight: 900 }}>{cost === null ? '확인 불가' : formatUsd(cost)}</dd>
                </dl>
                {request.estimate.credit.message ? <p style={{ margin: '14px 0 0', color: '#a8beb8', fontSize: 13 }}>{request.estimate.credit.message}</p> : null}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                    <button ref={cancelRef} type="button" onClick={() => onDecision(false)} style={{ minHeight: 44, padding: '0 18px', border: '1px solid rgba(255,255,255,.18)', borderRadius: 12, color: '#d8e7e3', background: 'transparent', cursor: 'pointer' }}>취소</button>
                    <button type="button" onClick={() => onDecision(true)} disabled={cost === null} style={{ minHeight: 44, padding: '0 18px', border: 0, borderRadius: 12, color: '#102a2f', background: cost === null ? '#6d817c' : '#ffd179', fontWeight: 900, cursor: cost === null ? 'not-allowed' : 'pointer' }}>
                        {cost === null ? '비용을 확인할 수 없음' : `${formatUsd(cost)} 한도로 승인`}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function VideoStudioPage() {
    const { currentUser, isLoading: isAccessLoading, access } = useCurrentUserAccess();

    // States
    const [projects, setProjects] = useState<VideoStudioProject[]>([]);
    const [clips, setClips] = useState<VideoStudioClip[]>([]);
    const [jobs, setJobs] = useState<VideoStudioJob[]>([]);

    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [mergeSelection, setMergeSelection] = useState<string[]>([]);
    const [projectTitle, setProjectTitle] = useState('');
    const [working, setWorking] = useState(false);
    const [isSimpleMode, setIsSimpleMode] = useState(true);
    const [runtimeStatus, setRuntimeStatus] = useState<VideoStudioRuntimeStatus | null>(null);
    const [costApprovalRequest, setCostApprovalRequest] = useState<CostApprovalRequest | null>(null);
    const costApprovalResolverRef = useRef<((approved: boolean) => void) | null>(null);

    const decideCostApproval = (approved: boolean) => {
        const resolve = costApprovalResolverRef.current;
        costApprovalResolverRef.current = null;
        setCostApprovalRequest(null);
        resolve?.(approved);
    };

    const requestCostApproval = (request: CostApprovalRequest) => new Promise<boolean>((resolve) => {
        costApprovalResolverRef.current?.(false);
        costApprovalResolverRef.current = resolve;
        setCostApprovalRequest(request);
    });

    useEffect(() => () => {
        costApprovalResolverRef.current?.(false);
        costApprovalResolverRef.current = null;
    }, []);

    // Memoized values
    const selectedProject = useMemo(
        () => projects.find((project) => project.id === selectedProjectId) ?? null,
        [selectedProjectId, projects],
    );
    const selectedClip = useMemo(
        () => clips.find((clip) => clip.id === selectedClipId) ?? null,
        [selectedClipId, clips],
    );
    const sortedClips = useMemo(
        () => [...clips].sort((a, b) => a.sequence - b.sequence),
        [clips],
    );
    const projectJobs = useMemo(
        () => jobs,
        [jobs],
    );

    // Effects
    useEffect(() => {
        if (!currentUser) return undefined;
        const unsubscribe = onSnapshot(
            query(collection(db, VIDEO_STUDIO_PROJECTS_COLLECTION), where('userId', '==', currentUser.uid)),
            (snapshot) => setProjects(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<VideoStudioProject, 'id'>) }))),
            (error) => {
                console.error(error);
                toast.error('프로젝트 목록을 불러오지 못했습니다.');
            },
        );
        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        if (!selectedProjectId) {
            setClips([]);
            return undefined;
        }
        const unsubscribe = onSnapshot(
            query(collection(db, VIDEO_STUDIO_CLIPS_COLLECTION), where('projectId', '==', selectedProjectId)),
            (snapshot) => setClips(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<VideoStudioClip, 'id'>) }))),
            (error) => {
                console.error(error);
                toast.error('클립을 불러오지 못했습니다.');
            },
        );
        return () => unsubscribe();
    }, [selectedProjectId]);

    useEffect(() => {
        if (!currentUser || !selectedProjectId) {
            setJobs([]);
            return undefined;
        }
        const unsubscribe = onSnapshot(
            query(collection(db, VIDEO_STUDIO_JOBS_COLLECTION), where('projectId', '==', selectedProjectId)),
            (snapshot) => setJobs(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<VideoStudioJob, 'id'>) }))),
            (error) => {
                console.error(error);
                toast.error('작업 현황을 불러오지 못했습니다.');
            },
        );
        return () => unsubscribe();
    }, [currentUser, selectedProjectId]);

    useEffect(() => {
        let mounted = true;

        const loadRuntimeStatus = async () => {
            if (!currentUser) {
                setRuntimeStatus(null);
                return;
            }

            try {
                const authToken = await currentUser.getIdToken();
                const status = await videoStudioService.getStudioRuntimeStatus({ authToken });
                if (mounted) {
                    setRuntimeStatus(status);
                }
            } catch (error) {
                console.warn('[VideoStudio] Failed to load runtime status:', error);
                if (mounted) {
                    setRuntimeStatus(null);
                }
            }
        };

        void loadRuntimeStatus();

        return () => {
            mounted = false;
        };
    }, [currentUser]);

    useEffect(() => {
        if (!selectedProjectId && projects.length > 0) {
            setSelectedProjectId(projects[0].id);
        }
    }, [selectedProjectId, projects]);

    // Handlers
    const handleCreateProject = async (title?: string): Promise<string> => {
        if (!currentUser) {
            toast.error('로그인이 필요합니다.');
            return '';
        }

        const finalTitle = title?.trim() ?? projectTitle.trim();
        if (!finalTitle) {
            toast.error('프로젝트 이름을 입력해주세요.');
            return '';
        }

        try {
            setWorking(true);
            const projectId = await videoStudioService.createProject({
                userId: currentUser.uid,
                title: finalTitle,
            });
            setSelectedProjectId(projectId);
            if (!title) {
                setProjectTitle('');
            }
            toast.success('프로젝트를 만들었습니다.');
            return projectId;
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '프로젝트를 만들지 못했습니다.');
            return '';
        } finally {
            setWorking(false);
        }
    };

    const handleGenerateClip = async (params: {
        prompt: string;
        referenceClipId?: string;
        title?: string;
    }): Promise<string | null> => {
        if (!selectedProjectId) {
            toast.error('프로젝트를 선택해주세요.');
            return null;
        }
        if (!currentUser) {
            toast.error('로그인이 필요합니다.');
            return null;
        }
        try {
            setWorking(true);
            const authToken = await currentUser.getIdToken();
            const clipTitle = params.title || `클립 ${clips.length + 1}`;
            const estimate = await videoStudioService.getVideoEstimate({
                authToken,
                duration: 8,
                resolution: selectedProject?.resolution || '720p',
                aspectRatio: selectedProject?.aspectRatio || '16:9',
                qualityMode: 'proof',
                hasReferenceImage: Boolean(params.referenceClipId),
                hasEndReferenceImage: false,
                hasVisualReferenceImages: false,
                audioMode: 'silent',
            });
            if (!estimate.canSubmit) {
                throw new Error(estimate.credit.message || '현재 조건으로 영상 생성을 시작할 수 없습니다.');
            }
            if (estimate.estimatedCostUsd === null) {
                throw new Error('현재 모델의 예상 비용을 확인할 수 없어 유료 생성을 시작하지 않았습니다.');
            }
            const approved = await requestCostApproval({ clipTitle, estimate });
            if (!approved) {
                toast.message('영상 생성 비용 승인을 취소했습니다.');
                return null;
            }

            const queued = await videoStudioService.submitStudioJob({
                authToken,
                operation: params.referenceClipId ? 'continue' : 'generate',
                projectId: selectedProjectId,
                clipTitle,
                prompt: params.prompt,
                duration: 8,
                authorizedCostUsd: estimate.estimatedCostUsd,
                sourceClipId: params.referenceClipId,
                forceRealRun: true,
            });

            toast.success('비디오 생성 작업을 시작했습니다.');
            return queued.jobId;
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '비디오 생성을 시작하지 못했습니다.');
            return null;
        } finally {
            setWorking(false);
        }
    };

    const handleReorderClips = async (clipIds: string[]) => {
        if (!selectedProject || !currentUser) return;
        try {
            setWorking(true);
            const authToken = await currentUser.getIdToken();
            await videoStudioService.resequenceClips({
                authToken,
                projectId: selectedProject.id,
                clipIds,
            });
            toast.success('클립 순서를 변경했습니다.');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '클립 순서를 변경하지 못했습니다.');
        } finally {
            setWorking(false);
        }
    };

    const handleDeleteClip = async (clipId: string) => {
        if (!currentUser) return;
        if (!confirm('정말로 이 클립을 삭제하시겠습니까?')) return;

        try {
            setWorking(true);
            const authToken = await currentUser.getIdToken();
            await videoStudioService.deleteClip({
                authToken,
                clipId,
            });
            if (selectedClipId === clipId) {
                setSelectedClipId(null);
            }
            toast.success('클립을 삭제했습니다.');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '클립을 삭제하지 못했습니다.');
        } finally {
            setWorking(false);
        }
    };

    const handleContinueClip = async (params: {
        prompt: string;
        referenceClipId: string;
        title?: string;
    }): Promise<string | null> => {
        return handleGenerateClip(params);
    };

    const handleSelectProject = (projectId: string | null) => {
        setSelectedProjectId(projectId);
        setSelectedClipId(null);
        setMergeSelection([]);
    };

    const handleUpdateQueuedJob = async (params: { jobId: string; action: 'requeue' | 'cancel' }) => {
        if (!currentUser) throw new Error('로그인이 필요합니다.');
        const authToken = await currentUser.getIdToken();
        return videoStudioService.updateStudioJob({ authToken, ...params });
    };

    const handleMoveClip = async (clipId: string, direction: 'up' | 'down') => {
        const currentIndex = sortedClips.findIndex((clip) => clip.id === clipId);
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sortedClips.length) return;

        const reorderedIds = sortedClips.map((clip) => clip.id);
        [reorderedIds[currentIndex], reorderedIds[targetIndex]] = [
            reorderedIds[targetIndex],
            reorderedIds[currentIndex],
        ];
        await handleReorderClips(reorderedIds);
    };

    const handleMergeClips = async (clipIds: string[], title: string): Promise<string | null> => {
        if (!selectedProjectId) {
            toast.error('프로젝트를 선택해주세요.');
            return null;
        }
        if (!currentUser) {
            toast.error('로그인이 필요합니다.');
            return null;
        }
        try {
            setWorking(true);
            const authToken = await currentUser.getIdToken();

            const queued = await videoStudioService.submitStudioJob({
                authToken,
                operation: 'merge',
                projectId: selectedProjectId,
                clipTitle: title,
                prompt: `${clipIds.length}개의 클립을 순서대로 합친 장편 동영상`,
                mergeClipIds: clipIds,
                forceRealRun: true,
            });

            toast.success('장편 동영상 합치기 작업을 시작했습니다.');
            return queued.jobId;
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '장편 동영상을 생성하지 못했습니다.');
            return null;
        } finally {
            setWorking(false);
        }
    };

    const handleProcessJob = async (jobId: string): Promise<void> => {
        if (!currentUser) {
            throw new Error('로그인이 필요합니다.');
        }

        try {
            setWorking(true);
            const authToken = await currentUser.getIdToken();
            await videoStudioService.processStudioJob({
                authToken,
                jobId,
            });
        } finally {
            setWorking(false);
        }
    };

    if (isAccessLoading) {
        return (
            <div role="status" aria-live="polite" style={{ maxWidth: 720, margin: '80px auto', padding: 32 }}>
                영상 스튜디오 접근 권한을 확인하고 있습니다.
            </div>
        );
    }

    if (!currentUser) {
        return (
            <div style={{ maxWidth: 720, margin: '80px auto', padding: 32, border: '1px solid #d8e2e0', borderRadius: 20 }}>
                <h1 style={{ marginTop: 0 }}>영상 스튜디오</h1>
                <p>유료 영상 생성과 프로젝트 관리는 로그인한 관리자만 사용할 수 있습니다.</p>
                <a href="/login" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', padding: '0 18px', borderRadius: 12, color: '#fff', background: '#176b5b', fontWeight: 800 }}>
                    로그인하기
                </a>
            </div>
        );
    }

    if (access.role !== 'admin') {
        return (
            <div role="alert" style={{ maxWidth: 720, margin: '80px auto', padding: 32, border: '1px solid #e4d9c5', borderRadius: 20 }}>
                <h1 style={{ marginTop: 0 }}>접근 권한이 없습니다</h1>
                <p>영상 스튜디오는 공유 AI 비용과 운영 데이터를 다루므로 관리자 권한이 필요합니다.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>AI Video Studio - 심층 편집기</h1>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="checkbox"
                            checked={isSimpleMode}
                            onChange={(e) => setIsSimpleMode(e.target.checked)}
                        />
                        간단 모드
                    </label>
                </div>
            </div>

            {/* 프로젝트 관리 */}
            <div style={{ marginBottom: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
                <h2>프로젝트 관리</h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="새 프로젝트 이름"
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        disabled={working}
                        style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <button
                        onClick={() => void handleCreateProject()}
                        disabled={working || !projectTitle.trim()}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: working || !projectTitle.trim() ? '#ccc' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: working || !projectTitle.trim() ? 'not-allowed' : 'pointer',
                        }}
                    >
                        프로젝트 생성
                    </button>
                </div>

                <div style={{ marginTop: '15px' }}>
                    <select
                        aria-label="영상 프로젝트 선택"
                        value={selectedProjectId || ''}
                        onChange={(e) => handleSelectProject(e.target.value || null)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    >
                        <option value="">프로젝트 선택</option>
                        {projects.map(project => (
                            <option key={project.id} value={project.id}>{project.title}</option>
                        ))}
                    </select>
                    {selectedProject && (
                        <p style={{ margin: '5px 0', color: '#666' }}>
                            선택된 프로젝트: <strong>{selectedProject.title}</strong>
                        </p>
                    )}
                </div>
            </div>

            {/* 간단 모드: 테스트 패널 */}
            {isSimpleMode && (
                <TestPanel
                    projects={projects}
                    clips={sortedClips}
                    jobs={projectJobs}
                    runtimeStatus={runtimeStatus}
                    selectedProjectId={selectedProjectId}
                    onCreateProject={handleCreateProject}
                    onGenerateClip={handleGenerateClip}
                    onContinueClip={handleContinueClip}
                    onMergeClips={handleMergeClips}
                    onProcessJob={handleProcessJob}
                    onSelectProject={handleSelectProject}
                    onSelectClip={setSelectedClipId}
                    working={working}
                    projectTitle={projectTitle}
                    setProjectTitle={setProjectTitle}
                />
            )}

            {/* 전문가 모드: 심층 편집 인터페이스 */}
            {!isSimpleMode && selectedProjectId && (
                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 300px', gap: '20px', alignItems: 'start' }}>
                    {/* 좌측: 클립 생성 */}
                    <div>
                        <ClipGenerator
                            onGenerate={handleGenerateClip}
                            clips={sortedClips}
                            working={working}
                        />
                    </div>

                    {/* 중앙: 타임라인 에디터 */}
                    <div>
                        <TimelineEditor
                            clips={sortedClips}
                            onReorder={handleReorderClips}
                            onDelete={handleDeleteClip}
                            onSelect={setSelectedClipId}
                            selectedClipId={selectedClipId}
                        />

                        <div style={{ marginTop: '20px' }}>
                            <MergeTool
                                clips={sortedClips}
                                onMerge={handleMergeClips}
                                working={working}
                            />
                        </div>
                    </div>

                    {/* 우측: 비디오 플레이어 */}
                    <div>
                        <VideoPlayer clip={selectedClip} />
                    </div>
                </div>
            )}

            {/* 작업 운영 */}
            {selectedProjectId && (
                <div style={{ marginTop: '30px' }}>
                    <TaskTimelineDashboard
                        projectJobs={projectJobs}
                        sortedClips={sortedClips}
                        selectedClipId={selectedClipId}
                        setSelectedClipId={setSelectedClipId}
                        mergeSelection={mergeSelection}
                        setMergeSelection={setMergeSelection}
                        updateQueuedJob={handleUpdateQueuedJob}
                        kickoffQueuedJob={handleProcessJob}
                        moveClip={handleMoveClip}
                    />
                </div>
            )}
            {costApprovalRequest ? (
                <VideoCostApprovalDialog request={costApprovalRequest} onDecision={decideCostApproval} />
            ) : null}
        </div>
    );
}
