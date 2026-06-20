'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type VideoStudioClip, type VideoStudioJob, type VideoStudioProject } from '@/lib/video-studio';
import type { VideoStudioRuntimeStatus } from '@/services/videoStudioService';

interface TestPanelProps {
    projects: VideoStudioProject[];
    clips: VideoStudioClip[];
    jobs: VideoStudioJob[];
    runtimeStatus: VideoStudioRuntimeStatus | null;
    selectedProjectId: string | null;
    onCreateProject: (title: string) => Promise<string>;
    onGenerateClip: (params: { prompt: string; referenceClipId?: string; title?: string }) => Promise<string | null>;
    onContinueClip: (params: { prompt: string; referenceClipId: string; title?: string }) => Promise<string | null>;
    onMergeClips: (clipIds: string[], title: string) => Promise<string | null>;
    onProcessJob: (jobId: string) => Promise<void>;
    onSelectProject: (projectId: string | null) => void;
    onSelectClip: (clipId: string | null) => void;
    working: boolean;
    projectTitle: string;
    setProjectTitle: (title: string) => void;
}

export function TestPanel({
    projects,
    clips,
    jobs,
    runtimeStatus,
    selectedProjectId,
    onCreateProject,
    onGenerateClip,
    onContinueClip,
    onMergeClips,
    onProcessJob,
    onSelectProject,
    onSelectClip,
    working,
}: TestPanelProps) {
    const [testResults, setTestResults] = useState<string[]>([]);
    const clipsRef = useRef(clips);
    const jobsRef = useRef(jobs);

    useEffect(() => {
        clipsRef.current = clips;
    }, [clips]);

    useEffect(() => {
        jobsRef.current = jobs;
    }, [jobs]);

    const addTestResult = (result: string) => {
        setTestResults((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
    };

    const runTest = async (testName: string, testFn: () => Promise<void>) => {
        try {
            addTestResult(`[TEST] ${testName} 시작`);
            await testFn();
            addTestResult(`[PASS] ${testName} 성공`);
            return true;
        } catch (error) {
            addTestResult(`[FAIL] ${testName} 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
            return false;
        }
    };

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const waitForJobTerminalStatus = async (jobId: string, timeoutMs = 8 * 60 * 1000): Promise<VideoStudioJob> => {
        const startedAt = Date.now();
        let lastStatus = 'queued';

        while (Date.now() - startedAt < timeoutMs) {
            const job = jobsRef.current.find((item) => item.id === jobId);
            if (job) {
                lastStatus = job.status;
                if (job.status === 'completed') {
                    return job;
                }
                if (job.status === 'failed' || job.status === 'canceled') {
                    throw new Error(job.errorMessage || `작업 상태가 ${job.status}로 종료되었습니다.`);
                }
            }

            await sleep(1500);
        }

        throw new Error(`작업 완료 대기 시간 초과 (jobId=${jobId}, lastStatus=${lastStatus})`);
    };

    const waitForClipCountIncrease = async (beforeCount: number, timeoutMs = 90 * 1000) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            if (clipsRef.current.length > beforeCount) {
                return;
            }
            await sleep(1000);
        }

        throw new Error('클립 목록 반영이 지연되고 있습니다. Firestore 동기화를 확인해주세요.');
    };

    const queueAndProcess = async (queueFn: () => Promise<string | null>, label: string): Promise<VideoStudioJob> => {
        if (runtimeStatus && !runtimeStatus.grokApiKeyConfigured) {
            throw new Error('GROK_API_KEY가 설정되지 않아 실전 생성이 불가능합니다. .env 또는 관리 설정에서 키를 등록하세요.');
        }

        const jobId = await queueFn();
        if (!jobId) {
            throw new Error(`${label} 작업 큐 등록에 실패했습니다.`);
        }

        addTestResult(`[INFO] ${label} 큐 등록 완료: ${jobId}`);
        await onProcessJob(jobId);
        addTestResult(`[INFO] ${label} 처리 실행 요청 완료`);

        return waitForJobTerminalStatus(jobId);
    };

    const testCreateProject = async () => {
        const projectId = await onCreateProject(`테스트 프로젝트 ${Date.now()}`);
        if (!projectId) {
            throw new Error('프로젝트 생성에 실패했습니다.');
        }
        onSelectProject(projectId);
    };

    const testGenerateFirstClip = async () => {
        if (!selectedProjectId) throw new Error('프로젝트를 먼저 선택하세요');

        const beforeClipCount = clipsRef.current.length;
        const completedJob = await queueAndProcess(
            () => onGenerateClip({
                prompt: '숲 속을 걷는 아름다운 여우, 햇살이 나뭇잎 사이로 비치고 있습니다',
                title: '첫 번째 클립',
            }),
            '첫 클립 생성',
        );

        await waitForClipCountIncrease(beforeClipCount);
        if (completedJob.clipId) {
            onSelectClip(completedJob.clipId);
        }
        addTestResult(`[INFO] 첫 클립 생성 완료: ${completedJob.clipId || 'clipId 없음'}`);
    };

    const testGenerateContinueClip = async () => {
        if (!selectedProjectId) throw new Error('프로젝트를 먼저 선택하세요');
        if (clipsRef.current.length === 0) throw new Error('먼저 클립을 생성하세요');

        const lastClip = clipsRef.current[clipsRef.current.length - 1];
        const beforeClipCount = clipsRef.current.length;
        const completedJob = await queueAndProcess(
            () => onContinueClip({
                prompt: '여우가 시냇가에 도착해서 물을 마시고 있습니다',
                referenceClipId: lastClip.id,
                title: '연속 클립',
            }),
            '연속 클립 생성',
        );

        await waitForClipCountIncrease(beforeClipCount);
        if (completedJob.clipId) {
            onSelectClip(completedJob.clipId);
        }
        addTestResult(`[INFO] 연속 클립 생성 완료: ${completedJob.clipId || 'clipId 없음'}`);
    };

    const testMergeClips = async () => {
        if (!selectedProjectId) throw new Error('프로젝트를 먼저 선택하세요');
        if (clipsRef.current.length < 2) throw new Error('최소 2개의 클립이 필요합니다');

        const clipIds = clipsRef.current.slice(0, 2).map((clip) => clip.id);
        const beforeClipCount = clipsRef.current.length;
        const completedJob = await queueAndProcess(
            () => onMergeClips(clipIds, '테스트 장편 동영상'),
            '클립 합치기',
        );

        await waitForClipCountIncrease(beforeClipCount);
        if (completedJob.clipId) {
            onSelectClip(completedJob.clipId);
        }
        addTestResult(`[INFO] 클립 합치기 완료: ${completedJob.clipId || 'clipId 없음'}`);
    };

    const testFullWorkflow = async () => {
        addTestResult('[FLOW] 전체 워크플로우 테스트 시작');

        const created = await runTest('프로젝트 생성', testCreateProject);
        if (!created) return;

        const generated = await runTest('첫 클립 생성', testGenerateFirstClip);
        if (!generated) return;

        const continued = await runTest('연속 클립 생성', testGenerateContinueClip);
        if (!continued) return;

        const merged = await runTest('클립 합치기', testMergeClips);
        if (!merged) return;

        addTestResult('[DONE] 전체 워크플로우 테스트 완료');
        toast.success('워크플로우 테스트가 모두 완료되었습니다.');
    };

    const clearResults = () => {
        setTestResults([]);
    };

    return (
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f8f9fa' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>단계별 테스트 패널</h3>
                <span
                    style={{
                        backgroundColor: runtimeStatus?.devMode ? '#fd7e14' : '#28a745',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                    }}
                >
                    {runtimeStatus?.devMode ? 'DEV 모드 (강제 실전 실행 사용)' : '실전 모드 (Grok)'}
                </span>
            </div>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
                각 단계는 작업 큐 등록 후 처리 API를 호출하고, 완료 상태와 Firestore 반영까지 검증합니다.
            </p>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '8px',
                    marginBottom: '15px',
                }}
            >
                <div style={{ padding: '8px 10px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: '#fff' }}>
                    Grok API: {runtimeStatus ? (runtimeStatus.grokApiKeyConfigured ? '연결됨' : '미설정') : '확인 중'}
                </div>
                <div style={{ padding: '8px 10px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: '#fff' }}>
                    실행 모드: {runtimeStatus ? (runtimeStatus.devMode ? '개발 모드' : '실전 모드') : '확인 중'}
                </div>
                <div style={{ padding: '8px 10px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: '#fff' }}>
                    키 소스: {runtimeStatus ? runtimeStatus.configSource : '확인 중'}
                </div>
                <div style={{ padding: '8px 10px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: '#fff' }}>
                    프로세서 시크릿: {runtimeStatus ? (runtimeStatus.processorSecretConfigured ? '설정됨' : '미설정') : '확인 중'}
                </div>
            </div>

            {runtimeStatus && !runtimeStatus.grokApiKeyConfigured && (
                <div
                    style={{
                        marginBottom: '15px',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid #f5c2c7',
                        backgroundColor: '#f8d7da',
                        color: '#842029',
                        fontSize: '13px',
                    }}
                >
                    그록 키가 설정되지 않아 생성이 실패합니다. 현재 키 소스: {runtimeStatus.configSource}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                <button
                    onClick={() => void runTest('프로젝트 생성', testCreateProject)}
                    disabled={working}
                    style={{
                        padding: '10px',
                        backgroundColor: working ? '#ccc' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: working ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                    }}
                >
                    프로젝트 생성
                </button>

                <button
                    onClick={() => void runTest('첫 클립 생성', testGenerateFirstClip)}
                    disabled={working || !selectedProjectId}
                    style={{
                        padding: '10px',
                        backgroundColor: working || !selectedProjectId ? '#ccc' : '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: working || !selectedProjectId ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                    }}
                >
                    첫 클립 생성
                </button>

                <button
                    onClick={() => void runTest('연속 클립 생성', testGenerateContinueClip)}
                    disabled={working || !selectedProjectId || clips.length === 0}
                    style={{
                        padding: '10px',
                        backgroundColor: working || !selectedProjectId || clips.length === 0 ? '#ccc' : '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: working || !selectedProjectId || clips.length === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                    }}
                >
                    연속 클립 생성
                </button>

                <button
                    onClick={() => void runTest('클립 합치기', testMergeClips)}
                    disabled={working || !selectedProjectId || clips.length < 2}
                    style={{
                        padding: '10px',
                        backgroundColor: working || !selectedProjectId || clips.length < 2 ? '#ccc' : '#ffc107',
                        color: 'black',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: working || !selectedProjectId || clips.length < 2 ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                    }}
                >
                    클립 합치기
                </button>

                <button
                    onClick={() => void testFullWorkflow()}
                    disabled={working}
                    style={{
                        padding: '10px',
                        backgroundColor: working ? '#ccc' : '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: working ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        gridColumn: 'span 2',
                    }}
                >
                    전체 워크플로우 테스트
                </button>
            </div>

            <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0 }}>테스트 결과</h4>
                    <button
                        onClick={clearResults}
                        style={{
                            padding: '5px 10px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                        }}
                    >
                        결과 지우기
                    </button>
                </div>

                <div
                    style={{
                        maxHeight: '220px',
                        overflowY: 'auto',
                        backgroundColor: 'white',
                        border: '1px solid #dee2e6',
                        borderRadius: '4px',
                        padding: '10px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                    }}
                >
                    {testResults.length === 0 ? (
                        <div style={{ color: '#666', fontStyle: 'italic' }}>테스트 결과를 여기에 표시합니다...</div>
                    ) : (
                        testResults.map((result, index) => (
                            <div key={index} style={{ marginBottom: '5px', lineHeight: '1.4' }}>
                                {result}
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div style={{ fontSize: '14px', color: '#666' }}>
                <div>프로젝트: {projects.find((p) => p.id === selectedProjectId)?.title || '없음'}</div>
                <div>클립 수: {clips.length}개</div>
                <div>작업 수: {jobs.length}개</div>
                <div>작업 상태: {working ? '진행 중...' : '대기 중'}</div>
            </div>
        </div>
    );
}
