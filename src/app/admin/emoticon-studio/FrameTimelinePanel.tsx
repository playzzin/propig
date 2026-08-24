'use client';

import { Download, Film, ImagePlus, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import type { EmoticonJob } from '@/schemas/emoticonStudio';
import type { EmoticonProjectItem } from '@/schemas/emoticonProject';
import * as S from './EmoticonStudio.styles';

const PHASE_LABELS = {
  start: '시작',
  anticipation: '준비',
  action: '핵심 동작',
  opposite: '반대 동작',
  'follow-through': '여운',
  recovery: '회복',
  'loop-return': '루프 연결',
} as const;

const WORKING_STATUSES = new Set([
  'queued',
  'analyzing',
  'generating',
  'validating',
  'animating',
  'rendering',
]);

function bubbleTextAtFrame(item: EmoticonProjectItem, frameIndex: number): string | null {
  if (!item.bubble.enabled) return null;
  const timeline = item.bubble.timeline;
  if (timeline.mode === 'cues') {
    return timeline.cues.find((cue) => frameIndex >= cue.startFrame && frameIndex <= cue.endFrame)?.text || null;
  }
  if (timeline.mode === 'full') return item.bubble.text || null;
  const endFrame = timeline.endFrame ?? item.motion.frameCount - 1;
  return frameIndex >= timeline.startFrame && frameIndex <= endFrame ? item.bubble.text || null : null;
}

type FrameTimelinePanelProps = {
  item: EmoticonProjectItem | null;
  job: EmoticonJob | null;
  isLoading?: boolean;
  regeneratingFrameIndex?: number | null;
  onRegenerateFrame?: (job: EmoticonJob, frameIndex: number) => Promise<void>;
  onDownloadFrame?: (job: EmoticonJob, frameIndex: number) => Promise<void>;
};

export function FrameTimelinePanel({
  item,
  job,
  isLoading = false,
  regeneratingFrameIndex = null,
  onRegenerateFrame,
  onDownloadFrame,
}: FrameTimelinePanelProps) {
  if (isLoading) {
    return (
      <S.TimelineEmpty role="status" aria-live="polite">
        <S.InlineSpinner /> 프레임 정보를 불러오는 중…
      </S.TimelineEmpty>
    );
  }
  if (!item) {
    return (
      <S.TimelineEmpty>
        <Film size={22} aria-hidden="true" />
        <strong>항목을 선택하면 프레임 흐름을 볼 수 있어요.</strong>
      </S.TimelineEmpty>
    );
  }

  const plannedCount = job?.plan?.action.frameCount || item.motion.frameCount;
  const frameCount = Math.max(1, Math.min(24, plannedCount));
  const fps = job?.plan?.action.fps || item.motion.fps;
  const durationMs = job?.plan?.action.durationMs ?? item.motion.durationMs;
  const frames = Array.from({ length: frameCount }, (_, index) => index);
  const displayFrames = job?.compositedFrames?.length
    ? job.compositedFrames
    : job?.animationFrames;
  const checkpointFrameIndex = job?.frameContinuation
    && 'nextFrameIndex' in job.frameContinuation
    ? Math.min(frameCount, job.frameContinuation.nextFrameIndex)
    : Math.min(frameCount, displayFrames?.length || 0);
  const isShowingCompositedFrames = Boolean(job?.compositedFrames?.length);
  const canRepairFrames = Boolean(
    job
    && job.status === 'completed'
    && job.plan?.action.renderMode === 'dynamic'
    && job.animationFrames?.length === frameCount
    && job.specReport?.technicalPass === true
    && job.specReport?.allOutputsPass === true,
  );

  return (
    <S.FrameTimeline aria-label={`${item.title} 프레임 타임라인`}>
      <S.TimelineHeader>
        <div>
          <span>선택 항목 #{item.order}</span>
          <h3>{item.title} 프레임 타임라인</h3>
          <p>{job?.frameSequencePlan?.sequenceSummary || '생성 전에 속도와 장수를 확인하고, 생성 뒤에는 각 이미지 변화를 비교합니다.'}</p>
        </div>
        <S.TimelineStats>
          <span><strong>{frameCount}</strong>장</span>
          <span><strong>{fps}</strong> FPS</span>
          <span><strong>{(durationMs / 1000).toFixed(2)}</strong>초</span>
        </S.TimelineStats>
      </S.TimelineHeader>

      <S.FrameTrack role="list" aria-label="프레임 순서">
        {frames.map((frameIndex) => {
          const generatedFrame = displayFrames?.[frameIndex];
          const direction = job?.frameSequencePlan?.frames.find((frame) => frame.frameIndex === frameIndex);
          const bubbleText = bubbleTextAtFrame(item, frameIndex);
          const state = generatedFrame
            ? 'ready'
            : job?.status === 'failed'
              ? frameIndex === checkpointFrameIndex && checkpointFrameIndex < frameCount
                ? 'failed'
                : frameIndex < checkpointFrameIndex
                  ? 'missing'
                  : 'waiting'
              : job?.status === 'completed'
                ? 'missing'
                : job && WORKING_STATUSES.has(job.status)
                  ? direction ? 'planned' : 'waiting'
                  : direction ? 'planned' : 'idle';
          const stateLabel = state === 'ready'
            ? '완료'
            : state === 'failed'
              ? '점검 필요'
              : state === 'missing'
                ? '프레임 누락'
                : state === 'planned'
                  ? '생성 예정'
                : state === 'waiting'
                    ? job?.status === 'failed' ? '미생성' : '분석 중'
                    : '준비 전';

          return (
            <S.FrameCell key={frameIndex} role="listitem" $state={state}>
              <S.FrameCellHeader>
                <strong>{String(frameIndex + 1).padStart(2, '0')}</strong>
                <span>{direction ? PHASE_LABELS[direction.phase] : frameIndex === 0 ? '시작' : frameIndex === frameCount - 1 ? '루프 연결' : '동작 변화'}</span>
              </S.FrameCellHeader>
              <S.FrameThumb>
                {generatedFrame ? (
                  <img
                    src={generatedFrame.url}
                    width={116}
                    height={116}
                    loading="lazy"
                    alt={`${item.title} ${frameIndex + 1}번 프레임`}
                  />
                ) : (
                  <ImagePlus size={22} aria-hidden="true" />
                )}
                {bubbleText ? (
                  <S.FrameBubbleMarker title={bubbleText} aria-label={`말풍선: ${bubbleText}`}>
                    <MessageCircle size={12} aria-hidden="true" />
                  </S.FrameBubbleMarker>
                ) : null}
              </S.FrameThumb>
              <S.FrameCellFooter>
                <span data-state={state}>{stateLabel}</span>
                {direction ? <small title={direction.posePrompt}>{direction.expressionPrompt}</small> : <small>AI가 프레임별 자세와 표정을 설계합니다.</small>}
                {generatedFrame && job && onDownloadFrame ? (
                  <S.FrameRepairButton
                    type="button"
                    onClick={() => void onDownloadFrame(job, frameIndex)}
                  >
                    <Download size={11} aria-hidden="true" />
                    PNG 받기
                  </S.FrameRepairButton>
                ) : null}
                {generatedFrame && canRepairFrames && job && onRegenerateFrame ? (
                  <S.FrameRepairButton
                    type="button"
                    disabled={regeneratingFrameIndex !== null}
                    onClick={() => void onRegenerateFrame(job, frameIndex)}
                  >
                    {regeneratingFrameIndex === frameIndex
                      ? <S.InlineSpinner />
                      : <RefreshCw size={11} aria-hidden="true" />}
                    {regeneratingFrameIndex === frameIndex ? '요청 중…' : '이 프레임 다시 만들기'}
                  </S.FrameRepairButton>
                ) : null}
              </S.FrameCellFooter>
            </S.FrameCell>
          );
        })}
      </S.FrameTrack>

      <S.TimelineLegend>
        <span><i data-state="ready" /> {isShowingCompositedFrames ? '말풍선·편집이 적용된 최종 PNG' : '생성 원본 프레임'}</span>
        <span><i data-state="planned" /> 동작·표정 설계 완료</span>
        <span><MessageCircle size={12} aria-hidden="true" /> 말풍선 노출 프레임</span>
        <span><ShieldCheck size={12} aria-hidden="true" /> 처음과 마지막 프레임의 루프 연결을 검사합니다.</span>
      </S.TimelineLegend>
    </S.FrameTimeline>
  );
}
