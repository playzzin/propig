'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { AlertTriangle, Check, Crop, ListChecks, Paperclip, RotateCcw, Send, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import styled from 'styled-components';
import {
  EMOTICON_EXPORT_FORMATS,
  type EmoticonExportFormat,
  type EmoticonResourceMode,
} from '@/schemas/emoticonStudio';
import type { EmoticonProject, EmoticonProjectPlatform } from '@/schemas/emoticonProject';
import type { EmoticonCostSnapshot } from '@/schemas/emoticonStudioV2';
import { parseEmoticonCreationIntent, creationIntentNeedsConfirmation } from '@/lib/emoticonCreationIntent';
import {
  EMOTICON_FRAME_COUNT_PRESETS,
  emoticonSpriteSheetLayoutLabel,
} from '@/lib/emoticonSpriteSheetLayout';
import {
  clearCreationComposerDraft,
  EMOTICON_STUDIO_DRAFT_DEBOUNCE_MS,
  readCreationComposerDraft,
  saveCreationComposerDraft,
} from '@/lib/emoticonStudioDraft';
import { estimateEmoticonAiCalls, estimateEmoticonImageCallsMax } from '@/lib/emoticonGenerationEstimate';
import { getEmoticonPlatformProfile } from '@/lib/emoticonPlatformProfiles';
import { validateEmoticonSourceFile } from '@/services/emoticonStudioService';
import { FORMAT_LABELS } from '../EmoticonStudio.constants';
import * as S from './StudioShell.styles';

type Props = {
  project: EmoticonProject;
  pending: boolean;
  ready: boolean;
  hasTurns: boolean;
  canReconfigure?: boolean;
  forceApproval?: boolean;
  initialPrompt?: string;
  onSubmit: (input: {
    prompt: string;
    intent: ReturnType<typeof parseEmoticonCreationIntent>;
    formats: EmoticonExportFormat[];
    cost: EmoticonCostSnapshot;
    referenceFiles?: File[];
  }) => Promise<boolean | void>;
};

type PromptReference = {
  id: string;
  file: File;
  previewUrl: string;
};

type StoryboardPhase = 'setup' | 'anticipation' | 'action' | 'follow_through' | 'settle' | 'loop';

type StoryboardFrameDraft = {
  frameIndex: number;
  phase: StoryboardPhase;
  direction: string;
};

const STORYBOARD_PHASE_LABELS: Record<StoryboardPhase, string> = {
  setup: '준비',
  anticipation: '예비 동작',
  action: '핵심 동작',
  follow_through: '후속 동작',
  settle: '회복',
  loop: '반복 연결',
};

const ComposerWrap = styled.section`
  display: grid;
  gap: 12px;
  width: min(960px, 100%);
  margin: 24px auto 0;
  padding: 14px;
  border: 1px solid #d0d5dd;
  border-radius: 17px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(16, 24, 40, 0.08);
`;

