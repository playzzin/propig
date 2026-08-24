'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Download, FileArchive, FolderOpen, History, Settings2, Trash2, Upload } from 'lucide-react';
import styled from 'styled-components';
import type { EmoticonProject } from '@/schemas/emoticonProject';
import type { EmoticonProjectDeletionMode } from '@/services/emoticonProjectDeletionService';
import * as S from './StudioShell.styles';

type ProjectExport = {
  fileName: string;
  text: string;
};

type Props = {
  project: EmoticonProject;
  pending: boolean;
  onExport: () => ProjectExport | null;
  onImport: (value: unknown) => Promise<boolean>;
  onOpenHistory: () => void;
  onDelete: (mode: EmoticonProjectDeletionMode) => Promise<boolean>;
};

const Panel = styled.details`
  width: min(860px, 100%);
  margin: 18px auto 0;
  border: 1px solid var(--studio-line);
  border-radius: 15px;
  background: #fff;

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-height: 58px;
    padding: 0 18px;
    color: #344054;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker { display: none; }
  summary:focus-visible { outline: 3px solid rgba(49, 85, 198, 0.2); outline-offset: -3px; }
  summary > span { display: flex; align-items: center; gap: 9px; min-width: 0; }
  summary strong { font-size: 13px; }
  summary small { color: var(--studio-muted); font-size: 12px; }
  summary > svg { color: #667085; transition: transform .16s ease; }
  &[open] summary > svg { transform: rotate(180deg); }

  @media (prefers-reduced-motion: reduce) {
    summary > svg { transition: none; }
  }
`;

const Body = styled.div`
  display: grid;
  gap: 14px;
  padding: 0 18px 18px;
  border-top: 1px solid #eaecf0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;

  @media (max-width: 680px) { grid-template-columns: 1fr; }
`;

const Tool = styled.div`
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
  padding: 13px;
  border: 1px solid #eaecf0;
  border-radius: 12px;
  background: #fcfcfd;

  strong { color: #344054; font-size: 12px; }
  p { margin: 0; color: #667085; font-size: 11px; line-height: 1.5; }
  button { width: 100%; }
`;

const DangerTool = styled(Tool)`
  border-color: #fecdca;
  background: #fffbfa;
`;

