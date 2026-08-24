'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  PauseCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import styled from 'styled-components';
import { EMOTICON_EXPORT_FORMATS, type EmoticonJob } from '@/schemas/emoticonStudio';
import type { EmoticonCreationTurn } from '@/schemas/emoticonStudioV2';
import { hasEmoticonSubjectGenerationMismatch } from '@/services/emoticonStudioService';
import { FORMAT_LABELS } from '../EmoticonStudio.constants';
import { CreationSheetBoard } from './CreationSheetBoard';
import { StaticAnimationBuilder, type StaticAnimationBuildRequest } from './StaticAnimationBuilder';
import * as S from './StudioShell.styles';

type Props = {
  turn: EmoticonCreationTurn;
  jobs: EmoticonJob[];
  pending: boolean;
  selectedJobId: string | null;
  onSelectJob: (job: EmoticonJob) => void;
  onCancel: (job: EmoticonJob) => Promise<void>;
  onRetry: (job: EmoticonJob) => Promise<void>;
  onDownload: (job: EmoticonJob, format: EmoticonJob['formats'][number]) => Promise<void>;
  onOpenEditor: (job: EmoticonJob, frameIndex?: number) => void;
  onBuildAnimation?: (request: StaticAnimationBuildRequest) => Promise<boolean>;
  onOpenSettings?: () => void;
};

const Turn = styled.article`
  display: grid;
  gap: 12px;
  width: min(960px, 100%);
  margin: 0 auto 22px;
`;

const Prompt = styled.div`
  justify-self: end;
  max-width: min(720px, 88%);
  padding: 13px 16px;
  border-radius: 16px 16px 4px 16px;
  background: #17202b;
  color: #fff;
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  word-break: keep-all;
  white-space: pre-wrap;
`;

const Result = styled.div`
  display: grid;
  gap: 16px;
  padding: clamp(14px, 2.4vw, 22px);
  border: 1px solid #dfe4ea;
  border-radius: 18px 18px 18px 5px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.045);
`;

const ResultHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  strong { display: block; font-size: 16px; }
  p { margin: 5px 0 0; color: #667085; font-size: 12px; }
`;

const ResultBody = styled.div`
  display: grid;
  grid-template-columns: minmax(300px, 1.08fr) minmax(260px, .92fr);
  gap: 18px;
  align-items: start;

  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

const FailureResult = styled.div`
  display: grid;
  gap: 12px;
  padding: clamp(15px, 2.4vw, 22px);
  border: 1px solid #fecdca;
  border-radius: 14px;
  background: #fff6f5;
  color: #912018;

  h3 { margin: 0; color: #7a271a; font-size: 17px; }
  p { margin: 0; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
  small { color: #a15c54; font-size: 11px; line-height: 1.5; }
`;

const FailureStage = styled.span`
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: #fee4e2;
  color: #b42318;
  font-size: 11px;
  font-weight: 800;
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  @media (max-width: 520px) {
    display: grid;
    grid-template-columns: 1fr;
    button { width: 100%; }
  }
`;

const VariantRail = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 3px 3px 5px;
`;

const Variant = styled.button`
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  flex: 0 0 172px;
  min-width: 0;
  min-height: 64px;
  padding: 6px;
  border: 1px solid #dfe4ea;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;

  &[aria-pressed='true'] { border-color: #2952cc; box-shadow: 0 0 0 3px rgba(41, 82, 204, 0.12); }
  &:focus-visible { outline: 3px solid rgba(41, 82, 204, 0.2); }

  img { width: 52px; height: 52px; border-radius: 8px; object-fit: contain; background: #f2f4f7; }
  strong { overflow: hidden; color: #344054; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
`;

type PreviewBackground = 'checker' | 'light' | 'dark';

const Preview = styled.div<{ $background: PreviewBackground }>`
  position: relative;
  display: grid;
  width: 100%;
  min-height: 360px;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border-radius: 10px;
  background-color: ${({ $background }) => $background === 'dark' ? '#182230' : '#fff'};
  background-image: ${({ $background }) => $background === 'checker' ? `
    linear-gradient(45deg, #e8ebef 25%, transparent 25%),
    linear-gradient(-45deg, #e8ebef 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e8ebef 75%),
    linear-gradient(-45deg, transparent 75%, #e8ebef 75%)
  ` : 'none'};
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;

  img { display: block; width: 100%; height: 100%; object-fit: contain; }
  > span { display: grid; justify-items: center; gap: 8px; color: #667085; font-size: 12px; }

  @media (max-width: 520px) { min-height: 280px; }
`;

const ResultDetails = styled.div`
  display: grid;
  gap: 12px;
  min-width: 0;

  h3 { margin: 0; color: #1d2939; font-size: 14px; }
  > small { color: #667085; font-size: 12px; line-height: 1.5; }
`;

const BackgroundSwitch = styled.div`
  display: inline-flex;
  width: fit-content;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: #f2f4f7;

  button {
    min-height: 44px;
    padding: 6px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: #475467;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }
  button[aria-pressed='true'] { border-color: #d0d5dd; background: #fff; color: #1d2939; }
  button:focus-visible { outline: 3px solid rgba(41, 82, 204, 0.2); }
  @media (pointer: coarse) { button { min-height: 44px; } }
`;

const Progress = styled.div<{ $tone?: 'default' | 'danger' }>`
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #eaecf0;

  span { display: block; width: var(--progress); height: 100%; border-radius: inherit; background: ${({ $tone }) => $tone === 'danger' ? '#d92d20' : '#2952cc'}; transition: width 180ms ease; }
  @media (prefers-reduced-motion: reduce) { span { transition: none; } }
`;

const DeliveryStatus = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;

  > div { display: grid; gap: 4px; min-width: 0; padding: 10px; border: 1px solid #e4e7ec; border-radius: 11px; background: #f9fafb; }
  span { color: #667085; font-size: 10px; font-weight: 750; }
  strong { color: #344054; font-size: 12px; line-height: 1.35; }
  div[data-tone='success'] { border-color: #abefc6; background: #f0fdf4; }
  div[data-tone='success'] strong { color: #067647; }
  div[data-tone='warning'] { border-color: #fedf89; background: #fffaeb; }
  div[data-tone='warning'] strong { color: #b54708; }

  @media (max-width: 560px) {
    grid-template-columns: repeat(3, minmax(96px, 1fr));
    overflow-x: auto;
    > div { padding: 9px 8px; }
  }
`;

const DownloadMenu = styled.details`
  position: relative;

  summary {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 14px;
    border: 1px solid #dfe4ea;
    border-radius: 11px;
    background: #fff;
    color: #344054;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker { display: none; }
  summary:focus-visible { outline: 3px solid rgba(41, 82, 204, .2); outline-offset: 2px; }
  > div { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
`;

function previewUrl(job: EmoticonJob): string | null {
  const preferred = job.outputProfile?.type === 'static' ? job.outputs?.png : (
    job.outputs?.apng || job.outputs?.webp || job.outputs?.gif
  );
  return preferred?.url
    || job.compositedFrames?.[0]?.url
    || job.animationFrames?.[0]?.url
    || job.keyPoseUrl
    || null;
}

function isWorking(job: EmoticonJob): boolean {
  return ['queued', 'analyzing', 'generating', 'validating', 'animating', 'rendering'].includes(job.status);
}

function resultHeading(turn: EmoticonCreationTurn, jobs: EmoticonJob[]): string {
  const subjectMismatchCount = jobs.filter(hasEmoticonSubjectGenerationMismatch).length;
  const completedCount = jobs.filter((job) => (
    job.status === 'completed' && !hasEmoticonSubjectGenerationMismatch(job)
  )).length;
  const failedCount = jobs.filter((job) => job.status === 'failed').length;
  const workingCount = jobs.filter(isWorking).length;
  if (completedCount && subjectMismatchCount) return `${completedCount}개 완성 · ${subjectMismatchCount}개 새 생성 필요`;
  if (subjectMismatchCount) return `${subjectMismatchCount}개 결과는 주제를 새로 생성해야 해요`;
  if (completedCount && failedCount) return `${completedCount}개 완성 · ${failedCount}개 다시 시도 필요`;
  if (completedCount) return `${completedCount}개의 결과가 완성됐어요`;
  if (workingCount) return `${workingCount}개의 결과를 만들고 있어요`;
  if (failedCount || turn.status === 'failed') return '생성을 완료하지 못했어요';
  if (turn.status === 'cancelled') return '작업이 취소됐어요';
  if (turn.status === 'draft') return '요청을 확인하고 있어요';
  if (turn.status === 'completed') return '완성 결과를 불러오는 중이에요';
  return '작업을 준비하고 있어요';
}

function failureStageLabel(job: EmoticonJob): string {
  const stage = job.failureStage || job.frameContinuation?.stage;
  const labels: Record<string, string> = {
    analysis: '캐릭터 분석',
    'pose-generation': '대표 포즈 생성',
    'pose-review': '대표 포즈 검사',
    'pose-correction': '대표 포즈 보정',
    'corrected-pose-review': '보정 포즈 검사',
    'image-generation': 'AI 이미지 생성',
    'static-render': '파일 조립',
    planning: '움직임 설계',
    generation: '프레임 생성',
    review: '프레임 검사',
    render: '파일 조립',
    'repair-generation': '프레임 보정',
    'repair-pose-review': '보정 프레임 검사',
    'repair-sequence-review': '전체 움직임 검사',
    'repair-render': '보정 파일 조립',
  };
  return stage && labels[stage] ? labels[stage] : '생성 처리';
}

export function CreationResultCard(props: Props) {
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('checker');
  const [frameSelection, setFrameSelection] = useState<{ jobId: string; frameIndex: number } | null>(null);
  const selectedJob = props.jobs.find((job) => job.id === props.selectedJobId) || props.jobs[0] || null;
  const hasSavedRecovery = Boolean(
    selectedJob?.resumeAvailable
    || (
      selectedJob?.status === 'failed'
      && selectedJob.renderFailureRecovery?.stage === 'render'
      && selectedJob.renderFailureRecovery.category === 'infrastructure'
      && selectedJob.renderFailureRecovery.poseAccepted
    ),
  );
  const providerTimeout = selectedJob?.failureCode === 'image-provider-timeout';
  const retryLabel = hasSavedRecovery
    ? '저장된 단계부터 복구'
    : providerTimeout
      ? '다른 공급 경로로 다시 생성'
      : '같은 설정으로 다시 생성';
  const selectedFrameIndex = frameSelection && selectedJob && frameSelection.jobId === selectedJob.id
    ? frameSelection.frameIndex
    : null;
  const reviewFrames = selectedJob?.compositedFrames?.length
    ? selectedJob.compositedFrames
    : selectedJob?.animationFrames || [];
  const selectedFrame = selectedFrameIndex === null ? null : reviewFrames[selectedFrameIndex] || null;
  const selectedUrl = selectedFrame?.url || (selectedJob ? previewUrl(selectedJob) : null);
  const downloadableFormats: EmoticonJob['formats'] = selectedJob
    ? EMOTICON_EXPORT_FORMATS.filter((format) => Boolean(selectedJob.outputs?.[format]))
    : [];
  const primaryFormat: EmoticonJob['formats'][number] | undefined = selectedJob?.formats.find((format) => (
    downloadableFormats.includes(format)
  )) || downloadableFormats[0];
  const additionalFormats = downloadableFormats.filter((format) => format !== primaryFormat);
  const subjectMismatchCount = props.jobs.filter(hasEmoticonSubjectGenerationMismatch).length;
  const completedCount = props.jobs.filter((job) => (
    job.status === 'completed' && !hasEmoticonSubjectGenerationMismatch(job)
  )).length;
  const failedCount = props.jobs.filter((job) => job.status === 'failed').length;
  const compactFailure = selectedJob?.status === 'failed' && !selectedUrl;
  const selectedResourceMode = selectedJob?.resourceMode || props.turn.intent.qualityMode;
  const subjectGenerationMismatch = hasEmoticonSubjectGenerationMismatch(selectedJob);
  const isGptLightGeneration = selectedJob?.aiGenerationProfile === 'gpt-light-v1'
    && !subjectGenerationMismatch;
  const isEfficientLocalComposite = !isGptLightGeneration
    && selectedJob?.motionFallbackReason === 'efficient-local-composite-v1';
  const isSpriteSheetGeneration = Boolean(selectedJob?.animationFrames?.length)
    && selectedJob?.animationFrames?.every((frame) => frame.storagePath.includes('sprite-sheet-frame-'));
  const qualityLabel = subjectGenerationMismatch
    ? '원본 합성 · 주제 미생성'
    : isGptLightGeneration
      ? isSpriteSheetGeneration ? 'GPT 라이트 · 실제 포즈' : 'GPT 라이트'
      : selectedResourceMode === 'efficient'
        ? isEfficientLocalComposite ? '기존 즉시 만들기' : '기존 빠른 모드'
        : selectedResourceMode === 'balanced'
          ? '균형 · 선택 보정'
          : 'AI 고품질';
  const staticAnimationJobs = props.turn.intent.outputType === 'static'
    ? props.jobs.filter((job) => (
      job.status === 'completed'
      && !hasEmoticonSubjectGenerationMismatch(job)
      && job.outputProfile?.type === 'static'
      && job.specReport?.technicalPass === true
      && job.specReport?.allOutputsPass === true
      && Boolean(job.outputs?.png)
    ))
    : [];
  return (
    <Turn>
      <Prompt>{props.turn.prompt}</Prompt>
      <Result>
        <ResultHeader role="status" aria-live="polite" aria-atomic="true">
          <div>
            <strong>{resultHeading(props.turn, props.jobs)}</strong>
            <p>{props.turn.intent.outputType === 'animated' ? `${props.turn.intent.frameCount}프레임 · ${(props.turn.intent.durationMs / 1000).toFixed(1)}초` : `정지 이모티콘 ${props.turn.intent.quantity}장`} · {qualityLabel}</p>
          </div>
          {subjectMismatchCount > 0 ? <AlertTriangle size={20} color="#b54708" />
            : completedCount > 0 && failedCount === 0 ? <CheckCircle2 size={20} color="#13795b" />
            : failedCount > 0 || props.turn.status === 'failed' ? <AlertTriangle size={20} color="#b42318" />
              : props.turn.status === 'cancelled' ? <PauseCircle size={20} color="#667085" />
                : <S.Spinner />}
        </ResultHeader>

        {selectedJob?.status === 'completed' ? (
          <DeliveryStatus aria-label="결과 준비 상태">
            <div data-tone={selectedJob.status === 'completed' ? 'success' : 'default'}><span>제작 결과</span><strong>{selectedJob.status === 'completed' ? '파일 제작 완료' : '제작 진행 중'}</strong></div>
            <div data-tone={selectedJob.specReport?.technicalPass && selectedJob.specReport?.allOutputsPass ? 'success' : 'warning'}><span>기술 규격</span><strong>{selectedJob.specReport?.technicalPass && selectedJob.specReport?.allOutputsPass ? '모든 출력 검사 통과' : '확인 또는 수정 필요'}</strong></div>
            <div data-tone="warning"><span>플랫폼 제출</span><strong>최신 공식 정책 확인 필요</strong></div>
          </DeliveryStatus>
        ) : null}

        {props.onBuildAnimation && staticAnimationJobs.length >= 2 ? (
          <StaticAnimationBuilder
            jobs={staticAnimationJobs}
            platform={props.turn.intent.targetPlatform}
            pending={props.pending}
            onBuild={props.onBuildAnimation}
          />
        ) : null}

        {compactFailure && selectedJob ? (
          <FailureResult role="alert">
            <FailureStage>{failureStageLabel(selectedJob)} 단계</FailureStage>
            <h3>{failureStageLabel(selectedJob)}에서 멈췄어요</h3>
            <p>{selectedJob.error || '작업을 완료하지 못했습니다.'} {hasSavedRecovery
              ? '이미 저장된 결과는 버리지 않고 마지막 체크포인트부터 이어갑니다.'
              : providerTimeout
                ? '시간 초과된 공급 경로는 6시간 동안 제외됩니다. 설정은 유지한 채 다른 경로로 새 작업을 시작할 수 있습니다.'
                : '설정을 유지해 새 작업을 시작하거나 필요한 설정만 바꿀 수 있습니다.'}</p>
            <ActionRow>
              <S.Button type="button" disabled={props.pending} onClick={() => void props.onRetry(selectedJob)}><RefreshCw size={15} /> {retryLabel}</S.Button>
              <S.Button type="button" $variant="secondary" onClick={props.onOpenSettings}><Settings2 size={15} /> 생성 설정 바꾸기</S.Button>
            </ActionRow>
            <small>실제 OpenRouter 비용 {typeof selectedJob.openRouterActualCostUsd === 'number' ? `$${selectedJob.openRouterActualCostUsd.toFixed(4)}` : '집계 중'} · 승인 상한 {typeof selectedJob.openRouterAuthorizedCostUsd === 'number' ? `$${selectedJob.openRouterAuthorizedCostUsd.toFixed(2)}` : '서버 계산 중'}</small>
          </FailureResult>
        ) : selectedJob ? (
          <ResultBody>
            <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
              <Preview $background={previewBackground}>
                {selectedUrl ? <img src={selectedUrl} width={512} height={512} alt={selectedFrame ? `${selectedFrameIndex! + 1}번 분할 이미지 미리보기` : '선택한 생성 결과 미리보기'} /> : <span>{isWorking(selectedJob) ? <S.Spinner /> : <Film size={24} />}{selectedJob.statusMessage}</span>}
              </Preview>
              {selectedUrl ? (
                <BackgroundSwitch role="group" aria-label="미리보기 배경">
                  {([['checker', '투명'], ['light', '밝게'], ['dark', '어둡게']] as const).map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={previewBackground === value} onClick={() => setPreviewBackground(value)}>{label}</button>
                  ))}
                </BackgroundSwitch>
              ) : null}
              {props.jobs.length > 1 && props.turn.intent.outputType !== 'static' ? (
                <VariantRail aria-label="다른 생성 결과">
                  {props.jobs.map((job, index) => {
                    const url = previewUrl(job);
                    return (
                      <Variant key={job.id} type="button" aria-pressed={selectedJob.id === job.id} onClick={() => props.onSelectJob(job)}>
                        {url ? <img src={url} width={52} height={52} alt="" /> : <Film size={22} />}
                        <div><strong>{index + 1}번째 결과</strong><Progress $tone={job.status === 'failed' ? 'danger' : 'default'} role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`진행률 ${job.progress}%`} style={{ '--progress': `${job.progress}%` } as React.CSSProperties}><span /></Progress></div>
                      </Variant>
                    );
                  })}
                </VariantRail>
              ) : null}
            </div>

            <ResultDetails>
              <div>
                <h3>{subjectGenerationMismatch
                  ? '원본 합성 결과 · 새 생성 필요'
                  : selectedJob.status === 'completed'
                    ? selectedJob.specReport?.technicalPass ? '검토 후 다운로드' : '규격 확인 후 다운로드'
                    : selectedJob.statusMessage || '작업 상태'}</h3>
                {selectedJob.status === 'failed' || selectedJob.status === 'cancelled' || subjectGenerationMismatch
                  ? null
                  : <Progress role="progressbar" aria-valuenow={selectedJob.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`진행률 ${selectedJob.progress}%`} style={{ '--progress': `${selectedJob.progress}%` } as React.CSSProperties}><span /></Progress>}
              </div>

              {selectedJob.status === 'failed' ? (
                <S.Notice $tone="danger" role="alert"><AlertTriangle size={16} /><span><strong>{failureStageLabel(selectedJob)} 단계에서 중단됐습니다.</strong><br />{selectedJob.error || '작업에 실패했습니다.'} {hasSavedRecovery ? '완성된 중간 결과부터 복구할 수 있습니다.' : '설정을 그대로 두고 다시 시도해 주세요.'}</span></S.Notice>
              ) : null}
              {selectedJob.status === 'cancelled' ? <S.Notice $tone="info"><PauseCircle size={16} /><span>요청에 따라 작업을 안전하게 중단했습니다.</span></S.Notice> : null}
              {selectedJob.specReport && !selectedJob.specReport.technicalPass ? (
                <S.Notice $tone="warning"><AlertTriangle size={16} /><span>기술 규격 검사에서 문제가 발견됐습니다. {[...(selectedJob.specReport.notes || []), ...(selectedJob.specReport.outputInspections || []).flatMap((inspection) => inspection.issues)].slice(0, 3).join(' · ') || '세부 조정에서 출력 검사 결과를 확인하세요.'}</span></S.Notice>
              ) : null}
              {subjectGenerationMismatch ? (
                <S.Notice $tone="warning" role="alert"><AlertTriangle size={16} /><span><strong>원본 합성 · 주제 미생성</strong><br />AI 공급자의 이미지 생성 호출이 확인되지 않아 요청한 주제를 새로 그린 결과가 아닙니다. 이 파일은 참고용으로만 사용하고, 캐릭터 DNA와 원문 주제를 유지한 새 작업으로 다시 생성해 주세요.</span></S.Notice>
              ) : null}
              {selectedJob.status === 'completed' && selectedJob.specReport?.technicalPass && !subjectGenerationMismatch ? (
                <S.Notice $tone="success"><ShieldCheck size={16} /><span>{isEfficientLocalComposite
                  ? '원본 보존 빠른 합성 · 기술 규격 검사 통과'
                  : isSpriteSheetGeneration
                    ? `${selectedJob.animationFrames?.length || 0}개의 실제 포즈·투명도·파일 검사를 통과했습니다.`
                    : `프레임·투명도·파일 검사를 통과했습니다. 품질 점수 ${Math.round(selectedJob.quality?.overall ?? selectedJob.premiumQualityScore ?? 0)}점`}</span></S.Notice>
              ) : null}
              <ActionRow>
                {primaryFormat ? <S.Button type="button" onClick={() => void props.onDownload(selectedJob, primaryFormat)}><Download size={15} /> {FORMAT_LABELS[primaryFormat]} 다운로드</S.Button> : null}
                {selectedJob.status === 'completed' && !subjectGenerationMismatch ? <S.Button type="button" $variant="secondary" onClick={() => props.onOpenEditor(selectedJob, selectedFrameIndex ?? undefined)}><Settings2 size={15} /> {selectedFrame ? `${selectedFrameIndex! + 1}번 이미지 조정` : '세부 조정'}</S.Button> : null}
                {subjectGenerationMismatch && props.onOpenSettings ? <S.Button type="button" $variant="secondary" onClick={props.onOpenSettings}><RefreshCw size={15} /> 새 주제로 다시 생성</S.Button> : null}
                {isWorking(selectedJob) ? <S.Button type="button" $variant="danger" disabled={props.pending || Boolean(selectedJob.cancelRequestedAt)} onClick={() => void props.onCancel(selectedJob)}><PauseCircle size={15} /> {selectedJob.cancelRequestedAt ? '취소 요청됨' : '작업 취소'}</S.Button> : null}
                {selectedJob.status === 'failed' ? <S.Button type="button" disabled={props.pending} onClick={() => void props.onRetry(selectedJob)}><RefreshCw size={15} /> {retryLabel}</S.Button> : null}
                {selectedJob.status === 'cancelled' ? <S.Button type="button" disabled={props.pending} onClick={() => void props.onRetry(selectedJob)}><RefreshCw size={15} /> 같은 설정으로 다시 생성</S.Button> : null}
                {selectedJob.status === 'failed' ? <S.Button type="button" $variant="secondary" onClick={props.onOpenSettings}><Settings2 size={15} /> 생성 설정 바꾸기</S.Button> : null}
                {selectedJob.status === 'cancelled' ? <S.Button type="button" $variant="secondary" onClick={props.onOpenSettings}><Settings2 size={15} /> 생성 설정 바꾸기</S.Button> : null}
              </ActionRow>
              {additionalFormats.length ? (
                <DownloadMenu>
                  <summary><Download size={15} /> 다른 형식</summary>
                  <div>{additionalFormats.map((format) => <S.Button key={format} type="button" $variant="secondary" onClick={() => void props.onDownload(selectedJob, format)}>{FORMAT_LABELS[format]}</S.Button>)}</div>
                </DownloadMenu>
              ) : null}
              <small>실제 OpenRouter 비용 {typeof selectedJob.openRouterActualCostUsd === 'number' ? `$${selectedJob.openRouterActualCostUsd.toFixed(4)}` : '집계 중'} · 승인 상한 {typeof selectedJob.openRouterAuthorizedCostUsd === 'number' ? `$${selectedJob.openRouterAuthorizedCostUsd.toFixed(2)}` : '서버 계산 중'}</small>
            </ResultDetails>
          </ResultBody>
        ) : props.turn.status === 'failed' ? (
          <FailureResult role="alert">
            <FailureStage>작업 준비 단계</FailureStage>
            <h3>생성 작업을 시작하지 못했어요</h3>
            <p>{props.turn.errorMessage || '설정을 확인한 뒤 다시 요청해 주세요.'}</p>
            <ActionRow><S.Button type="button" $variant="secondary" onClick={props.onOpenSettings}><Settings2 size={15} /> 생성 설정으로 이동</S.Button></ActionRow>
          </FailureResult>
        ) : props.turn.status === 'cancelled' ? (
          <S.Notice $tone="info"><PauseCircle size={16} /><span>작업이 취소됐습니다.</span></S.Notice>
        ) : <S.Notice $tone="info"><S.Spinner /><span>중복 요청을 확인하고 작업 번호를 발급하고 있습니다.</span></S.Notice>}

        {selectedJob && !subjectGenerationMismatch && (
          selectedJob.status === 'completed'
          || Boolean(selectedJob.animationFrames?.length || selectedJob.compositedFrames?.length)
        ) ? (
          <CreationSheetBoard
            turn={props.turn}
            jobs={props.jobs}
            selectedJob={selectedJob}
            selectedFrameIndex={selectedFrameIndex}
            pending={props.pending}
            onSelectJob={(job) => {
              setFrameSelection(null);
              props.onSelectJob(job);
            }}
            onSelectFrame={(frameIndex) => setFrameSelection({ jobId: selectedJob.id, frameIndex })}
            onOpenEditor={props.onOpenEditor}
          />
        ) : null}
      </Result>
    </Turn>
  );
}
