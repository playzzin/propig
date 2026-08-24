'use client';

import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileArchive,
  GripVertical,
  ImagePlus,
  Images,
  RotateCcw,
  Redo2,
  Replace,
  Trash2,
  Undo2,
  Upload,
  WandSparkles,
  ZoomIn,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from 'react';
import styled from 'styled-components';
import { z } from 'zod';
import { emoticonExportFormatSchema, type EmoticonExportFormat } from '@/schemas/emoticonStudio';
import type { EmoticonProjectType } from '@/schemas/emoticonProject';
import { AccessibleImagePreviewDialog } from './AccessibleImagePreviewDialog';
import { FORMAT_LABELS } from './EmoticonStudio.constants';

export type ManualFrameDraft = {
  kind: 'file';
  uploadRequestId: string;
  durationMs: number;
  file: File;
} | {
  kind: 'container';
  uploadRequestId: string;
  durationMs: number;
  file: File;
} | {
  kind: 'completed-static';
  uploadRequestId: string;
  durationMs: number;
  sourceJobId: string;
};

export type ReusableEmoticonFrame = {
  sourceJobId: string;
  imageUrl: string;
  title: string;
  detail: string;
};

export type ReusableFrameImportRequest = {
  requestId: string;
  frames: ReusableEmoticonFrame[];
};

export type ManualFrameImportSubmit = {
  frames: ManualFrameDraft[];
  timing: {
    mode: 'fps';
    fps: number;
  } | {
    mode: 'per_frame';
    frameDurationsMs: number[];
  };
  formats: EmoticonExportFormat[];
};

type ManualFrameImportPanelProps = {
  projectType: EmoticonProjectType;
  allowedFormats: EmoticonExportFormat[];
  defaultFormats: EmoticonExportFormat[];
  disabled: boolean;
  isSubmitting: boolean;
  hasBubble: boolean;
  hasImageEdit: boolean;
  reusableFrames?: ReusableEmoticonFrame[];
  showReusableFrames?: boolean;
  reusableFrameImportRequest?: ReusableFrameImportRequest | null;
  onReusableFrameImportApplied?: (requestId: string, addedCount: number) => void;
  draftKey?: string;
  initialFiles?: File[];
  initialSpriteSheet?: File | null;
  onSubmit: (input: ManualFrameImportSubmit) => Promise<boolean>;
  onDirtyChange?: (dirty: boolean) => void;
};

type FramePreview = ManualFrameDraft & {
  id: string;
  previewUrl: string;
  ownsPreviewUrl: boolean;
  displayName: string;
  displaySize: string;
};

type SpriteSheetDraft = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
  detectedColumns: number;
  detectedRows: number;
  removeBackground: boolean;
  tolerance: number;
  backgroundColor: [number, number, number];
};

type PersistedManualFrame = {
  id: string;
  uploadRequestId: string;
  durationMs: number;
  displayName: string;
  displaySize: string;
} & ({
  kind: 'file' | 'container';
  file: File;
} | {
  kind: 'completed-static';
  sourceJobId: string;
  previewUrl: string;
});

type PersistedManualFrameState = {
  frames: PersistedManualFrame[];
  timingMode: 'fps' | 'per_frame';
  fps: number;
  formats: EmoticonExportFormat[];
};

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_CONTAINER_BYTES = 20 * 1024 * 1024;
const MANUAL_DRAFT_DB = 'propig-emoticon-studio-drafts';
const MANUAL_DRAFT_STORE = 'manual-frame-imports';
const persistedManualFrameStateSchema = z.object({
  frames: z.array(z.object({
    kind: z.enum(['file', 'container', 'completed-static']),
    id: z.string().min(1).max(100),
    uploadRequestId: z.string().min(1).max(100),
    durationMs: z.number().int().min(0).max(2000),
    displayName: z.string().min(1).max(240),
    displaySize: z.string().max(240),
    file: z.custom<File>((value) => typeof File !== 'undefined' && value instanceof File).optional(),
    sourceJobId: z.string().min(1).max(160).optional(),
    previewUrl: z.string().optional(),
  }).superRefine((frame, context) => {
    if ((frame.kind === 'file' || frame.kind === 'container') && !frame.file) {
      context.addIssue({ code: 'custom', path: ['file'], message: '임시 저장된 원본 파일이 없습니다.' });
    }
    if (frame.kind === 'completed-static' && (!frame.sourceJobId || !frame.previewUrl)) {
      context.addIssue({ code: 'custom', path: ['sourceJobId'], message: '완성 정지 컷 정보가 없습니다.' });
    }
  })).max(24),
  timingMode: z.enum(['fps', 'per_frame']),
  fps: z.number().int().min(1).max(30),
  formats: z.array(emoticonExportFormatSchema).max(7),
});

function openManualDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MANUAL_DRAFT_DB, 1);
    request.onerror = () => reject(request.error || new Error('편집 임시 저장소를 열지 못했습니다.'));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MANUAL_DRAFT_STORE)) {
        request.result.createObjectStore(MANUAL_DRAFT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readManualDraft(key: string): Promise<PersistedManualFrameState | null> {
  const database = await openManualDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(MANUAL_DRAFT_STORE, 'readonly').objectStore(MANUAL_DRAFT_STORE).get(key);
      request.onerror = () => reject(request.error || new Error('임시 저장본을 읽지 못했습니다.'));
      request.onsuccess = () => {
        const parsed = persistedManualFrameStateSchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data as PersistedManualFrameState : null);
      };
    });
  } finally {
    database.close();
  }
}

async function writeManualDraft(key: string, state: PersistedManualFrameState | null): Promise<void> {
  const database = await openManualDraftDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const store = database.transaction(MANUAL_DRAFT_STORE, 'readwrite').objectStore(MANUAL_DRAFT_STORE);
      const request = state ? store.put(state, key) : store.delete(key);
      request.onerror = () => reject(request.error || new Error('임시 저장본을 저장하지 못했습니다.'));
      request.onsuccess = () => resolve();
    });
  } finally {
    database.close();
  }
}

function inferredType(file: File): string | null {
  if (ALLOWED_TYPES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLocaleLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return null;
}

function fileSignature(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function colorDistance(data: Uint8ClampedArray, offset: number, color: [number, number, number]): number {
  return Math.hypot(data[offset] - color[0], data[offset + 1] - color[1], data[offset + 2] - color[2]);
}

function internalGapCount(activity: number[], orthogonalSize: number): number {
  const minimumRun = Math.max(3, Math.round(activity.length * 0.025));
  const runs: Array<[number, number]> = [];
  let start = -1;
  activity.forEach((value, index) => {
    const isGap = value <= Math.max(1, orthogonalSize * 0.14);
    if (isGap && start < 0) start = index;
    if ((!isGap || index === activity.length - 1) && start >= 0) {
      const end = isGap && index === activity.length - 1 ? index : index - 1;
      if (start > 0 && end < activity.length - 1 && end - start + 1 >= minimumRun) runs.push([start, end]);
      start = -1;
    }
  });
  return runs.length;
}

async function analyzeSpriteSheet(file: File): Promise<Omit<SpriteSheetDraft, 'file' | 'previewUrl'>> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('이미지 분할 캔버스를 만들지 못했습니다.');
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const corners = [[2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3]];
    const backgroundColor = corners.reduce<[number, number, number]>((sum, [x, y]) => {
      const offset = (Math.max(0, y) * width + Math.max(0, x)) * 4;
      return [sum[0] + pixels[offset], sum[1] + pixels[offset + 1], sum[2] + pixels[offset + 2]];
    }, [0, 0, 0]).map((value) => Math.round(value / corners.length)) as [number, number, number];
    const xActivity = Array.from({ length: width }, (_, x) => {
      let active = 0;
      for (let y = 0; y < height; y += 2) {
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] > 16 && colorDistance(pixels, offset, backgroundColor) > 55) active += 2;
      }
      return active;
    });
    const yActivity = Array.from({ length: height }, (_, y) => {
      let active = 0;
      for (let x = 0; x < width; x += 2) {
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] > 16 && colorDistance(pixels, offset, backgroundColor) > 55) active += 2;
      }
      return active;
    });
    let columns = Math.min(6, Math.max(1, internalGapCount(xActivity, height) + 1));
    let rows = Math.min(6, Math.max(1, internalGapCount(yActivity, width) + 1));
    const aspectRatio = bitmap.width / bitmap.height;
    if (columns <= 2 && rows <= 2 && aspectRatio > 1.35) columns = 4;
    if (columns * rows < 2 || columns * rows > 24) {
      columns = aspectRatio > 1.35 ? 4 : 2;
      rows = 2;
    }
    const removeBackground = backgroundColor[1] > backgroundColor[0] * 1.45
      && backgroundColor[1] > backgroundColor[2] * 1.45;
    return { width: bitmap.width, height: bitmap.height, columns, rows, detectedColumns: columns, detectedRows: rows, removeBackground, tolerance: 72, backgroundColor };
  } finally {
    bitmap.close();
  }
}

