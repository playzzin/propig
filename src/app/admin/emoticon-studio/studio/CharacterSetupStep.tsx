'use client';

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ImagePlus,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  EmoticonProject,
  EmoticonProjectReferenceRole,
} from '@/schemas/emoticonProject';
import type { EmoticonJob, EmoticonResourceMode } from '@/schemas/emoticonStudio';
import type {
  EmoticonCharacterAnalysisOverride,
  EmoticonCharacterIdentityLock,
} from '@/schemas/emoticonStudioV2';
import { estimateEmoticonCharacterAnalysis } from '@/services/emoticonStudioService';
import * as S from './StudioShell.styles';
import styled from 'styled-components';

type Props = {
  project: EmoticonProject;
  analysisJob: EmoticonJob | null;
  pending: boolean;
  resourceMode: EmoticonResourceMode;
  rightsAttested: boolean;
  onResourceModeChange: (mode: EmoticonResourceMode) => void;
  onRightsAttestedChange: (checked: boolean) => void;
  onAddReferences: (files: File[]) => Promise<void>;
  onRemoveReference: (index: number) => Promise<void>;
  onReferenceRoleChange: (index: number, role: EmoticonProjectReferenceRole) => Promise<void>;
  onAnalyze: () => Promise<void>;
  onApprove: (input: {
    characterName: string;
    overrides: EmoticonCharacterAnalysisOverride;
    identityLock: EmoticonCharacterIdentityLock;
  }) => Promise<void>;
};

const UploadZone = styled.button`
  display: grid;
  min-height: 210px;
  place-items: center;
  padding: 22px;
  border: 1.5px dashed #98a2b3;
  border-radius: 16px;
  background: #fafbfc;
  color: #475467;
  text-align: center;
  cursor: pointer;

  span { display: grid; justify-items: center; gap: 8px; }
  strong { color: #1d2939; font-size: 14px; }
  small { font-size: 11px; line-height: 1.5; }
  &:hover { border-color: #2952cc; background: #f5f8ff; }
  &:focus-visible { outline: 3px solid rgba(41, 82, 204, 0.2); outline-offset: 2px; }
`;

const ReferenceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  figure { position: relative; min-width: 0; margin: 0; }
  img { width: 100%; aspect-ratio: 1; border: 1px solid #dfe4ea; border-radius: 12px; object-fit: contain; background: #f2f4f7; }
  figcaption { margin-top: 5px; color: #667085; font-size: 10px; text-align: center; }
  select { width: 100%; min-height: 36px; margin-top: 5px; border: 1px solid #d0d5dd; border-radius: 8px; padding: 0 7px; background: #fff; color: #344054; font-size: 11px; }
  select:focus-visible { outline: 3px solid rgba(41, 82, 204, .2); outline-offset: 1px; }
  button { position: absolute; top: 5px; right: 5px; display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid #d0d5dd; border-radius: 50%; background: #fff; color: #344054; cursor: pointer; }

  @media (max-width: 520px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const DnaCard = styled.div`
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 22px;
  padding: 18px;
  border: 1px solid #c7d7fe;
  border-radius: 16px;
  background: #f8faff;

  > img { width: 100%; aspect-ratio: 1; border-radius: 14px; object-fit: contain; background: #fff; }
  h3 { margin: 0 0 5px; font-size: 18px; }
  p { margin: 0; color: #475467; font-size: 12px; line-height: 1.6; }
  dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 16px 0 0; }
  dt { color: #667085; font-size: 11px; font-weight: 800; }
  dd { margin: 3px 0 0; color: #344054; font-size: 12px; line-height: 1.5; }

  @media (max-width: 660px) {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 14px;
    > img { max-width: 160px; margin: 0 auto; }
    dl { grid-template-columns: 1fr; gap: 10px; margin-top: 12px; }
  }
`;

const LockGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  label { display: flex; align-items: center; gap: 7px; min-height: 44px; padding: 8px 10px; border: 1px solid #dfe4ea; border-radius: 10px; color: #344054; font-size: 11px; font-weight: 700; }
  input { width: 16px; height: 16px; accent-color: #2952cc; }

  @media (max-width: 520px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const AdvancedDetails = styled.details`
  border-top: 1px solid #eaecf0;
  padding-top: 12px;

  > summary { display: inline-flex; min-height: 44px; align-items: center; gap: 7px; color: #475467; font-size: 11px; font-weight: 800; cursor: pointer; }
  > summary:focus-visible { outline: 3px solid rgba(41, 82, 204, .2); outline-offset: 2px; border-radius: 8px; }
  > div { display: grid; gap: 14px; padding-top: 12px; }
`;

const ConfirmBar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border: 1px solid #d0d5dd;
  border-radius: 14px;
  background: #fff;

  label { display: flex; align-items: flex-start; gap: 9px; color: #344054; font-size: 11px; line-height: 1.5; }
  .confirmed { display: flex; align-items: center; gap: 8px; color: #067647; font-size: 12px; font-weight: 750; }
  input { flex: 0 0 auto; width: 18px; height: 18px; margin-top: 1px; accent-color: #2952cc; }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    button { width: 100%; }
  }
`;

const defaultLock: EmoticonCharacterIdentityLock = {
  strength: 'balanced',
  face: true,
  hair: true,
  outfit: true,
  palette: true,
  proportions: true,
  accessories: true,
};

const REFERENCE_ROLE_LABELS: Record<EmoticonProjectReferenceRole, string> = {
  front: '정면',
  side: '측면',
  back: '후면',
  expression: '표정 참고',
  other: '기타 참고',
};

function ReferenceRoleSelect(props: {
  index: number;
  value?: EmoticonProjectReferenceRole;
  disabled: boolean;
  onChange: (index: number, role: EmoticonProjectReferenceRole) => Promise<void>;
}) {
  return (
    <select
      value={props.value || 'other'}
      disabled={props.disabled}
      aria-label={`${props.index + 1}번 참고 이미지 방향`}
      onChange={(event) => void props.onChange(props.index, event.target.value as EmoticonProjectReferenceRole)}
    >
      {Object.entries(REFERENCE_ROLE_LABELS).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  );
}

export function CharacterSetupStep(props: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysis = props.analysisJob?.characterAnalysis || props.project.character.profile;
  const [characterName, setCharacterName] = useState(props.project.character.name);
  const [summary, setSummary] = useState(analysis?.summary || '');
  const [immutableText, setImmutableText] = useState(analysis?.immutableLock.join('\n') || '');
  const [negativeText, setNegativeText] = useState(analysis?.negativeLock.join('\n') || '');
  const [identityLock, setIdentityLock] = useState<EmoticonCharacterIdentityLock>(defaultLock);
  const estimate = useMemo(() => estimateEmoticonCharacterAnalysis(
    props.resourceMode,
    Math.max(1, props.project.character.references.length),
  ), [props.project.character.references.length, props.resourceMode]);

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) await props.onAddReferences(files);
  };
  const analysisWorking = Boolean(props.analysisJob && ['queued', 'analyzing'].includes(props.analysisJob.status));
  const canAnalyze = props.project.character.references.length > 0 && props.rightsAttested && !props.pending && !analysisWorking;
  const canApprove = Boolean(
    props.analysisJob?.status === 'completed'
    && props.analysisJob.characterAnalysis
    && props.rightsAttested
    && characterName.trim()
    && summary.trim(),
  );

  const approve = () => props.onApprove({
    characterName,
    overrides: {
      summary: summary.trim(),
      immutableLock: immutableText.split('\n').map((value) => value.trim()).filter(Boolean).slice(0, 16),
      negativeLock: negativeText.split('\n').map((value) => value.trim()).filter(Boolean).slice(0, 16),
    },
    identityLock,
  });

  return (
    <S.Workspace>
      <S.Intro>
        <span>준비 · 캐릭터 등록</span>
        <h1>{analysis ? '캐릭터 분석이 끝났어요' : '캐릭터를 먼저 정확하게 기억시켜요'}</h1>
        <p>{analysis ? '핵심 특징이 맞는지만 확인하세요. 세부 잠금과 수정은 필요할 때만 펼칠 수 있습니다.' : '한 장만 넣어도 시작할 수 있고, 정면·측면·표정 참고를 더하면 움직일 때 외형이 더 안정적으로 유지됩니다.'}</p>
      </S.Intro>
      <S.Card>
        <input ref={fileInputRef} name="characterReferences" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => void onFiles(event)} />
        {props.analysisJob?.status === 'failed' ? (
          <S.Notice $tone="danger"><AlertTriangle size={16} /><span>{props.analysisJob.error || '분석에 실패했습니다. 이미지를 다시 선택하거나 재시도해 주세요.'}</span></S.Notice>
        ) : null}
        {analysisWorking ? (
          <S.Notice $tone="info"><S.Spinner /><span>{props.analysisJob?.statusMessage || '얼굴, 머리, 의상과 움직임 기준점을 분석하고 있습니다.'}</span></S.Notice>
        ) : null}

        {!analysis ? (
          <>
            <S.SectionTitle>
              <div><h2>참고 이미지</h2><p>PNG, JPG, WebP · 주 이미지 1장과 보조 이미지 최대 3장</p></div>
              <S.Button type="button" $variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={props.pending || props.project.character.references.length >= 4}><ImagePlus size={15} /> 이미지 추가</S.Button>
            </S.SectionTitle>
            {props.project.character.references.length ? (
              <ReferenceGrid aria-label="캐릭터 참고 이미지">
                {props.project.character.references.map((reference, index) => (
                  <figure key={reference.sourceStoragePath}>
                    <img src={reference.sourceImageUrl} width={320} height={320} alt={`${index === 0 ? '대표' : '보조'} 참고 이미지 ${index + 1}`} />
                    <figcaption>{index === 0 ? '대표 이미지' : `보조 참고 ${index}`} · {REFERENCE_ROLE_LABELS[reference.viewRole || 'other']}</figcaption>
                    <ReferenceRoleSelect index={index} value={reference.viewRole} disabled={props.pending} onChange={props.onReferenceRoleChange} />
                    <button type="button" aria-label={`참고 이미지 ${index + 1} 제거`} onClick={() => void props.onRemoveReference(index)} disabled={props.pending}><X size={14} /></button>
                  </figure>
                ))}
              </ReferenceGrid>
            ) : <UploadZone type="button" onClick={() => fileInputRef.current?.click()}><span><ImagePlus size={30} /><strong>캐릭터 이미지를 선택하세요</strong><small>전신이 잘리지 않고 배경과 구분되는 이미지가 좋아요.</small></span></UploadZone>}
            <S.Split>
              <S.Field>분석 방식<S.Segments><button type="button" aria-pressed={props.resourceMode === 'efficient'} onClick={() => props.onResourceModeChange('efficient')}>GPT 라이트</button><button type="button" aria-pressed={props.resourceMode === 'balanced'} onClick={() => props.onResourceModeChange('balanced')}>균형</button><button type="button" aria-pressed={props.resourceMode === 'premium'} onClick={() => props.onResourceModeChange('premium')}>정밀하게</button></S.Segments></S.Field>
              <S.Notice $tone="info"><ShieldCheck size={16} /><span>예상 {estimate.expectedSecondsMin}–{estimate.expectedSecondsMax}초 · OpenRouter {estimate.expectedRequestCountMin}–{estimate.expectedRequestCountMax}회. 같은 이미지 조합은 캐시를 재사용합니다.</span></S.Notice>
            </S.Split>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, color: '#344054', fontSize: 12, lineHeight: 1.5 }}><input type="checkbox" checked={props.rightsAttested} onChange={(event) => props.onRightsAttestedChange(event.target.checked)} style={{ marginTop: 2, width: 17, height: 17, accentColor: '#2952cc' }} />이 이미지를 이모티콘 제작에 사용할 권리를 보유하고 있으며 AI 분석 및 생성에 사용하는 데 동의합니다.</label>
            <S.Button type="button" onClick={() => void props.onAnalyze()} disabled={!canAnalyze}>{props.pending ? <S.Spinner /> : <BrainCircuit size={16} />} 캐릭터 자동 분석</S.Button>
          </>
        ) : (
          <>
            <S.SectionTitle>
              <div><h2>이 캐릭터가 맞나요?</h2><p>AI가 찾은 핵심 특징입니다. 맞으면 바로 다음 단계로 넘어가세요.</p></div>
              <Sparkles size={20} color="#2952cc" />
            </S.SectionTitle>
            <DnaCard>
              <img src={props.project.character.references[0]?.sourceImageUrl} width={512} height={512} alt="캐릭터 DNA 대표 이미지" />
              <div>
                <h3>{characterName}</h3>
                <p>{summary}</p>
                <dl>
                  <div><dt>얼굴 · 눈</dt><dd>{analysis.attributes.face} · {analysis.attributes.eyes}</dd></div>
                  <div><dt>머리</dt><dd>{analysis.attributes.hair}</dd></div>
                  <div><dt>의상</dt><dd>{analysis.attributes.outfit}</dd></div>
                  <div><dt>비율</dt><dd>{analysis.attributes.proportions}</dd></div>
                  <div><dt>움직이는 부분</dt><dd>{analysis.motionTraits.articulatedParts.join(', ') || '없음'}</dd></div>
                  <div><dt>바닥 · 중심 앵커</dt><dd>{analysis.motionTraits.groundAnchor} · {analysis.motionTraits.centerAnchor}</dd></div>
                </dl>
              </div>
            </DnaCard>
            <ConfirmBar>
              {props.rightsAttested ? (
                <div className="confirmed"><ShieldCheck size={17} /><span>이미지 사용 권리 확인 완료</span></div>
              ) : (
                <label><input type="checkbox" checked={props.rightsAttested} onChange={(event) => props.onRightsAttestedChange(event.target.checked)} /><span>이 이미지를 사용할 권리가 있고 AI 제작에 사용하는 데 동의합니다.</span></label>
              )}
              <S.Button type="button" disabled={!canApprove || props.pending} onClick={() => void approve()}>{props.pending ? <S.Spinner /> : <LockKeyhole size={16} />} 맞아요, 이 캐릭터로 만들기</S.Button>
            </ConfirmBar>
            {analysis.imageQuality.score < 70 || !analysis.imageQuality.usableForGeneration ? (
              <S.Notice $tone="warning"><AlertTriangle size={16} /><span>원본 품질 {analysis.imageQuality.score}점 · {analysis.imageQuality.issues.join(' · ') || '더 선명한 참고 이미지를 권장합니다.'}</span></S.Notice>
            ) : (
              <S.Notice $tone="success"><CheckCircle2 size={16} /><span>원본 품질 {analysis.imageQuality.score}점 · 캐릭터 경계와 구도가 생성 참고에 적합합니다.</span></S.Notice>
            )}
            {analysis.confirmationRequired.length ? (
              <S.Notice $tone="warning"><AlertTriangle size={16} /><span><strong>직접 확인:</strong> {analysis.confirmationRequired.join(' · ')}</span></S.Notice>
            ) : null}
            <AdvancedDetails>
              <summary><LockKeyhole size={15} /> 분석 내용·고정 설정 수정</summary>
              <div>
                <S.SectionTitle><div><h2>참고 이미지 관리</h2><p>참고 이미지가 바뀌면 다시 분석해야 합니다.</p></div><S.Button type="button" $variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={props.pending || props.project.character.references.length >= 4}><ImagePlus size={15} /> 이미지 추가</S.Button></S.SectionTitle>
                <ReferenceGrid aria-label="캐릭터 참고 이미지">
                  {props.project.character.references.map((reference, index) => <figure key={reference.sourceStoragePath}><img src={reference.sourceImageUrl} width={320} height={320} alt={`${index === 0 ? '대표' : '보조'} 참고 이미지 ${index + 1}`} /><figcaption>{index === 0 ? '대표 이미지' : `보조 참고 ${index}`} · {REFERENCE_ROLE_LABELS[reference.viewRole || 'other']}</figcaption><ReferenceRoleSelect index={index} value={reference.viewRole} disabled={props.pending} onChange={props.onReferenceRoleChange} /><button type="button" aria-label={`참고 이미지 ${index + 1} 제거`} onClick={() => void props.onRemoveReference(index)} disabled={props.pending}><X size={14} /></button></figure>)}
                </ReferenceGrid>
                <S.Split><S.Field>캐릭터 이름<input name="characterName" autoComplete="off" value={characterName} maxLength={60} onChange={(event) => setCharacterName(event.target.value)} /></S.Field><S.Field>분석 요약<textarea name="characterSummary" autoComplete="off" value={summary} maxLength={480} onChange={(event) => setSummary(event.target.value)} /></S.Field></S.Split>
                <S.Split><S.Field>반드시 유지할 특징<textarea name="immutableTraits" autoComplete="off" value={immutableText} onChange={(event) => setImmutableText(event.target.value)} /><small>한 줄에 하나씩 입력하세요.</small></S.Field><S.Field>금지할 변형<textarea name="negativeTraits" autoComplete="off" value={negativeText} onChange={(event) => setNegativeText(event.target.value)} /><small>추가 팔다리, 의상 변경, 배경 잔여물 등을 적습니다.</small></S.Field></S.Split>
                <S.Field>캐릭터 고정 강도<S.Segments>{(['natural', 'balanced', 'strict'] as const).map((strength) => <button key={strength} type="button" aria-pressed={identityLock.strength === strength} onClick={() => setIdentityLock((current) => ({ ...current, strength }))}>{strength === 'natural' ? '자연스럽게' : strength === 'balanced' ? '균형 있게' : '엄격하게'}</button>)}</S.Segments></S.Field>
                <LockGrid aria-label="항목별 캐릭터 고정">{([['face', '얼굴'], ['hair', '머리'], ['outfit', '의상'], ['palette', '색상'], ['proportions', '비율'], ['accessories', '액세서리']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={identityLock[key]} onChange={(event) => setIdentityLock((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</LockGrid>
                <S.Split><S.Field>재분석 방식<S.Segments><button type="button" aria-pressed={props.resourceMode === 'efficient'} onClick={() => props.onResourceModeChange('efficient')}>GPT 라이트</button><button type="button" aria-pressed={props.resourceMode === 'balanced'} onClick={() => props.onResourceModeChange('balanced')}>균형</button><button type="button" aria-pressed={props.resourceMode === 'premium'} onClick={() => props.onResourceModeChange('premium')}>정밀하게</button></S.Segments></S.Field><S.Notice $tone="info"><ShieldCheck size={16} /><span>예상 {estimate.expectedSecondsMin}–{estimate.expectedSecondsMax}초 · 동일 조합은 캐시를 재사용합니다.</span></S.Notice></S.Split>
                <S.Button type="button" $variant="secondary" onClick={() => void props.onAnalyze()} disabled={!canAnalyze}><BrainCircuit size={16} /> 현재 이미지로 다시 분석</S.Button>
              </div>
            </AdvancedDetails>
          </>
        )}
      </S.Card>
    </S.Workspace>
  );
}
