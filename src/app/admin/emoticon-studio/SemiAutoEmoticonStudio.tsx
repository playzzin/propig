'use client';

import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  ImagePlus,
  Images,
  Eye,
  EyeOff,
  Layers3,
  Lock,
  Unlock,
  LoaderCircle,
  MessageSquareText,
  Maximize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  Zap,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import styled from 'styled-components';
import { Toaster, toast as notification } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { parseEmoticonAnimationPresetJson, type EmoticonAnimationPresetPlan } from '@/schemas/emoticonAnimationPreset';
import StudioProductionPanel from './StudioProductionPanel';
import { remapStudioOperations, operationMatchesSlot, operationNeedsRecovery, readStudioOperations, writeStudioOperations, withStudioOperationLock, type StudioImageResult, type StudioOperation, type StudioOperationResult } from './studio-operation-journal';

const DRAFT_KEY = 'propig:semi-auto-emoticon-studio:v1';
const DRAFT_RECOVERY_PREFIX = 'propig:semi-auto-emoticon-studio:recovery:';
const ARCHIVES_KEY = 'propig:emoticon-projects:v1';
const DATABASE_NAME = 'propig-semi-auto-emoticon-studio';
const DATABASE_VERSION = 1;
const ASSET_STORE = 'assets';
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_FRAME_COUNT = 48;
const MIN_FRAME_DURATION_MS = 60;
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const STUDIO_TOASTER_ID = 'emoticon-studio';
const toast = Object.assign((message: ReactNode) => notification(message, { toasterId: STUDIO_TOASTER_ID }), {
  success: (message: ReactNode) => notification.success(message, { toasterId: STUDIO_TOASTER_ID }),
  error: (message: ReactNode) => notification.error(message, { toasterId: STUDIO_TOASTER_ID }),
  warning: (message: ReactNode) => notification.warning(message, { toasterId: STUDIO_TOASTER_ID }),
});

type KeyframePlan = { id: string; pose: string; caption: string; durationMs: number; imagePrompt?: string };
type AnimationPreset = { id: string; title: string; summary: string; dialogue: string; loopGuide: string; frames: KeyframePlan[] };
type SceneId = string;

const frame = (id: string, pose: string, caption = '', durationMs = 140): KeyframePlan => ({ id, pose, caption, durationMs });

const DEFAULT_PRESETS: AnimationPreset[] = [
  {
    id: 'hello-wave', title: '손 흔들며 “안녕”', dialogue: '밝은 목소리로 “안녕!”',
    summary: '정면을 보며 손을 좌우로 두 번 흔들고 입 모양도 대사에 맞춰 움직인 뒤 미소로 돌아온다.',
    loopGuide: '마지막 미소 자세를 첫 정면 자세와 가깝게 맞춰 자연스럽게 반복한다.',
    frames: [
      frame('hello-1', '정면 기본 자세로 밝게 미소 짓고 두 팔은 편안히 내린다.', '', 180),
      frame('hello-2', '한 손을 얼굴 옆까지 들어 올리고 인사를 시작하며 입을 살짝 연다.', '안'),
      frame('hello-3', '든 손을 바깥쪽으로 흔들고 몸도 조금 기울이며 입을 크게 연다.', '안'),
      frame('hello-4', '손을 안쪽으로 되돌려 흔들고 눈웃음을 지으며 다음 음절을 말한다.', '녕'),
      frame('hello-5', '손을 다시 바깥쪽으로 한 번 더 흔들며 활짝 웃는다.', '안녕!', 160),
      frame('hello-6', '손을 천천히 내리며 처음과 가까운 정면 미소 자세로 마무리한다.', '안녕!', 220),
    ],
  },
  {
    id: 'spin-kick-560', title: '560도 회전 발차기', dialogue: '타격 순간 기합 “얍!”',
    summary: '몸을 낮춰 반동을 만든 뒤 공중에서 한 바퀴 반 이상 회전하고 560도 지점에서 발차기를 뻗은 다음 안정적으로 착지한다.',
    loopGuide: '착지 뒤 중심을 회복한 자세가 첫 준비 자세로 자연스럽게 이어지게 한다.',
    frames: [
      frame('kick-1', '발을 어깨너비로 두고 양손을 가드에 올린 준비 자세.', '', 160),
      frame('kick-2', '무릎을 굽히고 상체와 양팔을 회전 반대 방향으로 비틀어 강한 반동을 준비한다.', '', 110),
      frame('kick-3', '지면을 박차고 점프해 회전을 시작한다. 시선은 먼저 회전 방향을 향하고 양팔은 몸 가까이 모은다.', '', 90),
      frame('kick-4', '공중에서 약 180도 회전한 순간. 축 다리는 접고 발차기할 다리는 회전 궤도를 따라 준비한다.', '', 90),
      frame('kick-5', '약 360도 회전한 순간. 몸통은 계속 회전하고 고개는 목표물을 다시 포착한다.', '', 90),
      frame('kick-6', '약 500도 회전한 순간. 골반을 열고 발차기할 다리를 빠르게 펴기 시작한다.', '얍!', 80),
      frame('kick-7', '정확히 약 560도 지점의 타격 순간. 한쪽 다리를 목표 방향으로 완전히 뻗고 반대팔로 균형을 잡는다.', '얍!', 150),
      frame('kick-8', '발차기 다리를 회수하고 무릎을 굽혀 착지하며 양팔을 다시 가드로 되돌린다.', '', 190),
    ],
  },
  {
    id: 'deep-thanks', title: '꾸벅 인사하며 “고마워”', dialogue: '진심을 담아 “고마워”',
    summary: '두 손을 모으고 깊이 숙여 감사한 뒤 수줍게 웃으며 일어난다.', loopGuide: '마지막 자세를 첫 미소 자세와 연결한다.',
    frames: [frame('thanks-1', '두 손을 가슴 앞에 모으고 따뜻하게 미소 짓는다.', '', 180), frame('thanks-2', '눈을 감으며 고개와 상체를 숙이기 시작한다.', '고마워'), frame('thanks-3', '상체를 가장 깊게 숙이고 두 손을 단단히 모은다.', '고마워', 250), frame('thanks-4', '고개를 들며 눈을 뜨고 수줍게 미소 짓는다.', '고마워!'), frame('thanks-5', '상체를 완전히 세우고 손을 가슴에 얹는다.', '고마워!', 210)],
  },
  {
    id: 'jump-cheer', title: '점프하며 “최고!”', dialogue: '힘차게 “최고!”',
    summary: '몸을 낮춰 힘을 모은 뒤 높이 점프하며 양팔을 V자로 벌이고 착지한다.', loopGuide: '착지 반동 뒤 첫 자세로 돌아온다.',
    frames: [frame('cheer-1', '주먹을 쥐고 몸을 살짝 낮춘다.'), frame('cheer-2', '더 깊이 앉아 양팔을 뒤로 보내 점프 반동을 만든다.', '', 100), frame('cheer-3', '지면을 박차고 떠오르며 양팔을 위로 뻗는다.', '최'), frame('cheer-4', '공중 최고점에서 양팔과 다리를 V자로 크게 벌려 활짝 웃는다.', '최고!', 180), frame('cheer-5', '내려오며 무릎을 굽히고 양팔로 균형을 잡는다.', '최고!', 100), frame('cheer-6', '가볍게 착지한 뒤 엄지를 들어 올린다.', '최고!', 220)],
  },
  {
    id: 'angry-stomp', title: '발 구르며 화내기', dialogue: '볼을 부풀리며 “흥!”',
    summary: '화를 참다가 발을 세게 구르고 팔짱을 끼며 고개를 돌린다.', loopGuide: '고개를 다시 정면으로 돌려 첫 자세에 연결한다.',
    frames: [frame('angry-1', '눈썹을 찌푸리고 주먹을 쥔 채 화를 참는다.'), frame('angry-2', '한쪽 발을 높이 들고 볼을 크게 부풀린다.', '흥!'), frame('angry-3', '발을 바닥에 세게 구르며 몸 전체가 짧게 흔들린다.', '흥!', 100), frame('angry-4', '양팔을 빠르게 교차해 팔짱을 낀다.', '흥!'), frame('angry-5', '팔짱을 낀 채 고개를 옆으로 홱 돌린다.', '흥!', 220)],
  },
  {
    id: 'clap-loop', title: '신나게 박수치기', dialogue: '리듬에 맞춰 “짝짝짝!”',
    summary: '두 손을 벌렸다 모으는 박수 동작을 세 번 반복하며 몸도 리듬에 맞춰 튕긴다.', loopGuide: '마지막 손 벌림을 첫 손 벌림과 같은 위치로 맞춘다.',
    frames: [frame('clap-1', '두 손을 가슴 앞에서 넓게 벌리고 기대하는 미소.', '', 100), frame('clap-2', '두 손바닥이 중앙에서 맞닿는 첫 박수 순간.', '짝!', 90), frame('clap-3', '손을 다시 벌리고 몸이 살짝 위로 튕긴다.', '', 90), frame('clap-4', '두 번째 박수로 손바닥이 맞닿고 눈웃음을 짓는다.', '짝!', 90), frame('clap-5', '손을 다시 벌리며 다음 박수를 준비한다.', '', 90), frame('clap-6', '세 번째 박수를 힘차게 치며 활짝 웃는다.', '짝짝짝!', 140), frame('clap-7', '손을 첫 프레임과 같은 간격으로 벌려 반복을 준비한다.', '', 100)],
  },
];
type StepId = 'project' | 'character' | 'plan' | 'import' | 'edit' | 'export';
type Platform = 'kakao' | 'naver' | 'line' | 'telegram' | 'custom';
type GenerationMode = 'fast' | 'quality';
type GenerationProvider = 'auto' | 'openai' | 'google' | 'xai';
type ImageModelCapability = { id: string; available: boolean; imageOutput: boolean; referenceInput: boolean; pricing: { image: string | null; prompt: string | null; completion: string | null } | null };
type ImageModelPreflight = { catalogStatus: 'available' | 'unavailable' | 'not-configured' | 'loading' | 'signed-out' | 'forbidden'; checkedAt: string; models: ImageModelCapability[] };

type LayerTransform = { x: number; y: number; width: number; rotation: number; opacity: number };
type FrameLayer = {
  id: string;
  type: 'image' | 'speech';
  name: string;
  assetId?: string;
  text?: string;
  visible: boolean;
  locked: boolean;
  transform: LayerTransform;
};

const DEFAULT_IMAGE_TRANSFORM: LayerTransform = { x: 50, y: 50, width: 86, rotation: 0, opacity: 100 };
const DEFAULT_CAPTION_TRANSFORM: LayerTransform = { x: 50, y: 84, width: 64, rotation: 0, opacity: 100 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const snapCanvasValue = (value: number) => {
  const clamped = clamp(value, 0, 100);
  const guide = [0, 25, 50, 75, 100].find((point) => Math.abs(point - clamped) <= 1.5);
  return guide ?? Math.round(clamped * 2) / 2;
};

function normalizeTransform(value: Partial<LayerTransform> | undefined, fallback: LayerTransform): LayerTransform {
  return {
    x: clamp(Number(value?.x ?? fallback.x), 0, 100),
    y: clamp(Number(value?.y ?? fallback.y), 0, 100),
    width: clamp(Number(value?.width ?? fallback.width), 8, 160),
    rotation: clamp(Number(value?.rotation ?? fallback.rotation), -180, 180),
    opacity: clamp(Number(value?.opacity ?? fallback.opacity), 10, 100),
  };
}

function normalizeLayer(value: Partial<FrameLayer>, index: number): FrameLayer | null {
  if (value?.type !== 'image' && value?.type !== 'speech') return null;
  return {
    id: typeof value.id === 'string' ? value.id : `layer-${index + 1}`,
    type: value.type,
    name: typeof value.name === 'string' ? value.name.slice(0, 40) : value.type === 'image' ? '추가 이미지' : '말풍선',
    assetId: typeof value.assetId === 'string' ? value.assetId : undefined,
    text: typeof value.text === 'string' ? value.text.slice(0, 80) : '',
    visible: value.visible !== false,
    locked: value.locked === true,
    transform: normalizeTransform(value.transform, value.type === 'image'
      ? { x: 72, y: 66, width: 30, rotation: 0, opacity: 100 }
      : { x: 50, y: 20, width: 52, rotation: 0, opacity: 100 }),
  };
}

const GENERATION_MODELS: Record<GenerationProvider, Record<GenerationMode, string>> = {
  auto: { fast: 'google/gemini-3.1-flash-lite-image', quality: 'openai/gpt-image-2' },
  openai: { fast: 'openai/gpt-image-2', quality: 'openai/gpt-image-2' },
  google: { fast: 'google/gemini-3.1-flash-lite-image', quality: 'google/gemini-3.1-flash-image' },
  xai: { fast: 'x-ai/grok-imagine-image-2.0', quality: 'x-ai/grok-imagine-image-2.0' },
};

type Draft = {
  version: 3;
  projectId: string;
  projectName: string;
  characterName: string;
  characterDescription: string;
  platform: Platform;
  presets: AnimationPreset[];
  selectedSceneIds: SceneId[];
  sourceName: string;
  sourceRevision?: string;
  recentSceneIds?: string[];
  frameMeta: Array<{
    id: string;
    sceneId: SceneId | null;
    keyframeIndex: number | null;
    keyframeId: string | null;
    fileName: string;
    durationMs: number;
    caption: string;
    imageTransform: LayerTransform;
    captionTransform: LayerTransform;
    layers: FrameLayer[];
  }>;
};

type StoredAsset = {
  key: string;
  projectId: string;
  assetId: string;
  kind: 'source' | 'frame' | 'layer';
  blob: Blob;
  fileName: string;
  updatedAt: number;
  frameMeta?: Draft['frameMeta'][number];
};

type StudioFrame = Draft['frameMeta'][number] & {
  file: File;
  url: string;
};
const frameMetaFromFrames = (items: StudioFrame[]): Draft['frameMeta'] => items.map(({ id, sceneId, keyframeIndex, keyframeId, fileName, durationMs, caption, imageTransform, captionTransform, layers }) => ({
  id, sceneId, keyframeIndex, keyframeId, fileName, durationMs, caption, imageTransform, captionTransform, layers,
}));
type LayerSelection = 'base' | 'caption' | string;
type ApiGenerationState = { label: string; status: 'queued' | 'generating' | 'completed' | 'failed' | 'cancelled' };

const STEP_ITEMS: Array<{ id: string; target: StepId; label: string; eyebrow: string; icon: ReactNode }> = [
  { id: 'prepare', target: 'character', label: '준비하기', eyebrow: '1', icon: <Images size={19} /> },
  { id: 'plan', target: 'plan', label: '장면 고르기', eyebrow: '2', icon: <FileText size={19} /> },
  { id: 'make', target: 'import', label: '만들고 다듬기', eyebrow: '3', icon: <Sparkles size={19} /> },
  { id: 'export', target: 'export', label: '검수하고 받기', eyebrow: '4', icon: <CheckCircle2 size={19} /> },
];

const PLATFORM_LABELS: Record<Platform, string> = {
  kakao: '카카오톡',
  naver: '네이버 OGQ',
  line: 'LINE',
  telegram: 'Telegram',
  custom: '자유 캔버스',
};

const SUBMISSION_PROFILES: Record<Platform, { width: number; height: number; title: string; summary: string }> = {
  kakao: { width: 360, height: 360, title: '카카오톡 작업 프리셋', summary: '360×360 투명 캔버스를 기준으로 합성 결과와 반복 동작을 점검합니다.' },
  naver: { width: 740, height: 640, title: '네이버 OGQ 작업 프리셋', summary: '740×640 작업 캔버스를 기준으로 여백과 말풍선 안전 영역을 점검합니다.' },
  line: { width: 320, height: 270, title: 'LINE 애니메이션 작업 프리셋', summary: '320×270 캔버스에서 점검합니다. 최종 제출에는 APNG 변환이 필요해요.' },
  telegram: { width: 512, height: 512, title: 'Telegram 작업 프리셋', summary: '512×512 정사각 캔버스에서 투명 배경과 반복 동작을 점검합니다.' },
  custom: { width: 500, height: 500, title: '자유 작업 프리셋', summary: '500×500 비파괴 편집 캔버스입니다. 특정 플랫폼 제출 규격은 적용하지 않아요.' },
};

const OFFICIAL_GUIDES: Record<Platform, { checkedAt: string; summary: string; url: string }> = {
  kakao: { checkedAt: '2026-09-24', summary: '움직이는 일반 이모티콘: 360×360px · 제안 24개 중 WebP 3개 필수 · WebP당 650KB·24프레임 이하 · 4회 반복. 아이콘 PNG 78×78px·16KB 이하가 별도로 필요해요. GIF는 검수용이며 최종 WebP는 카카오 공식 WebPAnimator로 변환해야 합니다.', url: 'https://kakaoemoticonstudio.notion.site/animated-emoticon' },
  naver: { checkedAt: '2026-09-24', summary: 'OGQ 애니메이션 스티커 세트: 메인 1개(240×240) · GIF 스티커 24개(740×640) · 탭 1개(96×74). 각 1MB·100프레임 이하이며 첫·마지막 프레임을 같게 준비하세요. 3초는 기존 작업 참고값입니다.', url: 'https://supportogq.zendesk.com/hc/ko-kr/articles/51412318704921' },
  line: { checkedAt: '2026-09-24', summary: '움직이는 스티커는 최대 320×270px APNG, 5~20프레임, 1~4회 반복·전체 4초 이하·각 1MB 이하입니다. 이 스튜디오의 GIF는 미리보기용이며 APNG 변환은 별도로 필요해요.', url: 'https://creator.line.me/en/guideline/animationsticker/' },
  telegram: { checkedAt: '2026-09-24', summary: '정적 스티커는 PNG/WebP이며 한 변이 512px입니다. 움직이는 스티커는 TGS 또는 VP9 WebM 변환이 필요해요. 이 스튜디오의 GIF는 검수용입니다.', url: 'https://core.telegram.org/stickers' },
  custom: { checkedAt: '자유 작업', summary: '500×500 작업 캔버스입니다. 제출 대상 서비스의 조건은 별도로 확인해 주세요.', url: 'https://propig-63524.web.app/admin/emoticon-studio' },
};

function createInitialDraft(initialProjectId?: string): Draft {
  const projectId = initialProjectId || (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `project-${Date.now()}`);
  return {
    version: 3,
    projectId,
    projectName: '새 이모티콘 프로젝트',
    characterName: '',
    characterDescription: '',
    platform: 'kakao',
    presets: structuredClone(DEFAULT_PRESETS),
    selectedSceneIds: ['hello-wave'],
    sourceName: '',
    frameMeta: [],
  };
}

function parseAndNormalizeDraft(rawJson: string): Draft {
  const parsed = JSON.parse(rawJson) as (Partial<Draft> & { version?: number }) | null;
  if (!parsed || typeof parsed.projectId !== 'string' || !parsed.projectId.trim()) throw new Error('invalid project id');
  if (Array.isArray(parsed.frameMeta) && parsed.frameMeta.length > MAX_FRAME_COUNT) throw new Error('원본 프레임이 48개를 넘습니다. 원본을 보존하고 프로젝트를 나눠 주세요.');
  if (Array.isArray(parsed.presets) && parsed.presets.some((preset) => Array.isArray(preset?.frames) && preset.frames.length > 16)) throw new Error('장면별 프레임은 16개까지 지원합니다. 원본 기획을 보존해 주세요.');
  const presets = Array.isArray(parsed.presets) && parsed.presets.length
    ? parsed.presets.flatMap((preset) => {
      if (!preset || typeof preset.id !== 'string' || !preset.id.trim() || typeof preset.title !== 'string' || !Array.isArray(preset.frames)) return [];
      const frames = preset.frames.flatMap((item, index) => {
        if (!item || typeof item.pose !== 'string' || !item.pose.trim()) return [];
        return [{
          id: typeof item.id === 'string' && item.id.trim() ? item.id.slice(0, 120) : `${preset.id}-${index + 1}`,
          pose: item.pose.slice(0, 1200),
          caption: typeof item.caption === 'string' ? item.caption.slice(0, 80) : '',
          durationMs: clamp(Number(item.durationMs) || 160, MIN_FRAME_DURATION_MS, 3000),
          ...(typeof item.imagePrompt === 'string' ? { imagePrompt: item.imagePrompt.slice(0, 4000) } : {}),
        }];
      });
      if (frames.length < 2) return [];
      return [{
        id: preset.id.slice(0, 120),
        title: preset.title.slice(0, 120),
        summary: typeof preset.summary === 'string' ? preset.summary.slice(0, 1200) : '',
        dialogue: typeof preset.dialogue === 'string' ? preset.dialogue.slice(0, 200) : '',
        loopGuide: typeof preset.loopGuide === 'string' ? preset.loopGuide.slice(0, 1200) : '',
        frames,
      } satisfies AnimationPreset];
    })
    : structuredClone(DEFAULT_PRESETS);
  if (!presets.length) presets.push(...structuredClone(DEFAULT_PRESETS));
  const validIds = new Set<SceneId>(presets.map((preset) => preset.id));
  const selectedSceneIds = Array.isArray(parsed.selectedSceneIds)
    ? [...new Set(parsed.selectedSceneIds.filter((id): id is SceneId => typeof id === 'string' && validIds.has(id)))]
    : [];
  return {
    ...createInitialDraft(),
    version: 3,
    projectId: parsed.projectId.slice(0, 120),
    projectName: typeof parsed.projectName === 'string' ? parsed.projectName.slice(0, 80) : '새 이모티콘 프로젝트',
    characterName: typeof parsed.characterName === 'string' ? parsed.characterName.slice(0, 80) : '',
    characterDescription: typeof parsed.characterDescription === 'string' ? parsed.characterDescription.slice(0, 2000) : '',
    platform: typeof parsed.platform === 'string' && parsed.platform in SUBMISSION_PROFILES ? parsed.platform as Platform : 'kakao',
    sourceName: typeof parsed.sourceName === 'string' ? parsed.sourceName.slice(0, 240) : '',
    sourceRevision: typeof parsed.sourceRevision === 'string' ? parsed.sourceRevision.slice(0, 120) : '',
    recentSceneIds: Array.isArray(parsed.recentSceneIds) ? parsed.recentSceneIds.filter((id) => typeof id === 'string' && validIds.has(id)).slice(0, 8) : [],
    presets,
    selectedSceneIds: Array.isArray(parsed.selectedSceneIds) ? selectedSceneIds : [presets[0]?.id || 'hello-wave'],
    frameMeta: Array.isArray(parsed.frameMeta)
      ? parsed.frameMeta.filter((item) => item && typeof item.id === 'string' && item.id.trim()).slice(0, MAX_FRAME_COUNT).map((item) => {
        const sceneId = typeof item.sceneId === 'string' && validIds.has(item.sceneId) ? item.sceneId : null;
        const scene = sceneById(sceneId, presets);
        const storedKeyframeId = typeof item.keyframeId === 'string' ? item.keyframeId.slice(0, 120) : '';
        const stableIndex = scene && storedKeyframeId ? scene.frames.findIndex((frame) => frame.id === storedKeyframeId) : -1;
        const legacyIndex = scene && Number.isInteger(item.keyframeIndex) && Number(item.keyframeIndex) >= 0 && Number(item.keyframeIndex) < scene.frames.length
          ? Number(item.keyframeIndex)
          : null;
        const keyframeIndex = stableIndex >= 0 ? stableIndex : legacyIndex;
        return {
          id: item.id.slice(0, 120),
          sceneId,
          keyframeIndex,
          keyframeId: scene && keyframeIndex !== null ? scene.frames[keyframeIndex].id : null,
          fileName: typeof item.fileName === 'string' ? item.fileName.slice(0, 240) : 'frame.png',
          durationMs: clamp(Number(item.durationMs) || 160, MIN_FRAME_DURATION_MS, 3000),
          caption: typeof item.caption === 'string' ? item.caption.slice(0, 80) : '',
          imageTransform: normalizeTransform(item.imageTransform, DEFAULT_IMAGE_TRANSFORM),
          captionTransform: normalizeTransform(item.captionTransform, DEFAULT_CAPTION_TRANSFORM),
          layers: Array.isArray(item.layers)
            ? item.layers.map(normalizeLayer).filter((layer): layer is FrameLayer => Boolean(layer)).slice(0, 12)
            : [],
        };
      })
      : [],
  };
}

function readDraft(): Draft {
  if (typeof window === 'undefined') return createInitialDraft();
  const raw = window.localStorage.getItem(DRAFT_KEY);
  if (!raw) return createInitialDraft();
  try {
    return parseAndNormalizeDraft(raw);
  } catch {
    try {
      window.localStorage.setItem(`${DRAFT_RECOVERY_PREFIX}${Date.now()}`, raw);
    } catch { /* best-effort recovery backup */ }
    throw new Error('저장된 프로젝트를 읽지 못했습니다. 원본은 유지했습니다. 다시 시도하거나 작업 백업을 불러와 주세요.');
  }
}

function openAssetDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        const store = database.createObjectStore(ASSET_STORE, { keyPath: 'key' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('브라우저 이미지 저장소를 열지 못했습니다.'));
  });
}

async function putAsset(asset: StoredAsset): Promise<void> {
  const database = await openAssetDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(ASSET_STORE, 'readwrite');
    transaction.objectStore(ASSET_STORE).put(asset);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('이미지를 저장하지 못했습니다.'));
  });
  database.close();
}

async function readProjectAssets(projectId: string): Promise<StoredAsset[]> {
  const database = await openAssetDatabase();
  const assets = await new Promise<StoredAsset[]>((resolve, reject) => {
    const transaction = database.transaction(ASSET_STORE, 'readonly');
    const request = transaction.objectStore(ASSET_STORE).index('projectId').getAll(projectId);
    request.onsuccess = () => resolve((request.result || []) as StoredAsset[]);
    request.onerror = () => reject(request.error || new Error('저장된 이미지를 불러오지 못했습니다.'));
  });
  const canonicalByAssetId = new Map(assets.filter((asset) => asset.kind === 'frame' && asset.key === `${projectId}:${asset.assetId}`).map((asset) => [asset.assetId, asset]));
  const legacy = assets.filter((asset) => asset.kind === 'frame' && asset.key === `${projectId}:frame:${asset.assetId}`);
  if (legacy.length) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ASSET_STORE, 'readwrite');
      const store = transaction.objectStore(ASSET_STORE);
      legacy.forEach((asset) => {
        if (!canonicalByAssetId.has(asset.assetId)) {
          const migrated = { ...asset, key: `${projectId}:${asset.assetId}` };
          store.put(migrated);
          canonicalByAssetId.set(asset.assetId, migrated);
        }
        store.delete(asset.key);
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('레거시 이미지 키를 정리하지 못했습니다.'));
    });
  }
  database.close();
  const nonFrameAssets = assets.filter((asset) => asset.kind !== 'frame');
  return [...nonFrameAssets, ...canonicalByAssetId.values()];
}

async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  const database = await openAssetDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(ASSET_STORE, 'readwrite');
    const store = transaction.objectStore(ASSET_STORE);
    store.delete(`${projectId}:${assetId}`);
    store.delete(`${projectId}:frame:${assetId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('이미지를 삭제하지 못했습니다.'));
  });
  database.close();
}

function naturalFileSort(a: File, b: File) {
  return a.name.localeCompare(b.name, 'ko', { numeric: true, sensitivity: 'base' });
}

function sceneById(id: SceneId | null, presets: AnimationPreset[] = DEFAULT_PRESETS) {
  return id ? (presets || DEFAULT_PRESETS).find((preset) => preset.id === id) || null : null;
}

function buildFrameSlots(draft: Draft) {
  return draft.selectedSceneIds.flatMap((sceneId) => {
    const preset = sceneById(sceneId, draft.presets || DEFAULT_PRESETS);
    return preset ? preset.frames.map((keyframe, keyframeIndex) => ({ sceneId, preset, keyframe, keyframeIndex })) : [];
  });
}

type FrameSlot = ReturnType<typeof buildFrameSlots>[number];
function getFrameSlotPatch(slot: FrameSlot | undefined) {
  return slot
    ? { sceneId: slot.sceneId, keyframeIndex: slot.keyframeIndex, keyframeId: slot.keyframe.id, caption: slot.keyframe.caption, durationMs: slot.keyframe.durationMs }
    : { sceneId: null, keyframeIndex: null, keyframeId: null };
}
const frameSlotKey = (sceneId: SceneId, keyframeIndex: number, keyframeId?: string | null) => `${sceneId}:${keyframeId || `legacy-${keyframeIndex}`}`;

function frameLabel(meta: Pick<Draft['frameMeta'][number], 'sceneId' | 'keyframeIndex'>, presets: AnimationPreset[]) {
  const preset = sceneById(meta.sceneId, presets);
  if (!preset) return '미지정 프레임';
  return meta.keyframeIndex === null ? preset.title : `${preset.title} · ${meta.keyframeIndex + 1}/${preset.frames.length}`;
}

function safeArchiveSegment(value: string, fallback = 'asset') {
  const normalized = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '-').replace(/\.\.+/g, '-').trim();
  return (normalized || fallback).slice(0, 80);
}

function stableFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function validateImage(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) return `${file.name}: PNG, JPG, WebP만 가져올 수 있습니다.`;
  if (!file.size || file.size > MAX_SOURCE_BYTES) return `${file.name}: 이미지 한 장은 8MB 이하여야 합니다.`;
  return null;
}

async function validateDecodedImage(file: File): Promise<string | null> {
  const basicError = validateImage(file);
  if (basicError) return basicError;
  try {
    const bitmap = await createImageBitmap(file);
    const pixels = bitmap.width * bitmap.height;
    bitmap.close();
    if (!pixels || pixels > 16_000_000) return `${file.name}: 해상도는 최대 1,600만 픽셀까지 사용할 수 있습니다.`;
    return null;
  } catch {
    return `${file.name}: 파일 확장자와 MIME은 이미지지만 픽셀 데이터를 디코딩할 수 없습니다.`;
  }
}

function buildPromptBundle(draft: Draft): string {
  const selected = draft.selectedSceneIds
    .map((id) => sceneById(id, draft.presets || DEFAULT_PRESETS))
    .filter((preset): preset is AnimationPreset => Boolean(preset));
  const identity = draft.characterDescription.trim() || '첨부한 캐릭터의 얼굴 비율, 색상, 선화, 의상과 고유 특징을 정확히 유지한다.';
  const header = [
    `# ${draft.projectName}`,
    '',
    '## ChatGPT 움짤 프레임 제작 공통 지시',
    '첨부한 캐릭터 이미지를 정체성 기준으로 사용해 주세요.',
    `캐릭터 이름: ${draft.characterName.trim() || '이름 미정'}`,
    `고정할 특징: ${identity}`,
    '목표: 아래 연출을 실제로 움직이는 움짤로 연결할 수 있게 시간 순서의 개별 프레임 이미지로 제작한다.',
    '연속성: 모든 프레임에서 캐릭터 크기, 카메라, 배경, 조명, 선화, 색상, 의상을 고정하고 동작만 단계적으로 변화시킨다.',
    '구도: 캐릭터 전신이 잘리지 않게 중앙 배치하고 발이 닿는 기준선과 카메라 높이를 고정한다.',
    '출력: 한 장짜리 시트가 아니라 프레임마다 독립된 정사각형 이미지로 만들고 아래 파일 순서를 지킨다.',
    '금지: 중간 동작 생략, 갑작스러운 좌우 반전, 신체 구조 변화, 손발 추가, 카메라 점프, 워터마크, 임의 문자.',
    '',
  ];
  const prompts = selected.flatMap((preset, presetIndex) => [
    `## 연출 ${String(presetIndex + 1).padStart(2, '0')}. ${preset.title}`,
    `전체 동작: ${preset.summary}`,
    `대사·감정: ${preset.dialogue || '대사 없음'}`,
    `반복 연결: ${preset.loopGuide}`,
    `총 ${preset.frames.length}프레임을 아래 순서대로 각각 생성해 주세요.`,
    ...preset.frames.flatMap((keyframe, keyframeIndex) => [
      `### ${preset.id}-${String(keyframeIndex + 1).padStart(2, '0')} · ${keyframeIndex + 1}/${preset.frames.length} 프레임`,
      `자세와 움직임: ${keyframe.pose}`,
      ...(keyframe.imagePrompt ? [`이미지 생성 프롬프트: ${keyframe.imagePrompt}`] : []),
      `표시 문구·입 모양: ${keyframe.caption ? `“${keyframe.caption}”에 맞춤` : '문구 없음, 동작에 맞는 자연스러운 입 모양'}`,
      `권장 노출 시간: ${keyframe.durationMs}ms`,
      '직전·다음 프레임 사이에서 관절 위치와 회전 진행량이 자연스럽게 이어져야 합니다.',
      '',
    ]),
  ]);
  return [...header, ...prompts].join('\n');
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('클립보드 복사를 지원하지 않는 브라우저입니다.');
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('이미지 인코딩 실패'));
    reader.onerror = () => reject(reader.error || new Error('이미지 인코딩 실패'));
    reader.readAsDataURL(file);
  });
}

