'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Crop, ImageIcon, PencilLine, Scissors, Sparkles } from 'lucide-react';
import styled from 'styled-components';
import type { EmoticonJob } from '@/schemas/emoticonStudio';
import type { EmoticonCreationTurn } from '@/schemas/emoticonStudioV2';
import { resolveClientEmoticonSpriteSheetLayout } from '@/lib/emoticonSpriteSheetLayout';
import * as S from './StudioShell.styles';

type Props = {
  turn: EmoticonCreationTurn;
  jobs: EmoticonJob[];
  selectedJob: EmoticonJob;
  selectedFrameIndex: number | null;
  pending: boolean;
  onSelectJob: (job: EmoticonJob) => void;
  onSelectFrame: (frameIndex: number) => void;
  onOpenEditor: (job: EmoticonJob, frameIndex?: number) => void;
};

type SheetAsset = {
  id: string;
  job: EmoticonJob;
  frameIndex?: number;
  label: string;
  progress: number;
  url: string | null;
};

const Workflow = styled.section`
  display: grid;
  gap: 14px;
  padding: 16px 0 2px;
  border-top: 1px solid #eaecf0;
`;

const WorkflowHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  h3 { margin: 0; color: #1d2939; font-size: 15px; letter-spacing: -0.01em; text-wrap: balance; }
  p { margin: 4px 0 0; color: #667085; font-size: 12px; line-height: 1.55; }

  @media (max-width: 620px) { display: grid; }
`;

const Steps = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid #dfe4ea;
    border-radius: 11px;
    background: #fff;
  }

  li > span {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border-radius: 8px;
    background: #eef2ff;
    color: #3155c6;
    font-size: 11px;
    font-weight: 850;
  }

  strong { display: block; overflow: hidden; color: #344054; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  small { display: block; margin-top: 2px; color: #667085; font-size: 10px; }

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    li { min-height: 48px; }
  }

  @media (max-width: 430px) { grid-template-columns: 1fr; }
`;

const SheetWorkspace = styled.div<{ $hasSource: boolean; $showSplitResults: boolean }>`
  display: grid;
  grid-template-columns: ${({ $hasSource, $showSplitResults }) => (
    $hasSource && $showSplitResults ? 'minmax(210px, .62fr) minmax(0, 1.38fr)' : '1fr'
  )};
  gap: 14px;
  padding: 14px;
  border: 1px solid #dfe4ea;
  border-radius: 15px;
  background: #f7f8f6;

  @media (max-width: 760px) { grid-template-columns: 1fr; padding: 10px; }
`;

const SourceSheet = styled.figure`
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
  margin: 0;

  &:only-child {
    width: min(100%, 520px);
    justify-self: center;
  }

  figcaption { display: flex; align-items: center; gap: 7px; color: #344054; font-size: 11px; font-weight: 800; }
  img { display: block; width: 100%; aspect-ratio: 1; border: 1px solid #d0d5dd; border-radius: 11px; background: #fff; object-fit: contain; }
  small { color: #667085; font-size: 10px; line-height: 1.5; }

  @media (max-width: 760px) { img { height: 220px; aspect-ratio: auto; } }
`;

const SplitAction = styled.div`
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid #c7d2f3;
  border-radius: 12px;
  background: #f4f6ff;

  button { width: 100%; min-height: 44px; justify-content: center; }
  small { color: #52649d; font-size: 10px; line-height: 1.5; }
`;

const SplitArea = styled.div`
  display: grid;
  align-content: start;
  gap: 9px;
  min-width: 0;

  > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  > header strong { color: #344054; font-size: 11px; }
  > header span { color: #667085; font-size: 10px; }
`;

const SplitGrid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr));
  gap: 8px;
  padding: 9px;
  border: 1px solid #dfe4ea;
  border-radius: 13px;
  background: #eef0ec;

  @media (max-width: 620px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const Tile = styled.button`
  position: relative;
  display: grid;
  min-width: 0;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  padding: 0;
  border: 1px solid #d0d5dd;
  border-radius: 11px;
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #eef0f2 25%, transparent 25%),
    linear-gradient(-45deg, #eef0f2 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #eef0f2 75%),
    linear-gradient(-45deg, transparent 75%, #eef0f2 75%);
  background-position: 0 0, 0 7px, 7px -7px, -7px 0;
  background-size: 14px 14px;
  cursor: pointer;
  touch-action: manipulation;

  &[aria-pressed='true'] { border-color: #3155c6; box-shadow: 0 0 0 3px rgba(49, 85, 198, .16); }
  &:hover:not(:disabled) { border-color: #7f98df; }
  &:focus-visible { outline: 3px solid rgba(49, 85, 198, .24); outline-offset: 2px; }
  &:disabled { cursor: default; }

  img { display: block; width: 100%; height: 100%; object-fit: contain; }
  > svg { color: #98a2b3; }
`;

const TileNumber = styled.span`
  position: absolute;
  top: 6px;
  left: 6px;
  display: inline-flex;
  min-width: 25px;
  height: 23px;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 7px;
  background: rgba(23, 32, 43, .9);
  color: #fff;
  font-size: 9px;
  font-weight: 850;
  font-variant-numeric: tabular-nums;
`;

const ReadyMark = styled.span`
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: grid;
  width: 23px;
  height: 23px;
  place-items: center;
  border-radius: 50%;
  background: #067647;
  color: #fff;
`;

const SelectionBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 11px;
  background: #eef2ff;

  div { min-width: 0; }
  strong { display: block; color: #253b80; font-size: 12px; }
  small { display: block; margin-top: 2px; color: #52649d; font-size: 10px; line-height: 1.4; }

  @media (max-width: 560px) {
    display: grid;
    button { width: 100%; }
  }
`;

function jobPreviewUrl(job: EmoticonJob): string | null {
  return job.outputs?.png?.url
    || job.outputs?.apng?.url
    || job.outputs?.webp?.url
    || job.outputs?.gif?.url
    || job.compositedFrames?.[0]?.url
    || job.animationFrames?.[0]?.url
    || job.keyPoseUrl
    || null;
}

function isWorking(job: EmoticonJob): boolean {
  return ['queued', 'analyzing', 'generating', 'validating', 'animating', 'rendering'].includes(job.status);
}

export function CreationSheetBoard(props: Props) {
  const isAnimated = props.turn.intent.outputType === 'animated';
  const usesSpriteSheet = isAnimated;
  const frames = props.selectedJob.compositedFrames?.length
    ? props.selectedJob.compositedFrames
    : props.selectedJob.animationFrames || [];
  const assets: SheetAsset[] = isAnimated && frames.length
    ? frames.map((frame, frameIndex) => ({
      id: `${props.selectedJob.id}:${frame.storagePath}`,
      job: props.selectedJob,
      frameIndex,
      label: `${frameIndex + 1}번 분할 이미지`,
      progress: 100,
      url: frame.url,
    }))
    : props.jobs.map((job, index) => ({
      id: job.id,
      job,
      label: `${index + 1}번째 이미지`,
      progress: job.progress,
      url: jobPreviewUrl(job),
    }));
  const sourceSheet = props.selectedJob.spriteSheetGeneration?.url
    ? props.selectedJob.spriteSheetGeneration
    : null;
  const splitReady = Boolean(
    isAnimated
    && sourceSheet?.state === 'extracted'
    && assets.length >= 2,
  );
  const [splitRevealedJobId, setSplitRevealedJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!splitReady) return;
    const jobId = props.selectedJob.id;
    const restoreTimer = window.setTimeout(() => {
      try {
        setSplitRevealedJobId(window.localStorage.getItem(`propig-emoticon-sheet-split:${jobId}`) === '1' ? jobId : null);
      } catch {
        // Storage can be unavailable in private or restricted browser contexts.
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [props.selectedJob.id, splitReady]);

  if (assets.length < 2 && !sourceSheet?.url) return null;

  const splitRevealed = splitRevealedJobId === props.selectedJob.id;
  const revealSplitFrames = () => {
    if (!splitReady) return;
    setSplitRevealedJobId(props.selectedJob.id);
    try {
      window.localStorage.setItem(`propig-emoticon-sheet-split:${props.selectedJob.id}`, '1');
    } catch {
      // The split still works for this session when persistence is unavailable.
    }
    props.onSelectFrame(0);
  };
  const selectedAsset = isAnimated
    ? assets.find((asset) => asset.frameIndex === props.selectedFrameIndex) || null
    : assets.find((asset) => asset.job.id === props.selectedJob.id) || null;
  const readyCount = assets.filter((asset) => asset.url).length;
  const working = props.jobs.some(isWorking);
  const fallbackLayout = resolveClientEmoticonSpriteSheetLayout(Math.max(2, assets.length));
  const columns = Math.max(2, Math.min(6, sourceSheet?.columns || fallbackLayout.columns));
  const showSplitResults = !isAnimated || !sourceSheet?.url || sourceSheet.state === 'rejected' || splitRevealed;
  const splitCount = sourceSheet?.frameCount || assets.length;
  const rows = sourceSheet?.rows || Math.ceil(splitCount / columns);

  return (
    <Workflow aria-label="AI 생성 시트와 개별 분할 결과">
      <WorkflowHeader>
        <div>
          <h3>{isAnimated
            ? sourceSheet?.url && !splitRevealed
              ? '생성된 포즈 시트를 확인하고 분할하세요'
              : '개별 이미지에서 원하는 포즈를 골라 수정하세요'
            : '정지 시트를 나누고 원하는 포즈를 고치세요'}</h3>
          <p>{isAnimated
            ? sourceSheet?.url && !splitRevealed
              ? `AI가 ${columns}×${rows} 포즈 시트 한 장을 만들었습니다. 원본을 확인한 뒤 분할 버튼을 누르면 ${splitCount}장의 편집 가능한 이미지로 나뉩니다.`
              : '각 칸은 독립된 이미지입니다. 원하는 칸을 선택해 수정한 뒤 재생 순서와 속도를 정하면 움짤이 됩니다.'
            : `주제에 맞게 만든 정지 사진 ${assets.length}장을 모았습니다. 각 칸은 독립된 PNG라서 원하는 사진만 수정할 수 있습니다.`}</p>
        </div>
      </WorkflowHeader>

      <Steps aria-label="시트 제작 진행 단계">
        <li><span><Check size={13} aria-hidden="true" /></span><div><strong>1. 주제 이해</strong><small>요청과 캐릭터 DNA 결합</small></div></li>
        <li><span>{working ? <S.Spinner /> : <Sparkles size={13} aria-hidden="true" />}</span><div><strong>2. {usesSpriteSheet ? '모션 시트 생성' : '정지 이미지 생성'}</strong><small>{working ? '이미지를 만드는 중' : `주제에 맞는 ${assets.length}컷 완성`}</small></div></li>
        <li><span><Crop size={13} aria-hidden="true" /></span><div><strong>3. {usesSpriteSheet ? '분할 버튼' : '사진 선택'}</strong><small>{splitRevealed || !sourceSheet?.url ? `${readyCount}/${assets.length}개 PNG 준비` : '원본 확인 후 직접 분할'}</small></div></li>
        <li><span><PencilLine size={13} aria-hidden="true" /></span><div><strong>4. 수정·움짤</strong><small>개별 보정 후 재생 설정</small></div></li>
      </Steps>

      <SheetWorkspace data-testid="source-sheet-workspace" $hasSource={Boolean(sourceSheet?.url)} $showSplitResults={showSplitResults}>
        {sourceSheet?.url ? (
          <SourceSheet>
            <figcaption><ImageIcon size={14} aria-hidden="true" /> AI가 만든 원본 시트</figcaption>
            <img src={sourceSheet.url} width={512} height={512} loading="lazy" alt={`${columns}열 ${rows}행으로 생성된 ${splitCount}컷 원본 포즈 시트`} />
            <small>{columns}×{rows} 격자에 담긴 {splitCount}개 모션과 빈칸·배경 품질을 검사한 원본입니다.</small>
            {splitReady && !splitRevealed ? (
              <SplitAction>
                <S.Button type="button" onClick={revealSplitFrames} disabled={props.pending} aria-controls="emoticon-split-frame-grid">
                  <Scissors size={16} aria-hidden="true" /> {splitCount}장으로 분할
                </S.Button>
                <small>버튼을 누르면 검사된 각 칸을 독립 이미지로 펼쳐 개별 수정과 움짤 제작에 사용할 수 있습니다.</small>
              </SplitAction>
            ) : null}
            {sourceSheet.state === 'extracting' ? <S.Notice $tone="info"><S.Spinner /><span>시트를 안전하게 나눌 수 있는지 검사하고 있습니다.</span></S.Notice> : null}
            {sourceSheet.state === 'rejected' ? <S.Notice $tone="warning"><AlertTriangle size={15} /><span>이 시트는 격자 또는 배경 검사에 통과하지 못해 개별 프레임 생성 결과로 전환했습니다.</span></S.Notice> : null}
          </SourceSheet>
        ) : null}
        {showSplitResults ? <SplitArea id="emoticon-split-frame-grid">
          <header><strong>{sourceSheet?.url ? `분할된 ${splitCount}개 이미지` : isAnimated ? '분할 대체 프레임' : '정지 이미지 모음'}</strong><span>{readyCount}/{assets.length}개 준비됨</span></header>
          <SplitGrid $columns={columns} role="group" aria-label="개별 수정 가능한 이미지">
            {assets.map((asset, index) => {
              const selected = isAnimated
                ? asset.frameIndex === props.selectedFrameIndex
                : asset.job.id === props.selectedJob.id;
              return (
                <Tile
                  key={asset.id}
                  type="button"
                  aria-label={`${asset.label}${selected ? ', 선택됨' : ''}`}
                  aria-pressed={selected}
                  disabled={!asset.url}
                  onClick={() => asset.frameIndex === undefined ? props.onSelectJob(asset.job) : props.onSelectFrame(asset.frameIndex)}
                >
                  {asset.url ? <img src={asset.url} width={180} height={180} loading="lazy" alt="" /> : isWorking(asset.job) ? <S.Spinner /> : <ImageIcon size={22} aria-hidden="true" />}
                  <TileNumber>{String(index + 1).padStart(2, '0')}</TileNumber>
                  {asset.url ? <ReadyMark aria-hidden="true"><Check size={12} /></ReadyMark> : null}
                </Tile>
              );
            })}
          </SplitGrid>
        </SplitArea> : null}
      </SheetWorkspace>

      {showSplitResults ? <SelectionBar aria-live="polite">
        <div>
          <strong>{selectedAsset ? `${selectedAsset.label} 선택됨` : '수정할 이미지를 선택하세요'}</strong>
          <small>{selectedAsset ? '원본은 보존되고 수정 결과는 새 버전으로 만들어집니다. 수정이 끝나면 아래에서 GIF·WebP 재생 순서를 고르세요.' : '위 시트에서 한 칸을 누르면 큰 미리보기와 개별 편집이 연결됩니다.'}</small>
        </div>
        <S.Button
          type="button"
          disabled={!selectedAsset?.url || props.pending || selectedAsset.job.status !== 'completed'}
          onClick={() => selectedAsset && props.onOpenEditor(selectedAsset.job, selectedAsset.frameIndex)}
        >
          <PencilLine size={15} aria-hidden="true" /> 선택 이미지 수정
        </S.Button>
      </SelectionBar> : null}
    </Workflow>
  );
}
