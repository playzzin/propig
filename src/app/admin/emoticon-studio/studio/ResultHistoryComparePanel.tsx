'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Download, GitCompareArrows, Loader2, Star, X } from 'lucide-react';
import styled from 'styled-components';
import { useEmoticonResultHistory } from '@/hooks/useEmoticonResultHistory';
import type { EmoticonJob } from '@/schemas/emoticonStudio';
import { downloadEmoticonFile } from '@/services/emoticonStudioService';
import * as S from './StudioShell.styles';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.62);
`;

const Panel = styled.section`
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1080px, 100%);
  max-height: min(880px, calc(100dvh - 40px));
  overflow: hidden;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.3);

  @media (max-width: 640px) {
    width: 100%;
    max-height: calc(100dvh - 16px);
    border-radius: 16px;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #eaecf0;

  strong { display: block; color: #1d2939; font-size: 18px; }
  p { margin: 4px 0 0; color: #667085; font-size: 12px; line-height: 1.5; }
`;

const Body = styled.div`
  min-width: 0;
  overflow: auto;
  padding: 18px;
`;

const CompareGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;

  @media (max-width: 680px) { grid-template-columns: 1fr; }
`;

const CompareCard = styled.article`
  min-width: 0;
  padding: 13px;
  border: 1px solid #d0d5dd;
  border-radius: 14px;
  background: #f9fafb;
`;

const Preview = styled.div`
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  overflow: hidden;
  margin-bottom: 10px;
  border-radius: 11px;
  background-color: #f2f4f7;
  background-image: linear-gradient(45deg, #e4e7ec 25%, transparent 25%), linear-gradient(-45deg, #e4e7ec 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e4e7ec 75%), linear-gradient(-45deg, transparent 75%, #e4e7ec 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;

  img { width: 100%; height: 100%; object-fit: contain; }
  span { color: #667085; font-size: 12px; }
`;

const Metrics = styled.dl`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin: 10px 0;

  div { min-width: 0; padding: 8px; border-radius: 9px; background: #fff; }
  dt { color: #667085; font-size: 10px; }
  dd { margin: 3px 0 0; color: #344054; font-size: 12px; font-weight: 800; }
`;

const History = styled.div`
  display: grid;
  gap: 9px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #eaecf0;
`;

const HistoryRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid #eaecf0;
  border-radius: 11px;

  > div { min-width: 0; }
  strong { display: block; overflow: hidden; color: #344054; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  small { color: #667085; font-size: 10px; }
  @media (max-width: 520px) { grid-template-columns: minmax(0, 1fr) auto; > :last-child { grid-column: 1 / -1; } }
`;

const EmptyState = styled.div`
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 28px 14px;
  color: #667085;
  text-align: center;
  p { margin: 0; font-size: 12px; }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

function completedLabel(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'string' || value instanceof Date) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '완료 시간 없음' : date.toLocaleString('ko-KR');
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toLocaleString('ko-KR');
  }
  return '완료 시간 없음';
}

function previewUrl(job: EmoticonJob): string {
  return job.outputs?.webp?.url
    || job.outputs?.gif?.url
    || job.outputs?.apng?.url
    || job.outputs?.png?.url
    || job.compositedFrames?.[0]?.url
    || job.animationFrames?.[0]?.url
    || job.keyPoseUrl
    || job.sourceImageUrl;
}

function primaryOutput(job: EmoticonJob) {
  return job.outputs?.webp || job.outputs?.gif || job.outputs?.apng || job.outputs?.png || null;
}

function score(value: number | undefined): string {
  return typeof value === 'number' ? `${Math.round(value)}점` : '집계 없음';
}

function actualCost(job: EmoticonJob): string {
  return typeof job.openRouterActualCostUsd === 'number' ? `$${job.openRouterActualCostUsd.toFixed(3)}` : '집계 전';
}

function actualCalls(job: EmoticonJob): string {
  return typeof job.openRouterUsageRequestCount === 'number' ? `${job.openRouterUsageRequestCount}회` : '집계 전';
}

export default function ResultHistoryComparePanel(props: {
  userId: string;
  projectId: string;
  projectItemId: string;
  activeJobId?: string | null;
  onClose: () => void;
  onSelect: (job: EmoticonJob) => void;
  onUseAsRepresentative: (job: EmoticonJob) => Promise<boolean>;
}) {
  const history = useEmoticonResultHistory({
    userId: props.userId,
    projectId: props.projectId,
    projectItemId: props.projectItemId,
  });
  const [aId, setAId] = useState<string | null>(props.activeJobId || null);
  const [bId, setBId] = useState<string | null>(null);

  const selectedAId = aId || props.activeJobId || history.jobs[0]?.id || null;
  const selectedBId = bId || history.jobs.find((job) => job.id !== selectedAId)?.id || null;
  const selected = useMemo(
    () => [selectedAId, selectedBId].map((id) => history.jobs.find((job) => job.id === id) || null),
    [history.jobs, selectedAId, selectedBId],
  );

  return (
    <Overlay role="dialog" aria-modal="true" aria-labelledby="result-history-title">
      <Panel>
        <Header>
          <div><strong id="result-history-title">완성본 A/B 비교</strong><p>A/B 선택은 비교 화면만 바꾸며, “대표로 사용”을 눌러야 프로젝트 대표 결과가 변경됩니다.</p></div>
          <S.Button type="button" $variant="quiet" aria-label="완성본 비교 닫기" onClick={props.onClose}><X size={18} /></S.Button>
        </Header>
        <Body>
          {history.isLoading ? <EmptyState><Loader2 className="spin" size={24} /><p>완성 기록을 불러오는 중입니다.</p></EmptyState> : history.error ? <S.Notice $tone="danger" role="alert"><span>{history.error}</span></S.Notice> : null}
          <CompareGrid>
            {selected.map((job, index) => (
              <CompareCard key={job?.id || index}>
                <strong>{index === 0 ? 'A 결과' : 'B 결과'}</strong>
                <Preview>{job ? <img src={previewUrl(job)} width={480} height={480} alt={`${index === 0 ? 'A' : 'B'} 완성본 미리보기`} /> : <span>비교할 완성본을 선택하세요.</span>}</Preview>
                {job ? <>
                  <Metrics>
                    <div><dt>캐릭터 일관성</dt><dd>{score(job.quality?.identity)}</dd></div>
                    <div><dt>종합 품질</dt><dd>{score(job.quality?.overall)}</dd></div>
                    <div><dt>기술 규격</dt><dd>{job.specReport?.technicalPass ? '통과' : '확인 필요'}</dd></div>
                    <div><dt>출력 파일</dt><dd>{job.specReport?.allOutputsPass ? '모두 통과' : '확인 필요'}</dd></div>
                    <div><dt>실제 비용</dt><dd>{actualCost(job)}</dd></div>
                    <div><dt>Provider 호출</dt><dd>{actualCalls(job)}</dd></div>
                  </Metrics>
                  <Actions>
                    <S.Button type="button" onClick={() => void props.onUseAsRepresentative(job)}><Star size={14} /> 이 결과를 대표로 사용</S.Button>
                    {primaryOutput(job) ? <S.Button type="button" $variant="secondary" onClick={() => void downloadEmoticonFile(primaryOutput(job)!.url, `emoticon-${job.id}.${primaryOutput(job)!.format}`)}><Download size={14} /> 받기</S.Button> : null}
                  </Actions>
                </> : null}
              </CompareCard>
            ))}
          </CompareGrid>

          <History aria-label="완성본 선택">
            {history.jobs.map((job) => (
              <HistoryRow key={job.id}>
                <div><strong>{job.plan?.action.title || job.instruction || job.id}</strong><small>{completedLabel(job.completedAt)} · 품질 {score(job.quality?.overall)} · 실제 비용 {actualCost(job)}</small></div>
                <S.Button type="button" $variant={job.id === selectedAId ? 'primary' : 'secondary'} aria-pressed={job.id === selectedAId} onClick={() => { setAId(job.id); props.onSelect(job); }}>A 선택</S.Button>
                <S.Button type="button" $variant={job.id === selectedBId ? 'primary' : 'secondary'} aria-pressed={job.id === selectedBId} onClick={() => setBId(job.id)}>B 선택</S.Button>
              </HistoryRow>
            ))}
            {history.hasMore ? <S.Button type="button" $variant="secondary" disabled={history.isLoadingMore} onClick={() => void history.loadMore()}>{history.isLoadingMore ? <Loader2 size={14} /> : <GitCompareArrows size={14} />} 이전 완성본 더 보기</S.Button> : null}
            {!history.isLoading && !history.jobs.length ? <EmptyState><CheckCircle2 size={22} /><p>이 항목의 완성본이 아직 없습니다.</p></EmptyState> : null}
          </History>
        </Body>
      </Panel>
    </Overlay>
  );
}