async function splitSpriteSheet(draft: SpriteSheetDraft): Promise<File[]> {
  const bitmap = await createImageBitmap(draft.file);
  try {
    const files: File[] = [];
    const baseName = draft.file.name.replace(/\.[^.]+$/, '') || 'sprite-sheet';
    for (let row = 0; row < draft.rows; row += 1) {
      for (let column = 0; column < draft.columns; column += 1) {
        const left = Math.round((column * bitmap.width) / draft.columns);
        const right = Math.round(((column + 1) * bitmap.width) / draft.columns);
        const top = Math.round((row * bitmap.height) / draft.rows);
        const bottom = Math.round(((row + 1) * bitmap.height) / draft.rows);
        const canvas = document.createElement('canvas');
        canvas.width = right - left;
        canvas.height = bottom - top;
        const context = canvas.getContext('2d', { willReadFrequently: draft.removeBackground });
        if (!context) throw new Error('분할 프레임 캔버스를 만들지 못했습니다.');
        context.drawImage(bitmap, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        if (draft.removeBackground) {
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          for (let offset = 0; offset < image.data.length; offset += 4) {
            const distance = colorDistance(image.data, offset, draft.backgroundColor);
            if (distance <= draft.tolerance) image.data[offset + 3] = 0;
            else if (distance < draft.tolerance + 48) image.data[offset + 3] = Math.round(image.data[offset + 3] * ((distance - draft.tolerance) / 48));
          }
          context.putImageData(image, 0, 0);
        }
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error('분할 프레임을 PNG로 만들지 못했습니다.')),
          'image/png',
        ));
        files.push(new File([blob], `${baseName}-frame-${String(files.length + 1).padStart(2, '0')}.png`, { type: 'image/png', lastModified: draft.file.lastModified }));
      }
    }
    return files;
  } finally {
    bitmap.close();
  }
}

