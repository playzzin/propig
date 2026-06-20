'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Download, Eraser, Palette, Pencil, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';

const DOODLE_COLORS = ['#111827', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'] as const;
const DEFAULT_COLOR = DOODLE_COLORS[0];
const DEFAULT_WIDTH = 5;

const DoodlePointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1),
});

const DoodleStrokeSchema = z.object({
  id: z.string().min(1),
  color: z.string().min(1),
  width: z.number().min(1).max(48),
  tool: z.enum(['pen', 'eraser']),
  points: z.array(DoodlePointSchema).min(1),
});

const DoodleStorageSchema = z
  .object({
    version: z.literal(1),
    strokes: z.array(DoodleStrokeSchema),
  })
  .strict();

type DoodlePoint = z.infer<typeof DoodlePointSchema>;
type DoodleStroke = z.infer<typeof DoodleStrokeSchema>;
type DoodleTool = DoodleStroke['tool'];
type CanvasSize = { width: number; height: number; dpr: number };

const createStrokeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
};

const getStorageKey = (uid: string | null | undefined) => `propig:doodle-pad:${uid ?? 'guest'}:v1`;

const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): DoodlePoint => {
  const rect = event.currentTarget.getBoundingClientRect();
  const pressure = event.pressure > 0 ? event.pressure : 0.55;

  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    pressure: Math.min(1, Math.max(0.15, pressure)),
  };
};

const pointToCanvas = (point: DoodlePoint, size: CanvasSize) => ({
  x: point.x * size.width,
  y: point.y * size.height,
});

