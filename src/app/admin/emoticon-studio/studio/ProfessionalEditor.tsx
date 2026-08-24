'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Copy, Images, Layers3, MessageCircle, Pause, Play, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import styled from 'styled-components';
import type { EmoticonProject, EmoticonProjectItem } from '@/schemas/emoticonProject';
import {
  EMOTICON_BUBBLE_APPEARANCE_DEFAULTS,
  type EmoticonBubble,
  type EmoticonBubbleAppearance,
  type EmoticonBubbleTimeline,
  type EmoticonFrameTransition,
  type EmoticonImageEditRecipe,
  type EmoticonJob,
} from '@/schemas/emoticonStudio';
import {
  createEditedEmoticonJob,
  downloadEmoticonFile,
  regenerateEmoticonFrame,
  rerenderEmoticonJob,
  submitEmoticonFrameImportJob,
} from '@/services/emoticonStudioService';
import { updateEmoticonProjectItem } from '@/services/emoticonProjectService';
import { buildEmoticonFrameFileName } from '@/lib/emoticonFrameDownload';
import { FrameTimelinePanel } from '../FrameTimelinePanel';
import { BubbleTimelineEditor } from '../BubbleTimelineEditor';
import { ImageEditPanel } from '../ImageEditPanel';
import {
  ManualFrameImportPanel,
  type ManualFrameImportSubmit,
  type ReusableEmoticonFrame,
  type ReusableFrameImportRequest,
} from '../ManualFrameImportPanel';
import { AssetLibrary } from './AssetLibrary';
import { AnimationTimingEditor } from './AnimationTimingEditor';
import { buildAssetLibraryEntries } from './assetLibraryModel';
import * as S from './StudioShell.styles';

type Props = {
  userId: string;
  project: EmoticonProject;
  item: EmoticonProjectItem | null;
  job: EmoticonJob;
  recentJobs: EmoticonJob[];
  pending: boolean;
  initialFrameIndex?: number;
  readOnly?: boolean;
  allowLocalImportPreview?: boolean;
  onClose: () => void;
  onQueued: (jobId: string) => void;
};

const Overlay = styled.div`
  position: fixed;
  z-index: 2000;
  inset: 0;
  display: grid;
  overscroll-behavior: contain;
  background: rgba(16, 24, 40, 0.58);
`;

const Editor = styled.section`
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1380px, calc(100% - 24px));
  height: min(900px, calc(100% - 24px));
  margin: auto;
  overflow: hidden;
  border-radius: 18px;
  background: #f4f5f7;
  box-shadow: 0 24px 70px rgba(16, 24, 40, 0.3);

  @media (max-width: 600px) { width: 100%; height: 100dvh; border-radius: 0; }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 60px;
  padding: 10px 16px;
  border-bottom: 1px solid #dfe4ea;
  background: #fff;

  strong { display: block; font-size: 14px; }
  small { display: block; margin-top: 2px; color: #667085; font-size: 10px; }
`;

const Body = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: 270px minmax(340px, 1fr) 340px;
  min-height: 0;

  @media (max-width: 1080px) { grid-template-columns: 220px minmax(0, 1fr); }
  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }
`;

const Assets = styled.aside`
  padding: 14px;
  overflow: auto;
  border-right: 1px solid #dfe4ea;
  background: #fff;

  h3 { margin: 0 0 10px; font-size: 12px; }
  button { width: 100%; margin-bottom: 7px; }

  @media (max-width: 720px) {
    grid-row: 2;
    display: flex;
    gap: 6px;
    padding: 8px 9px calc(8px + env(safe-area-inset-bottom));
    overflow-x: auto;
    border-top: 1px solid #dfe4ea;
    border-right: 0;
    border-bottom: 0;
    background: rgba(255,255,255,.98);
    button { flex: 0 0 auto; width: auto; margin: 0; }
  }
`;

const Stage = styled.div`
  display: grid;
  grid-template-rows: minmax(250px, 1fr) auto minmax(124px, auto);
  gap: 12px;
  min-height: 0;
  padding: 16px;
  overflow: hidden;

  button { min-height: 44px; }

  @media (max-width: 720px) {
    grid-row: 1;
    grid-template-rows: minmax(240px, 42dvh) auto minmax(112px, auto);
    gap: 8px;
    padding: 10px;
    overflow: auto;
  }