async function convertGifToAnimatedWebp(gif: Blob, authToken: string, signal?: AbortSignal) {
  if (gif.size <= 0 || gif.size > 20 * 1024 * 1024) throw new Error('WebP 변환용 GIF는 20MB 이하여야 합니다.');
  const body = new FormData();
  body.append('file', new File([gif], 'propig-animation.gif', { type: 'image/gif' }));
  body.append('format', 'webp');
  body.append('quality', '90');
  body.append('preserveAnimation', 'true');
  body.append('stripMeta', 'true');
  const response = await fetch('/api/convert-image', {
    method: 'POST',
    headers: { Authorization: ['Bearer', authToken].join(' ') },
    body,
    signal,
  });
  if (!response.ok) throw new Error(`animated WebP 변환 실패 (${response.status})`);
  const blob = await response.blob();
  const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...signature);
  if (blob.type !== 'image/webp' || !text.startsWith('RIFF') || !text.includes('WEBP')) {
    throw new Error('서버가 올바른 WebP 파일을 반환하지 않았습니다.');
  }
  return {
    blob,
    width: Number(response.headers.get('X-Image-Width')) || 0,
    height: Number(response.headers.get('X-Image-Height')) || 0,
    pages: Number(response.headers.get('X-Image-Pages')) || 1,
    animated: response.headers.get('X-Image-Animated') === 'true',
    loop: Number(response.headers.get('X-Image-Loop')) || 0,
    hasAlpha: response.headers.get('X-Image-Alpha') === 'true',
    delays: (response.headers.get('X-Image-Delays') || '').split(',').filter(Boolean).map(Number),
  };
}

function loadCanvasImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('합성할 이미지를 불러오지 못했습니다.'));
    image.src = url;
  });
}

function drawImageLayer(ctx: CanvasRenderingContext2D, image: HTMLImageElement, transform: LayerTransform, width: number, height: number) {
  const drawWidth = width * (transform.width / 100);
  const drawHeight = drawWidth * (image.naturalHeight / Math.max(1, image.naturalWidth));
  ctx.save();
  ctx.globalAlpha = transform.opacity / 100;
  ctx.translate(width * (transform.x / 100), height * (transform.y / 100));
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawSpeechLayer(ctx: CanvasRenderingContext2D, text: string, transform: LayerTransform, width: number, height: number) {
  const boxWidth = width * (transform.width / 100);
  const fontSize = clamp(width * 0.055, 15, 38);
  const padding = fontSize * 0.55;
  ctx.save();
  ctx.font = `900 ${fontSize}px sans-serif`;
  const lines: string[] = [];
  let current = '';
  for (const character of text || '말풍선') {
    if (ctx.measureText(current + character).width > boxWidth - padding * 2 && current) {
      lines.push(current);
      current = character;
    } else current += character;
  }
  if (current) lines.push(current);
  const lineHeight = fontSize * 1.2;
  const boxHeight = Math.max(fontSize + padding * 1.2, lines.length * lineHeight + padding * 1.25);
  ctx.globalAlpha = transform.opacity / 100;
  ctx.translate(width * (transform.x / 100), height * (transform.y / 100));
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = Math.max(3, width * 0.008);
  ctx.beginPath();
  ctx.roundRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, boxHeight / 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-boxWidth * 0.24, boxHeight / 2 - 2);
  ctx.lineTo(-boxWidth * 0.12, boxHeight / 2 + fontSize * 0.52);
  ctx.lineTo(-boxWidth * 0.03, boxHeight / 2 - 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, index) => ctx.fillText(line, 0, (index - (lines.length - 1) / 2) * lineHeight));
  ctx.restore();
}

async function renderComposedFrame(frameItem: StudioFrame, profile: { width: number; height: number }, layerUrls: Record<string, string>) {
  const canvas = document.createElement('canvas');
  canvas.width = profile.width;
  canvas.height = profile.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('브라우저 합성 캔버스를 만들지 못했습니다.');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawImageLayer(ctx, await loadCanvasImage(frameItem.url), frameItem.imageTransform, canvas.width, canvas.height);
  if (frameItem.caption) drawSpeechLayer(ctx, frameItem.caption, frameItem.captionTransform, canvas.width, canvas.height);
  for (const layer of frameItem.layers) {
    if (!layer.visible) continue;
    if (layer.type === 'speech') drawSpeechLayer(ctx, layer.text || '말풍선', layer.transform, canvas.width, canvas.height);
    else if (layer.assetId && layerUrls[layer.assetId]) drawImageLayer(ctx, await loadCanvasImage(layerUrls[layer.assetId]), layer.transform, canvas.width, canvas.height);
  }
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('합성 이미지를 만들지 못했습니다.')), type));
}

function deriveCanvas(source: HTMLCanvasElement, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('파생 제출 이미지를 만들 수 없습니다.');
  context.clearRect(0, 0, width, height);
  const scale = Math.min(width / source.width, height / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas;
}

async function pngBlobToCanvas(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('합성 PNG를 GIF 프레임으로 복원하지 못했습니다.');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

type AbortableZipBuilder = {
  file: (path: string, data: Blob | ArrayBuffer | string) => void;
  generateAsync: () => Promise<Blob>;
  cancel: () => void;
};

async function createAbortableZipBuilder(signal: AbortSignal, onProgress?: (percent: number) => void): Promise<AbortableZipBuilder> {
  const abortError = () => new DOMException('ZIP 압축을 취소했습니다.', 'AbortError');
  if (typeof Worker === 'undefined') {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    return {
      file(path, data) { zip.file(path, data); },
      async generateAsync() {
        if (signal.aborted) throw abortError();
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (metadata) => onProgress?.(metadata.percent));
        if (signal.aborted) throw abortError();
        return blob;
      },
      cancel() { /* JSZip fallback cannot be terminated; result is discarded after abort. */ },
    };
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL('./zip-builder.worker.ts', import.meta.url), { type: 'module', name: 'propig-zip-builder' });
  } catch {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    return {
      file(path, data) { zip.file(path, data); },
      async generateAsync() {
        if (signal.aborted) throw abortError();
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (metadata) => onProgress?.(metadata.percent));
        if (signal.aborted) throw abortError();
        return blob;
      },
      cancel() {},
    };
  }

  let closed = false;
  let nextId = 1;
  let pendingAddResolve: (() => void) | null = null;
  let pendingAddReject: ((error: Error) => void) | null = null;
  let generateResolve: ((blob: Blob) => void) | null = null;
  let generateReject: ((error: Error) => void) | null = null;
  let queue = Promise.resolve();

  const terminate = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', abort);
    worker.terminate();
  };
  const fail = (error: Error) => {
    pendingAddReject?.(error);
    generateReject?.(error);
    pendingAddResolve = null;
    pendingAddReject = null;
    generateResolve = null;
    generateReject = null;
    terminate();
  };
  const abort = () => fail(abortError());
  signal.addEventListener('abort', abort, { once: true });
  worker.onerror = () => fail(new Error('ZIP Worker를 시작하지 못했습니다.'));
  worker.onmessage = (event: MessageEvent<{ type: string; id?: number; percent?: number; bytes?: ArrayBuffer; message?: string }>) => {
    if (event.data.type === 'added') {
      pendingAddResolve?.();
      pendingAddResolve = null;
      pendingAddReject = null;
      return;
    }
    if (event.data.type === 'progress') {
      onProgress?.(event.data.percent || 0);
      return;
    }
    if (event.data.type === 'complete' && event.data.bytes) {
      generateResolve?.(new Blob([event.data.bytes], { type: 'application/zip' }));
      generateResolve = null;
      generateReject = null;
      terminate();
      return;
    }
    fail(new Error(event.data.message || 'ZIP Worker 압축에 실패했습니다.'));
  };

  return {
    file(path, data) {
      queue = queue.then(async () => {
        if (signal.aborted || closed) throw abortError();
        const id = nextId++;
        const payload = typeof data === 'string' ? data : data instanceof Blob ? await data.arrayBuffer() : data;
        await new Promise<void>((resolve, reject) => {
          pendingAddResolve = resolve;
          pendingAddReject = reject;
          if (typeof payload === 'string') worker.postMessage({ type: 'add', id, path, data: payload });
          else worker.postMessage({ type: 'add', id, path, data: payload }, [payload]);
        });
      });
    },
    async generateAsync() {
      await queue;
      if (signal.aborted || closed) throw abortError();
      return new Promise<Blob>((resolve, reject) => {
        generateResolve = resolve;
        generateReject = reject;
        worker.postMessage({ type: 'generate', compressionLevel: 6 });
      });
    },
    cancel: abort,
  };
}

type GifStreamEncoder = {
  addCanvas: (canvas: HTMLCanvasElement, durationMs: number) => Promise<void>;
  finish: () => Promise<Blob>;
  cancel: () => void;
};

type GifStreamOptions = {
  signal?: AbortSignal;
  repeat?: number;
  total: number;
  onProgress?: (completed: number, total: number) => void;
};

async function createFallbackGifStream(options: GifStreamOptions): Promise<GifStreamEncoder> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const gif = GIFEncoder();
  let completed = 0;
  let cancelled = false;
  const assertActive = () => {
    if (cancelled || options.signal?.aborted) throw new DOMException('GIF 인코딩을 취소했습니다.', 'AbortError');
  };
  return {
    async addCanvas(canvas, durationMs) {
      assertActive();
      const data = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
      const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true });
      const indexed = applyPalette(data, palette, 'rgba4444');
      const transparentIndex = palette.findIndex((color) => (color[3] ?? 255) === 0);
      const hasTransparency = transparentIndex >= 0;
      gif.writeFrame(indexed, canvas.width, canvas.height, { palette, transparent: hasTransparency, transparentIndex, delay: Math.max(20, durationMs || 100), repeat: options.repeat ?? 0, dispose: hasTransparency ? 2 : 0 });
      completed += 1;
      options.onProgress?.(completed, options.total);
      if (completed % 4 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
    async finish() {
      assertActive();
      gif.finish();
      const bytes = gif.bytes();
      return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/gif' });
    },
    cancel() { cancelled = true; },
  };
}

async function createGifStreamEncoder(options: GifStreamOptions): Promise<GifStreamEncoder> {
  if (typeof Worker === 'undefined') return createFallbackGifStream(options);
  let worker: Worker;
  try {
    worker = new Worker(new URL('./gif-encoder.worker.ts', import.meta.url), { type: 'module', name: 'propig-gif-encoder' });
  } catch {
    return createFallbackGifStream(options);
  }

  let frameResolve: (() => void) | null = null;
  let frameReject: ((error: Error) => void) | null = null;
  let finishResolve: ((blob: Blob) => void) | null = null;
  let finishReject: ((error: Error) => void) | null = null;
  let fatalError: Error | null = null;
  let closed = false;

  const terminate = () => {
    if (closed) return;
    closed = true;
    options.signal?.removeEventListener('abort', abort);
    worker.terminate();
  };
  const fail = (error: Error) => {
    fatalError = error;
    frameReject?.(error);
    finishReject?.(error);
    frameResolve = null;
    frameReject = null;
    finishResolve = null;
    finishReject = null;
    terminate();
  };
  const abort = () => fail(new DOMException('GIF 인코딩을 취소했습니다.', 'AbortError'));
  if (options.signal?.aborted) {
    abort();
    throw fatalError;
  }
  options.signal?.addEventListener('abort', abort, { once: true });

  const ready = new Promise<void>((resolve, reject) => {
    const readyTimeout = window.setTimeout(() => reject(new Error('GIF Worker 시작 시간이 초과되었습니다.')), 5000);
    worker.onerror = () => {
      window.clearTimeout(readyTimeout);
      reject(new Error('GIF Worker를 시작하지 못했습니다.'));
    };
    worker.onmessage = (event: MessageEvent<{ type: string; completed?: number; total?: number; bytes?: ArrayBuffer; message?: string }>) => {
      if (event.data.type === 'ready') {
        window.clearTimeout(readyTimeout);
        resolve();
        return;
      }
      if (event.data.type === 'frame-ack') {
        options.onProgress?.(event.data.completed || 0, event.data.total || options.total);
        frameResolve?.();
        frameResolve = null;
        frameReject = null;
        return;
      }
      if (event.data.type === 'complete' && event.data.bytes) {
        finishResolve?.(new Blob([event.data.bytes], { type: 'image/gif' }));
        finishResolve = null;
        finishReject = null;
        terminate();
        return;
      }
      fail(new Error(event.data.message || 'GIF Worker 인코딩에 실패했습니다.'));
    };
    worker.postMessage({ type: 'start', repeat: options.repeat ?? 0, total: options.total });
  });

  try {
    await ready;
  } catch {
    terminate();
    return createFallbackGifStream(options);
  }

  return {
    addCanvas(canvas, durationMs) {
      if (fatalError) return Promise.reject(fatalError);
      if (frameResolve) return Promise.reject(new Error('이전 GIF 프레임 ACK를 기다리는 중입니다.'));
      const imageData = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
      const rgba = imageData.data.buffer as ArrayBuffer;
      return new Promise<void>((resolve, reject) => {
        frameResolve = resolve;
        frameReject = reject;
        worker.postMessage({ type: 'frame', rgba, width: canvas.width, height: canvas.height, durationMs }, [rgba]);
      });
    },
    finish() {
      if (fatalError) return Promise.reject(fatalError);
      return new Promise<Blob>((resolve, reject) => {
        finishResolve = resolve;
        finishReject = reject;
        worker.postMessage({ type: 'finish' });
      });
    },
    cancel: abort,
  };
}

function importedPresetToAnimationPreset(plan: EmoticonAnimationPresetPlan): AnimationPreset {
  const id = `ai-${crypto.randomUUID()}`;
  return {
    id,
    title: plan.name,
    summary: plan.summary,
    dialogue: plan.dialogue,
    loopGuide: plan.loopGuide,
    frames: [...plan.frames].sort((a, b) => a.order - b.order).map((item, index) => ({
      id: `${id}-${index + 1}`,
      pose: [
        `${item.phase}: ${item.pose}`,
        item.expression ? `표정 ${item.expression}` : '',
        item.bodyDirection ? `몸·시선 ${item.bodyDirection}` : '',
        item.rotationDegrees ? `누적 회전 ${item.rotationDegrees}도` : '',
        item.limbPositions ? `팔다리 ${item.limbPositions}` : '',
        item.effects ? `효과 ${item.effects}` : '',
        item.continuityNotes ? `연결 ${item.continuityNotes}` : '',
      ].filter(Boolean).join(' · '),
      caption: item.dialogue,
      durationMs: item.durationMs,
      imagePrompt: item.imagePrompt,
    })),
  };
}