const drawStroke = (ctx: CanvasRenderingContext2D, stroke: DoodleStroke, size: CanvasSize) => {
  if (stroke.points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    const canvasPoint = pointToCanvas(point, size);
    const radius = Math.max(1, (stroke.width * point.pressure) / 2);
    ctx.beginPath();
    ctx.arc(canvasPoint.x, canvasPoint.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const prev = stroke.points[index - 1];
    const current = stroke.points[index];
    const from = pointToCanvas(prev, size);
    const to = pointToCanvas(current, size);
    const pressureWidth = stroke.width * (0.55 + current.pressure * 0.65);

    ctx.lineWidth = stroke.tool === 'eraser' ? pressureWidth * 1.4 : pressureWidth;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  ctx.restore();
};

const redrawCanvas = (
  canvas: HTMLCanvasElement | null,
  strokes: DoodleStroke[],
  activeStroke: DoodleStroke | null,
  size: CanvasSize | null,
) => {
  if (!canvas || !size) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, size.width, size.height);
  strokes.forEach((stroke) => drawStroke(ctx, stroke, size));
  if (activeStroke) drawStroke(ctx, activeStroke, size);
};

export default function DoodlePad() {
  const { currentUser } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DoodleStroke | null>(null);
  const canvasSizeRef = useRef<CanvasSize | null>(null);
  const rafRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const loadedStorageKeyRef = useRef<string | null>(null);

  const storageKey = useMemo(() => getStorageKey(currentUser?.uid), [currentUser?.uid]);

  const [strokes, setStrokes] = useState<DoodleStroke[]>([]);
  const [tool, setTool] = useState<DoodleTool>('pen');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  const scheduleRedraw = useCallback((nextActiveStroke: DoodleStroke | null = activeStrokeRef.current) => {
    if (typeof window === 'undefined') return;
    if (rafRef.current !== null) return;

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      redrawCanvas(canvasRef.current, strokes, nextActiveStroke, canvasSizeRef.current);
    });
  }, [strokes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const raw = window.localStorage.getItem(storageKey);
    loadedStorageKeyRef.current = storageKey;

    if (!raw) {
      setStrokes([]);
      return;
    }

    try {
      const parsed = DoodleStorageSchema.safeParse(JSON.parse(raw));
      setStrokes(parsed.success ? parsed.data.strokes : []);
    } catch {
      setStrokes([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loadedStorageKeyRef.current !== storageKey) return;

    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, strokes }));
      } catch {
        toast.error('낙서장 저장 공간이 부족합니다.', { duration: 2400 });
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [storageKey, strokes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const widthPx = Math.max(1, Math.round(rect.width));
      const heightPx = Math.max(1, Math.round(rect.height));
      const nextSize = { width: widthPx, height: heightPx, dpr };

      canvas.width = Math.round(widthPx * dpr);
      canvas.height = Math.round(heightPx * dpr);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      canvasSizeRef.current = nextSize;
      redrawCanvas(canvas, strokes, activeStrokeRef.current, nextSize);
    };

    syncCanvasSize();
    const observer = new ResizeObserver(syncCanvasSize);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [strokes]);

  useEffect(() => {
    redrawCanvas(canvasRef.current, strokes, activeStrokeRef.current, canvasSizeRef.current);
  }, [strokes]);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const finishStroke = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    const finishedStroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!finishedStroke || finishedStroke.points.length === 0) return;

    setStrokes((current) => [...current, finishedStroke]);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;

    const point = getCanvasPoint(event);
    activeStrokeRef.current = {
      id: createStrokeId(),
      color,
      width,
      tool,
      points: [point],
    };

    scheduleRedraw(activeStrokeRef.current);
  }, [color, scheduleRedraw, tool, width]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current || activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    activeStrokeRef.current.points.push(getCanvasPoint(event));
    scheduleRedraw(activeStrokeRef.current);
  }, [scheduleRedraw]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    finishStroke(event);
  }, [finishStroke]);

  const undoStroke = useCallback(() => {
    setStrokes((current) => current.slice(0, -1));
  }, []);

  const clearCanvas = useCallback(async () => {
    if (strokes.length === 0) return;

    const result = await Swal.fire({
      title: '낙서장을 비울까요?',
      text: '지운 선은 다시 복구할 수 없습니다.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '비우기',
      cancelButtonText: '취소',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#475569',
      background: '#111827',
      color: '#f8fafc',
    });

    if (!result.isConfirmed) return;
    setStrokes([]);
  }, [strokes.length]);

  const downloadCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const size = canvasSizeRef.current;
    if (!canvas || !size) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.href = exportCanvas.toDataURL('image/png');
    link.download = `propig-doodle-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  }, []);

  return (
    <DoodleWorkspace>
      <DoodleToolbar>
        <ToolGroup aria-label="낙서 도구">
          <IconToggleButton
            type="button"
            $active={tool === 'pen'}
            onClick={() => setTool('pen')}
            aria-pressed={tool === 'pen'}
            title="펜"
          >
            <Pencil size={17} strokeWidth={2.3} />
          </IconToggleButton>
          <IconToggleButton
            type="button"
            $active={tool === 'eraser'}
            onClick={() => setTool('eraser')}
            aria-pressed={tool === 'eraser'}
            title="지우개"
          >
            <Eraser size={17} strokeWidth={2.3} />
          </IconToggleButton>
        </ToolGroup>

        <ColorGroup aria-label="펜 색상">
          <Palette size={16} strokeWidth={2.2} aria-hidden="true" />
          {DOODLE_COLORS.map((item) => (
            <ColorSwatch
              key={item}
              type="button"
              $color={item}
              $active={tool === 'pen' && color === item}
              onClick={() => {
                setColor(item);
                setTool('pen');
              }}
              aria-label={`${item} 색상`}
              title="색상"
            />
          ))}
        </ColorGroup>

        <WidthControl aria-label="펜 굵기">
          <span>{width}</span>
          <input
            type="range"
            min="2"
            max="24"
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
        </WidthControl>

        <ToolbarSpacer />

        <IconButton type="button" onClick={undoStroke} disabled={strokes.length === 0} title="실행 취소">
          <Undo2 size={17} strokeWidth={2.25} />
        </IconButton>
        <IconButton type="button" onClick={downloadCanvas} disabled={strokes.length === 0} title="이미지 저장">
          <Download size={17} strokeWidth={2.25} />
        </IconButton>
        <DangerButton type="button" onClick={clearCanvas} disabled={strokes.length === 0} title="비우기">
          <Trash2 size={17} strokeWidth={2.25} />
        </DangerButton>
      </DoodleToolbar>

      <CanvasFrame>
        <DoodleCanvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          $eraser={tool === 'eraser'}
          aria-label="낙서장"
        />
      </CanvasFrame>
    </DoodleWorkspace>
  );
}

const DoodleWorkspace = styled.section`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018)),
    var(--bg-card);

  body[data-propig-design='codeit'] & {
    background: rgba(255, 255, 255, 0.94);
    border-color: var(--codeit-border);
    border-radius: 8px;
    box-shadow: 0 22px 54px rgba(30, 41, 59, 0.08);
    animation: doodleWorkspaceIn 0.58s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes doodleWorkspaceIn {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const DoodleToolbar = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 66px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(0, 0, 0, 0.1);
  overflow-x: auto;
  scrollbar-width: none;

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface-soft);
    border-bottom-color: var(--codeit-border);
  }

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: 760px) {
    min-height: 58px;
    padding: 9px 8px;
    gap: 8px;
  }