`;

const Canvas = styled.div`
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: center;
  border: 1px solid #d0d5dd;
  border-radius: 14px;
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #e8ebef 25%, transparent 25%),
    linear-gradient(-45deg, #e8ebef 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e8ebef 75%),
    linear-gradient(-45deg, transparent 75%, #e8ebef 75%);
  background-position: 0 0, 0 12px, 12px -12px, -12px 0;
  background-size: 24px 24px;

  img {
    position: absolute;
    z-index: 2;
    inset: 12px;
    width: calc(100% - 24px);
    height: calc(100% - 24px);
    object-fit: contain;
    pointer-events: none;
  }
  img[data-onion='true'] { z-index: 1; opacity: 0.22; filter: saturate(0.35); }
`;

const BubblePreview = styled.div<{
  $position: EmoticonBubble['position'];
  $bubbleStyle: EmoticonBubble['style'];
}>`
  position: absolute;
  z-index: 3;
  max-width: min(70%, 360px);
  padding: 10px 14px;
  border-style: solid;
  border-radius: ${({ $bubbleStyle }) => $bubbleStyle === 'thought' ? '50%' : $bubbleStyle === 'shout' ? '5px' : '18px'};
  text-align: center;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: pointer;
  pointer-events: auto;
  font: inherit;
  &:focus-visible { outline: 3px solid #695ee8; outline-offset: 3px; }
  ${({ $position }) => $position === 'top' && 'top: 8%; left: 50%; transform: translateX(-50%);'}
  ${({ $position }) => $position === 'bottom' && 'bottom: 8%; left: 50%; transform: translateX(-50%);'}
  ${({ $position }) => $position === 'left' && 'left: 6%; top: 50%; transform: translateY(-50%);'}
  ${({ $position }) => $position === 'right' && 'right: 6%; top: 50%; transform: translateY(-50%);'}
`;

const AssetWorkspace = styled.div`
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  border-radius: 14px;
`;

const PlaybackBar = styled.div`
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto auto auto;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border: 1px solid #dfe4ea;
  border-radius: 12px;
  background: #fff;

  input[type='range'] { width: 100%; min-width: 90px; accent-color: #2952cc; }
  select { min-height: 44px; border: 1px solid #d0d5dd; border-radius: 9px; background: #fff; padding: 6px 9px; color: #344054; font: inherit; font-size: 11px; }
  output { color: #667085; font-size: 10px; white-space: nowrap; }

  @media (max-width: 520px) { grid-template-columns: auto minmax(100px, 1fr) auto; select { grid-column: 1 / -1; width: 100%; } }
`;

const Inspector = styled.aside<{ $mobileOpen: boolean }>`
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 14px;
  overflow: auto;
  border-left: 1px solid #dfe4ea;
  background: #fff;

  @media (max-width: 1080px) { grid-column: 1 / -1; max-height: 310px; border-top: 1px solid #dfe4ea; border-left: 0; }
  @media (max-width: 720px) {
    position: absolute;
    z-index: 8;
    right: 0;
    bottom: calc(60px + env(safe-area-inset-bottom));
    left: 0;
    display: ${({ $mobileOpen }) => $mobileOpen ? 'grid' : 'none'};
    max-height: min(52dvh, 500px);
    padding: 0 14px calc(16px + env(safe-area-inset-bottom));
    overflow: auto;
    border-top: 1px solid #d0d5dd;
    border-left: 0;
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -20px 50px rgba(16,24,40,.2);
  }
`;

const InspectorHeader = styled.header`
  display: none;
  @media (max-width: 720px) {
    position: sticky;
    z-index: 2;
    top: 0;
    display: flex;
    min-height: 56px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 -14px;
    padding: 8px 14px;
    border-bottom: 1px solid #eaecf0;
    background: #fff;
    strong { color: #101828; font-size: 14px; }
  }
`;

const TimelineSlot = styled.div`
  --text-main: #f8fafc;
  --text-muted: #d0d5dd;
  --text-dim: #b4becd;
  min-width: 0;
  min-height: 0;
  max-height: 220px;
  overflow: auto;
  overscroll-behavior: contain;
  border-radius: 11px;
  background: #111827;
`;

const BubbleLayerManager = styled.div`
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid #dfe4ea;
  border-radius: 12px;
  background: #f8fafc;

  > div { display: flex; gap: 6px; overflow-x: auto; }
  button { min-height: 44px; }
  [data-layer-tab] { min-width: 72px; flex: 1 0 auto; }
  small { color: #697586; line-height: 1.45; }
`;

type Tool = 'timeline' | 'bubble' | 'transform' | 'assets' | 'quality';
const TOOL_LABELS: Record<Tool, string> = {
  timeline: '시간·전환',
  bubble: '말풍선',
  transform: '위치·크기',
  assets: '사진·프레임',
  quality: '검사·다운로드',
};

function jobPreview(job: EmoticonJob): string {
  return job.compositedFrames?.[0]?.url
    || job.animationFrames?.[0]?.url
    || job.outputs?.png?.url
    || job.keyPoseUrl
    || job.sourceImageUrl;
}

function itemBubble(item: EmoticonProjectItem | null, job: EmoticonJob): EmoticonBubble {
  if (item?.bubble) return {
    text: item.bubble.text,
    style: item.bubble.style,
    position: item.bubble.position,
    entrance: item.bubble.entrance,
    font: item.bubble.font,
    size: item.bubble.size,
    fillColor: item.bubble.fillColor,
    textColor: item.bubble.textColor,
    outlineColor: item.bubble.outlineColor,
    outlineWidth: item.bubble.outlineWidth,
    shadowOpacity: item.bubble.shadowOpacity,
    offsetX: item.bubble.offsetX,
    offsetY: item.bubble.offsetY,
    timeline: item.bubble.timeline,
  };
  return job.plan?.bubble || {
    text: '', style: 'rounded', position: 'top', entrance: 'pop', font: 'clean',
    ...EMOTICON_BUBBLE_APPEARANCE_DEFAULTS,
    timeline: { mode: 'full', startFrame: 0, endFrame: null, cues: [] },
  };
}

function itemBubbleLayers(item: EmoticonProjectItem | null, job: EmoticonJob): EmoticonBubble[] {
  if (job.plan?.bubbleLayers?.length) return job.plan.bubbleLayers.slice(0, 4);
  if (item?.bubbleLayers?.length) return item.bubbleLayers.slice(0, 4).map(({ enabled, ...layer }) => ({
    ...layer,
    style: enabled ? layer.style : 'none',
  }));
  return [itemBubble(item, job)];
}

function storedBubble(bubble: EmoticonBubble): EmoticonProjectItem['bubble'] {
  return {
    enabled: bubble.style !== 'none' && Boolean(bubble.text || bubble.timeline.cues.length),
    text: bubble.text,
    position: bubble.position,
    style: bubble.style === 'none' ? 'rounded' : bubble.style,
    font: bubble.font,
    entrance: bubble.entrance,
    size: bubble.size,
    fillColor: bubble.fillColor,
    textColor: bubble.textColor,
    outlineColor: bubble.outlineColor,
    outlineWidth: bubble.outlineWidth,
    shadowOpacity: bubble.shadowOpacity,
    offsetX: bubble.offsetX,
    offsetY: bubble.offsetY,
    timeline: bubble.timeline,
  };
}

function bubbleTextAtFrame(bubble: EmoticonBubble, frameIndex: number, frameCount: number): string {
  if (bubble.style === 'none') return '';
  if (bubble.timeline.mode === 'cues') {
    return bubble.timeline.cues.find((cue) => frameIndex >= cue.startFrame && frameIndex <= cue.endFrame)?.text || '';
  }
  if (bubble.timeline.mode === 'intro' || bubble.timeline.mode === 'outro' || bubble.timeline.mode === 'range') {
    const endFrame = bubble.timeline.endFrame ?? Math.max(0, frameCount - 1);
    if (frameIndex < bubble.timeline.startFrame || frameIndex > endFrame) return '';
  }
  return bubble.text;
}

export function ProfessionalEditor(props: Props) {
  const editorRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(props.onClose);
  const [tool, setTool] = useState<Tool>('timeline');
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bubbleLayers, setBubbleLayers] = useState<EmoticonBubble[]>(() => itemBubbleLayers(props.item, props.job));
  const [selectedBubbleLayer, setSelectedBubbleLayer] = useState(0);
  const localEditingLocked = props.readOnly && !props.allowLocalImportPreview;
  const bubble = bubbleLayers[selectedBubbleLayer] || bubbleLayers[0] || itemBubble(props.item, props.job);
  const setBubble = (update: EmoticonBubble | ((current: EmoticonBubble) => EmoticonBubble)) => {
    setBubbleLayers((current) => current.map((layer, index) => (
      index === selectedBubbleLayer
        ? (typeof update === 'function' ? update(layer) : update)
        : layer
    )));
  };
  const [previewFrameIndex, setPreviewFrameIndex] = useState(() => Math.max(0, props.initialFrameIndex ?? 0));
  const [isPlaying, setIsPlaying] = useState(() => props.initialFrameIndex === undefined);
  const [playbackMode, setPlaybackMode] = useState<'forward' | 'reverse' | 'pingpong' | 'hold'>(() => (
    props.initialFrameIndex === undefined ? 'forward' : 'hold'
  ));
  const [onionSkin, setOnionSkin] = useState(false);
  const [assetImportRequest, setAssetImportRequest] = useState<ReusableFrameImportRequest | null>(null);
  const pingPongDirectionRef = useRef<1 | -1>(1);
  const frameCount = props.job.plan?.action.frameCount || props.item?.motion.frameCount || 1;
  const previewFrames = props.job.compositedFrames?.length ? props.job.compositedFrames : props.job.animationFrames || [];
  const safePreviewFrameIndex = Math.min(previewFrameIndex, Math.max(0, previewFrames.length - 1));
  const fallbackFrameDuration = Math.max(40, Math.round((props.job.plan?.action.durationMs || 1000) / Math.max(1, previewFrames.length)));
  const [frameDurations, setFrameDurations] = useState<number[]>(() => {
    const stored = props.job.renderOverrides?.frameDurationsMs || props.job.manualImportReport?.frameDurationsMs;
    return previewFrames.map((_, index) => stored?.[index] || fallbackFrameDuration);
  });
  const [frameTransitions, setFrameTransitions] = useState<EmoticonFrameTransition[]>(() => {
    const stored = props.job.renderOverrides?.frameTransitions;
    return previewFrames.map((_, index) => stored?.[index] || { kind: 'cut', strength: 0.55 });
  });
  const reusableFrames = useMemo(() => props.recentJobs.flatMap((job) => (
    job.status === 'completed' && job.outputProfile?.type === 'static' && job.outputs?.png
      ? [{ sourceJobId: job.id, imageUrl: job.outputs.png.url, title: job.instruction.slice(0, 60), detail: '완성된 정지 이미지' }]
      : []
  )), [props.recentJobs]);
  const libraryAssets = useMemo(
    () => buildAssetLibraryEntries(props.recentJobs, props.project.id),
    [props.project.id, props.recentJobs],
  );
  const queueLibraryFrames = useCallback((frames: ReusableEmoticonFrame[]) => {
    setAssetImportRequest({ requestId: crypto.randomUUID(), frames });
  }, []);
  const clearLibraryFrameRequest = useCallback((requestId: string) => {
    setAssetImportRequest((current) => current?.requestId === requestId ? null : current);
  }, []);
  const selectTool = (next: Tool) => {
    setTool(next);
    setMobileInspectorOpen(true);
  };

  useEffect(() => {
    onCloseRef.current = props.onClose;
  }, [props.onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    editorRef.current?.focus();
    const handleDialogKey = (event: KeyboardEvent) => {
      if (document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 1) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !editorRef.current) return;
      const focusable = Array.from(editorRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        editorRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleDialogKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => {
      if (reducedMotion.matches) setIsPlaying(false);
    };
    syncMotionPreference();
    reducedMotion.addEventListener('change', syncMotionPreference);
    return () => reducedMotion.removeEventListener('change', syncMotionPreference);
  }, []);

  useEffect(() => {
    if (!isPlaying || playbackMode === 'hold' || previewFrames.length < 2) return undefined;
    const duration = frameDurations[safePreviewFrameIndex] || fallbackFrameDuration;
    const timer = window.setTimeout(() => {
      setPreviewFrameIndex((current) => {
        const last = previewFrames.length - 1;
        if (playbackMode === 'reverse') return current <= 0 ? last : current - 1;
        if (playbackMode === 'pingpong') {
          if (current >= last) pingPongDirectionRef.current = -1;
          if (current <= 0) pingPongDirectionRef.current = 1;
          return Math.min(last, Math.max(0, current + pingPongDirectionRef.current));
        }
        return current >= last ? 0 : current + 1;
      });
    }, duration);
    return () => window.clearTimeout(timer);
  }, [fallbackFrameDuration, frameDurations, isPlaying, playbackMode, previewFrames.length, safePreviewFrameIndex]);

  const renderAnimationSettings = async () => {
    if (!props.item || props.readOnly || previewFrames.length < 2) return;
    setBusy(true);
    setError('');
    try {
      const result = await rerenderEmoticonJob({
        userId: props.userId,
        parentJob: props.job,
        bubble: bubbleLayers[0] || bubble,
        bubbleLayers,
        frameDurationsMs: frameDurations,
        frameTransitions,
        formats: props.job.formats,
        projectId: props.project.id,
        projectItemId: props.item.id,
      });
      props.onQueued(result.jobId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '애니메이션 설정을 적용하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const saveBubble = async () => {
    if (!props.item || props.readOnly) return;
    setBusy(true);
    setError('');
    try {
      await updateEmoticonProjectItem({
        userId: props.userId,
        projectId: props.project.id,
        itemId: props.item.id,
        update: {
          bubble: storedBubble(bubbleLayers[0] || bubble),
          bubbleLayers: bubbleLayers.map(storedBubble),
        },
      });
      const result = await rerenderEmoticonJob({
        userId: props.userId,
        parentJob: props.job,
        bubble: bubbleLayers[0] || bubble,
        bubbleLayers,
        formats: props.job.formats,
        projectId: props.project.id,
        projectItemId: props.item.id,
      });
      props.onQueued(result.jobId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '말풍선 편집본을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const createEdit = async (recipe: EmoticonImageEditRecipe) => {
    if (!props.item || props.readOnly) return;
    setBusy(true);
    setError('');
    try {
      const result = await createEditedEmoticonJob({
        userId: props.userId,
        parentJob: props.job,
        editRecipe: recipe,
        bubble,
        formats: props.job.formats,
        projectId: props.project.id,
        projectItemId: props.item.id,
      });
      props.onQueued(result.jobId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '이미지 편집본을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const importFrames = async (input: ManualFrameImportSubmit): Promise<boolean> => {
    if (!props.item || !props.job.outputProfile || props.readOnly) return false;
    setBusy(true);
    setError('');
    try {
      const result = await submitEmoticonFrameImportJob({
        userId: props.userId,
        projectId: props.project.id,
        projectItemId: props.item.id,
        expectedProjectRevision: props.project.revision,
        expectedProjectItemRevision: props.item.revision,
        frames: input.frames,
        timing: input.timing,
        formats: input.formats,
        outputProfile: props.job.outputProfile,
        bubble,
        editRecipe: props.job.editRecipe,
      });
      props.onQueued(result.jobId);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '프레임 묶음을 가져오지 못했습니다.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const preview = previewFrames[safePreviewFrameIndex]?.url || jobPreview(props.job);
  const activeBubbleLayers = bubbleLayers.map((layer, index) => ({
    layer,
    index,
    text: bubbleTextAtFrame(layer, safePreviewFrameIndex, Math.max(frameCount, previewFrames.length)),
  })).filter((entry) => Boolean(entry.text));
  const addBubbleLayer = () => {
    if (bubbleLayers.length >= 4 || localEditingLocked) return;
    const next: EmoticonBubble = {
      ...bubble,
      text: '',
      offsetX: Math.max(-180, Math.min(180, bubble.offsetX + 18)),
      offsetY: Math.max(-180, Math.min(180, bubble.offsetY + 18)),
      timeline: { mode: 'full', startFrame: 0, endFrame: null, cues: [] },
    };
    setBubbleLayers((current) => [...current, next]);
    setSelectedBubbleLayer(bubbleLayers.length);
  };
  const duplicateBubbleLayer = () => {
    if (bubbleLayers.length >= 4 || localEditingLocked) return;
    const next = { ...bubble, offsetX: Math.max(-180, Math.min(180, bubble.offsetX + 18)), offsetY: Math.max(-180, Math.min(180, bubble.offsetY + 18)), timeline: { ...bubble.timeline, cues: bubble.timeline.cues.map((cue) => ({ ...cue, id: crypto.randomUUID() })) } };
    setBubbleLayers((current) => [...current, next]);
    setSelectedBubbleLayer(bubbleLayers.length);
  };
  const deleteBubbleLayer = () => {
    if (bubbleLayers.length <= 1 || localEditingLocked) return;
    const next = bubbleLayers.filter((_, index) => index !== selectedBubbleLayer);
    setBubbleLayers(next);
    setSelectedBubbleLayer(Math.min(selectedBubbleLayer, next.length - 1));
  };
  const onionPreview = previewFrames.length > 1
    ? previewFrames[(safePreviewFrameIndex - 1 + previewFrames.length) % previewFrames.length]?.url
    : null;
  return (
    <Overlay role="dialog" aria-modal="true" aria-labelledby="professional-editor-title">
      <Editor ref={editorRef} tabIndex={-1}>
        <Header>
          <div><strong id="professional-editor-title">{props.initialFrameIndex === undefined ? '세부 조정' : `${props.initialFrameIndex + 1}번 이미지 조정`}</strong><small>원본 프레임은 보존하고 편집본을 새 버전으로 만듭니다.</small></div>
          <S.Button type="button" $variant="quiet" onClick={props.onClose} aria-label="세부 조정 닫기"><X size={18} /></S.Button>
        </Header>
        <Body>
          <Assets aria-label="편집 도구">
            <S.Button type="button" aria-pressed={tool === 'timeline'} $variant={tool === 'timeline' ? 'primary' : 'secondary'} onClick={() => selectTool('timeline')}><Clock3 size={15} /> 시간·전환</S.Button>
            <S.Button type="button" aria-pressed={tool === 'bubble'} $variant={tool === 'bubble' ? 'primary' : 'secondary'} onClick={() => selectTool('bubble')}><MessageCircle size={15} /> 말풍선</S.Button>
            <S.Button type="button" aria-pressed={tool === 'transform'} $variant={tool === 'transform' ? 'primary' : 'secondary'} onClick={() => selectTool('transform')}><SlidersHorizontal size={15} /> 위치·크기</S.Button>
            <S.Button type="button" aria-pressed={tool === 'assets'} $variant={tool === 'assets' ? 'primary' : 'secondary'} onClick={() => selectTool('assets')}><Images size={15} /> 사진·프레임</S.Button>
            <S.Button type="button" aria-pressed={tool === 'quality'} $variant={tool === 'quality' ? 'primary' : 'secondary'} onClick={() => selectTool('quality')}><CheckCircle2 size={15} /> 검사·다운로드</S.Button>
          </Assets>
          <Stage>
            {tool === 'assets' ? (
              <AssetWorkspace>
                <AssetLibrary
                  userId={props.userId}
                  projectId={props.project.id}
                  assets={libraryAssets}
                  canAddToTimeline={props.project.emoticonType === 'animated' && Boolean(props.item)}
                  disabled={Boolean(props.pending || props.readOnly || busy)}
                  onAddToTimeline={queueLibraryFrames}
                />
              </AssetWorkspace>
            ) : (
              <Canvas>
              {onionSkin && onionPreview ? <img data-onion="true" src={onionPreview} width={512} height={512} alt="" aria-hidden="true" /> : null}
              <img src={preview} width={512} height={512} alt={`편집 결과 투명 배경 미리보기 ${safePreviewFrameIndex + 1}번 프레임`} />
              {tool === 'bubble' ? activeBubbleLayers.map(({ layer, index, text }) => (
                <BubblePreview
                  key={`bubble-layer-${index}`}
                  as="button"
                  type="button"
                  aria-label={`말풍선 레이어 ${index + 1} 선택`}
                  aria-pressed={index === selectedBubbleLayer}
                  data-testid="bubble-live-preview"
                  data-selected={index === selectedBubbleLayer}
                  $position={layer.position}
                  $bubbleStyle={layer.style}
                  style={{
                    marginLeft: layer.offsetX,
                    marginTop: layer.offsetY,
                    background: layer.fillColor,
                    color: layer.textColor,
                    borderColor: layer.outlineColor,
                    borderWidth: layer.outlineWidth,
                    boxShadow: `${index === selectedBubbleLayer ? '0 0 0 3px rgba(91, 78, 231, 0.28), ' : ''}0 7px 18px rgba(16, 24, 40, ${layer.shadowOpacity})`,
                    fontSize: `${Math.round(16 * layer.size)}px`,
                    fontFamily: layer.font === 'serif' ? 'serif' : layer.font === 'handwriting' ? 'cursive' : 'inherit',
                    fontWeight: layer.font === 'bold' ? 800 : 700,
                    zIndex: 5 + index,
                  }}
                  onClick={() => setSelectedBubbleLayer(index)}
                >{text}</BubblePreview>
              )) : null}
              </Canvas>
            )}
            {tool !== 'assets' && previewFrames.length ? (
              <PlaybackBar aria-label="애니메이션 재생과 프레임 검토">
                <S.Button type="button" $variant="secondary" aria-label={isPlaying ? '미리보기 일시정지' : '미리보기 재생'} onClick={() => setIsPlaying((current) => !current)}>{isPlaying ? <Pause size={15} /> : <Play size={15} />}</S.Button>
                <input type="range" min={0} max={previewFrames.length - 1} value={safePreviewFrameIndex} aria-label="미리보기 프레임 선택" onChange={(event) => { setIsPlaying(false); setPreviewFrameIndex(Number(event.target.value)); }} />
                <output>{safePreviewFrameIndex + 1}/{previewFrames.length}</output>
                <S.Button type="button" $variant={onionSkin ? 'primary' : 'secondary'} aria-pressed={onionSkin} onClick={() => setOnionSkin((current) => !current)}><Layers3 size={15} /> 어니언</S.Button>
                <select name="playbackMode" value={playbackMode} aria-label="재생 방식" onChange={(event) => {
                  const next = event.target.value as typeof playbackMode;
                  pingPongDirectionRef.current = 1;
                  setPlaybackMode(next);
                  setIsPlaying(next !== 'hold');
                  if (next === 'reverse') setPreviewFrameIndex(Math.max(0, previewFrames.length - 1));
                }}>
                  <option value="forward">정방향 반복</option>
                  <option value="reverse">역방향 반복</option>
                  <option value="pingpong">왕복 재생</option>
                  <option value="hold">선택 프레임 정지</option>
                </select>
              </PlaybackBar>
            ) : null}
            <TimelineSlot>
              <FrameTimelinePanel
                item={props.item}
                job={props.job}
                onRegenerateFrame={props.readOnly ? undefined : async (job, frameIndex) => {
                  if (!props.item) return;
                  const result = await regenerateEmoticonFrame({ userId: props.userId, job, frameIndex, projectId: props.project.id, projectItemId: props.item.id });
                  props.onQueued(result.jobId);
                }}
                onDownloadFrame={async (job, frameIndex) => {
                  const frame = (job.compositedFrames?.length ? job.compositedFrames : job.animationFrames)?.[frameIndex];
                  if (frame) await downloadEmoticonFile(frame.url, buildEmoticonFrameFileName(props.item?.title || 'frame', frameIndex));
                }}
              />
            </TimelineSlot>
          </Stage>
          <Inspector $mobileOpen={mobileInspectorOpen} aria-label={`${TOOL_LABELS[tool]} 편집 패널`}>
            <InspectorHeader><strong>{TOOL_LABELS[tool]}</strong><S.Button type="button" $variant="quiet" aria-label={`${TOOL_LABELS[tool]} 패널 닫기`} onClick={() => setMobileInspectorOpen(false)}><X size={18} /></S.Button></InspectorHeader>
            {error ? <S.Notice $tone="danger" role="alert"><AlertTriangle size={16} /><span>{error}</span></S.Notice> : null}
            {props.readOnly ? <S.Notice $tone="info"><CheckCircle2 size={16} /><span>미리보기 모드입니다. 화면 조작은 가능하지만 프로젝트 데이터는 변경하지 않습니다.</span></S.Notice> : null}
            {tool === 'timeline' ? (
              <AnimationTimingEditor
                frameUrls={previewFrames.map((frame) => frame.url)}
                durations={frameDurations}
                transitions={frameTransitions}
                selectedFrame={safePreviewFrameIndex}
                disabled={busy || props.pending || props.readOnly}
                onSelectFrame={(index) => { setIsPlaying(false); setPreviewFrameIndex(index); }}
                onDurationsChange={setFrameDurations}
                onTransitionsChange={setFrameTransitions}
                onRender={() => void renderAnimationSettings()}
              />
            ) : null}
            {tool === 'bubble' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <BubbleLayerManager aria-label="말풍선 레이어 관리">
                  <div>
                    {bubbleLayers.map((layer, index) => (
                      <S.Button key={`layer-${index}`} data-layer-tab type="button" $variant={index === selectedBubbleLayer ? 'primary' : 'secondary'} aria-pressed={index === selectedBubbleLayer} onClick={() => setSelectedBubbleLayer(index)}>
                        레이어 {index + 1}{layer.text ? ` · ${layer.text.slice(0, 6)}` : ''}
                      </S.Button>
                    ))}
                  </div>
                  <div>
                    <S.Button type="button" $variant="secondary" disabled={localEditingLocked || bubbleLayers.length >= 4} onClick={addBubbleLayer}><Plus size={15} /> 추가</S.Button>
                    <S.Button type="button" $variant="secondary" disabled={localEditingLocked || bubbleLayers.length >= 4} onClick={duplicateBubbleLayer}><Copy size={15} /> 복제</S.Button>
                    <S.Button type="button" $variant="quiet" disabled={localEditingLocked || bubbleLayers.length <= 1} onClick={deleteBubbleLayer}><Trash2 size={15} /> 삭제</S.Button>
                  </div>
                  <small>최대 4개 · 각 레이어의 문구, 위치, 노출 프레임을 독립 편집합니다.</small>
                </BubbleLayerManager>
                <S.Field>기본 문구<input name="bubbleText" autoComplete="off" value={bubble.text} maxLength={36} disabled={localEditingLocked} onChange={(event) => setBubble((current) => ({ ...current, text: event.target.value }))} /></S.Field>
                <BubbleTimelineEditor
                  timeline={bubble.timeline}
                  frameCount={frameCount}
                  disabled={busy || localEditingLocked}
                  appearance={bubble}
                  bubbleOptions={bubble}
                  onAppearanceChange={(appearance: EmoticonBubbleAppearance) => setBubble((current) => ({ ...current, ...appearance }))}
                  onBubbleOptionsChange={(options) => setBubble((current) => ({ ...current, ...options }))}
                  onChange={(timeline: EmoticonBubbleTimeline) => setBubble((current) => ({ ...current, timeline }))}
                />
                <S.Button type="button" disabled={busy || props.readOnly} onClick={() => void saveBubble()}>{busy ? <S.Spinner /> : <MessageCircle size={15} />} 문구만 다시 합성</S.Button>
                <S.Notice $tone="success"><CheckCircle2 size={15} /><span>문구 수정과 말풍선 위치 변경에는 OpenRouter 이미지 비용이 들지 않습니다.</span></S.Notice>
              </div>
            ) : null}
            {tool === 'transform' ? <ImageEditPanel job={props.job} item={props.item} isLocked={Boolean(props.pending || props.readOnly)} isCreating={busy} canCreate={Boolean(props.item) && !props.readOnly} onCreate={createEdit} /> : null}
            {tool === 'assets' ? (
              <ManualFrameImportPanel
                projectType={props.project.emoticonType}
                allowedFormats={props.job.formats}
                defaultFormats={props.job.formats}
                disabled={Boolean(props.pending || (props.readOnly && !props.allowLocalImportPreview))}
                isSubmitting={busy}
                hasBubble={Boolean(bubble.text || bubble.timeline.cues.length)}
                hasImageEdit={Boolean(props.job.editRecipe?.revision)}
                reusableFrames={reusableFrames}
                showReusableFrames={false}
                reusableFrameImportRequest={assetImportRequest}
                onReusableFrameImportApplied={clearLibraryFrameRequest}
                draftKey={`${props.project.id}:${props.item?.id || props.job.id}`}
                onSubmit={importFrames}
              />
            ) : null}
            {tool === 'quality' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {props.job.specReport?.technicalPass ? <S.Notice $tone="success"><CheckCircle2 size={16} /><span><strong>편집 기준 통과</strong><br />{props.job.specReport.frameCount}프레임 · {(props.job.specReport.durationMs / 1000).toFixed(1)}초 · 투명도와 파일 구조 확인 완료</span></S.Notice> : <S.Notice $tone="danger"><AlertTriangle size={16} /><span><strong>수정이 필요한 항목이 있어요.</strong><br />아래 문제를 해결한 뒤 다시 출력하세요.</span></S.Notice>}
                {(props.job.quality?.issues || []).map((issue) => <S.Notice key={issue} $tone="warning"><AlertTriangle size={15} /><span>{issue}</span></S.Notice>)}
                <S.Notice $tone="info"><CheckCircle2 size={16} /><span>형식별 용량·다운로드·플랫폼 제출 확인은 편집기를 닫은 뒤 <strong>검토·내보내기</strong>에서 한 번에 제공합니다.</span></S.Notice>
              </div>
            ) : null}
          </Inspector>
        </Body>
      </Editor>
    </Overlay>
  );
}
