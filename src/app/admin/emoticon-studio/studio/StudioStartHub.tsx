'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleHelp, Clock3, FolderOpen, Images, Layers3, SlidersHorizontal, Sparkles, UploadCloud, X } from 'lucide-react';
import styled from 'styled-components';
import type { EmoticonProjectPlatform, EmoticonProjectType } from '@/schemas/emoticonProject';
import { validateEmoticonSourceFile } from '@/services/emoticonStudioService';

export type ManualStartInput = {
  title: string;
  platform: EmoticonProjectPlatform;
  files: File[];
  spriteSheet: File | null;
};

type Props = {
  pending: boolean;
  error?: string | null;
  hasProjects: boolean;
  onClearError?: () => void;
  onOpenProjects?: () => void;
  onStartAi: (input: {
    files: File[];
    title: string;
    platform: EmoticonProjectPlatform;
    outputType: EmoticonProjectType;
    frameCount: number;
  }) => Promise<boolean | void>;
  onStartManual: (input: ManualStartInput) => Promise<boolean | void>;
};

type Mode = 'home' | 'ai' | 'frames' | 'sheet';
type PreviewFile = { id: string; file: File; url: string };

const Root = styled.main`
  min-height: 100%;
  padding: clamp(22px, 5vw, 64px) 16px 56px;
  background:
    radial-gradient(circle at 12% 8%, rgba(91, 76, 255, .11), transparent 28%),
    radial-gradient(circle at 88% 18%, rgba(18, 183, 106, .09), transparent 25%),
    linear-gradient(180deg, #f8f9fc 0%, #f3f5f9 100%);
  @media (max-width: 560px) { padding: 18px 12px 36px; }
`;
const Wrap = styled.div`width: min(1120px, 100%); margin: 0 auto;`;
const Hero = styled.header`
  max-width: 780px;
  margin: 0 auto 28px;
  text-align: center;
  > span { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border: 1px solid #d9ddff; border-radius: 999px; background: rgba(255,255,255,.8); color: #4338ca; font-size: 12px; font-weight: 850; }
  h1 { margin: 15px 0 10px; color: #101828; font-size: clamp(32px, 6vw, 52px); line-height: 1.03; letter-spacing: -.055em; word-break: keep-all; }
  p { margin: 0; color: #667085; font-size: clamp(14px, 2vw, 17px); line-height: 1.65; word-break: keep-all; }
  @media (max-width: 560px) {
    margin-bottom: 18px;
    h1 { margin-top: 12px; font-size: 29px; }
    p { font-size: 13px; line-height: 1.55; }
  }
`;
const HowItWorks = styled.section`
  display: grid;
  grid-template-columns: minmax(190px, .8fr) repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0 0 18px;
  overflow: hidden;
  border: 1px solid #d8dde7;
  border-radius: 18px;
  background: #d8dde7;
  box-shadow: 0 10px 28px rgba(16,24,40,.05);
  > header, > div { min-width: 0; padding: 15px 16px; background: rgba(255,255,255,.96); }
  > header { display: grid; align-content: center; gap: 5px; }
  > header strong { display: flex; align-items: center; gap: 7px; color: #101828; font-size: 13px; }
  > header small { color: #667085; font-size: 11px; line-height: 1.45; }
  > div { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 9px; }
  > div > span { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 9px; background: #eef2ff; color: #4338ca; font-size: 11px; font-weight: 900; }
  > div strong { display: block; color: #344054; font-size: 12px; }
  > div small { display: block; margin-top: 2px; color: #667085; font-size: 10px; line-height: 1.4; }
  @media (max-width: 820px) { grid-template-columns: 1fr; > header { padding-bottom: 10px; } }
  @media (max-width: 560px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-radius: 15px;
    > header { grid-column: 1 / -1; padding: 11px 12px; }
    > header small { font-size: 10px; }
    > div { grid-template-columns: 24px minmax(0, 1fr); gap: 6px; padding: 10px 7px; }
    > div > span { width: 24px; height: 24px; border-radius: 8px; }
    > div strong { font-size: 10px; line-height: 1.35; word-break: keep-all; }
    > div small { display: none; }
  }
`;
const ModeGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;
const ModeCard = styled.button<{ $accent: 'violet' | 'blue' | 'mint' | 'gray' }>`
  display: grid;
  min-height: 210px;
  align-content: space-between;
  gap: 24px;
  padding: clamp(20px, 3vw, 30px);
  border: 1px solid ${({ $accent }) => $accent === 'violet' ? '#c7c2ff' : $accent === 'blue' ? '#b9d4ff' : $accent === 'mint' ? '#a9e6c7' : '#d0d5dd'};
  border-radius: 24px;
  background: ${({ $accent }) => $accent === 'violet' ? 'linear-gradient(145deg,#fff 20%,#f2f0ff)' : $accent === 'blue' ? 'linear-gradient(145deg,#fff 20%,#edf5ff)' : $accent === 'mint' ? 'linear-gradient(145deg,#fff 20%,#edfbf4)' : '#fff'};
  box-shadow: 0 14px 38px rgba(16,24,40,.07);
  color: #101828;
  text-align: left;
  cursor: pointer;
  transition: box-shadow .18s ease, border-color .18s ease;
  &:hover { border-color: #b9c6d8; box-shadow: 0 20px 50px rgba(16,24,40,.12); }
  &:focus-visible { outline: 4px solid rgba(79,70,229,.22); outline-offset: 3px; }
  &:disabled { cursor: not-allowed; opacity: .55; transform: none; }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
  .icon { display: grid; width: 52px; height: 52px; place-items: center; border-radius: 16px; background: #fff; box-shadow: 0 6px 18px rgba(16,24,40,.09); color: #4f46e5; }
  .arrow { color: #98a2b3; }
  h2 { margin: 0 0 7px; font-size: 21px; letter-spacing: -.025em; }
  p { margin: 0; color: #667085; font-size: 13px; line-height: 1.58; }
  small { color: #475467; font-size: 11px; font-weight: 750; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .meta span { display: inline-flex; min-height: 26px; align-items: center; gap: 4px; padding: 0 8px; border: 1px solid rgba(152,162,179,.32); border-radius: 999px; background: rgba(255,255,255,.7); color: #475467; font-size: 10px; font-weight: 800; }
  @media (max-width: 560px) {
    min-height: 168px;
    gap: 13px;
    padding: 18px;
    .icon { width: 44px; height: 44px; border-radius: 13px; }
    h2 { font-size: 18px; }
    p { font-size: 12px; }
    small { display: block; margin-top: 10px; font-size: 10px; line-height: 1.45; }
  }
`;
const Flow = styled.section`
  width: min(920px, 100%);
  margin: 0 auto;
  border: 1px solid #d8dde7;
  border-radius: 24px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 24px 64px rgba(16,24,40,.11);
`;
const FlowHeader = styled.header`
  display: flex; align-items: center; gap: 13px; padding: 18px 22px; border-bottom: 1px solid #eaecf0; background: #fbfcfe;
  button { display: grid; width: 44px; height: 44px; place-items: center; border: 1px solid #d0d5dd; border-radius: 12px; background: #fff; color: #344054; cursor: pointer; }
  h1 { margin: 0; color: #101828; font-size: 18px; }
  p { margin: 3px 0 0; color: #667085; font-size: 12px; }
`;
const Form = styled.div`display: grid; gap: 18px; padding: clamp(18px, 4vw, 30px);`;
const ModeJourney = styled.ol`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none;
  li { display: grid; grid-template-columns: 28px minmax(0,1fr); align-items: center; gap: 8px; padding: 10px; border-radius: 12px; background: #f5f7fb; }
  li > span { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 9px; background: #fff; color: #4338ca; font-size: 11px; font-weight: 900; box-shadow: inset 0 0 0 1px #dfe3ea; }
  strong { display: block; color: #344054; font-size: 11px; }
  small { display: block; margin-top: 2px; color: #667085; font-size: 9px; line-height: 1.4; }
  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;
const BaseSettings = styled.section`
  display: grid; gap: 13px; padding: 15px; border: 1px solid #e0e4eb; border-radius: 15px; background: #fbfcfe;
  > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  > header strong { display: flex; align-items: center; gap: 7px; color: #344054; font-size: 13px; }
  > header small { color: #667085; font-size: 10px; }
  @media (max-width: 560px) { > header { display: grid; } }
`;
const ReadyList = styled.ul`
  display: flex; flex-wrap: wrap; gap: 7px; margin: 0; padding: 0; list-style: none;
  li { display: inline-flex; min-height: 32px; align-items: center; gap: 5px; padding: 0 9px; border-radius: 999px; background: #f2f4f7; color: #667085; font-size: 10px; font-weight: 800; }
  li[data-ready='true'] { background: #ecfdf3; color: #027a48; }
`;
const Field = styled.label`
  display: grid; gap: 7px; color: #344054; font-size: 12px; font-weight: 800;
  input { width: 100%; min-height: 46px; padding: 0 13px; border: 1px solid #d0d5dd; border-radius: 11px; color: #101828; font: inherit; font-size: 14px; }
  input:focus-visible { outline: 3px solid rgba(79,70,229,.18); border-color: #4f46e5; }
`;
const Segments = styled.div`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
  button { min-height: 46px; border: 1px solid #d0d5dd; border-radius: 11px; background: #fff; color: #475467; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
  button[aria-pressed='true'] { border-color: #4f46e5; background: #eef2ff; color: #4338ca; }
  button:focus-visible { outline: 3px solid rgba(79,70,229,.18); }
`;
const Drop = styled.button<{ $compact?: boolean }>`
  display: grid; min-height: ${({ $compact }) => $compact ? '92px' : '210px'}; place-items: center; padding: ${({ $compact }) => $compact ? '14px' : '24px'}; border: 1.5px dashed #98a2b3; border-radius: 18px; background: #f8fafc; color: #475467; text-align: center; cursor: pointer;
  span { display: grid; justify-items: center; gap: 8px; }
  strong { color: #101828; font-size: 16px; }
  small { line-height: 1.55; }
  &:hover { border-color: #4f46e5; background: #f5f4ff; }
  &:focus-visible { outline: 4px solid rgba(79,70,229,.18); outline-offset: 2px; }
`;
const PreviewGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 9px;
  figure { position: relative; min-width: 0; margin: 0; }
  img { width: 100%; aspect-ratio: 1; object-fit: contain; border: 1px solid #e4e7ec; border-radius: 12px; background: #f2f4f7; }
  figcaption { overflow: hidden; margin-top: 4px; color: #667085; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  button { position: absolute; top: 5px; right: 5px; display: grid; width: 32px; height: 32px; place-items: center; border: 1px solid #d0d5dd; border-radius: 50%; background: #fff; color: #344054; cursor: pointer; }
  &:has(figure:only-child) { grid-template-columns: minmax(180px, 260px); }
`;
const Rights = styled.label`display: flex; align-items: flex-start; gap: 9px; color: #475467; font-size: 12px; line-height: 1.55; input { width: 18px; height: 18px; flex: 0 0 auto; accent-color: #4f46e5; }`;
const Footer = styled.footer`
  display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 4px;
  p { margin: 0; color: #667085; font-size: 12px; }
  button { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; gap: 8px; padding: 0 18px; border: 0; border-radius: 12px; background: #4f46e5; color: #fff; font: inherit; font-size: 13px; font-weight: 850; cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .45; }
  @media (max-width: 560px) { align-items: stretch; flex-direction: column; button { width: 100%; } }
`;
const Notice = styled.div`padding: 11px 13px; border: 1px solid #fecdca; border-radius: 11px; background: #fff4f3; color: #b42318; font-size: 12px; line-height: 1.5;`;
const UploadFeedback = styled.div`padding: 10px 12px; border: 1px solid #fedf89; border-radius: 11px; background: #fffaeb; color: #93370d; font-size: 11px; line-height: 1.5;`;

export function StudioStartHub(props: Props) {
  const [mode, setMode] = useState<Mode>('home');
  const [title, setTitle] = useState('내 사진 움짤');
  const [platform, setPlatform] = useState<EmoticonProjectPlatform>('kakao');
  const [outputType, setOutputType] = useState<EmoticonProjectType>('animated');
  const [previews, setPreviews] = useState<PreviewFile[]>([]);
  const [rights, setRights] = useState(false);
  const [localError, setLocalError] = useState('');
  const [uploadFeedback, setUploadFeedback] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef<PreviewFile[]>([]);
  const maxFiles = mode === 'sheet' ? 1 : mode === 'ai' ? 4 : 24;

  useEffect(() => { previewsRef.current = previews; }, [previews]);
  useEffect(() => () => previewsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);

  const files = useMemo(() => previews.map((item) => item.file), [previews]);
  const clearFiles = () => {
    previews.forEach((item) => URL.revokeObjectURL(item.url));
    setPreviews([]);
  };
  const chooseMode = (next: Mode) => {
    clearFiles();
    setMode(next);
    setTitle(next === 'ai' ? '새 AI 이모티콘' : '내 사진 움짤');
    setLocalError('');
    setUploadFeedback('');
    props.onClearError?.();
  };
  const addFiles = (selected: File[]) => {
    const sorted = [...selected]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const next = mode === 'sheet' ? sorted.slice(0, 1) : sorted;
    const accepted: PreviewFile[] = [];
    const invalidFiles: string[] = [];
    let duplicateCount = 0;
    let overflowCount = Math.max(0, sorted.length - next.length);
    const availableSlots = mode === 'sheet' ? 1 : Math.max(0, maxFiles - previews.length);
    for (const file of next) {
      const error = validateEmoticonSourceFile(file);
      if (error) { invalidFiles.push(`${file.name}: ${error}`); continue; }
      const duplicate = [...previews, ...accepted].some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
      if (duplicate) { duplicateCount += 1; continue; }
      if (accepted.length >= availableSlots) { overflowCount += 1; continue; }
      accepted.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) });
    }
    if (accepted.length) {
      const limit = mode === 'ai' ? 4 : mode === 'sheet' ? 1 : 24;
      setPreviews((current) => {
        if (mode === 'sheet') {
          current.forEach((item) => URL.revokeObjectURL(item.url));
          return accepted.slice(0, 1);
        }
        const combined = [...current, ...accepted];
        combined.slice(limit).forEach((item) => URL.revokeObjectURL(item.url));
        return combined.slice(0, limit);
      });
    }
    setLocalError(invalidFiles.join(' · '));
    const feedback = [
      duplicateCount ? `이미 선택한 파일 ${duplicateCount}개는 제외했습니다.` : '',
      overflowCount ? `${mode === 'sheet' ? '시트는 한 장만 선택할 수 있어 나머지 파일을 제외했습니다.' : `최대 ${maxFiles}장까지만 선택할 수 있어 ${overflowCount}개를 제외했습니다.`}` : '',
    ].filter(Boolean).join(' ');
    setUploadFeedback(feedback);
  };
  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };
  const remove = (id: string) => setPreviews((current) => {
    const target = current.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.url);
    return current.filter((item) => item.id !== id);
  });
  const startManual = async () => {
    if (!title.trim()) { setLocalError('프로젝트 이름을 입력해 주세요.'); return; }
    if (mode === 'frames' && files.length < 2) { setLocalError('움짤을 만들 사진을 2장 이상 선택해 주세요.'); return; }
    if (mode === 'sheet' && files.length !== 1) { setLocalError('분할할 시트 이미지 한 장을 선택해 주세요.'); return; }
    if (!rights) { setLocalError('이미지 사용 권리를 확인해 주세요.'); return; }
    setLocalError('');
    await props.onStartManual({ title: title.trim(), platform, files: mode === 'frames' ? files : [], spriteSheet: mode === 'sheet' ? files[0] : null });
  };
  const startAi = async () => {
    if (!title.trim()) { setLocalError('프로젝트 이름을 입력해 주세요.'); return; }
    if (!files.length) { setLocalError('캐릭터 이미지를 한 장 이상 선택해 주세요.'); return; }
    if (!rights) { setLocalError('이미지 사용 권리를 확인해 주세요.'); return; }
    setLocalError('');
    await props.onStartAi({ files, title: title.trim(), platform, outputType, frameCount: 8 });
  };

  if (mode === 'ai' || mode === 'frames' || mode === 'sheet') {
    const isSheet = mode === 'sheet';
    const isAi = mode === 'ai';
    const sourceReady = isAi ? files.length >= 1 : isSheet ? files.length === 1 : files.length >= 2;
    const readyToStart = Boolean(title.trim()) && rights && sourceReady;
    const nextActionLabel = props.pending
      ? '프로젝트 준비 중…'
      : !sourceReady
        ? isAi ? '캐릭터 이미지를 먼저 올려주세요' : isSheet ? '시트 한 장을 먼저 올려주세요' : '사진을 2장 이상 올려주세요'
        : !title.trim()
          ? '프로젝트 이름을 입력해 주세요'
          : !rights
            ? '이미지 사용 권리를 확인해 주세요'
            : isAi ? '캐릭터 확인으로 계속' : '프레임 작업공간 열기';
    return (
      <Root aria-label="이모티콘 스튜디오 시작"><Wrap><Flow aria-busy={props.pending}>
        <FlowHeader><button type="button" aria-label="제작 방식 선택으로 돌아가기" onClick={() => chooseMode('home')}><ArrowLeft size={19} /></button><div><h1>{isAi ? 'AI 캐릭터 준비' : isSheet ? '한 장 시트 자동 분할' : '사진 여러 장으로 움짤 만들기'}</h1><p>{isAi ? '캐릭터를 먼저 확인한 뒤 제작 화면에서 원하는 장면을 만듭니다.' : isSheet ? '격자를 자동 감지하고 필요하면 직접 보정합니다.' : '파일명 순서로 불러온 뒤 타임라인에서 자유롭게 정렬합니다.'}</p></div></FlowHeader>
        <Form>
          <ModeJourney aria-label="선택한 제작 방식의 진행 순서">
            <li><span>1</span><div><strong>{isAi ? '캐릭터 올리기' : isSheet ? '시트 올리기' : '사진 올리기'}</strong><small>{isAi ? '대표 이미지 1~4장' : isSheet ? '격자 이미지 한 장' : '순서가 있는 2~24장'}</small></div></li>
            <li><span>2</span><div><strong>{isAi ? '특징 확인·장면 요청' : isSheet ? '격자 확인·분할' : '순서·시간 편집'}</strong><small>필요한 항목만 화면이 안내합니다.</small></div></li>
            <li><span>3</span><div><strong>검토·내보내기</strong><small>규격 확인 후 GIF·APNG·WebP·PNG ZIP</small></div></li>
          </ModeJourney>
          <input key={`${mode}:${previews.map((item) => item.id).join(':')}`} ref={fileInputRef} type="file" hidden accept="image/png,image/jpeg,image/webp" multiple={!isSheet} onChange={onFiles} />
          {previews.length ? <><PreviewGrid aria-label="선택한 원본 이미지">{previews.map((item, index) => <figure key={item.id}><img src={item.url} alt={`${index + 1}번째 원본`} /><figcaption>{index + 1}. {item.file.name}</figcaption><button type="button" aria-label={`${index + 1}번째 이미지 제거`} onClick={() => remove(item.id)}><X size={14} /></button></figure>)}</PreviewGrid><Drop $compact type="button" onClick={() => fileInputRef.current?.click()}><span><UploadCloud size={24} /><strong>{isSheet ? '다른 시트 선택' : isAi ? '참고 이미지 더하기' : '사진 더 추가'}</strong><small>{isSheet ? 'PNG, JPG, WebP 한 장' : `${previews.length}/${isAi ? 4 : 24}장 선택됨`}</small></span></Drop></> : <Drop type="button" onClick={() => fileInputRef.current?.click()}><span><UploadCloud size={34} /><strong>{isAi ? '캐릭터 이미지 올리기' : isSheet ? '분할할 시트 한 장 올리기' : '사진 2~24장 올리기'}</strong><small>PNG, JPG, WebP · 클릭해서 선택하세요.<br />{isAi ? '전신이 보이는 대표 이미지가 가장 좋습니다.' : '사진은 자연 파일명 순서로 먼저 정렬됩니다.'}</small></span></Drop>}
          <BaseSettings aria-label="프로젝트 기본 설정">
            <header><strong><SlidersHorizontal size={15} /> 프로젝트 기본 설정</strong><small>제작 화면의 고급 설정에서 언제든 세밀하게 바꿀 수 있습니다.</small></header>
            <Field>프로젝트 이름<input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} /></Field>
            <div><Field as="span">제출할 플랫폼</Field><Segments><button type="button" aria-pressed={platform === 'kakao'} onClick={() => setPlatform('kakao')}>카카오</button><button type="button" aria-pressed={platform === 'line'} onClick={() => setPlatform('line')}>LINE</button></Segments></div>
            {isAi ? <div><Field as="span">만들 결과</Field><Segments><button type="button" aria-pressed={outputType === 'animated'} onClick={() => setOutputType('animated')}>움직이는 이모티콘</button><button type="button" aria-pressed={outputType === 'static'} onClick={() => setOutputType('static')}>정지 이모티콘</button></Segments></div> : null}
          </BaseSettings>
          <Rights><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} /><span>선택한 이미지를 사용할 권리가 있으며 {isAi ? 'AI 캐릭터 분석과 생성' : '움짤 제작과 저장'}에 사용하는 데 동의합니다.</span></Rights>
          <ReadyList aria-label="시작 준비 상태">
            <li data-ready={sourceReady}><CheckCircle2 size={13} /> {sourceReady ? '원본 준비됨' : isAi ? '캐릭터 이미지 필요' : isSheet ? '시트 한 장 필요' : '사진 2장 이상 필요'}</li>
            <li data-ready={Boolean(title.trim())}><CheckCircle2 size={13} /> 프로젝트 이름</li>
            <li data-ready={rights}><CheckCircle2 size={13} /> 사용 권리 확인</li>
          </ReadyList>
          {uploadFeedback ? <UploadFeedback role="status">{uploadFeedback}</UploadFeedback> : null}
          {localError || props.error ? <Notice role="alert">{localError || props.error}</Notice> : null}
          <Footer><p><Check size={13} /> {isAi ? '지금은 캐릭터 특징만 확인하며, 유료 장면 생성은 다음 화면에서 별도로 승인합니다.' : 'AI 생성 비용 없이 프레임 합성과 규격 변환만 수행합니다.'}</p><button type="button" disabled={props.pending || !readyToStart} onClick={() => void (isAi ? startAi() : startManual())}>{nextActionLabel} {readyToStart ? <ArrowRight size={16} /> : null}</button></Footer>
        </Form>
      </Flow></Wrap></Root>
    );
  }

  return <Root aria-label="이모티콘 스튜디오 시작"><Wrap><Hero><span><Sparkles size={15} /> PROPIG MOTION STUDIO</span><h1>무엇으로 만들지 선택하세요</h1><p>처음이어도 괜찮습니다. 가지고 있는 재료를 고르면 필요한 준비부터 편집·내보내기까지 화면이 순서대로 안내합니다.</p></Hero>
  <HowItWorks aria-label="이모티콘 제작 사용법">
    <header><strong><CircleHelp size={16} /> 사용 방법</strong><small>시작 방식만 다르고 제작 이후에는 같은 타임라인과 내보내기를 사용합니다.</small></header>
    <div><span>1</span><div><strong>시작 방식 선택</strong><small>AI·여러 사진·한 장 시트·기존 작업</small></div></div>
    <div><span>2</span><div><strong>프레임 제작·편집</strong><small>순서·속도·전환·말풍선·품질 조정</small></div></div>
    <div><span>3</span><div><strong>검토·내보내기</strong><small>기술 규격 확인 후 필요한 형식 다운로드</small></div></div>
  </HowItWorks>
  <ModeGrid aria-label="이모티콘 제작 방식">
    <ModeCard type="button" $accent="violet" onClick={() => chooseMode('ai')}><div className="top"><span className="icon"><Sparkles size={25} /></span><ArrowRight className="arrow" /></div><div><h2>캐릭터 한 장으로 AI 제작</h2><p>캐릭터 특징을 기억시키고 원하는 동작·표정·문구를 말로 만듭니다.</p><div className="meta"><span>원본 1~4장</span><span><Clock3 size={11} /> 특징 확인 후 제작</span><span>장면 생성 전 비용 확인</span></div></div><small><strong>이럴 때 추천</strong> 새로운 장면을 처음부터 만들고 싶을 때</small></ModeCard>
    <ModeCard type="button" $accent="blue" onClick={() => chooseMode('frames')}><div className="top"><span className="icon"><Images size={25} /></span><ArrowRight className="arrow" /></div><div><h2>사진 여러 장으로 움짤 제작</h2><p>2~24장을 불러와 순서, 노출 시간, 전환 효과를 직접 편집합니다.</p><div className="meta"><span>원본 2~24장</span><span><Clock3 size={11} /> 바로 편집</span><span>AI 생성 비용 없음</span></div></div><small><strong>이럴 때 추천</strong> 연속 사진이나 완성된 정지 컷이 있을 때</small></ModeCard>
    <ModeCard type="button" $accent="mint" onClick={() => chooseMode('sheet')}><div className="top"><span className="icon"><Layers3 size={25} /></span><ArrowRight className="arrow" /></div><div><h2>한 장 시트를 프레임으로 분할</h2><p>4×2, 4×3, 6×4 격자를 감지하고 배경 제거와 셀 보정을 거칩니다.</p><div className="meta"><span>시트 1장</span><span><Clock3 size={11} /> 분할 후 편집</span><span>AI 생성 비용 없음</span></div></div><small><strong>이럴 때 추천</strong> 스프라이트 시트나 동작표가 있을 때</small></ModeCard>
    <ModeCard type="button" $accent="gray" disabled={!props.hasProjects} onClick={props.onOpenProjects}><div className="top"><span className="icon"><FolderOpen size={25} /></span><ArrowRight className="arrow" /></div><div><h2>저장한 작업 이어서 편집</h2><p>{props.hasProjects ? '이전 결과와 타임라인, 고급 편집 설정을 그대로 이어갑니다.' : '아직 저장된 프로젝트가 없습니다.'}</p><div className="meta"><span>자동 저장</span><span>이전 결과 복원</span><span>재생성 없이 다운로드</span></div></div><small><strong>이럴 때 추천</strong> 수정·재출력·다른 형식 다운로드가 필요할 때</small></ModeCard>
  </ModeGrid></Wrap></Root>;
}
