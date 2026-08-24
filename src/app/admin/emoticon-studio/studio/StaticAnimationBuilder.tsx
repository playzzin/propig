'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Film,
  Images,
  Pause,
  Play,
  Repeat2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import styled from 'styled-components';
import type { EmoticonJob } from '@/schemas/emoticonStudio';
import type { EmoticonProjectPlatform } from '@/schemas/emoticonProject';
import { getEmoticonPlatformProfile } from '@/lib/emoticonPlatformProfiles';
import * as S from './StudioShell.styles';

export type StaticAnimationPlaybackMode = 'forward' | 'reverse' | 'ping_pong';

export type StaticAnimationBuildRequest = {
  jobIds: string[];
  frameDurationsMs: number[];
  playbackMode: StaticAnimationPlaybackMode;
};

type Props = {
  jobs: EmoticonJob[];
  platform: EmoticonProjectPlatform;
  pending: boolean;
  onBuild: (request: StaticAnimationBuildRequest) => Promise<boolean>;
};

const SPEEDS = [
  { label: '빠르게', durationMs: 80 },
  { label: '보통', durationMs: 125 },
  { label: '느리게', durationMs: 200 },
] as const;

const Panel = styled.section`
  display: grid;
  gap: 16px;
  width: min(980px, 100%);
  margin: 20px auto 0;
  padding: clamp(15px, 2.5vw, 22px);
  border: 1px solid #b8c6ef;
  border-radius: 18px;
  background: #f7f8ff;
  box-shadow: 0 14px 34px rgba(37, 59, 128, .08);

  > header { display: flex; align-items: flex-start; gap: 10px; }
  > header > svg { flex: 0 0 auto; margin-top: 2px; color: #3155c6; }
  h2 { margin: 0; color: #1d2939; font-size: 17px; letter-spacing: -.01em; }
  p { margin: 4px 0 0; color: #667085; font-size: 12px; line-height: 1.55; }
`;

const Section = styled.section`
  display: grid;
  gap: 10px;

  > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  > header strong { color: #344054; font-size: 12px; }
  > header small { color: #667085; font-size: 10px; }
`;

const Rail = styled.div`
  display: flex;
  gap: 9px;
  overflow-x: auto;
  padding: 3px 3px 7px;
  scrollbar-width: thin;
`;

const SelectionActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;

  button {
    min-height: 36px;
    padding: 0 11px;
    border: 1px solid #cbd5f7;
    border-radius: 9px;
    background: #fff;
    color: #3155c6;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }
  button:hover:not(:disabled) { border-color: #3155c6; background: #eef2ff; }
  button:focus-visible { outline: 3px solid rgba(49, 85, 198, .22); outline-offset: 2px; }
  button:disabled { cursor: not-allowed; opacity: .45; }
  button { touch-action: manipulation; }
`;

const FrameButton = styled.button`
  position: relative;
  display: grid;
  flex: 0 0 112px;
  gap: 6px;
  padding: 7px;
  border: 1px solid #d0d5dd;
  border-radius: 12px;
  background: #fff;
  color: #344054;
  font: inherit;
  font-size: 11px;
  font-weight: 750;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;

  img { width: 96px; height: 96px; border-radius: 8px; object-fit: contain; background: #f2f4f7; }
  > span:first-of-type { position: absolute; top: 11px; right: 11px; display: grid; min-width: 25px; height: 25px; place-items: center; padding: 0 6px; border-radius: 13px; background: #17202b; color: #fff; }
  &[aria-pressed='true'] { border-color: #3155c6; box-shadow: 0 0 0 3px rgba(49, 85, 198, .14); }
  &:focus-visible { outline: 3px solid rgba(49, 85, 198, .22); outline-offset: 2px; }
`;

const Workshop = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, .72fr) minmax(0, 1.28fr);
  gap: 14px;

  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

const PreviewCard = styled.div`
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 12px;
  border: 1px solid #d9def1;
  border-radius: 14px;
  background: #fff;
`;

const Preview = styled.div`
  position: relative;
  display: grid;
  width: 100%;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border: 1px solid #d0d5dd;
  border-radius: 12px;
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #edf0f3 25%, transparent 25%),
    linear-gradient(-45deg, #edf0f3 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #edf0f3 75%),
    linear-gradient(-45deg, transparent 75%, #edf0f3 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;

  img { display: block; width: 100%; height: 100%; object-fit: contain; }
  span { color: #667085; font-size: 12px; }
`;

const PreviewBadge = styled.span`
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 5px 8px;
  border-radius: 8px;
  background: rgba(23, 32, 43, .86);
  color: #fff !important;
  font-size: 10px !important;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
`;

const PlayerBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  button {
    display: grid;
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid #cbd5f7;
    border-radius: 10px;
    background: #eef2ff;
    color: #3155c6;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:hover:not(:disabled) { border-color: #3155c6; }
  button:focus-visible { outline: 3px solid rgba(49, 85, 198, .22); outline-offset: 2px; }
  div { min-width: 0; }
  strong { display: block; color: #344054; font-size: 11px; }
  small { display: block; margin-top: 2px; color: #667085; font-size: 10px; }
`;

const Controls = styled.div`
  display: grid;
  align-content: start;
  gap: 13px;
  min-width: 0;
  padding: 13px;
  border: 1px solid #d9def1;
  border-radius: 14px;
  background: #fff;
`;

const ControlGroup = styled.fieldset`
  display: grid;
  gap: 7px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  legend { margin-bottom: 7px; color: #344054; font-size: 11px; font-weight: 850; }
`;

const Segments = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  padding: 4px;
  border-radius: 11px;
  background: #f2f4f7;

  button {
    min-height: 39px;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: #475467;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }
  button[aria-pressed='true'] { border-color: #cbd5f7; background: #fff; color: #253b80; box-shadow: 0 2px 6px rgba(16, 24, 40, .06); }
  button:focus-visible { outline: 3px solid rgba(49, 85, 198, .22); outline-offset: 1px; }
`;

const Timeline = styled.ol`
  display: flex;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 2px 2px 7px;
  overflow-x: auto;
  list-style: none;
  scrollbar-width: thin;
`;

const TimelineFrame = styled.li`
  display: grid;
  flex: 0 0 128px;
  gap: 6px;
  padding: 7px;
  border: 1px solid #d9def1;
  border-radius: 11px;
  background: #fbfbfe;

  img { display: block; width: 112px; height: 82px; border-radius: 7px; background: #f2f4f7; object-fit: contain; }
  label { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 5px; color: #667085; font-size: 9px; }
  input { width: 58px; min-height: 30px; border: 1px solid #d0d5dd; border-radius: 7px; color: #344054; font: inherit; font-size: 10px; text-align: center; }
`;

const FrameTools = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;

  button {
    display: grid;
    min-height: 31px;
    place-items: center;
    border: 1px solid #d0d5dd;
    border-radius: 7px;
    background: #fff;
    color: #475467;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:hover:not(:disabled) { border-color: #3155c6; color: #3155c6; }
  button:last-child { color: #b42318; }
  button:disabled { cursor: default; opacity: .35; }
  button:focus-visible { outline: 3px solid rgba(49, 85, 198, .2); }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 2px;

  small { color: #667085; font-size: 11px; line-height: 1.5; }
  > button:first-of-type { margin-left: auto; }

  @media (max-width: 650px) {
    align-items: stretch;
    flex-direction: column;
    button { width: 100%; margin-left: 0; }
  }
`;

function staticPreview(job: EmoticonJob): string {
  return job.outputs?.png?.url || job.keyPoseUrl || job.compositedFrames?.[0]?.url || job.sourceImageUrl;
}

function resolvePlaybackSequence(ids: string[], mode: StaticAnimationPlaybackMode): string[] {
  if (mode === 'reverse') return [...ids].reverse();
  if (mode === 'ping_pong' && ids.length > 2) return [...ids, ...ids.slice(1, -1).reverse()];
  return ids;
}

export function StaticAnimationBuilder({ jobs, platform, pending, onBuild }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [durationById, setDurationById] = useState<Record<string, number>>({});
  const [playbackMode, setPlaybackMode] = useState<StaticAnimationPlaybackMode>('forward');
  const [playing, setPlaying] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [selectionCustomized, setSelectionCustomized] = useState(false);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const animationProfile = getEmoticonPlatformProfile(platform, 'animated');
  const minFrames = animationProfile.minFrameCount;
  const maxFrames = animationProfile.maxFrameCount;
  const jobMap = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const playbackIds = useMemo(() => resolvePlaybackSequence(selectedIds, playbackMode), [playbackMode, selectedIds]);
  const playbackJobs = playbackIds.flatMap((jobId) => {
    const job = jobMap.get(jobId);
    return job ? [job] : [];
  });
  const totalDurationMs = playbackIds.reduce((sum, jobId) => sum + (durationById[jobId] || 125), 0);
  const previewJob = playbackJobs[previewIndex] || null;
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    const available = new Set(jobs.map((job) => job.id));
    setSelectedIds((current) => selectionCustomized
      ? current.filter((jobId) => available.has(jobId)).slice(0, maxFrames)
      : jobs.slice(0, Math.min(8, maxFrames)).map((job) => job.id));
    setDurationById((current) => {
      const next: Record<string, number> = {};
      jobs.forEach((job) => { next[job.id] = current[job.id] || 125; });
      return next;
    });
  }, [jobs, maxFrames, selectionCustomized]);

  useEffect(() => {
    setPreviewIndex(0);
  }, [playbackMode, selectedIds]);

  useEffect(() => {
    if (!playing || playbackJobs.length < 2) return undefined;
    const activeId = playbackIds[previewIndex] || playbackIds[0];
    previewTimerRef.current = window.setTimeout(() => {
      setPreviewIndex((current) => (current + 1) % playbackJobs.length);
    }, durationById[activeId] || 125);
    return () => {
      if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    };
  }, [durationById, playbackIds, playbackJobs.length, playing, previewIndex]);

  const updateSelection = (updater: (current: string[]) => string[]) => {
    setSelectionCustomized(true);
    setError('');
    setSelectedIds(updater);
  };

  const toggle = (jobId: string) => {
    updateSelection((current) => current.includes(jobId)
      ? current.filter((value) => value !== jobId)
      : current.length < maxFrames ? [...current, jobId] : current);
  };

  const selectAll = () => {
    updateSelection(() => jobs.slice(0, maxFrames).map((job) => job.id));
  };

  const moveFrame = (index: number, offset: -1 | 1) => {
    updateSelection((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const applySpeed = (durationMs: number) => {
    setDurationById((current) => {
      const next = { ...current };
      selectedIds.forEach((jobId) => { next[jobId] = durationMs; });
      return next;
    });
  };

  const downloadSelectedZip = async () => {
    const selected = selectedIds.flatMap((jobId) => {
      const job = jobMap.get(jobId);
      return job?.outputs?.png ? [{ job, url: job.outputs.png.url }] : [];
    });
    if (!selected.length || zipProgress !== null) return;
    setError('');
    setZipProgress(0);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const [index, output] of selected.entries()) {
        const response = await fetch(output.url, { credentials: 'omit', cache: 'no-store' });
        if (!response.ok) throw new Error(`${index + 1}번째 PNG를 불러오지 못했습니다.`);
        zip.file(`emoticon-${String(index + 1).padStart(2, '0')}.png`, await response.blob(), { compression: 'STORE' });
        setZipProgress(Math.round(((index + 1) / selected.length) * 70));
      }
      const blob = await zip.generateAsync({ type: 'blob', streamFiles: true }, (metadata) => {
        setZipProgress(70 + Math.round(metadata.percent * .3));
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `emoticon-png-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '선택한 PNG ZIP을 만들지 못했습니다.');
    } finally {
      setZipProgress(null);
    }
  };

  const build = async () => {
    if (playbackIds.length < minFrames || playbackIds.length > maxFrames) {
      setError(`현재 재생 방식은 ${playbackIds.length}프레임입니다. ${minFrames}~${maxFrames}프레임 안에서 선택해 주세요.`);
      return;
    }
    setError('');
    await onBuild({
      jobIds: playbackIds,
      frameDurationsMs: playbackIds.map((jobId) => durationById[jobId] || 125),
      playbackMode,
    });
  };

  const activeSpeed = SPEEDS.find((speed) => selectedIds.length > 0
    && selectedIds.every((jobId) => (durationById[jobId] || 125) === speed.durationMs))?.durationMs;
  const outputLabels = animationProfile.allowedFormats
    .filter((format) => format === 'gif' || format === 'webp' || format === 'apng')
    .map((format) => format.toUpperCase())
    .join('·') || animationProfile.preferredFormat.toUpperCase();

  return (
    <Panel aria-labelledby="static-animation-builder-title">
      <header>
        <Sparkles size={19} aria-hidden="true" />
        <div>
          <h2 id="static-animation-builder-title">정지 결과로 움짤 만들기</h2>
          <p>완성된 정지 이미지를 프레임으로 사용합니다. 순서·속도·재생 방식을 정하면 AI를 다시 호출하지 않고 움짤로 조립합니다.</p>
        </div>
      </header>

      <Section aria-labelledby="animation-source-title">
        <header><strong id="animation-source-title">① 사용할 사진</strong><small>{selectedIds.length}장 선택됨</small></header>
        <SelectionActions aria-label="움짤 프레임 빠른 선택">
          <button type="button" disabled={pending || !jobs.length} onClick={selectAll}>전체 선택</button>
          <button type="button" disabled={pending || !selectedIds.length} onClick={() => updateSelection(() => [])}>모두 빼기</button>
        </SelectionActions>
        <Rail aria-label="움짤로 만들 정지 결과 선택">
          {jobs.map((job, index) => {
            const order = selectedIds.indexOf(job.id);
            return (
              <FrameButton key={job.id} type="button" aria-pressed={order >= 0} onClick={() => toggle(job.id)} disabled={pending}>
                {order >= 0 ? <span aria-label={`${order + 1}번째 프레임`}><Check size={13} /> {order + 1}</span> : null}
                <img src={staticPreview(job)} width={96} height={96} loading="lazy" alt={`${index + 1}번째 정지 결과`} />
                <span>{order >= 0 ? '움짤에 사용' : '눌러서 추가'}</span>
              </FrameButton>
            );
          })}
        </Rail>
      </Section>

      <Workshop>
        <PreviewCard aria-label="움짤 재생 미리보기">
          <Preview>
            {previewJob ? <img src={staticPreview(previewJob)} width={320} height={320} alt="현재 재생 중인 프레임" /> : <span>사진을 선택하면 바로 재생됩니다.</span>}
            {previewJob ? <PreviewBadge>{previewIndex + 1}/{playbackJobs.length}</PreviewBadge> : null}
          </Preview>
          <PlayerBar>
            <button type="button" aria-label={playing ? '미리보기 일시 정지' : '미리보기 재생'} disabled={playbackJobs.length < 2} onClick={() => setPlaying((current) => !current)}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div><strong>{playing ? '실시간 재생 중' : '미리보기 정지'}</strong><small>{playbackJobs.length}프레임 · {(totalDurationMs / 1000).toFixed(2)}초</small></div>
          </PlayerBar>
        </PreviewCard>

        <Controls>
          <ControlGroup>
            <legend>② 넘어가는 방식</legend>
            <Segments>
              <button type="button" aria-pressed={playbackMode === 'forward'} onClick={() => setPlaybackMode('forward')}>정방향</button>
              <button type="button" aria-pressed={playbackMode === 'reverse'} onClick={() => setPlaybackMode('reverse')}>역방향</button>
              <button type="button" aria-pressed={playbackMode === 'ping_pong'} onClick={() => setPlaybackMode('ping_pong')}>왕복</button>
            </Segments>
          </ControlGroup>
          <ControlGroup>
            <legend>③ 전체 속도</legend>
            <Segments>
              {SPEEDS.map((speed) => (
                <button key={speed.durationMs} type="button" aria-pressed={activeSpeed === speed.durationMs} onClick={() => applySpeed(speed.durationMs)}>{speed.label}<br />{speed.durationMs}ms</button>
              ))}
            </Segments>
          </ControlGroup>
          <S.Notice $tone="info"><Repeat2 size={15} /><span>왕복은 마지막 컷에서 갑자기 처음으로 튀지 않도록 중간 컷을 역순으로 이어 붙입니다. 추가 AI 생성 비용은 없습니다.</span></S.Notice>
        </Controls>
      </Workshop>

      <Section aria-labelledby="animation-timeline-title">
        <header><strong id="animation-timeline-title">④ 순서와 사진별 시간</strong><small>화살표로 순서 이동 · ms가 클수록 오래 보임</small></header>
        <Timeline aria-label="선택한 프레임 순서">
          {selectedIds.map((jobId, index) => {
            const job = jobMap.get(jobId);
            if (!job) return null;
            return (
              <TimelineFrame key={jobId}>
                <img src={staticPreview(job)} width={112} height={82} loading="lazy" alt={`${index + 1}번째 프레임`} />
                <label><span><Clock3 size={11} aria-hidden="true" style={{ verticalAlign: -2 }} /> {index + 1}번</span><input name={`frameDuration-${index + 1}`} type="number" inputMode="numeric" min={40} max={2000} step={10} value={durationById[jobId] || 125} aria-label={`${index + 1}번째 프레임 표시 시간`} onChange={(event) => setDurationById((current) => ({ ...current, [jobId]: Math.max(40, Math.min(2000, Number(event.target.value) || 125)) }))} /></label>
                <FrameTools>
                  <button type="button" aria-label={`${index + 1}번째 프레임 왼쪽으로 이동`} disabled={index === 0 || pending} onClick={() => moveFrame(index, -1)}><ChevronLeft size={14} /></button>
                  <button type="button" aria-label={`${index + 1}번째 프레임 오른쪽으로 이동`} disabled={index === selectedIds.length - 1 || pending} onClick={() => moveFrame(index, 1)}><ChevronRight size={14} /></button>
                  <button type="button" aria-label={`${index + 1}번째 프레임 제거`} disabled={pending} onClick={() => updateSelection((current) => current.filter((value) => value !== jobId))}><Trash2 size={13} /></button>
                </FrameTools>
              </TimelineFrame>
            );
          })}
        </Timeline>
      </Section>

      {playbackIds.length > maxFrames ? <S.Notice $tone="warning"><AlertTriangle size={15} /><span>왕복 재생으로 {playbackIds.length}프레임이 됩니다. 플랫폼 최대 {maxFrames}프레임에 맞게 사진 수를 줄여 주세요.</span></S.Notice> : null}
      {error ? <S.Notice $tone="danger" role="alert"><AlertTriangle size={15} /><span>{error}</span></S.Notice> : null}
      <Footer>
        <small><Images size={14} style={{ verticalAlign: -2 }} /> 최종 {playbackIds.length}프레임 · {(totalDurationMs / 1000).toFixed(2)}초 · OpenRouter 이미지 호출 0회</small>
        <S.Button type="button" $variant="secondary" disabled={pending || !selectedIds.length || zipProgress !== null} onClick={() => void downloadSelectedZip()}>
          {zipProgress !== null ? <S.Spinner /> : <Download size={16} />} {zipProgress !== null ? `ZIP ${zipProgress}%` : '선택 PNG ZIP'}
        </S.Button>
        <S.Button type="button" disabled={pending || playbackIds.length < minFrames || playbackIds.length > maxFrames} onClick={() => void build()}>
          {pending ? <S.Spinner /> : <Film size={16} />} 이 설정으로 {outputLabels} 만들기
        </S.Button>
      </Footer>
    </Panel>
  );
}