const ComposerIntro = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  > div > span { color: #3155c6; font-size: 10px; font-weight: 850; text-transform: uppercase; letter-spacing: .06em; }
  strong { display: block; margin-top: 4px; color: #1d2939; font-size: 16px; letter-spacing: -0.015em; }
  p { margin: 4px 0 0; color: #667085; font-size: 12px; line-height: 1.5; }
`;

const FlowGuide = styled.ol`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;

  li { display: grid; grid-template-columns: 27px minmax(0, 1fr); gap: 8px; align-items: center; min-width: 0; padding: 8px 9px; border-radius: 11px; background: #f7f8f6; }
  li > span { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 8px; background: #fff; color: #3155c6; box-shadow: inset 0 0 0 1px #dfe4ea; }
  strong { display: block; overflow: hidden; color: #344054; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  small { display: block; margin-top: 2px; color: #667085; font-size: 9px; }

  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;

const SheetQuantity = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 11px;
  background: #f7f8f6;

  > span { margin-right: auto; color: #344054; font-size: 11px; font-weight: 800; }
  button { min-width: 44px; min-height: 38px; border: 1px solid #d0d5dd; border-radius: 9px; background: #fff; color: #475467; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; touch-action: manipulation; }
  button[aria-pressed='true'] { border-color: #3155c6; background: #eef2ff; color: #3155c6; }
  button:focus-visible { outline: 3px solid rgba(49, 85, 198, .2); }
  button:disabled { cursor: not-allowed; opacity: .45; }

  @media (max-width: 480px) { display: grid; grid-template-columns: repeat(3, 1fr); > span { grid-column: 1 / -1; } }
`;

const PromptBox = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: 'attach prompt submit';
  gap: 9px;
  align-items: end;

  textarea {
    grid-area: prompt;
    width: 100%;
    min-height: 64px;
    max-height: 190px;
    padding: 12px 13px;
    border: 0;
    outline: 0;
    resize: vertical;
    color: #17202b;
    font: inherit;
    font-size: 15px;
    line-height: 1.55;
  }

  textarea:focus-visible {
    box-shadow: inset 0 0 0 2px #2952cc;
  }

  > button:last-child { grid-area: submit; }

  @media (max-width: 520px) {
    grid-template-columns: 44px minmax(0, 1fr);
    grid-template-areas:
      'prompt prompt'
      'attach submit';
    gap: 7px;
    textarea { font-size: 16px; }
    > button:last-child { width: 100%; }
  }
`;

const AttachButton = styled.button`
  grid-area: attach;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid #d0d5dd;
  border-radius: 12px;
  background: #fff;
  color: #475467;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: #2952cc; color: #2952cc; }
  &:focus-visible { outline: 3px solid rgba(41, 82, 204, .22); outline-offset: 2px; }
  &:disabled { opacity: .45; cursor: not-allowed; }
`;

const KeyboardHint = styled.small`
  display: block;
  margin-top: -4px;
  color: #667085;
  font-size: 10px;
  text-align: right;
`;

const ReferenceStrip = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;

  figure { position: relative; flex: 0 0 72px; margin: 0; }
  img { display: block; width: 72px; height: 72px; border: 1px solid #dfe4ea; border-radius: 10px; object-fit: contain; background: #f2f4f7; }
  button { position: absolute; top: 3px; right: 3px; display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid #d0d5dd; border-radius: 50%; background: #fff; color: #344054; cursor: pointer; }
  button:focus-visible { outline: 3px solid rgba(41, 82, 204, .22); }
`;

const QuickControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  > div { min-width: 190px; }
  > small { color: #667085; font-size: 12px; }

  @media (max-width: 560px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    > div { min-width: 0; }
    > small { grid-column: 1 / -1; }
  }
`;

const ModeHelp = styled.small`
  grid-column: 1 / -1;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
`;

const StoryboardReview = styled.section`
  display: grid;
  gap: 11px;
  padding: 14px;
  border: 1px solid #b9c6eb;
  border-radius: 14px;
  background: #f6f8ff;

  > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  > header div { min-width: 0; }
  > header strong { display: flex; align-items: center; gap: 7px; color: #253b80; font-size: 13px; }
  > header p { margin: 4px 0 0; color: #52649d; font-size: 11px; line-height: 1.5; }
  > header button { flex: 0 0 auto; min-height: 44px; padding: 0 10px; border: 1px solid #b9c6eb; border-radius: 9px; background: #fff; color: #344054; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }
  > header button:focus-visible { outline: 3px solid rgba(49, 85, 198, .22); }

  @media (max-width: 620px) { > header { display: grid; } > header button { width: 100%; } }
`;

const StoryboardList = styled.ol`
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const StoryboardRow = styled.li`
  display: grid;
  grid-template-columns: 34px minmax(105px, .35fr) minmax(0, 1fr);
  gap: 7px;
  align-items: center;

  > span { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 8px; background: #3155c6; color: #fff; font-size: 10px; font-weight: 850; font-variant-numeric: tabular-nums; }
  select, input { width: 100%; min-height: 44px; border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; color: #1d2939; font: inherit; font-size: 12px; }
  select { padding: 0 9px; }
  input { padding: 0 11px; }
  select:focus-visible, input:focus-visible { outline: 3px solid rgba(49, 85, 198, .18); border-color: #3155c6; }

  @media (max-width: 560px) {
    grid-template-columns: 34px minmax(0, 1fr);
    input { grid-column: 2; }
  }
`;

const StoryboardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 2px;

  small { color: #52649d; font-size: 10px; line-height: 1.45; }
  button { flex: 0 0 auto; }

  @media (max-width: 560px) { display: grid; button { width: 100%; } }
`;

const ApprovalPanel = styled.section`
  display: grid;
  gap: 12px;
  padding: 15px;
  border: 1px solid #f5b546;
  border-radius: 14px;
  background: #fffbeb;
  box-shadow: 0 10px 26px rgba(181, 71, 8, .08);

  > header { display: flex; align-items: flex-start; gap: 9px; }
  > header svg { flex: 0 0 auto; color: #b54708; }
  > header strong { display: block; color: #7a2e0e; font-size: 14px; }
  > header p { margin: 4px 0 0; color: #93370d; font-size: 11px; line-height: 1.5; }
`;

const ApprovalGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin: 0;

  div { min-width: 0; padding: 9px; border: 1px solid #fedf89; border-radius: 10px; background: #fff; }
  dt { color: #93370d; font-size: 9px; }
  dd { overflow-wrap: anywhere; margin: 3px 0 0; color: #7a2e0e; font-size: 11px; font-weight: 850; }

  @media (max-width: 620px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const ApprovalConsent = styled.label`
  display: flex;
  min-height: 48px;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 11px;
  border: 1px solid #fedf89;
  border-radius: 10px;
  background: #fff;
  color: #7a2e0e;
  font-size: 11px;
  line-height: 1.55;
  cursor: pointer;
  input { width: 19px; height: 19px; flex: 0 0 auto; margin-top: 1px; accent-color: #b54708; }
`;

const ApprovalActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  small { color: #93370d; font-size: 10px; line-height: 1.45; }
  > div { display: flex; flex: 0 0 auto; gap: 7px; }
  @media (max-width: 560px) { display: grid; > div { display: grid; grid-template-columns: 1fr; } button { width: 100%; } }
`;

const PromptSuggestions = styled.div`
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;

  button { flex: 0 0 auto; min-height: 38px; padding: 0 11px; border: 1px solid #dfe4ea; border-radius: 999px; background: #fff; color: #475467; font: inherit; font-size: 12px; font-weight: 750; cursor: pointer; }
  button:hover { border-color: #2952cc; color: #2952cc; }
  button:focus-visible { outline: 3px solid rgba(41, 82, 204, .2); }
`;

const Settings = styled.details`
  overflow: hidden;
  border: 1px solid #cfd6e4;
  border-radius: 14px;
  background: #fbfcff;

  summary { display: grid; grid-template-columns: minmax(180px, .7fr) minmax(0, 1.3fr) auto; align-items: center; gap: 12px; min-height: 64px; padding: 11px 13px; color: #344054; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary:focus-visible { outline: 3px solid rgba(41,82,204,.2); outline-offset: -3px; }
  &[open] summary { border-bottom: 1px solid #dfe4ec; background: #f5f7ff; }
  > div { padding-left: 14px; padding-right: 14px; }
  > div:last-child { margin-bottom: 14px; }
  @media (max-width: 680px) {
    summary { grid-template-columns: minmax(0,1fr) auto; }
    summary > div:nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
  }
`;
const SettingsTitle = styled.div`
  strong { display: flex; align-items: center; gap: 7px; color: #253b80; font-size: 13px; }
  small { display: block; margin-top: 3px; color: #667085; font-size: 10px; line-height: 1.4; }
`;
const SettingsSummary = styled.div`
  display: flex; flex-wrap: wrap; gap: 5px;
  span { display: inline-flex; min-height: 28px; align-items: center; padding: 0 8px; border: 1px solid #d8deea; border-radius: 999px; background: #fff; color: #475467; font-size: 10px; font-weight: 800; }
`;
const SettingsCost = styled.small`
  color: #475467; font-size: 10px; font-weight: 750; line-height: 1.45; text-align: right;
  @media (max-width: 680px) { grid-column: 1 / -1; text-align: left; }
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;

  @media (max-width: 760px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

const FormatGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;

  label { display: flex; align-items: center; gap: 5px; min-height: 44px; padding: 6px 9px; border: 1px solid #dfe4ea; border-radius: 9px; color: #475467; font-size: 10px; font-weight: 750; }
  input { accent-color: #2952cc; }

  @media (max-width: 520px) { label { font-size: 12px; } }
`;

function estimateCost(
  outputType: 'static' | 'animated',
  frameCount: number,
  mode: EmoticonResourceMode,
  quantity: number,
): EmoticonCostSnapshot {
  const imageCalls = estimateEmoticonImageCallsMax(outputType, frameCount, mode);
  const textCalls = outputType === 'static' ? 3 : 6;
  const maxPerJob = Math.min(8, Math.max(0.25, (imageCalls * 0.35) + (textCalls * 0.25)));
  const calls = estimateEmoticonAiCalls(outputType, frameCount, mode);
  return {
    currency: 'USD',
    estimatedMinUsd: Math.round(0.25 * quantity * 100) / 100,
    estimatedMaxUsd: Math.round(maxPerJob * quantity * 100) / 100,
    actualUsd: null,
    estimatedCallsMin: calls.min * quantity,
    estimatedCallsMax: calls.max * quantity,
    actualCalls: null,
  };
}

function recommendedFormats(
  platform: EmoticonProjectPlatform,
  outputType: 'static' | 'animated',
): EmoticonExportFormat[] {
  if (outputType === 'static') return ['png'];
  const nextProfile = getEmoticonPlatformProfile(platform, outputType);
  return Array.from(new Set([
    nextProfile.preferredFormat,
    'gif' as EmoticonExportFormat,
    'png_zip' as EmoticonExportFormat,
  ])).filter((format) => nextProfile.allowedFormats.includes(format));
}

const ANIMATED_PROMPT_SUGGESTIONS = [
  { label: '달리며 외치기', prompt: '오른쪽으로 달리면서 처음 4프레임은 “거기서!!”, 다음 4프레임은 “서란 말이야”라고 외치게 해줘.' },
  { label: '반갑게 인사', prompt: '두 손을 흔들며 반갑게 “안녕!”이라고 인사하게 해줘.' },
  { label: '깜짝 놀라기', prompt: '깜짝 놀라 뒤로 한 걸음 물러나는 움짤로 만들어줘.' },
] as const;

const STATIC_PROMPT_SUGGESTIONS = [
  { label: '회사원 하루', prompt: '월요일 회사원의 출근부터 퇴근까지 감정과 행동을 다양하게 담은 이모티콘 세트' },
  { label: '응원과 축하', prompt: '친구에게 보내기 좋은 응원, 축하, 감사, 최고 표현을 다양하게 담은 이모티콘 세트' },
  { label: '일상 반응', prompt: '좋아, 싫어, 놀람, 미안함, 고마움, 졸림 등 자주 쓰는 일상 반응 이모티콘 세트' },
] as const;

function storyboardPhase(frameIndex: number, frameCount: number): StoryboardPhase {
  if (frameIndex === 0) return 'setup';
  if (frameIndex === frameCount - 1) return 'loop';
  const progress = frameIndex / Math.max(1, frameCount - 1);
  if (progress < .34) return 'anticipation';
  if (progress < .58) return 'action';
  if (progress < .82) return 'follow_through';
  return 'settle';
}

function createStoryboardDraft(action: string, frameCount: number): StoryboardFrameDraft[] {
  const conciseAction = action.trim().replace(/\s+/g, ' ').slice(0, 46) || '요청한 동작';
  return Array.from({ length: frameCount }, (_, frameIndex) => {
    const phase = storyboardPhase(frameIndex, frameCount);
    const direction = phase === 'setup'
      ? `${conciseAction} 직전, 캐릭터가 준비 자세를 잡는다`
      : phase === 'action'
        ? `${conciseAction}의 힘과 표정이 가장 크게 보인다`
        : phase === 'loop'
          ? `첫 프레임으로 자연스럽게 이어지는 마무리 자세`
          : `${conciseAction}의 ${STORYBOARD_PHASE_LABELS[phase]} 포즈를 분명하게 보여준다`;
    return { frameIndex, phase, direction: direction.slice(0, 80) };
  });
}

function storyboardSourceKey(prompt: string, frameCount: number): string {
  return `${frameCount}\u241f${prompt.trim()}`;
}

function appendStoryboardToPrompt(prompt: string, storyboard: StoryboardFrameDraft[]): string {
  const rows = storyboard.map((frame) => (
    `${String(frame.frameIndex + 1).padStart(2, '0')}. ${STORYBOARD_PHASE_LABELS[frame.phase]}: ${frame.direction.trim()}`
  ));
  return [
    prompt.trim(),
    '',
    '[사용자 확정 프레임 동작표]',
    ...rows,
    '위 번호 순서를 각 프레임에 그대로 적용하고 캐릭터 정체성과 카메라 구도를 유지한다.',
  ].join('\n').slice(0, 2400);
}

function animatedModeHelp(mode: EmoticonResourceMode, frameCount: number): string {
  const grid = emoticonSpriteSheetLayoutLabel(frameCount);
  if (mode === 'efficient') {
    return `${grid} 시트 한 장에 ${frameCount}개 모션을 만든 뒤 같은 수의 이미지로 분할합니다. GPT 라이트는 가장 빠르고 비용이 적습니다.`;
  }
  if (mode === 'balanced') {
    return `${grid} 시트 한 장에 ${frameCount}개 모션을 만들고 분할합니다. 균형 모드는 시트 검사 후 문제가 있는 컷만 선택 보정합니다.`;
  }
  return `${grid} 시트 한 장에 ${frameCount}개 모션을 만들고 캐릭터·동작 일관성을 더 엄격하게 검사합니다. 실패한 컷만 개별 보정합니다.`;
}

export function CreationComposer({ project, pending, ready, hasTurns, canReconfigure = true, forceApproval = false, initialPrompt = '', onSubmit }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const storyboardRef = useRef<HTMLElement>(null);
  const approvalRef = useRef<HTMLElement>(null);
  const referencesRef = useRef<PromptReference[]>([]);
  const draftProjectIdRef = useRef(project.id);
  const draftSaveTimerRef = useRef<number | null>(null);
  const skipNextDraftSaveRef = useRef(false);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [references, setReferences] = useState<PromptReference[]>([]);
  const [referenceError, setReferenceError] = useState('');
  const [formError, setFormError] = useState('');
  useEffect(() => {
    referencesRef.current = references;
  }, [references]);
  useEffect(() => () => {
    referencesRef.current.forEach((reference) => URL.revokeObjectURL(reference.previewUrl));
  }, []);
  const [outputType, setOutputType] = useState<'static' | 'animated'>(project.emoticonType);
  // Static mode remains available for independent images; animated mode uses
  // the one-sheet -> explicit split -> edit -> assemble workflow.
  const [quantity, setQuantity] = useState(() => project.emoticonType === 'static' ? 8 : 1);
  const [frameCount, setFrameCount] = useState(() => project.items[0]?.motion.frameCount || 8);
  const [durationMs, setDurationMs] = useState(1000);
  const [platform, setPlatform] = useState<EmoticonProjectPlatform>(project.platform);
  const [qualityMode, setQualityMode] = useState<EmoticonResourceMode>(project.generationSettings.resourceMode);
  const profile = useMemo(() => getEmoticonPlatformProfile(platform, outputType), [outputType, platform]);
  const [formats, setFormats] = useState<EmoticonExportFormat[]>(() => (
    outputType === 'static' ? ['png'] : [project.generationSettings.preferredFormat, 'gif', 'png_zip']
  ));
  const [draftReady, setDraftReady] = useState(false);
  const [storyboardSource, setStoryboardSource] = useState('');
  const [storyboard, setStoryboard] = useState<StoryboardFrameDraft[]>([]);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalAcceptance, setApprovalAcceptance] = useState<string | null>(null);

  const normalizedFormats = useMemo(() => outputType === 'static'
    ? ['png'] as EmoticonExportFormat[]
    : Array.from(new Set(formats.filter((format) => profile.allowedFormats.includes(format)))), [formats, outputType, profile.allowedFormats]);

  useEffect(() => {
    const draft = readCreationComposerDraft(draftProjectIdRef.current);
    const restoreTimer = window.setTimeout(() => {
      if (draft) {
        setPrompt(draft.prompt);
        setOutputType(draft.outputType);
        setQuantity(draft.quantity);
        setFrameCount(draft.frameCount);
        setDurationMs(draft.durationMs);
        setPlatform(draft.platform);
        setQualityMode(draft.qualityMode);
        setFormats(draft.formats);
        setStoryboardSource(draft.storyboardSource || '');
        setStoryboard(draft.storyboard || []);
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      saveCreationComposerDraft(project.id, {
        prompt,
        outputType,
        quantity,
        frameCount,
        durationMs,
        platform,
        qualityMode,
        formats: normalizedFormats,
        ...(storyboardSource && storyboard.length ? { storyboardSource, storyboard } : {}),
      });
    }, EMOTICON_STUDIO_DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [draftReady, durationMs, frameCount, normalizedFormats, outputType, platform, project.id, prompt, qualityMode, quantity, storyboard, storyboardSource]);

  const intent = useMemo(() => prompt.trim().length >= 2 ? parseEmoticonCreationIntent(prompt, {
    outputType,
    quantity: outputType === 'static' ? quantity : 1,
    frameCount,
    durationMs,
    targetPlatform: platform,
    qualityMode,
  }) : null, [durationMs, frameCount, outputType, platform, prompt, qualityMode, quantity]);
  const effectiveOutputType = intent?.outputType || outputType;
  const effectivePlatform = intent?.targetPlatform || platform;
  const effectiveProfile = getEmoticonPlatformProfile(effectivePlatform, effectiveOutputType);
  const requestedFrameCount = intent?.frameCount || frameCount;
  const effectiveFrameCount = effectiveOutputType === 'static'
    ? 1
    : Math.max(Math.max(4, effectiveProfile.minFrameCount), Math.min(effectiveProfile.maxFrameCount, requestedFrameCount));
  const effectiveQuantity = effectiveOutputType === 'static' ? intent?.quantity || quantity : 1;
  const effectiveDurationMs = intent?.durationMs || durationMs;
  const effectiveQualityMode = intent?.qualityMode || qualityMode;
  const sheetGridLabel = emoticonSpriteSheetLayoutLabel(effectiveFrameCount);
  const currentStoryboardSource = storyboardSourceKey(prompt, effectiveFrameCount);
  const storyboardMatchesSource = effectiveOutputType === 'animated'
    && storyboardSource === currentStoryboardSource
    && storyboard.length === effectiveFrameCount
    && storyboard.every((frame, index) => frame.frameIndex === index);
  const storyboardIsCurrent = storyboardMatchesSource
    && storyboard.every((frame) => frame.direction.trim().length > 0);
  const confirmations = intent ? [
    ...creationIntentNeedsConfirmation(intent),
    ...(intent.outputType === 'animated' && intent.frameCount !== effectiveFrameCount
      ? [`${effectivePlatform === 'line' ? 'LINE' : '선택한 플랫폼'} 규격에 맞춰 ${effectiveFrameCount}프레임으로 조정합니다.`]
      : []),
  ] : [];
  const cost = useMemo(() => estimateCost(
    effectiveOutputType,
    effectiveFrameCount,
    effectiveQualityMode,
    effectiveQuantity,
  ), [effectiveFrameCount, effectiveOutputType, effectiveQualityMode, effectiveQuantity]);
  const expectedSeconds = effectiveQualityMode === 'efficient'
    ? Math.round((effectiveOutputType === 'static' ? 18 : 20 + effectiveFrameCount * 7) * effectiveQuantity)
    : effectiveQualityMode === 'balanced'
      ? Math.round((effectiveOutputType === 'static' ? 19 : 20 + effectiveFrameCount * 9) * effectiveQuantity)
      : Math.round((effectiveOutputType === 'static' ? 20 : 20 + effectiveFrameCount * 12) * effectiveQuantity);
  const usesMockProvider = !forceApproval && process.env.NEXT_PUBLIC_EMOTICON_STUDIO_PROVIDER === 'mock';
  const approvalFingerprint = JSON.stringify({
    prompt: prompt.trim(),
    outputType: effectiveOutputType,
    frameCount: effectiveFrameCount,
    quantity: effectiveQuantity,
    platform: effectivePlatform,
    qualityMode: effectiveQualityMode,
    formats: normalizedFormats,
    storyboard: storyboard.map((frame) => [frame.phase, frame.direction.trim()]),
    references: references.map((reference) => [reference.file.name, reference.file.size, reference.file.lastModified]),
    authorizedMaxUsd: cost.estimatedMaxUsd,
  });
  const approvalAccepted = approvalAcceptance === approvalFingerprint;

  const toggleFormat = (format: EmoticonExportFormat) => {
    setFormats((current) => current.includes(format)
      ? current.filter((value) => value !== format)
      : [...current, format]);
  };

  const updateOutputType = (next: 'static' | 'animated') => {
    setOutputType(next);
    setFormats(recommendedFormats(platform, next));
    if (next === 'animated') {
      const nextProfile = getEmoticonPlatformProfile(platform, next);
      setFrameCount((current) => Math.max(Math.max(4, nextProfile.minFrameCount), Math.min(nextProfile.maxFrameCount, current)));
    } else {
      setQuantity(8);
    }
  };

  const updatePlatform = (next: EmoticonProjectPlatform) => {
    setPlatform(next);
    setFormats(recommendedFormats(next, outputType));
    if (outputType === 'animated') {
      const nextProfile = getEmoticonPlatformProfile(next, outputType);
      setFrameCount((current) => Math.max(Math.max(4, nextProfile.minFrameCount), Math.min(nextProfile.maxFrameCount, current)));
    }
  };

  const onReferenceFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    const available = Math.max(0, 2 - references.length);
    if (!available) return;
    const next: PromptReference[] = [];
    for (const file of selected.slice(0, available)) {
      const validationError = validateEmoticonSourceFile(file);
      if (validationError) {
        setReferenceError(`${file.name}: ${validationError}`);
        continue;
      }
      if (references.some((reference) => reference.file.name === file.name && reference.file.size === file.size)) continue;
      next.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
    }
    if (next.length) {
      setReferences((current) => [...current, ...next]);
      setReferenceError('');
    }
  };

  const removeReference = (id: string) => {
    setReferences((current) => {
      const target = current.find((reference) => reference.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((reference) => reference.id !== id);
    });
  };

  const submit = async (approved = false) => {
    if (!ready || pending) return;
    if (!prompt.trim() || !intent) {
      setFormError('만들고 싶은 동작, 표정 또는 문구를 한 문장으로 적어 주세요.');
      promptRef.current?.focus();
      return;
    }
    if (!normalizedFormats.length) {
      setFormError('내보낼 파일 형식을 1개 이상 선택해 주세요.');
      return;
    }
    if (effectiveOutputType === 'animated' && !storyboardMatchesSource) {
      setStoryboard(createStoryboardDraft(intent.action, effectiveFrameCount));
      setStoryboardSource(currentStoryboardSource);
      setFormError('');
      window.setTimeout(() => storyboardRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }), 0);
      return;
    }
    if (effectiveOutputType === 'animated' && !storyboardIsCurrent) {
      setFormError('비어 있는 프레임 설명을 모두 채워 주세요. 각 줄이 실제 생성 순서에 반영됩니다.');
      window.setTimeout(() => {
        const firstEmpty = Array.from(storyboardRef.current?.querySelectorAll<HTMLInputElement>('input') || [])
          .find((input) => !input.value.trim());
        firstEmpty?.focus({ preventScroll: true });
        firstEmpty?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      }, 0);
      return;
    }
    const productionPrompt = effectiveOutputType === 'animated'
      ? appendStoryboardToPrompt(prompt, storyboard)
      : prompt.trim();
    if (!usesMockProvider && (!approved || !approvalAccepted)) {
      setApprovalOpen(true);
      setApprovalAcceptance(null);
      window.setTimeout(() => {
        approvalRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        approvalRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    setFormError('');
    const result = await onSubmit({
      prompt: productionPrompt,
      intent,
      formats: normalizedFormats,
      cost,
      referenceFiles: references.map((reference) => reference.file),
    });
    if (result === false) return;
    skipNextDraftSaveRef.current = true;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    clearCreationComposerDraft(project.id);
    references.forEach((reference) => URL.revokeObjectURL(reference.previewUrl));
    setReferences([]);
    setReferenceError('');
    setFormError('');
    setPrompt('');
    setStoryboard([]);
    setStoryboardSource('');
    setApprovalOpen(false);
    setApprovalAcceptance(null);
  };

  const onPromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  return (
    <ComposerWrap id="emoticon-v2-creation-composer" aria-label="이모티콘 생성 요청" aria-busy={pending}>
      <ComposerIntro>
        <div>
          <span>제작 · 장면 요청</span>
          <strong>원하는 동작과 표정, 문구를 말로 설명하세요</strong>
          <p>먼저 동작표를 확인하므로 이미지 생성 전에 자세를 고칠 수 있습니다. 생성 뒤에는 모든 프레임의 순서·속도·말풍선을 직접 편집합니다.</p>
        </div>
      </ComposerIntro>
      <FlowGuide aria-label="현재 제작 과정">
        <li><span><Sparkles size={14} aria-hidden="true" /></span><div><strong>장면 요청</strong><small>상황·감정·동작 설명</small></div></li>
        <li><span><ListChecks size={14} aria-hidden="true" /></span><div><strong>생성 전 확인</strong><small>{outputType === 'animated' ? `${effectiveFrameCount}개 자세를 직접 수정` : '정지 이미지 주제 확인'}</small></div></li>
        <li><span><Crop size={14} aria-hidden="true" /></span><div><strong>프레임 편집·내보내기</strong><small>{outputType === 'animated' ? `${sheetGridLabel} 시트를 분할해 편집` : '각 결과를 바로 개별 수정'}</small></div></li>
      </FlowGuide>
      {!ready ? <S.Notice $tone="info"><S.Spinner /><span>현재 프로젝트의 대화 기록과 설정을 불러오고 있습니다.</span></S.Notice> : null}
      {confirmations.map((message) => <S.Notice key={message} $tone="warning"><AlertTriangle size={15} /><span>{message}</span></S.Notice>)}
      {!hasTurns && !prompt.trim() ? (
        <PromptSuggestions aria-label="요청 예시">
          {(outputType === 'animated' ? ANIMATED_PROMPT_SUGGESTIONS : STATIC_PROMPT_SUGGESTIONS).map((suggestion) => <button key={suggestion.prompt} type="button" onClick={() => setPrompt(suggestion.prompt)}>{suggestion.label}</button>)}
        </PromptSuggestions>
      ) : null}
      {references.length ? (
        <ReferenceStrip aria-label="이 요청에만 사용할 참고 이미지">
          {references.map((reference, index) => (
            <figure key={reference.id}>
              <img src={reference.previewUrl} width={72} height={72} alt={`요청 참고 이미지 ${index + 1}`} />
              <button type="button" aria-label={`요청 참고 이미지 ${index + 1} 제거`} onClick={() => removeReference(reference.id)} disabled={pending}><X size={13} /></button>
            </figure>
          ))}
        </ReferenceStrip>
      ) : null}
      <input ref={fileInputRef} name="requestReferences" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={onReferenceFiles} />
      <QuickControls>
        <S.Segments aria-label="빠른 결과 형식 선택">
          <button type="button" aria-pressed={outputType === 'animated'} disabled={!ready || !canReconfigure} onClick={() => updateOutputType('animated')}>사진 {effectiveFrameCount}장 → 움짤</button>
          <button type="button" aria-pressed={outputType === 'static'} disabled={!ready || !canReconfigure} onClick={() => updateOutputType('static')}>정지 이미지 세트</button>
        </S.Segments>
        <ModeHelp>{outputType === 'animated'
          ? animatedModeHelp(effectiveQualityMode, effectiveFrameCount)
          : '서로 독립된 정지 이미지를 생성합니다. 장수·품질·플랫폼·내보내기 형식은 아래 고급 생성 설정에서 바꿀 수 있습니다.'}</ModeHelp>
      </QuickControls>
      {outputType === 'animated' ? (
        <SheetQuantity aria-label="모션 컷 수">
          <span><Check size={13} aria-hidden="true" /> 한 장에 만들 모션 컷 수 · 현재 {sheetGridLabel}</span>
          {EMOTICON_FRAME_COUNT_PRESETS.map((preset) => {
            const supported = preset >= Math.max(4, profile.minFrameCount) && preset <= profile.maxFrameCount;
            return <button key={preset} type="button" aria-pressed={effectiveFrameCount === preset} disabled={!ready || pending || !supported} title={supported ? `${emoticonSpriteSheetLayoutLabel(preset)} 시트` : `현재 플랫폼은 ${profile.minFrameCount}~${profile.maxFrameCount}컷을 지원합니다.`} onClick={() => setFrameCount(preset)}>{preset}컷</button>;
          })}
        </SheetQuantity>
      ) : (
        <SheetQuantity aria-label="정지 이미지 수">
          <span><Check size={13} aria-hidden="true" /> 정지 이미지 수</span>
          <button type="button" aria-pressed={quantity === 8} disabled={!ready || pending} onClick={() => setQuantity(8)}>8장</button>
        </SheetQuantity>
      )}
      <PromptBox>
        <AttachButton type="button" aria-label="이 요청에 참고 이미지 추가" title="참고 이미지 추가" disabled={!ready || pending || references.length >= 2} onClick={() => fileInputRef.current?.click()}><Paperclip size={18} /></AttachButton>
        <textarea ref={promptRef} id="emoticon-v2-creation-prompt" value={prompt} name="creationPrompt" autoComplete="off" maxLength={2400} disabled={!ready} aria-label="만들고 싶은 이미지 시트 주제" aria-keyshortcuts="Control+Enter Meta+Enter" aria-invalid={Boolean(formError && (!prompt.trim() || !intent))} aria-describedby={formError && (!prompt.trim() || !intent) ? 'emoticon-v2-creation-error' : undefined} placeholder={outputType === 'animated' ? `예: 화난 표정으로 회전 발차기하는 ${effectiveFrameCount}단계 포즈…` : '예: 삐진 표정이 점점 커지고 돌아서며 흥! 하는 정지 이미지…'} onChange={(event) => { setPrompt(event.target.value); if (formError) setFormError(''); }} onKeyDown={onPromptKeyDown} />
        <S.Button type="button" disabled={!ready || pending} onClick={() => void submit()}>
          {pending ? <S.Spinner /> : storyboardMatchesSource ? <Send size={16} /> : <ListChecks size={16} />} {outputType === 'static' ? usesMockProvider ? `정지 ${effectiveQuantity}장 개별 생성` : `정지 ${effectiveQuantity}장 생성 전 비용 확인` : storyboardMatchesSource ? usesMockProvider ? '이 동작표로 이미지 생성' : '생성 전 비용 확인' : `${effectiveFrameCount}프레임 동작표 확인`}
        </S.Button>
      </PromptBox>
      <KeyboardHint>Enter 줄바꿈 · Ctrl/⌘ + Enter 실행</KeyboardHint>
      {storyboardMatchesSource ? (
        <StoryboardReview ref={storyboardRef} aria-label="생성 전 프레임 동작표">
          <header>
            <div>
              <strong><ListChecks size={16} aria-hidden="true" /> 생성 전 마지막 확인 · {storyboard.length}프레임</strong>
              <p>아직 이미지 AI는 호출하지 않았습니다. 각 사진에 보일 자세를 직접 고치면 이 순서를 기준으로 생성합니다.</p>
            </div>
            <button type="button" disabled={pending} onClick={() => {
              if (!intent) return;
              setStoryboard(createStoryboardDraft(intent.action, effectiveFrameCount));
              setFormError('');
            }}><RotateCcw size={13} aria-hidden="true" /> 자동 초안 다시 만들기</button>
          </header>
          <StoryboardList>
            {storyboard.map((frame) => (
              <StoryboardRow key={frame.frameIndex}>
                <span>{String(frame.frameIndex + 1).padStart(2, '0')}</span>
                <select
                  value={frame.phase}
                  disabled={pending}
                  aria-label={`${frame.frameIndex + 1}번 프레임 단계`}
                  onChange={(event) => setStoryboard((current) => current.map((item) => item.frameIndex === frame.frameIndex ? { ...item, phase: event.target.value as StoryboardPhase } : item))}
                >
                  {Object.entries(STORYBOARD_PHASE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input
                  value={frame.direction}
                  maxLength={80}
                  disabled={pending}
                  aria-label={`${frame.frameIndex + 1}번 프레임 자세 설명`}
                  aria-invalid={Boolean(formError && !frame.direction.trim())}
                  aria-describedby={formError && !frame.direction.trim() ? 'emoticon-v2-creation-error' : undefined}
                  onChange={(event) => {
                    setStoryboard((current) => current.map((item) => item.frameIndex === frame.frameIndex ? { ...item, direction: event.target.value } : item));
                    if (formError) setFormError('');
                  }}
                />
              </StoryboardRow>
            ))}
          </StoryboardList>
          <StoryboardFooter>
            <small>선택한 품질과 관계없이 이 동작표 전체를 {sheetGridLabel} 시트 한 장으로 만듭니다. 생성 후 {effectiveFrameCount}장으로 분할해 모든 컷을 따로 수정할 수 있습니다.</small>
            <S.Button type="button" disabled={pending} onClick={() => void submit()}>
              {pending ? <S.Spinner /> : <Send size={15} aria-hidden="true" />} {usesMockProvider ? '이 동작표로 이미지 생성' : '생성 전 비용 확인'}
            </S.Button>
          </StoryboardFooter>
        </StoryboardReview>
      ) : null}
      {approvalOpen && !usesMockProvider ? (
        <ApprovalPanel ref={approvalRef} aria-labelledby="emoticon-generation-approval-title">
          <header><ShieldCheck size={20} aria-hidden="true" /><div><strong id="emoticon-generation-approval-title">생성 전 비용·외부 전송 승인</strong><p>아직 이미지 provider를 호출하지 않았습니다. 아래 범위와 전송 대상을 확인한 뒤에만 실제 생성을 시작합니다.</p></div></header>
          <ApprovalGrid aria-label="생성 승인 요약">
            <div><dt>품질 모드</dt><dd>{effectiveQualityMode === 'efficient' ? '빠른·저비용' : effectiveQualityMode === 'balanced' ? '균형' : '고품질'}</dd></div>
            <div><dt>예상 호출</dt><dd>{cost.estimatedCallsMin}~{cost.estimatedCallsMax}회</dd></div>
            <div><dt>승인 예산</dt><dd>${cost.estimatedMinUsd.toFixed(2)}~${cost.estimatedMaxUsd.toFixed(2)}</dd></div>
            <div><dt>예상 시간</dt><dd>약 {Math.max(1, Math.ceil(expectedSeconds / 60))}분</dd></div>
          </ApprovalGrid>
          <ApprovalConsent><input type="checkbox" checked={approvalAccepted} onChange={(event) => setApprovalAcceptance(event.target.checked ? approvalFingerprint : null)} /><span>캐릭터 참고 이미지와 생성 요청이 OpenRouter 및 선택된 모델 공급자에게 전송되고, 최대 <strong>${cost.estimatedMaxUsd.toFixed(2)}</strong>까지 승인되는 데 동의합니다.</span></ApprovalConsent>
          <ApprovalActions><small>설정이나 요청을 바꾸면 이 승인은 자동으로 해제됩니다. 실제 사용액은 완료 결과에서 별도로 집계합니다.</small><div><S.Button type="button" $variant="secondary" disabled={pending} onClick={() => { setApprovalOpen(false); setApprovalAcceptance(null); promptRef.current?.focus(); }}>내용 수정</S.Button><S.Button type="button" disabled={pending || !approvalAccepted} onClick={() => void submit(true)}>{pending ? <S.Spinner /> : <ShieldCheck size={15} />} 최대 ${cost.estimatedMaxUsd.toFixed(2)} 승인하고 생성</S.Button></div></ApprovalActions>
        </ApprovalPanel>
      ) : null}
      {referenceError ? <S.Notice $tone="danger" role="alert"><AlertTriangle size={15} /><span>{referenceError}</span></S.Notice> : null}
      {formError ? <S.Notice id="emoticon-v2-creation-error" $tone="danger" role="alert"><AlertTriangle size={15} /><span>{formError}</span></S.Notice> : null}
      <Settings>
        <summary>
          <SettingsTitle><strong><Settings2 size={15} /> 고급 생성 설정</strong><small>현재값을 확인하거나 눌러서 세밀하게 변경</small></SettingsTitle>
          <SettingsSummary aria-label="현재 생성 설정 요약">
            <span>{effectiveOutputType === 'static' ? `정지 ${effectiveQuantity}장` : `${effectiveFrameCount}프레임 · ${(effectiveDurationMs / 1000).toFixed(1)}초`}</span>
            <span>{effectivePlatform === 'kakao' ? '카카오' : effectivePlatform === 'line' ? 'LINE' : effectivePlatform.toUpperCase()}</span>
            <span>{effectiveQualityMode === 'efficient' ? 'GPT 라이트' : effectiveQualityMode === 'balanced' ? '균형 품질' : 'AI 고품질'}</span>
            <span>{normalizedFormats.map((format) => FORMAT_LABELS[format]).join(' · ')}</span>
          </SettingsSummary>
          <SettingsCost>약 {Math.max(1, Math.ceil(expectedSeconds / 60))}분<br />OpenRouter {cost.estimatedCallsMin}–{cost.estimatedCallsMax}회 · 승인 예산 ${cost.estimatedMinUsd.toFixed(2)}–${cost.estimatedMaxUsd.toFixed(2)}</SettingsCost>
        </summary>
        <SettingsGrid>
          <S.Field>형식<select value={outputType} disabled={!ready || !canReconfigure} onChange={(event) => {
            const next = event.target.value as 'static' | 'animated';
            updateOutputType(next);
          }}><option value="animated">움직이는 이모티콘</option><option value="static">정지 이모티콘</option></select><small>{!canReconfigure ? '진행 중이거나 완성된 결과를 보호하기 위해 형식이 잠겼습니다.' : hasTurns ? '실패·취소된 작업만 있어 형식을 다시 선택할 수 있습니다.' : null}</small></S.Field>
          <S.Field>플랫폼<select value={platform} disabled={!ready || !canReconfigure} onChange={(event) => updatePlatform(event.target.value as EmoticonProjectPlatform)}><option value="kakao">카카오</option><option value="line">LINE</option><option value="telegram">Telegram</option><option value="sns">SNS</option><option value="custom">직접 설정</option></select></S.Field>
          <S.Field>{outputType === 'static' ? '시트 이미지 수' : '프레임 수'}<input name="frameOrImageCount" type="number" inputMode="numeric" disabled={!ready} min={outputType === 'static' ? 1 : Math.max(4, profile.minFrameCount)} max={outputType === 'static' ? 40 : profile.maxFrameCount} value={outputType === 'static' ? quantity : frameCount} onChange={(event) => outputType === 'static' ? setQuantity(Math.max(1, Math.min(40, Number(event.target.value)))) : setFrameCount(Math.max(Math.max(4, profile.minFrameCount), Math.min(profile.maxFrameCount, Number(event.target.value))))} /></S.Field>
          {outputType === 'animated' ? <S.Field>재생 시간<input name="animationDurationMs" type="number" inputMode="numeric" disabled={!ready} min={700} max={3000} step={100} value={durationMs} onChange={(event) => setDurationMs(Math.max(700, Math.min(3000, Number(event.target.value))))} /><small>700~3000ms · 서버가 가장 가까운 유효 FPS에 맞춥니다.</small></S.Field> : <div />}
        </SettingsGrid>
        <div style={{ marginTop: 12 }}>
          <S.Field as="span">생성 품질 · 속도와 보정 범위</S.Field>
          <div role="group" aria-label="고급 생성 품질" style={{ marginTop: 7 }}>
            <S.Segments>
              <button type="button" aria-pressed={qualityMode === 'efficient'} disabled={!ready} onClick={() => setQualityMode('efficient')}>GPT 라이트 · 빠른 생성</button>
              <button type="button" aria-pressed={qualityMode === 'balanced'} disabled={!ready} onClick={() => setQualityMode('balanced')}>균형 · 선택 보정</button>
              <button type="button" aria-pressed={qualityMode === 'premium'} disabled={!ready} onClick={() => setQualityMode('premium')}>AI 고품질 · 정밀 보정</button>
            </S.Segments>
          </div>
        </div>
        <FormatGrid aria-label="내보내기 형식">
          {EMOTICON_EXPORT_FORMATS.flatMap((format) => {
            if (outputType === 'static' && format !== 'png') return [];
            if (outputType === 'animated' && !profile.allowedFormats.includes(format)) return [];
            return [<label key={format}><input type="checkbox" checked={normalizedFormats.includes(format)} disabled={!ready || outputType === 'static'} onChange={() => toggleFormat(format)} />{FORMAT_LABELS[format]}</label>];
          })}
        </FormatGrid>
        <S.Notice $tone="info" style={{ marginTop: 10 }}><Sparkles size={15} /><span>말풍선 문구는 이미지와 분리된 벡터 트랙으로 만들며, 문구만 고칠 때는 AI 이미지 비용이 들지 않습니다. 플랫폼 승인 여부는 보장하지 않습니다.</span></S.Notice>
      </Settings>
    </ComposerWrap>
  );
}