export function ManualFrameImportPanel({
  projectType,
  allowedFormats,
  defaultFormats,
  disabled,
  isSubmitting,
  hasBubble,
  hasImageEdit,
  reusableFrames = [],
  showReusableFrames = true,
  reusableFrameImportRequest = null,
  onReusableFrameImportApplied,
  draftKey,
  initialFiles = [],
  initialSpriteSheet = null,
  onSubmit,
  onDirtyChange,
}: ManualFrameImportPanelProps) {
  const [frames, setFrames] = useState<FramePreview[]>([]);
  const [timingMode, setTimingMode] = useState<'fps' | 'per_frame'>('fps');
  const [fps, setFps] = useState(8);
  const [formats, setFormats] = useState<EmoticonExportFormat[]>(() => {
    const selected = defaultFormats.filter((format) => allowedFormats.includes(format));
    return selected.length ? selected : allowedFormats.slice(0, 1);
  });
  const [error, setError] = useState('');
  const [draggedFrameId, setDraggedFrameId] = useState<string | null>(null);
  const [dropTargetFrameId, setDropTargetFrameId] = useState<string | null>(null);
  const [orderAnnouncement, setOrderAnnouncement] = useState('');
  const [previewFrameId, setPreviewFrameId] = useState<string | null>(null);
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
  const [pastFrames, setPastFrames] = useState<FramePreview[][]>([]);
  const [futureFrames, setFutureFrames] = useState<FramePreview[][]>([]);
  const [replaceFrameId, setReplaceFrameId] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(!draftKey);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'failed'>(draftKey ? 'loading' : 'idle');
  const [spriteSheet, setSpriteSheet] = useState<SpriteSheetDraft | null>(null);
  const [isSplittingSprite, setIsSplittingSprite] = useState(false);
  const framesRef = useRef(frames);
  const ownedPreviewUrlsRef = useRef(new Set<string>());
  const draftWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draggedFrameIdRef = useRef<string | null>(null);
  const appliedReusableRequestIdsRef = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);
  const containerInputRef = useRef<HTMLInputElement>(null);
  const spriteInputRef = useRef<HTMLInputElement>(null);
  const initialImportAppliedRef = useRef(false);
  const replacementInputRef = useRef<HTMLInputElement>(null);
  const allowedFormatsKey = allowedFormats.join('|');

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    onDirtyChange?.(frames.length > 0);
    return () => onDirtyChange?.(false);
  }, [frames.length, onDirtyChange]);

  useEffect(() => {
    if (!frames.length) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [frames.length]);

  useEffect(() => () => {
    ownedPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => () => {
    if (spriteSheet?.previewUrl) URL.revokeObjectURL(spriteSheet.previewUrl);
  }, [spriteSheet?.previewUrl]);

  const createOwnedPreviewUrl = (file: File) => {
    const url = URL.createObjectURL(file);
    ownedPreviewUrlsRef.current.add(url);
    return url;
  };

  const commitFrames = useCallback((nextFrames: FramePreview[]) => {
    const current = framesRef.current;
    if (current === nextFrames) return;
    setPastFrames((history) => [...history, current].slice(-30));
    setFutureFrames([]);
    framesRef.current = nextFrames;
    setFrames(nextFrames);
    setSelectedFrameIds((selected) => selected.filter((id) => nextFrames.some((frame) => frame.id === id)));
  }, []);

  useEffect(() => {
    if (!draftKey) return;
    let cancelled = false;
    void readManualDraft(draftKey).then((saved) => {
      if (cancelled) return;
      if (saved?.frames.length) {
        const restored = saved.frames.map((frame): FramePreview => {
          if (frame.kind === 'completed-static') {
            return { ...frame, ownsPreviewUrl: false };
          }
          const previewUrl = URL.createObjectURL(frame.file);
          ownedPreviewUrlsRef.current.add(previewUrl);
          return { ...frame, previewUrl, ownsPreviewUrl: true };
        });
        framesRef.current = restored;
        setFrames(restored);
        setTimingMode(saved.timingMode);
        setFps(saved.fps);
        const allowed = new Set(allowedFormatsKey.split('|'));
        setFormats(saved.formats.filter((format) => allowed.has(format)));
        setOrderAnnouncement('자동 저장된 프레임 편집을 복원했어요.');
      }
      setDraftStatus('saved');
      setDraftReady(true);
    }).catch(() => {
      if (cancelled) return;
      setDraftStatus('failed');
      setDraftReady(true);
    });
    return () => { cancelled = true; };
  }, [allowedFormatsKey, draftKey]);

  const undoFrames = () => {
    const previous = pastFrames[pastFrames.length - 1];
    if (!previous) return;
    const current = framesRef.current;
    setPastFrames((history) => history.slice(0, -1));
    setFutureFrames((history) => [current, ...history].slice(0, 30));
    framesRef.current = previous;
    setFrames(previous);
    setSelectedFrameIds([]);
    setOrderAnnouncement('이전 프레임 편집 상태로 되돌렸어요.');
  };

  const redoFrames = () => {
    const next = futureFrames[0];
    if (!next) return;
    const current = framesRef.current;
    setFutureFrames((history) => history.slice(1));
    setPastFrames((history) => [...history, current].slice(-30));
    framesRef.current = next;
    setFrames(next);
    setSelectedFrameIds([]);
    setOrderAnnouncement('되돌린 프레임 편집을 다시 적용했어요.');
  };

  const maxFrames = projectType === 'static' ? 1 : 24;
  const minimumFrames = projectType === 'static' ? 1 : 2;
  const selectedFormats = useMemo(() => {
    const supported = formats.filter((format) => allowedFormats.includes(format));
    if (supported.length) return supported;
    const preferred = defaultFormats.filter((format) => allowedFormats.includes(format));
    return preferred.length ? preferred : allowedFormats.slice(0, 1);
  }, [allowedFormats, defaultFormats, formats]);
  useEffect(() => {
    if (!draftKey || !draftReady) return;
    const timer = window.setTimeout(() => {
      setDraftStatus('saving');
      const persistedFrames: PersistedManualFrame[] = frames.map((frame) => frame.kind === 'completed-static'
        ? {
          kind: frame.kind,
          id: frame.id,
          uploadRequestId: frame.uploadRequestId,
          durationMs: frame.durationMs,
          displayName: frame.displayName,
          displaySize: frame.displaySize,
          sourceJobId: frame.sourceJobId,
          previewUrl: frame.previewUrl,
        }
        : {
          kind: frame.kind,
          id: frame.id,
          uploadRequestId: frame.uploadRequestId,
          durationMs: frame.durationMs,
          displayName: frame.displayName,
          displaySize: frame.displaySize,
          file: frame.file,
        });
      const candidate: PersistedManualFrameState = { frames: persistedFrames, timingMode, fps, formats: selectedFormats };
      const parsed = persistedManualFrameStateSchema.safeParse(candidate);
      const queuedWrite = draftWriteQueueRef.current
        .catch(() => undefined)
        .then(() => writeManualDraft(draftKey, frames.length && parsed.success ? candidate : null));
      draftWriteQueueRef.current = queuedWrite;
      void queuedWrite
        .then(() => setDraftStatus('saved'))
        .catch(() => setDraftStatus('failed'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftKey, draftReady, fps, frames, selectedFormats, timingMode]);
  const totalDurationMs = projectType === 'static'
    ? 0
    : timingMode === 'fps'
      ? Math.round((frames.length / fps) * 1000)
      : frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  const hasContainer = frames.some((frame) => frame.kind === 'container');
  const canSubmit = (frames.length >= minimumFrames || (projectType === 'animated' && hasContainer))
    && frames.length <= maxFrames
    && selectedFormats.length > 0
    && !disabled
    && !isSubmitting;

  const duplicateSignatures = useMemo(
    () => new Set(frames.flatMap((frame) => (frame.kind === 'file' ? [fileSignature(frame.file)] : []))),
    [frames],
  );
  const selectedSourceJobIds = useMemo(
    () => new Set(frames.flatMap((frame) => (frame.kind === 'completed-static' ? [frame.sourceJobId] : []))),
    [frames],
  );
  const previewFrame = previewFrameId
    ? frames.find((frame) => frame.id === previewFrameId) || null
    : null;

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []).sort((left, right) => left.name.localeCompare(
      right.name,
      undefined,
      { numeric: true, sensitivity: 'base' },
    ));
    event.target.value = '';
    if (!selectedFiles.length || disabled || isSubmitting) return;
    if (hasContainer) {
      setError('움짤 파일은 다른 이미지와 섞지 말고 한 번에 하나씩 가져와 주세요.');
      return;
    }
    const available = maxFrames - frames.length;
    if (available <= 0) {
      setError(projectType === 'static' ? '정지형은 이미지 1장만 사용할 수 있어요.' : '애니메이션은 최대 24장까지 사용할 수 있어요.');
      return;
    }
    const next: FramePreview[] = [];
    const seen = new Set(duplicateSignatures);
    for (const file of selectedFiles.slice(0, available)) {
      if (!inferredType(file)) {
        setError(`${file.name}: PNG, JPG, WebP 파일만 사용할 수 있어요.`);
        continue;
      }
      if (!file.size || file.size > MAX_INPUT_BYTES) {
        setError(`${file.name}: 파일은 장당 5MB 이하여야 해요.`);
        continue;
      }
      const signature = fileSignature(file);
      if (seen.has(signature)) {
        setError(`${file.name}: 같은 파일이 이미 목록에 있어요.`);
        continue;
      }
      seen.add(signature);
      const id = crypto.randomUUID();
      next.push({
        kind: 'file',
        id,
        uploadRequestId: id,
        file,
        previewUrl: createOwnedPreviewUrl(file),
        ownsPreviewUrl: true,
        displayName: file.name,
        displaySize: formatBytes(file.size),
        durationMs: 125,
      });
    }
    if (next.length) {
      commitFrames([...framesRef.current, ...next]);
      setError('');
    }
  };

  const handleSpriteSheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled || isSubmitting) return;
    if (projectType !== 'animated') {
      setError('스프라이트 시트 분할은 움직이는 프로젝트에서 사용할 수 있어요.');
      return;
    }
    if (!inferredType(file) || !file.size || file.size > MAX_CONTAINER_BYTES) {
      setError('시트는 20MB 이하 PNG, JPG 또는 WebP 이미지여야 해요.');
      return;
    }
    try {
      const analysis = await analyzeSpriteSheet(file);
      setSpriteSheet({ file, previewUrl: URL.createObjectURL(file), ...analysis });
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '스프라이트 시트를 분석하지 못했습니다.');
    }
  };

  const applySpriteSheet = async () => {
    if (!spriteSheet || isSplittingSprite) return;
    const frameTotal = spriteSheet.columns * spriteSheet.rows;
    const available = maxFrames - framesRef.current.length;
    if (frameTotal < 2 || frameTotal > 24 || frameTotal > available) {
      setError(`현재 타임라인에는 최대 ${available}장까지 더 넣을 수 있습니다. 행×열을 2~${Math.min(24, available)}칸으로 맞춰 주세요.`);
      return;
    }
    setIsSplittingSprite(true);
    try {
      const files = await splitSpriteSheet(spriteSheet);
      const nextFrames = files.map((file): FramePreview => {
        const id = crypto.randomUUID();
        return {
          kind: 'file', id, uploadRequestId: id, file,
          previewUrl: createOwnedPreviewUrl(file), ownsPreviewUrl: true,
          displayName: file.name, displaySize: `${spriteSheet.columns}×${spriteSheet.rows} 시트에서 분할 · ${formatBytes(file.size)}`,
          durationMs: 125,
        };
      });
      commitFrames([...framesRef.current, ...nextFrames]);
      setOrderAnnouncement(`${nextFrames.length}개 프레임을 왼쪽→오른쪽, 위→아래 순서로 분할했습니다.`);
      setSpriteSheet(null);
      setTimingMode('fps');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '시트를 프레임으로 분할하지 못했습니다.');
    } finally {
      setIsSplittingSprite(false);
    }
  };

  useEffect(() => {
    if (!draftReady || initialImportAppliedRef.current || framesRef.current.length) return;
    if (!initialSpriteSheet && !initialFiles.length) return;
    initialImportAppliedRef.current = true;
    if (initialSpriteSheet) {
      void analyzeSpriteSheet(initialSpriteSheet).then((analysis) => {
        setSpriteSheet({
          file: initialSpriteSheet,
          previewUrl: URL.createObjectURL(initialSpriteSheet),
          ...analysis,
        });
        setError('');
      }).catch((cause) => {
        initialImportAppliedRef.current = false;
        setError(cause instanceof Error ? cause.message : '스프라이트 시트를 분석하지 못했습니다.');
      });
      return;
    }
    const selectedFiles = [...initialFiles]
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
      .slice(0, maxFrames);
    const nextFrames = selectedFiles.flatMap((file): FramePreview[] => {
      if (!inferredType(file) || !file.size || file.size > MAX_INPUT_BYTES) return [];
      const id = crypto.randomUUID();
      return [{
        kind: 'file', id, uploadRequestId: id, file,
        previewUrl: createOwnedPreviewUrl(file), ownsPreviewUrl: true,
        displayName: file.name, displaySize: formatBytes(file.size), durationMs: 125,
      }];
    });
    if (nextFrames.length) {
      commitFrames(nextFrames);
      setOrderAnnouncement(`${nextFrames.length}개 사진을 파일명 순서로 불러왔습니다.`);
      setError('');
    } else {
      initialImportAppliedRef.current = false;
      setError('가져올 수 있는 PNG, JPG 또는 WebP 사진이 없습니다.');
    }
  }, [commitFrames, draftReady, initialFiles, initialSpriteSheet, maxFrames]);

  const handleContainerFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled || isSubmitting) return;
    if (projectType !== 'animated') {
      setError('움짤 가져오기는 움직이는 프로젝트에서만 사용할 수 있어요.');
      return;
    }
    if (frames.length) {
      setError('움짤 파일은 다른 이미지와 섞지 말고 빈 타임라인에 추가해 주세요.');
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase();
    const isZip = file.type === 'application/zip' || extension === 'zip';
    if (!isZip && !['image/gif', 'image/webp', 'image/png'].includes(file.type) && !['gif', 'webp', 'png', 'apng'].includes(extension || '')) {
      setError('GIF, 움직이는 WebP, APNG, 스프라이트 시트 PNG 또는 PNG ZIP 파일만 가져올 수 있어요.');
      return;
    }
    if (!file.size || file.size > MAX_CONTAINER_BYTES) {
      setError('움짤 파일은 20MB 이하여야 해요.');
      return;
    }
    if (isZip) {
      try {
        const archive = await JSZip.loadAsync(file);
        const entries = Object.values(archive.files).filter((entry) => {
          if (entry.dir || entry.name.includes('..')) return false;
          return /\.(png|jpe?g|webp)$/i.test(entry.name);
        });
        if (entries.length < 2 || entries.length > maxFrames) {
          setError(`PNG ZIP에는 이미지가 2~${maxFrames}장 있어야 해요.`);
          return;
        }
        const nextFrames: FramePreview[] = [];
        let totalBytes = 0;
        for (const [index, entry] of entries.entries()) {
          const blob = await entry.async('blob');
          totalBytes += blob.size;
          if (!blob.size || blob.size > MAX_INPUT_BYTES || totalBytes > 80 * 1024 * 1024) {
            setError('PNG ZIP의 이미지가 너무 크거나 압축 해제 용량이 80MB를 넘습니다.');
            return;
          }
          const name = entry.name.split('/').pop() || `frame-${index + 1}.png`;
          const fileType = /\.jpe?g$/i.test(name) ? 'image/jpeg' : /\.webp$/i.test(name) ? 'image/webp' : 'image/png';
          const frameFile = new File([blob], name, { type: fileType, lastModified: file.lastModified });
          const id = crypto.randomUUID();
          nextFrames.push({
            kind: 'file',
            id,
            uploadRequestId: id,
            file: frameFile,
            previewUrl: createOwnedPreviewUrl(frameFile),
            ownsPreviewUrl: true,
            displayName: name,
            displaySize: formatBytes(blob.size),
            durationMs: 125,
          });
        }
        commitFrames(nextFrames);
        setTimingMode('fps');
        setError('');
      } catch {
        setError('PNG ZIP을 읽지 못했습니다. 손상되지 않은 ZIP인지 확인해 주세요.');
      }
      return;
    }
    const id = crypto.randomUUID();
    commitFrames([{
      kind: 'container',
      id,
      uploadRequestId: id,
      file,
      previewUrl: createOwnedPreviewUrl(file),
      ownsPreviewUrl: true,
      displayName: file.name,
      displaySize: '서버에서 2~24개 투명 PNG 프레임으로 추출 · 시트는 행 우선 분할',
      durationMs: 125,
    }]);
    setTimingMode('fps');
    setError('');
  };

  const appendReusableFrames = useCallback((sources: ReusableEmoticonFrame[]): number => {
    if (disabled || isSubmitting) return 0;
    const currentFrames = framesRef.current;
    if (currentFrames.some((frame) => frame.kind === 'container')) {
      setError('가져온 애니메이션 파일과 보관함 이미지는 함께 사용할 수 없습니다. 먼저 기존 파일을 비워 주세요.');
      return 0;
    }
    if (projectType !== 'animated') {
      setError('보관함 이미지를 여러 프레임으로 조립하는 기능은 움직이는 이모티콘 프로젝트에서 사용할 수 있습니다.');
      return 0;
    }
    if (currentFrames.length >= maxFrames) {
      setError('애니메이션은 최대 24프레임까지 사용할 수 있습니다.');
      return 0;
    }
    const existingSourceIds = new Set(currentFrames.flatMap((frame) => (
      frame.kind === 'completed-static' ? [frame.sourceJobId] : []
    )));
    const uniqueSources = Array.from(new Map(sources.map((source) => [source.sourceJobId, source])).values())
      .filter((source) => !existingSourceIds.has(source.sourceJobId));
    if (!uniqueSources.length) {
      setError('선택한 이미지는 이미 프레임 조립 목록에 있습니다.');
      return 0;
    }
    const acceptedSources = uniqueSources.slice(0, maxFrames - currentFrames.length);
    const nextFrames: FramePreview[] = [...currentFrames, ...acceptedSources.map((source): FramePreview => {
      const id = crypto.randomUUID();
      return {
        kind: 'completed-static',
        id,
        uploadRequestId: id,
        sourceJobId: source.sourceJobId,
        previewUrl: source.imageUrl,
        ownsPreviewUrl: false,
        displayName: source.title,
        displaySize: source.detail,
        durationMs: 125,
      };
    })];
    commitFrames(nextFrames);
    setOrderAnnouncement(`${acceptedSources.length}개 이미지를 프레임 목록 끝에 추가했습니다.`);
    setError(acceptedSources.length < uniqueSources.length
      ? `최대 24프레임 제한으로 ${uniqueSources.length}개 중 ${acceptedSources.length}개만 추가했습니다.`
      : '');
    return acceptedSources.length;
  }, [commitFrames, disabled, isSubmitting, maxFrames, projectType]);

  const addReusableFrame = (source: ReusableEmoticonFrame) => {
    if (disabled || isSubmitting) return;
    if (hasContainer) {
      setError('움짤 파일은 다른 이미지와 섞지 말고 한 번에 하나씩 가져와 주세요.');
      return;
    }
    if (projectType !== 'animated') {
      setError('완성 정지 컷 조립은 움직이는 프로젝트에서 사용할 수 있어요.');
      return;
    }
    const currentFrames = framesRef.current;
    if (currentFrames.length >= maxFrames) {
      setError('애니메이션은 최대 24장까지 사용할 수 있어요.');
      return;
    }
    if (currentFrames.some((frame) => (
      frame.kind === 'completed-static' && frame.sourceJobId === source.sourceJobId
    ))) {
      setError('같은 정지 컷이 이미 타임라인에 있어요.');
      return;
    }
    const id = crypto.randomUUID();
    const nextFrames: FramePreview[] = [...currentFrames, {
      kind: 'completed-static',
      id,
      uploadRequestId: id,
      sourceJobId: source.sourceJobId,
      previewUrl: source.imageUrl,
      ownsPreviewUrl: false,
      displayName: source.title,
      displaySize: source.detail,
      durationMs: 125,
    }];
    commitFrames(nextFrames);
    setError('');
  };

  useEffect(() => {
    if (!draftReady || !reusableFrameImportRequest) return;
    const { requestId, frames: requestedFrames } = reusableFrameImportRequest;
    if (appliedReusableRequestIdsRef.current.has(requestId)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || appliedReusableRequestIdsRef.current.has(requestId)) return;
      appliedReusableRequestIdsRef.current.add(requestId);
      if (appliedReusableRequestIdsRef.current.size > 50) {
        appliedReusableRequestIdsRef.current = new Set([requestId]);
      }
      const addedCount = appendReusableFrames(requestedFrames);
      onReusableFrameImportApplied?.(requestId, addedCount);
    });
    return () => { cancelled = true; };
  }, [appendReusableFrames, draftReady, onReusableFrameImportApplied, reusableFrameImportRequest]);

  const moveFrame = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= frames.length) return;
    const next = [...framesRef.current];
    [next[index], next[target]] = [next[target], next[index]];
    commitFrames(next);
    setOrderAnnouncement(`${index + 1}번째 프레임을 ${target + 1}번째로 이동했어요.`);
  };

  const handleFrameDragStart = (event: ReactDragEvent<HTMLLIElement>, frameId: string) => {
    if (disabled || isSubmitting || frames.length < 2) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('button, input, label, select, textarea')) {
      event.preventDefault();
      return;
    }
    draggedFrameIdRef.current = frameId;
    setDraggedFrameId(frameId);
    setDropTargetFrameId(null);
    setOrderAnnouncement('프레임을 이동하고 있어요. 원하는 위치에 놓아 주세요.');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', frameId);
  };

  const handleFrameDragOver = (event: ReactDragEvent<HTMLLIElement>, targetFrameId: string) => {
    const sourceFrameId = draggedFrameIdRef.current;
    if (!sourceFrameId || sourceFrameId === targetFrameId || disabled || isSubmitting) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetFrameId(targetFrameId);
  };

  const handleFrameDrop = (event: ReactDragEvent<HTMLLIElement>, targetFrameId: string) => {
    event.preventDefault();
    const sourceFrameId = draggedFrameIdRef.current;
    draggedFrameIdRef.current = null;
    setDraggedFrameId(null);
    setDropTargetFrameId(null);
    if (!sourceFrameId || sourceFrameId === targetFrameId || disabled || isSubmitting) return;

    const sourceIndex = framesRef.current.findIndex((frame) => frame.id === sourceFrameId);
    const targetIndex = framesRef.current.findIndex((frame) => frame.id === targetFrameId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const current = framesRef.current;
    const currentSourceIndex = current.findIndex((frame) => frame.id === sourceFrameId);
    const currentTargetIndex = current.findIndex((frame) => frame.id === targetFrameId);
    if (currentSourceIndex < 0 || currentTargetIndex < 0 || currentSourceIndex === currentTargetIndex) return;
    const next = [...current];
    const [moved] = next.splice(currentSourceIndex, 1);
    next.splice(currentTargetIndex, 0, moved);
    commitFrames(next);
    setOrderAnnouncement(`${sourceIndex + 1}번째 프레임을 ${targetIndex + 1}번째로 이동했어요.`);
  };

  const handleFrameDragEnd = () => {
    draggedFrameIdRef.current = null;
    setDraggedFrameId(null);
    setDropTargetFrameId(null);
  };

  const removeFrame = (index: number) => {
    const target = frames[index];
    if (!target) return;
    if (previewFrameId === target.id) setPreviewFrameId(null);
    commitFrames(framesRef.current.filter((frame) => frame.id !== target.id));
    setError('');
  };

  const duplicateFrame = (index: number) => {
    const source = frames[index];
    if (!source || frames.length >= maxFrames || disabled || isSubmitting) return;
    if (source.kind === 'container') {
      setError('움짤 컨테이너는 복제할 수 없습니다. 추출된 결과를 다시 열어 프레임을 편집해 주세요.');
      return;
    }
    const id = crypto.randomUUID();
    const duplicate: FramePreview = source.kind === 'file'
      ? {
        ...source,
        id,
        uploadRequestId: id,
        previewUrl: createOwnedPreviewUrl(source.file),
        ownsPreviewUrl: true,
        displayName: `${source.displayName} 복사본`,
      }
      : {
        ...source,
        id,
        uploadRequestId: id,
        displayName: `${source.displayName} 복사본`,
      };
    commitFrames([
      ...framesRef.current.slice(0, index + 1),
      duplicate,
      ...framesRef.current.slice(index + 1),
    ]);
    setOrderAnnouncement(`${index + 1}번째 프레임을 ${index + 2}번째 위치에 복제했어요.`);
    setError('');
  };

  const clearFrames = (resetHistory = false) => {
    setPreviewFrameId(null);
    if (resetHistory) {
      framesRef.current = [];
      setFrames([]);
      setPastFrames([]);
      setFutureFrames([]);
    } else {
      commitFrames([]);
    }
    setSelectedFrameIds([]);
    setError('');
    inputRef.current?.focus();
  };

  const clearConsumedFrames = () => {
    framesRef.current.forEach((frame) => {
      if (!frame.ownsPreviewUrl || !ownedPreviewUrlsRef.current.has(frame.previewUrl)) return;
      URL.revokeObjectURL(frame.previewUrl);
      ownedPreviewUrlsRef.current.delete(frame.previewUrl);
    });
    clearFrames(true);
    if (!draftKey) return;
    setDraftStatus('saving');
    const queuedWrite = draftWriteQueueRef.current
      .catch(() => undefined)
      .then(() => writeManualDraft(draftKey, null));
    draftWriteQueueRef.current = queuedWrite;
    void queuedWrite
      .then(() => setDraftStatus('saved'))
      .catch(() => setDraftStatus('failed'));
  };

  const updateFrameDuration = (index: number, value: number) => {
    const durationMs = Math.min(2000, Math.max(40, Math.round(value || 40)));
    commitFrames(framesRef.current.map((frame, candidateIndex) => (
      candidateIndex === index ? { ...frame, durationMs } : frame
    )));
  };

  const toggleFrameSelection = (frameId: string) => {
    setSelectedFrameIds((current) => current.includes(frameId)
      ? current.filter((id) => id !== frameId)
      : [...current, frameId]);
  };

  const removeSelectedFrames = () => {
    if (!selectedFrameIds.length) return;
    const selected = new Set(selectedFrameIds);
    commitFrames(framesRef.current.filter((frame) => !selected.has(frame.id)));
    setSelectedFrameIds([]);
    setOrderAnnouncement(`${selected.size}개 프레임을 삭제했어요. 실행 취소로 되돌릴 수 있어요.`);
  };

  const duplicateSelectedFrames = () => {
    if (!selectedFrameIds.length) return;
    const available = maxFrames - framesRef.current.length;
    if (available <= 0) return;
    const selected = new Set(selectedFrameIds);
    let added = 0;
    const next = framesRef.current.flatMap((frame) => {
      if (!selected.has(frame.id) || frame.kind === 'container' || added >= available) return [frame];
      added += 1;
      const id = crypto.randomUUID();
      const duplicate: FramePreview = frame.kind === 'file'
        ? { ...frame, id, uploadRequestId: id, previewUrl: createOwnedPreviewUrl(frame.file), ownsPreviewUrl: true, displayName: `${frame.displayName} 복사본` }
        : { ...frame, id, uploadRequestId: id, displayName: `${frame.displayName} 복사본` };
      return [frame, duplicate];
    });
    if (!added) {
      setError('움짤 컨테이너는 복제할 수 없어요. 추출된 프레임을 다시 열어 주세요.');
      return;
    }
    commitFrames(next);
    setSelectedFrameIds([]);
    setOrderAnnouncement(`${added}개 프레임을 복제했어요.`);
  };

  const chooseReplacement = (frameId: string) => {
    setReplaceFrameId(frameId);
    replacementInputRef.current?.click();
  };

  const replaceFrame = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const targetId = replaceFrameId;
    setReplaceFrameId(null);
    if (!file || !targetId) return;
    const validationError = !inferredType(file)
      ? 'PNG, JPG, WebP 파일만 사용할 수 있어요.'
      : !file.size || file.size > MAX_INPUT_BYTES
        ? '파일은 장당 5MB 이하여야 해요.'
        : '';
    if (validationError) {
      setError(`${file.name}: ${validationError}`);
      return;
    }
    const target = framesRef.current.find((frame) => frame.id === targetId);
    if (!target || target.kind === 'container') return;
    const requestId = crypto.randomUUID();
    const replacement: FramePreview = {
      kind: 'file',
      id: target.id,
      uploadRequestId: requestId,
      durationMs: target.durationMs,
      file,
      previewUrl: createOwnedPreviewUrl(file),
      ownsPreviewUrl: true,
      displayName: file.name,
      displaySize: formatBytes(file.size),
    };
    commitFrames(framesRef.current.map((frame) => frame.id === target.id ? replacement : frame));
    setError('');
    setOrderAnnouncement(`${framesRef.current.findIndex((frame) => frame.id === target.id) + 1}번째 프레임을 교체했어요.`);
  };

  const toggleFormat = (format: EmoticonExportFormat) => {
    setFormats(selectedFormats.includes(format)
      ? selectedFormats.filter((candidate) => candidate !== format)
      : [...selectedFormats, format]);
  };

  const submit = async () => {
    if ((!hasContainer && frames.length < minimumFrames) || frames.length > maxFrames) {
      setError(projectType === 'static'
        ? '정지형은 이미지 1장을 넣어 주세요.'
        : '애니메이션은 이미지 2~24장을 넣어 주세요.');
      return;
    }
    if (!selectedFormats.length) {
      setError('출력 형식을 하나 이상 선택해 주세요.');
      return;
    }
    if (timingMode === 'per_frame' && totalDurationMs > 60_000) {
      setError('전체 재생 시간은 60초 이하여야 해요.');
      return;
    }
    setError('');
    const imported = await onSubmit({
      frames: frames.map((frame) => (frame.kind === 'completed-static'
        ? {
          kind: frame.kind,
          uploadRequestId: frame.uploadRequestId,
          sourceJobId: frame.sourceJobId,
          durationMs: frame.durationMs,
        }
        : {
          kind: frame.kind,
          uploadRequestId: frame.uploadRequestId,
          file: frame.file,
          durationMs: frame.durationMs,
        })),
      timing: projectType === 'animated' && timingMode === 'per_frame'
        ? { mode: 'per_frame', frameDurationsMs: frames.map((frame) => frame.durationMs) }
        : { mode: 'fps', fps: projectType === 'static' ? 1 : fps },
      formats: selectedFormats,
    });
    if (imported) clearConsumedFrames();
  };

  return (
    <Panel aria-labelledby="manual-frame-import-title">
      <PanelHeader>
        <div>
          <Eyebrow>{projectType === 'animated' ? '2단계 · AI 호출 없음' : 'AI 호출 없음 · 직접 합성'}</Eyebrow>
          <strong id="manual-frame-import-title">{projectType === 'animated' ? '정지 컷 모아서 움직임 만들기' : '내 이미지로 정지 이모티콘 만들기'}</strong>
          <span>
            {projectType === 'static'
              ? '이미지 1장을 정규화해 정지 이모티콘으로 만들어요.'
              : '같은 캐릭터·동작의 정지 포즈 2~24장을 원하는 순서와 속도로 묶어요.'}
          </span>
        </div>
        <Images size={20} aria-hidden="true" />
      </PanelHeader>

      {projectType === 'animated' && showReusableFrames ? (
        <ReusableFrameSection aria-labelledby="reusable-frame-title">
          <ReusableFrameHeader>
            <div>
              <strong id="reusable-frame-title">1. 최근 완성 정지 컷에서 고르기</strong>
              <span>말풍선 없는 검증 원본을 복사해 새 움직임에서 다시 편집합니다.</span>
            </div>
            <small>{reusableFrames.length}개</small>
          </ReusableFrameHeader>
          {reusableFrames.length ? (
            <ReusableFrameGrid aria-label="최근 완성 정지 컷">
              {reusableFrames.map((source) => {
                const selected = selectedSourceJobIds.has(source.sourceJobId);
                return (
                  <ReusableFrameItem key={source.sourceJobId}>
                    <ReusableFrameButton
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled || isSubmitting || selected || frames.length >= maxFrames}
                      onClick={() => addReusableFrame(source)}
                    >
                      <img src={source.imageUrl} width={72} height={72} loading="lazy" alt="" />
                      <span><strong>{source.title}</strong><small>{selected ? '타임라인에 추가됨' : source.detail}</small></span>
                      <ImagePlus size={16} aria-hidden="true" />
                    </ReusableFrameButton>
                  </ReusableFrameItem>
                );
              })}
            </ReusableFrameGrid>
          ) : (
            <ReusableFrameEmpty>
              먼저 정지 컷을 완성하면 여기에 최근 결과가 표시됩니다. 아래에서 가지고 있는 이미지 파일을 바로 추가해도 됩니다.
            </ReusableFrameEmpty>
          )}
        </ReusableFrameSection>
      ) : null}

      <UploadRow>
        <input
          ref={inputRef}
          id="manual-frame-files"
          name="manualFrameFiles"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple={projectType === 'animated'}
          disabled={disabled || isSubmitting || frames.length >= maxFrames || hasContainer}
          onChange={handleFiles}
        />
        <label htmlFor="manual-frame-files">
          <Upload size={15} aria-hidden="true" /> {projectType === 'animated' ? '2. 내 이미지 추가' : '이미지 고르기'}
        </label>
        {projectType === 'animated' ? (
          <>
            <input
              ref={spriteInputRef}
              id="manual-sprite-sheet"
              name="manualSpriteSheet"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={disabled || isSubmitting || frames.length >= maxFrames || hasContainer}
              onChange={(event) => void handleSpriteSheet(event)}
            />
            <label htmlFor="manual-sprite-sheet"><WandSparkles size={15} aria-hidden="true" /> 한 장 시트 자동 분할</label>
            <input
              ref={containerInputRef}
              id="manual-animation-container"
              name="manualAnimationContainer"
              type="file"
              accept="image/gif,image/webp,image/png,.apng,.zip,application/zip"
              aria-describedby="manual-animation-import-hint"
              disabled={disabled || isSubmitting || frames.length > 0}
              onChange={(event) => void handleContainerFile(event)}
            />
            <label htmlFor="manual-animation-container"><FileArchive size={15} aria-hidden="true" /> GIF·WebP·APNG·PNG ZIP 가져오기</label>
          </>
        ) : null}
        <input ref={replacementInputRef} id="manual-frame-replacement" type="file" accept="image/png,image/jpeg,image/webp" hidden tabIndex={-1} disabled={disabled || isSubmitting} onChange={replaceFrame} />
        <span>{frames.length}/{maxFrames}장</span>
        {draftKey ? <DraftStatus role="status" aria-live="polite" $failed={draftStatus === 'failed'}>{draftStatus === 'loading' ? '임시 저장본 확인 중…' : draftStatus === 'saving' ? '자동 저장 중…' : draftStatus === 'failed' ? '자동 저장 실패' : '자동 저장됨'}</DraftStatus> : null}
        <button type="button" disabled={!pastFrames.length || disabled || isSubmitting} onClick={undoFrames} aria-label="프레임 편집 실행 취소"><Undo2 size={14} aria-hidden="true" /> 실행 취소</button>
        <button type="button" disabled={!futureFrames.length || disabled || isSubmitting} onClick={redoFrames} aria-label="프레임 편집 다시 실행"><Redo2 size={14} aria-hidden="true" /> 다시 실행</button>
        {frames.length ? (
          <ClearButton type="button" disabled={disabled || isSubmitting} onClick={() => clearFrames()}>
            <RotateCcw size={14} aria-hidden="true" /> 전체 초기화
          </ClearButton>
        ) : null}
      </UploadRow>

      {spriteSheet ? (
        <SpriteSheetEditor aria-labelledby="sprite-sheet-editor-title">
          <div>
            <strong id="sprite-sheet-editor-title">시트 분할 확인</strong>
            <span>자동 감지 {spriteSheet.detectedColumns}열 × {spriteSheet.detectedRows}행 · {spriteSheet.width}×{spriteSheet.height}px</span>
          </div>
          <SpriteSheetPreview>
            <img src={spriteSheet.previewUrl} alt="분할할 원본 스프라이트 시트" />
            <SpriteGrid aria-hidden="true" $columns={spriteSheet.columns} $rows={spriteSheet.rows} />
          </SpriteSheetPreview>
          <SpritePresetRow aria-label="자주 쓰는 시트 배열">
            <button type="button" onClick={() => setSpriteSheet((current) => current ? { ...current, columns: 4, rows: 2 } : current)}>8컷 · 4×2</button>
            <button type="button" onClick={() => setSpriteSheet((current) => current ? { ...current, columns: 4, rows: 3 } : current)}>12컷 · 4×3</button>
            <button type="button" onClick={() => setSpriteSheet((current) => current ? { ...current, columns: 6, rows: 4 } : current)}>24컷 · 6×4</button>
          </SpritePresetRow>
          <SpriteControls>
            <label>가로 칸 수<select value={spriteSheet.columns} onChange={(event) => setSpriteSheet((current) => current ? { ...current, columns: Number(event.target.value) } : current)}>
              {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}열</option>)}
            </select></label>
            <label>세로 칸 수<select value={spriteSheet.rows} onChange={(event) => setSpriteSheet((current) => current ? { ...current, rows: Number(event.target.value) } : current)}>
              {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}행</option>)}
            </select></label>
            <output aria-live="polite">총 {spriteSheet.columns * spriteSheet.rows}장</output>
          </SpriteControls>
          <SpriteBackgroundControls>
            <label><input type="checkbox" checked={spriteSheet.removeBackground} onChange={(event) => setSpriteSheet((current) => current ? { ...current, removeBackground: event.target.checked } : current)} /> 모서리 배경색을 투명하게 제거</label>
            {spriteSheet.removeBackground ? <label>제거 범위 <input type="range" min={20} max={160} step={4} value={spriteSheet.tolerance} onChange={(event) => setSpriteSheet((current) => current ? { ...current, tolerance: Number(event.target.value) } : current)} /><output>{spriteSheet.tolerance}</output></label> : null}
          </SpriteBackgroundControls>
          <ImportHint>빨간 선이 각 프레임 경계입니다. 말풍선과 효과선도 해당 칸 안에 함께 보존됩니다. 분할 순서는 왼쪽→오른쪽, 위→아래입니다.</ImportHint>
          <SpriteActions>
            <button type="button" disabled={isSplittingSprite} onClick={() => setSpriteSheet(null)}>취소</button>
            <button type="button" disabled={isSplittingSprite || spriteSheet.columns * spriteSheet.rows < 2 || spriteSheet.columns * spriteSheet.rows > Math.min(24, maxFrames - frames.length)} onClick={() => void applySpriteSheet()}>
              {isSplittingSprite ? '분할 중…' : `${spriteSheet.columns * spriteSheet.rows}장으로 분할해 타임라인에 추가`}
            </button>
          </SpriteActions>
        </SpriteSheetEditor>
      ) : null}

      {projectType === 'animated' ? (
        <ImportHint id="manual-animation-import-hint">
          움짤은 프레임을 그대로 추출합니다. 한 장짜리 스프라이트 시트 PNG는 왼쪽→오른쪽, 위→아래 순서로 2~24칸을 자동 분할합니다.
        </ImportHint>
      ) : null}

      {frames.length ? (
        <>
          <OrderHint id="manual-frame-order-hint">
            순서 번호나 빈 영역을 끌어 재정렬하세요. 키보드·모바일에서는 위·아래 이동 버튼을 사용할 수 있어요.
          </OrderHint>
          <OrderStatus id="manual-frame-order-status" role="status" aria-live="polite">{orderAnnouncement}</OrderStatus>
          {selectedFrameIds.length ? (
            <BulkActions role="toolbar" aria-label="선택한 프레임 작업">
              <strong>{selectedFrameIds.length}개 선택</strong>
              <button type="button" disabled={disabled || isSubmitting || frames.length >= maxFrames} onClick={duplicateSelectedFrames}><Copy size={14} /> 선택 복제</button>
              <button type="button" disabled={disabled || isSubmitting} onClick={removeSelectedFrames}><Trash2 size={14} /> 선택 삭제</button>
              <button type="button" onClick={() => setSelectedFrameIds([])}>선택 해제</button>
            </BulkActions>
          ) : null}
          <FrameList
            aria-label="수동 프레임 순서"
            aria-describedby="manual-frame-order-hint manual-frame-order-status"
          >
            {frames.map((frame, index) => (
              <FrameRow
                key={frame.id}
                draggable={!disabled && !isSubmitting && frames.length > 1}
                $dragging={draggedFrameId === frame.id}
                $dropTarget={dropTargetFrameId === frame.id}
                onDragStart={(event) => handleFrameDragStart(event, frame.id)}
                onDragOver={(event) => handleFrameDragOver(event, frame.id)}
                onDrop={(event) => handleFrameDrop(event, frame.id)}
                onDragEnd={handleFrameDragEnd}
              >
                <SelectionOrder title="선택하거나 끌어서 순서 변경">
                  <input type="checkbox" checked={selectedFrameIds.includes(frame.id)} onChange={() => toggleFrameSelection(frame.id)} aria-label={`${index + 1}번째 프레임 선택`} />
                  <GripVertical size={12} aria-hidden="true" />
                  <b>{index + 1}</b>
                </SelectionOrder>
                <FrameThumbnailButton
                  type="button"
                  onClick={() => setPreviewFrameId(frame.id)}
                  aria-label={`${index + 1}번째 프레임 크게 보기`}
                >
                  <img
                    src={frame.previewUrl}
                    width={52}
                    height={52}
                    alt={`${index + 1}번째 프레임 미리보기`}
                    draggable={false}
                  />
                  <ZoomIn size={13} aria-hidden="true" />
                </FrameThumbnailButton>
                <FrameMeta>
                  <strong title={frame.displayName}>{frame.displayName}</strong>
                  <span>{frame.displaySize}</span>
                </FrameMeta>
                {projectType === 'animated' && timingMode === 'per_frame' ? (
                  <DurationLabel>
                    <span>표시 시간</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={40}
                      max={2000}
                      step={10}
                      value={frame.durationMs}
                      disabled={disabled || isSubmitting}
                      onChange={(event) => updateFrameDuration(index, Number(event.target.value))}
                      aria-label={`${index + 1}번째 프레임 표시 시간(밀리초)`}
                    />
                    <small>ms</small>
                  </DurationLabel>
                ) : null}
                <FrameActions>
                  <button
                    type="button"
                    disabled={disabled || isSubmitting || frame.kind === 'container'}
                    onClick={() => chooseReplacement(frame.id)}
                    aria-label={`${index + 1}번째 프레임 교체`}
                  ><Replace size={15} aria-hidden="true" /></button>
                  <button
                    type="button"
                    disabled={disabled || isSubmitting || frames.length >= maxFrames || frame.kind === 'container'}
                    onClick={() => duplicateFrame(index)}
                    aria-label={`${index + 1}번째 프레임 복제`}
                  ><Copy size={15} aria-hidden="true" /></button>
                  <button
                    type="button"
                    disabled={disabled || isSubmitting || index === 0}
                    onClick={() => moveFrame(index, -1)}
                    aria-label={`${index + 1}번째 프레임을 앞으로 이동`}
                  ><ArrowUp size={15} aria-hidden="true" /></button>
                  <button
                    type="button"
                    disabled={disabled || isSubmitting || index === frames.length - 1}
                    onClick={() => moveFrame(index, 1)}
                    aria-label={`${index + 1}번째 프레임을 뒤로 이동`}
                  ><ArrowDown size={15} aria-hidden="true" /></button>
                  <button
                    type="button"
                    disabled={disabled || isSubmitting}
                    onClick={() => removeFrame(index)}
                    aria-label={`${index + 1}번째 프레임 삭제`}
                  ><Trash2 size={15} aria-hidden="true" /></button>
                </FrameActions>
              </FrameRow>
            ))}
          </FrameList>
        </>
      ) : (
        <EmptyState>PNG·JPG·WebP 프레임을 추가하거나 GIF·움직이는 WebP·APNG·PNG ZIP을 가져오면 이곳에서 순서와 속도를 정할 수 있어요.</EmptyState>
      )}

      {projectType === 'animated' ? (
        <TimingSection>
          <SectionLabel>재생 속도</SectionLabel>
          <TimingTabs aria-label="재생 속도 설정 방식">
            <button type="button" disabled={disabled || isSubmitting} aria-pressed={timingMode === 'fps'} onClick={() => setTimingMode('fps')}>같은 속도</button>
            <button type="button" disabled={disabled || isSubmitting || hasContainer} aria-pressed={timingMode === 'per_frame'} onClick={() => setTimingMode('per_frame')}>장면별 시간</button>
          </TimingTabs>
          {timingMode === 'fps' ? (
            <FpsControl>
              <label htmlFor="manual-frame-fps">FPS</label>
              <input
                id="manual-frame-fps"
                name="manualFrameFps"
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                value={fps}
                disabled={disabled || isSubmitting}
                onChange={(event) => setFps(Math.min(30, Math.max(1, Math.round(Number(event.target.value) || 1))))}
              />
              <span>{hasContainer ? '프레임 추출 후 계산' : frames.length ? `약 ${(totalDurationMs / 1000).toFixed(2)}초` : '이미지를 먼저 넣어 주세요'}</span>
            </FpsControl>
          ) : (
            <TimingHint>각 프레임의 표시 시간을 40~2,000ms로 정할 수 있어요. 현재 총 {(totalDurationMs / 1000).toFixed(2)}초예요.</TimingHint>
          )}
        </TimingSection>
      ) : null}

      <FormatSection>
        <SectionLabel>출력 파일</SectionLabel>
        <FormatGrid>
          {allowedFormats.map((format) => (
            <label key={format}>
              <input
                type="checkbox"
                checked={selectedFormats.includes(format)}
                disabled={disabled || isSubmitting}
                onChange={() => toggleFormat(format)}
              />
              <span>{FORMAT_LABELS[format]}</span>
            </label>
          ))}
        </FormatGrid>
      </FormatSection>

      <PipelineNote>
        서버가 파일 형식과 소유권을 다시 확인합니다. 움짤은 프레임별로 정규화하고, 스프라이트 시트는 연결된 단색·초록 배경만 제거해 넓은 동작을 보존합니다.
        {hasBubble ? ' 이 항목의 말풍선과 프레임 타임라인도 적용합니다.' : ' 말풍선은 현재 꺼져 있습니다.'}
        {hasImageEdit ? ' 저장된 자르기·위치 편집값도 함께 적용합니다.' : ''}
        <strong>AI 일관성·동작 검증으로 표시되지 않으며 기술 규격만 검사합니다.</strong>
      </PipelineNote>

      {error ? <ErrorMessage role="alert">{error}</ErrorMessage> : null}
      <SubmitButton type="button" disabled={!canSubmit} onClick={() => void submit()}>
        {isSubmitting ? <Spinner aria-hidden="true" /> : <Images size={16} aria-hidden="true" />}
        {isSubmitting
          ? '정지 컷을 복사하고 합치는 중…'
          : projectType === 'animated'
            ? hasContainer ? '움짤·스프라이트 시트를 프레임으로 가져오기' : `정지 컷 ${frames.length}장으로 움직이는 파일 만들기`
            : 'AI 비용 없이 정지 파일 만들기'}
      </SubmitButton>
      {previewFrame ? (
        <AccessibleImagePreviewDialog
          src={previewFrame.previewUrl}
          title={`${frames.findIndex((frame) => frame.id === previewFrame.id) + 1}번째 프레임`}
          alt={`${previewFrame.displayName} 원본 프레임 크게 보기`}
          detail={`${previewFrame.displayName} · ${previewFrame.displaySize}`}
          onClose={() => setPreviewFrameId(null)}
        />
      ) : null}
    </Panel>
  );
}

