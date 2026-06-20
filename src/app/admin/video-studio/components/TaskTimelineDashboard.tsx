import React from 'react';
import { toast } from 'sonner';
import type { VideoStudioClip, VideoStudioJob, VideoStudioJobStatus } from '@/lib/video-studio';
import * as S from './VideoStudioStyles';
import { dateLabel, jobKindLabel, jobStatusLabel, modeLabel } from '../utils';

interface TaskTimelineDashboardProps {
    projectJobs: VideoStudioJob[];
    sortedClips: VideoStudioClip[];
    selectedClipId: string | null;
    setSelectedClipId: (id: string | null) => void;
    mergeSelection: string[];
    setMergeSelection: React.Dispatch<React.SetStateAction<string[]>>;
    updateQueuedJob: (params: { jobId: string; action: 'requeue' | 'cancel' }) => Promise<unknown>;
    kickoffQueuedJob: (jobId: string) => Promise<unknown>;
    moveClip: (clipId: string, direction: 'up' | 'down') => Promise<void>;
}

type LoopProgressSnapshot = {
    totalSegments: number;
    currentSegment: number;
    completedSegments: number;
    phase: string;
    autoMergeAfterLoop: boolean;
    currentClipTitle: string | null;
};

function readNumericValue(value: unknown, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readLoopProgress(job: VideoStudioJob): LoopProgressSnapshot | null {
    const raw = job.metadata?.loopProgress;
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const totalSegments = Math.max(1, readNumericValue((raw as Record<string, unknown>).totalSegments, 1));
    const currentSegment = Math.max(
        1,
        Math.min(totalSegments, readNumericValue((raw as Record<string, unknown>).currentSegment, 1)),
    );
    const completedSegments = Math.max(
        0,
        Math.min(totalSegments, readNumericValue((raw as Record<string, unknown>).completedSegments, 0)),
    );

    if (totalSegments <= 1) {
        return null;
    }

    return {
        totalSegments,
        currentSegment,
        completedSegments,
        phase: typeof (raw as Record<string, unknown>).phase === 'string' ? ((raw as Record<string, unknown>).phase as string) : 'running',
        autoMergeAfterLoop: (raw as Record<string, unknown>).autoMergeAfterLoop === true,
        currentClipTitle:
            typeof (raw as Record<string, unknown>).currentClipTitle === 'string'
                ? ((raw as Record<string, unknown>).currentClipTitle as string)
                : null,
    };
}

function loopPhaseLabel(phase: string) {
    switch (phase) {
        case 'rendering':
            return '장면 생성 중';
        case 'uploading':
            return '결과 저장 중';
        case 'extracting':
            return '마지막 프레임 저장 중';
        case 'merging':
            return '자동 합치기 중';
        case 'completed':
            return '릴레이 완료';
        default:
            return '처리 중';
    }
}

function clampProgress(progress?: number | null) {
    return typeof progress === 'number' && Number.isFinite(progress)
        ? Math.max(0, Math.min(100, Math.round(progress)))
        : 0;
}

function progressSummary(loopProgress: LoopProgressSnapshot) {
    const base = `${loopProgress.completedSegments}/${loopProgress.totalSegments}단계 완료`;
    return loopProgress.autoMergeAfterLoop ? `${base} · 완료 후 자동 합치기` : base;
}

function progressAccent(status: VideoStudioJobStatus) {
    switch (status) {
        case 'completed':
            return 'rgba(16, 185, 129, 0.92)';
        case 'failed':
            return 'rgba(239, 68, 68, 0.92)';
        case 'uploading':
            return 'rgba(59, 130, 246, 0.92)';
        case 'running':
            return 'rgba(251, 191, 36, 0.92)';
        case 'canceled':
            return 'rgba(148, 163, 184, 0.72)';
        case 'queued':
        default:
            return 'rgba(148, 163, 184, 0.72)';
    }
}

export function TaskTimelineDashboard({
    projectJobs,
    sortedClips,
    selectedClipId,
    setSelectedClipId,
    mergeSelection,
    setMergeSelection,
    updateQueuedJob,
    kickoffQueuedJob,
    moveClip,
}: TaskTimelineDashboardProps) {
    const activeJob =
        projectJobs.find((job) => ['running', 'uploading', 'queued'].includes(job.status)) ??
        projectJobs[0] ??
        null;

    const activeLoopProgress = activeJob ? readLoopProgress(activeJob) : null;
    const activeProgressValue = clampProgress(activeJob?.progress);

    return (
        <S.Right>
            <S.Section>
                <S.Title>3. 진행 확인</S.Title>
                <S.Copy>
                    지금 어떤 작업이 돌고 있는지, 몇 단계까지 이어졌는지, 어떤 컷이 선택됐는지 한 번에 확인하는
                    영역입니다.
                </S.Copy>
                <S.BadgeRow style={{ marginTop: 14 }}>
                    <S.Badge>{`${sortedClips.length}개 컷`}</S.Badge>
                    <S.Badge>{`${mergeSelection.length}개 합치기 선택`}</S.Badge>
                    <S.Badge>{`${projectJobs.filter((job) => ['queued', 'running', 'uploading'].includes(job.status)).length}개 진행 중`}</S.Badge>
                </S.BadgeRow>
            </S.Section>

            {activeJob ? (
                <S.JobCard $status={activeJob.status}>
                    <S.JobHeader>
                        <strong>{activeJob.title}</strong>
                        <S.JobStatus $status={activeJob.status}>{jobStatusLabel(activeJob.status)}</S.JobStatus>
                    </S.JobHeader>
                    <S.JobMessage>{activeJob.message || '현재 작업 상태를 준비 중입니다.'}</S.JobMessage>
                    <S.BadgeRow>
                        <S.Badge>{jobKindLabel(activeJob.kind)}</S.Badge>
                        <S.Badge>{dateLabel(activeJob.updatedAt ?? activeJob.createdAt)}</S.Badge>
                        {typeof activeJob.progress === 'number' ? <S.Badge>{`${activeProgressValue}%`}</S.Badge> : null}
                    </S.BadgeRow>
                    <S.ProgressStack style={{ marginTop: 14 }}>
                        <S.ProgressMeta>
                            <span>{activeLoopProgress ? loopPhaseLabel(activeLoopProgress.phase) : '작업 처리 중'}</span>
                            <span>{`${activeProgressValue}%`}</span>
                        </S.ProgressMeta>
                        <S.ProgressTrack>
                            <S.ProgressFill
                                $value={activeProgressValue}
                                style={{ background: progressAccent(activeJob.status) }}
                            />
                        </S.ProgressTrack>
                        <S.ProgressMeta>
                            <span>
                                {activeLoopProgress
                                    ? progressSummary(activeLoopProgress)
                                    : '한 번만 만드는 작업은 이 카드에서 바로 진행률을 확인할 수 있습니다.'}
                            </span>
                            <span>{activeLoopProgress?.currentClipTitle || '현재 컷 준비 중'}</span>
                        </S.ProgressMeta>
                    </S.ProgressStack>
                </S.JobCard>
            ) : null}

            <S.Section>
                <S.Title>최근 작업</S.Title>
                <S.Copy>실패한 작업은 다시 넣고, 대기 중인 작업은 바로 시작할 수 있습니다.</S.Copy>
            </S.Section>

            <S.JobList>
                {projectJobs.length > 0 ? (
                    projectJobs.slice(0, 6).map((job) => {
                        const loopProgress = readLoopProgress(job);
                        const repeatCount =
                            loopProgress?.totalSegments ??
                            (typeof job.metadata?.repeatCount === 'number' ? job.metadata.repeatCount : 1);
                        const progressValue = clampProgress(job.progress);

                        return (
                            <S.JobCard key={job.id} $status={job.status}>
                                <S.JobHeader>
                                    <strong>{job.title}</strong>
                                    <S.JobStatus $status={job.status}>{jobStatusLabel(job.status)}</S.JobStatus>
                                </S.JobHeader>
                                <S.JobMessage>{job.message || '작업 상세 상태를 준비 중입니다.'}</S.JobMessage>
                                <S.BadgeRow>
                                    <S.Badge>{jobKindLabel(job.kind)}</S.Badge>
                                    {repeatCount > 1 ? <S.Badge>{`${repeatCount}단계 릴레이`}</S.Badge> : null}
                                    {job.metadata?.autoMergeAfterLoop === true ? <S.Badge>자동 합치기</S.Badge> : null}
                                    {typeof job.progress === 'number' ? <S.Badge>{`${progressValue}%`}</S.Badge> : null}
                                </S.BadgeRow>
                                {loopProgress ? (
                                    <S.ProgressStack style={{ marginTop: 12 }}>
                                        <S.ProgressMeta>
                                            <span>{`${loopPhaseLabel(loopProgress.phase)} · ${loopProgress.currentSegment}/${loopProgress.totalSegments}`}</span>
                                            <span>{`${progressValue}%`}</span>
                                        </S.ProgressMeta>
                                        <S.ProgressTrack>
                                            <S.ProgressFill
                                                $value={progressValue}
                                                style={{ background: progressAccent(job.status) }}
                                            />
                                        </S.ProgressTrack>
                                    </S.ProgressStack>
                                ) : null}
                                {job.errorMessage ? <S.JobMessage style={{ marginTop: 10 }}>{job.errorMessage}</S.JobMessage> : null}
                                {job.status === 'failed' || job.status === 'queued' ? (
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                                        {job.status === 'failed' ? (
                                            <S.Button
                                                $ghost
                                                style={{ padding: '8px 10px' }}
                                                onClick={() => {
                                                    void updateQueuedJob({ jobId: job.id, action: 'requeue' })
                                                        .then(() => toast.success('작업을 다시 대기열에 넣었습니다.'))
                                                        .catch((error) => {
                                                            console.error(error);
                                                            toast.error(error instanceof Error ? error.message : '작업을 다시 넣지 못했습니다.');
                                                        });
                                                }}
                                            >
                                                다시 시도
                                            </S.Button>
                                        ) : (
                                            <S.Button
                                                $ghost
                                                style={{ padding: '8px 10px' }}
                                                onClick={() => {
                                                    void updateQueuedJob({ jobId: job.id, action: 'cancel' })
                                                        .then(() => toast.success('작업을 취소했습니다.'))
                                                        .catch((error) => {
                                                            console.error(error);
                                                            toast.error(error instanceof Error ? error.message : '작업을 취소하지 못했습니다.');
                                                        });
                                                }}
                                            >
                                                작업 취소
                                            </S.Button>
                                        )}
                                        {job.status === 'queued' ? (
                                            <S.Button
                                                $ghost
                                                style={{ padding: '8px 10px' }}
                                                onClick={() => {
                                                    void kickoffQueuedJob(job.id).catch((error) => {
                                                        console.error(error);
                                                        toast.error(error instanceof Error ? error.message : '대기 중인 작업을 시작하지 못했습니다.');
                                                    });
                                                }}
                                            >
                                                지금 시작
                                            </S.Button>
                                        ) : null}
                                        {job.clipId ? (
                                            <S.Button
                                                $ghost
                                                style={{ padding: '8px 10px' }}
                                                onClick={() => setSelectedClipId(job.clipId || null)}
                                            >
                                                관련 컷 보기
                                            </S.Button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </S.JobCard>
                        );
                    })
                ) : (
                    <S.JobCard $status="queued">
                        <strong>아직 작업이 없습니다</strong>
                        <S.JobMessage>왼쪽에서 사진과 설명을 넣고 시작하면 여기서 진행 상태를 바로 볼 수 있습니다.</S.JobMessage>
                    </S.JobCard>
                )}
            </S.JobList>

            <S.Section>
                <S.Title>4. 컷 순서</S.Title>
                <S.Copy>
                    선택한 컷을 기준으로 이어 만들기를 진행합니다. 합칠 컷을 체크하고, 순서가 어색하면 바로 위아래로
                    조정하면 됩니다.
                </S.Copy>
            </S.Section>

            <S.Timeline>
                {sortedClips.map((clip, index) => {
                    const selectedForMerge = mergeSelection.includes(clip.id);
                    const isSelected = clip.id === selectedClipId;

                    return (
                        <S.ClipButton
                            key={clip.id}
                            $active={isSelected}
                            $selected={selectedForMerge}
                            onClick={() => setSelectedClipId(clip.id)}
                        >
                            <strong>{`${index + 1}. ${clip.title}`}</strong>
                            <p>{clip.prompt}</p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                <S.Badge>{modeLabel(clip.mode)}</S.Badge>
                                {clip.lastFrameUrl ? <S.Badge>마지막 프레임 저장됨</S.Badge> : null}
                                {clip.takeGroupId && clip.takeIndex ? <S.Badge>{`대체안 ${clip.takeIndex}`}</S.Badge> : null}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                                <S.Button
                                    $ghost
                                    aria-pressed={selectedForMerge}
                                    style={{ padding: '8px 10px' }}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setMergeSelection((previous) =>
                                            previous.includes(clip.id)
                                                ? previous.filter((id) => id !== clip.id)
                                                : [...previous, clip.id],
                                        );
                                    }}
                                >
                                    {selectedForMerge ? '합치기 해제' : '합치기 선택'}
                                </S.Button>
                                <S.Button
                                    $ghost
                                    style={{ padding: '8px 10px' }}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void moveClip(clip.id, 'up');
                                    }}
                                >
                                    위로
                                </S.Button>
                                <S.Button
                                    $ghost
                                    style={{ padding: '8px 10px' }}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void moveClip(clip.id, 'down');
                                    }}
                                >
                                    아래로
                                </S.Button>
                            </div>
                        </S.ClipButton>
                    );
                })}
            </S.Timeline>
        </S.Right>
    );
}