`;

const ToolGroup = styled.div`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
`;

const ColorGroup = styled.div`
  flex: 0 0 auto;
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-dim);
`;

const WidthControl = styled.label`
  flex: 0 0 auto;
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 0 11px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 850;

  input {
    width: 108px;
    accent-color: var(--primary-light);
    cursor: pointer;
  }

  @media (max-width: 760px) {
    input {
      width: 86px;
    }
  }
`;

const ToolbarSpacer = styled.div`
  flex: 1 0 12px;

  @media (max-width: 1040px) {
    display: none;
  }
`;

const IconButton = styled.button`
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;

  &:hover:not(:disabled) {
    color: var(--text-main);
    border-color: var(--border-medium);
    background: rgba(255, 255, 255, 0.065);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const IconToggleButton = styled(IconButton)<{ $active?: boolean }>`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border-color: ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.42)' : 'transparent')};
  background: ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.16)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--primary-light)' : 'var(--text-muted)')};
`;

const DangerButton = styled(IconButton)`
  color: #fca5a5;

  &:hover:not(:disabled) {
    border-color: rgba(239, 68, 68, 0.34);
    background: rgba(239, 68, 68, 0.12);
    color: #fecaca;
  }
`;

const ColorSwatch = styled.button<{ $color: string; $active?: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 2px solid ${({ $active }) => ($active ? 'var(--primary-light)' : 'rgba(0, 0, 0, 0.28)')};
  background: ${({ $color }) => $color};
  padding: 0;
  cursor: pointer;
  box-shadow: ${({ $active }) => ($active ? '0 0 0 3px rgba(16, 185, 129, 0.18)' : 'none')};
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;

  &:hover {
    transform: scale(1.12);
  }
`;

const CanvasFrame = styled.div`
  flex: 1;
  min-height: 0;
  padding: 14px;
  background:
    radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.045) 1px, transparent 0) 0 0 / 28px 28px,
    linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 45%);

  body[data-propig-design='codeit'] & {
    background:
      radial-gradient(circle at 1px 1px, rgba(52, 81, 209, 0.055) 1px, transparent 0) 0 0 / 28px 28px,
      linear-gradient(180deg, rgba(52, 81, 209, 0.035), transparent 42%),
      #ffffff;
  }

  @media (max-width: 760px) {
    padding: 8px;
  }
`;

const DoodleCanvas = styled.canvas<{ $eraser?: boolean }>`
  display: block;
  width: 100%;
  height: 100%;
  min-height: 360px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 14px;
  background:
    linear-gradient(rgba(15, 23, 42, 0.045) 1px, transparent 1px) 0 0 / 32px 32px,
    linear-gradient(90deg, rgba(15, 23, 42, 0.045) 1px, transparent 1px) 0 0 / 32px 32px,
    #f8fafc;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72), 0 18px 44px rgba(0, 0, 0, 0.24);
  cursor: ${({ $eraser }) => ($eraser ? 'cell' : 'crosshair')};
  touch-action: none;
  user-select: none;

  body[data-propig-design='codeit'] & {
    border-color: var(--codeit-border);
    background:
      linear-gradient(rgba(52, 81, 209, 0.035) 1px, transparent 1px) 0 0 / 32px 32px,
      linear-gradient(90deg, rgba(52, 81, 209, 0.035) 1px, transparent 1px) 0 0 / 32px 32px,
      #ffffff;
    box-shadow: inset 0 0 0 1px #ffffff, 0 18px 44px rgba(30, 41, 59, 0.08);
  }

  @media (max-width: 760px) {
    min-height: 420px;
    border-radius: 12px;
  }
`;