const Panel = styled.section`
  --background: #171b23;
  --foreground: #eef0f7;
  --muted-foreground: #9099aa;
  --border: rgba(255, 255, 255, .1);
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 18px;
  border-top: 1px solid var(--border, #e2e8f0);
  color: var(--foreground);

  @media (max-width: 520px) { padding: 14px 12px; }
`;

const PanelHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: var(--foreground, #172033);

  > div { display: grid; gap: 3px; min-width: 0; }
  strong { font-size: 14px; }
  span { color: var(--muted-foreground, #667085); font-size: 12px; line-height: 1.45; }
`;

const Eyebrow = styled.small`
  color: #59d3b8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .04em;
`;

const ReusableFrameSection = styled.section`
  display: grid;
  gap: 8px;
  padding: 11px;
  border: 1px solid rgba(124, 92, 255, .22);
  border-radius: 11px;
  background: rgba(124, 92, 255, .055);
`;

const ReusableFrameHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;

  > div { min-width: 0; }
  strong, span { display: block; }
  strong { color: #eeeaff; font-size: 11px; }
  span { margin-top: 3px; color: #9992b8; font-size: 10px; line-height: 1.45; }
  > small { flex: 0 0 auto; color: #a99aff; font-size: 10px; font-weight: 800; }
`;

const ReusableFrameGrid = styled.ul`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  max-height: 238px;
  margin: 0;
  padding: 0 2px 0 0;
  overflow: auto;
  list-style: none;

  @media (max-width: 1180px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 520px) { grid-template-columns: 1fr; max-height: 290px; }
`;

const ReusableFrameItem = styled.li`
  min-width: 0;
`;

const ReusableFrameButton = styled.button`
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 60px;
  align-items: center;
  gap: 7px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 9px;
  color: var(--foreground);
  background: rgba(255, 255, 255, .025);
  text-align: left;
  cursor: pointer;
  width: 100%;

  img { width: 48px; height: 48px; object-fit: contain; border-radius: 7px; background: repeating-conic-gradient(#303642 0 25%, #222731 0 50%) 50% / 10px 10px; }
  > span { min-width: 0; }
  strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { font-size: 10px; }
  small { margin-top: 3px; color: var(--muted-foreground); font-size: 9px; }
  > svg { color: #a99aff; }
  &:hover:not(:disabled) { border-color: rgba(124, 92, 255, .55); background: rgba(124, 92, 255, .11); }
  &[aria-pressed='true'] { border-color: rgba(89, 211, 184, .42); background: rgba(89, 211, 184, .08); }
  &[aria-pressed='true'] > svg { color: #59d3b8; }
  &:disabled { cursor: not-allowed; opacity: .58; }
  &:focus-visible { outline: 2px solid #a99aff; outline-offset: 2px; }
`;

const ReusableFrameEmpty = styled.p`
  margin: 0;
  padding: 9px;
  border: 1px dashed rgba(255, 255, 255, .1);
  border-radius: 8px;
  color: var(--muted-foreground);
  font-size: 10px;
  line-height: 1.5;
`;

const UploadRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  > input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  > label, > button {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border, #d7dee8);
    border-radius: 9px;
    padding: 0 11px;
    background: var(--background, #fff);
    color: var(--foreground, #172033);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  > input:focus-visible + label { outline: 3px solid rgba(37, 99, 235, .22); outline-offset: 2px; }
  > input:disabled + label { opacity: .5; cursor: not-allowed; }
  > span { color: var(--muted-foreground, #667085); font-size: 12px; }
`;

const SpriteSheetEditor = styled.section`
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(124, 92, 255, .45);
  border-radius: 12px;
  background: rgba(124, 92, 255, .07);
  > div:first-child { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  > div:first-child strong { font-size: 12px; }
  > div:first-child span { color: var(--muted-foreground); font-size: 9px; }
`;

const SpriteSheetPreview = styled.div`
  position: relative;
  width: 100%;
  max-height: 360px;
  overflow: hidden;
  border-radius: 10px;
  background: repeating-conic-gradient(#303642 0 25%, #222731 0 50%) 50% / 14px 14px;
  img { display: block; width: 100%; max-height: 360px; object-fit: contain; }
`;

const SpriteGrid = styled.div<{ $columns: number; $rows: number }>`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, rgba(255, 56, 92, .9) 2px, transparent 2px),
    linear-gradient(to bottom, rgba(255, 56, 92, .9) 2px, transparent 2px);
  background-size: ${({ $columns }) => `calc(100% / ${$columns}) 100%`}, ${({ $rows }) => `100% calc(100% / ${$rows})`};
  box-shadow: inset 0 0 0 2px rgba(255, 56, 92, .9);
`;

const SpritePresetRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  button { min-height: 40px; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: rgba(255,255,255,.05); color: var(--foreground); font: inherit; font-size: 10px; cursor: pointer; }
  button:hover, button:focus-visible { border-color: #a99aff; outline: 2px solid rgba(169,154,255,.2); }
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

const SpriteControls = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: end;
  gap: 8px;
  label { display: grid; gap: 4px; color: var(--muted-foreground); font-size: 9px; }
  select { min-height: 40px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); color: var(--foreground); padding: 6px 8px; }
  > output { min-width: 64px; padding-bottom: 10px; color: #a99aff; font-size: 11px; font-weight: 800; text-align: right; }
  @media (max-width: 520px) { grid-template-columns: 1fr 1fr; > output { grid-column: 1 / -1; text-align: left; padding: 0; } }
`;

const SpriteBackgroundControls = styled.div`
  display: grid;
  gap: 8px;
  label { display: flex; min-height: 40px; align-items: center; gap: 8px; color: var(--foreground); font-size: 10px; }
  input[type='checkbox'] { width: 18px; height: 18px; accent-color: #7c5cff; }
  input[type='range'] { flex: 1; min-width: 80px; accent-color: #7c5cff; }
  output { min-width: 28px; color: var(--muted-foreground); }
`;

const SpriteActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  button { min-height: 44px; border: 1px solid var(--border); border-radius: 9px; padding: 0 12px; background: var(--background); color: var(--foreground); font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
  button:last-child { border-color: #7c5cff; background: #7c5cff; color: #fff; }
  button:disabled { cursor: not-allowed; opacity: .5; }
  @media (max-width: 520px) { display: grid; grid-template-columns: 1fr; button { width: 100%; } }
`;

const ImportHint = styled.p`
  margin: -3px 0 0;
  color: var(--muted-foreground, #667085);
  font-size: 10px;
  line-height: 1.55;
`;

const ClearButton = styled.button`
  margin-left: auto;
  &:focus-visible { outline: 3px solid rgba(37, 99, 235, .22); outline-offset: 2px; }
`;

const DraftStatus = styled.small<{ $failed: boolean }>`
  color: ${({ $failed }) => $failed ? '#fda29b' : '#75e0c4'};
  font-size: 10px;
  font-weight: 750;
`;

const FrameList = styled.ol`
  display: grid;
  gap: 6px;
  max-height: 420px;
  margin: 0;
  padding: 0 2px 0 0;
  overflow: auto;
  list-style: none;
`;

const OrderHint = styled.p`
  margin: 0;
  color: var(--muted-foreground, #667085);
  font-size: 10px;
  line-height: 1.5;
`;

const OrderStatus = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
`;

const BulkActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(124, 92, 255, .28);
  border-radius: 10px;
  background: rgba(124, 92, 255, .08);

  strong { margin-right: auto; color: #eeeaff; font-size: 11px; }
  button { display: inline-flex; min-height: 40px; align-items: center; gap: 5px; padding: 0 9px; border: 1px solid rgba(255, 255, 255, .12); border-radius: 8px; background: rgba(255, 255, 255, .04); color: #d9dced; font: inherit; font-size: 10px; font-weight: 750; cursor: pointer; }
  button:disabled { opacity: .4; cursor: not-allowed; }
  button:focus-visible { outline: 3px solid rgba(124, 92, 255, .3); outline-offset: 2px; }
`;

const FrameRow = styled.li<{ $dragging: boolean; $dropTarget: boolean }>`
  display: grid;
  grid-template-columns: 62px 52px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 7px;
  border: 1px solid ${({ $dropTarget }) => $dropTarget ? '#7c5cff' : 'var(--border, #e2e8f0)'};
  border-radius: 10px;
  background: color-mix(in srgb, var(--background, #171b23) 94%, #2a3040);
  box-shadow: ${({ $dropTarget }) => $dropTarget ? '0 0 0 2px rgba(124, 92, 255, .16)' : 'none'};
  opacity: ${({ $dragging }) => $dragging ? .55 : 1};
  cursor: grab;
  transition: border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
  user-select: ${({ $dragging }) => $dragging ? 'none' : 'auto'};

  &:active { cursor: grabbing; }

  @media (max-width: 520px) {
    grid-template-columns: 58px 48px minmax(0, 1fr) auto;
  }

  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const SelectionOrder = styled.label`
  display: inline-flex;
  width: 60px;
  height: 28px;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border-radius: 7px;
  background: #303747;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  cursor: grab;
  input { width: 16px; height: 16px; margin: 0 2px 0 0; accent-color: #7c5cff; cursor: pointer; }
  input:focus-visible { outline: 3px solid rgba(124, 92, 255, .35); outline-offset: 2px; }
  b { min-width: 12px; font: inherit; text-align: center; }
`;

const FrameThumbnailButton = styled.button`
  position: relative;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: repeating-conic-gradient(#edf1f5 0 25%, #fff 0 50%) 50% / 12px 12px;
  cursor: zoom-in;

  img { width: 100%; height: 100%; object-fit: contain; }
  svg { position: absolute; right: 3px; bottom: 3px; padding: 2px; border-radius: 4px; color: #fff; background: rgba(15, 23, 42, .72); box-sizing: content-box; }
  &:hover { box-shadow: 0 0 0 2px rgba(124, 92, 255, .45); }
  &:focus-visible { outline: 3px solid rgba(37, 99, 235, .35); outline-offset: 2px; }

  @media (max-width: 520px) { width: 48px; height: 48px; }
`;

const FrameMeta = styled.div`
  display: grid;
  min-width: 0;
  gap: 2px;
  strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  span { color: var(--muted-foreground, #667085); font-size: 10px; }
`;

const DurationLabel = styled.label`
  display: grid;
  grid-template-columns: auto 66px auto;
  align-items: center;
  gap: 4px;
  color: var(--muted-foreground, #667085);
  font-size: 10px;
  input { width: 66px; min-height: 36px; border: 1px solid var(--border, #d7dee8); border-radius: 8px; padding: 0 7px; color: var(--foreground); background: rgba(0, 0, 0, .18); }
  @media (max-width: 520px) { grid-column: 2 / -1; justify-self: start; }
`;

const FrameActions = styled.div`
  display: flex;
  gap: 3px;
  button {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--muted-foreground, #667085);
  }
  button:hover:not(:disabled) { background: rgba(255, 255, 255, .08); color: #eef0f7; }
  button:focus-visible { outline: 3px solid rgba(37, 99, 235, .22); outline-offset: 1px; }
  button:disabled { opacity: .3; }
  @media (max-width: 520px) { grid-column: 2 / -1; justify-self: end; }
`;

const EmptyState = styled.div`
  display: grid;
  min-height: 74px;
  place-items: center;
  border: 1px dashed var(--border, #d7dee8);
  border-radius: 10px;
  color: var(--muted-foreground, #667085);
  font-size: 11px;
  text-align: center;
`;

const TimingSection = styled.div`
  display: grid;
  gap: 8px;
`;

const SectionLabel = styled.strong`
  color: var(--foreground, #172033);
  font-size: 11px;
`;

const TimingTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 3px;
  border-radius: 9px;
  background: rgba(255, 255, 255, .055);
  button {
    min-height: 44px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #9da4b3;
    font-size: 11px;
    font-weight: 700;
  }
  button[aria-pressed='true'] { background: rgba(124, 92, 255, .22); color: #f4f1ff; box-shadow: inset 0 0 0 1px rgba(124, 92, 255, .32); }
  button:focus-visible { outline: 3px solid rgba(37, 99, 235, .22); outline-offset: 1px; }
`;

const FpsControl = styled.div`
  display: grid;
  grid-template-columns: auto 78px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  label { font-size: 11px; font-weight: 700; }
  input { min-height: 40px; border: 1px solid var(--border, #d7dee8); border-radius: 8px; padding: 0 9px; color: var(--foreground); background: rgba(0, 0, 0, .18); }
  span { color: var(--muted-foreground, #667085); font-size: 11px; }
`;

const TimingHint = styled.p`
  margin: 0;
  color: var(--muted-foreground, #667085);
  font-size: 11px;
  line-height: 1.5;
`;

const FormatSection = styled.div`
  display: grid;
  gap: 7px;
`;

const FormatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  label {
    display: flex;
    min-height: 40px;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--border, #d7dee8);
    border-radius: 8px;
    padding: 0 9px;
    font-size: 11px;
    color: var(--foreground);
    background: rgba(255, 255, 255, .025);
    cursor: pointer;
  }
  input { width: 16px; height: 16px; accent-color: #087f5b; }
  input:focus-visible { outline: 3px solid rgba(37, 99, 235, .22); outline-offset: 2px; }
`;

const PipelineNote = styled.p`
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 10px;
  border-radius: 9px;
  border: 1px solid rgba(89, 211, 184, .16);
  background: rgba(89, 211, 184, .055);
  color: #9acdc1;
  font-size: 10px;
  line-height: 1.5;
  strong { color: #70dfc5; }
`;

const ErrorMessage = styled.p`
  margin: 0;
  color: #b42318;
  font-size: 11px;
  line-height: 1.45;
`;

const SubmitButton = styled.button`
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 10px;
  background: #087f5b;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  &:hover:not(:disabled) { background: #06684a; }
  &:disabled { opacity: .45; cursor: not-allowed; }
  &:focus-visible { outline: 3px solid rgba(8, 127, 91, .25); outline-offset: 2px; }
`;

const Spinner = styled.span`
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, .4);
  border-top-color: #fff;
  border-radius: 999px;
  animation: manual-frame-spin .8s linear infinite;
  @keyframes manual-frame-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