export default function SemiAutoEmoticonStudio() {
  const { currentUser } = useAuth();
  const [draft, setDraft] = useState<Draft>(() => createInitialDraft('initial-project'));
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<StepId>('character');
  const [sourceUrl, setSourceUrl] = useState('');
  const [frames, setFrames] = useState<StudioFrame[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<LayerSelection>('base');
  const [inspectorTab, setInspectorTab] = useState<'frame' | 'layers'>('frame');
  const [layerAssetUrls, setLayerAssetUrls] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [savedDraftJson, setSavedDraftJson] = useState('');
  const [saveError, setSaveError] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [assetReady, setAssetReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [gifPreviewUrl, setGifPreviewUrl] = useState('');
  const [gifPreviewBlob, setGifPreviewBlob] = useState<Blob | null>(null);
  const [webpPreviewBlob, setWebpPreviewBlob] = useState<Blob | null>(null);
  const [webpEncoding, setWebpEncoding] = useState(false);
  const [previewEncoding, setPreviewEncoding] = useState(false);
  const [gifEncodingProgress, setGifEncodingProgress] = useState('');
  const [editingPreset, setEditingPreset] = useState<AnimationPreset | null>(null);
  const [aiToolOpen, setAiToolOpen] = useState(false);
  const [actionDescription, setActionDescription] = useState('');
  const [plannerFrameCount, setPlannerFrameCount] = useState(8);
  const [plannerFps, setPlannerFps] = useState(8);
  const [plannerLoop, setPlannerLoop] = useState(true);
  const [plannerDialogue, setPlannerDialogue] = useState('');
  const [planningJson, setPlanningJson] = useState('');
  const [apiConsent, setApiConsent] = useState(false);
  const [acceptedConsentFingerprint, setAcceptedConsentFingerprint] = useState('');
  const [operations, setOperations] = useState<StudioOperation[]>([]);
  const [journalError, setJournalError] = useState('');
  const [journalReady, setJournalReady] = useState(false);
  const [recoveringOperations, setRecoveringOperations] = useState(false);
  const [modelRefresh, setModelRefresh] = useState(0);
  const [imageBudget, setImageBudget] = useState<{ limitUsd: number; spentUsd: number; reservedUsd: number; remainingUsd: number } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [, setGenerationStates] = useState<ApiGenerationState[]>([]);
  const [aiModels, setAiModels] = useState({ text: '관리자 설정 모델', image: 'openai/gpt-image-2' });
  const [imageModelPreflight, setImageModelPreflight] = useState<ImageModelPreflight>({ catalogStatus: 'loading', checkedAt: '', models: [] });
  const [canvasZoom, setCanvasZoom] = useState(100);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [generationBatchSize, setGenerationBatchSize] = useState(4);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('quality');
  const [generationProvider, setGenerationProvider] = useState<GenerationProvider>('auto');
  const [productionMethod, setProductionMethod] = useState<'manual' | 'ai'>('manual');
  const [sceneQuery, setSceneQuery] = useState('');
  const [recentOnly, setRecentOnly] = useState(false);
  const [slotFilter, setSlotFilter] = useState<'all' | 'missing' | 'failed'>('all');
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
  const [bulkDuration, setBulkDuration] = useState(140);
  const [reviewSceneId, setReviewSceneId] = useState('all');
  const [importing, setImporting] = useState(false);
  const assetMutationRef = useRef(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [storageConflict, setStorageConflict] = useState(false);
  const storageConflictRef = useRef(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const navigationRef = useRef('');
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [archivedProjects, setArchivedProjects] = useState<Draft[]>([]);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationRunRef = useRef('');
  const planningAbortRef = useRef<AbortController | null>(null);
  const planningRunRef = useRef('');
  const gifAbortRef = useRef<AbortController | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const webpAbortRef = useRef<AbortController | null>(null);
  const previewRevisionRef = useRef('');
  const operationsRef = useRef<StudioOperation[]>([]);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const studioRootRef = useRef<HTMLElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const frameInputRef = useRef<HTMLInputElement>(null);
  const importSlotRef = useRef<FrameSlot | null>(null);
  const openFramePicker = (slot?: FrameSlot) => { importSlotRef.current = slot || null; frameInputRef.current?.click(); };
  const layerInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const draftRef = useRef(draft);
  const framesRef = useRef(frames);
  const frameAssetCacheRef = useRef(new Map<string, { file: File; url: string }>());
  const undoHistoryRef = useRef<Draft['frameMeta'][]>([]);
  const redoHistoryRef = useRef<Draft['frameMeta'][]>([]);
  const lastHistoryAtRef = useRef(0);
  const consentFingerprintRef = useRef('');
  const dragRef = useRef<{ target: LayerSelection; pointerId: number; startX: number; startY: number; originX: number; originY: number; lastX: number; lastY: number; canvasSize: number; element: HTMLElement; overlay: HTMLElement | null } | null>(null);
  const transformHandleRef = useRef<{ mode: 'resize' | 'rotate'; target: LayerSelection; pointerId: number; centerX: number; centerY: number; originWidth: number; startDistance: number; latestWidth: number; latestRotation: number; element: HTMLElement | null; overlay: HTMLElement | null } | null>(null);
  const transformHandleCleanupRef = useRef<(() => void) | null>(null);
  const dragAnimationRef = useRef<number | null>(null);

  const registerObjectUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const runAssetMutation = async (action: () => Promise<void>) => {
    if (storageConflictRef.current || assetMutationRef.current || generating || planning || exporting || recoveringOperations) return toast('진행 중인 작업이 끝난 뒤 파일을 가져와 주세요.');
    assetMutationRef.current = true;
    setImporting(true);
    try { await action(); }
    catch (error) { toast.error(error instanceof Error ? error.message : '파일을 처리하지 못했습니다. 기존 작업은 유지됩니다.'); }
    finally { assetMutationRef.current = false; setImporting(false); }
  };

  useEffect(() => {
    if (draftLoaded) return;
    try {
      const restored = readDraft();
      draftRef.current = restored;
      setDraft(restored);
      setDraftLoaded(true);
      setRecoveryError('');
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : '저장소를 읽지 못했습니다. 원본은 유지됩니다.');
    }
    setHydrated(true);
  }, [draftLoaded, recoveryAttempt]);

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => {
    setJournalReady(false);
    setJournalError('');
    operationsRef.current = [];
    setOperations([]);
    if (!currentUser || !draftLoaded) return;
    try {
      const records = readStudioOperations(currentUser.uid, draft.projectId);
      operationsRef.current = records;
      setOperations(records);
      setJournalReady(true);
    } catch {
      setJournalError('AI 작업 기록을 읽지 못했습니다. 중복 요청을 막기 위해 새 생성을 멈췄습니다. 저장소를 확인한 뒤 다시 시도해 주세요.');
    }
  }, [currentUser, draft.projectId, draftLoaded, recoveryAttempt]);

  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(ARCHIVES_KEY) || '[]');
      if (Array.isArray(raw)) setArchivedProjects(raw.map((item) => parseAndNormalizeDraft(JSON.stringify(item))));
    } catch { setSaveError('이전 프로젝트 목록을 읽지 못했습니다. 현재 작업과 원본은 보존됩니다.'); }
  }, []);
  useEffect(() => {
    framesRef.current = frames;
    frames.forEach((frame) => frameAssetCacheRef.current.set(frame.id, { file: frame.file, url: frame.url }));
  }, [frames]);

  useEffect(() => {
    if (!hydrated || !draftLoaded) return;
    let active = true;
    setAssetReady(false);
    setRecoveryError('');
    readProjectAssets(draft.projectId)
      .then((assets) => {
        if (!active) return;
        const source = assets.find((asset) => asset.kind === 'source');
        if (draftRef.current.sourceName && !source) throw new Error('기준 이미지 원본을 찾지 못했어요. 저장 정보를 보존했습니다.');
        if (source) setSourceUrl(registerObjectUrl(source.blob));
        const assetsById = new Map(assets.filter((asset) => asset.kind === 'frame').map((asset) => [asset.assetId, asset]));
        const nextLayerUrls: Record<string, string> = {};
        assets.filter((asset) => asset.kind === 'layer').forEach((asset) => {
          nextLayerUrls[asset.assetId] = registerObjectUrl(asset.blob);
        });
        const missingLayers = draftRef.current.frameMeta.flatMap((meta) => meta.layers).filter((layer) => layer.type === 'image' && layer.assetId && !nextLayerUrls[layer.assetId]);
        if (missingLayers.length) throw new Error(`추가 이미지 원본 ${missingLayers.length}개를 찾지 못했어요. 저장 정보를 보존했습니다.`);
        const storedFrameIds = new Set(draftRef.current.frameMeta.map((meta) => meta.id));
        const restored = draftRef.current.frameMeta.flatMap((meta) => {
          const asset = assetsById.get(meta.id);
          if (!asset) return [];
          const file = new File([asset.blob], asset.fileName, { type: asset.blob.type || 'image/png' });
          return [{ ...meta, file, fileName: asset.fileName, url: registerObjectUrl(asset.blob) }];
        });
        const recoveredOrphans = assets.filter((asset) => asset.kind === 'frame' && !storedFrameIds.has(asset.assetId)).slice(0, Math.max(0, MAX_FRAME_COUNT - restored.length)).map((asset) => {
          const file = new File([asset.blob], asset.fileName, { type: asset.blob.type || 'image/png' });
          const recoveredMeta = asset.frameMeta ? parseAndNormalizeDraft(JSON.stringify({ ...draftRef.current, frameMeta: [asset.frameMeta] })).frameMeta[0] : null;
          return { id: asset.assetId, sceneId: null, keyframeIndex: null, keyframeId: null, fileName: asset.fileName, caption: '', durationMs: 500, imageTransform: { ...DEFAULT_IMAGE_TRANSFORM }, captionTransform: { ...DEFAULT_CAPTION_TRANSFORM }, layers: [], ...recoveredMeta, file, url: registerObjectUrl(asset.blob) } satisfies StudioFrame;
        });
        const reconciled = [...restored, ...recoveredOrphans];
        const missingAssetCount = draftRef.current.frameMeta.length - restored.length;
        if (missingAssetCount) throw new Error(`원본 이미지 ${missingAssetCount}개를 찾지 못했습니다. 저장 정보를 보존했습니다. 저장소를 다시 확인하거나 백업 ZIP을 불러와 주세요.`);
        if (recoveredOrphans.length) {
          const reconciledDraft = { ...draftRef.current, frameMeta: frameMetaFromFrames(reconciled) };
          window.localStorage.setItem(DRAFT_KEY, JSON.stringify(reconciledDraft));
          draftRef.current = reconciledDraft;
          setDraft(reconciledDraft);
          toast.warning(`저장소를 정리했습니다. 누락 ${missingAssetCount}개를 제외하고, 미연결 원본 ${recoveredOrphans.length}개를 복구했습니다.`);
        }
        setFrames(reconciled);
        framesRef.current = reconciled;
        setLayerAssetUrls(nextLayerUrls);
        setSelectedFrameId((current) => current || reconciled[0]?.id || null);
        setAssetReady(true);
      })
      .catch((error) => {
        if (active) setRecoveryError(error instanceof Error ? error.message : '브라우저에 저장된 작업 이미지를 복구하지 못했습니다.');
      });
    return () => {
      active = false;
    };
  }, [draft.projectId, draftLoaded, hydrated, recoveryAttempt, registerObjectUrl]);

  useEffect(() => () => {
    planningAbortRef.current?.abort();
    generationAbortRef.current?.abort();
    gifAbortRef.current?.abort();
    exportAbortRef.current?.abort();
    webpAbortRef.current?.abort();
    if (dragAnimationRef.current !== null) cancelAnimationFrame(dragAnimationRef.current);
    transformHandleCleanupRef.current?.();
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    gifAbortRef.current?.abort();
    webpAbortRef.current?.abort();
    setGifPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
        objectUrlsRef.current.delete(current);
      }
      return '';
    });
    setGifPreviewBlob(null);
    setWebpPreviewBlob(null);
  }, [draft.projectId, draft.frameMeta, draft.platform, draft.selectedSceneIds, reviewSceneId]);

  useEffect(() => {
    if (!hydrated || !assetReady || recoveryError || storageConflict) return;
    const handle = window.setTimeout(() => {
      try {
        if (storageConflictRef.current) return;
        const json = JSON.stringify(draft);
        window.localStorage.setItem(DRAFT_KEY, json);
        setSavedDraftJson(json);
        setSavedAt(new Date());
        setSaveError('');
      } catch {
        setSaveError('이 기기에 저장하지 못했어요. 저장 공간을 확인하거나 작업 백업을 받아 주세요.');
        toast.error('프로젝트 설정을 자동 저장하지 못했습니다.');
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [assetReady, draft, hydrated, recoveryError, recoveryAttempt, storageConflict]);

  useEffect(() => {
    if (!hydrated || !assetReady) return;
    const flushDraft = () => {
      if (storageConflictRef.current) return;
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draftRef.current));
      } catch {
        // pagehide에서는 UI 알림을 띄우지 않고 다음 복구 화면에서 처리한다.
      }
    };
    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('visibilitychange', flushDraft);
    return () => {
      flushDraft();
      window.removeEventListener('pagehide', flushDraft);
      document.removeEventListener('visibilitychange', flushDraft);
    };
  }, [assetReady, hydrated]);

  useEffect(() => {
    if (!aiToolOpen && step !== 'import' && step !== 'edit') return;
    if (!currentUser) {
      setImageModelPreflight({ catalogStatus: 'signed-out', checkedAt: '', models: [] });
      setImageBudget(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    setImageModelPreflight({ catalogStatus: 'loading', checkedAt: '', models: [] });
    void currentUser.getIdToken()
      .then((token) => fetch('/api/emoticon-studio/plan', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }))
      .then((response) => {
        if (!response.ok) throw new Error(response.status === 401 ? 'signed-out' : response.status === 403 ? 'forbidden' : 'unavailable');
        return response.json();
      })
      .then((payload: { textModel?: string; imageModel?: string; imageCapabilities?: ImageModelPreflight; budget?: typeof imageBudget } | null) => {
        if (active && payload) {
          setAiModels({ text: payload.textModel || '관리자 설정 모델', image: payload.imageModel || '이미지 지원 모델 자동 선택' });
          setImageModelPreflight(payload.imageCapabilities || { catalogStatus: 'unavailable', checkedAt: '', models: [] });
          setImageBudget(payload.budget || null);
        }
      })
      .catch((error) => {
        if (active) {
          const status = error instanceof Error && (error.message === 'signed-out' || error.message === 'forbidden') ? error.message : 'unavailable';
          setImageModelPreflight({ catalogStatus: status, checkedAt: '', models: [] });
          setImageBudget(null);
        }
      }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [aiToolOpen, currentUser, step, modelRefresh]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DRAFT_KEY || event.newValue === JSON.stringify(draftRef.current)) return;
      storageConflictRef.current = true;
      setStorageConflict(true);
      generationAbortRef.current?.abort();
      planningAbortRef.current?.abort();
    };
    const onViewport = () => setKeyboardOpen(Boolean(window.visualViewport && window.innerHeight - window.visualViewport.height > 160));
    window.addEventListener('storage', onStorage);
    window.visualViewport?.addEventListener('resize', onViewport);
    return () => { window.removeEventListener('storage', onStorage); window.visualViewport?.removeEventListener('resize', onViewport); };
  }, []);

  useEffect(() => {
    const restoreNavigation = () => {
      const params = new URLSearchParams(window.location.search);
      const next = params.get('studioStep');
      if (next && ['character', 'plan', 'import', 'edit', 'export'].includes(next)) setStep(next as StepId);
      setSelectedFrameId(params.get('studioFrame'));
      setReviewSceneId(params.get('studioScene') || 'all');
      navigationRef.current = window.location.search;
      setNavigationReady(true);
    };
    restoreNavigation();
    window.addEventListener('popstate', restoreNavigation);
    return () => window.removeEventListener('popstate', restoreNavigation);
  }, []);

  useEffect(() => {
    if (!navigationReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set('studioStep', step === 'project' ? 'character' : step);
    if (selectedFrameId) url.searchParams.set('studioFrame', selectedFrameId); else url.searchParams.delete('studioFrame');
    if (reviewSceneId !== 'all') url.searchParams.set('studioScene', reviewSceneId); else url.searchParams.delete('studioScene');
    if (navigationRef.current === url.search) return;
    const previous = new URLSearchParams(navigationRef.current).get('studioStep');
    if (previous && previous !== step) window.history.pushState(window.history.state, '', url);
    else window.history.replaceState(window.history.state, '', url);
    navigationRef.current = url.search;
  }, [navigationReady, step, selectedFrameId, reviewSceneId]);

  const promptBundle = useMemo(() => buildPromptBundle(draft), [draft]);
  const expectedSlots = useMemo(() => buildFrameSlots(draft), [draft]);
  const filteredPresets = useMemo(() => draft.presets.filter((preset) => (!recentOnly || draft.recentSceneIds?.includes(preset.id)) && `${preset.title} ${preset.summary} ${preset.dialogue}`.toLocaleLowerCase().includes(sceneQuery.trim().toLocaleLowerCase())), [draft.presets, draft.recentSceneIds, recentOnly, sceneQuery]);
  const frameLimitExceeded = expectedSlots.length > MAX_FRAME_COUNT;
  const saveStatus = storageConflict ? '다른 탭 변경 확인 필요' : recoveryError ? '복구 실패' : !assetReady ? '복구 중…' : saveError ? '저장 실패' : savedDraftJson === JSON.stringify(draft) ? '저장됨' : '저장 중…';
  const occupiedSlotKeys = useMemo(() => new Set(frames.flatMap((frameItem) => frameItem.sceneId !== null && frameItem.keyframeIndex !== null
    ? [frameSlotKey(frameItem.sceneId, frameItem.keyframeIndex, frameItem.keyframeId)]
    : [])), [frames]);
  const missingSlots = useMemo(() => expectedSlots.filter((slot) => !occupiedSlotKeys.has(frameSlotKey(slot.sceneId, slot.keyframeIndex, slot.keyframe.id))), [expectedSlots, occupiedSlotKeys]);
  const reviewFrames = useMemo(() => frames.filter((frameItem) => frameItem.sceneId === null || draft.selectedSceneIds.includes(frameItem.sceneId)), [draft.selectedSceneIds, frames]);
  const previewFrames = useMemo(() => reviewSceneId === 'all' ? reviewFrames : reviewFrames.filter((item) => (item.sceneId || 'unassigned') === reviewSceneId), [reviewFrames, reviewSceneId]);
  const previewRevision = JSON.stringify([draft.projectId, draft.platform, draft.frameMeta, draft.selectedSceneIds, reviewSceneId]);
  previewRevisionRef.current = previewRevision;
  const selectedFrame = frames.find((frame) => frame.id === selectedFrameId) || frames[0] || null;
  const canUndoFrameEdit = historyVersion >= 0 && undoHistoryRef.current.length > 0;
  const canRedoFrameEdit = historyVersion >= 0 && redoHistoryRef.current.length > 0;
  const selectedSlot = selectedFrame && selectedFrame.sceneId !== null && selectedFrame.keyframeIndex !== null
    ? expectedSlots.find((slot) => slot.sceneId === selectedFrame.sceneId && (selectedFrame.keyframeId ? slot.keyframe.id === selectedFrame.keyframeId : slot.keyframeIndex === selectedFrame.keyframeIndex)) || null
    : null;
  const activeRailId = step === 'project' || step === 'character' ? 'prepare' : step === 'plan' ? 'plan' : step === 'import' || step === 'edit' ? 'make' : 'export';

  const canPlan = Boolean(sourceUrl && draft.characterName.trim());
  const canImport = canPlan && draft.selectedSceneIds.length > 0;
  const canEdit = frames.length > 0;
  const completeCount = expectedSlots.length - missingSlots.length;
  const selectedGenerationModel = GENERATION_MODELS[generationProvider][generationMode];
  const selectedModelCapability = imageModelPreflight.models.find((model) => model.id === selectedGenerationModel) || null;
  const modelReady = imageModelPreflight.catalogStatus === 'available' && Boolean(selectedModelCapability?.available && selectedModelCapability.imageOutput && selectedModelCapability.referenceInput);
  const modelStatusLabel = modelReady ? '이 모델로 기준 이미지를 참고해 생성할 수 있어요.' : imageModelPreflight.catalogStatus === 'loading' ? '연결을 확인하고 있어요…' : imageModelPreflight.catalogStatus === 'signed-out' ? '로그인이 필요해요.' : imageModelPreflight.catalogStatus === 'forbidden' ? '이 계정에는 이미지 제작 권한이 없어요.' : imageModelPreflight.catalogStatus === 'not-configured' ? '관리자 API 설정이 필요해요.' : '이 모델의 사용 가능 여부를 확인하지 못했어요. 다른 모델을 선택하거나 다시 확인해 주세요.';
  const sessionCostUsd = operations.reduce((sum, item) => sum + (item.costUsd || 0), 0);
  const unknownCostCount = operations.filter((item) => item.costUsd === null).length;
  const pendingOperations = operations.filter(operationNeedsRecovery);
  const consentFingerprint = JSON.stringify({
    provider: generationProvider,
    mode: generationMode,
    model: selectedGenerationModel,
    batch: generationBatchSize,
    sourceName: draft.sourceName,
    sourceAsset: draft.sourceRevision || draft.sourceName,
    characterDescription: draft.characterDescription,
    selectedSceneIds: draft.selectedSceneIds,
    selectedPresets: draft.presets.filter((preset) => draft.selectedSceneIds.includes(preset.id)),
    actionDescription,
    plannerDialogue,
    plannerFrameCount,
    plannerFps,
    plannerLoop,
    textModel: aiModels.text,
  });
  const currentConsentFingerprint = stableFingerprint(consentFingerprint);
  const hasApiConsent = apiConsent && acceptedConsentFingerprint === currentConsentFingerprint;
  const generationBlockedReason = storageConflict ? '다른 탭의 변경을 먼저 불러와 주세요.' : !assetReady ? '저장한 원본을 먼저 복구해 주세요.' : frameLimitExceeded ? `${expectedSlots.length - MAX_FRAME_COUNT}프레임 초과: 장면을 줄여 주세요.` : !currentUser ? '로그인 후 AI 생성을 사용할 수 있어요.' : !journalReady ? journalError || 'AI 작업 기록을 확인하고 있어요.' : !sourceUrl ? '기준 이미지를 먼저 선택해 주세요.' : !modelReady ? '사용 가능한 모델을 확인해 주세요.' : !missingSlots.length ? '선택한 장면에 빈 프레임이 없어요.' : pendingOperations.some((item) => item.kind === 'image') ? '이전 생성 결과를 먼저 확인해 주세요.' : !hasApiConsent ? '실행 모델·수량과 별도 과금을 확인해 주세요.' : '';
  useEffect(() => {
    if (assetReady && reviewSceneId !== 'all' && !reviewFrames.some((item) => (item.sceneId || 'unassigned') === reviewSceneId)) setReviewSceneId('all');
  }, [assetReady, reviewSceneId, reviewFrames]);

  const submissionProfile = SUBMISSION_PROFILES[draft.platform];
  const officialGuide = OFFICIAL_GUIDES[draft.platform];
  const sceneAnimationStats = frames.reduce((stats, frameItem) => {
    const key = frameItem.sceneId || 'unassigned';
    const current = stats.get(key) || { frameCount: 0, durationMs: 0 };
    stats.set(key, { frameCount: current.frameCount + 1, durationMs: current.durationMs + frameItem.durationMs });
    return stats;
  }, new Map<string, { frameCount: number; durationMs: number }>());
  const maxSceneFrameCount = Math.max(0, ...Array.from(sceneAnimationStats.values(), (stats) => stats.frameCount));
  const maxSceneDurationMs = Math.max(0, ...Array.from(sceneAnimationStats.values(), (stats) => stats.durationMs));
  const platformFrameGuidePass = draft.platform === 'kakao' ? maxSceneFrameCount <= 24 : draft.platform === 'naver' ? maxSceneFrameCount <= 100 && maxSceneDurationMs <= 3000 : true;

  useEffect(() => {
    if (apiConsent && consentFingerprintRef.current && consentFingerprintRef.current !== consentFingerprint) {
      generationAbortRef.current?.abort();
      planningAbortRef.current?.abort();
      setApiConsent(false);
      setAcceptedConsentFingerprint('');
      toast('전송 내용·모델·수량이 바뀌어 OpenRouter 동의를 다시 확인해 주세요.');
    }
    consentFingerprintRef.current = consentFingerprint;
  }, [apiConsent, consentFingerprint]);

  const updateApiConsent = (checked: boolean) => {
    if (!checked) { generationAbortRef.current?.abort(); planningAbortRef.current?.abort(); }
    setApiConsent(checked);
    setAcceptedConsentFingerprint(checked ? currentConsentFingerprint : '');
  };

  useEffect(() => {
    studioRootRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    const handle = requestAnimationFrame(() => studioRootRef.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus());
    return () => cancelAnimationFrame(handle);
  }, [step]);

  useEffect(() => {
    if (!previewing || !selectedFrame || frames.length < 2) return;
    const currentIndex = frames.findIndex((frameItem) => frameItem.id === selectedFrame.id);
    const handle = window.setTimeout(() => {
      setSelectedFrameId(frames[(currentIndex + 1) % frames.length].id);
    }, selectedFrame.durationMs);
    return () => window.clearTimeout(handle);
  }, [frames, previewing, selectedFrame]);

  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const restoreFrameSnapshot = useCallback((snapshot: Draft['frameMeta']) => {
    const restored = snapshot.flatMap((meta) => {
      const live = framesRef.current.find((frame) => frame.id === meta.id);
      const asset = live ? { file: live.file, url: live.url } : frameAssetCacheRef.current.get(meta.id);
      if (!asset) return [];
      void putAsset({ key: `${draftRef.current.projectId}:${meta.id}`, projectId: draftRef.current.projectId, assetId: meta.id, kind: 'frame', blob: asset.file, fileName: asset.file.name, updatedAt: Date.now() }).catch(() => toast.error('되돌린 프레임 원본을 다시 저장하지 못했습니다.'));
      return [{ ...meta, file: asset.file, url: asset.url } satisfies StudioFrame];
    });
    framesRef.current = restored;
    setFrames(restored);
    setDraft((current) => ({ ...current, frameMeta: frameMetaFromFrames(restored) }));
  }, []);

  const updateFrameMeta = useCallback((nextFrames: StudioFrame[], recordHistory = true) => {
    if (recordHistory) {
      const now = Date.now();
      if (now - lastHistoryAtRef.current > 500) {
        undoHistoryRef.current = [...undoHistoryRef.current.slice(-39), structuredClone(frameMetaFromFrames(framesRef.current))];
        redoHistoryRef.current = [];
        setHistoryVersion((value) => value + 1);
      }
      lastHistoryAtRef.current = now;
    }
    framesRef.current = nextFrames;
    setFrames(nextFrames);
    setDraft((current) => ({
      ...current,
      frameMeta: frameMetaFromFrames(nextFrames),
    }));
  }, []);

  const undoFrameEdit = useCallback(() => {
    const previous = undoHistoryRef.current.pop();
    if (!previous) return;
    redoHistoryRef.current.push(structuredClone(frameMetaFromFrames(framesRef.current)));
    lastHistoryAtRef.current = 0;
    restoreFrameSnapshot(previous);
    setHistoryVersion((value) => value + 1);
  }, [restoreFrameSnapshot]);

  const redoFrameEdit = useCallback(() => {
    const next = redoHistoryRef.current.pop();
    if (!next) return;
    undoHistoryRef.current.push(structuredClone(frameMetaFromFrames(framesRef.current)));
    lastHistoryAtRef.current = 0;
    restoreFrameSnapshot(next);
    setHistoryVersion((value) => value + 1);
  }, [restoreFrameSnapshot]);

  useEffect(() => {
    if (step !== 'edit') return;
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redoFrameEdit();
      else undoFrameEdit();
    };
    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [redoFrameEdit, step, undoFrameEdit]);

  const handleSource = async (file: File | undefined) => {
    if (!file) return;
    const validationError = await validateDecodedImage(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    try {
      await putAsset({
        key: `${draft.projectId}:source`,
        projectId: draft.projectId,
        assetId: 'source',
        kind: 'source',
        blob: file,
        fileName: file.name,
        updatedAt: Date.now(),
      });
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
        objectUrlsRef.current.delete(sourceUrl);
      }
      setSourceUrl(registerObjectUrl(file));
      setDraft((current) => ({ ...current, sourceName: file.name, sourceRevision: crypto.randomUUID() }));
      toast.success('캐릭터 기준 이미지를 브라우저에 저장했습니다.');
    } catch {
      toast.error('캐릭터 이미지를 저장하지 못했습니다.');
    }
  };

  const toggleScene = (sceneId: SceneId) => {
    setDraft((current) => {
      const selected = current.selectedSceneIds.includes(sceneId);
      const preset = sceneById(sceneId, current.presets);
      const currentFrames = buildFrameSlots(current).length;
      if (!selected && (!preset || currentFrames + preset.frames.length > MAX_FRAME_COUNT)) {
        toast.error(`선택한 연출의 총 프레임은 최대 ${MAX_FRAME_COUNT}장까지 기획할 수 있습니다.`);
        return current;
      }
      return {
        ...current,
        selectedSceneIds: selected
          ? current.selectedSceneIds.filter((id) => id !== sceneId)
          : [...current.selectedSceneIds, sceneId],
        recentSceneIds: selected ? current.recentSceneIds : [sceneId, ...(current.recentSceneIds || []).filter((id) => id !== sceneId)].slice(0, 8),
      };
    });
  };

  const startNewPreset = () => {
    const id = `custom-${crypto.randomUUID()}`;
    setEditingPreset({
      id,
      title: '새 움짤 연출',
      summary: '',
      dialogue: '',
      loopGuide: '마지막 자세가 첫 자세로 자연스럽게 이어지게 한다.',
      frames: [frame(`${id}-1`, '시작 자세를 구체적으로 설명해 주세요.', '', 160), frame(`${id}-2`, '다음 움직임을 시간 순서대로 설명해 주세요.', '', 160)],
    });
  };

  const savePreset = () => {
    if (!editingPreset) return;
    if (!editingPreset.title.trim() || !editingPreset.summary.trim()) {
      toast.error('연출 이름과 전체 동작 설명을 입력해 주세요.');
      return;
    }
    if (editingPreset.frames.length < 2 || editingPreset.frames.some((item) => !item.pose.trim())) {
      toast.error('연속 동작을 위해 자세가 입력된 프레임이 2장 이상 필요합니다.');
      return;
    }
    const previousPreset = sceneById(editingPreset.id, draft.presets);
    const exists = Boolean(previousPreset);
    const presets = exists
      ? draft.presets.map((preset) => preset.id === editingPreset.id ? structuredClone(editingPreset) : preset)
      : [...draft.presets, structuredClone(editingPreset)];
    const selectedSceneIds = draft.selectedSceneIds.includes(editingPreset.id)
      ? draft.selectedSceneIds
      : [...draft.selectedSceneIds, editingPreset.id];
    const candidate = { ...draft, presets, selectedSceneIds };
    if (buildFrameSlots(candidate).length > MAX_FRAME_COUNT) {
      toast.error(`${buildFrameSlots(candidate).length - MAX_FRAME_COUNT}프레임 초과: 다른 장면 선택을 해제하거나 프레임을 줄여 주세요.`);
      return;
    }

    const reconciledFrames = frames.map((item) => {
      if (item.sceneId !== editingPreset.id || item.keyframeIndex === null) return item;
      const previousKeyframeId = item.keyframeId || previousPreset?.frames[item.keyframeIndex]?.id;
      const nextIndex = previousKeyframeId ? editingPreset.frames.findIndex((keyframe) => keyframe.id === previousKeyframeId) : -1;
      return nextIndex >= 0 ? { ...item, keyframeIndex: nextIndex, keyframeId: editingPreset.frames[nextIndex].id } : { ...item, sceneId: null, keyframeIndex: null, keyframeId: null };
    });
    const nextDraft: Draft = { ...candidate, frameMeta: frameMetaFromFrames(reconciledFrames) };
    setFrames(reconciledFrames);
    setDraft(nextDraft);
    setEditingPreset(null);
    toast.success(previousPreset && reconciledFrames.some((item, index) => item.sceneId !== frames[index]?.sceneId || item.keyframeIndex !== frames[index]?.keyframeIndex)
      ? '프리셋을 저장하고 제거된 키프레임 연결을 안전하게 해제했습니다.'
      : '움짤 연출 프리셋을 저장했습니다.');
  };

  const duplicatePreset = (preset: AnimationPreset) => {
    const id = `custom-${crypto.randomUUID()}`;
    setEditingPreset({
      ...structuredClone(preset),
      id,
      title: `${preset.title} 복사본`,
      frames: preset.frames.map((item, index) => ({ ...item, id: `${id}-${index + 1}` })),
    });
  };

  const deletePreset = (presetId: string) => {
    const preset = sceneById(presetId, draft.presets);
    if (!preset || !window.confirm(`“${preset.title}” 연출 프리셋을 삭제할까요? 가져온 이미지 원본은 유지됩니다.`)) return;
    setDraft((current) => ({
      ...current,
      presets: current.presets.filter((item) => item.id !== presetId),
      selectedSceneIds: current.selectedSceneIds.filter((id) => id !== presetId),
      frameMeta: current.frameMeta.map((meta) => meta.sceneId === presetId ? { ...meta, sceneId: null, keyframeIndex: null, keyframeId: null } : meta),
    }));
    setFrames((current) => current.map((item) => item.sceneId === presetId ? { ...item, sceneId: null, keyframeIndex: null, keyframeId: null } : item));
    toast.success('연출 프리셋을 삭제했습니다.');
  };

  const resetPresets = () => {
    if (!window.confirm('연출 프리셋을 ProPig 기본 구성으로 되돌릴까요? 직접 만든 프리셋의 프레임 원본은 유지하고 연결만 해제합니다.')) return;
    const defaults = structuredClone(DEFAULT_PRESETS);
    const defaultIds = new Set(defaults.map((preset) => preset.id));
    const reconciledFrames = frames.map((item) => {
      if (!item.sceneId || !defaultIds.has(item.sceneId)) return { ...item, sceneId: null, keyframeIndex: null, keyframeId: null };
      const previousPreset = sceneById(item.sceneId, draft.presets);
      const nextPreset = sceneById(item.sceneId, defaults);
      const previousKeyframeId = item.keyframeId || (item.keyframeIndex === null ? null : previousPreset?.frames[item.keyframeIndex]?.id);
      const nextIndex = previousKeyframeId ? nextPreset?.frames.findIndex((keyframe) => keyframe.id === previousKeyframeId) ?? -1 : -1;
      return nextIndex >= 0 ? { ...item, keyframeIndex: nextIndex, keyframeId: nextPreset?.frames[nextIndex].id || null } : { ...item, sceneId: null, keyframeIndex: null, keyframeId: null };
    });
    setFrames(reconciledFrames);
    setDraft((current) => ({ ...current, presets: defaults, selectedSceneIds: ['hello-wave'], frameMeta: frameMetaFromFrames(reconciledFrames) }));
    setEditingPreset(null);
    toast.success('기본 프리셋을 복원하고 유효하지 않은 프레임 연결을 안전하게 해제했습니다.');
  };

  const addPlannedPreset = (plan: EmoticonAnimationPresetPlan, source: 'ChatGPT' | 'OpenRouter') => {
    const preset = importedPresetToAnimationPreset(plan);
    setDraft((current) => {
      const canSelect = buildFrameSlots(current).length + preset.frames.length <= MAX_FRAME_COUNT;
      return {
        ...current,
        presets: [...current.presets, preset],
        selectedSceneIds: canSelect ? [...current.selectedSceneIds, preset.id] : current.selectedSceneIds,
      };
    });
    setEditingPreset(preset);
    setAiToolOpen(false);
    toast.success(`${source} 장면 기획을 새 프리셋으로 가져왔습니다.`);
  };

  const importPlanningJson = () => {
    try {
      addPlannedPreset(parseEmoticonAnimationPresetJson(planningJson), 'ChatGPT');
      setPlanningJson('');
    } catch {
      toast.error('JSON 형식이나 프레임 정보가 올바르지 않습니다. 2~16프레임과 필수 항목을 확인해 주세요.');
    }
  };

  const copyPlanningPrompt = async () => {
    const prompt = [
      '당신은 2D 캐릭터 움짤 장면 연출가입니다.',
      `동작 “${actionDescription || '손을 흔들며 안녕이라고 말하기'}”을 서로 연결되는 ${plannerFrameCount}개의 키프레임으로 분해하세요.`,
      `캐릭터 특징: ${draft.characterDescription || '첨부한 캐릭터 외형을 정확히 유지'}`,
      `FPS: ${plannerFps}, 루프: ${plannerLoop ? '사용' : '사용 안 함'}, 대사: ${plannerDialogue || '없음'}`,
      '프레임마다 자세, 표정, 몸 방향, 누적 회전각, 팔다리 위치, 대사, 효과, 노출 시간, 연결 지시, 영문 이미지 생성 프롬프트를 작성하세요.',
      'JSON 이외의 문장과 markdown code fence를 출력하지 마세요.',
      '{"name":"string","category":"string","summary":"string","dialogue":"string","fps":8,"loop":true,"loopGuide":"string","frames":[{"order":1,"phase":"string","pose":"string","expression":"string","bodyDirection":"string","rotationDegrees":0,"limbPositions":"string","dialogue":"string","effects":"string","durationMs":125,"continuityNotes":"string","imagePrompt":"English prompt, at least 40 characters"}]}',
    ].join('\n');
    try {
      await copyText(prompt);
      toast.success('ChatGPT 장면 기획 프롬프트를 복사했습니다.');
    } catch {
      toast.error('프롬프트 복사에 실패했습니다.');
    }
  };

  const persistOperation = (operation: StudioOperation) => {
    const records = readStudioOperations(operation.ownerId, operation.projectId);
    const next = [...records.filter((item) => item.id !== operation.id), operation];
    writeStudioOperations(operation.ownerId, operation.projectId, next);
    if (currentUserRef.current?.uid === operation.ownerId && draftRef.current.projectId === operation.projectId) {
      operationsRef.current = next;
      setOperations(next);
    }
  };

  const applyGeneratedImage = async (operation: StudioOperation, payload: StudioImageResult, signal?: AbortSignal) => {
    const imageUrl = payload.images?.[0]?.url;
    if (!payload.success || !imageUrl || !operation.slot || !operation.frameId) throw new Error('완료된 이미지 정보를 확인하지 못했습니다. 결과 확인으로 다시 불러와 주세요.');
    const completed: StudioOperation = { ...operation, state: 'completed', costUsd: typeof payload.metadata?.costUsd === 'number' ? payload.metadata.costUsd : null, modelUsed: payload.metadata?.modelUsed || operation.modelUsed };
    persistOperation(completed);
    if (draftRef.current.projectId !== operation.projectId || currentUserRef.current?.uid !== operation.ownerId) return;
    if (storageConflictRef.current) throw new Error('다른 탭의 변경을 먼저 불러온 후 결과를 확인해 주세요.');
    if (framesRef.current.some((item) => item.id === operation.frameId)) {
      const snapshot = { ...draftRef.current, frameMeta: frameMetaFromFrames(framesRef.current) };
      const json = JSON.stringify(snapshot);
      localStorage.setItem(DRAFT_KEY, json);
      setSavedDraftJson(json);
      setSaveError('');
      persistOperation({ ...completed, applied: true });
      return;
    }
    const response = await fetch(imageUrl, { signal });
    if (!response.ok) throw new Error('생성 이미지를 내려받지 못했습니다. 새 생성 없이 결과 확인으로 복구할 수 있어요.');
    const blob = await response.blob();
    const file = new File([blob], `openrouter-${operation.frameId}.png`, { type: blob.type || 'image/png' });
    const validation = await validateDecodedImage(file);
    if (validation) throw new Error(validation);
    if (storageConflictRef.current || signal?.aborted || draftRef.current.projectId !== operation.projectId || currentUserRef.current?.uid !== operation.ownerId) return;
    const current = framesRef.current;
    const sameSource = !operation.sourceRevision || operation.sourceRevision === (draftRef.current.sourceRevision || draftRef.current.sourceName);
    const previous = sameSource && operation.replaceFrameId ? current.find((item) => item.id === operation.replaceFrameId) : undefined;
    if (!previous && current.length >= MAX_FRAME_COUNT) throw new Error('프레임이 48개입니다. 공간을 확보한 후 결과 확인을 눌러 주세요. 생성 결과는 서버에 보관돼요.');
    const slot = sameSource ? buildFrameSlots(draftRef.current).find((item) => item.sceneId === operation.slot?.sceneId && item.keyframe.id === operation.slot.keyframeId) : undefined;
    const occupied = current.some((item) => item.id !== previous?.id && item.sceneId === slot?.sceneId && item.keyframeId === slot?.keyframe.id);
    const generated: StudioFrame = {
      id: operation.frameId, ...getFrameSlotPatch(occupied ? undefined : slot), fileName: file.name,
      durationMs: previous?.durationMs || operation.slot.durationMs, caption: previous?.caption ?? operation.slot.caption,
      imageTransform: previous?.imageTransform || { ...DEFAULT_IMAGE_TRANSFORM }, captionTransform: previous?.captionTransform || { ...DEFAULT_CAPTION_TRANSFORM },
      layers: previous?.layers || [], file, url: registerObjectUrl(file),
    };
    await putAsset({ key: `${operation.projectId}:${operation.frameId}`, projectId: operation.projectId, assetId: operation.frameId, kind: 'frame', blob: file, fileName: file.name, frameMeta: frameMetaFromFrames([generated])[0], updatedAt: Date.now() });
    if (storageConflictRef.current || signal?.aborted || draftRef.current.projectId !== operation.projectId || currentUserRef.current?.uid !== operation.ownerId) return;
    const next = previous ? framesRef.current.map((item) => item.id === previous.id ? generated : item) : [...framesRef.current, generated];
    const snapshot = { ...draftRef.current, frameMeta: frameMetaFromFrames(next) };
    framesRef.current = next;
    draftRef.current = snapshot;
    setFrames(next);
    setDraft(snapshot);
    setSelectedFrameId(generated.id);
    try {
      const json = JSON.stringify(snapshot);
      localStorage.setItem(DRAFT_KEY, json);
      setSavedDraftJson(json);
      setSavedAt(new Date());
      setSaveError('');
    } catch {
      setSaveError('결과 이미지는 보관했지만 편집 정보를 저장하지 못했어요. 작업 백업을 받아 주세요.');
      throw new Error('편집 정보 저장 실패. 생성 결과를 다시 요청하지 말고 결과 확인 또는 백업을 사용해 주세요.');
    }
    persistOperation({ ...completed, applied: true });
    if (previous) await deleteAsset(operation.projectId, previous.id).catch(() => undefined);
  };

  const applyGeneratedPlan = (operation: StudioOperation, payload: { preset?: EmoticonAnimationPresetPlan; costUsd?: number | null; modelUsed?: string; model?: string }) => {
    if (!payload.preset) throw new Error('완료된 기획 결과를 확인하지 못했습니다.');
    const preset = importedPresetToAnimationPreset(parseEmoticonAnimationPresetJson(JSON.stringify(payload.preset)));
    preset.id = `plan-${operation.id}`;
    preset.frames = preset.frames.map((item, index) => ({ ...item, id: `${preset.id}-${index + 1}` }));
    const completed: StudioOperation = { ...operation, state: 'completed', costUsd: typeof payload.costUsd === 'number' ? payload.costUsd : null, modelUsed: payload.modelUsed || payload.model || operation.modelUsed };
    persistOperation(completed);
    if (draftRef.current.projectId !== operation.projectId || currentUserRef.current?.uid !== operation.ownerId) return;
    if (storageConflictRef.current) throw new Error('다른 탭의 변경을 먼저 불러온 후 결과를 확인해 주세요.');
    const current = draftRef.current;
    if (!current.presets.some((item) => item.id === preset.id)) {
      const canSelect = buildFrameSlots(current).length + preset.frames.length <= MAX_FRAME_COUNT;
      const next = { ...current, presets: [...current.presets, preset], selectedSceneIds: canSelect ? [...current.selectedSceneIds, preset.id] : current.selectedSceneIds };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      draftRef.current = next;
      setDraft(next);
      setEditingPreset(preset);
    }
    persistOperation({ ...completed, applied: true });
    setAiToolOpen(false);
  };

  const recoverOperationResults = async () => {
    if (storageConflict || importing || assetMutationRef.current || generating || planning || !currentUser || recoveringOperations || !journalReady || !assetReady) return;
    const ownerId = currentUser.uid;
    const projectId = draft.projectId;
    setRecoveringOperations(true);
    try {
      await withStudioOperationLock(ownerId, projectId, async () => {
        const token = await currentUser.getIdToken();
        for (const operation of readStudioOperations(ownerId, projectId).filter(operationNeedsRecovery)) {
          if (draftRef.current.projectId !== projectId || currentUserRef.current?.uid !== ownerId) break;
          const path = operation.kind === 'image' ? '/api/generate-image' : '/api/emoticon-studio/plan';
          const response = await fetch(`${path}?operationId=${encodeURIComponent(operation.id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
          const payload = await response.json() as StudioOperationResult<StudioImageResult & { preset?: EmoticonAnimationPresetPlan; costUsd?: number | null; modelUsed?: string }>;
          if (!response.ok || !payload.success) throw new Error(payload.error || '작업 결과를 확인하지 못했습니다. 새 생성 없이 다시 확인해 주세요.');
          if (payload.status === 'completed' && payload.result) {
            if (operation.kind === 'image') await applyGeneratedImage(operation, payload.result);
            else applyGeneratedPlan(operation, payload.result);
          } else {
            persistOperation({ ...operation, state: payload.status === 'failed' ? 'failed' : payload.status === 'pending' ? 'pending' : 'uncertain', message: payload.status === 'failed' ? '실패가 확인됐어요. 새로 생성할 수 있습니다.' : '이미 전송한 작업을 확인 중입니다. 추가 과금 없이 다시 확인해 주세요.' });
          }
        }
      });
      toast('작업 결과를 확인했습니다. 확인 중인 항목은 새 요청을 보내지 않습니다.');
    } catch (error) { toast.error(error instanceof Error ? error.message : '작업 결과 확인에 실패했습니다.'); }
    finally { setRecoveringOperations(false); setModelRefresh((value) => value + 1); }
  };

  const requestOpenRouterPlan = async () => {
    if (storageConflict || !assetReady || importing || !currentUser || !hasApiConsent || !journalReady || planning || !actionDescription.trim()) return;
    const ownerId = currentUser.uid;
    const runProjectId = draft.projectId;
    const runId = crypto.randomUUID();
    const controller = new AbortController();
    planningAbortRef.current = controller;
    planningRunRef.current = runId;
    setPlanning(true);
    let operation: StudioOperation | null = null;
    try {
      await withStudioOperationLock(ownerId, runProjectId, async () => {
        if (storageConflictRef.current) throw new Error('다른 탭의 변경을 먼저 불러와 주세요.');
        if (readStudioOperations(ownerId, runProjectId).some((item) => item.kind === 'plan' && operationNeedsRecovery(item))) throw new Error('이전 기획의 결과를 먼저 확인해 주세요. 새 유료 요청은 보내지 않았습니다.');
        const token = await currentUser.getIdToken();
        if (controller.signal.aborted || storageConflictRef.current || draftRef.current.projectId !== runProjectId || currentUserRef.current?.uid !== ownerId) return;
        const operationId = crypto.randomUUID();
        operation = { id: operationId, ownerId, projectId: runProjectId, kind: 'plan', state: 'submitted', applied: false, costUsd: null, modelUsed: aiModels.text, createdAt: Date.now() };
        persistOperation(operation);
        const response = await fetch('/api/emoticon-studio/plan', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal: controller.signal,
          body: JSON.stringify({ operationId, consentFingerprint: currentConsentFingerprint, actionDescription, characterDescription: draft.characterDescription, frameCount: plannerFrameCount, fps: plannerFps, loop: plannerLoop, dialogue: plannerDialogue }),
        });
        const payload = await response.json() as { success?: boolean; preset?: EmoticonAnimationPresetPlan; error?: string; costUsd?: number | null; modelUsed?: string; requestSubmitted?: boolean };
        if (!response.ok || !payload.success) { if (payload.requestSubmitted === false) persistOperation({ ...operation, state: 'failed', costUsd: 0, message: payload.error || '요청이 전송되지 않았어요.' }); throw new Error(payload.error || '기획 결과를 확인하지 못했습니다.'); }
        applyGeneratedPlan(operation, payload);
        toast.success('AI 기획을 장면 목록에 저장했습니다.');
      });
    } catch (error) {
      if (operation) {
        const submitted = operation as StudioOperation;
        try { const saved = readStudioOperations(ownerId, runProjectId).find((item) => item.id === submitted.id) || submitted; persistOperation({ ...saved, state: saved.state === 'completed' || saved.state === 'failed' ? saved.state : 'uncertain', message: saved.state === 'failed' ? saved.message : '기획 결과 확인이 필요합니다.' }); } catch { setJournalError('AI 작업 기록 저장에 실패했습니다. 새 생성 없이 저장소를 먼저 확인해 주세요.'); }
      }
      toast.error(error instanceof Error && error.name !== 'AbortError' ? error.message : '추가 기획을 중지했습니다. 이미 전송한 작업은 결과 확인으로 복구해 주세요.');
    } finally {
      if (planningRunRef.current === runId) { setPlanning(false); planningAbortRef.current = null; }
      setModelRefresh((value) => value + 1);
    }
  };

  const generateFramesWithOpenRouter = async (requestedSlots?: FrameSlot[], replaceFrameId?: string) => {
    if (storageConflict || importing || !currentUser || !assetReady || !hasApiConsent || !journalReady || !modelReady || frameLimitExceeded || generating) return;
    if (!sourceUrl) return toast.error('기준 이미지를 먼저 선택해 주세요.');
    const slots = (requestedSlots || missingSlots.slice(0, generationBatchSize)).slice(0, 8);
    if (!slots.length) return;
    const ownerId = currentUser.uid;
    const runProjectId = draft.projectId;
    const runId = crypto.randomUUID();
    generationRunRef.current = runId;
    const controller = new AbortController();
    generationAbortRef.current = controller;
    setGenerating(true);
    setGenerationStates(slots.map((slot) => ({ label: `${slot.preset.title} · ${slot.keyframeIndex + 1}/${slot.preset.frames.length}`, status: 'queued' })));
    try {
      await withStudioOperationLock(ownerId, runProjectId, async () => {
        if (storageConflictRef.current) throw new Error('다른 탭의 변경을 먼저 불러와 주세요.');
        const sourceAsset = (await readProjectAssets(runProjectId)).find((asset) => asset.kind === 'source');
        if (!sourceAsset) throw new Error('캐릭터 기준 이미지를 다시 선택해 주세요.');
        const [token, referenceImage] = await Promise.all([currentUser.getIdToken(), fileToDataUrl(sourceAsset.blob)]);
        for (const [index, slot] of slots.entries()) {
          if (controller.signal.aborted || draftRef.current.projectId !== runProjectId || currentUserRef.current?.uid !== ownerId) break;
          const persisted = parseAndNormalizeDraft(localStorage.getItem(DRAFT_KEY) || '{}');
          if (persisted.projectId !== runProjectId || storageConflictRef.current) throw new Error('다른 탭의 프로젝트를 먼저 불러와 주세요.');
          if (!replaceFrameId && persisted.frameMeta.some((item) => item.sceneId === slot.sceneId && item.keyframeId === slot.keyframe.id)) throw new Error('이 프레임은 이미 다른 작업에서 완료됐어요. 최신 프로젝트를 불러와 주세요.');
          const existing = readStudioOperations(ownerId, runProjectId).find((item) => operationMatchesSlot(item, slot.sceneId, slot.keyframe.id));
          if (existing) throw new Error('이 프레임의 이전 결과를 먼저 확인해 주세요. 새 유료 요청은 보내지 않았습니다.');
          const operationId = crypto.randomUUID();
          const operation: StudioOperation = { id: operationId, ownerId, projectId: runProjectId, kind: 'image', sourceRevision: draftRef.current.sourceRevision || draftRef.current.sourceName, state: 'submitted', applied: false, costUsd: null, modelUsed: selectedGenerationModel, createdAt: Date.now(), frameId: crypto.randomUUID(), ...(replaceFrameId ? { replaceFrameId } : {}), slot: { sceneId: slot.sceneId, keyframeId: slot.keyframe.id, keyframeIndex: slot.keyframeIndex, caption: slot.keyframe.caption, durationMs: slot.keyframe.durationMs } };
          persistOperation(operation);
          setGenerationProgress(`${index + 1}/${slots.length} · ${slot.preset.title}`);
          setGenerationStates((current) => current.map((item, position) => position === index ? { ...item, status: 'generating' } : item));
          const prompt = slot.keyframe.imagePrompt || [
            `Create one polished square 2D character animation frame for ${slot.preset.title}.`,
            `Exact pose and motion: ${slot.keyframe.pose}.`,
            `Character identity: ${draft.characterDescription || 'preserve the supplied character reference exactly'}.`,
            'Preserve the reference face, proportions, costume, palette, line art, camera, scale, ground line and background.',
            'Full body, centered, simple background, no readable text, no watermark, no extra limbs, no collage.',
          ].join(' ');
          try {
            const response = await fetch('/api/generate-image', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal: controller.signal,
              body: JSON.stringify({ operationId, prompt, negativePrompt: 'different character, changed costume, extra limbs, cropped body, camera jump, readable text, watermark, collage', aspectRatio: '1:1', referenceImages: [{ role: 'character', image: referenceImage }], numberOfImages: 1, resourceMode: generationMode === 'fast' ? 'balanced' : 'premium', provider: 'openrouter', model: selectedGenerationModel, strictModel: true, quality: generationMode === 'fast' ? 'low' : 'high' }),
            });
            const payload = await response.json() as StudioImageResult;
            if (!response.ok || !payload.success) { if (payload.requestSubmitted === false) persistOperation({ ...operation, state: 'failed', costUsd: 0, message: payload.error || '요청이 전송되지 않았어요.' }); throw new Error(payload.error || '이미지 결과를 확인하지 못했습니다.'); }
            await applyGeneratedImage(operation, payload, controller.signal);
            setGenerationStates((current) => current.map((item, position) => position === index ? { ...item, status: 'completed' } : item));
          } catch (error) {
            const saved = readStudioOperations(ownerId, runProjectId).find((item) => item.id === operation.id) || operation;
            persistOperation({ ...saved, state: saved.state === 'completed' || saved.state === 'failed' ? saved.state : 'uncertain', message: '전송한 작업의 결과 확인이 필요합니다.' });
            setGenerationStates((current) => current.map((item, position) => position === index ? { ...item, status: controller.signal.aborted ? 'cancelled' : 'failed' } : item));
            throw error;
          }
        }
        if (!controller.signal.aborted) toast.success('완료된 이미지를 프레임 보드에 저장했습니다.');
      });
    } catch (error) {
      toast.error(error instanceof Error && error.name !== 'AbortError' ? error.message : '추가 생성을 중지했습니다. 이미 전송한 작업은 결과 확인으로 복구해 주세요.');
    } finally {
      if (generationRunRef.current === runId) {
        setGenerating(false);
        setGenerationProgress('');
        generationAbortRef.current = null;
      }
      setModelRefresh((value) => value + 1);
    }
  };

  const copyPrompts = async () => {
    try {
      await copyText(promptBundle);
      toast.success(`${draft.selectedSceneIds.length}개 연출 · ${expectedSlots.length}프레임 지시서를 복사했습니다.`);
    } catch {
      toast.error('프롬프트 복사에 실패했습니다. TXT로 내려받아 주세요.');
    }
  };

  const downloadPrompts = () => {
    downloadBlob(new Blob([promptBundle], { type: 'text/plain;charset=utf-8' }), `${draft.projectName || 'propig-emoticon'}-prompts.txt`);
  };

  const importFrames = async (files: File[]) => {
    const available = MAX_FRAME_COUNT - frames.length;
    if (available <= 0) {
      toast.error(`결과 이미지는 최대 ${MAX_FRAME_COUNT}장까지 가져올 수 있습니다.`);
      return;
    }
    const sorted = [...files].sort(naturalFileSort);
    const validations = await Promise.all(sorted.map(validateDecodedImage));
    const errors = validations.filter((error): error is string => Boolean(error));
    const accepted = sorted.filter((_, index) => !validations[index]).slice(0, available);
    if (errors.length) toast.error(errors[0]);
    if (!accepted.length) return;
    const preferred = importSlotRef.current;
    importSlotRef.current = null;
    const orderedSlots = preferred && missingSlots.some((item) => item.sceneId === preferred.sceneId && item.keyframe.id === preferred.keyframe.id) ? [preferred, ...missingSlots.filter((item) => item.sceneId !== preferred.sceneId || item.keyframe.id !== preferred.keyframe.id)] : missingSlots;
    const newFrames: StudioFrame[] = [];
    try {
      for (const [index, file] of accepted.entries()) {
        const id = crypto.randomUUID();
        const slot = orderedSlots[index];
        const sceneId = slot?.sceneId || null;
        await putAsset({
          key: `${draft.projectId}:${id}`,
          projectId: draft.projectId,
          assetId: id,
          kind: 'frame',
          blob: file,
          fileName: file.name,
          updatedAt: Date.now(),
        });
        newFrames.push({
          id,
          sceneId,
          keyframeIndex: slot?.keyframeIndex ?? null,
          keyframeId: slot?.keyframe.id ?? null,
          fileName: file.name,
          durationMs: slot?.keyframe.durationMs || 140,
          caption: slot?.keyframe.caption || '',
          imageTransform: { ...DEFAULT_IMAGE_TRANSFORM },
          captionTransform: { ...DEFAULT_CAPTION_TRANSFORM },
          layers: [],
          file,
          url: registerObjectUrl(file),
        });
      }
      const next = [...framesRef.current, ...newFrames];
      updateFrameMeta(next, false);
      setSelectedFrameId(newFrames[0]?.id || selectedFrameId);
      toast.success(`${newFrames.length}개 결과 이미지를 순서대로 가져왔습니다.`);
    } catch {
      if (newFrames.length) {
        const next = [...framesRef.current, ...newFrames];
        updateFrameMeta(next, false);
        setSelectedFrameId(newFrames[0].id);
        toast.warning(`${newFrames.length}개는 안전하게 유지했고, 나머지는 저장하지 못했습니다.`);
      } else {
        toast.error('이미지를 브라우저 저장소에 보관하지 못했습니다.');
      }
    }
  };

  const removeFrame = async (frameId: string) => {
    const target = frames.find((frame) => frame.id === frameId);
    if (!target) return;
    if (!window.confirm(`“${target.fileName}” 프레임을 제거할까요? 원본과 이 프레임의 추가 레이어가 브라우저 저장소에서 삭제됩니다.`)) return;
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setHistoryVersion((value) => value + 1);
    const next = frames.filter((frame) => frame.id !== frameId);
    const snapshot: Draft = { ...draftRef.current, frameMeta: frameMetaFromFrames(next) };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
    draftRef.current = snapshot;
    framesRef.current = next;
    setDraft(snapshot);
    setFrames(next);
    await deleteAsset(snapshot.projectId, frameId).catch(() => undefined);
    frameAssetCacheRef.current.delete(frameId);
    await Promise.all(target.layers.flatMap((layer) => layer.assetId ? [deleteAsset(snapshot.projectId, layer.assetId).catch(() => undefined)] : []));
    setLayerAssetUrls((current) => {
      const next = { ...current };
      target.layers.forEach((layer) => {
        if (!layer.assetId || !next[layer.assetId]) return;
        URL.revokeObjectURL(next[layer.assetId]);
        objectUrlsRef.current.delete(next[layer.assetId]);
        delete next[layer.assetId];
      });
      return next;
    });
    URL.revokeObjectURL(target.url);
    objectUrlsRef.current.delete(target.url);
    setSelectedFrameId(next[0]?.id || null);
    if (!next.length) setStep('import');
    toast.success('프레임을 제거했습니다.');
  };

  const moveFrame = (frameId: string, direction: -1 | 1) => {
    const index = frames.findIndex((frame) => frame.id === frameId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= frames.length) return;
    const next = [...frames];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    updateFrameMeta(next);
  };

  const updateSelectedFrame = (patch: Partial<Pick<StudioFrame, 'durationMs' | 'caption' | 'sceneId' | 'keyframeIndex' | 'keyframeId' | 'imageTransform' | 'captionTransform' | 'layers'>>, recordHistory = true) => {
    if (!selectedFrame) return;
    updateFrameMeta(frames.map((frame) => frame.id === selectedFrame.id ? { ...frame, ...patch } : frame), recordHistory);
  };

  const selectedCustomLayer = selectedFrame?.layers.find((layer) => layer.id === selectedLayerId) || null;
  const selectedTransform = selectedFrame
    ? selectedLayerId === 'base'
      ? selectedFrame.imageTransform
      : selectedLayerId === 'caption'
        ? selectedFrame.captionTransform
        : selectedCustomLayer?.transform || null
    : null;
  const transformLocked = Boolean(selectedCustomLayer?.locked);

  const applyTransformToTarget = (target: LayerSelection, patch: Partial<LayerTransform>) => {
    const currentFrame = framesRef.current.find((frameItem) => frameItem.id === selectedFrameId);
    if (!currentFrame) return;
    if (target === 'base') {
      const next = normalizeTransform({ ...currentFrame.imageTransform, ...patch }, currentFrame.imageTransform);
      updateFrameMeta(framesRef.current.map((frameItem) => frameItem.id === currentFrame.id ? { ...frameItem, imageTransform: next } : frameItem));
      return;
    }
    if (target === 'caption') {
      const next = normalizeTransform({ ...currentFrame.captionTransform, ...patch }, currentFrame.captionTransform);
      updateFrameMeta(framesRef.current.map((frameItem) => frameItem.id === currentFrame.id ? { ...frameItem, captionTransform: next } : frameItem));
      return;
    }
    const layer = currentFrame.layers.find((item) => item.id === target);
    if (!layer || layer.locked) return;
    const next = normalizeTransform({ ...layer.transform, ...patch }, layer.transform);
    updateFrameMeta(framesRef.current.map((frameItem) => frameItem.id === currentFrame.id ? { ...frameItem, layers: currentFrame.layers.map((item) => item.id === target ? { ...item, transform: next } : item) } : frameItem));
  };

  const updateSelectedTransform = (patch: Partial<LayerTransform>) => {
    if (!selectedFrame || !selectedTransform || selectedCustomLayer?.locked) return;
    applyTransformToTarget(selectedLayerId, patch);
  };

  const handleLayerKeyDown = (event: ReactKeyboardEvent<HTMLElement>, target: LayerSelection, transform: LayerTransform, locked = false) => {
    if (locked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const amount = event.shiftKey ? 5 : 1;
    setSelectedLayerId(target);
    applyTransformToTarget(target, {
      x: snapCanvasValue(transform.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0)),
      y: snapCanvasValue(transform.y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0)),
    });
  };

  const beginTransformHandle = (event: ReactPointerEvent<HTMLButtonElement>, mode: 'resize' | 'rotate') => {
    if (!selectedTransform || transformLocked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const canvas = event.currentTarget.closest('[data-composite-canvas]')?.getBoundingClientRect();
    if (!canvas) return;
    const centerX = canvas.left + (selectedTransform.x / 100) * canvas.width;
    const centerY = canvas.top + (selectedTransform.y / 100) * canvas.height;
    const overlay = event.currentTarget.closest<HTMLElement>('[data-transform-overlay]');
    const element = event.currentTarget.closest<HTMLElement>('[data-composite-canvas]')?.querySelector<HTMLElement>(`[data-layer-id="${String(selectedLayerId)}"]`) || null;
    transformHandleRef.current = {
      mode,
      target: selectedLayerId,
      pointerId: event.pointerId,
      centerX,
      centerY,
      originWidth: selectedTransform.width,
      startDistance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
      latestWidth: selectedTransform.width,
      latestRotation: selectedTransform.rotation,
      element,
      overlay,
    };
    transformHandleCleanupRef.current?.();
    const move = (pointerEvent: PointerEvent) => continueTransformHandleAt(pointerEvent.pointerId, pointerEvent.clientX, pointerEvent.clientY);
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== transformHandleRef.current?.pointerId) return;
      endTransformHandle();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    transformHandleCleanupRef.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  };

  const continueTransformHandleAt = (pointerId: number, clientX: number, clientY: number) => {
    const handle = transformHandleRef.current;
    if (!handle || handle.pointerId !== pointerId) return;
    if (handle.mode === 'resize') {
      const distance = Math.max(1, Math.hypot(clientX - handle.centerX, clientY - handle.centerY));
      const rawWidth = clamp(handle.originWidth * (distance / handle.startDistance), 8, 160);
      const width = Math.abs(rawWidth % 5) < 1.25 ? Math.round(rawWidth / 5) * 5 : Math.round(rawWidth * 2) / 2;
      handle.latestWidth = width;
      if (handle.element) handle.element.style.width = `${width}%`;
      if (handle.overlay) handle.overlay.style.width = `${width}%`;
    } else {
      const degrees = Math.atan2(clientY - handle.centerY, clientX - handle.centerX) * 180 / Math.PI + 90;
      const normalized = ((degrees + 180) % 360 + 360) % 360 - 180;
      const rotation = Math.abs(normalized % 15) < 2 ? Math.round(normalized / 15) * 15 : Math.round(normalized);
      handle.latestRotation = rotation;
      const transform = `translate(-50%,-50%) rotate(${rotation}deg)`;
      if (handle.element) handle.element.style.transform = transform;
      if (handle.overlay) handle.overlay.style.transform = transform;
    }
  };

  const endTransformHandle = () => {
    const handle = transformHandleRef.current;
    transformHandleCleanupRef.current?.();
    transformHandleCleanupRef.current = null;
    transformHandleRef.current = null;
    if (!handle) return;
    if (handle.mode === 'resize') applyTransformToTarget(handle.target, { width: handle.latestWidth });
    else applyTransformToTarget(handle.target, { rotation: handle.latestRotation });
  };

  const addSpeechLayer = () => {
    if (!selectedFrame || selectedFrame.layers.length >= 12) return;
    const id = crypto.randomUUID();
    const layer: FrameLayer = {
      id,
      type: 'speech',
      name: `말풍선 ${selectedFrame.layers.filter((item) => item.type === 'speech').length + 1}`,
      text: '새 말풍선',
      visible: true,
      locked: false,
      transform: { x: 50, y: 20, width: 52, rotation: 0, opacity: 100 },
    };
    updateSelectedFrame({ layers: [...selectedFrame.layers, layer] });
    setSelectedLayerId(id);
    setInspectorTab('layers');
  };

  const addImageLayer = async (file: File | undefined) => {
    if (!selectedFrame || !file) return;
    const validationError = await validateDecodedImage(file);
    if (validationError) return void toast.error(validationError);
    if (selectedFrame.layers.length >= 12) return void toast.error('한 프레임에는 추가 레이어를 최대 12개까지 사용할 수 있어요.');
    const id = crypto.randomUUID();
    const assetId = `layer-${id}`;
    try {
      await putAsset({ key: `${draft.projectId}:${assetId}`, projectId: draft.projectId, assetId, kind: 'layer', blob: file, fileName: file.name, updatedAt: Date.now() });
      const url = registerObjectUrl(file);
      setLayerAssetUrls((current) => ({ ...current, [assetId]: url }));
      updateSelectedFrame({ layers: [...selectedFrame.layers, { id, type: 'image', name: file.name.slice(0, 40), assetId, visible: true, locked: false, transform: { x: 72, y: 66, width: 30, rotation: 0, opacity: 100 } }] });
      setSelectedLayerId(id);
      setInspectorTab('layers');
      toast.success('다른 사진을 새 레이어로 추가했습니다.');
    } catch {
      toast.error('레이어 이미지를 저장하지 못했습니다.');
    }
  };

  const removeSelectedLayer = async () => {
    if (!selectedFrame || !selectedCustomLayer) return;
    if (selectedCustomLayer.locked) return toast.error('잠긴 레이어는 잠금을 해제한 뒤 삭제할 수 있습니다.');
    const assetUsedElsewhere = selectedCustomLayer.assetId
      ? frames.some((frameItem) => frameItem.layers.some((layer) => layer.id !== selectedCustomLayer.id && layer.assetId === selectedCustomLayer.assetId))
      : false;
    if (selectedCustomLayer.assetId && !assetUsedElsewhere) {
      await deleteAsset(draft.projectId, selectedCustomLayer.assetId).catch(() => undefined);
      const url = layerAssetUrls[selectedCustomLayer.assetId];
      if (url) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
        setLayerAssetUrls((current) => { const next = { ...current }; delete next[selectedCustomLayer.assetId!]; return next; });
      }
    }
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setHistoryVersion((value) => value + 1);
    updateSelectedFrame({ layers: selectedFrame.layers.filter((layer) => layer.id !== selectedCustomLayer.id) }, false);
    setSelectedLayerId('base');
  };

  const duplicateSelectedLayer = () => {
    if (!selectedFrame || !selectedCustomLayer || selectedFrame.layers.length >= 12) return;
    if (selectedCustomLayer.locked) return toast.error('잠긴 레이어는 잠금을 해제한 뒤 복제할 수 있습니다.');
    const clone: FrameLayer = { ...structuredClone(selectedCustomLayer), id: crypto.randomUUID(), name: `${selectedCustomLayer.name} 복사`, transform: { ...selectedCustomLayer.transform, x: clamp(selectedCustomLayer.transform.x + 4, 0, 100), y: clamp(selectedCustomLayer.transform.y + 4, 0, 100) } };
    updateSelectedFrame({ layers: [...selectedFrame.layers, clone] });
    setSelectedLayerId(clone.id);
  };

  const moveSelectedLayer = (direction: -1 | 1) => {
    if (!selectedFrame || !selectedCustomLayer) return;
    if (selectedCustomLayer.locked) return toast.error('잠긴 레이어는 잠금을 해제한 뒤 순서를 바꿀 수 있습니다.');
    const index = selectedFrame.layers.findIndex((layer) => layer.id === selectedCustomLayer.id);
    const target = index + direction;
    if (target < 0 || target >= selectedFrame.layers.length) return;
    const next = [...selectedFrame.layers];
    [next[index], next[target]] = [next[target], next[index]];
    updateSelectedFrame({ layers: next });
  };

  const beginLayerDrag = (event: ReactPointerEvent<HTMLElement>, target: LayerSelection, transform: LayerTransform, locked = false) => {
    if (locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const canvasElement = event.currentTarget.closest<HTMLElement>('[data-composite-canvas]');
    const canvas = canvasElement?.getBoundingClientRect();
    dragRef.current = {
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
      lastX: transform.x,
      lastY: transform.y,
      canvasSize: canvas?.width || 360,
      element: event.currentTarget,
      overlay: canvasElement?.querySelector<HTMLElement>('[data-transform-overlay]') || null,
    };
    setSelectedLayerId(target);
    setInspectorTab('layers');
  };

  const continueLayerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = snapCanvasValue(drag.originX + ((event.clientX - drag.startX) / drag.canvasSize) * 100);
    const y = snapCanvasValue(drag.originY + ((event.clientY - drag.startY) / drag.canvasSize) * 100);
    drag.lastX = x;
    drag.lastY = y;
    if (dragAnimationRef.current !== null) cancelAnimationFrame(dragAnimationRef.current);
    dragAnimationRef.current = requestAnimationFrame(() => {
      dragAnimationRef.current = null;
      drag.element.style.left = `${drag.lastX}%`;
      drag.element.style.top = `${drag.lastY}%`;
      if (drag.overlay) {
        drag.overlay.style.left = `${drag.lastX}%`;
        drag.overlay.style.top = `${drag.lastY}%`;
      }
    });
  };

  const endLayerDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (dragAnimationRef.current !== null) {
      cancelAnimationFrame(dragAnimationRef.current);
      dragAnimationRef.current = null;
    }
    if (!drag) return;
    applyTransformToTarget(drag.target, { x: drag.lastX, y: drag.lastY });
  };

  const createGifPreview = async () => {
    if (!previewFrames.length || previewEncoding) return;
    const revision = previewRevisionRef.current;
    setPreviewEncoding(true);
    const controller = new AbortController();
    gifAbortRef.current = controller;
    setGifEncodingProgress('합성 프레임 준비 중…');
    let stream: GifStreamEncoder | null = null;
    try {
      stream = await createGifStreamEncoder({
        signal: controller.signal,
        total: previewFrames.length,
        onProgress: (completed, total) => setGifEncodingProgress(`프레임 처리 ${completed}/${total}`),
      });
      for (const frameItem of previewFrames) {
        if (controller.signal.aborted) throw new DOMException('GIF 인코딩을 취소했습니다.', 'AbortError');
        const canvas = await renderComposedFrame(frameItem, submissionProfile, layerAssetUrls);
        try {
          await stream.addCanvas(canvas, frameItem.durationMs);
        } finally {
          canvas.width = 1;
          canvas.height = 1;
        }
      }
      const blob = await stream.finish();
      stream = null;
      if (controller.signal.aborted || revision !== previewRevisionRef.current) throw new DOMException('편집 내용이 변경됐습니다.', 'AbortError');
      if (gifPreviewUrl) {
        URL.revokeObjectURL(gifPreviewUrl);
        objectUrlsRef.current.delete(gifPreviewUrl);
      }
      const url = registerObjectUrl(blob);
      setGifPreviewBlob(blob);
      setGifPreviewUrl(url);
      toast.success('프레임을 한 장씩 처리한 실제 GIF 미리보기를 만들었습니다.');
    } catch (error) {
      stream?.cancel();
      if (error instanceof DOMException && error.name === 'AbortError') toast('GIF 인코딩을 취소했습니다.');
      else toast.error('GIF 미리보기를 만들지 못했습니다. 프레임 이미지를 다시 확인해 주세요.');
    } finally {
      if (gifAbortRef.current === controller) {
        gifAbortRef.current = null;
        setGifEncodingProgress('');
        setPreviewEncoding(false);
      }
    }
  };

  const createWebpPreview = async () => {
    if (!gifPreviewBlob || webpEncoding) return;
    if (!currentUser) return toast.error('animated WebP 자동 변환은 로그인 후 사용할 수 있습니다.');
    const revision = previewRevisionRef.current;
    const controller = new AbortController();
    webpAbortRef.current = controller;
    setWebpEncoding(true);
    try {
      const token = await currentUser.getIdToken();
      const result = await convertGifToAnimatedWebp(gifPreviewBlob, token, controller.signal);
      if (previewFrames.length > 1 && (!result.animated || result.pages !== previewFrames.length)) {
        throw new Error(`WebP 프레임 검증 실패 (${result.pages}/${previewFrames.length})`);
      }
      if (controller.signal.aborted || revision !== previewRevisionRef.current) return;
      setWebpPreviewBlob(result.blob);
      toast.success(`animated WebP ${result.pages}프레임 · ${result.width}×${result.height}px 변환을 완료했습니다.`);
    } catch (error) {
      if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : 'WebP 변환에 실패했습니다.');
    } finally {
      if (webpAbortRef.current === controller) { webpAbortRef.current = null; setWebpEncoding(false); }
    }
  };

  const exportProject = async () => {
    if (!frames.length) {
      toast.error('내보낼 결과 이미지를 먼저 가져와 주세요.');
      return;
    }
    setExporting(true);
    const controller = new AbortController();
    const compositePngs: Blob[] = [];
    let activeGifStream: GifStreamEncoder | null = null;
    let activeZipBuilder: AbortableZipBuilder | null = null;
    exportAbortRef.current = controller;
    try {
      const exportFrames = reviewFrames;
      const excludedCount = frames.length - exportFrames.length;
      if (!exportFrames.length) throw new Error('선택된 장면에 내보낼 프레임이 없습니다.');
      activeZipBuilder = await createAbortableZipBuilder(controller.signal, (percent) => setGifEncodingProgress(`ZIP 압축 ${Math.round(percent)}%`));
      const zip = activeZipBuilder;
      const validationFiles: Array<{ path: string; bytes: number; limitBytes: number | null; pass: boolean }> = [];
      const safeName = safeArchiveSegment(draft.projectName || 'propig-emoticon', 'propig-emoticon');
      const webpToken = draft.platform === 'kakao' && currentUser ? await currentUser.getIdToken().catch(() => null) : null;
      let animatedWebpGeneratedCount = 0;
      let sceneWebpGeneratedCount = 0;
      let animatedWebpWarning = '';
      const projectAssets = await readProjectAssets(draft.projectId);
      if (sourceUrl) {
        const sourceAsset = projectAssets.find((asset) => asset.kind === 'source');
        if (sourceAsset) zip.file(`source/${safeArchiveSegment(sourceAsset.fileName, 'character.png')}`, sourceAsset.blob);
      }
      projectAssets.filter((asset) => asset.kind === 'layer').forEach((asset) => zip.file(`layers/${safeArchiveSegment(asset.assetId)}-${safeArchiveSegment(asset.fileName)}`, asset.blob));
      exportFrames.forEach((frame, index) => {
        const extension = frame.file.type === 'image/jpeg' ? 'jpg' : frame.file.type === 'image/webp' ? 'webp' : 'png';
        const scene = sceneById(frame.sceneId, draft.presets);
        const label = safeArchiveSegment(scene?.title || `frame-${index + 1}`);
        zip.file(`frames/${String(index + 1).padStart(2, '0')}-${label}.${extension}`, frame.file);
      });
      const animationGroups = new Map<string, number[]>();
      exportFrames.forEach((frameItem, index) => {
        const key = frameItem.sceneId || 'unassigned';
        animationGroups.set(key, [...(animationGroups.get(key) || []), index]);
      });
      const previewPath = `submission/${draft.platform}/${safeName}-preview.gif`;
      const expectedSubmissionLoop = draft.platform === 'kakao' ? 4 : 0;
      // gifenc counts repeats after the first playback; decoded metadata counts total loops.
      const gifRepeat = draft.platform === 'kakao' ? expectedSubmissionLoop - 1 : 0;
      activeGifStream = await createGifStreamEncoder({ signal: controller.signal, repeat: gifRepeat, total: exportFrames.length });
      for (const [index, frameItem] of exportFrames.entries()) {
        if (controller.signal.aborted) throw new DOMException('내보내기를 취소했습니다.', 'AbortError');
        const canvas = await renderComposedFrame(frameItem, submissionProfile, layerAssetUrls);
        try {
          const path = `submission/${draft.platform}/frame-${String(index + 1).padStart(2, '0')}.png`;
          const png = await canvasToBlob(canvas);
          compositePngs.push(png);
          zip.file(path, png);
          const limitBytes = draft.platform === 'naver' ? 1024 * 1024 : null;
          validationFiles.push({ path, bytes: png.size, limitBytes, pass: limitBytes === null || png.size <= limitBytes });
          await activeGifStream.addCanvas(canvas, frameItem.durationMs);
          if (draft.platform === 'naver' && index === 0) {
            for (const [derivedPath, width, height] of [['submission/naver/main-240x240.png', 240, 240], ['submission/naver/tab-96x74.png', 96, 74]] as const) {
              const derived = deriveCanvas(canvas, width, height);
              const blob = await canvasToBlob(derived);
              zip.file(derivedPath, blob);
              validationFiles.push({ path: derivedPath, bytes: blob.size, limitBytes: 1024 * 1024, pass: blob.size <= 1024 * 1024 });
              derived.width = 1;
              derived.height = 1;
            }
          }
        } finally {
          canvas.width = 1;
          canvas.height = 1;
        }
        if ((index + 1) % 4 === 0) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      const previewGif = await activeGifStream.finish();
      activeGifStream = null;
      zip.file(previewPath, previewGif);
      validationFiles.push({ path: previewPath, bytes: previewGif.size, limitBytes: null, pass: true });
      if (draft.platform === 'kakao' && webpToken) {
        try {
          const converted = await convertGifToAnimatedWebp(previewGif, webpToken, controller.signal);
          if (exportFrames.length > 1 && (!converted.animated || converted.pages !== exportFrames.length)) throw new Error(`preview WebP 프레임 불일치 ${converted.pages}/${exportFrames.length}`);
          if (converted.loop !== expectedSubmissionLoop) throw new Error(`preview WebP 반복 불일치 ${converted.loop}/${expectedSubmissionLoop}`);
          const path = `submission/kakao/${safeName}-preview.webp`;
          zip.file(path, converted.blob);
          validationFiles.push({ path, bytes: converted.blob.size, limitBytes: null, pass: true });
          animatedWebpGeneratedCount += 1;
        } catch (error) {
          animatedWebpWarning = error instanceof Error ? error.message : 'preview animated WebP 변환 실패';
        }
      }
      for (const [groupIndex, [sceneId, indexes]] of Array.from(animationGroups.entries()).entries()) {
        const title = sceneById(sceneId === 'unassigned' ? null : sceneId, draft.presets)?.title || sceneId;
        const safeTitle = safeArchiveSegment(title, sceneId).slice(0, 60);
        const uniqueName = `${String(groupIndex + 1).padStart(2, '0')}-${safeTitle}-${safeArchiveSegment(sceneId, 'scene').slice(0, 36)}`;
        const path = `submission/${draft.platform}/animations/${uniqueName}.gif`;
        activeGifStream = await createGifStreamEncoder({ signal: controller.signal, repeat: gifRepeat, total: indexes.length });
        for (const index of indexes) {
          const canvas = await pngBlobToCanvas(compositePngs[index]);
          try {
            await activeGifStream.addCanvas(canvas, exportFrames[index].durationMs);
          } finally {
            canvas.width = 1;
            canvas.height = 1;
          }
        }
        const sceneGif = await activeGifStream.finish();
        activeGifStream = null;
        zip.file(path, sceneGif);
        const limitBytes = draft.platform === 'naver' ? 1024 * 1024 : null;
        validationFiles.push({ path, bytes: sceneGif.size, limitBytes, pass: limitBytes === null || sceneGif.size <= limitBytes });
        if (draft.platform === 'kakao' && webpToken && groupIndex < 3) {
          try {
            const converted = await convertGifToAnimatedWebp(sceneGif, webpToken, controller.signal);
            if (indexes.length > 1 && (!converted.animated || converted.pages !== indexes.length)) throw new Error(`장면 WebP 프레임 불일치 ${converted.pages}/${indexes.length}`);
            if (converted.loop !== expectedSubmissionLoop) throw new Error(`장면 WebP 반복 불일치 ${converted.loop}/${expectedSubmissionLoop}`);
            const webpPath = `submission/kakao/animations/${uniqueName}.webp`;
            zip.file(webpPath, converted.blob);
            validationFiles.push({ path: webpPath, bytes: converted.blob.size, limitBytes: null, pass: true });
            animatedWebpGeneratedCount += 1;
            sceneWebpGeneratedCount += 1;
          } catch (error) {
            animatedWebpWarning ||= error instanceof Error ? error.message : '장면 animated WebP 변환 실패';
          }
        }
      }
      if (draft.platform === 'kakao') {
        const status = animatedWebpGeneratedCount
          ? `Studio 서버가 ${animatedWebpGeneratedCount}개의 animated WebP를 자동 생성하고 프레임 수를 확인했습니다.`
          : `자동 변환을 수행하지 못했습니다${animatedWebpWarning ? `: ${animatedWebpWarning}` : webpToken ? '.' : ': 로그인 세션이 없습니다.'}`;
        zip.file('submission/kakao/README-WEBP-CONVERSION.txt', `${status}\n제품 검사는 참고값이며 심사 통과를 보장하지 않습니다. 제출 직전 카카오 공식 가이드와 WebPAnimator로 프레임 수·반복·용량을 다시 확인하세요.`);
      }
      const packageChecks = [
        { id: 'source-present', pass: Boolean(draft.sourceName) },
        { id: 'selected-scenes-present', pass: draft.selectedSceneIds.length > 0 },
        { id: 'planned-slots-complete', pass: expectedSlots.length > 0 && missingSlots.length === 0 },
        { id: 'platform-frame-guide', pass: platformFrameGuidePass },
        { id: 'file-size-reference-checks', pass: validationFiles.every((item) => item.pass) },
        { id: 'official-required-item-count', pass: (draft.platform !== 'kakao' && draft.platform !== 'naver') || animationGroups.size === 24 },
        { id: 'kakao-decoded-webp-set', pass: draft.platform !== 'kakao' || sceneWebpGeneratedCount === 3 },
        { id: 'naver-main-tab-set', pass: draft.platform !== 'naver' || validationFiles.some((item) => item.path === 'submission/naver/main-240x240.png') && validationFiles.some((item) => item.path === 'submission/naver/tab-96x74.png') },
      ];
      const allPassed = packageChecks.every((item) => item.pass);
      const failedReferenceCount = validationFiles.filter((item) => !item.pass).length
        + packageChecks.filter((item) => !item.pass && item.id !== 'file-size-reference-checks').length;
      zip.file('submission/validation.json', JSON.stringify({ checkedAt: new Date().toISOString(), platform: draft.platform, expectedLoop: expectedSubmissionLoop, animatedWebpGeneratedCount, sceneWebpGeneratedCount, requiredItemCount: draft.platform === 'kakao' || draft.platform === 'naver' ? 24 : null, allPassed, packageChecks, files: validationFiles, note: '작업 패키지의 참고값 검사입니다. 공식 제출 세트 완성이나 심사 통과를 보장하지 않습니다.' }, null, 2));
      zip.file('prompts.txt', promptBundle);
      zip.file('project.json', JSON.stringify({
        schemaVersion: 3,
        exportType: 'propig-semi-auto-emoticon-project',
        projectName: draft.projectName,
        characterName: draft.characterName,
        characterDescription: draft.characterDescription,
        platform: draft.platform,
        submissionProfile: { width: submissionProfile.width, height: submissionProfile.height, note: '작업 프리셋입니다. 실제 제출 시점의 공식 포털 규격을 다시 확인하세요.' },
        officialGuide: { checkedAt: officialGuide.checkedAt, summary: officialGuide.summary, url: officialGuide.url },
        animationPresets: draft.presets,
        selectedSceneIds: draft.selectedSceneIds,
        excludedFrameCount: excludedCount,
        animatedWebpGeneratedCount,
        exportedAt: new Date().toISOString(),
        frames: exportFrames.map((frame, index) => ({
          order: index + 1,
          sourceFileName: frame.fileName,
          sceneId: frame.sceneId,
          sceneTitle: sceneById(frame.sceneId, draft.presets)?.title || null,
          keyframeIndex: frame.keyframeIndex,
          keyframeId: frame.keyframeId,
          keyframePose: frame.sceneId !== null && frame.keyframeIndex !== null
            ? sceneById(frame.sceneId, draft.presets)?.frames[frame.keyframeIndex]?.pose || null
            : null,
          durationMs: frame.durationMs,
          caption: frame.caption,
          imageTransform: frame.imageTransform,
          captionTransform: frame.captionTransform,
          layers: frame.layers,
        })),
      }, null, 2));
      const blob = await zip.generateAsync();
      activeZipBuilder = null;
      if (controller.signal.aborted) throw new DOMException('내보내기를 취소했습니다.', 'AbortError');
      downloadBlob(blob, `${safeName}.zip`);
      if (allPassed) toast.success('작업 ZIP 생성 완료 · 규격 참고값 충족');
      else toast.warning(`작업 ZIP 생성 완료 · 제출 참고값 미충족 ${failedReferenceCount}개`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') toast('프로젝트 내보내기를 취소했습니다.');
      else toast.error(error instanceof Error ? error.message : 'ZIP 파일을 만드는 중 문제가 발생했습니다.');
    } finally {
      activeGifStream?.cancel();
      activeZipBuilder?.cancel();
      compositePngs.length = 0;
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
      setExporting(false);
    }
  };

  const importProjectPackage = async (file: File | undefined) => {
    if (!file) return;
    planningAbortRef.current?.abort();
    planningRunRef.current = crypto.randomUUID();
    generationAbortRef.current?.abort();
    gifAbortRef.current?.abort();
    exportAbortRef.current?.abort();
    generationRunRef.current = crypto.randomUUID();
    const previousObjectUrls = new Set(objectUrlsRef.current);
    if (!file.name.toLowerCase().endsWith('.zip') || file.size > 150 * 1024 * 1024) {
      toast.error('ProPig 프로젝트 ZIP은 150MB 이하 파일만 가져올 수 있습니다.');
      return;
    }
    let importedProjectId = '';
    try {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      const archiveEntries = Object.values(zip.files).filter((entry) => !entry.dir);
      if (archiveEntries.length > 250) throw new Error('프로젝트 ZIP의 파일 수는 최대 250개입니다.');
      const expandedBytes = archiveEntries.reduce((sum, entry) => {
        const size = Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0);
        return sum + size;
      }, 0);
      if (!Number.isSafeInteger(expandedBytes) || expandedBytes > 200 * 1024 * 1024) throw new Error('압축 해제 기준 200MB를 넘는 프로젝트 ZIP은 가져올 수 없습니다.');
      const projectEntry = zip.file('project.json');
      if (!projectEntry) throw new Error('project.json이 없는 ProPig 프로젝트 ZIP입니다.');
      const projectBytes = Number((projectEntry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0);
      if (projectBytes > 2 * 1024 * 1024) throw new Error('project.json은 2MB 이하여야 합니다.');
      const projectData = JSON.parse(await projectEntry.async('text')) as Record<string, unknown>;
      if (projectData.schemaVersion !== 3 || projectData.exportType !== 'propig-semi-auto-emoticon-project' || !Array.isArray(projectData.frames)) throw new Error('지원하는 ProPig Studio v3 프로젝트가 아닙니다.');
      const frameEntries = Object.values(zip.files).filter((entry) => !entry.dir && /^frames\//.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
      if (frameEntries.length !== projectData.frames.length || frameEntries.length > MAX_FRAME_COUNT) throw new Error('project.json과 원본 프레임 수가 일치하지 않습니다.');

      importedProjectId = crypto.randomUUID();
      const candidateRaw = {
        version: 3,
        projectId: importedProjectId,
        projectName: projectData.projectName,
        characterName: projectData.characterName,
        characterDescription: projectData.characterDescription,
        platform: projectData.platform,
        presets: projectData.animationPresets,
        selectedSceneIds: projectData.selectedSceneIds,
        recentSceneIds: projectData.recentSceneIds,
        sourceRevision: typeof projectData.sourceRevision === 'string' ? projectData.sourceRevision : crypto.randomUUID(),
        sourceName: '',
        frameMeta: projectData.frames.map((value, index) => ({ ...(typeof value === 'object' && value ? value : {}), id: crypto.randomUUID(), fileName: frameEntries[index].name.split('/').pop() || `frame-${index + 1}.png` })),
      };
      const importedDraft = parseAndNormalizeDraft(JSON.stringify(candidateRaw));
      if (importedDraft.projectId !== importedProjectId || importedDraft.frameMeta.length !== frameEntries.length) throw new Error('프로젝트 manifest를 안전하게 복구하지 못했습니다.');

      const nextFrames: StudioFrame[] = [];
      for (const [index, entry] of frameEntries.entries()) {
        const blob = await entry.async('blob');
        const meta = importedDraft.frameMeta[index];
        const fileName = meta.fileName;
        const type = /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : /\.webp$/i.test(fileName) ? 'image/webp' : 'image/png';
        const imageFile = new File([blob], fileName, { type });
        const validation = await validateDecodedImage(imageFile);
        if (validation) throw new Error(validation);
        await putAsset({ key: `${importedProjectId}:${meta.id}`, projectId: importedProjectId, assetId: meta.id, kind: 'frame', blob: imageFile, fileName, updatedAt: Date.now() });
        nextFrames.push({ ...meta, file: imageFile, url: registerObjectUrl(imageFile) });
      }

      const nextLayerUrls: Record<string, string> = {};
      const layerAssetIds = new Set(importedDraft.frameMeta.flatMap((meta) => meta.layers.flatMap((layer) => layer.assetId ? [layer.assetId] : [])));
      for (const assetId of layerAssetIds) {
        const safeAssetId = safeArchiveSegment(assetId);
        const entry = Object.values(zip.files).find((candidate) => !candidate.dir && candidate.name.startsWith(`layers/${safeAssetId}-`));
        if (!entry) throw new Error('추가 이미지 원본이 빠진 ZIP입니다. 기존 프로젝트는 유지됩니다.');
        const blob = await entry.async('blob');
        const fileName = entry.name.split('/').pop()?.replace(`${safeAssetId}-`, '') || 'layer.png';
        const type = /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : /\.webp$/i.test(fileName) ? 'image/webp' : 'image/png';
        const imageFile = new File([blob], fileName, { type });
        const validation = await validateDecodedImage(imageFile);
        if (validation) throw new Error(validation);
        await putAsset({ key: `${importedProjectId}:${assetId}`, projectId: importedProjectId, assetId, kind: 'layer', blob: imageFile, fileName, updatedAt: Date.now() });
        nextLayerUrls[assetId] = registerObjectUrl(imageFile);
      }

      let nextSourceUrl = '';
      const sourceEntry = Object.values(zip.files).find((entry) => !entry.dir && entry.name.startsWith('source/'));
      if (sourceEntry) {
        const blob = await sourceEntry.async('blob');
        const fileName = sourceEntry.name.split('/').pop() || 'character.png';
        const type = /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : /\.webp$/i.test(fileName) ? 'image/webp' : 'image/png';
        const imageFile = new File([blob], fileName, { type });
        const validation = await validateDecodedImage(imageFile);
        if (validation) throw new Error(validation);
        await putAsset({ key: `${importedProjectId}:source`, projectId: importedProjectId, assetId: 'source', kind: 'source', blob: imageFile, fileName, updatedAt: Date.now() });
        importedDraft.sourceName = fileName;
        nextSourceUrl = registerObjectUrl(imageFile);
      }

      const frameIds = new Map((projectData.frames as Array<{ id?: string }>).flatMap((item, index) => item.id ? [[item.id, importedDraft.frameMeta[index].id] as [string, string]] : []));
      const importedOperations = remapStudioOperations(projectData.aiOperations || [], importedProjectId, frameIds);
      for (const ownerId of new Set(importedOperations.map((item) => item.ownerId))) writeStudioOperations(ownerId, importedProjectId, importedOperations.filter((item) => item.ownerId === ownerId));
      if (storageConflictRef.current) throw new Error('다른 탭의 변경을 먼저 불러온 후 ZIP을 가져와 주세요.');
      if (assetReady) archiveCurrentProject();
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(importedDraft));
      previousObjectUrls.forEach((url) => {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
      });
      frameAssetCacheRef.current.clear();
      undoHistoryRef.current = [];
      redoHistoryRef.current = [];
      lastHistoryAtRef.current = 0;
      setHistoryVersion((value) => value + 1);
      draftRef.current = importedDraft;
      framesRef.current = nextFrames;
      setDraft(importedDraft);
      setFrames(nextFrames);
      setLayerAssetUrls(nextLayerUrls);
      setSourceUrl(nextSourceUrl);
      setSelectedFrameId(nextFrames[0]?.id || null);
      setDraftLoaded(true);
      setRecoveryError('');
      setAssetReady(false);
      setStep('character');
      toast.success(`프로젝트 ZIP에서 ${nextFrames.length}개 프레임과 편집 정보를 복원했습니다.`);
      if (importedOperations.some((item) => item.ownerId !== currentUser?.uid)) toast('백업의 AI 결과를 복구하려면 생성했던 계정으로 로그인해 주세요.');
    } catch (error) {
      if (importedProjectId) {
        const assets = await readProjectAssets(importedProjectId).catch(() => []);
        await Promise.all(assets.map((asset) => deleteAsset(importedProjectId, asset.assetId).catch(() => undefined)));
      }
      for (const url of objectUrlsRef.current) {
        if (previousObjectUrls.has(url)) continue;
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
      }
      toast.error(error instanceof Error ? error.message : '프로젝트 ZIP을 가져오지 못했습니다.');
    }
  };

  const exportRecoveryBackup = async () => {
    if (exporting) return;
    setExporting(true);
    const controller = new AbortController();
    let zip: AbortableZipBuilder | null = null;
    try {
      zip = await createAbortableZipBuilder(controller.signal);
      zip.file('saved-project.json', localStorage.getItem(DRAFT_KEY) || '{}');
      const assets = await readProjectAssets(draftRef.current.projectId);
      assets.forEach((item) => zip?.file(`available-originals/${item.kind}/${safeArchiveSegment(item.assetId)}-${safeArchiveSegment(item.fileName)}`, item.blob));
      zip.file('README.txt', '복구용 보관 파일입니다. 현재 읽을 수 있는 원본과 저장 정보를 포함합니다. 정상 작업 ZIP과 다르며 누락된 원본은 포함되지 않습니다.');
      downloadBlob(await zip.generateAsync(), 'emoticon-recovery-originals.zip');
      toast.success(`읽을 수 있는 원본 ${assets.length}개와 저장 정보를 보관했습니다.`);
    } catch { zip?.cancel(); toast.error('원본 보관 파일을 만들지 못했습니다. 저장 정보 JSON을 따로 받아 주세요.'); }
    finally { setExporting(false); }
  };

  const exportWorkingBackup = async () => {
    if (exporting || importing || !assetReady) return;
    const snapshot = draftRef.current;
    const sourceFrames = [...framesRef.current];
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExporting(true);
    let zip: AbortableZipBuilder | null = null;
    try {
      zip = await createAbortableZipBuilder(controller.signal);
      const assets = await readProjectAssets(snapshot.projectId);
      assets.filter((item) => item.kind === 'source').forEach((item) => zip?.file(`source/${safeArchiveSegment(item.fileName)}`, item.blob));
      assets.filter((item) => item.kind === 'layer').forEach((item) => zip?.file(`layers/${safeArchiveSegment(item.assetId)}-${safeArchiveSegment(item.fileName)}`, item.blob));
      sourceFrames.forEach((item, index) => zip?.file(`frames/${String(index + 1).padStart(2, '0')}-${safeArchiveSegment(item.fileName)}`, item.file));
      zip.file('project.json', JSON.stringify({ schemaVersion: 3, exportType: 'propig-semi-auto-emoticon-project', projectName: snapshot.projectName, characterName: snapshot.characterName, characterDescription: snapshot.characterDescription, platform: snapshot.platform, animationPresets: snapshot.presets, selectedSceneIds: snapshot.selectedSceneIds, recentSceneIds: snapshot.recentSceneIds, sourceRevision: snapshot.sourceRevision, aiOperations: currentUser ? readStudioOperations(currentUser.uid, snapshot.projectId) : [], frames: frameMetaFromFrames(sourceFrames), backup: true, exportedAt: new Date().toISOString() }, null, 2));
      zip.file('prompts.txt', buildPromptBundle(snapshot));
      const blob = await zip.generateAsync();
      if (controller.signal.aborted) return;
      downloadBlob(blob, `${safeArchiveSegment(snapshot.projectName || 'propig-emoticon')}-backup.zip`);
      toast.success('모든 원본·편집 정보와 현재 계정의 AI 작업 기록을 백업했습니다. AI 결과는 같은 계정으로 복구할 수 있어요.');
    } catch (error) {
      zip?.cancel();
      toast.error(error instanceof Error && error.name !== 'AbortError' ? error.message : '백업 만들기를 취소했습니다.');
    } finally { setExporting(false); exportAbortRef.current = null; }
  };

  const archiveCurrentProject = () => {
    const raw: unknown = JSON.parse(localStorage.getItem(ARCHIVES_KEY) || '[]');
    if (!Array.isArray(raw)) throw new Error('이전 프로젝트 목록을 읽지 못했습니다. 먼저 백업을 받아 주세요.');
    const existing = raw.map((item) => parseAndNormalizeDraft(JSON.stringify(item)));
    const next = [draftRef.current, ...existing.filter((item) => item.projectId !== draftRef.current.projectId)];
    localStorage.setItem(ARCHIVES_KEY, JSON.stringify(next));
    setArchivedProjects(next);
  };

  const openProject = (next: Draft) => {
    if (storageConflictRef.current || importing || generating || planning || exporting || previewEncoding || webpEncoding || recoveringOperations || !assetReady) return;
    try {
      archiveCurrentProject();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      planningAbortRef.current?.abort();
      generationAbortRef.current?.abort();
      gifAbortRef.current?.abort();
      webpAbortRef.current?.abort();
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current.clear();
      frameAssetCacheRef.current.clear();
      undoHistoryRef.current = [];
      redoHistoryRef.current = [];
      setHistoryVersion((value) => value + 1);
      setAssetReady(false);
      setDraftLoaded(true);
      draftRef.current = next;
      framesRef.current = [];
      setDraft(next);
      setFrames([]);
      setLayerAssetUrls({});
      setSourceUrl('');
      setSelectedFrameId(null);
      setSelectedFrameIds([]);
      setReviewSceneId('all');
      setProjectMenuOpen(false);
      setStep('character');
      setGenerationStates([]);
      toast.success('이전 프로젝트와 원본은 보관했습니다.');
    } catch { toast.error('현재 프로젝트를 보관하지 못해 전환하지 않았습니다. 먼저 작업 백업을 받아 주세요.'); }
  };

  const resetProject = () => openProject(createInitialDraft());

  const goToStep = (next: StepId) => {
    setStep(next);
  };

  const renderPlatformPreview = (platform: 'kakao' | 'naver') => selectedFrame ? (
    <PlatformPreviewCard>
      <header><b>{platform === 'kakao' ? '💬' : 'N'}</b><strong>{PLATFORM_LABELS[platform]} · {SUBMISSION_PROFILES[platform].width}×{SUBMISSION_PROFILES[platform].height}</strong></header>
      <PlatformChat>
        <PlatformMiniCanvas $aspect={`${SUBMISSION_PROFILES[platform].width}/${SUBMISSION_PROFILES[platform].height}`}>
          <img src={selectedFrame.url} alt="" style={{ left: `${selectedFrame.imageTransform.x}%`, top: `${selectedFrame.imageTransform.y}%`, width: `${selectedFrame.imageTransform.width}%`, transform: `translate(-50%,-50%) rotate(${selectedFrame.imageTransform.rotation}deg)`, opacity: selectedFrame.imageTransform.opacity / 100 }} />
          {selectedFrame.caption ? <span style={{ left: `${selectedFrame.captionTransform.x}%`, top: `${selectedFrame.captionTransform.y}%`, width: `${selectedFrame.captionTransform.width}%`, transform: `translate(-50%,-50%) rotate(${selectedFrame.captionTransform.rotation}deg)`, opacity: selectedFrame.captionTransform.opacity / 100 }}>{selectedFrame.caption}</span> : null}
          {selectedFrame.layers.map((layer) => layer.visible ? layer.type === 'image' && layer.assetId && layerAssetUrls[layer.assetId] ? <img key={layer.id} src={layerAssetUrls[layer.assetId]} alt="" style={{ left: `${layer.transform.x}%`, top: `${layer.transform.y}%`, width: `${layer.transform.width}%`, transform: `translate(-50%,-50%) rotate(${layer.transform.rotation}deg)`, opacity: layer.transform.opacity / 100 }} /> : layer.type === 'speech' ? <span key={layer.id} style={{ left: `${layer.transform.x}%`, top: `${layer.transform.y}%`, width: `${layer.transform.width}%`, transform: `translate(-50%,-50%) rotate(${layer.transform.rotation}deg)`, opacity: layer.transform.opacity / 100 }}>{layer.text || '말풍선'}</span> : null : null)}
        </PlatformMiniCanvas>
      </PlatformChat>
      <footer><i>＋</i><span>메시지</span><b>☺</b></footer>
    </PlatformPreviewCard>
  ) : null;

  return (
    <StudioRoot ref={studioRootRef} data-studio-ready={hydrated && assetReady ? 'true' : 'false'}>
      <Toaster id={STUDIO_TOASTER_ID} richColors closeButton position="bottom-right" offset={24} mobileOffset={{ bottom: 96, left: 16, right: 16 }} containerAriaLabel="이모티콘 작업 알림" hotkey={['altKey', 'KeyE']} toastOptions={{ closeButtonAriaLabel: '알림 닫기' }} />
      <TopBar>
        <TopStart>
          <AdminHomeLink href="/admin" aria-label="관리자 홈으로 돌아가기">
            <ArrowLeft size={16} aria-hidden="true" /><span>관리자 홈</span>
          </AdminHomeLink>
          <BrandBlock title="반자동 이모티콘 스튜디오">
            <BrandMark><WandSparkles size={20} /></BrandMark>
            <div><strong>이모티콘 스튜디오</strong><span>PROPIG</span></div>
          </BrandBlock>
        </TopStart>
        <ProjectIdentity><ProjectNameInput aria-label="프로젝트 이름" disabled={!assetReady || storageConflict} value={draft.projectName} maxLength={80} onChange={(event) => updateDraft('projectName', event.target.value)} /><small>프로젝트 이름은 자동 저장돼요</small></ProjectIdentity>
        <TopPlatforms aria-label="빠른 제출 플랫폼 선택"><button type="button" aria-pressed={draft.platform === 'kakao'} onClick={() => updateDraft('platform', 'kakao')}><b>💬</b> 카카오톡</button><button type="button" aria-pressed={draft.platform === 'naver'} onClick={() => updateDraft('platform', 'naver')}><b>N</b> 네이버 OGQ</button></TopPlatforms>
        <ProductionMode title="ChatGPT 수동 · OpenRouter API 선택"><Sparkles size={15} /><span>{generationMode === 'fast' ? '빠른 제작' : '고품질 제작'}</span></ProductionMode>
        <TopMeta>
          <SaveState role="status" aria-live="polite" data-error={Boolean(saveError || recoveryError)} title={savedAt ? `마지막 저장 ${savedAt.toLocaleTimeString('ko-KR')}` : undefined}><Check size={14} /> {saveStatus}</SaveState>
          <BudgetMeta><small>이 프로젝트 · 확인된 AI 비용</small><strong>{`$${sessionCostUsd.toFixed(4)}${unknownCostCount ? ` · ${unknownCostCount}건 확인 중` : ''}`}</strong></BudgetMeta>
          <SecondaryButton type="button" aria-expanded={projectMenuOpen} onClick={() => setProjectMenuOpen((value) => !value)}><FileArchive size={15} /> 프로젝트</SecondaryButton>
          <PrimaryButton className="top-export" type="button" onClick={exportWorkingBackup} disabled={!assetReady || exporting}><Upload size={16} /> {exporting ? '백업 중…' : '작업 백업'}</PrimaryButton>
        </TopMeta>
      </TopBar>
      {projectMenuOpen ? <ProjectMenu aria-label="프로젝트 보관함"><div><strong>이 기기의 프로젝트</strong><IconButton type="button" aria-label="프로젝트 메뉴 닫기" onClick={() => setProjectMenuOpen(false)}><X size={18} /></IconButton></div><p>새 프로젝트를 열어도 현재 작업과 원본을 보관합니다.</p><PromptActions><SecondaryButton type="button" disabled={!assetReady || importing || generating || planning || exporting || storageConflict} onClick={resetProject}><Plus size={16} />새 프로젝트</SecondaryButton><SecondaryButton type="button" disabled={importing || generating || planning || exporting || storageConflict} onClick={() => projectInputRef.current?.click()}><Upload size={16} />작업 ZIP 불러오기</SecondaryButton></PromptActions>{archivedProjects.filter((item) => item.projectId !== draft.projectId).map((item) => <button type="button" key={item.projectId} disabled={!assetReady || importing || generating || planning || exporting || storageConflict} onClick={() => openProject(item)}>{item.projectName} · {item.frameMeta.length}프레임</button>)}</ProjectMenu> : null}
      <input ref={sourceInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; void runAssetMutation(() => handleSource(file)); event.currentTarget.value = ''; }} />
      <input ref={frameInputRef} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const files = Array.from(event.target.files || []); void runAssetMutation(() => importFrames(files)); event.currentTarget.value = ''; }} />
      <input ref={layerInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; void runAssetMutation(() => addImageLayer(file)); event.currentTarget.value = ''; }} />
      <input ref={projectInputRef} hidden type="file" accept="application/zip,.zip" onChange={(event) => { const file = event.target.files?.[0]; void runAssetMutation(() => importProjectPackage(file)); event.currentTarget.value = ''; }} />

      <StudioBody>
        <StepRail aria-label="제작 단계">
          {STEP_ITEMS.map((item) => {
            const active = item.id === activeRailId;
            const done = (item.id === 'prepare' && canPlan) || (item.id === 'plan' && draft.selectedSceneIds.length > 0 && !frameLimitExceeded) || (item.id === 'make' && canEdit && !missingSlots.length) || (item.id === 'export' && Boolean(gifPreviewUrl));
            return (
              <StepButton key={item.id} type="button" $active={active} $done={done} aria-current={active ? 'step' : undefined} onClick={() => goToStep(item.target)}>
                <i>{item.icon}<b>{done && !active ? <Check size={10} /> : item.eyebrow}</b></i>
                <strong>{item.label}</strong>
              </StepButton>
            );
          })}
          <RailGuide>
            <MessageSquareText size={18} />
            <strong>두 가지 제작 방식</strong>
            <span>ChatGPT 구독 수동 브리지와 별도 과금 OpenRouter 자동 API를 선택할 수 있어요.</span>
          </RailGuide>
        </StepRail>

        <Workspace>
          <MobileProgress aria-label="모바일 제작 단계 자유 탐색">
            <small>현재 {STEP_ITEMS.findIndex((item) => item.id === activeRailId) + 1}/4 · {saveStatus}</small><div>
            {STEP_ITEMS.map((item, index) => <button key={item.id} type="button" aria-current={item.id === activeRailId ? 'step' : undefined} onClick={() => goToStep(item.target)}><span>{index + 1}</span>{item.label}</button>)}
          </div></MobileProgress>

          {storageConflict ? <StatusBanner role="alert"><strong>다른 탭에서 프로젝트가 변경됐어요</strong><span>겹쳐 저장하지 않도록 편집을 잠시 멈췄어요. 현재 화면을 백업하거나 최신 작업을 불러오세요.</span><PromptActions><SecondaryButton type="button" onClick={exportWorkingBackup}>현재 화면 백업</SecondaryButton><PrimaryButton type="button" onClick={() => window.location.reload()}>최신 작업 불러오기</PrimaryButton></PromptActions></StatusBanner> : recoveryError ? <StatusBanner role="alert"><strong>저장한 작업을 복구하지 못했어요</strong><span>{recoveryError}</span><PromptActions><SecondaryButton type="button" onClick={() => setRecoveryAttempt((value) => value + 1)}>복구 다시 시도</SecondaryButton><SecondaryButton type="button" onClick={() => downloadBlob(new Blob([localStorage.getItem(DRAFT_KEY) || '{}'], { type: 'application/json' }), 'emoticon-recovery.json')}>저장 정보 보관</SecondaryButton><SecondaryButton type="button" disabled={exporting || !draftLoaded} onClick={exportRecoveryBackup}>읽을 수 있는 원본 보관</SecondaryButton><SecondaryButton type="button" onClick={() => projectInputRef.current?.click()}>작업 ZIP 불러오기</SecondaryButton></PromptActions></StatusBanner> : !assetReady ? <StatusBanner role="status">저장한 원본을 확인하고 있어요…</StatusBanner> : null}
          {saveError ? <StatusBanner role="alert"><strong>저장 실패</strong><span>{saveError}</span><PromptActions><SecondaryButton type="button" onClick={() => setDraft((value) => ({ ...value }))}>저장 다시 시도</SecondaryButton><SecondaryButton type="button" onClick={exportWorkingBackup}>작업 백업 받기</SecondaryButton></PromptActions></StatusBanner> : null}
          {journalError || pendingOperations.length ? <StatusBanner role="status"><strong>{journalError || `${pendingOperations.length}건의 AI 작업 결과 확인이 필요해요`}</strong><span>이미 전송한 작업은 다시 결제 요청을 보내지 않고 결과를 확인합니다.</span><SecondaryButton type="button" disabled={recoveringOperations || generating || planning || !assetReady || storageConflict} onClick={() => journalError ? setRecoveryAttempt((value) => value + 1) : void recoverOperationResults()}>{recoveringOperations ? '결과 확인 중…' : '이전 결과 확인'}</SecondaryButton></StatusBanner> : null}
          {operations.length ? <OperationSummary><summary>AI 작업 기록 · 확인된 비용 ${sessionCostUsd.toFixed(4)}{unknownCostCount ? ` · ${unknownCostCount}건 비용 미확정` : ''}</summary>{operations.map((item) => <p key={item.id}>{item.kind === 'plan' ? '장면 기획' : '프레임 생성'} · {item.applied ? '반영 완료' : item.state === 'failed' ? '실패 확인' : '결과 확인 필요'} · {item.state === 'completed' ? '실제 모델' : '요청 모델'} {item.modelUsed || '확인 중'} · {item.costUsd === null ? '비용 확인 중' : `$${item.costUsd.toFixed(4)}`}{item.message ? ` · ${item.message}` : ''}</p>)}</OperationSummary> : null}
          <WorkArea disabled={!assetReady || storageConflict}>
          {activeRailId === 'make' ? <MakeTabs aria-label="제작·편집 화면"><button type="button" aria-pressed={step === 'import'} onClick={() => setStep('import')}>이미지 만들기</button><button type="button" aria-pressed={step === 'edit'} onClick={() => setStep('edit')}>프레임 편집</button></MakeTabs> : null}
          {step === 'character' || step === 'project' ? (
            <StepContent>
              <SectionHeading><span>01 · 준비하기</span><h1>캐릭터와 제출 대상을 준비해요</h1><p>캐릭터를 한 번 정하면 모든 장면에 이어서 사용해요. 이미 만든 이미지가 있다면 바로 가져올 수도 있어요.</p></SectionHeading>
              <CharacterGrid>
                <UploadCard type="button" onClick={() => sourceInputRef.current?.click()}>
                  {sourceUrl ? <img src={sourceUrl} alt={`${draft.characterName || '캐릭터'} 기준 이미지`} /> : <><ImagePlus size={34} /><strong>캐릭터 이미지 선택</strong><span>PNG, JPG, WebP · 8MB 이하</span></>}
                  {sourceUrl ? <UploadOverlay><Upload size={18} /> 이미지 교체</UploadOverlay> : null}
                </UploadCard>

                <FormCard>
                  <Field><span>캐릭터 이름</span><input value={draft.characterName} maxLength={60} placeholder="예: 프로피" onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, characterName: value, projectName: current.projectName === '새 이모티콘 프로젝트' || current.projectName === `${current.characterName}의 이모티콘` ? value.trim() ? `${value}의 이모티콘` : '새 이모티콘 프로젝트' : current.projectName })); }} /></Field>
                  <details><summary>캐릭터 특징·프로젝트 이름</summary><Field><span>프로젝트 이름</span><input value={draft.projectName} maxLength={80} onChange={(event) => updateDraft('projectName', event.target.value)} /></Field><Field><span>반드시 유지할 특징</span><textarea value={draft.characterDescription} maxLength={800} placeholder="예: 둥근 분홍색 돼지, 흰색 배, 짧은 팔다리, 굵고 부드러운 외곽선" onChange={(event) => updateDraft('characterDescription', event.target.value)} /></Field></details>
                  <Field as="div"><span>내보낼 플랫폼</span><Segmented>{(Object.keys(PLATFORM_LABELS) as Platform[]).map((platform) => <button key={platform} type="button" aria-pressed={draft.platform === platform} onClick={() => updateDraft('platform', platform)}>{PLATFORM_LABELS[platform]}</button>)}</Segmented></Field>
                  <PlatformGuide data-platform={draft.platform}><ShieldCheck size={19} /><div><strong>{submissionProfile.title}</strong><span>{submissionProfile.summary}</span><details><summary>규격과 공식 안내</summary><small>{officialGuide.checkedAt} 기준 · {officialGuide.summary}</small></details><a href={officialGuide.url} target="_blank" rel="noreferrer">공식 가이드 열기 <ExternalLink size={13} /></a></div></PlatformGuide>
                  <Readiness aria-label="준비 상태">
                    <li data-done={Boolean(draft.sourceName)}>{draft.sourceName ? <CheckCircle2 /> : <span />} 기준 이미지</li>
                    <li data-done={Boolean(draft.characterName.trim())}>{draft.characterName.trim() ? <CheckCircle2 /> : <span />} 캐릭터 이름</li>
                    <li data-done={Boolean(draft.characterDescription.trim())}>{draft.characterDescription.trim() ? <CheckCircle2 /> : <span />} 특징 설명 <em>권장</em></li>
                  </Readiness>
                  <PrimaryButton type="button" onClick={() => setStep('plan')}>장면 고르기 <ArrowRight size={16} /></PrimaryButton><SecondaryButton type="button" onClick={() => setStep('import')}>이미지가 있어요 · 바로 가져오기</SecondaryButton>
                </FormCard>
              </CharacterGrid>
            </StepContent>
          ) : null}

          {step === 'plan' ? (
            <StepContent>
              <SectionHeading><span>02 · 장면 고르기</span><h1>만들 장면을 골라 주세요</h1><p>인사, 감사, 응원처럼 필요한 움직임을 고르세요. 자세와 재생 시간은 선택한 뒤 다듬을 수 있어요.</p></SectionHeading>
              <PlanToolbar>
                <div><strong>움짤 연출 프리셋</strong><span>선택한 연출의 모든 키프레임이 제작 지시서에 포함돼요.</span></div>
                <PromptActions><SecondaryButton type="button" onClick={resetPresets}><RotateCcw size={15} /> 기본값 복원</SecondaryButton><SecondaryButton type="button" onClick={() => setAiToolOpen((open) => !open)}><Bot size={16} /> AI로 기획</SecondaryButton><PrimaryButton type="button" onClick={startNewPreset}><Plus size={16} /> 연출 추가</PrimaryButton></PromptActions>
                <SelectionCount>{expectedSlots.length}<span>/{MAX_FRAME_COUNT} 프레임</span></SelectionCount>
              </PlanToolbar>
              {aiToolOpen ? (
                <AiPlanner aria-label="AI 장면 프리셋 기획">
                  <AiPlannerHeader><div><span>AI ANIMATION DIRECTOR</span><h2>장면 프리셋을 AI로 기획해요</h2><p>같은 입력을 ChatGPT 구독에서 수동으로 사용하거나 OpenRouter API로 자동 기획할 수 있어요.</p></div><IconButton type="button" aria-label="AI 기획 닫기" onClick={() => setAiToolOpen(false)}><X size={18} /></IconButton></AiPlannerHeader>
                  <PlannerForm>
                    <Field><span>기획할 움직임</span><textarea value={actionDescription} maxLength={600} placeholder="예: 560도를 회전해 발차기하고 착지한다 / 손을 좌우로 흔들며 안녕이라고 말한다" onChange={(event) => setActionDescription(event.target.value)} /></Field>
                    <PlannerSettings>
                      <Field><span>프레임 수</span><input type="number" min="2" max="16" value={plannerFrameCount} onChange={(event) => setPlannerFrameCount(Math.max(2, Math.min(16, Number(event.target.value) || 8)))} /></Field>
                      <Field><span>FPS</span><input type="number" min="1" max="24" value={plannerFps} onChange={(event) => setPlannerFps(Math.max(1, Math.min(24, Number(event.target.value) || 8)))} /></Field>
                      <Field><span>루프</span><select value={plannerLoop ? 'yes' : 'no'} onChange={(event) => setPlannerLoop(event.target.value === 'yes')}><option value="yes">자연스럽게 반복</option><option value="no">한 번 재생</option></select></Field>
                    </PlannerSettings>
                    <Field><span>대사·표시 문구</span><input value={plannerDialogue} maxLength={120} placeholder="예: 손을 흔드는 동안 ‘안’ → ‘녕’" onChange={(event) => setPlannerDialogue(event.target.value)} /></Field>
                  </PlannerForm>
                  <AiModeGrid>
                    <AiModeCard><i><MessageSquareText /></i><span>CHATGPT SUBSCRIPTION</span><strong>구독 계정에서 수동 기획</strong><p>제품 API 비용은 없지만 ChatGPT에서 직접 실행하고 결과 JSON을 다시 붙여넣어야 해요.</p><SecondaryButton type="button" onClick={copyPlanningPrompt}><ClipboardCopy size={16} /> 기획 프롬프트 복사</SecondaryButton><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기 <ExternalLink size={15} /></a></AiModeCard>
                    <AiModeCard $api><i><Zap /></i><span>OPENROUTER API</span><strong>ProPig에서 자동 기획</strong><p>모델 {aiModels.text} · 최대 2회 요청(최초 1회 + 형식 오류 시 교정 1회) · 별도 API 사용료가 발생할 수 있어요.</p><PrimaryButton type="button" disabled={!currentUser || planning || !actionDescription.trim() || !hasApiConsent} onClick={() => void requestOpenRouterPlan()}>{planning ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} {!currentUser ? '로그인 후 자동 기획' : planning ? '기획 중…' : 'OpenRouter로 기획'}</PrimaryButton></AiModeCard>
                  </AiModeGrid>
                  <ConsentBox><input id="openrouter-consent" type="checkbox" checked={hasApiConsent} onChange={(event) => updateApiConsent(event.target.checked)} /><label htmlFor="openrouter-consent"><ShieldCheck size={18} /><span><strong>OpenRouter API 별도 과금과 외부 전송을 확인했습니다.</strong><small>캐릭터 설명·동작·대사·선택 프리셋·프레임 prompt는 기획·이미지 모델에, 이미지 자동 생성 시 기준 이미지는 이미지 모델에 전송됩니다. 모델·품질·수량·전송 이미지나 prompt가 바뀌면 다시 확인해야 합니다. ChatGPT 구독에 포함되지 않으며 취소 전 전송된 요청은 과금될 수 있습니다.</small></span></label></ConsentBox>
                  <JsonImporter><div><strong>ChatGPT 기획 JSON 가져오기</strong><span>ChatGPT에서 받은 기획 내용을 붙여 넣으면 형식과 프레임 정보를 확인해요.</span></div><textarea aria-label="ChatGPT 장면 기획 JSON" value={planningJson} maxLength={40000} placeholder='{"name":"손 흔들며 안녕", ...}' onChange={(event) => setPlanningJson(event.target.value)} /><SecondaryButton type="button" disabled={!planningJson.trim()} onClick={importPlanningJson}><Download size={16} /> JSON을 프리셋으로 저장</SecondaryButton></JsonImporter>
                </AiPlanner>
              ) : null}
              {editingPreset ? (
                <PresetEditor aria-label="움짤 연출 프리셋 편집기">
                  <PresetEditorHeader><div><span>ANIMATION DIRECTION</span><h2>연출 프리셋 편집</h2><p>보이는 결과가 아니라 시간에 따른 움직임을 설명해 주세요.</p></div><IconButton type="button" aria-label="프리셋 편집 닫기" onClick={() => setEditingPreset(null)}><X size={18} /></IconButton></PresetEditorHeader>
                  <PresetMetaGrid>
                    <Field><span>연출 이름</span><input value={editingPreset.title} maxLength={80} onChange={(event) => setEditingPreset({ ...editingPreset, title: event.target.value })} /></Field>
                    <Field><span>대사·감정</span><input value={editingPreset.dialogue} maxLength={120} placeholder="예: 타격 순간 기합 ‘얍!’" onChange={(event) => setEditingPreset({ ...editingPreset, dialogue: event.target.value })} /></Field>
                    <Field><span>전체 동작 설명</span><textarea value={editingPreset.summary} maxLength={600} placeholder="시작 자세부터 마무리까지 동작의 흐름을 설명하세요." onChange={(event) => setEditingPreset({ ...editingPreset, summary: event.target.value })} /></Field>
                    <Field><span>반복 연결 조건</span><textarea value={editingPreset.loopGuide} maxLength={400} placeholder="마지막 프레임이 첫 프레임과 어떻게 이어질지 설명하세요." onChange={(event) => setEditingPreset({ ...editingPreset, loopGuide: event.target.value })} /></Field>
                  </PresetMetaGrid>
                  <KeyframeHeader><div><strong>프레임별 동작</strong><span>중간 움직임을 생략하지 말고 시간 순서대로 작성하세요.</span></div><SecondaryButton type="button" disabled={editingPreset.frames.length >= 16} onClick={() => { const index = editingPreset.frames.length; setEditingPreset({ ...editingPreset, frames: [...editingPreset.frames, frame(`${editingPreset.id}-${index + 1}`, '다음 움직임을 구체적으로 설명해 주세요.', '', 140)] }); }}><Plus size={15} /> 프레임 추가</SecondaryButton></KeyframeHeader>
                  <KeyframeList>{editingPreset.frames.map((item, index) => (
                    <KeyframeRow key={item.id}>
                      <b>{index + 1}</b>
                      <Field><span>자세와 움직임</span><textarea value={item.pose} maxLength={500} onChange={(event) => setEditingPreset({ ...editingPreset, frames: editingPreset.frames.map((frameItem, frameIndex) => frameIndex === index ? { ...frameItem, pose: event.target.value } : frameItem) })} /></Field>
                      <Field><span>대사·표시 문구</span><input value={item.caption} maxLength={40} placeholder="없으면 비워두기" onChange={(event) => setEditingPreset({ ...editingPreset, frames: editingPreset.frames.map((frameItem, frameIndex) => frameIndex === index ? { ...frameItem, caption: event.target.value } : frameItem) })} /></Field>
                      <Field><span>노출 시간(ms)</span><input type="number" min="60" max="3000" step="10" value={item.durationMs} onChange={(event) => setEditingPreset({ ...editingPreset, frames: editingPreset.frames.map((frameItem, frameIndex) => frameIndex === index ? { ...frameItem, durationMs: Math.max(60, Math.min(3000, Number(event.target.value) || 140)) } : frameItem) })} /></Field>
                      <IconButton type="button" aria-label={`${index + 1}번 프레임 삭제`} disabled={editingPreset.frames.length <= 2} onClick={() => setEditingPreset({ ...editingPreset, frames: editingPreset.frames.filter((_, frameIndex) => frameIndex !== index) })}><Trash2 size={16} /></IconButton>
                    </KeyframeRow>
                  ))}</KeyframeList>
                  <PresetEditorFooter><span>총 {editingPreset.frames.length}프레임 · {(editingPreset.frames.reduce((sum, item) => sum + item.durationMs, 0) / 1000).toFixed(2)}초</span><div><SecondaryButton type="button" onClick={() => setEditingPreset(null)}>취소</SecondaryButton><PrimaryButton type="button" onClick={savePreset}><Save size={16} /> 프리셋 저장</PrimaryButton></div></PresetEditorFooter>
                </PresetEditor>
              ) : null}
              <FilterBar><Field><span>장면 검색</span><input type="search" value={sceneQuery} placeholder="예: 인사, 응원" onChange={(event) => setSceneQuery(event.target.value)} /></Field><button type="button" aria-pressed={recentOnly} onClick={() => setRecentOnly((value) => !value)}>최근 사용</button></FilterBar>
              {frameLimitExceeded ? <StatusBanner role="alert"><strong>{expectedSlots.length - MAX_FRAME_COUNT}프레임 초과</strong><span>전체 {expectedSlots.length}프레임입니다. 장면을 해제하거나 프레임 수를 줄여 주세요.</span></StatusBanner> : null}
              {!filteredPresets.length ? <p role="status">조건에 맞는 장면이 없어요. 검색어나 최근 사용 필터를 바꿔 보세요.</p> : null}
              <SceneGrid>{filteredPresets.map((preset) => {
                const selected = draft.selectedSceneIds.includes(preset.id);
                return <SceneCard as="article" key={preset.id} data-preset-id={preset.id} $selected={selected}>
                  <PresetSelect type="button" aria-pressed={selected} onClick={() => toggleScene(preset.id)}><i>{selected ? <Check size={14} /> : <Plus size={14} />}</i><SceneThumbnail aria-hidden="true">{frames.find((item) => item.sceneId === preset.id) ? <img src={frames.find((item) => item.sceneId === preset.id)?.url} alt="" /> : /인사|안녕/.test(preset.title) ? '👋' : /감사|고마/.test(preset.title) ? '🙏' : /응원|힘/.test(preset.title) ? '💪' : /발차기|회전/.test(preset.title) ? '🌀' : '✨'}</SceneThumbnail><div><strong>{preset.title}</strong><span>{preset.summary}</span><em>{preset.frames.length}프레임 · {preset.dialogue || '대사 없음'}</em></div></PresetSelect>
                  <MiniFrames>{preset.frames.map((item, index) => <span key={item.id} title={item.pose}>{index + 1}</span>)}</MiniFrames>
                  <PresetCardActions><button type="button" onClick={() => setEditingPreset(structuredClone(preset))}>수정</button><button type="button" onClick={() => duplicatePreset(preset)}>복제</button><button type="button" onClick={() => deletePreset(preset.id)}>삭제</button></PresetCardActions>
                </SceneCard>;
              })}</SceneGrid>
              <PromptPreview>
                <div><span>CHATGPT ANIMATION PROMPT PACK</span><strong>{draft.selectedSceneIds.length}개 연출 · {expectedSlots.length}개 프레임 지시서 준비됨</strong><p>캐릭터 이미지와 함께 붙여 넣고 각 키프레임을 독립 이미지로 순서대로 생성해 달라고 요청하세요.</p></div>
                <PromptActions><SecondaryButton type="button" onClick={downloadPrompts}><FileText size={16} /> TXT 받기</SecondaryButton><PrimaryButton type="button" disabled={!canImport} onClick={copyPrompts}><ClipboardCopy size={16} /> 전체 프롬프트 복사</PrimaryButton></PromptActions>
              </PromptPreview>
              <StepFooter><SecondaryButton type="button" onClick={() => setStep('character')}><ArrowLeft size={16} /> 이전</SecondaryButton><PrimaryButton type="button" disabled={!draft.selectedSceneIds.length || frameLimitExceeded} onClick={() => setStep('import')}>이 장면으로 만들기 <ArrowRight size={16} /></PrimaryButton></StepFooter>
            </StepContent>
          ) : null}

          {step === 'import' ? (
            <StepContent>
              <SectionHeading><span>03 · 만들고 다듬기</span><h1>이미지를 준비하고 움직임을 다듬어요</h1><p>이미지가 있다면 바로 가져오세요. 새로 만들 때는 AI 방식을 선택할 수 있어요.</p></SectionHeading>
              <StudioProductionPanel method={productionMethod} onMethod={setProductionMethod} total={expectedSlots.length} completed={completeCount} missing={missingSlots.length} frameCount={frames.length} importing={importing} generating={generating} onImport={() => openFramePicker()} onCopy={() => void copyPrompts()} onGenerate={() => void generateFramesWithOpenRouter()} onCancel={() => generationAbortRef.current?.abort()} onEdit={() => setStep('edit')} mode={generationMode} onMode={setGenerationMode} provider={generationProvider} onProvider={setGenerationProvider} model={selectedGenerationModel} modelStatus={modelStatusLabel} modelReady={modelReady} onRefresh={() => setModelRefresh((value) => value + 1)} batch={generationBatchSize} onBatch={setGenerationBatchSize} consent={hasApiConsent} onConsent={updateApiConsent} blockedReason={generationBlockedReason} remainingBudget={imageBudget?.remainingUsd ?? null} />
              {productionMethod === 'ai' && generationBlockedReason ? <PromptActions>{!sourceUrl ? <SecondaryButton type="button" onClick={() => setStep('character')}>기준 이미지 준비하기</SecondaryButton> : null}{frameLimitExceeded ? <SecondaryButton type="button" onClick={() => setStep('plan')}>선택 장면 줄이기</SecondaryButton> : null}{pendingOperations.length ? <SecondaryButton type="button" disabled={recoveringOperations || generating} onClick={() => void recoverOperationResults()}>이전 결과 확인</SecondaryButton> : null}</PromptActions> : null}
              {generationProgress ? <p role="status">{generationProgress}</p> : null}
              {!missingSlots.length && expectedSlots.length ? <CompletionBanner><CheckCircle2 size={22} /><div><strong>모든 기획 프레임이 준비됐어요</strong><span>문구·재생 시간·반복 흐름을 다듬어 보세요.</span></div><PrimaryButton type="button" onClick={() => setStep('edit')}>프레임 편집 시작 <ArrowRight size={16} /></PrimaryButton></CompletionBanner> : null}
              <SlotSection><SlotHeader><div><span>프레임 제작 보드</span><strong>장면별 진행 상황</strong></div><FilterBar aria-label="프레임 상태 필터">{([['all', '전체'], ['missing', '미완성'], ['failed', '확인 필요']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={slotFilter === value} onClick={() => setSlotFilter(value)}>{label}</button>)}</FilterBar></SlotHeader><SlotBoard>{expectedSlots.map((slot, index) => {
                const connected = frames.find((item) => item.sceneId === slot.sceneId && (item.keyframeId ? item.keyframeId === slot.keyframe.id : item.keyframeIndex === slot.keyframeIndex));
                const operation = [...operations].reverse().find((item) => item.slot?.sceneId === slot.sceneId && item.slot.keyframeId === slot.keyframe.id);
                const needsAttention = Boolean(operation && !operation.applied);
                if (slotFilter === 'missing' && connected || slotFilter === 'failed' && !needsAttention) return null;
                return <SlotCard key={frameSlotKey(slot.sceneId, slot.keyframeIndex, slot.keyframe.id)} type="button" data-status={connected ? 'ready' : 'missing'} $status={connected ? 'ready' : 'missing'} onClick={() => { if (connected) { setSelectedFrameId(connected.id); setStep('edit'); } else if (needsAttention) { void recoverOperationResults(); } else { openFramePicker(slot); } }}><b>{String(index + 1).padStart(2, '0')}</b>{connected ? <img src={connected.url} alt="" /> : <i><ImagePlus size={20} /></i>}<span>{slot.preset.title} · {slot.keyframeIndex + 1}/{slot.preset.frames.length}</span><em>{connected ? '이미지 준비 완료' : needsAttention ? operation?.state === 'failed' ? '실패 확인됨 · 다시 만들 수 있어요' : '결과 확인 필요' : '이미지 가져오기'}</em></SlotCard>;
              })}</SlotBoard>{slotFilter === 'failed' && !operations.some((item) => item.slot && !item.applied) ? <p role="status">확인이 필요한 프레임이 없어요.</p> : null}{!expectedSlots.length ? <p>장면을 선택하지 않아도 가져온 이미지를 편집할 수 있어요.</p> : null}</SlotSection>
              {frames.length ? <details><summary>가져온 원본 이미지 {frames.length}장</summary><ThumbGrid aria-label="가져온 결과 이미지">{frames.map((frame, index) => <ThumbButton key={frame.id} type="button" onClick={() => { setSelectedFrameId(frame.id); setStep('edit'); }}><img src={frame.url} alt={`${index + 1}번 ${frameLabel(frame, draft.presets)} 이미지`} /><span>{String(index + 1).padStart(2, '0')} · {frameLabel(frame, draft.presets)}</span></ThumbButton>)}</ThumbGrid></details> : null}
              <StepFooter><SecondaryButton type="button" onClick={() => setStep('plan')}><ArrowLeft size={16} /> 장면 고르기</SecondaryButton><PrimaryButton type="button" disabled={!canEdit} onClick={() => setStep('edit')}>프레임 편집 <ArrowRight size={16} /></PrimaryButton></StepFooter>
            </StepContent>
          ) : null}

          {step === 'edit' && selectedFrame ? (
            <EditorLayout aria-label="프레임 편집 워크스페이스">
              <EditorStatusBar>
                <div><span>FRAME EDITOR</span><strong>{draft.projectName}</strong></div>
                <EditorStatus role="status"><i /> {saveStatus} <b>{frames.length}개 이미지 · {completeCount}/{expectedSlots.length || frames.length} 슬롯</b></EditorStatus>
                <PrimaryButton type="button" onClick={() => setStep('export')}><FileArchive size={16} /> 검수·내보내기</PrimaryButton>
              </EditorStatusBar>
              <CharacterSourcePanel>
                <PanelTitle><div><span>CHARACTER SOURCE</span><strong>캐릭터 업로드</strong></div><small>기준 {submissionProfile.width}×{submissionProfile.height}px</small></PanelTitle>
                <EditorSourceButton type="button" onClick={() => sourceInputRef.current?.click()}>
                  {sourceUrl ? <img src={sourceUrl} alt={`${draft.characterName || '캐릭터'} 기준 이미지`} /> : <><ImagePlus size={28} /><strong>캐릭터 선택</strong></>}
                  <span><Upload size={13} /> 교체하기</span>
                </EditorSourceButton>
                <CharacterLocks><strong>캐릭터 고정 옵션</strong><div><span><Check /> 얼굴</span><span><Check /> 의상</span><span><Check /> 색상</span></div></CharacterLocks>
                <SourceSettings><strong>현재 {completeCount}/{expectedSlots.length}프레임 준비</strong><SecondaryButton type="button" onClick={() => setStep('plan')}>장면·프레임 구성 바꾸기</SecondaryButton></SourceSettings>
                <PrimaryButton type="button" onClick={() => setStep('import')}><Sparkles size={15} /> 이미지 제작</PrimaryButton>
              </CharacterSourcePanel>
              <ResultSidebar>
                <PanelTitle><div><span>GENERATED IMAGES</span><strong>생성된 이미지 <em>{frames.length}</em></strong></div><IconButton type="button" aria-label="결과 이미지 추가" onClick={() => openFramePicker()}><Plus size={17} /></IconButton></PanelTitle>
                <ResultList>{frames.map((frame, index) => <BulkFrameRow key={frame.id}><input type="checkbox" aria-label={`${index + 1}번 프레임 일괄 선택`} checked={selectedFrameIds.includes(frame.id)} onChange={(event) => setSelectedFrameIds((ids) => event.target.checked ? [...ids, frame.id] : ids.filter((id) => id !== frame.id))} /><ResultButton type="button" $active={frame.id === selectedFrame.id} aria-label={`${index + 1}번 ${frameLabel(frame, draft.presets)} 선택`} onClick={() => { setPreviewing(false); setSelectedFrameId(frame.id); }}><span>{index + 1}</span><img src={frame.url} alt="" /><strong>{frame.durationMs}ms</strong></ResultButton></BulkFrameRow>)}</ResultList>
                <BulkControls><label>선택 프레임 시간(ms)<input aria-label="일괄 노출 시간" type="number" min={MIN_FRAME_DURATION_MS} max={3000} step={10} value={bulkDuration} onChange={(event) => setBulkDuration(Math.max(MIN_FRAME_DURATION_MS, Math.min(3000, Number(event.target.value) || 140)))} /></label><SecondaryButton type="button" disabled={!selectedFrameIds.some((id) => frames.some((item) => item.id === id))} onClick={() => { updateFrameMeta(frames.map((item) => selectedFrameIds.includes(item.id) ? { ...item, durationMs: bulkDuration } : item)); toast.success('선택한 프레임의 재생 시간을 바꿨어요. 실행 취소할 수 있어요.'); }}>선택 시간 적용</SecondaryButton><button type="button" onClick={() => setSelectedFrameIds(selectedFrameIds.length === frames.length ? [] : frames.map((item) => item.id))}>전체 선택·해제</button></BulkControls>
                <SidebarHint>프레임을 선택하면 중앙 캔버스와 속성이 함께 바뀝니다.</SidebarHint>
              </ResultSidebar>
              <CanvasArea>
                <CanvasToolbar>
                  <div><span>CANVAS</span><strong>{frameLabel(selectedFrame, draft.presets)}</strong></div>
                  <CanvasTools>
                    <IconButton type="button" aria-label="편집 실행 취소" aria-keyshortcuts="Control+Z Meta+Z" disabled={!canUndoFrameEdit} onClick={undoFrameEdit}><RotateCcw size={16} /></IconButton>
                    <IconButton type="button" aria-label="편집 다시 실행" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" disabled={!canRedoFrameEdit} onClick={redoFrameEdit}><RotateCw size={16} /></IconButton>
                    <IconButton type="button" aria-label="축소" disabled={canvasZoom <= 60} onClick={() => setCanvasZoom((value) => Math.max(60, value - 10))}><ZoomOut size={16} /></IconButton>
                    <output aria-label="캔버스 확대 비율">{canvasZoom}%</output>
                    <IconButton type="button" aria-label="확대" disabled={canvasZoom >= 140} onClick={() => setCanvasZoom((value) => Math.min(140, value + 10))}><ZoomIn size={16} /></IconButton>
                    <IconButton type="button" aria-label="화면에 맞추기" onClick={() => setCanvasZoom(100)}><Maximize2 size={16} /></IconButton>
                  </CanvasTools>
                  <div><IconButton type="button" aria-label="앞으로 이동" disabled={frames[0]?.id === selectedFrame.id} onClick={() => moveFrame(selectedFrame.id, -1)}><ChevronLeft /></IconButton><IconButton type="button" aria-label="뒤로 이동" disabled={frames.at(-1)?.id === selectedFrame.id} onClick={() => moveFrame(selectedFrame.id, 1)}><ChevronRight /></IconButton></div>
                </CanvasToolbar>
                <CanvasStage>
                  <Canvas $zoom={canvasZoom} $aspect={`${submissionProfile.width}/${submissionProfile.height}`} data-composite-canvas>
                    <CanvasImageLayer data-layer-id="base" type="button" aria-label="기본 캐릭터 이미지 레이어" aria-pressed={selectedLayerId === 'base'} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown" $active={selectedLayerId === 'base'} style={{ left: `${selectedFrame.imageTransform.x}%`, top: `${selectedFrame.imageTransform.y}%`, width: `${selectedFrame.imageTransform.width}%`, transform: `translate(-50%,-50%) rotate(${selectedFrame.imageTransform.rotation}deg)`, opacity: selectedFrame.imageTransform.opacity / 100 }} onKeyDown={(event) => handleLayerKeyDown(event, 'base', selectedFrame.imageTransform)} onPointerDown={(event) => beginLayerDrag(event, 'base', selectedFrame.imageTransform)} onPointerMove={continueLayerDrag} onPointerUp={endLayerDrag} onPointerCancel={endLayerDrag}><img src={selectedFrame.url} alt={`${frameLabel(selectedFrame, draft.presets)} 미리보기`} draggable={false} /></CanvasImageLayer>
                    {selectedFrame.caption ? <CanvasSpeechLayer data-layer-id="caption" type="button" aria-label="기본 말풍선 레이어" aria-pressed={selectedLayerId === 'caption'} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown" $active={selectedLayerId === 'caption'} style={{ left: `${selectedFrame.captionTransform.x}%`, top: `${selectedFrame.captionTransform.y}%`, width: `${selectedFrame.captionTransform.width}%`, transform: `translate(-50%,-50%) rotate(${selectedFrame.captionTransform.rotation}deg)`, opacity: selectedFrame.captionTransform.opacity / 100 }} onKeyDown={(event) => handleLayerKeyDown(event, 'caption', selectedFrame.captionTransform)} onPointerDown={(event) => beginLayerDrag(event, 'caption', selectedFrame.captionTransform)} onPointerMove={continueLayerDrag} onPointerUp={endLayerDrag} onPointerCancel={endLayerDrag}>{selectedFrame.caption}</CanvasSpeechLayer> : null}
                    {selectedFrame.layers.map((layer) => layer.visible ? layer.type === 'image' && layer.assetId && layerAssetUrls[layer.assetId] ? <CanvasImageLayer key={layer.id} data-layer-id={layer.id} type="button" aria-label={`${layer.name} 레이어`} aria-pressed={selectedLayerId === layer.id} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown" $active={selectedLayerId === layer.id} style={{ left: `${layer.transform.x}%`, top: `${layer.transform.y}%`, width: `${layer.transform.width}%`, transform: `translate(-50%,-50%) rotate(${layer.transform.rotation}deg)`, opacity: layer.transform.opacity / 100 }} onKeyDown={(event) => handleLayerKeyDown(event, layer.id, layer.transform, layer.locked)} onPointerDown={(event) => beginLayerDrag(event, layer.id, layer.transform, layer.locked)} onPointerMove={continueLayerDrag} onPointerUp={endLayerDrag} onPointerCancel={endLayerDrag}><img src={layerAssetUrls[layer.assetId]} alt="" draggable={false} /></CanvasImageLayer> : layer.type === 'speech' ? <CanvasSpeechLayer key={layer.id} data-layer-id={layer.id} type="button" aria-label={`${layer.name} 레이어`} aria-pressed={selectedLayerId === layer.id} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown" $active={selectedLayerId === layer.id} style={{ left: `${layer.transform.x}%`, top: `${layer.transform.y}%`, width: `${layer.transform.width}%`, transform: `translate(-50%,-50%) rotate(${layer.transform.rotation}deg)`, opacity: layer.transform.opacity / 100 }} onKeyDown={(event) => handleLayerKeyDown(event, layer.id, layer.transform, layer.locked)} onPointerDown={(event) => beginLayerDrag(event, layer.id, layer.transform, layer.locked)} onPointerMove={continueLayerDrag} onPointerUp={endLayerDrag} onPointerCancel={endLayerDrag}>{layer.text || '말풍선'}</CanvasSpeechLayer> : null : null)}
                    {selectedTransform && !transformLocked ? <>
                      {selectedTransform.x === 50 ? <SnapGuide $vertical aria-hidden="true" /> : null}
                      {selectedTransform.y === 50 ? <SnapGuide aria-hidden="true" /> : null}
                      <TransformOverlay data-transform-overlay style={{ left: `${selectedTransform.x}%`, top: `${selectedTransform.y}%`, width: `${selectedTransform.width}%`, transform: `translate(-50%,-50%) rotate(${selectedTransform.rotation}deg)` }}>
                        <TransformHandle $rotate type="button" aria-label="선택 레이어 회전 핸들" onPointerDown={(event) => beginTransformHandle(event, 'rotate')} onPointerUp={endTransformHandle} onPointerCancel={endTransformHandle}><RotateCw size={13} /></TransformHandle>
                        <TransformHandle type="button" aria-label="선택 레이어 크기 조절 핸들" onPointerDown={(event) => beginTransformHandle(event, 'resize')} onPointerUp={endTransformHandle} onPointerCancel={endTransformHandle}><Maximize2 size={12} /></TransformHandle>
                      </TransformOverlay>
                    </> : null}
                  </Canvas>
                </CanvasStage>
                <CanvasMeta><span><i /> 원본 해상도 유지</span><span>{selectedFrame.fileName}</span><span>{selectedFrame.durationMs}ms</span></CanvasMeta>
              </CanvasArea>
              <Inspector>
                <InspectorTabs><button type="button" aria-pressed={inspectorTab === 'frame'} onClick={() => setInspectorTab('frame')}>프레임</button><button type="button" aria-pressed={inspectorTab === 'layers'} onClick={() => setInspectorTab('layers')}>레이어</button></InspectorTabs>
                {inspectorTab === 'frame' ? <>
                  <InspectorSection><h3>프레임 연결</h3><Field><span>연결할 연출 프레임</span><select value={selectedFrame.sceneId !== null && selectedFrame.keyframeIndex !== null ? `${selectedFrame.sceneId}:${selectedFrame.keyframeIndex}` : ''} onChange={(event) => { const slot = expectedSlots.find((item) => `${item.sceneId}:${item.keyframeIndex}` === event.target.value); updateSelectedFrame(getFrameSlotPatch(slot)); }}><option value="">프레임 미지정</option>{expectedSlots.map((slot) => <option key={`${slot.sceneId}:${slot.keyframeIndex}`} value={`${slot.sceneId}:${slot.keyframeIndex}`}>{slot.preset.title} · {slot.keyframeIndex + 1}/{slot.preset.frames.length}</option>)}</select></Field></InspectorSection>
                  <InspectorSection><h3>기본 말풍선</h3><Field><span>표시 문구</span><input value={selectedFrame.caption} maxLength={40} placeholder="표시할 문구를 입력하세요" onChange={(event) => updateSelectedFrame({ caption: event.target.value })} /></Field></InspectorSection>
                  <InspectorSection><h3>재생 시간</h3><Field><span>노출 시간</span><DurationValue><b>{(selectedFrame.durationMs / 1000).toFixed(2)}</b>초</DurationValue><input type="range" min={MIN_FRAME_DURATION_MS} max="3000" step="10" value={selectedFrame.durationMs} onChange={(event) => updateSelectedFrame({ durationMs: Number(event.target.value) })} /></Field></InspectorSection>
                </> : <>
                  <LayerAddBar><button type="button" onClick={() => layerInputRef.current?.click()}><ImagePlus size={15} /> 사진 추가</button><button type="button" onClick={addSpeechLayer}><MessageSquareText size={15} /> 말풍선 추가</button></LayerAddBar>
                  <LayerList aria-label="현재 프레임 레이어">
                    <LayerRow type="button" aria-pressed={selectedLayerId === 'base'} onClick={() => setSelectedLayerId('base')}><Images size={15} /><span><strong>캐릭터 이미지</strong><small>기본 · 이동 가능</small></span><Unlock size={13} /></LayerRow>
                    {selectedFrame.caption ? <LayerRow type="button" aria-pressed={selectedLayerId === 'caption'} onClick={() => setSelectedLayerId('caption')}><MessageSquareText size={15} /><span><strong>기본 말풍선</strong><small>{selectedFrame.caption}</small></span></LayerRow> : null}
                    {[...selectedFrame.layers].reverse().map((layer) => <LayerRow key={layer.id} type="button" aria-pressed={selectedLayerId === layer.id} onClick={() => setSelectedLayerId(layer.id)}>{layer.type === 'image' ? <ImagePlus size={15} /> : <MessageSquareText size={15} />}<span><strong>{layer.name}</strong><small>{layer.visible ? layer.type === 'image' ? '추가 이미지' : layer.text : '숨김'}</small></span>{layer.locked ? <Lock size={13} /> : <Unlock size={13} />}</LayerRow>)}
                  </LayerList>
                  {selectedCustomLayer ? <InspectorSection><h3>선택 레이어</h3><Field><span>레이어 이름</span><input disabled={transformLocked} value={selectedCustomLayer.name} maxLength={40} onChange={(event) => updateSelectedFrame({ layers: selectedFrame.layers.map((layer) => layer.id === selectedCustomLayer.id ? { ...layer, name: event.target.value } : layer) })} /></Field>{selectedCustomLayer.type === 'speech' ? <Field><span>말풍선 문구</span><textarea disabled={transformLocked} value={selectedCustomLayer.text || ''} maxLength={80} onChange={(event) => updateSelectedFrame({ layers: selectedFrame.layers.map((layer) => layer.id === selectedCustomLayer.id ? { ...layer, text: event.target.value } : layer) })} /></Field> : null}<LayerQuickActions><button type="button" disabled={transformLocked} aria-label={selectedCustomLayer.visible ? '레이어 숨기기' : '레이어 표시'} onClick={() => updateSelectedFrame({ layers: selectedFrame.layers.map((layer) => layer.id === selectedCustomLayer.id ? { ...layer, visible: !layer.visible } : layer) })}>{selectedCustomLayer.visible ? <Eye /> : <EyeOff />}</button><button type="button" aria-label={selectedCustomLayer.locked ? '레이어 잠금 해제' : '레이어 잠금'} onClick={() => updateSelectedFrame({ layers: selectedFrame.layers.map((layer) => layer.id === selectedCustomLayer.id ? { ...layer, locked: !layer.locked } : layer) })}>{selectedCustomLayer.locked ? <Lock /> : <Unlock />}</button><button type="button" disabled={transformLocked} aria-label="레이어 뒤로" onClick={() => moveSelectedLayer(-1)}><ChevronLeft /></button><button type="button" disabled={transformLocked} aria-label="레이어 앞으로" onClick={() => moveSelectedLayer(1)}><ChevronRight /></button><button type="button" disabled={transformLocked} aria-label="레이어 복제" onClick={duplicateSelectedLayer}><Copy /></button><button type="button" disabled={transformLocked} aria-label="레이어 삭제" onClick={() => void removeSelectedLayer()}><Trash2 /></button></LayerQuickActions></InspectorSection> : null}
                  {selectedTransform ? <TransformPanel><h3><Layers3 size={15} /> 위치와 크기</h3><TransformNumbers><Field><span>X 위치</span><input disabled={transformLocked} aria-label="레이어 X 위치" type="number" min="0" max="100" value={Math.round(selectedTransform.x)} onChange={(event) => updateSelectedTransform({ x: Number(event.target.value) })} /></Field><Field><span>Y 위치</span><input disabled={transformLocked} aria-label="레이어 Y 위치" type="number" min="0" max="100" value={Math.round(selectedTransform.y)} onChange={(event) => updateSelectedTransform({ y: Number(event.target.value) })} /></Field></TransformNumbers><Field><span>크기 {Math.round(selectedTransform.width)}%</span><input disabled={transformLocked} aria-label="레이어 크기" type="range" min="8" max="160" value={selectedTransform.width} onChange={(event) => updateSelectedTransform({ width: Number(event.target.value) })} /></Field><Field><span>회전 {Math.round(selectedTransform.rotation)}°</span><input disabled={transformLocked} aria-label="레이어 회전" type="range" min="-180" max="180" value={selectedTransform.rotation} onChange={(event) => updateSelectedTransform({ rotation: Number(event.target.value) })} /></Field><Field><span>투명도 {Math.round(selectedTransform.opacity)}%</span><input disabled={transformLocked} aria-label="레이어 투명도" type="range" min="10" max="100" value={selectedTransform.opacity} onChange={(event) => updateSelectedTransform({ opacity: Number(event.target.value) })} /></Field><NudgeGrid aria-label="레이어 미세 이동"><button disabled={transformLocked} type="button" onClick={() => updateSelectedTransform({ x: selectedTransform.x - 1 })}>←</button><button disabled={transformLocked} type="button" onClick={() => updateSelectedTransform({ y: selectedTransform.y - 1 })}>↑</button><button disabled={transformLocked} type="button" onClick={() => updateSelectedTransform({ y: selectedTransform.y + 1 })}>↓</button><button disabled={transformLocked} type="button" onClick={() => updateSelectedTransform({ x: selectedTransform.x + 1 })}>→</button><button disabled={transformLocked} type="button" onClick={() => updateSelectedTransform({ rotation: 0 })}><RotateCw size={14} /> 0°</button></NudgeGrid></TransformPanel> : null}
                </>}
                <InspectorNote><CheckCircle2 size={17} /><div><strong>비파괴 레이어 편집</strong><span>드래그·위치·크기·회전 값만 저장하고 원본 이미지는 덮어쓰지 않아요.</span></div></InspectorNote>
                <PlatformPreviewSection><strong>플랫폼별 실제 비율 미리보기</strong><div>{renderPlatformPreview('kakao')}{renderPlatformPreview('naver')}</div></PlatformPreviewSection>
                {!hasApiConsent ? <InspectorConsent><input id="editor-openrouter-consent" type="checkbox" checked={hasApiConsent} onChange={(event) => updateApiConsent(event.target.checked)} /><label htmlFor="editor-openrouter-consent">프레임 재생성의 별도 API 과금과 외부 전송을 확인했습니다.</label></InspectorConsent> : null}
                <p>재생성 모델: {selectedGenerationModel} · {generationMode === 'fast' ? '빠른 제작' : '고품질'} · 1장</p><SecondaryButton type="button" onClick={() => { setProductionMethod('ai'); setStep('import'); }}>AI 설정 확인</SecondaryButton><RegenerateButton type="button" disabled={!selectedSlot || generating || importing || !hasApiConsent || !currentUser || !modelReady || !journalReady || frameLimitExceeded} onClick={() => selectedSlot && void generateFramesWithOpenRouter([selectedSlot], selectedFrame.id)}><Sparkles size={16} /> 이 프레임만 다시 생성<small>{currentUser ? 'OpenRouter 요청 1회 · 기존 이미지는 성공 후 교체' : '로그인 후 사용할 수 있어요 · 기존 이미지는 성공 후 교체'}</small></RegenerateButton>
                <DangerButton type="button" onClick={() => void removeFrame(selectedFrame.id)}><Trash2 size={16} /> 이 프레임 제거</DangerButton>
              </Inspector>
              <Timeline>
                <TimelineActions><SecondaryButton type="button" onClick={() => openFramePicker()}><Plus size={16} /> 프레임 추가</SecondaryButton><PrimaryButton type="button" onClick={() => setPreviewing((value) => !value)}>{previewing ? <Pause size={16} /> : <Play size={16} />} {previewing ? '미리보기 정지' : '움짤 미리보기'}</PrimaryButton><small>드래그 대신 좌우 이동 버튼으로 순서를 안전하게 조정해요.</small></TimelineActions>
                <TimelineBody><TimelineHeader><div><span>FRAME TIMELINE</span><strong>순서와 재생 시간</strong></div><span>전체 {(frames.reduce((sum, frame) => sum + frame.durationMs, 0) / 1000).toFixed(2)}초 · {previewing ? '재생 중' : '반복 재생'}</span></TimelineHeader>
                <TimelineTrack>{frames.map((frame, index) => <TimelineItem key={frame.id} type="button" $active={frame.id === selectedFrame.id} onClick={() => { setPreviewing(false); setSelectedFrameId(frame.id); }}><span>{index + 1}</span><img src={frame.url} alt="" /><small>{(frame.durationMs / 1000).toFixed(2)}초</small></TimelineItem>)}</TimelineTrack></TimelineBody>
                <TimelineFooter><SecondaryButton type="button" onClick={() => setStep('import')}><ArrowLeft size={16} /> 결과 가져오기</SecondaryButton><PrimaryButton type="button" onClick={() => setStep('export')}>검수·내보내기 <ArrowRight size={16} /></PrimaryButton></TimelineFooter>
              </Timeline>
            </EditorLayout>
          ) : null}

          {step === 'edit' && !selectedFrame ? (
            <StepContent>
              <SectionHeading><span>03 · 만들고 다듬기</span><h1>프레임을 불러오면 움직임 편집기가 열려요</h1><p>편집할 이미지가 없을 때는 빈 캔버스 대신 필요한 데이터와 복구 방법을 안내합니다.</p></SectionHeading>
              <EmptyEditorState>
                <i><Layers3 size={32} /></i><strong role="status" aria-live="polite">아직 편집할 프레임이 없어요</strong><p>이미지 제작 화면에서 PNG·JPG·WebP를 가져오거나, 기획한 키프레임을 OpenRouter로 생성하면 기존 레이어 편집 워크스페이스가 자동으로 열립니다.</p>
                <div><SecondaryButton type="button" onClick={() => setStep('plan')}><FileText size={16} /> 기획 화면 보기</SecondaryButton><PrimaryButton type="button" onClick={() => setStep('import')}><Images size={16} /> 이미지 제작 열기</PrimaryButton></div>
                <EmptyEditorPreview aria-hidden="true"><span>캐릭터 소스</span><span>생성 이미지</span><b>투명 캔버스</b><span>속성·레이어</span><em>프레임 타임라인</em></EmptyEditorPreview>
              </EmptyEditorState>
            </StepContent>
          ) : null}

          {step === 'export' ? (
            <StepContent>
              <SectionHeading><span>04 · 검수하고 받기</span><h1>움직임을 확인하고 파일을 받아요</h1><p>다시 편집할 작업 백업과 플랫폼용 결과를 나누어 받을 수 있어요.</p></SectionHeading>
              {!reviewFrames.length ? <EmptyEditorState><i><Images size={32} /></i><strong role="status">내보낼 프레임이 아직 없어요</strong><p>이미지를 가져오면 장면별 재생과 결과 다운로드가 열려요. 현재 기획은 작업 백업으로 보관할 수 있어요.</p><div><SecondaryButton type="button" onClick={() => projectInputRef.current?.click()}>작업 ZIP 불러오기</SecondaryButton><PrimaryButton type="button" onClick={() => openFramePicker()}><Images size={16} /> 이미지 가져오기</PrimaryButton><SecondaryButton type="button" disabled={exporting || importing} onClick={exportWorkingBackup}>현재 기획 백업</SecondaryButton></div></EmptyEditorState> : <>
              <ExportHero><div><FileArchive size={30} /><h2>{draft.projectName}</h2><p>{PLATFORM_LABELS[draft.platform]} · 선택한 결과 {reviewFrames.length}장</p><small>작업 백업: 모든 원본·기획·편집 정보 / 플랫폼 결과: 선택한 장면의 합성 이미지·움짤 포함</small></div><ExportHeroActions><SecondaryButton type="button" disabled={exporting || importing} onClick={exportWorkingBackup}>작업 백업 받기</SecondaryButton><PrimaryButton type="button" onClick={exporting ? () => exportAbortRef.current?.abort() : exportProject}>{exporting ? <X size={17} /> : <Download size={17} />}{exporting ? 'ZIP 만들기 취소' : missingSlots.length ? '플랫폼 부분 결과 받기' : '플랫폼 결과 받기'}</PrimaryButton></ExportHeroActions></ExportHero>
              <ReviewProblems aria-label="검수 항목"><h2>먼저 확인해 주세요</h2>{missingSlots.length ? <div data-level="error"><strong>미완성 {missingSlots.length}프레임</strong><span>{missingSlots.slice(0, 3).map((slot) => `${slot.preset.title} ${slot.keyframeIndex + 1}번`).join(', ')}</span><SecondaryButton type="button" onClick={() => { setSlotFilter('missing'); setStep('import'); }}>미완성 위치 보기</SecondaryButton></div> : <p>선택한 장면의 모든 프레임이 연결됐어요.</p>}{reviewFrames.some((item) => item.sceneId === null) ? <div data-level="warning"><strong>장면에 연결하지 않은 이미지 {reviewFrames.filter((item) => item.sceneId === null).length}장</strong><span>플랫폼 결과에 포함되며 별도 장면으로 묶입니다.</span><SecondaryButton type="button" onClick={() => { setSelectedFrameId(reviewFrames.find((item) => item.sceneId === null)?.id || null); setStep('edit'); }}>연결 수정</SecondaryButton></div> : null}{!platformFrameGuidePass ? <div data-level="warning"><strong>장면 길이 또는 프레임 수를 확인해 주세요</strong><span>최대 {(maxSceneDurationMs / 1000).toFixed(2)}초 · {maxSceneFrameCount}프레임</span><SecondaryButton type="button" onClick={() => { const issue = reviewFrames.find((item) => { const stat = sceneAnimationStats.get(item.sceneId || 'unassigned'); return stat && (draft.platform === 'naver' ? stat.durationMs > 3000 || stat.frameCount > 100 : stat.frameCount > 24); }); setSelectedFrameId(issue?.id || null); setStep('edit'); }}>해당 장면 수정</SecondaryButton></div> : null}<div data-level="unchecked"><strong>사람의 확인이 필요한 항목</strong><span>캐릭터 일관성, 투명 배경 가장자리, 문구 가독성, 플랫폼별 파일 용량과 제출 구성</span></div></ReviewProblems>
              <Field><span>미리 볼 장면</span><select aria-label="미리 볼 장면" value={reviewSceneId} onChange={(event) => setReviewSceneId(event.target.value)}><option value="all">선택한 장면 전체 이어 보기</option>{draft.presets.filter((preset) => reviewFrames.some((item) => item.sceneId === preset.id)).map((preset) => <option key={preset.id} value={preset.id}>{preset.title}</option>)}{reviewFrames.some((item) => item.sceneId === null) ? <option value="unassigned">연결하지 않은 이미지</option> : null}</select></Field>
              <GifPreviewPanel><div><h2>실제 움직임 미리보기</h2><p>현재 위치·크기·말풍선·재생 시간을 반영해요.</p><small>{submissionProfile.width}×{submissionProfile.height}px · {previewFrames.length}프레임 · GIF 생성 후 눈으로 확인해 주세요.</small></div><GifPreviewStage>{gifPreviewUrl ? <img src={gifPreviewUrl} alt={`${draft.projectName} 실제 GIF 미리보기`} /> : <div><Play size={30} /><strong>움직임을 확인해 보세요</strong><span>GIF는 외부 전송 없이 이 브라우저에서 만들어요.</span></div>}</GifPreviewStage><GifPreviewActions><PrimaryButton type="button" disabled={!previewFrames.length || previewEncoding} onClick={() => void createGifPreview()}>{previewEncoding ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}{previewEncoding ? gifEncodingProgress || 'GIF 만드는 중…' : gifPreviewUrl ? 'GIF 다시 만들기' : '실제 GIF 미리보기 만들기'}</PrimaryButton>{previewEncoding ? <SecondaryButton type="button" onClick={() => gifAbortRef.current?.abort()}>GIF 만들기 취소</SecondaryButton> : <SecondaryButton type="button" disabled={!gifPreviewBlob} onClick={() => gifPreviewBlob && downloadBlob(gifPreviewBlob, `${draft.projectName || 'propig-emoticon'}-preview.gif`)}><Download size={16} />GIF만 다운로드</SecondaryButton>}{draft.platform === 'kakao' ? <SecondaryButton type="button" disabled={!gifPreviewBlob || webpEncoding || !currentUser} onClick={() => webpPreviewBlob ? downloadBlob(webpPreviewBlob, `${draft.projectName || 'propig-emoticon'}-animated.webp`) : void createWebpPreview()}>{!currentUser ? '로그인 후 WebP 변환' : webpEncoding ? 'WebP 변환 중…' : webpPreviewBlob ? 'animated WebP 다운로드' : 'animated WebP 자동 변환'}</SecondaryButton> : null}{gifPreviewBlob ? <small>미리보기 생성됨 · {(gifPreviewBlob.size / 1024).toFixed(1)}KB · 육안 검수 필요</small> : null}</GifPreviewActions></GifPreviewPanel>
              <details><summary>결과 파일과 규격 자세히 보기</summary><ExportGrid><ExportCard><CheckCircle2 /><strong>제출용 합성 PNG</strong><span>{submissionProfile.width}×{submissionProfile.height}px로 레이어를 합성합니다.</span></ExportCard><ExportCard><CheckCircle2 /><strong>장면별 GIF</strong><span>장면마다 재생 시간을 반영합니다. 카카오 제출 전 WebP 규격도 확인해 주세요.</span></ExportCard><ExportCard><CheckCircle2 /><strong>편집 정보·원본</strong><span>위치·크기·회전·투명도와 제작 지시를 보관합니다.</span></ExportCard></ExportGrid><ExportWarning><strong>{PLATFORM_LABELS[draft.platform]} 공식 제출 기준 확인</strong><p>{officialGuide.checkedAt} 확인한 참고값: {officialGuide.summary} 플랫폼 결과는 작업 패키지이며 제출 완료를 뜻하지 않아요.</p><a href={officialGuide.url} target="_blank" rel="noreferrer">현재 공식 가이드 열기 <ExternalLink size={14} /></a></ExportWarning></details>
              <StepFooter><SecondaryButton type="button" onClick={() => setStep('edit')}><ArrowLeft size={16} />프레임 편집</SecondaryButton><PrimaryButton type="button" disabled={exporting} onClick={exportProject}>{missingSlots.length ? '플랫폼 부분 결과 받기' : '플랫폼 결과 받기'}</PrimaryButton></StepFooter>
              </>}
            </StepContent>
          ) : null}
          </WorkArea>
          {!keyboardOpen && assetReady && !storageConflict ? <MobileAction><small>{PLATFORM_LABELS[draft.platform]} · {saveStatus}</small><PrimaryButton type="button" disabled={importing || exporting || (step === 'plan' && (!draft.selectedSceneIds.length || frameLimitExceeded)) || (step === 'import' && productionMethod === 'ai' && Boolean(generationBlockedReason) && !generating)} onClick={() => { if (step === 'project' || step === 'character') setStep('plan'); else if (step === 'plan') setStep('import'); else if (step === 'edit') setStep('export'); else if (step === 'export') { if (reviewFrames.length) void exportProject(); else openFramePicker(); } else if (productionMethod === 'ai') { if (generating) generationAbortRef.current?.abort(); else void generateFramesWithOpenRouter(); } else openFramePicker(); }}>{step === 'project' || step === 'character' ? '장면 고르기' : step === 'plan' ? '이 장면으로 만들기' : step === 'edit' ? '검수하고 받기' : step === 'export' ? reviewFrames.length ? '플랫폼 결과 받기' : '이미지 가져오기' : productionMethod === 'ai' ? generating ? '추가 생성 중지' : `${Math.min(generationBatchSize, missingSlots.length)}장 자동 생성` : '이미지 여러 장 선택'}</PrimaryButton></MobileAction> : null}
        </Workspace>
      </StudioBody>
    </StudioRoot>
  );
}

const StudioRoot = styled.main`
  --studio-bg: #f7f8fb;
  --studio-panel: #ffffff;
  --studio-panel-2: #f8f9fc;
  --studio-line: #e6e8ef;
  --studio-text: #242938;
  --studio-muted: #566174;
  --studio-accent: #6d35e8;
  --studio-mint: #22b573;
  flex:1;
  min-width:0;
  min-height:0;
  overflow-x:hidden;
  overflow-y:auto;
  overscroll-behavior:contain;
  scrollbar-gutter:stable;
  background: var(--studio-bg);
  color: var(--studio-text);
  button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #6130c9;outline-offset:3px}
  input,button,select,textarea,a{scroll-margin-top:100px;scroll-margin-bottom:110px}
  @media(max-width:900px){padding-bottom:100px}
  @media(max-width:900px){
    a[href],button,input:not([type="file"]),select{min-height:44px}
    a[href]{display:inline-flex;align-items:center}
  }
`;

const TopBar = styled.header`
  min-height: 60px;
  display: grid;
  grid-template-columns: minmax(300px,auto) minmax(180px,1fr) auto auto auto;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid var(--studio-line);
  background: rgba(255,255,255,.98);
  padding: 7px 16px;
  position: sticky;
  top: 0;
  z-index: 20;
  box-shadow:0 1px 4px rgba(24,32,55,.05);
  @media (max-width: 1180px) { grid-template-columns: minmax(280px,auto) minmax(180px,1fr) auto auto; >:nth-child(4){display:none} }
  @media (max-width: 940px) { grid-template-columns: minmax(230px,1fr) auto; >:nth-child(2),>:nth-child(3),>:nth-child(4){display:none} }
  @media (max-width: 720px) { position:relative;grid-template-columns:1fr;min-height:auto;padding:10px 12px;gap:8px;>div:last-child{justify-content:space-between;>button{width:auto;padding:0 10px;font-size:.78rem}} }
`;
const TopStart = styled.div`min-width:0;display:flex;align-items:center;gap:10px`;
const AdminHomeLink = styled.a`min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #dcd5eb;border-radius:9px;background:#fff;padding:0 10px;color:#4f3d76;font-size:.66rem;font-weight:900;text-decoration:none;white-space:nowrap;box-shadow:0 1px 3px rgba(41,30,72,.06);&:hover{border-color:#8b5cf6;background:#f7f3ff;color:#6230cd}&:focus-visible{outline:3px solid #5b21b6;outline-offset:2px}@media(max-width:480px){padding:0 8px;span{font-size:.62rem}}`;
const BrandBlock = styled.div`display:flex;align-items:center;gap:9px;min-width:0;color:var(--studio-text);text-decoration:none;div{display:grid;gap:1px}span{font-size:.48rem;font-weight:900;letter-spacing:.12em;color:#6732cf}strong{font-size:.9rem;white-space:nowrap}`;
const BrandMark = styled.i`width:35px;height:35px;border:2px solid #7c4be8;border-radius:12px;display:grid;place-items:center;background:#fff;color:#6d35e8;box-shadow:0 5px 16px rgba(109,53,232,.12);font-style:normal`;
const ProjectIdentity = styled.div`min-width:0;display:grid;gap:1px;border-left:1px solid var(--studio-line);padding-left:13px;small{color:#596174;font-size:.51rem}`;
const ProjectNameInput = styled.input`min-width:0;border:0;background:transparent;padding:2px 0;color:var(--studio-text);font-size:.78rem;font-weight:850;text-align:left;&:focus{outline:2px solid rgba(109,53,232,.2);border-radius:4px}@media(max-width:720px){display:none}`;
const TopPlatforms = styled.div`height:42px;display:flex;border:1px solid var(--studio-line);border-radius:8px;background:#fff;overflow:hidden;button{min-width:104px;border:0;border-right:1px solid var(--studio-line);background:#fff;color:#4e5669;padding:0 11px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:.66rem;font-weight:850;cursor:pointer}button:last-child{border-right:0}button[aria-pressed=true]{background:#f7f3ff;color:#6330d4}b{font-size:.7rem}`;
const ProductionMode = styled.div`height:42px;border:1px solid #e4dcfb;border-radius:8px;background:#faf8ff;color:#6d35e8;padding:0 12px;display:flex;align-items:center;gap:6px;font-size:.66rem;font-weight:900;white-space:nowrap`;
const TopMeta = styled.div`display:flex;align-items:center;justify-content:flex-end;gap:8px;@media(max-width:720px){.desktop-only,.mobile-hide,.top-export:disabled{display:none}}`;
const SaveState = styled.span`display:flex;align-items:center;gap:5px;color:#177a50;font-size:.75rem;font-weight:750;white-space:nowrap;&[data-error=true]{color:#ad2b30}`;
const BudgetMeta = styled.div`min-width:92px;height:42px;border:1px solid var(--studio-line);border-radius:8px;padding:5px 9px;display:grid;align-content:center;gap:1px;small{color:#596174;font-size:.48rem}strong{color:#4c5364;font-size:.57rem}@media(max-width:1080px){display:none}`;
const PrimaryButton = styled.button`min-height:44px;border:1px solid #7138d8;border-radius:9px;background:#7138d8;padding:0 15px;color:#fff;font-weight:900;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;&:hover:not(:disabled){background:#7c3aed}&:focus-visible{outline:2px solid #fff;outline-offset:2px}&:disabled{cursor:not-allowed;opacity:.42}@media(max-width:560px){width:100%}`;
const SecondaryButton = styled.button`min-height:44px;border:1px solid var(--studio-line);border-radius:8px;background:#fff;padding:0 14px;color:#596174;font-weight:850;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;&:hover:not(:disabled){border-color:#b9a4ed;background:#faf8ff;color:#6935da}&:focus-visible{outline:2px solid #8b5cf6;outline-offset:2px}&:disabled{opacity:.4}@media(max-width:560px){width:100%}`;
const StudioBody = styled.div`display:grid;grid-template-columns:108px minmax(0,1fr);min-height:calc(100vh - 60px);@media(max-width:900px){grid-template-columns:1fr}`;
const StepRail = styled.nav`border-right:1px solid var(--studio-line);background:#fff;padding:14px 8px;display:flex;flex-direction:column;gap:4px;@media(max-width:900px){display:none}`;
const StepButton = styled.button<{ $active:boolean;$done:boolean }>`position:relative;min-height:76px;border:0;border-radius:9px;background:${p=>p.$active?'#f4efff':'transparent'};padding:8px 4px;color:${p=>p.$active?'#6733d7':'#4e5668'};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;cursor:pointer;i{position:relative;width:31px;height:27px;display:grid;place-items:center;font-style:normal;color:${p=>p.$active?'#6733d7':'#4f586b'}}i b{position:absolute;right:-7px;top:-7px;width:17px;height:17px;border:2px solid #fff;border-radius:50%;display:grid;place-items:center;background:${p=>p.$active?'#6d35e8':'#f1f2f6'};color:${p=>p.$active?'#fff':'#50596b'};font-size:.48rem}strong{font-size:.62rem;white-space:nowrap}&:hover{background:#f7f5fc}&:focus-visible{outline:2px solid #8b5cf6}`;
const RailGuide = styled.aside`display:none`;
const Workspace = styled.div`min-width:0;min-height:0;overflow:visible`;
const MobileProgress = styled.nav`display:none;@media(max-width:900px){display:grid;gap:7px;padding:10px 12px;background:#fff;border-bottom:1px solid var(--studio-line);small{font-size:.76rem;color:var(--studio-muted)}div{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}button{min-width:0;min-height:48px;border:1px solid var(--studio-line);border-radius:8px;background:#fff;padding:6px 3px;color:#596174;font-size:.7rem;line-height:1.35;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer}button span{font-size:.65rem}button[aria-current=step]{border-color:#6d35e8;background:#f5f0ff;color:#5322b8;font-weight:800}}`;

const StepContent = styled.section`width:min(1180px,100%);margin:0 auto;padding:clamp(24px,4vw,54px);@media(max-width:560px){padding:22px 14px 96px}`;
const SectionHeading = styled.header.attrs({ tabIndex: -1, 'data-step-heading': '' })`max-width:760px;margin-bottom:28px;outline:none;span{color:#6030c7;font-size:.68rem;font-weight:950;letter-spacing:.12em}h1{margin:8px 0 0;font-size:clamp(1.65rem,3vw,2.65rem);line-height:1.13;letter-spacing:-.035em}p{margin:12px 0 0;color:#56647a;font-size:.92rem;line-height:1.65;word-break:keep-all}`;
const CharacterGrid = styled.div`display:grid;grid-template-columns:minmax(280px,.82fr) minmax(360px,1.18fr);gap:20px;@media(max-width:820px){grid-template-columns:1fr}`;
const UploadCard = styled.button`position:relative;min-height:430px;border:1px dashed #b9a4ed;border-radius:14px;background:radial-gradient(circle at 50% 45%,#faf7ff,transparent 58%),#fff;color:#7641df;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer;img{width:100%;height:100%;position:absolute;inset:0;object-fit:contain;padding:18px}strong{color:#34394a}span{color:#566174;font-size:.78rem}&:focus-visible{outline:2px solid #8b5cf6;outline-offset:3px}`;
const UploadOverlay = styled.i`position:absolute!important;left:50%;bottom:18px;transform:translateX(-50%);z-index:2;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(4,10,21,.78);padding:9px 13px;color:#fff;display:flex;gap:7px;align-items:center;font-size:.72rem;font-weight:900;font-style:normal;backdrop-filter:blur(10px)`;
const FormCard = styled.div`border:1px solid var(--studio-line);border-radius:16px;background:var(--studio-panel);padding:clamp(20px,3vw,30px);display:flex;flex-direction:column;gap:20px`;
const Field = styled.label`display:grid;gap:8px;color:#4e5669;font-size:.76rem;font-weight:900;input,textarea,select{width:100%;border:1px solid var(--studio-line);border-radius:9px;background:#fff;padding:11px 12px;color:#303646;font:inherit;font-weight:700;outline:none;&:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.12)}}textarea{min-height:126px;resize:vertical;line-height:1.55}input[type=range]{padding:0;accent-color:#8b5cf6}`;
const Segmented = styled.div`display:flex;gap:6px;flex-wrap:wrap;button{min-height:44px;border:1px solid var(--studio-line);border-radius:8px;background:#fff;padding:0 12px;color:#566174;font-weight:850;cursor:pointer}button[aria-pressed=true]{border-color:#8b5cf6;background:#f5f0ff;color:#6733d7}button:focus-visible{outline:2px solid #6030c7}`;
const PlatformGuide = styled.aside`border:1px solid #ded3f8;border-radius:10px;background:#faf8ff;padding:13px;display:flex;align-items:flex-start;gap:10px;color:#6d35e8;div{display:grid;gap:4px}strong{font-size:.76rem;color:#34394a}span,small{color:#566174;font-size:.67rem;line-height:1.45}small{color:#7c4be8;font-weight:800}a{margin-top:4px;color:#6d35e8;font-size:.65rem;font-weight:900;text-decoration:none;display:flex;align-items:center;gap:5px}`;
const Readiness = styled.ul`margin:0;padding:15px;border:1px solid var(--studio-line);border-radius:10px;background:#fff;display:grid;gap:10px;list-style:none;li{display:flex;align-items:center;gap:8px;color:#566174;font-size:.76rem;font-weight:800}li>span,svg{width:17px;height:17px}li>span{border:1px solid #b9bfca;border-radius:50%}li em{margin-left:auto;color:#566174;font-style:normal;font-size:.65rem}li[data-done=true]{color:#343a49}li[data-done=true] svg{color:#22b573}`;
const PlanToolbar = styled.div`border:1px solid var(--studio-line);border-radius:12px;background:var(--studio-panel);padding:15px 18px;display:flex;align-items:center;gap:20px;margin-bottom:14px;>div:first-child{display:grid;gap:3px;margin-right:auto}strong{font-size:.82rem}span{color:#566174;font-size:.69rem}@media(max-width:680px){align-items:flex-start;flex-wrap:wrap}`;
const SelectionCount = styled.div`display:flex;align-items:baseline;gap:5px;color:#5b2bc5;font-size:1.45rem;font-weight:950;span{font-size:.68rem!important}`;
const SceneGrid = styled.div`display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;@media(max-width:980px){grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:620px){grid-template-columns:1fr}`;
const SceneCard = styled.article<{ $selected:boolean }>`min-width:0;border:1px solid ${p=>p.$selected?'rgba(139,92,246,.65)':'var(--studio-line)'};border-radius:12px;background:${p=>p.$selected?'rgba(139,92,246,.1)':'var(--studio-panel)'};overflow:hidden;display:flex;flex-direction:column`;
const PresetSelect = styled.button`width:100%;min-height:150px;border:0;background:transparent;padding:14px;color:#34394a;display:grid;grid-template-columns:24px 1fr;gap:9px;text-align:left;cursor:pointer;i{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;border:1px solid #8b5cf6;background:#8b5cf6;color:#fff;font-style:normal}div{display:grid;align-content:start;gap:6px;min-width:0}strong{font-size:.88rem}span{color:#566174;font-size:.7rem;line-height:1.5;word-break:keep-all}em{color:#7140d8;font-size:.68rem;font-style:normal}&[aria-pressed=false] i{border-color:#c4c9d3;background:transparent}&:hover{background:rgba(139,92,246,.06)}&:focus-visible{outline:2px solid #8b5cf6;outline-offset:-3px}`;
const MiniFrames = styled.div`display:flex;gap:4px;padding:0 14px 11px;overflow-x:auto;span{flex:0 0 24px;height:24px;border:1px solid rgba(139,92,246,.3);border-radius:6px;background:#faf8ff;color:#7947dd;display:grid;place-items:center;font-size:.6rem;font-weight:900}`;
const PresetCardActions = styled.div`margin-top:auto;border-top:1px solid var(--studio-line);display:grid;grid-template-columns:repeat(3,1fr);button{min-height:44px;border:0;border-right:1px solid var(--studio-line);background:#fff;color:#4f5d73;font-size:.7rem;font-weight:850;cursor:pointer}button:last-child{border-right:0;color:#b42318}button:hover{background:#f5f0ff;color:#5b2bc5}button:focus-visible{outline:2px solid #6030c7;outline-offset:-2px}`;
const PresetEditor = styled.section`margin:0 0 18px;border:1px solid rgba(139,92,246,.35);border-radius:15px;background:linear-gradient(140deg,#faf8ff,#fff 35%);padding:clamp(16px,3vw,26px);display:grid;gap:20px`;
const PresetEditorHeader = styled.header`display:flex;justify-content:space-between;gap:16px;div{display:grid;gap:4px}span{color:#6030c7;font-size:.6rem;font-weight:950;letter-spacing:.12em}h2{margin:0;font-size:1.25rem}p{margin:0;color:#566174;font-size:.74rem}`;
const PresetMetaGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:14px;label:nth-child(n+3){grid-column:span 1}textarea{min-height:90px!important}@media(max-width:680px){grid-template-columns:1fr;label:nth-child(n){grid-column:auto}}`;
const KeyframeHeader = styled.div`display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:4px;border-top:1px solid var(--studio-line);div{display:grid;gap:4px}strong{font-size:.88rem}span{color:#566174;font-size:.7rem}@media(max-width:560px){align-items:stretch;flex-direction:column}`;
const KeyframeList = styled.div`display:grid;gap:8px`;
const KeyframeRow = styled.div`display:grid;grid-template-columns:30px minmax(220px,1fr) minmax(120px,.32fr) 120px 38px;gap:8px;align-items:end;border:1px solid var(--studio-line);border-radius:10px;background:#fff;padding:10px;b{width:28px;height:28px;border-radius:7px;background:#eee8fd;color:#5b2bc5;display:grid;place-items:center;align-self:center;font-size:.7rem}textarea{min-height:66px!important}input,textarea{padding:9px 10px!important}@media(max-width:850px){grid-template-columns:30px 1fr 1fr;label:nth-of-type(1){grid-column:2/-1}button{grid-column:3;justify-self:end}}@media(max-width:560px){grid-template-columns:30px 1fr;label:nth-of-type(n){grid-column:1/-1}button{grid-column:2}}`;
const PresetEditorFooter = styled.footer`display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:15px;border-top:1px solid var(--studio-line);>span{color:#6030c7;font-size:.75rem;font-weight:900}>div{display:flex;gap:8px}@media(max-width:560px){align-items:stretch;flex-direction:column}>div{display:grid;grid-template-columns:1fr 1fr}`;
const AiPlanner = styled.section`margin:0 0 18px;border:1px solid rgba(56,189,248,.28);border-radius:15px;background:linear-gradient(140deg,#f4fbff,#fff 34%);padding:clamp(16px,3vw,26px);display:grid;gap:18px;.spin{animation:studio-spin 1s linear infinite}@keyframes studio-spin{to{transform:rotate(360deg)}}`;
const AiPlannerHeader = styled.header`display:flex;justify-content:space-between;gap:16px;div{display:grid;gap:5px}span{color:#155e75;font-size:.6rem;font-weight:950;letter-spacing:.12em}h2{margin:0;font-size:1.3rem}p{margin:0;color:#566174;font-size:.75rem;line-height:1.5}`;
const PlannerForm = styled.div`display:grid;gap:13px;border:1px solid var(--studio-line);border-radius:12px;background:#fff;padding:15px;textarea{min-height:94px!important}`;
const PlannerSettings = styled.div`display:grid;grid-template-columns:repeat(3,1fr);gap:10px;@media(max-width:620px){grid-template-columns:1fr}`;
const AiModeGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:12px;@media(max-width:760px){grid-template-columns:1fr}`;
const AiModeCard = styled.article<{ $api?:boolean }>`border:1px solid ${p=>p.$api?'rgba(167,139,250,.42)':'var(--studio-line)'};border-radius:12px;background:${p=>p.$api?'rgba(139,92,246,.08)':'rgba(255,255,255,.025)'};padding:17px;display:grid;grid-template-columns:auto 1fr;gap:6px 11px;align-items:center;i{grid-row:1/4;width:38px;height:38px;border-radius:10px;background:${p=>p.$api?'rgba(139,92,246,.16)':'rgba(52,211,153,.12)'};color:${p=>p.$api?'#6d28d9':'#047857'};display:grid;place-items:center;font-style:normal}span{font-size:.58rem;color:#74869d;font-weight:950;letter-spacing:.08em}strong{font-size:.87rem}p{grid-column:1/-1;margin:8px 0;color:#59677b;font-size:.71rem;line-height:1.55}button,a{grid-column:1/-1}a{min-height:44px;border:1px solid var(--studio-line);border-radius:8px;color:#4f46a5;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:7px;font-size:.72rem;font-weight:850}`;
const ConsentBox = styled.div`border:1px solid rgba(245,158,11,.3);border-radius:10px;background:rgba(245,158,11,.07);padding:13px;display:flex;gap:10px;align-items:flex-start;input{margin-top:4px;width:18px;height:18px;accent-color:#8b5cf6}label{display:flex;gap:9px;color:#7a4b00;cursor:pointer;svg{flex:0 0 auto}span{display:grid;gap:4px}strong{font-size:.75rem}small{color:#6f5730;font-size:.67rem;line-height:1.45}}`;
const JsonImporter = styled.div`border-top:1px solid var(--studio-line);padding-top:17px;display:grid;grid-template-columns:1fr auto;gap:10px;div{display:grid;gap:4px}strong{font-size:.8rem}span{color:#566174;font-size:.68rem}textarea{grid-column:1/-1;min-height:130px;border:1px solid var(--studio-line);border-radius:9px;background:#071426;color:#dce7f4;padding:12px;font:600 .7rem/1.5 monospace;resize:vertical;outline:none}button{grid-column:2}@media(max-width:560px){grid-template-columns:1fr;button{grid-column:1}}`;
const CompletionBanner = styled.section`margin:0 0 12px;border:1px solid rgba(52,211,153,.28);border-radius:12px;background:rgba(16,185,129,.08);padding:14px 16px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;color:#047857;div{display:grid;gap:3px}strong{color:#136c4b;font-size:.83rem}span{color:#315f50;font-size:.67rem;line-height:1.45}button{min-width:170px}@media(max-width:620px){grid-template-columns:auto 1fr;button{grid-column:1/-1;width:100%}}`;
const PromptPreview = styled.div`margin-top:18px;border:1px solid rgba(139,92,246,.34);border-radius:13px;background:linear-gradient(120deg,rgba(139,92,246,.12),rgba(12,24,43,.92));padding:20px;display:flex;align-items:center;gap:20px;>div:first-child{display:grid;gap:5px;margin-right:auto}span{color:#d8ccff;font-size:.62rem;font-weight:950;letter-spacing:.1em}strong{color:#fff;font-size:1rem}p{margin:0;color:#899ab1;font-size:.75rem;line-height:1.45}@media(max-width:720px){align-items:stretch;flex-direction:column}`;
const PromptActions = styled.div`display:flex;gap:8px;flex:0 0 auto;@media(max-width:560px){flex-direction:column}`;
const StepFooter = styled.footer`display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:24px;padding-top:18px;border-top:1px solid var(--studio-line);@media(max-width:560px){position:static;padding:14px 0 0;background:transparent;button{width:auto;flex:1}}`;
const SlotSection = styled.section`margin-top:18px;border:1px solid var(--studio-line);border-radius:14px;background:var(--studio-panel);padding:16px`;
const SlotHeader = styled.header`display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:12px;div{display:grid;gap:4px}span{color:#6030c7;font-size:.58rem;font-weight:950;letter-spacing:.1em}strong{font-size:.9rem}small{color:#566174;font-size:.65rem}@media(max-width:620px){align-items:start;flex-direction:column}`;
const SlotBoard = styled.div`display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;@media(max-width:980px){grid-template-columns:repeat(4,minmax(0,1fr))}@media(max-width:560px){display:flex;overflow-x:auto;padding-bottom:5px}`;
const SlotCard = styled.button<{ $status:'ready'|'missing' }>`position:relative;min-width:0;border:1px ${p=>p.$status==='ready'?'solid':'dashed'} ${p=>p.$status==='ready'?'rgba(139,92,246,.5)':'rgba(148,163,184,.25)'};border-radius:10px;background:${p=>p.$status==='ready'?'rgba(139,92,246,.07)':'rgba(255,255,255,.02)'};padding:6px;color:var(--studio-text);display:grid;gap:5px;text-align:left;cursor:${p=>p.$status==='ready'?'pointer':'default'};opacity:1!important;b{position:absolute;left:10px;top:10px;z-index:2;width:21px;height:21px;border-radius:6px;background:rgba(4,10,20,.78);display:grid;place-items:center;color:#fff;font-size:.56rem}img,i{width:100%;aspect-ratio:1;border-radius:7px}img{object-fit:contain;background:#fff}i{display:grid;place-items:center;background:rgba(148,163,184,.06);color:#607088;font-style:normal}span{font-size:.62rem;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}em{color:${p=>p.$status==='ready'?'#6ee7b7':'#566174'};font-size:.56rem;font-style:normal}@media(max-width:560px){flex:0 0 112px}`;
const ThumbGrid = styled.div`display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin-top:16px;@media(max-width:900px){grid-template-columns:repeat(4,minmax(0,1fr))}@media(max-width:560px){grid-template-columns:repeat(2,minmax(0,1fr))}`;
const ThumbButton = styled.button`border:1px solid var(--studio-line);border-radius:9px;background:#fff;padding:5px;color:#4e5669;overflow:hidden;cursor:pointer;img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border-radius:6px}span{display:block;padding:7px 3px 3px;font-size:.65rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}&:hover{border-color:#8b5cf6}`;
const EditorLayout = styled.section`
  height:calc(100vh - 60px);min-height:650px;display:grid;grid-template-columns:220px 250px minmax(400px,1fr) 300px;grid-template-rows:48px minmax(380px,1fr) 184px;background:var(--studio-bg);color:var(--studio-text);overflow:hidden;
  @media(max-width:1280px){grid-template-columns:220px minmax(380px,1fr) 280px}
  @media(max-width:980px){height:auto;min-height:auto;display:flex;flex-direction:column;padding-bottom:86px;overflow:visible}
`;
const EditorStatusBar = styled.header`
  grid-column:1/-1;border-bottom:1px solid var(--studio-line);background:#fff;padding:5px 14px;display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;
  >div:first-child{display:flex;align-items:baseline;gap:10px;min-width:0}span{color:#7c3aed;font-size:.58rem;font-weight:950;letter-spacing:.1em}strong{font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  button{min-height:38px}@media(max-width:760px){order:0;grid-template-columns:1fr auto;padding:10px 12px;>div:first-child span{display:none}>button{display:none}}
`;
const EditorStatus = styled.div`display:flex;align-items:center;gap:7px;color:var(--studio-muted);font-size:.68rem;font-weight:800;white-space:nowrap;i{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px #dcfce7}b{border-left:1px solid #e5e7eb;padding-left:8px;color:#4b5563}`;
const CharacterSourcePanel = styled.aside`min-width:0;border-right:1px solid var(--studio-line);background:#fff;padding:0 12px 12px;display:flex;flex-direction:column;gap:11px;>header{margin:0 -12px}@media(max-width:1280px){display:none}@media(max-width:980px){display:flex;order:2;border-top:1px solid var(--studio-line);border-right:0}`;
const EditorSourceButton = styled.button`position:relative;min-height:205px;border:1px dashed #bba6ed;border-radius:9px;background:#fff;color:#6d35e8;overflow:hidden;display:grid;place-items:center;align-content:center;gap:7px;cursor:pointer;img{position:absolute;inset:8px;width:calc(100% - 16px);height:calc(100% - 52px);object-fit:contain}span{position:absolute;left:50%;bottom:9px;transform:translateX(-50%);min-width:92px;height:30px;border-radius:6px;background:#f3effc;color:#6d35e8;display:flex;align-items:center;justify-content:center;gap:5px;font-size:.59rem;font-weight:900}`;
const CharacterLocks = styled.div`display:grid;gap:8px;padding:8px 0;border-top:1px solid var(--studio-line);border-bottom:1px solid var(--studio-line);>strong{font-size:.65rem}div{display:flex;justify-content:space-between;gap:5px}span{display:flex;align-items:center;gap:4px;color:#596174;font-size:.57rem;font-weight:800}svg{width:13px;height:13px;border-radius:3px;background:#6d35e8;color:#fff;padding:2px}`;
const SourceSettings = styled.div`display:grid;gap:6px;label{display:grid;gap:5px;color:#596174;font-size:.61rem;font-weight:850}select{height:34px;border:1px solid var(--studio-line);border-radius:7px;background:#fff;color:#33394a;padding:0 9px}small{color:#64748b;font-size:.55rem}`;
const ResultSidebar = styled.aside`min-width:0;border-right:1px solid var(--studio-line);background:var(--studio-panel);display:flex;flex-direction:column;@media(max-width:1280px){grid-column:1}@media(max-width:980px){order:3;border-right:0;border-top:1px solid var(--studio-line)}`;
const PanelTitle = styled.header`min-height:66px;padding:13px 14px;border-bottom:1px solid var(--studio-line);display:flex;align-items:center;justify-content:space-between;gap:10px;div{display:grid;gap:3px}span{color:#566174;font-size:.56rem;font-weight:950;letter-spacing:.09em}strong{color:var(--studio-text);font-size:.78rem}em{color:#7c3aed;font-style:normal}`;
const IconButton = styled.button`width:36px;height:36px;border:1px solid var(--studio-line);border-radius:8px;background:var(--studio-panel-2);color:var(--studio-muted);display:grid;place-items:center;cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,.03);&:disabled{opacity:.3}&:hover:not(:disabled){border-color:#8b5cf6;color:#7c3aed;background:#faf8ff}&:focus-visible{outline:2px solid #8b5cf6;outline-offset:2px}`;
const ResultList = styled.div`min-height:0;flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px;overflow:auto;align-content:start;@media(max-width:1180px){grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:980px){display:flex;max-height:none;overflow-x:auto;padding:12px}`;
const ResultButton = styled.button<{ $active:boolean }>`position:relative;min-width:0;border:2px solid ${p=>p.$active?'#8b5cf6':'#eef0f5'};border-radius:10px;background:${p=>p.$active?'#f6f2ff':'#fff'};padding:5px;color:var(--studio-text);display:grid;gap:4px;text-align:left;cursor:pointer;box-shadow:${p=>p.$active?'0 0 0 2px rgba(139,92,246,.1)':'0 1px 2px rgba(16,24,40,.04)'};>span{position:absolute;left:8px;top:8px;z-index:1;width:18px;height:18px;border-radius:5px;background:rgba(255,255,255,.92);color:#525b70;display:grid;place-items:center;font-size:.57rem;font-weight:950;box-shadow:0 1px 4px rgba(0,0,0,.12)}img{width:100%;aspect-ratio:1;object-fit:contain;background-image:linear-gradient(45deg,#edf0f4 25%,transparent 25%),linear-gradient(-45deg,#edf0f4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#edf0f4 75%),linear-gradient(-45deg,transparent 75%,#edf0f4 75%);background-size:12px 12px;background-position:0 0,0 6px,6px -6px,-6px 0;border-radius:6px}strong{padding:0 2px;color:#7a8396;font-size:.56rem;text-align:right}@media(max-width:760px){flex:0 0 92px}`;
const SidebarHint = styled.p`margin:auto 12px 14px;border-radius:8px;background:var(--studio-panel-2);padding:10px;color:var(--studio-muted);font-size:.62rem;line-height:1.5;@media(max-width:760px){display:none}`;
const CanvasArea = styled.div`min-width:0;min-height:0;display:flex;flex-direction:column;background:#f9fafc;@media(max-width:1280px){grid-column:2}@media(max-width:980px){order:1;min-height:500px}`;
const CanvasToolbar = styled.header`min-height:66px;border-bottom:1px solid var(--studio-line);background:var(--studio-panel);padding:10px 14px;display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;>div:first-child{display:grid;gap:3px}span{font-size:.56rem;color:#566174;font-weight:950;letter-spacing:.1em}strong{color:var(--studio-text);font-size:.78rem}>div:last-child{display:flex;gap:5px}@media(max-width:760px){grid-template-columns:1fr auto;>div:last-child{display:none}}`;
const CanvasTools = styled.div`display:flex;align-items:center;gap:4px;padding:3px;border:1px solid var(--studio-line);border-radius:9px;background:var(--studio-panel-2);output{min-width:46px;text-align:center;color:var(--studio-muted);font-size:.64rem;font-weight:850}`;
const CanvasStage = styled.div`min-height:0;flex:1;display:grid;place-items:center;overflow:hidden;padding:18px;background:#fafbfc;@media(max-width:980px){padding:16px;min-height:390px}`;
const Canvas = styled.figure<{ $zoom:number;$aspect:string }>`width:min(560px,90%);aspect-ratio:${p=>p.$aspect};margin:0;position:relative;overflow:hidden;border:1px solid #dfe3ea;border-radius:5px;background-color:#fff;background-image:linear-gradient(45deg,#edf0f3 25%,transparent 25%),linear-gradient(-45deg,#edf0f3 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#edf0f3 75%),linear-gradient(-45deg,transparent 75%,#edf0f3 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-6px 0;box-shadow:0 18px 55px rgba(33,42,62,.12);transform:scale(${p=>p.$zoom/100});transform-origin:center;transition:transform .18s ease;touch-action:none;@media(max-width:760px){width:min(430px,100%)}`;
const CanvasImageLayer = styled.button<{ $active:boolean }>`position:absolute;z-index:2;border:2px solid ${p=>p.$active?'#8b5cf6':'transparent'};background:transparent;padding:0;cursor:move;touch-action:none;img{width:100%;height:auto;display:block;object-fit:contain;pointer-events:none;user-select:none}&:focus-visible{outline:2px solid #8b5cf6;outline-offset:2px}`;
const CanvasSpeechLayer = styled.button<{ $active:boolean }>`position:absolute;z-index:3;border:3px solid ${p=>p.$active?'#8b5cf6':'#111827'};border-radius:999px;background:#fff;padding:8px 13px;color:#111827;font-size:clamp(.72rem,1.8vw,1.16rem);font-weight:950;line-height:1.15;overflow-wrap:anywhere;box-shadow:0 4px 0 #111827;cursor:move;touch-action:none;&:after{content:'';position:absolute;left:22%;bottom:-10px;width:14px;height:14px;border-right:3px solid #111827;border-bottom:3px solid #111827;background:#fff;transform:rotate(45deg)}&:focus-visible{outline:2px solid #8b5cf6;outline-offset:3px}`;
const SnapGuide = styled.span<{ $vertical?:boolean }>`position:absolute;z-index:8;pointer-events:none;background:rgba(99,102,241,.72);${p=>p.$vertical?'top:0;bottom:0;left:50%;width:1px':'left:0;right:0;top:50%;height:1px'}`;
const TransformOverlay = styled.div`position:absolute;z-index:9;aspect-ratio:1;pointer-events:none;border:1px dashed #7c3aed;border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,.8);`;
const TransformHandle = styled.button<{ $rotate?:boolean }>`position:absolute;right:${p=>p.$rotate?'50%':'-11px'};bottom:${p=>p.$rotate?'auto':'-11px'};top:${p=>p.$rotate?'50%':'auto'};width:24px;height:24px;transform:${p=>p.$rotate?'translate(50%,-50%)':'none'};display:grid;place-items:center;border:2px solid #fff;border-radius:999px;background:#7c3aed;color:#fff;box-shadow:0 2px 8px rgba(30,41,59,.35);cursor:${p=>p.$rotate?'grab':'nwse-resize'};touch-action:none;pointer-events:auto;&:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}`;
const CanvasMeta = styled.footer`min-height:36px;border-top:1px solid var(--studio-line);background:var(--studio-panel);padding:0 14px;display:flex;align-items:center;justify-content:center;gap:16px;color:#64748b;font-size:.58rem;font-weight:750;span{display:flex;align-items:center;gap:6px}i{width:6px;height:6px;border-radius:50%;background:#22c55e}@media(max-width:560px){span:nth-child(2){display:none}}`;
const Inspector = styled.aside.attrs({ className:'inspector' })`min-height:0;border-left:1px solid var(--studio-line);background:var(--studio-panel);padding-bottom:14px;display:flex;flex-direction:column;color:var(--studio-text);overflow-y:auto;@media(max-width:1280px){grid-column:3}@media(max-width:980px){order:4;border-left:0;border-top:1px solid var(--studio-line);overflow:visible}`;
const InspectorTabs = styled.div`min-height:58px;border-bottom:1px solid var(--studio-line);display:grid;grid-template-columns:1fr 1fr;padding:0 14px;button{border:0;border-bottom:2px solid transparent;background:transparent;color:#596174;font-size:.72rem;font-weight:900;cursor:pointer}button[aria-pressed=true]{border-color:#7c3aed;color:#7c3aed}`;
const InspectorSection = styled.section`padding:16px;border-bottom:1px solid var(--studio-line);display:grid;gap:12px;h3{margin:0;color:var(--studio-text);font-size:.72rem}label{color:var(--studio-muted)}input,select{background:var(--studio-bg)!important;color:var(--studio-text)!important;border-color:var(--studio-line)!important}`;
const LayerAddBar = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:12px 14px;border-bottom:1px solid var(--studio-line);button{min-height:38px;border:1px solid var(--studio-line);border-radius:8px;background:var(--studio-panel-2);color:var(--studio-text);display:flex;align-items:center;justify-content:center;gap:6px;font-size:.67rem;font-weight:850;cursor:pointer}`;
const LayerList = styled.div`display:grid;gap:6px;padding:12px 14px;border-bottom:1px solid var(--studio-line);max-height:230px;overflow-y:auto`;
const LayerRow = styled.button`min-width:0;min-height:43px;border:1px solid var(--studio-line);border-radius:8px;background:var(--studio-panel-2);padding:7px 9px;color:var(--studio-muted);display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;text-align:left;cursor:pointer;span{min-width:0;display:grid;gap:2px}strong,small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}strong{color:var(--studio-text);font-size:.67rem}small{color:var(--studio-muted);font-size:.56rem}&[aria-pressed=true]{border-color:#8b5cf6;background:rgba(139,92,246,.12);color:#6030c7}`;
const LayerQuickActions = styled.div`display:grid;grid-template-columns:repeat(6,1fr);gap:5px;button{height:34px;border:1px solid var(--studio-line);border-radius:7px;background:var(--studio-panel-2);color:var(--studio-muted);display:grid;place-items:center;cursor:pointer}svg{width:14px;height:14px}button:last-child{color:#f87171}`;
const TransformPanel = styled.section`padding:16px;border-bottom:1px solid var(--studio-line);display:grid;gap:12px;h3{margin:0;display:flex;align-items:center;gap:7px;font-size:.72rem}label{color:var(--studio-muted)}input{background:var(--studio-bg)!important;color:var(--studio-text)!important;border-color:var(--studio-line)!important}`;
const TransformNumbers = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:8px`;
const NudgeGrid = styled.div`display:grid;grid-template-columns:repeat(5,1fr);gap:5px;button{height:32px;border:1px solid var(--studio-line);border-radius:7px;background:var(--studio-panel-2);color:var(--studio-text);display:flex;align-items:center;justify-content:center;gap:3px;cursor:pointer}`;
const DurationValue = styled.output`display:flex;align-items:baseline;gap:4px;color:#596174;font-size:.62rem;b{color:#7c3aed;font-size:1.25rem}`;
const InspectorNote = styled.div`margin:14px 14px 0;border:1px solid rgba(52,211,153,.22);border-radius:9px;background:rgba(16,185,129,.07);padding:11px;display:flex;gap:9px;color:#16a36a;div{display:grid;gap:4px}strong{font-size:.69rem}span{color:#748094;font-size:.61rem;line-height:1.45}`;
const PlatformPreviewSection = styled.section`padding:14px;border-bottom:1px solid var(--studio-line);display:grid;gap:9px;>strong{font-size:.68rem}>div{display:grid;grid-template-columns:1fr 1fr;gap:7px}`;
const PlatformPreviewCard = styled.article`min-width:0;border:1px solid #dde2eb;border-radius:8px;background:#eef6ff;overflow:hidden;header{height:25px;padding:0 7px;background:#fff;display:flex;align-items:center;gap:5px;font-size:.51rem}header b{width:14px;height:14px;border-radius:4px;background:#ffe500;display:grid;place-items:center;font-size:.4rem}footer{height:23px;padding:0 6px;background:#fff;display:flex;align-items:center;gap:5px;color:#929aaa;font-size:.46rem}footer span{flex:1;border:1px solid #e7e9ee;border-radius:6px;padding:2px 5px}footer i{font-style:normal}`;
const PlatformChat = styled.div`min-height:118px;padding:10px 8px;display:grid;place-items:center;background:linear-gradient(#dcecf9,#e9f4fc)`;
const PlatformMiniCanvas = styled.div<{ $aspect:string }>`position:relative;width:74px;aspect-ratio:${p=>p.$aspect};overflow:hidden;border-radius:7px;background-color:#fff;background-image:linear-gradient(45deg,#edf0f3 25%,transparent 25%),linear-gradient(-45deg,#edf0f3 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#edf0f3 75%),linear-gradient(-45deg,transparent 75%,#edf0f3 75%);background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0;box-shadow:0 2px 6px rgba(36,52,73,.1);img,span{position:absolute}img{height:auto}span{z-index:4;border:1px solid #111827;border-radius:999px;background:#fff;padding:2px 4px;color:#111827;font-size:.27rem;font-weight:900;text-align:center;overflow-wrap:anywhere}`;
const InspectorConsent = styled.div`margin:12px 14px 0;border:1px solid #d7ad55;border-radius:9px;background:#fff9eb;padding:10px;display:flex;align-items:flex-start;gap:8px;color:#6b4700;font-size:.62rem;line-height:1.45;input{flex:0 0 auto;margin-top:2px;accent-color:#8b5cf6}label{cursor:pointer}`;
const DangerButton = styled.button`min-height:40px;margin:14px 14px 0;border:1px solid rgba(248,113,113,.25);border-radius:8px;background:rgba(239,68,68,.07);color:#dc5050;display:flex;align-items:center;justify-content:center;gap:7px;font-weight:850;cursor:pointer`;
const RegenerateButton = styled.button`min-height:48px;margin:14px 14px 0;border:1px solid rgba(139,92,246,.35);border-radius:9px;background:#f7f3ff;color:#6632d6;display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:center;justify-content:center;text-align:left;font-weight:900;cursor:pointer;svg{grid-row:1/3}small{color:#81769d;font-size:.57rem;font-weight:700}&:disabled{opacity:.38;cursor:not-allowed}`;
const Timeline = styled.div`grid-column:1/-1;border-top:1px solid var(--studio-line);background:#fff;padding:10px 14px 12px;display:grid;grid-template-columns:140px minmax(0,1fr) 150px;gap:14px;align-items:stretch;@media(max-width:1180px){grid-template-columns:126px minmax(0,1fr);.timeline-footer{grid-column:1/-1}}@media(max-width:980px){order:5;display:flex;flex-direction:column;padding:14px 12px 96px}`;
const TimelineActions = styled.div`display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--studio-line);padding-right:14px;button{width:100%;min-height:38px;padding:0 10px;font-size:.68rem}button:first-child{border-color:#dfe3ea;background:#fff;color:#5f687a}small{margin-top:auto;color:#7f899c;font-size:.56rem;line-height:1.45}@media(max-width:760px){border-right:0;padding-right:0;display:grid;grid-template-columns:1fr 1fr;small{grid-column:1/-1}}`;
const TimelineBody = styled.div`min-width:0`;
const TimelineHeader = styled.div`display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;div{display:flex;align-items:baseline;gap:8px}div span{color:#596174;font-size:.54rem;font-weight:950;letter-spacing:.1em}strong{color:var(--studio-text);font-size:.72rem}>span{color:#566174;font-size:.62rem}`;
const TimelineTrack = styled.div`display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px`;
const TimelineItem = styled.button<{ $active:boolean }>`position:relative;flex:0 0 84px;border:2px solid ${p=>p.$active?'#8b5cf6':'#eceef3'};border-radius:9px;background:${p=>p.$active?'#f7f3ff':'#fff'};padding:5px;color:var(--studio-text);cursor:pointer;box-shadow:${p=>p.$active?'0 0 0 2px rgba(139,92,246,.09)':'none'};>span{position:absolute;left:8px;top:8px;z-index:1;width:18px;height:18px;border-radius:5px;background:rgba(255,255,255,.92);display:grid;place-items:center;font-size:.54rem;font-weight:950;box-shadow:0 1px 4px rgba(0,0,0,.12)}img{width:100%;aspect-ratio:1;object-fit:contain;background:#f8f9fb;border-radius:5px}small{display:block;margin-top:4px;color:#798396;font-size:.55rem}`;
const TimelineFooter = styled.div.attrs({ className:'timeline-footer' })`display:flex;flex-direction:column;justify-content:center;gap:8px;border-left:1px solid var(--studio-line);padding-left:14px;button{min-height:38px;font-size:.67rem}button:first-child{border-color:#dfe3ea;background:#fff;color:#5f687a}@media(max-width:980px){border-left:0;padding-left:0;flex-direction:row;justify-content:flex-end}@media(max-width:760px){button{flex:1}}`;
const EmptyEditorState = styled.section`border:1px solid #ded3f8;border-radius:16px;background:#fff;padding:clamp(24px,4vw,42px);display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;>i{width:64px;height:64px;border-radius:18px;background:#f4efff;color:#6d35e8;display:grid;place-items:center;font-style:normal}>strong{font-size:1.1rem}>p{max-width:660px;margin:0;color:#566174;font-size:.78rem;line-height:1.65}>div:not(:last-child){display:flex;gap:8px;margin-top:8px}@media(max-width:560px){>div:not(:last-child){width:100%;display:grid;grid-template-columns:1fr}}`;
const EmptyEditorPreview = styled.div`width:100%;min-height:220px;margin-top:22px;border:1px solid var(--studio-line);border-radius:12px;background:#f8f9fc;padding:10px;display:grid!important;grid-template-columns:18% 22% 1fr 22%;grid-template-rows:1fr 52px;gap:7px;span,b,em{border:1px dashed #c8ccd6;border-radius:8px;background:#fff;color:#566174;display:grid;place-items:center;font-size:.6rem;font-style:normal}b{background-image:linear-gradient(45deg,#edf0f3 25%,transparent 25%),linear-gradient(-45deg,#edf0f3 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#edf0f3 75%),linear-gradient(-45deg,transparent 75%,#edf0f3 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;color:#6f7788}em{grid-column:1/-1}@media(max-width:640px){min-height:280px;grid-template-columns:1fr 1fr;grid-template-rows:70px 120px 55px;span:nth-of-type(3){grid-column:2}b{grid-column:1/-1;grid-row:2}em{grid-row:3}}`;
const ExportHero = styled.div`border:1px solid #ded3f8;border-radius:16px;background:radial-gradient(circle at 15% 30%,rgba(139,92,246,.13),transparent 42%),#fff;padding:28px;display:flex;align-items:center;gap:25px;box-shadow:0 8px 26px rgba(54,42,94,.05);>div{display:grid;gap:7px;margin-right:auto;color:#7950d6}span{font-size:.62rem;font-weight:950;letter-spacing:.1em}h2{margin:0;color:#2e3444;font-size:1.5rem}p{margin:0;color:#566174;font-size:.78rem}@media(max-width:700px){align-items:stretch;flex-direction:column}}`;
const ExportHeroActions = styled.div`display:flex!important;grid-template-columns:none!important;gap:8px!important;margin:0!important;@media(max-width:700px){display:grid!important;grid-template-columns:1fr!important}button{white-space:nowrap}`;
const GifPreviewPanel = styled.section`margin-top:16px;border:1px solid rgba(139,92,246,.35);border-radius:15px;background:var(--studio-panel);padding:18px;display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,.65fr);gap:16px;align-items:center;>div:first-child{display:grid;gap:7px}span{color:#6030c7;font-size:.59rem;font-weight:950;letter-spacing:.1em}h2{margin:0;font-size:1rem}p{margin:0;color:var(--studio-muted);font-size:.72rem;line-height:1.55}small{color:#5b2bc5;font-size:.65rem;font-weight:850}.spin{animation:studio-spin 1s linear infinite}@keyframes studio-spin{to{transform:rotate(360deg)}}@media(max-width:700px){grid-template-columns:1fr}`;
const GifPreviewStage = styled.div`min-height:220px;border:1px solid var(--studio-line);border-radius:11px;background-color:#fff;background-image:linear-gradient(45deg,#edf0f3 25%,transparent 25%),linear-gradient(-45deg,#edf0f3 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#edf0f3 75%),linear-gradient(-45deg,transparent 75%,#edf0f3 75%);background-size:18px 18px;background-position:0 0,0 9px,9px -9px,-9px 0;display:grid;place-items:center;overflow:hidden;img{width:100%;height:100%;max-height:340px;object-fit:contain}>div{padding:20px;display:grid;place-items:center;gap:8px;text-align:center;color:#7c3aed}strong{color:#374151;font-size:.78rem}span{color:#566174;font-size:.63rem;letter-spacing:0;font-weight:700}`;
const GifPreviewActions = styled.div`grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;@media(max-width:560px){display:grid;grid-template-columns:1fr}`;
const ExportGrid = styled.div`display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px;@media(max-width:820px){grid-template-columns:repeat(2,1fr)}@media(max-width:480px){grid-template-columns:1fr}`;
const ExportCard = styled.article`border:1px solid var(--studio-line);border-radius:11px;background:var(--studio-panel);padding:16px;display:grid;gap:8px;color:#047857;strong{color:#343a49;font-size:.8rem}span{color:#566174;font-size:.7rem;line-height:1.48}`;
const ExportWarning = styled.aside`margin-top:14px;border-left:3px solid #a86500;border-radius:0 9px 9px 0;background:#fff8e8;padding:14px 16px;display:grid;gap:7px;strong{color:#704800;font-size:.78rem}p{margin:0;color:#5f533e;font-size:.71rem;line-height:1.55}a{width:max-content;color:#704800;font-size:.68rem;font-weight:900;text-decoration:none;display:flex;align-items:center;gap:5px}`;

const WorkArea = styled.fieldset`min-width:0;padding:0;margin:0;border:0;&:disabled{opacity:.65}`;
const FilterBar = styled.div`display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:12px 0;label{flex:1;min-width:180px}button{min-height:44px;padding:8px 13px;border:1px solid var(--studio-line);border-radius:8px;background:#fff;cursor:pointer;color:var(--studio-muted)}button[aria-pressed=true]{border-color:var(--studio-accent);color:#5322b8;background:#f5f0ff}`;
const SceneThumbnail = styled.span`width:52px;height:52px;flex:0 0 52px;display:grid;place-items:center;font-size:1.7rem;background:#f5f1ff;border-radius:10px;overflow:hidden;img{width:100%;height:100%;object-fit:contain}`;
const StatusBanner = styled.aside`display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin:16px;padding:16px;border:1px solid #e6c889;border-radius:10px;background:#fff9ec;color:#5a441a;font-size:.85rem;line-height:1.6;span{overflow-wrap:anywhere}`;
const OperationSummary = styled.details`margin:12px 18px;padding:12px 16px;background:#fff;border:1px solid var(--studio-line);border-radius:8px;font-size:.8rem;summary{cursor:pointer;min-height:32px}p{line-height:1.6;overflow-wrap:anywhere}`;
const ProjectMenu = styled.section`padding:18px;margin:12px;background:#fff;border:1px solid var(--studio-line);border-radius:10px;display:grid;gap:12px;>div:first-child{display:flex;align-items:center;justify-content:space-between}p{margin:0;font-size:.85rem;color:var(--studio-muted)}>button{text-align:left;min-height:44px;background:#f8f6fd;border:1px solid var(--studio-line);border-radius:8px;padding:10px;cursor:pointer}`;
const MakeTabs = styled(FilterBar)`margin:16px 20px 0`;
const BulkFrameRow = styled.div`display:flex;align-items:center;gap:8px;input{accent-color:var(--studio-accent);flex:0 0 18px;width:18px}button{flex:1;min-width:0}`;
const BulkControls = styled.div`display:grid;gap:10px;margin-top:14px;font-size:.78rem;label{display:grid;gap:6px}input{width:100%;min-height:44px;border:1px solid var(--studio-line);border-radius:8px;padding:8px}button{min-height:44px}`;
const ReviewProblems = styled.section`display:grid;gap:12px;margin:20px 0;padding:20px;background:#fff;border:1px solid var(--studio-line);border-radius:12px;h2{font-size:1rem;margin:0}div{display:flex;align-items:center;flex-wrap:wrap;gap:12px;border-top:1px solid var(--studio-line);padding-top:12px}span{flex:1;min-width:180px;font-size:.85rem;line-height:1.6;color:var(--studio-muted)}[data-level=error] strong{color:#a32929}[data-level=warning] strong{color:#8b581a}`;
const MobileAction = styled.div`display:none;@media(max-width:900px){position:fixed;bottom:0;left:0;right:0;z-index:30;display:grid;gap:4px;padding:8px 16px max(10px,env(safe-area-inset-bottom));background:rgba(255,255,255,.98);border-top:1px solid var(--studio-line);box-shadow:0 -2px 10px #2429380a;small{font-size:.72rem;color:var(--studio-muted)}button{width:100%;min-height:44px}}`;