const DeleteForm = styled.div`
  display: grid;
  gap: 10px;
  padding-top: 4px;

  fieldset { display: grid; gap: 7px; margin: 0; padding: 0; border: 0; }
  legend { margin-bottom: 5px; color: #344054; font-size: 11px; font-weight: 750; }
  label { display: flex; align-items: flex-start; gap: 7px; color: #475467; font-size: 11px; line-height: 1.45; }
  input[type='radio'] { margin-top: 2px; }
  input[type='text'] {
    width: 100%;
    min-height: 44px;
    padding: 9px 11px;
    border: 1px solid #fda29b;
    border-radius: 9px;
    background: #fff;
    color: #344054;
    font: inherit;
  }
  input[type='text']:focus-visible { outline: 3px solid rgba(217, 45, 32, .17); outline-offset: 1px; }
`;

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export function AdvancedProjectTools({ project, pending, onExport, onImport, onOpenHistory, onDelete }: Props) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isReadingImport, setIsReadingImport] = useState(false);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<EmoticonProjectDeletionMode>('project_only');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const exportProject = () => {
    setError('');
    const prepared = onExport();
    if (!prepared) {
      setError('저장할 프로젝트 정보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const blob = new Blob([prepared.text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = prepared.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > MAX_IMPORT_BYTES) {
      setError('프로젝트 JSON은 2MB 이하 파일만 가져올 수 있습니다.');
      return;
    }
    setIsReadingImport(true);
    try {
      const value: unknown = JSON.parse(await file.text());
      const imported = await onImport(value);
      if (!imported) setError('프로젝트를 불러오지 못했습니다. 파일 형식을 확인해 주세요.');
    } catch {
      setError('읽을 수 없는 JSON 파일입니다. 프로젝트 백업 파일인지 확인해 주세요.');
    } finally {
      setIsReadingImport(false);
    }
  };

  const confirmDeletion = async () => {
    if (deleteConfirmation !== project.title) {
      setError(`확인을 위해 프로젝트 이름 “${project.title}”을 정확히 입력해 주세요.`);
      return;
    }
    setError('');
    setIsDeleting(true);
    try {
      const accepted = await onDelete(deleteMode);
      if (accepted) {
        setDeleteOpen(false);
        setDeleteConfirmation('');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Panel>
      <summary>
        <span><Settings2 size={16} aria-hidden="true" /><span><strong>버전·백업</strong><small>편집본 이력, JSON 백업, 사본 복원</small></span></span>
        <FolderOpen size={16} aria-hidden="true" />
      </summary>
      <Body>
        {error ? <S.Notice $tone="danger" role="alert"><span>{error}</span></S.Notice> : null}
        <Grid>
          <Tool>
            <strong>프로젝트 백업</strong>
            <p>캐릭터 설정과 장면 계획을 안전한 JSON 파일로 저장합니다. 원본 이미지와 생성 파일은 포함하지 않습니다.</p>
            <S.Button type="button" $variant="secondary" disabled={pending} onClick={exportProject}><Download size={15} /> JSON 저장</S.Button>
          </Tool>
          <Tool>
            <strong>프로젝트 불러오기</strong>
            <p>백업 파일은 기존 작업을 덮어쓰지 않고 새로운 프로젝트 사본으로 가져옵니다.</p>
            <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importProject(event)} />
            <S.Button type="button" $variant="secondary" disabled={pending || isReadingImport} onClick={() => importInputRef.current?.click()}><Upload size={15} /> {isReadingImport ? '파일 읽는 중…' : 'JSON 불러오기'}</S.Button>
          </Tool>
          <Tool>
            <strong>편집본·렌더 버전</strong>
            <p>완료·실패·진행 중 작업과 새로 만든 편집본을 찾아 이전 결과를 다시 열 수 있습니다.</p>
            <S.Button type="button" $variant="secondary" disabled={pending} onClick={onOpenHistory}><History size={15} /> 버전 이력 열기</S.Button>
          </Tool>
          <DangerTool>
            <strong>프로젝트 삭제</strong>
            <p>생성 중인 작업이 없을 때만 삭제할 수 있습니다. 생성 파일 포함 여부를 직접 선택합니다.</p>
            {!deleteOpen ? (
              <S.Button type="button" $variant="danger" disabled={pending} onClick={() => setDeleteOpen(true)}><Trash2 size={15} /> 삭제 설정 열기</S.Button>
            ) : (
              <DeleteForm>
                <fieldset disabled={pending || isDeleting}>
                  <legend>삭제 범위</legend>
                  <label><input type="radio" name="project-deletion-mode" value="project_only" checked={deleteMode === 'project_only'} onChange={() => setDeleteMode('project_only')} /> 프로젝트 설정만 삭제하고 생성 결과·원본 파일은 보관</label>
                  <label><input type="radio" name="project-deletion-mode" value="project_and_assets" checked={deleteMode === 'project_and_assets'} onChange={() => setDeleteMode('project_and_assets')} /> 이 프로젝트 전용 생성 결과와 사용되지 않는 원본 파일도 정리</label>
                </fieldset>
                <label htmlFor="project-deletion-confirmation">확인을 위해 <strong>{project.title}</strong> 입력</label>
                <input id="project-deletion-confirmation" type="text" autoComplete="off" value={deleteConfirmation} disabled={pending || isDeleting} onChange={(event) => setDeleteConfirmation(event.target.value)} />
                <S.Button type="button" $variant="danger" disabled={pending || isDeleting || deleteConfirmation !== project.title} onClick={() => void confirmDeletion()}>{isDeleting ? '삭제 요청 중…' : '확인하고 삭제'}</S.Button>
                <S.Button type="button" $variant="quiet" disabled={pending || isDeleting} onClick={() => { setDeleteOpen(false); setDeleteConfirmation(''); setError(''); }}>취소</S.Button>
              </DeleteForm>
            )}
          </DangerTool>
        </Grid>
        <S.Notice $tone="info"><FileArchive size={15} aria-hidden="true" /><span><strong>{project.title}</strong>의 현재 규격과 장면 계획을 기준으로 동작합니다. 이력에서 결과를 여는 작업은 현재 프로젝트를 덮어쓰지 않습니다.</span></S.Notice>
      </Body>
    </Panel>
  );
}
