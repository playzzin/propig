'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { videoStudioService } from '@/services/videoStudioService';
import type { VideoStudioRuntimeStatus } from '@/services/videoStudioService';
import {
    VIDEO_STUDIO_CLIPS_COLLECTION,
    VIDEO_STUDIO_JOBS_COLLECTION,
    VIDEO_STUDIO_PROJECTS_COLLECTION,
    type VideoStudioClip,
    type VideoStudioJob,
    type VideoStudioProject,
} from '@/lib/video-studio';

import { TimelineEditor } from './components/TimelineEditor';
import { ClipGenerator } from './components/ClipGenerator';
import { VideoPlayer } from './components/VideoPlayer';
import { MergeTool } from './components/MergeTool';
import { TestPanel } from './components/TestPanel';

export default function VideoStudioPage() {
    const { currentUser } = useAuth();

    // States
    const [projects, setProjects] = useState<VideoStudioProject[]>([]);
    const [clips, setClips] = useState<VideoStudioClip[]>([]);
    const [jobs, setJobs] = useState<VideoStudioJob[]>([]);

    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [projectTitle, setProjectTitle] = useState('');
    const [working, setWorking] = useState(false);
    const [isSimpleMode, setIsSimpleMode] = useState(true);
    const [runtimeStatus, setRuntimeStatus] = useState<VideoStudioRuntimeStatus | null>(null);

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
        () => jobs.filter(j => j.projectId === selectedProjectId),
        [jobs, selectedProjectId],
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
        if (!currentUser) {
            setJobs([]);
            return undefined;
        }
        const unsubscribe = onSnapshot(
            query(collection(db, VIDEO_STUDIO_JOBS_COLLECTION), where('userId', '==', currentUser.uid)),
            (snapshot) => setJobs(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<VideoStudioJob, 'id'>) }))),
            (error) => {
                console.error(error);
                toast.error('작업 현황을 불러오지 못했습니다.');
            },
        );
        return () => unsubscribe();
    }, [currentUser]);

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

            const queued = await videoStudioService.submitStudioJob({
                authToken,
                operation: params.referenceClipId ? 'continue' : 'generate',
                projectId: selectedProjectId,
                clipTitle,
                prompt: params.prompt,
                duration: 8,
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
                        value={selectedProjectId || ''}
                        onChange={(e) => setSelectedProjectId(e.target.value || null)}
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
                    onSelectProject={setSelectedProjectId}
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

            {/* 작업 현황 */}
            {selectedProjectId && (
                <div style={{ marginTop: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
                    <h2>작업 현황</h2>
                    {projectJobs.length === 0 ? (
                        <p>진행 중인 작업이 없습니다.</p>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
                            {projectJobs.map(job => (
                                <div key={job.id} style={{
                                    padding: '10px',
                                    border: '1px solid #dee2e6',
                                    borderRadius: '4px',
                                    backgroundColor: '#f8f9fa'
                                }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{job.title}</div>
                                    <div style={{ fontSize: '14px', color: '#666' }}>
                                        상태: {job.status}
                                        {job.status === 'failed' && job.errorMessage && (
                                            <div style={{ color: '#dc3545', marginTop: '5px' }}>
                                                오류: {job.errorMessage}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
